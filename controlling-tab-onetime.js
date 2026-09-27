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


/* ── Abrechnungen (Phase 5 · B13 B14 G3 · rebuilt in Phase 1) ─
   Every expected yearly settlement is listed — stored or not yet (a virtual row gets its
   database row on the first status change). Per property, per open period (with its Frist),
   every unit: its settlement rows, or a gap line when no tenant is recorded for some days.
   Status: offen → erstellt → bezahlt (payment → one entry in Einmalig, counts in the month
   paid, D2; via Kaution → closed, no line, D14) or "nicht durchgeführt" (e.g. Pauschal).   */
let _cxSet = { edit: null, pay: {}, open: null, grp: {} };
let _cxSetGaps = {};
const _CX_SET_ST = { offen: ['open', 'offen'], erstellt: ['beige', 'erstellt'], bezahlt: ['ok', 'bezahlt'], 'nicht durchgeführt': ['grey', 'nicht durchgeführt'] };
const _cxSetIsOpen = r => r.status === 'offen' || r.status === 'erstellt';
function _cxSetTenantOf(r) {
  const S = window._src;
  return r.tenant_id ? (r.app === 'casa' ? S.casaTen : S.rntTen).find(x => String(x.id) === String(r.tenant_id)) || null : null;
}
function _cxSetUnitOf(r, e) {
  if (e && e.unit_name) return e.unit_name;
  if (ctlSettlementIsLeer(r)) return String(r.note).slice(5);
  const t = _cxSetTenantOf(r);
  if (t) return t.room || ((window._src.apts || []).find(a => String(a.id) === String(t.apartment_id)) || {}).name || '';
  return r.note || '';
}
function _cxSetPer(r) { const pr = ctlPeriodOf(ctlProp(r.property_id), r.period_from); return pr ? pr.label : String(r.covers_year); }
/* Long label — used as the text of the Einmalig entry */
function _cxSetLabel(r) {
  const p = ctlProp(r.property_id), pn = p ? p.name : '';
  if (r.kind === 'weg_hausgeld') return pn + ' · Hausgeld-Jahresabrechnung ' + _cxSetPer(r);
  const t = _cxSetTenantOf(r), nm = t ? [t.first_name, t.last_name].filter(Boolean).join(' ') : 'Mieter';
  const u = _cxSetUnitOf(r);
  return pn + (u && u !== pn ? ' · ' + u : '') + ' · ' + nm + ' · NK ' + _cxSetPer(r);
}
/* Row title inside its property / period */
function _cxSetTitle(r, e) {
  if (r.kind === 'weg_hausgeld') return 'Hausgeldabrechnung (WEG)';
  const pn = (ctlProp(r.property_id) || {}).name || '';
  const u = _cxSetUnitOf(r, e);
  if (ctlSettlementIsLeer(r)) return u + ' · leer';
  if (!r.tenant_id) return (r.note || 'Einheit') + ' · Mieter nicht verknüpft';
  const t = _cxSetTenantOf(r), nm = t ? [t.first_name, t.last_name].filter(Boolean).join(' ') : 'Mieter';
  return (u && u !== pn ? u + ' · ' : '') + nm + (r.note === 'Pauschal' ? ' · Pauschal' : '');
}
function _cxSetFristHTML(frist, show) {
  if (!frist || !show) return '';
  const t0 = cxToday(), soon = frist <= (() => { const d = new Date(t0 + 'T12:00:00'); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); })();
  return '<span style="' + (soon ? 'color:var(--cx-neg);font-weight:500' : '') + '">Frist ' + cxFmtDate(frist) + (frist < t0 ? ' – abgelaufen' : '') + '</span>';
}
const _cxDM = iso => cxFmtDate(iso).slice(0, 6);                       // 01.01.

