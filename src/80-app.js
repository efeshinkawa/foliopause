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
  feedStarted: false,      // false while the startup scan menu is still deciding what to load

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

    this.modeLabel = h('span', { class: 'gps-mode-label', text: '' });
    this.modeIcon = h('span', { class: 'gps-mode-ic' });
    this.modeChip = h('button', {
      class: 'gps-btn text gps-mode', title: t('scanChipHint') + ' (M)', 'aria-label': t('scanMode'),
      onclick: () => this.openScanMenu(), onmousedown: (e) => e.preventDefault(),
    }, this.modeIcon, this.modeLabel);

    this.bar = h('div', { class: 'gps-bar on-stage' },
      h('div', { class: 'gps-brand' }, brandMark(), h('span', { class: 'n', text: t('app') })),
      this.modeChip,
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
    if (!acquired && this.open && store.lockFailure !== 'unavailable') {
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
      this.renderState();
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
      this.renderState();
      const reloadRequired = store.invalidated;
      this.dialog({
        title: t('localLoadTitle'),
        dismissable: false,
        body: [h('p', { text: t('localLoadBody') })],
        actions: [
          { label: t('close'), onClick: () => this.close() },
          reloadRequired
            ? { label: t('reloadPage'), primary: true, onClick: () => location.reload() }
            : { label: t('retry'), primary: true, onClick: () => { this.close(); setTimeout(() => this.show(), 0); } },
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
    // The scan menu comes before the first card, so the listing waits for the
    // user's choice instead of loading one order and then throwing it away.
    const askMode = state.settings.showStartMenu === true;
    this.feedStarted = false;
    this.showSwipe({ deferLoad: askMode });
    if (!state.introSeen) this.openIntro(askMode);
    else if (askMode) this.openScanMenu({ startup: true });
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
  close(force) {
    if (this.busy() && !this.hydrating && !force) return;
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

  onStoreInvalidated() {
    if (!this.open) { store.releaseLock(); return; }
    this.hydrating = false;
    feed.ready = false;
    swipe.clearCards();
    feed.reset();
    history.length = 0;
    store.releaseLock();
    this.renderState();
    this.dialog({
      title: t('localLoadTitle'),
      dismissable: false,
      body: [h('p', { text: t('localLoadBody') })],
      actions: [
        { label: t('close'), onClick: () => this.close(true) },
        { label: t('reloadPage'), primary: true, onClick: () => location.reload() },
      ],
    });
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
  showSwipe(o) {
    if (this.busy()) return;
    this.view = 'swipe';
    swipe.root.hidden = false;
    review.root.hidden = true;
    this.bar.className = 'gps-bar on-stage';
    if (o && o.deferLoad) { this.renderState(); return; }
    this.feedStarted = true;
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
    const live = swipe.liveItems();
    swipe.clearCards();
    feed.afterMutation(boundary, live);
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
    const mode = feed.describe();
    this.modeLabel.textContent = mode.label;
    this.modeChip.setAttribute('aria-label', t('scanMode') + ': ' + mode.label);
    this.modeChip.title = mode.label + ' — ' + t('scanChipHint') + ' (M)';
    clear(this.modeIcon);
    this.modeIcon.appendChild(icon(state.settings.albumKey ? 'album'
      : state.settings.order === 'oldest' ? 'sortOld' : state.settings.order === 'random' ? 'shuffle' : 'sortNew', 18));
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
      if (this.hydrating || (feed.ready && feed.loading)) {
        const pr = feed.progress;
        let text = t('loading');
        if (pr && pr.kind === 'album') text = typeof pr.n === 'number' ? t('albumLoading', { i: fmtNum(pr.i), n: fmtNum(pr.n) }) : t('albumLoadingN', { i: fmtNum(pr.i) });
        else if (pr && pr.kind === 'oldest') text = t('oldestSearching');
        swipe.stage.appendChild(h('div', { class: 'gps-center' }, h('div', { class: 'gps-spin' }), h('div', { text: text })));
      } else if (feed.error === 'album-gone') {
        // handled in onFeedChanged; nothing to paint for the one frame in between
      } else if (feed.error) {
        const scanPaused = feed.error === 'scan-paused';
        swipe.stage.appendChild(h('div', { class: 'gps-center' },
          h('div', { class: 'ic' }, icon(scanPaused ? 'search' : 'warn')),
          h('div', { class: 'big', text: t(scanPaused ? 'scanPausedTitle' : 'errLoadTitle') }),
          h('div', { text: t(scanPaused ? 'scanPausedSub' : 'errLoadSub') }),
          h('button', { class: 'gps-btn tonal', style: { marginTop: '8px' }, onclick: () => { feed.error = false; feed.ensure(); this.renderState(); } }, icon('undo', 18), h('span', { text: t('retry') })),
        ));
      } else if (feed.exhausted && feed.albumEmpty) {
        swipe.stage.appendChild(h('div', { class: 'gps-center' },
          h('div', { class: 'ic' }, icon('album')),
          h('div', { class: 'big', text: t('albumEmptyTitle') }),
          h('div', { text: t(state.settings.albumOwner || feed.myActor ? 'albumEmptySub' : 'albumEmptySubPlain') }),
          h('div', { class: 'row', style: { marginTop: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
            h('button', { class: 'gps-btn tonal', onclick: () => this.openScanMenu({ pickAlbum: true }) }, icon('album', 18), h('span', { text: t('pickAnotherAlbum') })),
            h('button', { class: 'gps-btn', onclick: () => this.openScanMenu() }, icon('compass', 18), h('span', { text: t('scanMode') }))),
        ));
      } else if (feed.exhausted) {
        swipe.stage.appendChild(h('div', { class: 'gps-center' },
          h('div', { class: 'ic' }, icon('check')),
          h('div', { class: 'big', text: t('doneTitle') }),
          h('div', { text: t('doneSub') }),
          h('div', { text: t('doneStats', { k: fmtNum(session.kept), d: fmtNum(session.deleted) }) }),
          h('div', { class: 'row', style: { marginTop: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
            marked.size ? h('button', { class: 'gps-btn tonal', onclick: () => this.showReview() }, icon('grid', 18), h('span', { text: t('reviewBtn') + ' (' + fmtNum(marked.size) + ')' })) : null,
            h('button', { class: 'gps-btn', onclick: () => this.openScanMenu() }, icon('compass', 18), h('span', { text: t('scanMode') }))),
        ));
      } else if (feed.ready && !this.feedStarted) {
        // the scan menu is deciding what to load; the stage stays quiet
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

  onFeedChanged() {
    if (feed.error === 'album-gone') { this.leaveAlbum(); return; }
    if (this.view === 'swipe') swipe.render(); else this.renderState();
  },

  // The chosen album no longer answers (deleted, unshared, stale key): fall
  // back to the library rather than looping on an error the user cannot fix.
  leaveAlbum() {
    const s = state.settings;
    s.albumKey = null; s.albumTitle = ''; s.albumAuthKey = null; s.albumOwner = null;
    state.cursorTs = null;
    state.cursorFloorTs = null;
    persist(true);
    this.snack(t('albumGone'), { kind: 'err', ms: 7000 });
    swipe.resetHistory();
    this.reloadFeed();
  },
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
      class: 'gps-dlg' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', tabindex: '-1',
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

  openIntro(thenScanMenu) {
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
      actions: [{ label: t('start'), primary: true, onClick: () => {
        state.introSeen = true; persist(true);
        if (thenScanMenu) setTimeout(() => this.openScanMenu({ startup: true }), 0);
      } }],
    });
  },

  // ---- scan menu -----------------------------------------------------------
  // What to review and in which order. Opened before the first card (unless the
  // user turned that off), from the app-bar chip, from Settings and with M.
  // `o.startup` = the feed has not been started for this open yet, so leaving
  // the menu by any route starts it with whatever is selected.
  openScanMenu(o) {
    o = o || {};
    if (this.busy() || (this.dialogOpen() && !o.reopen)) return;
    const s = state.settings;
    const d = o.draft || {
      order: s.order, source: s.source, scope: s.albumKey ? 'album' : 'library',
      albumKey: s.albumKey, albumTitle: s.albumTitle, albumAuthKey: s.albumAuthKey, albumOwner: s.albumOwner, albumThumb: null,
      dateFrom: s.dateFrom, dateTo: s.dateTo, mediaType: s.mediaType, skipFav: s.skipFav, resume: s.resume,
      showStartMenu: s.showStartMenu,
    };
    let settled = false;   // Start pressed or the picker took over: onDismiss must not act
    if (o.pickAlbum) {
      // straight into the album list, then back here with the choice
      settled = true;
      this.openAlbumPicker({
        onPick: (a) => {
          d.scope = 'album'; d.albumKey = a.mediaKey; d.albumTitle = a.title; d.albumAuthKey = a.authKey; d.albumOwner = a.ownerActor; d.albumThumb = a.thumb;
          this.openScanMenu({ startup: o.startup, draft: d, reopen: true });
        },
        onCancel: () => this.openScanMenu({ startup: o.startup, draft: d, reopen: true }),
      });
      return null;
    }
    // Nothing to change and a place to pick up from: the primary action reads
    // "continue" and says where, so a returning user does not re-read the form.
    const resumable = () => d.resume && d.scope !== 'album' && d.order !== 'random'
      && typeof state[d.order === 'oldest' ? 'cursorFloorTs' : 'cursorTs'] === 'number';
    const summary = h('p', { class: 'hi', hidden: true });

    // order
    const orderBtns = {};
    const orderGroup = h('div', { class: 'gps-cards', role: 'radiogroup', 'aria-label': t('scanOrder') });
    [['newest', 'sortNew'], ['oldest', 'sortOld'], ['random', 'shuffle']].forEach(([key, ico]) => {
      const cap = key[0].toUpperCase() + key.slice(1);
      const b = h('button', {
        type: 'button', class: 'gps-choice', role: 'radio', 'data-order': key,
        onclick: () => { d.order = key; paint(); },
      }, h('span', { class: 'ic' }, icon(ico, 22)),
      h('span', { class: 'tt' }, h('b', { text: t('order' + cap) }), h('span', { class: 'hint', text: t('order' + cap + 'Hint') })));
      orderBtns[key] = b;
      orderGroup.appendChild(b);
    });

    // scope
    const scopeSel = h('select', { 'aria-label': t('source') },
      h('option', { value: '1', text: t('srcLib') }),
      h('option', { value: '2', text: t('srcArchive') }),
      h('option', { value: '3', text: t('srcBoth') }),
      h('option', { value: 'album', text: t('srcAlbum') }));
    const albumName = h('b');
    const albumSub = h('span', { class: 'hint' });
    const albumArt = h('span', { class: 'ph' }, icon('album', 20));
    const pickBtn = h('button', { type: 'button', class: 'gps-btn text', onclick: () => toPicker() }, h('span'));
    const albumRow = h('div', { class: 'gps-album-row', hidden: true }, albumArt, h('span', { class: 'tt' }, albumName, albumSub), pickBtn);
    const toPicker = () => {
      settled = true;
      this.openAlbumPicker({
        onPick: (a) => {
          d.scope = 'album'; d.albumKey = a.mediaKey; d.albumTitle = a.title; d.albumAuthKey = a.authKey; d.albumOwner = a.ownerActor; d.albumThumb = a.thumb;
          this.openScanMenu({ startup: o.startup, draft: d, reopen: true });
        },
        onCancel: () => {
          if (!d.albumKey) { d.scope = 'library'; }
          this.openScanMenu({ startup: o.startup, draft: d, reopen: true });
        },
      });
    };
    scopeSel.addEventListener('change', () => {
      if (scopeSel.value === 'album') {
        d.scope = 'album';
        if (!d.albumKey) { toPicker(); return; }
      } else {
        d.scope = 'library';
        d.source = parseInt(scopeSel.value, 10) || 1;
      }
      paint();
    });

    // filters
    const from = h('input', { type: 'date', 'aria-label': t('dateFrom') }); from.value = d.dateFrom || '';
    const to = h('input', { type: 'date', 'aria-label': t('dateTo') }); to.value = d.dateTo || '';
    const media = h('select', { 'aria-label': t('mediaType') },
      h('option', { value: 'all', text: t('mediaAll') }),
      h('option', { value: 'photo', text: t('mediaPhoto') }),
      h('option', { value: 'video', text: t('mediaVideo') }));
    media.value = d.mediaType;
    const cb = (checked) => h('input', { type: 'checkbox', checked: checked || null });
    const skipF = cb(d.skipFav), resume = cb(d.resume), showMenu = cb(d.showStartMenu);
    const err = h('span', { class: 'hint gps-err', role: 'alert', hidden: true, text: t('dateRangeInvalid') });
    const skipFavHint = h('span', { class: 'hint', hidden: true, text: t('skipFavAlbumHint') });
    const resumeHint = h('span', { class: 'hint', text: t('resumeHint') });
    const filtersBody = h('div', { class: 'gps-filters', hidden: true },
      h('div', { class: 'gps-sec' }, h('span', { class: 'lbl', text: t('dateRange') }),
        h('div', { class: 'gps-daterange' }, h('label', null, t('dateFrom'), from), h('label', null, t('dateTo'), to)),
        err, h('span', { class: 'hint', text: t('dateRangeHint') })),
      h('label', null, t('mediaType'), media),
      h('label', { class: 'row' }, skipF, h('span', { text: t('skipFav') })),
      skipFavHint,
      h('label', { class: 'row' }, resume, h('span', { text: t('resume') })),
      resumeHint);
    const filterBadge = h('span', { class: 'gps-badge', hidden: true, text: '0' });
    const filtersToggle = h('button', { type: 'button', class: 'gps-btn text gps-filters-toggle', 'aria-expanded': 'false' },
      icon('tune', 18), h('span', { text: t('filters') }), filterBadge);
    filtersToggle.addEventListener('click', () => {
      filtersBody.hidden = !filtersBody.hidden;
      filtersToggle.setAttribute('aria-expanded', filtersBody.hidden ? 'false' : 'true');
    });
    const activeFilters = () => (from.value ? 1 : 0) + (to.value ? 1 : 0) + (media.value !== 'all' ? 1 : 0) + (skipF.checked && d.scope !== 'album' ? 1 : 0);
    const valid = () => !(from.value && to.value && from.value > to.value);
    // What Start would change, compared with the saved scan.
    const changed = () => {
      const toAlbum = d.scope === 'album' && !!d.albumKey;
      return d.order !== s.order
        || toAlbum !== !!s.albumKey || (toAlbum && d.albumKey !== s.albumKey)
        || (!toAlbum && d.source !== s.source)
        || (from.value || '') !== (s.dateFrom || '') || (to.value || '') !== (s.dateTo || '')
        || media.value !== s.mediaType || skipF.checked !== s.skipFav || resume.checked !== s.resume;
    };

    let startBtn = null;
    const paint = () => {
      for (const key in orderBtns) orderBtns[key].setAttribute('aria-checked', d.order === key ? 'true' : 'false');
      scopeSel.value = d.scope === 'album' ? 'album' : String(d.source);
      albumRow.hidden = d.scope !== 'album';
      albumName.textContent = d.albumKey ? (d.albumTitle || t('srcAlbum')) : t('noAlbumPicked');
      albumSub.textContent = d.albumKey ? t('srcAlbum') : '';
      clear(pickBtn); pickBtn.appendChild(h('span', { text: d.albumKey ? t('changeAlbum') : t('pickAlbum') }));
      clear(albumArt);
      if (d.albumThumb && googleMediaBase(d.albumThumb)) {
        const im = h('img', { alt: '' }); im.src = imgUrl({ thumb: d.albumThumb }, 120); albumArt.appendChild(im);
      } else albumArt.appendChild(icon('album', 20));
      resume.disabled = d.order === 'random' || d.scope === 'album';
      resumeHint.hidden = !resume.disabled;
      skipF.disabled = d.scope === 'album';
      skipFavHint.hidden = !skipF.disabled;
      const n = activeFilters();
      filterBadge.hidden = n === 0; filterBadge.textContent = String(n);
      if (n && filtersBody.hidden && !paint.opened) { filtersBody.hidden = false; filtersToggle.setAttribute('aria-expanded', 'true'); }
      paint.opened = true;
      err.hidden = valid();
      const cont = !changed() && resumable();
      if (cont) {
        const at = state[d.order === 'oldest' ? 'cursorFloorTs' : 'cursorTs'];
        summary.textContent = t('resumeSummary', { d: fmtDate({ ts: at, tz: 0 }), dir: t(d.order === 'oldest' ? 'resumeForward' : 'resumeBackward') });
      }
      summary.hidden = !cont;
      if (startBtn) {
        startBtn.disabled = !valid();
        startBtn.textContent = cont ? t('continueBtn') : t('start');
      }
    };
    [from, to, media, skipF].forEach((el) => el.addEventListener('change', paint));
    [from, to].forEach((el) => el.addEventListener('input', paint));

    const apply = () => {
      if (!valid()) return false;
      const toAlbum = d.scope === 'album' && !!d.albumKey;
      const feedChanged = changed();
      s.order = d.order;
      s.source = d.source;
      if (toAlbum) { s.albumKey = d.albumKey; s.albumTitle = d.albumTitle || ''; s.albumAuthKey = d.albumAuthKey || null; s.albumOwner = d.albumOwner || null; }
      else { s.albumKey = null; s.albumTitle = ''; s.albumAuthKey = null; s.albumOwner = null; }
      s.dateFrom = from.value || '';
      s.dateTo = to.value || '';
      s.mediaType = media.value;
      s.skipFav = skipF.checked;
      s.resume = resume.checked;
      s.showStartMenu = showMenu.checked;
      if (feedChanged) { state.cursorTs = null; state.cursorFloorTs = null; }
      persist(true);
      if (feedChanged || !this.feedStarted) {
        if (feedChanged) swipe.resetHistory();
        this.reloadFeed();
      } else {
        this.renderState();
      }
      return true;
    };

    // Cancel and Start behave the same when nothing changed; on the startup
    // menu, Cancel simply starts the scan as it was.
    const actions = [{ label: t('cancel') }];
    actions.push({ label: t('start'), primary: true, keepOpen: true, onClick: () => {
      if (!apply()) return;
      settled = true;
      this.closeDialog(true);
    } });
    const scrim = this.dialog({
      title: t('scanMenuTitle'),
      wide: true,
      onDismiss: () => {
        // leaving the startup menu by Escape or the scrim starts the scan as is
        if (!settled && o.startup && !this.feedStarted && !this.busy()) this.reloadFeed();
      },
      body: [
        summary,
        h('div', { class: 'gps-sec' }, h('span', { class: 'lbl', text: t('scanOrder') }), orderGroup),
        h('div', { class: 'gps-sec' }, h('span', { class: 'lbl', text: t('source') }), scopeSel, albumRow),
        filtersToggle,
        filtersBody,
        h('div', { class: 'gps-foot' }, h('label', { class: 'row' }, showMenu, h('span', { text: t('showStartMenu') }))),
      ],
      actions: actions,
    });
    startBtn = scrim.querySelector('.acts .gps-btn.filled');
    paint();
    return scrim;
  },

  // Albums the user made, newest activity first. Albums shared TO the user are
  // left out: their rows are not in this library and cannot be trashed here.
  openAlbumPicker(o) {
    const list = h('div', { class: 'gps-albums', role: 'listbox', 'aria-label': t('pickAlbum') });
    const search = h('input', { type: 'search', placeholder: t('albumSearch'), 'aria-label': t('albumSearch') });
    const status = h('div', { class: 'gps-center gps-albums-status', style: { position: 'relative' }, hidden: true });
    const more = h('button', { type: 'button', class: 'gps-btn text', hidden: true }, h('span', { text: t('albumsMore') }));
    const albums = [];
    const seen = new Set();
    const tokens = new Set();
    let nextPageId = null, pages = 0, loading = false, failed = false, done = false, picked = false, closed = false;
    const ALBUMS_MAX_PAGES = 20;   // 2000 albums before "load more" becomes a manual step

    const years = (a) => {
      const y = (ts) => (typeof ts === 'number' ? new Date(ts).getUTCFullYear() : null);
      const a0 = y(a.startTs), a1 = y(a.endTs);
      if (a0 === null && a1 === null) return '';
      if (a0 === null || a1 === null || a0 === a1) return String(a0 === null ? a1 : a0);
      return a0 + ' – ' + a1;
    };
    const row = (a) => {
      const art = h('span', { class: 'ph' }, icon('album', 20));
      if (a.thumb && googleMediaBase(a.thumb)) {
        const im = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
        im.addEventListener('error', () => { clear(art); art.appendChild(icon('album', 20)); }, { once: true });
        im.src = imgUrl({ thumb: a.thumb }, 120);
        clear(art); art.appendChild(im);
      }
      const bits = [];
      if (typeof a.itemCount === 'number') bits.push(t('albumCount', { n: fmtNum(a.itemCount) }));
      const yr = years(a);
      if (yr) bits.push(yr);
      const label = (a.title || t('srcAlbum')) + (bits.length ? ', ' + bits.join(', ') : '') + (a.isShared ? ', ' + t('albumShared') : '');
      return h('button', { type: 'button', class: 'gps-album', role: 'option', 'aria-label': label, onclick: () => pick(a) },
        art,
        h('span', { class: 'tt' }, h('b', { text: a.title || t('srcAlbum') }), h('span', { class: 'hint', text: bits.join(' · ') })),
        a.isShared ? h('span', { class: 'sh', text: t('albumShared') }) : null);
    };
    const render = () => {
      if (closed) return;
      clear(list);
      const q = search.value.trim().toLowerCase();
      const shown = albums.filter((a) => !q || (a.title || '').toLowerCase().indexOf(q) !== -1);
      shown.forEach((a) => list.appendChild(row(a)));
      clear(status);
      status.hidden = false;
      if (loading) status.append(h('div', { class: 'gps-spin' }), h('div', { text: albums.length ? t('albumsLoadingN', { n: fmtNum(albums.length) }) : t('albumsLoading') }));
      else if (failed) status.append(h('div', { text: t('albumsError') }),
        h('button', { type: 'button', class: 'gps-btn tonal', onclick: () => loadAll() }, icon('undo', 18), h('span', { text: t('retry') })));
      else if (!shown.length && done) status.append(h('div', { text: t('albumsEmpty') }));
      else status.hidden = true;
      // only when the page cap stopped the automatic walk does "more" appear
      more.hidden = loading || failed || done || !nextPageId;
    };
    const loadPage = async () => {
      const key = nextPageId === null ? '__first__' : String(nextPageId);
      if (tokens.has(key)) throw new Error('pagination token repeated: ' + key);
      const page = await api.listAlbums({ pageId: nextPageId });
      tokens.add(key);
      pages++;
      for (const a of page.albums) {
        // kind 4 = shared with the user by somebody else: not this library
        if (a.kind === 4) continue;
        if (seen.has(a.mediaKey)) continue;
        seen.add(a.mediaKey);
        albums.push(a);
      }
      nextPageId = page.nextPageId;
      if (!nextPageId) done = true;
    };
    // Google returns albums by recent activity, so the old ones a cleanup
    // reaches for sit on later pages; read them all before the filter is
    // trusted, painting as pages arrive.
    const loadAll = async () => {
      if (loading || closed) return;
      loading = true; failed = false; render();
      try {
        while (!done && pages < ALBUMS_MAX_PAGES && !closed) { await loadPage(); render(); }
      } catch (e) {
        console.warn('[gpSwipe] could not list albums', e);
        failed = true;
      } finally {
        loading = false;
        render();
      }
    };
    more.addEventListener('click', async () => {
      if (loading || closed) return;
      loading = true; failed = false; render();
      try { await loadPage(); } catch (e) { failed = true; } finally { loading = false; render(); }
    });
    search.addEventListener('input', render);
    const pick = (a) => {
      picked = true; closed = true;
      this.closeDialog(true, true);
      o.onPick({ mediaKey: a.mediaKey, title: a.title, authKey: a.authKey, ownerActor: a.ownerActor, thumb: a.thumb });
    };
    this.dialog({
      title: t('pickAlbum'),
      wide: true,
      onDismiss: () => { closed = true; if (!picked) o.onCancel(); },
      body: [search, h('p', { class: 'hint', text: t('albumSharedHint') }), list, status, more],
      actions: [{ label: t('cancel'), onClick: () => { picked = true; closed = true; o.onCancel(); } }],
    });
    search.focus({ preventScroll: true });
    loadAll();
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
    const dry = cb(s.dryRun);

    const mode = feed.describe();
    const scanBtn = h('button', { class: 'gps-btn tonal', style: { alignSelf: 'flex-start' } }, icon('compass', 18), h('span', { text: t('scanMode') + ' · ' + mode.label }));
    scanBtn.addEventListener('click', () => { this.applyTheme(originalTheme); this.closeDialog(true, true); this.openScanMenu(); });

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
              state.cursorFloorTs = null;
              persist(true);
              swipe.resetHistory();
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
        scanBtn,
        h('label', null, t('reviewEvery'), every, h('span', { class: 'hint', text: t('reviewEveryHint') })),
        h('label', null, t('language'), language),
        h('label', null, t('theme'), theme),
        h('label', { class: 'row' }, dry, h('span', { text: t('dryRun') })),
        h('span', { class: 'hint', text: t('dryRunHint') }),
        exportBtn,
        resetBtn,
      ],
      actions: [
        { label: t('cancel'), onClick: () => this.applyTheme() },
        { label: t('save'), primary: true, onClick: () => {
          s.reviewEvery = Math.max(0, Math.min(1000, parseInt(every.value, 10) || 0));
          s.language = language.value === 'auto' || LANGUAGE_CODES.indexOf(language.value) !== -1 ? language.value : 'auto';
          s.theme = theme.value;
          s.dryRun = dry.checked;
          persist(true);
          this.applyTheme();
          const languageChanged = setLanguage(s.language);
          if (languageChanged) this.rebuildForLanguage();
          else this.renderState();
        } },
      ],
    });
  },

  reloadFeed() {
    if (this.busy()) return;
    swipe.clearCards();
    if (this.bannerEl) { this.bannerEl.remove(); this.bannerEl = null; }
    feed.reset();
    this.feedStarted = true;
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
        const group = inside && tgt.getAttribute && tgt.getAttribute('role') === 'radio' ? tgt.closest('[role=radiogroup]') : null;
        if (e.key === 'Escape') { stop(); this.closeDialog(); }
        else if (group && e.key.startsWith('Arrow')) {
          // roving selection over the menu's radio cards
          stop();
          const radios = Array.from(group.querySelectorAll('[role=radio]'));
          const i = radios.indexOf(tgt);
          const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
          const next = radios[(i + step + radios.length) % radios.length];
          if (next) { next.focus({ preventScroll: true }); next.click(); }
        }
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
          case 'm': case 'M': stop(); this.openScanMenu(); return;
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
        case 'm': case 'M': stop(); this.openScanMenu(); break;
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
  videoSource: videoSource,
  state: state, kept: kept, marked: marked, history: history, session: session,
  locales: STRINGS,
});
window.__gpSwipe = gpSwipePublic;
