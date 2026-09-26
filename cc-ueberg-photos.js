/* ─────────────────────────────────────────────────────────────
   cc-ueberg-photos.js — Fotos im Übergabeprotokoll (Einzug & Auszug)

   Used by the 3 Übergabe generators:
     Apartments  (rentals-tab-apartments.js + rentals-ueberg-pdf.js)          key 'apt-ub'
     Parking     (rentals-tab-parking.js    + rentals-parking-ueberg-pdf.js)  key 'pk-ub'
     Casa Castel (tab-rooms.js)                                               key 'room-ub'

   Form:  Auswahl "Ohne Fotos | Mit Fotos" (app standard cc-seg, cc-controls.js).
          Mit Fotos → camera opens; photos as upright thumbnails, 4 per row,
          first tile = "Foto" (take the next one). Tap a photo → larger view,
          Beschreibung, Foto löschen.
   PDF:   Ohne Fotos → PDF exactly as before.
          Mit Fotos  → extra A4 pages at the END: 6 photos per page (2 × 3),
          upright and landscape photos fit without cropping; number, date/time,
          Beschreibung under each photo.

   Photos live only in this open form (memory) — not stored in the app or
   database. Opening the Übergabe form again starts with no photos.
   ───────────────────────────────────────────────────────────── */

const _ccUb = {};                 // key → { on: bool, photos: [{ dataUrl, w, h, ts, caption }] }
const CC_UB_MAX = 24;             // 4 PDF pages of photos — keeps the PDF small enough to email
const CC_UB_PX  = 1400;           // long side of each photo in the PDF (sharp at 6 per A4 page)

function _ccUbEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── FORM BLOCK (called while the form HTML is built → starts empty) ── */
function ccUbPhotosHTML(key) {
  _ccUb[key] = { on: false, photos: [] };
  _ccUbStyles();
  return `
    <div class="ccub" id="ccub-${key}" data-ccub="${key}">
      <div class="rm-fields-title ccub-title" style="margin-top:6px;">Fotos<span class="ccub-n"></span></div>
      <div class="cc-seg ccub-seg" role="radiogroup" aria-label="Fotos im Protokoll">
        <button type="button" class="cc-seg__opt is-on" role="radio" aria-checked="true"  onclick="ccUbSet('${key}', false)">Ohne Fotos</button>
        <button type="button" class="cc-seg__opt"       role="radio" aria-checked="false" onclick="ccUbSet('${key}', true)">Mit Fotos</button>
      </div>
      <div class="ccub-body" style="display:none;">
        <div class="ccub-grid"></div>
        <div class="ccub-hint">Werden am Ende des PDFs angehängt, mit Datum und Uhrzeit.</div>
      </div>
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange="ccUbFiles('${key}', this)"/>
    </div>`;
}

