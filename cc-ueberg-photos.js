/* ─────────────────────────────────────────────────────────────
   cc-ueberg-photos.js — Fotos im Übergabeprotokoll (Einzug & Auszug)

   Used by the 3 Übergabe generators:
     Apartments  (rentals-tab-apartments.js + rentals-ueberg-pdf.js)          key 'apt-ub' (also Gewerbe)
     Parking     (rentals-tab-parking.js    + rentals-parking-ueberg-pdf.js)  key 'pk-ub'
     Casa Castel (tab-rooms.js)                                               key 'room-ub'
   and by Maintenance (maintenance.js): the Berichte (the camera, the large view, _ccUbExifTime,
   _ccUbLoadImage and the photo pages — maint-schaden-pdf.js passes its own subtitle as meta.sub)
   and the receipts (the camera, the large view and the tiles of this form, Nov 2026).

   Form:  Auswahl "Ohne Fotos | Mit Fotos" (app standard cc-seg, cc-controls.js).
          "Kamera"    = the camera inside the app. It stays open: one tap = one photo, straight
                        into the protocol (strip, n / 24). × on a picture of the strip takes that
                        photo off at once. "Fertig" closes it, every photo stays.
          "Mediathek" = the phone's own menu (Fotomediathek, several at once).
          No live camera possible (no https, older phone): one "Foto" tile with the phone's menu.
          "Mit Fotos" with no photos yet opens the camera at once (else the phone's menu).
          Camera blocked: the same screen, each tap opens the iPhone camera for 1 photo.
          Upright thumbnails, 4 per row, each with its × (small copies — the view and the PDF use the big photo).
   View:  tap a photo → "Foto 3 von 12": swipe or ‹ › (← → on a keyboard), the Beschreibung of
          the photo shown (kept on every way out), Foto löschen (stays open on the next photo).
   Kept:  the photos stay with that protocol (unit + Einzug/Auszug) while the app is open —
          ✕ or a tap outside only closes the form — until Approve or Cancel (cc-contract-flow.js)
          or "Discard" of the unfinished form (ccUbForget). Memory only: a restart starts empty.
   Check: every photo change (photo, Beschreibung, Ohne/Mit) counts like typing — the hidden
          field .ccub-sig is part of the Draft PDF check (ccfSig): Approve needs a new Draft PDF.
   PDF:   Ohne Fotos → PDF exactly as before.
          Mit Fotos  → extra A4 pages at the END, built as pages of the SAME
          document (its own beige header, footer, fonts, running page number):
          6 photos per page (2 × 3) in equal frames; number, date/time when the
          photo was TAKEN (from the photo itself or the camera's shutter;
          "(hinzugefügt)" if unknown), Beschreibung.
   ───────────────────────────────────────────────────────────── */

const _ccUb = {};                 // key → the protocol open in that block: { id, on, photos: [{ id, dataUrl, thumb, w, h, ts, when, taken, caption }] }
const _ccUbKept = {};             // 'key|unit:Einzug' → the same object, kept until Approve / Cancel (memory only)
const CC_UB_MAX = 24;             // 4 PDF pages of photos — keeps the PDF small enough to email
const CC_UB_PX  = 1400;           // long side of each photo in the PDF (sharp at 6 per A4 page)
const CC_UB_THUMB = 240;          // long side of the small copy in the grid and the camera strip
let _ccUbSeq = 0;                 // a number per photo, only for the change check

function _ccUbEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── FORM BLOCK (called while the form HTML is built) ──
   id = the protocol (unit + Einzug/Auszug): opened again, it shows its photos again */
function ccUbPhotosHTML(key, id) {
  _ccUbStyles();
  const kept = id ? _ccUbKept[key + '|' + id] : null;
  const st = _ccUb[key] = kept || { id: id || '', on: false, photos: [] };
  if (id) _ccUbKept[key + '|' + id] = st;
  const n = st.photos.length;
  return `
    <div class="ccub" id="ccub-${key}" data-ccub="${key}">
      <div class="rm-fields-title ccub-title" style="margin-top:6px;">Fotos<span class="ccub-n">${st.on && n ? ` · ${n}` : ''}</span></div>
      <div class="cc-seg ccub-seg" role="radiogroup" aria-label="Fotos im Protokoll">
        <button type="button" class="cc-seg__opt${st.on ? '' : ' is-on'}" role="radio" aria-checked="${!st.on}" onclick="ccUbSet('${key}', false)">Ohne Fotos</button>
        <button type="button" class="cc-seg__opt${st.on ? ' is-on' : ''}" role="radio" aria-checked="${st.on}" onclick="ccUbSet('${key}', true)">Mit Fotos</button>
      </div>
      <div class="ccub-body"${st.on ? '' : ' style="display:none;"'}>
        <div class="ccub-grid">${_ccUbGridHTML(key)}</div>
        <div class="ccub-hint">Kamera oder Fotomediathek. Werden am Ende des PDFs angehängt, mit Aufnahmedatum.</div>
      </div>
      <input type="file" accept="image/*" multiple style="display:none" onchange="ccUbFiles('${key}', this)"/>
      <input type="hidden" class="ccub-sig" value="${_ccUbEsc(_ccUbSig(st))}"/>
    </div>`;
}

/* What the PDF takes from this block, in one line — no id, so a draft never fills it in */
function _ccUbSig(st) {
  return JSON.stringify([st.on ? 1 : 0, st.photos.map(p => [p.id, p.caption || ''])]);
}

/* Approve, Cancel or "Discard": the photos of that protocol go (no id = the protocol open in this block) */
function ccUbForget(key, id) {
  const st = _ccUb[key];
  delete _ccUbKept[key + '|' + (id === undefined ? (st && st.id) || '' : id)];
}

/* Ohne Fotos | Mit Fotos */
function ccUbSet(key, on) {
  const st = _ccUb[key]; if (!st || !document.getElementById('ccub-' + key)) return;
  st.on = !!on;
  _ccUbRenderGrid(key);
  if (st.on && !st.photos.length) {                       // "Mit Fotos" opens the camera straight away (else the photo menu)
    if (ccUbCanLive()) ccUbCamOpen(key); else ccUbTakePhoto(key);
  }
}

function ccUbTakePhoto(key) {
  const st = _ccUb[key]; if (!st) return;
  if (st.photos.length >= CC_UB_MAX) { alert(`Maximal ${CC_UB_MAX} Fotos pro Protokoll.`); return; }
  document.querySelector(`#ccub-${key} input[type=file]`)?.click();
}

