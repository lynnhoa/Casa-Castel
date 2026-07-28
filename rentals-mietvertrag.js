/* ═══════════════════════════════════════════════════════════════════════════
 *  CASA CASTEL — MIETVERTRAG (RENTALS / WOHNUNGSVERMIETUNG)
 *  Append this entire file to the end of rentals-tab-apartments.js
 *
 *  Adapted from mietvertrag_final.js (WG Zimmervermietung).
 *  Changes vs WG version:
 *    • Subtitle       → Wohnungsvermietung (not Zimmervermietung)
 *    • Header label   → WOHNUNG (not ZIMMER)
 *    • Mietobjekt kv  → Wohnungsgröße / Wohnung (not Zimmergröße / Zimmer)
 *    • NK intro text  → Wohnfläche-based key (not Zimmer + Gemeinschaftsfläche)
 *    • NK items       → full §§ 1, 2 BetrKV list (broad / Hausverwaltung-safe)
 *    • Clause §1      → Wohnung wording (not Zimmer)
 *    • Everything else identical.
 *
 *  Contains:
 *    _buildRentalMietvertragData()      — data builder
 *    _contractBodyRentalMietvertrag()   — modal body HTML
 *    _toggleRentalMvBefristung()        — toggle helper
 *    _updateRentalMvGrundDetail()       — radio helper
 *    _renderRentalMietvertragHTML()     — 3-page PDF HTML
 *    _generateRentalMietvertragPDF()    — html2canvas + jsPDF
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ── DATA BUILDER ─────────────────────────────────────────────────────────── */

function _buildRentalMietvertragData(room, s, {
  mieterName, mieterAdr, mieterDob, mieterEmail,
  mieterName2 = '', mieterAdr2 = '', mieterDob2 = '', mieterEmail2 = '', mieterTel2 = '',
  mieterName3 = '', mieterAdr3 = '', mieterDob3 = '', mieterEmail3 = '', mieterTel3 = '',
  startVal, sigVal,
  befristet = false, endVal = null,
  grundVal = '', eigenbedarfPerson = '',
  kautionFael = '5',
  staffelAn = false, staffeln = [], anfangsmiete = null,
}) {
  const fmt = d => {
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' +
           dt.getFullYear();
  };

  const _gem = room.gemeinschaftsraeume;
  const gemStr = Array.isArray(_gem) ? _gem.join(', ') : (typeof _gem === 'string' ? _gem : '');

  let kaltmiete, nkVorauszahlung, gesamtmiete, pricingMode;
  if (room.mietvertrag_pricing === 'kalt_nk' && room.kaltmiete) {
    kaltmiete       = Number(room.kaltmiete);
    nkVorauszahlung = Number(room.nk_pauschale) || 0;
    gesamtmiete     = kaltmiete + nkVorauszahlung;
    pricingMode     = 'kalt_nk';
  } else {
    kaltmiete       = Number(room.kaltmiete) || Number(room.mietvertrag_miete) || Number(room.monatl_miete) || 0;
    nkVorauszahlung = Number(room.nk_pauschale) || 0;
    gesamtmiete     = kaltmiete + nkVorauszahlung;
    pricingMode     = 'pauschal';
  }

  // Pauschal: kaution base = full monthly charge (kaltmiete + NK)
  // Kalt+NK:  kaution base = kaltmiete only (§ 551 BGB)
  const kautionBase = pricingMode === 'pauschal' ? kaltmiete + nkVorauszahlung : kaltmiete;
  const kaution = room.kaution_override && room.kaution_default
    ? Number(room.kaution_default)
    : kautionBase * 3;

  const grundLabels = {
    eigenbedarf: 'Eigenbedarf (§\u00a0575 Abs.\u00a01 Nr.\u00a01 BGB)',
    abriss:      'Abriss / wesentliche Umbaumaßnahmen (§\u00a0575 Abs.\u00a01 Nr.\u00a03 BGB)',
    dienst:      'Dienstwohnung (§\u00a0575 Abs.\u00a01 Nr.\u00a02 BGB)',
  };

  return {
    vermieterName:    s.vermieter_name    || '',
    vermieterAdresse: s.vermieter_adresse || '',
    vermieterEmail:   s.vermieter_email   || '',
    vermieterSig:     s.vermieter_name    || '',
    objektAdresse:    room.adresse          || '',
    objektPLZOrt:     room.plz_ort          || '',
    footerAdresse:    room.adresse
                        ? room.adresse + (room.plz_ort ? ' \u00b7 ' + room.plz_ort : '')
                        : (room.plz_ort || ''),
    kontoinhaber:     s.kontoinhaber      || '',
    bankname:         s.bankname          || '',
    iban:             s.iban              || '',
    bic:              s.bic               || '',
    gerichtsstand:    room.gerichtsstand    || '',
    unterschriftOrt:  room.unterschrift_ort || '',
    mieterName,
    mieterAdresse:      mieterAdr   || '',
    mieterGeburtsdatum: mieterDob   || '',
    mieterEmail:        mieterEmail || '',
    zimmerName:          room.name,
    zimmerFlaeche:       room.flaeche_m2 || 0,
    etage:               room.floor || '',
    gemeinschaftsraeume: gemStr,
    mietbeginn: startVal ? fmt(new Date(startVal)) : '',
    befristet,
    mietende:         befristet && endVal ? fmt(new Date(endVal)) : '',
    grundLabel:       grundLabels[grundVal] || '',
    eigenbedarfPerson: eigenbedarfPerson || '',
    pricingMode,
    kaltmiete,
    nkVorauszahlung,
    gesamtmiete,
    kaution,
    kautionFaelText: kautionFael === 'sofort' ? 'sofort nach Vertragsunterzeichnung' : `binnen ${kautionFael}\u00a0Tagen`,
    hausstuerschluessel: room.haustuerschluessel || 1,
    zimmerschluessel:    room.zimmerschluessel    || 1,
    inventar: (Array.isArray(room.inventar) ? room.inventar : [])
      .map(i => ({
        gegenstand: (i.gegenstand || i.name || '').toString().trim(),
        anzahl:     Number(i.anzahl) > 0 ? Number(i.anzahl) : 1,
      }))
      .filter(i => i.gegenstand),
    unterzeichnungsDatum: sigVal ? fmt(new Date(sigVal)) : '',
    hasMieter2: !!(mieterName2 && mieterName2.trim()),
    mieterName2, mieterAdresse2: mieterAdr2, mieterGeburtsdatum2: mieterDob2, mieterEmail2,
    hasMieter3: !!(mieterName3 && mieterName3.trim()),
    mieterName3, mieterAdresse3: mieterAdr3, mieterGeburtsdatum3: mieterDob3, mieterEmail3,
    staffelAn,
    staffeln: staffeln.map(s => ({ datum: s.datum || '', betrag: Number(s.betrag) || 0 })),
    anfangsmiete: anfangsmiete !== null ? Number(anfangsmiete) : null,
  };
}


