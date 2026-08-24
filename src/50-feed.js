// ---------------------------------------------------------------------------
// The feed: pages the library newest-first and hands out items that still need
// a decision. Items already kept or already marked for deletion are filtered
// out, so a photo is never offered twice.
// ---------------------------------------------------------------------------

const QUEUE_TARGET = 12;   // keep this many decided-free items buffered
const PAGE_SIZE = 200;
const MAX_SCAN_PAGES = 40; // one bounded scan; continuing requires a user retry
const MAX_SCAN_MS = 20000;

const feed = {
  queue: [],
  nextPageId: undefined,   // undefined = not started, null = no more pages
  loading: false,
  exhausted: false,
  error: false,
  ready: false,            // set once the kept/marked lists are in memory
  gen: 0,                  // bumped by reset(); in-flight pages from an older gen are dropped
  info: {},                // mediaKey -> { fileName, size }
  infoFailed: false,
  infoAsked: new Set(),
  seen: new Set(),         // handed out during this session
  requestedPages: new Set(),
  restartTs: null,         // one-shot safe boundary after a library mutation
  lastPageTs: null,

  reset(o) {
    this.gen++;
    this.queue = [];
    this.nextPageId = undefined;
    this.loading = false;
    this.exhausted = false;
    this.error = false;
    this.seen = new Set();
    this.requestedPages = new Set();
    this.restartTs = o && typeof o.timestamp === 'number' ? o.timestamp : null;
    this.lastPageTs = null;
    this.infoFailed = false;
    this.infoAsked = new Set();
  },

  startTimestamp() {
    if (typeof this.restartTs === 'number') return this.restartTs;
    const s = state.settings;
    let dateTs = null;
    if (s.startDate) {
      const d = new Date(s.startDate + 'T23:59:59');
      if (!isNaN(d.getTime())) dateTs = d.getTime();
    }
    const resumeTs = s.resume && state.cursorTs ? state.cursorTs : null;
    // both are upper bounds; the older one is the only safe place to start
    if (dateTs != null && resumeTs != null) return Math.min(dateTs, resumeTs);
    return dateTs != null ? dateTs : resumeTs;
  },

  accept(it) {
    if (!it || !it.mediaKey || !it.dedupKey || !it.thumb) return false;
    if (kept.has(it.mediaKey)) return false;
    if (marked.has(it.mediaKey)) return false;
    if (this.seen.has(it.mediaKey)) return false;
    if (state.settings.skipVideos && it.isVideo) return false;
    if (state.settings.skipFav && it.isFavorite) return false;
    return true;
  },

  async ensure() {
    if (!this.ready || this.loading || this.exhausted || this.error) return;
    if (this.queue.length >= QUEUE_TARGET) return;
    this.loading = true;
    const gen = this.gen;
    app.renderState();
    try {
      let scannedPages = 0;
      const scanStarted = performance.now();
      while (this.queue.length < QUEUE_TARGET && !this.exhausted
        && scannedPages < MAX_SCAN_PAGES && performance.now() - scanStarted < MAX_SCAN_MS) {
        scannedPages++;
        const requestKey = this.nextPageId === undefined ? '__first__' : String(this.nextPageId);
        if (this.requestedPages.has(requestKey)) throw new Error('pagination token repeated: ' + requestKey);
        this.requestedPages.add(requestKey);
        let page;
        try {
          page = await api.listLibrary({
            pageId: this.nextPageId === undefined ? null : this.nextPageId,
            timestamp: this.nextPageId === undefined ? this.startTimestamp() : null,
            pageSize: PAGE_SIZE,
            source: state.settings.source,
          });
        } catch (e) {
          // A token is consumed only by a successful response. Keep transient
          // failures retryable while still detecting genuine repeated tokens.
          this.requestedPages.delete(requestKey);
          throw e;
        }
        if (gen !== this.gen) return;  // a reset happened while we were waiting
        const structurallyUsable = page.items.filter(validMarkedItem);
        if (structurallyUsable.length !== page.rawItemCount) {
          // The page was not consumed: a later Retry must be allowed to fetch
          // the same token after a page reload or compatibility fix.
          this.requestedPages.delete(requestKey);
          throw new Error('library response contains no usable media rows');
        }
        for (const it of page.items) {
          if (this.accept(it)) { this.queue.push(it); this.seen.add(it.mediaKey); }
        }
        if (typeof page.lastItemTimestamp === 'number') this.lastPageTs = page.lastItemTimestamp;
        else if (page.items.length && typeof page.items[page.items.length - 1].ts === 'number') this.lastPageTs = page.items[page.items.length - 1].ts;
        this.nextPageId = page.nextPageId;
        // Google can return an empty intermediate page with a continuation
        // token.  Only the absence of that token proves the source is done.
        if (!page.nextPageId) this.exhausted = true;
      }
      // `finally -> onFeedChanged -> swipe.render -> feed.take()` used to call
      // ensure() again immediately here, defeating the 40-page guard. Pause in
      // a recoverable state instead; Retry continues from the retained token.
      if (!this.exhausted && (scannedPages >= MAX_SCAN_PAGES || performance.now() - scanStarted >= MAX_SCAN_MS)) {
        this.error = 'scan-paused';
      }
      this.loadInfo();
    } catch (e) {
      if (gen !== this.gen) return;
      console.error('[gpSwipe] could not load the library', e);
      this.error = true;
    } finally {
      if (gen === this.gen) {
        this.loading = false;
        app.onFeedChanged();
      }
    }
  },

  // file name + size for the cards and for the "space freed" counter
  async loadInfo() {
    if (this.infoFailed) return;
    const want = [];
    for (const it of this.queue.slice(0, 40)) {
      if (!this.info[it.mediaKey] && !this.infoAsked.has(it.mediaKey)) want.push(it.mediaKey);
    }
    if (!want.length) return;
    want.forEach((k) => this.infoAsked.add(k));
    try {
      Object.assign(this.info, await api.bulkInfo(want));
      app.onInfoLoaded();
    } catch (e) {
      console.warn('[gpSwipe] bulk info unavailable:', e.message);
      this.infoFailed = true;
    }
  },

  take() {
    const it = this.queue.shift();
    this.ensure();
    if (this.queue.length) this.loadInfo();
    return it || null;
  },
  peek(n) { return this.queue[n || 0] || null; },
  putBack(it) {
    this.queue = this.queue.filter((q) => q.mediaKey !== it.mediaKey);
    this.queue.unshift(it);
    this.seen.add(it.mediaKey);
  },
  drop(mediaKey) { this.queue = this.queue.filter((q) => q.mediaKey !== mediaKey); },
  sizeOf(it) { const i = this.info[it.mediaKey]; return (i && i.size) || 0; },

  // Inclusive upper bound for a refetch after trash/restore mutates the
  // library. Re-reading is harmless (decisions filter it); trusting an
  // undocumented page token after rows disappear can skip photos.
  mutationBoundary() {
    let newest = null;
    const consider = (it) => {
      if (it && typeof it.ts === 'number' && (newest === null || it.ts > newest)) newest = it.ts;
    };
    swipe.liveItems().forEach(consider);
    this.queue.forEach(consider);
    return newest !== null ? newest : this.lastPageTs;
  },
};

// The resume cursor is the timestamp of the newest item that still has no
// decision: whatever is on screen plus whatever is queued. Everything newer has
// been kept (filtered by `kept`) or marked (filtered by `marked`, and persisted),
// so restarting at "ts <= cursor" can neither skip nor repeat a photo. Being
// derived, it needs no special handling for undo, resets or races.
function syncCursor() {
  let newest = null;
  const consider = (it) => {
    if (it && typeof it.ts === 'number' && (newest === null || it.ts > newest)) newest = it.ts;
  };
  swipe.liveItems().forEach(consider);
  feed.queue.forEach(consider);
  if (newest !== null && newest !== state.cursorTs) {
    state.cursorTs = newest;
    persist();
  }
}
