// Network first for everything, cache as fallback: always fresh scores, and the last ones still show offline.
// shortcut: the data cache grows by one small JSON per day/match you open; clear site data if it ever matters.
const CACHE = 'palco-v11';
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

// Goal alerts: the push carries no text; ask Palco's server what happened and show it.
const PUSH_SERVER = 'https://palco-ia.ar2men.workers.dev';
self.addEventListener('push', e => e.waitUntil((async () => {
  let items = [];
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const r = await fetch(`${PUSH_SERVER}/pending`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub?.endpoint }) });
    items = (await r.json()).items ?? [];
  } catch { /* offline: show a generic alert below */ }
  if (!items.length) items = [{ title: 'Palco', body: 'Hay novedades en los partidos de tus equipos.', url: './' }];
  await Promise.all(items.slice(-3).map(n => self.registration.showNotification(n.title, {
    body: n.body, tag: n.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: n.url },
  })));
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? './'));
});
