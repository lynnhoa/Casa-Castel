/* ─────────────────────────────────────────────────────────────
   RENTALS — ÜBERGABEPROTOKOLL STELLPLATZVERMIETUNG PDF
   rentals-parking-ueberg-pdf.js

   Generates a 2-page Übergabeprotokoll PDF for parking spaces.
   Identical design to rentals-ueberg-pdf.js (Wohnungen).

   Field mapping vs. Wohnungen:
     Wohnungen              → Parking
     ─────────────────────────────────────────────────────────
     apt.name               → spot.name
     apt.adresse            → spot.adresse
     apt.plz_ort            → spot.plz_ort
     apt.flaeche_m2         → spot.level_position  (Ebene/Position)
     apt.zimmer_type        → spot.parking_type
     apt.unterschrift_ort   → spot.gerichtsstand   (reused for sig city)
     apt.zaehler[]          → (none — no utility meters on parking)
     sk.wohnungsschluessel  → sk.parking_schluessel
     sk.haustuerschluessel  → sk.haustuerschluessel (same)
     apt-ub-nutzungszweck   → (none)
     apt-ub-maengel         → pk-ub-zustand        (Zustand field)
     apt-ub-bemerkungen     → pk-ub-bemerkungen
     apt-ub-neue-adr        → pk-ub-neue-adr

   Data sources:
     - Vermieter            → appSettings
     - Adresse / Objekt     → spot.adresse + spot.plz_ort
     - Unterzeichnungsort   → spot.gerichtsstand
     - Stellplatz-Nr / Typ  → spot.name + spot.parking_type
     - Ebene / Position     → spot.level_position
     - Schlüssel            → spot.schlussel (rentals_parking_schlussel)

   Depends on: rentals-tab-parking.js (_pkContractId, appParking,
               appSettings), html2canvas, jsPDF
   ───────────────────────────────────────────────────────────── */


/* ── PREVIEW CLOSE BUTTON ────────────────────────────────── */
document.getElementById('pkUebergPreviewClose')?.addEventListener('click', () => {
  document.getElementById('pkUebergPreviewOverlay').style.display = 'none';
  document.getElementById('pkContractOverlay')?.classList.add('open');
});


/* ── ENTRY POINT — called from _pkOpenContract / pkUebergPdfBtn ── */
async function pkGenerateUebergPDF(isEinzug) {
  const spot = appParking.find(p => p.id === _pkContractId);
  if (!spot) return;

  const btn = document.getElementById('pkUebergPdfBtn');
  if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Generating…'; btn.disabled = true; }

  try {
    if (typeof loadSettings === 'function') await loadSettings();
    const d   = _pkCollectUebergData(spot, isEinzug);
    const html = _pkRenderUebergHTML(d);

    let container = document.getElementById('_pkUebergRenderContainer');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = '_pkUebergRenderContainer';
    container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
    container.innerHTML = html;
    document.body.appendChild(container);
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 300));

    if (window.innerWidth >= 701) {
      await _pkOpenUebergPreview(d, container);
    } else {
      await _pkSaveUebergPDF(d, container);
    }
  } catch (err) {
    console.error('[Parking Übergabe PDF]', err);
    alert('PDF generation failed. Please try again.');
    if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
  }
}


/* ── COLLECT FORM DATA ───────────────────────────────────── */
function _pkCollectUebergData(spot, isEinzug) {
  const s  = (typeof appSettings !== 'undefined') ? appSettings : {};
  const sk = spot.schlussel || {};

  const fmtDate = v => {
    if (!v) return '';
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d)) return v;
    return String(d.getDate()).padStart(2,'0') + '.' +
           String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
  };

  const datum  = document.getElementById('pk-ub-datum')?.value?.trim() || '';
  const sigVal = document.getElementById('pk-ub-sig')?.value || '';

  return {
    isEinzug,
    datum:            fmtDate(datum),
    // Objekt
    spotName:         spot.name || '',
    parkingType:      spot.parking_type || '',
    adresse:          spot.adresse || '',
    plzOrt:           spot.plz_ort || '',
    levelPosition:    spot.level_position || '',   // replaces Wohnfläche
    propertyRef:      spot.property_ref || '',
    // Vermieter
    vermieter:        s.vermieter_name || '',
    vermieterAdresse: s.vermieter_adresse || '',
    // Unterzeichnungsort — reuse gerichtsstand as signing city
    unterschriftOrt:  spot.gerichtsstand || '',
    unterzeichnungsDatum: fmtDate(sigVal),
    // Mieter
    mieterName:  document.getElementById('pk-ub-mieter-name')?.value?.trim() || '',
    mieterAdr:   document.getElementById('pk-ub-mieter-adr')?.value?.trim()  || '',
    neueAdr:     document.getElementById('pk-ub-neue-adr')?.value?.trim()    || '',
    // Zustand removed — not on one-pager
    bemerkungen: document.getElementById('pk-ub-bemerkungen')?.value?.trim() || '',
    // Schlüssel — parking-specific
    parkingSchluessel: parseInt(document.getElementById('pk-ub-pkschluessel')?.value  || sk.parking_schluessel  || 1),
    haustur:           parseInt(document.getElementById('pk-ub-haustur')?.value        || sk.haustuerschluessel  || 0),
    // Footer
    footerAdresse: [spot.adresse, spot.plz_ort].filter(Boolean).join(', '),
  };
}