/* Status panel: one set of choices instead of four links (#21) */
function _cxSetPanelHTML(r) {
  const id = cxEsc(r.id), pay = _cxSet.pay[r.id], weg = r.kind === 'weg_hausgeld';
  const chip = (v, lbl) => '<button class="cx-chip' + ((pay ? v === 'bezahlt' : r.status === v) ? ' on' : '') + '" data-cx="setTo" data-id="' + id + '" data-v="' + v + '">' + lbl + '</button>';
  let h = '<div class="cx-form" style="margin-top:8px"><div class="cx-chips">' +
    chip('offen', 'offen') + chip('erstellt', 'erstellt') + chip('bezahlt', 'bezahlt …') + chip('nicht durchgeführt', 'nicht durchgeführt') + '</div>';
  if (pay) {
    const res = [['nach', (weg ? 'Nachzahlung an WEG' : 'Nachzahlung Mieter') + ' · ' + (weg ? 'raus' : 'rein')],
                 ['gut', (weg ? 'Guthaben von WEG' : 'Guthaben Mieter') + ' · ' + (weg ? 'rein' : 'raus')],
                 ['null', 'ausgeglichen · 0 €']];
    const noAmt = pay.res === 'null';
    h += '<div class="cx-lbl" style="margin-top:4px">Ergebnis der Abrechnung</div>' +
      '<div class="cx-chips">' + res.map(([v, l]) => '<button class="cx-chip' + (pay.res === v ? ' on' : '') + '" data-cx="setRes" data-id="' + id + '" data-v="' + v + '">' + l + '</button>').join('') + '</div>' +
      '<div class="cx-grid2">' +
        (noAmt ? '' : '<label class="cx-f"><input type="text" inputmode="decimal" id="cxSetAmt-' + id + '" placeholder="Betrag" aria-label="Betrag"><span>€</span></label>') +
        '<label class="cx-f cx-f--l"><input type="date" id="cxSetDate-' + id + '" value="' + _cxOtDefaultDate() + '" aria-label="Bezahlt am"></label>' +
      '</div>' +
      (!weg && !noAmt ? '<label class="cx-f cx-f--l"><select id="cxSetVia-' + id + '" aria-label="Wie"><option value="zahlung">per Zahlung</option><option value="kaution">mit Kaution verrechnet</option></select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' : '') +
      '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="setCancel" data-id="' + id + '">Abbrechen</button>' +
      '<button class="cx-btn cx-btn--p" data-cx="setPaySave" data-id="' + id + '"' + (pay.res ? '' : ' disabled') + '>Speichern</button></div>';
  }
  return h + '</div>';
}

