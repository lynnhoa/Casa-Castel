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
     · settled with the rent / Hausgeld or 0 € → once, as information
     · K1 (Nov 2026): settled with the part of the Kaution held back for the NK → like a transfer: open until
       Settlements books it, then ONE booking = the NK result as it happened (the kept part + what the tenant
       transferred − what you paid back, in the month the rest moved; its sign kept: less paid back than the
       Guthaben → a minus Ist on the Expenses row; a balanced result shows only when such a booking exists, where
       the money went). The Kaution itself never shows. Clearing its Ist sets the Settlements line back to sent
       (it waits again, never turns into information). An older one confirmed 'via Kaution' without a booking
       stays information, as it was.
       F1 (Nov 2026): its row says what the BANK shows, as Settlements' Money step: the Soll is the real transfer
       (result − the held part), the sub line names the held part ('300,00 € kept from the Kaution · Dan transfers
       150,00 €'), and the amount typed is that transfer — booked as the held part ± it (150 received → +450 · 350 paid
       back → −50 · 200 of 350 → +100 · balanced, 300 paid back → nothing). The totals count the booking.
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

/* Every result (all years), newest first · C5 (#33): built once per drawing (ctlMemo, controlling-data.js) */
function ctlAbrResults() { return typeof ctlMemo === 'function' ? ctlMemo('abr:res', _ctlAbrResults) : _ctlAbrResults(); }
function _ctlAbrResults() {
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

/* The booking of a result (any year) — #1 (Nov 2026): booked twice → the one in the result's direction */
const _cxAbrDir = o => (Number(o.direction) === 1 ? 1 : -1);
function ctlAbrBookings(res) {
  const pay = window._src.abrPay || [];
  if (typeof _ctlMemo === 'undefined' || !_ctlMemo) return pay.filter(o => res.refs.includes(o.source_ref));
  // C5 (#33): while a screen is drawn, an index source_ref → positions — the same rows in the same (list) order
  const ix = ctlMemo('abr:pay', () => ({ pay, at: new Map() }));
  if (ix.pay !== pay) return pay.filter(o => res.refs.includes(o.source_ref));
  if (!ix.at.size) pay.forEach((o, i) => { const k = o.source_ref; if (!ix.at.has(k)) ix.at.set(k, []); ix.at.get(k).push(i); });
  const pos = new Set();
  for (const r of res.refs) for (const i of (ix.at.get(r) || [])) pos.add(i);
  return [...pos].sort((a, b) => a - b).map(i => pay[i]);
}
function ctlAbrBooking(res) {
  const all = ctlAbrBookings(res);
  return all.find(o => _cxAbrDir(o) === res.dir) || all[0] || null;
}

/* ── ONE BOOKING PER RESULT (#1, Nov 2026) ──────────────────────────────────────────────────
   A double tap on the Soll wrote two lines for one result: Income / Expenses showed one, the Dashboard and the
   year export counted both. Now: one save per result at a time (_cxAbrRun), and CONTROLLING-C2.sql lets the
   database refuse a second line (unique index ctrl_ot_abr_once → error 23505). When another device or Settlements
   booked the result meanwhile, that booking is read back and taken as the payment — no message.
   Settlements uses ctlAbrAdd / ctlAbrExisting too (it loads this file). */
const ctlIsDupErr = e => /23505|duplicate key/i.test(String((e && e.code) || '') + ' ' + String((e && (e.message || e.details)) || e || ''));
function _ctlAbrKeep(d) {                                 // the booking → abrPay (and One-off's list when its year is loaded)
  window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== d.id).concat([d]);
  const ot = window._ctrl && window._ctrl.one_time;
  if (Array.isArray(ot) && Number(String(d.invoice_date || '').slice(0, 4)) === Number(window._ctrl.year) && !ot.some(o => o.id === d.id)) ot.push(d);
  return d;
}
/* The booking another device / Settlements made for this source_ref (read from the database) → kept, or null */
async function ctlAbrExisting(ref) {
  const { data, error } = await _ctlSupa.from('ctrl_expense_one_time').select('*').eq('source_ref', ref).in('kind', CX_ABR_KINDS).order('id', { ascending: true }).limit(1);
  if (error || !data || !data.length) return null;
  return _ctlAbrKeep(data[0]);
}
/* Book a result: a new line, or — the database says it is booked already (23505) — that booking */
async function ctlAbrAdd(f) {
  let d;
  try { d = await ctlAddOneTime(f); }
  catch (err) {
    if (!f.source_ref || !ctlIsDupErr(err)) throw err;
    d = await ctlAbrExisting(f.source_ref);
    if (!d) throw err;
    return d;
  }
  return _ctlAbrKeep(d);
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
function _stBLRaw(o) {
  let v = o && o.before_link;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : null;
}
/* C3 (Nov 2026): before_link holds either the type you gave an entry ({ kind, direction }, while it is linked) or — once
   it was unlinked from a result — only the marker { off: 'abr:<id>' }: the automatic WEG match leaves it unlinked from
   that result (_srFindBooking). A marker is no remembered type. */
function _stBL(o) {                                                   // remembered type → { kind, direction } or null
  const v = _stBLRaw(o);
  return v && !('off' in v) ? v : null;
}
const _stBLOff = o => { const v = _stBLRaw(o); return v && v.off ? String(v.off) : null; };   // the result it was unlinked from
/* Switching a payment off: a booking Settlements made is removed · an entry you typed yourself in
   Controlling (linked by #6 or the WEG match) is only unlinked — it stays in Controlling as you typed it.
   C1 #4: also a booking Controlling made for a result without its period ("NK 2025 · …", the label it writes
   then) counts as made by the apps · an entry that remembers your own type (before_link) is always yours. */
const ST_AUTO_ITEM = /^(NK|Hausgeld) (\d{2}\.\d{2}\.\d{4}|\d{4} · )/;
const _stIsOwnBooking = b => !_stBL(b) && ST_AUTO_ITEM.test(String((b && b.item) || ''));
async function _stUndoBooking(b) {
  const drop = () => { window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id); };   // only once saved: a failed delete / unlink keeps the row paid
  if (_stIsOwnBooking(b)) { await ctlDeleteOneTime(b.id); drop(); return 'deleted'; }
  const cur = (window._ctrl.one_time || []).find(x => x.id === b.id);
  const bl = _stBL(b) || _stBL(cur);                                  // #12: back to the type you gave it
  const f = { source_ref: null, kind: bl && bl.kind && !ST_ABR_KINDS.includes(bl.kind) ? bl.kind : 'Sonstiges',
              before_link: b.source_ref ? { off: b.source_ref } : null };   // C3: the WEG match does not link it back to this result
  if (bl && bl.kind && bl.direction !== undefined) f.direction = bl.direction;
  const d = await _stUpdOT(b.id, f); drop();
  const k = (window._ctrl.one_time || []).findIndex(x => x.id === b.id); if (k >= 0 && d) window._ctrl.one_time[k] = d;
  return 'unlinked';
}
const _stUndoText = (b, fmtDate, fmtEur) => !b ? '' : _stIsOwnBooking(b)
  ? 'The booking of ' + fmtDate(b.invoice_date) + ' (' + fmtEur(b.amount) + ') in Controlling is removed too.'
  : 'Your own entry of ' + fmtDate(b.invoice_date) + ' (' + fmtEur(b.amount) + ') stays in Controlling – it is only unlinked.';

