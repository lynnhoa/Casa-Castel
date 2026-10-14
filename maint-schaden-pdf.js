/* ─────────────────────────────────────────────────────────────
   MAINTENANCE — SCHADENSBERICHT PDF
   maint-schaden-pdf.js

   Same layout, CSS and pipeline as the Übergabeprotokoll (tab-rooms.js
   _renderUebergHTML · rentals-ueberg-pdf.js):
     · A4 .pdf-page · beige header (wordmark = property, right = Zimmer /
       Wohnung) · footer (address · page number) · Playfair Display + Lato
     · pdf-open.js ccRenderPagesToPdf → automatic page flow (nothing is cut
       off, sections move with their heading, tables continue), page numbers
     · cc-ueberg-photos.js → "Fotodokumentation" pages at the END
       (Fotomediathek or camera, 6 per page, Aufnahmedatum, Beschreibung)

   mtSbHTML(d) → 2 pages like the Übergabeprotokoll: page 1 = the damage
   (Schadensart, Objekt & Beteiligte, Schadensdaten, Hergang, Sofortmaßnahmen),
   page 2 = Kosten, Anlagen, Unterschriften. Longer text flows on by itself.
   d = data collected from the Schaden entry (maintenance.js mtSbData).

   Two families, exactly like the other documents:
     d.family 'casa'    → Casa Castel (tab-rooms.js): "Casa Castel" · Zimmer,
                          subtitle "Zimmervermietung · <Adresse>"
     d.family 'rentals' → Rentals (rentals-ueberg-pdf.js): apartment name ·
                          Wohnung, subtitle "<Wohnungstyp> · <Adresse>",
                          bold header label + Rentals line colours
   ───────────────────────────────────────────────────────────── */

'use strict';

const MT_SB_ARTEN = ['Leitungswasser', 'Sturm / Hagel', 'Feuer / Brand', 'Einbruch / Vandalismus',
  'Glasbruch', 'Feuchtigkeit / Schimmel', 'Elementar', 'Sonstiges'];