async function ccUbFiles(key, input) {
  const st = _ccUb[key];
  const files = [...(input.files || [])];
  input.value = '';                                       // the same photo can be taken again
  if (!st || !files.length) return;
  const box = document.getElementById('ccub-' + key);
  const room = CC_UB_MAX - st.photos.length;
  if (files.length > room) alert(room > 0
    ? `Maximal ${CC_UB_MAX} Fotos pro Protokoll – die ersten ${room} wurden übernommen.`
    : `Maximal ${CC_UB_MAX} Fotos pro Protokoll.`);
  box?.classList.add('ccub--busy');
  for (const f of files.slice(0, Math.max(0, room))) {
    try {
      const taken = await _ccUbExifTime(f);               // when the photo was taken (null if unknown)
      const img = await _ccUbLoadImage(f);
      st.photos.push({ id: ++_ccUbSeq, ...img, thumb: await _ccUbThumb(img.dataUrl).catch(() => ''),
        ts: taken ? taken.ts : Date.now(), when: taken ? taken.text : '', taken: !!taken, caption: '' });
    } catch (e) {
      console.error('[Übergabe Fotos]', e);
      alert('Das Foto konnte nicht gelesen werden. Bitte erneut aufnehmen.');
    }
  }
  box?.classList.remove('ccub--busy');
  _ccUbRenderGrid(key);
}

function ccUbRemove(key, i) {
  const st = _ccUb[key]; if (!st) return;
  st.photos.splice(i, 1);
  _ccUbRenderGrid(key);
}
/* × on a thumbnail of the form: at once — the next photo moves under the finger, so a quick double tap removes one */
let _ccUbRmAt = 0;
function ccUbRemoveTap(key, i) {
  if (Date.now() - _ccUbRmAt < 450) return;
  _ccUbRmAt = Date.now();
  ccUbRemove(key, i);
}

/* Tiles: Kamera (stays open) + Mediathek — or the one "Foto" tile where no live camera is possible */
function _ccUbGridHTML(key) {
  const st = _ccUb[key];
  const off = st.photos.length >= CC_UB_MAX ? ' disabled' : '';
  const tile = (fn, icon, label, aria) => `<button type="button" class="ccub-add" onclick="${fn}('${key}')"${off} aria-label="${aria}">
       <i class="ti ${icon}"></i><span>${label}</span>
     </button>`;
  return (ccUbCanLive()
    ? tile('ccUbCamOpen', 'ti-camera', 'Kamera', 'Kamera öffnen') + tile('ccUbTakePhoto', 'ti-photo', 'Mediathek', 'Fotos aus der Mediathek')
    : tile('ccUbTakePhoto', 'ti-camera', 'Foto', 'Foto hinzufügen')) +
    st.photos.map((p, i) => `
      <div class="ccub-item">
        <button type="button" class="ccub-thumb" style="background-image:url('${p.thumb || p.dataUrl}')"
          onclick="ccUbOpenSheet('${key}', ${i})" aria-label="Foto ${i + 1}${p.caption ? ': ' + _ccUbEsc(p.caption) : ''} öffnen">
          <span class="ccub-no">${i + 1}</span>
          ${p.caption ? '<span class="ccub-cap-dot" aria-hidden="true"><i class="ti ti-align-left"></i></span>' : ''}
        </button>
        <button type="button" class="ccub-rm" aria-label="Foto ${i + 1} entfernen" onclick="ccUbRemoveTap('${key}', ${i})"><i class="ti ti-x"></i></button>
      </div>`).join('');
}

/* The block shows the protocol's state; a change is announced to the form (input event) */
function _ccUbRenderGrid(key) {
  const st = _ccUb[key];
  const box = document.getElementById('ccub-' + key);
  if (!st || !box) return;
  box.querySelectorAll('.ccub-seg .cc-seg__opt').forEach((b, i) => {
    const sel = (i === 1) === st.on;
    b.classList.toggle('is-on', sel);
    b.setAttribute('aria-checked', String(sel));
  });
  box.querySelector('.ccub-body').style.display = st.on ? '' : 'none';
  box.querySelector('.ccub-grid').innerHTML = _ccUbGridHTML(key);
  box.querySelector('.ccub-n').textContent = st.on && st.photos.length ? ` · ${st.photos.length}` : '';
  const sig = box.querySelector('.ccub-sig'), v = _ccUbSig(st);
  if (sig && sig.value !== v) {
    sig.value = v;
    sig.dispatchEvent(new Event('input', { bubbles: true }));   // like typing: the Draft PDF is outdated, Approve waits for a new one
  }
}

/* ── CAMERA THAT STAYS OPEN (Übergabe + Maintenance) ─────────
   Live picture · shutter (short white flash) · strip of the photos · counter · one exit "Fertig".
   No Cancel: a bad photo goes with the × on its picture in the strip — at once, or later in the grid or the large view
   (the Bericht in Maintenance stores each photo at once: no × there, it is deleted in its list or view, which ask).
   Escape, the app going to the background and back, or the form closing never lose a photo.
   o = { en, max, px, list() → strip pictures, onShot(canvas, ts), onFile(file, ts), del(i), alive(), onClose() } → true when it opened
   px: long side of a shot (receipts take more, the text must stay readable) · del: an × on each picture of the strip */
const _ccUbCam = { o: null, el: null, stream: null, busy: false, gen: 0, timer: 0, rmAt: 0 };

function ccUbCanLive() {
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function ccUbCamera(o) {
  if (_ccUbCam.o) return false;
  _ccUbStyles();
  const L = o.en ? { cam: 'Camera', strip: 'Photos taken', shut: 'Take photo', done: 'Done' }
                 : { cam: 'Kamera', strip: 'Fotos', shut: 'Foto aufnehmen', done: 'Fertig' };
  const el = document.createElement('div');
  el.className = 'ccub-cam'; el.id = 'ccubCam';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', L.cam);
  el.innerHTML = `
    <div class="ccub-cam__view"><video playsinline webkit-playsinline muted autoplay></video><div class="ccub-cam__flash"></div></div>
    <div class="ccub-cam__strip" aria-label="${L.strip}"></div>
    <div class="ccub-cam__bar">
      <span class="ccub-cam__n" aria-live="polite"></span>
      <button type="button" class="ccub-cam__shut" data-cam="snap" aria-label="${L.shut}"><span></span></button>
      <button type="button" class="ccub-cam__done" data-cam="done">${L.done}</button>
    </div>
    <input type="file" accept="image/*" capture="environment" hidden/>`;
  document.body.appendChild(el);
  Object.assign(_ccUbCam, { o, el, busy: false });
  el.addEventListener('pointerdown', _ccUbTapAt, true);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-cam]'); if (!b) return;
    if (b.dataset.cam === 'snap') _ccUbCamSnap();
    else if (b.dataset.cam === 'rm') _ccUbCamRm(Number(b.dataset.i));
    else if (b.dataset.cam === 'done') ccUbCamClose();
  });
  el.querySelector('input[type=file]').addEventListener('change', e => _ccUbCamFile(e.target));
  window.addEventListener('keydown', _ccUbCamKey, true);
  _ccUbCam.timer = setInterval(() => { if (_ccUbCam.o && !_ccUbCam.o.alive()) ccUbCamClose(); }, 1000);   // the form was closed or built again
  _ccUbCamDraw();
  _ccUbCamStart();                                        // every opening tries the live camera again
  return true;
}

