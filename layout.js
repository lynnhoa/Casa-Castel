/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — LAYOUT
   js/layout.js

   App shell, tab switching, viewport locking.
   Depends on: constants.js, auth.js, chat-viewport.js
   ───────────────────────────────────────────────────────────── */

const kIsMobile = () => window.innerWidth <= 700;

/* ── TAB SWITCH ─────────────────────────────────────────── */
function switchTab(tabName) {
  const mobile    = kIsMobile();
  const isLounge  = tabName === 'lounge';
  const isKitchen = tabName === 'kitchen';
  // Persist active tab so page refresh restores it
  try { localStorage.setItem('cc_last_tab', tabName); } catch(e) {}

  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

  // Show requested tab
  // Lounge + kitchen need display:flex on mobile (column layout for chat viewport lock)
  // On desktop all tabs use display:block — the desktop grid handles its own layout
  const tabEl = document.getElementById('tab-' + tabName);
  if (tabEl) {
    tabEl.style.display = ((isLounge || isKitchen) && mobile) ? 'flex' : 'block';
  }

  // Active state on nav tabs
  document.querySelectorAll('.cc-tab[data-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  if (mobile) {
    const shell = document.getElementById('appShell');
    shell?.classList.toggle('lounge-active',  isLounge);
    shell?.classList.toggle('kitchen-active', isKitchen);
    document.body.classList.toggle('kitchen-locked', isLounge || isKitchen);
    const lockVp = isLounge || isKitchen;
    document.documentElement.style.height  = lockVp ? '100%' : '';
    document.body.style.height             = lockVp ? '100%' : '';
    document.documentElement.style.overflow= lockVp ? 'hidden' : '';
    document.body.style.overflow           = lockVp ? 'hidden' : '';
  } else {
    const shell = document.getElementById('appShell');
    shell?.classList.remove('lounge-active', 'kitchen-active');
    document.body.classList.remove('kitchen-locked');
    document.documentElement.style.height   = '';
    document.body.style.height              = '';
    document.documentElement.style.overflow = '';
    document.body.style.overflow            = '';
    // Restore scroll to top when leaving chat tabs — prevents blank white area
    window.scrollTo(0, 0);
  }

  // Trigger tab load functions (defined in each tab module)
  // currentRoom is set by showApp for tenants; undefined for landlord (cleaning ignores it)
  const _room = typeof currentRoom !== 'undefined' ? currentRoom : undefined;
  if (tabName === 'lounge')   loadLoungeAll?.();
  if (tabName === 'cleaning') loadHouseCleaning?.(_room);
  if (tabName === 'kitchen')  (mobile || typeof initKitchen === 'undefined') ? initKitchenMobile?.(_room) : initKitchen?.(_room);
  if (tabName === 'rooms')    loadRooms?.();
  if (tabName === 'tenants')  loadTenants?.();
}

/* ── SHOW APP (after login) ─────────────────────────────── */
function showApp(room) {
  // loginScreen only exists in tenant.html — landlord.html gates via login.html
  const _ls = document.getElementById('loginScreen');
  if (_ls) _ls.style.display = 'none';

  const shell = document.getElementById('appShell');
  shell?.classList.add('visible');
  shell?.classList.remove('kitchen-active');

  // Lock scroll from the start on mobile (lounge is default first tab)
  if (kIsMobile()) {
    shell?.classList.add('lounge-active');
    document.documentElement.style.height  = '100%';
    document.body.style.height             = '100%';
    document.documentElement.style.overflow= 'hidden';
    document.body.style.overflow           = 'hidden';
  }

  window.scrollTo(0, 0);
  detectPWAMode();         // from auth.js
  initChatViewport();      // from chat-viewport.js

  if (room) {
    currentRoom = room;
    const pill = document.getElementById('navRoomPill');
    if (pill) pill.textContent = room;
    // Show kitchen tab now that room is known — covers first login
    // where the tab was hidden at parse time before localStorage was written
    if (typeof _kTenShowTabIfEligible === 'function') _kTenShowTabIfEligible();
  }

  // For tenant: wire lounge compose events now that room is known.
  // switchTab('lounge') below will call loadLoungeAll which calls loadLounge(room).
  if (room && typeof initLoungeTab === 'function') initLoungeTab(room);

  // Restore last active tab — validate against tabs present on this page.
  // Priority: (1) cc_open_tab from login.html (consumed once); (2) cc_last_tab; (3) lounge.
  // cc_last_tab is shared localStorage — validate against DOM to avoid blank tabs cross-role.
  const _availableTabs = new Set(
    [...document.querySelectorAll('.cc-tab[data-tab]')].map(b => b.dataset.tab)
  );
  const _openTab = (() => { try { return sessionStorage.getItem('cc_open_tab'); } catch(e) { return null; } })();
  if (_openTab) { try { sessionStorage.removeItem('cc_open_tab'); } catch(e) {} }
  const _savedTab = _openTab || (() => { try { return localStorage.getItem('cc_last_tab'); } catch(e) { return null; } })();
  const _lastTab = (_savedTab && _availableTabs.has(_savedTab)) ? _savedTab : 'lounge';
  switchTab(_lastTab);
}

/* ── WIRE TAB BUTTONS ───────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.cc-tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}


// ── CLEAR STALE TAB PREFERENCE (one-time migration to rooms default) ──
(function() {
  const v = localStorage.getItem('cc_last_tab');
  if (!v) {
    localStorage.setItem('cc_last_tab', 'rooms');
  }
})();
