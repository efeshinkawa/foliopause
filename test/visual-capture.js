#!/usr/bin/env node
// Capture deterministic desktop/mobile visual-QA scenes from a Chromium
// instance already running with --remote-debugging-port. Used manually; the
// behavior assertions remain in run-browser-tests.js.
'use strict';

const fs = require('fs');
const path = require('path');
const port = parseInt(process.argv[2] || '9440', 10);
const output = path.resolve(process.argv[3] || '.');
const origin = process.argv[4] || 'http://127.0.0.1:8765';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(url) { this.url = url; this.ws = null; this.id = 0; this.pending = new Map(); this.waiters = []; }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id != null) {
        const p = this.pending.get(message.id);
        if (!p) return;
        this.pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(new Error(message.error.message)); else p.resolve(message.result || {});
        return;
      }
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const w = this.waiters[i];
        if (w.method !== message.method) continue;
        this.waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(message.params || {});
      }
    });
    return this;
  }
  send(method, params, timeout) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, timeout || 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  wait(method, timeout) {
    return new Promise((resolve, reject) => {
      const waiter = { method, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => { const i = this.waiters.indexOf(waiter); if (i !== -1) this.waiters.splice(i, 1); reject(new Error('event timeout: ' + method)); }, timeout || 15000);
      this.waiters.push(waiter);
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result && result.result.value;
  }
}

async function waitReady(cdp) {
  for (let i = 0; i < 300; i++) {
    if (await cdp.eval(`document.body && document.body.dataset.visualReady === 'true'`)) return;
    await sleep(20);
  }
  throw new Error('visual fixture did not become ready');
}

(async () => {
  const response = await fetch('http://127.0.0.1:' + port + '/json');
  const targets = await response.json();
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error('No page target');
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  fs.mkdirSync(output, { recursive: true });

  const scenes = [
    { name: 'swipe-dark-desktop', width: 1440, height: 1000, scene: 'swipe', theme: 'dark', mobile: false },
    { name: 'swipe-dark-mobile', width: 390, height: 844, scene: 'swipe', theme: 'dark', mobile: true },
    { name: 'review-dark-mobile', width: 390, height: 844, scene: 'review', theme: 'dark', mobile: true },
    { name: 'settings-light', width: 1024, height: 768, scene: 'settings', theme: 'light', mobile: false },
  ];
  for (const scene of scenes) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: scene.width, height: scene.height, deviceScaleFactor: 1, mobile: scene.mobile,
      screenWidth: scene.width, screenHeight: scene.height,
    });
    const loaded = cdp.wait('Page.loadEventFired');
    const url = origin + '/test/visual.html?n=40&page=12&scene=' + scene.scene + '&theme=' + scene.theme + '&acct=' + scene.name + '-' + Date.now();
    await cdp.send('Page.navigate', { url });
    await loaded;
    await waitReady(cdp);
    await sleep(500);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const file = path.join(output, scene.name + '.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(file);
  }
  cdp.ws.close();
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
