// Compares how Noteshack lays out a Word file with how LibreOffice does: for
// each paragraph, its number (if any) and where its text starts (points from
// the page margin). "DIFF" marks a paragraph that differs by more than 6pt or
// in its number. Needs LibreOffice (soffice) and poppler (pdftotext), and the
// tests' server running: node tests/server.mjs 8123
//   node tools/docx-compare.mjs file.docx
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const file = path.resolve(process.argv[2]);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-compare-'));
fs.copyFileSync(file, out + '/d.docx');
execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, out + '/d.docx'], { stdio: 'ignore' });
execFileSync('pdftotext', ['-bbox-layout', out + '/d.pdf', out + '/d.html']);
const xml = fs.readFileSync(out + '/d.html', 'utf8');
// LibreOffice: every line (words on one height, whatever block pdftotext
// put them in), its words with x
const flat = [];
let page = 0;
for (const pg of xml.split(/<page /).slice(1)) {
  page++;
  for (const m of pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)<\/word>/g)) {
    flat.push({ x: +m[1], y: page * 10000 + Math.round(+m[2]), t: m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") });
  }
}
const byY = new Map();
for (const w of flat) {
  const key = [...byY.keys()].find((k) => Math.abs(k - w.y) <= 2) ?? w.y;
  if (!byY.has(key)) byY.set(key, []);
  byY.get(key).push(w);
}
const lo = [...byY.entries()].sort((a, b) => a[0] - b[0]).map(([, ws]) => ws.sort((a, b) => a.x - b.x));
// the page's left margin in LibreOffice: the docx's (pt)
const doc = execFileSync('unzip', ['-p', out + '/d.docx', 'word/document.xml']).toString();
const pgMar = doc.match(/<w:pgMar [^>]*w:left="(\d+)"/);
const loMargin = pgMar ? +pgMar[1] / 20 : 72;

const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
await p.addInitScript(() => { localStorage.setItem('np.welcome', 'hidden'); localStorage.setItem('np.safari-note', 'shown'); });
await p.goto('http://localhost:8123/'); await p.waitForSelector('body.ready');
await p.setInputFiles('#file-open', out + '/d.docx');
await p.waitForTimeout(2500);
const ns = await p.evaluate(() => {
  const ed = document.querySelector('#editor');
  const cs = getComputedStyle(ed);
  const left0 = ed.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
  const fmt = (n, t) => {
    const roman = (k) => { let s = ''; for (const [v, r] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (k >= v) { s += r; k -= v; } return s; };
    if (t === 'a') return String.fromCharCode(96 + n); if (t === 'A') return String.fromCharCode(64 + n);
    if (t === 'i') return roman(n); if (t === 'I') return roman(n).toUpperCase(); return String(n);
  };
  const numOf = (li) => { const ol = li.parentElement; return (+(ol.getAttribute('start') || 1)) + [...ol.children].filter((c) => c.tagName === 'LI').indexOf(li); };
  const label = (li) => {
    const ol = li.parentElement;
    if (ol.tagName === 'UL') return '•';
    const t = ol.getAttribute('type') || '1';
    const v = fmt(numOf(li), t);
    if (ol.classList.contains('np-rp')) return v + ')';
    if (ol.classList.contains('np-pp')) return '(' + v + ')';
    if (ol.classList.contains('np-plain')) return v;
    if (ol.classList.contains('np-outline') || ol.classList.contains('np-outline-bare')) {
      const parts = []; for (let e = li; e && e !== ed; e = e.parentElement.closest('li')) { if (!e.closest('#editor')) break; parts.unshift(numOf(e)); }
      return parts.join('.') + (ol.classList.contains('np-outline') ? '.' : '');
    }
    return v + '.';
  };
  const out = [];
  for (const el of ed.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre')) {
    if (el.closest('td,th')) continue;
    // its own first text (not a nested list's)
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('ol,ul,p,h1,h2,h3,h4,h5,h6,blockquote,pre,li') === el || (n.parentElement.closest('li,p,h1,h2,h3,h4,h5,h6') === el)) && /\S/.test(n.data) ? 1 : 3 });
    const t = walk.nextNode();
    if (!t) continue;
    const i = t.data.search(/\S/);
    const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1);
    const x = r.getBoundingClientRect().left - left0;
    let text = ''; for (let n = t; n && text.length < 60; n = walk.nextNode()) text += n.data;
    out.push({ label: el.tagName === 'LI' ? label(el) : '', x: Math.round(x * 0.75 * 10) / 10, text: text.replace(/\s+/g, ' ').trim() });
  }
  return out;
});
await b.close();

// match each Noteshack paragraph to LibreOffice's line holding its first words
const norm = (s) => s.replace(/[\s ]+/g, ' ').trim();
let from = 0;
const rows = [];
let bad = 0;
for (const n of ns) {
  const words = norm(n.text).split(' ');
  // a written-out number is part of the text in both
  const key = words.slice(0, Math.min(4, words.length));
  let hit = -1, wi = -1;
  for (let li = from; li < lo.length && hit < 0; li++) {
    const ws = lo[li].map((w) => w.t);
    for (let k = 0; k + key.length <= ws.length; k++) if (key.every((w, j) => norm(ws[k + j]) === w)) { hit = li; wi = k; break; }
  }
  if (hit < 0) { rows.push(['?', n.label, '', n.x, '', n.text.slice(0, 40)]); continue; }
  from = hit + 1;
  const loLabel = wi > 0 ? lo[hit].slice(0, wi).map((w) => w.t).join(' ') : '';
  const loX = Math.round((lo[hit][wi].x - loMargin) * 10) / 10;
  const bullet = (v) => /^[•\u2022\u25cf\uf0b7\u00b7o▪◦]$/.test(v);
  const labelOk = norm(loLabel) === norm(n.label) || (bullet(n.label) && bullet(loLabel));
  const xOk = Math.abs(loX - n.x) <= 6;
  if (!labelOk || !xOk) bad++;
  rows.push([labelOk && xOk ? 'ok' : 'DIFF', n.label, loLabel, n.x, loX, n.text.slice(0, 40)]);
}
for (const r of rows) console.log(r.map((v, i) => String(v).padEnd([4, 7, 7, 7, 7, 0][i])).join(' '));
console.log('paragraphs:', rows.length, 'differ:', bad, 'unmatched:', rows.filter((r) => r[0] === '?').length);
