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

const _CX_KINDS = ['Rechnung', 'Sonstiges'];
let _cxOt = {
  form: null,                                          // null · 'new' (summary) · 'new:<pid>' (in a card) · entry id (edit)
  flash: null, formAt: null, mfold: {}, more: {},
  view: (() => { try { return localStorage.getItem('cx_ot_view') === 'm' ? 'm' : 'y'; } catch (e) { return 'y'; } })(),
  q: '', fold: {}, kind: 'Rechnung', dir: -1, pid: null,
};
const _cxOtLastProp = () => { try { return Number(localStorage.getItem('cx_ot_prop')) || null; } catch (e) { return null; } };

function _cxOtAll() {
  const y = window._ctrl.year;
  return (window._ctrl.one_time || []).filter(o => !CX_ABR_KINDS.includes(o.kind) && Number(String(o.invoice_date || '').slice(0, 4)) === y);
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
    '<button class="cx-arw" data-cx="otYear" data-v="-1" aria-label="Vorheriges Jahr"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + window._ctrl.year + '</div><div class="cx-month__s">Stand ' + cxFmtDate(cxToday()) + '</div></div>' +
    '<button class="cx-arw" data-cx="otYear" data-v="1" aria-label="Nächstes Jahr"><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}

/* Add / edit form (inline) */
function _cxOtFormHTML(o) {
  const props = window._ctrl.properties.filter(p => p.active || (o && p.id === Number(o.property_id)));
  const pid = o ? Number(o.property_id) : (_cxOt.pid || _cxOtLastProp() || (props[0] && props[0].id));
  const kind = o ? (o._kind || (_CX_KINDS.includes(o.kind) ? o.kind : 'Rechnung')) : _cxOt.kind;
  const dir = o ? (o._dir || (Number(o.direction) === 1 ? 1 : -1)) : _cxOt.dir;
  const all = window._ctrl.one_time || [];
  const uniq = f => [...new Set(all.map(x => String(x[f] || '').trim()).filter(Boolean))].slice(0, 60);
  return '<div class="cx-form cx-ot-form" data-edit="' + (o ? cxEsc(o.id) : '') + '">' +
    '<div class="cx-chips">' + _CX_KINDS.map(k => '<button class="cx-chip' + (kind === k ? ' on' : '') + '" data-cx="otKind" data-v="' + k + '">' + k + '</button>').join('') + '</div>' +
    '<div class="cx-grid2">' +
      '<div class="cx-seg"><button class="' + (dir < 0 ? 'on' : '') + '" data-cx="otDir" data-v="-1">Raus</button><button class="' + (dir > 0 ? 'on' : '') + '" data-cx="otDir" data-v="1">Rein</button></div>' +
      '<label class="cx-f"><input type="text" inputmode="decimal" id="cxOtAmt" placeholder="Betrag" aria-label="Betrag" value="' + (o ? cxE2(o.amount) : '') + '"><span>€</span></label>' +
    '</div>' +
    '<label class="cx-f cx-f--l"><select id="cxOtProp" aria-label="Objekt">' + props.map(p => '<option value="' + p.id + '"' + (p.id === pid ? ' selected' : '') + '>' + cxEsc(p.name) + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
    '<label class="cx-f cx-f--l"><input type="text" id="cxOtText" list="cxOtTexts" placeholder="Beschreibung · z. B. Handwerker" aria-label="Beschreibung" value="' + cxEsc(o ? o.item || '' : '') + '"></label>' +
    '<label class="cx-f cx-f--l"><input type="text" id="cxOtCompany" list="cxOtCompanies" placeholder="Firma (optional)" aria-label="Firma" value="' + cxEsc(o ? o.company || '' : '') + '"></label>' +
    '<datalist id="cxOtTexts">' + uniq('item').map(v => '<option value="' + cxEsc(v) + '">').join('') + '</datalist>' +
    '<datalist id="cxOtCompanies">' + uniq('company').map(v => '<option value="' + cxEsc(v) + '">').join('') + '</datalist>' +
    '<label class="cx-f cx-f--l"><input type="date" id="cxOtDate" value="' + (o ? String(o.invoice_date).slice(0, 10) : _cxOtDefaultDate()) + '" aria-label="Datum"></label>' +
    '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="otCancel">Abbrechen</button>' +
      '<button class="cx-btn cx-btn--p" data-cx="otSave">Speichern</button></div>' +
    (o ? '<button class="cx-link cx-ot-del" data-cx="otDel" data-id="' + cxEsc(o.id) + '">Rechnung löschen</button>' : '') +
  '</div>';
}

/* One invoice = one row, same pattern as Income / Expenses:
   label (Beschreibung) · pill │ amount (bold) │ date · Firma — tap to edit */
function _cxOtRowHTML(o) {
  if (_cxOt.form !== null && String(_cxOt.form) === String(o.id)) return '<div class="cx-ot-edit">' + _cxOtFormHTML(o) + '</div>';
  const inn = Number(o.direction) === 1;
  const pills = (o.kind === 'Sonstiges' ? cxPill('grey', 'Sonstiges') : '') + (inn ? cxPill('ok', 'Rein') : '');
  return '<button class="cx-r cx-ot-r' + (String(o.id) === String(_cxOt.flash) ? ' cx-ot-flash' : '') + '" data-cx="otEdit" data-id="' + cxEsc(o.id) + '" aria-label="' + cxEsc((o.item || 'Eintrag') + ' bearbeiten') + '">' +
    '<div class="cx-r__top"><span class="cx-r__u">' + cxEsc(o.item || 'Eintrag') + '</span>' +
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
    (rest > 0 ? '<button class="cx-ot-more" data-cx="otMore" data-k="' + k + '">Weitere ' + Math.min(rest, 20) + ' von ' + rest + ' anzeigen</button>' : '');
}

function _cxOtListHTML() {
  const rows = _cxOtVisible();
  if (!rows.length) return '<div class="cx-card"><div class="cx-empty">' + (_cxOt.q ? 'Nichts gefunden für „' + cxEsc(_cxOt.q) + '“.' :
    'Noch keine Rechnungen ' + (_cxOt.view === 'y' ? window._ctrl.year : 'im ' + CX_MONTHS[CX.month - 1]) + '.') + '</div></div>';
  const order = window._ctrl.properties.slice().sort((a, b) => (b.active === a.active ? 0 : a.active ? -1 : 1) || a.id - b.id);
  return order.map(p => {
    const list = rows.filter(o => Number(o.property_id) === p.id);
    if (!list.length) return '';                                         // a property shows only once it has an entry
    const out = list.filter(o => Number(o.direction) !== 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const inn = list.filter(o => Number(o.direction) === 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const here = _cxOt.form === 'new:' + p.id;
    // "+ Rechnung" sits at the TOP of the card (no scrolling past 100 invoices); the form opens right below it
    let body = '<div class="cx-ot-top"><span class="cx-lbl">' + (_cxOt.view === 'y' ? 'Nach Monat' : CX_MONTHS[CX.month - 1]) + '</span>' +
      '<button class="cx-link" data-cx="otAddFor" data-p="' + p.id + '">' + (here ? '× Schließen' : '+ Rechnung') + '</button></div>' +
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
    const n = list.length;
    return cxCard({
      key: 'ot:' + p.id + ':' + _cxOt.view + (_cxOt.q ? ':q' : ''),
      title: p.name,
      sub: n + (n === 1 ? ' Rechnung' : ' Rechnungen') + (inn ? ' · Rein ' + cxW(inn) : ''),
      status: null,
      extraPill: '<span class="cx-ot-tot">' + cxW(out) + '</span>',
      defaultOpen: !!_cxOt.q || _cxOt.view === 'm' || here || list.some(o => String(o.id) === String(_cxOt.form) || String(o.id) === String(_cxOt.flash)),
      body,
    });
  }).join('');
}

window.renderOneTime = function () {
  const host = document.getElementById('tab-onetime');
  if (!host) return;
  const at = _cxOt.view + '|' + window._ctrl.year + '|' + CX.month;
  if (CX.tab !== 'onetime' || (_cxOt.formAt && _cxOt.formAt !== at)) { _cxOt.form = null; _cxOt.formAt = null; }
  CX.tab = 'onetime';
  const flash = _cxOt.flash;
  const all = _cxOtAll().filter(o => _cxOt.view === 'y' || Number(String(o.invoice_date).slice(5, 7)) === CX.month);
  const raus = all.filter(o => Number(o.direction) !== 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const rein = all.filter(o => Number(o.direction) === 1).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const period = _cxOt.view === 'y' ? String(window._ctrl.year) : CX_MONTHS[CX.month - 1];

  host.innerHTML = '<div class="cx-page">' +
    '<div class="cx-seg cx-seg--view" role="group" aria-label="Ansicht">' +
      '<button class="' + (_cxOt.view === 'y' ? 'on' : '') + '" data-cx="otView" data-v="y">Jahr</button>' +
      '<button class="' + (_cxOt.view === 'm' ? 'on' : '') + '" data-cx="otView" data-v="m">Monat</button></div>' +
    (_cxOt.view === 'y' ? _cxOtYearBar() : cxMonthBar()) +
    '<div class="cx-card cx-sum">' +
      '<div class="cx-row-sb"><span class="cx-lbl">Rechnungen bezahlt · ' + cxEsc(period) + '</span>' + cxPill('beige', all.length + (all.length === 1 ? ' Rechnung' : ' Rechnungen')) + '</div>' +
      '<div class="cx-sum__v"><span class="cx-sum__big">' + cxW(raus) + '</span><span class="cx-sum__of">' + (rein ? 'Rein ' + cxW(rein) : (_cxOt.view === 'y' ? 'im Jahr ' + window._ctrl.year : 'im ' + CX_MONTHS[CX.month - 1])) + '</span></div>' +
      '<button class="cx-btn cx-btn--s cx-btn--full" style="margin-top:4px" data-cx="otNew">' +
        (_cxOt.form === 'new' ? '<i class="ti ti-x" aria-hidden="true"></i>Schließen' : '<i class="ti ti-plus" aria-hidden="true"></i>Rechnung erfassen') + '</button>' +
      (_cxOt.form === 'new' ? _cxOtFormHTML(null) : '') +
    '</div>' +
    '<div class="cx-head"><span class="cx-lbl">Rechnungen je Objekt</span><span class="cx-lbl">Betrag</span></div>' +
    '<label class="cx-f cx-f--l cx-ot-q"><i class="ti ti-search" aria-hidden="true" style="margin:0 6px 0 0"></i><input type="search" id="cxOtQ" placeholder="Suchen · Beschreibung oder Firma" aria-label="Suchen" value="' + cxEsc(_cxOt.q) + '"></label>' +
    '<div id="cxOtList">' + _cxOtListHTML() + '</div>' +
    '<div class="cx-r__sub" style="text-align:center;margin-top:8px">NK- und Hausgeld-Abrechnungen stehen in Income und Expenses.</div>' +
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
      if (a === 'otMore') { const k = b.dataset.k; _cxOt.more[k] = (_cxOt.more[k] || 20) + 20; return window.renderOneTime(); }
      if (a === 'otMonth') { const k = b.dataset.k; _cxOt.mfold[k] = b.getAttribute('aria-expanded') !== 'true'; return window.renderOneTime(); }
      if (a === 'otEdit') { if (!_cxOtClose()) return; _cxOtOpen(b.dataset.id, null); return window.renderOneTime(); }
      if (a === 'otCancel') { if (_cxOtClose()) window.renderOneTime(); return; }
      if (a === 'otKind') { _cxOt.kind = b.dataset.v; return _cxOtKeep(() => { const o = _cxOtEditing(); if (o) o._kind = b.dataset.v; }); }
      if (a === 'otDir') { _cxOt.dir = Number(b.dataset.v); return _cxOtKeep(() => { const o = _cxOtEditing(); if (o) o._dir = Number(b.dataset.v); }); }
      if (a === 'otSave') return _cxOtSave(b);
      if (a === 'otDel') {
        const id = b.dataset.id, o = (window._ctrl.one_time || []).find(x => String(x.id) === String(id));
        if (!o || !confirm('„' + (o.item || 'Eintrag') + '“ über ' + cxEur(o.amount) + ' löschen?')) return;
        try { await ctlDeleteOneTime(o.id); _cxOt.form = null; } catch (e) { cxToastErr(e); }
        return window.renderOneTime();
      }
    },
  });
};

function _cxOtEditing() {
  return _cxOt.form && !/^new/.test(String(_cxOt.form)) ? (window._ctrl.one_time || []).find(x => String(x.id) === String(_cxOt.form)) || null : null;
}
function _cxOtOpen(form, pid) {
  _cxOt.form = form; _cxOt.pid = pid; _cxOt.kind = 'Rechnung'; _cxOt.dir = -1;
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
    (o._kind && o._kind !== o.kind) || (o._dir && o._dir !== (Number(o.direction) === 1 ? 1 : -1));
}
/* Close the open form; asks first when something typed would be lost. Returns false if you keep editing. */
function _cxOtClose() {
  if (_cxOt.form === null) return true;
  if (_cxOtDirty() && !confirm('Eingabe verwerfen?')) return false;
  const o = _cxOtEditing(); if (o) { delete o._kind; delete o._dir; }
  _cxOt.form = null; _cxOt.formAt = null;
  return true;
}
/* Re-render but keep what was typed in the form; kind / direction chips of an edit apply on save */
function _cxOtKeep(fn) {
  const g = id => document.getElementById(id);
  const keep = { amt: g('cxOtAmt')?.value, prop: g('cxOtProp')?.value, text: g('cxOtText')?.value, co: g('cxOtCompany')?.value, date: g('cxOtDate')?.value };
  fn();
  window.renderOneTime();
  if (keep.amt !== undefined && g('cxOtAmt')) g('cxOtAmt').value = keep.amt;
  if (keep.prop && g('cxOtProp')) g('cxOtProp').value = keep.prop;
  if (keep.text !== undefined && g('cxOtText')) g('cxOtText').value = keep.text;
  if (keep.co !== undefined && g('cxOtCompany')) g('cxOtCompany').value = keep.co;
  if (keep.date && g('cxOtDate')) g('cxOtDate').value = keep.date;
}

async function _cxOtSave(b) {
  const g = id => document.getElementById(id);
  const amt = cxParse(g('cxOtAmt')?.value);
  const text = (g('cxOtText')?.value || '').trim();
  const company = (g('cxOtCompany')?.value || '').trim() || null;
  const pid = Number(g('cxOtProp')?.value);
  const date = String(g('cxOtDate')?.value || '').slice(0, 10);
  const say = t => { if (typeof ctlToast === 'function') ctlToast(t); };
  if (!(amt > 0)) { say('Bitte einen Betrag eingeben'); g('cxOtAmt')?.focus(); return; }
  if (!date) { say('Bitte ein Datum eingeben'); g('cxOtDate')?.focus(); return; }
  const o = _cxOtEditing();
  const kind = o ? (o._kind || (_CX_KINDS.includes(o.kind) ? o.kind : 'Rechnung')) : _cxOt.kind;
  const dir = o ? (o._dir || (Number(o.direction) === 1 ? 1 : -1)) : _cxOt.dir;
  // soft duplicate hint: same property, amount and date
  const dup = (window._ctrl.one_time || []).find(x => (!o || x.id !== o.id) && Number(x.property_id) === pid &&
    cxR(x.amount) === cxR(amt) && String(x.invoice_date).slice(0, 10) === date);
  if (dup && !confirm('Mögliches Duplikat: „' + (dup.item || 'Eintrag') + '“ · ' + cxEur(dup.amount) + ' am ' + cxFmtDate(date) + ' gibt es schon.\n\nTrotzdem speichern?')) return;
  b.disabled = true;
  try {
    let saved;
    if (o) {
      saved = await ctlUpdateOneTime(o.id, { property_id: pid, invoice_date: date, item: text || company || kind, company, amount: cxR(amt), kind, direction: dir });
    } else {
      saved = await ctlAddOneTime({ property_id: pid, invoice_date: date, item: text || company || kind, company, amount: cxR(amt), kind, direction: dir });
    }
    if (o) { delete o._kind; delete o._dir; }
    if (saved) { _cxOt.flash = saved.id; delete CX.open['ot:' + pid + ':' + _cxOt.view]; }
    try { localStorage.setItem('cx_ot_prop', String(pid)); } catch (e) {}
    _cxOt.form = null; _cxOt.formAt = null;
    const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
    if (y !== window._ctrl.year) say('Gespeichert in ' + y);
    else if (_cxOt.view === 'm' && m !== CX.month) say('Gespeichert in ' + CX_MONTHS[m - 1]);
    else say('Gespeichert');
  } catch (e) { cxToastErr(e); b.disabled = false; return; }
  window.renderOneTime();
}
