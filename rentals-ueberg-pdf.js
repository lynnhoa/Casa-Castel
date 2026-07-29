/* ─────────────────────────────────────────────────────────────
   RENTALS — ÜBERGABEPROTOKOLL PDF
   rentals-ueberg-pdf.js

   Generates a 2-page Übergabeprotokoll PDF for rental apartments.

   Data sources:
     - Vermieter          → appSettings (shared with Casa Castel)
     - Adresse / Objekt   → apt.adresse + apt.plz_ort (per card)
     - Unterzeichnungsort → apt.unterschrift_ort (per card)
     - Zählerstände       → apt.zaehler[] (per card, dynamic rows)
     - Schlüssel          → apt.schlussel (per card)
     - Inventar           → apt.inventar[] (per card)

   No Gerichtsstand — not needed on Übergabeprotokoll.
   No Strom/Gas/Wasser hardcoding — iterates apt.zaehler[] dynamically.

   Depends on: rentals-tab-apartments.js (appApartments, _aptContractId,
               appSettings), html2canvas, jsPDF
   ───────────────────────────────────────────────────────────── */


/* ── PDF PREVIEW OVERLAY ─────────────────────────────────── */
/* ── ÜBERGABE PDF PREVIEW — close wiring (overlay is static in index.html) ── */
document.getElementById('aptUebergPreviewClose')?.addEventListener('click', () => {
  document.getElementById('aptUebergPreviewOverlay').style.display = 'none';
  document.getElementById('aptContractOverlay')?.classList.add('open');
});


/* ── ENTRY POINT — called from _aptOpenContract ──────────── */
async function aptGenerateUebergPDF(isEinzug) {
  const apt = appApartments.find(a => a.id === _aptContractId);
  if (!apt) return;

  const btn = document.getElementById('aptUebergPdfBtn');
  if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Generating…'; btn.disabled = true; }

  try {
    // Ensure profile data is loaded before building PDF
    if (typeof loadSettings === 'function') await loadSettings();
    const d = _aptCollectUebergData(apt, isEinzug);
    const html = _aptRenderUebergHTML(d);

    // Render into hidden container
    let container = document.getElementById('_aptUebergRenderContainer');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = '_aptUebergRenderContainer';
    container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
    container.innerHTML = html;
    document.body.appendChild(container);
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 300));

    if (window.innerWidth >= 701) {
      await _aptOpenUebergPreview(d, container);
    } else {
      await _aptSaveUebergPDF(d, container);
    }
  } catch(err) {
    console.error('[Übergabe PDF]', err);
    alert('PDF generation failed. Please try again.');
    if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
  }
}


/* ── COLLECT FORM DATA ───────────────────────────────────── */
function _aptCollectUebergData(apt, isEinzug) {
  const s  = (typeof appSettings !== 'undefined') ? appSettings : {};
  const sk = apt.schlussel || {};

  const fmtDate = v => {
    if (!v) return '';
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d)) return v;
    return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
  };

  // Collect Zähler stands dynamically from card's zaehler array
  const zaehler = (apt.zaehler || []).map(z => ({
    typ:       z.typ || '',
    nummer:    z.zaehler_nr || '',
    stand:     document.getElementById('apt-ub-z-' + z.id)?.value.trim() || '',
  }));

  const datum    = document.getElementById('apt-ub-datum')?.value.trim() || '';
  const sigVal   = document.getElementById('apt-ub-sig')?.value || '';

  return {
    isEinzug,
    datum:           fmtDate(datum),
    // Objekt from card
    aptName:         apt.name || '',
    adresse:         apt.adresse || '',
    wohnungsnummer:  apt.wohnungsnummer || '',
    plzOrt:          apt.plz_ort || '',
    flaeche:         apt.flaeche_m2 ? apt.flaeche_m2 + ' m²' : '',
    zimmerType:      apt.zimmer_type || '',
    nutzungszweck:   document.getElementById('apt-ub-nutzungszweck')?.value.trim() || '',
    // Vermieter from shared settings
    vermieter:       s.vermieter_name || '',
    vermieterAdresse: s.vermieter_adresse || '',
    // Unterzeichnungsort from card → shared settings → default (same chain as Mietvertrag)
    unterschriftOrt: apt.unterschrift_ort || s.unterschrift_ort || 'Wiesbaden',
    unterzeichnungsDatum: fmtDate(sigVal),
    // Mieter from form
    mieterName:   document.getElementById('apt-ub-mieter-name')?.value.trim() || '',
    mieterAdr:    document.getElementById('apt-ub-mieter-adr')?.value.trim() || '',
    mieterName2:  document.getElementById('apt-ub-mieter-name2')?.value.trim() || '',
    mieterAdr2:   document.getElementById('apt-ub-mieter-adr2')?.value.trim() || '',
    mieterName3:  document.getElementById('apt-ub-mieter-name3')?.value.trim() || '',
    mieterAdr3:   document.getElementById('apt-ub-mieter-adr3')?.value.trim() || '',
    neueAdr:      document.getElementById('apt-ub-neue-adr')?.value.trim() || '',
    maengel:      document.getElementById('apt-ub-maengel')?.value.trim() || '',
    bemerkungen:  document.getElementById('apt-ub-bemerkungen')?.value.trim() || '',
    // Zähler — dynamic array from card
    zaehler,
    // Schlüssel from card
    haustur:      parseInt(document.getElementById('apt-ub-haustur')?.value || sk.haustuerschluessel || 1),
    wohnungtur:   parseInt(document.getElementById('apt-ub-wohnungtur')?.value || sk.wohnungsschluessel || 1),
    briefkasten:  parseInt(document.getElementById('apt-ub-briefkasten')?.value || sk.briefkastenschluessel || 0),
    // Footer
    footerAdresse: [apt.adresse, apt.plz_ort].filter(Boolean).join(', '),
  };
}


