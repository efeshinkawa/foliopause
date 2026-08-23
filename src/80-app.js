// ---------------------------------------------------------------------------
// The shell: app bar, view switching, dialogs, snackbars, keyboard.
// ---------------------------------------------------------------------------

const app = {
  root: null, bar: null, body: null, snacks: null, bannerEl: null,
  countEl: null, scoreEls: null, scoreItems: null, reviewBtn: null, reviewBadge: null,
  view: 'swipe',
  open: false,
  built: false,
  exitWarned: false,
  showPromise: null,
  hydrating: false,
  keysBound: false,
  dialogSeq: 0,

  // ---- construction ------------------------------------------------------
  build() {
    if (this.built) return;
    this.built = true;

    const style = h('style', { id: 'gps-style' });
    style.textContent = CSS;                       // textContent, never innerHTML (Trusted Types)
    (document.head || document.documentElement).appendChild(style);

    this.scoreEls = {};
    this.scoreItems = {};
    const score = (key, ico) => {
      const value = h('b', { text: '0' });
      this.scoreEls[key] = value;
      const label = t('score' + key[0].toUpperCase() + key.slice(1));
      const item = h('span', { class: 'gps-score-item ' + key, title: label, 'aria-label': label + ': 0' },
        icon(ico, 15), value, h('span', { class: 'lbl', text: t('score' + key[0].toUpperCase() + key.slice(1)) }));
      this.scoreItems[key] = item;
      return item;
    };
    this.countEl = h('div', { class: 'gps-count gps-score', 'aria-label': t('scoreboard') },
      score('reviewed', 'image'), score('kept', 'check'), score('pending', 'grid'), score('deleted', 'trash'));
    this.dryChip = h('span', { class: 'gps-dry', hidden: true }, icon('warn', 14), h('span', { text: t('dryBadge') }));
    this.reviewBadge = h('span', { class: 'gps-badge', text: '0' });
    this.reviewBtn = h('button', {
      class: 'gps-btn tonal gps-top-review', title: t('reviewBtn') + ' (R)', 'aria-label': t('reviewBtn'), onclick: () => this.toggleReview(),
      onmousedown: (e) => e.preventDefault(),
    }, icon('grid', 18), h('span', { class: 'gps-review-label', text: t('reviewBtn') }), this.reviewBadge);

    const ib = (name, label, key, fn) => h('button', {
      class: 'gps-ib', title: label + (key ? ' (' + key + ')' : ''), 'aria-label': label,
      onclick: fn, onmousedown: (e) => e.preventDefault(),
    }, icon(name));

    this.bar = h('div', { class: 'gps-bar on-stage' },
      h('div', { class: 'gps-brand' }, brandMark(), h('span', { class: 'n', text: t('app') })),
      h('div', { class: 'gps-spacer' }),
      this.dryChip,
      this.countEl,
      this.reviewBtn,
      ib('tune', t('settings'), 'S', () => this.openSettings()),
      ib('help', t('help'), '?', () => this.openHelp()),
      ib('close', t('close'), 'Esc', () => this.requestClose()),
    );

    this.body = h('div', { class: 'gps-body' }, swipe.build(), review.build());
    this.snacks = h('div', { class: 'gps-snacks' });
    this.root = h('div', { id: 'gps-root', tabindex: '-1' }, this.bar, this.body, this.snacks);
    document.documentElement.appendChild(this.root);

    this.applyTheme();
    this.bindKeys();
  },

  applyTheme(preview) {
    const th = preview || state.settings.theme;
    const light = th === 'light' || (th === 'auto' && !window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.root.classList.toggle('gps-light', light);
  },

  busy() { return !!(this.hydrating || swipe.busy || review.deleting || review.restoring || review.savingChoices); },

  // ---- lifecycle ---------------------------------------------------------
  show() {
    if (this.showPromise) return this.showPromise;
    if (this.open && store.hasLock) {
      this.root.focus({ preventScroll: true });
      return Promise.resolve(true);
    }
    this.showPromise = this._show().finally(() => { this.showPromise = null; });
    return this.showPromise;
  },

  async _show() {
    setLanguage(state.settings.language);
    this.build();
    this.root.style.display = '';
    this.open = true;
    this.exitWarned = false;
    this.hydrating = true;
    feed.ready = false;
    swipe.clearCards();
    document.documentElement.style.overflow = 'hidden';
    // take the keyboard away from Google Photos' own inputs
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch (e) {}
    this.root.focus({ preventScroll: true });

    this.renderState();                            // show a spinner while storage/lock settles

    let acquired = await store.acquireLock();
    if (!acquired && this.open) {
      // A different tab may have released the lock in the same click/task.
      // Give that hand-off one bounded turn before declaring the tab blocked.
      await sleep(80);
      acquired = await store.acquireLock();
    }
    if (!this.open) {
      this.hydrating = false;
      if (acquired) store.releaseLock();
      return false;
    }
    if (!acquired) {
      this.hydrating = false;
      const lockUnavailable = store.lockFailure === 'unavailable';
      this.dialog({
        title: t(lockUnavailable ? 'lockUnavailableTitle' : 'otherTabTitle'),
        dismissable: false,
        body: [h('p', { text: t(lockUnavailable ? 'lockUnavailableBody' : 'otherTabBody') })],
        actions: [{ label: t('close'), primary: true, onClick: () => this.close() }],
      });
      return false;
    }

    try {
      await store.init();
      // The launcher may have primed storage before this tab obtained the
      // account lock, or another tab may have changed it while this UI was
      // closed. Always refresh after a fresh acquisition.
      reloadState();
      await store.refresh();
    } catch (e) {
      console.error('[gpSwipe] could not read local state', e);
      this.hydrating = false;
      store.releaseLock();
      if (!this.open) return false;
      this.dialog({
        title: t('localLoadTitle'),
        dismissable: false,
        body: [h('p', { text: t('localLoadBody') })],
        actions: [
          { label: t('close'), onClick: () => this.close() },
          { label: t('retry'), primary: true, onClick: () => { this.close(); setTimeout(() => this.show(), 0); } },
        ],
      });
      return false;
    }
    if (!this.open) {
      this.hydrating = false;
      store.releaseLock();
      return false;
    }
    // Only now may unload/visibility handlers persist this tab's state. Until
    // this point it may still be the stale snapshot captured when the script
    // first loaded, even though the tab already owns the account lock.
    store.stateWritable = true;
    const languageChanged = setLanguage(state.settings.language);
    if (languageChanged) this.rebuildShell();
    this.hydrating = false;
    feed.ready = true;
    this.applyTheme();
    if (!store.db) this.banner(t('noIdb'));
    if (!G.at) this.snack(t('errToken'), { kind: 'err', ms: 9000 });
    swipe.clearCards();
    feed.reset();
    this.showSwipe();
    if (!state.introSeen) this.openIntro();
    this.renderState();
    return true;
  },

  requestClose() {
    if (this.busy() && !this.hydrating) return;
    if (marked.size && !this.exitWarned) {
      this.exitWarned = true;
      this.dialog({
        title: t('reviewTitle'),
        body: [h('p', { text: t('pendingExit', { n: fmtNum(marked.size) }) })],
        actions: [
          { label: t('reviewBtn'), primary: true, onClick: () => this.showReview() },
          { label: t('close'), onClick: () => this.close() },
        ],
      });
      return;
    }
    this.close();
  },
  close() {
    if (this.busy() && !this.hydrating) return;
    this.open = false;
    this.hydrating = false;
    swipe.stopVideos();
    if (review.lightbox) review.lightbox.remove(), (review.lightbox = null);
    this.closeDialog(true);
    if (this.root) this.root.style.display = 'none';
    document.documentElement.style.overflow = '';
    persist(true);
    store.releaseLock();
    feed.ready = false;
    if (typeof onLauncherUpdate === 'function') onLauncherUpdate();
  },

  rebuildShell() {
    const live = swipe.liveItems();
    swipe.stopVideos();
    swipe.clearCards();
    for (let i = live.length - 1; i >= 0; i--) feed.putBack(live[i]);
    if (review.lightbox) { review.lightbox.remove(); review.lightbox = null; }
    this.closeDialog(true);
    if (this.root) this.root.remove();
    const style = document.getElementById('gps-style');
    if (style) style.remove();
    this.bannerEl = null;
    this.built = false;
    this.build();
    this.root.style.display = this.open ? '' : 'none';
    this.applyTheme();
  },

  rebuildForLanguage() {
    const wasReview = this.view === 'review';
    this.rebuildShell();
    if (!this.open) return;
    if (wasReview) this.showReview(); else this.showSwipe();
    this.root.focus({ preventScroll: true });
  },

  // ---- views -------------------------------------------------------------
  showSwipe() {
    if (this.busy()) return;
    this.view = 'swipe';
    swipe.root.hidden = false;
    review.root.hidden = true;
    this.bar.className = 'gps-bar on-stage';
    swipe.render();
    feed.ensure();
    this.renderState();
  },
  showReview() {
    if (this.busy()) return;
    this.view = 'review';
    swipe.stopVideos();
    swipe.root.hidden = true;
    review.root.hidden = false;
    this.bar.className = 'gps-bar on-surface';
    review.open();
    this.renderState();
  },
  toggleReview() { if (this.view === 'review') this.showSwipe(); else this.showReview(); },

  // A trash/restore mutation invalidates undocumented offset page tokens.
  // Re-fetch inclusively from the last visible boundary; kept/marked/seen
  // filtering makes the overlap harmless while preventing skipped photos.
  invalidateFeed(boundary) {
    swipe.clearCards();
    feed.reset({ timestamp: boundary });
    if (this.view === 'swipe' && feed.ready) {
      swipe.render();
      feed.ensure();
    } else {
      this.renderState();
    }
  },

  // ---- shared chrome -----------------------------------------------------
  renderState() {
    if (!this.built) return;
    this.dryChip.hidden = !state.settings.dryRun;
    this.reviewBadge.textContent = fmtNum(marked.size);
    this.reviewBadge.hidden = marked.size === 0;
    const pendingLabel = marked.size ? t('reviewPending', { n: fmtNum(marked.size) }) : t('reviewBtn');
    this.reviewBtn.setAttribute('aria-label', pendingLabel);
    if (swipe.reviewActionBadge) {
      swipe.reviewActionBadge.textContent = fmtNum(marked.size);
      swipe.reviewActionBadge.hidden = marked.size === 0;
      const bottomReview = swipe.reviewActionBadge.closest('button');
      if (bottomReview) bottomReview.setAttribute('aria-label', pendingLabel);
    }
    const reviewed = kept.size + state.stats.deleted + marked.size;
    this.scoreEls.reviewed.textContent = fmtNum(reviewed);
    this.scoreEls.kept.textContent = fmtNum(kept.size);
    this.scoreEls.pending.textContent = fmtNum(marked.size);
    this.scoreEls.deleted.textContent = fmtNum(state.stats.deleted);
    for (const key of ['reviewed', 'kept', 'pending', 'deleted']) {
      const label = t('score' + key[0].toUpperCase() + key.slice(1));
      this.scoreItems[key].setAttribute('aria-label', label + ': ' + this.scoreEls[key].textContent);
    }

    // swipe view placeholders
    const ph = swipe.stage.querySelector('.gps-center');
    if (ph) ph.remove();
    if (!swipe.top) {
      if (!feed.ready || feed.loading) {
        swipe.stage.appendChild(h('div', { class: 'gps-center' }, h('div', { class: 'gps-spin' }), h('div', { text: t('loading') })));
      } else if (feed.error) {
        swipe.stage.appendChild(h('div', { class: 'gps-center' },
          h('div', { class: 'ic' }, icon('warn')),
          h('div', { class: 'big', text: t('errLoadTitle') }),
          h('div', { text: t('errLoadSub') }),
          h('button', { class: 'gps-btn tonal', style: { marginTop: '8px' }, onclick: () => { feed.error = false; feed.ensure(); this.renderState(); } }, icon('undo', 18), h('span', { text: t('retry') })),
        ));
      } else if (feed.exhausted) {
        swipe.stage.appendChild(h('div', { class: 'gps-center' },
          h('div', { class: 'ic' }, icon('check')),
          h('div', { class: 'big', text: t('doneTitle') }),
          h('div', { text: t('doneSub') }),
          h('div', { text: t('doneStats', { k: fmtNum(session.kept), d: fmtNum(session.deleted) }) }),
          marked.size ? h('button', { class: 'gps-btn tonal', style: { marginTop: '8px' }, onclick: () => this.showReview() }, icon('grid', 18), h('span', { text: t('reviewBtn') + ' (' + fmtNum(marked.size) + ')' })) : null,
        ));
      }
    }
    const has = !!swipe.top;
    swipe.actions.querySelectorAll('button').forEach((b) => {
      const a = b.getAttribute('data-act');
      if (a === 'review') b.disabled = this.hydrating || swipe.busy;
      else b.disabled = a === 'undo' ? (this.hydrating || swipe.busy || history.length === 0) : (this.hydrating || swipe.busy || !has);
    });
    if (typeof onLauncherUpdate === 'function') onLauncherUpdate();
  },

  onFeedChanged() { if (this.view === 'swipe') swipe.render(); else this.renderState(); },
  onInfoLoaded() { swipe.refreshMeta(); if (this.view === 'review') review.renderSummary(); },

  afterDecision(isUndo) {
    this.renderState();
    if (isUndo) return;
    const every = parseInt(state.settings.reviewEvery, 10) || 0;
    if (every > 0 && state.sinceReview >= every) {
      const n = state.sinceReview;
      state.sinceReview = 0;
      persist();
      if (marked.size > 0) this.promptReview(n);
    }
  },

  promptReview(n) {
    const items = review.items().slice(0, 5);
    const strip = h('div', { class: 'strip' });
    items.forEach((it) => { const im = h('img', { alt: '', loading: 'lazy' }); im.src = imgUrl(it, 160); strip.appendChild(im); });
    if (marked.size > items.length) strip.appendChild(h('div', { class: 'more', text: '+' + fmtNum(marked.size - items.length) }));
    this.dialog({
      title: t('promptTitle', { n: fmtNum(n) }),
      body: [h('p', { text: t('promptBody', { m: fmtNum(marked.size) }) }), strip],
      actions: [
        { label: t('later') },
        { label: t('reviewNow'), primary: true, onClick: () => this.showReview() },
      ],
    });
  },

  // ---- snackbar ----------------------------------------------------------
  snack(msg, o) {
    o = o || {};
    const el = h('div', { class: 'gps-snack' + (o.kind ? ' ' + o.kind : '') }, h('span', { class: 'txt', text: msg }));
    let done = false;
    const kill = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
    };
    if (o.action) el.appendChild(h('button', { class: 'act', text: o.action, onmousedown: (e) => e.preventDefault(), onclick: () => { kill(); if (o.onAction) o.onAction(); } }));
    el.appendChild(h('button', { class: 'gps-ib', style: { width: '36px', height: '36px' }, title: t('dismiss'), onmousedown: (e) => e.preventDefault(), onclick: kill }, icon('close', 18)));
    this.snacks.appendChild(el);
    while (this.snacks.children.length > 3) this.snacks.firstChild.remove();
    setTimeout(kill, o.ms || 4000);
    return el;
  },

  banner(msg) {
    if (this.bannerEl) this.bannerEl.remove();
    this.bannerEl = h('div', { class: 'gps-banner' },
      icon('warn', 20),
      h('span', { text: msg }),
      h('span', { class: 'sp' }),
      h('button', { class: 'gps-btn', onclick: () => window.open(trashPageUrl(), '_blank', 'noopener') }, h('span', { text: t('openTrash') })),
      h('button', { class: 'gps-btn', onclick: () => { this.bannerEl.remove(); this.bannerEl = null; } }, h('span', { text: t('dismiss') })),
    );
    this.root.insertBefore(this.bannerEl, this.body);
  },

  // ---- dialogs -----------------------------------------------------------
  dialogOpen() { return !!(this.root && this.root.querySelector('.gps-scrim')); },
  closeDialog(force, suppressRestore) {
    const d = this.root && this.root.querySelector('.gps-scrim');
    if (!d) return false;
    if (d._dismiss) d._dismiss(!!force, !!suppressRestore); else d.remove();
    return true;
  },

  dialog(o) {
    this.closeDialog(true, true);
    const previousFocus = document.activeElement;
    const acts = h('div', { class: 'acts' });
    const titleId = 'gps-dlg-title-' + (++this.dialogSeq);
    const title = o.title ? h('h2', { id: titleId, text: o.title }) : null;
    const panel = h('div', {
      class: 'gps-dlg', role: 'dialog', 'aria-modal': 'true', tabindex: '-1',
      'aria-labelledby': title ? titleId : null,
      'aria-label': title ? null : t('app'),
    },
      title,
      o.body || null,
      acts);
    const scrim = h('div', {
      class: 'gps-scrim', onclick: (e) => { if (e.target === scrim && o.dismissable !== false) dismiss(); },
    }, panel);
    let settled = false;
    const restoreFocus = () => setTimeout(() => {
      if (!this.open) return;
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
      else if (this.root) this.root.focus({ preventScroll: true });
    }, 0);
    const dismiss = (force, suppressRestore) => {
      if (settled) return;
      if (!force && o.dismissable === false) return;
      settled = true;
      scrim.remove();
      if (o.onDismiss) o.onDismiss();
      if (!suppressRestore) restoreFocus();
    };
    scrim._dismiss = dismiss;
    (o.actions || []).forEach((a) => {
      acts.appendChild(h('button', {
        class: 'gps-btn ' + (a.primary ? 'filled' : a.danger ? 'danger' : 'text'),
        text: a.label,
        onclick: () => {
          if (a.keepOpen !== true) { settled = true; scrim.remove(); restoreFocus(); }
          if (a.onClick) a.onClick();
        },
      }));
    });
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.disabled && !el.hidden && el.getClientRects().length > 0);
      if (!focusable.length) { e.preventDefault(); panel.focus({ preventScroll: true }); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault(); last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus({ preventScroll: true });
      }
    });
    this.root.appendChild(scrim);
    // Focusing a bottom action makes a tall settings dialog open already
    // scrolled to its end. Focus the panel itself and preserve scrollTop=0;
    // the first Tab then enters controls in document order.
    panel.focus({ preventScroll: true });
    return scrim;
  },

  openIntro() {
    const every = parseInt(state.settings.reviewEvery, 10) || 0;
    this.dialog({
      title: t('introTitle'),
      dismissable: false,
      body: [
        h('p', null, h('span', { class: 'hi', text: t('intro1') })),
        h('p', { text: t('intro2') }),
        every ? h('p', { text: t('intro3', { n: every }) }) : null,
        h('p', { text: t('intro4') }),
      ],
      actions: [{ label: t('start'), primary: true, onClick: () => { state.introSeen = true; persist(true); } }],
    });
  },

  openHelp() {
    if (this.busy()) return;
    const rows = STR.hKeys.map(([k, d]) => h('tr', null,
      h('td', null, ...k.split(' / ').map((one, i) => [i ? h('span', { text: ' ' }) : null, h('span', { class: 'gps-kbd', text: one })])),
      h('td', { text: d })));
    this.dialog({
      title: t('helpTitle'),
      body: [
        h('table', null, h('tbody', null, rows)),
        h('p', { text: t('helpDrag') }),
        h('p', { text: t('helpSafety') }),
        h('p', { class: 'gps-legal', text: t('independentNotice') }),
      ],
      actions: [{ label: t('dismiss'), primary: true }],
    });
  },

  openSettings() {
    if (this.busy() || this.dialogOpen()) return;
    const s = state.settings;
    const originalTheme = s.theme;
    const src = h('select', null,
      h('option', { value: '1', text: t('srcLib') }),
      h('option', { value: '2', text: t('srcArchive') }),
      h('option', { value: '3', text: t('srcBoth') }));
    src.value = String(s.source);
    const date = h('input', { type: 'date' }); date.value = s.startDate || '';
    const every = h('input', { type: 'number', min: '0', max: '1000', step: '10' }); every.value = String(s.reviewEvery);
    const theme = h('select', null,
      h('option', { value: 'auto', text: t('themeAuto') }),
      h('option', { value: 'dark', text: t('themeDark') }),
      h('option', { value: 'light', text: t('themeLight') }));
    theme.value = s.theme;
    theme.addEventListener('change', () => this.applyTheme(theme.value));
    const language = h('select', null,
      h('option', { value: 'auto', text: t('langAuto') }),
      ...LANGUAGE_CODES.map((code) => h('option', { value: code, text: LANGUAGE_LABELS[code] })));
    language.value = LANGUAGE_CODES.indexOf(s.language) !== -1 ? s.language : 'auto';
    const cb = (checked) => h('input', { type: 'checkbox', checked: checked || null });
    const resume = cb(s.resume), skipV = cb(s.skipVideos), skipF = cb(s.skipFav), dry = cb(s.dryRun);

    const exportBtn = h('button', { class: 'gps-btn text' }, icon('openNew', 18), h('span', { text: t('exportLog') }));
    exportBtn.addEventListener('click', async () => {
      const rows = await store.logAll();
      if (!rows.length) { this.snack(t('exportEmpty')); return; }
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'foliopause-deleted.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.snack(t('exported', { n: fmtNum(rows.length) }), { kind: 'ok' });
    });

    const resetBtn = h('button', { class: 'gps-btn text', style: { color: 'var(--err)' } }, icon('undo', 18), h('span', { text: t('resetKept') + ' (' + fmtNum(kept.size) + ')' }));
    resetBtn.addEventListener('click', () => {
      const n = kept.size;
      this.applyTheme();
      this.dialog({
        title: t('resetKept'),
        body: [h('p', { text: t('resetConfirm', { n: fmtNum(n) }) })],
        actions: [
          { label: t('cancel') },
          { label: t('resetKept'), danger: true, onClick: async () => {
            try {
              await store.keepClear();
              state.stats.kept = Math.max(0, state.stats.kept - n);
              state.cursorTs = null;
              persist(true);
              history.length = 0;
              this.reloadFeed();
            } catch (e) {
              console.error('[gpSwipe] could not reset kept photos', e);
              this.snack(t('localSaveFailed'), { kind: 'err', ms: 7000 });
            }
          } },
        ],
      });
    });

    this.dialog({
      title: t('settings'),
      onDismiss: () => this.applyTheme(originalTheme),
      body: [
        h('label', null, t('source'), src),
        h('label', null, t('startDate'), date, h('span', { class: 'hint', text: t('startDateHint') })),
        h('label', null, t('reviewEvery'), every, h('span', { class: 'hint', text: t('reviewEveryHint') })),
        h('label', null, t('language'), language),
        h('label', null, t('theme'), theme),
        h('label', { class: 'row' }, resume, h('span', { text: t('resume') })),
        h('label', { class: 'row' }, skipV, h('span', { text: t('skipVideos') })),
        h('label', { class: 'row' }, skipF, h('span', { text: t('skipFav') })),
        h('label', { class: 'row' }, dry, h('span', { text: t('dryRun') })),
        h('span', { class: 'hint', text: t('dryRunHint') }),
        exportBtn,
        resetBtn,
      ],
      actions: [
        { label: t('cancel'), onClick: () => this.applyTheme() },
        { label: t('save'), primary: true, onClick: () => {
          const newSource = parseInt(src.value, 10) || 1;
          const feedChanged = (date.value || '') !== (s.startDate || '') || newSource !== s.source
            || resume.checked !== s.resume || skipV.checked !== s.skipVideos || skipF.checked !== s.skipFav;
          s.source = newSource;
          s.startDate = date.value || '';
          s.resume = resume.checked;
          s.skipVideos = skipV.checked;
          s.skipFav = skipF.checked;
          s.reviewEvery = Math.max(0, Math.min(1000, parseInt(every.value, 10) || 0));
          s.language = language.value === 'auto' || LANGUAGE_CODES.indexOf(language.value) !== -1 ? language.value : 'auto';
          s.theme = theme.value;
          s.dryRun = dry.checked;
          if (feedChanged) state.cursorTs = null;
          persist(true);
          this.applyTheme();
          const languageChanged = setLanguage(s.language);
          if (languageChanged) {
            this.rebuildForLanguage();
          }
          if (feedChanged) {
            history.length = 0;
            this.reloadFeed();
          } else if (!languageChanged) {
            this.renderState();
          }
        } },
      ],
    });
  },

  reloadFeed() {
    if (this.busy()) return;
    swipe.clearCards();
    if (this.bannerEl) { this.bannerEl.remove(); this.bannerEl = null; }
    feed.reset();
    this.showSwipe();
    feed.ensure();
  },

  // ---- keyboard ----------------------------------------------------------
  bindKeys() {
    if (this.keysBound) return;
    this.keysBound = true;
    const handler = (e) => {
      if (!this.open) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;          // leave browser shortcuts alone
      const tgt = e.target;
      const inside = tgt instanceof Node && this.root.contains(tgt);
      const typing = inside && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
      const onButton = inside && (tgt.tagName === 'BUTTON' || tgt.tagName === 'A' || tgt.getAttribute('role') === 'checkbox');
      const dialog = this.dialogOpen();
      const lightbox = review.lightbox;
      const activates = onButton && (e.key === 'Enter' || e.key === ' ');
      // Everything else is swallowed so Google Photos' own hotkeys never fire underneath.
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };

      if (e.type !== 'keydown') { if (!typing && !activates) stop(); return; }

      if (lightbox) { if (!typing && !activates) { if (lightbox._keys(e)) stop(); else if (e.key !== 'Tab') stop(); } return; }
      if (dialog) {
        if (e.key === 'Escape') { stop(); this.closeDialog(); }
        else if (e.key === 'Tab' || typing || activates) { /* native focus / typing */ }
        else stop();
        return;
      }
      if (typing) return;
      if (activates) return; // native button/checkbox activation

      if (this.view === 'review') {
        switch (e.key) {
          case 'Escape': stop(); this.showSwipe(); return;
          case 'r': case 'R': stop(); this.showSwipe(); return;
          case 'ArrowDown': stop(); review.scroll.scrollBy({ top: 160, behavior: 'smooth' }); return;
          case 'ArrowUp': stop(); review.scroll.scrollBy({ top: -160, behavior: 'smooth' }); return;
          case 'PageDown': stop(); review.scroll.scrollBy({ top: review.scroll.clientHeight * 0.9, behavior: 'smooth' }); return;
          case 'PageUp': stop(); review.scroll.scrollBy({ top: -review.scroll.clientHeight * 0.9, behavior: 'smooth' }); return;
          case 's': case 'S': stop(); this.openSettings(); return;
          case '?': stop(); this.openHelp(); return;
          default: if (e.key.length === 1 || e.key.startsWith('Arrow')) stop(); return;
        }
      }

      if (e.repeat && ['ArrowLeft', 'ArrowRight', 'z', 'Z', 'Backspace', 'ArrowUp', ' ', 'Enter'].indexOf(e.key) !== -1) { stop(); return; }
      switch (e.key) {
        case 'ArrowLeft': stop(); swipe.act('mark'); break;
        case 'ArrowRight': stop(); swipe.act('keep'); break;
        case 'ArrowUp': case 'z': case 'Z': case 'Backspace': stop(); swipe.act('undo'); break;
        case ' ': case 'Enter': stop(); swipe.act('open'); break;
        case 'v': case 'V': stop(); swipe.act('video'); break;
        case 'r': case 'R': stop(); this.showReview(); break;
        case 's': case 'S': stop(); this.openSettings(); break;
        case '?': stop(); this.openHelp(); break;
        case 'Escape': stop(); this.requestClose(); break;
        default: if (e.key.length === 1 || e.key.startsWith('Arrow')) stop();
      }
    };
    for (const type of ['keydown', 'keyup', 'keypress']) window.addEventListener(type, handler, true);
  },
};

// ---------------------------------------------------------------------------
// public handle — also what the extension and the userscript launcher call
// ---------------------------------------------------------------------------
const gpSwipePublic = {
  open: () => app.show(),
  close: () => app.close(),
  version: typeof APP_VERSION === 'string' ? APP_VERSION : 'dev',
};
// Production pages only receive the tiny launcher API. GP_TEST_MODE is baked
// into a separate generated harness bundle; the host page cannot opt itself
// into destructive test internals by setting a writable global.
if (GP_TEST_MODE === true) Object.assign(gpSwipePublic, {
  app: app, swipe: swipe, review: review, feed: feed, api: api, store: store,
  state: state, kept: kept, marked: marked, history: history, session: session,
  locales: STRINGS,
});
window.__gpSwipe = gpSwipePublic;
