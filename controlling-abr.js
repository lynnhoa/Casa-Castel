/* ─────────────────────────────────────────────────────────────
   CONTROLLING — ABRECHNUNGEN RESULTS (NK · Hausgeld) in Income / Expenses
   controlling-abr.js

   Controlling does no settlement tracking. It only shows FINISHED results
   and lets you confirm when the money moved:
     Income   (+1)  NK Nachzahlung vom Mieter · Hausgeld Guthaben von WEG
     Expenses (−1)  NK Guthaben an Mieter   · Hausgeld Nachzahlung an WEG
   Sources of results
     · abr_results            (written by Settlements; the old manual
                               "+ Abrechnung" form is gone — Fix 1, Oct 2026)
     · tenant-tab NK entries  (Casa Castel / Rentals, with an amount) — interim
   When a row shows
     · nothing before a result exists (no placeholders)
     · open → in its month (due date, else result date); if that month is over,
       it moves along into the current month ("fällig seit …") until confirmed
     · confirmed → in the month paid (the booking's date)
     · settled via Kaution / Miete / Hausgeld or 0 € → once, as information
   Bookings stay in ctrl_expense_one_time (kind NK-Abrechnung / Hausgeldabrechnung,
   source_ref 'abr:<id>' or the tenant-tab ref) → Dashboard unchanged.
   Nov 2026: such a bill shows its Abrechnungszeitraum (nk_from / nk_to, typed in Settlements).
   Fix 3 (Oct 2026): Casa Castel's Versorger Jahresabrechnungen (Strom · Gas · Wasser ·
   Entsorgung, typed and paid in Settlements › Casa Castel, kind Versorger) show here too —
   read-only, in the month paid: Guthaben in Income, Nachzahlung in Expenses. One-off no
   longer lists them; the Dashboard counts them with the Abrechnungen.
   Never part of "Alle offenen wie geplant".
   ───────────────────────────────────────────────────────────── */

'use strict';

const CX_ABR_KINDS = ['NK-Abrechnung', 'Hausgeldabrechnung'];
/* Fix 3: a Casa Castel Versorger Jahresabrechnung (Strom · Gas · Wasser · Entsorgung) — an Abrechnung, not a one-off */
function ctlIsCasaJa(o) { return !!o && Number(o.property_id) === CASA_PROP_ID && o.kind === 'Versorger'; }
let _cxAbrIndex = {};                                   // row id → { res | legacy }

const _cxYm = iso => { const s = String(iso || '').slice(0, 10); return s ? Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) : null; };
const _cxAbrVia = { kaution: 'settled with Kaution', miete: 'settled with rent', hausgeld: 'settled with Hausgeld' };

function _cxAbrLabel(kind, year, dir, unit, name, from, to) {
  const per = from && to && typeof ctlPeriodLabel === 'function' ? ctlPeriodLabel(from, to) : String(year);   // NK dd.mm.yyyy–dd.mm.yyyy
  if (kind === 'weg_hausgeld') return 'Hausgeld ' + per + ' · ' + (dir > 0 ? 'Guthaben from WEG' : dir < 0 ? 'Nachzahlung to WEG' : 'balanced');
  return 'NK ' + per + [unit, name].filter(Boolean).map(x => ' · ' + x).join('') + ' · ' +
    (dir > 0 ? 'Nachzahlung from tenant' : dir < 0 ? 'Guthaben to tenant' : 'balanced');
}

