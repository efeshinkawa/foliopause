(function () {
  const log = document.getElementById('log');
  const R = window.__results = { passed: 0, failed: 0, done: false, errors: [], log: '' };
  const probe = window.__feedEdgeProbe;
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
    console.log('[feed-edge] ' + message);
  };
  const check = (ok, message) => {
    if (ok) R.passed++;
    else { R.failed++; out('FAIL ' + message); }
  };
  window.addEventListener('error', (event) => R.errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => {
    R.errors.push('unhandled: ' + String((event.reason && event.reason.message) || event.reason));
  });

  async function mixedPage() {
    const settled = await until(() => {
      const S = window.__gpSwipe;
      return S && probe.calls >= 1 && !S.feed.loading
        && (S.feed.error || S.swipe.top || S.feed.exhausted);
    }, 8000);
    check(settled, 'the mixed page reached a terminal first-attempt state');

    const S = window.__gpSwipe;
    check(probe.calls === 1, 'the mixed page failed after exactly one library request, got ' + probe.calls);
    check(S && S.feed.error === true, 'the mixed page surfaced the normal recoverable load error');
    check(S && !S.swipe.top && !S.swipe.back, 'no card from a partially valid page was displayed');
    check(S && S.feed.queue.length === 0, 'no card from a partially valid page entered the queue');
    check(S && !S.feed.seen.has(probe.validKey) && !S.feed.seen.has(probe.malformedKey),
      'neither mixed-page row was marked as consumed');

    const retry = document.querySelector('.gps-center button');
    check(!!retry, 'the mixed-page failure offered Retry');
    if (retry) retry.click();

    const recovered = retry && await until(() => (
      probe.calls >= 2 && S.swipe.top && !S.feed.loading
    ), 8000);
    check(!!recovered, 'Retry recovered when the same page became structurally valid');
    check(probe.calls === 2, 'Retry made exactly one additional library request, got ' + probe.calls);
    check(probe.tokens.length === 2 && probe.tokens[0] == null && probe.tokens[1] == null,
      'Retry refetched the identical initial page token');
    check(S && S.swipe.top && S.swipe.top.item.mediaKey === probe.validKey,
      'the valid card appeared only after the clean retry response');
    check(S && !S.feed.seen.has(probe.malformedKey), 'the malformed row was never accepted');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  async function partialCap() {
    const settled = await until(() => {
      const S = window.__gpSwipe;
      return S && S.swipe.top && (probe.calls > 40 || (!S.feed.loading && S.feed.error));
    }, 8000);
    check(settled, 'the sparse 40-page scan reached a terminal state with its one card');

    const S = window.__gpSwipe;
    check(S && S.swipe.top && S.swipe.top.item.mediaKey === probe.validKey,
      'the sole acceptable card remained visible');
    check(S && !S.swipe.back, 'the sparse scan did not invent a second card');
    check(probe.calls === 40, 'the scan stopped before request 41, got ' + probe.calls);
    check(S && S.feed.error === 'scan-paused', 'the feed retained a recoverable scan-paused state');
    check(S && S.feed.loading === false, 'the feed left loading while the buffered card was shown');
    check(S && S.feed.nextPageId === '40', 'the continuation token was retained for an explicit Retry');
    check(probe.tokens[0] == null && probe.tokens[39] === '39',
      'the bounded scan requested the expected first and fortieth page tokens');
    check(!document.querySelector('.gps-center'), 'the pause message stayed behind the visible card');

    const callsAtPause = probe.calls;
    await sleep(250);
    check(probe.calls === callsAtPause, 'showing the card did not auto-start another scan');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  (async function run() {
    if (probe.scenario === 'mixed') await mixedPage();
    else if (probe.scenario === 'partial-cap') await partialCap();
    else check(false, 'unknown feed edge scenario: ' + probe.scenario);
    out('FEED EDGE ' + String(probe.scenario).toUpperCase() + ': ' + R.passed + ' passed, ' + R.failed + ' failed');
    R.done = true;
  })();
})();
