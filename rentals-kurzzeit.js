/* ═══════════════════════════════════════════════════════════════════════════
 *  CASA CASTEL — KURZZEIT MIETVERTRAG (RENTALS / WOHNUNGSVERMIETUNG)
 *  Append this entire file to the end of rentals-tab-apartments.js
 *
 *  Adapted from kurzzeitMietvertragTemplate.ts (WG Zimmervermietung).
 *  Changes vs WG version:
 *    • Subtitle / header label  → WOHNUNG (not ZIMMER)
 *    • Mietobjekt kv            → Wohnungsgröße (not Zimmergröße)
 *    • Clause §2 NK text        → full §§1,2 BetrKV list (Hausverwaltung-safe)
 *    • Nutzungsrechte intro     → Wohnfläche wording (not Zimmer + Gemeinschaft)
 *    • Clause §6 Übergabe       → Wohnung wording
 *    • Everything else identical to WG kurzzeit structure.
 *
 *  Contains:
 *    _buildRentalKurzzeitData()       — data builder + Zahlungsplan compute
 *    _renderRentalKurzzeitHTML()      — 3-page PDF HTML
 *    _generateRentalKurzzeitPDF()     — html2canvas + jsPDF
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ── DATA BUILDER ─────────────────────────────────────────────────────────── */

