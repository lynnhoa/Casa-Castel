/* ─────────────────────────────────────────────────────────────
   CONTROLLING — ONE-OFF (invoices and other one-time costs)
   controlling-tab-onetime.js

   Process: invoice arrives → "+ Rechnung erfassen" → it lands under its
   property and year and counts in its month on the Dashboard (real cost)
   → tap to edit or delete.
   · Jahr (default) or Monat view · search by description / company
   · one card per property WITH entries, same card as Income / Expenses:
     name, count, total · rows: Beschreibung │ amount │ date · Firma ·
     "+ Rechnung für …" · folded in Jahr view
   · all Casa Castel rooms go under Casa Castel · inactive properties keep
     their old entries
   · NK / Hausgeld results are not here — they live in Income / Expenses
     (controlling-abr.js); their bookings (kinds NK-Abrechnung /
     Hausgeldabrechnung) are hidden in this tab
   ───────────────────────────────────────────────────────────── */

'use strict';

const _CX_KINDS = ['Rechnung', 'Versorger', 'Sonstiges', 'Kaufnebenkosten'];   // stored values (German) · Versorger = yearly Strom/Gas/Wasser result
const _CX_KIND_LBL = { Rechnung: 'Invoice', Versorger: 'Jahresabrechnung', Sonstiges: 'Other', Kaufnebenkosten: 'Kaufnebenkosten' };   // what the app shows
// Kaufnebenkosten (Notar, Grundbuch, Grunderwerbsteuer, Makler): listed and exported for the tax return,
// but part of the purchase — never in the cashflow, the dashboard or a property's month result
const _cxOtKnk = o => !!o && o.kind === 'Kaufnebenkosten';
const _CX_KNK_TYPES = ['Makler', 'Notar', 'Grundbuch', 'Grunderwerbsteuer', 'Sonstiges'];
const _CX_KNK_PARTS = ['Kauf', 'Grundschuld'];                     // Notar / Grundbuch: purchase or the loan's Grundschuld
const _cxKnkHasPart = t => t === 'Notar' || t === 'Grundbuch';
const _cxKnkLbl = o => o && o.knk_type ? o.knk_type + (_cxKnkHasPart(o.knk_type) && o.knk_part ? ' · ' + o.knk_part : '') : '';
// Casa Castel: the yearly Strom/Gas/Wasser results are your "Hausgeld" (no WEG there) → chip "Hausgeld"
// Rentals: chip "Jahresabrechnung" (WEG Hausgeld results come from Settlements → Abrechnungen, not from here)
const _cxOtKindLbl = (k, pid) => k === 'Versorger' && Number(pid) === CASA_PROP_ID ? 'Hausgeld' : (_CX_KIND_LBL[k] || k);
// the two directions, named for the kind: Versorgerabrechnung → Nachzahlung / Guthaben · else Expense / Income
const _cxOtDirLbl = kind => kind === 'Versorger' ? ['Nachzahlung', 'Guthaben'] : ['Expense', 'Income'];
let _cxOt = {
  form: null,                                          // null · 'new' (summary) · 'new:<pid>' (in a card) · entry id (edit)
  flash: null, formAt: null, mfold: {}, more: {},
  exp: { open: false, fmt: 'pdf', pid: '', what: 'inv' },   // export panel: invoices of the year or Kaufnebenkosten (all years) · Excel · PDF
  view: (() => { try { return localStorage.getItem('cx_ot_view') === 'm' ? 'm' : 'y'; } catch (e) { return 'y'; } })(),
  q: '', fold: {}, kind: 'Rechnung', dir: -1, pid: null,
  nk: false,                                           // new entry: "In NK-Abrechnung umlegen" (Casa Castel only)
  nkCat: '',                                           // new entry: Casa cost type for the NK ('' = general house costs)
  knkType: '', knkPart: '',                            // new entry: Kaufnebenkosten type · Kauf / Grundschuld
};
const _cxOtLastProp = () => { try { return Number(localStorage.getItem('cx_ot_prop')) || null; } catch (e) { return null; } };

function _cxOtAll() {
  const y = window._ctrl.year;
  return (window._ctrl.one_time || []).filter(o => !CX_ABR_KINDS.includes(o.kind) && Number(String(o.invoice_date || '').slice(0, 4)) === y && cxAreaPid(o.property_id));
}
function _cxOtVisible() {
  const q = _cxOt.q.trim().toLowerCase();
  return _cxOtAll().filter(o => (_cxOt.view === 'y' || Number(String(o.invoice_date).slice(5, 7)) === CX.month) &&
    (!q || [o.item, o.company].some(x => String(x || '').toLowerCase().includes(q))))
    .sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || (Number(b.id) || 0) - (Number(a.id) || 0));
}
function _cxOtDefaultDate() {
  const t = cxToday(), y = window._ctrl.year, m = CX.month;
  if (_cxOt.view === 'y') return Number(t.slice(0, 4)) === y ? t : y + '-12-31';
  return (Number(t.slice(0, 4)) === y && Number(t.slice(5, 7)) === m) ? t : y + '-' + String(m).padStart(2, '0') + '-01';
}
const _cxOtSigned = o => (Number(o.direction) === 1 ? 1 : -1) * (Number(o.amount) || 0);

