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


/* ── Abrechnungen (Phase 5 · B13 B14 G3) ─────────────────────
   Expected yearly settlements with status: offen → erstellt → bezahlt
   (or "nicht durchgeführt"). Paid by payment → one entry in Einmalig
   (counts in the year paid, D2); paid via Kaution → closed, no line (D14). */
let _cxSet = { pay: {}, open: null, grp: {} };
const _CX_SET_ST = { offen: ['open', 'offen'], erstellt: ['beige', 'erstellt'], bezahlt: ['ok', 'bezahlt'], 'nicht durchgeführt': ['grey', 'nicht durchgeführt'] };
function _cxSetRows(cy) { return (window._src.settle || []).filter(r => Number(r.covers_year) === cy); }
function _cxSetLabel(r) {
  const p = ctlProp(r.property_id);
  if (r.kind === 'weg_hausgeld') return (p ? p.name : '') + ' · Hausgeld-Jahresabrechnung ' + r.covers_year;
  const S = window._src, t = (r.app === 'casa' ? S.casaTen : S.rntTen).find(x => String(x.id) === String(r.tenant_id));
  const nm = t ? [t.first_name, t.last_name].filter(Boolean).join(' ') : 'Mieter';
  const u = t ? (t.room || (S.apts.find(a => String(a.id) === String(t.apartment_id)) || {}).name || '') : '';
  return (p ? p.name : '') + (u && u !== (p && p.name) ? ' · ' + u : '') + ' · ' + nm + ' · NK ' + r.covers_year;
}
function _cxSetLabelShort(r) {
  if (r.kind === 'weg_hausgeld') return 'Hausgeldabrechnung ' + r.covers_year + ' (WEG)';
  if (!r.tenant_id) return 'NK ' + r.covers_year + ' · ' + (r.note || 'Einheit') + ' · Mieter nicht verknüpft';
  const S = window._src, t = (r.app === 'casa' ? S.casaTen : S.rntTen).find(x => String(x.id) === String(r.tenant_id));
  const nm = t ? [t.first_name, t.last_name].filter(Boolean).join(' ') : 'Mieter';
  const unit = t ? (t.room || ((S.apts || []).find(a => String(a.id) === String(t.apartment_id)) || {}).name || '') : '';
  const pn = (ctlProp(r.property_id) || {}).name || '';
  return 'NK ' + r.covers_year + (unit && unit !== pn ? ' · ' + unit : '') + ' · ' + nm + (r.note && r.note !== 'Einzug fehlt' ? ' · ' + r.note : '') +
         (r.note === 'Einzug fehlt' ? ' · Einzug fehlt – Zeitraum prüfen' : '');
}
function _cxSetHTML() {
  const cy = window._ctrl.year - 1;
  const rows = _cxSetRows(cy);
  const exp = typeof ctlExpectedSettlements === 'function' ? ctlExpectedSettlements(cy) : [];
  const missing = exp.filter(e => !rows.some(r => ctlSettlementSame(r, e)));
  const nOpen = rows.filter(r => r.status === 'offen' || r.status === 'erstellt').length;
  const isOpen = _cxSet.open !== null ? _cxSet.open : (nOpen + missing.length > 0);
  const rowHTML = r => {
    const st = _CX_SET_ST[r.status] || _CX_SET_ST.offen, id = cxEsc(r.id);
    const per = r.period_from && r.period_to ? cxFmtDate(r.period_from) + '–' + cxFmtDate(r.period_to) : '';
    const paid = r.status === 'bezahlt' ? (r.settled_via === 'kaution' ? 'mit Kaution verrechnet' : (Number(r.direction) === 1 ? '+ ' : '\u2212 ') + cxEur(r.amount || 0) + (r.paid_date ? ' · ' + cxFmtDate(r.paid_date) : '')) : '';
    const pay = _cxSet.pay[r.id] ?
      '<div class="cx-form" style="margin-top:8px">' +
        '<div class="cx-grid2"><div class="cx-seg"><button class="' + ((_cxSet.pay[r.id].dir || 1) > 0 ? 'on' : '') + '" data-cx="setDir" data-id="' + id + '" data-v="1">Rein</button><button class="' + ((_cxSet.pay[r.id].dir || 1) < 0 ? 'on' : '') + '" data-cx="setDir" data-id="' + id + '" data-v="-1">Raus</button></div>' +
        '<label class="cx-f"><input type="text" inputmode="decimal" id="cxSetAmt-' + id + '" placeholder="Betrag" aria-label="Betrag"><span>€</span></label></div>' +
        '<div class="cx-grid2"><label class="cx-f cx-f--l"><input type="date" id="cxSetDate-' + id + '" value="' + _cxOtDefaultDate() + '" aria-label="Bezahlt am"></label>' +
        '<label class="cx-f cx-f--l"><select id="cxSetVia-' + id + '" aria-label="Wie"><option value="zahlung">per Zahlung</option><option value="kaution">mit Kaution verrechnet</option></select><i class="ti ti-chevron-down" aria-hidden="true"></i></label></div>' +
        '<div class="cx-grid2"><button class="cx-btn" data-cx="setPay" data-id="' + id + '">Abbrechen</button><button class="cx-btn cx-btn--p" data-cx="setPaySave" data-id="' + id + '">Speichern</button></div>' +
      '</div>' : '';
    const acts = r.status === 'bezahlt' || r.status === 'nicht durchgeführt'
      ? '<button class="cx-link" style="display:inline" data-cx="setStatus" data-id="' + id + '" data-v="offen">wieder öffnen</button>'
      : (r.status === 'offen' ? '<button class="cx-link" style="display:inline" data-cx="setStatus" data-id="' + id + '" data-v="erstellt">erstellt</button> · ' : '') +
        '<button class="cx-link" style="display:inline" data-cx="setPay" data-id="' + id + '">bezahlt …</button> · ' +
        '<button class="cx-link" style="display:inline" data-cx="setStatus" data-id="' + id + '" data-v="nicht durchgeführt">nicht durchgeführt</button>';
    return '<div class="cx-r" style="display:block"><div class="cx-row-sb"><span class="cx-r__u">' + cxEsc(_cxSetLabelShort(r)) + '</span>' + cxPill(st[0], st[1]) + '</div>' +
      '<div class="cx-r__sub">' + cxEsc([per, paid].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="cx-r__sub" style="margin-top:4px">' + acts + ' · <button class="cx-link" style="display:inline" data-cx="setDel" data-id="' + id + '">löschen</button></div>' + pay + '</div>';
  };
  // D22: grouped per property — Casa Castel: NK per room tenant · Rentals: Hausgeld (WEG) + NK per tenant
  const isOpenRow = r => r.status === 'offen' || r.status === 'erstellt';
  const list = window._ctrl.properties.filter(p => p.active).map(p => {
    const pr = rows.filter(r => Number(r.property_id) === Number(p.id))
      .sort((a, b) => (a.kind === b.kind ? _cxSetLabelShort(a).localeCompare(_cxSetLabelShort(b)) : a.kind === 'weg_hausgeld' ? -1 : 1));
    if (!pr.length) return '';
    const nO = pr.filter(isOpenRow).length;
    const gOpen = _cxSet.grp[p.id] !== undefined ? _cxSet.grp[p.id] : nO > 0;
    return '<div style="border-top:.5px solid var(--cc-rule);margin-top:6px">' +
      '<button class="cx-ph" style="padding-left:0;padding-right:0" data-cx="setGrp" data-p="' + p.id + '" aria-expanded="' + gOpen + '">' +
        '<span class="cx-ph__l"><span class="cx-pn cx-pn--s">' + cxEsc(p.name) + '</span><span class="cx-src">' +
          (p.id === CASA_PROP_ID ? 'NK je Zimmer-Mieter' : 'Hausgeld (WEG) + NK je Mieter') + '</span></span>' +
        '<span class="cx-ph__r">' + (nO ? cxPill('open', nO + ' offen') : cxPill('ok', 'erledigt')) +
        '<i class="ti ti-chevron-' + (gOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>' +
      (gOpen ? pr.map(rowHTML).join('') : '') + '</div>';
  }).join('');
  const body = !isOpen ? '' : '<div style="padding:0 16px 12px">' +
    (missing.length ? '<button class="cx-btn cx-btn--p cx-btn--full" style="margin:6px 0" data-cx="setGen"><i class="ti ti-list-check" aria-hidden="true"></i>' + missing.length + (missing.length === 1 ? ' erwartete Abrechnung' : ' erwartete Abrechnungen') + ' ' + cy + ' anlegen</button>' : '') +
    (list || '<div class="cx-r__sub" style="padding:8px 0">Noch keine Abrechnungen für ' + cy + '.</div>') + '</div>';
  return '<div class="cx-card"><button class="cx-ph" data-cx="setFold" aria-expanded="' + isOpen + '">' +
    '<span class="cx-ph__l"><span class="cx-pn">Abrechnungen ' + cy + '</span><span class="cx-src">NK je Mieter · Hausgeld je Wohnung</span></span>' +
    '<span class="cx-ph__r">' + (nOpen + missing.length ? cxPill('open', (nOpen + missing.length) + ' offen') : cxPill('ok', 'erledigt')) +
    '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>' + body + '</div>';
}
async function _cxSetUpdate(id, fields) {
  const { data, error } = await _ctlSupa.from('ctrl_settlements').update(fields).eq('id', id).select().single();
  if (error) throw error;
  const L = window._src.settle, i = L.findIndex(r => String(r.id) === String(id));
  if (i >= 0) L[i] = data;
  return data;
}
function _cxSetErr(e) {
  if (/ctrl_settlements/.test(String(e && e.message || e))) { if (typeof ctlToast === 'function') ctlToast('Bitte zuerst das SQL-Update ausführen'); }
  else cxToastErr(e);
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
    '</div>' + _cxSetHTML() + sugHtml +
    '<div class="cx-head"><span class="cx-lbl">Einträge · ' + CX_MONTHS[CX.month - 1] + '</span></div>' + list + '</div>';

  cxWire(host, {
    render: () => window.renderOneTime(),
    click: async (a, b) => {
      if (a === 'form') { _cxOt.form = !_cxOt.form; return window.renderOneTime(); }
      if (a === 'setGrp') { const pid = Number(b.dataset.p); _cxSet.grp[pid] = b.getAttribute('aria-expanded') !== 'true'; return window.renderOneTime(); }
      if (a === 'setFold') { _cxSet.open = b.getAttribute('aria-expanded') !== 'true'; return window.renderOneTime(); }
      if (a === 'setPay') { const id = b.dataset.id; _cxSet.pay[id] = _cxSet.pay[id] ? null : { dir: 1 }; return window.renderOneTime(); }
      if (a === 'setDir') { const id = b.dataset.id; if (_cxSet.pay[id]) _cxSet.pay[id].dir = Number(b.dataset.v); return window.renderOneTime(); }
      if (a === 'setGen') {
        b.disabled = true;
        const cy = window._ctrl.year - 1, rows = _cxSetRows(cy);
        const add = ctlExpectedSettlements(cy).filter(e => !rows.some(x => ctlSettlementSame(x, e)))
          .map(e => ({ property_id: e.property_id, tenant_id: e.tenant_id, app: e.app || null, kind: e.kind, covers_year: e.covers_year, period_from: e.period_from, period_to: e.period_to, note: e.note || null, status: 'offen' }));
        try {
          const { data, error } = await _ctlSupa.from('ctrl_settlements').insert(add).select();
          if (error) throw error;
          window._src.settle = (window._src.settle || []).concat(data || []);
        } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'setStatus') {
        try { await _cxSetUpdate(b.dataset.id, { status: b.dataset.v }); } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'setDel') {
        if (!confirm('Diese Abrechnung aus der Liste löschen?')) return;
        try {
          const { error } = await _ctlSupa.from('ctrl_settlements').delete().eq('id', b.dataset.id);
          if (error) throw error;
          window._src.settle = window._src.settle.filter(r => String(r.id) !== String(b.dataset.id));
        } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'setPaySave') {
        const id = b.dataset.id, r = (window._src.settle || []).find(x => String(x.id) === String(id));
        if (!r) return;
        const via = document.getElementById('cxSetVia-' + id)?.value === 'kaution' ? 'kaution' : 'zahlung';
        const amt = cxParse(document.getElementById('cxSetAmt-' + id)?.value) || 0;
        const date = String(document.getElementById('cxSetDate-' + id)?.value || '').slice(0, 10) || _cxOtDefaultDate();
        const dir = (_cxSet.pay[id] && _cxSet.pay[id].dir) || 1;
        try {
          const already = typeof ctlSettlementAlreadyBooked === 'function' && ctlSettlementAlreadyBooked(r);
          if (already && typeof ctlToast === 'function') ctlToast('Schon aus dem Mieter-Tab in Einmalig gebucht – nur als bezahlt markiert');
          if (via === 'zahlung' && amt > 0 && !already) {
            await ctlAddOneTime({ property_id: r.property_id, invoice_date: date, item: _cxSetLabel(r), amount: cxR(amt),
              kind: r.kind === 'weg_hausgeld' ? 'Hausgeldabrechnung' : 'NK-Abrechnung', direction: dir, source_ref: 'set:' + id });
          }
          await _cxSetUpdate(id, { status: 'bezahlt', amount: cxR(amt), direction: dir, paid_date: date, settled_via: via });
          _cxSet.pay[id] = null;
          const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
          if (via === 'zahlung' && amt > 0 && typeof ctlToast === 'function') ctlToast('In Einmalig gebucht: ' + CX_MONTHS[m - 1] + ' ' + y);
        } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
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
        try {
          const d = _cxOtDefaultDate();
          await ctlAddOneTime({ property_id: s.pid, invoice_date: d, item: s.text, amount: s.amount, kind: 'NK-Abrechnung', direction: s.direction, source_ref: s.ref });
          // Fix 2: the matching entry in the Abrechnungen list is closed as well (no second booking)
          const row = (window._src.settle || []).find(r => r.kind === 'nk_tenant' && String(r.tenant_id) === s.tid && Number(r.covers_year) === Number(s.year) && r.status !== 'bezahlt');
          if (row) await _cxSetUpdate(row.id, { status: 'bezahlt', amount: s.amount, direction: s.direction, paid_date: d, settled_via: 'zahlung' });
        } catch (e) { cxToastErr(e); }
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
