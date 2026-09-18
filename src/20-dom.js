// ---------------------------------------------------------------------------
// DOM helpers and the icon set.
// photos.google.com enforces Trusted Types, so nothing here ever touches
// innerHTML / insertAdjacentHTML — every node is built with createElement(NS).
// Interface icons are original project-native paths drawn on a neutral 24px
// grid. They are not imported from the host page or an external icon library.
// ---------------------------------------------------------------------------

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { append(el, c); continue; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };

const SVGNS = 'http://www.w3.org/2000/svg';

// path data, drawn as strokes on a 24x24 grid
const ICONS = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M4.5 12.5l5 5 10-11'],
  trash: ['M4 7h16', 'M9.5 7V4.8c0-.5.4-.8.9-.8h3.2c.5 0 .9.3.9.8V7', 'M6.5 7l.9 12.3c0 .9.8 1.7 1.7 1.7h5.8c.9 0 1.7-.8 1.7-1.7L17.5 7', 'M10.2 11v6', 'M13.8 11v6'],
  undo: ['M4.5 9.5h9.8a4.8 4.8 0 010 9.6H8', 'M8.4 5.3L4.2 9.5l4.2 4.2'],
  redo: ['M19.5 9.5H9.7a4.8 4.8 0 000 9.6H16', 'M15.6 5.3l4.2 4.2-4.2 4.2'],
  openNew: ['M14 4h6v6', 'M20 4l-8.5 8.5', 'M18.5 14.5V19a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 19V7A1.5 1.5 0 015 5.5h4.5'],
  chevL: ['M14.5 5.5L8 12l6.5 6.5'],
  chevR: ['M9.5 5.5L16 12l-6.5 6.5'],
  grid: ['M4.2 4.2h6v6h-6z', 'M13.8 4.2h6v6h-6z', 'M4.2 13.8h6v6h-6z', 'M13.8 13.8h6v6h-6z'],
  tune: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 4.5v5', 'M7 14.5v5'],
  help: ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M9.6 9.4a2.5 2.5 0 014.9.6c0 1.7-2.5 2-2.5 3.9', 'M12 17.2v.02'],
  play: ['M8.5 5.6l10 6.4-10 6.4z'],
  pause: ['M9.7 5.2v13.6', 'M14.3 5.2v13.6'],
  star: ['M12 3.8l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 10l5.9-.8z'],
  archive: ['M3.5 6.5h17v3h-17z', 'M5 9.5v9a1.5 1.5 0 001.5 1.5h11a1.5 1.5 0 001.5-1.5v-9', 'M10 13.5h4'],
  movie: ['M3.5 6.5h17v11a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z', 'M3.5 6.5L6 3.5', 'M9 6.5l2.5-3', 'M14 6.5l2.5-3', 'M10.2 10.6l4.6 2.4-4.6 2.4z'],
  live: ['M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6z', 'M5.6 5.6a9 9 0 000 12.8', 'M18.4 5.6a9 9 0 010 12.8'],
  expand: ['M4 9.5v-5h5', 'M4.5 4.5l5.5 5.5', 'M20 14.5v5h-5', 'M19.5 19.5L14 14', 'M20 9.5v-5h-5', 'M19.5 4.5L14 10', 'M4 14.5v5h5', 'M4.5 19.5L10 14'],
  restore: ['M4.5 9.5h9.8a4.8 4.8 0 010 9.6H8', 'M8.4 5.3L4.2 9.5l4.2 4.2', 'M12 11.5v3l2 1.2'],
  warn: ['M12 4.2L21 19.5H3z', 'M12 10v4', 'M12 17v.02'],
  search: ['M10.8 4.2a6.6 6.6 0 100 13.2 6.6 6.6 0 000-13.2z', 'M15.8 15.8l4 4'],
  image: ['M3.5 5.5h17v13h-17z', 'M8.4 11a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z', 'M3.5 16l4.8-4.2 4 3.4 3.2-2.6 5 4.3'],
  stack: ['M7.5 3.5h9a2 2 0 012 2v13a2 2 0 01-2 2h-9a2 2 0 01-2-2v-13a2 2 0 012-2z', 'M20.5 7v10', 'M3.5 7v10'],
  swipe: ['M13.5 3.5h5a2 2 0 012 2v13a2 2 0 01-2 2h-5', 'M9.5 20.5h-4a2 2 0 01-2-2v-13a2 2 0 012-2h4', 'M11.5 8.5L8 12l3.5 3.5'],
  info: ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M12 11v6', 'M12 7.6v.02'],
  // scan orders: bars shrinking downwards (newest first), growing downwards
  // (oldest first), crossing paths (random)
  sortNew: ['M4 6h11', 'M4 12h8', 'M4 18h5', 'M17.5 5v14', 'M14 15.5l3.5 3.5 3.5-3.5'],
  sortOld: ['M4 6h5', 'M4 12h8', 'M4 18h11', 'M17.5 19V5', 'M14 8.5L17.5 5 21 8.5'],
  shuffle: ['M4 6.5h2.6c1.4 0 2.6.7 3.4 1.8l4 7.4c.8 1.1 2 1.8 3.4 1.8H20', 'M17.5 15l2.5 2.5-2.5 2.5', 'M20 6.5h-2.6c-1.4 0-2.6.7-3.4 1.8l-.8 1.5', 'M17.5 4L20 6.5 17.5 9', 'M4 17.5h2.6c1.4 0 2.6-.7 3.4-1.8l.8-1.5'],
  album: ['M6 4.5h12a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 18V6A1.5 1.5 0 016 4.5z', 'M8.5 4.5v15', 'M12.3 10.2l3.2 1.9-3.2 1.9z'],
  calendar: ['M4.5 6.5h15v13h-15z', 'M4.5 10.5h15', 'M8.5 4v4', 'M15.5 4v4'],
  compass: ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M15.2 8.8l-1.8 4.6-4.6 1.8 1.8-4.6z'],
};