/* Year bar for the Jahr view (the month bar is used in the Monat view) */
function _cxOtYearBar() {
  return '<div class="cx-month">' +
    '<button class="cx-arw" data-cx="otYear" data-v="-1" aria-label="Previous year"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + window._ctrl.year + '</div><div class="cx-month__s">As of ' + cxFmtDate(cxToday()) + '</div></div>' +
    '<button class="cx-arw" data-cx="otYear" data-v="1" aria-label="Next year"><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}

/* Add / edit form (inline) */
function _cxOtFormHTML(o) {
  const props = window._ctrl.properties.filter(p => (p.active && cxAreaOk(p)) || (o && p.id === Number(o.property_id)));
  const pick = [_cxOt.pid, _cxOtLastProp()].find(x => x && props.some(p => p.id === Number(x)));   // stays inside Rentals / Casa Castel
  const pid = o ? Number(o.property_id) : (Number(pick) || (props[0] && props[0].id));
  const kind = o ? (o._kind || (_CX_KINDS.includes(o.kind) ? o.kind : 'Rechnung')) : _cxOt.kind;
  const dir = o ? (o._dir || (Number(o.direction) === 1 ? 1 : -1)) : _cxOt.dir;
  const nk  = o ? (o._nk !== undefined ? o._nk : !!o.nk_umlage) : _cxOt.nk;
  const all = window._ctrl.one_time || [];
  const uniq = f => [...new Set(all.map(x => String(x[f] || '').trim()).filter(Boolean))].slice(0, 60);
  return '<div class="cx-form cx-ot-form" data-edit="' + (o ? cxEsc(o.id) : '') + '">' +
    '<div class="cx-chips">' + _CX_KINDS.map(k => '<button class="cx-chip' + (kind === k ? ' on' : '') + '" data-cx="otKind" data-v="' + k + '">' + _cxOtKindLbl(k, pid) + '</button>').join('') + '</div>' +
    (kind === 'Kaufnebenkosten' ? _cxOtKnkChipsHTML(o) : '') +
    '<div class="cx-grid2">' +
      '<div class="cx-seg"><button class="' + (dir < 0 ? 'on' : '') + '" data-cx="otDir" data-v="-1">' + _cxOtDirLbl(kind)[0] + '</button><button class="' + (dir > 0 ? 'on' : '') + '" data-cx="otDir" data-v="1">' + _cxOtDirLbl(kind)[1] + '</button></div>' +
      '<label class="cx-f"><input type="text" inputmode="decimal" id="cxOtAmt" placeholder="Amount" aria-label="Amount" value="' + (o ? cxE2(o.amount) : '') + '"><span>€</span></label>' +
    '</div>' +
    '<label class="cx-f cx-f--l"><select id="cxOtProp" aria-label="Objekt" onchange="_cxOtNkShow()">' + props.map(p => '<option value="' + p.id + '"' + (p.id === pid ? ' selected' : '') + '>' + cxEsc(p.name) + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
    '<label class="cx-f cx-f--l"><input type="text" id="cxOtText" list="cxOtTexts" placeholder="Description · e.g. Handwerker" aria-label="Description" value="' + cxEsc(o ? o.item || '' : '') + '"></label>' +
    '<label class="cx-f cx-f--l"><input type="text" id="cxOtCompany" list="cxOtCompanies" placeholder="Company (optional)" aria-label="Company" value="' + cxEsc(o ? o.company || '' : '') + '"></label>' +
    '<datalist id="cxOtTexts">' + uniq('item').map(v => '<option value="' + cxEsc(v) + '">').join('') + '</datalist>' +
    '<datalist id="cxOtCompanies">' + uniq('company').map(v => '<option value="' + cxEsc(v) + '">').join('') + '</datalist>' +
    '<label class="cx-f cx-f--l"><input type="date" id="cxOtDate" value="' + (o ? String(o.invoice_date).slice(0, 10) : _cxOtDefaultDate()) + '" aria-label="Date"></label>' +
    // Casa Castel costs that tenants pay via the NK-Abrechnung — for you still a normal cost (tax export unchanged)
    '<button type="button" class="cx-ot-nk' + (nk ? ' on' : '') + '" id="cxOtNkRow" data-cx="otNk" aria-pressed="' + (nk ? 'true' : 'false') + '"' +
      (pid === CASA_PROP_ID && kind !== 'Kaufnebenkosten' ? '' : ' style="display:none"') + '>' +
      '<span class="cx-ot-nk__sw" aria-hidden="true"></span>' +
      '<span class="cx-ot-nk__t"><b>Show in Settlements</b><small>for the NK-Abrechnung · still a normal cost for you</small></span></button>' +
    _cxOtNkCatHTML(o, nk, pid) +
    '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="otCancel">Cancel</button>' +
      '<button class="cx-btn cx-btn--p" data-cx="otSave">Save</button></div>' +
    (o ? '<button class="cx-link cx-ot-del" data-cx="otDel" data-id="' + cxEsc(o.id) + '">Delete invoice</button>' : '') +
  '</div>';
}

/* Casa Versorger-Jahresabrechnung: its own Abrechnungsjahr (set in Settlements), else the 12 months before the payment */
function _cxOtAbrYear(o) {
  const mmyy = iso => String(iso).slice(5, 7) + '/' + String(iso).slice(2, 4);
  if (o.nk_from && o.nk_to) return mmyy(o.nk_from) + '–' + mmyy(o.nk_to);
  const d = String(o.invoice_date).slice(0, 10), y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
  const tm = m === 1 ? 12 : m - 1, ty = m === 1 ? y - 1 : y, fm = tm === 12 ? 1 : tm + 1, fy = tm === 12 ? ty : ty - 1;
  return String(fm).padStart(2, '0') + '/' + String(fy).slice(2) + '–' + String(tm).padStart(2, '0') + '/' + String(ty).slice(2) + ' ?';
}
/* One invoice = one row, same pattern as Income / Expenses:
   label (Beschreibung) · pill │ amount (bold) │ date · Firma — tap to edit */
function _cxOtRowHTML(o) {
  if (_cxOt.form !== null && String(_cxOt.form) === String(o.id)) return '<div class="cx-ot-edit">' + _cxOtFormHTML(o) + '</div>';
  const inn = Number(o.direction) === 1;
  const nkCat = o.nk_umlage && o.nk_category_id ? (window._ctrl.categories || []).find(c => Number(c.id) === Number(o.nk_category_id)) : null;
  const pills = _cxOtKnk(o) ? cxPill('beige', 'Kaufnebenkosten') + (o.knk_type ? cxPill('grey', _cxKnkLbl(o)) : '') + (inn ? cxPill('ok', 'Refund') : '') :
                (o.nk_umlage ? '<span class="cx-pill cx-pill--nk">NK' + (nkCat ? ' · ' + cxEsc(nkCat.name) : '') + '</span>' : '') +
                (o.kind === 'Versorger' ? cxPill(inn ? 'ok' : 'grey', inn ? 'Guthaben' : 'Nachzahlung') +          // Versorgerabrechnung
                  (o.nk_umlage && Number(o.property_id) === CASA_PROP_ID ? cxPill('beige', 'Abr. ' + _cxOtAbrYear(o)) : '')
                  : (o.kind === 'Sonstiges' ? cxPill('grey', 'Other') : '') + (inn ? cxPill('ok', 'Income') : ''));
  return '<button class="cx-r cx-ot-r' + (String(o.id) === String(_cxOt.flash) ? ' cx-ot-flash' : '') + '" data-cx="otEdit" data-id="' + cxEsc(o.id) + '" aria-label="' + cxEsc('Edit ' + (o.item || 'entry')) + '">' +
    '<div class="cx-r__top"><span class="cx-r__u">' + cxEsc(o.item || 'Entry') + '</span>' +
      '<span class="cx-r__p">' + pills + '<i class="ti ti-chevron-right cx-chev" aria-hidden="true"></i></span></div>' +
    '<div class="cx-r__s' + (inn ? ' pos' : '') + '">' + (inn ? '+\u202f' : '') + cxEur(o.amount) + '</div>' +
    '<div class="cx-r__sub">' + cxEsc([cxFmtDate(o.invoice_date), o.company].filter(Boolean).join(' · ')) + '</div>' +
  '</button>';
}

/* Very long lists: 20 rows at a time — "Weitere … anzeigen" (search always shows all) */
function _cxOtRowsLimited(list, k) {
  const lim = _cxOt.q ? Infinity : (_cxOt.more[k] || 20);
  const focus = list.findIndex(o => String(o.id) === String(_cxOt.form) || String(o.id) === String(_cxOt.flash));
  const n = Math.max(lim, focus + 1);
  const rest = list.length - n;
  return list.slice(0, n).map(_cxOtRowHTML).join('') +
    (rest > 0 ? '<button class="cx-ot-more" data-cx="otMore" data-k="' + k + '">Show ' + Math.min(rest, 20) + ' more of ' + rest + '</button>' : '');
}

/* Export panel (inside the summary card) */
function _cxOtExportHTML() {
  const y = window._ctrl.year, e = _cxOt.exp, knkMode = e.what === 'knk';
  const knkPids = new Set(cxKnkRows(null).map(o => Number(o.property_id)));
  const props = knkMode ? window._ctrl.properties.filter(p => knkPids.has(p.id)).sort((a, b) => a.id - b.id)
                        : (typeof cxInvoiceProps === 'function' ? cxInvoiceProps(y) : []);
  if (e.pid && !props.some(p => String(p.id) === String(e.pid))) e.pid = '';
  return '<div class="cx-form cx-ot-exp">' +
    (knkPids.size ? '<div class="cx-set__k">What</div>' +
      '<div class="cx-chips">' + [['inv', 'Invoices ' + y], ['knk', 'Kaufnebenkosten · all years']].map(([v, l]) =>
        '<button class="cx-chip' + ((e.what || 'inv') === v ? ' on' : '') + '" data-cx="otExpWhat" data-v="' + v + '">' + l + '</button>').join('') + '</div>' : '') +
    '<div class="cx-set__k">Format</div>' +
    '<div class="cx-chips">' + [['pdf', 'PDF (A4)'], ['xlsx', 'Excel']].map(([v, l]) =>
      '<button class="cx-chip' + (e.fmt === v ? ' on' : '') + '" data-cx="otExpFmt" data-v="' + v + '">' + l + '</button>').join('') + '</div>' +
    '<div class="cx-set__k">Properties</div>' +
    '<label class="cx-f cx-f--l"><select id="cxOtExpProp" aria-label="Properties"><option value="">All properties</option>' +
      props.map(p => '<option value="' + p.id + '"' + (String(e.pid) === String(p.id) ? ' selected' : '') + '>' + cxEsc(p.name) + '</option>').join('') +
    '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
    '<div class="cx-r__sub">' + (knkMode ? 'Every year, one section per purchase · Art · Kauf / Grundschuld · Betrag · Datum · subtotals'
                                         : 'Whole year ' + y + ' · No. · Product · Shop · Price · Invoice date') + '</div>' +
    '<div class="cx-ot-exp__go"><button class="cx-btn cx-btn--p cx-btn--full" data-cx="otExpGo"' + (props.length ? '' : ' disabled') + '>' +
      (e.fmt === 'pdf' ? 'Create PDF' : 'Export Excel') + '</button></div>' +
  '</div>';
}

function _cxOtListHTML() {
  const rows = _cxOtVisible();
  if (!rows.length) return '<div class="cx-card"><div class="cx-empty">' + (_cxOt.q ? 'Nothing found for "' + cxEsc(_cxOt.q) + '".' :
    'No invoices yet ' + (_cxOt.view === 'y' ? 'in ' + window._ctrl.year : 'in ' + CX_MONTHS[CX.month - 1]) + '.') + '</div></div>';
  const order = window._ctrl.properties.slice().sort((a, b) => (b.active === a.active ? 0 : a.active ? -1 : 1) || a.id - b.id);
  return order.map(p => {
    const all = rows.filter(o => Number(o.property_id) === p.id);
    if (!all.length) return '';                                          // a property shows only once it has an entry
    const list = all.filter(o => !_cxOtKnk(o)), knk = all.filter(_cxOtKnk);
    const knkSum = knk.reduce((s, o) => s - _cxOtSigned(o), 0);
    const out = list.filter(o => Number(o.direction) !== 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const inn = list.filter(o => Number(o.direction) === 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const here = _cxOt.form === 'new:' + p.id;
    // "+ Rechnung" sits at the TOP of the card (no scrolling past 100 invoices); the form opens right below it
    let body = '<div class="cx-ot-top"><span class="cx-lbl">' + (_cxOt.view === 'y' ? 'By month' : CX_MONTHS[CX.month - 1]) + '</span>' +
      '<button class="cx-link" data-cx="otAddFor" data-p="' + p.id + '">' + (here ? '× Close' : '+ Invoice') + '</button></div>' +
      (here ? '<div class="cx-ot-edit cx-ot-edit--top">' + _cxOtFormHTML(null) + '</div>' : '');
    if (_cxOt.view === 'm') body += _cxOtRowsLimited(list, p.id + '|m|' + window._ctrl.year + '|' + CX.month);
    else {
      // Jahr view: one foldable block per month. Many invoices → only the newest month open at first
      const months = [...new Set(list.map(o => Number(String(o.invoice_date).slice(5, 7))))];   // newest first
      const many = list.length > 15;
      months.forEach((mm, i) => {
        const ml = list.filter(o => Number(String(o.invoice_date).slice(5, 7)) === mm);
        const k = p.id + '|' + window._ctrl.year + '|' + mm;
        const hasFocus = ml.some(o => String(o.id) === String(_cxOt.form) || String(o.id) === String(_cxOt.flash));
        const open = _cxOt.q || hasFocus ? true : (_cxOt.mfold[k] !== undefined ? _cxOt.mfold[k] : (!many || i === 0));
        const mt = ml.reduce((s2, o) => s2 + _cxOtSigned(o), 0);
        body += '<button class="cx-ot-m" data-cx="otMonth" data-k="' + k + '" aria-expanded="' + open + '">' +
          '<span>' + CX_MONTHS[mm - 1] + '</span><span class="cx-ot-ms">' + cxW(Math.abs(mt)) + ' · ' + ml.length +
          ' <i class="ti ti-chevron-' + (open ? 'up' : 'down') + '" aria-hidden="true"></i></span></button>' +
          (open ? _cxOtRowsLimited(ml, k) : '');
      });
    }
    if (knk.length) body +=                                             // part of the purchase: own block, own total
      '<div class="cx-ot-knk"><div class="cx-row-sb"><span class="cx-lbl">Kaufnebenkosten · not in cashflow</span>' +
        '<span class="cx-ot-ms">' + cxW(knkSum) + ' · ' + knk.length + '</span></div>' +
        knk.slice().sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date))).map(_cxOtRowHTML).join('') +
        _cxOtKnkYearsHTML(p.id) + '</div>';
    const n = list.length;
    return cxCard({
      key: 'ot:' + p.id + ':' + _cxOt.view + (_cxOt.q ? ':q' : ''),
      title: p.name,
      sub: [n ? n + (n === 1 ? ' invoice' : ' invoices') : '', inn ? 'Income ' + cxW(inn) : '', knk.length ? 'Kaufnebenkosten ' + cxW(knkSum) : ''].filter(Boolean).join(' · '),
      status: null,
      extraPill: '<span class="cx-ot-tot">' + cxW(out) + '</span>',
      defaultOpen: !!_cxOt.q || _cxOt.view === 'm' || here || all.some(o => String(o.id) === String(_cxOt.form) || String(o.id) === String(_cxOt.flash)),
      body,
    });
  }).join('');
}

window.renderOneTime = function () {
  const host = document.getElementById('tab-onetime');
  if (!host) return;
  if (!document.getElementById('cx-ot-knk-css')) {                    // Kaufnebenkosten block (own look, set apart from the invoices)
    const st = document.createElement('style'); st.id = 'cx-ot-knk-css';
    st.textContent = '.cx-ot-knk{margin:10px 0 6px;padding:8px 10px 2px;border-radius:10px;background:#F5F2ED;border:.5px dashed #D9CFC0}' +
      '.cx-ot-knk>.cx-row-sb{padding:2px 0 4px}.cx-ot-knk .cx-r{background:transparent}';
    document.head.appendChild(st);
  }
  const at = _cxOt.view + '|' + window._ctrl.year + '|' + CX.month;
  if (CX.tab !== 'onetime' || (_cxOt.formAt && _cxOt.formAt !== at)) { _cxOt.form = null; _cxOt.formAt = null; }
  CX.tab = 'onetime';
  const flash = _cxOt.flash;
  const inPer = _cxOtAll().filter(o => _cxOt.view === 'y' || Number(String(o.invoice_date).slice(5, 7)) === CX.month);
  const all = inPer.filter(o => !_cxOtKnk(o)), knkAll = inPer.filter(_cxOtKnk);
  const knkTot = knkAll.reduce((s, o) => s - _cxOtSigned(o), 0);
  const raus = all.filter(o => Number(o.direction) !== 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const rein = all.filter(o => Number(o.direction) === 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const period = _cxOt.view === 'y' ? String(window._ctrl.year) : CX_MONTHS[CX.month - 1];

  host.innerHTML = '<div class="cx-page">' +
    '<div class="cx-seg cx-seg--view" role="group" aria-label="Ansicht">' +
      '<button class="' + (_cxOt.view === 'y' ? 'on' : '') + '" data-cx="otView" data-v="y">Year</button>' +
      '<button class="' + (_cxOt.view === 'm' ? 'on' : '') + '" data-cx="otView" data-v="m">Month</button></div>' +
    (_cxOt.view === 'y' ? _cxOtYearBar() : cxMonthBar()) +
    '<div class="cx-card cx-sum">' +
      '<div class="cx-row-sb"><span class="cx-lbl">Invoices paid · ' + cxEsc(period) + '</span>' + cxPill('beige', all.length + (all.length === 1 ? ' invoice' : ' invoices')) + '</div>' +
      '<div class="cx-sum__v"><span class="cx-sum__big">' + cxW(raus) + '</span><span class="cx-sum__of">' + (rein ? 'Income ' + cxW(rein) : (_cxOt.view === 'y' ? 'in ' + window._ctrl.year : 'in ' + CX_MONTHS[CX.month - 1])) + '</span></div>' +
      (knkAll.length ? '<div class="cx-r__sub" style="margin:-2px 0 6px">+ Kaufnebenkosten ' + cxW(knkTot) + ' · part of the purchase, not in cashflow</div>' : '') +
      '<div class="cx-grid2" style="margin-top:4px">' +
        '<button class="cx-btn cx-btn--s" data-cx="otNew">' +
          (_cxOt.form === 'new' ? '<i class="ti ti-x" aria-hidden="true"></i>Close' : '<i class="ti ti-plus" aria-hidden="true"></i>Invoice') + '</button>' +
        '<button class="cx-btn cx-btn--s" data-cx="otExp">' + (_cxOt.exp.open ? '<i class="ti ti-x" aria-hidden="true"></i>Close' : '<i class="ti ti-download" aria-hidden="true"></i>Export') + '</button>' +
      '</div>' + (_cxOt.exp.open ? _cxOtExportHTML() : '') +
      (_cxOt.form === 'new' ? _cxOtFormHTML(null) : '') +
    '</div>' +
    '<div class="cx-head"><span class="cx-lbl">Invoices per property</span><span class="cx-lbl">Amount</span></div>' +
    '<label class="cx-f cx-f--l cx-ot-q"><i class="ti ti-search" aria-hidden="true" style="margin:0 6px 0 0"></i><input type="search" id="cxOtQ" placeholder="Search · description or company" aria-label="Search" value="' + cxEsc(_cxOt.q) + '"></label>' +
    '<div id="cxOtList">' + _cxOtListHTML() + '</div>' +
    '<div class="cx-r__sub" style="text-align:center;margin-top:8px">NK and Hausgeld Abrechnungen are in Income and Expenses.</div>' +
  '</div>';

  if (flash) { _cxOt.flash = null; setTimeout(() => host.querySelector('.cx-ot-flash')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); }
  const q = document.getElementById('cxOtQ');
  if (q && !q._w) {
    q._w = true;
    let t = null;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { _cxOt.q = q.value; const L = document.getElementById('cxOtList'); if (L) L.innerHTML = _cxOtListHTML(); }, 150); });
  }

  cxWire(host, {
    render: () => window.renderOneTime(),
    click: async (a, b) => {
      if (a === 'otView') { if (!_cxOtClose()) return; _cxOt.view = b.dataset.v; try { localStorage.setItem('cx_ot_view', _cxOt.view); } catch (e) {} return window.renderOneTime(); }
      if (a === 'otYear') {
        if (!_cxOtClose()) return;
        const y = window._ctrl.year + Number(b.dataset.v);
        if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
        try { await ctlLoadAll(y); } catch (e) { cxToastErr(e); }
        if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
        _cxOt.form = null;
        return window.renderOneTime();
      }
      if (a === 'otNew') {
        if (_cxOt.form === 'new') { if (_cxOtClose()) window.renderOneTime(); return; }
        if (!_cxOtClose()) return;
        _cxOtOpen('new', null); return window.renderOneTime();
      }
      if (a === 'otAddFor') {
        const k = 'new:' + b.dataset.p;
        if (_cxOt.form === k) { if (_cxOtClose()) window.renderOneTime(); return; }
        if (!_cxOtClose()) return;
        _cxOtOpen(k, Number(b.dataset.p)); window.renderOneTime();
        document.getElementById('cxOtAmt')?.focus();
        return;
      }
      if (a === 'otExp') {
        _cxOt.exp.open = !_cxOt.exp.open;
        if (_cxOt.exp.open) {                                                     // libraries load now, so the export tap is instant
          if (typeof cxXlsxPreload === 'function') cxXlsxPreload().catch(() => {});
          if (typeof cxPdfPreload === 'function') cxPdfPreload().catch(() => {});
        }
        return window.renderOneTime();
      }
      if (a === 'otExpFmt') { _cxOt.exp.fmt = b.dataset.v; return window.renderOneTime(); }
      if (a === 'otExpWhat') { _cxOt.exp.what = b.dataset.v; return window.renderOneTime(); }
      if (a === 'otExpGo') {                                                      // whole selected year; no await before this line (tap)
        const pid = document.getElementById('cxOtExpProp')?.value || '';
        _cxOt.exp.pid = pid;
        if (_cxOt.exp.what === 'knk') return _cxOt.exp.fmt === 'pdf' ? cxExportKnkPdf(pid || null, b) : cxExportKnk(pid || null);
        return _cxOt.exp.fmt === 'pdf' ? cxExportInvoicesPdf(window._ctrl.year, pid || null, b) : cxExportInvoices(window._ctrl.year, pid || null);
      }
      if (a === 'otMore') { const k = b.dataset.k; _cxOt.more[k] = (_cxOt.more[k] || 20) + 20; return window.renderOneTime(); }
      if (a === 'otMonth') { const k = b.dataset.k; _cxOt.mfold[k] = b.getAttribute('aria-expanded') !== 'true'; return window.renderOneTime(); }
      if (a === 'otEdit') { if (!_cxOtClose()) return; _cxOtOpen(b.dataset.id, null); return window.renderOneTime(); }
      if (a === 'otCancel') { if (_cxOtClose()) window.renderOneTime(); return; }
      if (a === 'otKind') {
        _cxOt.kind = b.dataset.v;
        return _cxOtKeep(() => {
          const o = _cxOtEditing(); if (o) o._kind = b.dataset.v;
          // Hausgeld = the yearly Strom/Gas/Wasser result → always part of the Casa Castel NK
          const pid = Number(document.getElementById('cxOtProp')?.value);
          if (b.dataset.v === 'Versorger' && pid === CASA_PROP_ID) { if (o) o._nk = true; else _cxOt.nk = true; }
          if (b.dataset.v === 'Kaufnebenkosten') { if (o) o._nk = false; else _cxOt.nk = false; }
        });
      }
      if (a === 'otKnkType' || a === 'otKnkPart') {
        const f = a === 'otKnkType' ? 'knkType' : 'knkPart', v = b.dataset.v;
        return _cxOtKeep(() => {
          const o = _cxOtEditing();
          if (o) o['_' + f] = v; else _cxOt[f] = v;
          if (f === 'knkType' && !_cxKnkHasPart(v)) { if (o) o._knkPart = ''; else _cxOt.knkPart = ''; }
        });
      }
      if (a === 'otDir') { _cxOt.dir = Number(b.dataset.v); return _cxOtKeep(() => { const o = _cxOtEditing(); if (o) o._dir = Number(b.dataset.v); }); }
      if (a === 'otNk') {
        const o = _cxOtEditing();
        const cur = o ? (o._nk !== undefined ? o._nk : !!o.nk_umlage) : _cxOt.nk;
        if (o) o._nk = !cur; else _cxOt.nk = !cur;
        return _cxOtKeep(() => {});
      }
      if (a === 'otSave') return _cxOtSave(b);
      if (a === 'otDel') {
        const id = b.dataset.id, o = (window._ctrl.one_time || []).find(x => String(x.id) === String(id));
        if (!o || !confirm('Delete "' + (o.item || 'entry') + '" (' + cxEur(o.amount) + ')?')) return;
        try {
          await ctlDeleteOneTime(o.id); _cxOt.form = null;
          if (window._src && window._src.knkAll) window._src.knkAll = window._src.knkAll.filter(x => String(x.id) !== String(o.id));
        } catch (e) { cxToastErr(e); }
        return window.renderOneTime();
      }
    },
  });
};