function _cxSetRowHTML(it, showPer) {
  const r = it.r, id = cxEsc(r.id);
  const st = it.stale ? ['grey', 'veraltet'] : (_CX_SET_ST[r.status] || _CX_SET_ST.offen);
  const fg = ctlSettlementFigures(r);
  const per = r.period_from && r.period_to ? _cxDM(r.period_from) + '–' + cxFmtDate(r.period_to) + (fg ? ' · ' + fg.days + ' Tage' : '') : '';
  const paid = r.status === 'bezahlt' && !it.stale ? (r.settled_via === 'kaution' ? 'mit Kaution verrechnet' :
    (r.direction == null || !Number(r.amount) ? 'ausgeglichen' : (Number(r.direction) === 1 ? '+ ' : '\u2212 ') + cxEur(r.amount || 0)) + (r.paid_date ? ' · ' + cxFmtDate(r.paid_date) : '')) : '';
  const lines = [];
  if (it.stale) lines.push('Passt nicht mehr zu den Mieterdaten – löschen, wenn die neue Zeile stimmt');
  else if (r.kind === 'weg_hausgeld' && fg) {
    if (fg.vacUnknown) lines.push('Leerstand nicht berechenbar – Einheit nicht mit Rentals verknüpft');
    else if (fg.vacant) lines.push('Leerstand ' + fg.vacant + (fg.vacant === 1 ? ' Tag' : ' Tage') + ' – Ihre Kosten');
  } else if (r.note === 'Pauschal') {
    if (_cxSetIsOpen(r)) lines.push('Pauschalmiete – keine NK-Abrechnung · als „nicht durchgeführt“ markieren');
  } else if (fg && fg.nkSoll !== null) {
    lines.push('NK-Vorauszahlung Soll ' + cxEur(fg.nkSoll) + (fg.preStart ? '' : ' · gezahlt ' + (fg.nkIst === null ? 'nicht erfasst' : cxEur(fg.nkIst) + (fg.istPartial ? ' (ab Controlling-Start)' : ''))));
  }
  const title = (showPer ? (r.kind === 'weg_hausgeld' ? '' : 'NK ' + _cxSetPer(r) + ' · ') : '') + _cxSetTitle(r, it.e);
  const act = it.stale
    ? '<button class="cx-link" style="display:inline;padding-left:0" data-cx="setDel" data-id="' + id + '">löschen</button>'
    : '<button class="cx-link" style="display:inline;padding-left:0" data-cx="setEdit" data-id="' + id + '">' + (_cxSet.edit === r.id ? 'schließen' : 'Status ändern') + '</button>';
  return '<div class="cx-r cx-r--set"><div class="cx-row-sb"><span class="cx-r__u">' + cxEsc(title) + '</span>' + cxPill(st[0], st[1]) + '</div>' +
    '<div class="cx-r__sub">' + cxEsc([per, paid].filter(Boolean).join(' · ')) + '</div>' +
    lines.map(l => '<div class="cx-r__sub">' + cxEsc(l) + '</div>').join('') +
    (showPer && fg && _cxSetIsOpen(r) ? '<div class="cx-r__sub">' + _cxSetFristHTML(fg.frist, true) + '</div>' : '') +
    '<div class="cx-r__sub">' + act + '</div>' +
    (_cxSet.edit === r.id && !it.stale ? _cxSetPanelHTML(r) : '') + '</div>';
}
function _cxSetGapHTML(it, key) {
  const src = it.app === 'casa' ? 'Casa Castel' : 'Rentals';
  const dates = _cxDM(it.from) + '–' + cxFmtDate(it.to) + ' · ' + it.days + (it.days === 1 ? ' Tag' : ' Tage');
  if (it.confirmed) return '<div class="cx-r cx-r--set"><div class="cx-row-sb"><span class="cx-r__u">' + cxEsc(it.unit.name + ' · leer') + '</span>' + cxPill('grey', 'leer bestätigt') + '</div>' +
    '<div class="cx-r__sub">' + cxEsc(dates) + '</div>' +
    '<div class="cx-r__sub"><button class="cx-link" style="display:inline;padding-left:0" data-cx="gapUndo" data-id="' + cxEsc(it.confirmed.id) + '">rückgängig</button></div></div>';
  const und = (it.undated || []).map(w => w.name);
  return '<div class="cx-r cx-r--set"><div class="cx-row-sb"><span class="cx-r__u">' + cxEsc(it.unit.name + ' · kein Mieter erfasst') + '</span>' + cxPill('open', 'prüfen') + '</div>' +
    '<div class="cx-r__sub">' + cxEsc(dates) + '</div>' +
    '<div class="cx-r__sub">' + cxEsc('Mieter in ' + src + ' nachtragen' + (und.length ? ' · ohne Einzug eingetragen: ' + und.join(', ') + ' – Einzug ergänzen' : '') + ' – oder:') + '</div>' +
    '<div class="cx-r__sub"><button class="cx-link" style="display:inline;padding-left:0" data-cx="gapLeer" data-g="' + key + '">war leer</button></div></div>';
}
function _cxSetExtraHTML(it) {
  const src = it.app === 'casa' ? 'Casa Castel' : 'Rentals';
  return '<div class="cx-r cx-r--set"><div class="cx-row-sb"><span class="cx-r__u">' + cxEsc(it.unit.name + ' · ' + it.name) + '</span>' + cxPill('open', 'prüfen') + '</div>' +
    '<div class="cx-r__sub">' + cxEsc('Mieter-Eintrag ohne Einzug – zählt nicht. In ' + src + ' Einzug eintragen oder den Eintrag löschen.') + '</div></div>';
}

