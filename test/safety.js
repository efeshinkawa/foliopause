// Regressions for the destructive boundary: persistent review choices, dry
// run invariants, deletion-time input locking, page-token invalidation, and
// undoing an entire confirmed batch.
(function () {
  const log = document.getElementById('log');
  const R = (window.__results = { passed: 0, failed: 0, done: false, errors: [], log: '' });
  window.addEventListener('error', (e) => R.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => R.errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));
  const out = (s) => { log.textContent += '\n' + s; R.log += '\n' + s; console.log('[safety] ' + s); };
  const check = (ok, msg) => { if (ok) R.passed++; else { R.failed++; out('FAIL ' + msg); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => {
    const start = performance.now();
    while (performance.now() - start < (ms || 5000)) { if (fn()) return true; await sleep(15); }
    return !!fn();
  };
  const S = () => window.__gpSwipe;
  const M = window.__mock;
  const top = () => S().swipe.top && S().swipe.top.item;
  const decide = async (kind) => {
    const before = top();
    S().swipe.act(kind);
    return until(() => top() !== before && !S().swipe.busy, 3000);
  };

  (async function run() {
    check(await until(() => S() && S().swipe.top, 10000), 'app booted with a top card');
    const firstListCalls = M.calls.filter((c) => c.rpcid === 'lcxiM');
    check(firstListCalls.length >= 2, 'empty intermediate page continued to the next page');
    check(firstListCalls[0] && firstListCalls[0].payload[0] == null, 'first list request used no page token');
    check(firstListCalls[1] && firstListCalls[1].payload[0] === '0', 'continuation token from the empty page was followed');

    S().app.close();
    const originalLockApi = S().store.lockApi;
    S().store.lockApi = null;
    const noLockOpen = await S().app.show();
    check(noLockOpen === false && !S().store.hasLock && S().feed.ready === false,
      'missing Web Locks blocks the mutable app fail-closed');
    check(document.querySelector('.gps-dlg h2').textContent === S().locales.tr.lockUnavailableTitle,
      'missing Web Locks explains the security requirement instead of blaming another tab');
    S().store.lockApi = originalLockApi;
    S().app.close();
    check(await S().app.show(), 'app recovers after secure locking becomes available');

    const stateBeforeHydrationRace = localStorage.getItem(M.STATE_KEY);
    S().app.close();
    const authoritativeState = JSON.parse(stateBeforeHydrationRace);
    authoritativeState.cursorTs = 1357911;
    localStorage.setItem(M.STATE_KEY, JSON.stringify(authoritativeState));
    S().state.cursorTs = 2468022; // stale script-load snapshot
    const originalInit = S().store.init;
    let releaseInit;
    S().store.init = () => new Promise((resolve) => { releaseInit = resolve; });
    const hydrationOpen = S().app.show();
    check(await until(() => S().store.hasLock && S().app.hydrating && releaseInit, 3000),
      'hydration race reached the locked but non-writable state');
    S().app.close();
    check(JSON.parse(localStorage.getItem(M.STATE_KEY)).cursorTs === authoritativeState.cursorTs,
      'closing during hydration cannot overwrite newer account state with a stale snapshot');
    localStorage.setItem(M.STATE_KEY, stateBeforeHydrationRace);
    releaseInit(S().store.db);
    await hydrationOpen;
    S().store.init = originalInit;

    const originalRefresh = S().store.refresh;
    S().store.refresh = async () => { throw new Error('injected hydration failure'); };
    const unsafeOpen = await S().app.show();
    check(unsafeOpen === false && S().feed.ready === false, 'failed local hydration blocks the feed fail-closed');
    check(!!document.querySelector('.gps-scrim'), 'failed hydration shows a retry/close explanation');
    S().store.refresh = originalRefresh;
    S().app.close();
    check(await S().app.show(), 'app can retry after the local store recovers');
    check(await until(() => top(), 5000), 'cards return only after a complete retry');

    M.calls.length = 0;
    let invalidBatchRejected = false;
    try { await S().api.trashBatch(['DK0000', null]); } catch (e) { invalidBatchRejected = true; }
    check(invalidBatchRejected && M.calls.every((c) => c.rpcid !== 'XwAOJf'),
      'invalid destructive keys are rejected before any Google RPC');

    const markedBeforeCorruption = Array.from(S().marked.keys()).sort();
    await S().store.tx('marked', 'readwrite', (st) => st.put({ mediaKey: 'CORRUPT', dedupKey: null }, 'CORRUPT'));
    let corruptSnapshotRejected = false;
    try { await S().store.refresh(); } catch (e) { corruptSnapshotRejected = true; }
    check(corruptSnapshotRejected
      && JSON.stringify(Array.from(S().marked.keys()).sort()) === JSON.stringify(markedBeforeCorruption),
    'corrupt marked rows reject the complete snapshot without swapping partial state');
    await S().store.tx('marked', 'readwrite', (st) => st.delete('CORRUPT'));

    const resetProbe = top();
    await S().store.setDisposition(resetProbe, 'keep');
    const originalResetTx = S().store.tx;
    S().store.tx = function (name, mode) {
      if (name === 'kept' && mode === 'readwrite') return Promise.reject(new Error('injected kept reset failure'));
      return originalResetTx.apply(this, arguments);
    };
    let resetRejected = false;
    try { await S().store.keepClear(); } catch (e) { resetRejected = true; }
    check(resetRejected && S().kept.has(resetProbe.mediaKey), 'failed kept reset is atomic and reports failure');
    S().store.tx = originalResetTx;
    await S().store.clearDisposition(resetProbe.mediaKey);

    M.failNextList = 3;
    S().app.reloadFeed();
    check(await until(() => S().feed.error, 9000), 'an exhausted transient list failure reaches the Retry state');
    S().feed.error = false;
    S().feed.ensure();
    check(await until(() => top(), 6000), 'the same page token succeeds on Retry instead of being poisoned');

    const rejectedItem = top();
    const originalDisposition = S().store.setDisposition;
    S().store.setDisposition = () => new Promise((resolve, reject) => setTimeout(() => reject(new Error('injected decision failure')), 150));
    S().swipe.act('mark');
    await until(() => S().swipe.busy && S().swipe.inFlight, 1000);
    window.dispatchEvent(new Event('beforeunload'));
    const stateDuringWrite = JSON.parse(localStorage.getItem(M.STATE_KEY));
    check(stateDuringWrite.cursorTs === rejectedItem.ts, 'in-flight decision keeps the resume cursor on the undecided photo');
    await until(() => !S().swipe.busy && top() && top().mediaKey === rejectedItem.mediaKey, 4000);
    check(!S().marked.has(rejectedItem.mediaKey), 'failed swipe persistence restores the card without marking it');
    S().store.setDisposition = originalDisposition;

    await decide('mark');
    const committedItem = rejectedItem;
    const nextAfterCommit = top();
    const originalClear = S().store.clearDisposition;
    S().store.clearDisposition = async () => { throw new Error('injected undo failure'); };
    S().swipe.undo();
    await until(() => !S().swipe.busy, 3000);
    check(S().marked.has(committedItem.mediaKey) && top() === nextAfterCommit, 'failed undo leaves both durable decision and stack unchanged');
    S().store.clearDisposition = originalClear;
    S().swipe.undo();
    check(await until(() => !S().swipe.busy && top() && top().mediaKey === committedItem.mediaKey, 3000), 'undo succeeds after local storage recovers');
    check(!S().marked.has(committedItem.mediaKey), 'successful retry clears the old disposition');

    await decide('mark');
    await decide('mark');
    await decide('mark');
    S().app.showReview();
    check(await until(() => S().app.view === 'review' && S().review.items().length === 3, 3000), 'three marks reached Review');

    const spared = S().review.items()[0];
    await S().review.toggle(spared.mediaKey);
    S().app.showSwipe();
    S().app.showReview();
    check(!S().review.selected.has(spared.mediaKey), 'spared choice survives leaving and reopening Review');
    check(S().marked.get(spared.mediaKey).reviewSelected === false, 'spared choice is durable on the marked record');

    const keptSnapshot = Array.from(S().kept).sort();
    const markedSnapshot = Array.from(S().marked.keys()).sort();
    const originalTx = S().store.tx;
    S().store.tx = function (name, mode) {
      if (name === 'kept' && mode === 'readonly') return Promise.resolve(['PARTIAL-ROW']);
      if (name === 'marked' && mode === 'readonly') return Promise.reject(new Error('injected second read failure'));
      return originalTx.apply(this, arguments);
    };
    let refreshRejected = false;
    try { await S().store.refresh(); } catch (e) { refreshRejected = true; }
    S().store.tx = originalTx;
    check(refreshRejected, 'partial local snapshot rejects');
    check(JSON.stringify(Array.from(S().kept).sort()) === JSON.stringify(keptSnapshot)
      && JSON.stringify(Array.from(S().marked.keys()).sort()) === JSON.stringify(markedSnapshot),
    'partial refresh never swaps half-loaded kept/marked state');

    S().state.settings.dryRun = true;
    M.calls.length = 0;
    await S().review.confirmDelete();
    check(M.calls.every((c) => c.rpcid !== 'XwAOJf'), 'dry run sent no trash RPC');
    check(S().kept.has(spared.mediaKey) && !S().marked.has(spared.mediaKey), 'dry run committed the explicit keep choice');
    check(!S().history.some((e) => e.item && e.item.mediaKey === spared.mediaKey), 'dry run pruned stale undo history for the kept item');
    check(Array.from(S().kept).every((k) => !S().marked.has(k)), 'no item is both kept and marked');
    check(S().review.selected.size === 2 && S().marked.size === 2, 'dry run left delete candidates waiting in Review');
    S().state.settings.dryRun = false;

    S().app.showSwipe();
    await until(() => top(), 5000);
    await decide('mark');
    await decide('mark');
    S().app.showReview();
    await until(() => S().app.view === 'review', 2000);
    if (S().review.selected.size !== S().marked.size) await S().review.toggleAll();
    const batch = S().review.items().slice();
    const boundary = S().feed.mutationBoundary();
    M.calls.length = 0;
    M.delay = 250;
    const deleting = S().review.confirmDelete();
    check(await until(() => S().review.deleting, 1000), 'delete entered its locked state');
    S().app.showSwipe();
    S().app.close();
    S().swipe.act('undo');
    await sleep(80);
    check(S().app.open && S().app.view === 'review' && S().review.deleting, 'navigation, close and undo are blocked during deletion');
    await deleting;
    M.delay = 5;
    check(batch.every((i) => M.trashed.has(i.dedupKey)), 'the confirmed batch reached Trash');
    check(batch.every((i) => !S().marked.has(i.mediaKey)), 'verified rows left the local review queue');
    const safeRestart = M.calls.some((c) => c.rpcid === 'lcxiM' && c.payload[0] == null && c.payload[1] === boundary);
    check(safeRestart, 'feed restarted from an inclusive timestamp after mutation');

    const trashEntry = S().history.slice().reverse().find((e) => e.action === 'trash');
    check(!!trashEntry && trashEntry.items.length === batch.length, 'confirmed batch became one undo entry');
    if (trashEntry) await S().swipe.undoTrash(trashEntry, false);
    check(await until(() => batch.every((i) => !M.trashed.has(i.dedupKey)), 10000), 'batch undo restored every photo from Trash');
    check(batch.every((i) => S().marked.has(i.mediaKey)), 'restored photos returned to Review');

    S().app.showSwipe();
    let guard = 0;
    while (guard++ < 400) {
      if (top()) { await decide('keep'); continue; }
      if (S().feed.loading) { await until(() => top() || !S().feed.loading, 4000); continue; }
      if (S().feed.exhausted) break;
      S().feed.ensure();
      await sleep(30);
    }
    const accounted = new Set(Array.from(S().kept).concat(Array.from(S().marked.keys())));
    check(S().feed.exhausted, 'refetched feed reached the end');
    check(accounted.size === M.items.length, 'no photo was skipped across delete/restore mutations (' + accounted.size + '/' + M.items.length + ')');
    check(Array.from(S().kept).every((k) => !S().marked.has(k)), 'final kept/marked sets remain disjoint');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));

    out('SAFETY DONE: ' + R.passed + ' passed, ' + R.failed + ' failed');
    R.done = true;
  })();
})();
