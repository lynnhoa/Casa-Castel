/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS push helper   pv-sw.js
   Only for the provider app (scope /service.html) and your Providers page
   (scope /providers.html). The tenant app keeps its own sw.js, untouched.
   ───────────────────────────────────────────────────────────── */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Casa Castel', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || self.registration.scope }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || self.registration.scope, self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(x => x.url.split('?')[0] === url.split('?')[0]);
    if (w) { await w.focus(); w.postMessage({ type: 'pv-push' }); return; }
    await self.clients.openWindow(url);
  })());
});
