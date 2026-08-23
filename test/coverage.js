// Whole-library run: decide on every photo (mixed keep/mark), delete the marked
// ones in batches, and prove that every photo was offered exactly once, that
// only confirmed photos were deleted, and that nothing is skipped or repeated.
(function () {
  const log = document.getElementById('log');
  const R = (window.__results = { passed: 0, failed: 0, done: false, errors: [], log: '', trace: [] });
  window.addEventListener('error', (e) => R.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => R.errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));
  const out = (s) => { log.textContent += '\n' + s; R.log += '\n' + s; console.log('[cov] ' + s); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < (ms || 4000)) { if (fn()) return true; await sleep(20); } return !!fn(); };
  const S = () => window.__gpSwipe, M = window.__mock;
  const top = () => S().swipe.top && S().swipe.top.item;
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const check = (c, m) => { if (c) R.passed++; else { R.failed++; out('  FAIL ' + m); } };
  const state = () => 'view=' + S().app.view + ' top=' + (top() && top().mediaKey) + ' q=' + S().feed.queue.length +
    ' marked=' + S().marked.size + ' kept=' + S().kept.size + ' load=' + S().feed.loading + ' exh=' + S().feed.exhausted +
    ' dlg=' + !!document.querySelector('.gps-scrim') + ' del=' + S().review.deleting;

  (async function run() {
    await until(() => S() && S().app.built, 8000);
    const intro = document.querySelector('.gps-scrim .gps-btn.filled');
    if (intro) intro.click();
    await until(() => top() || S().feed.exhausted, 8000);
    out('start: ' + state());

    const shown = [];
    const wantDeleted = new Set();
    const undone = new Set();          // undo each photo at most once, or the loop never ends
    let rounds = 0, steps = 0, stuck = 0;
    const MAX_STEPS = M.items.length * 4 + 60;

    while (steps++ < MAX_STEPS) {
      if (steps % 10 === 0) out('step ' + steps + ' shown=' + shown.length + ' ' + state());

      if (top()) {
        const it = top();
        const mark = (shown.length % 3) === 0;
        shown.push(it.mediaKey);
        if (mark) wantDeleted.add(it.mediaKey);
        key(mark ? 'ArrowLeft' : 'ArrowRight');
        const moved = await until(() => top() !== it && !S().swipe.busy, 3000);
        if (!moved) {
          stuck++;
          out('STUCK on ' + it.mediaKey + ' :: ' + state());
          shown.pop();
          if (mark) wantDeleted.delete(it.mediaKey);
          if (stuck > 3) { out('aborting: the card never advanced'); break; }
          await sleep(300);
          continue;
        }
        // periodically undo and re-decide: must not skip or duplicate
        if (shown.length % 7 === 0 && !undone.has(it.mediaKey)) {
          undone.add(it.mediaKey);
          key('z');
          const back = await until(() => top() && top().mediaKey === it.mediaKey && !S().swipe.busy, 3000);
          check(back, 'undo returned to ' + it.mediaKey + ' :: ' + state());
          if (back) { shown.pop(); if (mark) wantDeleted.delete(it.mediaKey); }
        }
        continue;
      }

      if (S().feed.loading || !S().feed.ready) { await until(() => top() || !S().feed.loading, 4000); continue; }

      if (S().marked.size) {                     // commit the batch, then carry on
        rounds++;
        out('batch ' + rounds + ' of ' + S().marked.size + ' :: ' + state());
        S().app.showReview();
        await until(() => S().app.view === 'review' && document.querySelector('.gps-confirm .gps-btn.danger'), 4000);
        const n = S().review.selected.size;
        document.querySelector('.gps-confirm .gps-btn.danger').click();
        check(await until(() => !S().review.deleting, 25000), 'batch ' + rounds + ' finished (' + n + ')');
        S().app.showSwipe();
        await until(() => top() || S().feed.exhausted, 5000);
        continue;
      }

      if (S().feed.exhausted) break;
      await until(() => top() || S().feed.exhausted, 4000);
      if (!top() && !S().marked.size && S().feed.exhausted) break;
      if (!top() && !S().feed.loading && !S().marked.size) { out('nothing left to do :: ' + state()); break; }
    }
    out('loop ended after ' + steps + ' steps :: ' + state());

    const uniq = new Set(shown);
    check(uniq.size === shown.length, 'no photo offered twice (' + (shown.length - uniq.size) + ' repeats)');
    check(shown.length === M.items.length, 'every photo was offered: ' + shown.length + '/' + M.items.length);
    const missing = M.items.map((i) => i[0]).filter((k) => !uniq.has(k));
    check(missing.length === 0, 'missing: ' + missing.slice(0, 8).join(','));
    const trashedKeys = new Set(M.items.filter((i) => M.trashed.has(i[3])).map((i) => i[0]));
    const stray = Array.from(trashedKeys).filter((k) => !wantDeleted.has(k));
    check(stray.length === 0, 'only confirmed photos were deleted, stray: ' + stray.slice(0, 8).join(','));
    const missed = Array.from(wantDeleted).filter((k) => !trashedKeys.has(k));
    check(missed.length === 0, 'every confirmed photo was deleted, missed: ' + missed.slice(0, 8).join(','));
    check(S().marked.size === 0, 'review list empty at the end, got ' + S().marked.size);
    check(R.errors.length === 0, 'runtime errors: ' + R.errors.join(' | '));

    out('COVERAGE DONE: ' + R.passed + ' passed, ' + R.failed + ' failed (offered ' + shown.length +
        ', deleted ' + trashedKeys.size + ', kept ' + S().kept.size + ', batches ' + rounds + ')');
    R.done = true;
  })();
})();
