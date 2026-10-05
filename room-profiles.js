/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — ROOM PROFILES (photo + chat name)
   room-profiles.js   (tenant.html + landlord.html, after utils.js,
                       BEFORE the Lounge / Kitchen tab modules)

   A tenant can give their room a photo and a name for the chat
   (profile-tenant.js). Shown in the Lounge + Kitchen chat of both
   apps: photo instead of the initials circle, "Kim · Stockholm"
   instead of "Stockholm". Bound to the room's current password →
   after a password reset (new tenant) it disappears by itself.

   Chat renderers call:
     ccAvAttrs(room)   → extra attributes for the avatar circle
     ccNameText(room)  → "Kim · Stockholm" or "Stockholm"
     ccNameAttrs(room) → extra attributes for the name label
   Elements drawn before the profiles arrived are updated in place
   (ccProfApply), so no tab has to re-render.

   Management app: tap a tenant's photo in a chat → remove that
   room's photo + name (profile_clear, landlord login only).
   ───────────────────────────────────────────────────────────── */

const CC_PROFILES = {};          // room → { name, photo }
const CC_LANDLORD_ROOM = 'Casa Castel';

function _ccProfEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ccProfileOf(room) {
  return room && room !== CC_LANDLORD_ROOM ? (CC_PROFILES[room] || null) : null;
}

/* Avatar circle: data attribute (+ photo as background while known) */
function ccAvAttrs(room) {
  if (!room || room === CC_LANDLORD_ROOM) return '';
  const p = ccProfileOf(room);
  const photo = p && p.photo
    ? ` style="background-image:url('${_ccProfEsc(p.photo)}');background-size:cover;background-position:center;color:transparent;"`
    : '';
  return ` data-cc-av="${_ccProfEsc(room)}"${photo}`;
}

/* Name label: "Kim · Stockholm" when the room has a chat name */
function ccNameText(room) {
  const p = ccProfileOf(room);
  return p && p.name ? p.name + ' · ' + room : (room || '');
}
function ccNameAttrs(room) {
  if (!room || room === CC_LANDLORD_ROOM) return '';
  return ` data-cc-name="${_ccProfEsc(room)}"`;
}

/* Update everything already on screen */
function ccProfApply(root) {
  const r = root || document;
  r.querySelectorAll('[data-cc-av]').forEach(el => {
    const p = ccProfileOf(el.dataset.ccAv);
    if (p && p.photo) {
      el.style.backgroundImage = `url('${p.photo.replace(/'/g, '%27')}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.color = 'transparent';
    } else {
      el.style.backgroundImage = '';
      el.style.color = '';
    }
  });
  r.querySelectorAll('[data-cc-name]').forEach(el => { el.textContent = ccNameText(el.dataset.ccName); });
}

/* Load the current profiles (only those of the rooms' current tenants) */
let _ccProfLoading = null, _ccProfAt = 0;
function ccProfilesLoad(force) {
  if (typeof sbL === 'undefined' || !sbL) return Promise.resolve();
  if (!force && _ccProfLoading) return _ccProfLoading;
  if (!force && Date.now() - _ccProfAt < 15000) return Promise.resolve();
  _ccProfLoading = (async () => {
    try {
      const { data, error } = await sbL.rpc('room_profiles_current');
      if (error) { console.warn('[profiles]', error.message); return; }
      Object.keys(CC_PROFILES).forEach(k => delete CC_PROFILES[k]);
      (data || []).forEach(r => {
        if (r.display_name || r.photo_url) CC_PROFILES[r.room] = { name: r.display_name || '', photo: r.photo_url || '' };
      });
      _ccProfAt = Date.now();
      ccProfApply();
      document.dispatchEvent(new CustomEvent('cc-profiles'));
    } finally { _ccProfLoading = null; }
  })();
  return _ccProfLoading;
}

(function () {
  // Start, and refresh when the app comes back to the front
  const start = () => ccProfilesLoad(true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ccProfilesLoad(); });

  // Management app only: tap a tenant's photo in a chat → remove photo + name
  const isTenantApp = () => document.body && document.body.classList.contains('tenant-shell');
  document.addEventListener('click', async e => {
    if (isTenantApp()) return;
    const el = e.target.closest && e.target.closest('[data-cc-av]');
    if (!el) return;
    const room = el.dataset.ccAv, p = ccProfileOf(room);
    if (!p) return;
    if (typeof ccDialog !== 'function') return;
    const who = p.name ? `${_ccProfEsc(p.name)} (${_ccProfEsc(room)})` : _ccProfEsc(room);
    const ok = await ccDialog({
      icon: 'ti-user-x', tone: 'danger', title: 'Remove profile?',
      body: `Removes the photo and chat name of ${who}. The tenant can set a new one any time.`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Remove', danger: true, primary: true, value: true }],
    });
    if (!ok) return;
    const { error } = await sbL.rpc('profile_clear', { p_room: room });
    if (error) { if (typeof ccDialog === 'function') ccDialog({ title: 'Not removed', body: _ccProfEsc(error.message) }); return; }
    await ccProfilesLoad(true);
  });
})();
