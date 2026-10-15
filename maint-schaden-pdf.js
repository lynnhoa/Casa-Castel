/* ─────────────────────────────────────────────────────────────
   MAINTENANCE — SCHADENSBERICHT PDF
   maint-schaden-pdf.js

   A short, descriptive report for the Hausverwaltung (or for your own
   records at Casa Castel). Content and order follow the Wasserschaden
   report of 14.10.2026; layout, CSS and pipeline are the app's documents
   (Übergabeprotokoll: tab-rooms.js _renderUebergHTML · rentals-ueberg-pdf.js):
     · A4 .pdf-page · beige header (wordmark = property, right = Zimmer /
       Wohnung) · footer (address · page number) · Playfair Display + Lato
     · pdf-open.js ccRenderPagesToPdf → automatic page flow, page numbers
     · cc-ueberg-photos.js → "Fotodokumentation" pages at the END

   Schadensbericht – <Art>   an die Hausverwaltung · Stand …
   [Dringend: …]                                   (only if filled)
   01 Angaben zum Schaden   Objekt · Einheit · Raum · Feststellung ·
                            Besichtigung · Behoben (only what is known)
   02 Schadensbild          Description, one line = one point
   03 Vermutete Ursache     04 Sofortmaßnahmen     05 Bitte an die
   Hausverwaltung (apartments)     06 Anlagen      → empty ones are left out
   Ort, Datum · Eigentümer (name, e-mail)
   Longer than one page (d.split) → page 2 starts with "Bitte an die
   Hausverwaltung" (else "Anlagen"): page 1 not cramped, page 2 not empty.

   Two families, exactly like the other documents:
     d.family 'casa'    → Casa Castel (tab-rooms.js) look
     d.family 'rentals' → Rentals (rentals-ueberg-pdf.js) look
   ───────────────────────────────────────────────────────────── */

'use strict';

const MT_SB_ARTEN = ['Leitungswasser', 'Sturm / Hagel', 'Feuer / Brand', 'Einbruch / Vandalismus',
  'Glasbruch', 'Feuchtigkeit / Schimmel', 'Elementar', 'Sonstiges'];
/* Schadensart → the word in the title ("Schadensbericht – Wasserschaden") */
const MT_SB_TITEL = {
  'Leitungswasser': 'Wasserschaden', 'Sturm / Hagel': 'Sturm- / Hagelschaden', 'Feuer / Brand': 'Brandschaden',
  'Einbruch / Vandalismus': 'Einbruch / Vandalismus', 'Glasbruch': 'Glasbruch',
  'Feuchtigkeit / Schimmel': 'Feuchtigkeit / Schimmel', 'Elementar': 'Elementarschaden', 'Sonstiges': '',
};