/* ── YOUR OWN ENTRY IS THE PAYMENT — Settlements #6 and Controlling's Soll (C3, Nov 2026) ─────────────────────────
   Moved here from settlements-tab-tracking.js: Controlling uses them too. Clearing the Ist of a result paid by your
   own entry only unlinks it (x1) — a Soll tap or a typed amount afterwards links that entry again instead of booking
   the money a second time (_cxAbrBook). maint-link.js keeps Maintenance lines out of both finders (page end).
   CARD-2 (Nov 2026): a damage line kept from the Kaution (Tenants › Kaution, source_ref 'kau:…') is never your entry of
   a payment either — same amount ≠ same payment (it was linked as another tenant's NK payment and booked again). */
const _stIsKauLine = o => /^kau:/.test(String((o && o.source_ref) || ''));
/* #6 (Oct 2026): a tenant's NK payment you already typed by hand in Controlling › One-off
   (same property, same direction, same amount to the cent, on/after the letter date, not linked yet)
   is LINKED to the result instead of booking the money a second time. */
function _stFindManualNk(pid, res, amt) {
  const from = String(res.date || '').slice(0, 10);
  const linked = new Set((window._src.abrPay || []).map(o => o.id));
  return (window._ctrl.one_time || []).find(o =>
    Number(o.property_id) === Number(pid) && !linked.has(o.id) && !/^abr:/.test(String(o.source_ref || '')) && !_stIsKauLine(o) &&
    !['Versorger', 'Kaufnebenkosten', 'Hausgeldabrechnung'].includes(o.kind) && !o.nk_umlage &&
    (o.direction === undefined || o.direction === null || Number(o.direction) === Number(res.dir)) &&
    Math.abs(Math.abs(Number(o.amount) || 0) - amt) < 0.005 && (!from || String(o.invoice_date || '').slice(0, 10) >= from)) || null;
}
/* C3: the same for a WEG Hausgeld result, as the WEG match (same property, amount to the cent, same direction or none,
   on/after the result date, not linked yet) — never a Kaufnebenkosten line or a cost marked for the NK */