/* Übergabe: each photo goes into the protocol the moment it is taken */
function ccUbCamOpen(key) {
  const st = _ccUb[key], box = document.getElementById('ccub-' + key);
  if (!st || !box) return;
  const ov = box.closest('.rm-overlay');
  ccUbCamera({ max: CC_UB_MAX,
    list: () => st.photos.map(p => p.thumb || p.dataUrl),
    alive: () => box.isConnected && _ccUb[key] === st && (!ov || ov.classList.contains('open')),
    onShot: async (c, ts) => {                            // the moment of the shutter = Aufnahmedatum
      const dataUrl = c.toDataURL('image/jpeg', 0.82);
      st.photos.push({ id: ++_ccUbSeq, dataUrl, thumb: await _ccUbThumb(c), w: c.width, h: c.height, ts, when: '', taken: true, caption: '' });
      _ccUbRenderGrid(key);
    },
    onFile: async (f, ts) => {                            // camera blocked: one photo from the iPhone camera
      if (st.photos.length >= CC_UB_MAX) return;
      const taken = await _ccUbExifTime(f);
      const img = await _ccUbLoadImage(f);
      st.photos.push({ id: ++_ccUbSeq, ...img, thumb: await _ccUbThumb(img.dataUrl).catch(() => ''),
        ts: taken ? taken.ts : ts, when: taken ? taken.text : '', taken: true, caption: '' });
      _ccUbRenderGrid(key);
    },
    del: i => ccUbRemove(key, i),                         // × on the strip: the photo leaves the protocol
    onClose: () => _ccUbRenderGrid(key),
  });
}

async function _ccUbCamStart() {
  const el = _ccUbCam.el; if (!el || _ccUbCam.stream || el.classList.contains('ccub-cam--phone')) return;
  if (!ccUbCanLive()) { _ccUbCamPhone(); return; }
  const gen = ++_ccUbCam.gen;
  try {
    const hi = (_ccUbCam.o && _ccUbCam.o.px || 0) > CC_UB_PX;   // receipts: more pixels, the text stays readable
    const s = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: hi ? 2560 : 1920 }, height: { ideal: hi ? 1920 : 1440 } } });
    if (gen !== _ccUbCam.gen || !_ccUbCam.o || document.visibilityState === 'hidden') { s.getTracks().forEach(t => t.stop()); return; }
    _ccUbCam.stream = s;
    const v = el.querySelector('video');
    v.muted = true; v.srcObject = s;
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  } catch (e) {
    if (gen === _ccUbCam.gen && _ccUbCam.o) _ccUbCamPhone();
  }
}
function _ccUbCamStop() {
  _ccUbCam.gen++;                                         // a camera still starting is stopped when it arrives
  const s = _ccUbCam.stream; _ccUbCam.stream = null;
  if (s) s.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
  const v = _ccUbCam.el && _ccUbCam.el.querySelector('video');
  if (v) v.srcObject = null;
}
/* No live camera: the same screen, the shutter opens the iPhone camera for one photo */
function _ccUbCamPhone() {
  const el = _ccUbCam.el; if (!el || el.classList.contains('ccub-cam--phone')) return;
  el.classList.add('ccub-cam--phone');
  el.querySelector('.ccub-cam__view').innerHTML = `<p class="ccub-cam__alt">${_ccUbCam.o.en
    ? 'Camera not available – each tap on the shutter opens the iPhone camera for 1 photo.'
    : 'Kamera nicht verfügbar – jeder Tipp auf den Auslöser öffnet die iPhone-Kamera für 1 Foto.'}</p>`;
}

/* Shutter: the whole frame (what you see), long side CC_UB_PX, JPEG 82 % — one photo at a time */
async function _ccUbCamSnap() {
  const o = _ccUbCam.o, el = _ccUbCam.el;
  if (!o || !el || _ccUbCam.busy) return;
  if (o.max && o.list().length >= o.max) return;          // shutter greyed at 24
  if (!o.alive()) { ccUbCamClose(); return; }
  if (el.classList.contains('ccub-cam--phone')) { el.querySelector('input[type=file]').click(); return; }
  const v = el.querySelector('video');
  if (!_ccUbCam.stream || !v || !v.videoWidth) return;    // still starting
  _ccUbCam.busy = true;
  const ts = Date.now();
  const c = document.createElement('canvas');
  try {
    const k = Math.min(1, (o.px || CC_UB_PX) / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const fl = el.querySelector('.ccub-cam__flash');
    if (fl) { fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 70); }
    await o.onShot(c, ts);
  } catch (e) { console.error('[Kamera]', e); }
  finally { c.width = c.height = 0; _ccUbCam.busy = false; }   // iPhone: the canvas memory back at once
  _ccUbCamDraw();
}

async function _ccUbCamFile(input) {
  const f = input.files && input.files[0]; input.value = '';
  const o = _ccUbCam.o;
  if (!f || !o) return;
  _ccUbCam.busy = true;
  try { await o.onFile(f, Date.now()); } catch (e) { console.error('[Kamera]', e); }
  finally { _ccUbCam.busy = false; }
  _ccUbCamDraw();
}

function _ccUbCamDraw(keep) {
  const o = _ccUbCam.o, el = _ccUbCam.el; if (!o || !el) return;
  const pics = o.list(), n = pics.length;
  const strip = el.querySelector('.ccub-cam__strip'), x0 = strip.scrollLeft;
  const rm = o.en ? 'Remove photo' : 'Foto entfernen';
  strip.innerHTML = pics.map((src, i) => `<div class="ccub-cam__th" style="background-image:url('${src}')"><b>${i + 1}</b>${o.del
    ? `<button type="button" class="ccub-cam__rm" data-cam="rm" data-i="${i}" aria-label="${rm} ${i + 1}"><i class="ti ti-x"></i></button>` : ''}</div>`).join('');
  strip.scrollLeft = keep ? x0 : strip.scrollWidth;       // the newest is in view (after an × the strip stays where it was)
  el.querySelector('.ccub-cam__n').textContent = o.max ? `${n} / ${o.max}` : String(n);
  el.querySelector('.ccub-cam__shut').disabled = !!(o.max && n >= o.max);
}

