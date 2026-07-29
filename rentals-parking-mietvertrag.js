/* ═══════════════════════════════════════════════════════════════════════════
 *  RENTALS — PARKING MIETVERTRAG PDF GENERATOR
 *  rentals-parking-mietvertrag.js
 *
 *  Standalone file. Load after rentals-tab-parking.js in rentals-index.html.
 *  Wires the Generate PDF button in the parking contract modal.
 *
 *  Contains:
 *    _buildPkMietvertragData()    — data builder
 *    _renderPkMietvertragHTML()   — 3-page PDF HTML (p3 = Anlage 1 Stellplatzordnung)
 *    _generatePkMietvertragPDF()  — wires pkMvPdfBtn, renders + saves
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ── DATA BUILDER ─────────────────────────────────────────────────────────── */

function _buildPkMietvertragData(spot, pr, sk, s, {
  mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel,
  mieterName2 = '', mieterAdr2 = '', mieterDob2 = '', mieterEmail2 = '', mieterTel2 = '',
  mieterName3 = '', mieterAdr3 = '', mieterDob3 = '', mieterEmail3 = '', mieterTel3 = '',
  startVal, sigVal,
  befristet = false, endVal = null,
  kennzeichen = '', fahrzeug = '',
  kautionVal = null, kautionFael = '5',
  staffelAn = false, staffeln = [], anfangsmiete = null,
}) {
  const fmt = d => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' +
           dt.getFullYear();
  };

  const isTG    = (spot.parking_type || '') === 'Tiefgarage';
  const miete   = Number(pr.miete) || 0;
  const pkSk    = sk.parking_schluessel ?? 1;
  const hbSk    = sk.haustuerschluessel ?? 0;

  const stellplatzLabel = isTG
    ? 'Tiefgaragenstellplatz'
    : (spot.parking_type === 'Stellplatz' ? 'Außenstellplatz'
    : (spot.parking_type === 'Einzelgarage' ? 'Einzelgarage'
    : (spot.parking_type || 'Stellplatz')));

  const inAnText  = isTG ? 'in der Tiefgarage' : 'an';
  const waschText = isTG
    ? 'Das Waschen des PKWs in der Tiefgarage ist untersagt.'
    : 'Das Waschen des PKWs auf dem Stellplatz ist untersagt.';
  const anlageText = isTG ? 'Garagenordnung' : 'Stellplatzordnung';

  // Schlüssel sentence
  let schlusselText = `Es wird/werden ${pkSk}\u00a0Parkplatzschlüssel ausgehändigt.`;
  if (isTG && hbSk > 0) {
    schlusselText = `Es wird/werden ${pkSk}\u00a0Parkplatzschlüssel sowie ${hbSk}\u00a0Hebeböhnenschlüssel ausgehändigt.`;
  }

  return {
    vermieterName:    s.vermieter_name    || '',
    vermieterAdresse: s.vermieter_adresse || '',
    vermieterEmail:   s.vermieter_email   || '',
    vermieterSig:     s.vermieter_name    || '',
    kontoinhaber:     s.kontoinhaber      || '',
    bankname:         s.bankname          || '',
    iban:             s.iban              || '',
    bic:              s.bic               || '',
    mieterName:       mieterName  || '',
    mieterAdresse:    mieterAdr   || '',
    mieterDob:        mieterDob   || '',
    mieterEmail:      mieterEmail || '',
    mieterTel:        mieterTel   || '',
    hasMieter2:       !!(mieterName2 && mieterName2.trim()),
    mieterName2:      mieterName2 || '',
    mieterAdresse2:   mieterAdr2  || '',
    mieterDob2:       mieterDob2  || '',
    mieterEmail2:     mieterEmail2 || '',
    mieterTel2:       mieterTel2  || '',
    hasMieter3:       !!(mieterName3 && mieterName3.trim()),
    mieterName3:      mieterName3 || '',
    mieterAdresse3:   mieterAdr3  || '',
    mieterDob3:       mieterDob3  || '',
    mieterEmail3:     mieterEmail3 || '',
    mieterTel3:       mieterTel3  || '',
    stellplatzNr:     spot.name   || '',
    stellplatzLabel,
    inAnText,
    spotAdresse:      (spot.adresse || '') + (spot.plz_ort ? ', ' + spot.plz_ort : ''),
    gerichtsstand:    spot.gerichtsstand || 'Mainz',
    miete,
    schlusselText,
    waschText,
    anlageText,
    isTG,
    mietbeginn:  startVal ? fmt(new Date(startVal)) : '',
    befristet,
    mietende:    befristet && endVal ? fmt(new Date(endVal)) : '',
    kennzeichen: kennzeichen || '',
    fahrzeug:    fahrzeug    || '',
    unterzeichnungsDatum: sigVal ? fmt(new Date(sigVal)) : '',
    kaution:         kautionVal !== null && kautionVal !== '' ? Number(kautionVal) : miete * 3,
    kautionFaelText: kautionFael === 'sofort'
      ? 'sofort nach Vertragsunterzeichnung'
      : `binnen ${kautionFael}\u00a0Tagen nach Vertragsunterzeichnung`,
    staffelAn,
    staffeln:     staffeln.map(s => ({ datum: s.datum || '', betrag: Number(s.betrag) || 0 })),
    anfangsmiete: anfangsmiete !== null ? Number(anfangsmiete) : miete,
  };
}