function _stFindOwnWeg(pid, res, amt) {
  const from = String(res.date || '').slice(0, 10);
  const linked = new Set((window._src.abrPay || []).map(o => o.id));
  return (window._ctrl.one_time || []).find(o =>
    Number(o.property_id) === Number(pid) && !linked.has(o.id) && !/^abr:/.test(String(o.source_ref || '')) && !_stIsKauLine(o) &&
    o.kind !== 'Kaufnebenkosten' && !o.nk_umlage &&
    (o.direction === undefined || o.direction === null || Number(o.direction) === Number(res.dir)) &&
    Math.abs(Math.abs(Number(o.amount) || 0) - amt) < 0.005 && (!from || String(o.invoice_date || '').slice(0, 10) >= from)) || null;
}
/* #12: the type (and direction) you gave an entry is remembered in before_link when it gets linked,
   and restored when it is unlinked. Without the before_link column (SQL not run) it works as before. */
function _stBeforeLink(o) {
  if (ST_ABR_KINDS.includes(o.kind)) return _stBL(o);                 // already an Abrechnung type: keep what was remembered
  return { kind: o.kind || null, direction: o.direction === undefined ? null : o.direction };
}
/* kind: 'NK-Abrechnung' (#6) · C3: 'Hausgeldabrechnung' for a WEG result linked from Controlling */
async function _stLinkManualNk(o, res, kind) {
  const f = { source_ref: 'abr:' + res.id, kind: kind || 'NK-Abrechnung', direction: res.dir, before_link: _stBeforeLink(o) };
  let d;
  try { d = await _stUpdOT(o.id, f); }
  catch (e) {                                  // #1 (CONTROLLING-C2.sql): booked meanwhile → that booking is the payment, your entry stays unlinked
    if (!ctlIsDupErr(e)) throw e;
    const x = await ctlAbrExisting(f.source_ref);
    if (!x) throw e;
    return x;
  }
  const row = d || Object.assign({}, o, f);
  window._src.abrPay = (window._src.abrPay || []).filter(x => x.id !== o.id).concat([row]);
  const k = (window._ctrl.one_time || []).findIndex(x => x.id === o.id); if (k >= 0) window._ctrl.one_time[k] = row;
  return row;
}
/* C3c (Nov 2026): the page holds the entries of ONE year (window._ctrl.one_time). Your entry of 20.12.2026, unlinked by
   clearing the Ist and booked again in January 2027, was not found there → the money was booked a second time. Not found
   in the year loaded → your entries of this property on/after the result date in the other years are read and the same
   rules apply (a Maintenance line or a linked entry is never taken). A failed read → none, the result is booked as before. */
