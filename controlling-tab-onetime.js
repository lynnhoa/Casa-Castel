/* ─────────────────────────────────────────────────────────────
   CONTROLLING — ONE-OFF (invoices and other one-time costs)
   controlling-tab-onetime.js

   Process: invoice arrives → "+ Rechnung erfassen" → it lands under its
   property and year and counts in its month on the Dashboard (real cost)
   → tap to edit or delete.
   · Jahr (default) or Monat view · search by description / company
   · one section per property WITH entries: header above the card
     (name · total · count · +), card folded in Jahr view
   · all Casa Castel rooms go under Casa Castel · inactive properties keep
     their old entries
   · NK / Hausgeld results are not here — they live in Income / Expenses
     (controlling-abr.js); their bookings (kinds NK-Abrechnung /
     Hausgeldabrechnung) are hidden in this tab
   ───────────────────────────────────────────────────────────── */

'use strict';

const _CX_KINDS = ['Rechnung', 'Sonstiges'];
let _cxOt = {
  form: null,                                          // null · 'new' · entry id (edit)
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
    '<div class="cx-grid2">' +
      '<label class="cx-f cx-f--l"><input type="date" id="cxOtDate" value="' + (o ? String(o.invoice_date).slice(0, 10) : _cxOtDefaultDate()) + '" aria-label="Datum"></label>' +
      '<button class="cx-btn cx-btn--p" data-cx="otSave">Speichern</button>' +
    '</div>' +
    '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="otCancel">Abbrechen</button>' +
      (o ? '<button class="cx-btn cx-btn--s cx-btn--del" data-cx="otDel" data-id="' + cxEsc(o.id) + '">Löschen</button>' : '<span></span>') + '</div>' +
  '</div>';
}

function _cxOtRowHTML(o) {
  if (_cxOt.form !== null && String(_cxOt.form) === String(o.id)) return '<div class="cx-ot-edit">' + _cxOtFormHTML(o) + '</div>';
  const dir = Number(o.direction) === 1 ? 1 : -1;
  return '<button class="cx-ot-row" data-cx="otEdit" data-id="' + cxEsc(o.id) + '">' +
    '<span class="cx-ot-d">' + cxFmtDate(o.invoice_date).slice(0, 6) + '</span>' +
    '<span class="cx-ot-t"><span class="cx-ot-i">' + cxEsc(o.item || 'Eintrag') + '</span>' +
      ((o.company || o.kind === 'Sonstiges') ? '<span class="cx-ot-c">' + cxEsc([o.company, o.kind === 'Sonstiges' ? 'Sonstiges' : ''].filter(Boolean).join(' · ')) + '</span>' : '') + '</span>' +
    '<span class="cx-amt ' + (dir > 0 ? 'pos' : 'neg') + '">' + (dir > 0 ? '+\u202f' : '\u2212\u202f') + cxEur(o.amount) + '</span></button>';
}