/* ── MODAL BODY ───────────────────────────────────────────────────────────── */

function _contractBodyRentalMietvertrag(room) {
  const s       = appSettings;
  const profile = (typeof _getProfile === 'function') ? _getProfile(room.name) : {};

  const tenantName  = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const tenantEmail = profile.email || '';
  let   tenantDob   = profile.birthday || '';
  if (tenantDob && tenantDob.includes('-') && tenantDob.length === 10) {
    const [y, m, day] = tenantDob.split('-');
    tenantDob = `${day}.${m}.${y}`;
  }

  const _gem2 = room.gemeinschaftsraeume;
  const gemStr = (Array.isArray(_gem2) ? _gem2.join(', ') : (typeof _gem2 === 'string' ? _gem2 : '')) || '—';
  const _fmtEUR = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const schluessel = `Haustür \u00d7${room.haustuerschluessel || 1} \u00b7 Zimmer \u00d7${room.zimmerschluessel || 1}`;

  let kaltDisplay, gesamtDisplay;
  if (room.mietvertrag_pricing === 'kalt_nk' && room.kaltmiete) {
    const kalt = Number(room.kaltmiete) || 0;
    const nk   = Number(room.nk_pauschale) || 0;
    kaltDisplay   = `${_fmtEUR(kalt)} kalt + ${_fmtEUR(nk)} NK`;
    gesamtDisplay = _fmtEUR(kalt + nk);
  } else {
    const kalt = Number(room.kaltmiete) || Number(room.mietvertrag_miete) || Number(room.monatl_miete) || 0;
    const nk   = Number(room.nk_pauschale) || 0;
    kaltDisplay   = `${_fmtEUR(kalt + nk)} pauschal inkl. NK`;
    gesamtDisplay = _fmtEUR(kalt + nk);
  }

  const kaltBase = Number(room.kaltmiete || room.mietvertrag_miete || room.monatl_miete) || 0;
  const nkBase   = room.mietvertrag_pricing !== 'kalt_nk' ? (Number(room.nk_pauschale) || 0) : 0;
  const kaution  = room.kaution_override && room.kaution_default
    ? Number(room.kaution_default)
    : (kaltBase + nkBase) * 3;

  return `
    <div class="rm-prefilled">
      <div class="rm-prefilled__title">Pre-filled from room &amp; profile</div>
      <div class="rm-pre-row"><span>Room</span><span>${esc(room.name)}</span></div>
      <div class="rm-pre-row"><span>Größe</span><span>ca. ${room.flaeche_m2 || '—'} m\u00b2</span></div>
      <div class="rm-pre-row"><span>Gemeinschaft</span><span>${esc(gemStr)}</span></div>
      <div class="rm-pre-row"><span>Miete</span><span>${kaltDisplay}</span></div>
      <div class="rm-pre-row"><span>Gesamtmiete</span><span>${gesamtDisplay} / Monat</span></div>
      <div class="rm-pre-row"><span>Vermieter</span><span>${esc(s.vermieter_name || '—')}</span></div>
      <div class="rm-pre-row"><span>IBAN</span><span>${esc(s.iban || '—')}</span></div>
      <div class="rm-pre-row"><span>Schlüssel</span><span>${esc(schluessel)}</span></div>
    </div>

    <div class="rm-kaution-row">
      <div>
        <div class="rm-kaution-lbl">Kaution (§ 551 BGB)</div>
        <div class="rm-kaution-rule">3 \u00d7 Kaltmiete</div>
      </div>
      <div class="rm-kaution-val">${_fmtEUR(kaution)}</div>
    </div>

    <div class="rm-fields-title" style="margin-top:2px;">Mieterdaten</div>

    <div class="rm-field">
      <label>Name</label>
      <input class="rm-input" id="rv-name" value="${esc(tenantName)}" placeholder="Vor- und Nachname\u2026"/>
    </div>
    <div class="rm-field">
      <label>Adresse <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(manuell)</span></label>
      <input class="rm-input" id="rv-adr" placeholder="Aktuelle Adresse\u2026"/>
    </div>
    <div class="rm-field">
      <label>Geburtsdatum</label>
      <input class="rm-input" id="rv-dob" value="${esc(tenantDob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/>
    </div>
    <div class="rm-field">
      <label>E-Mail</label>
      <input class="rm-input" id="rv-email" type="email" value="${esc(tenantEmail)}" placeholder="mieter@beispiel.de"/>
    </div>

    <div class="rm-fields-title" style="margin-top:6px;">Mietzeit</div>

    <div class="rm-field">
      <label>Mietbeginn</label>
      <input class="rm-input" id="rv-start" type="date"/>
    </div>

    <div class="rm-field--toggle" style="margin-bottom:10px;">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Befristung</div>
          <div class="rm-toggle-sub" id="rv-befristung-sub">Unbefristet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="rv-befristung-btn"
          data-mode="unbefristet" onclick="_toggleRentalMvBefristung()">
          <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
          <span class="rm-pill-toggle__lbl" id="rv-befristung-lbl">Nein</span>
        </button>
      </div>
    </div>

    <div id="rv-befristung-details" style="display:none;">
      <div class="rm-field">
        <label>Mietende</label>
        <input class="rm-input" id="rv-end" type="date"/>
      </div>
      <div class="rm-field">
        <label>Befristungsgrund <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(§ 575 BGB \u2014 Pflicht)</span></label>
        <div style="display:flex;flex-direction:column;gap:7px;margin-top:2px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="rv-grund" value="eigenbedarf" checked
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateRentalMvGrundDetail()"/>
            Eigenbedarf
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="rv-grund" value="abriss"
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateRentalMvGrundDetail()"/>
            Abriss / wesentliche Umbaumaßnahmen
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="rv-grund" value="dienst"
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateRentalMvGrundDetail()"/>
            Dienstwohnung (§ 575 Abs. 1 Nr. 2 BGB)
          </label>
        </div>
      </div>
      <div class="rm-field" id="rv-eigenbedarf-wrap">
        <label>Eigenbedarfsperson <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(Pflicht nach BGH)</span></label>
        <input class="rm-input" id="rv-eigenbedarf-person"
          placeholder="z.\u202fB. Tochter des Vermieters, Eigennutzung durch Vermieter\u2026"/>
      </div>
    </div>

    <div class="rm-field" style="margin-top:4px;">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(optional)</span></label>
      <input class="rm-input" id="rv-sig" type="date"/>
    </div>`;
}