function _cxOtEditing() {
  return _cxOt.form && !/^new/.test(String(_cxOt.form)) ? (window._ctrl.one_time || []).find(x => String(x.id) === String(_cxOt.form)) || null : null;
}
function _cxOtOpen(form, pid) {
  _cxOt.form = form; _cxOt.pid = pid; _cxOt.kind = 'Rechnung'; _cxOt.dir = -1; _cxOt.nk = false; _cxOt.knkType = ''; _cxOt.knkPart = '';
  _cxOt.formAt = _cxOt.view + '|' + window._ctrl.year + '|' + CX.month;
}
/* Something typed that would be lost? (new: any field · edit: anything changed) */
function _cxOtDirty() {
  if (_cxOt.form === null) return false;
  const g = id => document.getElementById(id);
  if (!g('cxOtAmt')) return false;
  const o = _cxOtEditing();
  const amt = g('cxOtAmt').value.trim(), text = (g('cxOtText')?.value || '').trim(), co = (g('cxOtCompany')?.value || '').trim();
  if (!o) return !!(amt || text || co);
  return cxParse(amt) !== cxR(o.amount) || text !== String(o.item || '') || co !== String(o.company || '') ||
    String(g('cxOtDate')?.value || '') !== String(o.invoice_date).slice(0, 10) || Number(g('cxOtProp')?.value) !== Number(o.property_id) ||
    (o._kind && o._kind !== o.kind) || (o._dir && o._dir !== (Number(o.direction) === 1 ? 1 : -1)) ||
    (o._nk !== undefined && o._nk !== !!o.nk_umlage) ||
    (o._knkType !== undefined && o._knkType !== (o.knk_type || '')) || (o._knkPart !== undefined && o._knkPart !== (o.knk_part || '')) ||
    (g('cxOtNkCat') && String(g('cxOtNkCat').value || '') !== String(o.nk_category_id || ''));
}
/* Close the open form; asks first when something typed would be lost. Returns false if you keep editing. */
function _cxOtClose() {
  if (_cxOt.form === null) return true;
  if (_cxOtDirty() && !confirm('Discard your input?')) return false;
  const o = _cxOtEditing(); if (o) { delete o._kind; delete o._dir; delete o._nk; }
  _cxOt.form = null; _cxOt.formAt = null;
  return true;
}
/* Re-render but keep what was typed in the form; kind / direction chips of an edit apply on save */
function _cxOtKeep(fn) {
  const g = id => document.getElementById(id);
  const keep = { amt: g('cxOtAmt')?.value, prop: g('cxOtProp')?.value, text: g('cxOtText')?.value, co: g('cxOtCompany')?.value, date: g('cxOtDate')?.value, cat: g('cxOtNkCat')?.value };
  fn();
  window.renderOneTime();
  if (keep.amt !== undefined && g('cxOtAmt')) g('cxOtAmt').value = keep.amt;
  if (keep.prop && g('cxOtProp')) g('cxOtProp').value = keep.prop;
  if (keep.text !== undefined && g('cxOtText')) g('cxOtText').value = keep.text;
  if (keep.co !== undefined && g('cxOtCompany')) g('cxOtCompany').value = keep.co;
  if (keep.date && g('cxOtDate')) g('cxOtDate').value = keep.date;
  if (keep.cat !== undefined && g('cxOtNkCat')) g('cxOtNkCat').value = keep.cat;
  _cxOtNkShow();   // NK switch follows the (kept) property and Raus / Rein
}

