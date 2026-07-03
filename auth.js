/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — AUTH
   js/auth.js

   Login / logout / PWA detection.
   Depends on: constants.js
   ───────────────────────────────────────────────────────────── */

/* ── PWA DETECTION ──────────────────────────────────────── */
// Global: set by showApp so tab modules can read it
let currentRoom = null;
function isPWA() {
  return window.matchMedia('(display-mode:standalone)').matches
      || window.navigator.standalone === true;
}

/* Measures actual Safari browser chrome height instead of
   hardcoding 70px. Sets --cc-browser-chrome-h on :root.    */
function detectPWAMode() {
  if (!isPWA()) {
    document.body.classList.add('browser-mode');
    const chromeH = window.screen.height - window.innerHeight;
    if (chromeH > 20) {
      document.documentElement.style.setProperty(
        '--cc-browser-chrome-h',
        Math.min(chromeH + 10, 100) + 'px'
      );
    }
  }
  return isPWA();
}

/* ── LANDLORD AUTH ──────────────────────────────────────────
   All landlord authentication happens on login.html via
   Supabase email + password. This gate only verifies it:
   1. Sync check on the cc_role flag (set by login.html) so the
      app shows instantly with no flash.
   2. Background verification of the actual Supabase session —
      if it's missing or expired, flags are cleared and the
      user is bounced back to login.html.                      */
function initLandlordAuth() {
  if (localStorage.getItem('cc_role') !== 'landlord') {
    location.replace('login.html');
    return;
  }
  showApp();
  if (sbL) {
    sbL.auth.getSession().then(({ data }) => {
      if (!data.session) {
        localStorage.removeItem('cc_role');
        localStorage.removeItem('rentals_role');
        location.replace('login.html');
      }
    }).catch(() => { /* offline — keep app open, flag already checked */ });
  }
}

/* ── TENANT AUTH — room + password (matches v1 exactly) ─── */
const ROOM_PASSWORDS = {
  'Paris':       'paris2026',
  'Copenhagen':  'copenhagen2026',
  'Stockholm':   'stockholm2026',
  'Oslo':        'oslo2026',
  'London':      'london2026',
  'New York':    'newyork2026',
  'Los Angeles': 'losangeles2026'
};

async function _hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function doTenantLogin() {
  const room = document.getElementById('tenantRoom')?.value;
  const pass = document.getElementById('tenantPass')?.value;
  const err  = document.getElementById('loginError');
  if (!room || !pass) { err?.classList.add('visible'); return; }

  let valid = false;
  // Check Supabase for a custom (changed) password first
  try {
    if (sbL) {
      const { data } = await sbL.from('lounge_data').select('body')
        .eq('type','password').eq('room', room)
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      if (data && data.body) {
        const h = await _hashPassword(pass);
        valid = (h === data.body);
      }
    }
  } catch(e) { /* fall through */ }

  // Fall back to hardcoded room password (existing rooms)
  if (!valid && ROOM_PASSWORDS[room] && pass === ROOM_PASSWORDS[room]) valid = true;

  // Final fallback: default formula roomname2026 (new rooms added via rooms tab)
  if (!valid) {
    const defaultPw = room.toLowerCase().replace(/\s+/g, '') + '2026';
    if (pass === defaultPw) valid = true;
  }

  if (valid) {
    localStorage.setItem('cc_role', 'tenant');
    localStorage.setItem('cc_room', room);
    err?.classList.remove('visible');
    showApp(room);
    if (typeof loadRoomsData === 'function') loadRoomsData();
  } else {
    err?.classList.add('visible');
    document.getElementById('tenantPass').value = '';
    document.getElementById('tenantPass').focus();
  }
}

async function _populateTenantRoomDropdown() {
  const sel = document.getElementById('tenantRoom');
  if (!sel || !sbL) return;
  try {
    const { data } = await sbL.from('rooms')
      .select('name, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (!data) return;
    // Remove any existing options except the placeholder
    while (sel.options.length > 1) sel.remove(1);
    data.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
    // Restore saved room if session exists
    const saved = localStorage.getItem('cc_room');
    if (saved) sel.value = saved;
  } catch(e) { /* leave placeholder if DB unavailable */ }
}

function initTenantLogin() {
  document.getElementById('tenantLoginBtn')
    ?.addEventListener('click', doTenantLogin);
  document.getElementById('tenantPass')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') doTenantLogin(); });

  // Preview mode (landlord previewing as tenant)
  const previewRoom = new URLSearchParams(window.location.search).get('preview');
  if (previewRoom) {
    document.getElementById('loginScreen').style.display = 'none';
    showApp(previewRoom);
    return;
  }

  // Auto-login if session exists — check synchronously before any async work
  // so the login screen is hidden immediately on refresh, eliminating the flash.
  const savedRoom = localStorage.getItem('cc_room');
  if (localStorage.getItem('cc_role') === 'tenant' && savedRoom) {
    document.getElementById('loginScreen').style.display = 'none';
    showApp(savedRoom);
  }

  // Populate room dropdown from DB (runs in background — no longer blocks auto-login)
  _populateTenantRoomDropdown();
}

/* ── LOGOUT ─────────────────────────────────────────────── */
function logout() {
  const wasTenant = localStorage.getItem('cc_role') === 'tenant';
  localStorage.removeItem('cc_role');
  localStorage.removeItem('cc_room');
  if (!wasTenant) {
    localStorage.removeItem('rentals_role');
    if (sbL) sbL.auth.signOut().catch(() => {});
  }
  sessionStorage.removeItem('cc_preview_room');
  location.href = wasTenant ? 'tenant.html' : 'login.html';
}