function _cxSetHTML() {
  const M = ctlSettlementModel();
  _cxSetGaps = {};
  let gi = 0, nOpen = 0, nCheck = 0;
  M.forEach(g => { nOpen += g.nOpen; nCheck += g.nCheck; });
  const isOpen = _cxSet.open !== null ? _cxSet.open : (nOpen + nCheck > 0);
  const pills = n => (n.o ? cxPill('open', n.o + ' offen') : '') + (n.c ? cxPill('open', n.c + ' prüfen') : '') + (!n.o && !n.c ? cxPill('ok', 'erledigt') : '');
  const list = M.map(g => {
    if (!g.periods.length && !g.other.length) return '';
    const p = g.p, casa = p.id === CASA_PROP_ID;
    const gOpen = _cxSet.grp[p.id] !== undefined ? _cxSet.grp[p.id] : g.nOpen + g.nCheck > 0;
    const body = !gOpen ? '' :
      g.periods.map(per => '<div class="cx-set-per"><span>Zeitraum ' + cxEsc(per.label) + ' · ' + _cxDM(per.from) + '–' + cxFmtDate(per.to) + '</span>' +
          _cxSetFristHTML(per.frist, per.items.some(it => (it.type === 'row' && !it.stale && _cxSetIsOpen(it.r)) || (it.type === 'gap' && !it.confirmed))) + '</div>' +
        per.items.map(it => {
          if (it.type === 'gap') { const k = 'g' + (gi++); _cxSetGaps[k] = it; return _cxSetGapHTML(it, k); }
          if (it.type === 'extra') return _cxSetExtraHTML(it);
          return _cxSetRowHTML(it, false);
        }).join('')).join('') +
      (g.other.length ? '<div class="cx-set-per"><span>Frühere Zeiträume</span></div>' + g.other.map(it => _cxSetRowHTML(it, true)).join('') : '');
    return '<div class="cx-set-grp">' +
      '<button class="cx-ph" style="padding-left:0;padding-right:0" data-cx="setGrp" data-p="' + p.id + '" aria-expanded="' + gOpen + '">' +
        '<span class="cx-ph__l"><span class="cx-pn cx-pn--s">' + cxEsc(p.name) + '</span><span class="cx-src">' +
          (casa ? 'NK je Zimmer-Mieter' : 'Hausgeld (WEG) + NK je Mieter') + '</span></span>' +
        '<span class="cx-ph__r">' + pills({ o: g.nOpen, c: g.nCheck }) +
        '<i class="ti ti-chevron-' + (gOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>' + body + '</div>';
  }).join('');
  const body = !isOpen ? '' : '<div style="padding:0 16px 12px">' + (list || '<div class="cx-r__sub" style="padding:8px 0">Keine Abrechnungen fällig.</div>') + '</div>';
  return '<div class="cx-card" id="cxSetCard"><button class="cx-ph" data-cx="setFold" aria-expanded="' + isOpen + '">' +
    '<span class="cx-ph__l"><span class="cx-pn">Abrechnungen</span><span class="cx-src">alle offenen Zeiträume · je Objekt</span></span>' +
    '<span class="cx-ph__r">' + pills({ o: nOpen, c: nCheck }) +
    '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span></button>' + body + '</div>';
}

/* A virtual row gets its database row now — after checking the database for one (two devices) */
async function _cxSetEnsure(id) {
  const L = window._src.settle || (window._src.settle = []);
  if (!String(id).startsWith('v:')) return L.find(x => String(x.id) === String(id)) || null;
  const e = ctlSettlementVirtual(id);
  if (!e) return null;
  const mine = L.find(x => !ctlSettlementIsLeer(x) && ctlSettlementSame(x, e));
  if (mine) return mine;
  let q = _ctlSupa.from('ctrl_settlements').select('*').eq('property_id', e.property_id).eq('kind', e.kind).eq('period_from', String(e.period_from).slice(0, 10));
  q = e.tenant_id ? q.eq('tenant_id', String(e.tenant_id)) : q.is('tenant_id', null);
  const { data: ex, error: exErr } = await q;
  if (exErr) throw exErr;
  const hit = (ex || []).find(x => !ctlSettlementIsLeer(x) && ctlSettlementSame(x, e));
  if (hit) { L.push(hit); ctlSettlementInvalidate(); return hit; }
  const row = { property_id: e.property_id, tenant_id: e.tenant_id || null, app: e.app || null, kind: e.kind, covers_year: e.covers_year,
                period_from: String(e.period_from).slice(0, 10), period_to: String(e.period_to).slice(0, 10), note: e.note || null, status: 'offen' };
  const { data, error } = await _ctlSupa.from('ctrl_settlements').insert(row).select().single();
  if (error) throw error;
  L.push(data); ctlSettlementInvalidate();
  return data;
}
async function _cxSetUpdate(id, fields) {
  const { data, error } = await _ctlSupa.from('ctrl_settlements').update(fields).eq('id', id).select().single();
  if (error) throw error;
  const L = window._src.settle, i = L.findIndex(r => String(r.id) === String(id));
  if (i >= 0) L[i] = data;
  ctlSettlementInvalidate();
  return data;
}
async function _cxSetDelete(id) {
  const { error } = await _ctlSupa.from('ctrl_settlements').delete().eq('id', id);
  if (error) throw error;
  window._src.settle = (window._src.settle || []).filter(r => String(r.id) !== String(id));
  ctlSettlementInvalidate();
}
function _cxSetErr(e) {
  if (/ctrl_settlements/.test(String(e && e.message || e))) { if (typeof ctlToast === 'function') ctlToast('Bitte zuerst das SQL-Update ausführen'); }
  else cxToastErr(e);
}
/* Keep what was typed in a pay form across a re-render */
function _cxSetKeep(id, fn) {
  const g = k => document.getElementById(k + id);
  const keep = { amt: g('cxSetAmt-')?.value, date: g('cxSetDate-')?.value, via: g('cxSetVia-')?.value };
  fn();
  if (keep.amt !== undefined && g('cxSetAmt-')) g('cxSetAmt-').value = keep.amt;
  if (keep.date && g('cxSetDate-')) g('cxSetDate-').value = keep.date;
  if (keep.via && g('cxSetVia-')) g('cxSetVia-').value = keep.via;
}
/* Find the row (stored or virtual) behind an id from the current model */
function _cxSetRowById(id) {
  for (const g of ctlSettlementModel()) {
    for (const per of g.periods) for (const it of per.items) if (it.type === 'row' && String(it.r.id) === String(id)) return it.r;
    for (const it of g.other) if (String(it.r.id) === String(id)) return it.r;
  }
  return null;
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

  // #17: the Abrechnungen cover every open period, so they sit above the month selector;
  // the month selector below only steers the month's entries.
  host.innerHTML = '<div class="cx-page">' + _cxSetHTML() +
    '<div class="cx-head" style="padding-top:10px"><span class="cx-lbl">Einträge je Monat</span></div>' + cxMonthBar() +
    '<div class="cx-card cx-sum">' +
      '<div class="cx-lbl">Einmalig · ' + CX_MONTHS[CX.month - 1] + '</div>' +
      '<div class="cx-io"><div><div class="cx-lbl">Rein</div><div class="cx-io__v">' + cxW(rein) + '</div></div>' +
      '<div style="text-align:right"><div class="cx-lbl">Raus</div><div class="cx-io__v">' + cxW(raus) + '</div></div></div>' +
      '<button class="cx-btn cx-btn--' + (_cxOt.form ? 's' : 'p') + ' cx-btn--full" style="margin-top:12px" data-cx="form"><i class="ti ti-' + (_cxOt.form ? 'x' : 'plus') + '" aria-hidden="true"></i>' + (_cxOt.form ? 'Abbrechen' : 'Eintrag hinzufügen') + '</button>' +
      form +
    '</div>' + sugHtml +
    '<div class="cx-head"><span class="cx-lbl">Einträge · ' + CX_MONTHS[CX.month - 1] + '</span></div>' + list + '</div>';

  cxWire(host, {
    render: () => window.renderOneTime(),
    click: async (a, b) => {
      if (a === 'form') { _cxOt.form = !_cxOt.form; return window.renderOneTime(); }
      if (a === 'setGrp') { const pid = Number(b.dataset.p); _cxSet.grp[pid] = b.getAttribute('aria-expanded') !== 'true'; return window.renderOneTime(); }
      if (a === 'setFold') { _cxSet.open = b.getAttribute('aria-expanded') !== 'true'; return window.renderOneTime(); }
      if (a === 'setEdit') { const id = b.dataset.id; _cxSet.edit = _cxSet.edit === id ? null : id; _cxSet.pay = {}; return window.renderOneTime(); }
      if (a === 'setCancel') { _cxSet.pay = {}; _cxSet.edit = null; return window.renderOneTime(); }
      if (a === 'setRes') { const id = b.dataset.id; if (_cxSet.pay[id]) _cxSet.pay[id].res = b.dataset.v; return _cxSetKeep(id, () => window.renderOneTime()); }
      if (a === 'setTo') {
        const id = b.dataset.id, v = b.dataset.v, r = _cxSetRowById(id);
        if (!r) return;
        if (v === 'bezahlt' && r.status === 'bezahlt') { if (typeof ctlToast === 'function') ctlToast('Schon bezahlt – zum Ändern zuerst „offen“ wählen'); return; }
        if (v === 'bezahlt') { _cxSet.pay = { [id]: { res: null } }; return window.renderOneTime(); }
        if (r.status === v && !_cxSet.pay[id]) { _cxSet.edit = null; return window.renderOneTime(); }
        b.disabled = true;
        try {
          // leaving "bezahlt": the payment booked from this list is removed too, so it can't count twice
          if (r.status === 'bezahlt' && !r._virtual) {
            const ot = (window._ctrl.one_time || []).find(o => o.source_ref === 'set:' + r.id);
            if (ot) {
              if (!confirm('Die Buchung in Einmalig (' + cxEur(ot.amount) + ' am ' + cxFmtDate(ot.invoice_date) + ') wird ebenfalls gelöscht.')) { b.disabled = false; return; }
              await ctlDeleteOneTime(ot.id);
            } else if (r.settled_via === 'zahlung' && Number(r.amount) > 0 && typeof ctlToast === 'function') {
              ctlToast('Buchung liegt in ' + String(r.paid_date || '').slice(0, 4) + ' – dort in Einmalig bitte von Hand löschen');
            }
          }
          const row = await _cxSetEnsure(id);
          if (row) await _cxSetUpdate(row.id, v === 'offen' || v === 'erstellt' || v === 'nicht durchgeführt'
            ? { status: v, amount: null, direction: null, paid_date: null, settled_via: null } : { status: v });
          _cxSet.edit = null; _cxSet.pay = {};
        } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'setDel') {
        if (!confirm('Diese veraltete Abrechnung löschen?')) return;
        try { await _cxSetDelete(b.dataset.id); } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'gapLeer') {
        const it = _cxSetGaps[b.dataset.g];
        if (!it) return;
        b.disabled = true;
        try {
          const { data, error } = await _ctlSupa.from('ctrl_settlements').insert({
            property_id: it.unit.property_id, tenant_id: null, app: it.app, kind: 'nk_tenant', covers_year: it.covers_year,
            period_from: it.from, period_to: it.to, note: 'leer:' + it.unit.name, status: 'nicht durchgeführt' }).select().single();
          if (error) throw error;
          window._src.settle = (window._src.settle || []).concat([data]);
          ctlSettlementInvalidate();
        } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'gapUndo') {
        try { await _cxSetDelete(b.dataset.id); } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'setPaySave') {
        const id = b.dataset.id, pay = _cxSet.pay[id], r0 = _cxSetRowById(id);
        if (!pay || !r0) return;
        if (!pay.res) { if (typeof ctlToast === 'function') ctlToast('Bitte Nachzahlung, Guthaben oder ausgeglichen wählen'); return; }
        const weg = r0.kind === 'weg_hausgeld', zero = pay.res === 'null';
        const amt = zero ? 0 : cxParse(document.getElementById('cxSetAmt-' + id)?.value);
        if (!zero && !(amt > 0)) { if (typeof ctlToast === 'function') ctlToast('Bitte den Betrag eingeben'); document.getElementById('cxSetAmt-' + id)?.focus(); return; }
        const via = !weg && !zero && document.getElementById('cxSetVia-' + id)?.value === 'kaution' ? 'kaution' : 'zahlung';
        const date = String(document.getElementById('cxSetDate-' + id)?.value || '').slice(0, 10) || _cxOtDefaultDate();
        // #4: the direction follows the choice — Nachzahlung Mieter = rein, Nachzahlung an WEG = raus
        const dir = zero ? null : (pay.res === 'nach' ? (weg ? -1 : 1) : (weg ? 1 : -1));
        b.disabled = true;
        try {
          const r = await _cxSetEnsure(id);
          if (!r) return;
          const already = typeof ctlSettlementAlreadyBooked === 'function' && ctlSettlementAlreadyBooked(r);
          if (already && typeof ctlToast === 'function') ctlToast('Schon aus dem Mieter-Tab in Einmalig gebucht – nur als bezahlt markiert');
          if (via === 'zahlung' && amt > 0 && !already) {
            await ctlAddOneTime({ property_id: r.property_id, invoice_date: date, item: _cxSetLabel(r), amount: cxR(amt),
              kind: weg ? 'Hausgeldabrechnung' : 'NK-Abrechnung', direction: dir, source_ref: 'set:' + r.id });
          }
          await _cxSetUpdate(r.id, { status: 'bezahlt', amount: cxR(amt), direction: dir, paid_date: date, settled_via: via });
          _cxSet.pay = {}; _cxSet.edit = null;
          const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
          if (via === 'zahlung' && amt > 0 && !already && typeof ctlToast === 'function') ctlToast('In Einmalig gebucht: ' + CX_MONTHS[m - 1] + ' ' + y);
        } catch (e) { _cxSetErr(e); }
        return window.renderOneTime();
      }
      if (a === 'kind') { _cxOt.kind = b.dataset.v; _cxOt.dir = _CX_KIND_DIR[b.dataset.v] || -1; return _cxOtKeepForm(); }
      if (a === 'dir')  { _cxOt.dir = Number(b.dataset.v); return _cxOtKeepForm(); }
      if (a === 'save') return _cxOtSave();
      if (a === 'del') {
        const oid = isNaN(Number(b.dataset.id)) ? b.dataset.id : Number(b.dataset.id);
        const o = (window._ctrl.one_time || []).find(x => String(x.id) === String(oid));
        const setId = o && /^set:/.test(String(o.source_ref || '')) ? String(o.source_ref).slice(4) : null;
        if (!confirm(setId ? 'Eintrag löschen? Die zugehörige Abrechnung wird wieder „offen“.' : 'Eintrag löschen?')) return;
        try {
          await ctlDeleteOneTime(oid);
          if (setId && (window._src.settle || []).some(r => String(r.id) === setId))
            await _cxSetUpdate(setId, { status: 'offen', amount: null, direction: null, paid_date: null, settled_via: null });
        } catch (e) { cxToastErr(e); }
        return window.renderOneTime();
      }
      if (a === 'sug') {
        const s = ctlOtSuggestions()[Number(b.dataset.i)];
        if (!s) return;
        b.disabled = true;
        try {
          const d = _cxOtDefaultDate();
          await ctlAddOneTime({ property_id: s.pid, invoice_date: d, item: s.text, amount: s.amount, kind: 'NK-Abrechnung', direction: s.direction, source_ref: s.ref });
          // #24: close the matching settlement only when it is unambiguous — same tenant + year, still open,
          // and not the Pauschal span. Otherwise the choice stays with you in the list.
          const cand = [];
          for (const g of ctlSettlementModel()) {
            const its = g.other.concat(...g.periods.map(per => per.items));
            for (const it of its) if (it.type === 'row' && !it.stale && it.r.kind === 'nk_tenant' && String(it.r.tenant_id) === s.tid &&
                                     Number(it.r.covers_year) === Number(s.year) && _cxSetIsOpen(it.r)) cand.push(it.r);
          }
          const kn = cand.filter(r => r.note !== 'Pauschal');
          const pick = kn.length === 1 ? kn[0] : null;
          if (pick) {
            const row = await _cxSetEnsure(pick.id);
            if (row) await _cxSetUpdate(row.id, { status: 'bezahlt', amount: s.amount, direction: s.direction, paid_date: d, settled_via: 'zahlung' });
          } else if (kn.length > 1 && typeof ctlToast === 'function') ctlToast('Gebucht – bitte oben die passende Abrechnung als bezahlt markieren');
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
