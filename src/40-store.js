// ---------------------------------------------------------------------------
// Local state stays on this device: settings and counters live in localStorage,
// while the (potentially huge) kept list and pending delete list live in
// IndexedDB. Everything is namespaced per Google account, because
// photos.google.com serves /u/0/, /u/1/ … from a single origin.
// ---------------------------------------------------------------------------

const ACCT = (function () {
  const routeAccount = (location.pathname.match(/^\/u\/(\d+)(?:\/|$)/) || [])[1];
  const raw = String(G.account != null && G.account !== '' ? G.account : (routeAccount || '0'));
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) hash = ((hash * 33) ^ raw.charCodeAt(i)) >>> 0;
  return hash.toString(36);
})();

const LS_STATE = 'gpSwipe.state.v2.' + ACCT;
const LS_KEPT_LEGACY = ['gpSwipe.kept.v1', 'gpSwipe.kept.v1.' + ACCT];
const IDB_NAME = 'gpSwipe-' + ACCT;
const IDB_VERSION = 2;

const DEFAULTS = {
  settings: {
    source: 1,            // 1 library · 2 archive · 3 both
    startDate: '',
    resume: true,
    skipVideos: false,
    skipFav: false,
    reviewEvery: 100,     // ask for a review after this many decisions (0 = never ask)
    theme: 'auto',        // auto · dark · light
    language: 'auto',     // auto · tr · en · it · es · de
    dryRun: false,        // run the whole flow but never send a delete request
  },
  stats: { kept: 0, deleted: 0, freedBytes: 0 },
  cursorTs: null,         // resume position: newest still-undecided timestamp
  sinceReview: 0,
  introSeen: false,
};

function readState() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_STATE) || '{}') || {}; } catch (e) { saved = {}; }
  const s = Object.assign({}, DEFAULTS, saved);
  s.settings = Object.assign({}, DEFAULTS.settings, saved.settings || {});
  s.stats = Object.assign({}, DEFAULTS.stats, saved.stats || {});
  if (typeof s.sinceReview !== 'number' || s.sinceReview < 0) s.sinceReview = 0;
  return s;
}

const state = readState();

// `state` is intentionally a stable object because every module holds a
// reference to it.  When another Photos tab was active, refresh its contents
// in-place after acquiring the per-account lock.
function reloadState() {
  const fresh = readState();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
}

const kept = new Set();         // mediaKey -> decided "keep"
const marked = new Map();       // mediaKey -> item, waiting for the user to confirm deletion

let persistTimer = null;
function persist(now) {
  // Only the tab holding the per-account lock owns mutable state. A passive
  // tab may have a stale in-memory snapshot and must never overwrite it on a
  // visibilitychange/beforeunload event. The same is true for a newly active
  // tab until both localStorage and IndexedDB have been fully hydrated.
  if (!store.hasLock || !store.stateWritable) return;
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  const write = () => {
    persistTimer = null;
    if (!store.hasLock || !store.stateWritable) return;
    try { localStorage.setItem(LS_STATE, JSON.stringify(state)); }
    catch (e) { console.warn('[gpSwipe] could not persist settings', e); }
  };
  if (now) write(); else persistTimer = setTimeout(write, 400);
}

