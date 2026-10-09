/* ─────────────────────────────────────────────────────────────
   cc-ueberg-photos.js — Fotos im Übergabeprotokoll (Einzug & Auszug)

   Used by the 3 Übergabe generators:
     Apartments  (rentals-tab-apartments.js + rentals-ueberg-pdf.js)          key 'apt-ub'
     Parking     (rentals-tab-parking.js    + rentals-parking-ueberg-pdf.js)  key 'pk-ub'
     Casa Castel (tab-rooms.js)                                               key 'room-ub'

   Form:  Auswahl "Ohne Fotos | Mit Fotos" (app standard cc-seg, cc-controls.js).
          "Foto" opens the phone's own menu: Fotomediathek (several at once),
          Foto aufnehmen, Datei auswählen. Upright thumbnails, 4 per row.
          Tap a photo → larger view, Beschreibung, Foto löschen.
   PDF:   Ohne Fotos → PDF exactly as before.
          Mit Fotos  → extra A4 pages at the END, built as pages of the SAME
          document (its own beige header, footer, fonts, running page number):
          6 photos per page (2 × 3) in equal frames; number, date/time when the
          photo was TAKEN (from the photo itself; "(hinzugefügt)" if unknown),
          Beschreibung.

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
        <div class="ccub-hint">Kamera oder Fotomediathek. Werden am Ende des PDFs angehängt, mit Aufnahmedatum.</div>
      </div>
      <input type="file" accept="image/*" multiple style="display:none" onchange="ccUbFiles('${key}', this)"/>
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
  if (st.on && !st.photos.length) ccUbTakePhoto(key);    // "Mit Fotos" opens the photo menu straight away
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
      st.photos.push({ ...img, ts: taken ? taken.ts : Date.now(), when: taken ? taken.text : '', taken: !!taken, caption: '' });
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
    `<button type="button" class="ccub-add" onclick="ccUbTakePhoto('${key}')" ${full ? 'disabled' : ''} aria-label="Foto hinzufügen">
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
  const sub = ['Übergabeprotokoll ' + (meta.isEinzug ? 'Einzug' : 'Auszug'), meta.objekt, meta.mieter,
    total === 1 ? '1 Foto' : total + ' Fotos'].filter(Boolean).map(E).join(' · ');
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
          <span style="font-family:'Lato',sans-serif;font-size:9px;font-weight:300;color:#8a847c">${p.when || _ccUbWhen(p.ts)}${p.taken === false ? ' (hinzugefügt)' : ''}</span>
        </div>
        ${cap ? `<div style="font-family:'Lato',sans-serif;font-size:10px;font-weight:300;color:#1a1a1a;margin-top:3px;line-height:1.35;max-height:27px;overflow:hidden">${E(cap)}</div>` : ''}
      </div>`;
    }).join('');
    content.innerHTML = `
      <div class="doc-title" style="font-family:'Playfair Display',serif;font-size:21px;font-weight:400;color:#1a1a1a;line-height:1.15;margin-bottom:4px">Fotodokumentation</div>
      <div class="doc-subtitle" style="font-family:'Lato',sans-serif;font-size:9.5px;font-weight:300;color:#aaa59e;margin-bottom:22px">${sub}</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:${GAP_X}px;row-gap:${GAP_Y}px">${cells}</div>`;
    last.after(pg);
    last = pg;
    imgs.push(...pg.querySelectorAll('img'));
  }
  await Promise.all(imgs.map(img => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})));
  return Math.ceil(total / PER);
}

/* ── (previous version, no longer used) photo pages drawn directly with jsPDF ──
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