/* Every result (all years), newest first */
function ctlAbrResults() {
  const S = window._src, out = [];
  const props = window._ctrl.properties;
  for (const r of (S.abr || [])) {
    if (r.status === 'storniert') continue;
    const dir = Number(r.direction) || 0;
    out.push({ key: 'abr:' + r.id, refs: ['abr:' + r.id].concat(r.source_ref ? [r.source_ref] : []), db: r,
               pid: Number(r.property_id), kind: r.kind, year: r.year, dir, amount: cxR(r.amount),
               date: String(r.due_date || r.result_date || '').slice(0, 10), via: r.settle_via || 'zahlung',
               label: _cxAbrLabel(r.kind, r.year, dir, r.unit_label, r.tenant_name, r.period_from, r.period_to), manual: true });
  }
  // interim: NK entries with an amount from the tenant tabs (not yet taken over into abr_results)
  const over = new Set((S.abr || []).filter(r => r.status !== 'storniert' && r.source_ref).map(r => r.source_ref));
  const yr = e => { const m = String(e.period || '').match(/20\d\d/g); return m ? Number(m[m.length - 1]) : null; };
  const aptProp = aptId => props.filter(p => p.active).find(p => { const l = ctlPropLinks(p); return l.apt && String(l.apt.id) === String(aptId); });
  // #7 (Oct 2026): the same tenant + year already has a result from Settlements → the old Tenants-tab entry is hidden
  const newRes = new Set((S.abr || []).filter(r => r.status !== 'storniert' && r.kind === 'nk_tenant' && r.tenant_id).map(r => String(r.tenant_id) + '|' + Number(r.year)));
  const add = (e, ref, t, p, unit) => {
    const amt = _cxNum(e.amount);
    if (!amt || !p || over.has(ref) || newRes.has(String(e.tenant_id) + '|' + yr(e))) return;
    const dir = amt > 0 ? 1 : -1, y = yr(e) || '';
    out.push({ key: ref, refs: [ref], pid: p.id, kind: 'nk_tenant', year: y, dir, amount: cxR(Math.abs(amt)),
               date: e.created_at ? (typeof ccDayOf === 'function' ? ccDayOf(e.created_at) : String(e.created_at).slice(0, 10)) : cxToday(), via: 'zahlung',
               label: _cxAbrLabel('nk_tenant', y, dir, unit, t ? [t.first_name, t.last_name].filter(Boolean).join(' ') : ''), tenantTab: true });
  };
  for (const e of (S.rntNk || [])) {
    const t = S.rntTen.find(x => String(x.id) === String(e.tenant_id));
    const p = t && t.apartment_id ? aptProp(t.apartment_id) : null;
    add(e, 'rnt_nk:' + e.id, t, p, '');
  }
  const casa = props.find(p => p.id === CASA_PROP_ID && p.active);
  for (const e of (S.casaNk || [])) {
    const t = S.casaTen.find(x => String(x.id) === String(e.tenant_id));
    add(e, 'nk:' + e.id, t, casa, t && t.room);
  }
  return out;
}

/* The booking of a result (any year) */
function ctlAbrBooking(res) {
  return (window._src.abrPay || []).find(o => res.refs.includes(o.source_ref)) || null;
}

/* ── BACK TO OPEN — one rule for Settlements and Controlling (C1 #4, Nov 2026) ──────────────
   Settlements' "Back to open" (Rentals / manual lines: _stReopen · Casa Castel: scReopen) and the 'cancel'
   of an Abrechnung in Controlling Income / Expenses do exactly the same, with the code below:
     1 the booking in Controlling: one that Settlements / Controlling made is removed · an entry you typed
       yourself (linked by Settlements) is only unlinked — it stays in Controlling as you typed it
     2 the result is cancelled (abr_results 'storniert')
     3 its stored Settlements line(s) are open again — no amount, no direction, no date — so Settlements
       and the tenant card's NK pill follow (cancelling in Controlling left them saying 'settled')
   The booking rules (#12: the type you gave an entry comes back when it is unlinked) moved here from
   settlements-tab-tracking.js; Settlements loads this file before its tabs. */
const ST_ABR_KINDS = ['NK-Abrechnung', 'Hausgeldabrechnung'];
async function _stUpdOT(id, fields) {
  try { return await ctlUpdateOneTime(id, fields); }
  catch (e) {
    if (!('before_link' in fields) || !/before_link/i.test(String((e && (e.message || e.details)) || e))) throw e;
    const f = Object.assign({}, fields); delete f.before_link;
    return ctlUpdateOneTime(id, f);
  }
}
function _stBL(o) {                                                   // remembered type → { kind, direction } or null
  let v = o && o.before_link;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : null;
}
/* Switching a payment off: a booking Settlements made is removed · an entry you typed yourself in
   Controlling (linked by #6 or the WEG match) is only unlinked — it stays in Controlling as you typed it.
   C1 #4: also a booking Controlling made for a result without its period ("NK 2025 · …", the label it writes
   then) counts as made by the apps · an entry that remembers your own type (before_link) is always yours. */
