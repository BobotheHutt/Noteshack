/* Noteshack — HTML sanitizer and color helpers.
   Everything that enters the editor from outside (paste, open, import, the
   saved copy in storage) passes through NpSanitize.html first. */
(function () {
  'use strict';

  /* ---------- color ---------- */

  const colorCtx = document.createElement('canvas').getContext('2d');

  // Any CSS color → [r, g, b, a] or null.
  function rgba(value) {
    if (!value) return null;
    const v = String(value).trim();
    if (/^(transparent|inherit|initial|unset|currentcolor|none|auto)$/i.test(v)) return null;
    colorCtx.fillStyle = '#010203';
    colorCtx.fillStyle = v;
    const out = colorCtx.fillStyle;
    if (out === '#010203' && !/^#?010203$/i.test(v)) return null; // not a color
    if (out[0] === '#') {
      return [parseInt(out.slice(1, 3), 16), parseInt(out.slice(3, 5), 16), parseInt(out.slice(5, 7), 16), 1];
    }
    const m = out.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }

  function hex(value) {
    const c = rgba(value);
    if (!c || c[3] === 0) return null;
    return c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // True for blacks, whites and grays: colors that carry no meaning of their
  // own and only fight the theme when pasted in from another page.
  function isNeutral(value) {
    const c = rgba(value);
    if (!c) return true;
    if (c[3] < 0.15) return true;
    return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 24;
  }

  window.NpColor = { rgba, hex, isNeutral };

  /* ---------- sanitizer ---------- */

  // Removed together with everything inside them.
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'HEAD',
    'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'OPTION',
    'CANVAS', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'FRAME', 'FRAMESET', 'APPLET', 'BASE', 'PARAM',
    'DIALOG', 'MAP', 'AREA', 'PICTURE', 'COLGROUP', 'COL', 'XML']);

  // Kept, with these attributes. Anything not listed is unwrapped (its
  // children stay, the tag goes).
  const TAGS = {
    P: [], DIV: [], SPAN: [], BR: [], B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [],
    DEL: [], INS: [], SUB: [], SUP: [], MARK: [], CODE: [], PRE: [], BLOCKQUOTE: [], SMALL: [],
    H1: [], H2: [], H3: [], H4: [], H5: [], H6: [],
    UL: ['class'], OL: ['start', 'type', 'class'], LI: ['data-checked'],
    A: ['href', 'title'], IMG: ['src', 'alt', 'class'],
    TABLE: [], THEAD: [], TBODY: [], TFOOT: [], TR: [], TH: ['colspan', 'rowspan'], TD: ['colspan', 'rowspan'],
    HR: ['class'], CAPTION: [], FONT: []
  };

  const CLASSES = {
    UL: ['checklist'],
    // list markers other than "1." (from Word: "1", "1)", "(1)", "1.1.", "1.1")
    OL: ['np-plain', 'np-rp', 'np-pp', 'np-outline', 'np-outline-bare'],
    IMG: ['img-left', 'img-center', 'img-right'],
    HR: ['page-break']
  };

  // what a document keeps (a Word file's layout among it: indents, spacing,
  // line spacing, capitals); a page pasted from the web keeps only the text's
  const STYLE_PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'text-decoration', 'text-decoration-line', 'text-align', 'vertical-align', 'margin-left',
    'margin-right', 'margin-top', 'margin-bottom', 'text-indent', 'line-height', 'padding-left', 'text-transform', 'font-variant'];
  const LAYOUT_PROPS = ['font-family', 'font-size', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'text-indent', 'line-height', 'padding-left'];
  const IMG_STYLE_PROPS = ['width'];

  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE',
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'HR', 'CAPTION', 'BODY']);

  const FONT_SIZES = { 1: '8pt', 2: '10pt', 3: '12pt', 4: '14pt', 5: '18pt', 6: '24pt', 7: '36pt' };

  function safeHref(v) {
    const s = String(v || '').replace(/[\u0000- \u007f-\u009f]/g, '');
    if (!s) return null;
    if (/^(https?:|mailto:|tel:|#)/i.test(s)) return v.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // javascript:, data:, vbscript: …
    return v.trim(); // relative
  }

  function safeSrc(v) {
    const s = String(v || '').trim();
    if (/^data:image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return null;
  }

  // The disguised blockquote Chrome makes for "indent" outside a list.
  function isIndentQuote(el) {
    if (el.tagName !== 'BLOCKQUOTE') return false;
    const st = el.getAttribute('style') || '';
    return /border:\s*none/i.test(st) || el.style.borderLeftStyle === 'none';
  }

  function rename(el, tag) {
    const n = el.ownerDocument.createElement(tag);
    for (const a of Array.from(el.attributes)) n.setAttribute(a.name, a.value);
    while (el.firstChild) n.appendChild(el.firstChild);
    el.replaceWith(n);
    return n;
  }

  function unwrap(el) {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }

  function cleanStyle(el, tag, external) {
    const src = el.style;
    const keep = [];
    const props = tag === 'IMG' ? IMG_STYLE_PROPS : STYLE_PROPS;
    for (const prop of props) {
      let val = src.getPropertyValue(prop);
      if (!val) continue;
      val = val.trim();
      if (/url\(|expression|javascript:|[<>]/i.test(val)) continue;
      if (external) {
        if (LAYOUT_PROPS.includes(prop)) continue;
        if (prop === 'color' && NpColor.isNeutral(val)) continue;
        if (prop === 'background-color' && NpColor.isNeutral(val)) continue;
        if (prop === 'text-align' && /^(left|start)$/i.test(val)) continue;
      }
      if (prop === 'width' && !/^\d+(\.\d+)?%$/.test(val)) continue;
      keep.push(prop + ': ' + val);
    }
    if (keep.length) el.setAttribute('style', keep.join('; ') + ';');
    else el.removeAttribute('style');
  }

  function cleanAttrs(el, tag, external) {
    const allowed = TAGS[tag] || [];
    const hadStyle = el.getAttribute('style') != null;
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      if (name === 'style') continue;
      if (name === 'data-np-tr' && /^\d+$/.test(a.value)) continue; // a translated paragraph not yet checked
      if (!allowed.includes(name)) { el.removeAttribute(a.name); continue; }
      if (name === 'href') {
        const v = safeHref(a.value);
        if (v == null) el.removeAttribute('href'); else el.setAttribute('href', v);
      } else if (name === 'src') {
        const v = safeSrc(a.value);
        if (v == null) el.removeAttribute('src'); else el.setAttribute('src', v);
      } else if (name === 'class') {
        const ok = (CLASSES[tag] || []).filter((c) => el.classList.contains(c));
        if (ok.length) el.setAttribute('class', ok.join(' ')); else el.removeAttribute('class');
      } else if (name === 'data-checked') {
        el.setAttribute('data-checked', a.value === 'true' ? 'true' : 'false');
      } else if (name === 'colspan' || name === 'rowspan' || name === 'start') {
        const n = parseInt(a.value, 10);
        if (!(n > 0 && n < 1000)) el.removeAttribute(a.name);
      }
    }
    if (hadStyle) cleanStyle(el, tag, external);
  }

  function clean(parent, opts, inPre) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3) {
        if (opts.external && !inPre) node.nodeValue = node.nodeValue.replace(/[\t\n\r ]+/g, ' ');
        continue;
      }
      if (node.nodeType !== 1) { node.remove(); continue; }

      let el = node;
      let tag = el.tagName.toUpperCase();
      if (DROP.has(tag) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') { el.remove(); continue; }

      if (tag === 'FONT') {
        const color = el.getAttribute('color');
        const face = el.getAttribute('face');
        const size = el.getAttribute('size');
        if (color) el.style.color = color;
        if (face) el.style.fontFamily = face;
        if (size && FONT_SIZES[size] && !el.style.fontSize) el.style.fontSize = FONT_SIZES[size];
        el = rename(el, 'span');
        tag = 'SPAN';
      } else if ((tag === 'B' || tag === 'STRONG') && /^(normal|[1-5]00)$/.test(el.style.fontWeight)) {
        el = rename(el, 'span'); // Google Docs wraps whole pastes in <b style="font-weight:normal">
        tag = 'SPAN';
      } else if (tag === 'BLOCKQUOTE' && isIndentQuote(el)) {
        const px = Math.max(0, parseInt(el.style.marginLeft, 10) || 40);
        clean(el, opts, inPre);
        el.setAttribute('style', 'margin: 0 0 0 ' + px + 'px; border: none; padding: 0px;');
        for (const a of Array.from(el.attributes)) if (a.name !== 'style') el.removeAttribute(a.name);
        continue;
      }

      if (!TAGS[tag]) { clean(el, opts, inPre); unwrap(el); continue; }

      cleanAttrs(el, tag, !!opts.external);
      if (tag === 'IMG' && !el.getAttribute('src')) { el.remove(); continue; }
      clean(el, opts, inPre || tag === 'PRE');

      if (tag === 'SPAN' && !el.attributes.length) { unwrap(el); continue; }
      if (tag === 'A' && !el.getAttribute('href')) { unwrap(el); continue; }
      if (tag === 'P' && !el.childNodes.length) { el.remove(); continue; }
    }
  }

  // Whitespace-only text between blocks would render as blank lines under
  // white-space: pre-wrap, so drop it.
  function dropBlockWhitespace(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const dead = [];
    let n;
    while ((n = walker.nextNode())) {
      if (/\S/.test(n.nodeValue) || n.parentElement.closest('pre')) continue;
      const prev = n.previousSibling;
      const next = n.nextSibling;
      const parentBlock = BLOCK.has(n.parentNode.nodeName);
      if ((!prev || BLOCK.has(prev.nodeName)) && (!next || BLOCK.has(next.nodeName)) && (parentBlock || prev || next)) {
        dead.push(n);
      }
    }
    dead.forEach((d) => d.remove());
  }

  /**
   * @param {string} html
   * @param {{external?: boolean}} opts  external: content from another app or
   *   page. Collapses source whitespace and drops colors, fonts and sizes that
   *   would fight this document's own look.
   */
  function html(input, opts = {}) {
    const doc = new DOMParser().parseFromString('<!doctype html><html><body>' + String(input || ''), 'text/html');
    const body = doc.body;
    clean(body, opts, false);
    if (opts.external) dropBlockWhitespace(body);
    return body.innerHTML;
  }

  window.NpSanitize = { html, isIndentQuote, safeHref };
})();
