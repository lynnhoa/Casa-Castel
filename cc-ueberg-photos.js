/* ─────────────────────────────────────────────────────────────
   cc-ueberg-photos.js — Fotos im Übergabeprotokoll (Einzug & Auszug)

   Used by the 3 Übergabe generators:
     Apartments  (rentals-tab-apartments.js + rentals-ueberg-pdf.js)          key 'apt-ub'
     Parking     (rentals-tab-parking.js    + rentals-parking-ueberg-pdf.js)  key 'pk-ub'
     Casa Castel (tab-rooms.js)                                               key 'room-ub'

   Toggle off (default) → the PDF stays exactly as before.
   Toggle on  → "Foto aufnehmen" opens the camera; the photos are added as
                extra A4 pages at the END of the PDF (2 photos per page,
                number, date/time, optional caption).

   Photos live only in this open form (memory). They are NOT stored in the
   app or database. Opening the Übergabe form again starts with no photos.
   ───────────────────────────────────────────────────────────── */

const _ccUb = {};                 // key → { on: bool, photos: [{ dataUrl, w, h, ts, caption }] }
const CC_UB_MAX = 24;             // enough for a full walk-through, keeps the PDF small enough to send

/* ── FORM BLOCK (called while the form HTML is built → starts empty) ── */
function ccUbPhotosHTML(key) {
  _ccUb[key] = { on: false, photos: [] };
  _ccUbStyles();
  return `
    <div class="ccub" id="ccub-${key}" data-ccub="${key}">
      <div class="rm-fields-title" style="margin-top:6px;">Fotos</div>
      <div class="ccub-row">
        <span class="ccub-lbl">Fotos zum Protokoll hinzufügen</span>
        <button type="button" class="ccub-toggle" role="switch" aria-checked="false"
          aria-label="Fotos zum Protokoll hinzufügen" onclick="ccUbToggle('${key}')">
          <span class="ccub-toggle__knob"></span>
        </button>
      </div>
      <div class="ccub-body" style="display:none;">
        <div class="ccub-actions">
          <button type="button" class="ccub-cam" onclick="ccUbTakePhoto('${key}')">
            <i class="ti ti-camera"></i> Foto aufnehmen
          </button>
          <span class="ccub-count"></span>
        </div>
        <input type="file" accept="image/*" capture="environment" style="display:none"
          onchange="ccUbFiles('${key}', this)"/>
        <div class="ccub-grid"></div>
        <div class="ccub-hint">Die Fotos werden am Ende des PDFs angehängt – mit Datum und Uhrzeit.</div>
      </div>
    </div>`;
}

function ccUbToggle(key) {
  const st = _ccUb[key]; if (!st) return;
  st.on = !st.on;
  const box = document.getElementById('ccub-' + key); if (!box) return;
  box.querySelector('.ccub-toggle').setAttribute('aria-checked', String(st.on));
  box.querySelector('.ccub-body').style.display = st.on ? '' : 'none';
  if (st.on && !st.photos.length) ccUbTakePhoto(key);     // switching on opens the camera straight away
}

function ccUbTakePhoto(key) {
  const st = _ccUb[key];
  if (!st) return;
  if (st.photos.length >= CC_UB_MAX) { alert(`Maximal ${CC_UB_MAX} Fotos pro Protokoll.`); return; }
  document.querySelector(`#ccub-${key} input[type=file]`)?.click();
}

async function ccUbFiles(key, input) {
  const st = _ccUb[key];
  const files = [...(input.files || [])];
  input.value = '';                                       // same photo can be taken again
  if (!st || !files.length) return;
  const box = document.getElementById('ccub-' + key);
  const cnt = box?.querySelector('.ccub-count');
  if (cnt) cnt.textContent = 'Foto wird verarbeitet…';
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
  _ccUbRenderGrid(key);
}

function ccUbRemove(key, i) {
  const st = _ccUb[key]; if (!st) return;
  st.photos.splice(i, 1);
  _ccUbRenderGrid(key);
}

function ccUbCaption(key, i, el) {
  const p = _ccUb[key]?.photos[i];
  if (p) p.caption = el.value;
}

function _ccUbRenderGrid(key) {
  const st = _ccUb[key];
  const box = document.getElementById('ccub-' + key);
  if (!st || !box) return;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  box.querySelector('.ccub-grid').innerHTML = st.photos.map((p, i) => `
    <div class="ccub-item">
      <div class="ccub-thumb" style="background-image:url('${p.dataUrl}')">
        <span class="ccub-no">${i + 1}</span>
        <button type="button" class="ccub-rm" aria-label="Foto ${i + 1} entfernen" onclick="ccUbRemove('${key}', ${i})"><i class="ti ti-x"></i></button>
      </div>
      <input class="ccub-cap" type="text" maxlength="120" placeholder="Beschreibung (optional)"
        value="${esc(p.caption)}" oninput="ccUbCaption('${key}', ${i}, this)"/>
    </div>`).join('');
  const n = st.photos.length;
  box.querySelector('.ccub-count').textContent = n ? (n === 1 ? '1 Foto' : `${n} Fotos`) : '';
}

/* Camera photo → JPEG, long side max. 1600 px (sharp on A4, small file) */
function _ccUbLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX = 1600;
        const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
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
   meta: { isEinzug, objekt, mieter }  → returns number of pages added   */