const ST_AUTO_ITEM = /^(NK|Hausgeld) (\d{2}\.\d{2}\.\d{4}|\d{4} · )/;
const _stIsOwnBooking = b => !_stBL(b) && ST_AUTO_ITEM.test(String((b && b.item) || ''));
async function _stUndoBooking(b) {
  window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id);
  if (_stIsOwnBooking(b)) { await ctlDeleteOneTime(b.id); return 'deleted'; }
  const cur = (window._ctrl.one_time || []).find(x => x.id === b.id);
  const bl = _stBL(b) || _stBL(cur);                                  // #12: back to the type you gave it
  const f = { source_ref: null, kind: bl && bl.kind && !ST_ABR_KINDS.includes(bl.kind) ? bl.kind : 'Sonstiges', before_link: null };
  if (bl && bl.kind && bl.direction !== undefined) f.direction = bl.direction;
  const d = await _stUpdOT(b.id, f);
  const k = (window._ctrl.one_time || []).findIndex(x => x.id === b.id); if (k >= 0 && d) window._ctrl.one_time[k] = d;
  return 'unlinked';
}
const _stUndoText = (b, fmtDate, fmtEur) => !b ? '' : _stIsOwnBooking(b)
  ? 'The booking of ' + fmtDate(b.invoice_date) + ' (' + fmtEur(b.amount) + ') in Controlling is removed too.'
  : 'Your own entry of ' + fmtDate(b.invoice_date) + ' (' + fmtEur(b.amount) + ') stays in Controlling – it is only unlinked.';

/* The result a Settlements line stands for (Settlements' rule, _stResultOf): its result_id, else the same
   property · kind · year · tenant (· period). → the abr_results row, or null */
function ctlSettleResult(pid, r) {
  const d10 = v => String(v || '').slice(0, 10);
  const list = (window._src.abr || []).filter(x => x.status !== 'storniert');
  let x = r.result_id ? list.find(a => String(a.id) === String(r.result_id)) : null;
  if (!x) x = list.find(a => Number(a.property_id) === Number(pid) && a.kind === r.kind && Number(a.year) === Number(r.covers_year) &&
    String(a.tenant_id || '') === String(r.tenant_id || '') && (!a.period_from || d10(a.period_from) === d10(r.period_from)));
  return x || null;
}
/* The stored Settlements lines that show this result (read BEFORE it is cancelled) — as Settlements sees them:
   a confirmed Leerstand and a skipped NK never show a result, so they are never touched */
function ctlAbrSettleLines(res) {
  const id = res && res.db ? String(res.db.id) : null;
  if (id === null) return [];
  const leer = r => typeof ctlSettlementIsLeer === 'function' && ctlSettlementIsLeer(r);
  return (window._src.settle || []).filter(r => {
    if (leer(r) || r.status === 'nicht durchgeführt') return false;
    const x = ctlSettleResult(r.property_id, r);
    return !!x && String(x.id) === id;
  });
}
/* 1 + 2: the booking goes (your own entry is only unlinked), the result is cancelled */
async function ctlAbrStorno(res) {
  const b = ctlAbrBooking(res);
  if (b) await _stUndoBooking(b);
  const { error } = await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', res.db.id);
  if (error) throw error;
  res.db.status = 'storniert';
}
/* 3: one stored Settlements line back to open (a line Settlements only shows has nothing stored) */
async function ctlSettleOpen(r) {
  if (!r || r._virtual || String(r.id).startsWith('v:')) return null;
  const up = async f => {
    const { data, error } = await _ctlSupa.from('ctrl_settlements').update(f).eq('id', r.id).select().single();
    if (error) throw error;
    const i = (window._src.settle || []).findIndex(x => x.id === r.id);
    if (i >= 0) window._src.settle[i] = data;
    return data;
  };
  const f = { paid_date: null, status: 'offen', amount: null, direction: null, settled_via: null, result_id: null };
  try { return await up(f); }
  catch (e) { const g = Object.assign({}, f); delete g.result_id; return up(g); }      // without the result_id column (older SQL)
}

