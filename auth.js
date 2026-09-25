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
      if it's genuinely missing or expired, flags are cleared
      and the user is bounced back to login.html.

   The session check is retried once before anything is cleared.
   Reason: on a cold start (e.g. iOS relaunching the PWA after a
   PDF was handed to the system viewer) the client still has to
   refresh an expired access token over the network. A single
   slow or failed refresh used to resolve with no session, which
   wiped the flags and logged the user out mid-work. Only two
   consecutive confirmed "no session" results end the session;
   a thrown error means network trouble and keeps the app open. */
function initLandlordAuth() {
  if (localStorage.getItem('cc_role') !== 'landlord') {
    location.replace('login.html');
    return;
  }
  if (!sbL) return;
  const endSession = () => {
    localStorage.removeItem('cc_role');
    localStorage.removeItem('rentals_role');
    location.replace('login.html');
  };
  // A Supabase login from this device is stored in the browser
  const hasStoredLogin = () => {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true;
    }
    return false;
  };
  // Throws on network failure
  const hasSession = () => sbL.auth.getSession().then(({ data }) => !!data.session);
  // SECURITY: the landlord app is shown only AFTER the login is confirmed (a browser flag alone is not enough)
  hasSession().then(ok => {
    if (ok) { showApp(); return; }
    // First check came back empty — give the token refresh a moment, then re-check
    return new Promise(r => setTimeout(r, 1200))
      .then(hasSession)
      .then(ok2 => { if (ok2) showApp(); else endSession(); });
  }).catch(() => {
    // Offline / refresh failed: open only if this device has a stored landlord login
    // (every data request still needs a valid login, so a fake flag shows no data)
    if (hasStoredLogin()) showApp(); else endSession();
  });
}

/* ── TENANT AUTH — room + password ─────────────────────────
   SECURITY: no passwords in this file and no "room2026" rule any more.
   A room logs in only with the password the landlord set (Tenants tab →
   Reset pw) or the tenant chose. "Casa Castel" is never a tenant room. */
const CC_LANDLORD_NAME = 'Casa Castel';

// Active tenant room names from the rooms table (null = could not check, e.g. offline)
async function _ccActiveRooms() {
  if (!sbL) return null;
  try {
    const { data, error } = await sbL.from('rooms').select('name').eq('active', true);
    if (error || !data) return null;
    return data.map(r => r.name).filter(n => n && n !== CC_LANDLORD_NAME);
  } catch (e) { return null; }
}

// Preview is view-only: every write from this page is refused before it reaches the database
function _ccMakeReadOnly() {
  if (!sbL || sbL.__ccReadOnly) return;
  const denied = { data: null, error: { message: 'Preview is view-only' } };
  const deny = () => {
    const b = { select: () => b, eq: () => b, neq: () => b, in: () => b, match: () => b,
                single: () => b, maybeSingle: () => b,
                then: (ok, bad) => Promise.resolve(denied).then(ok, bad) };
    return b;
  };
  const from = sbL.from.bind(sbL);
  sbL.from = table => {
    const q = from(table);
    ['insert', 'update', 'upsert', 'delete'].forEach(m => { q[m] = deny; });
    return q;
  };
  const storageFrom = sbL.storage.from.bind(sbL.storage);
  sbL.storage.from = bucket => {
    const s = storageFrom(bucket);
    ['upload', 'update', 'remove', 'move', 'copy'].forEach(m => { s[m] = async () => denied; });
    return s;
  };
  sbL.__ccReadOnly = true;
}

async function _hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function doTenantLogin() {
  const room = document.getElementById('tenantRoom')?.value;
  const pass = document.getElementById('tenantPass')?.value;
  const err  = document.getElementById('loginError');
  const showErr = msg => {
    if (!err) return;
    if (err.dataset.defaultText === undefined) err.dataset.defaultText = err.textContent;
    err.textContent = msg || err.dataset.defaultText;
    err.classList.add('visible');
  };
  if (!room || !pass || room === CC_LANDLORD_NAME) { showErr(); return; }
  let valid = false, noPassword = false;
  try {
    const rooms = await _ccActiveRooms();
    if (rooms && rooms.includes(room)) {
      const { data } = await sbL.from('lounge_data').select('body')
        .eq('type','password').eq('room', room)
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      if (data && data.body) {
        const h = await _hashPassword(pass);
        valid = (h === data.body);
      } else {
        noPassword = true;
      }
    }
  } catch(e) { /* no connection → login not possible */ }
  if (valid) {
    localStorage.setItem('cc_role', 'tenant');
    localStorage.setItem('cc_room', room);
    err?.classList.remove('visible');
    showApp(room);
    if (typeof loadRoomsData === 'function') loadRoomsData();
  } else {
    showErr(noPassword ? 'No password set for this room yet — please ask Casa Castel.' : undefined);
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
  // SECURITY: only with a confirmed landlord login, only for real rooms, and view-only.
  const previewRoom = new URLSearchParams(window.location.search).get('preview');
  if (previewRoom) {
    document.getElementById('loginScreen').style.display = 'none';
    (async () => {
      let isLandlord = false;
      try { const { data } = await sbL.auth.getUser(); isLandlord = !!(data && data.user); } catch (e) {}
      const rooms = isLandlord ? await _ccActiveRooms() : null;
      if (!isLandlord || !rooms || !rooms.includes(previewRoom)) {
        document.getElementById('loginScreen').style.display = '';   // back to the normal login
        _populateTenantRoomDropdown();
        return;
      }
      _ccMakeReadOnly();
      showApp(previewRoom);
    })();
    return;
  }
  // Auto-login if session exists — check synchronously before any async work
  // so the login screen is hidden immediately on refresh, eliminating the flash.
  const savedRoom = localStorage.getItem('cc_room');
  if (localStorage.getItem('cc_role') === 'tenant' && savedRoom && savedRoom !== CC_LANDLORD_NAME) {
    document.getElementById('loginScreen').style.display = 'none';
    showApp(savedRoom);
    // SECURITY: the saved room must still be a real room (removed rooms / edited storage → logged out)
    _ccActiveRooms().then(rooms => { if (rooms && !rooms.includes(savedRoom)) logout(); });
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