/* ── DESKTOP PREVIEW ─────────────────────────────────────── */
async function _aptOpenUebergPreview(d, container) {
  const overlay = document.getElementById('aptUebergPreviewOverlay');
  const body    = document.getElementById('aptUebergPreviewBody');
  body.innerHTML = '';
  overlay.style.display = 'flex';

  const pages = container.querySelectorAll('.pdf-page');
  const bodyW = body.clientWidth - 32;
  const scale = Math.min(1, bodyW / 794);

  for (const pg of pages) {
    const canvas = await html2canvas(pg, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, height: 1123, windowWidth: 794 });
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
  const saveBtn = document.getElementById('aptUebergSaveBtn');
  const freshSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(freshSave, saveBtn);
  freshSave.addEventListener('click', async () => {
    freshSave.innerHTML = '<i class="ti ti-loader"></i> Saving…';
    freshSave.disabled = true;
    await _aptSaveUebergPDFFromData(d);
    freshSave.innerHTML = '<i class="ti ti-printer" style="font-size:14px;"></i> PDF';
    freshSave.disabled = false;
    document.getElementById('aptUebergPreviewOverlay').style.display = 'none';
    document.getElementById('aptContractOverlay')?.classList.add('open');
  });

  // Re-enable modal button
  const btn = document.getElementById('aptUebergPdfBtn');
  if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
}


/* ── MOBILE: GENERATE + SAVE DIRECTLY ───────────────────── */
async function _aptSaveUebergPDF(d, container) {
  await _aptSaveUebergPDFFromData(d, container);
  container?.remove();
  const btn = document.getElementById('aptUebergPdfBtn');
  if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
  document.getElementById('aptContractOverlay')?.classList.add('open');
}


/* ── RENDER + SAVE ───────────────────────────────────────── */
async function _aptSaveUebergPDFFromData(d, existingContainer) {
  let container = existingContainer;
  if (!container) {
    const html = _aptRenderUebergHTML(d);
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
    const canvas = await html2canvas(pages[i], { scale: 3, useCORS: true, backgroundColor: '#ffffff', width: 794, height: 1123, windowWidth: 794 });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
  }

  const typ      = d.isEinzug ? 'Einzug' : 'Auszug';
  const safeName = (d.mieterName || d.aptName).replace(/\s+/g, '_');
  pdf.save(`Übergabeprotokoll_${typ}_${safeName}.pdf`);

  if (!existingContainer) container.remove();
}