async function _cxOtSave(b) {
  const g = id => document.getElementById(id);
  const amt = cxParse(g('cxOtAmt')?.value);
  const text = (g('cxOtText')?.value || '').trim();
  const company = (g('cxOtCompany')?.value || '').trim() || null;
  const pid = Number(g('cxOtProp')?.value);
  const date = String(g('cxOtDate')?.value || '').slice(0, 10);
  const say = t => { if (typeof ctlToast === 'function') ctlToast(t); };
  if (!(amt > 0)) { say('Please enter an amount'); g('cxOtAmt')?.focus(); return; }
  if (!date) { say('Please enter a date'); g('cxOtDate')?.focus(); return; }
  const o = _cxOtEditing();
  const kind = o ? (o._kind || (_CX_KINDS.includes(o.kind) ? o.kind : 'Rechnung')) : _cxOt.kind;
  const dir = o ? (o._dir || (Number(o.direction) === 1 ? 1 : -1)) : _cxOt.dir;
  const kt = kind === 'Kaufnebenkosten' ? (o ? (o._knkType !== undefined ? o._knkType : o.knk_type || '') : _cxOt.knkType) : '';
  const kp = _cxKnkHasPart(kt) ? (o ? (o._knkPart !== undefined ? o._knkPart : o.knk_part || '') : _cxOt.knkPart) : '';
  if (kind === 'Kaufnebenkosten' && !kt) { say('Please choose what it is · Makler, Notar, …'); return; }
  const knk = kind === 'Kaufnebenkosten' ? { knk_type: kt, knk_part: kp || null } : (o && o.knk_type ? { knk_type: null, knk_part: null } : {});
  const fallback = kt ? kt + (kp ? ' · ' + kp : '') : kind;
  // NK only for Casa Castel costs (Raus); anything else is saved without it
  const nkOn = o ? (o._nk !== undefined ? o._nk : !!o.nk_umlage) : _cxOt.nk;
  const nk_umlage = pid === CASA_PROP_ID && !!nkOn && kind !== 'Kaufnebenkosten';          // Raus adds to the NK costs, Rein (e.g. Versorger-Guthaben) lowers them
  const catV = g('cxOtNkCat')?.value || '';
  const nk_category_id = nk_umlage && catV ? Number(catV) : null;   // '' = general house costs (split by person)
  if (nk_umlage && kind === 'Versorger' && !catV) { say('Please choose the cost type, e.g. Gas or Strom'); g('cxOtNkCat')?.focus(); return; }
  // soft duplicate hint: same property, amount and date
  const dup = (window._ctrl.one_time || []).find(x => (!o || x.id !== o.id) && Number(x.property_id) === pid &&
    cxR(x.amount) === cxR(amt) && String(x.invoice_date).slice(0, 10) === date);
  if (dup && !confirm('Possible duplicate: "' + (dup.item || 'entry') + '" · ' + cxEur(dup.amount) + ' on ' + cxFmtDate(date) + ' already exists.\n\nSave anyway?')) return;
  b.disabled = true;
  try {
    let saved;
    if (o) {
      saved = await ctlUpdateOneTime(o.id, { property_id: pid, invoice_date: date, item: text || company || fallback, company, amount: cxR(amt), kind, direction: dir, nk_umlage, nk_category_id, ...knk });
    } else {
      saved = await ctlAddOneTime({ property_id: pid, invoice_date: date, item: text || company || fallback, company, amount: cxR(amt), kind, direction: dir, nk_umlage, nk_category_id, ...knk });
    }
    if (o) { delete o._kind; delete o._dir; delete o._nk; delete o._knkType; delete o._knkPart; }
    _cxOt.nk = false; _cxOt.nkCat = ''; _cxOt.knkType = ''; _cxOt.knkPart = '';
    if (saved && saved.kind === 'Kaufnebenkosten' && window._src) {   // keep the all-years list in step
      const L = window._src.knkAll || (window._src.knkAll = []), j = L.findIndex(x => String(x.id) === String(saved.id));
      if (j >= 0) L[j] = saved; else L.push(saved);
    }
    if (saved) { _cxOt.flash = saved.id; delete CX.open['ot:' + pid + ':' + _cxOt.view]; }
    try { localStorage.setItem('cx_ot_prop', String(pid)); } catch (e) {}
    _cxOt.form = null; _cxOt.formAt = null;
    const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
    if (y !== window._ctrl.year) say('Saved in ' + y);
    else if (_cxOt.view === 'm' && m !== CX.month) say('Saved in ' + CX_MONTHS[m - 1]);
    else say('Saved');
  } catch (e) {
    if (/nk_umlage|nk_category_id/.test(String(e && (e.message || e)))) say('Please run the SQL for the NK cost type first');
    else cxToastErr(e);
    b.disabled = false; return;
  }
  window.renderOneTime();
}

