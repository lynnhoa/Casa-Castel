/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — CHAT COMPOSE CARD (shared)
   chat-compose.js

   One compose bar for all four chats (Lounge + Kitchen, landlord +
   tenant, phone + iPad + laptop):

     ┌─────────────────────────────────────────────┐
     │ [photo preview]                             │
     │ Message…                     (grows, 5 ln)  │
     │ (+)                          (camera) (↑)   │
     └─────────────────────────────────────────────┘

   The card floats on the beige chat background — no white strip
   below it. Phone: return = new line, the ↑ button sends.
   Laptop: Enter sends, Shift+Enter = new line.

   ccCompose(mountEl, {
     placeholder: 'Message…',
     plus:   null | () => {}                 // one action (e.g. open a sheet)
           | [{ icon, label, sub, danger, mobileOnly, library, onClick }],
     plusMobileOnly: false,                  // hide + on iPad / laptop
     camera: null | 'live' | 'choice' | 'phone-only-live',
     onSend: async ({ text, photo }) => bool // photo = compressed JPEG blob
   })

   Depends on: nothing (utils.js esc() used when present)
   ───────────────────────────────────────────────────────────── */

const _CC_ICON = {
  plus:   '<path d="M12 5v14M5 12h14"/>',
  up:     '<path d="M12 19V5M6 11l6-6 6 6"/>',
  camera: '<path d="M5 7h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h6a1 1 0 0 1 1 1 2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/><circle cx="12" cy="13" r="3"/>',
  photo:  '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.5"/><path d="M4 17l5-5 4 4 2-2 5 5"/>',
  flag:   '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  list:   '<path d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01"/>',
  trash:  '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
  x:      '<path d="M18 6 6 18M6 6l12 12"/>',
  refresh:'<path d="M20 11A8 8 0 1 0 18 16.5M20 5v6h-6"/>',
};
function ccIcon(name, size) {
  return `<svg width="${size || 18}" height="${size || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${_CC_ICON[name] || ''}</svg>`;
}

/* Device helpers */
function ccIsPhoneLayout() { return window.innerWidth <= 700; }
function ccIsLaptop() {           // mouse/trackpad and no touch screen → no live camera possible
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches && !('ontouchstart' in window); }
  catch (e) { return false; }
}
function ccIsTouch() {
  try { return window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window); }
  catch (e) { return false; }
}