/* ── HTML RENDERER ───────────────────────────────────────── */
function _aptRenderUebergHTML(d) {
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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
      font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a;
      line-height:13px; height:13px; }
    .type-box { display:inline-block; width:13px; height:13px; border:1px solid #888780;
      border-radius:2px; flex-shrink:0; vertical-align:middle; position:relative; }
    .type-box--checked { background:#1a1a1a; border-color:#1a1a1a; }
    .type-box--checked::after { content:''; position:absolute; top:2px; left:2px;
      width:7px; height:4px; border-left:1.5px solid white; border-bottom:1.5px solid white;
      transform:rotate(-45deg); display:block; }
    .type-date { margin-left:auto; font-family:'Lato',sans-serif; font-size:10px;
      font-weight:300; color:#3a3530; display:inline-flex; align-items:center;
      gap:10px; line-height:13px; height:13px; }
    .type-date-val { font-weight:400; color:#1a1a1a; }

    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.13em; text-transform:uppercase; color:#4a4540;
      margin-top:40px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:12px; }

    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530;
      min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a;
      flex:1; line-height:1.55; }

    .write-line { border-bottom:0.5px solid #b8b3ac; height:24px; margin-top:3px; }
    .write-area { font-family:'Lato',sans-serif; font-size:12px; font-weight:300;
      color:#1a1a1a; line-height:1.55; padding-top:3px; white-space:pre-wrap; word-break:break-word; }

    .zaehler-table { width:100%; border-collapse:collapse; margin-top:16px; }
    .zaehler-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.12em; text-transform:uppercase; color:#888780;
      border-bottom:0.5px solid #d8d3cc; padding:3px 0 5px; text-align:left; }
    .zaehler-table td { font-family:'Lato',sans-serif; font-size:12px; font-weight:300;
      color:#1a1a1a; padding:5px 0; border-bottom:0.5px solid #f0ece6; }
    .zaehler-table tr:last-child td { border-bottom:none; }
    .stand-val { font-weight:400; }
    .stand-empty { border-bottom:0.5px solid #b8b3ac; display:inline-block; width:80%; height:18px; }

    .schluessel-row { display:flex; gap:36px; margin-top:22px; }
    .schluessel-item { display:flex; align-items:flex-end; gap:8px; }
    .schluessel-item__label { font-family:'Lato',sans-serif; font-size:12px; font-weight:300;
      color:#3a3530; white-space:nowrap; padding-bottom:2px; }
    .schluessel-item__val { font-family:'Lato',sans-serif; font-size:12px; font-weight:400;
      color:#1a1a1a; padding-bottom:2px; }

    .sig-block { margin-top:100px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic;
      font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300;
      color:#aaa59e; margin-bottom:4px; }
    .sig-write-gap { height:92px; }
    .sig-write-gap--short { height:58px; }
    .sig-ort-gap { height:22px; }
    .sig-ort-line { border:none; border-top:0.5px solid #b8b3ac; margin-bottom:5px; }
    .sig-line { border:none; border-top:0.5px solid #b8b3ac; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }
    .sig-grid { margin-top:24px; }
    .sig-grid .sig-block { margin-top:0; }
    .sig-grid .sig-block + .sig-block { margin-top:56px; }
  `;

  const isGewerbe = d.zimmerType === 'Gewerbefläche';
  const hdr = (n) => `
    <div class="hdr">
      <span class="hdr__wordmark">${isGewerbe ? esc(d.aptName) : ''}</span>
      <div class="hdr__apt">
        <span class="hdr__apt-label">${isGewerbe ? 'Übergabeprotokoll' : 'Wohnung'}</span>
        <span class="hdr__apt-name">${isGewerbe ? esc(d.nutzungszweck) : esc(d.aptName)}</span>
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

  // Dynamic Zähler rows
  const zaehlerRows = d.zaehler.length
    ? d.zaehler.map(z => `
        <tr>
          <td>${esc(z.typ)}</td>
          <td>${esc(z.nummer)}</td>
          <td>${z.stand ? `<span class="stand-val">${esc(z.stand)}</span>` : '<span class="stand-empty"></span>'}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="font-style:italic;color:#aaa59e;font-size:10px;">Keine Zähler hinterlegt</td></tr>`;

  // Prefill needs only the date (Ort always resolves via fallback chain) — same as Mietvertrag.
  // Without a date: blank write line ABOVE the "Ort, Datum" caption for manual fill-in.
  const sigDate = d.unterzeichnungsDatum
    ? `<div class="sig-prefill">${esc(d.unterschriftOrt)}, ${esc(d.unterzeichnungsDatum)}</div>
        <div class="sig-write-gap"></div>`
    : `<div class="sig-ort-gap"></div>
        <hr class="sig-ort-line"/>
        <div class="sig-date-label">Ort, Datum</div>
        <div class="sig-write-gap sig-write-gap--short"></div>`;

  const objektLine = [d.adresse, d.plzOrt].filter(Boolean).join(', ');

  const hasMieter2 = !!d.mieterName2;
  const hasMieter3 = !!d.mieterName3;
  const hasExtra   = hasMieter2 || hasMieter3;
  const mieter1Lbl = hasExtra ? 'Mieter 1' : 'Mieter';

  // Signature column + rows
  const sigCol = (role, name) => `
      <div class="sig-col">
        ${sigDate}
        <hr class="sig-line"/>
        <div class="sig-role">${role}</div>
        <div class="sig-name">${esc(name)}</div>
      </div>`;
  const sigColEmpty = `<div class="sig-col"></div>`;

  // Extra signers (Mieter 2 / 3) paired into further rows below Vermieter + Mieter 1
  const extraSigners = [];
  if (hasMieter2) extraSigners.push(['Mieter 2', d.mieterName2]);
  if (hasMieter3) extraSigners.push(['Mieter 3', d.mieterName3]);
  let sigExtraRows = '';
  for (let i = 0; i < extraSigners.length; i += 2) {
    const a = extraSigners[i], b = extraSigners[i + 1];
    sigExtraRows += `<div class="sig-block">${sigCol(a[0], a[1])}${b ? sigCol(b[0], b[1]) : sigColEmpty}</div>`;
  }

  // ── Reusable content blocks ──
  const titleBlock = `
    <div class="doc-title">Übergabeprotokoll</div>
    <div class="doc-subtitle">${esc(d.zimmerType)} · ${esc(objektLine)}</div>

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
    </div>`;

  const parteienBlock = `
    <div class="sec sec--first">Objekt &amp; Parteien</div>
    ${kv('Adresse', objektLine)}
    ${kv('Wohnungsnummer', d.wohnungsnummer || '')}
    ${d.flaeche ? kv('Wohnfläche', d.flaeche) : ''}
    ${kv('Vermieter', d.vermieter)}
    ${kv(mieter1Lbl, d.mieterName)}
    ${kv(hasExtra ? 'Adresse Mieter 1' : 'Adresse Mieter', d.mieterAdr)}
    ${hasMieter2 ? kv('Mieter 2', d.mieterName2) : ''}
    ${hasMieter2 && d.mieterAdr2 ? kv('Adresse Mieter 2', d.mieterAdr2) : ''}
    ${hasMieter3 ? kv('Mieter 3', d.mieterName3) : ''}
    ${hasMieter3 && d.mieterAdr3 ? kv('Adresse Mieter 3', d.mieterAdr3) : ''}
    ${!d.isEinzug && d.neueAdr ? kv('Neue Adresse', d.neueAdr) : ''}`;

  const maengelBlock = `
    <div class="sec">Mängelbeschreibung / Zustand</div>
    <div style="margin-top:4px;">${writeField(d.maengel, 6)}</div>`;

  const zaehlerBlock = (first) => `
    <div class="sec${first ? ' sec--first' : ''}">Zählerstände</div>
    <table class="zaehler-table">
      <thead><tr>
        <th style="width:22%">Art</th>
        <th style="width:40%">Zählernummer</th>
        <th>Stand</th>
      </tr></thead>
      <tbody>${zaehlerRows}</tbody>
    </table>`;

  const bemerkungenBlock = (first) => `
    <div class="sec${first ? ' sec--first' : ''}">Allgemeine Bemerkungen</div>
    <div style="margin-top:4px;">${writeField(d.bemerkungen, 9)}</div>`;

  const schluesselBlock = `
    <div class="sec" style="margin-top:64px;">Schlüsselübergabe</div>
    <div class="schluessel-row">
      <div class="schluessel-item">
        <span class="schluessel-item__label">Haustür</span>
        <span class="schluessel-item__val">${d.haustur}</span>
      </div>
      <div class="schluessel-item">
        <span class="schluessel-item__label">${isGewerbe ? 'Mietfläche' : 'Wohnungstür'}</span>
        <span class="schluessel-item__val">${d.wohnungtur}</span>
      </div>
      <div class="schluessel-item">
        <span class="schluessel-item__label">Briefkasten</span>
        <span class="schluessel-item__val">${d.briefkasten}</span>
      </div>
    </div>`;

  const page = (n, inner) => `
<div class="pdf-page">
  ${hdr(n)}
  ${ftr(n)}
  <div class="content">${inner}
  </div>
</div>`;

  let pagesHTML;
  if (!hasExtra) {
    // Single tenant → original 2-page layout (signatures under Schlüsselübergabe)
    pagesHTML =
      page(1, `${titleBlock}${parteienBlock}${maengelBlock}${zaehlerBlock(false)}`) +
      page(2, `${bemerkungenBlock(true)}${schluesselBlock}
    <div class="sig-block">${sigCol('Vermieter', d.vermieter)}${sigCol('Mieter', d.mieterName)}</div>`);
  } else {
    // 2+ tenants → Zähler moves to page 2, signatures get their own page 3 (no cutoff)
    pagesHTML =
      page(1, `${titleBlock}${parteienBlock}${maengelBlock}`) +
      page(2, `${zaehlerBlock(true)}${bemerkungenBlock(false)}${schluesselBlock}`) +
      page(3, `<div class="sec sec--first">Unterschriften</div>
    <div class="sig-grid"><div class="sig-block">${sigCol('Vermieter', d.vermieter)}${sigCol('Mieter 1', d.mieterName)}</div>${sigExtraRows}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"/><style>${CSS}</style></head>
<body>
${pagesHTML}
</body></html>`;
}
