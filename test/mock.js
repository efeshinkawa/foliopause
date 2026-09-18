// Mock of the Google Photos internals the cleaner depends on: WIZ_global_data
// plus the batchexecute endpoint (lcxiM, XwAOJf, VrseUb, zy0IHe, EWgK9e,
// Z5xsfc, snAcKc).
// Query params: n=items  page=pageSize  every=reviewEvery  acct=namespace  intro=0|1
//               menu=0|1 (show the scan menu on open)  order=newest|oldest|random
//               albpage=albums per Z5xsfc page  spread=hours between photos
(function () {
  const Q = new URLSearchParams(location.search);
  const N = parseInt(Q.get('n') || '30', 10);
  const pageCap = parseInt(Q.get('page') || '10', 10);
  const albumPageCap = parseInt(Q.get('albpage') || '100', 10);
  const spreadHours = parseFloat(Q.get('spread') || '1');
  // burst=K: photos come in bursts of K taken minutes apart, bursts a month
  // apart — the shape of a phone library, which random order must mix up.
  const burst = parseInt(Q.get('burst') || '0', 10);
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
      source: 1, dateFrom: '', dateTo: '', resume: true, mediaType: 'all', skipFav: false,
      order: Q.get('order') || 'newest', albumKey: null, albumTitle: '', albumAuthKey: null,
      showStartMenu: Q.get('menu') === '1',
      reviewEvery: parseInt(Q.get('every') || '0', 10), theme: 'dark',
    },
    stats: { kept: 0, deleted: 0, freedBytes: 0 },
    cursorTs: null, sinceReview: 0,
    introSeen: Q.get('intro') !== '1',
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(seeded));

  const base = Date.UTC(2026, 0, 1, 12, 0, 0);
  const ME = 'ACTOR-ME', OTHER = 'ACTOR-OTHER';
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
      burst > 0
        ? base - Math.floor(i / burst) * 30 * 86400000 - (i % burst) * 60000   // bursts, newest first
        : base - Math.round(i * spreadHours * 3600 * 1000),                     // evenly spread, newest first
      'DK' + String(i).padStart(4, '0'),
      3600 * 1000,
      base - i * 1000,
      [ME], null, null, null, null, null, null,
      false,
      ext,
    ]);
  }

  // Albums. A is the user's own; B is the user's own but shared out and holds
  // one row uploaded by somebody else (not part of this library); C was shared
  // TO the user by somebody else; E is empty. Album metadata mirrors Z5xsfc:
  // the descriptive block lives under key 72930366 in the trailing object.
  const foreign = ['MK-FOREIGN', ['pic1.svg?i=foreign', 1200, 800], base - 30 * 60 * 1000, 'DK-FOREIGN', 3600 * 1000, base,
    [OTHER], null, 2, { 15: 1 }];
  const albumDefs = [
    { key: 'ALB-A', title: 'Tatil 2025', owner: ME, kind: 1, shared: false, pick: (it, i) => i % 4 === 0 },
    { key: 'ALB-B', title: 'Ortak albüm', owner: ME, kind: 1, shared: true, authKey: 'AUTH-B', pick: (it, i) => i % 3 === 1, extra: [foreign] },
    { key: 'ALB-C', title: 'Paylaşılan (başkasının)', owner: OTHER, kind: 4, shared: true, authKey: 'AUTH-C', pick: () => false, extra: [foreign] },
    { key: 'ALB-E', title: 'Boş albüm', owner: ME, kind: 1, shared: false, pick: () => false },
  ];
  // Inside an album Google hands out a different mediaKey for the same photo
  // (the dedupKey is what stays the same), so album rows are copies with
  // their own key. EWgK9e/VrseUb only know the library keys.
  const albumRows = (def) => items.filter((it, i) => def.pick(it, i))
    .map((it, n) => { const row = it.slice(); row[0] = 'AK-' + def.key + '-' + it[0]; return row; })
    .concat(def.extra || []);
  const albumRow = (def) => {
    const rows = albumRows(def);
    const first = rows[0];
    const ts = rows.map((r) => r[2]);
    const meta = [def.kind, def.title, [ts.length ? Math.min.apply(null, ts) : null, ts.length ? Math.max.apply(null, ts) : null,
      null, null, base, null, null, null, null, base], rows.length, def.shared ? true : null, def.authKey || null];
    const row = [def.key, first ? [first[1][0], first[1][1], first[1][2]] : null, null, null, null, null, [def.owner], [[3], [4]]];
    if (def.kind === 4) row.push(null, null, null);        // shared-with-me rows are longer; the ext object stays last
    row.push({ 72930366: meta });
    return row;
  };

  const mock = window.__mock = {
    items, NS, STATE_KEY, albumDefs, ME, OTHER, foreign,
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
    Z5xsfc: function (p) {
      const start = p[0] ? parseInt(p[0], 10) : 0;
      const size = Math.min(p[7] || 100, albumPageCap);
      const rows = albumDefs.slice(start, start + size).map(albumRow);
      const next = start + size < albumDefs.length ? String(start + size) : null;
      return { payload: [rows, next, [1], [1]] };
    },
    snAcKc: function (p) {
      const def = albumDefs.find((d) => d.key === p[0]);
      if (!def) return { error: [5] };
      if (def.authKey && p[3] !== def.authKey) return { error: [7] };
      const live = albumRows(def).filter((r) => !mock.trashed.has(r[3]));
      const start = p[1] ? parseInt(p[1], 10) : 0;
      const page = live.slice(start, start + pageCap);
      // Google ends an album with an empty-string token, not null.
      const next = start + pageCap < live.length ? String(start + pageCap) : '';
      const meta = [def.key, def.title, null, null, null, [def.owner, '1'], null, null, null, null,
        null, null, def.key, null, false, null, false, 0, null, def.authKey || null, null, live.length];
      return { payload: [null, page, next, meta, null, 0] };
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
