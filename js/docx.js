/* Noteshack — Word (.docx) export and import.
   NpDocx.export(editorEl, opts) → Promise<Blob>
   NpDocx.import(arrayBuffer)    → Promise<{ html, settings }>: HTML (sanitize
     before use) and the page settings it was written with (font, size,
     lineHeight, paper, margins) */
(function () {
  'use strict';
  const _ = NpI18n.t; // the app's own language (js/i18n.js)

  const NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    rel: 'http://schemas.openxmlformats.org/package/2006/relationships'
  };
  const REL = {
    doc: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
    core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
    numbering: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
    link: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
  };

  const x = (s) => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'HR']);
  const BR_RUN = '<w:r><w:br/></w:r>';
  const KEYWORD_PX = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
  const FONT_TAG_PX = { 1: 10.67, 2: 13.33, 3: 16, 4: 18.67, 5: 24, 6: 32, 7: 48 };

  const PAGE = { letter: [12240, 15840], a4: [11906, 16838] };
  const MARGIN = { narrow: 720, normal: 1440, wide: 2160 };

  /* ================= export ================= */

  function firstFamily(css) {
    return String(css || '').split(',')[0].replace(/["']/g, '').trim();
  }

  function sizeHalfPoints(fs) {
    if (!fs) return null;
    let px = null;
    const m = fs.match(/^([\d.]+)(px|pt)$/);
    if (m) px = m[2] === 'pt' ? parseFloat(m[1]) / 0.75 : parseFloat(m[1]);
    else if (KEYWORD_PX[fs]) px = KEYWORD_PX[fs];
    return px ? Math.round(px * 0.75 * 2) : null;
  }

  function b64ToBytes(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function imageBytes(img) {
    const src = img.getAttribute('src') || '';
    let bytes;
    let type = '';
    if (src.startsWith('data:')) {
      const m = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
      if (!m) return null;
      type = m[1];
      bytes = m[2] ? b64ToBytes(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
    } else {
      const res = await fetch(src);
      if (!res.ok) return null;
      type = res.headers.get('content-type') || '';
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    let ext = /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpeg' : /gif/.test(type) ? 'gif' : null;
    if (!ext) {
      // webp, svg, avif… → png, which every version of Word reads
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 300;
      c.height = img.naturalHeight || 200;
      c.getContext('2d').drawImage(img, 0, 0);
      const data = c.toDataURL('image/png');
      bytes = b64ToBytes(data.split(',')[1]);
      ext = 'png';
    }
    return { bytes, ext, w: img.naturalWidth || 300, h: img.naturalHeight || 200 };
  }

  class Writer {
    constructor(opts) {
      this.opts = opts;
      this.rels = [];
      this.media = [];
      this.orderedNums = [];
      this.images = new Map();
      this.drawId = 1;
      const [pw] = PAGE[opts.page] || PAGE.letter;
      const margin = MARGIN[opts.margins] || MARGIN.normal;
      this.pgMar = Array.isArray(opts.marginsIn) && opts.marginsIn.length === 4 ? opts.marginsIn.map((v) => Math.round(v * 1440)) : [margin, margin, margin, margin];
      this.contentTw = pw - this.pgMar[1] - this.pgMar[3];
    }

    rel(type, target, external) {
      const id = 'rId' + (this.rels.length + 10);
      this.rels.push({ id, type, target, external });
      return id;
    }

    // an ordered list: its own numbering, at its level, in its format
    newOrderedList(start, level) {
      const numId = this.orderedNums.length + 2;
      this.orderedNums.push(Object.assign({ numId, start: start || 1 }, level));
      return numId;
    }

    /* ----- runs ----- */

    rPrOf(el, base) {
      const r = Object.assign({}, base);
      const t = el.tagName;
      if (t === 'B' || t === 'STRONG' || /^H[1-6]$/.test(t)) r.b = true;
      if (t === 'I' || t === 'EM') r.i = true;
      if (t === 'U' || t === 'INS') r.u = true;
      if (t === 'S' || t === 'STRIKE' || t === 'DEL') r.strike = true;
      if (t === 'SUP') r.va = 'superscript';
      if (t === 'SUB') r.va = 'subscript';
      if (t === 'CODE' || t === 'KBD') r.font = 'Courier New';
      if (t === 'MARK') r.shd = 'FFFF00';
      if (t === 'SMALL') r.sz = Math.round((r.sz || this.opts.size * 2) * 0.85);
      if (t === 'FONT') {
        if (el.getAttribute('color')) r.color = NpColor.hex(el.getAttribute('color')) || r.color;
        if (el.getAttribute('face')) r.font = firstFamily(el.getAttribute('face'));
        const px = FONT_TAG_PX[el.getAttribute('size')];
        if (px) r.sz = Math.round(px * 1.5);
      }
      const s = el.style;
      if (s) {
        const fw = s.fontWeight;
        if (fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600) r.b = true;
        else if (fw === 'normal' || (parseInt(fw, 10) && parseInt(fw, 10) < 600)) r.b = false;
        if (s.fontStyle === 'italic' || s.fontStyle === 'oblique') r.i = true;
        else if (s.fontStyle === 'normal') r.i = false;
        const deco = s.textDecorationLine || s.textDecoration || '';
        if (deco.includes('underline')) r.u = true;
        if (deco.includes('line-through')) r.strike = true;
        if (s.color) { const c = NpColor.hex(s.color); if (c) r.color = c; else if (s.color === 'inherit') delete r.color; }
        if (s.backgroundColor) { const c = NpColor.hex(s.backgroundColor); if (c) r.shd = c; else delete r.shd; }
        if (s.fontFamily) r.font = this.wordFont(s.fontFamily);
        const sz = sizeHalfPoints(s.fontSize);
        if (sz) r.sz = sz;
        if (s.verticalAlign === 'super') r.va = 'superscript';
        if (s.verticalAlign === 'sub') r.va = 'subscript';
        if (s.textTransform === 'uppercase') r.caps = true;
        else if (s.textTransform === 'none') r.caps = false;
        if (s.fontVariant === 'small-caps') r.smallCaps = true;
      }
      return r;
    }

    wordFont(css) {
      const f = firstFamily(css);
      return /^(system-ui|-apple-system|sans-serif|BlinkMacSystemFont|Segoe UI|Roboto)$/i.test(f) ? 'Calibri' : f;
    }

    rPrXml(r) {
      let s = '';
      if (r.link) s += '<w:rStyle w:val="Hyperlink"/>';
      if (r.font) s += '<w:rFonts w:ascii="' + x(r.font) + '" w:hAnsi="' + x(r.font) + '" w:cs="' + x(r.font) + '"/>';
      if (r.b) s += '<w:b/><w:bCs/>';
      else if (r.b === false) s += '<w:b w:val="0"/><w:bCs w:val="0"/>';
      if (r.i) s += '<w:i/><w:iCs/>';
      if (r.caps) s += '<w:caps/>';
      else if (r.smallCaps) s += '<w:smallCaps/>';
      if (r.strike) s += '<w:strike/>';
      if (r.color) s += '<w:color w:val="' + r.color + '"/>';
      if (r.sz) s += '<w:sz w:val="' + r.sz + '"/><w:szCs w:val="' + r.sz + '"/>';
      if (r.u) s += '<w:u w:val="single"/>';
      if (r.shd) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + r.shd + '"/>';
      if (r.va) s += '<w:vertAlign w:val="' + r.va + '"/>';
      return s ? '<w:rPr>' + s + '</w:rPr>' : '';
    }

    textRun(text, r) {
      const pieces = text.split(/(\n|\t)/).map((seg) => {
        if (seg === '\n') return '<w:br/>';
        if (seg === '\t') return '<w:tab/>';
        return seg ? '<w:t xml:space="preserve">' + x(seg) + '</w:t>' : '';
      }).join('');
      return pieces ? '<w:r>' + this.rPrXml(r) + pieces + '</w:r>' : '';
    }

    imageRun(img) {
      const info = this.images.get(img);
      if (!info) return '';
      const n = this.media.length + 1;
      const file = 'image' + n + '.' + info.ext;
      this.media.push({ file, bytes: info.bytes });
      const rid = this.rel(REL.image, 'media/' + file);
      const contentPx = this.contentTw / 15;
      let w = Math.min(info.w, contentPx);
      const pct = parseFloat(img.style.width);
      if (pct > 0 && /%$/.test(img.style.width)) w = contentPx * pct / 100;
      const h = w * info.h / info.w;
      const cx = Math.round(w * 9525);
      const cy = Math.round(h * 9525);
      const id = this.drawId++;
      const alt = x(img.getAttribute('alt') || '');
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Picture ' + id + '" descr="' + alt + '"/>' +
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
        '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + file + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }

    runs(node, r, out) {
      if (node.nodeType === 3) {
        const run = this.textRun(node.nodeValue.replace(/ /g, ' '), r);
        if (run) out.push(run);
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node;
      if (el.tagName === 'BR') { out.push(BR_RUN); return; }
      if (el.tagName === 'IMG') { const run = this.imageRun(el); if (run) out.push(run); return; }
      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        const inner = [];
        const rr = this.rPrOf(el, r);
        if (/^(https?:|mailto:|tel:)/i.test(href)) rr.link = true;
        for (const c of el.childNodes) this.runs(c, rr, inner);
        if (rr.link) out.push('<w:hyperlink r:id="' + this.rel(REL.link, href, true) + '" w:history="1">' + inner.join('') + '</w:hyperlink>');
        else out.push(...inner);
        return;
      }
      if (BLOCK.has(el.tagName)) {
        // a block inside inline content (rare): keep its text on a new line
        out.push(BR_RUN);
      }
      const rr = this.rPrOf(el, r);
      for (const c of el.childNodes) this.runs(c, rr, out);
    }

    /* ----- paragraphs ----- */

    para(nodes, ctx, el) {
      const out = [];
      let r = Object.assign({}, ctx.rpr || {});
      if (ctx.pre) r = Object.assign(r, { font: 'Courier New', sz: 20 });
      if (el && el !== ctx.container) r = this.rPrOf(el, r);
      if (ctx.list && ctx.list.check && ctx.list.first) out.push(this.textRun(ctx.list.checked ? '☒ ' : '☐ ', r));
      for (const n of nodes) this.runs(n, r, out);
      while (out.length && out[out.length - 1] === BR_RUN) out.pop();

      let pPr = '';
      if (ctx.pStyle) pPr += '<w:pStyle w:val="' + ctx.pStyle + '"/>';
      // the block's box (a Word file's layout, kept): its indent from the
      // page margin, first line, spacing and line spacing
      const box = ctx.box && ctx.box.style;
      const pxOf = (v) => (/px$/.test(v || '') ? parseFloat(v) : null);
      const ptOf = (v) => (/pt$/.test(v || '') ? parseFloat(v) : /px$/.test(v || '') ? parseFloat(v) * 0.75 : null);
      let ind = ctx.indent || 0;
      let first = box && pxOf(box.textIndent) != null ? Math.round(pxOf(box.textIndent) * 15) : 0;
      let hanging = 0;
      if (ctx.list) {
        if (ctx.list.first && !ctx.list.check) {
          pPr += '<w:numPr><w:ilvl w:val="' + ctx.list.ilvl + '"/><w:numId w:val="' + ctx.list.numId + '"/></w:numPr>';
          ind = ctx.list.left;
          hanging = ctx.list.hanging;
          first = 0;
        } else {
          ind = ctx.list.check ? ind : ctx.list.left;
        }
        ctx.list.first = false;
      }
      if (ctx.quote) pPr += '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9CED6"/></w:pBdr>';
      if (ctx.pre) pPr += '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>';
      if (ctx.pre) pPr += '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>';
      else if (box && (box.marginTop || box.marginBottom || box.lineHeight)) {
        const before = ptOf(box.marginTop);
        const after = ptOf(box.marginBottom);
        let line = '';
        const lh = box.lineHeight;
        if (/^[\d.]+$/.test(lh || '')) line = ' w:line="' + Math.round(parseFloat(lh) / 1.15 * 240) + '" w:lineRule="auto"';
        else if (ptOf(lh) != null) line = ' w:line="' + Math.round(ptOf(lh) * 20) + '" w:lineRule="exact"';
        pPr += '<w:spacing' + (before != null ? ' w:before="' + Math.round(before * 20) + '"' : '') + (after != null ? ' w:after="' + Math.round(after * 20) + '"' : '') + line + '/>';
      }
      const right = box && pxOf(box.marginRight) ? Math.round(pxOf(box.marginRight) * 15) : 0;
      if (ind || first || hanging || right) {
        pPr += '<w:ind' + (ind ? ' w:left="' + ind + '"' : '') + (right ? ' w:right="' + right + '"' : '') +
          (hanging ? ' w:hanging="' + hanging + '"' : first > 0 ? ' w:firstLine="' + first + '"' : first < 0 ? ' w:hanging="' + -first + '"' : '') + '/>';
      }
      let align = (el && el.style && el.style.textAlign) || ctx.align;
      if (nodes.length === 1 && nodes[0].nodeType === 1 && nodes[0].tagName === 'IMG') {
        const c = nodes[0].classList;
        if (c.contains('img-center')) align = 'center';
        if (c.contains('img-right')) align = 'right';
      }
      const jc = { center: 'center', right: 'right', end: 'right', justify: 'both' }[align];
      if (jc) pPr += '<w:jc w:val="' + jc + '"/>';
      return '<w:p>' + (pPr ? '<w:pPr>' + pPr + '</w:pPr>' : '') + out.join('') + '</w:p>';
    }

    hasBlockChild(el) {
      for (const c of el.children) if (BLOCK.has(c.tagName)) return true;
      return false;
    }

    blocks(container, ctx, out) {
      let inline = [];
      const flush = () => {
        if (inline.some((n) => n.nodeType === 1 || /\S/.test(n.nodeValue))) out.push(this.para(inline, ctx));
        inline = [];
      };
      for (const node of container.childNodes) {
        if (node.nodeType === 1 && BLOCK.has(node.tagName)) { flush(); this.block(node, ctx, out); }
        else if (node.nodeType === 1 || node.nodeType === 3) inline.push(node);
      }
      flush();
    }

    block(el, ctx, out) {
      const tag = el.tagName;
      const align = (el.style && el.style.textAlign) || ctx.align;
      const margin = (tag === 'UL' || tag === 'OL') ? 0 : parseFloat(el.style && el.style.marginLeft) || 0;
      const sub = Object.assign({}, ctx, { align, indent: (ctx.indent || 0) + Math.round(margin * 15), box: el });
      if (/^H[1-6]$/.test(tag)) {
        out.push(this.para(Array.from(el.childNodes), Object.assign(sub, { pStyle: 'Heading' + tag[1] })));
      } else if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
        if (this.hasBlockChild(el)) this.blocks(el, sub, out);
        else out.push(this.para(Array.from(el.childNodes), sub, el));
      } else if (tag === 'PRE') {
        out.push(this.para(Array.from(el.childNodes), Object.assign(sub, { pre: true })));
      } else if (tag === 'BLOCKQUOTE') {
        if (NpSanitize.isIndentQuote(el)) this.blocks(el, sub, out);
        else this.blocks(el, Object.assign(sub, { quote: true, indent: sub.indent + 360 }), out);
      } else if (tag === 'UL' || tag === 'OL') {
        this.list(el, sub, out);
      } else if (tag === 'TABLE') {
        out.push(this.table(el, sub));
      } else if (tag === 'HR') {
        if (el.classList.contains('page-break')) out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        else out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>');
      }
    }

    list(el, ctx, out) {
      const ordered = el.tagName === 'OL';
      const check = el.classList.contains('checklist');
      const ilvl = ctx.list ? Math.min(ctx.list.ilvl + 1, 8) : 0;
      // where its text stands: from its own box where it has one (margin,
      // and the hanging indent its markers sit in), else Word's usual steps
      const outer = ctx.list ? ctx.list.left : (ctx.indent || 0);
      const m = parseFloat(el.style.marginLeft);
      const pad = parseFloat(el.style.paddingLeft);
      const hanging = pad >= 0 ? Math.round(pad * 15) : 360;
      const left = m >= 0 && pad >= 0 ? outer + Math.round((m + pad) * 15) : (ctx.list ? outer + 720 : (ctx.indent || 0) + 720);
      // its numbers: format from its type, text from its marker class
      const type = el.getAttribute('type') || '1';
      const fmt = { 1: 'decimal', a: 'lowerLetter', A: 'upperLetter', i: 'lowerRoman', I: 'upperRoman' }[type] || 'decimal';
      const N = '%' + (ilvl + 1);
      const text = el.classList.contains('np-rp') ? N + ')' : el.classList.contains('np-pp') ? '(' + N + ')' : el.classList.contains('np-plain') ? N
        : el.classList.contains('np-outline') || el.classList.contains('np-outline-bare')
          ? Array.from({ length: ilvl + 1 }, (_v, i) => '%' + (i + 1)).join('.') + (el.classList.contains('np-outline') ? '.' : '') : N + '.';
      const numId = ordered ? this.newOrderedList(parseInt(el.getAttribute('start'), 10), { ilvl, fmt, text, left, hanging }) : 1;
      for (const child of el.children) {
        if (child.tagName === 'UL' || child.tagName === 'OL') {
          this.list(child, Object.assign({}, ctx, { list: { numId, ilvl, first: false, left, hanging } }), out);
          continue;
        }
        if (child.tagName !== 'LI') continue;
        const list = { numId, ilvl, first: true, check, checked: child.getAttribute('data-checked') === 'true', left: check ? (ctx.indent || 0) + ilvl * 720 : left, hanging: check ? 0 : hanging };
        const liCtx = Object.assign({}, ctx, { list, box: child, indent: check ? (ctx.indent || 0) + ilvl * 720 : ctx.indent });
        let inline = [];
        const flush = (force) => {
          if (force || inline.some((n) => n.nodeType === 1 || /\S/.test(n.nodeValue))) out.push(this.para(inline, liCtx));
          inline = [];
        };
        let emitted = false;
        for (const c of child.childNodes) {
          if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) {
            if (!emitted || inline.length) { flush(true); emitted = true; }
            this.list(c, liCtx, out);
          } else if (c.nodeType === 1 && BLOCK.has(c.tagName)) {
            if (inline.length) { flush(); emitted = true; }
            const before = out.length;
            this.block(c, liCtx, out);
            if (out.length > before) emitted = true;
          } else {
            inline.push(c);
          }
        }
        if (inline.length || !emitted) flush(true);
      }
    }

    table(el, ctx) {
      const rows = Array.from(el.rows);
      let cols = 1;
      for (const r of rows) {
        let c = 0;
        for (const cell of r.cells) c += cell.colSpan || 1;
        cols = Math.max(cols, c);
      }
      const colW = Math.floor(this.contentTw / cols);
      let xml = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="' + colW * cols + '" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>';
      for (let i = 0; i < cols; i++) xml += '<w:gridCol w:w="' + colW + '"/>';
      xml += '</w:tblGrid>';
      for (const r of rows) {
        const header = r.cells.length && Array.from(r.cells).every((c) => c.tagName === 'TH');
        xml += '<w:tr>' + (header ? '<w:trPr><w:tblHeader/></w:trPr>' : '');
        for (const cell of r.cells) {
          const span = cell.colSpan || 1;
          const out = [];
          const cctx = { rpr: Object.assign({}, ctx.rpr, cell.tagName === 'TH' ? { b: true } : {}), align: cell.style.textAlign || '', container: cell };
          this.blocks(cell, cctx, out);
          if (!out.length) out.push('<w:p/>');
          xml += '<w:tc><w:tcPr><w:tcW w:w="' + colW * span + '" w:type="dxa"/>' +
            (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
            (cell.tagName === 'TH' ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F3F5"/>' : '') +
            '</w:tcPr>' + out.join('') + '</w:tc>';
        }
        xml += '</w:tr>';
      }
      return xml + '</w:tbl>';
    }

    /* ----- package parts ----- */

    stylesXml() {
      const o = this.opts;
      const font = x(this.wordFont(o.fontCss || 'Calibri'));
      const sz = Math.round(o.size * 2);
      const line = Math.round(240 * o.lineHeight);
      const heading = (n, size, before, after) =>
        '<w:style w:type="paragraph" w:styleId="Heading' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>' +
        '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="' + before + '" w:after="' + after + '"/><w:outlineLvl w:val="' + (n - 1) + '"/></w:pPr>' +
        '<w:rPr><w:b/><w:bCs/><w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr></w:style>';
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:styles xmlns:w="' + NS.w + '">' +
        '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:cs="' + font + '" w:eastAsia="' + font + '"/>' +
        '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:lang w:val="' + x(o.lang || 'en-US') + '"/></w:rPr></w:rPrDefault>' +
        '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="' + line + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
        heading(1, Math.round(sz * 2), 360, 120) + heading(2, Math.round(sz * 1.5), 300, 100) + heading(3, Math.round(sz * 1.25), 240, 80) +
        heading(4, Math.round(sz * 1.1), 200, 60) + heading(5, sz, 200, 60) + heading(6, sz, 200, 60) +
        '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="1155CC"/><w:u w:val="single"/></w:rPr></w:style>' +
        '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>' +
        ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="BFC4CC"/>').join('') +
        '</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
        '</w:styles>';
    }

    numberingXml() {
      const bullets = ['•', '◦', '▪'];
      const fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
      let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="' + NS.w + '">';
      s += '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>';
      for (let i = 0; i < 9; i++) {
        s += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + bullets[i % 3] + '"/><w:lvlJc w:val="left"/>' +
          '<w:pPr><w:ind w:left="' + (720 * (i + 1)) + '" w:hanging="360"/></w:pPr></w:lvl>';
      }
      s += '</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>';
      for (let i = 0; i < 9; i++) {
        s += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmts[i % 3] + '"/><w:lvlText w:val="%' + (i + 1) + '."/><w:lvlJc w:val="left"/>' +
          '<w:pPr><w:ind w:left="' + (720 * (i + 1)) + '" w:hanging="360"/></w:pPr></w:lvl>';
      }
      s += '</w:abstractNum>';
      // each ordered list: the usual levels, with its own in its own format
      for (const n of this.orderedNums) {
        s += '<w:abstractNum w:abstractNumId="' + (100 + n.numId) + '"><w:multiLevelType w:val="hybridMultilevel"/>';
        for (let i = 0; i < 9; i++) {
          const own = i === (n.ilvl || 0) && n.fmt;
          s += '<w:lvl w:ilvl="' + i + '"><w:start w:val="' + (own ? n.start : 1) + '"/><w:numFmt w:val="' + (own ? n.fmt : fmts[i % 3]) + '"/>' +
            '<w:lvlText w:val="' + x(own ? n.text : '%' + (i + 1) + '.') + '"/><w:lvlJc w:val="left"/>' +
            '<w:pPr><w:ind w:left="' + (own ? n.left : 720 * (i + 1)) + '" w:hanging="' + (own ? n.hanging : 360) + '"/></w:pPr></w:lvl>';
        }
        s += '</w:abstractNum>';
      }
      s += '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
      for (const n of this.orderedNums) s += '<w:num w:numId="' + n.numId + '"><w:abstractNumId w:val="' + (100 + n.numId) + '"/></w:num>';
      return s + '</w:numbering>';
    }
  }

  async function exportDocx(root, opts) {
    const o = Object.assign({ title: 'Document', size: 12, lineHeight: 1.15, page: 'letter', margins: 'normal', fontCss: 'Calibri' }, opts);
    const wr = new Writer(o);
    await Promise.all(Array.from(root.querySelectorAll('img')).map(async (img) => {
      try { const info = await imageBytes(img); if (info) wr.images.set(img, info); } catch (e) { /* unreachable image: skipped */ }
    }));
    const body = [];
    wr.blocks(root, { container: root }, body);
    if (!body.length) body.push('<w:p/>');

    const [pw, ph] = PAGE[o.page] || PAGE.letter;
    const [mt, mr, mb, ml] = wr.pgMar;
    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="' + NS.w + '" xmlns:r="' + NS.r + '" xmlns:wp="' + NS.wp + '" xmlns:a="' + NS.a + '" xmlns:pic="' + NS.pic + '">' +
      '<w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="' + pw + '" w:h="' + ph + '"/><w:pgMar w:top="' + mt + '" w:right="' + mr + '" w:bottom="' + mb + '" w:left="' + ml + '" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';

    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + NS.rel + '">' +
      '<Relationship Id="rId1" Type="' + REL.styles + '" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="' + REL.numbering + '" Target="numbering.xml"/>' +
      wr.rels.map((r) => '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + x(r.target) + '"' + (r.external ? ' TargetMode="External"' : '') + '/>').join('') +
      '</Relationships>';

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x(o.title) + '</dc:title><dc:creator>Noteshack</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '</cp:coreProperties>';

    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>';

    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + NS.rel + '">' +
      '<Relationship Id="rId1" Type="' + REL.doc + '" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="' + REL.core + '" Target="docProps/core.xml"/></Relationships>';

    const files = [
      { name: '[Content_Types].xml', data: types },
      { name: '_rels/.rels', data: rootRels },
      { name: 'docProps/core.xml', data: core },
      { name: 'word/document.xml', data: docXml },
      { name: 'word/styles.xml', data: wr.stylesXml() },
      { name: 'word/numbering.xml', data: wr.numberingXml() },
      { name: 'word/_rels/document.xml.rels', data: docRels },
      ...wr.media.map((mm) => ({ name: 'word/media/' + mm.file, data: mm.bytes }))
    ];
    return NpZip.write(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  /* ================= import ================= */

  const HIGHLIGHT = {
    yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
    darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
    darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff'
  };

  const kids = (el, name) => (el ? Array.from(el.children).filter((c) => !name || c.localName === name) : []);
  const kid = (el, name) => kids(el, name)[0] || null;
  const attr = (el, name) => (el ? el.getAttributeNS(NS.w, name) || el.getAttribute('w:' + name) : null);
  const on = (el) => !!el && !/^(0|false|off|none)$/i.test(attr(el, 'val') || '');
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function bytesToB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // Word works out each paragraph's and run's formatting from layers (ECMA-376
  // §17.7.2), each setting only what it names: the document's defaults, the
  // paragraph's style and the styles it is based on, the list level for a
  // numbered paragraph, the run's character style, and last what is set on
  // the paragraph or run itself. Lists are numbered as Word numbers them:
  // counted per list wherever their items are, a level counting again after
  // an item above it, each number drawn from its level's text ("%1.", "(%2)",
  // "%1.%2."…). The document's base font, size, line spacing, paper and
  // margins become its page settings; what differs from them is kept on the
  // paragraph or run.
  async function importDocx(buffer) {
    const zip = await NpZip.read(buffer);
    const parse = (s) => (s ? new DOMParser().parseFromString(s, 'application/xml') : null);
    const doc = parse(await zip.text('word/document.xml'));
    if (!doc) throw new Error(_('That file has no Word document inside it.'));
    const rels = parse(await zip.text('word/_rels/document.xml.rels'));
    const stylesXml = parse(await zip.text('word/styles.xml'));
    const numbering = parse(await zip.text('word/numbering.xml'));
    const theme = parse(await zip.text('word/theme/theme1.xml'));

    const relMap = new Map();
    if (rels) for (const r of rels.getElementsByTagName('Relationship')) relMap.set(r.getAttribute('Id'), r.getAttribute('Target'));

    // the theme's fonts, which styles may name instead of a font
    const themeFont = {};
    if (theme) {
      for (const [k, tag] of [['major', 'majorFont'], ['minor', 'minorFont']]) {
        const f = theme.getElementsByTagNameNS(NS.a, tag)[0];
        const latin = f && f.getElementsByTagNameNS(NS.a, 'latin')[0];
        if (latin && latin.getAttribute('typeface')) themeFont[k] = latin.getAttribute('typeface');
      }
    }
    const tw = (el, name) => {
      const v = attr(el, name);
      return v == null || v === '' ? null : parseInt(v, 10);
    };

    // what a pPr names: indent (twips), spacing (twips; line in 240ths, or
    // twips for exact and at least), alignment, list, contextual spacing
    function readP(pPr) {
      const p = {};
      if (!pPr) return p;
      const ind = kid(pPr, 'ind');
      if (ind) {
        p.ind = {};
        const left = tw(ind, 'left') != null ? tw(ind, 'left') : tw(ind, 'start');
        const right = tw(ind, 'right') != null ? tw(ind, 'right') : tw(ind, 'end');
        if (left != null) p.ind.left = left;
        if (right != null) p.ind.right = right;
        if (tw(ind, 'hanging') != null) p.ind.hanging = tw(ind, 'hanging');
        if (tw(ind, 'firstLine') != null) p.ind.firstLine = tw(ind, 'firstLine');
      }
      const sp = kid(pPr, 'spacing');
      if (sp) {
        if (tw(sp, 'before') != null) p.before = tw(sp, 'before');
        if (tw(sp, 'after') != null) p.after = tw(sp, 'after');
        // "auto" spacing: 14pt, as Word sets it
        const yes = (v) => !!v && !/^(0|false|off)$/i.test(v);
        if (yes(attr(sp, 'beforeAutospacing'))) p.before = 280;
        if (yes(attr(sp, 'afterAutospacing'))) p.after = 280;
        if (tw(sp, 'line') != null) { p.line = tw(sp, 'line'); p.lineRule = attr(sp, 'lineRule') || 'auto'; }
      }
      const jc = attr(kid(pPr, 'jc'), 'val');
      if (jc) p.jc = jc;
      const numPr = kid(pPr, 'numPr');
      if (numPr) {
        if (attr(kid(numPr, 'numId'), 'val') != null) p.numId = attr(kid(numPr, 'numId'), 'val');
        if (attr(kid(numPr, 'ilvl'), 'val') != null) p.ilvl = parseInt(attr(kid(numPr, 'ilvl'), 'val'), 10) || 0;
      }
      if (kid(pPr, 'contextualSpacing')) p.contextual = on(kid(pPr, 'contextualSpacing'));
      if (kid(pPr, 'pageBreakBefore')) p.pageBreakBefore = on(kid(pPr, 'pageBreakBefore'));
      return p;
    }
    // layers over one another: a later layer's first-line indent and hanging
    // indent replace each other
    function mergeP(...layers) {
      const out = { ind: {} };
      for (const l of layers) {
        if (!l) continue;
        for (const [k, v] of Object.entries(l)) if (k !== 'ind') out[k] = v;
        if (l.ind) {
          if ('firstLine' in l.ind || 'hanging' in l.ind) { delete out.ind.firstLine; delete out.ind.hanging; }
          Object.assign(out.ind, l.ind);
        }
      }
      return out;
    }

    // what an rPr names. b, i, caps, small caps, strike and hidden are
    // toggles: a character style over a paragraph style that both set one
    // turns it off again
    const TOGGLES = ['b', 'i', 'caps', 'smallCaps', 'strike', 'vanish'];
    function readR(rPr) {
      const r = {};
      if (!rPr) return r;
      for (const k of ['b', 'i', 'caps', 'smallCaps', 'vanish']) if (kid(rPr, k)) r[k] = on(kid(rPr, k));
      if (kid(rPr, 'strike') || kid(rPr, 'dstrike')) r.strike = on(kid(rPr, 'strike')) || on(kid(rPr, 'dstrike'));
      const u = kid(rPr, 'u');
      if (u) r.u = attr(u, 'val') !== 'none';
      const color = attr(kid(rPr, 'color'), 'val');
      if (color) r.color = /^[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : null;
      const sz = tw(kid(rPr, 'sz'), 'val');
      if (sz) r.sz = sz;
      const fonts = kid(rPr, 'rFonts');
      if (fonts) {
        const theme = attr(fonts, 'asciiTheme') || attr(fonts, 'hAnsiTheme');
        const name = attr(fonts, 'ascii') || attr(fonts, 'hAnsi') || (theme && themeFont[/^major/.test(theme) ? 'major' : 'minor']);
        if (name) r.font = name;
      }
      const hl = attr(kid(rPr, 'highlight'), 'val');
      if (hl) r.highlight = HIGHLIGHT[hl] || null;
      const shd = attr(kid(rPr, 'shd'), 'fill');
      if (shd) r.shd = /^[0-9a-f]{6}$/i.test(shd) && shd.toUpperCase() !== 'FFFFFF' ? '#' + shd : null;
      const va = attr(kid(rPr, 'vertAlign'), 'val');
      if (va) r.va = va;
      return r;
    }

    // styles: their own layer, and their name
    const styleById = new Map();
    let defaultPStyle = null;
    let defaults = { p: {}, r: {} };
    if (stylesXml) {
      const dd = stylesXml.getElementsByTagNameNS(NS.w, 'docDefaults')[0];
      if (dd) defaults = { p: readP(kid(kid(dd, 'pPrDefault'), 'pPr')), r: readR(kid(kid(dd, 'rPrDefault'), 'rPr')) };
      for (const s of stylesXml.getElementsByTagNameNS(NS.w, 'style')) {
        const id = attr(s, 'styleId');
        styleById.set(id, {
          type: attr(s, 'type'), name: (attr(kid(s, 'name'), 'val') || '').toLowerCase(),
          basedOn: attr(kid(s, 'basedOn'), 'val'), p: readP(kid(s, 'pPr')), r: readR(kid(s, 'rPr'))
        });
        if (attr(s, 'type') === 'paragraph' && /^(1|true|on)$/i.test(attr(s, 'default') || '')) defaultPStyle = id;
      }
    }
    // a style with the styles it is based on, the deepest first
    function chain(id) {
      const out = [];
      const seen = new Set();
      while (id && styleById.has(id) && !seen.has(id)) {
        seen.add(id);
        out.unshift(styleById.get(id));
        id = styleById.get(id).basedOn;
      }
      return out;
    }
    const styleP = (id) => mergeP(...chain(id).map((s) => s.p));
    const styleR = (id) => Object.assign({}, ...chain(id).map((s) => s.r));
    const nameOf = (id) => (styleById.get(id) || {}).name || '';

    // lists: each level's start, number format, text, indent and restart
    const abstracts = new Map();
    const nums = new Map();
    if (numbering) {
      const readLvl = (l) => ({
        start: tw(kid(l, 'start'), 'val') != null ? tw(kid(l, 'start'), 'val') : 0,
        fmt: attr(kid(l, 'numFmt'), 'val') || 'decimal',
        text: attr(kid(l, 'lvlText'), 'val'),
        restart: tw(kid(l, 'lvlRestart'), 'val'),
        legal: !!kid(l, 'isLgl'),
        p: readP(kid(l, 'pPr'))
      });
      for (const a of numbering.getElementsByTagNameNS(NS.w, 'abstractNum')) {
        const levels = [];
        for (const l of kids(a, 'lvl')) levels[parseInt(attr(l, 'ilvl'), 10) || 0] = readLvl(l);
        abstracts.set(attr(a, 'abstractNumId'), { levels, link: attr(kid(a, 'numStyleLink'), 'val') });
      }
      for (const n of numbering.getElementsByTagNameNS(NS.w, 'num')) {
        const over = new Map();
        for (const o of kids(n, 'lvlOverride')) {
          const i = parseInt(attr(o, 'ilvl'), 10) || 0;
          over.set(i, { start: tw(kid(o, 'startOverride'), 'val'), lvl: kid(o, 'lvl') ? readLvl(kid(o, 'lvl')) : null });
        }
        nums.set(attr(n, 'numId'), { abstract: attr(kid(n, 'abstractNumId'), 'val'), over });
      }
    }
    // an abstract list that only points at a numbering style uses that
    // style's list
    function abstractOf(numId, depth = 0) {
      const n = nums.get(numId);
      const a = n && abstracts.get(n.abstract);
      if (a && a.link && depth < 4) {
        const sid = [...styleById.entries()].find(([id, s]) => id === a.link || s.name === a.link.toLowerCase());
        const linked = sid && styleP(sid[0]).numId;
        if (linked && linked !== numId) return abstractOf(linked, depth + 1);
      }
      return a ? { id: n.abstract, a } : null;
    }
    function levelOf(numId, ilvl) {
      const n = nums.get(numId);
      const found = abstractOf(numId);
      if (!n || !found) return null;
      const o = n.over.get(ilvl);
      const lvl = Object.assign({}, (o && o.lvl) || found.a.levels[ilvl] || found.a.levels[0] || { start: 1, fmt: 'decimal', text: '%' + (ilvl + 1) + '.', p: {} });
      if (o && o.start != null) lvl.start = o.start;
      lvl.ilvl = ilvl;
      // a list that sets its own start counts on its own; others share
      // their abstract list's count
      lvl.counter = [...n.over.values()].some((v) => v.start != null) ? 'n' + numId : 'a' + found.id;
      return lvl;
    }

    const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    const roman = (n) => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };
    const letters = (n) => { let s = ''; const k = Math.max(1, n); const ch = String.fromCharCode(96 + ((k - 1) % 26) + 1); for (let i = 0; i <= (k - 1) / 26 | 0; i++) s += ch; return s; };
    const ORD = (n) => n + (/1[123]$/.test(n) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
    function formatNum(n, fmt) {
      switch (fmt) {
        case 'lowerLetter': return letters(n);
        case 'upperLetter': return letters(n).toUpperCase();
        case 'lowerRoman': return roman(n);
        case 'upperRoman': return roman(n).toUpperCase();
        case 'decimalZero': return (n < 10 ? '0' : '') + n;
        case 'ordinal': return ORD(n);
        case 'none': return '';
        default: return String(n);
      }
    }

    // counts, per list and level, as Word keeps them
    const counts = new Map();
    function countItem(numId, ilvl) {
      const lvl = levelOf(numId, ilvl);
      if (!lvl) return null;
      if (!counts.has(lvl.counter)) counts.set(lvl.counter, { at: [] });
      const c = counts.get(lvl.counter);
      c.at[ilvl] = c.at[ilvl] == null ? lvl.start : c.at[ilvl] + 1;
      // the levels below count again after this one, unless a level says
      // it counts on (restart 0) or counts again only after a higher level
      // (restart n: after an item at level n, counted from 1)
      for (let d = ilvl + 1; d < c.at.length; d++) {
        const dl = levelOf(numId, d);
        if (!dl || dl.restart == null || (dl.restart !== 0 && ilvl < dl.restart)) c.at[d] = null;
      }
      const marker = lvl.fmt === 'bullet' ? (lvl.text || '•') : (lvl.text == null ? formatNum(c.at[ilvl], lvl.fmt) + '.' :
        lvl.text.replace(/%([1-9])/g, (m, d) => {
          const i = +d - 1;
          const li = levelOf(numId, i);
          const v = c.at[i] == null ? (li ? li.start : 1) : c.at[i];
          return formatNum(v, lvl.legal && i !== ilvl ? 'decimal' : (li ? li.fmt : 'decimal'));
        }));
      return { lvl, n: c.at[ilvl], marker };
    }

    // the document's base: the default paragraph style's formatting
    const baseP = mergeP(defaults.p, styleP(defaultPStyle));
    const baseR = Object.assign({}, defaults.r, styleR(defaultPStyle));
    const baseSize = (baseR.sz || 20) / 2;
    const baseLine = lineHeightOf(baseP) || 1.15;
    const sect = doc.getElementsByTagNameNS(NS.w, 'sectPr');
    const lastSect = sect[sect.length - 1];
    const pgW = tw(kid(lastSect, 'pgSz'), 'w');
    const pgMar = kid(lastSect, 'pgMar');
    const pgLeft = tw(pgMar, 'left');
    const settings = {
      size: Math.round(baseSize * 2) / 2,
      lineHeight: Math.round(baseLine * 100) / 100,
      paper: pgW && Math.abs(pgW - 11906) < 120 ? 'a4' : 'letter',
      margins: pgLeft == null ? 'normal' : pgLeft < 1080 ? 'narrow' : pgLeft > 1800 ? 'wide' : 'normal'
    };
    // and the file's own margins, side by side (inches)
    if (pgMar) settings.marginsIn = ['top', 'right', 'bottom', 'left'].map((k) => Math.round(Math.max(0, tw(pgMar, k) || 0) / 1440 * 100) / 100);
    const FONT_KEYS = { arial: 'arial', verdana: 'verdana', 'trebuchet ms': 'trebuchet', georgia: 'georgia', 'times new roman': 'times', garamond: 'garamond', 'courier new': 'mono' };
    if (baseR.font && FONT_KEYS[baseR.font.toLowerCase()]) settings.font = FONT_KEYS[baseR.font.toLowerCase()];
    // the font every paragraph has unless it says otherwise
    const pageFont = settings.font ? baseR.font.toLowerCase() : null;

    // Word's line spacing as CSS: a multiple of single spacing (a font's own
    // line, about 1.15 of its size), or an exact height in points
    function lineHeightOf(p) {
      if (p.line == null) return null;
      if (p.lineRule === 'exact' || p.lineRule === 'atLeast') return null;
      return (p.line / 240) * 1.15;
    }
    const pt = (twips) => Math.round(twips / 20 * 10) / 10 + 'pt';
    const px = (twips) => Math.round(twips / 15) + 'px';

    const images = new Map();
    async function imageFor(rid) {
      if (images.has(rid)) return images.get(rid);
      const target = relMap.get(rid);
      let src = null;
      if (target) {
        const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
        const bytes = await zip.bytes(path);
        if (bytes) {
          const ext = (path.split('.').pop() || 'png').toLowerCase();
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/png';
          src = 'data:' + mime + ';base64,' + bytesToB64(bytes);
        }
      }
      images.set(rid, src);
      return src;
    }

    // a run's formatting: the paragraph's (its style over the defaults),
    // its character style (toggles turning off what both set), then its own
    function runProps(pr, rPr) {
      const own = readR(rPr);
      const rStyle = attr(kid(rPr, 'rStyle'), 'val');
      const r = Object.assign({}, pr);
      if (rStyle) {
        const c = styleR(rStyle);
        for (const [k, v] of Object.entries(c)) r[k] = TOGGLES.includes(k) && v && pr[k] ? false : v;
        r.code = /verbatim|code|source|html (code|typewriter)/.test(nameOf(rStyle));
        r.link = /hyperlink/.test(nameOf(rStyle));
      }
      return Object.assign(r, own);
    }

    // a run as HTML: what differs from the paragraph it is in (ctx: the
    // formatting the paragraph's own tag already shows)
    async function runHtml(run, pr, ctx) {
      const rPr = kid(run, 'rPr');
      const r = runProps(pr, rPr);
      if (r.vanish) return '';
      let html = '';
      for (const c of kids(run)) {
        const n = c.localName;
        if (n === 't') html += escHtml(c.textContent);
        else if (n === 'tab' || n === 'ptab') html += '\t';
        else if (n === 'br') html += attr(c, 'type') === 'page' ? '\u0001PAGEBREAK\u0001' : '<br>';
        else if (n === 'cr') html += '<br>';
        else if (n === 'noBreakHyphen') html += '‑';
        else if (n === 'softHyphen') html += '­';
        else if (n === 'sym') html += escHtml(String.fromCharCode(parseInt(attr(c, 'char') || '20', 16) % 0xf000 || 0x20));
        else if (n === 'drawing' || n === 'pict' || n === 'object') {
          for (const blip of c.getElementsByTagNameNS(NS.a, 'blip')) {
            const src = await imageFor(blip.getAttributeNS(NS.r, 'embed'));
            if (src) html += '<img src="' + src + '" alt="">';
          }
          for (const im of c.getElementsByTagName('v:imagedata')) {
            const src = await imageFor(im.getAttributeNS(NS.r, 'id'));
            if (src) html += '<img src="' + src + '" alt="">';
          }
        }
      }
      if (!html) return html;
      const st = [];
      if (r.font && r.font.toLowerCase() !== (ctx.font || '').toLowerCase()) st.push('font-family: ' + (/[\s\d]/.test(r.font) ? '"' + r.font + '"' : r.font));
      if (r.sz && r.sz / 2 !== ctx.size) st.push('font-size: ' + (r.sz / 2) + 'pt');
      if (r.color && r.color !== '000000') st.push('color: #' + r.color);
      const bg = r.highlight || r.shd;
      if (bg) st.push('background-color: ' + bg);
      if (r.caps) st.push('text-transform: uppercase');
      else if (r.smallCaps) st.push('font-variant: small-caps');
      if (!r.b && ctx.b) st.push('font-weight: normal');
      if (!r.i && ctx.i) st.push('font-style: normal');
      if (st.length) html = '<span style="' + escHtml(st.join('; ')) + '">' + html + '</span>';
      if (r.va === 'superscript') html = '<sup>' + html + '</sup>';
      if (r.va === 'subscript') html = '<sub>' + html + '</sub>';
      if (r.strike) html = '<s>' + html + '</s>';
      if (r.u && !r.link) html = '<u>' + html + '</u>';
      if (r.i && !ctx.i) html = '<em>' + html + '</em>';
      if (r.b && !ctx.b) html = '<strong>' + html + '</strong>';
      if (r.code) html = '<code>' + html + '</code>';
      return html;
    }

    async function inlineHtml(container, pr, ctx) {
      let html = '';
      for (const c of kids(container)) {
        const n = c.localName;
        if (n === 'r') html += await runHtml(c, pr, ctx);
        else if (n === 'hyperlink') {
          const id = c.getAttributeNS(NS.r, 'id');
          const href = id ? relMap.get(id) : null;
          const inner = await inlineHtml(c, pr, ctx);
          html += href ? '<a href="' + escHtml(href) + '">' + inner + '</a>' : inner;
        } else if (['ins', 'smartTag', 'fldSimple', 'customXml', 'bdo', 'dir', 'moveTo'].includes(n)) html += await inlineHtml(c, pr, ctx);
        else if (n === 'sdt') html += await inlineHtml(kid(c, 'sdtContent'), pr, ctx);
      }
      return html;
    }

    async function paragraph(p) {
      const pPr = kid(p, 'pPr');
      const styleId = attr(kid(pPr, 'pStyle'), 'val') || defaultPStyle;
      const own = readP(pPr);
      const sP = styleP(styleId);
      // its list: its own, or its style's
      const numId = own.numId != null ? own.numId : sP.numId;
      const ilvl = own.ilvl != null ? own.ilvl : (sP.ilvl || 0);
      const item = numId && numId !== '0' ? countItem(numId, ilvl) : null;
      // a list level's indent stands over the paragraph style's, unless
      // that style is what put the paragraph in the list and sets its own
      const styleList = own.numId == null && sP.numId != null;
      const props = item && !(styleList && Object.keys(sP.ind).length)
        ? mergeP(defaults.p, sP, item.lvl.p, own) : mergeP(defaults.p, item && item.lvl.p, sP, own);
      const style = nameOf(styleId);
      let tag = 'p';
      const hm = style.match(/^heading (\d)/);
      if (hm) tag = 'h' + Math.min(6, +hm[1]);
      else if (style === 'title') tag = 'h1';
      else if (style === 'subtitle') tag = 'h2';
      // (a quote style is a paragraph laid out as its style says: its own
      // indent, not a quote's bar and indent on top)
      else if (/source code|^code|preformatted|^plain text|verbatim/.test(style)) tag = 'pre';
      const pr = Object.assign({}, defaults.r, styleR(styleId));
      const heading = /^h\d$/.test(tag);
      // what the paragraph's tag already shows: the page's font and size,
      // or for a heading, bold (and the run's own size, always written)
      const ctx = { font: pageFont, size: heading ? null : settings.size, b: heading, i: false };
      let inner = await inlineHtml(p, pr, ctx);
      const breaks = inner.split('\u0001PAGEBREAK\u0001');
      inner = breaks.join('');
      return { tag, inner, props, item, styleId, pageBreaks: breaks.length - 1 + (props.pageBreakBefore ? 1 : 0), breakFirst: !!props.pageBreakBefore };
    }

    async function table(tbl) {
      let html = '<table><tbody>';
      let first = true;
      for (const tr of kids(tbl, 'tr')) {
        const header = first && !!kid(kid(tr, 'trPr'), 'tblHeader');
        html += '<tr>';
        for (const tc of kids(tr, 'tc')) {
          const tcPr = kid(tc, 'tcPr');
          const span = parseInt(attr(kid(tcPr, 'gridSpan'), 'val') || '1', 10);
          const cell = header ? 'th' : 'td';
          const content = await body(tc);
          html += '<' + cell + (span > 1 ? ' colspan="' + span + '"' : '') + '>' + (content || '<br>') + '</' + cell + '>';
        }
        html += '</tr>';
        first = false;
      }
      return html + '</tbody></table>';
    }

    // the CSS for a paragraph's box: its indent from the page margin (left
    // edge, and its first line in from that or hanging out of it), right
    // indent, spacing above and below, line spacing, alignment
    function boxCss(p, opts) {
      const st = [];
      const ind = p.props.ind || {};
      const first = (ind.firstLine || 0) - (ind.hanging || 0);
      if (!opts.list) {
        if (ind.left) st.push('margin-left: ' + px(ind.left));
        if (first) st.push('text-indent: ' + px(first));
      }
      if (ind.right) st.push('margin-right: ' + px(ind.right));
      // a heading's spacing is written even when none, over the page's own
      if (opts.before || opts.always) st.push('margin-top: ' + pt(opts.before || 0));
      if (opts.after || opts.always) st.push('margin-bottom: ' + pt(opts.after || 0));
      if (p.props.line != null) {
        if (p.props.lineRule === 'exact' || p.props.lineRule === 'atLeast') st.push('line-height: ' + pt(p.props.line));
        else {
          const lh = Math.round(lineHeightOf(p.props) * 100) / 100;
          if (Math.abs(lh - settings.lineHeight) > 0.01) st.push('line-height: ' + lh);
        }
      }
      const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[p.props.jc];
      if (align) st.push('text-align: ' + align);
      return st.length ? ' style="' + st.join('; ') + ';"' : '';
    }

    // a list's marker as a list can draw it: the HTML list type, and a
    // class for markers other than "1." ("1)", "(1)", "1.1.")
    function listShape(item) {
      const { lvl } = item;
      if (lvl.fmt === 'bullet') return { kind: 'ul' };
      const TYPES = { decimal: '1', lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I' };
      const type = TYPES[lvl.fmt];
      const own = lvl.text || '';
      const me = /%([1-9])/g;
      const refs = [...own.matchAll(me)].map((m) => +m[1]);
      if (!type || !refs.length) return null;
      const lastRef = refs[refs.length - 1];
      const skeleton = own.replace(me, '#');
      if (refs.length === 1 && skeleton === '#.') return { kind: 'ol', type };
      if (refs.length === 1 && skeleton === '#') return { kind: 'ol', type, cls: 'np-plain' };
      if (refs.length === 1 && skeleton === '#)') return { kind: 'ol', type, cls: 'np-rp' };
      if (refs.length === 1 && skeleton === '(#)') return { kind: 'ol', type, cls: 'np-pp' };
      // "1.1.", "1.1": every level written in numbers, in order
      if (refs.length > 1 && type === '1' && lastRef === refs.length && refs.every((r, i) => r === i + 1) && /^#(\.#)+\.?$/.test(skeleton)) {
        return { kind: 'ol', type, cls: skeleton.endsWith('.') ? 'np-outline' : 'np-outline-bare', depth: refs.length };
      }
      return null;
    }

    async function body(container) {
      const blocks = [];
      const collect = (el) => {
        for (const c of kids(el)) {
          if (c.localName === 'sdt') collect(kid(c, 'sdtContent') || c);
          else if (c.localName === 'customXml') collect(c);
          else blocks.push(c);
        }
      };
      collect(container);
      const items = [];
      for (const c of blocks) {
        if (c.localName === 'p') items.push({ p: await paragraph(c) });
        else if (c.localName === 'tbl') items.push({ table: c });
      }
      const blank = (p) => !p.item && !p.pageBreaks && !/<img/i.test(p.inner) && !p.inner.replace(/<[^>]*>|\s|&nbsp;| /g, '');
      // the spacing above and below a paragraph, as Word sets it: none
      // between two paragraphs of a style with contextual spacing
      const spacing = (i) => {
        const p = items[i].p;
        const prev = items[i - 1] && items[i - 1].p;
        const next = items[i + 1] && items[i + 1].p;
        const ctxOff = (o) => p.props.contextual && o && o.styleId === p.styleId;
        return { before: ctxOff(prev) ? 0 : p.props.before || 0, after: ctxOff(next) ? 0 : p.props.after || 0 };
      };

      let html = '';
      const stack = []; // open lists: { kind, ilvl, key, textLeft }
      const closeTo = (depth) => { while (stack.length > depth) html += '</li></' + stack.pop().kind + '>'; };
      // the height an empty line between list items left, carried to the next item
      let gap = 0;
      const lineOf = (p) => {
        const size = settings.size;
        const lh = p.props.lineRule === 'exact' ? p.props.line / 20 : size * (lineHeightOf(p.props) || settings.lineHeight);
        return lh + (p.props.before || 0) / 20 + (p.props.after || 0) / 20;
      };
      const nextIsItem = (i) => {
        for (let j = i + 1; j < items.length; j++) {
          if (items[j].p && blank(items[j].p)) continue;
          return !!(items[j].p && items[j].p.item && listShape(items[j].p.item));
        }
        return false;
      };
      for (const [i, entry] of items.entries()) {
        if (entry.table) { closeTo(0); html += await table(entry.table); continue; }
        const p = entry.p;
        if (p.breakFirst) { closeTo(0); html += '<hr class="page-break">'; }
        const sp = spacing(i);
        const shape = p.item && listShape(p.item);
        if (shape) {
          const ind = p.props.ind || {};
          const textLeft = (ind.left || 0);
          // the hanging indent its marker sits in (half an inch where its
          // level gives none)
          const hang = (ind.hanging != null ? ind.hanging : Math.max(0, -(ind.firstLine || 0))) || 360;
          const key = p.item.lvl.counter;
          // another list starts on its own, at its indent from the page
          if (stack.length && stack[stack.length - 1].key !== key) closeTo(0);
          // close lists deeper than this item's, or other lists at its depth
          while (stack.length && stack[stack.length - 1].textLeft > textLeft + 10) closeTo(stack.length - 1);
          const top = stack[stack.length - 1];
          if (top && Math.abs(top.textLeft - textLeft) <= 10 && (top.kind !== shape.kind || top.key !== key || top.type !== shape.type || top.cls !== shape.cls)) closeTo(stack.length - 1);
          const liStyle = boxCss(p, { list: true, before: sp.before + Math.round(gap * 20), after: sp.after });
          gap = 0;
          if (stack.length && Math.abs(stack[stack.length - 1].textLeft - textLeft) <= 10) html += '</li><li' + liStyle + '>';
          else {
            // the list's box: its markers in the hanging indent, its text at
            // the level's indent from the page margin
            const parentLeft = stack.length ? stack[stack.length - 1].textLeft : 0;
            const n = p.item.n;
            const attrs = (shape.kind === 'ol' && n !== 1 ? ' start="' + n + '"' : '') +
              (shape.type && shape.type !== '1' ? ' type="' + shape.type + '"' : '') +
              (shape.cls ? ' class="' + shape.cls + '"' : '') +
              ' style="margin-left: ' + px(Math.max(0, textLeft - hang - parentLeft)) + '; padding-left: ' + px(hang) + ';"';
            html += '<' + shape.kind + attrs + '><li' + liStyle + '>';
            stack.push({ kind: shape.kind, key, type: shape.type, cls: shape.cls, textLeft });
          }
          html += p.inner || '<br>';
        } else if (stack.length && blank(p) && nextIsItem(i)) {
          // an empty line between a list's items: the list goes on, and the
          // next item keeps the space it made
          gap += lineOf(p);
        } else if (p.item) {
          // a number no list can draw ("Article 1.", "§ 1"): written out,
          // in its hanging indent
          closeTo(0);
          html += '<' + p.tag + boxCss(p, { before: sp.before, after: sp.after, always: /^h\d$/.test(p.tag) }) + '>' + escHtml(p.item.marker) + '\t' + (p.inner || '') + '</' + p.tag + '>';
        } else if (p.tag === 'pre' && html.endsWith('</pre>')) {
          html = html.slice(0, -6) + '\n' + p.inner.replace(/<br>/g, '\n') + '</pre>';
        } else {
          closeTo(0);
          gap = 0;
          const inner = p.tag === 'pre' ? p.inner.replace(/<\/?code>/g, '').replace(/<br>/g, '\n') : (p.inner || '<br>');
          html += '<' + p.tag + boxCss(p, { before: sp.before, after: sp.after, always: /^h\d$/.test(p.tag) }) + '>' + inner + '</' + p.tag + '>';
        }
        for (let k = p.breakFirst ? 1 : 0; k < p.pageBreaks; k++) { closeTo(0); html += '<hr class="page-break">'; }
      }
      closeTo(0);
      return html;
    }

    const bodyEl = doc.getElementsByTagNameNS(NS.w, 'body')[0];
    return { html: bodyEl ? await body(bodyEl) : '', settings };
  }

  window.NpDocx = { export: exportDocx, import: importDocx };
})();
