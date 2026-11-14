/* Noteshack — offline support.
   The app's own files are fetched fresh whenever there is a connection (so an
   update shows up on the next load, not some loads later) and served from the
   cache only when offline. The large libraries under vendor/ are served from
   a cache of their own, first: an app update leaves them alone, so they are
   not downloaded again each time. Their file names carry no version, so
   VENDOR is bumped whenever a file under vendor/ changes. */
const CACHE = 'noteshack-v62';
const VENDOR = 'noteshack-vendor-9';
const ASSETS = [
  './', './index.html', './styles.css', './icon.svg', './manifest.webmanifest',
  './js/boot.js', './js/i18n.js', './locales/es.js', './locales/fr.js', './locales/de.js', './locales/pt.js', './locales/it.js', './js/icons.js', './js/sanitize.js', './js/markdown.js', './js/zip.js', './js/docx.js', './js/store.js', './js/fonts.js', './js/lang.js', './js/spell.js', './js/spellworker.js', './js/remote.js', './js/translate.js', './js/shaping.js', './js/pdf.js', './js/images.js', './js/scanfont.js', './js/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    // only the app's own old copies: the downloaded fonts (np-fonts-…) stay
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== VENDOR &&
      /^(notepad-online|noteshack)-v\d|^noteshack-vendor-/.test(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const vendor = url.pathname.includes('/vendor/');
  e.respondWith(caches.open(vendor ? VENDOR : CACHE).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached && vendor) return cached;
    try {
      // no-cache: ask the server even if the browser's own HTTP cache thinks its copy is recent
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  }));
});
