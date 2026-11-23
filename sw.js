// Network first for everything, cache as fallback: always fresh scores, and the last ones still show offline.
// shortcut: the data cache grows by one small JSON per day/match you open; clear site data if it ever matters.
const CACHE = 'palco-v6';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'lib.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !(url.origin === location.origin || url.hostname === 'site.api.espn.com')) return;
  // no-cache = revalidate with the server, so a new push to GitHub shows up on the next open.
  // (by URL: a navigate-mode Request can't be re-wrapped with options)
  const go = url.origin === location.origin ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(go.then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: url.origin === location.origin })));
});