/* Ohne Fotos | Mit Fotos */
function ccUbSet(key, on) {
  const st = _ccUb[key]; if (!st) return;
  const box = document.getElementById('ccub-' + key); if (!box) return;
  st.on = !!on;
  box.querySelectorAll('.ccub-seg .cc-seg__opt').forEach((b, i) => {
    const sel = (i === 1) === st.on;
    b.classList.toggle('is-on', sel);
    b.setAttribute('aria-checked', String(sel));
  });
  box.querySelector('.ccub-body').style.display = st.on ? '' : 'none';
  _ccUbRenderGrid(key);
  if (st.on && !st.photos.length) ccUbTakePhoto(key);    // "Mit Fotos" opens the camera straight away
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
  box?.classList.add('ccub--busy');
  for (const f of files) {
    if (st.photos.length >= CC_UB_MAX) { alert(`Maximal ${CC_UB_MAX} Fotos pro Protokoll.`); break; }
    try {
      const img = await _ccUbLoadImage(f);
      st.photos.push({ ...img, ts: Date.now(), caption: '' });
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

function _ccUbRenderGrid(key) {
  const st = _ccUb[key];
  const box = document.getElementById('ccub-' + key);
  if (!st || !box) return;
  const n = st.photos.length;
  const full = n >= CC_UB_MAX;
  box.querySelector('.ccub-grid').innerHTML =
    `<button type="button" class="ccub-add" onclick="ccUbTakePhoto('${key}')" ${full ? 'disabled' : ''} aria-label="Foto aufnehmen">
       <i class="ti ti-camera"></i><span>Foto</span>
     </button>` +
    st.photos.map((p, i) => `
      <div class="ccub-item">
        <button type="button" class="ccub-thumb" style="background-image:url('${p.dataUrl}')"
          onclick="ccUbOpenSheet('${key}', ${i})" aria-label="Foto ${i + 1}${p.caption ? ': ' + _ccUbEsc(p.caption) : ''} öffnen">
          <span class="ccub-no">${i + 1}</span>
          ${p.caption ? '<span class="ccub-cap-dot" aria-hidden="true"><i class="ti ti-align-left"></i></span>' : ''}
        </button>
        <button type="button" class="ccub-rm" aria-label="Foto ${i + 1} entfernen" onclick="ccUbRemove('${key}', ${i})"><i class="ti ti-x"></i></button>
      </div>`).join('');
  box.querySelector('.ccub-n').textContent = st.on && n ? ` · ${n}` : '';
}

/* ── PHOTO SHEET: larger view · Beschreibung · Foto löschen ── */
function ccUbOpenSheet(key, i) {
  const p = _ccUb[key]?.photos[i]; if (!p) return;
  ccUbSheetClose();
  const ov = document.createElement('div');
  ov.className = 'ccub-ov';
  ov.id = 'ccubSheet';
  ov.addEventListener('click', e => { if (e.target === ov) ccUbSheetClose(); });
  ov.innerHTML = `
    <div class="ccub-sheet" role="dialog" aria-modal="true" aria-label="Foto ${i + 1}">
      <div class="ccub-sheet__hdr">
        <span class="ccub-sheet__ttl">Foto ${i + 1}</span>
        <button type="button" class="ccub-sheet__x" onclick="ccUbSheetClose()" aria-label="Schließen"><i class="ti ti-x"></i></button>
      </div>
      <div class="ccub-sheet__img"><img src="${p.dataUrl}" alt="Foto ${i + 1}"/></div>
      <label class="ccub-sheet__lbl" for="ccubSheetCap">Beschreibung <span>(optional)</span></label>
      <input id="ccubSheetCap" class="ccub-sheet__cap" type="text" maxlength="120"
        placeholder="z. B. Küche, Kratzer Arbeitsplatte" value="${_ccUbEsc(p.caption)}"/>
      <div class="ccub-sheet__btns">
        <button type="button" class="ccub-sheet__del" onclick="ccUbRemove('${key}', ${i}); ccUbSheetClose(true)">Foto löschen</button>
        <button type="button" class="ccub-sheet__ok" onclick="ccUbSheetSave('${key}', ${i})">Fertig</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('.ccub-sheet__cap').addEventListener('keydown', e => { if (e.key === 'Enter') ccUbSheetSave(key, i); });
}

function ccUbSheetSave(key, i) {
  const p = _ccUb[key]?.photos[i];
  const v = document.getElementById('ccubSheetCap')?.value.trim() ?? '';
  if (p) p.caption = v;
  ccUbSheetClose();
  _ccUbRenderGrid(key);
}

function ccUbSheetClose() {
  document.getElementById('ccubSheet')?.remove();
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

/* ── PDF: photo pages at the end (jsPDF, A4 portrait, mm) ──────────────
   6 per page (2 columns × 3 rows). meta: { isEinzug, objekt, mieter }
   → returns the number of pages added                                   */
function ccUbAppendPhotos(pdf, key, meta = {}) {
  const st = _ccUb[key];
  if (!pdf || !st || !st.on || !st.photos.length) return 0;

  const W = 210, H = 297, M = 15, CW = W - 2 * M;
  const TOP = M + 22, BOTTOM = H - M - 4;                // content area under the header, above the footer
  const COLS = 2, ROWS = 3, GAP_X = 8, CAP = 15;
  const colW = (CW - GAP_X) / COLS;
  const rowH = (BOTTOM - TOP) / ROWS;
  const boxH = rowH - CAP;
  const PER  = COLS * ROWS;
  const two  = n => String(n).padStart(2, '0');
  const when = ts => {                                    // 26.09.2026 · 15:56 (German time)
    if (typeof ccFmtDate === 'function' && typeof ccParseDate === 'function' && typeof ccFmtTs === 'function')
      return ccFmtDate(ccParseDate(new Date(ts))) + ' · ' + ccFmtTs(ts).split(' · ')[1];
    const t = new Date(ts);
    return `${two(t.getDate())}.${two(t.getMonth() + 1)}.${t.getFullYear()} · ${two(t.getHours())}:${two(t.getMinutes())}`;
  };
  const sub = ['Übergabeprotokoll ' + (meta.isEinzug ? 'Einzug' : 'Auszug'), meta.objekt, meta.mieter]
    .filter(Boolean).join(' · ');
  const pages = Math.ceil(st.photos.length / PER);

  for (let pg = 0; pg < pages; pg++) {
    pdf.addPage('a4', 'portrait');
    pdf.setTextColor(30, 27, 24);
    pdf.setFont('helvetica', 'bold');   pdf.setFontSize(14);
    pdf.text('Fotodokumentation', M, M + 6);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(110, 102, 94);
    pdf.text(pdf.splitTextToSize(sub, CW)[0], M, M + 12);
    pdf.setDrawColor(200, 194, 186); pdf.setLineWidth(0.2);
    pdf.line(M, M + 16, W - M, M + 16);

    for (let s = 0; s < PER; s++) {
      const i = pg * PER + s;
      const p = st.photos[i];
      if (!p) break;
      const x = M + (s % COLS) * (colW + GAP_X);
      const y = TOP + Math.floor(s / COLS) * rowH;
      const r = Math.min(colW / p.w, boxH / p.h);        // fit, never crop (upright or landscape)
      const iw = p.w * r, ih = p.h * r;
      pdf.addImage(p.dataUrl, 'JPEG', x + (colW - iw) / 2, y + (boxH - ih), iw, ih);   // bottom-aligned: captions line up

      const ty = y + boxH + 4.2;
      pdf.setFont('helvetica', 'bold');   pdf.setFontSize(8); pdf.setTextColor(30, 27, 24);
      const label = `Foto ${i + 1}`;
      pdf.text(label, x, ty);
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(110, 102, 94);
      pdf.text(when(p.ts), x + pdf.getTextWidth(label) + 2.5, ty);
      const cap = String(p.caption || '').trim();
      if (cap) {
        pdf.setFontSize(7.5); pdf.setTextColor(30, 27, 24);
        pdf.text(pdf.splitTextToSize(cap, colW).slice(0, 2), x, ty + 3.8);
      }
    }

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(150, 142, 134);
    pdf.text(`Fotoanhang ${pg + 1} / ${pages}`, W - M, H - M + 4, { align: 'right' });
  }
  pdf.setTextColor(0, 0, 0);
  return pages;
}

/* ── STYLES (once) — colours from the app: beige tile = Übergabeprotokoll button ── */
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
/* photo sheet */
.ccub-ov { position:fixed; inset:0; z-index:700; background:rgba(30,27,24,.45); display:flex; align-items:flex-end; justify-content:center; }
.ccub-sheet { width:100%; max-width:520px; box-sizing:border-box; background:var(--cc-white); border-radius:16px 16px 0 0;
  padding:14px 16px max(16px, env(safe-area-inset-bottom, 16px)); animation:ccubUp .22s cubic-bezier(.32,.72,0,1); }
@keyframes ccubUp { from { transform:translateY(24px); opacity:0; } to { transform:none; opacity:1; } }
.ccub-sheet__hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.ccub-sheet__ttl { font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-taupe); }
.ccub-sheet__x { width:36px; height:36px; border-radius:50%; border:.5px solid var(--cc-rule); background:none; color:var(--cc-stone);
  display:flex; align-items:center; justify-content:center; font-size:15px; cursor:pointer; }
.ccub-sheet__img { background:var(--cc-surface); border-radius:var(--cc-r-md, 8px); display:flex; align-items:center; justify-content:center; overflow:hidden; }
.ccub-sheet__img img { display:block; max-width:100%; max-height:48vh; object-fit:contain; }
.ccub-sheet__lbl { display:block; margin:12px 0 6px; font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-taupe); }
.ccub-sheet__lbl span { font-weight:400; letter-spacing:0; text-transform:none; color:var(--cc-stone); }
.ccub-sheet__cap { width:100%; box-sizing:border-box; height:42px; padding:0 12px; font-family:inherit; font-size:16px;
  border:.5px solid var(--cc-rule); border-radius:var(--cc-r-md, 8px); background:var(--cc-surface); color:var(--cc-charcoal); }
.ccub-sheet__btns { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:14px; }
.ccub-sheet__del { height:42px; padding:0 4px; border:none; background:none; color:#A23B2A; font-family:inherit; font-size:13px; cursor:pointer; }
.ccub-sheet__ok { height:42px; padding:0 22px; border:none; border-radius:8px; background:var(--cc-ink); color:var(--cc-white);
  font-family:inherit; font-size:12px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; cursor:pointer; }
@media (prefers-reduced-motion: reduce) { .ccub-sheet { animation:none; } }
`;
  document.head.appendChild(s);
}