/* NK on (Casa Castel) → which Casa cost type it belongs to. The key (Personen / Fläche) and the booking
   come from Setup; '' = general house costs, split by person. Kreditrate is never in the NK. */
function _cxOtNkCatHTML(o, nk, pid) {
  if (!nk || pid !== CASA_PROP_ID) return '';
  const cur = o ? (o.nk_category_id ?? '') : _cxOt.nkCat;
  const cats = (window._ctrl.categories || []).filter(c => c.code !== 'RATE' && c.nk_key !== 'none');
  return '<div id="cxOtNkCatRow"><div class="cx-set__k" style="margin:2px 0 4px">Cost type for the NK</div>' +
    '<label class="cx-f cx-f--l"><select id="cxOtNkCat" aria-label="Cost type for the NK">' +
      '<option value="">General house costs · split by person</option>' +
      cats.map(c => '<option value="' + c.id + '"' + (String(cur) === String(c.id) ? ' selected' : '') + '>' + cxEsc(c.name) +
        '</option>').join('') +
    '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label></div>';
}

/* Property changed in the form: the NK switch only belongs to Casa Castel costs */
function _cxOtNkShow() {
  const row = document.getElementById('cxOtNkRow'); if (!row) return;
  const pid = Number(document.getElementById('cxOtProp')?.value);
  const o = _cxOtEditing();
  const dir = o ? (o._dir || (Number(o.direction) === 1 ? 1 : -1)) : _cxOt.dir;
  const kind = o ? (o._kind || o.kind) : _cxOt.kind;
  row.style.display = pid === CASA_PROP_ID && kind !== 'Kaufnebenkosten' ? '' : 'none';
  const catRow = document.getElementById('cxOtNkCatRow'); if (catRow && pid !== CASA_PROP_ID) catRow.style.display = 'none';
  const chip = document.querySelector('.cx-ot-form [data-cx="otKind"][data-v="Versorger"]');
  if (chip) chip.textContent = _cxOtKindLbl('Versorger', pid);       // Hausgeld (Casa Castel) · Jahresabrechnung (Rentals)
}


