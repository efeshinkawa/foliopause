// Regression for an empty-page loader loop. Before the fix, the 40-page guard
// returned to swipe.render(), whose empty feed.take() immediately launched the
// next 40-page scan. The UI therefore remained on "Loading..." indefinitely.
(function () {
  const log = document.getElementById('log');
  const R = window.__results = { passed: 0, failed: 0, done: false, errors: [], log: '' };
  const probe = window.__refillProbe;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (fn, ms) => {
    const started = performance.now();
    while (performance.now() - started < ms) {
      if (fn()) return true;
      await sleep(10);
    }
    return !!fn();
  };
  const out = (message) => {
    log.textContent += '\n' + message;
    R.log += '\n' + message;
    console.log('[feed-refill] ' + message);
  };
  const check = (ok, message) => {
    if (ok) R.passed++;
    else { R.failed++; out('FAIL ' + message); }
  };
  window.addEventListener('error', (event) => R.errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => {
    R.errors.push('unhandled: ' + String((event.reason && event.reason.message) || event.reason));
  });

  (async function run() {
    const reachedBoundary = await until(() => {
      const app = window.__gpSwipe;
      return probe.calls > 40
        || (app && app.feed.error)
        || (app && probe.calls >= 40 && !app.feed.loading);
    }, 8000);
    check(reachedBoundary, 'the bounded empty-page scan reached a terminal state');

    const app = window.__gpSwipe;
    check(!!app && app.app.built, 'the shell remains available while the feed stops safely');
    check(probe.calls === 40, 'exactly one bounded 40-page scan ran, got ' + probe.calls);

    const callsAtBoundary = probe.calls;
    await sleep(250);
    check(probe.calls === callsAtBoundary,
      'an empty render did not launch another scan (' + callsAtBoundary + ' -> ' + probe.calls + ')');
    check(app && app.feed.loading === false, 'the feed left its loading state');
    check(app && !!app.feed.error, 'the feed exposed a recoverable error state');
    check(!!document.querySelector('.gps-center button'), 'the UI offers an explicit Retry action');
    check(app && !app.swipe.top && !app.swipe.back, 'no malformed placeholder card was created');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));

    document.querySelector('.gps-center button').click();
    check(await until(() => probe.calls >= callsAtBoundary + 40 && !app.feed.loading, 8000),
      'Retry runs one more bounded scan');
    check(probe.calls === callsAtBoundary + 40,
      'Retry also stops at the scan boundary, got ' + probe.calls);
    check(probe.tokens[callsAtBoundary] === String(callsAtBoundary) && !!app.feed.error,
      'Retry resumes from the retained page token and returns to the recoverable state');

    out('FEED REFILL DONE: ' + R.passed + ' passed, ' + R.failed + ' failed');
    R.done = true;
  })();
})();