/* × on a picture of the strip: that photo goes at once (a quick double tap removes one) */
function _ccUbCamRm(i) {
  const o = _ccUbCam.o; if (!o || !o.del || !(i >= 0) || Date.now() - _ccUbCam.rmAt < 450) return;
  _ccUbCam.rmAt = Date.now();
  try { o.del(i); } catch (e) { console.error('[Kamera]', e); }
  _ccUbCamDraw(true);
}

/* "Fertig" / Escape / the form went: camera off, every photo stays */
function ccUbCamClose() {
  const o = _ccUbCam.o; if (!o) return;
  _ccUbCam.o = null;
  _ccUbCamStop();
  clearInterval(_ccUbCam.timer);
  window.removeEventListener('keydown', _ccUbCamKey, true);
  if (_ccUbCam.el) _ccUbCam.el.remove();
  _ccUbCam.el = null;
  _ccUbGhost();
  try { if (o.onClose) o.onClose(); } catch (e) { console.error('[Kamera]', e); }
}
function _ccUbCamKey(e) {
  if (e.key !== 'Escape' || !_ccUbCam.o) return;
  e.preventDefault(); e.stopPropagation();                // only the camera closes, not the form below
  ccUbCamClose();
}
/* App to the background (call, message): camera off — back in front: camera on again
   (an iPhone web app can show a black picture after a return if the old stream is kept) */
document.addEventListener('visibilitychange', () => {
  if (!_ccUbCam.o) return;
  if (document.visibilityState === 'hidden') _ccUbCamStop();
  else if (!_ccUbCam.o.alive()) ccUbCamClose();
  else _ccUbCamStart();
});
window.addEventListener('pagehide', () => { if (_ccUbCam.o) _ccUbCamStop(); });
window.addEventListener('pageshow', () => { if (_ccUbCam.o && document.visibilityState === 'visible') _ccUbCamStart(); });

/* ── LARGE VIEW: swipe or ‹ › · delete (Übergabe + Maintenance) ──
   o = { en, n(), src(i), id(i)?, title(i)?, cap: { get(i), set(i, v) } | null, del(i, id), ask }
   cap: the Beschreibung of the photo shown (Übergabe) · ask: delete asks in its row first (Maintenance)
   id: the view stays on the photo shown when the list changes under it (Maintenance: an upload sorted in)
   title: own header (Maintenance: the photo's number in the report, as in the list) */
const _ccUbV = { o: null, i: 0, id: null, ids: [], busy: false, ask: false, drag: false, stale: false, delAt: 0 };

const _CCUB_CHEV = d => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}"/></svg>`;
const _ccUbVL = en => en
  ? { close: 'Close', prev: 'Previous photo', next: 'Next photo', del: 'Delete photo', done: 'Done',
      ask: 'Delete this photo?', yes: 'Delete', no: 'Keep', title: (i, n) => n > 1 ? `Photo ${i} of ${n}` : `Photo ${i}` }
  : { close: 'Schließen', prev: 'Vorheriges Foto', next: 'Nächstes Foto', del: 'Foto löschen', done: 'Fertig',
      title: (i, n) => n > 1 ? `Foto ${i} von ${n}` : `Foto ${i}` };

function ccUbView(o, i) {
  if (!o || !(i >= 0 && i < o.n())) return;
  ccUbSheetClose();
  _ccUbStyles();
  Object.assign(_ccUbV, { o, i, id: null, ids: [], busy: false, ask: false, drag: false, stale: false, delAt: 0 });
  const L = _ccUbVL(o.en);
  const ov = document.createElement('div');
  ov.className = 'ccub-ov';
  ov.id = 'ccubSheet';
  ov.addEventListener('pointerdown', _ccUbTapAt, true);
  ov.addEventListener('click', e => { if (e.target === ov) ccUbSheetClose(); });
  ov.innerHTML = `
    <div class="ccub-sheet" role="dialog" aria-modal="true">
      <div class="ccub-sheet__hdr">
        <span class="ccub-sheet__ttl" aria-live="polite"></span>
        <button type="button" class="ccub-sheet__x" onclick="ccUbSheetClose()" aria-label="${L.close}"><i class="ti ti-x"></i></button>
      </div>
      <div class="ccub-sheet__img ccub-v">
        <div class="ccub-v__track">
          <div class="ccub-v__slide"><img alt=""/></div><div class="ccub-v__slide"><img alt=""/></div><div class="ccub-v__slide"><img alt=""/></div>
        </div>
        <button type="button" class="ccub-v__nav ccub-v__nav--prev" onclick="ccUbSheetStep(-1)" aria-label="${L.prev}">${_CCUB_CHEV(-1)}</button>
        <button type="button" class="ccub-v__nav ccub-v__nav--next" onclick="ccUbSheetStep(1)" aria-label="${L.next}">${_CCUB_CHEV(1)}</button>
      </div>
      ${o.cap ? `<label class="ccub-sheet__lbl" for="ccubSheetCap">Beschreibung <span>(optional)</span></label>
      <input id="ccubSheetCap" class="ccub-sheet__cap" type="text" maxlength="120" placeholder="z. B. Küche, Kratzer Arbeitsplatte"/>` : ''}
      <div class="ccub-sheet__btns"></div>
    </div>`;
  document.body.appendChild(ov);
  const cap = ov.querySelector('.ccub-sheet__cap');
  if (cap) cap.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (_ccUbV.i < _ccUbV.o.n() - 1) ccUbSheetStep(1); else ccUbSheetClose();   // keyboard "Weiter" → next photo, keyboard stays
  });
  _ccUbSwipe(ov.querySelector('.ccub-v'));
  window.addEventListener('keydown', _ccUbViewKey, true);
  _ccUbFill();
}

/* Übergabe: tap on a photo in the grid */
function ccUbOpenSheet(key, i) {
  const st = _ccUb[key]; if (!st) return;
  ccUbView({
    n: () => st.photos.length,
    src: j => st.photos[j] ? st.photos[j].dataUrl : '',
    cap: { get: j => (st.photos[j] && st.photos[j].caption) || '',
           set: (j, v) => { if (st.photos[j]) { st.photos[j].caption = v; _ccUbRenderGrid(key); } } },
    del: j => ccUbRemove(key, j),                         // at once, as before
  }, i);
}

/* Fill again (Maintenance: once the photo links are ready, an upload arrived) — not under a moving finger:
   then right after it. The photo shown stays on screen, also when the list is sorted anew. */
