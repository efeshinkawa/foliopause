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
const STORE_TIMEOUT_MS = 5000;
const LOCK_TIMEOUT_MS = 5000;

const SCAN_ORDERS = ['newest', 'oldest', 'random'];
const MEDIA_TYPES = ['all', 'photo', 'video'];

const DEFAULTS = {
  settings: {
    // --- what the scan covers; changing any of these restarts the feed ---
    order: 'newest',      // newest · oldest · random
    source: 1,            // 1 library · 2 archive · 3 both (ignored while an album is chosen)
    albumKey: null,       // scan one album instead of the library
    albumTitle: '',
    albumAuthKey: null,
    albumOwner: null,     // the album owner's actor id, i.e. the user's own
    dateFrom: '',         // oldest day to include, YYYY-MM-DD ('' = no bound)
    dateTo: '',           // newest day to include, YYYY-MM-DD ('' = no bound)
    mediaType: 'all',     // all · photo · video
    skipFav: false,
    resume: true,         // sequential orders continue from the last undecided photo
    showStartMenu: true,  // offer the scan menu every time the app opens
    // --- everything else ---
    reviewEvery: 100,     // ask for a review after this many decisions (0 = never ask)
    theme: 'auto',        // auto · dark · light
    language: 'auto',     // auto · tr · en · it · es · de
    dryRun: false,        // run the whole flow but never send a delete request
  },
  stats: { kept: 0, deleted: 0, freedBytes: 0 },
  cursorTs: null,         // resume position, newest first: the newest still-undecided timestamp (inclusive upper bound)
  cursorFloorTs: null,    // resume position, oldest first: every photo at or below this has a decision
  floorTs: null,          // hint only: a timestamp the library had nothing at or below, last time we looked
  sinceReview: 0,
  introSeen: false,
};

const isDay = (v) => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v));

function readState() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_STATE) || '{}') || {}; } catch (e) { saved = {}; }
  const s = Object.assign({}, DEFAULTS, saved);
  const legacy = saved.settings && typeof saved.settings === 'object' ? saved.settings : {};
  s.settings = Object.assign({}, DEFAULTS.settings, legacy);
  // Settings written before the scan menu existed: the single start date was
  // an upper bound, and "skip videos" is now the photos-only media type.
  if (!('dateTo' in legacy) && isDay(legacy.startDate)) s.settings.dateTo = legacy.startDate;
  if (!('mediaType' in legacy) && legacy.skipVideos === true) s.settings.mediaType = 'photo';
  delete s.settings.startDate;
  delete s.settings.skipVideos;
  if (SCAN_ORDERS.indexOf(s.settings.order) === -1) s.settings.order = 'newest';
  if (MEDIA_TYPES.indexOf(s.settings.mediaType) === -1) s.settings.mediaType = 'all';
  if ([1, 2, 3].indexOf(s.settings.source) === -1) s.settings.source = 1;
  if (!isDay(s.settings.dateFrom)) s.settings.dateFrom = '';
  if (!isDay(s.settings.dateTo)) s.settings.dateTo = '';
  if (typeof s.settings.albumKey !== 'string' || !s.settings.albumKey) {
    s.settings.albumKey = null; s.settings.albumTitle = ''; s.settings.albumAuthKey = null; s.settings.albumOwner = null;
  }
  if (typeof s.settings.albumTitle !== 'string') s.settings.albumTitle = '';
  for (const k of ['albumAuthKey', 'albumOwner']) {
    if (typeof s.settings[k] !== 'string' || !s.settings[k]) s.settings[k] = null;
  }
  s.settings.showStartMenu = s.settings.showStartMenu !== false;
  s.stats = Object.assign({}, DEFAULTS.stats, saved.stats || {});
  if (typeof s.sinceReview !== 'number' || s.sinceReview < 0) s.sinceReview = 0;
  for (const k of ['cursorTs', 'cursorFloorTs', 'floorTs']) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) s[k] = null;
  }
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

// A photo has two identifiers: its `mediaKey`, which differs between the
// library listing and an album listing of the very same photo, and its
// `dedupKey`, which is the same everywhere and is what the trash RPC takes.
// Decisions are therefore recorded under both, so a photo kept or marked in one
// scan cannot be offered again from another.
const kept = new Set();         // mediaKey -> decided "keep"
const keptDedupOf = new Map();  // kept mediaKey -> its dedupKey, when known (rows store it as their value)
const keptDedup = new Map();    // dedupKey -> how many kept rows carry it
const DEDUP_PREFIX = 'd:';      // namespaces dedup keys where they share a set with media keys
const dedupOf = (item) => (item && typeof item.dedupKey === 'string' && item.dedupKey ? item.dedupKey : null);

