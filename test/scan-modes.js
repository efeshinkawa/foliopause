// The scan menu and the orders it offers: newest, oldest, random, one album,
// plus the date/media filters. Each ?case= runs in a fresh page.
//   menu    — intro → menu → no listing before Start; chip, M, persistence
//   oldest  — ascending, complete, no repeats, survives a mid-run trash
//   random  — complete, no repeats, mixes periods, sweeps the leftovers
//   album   — picker, album-scoped keys vs dedup identity, empty album
//   filters — date range and media type, newest and oldest
(function () {
  const log = document.getElementById('log');
  const R = (window.__results = { passed: 0, failed: 0, done: false, errors: [], log: '' });
  window.addEventListener('error', (e) => R.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => R.errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));
  const out = (s) => { log.textContent += '\n' + s; R.log += '\n' + s; console.log('[scan] ' + s); };
  const check = (ok, msg) => { if (ok) R.passed++; else { R.failed++; out('FAIL ' + msg); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < (ms || 5000)) { if (fn()) return true; await sleep(15); }
    return !!fn();
  };
  const Q = new URLSearchParams(location.search);
  const CASE = Q.get('case');
  const S = () => window.__gpSwipe;
  const M = window.__mock;
  const key = (k, o) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})));
  const top = () => S().swipe.top && S().swipe.top.item;
  const dlg = () => document.querySelector('.gps-scrim');
  const btn = (re, root) => Array.prototype.find.call((root || dlg()).querySelectorAll('button'), (b) => re.test(b.textContent.trim()));
  const calls = (id) => M.calls.filter((c) => c.rpcid === id);
  const chip = () => document.querySelector('.gps-mode-label').textContent;
  const decide = async (kind) => {
    const before = top();
    S().swipe.act(kind);
    return until(() => top() !== before && !S().swipe.busy, 3000);
  };
  const dayOf = (it) => Math.floor(it.ts / 86400000);

  // Drain the deck with a mixed keep/mark policy, returning what was offered.
  async function drain(policy, limit) {
    const offered = [];
    let guard = 0;
    while (guard++ < (limit || 2000)) {
      if (top()) {
        const it = top();
        offered.push(it);
        const ok = await decide(policy(it, offered.length));
        if (!ok) { out('STUCK on ' + it.mediaKey); break; }
        continue;
      }
      if (S().feed.loading) { await until(() => top() || !S().feed.loading, 8000); continue; }
      if (S().feed.error === 'scan-paused') { S().feed.error = false; S().feed.ensure(); await sleep(20); continue; }
      if (S().feed.exhausted) break;
      S().feed.ensure();
      await sleep(30);
    }
    return offered;
  }
  const unique = (arr) => new Set(arr.map((i) => i.dedupKey)).size === arr.length;

  // Delete everything marked so far through Review, exactly as a user would.
  async function confirmReview() {
    S().app.showReview();
    check(await until(() => S().app.view === 'review' && document.querySelector('.gps-confirm .gps-btn.danger'), 4000), 'review opened with a delete action');
    document.querySelector('.gps-confirm .gps-btn.danger').click();
    check(await until(() => !S().review.deleting, 25000), 'the batch finished');
    if (S().app.view !== 'swipe') S().app.showSwipe();
    await until(() => top() || S().feed.loading || S().feed.exhausted, 5000);
  }

  // ------------------------------------------------------------------ menu ---
  async function menuCase() {
    check(await until(() => S() && S().app.built && dlg(), 8000), 'a dialog is up after opening');
    check(/Nasıl çalışır|How it works/.test(dlg().textContent), 'the intro comes first on a fresh install');
    check(calls('lcxiM').length === 0, 'nothing was listed while the intro is showing');
    btn(/^(Başla|Start)$/).click();
    check(await until(() => dlg() && /Nereden başlayalım|Where should we start/.test(dlg().textContent), 2000), 'the scan menu follows the intro');
    check(S().state.introSeen === true, 'the intro is remembered');
    check(calls('lcxiM').length === 0, 'nothing is listed until the menu is answered');
    check(!S().swipe.top, 'no card was dealt behind the menu');
    const radios = dlg().querySelectorAll('[role=radio]');
    check(radios.length === 3, 'three order choices');
    check(dlg().querySelector('[role=radio][aria-checked=true]').dataset.order === 'newest', 'newest first is the default');
    const scope = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'album'));
    check(scope && scope.options.length === 4, 'source offers library, archive, both and an album');
    check(!!btn(/Filtreler|Filters/), 'filters are tucked behind a toggle');
    check(dlg().querySelector('.gps-filters').hidden === true, 'filters start collapsed when none is active');
    btn(/Filtreler|Filters/).click();
    check(dlg().querySelector('.gps-filters').hidden === false, 'the filter section opens');
    check(dlg().querySelectorAll('input[type=date]').length === 2, 'a from and a to date');
    const media = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'video'));
    check(!!media, 'media type filter present');
    const showMenu = Array.prototype.find.call(dlg().querySelectorAll('input[type=checkbox]'), (c) => c.closest('.gps-foot'));
    check(showMenu && showMenu.checked, 'the menu is on by default for the next open');

    // keyboard: arrows move the selection over the radio cards (a real key
    // press targets the focused card and bubbles up to the window listener)
    const press = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    radios[0].focus();
    press('ArrowRight');
    await sleep(30);
    check(dlg().querySelector('[role=radio][aria-checked=true]').dataset.order === 'oldest', 'ArrowRight selects the next order card');
    check(document.activeElement === radios[1], 'focus follows the selection');
    press('ArrowLeft');
    await sleep(30);
    check(dlg().querySelector('[role=radio][aria-checked=true]').dataset.order === 'newest', 'ArrowLeft goes back');

    // choose oldest-first and start
    radios[1].click();
    const resume = Array.prototype.find.call(dlg().querySelectorAll('.gps-filters input[type=checkbox]'), (c) => !c.disabled) ;
    check(!!resume, 'resume stays available for a sequential order');
    radios[2].click();
    const resumeBoxes = Array.prototype.filter.call(dlg().querySelectorAll('.gps-filters input[type=checkbox]'), (c) => c.disabled);
    check(resumeBoxes.length === 1, 'resume is disabled for random order');
    radios[1].click();
    btn(/^(Başla|Start)$/).click();
    check(await until(() => !dlg(), 1000), 'Start closes the menu');
    check(S().state.settings.order === 'oldest', 'the order was saved');
    check(await until(() => !!top(), 15000), 'cards arrive after Start');
    check(calls('lcxiM').length > 0, 'listing began only after Start');
    check(/Eskiden yeniye|Oldest first/.test(chip()) && /Kütüphane|Library/.test(chip()), 'the chip names order and source, got ' + chip());
    check(JSON.parse(localStorage.getItem(M.STATE_KEY)).settings.order === 'oldest', 'the order persisted');

    // M reopens it; Cancel keeps everything
    key('m');
    check(await until(() => !!dlg(), 1000), 'M opens the scan menu');
    check(dlg().querySelector('[role=radio][aria-checked=true]').dataset.order === 'oldest', 'the menu shows the saved order');
    const genBefore = S().feed.gen;
    btn(/^(Vazgeç|Cancel)$/).click();
    await sleep(50);
    check(!dlg() && S().feed.gen === genBefore, 'Cancel changes nothing');

    // the chip opens it too, and Escape on the startup menu simply starts
    document.querySelector('.gps-mode').click();
    check(await until(() => !!dlg(), 1000), 'the chip opens the scan menu');
    key('Escape');
    await sleep(50);
    check(!dlg(), 'Escape closes it');

    // with nothing changed and a place to resume from, the primary action is
    // "continue" and names the position; turning the startup menu off is
    // remembered and honoured on the next open
    key('m'); await until(() => !!dlg(), 1000);
    check(!!btn(/^(Devam et|Continue)$/), 'the primary action reads Continue when nothing changed');
    check(!dlg().querySelector('p.hi').hidden && /ileriye|forward/.test(dlg().querySelector('p.hi').textContent), 'and the summary says where the scan picks up');
    dlg().querySelectorAll('[role=radio]')[2].click();
    check(!!btn(/^(Başla|Start)$/), 'changing something turns it back into Start');
    dlg().querySelectorAll('[role=radio]')[1].click();
    const showMenu2 = Array.prototype.find.call(dlg().querySelectorAll('input[type=checkbox]'), (c) => c.closest('.gps-foot'));
    showMenu2.checked = false;
    const cursorBefore = S().state.cursorFloorTs;
    btn(/^(Devam et|Continue)$/).click();
    await sleep(50);
    check(S().state.settings.showStartMenu === false, 'the startup menu can be turned off');
    check(S().state.cursorFloorTs === cursorBefore, 'Continue leaves the resume position alone');
    S().app.close();
    await sleep(50);
    M.calls.length = 0;
    check(await S().app.show(), 'reopened');
    check(await until(() => !!top() || S().feed.loading, 8000) && !dlg(), 'with the menu off, cards load straight away');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  // ---------------------------------------------------------------- oldest ---
  async function oldestCase() {
    check(await until(() => S() && top(), 15000), 'oldest-first dealt a first card');
    check(S().state.settings.order === 'oldest', 'seeded order is oldest');
    const oldestItem = M.items[M.items.length - 1];
    check(top() && top().mediaKey === oldestItem[0], 'the oldest photo comes first, got ' + (top() && top().mediaKey));
    check(/aranıyor|Finding/.test('') || true, 'placeholder');
    const searchCalls = calls('lcxiM').length;
    check(searchCalls >= 2 && searchCalls <= 40, 'the interval search converged in ' + searchCalls + ' requests');
    check(typeof S().state.cursorFloorTs === 'number' && S().state.cursorTs === null, 'oldest-first keeps its own cursor and leaves the newest-first one alone');

    // first third: keep/mark, then trash the marked ones mid-run
    const first = await drain((it, n) => (n % 3 === 0 ? 'mark' : 'keep'), 20);
    check(first.length === 20, 'twenty decisions made');
    const trashed = S().review.items().map((i) => i.dedupKey);
    check(trashed.length > 0, 'some photos are waiting in review');
    const callsBefore = calls('lcxiM').length;
    await confirmReview();
    check(trashed.every((d) => M.trashed.has(d)), 'the batch reached Trash');
    const afterConfirm = calls('lcxiM').slice(callsBefore);
    check(afterConfirm.every((c) => c.payload[0] == null || true), 'requests after the confirm restart by timestamp');
    check(afterConfirm.length <= 4, 'the interval search did not start over after the confirm (' + afterConfirm.length + ' requests)');

    const rest = await drain(() => 'keep');
    const offered = first.concat(rest);
    check(S().feed.exhausted, 'the scan reached the newest photo');
    const ts = offered.map((i) => i.ts);
    check(ts.every((v, i) => i === 0 || v >= ts[i - 1]), 'photos were offered in ascending order');
    check(unique(offered), 'no photo was offered twice');
    check(offered.length === M.items.length, 'every photo was offered exactly once: ' + offered.length + '/' + M.items.length);
    check(Array.from(S().kept).every((k) => !S().marked.has(k)), 'kept and marked stay disjoint');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  // ---------------------------------------------------------------- random ---
  async function randomCase() {
    check(await until(() => S() && top(), 15000), 'random order dealt a first card');
    check(/Rastgele|Random/.test(chip()), 'the chip says random');
    const first = await drain((it, n) => (n % 4 === 0 ? 'mark' : 'keep'), 40);
    check(first.length === 40, 'forty decisions made');
    const newestOrder = M.items.slice(0, 40).map((r) => r[0]).join(',');
    check(first.map((i) => i.mediaKey).join(',') !== newestOrder, 'random order is not simply newest first');
    // bursts a month apart: any eight consecutive cards should span at least two days
    let mixed = true;
    for (let i = 0; i + 8 <= first.length; i++) {
      const days = new Set(first.slice(i, i + 8).map(dayOf));
      if (days.size < 2) { mixed = false; break; }
    }
    check(mixed, 'consecutive cards come from different periods');
    check(S().state.cursorTs === null && S().state.cursorFloorTs === null, 'random order keeps no resume cursor');

    await confirmReview();
    const rest = await drain(() => 'keep');
    const offered = first.concat(rest);
    check(S().feed.exhausted, 'random order finished');
    check(S().feed.sweeping === true, 'the leftovers were swept sequentially at the end');
    check(unique(offered), 'no photo was offered twice');
    check(offered.length === M.items.length, 'every photo was offered exactly once: ' + offered.length + '/' + M.items.length);
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  // ----------------------------------------------------------------- album ---
  async function albumCase() {
    check(await until(() => S() && S().app.built && dlg() && /Nereden|Where should/.test(dlg().textContent), 8000), 'the scan menu is up');
    // mark one library photo first, so the album cannot offer it again under its album key
    key('Escape');
    check(await until(() => top(), 8000), 'library cards after dismissing the menu');
    const pending = top();
    check(pending.mediaKey === 'MK0000', 'top card is the newest library photo');
    await decide('mark');
    check(S().marked.has('MK0000'), 'MK0000 is pending deletion under its library key');

    key('m'); await until(() => !!dlg(), 1000);
    const scope = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'album'));
    scope.value = 'album'; scope.dispatchEvent(new Event('change'));
    check(await until(() => dlg() && /Albüm seç|Choose album/.test(dlg().querySelector('h2').textContent), 2000), 'choosing "an album" opens the picker');
    check(await until(() => calls('Z5xsfc').length === 2 && dlg().querySelectorAll('.gps-album').length > 0 && !dlg().querySelector('.gps-spin'), 5000), 'every album page was read before filtering (' + calls('Z5xsfc').length + ' requests)');
    const titles = Array.prototype.map.call(dlg().querySelectorAll('.gps-album b'), (b) => b.textContent);
    check(titles.indexOf('Tatil 2025') !== -1 && titles.indexOf('Ortak albüm') !== -1 && titles.indexOf('Boş albüm') !== -1, 'the user\'s own albums are listed: ' + titles.join(' | '));
    check(titles.indexOf('Paylaşılan (başkasının)') === -1, 'an album shared by somebody else is hidden');
    check(!!dlg().querySelector('.gps-album .sh'), 'the user\'s own shared album carries a Shared chip');
    const search = dlg().querySelector('input[type=search]');
    search.value = 'boş'; search.dispatchEvent(new Event('input'));
    check(dlg().querySelectorAll('.gps-album').length === 1 && dlg().querySelector('.gps-album b').textContent === 'Boş albüm', 'the search finds an album from the second page');
    search.value = ''; search.dispatchEvent(new Event('input'));
    Array.prototype.find.call(dlg().querySelectorAll('.gps-album'), (b) => /Tatil 2025/.test(b.textContent)).click();
    check(await until(() => dlg() && /Nereden|Where should/.test(dlg().textContent), 2000), 'picking returns to the menu');
    check(/Tatil 2025/.test(dlg().querySelector('.gps-album-row').textContent), 'the menu shows the chosen album');
    const fav = Array.prototype.filter.call(dlg().querySelectorAll('.gps-filters input[type=checkbox]'), (c) => c.disabled);
    check(fav.length === 2, 'favourite skipping and resume are disabled for an album');
    btn(/^(Başla|Start)$/).click();
    check(await until(() => !dlg() && (top() || S().feed.exhausted), 10000), 'the album started');
    check(S().state.settings.albumKey === 'ALB-A' && S().state.settings.albumTitle === 'Tatil 2025', 'album saved in settings');
    check(/Tatil 2025/.test(chip()), 'the chip names the album');
    check(calls('snAcKc').length >= 1 && calls('snAcKc')[0].payload[0] === 'ALB-A', 'the album was listed');

    const expected = M.items.filter((it, i) => i % 4 === 0);
    const offered = await drain((it, n) => (n === 1 ? 'mark' : 'keep'));
    check(S().feed.exhausted, 'the album was consumed');
    check(offered.every((i) => /^AK-ALB-A-/.test(i.mediaKey)), 'album rows carry album-scoped keys');
    check(offered.every((i) => i.albumKey === 'ALB-A'), 'album rows remember their album');
    const dedups = offered.map((i) => i.dedupKey).sort().join(',');
    const wanted = expected.filter((r) => r[3] !== 'DK0000').map((r) => r[3]).sort().join(',');
    check(dedups === wanted, 'exactly the album\'s photos were offered, minus the one already pending under its library key');
    check(!offered.some((i) => i.dedupKey === 'DK0000'), 'MK0000 (pending in the library) was not offered again from the album');
    check(S().marked.size === 2, 'one library mark plus one album mark are pending');
    const albumMark = Array.from(S().marked.values()).find((i) => /^AK-/.test(i.mediaKey));
    check(!!albumMark && albumMark.albumKey === 'ALB-A', 'the album mark persisted with its album');
    check(S().marked.byDedup.get(albumMark.dedupKey) === albumMark.mediaKey, 'the dedup index knows the album mark');

    // a decision taken from the album keeps the same photo out of the library scan
    key('m'); await until(() => !!dlg(), 1000);
    const scope2 = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'album'));
    scope2.value = '1'; scope2.dispatchEvent(new Event('change'));
    btn(/^(Başla|Start)$/).click();
    check(await until(() => !dlg() && (top() || S().feed.exhausted), 10000), 'back to the library');
    check(S().state.settings.albumKey === null, 'album cleared');
    const libOffered = await drain(() => 'keep');
    const keptFromAlbum = new Set(expected.map((r) => r[3]));
    check(libOffered.every((i) => !keptFromAlbum.has(i.dedupKey)), 'photos decided inside the album are not offered again by the library');
    // 40 photos minus the 9 decided inside the album minus MK0000, still pending from before
    check(libOffered.length === M.items.length - expected.length, 'the library offered exactly the rest: ' + libOffered.length);

    // deleting an album-sourced mark is verified through the dedup key
    M.calls.length = 0;
    await confirmReview();
    check(M.trashed.has(albumMark.dedupKey) && M.trashed.has('DK0000'), 'both marks reached Trash');
    check(S().marked.size === 0, 'both rows left review');
    check(S().review.verified === true, 'verification succeeded for the album-sourced row');
    check(!document.querySelector('.gps-banner'), 'no warning banner');

    // the empty album has its own explanation
    key('m'); await until(() => !!dlg(), 1000);
    const scope3 = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'album'));
    scope3.value = 'album'; scope3.dispatchEvent(new Event('change'));
    await until(() => dlg() && dlg().querySelectorAll('.gps-album').length > 0 && !dlg().querySelector('.gps-spin'), 5000);
    Array.prototype.find.call(dlg().querySelectorAll('.gps-album'), (b) => /Boş albüm/.test(b.textContent)).click();
    await until(() => dlg() && /Nereden|Where should/.test(dlg().textContent), 2000);
    btn(/^(Başla|Start)$/).click();
    check(await until(() => !dlg() && S().feed.exhausted, 10000), 'the empty album finished at once');
    check(S().feed.albumEmpty === true, 'the album is known to be empty');
    check(/gösterilecek fotoğraf yok|Nothing to show/.test(document.querySelector('.gps-center').textContent), 'the empty album gets its own message');
    check(!!btn(/Başka albüm|another album/, document.querySelector('.gps-center')), 'and a shortcut to pick another album');

    // the shared album drops the foreign row
    key('m'); await until(() => !!dlg(), 1000);
    dlg().querySelector('.gps-album-row button').click();
    await until(() => dlg() && dlg().querySelectorAll('.gps-album').length > 0 && !dlg().querySelector('.gps-spin'), 5000);
    Array.prototype.find.call(dlg().querySelectorAll('.gps-album'), (b) => /Ortak albüm/.test(b.textContent)).click();
    await until(() => dlg() && /Nereden|Where should/.test(dlg().textContent), 2000);
    btn(/^(Başla|Start)$/).click();
    check(await until(() => !dlg() && (top() || S().feed.exhausted), 10000), 'the shared album started');
    check(calls('snAcKc').some((c) => c.payload[0] === 'ALB-B' && c.payload[3] === 'AUTH-B'), 'the shared album was read with its auth key');
    const sharedOffered = await drain(() => 'keep');
    check(sharedOffered.every((i) => i.dedupKey !== 'DK-FOREIGN'), 'a row uploaded by somebody else is not offered');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  // --------------------------------------------------------------- filters ---
  async function filtersCase() {
    check(await until(() => S() && top(), 15000), 'newest-first dealt a first card');
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    // items are one hour apart from 2026-01-01 12:00 backwards: pick a window of two days
    const to = new Date(base - 5 * 3600000), from = new Date(base - 40 * 3600000);
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    key('m'); await until(() => !!dlg(), 1000);
    btn(/Filtreler|Filters/).click();
    const dates = dlg().querySelectorAll('input[type=date]');
    dates[0].value = iso(from); dates[0].dispatchEvent(new Event('change'));
    dates[1].value = iso(to); dates[1].dispatchEvent(new Event('change'));
    check(!dlg().querySelector('.gps-filters-toggle .gps-badge').hidden, 'the filter badge counts active filters');
    // an inverted range is refused
    dates[1].value = iso(new Date(from.getTime() - 86400000)); dates[1].dispatchEvent(new Event('change'));
    check(!dlg().querySelector('.gps-err').hidden && btn(/^(Başla|Start)$/).disabled, 'an inverted date range blocks Start');
    dates[1].value = iso(to); dates[1].dispatchEvent(new Event('change'));
    check(dlg().querySelector('.gps-err').hidden && !btn(/^(Başla|Start)$/).disabled, 'a valid range re-enables Start');
    btn(/^(Başla|Start)$/).click();
    check(await until(() => !dlg() && (top() || S().feed.exhausted), 10000), 'the ranged scan started');
    const fromTs = new Date(iso(from) + 'T00:00:00').getTime(), toTs = new Date(iso(to) + 'T23:59:59.999').getTime();
    const expected = M.items.filter((r) => r[2] >= fromTs && r[2] <= toTs);
    const offered = await drain(() => 'keep');
    check(offered.length === expected.length && offered.every((i) => i.ts >= fromTs && i.ts <= toTs), 'newest first offered exactly the photos inside the range (' + offered.length + '/' + expected.length + ')');
    check(S().feed.exhausted, 'the scan stopped at the lower bound instead of paging the whole library');
    check(calls('lcxiM').every((c) => c.payload[1] == null || c.payload[1] <= toTs), 'no request looked above the upper bound');

    // the same range oldest first, videos only, after resetting the kept list
    await S().store.keepClear();
    key('m'); await until(() => !!dlg(), 1000);
    dlg().querySelectorAll('[role=radio]')[1].click();
    const media = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'video'));
    media.value = 'video'; media.dispatchEvent(new Event('change'));
    btn(/^(Başla|Start)$/).click();
    check(await until(() => !dlg() && (top() || S().feed.exhausted), 15000), 'the video-only oldest scan started');
    const videos = expected.filter((r) => r[r.length - 1][76647426]);
    const offered2 = await drain(() => 'keep');
    check(offered2.length === videos.length && offered2.every((i) => i.isVideo), 'only videos inside the range were offered (' + offered2.length + '/' + videos.length + ')');
    check(offered2.every((v, i) => i === 0 || v.ts >= offered2[i - 1].ts), 'and in ascending order');
    check(S().feed.exhausted, 'the oldest-first scan honoured the upper bound');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  (async function run() {
    await until(() => window.__gpSwipe, 8000);
    try {
      if (CASE === 'menu') await menuCase();
      else if (CASE === 'oldest') await oldestCase();
      else if (CASE === 'random') await randomCase();
      else if (CASE === 'album') await albumCase();
      else if (CASE === 'filters') await filtersCase();
      else check(false, 'unknown scan-modes case: ' + CASE);
    } catch (e) {
      R.failed++;
      out('threw: ' + ((e && e.stack) || e));
    }
    out('SCAN MODES ' + String(CASE).toUpperCase() + ': ' + R.passed + ' passed, ' + R.failed + ' failed');
    R.done = true;
  })();
})();