function ccUbAppendPhotos(pdf, key, meta = {}) {
  const st = _ccUb[key];
  if (!pdf || !st || !st.on || !st.photos.length) return 0;

  const W = 210, H = 297, M = 15, CW = W - 2 * M;
  const HEAD = 24, FOOT = 12, CAP = 13;
  const slotH = (H - M - HEAD - FOOT - M) / 2;
  const boxH  = slotH - CAP - 4;
  const two   = n => String(n).padStart(2, '0');
  const when  = ts => {
    const t = new Date(ts);
    if (typeof ccFmtTs === 'function') {                  // German time, 26.09.2026 · 14:30
      const d = typeof ccFmtDate === 'function' && typeof ccParseDate === 'function' ? ccFmtDate(ccParseDate(t)) : '';
      return (d ? d + ' · ' : '') + ccFmtTs(ts).split(' · ')[1];
    }
    return `${two(t.getDate())}.${two(t.getMonth() + 1)}.${t.getFullYear()} · ${two(t.getHours())}:${two(t.getMinutes())}`;
  };
  const sub = ['Übergabeprotokoll ' + (meta.isEinzug ? 'Einzug' : 'Auszug'), meta.objekt, meta.mieter]
    .filter(Boolean).join(' · ');
  const pages = Math.ceil(st.photos.length / 2);

  for (let pg = 0; pg < pages; pg++) {
    pdf.addPage('a4', 'portrait');
    pdf.setTextColor(30, 27, 24);
    pdf.setFont('helvetica', 'bold');   pdf.setFontSize(14);
    pdf.text('Fotodokumentation', M, M + 6);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(110, 102, 94);
    pdf.text(pdf.splitTextToSize(sub, CW)[0], M, M + 12);
    pdf.setDrawColor(200, 194, 186); pdf.setLineWidth(0.2);
    pdf.line(M, M + 16, W - M, M + 16);

    for (let s = 0; s < 2; s++) {
      const i = pg * 2 + s;
      const p = st.photos[i];
      if (!p) break;
      const top = M + HEAD + s * slotH;
      const r = Math.min(CW / p.w, boxH / p.h);
      const iw = p.w * r, ih = p.h * r;
      pdf.addImage(p.dataUrl, 'JPEG', M + (CW - iw) / 2, top + (boxH - ih) / 2, iw, ih);

      pdf.setTextColor(30, 27, 24);
      pdf.setFont('helvetica', 'bold');   pdf.setFontSize(9);
      const label = `Foto ${i + 1}`;
      pdf.text(label, M, top + boxH + 6);
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(110, 102, 94);
      pdf.text(when(p.ts), M + pdf.getTextWidth(label) + 3, top + boxH + 6);
      const cap = String(p.caption || '').trim();
      if (cap) {
        pdf.setTextColor(30, 27, 24);
        pdf.text(pdf.splitTextToSize(cap, CW).slice(0, 2), M, top + boxH + 11);
      }
    }

    pdf.setFontSize(8); pdf.setTextColor(150, 142, 134);
    pdf.text(`Fotoanhang ${pg + 1} / ${pages}`, W - M, H - M + 4, { align: 'right' });
  }
  pdf.setTextColor(0, 0, 0);
  return pages;
}

/* ── STYLES (once) ─────────────────────────────────────────── */
function _ccUbStyles() {
  if (document.getElementById('ccub-styles')) return;
  const s = document.createElement('style');
  s.id = 'ccub-styles';
  s.textContent = `
.ccub { margin-top:4px; }
.ccub-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.ccub-lbl { font-size:12px; color:var(--cc-charcoal); }
.ccub-toggle { position:relative; width:44px; height:26px; border:none; padding:0; border-radius:13px; background:var(--cc-rule); cursor:pointer; flex-shrink:0; transition:background .25s; -webkit-tap-highlight-color:transparent; }
.ccub-toggle[aria-checked="true"] { background:var(--cc-ink); }
.ccub-toggle__knob { position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.18); transition:transform .25s cubic-bezier(.32,.72,0,1); }
.ccub-toggle[aria-checked="true"] .ccub-toggle__knob { transform:translateX(18px); }
.ccub-toggle:focus-visible, .ccub-cam:focus-visible { outline:2px solid var(--cc-ink); outline-offset:2px; }
.ccub-actions { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.ccub-cam { display:inline-flex; align-items:center; gap:6px; min-height:40px; padding:0 14px; border:none; border-radius:8px; background:var(--cc-ink); color:var(--cc-white); font-family:inherit; font-size:12px; font-weight:500; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.ccub-cam i { font-size:16px; }
.ccub-count { font-size:11px; color:var(--cc-stone); }
.ccub-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
.ccub-item { min-width:0; }
.ccub-thumb { position:relative; aspect-ratio:4/3; border-radius:8px; background:var(--cc-surface) center/cover no-repeat; border:.5px solid var(--cc-rule); }
.ccub-no { position:absolute; left:6px; top:6px; min-width:20px; height:20px; padding:0 5px; border-radius:10px; background:rgba(30,27,24,.72); color:#fff; font-size:10px; font-weight:600; display:flex; align-items:center; justify-content:center; }
.ccub-rm { position:absolute; right:4px; top:4px; width:32px; height:32px; border:none; border-radius:50%; background:rgba(30,27,24,.72); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:14px; }
.ccub-cap { width:100%; box-sizing:border-box; margin-top:5px; padding:6px 8px; font-size:11px; font-family:inherit; border:.5px solid var(--cc-rule); border-radius:6px; background:var(--cc-white); color:var(--cc-charcoal); }
.ccub-hint { font-size:10.5px; color:var(--cc-stone); margin-top:8px; line-height:1.4; }
@media (prefers-reduced-motion: reduce) { .ccub-toggle, .ccub-toggle__knob { transition:none; } }
`;
  document.head.appendChild(s);
}
