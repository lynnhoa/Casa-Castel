/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS push helper   pv-sw.js
   Only for the provider app (scope /service.html) and your Providers page
   (scope /providers.html). The tenant app keeps its own sw.js, untouched.
   ───────────────────────────────────────────────────────────── */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
/* the provider app is installed at /providers (manifest scope) — a push must
   open INSIDE that scope, never /service.html, or iPhone opens a browser tab */
function _pvFallback() { return self.registration.scope.indexOf('providers.html') !== -1 ? '/providers.html' : '/providers'; }
function _pvKey(u) {                          /* /providers · /service.html = the provider app · /providers.html = Lynn's */
  const p = new URL(u, self.location.origin).pathname;
  return (p === '/providers' || p === '/service.html' || p === '/service') ? 'service-app' : p;
}
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Casa Castel', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || _pvFallback() }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || _pvFallback(), self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(x => _pvKey(x.url) === _pvKey(url));
    if (w) { await w.focus(); w.postMessage({ type: 'pv-push' }); return; }
    await self.clients.openWindow(url);
  })());
});
