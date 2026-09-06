// ---------------------------------------------------------------------------
// Google Photos internal API (batchexecute).
//
// The official Photos Library API cannot list a user's whole library any more
// (March 2025 scope change) and has never been able to delete anything, so this
// speaks the same undocumented RPC the web app itself uses, from the page's own
// session. Nothing leaves the browser. RPC ids and payload shapes follow the
// open-source Google Photos Toolkit (github.com/xob0t/Google-Photos-Toolkit).
//
//   lcxiM   list library by taken date      XwAOJf  move to trash / restore
//   VrseUb  item info (incl. trash stamp)   zy0IHe  list trash
//   EWgK9e  bulk media info (name + size)
// ---------------------------------------------------------------------------

const WIZ = window.WIZ_global_data || {};
const G = {
  at: WIZ.SNlM0e,          // xsrf token
  sid: WIZ.FdrFJe,         // f.sid
  bl: WIZ.cfb2h,           // backend build label
  path: WIZ.eptZe || '/_/PhotosUi/',
  rapt: WIZ.Dbw5Ud,        // locked-folder reauth token, when present
  account: WIZ.oPEP7c,
};
// https://photos.google.com/ or https://photos.google.com/u/1/ for a second account
const BASE = location.origin + G.path.replace(/_\/PhotosUi\/?$/, '');