/* Chat photo URLs — only files from our own storage bucket are shown as images */
function ccPhotoUrl(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  return /^https:\/\/[^"'<>\s]+\/storage\/v1\/object\/public\/kitchen-proofs\/[^"'<>]+$/.test(s) ? s : '';
}
function ccPhotoPathFromUrl(u) {
  const i = (u || '').indexOf('kitchen-proofs/');
  return i === -1 ? '' : decodeURIComponent(u.slice(i + 'kitchen-proofs/'.length).split('?')[0]);
}

/* Shrink a camera photo before upload (max 1280 px, JPEG 80 %) */
function ccCompressImage(file, maxPx = 1280, quality = 0.8) {
  return new Promise(resolve => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) { if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; } else { w = Math.round(w * maxPx / h); h = maxPx; } }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ── IN-APP CAMERA (live photo inside the app — no iPhone Retake / Use Photo screen) ──
   Used by the kitchen proof steps (camera inside the photo frame) and the
   kitchen chat camera button (full-screen). Falls back to the iPhone camera
   when camera access is not possible or was refused.                       */
let _ccCamDenied = false;
function ccCamSupported() {
  return !_ccCamDenied && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !ccIsLaptop();
}
function ccCamAttach(videoEl, stream) {
  videoEl.setAttribute('playsinline', ''); videoEl.setAttribute('webkit-playsinline', '');
  videoEl.muted = true; videoEl.autoplay = true;
  if (videoEl.srcObject !== stream) videoEl.srcObject = stream;
  const p = videoEl.play(); if (p && p.catch) p.catch(() => {});
}
async function ccCamOpen(videoEl) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
    ccCamAttach(videoEl, stream);
    return stream;
  } catch (e) { _ccCamDenied = true; throw e; }    // this session: iPhone camera from now on
}
function ccCamStop(stream) { try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {} }
/* Takes exactly what the frame shows (centre crop to the frame's ratio), max 1280 px JPEG */
function ccCamSnap(videoEl, ratio, maxPx = 1280, quality = 0.82) {
  return new Promise(resolve => {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw || !vh) { resolve(null); return; }
    const r = ratio || (videoEl.clientWidth && videoEl.clientHeight ? videoEl.clientWidth / videoEl.clientHeight : vw / vh);
    let sw = vw, sh = vh;
    if (vw / vh > r) sw = Math.round(vh * r); else sh = Math.round(vw / r);
    const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
    const k = Math.min(1, maxPx / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    c.getContext('2d').drawImage(videoEl, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.toBlob(b => resolve(b), 'image/jpeg', quality);
  });
}
function _ccCamCss() {
  if (document.getElementById('cc-cam-css')) return;
  const st = document.createElement('style'); st.id = 'cc-cam-css';
  st.textContent = `
.cc-camsheet { position:fixed; inset:0; z-index:9500; background:var(--cc-ink,#1E1B18); display:flex; flex-direction:column; }
.cc-camsheet video { flex:1; width:100%; min-height:0; object-fit:cover; display:block; }
.cc-camsheet__bar { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:16px 22px calc(16px + env(safe-area-inset-bottom, 0px)); background:var(--cc-bg,#F5F2ED); }
.cc-camsheet__cancel { min-width:72px; height:40px; padding:0 14px; border-radius:20px; border:.5px solid var(--cc-rule,#E0DAD0);
  background:var(--cc-white,#FDFCFA); color:var(--cc-charcoal,#3A3530); font:inherit; font-size:13px; }
.cc-camsheet__shutter { width:66px; height:66px; border-radius:50%; border:3px solid var(--cc-ink,#1E1B18);
  background:var(--cc-white,#FDFCFA); padding:4px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.cc-camsheet__shutter span { display:block; width:100%; height:100%; border-radius:50%; background:var(--cc-ink,#1E1B18); }
.cc-camsheet__shutter:active span { transform:scale(.9); }
.cc-camsheet__sp { min-width:72px; }`;
  document.head.appendChild(st);
}
/* Full-screen in-app camera → photo blob · null = cancelled · undefined = camera not possible */
function ccCameraSheet() {
  _ccCamCss();
  return new Promise(async resolve => {
    const ov = document.createElement('div'); ov.className = 'cc-camsheet';
    ov.innerHTML = `<video playsinline muted autoplay></video>
      <div class="cc-camsheet__bar">
        <button type="button" class="cc-camsheet__cancel">Cancel</button>
        <button type="button" class="cc-camsheet__shutter" aria-label="Take photo"><span></span></button>
        <span class="cc-camsheet__sp"></span>
      </div>`;
    document.body.appendChild(ov);
    const video = ov.querySelector('video');
    let stream = null, closed = false;
    const done = v => { if (closed) return; closed = true; ccCamStop(stream); ov.remove(); resolve(v); };
    ov.querySelector('.cc-camsheet__cancel').addEventListener('click', () => done(null));
    try { stream = await ccCamOpen(video); } catch (e) { done(undefined); return; }
    if (closed) { ccCamStop(stream); return; }
    ov.querySelector('.cc-camsheet__shutter').addEventListener('click', async () => done(await ccCamSnap(video)));
  });
}
/* Camera refused → offer the iPhone camera (the tap on the button opens it) */
async function ccCamFallbackAsk() {
  if (typeof ccDialog !== 'function') return true;
  const v = await ccDialog({ icon: 'ti-camera', title: 'Camera access is off',
    body: 'Allow the camera for this app in the iPhone settings — or use the iPhone camera now.',
    actions: [{ label: 'Cancel', value: false }, { label: 'iPhone camera', value: true, primary: true }] });
  return v === true;
}

/* Upload a chat photo into the shared proof bucket, returns its public URL */
async function ccUploadPhoto(blob, path) {
  if (typeof sbL === 'undefined' || !sbL) throw new Error('offline');
  const { error } = await sbL.storage.from('kitchen-proofs').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return sbL.storage.from('kitchen-proofs').getPublicUrl(path).data.publicUrl;
}

/* ── THE COMPONENT ──────────────────────────────────────── */
function ccCompose(mountEl, opts) {
  if (!mountEl) return null;
  const o = Object.assign({ placeholder: 'Message…', plus: null, plusMobileOnly: false, camera: null }, opts || {});
  const laptop    = ccIsLaptop();
  const camMode   = o.camera === 'phone-only-live' ? (laptop ? null : 'live') : o.camera;
  const camBlocked = o.camera === 'phone-only-live' && laptop;
  const escH = s => (typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])));

  mountEl.classList.add('cc-dock');
  mountEl.innerHTML = `
    <div class="cc-card">
      <div class="cc-att" hidden>
        <div class="cc-thumb">
          <img alt="Photo to send"/>
          <span class="cc-thumb-bar"><span></span></span>
          <button type="button" class="cc-thumb-x" aria-label="Remove photo">${ccIcon('x', 11)}</button>
        </div>
      </div>
      <textarea class="cc-field" rows="1" placeholder="${escH(o.placeholder)}" enterkeyhint="${ccIsTouch() ? 'enter' : 'send'}" aria-label="${escH(o.placeholder)}"></textarea>
      <p class="cc-err" hidden>Couldn't send — tap ↑ to try again.</p>
      <div class="cc-tools">
        ${o.plus ? `<button type="button" class="cc-btn cc-plus${o.plusMobileOnly ? ' cc-mobile-only' : ''}" aria-label="More actions" aria-haspopup="true">${ccIcon('plus')}</button>` : ''}
        ${camBlocked ? '<span class="cc-note">Photos: please use your phone</span>' : ''}
        <span class="cc-spacer"></span>
        ${camMode ? `<button type="button" class="cc-btn cc-cam" aria-label="${camMode === 'live' ? 'Take photo' : 'Add photo'}">${ccIcon('camera')}</button>` : ''}
        <button type="button" class="cc-send" aria-label="Send" disabled>${ccIcon('up')}</button>
      </div>
    </div>
    <input type="file" class="cc-file-cam" accept="image/*" hidden ${camMode === 'live' ? 'capture="environment"' : ''}/>
    <input type="file" class="cc-file-lib" accept="image/*" hidden/>
    ${Array.isArray(o.plus) ? `<div class="cc-menu-scrim" hidden></div><div class="cc-menu" role="menu" hidden>${o.plus.map((it, i) => `
      ${it.danger && i > 0 ? '<div class="cc-menu-sep"></div>' : ''}
      <button type="button" role="menuitem" class="cc-mi${it.danger ? ' cc-mi--danger' : ''}${it.mobileOnly ? ' cc-mobile-only' : ''}" data-i="${i}">
        <span class="cc-mi-ico">${ccIcon(it.icon || 'plus', 16)}</span>
        <span class="cc-mi-txt"><span class="cc-mi-t">${escH(it.label)}</span>${it.sub ? `<span class="cc-mi-s">${escH(it.sub)}</span>` : ''}</span>
      </button>`).join('')}</div>` : ''}`;

  const $ = s => mountEl.querySelector(s);
  const field = $('.cc-field'), send = $('.cc-send'), card = $('.cc-card');
  const att = $('.cc-att'), thumbImg = $('.cc-thumb img'), err = $('.cc-err');
  let photo = null, photoUrl = null, busy = false;

  const refresh = () => {
    send.disabled = busy || (!field.value.trim() && !photo);
    send.classList.toggle('cc-send--on', !send.disabled);
  };
  const grow = () => {
    field.style.height = 'auto';
    field.style.height = Math.min(field.scrollHeight, 112) + 'px';   // up to ~5 lines, then scroll
    field.style.overflowY = field.scrollHeight > 112 ? 'auto' : 'hidden';
  };
  const setPhoto = blob => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photo = blob; photoUrl = blob ? URL.createObjectURL(blob) : null;
    att.hidden = !blob; if (blob) thumbImg.src = photoUrl;
    err.hidden = true; card.classList.remove('cc-card--err');
    refresh();
  };
  const pick = input => new Promise(res => {
    input.value = '';
    input.onchange = async () => { const f = input.files[0]; res(f ? await ccCompressImage(f) : null); };
    input.click();
  });

  field.addEventListener('input', () => { grow(); refresh(); err.hidden = true; card.classList.remove('cc-card--err'); });
  field.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (ccIsTouch()) return;                 // phone / iPad: return = new line
    e.preventDefault(); doSend();
  });
  if (typeof wireComposeBlur === 'function') wireComposeBlur(field);

  $('.cc-cam')?.addEventListener('click', async () => {
    // Live camera: in-app (one tap on the shutter, no iPhone Retake / Use Photo screen)
    if (camMode === 'live' && ccCamSupported()) {
      const b = await ccCameraSheet();
      if (b) { setPhoto(b); return; }
      if (b === null) return;                                  // cancelled
      if (!(await ccCamFallbackAsk())) return;                 // camera refused → iPhone camera?
    }
    const b = await pick($('.cc-file-cam')); if (b) setPhoto(b);
  });
  $('.cc-thumb-x').addEventListener('click', () => setPhoto(null));
  send.addEventListener('click', () => doSend());

  // + : single action, or a small menu above the card
  const plusBtn = $('.cc-plus');
  const menu = $('.cc-menu'), scrim = $('.cc-menu-scrim');
  const closeMenu = () => { if (menu) { menu.hidden = true; scrim.hidden = true; plusBtn?.setAttribute('aria-expanded', 'false'); } };
  plusBtn?.addEventListener('click', () => {
    if (typeof o.plus === 'function') { o.plus(); return; }
    const open = menu.hidden;
    menu.hidden = !open; scrim.hidden = !open;
    plusBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  scrim?.addEventListener('click', closeMenu);
  menu?.querySelectorAll('.cc-mi').forEach(btn => btn.addEventListener('click', async () => {
    const it = o.plus[+btn.dataset.i]; closeMenu();
    if (it.library) { const b = await pick($('.cc-file-lib')); if (b) setPhoto(b); return; }
    it.onClick?.();
  }));

  async function doSend() {
    if (busy) return;
    const text = field.value.trim();
    if (!text && !photo) return;
    busy = true; card.classList.add('cc-card--busy'); refresh();
    let ok = false;
    try { ok = (await o.onSend({ text, photo })) !== false; } catch (e) { console.warn('[compose] send failed', e); ok = false; }
    busy = false; card.classList.remove('cc-card--busy');
    if (ok) { field.value = ''; grow(); setPhoto(null); }
    else    { err.hidden = false; card.classList.add('cc-card--err'); }
    refresh();
  }

  grow(); refresh();
  return { field, focus: () => field.focus(), clear: () => { field.value = ''; grow(); setPhoto(null); } };
}

/* Small ↺ icon button for chat headers (replaces the "↺ Refresh" text link) */
function ccRefreshBtnHtml(onclick, id) {
  return `<button type="button" class="cc-hdr-refresh"${id ? ` id="${id}"` : ''}${onclick ? ` onclick="${onclick}"` : ''} aria-label="Refresh" title="Refresh">${ccIcon('refresh', 14)}</button>`;
}

/* Reload a chat whenever the app comes back to the front (at most every 20 s) */
function ccOnResume(fn) {
  let last = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now(); if (now - last < 20000) return; last = now;
    try { fn(); } catch (e) {}
  });
}

/* Open a chat photo full screen (landlord app has its own photo modal) */
function ccOpenPhoto(url) {
  if (typeof openPhotoModal === 'function' && document.getElementById('k-photo-modal')) { openPhotoModal(url, 'Photo'); return; }
  if (typeof _kTenOpenPhoto === 'function') { _kTenOpenPhoto(url, 'Photo'); return; }
  window.open(url, '_blank');
}
