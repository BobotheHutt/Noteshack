import { test, expect, saveAsType } from './helpers.mjs';

test('Backspace or Ctrl+Z right after a Markdown shortcut puts back what was typed', async ({ app: p }) => {
  const ed = p.locator('#editor');
  await p.click('#editor');
  for (const key of ['Backspace', 'Control+z']) {
    for (const tok of ['# ', '- ', '1. ', '> ', '[] ', '``` ']) {
      await p.keyboard.press('Control+a'); await p.keyboard.press('Delete');
      await p.keyboard.type('Hello'); await p.keyboard.press('Enter');
      await p.keyboard.type(tok);
      await expect(ed.locator('h1, ul, ol, blockquote, pre')).toHaveCount(1);
      await p.keyboard.press(key);
      // left as typed: going on typing does not change it again
      await p.keyboard.type('x');
      await expect(ed.locator('h1, ul, ol, blockquote, pre'), key + ' after ' + tok).toHaveCount(0);
      await expect(ed.locator('p').last()).toHaveText(tok + 'x');
    }
  }
  // the line rule too
  await p.keyboard.press('Control+a'); await p.keyboard.press('Delete');
  await p.keyboard.type('Hi'); await p.keyboard.press('Enter'); await p.keyboard.type('---'); await p.keyboard.press('Enter');
  await expect(ed.locator('hr')).toHaveCount(1);
  await p.keyboard.press('Backspace');
  await expect(ed.locator('hr')).toHaveCount(0);
  await expect(ed.locator('p').last()).toHaveText('---');
  // once typing goes on, the change stays and Backspace is ordinary
  await p.keyboard.press('Control+a'); await p.keyboard.press('Delete');
  await p.keyboard.type('# Ti'); await p.keyboard.press('Backspace');
  await expect(ed.locator('h1')).toHaveText('T');
  // and Ctrl+Z after the restore steps back through the typing as usual
  // (how much each step takes back is the browser's own)
  await p.keyboard.press('Control+a'); await p.keyboard.press('Delete'); await p.keyboard.press('Control+Alt+0');
  await p.keyboard.type('Hello'); await p.keyboard.press('Enter'); await p.keyboard.type('# ');
  await p.keyboard.press('Control+z');
  await expect(ed.locator('p').last()).toHaveText('# ');
  await p.keyboard.press('Control+z');
  await expect.poll(() => ed.evaluate((e) => e.textContent.replace(/\u00a0/g, ' ').includes('# '))).toBe(false);
});

test('View → Formatting marks shows a ¶ where paragraphs end, on screen only', async ({ app: p }) => {
  await p.click('#editor');
  await p.keyboard.type('# Title'); await p.keyboard.press('Enter');
  await p.keyboard.type('Text.'); await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
  await p.keyboard.type('- item');
  const mark = (sel, where) => p.evaluate(([sel, where]) => getComputedStyle(document.querySelector('#editor ' + sel), where).content, [sel, where]);
  const toggle = async () => {
    await p.locator('.menu', { has: p.locator('[data-action="marks"]') }).locator('.menu-btn').click();
    await p.click('.menu.open [data-action="marks"]');
  };
  expect(await mark('p', '::after')).toBe('none');
  const height = await p.locator('#editor').evaluate((e) => e.offsetHeight);
  await toggle();
  for (const sel of ['h1', 'p', 'li']) expect(await mark(sel, '::after'), sel).toBe('"¶"');
  // an empty line, and a line ending in a break (as Firefox writes them),
  // keep the ¶ on that line: the page is no taller
  expect(await mark('p:has(> br:only-child)', '::after')).toBe('"¶"');
  expect(await p.locator('#editor').evaluate((e) => e.offsetHeight)).toBe(height);
  await p.evaluate(() => { document.querySelector('#editor').innerHTML = '<p>One.<br></p><p>two<br>lines</p><ul><li>item<br></li></ul>'; document.querySelector('#editor').dispatchEvent(new InputEvent('input')); });
  await expect(p.locator('#editor br[data-np-end]')).toHaveCount(2);
  expect(await p.locator('#editor p:first-child br').evaluate((b) => getComputedStyle(b).display)).toBe('none');
  // a break within a paragraph stays
  expect(await p.locator('#editor p:nth-child(2) br').evaluate((b) => b.hasAttribute('data-np-end'))).toBe(false);
  // not in the text, and not printed
  expect(await p.locator('#editor').evaluate((e) => e.textContent)).not.toContain('¶');
  await p.emulateMedia({ media: 'print' });
  expect(await mark('p', '::after')).toBe('none');
  await p.emulateMedia({ media: 'screen' });
  await toggle();
  expect(await mark('p', '::after')).toBe('none');
  await expect(p.locator('#editor br[data-np-end]')).toHaveCount(0);
});