/* Rows of one property card in a month, for one direction (+1 Income, −1 Expenses) */
function ctlAbrRows(pid, y, m, dir) {
  const rows = [], ym = y * 12 + m, t = cxToday(), cur = _cxYm(t);
  const allRes = ctlAbrResults(), results = allRes.filter(r => r.pid === pid && r.dir === dir);
  const usedRefs = new Set();
  for (const r of results) {
    // Nov 2026 fix: a booking in the OTHER direction is no payment of this result — the result was changed in
    // Settlements after it was paid (Nachzahlung → Guthaben). It counted as paid here and showed a second time,
    // as "without Abrechnung", on the other side. Now: the result is open, the booking stays where its money went (flagged).
    const b0 = ctlAbrBooking(r), b = b0 && (Number(b0.direction) === 1 ? 1 : -1) === r.dir ? b0 : null;
    if (b0) usedRefs.add(b0.source_ref);
    const rym = _cxYm(r.date) || cur;
    if (r.via !== 'zahlung' || !r.amount) {                                // information only
      if (rym === ym) rows.push({ id: 'abrI:' + r.key, res: r, info: true });
      continue;
    }
    if (b) { if (_cxYm(b.invoice_date) === ym) rows.push({ id: 'abr:' + r.key, res: r, booking: b, soll: r.amount, ist: cxR(b.amount) }); continue; }
    const showIn = rym >= cur ? rym : cur;                                 // overdue → moves along to the current month
    if (showIn === ym) rows.push({ id: 'abr:' + r.key, res: r, soll: r.amount, ist: null, overdue: rym < cur ? rym : null, stale: b0 || null });
  }
  // bookings without a result (older manual NK / Hausgeld entries) — shown in the month paid
  for (const o of (window._src.abrPay || [])) {
    if (Number(o.property_id) !== pid || usedRefs.has(o.source_ref) || _cxYm(o.invoice_date) !== ym) continue;
    if ((Number(o.direction) === 1 ? 1 : -1) !== dir) continue;
    if (results.some(r => r.refs.includes(o.source_ref))) continue;
    const moved = allRes.find(r => r.pid === pid && r.dir !== dir && r.refs.includes(o.source_ref)) || null;   // its result changed direction
    rows.push({ id: 'abrL:' + o.id, legacy: o, soll: cxR(o.amount), ist: cxR(o.amount), moved });
  }
  // Fix 3: Casa Castel's Versorger Jahresabrechnungen — typed and paid in Settlements, shown read-only in the month paid
  if (Number(pid) === CASA_PROP_ID) {
    for (const o of (window._ctrl.one_time || [])) {
      if (!ctlIsCasaJa(o) || _cxYm(o.invoice_date) !== ym) continue;
      if ((Number(o.direction) === 1 ? 1 : -1) !== dir) continue;
      rows.push({ id: 'abrV:' + o.id, ja: o, info: true });
    }
  }
  return rows;
}
/* open results of a property in a month (for card status, summaries, Dashboard) */
function ctlAbrOpenCount(pid, y, m, dir) {
  return ctlAbrRows(pid, y, m, dir).filter(r => !r.info && r.ist === null).length;
}