function _toggleRentalMvBefristung() {
  const btn     = document.getElementById('rv-befristung-btn');
  const lbl     = document.getElementById('rv-befristung-lbl');
  const sub     = document.getElementById('rv-befristung-sub');
  const details = document.getElementById('rv-befristung-details');
  if (!btn) return;
  const on      = btn.dataset.mode === 'unbefristet';
  btn.dataset.mode    = on ? 'befristet'   : 'unbefristet';
  lbl.textContent     = on ? 'Ja'          : 'Nein';
  sub.textContent     = on ? 'Befristet'   : 'Unbefristet';
  details.style.display = on ? '' : 'none';
}

function _updateRentalMvGrundDetail() {
  const val  = document.querySelector('input[name="rv-grund"]:checked')?.value;
  const wrap = document.getElementById('rv-eigenbedarf-wrap');
  if (wrap) wrap.style.display = val === 'eigenbedarf' ? '' : 'none';
}


/* ── PDF HTML RENDERER ────────────────────────────────────────────────────── */

function _renderRentalMietvertragHTML(d) {

  const fmtN = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur  = n => fmtN(n) + ' \u20ac';

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:62px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#aaa59e; margin-bottom:28px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:14px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:0; }
    .sec--lg { font-size:8.5px; margin-top:22px; }
    .sec--lg.sec--first { margin-top:0; }
    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; flex:1; line-height:1.55; }
    .kv-gap { height:10px; }
    .total-box { background:#f0e8d8; border-radius:3px; padding:9px 10px; display:flex; justify-content:space-between; align-items:center; margin-top:10px; margin-bottom:24px; }
    .total-box__label, .total-box__value { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:700; color:#8a6535; line-height:1; }
    .note { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; margin-top:10px; line-height:1.55; }
    .nk-intro { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; line-height:1.55; margin-top:7px; margin-bottom:10px; }
    .nk-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:24px; }
    .nk-item { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; padding:2.5px 0; line-height:1.4; }
    .nk-item--full { grid-column:1/-1; border-bottom:none; }
    .clause { margin-top:8px; }
    .clause--first { margin-top:52px; }
    .clause__title { font-family:'Lato',sans-serif; font-size:12px; font-weight:700; color:#4a4540; margin-bottom:2px; line-height:1.4; }
    .clause__body { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; line-height:1.55; }
    .inv-list { margin-top:6px; }
    .inv-list__hdr { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; }
    .inv-list__row { display:flex; justify-content:space-between; align-items:baseline; gap:14px; font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#1a1a1a; line-height:1.55; padding:3.5px 0; border-bottom:0.5px solid #f0ede8; }
    .inv-list__row:last-child { border-bottom:none; }
    .inv-list__name { flex:1 1 auto; }
    .inv-list__qty { flex:0 0 auto; font-variant-numeric:tabular-nums; color:#4a4540; }
    .inv-list__empty { font-family:'Lato',sans-serif; font-size:10px; color:#aaa59e; padding-top:6px; }
    .inv-table { width:100%; border-collapse:collapse; margin-top:6px; }
    .inv-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; text-align:left; }
    .inv-table td { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#1a1a1a; padding:3.5px 0; line-height:1.55; }
    .comment-label { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:48px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .comment-line { border-bottom:0.5px solid #e0dbd4; height:26px; margin-top:2px; }
    .sig-block { margin-top:52px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#aaa59e; margin-bottom:4px; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-write-gap { height:60px; }
    .sig-line { border:none; border-top:0.6px solid #3a3530; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }
  `;

  const hdr = room => `<div class="hdr"><span class="hdr__wordmark"></span><div class="hdr__room"><span class="hdr__room-label">Wohnung</span><span class="hdr__room-name">${room}</span></div></div>`;
  const ftr = n    => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${d.footerAdresse}</span><span>${n}</span></div></div>`;
  const kv  = (k,v)=> `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const sec = (t,lg,first) => `<div class="sec${lg?' sec--lg':''}${first?' sec--first':''}">${t}</div>`;
  const cl  = (num,title,body,first) => `<div class="clause${first?' clause--first':''}"><div class="clause__title">\u00a7\u00a0${num}\u2002${title}</div><div class="clause__body">${body}</div></div>`;

  const sigDate = d.unterzeichnungsDatum
    ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>`
    : '<div class="sig-date-label">Datum, Ort</div>';

  const sigBlock = () => `<div class="sig-block">
    <div class="sig-col">
      ${sigDate}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Vermieter</div><div class="sig-name">${d.vermieterSig}</div>
    </div>
    <div class="sig-col">
      ${sigDate}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter${hasMultiMieter ? ' 1' : ''}</div><div class="sig-name">${d.mieterName}</div>
    </div>
    ${d.hasMieter2 ? `<div class="sig-col" style="margin-top:28px;width:44%;">
      ${sigDate}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter 2</div><div class="sig-name">${d.mieterName2}</div>
    </div>` : ''}
    ${d.hasMieter3 ? `<div class="sig-col" style="margin-top:28px;width:44%;">
      ${sigDate}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter 3</div><div class="sig-name">${d.mieterName3}</div>
    </div>` : ''}
  </div>`;

  // Full §§ 1, 2 BetrKV list — broad / Hausverwaltung-safe for apartment rentals
  const NK_ITEMS = [
    'Laufende öffentliche Lasten (Grundsteuer)',
    'Wasserversorgung',
    'Entwässerung / Abwasser',
    'Betrieb der zentralen Heizungsanlage inkl. Abgasanlage',
    'Betrieb der zentralen Warmwasserversorgungsanlage',
    'Verbundene Heizungs- &amp; Warmwasserversorgungsanlage',
    'Personen- oder Lastenaufzug',
    'Straßenreinigung &amp; Müllbeseitigung',
    'Gebäudereinigung &amp; Ungezieferbekämpfung',
    'Gartenpflege',
    'Beleuchtung (Gemeinschaftsflächen)',
    'Schornsteinreinigung',
    'Sach- &amp; Haftpflichtversicherung',
    'Hauswart',
    'Gemeinschaftsantennenanlage / Breitbandkabelnetz',
    'Einrichtungen für die Wäschepflege',
    'Winterdienst',
  ];
  const nkRows = NK_ITEMS.map(i => `<div class="nk-item">${i}</div>`).join('') +
    `<div class="nk-item nk-item--full">Sonstige Betriebskosten i.\u202fs.\u202fd. \u00a7\u00a72 Nr.\u00a017 BetrKV (insbes. Wartung Heizung, Enthärtungsanlage, sonstige Anlagen)</div>`;

  const invRows = d.inventar.length
    ? d.inventar.map(i => `<div class="inv-list__row"><span class="inv-list__name">${i.gegenstand}</span><span class="inv-list__qty">${i.anzahl}\u00d7</span></div>`).join('')
    : `<div class="inv-list__empty">Kein Inventar hinterlegt</div>`;

  const hasMultiMieter = d.hasMieter2 || d.hasMieter3;

  const hasStaffel    = d.staffelAn && d.staffeln && d.staffeln.length > 0;
  const pOff          = hasStaffel ? 1 : 0;
  const staffelClause = hasStaffel
    ? cl('3', 'Staffelmiete',
        `Die monatliche Kaltmiete ist gem\u00e4\u00df \u00a7\u00a0557a BGB gestaffelt und betr\u00e4gt: Anfangsmiete ab ${d.mietbeginn || 'Mietbeginn'}: ${eur(d.anfangsmiete)}.` +
        d.staffeln.map(st => ` Ab ${st.datum}: ${eur(st.betrag)}.`).join('') +
        ` Jede Staffel gilt f\u00fcr mindestens zw\u00f6lf Monate. W\u00e4hrend einer laufenden Staffel ist eine Mieterh\u00f6hung nach \u00a7\u00a7\u00a0558, 559 BGB ausgeschlossen.`
      )
    : '';

  const subtitle = d.befristet
    ? 'Befristetes Mietverhältnis \u00b7 Wohnungsvermietung'
    : 'Unbefristetes Mietverhältnis \u00b7 Wohnungsvermietung';

  const mieteTopBlock = `
    ${sec('Miete &amp; Bankverbindung',true,false)}
    ${d.pricingMode==='kalt_nk'
      ? kv('Kaltmiete',eur(d.anfangsmiete||d.kaltmiete)+'\u2002/ Monat'+(hasStaffel?' (Staffelmiete \u2014 siehe \u00a7\u00a03)':''))
        + kv('Nebenkosten VZ',eur(d.nkVorauszahlung)+'\u2002/ Monat (Vorauszahlung)')
      : kv('Pauschalmiete',eur(d.gesamtmiete)+'\u2002/ Monat (inkl. NK)')
    }
    <div class="total-box"><span class="total-box__label">Gesamtmiete monatlich:</span><span class="total-box__value">${eur(d.gesamtmiete)}</span></div>`;

  const mieteRestBlock = `
    ${kv('F\u00e4lligkeit','Sp\u00e4testens 3.\u00a0Werktag des Monats (\u00a7\u00a0556b BGB)')}
    ${kv('Kaution',eur(d.kaution)+'\u2002(f\u00e4llig '+(d.kautionFaelText.startsWith('sofort') ? d.kautionFaelText+', \u00a7\u00a0551 BGB)' : d.kautionFaelText+' nach Vertragsunterschrift, \u00a7\u00a0551 BGB)'))}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber',d.kontoinhaber)}${d.bankname?kv('Bank',d.bankname):''}${kv('IBAN',d.iban)}${kv('BIC',d.bic)}
    <p class="note">Alle Zahlungen per \u00dcberweisung. Verwendungszweck: ${d.zimmerName} \u2013 Miete Monat Jahr / Kaution.</p>`;

  const page1 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(1)}
  <div class="content">
    <div class="doc-title">Mietvertrag</div>
    <div class="doc-subtitle">${subtitle}</div>
    ${sec('Vermieter',false,true)}
    ${kv('Name',d.vermieterName)}${kv('Adresse',d.vermieterAdresse)}
    ${d.vermieterEmail?kv('E-Mail',d.vermieterEmail):''}
    ${sec('Mieter'+(hasMultiMieter?' 1':''),false,false)}
    ${kv('Name',d.mieterName)}
    ${kv('Adresse',d.mieterAdresse)}
    ${kv('Geburtsdatum',d.mieterGeburtsdatum||'')}
    ${kv('E-Mail',d.mieterEmail||'')}
    ${d.hasMieter2 ? sec('Mieter 2',false,false) : ''}
    ${d.hasMieter2 ? kv('Name',d.mieterName2) : ''}
    ${d.hasMieter2 ? kv('Adresse',d.mieterAdresse2||'') : ''}
    ${d.hasMieter2 ? kv('Geburtsdatum',d.mieterGeburtsdatum2||'') : ''}
    ${d.hasMieter2 ? kv('E-Mail',d.mieterEmail2||'') : ''}
    ${d.hasMieter3 ? sec('Mieter 3',false,false) : ''}
    ${d.hasMieter3 ? kv('Name',d.mieterName3) : ''}
    ${d.hasMieter3 ? kv('Adresse',d.mieterAdresse3||'') : ''}
    ${d.hasMieter3 ? kv('Geburtsdatum',d.mieterGeburtsdatum3||'') : ''}
    ${d.hasMieter3 ? kv('E-Mail',d.mieterEmail3||'') : ''}
    ${sec('Mietobjekt',false,false)}
    ${kv('Adresse',d.objektAdresse)}${kv('PLZ / Ort',d.objektPLZOrt)}${kv('Bezeichnung',d.zimmerName)}
    ${d.etage ? kv('Etage',d.etage) : ''}
    ${kv('Wohnungsgr\u00f6\u00dfe','ca.\u00a0'+d.zimmerFlaeche+'\u00a0m\u00b2')}
    ${kv('Mitgenutzte R\u00e4ume',d.gemeinschaftsraeume||'\u2014')}
    ${kv('M\u00f6blierung','M\u00f6bliert\u2002\u00b7\u2002Inventar siehe Anlage\u00a0A')}
    ${sec('Mietzeit',false,false)}
    ${kv('Mietbeginn',d.mietbeginn||'\u2014')}
    ${!d.befristet
      ? kv('K\u00fcndigung','3\u00a0Monate (Mieter) / gestaffelt (Vermieter) \u00b7 \u00a7\u00a0573c BGB \u00b7 Schriftform')
        + kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verl\u00e4ngerung')
      : ''}
    ${mieteTopBlock}
  </div>
</div>`;

  // PAGE 1B — always: Fälligkeit, Kaution, Bankverbindung
  const page1b = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(2)}
  <div class="content">
    ${mieteRestBlock}
  </div>
</div>`;

  const pageOffset = 1;

  const page2 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(2+pageOffset)}
  <div class="content">
    ${sec('Betriebskosten gem. \u00a7\u00a71,\u00a02 BetrKV',true,true)}
    <p class="nk-intro">Neben der Kaltmiete trägt der Mieter anteilig folgende Betriebskosten gemäß §§\u00a01,\u00a02 BetrKV in ihrer jeweils geltenden Fassung. Umlageschlüssel: Wohnfläche der Mietwohnung im Verhältnis zur Gesamtwohnfläche des Gebäudes. Heizung und Warmwasser werden nach den Vorschriften der Heizkostenverordnung abgerechnet. Entstehen nach Vertragsschluss neue Betriebskosten i.\u202fS.\u202fd. BetrKV, können diese vom Vermieter auf den Mieter umgelegt werden.</p>
    <div class="nk-grid">${nkRows}</div>
    ${cl('1',d.befristet?'Befristung und Beendigung':'Nutzung des Mietobjekts',
      d.befristet
        ? `Das Mietverhältnis ist gemäß \u00a7\u00a0575 Abs.\u00a01 BGB befristet und endet am ${d.mietende} automatisch ohne Kündigung (\u00a7\u00a0545 BGB findet keine Anwendung). Die Wohnung darf ausschließlich zu Wohnzwecken durch den namentlich genannten Mieter genutzt werden.`
        : 'Die Wohnung darf ausschließlich zu Wohnzwecken durch den namentlich genannten Mieter genutzt werden. Der Mieter ist verpflichtet, die Wohnung und die Gemeinschaftsflächen schonend, sauber und ordnungsgemäß zu behandeln, ausreichend zu heizen, zu lüften und von Ungeziefer freizuhalten. Mängel sind dem Vermieter unverzüglich in Textform anzuzeigen.',
      true)}
    ${cl('2','Kündigung',
      d.befristet
        ? 'Das befristete Mietverhältnis endet am '+d.mietende+' automatisch ohne Kündigung (\u00a7\u00a0575 BGB). Befristungsgrund: '+d.grundLabel+(d.eigenbedarfPerson?' \u2014 '+d.eigenbedarfPerson:'')+'. Eine ordentliche Kündigung ist ausgeschlossen; die außerordentliche Kündigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unberührt. Im Falle einer Verlängerung beträgt die Kündigungsfrist für den Mieter 3\u00a0Monate zum Monatsende.'
        : 'Die ordentliche Kündigung richtet sich nach \u00a7\u00a0573c BGB. Kündigungsfrist für den Mieter: 3\u00a0Monate zum Monatsende. Für den Vermieter gilt die gesetzlich gestaffelte Frist. Die Kündigung bedarf der Schriftform. Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen. Die außerordentliche Kündigung aus wichtigem Grund bleibt unberührt.')}
    ${staffelClause}
    ${cl(String(3+pOff),'Untervermietung',
      'Eine Untervermietung oder sonstige Überlassung des Mietobjekts an Dritte ist nicht gestattet.')}
    ${cl(String(4+pOff),'Schlüsselübergabe',
      `Der Mieter erhält bei Einzug ${d.hausstuerschluessel}\u00a0Haustürschlüssel und ${d.zimmerschluessel}\u00a0Zimmerschlüssel. Weitere Schlüssel bedürfen der vorherigen Zustimmung (Textform). Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs. Alle Schlüssel sind bei Auszug zurückzugeben.`)}
    ${cl(String(5+pOff),'Kaution',
      `Der Mieter überweist die Kaution von ${eur(d.kaution)} ${d.kautionFaelText.startsWith('sofort') ? d.kautionFaelText : d.kautionFaelText + ' nach Unterzeichnung dieses Vertrages'} auf das oben genannte Konto. Der Vermieter legt die Barkaution getrennt von seinem Vermögen auf einem Kautionskonto an (\u00a7\u00a0551 BGB). Rückzahlung nach Prüfung des Zustands bei Auszug.`)}
    ${cl(String(6+pOff),'Schönheitsreparaturen &amp; Kleinreparaturen',
      'Schönheitsreparaturen je nach Abnutzungsgrad auf Kosten des Mieters. Kleinreparaturen an häufig zugänglichen Gegenständen bis 150\u00a0\u20ac pro Maßnahme, max. 8\u202f% der Jahres-Nettokaltmiete p.\u202fa.')}
    ${cl(String(7+pOff),'Tierhaltung',
      'Kleintiere ohne Belästigungspotenzial (Zierfische, Kleinnager) sind erlaubt. Alle weiteren Tiere bedürfen der Zustimmung (Textform).')}
    ${cl(String(8+pOff),'Betreten des Mietobjekts',
      'Bei Gefahr im Verzug jederzeit. Zur Vorbereitung von Verkauf oder Weitervermietung werktags 9:00–12:00 und 15:00–19:00\u202fUhr, mind. 2\u00a0Werktage Vorankündigung (Textform).')}
  </div>
</div>`;

  const page3 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(3+pageOffset)}
  <div class="content">
    ${cl(String(9+pOff),'Rückgabe bei Vertragsende',
      'Vollständig geräumt, gereinigt, in vertragsgemäßem Zustand, alle Schlüssel. Bauliche Änderungen sind rückzubauen. Ein Übergabeprotokoll wird erstellt und beidseitig unterzeichnet.',true)}
    ${cl(String(10+pOff),'Haftpflichtversicherung',
      'Der Mieter unterhält für die Dauer des Mietverhältnisses eine private Haftpflichtversicherung und weist sie auf Verlangen nach.')}
    ${cl(String(11+pOff),'Hausordnung',
      'Rauchen ist im gesamten Gebäude nicht gestattet. Nachtruhe gilt von 22:00–07:00\u202fUhr. Die Hausordnung ist Bestandteil dieses Vertrages (Anlage\u00a0B).')}
    ${cl(String(12+pOff),'Datenschutz',
      'Personenbezogene Daten werden gem. Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO zur Vertragsabwicklung verarbeitet, nicht an Dritte weitergegeben und 11\u00a0Jahre nach Vertragsende gelöscht.')}
    ${cl(String(13+pOff),'Sonstige Vereinbarungen',
      'Mündliche Nebenabreden bestehen nicht. Änderungen bedürfen der Schriftform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Gerichtsstand ist '+(d.gerichtsstand || '______________')+'.')}
    <div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div><div class="comment-line"></div>
    ${sigBlock()}
  </div>
</div>`;

  const page4 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(4+pageOffset)}
  <div class="content">
    ${sec('Anlage A \u2014 Inventar',true,false)}
    <div class="inv-list">
      <div class="inv-list__hdr"><span>Gegenstand</span><span>Anzahl</span></div>
      ${invRows}
    </div>
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Mietvertrag \u2014 ${d.zimmerName}</title>
<style>${CSS}</style></head>
<body>${page1}${page1b}${page2}${page3}${page4}</body></html>`;
}


/* ── PDF GENERATOR ────────────────────────────────────────────────────────── */

async function _generateRentalMietvertragPDF() {
  const container = document.getElementById('_pdfRenderContainer');
  if (!container) return;
  const pages = container.querySelectorAll('.pdf-page');
  if (!pages.length) return;
  const { jsPDF } = window.jspdf;
  const pdf  = new jsPDF({ unit:'px', format:'a4', orientation:'portrait' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false });
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfW, pdfH);
  }
  const roomName   = container.querySelector('.hdr__room-name')?.textContent?.trim() || 'Zimmer';
  const mieterName = [...(container.querySelectorAll('.kv__v')||[])]
    .find(el => el.previousElementSibling?.textContent?.includes('Name'))
    ?.textContent?.trim() || 'Mieter';
  pdf.save(`Mietvertrag_${roomName}_${mieterName.replace(/\s+/g,'_')}.pdf`);
}


/* ═══════════════════════════════════════════════════════════════════════════
 *  REPLACE IN rentals _openContract():
 *
 *  } else if (type === 'mietvertrag') {
 *    typeLbl.textContent  = 'Mietvertrag';
 *    titleLbl.textContent = `New contract — ${apt.name}`;
 *    subLbl.textContent   = `${apt.flaeche_m2 ? apt.flaeche_m2 + ' m²' : ''}`;
 *    body.innerHTML       = _contractBodyRentalMietvertrag(apt);
 *    footer.innerHTML     = `
 *      <button class="rm-btn rm-btn--cancel" id="contractCancelBtn">Cancel</button>
 *      <button class="rm-btn rm-btn--pdf" id="contractPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
 *
 *    document.getElementById('contractPdfBtn').addEventListener('click', async () => {
 *      const apt2        = getRentalById(_contractAptId); if (!apt2) return;
 *      const mieterName  = document.getElementById('rv-name')?.value.trim();
 *      const mieterAdr   = document.getElementById('rv-adr')?.value.trim();
 *      const mieterDob   = document.getElementById('rv-dob')?.value.trim();
 *      const mieterEmail = document.getElementById('rv-email')?.value.trim();
 *      const startVal    = document.getElementById('rv-start')?.value;
 *      const sigVal      = document.getElementById('rv-sig')?.value;
 *      const befristet   = document.getElementById('rv-befristung-btn')?.dataset.mode === 'befristet';
 *      const endVal      = befristet ? document.getElementById('rv-end')?.value : null;
 *      const grundVal    = befristet ? (document.querySelector('input[name="rv-grund"]:checked')?.value || '') : '';
 *      const eigenbedarfPerson = grundVal === 'eigenbedarf'
 *        ? document.getElementById('rv-eigenbedarf-person')?.value.trim() : '';
 *      if (!mieterName) { alert('Bitte Mietername eingeben.'); return; }
 *      if (!startVal)   { alert('Bitte Mietbeginn auswählen.'); return; }
 *      if (befristet && !endVal) { alert('Bitte Mietende angeben.'); return; }
 *      if (befristet && grundVal === 'eigenbedarf' && !eigenbedarfPerson) {
 *        alert('Bitte Eigenbedarfsperson angeben (gesetzliche Pflicht).'); return;
 *      }
 *      const data = _buildRentalMietvertragData(apt2, appSettings, {
 *        mieterName, mieterAdr, mieterDob, mieterEmail, startVal, sigVal,
 *        befristet, endVal, grundVal, eigenbedarfPerson,
 *      });
 *      const html = _renderRentalMietvertragHTML(data);
 *      let container = document.getElementById('_pdfRenderContainer');
 *      if (container) container.remove();
 *      container = document.createElement('div');
 *      container.id = '_pdfRenderContainer';
 *      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
 *      container.innerHTML = html;
 *      document.body.appendChild(container);
 *      await document.fonts.ready;
 *      if (window.innerWidth >= 701) {
 *        _openPdfPreview('Mietvertrag', _generateRentalMietvertragPDF);
 *      } else {
 *        await _generateRentalMietvertragPDF();
 *      }
 *    });
 *
 * ═══════════════════════════════════════════════════════════════════════════ */