/* Kaufnebenkosten: what it is (Makler · Notar · Grundbuch · Grunderwerbsteuer · Sonstiges) and,
   for Notar and Grundbuch, whether it belongs to the purchase or to the loan's Grundschuld
   (the Grundschuld part is usually deductible right away — the Steuerberater decides) */
function _cxOtKnkChipsHTML(o) {
  const t = o ? (o._knkType !== undefined ? o._knkType : o.knk_type || '') : _cxOt.knkType;
  const pt = o ? (o._knkPart !== undefined ? o._knkPart : o.knk_part || '') : _cxOt.knkPart;
  return '<div class="cx-set__k" style="margin-top:2px">What is it?</div>' +
    '<div class="cx-chips">' + _CX_KNK_TYPES.map(k => '<button class="cx-chip' + (t === k ? ' on' : '') + '" data-cx="otKnkType" data-v="' + k + '">' + k + '</button>').join('') + '</div>' +
    (_cxKnkHasPart(t)
      ? '<div class="cx-set__k" style="margin-top:2px">For</div>' +
        '<div class="cx-chips">' + _CX_KNK_PARTS.map(k => '<button class="cx-chip' + (pt === k ? ' on' : '') + '" data-cx="otKnkPart" data-v="' + k + '">' +
          (k === 'Kauf' ? 'Kauf (purchase)' : 'Grundschuld (loan)') + '</button>').join('') +
          '<button class="cx-chip' + (!pt ? ' on' : '') + '" data-cx="otKnkPart" data-v="">not sure yet</button></div>'
      : '');
}

