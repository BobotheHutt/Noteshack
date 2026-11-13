/* Noteshack — Word (.docx) export and import.
   NpDocx.export(editorEl, opts) → Promise<Blob>
   NpDocx.import(arrayBuffer)    → Promise<string> (HTML; sanitize before use) */
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
      this.contentTw = pw - margin * 2;
    }

    rel(type, target, external) {
      const id = 'rId' + (this.rels.length + 10);
      this.rels.push({ id, type, target, external });
      return id;
    }

    newOrderedList(start) {
      const numId = this.orderedNums.length + 2;
      this.orderedNums.push({ numId, start: start || 1 });
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
      if (r.i) s += '<w:i/><w:iCs/>';
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
      let ind = ctx.indent || 0;
      if (ctx.list) {
        if (ctx.list.first && !ctx.list.check) {
          pPr += '<w:numPr><w:ilvl w:val="' + ctx.list.ilvl + '"/><w:numId w:val="' + ctx.list.numId + '"/></w:numPr>';
        } else {
          ind += (ctx.list.ilvl + 1) * 720;
        }
        ctx.list.first = false;
      }
      if (ctx.quote) pPr += '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9CED6"/></w:pBdr>';
      if (ctx.pre) pPr += '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>';
      if (ctx.pre) pPr += '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>';
      if (ind) pPr += '<w:ind w:left="' + ind + '"/>';
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
      const margin = parseInt(el.style && el.style.marginLeft, 10) || 0;
      const sub = Object.assign({}, ctx, { align, indent: (ctx.indent || 0) + margin * 15 });
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
      const numId = ordered ? this.newOrderedList(parseInt(el.getAttribute('start'), 10)) : 1;
      for (const child of el.children) {
        if (child.tagName === 'UL' || child.tagName === 'OL') {
          this.list(child, Object.assign({}, ctx, { list: { numId, ilvl, first: false } }), out);
          continue;
        }
        if (child.tagName !== 'LI') continue;
        const list = { numId, ilvl, first: true, check, checked: child.getAttribute('data-checked') === 'true' };
        const liCtx = Object.assign({}, ctx, { list, indent: check ? (ctx.indent || 0) + ilvl * 720 : ctx.indent });
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
      s += '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
      for (const n of this.orderedNums) {
        s += '<w:num w:numId="' + n.numId + '"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="' + n.start + '"/></w:lvlOverride></w:num>';
      }
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
    const m = MARGIN[o.margins] || MARGIN.normal;
    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="' + NS.w + '" xmlns:r="' + NS.r + '" xmlns:wp="' + NS.wp + '" xmlns:a="' + NS.a + '" xmlns:pic="' + NS.pic + '">' +
      '<w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="' + pw + '" w:h="' + ph + '"/><w:pgMar w:top="' + m + '" w:right="' + m + '" w:bottom="' + m + '" w:left="' + m + '" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
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

  async function importDocx(buffer) {
    const zip = await NpZip.read(buffer);
    const parse = (s) => (s ? new DOMParser().parseFromString(s, 'application/xml') : null);
    const doc = parse(await zip.text('word/document.xml'));
    if (!doc) throw new Error(_('That file has no Word document inside it.'));
    const rels = parse(await zip.text('word/_rels/document.xml.rels'));
    const styles = parse(await zip.text('word/styles.xml'));
    const numbering = parse(await zip.text('word/numbering.xml'));

    const relMap = new Map();
    if (rels) for (const r of rels.getElementsByTagName('Relationship')) relMap.set(r.getAttribute('Id'), r.getAttribute('Target'));

    const styleName = new Map();
    if (styles) for (const s of styles.getElementsByTagNameNS(NS.w, 'style')) {
      const n = kid(s, 'name');
      styleName.set(attr(s, 'styleId'), (attr(n, 'val') || '').toLowerCase());
    }

    // numId → ilvl → { kind: 'ul' | 'ol', type: the HTML list type ('1',
    // 'a', 'A', 'i', 'I'), start, left: the level's indent in twips }
    const numKind = new Map();
    const TYPES = { lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I' };
    if (numbering) {
      const abstract = new Map();
      for (const a of numbering.getElementsByTagNameNS(NS.w, 'abstractNum')) {
        const lv = new Map();
        for (const l of kids(a, 'lvl')) {
          const fmt = attr(kid(l, 'numFmt'), 'val');
          const ind = kid(kid(l, 'pPr'), 'ind');
          const left = parseInt(attr(ind, 'left') || attr(ind, 'start') || '', 10);
          lv.set(attr(l, 'ilvl'), { kind: fmt === 'bullet' ? 'ul' : 'ol', type: TYPES[fmt] || '1', start: parseInt(attr(kid(l, 'start'), 'val') || '1', 10), left });
        }
        abstract.set(attr(a, 'abstractNumId'), lv);
      }
      for (const n of numbering.getElementsByTagNameNS(NS.w, 'num')) {
        const lv = new Map([...(abstract.get(attr(kid(n, 'abstractNumId'), 'val')) || new Map())].map(([k, v]) => [k, Object.assign({}, v)]));
        for (const o of kids(n, 'lvlOverride')) {
          const at = lv.get(attr(o, 'ilvl'));
          const start = attr(kid(o, 'startOverride'), 'val');
          if (at && start) at.start = parseInt(start, 10);
        }
        numKind.set(attr(n, 'numId'), lv);
      }
    }

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

    async function runHtml(r) {
      const rPr = kid(r, 'rPr');
      const rStyle = styleName.get(attr(kid(rPr, 'rStyle'), 'val')) || '';
      let html = '';
      for (const c of kids(r)) {
        const n = c.localName;
        if (n === 't') html += escHtml(c.textContent);
        else if (n === 'tab') html += '\t';
        else if (n === 'br') html += attr(c, 'type') === 'page' ? '\u0001PAGEBREAK\u0001' : '<br>';
        else if (n === 'cr') html += '<br>';
        else if (n === 'noBreakHyphen') html += '‑';
        else if (n === 'drawing' || n === 'pict') {
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
      if (!html || !rPr) return html;
      const st = [];
      const color = attr(kid(rPr, 'color'), 'val');
      if (color && color !== 'auto' && color !== '000000') st.push('color: #' + color);
      const hl = attr(kid(rPr, 'highlight'), 'val');
      const shd = attr(kid(rPr, 'shd'), 'fill');
      if (hl && HIGHLIGHT[hl]) st.push('background-color: ' + HIGHLIGHT[hl]);
      else if (shd && /^[0-9a-f]{6}$/i.test(shd) && shd.toUpperCase() !== 'FFFFFF') st.push('background-color: #' + shd);
      const sz = parseInt(attr(kid(rPr, 'sz'), 'val'), 10);
      if (sz) st.push('font-size: ' + (sz / 2) + 'pt');
      const font = attr(kid(rPr, 'rFonts'), 'ascii');
      if (font) st.push('font-family: ' + (/\s/.test(font) ? '"' + font + '"' : font));
      if (st.length) html = '<span style="' + escHtml(st.join('; ')) + '">' + html + '</span>';
      const va = attr(kid(rPr, 'vertAlign'), 'val');
      if (va === 'superscript') html = '<sup>' + html + '</sup>';
      if (va === 'subscript') html = '<sub>' + html + '</sub>';
      if (on(kid(rPr, 'strike')) || on(kid(rPr, 'dstrike'))) html = '<s>' + html + '</s>';
      const u = kid(rPr, 'u');
      if (u && attr(u, 'val') !== 'none') html = '<u>' + html + '</u>';
      if (on(kid(rPr, 'i'))) html = '<em>' + html + '</em>';
      if (on(kid(rPr, 'b'))) html = '<strong>' + html + '</strong>';
      if (/verbatim|code|source|html (code|typewriter)/.test(rStyle)) html = '<code>' + html + '</code>';
      return html;
    }

    async function inlineHtml(container) {
      let html = '';
      for (const c of kids(container)) {
        const n = c.localName;
        if (n === 'r') html += await runHtml(c);
        else if (n === 'hyperlink') {
          const id = c.getAttributeNS(NS.r, 'id');
          const href = id ? relMap.get(id) : null;
          const inner = await inlineHtml(c);
          html += href ? '<a href="' + escHtml(href) + '">' + inner + '</a>' : inner;
        } else if (['ins', 'smartTag', 'fldSimple', 'customXml', 'bdo', 'dir'].includes(n)) html += await inlineHtml(c);
        else if (n === 'sdt') html += await inlineHtml(kid(c, 'sdtContent'));
      }
      return html;
    }

    async function paragraph(p) {
      const pPr = kid(p, 'pPr');
      const style = styleName.get(attr(kid(pPr, 'pStyle'), 'val')) || '';
      let inner = await inlineHtml(p);
      let tag = 'p';
      const hm = style.match(/^heading (\d)/);
      if (hm) tag = 'h' + Math.min(6, +hm[1]);
      else if (style === 'title') tag = 'h1';
      else if (style === 'subtitle') tag = 'h2';
      else if (/quote|block text/.test(style)) tag = 'blockquote';
      else if (/source code|^code|preformatted|^plain text|verbatim/.test(style)) tag = 'pre';
      const jc = attr(kid(pPr, 'jc'), 'val');
      const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc];
      const numPr = kid(pPr, 'numPr');
      let list = null;
      if (numPr && attr(kid(numPr, 'numId'), 'val') !== '0') {
        const numId = attr(kid(numPr, 'numId'), 'val');
        const ilvl = parseInt(attr(kid(numPr, 'ilvl'), 'val') || '0', 10);
        const lvl = (numKind.get(numId) && numKind.get(numId).get(String(ilvl))) || { kind: 'ul', type: '1', start: 1 };
        list = { numId, ilvl, kind: lvl.kind, type: lvl.type, start: lvl.start, left: lvl.left };
      }
      const breaks = inner.split('\u0001PAGEBREAK\u0001');
      inner = breaks.join('');
      return { tag, inner, align, list, pageBreaks: breaks.length - 1 };
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

    // Word numbers a list's items wherever they are: empty paragraphs and
    // other text may come between them, and the count goes on. So each item's
    // number is worked out as Word would (counts per list and level; a level's
    // count starts again after an item above it), each list is opened at that
    // number, and an empty paragraph between items of a list is left out, so
    // the list goes on. An item with no item above it (after other text) opens
    // a list of its own, indented to its level.
    const counts = new Map(); // numId → count at each level
    function numberOf(list) {
      if (!counts.has(list.numId)) counts.set(list.numId, []);
      const at = counts.get(list.numId);
      at[list.ilvl] = at[list.ilvl] == null ? list.start : at[list.ilvl] + 1;
      at.length = list.ilvl + 1;
      return at[list.ilvl];
    }
    // a paragraph with nothing in it but spaces and line breaks, styled or not
    // how far in a list that opens on its own sits: Word's indent for its
    // level, past the half inch (720 twips, 48px) of a first-level list
    const indentOf = (list) => Math.max(0, Number.isFinite(list.left) ? Math.round((list.left - 720) / 15) : list.ilvl * 40);
    const blank = (p) => !p.list && !p.pageBreaks && !/<img/i.test(p.inner) && !p.inner.replace(/<[^>]*>|\s|&nbsp;|\u00a0/g, '');

    async function body(container) {
      let html = '';
      const stack = []; // open lists: { kind, ilvl, numId }
      const closeTo = (depth) => {
        while (stack.length > depth) html += '</li></' + stack.pop().kind + '>';
      };
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
      const listNext = (i) => {
        for (let j = i + 1; j < items.length; j++) {
          if (items[j].p && blank(items[j].p)) continue;
          return !!(items[j].p && items[j].p.list);
        }
        return false;
      };
      for (const [i, item] of items.entries()) {
        if (item.table) {
          closeTo(0);
          html += await table(item.table);
          continue;
        }
        const p = item.p;
        const style = p.align && p.align !== 'left' ? ' style="text-align: ' + p.align + ';"' : '';
        const content = p.inner || '<br>';
        if (p.list) {
          const n = p.list.kind === 'ol' ? numberOf(p.list) : 1;
          while (stack.length && stack[stack.length - 1].ilvl > p.list.ilvl) closeTo(stack.length - 1);
          const top = stack[stack.length - 1];
          if (top && top.ilvl === p.list.ilvl && (top.kind !== p.list.kind || top.numId !== p.list.numId)) closeTo(stack.length - 1);
          if (stack.length && stack[stack.length - 1].ilvl === p.list.ilvl) html += '</li><li>';
          else {
            const attrs = (p.list.kind === 'ol' && n !== 1 ? ' start="' + n + '"' : '') +
              (p.list.kind === 'ol' && p.list.type !== '1' ? ' type="' + p.list.type + '"' : '') +
              (!stack.length && indentOf(p.list) ? ' style="margin-left: ' + indentOf(p.list) + 'px;"' : '');
            html += '<' + p.list.kind + attrs + '><li>';
            stack.push({ kind: p.list.kind, ilvl: p.list.ilvl, numId: p.list.numId });
          }
          html += content;
        } else if (stack.length && blank(p) && listNext(i)) {
          // an empty line between a list's items
        } else if (p.tag === 'pre' && html.endsWith('</pre>')) {
          // consecutive code paragraphs are one code block
          html = html.slice(0, -6) + '\n' + p.inner.replace(/<br>/g, '\n') + '</pre>';
        } else {
          closeTo(0);
          const inner = p.tag === 'pre' ? p.inner.replace(/<\/?code>/g, '').replace(/<br>/g, '\n') : content;
          html += '<' + p.tag + style + '>' + inner + '</' + p.tag + '>';
        }
        for (let k = 0; k < p.pageBreaks; k++) { closeTo(0); html += '<hr class="page-break">'; }
      }
      closeTo(0);
      return html;
    }

    const bodyEl = doc.getElementsByTagNameNS(NS.w, 'body')[0];
    return bodyEl ? body(bodyEl) : '';
  }

  window.NpDocx = { export: exportDocx, import: importDocx };
})();