function icon(name, size) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
  for (const d of (ICONS[name] || ICONS.image)) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

// FolioPause product mark: an offset folio sheet behind a paused review card.
// This mirrors extension/icons/icon.svg using only project-owned geometry and
// the independent Ink / Violet / Mint palette documented in BRAND.md.
function brandMark() {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'gps-mark');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const back = document.createElementNS(SVGNS, 'rect');
  back.setAttribute('x', '3.2'); back.setAttribute('y', '4.2');
  back.setAttribute('width', '13.5'); back.setAttribute('height', '17.6');
  back.setAttribute('rx', '3.2'); back.setAttribute('fill', '#58d6b2');
  back.setAttribute('transform', 'rotate(-8 9.95 13)');
  svg.appendChild(back);

  const front = document.createElementNS(SVGNS, 'rect');
  front.setAttribute('x', '5.4'); front.setAttribute('y', '2.5');
  front.setAttribute('width', '15.4'); front.setAttribute('height', '19');
  front.setAttribute('rx', '3.4'); front.setAttribute('fill', '#7667f5');
  front.setAttribute('stroke', '#172033'); front.setAttribute('stroke-width', '.8');
  svg.appendChild(front);

  for (const x of [9.6, 14.6]) {
    const pause = document.createElementNS(SVGNS, 'rect');
    pause.setAttribute('x', String(x)); pause.setAttribute('y', '8');
    pause.setAttribute('width', '2.3'); pause.setAttribute('height', '7.4');
    pause.setAttribute('rx', '1.15'); pause.setAttribute('fill', '#172033');
    svg.appendChild(pause);
  }
  return svg;
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
const fmtBytes = (b) => {
  if (!b || b < 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
};

const fmtDur = (ms) => {
  const total = Math.round((ms || 0) / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// The API gives a UTC timestamp plus the capture-time UTC offset, so shifting by
// the offset and formatting in UTC reproduces the local wall clock of the photo.
const fmtDate = (it, withTime) => {
  if (typeof it.ts !== 'number') return '';
  const d = new Date(it.ts + (it.tz || 0));
  const opts = { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' };
  if (withTime) { opts.weekday = 'short'; opts.hour = '2-digit'; opts.minute = '2-digit'; }
  try { return d.toLocaleString(LANGUAGE_LOCALES[LANG] || LANG, opts); }
  catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
};

const fmtNum = (n) => { try { return n.toLocaleString(LANGUAGE_LOCALES[LANG] || LANG); } catch (e) { return String(n); } };