/* ── HTML: the "Abrechnungen" section of a property card ── */
function cxAbrSection(p, y, m, dir) {
  const rows = ctlAbrRows(p.id, y, m, dir);
  const mon = ym => CX_MONTHS[(ym - 1) % 12].slice(0, 3);
  let h = '<div class="cx-abr-h"><span class="cx-lbl">Abrechnungen</span>' +
    '<a class="cx-link" href="settlements.html" style="color:var(--cx-acc)">open in Settlements ›</a></div>';
  for (const r of rows) {
    _cxAbrIndex[r.id] = Object.assign({ p, dir }, r);
    if (r.ja) {                                                            // Fix 3: Versorger Jahresabrechnung · read-only
      const inn = Number(r.ja.direction) === 1;
      h += '<div class="cx-r"><div class="cx-r__top"><span class="cx-r__u">' + cxEsc(r.ja.item || 'Jahresabrechnung') + '</span>' +
        cxPill(inn ? 'in' : 'out', inn ? 'Guthaben' : 'Nachzahlung') + '</div>' +   // CP1: green money to you · red money from you
        '<div class="cx-r__sub">' + cxIO((inn ? 1 : -1) * r.ja.amount, cxEur) + cxEsc(' · ' + (inn ? 'received ' : 'paid ') + cxFmtDate(r.ja.invoice_date) + ' · from Settlements') + '</div>' +
        (r.ja.nk_from && r.ja.nk_to ? '<div class="cx-r__sub">' + cxEsc('Abrechnungszeitraum ' + cxFmtDate(r.ja.nk_from) + '–' + cxFmtDate(r.ja.nk_to) + ' · split by days into the NK years') + '</div>' : '') + '</div>';   // Nov 2026
      continue;
    }
    if (r.info) {
      h += '<div class="cx-r"><div class="cx-r__top"><span class="cx-r__u">' + cxEsc(r.res.label) + '</span>' + cxPill('grey', 'settled') + '</div>' +
        '<div class="cx-r__sub">' + cxEsc((r.res.amount ? cxEur(r.res.amount) + ' · ' : '') + (_cxAbrVia[r.res.via] || 'balanced') + ' – no payment') + '</div>' +
        (r.res.manual ? '<div class="cx-r__sub"><button class="cx-link cx-link--a" data-cx="abrStorno" data-id="' + cxEsc(r.id) + '">cancel</button></div>' : '') + '</div>';
      continue;
    }
    const label = r.legacy ? (r.legacy.item || r.legacy.kind) : r.res.label;
    const flip = d => (d > 0 ? 'Nachzahlung' : 'Guthaben');
    const sub = r.legacy ? 'booked ' + cxFmtDate(r.legacy.invoice_date) +
        (r.moved ? ' · the Abrechnung is now a ' + flip(r.moved.dir) + ' of ' + cxEur(r.moved.amount) + ' – settle it again in Settlements' : ' · without Abrechnung')
      : r.booking ? 'paid ' + cxFmtDate(r.booking.invoice_date)
      : (r.res.tenantTab ? 'from the tenant tab' : 'Abrechnung of ' + cxFmtDate(r.res.db.result_date)) +
        (r.stale ? ' · booked before as ' + flip(Number(r.stale.direction) === 1 ? 1 : -1) + ' ' + cxEur(r.stale.amount) + ' – settle it again in Settlements' : '');
    h += cxRow({ id: r.id, label, soll: r.soll, ist: r.ist, allowEmpty: true, dir,   // CP2: differences from your view (no "On purpose" here)
                 pills: r.overdue ? cxPill('open', 'due since ' + mon(r.overdue)) : '',
                 sub: cxIO(dir * r.soll, cxEur) + ' · ' + cxEsc(sub) + (r.res && r.res.manual ? ' · <button class="cx-link cx-link--a cx-link--in" data-cx="abrStorno" data-id="' + cxEsc(r.id) + '">cancel</button>' : '') });
  }
  return '<div class="cx-abr' + (!rows.length ? ' cx-abr--empty' : '') + '">' + h + '</div>';
}


/* Booking date: today when looking at the current month, else the result's date if it lies in the viewed month,
   else the last (past) or first (future) day of the viewed month */
function _cxAbrPayDate(res, y, m) {
  const t = cxToday(), ym = y * 12 + m, cur = _cxYm(t);
  if (ym === cur) return t;
  if (res && _cxYm(res.date) === ym) return res.date;
  const last = new Date(y, m, 0).getDate();
  return y + '-' + String(m).padStart(2, '0') + '-' + String(ym < cur ? last : 1).padStart(2, '0');
}

