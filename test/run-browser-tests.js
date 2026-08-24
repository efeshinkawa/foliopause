#!/usr/bin/env node
// Zero-dependency browser runner for the HTML integration suites.
//
// It serves the repository with no-cache headers, launches an installed
// Chromium-family browser with a temporary profile, and drives it over the
// Chrome DevTools Protocol pipe. No Playwright/Puppeteer package is required.
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROOT_REAL = fs.realpathSync(ROOT);
const PAGE_TIMEOUT_MS = 120000;
const CDP_TIMEOUT_MS = 15000;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function browserCandidates() {
  const env = [process.env.CHROME_BIN, process.env.BROWSER_BIN].filter(Boolean);
  if (process.platform === 'darwin') {
    return env.concat([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]);
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const suffixes = [
      'Google/Chrome/Application/chrome.exe',
      'BraveSoftware/Brave-Browser/Application/brave.exe',
      'Chromium/Application/chrome.exe',
      'Microsoft/Edge/Application/msedge.exe',
    ];
    return env.concat(roots.flatMap((root) => suffixes.map((suffix) => path.join(root, suffix))));
  }
  return env.concat([
    'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser',
    'brave-browser', 'brave', 'microsoft-edge', 'microsoft-edge-stable',
  ]);
}

function findBrowser() {
  for (const candidate of Array.from(new Set(browserCandidates()))) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const probe = childProcess.spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (!probe.error && probe.status === 0) {
      const version = String(probe.stdout || probe.stderr || '').trim();
      return { command: candidate, version: version || path.basename(candidate) };
    }
  }
  throw new Error('No Chrome, Brave, Chromium, or Edge executable found. Set CHROME_BIN to its path.');
}

function startServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch (e) { res.writeHead(400).end('Bad request'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Method not allowed');
      return;
    }

    if (!pathname.startsWith('/test/') && !pathname.startsWith('/dist/')) {
      res.writeHead(404).end('Not found');
      return;
    }
    const file = path.resolve(ROOT, '.' + pathname);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.realpath(file, (realErr, realFile) => {
      if (realErr || (realFile !== ROOT_REAL && !realFile.startsWith(ROOT_REAL + path.sep))) {
        res.writeHead(realErr ? 404 : 403).end(realErr ? 'Not found' : 'Forbidden');
        return;
      }
      fs.stat(realFile, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
        res.setHeader('Content-Type', MIME[path.extname(realFile).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        if (req.method === 'HEAD') { res.writeHead(200).end(); return; }
        const stream = fs.createReadStream(realFile);
        stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
        stream.pipe(res);
      });
    });
  });
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.testSockets = sockets;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      resolve({ server, origin: 'http://127.0.0.1:' + address.port });
    });
  });
}

class CdpPipe {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    this.nextId = 0;
    this.pending = new Map();
    this.waiters = [];
    this.buffer = Buffer.alloc(0);

