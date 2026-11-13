// A PDF (or an image, which opens as one) exported as another kind of file.
import fs from 'node:fs';
import { test, expect, openFile, waitToast, exportType } from './helpers.mjs';

const text = async (dl) => fs.readFileSync(await dl.path(), 'utf8');

test('a PDF as plain text, and as a Word document that opens with its heading', async ({ app: p }) => {
  await openFile(p, 'letter.pdf');
  const txt = await exportType(p, 'txt');
  expect(txt.suggestedFilename()).toBe('letter.txt');
  const t = await text(txt);
  for (const w of ['Invoice 1042', 'Dear Ms. Rivera, thank you for your order.', 'Total due: $450.00', 'Page two text']) expect(t).toContain(w);
  const docx = await exportType(p, 'docx');
  expect(docx.suggestedFilename()).toBe('letter.docx');
  const file = test.info().outputPath('letter.docx');
  await docx.saveAs(file);
  await p.setInputFiles('#file-open', file);
  await expect(p.locator('#editor h1')).toHaveText('Invoice 1042');
  await expect(p.locator('#editor')).toContainText('Total due: $450.00');
  await expect(p.locator('#editor')).toContainText('Page two text');
});

test('a PDF as images: two pages make a zip of two PNGs', async ({ app: p }) => {
  await openFile(p, 'letter.pdf');
  const dl = await exportType(p, 'png');
  expect(dl.suggestedFilename()).toBe('letter.zip');
  const zip = fs.readFileSync(await dl.path());
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect((zip.toString('latin1').match(/letter - page \d\.png/g) || []).length).toBeGreaterThanOrEqual(2);
  const tif = await exportType(p, 'tiff');
  expect(tif.suggestedFilename()).toBe('letter.tif');
});

test('a read scan as text carries what was read', async ({ app: p }) => {
  await openFile(p, 'scan.jpg');
  await p.click('label[for="pdf-readall"]');
  await waitToast(p, /whole document is read/);
  const t = await text(await exportType(p, 'txt'));
  for (const w of ['APPLICATION', 'John Example', 'Springfield']) expect(t).toContain(w);
});

test('a Word file’s numbered lists keep Word’s numbers, past empty lines and text between', async ({ app: p }) => {
  // made here: sections 1, 2, 3 with lettered items, an empty line between
  // items, a plain paragraph before some lettered items, and a second list
  // lettered from c
  const html = await p.evaluate(async () => {
    const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const item = (num, lvl, text) => '<w:p><w:pPr><w:numPr><w:ilvl w:val="' + lvl + '"/><w:numId w:val="' + num + '"/></w:numPr></w:pPr><w:r><w:t>' + text + '</w:t></w:r></w:p>';
    const para = (text) => '<w:p>' + (text == null ? '' : '<w:r><w:t xml:space="preserve">' + text + '</w:t></w:r>') + '</w:p>';
    const lvl = (i, fmt, start, left) => '<w:lvl w:ilvl="' + i + '"><w:start w:val="' + start + '"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="%' + (i + 1) + '."/><w:pPr><w:ind w:left="' + left + '"/></w:pPr></w:lvl>';
    const numbering = '<w:numbering xmlns:w="' + w + '">' +
      '<w:abstractNum w:abstractNumId="1">' + lvl(0, 'decimal', 1, 720) + lvl(1, 'lowerLetter', 1, 1440) + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="2">' + lvl(0, 'lowerLetter', 3, 1440) + '</w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>';
    const body = item(1, 0, 'One') + para() + item(1, 1, 'One a') + para(' ') + item(1, 1, 'One b') + para() +
      item(1, 0, 'Two') + item(1, 1, 'Two a') + para('b. typed by hand') + item(2, 0, 'Two c') + item(2, 0, 'Two d') +
      item(1, 0, 'Three') + para('Plain text between') + item(1, 1, 'Three a') + item(1, 1, 'Three b');
    const doc = '<w:document xmlns:w="' + w + '"><w:body>' + body + '</w:body></w:document>';
    const blob = NpZip.write([{ name: 'word/document.xml', data: doc }, { name: 'word/numbering.xml', data: numbering }], 'application/zip');
    return (await NpDocx.import(await blob.arrayBuffer())).html;
  });
  // each item as it shows: its number and letter as the list draws them
  const shown = await p.evaluate((html) => {
    const box = document.createElement('div');
    box.innerHTML = html;
    return [...box.querySelectorAll('li')].map((li) => {
      const list = li.parentElement;
      const n = +(list.getAttribute('start') || 1) + [...list.children].indexOf(li);
      const type = list.getAttribute('type') || '1';
      return (type === 'a' ? String.fromCharCode(96 + n) : String(n)) + ' ' + li.firstChild.textContent;
    });
  }, html);
  expect(shown).toEqual(['1 One', 'a One a', 'b One b', '2 Two', 'a Two a', 'c Two c', 'd Two d', '3 Three', 'a Three a', 'b Three b']);
  // no list item stands empty (a "1." with nothing after it)
  expect(html).not.toMatch(/<li>\s*<(ol|ul)/);
  // lettered items after plain text sit at their level's indent
  // lettered items after plain text sit at their level's indent (text at
  // 1440 twips, 96px, from the page margin; the marker in the half inch before)
  expect(html).toContain('<ol type="a" style="margin-left: 72px; padding-left: 24px;"><li>Three a');
});

