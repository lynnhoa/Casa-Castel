/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EINMALIG (one-time items, in or out)
   controlling-tab-onetime.js

   · The only place for one-time items: invoices, Nebenkosten- and
     Hausgeldabrechnung, anything else.
   · Each entry: type (Rechnung · NK-Abrechnung · Hausgeldabrechnung ·
     Sonstiges) and direction (Raus / Rein).
   · Suggestions: paid NK settlements from the Rentals and Casa
     Castel tenant tabs (Nachzahlung = rein, Guthaben = raus) — one tap
     takes them over; each settlement can be taken over only once.
   ───────────────────────────────────────────────────────────── */

'use strict';

const _CX_KINDS = ['Rechnung', 'NK-Abrechnung', 'Hausgeldabrechnung', 'Sonstiges'];
const _CX_KIND_DIR = { 'Rechnung': -1, 'NK-Abrechnung': 1, 'Hausgeldabrechnung': -1, 'Sonstiges': -1 };
let _cxOt = { form: false, kind: 'Rechnung', dir: -1 };

function _cxOtMonthRows() {
  const y = window._ctrl.year, m = CX.month;
  return (window._ctrl.one_time || []).filter(o => {
    const d = String(o.invoice_date || '');
    return Number(d.slice(0, 4)) === y && Number(d.slice(5, 7)) === m;
  }).sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)));
}
function _cxOtDefaultDate() {
  const t = cxToday(), y = window._ctrl.year, m = CX.month;
  return (Number(t.slice(0, 4)) === y && Number(t.slice(5, 7)) === m) ? t : y + '-' + String(m).padStart(2, '0') + '-01';
}