function ccUbViewRefresh() {
  if (!_ccUbV.o) return;
  if (_ccUbV.busy || _ccUbV.drag) { _ccUbV.stale = true; return; }
  _ccUbSync();
  _ccUbFill();
}
/* where a photo is in the list now (-1: gone) */
function _ccUbIdx(id) {
  const o = _ccUbV.o; if (!o || !o.id || id == null) return -1;
  for (let j = 0, n = o.n(); j < n; j++) if (o.id(j) === id) return j;
  return -1;
}
/* the list changed: back to the photo shown — if it is gone, the one now in its place (a question asked on it goes) */
function _ccUbSync() {
  const o = _ccUbV.o; if (!o || !o.id || _ccUbV.id == null) return;
  const j = _ccUbIdx(_ccUbV.id);
  if (j >= 0) _ccUbV.i = j; else _ccUbV.ask = false;
}

/* the 3 slides = previous · this · next photo; header, arrows, Beschreibung and buttons follow */
function _ccUbFill() {
  const ov = document.getElementById('ccubSheet'), o = _ccUbV.o; if (!ov || !o) return;
  const n = o.n();
  if (!n) { ccUbSheetClose(true); return; }               // no photo left
  if (_ccUbV.i >= n) _ccUbV.i = n - 1;
  const i = _ccUbV.i, L = _ccUbVL(o.en);
  _ccUbV.stale = false;
  _ccUbV.id = o.id ? o.id(i) : null;                      // the photo on screen and its neighbours
  _ccUbV.ids = o.id ? [i - 1, i, i + 1].map(j => (j >= 0 && j < n ? o.id(j) : null)) : [];
  const track = ov.querySelector('.ccub-v__track');
  [...track.children].forEach((s, k) => {
    const j = i - 1 + k, img = s.firstElementChild, u = j >= 0 && j < n ? o.src(j) : '';
    if (u) { if (img.getAttribute('src') !== u) img.src = u; } else img.removeAttribute('src');
    s.style.visibility = j >= 0 && j < n ? '' : 'hidden';
  });
  track.style.transition = 'none';
  track.style.transform = 'translate3d(-100%,0,0)';
  const label = o.title ? o.title(i) : L.title(i + 1, n);
  ov.querySelector('.ccub-sheet__ttl').textContent = label;
  ov.querySelector('.ccub-sheet').setAttribute('aria-label', label);
  ov.querySelector('.ccub-v__nav--prev').hidden = i === 0;
  ov.querySelector('.ccub-v__nav--next').hidden = i >= n - 1;
  const cap = ov.querySelector('.ccub-sheet__cap');
  if (cap) {
    cap.value = o.cap.get(i);                             // same field → the keyboard stays open
    cap.setAttribute('enterkeyhint', i < n - 1 ? 'next' : 'done');
  }
  ov.querySelector('.ccub-sheet__btns').innerHTML = _ccUbV.ask
    ? `<span class="ccub-sheet__ask">${L.ask}</span><span class="ccub-sheet__askb">
         <button type="button" class="ccub-sheet__yes" onclick="ccUbSheetDelete()">${L.yes}</button>
         <button type="button" class="ccub-sheet__no" onclick="ccUbSheetKeep()">${L.no}</button></span>`
    : `<button type="button" class="ccub-sheet__del" onclick="ccUbSheetDelete()">${L.del}</button>
       <button type="button" class="ccub-sheet__ok" onclick="ccUbSheetClose()">${L.done}</button>`;
}

/* keep what is typed in the Beschreibung of the photo on screen */
function _ccUbKeepCap() {
  const o = _ccUbV.o, inp = document.getElementById('ccubSheetCap');
  if (!o || !o.cap || !inp) return;
  const i = o.id ? _ccUbIdx(_ccUbV.id) : _ccUbV.i;
  if (!(i >= 0 && i < o.n())) return;
  const v = inp.value.trim();
  if (v !== o.cap.get(i)) o.cap.set(i, v);
}

/* ‹ › and swipe: one photo back / on (stops at the first / last — no jump round) */
function ccUbSheetStep(d) {
  const ov = document.getElementById('ccubSheet'), o = _ccUbV.o; if (!ov || !o || _ccUbV.busy) return;
  if (_ccUbV.stale) { _ccUbKeepCap(); _ccUbSync(); _ccUbFill(); if (!_ccUbV.o) return; }   // the list changed under the finger
  const to = _ccUbV.i + d, toId = o.id ? _ccUbV.ids[d > 0 ? 2 : 0] : null;   // the photo that slides in
  const track = ov.querySelector('.ccub-v__track');
  if (to < 0 || to >= o.n()) {                            // the end: spring back
    track.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
    track.style.transform = 'translate3d(-100%,0,0)';
    return;
  }
  _ccUbKeepCap();
  _ccUbV.busy = true;
  _ccUbV.ask = false;                                     // a question belongs to the photo it was asked on
  const done = () => {
    if (!_ccUbV.busy) return;
    _ccUbV.busy = false;
    track.removeEventListener('transitionend', done);
    // move the slide that is now on screen into the middle (no reload, no flash)
    if (d > 0) track.appendChild(track.firstElementChild); else track.insertBefore(track.lastElementChild, track.firstElementChild);
    _ccUbV.i = to;
    const j = _ccUbIdx(toId); if (j >= 0) _ccUbV.i = j;   // the list changed during the slide
    _ccUbFill();
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  track.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)';
  track.style.transform = `translate3d(${d > 0 ? -200 : 0}%,0,0)`;
  track.addEventListener('transitionend', done);
  setTimeout(done, 320);                                  // in case transitionend does not come
}

/* the photo follows the finger; a horizontal swipe of 50 px (or a quick flick) = next / previous */
function _ccUbSwipe(box) {
  const track = box.querySelector('.ccub-v__track');
  let x0 = 0, y0 = 0, t0 = 0, dx = 0, dir = null;
  box.addEventListener('touchstart', e => {
    if (_ccUbV.busy || e.touches.length > 1) { dir = 'none'; return; }   // also a swipe that starts on ‹ ›
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); dx = 0; dir = null;
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (dir === 'none' || dir === 'y' || !_ccUbV.o) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!dir) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; dir = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; if (dir === 'y') return; }
    e.preventDefault();                                   // only now: the gesture is clearly sideways
    _ccUbV.drag = true;
    const end = (mx > 0 && _ccUbV.i === 0) || (mx < 0 && _ccUbV.i >= _ccUbV.o.n() - 1);
    dx = end ? mx / 3 : mx;                               // at the first / last photo it only gives a little
    track.style.transition = 'none';
    track.style.transform = `translate3d(calc(-100% + ${dx}px),0,0)`;
  }, { passive: false });
  const up = () => {
    _ccUbV.drag = false;
    if (dir !== 'x') { dir = null; if (_ccUbV.stale) ccUbViewRefresh(); return; }
    dir = null;
    const fast = Math.abs(dx) > 20 && Date.now() - t0 < 250;
    if (Math.abs(dx) > 50 || fast) ccUbSheetStep(dx < 0 ? 1 : -1);
    else if (_ccUbV.stale) ccUbViewRefresh();
    else { track.style.transition = 'transform .2s ease-out'; track.style.transform = 'translate3d(-100%,0,0)'; }
  };
  box.addEventListener('touchend', up);
  box.addEventListener('touchcancel', up);
}

