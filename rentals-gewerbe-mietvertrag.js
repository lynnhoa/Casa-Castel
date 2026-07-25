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
  // §2 Abs. 7 — Sonderkündigungsrecht Nutzungserweiterung (optional)
  sonderkAn = false, sonderkEnde = '',
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

  // §2 Abs. 7 — vorzeitiges Vertragsende + Stichtag (ein Monat davor, tagesgenau geklemmt)
  const skDt = sonderkEnde ? new Date(sonderkEnde) : null;
  const sonderkOn = !!(sonderkAn && skDt && !isNaN(skDt));
  let sonderkEndeFmt = '', sonderkStichtagFmt = '';
  if (sonderkOn) {
    sonderkEndeFmt = fmtDt(skDt);
    const lastPrev = new Date(skDt.getFullYear(), skDt.getMonth(), 0).getDate();
    sonderkStichtagFmt = fmtDt(new Date(skDt.getFullYear(), skDt.getMonth() - 1, Math.min(skDt.getDate(), lastPrev)));
  }

  // Schlüssel
  const sk = apt.schlussel || {};
  const schluessel = `Haustür\u00a0\u00d7${sk.haustuerschluessel??1}\u00a0\u00b7\u00a0Mietfläche\u00a0\u00d7${sk.wohnungsschluessel??1}`;

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
    objektAdresse:   apt.adresse     || '',
    objektPLZOrt:    apt.plz_ort     || '',
    gerichtsstand:   apt.gerichtsstand || '',
    unterschriftOrt: apt.unterschrift_ort || '',
    footerAdresse:   apt.adresse
                       ? apt.adresse + (apt.plz_ort ? ' \u00b7 ' + apt.plz_ort : '')
                       : (apt.plz_ort || ''),
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
    // §2 Abs. 7 — Sonderkündigungsrecht Nutzungserweiterung
    sonderkAn: sonderkOn,
    sonderkEnde: sonderkEndeFmt,
    sonderkStichtag: sonderkStichtagFmt,
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
    'Erhaltung Allgemein',
    'Kontof\u00fchrungsgeb\u00fchren',
    'Schornsteinreinigung',
    'Gartenpflege',
    'Winterdienst',
    'Geb\u00e4udereinigung',
    'Ungezieferbek\u00e4mpfung',
  ];
  const nkRows = NK_ITEMS.map(i => `<div class="nk-item">${i}</div>`).join('') +
    `<div class="nk-item nk-item--full">Sonstige Betriebskosten i.\u202fS.\u202fd. \u00a7\u00a02 Nr.\u00a017 BetrKV (insbesondere Wartung von Anlagen, soweit nicht vorstehend einzeln aufgef\u00fchrt)</div>`;

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

  // Paragraph numbering (adapts to Staffelmiete presence)
  let _pn = 2;
  const NX = () => (++_pn);
  const P = {};
  if (hasStaffel) P.staffel = NX();
  P.kaution = NX(); P.aufrechnung = NX(); P.nebenkosten = NX(); P.klein = NX();
  P.haftpflicht = NX(); P.instand = NX(); P.aussenwerbung = NX(); P.unterverm = NX();
  P.schluessel = NX(); P.betreten = NX(); P.rueckgabe = NX(); P.umsatzsteuer = NX();
  P.datenschutz = NX(); P.sonstige = NX();

  // Inventar table
  const invRows = d.inventar.length
    ? d.inventar.map(i => `<tr><td>${i.gegenstand}</td><td>${i.anzahl}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:#aaa59e;font-size:10px;padding-top:6px;">Kein Inventar hinterlegt</td></tr>`;

  // Paragraph numbering — shifts if Staffelmiete present
  const pBase = hasStaffel ? 1 : 0; // offset for §§ after Staffelmiete
  const pNum  = n => n + pBase;

  // § 1 — Mietzeit (three variants)
  const p1_S1 = `Das Mietverh\u00e4ltnis beginnt am ${d.mietbeginn} und wird f\u00fcr eine Mindestlaufzeit von ${d.festlaufzeit} fest abgeschlossen. W\u00e4hrend der Mindestlaufzeit ist eine ordentliche K\u00fcndigung f\u00fcr beide Parteien ausgeschlossen. Das Mietverh\u00e4ltnis endet nicht automatisch mit Ablauf der Mindestlaufzeit, sondern l\u00e4uft anschlie\u00dfend auf unbestimmte Zeit weiter. Es kann danach von jeder Partei mit einer Frist von ${d.kuendigungsfrist}\u00a0Monaten zum Quartalsende ordentlich gek\u00fcndigt werden (\u00a7\u00a0580a Abs.\u00a02 BGB). Die K\u00fcndigung bedarf der Schriftform. \u00a7\u00a0545 BGB (stillschweigende Verl\u00e4ngerung) findet keine Anwendung. Die au\u00dferordentliche K\u00fcndigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unber\u00fchrt.`;

  const p1_S2 = `Das Mietverh\u00e4ltnis beginnt am ${d.mietbeginn} und endet am ${d.mietende} automatisch, ohne dass es einer K\u00fcndigung bedarf. Eine ordentliche K\u00fcndigung ist w\u00e4hrend der vereinbarten Mietzeit f\u00fcr beide Parteien ausgeschlossen. \u00a7\u00a0545 BGB findet keine Anwendung. Die au\u00dferordentliche K\u00fcndigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unber\u00fchrt.`;

  const p1_S3_miete = (d.szenario === 'S3' && d.staffelAn && d.staffeln.length > 0)
    ? `die Nettokaltmiete ist ab dem ersten Tag der Verl\u00e4ngerung gem\u00e4\u00df \u00a7\u00a03 (Staffelmiete) gestaffelt`
    : `die Nettokaltmiete betr\u00e4gt ab dem ersten Tag der Verl\u00e4ngerung ${eur(d.neueKaltmiete)}`;

  const p1_S3 = `Das Mietverh\u00e4ltnis beginnt am ${d.mietbeginn} und wird f\u00fcr eine Mindestlaufzeit von ${d.festlaufzeit} fest abgeschlossen. W\u00e4hrend der Mindestlaufzeit ist eine ordentliche K\u00fcndigung f\u00fcr beide Parteien ausgeschlossen. Der Mieter ist berechtigt, das Mietverh\u00e4ltnis einmalig um ${d.verlaengerungJahre}\u00a0Jahr${d.verlaengerungJahre===1?'':'e'} zu verl\u00e4ngern. Die Verl\u00e4ngerung muss dem Vermieter sp\u00e4testens ${d.ankuendigungMonate}\u00a0Monate vor Ablauf, d.\u202fh. bis zum ${d.ankuendigungBis}, schriftlich mitgeteilt werden. Bei fristgerechter Aus\u00fcbung verl\u00e4ngert sich die Mindestlaufzeit bis zum ${d.verlBis}; w\u00e4hrend der Verl\u00e4ngerungsperiode ist eine ordentliche K\u00fcndigung f\u00fcr beide Parteien ausgeschlossen, und ${p1_S3_miete}. Wird die Option nicht fristgerecht ausge\u00fcbt, erlischt sie ersatzlos. Das Mietverh\u00e4ltnis endet nicht automatisch mit Ablauf der Mindestlaufzeit bzw. der Verl\u00e4ngerungsperiode, sondern l\u00e4uft anschlie\u00dfend auf unbestimmte Zeit weiter. Es kann danach von jeder Partei mit einer Frist von ${d.kuendigungsfrist}\u00a0Monaten zum Quartalsende ordentlich gek\u00fcndigt werden (\u00a7\u00a0580a Abs.\u00a02 BGB). Die K\u00fcndigung bedarf der Schriftform. \u00a7\u00a0545 BGB (stillschweigende Verl\u00e4ngerung) findet keine Anwendung. Die au\u00dferordentliche K\u00fcndigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unber\u00fchrt.`;

  const p1Body = d.szenario === 'S1' ? p1_S1 : d.szenario === 'S3' ? p1_S3 : p1_S2;

  // Whenever more than one Mieter is present, the tenant section grows enough
  // that Miete & Bankverbindung risks being clipped on a fixed-height page —
  // so it gets pushed onto its own page instead of being squeezed in.
  const hasMultiMieter = d.hasMieter2 || d.hasMieter3;

  const mieteBankBlock = `
    ${sec('Miete &amp; Bankverbindung',true,true)}
    ${kv('Nettokaltmiete',eur(d.kaltmiete)+'\u2002/ Monat'+(hasStaffel && d.szenario==='S1'?' (Staffelmiete \u2014 siehe \u00a7\u00a03)':'')+(hasStaffel && d.szenario==='S3'?' \u00b7 ab Verl\u00e4ngerung gestaffelt, siehe \u00a7\u00a03':'')+' \u00b7 umsatzsteuerfrei (Option \u00a7\u00a0'+P.umsatzsteuer+' vorbehalten)')}
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
      ? kv('Danach','Unbefristet \u00b7 k\u00fcndbar mit '+d.kuendigungsfrist+'\u00a0Monaten zum Quartalsende (\u00a7\u00a0580a Abs.\u00a02 BGB)')
        + kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verl\u00e4ngerung')
      : d.szenario==='S3'
        ? kv('Verl\u00e4ngerungsoption','Einmalig um '+d.verlaengerungJahre+'\u00a0Jahr'+( d.verlaengerungJahre===1?'':'e')+' \u2014 Mieter bis '+d.ankuendigungBis+' mitteilen')
          + kv('Danach','Unbefristet \u00b7 k\u00fcndbar mit '+d.kuendigungsfrist+'\u00a0Monaten zum Quartalsende (\u00a7\u00a0580a Abs.\u00a02 BGB)')
          + kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verl\u00e4ngerung')
        : kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verl\u00e4ngerung')
    }
  </div>
</div>`;

  // PAGE 1B — Miete & Bankverbindung always gets its own page (keeps page 1 from clipping)
  const page1b = `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(2)}
  <div class="content">
    ${mieteBankBlock}
  </div>
</div>`;

  // ═══ CLAUSES (full corrected text) ═════════════════════════
  const nz = d.nutzungszweck || 'gewerbliche Nutzung';

  const clauses = [];
  clauses.push({ n:'1', t:'Mietzeit und Beendigung', paras:[ p1Body ] });
  clauses.push({ n:'2', t:'Nutzungszweck', paras:[
    `(1)\u00a0Die Vermietung erfolgt zur Nutzung als ${nz}.`,
    `(2)\u00a0Eine \u00fcber den vereinbarten Nutzungszweck hinausgehende oder hiervon abweichende Nutzung (nachfolgend \u201eweitere Nutzung\u201c) bedarf der vorherigen schriftlichen Zustimmung des Vermieters. Eine erteilte Zustimmung stellt ausschlie\u00dflich eine Erweiterung des vertraglich zul\u00e4ssigen Nutzungszwecks dar; der vereinbarte Nutzungszweck bleibt hiervon sowie von einer etwaig erteilten beh\u00f6rdlichen Nutzungs\u00e4nderung oder sonstigen \u00f6ffentlich-rechtlichen Genehmigung unber\u00fchrt und besteht unver\u00e4ndert fort.`,
    `(3)\u00a0Dem Mieter ist bekannt, dass f\u00fcr eine weitere Nutzung m\u00f6glicherweise eine \u00f6ffentlich-rechtliche Genehmigung, insbesondere eine Nutzungs\u00e4nderung, erforderlich ist. Die Einholung und Aufrechterhaltung s\u00e4mtlicher f\u00fcr seinen Betrieb erforderlicher Genehmigungen obliegt ausschlie\u00dflich dem Mieter auf eigene Kosten und eigenes Risiko. Der Vermieter unterst\u00fctzt den Mieter in zumutbarem Umfang durch Unterzeichnung erforderlicher Vollmachten sowie durch Bereitstellung der ihm vorliegenden Objektunterlagen, soweit vorhanden; eine Verpflichtung zur Beschaffung weiterer Unterlagen oder zur Tragung von Kosten besteht nicht. Der Mieter stellt den Vermieter von s\u00e4mtlichen Anspr\u00fcchen Dritter und beh\u00f6rdlichen Ma\u00dfnahmen frei, die aus seiner \u00fcber den vereinbarten Nutzungszweck hinausgehenden Nutzung resultieren.`,
    `(4)\u00a0Der Vermieter \u00fcbernimmt keine Gew\u00e4hr oder Garantie f\u00fcr die Erteilung einer beh\u00f6rdlichen Genehmigung einer weiteren Nutzung. Die Versagung, Verz\u00f6gerung oder mit Auflagen verbundene Erteilung einer solchen Genehmigung \u2013 gleich aus welchem Grund, einschlie\u00dflich objektbezogener Umst\u00e4nde \u2013 l\u00e4sst die Pflichten des Mieters aus diesem Vertrag, insbesondere die Mietzahlungspflicht, unber\u00fchrt und berechtigt den Mieter weder zur Mietminderung noch zur au\u00dferordentlichen K\u00fcndigung, zum R\u00fccktritt oder zu Schadensersatzanspr\u00fcchen, sofern die vertragsgem\u00e4\u00dfe Nutzung weiterhin zul\u00e4ssig und m\u00f6glich ist.`,
    `(5)\u00a0Das Risiko der Verwendbarkeit der Mietr\u00e4ume f\u00fcr \u00fcber den vereinbarten Nutzungszweck hinausgehende Zwecke des Mieters tr\u00e4gt ausschlie\u00dflich der Mieter. Eine Anpassung oder Beendigung des Vertrages wegen St\u00f6rung der Gesch\u00e4ftsgrundlage (\u00a7\u00a0313 BGB) ist insoweit ausgeschlossen.`,
    `(6)\u00a0Eine \u00c4nderung des vertraglichen Nutzungszwecks bedarf in jedem Fall einer gesonderten schriftlichen Vereinbarung; sie tritt insbesondere nicht allein durch beh\u00f6rdliche Genehmigung, durch Zustimmung des Vermieters zu einer weiteren Nutzung oder durch deren tats\u00e4chliche Aus\u00fcbung ein. M\u00e4ngel am Mietobjekt sind dem Vermieter unverz\u00fcglich in Textform anzuzeigen.`,
  ].concat(d.sonderkAn ? [
    `(7)\u00a0Abweichend von den Abs\u00e4tzen\u00a04 und\u00a05 gilt: Hat der Vermieter einer Nutzungserweiterung (weitere Nutzung im Sinne des Absatzes\u00a02) schriftlich zugestimmt und beantragt der Mieter die hierf\u00fcr erforderliche beh\u00f6rdliche Nutzungs\u00e4nderung innerhalb von sechs Monaten ab dem Datum der Zustimmungserkl\u00e4rung ordnungsgem\u00e4\u00df und vollst\u00e4ndig, so kann der Mieter das Mietverh\u00e4ltnis vorzeitig zum Ablauf des ${d.sonderkEnde} k\u00fcndigen, wenn die Nutzungs\u00e4nderung versagt oder nur unter Auflagen erteilt wird, deren voraussichtliche Kosten drei Monatsnettokaltmieten \u00fcbersteigen. Die K\u00fcndigung ist innerhalb von vier Wochen nach Zugang des beh\u00f6rdlichen Bescheids schriftlich und unter Beif\u00fcgung des Bescheids sowie eines Kostenvoranschlags eines Fachbetriebs zu erkl\u00e4ren; nach Fristablauf oder bei nicht fristgerechter Antragstellung erlischt das K\u00fcndigungsrecht. Geht der Bescheid dem Mieter erst nach dem ${d.sonderkStichtag} zu, endet das Mietverh\u00e4ltnis abweichend mit Ablauf von drei Monaten zum Monatsende nach Zugang der K\u00fcndigung. Bis zur Beendigung schuldet der Mieter die vereinbarte Miete nebst Nebenkostenvorauszahlungen; weitergehende wechselseitige Anspr\u00fcche wegen der vorzeitigen Beendigung sind ausgeschlossen. Die Abs\u00e4tze\u00a02 bis\u00a06 bleiben im \u00dcbrigen unber\u00fchrt.`,
  ] : []) });
  if (hasStaffel) {
    const staffelLines = (d.szenario === 'S3'
      ? `Die monatliche Nettokaltmiete (umsatzsteuerfrei) w\u00e4hrend der Verl\u00e4ngerungsperiode ist gem\u00e4\u00df \u00a7\u00a0557a BGB gestaffelt und betr\u00e4gt: Erste Staffel ab ${d.staffeln[0]?.datum || d.mietende}: ${eur(d.staffeln[0]?.betrag || 0)}.`
      : `Die monatliche Nettokaltmiete (umsatzsteuerfrei) ist gem\u00e4\u00df \u00a7\u00a0557a BGB gestaffelt und betr\u00e4gt: Anfangsmiete ab ${d.mietbeginn}: ${eur(d.anfangsmiete)}.`)
      + (d.szenario === 'S3' ? d.staffeln.slice(1) : d.staffeln).map(st => ` Ab ${st.datum}: ${eur(st.betrag)}.`).join('')
      + ` Jede Staffel gilt f\u00fcr mindestens zw\u00f6lf Monate. W\u00e4hrend der Geltung einer Staffel ist eine weitergehende Erh\u00f6hung ausgeschlossen. Die jeweils geltende Staffelmiete ist zum 3.\u00a0Werktag des ersten Monats der neuen Staffel f\u00e4llig.`;
    clauses.push({ n:String(P.staffel), t:'Staffelmiete', paras:[ staffelLines ] });
  }
  clauses.push({ n:String(P.kaution), t:'Kaution', paras:[
    `(1)\u00a0Der Mieter leistet eine Mietsicherheit in H\u00f6he von ${eur(d.kautionVal)}, f\u00e4llig ${d.kautionFaelText}. Die Sicherheit ist als Barkaution auf das oben genannte Konto zu \u00fcberweisen.`,
    `(2)\u00a0Eine Verzinsung der Kaution erfolgt nicht. Die gesetzlichen Vorschriften zur Verzinsung von Mietkautionen bei Wohnraummietverh\u00e4ltnissen finden auf dieses Gewerbemietverh\u00e4ltnis keine Anwendung.`,
    `(3)\u00a0Nach Beendigung des Mietverh\u00e4ltnisses und vollst\u00e4ndiger Erf\u00fcllung s\u00e4mtlicher Verpflichtungen des Mieters wird die Kaution nach angemessener Pr\u00fcfungs- und Abrechnungsfrist an den Mieter zur\u00fcckgezahlt, soweit keine Anspr\u00fcche des Vermieters entgegenstehen.`,
  ]});
  clauses.push({ n:String(P.aufrechnung), t:'Aufrechnung, Zur\u00fcckbehaltung, Minderung', paras:[
    `Der Mieter kann gegen die Miete und die Betriebskostenvorauszahlungen nur mit unbestrittenen oder rechtskr\u00e4ftig festgestellten Forderungen aufrechnen oder ein Zur\u00fcckbehaltungsrecht aus\u00fcben. Die Miete darf der Mieter wegen eines Mangels nur mindern, wenn der Minderungsanspruch unbestritten oder rechtskr\u00e4ftig festgestellt ist; andernfalls hat er die Miete zun\u00e4chst ungek\u00fcrzt weiterzuzahlen und kann zu viel Gezahltes zur\u00fcckfordern. Unber\u00fchrt bleiben Forderungen des Mieters aus \u00a7\u00a0536a BGB sowie aus ungerechtfertigter Bereicherung wegen zu viel gezahlter Miete.`,
  ]});
  clauses.push({ n:String(P.nebenkosten), t:'Nebenkosten und Abrechnung', paras:[
    `(1)\u00a0Neben der Nettokaltmiete zahlt der Mieter monatliche Betriebskostenvorauszahlungen in H\u00f6he von ${eur(d.nkVZ)}. Die Abrechnung erfolgt j\u00e4hrlich auf Grundlage der tats\u00e4chlich angefallenen Kosten; bei der Frist von zw\u00f6lf Monaten handelt es sich nicht um eine Ausschlussfrist. Die umlagef\u00e4higen Betriebskosten sind in der vorstehenden Aufstellung abschlie\u00dfend aufgef\u00fchrt.`,
    `(2)\u00a0Die Gewerbeeinheit ist nicht an die gemeinschaftliche Antennenanlage angeschlossen; die hierf\u00fcr anfallenden Kosten werden nicht auf den Mieter umgelegt. Da die Gewerbeeinheit keinen Zugang zum Wohngeb\u00e4ude und zum Personenaufzug hat, werden auch die Kosten f\u00fcr den Personenaufzug nicht auf den Mieter umgelegt. Umlagef\u00e4hig sind ausschlie\u00dflich diejenigen Betriebskosten, die die Gewerbeeinheit tats\u00e4chlich betreffen oder ihr zugutekommen.`,
    `(3)\u00a0Verteilerschl\u00fcssel: Verbrauchsabh\u00e4ngige Kosten werden nach den jeweiligen Z\u00e4hlerst\u00e4nden abgerechnet. Die \u00fcbrigen Betriebskosten werden nach dem Verh\u00e4ltnis der Nutzfl\u00e4che der Mietfl\u00e4che zur Gesamtnutzfl\u00e4che des Geb\u00e4udes umgelegt, soweit nicht im Einzelfall ein anderer sachgerechter Umlageschl\u00fcssel vereinbart oder in einer Anlage zum Mietvertrag ausgewiesen ist.`,
    `(4)\u00a0Heizkosten: F\u00fcr die Gewerbeeinheit ist ein separater Heizkostenz\u00e4hler vorhanden. Die Abrechnung erfolgt entsprechend den gesetzlichen Vorgaben auf Basis der erfassten Verbrauchswerte.`,
    `(5)\u00a0Kalt- und Warmwasser: F\u00fcr die Gewerbeeinheit sind separate Wasserz\u00e4hler vorhanden. Die Abrechnung erfolgt auf Grundlage der tats\u00e4chlichen Verbrauchswerte der Gewerbeeinheit.`,
  ]});
  clauses.push({ n:String(P.klein), t:'Kleinreparaturen', paras:[
    `Der Mieter tr\u00e4gt die Kosten kleinerer Instandhaltungsma\u00dfnahmen an Installationsgegenst\u00e4nden f\u00fcr Elektrizit\u00e4t, Wasser und Gas, an Heizungs- und Kocheinrichtungen sowie an Fenster- und T\u00fcrverschl\u00fcssen, Fenster- und T\u00fcrgriffen, soweit diese seinem direkten Zugriff unterliegen, bis zu einem Betrag von 200,00\u00a0\u20ac je Einzelfall. Die Gesamtbelastung des Mieters f\u00fcr Kleinreparaturen ist auf 8\u00a0% der Jahresnettokaltmiete begrenzt. \u00dcbersteigt eine Reparatur den vorgenannten Einzelbetrag, tr\u00e4gt der Vermieter die vollst\u00e4ndigen Kosten.`,
  ]});
  clauses.push({ n:String(P.haftpflicht), t:'Gewerbehaftpflichtversicherung', paras:[
    `Der Mieter ist verpflichtet, f\u00fcr die Dauer des Mietverh\u00e4ltnisses eine Betriebshaftpflichtversicherung mit einer Mindestdeckungssumme von 3.000.000,00\u00a0\u20ac pauschal f\u00fcr Personen- und Sachsch\u00e4den zu unterhalten, die s\u00e4mtliche aus dem Betrieb der Mietfl\u00e4che resultierenden Haftpflichtrisiken abdeckt. Der Nachweis des Versicherungsschutzes ist dem Vermieter auf Verlangen, sp\u00e4testens jedoch bei Mietbeginn, durch Vorlage einer entsprechenden Bescheinigung zu erbringen. Eine Unterbrechung oder Beendigung des Versicherungsschutzes ist dem Vermieter unverz\u00fcglich in Textform anzuzeigen. Kommt der Mieter dieser Verpflichtung nicht nach, ist der Vermieter berechtigt, nach vorheriger Fristsetzung eine entsprechende Versicherung auf Kosten des Mieters abzuschlie\u00dfen.`,
  ]});
  clauses.push({ n:String(P.instand), t:'Instandhaltung und Instandsetzung', paras:[
    `(1)\u00a0Der Vermieter tr\u00e4gt die Kosten der Instandhaltung und Instandsetzung von Dach und Fach, Fundament, tragenden Geb\u00e4udeteilen, Fenstern und Verglasungen als Bauteil sowie der au\u00dferhalb der Mietfl\u00e4che verlaufenden Ver- und Entsorgungsleitungen.`,
    `(2)\u00a0Der Mieter tr\u00e4gt die Kosten der laufenden Wartung und Pflege der ausschlie\u00dflich den Mietr\u00e4umen dienenden sanit\u00e4ren Einrichtungen, Armaturen, Waschbecken, Toiletten, Sp\u00fclk\u00e4sten sowie sonstiger Installationen innerhalb der Mietfl\u00e4che. An den Kosten ihrer Instandhaltung und Instandsetzung beteiligt sich der Mieter ausschlie\u00dflich im Rahmen und in den Grenzen der Kleinreparaturenregelung (\u00a7\u00a0${P.klein}); dar\u00fcber hinausgehende Instandhaltungs- und Instandsetzungskosten tr\u00e4gt der Vermieter, soweit der Schaden nicht durch den Mieter, dessen Mitarbeiter, Beauftragte, Kunden oder Besucher verursacht wurde.`,
    `(3)\u00a0Der Mieter ist verpflichtet, w\u00e4hrend der gesamten Mietdauer auf eigene Kosten eine Glasversicherung f\u00fcr s\u00e4mtliche Verglasungen der Mietr\u00e4ume einschlie\u00dflich Schaufenstern, Fensterverglasungen, Glast\u00fcren und sonstigen fest eingebauten Glasfl\u00e4chen abzuschlie\u00dfen und aufrechtzuerhalten. Die Glasversicherung hat Sch\u00e4den durch Glasbruch unabh\u00e4ngig von der Schadensursache abzudecken; hierzu z\u00e4hlen insbesondere Sch\u00e4den durch Dritte, Kunden, Besucher, Passanten, Vandalismus, Fahrl\u00e4ssigkeit sowie sonstige von au\u00dfen auf die Verglasung einwirkende Ereignisse. Der Ersatz zu Bruch gegangener Glasfl\u00e4chen erfolgt \u00fcber diese Versicherung. Der Nachweis des Versicherungsschutzes ist dem Vermieter auf Verlangen, sp\u00e4testens bei Mietbeginn, vorzulegen. Unterh\u00e4lt der Mieter den Versicherungsschutz nicht, ist der Vermieter berechtigt, nach vorheriger Fristsetzung eine entsprechende Versicherung auf Kosten des Mieters abzuschlie\u00dfen. Nicht von der Glasversicherung erfasste Instandhaltungs- und Instandsetzungskosten aufgrund normaler Abnutzung, altersbedingten Verschlei\u00dfes, Materialerm\u00fcdung oder technischer Defekte an Fensterrahmen, Beschl\u00e4gen, Dichtungen und sonstigen Bauteilen der Fenster tr\u00e4gt der Vermieter, soweit der Schaden nicht durch den Mieter, dessen Mitarbeiter, Beauftragte, Kunden oder Besucher verursacht wurde. Verursacht der Mieter, dessen Mitarbeiter, Beauftragte, Kunden oder Besucher schuldhaft Sch\u00e4den an Fenstern, Verglasungen oder sonstigen Bestandteilen der Mietsache, hat der Mieter die hierdurch entstehenden Kosten zu tragen, soweit diese nicht von einer Versicherung \u00fcbernommen werden.`,
    `(4)\u00a0Von der Kostentragung des Mieters ausgenommen sind Sch\u00e4den an der Bausubstanz, anf\u00e4ngliche und verdeckte M\u00e4ngel sowie Sch\u00e4den durch normale Alterung \u2013 unabh\u00e4ngig vom Betrag. Das Vorhandensein eines anf\u00e4nglichen oder verdeckten Mangels bei \u00dcbergabe hat der Mieter nachzuweisen; ma\u00dfgeblich ist der Zustand, der in dem bei \u00dcbergabe gemeinsam erstellten und von beiden Parteien unterzeichneten Einzugs\u00fcbergabeprotokoll dokumentiert ist.`,
    `(5)\u00a0Die Wartung von Anlagen, die ausschlie\u00dflich der Mietfl\u00e4che dienen, obliegt dem Mieter auf eigene Kosten.`,
    `(6)\u00a0Sch\u00e4den sind dem Vermieter unverz\u00fcglich in Textform anzuzeigen.`,
  ]});
  clauses.push({ n:String(P.aussenwerbung), t:'Au\u00dfenwerbung', paras:[
    `(1)\u00a0Dem Mieter wird widerruflich gestattet, auf eigene Kosten Werbeanlagen an den Au\u00dfenwandfl\u00e4chen zwischen den Schaufenstern und dem dar\u00fcberliegenden Balkon anzubringen. Der Widerruf ist nur aus sachlichem Grund zul\u00e4ssig, insbesondere bei baulichen Ma\u00dfnahmen am Geb\u00e4ude, bei beh\u00f6rdlichen Anordnungen oder bei Verst\u00f6\u00dfen des Mieters gegen diese Regelung.`,
    `(2)\u00a0Alle hierf\u00fcr erforderlichen beh\u00f6rdlichen Genehmigungen hat der Mieter eigenverantwortlich einzuholen. Der Mieter tr\u00e4gt s\u00e4mtliche Kosten f\u00fcr Errichtung, Betrieb, Wartung, Instandhaltung, Instandsetzung, Versicherung sowie den R\u00fcckbau der Werbeanlagen. Nach Beendigung des Mietverh\u00e4ltnisses ist der urspr\u00fcngliche Zustand auf Verlangen des Vermieters wiederherzustellen.`,
  ]});
  clauses.push({ n:String(P.unterverm), t:'Untervermietung und Nachmieter', paras:[
    `(1)\u00a0Eine vollst\u00e4ndige oder teilweise Untervermietung oder sonstige Gebrauchs\u00fcberlassung der Mietr\u00e4ume an Dritte bedarf der vorherigen Zustimmung des Vermieters in Textform. Der Vermieter kann die Zustimmung aus sachlich gerechtfertigten Gr\u00fcnden verweigern oder von angemessenen Auflagen und Bedingungen abh\u00e4ngig machen.`,
    `(2)\u00a0Die Erteilung einer Zustimmung zur Untervermietung l\u00e4sst die Verpflichtungen des Mieters aus diesem Mietvertrag unber\u00fchrt. Der Mieter bleibt gegen\u00fcber dem Vermieter weiterhin allein verantwortlich f\u00fcr s\u00e4mtliche vertraglichen Pflichten, insbesondere f\u00fcr die vollst\u00e4ndige und rechtzeitige Zahlung der Miete sowie f\u00fcr s\u00e4mtliche Sch\u00e4den und Pflichtverletzungen, die durch den Untermieter oder sonstige Dritte verursacht werden.`,
    `(3)\u00a0Der Mieter hat keinen Anspruch auf Entlassung aus dem Mietvertrag durch Benennung eines Nachmieters. Die Aufnahme eines neuen Mieters oder eine Vertrags\u00fcbernahme bed\u00fcrfen einer gesonderten Vereinbarung mit dem Vermieter in Textform. Der Vermieter ist nicht verpflichtet, einen vom Mieter vorgeschlagenen Nachmieter zu akzeptieren.`,
    `(4)\u00a0Eine Untervermietung berechtigt den Mieter nicht zur vorzeitigen Beendigung des Mietverh\u00e4ltnisses. Das gesetzliche Recht des Mieters zur au\u00dferordentlichen K\u00fcndigung gem\u00e4\u00df \u00a7\u00a0540 Abs.\u00a01 Satz\u00a02 BGB bleibt unber\u00fchrt.`,
  ]});
  clauses.push({ n:String(P.schluessel), t:'Schl\u00fcssel\u00fcbergabe', paras:[
    `Der Mieter erh\u00e4lt bei Einzug ${d.schluessel}. Weitere Schl\u00fcssel bed\u00fcrfen der vorherigen Zustimmung (Textform). Bei Verlust aufgrund Verschuldens des Mieters tr\u00e4gt er die vollst\u00e4ndigen Kosten des Schlossaustauschs oder der Ersatzschl\u00fcssel. Alle Schl\u00fcssel sind bei Auszug zur\u00fcckzugeben.`,
  ]});
  clauses.push({ n:String(P.betreten), t:'Betreten des Mietobjekts', paras:[
    `Bei Gefahr im Verzug ist der Vermieter jederzeit zum Betreten berechtigt. Im \u00dcbrigen ist das Betreten zur Vorbereitung von Verkauf oder Weitervermietung werktags zwischen 9:00 und 18:00\u202fUhr gestattet, sofern mind. zwei Werktage vorher in Textform angek\u00fcndigt wurde.`,
  ]});
  clauses.push({ n:String(P.rueckgabe), t:'R\u00fcckgabe bei Vertragsende', paras:[
    `Der Mieter hat die Mietr\u00e4ume bei Beendigung des Mietverh\u00e4ltnisses ger\u00e4umt, besenrein und in einem ordnungsgem\u00e4\u00dfen Zustand zur\u00fcckzugeben. W\u00e4nde und Decken sind, soweit aufgrund der Nutzung oder des Abnutzungsgrades erforderlich, in einem neutralen, hellen Farbton fachgerecht gestrichen zur\u00fcckzugeben. Farbige, dunkle oder au\u00dfergew\u00f6hnliche Wand- und Deckengestaltungen sind vor R\u00fcckgabe auf Kosten des Mieters in einen neutralen, hellen Farbton zur\u00fcckzuf\u00fchren. Bohrl\u00f6cher, D\u00fcbell\u00f6cher und sonstige Befestigungspunkte sind fachgerecht zu verschlie\u00dfen. \u00dcber die vertragsgem\u00e4\u00dfe Abnutzung hinausgehende Besch\u00e4digungen hat der Mieter auf eigene Kosten zu beseitigen. Vom Mieter vorgenommene bauliche Ver\u00e4nderungen, Einbauten, Werbeanlagen, Beschriftungen oder sonstige Einrichtungen sind auf Verlangen des Vermieters zu entfernen und der urspr\u00fcngliche Zustand wiederherzustellen. S\u00e4mtliche Schl\u00fcssel sind zur\u00fcckzugeben. \u00dcber die R\u00fcckgabe der Mietfl\u00e4che wird ein \u00dcbergabeprotokoll erstellt, das von beiden Parteien zu unterzeichnen ist.`,
  ]});
  clauses.push({ n:String(P.umsatzsteuer), t:'Umsatzsteuer', paras:[
    `Die Vermietung erfolgt umsatzsteuerfrei gem\u00e4\u00df \u00a7\u00a04 Nr.\u00a012 UStG. S\u00e4mtliche Betr\u00e4ge aus diesem Vertrag verstehen sich ohne Umsatzsteuer, solange der Vermieter keine Erkl\u00e4rung zur Aus\u00fcbung der Option zur Umsatzsteuer in Textform abgegeben hat.`,
    `Der Vermieter ist berechtigt, soweit die gesetzlichen Voraussetzungen hierf\u00fcr vorliegen, gem\u00e4\u00df \u00a7\u00a09 UStG zur Umsatzsteuer zu optieren. \u00dcbt der Vermieter die Option aus, teilt er dies dem Mieter in Textform unter Angabe des Zeitpunkts mit, ab dem die Umsatzsteuer zus\u00e4tzlich geschuldet wird. Ab diesem Zeitpunkt schuldet der Mieter die gesetzliche Umsatzsteuer zus\u00e4tzlich zur Miete und zu den Betriebskostenvorauszahlungen.`,
    `Voraussetzung der Option ist, dass der Mieter das Mietobjekt ausschlie\u00dflich f\u00fcr Ums\u00e4tze verwendet, die den Vorsteuerabzug nicht ausschlie\u00dfen. Der Mieter hat dem Vermieter auf Verlangen geeignete Nachweise \u00fcber seinen umsatzsteuerlichen Status vorzulegen und jede \u00c4nderung der ma\u00dfgeblichen Verh\u00e4ltnisse unverz\u00fcglich in Textform mitzuteilen.`,
    `Der Mieter haftet dem Vermieter f\u00fcr s\u00e4mtliche steuerlichen Nachteile, Nachforderungen, Zinsen, Kosten und Sch\u00e4den, die durch unrichtige Angaben des Mieters oder durch die nicht rechtzeitige Mitteilung einer \u00c4nderung der umsatzsteuerlichen Verh\u00e4ltnisse entstehen.`,
  ]});
  clauses.push({ n:String(P.datenschutz), t:'Datenschutz', paras:[
    `Personenbezogene Daten werden gem\u00e4\u00df Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO zur Vertragsabwicklung verarbeitet, nicht an Dritte weitergegeben und zehn Jahre nach Vertragsende gel\u00f6scht.`,
  ]});
  clauses.push({ n:String(P.sonstige), t:'Sonstige Vereinbarungen', paras:[
    `M\u00fcndliche Nebenabreden bestehen nicht. \u00c4nderungen und Erg\u00e4nzungen dieses Vertrages bed\u00fcrfen der Schriftform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im \u00dcbrigen wirksam. Gerichtsstand f\u00fcr alle Streitigkeiten aus diesem Vertrag ist ${d.gerichtsstand || '______________'}, soweit der Mieter Kaufmann, juristische Person des \u00f6ffentlichen Rechts oder \u00f6ffentlich-rechtliches Sonderverm\u00f6gen ist oder nach Vertragsschluss wird. Im \u00dcbrigen gilt der gesetzliche Gerichtsstand.`,
  ]});

  // ═══ FLOW BLOCKS (title stays with first paragraph; later paras may break) ══
  const CPL = 100, LH = 18.6; // kalibriert am gerenderten PDF (~115 Zeichen/Zeile, 100 = Sicherheitsmarge)
  const estH = html => {
    const segs = html.split(/<span style="display:block[^>]*>/);
    let lines = 0;
    segs.forEach(s => {
      const t = s.replace(/<[^>]*>/g, '').trim();
      lines += Math.max(1, Math.ceil(t.length / CPL));
    });
    return lines * LH;
  };
  // ═══ CLAUSE-ATOMIC BLOCKS (whole § stays together; page breaks only between §§) ══
  const blocks = [];
  clauses.forEach(c => {
    let h = 0;
    const parts = c.paras.map((p, i) => {
      if (i === 0) {
        h += 26 + estH(p);
        return `<div class="clause"><div class="clause__title">\u00a7\u00a0${c.n}\u2002${c.t}</div><div class="clause__body">${p}</div></div>`;
      }
      h += 11 + estH(p);
      return `<div class="clause" style="margin-top:5px"><div class="clause__body">${p}</div></div>`;
    });
    blocks.push({ html: parts.join('\n    '), h });
  });

  // Betriebskosten intro block (leads clause pages, kept together)
  const bkHtml = `${sec('Betriebskosten gem. \u00a7\u00a71,\u00a02 BetrKV',true,true)}
    <p class="nk-intro">Neben der Nettokaltmiete tr\u00e4gt der Mieter anteilig folgende Betriebskosten gem\u00e4\u00df \u00a7\u00a7\u00a01,\u00a02 BetrKV. Verwaltungskosten sind im Gewerbemietverh\u00e4ltnis umlagef\u00e4hig. Die Abrechnung erfolgt j\u00e4hrlich; der Mieter erh\u00e4lt die Abrechnung sp\u00e4testens zw\u00f6lf Monate nach Ende des Abrechnungszeitraums.</p>
    <div class="nk-grid">${nkRows}</div>`;
  const bkHeight = 40 + 100 + Math.ceil((NK_ITEMS.length) / 2) * 19 + 44;

  // Signature block (trails, kept together)
  const sigHtml = `<div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div><div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div><div class="comment-line"></div><div class="comment-line"></div>
    ${sigBlock()}`;
  const sigHeight = 90 + 84 + ((d.hasMieter2 || d.hasMieter3) ? 250 : 150);

  // ═══ FIXED PAGE PLAN (title-based; robust gegen §-Nummern-Shift) ═══════════
  const PAGE_PLAN = [
    // Mit §2 Abs. 7 (Sonderkündigungsrecht): §2 zu lang für geteilte Seite → eigene Seite;
    // §1 wandert unter die Betriebskosten-Übersicht (sonst stünde §1 allein auf einer Seite)
    ...(d.sonderkAn
      ? [['Nutzungszweck']]
      : [['Mietzeit und Beendigung', 'Nutzungszweck']]),
    ['Staffelmiete', 'Kaution', 'Aufrechnung, Zur\u00fcckbehaltung, Minderung', 'Nebenkosten und Abrechnung', 'Kleinreparaturen'],
    ['Gewerbehaftpflichtversicherung', 'Instandhaltung und Instandsetzung'],
    ['Au\u00dfenwerbung', 'Untervermietung und Nachmieter', 'Schl\u00fcssel\u00fcbergabe', 'Betreten des Mietobjekts'],
    ['R\u00fcckgabe bei Vertragsende', 'Umsatzsteuer', 'Datenschutz', 'Sonstige Vereinbarungen'],
  ];
  const pageBlocks = [[bkHtml]]; // Seite 3: Betriebskosten-\u00dcbersicht allein
  // Mit Sonderkündigungsrecht: §1 direkt unter die Betriebskosten-Übersicht
  if (d.sonderkAn) {
    const i1 = clauses.findIndex(c => c.t === 'Mietzeit und Beendigung');
    if (i1 >= 0) pageBlocks[0].push(blocks[i1].html);
  }
  const planPages = PAGE_PLAN.map(() => []);
  let lastIdx = 0;
  clauses.forEach((c, i) => {
    if (d.sonderkAn && c.t === 'Mietzeit und Beendigung') return; // bereits auf Betriebskosten-Seite
    const idx = PAGE_PLAN.findIndex(g => g.includes(c.t));
    const target = idx >= 0 ? idx : lastIdx; // unbekannte Klausel: zur Seite der vorherigen
    if (idx >= 0) lastIdx = idx;
    planPages[target].push(blocks[i].html);
  });
  planPages.forEach(p => { if (p.length) pageBlocks.push(p); });
  pageBlocks.push([sigHtml]); // eigene Seite: Sonstige Anmerkungen + Unterschriften

  // ═══ ASSEMBLE PAGES (sequential footer numbers) ════════════════════════════
  let pageNo = 3;
  const wrapPage = inner => `<div class="pdf-page page">
  ${hdr(d.aptName)}${ftr(pageNo++)}
  <div class="content">
    ${inner}
  </div>
</div>`;
  const clausePagesHtml = pageBlocks.map(bl => wrapPage(bl.join('\n    '))).join('');
  const inventarPage = d.moebliert ? wrapPage(`${sec('Anlage A \u2014 Inventar',true,false)}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anzahl</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>`) : '';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Gewerbemietvertrag \u2014 ${d.aptName}</title>
<style>${CSS}</style></head>
<body>${page1}${page1b}${clausePagesHtml}${inventarPage}</body></html>`;
}
