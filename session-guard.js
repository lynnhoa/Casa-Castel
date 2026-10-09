/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — SESSION GUARD (tenant app only)
   session-guard.js   (tenant.html, after auth.js / supabase-client.js)

   A phone stays logged in only while it knows the room's CURRENT
   password. The fingerprint (hash) is stored at login (auth.js) and
   after the tenant's own password change (tenant.html).

   Checked: at app start, when the app comes back to the front, and
   live — a new password for this room (your reset for the next
   tenant) logs the old phone out within seconds.
     · fingerprint differs from the room's password → logout
     · no fingerprint on this phone (logged in before this update)
       → logout once, log in again with the room password
     · no connection / no password row at the moment → no logout
   Landlord preview (?preview=…) is never affected.
   ───────────────────────────────────────────────────────────── */

(function () {
  const PREVIEW = new URLSearchParams(location.search).has('preview');
  const REASON_KEY = 'cc_logout_reason';
  const isTenant = () => localStorage.getItem('cc_role') === 'tenant' && !!localStorage.getItem('cc_room');
  const room = () => localStorage.getItem('cc_room');

  /* Login screen after a forced logout: say why */
  function showReason() {
    let why = null;
    try { why = sessionStorage.getItem(REASON_KEY); sessionStorage.removeItem(REASON_KEY); } catch (e) {}
    if (!why || isTenant()) return;
    const el = document.getElementById('loginError');
    if (!el) return;
    el.textContent = why === 'first'
      ? 'Please log in once more with your room password (security update).'
      : 'The password for this room has changed. Please log in with the new password.';
    el.classList.add('visible');
  }

  function kick(reason) {
    if (!isTenant() || PREVIEW) return;
    try { sessionStorage.setItem(REASON_KEY, reason); } catch (e) {}
    if (typeof logout === 'function') logout();
  }

  let _checking = false;
  async function check() {
    if (PREVIEW || !isTenant() || typeof sbL === 'undefined' || !sbL || _checking) return;
    const mine = localStorage.getItem('cc_pwh');
    if (!mine) { kick('first'); return; }                          // logged in before this update
    _checking = true;
    try {
      const { data, error } = await sbL.from('lounge_data').select('body')
        .eq('type', 'password').eq('room', room())
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error || !data || !data.body) return;                    // offline / being replaced → leave as is
      if (localStorage.getItem('cc_pwh') !== data.body) kick('changed');
    } catch (e) { /* no connection → no logout */ }
    finally { _checking = false; }
  }

  /* Live: a new password row for this room */
  let _channel = null;
  function subscribe() {
    if (PREVIEW || _channel || typeof sbL === 'undefined' || !sbL || !isTenant()) return;
    const r = room();
    _channel = sbL.channel('session-guard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lounge_data' }, payload => {
        const n = payload.new || {};
        if (n.type !== 'password' || n.room !== r) return;
        // own change in this phone already stored the new fingerprint → stays logged in
        if (n.body && n.body !== localStorage.getItem('cc_pwh')) kick('changed');
      })
      .subscribe();
  }

  if (PREVIEW) return;
  showReason();

  // Start once the tenant is logged in (also after a fresh login on this page)
  const ready = setInterval(() => {
    if (!isTenant()) return;
    clearInterval(ready);
    check();
    subscribe();
  }, 500);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
})();
