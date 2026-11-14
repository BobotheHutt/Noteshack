/* Noteshack — the app.
   Sections: helpers · settings · documents · editor core · toolbar state ·
   menus · popovers · dialogs · find & replace · images · tables · links ·
   files · sidebar · status · speech · views · boot */
(() => {
  'use strict';

  /* =========================================================== helpers */

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const editor = $('#editor');
  const page = $('#page');
  const workspace = $('#workspace');
  const titleInput = $('#doc-title');
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  const mod = (e) => (isMac ? e.metaKey : e.ctrlKey);
  // the app's own language (js/i18n.js)
  const _ = NpI18n.t;
  const _n = NpI18n.n;
  const LOC = NpI18n.locale;
  // the page's own menus and labels, in the app's language, before anything else draws
  NpI18n.dom(document.body);

  // Shown in Tools → About, so it is easy to tell which version is running.
  const APP_VERSION = '2026.11.14-62';

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function debounce(fn, ms) {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.cancel = () => clearTimeout(t);
    d.flush = (...a) => { clearTimeout(t); return fn(...a); };
    return d;
  }

  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 200); }, ms);
  }

  const rtf = new Intl.RelativeTimeFormat(LOC, { numeric: 'auto' });
  function ago(t) {
    const s = (t - Date.now()) / 1000;
    if (Math.abs(s) < 45) return _('just now');
    const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
    let v = s;
    for (let i = 0; i < steps.length; i++) {
      const [n, unit] = steps[i];
      if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
      v /= n;
    }
    return '';
  }
  const fmtDate = (t) => new Date(t).toLocaleString(LOC, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtNum = (n) => n.toLocaleString(LOC);

  /* =========================================================== constants */

  const FONTS = [
    { key: 'sans', label: _('Sans (default)'), css: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    { key: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
    { key: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
    { key: 'trebuchet', label: 'Trebuchet MS', css: '"Trebuchet MS", Helvetica, sans-serif' },
    { key: 'georgia', label: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
    { key: 'times', label: 'Times New Roman', css: '"Times New Roman", Times, serif' },
    { key: 'garamond', label: 'Garamond', css: 'Garamond, "Hoefler Text", "Times New Roman", serif' },
    { key: 'mono', label: 'Courier New', css: '"Courier New", Courier, monospace' }
  ];
  const fontByKey = (k) => FONTS.find((f) => f.key === k) || FONTS[0];
  // a document's margins: a Word file's own (top, right, bottom, left, in
  // inches), or the preset chosen in Page setup
  const marginCss = (s) => (Array.isArray(s.marginsIn) && s.marginsIn.length === 4 ? s.marginsIn.map((v) => v + 'in').join(' ') : MARGINS[s.margins].css);
  const firstFamily = (css) => String(css || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();

  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
  const LINE_HEIGHTS = [1, 1.15, 1.5, 2];
  const PAPER = { letter: { w: '8.5in', h: '11in', css: 'letter', label: _('Letter (8.5 × 11 in)') }, a4: { w: '210mm', h: '297mm', css: 'A4', label: _('A4 (210 × 297 mm)') } };
  const MARGINS = { narrow: { css: '0.5in', label: _('Narrow (0.5 in)') }, normal: { css: '1in', label: _('Normal (1 in)') }, wide: { css: '1.5in', label: _('Wide (1.5 in)') } };

  const DOC_DEFAULTS = { font: 'sans', size: 12, lineHeight: 1.5, paper: 'letter', margins: 'normal' };

  const PALETTE = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
    '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'
  ];

  const SYMBOLS = '© ® ™ § ¶ † ‡ • · … – — ‘ ’ “ ” « » ¿ ¡ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ π µ Ω α β γ δ θ λ σ φ ½ ⅓ ¼ ¾ ¹ ² ³ € £ ¥ ¢ ₹ ← → ↑ ↓ ↔ ⇒ ✓ ✗ ★ ☆ ♥ ♦ ♣ ♠ ☐ ☑ ☺ ✉ ☎ ✂ ✎'.split(' ');

  const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'UL', 'OL', 'TABLE', 'TR', 'HR']);
  const BLOCK_SEL = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th';
  const WORD_RE = /[\p{L}\p{N}]+(?:['’\-.][\p{L}\p{N}]+)*/gu;

  /* =========================================================== settings */

  const SETTINGS_KEY = 'np.settings';
  const settings = Object.assign({
    theme: 'system', view: 'page', zoom: 1, sidebar: true, spellcheck: true, smartMd: true, marks: false,
    voice: '', rate: 1, lastDoc: null, defaults: Object.assign({}, DOC_DEFAULTS)
  }, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } })());

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* private mode: settings last for this visit */ }
  }

  /* =========================================================== documents */

  let docs = [];           // every document record, newest first
  let current = null;      // the open document record
  let dirty = false;
  let saving = null;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('notepad-online') : null;

  function newDocRecord(html = '', title = '') {
    const now = Date.now();
    return {
      id: uid(), title, titleAuto: !title, html, text: '', words: 0,
      created: now, updated: now, lastVersion: 0, goal: 0,
      settings: Object.assign({}, DOC_DEFAULTS, settings.defaults)
    };
  }

  function docSettings() {
    return Object.assign({}, DOC_DEFAULTS, current && current.settings);
  }

  function serialize() {
    return editor.innerHTML.replace(/ data-np-t="[^"]*"| data-np-end=""/g, '');
  }

  // without the marks of a translation still being checked
  const unmarked = (html) => html.replace(/ data-np-tr="\d*"/g, '');

  function autoTitle(text) {
    const line = (text || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
    return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line;
  }

  function displayTitle(d) {
    return (d.titleAuto ? autoTitle(d.text) : d.title) || _('Untitled document');
  }

  // the document is kept in this browser as you work; saving to a file is Save
  const savedText = () => (NpStore.persistent ? _('Saved in Noteshack') : _('Not saved — temporary'));

  function setStatus(text, kind) {
    const s = $('#save-status');
    s.textContent = text;
    s.dataset.kind = kind || '';
  }

  function markDirty() {
    if (!current) return;
    dirty = true;
    setStatus(_('Saving…'), 'pending');
    scheduleSave();
  }

  const scheduleSave = debounce(() => saveNow(), 700);

  /* ----- the document's language ----- */

  // Its own language: found from the text (on this computer) until set by
  // hand. It decides spell checking, the way text runs, and how scans are read.
  const docLang = (doc) => (doc && doc.lang) || NpLang.preferred();

  function applyDocLang() {
    if (!current) return;
    const code = docLang(current);
    editor.lang = code;
    editor.dir = NpLang.isRtl(code) ? 'rtl' : 'ltr';
    $('#pdf-pages').lang = code;
    const b = $('#sb-lang');
    b.textContent = NpLang.name(code);
    b.title = current.langAuto === false ? _('Language of this document: {lang}. Click to change.', { lang: NpLang.name(code) }) : _('Language of this document: {lang} (found from its text). Click to change.', { lang: NpLang.name(code) });
    scheduleSpell();
  }

  async function detectLang(doc) {
    if (doc.langAuto === false) return;
    let code = null;
    try { code = await NpLang.detect(doc.text); } catch (e) { return; }
    if (!code || code === doc.lang || doc.langAuto === false) return;
    doc.lang = code;
    try { await NpStore.putDoc(doc); } catch (e) { /* the next save keeps it */ }
    if (doc === current) applyDocLang();
  }

  async function languageDialog() {
    if (!current) return;
    const doc = current;
    const auto = el('input', { type: 'checkbox', class: 'switch', checked: doc.langAuto !== false });
    const search = el('input', { type: 'search', class: 'input', placeholder: _('Find a language'), 'aria-label': _('Find a language') });
    let chosen = docLang(doc);
    const rows = NpLang.list.map((l) => {
      const radio = el('input', { type: 'radio', name: 'doc-lang', value: l.code, checked: l.code === chosen });
      radio.addEventListener('change', () => { chosen = l.code; auto.checked = false; });
      const nat = NpLang.native(l.code);
      const label = NpLang.name(l.code);
      // what Noteshack itself does in it (everything else is the browser's)
      const tags = [NpSpell.has(l.code.split('-')[0]) ? _('Spell check') : null, NpPdf.readsLanguage(l.code) ? _('Reads scans') : null].filter(Boolean);
      return el('label', { class: 'lang-row', 'data-find': (label + ' ' + nat + ' ' + l.code).toLowerCase() }, radio,
        el('span', { class: 'lang-name' }, label), tags.length ? el('span', { class: 'lang-tags' }, tags.join(' · ')) : null,
        nat !== label ? el('span', { class: 'lang-native', lang: l.code }, nat) : null);
    });
    const list = el('div', { class: 'lang-list', role: 'radiogroup', 'aria-label': _('Languages') }, rows);
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const r of rows) r.hidden = !!q && !r.dataset.find.includes(q);
    });
    const v = await dialog({
      title: _('Language of this document'),
      body: el('div', { class: 'stack' },
        el('p', { class: 'dlg-text' }, _('Used for spell checking, the direction the text runs, and reading scans. It is worked out from the text, on this computer, until you choose one. Noteshack checks spelling and reads scans itself in the languages marked; for the others it uses the browser\u2019s spell check, and reads scans as English.')),
        el('label', { class: 'toggle-row' }, el('span', {}, _('Work it out from the text')), auto),
        search, list),
      actions: [{ label: _('Cancel'), value: '' }, { label: _('OK'), value: 'ok', primary: true }],
      onOpen: () => { const r = list.querySelector('input:checked'); if (r) r.closest('label').scrollIntoView({ block: 'center' }); }
    });
    if (v !== 'ok') return;
    doc.langAuto = auto.checked;
    if (!auto.checked) doc.lang = chosen;
    await NpStore.putDoc(doc);
    applyDocLang();
    if (auto.checked) detectLang(doc);
  }

  /* ----- the app's own language ----- */

  // Separate from a document's language: the menus, buttons and messages.
  // Changing it reloads the app (every phrase is set as the page is built).
  async function appLanguageDialog() {
    const cur = NpI18n.setting;
    const opts = [['auto', _('Automatic: {lang}', { lang: NpLang.native(NpI18n.browserLang()) })]].concat(NpI18n.languages.map((c) => [c, NpLang.native(c)]));
    const group = el('div', { class: 'lang-list', role: 'radiogroup', 'aria-label': _('App language') }, opts.map(([c, label]) =>
      el('label', { class: 'lang-row' }, el('input', { type: 'radio', name: 'app-lang', value: c, checked: c === cur }), el('span', { class: 'lang-name', lang: c === 'auto' ? null : c }, label))));
    const v = await dialog({
      title: _('App language'),
      body: el('div', { class: 'stack' },
        el('p', { class: 'dlg-text' }, _('The language of Noteshack’s menus, buttons and messages. Each document has a language of its own, shown in the status bar.')),
        group,
        el('p', { class: 'muted' }, _('The translations were written with the help of AI and have not yet been checked by a native speaker.'))),
      actions: [{ label: _('Cancel'), value: '' }, { label: _('OK'), value: 'ok', primary: true }]
    });
    if (v !== 'ok') return;
    const pick = (group.querySelector('input:checked') || {}).value || 'auto';
    if (pick === cur) return;
    await saveNow();
    NpI18n.setLang(pick);
    location.reload();
  }

  /* ----- translation ----- */


  // A translated copy: a new document, each paragraph marked until it is
  // checked (data-np-tr="n", its original in doc.translation.originals[n]).
  // Translated on this computer, by Noteshack's engine or the browser's, or,
  // only when chosen, online (js/translate.js).
  const KEEP_WORDS = 'np.translate.keep';
  const keepWords = () => { try { return JSON.parse(localStorage.getItem(KEEP_WORDS) || '[]'); } catch (e) { return []; } };
  const mb = (n) => (n < 1e6 ? '<1' : Math.round(n / 1e6).toLocaleString(LOC)) + ' MB';
  const pct = (p) => new Intl.NumberFormat(LOC, { style: 'percent' }).format(Math.min(1, p || 0));


  async function translateDialog() {
    if (!current) return;
    if (dirty) await saveNow();
    const src = current;
    let from = docLang(src);
    let to = null;
    let want = null;
    try { want = localStorage.getItem('np.translate.to'); } catch (e) { /* none */ }
    const fromSel = el('select', { class: 'input', 'aria-label': _('Translate from') },
      NpLang.list.map((l) => el('option', { value: l.code, selected: l.code === from }, NpLang.name(l.code))));
    const search = el('input', { type: 'search', class: 'input', placeholder: _('Find a language'), 'aria-label': _('Find a language') });
    const browserCan = new Map(); // code → 'available' | 'downloadable' | null, for the current "from"
    const rows = NpLang.list.map((l) => {
      const radio = el('input', { type: 'radio', name: 'tr-to', value: l.code });
      radio.addEventListener('change', () => { want = to = l.code; paintEngines(); });
      const tags = el('span', { class: 'lang-tags' });
      const nat = NpLang.native(l.code);
      return { code: l.code, radio, tags, row: el('label', { class: 'lang-row', 'data-find': (NpLang.name(l.code) + ' ' + nat + ' ' + l.code).toLowerCase() }, radio,
        el('span', { class: 'lang-name' }, NpLang.name(l.code)), tags, nat !== NpLang.name(l.code) ? el('span', { class: 'lang-native', lang: l.code }, nat) : null) };
    });
    const list = el('div', { class: 'lang-list', role: 'radiogroup', 'aria-label': _('Translate into') }, rows.map((r) => r.row));
    const none = el('p', { class: 'dlg-text', hidden: true }, _('Noteshack translates between {languages}. This browser has no translator of its own for this language.', { languages: new Intl.ListFormat(LOC, { type: 'conjunction' }).format(NpTranslate.languages().map((c) => NpLang.name(c, true))) }));
    const ours = el('input', { type: 'radio', name: 'tr-engine', value: 'ours' });
    const theirs = el('input', { type: 'radio', name: 'tr-engine', value: 'browser' });
    const web = el('input', { type: 'radio', name: 'tr-engine', value: 'online' });
    const oursNote = el('span', { class: 'engine-note' });
    const engines = el('div', { class: 'engines', role: 'radiogroup', 'aria-label': _('Translator') },
      el('label', { class: 'engine' }, ours, el('span', {}, el('strong', {}, _('Noteshack’s translator')), el('span', { class: 'engine-note' }, _('Firefox’s translation engine. Keeps bold, links and other formatting.')), oursNote)),
      el('label', { class: 'engine' }, theirs, el('span', {}, el('strong', {}, _('This browser’s translator')), el('span', { class: 'engine-note' }, _('Formatting inside a paragraph (bold, links) is not kept.')))),
      el('label', { class: 'engine' }, web, el('span', {}, el('strong', {}, _('Online')), el('span', { class: 'engine-note' }, _('More languages. The text is sent to Noteshack’s translation service on Cloudflare (Workers AI), translated there and sent back; it is not kept. Not for anything confidential. Formatting inside a paragraph is not kept.')))));
    // a PDF: translated where its text stands, or its words as a document
    const isPdf = src.type === 'pdf';
    const asLayout = el('input', { type: 'radio', name: 'tr-kind', value: 'layout', checked: true });
    const asDoc = el('input', { type: 'radio', name: 'tr-kind', value: 'doc' });
    const kinds = isPdf ? el('div', { class: 'engines', role: 'radiogroup', 'aria-label': _('Make') },
      el('label', { class: 'engine' }, asLayout, el('span', {}, el('strong', {}, _('The same layout')), el('span', { class: 'engine-note' }, _('A translated copy of the PDF: each paragraph in its place, in its font, a little smaller where the translation runs longer.')))),
      el('label', { class: 'engine' }, asDoc, el('span', {}, el('strong', {}, _('A document')), el('span', { class: 'engine-note' }, _('The words as paragraphs and headings, to check one by one against the original and save as Word or text.'))))) : null;
    const keep = el('textarea', { class: 'input', rows: 3, placeholder: _('Names, brands, terms…'), 'aria-label': _('Leave these as they are') });
    keep.value = keepWords().join('\n');

    // the language last translated into stays chosen, once it turns out possible
    const can = (code) => code !== from && (NpTranslate.ours(from, code) || !!browserCan.get(code) || NpTranslate.online(from, code));
    function paintList() {
      const q = search.value.trim().toLowerCase();
      let any = false;
      for (const r of rows) {
        const o = NpTranslate.ours(from, r.code), b = browserCan.get(r.code), w = NpTranslate.online(from, r.code);
        r.row.hidden = !can(r.code) || (!!q && !r.row.dataset.find.includes(q));
        r.tags.textContent = [o ? 'Noteshack' : null, b ? _('Browser') : null, w ? _('Online') : null].filter(Boolean).join(' · ');
        if (can(r.code)) any = true;
      }
      to = want && can(want) ? want : null;
      for (const r of rows) r.radio.checked = r.code === to;
      none.hidden = any;
      list.hidden = !any;
      paintEngines();
    }
    async function paintEngines() {
      const o = !!to && NpTranslate.ours(from, to), b = !!to && !!browserCan.get(to), w = !!to && NpTranslate.online(from, to);
      ours.disabled = !o;
      theirs.disabled = !b;
      web.disabled = !w;
      ours.closest('.engine').hidden = !o && (b || w);
      theirs.closest('.engine').hidden = !b;
      web.closest('.engine').hidden = !w;
      // online only when picked: never chosen for you
      if (web.checked && !w) web.checked = false;
      if (!web.checked && (!ours.checked && !theirs.checked || ours.checked && !o || theirs.checked && !b)) { ours.checked = o; theirs.checked = !o && b; }
      engines.hidden = !to;
      oursNote.textContent = '';
      if (o) {
        const n = await NpTranslate.toDownload(from, to);
        if (n) oursNote.textContent = _('Downloads {size} the first time, kept for next time.', { size: mb(n) });
      }
    }
    async function checkBrowser() {
      browserCan.clear();
      const f = from;
      if ('Translator' in window) {
        await Promise.all(NpLang.list.map(async (l) => { const a = await NpTranslate.browser(f, l.code); if (f === from) browserCan.set(l.code, a); }));
      }
      if (f === from) paintList();
    }
    fromSel.addEventListener('change', () => { from = fromSel.value; checkBrowser(); paintList(); });
    search.addEventListener('input', paintList);
    paintList();
    checkBrowser();

    const v = await dialog({
      title: _('Translate'),
      wide: true,
      body: el('div', { class: 'stack' },
        el('p', { class: 'dlg-text' }, _('Makes a translated copy. With a translator on this computer, the text is not sent anywhere. You can then check it paragraph by paragraph against the original.')),
        el('label', { class: 'field' }, el('span', {}, _('From')), fromSel),
        el('div', { class: 'field' }, el('span', {}, _('Into')), search, list, none),
        engines,
        isPdf ? el('div', { class: 'field' }, el('span', {}, _('Make')), kinds) : null,
        isPdf ? el('p', { class: 'dlg-text' }, _('Scanned pages are read first, in the language translated from.')) : null,
        el('label', { class: 'field' }, el('span', {}, _('Leave these as they are, one per line')), keep)),
      actions: [{ label: _('Cancel'), value: '' }, { label: _('Translate'), value: 'go', primary: true }],
      onOpen: () => { const r = list.querySelector('input:checked'); if (r) r.closest('label').scrollIntoView({ block: 'center' }); }
    });
    if (v !== 'go') return;
    if (!to) { toast(_('Choose a language to translate into.')); return; }
    if (!ours.checked && !theirs.checked && !web.checked) { toast(_('Choose a translator.')); return; }
    const words = keep.value.split('\n').map((s) => s.trim()).filter(Boolean);
    try { localStorage.setItem(KEEP_WORDS, JSON.stringify(words)); localStorage.setItem('np.translate.to', to); } catch (e) { /* this time only */ }
    if (isPdf && current === src) {
      // scans are read in the language translated from
      if (src.lang !== from) { src.lang = from; src.langAuto = false; await NpStore.putDoc(src); applyDocLang(); }
    }
    await translateDoc(src, from, to, web.checked ? 'online' : theirs.checked ? 'browser' : 'ours', words, isPdf && asLayout.checked ? 'layout' : 'doc');
  }

  // A dialog showing how far a long job has got, with Cancel.
  function progressDialog(title) {
    const status = el('p', { class: 'dlg-text', role: 'status' }, _('Starting…'));
    const bar = el('progress', { class: 'progress', max: 1, value: 0 });
    let box = null;
    const p = { cancelled: false };
    const closed = dialog({
      title,
      body: el('div', { class: 'stack' }, status, bar),
      actions: [{ label: _('Cancel'), value: 'cancel' }],
      onOpen: (d) => { box = d; }
    }).then((v) => { if (v !== 'done') p.cancelled = true; });
    p.set = (text, frac) => {
      if (p.cancelled) throw new Error('cancelled');
      status.textContent = text;
      if (frac != null) bar.value = frac; else bar.removeAttribute('value');
    };
    p.close = async () => { if (box && box.open) box.close('done'); await closed; };
    return p;
  }

  // The words of a PDF (edits, and what was read from scans, included) as a
  // document's HTML: paragraphs and headings, a page break between pages.
  async function pdfAsHtml(doc) {
    const pages = await pdfParagraphs(await NpPdf.export(doc));
    return pages.map((pg) => pg.map((q) => '<' + q.tag + '>' + q.runs.map((r) => (r.bold ? '<b>' + escapeHtml(r.text) + '</b>' : escapeHtml(r.text))).join('') + '</' + q.tag + '>').join('')).join('<hr class="page-break">');
  }

  // kind: 'doc' (a document, or a PDF's words as one) or 'layout' (a PDF
  // copy, translated where its text stands)
  async function translateDoc(src, from, to, engine, keep, kind) {
    const pr = progressDialog(_('Translating into {lang}', { lang: NpLang.name(to, true) }));
    const title = displayTitle(src) + ' (' + NpLang.name(to) + ')';
    let t = null;
    let copy = null;
    try {
      t = await NpTranslate.open(from, to, engine, (p) => (engine === 'online' ? null : pr.set(engine === 'browser' ? _('Getting the browser’s translator ready… {percent}', { percent: pct(p) }) : _('Downloading the translation model… {percent}', { percent: pct(p) }), p)));
      pr.set(_('Translating…'), 0);
      const readNote = (d, n) => pr.set(_('Reading the scanned pages first… {done} of {total}', { done: d, total: n }), n ? d / n : 0);
      if (kind === 'layout') {
        // a copy of the PDF, its text replaced paragraph by paragraph
        const now = Date.now();
        copy = Object.assign(JSON.parse(JSON.stringify(Object.assign({}, src, { sources: null }))), {
          id: uid(), title, titleAuto: false, created: now, updated: now, sources: src.sources.map((b) => b.slice(0)),
          scanFonts: src.scanFonts ? Object.fromEntries(Object.entries(src.scanFonts).map(([k, b]) => [k, b instanceof ArrayBuffer ? b.slice(0) : b])) : undefined,
          lang: from, langAuto: false
        });
        if (!(await addRecord(copy))) return;
        // a piece of a page's text → the same, translated (it is plain text)
        const box = document.createElement('div');
        const tr = async (text) => {
          if (pr.cancelled) throw new Error('cancelled');
          box.textContent = text;
          const h = await NpTranslate.unit(box.innerHTML, t, keep);
          box.innerHTML = NpSanitize.html(h);
          return box.textContent;
        };
        const n = await NpPdf.translate(tr, (what, d, total) => (what === 'read' ? readNote(d, total) : pr.set(_('Translating… page {page} of {total}', { page: Math.min(d + 1, total), total }), total ? d / total : 1)));
        copy.lang = to;
        await NpStore.putDoc(copy);
        if (current === copy) applyDocLang();
        await pr.close();
        toast(n ? _('Translated, keeping the layout. The original PDF is unchanged, in your documents.') : _('No text was found to translate.'), 6000);
        return;
      }
      let html = src.html;
      if (src.type === 'pdf') {
        await NpPdf.readEverything(readNote);
        await saveNow('Read before translating');
        pr.set(_('Translating…'), 0);
        html = await pdfAsHtml(src);
      }
      const out = await NpTranslate.document(html, t, {
        keep,
        onUnit: (done, total) => pr.set(_n(total, 'Translating… {done} of {n} paragraph', 'Translating… {done} of {n} paragraphs', { done }), total ? done / total : 1)
      });
      await pr.close();
      const s = src.type === 'pdf' ? undefined : src.settings;
      const doc = await createDoc(out.html, title, { settings: s, keepFocus: true });
      if (!doc) return;
      Object.assign(doc, { lang: to, langAuto: false, translation: { from, to, of: src.id, engine, keep, originals: out.originals } });
      await NpStore.putDoc(doc);
      applyDocLang();
      reviewHandle = { key: from + to + engine, t };
      t = null;
      showReview();
      toast(out.originals.length ? _('Translated. Check each paragraph against its original, or choose Done.') : _('Translated.'), 5000);
    } catch (e) {
      const stopped = pr.cancelled;
      await pr.close();
      if (copy && current === copy) await saveNow();
      if (stopped) { if (copy) toast(_('Stopped. The copy is translated as far as it got.'), 6000); return; }
      toast(_('Could not translate: {reason}', { reason: (e && e.message) || e }), 6000);
    } finally {
      if (t) t.close();
    }
  }

  /* ----- checking a translation ----- */

  let reviewHandle = null; // { key, t }: the translator, kept open for "Translate again"
  const reviewBox = $('#review');
  const reviewOrig = $('#review-orig');
  const reviewing = () => !!(current && current.type !== 'pdf' && current.translation && editor.querySelector('[data-np-tr]'));
  let reviewNode = null;

  function showReview() {
    const on = reviewing();
    reviewBox.hidden = !on;
    editor.classList.toggle('reviewing', on);
    if (!on) { reviewNode = null; return; }
    const tr = current.translation;
    reviewOrig.lang = tr.from;
    reviewOrig.dir = NpLang.isRtl(tr.from) ? 'rtl' : 'ltr';
    updateReview();
  }

  function updateReview() {
    if (reviewBox.hidden || !current || !current.translation) return;
    const left = editor.querySelectorAll('[data-np-tr]').length;
    $('#review-count').textContent = _n(left, '{n} paragraph to check', '{n} paragraphs to check');
    const node = closestInEditor('[data-np-tr]');
    if (node === reviewNode && node) return;
    reviewNode = node;
    const has = !!node;
    reviewBox.classList.toggle('empty', !has);
    for (const b of reviewBox.querySelectorAll('[data-needs-node]')) b.disabled = !has;
    if (!has) { reviewOrig.contentEditable = 'false'; reviewOrig.textContent = _('Click a highlighted paragraph to see its original.'); return; }
    reviewOrig.contentEditable = 'true';
    reviewOrig.innerHTML = NpSanitize.html(current.translation.originals[+node.getAttribute('data-np-tr')] || '');
  }

  function reviewStep(dir) {
    const all = [...editor.querySelectorAll('[data-np-tr]')];
    if (!all.length) return;
    const cur = closestInEditor('[data-np-tr]');
    let i = cur ? all.indexOf(cur) + dir : (dir > 0 ? 0 : all.length - 1);
    i = (i + all.length) % all.length;
    caretTo(all[i], false);
    all[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
    editor.focus({ preventScroll: true });
    updateReview();
  }

  function reviewOk() {
    const node = reviewNode && editor.contains(reviewNode) ? reviewNode : closestInEditor('[data-np-tr]');
    if (!node) return;
    const n = node.getAttribute('data-np-tr');
    // a paragraph split in two with Enter: both halves were checked together
    for (const m of editor.querySelectorAll('[data-np-tr="' + n + '"]')) m.removeAttribute('data-np-tr');
    reviewNode = null;
    markDirty();
    if (editor.querySelector('[data-np-tr]')) reviewStep(1); else finishReview(true);
  }

  async function reviewRedo() {
    const node = reviewNode && editor.contains(reviewNode) ? reviewNode : null;
    if (!node) return;
    const tr = current.translation;
    const n = +node.getAttribute('data-np-tr');
    tr.originals[n] = NpSanitize.html(reviewOrig.innerHTML);
    const key = tr.from + tr.to + tr.engine;
    try {
      if (!reviewHandle || reviewHandle.key !== key) {
        if (reviewHandle) reviewHandle.t.close();
        reviewHandle = null;
        toast(_('Getting the translator ready…'));
        reviewHandle = { key, t: await NpTranslate.open(tr.from, tr.to, tr.engine) };
      }
      const html = NpSanitize.html(await NpTranslate.unit(tr.originals[n], reviewHandle.t, tr.keep));
      if (!editor.contains(node)) return;
      editor.focus({ preventScroll: true });
      selectNode(node, true);
      document.execCommand('insertHTML', false, html || '<br>');
      afterEdit();
      reviewNode = null;
      updateReview();
    } catch (e) {
      toast(_('Could not translate: {reason}', { reason: (e && e.message) || e }), 6000);
    }
  }

  async function finishReview(allChecked) {
    if (!allChecked && editor.querySelector('[data-np-tr]') &&
      !(await confirmDialog(_('Done checking?'), _('The highlighting goes, and the originals are no longer kept with this document.'), { ok: _('Done') }))) return;
    for (const m of editor.querySelectorAll('[data-np-tr]')) m.removeAttribute('data-np-tr');
    delete current.translation;
    if (reviewHandle) { reviewHandle.t.close(); reviewHandle = null; }
    markDirty();
    showReview();
    if (allChecked) toast(_('Every paragraph checked.'));
  }

  reviewOrig.addEventListener('input', debounce(() => {
    if (!reviewNode || !current || !current.translation) return;
    current.translation.originals[+reviewNode.getAttribute('data-np-tr')] = NpSanitize.html(reviewOrig.innerHTML);
    markDirty();
  }, 400));

  async function saveNow(reason) {
    if (!current) return;
    scheduleSave.cancel();
    if (saving) await saving;
    if (!dirty && !reason) return;
    const doc = current;
    const isPdf = doc.type === 'pdf';
    // A PDF's edits live on the record itself (NpPdf changes it in place).
    const html = isPdf ? '' : serialize();
    if (!isPdf) {
      const text = plainText();
      doc.html = html;
      doc.text = text.slice(0, 200000);
      doc.words = (text.match(WORD_RE) || []).length;
    }
    doc.updated = Date.now();
    dirty = false;
    detectLang(doc);
    saving = (async () => {
      try {
        await NpStore.putDoc(doc);
        if (!isPdf && (reason || doc.updated - (doc.lastVersion || 0) > 10 * 60 * 1000)) {
          await NpStore.addVersion(doc.id, html, displayTitle(doc), reason || 'Autosave');
          doc.lastVersion = doc.updated;
          await NpStore.putDoc(doc);
        }
        if (doc === current) setStatus(savedText(), NpStore.persistent ? 'ok' : 'warn');
        if (channel) channel.postMessage({ type: 'saved', id: doc.id, updated: doc.updated });
        requestPersistence();
      } catch (e) {
        dirty = true;
        setStatus(_('Not saved'), 'error');
        toast(/quota/i.test(String(e && e.name) + e) ? _('Storage is full. Download your work, then delete old documents or images.') : _('Could not save: {reason}', { reason: (e && e.message) || e }), 6000);
      }
    })();
    await saving;
    saving = null;
    sortDocs();
    renderDocList();
    updateTitle();
  }

  let persistAsked = false;
  function requestPersistence() {
    if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
    persistAsked = true;
    navigator.storage.persist().catch(() => {});
  }

  function sortDocs() {
    docs.sort((a, b) => b.updated - a.updated);
  }

  async function openDoc(id, opts = {}) {
    if (current && current.id === id && !opts.force) return;
    if (current && dirty) await saveNow();
    const doc = docs.find((d) => d.id === id) || (await NpStore.getDoc(id));
    if (!doc) return;
    if (!docs.includes(doc)) docs.push(doc);
    closeFind();
    hideImageFrame();
    stopSpeaking();
    current = doc;
    current.settings = Object.assign({}, DOC_DEFAULTS, current.settings);
    const mobile = matchMedia('(max-width: 899px)').matches;
    document.body.classList.toggle('pdf-mode', doc.type === 'pdf');
    if (doc.type === 'pdf') {
      dirty = false;
      settings.lastDoc = doc.id;
      saveSettings();
      updateTitle();
      renderDocList();
      setStatus(savedText(), NpStore.persistent ? 'ok' : 'warn');
      if (mobile) setSidebar(false, true);
      updateSaveUi();
      applyDocLang();
      // the original file is stored apart from the record, and read when opened
      if (!doc.sources) doc.sources = (await NpStore.getSources(doc)) || [];
      showReview();
      await NpPdf.open(doc);
      return;
    }
    if (NpPdf.active) NpPdf.close();
    setZoom(settings.zoom);
    editor.innerHTML = NpSanitize.html(doc.html || '');
    if (!editor.firstChild) editor.innerHTML = '<p><br></p>';
    if (settings.marks) scheduleMarks();
    dirty = false;
    settings.lastDoc = doc.id;
    saveSettings();
    applyDocSettings();
    updateTitle();
    renderDocList();
    refreshMetrics();
    setStatus(savedText(), NpStore.persistent ? 'ok' : 'warn');
    workspace.scrollTop = 0;
    updateSaveUi();
    applyDocLang();
    showReview();
    if (!opts.noFocus && !matchMedia('(max-width: 899px)').matches) placeCaretAtStart();
    if (matchMedia('(max-width: 899px)').matches) setSidebar(false, true);
  }

  function placeCaretAtStart() {
    editor.focus({ preventScroll: true });
    const r = document.createRange();
    r.setStart(editor, 0);
    r.collapse(true);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  // A blank, untouched document is replaced rather than left behind.
  async function dropBlankCurrent() {
    const blank = current && current.type !== 'pdf' && !current.title && !current.goal && !(current.html || '').replace(/<p><br><\/p>|<br>/g, '').trim() && isEmptyDoc();
    if (!blank) return;
    const old = current;
    await NpStore.deleteDoc(old.id).catch(() => {});
    docs = docs.filter((d) => d !== old);
    current = null;
  }

  async function addRecord(doc) {
    try { await NpStore.putDoc(doc); } catch (e) { toast(/quota/i.test(String(e && e.name) + e) ? _('There is not enough storage space for that file.') : _('Could not create the document: {reason}', { reason: e.message })); return null; }

    docs.unshift(doc);
    await openDoc(doc.id, { force: true });
    return doc;
  }

  // A PDF, or an image opened as one (see images.js): origin then says what
  // kind of image it was, to download it as again.
  async function createPdfDoc(file, name, image) {
    setStatus(image ? _('Opening image…') : _('Opening PDF…'), 'pending');
    let buf = null;
    let origin;
    if (image) ({ bytes: buf, origin } = await NpImages.toPdf(file));
    else buf = await file.arrayBuffer();
    const info = await NpPdf.newRecord(buf);
    if (current && dirty) await saveNow();
    await dropBlankCurrent();
    const doc = Object.assign(newDocRecord('', name), { type: 'pdf', titleAuto: false, sources: [buf], pages: info.pages, pageCount: info.pages.length, items: [], fields: {}, text: info.text, origin });
    try { doc.lang = (await NpLang.detect(info.text)) || undefined; } catch (e) { /* found later, from what is read */ }
    return addRecord(doc);
  }

  // Documents are made one at a time: two at once would each find the other's
  // blank page current and leave it behind. A New pressed while a blank
  // document is still being made (a second click, or a space typed on the
  // still-focused button) is that same document. Keys typed meanwhile, which
  // would land on the button and be lost, are kept and typed into it.
  let creating = Promise.resolve();
  let blankInFlight = null;
  let typedAhead = null; // keys typed while a new document opens, or null
  function createDoc(html = '', title = '', opts = {}) {
    const blank = !html && !title;
    if (blank && blankInFlight) return blankInFlight;
    if (blank && !opts.keepFocus) {
      // until it opens, keys typed are held for it, not put in the page it leaves
      typedAhead = '';
      if (document.activeElement === editor) editor.blur();
    }
    const made = creating.then(() => makeDoc(html, title, opts));
    creating = made.catch(() => {});
    // nothing made (storage refused it): keys go where they are typed again
    made.then((doc) => { if (!doc) typedAhead = null; }, () => { typedAhead = null; });
    if (blank) {
      blankInFlight = made;
      made.finally(() => { if (blankInFlight === made) blankInFlight = null; });
    }
    return made;
  }
  document.addEventListener('keydown', (e) => {
    if (typedAhead == null || e.target === editor || e.isComposing) return;
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    typedAhead += e.key;
  }, true);

  async function makeDoc(html, title, opts) {
    if (current && dirty) await saveNow();
    await dropBlankCurrent();
    const doc = newDocRecord(html, title);
    if (opts.settings) Object.assign(doc.settings, opts.settings);
    const tmp = document.createElement('div');
    tmp.innerHTML = html.replace(/<\/(p|h[1-6]|li|div|pre|blockquote|tr)>/g, '$&\n');
    doc.text = tmp.textContent || '';
    doc.words = (doc.text.match(WORD_RE) || []).length;
    try { await NpStore.putDoc(doc); } catch (e) { toast(_('Could not create the document: {reason}', { reason: e.message })); return null; }
    docs.unshift(doc);
    await openDoc(doc.id, { force: true });
    if (!opts.keepFocus) {
      // the keys typed while it opened go in now, before any typed after
      const keys = typedAhead;
      typedAhead = null;
      if (document.activeElement !== editor) placeCaretAtStart();
      if (keys && current === doc) document.execCommand('insertText', false, keys);
    }
    return doc;
  }

  async function deleteDoc(id) {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    const ok = await confirmDialog(_('Delete “{title}”?', { title: displayTitle(doc) }), _('The document and its version history are removed from this browser. This cannot be undone.'), { ok: _('Delete'), danger: true });
    if (!ok) return;
    await NpStore.deleteDoc(id);
    docs = docs.filter((d) => d.id !== id);
    if (channel) channel.postMessage({ type: 'deleted', id });
    if (current && current.id === id) {
      current = null;
      dirty = false;
      if (docs.length) await openDoc(docs[0].id, { force: true });
      else await createDoc();
    } else {
      renderDocList();
    }
    toast(_('Document deleted'));
  }

  function updateTitle() {
    if (!current) return;
    const t = displayTitle(current);
    if (document.activeElement !== titleInput) titleInput.value = current.titleAuto ? (autoTitle(current.text) || '') : current.title;
    document.title = t + ' — Noteshack';
  }

  titleInput.addEventListener('input', () => {
    if (!current) return;
    const v = titleInput.value.trim();
    current.title = v;
    current.titleAuto = !v;
    markDirty();
    document.title = displayTitle(current) + ' — Noteshack';
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); placeCaretAtStart(); }
  });
  titleInput.addEventListener('blur', () => updateTitle());

  if (channel) {
    channel.onmessage = async (e) => {
      const m = e.data || {};
      if (m.type === 'saved') {
        const fresh = await NpStore.getDoc(m.id);
        if (!fresh) return;
        const i = docs.findIndex((d) => d.id === m.id);
        if (current && current.id === m.id) {
          if (dirty || fresh.updated <= current.updated || fresh.type === 'pdf') return;
          Object.assign(current, fresh);
          editor.innerHTML = NpSanitize.html(fresh.html);
          applyDocSettings();
          refreshMetrics();
          updateTitle();
          toast(_('Updated from another tab'));
        } else if (i >= 0) docs[i] = fresh;
        else docs.push(fresh);
        sortDocs();
        renderDocList();
      } else if (m.type === 'deleted') {
        docs = docs.filter((d) => d.id !== m.id);
        if (current && current.id === m.id) {
          current = null;
          if (docs.length) openDoc(docs[0].id, { force: true }); else createDoc();
          toast(_('This document was deleted in another tab'));
        } else renderDocList();
      }
    };
  }

  /* =========================================================== editor core */

  let savedRange = null;
  let plainPasteNext = false;
  let pendingFontSize = null;

  document.execCommand('styleWithCSS', false, true);
  document.execCommand('defaultParagraphSeparator', false, 'p');

  function selectionInEditor() {
    const s = getSelection();
    return s.rangeCount > 0 && editor.contains(s.getRangeAt(0).commonAncestorContainer);
  }

  // The live selection when it is in the document, else the last one seen
  // there (selectionchange arrives late, so the live one wins).
  function currentRange() {
    if (selectionInEditor()) return getSelection().getRangeAt(0).cloneRange();
    return savedRange ? savedRange.cloneRange() : null;
  }

  function restoreSelection() {
    if (document.activeElement === editor && selectionInEditor()) return;
    editor.focus({ preventScroll: true });
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(savedRange);
    }
  }

  function exec(cmd, value = null) {
    restoreSelection();
    const ok = document.execCommand(cmd, false, value);
    afterEdit();
    return ok;
  }

  function afterEdit() {
    markDirty();
    scheduleMetrics();
    updateToolbarState();
    if (findState.open) scheduleFind();
    scheduleSpell();
    if (settings.marks) scheduleMarks();
  }

  /* ----- spelling, in the document's language ----- */

  // Where Noteshack has a dictionary for the document's language it checks
  // spelling itself (see spell.js) and underlines with a highlight; else the
  // browser's own spell check is on, as before.
  const SPELL_SKIP = 'pre, code, a[href], [contenteditable="false"]';
  let spellTimer = 0;
  let spellBad = []; // [{ range, word }] as underlined now
  let spellRun = 0;
  const ignored = new Map(); // doc id → Set of words ignored in it, this visit
  const spellLang = () => { const c = docLang(current); return c === 'pt-BR' ? 'pt' : c.split('-')[0]; };
  const spellOurs = () => !!(current && current.type !== 'pdf' && settings.spellcheck && NpSpell.has(spellLang()) && window.CSS && CSS.highlights && window.Highlight);

  function scheduleSpell() {
    clearTimeout(spellTimer);
    spellTimer = setTimeout(spellPass, 500);
  }

  function clearSpell() {
    spellBad = [];
    if (window.CSS && CSS.highlights) CSS.highlights.delete('np-spell');
  }

  async function spellPass() {
    const run = ++spellRun;
    const ours = spellOurs();
    editor.spellcheck = settings.spellcheck && !ours;
    if (!ours) { clearSpell(); return; }
    const lang = spellLang();
    const seg = new Intl.Segmenter(lang, { granularity: 'word' });
    const caret = selectionInEditor() && getSelection().isCollapsed ? getSelection().getRangeAt(0) : null;
    const found = []; // { node, start, end, word }
    const walk = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest(SPELL_SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (const s of seg.segment(n.data)) {
        const w = s.segment.replace(/^['’]+|['’]+$/g, '');
        // words, not numbers, single letters or ALL-CAPS abbreviations
        if (!s.isWordLike || w.length < 2 || /\d/.test(w) || (w.length <= 5 && w === w.toUpperCase() && w !== w.toLowerCase())) continue;
        // the word being typed is not judged until it is finished
        if (caret && caret.startContainer === n && caret.startOffset >= s.index && caret.startOffset <= s.index + s.segment.length) continue;
        found.push({ node: n, start: s.index, end: s.index + s.segment.length, word: w });
      }
    }
    let bad;
    try { bad = new Set(await NpSpell.check(lang, found.map((f) => f.word))); } catch (e) { editor.spellcheck = settings.spellcheck; clearSpell(); return; }
    if (run !== spellRun || !spellOurs()) return;
    const skip = ignored.get(current.id) || new Set();
    spellBad = [];
    for (const f of found) {
      if (!bad.has(f.word) || skip.has(f.word) || !f.node.isConnected || f.end > f.node.data.length) continue;
      const r = document.createRange();
      r.setStart(f.node, f.start);
      r.setEnd(f.node, f.end);
      spellBad.push({ range: r, word: f.word });
    }
    CSS.highlights.set('np-spell', new Highlight(...spellBad.map((b) => b.range)));
  }

  // Right-click a word underlined as misspelled: corrections, and to add or
  // ignore it. (Shift + right-click keeps the browser's own menu.)
  editor.addEventListener('contextmenu', async (e) => {
    if (e.shiftKey || !spellBad.length) return;
    const at = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY)
      : (() => { const p = document.caretPositionFromPoint && document.caretPositionFromPoint(e.clientX, e.clientY); if (!p) return null; const r = document.createRange(); r.setStart(p.offsetNode, p.offset); return r; })();
    if (!at) return;
    const hit = spellBad.find((b) => b.range.startContainer === at.startContainer && at.startOffset >= b.range.startOffset && at.startOffset <= b.range.endOffset);
    if (!hit) return;
    e.preventDefault();
    const lang = spellLang();
    const menu = el('div', { class: 'pdf-word-menu spell-menu', role: 'menu' }, el('div', { class: 'pdf-menu-read' }, _('Looking for corrections…')));
    const close = () => { menu.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); };
    const away = (ev) => { if (!menu.contains(ev.target)) close(); };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); editor.focus(); } };
    document.body.append(menu);
    menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = Math.min(e.clientY, innerHeight - 260) + 'px';
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
    const item = (label, fn) => el('button', { type: 'button', role: 'menuitem', class: 'pdf-menu-item', onclick: () => { close(); fn(); } }, el('span', {}, label));
    let list = [];
    try { list = await NpSpell.suggest(lang, hit.word); } catch (err) { /* none */ }
    const replace = (w) => {
      // through the editor's own typing, so Undo takes it back
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(hit.range);
      document.execCommand('insertText', false, w);
      afterEdit();
    };
    menu.replaceChildren(
      ...(list.length ? list.map((w) => item(w, () => replace(w))) : [el('div', { class: 'pdf-menu-read' }, _('No suggestions'))]),
      el('div', { class: 'pdf-menu-sep' }),
      item(_('Add “{word}” to the dictionary', { word: hit.word }), async () => { await NpSpell.learn(lang, hit.word); spellPass(); }),

      item(_('Ignore it in this document'), () => {
        if (!ignored.has(current.id)) ignored.set(current.id, new Set());
        ignored.get(current.id).add(hit.word);
        spellPass();
      }));
    menu.style.top = Math.max(8, Math.min(e.clientY, innerHeight - menu.offsetHeight - 8)) + 'px';
    const first = menu.querySelector('button');
    if (first) first.focus();
  });

  function selectNode(node, contents) {
    const r = document.createRange();
    if (contents) r.selectNodeContents(node); else r.selectNode(node);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return r;
  }

  function caretTo(node, atEnd) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(!atEnd);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  // Replace a node through execCommand so Undo can take it back.
  function replaceUndoable(node, html, focusSel) {
    editor.focus({ preventScroll: true });
    const top = workspace.scrollTop;
    selectNode(node);
    document.execCommand('insertHTML', false, html);
    workspace.scrollTop = top;
    const target = focusSel ? editor.querySelector(focusSel) : null;
    // Chrome copies attributes onto paragraphs split off with Enter, so the
    // marker must not outlive this lookup.
    if (target) target.removeAttribute('data-np-t');
    afterEdit();
    return target;
  }

  function currentNode() {
    const s = getSelection();
    if (!s.rangeCount) return null;
    let n = s.getRangeAt(0).startContainer;
    if (n.nodeType === 3) n = n.parentNode;
    if (n.nodeType === 1 && n.childNodes.length && s.getRangeAt(0).startContainer === n) {
      const child = n.childNodes[Math.min(s.getRangeAt(0).startOffset, n.childNodes.length - 1)];
      if (child && child.nodeType === 1) n = child;
    }
    return editor.contains(n) ? n : null;
  }

  function closestInEditor(sel) {
    const n = currentNode();
    const found = n && n.closest(sel);
    return found && editor.contains(found) && found !== editor ? found : null;
  }

  function blockOf(node) {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== editor) {
      if (n.nodeType === 1 && n.matches(BLOCK_SEL)) return n;
      n = n.parentNode;
    }
    return editor;
  }

  // Text with a newline between blocks, and a map back to DOM positions.
  function textIndex(markers) {
    const segs = [];
    let text = '';
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 1) {
        if (n.tagName === 'BR' || n.tagName === 'IMG' || n.tagName === 'HR') text += '\n';
        else if (BLOCK_TAGS.has(n.tagName) && text && !text.endsWith('\n')) text += '\n';
        if (markers && n.tagName === 'LI') text += listMarker(n);
        continue;
      }
      const v = n.nodeValue;
      if (!v) continue;
      segs.push({ node: n, start: text.length, end: text.length + v.length });
      text += v;
    }
    function locate(pos, preferEnd) {
      let lo = 0;
      let hi = segs.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const s = segs[mid];
        if (pos < s.start) hi = mid - 1;
        else if (pos > s.end || (pos === s.end && !preferEnd && mid < segs.length - 1 && segs[mid + 1].start === pos)) lo = mid + 1;
        else return { node: s.node, offset: pos - s.start };
      }
      const s = segs[clamp(lo, 0, segs.length - 1)];
      return s ? { node: s.node, offset: clamp(pos - s.start, 0, s.node.nodeValue.length) } : null;
    }
    return {
      text,
      range(a, b) {
        const s = locate(a, false);
        const e = locate(b, true);
        if (!s || !e) return null;
        const r = document.createRange();
        r.setStart(s.node, s.offset);
        r.setEnd(e.node, e.offset);
        return r;
      }
    };
  }

  // "• ", "3. " or "[x] ", indented by nesting: list markers for plain-text export.
  function listMarker(li) {
    const list = li.parentElement;
    let depth = 0;
    for (let p = list && list.parentElement; p && p !== editor; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') depth++;
    const pad = '  '.repeat(depth);
    if (!list) return '';
    if (list.classList.contains('checklist')) return pad + (li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ');
    if (list.tagName === 'OL') {
      const items = Array.from(list.children).filter((c) => c.tagName === 'LI');
      return pad + ((parseInt(list.getAttribute('start'), 10) || 1) + items.indexOf(li)) + '. ';
    }
    return pad + '• ';
  }

  function plainText() {
    return textIndex().text.replace(/\n{3,}/g, '\n\n').trim();
  }

  function isEmptyDoc() {
    return !editor.textContent.trim() && !editor.querySelector('img,table,hr,li');
  }

  /* ----- input ----- */

  // Typing through an input method (Chinese, Japanese, Korean…) composes a
  // character before it is entered; nothing may change the text meanwhile,
  // or the half-made character is lost. The edit is taken up when it ends.
  // (Safari also sends one more key, numbered 229, as composing finishes.)
  const composing = (e) => e.isComposing || e.keyCode === 229;
  editor.addEventListener('compositionend', () => { afterEdit(); positionImageFrame(); });

  editor.addEventListener('input', (e) => {
    if (e.isComposing) return;
    shortcutJustRan = false;
    editor.classList.toggle('is-empty', isEmptyDoc());
    if (settings.smartMd && e.inputType === 'insertText' && e.data === ' ') markdownShortcut();
    if (pendingFontSize) applyPendingFontSize();
    afterEdit();
    positionImageFrame();
  });

  editor.addEventListener('beforeinput', (e) => {
    // Typing over a selected image replaces it, as in any word processor.
    if (selectedImage && e.inputType.startsWith('insert')) hideImageFrame();
  });

  function markdownShortcut() {
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed) return;
    const r = s.getRangeAt(0);
    if (r.startContainer.nodeType !== 3) return;
    const block = blockOf(r.startContainer);
    if (block !== editor && block.closest('pre,td,th,li')) return;
    const pre = document.createRange();
    pre.setStart(block, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString().replace(/ /g, ' ');
    const m = before.match(/^(#{1,3}|[-*+]|1[.)]|>|\[[ xX]?\]|```) $/);
    if (!m) return;
    const tok = m[1];
    const undoTo = { text: docText(), block, at: before.length };
    s.removeAllRanges();
    s.addRange(pre);
    document.execCommand('delete');
    if (tok[0] === '#') document.execCommand('formatBlock', false, '<h' + tok.length + '>');
    else if (tok === '>') document.execCommand('formatBlock', false, '<blockquote>');
    else if (tok === '```') document.execCommand('formatBlock', false, '<pre>');
    else if (/^1/.test(tok)) blockToList('ol');
    else if (tok[0] === '[') blockToList('checklist', /x/i.test(tok));
    else blockToList('ul');
    fixListInParagraph();
    shortcutJustRan = undoTo;
  }

  // Right after a shortcut changes a line, Backspace or Ctrl+Z puts back
  // exactly what was typed, and leaves it: the shortcut's edits (the
  // characters removed, the line changed) are undone, until the document
  // reads as it did just before (Chrome keeps them as two steps of undo,
  // Firefox as one), and the caret goes back where it was. Where undo
  // cannot (Safari takes the typing back with them), what was undone is
  // redone, so nothing typed is lost and the change stays. Anything else
  // typed or clicked keeps the change.
  // shortcutJustRan: { text: the document's text then, block: the line,
  // at: the caret's place in it }, or false.
  let shortcutJustRan = false;
  const docText = () => editor.textContent.replace(/\u00a0/g, ' ');
  function undoShortcut(e) {
    const ran = shortcutJustRan;
    if (/^(Control|Meta|Shift|Alt)$/.test(e.key)) return false;
    shortcutJustRan = false;
    const back = e.key === 'Backspace' && !mod(e) && !e.altKey && !e.shiftKey;
    const undo = mod(e) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z';
    if (!ran || !(back || undo)) return false;
    e.preventDefault();
    let undone = 0;
    while (undone < 2 && docText() !== ran.text) { document.execCommand('undo'); undone++; }
    if (docText() === ran.text) {
      if (!(ran.block.isConnected && caretAtChar(ran.block, ran.at))) {
        const s = getSelection();
        if (s.rangeCount) s.collapseToEnd();
      }
    } else {
      while (undone--) document.execCommand('redo');
    }
    afterEdit();
    return true;
  }
  editor.addEventListener('mousedown', () => { shortcutJustRan = false; });

  // The caret after the nth character of a block's text; false if it has fewer.
  function caretAtChar(block, n) {
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (n <= t.data.length) {
        const r = document.createRange();
        r.setStart(t, n);
        r.collapse(true);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
        return true;
      }
      n -= t.data.length;
    }
    return false;
  }

  // Turn the paragraph the caret is in into a new list. Done with insertHTML
  // rather than the list commands, which merge into a list just above.
  function blockToList(kind, checked) {
    const block = blockOf(currentNode());
    const s = getSelection();
    const multi = s.rangeCount && !s.isCollapsed && blockOf(s.getRangeAt(0).endContainer) !== block;
    if (!block || block === editor || multi || !/^(P|DIV|H[1-6])$/.test(block.tagName)) {
      document.execCommand(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
      fixListInParagraph();
      if (kind === 'checklist') markChecklist(closestInEditor('ul'), checked);
      return;
    }
    const tok = uid();
    const open = kind === 'ol' ? '<ol>' : kind === 'checklist' ? '<ul class="checklist">' : '<ul>';
    const close = kind === 'ol' ? '</ol>' : '</ul>';
    const attr = kind === 'checklist' ? ' data-checked="' + (checked ? 'true' : 'false') + '"' : '';
    const inner = block.innerHTML.trim() || '<br>';
    const li = replaceUndoable(block, open + '<li' + attr + ' data-np-t="' + tok + '">' + inner + '</li>' + close, '[data-np-t="' + tok + '"]');
    if (li) caretTo(li, true);
  }

  function markChecklist(list, checked) {
    if (!list) return;
    list.classList.add('checklist');
    for (const item of list.children) if (item.tagName === 'LI' && !item.hasAttribute('data-checked')) item.setAttribute('data-checked', checked ? 'true' : 'false');
  }

  // Chrome wraps a new list in the paragraph it came from (<p><ul>…</ul></p>).
  function fixListInParagraph() {
    for (const list of $$('p > ul, p > ol', editor)) {
      const p = list.parentElement;
      if (p.childNodes.length === 1) p.replaceWith(list);
    }
  }

  editor.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (undoShortcut(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mod(e)) { e.preventDefault(); insertPageBreak(); return; }
      if (handleEnter(e)) return;
    }
    if (e.key === 'Tab' && !mod(e) && !e.altKey) {
      const cell = closestInEditor('td,th');
      if (cell) { e.preventDefault(); moveCell(cell, e.shiftKey ? -1 : 1); return; }
      if (closestInEditor('li')) { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); return; }
      if (!e.shiftKey) { e.preventDefault(); exec('insertText', '\t'); return; }
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedImage) {
      e.preventDefault();
      const img = selectedImage;
      hideImageFrame();
      selectNode(img);
      exec('delete');
      return;
    }
    if (mod(e) && e.shiftKey && (e.key === 'v' || e.key === 'V')) plainPasteNext = true;
  });

  function handleEnter(e) {
    const block = blockOf(currentNode());
    if (block && block !== editor && settings.smartMd) {
      const t = block.textContent.replace(/ /g, ' ').trim();
      if ((t === '---' || t === '***' || t === '___') && !block.closest('pre,td,th,li')) {
        e.preventDefault();
        const undoTo = { text: docText(), block, at: block.textContent.length };
        selectNode(block, true);
        document.execCommand('delete');
        insertRule('');
        shortcutJustRan = undoTo;
        return true;
      }
    }
    // Enter on an empty last line leaves a code block or quote.
    const pre = closestInEditor('pre');
    if (pre && caretAtEnd(pre)) {
      if (!pre.textContent) { e.preventDefault(); exec('formatBlock', '<p>'); return true; }
      const kids = pre.childNodes;
      const n = kids.length;
      if (n >= 2 && kids[n - 1].nodeName === 'BR' && kids[n - 2].nodeName === 'BR') {
        e.preventDefault();
        const r = document.createRange();
        r.setStartBefore(kids[n - 2]);
        r.setEndAfter(kids[n - 1]);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        document.execCommand('delete');
        exitAfter(pre);
        return true;
      }
    }
    const quote = closestInEditor('blockquote');
    if (quote && !NpSanitize.isIndentQuote(quote) && caretAtEnd(quote)) {
      const emptyLine = (n) => !n.textContent.trim() && !n.querySelector('img');
      if (block === quote && emptyLine(quote)) { e.preventDefault(); exec('formatBlock', '<p>'); return true; }
      const last = quote.lastElementChild;
      if (last && last === block && emptyLine(last) && quote.children.length > 1) {
        e.preventDefault();
        last.remove();
        exitAfter(quote);
        return true;
      }
    }
    return false;
  }

  function exitAfter(node) {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    node.after(p);
    caretTo(p);
    afterEdit();
  }

  function caretAtEnd(node) {
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed) return false;
    const r = document.createRange();
    r.selectNodeContents(node);
    r.setStart(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset);
    return !r.toString().length && !r.cloneContents().querySelector('img');
  }

  /* ----- clicks inside the document ----- */

  editor.addEventListener('mousedown', (e) => {
    const li = e.target.closest && e.target.closest('ul.checklist > li');
    if (li && e.target === li) {
      const rect = li.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(li).paddingLeft) || 24;
      if (e.clientX - rect.left < pad * (rect.width / li.offsetWidth || 1)) {
        e.preventDefault();
        li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
        afterEdit();
      }
    }
  });

  editor.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('img');
    if (img && editor.contains(img)) { selectImage(img); return; }
    hideImageFrame();
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && (mod(e) || !editor.isContentEditable)) {
      e.preventDefault();
      window.open(a.href, '_blank', 'noopener');
    }
  });

  /* ----- clipboard ----- */

  function clipboardHtmlOfSelection() {
    const s = getSelection();
    const r = s.getRangeAt(0);
    let wrap = document.createElement('div');
    wrap.appendChild(r.cloneContents());
    // keep inline formatting the selection sits inside (bold, color…)
    let n = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    while (n && n !== editor && !n.matches(BLOCK_SEL)) {
      const shell = n.cloneNode(false);
      while (wrap.firstChild) shell.appendChild(wrap.firstChild);
      wrap = document.createElement('div');
      wrap.appendChild(shell);
      n = n.parentNode;
    }
    return unmarked(wrap.innerHTML.replace(/ data-np-t="[^"]*"| data-np-end=""/g, ''));
  }

  function onCopy(e, cut) {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed || !selectionInEditor() || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/html', '<meta name="np-clip" content="1">' + clipboardHtmlOfSelection());
    e.clipboardData.setData('text/plain', s.toString());
    if (cut) exec('delete');
  }
  editor.addEventListener('copy', (e) => onCopy(e, false));
  editor.addEventListener('cut', (e) => onCopy(e, true));

  editor.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = Array.from(cd.files || []).filter((f) => f.type.startsWith('image/'));
    const html = cd.getData('text/html');
    const text = cd.getData('text/plain');
    e.preventDefault();
    const plain = plainPasteNext;
    plainPasteNext = false;
    if (files.length && !html) { files.forEach(insertImageFile); return; }
    if (closestInEditor('pre') || plain || !html) { if (text) exec('insertText', text); return; }
    const internal = /name="np-clip"/.test(html);
    const clean = NpSanitize.html(html, { external: !internal });
    if (clean.trim()) exec('insertHTML', clean);
    else if (text) exec('insertText', text);
    fixListInParagraph();
  });

  /* ----- drag and drop ----- */

  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; $('#drop-hint').hidden = false; });
  window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('#drop-hint').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('#drop-hint').hidden = true;
    const files = Array.from(e.dataTransfer.files);
    // the files on disk, for Save (asked for now: the list is gone after this event)
    const items = Array.from(e.dataTransfer.items || []).filter((it) => it.kind === 'file');
    const handles = items.length === files.length && items[0] && items[0].getAsFileSystemHandle ? items.map((it) => it.getAsFileSystemHandle().catch(() => null)) : [];
    // into a text document an image goes in as a picture; otherwise it
    // opens as a document of its own, to read and edit
    const images = pdfMode() ? [] : files.filter((f) => f.type.startsWith('image/'));
    const others = files.filter((f) => !images.includes(f));
    if (images.length) {
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (r && editor.contains(r.startContainer)) { editor.focus(); getSelection().removeAllRanges(); getSelection().addRange(r); savedRange = r; }
      }
      images.forEach(insertImageFile);
    }
    if (others.length) Promise.all(handles).then((hs) => openFiles(others, others.map((f) => hs[files.indexOf(f)] || null)));
  });

  /* ----- selection tracking ----- */

  document.addEventListener('selectionchange', () => {
    if (!selectionInEditor()) return;
    savedRange = getSelection().getRangeAt(0).cloneRange();
    updateToolbarStateSoon();
    updateSelectionCount();
    updateReview();
  });

  /* =========================================================== commands */

  function setBlock(tag) {
    restoreSelection();
    const inList = closestInEditor('li');
    if (inList && tag !== 'p') {
      const list = inList.closest('ul,ol');
      document.execCommand(list.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
    }
    const cur = blockOf(currentNode());
    if (cur && cur !== editor && cur.tagName.toLowerCase() === tag && tag !== 'p') tag = 'p';
    exec('formatBlock', '<' + tag + '>');
  }

  function makeChecklist(checked) {
    const li = closestInEditor('li');
    const list = li && li.closest('ul,ol');
    if (list && list.classList.contains('checklist')) { document.execCommand('insertUnorderedList'); return; }
    if (list && list.tagName === 'UL') { markChecklist(list, checked); return; }
    if (list) document.execCommand('insertOrderedList');
    blockToList('checklist', checked);
  }

  function toggleChecklist() {
    restoreSelection();
    makeChecklist(false);
    afterEdit();
  }

  function applyFontSize(pt) {
    restoreSelection();
    const s = getSelection();
    if (!s.rangeCount) return;
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    document.execCommand('styleWithCSS', false, true);
    if (s.isCollapsed) pendingFontSize = pt;
    else for (const f of $$('font[size="7"]', editor)) { f.removeAttribute('size'); f.style.fontSize = pt + 'pt'; }
    afterEdit();
  }

  function applyPendingFontSize() {
    for (const f of $$('font[size="7"]', editor)) { f.removeAttribute('size'); f.style.fontSize = pendingFontSize + 'pt'; }
    pendingFontSize = null;
  }

  function applyFont(key) {
    exec('fontName', fontByKey(key).css);
  }

  function setColor(kind, color) {
    if (kind === 'fore') exec('foreColor', color || 'inherit');
    else exec('hiliteColor', color || 'transparent');
    if (color) {
      settings[kind === 'fore' ? 'lastFore' : 'lastBack'] = color;
      saveSettings();
      paintColorBars();
    }
  }

  function paintColorBars() {
    $('#fore-bar').style.background = settings.lastFore || 'currentColor';
    $('#back-bar').style.background = settings.lastBack || '#fff2cc';
  }

  function clearFormatting() {
    restoreSelection();
    document.execCommand('removeFormat');
    document.execCommand('unlink');
    const block = blockOf(currentNode());
    if (block && block !== editor && /^(H[1-6]|BLOCKQUOTE|PRE)$/.test(block.tagName)) document.execCommand('formatBlock', false, '<p>');
    afterEdit();
  }

  function toggleInlineCode() {
    restoreSelection();
    const code = closestInEditor('code');
    if (code) {
      replaceUndoable(code, escapeHtml(code.textContent));
      return;
    }
    const s = getSelection();
    const text = s.toString();
    if (!text) { exec('insertHTML', '<code>​</code>'); return; }
    exec('insertHTML', '<code>' + escapeHtml(text) + '</code>');
  }

  // insertHorizontalRule writes id="null" and leaves the caret outside any
  // paragraph, so lines are inserted as HTML with a paragraph after them.
  function insertRule(cls) {
    const tok = uid();
    exec('insertHTML', '<hr' + (cls ? ' class="' + cls + '"' : '') + '><p data-np-t="' + tok + '"><br></p>');
    const p = editor.querySelector('[data-np-t="' + tok + '"]');
    if (p) { p.removeAttribute('data-np-t'); caretTo(p); }
  }

  function insertPageBreak() {
    insertRule('page-break');
  }

  function insertDate() {
    exec('insertText', new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  }

  /* =========================================================== toolbar */

  const tbBlock = $('#tb-block');
  const tbFont = $('#tb-font');
  const tbSize = $('#tb-size');

  function buildToolbar() {
    tbFont.innerHTML = FONTS.map((f) => '<option value="' + f.key + '" style="font-family:' + escapeHtml(f.css) + '">' + escapeHtml(f.label) + '</option>').join('') + '<option value="" hidden id="tb-font-other">' + escapeHtml(_('Other')) + '</option>';

    tbSize.innerHTML = SIZES.map((s) => '<option value="' + s + '">' + s + '</option>').join('') + '<option value="" hidden id="tb-size-other"></option>';
    tbBlock.addEventListener('change', () => { setBlock(tbBlock.value); });
    tbFont.addEventListener('change', () => { if (tbFont.value) applyFont(tbFont.value); });
    tbSize.addEventListener('change', () => { if (tbSize.value) applyFontSize(+tbSize.value); });
    // Toolbar buttons must not take focus from the document, or the selection goes with it.
    $('#toolbar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    $('#ctxbar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    for (const tb of [$('#toolbar'), $('#pdf-toolbar')]) {
      const edges = () => {
        tb.classList.toggle('more-left', tb.scrollLeft > 2);
        tb.classList.toggle('more-right', tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 2);
      };
      tb.addEventListener('scroll', edges, { passive: true });
      window.addEventListener('resize', edges);
      new ResizeObserver(edges).observe(tb);
    }
    paintColorBars();
  }

  let stateRaf = 0;
  function updateToolbarStateSoon() {
    if (stateRaf) return;
    stateRaf = requestAnimationFrame(() => { stateRaf = 0; updateToolbarState(); updateCtxBar(); });
  }

  function updateToolbarState() {
    if (!selectionInEditor()) return;
    for (const b of $$('[data-state]')) {
      const cmd = b.dataset.state;
      let on = false;
      if (cmd === 'checklist') on = !!closestInEditor('ul.checklist');
      else if (cmd === 'insertUnorderedList') on = !!closestInEditor('ul') && !closestInEditor('ul.checklist');
      else { try { on = document.queryCommandState(cmd); } catch (e) { on = false; } }
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const n = currentNode() || editor;
    const block = blockOf(n);
    const tag = block && block !== editor ? block.tagName.toLowerCase() : 'p';
    const bq = closestInEditor('blockquote');
    tbBlock.value = closestInEditor('pre') ? 'pre' : /^h[1-3]$/.test(tag) ? tag : bq && !NpSanitize.isIndentQuote(bq) ? 'blockquote' : 'p';
    const cs = getComputedStyle(n.nodeType === 1 ? n : n.parentElement);
    const fam = firstFamily(cs.fontFamily);
    const f = FONTS.find((x) => firstFamily(x.css) === fam);
    if (f) tbFont.value = f.key;
    else { $('#tb-font-other').textContent = cs.fontFamily.split(',')[0].replace(/["']/g, ''); tbFont.value = ''; }
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    if (SIZES.includes(pt)) tbSize.value = String(pt);
    else { $('#tb-size-other').textContent = String(pt); tbSize.value = ''; }
  }

  /* ----- context bar: image / link / table tools ----- */

  function ctxButton(icon, label, fn, extra) {
    return el('button', Object.assign({ class: 'ctx-btn', type: 'button', title: label, 'aria-label': label, 'data-icon': icon || null, onclick: fn }, extra || {}), icon ? null : label);
  }

  function updateCtxBar() {
    const bar = $('#ctxbar');
    let content = null;
    if (selectedImage && editor.contains(selectedImage)) {
      const img = selectedImage;
      const w = img.style.width;
      const size = (label, val) => el('button', { class: 'ctx-btn text' + (w === val ? ' on' : ''), type: 'button', onclick: () => setImage(img, (c) => { if (val) c.style.width = val; else c.style.removeProperty('width'); if (!c.getAttribute('style')) c.removeAttribute('style'); }) }, label);
      const align = (icon, label, cls) => ctxButton(icon, label, () => setImage(img, (c) => { c.classList.remove('img-left', 'img-center', 'img-right'); if (cls) c.classList.add(cls); if (!c.className) c.removeAttribute('class'); }), { class: 'ctx-btn' + ((cls ? img.classList.contains(cls) : !/img-/.test(img.className)) ? ' on' : '') });
      content = [
        el('span', { class: 'ctx-label' }, _('Image')),
        size('25%', '25%'), size('50%', '50%'), size('75%', '75%'), size(_('Full'), '100%'), size(_('Original'), ''),
        el('span', { class: 'tb-sep' }),
        align('alignLeft', _('Inline with text'), ''), align('alignCenter', _('Center'), 'img-center'),
        el('button', { class: 'ctx-btn text' + (img.classList.contains('img-left') ? ' on' : ''), type: 'button', title: _('Wrap text, image on the left'), onclick: () => setImage(img, (c) => { c.classList.remove('img-center', 'img-right'); c.classList.add('img-left'); }) }, _('Wrap left')),
        el('button', { class: 'ctx-btn text' + (img.classList.contains('img-right') ? ' on' : ''), type: 'button', title: _('Wrap text, image on the right'), onclick: () => setImage(img, (c) => { c.classList.remove('img-center', 'img-left'); c.classList.add('img-right'); }) }, _('Wrap right')),
        el('span', { class: 'tb-sep' }),
        el('button', { class: 'ctx-btn text', type: 'button', onclick: () => editAlt(img) }, _('Alt text')),
        ctxButton('trash', _('Delete image'), () => { hideImageFrame(); selectNode(img); exec('delete'); })
      ];
    } else {
      const a = closestInEditor('a[href]');
      const cell = closestInEditor('td,th');
      if (a) {
        content = [
          el('span', { class: 'ctx-label' }, _('Link')),
          el('a', { class: 'ctx-url', href: a.href, target: '_blank', rel: 'noopener', title: a.href }, a.getAttribute('href')),
          ctxButton('external', _('Open link'), () => window.open(a.href, '_blank', 'noopener')),
          ctxButton('edit', _('Edit link'), () => linkDialog(a)),
          ctxButton('unlink', _('Remove link'), () => { selectNode(a, true); exec('unlink'); })
        ];
      } else if (cell) {
        content = [
          el('span', { class: 'ctx-label' }, _('Table')),
          ctxButton('rowAbove', _('Insert row above'), () => tableOp('row-above')),
          ctxButton('rowBelow', _('Insert row below'), () => tableOp('row-below')),
          ctxButton('colLeft', _('Insert column left'), () => tableOp('col-left')),
          ctxButton('colRight', _('Insert column right'), () => tableOp('col-right')),
          el('span', { class: 'tb-sep' }),
          ctxButton('delRow', _('Delete row'), () => tableOp('del-row')),
          ctxButton('delCol', _('Delete column'), () => tableOp('del-col')),
          ctxButton('header', _('Header row on or off'), () => tableOp('header'), { class: 'ctx-btn' + (cell.closest('table').rows[0] && cell.closest('table').rows[0].cells[0] && cell.closest('table').rows[0].cells[0].tagName === 'TH' ? ' on' : '') }),
          el('span', { class: 'tb-sep' }),
          ctxButton('trash', _('Delete table'), () => tableOp('del-table'))
        ];
      }
    }
    if (!content) { bar.hidden = true; bar.replaceChildren(); return; }
    bar.replaceChildren(...content);
    NpIcons.inject(bar);
    bar.hidden = false;
  }

  /* =========================================================== menus */

  const menubar = $('#menubar');
  let openMenu = null;

  function closeMenus() {
    if (!openMenu) return;
    openMenu.classList.remove('open');
    openMenu.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
    openMenu = null;
  }

  function openMenuEl(m, focusFirst) {
    closeMenus();
    closePopover();
    refreshMenuChecks();
    m.classList.add('open');
    m.querySelector('.menu-btn').setAttribute('aria-expanded', 'true');
    openMenu = m;
    const pop = m.querySelector('.menu-pop');
    pop.style.left = '';
    const r = pop.getBoundingClientRect();
    if (r.right > innerWidth - 8) pop.style.left = Math.min(0, innerWidth - 8 - r.right) + 'px';
    if (focusFirst) pop.querySelector('button').focus();
  }

  menubar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  menubar.addEventListener('click', (e) => {
    const btn = e.target.closest('.menu-btn');
    if (!btn) return;
    const m = btn.parentElement;
    if (openMenu === m) closeMenus(); else openMenuEl(m, e.detail === 0);
  });
  menubar.addEventListener('mouseover', (e) => {
    if (!openMenu) return;
    const btn = e.target.closest('.menu-btn');
    if (btn && btn.parentElement !== openMenu) openMenuEl(btn.parentElement);
  });
  menubar.addEventListener('keydown', (e) => {
    const menus = $$('.menu', menubar);
    const m = e.target.closest('.menu');
    if (!m) return;
    const i = menus.indexOf(m);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = menus[(i + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length];
      if (openMenu) openMenuEl(next, true); else next.querySelector('.menu-btn').focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!openMenu) { openMenuEl(m, true); return; }
      const items = $$('.menu-pop > button', m);
      const j = items.indexOf(document.activeElement);
      const k = e.key === 'ArrowDown' ? (j + 1) % items.length : (j - 1 + items.length) % items.length;
      items[k].focus();
    } else if (e.key === 'Escape' && openMenu) {
      e.preventDefault();
      const b = openMenu.querySelector('.menu-btn');
      closeMenus();
      b.focus();
    }
  });

  function refreshMenuChecks() {
    const state = {
      'view:page': settings.view === 'page', 'view:full': settings.view === 'full',
      'theme:light': settings.theme === 'light', 'theme:dark': settings.theme === 'dark', 'theme:system': settings.theme === 'system',
      sidebar: document.body.classList.contains('sidebar-open'),
      spellcheck: settings.spellcheck, smartMd: settings.smartMd, marks: settings.marks
    };
    for (const b of $$('[data-check]')) {
      const on = !!state[b.dataset.check];
      b.classList.toggle('checked', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  document.addEventListener('mousedown', (e) => {
    if (openMenu && !e.target.closest('.menu')) closeMenus();
    if (popover.open && !e.target.closest('#popover') && !e.target.closest('[data-popover-anchor]')) closePopover();
  });

  /* =========================================================== actions */

  const pdfMode = () => !!current && current.type === 'pdf';

  // Print a PDF from a preview of exactly what will print (the file with
  // your changes), drawn here; printing goes from the preview straight to
  // the printer, with no other tab to wait for.
  async function printPdf() {
    NpPdf.finishEditing();
    const rec = current;
    const list = el('div', { class: 'print-pages' }, el('p', { class: 'print-wait' }, _('Making the PDF…')));
    let view = null;
    let blob = null;
    let failed = false;
    const ready = (async () => {
      try {
        blob = await NpPdf.export(rec);
        view = await NpPdf.view(blob);
        list.replaceChildren();
        const width = Math.min(720, (list.clientWidth || 720) - 32);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        for (let i = 0; i < view.count; i++) {
          const page = await view.page(i);
          const vp1 = page.getViewport({ scale: 1 });
          const scale = width / vp1.width;
          const c = el('canvas', { class: 'print-page', 'aria-label': _('Page {page}', { page: i + 1 }) });
          c.width = Math.round(vp1.width * scale * dpr);
          c.height = Math.round(vp1.height * scale * dpr);
          c.style.width = Math.round(vp1.width * scale) + 'px';
          list.append(c, el('div', { class: 'print-num' }, _('Page {page} of {total}', { page: i + 1, total: view.count })));
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: g, viewport: page.getViewport({ scale: scale * dpr }) }).promise;
        }
      } catch (e) {
        failed = true;
        list.replaceChildren(el('p', { class: 'print-wait' }, _('Could not make the PDF: {reason}', { reason: e.message || e })));
      }
    })();
    const choice = await dialog({
      title: _('Print preview'), wide: true, body: list,
      actions: [{ label: _('Close'), value: '' }, { label: _('Save as PDF…'), value: 'save' }, { label: _('Open in a new tab'), value: 'tab' }, { label: _('Print'), value: 'print', primary: true }]
    });
    if (!choice) { await ready; if (view) view.destroy(); return; }
    // where to save, asked straight after the click (the browser allows the dialog only then)
    let handle = null;
    if (choice === 'save' && canWriteFiles()) {
      try { handle = await window.showSaveFilePicker({ id: 'noteshack', suggestedName: safeFileName(displayTitle(rec), 'pdf'), types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] }); } catch (e) {
        if (e.name === 'AbortError') { await ready; if (view) view.destroy(); return; }
      }
    }
    toast(blob ? _('One moment…') : _('Making the PDF…'), 2000);
    await ready;
    if (failed || !blob) { if (view) view.destroy(); return; }
    if (choice === 'save') {
      if (handle) {
        try { const w = await handle.createWritable(); await w.write(blob); await w.close(); toast(_('Saved to “{name}”', { name: handle.name })); } catch (e) { toast(_('Could not save: {reason}', { reason: e.message || e }), 7000); }
      } else download(blob, safeFileName(displayTitle(rec), 'pdf'));
    }
    else if (choice === 'tab') {
      const url = URL.createObjectURL(blob);
      if (!window.open(url, '_blank')) download(blob, safeFileName(displayTitle(rec), 'pdf'));
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } else if (choice === 'print') await printPages(view, displayTitle(rec));
    view.destroy();
  }

  // The pages as images at print resolution, in a hidden frame that is printed.
  async function printPages(view, title) {
    toast(_('Getting the pages ready to print…'), 3000);
    const urls = [];
    const sizes = [];
    const dpi = 200;
    for (let i = 0; i < view.count; i++) {
      const page = await view.page(i);
      const vp = page.getViewport({ scale: dpi / 72 });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      urls.push(URL.createObjectURL(b));
      const v1 = page.getViewport({ scale: 1 });
      sizes.push([v1.width, v1.height]);
    }
    const [w0, h0] = sizes[0];
    const frame = el('iframe', { class: 'print-frame', 'aria-hidden': 'true', tabindex: '-1' });
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title><style>' +
      '@page{size:' + w0 + 'pt ' + h0 + 'pt;margin:0}html,body{margin:0;padding:0}' +
      'img{display:block;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}' +
      '</style></head><body>' + urls.map((u, i) => '<img src="' + u + '" style="width:' + sizes[i][0] + 'pt;height:' + sizes[i][1] + 'pt" alt="">').join('') + '</body></html>');
    doc.close();
    await Promise.all([...doc.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
    const done = () => { frame.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); };
    frame.contentWindow.addEventListener('afterprint', () => setTimeout(done, 500));
    setTimeout(done, 10 * 60 * 1000);
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  const ACTIONS = {
    'new': () => createDoc(),
    open: openPicker,
    save: saveFile,
    'save-as': () => saveAs(),
    'export': exportAs,
    'doc-lang': languageDialog,
    'app-lang': appLanguageDialog,
    translate: translateDialog,
    'review-prev': () => reviewStep(-1),
    'review-next': () => reviewStep(1),
    'review-ok': reviewOk,
    'review-redo': reviewRedo,
    'review-done': () => finishReview(false),
    duplicate: duplicateDoc,
    rename: () => { titleInput.focus(); titleInput.select(); },
    history: historyDialog,
    print: () => (pdfMode() ? printPdf() : printDoc()),
    'page-setup': pageSetupDialog,
    backup: backupAll,
    'restore-backup': () => $('#file-backup').click(),
    'delete': () => current && deleteDoc(current.id),
    cmd: (arg) => {
      if (pdfMode()) { if (arg === 'undo') NpPdf.undo(); if (arg === 'redo') NpPdf.redo(); return; }
      exec(arg);
      if (arg === 'insertUnorderedList' || arg === 'insertOrderedList') {
        const ul = closestInEditor('ul.checklist');
        if (arg === 'insertUnorderedList' && ul) ul.classList.remove('checklist');
        fixListInParagraph();
      }
    },
    'select-all': () => { editor.focus(); selectNode(editor, true); },
    find: () => openFind(false),
    replace: () => openFind(true),
    image: () => $('#file-image').click(),
    'image-url': imageUrlDialog,
    'table-menu': (arg, btn) => tablePicker(btn),
    link: () => linkDialog(closestInEditor('a[href]')),
    checklist: toggleChecklist,
    'page-break': insertPageBreak,
    hr: () => insertRule(''),
    date: insertDate,
    symbols: (arg, btn) => symbolPicker(btn),
    block: (arg) => setBlock(arg),
    'inline-code': toggleInlineCode,
    'clear-format': clearFormatting,
    'color-menu': (arg, btn) => colorPicker(arg, btn),
    view: (arg) => setView(arg),
    theme: (arg) => setTheme(arg),
    'toggle-theme': () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'),
    zoom: (arg) => pdfMode() ? NpPdf.zoom(arg || 'reset') : setZoom(arg === 'in' ? settings.zoom + 0.1 : arg === 'out' ? settings.zoom - 0.1 : 1),
    'toggle-sidebar': () => setSidebar(!document.body.classList.contains('sidebar-open')),
    focus: toggleFocus,
    'word-count': wordCountDialog,
    goal: goalDialog,
    speak: toggleSpeak,
    voice: voiceDialog,
    marks: () => { settings.marks = !settings.marks; saveSettings(); applyMarks(); toast(settings.marks ? _('Formatting marks on') : _('Formatting marks off')); },
    spellcheck: () => { settings.spellcheck = !settings.spellcheck; saveSettings(); applySpellcheck(); toast(settings.spellcheck ? _('Spell check on') : _('Spell check off')); },
    'smart-md': () => { settings.smartMd = !settings.smartMd; saveSettings(); toast(settings.smartMd ? _('Markdown shortcuts on') : _('Markdown shortcuts off')); },

    shortcuts: shortcutsDialog,
    report: () => reportDialog(),
    about: aboutDialog,
    storage: storageDialog,
    'find-next': () => findStep(1),
    'find-prev': () => findStep(-1),
    'find-close': () => closeFind(true),
    'replace-one': replaceOne,
    'replace-all': replaceAll,
    'pdf-rotate': (arg) => NpPdf.rotateCurrent(+arg),
    'pdf-delete-page': () => NpPdf.deleteCurrent(),
    'pdf-blank': () => NpPdf.insertBlank(),
    'pdf-add': () => NpPdf.addPages(),
    'pdf-ocr': (arg) => NpPdf.ocr(arg),
    'pdf-convert': () => NpPdf.convert(),
    'pdf-unconvert': () => NpPdf.unconvert(),
    'pdf-original': () => NpPdf.showOriginal(),
    'pdf-scan-fonts': () => NpPdf.toggleScanFonts(),
    'pdf-copy-text': () => NpPdf.copyText()
  };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || t.disabled) return;
    const fn = ACTIONS[t.dataset.action];
    if (!fn) return;
    if (t.closest('.menu-pop')) closeMenus();
    e.preventDefault();
    fn(t.dataset.arg, t);
  });

  /* ----- keyboard shortcuts ----- */

  document.addEventListener('keydown', (e) => {
    if (composing(e)) return;
    if (pdfMode() && !openMenu && NpPdf.onKey(e)) return;
    if (e.key === 'Escape') {
      if (document.querySelector('dialog[open]')) return;
      if (popover.open) { closePopover(); restoreSelection(); return; }
      if (openMenu) { closeMenus(); return; }
      if (findState.open) { closeFind(true); return; }
      if (selectedImage) { hideImageFrame(); return; }
      if (document.body.classList.contains('focus')) { toggleFocus(); return; }
    }
    if (e.key === 'F11' && document.body.classList.contains('focus')) return;
    if (!mod(e) || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    const inDoc = document.activeElement === editor;
    const code = e.code;
    const run = (fn) => { e.preventDefault(); fn(); };

    if (k === 's' && !e.shiftKey) return run(saveFile);
    if (k === 's' && e.shiftKey) return run(() => saveAs());
    if (k === 'o' && !e.shiftKey) return run(openPicker);
    if (k === 'p' && !e.shiftKey) return run(() => (pdfMode() ? printPdf() : printDoc()));
    if (k === 'f' && e.shiftKey) return run(toggleFocus);
    if (pdfMode()) {
      if (k === '/') run(shortcutsDialog);
      else if (e.altKey && code === 'KeyN') run(() => createDoc());
      return;
    }
    if (k === 'f' && !e.altKey) return run(() => openFind(false));
    if (k === 'h' && !e.shiftKey) return run(() => openFind(true));
    if (k === '/') return run(shortcutsDialog);
    if (e.altKey && code === 'KeyN') return run(() => createDoc());
    if (e.shiftKey && k === 'c' && !e.altKey) return run(wordCountDialog);
    if (!inDoc) return;
    if (k === 'k') return run(() => linkDialog(closestInEditor('a[href]')));
    if (k === '\\') return run(clearFormatting);
    if (k === 'e' && !e.shiftKey) return run(toggleInlineCode);
    if (k === '.' && !e.shiftKey) return run(() => exec('superscript'));
    if (k === ',' && !e.shiftKey) return run(() => exec('subscript'));
    // done here, not left to the browser: Firefox may open its bookmarks on Ctrl+B
    if (!e.shiftKey && !e.altKey && (k === 'b' || k === 'i' || k === 'u')) return run(() => exec({ b: 'bold', i: 'italic', u: 'underline' }[k]));
    if (e.shiftKey && code === 'KeyX') return run(() => exec('strikeThrough'));
    if (e.shiftKey && code === 'Digit7') return run(() => ACTIONS.cmd('insertOrderedList'));
    if (e.shiftKey && code === 'Digit8') return run(() => ACTIONS.cmd('insertUnorderedList'));
    if (e.shiftKey && code === 'Digit9') return run(toggleChecklist);
    if (e.shiftKey && code === 'KeyL') return run(() => exec('justifyLeft'));
    if (e.shiftKey && code === 'KeyE') return run(() => exec('justifyCenter'));
    if (e.shiftKey && code === 'KeyR') return run(() => exec('justifyRight'));
    if (e.shiftKey && code === 'KeyJ') return run(() => exec('justifyFull'));
    if (e.altKey && /^Digit[0-3]$/.test(code)) return run(() => setBlock(code === 'Digit0' ? 'p' : 'h' + code.slice(5)));
  });

  /* =========================================================== popovers */

  const popover = { el: $('#popover'), open: false, anchor: null };

  function openPopover(anchor, content, cls) {
    closeMenus();
    closePopover();
    const p = popover.el;
    p.className = 'popover ' + (cls || '');
    p.replaceChildren(content);
    p.hidden = false;
    popover.open = true;
    popover.anchor = anchor;
    if (anchor) anchor.setAttribute('data-popover-anchor', '');
    const target = anchor && anchor.closest('.menu') ? anchor.closest('.menu').querySelector('.menu-btn') : anchor;
    const r = (target && target.getBoundingClientRect().width ? target : $('#toolbar')).getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    p.style.left = clamp(r.left, 8, innerWidth - pr.width - 8) + 'px';
    p.style.top = clamp(r.bottom + 6, 8, innerHeight - pr.height - 8) + 'px';
  }

  function closePopover() {
    if (!popover.open) return;
    popover.el.hidden = true;
    popover.open = false;
    if (popover.anchor) popover.anchor.removeAttribute('data-popover-anchor');
    popover.anchor = null;
  }

  function colorPicker(kind, anchor) {
    const wrap = el('div', { class: 'color-pop' });
    const reset = el('button', { class: 'color-reset', type: 'button', onclick: () => { closePopover(); setColor(kind, null); } },
      kind === 'fore' ? _('Automatic') : _('No highlight'));
    const grid = el('div', { class: 'swatches', role: 'listbox', 'aria-label': kind === 'fore' ? _('Text color') : _('Highlight color') });
    for (const c of PALETTE) {
      grid.append(el('button', { class: 'swatch', type: 'button', title: c, 'aria-label': c, style: 'background:' + c, onclick: () => { closePopover(); setColor(kind, c); } }));
    }
    const custom = el('input', { type: 'color', value: (kind === 'fore' ? settings.lastFore : settings.lastBack) || '#2563eb', 'aria-label': _('Custom color') });
    custom.addEventListener('change', () => { closePopover(); setColor(kind, custom.value); });
    wrap.append(reset, grid, el('label', { class: 'custom-color' }, custom, el('span', {}, _('Custom color…'))));
    openPopover(anchor, wrap, 'pop-color');
  }

  function tablePicker(anchor) {
    const MAX = 10;
    const wrap = el('div', { class: 'grid-pop' });
    const label = el('div', { class: 'grid-label' }, _('Insert table'));
    const grid = el('div', { class: 'grid-cells', style: 'grid-template-columns: repeat(' + MAX + ', 18px)' });
    const cells = [];
    const mark = (r, c) => {
      cells.forEach((x) => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c));
      label.textContent = r + ' × ' + c + ' table';
    };
    for (let r = 1; r <= MAX; r++) {
      for (let c = 1; c <= MAX; c++) {
        const cell = el('button', { class: 'grid-cell', type: 'button', 'data-r': r, 'data-c': c, 'aria-label': r + ' by ' + c,
          onmouseenter: () => mark(r, c), onfocus: () => mark(r, c), onclick: () => { closePopover(); insertTable(r, c); } });
        cells.push(cell);
        grid.append(cell);
      }
    }
    wrap.append(grid, label);
    openPopover(anchor, wrap, 'pop-grid');
  }

  function symbolPicker(anchor) {
    const wrap = el('div', { class: 'sym-pop' });
    for (const s of SYMBOLS) wrap.append(el('button', { class: 'sym', type: 'button', title: s, onclick: () => { closePopover(); exec('insertText', s); } }, s));
    openPopover(anchor, wrap, 'pop-sym');
  }

  /* =========================================================== dialogs */

  function dialog({ title, body, actions, wide, onOpen, initial }) {
    return new Promise((resolve) => {
      closeMenus();
      closePopover();
      const d = el('dialog', { class: 'dialog' + (wide ? ' wide' : '') });
      const form = el('form', { method: 'dialog' });
      const head = el('header', { class: 'dlg-head' }, el('h2', {}, title),
        el('button', { class: 'icon-btn sm', type: 'button', 'data-icon': 'close', 'aria-label': _('Close'), onclick: () => d.close('') }));
      const main = el('div', { class: 'dlg-body' });
      if (typeof body === 'string') main.innerHTML = body; else if (body) main.append(body);
      const foot = el('footer', { class: 'dlg-foot' });
      for (const a of actions || [{ label: _('Close'), value: '' }]) {
        foot.append(el('button', { class: 'btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : ''), value: a.value, type: a.primary ? 'submit' : 'button',
          onclick: a.primary ? null : () => d.close(a.value) }, a.label));
      }
      form.append(head, main, foot);
      d.append(form);
      document.body.append(d);
      NpIcons.inject(d);
      d.addEventListener('close', () => {
        const v = d.returnValue;
        d.remove();
        resolve(v || null);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const primary = (actions || []).find((a) => a.primary);
        d.close(primary ? primary.value : 'ok');
      });
      d.showModal();
      if (onOpen) onOpen(d, main);
      const focusEl = initial ? main.querySelector(initial) : null;
      if (focusEl) { focusEl.focus(); if (focusEl.select) focusEl.select(); }
    });
  }

  async function confirmDialog(title, text, { ok = _('OK'), danger = false } = {}) {
    const v = await dialog({ title, body: el('p', { class: 'dlg-text' }, text), actions: [{ label: _('Cancel'), value: '' }, { label: ok, value: 'ok', primary: true, danger }] });
    return v === 'ok';
  }

  async function promptDialog(title, label, value, opts = {}) {
    const input = el('input', { type: opts.type || 'text', class: 'input', value: value || '', placeholder: opts.placeholder || '', min: opts.min, max: opts.max });
    const body = el('label', { class: 'field' }, el('span', {}, label), input);
    const v = await dialog({ title, body, actions: [{ label: _('Cancel'), value: '' }, { label: opts.ok || _('OK'), value: 'ok', primary: true }], initial: 'input' });
    return v === 'ok' ? input.value : null;
  }

  function radioGroup(name, options, value) {
    return el('div', { class: 'radios', role: 'radiogroup' }, options.map(([v, label]) =>
      el('label', { class: 'radio' }, el('input', { type: 'radio', name, value: String(v), checked: String(v) === String(value) }), el('span', {}, label))));
  }

  async function linkDialog(existing) {
    restoreSelection();
    const range = currentRange();
    const selected = existing ? existing.textContent : (getSelection().toString() || '');
    const textIn = el('input', { class: 'input', type: 'text', value: selected, placeholder: _('Text to show') });
    const urlIn = el('input', { class: 'input url-in', type: 'text', value: existing ? existing.getAttribute('href') : '', placeholder: _('https://example.com or name@example.com') });
    const body = el('div', { class: 'stack' },
      el('label', { class: 'field' }, el('span', {}, _('Text')), textIn),
      el('label', { class: 'field' }, el('span', {}, _('Link')), urlIn));
    const actions = [{ label: _('Cancel'), value: '' }];
    if (existing) actions.push({ label: _('Remove link'), value: 'remove' });
    actions.push({ label: existing ? _('Update') : _('Insert'), value: 'ok', primary: true });
    const v = await dialog({ title: existing ? _('Edit link') : _('Insert link'), body, actions, initial: '.url-in' });
    editor.focus({ preventScroll: true });
    if (range) { getSelection().removeAllRanges(); getSelection().addRange(range); }
    if (v === 'remove' && existing) { selectNode(existing, true); exec('unlink'); return; }
    if (v !== 'ok') return;
    let url = urlIn.value.trim();
    if (!url) return;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) url = 'mailto:' + url;
    else if (!/^[a-z][a-z0-9+.-]*:|^#|^\//i.test(url)) url = 'https://' + url;
    if (!NpSanitize.safeHref(url)) { toast(_('That link type is not allowed.')); return; }
    const text = textIn.value || url;
    if (existing) {
      const inner = text === existing.textContent ? existing.innerHTML : escapeHtml(text);
      replaceUndoable(existing, '<a href="' + escapeHtml(url) + '">' + inner + '</a>');
    } else if (selected && text === selected) {
      exec('createLink', url);
    } else {
      exec('insertHTML', '<a href="' + escapeHtml(url) + '">' + escapeHtml(text) + '</a>&nbsp;');
    }
  }

  async function pageSetupDialog() {
    if (!current) return;
    const s = docSettings();
    const font = el('select', { class: 'input' }, FONTS.map((f) => el('option', { value: f.key, selected: f.key === s.font }, f.label)));
    const size = el('select', { class: 'input' }, SIZES.map((n) => el('option', { value: n, selected: n === s.size }, n + ' pt')));
    const body = el('div', { class: 'stack' },
      el('div', { class: 'row2' },
        el('label', { class: 'field' }, el('span', {}, _('Font')), font),
        el('label', { class: 'field' }, el('span', {}, _('Size')), size)),
      el('div', { class: 'field' }, el('span', {}, _('Line spacing')), radioGroup('lh', LINE_HEIGHTS.map((n) => [n, n === 1 ? _('Single') : n === 2 ? _('Double') : String(n)]), s.lineHeight)),
      el('div', { class: 'field' }, el('span', {}, _('Paper size')), radioGroup('paper', Object.entries(PAPER).map(([k, v]) => [k, v.label]), s.paper)),
      el('div', { class: 'field' }, el('span', {}, _('Margins')), radioGroup('margins', Object.entries(MARGINS).map(([k, v]) => [k, v.label]), s.margins)),
      el('label', { class: 'toggle-row' }, el('span', {}, _('Use these settings for new documents')), el('input', { type: 'checkbox', class: 'switch', id: 'ps-default' })));
    const v = await dialog({ title: _('Page setup'), body, actions: [{ label: _('Cancel'), value: '' }, { label: _('Apply'), value: 'ok', primary: true }] });
    if (v !== 'ok') return;
    const next = {
      font: font.value, size: +size.value,
      lineHeight: +body.querySelector('input[name=lh]:checked').value,
      paper: body.querySelector('input[name=paper]:checked').value,
      margins: body.querySelector('input[name=margins]:checked').value
    };
    // a Word file's own margins stay unless another preset is chosen
    if (s.marginsIn && next.margins === s.margins) next.marginsIn = s.marginsIn;
    current.settings = next;
    if (body.querySelector('#ps-default').checked) { settings.defaults = Object.assign({}, next); saveSettings(); }
    applyDocSettings();
    markDirty();
  }

  async function goalDialog() {
    if (!current) return;
    const v = await promptDialog(_('Word goal'), _('Words to aim for in this document (0 turns it off)'), String(current.goal || ''), { type: 'number', min: 0, placeholder: _('e.g. 1000'), ok: _('Set goal') });
    if (v == null) return;
    current.goal = Math.max(0, parseInt(v, 10) || 0);
    markDirty();
    refreshMetrics();
  }

  function stats(text) {
    const words = (text.match(WORD_RE) || []).length;
    return {
      words,
      chars: text.replace(/\n/g, '').length,
      charsNoSpace: text.replace(/\s/g, '').length,
      paragraphs: text.split(/\n+/).filter((s) => s.trim()).length,
      sentences: (text.match(/[^.!?…\n]+[.!?…]+/g) || []).length || (words ? 1 : 0),
      read: words / 238,
      speak: words / 150
    };
  }

  const unit = (n, u) => new Intl.NumberFormat(LOC, { style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  function minutes(m) {
    if (m < 1) return unit(m * 60 < 1 ? 0 : Math.max(1, Math.round(m * 60)), 'second');
    if (m < 60) return unit(Math.round(m), 'minute');
    return unit(Math.floor(m / 60), 'hour') + ' ' + unit(Math.round(m % 60), 'minute');
  }

  function wordCountDialog() {
    const all = stats(plainText());
    const s = getSelection();
    const sel = selectionInEditor() && !s.isCollapsed ? stats(s.toString()) : null;
    const rows = [[_('Words'), 'words'], [_('Characters'), 'chars'], [_('Characters without spaces'), 'charsNoSpace'], [_('Paragraphs'), 'paragraphs'], [_('Sentences'), 'sentences']];
    const table = el('table', { class: 'stats' },
      el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, _('Document')), sel ? el('th', {}, _('Selection')) : null)),
      el('tbody', {}, rows.map(([label, k]) => el('tr', {}, el('td', {}, label), el('td', {}, fmtNum(all[k])), sel ? el('td', {}, fmtNum(sel[k])) : null)),
        el('tr', {}, el('td', {}, _('Reading time')), el('td', {}, minutes(all.read)), sel ? el('td', {}, minutes(sel.read)) : null),
        el('tr', {}, el('td', {}, _('Speaking time')), el('td', {}, minutes(all.speak)), sel ? el('td', {}, minutes(sel.speak)) : null)));
    dialog({ title: _('Word count'), body: table });
  }

  // Why a version was kept: stored in English, shown in the app's language.
  const REASONS = { 'Autosave': () => _('Autosave'), 'Before restoring': () => _('Before restoring'), 'Before replace all': () => _('Before replace all'),
    'Read before translating': () => _('Read before translating'), 'Saved by you': () => _('Saved by you') };
  const reasonText = (r) => (REASONS[r] ? REASONS[r]() : r);

  async function historyDialog() {
    if (!current) return;
    await saveNow();
    const list = await NpStore.listVersions(current.id);
    const preview = el('div', { class: 'hist-preview editor' }, el('p', { class: 'muted' }, list.length ? _('Pick a version to preview it.') : _('No earlier versions yet. A restore point is saved every 10 minutes while you write, and whenever you save.')));
    let chosen = null;
    const items = el('ul', { class: 'hist-list' }, list.map((v) => el('li', {},
      el('button', { type: 'button', class: 'hist-item', onclick: async (e) => {
        $$('.hist-item', items).forEach((b) => b.classList.remove('on'));
        e.currentTarget.classList.add('on');
        const full = await NpStore.getVersion(v.vid);
        chosen = full;
        preview.innerHTML = NpSanitize.html(full.html) || '<p class="muted">' + escapeHtml(_('(empty)')) + '</p>';
        restoreBtn.disabled = false;
      } }, el('strong', {}, fmtDate(v.time)), el('span', {}, reasonText(v.reason) + ' · ' + ago(v.time))))));
    const restoreBtn = el('button', { class: 'btn btn-primary', type: 'button', disabled: true, onclick: () => d && d.close('restore') });
    restoreBtn.textContent = _('Restore this version');
    let d = null;
    const body = el('div', { class: 'hist' }, items, preview);
    const p = dialog({ title: _('Version history'), body, wide: true, actions: [{ label: _('Close'), value: '' }], onOpen: (dlg) => { d = dlg; dlg.querySelector('.dlg-foot').prepend(restoreBtn); } });
    const v = await p;
    if (v === 'restore' && chosen) {
      await NpStore.addVersion(current.id, serialize(), displayTitle(current), 'Before restoring');
      editor.focus();
      selectNode(editor, true);
      document.execCommand('insertHTML', false, NpSanitize.html(chosen.html) || '<p><br></p>');
      afterEdit();
      await saveNow();
      toast(_('Version restored. Undo (Ctrl+Z) brings back what you had.'));
    }
  }

  function shortcutsDialog() {
    const k = (s) => s.split(' / ').map((x) => '<kbd>' + escapeHtml(isMac ? x.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧') : NpI18n.keys(x)) + '</kbd>').join(' ');
    const groups = [
      [_('Text'), [[_('Bold'), 'Ctrl+B'], [_('Italic'), 'Ctrl+I'], [_('Underline'), 'Ctrl+U'], [_('Strikethrough'), 'Ctrl+Shift+X'], [_('Inline code'), 'Ctrl+E'], [_('Superscript / subscript'), 'Ctrl+. / Ctrl+,'], [_('Link'), 'Ctrl+K'], [_('Clear formatting'), 'Ctrl+\\']]],
      [_('Paragraphs'), [[_('Normal text'), 'Ctrl+Alt+0'], [_('Heading 1–3'), 'Ctrl+Alt+1 / Ctrl+Alt+3'], [_('Numbered list'), 'Ctrl+Shift+7'], [_('Bulleted list'), 'Ctrl+Shift+8'], [_('Checklist'), 'Ctrl+Shift+9'], [_('Align left / center / right / justify'), 'Ctrl+Shift+L / Ctrl+Shift+E / Ctrl+Shift+R / Ctrl+Shift+J'], [_('Indent list item'), 'Tab / Shift+Tab'], [_('Page break'), 'Ctrl+Enter']]],
      [_('Document'), [[_('Save'), 'Ctrl+S'], [_('Save as'), 'Ctrl+Shift+S'], [_('Open a file'), 'Ctrl+O'], [_('New document'), 'Ctrl+Alt+N'], [_('Find / replace'), 'Ctrl+F / Ctrl+H'], [_('Print'), 'Ctrl+P'], [_('Word count'), 'Ctrl+Shift+C'], [_('Focus mode'), 'Ctrl+Shift+F'], [_('Paste without formatting'), 'Ctrl+Shift+V']]],
      [_('PDF tools (single keys, while a PDF is open)'), [[_('Select and move'), 'V'], [_('Edit the PDF’s text'), 'E'], [_('Add text'), 'T'], [_('Highlight'), 'H'], [_('White-out'), 'W'], [_('Draw'), 'D'], [_('Box'), 'B'], [_('Delete what is selected'), 'Delete'], [_('Nudge what is selected'), _('Arrow keys')]]],
      [_('Markdown shortcuts (type, then space)'), [[_('Heading 1, 2, 3'), '# / ## / ###'], [_('Bulleted list'), '- / *'], [_('Numbered list'), '1.'], [_('Checklist'), '[ ]'], [_('Quote'), '>'], [_('Code block'), '```'], [_('Horizontal line (then Enter)'), '---']]]
    ];
    const html = groups.map(([g, rows]) => '<h3>' + escapeHtml(g) + '</h3><table class="keys">' +
      rows.map(([a, b]) => '<tr><td>' + escapeHtml(a) + '</td><td>' + (g === groups[4][0] ? b.split(' / ').map((x) => '<code>' + escapeHtml(x) + '</code>').join(' ') : k(b)) + '</td></tr>').join('') + '</table>').join('');
    dialog({ title: _('Keyboard shortcuts'), body: el('div', { class: 'keys-wrap', html }), wide: true });
  }

  // What Noteshack does, shown when the site opens until someone ticks
  // "Don't show this again".
  const WELCOME_KEY = 'np.welcome';
  async function welcomeDialog() {
    try { if (localStorage.getItem(WELCOME_KEY) === 'hidden') return; } catch (e) { /* storage blocked: show it */ }
    const feature = (title, text) => el('li', {}, el('strong', {}, title), el('span', {}, text));
    const check = el('input', { type: 'checkbox', id: 'welcome-hide' });
    const body = el('div', { class: 'welcome' },
      el('p', { class: 'dlg-text' }, _('A word processor and PDF editor that runs right in your browser. Free, no account, nothing to install.')),
      el('ul', { class: 'welcome-list' },
        feature(_('Write anything'), _('Letters, notes, reports. It opens and saves Word files too.')),
        feature(_('Fix any PDF'), _('Click on the text and change it, and it stays in the original font. Fill in forms, sign, and add text, drawings or pages.')),
        feature(_('Edit scans'), _('Open a scanned page or a photo of one, and its words become text you can change, in letters that match the page.')),
        feature(_('Translate'), _('Turn a document or PDF into another language, layout and all.')),
        feature(_('Keep it to yourself'), _('Your documents stay on your computer, and it works offline.'))),
      el('label', { class: 'welcome-hide' }, check, el('span', {}, _('Don’t show this again'))));
    await dialog({ title: _('Welcome to Noteshack'), body, actions: [{ label: _('Get started'), value: 'ok', primary: true }] });
    try { if (check.checked) localStorage.setItem(WELCOME_KEY, 'hidden'); } catch (e) { /* ignore */ }
  }

  // Safari may delete what a site keeps in the browser after 7 days without
  // a visit, unless the site is installed as an app. Said once, with the
  // ways to keep documents safe; whether that matters is theirs to judge.
  const SAFARI_KEY = 'np.safari-note';
  async function safariNote() {
    const safari = /Apple/.test(navigator.vendor || '') && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    try { if (!safari || installed || localStorage.getItem(SAFARI_KEY)) return; localStorage.setItem(SAFARI_KEY, 'shown'); } catch (e) { return; }
    await dialog({
      title: _('Keeping your documents in Safari'),
      body: el('div', { class: 'stack' },
        el('p', { class: 'dlg-text' }, _('Noteshack keeps your documents in this browser. Safari may clear what a website keeps if you don\u2019t visit it for 7 days. Ways to keep them safe:')),
        el('ul', { class: 'welcome-list' },
          el('li', {}, el('strong', {}, _('Add Noteshack to your Dock or Home Screen')), el('span', {}, _('Installed, it is kept like any app. On a Mac: File \u2192 Add to Dock. On an iPhone or iPad: Share \u2192 Add to Home Screen.'))),
          el('li', {}, el('strong', {}, _('Save your documents as files')), el('span', {}, _('File \u2192 Save puts a copy in your Downloads.'))),
          el('li', {}, el('strong', {}, _('Back up now and then')), el('span', {}, _('File \u2192 Back up all documents saves everything in one file you can restore anywhere.'))))),
      actions: [{ label: _('Got it'), value: 'ok', primary: true }]
    });
  }

  // Tools → Report a problem: sent through Noteshack's service
  // (worker/index.js), which files it on Noteshack's GitHub, where it is
  // public. Only what is written here, the version, the browser and the
  // app's language go; nothing from any document.
  function browserName() {
    const ua = navigator.userAgent;
    // most particular first: Edge and Opera also say Chrome, Chrome also says Safari
    const b = ['Edg', 'OPR', 'FxiOS', 'Firefox', 'CriOS', 'Chrome', 'Version'].map((n) => ua.match(new RegExp('(' + n + ')/(\\d+)'))).find(Boolean) || [];
    const name = { Edg: 'Edge', OPR: 'Opera', FxiOS: 'Firefox', CriOS: 'Chrome', Version: 'Safari' }[b[1]] || b[1] || 'Unknown';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
    return (name + ' ' + (b[2] || '')).trim() + (os ? ' on ' + os : '');
  }

  async function reportDialog(draft = {}) {
    const what = el('textarea', { class: 'input', rows: 5, maxlength: 4000, 'aria-label': _('What went wrong?') });
    const steps = el('textarea', { class: 'input', rows: 3, maxlength: 4000, 'aria-label': _('What were you doing when it happened? (optional)') });
    what.value = draft.what || '';
    steps.value = draft.steps || '';
    // a field people never see: only a bot fills it in
    const trap = el('input', { type: 'text', name: 'website', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true', class: 'trap' });
    const sent = { version: APP_VERSION, browser: browserName(), lang: NpI18n.lang };
    const v = await dialog({
      title: _('Report a problem'),
      body: el('div', { class: 'stack' },
        draft.error ? el('p', { class: 'dlg-text', role: 'alert' }, draft.error) : null,
        el('p', { class: 'dlg-text' }, _('Something not working, or a translation that reads wrong? Tell us here. Reports are posted publicly on Noteshack’s GitHub page, so leave out anything personal and anything from your documents.')),
        el('label', { class: 'field' }, el('span', {}, _('What went wrong?')), what),
        el('label', { class: 'field' }, el('span', {}, _('What were you doing when it happened? (optional)')), steps),
        el('p', { class: 'dlg-text muted' }, _('Also sent: Noteshack {version}, {browser}, app language {lang}.', sent)),
        trap),
      actions: [{ label: _('Cancel'), value: '' }, { label: _('Send'), value: 'send', primary: true }],
      initial: 'textarea'
    });
    if (v !== 'send') return;
    const again = (error) => reportDialog({ what: what.value, steps: steps.value, error });
    if (what.value.trim().length < 10) return again(_('Say a little more about what went wrong.'));
    toast(_('Sending…'), 20000);
    let res = null, body = null;
    try {
      res = await fetch('https://api.noteshack.org/report', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
        body: JSON.stringify(Object.assign({ what: what.value, steps: steps.value, website: trap.value }, sent))
      });
      body = await res.json();
    } catch (e) { /* below */ }
    toast('', 1);
    if (!res || !res.ok || !body) {
      return again(res && res.status === 429 ? _('Too many reports at once. Wait a minute and send it again.')
        : res ? _('The report could not be sent ({status}). Try again in a moment.', { status: res.status })
          : _('The report could not be sent. Check your connection and try again.'));
    }
    await dialog({
      title: _('Thank you'),
      body: el('div', { class: 'stack' },
        el('p', { class: 'dlg-text' }, _('Your report was sent.')),
        body.url ? el('p', { class: 'dlg-text' }, el('a', { href: body.url, target: '_blank', rel: 'noopener noreferrer' }, _('See it on GitHub'))) : null)
    });
  }

  // the downloaded files kept in the browser (Cache Storage): translation
  // models, the Noto fonts for other scripts, and fonts PDFs name; each is
  // downloaded again when it is next needed
  const DOWNLOADS = ['np-translate-v1', 'np-fonts-noto-v1', 'np-fonts-v1'];
  async function downloadsSize() {
    let n = 0;
    if (typeof caches === 'undefined') return n;
    for (const name of DOWNLOADS) {
      if (!(await caches.has(name))) continue;
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        if (res) n += (await res.blob()).size;
      }
    }
    return n;
  }
  const mbOf = (bytes) => (bytes / 1048576).toLocaleString(LOC, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  async function storageDialog() {
    const usedLine = el('li', {});
    const showUsage = async () => {
      let usage = '';
      try {
        if (navigator.storage && navigator.storage.estimate) usage = _('{size} MB used', { size: mbOf((await navigator.storage.estimate()).usage) });
      } catch (e) { /* not available */ }
      usedLine.textContent = _n(docs.length, '{n} document', '{n} documents') + (usage ? ' · ' + usage : '');
    };
    await showUsage();
    let persisted = false;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { /* not available */ }
    let downloaded = 0;
    try { downloaded = await downloadsSize(); } catch (e) { /* not available */ }
    const downloadsLine = el('li', { class: 'downloads' });
    const showDownloads = () => {
      downloadsLine.replaceChildren(downloaded ? _('Downloaded translation models and fonts: {size} MB', { size: mbOf(downloaded) }) : _('No translation models or fonts are downloaded.'));
      if (downloaded) {
        downloadsLine.append(' ', el('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
          for (const name of DOWNLOADS) { try { await caches.delete(name); } catch (e) { /* already gone */ } }
          downloaded = 0;
          showDownloads();
          await showUsage();
          toast(_('Removed. They download again when needed.'));
        } }, _('Remove')));
      }
    };
    showDownloads();
    const body = el('div', { class: 'stack about' },
      el('ul', { class: 'facts' },
        usedLine,
        el('li', {}, NpStore.persistent ? (persisted ? _('Storage is marked persistent: the browser will not clear it to free space.') : _('Storage is “best effort”: a browser short on disk space may clear it. Back up anything important.')) : _('This browser is not allowing storage (private window?). Work is kept only until you close the tab.')),
        downloadsLine),
      el('p', { class: 'muted' }, _('Your documents are kept. Translation models and fonts download again the first time they are needed.')),
      el('p', { class: 'muted' }, _('Tip: File → Back up all documents saves everything to one file you can restore on another computer.')));
    dialog({ title: _('Storage'), body });
  }

  // Updates. Opening the page always gets the newest release (sw.js fetches
  // the app's files fresh when online), so nothing is checked then; a tab
  // left open asks every hour, or when "Check for updates" is pressed. The
  // release is the number in sw.js's CACHE, which APP_VERSION ends with.
  const RELEASE = Number(APP_VERSION.split('-').pop());
  async function newestRelease() {
    const res = await fetch('sw.js', { cache: 'no-store' });
    const m = res.ok && (await res.text()).match(/const CACHE = 'noteshack-v(\d+)'/);
    if (!m) throw new Error('no release');
    return Number(m[1]);
  }
  async function reloadForUpdate() {
    if (dirty) await saveNow();
    location.reload();
  }
  let updateShown = false;
  async function checkForUpdate() {
    if (updateShown || !navigator.onLine) return;
    let newest;
    try { newest = await newestRelease(); } catch (e) { return; }
    if (newest <= RELEASE || updateShown) return;
    updateShown = true;
    const note = el('div', { class: 'update-note', role: 'status' },
      el('span', {}, _('A new version of Noteshack is ready.')),
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: reloadForUpdate }, _('Reload')),
      el('button', { class: 'icon-btn sm', type: 'button', 'data-icon': 'close', 'aria-label': _('Close'), onclick: () => note.remove() }));
    document.body.append(note);
    NpIcons.inject(note);
  }

  // About's "Check for updates": says what it found, in its place
  function updateButton() {
    const out = el('span', { class: 'update-result' });
    const btn = el('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
      btn.disabled = true;
      out.replaceChildren(_('Checking…'));
      let newest;
      try { newest = await newestRelease(); } catch (e) { newest = null; }
      btn.disabled = false;
      if (newest == null) out.replaceChildren(_('Could not check. Are you online?'));
      else if (newest <= RELEASE) out.replaceChildren(_('You have the newest version.'));
      else out.replaceChildren(_('A new version of Noteshack is ready.'), ' ', el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: reloadForUpdate }, _('Reload')));
    } }, _('Check for updates'));
    return el('span', {}, btn, ' ', out);
  }

  async function aboutDialog() {
    const body = el('div', { class: 'stack about' },
      el('p', {}, _('Noteshack is a word processor and PDF editor that runs entirely in your browser. Your documents are stored on this device, in this browser, and are never uploaded.')),
      el('ul', { class: 'facts' },
        el('li', {}, _('Works offline once loaded, and can be installed as an app from your browser’s menu.')),
        el('li', { class: 'update-line' }, _('Version {version}', { version: APP_VERSION }), ' ', updateButton())),
      el('details', { class: 'about-more' }, el('summary', {}, _('Privacy')),
        el('p', {}, _('There is no account, no ads and no cookies. Your documents and PDFs never leave this device, unless you choose to translate one online.')),
        el('p', {}, _('Three things are fetched from the internet. When a PDF names an uncommon font (the common ones come from Noteshack itself), the font file is downloaded from the free Fontsource library through jsDelivr (cdn.jsdelivr.net), which, like any website, sees your IP address but nothing from your document. Pictures in your documents that link to a web address are loaded from that address. And from Noteshack’s own file storage (files.noteshack.org), kept in this browser once downloaded: the model for two languages the first time you translate between them, and the font for a script (Arabic, Chinese, Hindi and others) the first time a PDF needs it. Your text is translated, and written into PDFs, on this device. The online translator, only when you choose it in Translate, sends the text to Noteshack’s translation service on Cloudflare (api.noteshack.org), which translates it with Workers AI and sends it back, keeping nothing. A problem report, when you send one (Tools → Report a problem), goes the same way to Noteshack’s GitHub page, where it is public: only what you write, the app’s version, your browser and the app’s language.'))),
      el('details', { class: 'about-more' }, el('summary', {}, _('Disclaimer')),
        el('p', {}, _('Noteshack is provided as is, without warranty of any kind. Text recognition, translation and font matching can be wrong: check a document before you send, submit or sign it. Keep backups of anything important.')),
        el('p', {}, _('You are responsible for the documents you change. Do not alter a document in a way that misleads anyone, such as a form or record someone else filled in or signed.'))),
      el('details', { class: 'about-more' }, el('summary', {}, _('Credits and licenses')),
        el('ul', { class: 'facts' },
          el('li', {}, _('PDF.js (Mozilla), Apache License 2.0: shows PDF pages')),
          el('li', {}, _('pdf-lib and @pdf-lib/fontkit, MIT License: write PDFs')),
          el('li', {}, _('Tesseract.js, Tesseract OCR and its language data, Apache License 2.0: read text on scans')),
          el('li', {}, _('opentype.js, MIT License: builds fonts from a scan’s letters')),
          el('li', {}, _('UTIF.js and pako, MIT License: read TIFF images')),
          el('li', {}, _('Hunspell (MPL 1.1) with Hunspell dictionaries, each under its own license: spell checking')),
          el('li', {}, _('franc, MIT License: tells which language a text is in')),
          el('li', {}, _('Bergamot, Firefox’s translation engine, and Mozilla’s translation models, Mozilla Public License 2.0: translation')),
          el('li', {}, _('HarfBuzz (Old MIT) as harfbuzzjs (MIT License): shapes text in any script for saved PDFs, and cuts fonts down to the letters used')),
          el('li', {}, _('bidi-js, MIT License: puts right-to-left and left-to-right text in order')),
          el('li', {}, _('Noto fonts (Google), SIL Open Font License 1.1: text in scripts other fonts lack')),
          el('li', {}, _('Fonts from Fontsource, each under its own free license (SIL Open Font License or Apache License 2.0); fonts made from a scan are changed copies, renamed as the Open Font License asks'))),
        el('p', {}, _('Noteshack’s own code is released under the MIT License. The full license texts are in the app’s source: LICENSE, and the vendor folder for each library.'))),
      el('details', { class: 'about-more' }, el('summary', {}, _('Trademarks')),
        el('p', {}, _('Adobe, Acrobat and ClearScan are trademarks of Adobe. Microsoft, Word and Calibri are trademarks of Microsoft. Arial and Times New Roman are trademarks of The Monotype Corporation. They are named only to describe compatibility; Noteshack is not affiliated with or endorsed by them.'))));
    dialog({ title: _('About Noteshack'), body });
  }

  async function editAlt(img) {
    const v = await promptDialog(_('Alt text'), _('Describe the image for screen readers and when it cannot load'), img.getAttribute('alt') || '');
    if (v == null) return;
    setImage(img, (c) => c.setAttribute('alt', v));
  }

  async function imageUrlDialog() {
    restoreSelection();
    const range = currentRange();
    const v = await promptDialog(_('Image from a link'), _('Image address (https://…)'), '', { placeholder: 'https://example.com/picture.jpg', ok: _('Insert') });
    if (!v) return;
    if (!/^https?:\/\//i.test(v.trim())) { toast(_('Use an address starting with https://')); return; }
    editor.focus();
    if (range) { getSelection().removeAllRanges(); getSelection().addRange(range); }
    exec('insertHTML', '<img src="' + escapeHtml(v.trim()) + '" alt="">');
  }

  function voiceDialog() {
    if (!('speechSynthesis' in window)) { toast(_('This browser cannot read text aloud.')); return; }
    const voices = speechSynthesis.getVoices();
    const select = el('select', { class: 'input' }, el('option', { value: '' }, _('Default voice')),
      voices.map((v) => el('option', { value: v.name, selected: v.name === settings.voice }, v.name + ' (' + v.lang + ')')));
    const rate = el('input', { type: 'range', min: '0.5', max: '2', step: '0.1', value: String(settings.rate) });
    const rateLabel = el('span', { class: 'muted' }, settings.rate.toFixed(1) + '×');
    rate.addEventListener('input', () => { rateLabel.textContent = (+rate.value).toFixed(1) + '×'; });
    const body = el('div', { class: 'stack' },
      el('label', { class: 'field' }, el('span', {}, _('Voice')), select),
      el('label', { class: 'field' }, el('span', {}, _('Speed'), ' ', rateLabel), rate));

    dialog({ title: _('Voice settings'), body, actions: [{ label: _('Cancel'), value: '' }, { label: _('Save'), value: 'ok', primary: true }] }).then((v) => {
      if (v !== 'ok') return;
      settings.voice = select.value;
      settings.rate = +rate.value;
      saveSettings();
    });
  }

  /* =========================================================== find & replace */

  const findState = { open: false, ranges: [], texts: [], cur: -1 };
  const findQ = $('#find-q');
  const findR = $('#find-r');
  const hasHighlights = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

  function openFind(replace) {
    const s = getSelection();
    const selText = selectionInEditor() && !s.isCollapsed ? s.toString() : '';
    $('#find').hidden = false;
    $('#find').classList.toggle('with-replace', !!replace || !!findR.value);
    findState.open = true;
    if (selText && !selText.includes('\n') && selText.length < 200) findQ.value = selText;
    const target = replace && findQ.value ? findR : findQ;
    target.focus();
    target.select();
    runFind(true);
  }

  function closeFind(focusDoc) {
    if (!findState.open) return;
    $('#find').hidden = true;
    findState.open = false;
    const r = findState.ranges[findState.cur];
    clearFindHighlights();
    if (focusDoc) {
      editor.focus({ preventScroll: true });
      if (r) { getSelection().removeAllRanges(); getSelection().addRange(r); }
    }
    findState.ranges = [];
  }

  function clearFindHighlights() {
    if (!hasHighlights) return;
    CSS.highlights.delete('np-find');
    CSS.highlights.delete('np-find-cur');
  }

  function findRegex(global) {
    const q = findQ.value;
    if (!q) return null;
    let src = $('#find-regex').checked ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if ($('#find-word').checked) src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])';
    try {
      return new RegExp(src, (global ? 'g' : '') + ($('#find-case').checked ? '' : 'i') + 'u');
    } catch (e) {
      return false;
    }
  }

  function runFind(resetCursor) {
    if (!findState.open) return;
    const re = findRegex(true);
    findState.ranges = [];
    findState.texts = [];
    const count = $('#find-count');
    if (!re) {
      clearFindHighlights();
      count.textContent = re === false ? _('Bad pattern') : '';
      count.classList.toggle('bad', re === false);
      return;
    }
    count.classList.remove('bad');
    const idx = textIndex();
    let m;
    while ((m = re.exec(idx.text)) && findState.ranges.length < 5000) {
      if (!m[0]) { re.lastIndex++; continue; }
      const r = idx.range(m.index, m.index + m[0].length);
      if (r) { findState.ranges.push(r); findState.texts.push(m[0]); }
    }
    const n = findState.ranges.length;
    if (resetCursor || findState.cur >= n) {
      // start at the first match after the caret
      findState.cur = -1;
      if (n && savedRange) {
        const at = findState.ranges.findIndex((r) => r.compareBoundaryPoints(Range.START_TO_START, savedRange) >= 0);
        findState.cur = at;
      }
      if (findState.cur < 0 && n) findState.cur = 0;
    }
    paintFind();
  }

  const scheduleFind = debounce(() => runFind(false), 200);
  findQ.addEventListener('input', debounce(() => runFind(true), 120));
  ['find-case', 'find-word', 'find-regex'].forEach((id) => $('#' + id).addEventListener('change', () => runFind(true)));

  function paintFind() {
    const n = findState.ranges.length;
    $('#find-count').textContent = findQ.value ? (n ? _('{at} of {total}', { at: findState.cur + 1, total: fmtNum(n) + (n >= 5000 ? '+' : '') }) : _('No results')) : '';
    if (!hasHighlights) return;
    CSS.highlights.set('np-find', new Highlight(...findState.ranges));
    const cur = findState.ranges[findState.cur];
    if (cur) {
      CSS.highlights.set('np-find-cur', new Highlight(cur));
      scrollRangeIntoView(cur);
    } else CSS.highlights.delete('np-find-cur');
  }

  function scrollRangeIntoView(r) {
    const rect = r.getBoundingClientRect();
    const ws = workspace.getBoundingClientRect();
    if (!rect.height && !rect.width) return;
    if (rect.top < ws.top + 60 || rect.bottom > ws.bottom - 40) workspace.scrollTop += rect.top - ws.top - ws.height / 3;
  }

  function findStep(dir) {
    if (!findState.open) { openFind(false); return; }
    const n = findState.ranges.length;
    if (!n) return;
    findState.cur = (findState.cur + dir + n) % n;
    paintFind();
    if (!hasHighlights) {
      const r = findState.ranges[findState.cur];
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }
  }

  findQ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
  });
  findR.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (mod(e) && e.altKey) replaceAll(); else replaceOne(); }
  });
  findR.addEventListener('focus', () => $('#find').classList.add('with-replace'));

  function replacementFor(text) {
    const rep = findR.value;
    if (!$('#find-regex').checked) return rep;
    const re = findRegex(false);
    return re ? text.replace(re, rep) : rep;
  }

  function replaceOne() {
    const r = findState.ranges[findState.cur];
    if (!r) { runFind(true); return; }
    const text = replacementFor(findState.texts[findState.cur]);
    editor.focus({ preventScroll: true });
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    if (text) document.execCommand('insertText', false, text); else document.execCommand('delete');
    afterEdit();
    runFind(false);
    paintFind();
    findR.focus();
  }

  async function replaceAll() {
    runFind(false);
    const n = findState.ranges.length;
    if (!n) return;
    await saveNow('Before replace all');
    editor.focus({ preventScroll: true });
    for (let i = n - 1; i >= 0; i--) {
      const text = replacementFor(findState.texts[i]);
      getSelection().removeAllRanges();
      getSelection().addRange(findState.ranges[i]);
      if (text) document.execCommand('insertText', false, text); else document.execCommand('delete');
    }
    afterEdit();
    runFind(true);
    findR.focus();
    toast(_n(n, 'Replaced {n} match', 'Replaced {n} matches'));

  }

  /* =========================================================== images */

  let selectedImage = null;
  const frame = $('#img-frame');

  function selectImage(img) {
    selectedImage = img;
    selectNode(img);
    positionImageFrame();
    frame.hidden = false;
    updateCtxBar();
  }

  function hideImageFrame() {
    if (!selectedImage) return;
    selectedImage = null;
    frame.hidden = true;
    updateCtxBar();
  }

  function positionImageFrame() {
    if (!selectedImage) return;
    if (!editor.contains(selectedImage)) { hideImageFrame(); return; }
    const r = selectedImage.getBoundingClientRect();
    const ws = workspace.getBoundingClientRect();
    frame.style.left = (r.left - ws.left + workspace.scrollLeft) + 'px';
    frame.style.top = (r.top - ws.top + workspace.scrollTop) + 'px';
    frame.style.width = r.width + 'px';
    frame.style.height = r.height + 'px';
  }
  window.addEventListener('resize', () => { positionImageFrame(); });

  $('#img-handle').addEventListener('pointerdown', (e) => {
    if (!selectedImage) return;
    e.preventDefault();
    const img = selectedImage;
    const start = img.getBoundingClientRect();
    const ratio = start.height / start.width;
    const x0 = e.clientX;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let w = start.width;
    const move = (ev) => {
      w = Math.max(24, start.width + (ev.clientX - x0));
      frame.style.width = w + 'px';
      frame.style.height = w * ratio + 'px';
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      const er = editor.getBoundingClientRect();
      const scale = er.width / editor.offsetWidth || 1;
      const cs = getComputedStyle(editor);
      const contentW = (editor.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * scale;
      const pct = clamp(Math.round((w / contentW) * 100), 5, 100);
      setImage(img, (c) => { c.style.width = pct + '%'; });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });

  function setImage(img, change) {
    const clone = img.cloneNode(false);
    change(clone);
    const tok = uid();
    clone.setAttribute('data-np-t', tok);
    const next = replaceUndoable(img, clone.outerHTML, 'img[data-np-t="' + tok + '"]');
    if (next) {
      if (next.complete) selectImage(next); else next.addEventListener('load', () => selectImage(next), { once: true });
    } else hideImageFrame();
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  // Large photos are scaled down so a document stays light enough to save.
  async function prepareImage(file) {
    if (file.type === 'image/gif' || (file.size < 300 * 1024 && /^image\/(png|jpeg)$/.test(file.type))) return readAsDataURL(file);
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error(_('That image could not be read.')));
        i.src = url;
      });
      const max = 1800;
      const w0 = img.naturalWidth || 800;
      const h0 = img.naturalHeight || 600;
      const scale = Math.min(1, max / Math.max(w0, h0));
      const c = document.createElement('canvas');
      c.width = Math.round(w0 * scale);
      c.height = Math.round(h0 * scale);
      const ctx = c.getContext('2d');
      const png = file.type === 'image/png' || file.type === 'image/svg+xml';
      if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function insertImageFile(file) {
    try {
      const src = await prepareImage(file);
      const alt = file.name ? file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') : '';
      exec('insertHTML', '<img src="' + src + '" alt="' + escapeHtml(alt) + '">');
    } catch (e) {
      toast(e.message || _('That image could not be added.'));
    }
  }

  $('#file-image').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) insertImageFile(f);
  });

  workspace.addEventListener('scroll', () => { if (selectedImage) positionImageFrame(); }, { passive: true });

  /* =========================================================== tables */

  function insertTable(rows, cols) {
    let html = '<table><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) html += r === 0 && rows > 1 ? '<th><br></th>' : '<td><br></td>';
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    exec('insertHTML', html);
    const tables = $$('table', editor);
    const s = getSelection();
    const near = tables.find((t) => s.rangeCount && t.compareDocumentPosition(s.getRangeAt(0).startContainer) & Node.DOCUMENT_POSITION_FOLLOWING && t.nextElementSibling && t.nextElementSibling.contains(s.getRangeAt(0).startContainer));
    const t = near || tables[tables.length - 1];
    if (t && t.rows[0]) caretTo(t.rows[0].cells[0]);
  }

  function emptyCell(tag) { return '<' + tag + '><br></' + tag + '>'; }

  function tableOp(op) {
    const cell = closestInEditor('td,th');
    if (!cell) return;
    const table = cell.closest('table');
    if (op === 'del-table') { selectNode(table); exec('delete'); return; }
    const rIdx = cell.parentElement.rowIndex;
    const cIdx = cell.cellIndex;
    const clone = table.cloneNode(true);
    const rows = Array.from(clone.rows);
    const row = rows[rIdx];
    let target = [rIdx, cIdx];
    if (op === 'row-above' || op === 'row-below') {
      const n = Array.from(row.cells).reduce((s, c) => s + (c.colSpan || 1), 0);
      const nr = document.createElement('tr');
      nr.innerHTML = Array(n).fill(emptyCell('td')).join('');
      if (op === 'row-above' && rIdx === 0 && row.cells[0].tagName === 'TH') {
        // a row above the header row becomes the new header
        nr.innerHTML = Array(n).fill(emptyCell('th')).join('');
        row.innerHTML = Array.from(row.cells).map((c) => '<td' + (c.colSpan > 1 ? ' colspan="' + c.colSpan + '"' : '') + '>' + c.innerHTML + '</td>').join('');
      }
      row.parentNode.insertBefore(nr, op === 'row-above' ? row : row.nextSibling);
      target = [op === 'row-above' ? rIdx : rIdx + 1, Math.min(cIdx, n - 1)];
    } else if (op === 'col-left' || op === 'col-right') {
      for (const r of rows) {
        const ref = r.cells[Math.min(cIdx, r.cells.length - 1)];
        const tag = ref ? ref.tagName.toLowerCase() : 'td';
        const tmp = document.createElement('tr');
        tmp.innerHTML = emptyCell(tag);
        const nc = tmp.firstChild;
        if (!ref) r.appendChild(nc);
        else r.insertBefore(nc, op === 'col-left' ? ref : ref.nextSibling);
      }
      target = [rIdx, op === 'col-left' ? cIdx : cIdx + 1];
    } else if (op === 'del-row') {
      if (rows.length <= 1) { selectNode(table); exec('delete'); return; }
      row.remove();
      target = [Math.min(rIdx, rows.length - 2), cIdx];
    } else if (op === 'del-col') {
      if (rows.every((r) => r.cells.length <= 1)) { selectNode(table); exec('delete'); return; }
      for (const r of rows) if (r.cells[cIdx]) r.cells[cIdx].remove();
      target = [rIdx, Math.max(0, cIdx - 1)];
    } else if (op === 'header') {
      const first = rows[0];
      const toTag = first.cells[0] && first.cells[0].tagName === 'TH' ? 'td' : 'th';
      first.innerHTML = Array.from(first.cells).map((c) => '<' + toTag + (c.colSpan > 1 ? ' colspan="' + c.colSpan + '"' : '') + '>' + c.innerHTML + '</' + toTag + '>').join('');
    }
    const tok = uid();
    clone.setAttribute('data-np-t', tok);
    const next = replaceUndoable(table, clone.outerHTML, 'table[data-np-t="' + tok + '"]');
    if (next) {
      const r = next.rows[clamp(target[0], 0, next.rows.length - 1)];
      const c = r && r.cells[clamp(target[1], 0, r.cells.length - 1)];
      if (c) caretTo(c, true);
    }
    updateCtxBar();
  }

  function moveCell(cell, dir) {
    const table = cell.closest('table');
    const cells = $$('th,td', table).filter((c) => c.closest('table') === table);
    const i = cells.indexOf(cell);
    const next = cells[i + dir];
    if (next) { selectNode(next, true); return; }
    if (dir > 0) {
      caretTo(cells[cells.length - 1], true);
      tableOp('row-below');
      const row = closestInEditor('tr');
      if (row && row.cells[0]) caretTo(row.cells[0]);
    }
  }

  /* =========================================================== files */

  function safeFileName(name, ext) {
    const base = String(name || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'document';
    return base + '.' + ext;
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  function exportCss() {
    const s = docSettings();
    return [
      'body{margin:0;background:#f3f4f6;color:#1f2328;font-family:' + fontByKey(s.font).css + ';font-size:' + s.size + 'pt;line-height:' + s.lineHeight + '}',
      'article{box-sizing:border-box;max-width:' + PAPER[s.paper].w + ';margin:24px auto;padding:' + marginCss(s) + ';background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1);white-space:pre-wrap;overflow-wrap:break-word}',
      '@media (max-width:700px){article{margin:0;padding:20px}}',
      '@media print{body{background:#fff}article{box-shadow:none;margin:0;padding:0;max-width:none}}',
      '@page{size:' + PAPER[s.paper].css + ';margin:' + marginCss(s) + '}',
      'p{margin:0}h1,h2,h3,h4{line-height:1.25;margin:.9em 0 .35em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}',
      'blockquote{margin:.6em 0;padding:.1em 0 .1em 1em;border-left:3px solid #c9ced6;color:#4b5563}',
      'pre{background:#f3f4f6;padding:.8em 1em;border-radius:6px;font-family:"Courier New",monospace;font-size:.9em;white-space:pre-wrap}',
      'code{background:#f3f4f6;padding:.1em .3em;border-radius:4px;font-family:"Courier New",monospace;font-size:.92em}',
      'table{border-collapse:collapse;width:100%;margin:.6em 0}th,td{border:1px solid #c9ced6;padding:.35em .6em;vertical-align:top;text-align:left}th{background:#f2f3f5}',
      'img{max-width:100%;height:auto}img.img-center{display:block;margin:.5em auto}img.img-left{float:left;margin:.2em 1em .5em 0}img.img-right{float:right;margin:.2em 0 .5em 1em}',
      'ul.checklist{list-style:none;padding-left:.2em}ul.checklist>li::before{content:"☐ "}ul.checklist>li[data-checked="true"]::before{content:"☑ "}ul.checklist>li[data-checked="true"]{text-decoration:line-through;color:#6b7280}',
      'hr{border:0;border-top:1px solid #c9ced6;margin:1em 0}hr.page-break{border:0;break-after:page;margin:0}',
      'a{color:#1155cc}'
    ].join('\n');
  }

  /* ----- saving to files: Save and Save as ----- */

  // Chrome and Edge on a computer let a page write to a file on disk (the
  // File System Access API): Save as shows the system's own Save dialog, and
  // Save writes straight back to the file a document was opened from or last
  // saved as. Other browsers let no page write to disk, so there both put a
  // copy in Downloads. Either way the document itself is kept in Noteshack.
  const canWriteFiles = () => typeof window.showSaveFilePicker === 'function';

  // Each document's file on disk, for this visit: { handle, kind, name,
  // imported }. Not kept past a reload (Chromium can crash reading a stored
  // file link back), so the first Save of a visit asks where again, in the
  // same folder with the same name.
  const fileLinks = new Map();

  const KINDS = {
    docx: { ext: 'docx', exts: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: _('Word document') },
    md: { ext: 'md', exts: ['md', 'markdown'], mime: 'text/markdown', label: _('Markdown') },
    html: { ext: 'html', exts: ['html', 'htm'], mime: 'text/html', label: _('Web page') },
    txt: { ext: 'txt', exts: ['txt', 'text'], mime: 'text/plain', label: _('Plain text') },
    pdf: { ext: 'pdf', exts: ['pdf'], mime: 'application/pdf', label: 'PDF' }
  };
  const kindInfo = (kind) => KINDS[kind] || NpImages.kind(kind);

  // what a file is, as something Noteshack can save back to
  function kindOfFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    for (const [k, v] of Object.entries(KINDS)) if (v.exts.includes(ext)) return k;
    return NpImages.formatOf(file);
  }

  // Save as keeps a document what it is: one written here can be any of the
  // kinds that hold writing (Word first), a PDF stays a PDF, an image its own
  // type. Turning it into something else is Export, which makes a separate
  // file and leaves Save going where it went.
  function saveKinds(doc) {
    if (doc.type === 'pdf') return [ownKind(doc)];
    const own = ownKind(doc);
    return [own, ...['docx', 'html', 'md', 'txt'].filter((k) => k !== own)];
  }
  function exportKinds(doc) {
    if (doc.type !== 'pdf') return ['pdf'];
    const own = ownKind(doc);
    return ['pdf', 'docx', 'txt', 'jpeg', 'png', 'webp', 'tiff', 'bmp'].filter((k) => k !== own);
  }

  // what Save writes when there is no file yet: what the document came as
  const ownKind = (doc) => (fileLinks.has(doc.id) && fileLinks.get(doc.id).kind) || doc.kind || (doc.type === 'pdf' ? (doc.origin ? doc.origin.format : 'pdf') : 'docx');

  // The document as a file of a kind: { blob, filename, zip, fellBack }
  async function makeFile(doc, kind) {
    const name = displayTitle(doc);
    const info = kindInfo(kind);
    const out = (blob) => ({ blob, filename: safeFileName(name, info.ext) });
    if (doc.type === 'pdf') {
      const pdf = await NpPdf.export(doc);
      if (kind === 'pdf') return out(pdf);
      // text and Word: the words of the saved PDF, read back (so edits, and
      // what was read from scans, are in it), as paragraphs and headings
      if (kind === 'txt' || kind === 'docx') {
        const pages = await pdfParagraphs(pdf);
        if (kind === 'txt') return out(new Blob([pages.map((pg) => pg.map((q) => q.runs.map((r) => r.text).join('')).join('\n\n')).join('\n\n\n').trim() + '\n'], { type: 'text/plain;charset=utf-8' }));
        const root = document.createElement('div');
        root.innerHTML = pages.map((pg) => pg.map((q) => '<' + q.tag + '>' + q.runs.map((r) => (r.bold ? '<b>' + escapeHtml(r.text) + '</b>' : escapeHtml(r.text))).join('') + '</' + q.tag + '>').join('')).join('<hr class="page-break">');
        return out(await NpDocx.export(root, { title: name, fontCss: fontByKey('arial').css, size: 11, lineHeight: 1.15, page: 'letter', margins: 'normal', lang: docLang(doc) }));
      }
      // images: a picture of each page, at the image's own resolution or 200 dpi
      const img = await NpImages.fromPdf(pdf, { format: kind, dpi: (doc.origin && doc.origin.dpi) || [200] }, name, safeFileName);
      return Object.assign(img, { zip: img.blob.type === 'application/zip' });
    }
    if (kind === 'txt') return out(new Blob([textIndex(true).text.replace(/\n{3,}/g, '\n\n').trim() + '\n'], { type: 'text/plain;charset=utf-8' }));
    if (kind === 'md') return out(new Blob([NpMarkdown.fromDom(editor)], { type: 'text/markdown;charset=utf-8' }));
    if (kind === 'html') {
      return out(new Blob(['<!DOCTYPE html>\n<html lang="' + docLang(doc) + '"' + (NpLang.isRtl(docLang(doc)) ? ' dir="rtl"' : '') + '>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + escapeHtml(name) +
        '</title>\n<style>\n' + exportCss() + '\n</style>\n</head>\n<body>\n<article>' + unmarked(serialize()) + '</article>\n</body>\n</html>\n'], { type: 'text/html;charset=utf-8' }));
    }
    const s = docSettings();
    return out(await NpDocx.export(editor, { title: name, fontCss: fontByKey(s.font).css, size: s.size, lineHeight: s.lineHeight, page: s.paper, margins: s.margins, marginsIn: s.marginsIn, lang: docLang(doc) }));
  }

  // A PDF's words as paragraphs, page by page: [[{ tag, runs: [{ text, bold }] }]].
  // Lines join into a paragraph until a gap or a change of size; large text
  // becomes a heading.
  async function pdfParagraphs(pdfBlob) {
    const view = await NpPdf.view(pdfBlob);
    const pages = [];
    try {
      for (let i = 0; i < view.count; i++) {
        const page = await view.page(i);
        const tc = await page.getTextContent();
        // the fonts' real names (for bold) are known once the page's drawing is read
        try { await page.getOperatorList(); } catch (e) { /* ignore */ }
        const fontName = (id) => { try { const f = page.commonObjs.get(id); return (f && f.name) || ''; } catch (e) { return ''; } };
        const lines = [];
        let line = null;
        for (const it of tc.items) {
          if (!line) line = { runs: [], y: it.transform[5], size: 0 };
          if (it.str) {
            const size = Math.hypot(it.transform[2], it.transform[3]);
            line.size = Math.max(line.size, size);
            line.runs.push({ text: it.str, bold: /bold|black|heavy|semibold|demi/i.test(fontName(it.fontName)) });
          }
          if (it.hasEOL) { if (line.runs.length) lines.push(line); line = null; }
        }
        if (line && line.runs.length) lines.push(line);
        // the body text's size: the one most of the words are set in
        const bySize = new Map();
        for (const l of lines) { const k = Math.round(l.size); bySize.set(k, (bySize.get(k) || 0) + l.runs.reduce((t, r) => t + r.text.length, 0)); }
        const body = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
        const paras = [];
        let prev = null;
        for (const l of lines) {
          const text = l.runs.map((r) => r.text).join('');
          if (!text.trim()) { prev = null; continue; }
          const tag = l.size >= body * 1.8 ? 'h1' : l.size >= body * 1.3 ? 'h2' : 'p';
          const gap = prev ? Math.abs(prev.y - l.y) : 0;
          const joins = prev && prev.tag === tag && tag === 'p' && gap < l.size * 1.6 && Math.abs(prev.size - l.size) < 1;
          if (joins) {
            const last = paras[paras.length - 1];
            last.runs.push({ text: ' ', bold: false }, ...l.runs);
          } else paras.push({ tag, runs: l.runs.slice() });
          prev = { y: l.y, size: l.size, tag };
        }
        for (const q of paras) q.runs = q.runs.map((r) => ({ text: r.text.replace(/\s+/g, ' '), bold: r.bold }));
        pages.push(paras);
      }
    } finally {
      view.destroy();
    }
    return pages;
  }

  // Write the document into a file on disk (handle), or, without one, put a
  // copy in Downloads.
  // exporting: a separate file, which Save does not then follow
  async function writeOut(kind, handle, exporting) {
    const doc = current;
    if (doc.type === 'pdf') NpPdf.finishEditing();
    await saveNow('Saved by you');
    const info = kindInfo(kind);
    setStatus(_('Saving the file…'), 'pending');
    try {
      const out = await makeFile(doc, kind);
      if (handle && !out.zip) {
        const w = await handle.createWritable();
        await w.write(out.blob);
        await w.close();
        if (!exporting) fileLinks.set(doc.id, { handle, kind, name: handle.name });
        toast(exporting ? _('Exported to “{name}”', { name: handle.name }) : _('Saved to “{name}”', { name: handle.name }));
      } else {
        download(out.blob, out.filename);
        if (out.zip) toast(_('An image holds one page, so the pages were saved as images together in a zip.'), 7000);
        else if (exporting) toast(_('Exported to your Downloads.'));
        else if (!canWriteFiles()) toast(_('Saved to your Downloads. (This browser does not let websites save over a file, so each save is a new copy.)'), 7000);
      }
      if (out.fellBack) toast(_('This browser cannot save WebP images, so it was saved as PNG.'), 6000);
      // what the PDF could not carry as it was matters more than where it went
      const warned = doc.type === 'pdf' ? NpPdf.warnings() : [];
      if (warned.length) toast(warned.join(' '), 9000);
    } catch (e) {
      toast(_('Could not save: {reason}', { reason: e.message || e }), 7000);
    }
    setStatus(savedText(), NpStore.persistent ? 'ok' : 'warn');
    updateSaveUi();
  }

  // Save as and Export: choose the name, place and kind. Chrome and Edge
  // show their own Save dialog, with the kinds in its type list; other
  // browsers get Noteshack's, to pick the kind (when there is a choice), and
  // save to Downloads. kind, when given, is the one to use without asking.
  async function saveAs(kind) { return chooseAndWrite(kind ? [kind] : saveKinds(current || {}), false); }
  async function exportAs() { return chooseAndWrite(exportKinds(current || {}), true); }

  async function chooseAndWrite(kinds, exporting) {
    if (!current) return;
    const doc = current;
    if (!pdfMode()) doc.text = plainText().slice(0, 200000); // the name may come from a line just typed
    // a document written here becomes a PDF by printing it
    if (kinds.length === 1 && kinds[0] === 'pdf' && doc.type !== 'pdf') {
      toast(_('In the print window, choose “Save as PDF” as the printer.'), 5000);
      setTimeout(printDoc, 400);
      return;
    }
    let kind = kinds.length === 1 ? kinds[0] : null;
    let handle = null;
    if (canWriteFiles()) {
      // asked first: the browser shows the dialog only straight after a click or key
      try {
        handle = await window.showSaveFilePicker({
          id: 'noteshack', excludeAcceptAllOption: true,
          suggestedName: safeFileName(displayTitle(doc), kindInfo(kinds[0]).ext),
          types: kinds.map((k) => { const i = kindInfo(k); return { description: i.label + ' (.' + i.ext + ')', accept: { [i.mime]: i.exts.map((x) => '.' + x) } }; })
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
      if (handle) {
        // the kind chosen in the dialog shows in the file's ending
        const ext = (handle.name.split('.').pop() || '').toLowerCase();
        kind = kinds.find((k) => kindInfo(k).exts.includes(ext)) || kinds[0];
      }
    }
    if (!kind) {
      const select = el('select', { class: 'input', 'aria-label': _('File type') },
        kinds.map((k) => el('option', { value: k }, kindInfo(k).label + ' (.' + kindInfo(k).ext + ')')));
      const v = await dialog({
        title: exporting ? _('Export') : _('Save as'),
        body: el('label', { class: 'field' }, el('span', {}, _('File type')), select),
        actions: [{ label: _('Cancel'), value: '' }, { label: exporting ? _('Export') : _('Save'), value: 'save', primary: true }],
        onOpen: () => select.focus()
      });
      if (v !== 'save') return;
      kind = select.value;
    }
    await writeOut(kind, handle, exporting);
  }

  // Save: back into the document's own file, or, the first time, Save as
  async function saveFile() {
    if (!current) return;
    const f = fileLinks.get(current.id);
    if (f && canWriteFiles()) {
      try {
        const handle = f.handle;
        const ok = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted' || (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
        // A Word file or web page made elsewhere may hold things Noteshack
        // does not open (comments, tracked changes, scripts…): saving over
        // it loses them, so that is asked once.
        if (ok && f.imported) {
          const v = await dialog({
            title: _('Save over “{name}”?', { name: f.name }),
            body: el('p', { class: 'dlg-text' }, _('Noteshack opened the everyday parts of this file. Anything it could not open (comments, tracked changes, headers and footers, text boxes, a page’s scripts) would be lost from the file. Save as keeps the original as it is.')),
            actions: [{ label: _('Cancel'), value: '' }, { label: _('Save as…'), value: 'as' }, { label: _('Save over it'), value: 'over', primary: true }]
          });
          if (v === 'as') return saveAs();
          if (v !== 'over') return;
        }
        if (ok) {
          delete f.imported;
          return writeOut(f.kind, handle);
        }
      } catch (e) { /* the file is gone or out of reach: choose again */ }
    }
    // with no Save dialog in this browser, Save saves as the document's own kind
    return canWriteFiles() ? saveAs() : saveAs(ownKind(current));
  }

  // The File menu and the PDF toolbar say where Save goes.
  function updateSaveUi() {
    const f = current && fileLinks.get(current.id);
    const where = f && canWriteFiles() ? _('Save to “{name}”', { name: f.name }) : _('Save');
    $('#save-item span').textContent = where;
    $('.pdf-download').title = where + ' (' + NpI18n.keys('Ctrl+S') + ')';

  }

  // Link a newly opened document to the file it came from, so Save writes back to it.
  async function linkFile(doc, handle, kind) {
    if (!doc) return;
    doc.kind = kind;
    if (handle && kind) fileLinks.set(doc.id, { handle, kind, name: handle.name, imported: kind === 'docx' || kind === 'html' });
    await NpStore.putDoc(doc);
  }

  function printDoc() {
    hideImageFrame();
    closeFind(false);
    const prev = document.title;
    if (current) document.title = displayTitle(current);
    window.print();
    document.title = prev;
  }

  // handles: the files on disk, where the browser gives them (see Save)
  async function openFiles(files, handles = []) {
    let last = null;
    for (const [i, file] of files.entries()) {
      try {
        const name = file.name.replace(/\.[^.]+$/, '');
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const kind = kindOfFile(file);
        let html;
        let doc = null;
        if (ext === 'pdf' || file.type === 'application/pdf') doc = await createPdfDoc(file, name);
        else if (NpImages.formatOf(file)) doc = await createPdfDoc(file, name, true);
        if (doc) { await linkFile(doc, handles[i], kind); last = doc; continue; }
        let opened = {};
        if (ext === 'docx') {
          const word = await NpDocx.import(await file.arrayBuffer());
          html = NpSanitize.html(word.html);
          opened = { settings: word.settings };
        }
        else if (ext === 'doc') { toast(_('Old .doc files cannot be opened. In Word, use Save As → .docx first.'), 6000); continue; }
        else if (ext === 'md' || ext === 'markdown' || file.type === 'text/markdown') html = NpSanitize.html(NpMarkdown.toHtml(await file.text()));
        else if (ext === 'html' || ext === 'htm' || file.type === 'text/html') html = NpSanitize.html(await file.text(), { external: true });
        else if (ext === 'json') { await restoreBackupFile(file); continue; }
        else if (file.type.startsWith('text/') || ['txt', 'text', 'csv', 'log', ''].includes(ext)) {
          const text = (await file.text()).replace(/\r\n?/g, '\n');
          html = text.split('\n').map((l) => '<p>' + (escapeHtml(l) || '<br>') + '</p>').join('');
        } else { toast(_('“{name}” is not a file type Noteshack can open.', { name: file.name })); continue; }
        doc = await createDoc(html || '<p><br></p>', name, Object.assign({ keepFocus: true }, opened));
        if (doc) { await linkFile(doc, handles[i], kind); last = doc; updateSaveUi(); }
      } catch (e) {
        await openFailed(file.name, e);
      }
    }
    if (last) { if (last.type !== 'pdf') placeCaretAtStart(); toast(files.length > 1 ? _('Files opened as new documents') : _('Opened as a new document')); updateSaveUi(); }
  }

  // A file that would not open: said plainly, with the technical detail
  // underneath for anyone who reports it.
  async function openFailed(name, e) {
    setStatus(savedText(), NpStore.persistent ? 'ok' : 'warn');
    const locked = e && e.name === 'PasswordException';
    const why = locked
      ? _('It is password-protected. Remove the password in another app (open it there, and save or print it without one), then open it here again.')
      : _('The file may be damaged or incomplete, or saved in a way Noteshack cannot read. If it opens in another program, saving a fresh copy from there often helps.');
    await dialog({
      title: _('Couldn’t open “{name}”', { name }),
      body: el('div', { class: 'stack' }, el('p', { class: 'dlg-text' }, why),
        locked ? null : el('p', { class: 'muted open-detail' }, _('Details: {detail}', { detail: (e && e.message) || e }))),
      actions: [{ label: _('OK'), value: 'ok', primary: true }]
    });
  }

  // Open with the system's own dialog where the browser has one, which also
  // lets Save write back to the file; elsewhere the plain file picker.
  async function openPicker() {
    if (typeof window.showOpenFilePicker !== 'function') { $('#file-open').click(); return; }
    let handles;
    try {
      handles = await window.showOpenFilePicker({ id: 'noteshack', multiple: true, types: [{
        description: _('Documents, PDFs and images'),
        accept: { 'application/octet-stream': $('#file-open').accept.split(',').filter((x) => x.startsWith('.')) }
      }] });
    } catch (e) {
      if (e.name !== 'AbortError') $('#file-open').click();
      return;
    }
    openFiles(await Promise.all(handles.map((h) => h.getFile())), handles);
  }

  $('#file-open').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (files.length) openFiles(files);
  });

  async function duplicateDoc() {
    if (!current) return;
    await saveNow();
    const src = current;
    if (src.type === 'pdf') {
      const now = Date.now();
      const copy = Object.assign(JSON.parse(JSON.stringify(Object.assign({}, src, { sources: null }))), {
        id: uid(), title: _('Copy of {title}', { title: displayTitle(src) }), titleAuto: false, created: now, updated: now, sources: src.sources.map((b) => b.slice(0)),
        scanFonts: src.scanFonts ? Object.fromEntries(Object.entries(src.scanFonts).map(([k, b]) => [k, b instanceof ArrayBuffer ? b.slice(0) : b])) : undefined
      });
      await addRecord(copy);
      toast(_('Copy created'));
      return;
    }
    await createDoc(unmarked(src.html), _('Copy of {title}', { title: displayTitle(src) }), { settings: src.settings, keepFocus: true });

    toast(_('Copy created'));
  }

  async function backupAll() {
    await saveNow();
    const all = [];
    for (const d of await NpStore.allDocs()) {
      all.push(d.type === 'pdf' ? Object.assign({}, d, { sources: ((await NpStore.getSources(d)) || []).map(bufToB64) }) : d);
    }
    const data = { app: 'notepad-online', format: 1, exported: new Date().toISOString(), docs: all };
    const stamp = new Date().toISOString().slice(0, 10);
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'noteshack-backup-' + stamp + '.json');
    toast(_n(all.length, 'Backup downloaded ({n} document)', 'Backup downloaded ({n} documents)'));
  }

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function b64ToBuf(b64) {
    const bin = atob(String(b64));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  // A PDF from a backup: keep only the fields the editor knows, with sane types.
  function restoredPdf(raw, id) {
    const num = (v) => (Number.isFinite(+v) ? +v : 0);
    const items = (Array.isArray(raw.items) ? raw.items : []).filter((it) => it && typeof it === 'object' && typeof it.page === 'string' &&
      ['text', 'image', 'highlight', 'whiteout', 'box', 'ink', 'hand'].includes(it.type) && (it.type !== 'image' || /^data:image\/(png|jpeg);base64,/.test(it.src)));
    return Object.assign(newDocRecord('', String(raw.title || 'PDF')), {
      id, type: 'pdf', titleAuto: false, text: String(raw.text || ''),
      created: num(raw.created) || Date.now(), updated: num(raw.updated) || Date.now(),
      sources: raw.sources.map(b64ToBuf),
      pages: raw.pages.filter((p) => p && typeof p.uid === 'string').map((p) => ({ uid: p.uid, src: num(p.src), index: num(p.index), rotate: num(p.rotate) % 360, w: num(p.w), h: num(p.h),
        ...(num(p.skew) && Math.abs(num(p.skew)) <= 10 ? { skew: num(p.skew), paper: /^#[0-9a-f]{6}$/i.test(p.paper) ? p.paper : '#ffffff' } : {}) })),
      pageCount: raw.pages.length, items, fields: raw.fields && typeof raw.fields === 'object' ? raw.fields : {},
      lang: NpLang.has(raw.lang) ? raw.lang : undefined, langAuto: raw.langAuto === false ? false : undefined,
      // an image opened as a PDF: what to download it as
      origin: raw.origin && ['jpeg', 'png', 'webp', 'tiff', 'bmp'].includes(raw.origin.format) && Array.isArray(raw.origin.dpi)
        ? { format: raw.origin.format, dpi: raw.origin.dpi.map(num).filter((d) => d > 0) } : undefined
    });
  }

  async function restoreBackupFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { toast(_('That is not a Noteshack backup file.')); return; }
    // (the backup format keeps the app's first name, so older backups still load)
    if (!data || data.app !== 'notepad-online' || !Array.isArray(data.docs)) { toast(_('That is not a Noteshack backup file.')); return; }
    let added = 0;
    let skipped = 0;
    for (const raw of data.docs) {
      if (raw && raw.type === 'pdf' && Array.isArray(raw.sources) && Array.isArray(raw.pages)) {
        const existing = docs.find((d) => d.id === raw.id);
        if (existing && existing.updated === raw.updated) { skipped++; continue; }
        try {
          const doc = restoredPdf(raw, existing ? uid() : String(raw.id || uid()));
          await NpStore.putDoc(doc);
          docs.push(doc);
          added++;
        } catch (e) { /* a damaged entry is skipped */ }
        continue;
      }
      if (!raw || typeof raw.html !== 'string') continue;
      const existing = docs.find((d) => d.id === raw.id);
      if (existing && existing.updated === raw.updated && existing.html === raw.html) { skipped++; continue; }
      const doc = Object.assign(newDocRecord(), {
        id: existing ? uid() : String(raw.id || uid()),
        title: String(raw.title || ''), titleAuto: !!raw.titleAuto || !raw.title,
        html: NpSanitize.html(raw.html), text: String(raw.text || ''), words: +raw.words || 0,
        created: +raw.created || Date.now(), updated: +raw.updated || Date.now(),
        goal: +raw.goal || 0, settings: Object.assign({}, DOC_DEFAULTS, raw.settings),
        lang: NpLang.has(raw.lang) ? raw.lang : undefined, langAuto: raw.langAuto === false ? false : undefined
      });
      await NpStore.putDoc(doc);
      docs.push(doc);
      added++;
    }
    sortDocs();
    renderDocList();
    toast(_n(added, 'Restored {n} document', 'Restored {n} documents') + (skipped ? ' ' + _n(skipped, '({n} already here)', '({n} already here)') : ''));
  }

  $('#file-backup').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) restoreBackupFile(f);
  });

  /* =========================================================== sidebar */

  const docList = $('#doc-list');
  const docSearch = $('#doc-search');

  function renderDocList() {
    const q = docSearch.value.trim().toLowerCase();
    const list = q ? docs.filter((d) => displayTitle(d).toLowerCase().includes(q) || (d.text || '').toLowerCase().includes(q)) : docs;
    docList.replaceChildren(...list.map((d) => {
      const active = current && d.id === current.id;
      let snippet = '';
      if (q && !displayTitle(d).toLowerCase().includes(q)) {
        const t = d.text || '';
        const i = t.toLowerCase().indexOf(q);
        snippet = (i > 20 ? '…' : '') + t.slice(Math.max(0, i - 20), i + 60).replace(/\s+/g, ' ');
      }
      return el('li', { class: 'doc-item' + (active ? ' active' : '') },
        el('button', { class: 'doc-open', type: 'button', 'aria-current': active ? 'true' : null, onclick: () => openDoc(d.id) },
          el('span', { class: 'doc-name' }, d.type === 'pdf' ? el('span', { class: 'doc-badge' }, 'PDF') : null, displayTitle(d)),
          el('span', { class: 'doc-meta' }, snippet || (ago(d.updated) + ' · ' + (d.type === 'pdf'
            ? _n(d.pageCount || (d.pages || []).length, '{n} page', '{n} pages')
            : _n(d.words || 0, '{n} word', '{n} words'))))),
        el('button', { class: 'doc-del icon-btn sm', type: 'button', 'data-icon': 'trash', title: _('Delete'), 'aria-label': _('Delete {title}', { title: displayTitle(d) }), onclick: (e) => { e.stopPropagation(); deleteDoc(d.id); } }));
    }));
    if (!list.length) docList.append(el('li', { class: 'doc-empty' }, q ? _('No documents match.') : _('No documents yet.')));
    NpIcons.inject(docList);
  }
  docSearch.addEventListener('input', debounce(renderDocList, 100));
  setInterval(() => { if (!document.hidden) renderDocList(); }, 60000);

  function setSidebar(open, transient) {
    document.body.classList.toggle('sidebar-open', open);
    if (!transient && !matchMedia('(max-width: 899px)').matches) { settings.sidebar = open; saveSettings(); }
  }

  /* =========================================================== status */

  const scheduleMetrics = debounce(refreshMetrics, 250);

  function refreshMetrics() {
    if (!current || current.type === 'pdf') return;
    const text = plainText();
    const st = stats(text);
    $('#sb-count').textContent = _n(st.words, '{n} word', '{n} words');
    delete $('#sb-count').dataset.sel;
    $('#sb-read').textContent = st.words ? _('{time} read', { time: minutes(st.read) }) : '';
    editor.classList.toggle('is-empty', isEmptyDoc());
    if (settings.view === 'page') {
      const s = docSettings();
      const inch = 96;
      const m = Array.isArray(s.marginsIn) ? s.marginsIn : Array(4).fill({ narrow: 0.5, normal: 1, wide: 1.5 }[s.margins]);
      const pageH = ((s.paper === 'a4' ? 11.69 : 11) - m[0] - m[2]) * inch;
      const pages = Math.max(1, Math.ceil((editor.scrollHeight - parseFloat(getComputedStyle(editor).paddingTop) * 2) / pageH));
      $('#sb-pages').textContent = '≈ ' + _n(pages, '{n} page', '{n} pages');
    } else $('#sb-pages').textContent = '';
    const goal = current.goal || 0;
    const meter = $('#goal-meter');
    if (goal > 0) {
      const pct = Math.min(100, (st.words / goal) * 100);
      meter.hidden = false;
      $('#goal-fill').style.width = pct + '%';
      $('#sb-goal').classList.toggle('met', pct >= 100);
      $('#goal-text').textContent = pct >= 100 ? _('Goal met') : fmtNum(st.words) + ' / ' + fmtNum(goal);
    } else {
      meter.hidden = true;
      $('#sb-goal').classList.remove('met');
      $('#goal-text').textContent = _('Set a goal');
    }
    if (current.titleAuto) {
      current.text = text;
      updateTitle();
    }
  }

  const updateSelectionCount = debounce(() => {
    const s = getSelection();
    const total = $('#sb-count');
    if (selectionInEditor() && !s.isCollapsed) {
      const n = (s.toString().match(WORD_RE) || []).length;
      const all = (plainText().match(WORD_RE) || []).length;
      total.textContent = _n(all, '{selected} of {n} word', '{selected} of {n} words', { selected: fmtNum(n) });
      total.dataset.sel = '1';
    } else if (total.dataset.sel) refreshMetrics();

  }, 150);

  /* =========================================================== speech */

  let speaking = false;

  function stopSpeaking() {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    setSpeaking(false);
  }

  function setSpeaking(on) {
    speaking = on;
    $('#sb-speak').hidden = !on;
    $('#speak-label').textContent = on ? _('Stop reading') : _('Read aloud');
    if (!on && hasHighlights) CSS.highlights.delete('np-speak');
  }

  function toggleSpeak() {
    if (!('speechSynthesis' in window)) { toast(_('This browser cannot read text aloud.')); return; }
    if (speaking) { stopSpeaking(); return; }
    const s = getSelection();
    const useSel = selectionInEditor() && !s.isCollapsed;
    const idx = useSel ? null : textIndex();
    const text = useSel ? s.toString() : idx.text;
    if (!text.trim()) { toast(_('There is nothing to read yet.')); return; }
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.name === settings.voice);
    if (voice) u.voice = voice;
    u.rate = settings.rate || 1;
    u.onend = u.onerror = () => setSpeaking(false);
    if (idx && hasHighlights) {
      u.onboundary = (ev) => {
        if (ev.name && ev.name !== 'word') return;
        const rest = idx.text.slice(ev.charIndex);
        const m = rest.match(/^[\p{L}\p{N}'’-]+/u);
        const len = ev.charLength || (m ? m[0].length : 0);
        if (!len) return;
        const r = idx.range(ev.charIndex, ev.charIndex + len);
        if (r) { CSS.highlights.set('np-speak', new Highlight(r)); scrollRangeIntoView(r); }
      };
    }
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setSpeaking(true);
  }

  /* =========================================================== views */

  function effectiveTheme() {
    if (settings.theme !== 'system') return settings.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(t) {
    settings.theme = t;
    saveSettings();
    applyTheme();
  }

  function applyTheme() {
    document.documentElement.dataset.theme = settings.theme;
    const dark = effectiveTheme() === 'dark';
    const btn = $('#theme-btn');
    btn.dataset.icon = dark ? 'sun' : 'moon';
    btn.innerHTML = '';
    delete btn.dataset.iconDone;
    NpIcons.inject(btn.parentElement);
    btn.title = dark ? _('Switch to light') : _('Switch to dark');
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  function setView(v) {
    settings.view = v;
    saveSettings();
    document.body.classList.toggle('view-page', v === 'page');
    document.body.classList.toggle('view-full', v === 'full');
    refreshMetrics();
    positionImageFrame();
  }

  function setZoom(z) {
    settings.zoom = Math.round(clamp(z, 0.5, 2) * 10) / 10;
    saveSettings();
    page.style.zoom = settings.zoom;
    $('#sb-zoom').textContent = Math.round(settings.zoom * 100) + '%';
    positionImageFrame();
  }

  function applyDocSettings() {
    const s = docSettings();
    const st = page.style;
    st.setProperty('--doc-font', fontByKey(s.font).css);
    st.setProperty('--doc-size', s.size + 'pt');
    st.setProperty('--doc-lh', String(s.lineHeight));
    st.setProperty('--paper-w', PAPER[s.paper].w);
    st.setProperty('--paper-h', PAPER[s.paper].h);
    st.setProperty('--paper-pad', marginCss(s));
    $('#page-rule').textContent = '@page { size: ' + PAPER[s.paper].css + '; margin: ' + marginCss(s) + '; }';
    // until the cursor lands somewhere, the toolbar shows the document's defaults
    tbFont.value = s.font;
    tbSize.value = String(s.size);
  }

  // View → Formatting marks: a ¶ where each paragraph ends (styles.css).
  // A block's last line break shows nothing, but a ¶ after it would start a
  // line of its own; so while the marks show, that break is marked
  // (data-np-end) for the styles to hide, and the ¶ stays on the line. The
  // mark never reaches a saved or copied document (serialize).
  const MARK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre';
  function applyMarks() {
    document.body.classList.toggle('show-marks', !!settings.marks);
    markEnds();
  }
  function markEnds() {
    for (const br of editor.querySelectorAll('br')) {
      let next = br.nextSibling;
      while (next && next.nodeType === 3 && !next.data.trim()) next = next.nextSibling;
      const end = !!settings.marks && !next && br.parentNode.matches(MARK_SEL);
      if (end !== br.hasAttribute('data-np-end')) br.toggleAttribute('data-np-end', end);
    }
  }
  let marksFrame = 0;
  function scheduleMarks() {
    cancelAnimationFrame(marksFrame);
    marksFrame = requestAnimationFrame(markEnds);
  }

  function applySpellcheck() {
    editor.spellcheck = settings.spellcheck && !spellOurs();
    spellPass();
    // Browsers repaint the squiggles on the next focus.
    if (document.activeElement === editor) { editor.blur(); restoreSelection(); }
  }

  function toggleFocus() {
    const on = !document.body.classList.contains('focus');
    document.body.classList.toggle('focus', on);
    if (on) toast(_('Focus mode — press Esc to leave'), 2000);
    restoreSelection();
  }

  /* =========================================================== boot */

  async function migrateLegacy() {
    // The first version kept one document in localStorage.
    let html = null;
    let goal = 0;
    try {
      html = localStorage.getItem('notepad_online_content');
      goal = parseInt(localStorage.getItem('notepad_online_goal'), 10) || 0;
    } catch (e) { return; }
    if (!html || !html.trim()) return;
    const doc = newDocRecord(NpSanitize.html(html, { external: true }), '');
    doc.goal = goal;
    const tmp = document.createElement('div');
    tmp.innerHTML = doc.html;
    doc.text = tmp.textContent || '';
    await NpStore.putDoc(doc);
    try {
      localStorage.removeItem('notepad_online_content');
      localStorage.removeItem('notepad_online_goal');
    } catch (e) { /* ignore */ }
    docs.push(doc);
  }

  async function boot() {
    NpIcons.inject();
    if (isMac) for (const k of $$('kbd')) k.textContent = k.textContent.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧');
    for (const b of $$('[title]')) if (isMac) b.title = b.title.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧');
    buildToolbar();
    NpPdf.init({
      el, toast, dialog, changed: () => markDirty(), status: setStatus,
      saved: () => setStatus(savedText(), NpStore.persistent ? 'ok' : 'warn'),
      // saved at once: a page closed right after must not lose it
      saveNow: () => { markDirty(); return saveNow(); },
      // reading a scan found its language
      langChanged: () => { applyDocLang(); markDirty(); }
    });
    applyTheme();
    setView(settings.view);
    setZoom(settings.zoom);
    applySpellcheck();
    applyMarks();
    setSidebar(settings.sidebar && !matchMedia('(max-width: 899px)').matches, true);

    const ok = await NpStore.open();
    if (!ok) {
      $('#storage-note').textContent = _('Not saving — storage blocked');
      $('#sb-foot').classList.add('warn');
      toast(_('This browser is blocking storage, so documents last only until the tab closes. Download your work before leaving.'), 8000);
    }
    docs = await NpStore.allDocs();
    if (!docs.length) await migrateLegacy();
    sortDocs();
    const last = docs.find((d) => d.id === settings.lastDoc) || docs[0];
    if (last) await openDoc(last.id, { force: true });
    else await createDoc('', '', { keepFocus: true });
    renderDocList();
    document.body.classList.add('ready');
    welcomeDialog().then(safariNote);

    // Save before the tab goes away or into the background.
    document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) saveNow(); });
    window.addEventListener('pagehide', () => { if (dirty) saveNow(); });
    window.addEventListener('beforeunload', (e) => { if (dirty && !NpStore.persistent) { e.preventDefault(); e.returnValue = ''; } });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      setInterval(checkForUpdate, 3600000);
    }
  }

  boot();
})();