    output.on('data', (chunk) => this.onData(chunk));
    output.on('error', (error) => this.abort(error));
    output.on('close', () => this.abort(new Error('CDP pipe closed')));
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const end = this.buffer.indexOf(0);
      if (end === -1) return;
      const raw = this.buffer.subarray(0, end).toString('utf8');
      this.buffer = this.buffer.subarray(end + 1);
      if (!raw) continue;
      let message;
      try { message = JSON.parse(raw); }
      catch (error) { this.abort(new Error('Invalid CDP response: ' + error.message)); continue; }
      this.dispatch(message);
    }
  }

  dispatch(message) {
    if (message.id != null) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
      return;
    }

    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const waiter = this.waiters[i];
      if (waiter.method !== message.method || waiter.sessionId !== (message.sessionId || null)) continue;
      this.waiters.splice(i, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message.params || {});
    }
  }

  send(method, params, sessionId, timeoutMs) {
    const id = ++this.nextId;
    const message = { id, method, params: params || {} };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, timeoutMs || CDP_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.input.write(JSON.stringify(message) + '\0', (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  waitFor(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = { method, sessionId: sessionId || null, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(new Error('CDP event timeout: ' + method));
      }, timeoutMs || CDP_TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }

  abort(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.length = 0;
  }
}

function launchBrowser(browser, profile) {
  const args = [
    '--headless',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-gpu',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-default-browser-check',
    '--no-first-run',
    '--remote-debugging-pipe',
    '--user-data-dir=' + profile,
    '--window-size=1440,1000',
  ];
  // Root containers cannot use Chromium's user-namespace sandbox. Normal
  // developer runs retain the browser sandbox instead of disabling it merely
  // because the OS is Linux.
  if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox');

  const child = childProcess.spawn(browser.command, args, {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-12000);
  });
  return { child, cdp: new CdpPipe(child.stdio[3], child.stdio[4]), stderr: () => stderr };
}

function pageExpression(timeoutMs) {
  return `(function () {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      function snapshot(result) {
        return {
          passed: Number(result.passed) || 0,
          failed: Number(result.failed) || 0,
          errors: Array.isArray(result.errors) ? result.errors.map(String) : [],
          log: (document.getElementById('log') || {}).textContent || result.log || '',
          trashChunks: window.__mock && Array.isArray(window.__mock.calls)
            ? window.__mock.calls.filter(function (call) { return call.rpcid === 'XwAOJf' && call.payload[1] === 1; })
                .map(function (call) { return call.payload[2].length; })
            : [],
        };
      }
      var timer = setInterval(function () {
        var result = window.__results;
        if (result && (result.done || (Array.isArray(result.errors) && result.errors.length))) {
          clearInterval(timer);
          resolve(snapshot(result));
          return;
        }
        if (!result && document.readyState === 'complete' && Date.now() - started > 5000) {
          clearInterval(timer);
          reject(new Error('test harness did not start'));
          return;
        }
        if (Date.now() - started > ${timeoutMs}) {
          clearInterval(timer);
          reject(new Error('page test timeout'));
        }
      }, 20);
    });
  })()`;
}

async function runPage(cdp, spec, origin, runId) {
  const account = encodeURIComponent(runId + '-' + spec.label);
  const url = origin + spec.path + (spec.path.includes('?') ? '&' : '?') + 'acct=' + account;
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const targetId = created.targetId;
  let sessionId = null;
  try {
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    sessionId = attached.sessionId;
    await Promise.all([
      cdp.send('Page.enable', {}, sessionId),
      cdp.send('Runtime.enable', {}, sessionId),
    ]);
    const loaded = cdp.waitFor('Page.loadEventFired', sessionId, CDP_TIMEOUT_MS);
    const [navigation] = await Promise.all([
      cdp.send('Page.navigate', { url }, sessionId),
      loaded,
    ]);
    if (navigation.errorText) throw new Error('Navigation failed: ' + navigation.errorText);

    const evaluated = await cdp.send('Runtime.evaluate', {
      expression: pageExpression(PAGE_TIMEOUT_MS),
      awaitPromise: true,
      returnByValue: true,
    }, sessionId, PAGE_TIMEOUT_MS + CDP_TIMEOUT_MS);
    if (evaluated.exceptionDetails) {
      const detail = evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description;
      throw new Error('Page evaluation failed: ' + (detail || evaluated.exceptionDetails.text));
    }
    const value = evaluated.result && evaluated.result.value;
    if (!value || typeof value.passed !== 'number' || typeof value.failed !== 'number') {
      throw new Error('Page returned no usable test result');
    }
    return value;
  } finally {
    try { await cdp.send('Target.closeTarget', { targetId }, null, 3000); } catch (e) { /* browser cleanup handles it */ }
  }
}

function summarize(spec, result) {
  const total = result.passed + result.failed;
  const suffix = spec.chunks ? ' (trash chunks ' + result.trashChunks.join('+') + ')' : '';
  console.log(spec.label + ': ' + result.passed + '/' + total + ' passed' + suffix);

  const failures = [];
  if (result.failed) failures.push(result.failed + ' failed assertion(s)');
  if (result.errors.length) failures.push(result.errors.length + ' runtime error(s): ' + result.errors.join(' | '));
  if (spec.minimum && total < spec.minimum) failures.push('expected at least ' + spec.minimum + ' assertions, got ' + total);
  if (spec.chunks && JSON.stringify(result.trashChunks) !== JSON.stringify(spec.chunks)) {
    failures.push('expected trash chunks ' + spec.chunks.join('+') + ', got ' + (result.trashChunks.join('+') || 'none'));
  }
  if (failures.length) {
    const tail = String(result.log || '').trim().split('\n').slice(-20).join('\n');
    throw new Error(spec.label + ': ' + failures.join('; ') + (tail ? '\n' + tail : ''));
  }
}

async function stopBrowser(runtime) {
  if (!runtime) return;
  const child = runtime.child;
  const alive = () => child.exitCode == null && child.signalCode == null;
  const waitForExit = (timeoutMs) => {
    if (!alive()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer;
      const finish = (exited) => {
        clearTimeout(timer);
        child.removeListener('exit', onExit);
        child.removeListener('close', onExit);
        resolve(exited);
      };
      const onExit = () => finish(true);
      child.once('exit', onExit);
      child.once('close', onExit);
      timer = setTimeout(() => finish(!alive()), timeoutMs);
    });
  };
  if (alive()) try { await runtime.cdp.send('Browser.close', {}, null, 3000); } catch (e) { /* escalate below */ }
  if (await waitForExit(3000)) return;
  try { child.kill('SIGTERM'); } catch (e) { /* already gone */ }
  if (await waitForExit(1500)) return;
  try { child.kill('SIGKILL'); } catch (e) { /* already gone */ }
  await waitForExit(1500);
}

function stopServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    let timer = null;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      for (const socket of server.testSockets || []) socket.destroy();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      done();
    }, 2000);
    server.close(done);
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  });
}

(async function main() {
  let server;
  let runtime;
  let profile;
  let origin;
  let cleanupPromise = null;
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      await stopBrowser(runtime);
      await stopServer(server);
      if (profile) {
        try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
        catch (error) { console.warn('could not remove temporary browser profile: ' + error.message); }
      }
    })();
    return cleanupPromise;
  };
  const signalHandlers = new Map([
    ['SIGINT', () => { process.exitCode = 130; cleanup().finally(() => process.exit(130)); }],
    ['SIGTERM', () => { process.exitCode = 143; cleanup().finally(() => process.exit(143)); }],
  ]);
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);
  try {
    const browser = findBrowser();
    ({ server, origin } = await startServer());
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gpswipe-browser-test-'));
    runtime = launchBrowser(browser, profile);

    const earlyExit = new Promise((resolve, reject) => {
      runtime.child.once('error', reject);
      runtime.child.once('exit', (code, signal) => reject(new Error(
        'Browser exited before tests completed (' + (signal || code) + ')\n' + runtime.stderr()
      )));
    });
    // Avoid an unhandled rejection if a normal Browser.close wins at shutdown.
    earlyExit.catch(() => {});

    const specs = [
      { label: 'console-prod', path: '/test/production-console.html?n=12&page=6&every=0', minimum: 8 },
      { label: 'userscript-prod', path: '/test/production-userscript.html?n=12&page=6&every=0', minimum: 8 },
      { label: 'behavior', path: '/test/harness.html?n=30&page=10&every=0', minimum: 120 },
      { label: 'safety', path: '/test/safety.html?n=80&page=10&every=0&emptyFirst=1', minimum: 62 },
      { label: 'feed-refill', path: '/test/feed-refill.html?n=0&page=10&every=0', minimum: 12 },
      { label: 'feed-string-timestamps', path: '/test/feed-edge.html?case=string-ts&n=3&page=3&every=0', minimum: 6 },
      { label: 'feed-realistic-page', path: '/test/feed-edge.html?case=realistic&n=3&page=3&every=0', minimum: 9 },
      { label: 'feed-no-usable-rows', path: '/test/feed-edge.html?case=no-usable&n=1&page=1&every=0', minimum: 6 },
      { label: 'feed-mixed-malformed', path: '/test/feed-edge.html?case=mixed&n=1&page=1&every=0', minimum: 9 },
      { label: 'feed-partial-cap', path: '/test/feed-edge.html?case=partial-cap&n=1&page=1&every=0', minimum: 11 },
      { label: 'multitab', path: '/test/lock.html', minimum: 7 },
      { label: 'coverage', path: '/test/coverage.html?n=45&page=9&every=0', minimum: 14 },
      { label: 'batching', path: '/test/coverage.html?n=180&page=30&every=0', minimum: 33, chunks: [50, 10] },
    ];
    const runId = Date.now().toString(36) + '-' + process.pid;
    for (const spec of specs) {
      const result = await Promise.race([
        runPage(runtime.cdp, spec, origin, runId),
        earlyExit,
      ]);
      summarize(spec, result);
    }
  } catch (error) {
    console.error('browser tests failed: ' + (error && error.stack || error));
    process.exitCode = 1;
  } finally {
    await cleanup();
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
  }
})();
