#!/usr/bin/env node
// End-to-end smoke test. With no argument it launches an installed Chromium
// browser itself; pass a debugging port to reuse an already-running instance.
//
// The script intercepts the top-level photos.google.com document, supplies a
// tiny deterministic WIZ_global_data page, and verifies MAIN-world injection,
// the isolated bridge, toolbar badge messaging, toggle messaging, and the MV3
// service worker. No Google account or real photo is touched.
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXTENSION = path.join(ROOT, 'extension');
const EXPECTED_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const EXTENSION_LOCALES = ['en', 'tr', 'it', 'es', 'de'];
const REQUIRED_MESSAGES = ['appName', 'appDescription', 'actionTitle', 'pendingTitle'];
const EXTENSION_LOCALES_COMPLETE = EXTENSION_LOCALES.every((locale) => {
  try {
    const messages = JSON.parse(fs.readFileSync(path.join(EXTENSION, '_locales', locale, 'messages.json'), 'utf8'));
    return REQUIRED_MESSAGES.every((key) => messages[key] && typeof messages[key].message === 'string' && messages[key].message.trim())
      && messages.pendingTitle.placeholders && messages.pendingTitle.placeholders.count
      && messages.pendingTitle.placeholders.count.content === '$1';
  } catch (e) { return false; }
});
let port = parseInt(process.argv[2] || '', 10) || null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function browserCandidates() {
  const env = [process.env.CHROME_BIN, process.env.BROWSER_BIN].filter(Boolean);
  if (process.platform === 'darwin') return env.concat([
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ]);
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const suffixes = ['Google/Chrome/Application/chrome.exe', 'BraveSoftware/Brave-Browser/Application/brave.exe', 'Chromium/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'];
    return env.concat(roots.flatMap((root) => suffixes.map((suffix) => path.join(root, suffix))));
  }
  return env.concat(['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'brave-browser', 'brave', 'microsoft-edge', 'microsoft-edge-stable']);
}

function findBrowser() {
  for (const candidate of Array.from(new Set(browserCandidates()))) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const probe = childProcess.spawnSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error('No Chrome, Brave, Chromium, or Edge executable found. Set CHROME_BIN.');
}

async function launchBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gpswipe-extension-test-'));
  const args = [
    '--headless=new', '--disable-background-networking', '--disable-component-update',
    '--disable-default-apps', '--disable-dev-shm-usage', '--disable-sync',
    '--no-default-browser-check', '--no-first-run', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, '--disable-extensions-except=' + EXTENSION,
    '--load-extension=' + EXTENSION,
  ];
  if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox');
  args.push('about:blank');
  const child = childProcess.spawn(findBrowser(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
  const activePort = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200; i++) {
    if (child.exitCode != null) throw new Error('Browser exited during extension startup\n' + stderr);
    if (fs.existsSync(activePort)) {
      const parsed = parseInt(fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0], 10);
      if (parsed) { port = parsed; return { child, profile, stderr: () => stderr }; }
    }
    await sleep(50);
  }
  throw new Error('Browser did not expose DevToolsActivePort\n' + stderr);
}

async function waitForExit(child, timeout) {
  if (!child || child.exitCode != null || child.signalCode != null) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.removeListener('exit', done); resolve(false); }, timeout);
    const done = () => { clearTimeout(timer); resolve(true); };
    child.once('exit', done);
  });
}

async function stopBrowser(runtime) {
  if (!runtime) return;
  try {
    const info = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    const browser = await new Cdp(info.webSocketDebuggerUrl).open();
    browser.send('Browser.close').catch(() => {});
  } catch (e) { /* signal fallback below */ }
  if (!(await waitForExit(runtime.child, 3000))) runtime.child.kill('SIGTERM');
  if (!(await waitForExit(runtime.child, 1500))) runtime.child.kill('SIGKILL');
  await waitForExit(runtime.child, 1500);
  try { fs.rmSync(runtime.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (e) { console.warn('could not remove extension test profile: ' + e.message); }
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
  }
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
        this.pending.delete(message.id);
        clearTimeout(p.timer);
        if (message.error) p.reject(new Error(message.error.message)); else p.resolve(message.result || {});
        return;
      }
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const waiter = this.waiters[i];
        if (waiter.method !== message.method || (waiter.predicate && !waiter.predicate(message.params || {}))) continue;
        this.waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message.params || {});
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
  wait(method, predicate, timeout) {
    return new Promise((resolve, reject) => {
      const waiter = { method, predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i !== -1) this.waiters.splice(i, 1);
        reject(new Error('CDP event timeout: ' + method));
      }, timeout || 15000);
      this.waiters.push(waiter);
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result && result.result.value;
  }
  close() { if (this.ws) this.ws.close(); }
}

async function targets() {
  const response = await fetch('http://127.0.0.1:' + port + '/json');
  if (!response.ok) throw new Error('Could not read CDP targets');
  return response.json();
}