/* Delete: this photo goes, the view stays open on the next one (the one before after the last; closes when none is left).
   Maintenance asks in the button row first (Delete / Keep), as in its list. A quick double tap deletes one photo. */
function ccUbSheetDelete() {
  const o = _ccUbV.o; if (!o || _ccUbV.busy || Date.now() - _ccUbV.delAt < 450) return;
  if (o.ask && !_ccUbV.ask) { _ccUbV.ask = true; _ccUbFill(); return; }
  _ccUbV.ask = false;
  _ccUbV.delAt = Date.now();
  o.del(_ccUbV.i, _ccUbV.id);                             // the photo on screen
  if (!_ccUbV.o) return;
  const n = o.n();
  if (!n) { ccUbSheetClose(true); return; }
  _ccUbSync();
  _ccUbV.i = Math.min(_ccUbV.i, n - 1);
  _ccUbFill();
}
function ccUbSheetKeep() { _ccUbV.ask = false; _ccUbFill(); }

/* ✕, a tap outside, Fertig, Escape: closes — the Beschreibung typed is kept */
function ccUbSheetClose(skipKeep) {
  if (!skipKeep) _ccUbKeepCap();
  const ov = document.getElementById('ccubSheet');
  if (ov) { ov.remove(); _ccUbGhost(); }
  window.removeEventListener('keydown', _ccUbViewKey, true);
  Object.assign(_ccUbV, { o: null, id: null, ids: [], busy: false, ask: false, drag: false, stale: false });
}
/* The camera or the view just closed by a tap: a quick second tap on the same spot (a double tap on "Foto löschen"
   or "Fertig") must not reach the form under it — its Cancel, Draft PDF or ✕ sit right there. Taps elsewhere go through. */
let _ccUbTap = null;
const _ccUbTapAt = e => { _ccUbTap = { x: e.clientX, y: e.clientY, t: Date.now() }; };
function _ccUbGhost() {
  const p = _ccUbTap; _ccUbTap = null;
  if (!p || Date.now() - p.t > 1000) return;              // closed without a tap (Escape, the form went)
  const t = Date.now(), off = () => window.removeEventListener('click', eat, true), eat = e => {
    if (Date.now() - t < 350 && Math.abs(e.clientX - p.x) < 44 && Math.abs(e.clientY - p.y) < 44) { e.preventDefault(); e.stopImmediatePropagation(); }
    off();                                                // only the one tap right after
  };
  window.addEventListener('click', eat, true);
  setTimeout(off, 350);
}
function _ccUbViewKey(e) {
  if (!_ccUbV.o) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ccUbSheetClose(); return; }   // only the view closes
  if (e.target && e.target.id === 'ccubSheetCap') return;   // arrows move the cursor in the Beschreibung
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.stopPropagation(); ccUbSheetStep(e.key === 'ArrowRight' ? 1 : -1); }
}

/* Camera photo → JPEG, long side max. CC_UB_PX */
function _ccUbLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(1, CC_UB_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * s));
        const h = Math.max(1, Math.round(img.naturalHeight * s));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);                   // browsers apply the camera's rotation
        resolve({ dataUrl: c.toDataURL('image/jpeg', 0.82), w, h });
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

/* Small copy for the grid and the camera strip (CC_UB_THUMB px, JPEG 70 %) — the view and the PDF keep the big photo.
   src = a canvas or an image address (data: / blob:) */
async function _ccUbThumb(src) {
  if (typeof src === 'string') src = await new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => ok(img); img.onerror = () => no(new Error('thumb load failed'));
    img.src = src;
  });
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  const k = Math.min(1, CC_UB_THUMB / Math.max(w0, h0, 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.7);
  c.width = c.height = 0;
  return url;
}

/* Capture date from the photo's own data (EXIF DateTimeOriginal / DateTime) → { ts, text } or null */
async function _ccUbExifTime(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 12 || v.getUint16(0) !== 0xFFD8) return null;          // JPEG only
    let off = 2;
    while (off + 10 < v.byteLength) {
      const marker = v.getUint16(off), len = v.getUint16(off + 2);
      if ((marker & 0xFF00) !== 0xFF00) break;
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) {        // "Exif"
        const t = off + 10, le = v.getUint16(t) === 0x4949;
        const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
        const ifd = o => { const n = u16(o), tags = {}; for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; tags[u16(e)] = { count: u32(e + 4), at: e + 8 }; } return tags; };
        const str = tag => { if (!tag) return null; const o = tag.count > 4 ? u32(tag.at) : tag.at; let r = ''; for (let i = 0; i < tag.count - 1; i++) r += String.fromCharCode(v.getUint8(t + o + i)); return r; };
        const ifd0 = ifd(u32(4));
        let dt = null;
        if (ifd0[0x8769]) { const sub = ifd(u32(ifd0[0x8769].at)); dt = str(sub[0x9003]) || str(sub[0x9004]); }
        dt = dt || str(ifd0[0x0132]);
        const m = dt && dt.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (!m) return null;
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        if (isNaN(d)) return null;
        // the camera's own wall-clock time, printed as it is (no time-zone conversion)
        return { ts: d.getTime(), text: `${m[3]}.${m[2]}.${m[1]} · ${m[4]}:${m[5]}` };
      }
      off += 2 + len;
    }
  } catch (e) { /* no date → the time it was added is used */ }
  return null;
}

function _ccUbWhen(ts) {                                  // 26.09.2026 · 17:55 (German time)
  const two = n => String(n).padStart(2, '0');
  if (typeof ccFmtDate === 'function' && typeof ccParseDate === 'function' && typeof ccFmtTs === 'function')
    return ccFmtDate(ccParseDate(new Date(ts))) + ' · ' + ccFmtTs(ts).split(' · ')[1];
  const t = new Date(ts);
  return `${two(t.getDate())}.${two(t.getMonth() + 1)}.${t.getFullYear()} · ${two(t.getHours())}:${two(t.getMinutes())}`;
}