window.renderOneTime = function () {
  const host = document.getElementById('tab-onetime');
  if (!host) return;
  CX.tab = 'onetime';
  const rows = _cxOtMonthRows();
  const rein = rows.filter(o => Number(o.direction) === 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const raus = rows.filter(o => Number(o.direction) !== 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const props = window._ctrl.properties.filter(p => p.active);

  const form = !_cxOt.form ? '' :
    '<div class="cx-form">' +
      '<div class="cx-chips">' + _CX_KINDS.map(k => '<button class="cx-chip' + (_cxOt.kind === k ? ' on' : '') + '" data-cx="kind" data-v="' + k + '">' + k + '</button>').join('') + '</div>' +
      '<div class="cx-grid2">' +
        '<div class="cx-seg"><button class="' + (_cxOt.dir < 0 ? 'on' : '') + '" data-cx="dir" data-v="-1">Raus</button><button class="' + (_cxOt.dir > 0 ? 'on' : '') + '" data-cx="dir" data-v="1">Rein</button></div>' +
        '<label class="cx-f"><input type="text" inputmode="decimal" id="cxOtAmt" placeholder="Betrag" aria-label="Betrag"><span>€</span></label>' +
      '</div>' +
      '<label class="cx-f cx-f--l"><select id="cxOtProp" aria-label="Immobilie">' + props.map(p => '<option value="' + p.id + '">' + cxEsc(p.name) + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
      '<label class="cx-f cx-f--l"><input type="text" id="cxOtText" placeholder="Beschreibung · z. B. Handwerker" aria-label="Beschreibung"></label>' +
      '<div class="cx-grid2">' +
        '<label class="cx-f cx-f--l"><input type="date" id="cxOtDate" value="' + _cxOtDefaultDate() + '" aria-label="Datum"></label>' +
        '<button class="cx-btn cx-btn--p" data-cx="save">Speichern</button>' +
      '</div>' +
    '</div>';

  const sug = ctlOtSuggestions();
  const sugHtml = !sug.length ? '' :
    '<div class="cx-head"><span class="cx-lbl">Vorschläge · aus den Mieter-Tabs</span></div>' +
    sug.map((s, i) => '<div class="cx-card cx-sug">' +
      '<div class="cx-sug__l"><div class="cx-it__t">' + cxEsc(s.text) + '</div><div class="cx-r__sub">' + cxEsc(s.prop) + ' · bezahlt</div></div>' +
      '<span class="cx-amt ' + (s.direction > 0 ? 'pos' : 'neg') + '">' + (s.direction > 0 ? '+ ' : '\u2212 ') + cxEur(s.amount) + '</span>' +
      '<button class="cx-take" data-cx="sug" data-i="' + i + '" aria-label="Übernehmen"><i class="ti ti-arrow-right" aria-hidden="true"></i></button>' +
    '</div>').join('');

  const list = rows.length ? rows.map(o => {
    const p = ctlProp(o.property_id);
    const dir = Number(o.direction) === 1 ? 1 : -1;
    const title = [o.company, o.item].filter(Boolean).join(' · ') || 'Eintrag';
    return '<div class="cx-card cx-it">' +
      '<div class="cx-it__l"><div class="cx-it__t">' + cxEsc(title) + '</div>' +
        '<div class="cx-r__sub">' + cxEsc(p ? p.name : '') + ' · ' + cxFmtDate(o.invoice_date) + '</div>' +
        '<div class="cx-it__p">' + cxPill(o.kind === 'Rechnung' || !o.kind ? 'grey' : 'beige', o.kind || 'Rechnung') + '</div></div>' +
      '<div class="cx-it__r"><span class="cx-amt ' + (dir > 0 ? 'pos' : 'neg') + '">' + (dir > 0 ? '+ ' : '\u2212 ') + cxEur(o.amount) + '</span>' +
        '<button class="cx-del" data-cx="del" data-id="' + cxEsc(o.id) + '" aria-label="Löschen"><i class="ti ti-trash" aria-hidden="true"></i></button></div>' +
    '</div>';
  }).join('') : '<div class="cx-empty">Keine Einträge in ' + CX_MONTHS[CX.month - 1] + '.</div>';

  host.innerHTML = '<div class="cx-page">' + cxMonthBar() +
    '<div class="cx-card cx-sum">' +
      '<div class="cx-lbl">Einmalig · ' + CX_MONTHS[CX.month - 1] + '</div>' +
      '<div class="cx-io"><div><div class="cx-lbl">Rein</div><div class="cx-io__v">' + cxW(rein) + '</div></div>' +
      '<div style="text-align:right"><div class="cx-lbl">Raus</div><div class="cx-io__v">' + cxW(raus) + '</div></div></div>' +
      '<button class="cx-btn cx-btn--' + (_cxOt.form ? 's' : 'p') + ' cx-btn--full" data-cx="form"><i class="ti ti-' + (_cxOt.form ? 'x' : 'plus') + '" aria-hidden="true"></i>' + (_cxOt.form ? 'Abbrechen' : 'Eintrag hinzufügen') + '</button>' +
      form +
    '</div>' + sugHtml +
    '<div class="cx-head"><span class="cx-lbl">Einträge · ' + CX_MONTHS[CX.month - 1] + '</span></div>' + list + '</div>';

  cxWire(host, {
    render: () => window.renderOneTime(),
    click: async (a, b) => {
      if (a === 'form') { _cxOt.form = !_cxOt.form; return window.renderOneTime(); }
      if (a === 'kind') { _cxOt.kind = b.dataset.v; _cxOt.dir = _CX_KIND_DIR[b.dataset.v] || -1; return _cxOtKeepForm(); }
      if (a === 'dir')  { _cxOt.dir = Number(b.dataset.v); return _cxOtKeepForm(); }
      if (a === 'save') return _cxOtSave();
      if (a === 'del') {
        if (!confirm('Eintrag löschen?')) return;
        try { await ctlDeleteOneTime(isNaN(Number(b.dataset.id)) ? b.dataset.id : Number(b.dataset.id)); } catch (e) { cxToastErr(e); }
        return window.renderOneTime();
      }
      if (a === 'sug') {
        const s = ctlOtSuggestions()[Number(b.dataset.i)];
        if (!s) return;
        try { await ctlAddOneTime({ property_id: s.pid, invoice_date: _cxOtDefaultDate(), item: s.text, amount: s.amount, kind: 'NK-Abrechnung', direction: s.direction, source_ref: s.ref }); }
        catch (e) { cxToastErr(e); }
        return window.renderOneTime();
      }
    },
  });
};

/* Re-render but keep what was typed in the form */
function _cxOtKeepForm() {
  const keep = { amt: document.getElementById('cxOtAmt')?.value, prop: document.getElementById('cxOtProp')?.value,
                 text: document.getElementById('cxOtText')?.value, date: document.getElementById('cxOtDate')?.value };
  window.renderOneTime();
  if (keep.amt !== undefined) document.getElementById('cxOtAmt').value = keep.amt;
  if (keep.prop) document.getElementById('cxOtProp').value = keep.prop;
  if (keep.text !== undefined) document.getElementById('cxOtText').value = keep.text;
  if (keep.date) document.getElementById('cxOtDate').value = keep.date;
}

async function _cxOtSave() {
  const amt = cxParse(document.getElementById('cxOtAmt')?.value);
  const text = (document.getElementById('cxOtText')?.value || '').trim();
  const pid = Number(document.getElementById('cxOtProp')?.value);
  const date = String(document.getElementById('cxOtDate')?.value || '').slice(0, 10) || _cxOtDefaultDate();
  if (!amt || amt <= 0) { if (typeof ctlToast === 'function') ctlToast('Bitte einen Betrag eingeben'); document.getElementById('cxOtAmt')?.focus(); return; }
  if (!text) { if (typeof ctlToast === 'function') ctlToast('Bitte eine Beschreibung eingeben'); document.getElementById('cxOtText')?.focus(); return; }
  try {
    await ctlAddOneTime({ property_id: pid, invoice_date: date, item: text, amount: cxR(amt), kind: _cxOt.kind, direction: _cxOt.dir });
    _cxOt.form = false;
    const m = Number(date.slice(5, 7)), y = Number(date.slice(0, 4));
    if (y === window._ctrl.year && m !== CX.month && typeof ctlToast === 'function') ctlToast('Gespeichert in ' + CX_MONTHS[m - 1]);
  } catch (e) { cxToastErr(e); }
  window.renderOneTime();
}