(async () => {
  let page;
  let worker;
  let runtime;
  try {
    if (!port) runtime = await launchBrowser();
    const initial = await targets();
    const pageTarget = initial.find((target) => target.type === 'page');
    if (!pageTarget) throw new Error('No page target');
    page = await new Cdp(pageTarget.webSocketDebuggerUrl).open();
    await Promise.all([
      page.send('Page.enable'),
      page.send('Runtime.enable'),
      page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://photos.google.com/*', resourceType: 'Document', requestStage: 'Request' }] }),
    ]);

    const paused = page.wait('Fetch.requestPaused', (p) => p.resourceType === 'Document');
    const loaded = page.wait('Page.loadEventFired');
    loaded.catch(() => {}); // avoid an unhandled rejection if interception fails first
    const navigation = page.send('Page.navigate', { url: 'https://photos.google.com/?gpswipeSmoke=' + Date.now() + '#gpswipe=open' });
    const request = await paused;
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Photos smoke</title></head>
      <body><main id="host">Google Photos mock host</main><script>
      window.__gpSwipeTestMode=true;
      window.WIZ_global_data={SNlM0e:"AT-SMOKE",FdrFJe:"-1",cfb2h:"boq_smoke",eptZe:"/_/PhotosUi/",oPEP7c:"smoke"};
      window.fetch=async function(url){
        var id=new URL(String(url),location.href).searchParams.get("rpcids");
        var payload=id==="lcxiM"?[[],null,null]:[[]];
        var frame=["wrb.fr",id,JSON.stringify(payload),null,null,null,"generic"];
        return new Response(")]}'\\n"+JSON.stringify([frame])+"\\n",{status:200,headers:{"content-type":"application/json"}});
      };
      </script></body></html>`;
    await page.send('Fetch.fulfillRequest', {
      requestId: request.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }, { name: 'cache-control', value: 'no-store' }],
      body: Buffer.from(html).toString('base64'),
    });
    await navigation;
    await loaded;
    await sleep(1800);

    const injected = await page.eval(`({
      href: location.href,
      publicKeys: Object.keys(window.__gpSwipe || {}).sort(),
      version: window.__gpSwipe && window.__gpSwipe.version,
      root: !!document.querySelector('#gps-root'),
      open: !!document.querySelector('#gps-root') && document.querySelector('#gps-root').style.display !== 'none',
      fab: !!document.querySelector('#gps-fab'),
      wiz: !!window.WIZ_global_data && window.WIZ_global_data.SNlM0e === 'AT-SMOKE',
      internalsHidden: !window.__gpSwipe || !('api' in window.__gpSwipe)
    })`);

    await page.eval(`(window.postMessage({__gpswipe:'pending',n:7},location.origin),true)`);
    await sleep(500);
    const after = await targets();
    const workerTarget = after.find((target) => target.type === 'service_worker' && /\/background\.js$/.test(target.url));
    if (!workerTarget) throw new Error('MV3 service worker target missing');
    worker = await new Cdp(workerTarget.webSocketDebuggerUrl).open();
    await worker.send('Runtime.enable');
    const extension = await worker.eval(`(async function(){
      const manifest=chrome.runtime.getManifest();
      const tabs=await chrome.tabs.query({});
      const tab=tabs.find(function(t){return t.active;})||tabs[0];
      if(!tab)return {manifest:manifest,tab:false,tabs:tabs};
      const badge=await chrome.action.getBadgeText({tabId:tab.id});
      const recovery=photosRecoveryUrl('https://photos.google.com/u/3/search?q=dogs#old');
      const localized={appName:chrome.i18n.getMessage('appName'),actionTitle:chrome.i18n.getMessage('actionTitle'),pendingTitle:chrome.i18n.getMessage('pendingTitle','7')};
      await chrome.tabs.sendMessage(tab.id,{cmd:'toggle'});
      return {version:manifest.version,permissions:manifest.permissions||[],matches:manifest.content_scripts[0].matches,badge:badge,recovery:recovery,localized:localized,tab:true,tabId:tab.id};
    })()`);
    await sleep(400);
    const toggled = await page.eval(`document.querySelector('#gps-root').style.display === 'none'`);

    const checks = {
      photosOriginPreserved: injected.href.startsWith('https://photos.google.com/'),
      oneShotMarkerCleared: !new URL(injected.href).hash,
      mainWorldInjected: injected.root && injected.fab && injected.wiz,
      autoOpenWorked: injected.open,
      minimalPublicApi: JSON.stringify(injected.publicKeys) === JSON.stringify(['close', 'open', 'version']) && injected.internalsHidden,
      runtimeVersion: injected.version === EXPECTED_VERSION && extension.version === EXPECTED_VERSION,
      minimalApiPermissionOnly: JSON.stringify(extension.permissions) === JSON.stringify(['activeTab']),
      recoveryPreservesAccountAndQuery: extension.recovery === 'https://photos.google.com/u/3/search?q=dogs#gpswipe=open',
      photosOnlyMatch: JSON.stringify(extension.matches) === JSON.stringify(['https://photos.google.com/*']),
      bridgeBadge: extension.badge === '7',
      localizedExtensionChrome: extension.localized.appName.includes('FolioPause')
        && extension.localized.actionTitle.includes('FolioPause') && extension.localized.pendingTitle.includes('7'),
      fiveExtensionLocalesComplete: EXTENSION_LOCALES_COMPLETE,
      toolbarToggleBridge: toggled === true,
      serviceWorkerRegistered: extension.tab === true,
    };
    const failed = Object.keys(checks).filter((key) => !checks[key]);
    console.log(JSON.stringify({ ok: failed.length === 0, checks, injected, extension, failed }, null, 2));
    if (failed.length) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error && error.stack || error) }, null, 2));
    process.exitCode = 1;
  } finally {
    if (page) page.close();
    if (worker) worker.close();
    await stopBrowser(runtime);
  }
})();