test('a Word file keeps its layout: styles, indents, spacing, numbers of every kind, margins', async ({ app: p }) => {
  const word = await p.evaluate(async () => {
    const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const lvl = (i, fmt, text, left, hang) => '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="' + text + '"/><w:pPr><w:ind w:left="' + left + '" w:hanging="' + hang + '"/></w:pPr></w:lvl>';
    const numbering = '<w:numbering xmlns:w="' + w + '">' +
      '<w:abstractNum w:abstractNumId="1">' + lvl(0, 'decimal', '%1.', 720, 360) + lvl(1, 'decimal', '%1.%2.', 1440, 720) + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="2">' + lvl(0, 'lowerLetter', '(%1)', 1080, 360) + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="3">' + lvl(0, 'upperRoman', 'Article %1.', 1440, 1440) + '</w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="3"/></w:num></w:numbering>';
    // Normal: Arial 11pt, 6pt after; a style based on it that is bold and
    // indented; a character style that is bold too (so bold toggles off)
    const styles = '<w:styles xmlns:w="' + w + '"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Clause"><w:name w:val="Clause"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>' +
      '<w:style w:type="character" w:styleId="Strong2"><w:name w:val="Strong2"/><w:rPr><w:b/></w:rPr></w:style></w:styles>';
    const item = (num, l, t) => '<w:p><w:pPr><w:numPr><w:ilvl w:val="' + l + '"/><w:numId w:val="' + num + '"/></w:numPr></w:pPr><w:r><w:t>' + t + '</w:t></w:r></w:p>';
    const body = item(1, 0, 'One') + item(1, 1, 'One one') + item(1, 1, 'One two') +
      item(2, 0, 'Alpha') + item(2, 0, 'Beta') + item(3, 0, 'Scope') +
      '<w:p><w:pPr><w:ind w:left="1800" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">b.</w:t></w:r><w:r><w:tab/><w:t>Typed by hand</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:ind w:firstLine="720"/><w:spacing w:before="240" w:after="0"/></w:pPr><w:r><w:t>First line in</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Clause"/></w:pPr><w:r><w:t xml:space="preserve">Bold </w:t></w:r><w:r><w:rPr><w:rStyle w:val="Strong2"/></w:rPr><w:t>not bold</w:t></w:r><w:r><w:rPr><w:caps/></w:rPr><w:t xml:space="preserve"> caps</w:t></w:r></w:p>';
    const doc = '<w:document xmlns:w="' + w + '"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="1440" w:bottom="720" w:left="1080"/></w:sectPr></w:body></w:document>';
    const blob = NpZip.write([{ name: 'word/document.xml', data: doc }, { name: 'word/numbering.xml', data: numbering }, { name: 'word/styles.xml', data: styles }], 'application/zip');
    return NpDocx.import(await blob.arrayBuffer());
  });
  // the page: Normal's font, size and spacing; A4; the file's own margins
  expect(word.settings).toEqual({ font: 'arial', size: 11, lineHeight: 1.15, paper: 'a4', margins: 'normal', marginsIn: [0.5, 1, 0.5, 0.75] });
  const html = word.html;
  // "1.1." numbering, "(a)" and the words Word writes around a number
  // (its marker under the first level's text, its text an inch in)
  expect(html).toContain('<ol class="np-outline" style="margin-left: 0px; padding-left: 48px;"><li style="margin-bottom: 6pt;">One one');
  // another list after it starts on its own, at its own indent
  expect(html).toContain('</ol></li></ol><ol type="a" class="np-pp" style="margin-left: 48px; padding-left: 24px;">');
  expect(html).toContain('>Article I.\tScope</p>');
  // a paragraph indented by hand: its left edge and hanging first line
  expect(html).toContain('<p style="margin-left: 120px; text-indent: -24px; margin-bottom: 6pt;">b.\tTyped by hand</p>');
  expect(html).toContain('<p style="text-indent: 48px; margin-top: 12pt;">First line in</p>');
  // a style's indent and bold; a bold character style over it turns bold off
  expect(html).toContain('<p style="margin-left: 48px; margin-bottom: 6pt;"><strong>Bold </strong>not bold<strong><span style="text-transform: uppercase"> caps</span></strong></p>');
});