/* ── PDF HTML RENDERER ────────────────────────────────────────────────────── */

function _renderPkMietvertragHTML(d) {

  const hasMultiMieter = d.hasMieter2 || d.hasMieter3;
  const fmtEUR = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac';

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da;
      display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400;
      color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__unit { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__unit-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400;
      letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__unit-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400;
      color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif;
      font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:62px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400;
      color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300;
      color:#aaa59e; margin-bottom:28px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em;
      text-transform:uppercase; color:#4a4540; margin-top:14px; padding-top:2px;
      padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:0; }
    .sec--lg { font-size:8.5px; margin-top:22px; }
    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530;
      min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a;
      flex:1; line-height:1.55; }
    .kv-gap { height:8px; }
    .note { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; margin-top:10px; line-height:1.55; }
    .staffel-table { width:100%; border-collapse:collapse; margin-top:6px; margin-bottom:14px; }
    .staffel-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; text-align:left; }
    .staffel-table td { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#1a1a1a; padding:3.5px 0; line-height:1.55; }
    .total-box { background:#f0e8d8; border-radius:3px; padding:9px 10px;
      display:flex; justify-content:space-between; align-items:center;
      margin-top:10px; margin-bottom:16px; }
    .total-box__label, .total-box__value { font-family:'Lato',sans-serif;
      font-size:10.5px; font-weight:700; color:#8a6535; line-height:1; }
    .clause { margin-top:10px; }
    .clause--first { margin-top:0; }
    .clause__title { font-family:'Lato',sans-serif; font-size:12px; font-weight:700;
      color:#4a4540; margin-bottom:2px; line-height:1.4; }
    .clause__body { font-family:'Lato',sans-serif; font-size:12px; font-weight:300;
      color:#3a3530; line-height:1.6; }
    .sig-block { margin-top:48px; display:flex; flex-wrap:wrap; justify-content:space-between; row-gap:8px; }
    .sig-col { width:44%; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300;
      color:#aaa59e; margin-bottom:4px; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic;
      font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-write-gap { height:56px; }
    .sig-write-gap--short { height:38px; }
    .sig-ort-gap { height:20px; }
    .sig-ort-line { border:none; border-top:0.6px solid #3a3530; margin-bottom:5px; }
    .sig-line { border:none; border-top:0.6px solid #3a3530; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300;
      color:#3a3530; margin-top:4px; }
    .anlage-note { font-family:'Lato',sans-serif; font-size:10px; font-weight:300;
      color:#3a3530; margin-top:20px; line-height:1.55;
      border-top:0.5px solid #e8dbc5; padding-top:10px; }
    .anlage-title { font-family:'Playfair Display',serif; font-size:16px; font-weight:400;
      color:#1a1a1a; margin-bottom:3px; }
    .anlage-subtitle { font-family:'Lato',sans-serif; font-size:9px; font-weight:300;
      letter-spacing:0.1em; text-transform:uppercase; color:#aaa59e; margin-bottom:22px; }
    .ordnung-par { margin-top:10px; }
    .ordnung-par__title { font-family:'Lato',sans-serif; font-size:10px; font-weight:700;
      color:#4a4540; margin-bottom:2px; }
    .ordnung-par__body { font-family:'Lato',sans-serif; font-size:10px; font-weight:300;
      color:#3a3530; line-height:1.6; }
    .ordnung-footer { font-family:'Lato',sans-serif; font-size:9px; font-weight:300;
      font-style:italic; color:#aaa59e; margin-top:18px; padding-top:10px;
      border-top:0.5px solid #e8dbc5; }
  `;

  const hdr = () => `
    <div class="hdr">
      <span class="hdr__wordmark">${d.isTG ? 'Garagenmietvertrag' : 'Stellplatzmietvertrag'}</span>
      <div class="hdr__unit">
        <span class="hdr__unit-label">${d.isTG ? 'Tiefgarage' : 'Stellplatz'}</span>
        <span class="hdr__unit-name">${d.stellplatzNr}</span>
      </div>
    </div>`;

  const ftr = n => `
    <div class="ftr">
      <hr class="ftr__rule"/>
      <div class="ftr__row">
        <span>${d.spotAdresse}</span>
        <span>${n}</span>
      </div>
    </div>`;

  const kv  = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const sec = (t, lg, first) => `<div class="sec${lg?' sec--lg':''}${first?' sec--first':''}">${t}</div>`;
  const cl  = (num, title, body, first) =>
    `<div class="clause${first?' clause--first':''}">
      <div class="clause__title">\u00a7\u00a0${num}\u2002${title}</div>
      <div class="clause__body">${body}</div>
    </div>`;

  const sigDate = d.unterzeichnungsDatum
    ? `<div class="sig-prefill">${d.gerichtsstand}, ${d.unterzeichnungsDatum}</div><div class="sig-write-gap"></div>`
    : '<div class="sig-ort-gap"></div><hr class="sig-ort-line"/><div class="sig-date-label">Ort, Datum</div><div class="sig-write-gap sig-write-gap--short"></div>';
  const mieterNamesList = [d.mieterName, d.hasMieter2 ? d.mieterName2 : '', d.hasMieter3 ? d.mieterName3 : ''].filter(Boolean);
  const sigBlock = () => `
    <div class="sig-block">
      <div class="sig-col">
        ${sigDate}
        <hr class="sig-line"/>
        <div class="sig-role">Vermieter</div>
        <div class="sig-name">${d.vermieterSig}</div>
      </div>
      <div class="sig-col">
        ${sigDate}
        <hr class="sig-line"/>
        <div class="sig-role">Mieter</div>
        <div class="sig-name">${mieterNamesList.join('<br/>')}</div>
      </div>
    </div>`;

  const subtitle = d.isTG ? 'Garagenmietvertrag \u00b7 Tiefgaragenstellplatz' : 'Stellplatzmietvertrag \u00b7 Stellplatzvermietung';

  /* ── PAGE 1 ── */
  const page1 = `<div class="pdf-page page">
  ${hdr()}${ftr(1)}
  <div class="content">
    <div class="doc-title">${d.isTG ? 'Garagenmietvertrag' : 'Stellplatzmietvertrag'}</div>
    <div class="doc-subtitle">${subtitle}</div>

    ${sec('Vermieter', false, true)}
    ${kv('Name',    d.vermieterName)}
    ${kv('Adresse', d.vermieterAdresse)}
    ${d.vermieterEmail ? kv('E-Mail', d.vermieterEmail) : ''}

    ${sec('Mieter' + (hasMultiMieter ? '\u00a01' : ''), false, false)}
    ${kv('Name',    d.mieterName)}
    ${kv('Adresse', d.mieterAdresse)}
    ${d.mieterDob   ? kv('Geburtsdatum', d.mieterDob)   : ''}
    ${d.mieterEmail ? kv('E-Mail',       d.mieterEmail) : ''}
    ${d.mieterTel   ? kv('Telefon',      d.mieterTel)   : ''}

    ${d.hasMieter2 ? sec('Mieter\u00a02', false, false) : ''}
    ${d.hasMieter2 ? kv('Name',    d.mieterName2) : ''}
    ${d.hasMieter2 ? kv('Adresse', d.mieterAdresse2) : ''}
    ${d.hasMieter2 && d.mieterDob2   ? kv('Geburtsdatum', d.mieterDob2)   : ''}
    ${d.hasMieter2 && d.mieterEmail2 ? kv('E-Mail',       d.mieterEmail2) : ''}
    ${d.hasMieter2 && d.mieterTel2   ? kv('Telefon',      d.mieterTel2)   : ''}

    ${sec('Mietobjekt', false, false)}
    ${kv('Bezeichnung', d.stellplatzLabel + '\u00a0Nr.\u00a0' + d.stellplatzNr)}
    ${kv('Adresse',     d.spotAdresse)}

    ${sec('Mietzeit', false, false)}
    ${kv('Mietbeginn', d.mietbeginn || '\u2014')}
    ${kv('Mindestlaufzeit', '1\u00a0Jahr ab Mietbeginn \u00b7 keine Kündigung vor Ende')}
    ${d.mietende ? kv('Festes Mietende', d.mietende) : ''}
    ${kv('Kündigung danach', '3\u00a0Monate zum Quartalsende \u00b7 §\u00a0580a BGB')}

    ${sec('Miete', false, false)}
    ${kv('Monatliche Miete', fmtEUR(d.anfangsmiete) + (d.staffelAn && d.staffeln.length ? '\u2002(Staffelmiete \u2014 siehe \u00a7\u00a06)' : ''))}
    <div class="total-box">
      <span class="total-box__label">Monatliche Miete:</span>
      <span class="total-box__value">${fmtEUR(d.anfangsmiete)}</span>
    </div>

    ${d.kennzeichen || d.fahrzeug ? `
    ${sec('Fahrzeug', false, false)}
    ${d.kennzeichen ? kv('Kennzeichen', d.kennzeichen) : ''}
    ${d.fahrzeug    ? kv('Fahrzeugtyp', d.fahrzeug)    : ''}
    ` : ''}
  </div>
</div>`;

  /* ── PAGE 2 (Daten-Fortsetzung: Mieter 3 + Bankverbindung) ── */
  const pageData = `<div class="pdf-page page">
  ${hdr()}${ftr(2)}
  <div class="content">

    ${d.hasMieter3 ? sec('Mieter\u00a03', false, true) : ''}
    ${d.hasMieter3 ? kv('Name',    d.mieterName3) : ''}
    ${d.hasMieter3 ? kv('Adresse', d.mieterAdresse3) : ''}
    ${d.hasMieter3 && d.mieterDob3   ? kv('Geburtsdatum', d.mieterDob3)   : ''}
    ${d.hasMieter3 && d.mieterEmail3 ? kv('E-Mail',       d.mieterEmail3) : ''}
    ${d.hasMieter3 && d.mieterTel3   ? kv('Telefon',      d.mieterTel3)   : ''}

    ${sec('Zahlung &amp; Bankverbindung', true, !d.hasMieter3)}
    ${kv('Fälligkeit',   'Spätestens 3.\u00a0Werktag des Monats')}
    ${kv('Kaution', fmtEUR(d.kaution) + '\u2002(fällig ' + d.kautionFaelText + ')')}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber', d.kontoinhaber)}
    ${kv('Bank',         d.bankname)}
    ${kv('IBAN',         d.iban)}
    ${kv('BIC',          d.bic)}
    <p class="note">Alle Zahlungen per \u00dcberweisung. Verwendungszweck: ${d.mieterName} \u2013 ${d.stellplatzNr} \u2013 Miete Monat Jahr / Kaution.</p>

  </div>
</div>`;

  /* ── PAGE 3 (Klauseln + Unterschriften) ── */
  const mietbeginnText = d.mietbeginn ? ` am ${d.mietbeginn}` : '';

  const mindestEnd = d.mietende || '(1\u00a0Jahr nach Mietbeginn)';
  const laufzeitClause = `Das Mietverhältnis beginnt${mietbeginnText} und ist fest abgeschlossen bis zum ${mindestEnd} (Mindestlaufzeit). Eine Kündigung während der Mindestlaufzeit ist ausgeschlossen. Nach Ablauf der Mindestlaufzeit l\u00e4uft der Vertrag auf unbestimmte Zeit weiter und kann von beiden Parteien ohne Angabe von Gr\u00fcnden mit einer Frist von 3\u00a0Monaten zum Quartalsende schriftlich gek\u00fcndigt werden (§\u00a0580a BGB).`;

  const page2 = `<div class="pdf-page page">
  ${hdr()}${ftr(3)}
  <div class="content">

    ${cl('1', 'Mietdauer und Kündigung', laufzeitClause, true)}

    ${cl('2', 'Fristlose Kündigung',
      'Der Vermieter kann das Mietverhältnis fristlos kündigen, wenn der Mieter mit 2\u00a0Monatsmieten im Rückstand ist (§\u00a0543 Abs.\u00a02 Nr.\u00a03 BGB).')}

    ${cl('3', 'Nutzung des Stellplatzes',
      `Der ${d.stellplatzLabel} darf ausschließlich zum Abstellen eines privaten Kraftfahrzeugs genutzt werden. Eine Untervermietung oder Überlassung an Dritte ist nicht gestattet. ${d.waschText}`)}

    ${cl('4', 'Schlüsselübergabe',
      `${d.schlusselText} Die Schlüssel sind bei Mietende zurückzugeben. Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs.`)}

    ${cl('5', 'Haftung',
      'Vom Vermieter wird für eventuelle Beschädigungen an dem abgestellten PKW oder Diebstahl keine Haftung übernommen. Der Mieter wird gebeten, eine Fahrzeughaftpflichtversicherung bzw. Kaskoversicherung zu unterhalten.')}

    ${(() => {
      const hasStaffel = d.staffelAn && d.staffeln.length > 0;
      const pKaution   = hasStaffel ? 7 : 6;
      const pZahlung   = hasStaffel ? 8 : 7;
      const pSchrift   = hasStaffel ? 9 : 8;
      const pSonstige  = hasStaffel ? 10 : 9;
      const staffelClause = hasStaffel ? cl('6', 'Staffelmiete',
        `Die monatliche Miete ist gem\u00e4\u00df \u00a7\u00a0557a BGB gestaffelt und betr\u00e4gt: Anfangsmiete ab ${d.mietbeginn || 'Mietbeginn'}: ${fmtEUR(d.anfangsmiete)}.` +
        d.staffeln.map(st => ` Ab ${st.datum}: ${fmtEUR(st.betrag)}.`).join('') +
        ` Jede Staffel gilt f\u00fcr mindestens zw\u00f6lf Monate. W\u00e4hrend einer laufenden Staffel ist eine Mieterh\u00f6hung nach \u00a7\u00a7\u00a0558, 559 BGB ausgeschlossen. Die jeweils geltende Staffelmiete ist zum 3.\u00a0Werktag des ersten Monats der neuen Staffel f\u00e4llig.`
      ) : '';
      return `
    ${staffelClause}

    ${cl(String(pKaution), 'Kaution',
      `Der Mieter leistet eine Kaution von ${fmtEUR(d.kaution)} ${d.kautionFaelText}. Der Vermieter legt die Barkaution getrennt von seinem Vermögen auf einem Kautionskonto an (\u00a7\u00a0551 BGB). Die Kaution wird nach Beendigung des Mietverhältnisses und Prüfung des Zustands des Stellplatzes zurückerstattet. Schäden, die der Mieter zu vertreten hat, können von der Kaution abgezogen werden.`)}

    ${cl(String(pZahlung), 'Zahlungsweise',
      'Die Miete ist im Voraus, spätestens am 3.\u00a0Werktag des Monats, durch Überweisung auf das oben genannte Konto zu entrichten. Verwendungszweck: Stellplatz ' + d.stellplatzNr + ' \u2013 Miete Monat Jahr / Kaution.')}

    ${cl(String(pSchrift), 'Schriftform',
      'Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Mündliche Nebenabreden bestehen nicht. Gerichtsstand ist ' + d.gerichtsstand + '.')}

    ${cl(String(pSonstige), 'Sonstige Vereinbarungen',
      'Sollten einzelne Bestimmungen dieses Vertrages unwirksam sein, bleibt der Vertrag im Übrigen wirksam.')}`;
    })()}

    <div class="anlage-note">
      1\u00a0Anlage: ${d.anlageText} ist Bestandteil dieses Mietvertrages.
    </div>

    ${sigBlock()}
  </div>
</div>`;

  const page3 = `<div class="pdf-page page">
  ${hdr()}${ftr(4)}
  <div class="content">
    <div class="anlage-title">Anlage 1</div>
    <div class="anlage-subtitle">Stellplatz- und Garagenordnung</div>

    <div class="ordnung-par">
      <div class="ordnung-par__title">§ 1 Nutzung</div>
      <div class="ordnung-par__body">Der Stellplatz darf ausschließlich zum Abstellen eines zugelassenen privaten Kraftfahrzeugs genutzt werden. Das Abstellen von Fahrrädern, Motorrädern, Anhängern oder sonstigen Gegenständen ist nur mit ausdrücklicher schriftlicher Genehmigung des Vermieters gestattet. Eine Nutzung als Lager- oder Werkstattfläche ist untersagt.</div>
    </div>

    <div class="ordnung-par">
      <div class="ordnung-par__title">§ 2 Fahrzeuge</div>
      <div class="ordnung-par__body">Es darf nur das im Mietvertrag eingetragene Fahrzeug abgestellt werden. Fahrzeuge ohne gültige Zulassung, Wracks sowie nicht verkehrssichere Fahrzeuge sind nicht gestattet. Der Mieter hat sicherzustellen, dass abgestellte Fahrzeuge keine Betriebsstoffe verlieren. Entstehende Reinigungskosten trägt der Mieter.</div>
    </div>

    <div class="ordnung-par">
      <div class="ordnung-par__title">§ 3 Ordnung und Sauberkeit</div>
      <div class="ordnung-par__body">Der Mieter hält seinen Stellplatz sauber und frei von Müll. Gemeinschaftsflächen, Zufahrten und Feuerwehrzufahrten sind jederzeit freizuhalten. Das Waschen von Fahrzeugen auf dem Stellplatz ist untersagt.</div>
    </div>

    <div class="ordnung-par">
      <div class="ordnung-par__title">§ 4 Brandschutz und Sicherheit</div>
      <div class="ordnung-par__body">Das Lagern von Kraftstoff, brennbaren Materialien oder sonstigen gefährlichen Stoffen ist verboten. Elektrische Betriebsmittel (z.\u00a0B. Ladekabel) dürfen nur mit Genehmigung des Vermieters dauerhaft installiert werden. Türen, Tore und Schranken sind nach Benutzung stets zu schließen.</div>
    </div>

    <div class="ordnung-par">
      <div class="ordnung-par__title">§ 5 Schlüssel und Zugang</div>
      <div class="ordnung-par__body">Schlüssel, Fernbedienungen und Zugangscodes dürfen nicht an Dritte weitergegeben werden. Bei Verlust ist der Vermieter unverzüglich zu informieren. Die Kosten für Ersatz trägt der Mieter.</div>
    </div>

    <div class="ordnung-par">
      <div class="ordnung-par__title">§ 6 Haftung</div>
      <div class="ordnung-par__body">Der Vermieter haftet nicht für Schäden an abgestellten Fahrzeugen oder darin befindlichen Gegenständen, insbesondere nicht für Diebstahl, Vandalismus oder Witterungsschäden. Der Mieter wird empfohlen, eine Kaskoversicherung abzuschließen.</div>
    </div>

    <div class="ordnung-par">
      <div class="ordnung-par__title">§ 7 Verstöße</div>
      <div class="ordnung-par__body">Bei wiederholten oder schwerwiegenden Verstößen gegen diese Ordnung ist der Vermieter berechtigt, das Mietverhältnis fristlos zu kündigen. Unberechtigt abgestellte Fahrzeuge können auf Kosten des Veranlassers entfernt werden.</div>
    </div>

    <div class="ordnung-footer">
      Diese Ordnung ist Bestandteil des Mietvertrages und für den Mieter verbindlich. ·
      Stellplatz ${d.stellplatzNr} · ${d.spotAdresse}
    </div>
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Parkplatz Mietvertrag \u2014 ${d.stellplatzNr}</title>
<style>${CSS}</style></head>
<body>${page1}${pageData}${page2}${page3}</body></html>`;
}


/* ── PDF GENERATOR + BUTTON WIRING ───────────────────────────────────────── */

function _pkReadMieter(n) {
  if (n > 1) {
    const wrap = document.getElementById(`pk-mv-mieter${n}`);
    if (!wrap || wrap.style.display === 'none') {
      return { name: '', adr: '', dob: '', email: '', tel: '' };
    }
  }
  const sfx = n > 1 ? n : '';
  return {
    name:  document.getElementById(`pk-mv-name${sfx}`)?.value.trim()  || '',
    adr:   document.getElementById(`pk-mv-adr${sfx}`)?.value.trim()   || '',
    dob:   document.getElementById(`pk-mv-dob${sfx}`)?.value.trim()   || '',
    email: document.getElementById(`pk-mv-email${sfx}`)?.value.trim() || '',
    tel:   document.getElementById(`pk-mv-tel${sfx}`)?.value.trim()   || '',
  };
}

function _wirePkMvPdfBtn() {
  const btn = document.getElementById('pkMvPdfBtn');
  if (!btn || btn._pkMvWired) return;
  btn._pkMvWired = true;

  btn.addEventListener('click', async () => {
    const spot = appParking.find(p => p.id === _pkContractId);
    if (!spot) return;

    const pr = spot.pricing   || {};
    const sk = spot.schlussel || {};
    const s  = (typeof appSettings !== 'undefined') ? appSettings : {};

    const t1 = _pkReadMieter(1);
    const mieterName  = t1.name;
    const mieterAdr   = t1.adr;
    const mieterDob   = t1.dob;
    const mieterEmail = t1.email;
    const mieterTel   = t1.tel;
    const t2 = _pkReadMieter(2);
    const t3 = _pkReadMieter(3);
    const startVal    = document.getElementById('pk-mv-start')?.value        || '';
    const sigVal      = document.getElementById('pk-mv-sig')?.value          || '';
    const befristet   = document.getElementById('pk-mv-befristung-btn')?.dataset.mode === 'befristet';
    const endVal      = befristet ? (document.getElementById('pk-mv-end')?.value || '') : '';
    const kennzeichen = document.getElementById('pk-mv-kennzeichen')?.value.trim() || '';
    const fahrzeug    = document.getElementById('pk-mv-fahrzeug')?.value.trim()    || '';
    const kautionVal  = document.getElementById('pk-mv-kaution')?.value || null;
    const kautionFael = typeof _pkReadKautionFael === 'function' ? _pkReadKautionFael() : '5';
    const staffelAn   = document.getElementById('pk-mv-staffel-btn')?.dataset.mode === 'ja';
    const anfangsmiete = parseFloat(document.getElementById('pk-mv-staffel-anfang')?.value) || null;
    const staffeln = [];
    if (staffelAn) {
      document.querySelectorAll('.pk-mv-staffel-row').forEach(row => {
        const betrag = parseFloat(row.querySelector('.pk-mv-staffel-betrag')?.value) || 0;
        const datum  = row.querySelector('.pk-mv-staffel-datum')?.textContent?.trim();
        if (betrag && datum && datum !== '—') staffeln.push({ datum, betrag });
      });
    }

    // Load latest settings if available
    if (typeof loadSettings === 'function') await loadSettings();

    const resetHtml = '<i class="ti ti-printer"></i> Generate PDF';
    btn.innerHTML = '<i class="ti ti-loader"></i> Generating\u2026';
    btn.disabled  = true;

    try {
      const data = _buildPkMietvertragData(spot, pr, sk, s, {
        mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel,
        mieterName2: t2.name, mieterAdr2: t2.adr, mieterDob2: t2.dob, mieterEmail2: t2.email, mieterTel2: t2.tel,
        mieterName3: t3.name, mieterAdr3: t3.adr, mieterDob3: t3.dob, mieterEmail3: t3.email, mieterTel3: t3.tel,
        startVal, sigVal, befristet, endVal, kennzeichen, fahrzeug,
        kautionVal, kautionFael,
        staffelAn, staffeln, anfangsmiete,
      });

      const html = _renderPkMietvertragHTML(data);

      // Inject hidden render container
      let container = document.getElementById('_pkPdfRenderContainer');
      if (container) container.remove();
      container = document.createElement('div');
      container.id = '_pkPdfRenderContainer';
      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;';
      container.innerHTML = html;
      document.body.appendChild(container);
      await document.fonts.ready;

      const filename = `Parkplatz_Mietvertrag_${(spot.name||'').replace(/\s+/g,'_')}_${(mieterName||'Mieter').replace(/\s+/g,'_')}.pdf`;

      await _aptGenericPdfAction(container, filename, btn, resetHtml);

    } catch (err) {
      console.error('[pk-mv-pdf]', err);
      btn.innerHTML = resetHtml;
      btn.disabled  = false;
    }
  });
}


/* ── HOOK INTO MODAL OPEN ─────────────────────────────────────────────────── */
// _pkOpenContract sets innerHTML on pkContractFooter which destroys the button
// and its listener each time. We use MutationObserver to re-wire after each open.

(function _observePkContractFooter() {
  const target = document.getElementById('pkContractFooter');
  if (!target) {
    // Index not ready yet — retry after DOM load
    document.addEventListener('DOMContentLoaded', _observePkContractFooter);
    return;
  }
  const obs = new MutationObserver(() => {
    const btn = document.getElementById('pkMvPdfBtn');
    if (btn && !btn._pkMvWired) _wirePkMvPdfBtn();
  });
  obs.observe(target, { childList: true });
})();
