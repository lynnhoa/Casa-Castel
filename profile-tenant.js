/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — TENANT PROFILE SHEET (photo + chat name)
   profile-tenant.js   (tenant.html only, after room-profiles.js)

   Profile menu → "Edit profile": a photo for the chat (library or
   camera, cropped to a square and shrunk to 256 px on the phone)
   and a name, shown as "Kim · Stockholm". Optional, only for the
   stay: saved with the room's current password, so it disappears
   by itself when the next tenant moves in.

   Saving needs this phone's room password (hash from the login).
   Phones logged in before this update are asked for the password
   once — otherwise a former tenant who is still logged in could
   change the current tenant's photo or name.
   ───────────────────────────────────────────────────────────── */

(function () {
  const PREVIEW = new URLSearchParams(location.search).has('preview');
  const room = () => (typeof currentRoom !== 'undefined' && currentRoom) || null;
  const MAX_NAME = 20;
  let _blob = null;          // new photo (not uploaded yet)
  let _removePhoto = false;  // "Remove photo" tapped

  const slug = r => String(r).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
  const esc  = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Square crop, 256 px JPEG */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas'); c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  function sheet() {
    let o = document.getElementById('profileModal');
    if (o) return o;
    o = document.createElement('div');
    o.className = 'cc-modal-overlay';
    o.id = 'profileModal';
    o.innerHTML = `
      <div class="cc-modal-sheet">
        <div class="cc-modal-hdr">
          <span class="cc-modal-title">Profile</span>
          <button class="cc-modal-close" type="button" data-pf="close">✕</button>
        </div>
        <div class="cc-modal-body" id="profileModalBody"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-pf="close"]')) close(); });
    return o;
  }
  const close = () => document.getElementById('profileModal')?.classList.remove('open');
  function err(msg) { const el = document.getElementById('pfErr'); if (el) { el.textContent = msg; el.classList.add('visible'); } }

  function avatarStyle(photo) {
    return photo ? `background-image:url('${esc(photo)}');background-size:cover;background-position:center;color:transparent;` : '';
  }

  function open() {
    const r = room(); if (!r) return;
    const p = (typeof ccProfileOf === 'function' && ccProfileOf(r)) || { name: '', photo: '' };
    _blob = null; _removePhoto = false;
    const needPw = !localStorage.getItem('cc_pwh');
    const o = sheet();
    document.getElementById('profileModalBody').innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div class="msg-avatar" id="pfAv" style="width:64px;height:64px;font-size:18px;flex-shrink:0;${avatarStyle(p.photo)}">${esc(typeof roomInitials === 'function' ? roomInitials(r) : r.slice(0, 2))}</div>
        <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:0;">
          <button class="cc-btn cc-btn--secondary" type="button" id="pfPick" style="height:36px;">Choose photo</button>
          <button class="cc-btn cc-btn--ghost" type="button" id="pfDrop" style="height:30px;${p.photo ? '' : 'display:none;'}">Remove photo</button>
        </div>
        <input type="file" id="pfFile" accept="image/*" style="display:none"/>
      </div>
      <div class="cc-input-wrap cc-mb-12">
        <label class="cc-input-label" for="pfName">Name in the chat</label>
        <input class="cc-input" id="pfName" type="text" maxlength="${MAX_NAME}" placeholder="e.g. Kim" value="${esc(p.name)}" autocomplete="given-name"/>
      </div>
      <p class="cc-note cc-mb-16">Shown as “<span id="pfPreview">${esc(p.name ? p.name + ' · ' + r : r)}</span>” in the Lounge and Kitchen chat. Optional — only for your stay.</p>
      ${needPw ? `<div class="cc-input-wrap cc-mb-16">
        <label class="cc-input-label" for="pfPw">Your room password (once)</label>
        <input class="cc-input" id="pfPw" type="password" placeholder="Enter your password" autocomplete="current-password"/>
      </div>` : ''}
      <div class="login-error" id="pfErr" style="margin-bottom:12px;"></div>
      <button class="cc-btn cc-btn--primary" type="button" id="pfSave">Save</button>`;
    o.classList.add('open');

    const nameEl = document.getElementById('pfName');
    nameEl.addEventListener('input', () => {
      const n = nameEl.value.trim();
      document.getElementById('pfPreview').textContent = n ? n + ' · ' + r : r;
    });
    document.getElementById('pfPick').addEventListener('click', () => document.getElementById('pfFile').click());
    document.getElementById('pfFile').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        _blob = await shrink(f); _removePhoto = false;
        const av = document.getElementById('pfAv');
        av.style.cssText += avatarStyle(URL.createObjectURL(_blob));
        document.getElementById('pfDrop').style.display = '';
      } catch (x) { err('This photo could not be read. Please try another one.'); }
    });
    document.getElementById('pfDrop').addEventListener('click', () => {
      _blob = null; _removePhoto = true;
      const av = document.getElementById('pfAv');
      av.style.backgroundImage = ''; av.style.color = '';
      document.getElementById('pfDrop').style.display = 'none';
    });
    document.getElementById('pfSave').addEventListener('click', save);
  }

  async function save() {
    const r = room(); if (!r || !sbL) return;
    const btn = document.getElementById('pfSave');
    const name = (document.getElementById('pfName').value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    let pwh = localStorage.getItem('cc_pwh') || '';
    const typed = document.getElementById('pfPw')?.value || '';
    if (!pwh) {
      if (!typed) { err('Please enter your room password.'); return; }
      pwh = await ccHashPassword(typed);
    }
    btn.disabled = true; btn.textContent = '…';
    const reset = () => { btn.disabled = false; btn.textContent = 'Save'; };
    try {
      const cur = (typeof ccProfileOf === 'function' && ccProfileOf(r)) || { photo: '' };
      let photo = _removePhoto ? '' : (cur.photo || '');
      if (_blob) {
        const path = 'room-' + slug(r) + '.jpg';
        const up = await sbL.storage.from('avatars').upload(path, _blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' });
        if (up.error) throw up.error;
        photo = sbL.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
      }
      const { data, error } = await sbL.rpc('profile_save', { p_room: r, p_pwh: pwh, p_name: name, p_photo_url: photo || null });
      if (error) throw error;
      if (data === 'wrong_password') {
        localStorage.removeItem('cc_pwh');
        reset();
        if (!document.getElementById('pfPw')) open();
        err('Incorrect password.');
        return;
      }
      if (data !== 'ok') { reset(); err('Could not save. Please check the name and try again.'); return; }
      localStorage.setItem('cc_pwh', pwh);
      if (typeof ccProfilesLoad === 'function') await ccProfilesLoad(true);
      close();
    } catch (e) {
      reset();
      err('No connection — please try again.');
      console.warn('[profile]', e);
    }
  }

  window.ccOpenProfile = open;

  if (PREVIEW) { document.getElementById('profileMenuBtn')?.remove(); return; }
  document.getElementById('profileMenuBtn')?.addEventListener('click', () => {
    if (typeof toggleProfileMenu === 'function') toggleProfileMenu();
    open();
  });
})();