test('writing with Markdown shortcuts, tables and undo', async ({ app: p }) => {
  await p.click('#editor');
  await p.keyboard.type('# My Heading'); await p.keyboard.press('Enter');
  await p.keyboard.type('Hello world, this is a test.'); await p.keyboard.press('Enter');
  await p.keyboard.type('- first'); await p.keyboard.press('Enter'); await p.keyboard.type('second');
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
  await p.keyboard.type('[ ] task one'); await p.keyboard.press('Enter'); await p.keyboard.type('task two');
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
  await p.keyboard.type('after ');
  await p.keyboard.press('Control+b'); await p.keyboard.type('bold'); await p.keyboard.press('Control+b');
  const ed = p.locator('#editor');
  await expect(ed.locator('h1')).toHaveText('My Heading');
  await expect(ed.locator('ul:not(.checklist) > li')).toHaveCount(2);
  await expect(ed.locator('ul.checklist > li')).toHaveCount(2);
  expect(await p.evaluate(() => {
    const w = document.evaluate("//*[@id='editor']//*[text()='bold']", document, null, 9, null).singleNodeValue;
    return w && +getComputedStyle(w).fontWeight;
  })).toBeGreaterThanOrEqual(600);
  await expect(p.locator('#doc-title')).toHaveValue('My Heading');

  await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
  await p.click('#toolbar [data-action="table-menu"]');
  await p.click('.grid-cell[data-r="3"][data-c="3"]');
  await p.keyboard.type('H1'); await p.keyboard.press('Tab'); await p.keyboard.type('H2');
  await p.click('#ctxbar [aria-label="Insert row below"]');
  await expect(ed.locator('table tr')).toHaveCount(4);
  await p.keyboard.press('Control+z');
  await expect(ed.locator('table tr')).toHaveCount(3);
});

test('find and replace touches the text, not the markup', async ({ app: p }) => {
  await p.click('#editor');
  await p.keyboard.type('task one, task two, and a table');
  await p.keyboard.press('Control+h');
  await p.fill('#find-q', 'task');
  await expect(p.locator('#find-count')).toContainText('of 2');
  await p.fill('#find-r', 'job');
  await p.click('[data-action="replace-all"]');
  await expect(p.locator('#editor')).toHaveText('job one, job two, and a table');
});

test('saving, reloading, exporting and a second document', async ({ app: p }) => {
  await p.click('#editor');
  await p.keyboard.type('# Kept'); await p.keyboard.press('Enter'); await p.keyboard.type('This survives a reload.');
  await expect(p.locator('#save-status')).toHaveText('Saved in Noteshack', { timeout: 10000 });
  await p.reload(); await p.waitForSelector('body.ready');
  await expect(p.locator('#editor')).toContainText('This survives a reload.');
  for (const kind of ['docx', 'md', 'html', 'txt']) {
    const dl = await saveAsType(p, kind);
    expect(dl.suggestedFilename()).toBe('Kept.' + kind);
    if (kind === 'docx') await dl.saveAs(test.info().outputPath('Kept copy.docx'));
  }
  // the Word file opens again as a document of its own
  await p.setInputFiles('#file-open', test.info().outputPath('Kept copy.docx'));
  // its own entry in the list (the original shows the same heading, so that alone proves nothing)
  await expect(p.locator('.doc-item')).toHaveCount(2);
  await expect(p.locator('#doc-title')).toHaveValue('Kept copy');
  await expect(p.locator('#editor h1')).toHaveText('Kept');
  await expect(p.locator('#editor')).toContainText('This survives a reload.');
  await p.click('.sb-head [data-action="new"]');
  await p.keyboard.type('Second doc');
  // (named, so that if a document too many ever turns up, which one shows)
  await expect.poll(() => p.locator('.doc-item').allTextContents(), { timeout: 10000 }).toHaveLength(3);
});

const DIRTY = '<p>Pasted <b>bold</b> <img src=x onerror="window.pwned=1"> <a href="javascript:window.pwned=3">bad</a> <span style="color:#ff0000">red</span></p><script>window.pwned=2</script>';

test('pasted HTML is cleaned', async ({ app: p, browserName }) => {
  // the cleaner itself, in every browser (each parses HTML its own way)
  const clean = await p.evaluate((h) => NpSanitize.html(h), DIRTY);
  expect(clean).toContain('<b>bold</b>');
  expect(clean).not.toMatch(/onerror|javascript:|<script/i);
  // a paste, where a test can make one (Firefox and Safari ignore a made-up clipboard)
  if (browserName === 'chromium') {
    await p.click('#editor');
    await p.evaluate((h) => {
      const dt = new DataTransfer();
      dt.setData('text/html', h);
      dt.setData('text/plain', 'Pasted bold bad red');
      document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, DIRTY);
    await p.waitForTimeout(500);
    const html = await p.locator('#editor').innerHTML();
    expect(html).toContain('<b>bold</b>');
    expect(html).not.toMatch(/onerror|javascript:|<script/i);
  }
  await p.waitForTimeout(300);
  expect(await p.evaluate(() => window.pwned)).toBeUndefined();
});

// Chinese, Japanese and Korean are typed through an input method, which
// composes each character before entering it. (Chrome's test tools can
// simulate one; Firefox's and WebKit's cannot.)
test('typing through an input method (Japanese)', async ({ app: p, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chrome can simulate an input method');
  const cdp = await p.context().newCDPSession(p);
  await p.click('#editor');
  await p.keyboard.type('Hello ');
  for (const t of ['か', 'かん', 'かんじ']) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
  await cdp.send('Input.insertText', { text: '漢字' });
  await p.keyboard.type(' done');
  await expect(p.locator('#editor')).toHaveText('Hello 漢字 done');
  await expect(p.locator('#save-status')).toHaveText('Saved in Noteshack', { timeout: 10000 });
  await p.reload(); await p.waitForSelector('body.ready');
  await expect(p.locator('#editor')).toHaveText('Hello 漢字 done');
});
