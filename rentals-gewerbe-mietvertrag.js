/* ═══════════════════════════════════════════════════════════════════════════
 *  CASA CASTEL — GEWERBEMIETVERTRAG
 *  rentals-gewerbe-mietvertrag.js
 *
 *  Scenarios:
 *    S1 — Mindestlaufzeit → danach unbefristet + Staffelmiete
 *    S2 — Befristet → endet automatisch → neuer Vertrag
 *    S3 — Befristet + einmalige Verlängerungsoption + Mieterhöhung
 *
 *  Contains:
 *    _buildGewerbeMietvertragData()    — data builder
 *    _renderGewerbeMietvertragHTML()   — 3-page PDF HTML
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ── DATA BUILDER ─────────────────────────────────────────────────────────── */

function _buildGewerbeMietvertragData(apt, s, {
  szenario = 'S1',
  nutzungszweck = '',
  etage = '',
  moebliert = false,
  mieterName = '', mieterAdr = '', mieterDob = '', mieterEmail = '', mieterTel = '',
  mieterName2 = '', mieterAdr2 = '', mieterDob2 = '', mieterEmail2 = '', mieterTel2 = '',
  mieterName3 = '', mieterAdr3 = '', mieterDob3 = '', mieterEmail3 = '', mieterTel3 = '',
  startVal = '', festNum = 0, festUnit = 'Jahre',
  kaltmiete = 0, nkVZ = 0,
  kautionVal = 0, kautionFael = '5', sigVal = '',
  // S1
  kuendigungsfrist = 6, staffelAn = false, staffeln = [],
  // S3
  verlaengerungJahre = 0, ankuendigungMonate = 6, neueKaltmiete = 0, verlaengerungBis = '',
}) {
  const fmtDt = raw => {
    const d = new Date(raw);
    return String(d.getDate()).padStart(2,'0') + '.' +
           String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
  };
  const fmtN = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const eur  = n => fmtN(n) + '\u00a0\u20ac';

  // Calculate Mietende from Mietbeginn + Festlaufzeit
  let mietende = '';
  let mietendeRaw = null;
  if (startVal && festNum) {
    const d = new Date(startVal);
    if (festUnit === 'Jahre') d.setFullYear(d.getFullYear() + festNum);
    else d.setMonth(d.getMonth() + festNum);
    d.setDate(d.getDate() - 1);
    mietendeRaw = d;
    mietende = fmtDt(d);
  }

  // Staffel dates (S1 + S3)
  const staffelnBuilt = [];
  if ((szenario === 'S1' || szenario === 'S3') && staffelAn && mietendeRaw) {
    const intervall = 1; // from staffeln data or default
    staffeln.forEach((st, i) => {
      staffelnBuilt.push({ datum: st.datum || '', betrag: Number(st.betrag) || 0 });
    });
  }

  // S3 dates
  let ankuendigungBis = '', verlBis = verlaengerungBis || '';
  if (szenario === 'S3' && mietendeRaw) {
    const ankDt = new Date(mietendeRaw);
    ankDt.setMonth(ankDt.getMonth() - ankuendigungMonate);
    ankuendigungBis = fmtDt(ankDt);
    if (!verlBis && verlaengerungJahre) {
      const verlDt = new Date(mietendeRaw);
      verlDt.setFullYear(verlDt.getFullYear() + verlaengerungJahre);
      verlBis = fmtDt(verlDt);
    }
  }

  const kautionFaelText = kautionFael === 'sofort'
    ? 'sofort nach Vertragsunterzeichnung'
    : `binnen\u00a0${kautionFael}\u00a0Tagen nach Unterzeichnung`;

  const gesamtmiete = Number(kaltmiete) + Number(nkVZ);

  // Schlüssel
  const sk = apt.schlussel || {};
  const schluessel = `Haustür\u00a0\u00d7${sk.haustuerschluessel??1}\u00a0\u00b7\u00a0Wohnung\u00a0\u00d7${sk.wohnungsschluessel??1}`;

  return {
    // Vermieter
    vermieterName:    s.vermieter_name    || '',
    vermieterAdresse: s.vermieter_adresse || '',
    vermieterEmail:   s.vermieter_email   || '',
    vermieterSig:     s.vermieter_name    || '',
    // Bank
    kontoinhaber:  s.kontoinhaber || '',
    bankname:      s.bankname     || '',
    iban:          s.iban         || '',
    bic:           s.bic          || '',
    // Objekt
    objektAdresse:   apt.adresse     || s.objekt_adresse  || '',
    objektPLZOrt:    apt.plz_ort     || s.objekt_plz_ort  || '',
    gerichtsstand:   apt.gerichtsstand || s.gerichtsstand || 'Mainz',
    unterschriftOrt: apt.unterschrift_ort || s.unterschrift_ort || 'Mainz',
    footerAdresse:   (apt.adresse || s.objekt_adresse || '') + (apt.plz_ort || s.objekt_plz_ort ? ' \u00b7 ' + (apt.plz_ort || s.objekt_plz_ort) : ''),
    aptName:         apt.name || '',
    flaeche:         apt.flaeche_m2 || '',
    etage,
    nutzungszweck,
    moebliert,
    schluessel,
    inventar: Array.isArray(apt.inventar) ? apt.inventar : [],
    // Mieter
    mieterName, mieterAdresse: mieterAdr, mieterGeburtsdatum: mieterDob,
    mieterEmail, mieterTel,
    // Mieter 2 (optional)
    hasMieter2: !!(mieterName2 && mieterName2.trim()),
    mieterName2, mieterAdresse2: mieterAdr2, mieterGeburtsdatum2: mieterDob2,
    mieterEmail2, mieterTel2,
    // Mieter 3 (optional)
    hasMieter3: !!(mieterName3 && mieterName3.trim()),
    mieterName3, mieterAdresse3: mieterAdr3, mieterGeburtsdatum3: mieterDob3,
    mieterEmail3, mieterTel3,
    // Mietzeit
    szenario,
    mietbeginn:   startVal ? fmtDt(new Date(startVal)) : '',
    mietende,
    festlaufzeit: `${festNum}\u00a0${festUnit}`,
    // S1
    kuendigungsfrist,
    staffelAn,
    staffeln:     staffelnBuilt,
    anfangsmiete: Number(kaltmiete),
    // S3
    verlaengerungJahre, ankuendigungMonate,
    ankuendigungBis, verlBis,
    neueKaltmiete: Number(neueKaltmiete),
    neueGesamtmiete: Number(neueKaltmiete) + Number(nkVZ),
    // Miete
    kaltmiete:    Number(kaltmiete),
    nkVZ:         Number(nkVZ),
    gesamtmiete,
    kautionVal:   Number(kautionVal),
    kautionFaelText,
    // Meta
    unterzeichnungsDatum: sigVal ? fmtDt(new Date(sigVal)) : '',
  };
}


