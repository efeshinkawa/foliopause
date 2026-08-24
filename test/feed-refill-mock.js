// Force the library RPC to return valid empty continuation pages forever.
// Google can legitimately return an empty intermediate page, so FolioPause
// must follow a bounded number of them. It must not turn the 40-page guard in
// feed.ensure() into an automatic series of new 40-page scans.
(function () {
  const baseFetch = window.fetch;
  const probe = window.__refillProbe = { calls: 0, tokens: [] };

  window.fetch = async function (url, init) {
    const target = new URL(String(url), location.href);
    if (target.pathname.indexOf('/data/batchexecute') === -1
      || target.searchParams.get('rpcids') !== 'lcxiM') {
      return baseFetch(url, init);
    }

    const payload = JSON.parse(JSON.parse(new URLSearchParams(init.body).get('f.req'))[0][0][1]);
    probe.calls++;
    probe.tokens.push(payload[0]);
    window.__mock.calls.push({ rpcid: 'lcxiM', payload: payload });

    // Keep each page token unique so this exercises the scan guard, not the
    // separate repeated-token protection.
    const nextPageId = String(probe.calls);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const frame = ['wrb.fr', 'lcxiM', JSON.stringify([[], nextPageId, null]), null, null, null, 'generic'];
    const text = ")]}'\n\n42\n" + JSON.stringify([frame]) + '\n';
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
  };
})();