const _stFindOwnIn = (pid, res, amt, weg) => weg ? _stFindOwnWeg(pid, res, amt) : _stFindManualNk(pid, res, amt);
async function _stFindOwnEntry(pid, res, amt, weg) {
  const ct = window._ctrl;
  const mine = _stFindOwnIn(pid, res, amt, weg);
  if (mine || !ct || !Array.isArray(ct.one_time)) return mine;
  const from = String(res.date || '').slice(0, 10);
  let more;
  try {
    const q = () => { const s = _ctlSupa.from('ctrl_expense_one_time').select('*').eq('property_id', pid); return from ? s.gte('invoice_date', from) : s; };
    let r = await q();
    if (r && !r.error && typeof ctlReadAll === 'function') r = await ctlReadAll(r, q, 'ctrl_expense_one_time (your entry)');   // past 1000 rows: in pages
    if (!r || r.error || !Array.isArray(r.data)) return null;
    const y = String(ct.year);                                        // the year loaded is searched above
    more = r.data.filter(o => String(o.invoice_date || '').slice(0, 4) !== y);
  } catch (e) { return null; }
  if (!more.length) return null;
  const keep = ct.one_time;
  ct.one_time = keep.concat(more);
  try { return _stFindOwnIn(pid, res, amt, weg); } finally { ct.one_time = keep; }
}
/* C3c: the link changed nothing — your entry was deleted on another device and this page still showed it (PGRST116:
   "JSON object requested, multiple (or no) rows returned") → it is gone here too, and → null: not linked */
const _stGoneErr = e => String((e && e.code) || '') === 'PGRST116' ||
  /multiple \(or no\) rows|contains 0 rows|^entry \S+ not found$/i.test(String((e && (e.message || e.details)) || ''));
async function _stLinkOwnEntry(o, res, kind) {
  try { return await _stLinkManualNk(o, res, kind); }
  catch (e) {
    if (!_stGoneErr(e)) throw e;
    if (window._ctrl && Array.isArray(window._ctrl.one_time)) window._ctrl.one_time = window._ctrl.one_time.filter(x => x.id !== o.id);
    return null;
  }
}
/* Your own entry of this amount is the payment (found as above, or `o` found already) → linked:
   { o: your entry, row: the linked line — or the booking made meanwhile (#1) } · null: none of yours → book the result */
async function _stTakeOwnEntry(pid, res, amt, weg, o) {
  for (let n = 0; n < 3; n++) {                                       // a gone entry is dropped → look once more
    if (n || !o) o = await _stFindOwnEntry(pid, res, amt, weg);
    if (!o) return null;
    const row = await _stLinkOwnEntry(o, res, weg ? 'Hausgeldabrechnung' : 'NK-Abrechnung');
    if (row) return { o, row };
  }
  return null;
}

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
  // C5 review: a reload that landed while the question was open has new rows — the result is cancelled there too
  for (const x of (window._src.abr || [])) if (x !== res.db && String(x.id) === String(res.db.id)) x.status = 'storniert';
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

