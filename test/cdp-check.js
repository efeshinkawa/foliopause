#!/usr/bin/env node
// Minimal CDP driver: connects to a Chromium-family browser started with
// --remote-debugging-port and evaluates an expression in the first page target.
//
//   node test/cdp-check.js <port> <urlSubstring> <waitMs> '<expression>'
//
// Used to smoke-test the packed extension end to end (does the MAIN-world
// content script really inject itself?), which the console build cannot prove.
'use strict';

const [, , portArg, urlPart, waitArg, expr] = process.argv;
const port = parseInt(portArg, 10) || 9333;
const waitMs = parseInt(waitArg, 10) || 6000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch('http://127.0.0.1:' + port + '/json');
  return res.json();
}

(async () => {
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    try {
      const list = await targets();
      page = list.find((t) => t.type === 'page' && (!urlPart || (t.url || '').includes(urlPart)));
    } catch (e) { /* browser not up yet */ }
    if (!page) await sleep(500);
  }
  if (!page) { console.log(JSON.stringify({ ok: false, error: 'no matching page target' })); process.exit(2); }

  await sleep(waitMs);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const done = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise: true },
      }));
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== 1) return;
      const r = msg.result || {};
      if (r.exceptionDetails) reject(new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || '')));
      else resolve(r.result && r.result.value);
      ws.close();
    });
    ws.addEventListener('error', () => reject(new Error('websocket error')));
    setTimeout(() => reject(new Error('cdp timeout')), 30000);
  });

  try {
    const value = await done;
    console.log(JSON.stringify({ ok: true, url: page.url, value }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, url: page.url, error: String(e.message) }));
    process.exit(1);
  }
})();