/* ── PDF: photo pages as pages of the SAME document ───────────────────
   Called with the rendered protocol (container of .pdf-page) BEFORE it is
   turned into a PDF. Each new page is a copy of page 1 (its beige header and
   footer) with its content replaced by up to 6 photos. Page numbers continue
   (pdf-open.js renumbers). Returns the number of pages added.            */
async function ccUbAddPhotoPages(key, container, meta = {}) {
  const st = _ccUb[key];
  if (!container || !st || !st.on || !st.photos.length) return 0;
  const pages = container.querySelectorAll('.pdf-page');
  const first = pages[0]; if (!first) return 0;
  let last = pages[pages.length - 1];
  const E = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const PER = 6, GAP_X = 22, GAP_Y = 18, FRAME_H = 206;
  const cw = (first.querySelector(':scope > .content')?.clientWidth) || 634;
  const frameW = Math.floor((cw - GAP_X) / 2);
  const total = st.photos.length;
  const sub = (meta.sub ? [meta.sub] : ['Übergabeprotokoll ' + (meta.isEinzug ? 'Einzug' : 'Auszug'), meta.objekt, meta.mieter])
    .concat(total === 1 ? '1 Foto' : total + ' Fotos').filter(Boolean).map(E).join(' · ');   // meta.sub: own subtitle (Schadensbericht)
  const imgs = [];
  for (let start = 0; start < total; start += PER) {
    const pg = first.cloneNode(true);
    let content = pg.querySelector(':scope > .content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'content';
      content.style.cssText = 'position:absolute;top:144px;left:80px;right:80px;bottom:90px;overflow:hidden;';
      pg.appendChild(content);
    }
    const cells = st.photos.slice(start, start + PER).map((p, j) => {
      const i = start + j;
      const r = Math.min(frameW / p.w, FRAME_H / p.h);
      const iw = Math.round(p.w * r), ih = Math.round(p.h * r);
      const cap = String(p.caption || '').trim();
      return `<div style="display:flex;flex-direction:column;min-width:0">
        <div style="height:${FRAME_H}px;background:#f7f4f0;border:0.5px solid #e8e2d8;border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden">
          <img src="${p.dataUrl}" width="${iw}" height="${ih}" style="display:block;width:${iw}px;height:${ih}px" alt=""/>
        </div>
        <div style="display:flex;gap:8px;align-items:baseline;margin-top:7px">
          <span style="font-family:'Lato',sans-serif;font-size:7.5px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#4a4540">Foto ${i + 1}</span>
          <span style="font-family:'Lato',sans-serif;font-size:9px;font-weight:400;color:#6b645c">${p.when || _ccUbWhen(p.ts)}${p.taken === false ? ' (hinzugefügt)' : ''}</span>
        </div>
        ${cap ? `<div style="font-family:'Lato',sans-serif;font-size:10px;font-weight:400;color:#2b2722;margin-top:3px;line-height:1.35">${E(cap)}</div>` : ''}
      </div>`;
    }).join('');
    content.innerHTML = `
      <div class="doc-title" style="font-family:'Playfair Display',serif;font-size:21px;font-weight:400;color:#1a1a1a;line-height:1.15;margin-bottom:4px">Fotodokumentation</div>
      <div class="doc-subtitle" style="font-family:'Lato',sans-serif;font-size:9.5px;font-weight:400;color:#6b645c;margin-bottom:22px">${sub}</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:${GAP_X}px;row-gap:${GAP_Y}px">${cells}</div>`;
    last.after(pg);
    last = pg;
    imgs.push(...pg.querySelectorAll('img'));
  }
  // wait for the photos to be ready — at most 4 s each (Safari's decode() can hang with several big photos)
  await Promise.all(imgs.map(img => Promise.race([(img.decode ? img.decode() : Promise.resolve()).catch(() => {}), new Promise(r => setTimeout(r, 4000))])));
  return Math.ceil(total / PER);
}

/* ── (previous version, no longer used) photo pages drawn directly with jsPDF ──
   6 per page (2 columns × 3 rows). meta: { isEinzug, objekt, mieter }
   → returns the number of pages added                                   */


