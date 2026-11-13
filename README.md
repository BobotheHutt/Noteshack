# Noteshack

A fast, private word processor and PDF editor that runs entirely in your
browser. No account, no server, no tracking. Your documents stay on your
device. It saves as you type, works offline, opens and saves Word documents,
and lets you edit and sign PDFs.

## Features

**Writing**
- Headings, quotes, code blocks, bulleted, numbered and **check** lists
- Bold, italic, underline, strikethrough, superscript, subscript, inline code
- Any font size and font for selected text, a text color and highlight palette
- Alignment, indent, links, horizontal lines, page breaks, special characters
- Tables: insert from a size grid, add or delete rows and columns, header row, Tab between cells
- Images: insert, paste or drag in; resize by dragging or by preset; center or wrap text; alt text
- **Markdown shortcuts** while you type: `#` heading, `-` bullet, `1.` numbers, `[ ]` checklist, `>` quote, ```` ``` ```` code, `---` line

**Documents**
- Unlimited documents, with a searchable sidebar
- A welcome on opening that sums up what Noteshack does (tick "Don't show this again" to stop it)
- Autosave plus **version history**: browse earlier versions and restore any of them
- **Open** `.docx`, `.md`, `.html` and `.txt`, by menu or by dropping files on the window (PDFs and images open in the PDF editor, below)
  - A Word file keeps its layout: its styles, indents, spacing, line spacing, capitals, margins and list numbers as Word draws them ("1.", "(a)", "a)", "1.1.", "Article I."), counted through empty lines and text between; saving as Word writes them back.
- **Save** (Ctrl+S) writes over the document's file; the first time, it is Save as. **Save as…** (Ctrl+Shift+S) picks the name, folder and kind: Word (`.docx`), web page, Markdown or plain text. **Export…** makes a PDF (through Print). Everything is also kept in Noteshack as you work ("Saved in Noteshack").
  - In **Chrome and Edge on a computer**, Save as uses the system's own Save dialog (pick the kind of file in its type list), and **Save** (Ctrl+S) then writes straight back to that file, like a desktop program. A file opened through File → Open, or dropped on the window, is saved back to the same way. This lasts while the tab is open: after a reload or a new visit, the first Save shows the dialog again, in the same folder with the same name. Saving over a Word file or web page made elsewhere asks first (once), since Noteshack opens their everyday parts, not all of them.
  - **Firefox, Safari and phones** do not let websites write to a file on disk, so there each save is a new copy in Downloads; Save as asks which kind of file.
- Page setup per document: font, size, line spacing, Letter or A4, margins
- **The app in your language**: English, Spanish, French, German, Portuguese or Italian, chosen in View → App language (or the browser's language, at first). Menus, messages, dates and numbers follow it; each document keeps a language of its own. The translations were written with the help of AI and have not yet been checked by native speakers. Corrections are welcome through Tools → Report a problem.
- **Report a problem** (Tools): say what went wrong, in the app, with no account; the report is filed on Noteshack's GitHub page, where it is public.
- **Each document has a language**, shown in the status bar: worked out from its text on your computer, or chosen from 55. It sets spell checking and which way text runs (Arabic, Hebrew, Persian and Urdu run right to left), and saved Word files, web pages and PDFs record it.
- **Spell checking in the document's language**: English, Spanish, French, German, Portuguese and Italian are checked by Noteshack itself, with the Hunspell dictionaries LibreOffice uses. Misspelled words are underlined; right-click one for corrections, to add it to your dictionary, or to ignore it in that document (Shift + right-click gives the browser's own menu). Other languages use the browser's spell check.
- **Translation, on your computer** (Tools → Translate…): makes a translated copy of a document; with a translator on your computer, the text is not sent anywhere. Noteshack's own translator is Firefox's translation engine with Mozilla's models, between English, Spanish, French, German, Portuguese and Italian (two of the others go through English); it keeps bold, links and other formatting, and downloads each language's model (about 25 MB) the first time, then keeps it. Where the browser has a translator of its own (Chrome), its languages are offered too, as plain text. **Online**, only when you choose it, Noteshack's own translation service on Cloudflare translates between 53 languages (Meta's M2M-100 model, run by Workers AI), as plain text: the text is sent there, translated and sent back, and not kept, so it is not for anything confidential. Names and terms you list are left as they are, and so are pictures and code. Each paragraph of the copy is highlighted until checked: the panel shows its original, which you can change and translate again. A PDF (or a scan, read first) can be translated keeping its layout: a copy in which each paragraph is replaced where it stands, in its matched font, set a little smaller where the translation runs longer so it stays in its space, with the original left as it was; or into a document of its words, to check paragraph by paragraph and save as Word or text.
- Back up every document to one file and restore it anywhere

**PDFs**
- Open any PDF (menu, or drop it on the window). It goes in your documents list like everything else.
- **Edit text**: click any line of the PDF's own text and retype it. Only the words you change are replaced; the rest of the line is left exactly as it was.
- **The original font**: the app works out which font the words were set in (from the font's name in the PDF, or, on a scan, by comparing the letters with 31 common document fonts) and downloads it, so new words match. Paid fonts like Arial, Times New Roman and Calibri are matched with free fonts drawn to the same shapes and widths (Arimo, Tinos, Carlito).
- **Text in any script**: Arabic, Hebrew, Hindi and the other Indian scripts, Thai, Chinese, Japanese, Korean, Cyrillic, Greek and Vietnamese can be typed into a PDF, or translated into one, and are saved shaped (letters joined, conjuncts formed, marks placed) and in the right order, right to left where they run that way, in a Noto font. The font for a script is downloaded the first time it is used, then kept, and only the letters used go into the saved PDF, so a page of Chinese adds kilobytes, not the font's 10 MB. Such text can be searched and copied from in the saved file. Offline, before a script's font has been downloaded, its letters are saved as “?” and the app says so.
- Add text, highlight, white-out, draw, boxes, images, and your **signature** (drawn once, remembered if you like)
- Fill in PDF forms: text boxes, checkboxes, dropdowns and radio buttons
- **Images too**: open a JPG, PNG, WebP, TIFF or BMP (a scan saved as an image, or a photo of a page) and it opens in the same editor, with every tool here. A photo taken sideways is turned upright. **Save** gives back the same kind of file at the same size in pixels, with your changes drawn in: a JPG comes back as a JPG, and a multi-page TIFF as a multi-page TIFF. (A JPG, PNG or WebP that has gained pages comes back as a zip with one image per page.) Export… makes it a PDF, a Word document, text or another kind of image.
- **Scanned pages become editable text (OCR)**: with Edit text, click a scanned page and the app reads that page (a few seconds; the line you clicked then opens for editing), takes the scanned words off it, and draws every line again as real text in the matched font, size, weight (bold and italic words included) and color, where it was on the page. Edits are then ordinary text edits that match the lines around them, and the downloaded PDF can be searched and copied from. This works the same way on pages whose letters were saved as drawn shapes.
  - A page scanned sideways or upside down is turned the right way up first, and one that went through the scanner crooked is straightened, so lines read cleanly and the new text sits level.
  - Headings set in small caps stay in small caps.
  - **The scan's own letters** (like Acrobat's ClearScan): every copy of a letter on the page is cut out, averaged to take away the scan's noise, traced into a smooth outline and built into a font, so redrawn text, and anything you type, has the scanned letters' own shapes. Letters the page does not show come from the matched font. Pages → Use the scan's own letters, or the matched fonts switches between the two. These fonts are modified copies of free (Open Font License) fonts, so they go by their own names (Noteshack Scan 1, 2…) and keep the original license notice, as that license asks.
  - Every word of a line is redrawn together, so a line looks of a piece; words OCR was unsure of are underlined to check.
  - **Paragraphs rewrap**: click any line of a paragraph and the whole paragraph opens for editing; when you finish, the text flows again from your change (bold and italic words keep their style), lines before it stay as they were, and a paragraph that needs another line gets one below.
  - **Handwriting is left alone**: writing OCR reads unsurely, and marks like check boxes, stay exactly as scanned and are never retyped. If a line was retyped that should not have been, select it and click **Show as scanned**. To clear a filled-in form, drag a box over the writing with Edit text: only the pen strokes go, the form's fill-in lines, printed slashes and printed text stay, and selecting the erased area shows each piece, to click to keep or erase. White-out clears everything in an area.
  - **Fixing a misread**: words OCR may have got wrong are underlined in orange. Right-click any word read from the scan for a menu with the scanned word enlarged, what was read, and Correct this word (type the correction; Tab goes on to the next doubtful word), plus Edit text and Copy. A left click always just edits. A correction is redrawn in place, and searching and copying use it.
  - **Original** (toolbar) shows the page as it was scanned, to check what was read: every word is clickable to correct it, and words OCR was unsure of are shaded.
  - **Pages → Keep this page as scanned** puts the scan back; Edit text then changes single words and leaves the rest of the scan exactly as it was.
  - **Read whole document** (a switch in the toolbar, off by default; hover its ⓘ for details) reads every scanned page in the background instead, several pages at a time, so a long document becomes editable and searchable without clicking each page. A page you click goes first; turning it off pauses, and it carries on where it stopped next time the document is opened.
  - Reading is quick first and careful where it needs to be: a fast reader reads each page, and the lines it was unsure of are read again by the accurate one. Words read surely anywhere in the document are remembered, and a word read unsurely that is one letter away from one of them (seen at least twice) is corrected to it.
  - Read in the document's language: English, Spanish, French, German, Portuguese or Italian (other languages are read as English). A scan's language is worked out from the first words read, and a page read in the wrong one is read again. Needs the app opened from its web address, not from a file on disk.
- Pages: rotate, delete, reorder, insert blank pages, and add pages from other PDFs
- Undo and redo for everything; your changes are saved as you go
- **Export…** turns a PDF (or an image) into another kind of file, as a separate file (Save keeps going to the original): images (JPG, PNG, WebP, BMP, one per page, or one multi-page TIFF), plain text, or a Word document of its words as paragraphs and headings (not its exact layout). Text read from scanned pages comes along.
- **Save** writes the PDF with your changes: back over the file you opened (Chrome and Edge, see Save above), or as a new copy. Save as makes a new file and leaves the original as it was.
- **Print** shows a preview of exactly what will print (your changes included), then prints straight from it; Save and Open in a new tab are there too.

What PDF editing cannot do, so nothing surprises you:
- Text you change or white-out is **erased from the file** when you save, not just covered, and the rest of the line stays exactly where it was. That includes scanned pages and other pictures: the covered pixels are painted over inside the image itself. Only drawings (lines and shapes) under a white-out stay in the file, hidden. The app tells you when that happens.
- A color scan you have erased part of is saved again as JPEG, so that page's file size can roughly double. Black-and-white scans stay small.
- OCR can misread faint, tiny or handwritten text. Check what it read (the Original button) before relying on it.
- Redrawing a scanned page needs its fonts. Offline, the page stays as scanned and Edit text changes single words instead; choose Pages → Make this page's text editable when you are back online.
- Font matching needs an internet connection the first time a font is used. The 31 common fonts come from Noteshack itself; a less common font a PDF names comes from the free Fontsource library through jsDelivr (nothing from your document is sent). Offline, or for a font it cannot find, the closest standard font is used.
- A scan's font is matched to the closest of the common fonts the app knows. An unusual or custom typeface will be matched to something similar, not identical.
- Password-protected PDFs cannot be changed.

**Tools**
- Find and replace with highlighting, match case, whole words and regex
- Word count details, reading time, selection count, and a word goal with a progress bar
- Read aloud with word highlighting, a choice of voice and speed
- Spell check toggle, focus mode, zoom, light and dark themes
- Full keyboard shortcuts (press **Ctrl+/** to see them all)
- Works on phones and tablets, works offline, installable as an app

## Where your writing is kept

Documents are stored in your browser's IndexedDB on this device. They are
never uploaded. Clearing your browser's site data deletes them, and they
don't follow you to other browsers or computers. Use **File → Back up all
documents** to keep a copy, or to move them.

Upgrading from the first version? Your old draft is moved into the
documents list automatically the first time you open the new version.

## Privacy

There is no account, no ads and no cookies, and documents are
never uploaded. Three things are fetched from the internet, and two are sent only when you ask:

- **Uncommon font files.** The 31 common fonts the app matches are served
  by Noteshack itself. When a PDF names a font outside them, that font file
  is downloaded from the free [Fontsource](https://fontsource.org) library
  through jsDelivr (`cdn.jsdelivr.net`). Like any website, jsDelivr sees the
  visitor's IP address; nothing from the document is sent.
- **Linked pictures.** A picture in a document that links to a web address
  (for example, pasted from a web page) is loaded from that address.
- **Translation models and script fonts**, from Noteshack's own file
  storage (`files.noteshack.org`), kept in the browser after the first time:
  the model for two languages, the first time you translate between them,
  and the font for a script (Arabic, Chinese, Hindi and others), the first
  time a PDF needs it. Only the file is downloaded; the text is translated,
  and fonts are cut down to the letters used, on the device.

- **The online translator, only when you choose it** (Translate → Online):
  the text being translated is sent to Noteshack's translation service on
  Cloudflare (`api.noteshack.org`), which translates it with Workers AI and
  sends it back. Nothing is kept or logged.

- **A problem report, when you send one** (Tools → Report a problem): what
  you write, the app's version, your browser and the app's language go
  through the same service to Noteshack's GitHub page, where the report is
  public. Nothing from your documents is sent.

Everything else, text recognition included, runs on the device.

## Disclaimer

Noteshack is provided as is, without warranty of any kind. Text
recognition and font matching can be wrong: check a PDF before sending,
submitting or signing it, and keep backups of anything important.

Users are responsible for the documents they change. Do not alter a document
in a way that misleads anyone, such as a form or record someone else filled
in or signed.

## License

Noteshack's own code is released under the [MIT License](LICENSE).
The libraries in `vendor/` keep their own licenses, listed below.

## Credits and licenses

Noteshack uses these open-source projects, kept unmodified in `vendor/`
with their license texts:

- [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla), Apache License 2.0
- [pdf-lib](https://pdf-lib.js.org) and @pdf-lib/fontkit, MIT License
- [Tesseract.js](https://tesseract.projectnaptha.com), Tesseract OCR and its
  English, Spanish, French, German, Portuguese and Italian data, Apache License 2.0
- [opentype.js](https://opentype.js.org), MIT License
- [UTIF.js](https://github.com/photopea/UTIF.js) (Photopea), MIT License, with [pako](https://github.com/nodeca/pako), MIT License
- [Hunspell](https://hunspell.github.io) (as hunspell-wasm), MPL 1.1, with Hunspell dictionaries from [wooorm/dictionaries](https://github.com/wooorm/dictionaries), each under its own license (see `vendor/dictionaries`)
- [franc](https://github.com/wooorm/franc), MIT License
- [Bergamot translator](https://github.com/browsermt/bergamot-translator) (Firefox's translation engine), Mozilla Public License 2.0, with [Mozilla's translation models](https://github.com/mozilla/translations), Mozilla Public License 2.0 (served from `files.noteshack.org`, not stored in this repository; `tools/translation-models.py` puts them there)
- [M2M-100](https://github.com/facebookresearch/fairseq/tree/main/examples/m2m_100) (Meta), MIT License, run by Cloudflare Workers AI for the online translator (`worker/`)
- [HarfBuzz](https://harfbuzz.github.io) (as harfbuzzjs, with its subsetter), MIT License (Old MIT)
- [bidi-js](https://github.com/lojjic/bidi-js), MIT License
- [Noto fonts](https://notofonts.github.io) (Google), SIL Open Font License 1.1 (served from `files.noteshack.org`, not stored in this repository; `tools/noto-fonts.py` puts them there)
- 31 fonts from [Fontsource](https://fontsource.org), SIL Open Font License (Roboto Slab: Apache 2.0)

Fonts come from [Fontsource](https://fontsource.org) when needed and are
not stored in this repository; each is under its own free license (SIL Open
Font License or Apache License 2.0). Fonts made from a scan's letters are
changed copies of those fonts, so they are renamed (Noteshack Scan 1, 2…) and
keep their license notices, as the Open Font License asks.

## Trademarks

Adobe, Acrobat and ClearScan are trademarks of Adobe. Microsoft, Word and
Calibri are trademarks of Microsoft. Arial and Times New Roman are trademarks
of The Monotype Corporation. They are named only to describe compatibility;
Noteshack is not affiliated with or endorsed by them.

## Running it

It is a static site with no build step and no dependencies.

- **Locally:** serve the folder over http, for example
  `python3 -m http.server`, and open <http://localhost:8000>. (Opened
  straight from disk, the word processor works but PDFs do not: browsers
  will not load PDF.js's modules from a `file://` page.)
- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main`, root folder.
  The live site is <https://noteshack.org>, set by the `CNAME` file and the
  domain's DNS records (four A records and four AAAA records for GitHub Pages,
  and a `www` CNAME to `bobothehutt.github.io`).

Each web address keeps its own saved documents, so after moving the site to
a new address, open the old one, use **File → Back up all documents**, and
restore that file at the new address.

## Tests

The app needs nothing installed; the tests need Node.js.

```
npm install
npx playwright install chromium firefox webkit
npm test
```

They serve the repository as the site and use it in Chrome, Firefox and Safari's engine (WebKit): writing,
exporting, editing and downloading PDFs, filling forms, reading scans,
storage, printing, accessibility (axe), privacy (which sites are contacted),
small screens and offline use. The PDFs they open are made fresh each run
from invented text, so no real document is in the repository. Only the ones a
change affects are run; GitHub runs those in all three when started by hand
(`.github/workflows/test.yml`).

## The app's languages

The code is written in English, with each phrase the app shows wrapped:
`_('Saved to “{name}”', { name })`, or for a number,
`_n(count, '{n} page', '{n} pages')`. Each language's file in `locales/` gives
the same phrase translated, keyed by the English (a plural under the English
plural, one form per plural category of the language). The text in
`index.html` is translated where it stands when the app starts.

A new or changed phrase needs a translation in every file in `locales/`: the
tests list any that is missing, any no longer used, and any whose `{…}`
parts differ from the English. `node tools/phrases.mjs` lists the phrases the
code uses. Two test languages, from the address only, help find what was
missed: `?lang=en-XA` shows every phrase accented and longer (so text left in
plain English, or cut off, stands out), and `?lang=ar-XB` does the same right
to left.

## Files

```
index.html             page structure, menus and toolbar
js/boot.js             sets the theme before the page first draws
styles.css             all styling: light and dark themes, phone layout, print
js/app.js              the editor and the rest of the app
js/store.js            document storage (IndexedDB)
js/sanitize.js         cleans pasted and opened content
js/markdown.js         Markdown import and export
js/docx.js             Word .docx import and export
js/zip.js              the zip reading and writing .docx needs
js/pdf.js              the PDF editor
js/fonts.js            identifies and downloads the font a PDF was set in
js/scanfont.js         builds a font from a scan's own letters
js/images.js           opens images in the PDF editor and saves them back as images
js/i18n.js             the app's own language: phrases, plurals, the test languages
locales/               the app's phrases in Spanish, French, German, Portuguese and Italian
js/lang.js             the languages, and working out which one a text is in
js/spell.js            spell checking (js/spellworker.js runs Hunspell)
js/translate.js        translation on the device: Noteshack's engine (Bergamot) or the browser's
js/remote.js           downloads from files.noteshack.org: checked, and kept in the browser
js/shaping.js          text in other scripts in saved PDFs: Noto fonts, shaped (HarfBuzz), cut down to the letters used
worker/                Noteshack's online service (api.noteshack.org), a Cloudflare Worker: the online translator, and problem
                       reports filed on GitHub; GitHub deploys it when it changes (tools/worker.py)
vendor/                the libraries (see vendor/README.md), with their licenses; loaded only when needed
tools/                 the upload scripts for the translation models and the Noto fonts, the online translator's deploy script,
                       test-setup.py (the tests' fonts and models, where the network cannot reach them); phrases.mjs lists the phrases the code uses;
                       docx-compare.mjs checks how a Word file is laid out against LibreOffice
js/icons.js            toolbar icons
sw.js                  offline support
manifest.webmanifest   app install details
AUDIT.md               audits: the first version, and the app as released
LICENSE                the MIT License, for this project's own code
CLAUDE.md              notes for an AI assistant working on the code: releasing, secrets, open work
tests/                 the tests (see Tests above)
```

After changing any file, bump `CACHE` in `sw.js` so installed copies pick up
the update, and the `?v=` number on each of the app's files in `index.html` to
match it (Cloudflare and browsers keep the code files for hours; a new number
is a new address, so nobody gets new pages with old code; the tests check
the two agree). After changing a file under `vendor/`, bump `VENDOR` there too: those
files are cached apart and are not fetched again otherwise.
