/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — NAV
   js/nav.js

   Profile dropdown, preview-tenant button, language toggle,
   logout wiring, profile modal trigger.
   Depends on: constants.js, auth.js, layout.js, profile-modal.js
   ───────────────────────────────────────────────────────────── */

/* ── PROFILE DROPDOWN ───────────────────────────────────── */
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

/* ── LANGUAGE — English only ────────────────────────────── */
// Translation toggle removed. App is English only.
// t() kept for rooms tab UI labels.
const _currentLang = 'en';
const _EN = {
  tab_lounge:   'Lounge',     tab_cleaning: 'Cleaning',  tab_kitchen:  'Kitchen',
  tab_rooms:    'Rooms',      tab_tenants:  'Tenants',   nav_profile:  'Profile',
  profile_title:'Profile',    profile_landlord:'Landlord', profile_property:'Property',
  profile_bank: 'Bank details', profile_shared_spaces:'Shared spaces',
  profile_bathrooms:'Bathrooms', profile_meters:'Utility meters',
  profile_name: 'Name',       profile_address:'Address', profile_postcode_city:'Postcode / City',
  profile_jurisdiction:'Jurisdiction', profile_signing_location:'Signing location',
  profile_account_holder:'Account holder', profile_landlord_name:'Landlord name',
  profile_landlord_address:'Landlord address', profile_none_added:'None added yet',
  profile_new_space:'New space…', profile_new_bathroom:'e.g. Bathroom 3rd floor…',
  profile_meter_number:'Meter number…', profile_meter_number_label:'Meter number',
  profile_edit: 'Edit',       profile_save: 'Save',      profile_cancel:'Cancel',
  profile_add:  '+ Add',
  rooms_title:  'Rooms',      rooms_add:    'Add room',  rooms_inventar:'Inventar',
  rooms_add_item:'Add item',  rooms_cancel: 'Cancel',    rooms_save:   'Save',
  rooms_delete: 'Delete room', rooms_contracts:'Contracts', rooms_edit:'Edit room',
  rooms_vacant: 'Vacant',     rooms_occupied:'Occupied',
  rooms_mark_vacant:'Mark as vacant', rooms_mark_occupied:'Mark as occupied',
};
function t(key) { return _EN[key] || key; }
function applyLang() {} // no-op — kept so _bindAllCards doesn't error



/* ── LOGOUT WIRING ──────────────────────────────────────── */
function initNavLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

/* ── PROFILE MODAL WIRING ───────────────────────────────── */
function initNavProfile() {
  document.getElementById('profileBtn')?.addEventListener('click', () => {
    toggleProfileMenu();
    openProfile();
  });
}

/* ── PREVIEW TENANT (landlord only) ─────────────────────── */
function initPreviewTenant() {
  const previewBtn = document.getElementById('previewBtn');
  if (!previewBtn) return;

  previewBtn.addEventListener('click', () => {
    document.getElementById('roomPickerOverlay')?.classList.add('visible');
  });

  document.getElementById('cancelPickerBtn')?.addEventListener('click', () => {
    document.getElementById('roomPickerOverlay')?.classList.remove('visible');
  });

  document.getElementById('roomPickerOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('roomPickerOverlay')) {
      document.getElementById('roomPickerOverlay').classList.remove('visible');
    }
  });

  document.querySelectorAll('.room-picker__item').forEach(item => {
    item.addEventListener('click', () => {
      const room = item.dataset.room;
      document.getElementById('roomPickerOverlay')?.classList.remove('visible');
      const label = document.getElementById('tenantPreviewLabel');
      if (label) label.textContent = 'Previewing — ' + room;
      const frame = document.getElementById('tenantPreviewFrame');
      if (frame) frame.src = 'tenant.html?preview=' + encodeURIComponent(room);
      document.getElementById('tenantPreviewOverlay')?.classList.add('visible');
    });
  });

  document.getElementById('tenantPreviewClose')?.addEventListener('click', () => {
    document.getElementById('tenantPreviewOverlay')?.classList.remove('visible');
    const frame = document.getElementById('tenantPreviewFrame');
    if (frame) frame.src = '';
  });

  document.getElementById('exitPreviewBtn')?.addEventListener('click', () => {
    document.getElementById('previewBanner')?.classList.remove('visible');
    if (previewBtn) previewBtn.style.display = '';
    sessionStorage.removeItem('cc_preview_room');
  });

  // Restore preview banner if returning to landlord in preview mode
  const savedPreview = sessionStorage.getItem('cc_preview_room');
  if (savedPreview && localStorage.getItem('cc_role') === 'landlord') {
    const label = document.getElementById('previewRoomLabel');
    if (label) label.textContent = savedPreview;
    document.getElementById('previewBanner')?.classList.add('visible');
    if (previewBtn) previewBtn.style.display = 'none';
  }
}

/* ── INIT ALL NAV ───────────────────────────────────────── */
function initNav() {
  initNavLogout();
  initNavProfile();
  applyLang(_currentLang);
}