const RPC_TIMEOUT_MS = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(rpcid, data, opts) {
  const retries = (opts && opts.retries) || 3;
  const timeoutMs = (opts && opts.timeoutMs) || RPC_TIMEOUT_MS;
  if (!G.at || !G.sid || !G.bl) throw new Error('WIZ_global_data missing');
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[[rpcid, JSON.stringify(data), null, 'generic']]]))
             + '&at=' + encodeURIComponent(G.at) + '&';
  const params = { rpcids: rpcid, 'source-path': location.pathname, 'f.sid': G.sid, bl: G.bl, pageId: 'none', rt: 'c' };
  if (typeof G.rapt === 'string') params.rapt = G.rapt;
  const url = location.origin + G.path + 'data/batchexecute?'
    + Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&');

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        signal: ctrl.signal,
      });
      if (res.status >= 400 && res.status < 500) {
        const e = new Error('HTTP ' + res.status); e.fatal = true; throw e; // auth/session: retrying cannot help
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const line = text.split('\n').find((l) => l.indexOf('wrb.fr') !== -1);
      if (!line) throw new Error('no wrb.fr envelope');
      const env = JSON.parse(line);
      const frame = Array.isArray(env)
        ? (env.find((f) => Array.isArray(f) && f[0] === 'wrb.fr' && f[1] === rpcid) || env[0])
        : null;
      if (!frame) throw new Error('bad envelope');
      if (frame[2] == null) {
        // an error frame carries a code at index 5; a payload-less success does not
        if (frame[5] != null) throw new Error('rpc error ' + JSON.stringify(frame[5]).slice(0, 120));
        return null;
      }
      return JSON.parse(frame[2]);
    } catch (e) {
      lastErr = e;
      console.warn('[gpSwipe] ' + rpcid + ' attempt ' + attempt + '/' + retries + ' failed:', e.message);
      if (e && e.fatal) break;
      if (attempt < retries) await sleep(1200 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error(rpcid + ' failed');
}

// ---------------------------------------------------------------------------
// response parsing
// ---------------------------------------------------------------------------
function extOf(d) {
  const last = Array.isArray(d) ? d[d.length - 1] : null;
  return last && typeof last === 'object' && !Array.isArray(last) ? last : {};
}

// batchexecute serialises int64 fields as JSON strings, so a taken-date can
// arrive as either a number or a numeric string. Normalise once here: every
// consumer (resume cursor, mutation boundary, validMarkedItem) requires a real
// number, and a non-numeric value must stay invalid rather than become 0.
function numTs(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

function parseItem(d) {
  if (!Array.isArray(d) || !d[0]) return null;
  const ext = extOf(d);
  const dur = ext[76647426] && ext[76647426][0];
  const geo = ext[129168200];
  let place = null;
  try { place = geo[1][4][0][1][0][0] || null; } catch (e) { place = null; }
  return {
    mediaKey: d[0],
    thumb: d[1] && d[1][0],
    w: (d[1] && d[1][1]) || 0,
    h: (d[1] && d[1][2]) || 0,
    ts: numTs(d[2]),
    dedupKey: d[3],
    tz: typeof d[4] === 'number' ? d[4] : 0,
    created: d[5],
    archived: d[13] === true,
    isVideo: dur != null,
    duration: dur,
    isLive: !!ext[146008172],
    isFavorite: !!(ext[163238866] && ext[163238866][0] === true),
    place: place,
  };
}

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Google media identifiers are opaque, but destructive RPC boundaries still
// require a bounded, printable string. This rejects corrupted/tampered local
// rows before any request can reach Google without assuming an undocumented
// identifier alphabet.
function validRpcKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validMarkedItem(item) {
  return !!item && typeof item === 'object'
    && validRpcKey(item.mediaKey) && validRpcKey(item.dedupKey)
    && typeof item.thumb === 'string' && item.thumb.length > 0 && item.thumb.length <= 16384
    && typeof item.ts === 'number' && Number.isFinite(item.ts);
}

const api = {
  // source: 1 library, 2 archive, 3 both
  async listLibrary(o) {
    o = o || {};
    // Listing is an interactive startup path: two bounded attempts keep a
    // broken connection from looking like an endless loading screen. Retry in
    // the UI remains available without weakening any destructive operation.
    const r = await rpc(
      'lcxiM',
      [o.pageId || null, o.timestamp != null ? o.timestamp : null, o.pageSize || 200, null, 1, o.source || 1],
      { retries: 2, timeoutMs: 8000 }
    );
    if (!Array.isArray(r) || !Array.isArray(r[0])) throw new Error('unexpected library response');
    const rows = r[0];
    return {
      items: rows.map(parseItem).filter(Boolean),
      // Keep the pre-parse count so a future Google response-shape change is
      // distinguishable from a legitimate empty page. Without this signal a
      // malformed page can be paged through forever while the UI says Loading.
      rawItemCount: rows.length,
      nextPageId: (r && r[1]) || null,
      lastItemTimestamp: r && r[2] != null && Number.isFinite(Number(r[2])) ? Number(r[2]) : null,
    };
  },

  // Move a whole batch to trash. `ok` means the chunk received the expected
  // acknowledgement shape; callers still reconcile those keys against Trash
  // before treating individual photos as committed.
  // onProgress(done, total) is called after every chunk.
  async trashBatch(dedupKeys, onProgress) {
    return this._batch(dedupKeys, (keys) => rpc('XwAOJf', [null, 1, keys, 3]), onProgress);
  },
  async restoreBatch(dedupKeys, onProgress) {
    return this._batch(dedupKeys, (keys) => rpc('XwAOJf', [null, 3, keys, 2]), onProgress);
  },
  async _batch(dedupKeys, run, onProgress) {
    if (!Array.isArray(dedupKeys) || !dedupKeys.length) throw new Error('invalid empty media-key batch');
    const unique = new Set();
    for (const key of dedupKeys) {
      if (!validRpcKey(key) || unique.has(key)) throw new Error('invalid or duplicate media key');
      unique.add(key);
    }
    const ok = [], failed = [];
    let done = 0;
    let fatal = null;
    for (const part of chunk(dedupKeys, 50)) {
      if (fatal) {
        failed.push.apply(failed, part);
        done += part.length;
        if (onProgress) onProgress(done, dedupKeys.length);
        continue;
      }
      try {
        const ack = await run(part);
        // XwAOJf currently returns an array at response[0]. A missing/null or
        // structurally different acknowledgement is an unknown outcome, not a
        // success: never clear the user's review queue on a fail-open response.
        if (!Array.isArray(ack) || !Array.isArray(ack[0])) throw new Error('unexpected batch acknowledgement');
        ok.push.apply(ok, part);
      } catch (e) {
        console.error('[gpSwipe] batch chunk failed', e);
        failed.push.apply(failed, part);
        if (e && e.fatal) fatal = e; // session died: do not hammer the rest
      }
      done += part.length;
      if (onProgress) onProgress(done, dedupKeys.length);
    }
    return { ok: ok, failed: failed, fatal: fatal };
  },

  async itemInfo(mediaKey, opts) {
    const r = await rpc('VrseUb', [mediaKey, null, null, null, null], opts);
    const row = r && r[0];
    const known = ['15', '76647426', '146008172', '163238866', '225032867', '318563170'];
    const ext = Array.isArray(row)
      ? row.find((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).some((k) => known.indexOf(k) !== -1))
      : null;
    return { mediaKey: row && row[0], trashTimestamp: ext && ext[225032867] && ext[225032867][0] };
  },

  // Media keys currently sitting in Trash. Continue until the requested keys
  // have all been found or Google says there is no next page; a large existing
  // Trash must not make a newly deleted photo look unverified by accident.
  async trashKeys(opts) {
    opts = opts || {};
    const want = new Set(opts.want || []);
    const out = new Set();
    const seenTokens = new Set();
    let pageId = null;
    let complete = false;
    for (let page = 0; page < 100; page++) {
      const r = await rpc('zy0IHe', [pageId], opts);
      ((r && r[0]) || []).forEach((row) => { if (row && row[0]) out.add(row[0]); });
      if (!opts.scanAll && want.size && Array.from(want).every((k) => out.has(k))) break;
      const next = (r && r[1]) || null;
      if (!next) { complete = true; break; }
      if (seenTokens.has(String(next))) throw new Error('trash pagination token repeated');
      seenTokens.add(String(next));
      pageId = next;
    }
    // A Set remains convenient for callers; this non-enumerated semantic flag
    // distinguishes a complete absence check from a safety-capped scan.
    Object.defineProperty(out, 'complete', { value: complete, enumerable: false });
    return out;
  },

  // best effort: file name + byte size, so the review screen can show how much space is freed
  async bulkInfo(mediaKeys) {
    const req = [[[mediaKeys.map((k) => [k])], [[null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, [], null, null, null, null, null, null, null, null, null, null, []]]]];
    const r = await rpc('EWgK9e', req, { retries: 1 });
    const rows = (r && r[0] && r[0][1]) || [];
    const out = {};
    for (const row of rows) {
      if (!Array.isArray(row) || !row[0]) continue;
      const m = row[1] || [];
      out[row[0]] = { fileName: m[3] || null, size: typeof m[9] === 'number' ? m[9] : null };
    }
    return out;
  },
};

// image / video URLs served by Google's own CDN for this session
const imgUrl = (it, size) => it.thumb + '=w' + size + '-h' + size + '-k-no';

// A media key is served as several renditions, and which of them answers is
// undocumented and varies per item. Measured against a real library:
//   =m18  transcoded, range-seekable, answered for every item tested
//         (1.8-8.3s to metadata)
//   =dv   the untranscoded original; always answered, and fastest to first
//         metadata (0.7-1.3s), but served whole rather than by range
//   =m22  answered for one item in three — the rest return an image/png error
//         page — and needed ~9.5s when it did exist, so it is not worth a turn
// So there is nothing to guess up front: mount the first candidate straight
// away and move down the list only if it errors or never speaks. The earlier
// build probed the renditions before mounting anything, which cost the user up
// to twelve seconds of a dead card before playback could even begin.
// Nothing here leaves Google's own media hosts.
const VIDEO_VARIANTS = ['=m18', '=dv'];
const VIDEO_STALL_MS = 3500;    // silent this long: the rendition is not coming
const VIDEO_LAST_MS = 12000;    // the final candidate is given room before we give up
const videoUrl = (it, variant) => it.thumb + variant;

// The item list comes from Google, but a media URL is the one value here that
// the browser fetches on its own, so it is worth proving rather than trusting:
// a base that ever pointed elsewhere would turn a play press into a request to
// a third party. The stated guarantee is that nothing leaves Google's own
// hosts, so enforce exactly that.
function googleMediaBase(url) {
  if (typeof url !== 'string' || !url || url.length > 16384) return false;
  let u;
  try { u = new URL(url, location.href); } catch (e) { return false; }
  if (u.origin === location.origin) return true;   // the host page's own server
  return u.protocol === 'https:'
    && (u.hostname === 'googleusercontent.com' || u.hostname.endsWith('.googleusercontent.com')
      || u.hostname === 'google.com' || u.hostname.endsWith('.google.com'));
}

// Which rendition answered last time, as a hint only: every item still walks
// the whole list, so one awkward video cannot pin the rest of the session to a
// worse source.
const videoSource = {
  variant: null,
  order() {
    if (!this.variant) return VIDEO_VARIANTS.slice();
    return [this.variant].concat(VIDEO_VARIANTS.filter((v) => v !== this.variant));
  },
  remember(variant) { if (VIDEO_VARIANTS.indexOf(variant) !== -1) this.variant = variant; },
};

// ---------------------------------------------------------------------------
// Playback, shared by the swipe card and the review lightbox.
//
// `onState` is called with 'loading' | 'playing' | 'paused' | 'failed' so each
// surface paints its own affordance; the walk between renditions is invisible
// to it. The controller is parked on the host element so a teardown from
// anywhere (a decision, a close, a second press) can cancel a walk in flight
// instead of racing it.
// ---------------------------------------------------------------------------
function stopVideoIn(host) {
  if (!host) return;
  if (host._fpPlayer) { const p = host._fpPlayer; host._fpPlayer = null; p.stop(); }
  host.querySelectorAll('video').forEach((v) => {
    try { v._gone = true; v.pause(); v.remove(); v.removeAttribute('src'); v.load(); } catch (e) {}
  });
}

function playVideoIn(host, item, before, onState) {
  stopVideoIn(host);
  if (!item || !googleMediaBase(item.thumb)) { try { onState('failed'); } catch (e) {} return null; }
  const order = videoSource.order();
  let idx = 0, el = null, timer = null, done = false;
  const state = (s) => { try { onState(s); } catch (e) {} };
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const drop = () => {
    clear();
    if (!el) return;
    const v = el; el = null;
    try { v._gone = true; v.pause(); v.remove(); v.removeAttribute('src'); v.load(); } catch (e) {}
  };
  const stop = () => { done = true; drop(); };

  const next = () => {
    drop();
    if (done) return;
    if (idx >= order.length) { done = true; if (host._fpPlayer === ctl) host._fpPlayer = null; state('failed'); return; }
    const variant = order[idx++];
    const last = idx >= order.length;
    const v = h('video', { controls: true, playsinline: true, preload: 'auto' });
    el = v;
    // A rendition Google does not serve for this item errors within a few
    // hundred ms; one it will never serve simply stays silent, so silence
    // needs its own deadline.
    const advance = () => { if (v._gone || done) return; next(); };
    timer = setTimeout(advance, last ? VIDEO_LAST_MS : VIDEO_STALL_MS);
    v.addEventListener('error', advance);
    v.addEventListener('loadedmetadata', () => { clear(); videoSource.remember(variant); }, { once: true });
    v.addEventListener('playing', () => state('playing'));
    v.addEventListener('pause', () => state('paused'));
    v.addEventListener('ended', () => state('paused'));
    v.src = videoUrl(item, variant);
    host.insertBefore(v, before || null);
    v.play().catch(() => {});
  };

  const ctl = { stop: stop, el: () => el };
  host._fpPlayer = ctl;
  state('loading');
  next();
  return ctl;
}

const photoPageUrl = (it) => BASE + 'photo/' + it.mediaKey;
const trashPageUrl = () => BASE + 'trash';
