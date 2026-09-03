// ---------------------------------------------------------------------------
// Copy. Turkish is primary (the tool was built for a Turkish Google Photos UI);
// everything falls back to English for any other locale.
// ---------------------------------------------------------------------------

const PRODUCT_NAME = 'FolioPause';
const LANGUAGE_CODES = ['tr', 'en', 'it', 'es', 'de'];
const LANGUAGE_LOCALES = { tr: 'tr-TR', en: 'en-US', it: 'it-IT', es: 'es-ES', de: 'de-DE' };
const LANGUAGE_LABELS = { tr: 'Türkçe', en: 'English', it: 'Italiano', es: 'Español', de: 'Deutsch' };

function languageCode(value) {
  const code = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_CODES.indexOf(code) === -1 ? null : code;
}

function detectLanguage() {
  // Prefer the current Google Photos page language, then the browser's ordered
  // preferences (which normally inherit the OS locale), and finally English.
  const candidates = [document.documentElement.lang]
    .concat(Array.isArray(navigator.languages) ? navigator.languages : [])
    .concat([navigator.language]);
  for (const candidate of candidates) {
    const code = languageCode(candidate);
    if (code) return code;
  }
  return 'en';
}

let LANG = detectLanguage();

const STRINGS = {
  tr: {
    app: 'FolioPause',
    // app bar
    reviewed: '{n} incelendi',
    reviewBtn: 'Gözden geçir',
    reviewPending: 'Gözden geçir — {n} fotoğraf bekliyor',
    settings: 'Ayarlar',
    help: 'Kısayollar',
    close: 'Kapat',
    // swipe actions
    del: 'Sil', keep: 'Tut', undo: 'Geri al', open: 'Aç',
    stampDel: 'SİL', stampKeep: 'TUT',
    prev: 'Önceki', next: 'Sonraki',
    // card chips
    video: 'Video', live: 'Hareketli', fav: 'Favori', archived: 'Arşiv',
    playVideo: 'Videoyu oynat',
    // states
    loading: 'Yükleniyor…',
    scanPausedTitle: 'Bu bölümde yeni fotoğraf bulunamadı',
    scanPausedSub: 'Uzun bir aralık tarandı. Kaldığın yerden devam etmek için tekrar dene.',
    doneTitle: 'Hepsi bitti',
    doneSub: 'Bu kaynakta incelenmemiş fotoğraf kalmadı. Ayarlardan kaynağı ya da başlangıç tarihini değiştirebilirsin.',
    doneStats: 'Bu oturumda {k} tutuldu, {d} silindi.',
    errLoadTitle: 'Liste yüklenemedi',
    errLoadSub: 'Bağlantı ya da oturum sorunu olabilir.',
    retry: 'Tekrar dene', reloadPage: 'Sayfayı yenile',
    localLoadTitle: 'Yerel kayıt açılamadı',
    localLoadBody: 'Tutulan ve inceleme bekleyen fotoğrafların tamamı güvenle okunamadı. Fotoğrafları yeniden sunmamak için kaydırma durduruldu; tekrar deneyebilir veya kapatabilirsin.',
    errToken: 'Oturum bilgisi bulunamadı — photos.google.com ana sayfasını yenile',
    // marking / undo
    marked: 'Silinmek üzere işaretlendi',
    keptToast: 'Tutuldu',
    undone: 'Geri alındı',
    // review prompt
    promptTitle: '{n} fotoğraf inceledin',
    promptBody: '{m} fotoğrafı silmek için işaretledin. Şimdi hepsine bir göz atıp onaylamak ister misin? Onaylayana kadar hiçbir şey silinmez.',
    later: 'Sonra',
    reviewNow: 'Gözden geçir',
    // review screen
    reviewTitle: 'Silinecek fotoğraflar',
    reviewSub: '{n} fotoğraf silinecek, {s} tanesi tutulacak. Bir fotoğrafa dokunarak listeden çıkarabilirsin.',
    reviewEmptyTitle: 'İşaretli fotoğraf yok',
    reviewEmptySub: 'Sola kaydırdığın fotoğraflar burada birikir; sonra hepsini tek seferde silersin.',
    backToSwipe: 'Kaydırmaya dön',
    selectAll: 'Tümünü seç',
    selectNone: 'Hiçbirini seçme',
    willDelete: '{n} fotoğraf silinecek',
    willDeleteNone: 'Hiçbir fotoğraf seçili değil',
    deleteNow: 'Çöp kutusuna taşı',
    keepAll: 'Hepsini tut',
    undoAll: 'Hepsini geri al',
    allUnmarked: '{n} fotoğraf yeniden kaydırmaya döndü',
    spared: 'Tutulacak',
    // deleting
    keeping: 'Tutulacaklar kaydediliyor…',
    keptBatch: '{n} fotoğraf tutuldu; hiçbiri silinmedi',
    deleting: 'Çöp kutusuna taşınıyor… ({i}/{n})',
    deletedToast: '{n} fotoğraf çöp kutusuna taşındı',
    deletedPartial: '{ok} fotoğraf taşındı, {fail} tanesi taşınamadı',
    restoreAction: 'GERİ AL',
    restoring: 'Geri yükleniyor…',
    restoredToast: '{n} fotoğraf geri yüklendi',
    restoreFailed: 'Geri yüklenemedi — Google Fotoğraflar > Çöp Kutusu\'ndan elle geri alabilirsin',
    // verification
    verifying: 'İlk silme doğrulanıyor…',
    verifyOk: 'Silme doğrulandı — fotoğraflar Çöp Kutusu\'nda',
    verifyWarn: 'Silme doğrulanamadı. Çöp Kutusu\'nu kontrol et; fotoğraflar orada değilse Google\'ın arayüzü değişmiş olabilir.',
    openTrash: 'Çöp Kutusu\'nu aç',
    sessionBroken: 'Silinemedi — oturumun sona ermiş olabilir. photos.google.com sayfasını yenileyip tekrar dene.',
    localSaveFailed: 'Yerel kayıt güvenle güncellenemedi; hiçbir öğe listeden sessizce çıkarılmadı. Çöp Kutusu\'nu kontrol et.',
    otherTabTitle: 'FolioPause başka bir sekmede açık',
    otherTabBody: 'Aynı Google hesabında iki sekmenin çakışmasını önlemek için yalnızca biri karar verebilir. Diğer sekmede FolioPause\'u kapatıp burada tekrar aç.',
    lockUnavailableTitle: 'Güvenli sekme kilidi kullanılamıyor',
    lockUnavailableBody: 'Tarayıcı bu hesap için gerekli güvenli sekme kilidini sağlayamadı. İki sekmenin kararları çakışabileceği için FolioPause hiçbir fotoğrafı göstermeyecek veya değiştirmeyecek. Güncel Chrome, Brave ya da Edge ile normal bir pencerede tekrar dene.',
    dismiss: 'Tamam',
    // pending on exit
    pendingExit: '{n} fotoğraf hâlâ silinmeyi bekliyor. Hiçbiri silinmedi; istediğin zaman geri gelip onaylayabilirsin.',
    // settings
    source: 'Kaynak', srcLib: 'Kütüphane', srcArchive: 'Arşiv', srcBoth: 'Kütüphane + Arşiv',
    startDate: 'Başlangıç tarihi', startDateHint: 'Bu tarihten geriye doğru ilerler. Boş bırakırsan en yeniden başlar.',
    resume: 'Kaldığım yerden devam et',
    skipVideos: 'Videoları atla',
    skipFav: 'Favorileri atla',
    reviewEvery: 'Kaç fotoğrafta bir inceleme istensin?',
    reviewEveryHint: '0 yazarsan otomatik sormaz; incelemeyi kendin başlatırsın.',
    theme: 'Görünüm', themeAuto: 'Sistemle aynı', themeDark: 'Koyu', themeLight: 'Açık',
    resetKept: 'Tutulan listesini sıfırla',
    resetConfirm: 'Daha önce tuttuğun {n} fotoğraf unutulacak ve tekrar gösterilecek. Devam edilsin mi?',
    save: 'Kaydet', cancel: 'Vazgeç',
    // help
    helpTitle: 'Kısayollar',
    hKeys: [
      ['←', 'Silinmek üzere işaretle'],
      ['→', 'Tut'],
      ['Z / ↑ / Backspace', 'Son işlemi geri al'],
      ['R', 'İşaretlenenleri gözden geçir'],
      ['Boşluk / Enter', 'Google Fotoğraflar\'da aç'],
      ['V', 'Videoyu oynat / durdur'],
      ['S', 'Ayarlar'],
      ['?', 'Bu pencere'],
      ['Esc', 'Kapat / geri'],
    ],
    helpDrag: 'Fareyle ya da parmağınla kartı sola–sağa sürükleyebilirsin.',
    helpSafety: 'Sola kaydırmak hiçbir şeyi silmez; fotoğraf sadece listeye eklenir. Silme, sen onayladığında olur ve Çöp Kutusu\'na taşır (60 gün geri alınabilir).',
    independentNotice: 'Google Fotoğraflar, Google LLC\'nin ticari markasıdır. FolioPause bağımsız bir projedir; Google ile bağlantılı değildir ve Google tarafından desteklenmez veya onaylanmaz.',
    // intro
    introTitle: 'Nasıl çalışır?',
    intro1: 'Sola kaydır (veya ←): fotoğraf silinecekler listesine eklenir. Hemen silinmez.',
    intro2: 'Sağa kaydır (veya →): fotoğraf tutulur ve bir daha karşına çıkmaz.',
    intro3: 'Her {n} fotoğrafta bir listeyi gözden geçirmen istenir. İstediğin an "Gözden geçir" ile de açabilirsin.',
    intro4: 'Onayladığında fotoğraflar Çöp Kutusu\'na taşınır — 60 gün içinde Google Fotoğraflar\'dan geri alabilirsin.',
    start: 'Başla',
    // misc
    videoLoading: 'Video yükleniyor…',
    videoFail: 'Video burada oynatılamadı — Boşluk ile Google Fotoğraflar\'da aç',
    photos: 'fotoğraf',
    dryRun: 'Deneme modu (hiçbir şey silinmez)',
    dryRunHint: 'Açıkken tüm akış normal çalışır ama silme isteği Google\'a hiç gönderilmez. Önce güvenle denemek için.',
    dryBadge: 'DENEME',
    dryDone: 'Deneme modu: {n} fotoğraf silinmedi (gerçek modda silinecekti)',
    exportLog: 'Silinenlerin listesini indir (JSON)',
    exportEmpty: 'Henüz silinen fotoğraf yok',
    exported: '{n} kayıt indirildi',
    noIdb: 'Tarayıcı deposu (IndexedDB) açılamadı — liste yalnızca bu tarayıcıda sınırlı olarak saklanır. Gizli sekmede çalışıyorsan normal pencerede dene.',
    language: 'Dil',
    langAuto: 'Otomatik (Google Fotoğraflar / tarayıcı)',
    scoreboard: 'İlerleme tablosu',
    scoreReviewed: 'İncelenen',
    scoreKept: 'Tutulan',
    scorePending: 'Bekleyen',
    scoreDeleted: 'Çöpe taşınan',
  },
  en: {
    app: 'FolioPause',
    reviewed: '{n} reviewed',
    reviewBtn: 'Review',
    reviewPending: 'Review — {n} photos pending',
    settings: 'Settings',
    help: 'Shortcuts',
    close: 'Close',
    del: 'Delete', keep: 'Keep', undo: 'Undo', open: 'Open',
    stampDel: 'DELETE', stampKeep: 'KEEP',
    prev: 'Previous', next: 'Next',
    video: 'Video', live: 'Live', fav: 'Favorite', archived: 'Archived',
    playVideo: 'Play video',
    loading: 'Loading…',
    scanPausedTitle: 'No new photos found in this section',
    scanPausedSub: 'A long range was scanned. Retry to continue from where FolioPause stopped.',
    doneTitle: 'All done',
    doneSub: 'No unreviewed photos left in this source. Change the source or start date in settings.',
    doneStats: 'This session: {k} kept, {d} deleted.',
    errLoadTitle: 'Could not load the list',
    errLoadSub: 'This may be a network or session problem.',
    retry: 'Retry', reloadPage: 'Reload page',
    localLoadTitle: 'Could not open local state',
    localLoadBody: 'The complete kept and pending-review lists could not be read safely. Swiping is blocked so no photo is offered again; retry or close the app.',
    errToken: 'Session data not found — reload the photos.google.com home page',
    marked: 'Marked for deletion',
    keptToast: 'Kept',
    undone: 'Undone',
    promptTitle: 'You reviewed {n} photos',
    promptBody: 'You marked {m} photos for deletion. Want to look them over and confirm? Nothing is deleted until you do.',
    later: 'Later',
    reviewNow: 'Review',
    reviewTitle: 'Photos to delete',
    reviewSub: '{n} will be deleted, {s} will be kept. Tap a photo to take it off the list.',
    reviewEmptyTitle: 'Nothing marked yet',
    reviewEmptySub: 'Photos you swipe left pile up here, then you delete them all at once.',
    backToSwipe: 'Back to swiping',
    selectAll: 'Select all',
    selectNone: 'Select none',
    willDelete: '{n} photos will be deleted',
    willDeleteNone: 'Nothing selected',
    deleteNow: 'Move to trash',
    keepAll: 'Keep all',
    undoAll: 'Undo all',
    allUnmarked: '{n} photos returned to the swipe queue',
    spared: 'Will be kept',
    keeping: 'Saving kept photos…',
    keptBatch: '{n} photos kept; nothing was deleted',
    deleting: 'Moving to trash… ({i}/{n})',
    deletedToast: '{n} photos moved to trash',
    deletedPartial: '{ok} moved, {fail} failed',
    restoreAction: 'UNDO',
    restoring: 'Restoring…',
    restoredToast: '{n} photos restored',
    restoreFailed: 'Restore failed — you can restore them from Google Photos > Trash',
    verifying: 'Verifying the first deletion…',
    verifyOk: 'Deletion verified — the photos are in Trash',
    verifyWarn: 'Could not verify the deletion. Check Trash; if the photos are not there, Google may have changed their interface.',
    openTrash: 'Open Trash',
    sessionBroken: 'Deletion failed — your session may have expired. Reload photos.google.com and try again.',
    localSaveFailed: 'Local state could not be updated safely; no item was silently removed from Review. Check Trash.',
    otherTabTitle: 'FolioPause is open in another tab',
    otherTabBody: 'Only one tab can make decisions for the same Google account. Close FolioPause in the other tab, then open it here again.',
    lockUnavailableTitle: 'Secure tab locking is unavailable',
    lockUnavailableBody: 'The browser could not provide the safe per-account tab lock. FolioPause will not show or change any photo because two tabs could otherwise race. Try again in a normal window with an up-to-date Chrome, Brave, or Edge.',
    dismiss: 'OK',
    pendingExit: '{n} photos are still waiting to be deleted. Nothing was deleted; come back any time to confirm.',
    source: 'Source', srcLib: 'Library', srcArchive: 'Archive', srcBoth: 'Library + Archive',
    startDate: 'Start date', startDateHint: 'Works backwards from this date. Leave empty to start from the newest.',
    resume: 'Resume where I left off',
    skipVideos: 'Skip videos',
    skipFav: 'Skip favorites',
    reviewEvery: 'Ask me to review every N photos',
    reviewEveryHint: 'Set 0 to never ask automatically; you start the review yourself.',
    theme: 'Appearance', themeAuto: 'Match system', themeDark: 'Dark', themeLight: 'Light',
    resetKept: 'Reset the kept list',
    resetConfirm: '{n} photos you previously kept will be forgotten and shown again. Continue?',
    save: 'Save', cancel: 'Cancel',
    helpTitle: 'Shortcuts',
    hKeys: [
      ['←', 'Mark for deletion'],
      ['→', 'Keep'],
      ['Z / ↑ / Backspace', 'Undo the last action'],
      ['R', 'Review marked photos'],
      ['Space / Enter', 'Open in Google Photos'],
      ['V', 'Play / pause video'],
      ['S', 'Settings'],
      ['?', 'This dialog'],
      ['Esc', 'Close / back'],
    ],
    helpDrag: 'You can also drag the card left or right with the mouse or your finger.',
    helpSafety: 'Swiping left deletes nothing; it only adds the photo to a list. Deletion happens when you confirm, and it moves photos to Trash (recoverable for 60 days).',
    independentNotice: 'Google Photos is a trademark of Google LLC. FolioPause is an independent project and is not affiliated with, sponsored by, or endorsed by Google.',
    introTitle: 'How it works',
    intro1: 'Swipe left (or ←): the photo goes on the delete list. Nothing is deleted yet.',
    intro2: 'Swipe right (or →): the photo is kept and never shown again.',
    intro3: 'Every {n} photos you are asked to review the list. You can also open it any time with "Review".',
    intro4: 'When you confirm, the photos move to Trash — recoverable from Google Photos for 60 days.',
    start: 'Start',
    videoLoading: 'Loading video…',
    videoFail: 'Video could not play here — press Space to open it in Google Photos',
    photos: 'photos',
    dryRun: 'Dry run (never deletes anything)',
    dryRunHint: 'Everything works as usual but no delete request is ever sent to Google. Use it to try the tool safely first.',
    dryBadge: 'DRY RUN',
    dryDone: 'Dry run: {n} photos were NOT deleted (they would have been)',
    exportLog: 'Download the list of deleted photos (JSON)',
    exportEmpty: 'Nothing has been deleted yet',
    exported: '{n} records downloaded',
    noIdb: 'Browser storage (IndexedDB) is unavailable — the list is only kept in limited local storage. If you are in a private window, try a normal one.',
    language: 'Language',
    langAuto: 'Automatic (Google Photos / browser)',
    scoreboard: 'Progress scoreboard',
    scoreReviewed: 'Reviewed',
    scoreKept: 'Kept',
    scorePending: 'Pending',
    scoreDeleted: 'Moved to trash',
  },
};

let STR = STRINGS[LANG] || STRINGS.en;
function setLanguage(setting) {
  const next = setting && setting !== 'auto' ? (languageCode(setting) || detectLanguage()) : detectLanguage();
  const changed = next !== LANG;
  LANG = next;
  STR = STRINGS[LANG] || STRINGS.en;
  return changed;
}
const t = (key, vars) => {
  if (key === 'app') return PRODUCT_NAME;
  const raw = STR[key] != null ? STR[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
  if (typeof raw !== 'string') return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
};
