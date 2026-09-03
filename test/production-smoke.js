// Browser smoke shared by the two production, non-extension artifacts. It
// proves that both start with only the tiny public API and a working UI.
(function () {
  const R = (window.__results = { passed: 0, failed: 0, done: false, errors: [], log: '' });
  const log = document.getElementById('log');
  const out = (s) => { log.textContent += '\n' + s; R.log += '\n' + s; };
  const check = (ok, msg) => { if (ok) R.passed++; else { R.failed++; out('FAIL ' + msg); } };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (fn, ms) => {
    const at = performance.now();
    while (performance.now() - at < (ms || 8000)) { if (fn()) return true; await sleep(20); }
    return !!fn();
  };
  window.addEventListener('error', (e) => R.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => R.errors.push(String((e.reason && e.reason.message) || e.reason)));

  (async () => {
    const kind = window.__productionKind;
    check(await until(() => window.__gpSwipe, 8000), kind + ' exported a public handle');
    const keys = Object.keys(window.__gpSwipe || {}).sort();
    check(JSON.stringify(keys) === JSON.stringify(['close', 'open', 'version']), kind + ' exposes only open/close/version');
    // The runner passes the packaged version in, so a release bump can never
    // leave this smoke test asserting a stale number.
    const expectedVersion = new URLSearchParams(location.search).get('version');
    check(window.__gpSwipe && window.__gpSwipe.version === expectedVersion,
      kind + ' runtime version matches the package (' + (window.__gpSwipe && window.__gpSwipe.version) + ' vs ' + expectedVersion + ')');

    if (kind === 'userscript') {
      check(await until(() => document.querySelector('#gps-fab'), 4000), 'userscript mounted the FolioPause launcher');
      document.querySelector('#gps-fab').click();
    } else {
      check(!document.querySelector('#gps-fab'), 'console build opens directly without a persistent launcher');
    }
    check(await until(() => document.querySelector('#gps-root') && document.querySelector('#gps-root').style.display !== 'none', 8000), kind + ' opened the UI');
    check(document.querySelector('.gps-brand .n').textContent === 'FolioPause', kind + ' rendered the FolioPause brand');
    check(document.querySelector('.gps-review-label').textContent === 'Gözden geçir', kind + ' selected the page locale');
    check(R.errors.length === 0, kind + ' produced no runtime errors: ' + R.errors.join(' | '));
    R.done = true;
    out(kind.toUpperCase() + ' PRODUCTION SMOKE: ' + R.passed + ' passed, ' + R.failed + ' failed');
  })();
})();