function _buildRentalKurzzeitData(apt, s, {
  mieterName, mieterAdr, mieterDob, mieterEmail,
  mieterName2 = '', mieterAdr2 = '', mieterDob2 = '', mieterEmail2 = '', mieterTel2 = '',
  mieterName3 = '', mieterAdr3 = '', mieterDob3 = '', mieterEmail3 = '', mieterTel3 = '',
  startVal, endVal, sigVal,
  kautionVal, kautionFael = '5',
}) {
  const fmt = d => {
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' +
           dt.getFullYear();
  };

  const p  = apt.pricing   || {};
  const sk = apt.schlussel || {};

  // Pricing: use kurzzeit-specific rates if set, else fall back to standard
  const kzKalt = Number(p.kurzzeit_kaltmiete) || Number(p.kaltmiete) || 0;
  const kzNk   = Number(p.kurzzeit_nk)        || Number(p.nk_pauschale) || 0;
  const monatlMiete = kzKalt + kzNk;

  // Date maths
  const start   = new Date(startVal);
  const end     = new Date(endVal);

  // Days in first and last month
  const daysInFirstMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const daysInLastMonth  = new Date(end.getFullYear(),   end.getMonth()   + 1, 0).getDate();

  const ersterMonatAnteilig  = start.getDate() !== 1;
  const letzterMonatAnteilig = end.getDate()   !== daysInLastMonth;

  const ersterMonatTage      = ersterMonatAnteilig  ? daysInFirstMonth  - start.getDate() + 1 : null;
  const letzterMonatTage     = letzterMonatAnteilig ? end.getDate()                           : null;
  const ersterMonatTagespreis  = ersterMonatAnteilig  ? monatlMiete / daysInFirstMonth : null;
  const letzterMonatTagespreis = letzterMonatAnteilig ? monatlMiete / daysInLastMonth  : null;
  const ersterMonatBetrag    = ersterMonatAnteilig  ? ersterMonatTagespreis  * ersterMonatTage  : null;
  const letzterMonatBetrag   = letzterMonatAnteilig ? letzterMonatTagespreis * letzterMonatTage : null;

  // Count full months between (exclusive of partial first/last)
  let fullMonthStart = new Date(start);
  if (ersterMonatAnteilig) {
    fullMonthStart = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }
  let fullMonthEnd = new Date(end);
  if (letzterMonatAnteilig) {
    fullMonthEnd = new Date(end.getFullYear(), end.getMonth(), 0);
  }
  const fullMonths = Math.max(0,
    (fullMonthEnd.getFullYear() - fullMonthStart.getFullYear()) * 12 +
    (fullMonthEnd.getMonth()    - fullMonthStart.getMonth()) + 1
  );
  const weitereZahlungen = fullMonths > 1;

  // Gesamtmiete
  const gesamtmiete =
    (ersterMonatBetrag  || (!ersterMonatAnteilig  ? monatlMiete : 0)) +
    (letzterMonatBetrag || (!letzterMonatAnteilig ? monatlMiete : 0)) +
    Math.max(0, fullMonths - (ersterMonatAnteilig ? 0 : 1) - (letzterMonatAnteilig ? 0 : 1)) * monatlMiete;

  // Zahlungsplan
  const monthName = d => d.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  const fmtDate   = d => fmt(d);

  let zahlung1Betrag, zahlung1Beschreibung, zahlung1Faellig;
  let weitereZahlungenBetrag = null;
  let letzteZahlungBetrag, letzteZahlungBeschreibung, letzteZahlungFaellig;

  if (ersterMonatAnteilig) {
    zahlung1Betrag       = ersterMonatBetrag + (fullMonths >= 1 ? monatlMiete : 0);
    zahlung1Beschreibung = ersterMonatBetrag !== null
      ? `Anteil ${monthName(start)}` + (fullMonths >= 1 ? ` + ${monthName(fullMonthStart)}` : '')
      : monthName(start);
    zahlung1Faellig = fmtDate(start);
  } else {
    zahlung1Betrag       = monatlMiete;
    zahlung1Beschreibung = monthName(start);
    zahlung1Faellig      = fmtDate(start);
  }

  if (weitereZahlungen) {
    weitereZahlungenBetrag = monatlMiete;
  }

  if (letzterMonatAnteilig) {
    letzteZahlungBetrag       = letzterMonatBetrag;
    letzteZahlungBeschreibung = `Anteil ${monthName(end)}`;
    letzteZahlungFaellig      = fmtDate(new Date(end.getFullYear(), end.getMonth(), 1));
  } else {
    letzteZahlungBetrag       = monatlMiete;
    letzteZahlungBeschreibung = monthName(end);
    letzteZahlungFaellig      = fmtDate(new Date(end.getFullYear(), end.getMonth(), 1));
  }

  // Inventar
  const inventar = (apt.inventar || []).map(i => ({
    gegenstand: i.name || i.gegenstand || '',
    anzahl:     i.anzahl || 1,
  }));

  return {
    vermieterName:    s.vermieter_name    || '',
    vermieterAdresse: s.vermieter_adresse || '',
    vermieterEmail:   s.vermieter_email   || '',
    vermieterSig:     s.vermieter_name    || '',
    objektAdresse:    apt.adresse         || '',
    objektPLZOrt:     apt.plz_ort         || '',
    footerAdresse:    apt.adresse
                        ? apt.adresse + (apt.plz_ort ? ' \u00b7 ' + apt.plz_ort : '')
                        : (apt.plz_ort || ''),
    kontoinhaber:     s.kontoinhaber      || '',
    bankname:         s.bankname          || '',
    iban:             s.iban              || '',
    bic:              s.bic               || '',
    gerichtsstand:    apt.gerichtsstand    || '',
    unterschriftOrt:  apt.unterschrift_ort || '',
    mieterName,
    mieterAdresse:      mieterAdr   || '',
    mieterGeburtsdatum: mieterDob   || '',
    mieterEmail:        mieterEmail || '',
    wohnungName:        apt.name,
    wohnungFlaeche:     apt.flaeche_m2 || 0,
    etage:              apt.floor || '',
    gemeinschaftsraeume: '',   // apartments don't have shared-room lists
    mietbeginn:  startVal ? fmt(new Date(startVal)) : '',
    mietende:    endVal   ? fmt(new Date(endVal))   : '',
    monatlMiete,
    gesamtmiete,
    ersterMonatAnteilig,
    letzterMonatAnteilig,
    ersterMonatTage,
    ersterMonatTagespreis,
    ersterMonatBetrag,
    letzterMonatTage,
    letzterMonatTagespreis,
    letzterMonatBetrag,
    weitereZahlungen,
    zahlung1Betrag,
    zahlung1Beschreibung,
    zahlung1Faellig,
    weitereZahlungenBetrag,
    letzteZahlungBetrag,
    letzteZahlungBeschreibung,
    letzteZahlungFaellig,
    kaution:              Number(kautionVal) || monatlMiete,
    kautionFaelText:      kautionFael === 'sofort' ? 'sofort nach Vertragsunterzeichnung' : `binnen ${kautionFael}\u00a0Tagen`,
    hausstuerschluessel:  sk.haustuerschluessel  || 1,
    wohnungsschluessel:   sk.wohnungsschluessel   || 1,
    inventar,
    unterzeichnungsDatum: sigVal ? fmt(new Date(sigVal)) : '',
    hasMieter2: !!(mieterName2 && mieterName2.trim()),
    mieterName2, mieterAdresse2: mieterAdr2, mieterGeburtsdatum2: mieterDob2, mieterEmail2,
    hasMieter3: !!(mieterName3 && mieterName3.trim()),
    mieterName3, mieterAdresse3: mieterAdr3, mieterGeburtsdatum3: mieterDob3, mieterEmail3,
  };
}


