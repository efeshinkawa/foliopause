// ---------------------------------------------------------------------------
// The feed: hands out items that still need a decision, in the order the user
// chose in the scan menu. Items already kept or already marked for deletion are
// filtered out (by either of a photo's two identifiers), so a photo is never
// offered twice.
//
// Google's listing (`lcxiM`) only pages newest-first below an inclusive
// timestamp; there is no ascending mode and no lower bound. Every other order
// is built on top of that here:
//   newest  — page down from the top (or from the resume cursor)
//   oldest  — consume the timeline in intervals (lo, hi]; see loadOldest()
//   random  — draw timestamps, take a handful of the rows just below each one,
//             and interleave the draws so consecutive cards differ
//   album   — `snAcKc` pages, buffered whole, then sorted or shuffled locally
// ---------------------------------------------------------------------------

const QUEUE_TARGET = 12;   // keep this many decided-free items buffered
const PAGE_SIZE = 200;
const MAX_SCAN_PAGES = 40; // one bounded scan; continuing requires a user retry
const MAX_SCAN_MS = 20000;
const RANDOM_TAKE = 12;    // rows kept from one random draw
const RANDOM_PRIME = 4;    // draws issued together when the deck is empty
const RANDOM_REFILL = 2;   // draws issued together to top the deck up
const RANDOM_DRY_DRAWS = 6; // fruitless draws in a row before the sequential sweep
const ALBUM_SANITY_PAGES = 2000; // an album cannot have more pages than this
const EPOCH_FLOOR = Date.UTC(1900, 0, 1);
const FUTURE_SLACK = 366 * 86400000;
const CHUNK_MIN_SPAN = 3600000;   // an interval one hour wide is taken whole, however dense
const CHUNK_MAX_PAGES = 1;        // a wider interval that does not fit one page is halved
const CHUNK_GROWTH_MAX = 4;       // how much wider the next interval guess may get at once

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// Round-robin merge: one from each list in turn, so neighbouring cards come
// from different draws.
function interleave(lists) {
  const out = [];
  const src = lists.filter((l) => l && l.length);
  let i = 0;
  while (src.length) {
    const l = src[i % src.length];
    out.push(l.shift());
    if (!l.length) { src.splice(i % src.length, 1); if (!src.length) break; }
    else i++;
  }
  return out;
}