/* ── PDF HTML RENDERER ────────────────────────────────────────────────────── */

function _renderGewerbeMietvertragHTML(d) {
  const fmtN = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const eur  = n => fmtN(n) + '\u00a0\u20ac';

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
    .total-box { background:#f0e8d8; border-radius:3px; padding:9px 10px; display:flex; justify-content:space-between; align-items:center; margin-top:10px; margin-bottom:16px; }
    .total-box__label, .total-box__value { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:700; color:#8a6535; line-height:1; }
    .staffel-table { width:100%; border-collapse:collapse; margin-top:6px; margin-bottom:14px; }
    .staffel-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; text-align:left; }
    .staffel-table td { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#1a1a1a; padding:3.5px 0; line-height:1.55; }
    .note { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; margin-top:10px; line-height:1.55; }
    .nk-intro { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; line-height:1.55; margin-top:7px; margin-bottom:10px; }
    .nk-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:24px; }
    .nk-item { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; padding:2.5px 0; line-height:1.4; }
    .nk-item--full { grid-column:1/-1; }
    .clause { margin-top:8px; }
    .clause--first { margin-top:40px; }
    .clause__title { font-family:'Lato',sans-serif; font-size:12px; font-weight:700; color:#4a4540; margin-bottom:2px; line-height:1.4; }
    .clause__body { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; line-height:1.55; }
    .inv-table { width:100%; border-collapse:collapse; margin-top:6px; }
    .inv-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; text-align:left; }
    .inv-table td { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#1a1a1a; padding:3.5px 0; line-height:1.55; }
    .comment-label { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:32px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .comment-line { border-bottom:0.5px solid #e0dbd4; height:26px; margin-top:2px; }
    .sig-block { margin-top:40px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#aaa59e; margin-bottom:4px; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-write-gap { height:60px; }
    .sig-line { border:none; border-top:0.6px solid #3a3530; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }
  `;

  const hdr = name => `<div class="hdr"><span class="hdr__wordmark">${name}</span><div class="hdr__room"><span class="hdr__room-label">Gewerbemietvertrag</span><span class="hdr__room-name">${d.nutzungszweck || ''}</span></div></div>`;
  const ftr = n    => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${d.footerAdresse}</span><span>${n}</span></div></div>`;
  const kv  = (k,v)=> `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const sec = (t,lg,first) => `<div class="sec${lg?' sec--lg':''}${first?' sec--first':''}">${t}</div>`;
  const cl  = (num,title,body,first) => `<div class="clause${first?' clause--first':''}"><div class="clause__title">\u00a7\u00a0${num}\u2002${title}</div><div class="clause__body">${body}</div></div>`;

  const sigBlock = () => `<div class="sig-block">
    <div class="sig-col">
      ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Vermieter</div><div class="sig-name">${d.vermieterSig}</div>
    </div>
    <div class="sig-col">
      ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter${(d.hasMieter2||d.hasMieter3)?' 1':''}</div><div class="sig-name">${d.mieterName}</div>
      ${d.hasMieter2 ? `
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter 2</div><div class="sig-name">${d.mieterName2}</div>
      ` : ''}
      ${d.hasMieter3 ? `
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter 3</div><div class="sig-name">${d.mieterName3}</div>
      ` : ''}
    </div>
  </div>`;

  // NK items — Gewerbe version (includes Verwaltungskosten)
  const NK_ITEMS = [
    'Laufende \u00f6ffentliche Lasten (Grundsteuer)',
    'Heizung',
    'Wasser',
    'Kanal',
    'Niederschlagswasser',
    'Allgemein-Strom',
    'Beleuchtung (Gemeinschaftsfl\u00e4chen)',
    'Verwalter-Verg\u00fctung',
    'Hausmeister',
    'M\u00fcllbeseitigung',
    'Stra\u00dfenreinigung',
    'Haushaftpflichtversicherung',
    'Geb\u00e4udeversicherung',
    'Aufzugskosten',
    'Antennenanlage',
    'Erhaltung Allgemein',
    'Kontof\u00fchrungsgeb\u00fchren',
    'Schornsteinreinigung',
    'Gartenpflege',
    'Winterdienst',
    'Geb\u00e4udereinigung',
    'Ungezieferbek\u00e4mpfung',
  ];
  const nkRows = NK_ITEMS.map(i => `<div class="nk-item">${i}</div>`).join('') +
    `<div class="nk-item nk-item--full">Sonstige Betriebskosten i.\u202fs.\u202fd. \u00a7\u00a02 Nr.\u00a017 BetrKV (insbes. Wartung von Anlagen, soweit nicht vorstehend einzeln aufgef\u00fchrt)</div>`;

  // Staffel table (S1)
  const hasStaffel = (d.szenario === 'S1' || d.szenario === 'S3') && d.staffelAn && d.staffeln.length > 0;
  const staffelTable = hasStaffel ? `
    <table class="staffel-table">
      <thead><tr><th>Zeitraum ab</th><th>Nettokaltmiete / Monat</th></tr></thead>
      <tbody>
        <tr><td>${d.mietbeginn}</td><td>${eur(d.anfangsmiete)} (Anfangsmiete)</td></tr>
        ${d.staffeln.map(st => `<tr><td>${st.datum}</td><td>${eur(st.betrag)}</td></tr>`).join('')}
      </tbody>
    </table>` : '';

  // Inventar table
  const invRows = d.inventar.length
    ? d.inventar.map(i => `<tr><td>${i.gegenstand}</td><td>${i.anzahl}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:#aaa59e;font-size:10px;padding-top:6px;">Kein Inventar hinterlegt</td></tr>`;

  // Paragraph numbering — shifts if Staffelmiete present
  const pBase = hasStaffel ? 1 : 0; // offset for §§ after Staffelmiete
  const pNum  = n => n + pBase;

  // § 1 — Mietzeit (three variants)
  const p1_S1 = `Das Mietverh\u00e4ltnis beginnt am ${d.mietbeginn} und wird f\u00fcr eine Mindestlaufzeit von ${d.festlaufzeit} fest abgeschlossen. W\u00e4hrend der Mindestlaufzeit ist eine ordentliche K\u00fcndigung f\u00fcr beide Parteien ausgeschlossen. Das Mietverh\u00e4ltnis endet nicht automatisch mit Ablauf der Mindestlaufzeit, sondern l\u00e4uft anschlie\u00dfend auf unbestimmte Zeit weiter. Es kann danach von jeder Partei mit einer Frist von ${d.kuendigungsfrist}\u00a0Monaten zum Quartalsende ordentlich gek\u00fcndigt werden (\u00a7\u00a0580a BGB analog). Die K\u00fcndigung bedarf der Schriftform. \u00a7\u00a0545 BGB (stillschweigende Verl\u00e4ngerung) findet keine Anwendung. Die au\u00dferordentliche K\u00fcndigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unber\u00fchrt.`;

  const p1_S2 = `Das Mietverh\u00e4ltnis beginnt am ${d.mietbeginn} und endet am ${d.mietende} automatisch, ohne dass es einer K\u00fcndigung bedarf. Eine ordentliche K\u00fcndigung ist w\u00e4hrend der vereinbarten Mietzeit f\u00fcr beide Parteien ausgeschlossen. \u00a7\u00a0545 BGB (stillschweigende Verl\u00e4ngerung) findet keine Anwendung. Die au\u00dferordentliche K\u00fcndigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unber\u00fchrt.`;

  const p1_S3_miete = (d.szenario === 'S3' && d.staffelAn && d.staffeln.length > 0)
    ? `Die monatliche Nettokaltmiete w\u00e4hrend der Verl\u00e4ngerungsperiode ist gem\u00e4\u00df \u00a7\u00a0557a BGB gestaffelt; die Einzelbetr\u00e4ge und Termine ergeben sich aus \u00a7\u00a03 (Staffelmiete).`
    : `Die monatliche Nettokaltmiete betr\u00e4gt ab dem ersten Tag der Verl\u00e4ngerungsperiode ${eur(d.neueKaltmiete)}.`;

  const p1_S3 = `Das Mietverh\u00e4ltnis beginnt am ${d.mietbeginn} und endet am ${d.mietende} automatisch, ohne dass es einer K\u00fcndigung bedarf. \u00a7\u00a0545 BGB (stillschweigende Verl\u00e4ngerung) findet keine Anwendung. Die au\u00dferordentliche K\u00fcndigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unber\u00fchrt. Der Mieter ist berechtigt, das Mietverh\u00e4ltnis einmalig um ${d.verlaengerungJahre}\u00a0Jahr${d.verlaengerungJahre===1?'':'e'} zu verl\u00e4ngern. Die Verl\u00e4ngerung muss dem Vermieter sp\u00e4testens ${d.ankuendigungMonate}\u00a0Monate vor Ablauf der Mietzeit, d.\u202fh. bis zum ${d.ankuendigungBis}, schriftlich mitgeteilt werden. Bei fristgerechter Aus\u00fcbung verl\u00e4ngert sich das Mietverh\u00e4ltnis bis zum ${d.verlBis} und endet sodann automatisch ohne K\u00fcndigung. Wird die Option nicht fristgerecht ausge\u00fcbt, erlischt sie ersatzlos. W\u00e4hrend der Verl\u00e4ngerungsperiode ist eine ordentliche K\u00fcndigung f\u00fcr beide Parteien ausgeschlossen; das Mietverh\u00e4ltnis ist auch in diesem Zeitraum fest gebunden und endet automatisch mit Ablauf der Verl\u00e4ngerung, ohne dass es einer K\u00fcndigung bedarf. Die au\u00dferordentliche K\u00fcndigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unber\u00fchrt. ${p1_S3_miete}`;

  const p1Body = d.szenario === 'S1' ? p1_S1 : d.szenario === 'S3' ? p1_S3 : p1_S2;

  // § 3 Staffelmiete (only S1 with staffel)
  const staffelClause = hasStaffel ? cl(3, 'Staffelmiete',
    (d.szenario === 'S3'
      ? `Die monatliche Nettokaltmiete w\u00e4hrend der Verl\u00e4ngerungsperiode ist gem\u00e4\u00df \u00a7\u00a0557a BGB gestaffelt und betr\u00e4gt: Erste Staffel ab ${d.staffeln[0]?.datum || d.mietende}: ${eur(d.staffeln[0]?.betrag || 0)}.`
      : `Die monatliche Nettokaltmiete ist gem\u00e4\u00df \u00a7\u00a0557a BGB gestaffelt und betr\u00e4gt: Anfangsmiete ab ${d.mietbeginn}: ${eur(d.anfangsmiete)}.`
    ) +
    (d.szenario === 'S3' ? d.staffeln.slice(1) : d.staffeln).map(st => ` Ab ${st.datum}: ${eur(st.betrag)}.`).join('') +
    ` Jede Staffel gilt f\u00fcr mindestens zw\u00f6lf Monate. W\u00e4hrend einer laufenden Staffel ist eine Mietererh\u00f6hung nach \u00a7\u00a7\u00a0558, 559 BGB ausgeschlossen. Die jeweils geltende Staffelmiete ist zum 3.\u00a0Werktag des ersten Monats der neuen Staffel f\u00e4llig.`
  ) : '';

  // Whenever more than one Mieter is present, the tenant section grows enough
  // that Miete & Bankverbindung risks being clipped on a fixed-height page —
  // so it gets pushed onto its own page instead of being squeezed in.
  const hasMultiMieter = d.hasMieter2 || d.hasMieter3;

  const mieteBankBlock = `
    ${sec('Miete &amp; Bankverbindung',true,hasMultiMieter)}
    ${kv('Nettokaltmiete',eur(d.kaltmiete)+'\u2002/ Monat'+(hasStaffel && d.szenario==='S1'?' (Staffelmiete \u2014 siehe \u00a7\u00a03)':'')+(hasStaffel && d.szenario==='S3'?' \u00b7 ab Verl\u00e4ngerung gestaffelt, siehe \u00a7\u00a03':''))}
    ${d.nkVZ?kv('Betriebskosten VZ',eur(d.nkVZ)+'\u2002/ Monat (Vorauszahlung)'):''}
    <div class="total-box"><span class="total-box__label">Gesamtmiete monatlich:</span><span class="total-box__value">${eur(d.gesamtmiete)}</span></div>
    ${kv('F\u00e4lligkeit','Sp\u00e4testens 3.\u00a0Werktag des Monats')}
    ${kv('Kaution',eur(d.kautionVal)+'\u2002(f\u00e4llig '+d.kautionFaelText+')')}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber',d.kontoinhaber)}${d.bankname?kv('Bank',d.bankname):''}${kv('IBAN',d.iban)}${kv('BIC',d.bic)}
    <p class="note">Alle Zahlungen per \u00dcberweisung. Verwendungszweck: ${d.aptName} \u2013 Miete Monat Jahr / Kaution.</p>`;

  // PAGE 1
  const page1 = `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(1)}
  <div class="content">
    <div class="doc-title">Mietvertrag</div>
    <div class="doc-subtitle">Gewerbemietvertrag \u00b7 ${d.nutzungszweck}</div>
    ${sec('Vermieter',false,true)}
    ${kv('Name',d.vermieterName)}${kv('Adresse',d.vermieterAdresse)}
    ${d.vermieterEmail?kv('E-Mail',d.vermieterEmail):''}
    ${sec('Mieter'+((d.hasMieter2||d.hasMieter3)?' 1':''),false,false)}
    ${kv('Name',d.mieterName)}
    ${kv('Adresse',d.mieterAdresse||'')}
    ${kv('Geburtsdatum',d.mieterGeburtsdatum||'')}
    ${kv('E-Mail',d.mieterEmail||'')}
    ${kv('Telefon',d.mieterTel||'')}
    ${d.hasMieter2 ? sec('Mieter 2',false,false) : ''}
    ${d.hasMieter2 ? kv('Name',d.mieterName2) : ''}
    ${d.hasMieter2 ? kv('Adresse',d.mieterAdresse2||'') : ''}
    ${d.hasMieter2 ? kv('Geburtsdatum',d.mieterGeburtsdatum2||'') : ''}
    ${d.hasMieter2 ? kv('E-Mail',d.mieterEmail2||'') : ''}
    ${d.hasMieter2 ? kv('Telefon',d.mieterTel2||'') : ''}
    ${d.hasMieter3 ? sec('Mieter 3',false,false) : ''}
    ${d.hasMieter3 ? kv('Name',d.mieterName3) : ''}
    ${d.hasMieter3 ? kv('Adresse',d.mieterAdresse3||'') : ''}
    ${d.hasMieter3 ? kv('Geburtsdatum',d.mieterGeburtsdatum3||'') : ''}
    ${d.hasMieter3 ? kv('E-Mail',d.mieterEmail3||'') : ''}
    ${d.hasMieter3 ? kv('Telefon',d.mieterTel3||'') : ''}
    ${sec('Mietobjekt',false,false)}
    ${kv('Adresse',d.objektAdresse)}
    ${kv('PLZ / Ort',d.objektPLZOrt)}
    ${kv('Bezeichnung',d.aptName)}
    ${d.etage?kv('Etage / Einheit',d.etage):''}
    ${d.flaeche?kv('Nutzfl\u00e4che','ca.\u00a0'+d.flaeche+'\u00a0m\u00b2'):''}
    ${kv('Nutzungszweck',d.nutzungszweck)}
    ${d.moebliert?kv('M\u00f6blierung','M\u00f6bliert \u00b7 Inventar siehe Anlage\u00a0A'):''}
    ${kv('Schl\u00fcssel',d.schluessel)}
    ${sec('Mietzeit',false,false)}
    ${kv('Mietbeginn',d.mietbeginn)}
    ${kv('Festlaufzeit',d.festlaufzeit + (d.mietende ? ' \u2014 bis ' + d.mietende : ''))}
    ${d.szenario==='S1'
      ? kv('Danach','Unbefristet \u00b7 k\u00fcndbar mit '+d.kuendigungsfrist+'\u00a0Monaten zum Quartalsende (\u00a7\u00a0580a BGB)')
        + kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verl\u00e4ngerung')
      : d.szenario==='S3'
        ? kv('Verl\u00e4ngerungsoption','Einmalig um '+d.verlaengerungJahre+'\u00a0Jahr'+( d.verlaengerungJahre===1?'':'e')+' \u2014 Mieter bis '+d.ankuendigungBis+' mitteilen')
          + kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verl\u00e4ngerung')
        : kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verl\u00e4ngerung')
    }
    ${hasMultiMieter ? '' : mieteBankBlock}
  </div>
</div>`;

  // PAGE 1B — only inserted when 2 or 3 Mieter pushed Miete & Bankverbindung off page 1
  const page1b = hasMultiMieter ? `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(2)}
  <div class="content">
    ${mieteBankBlock}
  </div>
</div>` : '';

  const pageOffset = hasMultiMieter ? 1 : 0;

  // PAGE 2
  const page2 = `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(2+pageOffset)}
  <div class="content">
    ${sec('Betriebskosten gem. \u00a7\u00a71,\u00a02 BetrKV',true,true)}
    <p class="nk-intro">Neben der Nettokaltmiete tr\u00e4gt der Mieter anteilig folgende Betriebskosten gem\u00e4\u00df \u00a7\u00a7\u00a01,\u00a02 BetrKV. Umlageschl\u00fcssel: Nutzfl\u00e4che der Mietfl\u00e4che im Verh\u00e4ltnis zur Gesamtnutzfl\u00e4che des Geb\u00e4udes. Verwaltungskosten sind im Gewerbemietverh\u00e4ltnis umlagef\u00e4hig. Abrechnung erfolgt j\u00e4hrlich; der Mieter erh\u00e4lt die Abrechnung sp\u00e4testens 12\u00a0Monate nach Ende des Abrechnungszeitraums.</p>
    <div class="nk-grid">${nkRows}</div>
    ${cl('1','Mietzeit und Beendigung',p1Body,true)}
    ${cl('2','Nutzungszweck',
      `Die Mietfl\u00e4che darf ausschlie\u00dflich als ${d.nutzungszweck} genutzt werden. Eine \u00c4nderung des Nutzungszwecks bedarf der vorherigen schriftlichen Zustimmung des Vermieters. Der Mieter ist verpflichtet, alle f\u00fcr den Betrieb erforderlichen beh\u00f6rdlichen Genehmigungen auf eigene Kosten einzuholen und f\u00fcr die Dauer des Mietverh\u00e4ltnisses aufrechtzuerhalten. M\u00e4ngel am Mietobjekt sind dem Vermieter unverz\u00fcglich in Textform anzuzeigen.`)}
    ${staffelClause}
    ${cl(String(pNum(3)),'Kaution',
      `Der Mieter leistet eine Mietsicherheit in H\u00f6he von ${eur(d.kautionVal)}, f\u00e4llig ${d.kautionFaelText}. Die Sicherheit ist als Barkaution auf das oben genannte Konto zu \u00fcberweisen. R\u00fcckzahlung etwaiger Restbetr\u00e4ge erfolgt nach Beendigung des Mietverh\u00e4ltnisses und abschlie\u00dfender Pr\u00fcfung aller gegenseitigen Anspr\u00fcche.`)}
    ${cl(String(pNum(4)),'Nebenkosten und Abrechnung',
      `Neben der Nettokaltmiete zahlt der Mieter monatliche Betriebskostenvorauszahlungen in H\u00f6he von ${eur(d.nkVZ)}. Die Abrechnung erfolgt j\u00e4hrlich auf Grundlage der tats\u00e4chlich angefallenen Kosten. Die umlagef\u00e4higen Betriebskosten sind in der Aufstellung auf Seite\u00a02 abschlie\u00dfend aufgef\u00fchrt.`)}
  </div>
</div>`;

  // PAGE 3
  const page3 = `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(3+pageOffset)}
  <div class="content">
    ${cl(String(pNum(5)),'Sch\u00f6nheitsreparaturen',
      'Sch\u00f6nheitsreparaturen w\u00e4hrend der Mietzeit obliegen dem Mieter, soweit sie durch dessen vertragsgem\u00e4\u00dfen Gebrauch der Mietfl\u00e4che erforderlich werden. Hierzu z\u00e4hlen insbesondere das Tapezieren, Anstreichen oder Kalken der W\u00e4nde und Decken sowie das Streichen der Heizk\u00f6rper, Innent\u00fcren, Fenster und Au\u00dfent\u00fcren von innen. Die Ausf\u00fchrung hat fachgerecht und in einem dem Zustand der Mietfl\u00e4che bei \u00dcbergabe entsprechenden Standard zu erfolgen.',true)}
    ${cl(String(pNum(6)),'Kleinreparaturen',
      'Der Mieter tr\u00e4gt die Kosten kleinerer Instandhaltungsma\u00dfnahmen an Installationsgegenst\u00e4nden f\u00fcr Elektrizit\u00e4t, Wasser und Gas, an Heizungs- und Kocheinrichtungen sowie an Fenster- und T\u00fcrverschl\u00fcssen, soweit diese seinem direkten Zugriff unterliegen, bis zu einem Betrag von 200,00\u00a0\u20ac je Einzelfall. Die Gesamtbelastung des Mieters f\u00fcr Kleinreparaturen ist auf 8\u00a0% der Jahresnettokaltmiete begrenzt. \u00dcbersteigt eine Reparatur den vorgenannten Einzelbetrag, tr\u00e4gt der Vermieter die vollst\u00e4ndigen Kosten.')}
    ${cl(String(pNum(7)),'Gewerbehaftpflichtversicherung',
      'Der Mieter ist verpflichtet, f\u00fcr die Dauer des Mietverh\u00e4ltnisses eine Betriebshaftpflichtversicherung mit einer Mindestdeckungssumme von 3.000.000,00\u00a0\u20ac pauschal f\u00fcr Personen- und Sachsch\u00e4den zu unterhalten, die s\u00e4mtliche aus dem Betrieb der Mietfl\u00e4che resultierenden Haftpflichtrisiken abdeckt. Der Nachweis des Versicherungsschutzes ist dem Vermieter auf Verlangen, sp\u00e4testens jedoch bei Mietbeginn, durch Vorlage einer entsprechenden Bescheinigung zu erbringen. Eine Unterbrechung oder Beendigung des Versicherungsschutzes ist dem Vermieter unverz\u00fcglich in Textform anzuzeigen. Kommt der Mieter dieser Verpflichtung nicht nach, ist der Vermieter berechtigt, nach vorheriger Fristsetzung eine entsprechende Versicherung auf Kosten des Mieters abzuschlie\u00dfen.')}
    ${cl(String(pNum(8)),'Instandhaltung und Instandsetzung',
      'Der Vermieter tr\u00e4gt die Kosten f\u00fcr Instandhaltung und Instandsetzung der Geb\u00e4udestruktur, insbesondere Dach, tragende Bauteile, Au\u00dfenfassade und Gemeinschaftsanlagen. Der Mieter tr\u00e4gt die Kosten f\u00fcr Instandhaltung der von ihm genutzten Einrichtungen, Installationen und Ausstattung innerhalb der Mietfl\u00e4che. Sch\u00e4den sind dem Vermieter unverz\u00fcglich in Textform anzuzeigen. Eigenmächtige bauliche Ver\u00e4nderungen bed\u00fcrfen der vorherigen schriftlichen Zustimmung des Vermieters.')}
    ${cl(String(pNum(9)),'Schl\u00fcsselübergabe',
      `Der Mieter erh\u00e4lt bei Einzug ${d.schluessel}. Weitere Schl\u00fcssel bed\u00fcrfen der vorherigen Zustimmung (Textform). Bei Verlust tr\u00e4gt der Mieter die vollst\u00e4ndigen Kosten des Schlossaustauschs. Alle Schl\u00fcssel sind bei Auszug zur\u00fcckzugeben.`)}
    ${cl(String(pNum(10)),'Betreten des Mietobjekts',
      'Bei Gefahr im Verzug ist der Vermieter jederzeit zum Betreten berechtigt. Im \u00dcbrigen ist das Betreten zur Vorbereitung von Verkauf oder Weitervermietung werktags zwischen 9:00 und 18:00\u202fUhr gestattet, sofern mind. zwei Werktage vorher in Textform angek\u00fcndigt wurde.')}
  </div>
</div>`;

  // PAGE 4
  const page4 = `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(4+pageOffset)}
  <div class="content">
    ${cl(String(pNum(11)),'R\u00fcckgabe bei Vertragsende',
      'Die Mietfl\u00e4che ist bei Vertragsende vollst\u00e4ndig ger\u00e4umt, gereinigt und in vertragsm\u00e4\u00dfigem Zustand zur\u00fcckzugeben, unter Ber\u00fccksichtigung der durch vertragsgem\u00e4\u00dfen Gebrauch entstandenen Abnutzung. S\u00e4mtliche vom Mieter angebrachten Einrichtungen, Einbauten, Beschriftungen, Anstriche und sonstige bauliche Ver\u00e4nderungen sind auf eigene Kosten zu entfernen und der urspr\u00fcngliche Zustand wiederherzustellen, sofern nichts anderes schriftlich vereinbart wurde. S\u00e4mtliche Schl\u00fcssel sind zur\u00fcckzugeben. Ein \u00dcbergabeprotokoll wird erstellt und von beiden Parteien unterzeichnet.',true)}
    ${cl(String(pNum(12)),'Umsatzsteuer',
      'Die vereinbarte Miete versteht sich zuz\u00fcglich der gesetzlichen Umsatzsteuer, sofern der Vermieter gegen\u00fcber dem Finanzamt zur Umsatzsteuer optiert hat (\u00a7\u00a09 UStG) und der Mieter das Mietobjekt ausschlie\u00dflich f\u00fcr umsatzsteuerpflichtige Umsätze verwendet. Ohne ausdr\u00fcckliche schriftliche Erkl\u00e4rung des Vermieters gilt die Miete als umsatzsteuerfrei.')}
    ${cl(String(pNum(13)),'Datenschutz',
      'Personenbezogene Daten werden gem\u00e4\u00df Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO zur Vertragsabwicklung verarbeitet, nicht an Dritte weitergegeben und zehn Jahre nach Vertragsende gel\u00f6scht.')}
    ${cl(String(pNum(14)),'Sonstige Vereinbarungen',
      `M\u00fcndliche Nebenabreden bestehen nicht. \u00c4nderungen und Erg\u00e4nzungen dieses Vertrages bed\u00fcrfen der Schriftform; dies gilt auch f\u00fcr die Abbedingung dieses Schriftformerfordernisses (\u00a7\u00a0550 BGB). Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im \u00dcbrigen wirksam. Gerichtsstand f\u00fcr alle Streitigkeiten aus diesem Vertrag ist ${d.gerichtsstand}.`)}
    <div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div>
    ${sigBlock()}
  </div>
</div>`;

  const page5 = d.moebliert ? `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(5+pageOffset)}
  <div class="content">
    ${sec('Anlage A \u2014 Inventar',true,false)}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anzahl</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>
  </div>
</div>` : '';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Gewerbemietvertrag \u2014 ${d.aptName}</title>
<style>${CSS}</style></head>
<body>${page1}${page1b}${page2}${page3}${page4}${page5}</body></html>`;
}
