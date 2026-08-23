// MV3 service worker: toolbar button + pending-count badge.
//
// The extension requests only warningless activeTab plus site access for
// https://photos.google.com through content_scripts.matches. activeTab lets a
// toolbar click recover an already-open Photos tab after an extension reload.
'use strict';

const PHOTOS_URL = 'https://photos.google.com/';
const message = (key, substitutions, fallback) => (
  substitutions == null ? chrome.i18n.getMessage(key) : chrome.i18n.getMessage(key, substitutions)
) || fallback;

function photosRecoveryUrl(raw) {
  try {
    const current = new URL(raw);
    if (current.protocol !== 'https:' || current.hostname !== 'photos.google.com') return null;
    current.hash = 'gpswipe=open';
    return current.href;
  } catch (e) { return null; }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id != null) {
    try {
      await chrome.tabs.sendMessage(tab.id, { cmd: 'toggle' });
      return;
    } catch (e) { /* no content script in this tab */ }
  }
  if (tab && tab.id != null && typeof tab.url === 'string') {
    const recovery = photosRecoveryUrl(tab.url);
    if (recovery) {
      // Preserve /u/N/ and any query so account-scoped recovery never jumps
      // to the default account. The launcher removes this one-shot marker.
      await chrome.tabs.update(tab.id, { url: recovery });
      return;
    }
  }
  await chrome.tabs.create({ url: PHOTOS_URL + '#gpswipe=open' });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.cmd !== 'pending' || !sender.tab || sender.tab.id == null) return;
  if (!sender.url || sender.url.indexOf(PHOTOS_URL) !== 0) return;
  if (!Number.isSafeInteger(msg.n) || msg.n < 0 || msg.n > 99999) return;
  const n = msg.n;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#b4234b' });
  chrome.action.setTitle({
    tabId,
    title: n
      ? message('pendingTitle', String(n), 'FolioPause — ' + n + ' waiting for review')
      : message('actionTitle', null, 'Open FolioPause'),
  });
});