/* Rows of one property card in a month, for one direction (+1 Income, −1 Expenses) · C5 (#33): once per drawing */
function ctlAbrRows(pid, y, m, dir) {
  return typeof ctlMemo === 'function' ? ctlMemo('abr:rows|' + pid + '|' + y + '|' + m + '|' + dir, () => _ctlAbrRows(pid, y, m, dir)) : _ctlAbrRows(pid, y, m, dir);
}
function _ctlAbrRows(pid, y, m, dir) {
  const rows = [], ym = y * 12 + m, t = cxToday(), cur = _cxYm(t);
  // K1: a balanced Kaution result shows only with a booking (less or more of the held part went back), where its money went
  const allRes = ctlAbrResults(), results = allRes.filter(r => r.pid === pid && (r.dir === dir || (!r.dir && _cxAbrKauIn(r, dir))));
  const usedRefs = new Set();
  for (const r of results) {
    // Nov 2026 fix: a booking in the OTHER direction is no payment of this result — the result was changed in
    // Settlements after it was paid (Nachzahlung → Guthaben). It counted as paid here and showed a second time,
    // as "without Abrechnung", on the other side. Now: the result is open, the booking stays where its money went (flagged).
    // K1: a Kaution result's booking is its payment in either direction (the kept part ± the transfer, its sign kept)
    const kau = r.via === 'kaution', rd = r.dir || dir, kh = kau ? _cxAbrKau(r) : null;   // F1: the held part and the bank transfer
    const b0 = ctlAbrBooking(r), b = b0 && (kau || (Number(b0.direction) === 1 ? 1 : -1) === r.dir) ? b0 : null;
    if (b0) usedRefs.add(b0.source_ref);
    const rym = _cxYm(r.date) || cur;
    // K1: a Kaution result counts like a transfer — an older one already confirmed without a booking stays information
    const kauOld = kau && !b0 && _cxAbrKauDone(r);
    if ((r.via !== 'zahlung' && !kau) || kauOld || (!r.amount && !(kau && b))) {   // information only
      if (rym === ym) rows.push({ id: 'abrI:' + r.key, res: r, info: true });
      continue;
    }
    // #1: booked twice (a double tap before Nov 2026) → the row says so and offers "delete one"
    const twice = b0 ? ctlAbrBookings(r).filter(o => o !== b0) : [];
    if (b) { if (_cxYm(b.invoice_date) === ym) rows.push({ id: 'abr:' + r.key, res: r, booking: b, soll: r.amount, ist: cxR(_cxAbrDir(b) === rd ? b.amount : -b.amount), twice, kau: kh }); continue; }
    const showIn = rym >= cur ? rym : cur;                                 // overdue → moves along to the current month
    if (showIn === ym) rows.push({ id: 'abr:' + r.key, res: r, soll: r.amount, ist: null, overdue: rym < cur ? rym : null, stale: b0 || null, twice, kau: kh });
  }
  // bookings without a result (older manual NK / Hausgeld entries) — shown in the month paid
  for (const o of (window._src.abrPay || [])) {
    if (Number(o.property_id) !== pid || usedRefs.has(o.source_ref) || _cxYm(o.invoice_date) !== ym) continue;
    if ((Number(o.direction) === 1 ? 1 : -1) !== dir) continue;
    if (results.some(r => r.refs.includes(o.source_ref))) continue;
    const moved = allRes.find(r => r.pid === pid && r.dir !== dir && r.refs.includes(o.source_ref)) || null;   // its result changed direction
    if (moved && moved.via === 'kaution') continue;                       // K1: a Kaution result's booking shows with its result
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
/* K1: confirmed in Settlements before (status erledigt / bezahlt / paid on) — or an older own NK with no tenant, which no
   Settlements line shows and nobody can confirm (a tenant's result without a stored line waits there, as in Settlements) */
function _cxAbrKauDone(r) {
  const lines = ctlAbrSettleLines(r);
  return lines.length ? lines.some(l => l.status === 'erledigt' || l.status === 'bezahlt' || !!l.paid_date) : !(r.db && r.db.tenant_id);
}
/* K1: a balanced Kaution result with a booking in this direction (less or more of the held part went back than held) */
function _cxAbrKauIn(r, dir) {
  if (r.via !== 'kaution') return false;
  const b = ctlAbrBooking(r);
  return !!b && _cxAbrDir(b) === dir;
}
/* F1 (K1): the part of the Kaution held back for this NK result, by Settlements' own rule (Casa Castel scEinbehalt ·
   Rentals _srEinbehalt): Tenants › Kaution › 'Kept · for NK-Abrechnung' of a settled Kaution, used by the tenant's first NK
   settled with it on/after the day the Kaution was settled · 0: nothing held (also when the Kaution data is not read) */
function ctlAbrHeld(r) {
  const d = r && r.db, S = window._src;
  if (!d || r.via !== 'kaution' || r.kind !== 'nk_tenant' || d.tenant_id === null || d.tenant_id === undefined) return 0;
  const casa = d.app ? d.app === 'casa' : Number(r.pid) === CASA_PROP_ID, tid = String(d.tenant_id);
  const d10 = v => String(v || '').slice(0, 10), day = casa && typeof ccDayOf === 'function' ? ccDayOf : d10;   // Casa: a stored moment → its day
  let k = null;
  for (const x of ((casa ? S.kauCasa : S.kauRnt) || [])) if (x && (casa ? x.tenant_id !== null && x.tenant_id !== undefined : !!x.tenant_id) && String(x.tenant_id) === tid) k = x;
  const E = k && k.settled ? cxR(Number(k.nk_einbehalt) || 0) : 0;
  if (!(E > 0)) return 0;
  const since = k.settled_at ? day(k.settled_at) : '', from = d10(d.period_from);
  const all = (S.abr || []).filter(a => a && a.kind === 'nk_tenant' && (!a.app || a.app === (casa ? 'casa' : 'rentals')) && a.status !== 'storniert' && String(a.tenant_id) === tid);
  const uses = a => a.settle_via === 'kaution' && (!since || day(a.result_date) >= since);
  if (casa) return !all.some(a => d10(a.period_from) !== from && uses(a)) && (!since || day(d10(d.result_date)) >= since) ? E : 0;
  const mine = all.find(a => d10(a.period_from) === from) || null;
  if (mine && !uses(mine)) return 0;
  const before = a => !mine || d10(a.result_date) < d10(mine.result_date) || (d10(a.result_date) === d10(mine.result_date) && String(a.id) < String(mine.id));
  return all.some(a => a !== mine && d10(a.period_from) !== from && uses(a) && before(a)) ? 0 : E;
}
/* … → { E: the held part, T: the bank transfer (result − E: > 0 the tenant transfers the rest · < 0 you pay back) } or null */
function _cxAbrKau(r) {
  const E = ctlAbrHeld(r);
  return E > 0 ? { E, T: cxR((r.dir || 0) * (r.amount || 0) - E) } : null;
}
/* … a transfer x (what the bank shows, ≥ 0) → the ONE booking, signed (+ income · − expense) = scKauB / _srKauB */
const _cxAbrKauB = (k, x) => cxR(k.E + (k.T < 0 ? -1 : 1) * Math.abs(Number(x) || 0));
/* F1: Controlling reads the Kaution tables with the other apps' data (controlling-soll.js) — on its own page only:
   Settlements reads them itself (SC.kaution · SR.kaution) */
if (typeof _CX_SRC !== 'undefined' && document.getElementById('ctlSubNav')) {
  for (const [k, t] of [['kauCasa', 'kaution'], ['kauRnt', 'rnt_kaution']]) {
    if (!_CX_SRC.some(x => x[0] === k)) _CX_SRC.push([k, t]);
    if (typeof _CX_LIVE !== 'undefined') _CX_LIVE.add(k);              // the Kaution card changes them while Controlling is away
  }
}
/* K1: the booking of a Kaution result is taken back (its Ist cleared): its Settlements line is sent again — it waits for the
   Money step, as after Settlements' own undo (was: the line stayed 'settled' and the result turned into a 0 € information row).
   Written BEFORE the booking goes: a failed write leaves both as they were. */
async function _cxAbrKauOpen(r) {
  for (const l of ctlAbrSettleLines(r)) {
    if (l._virtual || String(l.id).startsWith('v:') || !(l.status === 'erledigt' || l.status === 'bezahlt' || l.paid_date)) continue;
    const { data, error } = await _ctlSupa.from('ctrl_settlements').update({ status: 'verschickt', paid_date: null }).eq('id', l.id).select().single();
    if (error) throw error;
    const i = (window._src.settle || []).findIndex(x => x.id === l.id);
    if (i >= 0 && data) window._src.settle[i] = data;
  }
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
      : r.booking ? 'paid ' + cxFmtDate(r.booking.invoice_date)                        // #1: the payment kept (the extra ones: "booked twice" below)
      : (r.res.tenantTab ? 'from the tenant tab' : 'Abrechnung of ' + cxFmtDate(r.res.db.result_date)) +
        (r.stale ? ' · booked before as ' + flip(Number(r.stale.direction) === 1 ? 1 : -1) + ' ' + cxEur(r.stale.amount) + ' – settle it again in Settlements' : '');
    const dup = r.twice && r.twice.length ? ' · <b style="color:#B0661E;font-weight:600;white-space:nowrap">' + (r.twice.length === 1 ? 'booked twice' : 'booked ' + (r.twice.length + 1) + ' times') + '</b> · <button class="cx-link cx-link--a cx-link--in" data-cx="abrDup" data-id="' + cxEsc(r.id) + '">delete one</button>' : '';   // #1
    // F1: part of the Kaution held back → the row shows what the bank shows (the transfer T, its way: + to you · − from you),
    // as Settlements' Money step; the booking stays the NK result as it happened (the totals count it)
    const k = !r.legacy && r.kau, kw = k && k.T < 0 ? -1 : 1;
    const bank = k ? { soll: cxR(Math.abs(k.T)), ist: r.ist === null ? null : cxR(kw * ((r.res.dir || dir) * r.ist - k.E)) } : null;
    const who = k ? String((r.res.db && r.res.db.tenant_name) || '').trim().split(/\s+/)[0] || 'The tenant' : '';
    const kSub = k ? cxEur(k.E) + ' kept from the Kaution · ' + (k.T < -0.004 ? 'You pay back ' + cxEur(-k.T) : k.T > 0.004 ? who + ' transfers ' + cxEur(k.T) : 'nothing to transfer') : '';
    h += cxRow({ id: r.id, label, soll: bank ? bank.soll : r.soll, ist: bank ? bank.ist : r.ist, allowEmpty: true, dir: bank ? kw : dir,   // CP2: differences from your view (no "On purpose" here)
                 emptyText: bank && !bank.soll ? 'open' : undefined,     // F1: nothing to transfer — still to confirm (type 0)
                 pills: r.overdue ? cxPill('open', 'due since ' + mon(r.overdue)) : '',
                 sub: (k ? cxEsc(kSub) : cxIO(dir * r.soll, cxEur)) + ' · ' + cxEsc(sub) + dup + (r.res && r.res.manual ? ' · <button class="cx-link cx-link--a cx-link--in" data-cx="abrStorno" data-id="' + cxEsc(r.id) + '">cancel</button>' : '') });
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

async function _cxAbrBook(e, amount, y = window._ctrl.year, m = CX.month) {
  const r = e.res;
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
  // K1: a Kaution result's booking is its payment in either direction; the Ist is typed with the sign of the row (a balanced
  // result's row: the direction its booking went)
  const kau = r.via === 'kaution', rd = r.dir || e.dir;
  const b = ctlAbrBooking(r), same = !!b && (kau || (Number(b.direction) === 1 ? 1 : -1) === r.dir);
  if (kau && e.kau && amount !== null) {                                   // F1: the amount typed is what the bank shows →
    const B = _cxAbrKauB(e.kau, amount);                                   // the held part ± it, as Settlements' Money step books it
    if (!r.dir && Math.abs(B) < 0.005) { if (b) await _stUndoBooking(b); return; }   // balanced, all of the held part went back: nothing booked
    amount = cxR(rd * B);                                                  // in the row's direction (a minus amount: the other way)
  }
  if (amount === null) {
    if (!same) return;                                                     // a booking of the other direction is not this payment
    if (kau) { await _cxAbrKauOpen(r); if (typeof ctlSettlementInvalidate === 'function') ctlSettlementInvalidate(); }   // K1: the line waits again
    await _stUndoBooking(b);                                               // x1: as 'cancel' / Back to open — your own entry is only unlinked
    return;
  }
  if (kau && b && _cxAbrDir(b) !== rd) {                                   // K1: booked the other way round → in the row's direction
    const d = await ctlUpdateOneTime(b.id, { amount: cxR(amount), direction: rd });
    const i = window._src.abrPay.findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
    return;
  }
  // C3: your own entry of this amount (e.g. unlinked by clearing the Ist) is the payment → linked, not booked a second
  // time (NK: Settlements' #6 rule · WEG Hausgeld: the WEG match). Another amount → a new booking, as before.
  // C3c: also when your entry lies in another year · deleted meanwhile on another device → booked as usual
  const amt = cxR(amount), weg = r.kind === 'weg_hausgeld';
  const at = r.db && amt > 0 && r.dir ? { id: r.db.id, dir: r.dir, date: String(r.db.result_date || '').slice(0, 10) } : null;   // K1: never for a balanced result
  let mine = null;
  if (b) {
    // C3c: the apps' booking now gets the amount of your own unlinked entry (a typo corrected) → that booking goes and
    // your entry is the payment again (it counted twice: the corrected booking and your entry)
    if (same && at && _stIsOwnBooking(b) && (mine = await _stFindOwnEntry(r.pid, at, amt, weg))) {
      await ctlDeleteOneTime(b.id);
      window._src.abrPay = window._src.abrPay.filter(o => o.id !== b.id);
    } else {
      // Nov 2026 fix: settling again after the result changed direction (Nachzahlung ↔ Guthaben) turns its booking
      // around too — it kept the old direction, so the Dashboard counted the money the wrong way (as Settlements does now)
      const f = same ? { amount: cxR(amount) } : { amount: cxR(amount), direction: r.dir, item: r.label, invoice_date: _cxAbrPayDate(r, y, m) };
      const d = await ctlUpdateOneTime(b.id, f);
      const i = window._src.abrPay.findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
      return;
    }
  }
  if (at && await _stTakeOwnEntry(r.pid, at, amt, weg, mine)) return;     // booked meanwhile (23505) → that booking
  await ctlAbrAdd({ property_id: r.pid, invoice_date: _cxAbrPayDate(r, y, m), item: r.label, amount: cxR(amount),   // #1: booked meanwhile → that booking
    kind: r.kind === 'weg_hausgeld' ? 'Hausgeldabrechnung' : 'NK-Abrechnung', direction: r.dir || rd, source_ref: r.key });   // F1: a balanced one: the row's way
}

/* #1 · one save per result at a time: a 2nd tap (or Enter, then a tap) waits for the first save and then finds its
   booking — a tap books nothing more, a typed amount changes that booking. The month is the one you tapped in. */
const _cxAbrQ = {};
async function _cxAbrRun(e, amount, take) {
  const k = e.legacy ? 'L:' + e.legacy.id : e.res.key, y = window._ctrl.year, m = CX.month;
  const job = (_cxAbrQ[k] || Promise.resolve()).then(() => {
    if (take && !e.legacy) { const bk = ctlAbrBooking(e.res); if (bk && _cxAbrDir(bk) === e.res.dir) return; }   // booked meanwhile
    return _cxAbrBook(e, amount, y, m);
  });
  const tail = _cxAbrQ[k] = job.catch(() => {});
  try { await job; } finally { if (_cxAbrQ[k] === tail) delete _cxAbrQ[k]; }
}

/* Handles every Abrechnungen action of a tab. Returns true when it was one. */
async function cxAbrClick(a, b, rerender) {
  if (a === 'take' && /^abr/.test(b.dataset.id || '')) {
    const e = _cxAbrIndex[b.dataset.id];
    // C6: a save of this result still on its way (the Ist just cleared): the row drawn is not its state yet — the tap waits
    // in the queue and _cxAbrRun decides once that save has landed (the tap was dropped)
    const busy = !!e && !e.legacy && !!e.res && !!_cxAbrQ[e.res.key];
    if (e && !e.info && (e.ist === null || busy)) { b.disabled = true; try { await _cxAbrRun(e, e.kau ? Math.abs(e.kau.T) : e.soll, true); } catch (err) { cxToastErr(err); } }   // F1: the transfer
    rerender(); return true;
  }
  if (a === 'abrDup') {                                  // #1: booked twice → one goes; an entry you typed yourself is never deleted (only unlinked)
    const e = _cxAbrIndex[b.dataset.id];
    const all = e && e.res ? ctlAbrBookings(e.res) : [];
    if (all.length < 2) { rerender(); return true; }
    // keep the payment in the result's direction (your own entry first, else the oldest); of the rest, the newest the apps made goes
    const own = o => !_stIsOwnBooking(o), num = o => Number(o.id) || 0, byId = (p, q) => num(p) - num(q) || String(p.id).localeCompare(String(q.id));
    const keep = all.slice().sort((p, q) => (_cxAbrDir(q) === e.res.dir) - (_cxAbrDir(p) === e.res.dir) || own(q) - own(p) || byId(p, q))[0];
    const x = all.filter(o => o !== keep).sort((p, q) => own(p) - own(q) || byId(q, p))[0];
    const del = _stIsOwnBooking(x);
    const body = ccEscHtml(e.res.label) + '<br>' + ccEscHtml(cxFmtDate(x.invoice_date) + ' · ' + cxEur(x.amount)) +
      (del ? '' : '<br><br>' + ccEscHtml('Your own entry stays in One-off – it is only unlinked.'));
    if (!(await ccConfirm(del ? 'Delete one booking?' : 'Unlink one booking?', body, del ? 'Delete' : 'Unlink', true))) return true;
    b.disabled = true;
    try { await _stUndoBooking(x); } catch (err) { cxToastErr(err); }
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
  if (e && !e.info) { try { await _cxAbrRun(e, val === null ? null : val, false); } catch (err) { cxToastErr(err); } }   // #1: after a save on its way
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

/* C5 (#31): booking, cancelling and reopening an Abrechnung count as saves on their way (controlling-data.js ctlWriting) */
if (typeof ctlWriting === 'function') {
  ctlAbrAdd = ctlWriting(ctlAbrAdd); _cxAbrRun = ctlWriting(_cxAbrRun); ctlAbrStorno = ctlWriting(ctlAbrStorno); ctlSettleOpen = ctlWriting(ctlSettleOpen);
}