function mtSbHTML(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const R = d.family === 'rentals';
  const F = R
    ? { lbl: 700, ftr: '#c9c2b8', sec: '#c9c2b8' }       // rentals-ueberg-pdf.js
    : { lbl: 400, ftr: '#e8dbc5', sec: '#d8d3cc' };      // tab-rooms.js (Casa Castel)
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .pdf-page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }

    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da;
      display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400;
      color:#6e5128; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:${F.lbl};
      letter-spacing:0.16em; text-transform:uppercase; color:#8a6535; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#6e5128; line-height:1; }

    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid ${F.ftr}; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif;
      font-size:8px; font-weight:400; color:#6b645c; line-height:1; }

    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }

    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400;
      color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400;
      color:#6b645c; margin-bottom:16px; }

    .alert { margin:0 0 8px; padding:9px 12px; background:#f6ece4; border-left:3px solid #a8553a; border-radius:0;
      font-family:'Lato',sans-serif; font-size:11px; line-height:1.5; color:#1a1a1a; }
    .alert b { font-weight:700; color:#a8553a; }

    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.13em; text-transform:uppercase; color:#4a4540;
      margin-top:18px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid ${F.sec}; }
    .sec--first { margin-top:12px; }
    .sec__n { color:#8a6535; margin-right:8px; }

    .kv { display:flex; padding:2.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#2b2722;
      min-width:150px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; flex:1; line-height:1.55; }

    .ul { margin-top:5px; }
    .li { display:flex; gap:9px; padding:1px 0; font-family:'Lato',sans-serif; font-size:12px; font-weight:400;
      color:#1a1a1a; line-height:1.55; }
    .li__b { flex-shrink:0; width:8px; color:#8a6535; }
    .li__t { flex:1; min-width:0; }
    .p { margin-top:6px; font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; line-height:1.55;
      white-space:pre-wrap; word-break:break-word; }
    .write-line { border-bottom:0.5px solid #b8b3ac; height:24px; margin-top:3px; }

    .sig-block { margin-top:26px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:400; color:#4a4540; margin-bottom:4px; line-height:1.4; }
    .sig-write-gap { height:92px; }   /* room to sign between "Ort, Datum" and the line (as in the Übergabeprotokoll) */
    .sig-line { border:none; border-top:0.5px solid #b8b3ac; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#4a4540; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#2b2722; margin-top:4px; }
  `;

  const hdr = () => `
    <div class="hdr">
      <span class="hdr__wordmark">${esc(d.objektName)}</span>
      ${d.einheitWert ? `<div class="hdr__room">
        <span class="hdr__room-label">${esc(d.einheitLabel)}</span>
        <span class="hdr__room-name">${esc(d.einheitWert)}</span>
      </div>` : ''}
    </div>`;
  const ftr = n => `
    <div class="ftr">
      <hr class="ftr__rule"/>
      <div class="ftr__row"><span>${esc(d.footerAdresse)}</span><span>${n}</span></div>
    </div>`;
  const kv = (k, v) => (v ? `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${esc(v)}</span></div>` : '');
  // "one line = one point" (leading -, •, * are dropped)
  const points = t => String(t || '').split(/\n+/).map(x => x.replace(/^\s*[-–•*]\s*/, '').trim()).filter(Boolean);
  const list = t => `<div class="ul">${points(t).map(x => `<div class="li"><span class="li__b">•</span><span class="li__t">${esc(x)}</span></div>`).join('')}</div>`;

  // only the sections that have something to say, numbered in order · D17: points or text per box
  const S = d.styles || {};
  const has = t => points(t).length > 0;
  const txt = (t, st) => (st === 'text' ? `<div class="p">${esc(String(t || '').trim())}</div>` : list(t));
  const parts = [];
  if (d.mode === 'rb') {                                    // Renovierungsbericht
    parts.push({ key: 'angaben', title: 'Angaben zur Renovierung', body: (d.angaben || []).map(([k, v]) => kv(k, v)).join('') });
    (d.sections || []).forEach(s2 => {
      if (s2.kv) { if (s2.kv.length) parts.push({ key: s2.key, title: s2.title, body: s2.kv.map(([k, v]) => kv(k, v)).join('') }); }
      else if (has(s2.text)) parts.push({ key: s2.key, title: s2.title, body: txt(s2.text, s2.style) });
    });
  } else {                                                  // Schadensbericht
    parts.push({ key: 'angaben', title: 'Angaben zum Schaden', body:
      kv('Objekt', d.adresse) +
      kv('Betroffene Einheit', d.einheit) +
      kv('Betroffener Raum', d.raum) +
      kv('Schadenstag', d.schadenstag) +
      kv('Feststellung', d.feststellung) +
      kv('Besichtigung vor Ort', d.besichtigung) +
      kv('Behoben am', d.behoben) +
      kv('Polizei-Aktenzeichen', d.polizei) });
    parts.push({ key: 'bild', title: 'Schadensbild', body: has(d.schadensbild) ? txt(d.schadensbild, S.schadensbild || 'list')
      : '<div style="margin-top:4px;">' + Array(4).fill('<div class="write-line"></div>').join('') + '</div>' });
    if (has(d.ursache)) parts.push({ key: 'ursache', title: 'Vermutete Schadensursache', body: txt(d.ursache, S.ursache || 'text') });
    if (has(d.massnahmen)) parts.push({ key: 'massnahmen', title: 'Durchgeführte Sofortmassnahmen', body: txt(d.massnahmen, S.massnahmen || 'list') });   // caps: ß → SS (html2canvas)
    if (R && has(d.bitteHv)) parts.push({ key: 'ask', title: 'Bitte an die Hausverwaltung', body: txt(d.bitteHv, S.bitte_hv || 'list') });
  }
  if ((d.anlagen || []).length) parts.push({ key: 'anlagen', title: 'Anlagen', body: list(d.anlagen.join('\n')) });

  // Too long for one page (d.split, measured by maintenance.js) → page 2 starts with
  // "Bitte an die Hausverwaltung" (else "Anlagen"), so page 1 is not cramped and page 2 not empty
  let cut = parts.length;
  if (d.split) {
    const i = parts.findIndex(x => x.key === 'ask');
    const j = i >= 0 ? i : parts.findIndex(x => x.key === 'anlagen');
    if (j > 0) cut = j;
  }
  let n = 0;
  const render = (list, firstOnPage) => list.map((x, k) =>
    `<div class="sec${k === 0 && firstOnPage ? ' sec--first' : ''}"><span class="sec__n">${String(++n).padStart(2, '0')}</span>${x.title}</div>${x.body}`).join('\n');
  const sig = `
    <div class="sig-block">
      <div class="sig-col">
        <div class="sig-prefill">${esc([d.ort, d.datum || d.stand].filter(Boolean).join(', '))}</div><div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Ort, Datum</div>
      </div>
      <div class="sig-col">
        <div class="sig-prefill">&nbsp;</div><div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">${esc(['Eigentümer', d.einheit].filter(Boolean).join(' · '))}</div>
        <div class="sig-name">${esc([d.vermieter, d.kontakt].filter(Boolean).join(' · '))}</div>
      </div>
    </div>`;
  const page = (n, inner) => `
<div class="pdf-page">
  ${hdr()}
  ${ftr(n)}
  <div class="content">${inner}</div>
</div>`;
  const head = `
    <div class="doc-title">${esc(d.titel)}</div>
    <div class="doc-subtitle">${esc(d.subtitle)}</div>
    ${d.dringend ? `<div class="alert"><b>Dringend:</b> ${S.dringend === 'list' ? list(d.dringend) : esc(d.dringend)}</div>` : ''}`;
  const one = render(parts.slice(0, cut), !d.dringend);
  const two = cut < parts.length ? render(parts.slice(cut), true) : '';

  return `<style>${CSS}</style>` + (two
    ? page(1, head + one) + page(2, two + sig)
    : page(1, head + one + sig));
}
