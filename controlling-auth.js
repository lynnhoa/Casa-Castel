/* ─────────────────────────────────────────────────────────────
   CONTROLLING — AUTH + BOOT
   controlling-auth.js

   Session check + logout. Login itself lives on login.html.
   Depends on: constants.js (SB_URL, SB_KEY), supabase-js (UMD)
   ───────────────────────────────────────────────────────────── */

'use strict';

/* ── Supabase client (same session as other sub-apps) ───────── */
const _ctlSupa = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

async function ctlGetSession() {
  try {
    const { data } = await _ctlSupa.auth.getSession();
    return data.session;
  } catch (e) { return null; }
}

async function ctlSignOut() {
  try { await _ctlSupa.auth.signOut(); } catch(e) {}
  localStorage.removeItem('cc_role');
  localStorage.removeItem('rentals_role');
  location.href = 'login.html';
}

/* ── UI helpers ─────────────────────────────────────────────── */
function ctlShowLoading(on) {
  document.getElementById('ctLoading')?.classList.toggle('show', !!on);
}
function ctlToast(msg) {
  const t = document.getElementById('ctToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ── Boot ───────────────────────────────────────────────────── */
async function boot() {
  ctlShowLoading(true);

  const session = await ctlGetSession();
  if (!session) {
    ctlShowLoading(false);
    location.replace('login.html');
    return;
  }

  try {
    await ctlLoadAll();                             // → controlling-data.js
    document.getElementById('appShell').style.display = 'block';
    window.renderDashboard?.();
  } catch (e) {
    console.error('[controlling] boot failed:', e);
    document.getElementById('appShell').style.display = 'block';
    document.getElementById('tab-dashboard').innerHTML =
      '<div class="ct-page"><p class="cc-note" style="padding:20px 0;">Could not load data. ' +
      '<a href="#" onclick="location.reload();return false;" style="color:var(--cc-gold);text-decoration:underline;">Retry</a></p></div>';
  } finally {
    ctlShowLoading(false);
  }
}

/* Wire logout */
document.getElementById('logoutBtn')?.addEventListener('click', ctlSignOut);
