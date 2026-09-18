(function () {
  const q = new URLSearchParams(location.search);
  const scene = q.get('scene') || 'swipe';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (fn) => { for (let i = 0; i < 300; i++) { if (fn()) return true; await sleep(20); } return false; };
  const decide = async (kind) => {
    const before = window.__gpSwipe.swipe.top;
    window.__gpSwipe.swipe.act(kind);
    await until(() => window.__gpSwipe.swipe.top !== before && !window.__gpSwipe.swipe.busy);
  };
  (async () => {
    const s = window.__gpSwipe;
    await until(() => s && s.swipe.top);
    if (q.get('theme') === 'light') {
      s.state.settings.theme = 'light';
      s.app.applyTheme();
    }
    if (scene === 'review') {
      for (let i = 0; i < 8; i++) await decide(i === 3 ? 'keep' : 'mark');
      s.app.showReview();
      const first = s.review.items()[1];
      if (first) await s.review.toggle(first.mediaKey);
    } else if (scene === 'settings') {
      s.state.settings.reviewEvery = 100;
      s.app.openSettings();
    } else if (scene === 'menu') {
      s.app.openScanMenu();
    } else if (scene === 'menu-filters') {
      s.app.openScanMenu();
      const toggle = Array.prototype.find.call(document.querySelectorAll('.gps-scrim button'), (b) => /Filtreler|Filters/.test(b.textContent));
      if (toggle) toggle.click();
    } else if (scene === 'albums') {
      s.app.openScanMenu({ pickAlbum: true });
      await until(() => document.querySelectorAll('.gps-album').length > 0 && !document.querySelector('.gps-scrim .gps-spin'));
    }
    document.body.dataset.visualReady = 'true';
  })();
})();
