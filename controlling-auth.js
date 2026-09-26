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

/* Returns the session, null when there really is none, or 'offline' when the
   check failed twice but a login is stored on this device (connection hiccup
   ≠ logout — the app stays open and the data load shows "Retry"). */
function _ctlHasStoredLogin() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true;
    }
  } catch (e) {}
  return false;
}
async function ctlGetSession() {
  const once = async () => {
    const { data, error } = await _ctlSupa.auth.getSession();
    if (error) throw error;
    return data.session;
  };
  try { return await once(); } catch (e) {}
  await new Promise(r => setTimeout(r, 1200));
  try { return await once(); } catch (e) { return _ctlHasStoredLogin() ? 'offline' : null; }
}

async function ctlSignOut() {
  try { await _ctlSupa.auth.signOut(); } catch(e) {}
  localStorage.removeItem('cc_role');
  localStorage.removeItem('rentals_role');
  location.href = 'login.html?logout=1';
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

/* ── Parts of the app that newer versions need. If the page is an older
      controlling.html (cached or not yet replaced), load them here so the
      app still starts — and name the file if one is really missing. ── */
const CTL_BUILD = '2026-09-26b';
function _ctlLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src + '?v=' + CTL_BUILD;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Datei fehlt: ' + src));
    document.head.appendChild(s);
  });
}
async function ctlEnsureParts() {
  if (typeof CX === 'undefined')              await _ctlLoadScript('controlling-ui.js');
  if (typeof ctlSollLoad !== 'function')      await _ctlLoadScript('controlling-soll.js');
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
  try { localStorage.setItem('mgmt_last_app', 'controlling.html'); } catch (e) {}

  try {
    await ctlEnsureParts();
    await Promise.all([ctlLoadAll(), ctlSollLoad()]);   // Controlling data + planned amounts from the other apps
    document.getElementById('appShell').style.display = 'block';
    window.renderDashboard?.();
  } catch (e) {
    console.error('[controlling] boot failed:', e);
    document.getElementById('appShell').style.display = 'block';
    document.getElementById('tab-dashboard').innerHTML =
      '<div class="ct-page" style="padding:20px 16px"><p class="cc-note">Daten konnten nicht geladen werden. ' +
      '<a href="#" onclick="location.reload();return false;" style="color:#8A6535;text-decoration:underline;">Erneut versuchen</a></p>' +
      '<p style="font-size:11px;color:#A89A86;margin-top:6px">' + String((e && e.message) || e).replace(/</g, '&lt;') + '</p></div>';
  } finally {
    ctlShowLoading(false);
  }
}

/* Wire logout */
document.getElementById('logoutBtn')?.addEventListener('click', ctlSignOut);