/* ── DESKTOP PREVIEW ─────────────────────────────────────── */
async function _pkOpenUebergPreview(d, container) {
  const overlay = document.getElementById('pkUebergPreviewOverlay');
  const body    = document.getElementById('pkUebergPreviewBody');
  if (!overlay || !body) {
    // Fallback: save directly if no preview overlay in DOM
    await _pkSaveUebergPDF(d, container);
    return;
  }
  body.innerHTML = '';
  overlay.style.display = 'flex';

  const pages = container.querySelectorAll('.pdf-page');
  const bodyW = body.clientWidth - 32;
  const scale = Math.min(1, bodyW / 794);

  for (const pg of pages) {
    const canvas = await html2canvas(pg, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794
    });
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'flex-shrink:0;box-shadow:0 2px 12px rgba(0,0,0,.10);border-radius:2px;overflow:hidden;';
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.95);
    img.style.cssText = `width:${794 * scale}px;height:${1123 * scale}px;display:block;`;
    wrapper.appendChild(img);
    body.appendChild(wrapper);
  }
  container.remove();

  // Wire save button
  const saveBtn  = document.getElementById('pkUebergSaveBtn');
  const freshSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(freshSave, saveBtn);
  freshSave.addEventListener('click', async () => {
    freshSave.innerHTML = '<i class="ti ti-loader"></i> Saving…';
    freshSave.disabled  = true;
    await _pkSaveUebergPDFFromData(d);
    freshSave.innerHTML = '<i class="ti ti-printer" style="font-size:14px;"></i> PDF';
    freshSave.disabled  = false;
    overlay.style.display = 'none';
    document.getElementById('pkContractOverlay')?.classList.add('open');
  });

  const btn = document.getElementById('pkUebergPdfBtn');
  if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
}


/* ── MOBILE: GENERATE + SAVE DIRECTLY ───────────────────── */
async function _pkSaveUebergPDF(d, container) {
  await _pkSaveUebergPDFFromData(d, container);
  container?.remove();
  const btn = document.getElementById('pkUebergPdfBtn');
  if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
  document.getElementById('pkContractOverlay')?.classList.add('open');
}


/* ── RENDER + SAVE ───────────────────────────────────────── */
async function _pkSaveUebergPDFFromData(d, existingContainer) {
  let container = existingContainer;
  if (!container) {
    const html = _pkRenderUebergHTML(d);
    container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
    container.innerHTML = html;
    document.body.appendChild(container);
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 300));
  }

  const { jsPDF } = window.jspdf;
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pages = container.querySelectorAll('.pdf-page');

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(pages[i], {
      scale: 3, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
  }

  const typ      = d.isEinzug ? 'Einzug' : 'Auszug';
  const safeName = (d.mieterName || d.spotName).replace(/\s+/g, '_');
  pdf.save(`Übergabeprotokoll_Stellplatz_${typ}_${safeName}.pdf`);

  if (!existingContainer) container.remove();
}


