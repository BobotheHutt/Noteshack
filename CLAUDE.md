# Noteshack

A word processor and PDF editor that runs in the browser: vanilla JS PWA, no
build step. Live at https://noteshack.org. The README has the features, the
privacy promises, the file list and the credits; read the part you need.

## Where things are

| What | Where |
|---|---|
| The site | GitHub Pages from `main` (repo BobotheHutt/Noteshack), behind Cloudflare. **A push to `main` is live.** |
| Translation models, Noto fonts | Cloudflare R2 bucket `noteshack-files`, served at `files.noteshack.org`. Uploaded by `tools/translation-models.py`, `tools/noto-fonts.py`. |
| Online translator, problem reports | Cloudflare Worker `noteshack-api` at `api.noteshack.org` (`worker/index.js`). Deployed by `.github/workflows/worker.yml` on a push to `main` that touches `worker/`, then checked live. Translating stops for the day (until midnight UTC) at **$1** of Workers AI, counted in the Durable Object `Budget`: the account is on Workers Paid, so past the free allowance it is billed, not stopped. |
| Cloudflare account | `c047d9e1fea222a9db788c3e9a79cc37`, on **Workers Paid** (shared with another project). |
| Analytics | Cloudflare Web Analytics, added to the page by Cloudflare; allowed in the CSP. |

## Secrets (none in the repo, none in chat)

- **GitHub repository secrets:** `CLOUDFLARE_API_TOKEN` (deploys the Worker:
  Workers Scripts Edit, Workers Routes Edit and Zone Read on noteshack.org) and
  `NOTESHACK_ISSUES_TOKEN` (fine-grained, Noteshack only, Issues read and write;
  the Worker files reports with it). Both are set to never expire, so no
  expiry check is needed.
- **This cloud environment:** a Bearer secret for `api.cloudflare.com`, path
  `/client/v4/accounts/c047d9e1fea222a9db788c3e9a79cc37/r2/` only. It reaches
  R2 and nothing else in Cloudflare.
- The session's network cannot reach `files.noteshack.org` or
  `api.noteshack.org`. Check the live Worker through its GitHub workflow (it
  translates a sentence and checks other sites are refused; run it by hand
  with `test_report: true` to also file a test report, then close that issue).

## Releasing

1. Make the change. Run **only the tests it affects**, here, in Chromium.
2. Bump the release: `CACHE` in `sw.js`, the `?v=` number on every file in
   `index.html` (same number; `tests/release.spec.mjs` checks), and
   `APP_VERSION` in `js/app.js` (it ends with the same number: a tab left
   open compares it with `sw.js` every hour to offer Reload). `VENDOR` in `sw.js` too if `vendor/` changed.
3. Commit and push straight to `main`. When the change could behave
   differently in Firefox or Safari (editing, undo, selection, layout), push
   it to the work branch first and run Tests there (step 5, with the branch
   as the ref): only Chromium runs here, and every failed run emails the
   owner. `main` gets it once that run is green.
4. Check it is live: `https://noteshack.org/sw.js` shows the new `CACHE`.
5. GitHub runs no tests on a push. When the change touches the browser
   side (not only `worker/` or `tools/`), start Actions → Tests by hand with
   the affected files, for Firefox and WebKit:
   `tests: tests/<affected>.spec.mjs …` (empty runs all; only when asked).
   If it fails, fix it at once. Re-run a failure once only when it is
   plainly unrelated to the change; two known flaky ones are below.

### Tests on this machine

```
npm install
python3 tools/test-setup.py           # fonts and models into tests/.fixtures/ (not committed)
NOTESHACK_FONTS=tests/.fixtures/fontsource npx playwright test tests/<affected>.spec.mjs --project=chromium
```

Only Chromium is installed here. Tests that use the online service (the
translator, reports) stand it in with `page.route`, and need
`serviceWorkers: 'block'` for WebKit.

## Word files (`js/docx.js`)

The import follows the Word format (ECMA-376): each paragraph's and run's
formatting is worked out from the document's defaults, its style and the
styles that style is based on, its list level, its character style and its
own settings, in that order. Lists are numbered as Word numbers them (per
list, through empty lines and text between; "(a)", "a)", "1.1.", "Article
I."), and a document keeps Word's base font, size, line spacing, paper and
exact margins as its page settings. The export writes the same back.
**Check a change against LibreOffice**: `node tools/docx-compare.mjs
file.docx` (with `node tests/server.mjs 8123` running) lists each paragraph's
number and text position in both; LibreOffice and poppler are on this
machine. Known: LibreOffice ignores a level's "never restart" (Word follows
it, and so does Noteshack).

## Rules of this codebase

- **Every phrase the app shows is in `locales/{es,fr,de,pt,it}.js`**, keyed by
  the English; the i18n tests fail on any missing, unused, or with different
  `{placeholders}`. Translate so it reads naturally, not word for word.
- **Only components that allow commercial use.**
- **User-facing text sounds human.** The welcome popup sells the app: what you
  get, no disclaimers (a warning belongs where the thing is chosen).
- **Nothing in the text says "no analytics"** (there are analytics), and
  nothing announces them either. That was decided; leave it.
- Reports are public GitHub issues and the form says so. Spam protection is
  the hidden field, 3 a minute per visitor and length checks; add Turnstile
  only if spam actually appears.

## Open work

1. Later, only if asked: translation with your own key (DeepL, Google…); a
   Buy Me a Coffee link.
2. Flaky tests: `editor.spec` once found 4 documents instead of 3 (not
   reproduced in 30 runs; it now prints the names if it happens again);
   reading a scan in WebKit once found no text.
3. The app's translations have not been checked by native speakers, and
   none are available.
4. Safari: Backspace or Ctrl+Z right after a Markdown shortcut does not put
   back what was typed (its undo keeps the shortcut in one step with the
   typing, and a hand-made restore failed there three times); the change
   just stays. Chrome and Firefox put it back. Only Safari itself, not
   this machine, can test a fix: try one on the work branch first.

## Keeping this file current

- **This file is the handover.** A change to how things work, a decision,
  or finished open work goes into this file in the same commit, not at the
  end of the session.
- Long sessions get sloppy. When one has run long, say so and offer a fresh
  one: this file brought up to date first, then the new session started
  with a short note of what is in hand. A new session can read an earlier
  session's transcript (the claude-code-remote tools) for anything this file
  does not have.
- **Use helper agents routinely** (the owner asked for it): send them the
  heavy reading, searching, research and long test runs, and keep only
  their conclusions here, so the session stays sharp for longer.

## Working with the owner

- **Never ask for a secret in chat.** Secrets go in GitHub's secrets or the
  environment's settings, which the owner fills in.
- **Setup steps: exact, click by click, all at once.** Work out every token
  and setting needed before the first step, never one more after "that's
  all". Fine-grained GitHub tokens.
- **A question is not a go.** Raise it, recommend, wait for "go". Once it is
  given, build and ship without another checkpoint.
- **Ask once.** Do not re-list things already asked or done.
- **When pushed back on, check before defending.**
- Keep replies short and plain. End a long one with the actions, split into
  what needs an answer and what needs doing.