const feed = {
  queue: [],
  nextPageId: undefined,   // sequential loader: undefined = not started, null = no more pages
  loading: false,
  exhausted: false,
  error: false,
  ready: false,            // set once the kept/marked lists are in memory
  gen: 0,                  // bumped by reset(); in-flight pages from an older gen are dropped
  info: {},                // mediaKey -> { fileName, size }
  infoFailed: false,
  infoAsked: new Set(),
  seen: new Set(),         // handed out during this session, by mediaKey and 'd:' + dedupKey
  requestedPages: new Set(),
  restartTs: null,         // one-shot safe upper bound after a library mutation (newest order)
  lastPageTs: null,
  plan: null,              // what the scan covers, frozen at reset()
  progress: null,          // { kind: 'album', i, n } | { kind: 'oldest' } while loading
  myActor: null,           // the user's actor id, learned from the chosen album
  // oldest-first interval search
  chunkLo: null,           // every row with ts <= chunkLo is done
  chunkTop: null,          // current upper probe
  chunkPartial: null,      // rows + token of a dense interval still being paged
  nextSpan: null,          // width guess for the next interval, from the previous one's density
  rangeHi: null,
  // random
  randomLo: null, randomHi: null, dryDraws: 0, sweeping: false, randomStarted: false,
  // album
  album: null,             // { items, pos, loaded, pages, nextPageId, count, ownerActor, offered }
  albumEmpty: false,       // the chosen album has nothing this scan can show

  makePlan() {
    const s = state.settings;
    const day = (v, tail) => {
      if (!v) return null;
      const d = new Date(v + tail);
      return isNaN(d.getTime()) ? null : d.getTime();
    };
    return {
      order: s.order,
      scope: s.albumKey ? 'album' : 'library',
      source: s.source,
      albumKey: s.albumKey,
      albumAuthKey: s.albumAuthKey,
      albumOwner: s.albumOwner,
      albumTitle: s.albumTitle,
      fromTs: day(s.dateFrom, 'T00:00:00'),
      toTs: day(s.dateTo, 'T23:59:59.999'),
      mediaType: s.mediaType,
      skipFav: !!s.skipFav && !s.albumKey,   // album rows carry no favourite flag
      resume: !!s.resume,
    };
  },

  // A fresh scan. `o.boundary` = { newest, oldest } when the plain newest-first
  // listing restarts after a trash/restore (see afterMutation()).
  reset(o) {
    this.gen++;
    const boundary = (o && o.boundary) || {};
    this.plan = this.makePlan();
    this.queue = [];
    this.nextPageId = undefined;
    this.loading = false;
    this.exhausted = false;
    this.error = false;
    this.seen = new Set();
    this.requestedPages = new Set();
    this.lastPageTs = null;
    this.infoFailed = false;
    this.infoAsked = new Set();
    this.progress = null;
    // Only the plain newest-first listing may restart below a boundary: random
    // order leaves undecided photos above it, and the other loaders restart by
    // their own means.
    const sequential = this.plan.scope === 'library' && this.plan.order === 'newest';
    this.restartTs = sequential && typeof boundary.newest === 'number' ? boundary.newest : null;
    this.rangeHi = this.plan.toTs != null ? this.plan.toTs : Date.now() + FUTURE_SLACK;
    this.chunkLo = null;
    this.chunkTop = null;
    this.chunkPartial = null;
    this.nextSpan = null;
    this.randomLo = null; this.randomHi = null; this.dryDraws = 0; this.sweeping = false; this.randomStarted = false;
    this.album = null;
    this.albumEmpty = false;
    this.myActor = null;
  },

  // A trash or restore changed the library underneath us. Offset page tokens
  // may now point elsewhere, so a listing that holds one restarts below the
  // newest still-undecided photo. Timestamp-defined intervals (oldest order),
  // random draws and album snapshots hold no such token: they keep their
  // position and merely drop the photos that were just decided. `live` are the
  // cards that were on screen; undecided ones return to the front of the deck.
  afterMutation(boundary, live) {
    const p = this.plan;
    const holdsToken = p.scope === 'library' && (p.order === 'newest' || (p.order === 'random' && this.sweeping));
    if (holdsToken) {
      const sweeping = this.sweeping;
      this.reset({ boundary: boundary });
      if (sweeping) {
        // continue the leftover sweep from the boundary rather than drawing again
        this.sweeping = true;
        this.randomStarted = true;
        this.restartTs = typeof boundary.newest === 'number' ? boundary.newest : null;
      }
      return;
    }
    this.gen++;                 // whatever is in flight is re-probed by timestamp
    this.loading = false;
    this.progress = null;
    this.chunkPartial = null;   // a dense interval restarts from its first page
    if (this.album && !this.album.loaded) this.album = null;   // half-read snapshot: its tokens may have shifted too
    if (this.error === true) this.error = false;
    const undecided = (it) => it && !isKept(it) && !isMarked(it);
    const front = (live || []).filter(undecided);
    const frontKeys = new Set(front.map((it) => it.mediaKey));
    this.queue = front.concat(this.queue.filter((it) => undecided(it) && !frontKeys.has(it.mediaKey)));
    front.forEach((it) => this.markSeen(it));
  },

  // Sequential (newest-first) upper bound for the first request.
  startTimestamp() {
    if (typeof this.restartTs === 'number') return this.restartTs;
    const p = this.plan;
    const resumeTs = p.resume && p.order === 'newest' && typeof state.cursorTs === 'number' ? state.cursorTs : null;
    // both are upper bounds; the older one is the only safe place to start
    if (p.toTs != null && resumeTs != null) return Math.min(p.toTs, resumeTs);
    return p.toTs != null ? p.toTs : resumeTs;
  },

  markSeen(it) {
    this.seen.add(it.mediaKey);
    if (typeof it.dedupKey === 'string' && it.dedupKey) this.seen.add(DEDUP_PREFIX + it.dedupKey);
  },
  wasSeen(it) {
    return this.seen.has(it.mediaKey) || (typeof it.dedupKey === 'string' && this.seen.has(DEDUP_PREFIX + it.dedupKey));
  },

  accept(it) {
    if (!it || !it.mediaKey || !it.dedupKey || !it.thumb) return false;
    if (isKept(it) || isMarked(it) || this.wasSeen(it)) return false;
    const p = this.plan;
    if (p.mediaType === 'photo' && it.isVideo) return false;
    if (p.mediaType === 'video' && !it.isVideo) return false;
    if (p.skipFav && it.isFavorite) return false;
    if (typeof it.ts === 'number') {
      if (p.fromTs != null && it.ts < p.fromTs) return false;
      if (p.toTs != null && it.ts > p.toTs) return false;
    }
    // In a shared album, rows added by other people are not in this library
    // and cannot be trashed from here.
    if (p.scope === 'album' && this.myActor && it.ownerActor && it.ownerActor !== this.myActor) return false;
    return true;
  },

  push(items) {
    for (const it of items) {
      if (this.accept(it)) { this.queue.push(it); this.markSeen(it); }
    }
  },

  // One bounded scan per ensure(): so many pages or so much time, then pause
  // in a recoverable state that an explicit Retry continues.
  budget() {
    const started = performance.now();
    let pages = 0;
    return {
      page() { pages++; },
      get pages() { return pages; },
      spent() { return pages >= MAX_SCAN_PAGES || performance.now() - started >= MAX_SCAN_MS; },
    };
  },

  async ensure() {
    if (!this.ready || this.loading || this.exhausted || this.error) return;
    if (this.queue.length >= QUEUE_TARGET) return;
    this.loading = true;
    const gen = this.gen;
    app.renderState();
    try {
      const p = this.plan;
      if (p.scope === 'album') await this.loadAlbum(gen);
      else if (p.order === 'oldest') await this.loadOldest(gen);
      else if (p.order === 'random') await this.loadRandom(gen);
      else await this.loadNewest(gen);
      if (gen !== this.gen) return;  // a reset happened while we were waiting
      this.loadInfo();
    } catch (e) {
      if (gen !== this.gen) return;
      console.error('[gpSwipe] could not load the library', e);
      this.error = e && e.albumGone ? 'album-gone' : true;
    } finally {
      if (gen === this.gen) {
        this.loading = false;
        this.progress = null;
        app.onFeedChanged();
      }
    }
  },

  // Fetch one library page and keep only rows that are fully formed: a queued
  // item can be marked, persisted and later named in a trash request.
  async fetchPage(o) {
    const page = await api.listLibrary({
      pageId: o.pageId || null,
      timestamp: o.pageId ? null : (o.timestamp != null ? o.timestamp : null),
      pageSize: o.pageSize || PAGE_SIZE,
      source: this.plan.source,
    });
    const usable = page.items.filter(validMarkedItem);
    // A live library page routinely carries rows this client does not model
    // (padding rows, uploads with no thumbnail yet). Skipping those
    // individually is normal. Only a page that returns rows yet yields nothing
    // usable at all indicates the response shape changed; without that guard a
    // malformed source can be paged forever behind Loading.
    if (page.rawItemCount > 0 && usable.length === 0) throw new Error('library response contains no usable media rows');
    let oldestTs = null;
    for (const it of usable) if (typeof it.ts === 'number' && (oldestTs === null || it.ts < oldestTs)) oldestTs = it.ts;
    if (oldestTs === null && typeof page.lastItemTimestamp === 'number') oldestTs = page.lastItemTimestamp;
    return { items: usable, nextPageId: page.nextPageId, oldestTs: oldestTs, rawItemCount: page.rawItemCount };
  },

  // ---- newest first (the plain listing) ----------------------------------
  async loadNewest(gen) {
    const budget = this.budget();
    while (this.queue.length < QUEUE_TARGET && !this.exhausted && !budget.spent()) {
      const requestKey = this.nextPageId === undefined ? '__first__' : String(this.nextPageId);
      if (this.requestedPages.has(requestKey)) throw new Error('pagination token repeated: ' + requestKey);
      this.requestedPages.add(requestKey);
      let page;
      try {
        page = await this.fetchPage({
          pageId: this.nextPageId === undefined ? null : this.nextPageId,
          timestamp: this.nextPageId === undefined ? this.startTimestamp() : null,
        });
      } catch (e) {
        // A token is consumed only by a successful response. Keep transient
        // failures retryable while still detecting genuine repeated tokens.
        this.requestedPages.delete(requestKey);
        throw e;
      }
      budget.page();
      if (gen !== this.gen) return;
      this.push(page.items);
      if (typeof page.oldestTs === 'number') this.lastPageTs = page.oldestTs;
      this.nextPageId = page.nextPageId;
      // Google can return an empty intermediate page with a continuation
      // token.  Only the absence of that token proves the source is done —
      // unless the page already reached below the requested date range.
      if (!page.nextPageId) this.exhausted = true;
      else if (this.plan.fromTs != null && typeof page.oldestTs === 'number' && page.oldestTs < this.plan.fromTs) this.exhausted = true;
    }
    // `finally -> onFeedChanged -> swipe.render -> feed.take()` used to call
    // ensure() again immediately here, defeating the 40-page guard. Pause in
    // a recoverable state instead; Retry continues from the retained token.
    if (!this.exhausted && this.queue.length < QUEUE_TARGET && budget.spent()) this.error = 'scan-paused';
  },

  // ---- oldest first --------------------------------------------------------
  // The timeline is consumed in intervals (lo, hi] by TIMESTAMP: probe the
  // newest rows at or below hi and follow the continuation until a row at or
  // below lo appears (or the tokens run out). Then every row in the interval
  // is in hand and can be served oldest first; the next interval starts at hi.
  // An interval that does not fit in one page is halved, an empty one is
  // skipped and the next guess widened, so the first interval costs about
  // log2(range / page span) round trips and later ones usually one or two.
  // A page budget only ever pauses this; an interval closes solely on proof.
  async loadOldest(gen) {
    const p = this.plan;
    if (this.chunkLo === null) {
      let lo = p.fromTs != null ? p.fromTs - 1 : EPOCH_FLOOR;
      if (p.resume && typeof state.cursorFloorTs === 'number') lo = Math.max(lo, state.cursorFloorTs - 1);
      this.chunkLo = lo;
    }
    const budget = this.budget();
    while (this.queue.length < QUEUE_TARGET && !this.exhausted && !budget.spent()) {
      if (this.chunkLo >= this.rangeHi) { this.exhausted = true; break; }
      if (this.chunkTop === null) this.chunkTop = this.guessTop();
      this.progress = { kind: 'oldest' };
      const res = await this.probeInterval(this.chunkLo, this.chunkTop, budget, gen);
      if (gen !== this.gen) return;
      if (res === null) break;                       // budget spent mid-interval; state retained
      const lo = this.chunkLo, top = this.chunkTop;
      if (!res.crossed) {
        // more rows in (lo, top] than one page holds: halve the interval
        this.chunkTop = lo + Math.floor((top - lo) / 2);
        this.chunkPartial = null;
        continue;
      }
      const rows = res.rows.filter((it) => typeof it.ts === 'number' && it.ts > lo);
      if (!res.rows.length) this.rememberFloor(top);
      const span = top - lo;
      if (rows.length) {
        rows.sort((a, b) => a.ts - b.ts);
        this.push(rows);
        // aim the next interval at about a page of rows
        this.nextSpan = Math.min(span * CHUNK_GROWTH_MAX, Math.max(CHUNK_MIN_SPAN, Math.floor(span * (PAGE_SIZE * 0.8) / rows.length)));
      } else {
        // nothing in (lo, top]: skip it and look twice as far next time
        this.nextSpan = Math.max(CHUNK_MIN_SPAN, span * 2);
      }
      this.chunkLo = top;
      this.chunkTop = null;
      this.chunkPartial = null;
      if (top >= this.rangeHi) this.exhausted = true;
    }
    if (!this.exhausted && this.queue.length < QUEUE_TARGET && budget.spent()) this.error = 'scan-paused';
  },

  // Upper probe for the next interval: extrapolate from the previous one so
  // that roughly a page of rows lands inside, or use the whole range first.
  guessTop() {
    const lo = this.chunkLo;
    if (typeof this.nextSpan === 'number') return Math.min(this.rangeHi, lo + this.nextSpan);
    // A remembered floor is a hint, never a bound: it is probed like any other
    // interval, so photos that arrived later with an older date still show up.
    if (typeof state.floorTs === 'number' && state.floorTs > lo && state.floorTs < this.rangeHi) return state.floorTs;
    return this.rangeHi;
  },

  rememberFloor(ts) {
    if (this.plan.source !== 1 || this.plan.fromTs != null) return;
    if (typeof state.floorTs !== 'number' || ts > state.floorTs) { state.floorTs = ts; persist(); }
  },

  // Rows at or below `top`, newest first, following the continuation until the
  // interval down to `lo` is covered. A dense interval (many pages inside a
  // single hour) cannot be narrowed any further, so it is paged through with
  // no page cap of its own; the scan budget pauses it and retains its partial
  // state, so Retry continues instead of starting over. Returns null when the
  // budget ran out first.
  async probeInterval(lo, top, budget, gen) {
    const maxPages = top - lo <= CHUNK_MIN_SPAN ? Infinity : CHUNK_MAX_PAGES;
    let part = this.chunkPartial;
    if (!part || part.lo !== lo || part.top !== top) part = { lo: lo, top: top, rows: [], pageId: null, pages: 0, tokens: new Set() };
    this.chunkPartial = part;
    while (part.pages < maxPages) {
      if (budget.spent()) return null;
      const key = part.pageId === null ? '__first__' : String(part.pageId);
      if (part.tokens.has(key)) throw new Error('pagination token repeated: ' + key);
      const page = await this.fetchPage({ pageId: part.pageId, timestamp: part.pageId === null ? top : null });
      budget.page();
      if (gen !== this.gen) return null;
      part.tokens.add(key);
      part.pages++;
      part.rows.push.apply(part.rows, page.items);
      if (!page.nextPageId) return { rows: part.rows, crossed: true };        // nothing older exists at all
      if (typeof page.oldestTs === 'number' && page.oldestTs <= lo) return { rows: part.rows, crossed: true };
      part.pageId = page.nextPageId;
    }
    return { rows: part.rows, crossed: false };
  },

  // ---- random --------------------------------------------------------------
  // Each draw picks a timestamp uniformly between the oldest and newest photo
  // and keeps a dozen of the rows just below it; several draws are issued
  // together and interleaved, so consecutive cards come from different
  // periods rather than one afternoon. The draw is uniform in time, not in
  // photos, so busy periods are under-represented; the menu says so. Once
  // several draws in a row find nothing new, the remaining photos are swept
  // newest-first so the mode can still finish honestly.
  async loadRandom(gen) {
    if (this.sweeping) { await this.loadNewest(gen); return; }
    const p = this.plan;
    const budget = this.budget();
    if (this.randomLo === null) this.randomLo = p.fromTs != null ? p.fromTs : EPOCH_FLOOR;
    if (this.randomHi === null) this.randomHi = this.rangeHi;
    if (!this.randomStarted) {
      // first look at the newest rows: does the whole range fit one page?
      const page = await this.fetchPage({ pageId: null, timestamp: this.randomHi });
      budget.page();
      if (gen !== this.gen) return;
      this.randomStarted = true;
      if (!page.nextPageId) {
        this.push(shuffle(page.items.slice()));
        this.exhausted = true;
        return;
      }
      let newest = null;
      for (const it of page.items) if (typeof it.ts === 'number' && (newest === null || it.ts > newest)) newest = it.ts;
      if (newest !== null && newest < this.randomHi) this.randomHi = newest;
      const first = this.bucket(page.items);
      if (first.length) this.queue = interleave([this.queue, first]);
    }
    while (this.queue.length < QUEUE_TARGET && !this.exhausted && !this.sweeping && !budget.spent()) {
      const n = this.queue.length ? RANDOM_REFILL : RANDOM_PRIME;
      const draws = [];
      for (let i = 0; i < n; i++) draws.push(this.randomLo + Math.floor(Math.random() * Math.max(1, this.randomHi - this.randomLo + 1)));
      const pages = await Promise.all(draws.map((T) => this.fetchPage({ pageId: null, timestamp: T }).then((page) => ({ T: T, page: page }))));
      for (let i = 0; i < pages.length; i++) budget.page();
      if (gen !== this.gen) return;
      const buckets = [];
      let floorRaised = false;
      for (const d of pages) {
        if (!d.page.nextPageId && !d.page.items.length) {   // nothing at or below T: the library starts later
          this.rememberFloor(d.T);
          if (d.T + 1 > this.randomLo) this.randomLo = Math.min(this.randomHi, d.T + 1);
          floorRaised = true;
          continue;
        }
        const b = this.bucket(d.page.items);
        if (b.length) buckets.push(b);
      }
      if (!buckets.length) {
        if (floorRaised) continue;                 // learning where the library starts is not a dry draw
        this.dryDraws += pages.length;
        if (this.dryDraws >= RANDOM_DRY_DRAWS) {
          this.sweeping = true;
          this.nextPageId = undefined;
          this.restartTs = null;
          app.renderState();                        // the chip now says the leftovers are being swept
          await this.loadNewest(gen);
          return;
        }
        continue;
      }
      this.dryDraws = 0;
      this.queue = interleave([this.queue].concat(buckets));
    }
    if (!this.exhausted && !this.sweeping && this.queue.length < QUEUE_TARGET && budget.spent()) this.error = 'scan-paused';
  },

  // Up to RANDOM_TAKE acceptable rows of one draw, in random order, stamped
  // as seen so a neighbouring draw cannot hand them out again.
  bucket(items) {
    const out = [];
    for (const it of shuffle(items.slice())) {
      if (out.length >= RANDOM_TAKE) break;
      if (this.accept(it)) { out.push(it); this.markSeen(it); }
    }
    return out;
  },

  // ---- one album -----------------------------------------------------------
  // Albums are bounded, so the whole album is read once and kept as a
  // snapshot: ordering and shuffling happen locally, and a trash or restore
  // only needs the decided rows dropped. The scan budget can pause the read;
  // Retry continues from the retained token, and the album counts as complete
  // only once Google stops handing out tokens.
  async loadAlbum(gen) {
    const p = this.plan;
    if (!this.album) this.album = { items: [], pos: 0, loaded: false, sorted: false, pages: 0, nextPageId: null, count: null, ownerActor: null, offered: 0, tokens: new Set() };
    const a = this.album;
    const budget = this.budget();
    while (!a.loaded) {
      if (budget.spent()) { this.error = 'scan-paused'; return; }
      if (a.pages >= ALBUM_SANITY_PAGES) throw new Error('album pagination never ended');
      const key = a.nextPageId === null ? '__first__' : String(a.nextPageId);
      if (a.tokens.has(key)) throw new Error('pagination token repeated: ' + key);
      this.progress = { kind: 'album', i: a.items.length, n: a.count };
      app.renderState();
      let page;
      try {
        page = await api.listAlbumPage(p.albumKey, { pageId: a.nextPageId, authKey: p.albumAuthKey });
      } catch (e) {
        // A rejected key (album deleted, unshared, or a stale auth key) cannot
        // be fixed by retrying; go back to the library instead of looping.
        if (e && /^rpc error/.test(String(e.message))) e.albumGone = true;
        throw e;
      }
      budget.page();
      if (gen !== this.gen) return;
      a.tokens.add(key);
      a.pages++;
      const usable = page.items.filter(validMarkedItem);
      if (page.rawItemCount > 0 && usable.length === 0) throw new Error('album response contains no usable media rows');
      // An album row's key only resolves inside its album; carry the album
      // along so links and later sessions can still open the photo.
      usable.forEach((it) => { it.albumKey = p.albumKey; });
      a.items.push.apply(a.items, usable);
      if (typeof page.itemCount === 'number') a.count = page.itemCount;
      if (page.ownerActor && !a.ownerActor) a.ownerActor = page.ownerActor;
      if (!page.nextPageId) a.loaded = true;
      else a.nextPageId = page.nextPageId;
    }
    // The picker only offers albums the user made, so the album owner is the
    // user; rows uploaded by anyone else are dropped in accept().
    if (!this.myActor) this.myActor = p.albumOwner || a.ownerActor || null;
    if (!a.sorted) {
      if (p.order === 'oldest') a.items.sort((x, y) => (x.ts || 0) - (y.ts || 0));
      else if (p.order === 'random') shuffle(a.items);
      else a.items.sort((x, y) => (y.ts || 0) - (x.ts || 0));
      a.sorted = true;
    }
    this.progress = null;
    while (a.pos < a.items.length && this.queue.length < QUEUE_TARGET) {
      const it = a.items[a.pos++];
      if (this.accept(it)) { this.queue.push(it); this.markSeen(it); a.offered++; }
    }
    if (a.pos >= a.items.length) {
      this.exhausted = true;
      this.albumEmpty = a.offered === 0 && this.queue.length === 0;
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
    this.markSeen(it);
  },
  drop(mediaKey) { this.queue = this.queue.filter((q) => q.mediaKey !== mediaKey); },
  sizeOf(it) { const i = this.info[it.mediaKey]; return (i && i.size) || 0; },

  // Where a refetch may safely restart after trash/restore mutates the
  // library: the newest and the oldest photo that is still undecided (on
  // screen or queued). Re-reading is harmless (decisions filter it); trusting
  // an undocumented page token after rows disappear can skip photos.
  mutationBoundary() {
    let newest = null, oldest = null;
    const consider = (it) => {
      if (!it || typeof it.ts !== 'number') return;
      if (newest === null || it.ts > newest) newest = it.ts;
      if (oldest === null || it.ts < oldest) oldest = it.ts;
    };
    swipe.liveItems().forEach(consider);
    this.queue.forEach(consider);
    if (newest === null) newest = this.lastPageTs;
    if (oldest === null && typeof this.chunkLo === 'number') oldest = this.chunkLo + 1;
    return { newest: newest, oldest: oldest };
  },

  // Human-readable summary of the current scan for the app bar and the menu.
  describe() {
    const s = state.settings;
    let order = t(s.order === 'oldest' ? 'orderOldest' : s.order === 'random' ? 'orderRandom' : 'orderNewest');
    if (s.order === 'random' && !s.albumKey && this.sweeping) order = t('randomSweep');
    const scope = s.albumKey ? (s.albumTitle || t('srcAlbum'))
      : t(s.source === 2 ? 'srcArchive' : s.source === 3 ? 'srcBoth' : 'srcLib');
    return { order: order, scope: scope, label: order + ' · ' + scope };
  },
};

// The resume cursor is the timestamp of the item at the frontier of what still
// has no decision: whatever is on screen plus whatever is queued. Newest first,
// that is the newest such item (everything newer has been kept or marked) and
// it lives in state.cursorTs; oldest first, it is the oldest and lives in
// state.cursorFloorTs, so neither can ever be read with the other's meaning.
// Random order and albums have no frontier. Being derived, the cursor needs no
// special handling for undo, resets or races.
function syncCursor() {
  if (!feed.plan || feed.plan.scope === 'album' || feed.plan.order === 'random') return;
  const oldestFirst = feed.plan.order === 'oldest';
  const field = oldestFirst ? 'cursorFloorTs' : 'cursorTs';
  let edge = null;
  const consider = (it) => {
    if (!it || typeof it.ts !== 'number') return;
    if (edge === null || (oldestFirst ? it.ts < edge : it.ts > edge)) edge = it.ts;
  };
  swipe.liveItems().forEach(consider);
  feed.queue.forEach(consider);
  if (edge !== null && edge !== state[field]) {
    state[field] = edge;
    persist();
  }
}
