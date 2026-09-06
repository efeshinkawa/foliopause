// ---------------------------------------------------------------------------
// The swipe view: a two-card stack over a black stage, drag + keyboard input,
// and the decision/undo history.
//
// Nothing here talks to the network. Swiping left only records "marked"; the
// actual trash call happens later, from the review screen, once the user
// confirms. That is what makes undo trivial and safe.
// ---------------------------------------------------------------------------

const HISTORY_MAX = 500;
// How far a pointer may wander and still count as a press rather than a drag.
// A mouse click drifts a pixel or two; a touch commonly drifts fifteen.
const TAP_SLOP = 24;
const history = [];                 // swipe decisions + confirmed trash batches
const session = { kept: 0, marked: 0, deleted: 0 };

const swipe = {
  root: null, stage: null, glowL: null, glowR: null,
  top: null,                        // { item, el }
  back: null,
  inFlight: null,                   // decision being durably committed
  busy: false,
  lastFlyAt: 0,
  resizeBound: false,

  build() {
    this.glowL = h('div', { class: 'gps-glow l' });
    this.glowR = h('div', { class: 'gps-glow r' });
    this.stage = h('div', { class: 'gps-stage' }, this.glowL, this.glowR);
    this.stage.addEventListener('dblclick', (e) => {
      if (this.top && this.top.el.contains(e.target) && performance.now() - this.lastFlyAt > 600) this.act('open');
    });

    const act = (cls, ico, label, key, fn, small) => h('button', {
      class: 'gps-act' + (small ? ' sm ' : ' ') + cls, 'data-act': cls, onclick: fn,
      onmousedown: (e) => e.preventDefault(),
      title: label + (key ? ' (' + key + ')' : ''), 'aria-label': label,
    }, h('span', { class: 'c' }, icon(ico)), h('span', { text: label }), key ? h('span', { class: 'gps-key', text: key }) : null);

    const reviewAct = act('review', 'grid', t('reviewBtn'), 'R', () => this.act('review'), true);
    this.reviewActionBadge = h('span', { class: 'gps-act-badge', text: '0', hidden: true });
    reviewAct.querySelector('.c').appendChild(this.reviewActionBadge);
    this.actions = h('div', { class: 'gps-actions' },
      act('undo', 'undo', t('undo'), 'Z', () => this.act('undo'), true),
      act('del', 'trash', t('del'), '←', () => this.act('mark')),
      reviewAct,
      act('keep', 'check', t('keep'), '→', () => this.act('keep')),
      act('open', 'openNew', t('open'), '␣', () => this.act('open'), true),
    );

    this.root = h('div', { class: 'gps-view' }, this.stage, this.actions);
    if (!this.resizeBound) {
      this.resizeBound = true;
      window.addEventListener('resize', () => this.resize());
    }
    return this.root;
  },

  liveItems() {
    const out = [];
    if (this.inFlight) out.push(this.inFlight);
    if (this.top) out.push(this.top.item);
    if (this.back) out.push(this.back.item);
    return out;
  },

  // ---- card geometry ----
  // The card takes the photo's own aspect ratio (like the Photos lightbox)
  // rather than letterboxing inside a fixed frame. The card underneath is
  // fitted inside the top card's box so it can never peek out at the sides.
  box() {
    const cs = getComputedStyle(this.stage);
    const padTop = parseFloat(cs.paddingTop) || 0;   // the app bar floats over the stage
    const pad = 28;
    return {
      w: Math.max(120, this.stage.clientWidth - pad * 2),
      h: Math.max(120, this.stage.clientHeight - padTop - pad * 2),
    };
  },
  fitIn(item, box) {
    const ar = item.w && item.h ? item.w / item.h : 4 / 3;
    let w = box.w, hgt = box.w / ar;
    if (hgt > box.h) { hgt = box.h; w = box.h * ar; }
    return { w: Math.round(w), h: Math.round(hgt) };
  },
  fit(item, isBack) {
    const box = this.box();
    if (!isBack) return this.fitIn(item, box);
    const front = this.top ? this.fitIn(this.top.item, box) : box;
    return this.fitIn(item, { w: front.w, h: front.h });
  },
  resize() {
    for (const c of [this.top, this.back]) {
      if (!c) continue;
      const f = this.fit(c.item, c === this.back);
      c.el.style.width = f.w + 'px';
      c.el.style.height = f.h + 'px';
    }
  },

  makeCard(item, isBack) {
    const f = this.fit(item, isBack);
    const card = h('div', { class: 'gps-card' + (isBack ? '' : ' enter'), style: { width: f.w + 'px', height: f.h + 'px' } });
    card._item = item;
    if (isBack) { card.style.transform = 'scale(.94) translateY(10px)'; card.style.opacity = '.45'; card.style.pointerEvents = 'none'; }

    const ph = h('div', { class: 'ph' });
    card.appendChild(ph);
    const img = h('img', { alt: '', draggable: 'false', decoding: 'async' });
    img.addEventListener('load', () => ph.remove(), { once: true });
    img.addEventListener('error', () => { ph.remove(); }, { once: true });
    img.src = imgUrl(item, 1600);
    card.appendChild(img);

    const chips = h('div', { class: 'gps-chips' });
    if (item.isVideo) chips.appendChild(h('span', { class: 'gps-chip vid' }, icon('movie'), fmtDur(item.duration)));
    if (item.isLive) chips.appendChild(h('span', { class: 'gps-chip' }, icon('live'), t('live')));
    if (item.isFavorite) chips.appendChild(h('span', { class: 'gps-chip' }, icon('star'), t('fav')));
    if (item.archived) chips.appendChild(h('span', { class: 'gps-chip' }, icon('archive'), t('archived')));
    card.appendChild(chips);

    if (item.isVideo) {
      // Rendered as a single still frame a video is indistinguishable from a
      // photo, so it gets a play control of its own instead of relying on the
      // V shortcut nobody discovers.
      card.appendChild(h('button', {
        class: 'gps-play', 'data-act': 'play',
        title: t('playVideo') + ' (V)', 'aria-label': t('playVideo'),
        onclick: () => this.requestVideo(),
        onmousedown: (e) => e.preventDefault(),
      }, icon('play')));
      // Fetching the first frame can take a few seconds. Without a marker of
      // its own the card sits on a frozen still with the play control already
      // hidden, which reads as a dead press.
      card.appendChild(h('div', { class: 'gps-vload', role: 'status', 'aria-label': t('videoLoading') },
        h('div', { class: 'gps-spin' })));
    }

    card.appendChild(h('div', { class: 'gps-stamp del' }, icon('trash'), t('stampDel')));
    card.appendChild(h('div', { class: 'gps-stamp keep' }, icon('check'), t('stampKeep')));
    card.appendChild(this.metaBlock(item));

    if (!isBack) this.attachDrag(card);
    return card;
  },

  metaBlock(item) {
    const info = feed.info[item.mediaKey] || {};
    const bits = [];
    if (item.w && item.h) bits.push(item.w + ' × ' + item.h);
    if (info.size) bits.push(fmtBytes(info.size));
    if (info.fileName) bits.push(info.fileName);
    if (item.place) bits.push(item.place);
    const d2 = h('div', { class: 'd2' });
    bits.forEach((b, i) => { if (i) d2.appendChild(h('i', { text: '·' })); d2.appendChild(h('span', { text: b })); });
    return h('div', { class: 'meta' }, h('div', { class: 'd1', text: fmtDate(item, true) }), d2);
  },

  refreshMeta() {
    for (const c of [this.top, this.back]) {
      if (!c) continue;
      const old = c.el.querySelector('.meta');
      if (old) c.el.replaceChild(this.metaBlock(c.item), old);
    }
  },

  preload() {
    for (let i = 0; i < 3; i++) {
      const it = feed.peek(i);
      if (it) { const im = new Image(); im.decoding = 'async'; im.src = imgUrl(it, 1600); }
    }
  },

  // Invariant: feed.queue only holds items that are not in a card yet.
  render() {
    if (!this.root) return;
    if (!this.top) {
      const it = feed.take();
      if (it) { this.top = { item: it, el: this.makeCard(it, false) }; this.stage.appendChild(this.top.el); }
    }
    if (this.top && !this.back) {
      const it = feed.take();
      if (it) { this.back = { item: it, el: this.makeCard(it, true) }; this.stage.insertBefore(this.back.el, this.top.el); }
    }
    this.preload();
    syncCursor();
    app.renderState();
  },

  // ---- decisions ---------------------------------------------------------
  act(kind) {
    if (this.busy || review.deleting || review.restoring || app.dialogOpen()) return;
    if (kind === 'undo') { this.undo(); return; }
    if (kind === 'review') { app.showReview(); return; }
    if (!this.top) return;
    const item = this.top.item;
    if (kind === 'open') { window.open(photoPageUrl(item), '_blank', 'noopener'); return; }
    if (kind === 'video') { this.toggleVideo(); return; }
    if (kind === 'mark' || kind === 'keep') this.fly(kind === 'mark' ? -1 : 1);
  },

  async fly(dir, dy) {
    const cur = this.top;
    if (!cur || this.busy) return;
    this.busy = true;
    this.inFlight = cur.item;
    app.renderState();
    this.lastFlyAt = performance.now();
    const el = cur.el, item = cur.item;
    this.top = null;
    if (el._cancelDrag) el._cancelDrag();
    stopVideoIn(el);
    el.classList.add('fly');
    const dist = this.stage.clientWidth * 0.9 + 420;
    el.style.transform = 'translate(' + dir * dist + 'px,' + (dy || 0) + 'px) rotate(' + dir * 22 + 'deg)';
    el.style.opacity = '0';
    const stamp = el.querySelector(dir < 0 ? '.gps-stamp.del' : '.gps-stamp.keep');
    if (stamp) stamp.style.opacity = '1';
    setTimeout(() => el.remove(), 420);
    this.setGlow(0);

    if (this.back) {                       // promote the back card
      const b = this.back;
      this.back = null;
      b.el.style.transform = '';
      b.el.style.opacity = '';
      b.el.style.pointerEvents = '';
      this.attachDrag(b.el);
      this.top = b;
      const f = this.fit(b.item, false);   // it may grow now that it is in front
      b.el.style.width = f.w + 'px';
      b.el.style.height = f.h + 'px';
    }
    this.render();
    let committed = false;
    try {
      if (dir < 0) await this.decideMark(item); else await this.decideKeep(item);
      committed = true;
    } catch (e) {
      console.error('[gpSwipe] could not persist swipe decision', e);
      this.showOnTop(item);
      app.snack(t('localSaveFailed'), { kind: 'err', ms: 7000 });
    } finally {
      this.inFlight = null;
      this.busy = false;
      syncCursor();
      app.renderState();
    }
    if (committed) app.afterDecision();
  },

  async decideKeep(item) {
    const counterBefore = state.sinceReview;
    await store.setDisposition(item, 'keep');
    state.stats.kept++; session.kept++;
    state.sinceReview++;
    this.push({ item: item, action: 'keep', counterBefore: counterBefore });
    persist();
  },
  async decideMark(item) {
    const counterBefore = state.sinceReview;
    const info = feed.info[item.mediaKey];
    if (info) {                       // carry name/size along: the review screen may run in a later session
      if (info.size != null) item.size = info.size;
      if (info.fileName) item.fileName = info.fileName;
    }
    item.reviewSelected = true;
    await store.setDisposition(item, 'mark');
    session.marked++;
    state.sinceReview++;
    this.push({ item: item, action: 'mark', counterBefore: counterBefore });
    persist();
  },
  push(entry) {
    history.push(entry);
    if (history.length > HISTORY_MAX) history.shift();
  },

  async undo() {
    const entry = history[history.length - 1];
    if (!entry) return;
    if (entry.action === 'trash') {
      history.pop();
      this.undoTrash(entry, true);
      return;
    }
    const item = entry.item;
    this.busy = true;
    app.renderState();
    try {
      await store.clearDisposition(item.mediaKey);
      history.pop();
      if (entry.action === 'keep') {
        state.stats.kept = Math.max(0, state.stats.kept - 1);
        session.kept = Math.max(0, session.kept - 1);
      } else {
        session.marked = Math.max(0, session.marked - 1);
      }
      state.sinceReview = typeof entry.counterBefore === 'number'
        ? entry.counterBefore
        : Math.max(0, state.sinceReview - 1);
      persist();
      this.showOnTop(item);
      app.snack(t('undone'));
    } catch (e) {
      console.error('[gpSwipe] could not persist undo', e);
      app.snack(t('localSaveFailed'), { kind: 'err', ms: 7000 });
      return;
    } finally {
      this.busy = false;
      app.renderState();
    }
    app.afterDecision(true);
  },

  async undoTrash(entry, alreadyRemoved) {
    if (!entry || !entry.items || !entry.items.length || this.busy || review.deleting || review.restoring) return;
    if (!alreadyRemoved) {
      const idx = history.lastIndexOf(entry);
      if (idx === -1) return; // the snackbar was clicked after another undo path already restored it
      history.splice(idx, 1);
    }
    this.busy = true;
    app.renderState();
    try {
      const result = await review.restore(entry.items);
      if (result && result.failedItems && result.failedItems.length) {
        this.push({ action: 'trash', items: result.failedItems });
      }
    } finally {
      this.busy = false;
      app.renderState();
    }
  },

  dropHistory(keys) {
    const gone = keys instanceof Set ? keys : new Set(keys || []);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].item && gone.has(history[i].item.mediaKey)) history.splice(i, 1);
    }
  },

  // put an item back on top of the stack (undo)
  showOnTop(item) {
    feed.drop(item.mediaKey);
    feed.seen.add(item.mediaKey);
    if (this.back) { feed.putBack(this.back.item); this.back.el.remove(); this.back = null; }
    if (this.top) { feed.putBack(this.top.item); this.top.el.remove(); this.top = null; }
    const el = this.makeCard(item, false);
    this.top = { item: item, el: el };
    this.stage.appendChild(el);
    this.render();
  },

  clearCards() {
    if (this.top) { if (this.top.el._cancelDrag) this.top.el._cancelDrag(); this.top.el.remove(); this.top = null; }
    if (this.back) { this.back.el.remove(); this.back = null; }
    this.stage.querySelectorAll('.gps-card').forEach((c) => c.remove());
  },

  // ---- video -------------------------------------------------------------
  // A press can arrive as the button's own click (keyboard, assistive tech) or
  // as a tap resolved by the drag handler below, so the guard keeps it a single
  // toggle.
  lastVideoToggle: 0,
  requestVideo() {
    const now = performance.now();
    if (now - this.lastVideoToggle < 260) return;
    this.lastVideoToggle = now;
    this.act('video');
  },

  toggleVideo() {
    const cur = this.top;
    if (!cur || !cur.item.isVideo) return;
    // A second press while a source is still being resolved is a cancel; the
    // card must never be a place the user cannot get out of.
    if (cur.el.classList.contains('loading')) { this.stopVideo(cur.el); return; }
    const existing = cur.el.querySelector('video');
    if (existing) {
      if (existing.paused) existing.play().catch(() => {});
      else existing.pause();
      return;
    }
    this.mountVideo(cur.el, cur.item);
  },

  mountVideo(card, item) {
    return playVideoIn(card, item, card.querySelector('.gps-chips'), (state) => {
      card.classList.toggle('loading', state === 'loading');
      card.classList.toggle('playing', state === 'loading' || state === 'playing');
      if (state !== 'failed') return;
      this.stopVideo(card);
      app.snack(t('videoFail'), { kind: 'err', ms: 5000 });
    });
  },

  stopVideo(card) {
    if (!card) return;
    stopVideoIn(card);
    card.classList.remove('playing', 'loading');
  },

  stopVideos() {
    if (!this.stage) return;
    this.stage.querySelectorAll('.gps-card').forEach((c) => this.stopVideo(c));
  },

  // ---- drag --------------------------------------------------------------
  setGlow(dx) {
    const k = Math.min(1, Math.abs(dx) / 160);
    this.glowL.style.opacity = dx < 0 ? String(k) : '0';
    this.glowR.style.opacity = dx > 0 ? String(k) : '0';
  },

  attachDrag(card) {
    if (card._dragBound) return;
    card._dragBound = true;
    let drag = null;
    const stampDel = card.querySelector('.gps-stamp.del');
    const stampKeep = card.querySelector('.gps-stamp.keep');
    const stamps = (dx) => {
      const k = Math.min(1, Math.abs(dx) / 120);
      stampDel.style.opacity = dx < 0 ? String(k) : '0';
      stampKeep.style.opacity = dx > 0 ? String(k) : '0';
      this.setGlow(dx);
    };
    const reset = () => { card.style.transform = ''; stamps(0); };

    card._cancelDrag = () => {
      if (!drag) return;
      try { card.releasePointerCapture(drag.id); } catch (e) {}
      drag = null;
      card.classList.remove('grab');
      stamps(0);
    };

    card.addEventListener('pointerdown', (e) => {
      if (drag || e.button !== 0 || this.busy || app.dialogOpen()) return;
      if (!this.top || this.top.el !== card) return;
      if (e.target.tagName === 'VIDEO') return;
      const now = performance.now();
      const onPlay = !!(e.target instanceof Element && e.target.closest('.gps-play'));
      drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, id: e.pointerId, t: now, onPlay: onPlay, samples: [{ x: e.clientX, t: now }] };
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
      card.classList.add('grab');
    });

    card.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!this.top || this.top.el !== card) { card._cancelDrag(); reset(); return; }
      drag.dx = e.clientX - drag.x;
      drag.dy = e.clientY - drag.y;
      const now = performance.now();
      drag.samples.push({ x: e.clientX, t: now });
      while (drag.samples.length > 2 && now - drag.samples[0].t > 120) drag.samples.shift();
      card.style.transform = 'translate(' + drag.dx + 'px,' + drag.dy + 'px) rotate(' + (drag.dx / 22) + 'deg)';
      stamps(drag.dx);
      if (this.back) {                    // the card underneath rises as you commit
        const k = Math.min(1, Math.abs(drag.dx) / 200);
        this.back.el.style.transform = 'scale(' + (0.94 + 0.06 * k) + ') translateY(' + (10 - 10 * k) + 'px)';
        this.back.el.style.opacity = String(0.45 + 0.55 * k);
      }
    });

    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      card.classList.remove('grab');
      if (this.back) { this.back.el.style.transform = 'scale(.94) translateY(10px)'; this.back.el.style.opacity = '.45'; }
      // the stack may have changed mid-drag (keyboard, undo): never act on a stale card
      if (!this.top || this.top.el !== card || this.busy || app.dialogOpen()) { reset(); return; }
      if (e.type === 'pointercancel') { reset(); return; }
      const elapsed = Math.max(1, performance.now() - d.t);
      const s0 = d.samples[0], s1 = d.samples[d.samples.length - 1];
      const v = s1.t > s0.t ? (s1.x - s0.x) / (s1.t - s0.t) : 0;   // px/ms over the last ~120ms
      const th = Math.min(150, this.stage.clientWidth * 0.2);
      const fling = Math.abs(d.dx) > 48 && elapsed > 40 && Math.abs(v) > 0.85 && Math.sign(v) === Math.sign(d.dx);
      if (d.dx < -th || (fling && d.dx < 0)) this.fly(-1, d.dy);
      else if (d.dx > th || (fling && d.dx > 0)) this.fly(1, d.dy);
      else {
        reset();
        // Pointer capture on the card retargets the compatibility click away
        // from the play button, so for a pointer press this is the only trigger
        // the control has. The window has to cover ordinary press jitter — at
        // 8px a mouse that slid a few pixels, and most touches, pressed the
        // button and got nothing at all.
        if (d.onPlay && Math.abs(d.dx) < TAP_SLOP && Math.abs(d.dy) < TAP_SLOP) this.requestVideo();
      }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  },
};
