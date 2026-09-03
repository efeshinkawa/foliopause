// ---------------------------------------------------------------------------
// The review view: everything swiped left waits here until the user confirms.
// This is the only place that can actually delete, and even then it only moves
// photos to Google's Trash, where they stay recoverable for 60 days.
// ---------------------------------------------------------------------------

const review = {
  root: null, scroll: null, grid: null, headSub: null, confirm: null, selCountEl: null,
  delBtn: null, toggleAllBtn: null, undoAllBtn: null,
  selected: new Set(),    // media keys that will be deleted when confirmed
  deleting: false,
  restoring: false,
  savingChoices: false,
  verified: null,         // null = not tried yet, true/false
  failStreak: 0,
  lightbox: null,

  build() {
    this.grid = h('div', { class: 'gps-grid' });
    this.headSub = h('p');
    this.undoAllBtn = h('button', { class: 'gps-btn text', onclick: () => this.undoAll() }, icon('undo', 18), h('span', { text: t('undoAll') }));
    this.toggleAllBtn = h('button', { class: 'gps-btn text', onclick: () => this.toggleAll() }, icon('check', 18), h('span', { text: t('selectNone') }));
    const head = h('div', { class: 'gps-rhead' },
      h('div', null, h('h2', { text: t('reviewTitle') }), this.headSub),
      h('div', { class: 'gps-spacer' }),
      this.undoAllBtn,
      this.toggleAllBtn,
    );
    this.scroll = h('div', { class: 'gps-scroll' }, head, this.grid);
    this.selCountEl = h('span', { class: 'sum' });
    this.delBtn = h('button', { class: 'gps-btn danger', onclick: () => this.confirmDelete() }, icon('trash', 18), h('span', { text: t('deleteNow') }));
    this.confirm = h('div', { class: 'gps-confirm' },
      this.selCountEl,
      h('div', { class: 'gps-spacer' }),
      h('button', { class: 'gps-btn text', onclick: () => app.showSwipe() }, h('span', { text: t('backToSwipe') })),
      this.delBtn,
    );
    this.root = h('div', { class: 'gps-view', hidden: true }, this.scroll, this.confirm);
    return this.root;
  },

  sizeOf(it) {
    if (typeof it.size === 'number') return it.size;
    const i = feed.info[it.mediaKey];
    return (i && i.size) || 0;
  },
  nameOf(it) {
    if (it.fileName) return it.fileName;
    const i = feed.info[it.mediaKey];
    return (i && i.fileName) || '';
  },
  items() {
    return Array.from(marked.values()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  },

  open() {
    const all = this.items();
    // New marks default to selected. Explicit "keep" choices are stored with
    // the marked record, so leaving/reopening Review can never silently turn a
    // spared photo back into a deletion.
    this.selected = new Set(all.filter((i) => i.reviewSelected !== false).map((i) => i.mediaKey));
    this.render();
    this.fetchMissingInfo(all);
  },

  // sizes for items marked in an earlier session
  async fetchMissingInfo(items) {
    const want = items.filter((i) => typeof i.size !== 'number' && !feed.info[i.mediaKey]).map((i) => i.mediaKey).slice(0, 200);
    if (!want.length || feed.infoFailed) return;
    for (let i = 0; i < want.length; i += 50) {
      try {
        const res = await api.bulkInfo(want.slice(i, i + 50));
        Object.assign(feed.info, res);
      } catch (e) { feed.infoFailed = true; return; }
      if (app.view === 'review') this.renderSummary();
    }
  },

  render() {
    if (!this.root) return;
    const all = this.items();
    clear(this.grid);

    if (!all.length) {
      this.confirm.hidden = true;
      this.grid.appendChild(h('div', { class: 'gps-center', style: { position: 'relative', minHeight: '320px' } },
        h('div', { class: 'ic' }, icon('stack')),
        h('div', { class: 'big', text: t('reviewEmptyTitle') }),
        h('div', { text: t('reviewEmptySub') }),
        h('button', { class: 'gps-btn tonal', style: { marginTop: '8px' }, onclick: () => app.showSwipe() }, icon('swipe', 18), h('span', { text: t('backToSwipe') })),
      ));
      this.renderSummary();
      return;
    }
    this.confirm.hidden = false;

    for (const it of all) {
      const ar = it.w && it.h ? it.w / it.h : 1;
      const on = this.selected.has(it.mediaKey);
      const tile = h('div', {
        class: 'gps-tile' + (on ? '' : ' spared'),
        style: { flexGrow: String(Math.max(0.35, ar)), flexBasis: Math.round(200 * ar) + 'px' },
        role: 'checkbox', 'aria-checked': on ? 'true' : 'false', tabindex: '0',
        'aria-label': fmtDate(it) + ' — ' + (on ? t('deleteNow') : t('spared')),
        onclick: (e) => { if (!e.target.closest('.zoom')) this.toggle(it.mediaKey); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(it.mediaKey); } },
      });
      const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
      img.src = imgUrl(it, 512);
      tile.appendChild(img);
      if (it.isVideo) {
        tile.appendChild(h('div', { class: 'tvid' }, icon('play'), it.duration ? h('span', { text: fmtDur(it.duration) }) : null));
      }
      tile.appendChild(h('div', { class: 'mark' }, icon(on ? 'trash' : 'check')));
      tile.appendChild(h('span', { class: 'kchip', text: t('spared') }));
      tile.appendChild(h('button', {
        class: 'zoom', title: t('open'), 'aria-label': t('open'),
        onclick: (e) => { e.stopPropagation(); this.openLightbox(it); },
      }, icon('expand')));
      const size = this.sizeOf(it);
      tile.appendChild(h('div', { class: 'cap', text: fmtDate(it) + (size ? '  ·  ' + fmtBytes(size) : '') }));
      this.grid.appendChild(tile);
    }
    // keeps the last justified row from stretching to full width
    this.grid.appendChild(h('div', { class: 'sp' }));
    this.renderSummary();
  },

  renderSummary() {
    const all = this.items();
    const n = this.selected.size;
    const spared = all.length - n;
    let bytes = 0;
    for (const it of all) if (this.selected.has(it.mediaKey)) bytes += this.sizeOf(it);
    this.headSub.textContent = t('reviewSub', { n: fmtNum(n), s: fmtNum(spared) });
    clear(this.selCountEl);
    if (n) {
      this.selCountEl.appendChild(h('b', { text: t('willDelete', { n: fmtNum(n) }) }));
      if (bytes) this.selCountEl.appendChild(h('span', { text: '  ·  ' + fmtBytes(bytes) }));
    } else {
      this.selCountEl.appendChild(h('span', { text: t('willDeleteNone') }));
    }
    clear(this.delBtn);
    this.delBtn.className = 'gps-btn ' + (n ? 'danger' : 'tonal');
    this.delBtn.appendChild(icon(n ? 'trash' : 'check', 18));
    this.delBtn.appendChild(h('span', { text: n ? t('deleteNow') : t('keepAll') }));
    this.delBtn.disabled = all.length === 0 || this.deleting || this.restoring || this.savingChoices;
    this.undoAllBtn.disabled = this.deleting || this.restoring || this.savingChoices;
    this.undoAllBtn.hidden = all.length === 0;
    const allOn = all.length > 0 && n === all.length;
    clear(this.toggleAllBtn);
    this.toggleAllBtn.appendChild(icon(allOn ? 'close' : 'check', 18));
    this.toggleAllBtn.appendChild(h('span', { text: allOn ? t('selectNone') : t('selectAll') }));
    this.toggleAllBtn.hidden = all.length === 0;
    app.renderState();
  },

  async toggle(key) {
    if (this.deleting || this.restoring || this.savingChoices) return;
    const all = this.items();
    const idx = all.findIndex((i) => i.mediaKey === key);
    if (idx === -1) return;
    const on = !this.selected.has(key);
    const updated = Object.assign({}, all[idx], { reviewSelected: on });
    this.savingChoices = true;
    try {
      await store.saveReviewChoices([updated]);
    } catch (e) {
      console.error('[gpSwipe] could not save review choice', e);
      app.snack(t('localSaveFailed'), { kind: 'err', ms: 7000 });
      return;
    } finally {
      this.savingChoices = false;
    }
    if (on) this.selected.add(key); else this.selected.delete(key);
    const tile = this.grid.children[idx];
    if (tile) {
      tile.classList.toggle('spared', !on);
      tile.setAttribute('aria-checked', on ? 'true' : 'false');
      tile.setAttribute('aria-label', fmtDate(updated) + ' — ' + (on ? t('deleteNow') : t('spared')));
      const mk = tile.querySelector('.mark');
      if (mk) { clear(mk); mk.appendChild(icon(on ? 'trash' : 'check')); }
    }
    this.renderSummary();
  },

  async toggleAll() {
    if (this.deleting || this.restoring || this.savingChoices) return;
    const all = this.items();
    const on = this.selected.size !== all.length;
    const updated = all.map((it) => Object.assign({}, it, { reviewSelected: on }));
    this.savingChoices = true;
    try {
      await store.saveReviewChoices(updated);
    } catch (e) {
      console.error('[gpSwipe] could not save review choices', e);
      app.snack(t('localSaveFailed'), { kind: 'err', ms: 7000 });
      return;
    } finally {
      this.savingChoices = false;
    }
    this.selected = on ? new Set(updated.map((i) => i.mediaKey)) : new Set();
    this.render();
  },

  async undoAll() {
    if (this.deleting || this.restoring || this.savingChoices) return;
    const all = this.items();
    if (!all.length) return;
    this.savingChoices = true;
    app.renderState();
    let done = false;
    try {
      await store.unmarkMany(all);
      session.marked = Math.max(0, session.marked - all.length);
      state.sinceReview = 0;
      state.cursorTs = null;
      swipe.dropHistory(new Set(all.map((it) => it.mediaKey)));
      this.selected.clear();
      persist(true);
      done = true;
    } catch (e) {
      console.error('[gpSwipe] could not undo all review marks', e);
      app.snack(t('localSaveFailed'), { kind: 'err', ms: 7000 });
    } finally {
      this.savingChoices = false;
      app.renderState();
    }
    if (done) {
      app.snack(t('allUnmarked', { n: fmtNum(all.length) }), { kind: 'ok' });
      app.reloadFeed();
    }
  },

  // ---- full-size preview -------------------------------------------------
  openLightbox(item) {
    const all = this.items();
    let idx = all.findIndex((i) => i.mediaKey === item.mediaKey);
    const img = h('img', { alt: '', draggable: 'false' });
    const cap = h('div', { class: 'gps-count' });
    const markBtn = h('button', { class: 'gps-btn', onclick: async () => { await this.toggle(all[idx].mediaKey); paint(); } });
    const bar = h('div', { class: 'gps-bar on-stage' },
      h('button', { class: 'gps-ib', title: t('close'), onclick: () => close() }, icon('close')),
      cap, h('div', { class: 'gps-spacer' }), markBtn,
      h('button', { class: 'gps-ib', title: t('open'), onclick: () => window.open(photoPageUrl(all[idx]), '_blank', 'noopener') }, icon('openNew')),
    );
    const prev = h('button', { class: 'gps-nav l', title: t('prev'), onclick: () => go(-1) }, icon('chevL'));
    const next = h('button', { class: 'gps-nav r', title: t('next'), onclick: () => go(1) }, icon('chevR'));
    const play = h('button', {
      class: 'gps-play', hidden: true, title: t('playVideo') + ' (V)', 'aria-label': t('playVideo'),
      onclick: (e) => { e.stopPropagation(); startVideo(); },
    }, icon('play'));
    const media = h('div', { class: 'im' }, img, play, prev, next);
    const box = h('div', { class: 'gps-light-box' }, bar, media);

    const stopVideo = () => {
      const v = media.querySelector('video');
      if (v) {
        try { v._gone = true; v.pause(); v.remove(); v.removeAttribute('src'); v.load(); } catch (e) {}
      }
      box.classList.remove('playing');
    };
    const startVideo = async () => {
      const it = all[idx];
      if (!it || !it.isVideo || media.querySelector('video')) return;
      box.classList.add('playing');
      let variant = videoSource.variant;
      if (!variant) {
        app.snack(t('videoLoading'), { ms: 2000 });
        variant = await videoSource.resolve(it);
        if (!box.isConnected || all[idx] !== it) { box.classList.remove('playing'); return; }
      }
      const v = h('video', { controls: true, playsinline: true, preload: 'auto' });
      const fail = () => {
        if (v._gone || !v.isConnected) return;
        stopVideo();
        app.snack(t('videoFail'), { kind: 'err', ms: 5000 });
      };
      v.addEventListener('error', fail);
      v.addEventListener('play', () => box.classList.add('playing'));
      v.addEventListener('pause', () => box.classList.remove('playing'));
      v.addEventListener('ended', () => box.classList.remove('playing'));
      v.src = videoUrl(it, variant);
      media.insertBefore(v, prev);
      v.play().catch(() => {});
    };

    const paint = () => {
      const it = all[idx];
      if (!it) { close(); return; }
      stopVideo();
      play.hidden = !it.isVideo;
      img.src = imgUrl(it, 1800);
      cap.textContent = (idx + 1) + ' / ' + all.length + '  ·  ' + fmtDate(it, true)
        + (it.isVideo && it.duration ? '  ·  ' + fmtDur(it.duration) : '')
        + (this.sizeOf(it) ? '  ·  ' + fmtBytes(this.sizeOf(it)) : '');
      const on = this.selected.has(it.mediaKey);
      clear(markBtn);
      markBtn.className = 'gps-btn ' + (on ? 'danger' : 'tonal');
      markBtn.appendChild(icon(on ? 'trash' : 'check', 18));
      markBtn.appendChild(h('span', { text: on ? t('deleteNow') : t('spared') }));
      prev.disabled = idx === 0;
      next.disabled = idx === all.length - 1;
    };
    const go = (d) => { idx = Math.max(0, Math.min(all.length - 1, idx + d)); paint(); };
    const close = () => { stopVideo(); box.remove(); this.lightbox = null; };
    box._keys = (e) => {
      if (e.key === 'Escape') { close(); return true; }
      if (e.key === 'ArrowLeft') { go(-1); return true; }
      if (e.key === 'ArrowRight') { go(1); return true; }
      if (e.key === 'v' || e.key === 'V') { startVideo(); return true; }
      if (e.key === ' ' || e.key === 'Enter') { this.toggle(all[idx].mediaKey).then(paint); return true; }
      return false;
    };
    this.lightbox = box;
    paint();
    app.root.appendChild(box);
  },

  // ---- deletion ----------------------------------------------------------
  async confirmDelete() {
    if (this.deleting || this.restoring || this.savingChoices) return;
    const all = this.items();
    const toDelete = all.filter((i) => this.selected.has(i.mediaKey));
    const toKeep = all.filter((i) => !this.selected.has(i.mediaKey));
    if (!all.length) return;

    // Page tokens are offsets into a collection that is about to mutate. Keep
    // an inclusive timestamp boundary so the feed can safely refetch without
    // skipping the row that moved into the deleted rows' old positions.
    const boundary = feed.mutationBoundary();
    this.deleting = true;
    swipe.busy = true;
    this.delBtn.disabled = true;
    const bar = h('i', { style: { width: '0%' } });
    const label = h('div', { text: toDelete.length ? t('deleting', { i: 0, n: fmtNum(toDelete.length) }) : t('keeping') });
    const overlay = h('div', { class: 'gps-center', style: { background: 'color-mix(in srgb, var(--sf) 88%, transparent)', zIndex: '6' } },
      h('div', { class: 'gps-spin' }), label, h('div', { class: 'gps-lin' }, bar));
    this.root.appendChild(overlay);

    const dry = !!state.settings.dryRun;
    const onProgress = (done, total) => {
      bar.style.width = Math.round((done / total) * 100) + '%';
      label.textContent = t('deleting', { i: fmtNum(done), n: fmtNum(total) });
    };
    let shouldRefetch = false;
    let goBackToSwipe = false;
    try {
      // A spared photo is a real decision. Commit the kept+marked transition in
      // one IndexedDB transaction before any destructive request is allowed.
      if (toKeep.length) {
        await store.moveMarkedToKept(toKeep);
        state.stats.kept += toKeep.length;
        session.kept += toKeep.length;
        session.marked = Math.max(0, session.marked - toKeep.length);
        this.selected = new Set(Array.from(this.selected).filter((k) => !toKeep.some((i) => i.mediaKey === k)));
        swipe.dropHistory(new Set(toKeep.map((i) => i.mediaKey)));
        persist(true);
      }

      if (!toDelete.length) {
        app.snack(t('keptBatch', { n: fmtNum(toKeep.length) }), { kind: 'ok' });
        goBackToSwipe = true;
        return;
      }

      if (dry) {
        // Everything runs exactly as usual except the one call that would
        // mutate Google Photos. Selected photos stay in Review afterwards.
        for (let i = 0; i < toDelete.length; i += 50) {
          await sleep(120);
          onProgress(Math.min(toDelete.length, i + 50), toDelete.length);
        }
        await store.logDeleted(toDelete, true);
        persist(true);
        app.snack(t('dryDone', { n: fmtNum(toDelete.length) }), { ms: 9000 });
        return;
      }

      const res = await api.trashBatch(toDelete.map((i) => i.dedupKey), onProgress);
      const byDedup = new Map(toDelete.map((i) => [i.dedupKey, i]));
      const acknowledged = Array.from(new Set(res.ok)).map((k) => byDedup.get(k)).filter(Boolean);
      shouldRefetch = acknowledged.length > 0;

      // An undocumented RPC returning a familiar envelope is not enough to
      // clear durable state. Confirm every acknowledgement against Trash; a
      // missing/unknown result stays selected so the app fails closed.
      let trashKeys = new Set();
      let verificationWorked = acknowledged.length === 0;
      if (acknowledged.length) {
        app.snack(t('verifying'), { ms: 3000 });
        try {
          trashKeys = await api.trashKeys({ retries: 2, want: acknowledged.map((i) => i.mediaKey) });
          verificationWorked = true;
        } catch (e) {
          console.warn('[gpSwipe] trash listing verification failed', e);
        }
      }
      const verifiedItems = verificationWorked ? acknowledged.filter((i) => trashKeys.has(i.mediaKey)) : [];
      let okItems = verifiedItems;

      // The local marked row and deletion log are one atomic commit. If that
      // commit fails, keep the row visible even though Google may have moved it;
      // the warning directs the user to Trash instead of silently losing track.
      if (okItems.length) {
        try {
          await store.commitTrashed(okItems);
        } catch (e) {
          console.error('[gpSwipe] could not commit verified trash rows', e);
          okItems = [];
          app.snack(t('localSaveFailed'), { kind: 'err', ms: 9000 });
        }
      }

      const okKeys = new Set(okItems.map((i) => i.mediaKey));
      const failItems = toDelete.filter((i) => !okKeys.has(i.mediaKey));
      let freed = 0;
      okItems.forEach((i) => { freed += this.sizeOf(i); this.selected.delete(i.mediaKey); });
      failItems.forEach((i) => this.selected.add(i.mediaKey));
      state.stats.deleted += okItems.length;
      state.stats.freedBytes += freed;
      session.deleted += okItems.length;
      session.marked = Math.max(0, session.marked - okItems.length);
      swipe.dropHistory(okKeys);
      persist(true);

      if (acknowledged.length) {
        this.verified = verificationWorked && verifiedItems.length === acknowledged.length;
        if (this.verified) app.snack(t('verifyOk'), { kind: 'ok', ms: 4000 });
        else app.banner(t('verifyWarn'));
      }

      if (okItems.length) {
        this.failStreak = 0;
        const batchEntry = { action: 'trash', items: okItems };
        swipe.push(batchEntry);
        app.snack(t('deletedToast', { n: fmtNum(okItems.length) }), {
          ms: 12000, kind: 'ok',
          action: t('restoreAction'),
          onAction: () => swipe.undoTrash(batchEntry, false),
        });
      }
      if (failItems.length) {
        this.failStreak++;
        if (res.fatal || this.failStreak >= 2) app.banner(t('sessionBroken'));
        app.snack(okItems.length
          ? t('deletedPartial', { ok: fmtNum(okItems.length), fail: fmtNum(failItems.length) })
          : (res.fatal ? t('sessionBroken') : t('deletedPartial', { ok: 0, fail: fmtNum(failItems.length) })),
        { kind: 'err', ms: 8000 });
      }
      goBackToSwipe = marked.size === 0;
    } catch (e) {
      console.error('[gpSwipe] review commit failed', e);
      this.failStreak++;
      app.snack(t('localSaveFailed'), { kind: 'err', ms: 9000 });
    } finally {
      overlay.remove();
      this.deleting = false;
      swipe.busy = false;
      if (shouldRefetch) app.invalidateFeed(boundary);
      this.render();
      if (goBackToSwipe) app.showSwipe();
      app.renderState();
    }
  },

  async restore(items) {
    if (this.deleting || this.restoring || !items || !items.length) return { restoredItems: [], failedItems: items || [] };
    const boundary = feed.mutationBoundary();
    this.restoring = true;
    app.snack(t('restoring'), { ms: 2000 });
    let mutated = false;
    let restoredItems = [];
    let failedItems = items.slice();
    try {
      const res = await api.restoreBatch(items.map((i) => i.dedupKey));
      const byDedup = new Map(items.map((i) => [i.dedupKey, i]));
      const acknowledged = Array.from(new Set(res.ok)).map((k) => byDedup.get(k)).filter(Boolean)
        .map((i) => Object.assign({}, i, { reviewSelected: true }));
      mutated = acknowledged.length > 0;
      let verified = [];
      if (acknowledged.length) {
        try {
          // Restoring is the mirror image of deleting: only a complete Trash
          // scan can prove an acknowledged item is no longer there.
          const trashKeys = await api.trashKeys({ retries: 2, scanAll: true });
          if (!trashKeys.complete) throw new Error('trash scan safety limit reached');
          verified = acknowledged.filter((i) => !trashKeys.has(i.mediaKey));
        } catch (e) {
          console.warn('[gpSwipe] restore verification failed', e);
        }
      }
      if (verified.length) {
        try {
          await store.restoreMarked(verified);
          await store.logRemove(verified.map((i) => i.mediaKey));
          restoredItems = verified;
          const restoredKeys = new Set(verified.map((i) => i.mediaKey));
          failedItems = items.filter((i) => !restoredKeys.has(i.mediaKey));
          let freed = 0;
          verified.forEach((i) => { freed += this.sizeOf(i); this.selected.add(i.mediaKey); });
          state.stats.deleted = Math.max(0, state.stats.deleted - verified.length);
          state.stats.freedBytes = Math.max(0, state.stats.freedBytes - freed);
          session.deleted = Math.max(0, session.deleted - verified.length);
          session.marked += verified.length;
          persist(true);
          app.snack(t('restoredToast', { n: fmtNum(verified.length) }), { kind: 'ok' });
        } catch (e) {
          console.error('[gpSwipe] could not persist restored rows', e);
          app.snack(t('localSaveFailed'), { kind: 'err', ms: 9000 });
        }
      }
      if (failedItems.length) app.snack(t('restoreFailed'), { kind: 'err', ms: 8000, action: t('openTrash'), onAction: () => window.open(trashPageUrl(), '_blank', 'noopener') });
    } catch (e) {
      console.error('[gpSwipe] restore failed', e);
      app.snack(t('restoreFailed'), { kind: 'err', ms: 8000, action: t('openTrash'), onAction: () => window.open(trashPageUrl(), '_blank', 'noopener') });
    } finally {
      this.restoring = false;
      if (mutated) app.invalidateFeed(boundary);
      if (app.view === 'review') this.render();
      app.renderState();
    }
    return { restoredItems: restoredItems, failedItems: failedItems };
  },
};
