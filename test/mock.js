// Mock of the Google Photos internals the cleaner depends on: WIZ_global_data
// plus the batchexecute endpoint (lcxiM, XwAOJf, VrseUb, zy0IHe, EWgK9e).
// Query params: n=items  page=pageSize  every=reviewEvery  acct=namespace  intro=0|1
(function () {
  const Q = new URLSearchParams(location.search);
  const N = parseInt(Q.get('n') || '30', 10);
  const pageCap = parseInt(Q.get('page') || '10', 10);
  const acct = Q.get('acct') || String(Math.random()).slice(2);
  let emptyFirstPending = Q.get('emptyFirst') === '1';

  window.WIZ_global_data = {
    SNlM0e: 'AT-MOCK', FdrFJe: '-123', cfb2h: 'boq_mock',
    eptZe: '/_/PhotosUi/', oPEP7c: 'mock-' + acct,
  };

  // same namespace hash the app uses, so we can seed settings before it boots
  const hash = (raw) => {
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const NS = hash('mock-' + acct);
  const STATE_KEY = 'gpSwipe.state.v2.' + NS;
  const seeded = {
    settings: {
      source: 1, startDate: '', resume: true, skipVideos: false, skipFav: false,
      reviewEvery: parseInt(Q.get('every') || '0', 10), theme: 'dark',
    },
    stats: { kept: 0, deleted: 0, freedBytes: 0 },
    cursorTs: null, sinceReview: 0,
    introSeen: Q.get('intro') !== '1',
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(seeded));

  const base = Date.UTC(2026, 0, 1, 12, 0, 0);
  const items = [];
  for (let i = 0; i < N; i++) {
    const ext = {
      15: [1],
      163238866: [i % 7 === 3],
      129168200: [null, [[0, 0], null, null, null, [[null, [['Place ' + i]]]]]],
    };
    if (i % 5 === 4) ext[76647426] = [12000 + i * 1000];   // video
    if (i % 9 === 8) ext[146008172] = [1, 1500];           // live photo
    items.push([
      'MK' + String(i).padStart(4, '0'),
      ['pic' + (i % 6) + '.svg?i=' + i, 1200 + (i % 3) * 200, 800],
      base - i * 3600 * 1000,                              // newest first
      'DK' + String(i).padStart(4, '0'),
      3600 * 1000,
      base - i * 1000,
      null, null, null, null, null, null, null,
      false,
      ext,
    ]);
  }

  const mock = window.__mock = {
    items, NS, STATE_KEY,
    trashed: new Set(),      // dedup keys
    failNextTrash: 0,        // how many XwAOJf calls should return an error frame
    fatalTrash: false,       // make trash calls fail with HTTP 401 (session expired)
    failNextList: 0,
    delay: 5,
    calls: [],
    reset() { this.trashed.clear(); this.failNextTrash = 0; this.fatalTrash = false; this.failNextList = 0; this.delay = 5; this.calls.length = 0; },
    live() { return items.filter((it) => !this.trashed.has(it[3])); },
  };
  const byDedup = new Map(items.map((it) => [it[3], it]));
  const byKey = new Map(items.map((it) => [it[0], it]));

  const handlers = {
    lcxiM: function (p) {
      if (mock.failNextList > 0) { mock.failNextList--; return { error: [3] }; }
      // Google can occasionally yield an empty intermediate page with a valid
      // continuation token. `0` restarts at the first real row without loss.
      if (emptyFirstPending && p[0] == null) {
        emptyFirstPending = false;
        return { payload: [[], '0', null] };
      }
      const timestamp = p[1], pageId = p[0], pageSize = p[2];
      let list = mock.live();
      if (typeof timestamp === 'number') list = list.filter((it) => it[2] <= timestamp);
      const start = pageId ? parseInt(pageId, 10) : 0;
      const size = Math.min(pageSize || 200, pageCap);
      const page = list.slice(start, start + size);
      const next = start + size < list.length ? String(start + size) : null;
      return { payload: [page, next, page.length ? String(page[page.length - 1][2]) : null] };
    },
    XwAOJf: function (p) {
      if (mock.fatalTrash) return { http: 401 };
      if (mock.failNextTrash > 0) { mock.failNextTrash--; return { error: [3] }; }
      const action = p[1], keys = p[2];
      if (action === 1) keys.forEach((k) => { if (byDedup.has(k)) mock.trashed.add(k); });
      else if (action === 3) keys.forEach((k) => mock.trashed.delete(k));
      return { payload: [[keys.length]] };
    },
    VrseUb: function (p) {
      const it = byKey.get(p[0]);
      if (!it) return { error: [5] };
      const ext = { 163238866: [false] };
      if (mock.trashed.has(it[3])) ext[225032867] = [Date.now()];
      return { payload: [[it[0], [it[1][0], it[1][1], it[1][2]], it[2], it[3], it[4], it[5], null, null, null, ext], 'dl'] };
    },
    zy0IHe: function () {
      const rows = items.filter((it) => mock.trashed.has(it[3])).map((it) => [it[0], it[1], it[2], it[3], it[4], it[5]]);
      return { payload: [rows, null] };
    },
    EWgK9e: function (p) {
      const keys = p[0][0][0];
      const rows = keys.map(function (pair) {
        const it = byKey.get(pair[0]);
        if (!it) return null;
        const i = items.indexOf(it);
        const size = 100000 + i * 1000;
        return [pair[0], [null, null, null, 'IMG_' + i + '.JPG', null, null, it[2], it[4], it[5], size, [1, size, 2]]];
      }).filter(Boolean);
      return { payload: [[null, rows]] };
    },
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, init) {
    const u = String(url);
    if (u.indexOf('/data/batchexecute') === -1) return realFetch(url, init);
    const rpcid = new URL(u, location.href).searchParams.get('rpcids');
    const payload = JSON.parse(JSON.parse(new URLSearchParams(init.body).get('f.req'))[0][0][1]);
    mock.calls.push({ rpcid: rpcid, payload: payload });
    await new Promise((r) => setTimeout(r, mock.delay));
    const h = handlers[rpcid];
    const res = h ? h(payload) : { error: [2] };
    if (res.http) return new Response('', { status: res.http });
    const frame = res.error
      ? ['wrb.fr', rpcid, null, null, null, res.error, 'generic']
      : ['wrb.fr', rpcid, JSON.stringify(res.payload), null, null, null, 'generic'];
    const text = ")]}'\n\n42\n" + JSON.stringify([frame]) + '\n25\n[["di",12],["af.httprm",12,"-1",7]]\n';
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
  };
})();
