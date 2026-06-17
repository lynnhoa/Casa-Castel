/* ─────────────────────────────────────────────────────────────
   RENTALS — NAV
   rentals-nav.js

   Profile dropdown, logout wiring.
   Depends on: rentals-constants.js, rentals-auth.js, rentals-layout.js
   ───────────────────────────────────────────────────────────── */

/* ── PROFILE DROPDOWN ───────────────────────────────────────── */
function toggleProfileMenu() {
  document.getElementById('navProfileMenu')?.classList.toggle('open');
}

// Close on outside click
document.addEventListener('click', e => {
  const profile = document.getElementById('navProfile');
  if (profile && !profile.contains(e.target)) {
    document.getElementById('navProfileMenu')?.classList.remove('open');
  }
});

/* ── LANGUAGE — English only ────────────────────────────────── */
const _currentLang = 'en';
const _EN = {
  tab_rooms:    'Rooms',
  tab_tenants:  'Tenants',
  nav_profile:  'Profile',
};
function t(key) { return _EN[key] || key; }
function applyLang() {}
function getCurrentLang() { return 'en'; }

/* ── LOGOUT ─────────────────────────────────────────────────── */
function initNavLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

/* ── INIT ALL NAV ───────────────────────────────────────────── */
function initNav() {
  initNavLogout();
}
