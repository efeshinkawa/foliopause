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

  // One ordinary photo alongside a row whose dedup key is absent. The photo
  // must still be served; only the unusable row is skipped. This previously
  // asserted that the whole page was rejected, which is what made real
  // libraries show "Could not load the list" instead of any cards.
  async function mixedPage() {
    const settled = await until(() => {
      const S = window.__gpSwipe;
      return S && probe.calls >= 1 && !S.feed.loading
        && (S.feed.error || S.swipe.top || S.feed.exhausted);
    }, 8000);
    check(settled, 'the mixed page reached a terminal first-attempt state');

    const S = window.__gpSwipe;
    check(probe.calls === 1, 'the mixed page needed exactly one library request, got ' + probe.calls);
    check(S && S.feed.error === false,
      'a single unusable row did not fail the page, got ' + (S && JSON.stringify(S.feed.error)));
    check(S && S.swipe.top && S.swipe.top.item.mediaKey === probe.validKey,
      'the valid photo on the mixed page was displayed');
    check(S && S.feed.seen.has(probe.validKey), 'the valid row was consumed exactly once');
    check(S && !S.feed.seen.has(probe.malformedKey), 'the row without a dedup key was never accepted');
    check(S && S.feed.queue.every((it) => it.mediaKey !== probe.malformedKey),
      'the row without a dedup key never entered the queue');
    check(!document.querySelector('.gps-center'), 'no error panel was shown for a usable page');
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

  // A live library page mixes in rows this client does not model. Skipping
  // them is normal; only a page where nothing at all parses is a real schema
  // failure. Treating any single unmodelled row as fatal made FolioPause show
  // "Could not load the list" on real accounts.
  async function realisticPage() {
    const settled = await until(() => {
      const S = window.__gpSwipe;
      return S && probe.calls >= 1 && !S.feed.loading
        && (S.feed.error || S.swipe.top || S.feed.exhausted);
    }, 8000);
    check(settled, 'the realistic page reached a terminal state');

    const S = window.__gpSwipe;
    check(S && S.feed.error === false,
      'a page with unmodelled rows loaded without an error state, got ' + (S && JSON.stringify(S.feed.error)));
    check(!!(S && S.swipe.top), 'a card was displayed from the parseable rows');
    check(probe.calls === 1, 'the realistic page needed exactly one request, got ' + probe.calls);

    const served = S ? probe.validKeys.filter((k) => S.feed.seen.has(k)) : [];
    check(served.length === probe.validKeys.length,
      'every parseable photo was served, got ' + served.length + '/' + probe.validKeys.length);
    check(S && !S.feed.seen.has(probe.processingKey),
      'the thumbnail-less upload was skipped rather than served');
    check(S && S.feed.exhausted === true, 'the page without a continuation token finished the source');
    check(!document.querySelector('.gps-center'), 'no loading or error panel remained on screen');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  // The genuine schema-change guard must survive the fix above.
  async function noUsablePage() {
    const settled = await until(() => {
      const S = window.__gpSwipe;
      return S && probe.calls >= 1 && !S.feed.loading && (S.feed.error || S.swipe.top);
    }, 8000);
    check(settled, 'the unparseable page reached a terminal state');

    const S = window.__gpSwipe;
    check(S && S.feed.error === true, 'a page that parsed to zero items surfaced the load error');
    check(probe.calls === 1, 'the unparseable page stopped after one request, got ' + probe.calls);
    check(S && !S.swipe.top && S.feed.queue.length === 0, 'no card came from an unparseable page');
    check(S && probe.junkKeys.every((k) => !S.feed.seen.has(k)), 'no unparseable row was consumed');
    check(!!document.querySelector('.gps-center button'), 'the failure offered Retry');
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  // Google serialises large integers as JSON strings; a row timestamp can
  // arrive that way. Rows must still be usable and the resume cursor numeric.
  async function stringTimestamps() {
    const settled = await until(() => {
      const S = window.__gpSwipe;
      return S && probe.calls >= 1 && !S.feed.loading
        && (S.feed.error || S.swipe.top || S.feed.exhausted);
    }, 8000);
    check(settled, 'the string-timestamp page reached a terminal state');

    const S = window.__gpSwipe;
    check(S && S.feed.error === false,
      'string row timestamps did not fail the page, got ' + (S && JSON.stringify(S.feed.error)));
    check(!!(S && S.swipe.top), 'a card was displayed from string-timestamp rows');
    check(S && S.swipe.top && typeof S.swipe.top.item.ts === 'number' && Number.isFinite(S.swipe.top.item.ts),
      'the served item carries a numeric timestamp');
    const served = S ? probe.validKeys.filter((k) => S.feed.seen.has(k)) : [];
    check(served.length === probe.validKeys.length,
      'every string-timestamp photo was served, got ' + served.length + '/' + probe.validKeys.length);
    check(R.errors.length === 0, 'no runtime errors: ' + R.errors.join(' | '));
  }

  (async function run() {
    if (probe.scenario === 'string-ts') await stringTimestamps();
    else if (probe.scenario === 'realistic') await realisticPage();
    else if (probe.scenario === 'no-usable') await noUsablePage();
    else if (probe.scenario === 'mixed') await mixedPage();
    else if (probe.scenario === 'partial-cap') await partialCap();
    else check(false, 'unknown feed edge scenario: ' + probe.scenario);
    out('FEED EDGE ' + String(probe.scenario).toUpperCase() + ': ' + R.passed + ' passed, ' + R.failed + ' failed');
    R.done = true;
  })();
})();