/* ── STYLES (once) — colours from the app: beige tile = Übergabeprotokoll button; the camera as the receipt camera ── */
function _ccUbStyles() {
  if (document.getElementById('ccub-styles')) return;
  const s = document.createElement('style');
  s.id = 'ccub-styles';
  s.textContent = `
.ccub { margin-top:4px; margin-bottom:12px; }
.ccub-n { color:var(--cc-taupe); }
.ccub-body { margin-top:10px; }
.ccub-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px; }
.ccub-add, .ccub-thumb { aspect-ratio:3/4; width:100%; border-radius:var(--cc-r-md, 8px); box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
.ccub-add { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:0;
  background:#F5EFE6; color:#5C3D1E; border:.5px solid #D4B896; font-family:inherit; font-size:11px; font-weight:500; cursor:pointer; }
.ccub-add i { font-size:20px; color:#B8956A; }
.ccub-add:active { opacity:.75; }
.ccub-add:disabled { opacity:.4; cursor:default; }
.ccub--busy .ccub-add { opacity:.5; pointer-events:none; }
.ccub-item { position:relative; min-width:0; }
.ccub-thumb { display:block; position:relative; padding:0; border:.5px solid var(--cc-rule); background:var(--cc-surface) center/cover no-repeat; cursor:pointer; }
.ccub-no { position:absolute; left:4px; top:4px; min-width:16px; height:16px; padding:0 4px; box-sizing:border-box; border-radius:8px;
  background:rgba(30,27,24,.72); color:#fff; font-size:9px; font-weight:600; display:flex; align-items:center; justify-content:center; }
.ccub-cap-dot { position:absolute; left:4px; bottom:4px; width:18px; height:18px; border-radius:50%; background:rgba(253,252,250,.92);
  color:var(--cc-ink); display:flex; align-items:center; justify-content:center; font-size:11px; }
.ccub-rm { position:absolute; right:0; top:0; width:32px; height:32px; padding:0; border:none; background:none; cursor:pointer;
  display:flex; align-items:flex-start; justify-content:flex-end; -webkit-tap-highlight-color:transparent; }
.ccub-rm i { margin:4px 4px 0 0; width:18px; height:18px; border-radius:50%; background:rgba(30,27,24,.72); color:#fff;
  font-size:11px; display:flex; align-items:center; justify-content:center; }
.ccub-hint { font-size:10.5px; color:var(--cc-stone); margin-top:8px; line-height:1.4; }
.ccub-thumb:focus-visible, .ccub-add:focus-visible, .ccub-rm:focus-visible { outline:2px solid var(--cc-ink); outline-offset:2px; }
/* large view (sheet) */
.ccub-ov { position:fixed; inset:0; z-index:700; background:rgba(30,27,24,.45); display:flex; align-items:flex-end; justify-content:center; }
.ccub-sheet { width:100%; max-width:520px; box-sizing:border-box; background:var(--cc-white); border-radius:16px 16px 0 0;
  padding:14px 16px max(16px, env(safe-area-inset-bottom, 16px)); animation:ccubUp .22s cubic-bezier(.32,.72,0,1);
  max-height:100%; overflow-y:auto; overscroll-behavior:contain; }   /* phone held sideways: the sheet scrolls, ✕ stays reachable */
@keyframes ccubUp { from { transform:translateY(24px); opacity:0; } to { transform:none; opacity:1; } }
.ccub-sheet__hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.ccub-sheet__ttl { font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-taupe); }
.ccub-sheet__x { width:36px; height:36px; border-radius:50%; border:.5px solid var(--cc-rule); background:none; color:var(--cc-stone);
  display:flex; align-items:center; justify-content:center; font-size:15px; cursor:pointer; }
.ccub-sheet__img { background:var(--cc-surface); border-radius:var(--cc-r-md, 8px); overflow:hidden; }
.ccub-v { position:relative; height:min(48vh, 440px); touch-action:pan-y; }
.ccub-v__track { display:flex; height:100%; will-change:transform; transform:translate3d(-100%,0,0); }
.ccub-v__slide { flex:0 0 100%; height:100%; display:flex; align-items:center; justify-content:center; }
.ccub-v__slide img { display:block; max-width:100%; max-height:100%; object-fit:contain; -webkit-user-drag:none; user-select:none; }
.ccub-v__nav { position:absolute; top:50%; margin-top:-20px; width:40px; height:40px; padding:0; border:none; border-radius:50%;
  background:rgba(30,27,24,.45); color:#FDFCFA; display:flex; align-items:center; justify-content:center; cursor:pointer;
  -webkit-tap-highlight-color:transparent; }
.ccub-v__nav[hidden] { display:none; }
.ccub-v__nav:active { background:rgba(30,27,24,.65); }
.ccub-v__nav--prev { left:8px; }
.ccub-v__nav--next { right:8px; }
.ccub-v__nav:focus-visible { outline:2px solid var(--cc-ink); outline-offset:2px; }
.ccub-sheet__lbl { display:block; margin:12px 0 6px; font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-taupe); }
.ccub-sheet__lbl span { font-weight:400; letter-spacing:0; text-transform:none; color:var(--cc-stone); }
.ccub-sheet__cap { width:100%; box-sizing:border-box; height:42px; padding:0 12px; font-family:inherit; font-size:16px;
  border:.5px solid var(--cc-rule); border-radius:var(--cc-r-md, 8px); background:var(--cc-surface); color:var(--cc-charcoal); }
.ccub-sheet__btns { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:14px; min-height:42px; }
.ccub-sheet__del { height:42px; padding:0 4px; border:none; background:none; color:#A23B2A; font-family:inherit; font-size:13px; cursor:pointer; }
.ccub-sheet__ok { height:42px; padding:0 22px; border:none; border-radius:8px; background:var(--cc-ink); color:var(--cc-white);
  font-family:inherit; font-size:12px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; cursor:pointer; }
.ccub-sheet__ask { color:#A0533A; font-size:13px; }
.ccub-sheet__askb { display:flex; gap:8px; }
.ccub-sheet__yes, .ccub-sheet__no { height:36px; padding:0 16px; border-radius:18px; font-family:inherit; font-size:12.5px; font-weight:500; cursor:pointer; }
.ccub-sheet__yes { border:0; background:#A0533A; color:#fff; }
.ccub-sheet__no { border:.5px solid var(--cc-rule); background:var(--cc-white); color:var(--cc-ink); }
/* camera */
.ccub-cam { position:fixed; inset:0; z-index:900; display:flex; flex-direction:column; background:#14110F; color:#fff;
  padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px); }
.ccub-cam__view { flex:1; min-height:0; position:relative; display:flex; align-items:center; justify-content:center; }
.ccub-cam__view video { width:100%; height:100%; object-fit:contain; display:block; }
.ccub-cam__alt { margin:0; padding:24px; text-align:center; font-size:14px; line-height:1.5; color:rgba(255,255,255,.8); }
.ccub-cam__flash { position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; transition:opacity .25s; }
.ccub-cam__flash.on { opacity:.7; transition:none; }
.ccub-cam__strip { display:flex; gap:8px; overflow-x:auto; padding:10px 16px 0; min-height:84px; box-sizing:border-box; -webkit-overflow-scrolling:touch; }
.ccub-cam__th { position:relative; flex:0 0 auto; width:56px; height:74px; border-radius:6px; overflow:hidden; background:#2A2521 center/cover no-repeat; }
.ccub-cam__th b { position:absolute; left:4px; bottom:3px; font-size:10px; font-weight:600; text-shadow:0 1px 2px #000; }
.ccub-cam__rm { position:absolute; top:0; right:0; width:32px; height:32px; padding:0; border:none; background:none; color:#fff; cursor:pointer;
  display:flex; align-items:flex-start; justify-content:flex-end; -webkit-tap-highlight-color:transparent; }
.ccub-cam__rm i { margin:3px 3px 0 0; width:20px; height:20px; border-radius:50%; background:rgba(0,0,0,.62); display:flex; align-items:center; justify-content:center; font-size:12px; }
.ccub-cam__bar { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; padding:12px 20px calc(16px + env(safe-area-inset-bottom, 0px)); }
.ccub-cam__n { justify-self:start; font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; color:rgba(255,255,255,.85); }
.ccub-cam__shut { width:74px; height:74px; border-radius:50%; border:4px solid #fff; background:none; padding:5px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.ccub-cam__shut span { display:block; width:100%; height:100%; border-radius:50%; background:#fff; }
.ccub-cam__shut:active span { transform:scale(.9); }
.ccub-cam__shut:disabled { opacity:.35; cursor:default; }
.ccub-cam__done { justify-self:end; height:48px; min-width:104px; padding:0 18px; border-radius:24px; border:none; background:#fff; color:#14110F;
  font:inherit; font-size:15px; font-weight:600; cursor:pointer; }
.ccub-cam__shut:focus-visible, .ccub-cam__done:focus-visible { outline:2px solid #fff; outline-offset:3px; }
@media (prefers-reduced-motion: reduce) { .ccub-sheet { animation:none; } .ccub-cam__flash { display:none; } }
`;
  document.head.appendChild(s);
}