class MarkedMap extends Map {
  constructor() { super(); this.byDedup = new Map(); }   // dedupKey -> mediaKey
  set(key, item) {
    const prev = super.get(key);
    if (prev && prev.dedupKey && this.byDedup.get(prev.dedupKey) === key) this.byDedup.delete(prev.dedupKey);
    super.set(key, item);
    if (item && item.dedupKey) this.byDedup.set(item.dedupKey, key);
    return this;
  }
  delete(key) {
    const prev = super.get(key);
    if (prev && prev.dedupKey && this.byDedup.get(prev.dedupKey) === key) this.byDedup.delete(prev.dedupKey);
    return super.delete(key);
  }
  clear() { super.clear(); this.byDedup.clear(); }
  hasDedup(dedupKey) { return typeof dedupKey === 'string' && this.byDedup.has(dedupKey); }
}
const marked = new MarkedMap(); // mediaKey -> item, waiting for the user to confirm deletion

// True when this photo (by either identifier) already has a decision.
const isKept = (item) => !!item && (kept.has(item.mediaKey) || (typeof item.dedupKey === 'string' && keptDedup.has(item.dedupKey)));
function keptAdd(mediaKey, dedupKey) {
  kept.add(mediaKey);
  if (!dedupKey || keptDedupOf.get(mediaKey) === dedupKey) return;
  const old = keptDedupOf.get(mediaKey);
  if (old) keptDedupDrop(old);
  keptDedupOf.set(mediaKey, dedupKey);
  keptDedup.set(dedupKey, (keptDedup.get(dedupKey) || 0) + 1);
}
function keptDedupDrop(dedupKey) {
  const n = (keptDedup.get(dedupKey) || 0) - 1;
  if (n > 0) keptDedup.set(dedupKey, n); else keptDedup.delete(dedupKey);
}
function keptRemove(mediaKey) {
  kept.delete(mediaKey);
  const d = keptDedupOf.get(mediaKey);
  if (d) { keptDedupOf.delete(mediaKey); keptDedupDrop(d); }
}
function keptClearAll() { kept.clear(); keptDedupOf.clear(); keptDedup.clear(); }
const isMarked = (item) => !!item && (marked.has(item.mediaKey) || marked.hasDedup(item.dedupKey));

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
  epoch: 0,
  invalidated: false,
  fallbackAllowed: !window.indexedDB,
  hasLock: false,
  lockRequest: null,
  lockAttempt: null,
  lockRelease: null,
  lockAcquirePromise: null,
  releasePromise: null,
  stateWritable: false,
  lockApi: navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null,
  lockFailure: null,
  operationTimeoutMs: STORE_TIMEOUT_MS,
  lockTimeoutMs: LOCK_TIMEOUT_MS,

  init() {
    if (this.invalidated) return Promise.reject(new Error('indexeddb connection invalidated; reload required'));
    if (this.loaded) return Promise.resolve(this.db);
    if (!this.initPromise) {
      const initEpoch = this.epoch;
      let openedDb = null;
      let tracked;
      tracked = (async () => {
        openedDb = await this.open();
        await this.load();
        if (this.invalidated || this.epoch !== initEpoch || (openedDb && this.db !== openedDb)) {
          throw new Error('indexeddb connection changed during hydration');
        }
        return this.db;
      })().catch((e) => {
        // Let a later explicit Retry reopen/re-read the store. The UI remains
        // fail-closed until a complete snapshot can be hydrated.
        this.loaded = false;
        if (openedDb) { try { openedDb.close(); } catch (closeError) { /* ignore */ } }
        if (this.db === openedDb) this.db = null;
        throw e;
      }).finally(() => {
        if (this.initPromise === tracked) this.initPromise = null;
      });
      this.initPromise = tracked;
    }
    return this.initPromise;
  },

  _assertUsable() {
    if (this.invalidated) throw new Error('indexeddb connection invalidated; reload required');
    if (!this.db && !this.fallbackAllowed) throw new Error('indexeddb connection unavailable');
  },

  async open() {
    if (this.invalidated) throw new Error('indexeddb connection invalidated; reload required');
    if (!window.indexedDB) return null;
    if (this.db) { try { this.db.close(); } catch (e) { /* ignore */ } this.db = null; }
    try {
      this.db = await new Promise((resolve, reject) => {
        let req;
        let settled = false;
        let timer = null;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          fn(value);
        };
        try { req = indexedDB.open(IDB_NAME, IDB_VERSION); }
        catch (e) { finish(reject, e); return; }
        timer = setTimeout(() => {
          try { if (req.transaction) req.transaction.abort(); } catch (e) { /* ignore */ }
          finish(reject, new Error('indexeddb open timed out'));
        }, this.operationTimeoutMs);
        req.onupgradeneeded = () => {
          if (settled) {
            try { req.transaction.abort(); } catch (e) { /* ignore */ }
            return;
          }
          const db = req.result;
          if (!db.objectStoreNames.contains('kept')) db.createObjectStore('kept');
          if (!db.objectStoreNames.contains('marked')) db.createObjectStore('marked');
          if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { autoIncrement: true });
        };
        req.onsuccess = () => {
          if (settled) { try { req.result.close(); } catch (e) { /* ignore */ } return; }
          finish(resolve, req.result);
        };
        req.onerror = () => finish(reject, req.error || new Error('indexeddb open failed'));
        req.onblocked = () => finish(reject, new Error('indexeddb blocked'));
      });
      const openedDb = this.db;
      openedDb.onversionchange = () => {
        try { openedDb.close(); } catch (e) { /* ignore */ }
        if (this.db !== openedDb) return;
        this.db = null;
        this.loaded = false;
        this.epoch++;
        this.invalidated = true;
        this.stateWritable = false;
        feed.ready = false;
        Promise.resolve().then(() => {
          if (typeof app !== 'undefined' && app.open) app.onStoreInvalidated();
          else this.releaseLock();
        });
      };
    } catch (e) {
      // If IndexedDB exists but cannot be read, falling back to an empty
      // localStorage snapshot could re-offer photos whose decisions live only
      // in IndexedDB. Fail closed and let the startup Retry dialog explain it.
      console.warn('[gpSwipe] IndexedDB could not be opened safely', e);
      this.db = null;
      throw e;
    }
    return this.db;
  },

  _tx(storeNames, mode, fn) {
    return new Promise((resolve, reject) => {
      try { this._assertUsable(); } catch (e) { reject(e); return; }
      const db = this.db;
      const txEpoch = this.epoch;
      let settled = false;
      let timer = null;
      let req;
      let tx;
      const finish = (fn2, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn2(value);
      };
      try { tx = db.transaction(storeNames, mode); }
      catch (e) { finish(reject, e); return; }
      timer = setTimeout(() => {
        try {
          tx.abort();
          finish(reject, new Error('indexeddb transaction timed out'));
        } catch (e) {
          // InvalidStateError can mean the transaction already committed and
          // its completion task is merely queued. Give that authoritative
          // event one short turn before treating the outcome as unknown.
          timer = setTimeout(() => finish(reject, new Error('indexeddb transaction outcome unknown')), 250);
        }
      }, this.operationTimeoutMs);
      try { req = fn(tx); }
      catch (e) {
        try { tx.abort(); } catch (abortError) { /* ignore */ }
        finish(reject, e);
        return;
      }
      tx.oncomplete = () => {
        if (this.invalidated || this.epoch !== txEpoch || this.db !== db) {
          finish(reject, new Error('indexeddb transaction became stale'));
          return;
        }
        let result;
        try { result = req && 'result' in req ? req.result : undefined; }
        catch (e) { finish(reject, e); return; }
        finish(resolve, result);
      };
      tx.onerror = () => finish(reject, tx.error || new Error('indexeddb transaction failed'));
      tx.onabort = () => finish(reject, tx.error || new Error('indexeddb transaction aborted'));
    });
  },

  tx(storeName, mode, fn) {
    return this._tx(storeName, mode, (tx) => fn(tx.objectStore(storeName)));
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
    this._assertUsable();
    this.loaded = true;
  },

  async refresh() {
    this._assertUsable();
    const nextKept = [];   // [mediaKey, dedupKey|null]
    const nextMarked = new Map();
    const acceptKept = (k, v) => {
      if (!validRpcKey(k)) throw new Error('invalid local kept row');
      nextKept.push([k, typeof v === 'string' && validRpcKey(v) ? v : null]);
    };
    const acceptMarked = (it) => {
      if (!validMarkedItem(it) || nextMarked.has(it.mediaKey)) throw new Error('invalid local marked row');
      nextMarked.set(it.mediaKey, it);
    };
    if (!this.db) {
      // Limited localStorage fallback. Large libraries can exceed its quota,
      // which is why the UI keeps the IndexedDB warning visible.
      for (const k of LS_KEPT_LEGACY) {
        const raw = localStorage.getItem(k);
        if (raw) raw.split('\n').filter(Boolean).forEach((line) => { const parts = line.split('\t'); acceptKept(parts[0], parts[1]); });
      }
      const m = JSON.parse(localStorage.getItem(LS_STATE + '.marked') || '[]');
      if (!Array.isArray(m)) throw new Error('invalid local marked snapshot');
      m.forEach(acceptMarked);
    } else {
      // keys and values of the same store in one transaction; both come back
      // in key order, so they line up
      let keys = null, values = null;
      await this._tx('kept', 'readonly', (tx) => {
        const st = tx.objectStore('kept');
        const rk = st.getAllKeys(); rk.onsuccess = () => { keys = rk.result; };
        const rv = st.getAll(); rv.onsuccess = () => { values = rv.result; };
        return rv;
      });
      if (!Array.isArray(keys) || !Array.isArray(values) || keys.length !== values.length) throw new Error('invalid local kept snapshot');
      keys.forEach((k, i) => acceptKept(k, values[i]));
      const rows = await this.tx('marked', 'readonly', (st) => st.getAll());
      (rows || []).forEach(acceptMarked);
    }

    // Swap only after every read succeeded. A partial snapshot must never be
    // exposed to the feed, because it could offer a pending-delete item again.
    this._assertUsable();
    keptClearAll();
    nextKept.forEach(([k, d]) => keptAdd(k, d));
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
    if (this.lockAttempt && !this.lockAttempt.done) {
      this.lockFailure = 'unavailable';
      return Promise.resolve(false);
    }
    this.lockFailure = null;
    const locks = this.lockApi;
    if (!locks || typeof locks.request !== 'function') {
      this.hasLock = false;
      this.stateWritable = false;
      this.lockFailure = 'unavailable';
      return Promise.resolve(false);
    }

    // Web Locks forbids combining `ifAvailable` with an AbortSignal. Keep the
    // immediate, non-queued semantics and make late callbacks harmless with a
    // request-local cancellation flag instead.
    const attempt = { cancelled: false, timedOut: false, done: false, promise: null, release: null, timer: null };
    this.lockAttempt = attempt;
    this.lockAcquirePromise = new Promise((resolve) => {
      let reported = false;
      const report = (value) => { if (!reported) { reported = true; resolve(value); } };
      const unavailable = (e) => {
        if (e && !attempt.cancelled) console.warn('[gpSwipe] Web Lock unavailable; blocking mutable state', e);
        this.hasLock = false;
        this.stateWritable = false;
        this.lockFailure = 'unavailable';
        report(false);
      };
      const options = { mode: 'exclusive', ifAvailable: true };
      attempt.timer = setTimeout(() => {
        attempt.cancelled = true;
        attempt.timedOut = true;
        unavailable(new Error('Web Lock request timed out'));
      }, this.lockTimeoutMs);

      let request;
      try {
        request = locks.request('gpSwipe-active-' + ACCT, options, async (lock) => {
          if (attempt.timer) { clearTimeout(attempt.timer); attempt.timer = null; }
          if (!lock) { report(false); return; }
          if (attempt.cancelled || this.lockAttempt !== attempt) { report(false); return; }
          this.hasLock = true;
          this.stateWritable = false;
          report(true);
          await new Promise((release) => {
            attempt.release = release;
            this.lockRelease = release;
            if (attempt.cancelled) release();
          });
          if (this.lockAttempt === attempt) {
            this.hasLock = false;
            this.lockRelease = null;
          }
        });
      } catch (e) {
        if (attempt.timer) { clearTimeout(attempt.timer); attempt.timer = null; }
        attempt.done = true;
        if (this.lockAttempt === attempt) this.lockAttempt = null;
        unavailable(e);
        return;
      }
      attempt.promise = Promise.resolve(request).catch((e) => {
        if (!attempt.cancelled) unavailable(e);
        else report(false);
      }).finally(() => {
        attempt.done = true;
        if (attempt.timer) clearTimeout(attempt.timer);
        if (this.lockRequest === attempt.promise) this.lockRequest = null;
        if (this.lockAttempt === attempt && !this.hasLock) this.lockAttempt = null;
      });
      this.lockRequest = attempt.promise;
    }).finally(() => { this.lockAcquirePromise = null; });
    return this.lockAcquirePromise;
  },

  releaseLock() {
    this.hasLock = false;
    this.stateWritable = false;
    const attempt = this.lockAttempt;
    if (attempt) attempt.cancelled = true;
    if (attempt && attempt.release) {
      const release = attempt.release;
      attempt.release = null;
      this.lockRelease = null;
      release();
    }
    const pending = this.lockRequest;
    if (!pending) return Promise.resolve();
    if (attempt && attempt.timedOut) {
      if (this.lockAttempt === attempt) this.lockAttempt = null;
      if (this.lockRequest === pending) this.lockRequest = null;
      return Promise.resolve();
    }
    let tracked;
    tracked = Promise.race([
      Promise.resolve(pending).catch(() => {}),
      sleep(this.lockTimeoutMs),
    ]).finally(() => {
      if (attempt && !attempt.done) {
        attempt.cancelled = true;
        if (this.lockAttempt === attempt) this.lockAttempt = null;
        if (this.lockRequest === pending) this.lockRequest = null;
      }
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

  // a kept row: key = mediaKey, value = dedupKey (or 1 when it is unknown)
  _keepPut(st, item) { st.put(dedupOf(item) || 1, item.mediaKey); },
  _keepDelete(st, item) { st.delete(item.mediaKey); },
  _keptAdd(item) { keptAdd(item.mediaKey, dedupOf(item)); },
  _keptDel(item) { keptRemove(item.mediaKey); },
  _snapshot() {
    return { kept: Array.from(kept).map((k) => [k, keptDedupOf.get(k) || null]), marked: new Map(marked) };
  },
  _restore(snap) {
    keptClearAll();
    snap.kept.forEach(([k, d]) => keptAdd(k, d));
    marked.clear(); snap.marked.forEach((it, k) => marked.set(k, it));
  },

  async keepClear() {
    this._assertUsable();
    if (this.db) {
      await this.tx('kept', 'readwrite', (st) => st.clear());
      keptClearAll();
      return;
    }
    const snap = this._snapshot();
    keptClearAll();
    if (this._fallbackKept()) return;
    this._restore(snap);
    this._fallbackKept();
    throw new Error('localStorage kept reset failed');
  },
  _fallbackKept() {
    const rows = Array.from(kept).map((k) => (keptDedupOf.has(k) ? k + '\t' + keptDedupOf.get(k) : k));
    try { localStorage.setItem(LS_KEPT_LEGACY[1], rows.join('\n')); return true; }
    catch (e) { console.warn('[gpSwipe] could not persist the kept list', e); return false; }
  },

  markAdd(item) {
    this._assertUsable();
    marked.set(item.mediaKey, item);
    if (this.db) return this.tx('marked', 'readwrite', (st) => st.put(item, item.mediaKey)).catch(this._warn);
    return this._fallbackMarked();
  },
  markDel(key) {
    this._assertUsable();
    marked.delete(key);
    if (this.db) return this.tx('marked', 'readwrite', (st) => st.delete(key)).catch(this._warn);
    return this._fallbackMarked();
  },
  markDelMany(keys) {
    this._assertUsable();
    keys.forEach((k) => marked.delete(k));
    if (this.db) return this.tx('marked', 'readwrite', (st) => keys.forEach((k) => st.delete(k))).catch(this._warn);
    return this._fallbackMarked();
  },
  markAddMany(items) {
    this._assertUsable();
    items.forEach((it) => marked.set(it.mediaKey, it));
    if (this.db) return this.tx('marked', 'readwrite', (st) => items.forEach((it) => st.put(it, it.mediaKey))).catch(this._warn);
    return this._fallbackMarked();
  },

  // Awaited, mutually-exclusive decision writes used by swipe and undo. The
  // in-memory maps change only after IndexedDB commits; localStorage fallback
  // rolls both snapshots back if either write fails.
  async setDisposition(item, action) {
    this._assertUsable();
    const key = item && item.mediaKey;
    if (!key || (action !== 'keep' && action !== 'mark')) throw new Error('invalid disposition');
    // The same photo may already be pending under another key (an album row of
    // a photo marked from the library, or the reverse). One decision per photo:
    // that older row goes with this one.
    const twinKey = item.dedupKey && marked.byDedup.get(item.dedupKey);
    const twin = twinKey && twinKey !== key ? twinKey : null;
    const apply = () => {
      if (action === 'keep') { this._keptAdd(item); marked.delete(key); }
      else { this._keptDel(item); marked.set(key, item); }
      if (twin) marked.delete(twin);
    };
    if (this.db) {
      await this._tx(['kept', 'marked'], 'readwrite', (tx) => {
        const keepStore = tx.objectStore('kept');
        const markStore = tx.objectStore('marked');
        if (action === 'keep') { this._keepPut(keepStore, item); markStore.delete(key); }
        else { this._keepDelete(keepStore, item); markStore.put(item, key); }
        if (twin) markStore.delete(twin);
      });
      apply();
      return;
    }
    const snap = this._snapshot();
    apply();
    const keptOk = this._fallbackKept();
    const markedOk = this._fallbackMarked();
    if (keptOk && markedOk) return;
    this._restore(snap);
    this._fallbackKept();
    this._fallbackMarked();
    throw new Error('localStorage decision transaction failed');
  },

  // Undo: forget the decision on this photo. Takes the item so the dedup row
  // can go too; a bare mediaKey is accepted for rows whose item is unknown.
  async clearDisposition(itemOrKey) {
    this._assertUsable();
    const key = typeof itemOrKey === 'string' ? itemOrKey : itemOrKey && itemOrKey.mediaKey;
    if (!key) throw new Error('invalid disposition key');
    const known = typeof itemOrKey === 'object' && itemOrKey ? itemOrKey : (marked.get(key) || { mediaKey: key });
    const apply = () => { this._keptDel(known); marked.delete(key); };
    if (this.db) {
      await this._tx(['kept', 'marked'], 'readwrite', (tx) => {
        this._keepDelete(tx.objectStore('kept'), known);
        tx.objectStore('marked').delete(key);
      });
      apply();
      return;
    }
    const snap = this._snapshot();
    apply();
    const keptOk = this._fallbackKept();
    const markedOk = this._fallbackMarked();
    if (keptOk && markedOk) return;
    this._restore(snap);
    this._fallbackKept();
    this._fallbackMarked();
    throw new Error('localStorage undo transaction failed');
  },

  async unmarkMany(items) {
    this._assertUsable();
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
    this._assertUsable();
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
    this._assertUsable();
    if (!items.length) return;
    const apply = () => items.forEach((it) => { this._keptAdd(it); marked.delete(it.mediaKey); });
    if (this.db) {
      await this._tx(['kept', 'marked'], 'readwrite', (tx) => {
        const keepStore = tx.objectStore('kept');
        const markStore = tx.objectStore('marked');
        items.forEach((it) => { this._keepPut(keepStore, it); markStore.delete(it.mediaKey); });
      });
      apply();
      return;
    }
    const snap = this._snapshot();
    apply();
    if (!this._fallbackKept() || !this._fallbackMarked()) {
      this._restore(snap);
      this._fallbackKept();
      this._fallbackMarked();
      throw new Error('localStorage review transaction failed');
    }
  },

  async commitTrashed(items) {
    this._assertUsable();
    if (!items.length) return;
    const keys = items.map((it) => it.mediaKey);
    if (this.db) {
      const at = Date.now();
      await this._tx(['marked', 'log'], 'readwrite', (tx) => {
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
    this._assertUsable();
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
    this._assertUsable();
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
    this._assertUsable();
    if (!this.db || !mediaKeys.length) return;
    const want = new Set(mediaKeys);
    return this._tx('log', 'readwrite', (tx) => {
      const st = tx.objectStore('log');
      const req = st.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (cur.value && want.has(cur.value.mediaKey)) cur.delete();
        cur.continue();
      };
      return req;
    }).catch(this._warn);
  },
  logAll() {
    this._assertUsable();
    if (!this.db) return Promise.resolve([]);
    return this.tx('log', 'readonly', (st) => st.getAll()).then((r) => r || []).catch(() => []);
  },
};

window.addEventListener('beforeunload', () => persist(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(true); });