function _cxOtListHTML() {
  const rows = _cxOtVisible();
  if (!rows.length) return '<div class="cx-empty">' + (_cxOt.q ? 'Nichts gefunden für „' + cxEsc(_cxOt.q) + '“.' :
    'Noch keine Rechnungen ' + (_cxOt.view === 'y' ? window._ctrl.year : 'im ' + CX_MONTHS[CX.month - 1]) + '.') + '</div>';
  const order = window._ctrl.properties.slice().sort((a, b) => (b.active === a.active ? 0 : a.active ? -1 : 1) || a.id - b.id);
  return order.map(p => {
    const list = rows.filter(o => Number(o.property_id) === p.id);
    if (!list.length) return '';                                         // a property shows only once it has an entry
    const total = list.reduce((s, o) => s + _cxOtSigned(o), 0);
    const fk = p.id + '|' + _cxOt.view;
    const open = _cxOt.q ? true : (_cxOt.fold[fk] !== undefined ? _cxOt.fold[fk] : _cxOt.view === 'm');
    let body = '', lastM = null;
    if (open) for (const o of list) {
      const mm = Number(String(o.invoice_date).slice(5, 7));
      if (_cxOt.view === 'y' && mm !== lastM) { body += '<div class="cx-ot-m">' + CX_MONTHS[mm - 1] + '</div>'; lastM = mm; }
      body += _cxOtRowHTML(o);
    }
    return '<div class="cx-ot-g">' +
      '<div class="cx-ot-h"><button class="cx-ot-hb" data-cx="otFold" data-k="' + fk + '" aria-expanded="' + open + '">' +
        '<span class="cx-lbl">' + cxEsc(p.name) + '</span>' +
        '<span class="cx-ot-hs">' + cxWS(total) + ' · ' + list.length + '</span>' +
        '<i class="ti ti-chevron-' + (open ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></button>' +
        '<button class="cx-x" data-cx="otAddFor" data-p="' + p.id + '" aria-label="Rechnung für ' + cxEsc(p.name) + '"><span aria-hidden="true">+</span></button></div>' +
      (open ? '<div class="cx-card">' + body + '</div>' : '') + '</div>';
  }).join('');
}

window.renderOneTime = function () {
  const host = document.getElementById('tab-onetime');
  if (!host) return;
  CX.tab = 'onetime';
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
      '<div class="cx-row-sb"><span class="cx-lbl">Rechnungen · ' + cxEsc(period) + '</span><span class="cx-lbl">' + all.length + (all.length === 1 ? ' Eintrag' : ' Einträge') + '</span></div>' +
      '<div class="cx-sum__v"><span class="cx-sum__big">' + cxW(-raus) + '</span>' + (rein ? '<span class="cx-sum__of">Rein ' + cxW(rein) + '</span>' : '') + '</div>' +
      (_cxOt.form === 'new'
        ? _cxOtFormHTML(null)
        : '<button class="cx-btn cx-btn--p cx-btn--full" style="margin-top:12px" data-cx="otNew"><i class="ti ti-plus" aria-hidden="true"></i>Rechnung erfassen</button>') +
    '</div>' +
    '<label class="cx-f cx-f--l cx-ot-q"><i class="ti ti-search" aria-hidden="true" style="margin:0 6px 0 0"></i><input type="search" id="cxOtQ" placeholder="Suchen · Beschreibung oder Firma" aria-label="Suchen" value="' + cxEsc(_cxOt.q) + '"></label>' +
    '<div id="cxOtList">' + _cxOtListHTML() + '</div>' +
    '<div class="cx-r__sub" style="text-align:center;margin-top:8px">NK- und Hausgeld-Abrechnungen stehen in Income und Expenses.</div>' +
  '</div>';

  const q = document.getElementById('cxOtQ');
  if (q && !q._w) {
    q._w = true;
    let t = null;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { _cxOt.q = q.value; const L = document.getElementById('cxOtList'); if (L) L.innerHTML = _cxOtListHTML(); }, 150); });
  }

  cxWire(host, {
    render: () => window.renderOneTime(),
    click: async (a, b) => {
      if (a === 'otView') { _cxOt.view = b.dataset.v; _cxOt.form = null; try { localStorage.setItem('cx_ot_view', _cxOt.view); } catch (e) {} return window.renderOneTime(); }
      if (a === 'otYear') {
        const y = window._ctrl.year + Number(b.dataset.v);
        if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
        try { await ctlLoadAll(y); } catch (e) { cxToastErr(e); }
        if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
        _cxOt.form = null;
        return window.renderOneTime();
      }
      if (a === 'otFold') { const k = b.dataset.k; _cxOt.fold[k] = b.getAttribute('aria-expanded') !== 'true'; return window.renderOneTime(); }
      if (a === 'otNew') { _cxOt.form = 'new'; _cxOt.pid = null; _cxOt.kind = 'Rechnung'; _cxOt.dir = -1; return window.renderOneTime(); }
      if (a === 'otAddFor') { _cxOt.form = 'new'; _cxOt.pid = Number(b.dataset.p); _cxOt.kind = 'Rechnung'; _cxOt.dir = -1; window.renderOneTime(); window.scrollTo(0, 0); document.getElementById('cxOtAmt')?.focus(); return; }
      if (a === 'otEdit') { _cxOt.form = b.dataset.id; return window.renderOneTime(); }
      if (a === 'otCancel') { const o = _cxOtEditing(); if (o) { delete o._kind; delete o._dir; } _cxOt.form = null; return window.renderOneTime(); }
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
  return _cxOt.form && _cxOt.form !== 'new' ? (window._ctrl.one_time || []).find(x => String(x.id) === String(_cxOt.form)) || null : null;
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
    if (o) {
      await ctlUpdateOneTime(o.id, { property_id: pid, invoice_date: date, item: text || company || kind, company, amount: cxR(amt), kind, direction: dir });
    } else {
      await ctlAddOneTime({ property_id: pid, invoice_date: date, item: text || company || kind, company, amount: cxR(amt), kind, direction: dir });
    }
    try { localStorage.setItem('cx_ot_prop', String(pid)); } catch (e) {}
    _cxOt.form = null;
    const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
    if (y !== window._ctrl.year) say('Gespeichert in ' + y);
    else if (_cxOt.view === 'm' && m !== CX.month) say('Gespeichert in ' + CX_MONTHS[m - 1]);
    else say('Gespeichert');
  } catch (e) { cxToastErr(e); b.disabled = false; return; }
  window.renderOneTime();
}
