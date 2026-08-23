#!/usr/bin/env node
'use strict';

// Release gate for accidental third-party trade-dress regressions. This is not
// a legal clearance search; it verifies the concrete brand choices documented
// in BRAND.md remain true in every shipped text asset and extension icon.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.md', '.svg', '.html', '.css']);
const SCAN_ROOTS = ['src', 'extension', 'dist'];
const FORBIDDEN = [
  [/Google Sans/gi, 'Google Sans font reference'],
  [/Tinder-style/gi, 'Tinder trademark reference'],
  [/Google(?:'s)? Material/gi, 'Google Material identity claim'],
  [/Google(?:'s)? (?:brand )?colou?rs/gi, 'Google brand-colour claim'],
  [/#(?:ea4335|fbbc04|4285f4|f9ab00|e8710a|a8c7fa|c5221f)\b/gi, 'Google-associated colour'],
];

const files = [];
function walk(relative) {
  const absolute = path.join(ROOT, relative);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(child);
  }
}
for (const root of SCAN_ROOTS) walk(root);
files.push('build.js');

const failures = [];
for (const relative of files) {
  const content = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  for (const [pattern, label] of FORBIDDEN) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) failures.push(`${relative}: ${label}`);
  }
}

const svg = fs.readFileSync(path.join(ROOT, 'extension/icons/icon.svg'), 'utf8');
for (const colour of ['#172033', '#7667f5', '#58d6b2']) {
  if (!svg.toLowerCase().includes(colour)) failures.push(`extension/icons/icon.svg: missing ${colour}`);
}
if (!/FolioPause/.test(svg) || (svg.match(/<rect\b/g) || []).length !== 4) {
  failures.push('extension/icons/icon.svg: unexpected FolioPause mark geometry');
}

for (const size of [16, 32, 48, 128]) {
  const relative = `extension/icons/icon${size}.png`;
  const png = fs.readFileSync(path.join(ROOT, relative));
  const signature = png.subarray(0, 8).toString('hex');
  const width = png.length >= 24 ? png.readUInt32BE(16) : 0;
  const height = png.length >= 24 ? png.readUInt32BE(20) : 0;
  if (signature !== '89504e470d0a1a0a' || width !== size || height !== size) {
    failures.push(`${relative}: expected a ${size}x${size} PNG`);
  }
}

for (const locale of ['en', 'tr', 'it', 'es', 'de']) {
  const relative = `extension/_locales/${locale}/messages.json`;
  const messages = JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  if (messages.appName.message !== 'FolioPause') failures.push(`${relative}: appName must be FolioPause`);
  if (/Google/i.test(messages.actionTitle.message)) failures.push(`${relative}: actionTitle must lead with the independent product`);
}

for (const relative of ['README.md', 'BRAND.md', 'PRIVACY.md']) {
  const content = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  if (!/independent/i.test(content) || !/not\s+affiliated/i.test(content)) {
    failures.push(`${relative}: missing independent-project notice`);
  }
}

if (failures.length) {
  console.error('Brand audit failed:\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log(`brand audit passed (${files.length} text assets, 5 locales, 4 raster icons)`);
}
