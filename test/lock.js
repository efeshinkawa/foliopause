(function () {
  const R = (window.__results = { passed: 0, failed: 0, done: false, errors: [], log: '' });
  const log = document.getElementById('log');
  const out = (s) => { log.textContent += '\n' + s; R.log += '\n' + s; };
  const check = (ok, msg) => { if (ok) R.passed++; else { R.failed++; out('FAIL ' + msg); } };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (fn, ms) => { const at = performance.now(); while (performance.now() - at < (ms || 8000)) { if (fn()) return true; await sleep(20); } return !!fn(); };
  window.addEventListener('error', (e) => R.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => R.errors.push(String((e.reason && e.reason.message) || e.reason)));

  (async () => {
    const acct = new URLSearchParams(location.search).get('acct') || 'lock';
    const make = () => {
      const frame = document.createElement('iframe');
      frame.src = 'lock-frame.html?n=12&page=6&intro=0&acct=' + encodeURIComponent(acct);
      document.body.appendChild(frame);
      return frame;
    };
    const a = make();
    const b = make();
    check(await until(() => a.contentWindow.__gpSwipe && b.contentWindow.__gpSwipe, 12000), 'both same-account clients loaded');
    check(await until(() => {
      const clients = [a, b].map((f) => f.contentWindow.__gpSwipe);
      return clients.filter((s) => s.store.hasLock).length === 1 && clients.some((s) => s.app.dialogOpen());
    }, 10000), 'exactly one client acquired the account lock');

    const clients = [a, b].map((f) => f.contentWindow.__gpSwipe);
    const active = clients.find((s) => s.store.hasLock);
    const blocked = clients.find((s) => !s.store.hasLock);
    const activeWindow = a.contentWindow.__gpSwipe === active ? a.contentWindow : b.contentWindow;
    const blockedWindow = a.contentWindow.__gpSwipe === blocked ? a.contentWindow : b.contentWindow;
    check(!!blocked.app.root.querySelector('.gps-scrim'), 'the blocked client showed a non-destructive explanation');
    check(blocked.feed.ready === false, 'the blocked client never started listing photos');

    active.state.settings.dryRun = true;
    activeWindow.dispatchEvent(new Event('beforeunload'));
    blocked.state.settings.dryRun = false;
    blockedWindow.dispatchEvent(new Event('beforeunload'));
    const stored = JSON.parse(activeWindow.localStorage.getItem(activeWindow.__mock.STATE_KEY));
    check(stored.settings.dryRun === true, 'a passive tab cannot overwrite the lock owner on unload');

    active.app.close();
    blocked.app.close();
    const reopened = await blocked.app.show();
    check(reopened === true && blocked.store.hasLock, 'immediate close/open waits for lock release and safely reacquires');
    blocked.app.close();
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
    out('LOCK DONE: ' + R.passed + ' passed, ' + R.failed + ' failed');
    R.done = true;
  })();
})();
