// Isolated-world content script.
//
// The app itself runs in the page's MAIN world, because it needs the page's own
// session token (window.WIZ_global_data) to talk to Google Photos. MAIN-world
// scripts cannot use chrome.* APIs, so this tiny bridge relays between the
// extension and the page via window.postMessage.
'use strict';

// toolbar button -> page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.cmd === 'toggle') {
    window.postMessage({ __gpswipe: 'toggle' }, location.origin);
  }
});

// page -> toolbar badge ("N photos waiting for review")
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.__gpswipe !== 'pending' || !Number.isSafeInteger(d.n) || d.n < 0 || d.n > 99999) return;
  try {
    const sent = chrome.runtime.sendMessage({ cmd: 'pending', n: d.n });
    if (sent && typeof sent.catch === 'function') sent.catch(() => {});
  } catch (err) {
    // the service worker may be asleep or the extension reloading; harmless
  }
});

// MAIN-world code may report before this isolated bridge exists. This
// handshake asks it to resend the latest count once both sides are listening.
window.postMessage({ __gpswipe: 'bridge-ready' }, location.origin);