async function _cxAbrBook(e, amount) {
  const r = e.res, y = window._ctrl.year, m = CX.month;
  if (e.legacy) {                                                          // booking without result: edit / delete only
    if (amount === null) {
      if (!(await ccConfirm('Delete this booking?', ccEscHtml(e.legacy.item || ''), 'Delete', true))) return;
      await ctlDeleteOneTime(e.legacy.id);
      window._src.abrPay = window._src.abrPay.filter(o => o.id !== e.legacy.id);
    } else {
      const d = await ctlUpdateOneTime(e.legacy.id, { amount: cxR(amount) });
      const i = window._src.abrPay.findIndex(o => o.id === e.legacy.id); if (i >= 0) window._src.abrPay[i] = d;
    }
    return;
  }
  const b = ctlAbrBooking(r), same = !!b && (Number(b.direction) === 1 ? 1 : -1) === r.dir;
  if (amount === null) {
    if (!same) return;                                                     // a booking of the other direction is not this payment
    await ctlDeleteOneTime(b.id);
    window._src.abrPay = window._src.abrPay.filter(o => o.id !== b.id);
    return;
  }
  if (b) {
    // Nov 2026 fix: settling again after the result changed direction (Nachzahlung ↔ Guthaben) turns its booking
    // around too — it kept the old direction, so the Dashboard counted the money the wrong way (as Settlements does now)
    const f = same ? { amount: cxR(amount) } : { amount: cxR(amount), direction: r.dir, item: r.label, invoice_date: _cxAbrPayDate(r, y, m) };
    const d = await ctlUpdateOneTime(b.id, f);
    const i = window._src.abrPay.findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
    return;
  }
  const d = await ctlAddOneTime({ property_id: r.pid, invoice_date: _cxAbrPayDate(r, y, m), item: r.label, amount: cxR(amount),
    kind: r.kind === 'weg_hausgeld' ? 'Hausgeldabrechnung' : 'NK-Abrechnung', direction: r.dir, source_ref: r.key });
  window._src.abrPay = (window._src.abrPay || []).concat([d]);
}

/* Handles every Abrechnungen action of a tab. Returns true when it was one. */
async function cxAbrClick(a, b, rerender) {
  if (a === 'take' && /^abr/.test(b.dataset.id || '')) {
    const e = _cxAbrIndex[b.dataset.id];
    if (e && !e.info && e.ist === null) { try { await _cxAbrBook(e, e.soll); } catch (err) { cxToastErr(err); } }
    rerender(); return true;
  }
  if (a === 'abrStorno') {                               // C1 #4: = Settlements' "Back to open" (see BACK TO OPEN above)
    const e = _cxAbrIndex[b.dataset.id];
    if (!e || !e.res || !e.res.manual || !e.res.db) return true;
    const bk = ctlAbrBooking(e.res), lines = ctlAbrSettleLines(e.res);
    const what = !bk ? '' : _stIsOwnBooking(bk) ? 'The booking of ' + cxFmtDate(bk.invoice_date) + ' (' + cxEur(bk.amount) + ') will be deleted too.'
      : 'Your own entry of ' + cxFmtDate(bk.invoice_date) + ' (' + cxEur(bk.amount) + ') stays in One-off – it is only unlinked.';
    if ((await ccDialog({ icon: 'ti-alert-triangle', tone: 'danger', title: 'Cancel this Abrechnung?', body: ccEscHtml(e.res.label) + (what ? '<br><br>' + ccEscHtml(what) : ''), actions: [{ label: 'Keep', value: false }, { label: 'Cancel Abrechnung', value: true, danger: true }] })) !== true) return true;
    try {
      await ctlAbrStorno(e.res);
      for (const r of lines) await ctlSettleOpen(r);
    } catch (err) { cxToastErr(err); }
    if (typeof ctlSettlementInvalidate === 'function') ctlSettlementInvalidate();
    rerender(); return true;
  }
  return false;
}
async function cxAbrInput(id, val, rerender) {
  if (!/^abr/.test(id)) return false;
  const e = _cxAbrIndex[id];
  if (e && !e.info) { try { await _cxAbrBook(e, val === null ? null : val); } catch (err) { cxToastErr(err); } }
  rerender();
  return true;
}

/* One line for the Income / Expenses summary card */
function _cxAbrNote(dir) {
  const y = window._ctrl.year, m = CX.month;
  let open = 0, openSum = 0, done = 0;
  // CP2: only the area shown (Rentals or Casa Castel), as the cards below it
  for (const p of window._ctrl.properties.filter(x => x.active && cxAreaOk(x) && ctlPropOwned(x, y, m))) for (const r of ctlAbrRows(p.id, y, m, dir)) {
    if (r.ja) { done += cxR(r.ja.amount); continue; }                    // Fix 3: Jahresabrechnung, already paid
    if (r.info) continue;
    if (r.ist === null) { open++; openSum += r.soll; } else done += r.ist;
  }
  if (!open && !done) return '';
  return 'Abrechnungen · ' + [open ? open + ' open (' + cxIO(dir * openSum, cxEur) + ')' : '', done ? 'done ' + cxIO(dir * done, cxEur) : ''].filter(Boolean).join(' · ');   // CP1: signed, green / red
}