const store = {
  db: null,
  loaded: false,
  initPromise: null,
  hasLock: false,
  lockRequest: null,
  lockRelease: null,
  lockAcquirePromise: null,
  releasePromise: null,
  lockCancelRequested: false,
  stateWritable: false,
  lockApi: navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null,
  lockFailure: null,

  init() {
    if (this.loaded) return Promise.resolve(this.db);
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.open();
        await this.load();
        return this.db;
      })().catch((e) => {
        // Let a later explicit Retry reopen/re-read the store. The UI remains
        // fail-closed until a complete snapshot can be hydrated.
        this.loaded = false;
        this.initPromise = null;
        throw e;
      });
    }
    return this.initPromise;
  },

  async open() {
    if (!window.indexedDB) return null;
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kept')) db.createObjectStore('kept');
          if (!db.objectStoreNames.contains('marked')) db.createObjectStore('marked');
          if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('indexeddb blocked'));
      });
      this.db.onversionchange = () => { try { this.db.close(); } catch (e) {} this.db = null; };
    } catch (e) {
      console.warn('[gpSwipe] IndexedDB unavailable, falling back to localStorage', e);
      this.db = null;
    }
    return this.db;
  },

  tx(storeName, mode, fn) {
    return new Promise((resolve, reject) => {
      let req;
      const tx = this.db.transaction(storeName, mode);
      try { req = fn(tx.objectStore(storeName)); } catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async load() {
    if (this.loaded) return;
    await this.refresh();

    // one-time migration of the v1 localStorage kept list
    if (this.db) {
      for (const lsKey of LS_KEPT_LEGACY) {
        const raw = localStorage.getItem(lsKey);
        if (!raw) continue;
        const legacy = raw.split('\n').filter(Boolean);
        if (legacy.length) {
          await this.tx('kept', 'readwrite', (st) => { legacy.forEach((k) => st.put(1, k)); });
          legacy.forEach((k) => kept.add(k));
        }
        try { localStorage.removeItem(lsKey); } catch (e) { /* ignore */ }
      }
    }
    this.loaded = true;
  },

  async refresh() {
    const nextKept = new Set();
    const nextMarked = new Map();
    const acceptMarked = (it) => {
      if (!validMarkedItem(it) || nextMarked.has(it.mediaKey)) throw new Error('invalid local marked row');
      nextMarked.set(it.mediaKey, it);
    };
    if (!this.db) {
      // Limited localStorage fallback. Large libraries can exceed its quota,
      // which is why the UI keeps the IndexedDB warning visible.
      for (const k of LS_KEPT_LEGACY) {
        const raw = localStorage.getItem(k);
        if (raw) raw.split('\n').filter(Boolean).forEach((key) => nextKept.add(key));
      }
      const m = JSON.parse(localStorage.getItem(LS_STATE + '.marked') || '[]');
      if (!Array.isArray(m)) throw new Error('invalid local marked snapshot');
      m.forEach(acceptMarked);
    } else {
      const keys = await this.tx('kept', 'readonly', (st) => st.getAllKeys());
      (keys || []).forEach((k) => {
        if (!validRpcKey(k)) throw new Error('invalid local kept row');
        nextKept.add(k);
      });
      const rows = await this.tx('marked', 'readonly', (st) => st.getAll());
      (rows || []).forEach(acceptMarked);
    }

    // Swap only after every read succeeded. A partial snapshot must never be
    // exposed to the feed, because it could offer a pending-delete item again.
    kept.clear();
    nextKept.forEach((k) => kept.add(k));
    marked.clear();
    nextMarked.forEach((it, k) => marked.set(k, it));
  },

  // Only one tab per Google account may make decisions at a time.  Without
  // this lock, two tabs keep independent in-memory maps and can show or delete
  // an item after the other tab has already changed its decision.
  acquireLock() {
    if (this.hasLock) return Promise.resolve(true);
    if (this.releasePromise) return this.releasePromise.then(() => this.acquireLock());
    if (this.lockAcquirePromise) return this.lockAcquirePromise;
    this.lockFailure = null;
    const locks = this.lockApi;
    if (!locks || typeof locks.request !== 'function') {
      this.hasLock = false;
      this.stateWritable = false;
      this.lockFailure = 'unavailable';
      return Promise.resolve(false);
    }

    this.lockCancelRequested = false;
    this.lockAcquirePromise = new Promise((resolve) => {
      let reported = false;
      const report = (value) => { if (!reported) { reported = true; resolve(value); } };
      this.lockRequest = locks.request('gpSwipe-active-' + ACCT, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { this.lockCancelRequested = false; report(false); return; }
        this.hasLock = true;
        this.stateWritable = false;
        report(true);
        if (this.lockCancelRequested) {
          this.hasLock = false;
          this.lockCancelRequested = false;
          return;
        }
        await new Promise((release) => { this.lockRelease = release; });
        this.hasLock = false;
        this.lockRelease = null;
      }).catch((e) => {
        if (this.lockCancelRequested) {
          this.lockCancelRequested = false;
          this.hasLock = false;
          report(false);
          return;
        }
        console.warn('[gpSwipe] Web Lock unavailable; blocking mutable state', e);
        this.hasLock = false;
        this.stateWritable = false;
        this.lockFailure = 'unavailable';
        report(false);
      }).finally(() => { this.lockRequest = null; });
    }).finally(() => { this.lockAcquirePromise = null; });
    return this.lockAcquirePromise;
  },

  releaseLock() {
    this.hasLock = false;
    this.stateWritable = false;
    if (this.lockRelease) {
      const release = this.lockRelease;
      this.lockRelease = null;
      release();
    } else if (this.lockRequest) {
      this.lockCancelRequested = true;
    }
    const pending = this.lockRequest;
    if (!pending) return Promise.resolve();
    let tracked;
    tracked = Promise.resolve(pending).catch(() => {}).finally(() => {
      if (this.releasePromise === tracked) this.releasePromise = null;
    });
    this.releasePromise = tracked;
    return tracked;
  },

  _fallbackMarked() {
    try { localStorage.setItem(LS_STATE + '.marked', JSON.stringify(Array.from(marked.values()))); return true; }
    catch (e) { console.warn('[gpSwipe] could not persist the marked list', e); return false; }
  },
  _warn(e) { console.warn('[gpSwipe] IndexedDB write failed', e); },

  keepAdd(key) {
    kept.add(key);
    if (this.db) return this.tx('kept', 'readwrite', (st) => st.put(1, key)).catch(this._warn);
    return this._fallbackKept();
  },
  keepDel(key) {
    kept.delete(key);
    if (this.db) return this.tx('kept', 'readwrite', (st) => st.delete(key)).catch(this._warn);
    return this._fallbackKept();
  },
  keepAddMany(keys) {
    keys.forEach((k) => kept.add(k));
    if (this.db) return this.tx('kept', 'readwrite', (st) => keys.forEach((k) => st.put(1, k))).catch(this._warn);
    return this._fallbackKept();
  },
  async keepClear() {
    if (this.db) {
      await this.tx('kept', 'readwrite', (st) => st.clear());
      kept.clear();
      return;
    }
    const before = new Set(kept);
    kept.clear();
    if (this._fallbackKept()) return;
    before.forEach((key) => kept.add(key));
    this._fallbackKept();
    throw new Error('localStorage kept reset failed');
  },
  _fallbackKept() {
    try { localStorage.setItem(LS_KEPT_LEGACY[1], Array.from(kept).join('\n')); return true; }
    catch (e) { console.warn('[gpSwipe] could not persist the kept list', e); return false; }
  },

  markAdd(item) {
    marked.set(item.mediaKey, item);
    if (this.db) return this.tx('marked', 'readwrite', (st) => st.put(item, item.mediaKey)).catch(this._warn);
    return this._fallbackMarked();
  },
  markDel(key) {
    marked.delete(key);
    if (this.db) return this.tx('marked', 'readwrite', (st) => st.delete(key)).catch(this._warn);
    return this._fallbackMarked();
  },
  markDelMany(keys) {
    keys.forEach((k) => marked.delete(k));
    if (this.db) return this.tx('marked', 'readwrite', (st) => keys.forEach((k) => st.delete(k))).catch(this._warn);
    return this._fallbackMarked();
  },
  markAddMany(items) {
    items.forEach((it) => marked.set(it.mediaKey, it));
    if (this.db) return this.tx('marked', 'readwrite', (st) => items.forEach((it) => st.put(it, it.mediaKey))).catch(this._warn);
    return this._fallbackMarked();
  },

  // Awaited, mutually-exclusive decision writes used by swipe and undo. The
  // in-memory maps change only after IndexedDB commits; localStorage fallback
  // rolls both snapshots back if either write fails.
  async setDisposition(item, action) {
    const key = item && item.mediaKey;
    if (!key || (action !== 'keep' && action !== 'mark')) throw new Error('invalid disposition');
    if (this.db) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(['kept', 'marked'], 'readwrite');
        const keepStore = tx.objectStore('kept');
        const markStore = tx.objectStore('marked');
        if (action === 'keep') { keepStore.put(1, key); markStore.delete(key); }
        else { keepStore.delete(key); markStore.put(item, key); }
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('decision transaction failed'));
      });
      if (action === 'keep') { kept.add(key); marked.delete(key); }
      else { kept.delete(key); marked.set(key, item); }
      return;
    }
    const wasKept = kept.has(key);
    const wasMarked = marked.get(key);
    if (action === 'keep') { kept.add(key); marked.delete(key); }
    else { kept.delete(key); marked.set(key, item); }
    const keptOk = this._fallbackKept();
    const markedOk = this._fallbackMarked();
    if (keptOk && markedOk) return;
    if (wasKept) kept.add(key); else kept.delete(key);
    if (wasMarked) marked.set(key, wasMarked); else marked.delete(key);
    this._fallbackKept();
    this._fallbackMarked();
    throw new Error('localStorage decision transaction failed');
  },

  async clearDisposition(key) {
    if (!key) throw new Error('invalid disposition key');
    if (this.db) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(['kept', 'marked'], 'readwrite');
        tx.objectStore('kept').delete(key);
        tx.objectStore('marked').delete(key);
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('undo transaction failed'));
      });
      kept.delete(key);
      marked.delete(key);
      return;
    }
    const wasKept = kept.has(key);
    const wasMarked = marked.get(key);
    kept.delete(key);
    marked.delete(key);
    const keptOk = this._fallbackKept();
    const markedOk = this._fallbackMarked();
    if (keptOk && markedOk) return;
    if (wasKept) kept.add(key);
    if (wasMarked) marked.set(key, wasMarked);
    this._fallbackKept();
    this._fallbackMarked();
    throw new Error('localStorage undo transaction failed');
  },

  async unmarkMany(items) {
    if (!items.length) return;
    const keys = items.map((it) => it.mediaKey);
    if (this.db) {
      await this.tx('marked', 'readwrite', (st) => keys.forEach((k) => st.delete(k)));
      keys.forEach((k) => marked.delete(k));
      return;
    }
    const before = new Map(items.map((it) => [it.mediaKey, marked.get(it.mediaKey)]));
    keys.forEach((k) => marked.delete(k));
    if (this._fallbackMarked()) return;
    before.forEach((it, key) => { if (it) marked.set(key, it); });
    this._fallbackMarked();
    throw new Error('localStorage unmark transaction failed');
  },

  // Strict/atomic variants used by the review commit path. A photo the user
  // spared must never remain in the delete queue because one of two separate
  // transactions failed halfway through.
  async saveReviewChoices(items) {
    if (this.db) {
      await this.tx('marked', 'readwrite', (st) => items.forEach((it) => st.put(it, it.mediaKey)));
      items.forEach((it) => marked.set(it.mediaKey, it));
      return;
    }
    const before = new Map(items.map((it) => [it.mediaKey, marked.get(it.mediaKey)]));
    items.forEach((it) => marked.set(it.mediaKey, it));
    if (!this._fallbackMarked()) {
      before.forEach((it, key) => { if (it) marked.set(key, it); else marked.delete(key); });
      throw new Error('localStorage marked write failed');
    }
  },

  async moveMarkedToKept(items) {
    if (!items.length) return;
    const keys = items.map((it) => it.mediaKey);
    if (this.db) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(['kept', 'marked'], 'readwrite');
        const keepStore = tx.objectStore('kept');
        const markStore = tx.objectStore('marked');
        keys.forEach((k) => { keepStore.put(1, k); markStore.delete(k); });
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('review decision transaction failed'));
      });
      keys.forEach((k) => { kept.add(k); marked.delete(k); });
      return;
    }
    const oldMarked = new Map(items.map((it) => [it.mediaKey, marked.get(it.mediaKey)]));
    const oldKept = new Set(keys.filter((k) => kept.has(k)));
    keys.forEach((k) => { kept.add(k); marked.delete(k); });
    if (!this._fallbackKept() || !this._fallbackMarked()) {
      keys.forEach((k) => { if (!oldKept.has(k)) kept.delete(k); });
      oldMarked.forEach((it, key) => { if (it) marked.set(key, it); });
      this._fallbackKept();
      this._fallbackMarked();
      throw new Error('localStorage review transaction failed');
    }
  },

  async commitTrashed(items) {
    if (!items.length) return;
    const keys = items.map((it) => it.mediaKey);
    if (this.db) {
      const at = Date.now();
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(['marked', 'log'], 'readwrite');
        const markStore = tx.objectStore('marked');
        const logStore = tx.objectStore('log');
        items.forEach((i) => {
          markStore.delete(i.mediaKey);
          logStore.add({
            mediaKey: i.mediaKey, dedupKey: i.dedupKey, fileName: i.fileName || null,
            size: typeof i.size === 'number' ? i.size : null, takenAt: i.ts || null,
            deletedAt: at, dryRun: false,
          });
        });
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('trash commit transaction failed'));
      });
      keys.forEach((k) => marked.delete(k));
      return;
    }
    keys.forEach((k) => marked.delete(k));
    if (!this._fallbackMarked()) {
      items.forEach((it) => marked.set(it.mediaKey, it));
      throw new Error('localStorage trash commit failed');
    }
  },

  async restoreMarked(items) {
    if (!items.length) return;
    if (this.db) {
      await this.tx('marked', 'readwrite', (st) => items.forEach((it) => st.put(it, it.mediaKey)));
      items.forEach((it) => marked.set(it.mediaKey, it));
      return;
    }
    const before = new Map(items.map((it) => [it.mediaKey, marked.get(it.mediaKey)]));
    items.forEach((it) => marked.set(it.mediaKey, it));
    if (!this._fallbackMarked()) {
      before.forEach((it, key) => { if (it) marked.set(key, it); else marked.delete(key); });
      throw new Error('localStorage restore write failed');
    }
  },

  // append-only record of what was actually trashed, so a run can be reconciled
  // against Google's 60-day trash window
  logDeleted(items, dryRun) {
    if (!this.db || !items.length) return;
    const at = Date.now();
    const rows = items.map((i) => ({
      mediaKey: i.mediaKey, dedupKey: i.dedupKey, fileName: i.fileName || null,
      size: typeof i.size === 'number' ? i.size : null, takenAt: i.ts || null,
      deletedAt: at, dryRun: !!dryRun,
    }));
    return this.tx('log', 'readwrite', (st) => rows.forEach((r) => st.add(r))).catch(this._warn);
  },
  logRemove(mediaKeys) {          // batch undo: drop the entries again
    if (!this.db || !mediaKeys.length) return;
    const want = new Set(mediaKeys);
    return new Promise((resolve) => {
      const tx = this.db.transaction('log', 'readwrite');
      const st = tx.objectStore('log');
      const req = st.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (cur.value && want.has(cur.value.mediaKey)) cur.delete();
        cur.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => resolve();
    });
  },
  logAll() {
    if (!this.db) return Promise.resolve([]);
    return this.tx('log', 'readonly', (st) => st.getAll()).then((r) => r || []).catch(() => []);
  },
};

window.addEventListener('beforeunload', () => persist(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(true); });
