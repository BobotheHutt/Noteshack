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
    return NpDocx.import(await blob.arrayBuffer());
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
  expect(html).toContain('<ol type="a" style="margin-left: 48px;"><li>Three a');
});
