// ---------------------------------------------------------------------------
// Launcher — only included in the extension and userscript builds. The console
// build opens the UI immediately instead.
// ---------------------------------------------------------------------------

let fabEl = null;
let fabBadge = null;
let sharedPending = null;
let lastReportedPending = null;
let lastBroadcastPending = null;
let pendingChannel = null;

try {
  pendingChannel = new BroadcastChannel('gpSwipe-pending-' + ACCT);
  pendingChannel.addEventListener('message', (e) => {
    const n = e.data && e.data.n;
    if (!Number.isSafeInteger(n) || n < 0 || n > 99999) return;
    sharedPending = n;
    paintLauncher(n);
  });
} catch (e) { pendingChannel = null; }

function buildFab() {
  fabBadge = h('span', { class: 'b', text: '0' });
  fabEl = h('button', {
    id: 'gps-fab',
    title: t('app'),
    'aria-label': t('app'),
    onclick: () => app.show(),
  }, brandMark(), h('span', { text: t('app') }), fabBadge);
  return fabEl;
}

// The host is a single-page app that rewrites large parts of the DOM, so
// re-attach the launcher if it ever disappears.
function mountFab() {
  if (!fabEl) buildFab();
  if (!document.getElementById('gps-fab')) document.documentElement.appendChild(fabEl);
  onLauncherUpdate();
}

function paintLauncher(n) {
  if (!fabEl) return;
  fabEl.style.display = app.open ? 'none' : '';
  fabBadge.textContent = fmtNum(n);
  fabBadge.hidden = n === 0;
  reportPending(n);
}

function onLauncherUpdate() {
  if (!fabEl) return;
  const local = marked.size;
  if (app.open && store.hasLock) {
    sharedPending = local;
    if (pendingChannel && lastBroadcastPending !== local) {
      lastBroadcastPending = local;
      try { pendingChannel.postMessage({ n: local }); } catch (e) { /* ignore */ }
    }
  }
  paintLauncher(sharedPending == null ? local : sharedPending);
}

// The pending count needs the local stores, which are only read when the app is
// opened; read them once up front so the badge is right from the start.
(async function primeCounts() {
  try { await store.init(); } catch (e) { /* the UI will show the fallback warning */ }
  if (sharedPending == null) sharedPending = marked.size;
  onLauncherUpdate();
})();

// Toolbar button → bridge content script → here. The page could forge this
// message, but the only thing it can trigger is opening our own UI.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (!d) return;
  if (d.__gpswipe === 'bridge-ready') {
    lastReportedPending = null;
    onLauncherUpdate();
    return;
  }
  if (d.__gpswipe === 'toggle') {
    if (app.open) app.close(); else app.show();
  }
});

function reportPending(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 99999 || n === lastReportedPending) return;
  lastReportedPending = n;
  try { window.postMessage({ __gpswipe: 'pending', n: n }, location.origin); } catch (e) { /* ignore */ }
}

mountFab();
setInterval(mountFab, 10000);

// When the toolbar is clicked from a non-Photos tab, the service worker opens
// this URL. Remove the one-shot marker, then open automatically.
if (location.hash === '#gpswipe=open') {
  setTimeout(() => {
    // Some Chromium navigations apply the fragment at the very end of commit;
    // remove it on the next task so the one-shot marker does not survive reloads.
    try { window.history.replaceState(window.history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    app.show();
  }, 0);
}