/* ── PDF HTML RENDERER ────────────────────────────────────────────────────── */

function _renderRentalKurzzeitHTML(d) {

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
    .clause--first { margin-top:16px; }
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

  const hdr = name => `<div class="hdr"><span class="hdr__wordmark"></span><div class="hdr__room"><span class="hdr__room-label">Wohnung</span><span class="hdr__room-name">${name}</span></div></div>`;
  const ftr = n    => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${d.footerAdresse}</span><span>${n}</span></div></div>`;
  const kv  = (k,v)=> `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const sec = (t,lg,first) => `<div class="sec${lg?' sec--lg':''}${first?' sec--first':''}">${t}</div>`;
  const cl  = (num,title,body,first) => `<div class="clause${first?' clause--first':''}"><div class="clause__title">\u00a7\u00a0${num}\u2002${title}</div><div class="clause__body">${body}</div></div>`;

  const hasMultiMieter = d.hasMieter2 || d.hasMieter3;

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

  // Full §§ 1, 2 BetrKV list — same as Mietvertrag, broad / Hausverwaltung-safe
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
    ? d.inventar.map(i => `<tr><td>${i.gegenstand}</td><td>${i.anzahl}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:#aaa59e;font-size:10px;padding-top:6px;">Kein Inventar hinterlegt</td></tr>`;

  // ── PAGE 1: Parteien, Mietobjekt, Mietzeit & Mietzins, Zahlungsplan ───────

  const mieteTopBlock = `
    ${sec('Mietzeit &amp; Mietzins',true,false)}
    ${kv('Mietbeginn',d.mietbeginn||'\u2014')}${kv('Mietende',d.mietende||'\u2014')}
    ${d.ersterMonatAnteilig ? kv('Anteil erster Monat', eur(d.ersterMonatBetrag) + '\u2002(' + d.ersterMonatTage + ' Tage \u00d7 ' + eur(d.ersterMonatTagespreis) + '/Tag)') : ''}
    ${kv('Monatliche Miete', eur(d.monatlMiete) + '\u2002/ Monat (Vollmonat, pauschal inkl. NK)')}
    ${d.letzterMonatAnteilig ? kv('Anteil letzter Monat', eur(d.letzterMonatBetrag) + '\u2002(' + d.letzterMonatTage + ' Tage \u00d7 ' + eur(d.letzterMonatTagespreis) + '/Tag)') : ''}
    <div class="total-box"><span class="total-box__label">Gesamtmiete:</span><span class="total-box__value">${eur(d.gesamtmiete)}</span></div>`;

  const mieteRestBlock = `
    ${sec('Zahlungsplan &amp; Bankverbindung',true,false)}
    ${kv('1. Zahlung', eur(d.zahlung1Betrag) + '\u2002(' + d.zahlung1Beschreibung + '), f\u00e4llig am ' + d.zahlung1Faellig)}
    ${d.weitereZahlungen ? kv('Weitere Zahlungen', eur(d.weitereZahlungenBetrag) + '\u2002monatlich, jeweils f\u00e4llig 3.\u00a0Werktag') : ''}
    ${kv('Letzte Zahlung', eur(d.letzteZahlungBetrag) + '\u2002(' + d.letzteZahlungBeschreibung + '), f\u00e4llig am ' + d.letzteZahlungFaellig)}
    ${kv('Kaution', eur(d.kaution) + '\u2002(f\u00e4llig ' + d.kautionFaelText + (d.kautionFaelText.startsWith('sofort') ? ')' : ' nach Unterzeichnung)'))}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber',d.kontoinhaber)}${d.bankname?kv('Bank',d.bankname):''}${kv('IBAN',d.iban)}${kv('BIC',d.bic)}
    <p class="note">Alle Zahlungen per \u00dcberweisung. Verwendungszweck: ${d.wohnungName} \u2013 Miete Monat Jahr / Kaution.</p>`;

  const page1 = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(1)}
  <div class="content">
    <div class="doc-title">Kurzzeitmiete</div>
    <div class="doc-subtitle">Befristetes Mietverh\u00e4ltnis \u00b7 Wohnungsvermietung</div>
    ${sec('Vermieter',false,true)}
    ${kv('Name',d.vermieterName)}${kv('Adresse',d.vermieterAdresse)}
    ${d.vermieterEmail?kv('E-Mail',d.vermieterEmail):''}
    ${sec('Mieter'+(hasMultiMieter?' 1':''),false,false)}
    ${kv('Name',d.mieterName)}
    ${kv('Adresse',d.mieterAdresse||'')}
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
    ${kv('Adresse',d.objektAdresse)}${kv('Bezeichnung',d.wohnungName)}
    ${d.etage ? kv('Etage',d.etage) : ''}
    ${kv('Wohnungsgr\u00f6\u00dfe','ca.\u00a0'+d.wohnungFlaeche+'\u00a0m\u00b2')}
    ${kv('M\u00f6blierung','M\u00f6bliert\u2002\u00b7\u2002Inventar siehe Anlage\u00a0A')}
    ${mieteTopBlock}
  </div>
</div>`;

  // PAGE 1B — always: Zahlungsplan & Bankverbindung
  const page1b = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(2)}
  <div class="content">
    ${mieteRestBlock}
  </div>
</div>`;

  const pageOffset = 1;

  // ── PAGE 2: NK-Liste + Klauseln §1–§8 ─────────────────────────────────────

  const page2 = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(2+pageOffset)}
  <div class="content">
    ${sec('Betriebskosten gem. \u00a7\u00a71,\u00a02 BetrKV',true,true)}
    <p class="nk-intro">Die monatliche Miete versteht sich als Warmmiete pauschal inkl. aller nachfolgenden Betriebskosten gemäß §§\u00a01,\u00a02 BetrKV. Umlageschlüssel: Wohnfläche der Mietwohnung im Verhältnis zur Gesamtwohnfläche des Gebäudes. Heizung und Warmwasser werden nach den Vorschriften der Heizkostenverordnung abgerechnet. Entstehen nach Vertragsschluss neue Betriebskosten i.\u202fS.\u202fd. BetrKV, können diese vom Vermieter auf den Mieter umgelegt werden.</p>
    <div class="nk-grid">${nkRows}</div>
    ${cl('1','Befristung und Beendigung',
      'Das Mietverhältnis ist gemäß \u00a7\u00a0575 Abs.\u00a01 Nr.\u00a03 BGB auf ausdrücklichen Wunsch des Mieters befristet. Das Mietverhältnis endet am ' + d.mietende + ' automatisch ohne Kündigung. Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen. Ein Anspruch auf Verlängerung besteht nicht.',
      true)}
    ${cl('2','Mietzins &amp; Anteilige Berechnung',
      'Die monatliche Pauschalmiete beträgt ' + eur(d.monatlMiete) + '. Zieht der Mieter nicht zum ersten eines Monats ein oder zum letzten eines Monats aus, werden die Tage anteilig berechnet. Der Tagespreis ergibt sich aus der Monatsmiete geteilt durch die tatsächliche Anzahl der Kalendertage des jeweiligen Monats. Alle Nebenkosten (Betriebskosten gemäß obiger Liste) sind in der Pauschale enthalten.')}
    ${cl('3','Fälligkeit der Mietzahlungen',
      'Die Miete ist jeweils spätestens bis zum dritten Werktag des fälligen Monats zu überweisen (\u00a7\u00a0556b BGB). Bei Zahlungsverzug ist der Vermieter berechtigt, Verzugszinsen gemäß \u00a7\u00a0288 BGB geltend zu machen.')}
    ${cl('4','Kaution',
      'Der Mieter zahlt eine Kaution von ' + eur(d.kaution) + ' ' + d.kautionFaelText + (d.kautionFaelText.startsWith('sofort') ? '' : ' nach Unterzeichnung') + '. Der Vermieter legt die Barkaution getrennt von seinem Vermögen auf einem Kautionskonto an (\u00a7\u00a0551 BGB). Vom Mieter selbstverschuldete Schäden werden von der Kaution abgezogen. Kleinreparaturen bis 100\u202f\u20ac pro Schadensfall gehen zu Lasten des Mieters (\u00a7\u00a0535 BGB). Der verbleibende Betrag wird nach Prüfung des Zustands zurückerstattet.')}
    ${cl('5','Schlüsselübergabe',
      'Der Mieter erhält bei Einzug ' + d.hausstuerschluessel + '\u00a0Haustürschlüssel und ' + d.wohnungsschluessel + '\u00a0Wohnungsschlüssel. Alle Schlüssel sind bei Auszug zurückzugeben. Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs.')}
    ${cl('6','Zustand &amp; Übergabe',
      'Die Wohnung wird möbliert und in vertragsgemäßem Zustand übergeben. Ein Übergabeprotokoll wird bei Ein- und Auszug erstellt und von beiden Parteien unterzeichnet. Die Wohnung ist in gleichem Zustand zurückzugeben.')}
    ${cl('7','Haftpflichtversicherung',
      'Der Mieter ist verpflichtet, für die Dauer des Mietverhältnisses eine gültige private Haftpflichtversicherung zu unterhalten und dem Vermieter auf Verlangen nachzuweisen.')}
    ${cl('8','Hausordnung',
      'Rauchen ist im gesamten Gebäude nicht gestattet. Haustiere sind ohne schriftliche Zustimmung nicht erlaubt. Untervermietung ist untersagt. Nachtruhe gilt von 22:00–07:00\u202fUhr.')}
  </div>
