// Focused lcxiM responses for feed failure/boundary regressions. The normal
// mock still handles storage metadata and every non-library RPC.
(function () {
  const scenario = new URLSearchParams(location.search).get('case');
  const baseFetch = window.fetch;
  const probe = window.__feedEdgeProbe = {
    scenario: scenario,
    calls: 0,
    tokens: [],
    validKey: window.__mock.items[0] && window.__mock.items[0][0],
    malformedKey: 'MALFORMED-MIXED-ROW',
    // Rows Google mixes into a normal library page that this client does not
    // model. They must be skipped, never treated as a broken response.
    validKeys: window.__mock.items.map((row) => row[0]),
    processingKey: 'UPLOAD-STILL-PROCESSING',
    junkKeys: ['UNMODELLED-ROW-A', 'UNMODELLED-ROW-B'],
  };

  const response = (payload) => {
    const frame = ['wrb.fr', 'lcxiM', JSON.stringify(payload), null, null, null, 'generic'];
    const text = ")]}'\n\n42\n" + JSON.stringify([frame]) + '\n';
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
  };

  window.fetch = async function (url, init) {
    const target = new URL(String(url), location.href);
    if (target.pathname.indexOf('/data/batchexecute') === -1
      || target.searchParams.get('rpcids') !== 'lcxiM') {
      return baseFetch(url, init);
    }

    const request = JSON.parse(JSON.parse(new URLSearchParams(init.body).get('f.req'))[0][0][1]);
    probe.calls++;
    probe.tokens.push(request[0]);
    window.__mock.calls.push({ rpcid: 'lcxiM', payload: request });

    const valid = window.__mock.items[0];
    await new Promise((resolve) => setTimeout(resolve, 5));

    if (scenario === 'mixed') {
      // First response includes one fully valid photo and one row that parses
      // but cannot safely be persisted because its dedup key is absent. Retry
      // returns the valid page so the test can prove the same token was reused.
      if (probe.calls === 1) {
        const malformed = [
          probe.malformedKey,
          ['pic0.svg?mixed=1', 1200, 800],
          valid[2] - 1,
          null,
        ];
        return response([[valid, malformed], null, String(valid[2])]);
      }
      return response([[valid], null, String(valid[2])]);
    }

    if (scenario === 'partial-cap') {
      // Thirty-nine valid empty continuation pages, then one acceptable card
      // on page forty. A request after that is evidence that the scan cap was
      // bypassed; make it a final empty page so a broken build still settles.
      if (probe.calls < 40) return response([[], String(probe.calls), null]);
      if (probe.calls === 40) return response([[valid], '40', String(valid[2])]);
      return response([[], null, null]);
    }

    if (scenario === 'realistic') {
      // A realistic single page: three ordinary photos interleaved with rows
      // this client cannot parse — a null padding row and an upload that has
      // no thumbnail yet. Both are normal in a live library.
      const rows = [
        window.__mock.items[0],
        null,
        window.__mock.items[1],
        [probe.processingKey, null, window.__mock.items[1][2] - 1, 'DK-PROCESSING'],
        window.__mock.items[2],
      ];
      return response([rows, null, String(window.__mock.items[2][2])]);
    }

    if (scenario === 'string-ts') {
      // batchexecute serialises int64 fields as JSON strings. The page-level
      // timestamp is already handled that way, so a row timestamp can arrive
      // as a string too. Cards must still be produced.
      const rows = window.__mock.items.map((row) => {
        const copy = row.slice();
        copy[2] = String(row[2]);
        return copy;
      });
      return response([rows, null, String(window.__mock.items[0][2])]);
    }

    if (scenario === 'no-usable') {
      // A non-empty page in which nothing parses at all: the response shape
      // really did change. This must fail fast instead of paging the whole
      // library behind a Loading spinner.
      const rows = [[probe.junkKeys[0], null, null, null], [probe.junkKeys[1], null, null, null]];
      return response([rows, '1', null]);
    }

    throw new Error('unknown feed edge scenario: ' + scenario);
  };
})();