/* All Kaufnebenkosten of a property, every year: other years from the all-years list, this year as it is now */
function cxKnkRows(pid) {
  const y = window._ctrl.year;
  const cur = (window._ctrl.one_time || []).filter(o => o.kind === 'Kaufnebenkosten');
  const other = ((window._src && window._src.knkAll) || []).filter(o => Number(String(o.invoice_date).slice(0, 4)) !== y);
  return other.concat(cur).filter(o => pid == null || Number(o.property_id) === Number(pid))
    .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || (Number(a.id) || 0) - (Number(b.id) || 0));
}

/* The whole purchase, every year (shown when it spans more than one year) */
function _cxOtKnkYearsHTML(pid) {
  const rows = cxKnkRows(pid);
  const byY = {};
  rows.forEach(o => { const y = String(o.invoice_date).slice(0, 4); byY[y] = (byY[y] || 0) - _cxOtSigned(o); });
  const ys = Object.keys(byY).sort();
  if (ys.length < 2) return '';
  const tot = ys.reduce((s, y) => s + byY[y], 0);
  return '<div class="cx-row-sb" style="border-top:.5px solid #E0DAD0;margin-top:4px;padding:8px 0 6px">' +
    '<span class="cx-r__sub" style="margin:0">Total for this purchase · ' + ys.map(y => y + ': ' + cxW(byY[y])).join(' · ') + '</span>' +
    '<span class="cx-ot-tot">' + cxW(tot) + '</span></div>';
}