</div>`;

  // ── PAGE 3: §9–§10, Anmerkungen, Unterschriften ─────────────────────────────

  const page3 = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(3+pageOffset)}
  <div class="content">
    ${cl('9','Datenschutz',
      'Personenbezogene Daten werden ausschließlich zur Vertragsabwicklung gespeichert (Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO) und nach Ablauf der gesetzlichen Aufbewahrungsfrist gelöscht.',true)}
    ${cl('10','Salvatorische Klausel &amp; Gerichtsstand',
      'Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Es gilt deutsches Recht. Gerichtsstand ist ' + (d.gerichtsstand || '______________') + '.')}
    <div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div>
    ${sigBlock()}
  </div>
</div>`;

  const page4 = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(4+pageOffset)}
  <div class="content">
    ${sec('Anlage A \u2014 Inventar',true,true)}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anzahl</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Kurzzeitmiete \u2014 ${d.wohnungName}</title>
<style>${CSS}</style></head>
<body>${page1}${page1b}${page2}${page3}${page4}</body></html>`;
}


/* ── PDF GENERATOR ────────────────────────────────────────────────────────── */

async function _generateRentalKurzzeitPDF() {
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
  const wohnungName = container.querySelector('.hdr__room-name')?.textContent?.trim() || 'Wohnung';
  const mieterName  = [...(container.querySelectorAll('.kv__v')||[])]
    .find(el => el.previousElementSibling?.textContent?.includes('Name'))
    ?.textContent?.trim() || 'Mieter';
  pdf.save(`Kurzzeitmiete_${wohnungName}_${mieterName.replace(/\s+/g,'_')}.pdf`);
}