function mtSbHTML(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ── CSS: copied from the Übergabeprotokoll, plus the cost table + check grid ──
  const R = d.family === 'rentals';
  const F = R
    ? { lbl: 700, ftr: '#c9c2b8', sec: '#c9c2b8', box: '#4a4540' }       // rentals-ueberg-pdf.js
    : { lbl: 400, ftr: '#e8dbc5', sec: '#d8d3cc', box: '#888780' };      // tab-rooms.js (Casa Castel)
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
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400;
      color:#6e5128; line-height:1; }

    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid ${F.ftr}; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif;
      font-size:8px; font-weight:400; color:#6b645c; line-height:1; }

    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }

    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400;
      color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400;
      color:#6b645c; margin-bottom:22px; }

    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.13em; text-transform:uppercase; color:#4a4540;
      margin-top:34px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid ${F.sec}; }
    .sec--first { margin-top:12px; }

    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#2b2722;
      min-width:150px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; flex:1; line-height:1.55; }
    .kv__v .mu { color:#8a837a; }

    .write-line { border-bottom:0.5px solid #b8b3ac; height:24px; margin-top:3px; }
    .write-area { font-family:'Lato',sans-serif; font-size:12px; font-weight:400;
      color:#1a1a1a; line-height:1.55; padding-top:3px; white-space:pre-wrap; word-break:break-word; }

    /* Schadensart: the Einzug/Auszug check box, as a grid of 4 × 2 */
    .type-toggle { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px 14px;
      padding:11px 12px; background:#f7f4f0; border-radius:3px; border:0.5px solid #e8e2d8; margin-top:10px; }
    .type-option { display:inline-flex; align-items:center; gap:8px; font-family:'Lato',sans-serif;
      font-size:11px; font-weight:400; color:#1a1a1a; line-height:13px; min-height:13px; }
    .type-box { display:inline-block; width:13px; height:13px; border:1px solid ${F.box};
      border-radius:2px; flex-shrink:0; position:relative; }
    .type-box--checked { background:#1a1a1a; border-color:#1a1a1a; }
    .type-box--checked::after { content:''; position:absolute; top:2px; left:2px; width:7px; height:4px;
      border-left:1.5px solid white; border-bottom:1.5px solid white; transform:rotate(-45deg); display:block; }
    .inline-checks { display:inline-flex; gap:22px; }
    .inline-checks .type-option { font-size:12px; }

    /* Kosten: the Zählerstände table */
    .zaehler-table { width:100%; border-collapse:collapse; margin-top:10px; }
    .zaehler-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.12em; text-transform:uppercase; color:#4a4540;
      border-bottom:0.5px solid ${F.sec}; padding:3px 6px 5px 0; text-align:left; }
    .zaehler-table td { font-family:'Lato',sans-serif; font-size:11px; font-weight:400;
      color:#1a1a1a; padding:5px 6px 5px 0; vertical-align:top; border-bottom:0.5px solid #f0ece6; }
    .zaehler-table .r { text-align:right; padding-right:0; white-space:nowrap; }
    .zaehler-table tr.ret td { color:#4a4540; }
    .zaehler-table tr.ret td:first-child { padding-left:12px; }
    .zaehler-table tr.sum td { border-bottom:none; border-top:0.6px solid #c9c2b8; padding-top:7px;
      font-weight:700; font-size:11.5px; }
    .note { font-family:'Lato',sans-serif; font-size:9.5px; color:#6b645c; margin-top:8px; line-height:1.45; }

    .list { margin-top:6px; }
    .list div { font-family:'Lato',sans-serif; font-size:11.5px; color:#1a1a1a; line-height:1.55; padding:2px 0; }
    .list span { color:#6b645c; }

    .sig-block { margin-top:70px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:400; color:#4a4540; margin-bottom:4px; line-height:1.4; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#6b645c; margin-bottom:4px; }
    .sig-write-gap { height:62px; }
    .sig-ort-gap { height:22px; }
    .sig-ort-line { border:none; border-top:0.5px solid #b8b3ac; margin-bottom:5px; }
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
  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v || '<span class="mu">—</span>'}</span></div>`;
  const box = (on, label) => `<div class="type-option"><div class="type-box${on ? ' type-box--checked' : ''}"></div>${esc(label)}</div>`;
  const writeField = (text, lines) => text
    ? `<div class="write-area">${esc(text)}</div>`
    : Array(lines).fill('<div class="write-line"></div>').join('');
  const eur = (txt, n) => txt || (typeof ccFmtEUR === 'function' ? ccFmtEUR(n) : String(n ?? ''));

  const kosten = (d.kosten || []).map(k => `
        <tr class="${k.ret ? 'ret' : ''}">
          <td>${k.ret ? '↳ ' : ''}${esc(k.nr || '—')}</td><td>${esc(k.text)}</td><td>${esc(k.firma || '')}</td>
          <td>${esc(k.datum)}</td><td class="r">${k.ret ? '− ' : ''}${esc(eur(k.betragText, k.betrag))}</td>
        </tr>`).join('');

  return `<style>${CSS}</style>
<div class="pdf-page">
  ${hdr()}
  ${ftr(1)}
  <div class="content">
    <div class="doc-title">Schadensbericht</div>
    <div class="doc-subtitle">${esc(d.subtitle)}</div>

    <div class="sec sec--first">Schadensart</div>
    <div class="type-toggle">${MT_SB_ARTEN.map(a => box(a === d.schadensart, a)).join('')}</div>

    <div class="sec">Objekt &amp; Beteiligte</div>
    ${kv('Bericht', esc([d.nummer ? 'Nr. ' + d.nummer : '', 'Stand ' + d.stand, d.titel].filter(Boolean).join(' · ')))}
    ${kv('Objekt / Adresse', esc(d.adresse))}
    ${kv(esc(d.einheitLabel || 'Einheit') + ' / Bereich', esc([d.einheitWert, d.bereich].filter(Boolean).join(' · ')))}
    ${kv('Eigentümer / Vermieter', esc([d.vermieter, d.vermieterAdresse].filter(Boolean).join(', ')))}
    ${kv('Mieter', esc(d.mieter))}
    ${d.hausverwaltung ? kv('Hausverwaltung', esc(d.hausverwaltung)) : ''}
    ${kv('Versicherung', esc([d.versicherung, d.versicherungsnr ? 'Nr. ' + d.versicherungsnr : ''].filter(Boolean).join(' · ')))}
    ${kv('Schadennummer', esc(d.schadennummer))}

    <div class="sec">Schadensdaten</div>
    ${kv('Schadenstag', esc(d.schadenstag))}
    ${kv('Festgestellt am', esc(d.festgestellt))}
    ${kv('Behoben am', d.behoben ? esc(d.behoben) : '<span class="mu">noch offen</span>')}
    ${d.eigentum ? kv('Betroffen', `<span class="inline-checks">${box(d.eigentum === 'sonder', 'Sondereigentum')}${box(d.eigentum === 'gemeinschaft', 'Gemeinschaftseigentum')}</span>`) : ''}
    ${kv('Ursache / Verursacher', esc(d.ursache))}
    ${d.mieterInformiert ? kv('Mieter informiert am', esc(d.mieterInformiert)) : ''}
    ${d.polizei ? kv('Polizei-Aktenzeichen', esc(d.polizei)) : ''}

    <div class="sec">Schadenshergang</div>
    <div style="margin-top:4px;">${writeField(d.hergang, 5)}</div>

    <div class="sec">Sofortmassnahmen</div><!-- caps: ß → SS (html2canvas breaks on ß in uppercase headings) -->
    <div style="margin-top:4px;">${writeField(d.massnahmen, 3)}</div>
  </div>
</div>

<!-- PAGE 2: Kosten · Anlagen · Unterschriften (like the Übergabeprotokoll's page 2) -->
<div class="pdf-page">
  ${hdr()}
  ${ftr(2)}
  <div class="content">
    <div class="sec sec--first">Kosten</div>
    <table class="zaehler-table">
      <thead><tr><th style="width:15%">Nr.</th><th style="width:33%">Beschreibung</th><th style="width:22%">Firma / Marke</th><th style="width:14%">Datum</th><th class="r">Betrag</th></tr></thead>
      <tbody>${kosten}
        ${kosten ? '' : '<tr><td colspan="5" style="color:#8a837a">Keine Kosten erfasst</td></tr>'}
        <tr class="sum"><td colspan="4">Summe</td><td class="r">${esc(eur(d.summeText, d.summe))}</td></tr>
      </tbody>
    </table>
    ${d.kostentraeger ? `<div class="note">Kostenträger: ${esc(d.kostentraeger)}</div>` : ''}

    <div class="sec">Anlagen</div>
    <div class="list">${(d.anlagen || []).map(a => `<div>${esc(a.name)} <span>· ${esc(a.info)}</span></div>`).join('') || '<div><span>keine</span></div>'}</div>

    <div class="sig-block">
      <div class="sig-col">
        <div class="sig-prefill">${esc([d.ort, d.stand].filter(Boolean).join(', '))}</div><div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Eigentümer / Vermieter</div>
        <div class="sig-name">${esc(d.vermieter)}</div>
      </div>
      ${d.mieterZeile ? `<div class="sig-col">
        <div class="sig-ort-gap"></div><hr class="sig-ort-line"/><div class="sig-date-label">Ort, Datum</div><div class="sig-write-gap" style="height:36px"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Gesehen: Mieter</div>
        <div class="sig-name">${esc(d.mieter)}</div>
      </div>` : ''}
    </div>
  </div>
</div>`;
}
