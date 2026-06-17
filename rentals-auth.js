/* ─────────────────────────────────────────────────────────────
   RENTALS — AUTH
   rentals-auth.js

   Login / logout / PWA detection. Landlord only.
   Depends on: rentals-constants.js
   ───────────────────────────────────────────────────────────── */

/* ── PWA DETECTION ─────────────────────────────────────────── */
let currentRoom = null;

function isPWA() {
  return window.matchMedia('(display-mode:standalone)').matches
      || window.navigator.standalone === true;
}

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

/* ── LANDLORD AUTH ──────────────────────────────────────────── */
function doLandlordLogin() {
  const input = document.getElementById('landlordPass');
  if (!input) return;
  if (input.value === LANDLORD_PASS) {
    localStorage.setItem('rentals_role', 'landlord');
    document.getElementById('loginError')?.classList.remove('visible');
    showApp();
  } else {
    document.getElementById('loginError')?.classList.add('visible');
    input.value = '';
    input.focus();
  }
}

function initLandlordLogin() {
  document.getElementById('landlordLoginBtn')
    ?.addEventListener('click', doLandlordLogin);
  document.getElementById('landlordPass')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') doLandlordLogin(); });
  if (localStorage.getItem('rentals_role') === 'landlord') { showApp(); }
}

/* ── LOGOUT ─────────────────────────────────────────────────── */
function logout() {
  localStorage.removeItem('rentals_role');
  location.reload();
}