/* ── HTML RENDERER ───────────────────────────────────────── */
function _pkRenderUebergHTML(d) {
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  /* ── CSS — identical to Wohnungen version ── */
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .pdf-page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }

    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da;
      display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400;
      color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__apt { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__apt-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400;
      letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__apt-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400;
      color:#7a5c30; line-height:1; }

    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif;
      font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }

    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }

    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400;
      color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300;
      color:#aaa59e; margin-bottom:22px; }

    .type-toggle { display:flex; align-items:center; gap:24px; margin-bottom:36px;
      padding:9px 12px; background:#f7f4f0; border-radius:3px; border:0.5px solid #e8e2d8; height:36px; }
    .type-option { display:inline-flex; align-items:center; gap:8px;
      font-family:'Lato',sans-serif; font-size:11px; font-weight:400; color:#1a1a1a;
      line-height:13px; height:13px; }
    .type-box { display:inline-block; width:13px; height:13px; border:1px solid #888780;
      border-radius:2px; flex-shrink:0; vertical-align:middle; position:relative; }
    .type-box--checked { background:#1a1a1a; border-color:#1a1a1a; }
    .type-box--checked::after { content:''; position:absolute; top:2px; left:2px;
      width:7px; height:4px; border-left:1.5px solid white; border-bottom:1.5px solid white;
      transform:rotate(-45deg); display:block; }
    .type-date { margin-left:auto; font-family:'Lato',sans-serif; font-size:10px;
      font-weight:300; color:#6a6560; display:inline-flex; align-items:center;
      gap:10px; line-height:13px; height:13px; }
    .type-date-val { font-weight:400; color:#1a1a1a; }

    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.13em; text-transform:uppercase; color:#4a4540;
      margin-top:40px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:12px; }

    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#6a6560;
      min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:11px; font-weight:400; color:#1a1a1a;
      flex:1; line-height:1.55; }

    .write-line { border-bottom:0.5px solid #b8b3ac; height:24px; margin-top:3px; }
    .write-area { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#1a1a1a; line-height:1.55; padding-top:3px; white-space:pre-wrap; word-break:break-word; }

    .schluessel-row { display:flex; gap:36px; margin-top:22px; }
    .schluessel-item { display:flex; align-items:flex-end; gap:8px; }
    .schluessel-item__label { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#6a6560; white-space:nowrap; padding-bottom:2px; }
    .schluessel-item__val { font-family:'Lato',sans-serif; font-size:11px; font-weight:400;
      color:#1a1a1a; padding-bottom:2px; }

    .sig-block { margin-top:100px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic;
      font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300;
      color:#aaa59e; margin-bottom:4px; }
    .sig-write-gap { height:74px; }
    .sig-line { border:none; border-top:0.5px solid #b8b3ac; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }
  `;

  /* ── Header: wordmark blank, right side = Stellplatz label + spot name ── */
  const hdr = (n) => `
    <div class="hdr">
      <span class="hdr__wordmark"></span>
      <div class="hdr__apt">
        <span class="hdr__apt-label">Stellplatz</span>
        <span class="hdr__apt-name">${esc(d.spotName)}</span>
      </div>
    </div>`;

  const ftr = (n) => `
    <div class="ftr">
      <hr class="ftr__rule"/>
      <div class="ftr__row">
        <span>${esc(d.footerAdresse)}</span>
        <span>${n}</span>
      </div>
    </div>`;

  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${esc(v) || ''}</span></div>`;

  const writeField = (text, lines) => {
    if (text) return `<div class="write-area">${esc(text)}</div>`;
    return Array(lines).fill('<div class="write-line"></div>').join('');
  };

  const objektLine = [d.adresse, d.plzOrt].filter(Boolean).join(', ');

  const sigDate = d.unterzeichnungsDatum && d.unterschriftOrt
    ? `<div class="sig-prefill">${esc(d.unterschriftOrt)}, ${esc(d.unterzeichnungsDatum)}</div>`
    : `<div class="sig-date-label">Datum, Ort</div>`;

  /* ── Schlüssel section — parking has Parkschlüssel instead of Wohnungstür ── */
  const schluesselHTML = `
    <div class="schluessel-row">
      <div class="schluessel-item">
        <span class="schluessel-item__label">Parkschlüssel / Transponder</span>
        <span class="schluessel-item__val">${d.parkingSchluessel}</span>
      </div>
      ${d.haustur > 0 ? `
      <div class="schluessel-item">
        <span class="schluessel-item__label">Haustür</span>
        <span class="schluessel-item__val">${d.haustur}</span>
      </div>` : ''}
    </div>`;

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"/><style>${CSS}</style></head>
<body>

<!-- PAGE 1 -->
<div class="pdf-page">
  ${hdr(1)}
  ${ftr(1)}
  <div class="content">
    <div class="doc-title">Übergabeprotokoll</div>
    <div class="doc-subtitle">${esc(d.parkingType)} · ${esc(objektLine)}</div>

    <div class="type-toggle">
      <div class="type-option">
        <div class="type-box ${d.isEinzug ? 'type-box--checked' : ''}"></div>
        Einzug
      </div>
      <div class="type-option">
        <div class="type-box ${!d.isEinzug ? 'type-box--checked' : ''}"></div>
        Auszug
      </div>
      <div class="type-date">
        Übergabedatum&nbsp;<span class="type-date-val">${esc(d.datum)}</span>
      </div>
    </div>

    <div class="sec sec--first">Objekt &amp; Parteien</div>
    ${kv('Adresse', objektLine)}
    ${d.levelPosition  ? kv('Ebene / Position',   d.levelPosition)  : ''}
    ${d.propertyRef    ? kv('Property',            d.propertyRef)    : ''}
    ${kv('Art des Stellplatzes', d.parkingType)}
    ${kv('Vermieter',            d.vermieter)}
    ${kv('Mieter',               d.mieterName)}
    ${kv('Adresse Mieter',       d.mieterAdr)}
    ${!d.isEinzug && d.neueAdr ? kv('Neue Adresse', d.neueAdr) : ''}

    <div class="sec">Allgemeine Anmerkungen</div>
    <div style="margin-top:4px;">${writeField(d.bemerkungen, 5)}</div>

    <div class="sec" style="margin-top:28px;">Schlüsselübergabe</div>
    ${schluesselHTML}

    <div class="sig-block" style="margin-top:52px;">
      <div class="sig-col">
        ${sigDate}
        <div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Vermieter</div>
        <div class="sig-name">${esc(d.vermieter)}</div>
      </div>
      <div class="sig-col">
        ${sigDate}
        <div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Mieter</div>
        <div class="sig-name">${esc(d.mieterName)}</div>
      </div>
    </div>
  </div>
</div>

</body></html>`;
}
