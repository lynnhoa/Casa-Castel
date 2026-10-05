/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — SERVICE WORKER (push only)
   sw.js  (registered by push-client.js in the tenant app)

   Push ONLY: no caching, no fetch handler → loading and updates of
   all apps stay exactly as before.

   · push              → shows the notification, counts it for the
                          red number on the app icon (Lounge / Kitchen)
   · notificationclick → opens / focuses the tenant app on that tab
   · message 'cc-clear'→ the app says "Lounge / Kitchen was seen":
                          count back to 0, its notifications removed
   · message 'cc-reset'→ logout: everything back to 0
   ───────────────────────────────────────────────────────────── */

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

/* ── Counters (IndexedDB, survives app restarts) ───────────── */
const CC_DB = 'cc-push', CC_STORE = 'kv', CC_ZERO = { lounge: 0, kitchen: 0 };

function ccDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(CC_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(CC_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
async function ccGetCounts() {
  try {
    const db = await ccDb();
    return await new Promise(res => {
      const q = db.transaction(CC_STORE).objectStore(CC_STORE).get('counts');
      q.onsuccess = () => res({ ...CC_ZERO, ...(q.result || {}) });
      q.onerror   = () => res({ ...CC_ZERO });
    });
  } catch (e) { return { ...CC_ZERO }; }
}
async function ccSetCounts(c) {
  try {
    const db = await ccDb();
    await new Promise(res => {
      const tx = db.transaction(CC_STORE, 'readwrite');
      tx.objectStore(CC_STORE).put(c, 'counts');
      tx.oncomplete = res; tx.onerror = res;
    });
  } catch (e) {}
}
async function ccApplyBadge(c) {
  const n = (c.lounge || 0) + (c.kitchen || 0);
  try {
    if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (self.navigator.clearAppBadge)   await self.navigator.clearAppBadge();
  } catch (e) {}
}

/* Nudges count as Kitchen (they are about the kitchen and clear when Kitchen is opened) */
function ccChannel(ch) { return ch === 'kitchen' || ch === 'nudge' ? 'kitchen' : 'lounge'; }

/* Only the tenant app — never the management app on the same domain */
function ccIsTenantPage(url) {
  try { const p = new URL(url).pathname; return p === '/' || p === '/tenant.html'; } catch (e) { return false; }
}

/* ── PUSH ──────────────────────────────────────────────────── */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const ch = ccChannel(d.ch);
  e.waitUntil((async () => {
    const c = await ccGetCounts();
    c[ch] = (c[ch] || 0) + (Number(d.count) > 0 ? Number(d.count) : 1);
    await ccSetCounts(c);
    await ccApplyBadge(c);
    // An open tenant app on that tab clears it right away
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.filter(w => ccIsTenantPage(w.url)).forEach(w => w.postMessage({ type: 'cc-push', ch }));
    const opts = { body: d.body || '', data: { ch }, icon: '/tenant-icon-192.png', badge: '/tenant-icon-192.png' };
    if (d.tag) opts.tag = d.tag;
    await self.registration.showNotification(d.title || 'Casa Castel', opts);
  })());
});

/* ── TAP ON A NOTIFICATION ─────────────────────────────────── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ch = ccChannel(e.notification.data && e.notification.data.ch);
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(x => ccIsTenantPage(x.url));
    if (w) {
      try { await w.focus(); } catch (err) {}
      w.postMessage({ type: 'cc-open', ch });
      return;
    }
    await self.clients.openWindow('/?open=' + ch);
  })());
});

/* ── MESSAGES FROM THE APP ─────────────────────────────────── */
self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'cc-clear') {
    const chs = (m.chs || []).map(ccChannel);
    e.waitUntil((async () => {
      const c = await ccGetCounts();
      chs.forEach(ch => { c[ch] = 0; });
      await ccSetCounts(c);
      await ccApplyBadge(c);
      const ns = await self.registration.getNotifications();
      ns.forEach(n => { if (n.data && chs.includes(n.data.ch)) n.close(); });
    })());
  }
  if (m.type === 'cc-reset') {
    e.waitUntil((async () => {
      await ccSetCounts({ ...CC_ZERO });
      await ccApplyBadge(CC_ZERO);
      const ns = await self.registration.getNotifications();
      ns.forEach(n => n.close());
    })());
  }
});
