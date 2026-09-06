// Behavioural tests for the v2 (deferred-delete) cleaner.
// Serve the project over http and open test/harness.html; results land in
// window.__results and are printed into #log.
(function () {
  const log = document.getElementById('log');
  const R = (window.__results = { passed: 0, failed: 0, details: [], done: false, errors: [] });
  window.addEventListener('error', (e) => R.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => R.errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));
  const out = (s) => { log.textContent += '\n' + s; console.log(s); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < (ms || 5000)) { if (fn()) return true; await sleep(15); }
    return !!fn();
  };
  const S = () => window.__gpSwipe;
  const M = window.__mock;
  const key = (k, o) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})));
  const top = () => S().swipe.top && S().swipe.top.item;
  const topKey = () => { const i = top(); return i && i.mediaKey; };
  const calls = (id) => M.calls.filter((c) => c.rpcid === id);
  const snacks = () => Array.prototype.map.call(document.querySelectorAll('.gps-snack .txt'), (e) => e.textContent);
  const dlg = () => document.querySelector('.gps-scrim');
  const tiles = () => document.querySelectorAll('.gps-tile');
  const delBtn = () => document.querySelector('.gps-confirm button:last-child');
  const pointer = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { pointerId: id || 1, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, isPrimary: true }));
  // wait for the top card to actually change (the flying card lingers in the DOM)
  const decide = async (k) => { const before = top(); key(k); await until(() => top() !== before && !S().swipe.busy, 3000); };

  let current = '';
  const check = (cond, msg) => {
    if (cond) R.passed++; else { R.failed++; out('  ✗ ' + current + ': ' + msg); }
    R.details.push({ test: current, ok: !!cond, msg: msg });
  };
  const tests = [];
  const test = (name, fn) => tests.push({ name: name, fn: fn });

  // ---------------------------------------------------------------- boot ---
  test('boot: overlay, first page, local stores', async () => {
    check(await until(() => S() && S().app.built && document.querySelectorAll('.gps-card').length === 2, 8000), 'two cards rendered');
    check(!!S().store.db, 'IndexedDB opened');
    check(S().feed.ready, 'feed only became ready after the local stores loaded');
    check(topKey() === 'MK0000', 'newest photo on top, got ' + topKey());
    check(S().feed.queue.length === 18, 'queue holds the rest of two pages, got ' + S().feed.queue.length);
    check(!dlg(), 'no intro dialog (seeded as already seen)');
    check(document.querySelector('.gps-bar').classList.contains('on-stage'), 'app bar is in stage mode');
    const rootFont = getComputedStyle(document.getElementById('gps-root')).fontFamily;
    check(rootFont.indexOf('system-ui') !== -1 && rootFont.indexOf('Google Sans') === -1, 'independent system font stack, got ' + rootFont);
    check(document.querySelector('.gps-brand .n').textContent === 'FolioPause', 'new FolioPause brand is visible');
    check(document.querySelectorAll('.gps-brand .gps-mark rect').length === 4, 'independent FolioPause folio-and-pause mark is visible');
    check(!!document.querySelector('.gps-actions [data-act=review]'), 'persistent bottom Review action exists');
    check(document.querySelector('.gps-review-label').textContent === 'Gözden geçir', 'automatic locale follows the Turkish Photos page');
    check(document.querySelectorAll('.gps-score-item').length === 4, 'top scoreboard exposes four honest metrics');
    const localeKeys = Object.keys(S().locales.en).sort().join('|');
    check(['tr', 'en', 'it', 'es', 'de'].every((code) => Object.keys(S().locales[code]).sort().join('|') === localeKeys), 'all five locales are complete with no mixed-language fallback');

    document.querySelector('.gps-actions [data-act=review]').click();
    check(await until(() => S().app.view === 'review', 1000), 'bottom Review action opens Review without requiring a card decision');
    S().app.showSwipe();
  });

  // ------------------------------------------------------------ decisions ---
  test('right keeps, left only marks — nothing is deleted', async () => {
    M.calls.length = 0;
    await decide('ArrowRight');
    await decide('ArrowLeft');
    await decide('ArrowLeft');
    check(S().kept.has('MK0000'), 'MK0000 kept');
    check(S().marked.has('MK0001') && S().marked.has('MK0002'), 'MK0001 + MK0002 marked');
    check(topKey() === 'MK0003', 'advanced to MK0003, got ' + topKey());
    check(calls('XwAOJf').length === 0, 'NO trash call was made');
    check(M.trashed.size === 0, 'nothing is in the trash');
    check(document.querySelector('.gps-badge').textContent === '2', 'review badge shows 2');
    check(S().app.scoreEls.reviewed.textContent === '3', 'scoreboard reviewed count is 3');
    check(S().app.scoreEls.kept.textContent === '1' && S().app.scoreEls.pending.textContent === '2', 'scoreboard separates kept and pending');
    const idb = await S().store.tx('marked', 'readonly', (st) => st.getAllKeys());
    check(idb.length === 2, 'marked list persisted to IndexedDB, got ' + idb.length);
  });

  test('undo walks back through both kinds of decision', async () => {
    key('z'); await until(() => topKey() === 'MK0002' && !S().swipe.busy, 2000);
    check(topKey() === 'MK0002' && !S().marked.has('MK0002'), 'un-marked MK0002');
    key('z'); await until(() => topKey() === 'MK0001' && !S().swipe.busy, 2000);
    check(topKey() === 'MK0001' && !S().marked.has('MK0001'), 'un-marked MK0001');
    key('z'); await until(() => topKey() === 'MK0000' && !S().swipe.busy, 2000);
    check(topKey() === 'MK0000' && !S().kept.has('MK0000'), 'un-kept MK0000');
    check(S().marked.size === 0 && S().kept.size === 0, 'both sets empty again');
    const idb = await S().store.tx('marked', 'readonly', (st) => st.getAllKeys());
    check(idb.length === 0, 'IndexedDB marked list emptied');
    key('z'); await sleep(80);
    check(topKey() === 'MK0000', 'undo with an empty history is a no-op');
    check(calls('XwAOJf').length === 0, 'still no trash call');
  });

  test('held key does not repeat', async () => {
    key('ArrowLeft', { repeat: true }); key('ArrowRight', { repeat: true });
    await sleep(80);
    check(topKey() === 'MK0000' && S().marked.size === 0, 'key repeat ignored');
  });

  test('drag: swipe marks, micro-twitch does nothing, stale release is ignored', async () => {
    const card = S().swipe.top.el;
    card.setPointerCapture = () => {}; card.releasePointerCapture = () => {};
    const k0 = topKey();
    pointer(card, 'pointerdown', 600, 400); await sleep(25);
    pointer(card, 'pointermove', 480, 400); await sleep(25);
    pointer(card, 'pointermove', 300, 400); await sleep(25);
    pointer(card, 'pointerup', 300, 400);
    await until(() => topKey() !== k0 && !S().swipe.busy, 2000);
    check(S().marked.has(k0), 'drag left marked ' + k0);
    key('z'); await until(() => topKey() === k0 && !S().swipe.busy, 2000);

    const c2 = S().swipe.top.el;
    c2.setPointerCapture = () => {}; c2.releasePointerCapture = () => {};
    pointer(c2, 'pointerdown', 600, 400);
    pointer(c2, 'pointermove', 585, 400);
    pointer(c2, 'pointerup', 585, 400);
    await sleep(80);
    check(topKey() === k0 && S().marked.size === 0, 'micro-twitch ignored');
    check(c2.style.transform === '' || c2.style.transform === 'none', 'card snapped back');

    const c3 = S().swipe.top.el;
    c3.setPointerCapture = () => {}; c3.releasePointerCapture = () => {};
    pointer(c3, 'pointerdown', 600, 400); await sleep(20);
    pointer(c3, 'pointermove', 200, 400); await sleep(20);
    const a = topKey();
    key('ArrowRight');
    await until(() => topKey() !== a && !S().swipe.busy, 2000);
    const b = topKey();
    pointer(c3, 'pointerup', 200, 400);
    await sleep(120);
    check(S().kept.has(a), 'A was kept by the key press');
    check(topKey() === b && !S().marked.has(b), 'B untouched by the stale release');
    key('z'); await until(() => topKey() === a && !S().swipe.busy, 2000);
  });

  // --------------------------------------------------------- review flow ---
  test('the review prompt fires after N decisions and can be postponed', async () => {
    S().state.settings.reviewEvery = 4;
    S().state.sinceReview = 0;
    for (let i = 0; i < 4; i++) await decide(i % 2 ? 'ArrowRight' : 'ArrowLeft');
    check(await until(() => !!dlg(), 2500), 'review prompt opened');
    check(dlg().querySelectorAll('.strip img').length > 0, 'prompt shows thumbnails of the marked photos');
    check(S().marked.size === 2, 'two photos marked, got ' + S().marked.size);
    const later = Array.prototype.find.call(dlg().querySelectorAll('button'), (b) => /^(Sonra|Later)/.test(b.textContent));
    check(!!later, 'has a "later" button');
    if (later) later.click();
    await sleep(80);
    check(!dlg(), 'dialog closed');
    check(document.activeElement === S().app.root, 'closing the modal restores focus to the app');
    check(S().app.view === 'swipe', 'still swiping');
    check(S().state.sinceReview === 0, 'counter reset, so it asks again after another N');
    check(calls('XwAOJf').length === 0, 'postponing deletes nothing');
  });

  test('the review screen lists marked photos and can spare one', async () => {
    key('r');
    check(await until(() => S().app.view === 'review', 2000), 'review view opened');
    check(document.querySelector('.gps-bar').classList.contains('on-surface'), 'app bar switched to surface mode');
    const n = S().marked.size;
    check(tiles().length === n, 'one tile per marked photo (' + tiles().length + '/' + n + ')');
    check(S().review.selected.size === n, 'everything starts selected for deletion');
    const first = tiles()[0];
    first.click(); await sleep(60);
    check(S().review.selected.size === n - 1, 'clicking a tile spares it');
    check(first.classList.contains('spared'), 'spared tile is dimmed');
    first.click(); await sleep(60);
    check(S().review.selected.size === n, 'clicking again re-selects it');
  });

  test('select none / select all', async () => {
    await S().review.toggleAll();
    check(S().review.selected.size === 0, 'select none');
    check(!delBtn().disabled && /Hepsini tut|Keep all/i.test(delBtn().textContent), 'zero-selection action safely keeps all');
    await S().review.toggleAll();
    check(S().review.selected.size === S().marked.size, 'select all');
    check(!delBtn().disabled, 'delete button enabled again');
  });

  test('confirming deletes one batch, spares become kept, the first delete is verified', async () => {
    M.calls.length = 0;
    tiles()[0].click(); await sleep(50);          // spare one so both paths are exercised
    const all = S().review.items();
    const spared = all[0];
    const toDelete = all.slice(1);
    check(toDelete.length >= 1, 'at least one photo queued for deletion');
    const keptBefore = S().kept.size;

    delBtn().click();
    check(await until(() => M.trashed.size >= toDelete.length, 8000), 'photos moved to trash');
    await until(() => !S().review.deleting, 8000);

    const trashCalls = calls('XwAOJf');
    check(trashCalls.length === 1, 'a single batched trash call, got ' + trashCalls.length);
    check(Array.isArray(trashCalls[0].payload[2]) && trashCalls[0].payload[2].length === toDelete.length, 'all dedup keys in one array');
    check(trashCalls[0].payload[1] === 1, 'action code 1 = move to trash');
    check(S().marked.size === 0, 'marked list cleared');
    check(S().kept.has(spared.mediaKey), 'the spared photo is now kept');
    check(S().kept.size === keptBefore + 1, 'exactly one photo moved into kept');
    check(S().state.stats.deleted === toDelete.length, 'deleted stat, got ' + S().state.stats.deleted);
    check(S().state.stats.freedBytes > 0, 'freed bytes counted');
    check(await until(() => snacks().some((s) => /taşındı|moved to trash/i.test(s)), 3000), 'result snackbar shown');
    check(await until(() => calls('VrseUb').length > 0 || calls('zy0IHe').length > 0, 5000), 'the first deletion is verified against the API');
    check(await until(() => S().review.verified === true, 8000), 'verification succeeded');
    check(!document.querySelector('.gps-banner'), 'no warning banner');
  });

  test('undo restores a deleted batch out of the trash', async () => {
    M.calls.length = 0;
    S().app.showSwipe();
    await until(() => S().swipe.top, 4000);
    const deletedBefore = S().state.stats.deleted;
    const trashedBefore = M.trashed.size;
    await decide('ArrowLeft'); await decide('ArrowLeft');
    const batch = S().review.items().slice();
    key('r'); await until(() => S().app.view === 'review', 2000);
    delBtn().click();
    check(await until(() => M.trashed.size >= trashedBefore + 2 && !S().review.deleting, 8000), 'batch deleted');
    check(await until(() => !!document.querySelector('.gps-snack .act'), 3000), 'undo action offered');
    document.querySelector('.gps-snack .act').click();
    check(await until(() => S().marked.size === batch.length, 8000), 'photos are back in the review list');
    const restore = calls('XwAOJf').filter((c) => c.payload[1] === 3);
    check(restore.length === 1, 'one restore call, got ' + restore.length);
    check(batch.every((i) => !M.trashed.has(i.dedupKey)), 'the restored photos are out of the trash');
    check(M.trashed.size === trashedBefore, 'trash back to its previous size, got ' + M.trashed.size + ' vs ' + trashedBefore);
    check(S().state.stats.deleted === deletedBefore, 'deleted stat rolled back to ' + deletedBefore + ', got ' + S().state.stats.deleted);
  });

  test('review can undo every mark or safely keep everything', async () => {
    S().state.settings.reviewEvery = 0;
    if (S().app.view !== 'review') S().app.showReview();
    const undone = S().review.items().slice();
    const trashBefore = M.trashed.size;
    await S().review.undoAll();
    check(S().marked.size === 0 && S().app.view === 'swipe', 'Undo all returns the whole review queue to swiping');
    check(M.trashed.size === trashBefore, 'Undo all makes no Google trash mutation');

    await until(() => top(), 4000);
    await decide('ArrowLeft'); await decide('ArrowLeft');
    const keepBatch = Array.from(S().marked.values());
    S().app.showReview();
    await S().review.toggleAll();
    check(S().review.selected.size === 0 && !delBtn().disabled, 'selecting none offers an enabled Keep all action');
    delBtn().click();
    await until(() => !S().review.deleting && S().marked.size === 0, 5000);
    check(keepBatch.every((i) => S().kept.has(i.mediaKey)), 'Keep all atomically moves every spared photo into kept');
    check(M.trashed.size === trashBefore, 'Keep all deletes nothing');
    check(undone.every((i) => !S().marked.has(i.mediaKey)), 'old undone marks remain cleared');
  });

  test('a failing batch keeps the photos marked and surfaces the error', async () => {
    S().app.showSwipe();
    await until(() => top(), 4000);
    await decide('ArrowLeft'); await decide('ArrowLeft');
    if (S().app.view !== 'review') { key('r'); await until(() => S().app.view === 'review', 2000); }
    await S().review.toggleAll();
    if (S().review.selected.size === 0) await S().review.toggleAll();
    await sleep(50);
    M.calls.length = 0;
    M.failNextTrash = 99;
    const trashedBase = M.trashed.size;
    const before = S().marked.size;
    check(before > 0, 'photos are still marked');
    delBtn().click();
    check(await until(() => !S().review.deleting, 15000), 'the delete attempt finished');
    check(S().marked.size === before, 'nothing was removed from the list, got ' + S().marked.size);
    check(M.trashed.size === trashedBase, 'nothing new reached the trash, got ' + M.trashed.size + ' vs ' + trashedBase);
    check(snacks().some((s) => /oturum|session|taşınamadı|failed|moved/i.test(s)), 'an error was surfaced');
    M.failNextTrash = 0;
  });

  test('an expired session (HTTP 401) is reported and not retried to death', async () => {
    M.calls.length = 0;
    M.fatalTrash = true;
    if (S().review.selected.size === 0) { await S().review.toggleAll(); await sleep(50); }
    delBtn().click();
    check(await until(() => !S().review.deleting, 12000), 'the delete attempt finished');
    check(calls('XwAOJf').length === 1, 'a 401 is not retried, got ' + calls('XwAOJf').length + ' calls');
    check(!!document.querySelector('.gps-banner'), 'session banner shown');
    M.fatalTrash = false;
    const b = document.querySelector('.gps-banner');
    if (b) b.querySelectorAll('.gps-btn')[1].click();
  });

  test('marked and kept photos are filtered out of the feed', async () => {
    const markedKeys = new Set(Array.from(S().marked.keys()));
    S().app.showSwipe();
    S().app.reloadFeed();
    check(await until(() => S().swipe.top || S().feed.exhausted, 8000), 'feed reloaded');
    const offered = [S().swipe.top && S().swipe.top.item, S().swipe.back && S().swipe.back.item]
      .concat(S().feed.queue).filter(Boolean).map((i) => i.mediaKey);
    check(offered.every((k) => !markedKeys.has(k)), 'no marked photo is offered again');
    check(offered.every((k) => !S().kept.has(k)), 'no kept photo is offered again');
    check(new Set(offered).size === offered.length, 'no duplicates in the stack');
  });

  // -------------------------------------------------------------- video ---
  test('a video card is unmistakably a video and offers playback', async () => {
    S().state.settings.reviewEvery = 0;          // no review prompt mid-test
    S().app.showSwipe();
    check(await until(() => !!S().swipe.top, 5000), 'the deck is showing');

    const still = S().feed.queue.find((i) => !i.isVideo);
    check(!!still && !S().swipe.makeCard(still, true).querySelector('.gps-play'), 'a photo card carries no play control');

    const clip = S().feed.queue.find((i) => i.isVideo)
      || [S().swipe.top, S().swipe.back].filter(Boolean).map((c) => c.item).find((i) => i.isVideo);
    check(!!clip, 'the library still offers a video to test with');
    if (!clip) return;
    S().swipe.showOnTop(clip);
    check(await until(() => S().swipe.top && S().swipe.top.item.mediaKey === clip.mediaKey, 2000), 'the video is on top');

    const card = S().swipe.top.el;
    const play = card.querySelector('.gps-play');
    check(!!play, 'the video card has a play control of its own');
    check(!!card.querySelector('.gps-chip.vid'), 'the running-time chip is flagged as a video');
    check(/\d:\d\d/.test(card.querySelector('.gps-chip.vid').textContent), 'the chip shows a running time');
    check(play && play.getAttribute('aria-label').length > 0, 'the play control is labelled for assistive tech');

    // A press must show something immediately: the earlier build resolved a
    // rendition before mounting anything, which left the card on a frozen
    // still with the play control already hidden for up to twelve seconds.
    play.click();
    check(await until(() => card.classList.contains('loading'), 1000), 'the card says it is working on it');
    check(!!card.querySelector('video'), 'a source is mounted on the press, not after a probe');
    check(!!card.querySelector('.gps-vload'), 'the card carries a visible loading marker');

    // The mock serves an image where a video stream would be, so this also
    // covers the failure path: walk every rendition, then give up once instead
    // of remounting forever.
    check(await until(() => snacks().some((x) => /oynatılamadı|could not play/i.test(x)), 25000),
      'an unplayable source is reported instead of failing silently');
    check(S().videoSource.variant === null, 'nothing unplayable is remembered for the session, got ' + S().videoSource.variant);
    await sleep(500);
    check(card.querySelectorAll('video').length === 0, 'the dead <video> is torn down, not retried forever');
    check(!card.classList.contains('playing'), 'the play control returns after a failure');
    check(!card.classList.contains('loading'), 'the loading marker clears after a failure');

    // Pointer capture on the card retargets the compatibility click away from
    // the button, so a pointer press is only ever resolved by the drag
    // handler. At the old 8px window an ordinary press that drifted did
    // nothing at all: no video, no message, no console error.
    S().swipe.stopVideo(card);
    S().swipe.lastVideoToggle = 0;
    const box = play.getBoundingClientRect();
    const at = (type, dx, dy) => play.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, button: 0, isPrimary: true,
      clientX: box.left + box.width / 2 + dx, clientY: box.top + box.height / 2 + dy,
    }));
    at('pointerdown', 0, 0); at('pointermove', 11, 6); at('pointerup', 11, 6);
    check(await until(() => card.classList.contains('loading') || !!card.querySelector('video'), 1500),
      'a press that drifts a few pixels still starts the video');
  });

  test('review badges videos and can play them from the preview', async () => {
    S().app.showSwipe();
    check(await until(() => S().swipe.top && S().swipe.top.item.isVideo, 3000), 'the video is still on the deck');
    const clipKey = topKey();
    await decide('ArrowLeft');
    key('r');
    check(await until(() => S().app.view === 'review', 2000), 'review opened');

    const items = S().review.items();
    const idx = items.findIndex((i) => i.mediaKey === clipKey);
    check(idx !== -1, 'the video is waiting in review');
    const badges = document.querySelectorAll('.gps-tile .tvid').length;
    check(badges > 0 && badges === items.filter((i) => i.isVideo).length, 'every video tile is badged, got ' + badges);

    tiles()[idx].querySelector('.zoom').click();
    check(await until(() => !!S().review.lightbox, 2000), 'preview opened on the video');
    const lbPlay = S().review.lightbox.querySelector('.gps-play');
    check(!!lbPlay && !lbPlay.hidden, 'the preview offers playback for a video');
    check(/\d:\d\d/.test(S().review.lightbox.querySelector('.gps-count').textContent), 'the caption carries the running time');
    key('ArrowRight'); await sleep(120);
    const after = S().review.items()[idx + 1];
    check(!after || !after.isVideo === S().review.lightbox.querySelector('.gps-play').hidden, 'the play control follows what is on screen');
    key('Escape'); await sleep(90);
    check(!S().review.lightbox, 'preview closed');

    S().app.showSwipe();
    key('z');
    check(await until(() => !S().marked.has(clipKey), 3000), 'undo takes the video back out of review');
  });

  // ------------------------------------------------------------- chrome ----
  test('lightbox preview opens, navigates and toggles', async () => {
    key('r'); await until(() => S().app.view === 'review', 2000);
    check(tiles().length > 1, 'more than one tile to page through (' + tiles().length + ')');
    tiles()[0].querySelector('.zoom').click();
    check(await until(() => !!S().review.lightbox, 2000), 'lightbox opened');
    key('ArrowRight'); await sleep(90);
    check(S().review.lightbox.querySelector('.gps-count').textContent.indexOf('2 /') === 0, 'moved to the second photo');
    const second = S().review.items()[1].mediaKey;
    key(' '); await sleep(90);
    check(!S().review.selected.has(second), 'space took the second photo off the delete list');
    key(' '); await sleep(90);
    check(S().review.selected.has(second), 'space put it back');
    key('Escape'); await sleep(90);
    check(!S().review.lightbox, 'escape closed the lightbox');
  });

  test('settings: review interval, theme and persistence', async () => {
    key('s');
    check(await until(() => !!dlg(), 2000), 'settings dialog opened');
    const num = dlg().querySelector('input[type=number]');
    check(!!num, 'has the review-interval field');
    const source = dlg().querySelector('select');
    const feedGenBefore = S().feed.gen;
    source.value = '2';
    num.value = '25';
    const theme = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'light'));
    const language = Array.prototype.find.call(dlg().querySelectorAll('select'), (el) => Array.prototype.some.call(el.options, (o) => o.value === 'it'));
    check(language && language.options.length === 6, 'language setting offers auto plus five complete languages');
    const panel = dlg().querySelector('[role=dialog]');
    check(panel.hasAttribute('aria-labelledby') && !!document.getElementById(panel.getAttribute('aria-labelledby')), 'settings dialog has an accessible name');
    const dialogFocusables = Array.from(panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.disabled && !el.hidden && el.getClientRects().length > 0);
    dialogFocusables[dialogFocusables.length - 1].focus();
    dialogFocusables[dialogFocusables.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    check(document.activeElement === dialogFocusables[0], 'settings dialog traps Tab focus inside the modal');
    language.value = 'en';
    theme.value = 'light'; theme.dispatchEvent(new Event('change'));
    check(document.getElementById('gps-root').classList.contains('gps-light'), 'light theme applied live');
    Array.prototype.find.call(dlg().querySelectorAll('button'), (b) => /Kaydet|Save/.test(b.textContent)).click();
    await sleep(150);
    check(S().state.settings.reviewEvery === 25, 'interval saved');
    check(S().state.settings.theme === 'light', 'theme saved');
    check(S().state.settings.language === 'en', 'manual language saved');
    check(S().state.settings.source === 2 && S().feed.gen > feedGenBefore, 'language plus source change rebuilds and invalidates the old feed');
    check(document.querySelector('.gps-review-label').textContent === 'Review', 'language switches live without a page reload');
    const raw = JSON.parse(localStorage.getItem(M.STATE_KEY));
    check(raw.settings.reviewEvery === 25, 'persisted to localStorage');
    check(raw.settings.language === 'en', 'language persisted to localStorage');
    S().state.settings.theme = 'dark'; S().app.applyTheme();
  });

  test('keyboard is swallowed so Google Photos hotkeys never fire underneath', async () => {
    let leaked = 0;
    const spy = () => { leaked++; };
    window.addEventListener('keydown', spy);      // bubble phase: our capture listener must stop it first
    key('ArrowLeft'); key('ArrowRight'); key('z'); key('#');
    await sleep(150);
    window.removeEventListener('keydown', spy);
    check(leaked === 0, 'no key event reached the page, leaked ' + leaked);
  });

  test('closing warns once about pending photos, then closes and reopens', async () => {
    S().app.showSwipe();
    await until(() => S().swipe.top || S().feed.exhausted, 5000);
    if (!S().marked.size && S().swipe.top) await decide('ArrowLeft');
    S().app.exitWarned = false;
    key('Escape');
    check(await until(() => !!dlg(), 2000), 'pending-photos dialog shown');
    Array.prototype.find.call(dlg().querySelectorAll('button'), (b) => /Kapat|Close/.test(b.textContent)).click();
    await sleep(100);
    check(document.getElementById('gps-root').style.display === 'none', 'overlay closed');
    const before = topKey();
    key('ArrowLeft'); await sleep(80);
    check(topKey() === before, 'keys are ignored while closed');
    S().open();
    await sleep(200);
    check(document.getElementById('gps-root').style.display !== 'none', 'reopened');
  });

  test('no runtime or Trusted Types errors', async () => {
    check(R.errors.length === 0, 'errors: ' + R.errors.join(' | '));
  });

  // -------------------------------------------------------------- runner ---
  (async function run() {
    await until(() => window.__gpSwipe, 8000);
    for (const tc of tests) {
      current = tc.name;
      out('▶ ' + tc.name);
      try { await tc.fn(); } catch (e) { R.failed++; out('  ✗ ' + tc.name + ': threw ' + ((e && e.stack) || e)); }
    }
    R.done = true;
    out('\nDONE: ' + R.passed + ' passed, ' + R.failed + ' failed, ' + R.errors.length + ' runtime errors');
  })();
})();
