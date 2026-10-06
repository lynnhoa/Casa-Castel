/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — MIETBÜRGSCHAFT (optional last page of a contract)
   cc-buergschaft.js   (landlord.html after tab-tenants.js,
                        rentals-index.html after the contract scripts)

   · Generator: a switch "Add Mietbürgschaft" at the end of the form,
     off by default. Only in Mietvertrag + Mietvertrag befristet:
       Casa Castel  → Rooms tab   (_contractBodyKurzzeit / _contractBodyMietvertrag)
       Rentals      → Apartments  (_aptBodyKurzzeit / _aptBodyMietvertrag)
     Not in Gewerbe or Parking.
   · Switched on: the Bürgschaft is added as the LAST page of the same
     PDF (Draft and Approve), so it is saved to Documents with the contract.
   · The page is neutral: no logo, no header/footer, plain A4.
     Pre-filled: tenant name, "des Zimmers London" / "der Wohnung …",
     address of the rented property. Everything about the guarantor is
     left blank to fill in by hand. Text = her template, unchanged.

   Works by wrapping the existing body + render functions, so the big
   generator files stay as they are.
   ───────────────────────────────────────────────────────────── */

(function () {
  const SWITCH_ID = 'ccBgOn';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── Switch in the generator ───────────────────────────── */
  function css() {
    if (document.getElementById('cc-bg-css')) return;
    const st = document.createElement('style');
    st.id = 'cc-bg-css';
    st.textContent = `
      .cc-bg-switch{display:flex;align-items:center;gap:12px;margin:18px 0 6px;padding:12px 14px;border:0.5px solid var(--cc-rule,#E0DAD0);border-radius:10px;background:var(--cc-white,#FDFCFA);cursor:pointer;-webkit-tap-highlight-color:transparent;}
      .cc-bg-switch input{position:absolute;opacity:0;width:0;height:0;}
      .cc-bg-switch__ui{position:relative;width:38px;height:22px;flex-shrink:0;border-radius:11px;background:#D9D2C7;transition:background .15s;}
      .cc-bg-switch__ui::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s;}
      .cc-bg-switch input:checked + .cc-bg-switch__ui{background:var(--cc-ink,#1E1B18);}
      .cc-bg-switch input:checked + .cc-bg-switch__ui::after{transform:translateX(16px);}
      .cc-bg-switch__txt{display:flex;flex-direction:column;gap:2px;min-width:0;}
      .cc-bg-switch__txt b{font-size:13px;font-weight:500;color:var(--cc-ink,#1E1B18);}
      .cc-bg-switch__txt small{font-size:11px;color:var(--cc-taupe,#9A8E7E);line-height:1.35;}`;
    document.head.appendChild(st);
  }
  function switchHTML() {
    css();
    return `<label class="cc-bg-switch" for="${SWITCH_ID}">
      <input type="checkbox" id="${SWITCH_ID}"/>
      <span class="cc-bg-switch__ui" aria-hidden="true"></span>
      <span class="cc-bg-switch__txt"><b>Add Mietbürgschaft</b>
        <small>Extra last page for a guarantor (e.g. a parent) — neutral, no logo, filled in by hand.</small></span>
    </label>`;
  }
  const isOn = () => !!document.getElementById(SWITCH_ID)?.checked;

  /* ── The page ──────────────────────────────────────────── */
  function address(d) {
    const a = (d.objektAdresse || '').trim(), p = (d.objektPLZOrt || '').trim();
    if (a && p && !a.includes(p)) return a + ', ' + p;
    return a || p;
  }
  /* A fill-in line. Plain block layout (no flex inside): the PDF renderer
     (html2canvas) then puts the text ON the line, not through it. */
  function line(value, flex) {
    return `<span style="flex:${flex || 1};min-width:0;display:block;box-sizing:content-box;height:24px;line-height:24px;border-bottom:0.8px solid #1a1a1a;padding:0 0 0 6px;font-weight:400;white-space:nowrap;overflow:hidden;">${value ? esc(value) : ''}</span>`;
  }
  function hint(text, left) {
    return `<div style="font-size:9.5px;font-weight:300;color:#8a8580;margin:3px 0 14px ${left || 0}px;">${text}</div>`;
  }
  // Labels and lines share one 24px line box, so all text sits on the same baseline
  function row(inner, top) {
    return `<div style="display:flex;align-items:flex-start;gap:10px;font-size:12.5px;font-weight:300;line-height:24px;${top ? 'margin-top:' + top + 'px;' : ''}">${inner}</div>`;
  }
  const lbl = t => `<span style="display:block;height:24px;line-height:24px;white-space:nowrap;flex-shrink:0;">${t}</span>`;
  const P = t => `<p style="font-size:12.5px;font-weight:300;line-height:1.75;margin:0 0 14px;text-align:justify;">${t}</p>`;

  function pageHTML(d, kind) {
    const name   = (d.mieterName || '').trim();
    const objekt = kind === 'Wohnung'
      ? 'der Wohnung'
      : 'des Zimmers';
    const objName = kind === 'Wohnung' ? (d.wohnungName || d.zimmerName || '') : (d.zimmerName || '');
    return `
<div class="pdf-page page cc-bg-page" style="position:relative;width:794px;height:1123px;box-sizing:border-box;margin:0;padding:96px 92px 80px;background:#ffffff;font-family:'Lato',Arial,sans-serif;color:#1a1a1a;overflow:hidden;">
  <div style="font-size:22px;font-weight:700;letter-spacing:.02em;margin:0 0 34px;">Mietbürgschaft</div>
  ${row(lbl('Hiermit übernehme ich,') + line(''))}
  ${hint('[Name des Bürgen in Druckbuchstaben]', 150)}
  ${row(lbl('wohnhaft') + line(''))}
  ${hint('[Anschrift des Bürgen]', 70)}
  ${row(lbl('geboren am') + line('', .8) + lbl('in') + line(''))}
  ${row(lbl('mit Personalausweis Nr.') + line(''), 22)}
  <div style="height:14px"></div>
  ${row(lbl('für alle Verpflichtungen meines Sohnes / meiner Tochter,') + line(name))}
  ${hint('[Name des Kindes]', 390)}
  ${row(lbl('aus dem Mietverhältnis ' + objekt) + line(objName) + lbl('in'))}
  ${row(line(address(d)), 8)}
  ${hint('[Anschrift der neuen Mietwohnung]')}
  ${P('die selbstschuldnerische Bürgschaft für Mietrückstände, Verfahrens- und Prozesskosten und für die künftig fällig werdenden Zahlungsansprüche des Vermieters auf Nutzungsentschädigung und sonstige, sich aus dem Mietverhältnis ergebenen Zahlungen.')}
  ${P('Ferner verpflichte ich mich gegenüber dem Vermieter unbedingt, unbefristet sowie selbstschuldnerisch – und zwar unter dem ausdrücklichen Verzicht auf die Einrede der Anfechtbarkeit, Aufrechenbarkeit und der Vorausklage gem. §§ 770, 771 BGB und erkläre mich bereit, Zahlung auf erstes Anfordern zu leisten.')}
  ${P('Ich bürge nur für rechtmäßige und fällige Forderungen. Mir ist der Inhalt des o. g. Mietvertrages mit allen Anlagen bekannt.')}
  ${P('Diese Bürgschaft wird freiwillig und zusätzlich zur Kaution ausgestellt und enthebt den Mieter nicht von seinen Pflichten der Vertragserfüllung, wie z. B. der pünktlichen Mietzahlung, sondern dient der Absicherung des Vermieters.')}
  <div style="display:flex;gap:40px;margin-top:56px;">
    <div style="flex:1">${line('')}${hint('Ort, Datum')}</div>
    <div style="flex:1">${line('')}${hint('Unterschrift Bürge')}</div>
  </div>
</div>`;
  }

  /* Add the page at the end of a rendered contract (before </body> when the
     template returns a whole document) */
  function appendPage(html, d, kind) {
    if (!isOn() || !d) return html;
    const page = pageHTML(d, kind);
    const i = html.lastIndexOf('</body>');
    return i >= 0 ? html.slice(0, i) + page + html.slice(i) : html + page;
  }

  /* ── Wrap the generators (only those that exist on this page) ── */
  function wrap(name, fn) {
    const orig = window[name];
    if (typeof orig !== 'function' || orig._ccBg) return;
    const w = function () { return fn(orig, this, arguments); };
    w._ccBg = true;
    window[name] = w;
  }
  // Form: switch at the end
  ['_contractBodyKurzzeit', '_contractBodyMietvertrag', '_aptBodyKurzzeit', '_aptBodyMietvertrag']
    .forEach(n => wrap(n, (orig, self, args) => orig.apply(self, args) + switchHTML()));
  // PDF: page at the end
  [['_renderKurzzeitHTML', 'Zimmer'], ['_renderMietvertragHTML', 'Zimmer'],
   ['_renderRentalKurzzeitHTML', 'Wohnung'], ['_renderRentalMietvertragHTML', 'Wohnung']]
    .forEach(([n, kind]) => wrap(n, (orig, self, args) => appendPage(orig.apply(self, args), args[0], kind)));

  window.ccBuergschaftPageHTML = pageHTML;   // e.g. for a stand-alone print later
})();
