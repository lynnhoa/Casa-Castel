/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — CASA CASTEL TAB (NK-Abrechnung der Zimmer)
   settlements-tab-casa.js

   One year at a time (‹ NK 2025 ›):
     overview      progress ring · you pay back / you get · next step
     house costs   from Controlling (nk-casa-engine.js): running costs, Hausgeld,
                   NK one-offs → Who pays → check → "Lock costs" (snapshot:
                   letters never change when Controlling is edited later)
     tenants       grouped: To send · Waiting for money · Done · No NK (Pauschal)
     tenant sheet  result first · split · prepayments · Send to · steps
                   Check → Send letter → Settle · PDF · Mark as sent
     Start         the letters one after another
     archive       every letter marked as sent is stored (storage "nk-letters",
                   table nk_letters) and listed under "Letters" — the history

   Versorger-Jahresabrechnungen (Nov 2026): each bill counts by its own Abrechnungszeitraum,
   split by days into the NK years (NkCasa.jaShares). The usual Abrechnungsjahr per supplier is
   set in Providers › Utilities (ctrl_castel_categories.abr_hist) — it suggests each bill's
   Zeitraum and says when a missing bill should come. Locking waits until every day of the
   NK year is covered by a bill (or marked "no bill").

   Results go the same way as in Rentals: ctrl_settlements + abr_results →
   Controlling › Casa Castel › Income / Expenses › Abrechnungen.
   Own data: nk_abrechnung_casa (one row per year).
   ───────────────────────────────────────────────────────────── */

'use strict';

const SC = {
  year: null, rows: [], letters: [], loaded: false, loading: false,
  missing: false, lettersMissing: false, data: {}, model: null,
  modal: null,            // { view: 'costs' | 'ten' | 'settle', key, flow: [keys], i, choice }
  open: {}, saveTimer: null,
  filter: 'all',          // rooms: all · open (to do) · done
};
const SC_TABLE = 'nk_abrechnung_casa', SC_LETTERS = 'nk_letters', SC_BUCKET = 'nk-letters';
const SC_AV = [['#E8D5B5', '#6B4A1E'], ['#D6E3D0', '#3E5A30'], ['#E3D6E6', '#5E3F66'], ['#D3DEE8', '#2F4A63'],
               ['#F0D9D2', '#7A3B2A'], ['#F3E3C3', '#7A5A12'], ['#D4E6E1', '#2C5A50'], ['#E2E0D8', '#5A574E']];

const scD = iso => typeof ccDayOf === 'function' ? ccDayOf(iso) : String(iso || '').slice(0, 10);   // #8: a stored moment → its German day
const scDate = iso => stDate(scD(iso));
const scE = v => stEur(cxR(v));
const scAbbr = room => ({ 'new york': 'NY', 'los angeles': 'LA' })[String(room || '').trim().toLowerCase()] || String(room || '?').trim().slice(0, 3).toUpperCase();
const scFirst = name => String(name || '').split(' ')[0] || name;
function scAv(room) {
  const rooms = (window._src.rooms || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const i = Math.max(0, rooms.findIndex(r => String(r.name).trim().toLowerCase() === String(room || '').trim().toLowerCase()));
  return SC_AV[i % SC_AV.length];
}

/* ── Data ─────────────────────────────────────────────────── */
async function _scLoadRowsNow() {
  SC.loading = true;
  try {
    const r = await _ctlSupa.from(SC_TABLE).select('*').order('year');
    if (r.error) { SC.missing = true; SC.rows = []; } else { SC.missing = false; SC.rows = r.data || []; }
    const l = await _ctlSupa.from(SC_LETTERS).select('*').order('sent_at', { ascending: false });
    if (l.error) { SC.lettersMissing = true; SC.letters = []; } else { SC.lettersMissing = false; SC.letters = l.data || []; }
    try {                                                  // B20: Kaution kept for the NK (Casa Castel › Tenants)
      const k = await _ctlSupa.from('kaution').select('*');
      SC.kaution = {}; (k.data || []).forEach(x => { if (x.tenant_id != null) SC.kaution[String(x.tenant_id)] = x; });
    } catch (e) { SC.kaution = {}; }
    try {                                                  // Nov 2026: every Casa Versorger-Jahresabrechnung in Controlling (all years) — split by its Zeitraum
      const j = await _ctlSupa.from('ctrl_expense_one_time').select('*').eq('property_id', CASA_PROP_ID).or('kind.eq.Versorger,item.ilike.*jahresabrechnung*');
      SC.jaBk = j.error ? null : (j.data || []);
    } catch (e) { SC.jaBk = null; }
  } finally { SC.loaded = true; SC.loading = false; }
}
/* The Casa Castel period that ends in year y — from "beginnt am" in Controlling › Setup */
function scPeriod(y) {
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID) || {};
  return ctlPeriodEndingIn(p, Number(y));
}
/* B18: one load at a time — a second caller waits for the running one (never stuck on "Loading …") */
function scLoadRows() { return SC._rowsP || (SC._rowsP = _scLoadRowsNow().finally(() => { SC._rowsP = null; })); }
function scLoadYear(y) {
  if (SC.data[y]) return Promise.resolve(SC.data[y]);
  const k = String(y); SC._yearP = SC._yearP || {};
  return SC._yearP[k] || (SC._yearP[k] = _scLoadYearNow(y).finally(() => { delete SC._yearP[k]; }));
}
async function _scLoadYearNow(y) {
  if (SC.data[y]) return SC.data[y];
  return (SC.data[y] = await _scFetchYear(y));
}
/* D39: the app is back in front → every loaded year is fetched again; each old copy stays until its fresh one is in
   (an open pop-up keeps its numbers, nothing shows "Loading"). A year that fails keeps its old copy, and a Teil B that
   fails this time keeps the one already loaded. */
async function scReloadYears() {
  SC._jaLd = {};
  await Promise.all(Object.keys(SC.data).map(async y => {
    let d; try { d = await _scFetchYear(Number(y)); } catch (e) { return; }
    const old = SC.data[y];
    if (d.mt && d.mt.error && old && 'mt' in old && !(old.mt && old.mt.error)) d.mt = old.mt;
    SC.data[y] = d;
  }));
}
async function _scFetchYear(y) {
  const per = scPeriod(y), y0 = Number(per.from.slice(0, 4)), y1 = Number(per.to.slice(0, 4));
  const [c, o, mt] = await Promise.all([
    _ctlSupa.from('ctrl_expense_castel').select('*').gte('year', y0).lte('year', y1),
    _ctlSupa.from('ctrl_expense_one_time').select('*').eq('property_id', CASA_PROP_ID).gte('invoice_date', per.from).lte('invoice_date', per.to),
    scLoadTeilB(per),                                        // D39: Teil B from Maintenance (null = none, never an error)
    typeof stLoadReturns === 'function' ? stLoadReturns() : null,   // Nov 2026: the returns map, never older than these one-offs
  ]);
  if (c.error) throw c.error;
  if (o.error) throw o.error;
  return { castel_expenses: c.data || [], one_time: o.data || [], per, mt };
}
/* Nov 2026 (D39) · Teil B: the Casa receipts that Maintenance › "Who pays?" gives to the tenants
   (Kleinreparatur · Schaden) with the returns that lower them, and their entries (title).
   Only receipts carry pay_* (returns inherit) · fail-soft: MAINTENANCE-D39.sql not run yet (no pay_* columns) or
   no Maintenance tables → null = no Teil B, the year loads as before. Any other error (network, timeout …) →
   { error } = Teil B unknown: a warning, and the year is not locked without it (scLock loads it again). */
const scTbMissing = e => !!e && (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(String(e.code || ''))
  || /(pay_(type|where|rooms|via|paid_on)|maint_c(osts|ases)).*(does not exist|schema cache)|(does not exist|could not find).*(pay_|maint_c)/i.test(String(e.message || '')));
async function scLoadTeilB(per) {
  const fail = e => scTbMissing(e) ? null : { error: true, message: String((e && e.message) || e || 'error') };
  try {
    const cols = 'id,case_id,amount,cost_date,return_of,description,receipt_no,pay_type,pay_where,pay_rooms,pay_via,pay_paid_on';
    const r = await _ctlSupa.from('maint_costs').select(cols).in('pay_type', ['klein', 'schaden']).gte('cost_date', per.from).lte('cost_date', per.to);
    if (r.error) return fail(r.error);
    const rec = (r.data || []).filter(x => !x.return_of);
    if (!rec.length) return { cases: [], costs: [] };
    const [ret, cs] = await Promise.all([
      _ctlSupa.from('maint_costs').select('id,amount,return_of').in('return_of', rec.map(x => x.id)),            // returns of any date lower the NET
      _ctlSupa.from('maint_cases').select('id,title,kind,property_id').in('id', [...new Set(rec.map(x => x.case_id))]),
    ]);
    if (ret.error || cs.error) return fail(ret.error || cs.error);
    const cases = (cs.data || []).filter(x => Number(x.property_id) === CASA_PROP_ID);   // Casa Castel only
    return { cases, costs: rec.concat((ret.data || []).filter(x => x.return_of)) };
  } catch (e) { return fail(e); }
}
const scRec = y => SC.rows.find(r => Number(r.year) === Number(y)) || null;
function scRecEnsure(y) {
  let r = scRec(y);
  if (!r) { const per = scPeriod(y); r = { year: y, period_from: per.from, period_to: per.to, locked_at: null, snapshot: null, tenants: {} }; SC.rows.push(r); }
  r.tenants = r.tenants || {};
  return r;
}
/* C6: one save of the record at a time — two on their way at once could land in the wrong order (the older one stayed
   in the database). A save asked for meanwhile waits and sends what is there when it starts */
function scSaveRec(r) {
  const p = Promise.resolve(SC._saveP).catch(() => {}).then(() => _scSaveRecNow(r));
  SC._saveP = p; return p;
}
async function _scSaveRecNow(r) {
  const payload = { year: r.year, period_from: r.period_from, period_to: r.period_to, locked_at: r.locked_at || null,
                    snapshot: r.snapshot || null, tenants: r.tenants || {}, updated_at: new Date().toISOString() };
  const { data, error } = await _ctlSupa.from(SC_TABLE).upsert(payload, { onConflict: 'year' }).select().single();
  if (error) throw error;
  const local = r.tenants;                                 // Oct 2026: what was typed meanwhile stays (the next save sends it)
  Object.assign(r, data);
  if (local) r.tenants = local;
  return r;
}
function scQueueSave(r) {
  clearTimeout(SC.saveTimer);
  SC.saveTimer = setTimeout(() => scSaveRec(r).catch(e => stSay(SC.missing ? 'Please run the Casa Castel settlements SQL first' : 'Saving failed — ' + (e.message || e))), 600);
}
function scSet(key) { const r = scRecEnsure(SC.year); return (r.tenants[key] = r.tenants[key] || {}); }

/* ── Input of one year ────────────────────────────────────────
   Controlling (costs, NK paid) + what you typed here for years before the app:
     __pos    typed house positions   { id, label, amount, key: personen|flaeche, spread: year|from, date }
     __extra  tenants not in the app  { id, name, room, from, to, nk (per month), addr }
   NK paid per month: Controlling income where booked, else the contract NK (rent history / tenant record). */
const SC_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function scContractNk(t, ym, day) {
  if (t.extra) return Number(t.contractNk) || 0;
  if (t._exp && typeof ctlNkSollAt === 'function') { const v = ctlNkSollAt(t._exp, day || (ym + '-15')); if (v !== null) return v; }
  const rp = (window._src.rentP || []).filter(r => r.app === 'casa' && String(r.tenant_id) === String(t.tenantId) && String(r.valid_from || '').slice(0, 7) <= ym)
    .sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];
  if (rp && typeof ccRpAmount === 'function') { const a = ccRpAmount(rp); if (a && a.mode !== 'pauschal') return Number(a.nk) || 0; }
  const tr = (window._src.casaTen || []).find(x => String(x.id) === String(t.tenantId));
  return Number(tr && tr.nebenkosten) || 0;
}
/* Pauschal tenants: the NK part inside the Pauschale (rent history "davon NK", per month) */
function scPauschalNk(input) {
  const P = input.period || {};
  for (const t of (input.tenancies || [])) {
    if (t.mode !== 'pauschal' || t.extra) continue;
    const rp = (window._src.rentP || []).filter(r => r.app === 'casa' && String(r.tenant_id) === String(t.tenantId) && String(r.valid_from || '') <= String(P.to || '9999'))
      .sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];
    t.pnk = rp && rp.mode === 'pauschal' ? Number(rp.nebenkosten) || 0 : 0;
  }
}
function scVzMonths(input, y) {
  const T = input.tenancies, inc = window._src.incAll || [];
  // D39 (bug 28): a running year is live even without a preview cutoff (its first month) — a month not booked
  // yet counts as 0 € ("open"), never as the contract NK of months still to come
  const P = input.fullPeriod || input.period || {}, live = !!input.preview || String(P.to || '') >= cxToday();
  for (const t of T) { t.vzMap = {}; t.vzAuto = 0; t.vzContract = 0; }
  for (const ym of (input.months || [])) {
    const yy = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), dim = new Date(yy, m, 0).getDate();
    const mFrom = ym + '-01', mTo = ym + '-' + String(dim).padStart(2, '0');
    const groups = {}, pausch = {};
    for (const t of T) {
      const a = t.from > mFrom ? t.from : mFrom, b = t.to < mTo ? t.to : mTo; if (a > b) continue;
      const days = NkCasa.daysBetween(a, b);
      if (t.mode !== 'nk') {                                   // Nov 2026: a Pauschal stay's "davon NK" is booked in the same room-month —
        if (t.unitId !== null && t.unitId !== undefined && Number(t.pnk) > 0) pausch[String(t.unitId)] = (pausch[String(t.unitId)] || 0) + Number(t.pnk) * days / dim;
        continue;                                              // … it is not NK the Kalt + NK tenant paid (e.g. Dhruv → Yuika, LA)
      }
      const g = t.unitId === null || t.unitId === undefined ? 'solo:' + t.key : t.unitId;
      (groups[g] = groups[g] || []).push({ t, days, a });
    }
    for (const g of Object.keys(groups)) {
      const list = groups[g], row = g.startsWith('solo:') ? null : inc.find(r => String(r.unit_id) === String(g) && Number(r.year) === yy && Number(r.month) === m);
      const sumDays = list.reduce((a, x) => a + x.days, 0);
      const nkRow = row ? Math.max(0, (Number(row.nebenkosten) || 0) - (pausch[String(g)] || 0)) : 0;
      for (const x of list) {
        // Nov 2026 · real only in the running year: not booked yet = 0 € ("open") · finished years: the contract, flagged as a to-do
        const amt = row ? nkRow * x.days / sumDays : live ? 0 : scContractNk(x.t, ym, x.a) * x.days / dim;
        x.t.vzMap[ym] = { amt: cxR(amt), src: row ? 'paid' : live ? 'open' : 'contract' };
        x.t.vzAuto += cxR(amt); if (!row && !live) x.t.vzContract++;   // D39 (bug 34): the total = the sum of the months shown
      }
    }
  }
  for (const t of T) { t.vzAuto = cxR(t.vzAuto); t.vz = t.vzAuto; t.vzMissing = []; }
}
/* Nov 2026 · real-only preview: the latest month (of this period, up to now) in which EVERY Kalt + NK tenant
   living there has the rent booked for that month (Controlling › Income) → 'YYYY-MM' · early payers alone don't move it */
function scLastFullNkMonth(per, today, tenancies) {
  const units = typeof ctlUnitsOf === 'function' ? ctlUnitsOf(CASA_PROP_ID) : [], inc = window._src.incAll || [];
  const unitOf = name => (units.find(u => scNorm(u.name) === scNorm(name)) || {}).id;
  const nk = (tenancies || []).filter(e => Number(e.property_id) === CASA_PROP_ID && e.kind === 'nk_tenant' && e.tenant_id && e.note !== 'Pauschal');
  const top = today.slice(0, 7), lo = per.from.slice(0, 7), hi = per.to.slice(0, 7) < top ? per.to.slice(0, 7) : top;
  for (let ym = hi; ym >= lo; ) {
    const yy = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), mFrom = ym + '-01', mTo = scLastOfMonth(yy, m);
    const here = nk.filter(e => String(e.period_from || '').slice(0, 10) <= mTo && String(e.period_to || '9999-12-31').slice(0, 10) >= mFrom);
    const paid = e => { const u = unitOf(e.unit_name); return u !== undefined && inc.some(r => String(r.unit_id) === String(u) && Number(r.year) === yy && Number(r.month) === m); };
    if (here.length && here.every(paid)) return ym;
    ym = m === 1 ? (yy - 1) + '-12' : yy + '-' + String(m - 1).padStart(2, '0');
  }
  return null;
}
/* Nov 2026: the latest month (of this period, up to now) with NK booked for a Casa room → 'YYYY-MM' */
function scLastNkMonth(per, today) {
  const units = new Set((typeof ctlUnitsOf === 'function' ? ctlUnitsOf(CASA_PROP_ID) : []).map(u => String(u.id)));
  const top = today.slice(0, 7), lo = per.from.slice(0, 7), hi = per.to.slice(0, 7) < top ? per.to.slice(0, 7) : top;
  let best = null;
  for (const r of (window._src.incAll || [])) {
    if (!units.has(String(r.unit_id)) || !(Number(r.nebenkosten) > 0)) continue;
    const ym = r.year + '-' + String(r.month).padStart(2, '0');
    if (ym >= lo && ym <= hi && (!best || ym > best)) best = ym;
  }
  return best;
}
function scInputFor(y) {
  const d = SC.data[y], per0 = d.per || scPeriod(y);
  const casa = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID);
  const tenancies = casa && typeof ctlTenanciesFor === 'function' ? ctlTenanciesFor(casa, per0, false) : null;
  // running year (Nov 2026 · real only): as if the year ended on the preview date — only what is booked as paid
  // counts (costs, NK-Vorauszahlungen), nothing planned or taken from a contract. The preview runs to the end of
  // the last completed month, or further to the end of the latest month in which every Kalt + NK tenant's rent is
  // booked (e.g. November once all November rents are in) — a few early payers don't move it.
  const today = cxToday(), lastDone = NkCasa.addDays(today.slice(0, 7) + '-01', -1);
  let cutoff = per0.to >= today && lastDone >= per0.from ? lastDone : null;
  const planMonth = null;
  if (per0.to >= today) {
    const nkM = scLastFullNkMonth(per0, today, tenancies);
    if (nkM) {
      let end = scLastOfMonth(Number(nkM.slice(0, 4)), Number(nkM.slice(5, 7))); if (end > per0.to) end = per0.to;
      if (!cutoff || end > cutoff) cutoff = end;
    }
  }
  const ja = typeof NkCasa.jaShares === 'function' ? scJaLinesFor(y, per0, cutoff) : undefined;   // Nov 2026: by their Abrechnungszeitraum
  // D39 (bugs 24 + 25): a booking a Jahresabrechnung here owns counts only through that bill (by its Zeitraum),
  // whatever its kind (a Maintenance line is set back to 'Rechnung' on every re-book) — and the engine skips only
  // the bookings scJaAll really handles; any other "Jahresabrechnung" (no Strom / Gas / Wasser / Entsorgung) counts by its day
  const ownBk = ja ? scJaOwnerYears() : {};
  // D39: a Kleinreparatur / Schaden receipt (and its returns) is Teil B — never also a house cost, even if its
  // Controlling line still says "in the NK" (MAINTENANCE-D39.sql books it with nk_umlage false; this only guards)
  const tbIds = new Set(((d.mt && d.mt.costs) || []).map(x => String(x.id)));
  const tbDup = (d.one_time || []).filter(o => o.nk_umlage && o.maint_cost_id && tbIds.has(String(o.maint_cost_id)));
  // Nov 2026 · a Maintenance return is never a house-cost line of its own: its receipt counts at the net price
  // (receipt − its counted returns, settlements-returns.js) — so the letter's Belegliste never shows a return
  const oneTime0 = (d.one_time || []).filter(o => ownBk[String(o.id)] === undefined && !tbDup.includes(o));
  const retZero = [];
  const oneTime = typeof stRetNetLines === 'function' ? stRetNetLines(oneTime0, retZero) : oneTime0;
  const jaOwn = ja ? new Set(scJaAll().filter(b => String(b.id).indexOf('ot:') === 0).map(b => String(b.id).slice(3))) : undefined;
  const input = NkCasa.fromControlling(y, { castel_expenses: d.castel_expenses, one_time: oneTime, income: window._src.incAll || [], period: per0, tenancies, cutoff, ja, jaOwn, planMonth });
  if (input.error) return input;
  const ts = (scRec(y) || {}).tenants || {};
  // Hausgeld (Versorger Jahresabrechnungen "shown in Settlements"): each one counts unless switched off here
  const hgOff = ts.__hgOff || {};
  input.hgAll = input.lines.filter(l => l.group === 'hausgeld').map(l => ({ id: l.id, label: l.label, info: l.info || {}, on: !hgOff[l.id], catId: l.catId ?? null }));
  input.lines = input.lines.filter(l => !(l.group === 'hausgeld' && hgOff[l.id]));
  for (const p of (ts.__pos || [])) {
    const amt = Number(p.amount) || 0; if (!amt) continue;
    const from = p.spread === 'from' && p.date;
    if (from && input.preview && p.date > input.preview.cutoff) continue;          // preview: not due yet
    const fullTo = (input.fullPeriod || input.period).to;
    const k = !input.preview ? 1 : from ? NkCasa.daysBetween(p.date, input.preview.cutoff) / NkCasa.daysBetween(p.date, fullTo) : input.preview.share;
    input.lines.push({ id: 'typed:' + p.id, label: p.label || 'Position', group: 'typed', key: 'personen',
                       parts: [from ? { amount: cxR(amt * k), spread: 'from', date: p.date } : { amount: cxR(amt * k), spread: 'year' }],
                       info: from ? { date: p.date, company: '', item: p.label || '', amount: amt } : null });
  }
  const per = input.period, units = typeof ctlUnitsOf === 'function' ? ctlUnitsOf(CASA_PROP_ID) : [];
  for (const x of (ts.__extra || [])) {
    if (!x.from) continue;
    const from = x.from > per.from ? x.from : per.from, to = (x.to || per.to) < per.to ? (x.to || per.to) : per.to;
    if (from > to) continue;
    const room = (window._src.rooms || []).find(r => scNorm(r.name) === scNorm(x.room));
    input.tenancies.push({ key: 'x:' + x.id, tenantId: 'x:' + x.id, extra: true, name: x.name || 'Tenant', room: x.room || '', m2: room ? Number(room.flaeche_m2) || 0 : 0,
                           from, to, mode: 'nk', unitId: (units.find(u => scNorm(u.name) === scNorm(x.room)) || {}).id ?? null, contractNk: Number(x.nk) || 0, addr: x.addr || '' });
  }
  // Nov 2026 · a receipt returned in full counts nowhere — kept here for your screen only (its returns and switches)
  input.retZero = retZero.filter(o => Number(o.property_id) === CASA_PROP_ID && o.nk_umlage && scD(o.invoice_date) >= per0.from && scD(o.invoice_date) <= per0.to)
    .map(o => ({ ot: o.id, mc: o.maint_cost_id, label: o.item || 'Rechnung', date: scD(o.invoice_date), gross: cxR(Math.abs(Number(o.amount) || 0)) }));
  scPauschalNk(input);                                     // first: the "davon NK" of Pauschal stays (scVzMonths keeps it apart)
  scVzMonths(input, y);
  input.warn = (input.warn || []).filter(w => !/NK paid missing/.test(w));
  for (const o of tbDup) input.warn.push((o.item || 'Maintenance receipt') + ' is Teil B in Maintenance (Who pays) – left out of the house costs');
  // D39 · Teil B (Kleinreparaturen · Schäden from Maintenance) — kept apart from the house costs (never a line, never
  // pooled); the positions go into the snapshot with the rest of the input when the costs are locked
  const tb = scTeilBPos(d, input);
  if (d.mt && d.mt.error) input.warn.push('Teil B could not be loaded from Maintenance – reload the page before locking');
  if (typeof ST_RET !== 'undefined' && ST_RET.error) input.warn.push(stRetFailTxt + ' before locking');
  if (tb) {
    input.teilB = tb.pos; input.teilBSkip = tb.skip; input.teilBLater = tb.later; input.teilBZero = tb.zero;
    if (tb.pos.length) for (const t of input.tenancies) {   // § 7 cap: the yearly rent — frozen with the snapshot
      // Nov 2026 (#16): the rent owed in this tenancy's part of the period (rent history + Mieterhöhungen, as in
      // Controlling) as a monthly average × 12 — a rise inside the year counts only for its months (each day weighs
      // 1 / days of its month); a running year only up to the preview date. The tenant record's Kaltmiete only when
      // Controlling has no line for it.
      const tr = t.extra ? null : (window._src.casaTen || []).find(x => String(x.id) === String(t.tenantId));
      const P = input.period || {};
      const a = [t.from, P.from].filter(Boolean).sort().pop(), z = [t.to, P.to].filter(Boolean).sort()[0];
      let owed = 0, months = 0;
      if (!t.extra && t._exp && a && z && a <= z && typeof ctlKaltSollAt === 'function') {
        for (let dd = a; dd <= z; dd = NkCasa.addDays(dd, 1)) {
          const v = ctlKaltSollAt(t._exp, dd); if (v === null) { months = 0; break; }
          const dim = new Date(Number(dd.slice(0, 4)), Number(dd.slice(5, 7)), 0).getDate();
          owed += (Number(v) || 0) / dim; months += 1 / dim;
        }
      }
      const k = months > 0 && owed > 0 ? owed / months : (tr ? Number(tr.kaltmiete) || 0 : 0);
      if (k > 0) t.rent12 = cxR(k * 12);
    }
  }
  return input;
}
/* D39 · Teil B positions of one NK year: Casa receipts with pay_type klein (B1) / schaden (B2), paid "With
   NK-Abrechnung" (pay_via null = nk; Direct is settled outside — not in Teil B), dated inside the period (in a preview:
   up to the preview date), NET = receipt − its returns (never below 0) > 0. A Kleinreparatur over 150 € (NET) is
   not a Kleinreparatur (Mietvertrag § 7) → listed as a warning (skip), not billed. Label = receipt text || entry title.
   → { pos, skip, later } · null when there is no Maintenance data (D39 not run, load failed) */
function scTeilBPos(d, input) {
  const mt = d && d.mt; if (!mt || mt.error) return null;
  const per = input.period, cases = {}, back = {}, backOn = {}, pos = [], skip = [], zero = [];
  let later = 0;
  for (const c of (mt.cases || [])) cases[String(c.id)] = c;
  for (const x of (mt.costs || [])) if (x.return_of) {
    const k = String(x.return_of), a = Number(x.amount) || 0;
    back[k] = (back[k] || 0) + a;
    if (typeof stRetOn !== 'function' || stRetOn((typeof ST_RET !== 'undefined' && ST_RET.byId[String(x.id)]) || x)) backOn[k] = (backOn[k] || 0) + a;
  }
  for (const x of (mt.costs || [])) {
    const c = cases[String(x.case_id)];
    if (x.return_of || !c || (x.pay_type !== 'klein' && x.pay_type !== 'schaden') || (x.pay_via || 'nk') !== 'nk') continue;
    // Nov 2026: Kleinreparatur — every return counts (the lower price; § 7 is on the net) · Schaden — only the returns
    // switched on in Settlements (settlements-returns.js); off = the tenant pays that part too
    const all = back[String(x.id)] || 0, minus = x.pay_type === 'klein' ? all : (backOn[String(x.id)] || 0);
    const date = scD(x.cost_date), gross = cxR(Number(x.amount) || 0), net = cxR(Math.max(0, gross - minus)), off = cxR(all - minus);
    if (!date || date < per.from) continue;
    if (net < 0.005) {                                       // returned in full: no position · a Schaden stays on your screen (its switch)
      if (x.pay_type === 'schaden' && gross > 0.004 && date <= per.to) zero.push({ id: String(x.id), label: String(x.description || '').trim() || String(c.title || '').trim() || 'Receipt', date, gross });
      continue;
    }
    if (date > per.to) { if (date <= (input.fullPeriod || per).to) later++; continue; }
    const rooms = scTbRooms(x.pay_rooms);
    const p = { id: String(x.id), b: x.pay_type === 'klein' ? 1 : 2, label: String(x.description || '').trim() || String(c.title || '').trim() || 'Receipt',
                date, gross, net, off, where: x.pay_where === 'zimmer' || (!x.pay_where && rooms.length === 1) ? 'zimmer' : 'gemein', rooms, no: x.receipt_no || '' };
    (p.b === 1 && net > 150.004 ? skip : pos).push(p);
  }
  const ord = (a, b) => a.b - b.b || a.date.localeCompare(b.date) || a.label.localeCompare(b.label);
  return { pos: pos.sort(ord), skip: skip.sort(ord), later, zero: zero.sort((a, b) => a.date.localeCompare(b.date)) };
}
/* D39 · Teil B room match: the key Controlling links a unit to its room with (_cxNorm) and Maintenance counts rented
   rooms with (mtNorm) — "New York" = "new york" = "New-York" = "New  York" */
const scRoomKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
/* the rooms of a position: canonical names (Casa Castel › Rooms), once each, in the rooms' order (a stable cent split) */
function scTbRooms(list) {
  const rooms = (window._src.rooms || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const out = [];
  for (const n of (Array.isArray(list) ? list : [])) {
    const r = rooms.find(x => scRoomKey(x.name) === scRoomKey(n)), name = r ? String(r.name) : String(n || '').trim();
    if (name && !out.some(o => scRoomKey(o) === scRoomKey(name))) out.push(name);
  }
  const at = n => { const i = rooms.findIndex(x => scRoomKey(x.name) === scRoomKey(n)); return i < 0 ? 1e6 : i; };
  return out.map((n, i) => [n, i]).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map(x => x[0]);
}
/* D39 · Teil B per tenant (after Teil A): each position's NET in equal cent shares over its rooms (largest remainder:
   the first rooms in room order get the extra cent) → the Kalt + NK tenant of that room on the receipt day (R.tenants,
   room matched normalised, from ≤ day ≤ to). No such tenant (vacant, Pauschal, NK skipped = no NK letter) → a warning,
   that share stays with you. § 7: B1 per tenant at most 8 % of the yearly rent (when known) — the excess is a minus row.
   Sets on every tenant t.saldoA (Teil A), t.b1, t.b2, t.teilB [rows] and t.saldo = A + B1 + B2 (what money, letters,
   Controlling and the Dashboard use). → { pos, skip, warn, b1, b2, later } · null without Teil B data */
function scTeilB(input, ten) {
  for (const t of ten) { t.saldoA = t.saldo; t.b1 = 0; t.b2 = 0; t.teilB = []; }
  if (!Array.isArray(input.teilB)) return null;             // no Maintenance data · or a snapshot from before D39
  const per = input.period, warn = [], pos = [];
  for (const p0 of input.teilB) {
    if (p0.date < per.from || p0.date > per.to) continue;
    const rooms = p0.rooms || [], n = rooms.length;
    if (!n) { warn.push({ p: p0, t: p0.label + ' · no Zimmer set · stays with you' }); pos.push(Object.assign({}, p0, { n: 0, shares: [] })); continue; }
    const cents = Math.round(p0.net * 100), base = Math.floor(cents / n), rest = cents - base * n;
    const shares = rooms.map((room, i) => {
      const amount = (base + (i < rest ? 1 : 0)) / 100;
      const t = ten.find(x => x.mode === 'nk' && !x.skipped && scRoomKey(x.room) === scRoomKey(room) && x.from <= p0.date && p0.date <= x.to);
      if (t) t.teilB.push({ id: p0.id, b: p0.b, date: p0.date, label: p0.label, net: p0.net, gross: p0.gross, where: p0.where, n, share: amount });
      else warn.push({ p: p0, room, amount, t: room + ' · no NK letter on ' + stDate(p0.date) + ' · stays with you' });
      return { room, amount, key: t ? t.key : null };
    });
    pos.push(Object.assign({}, p0, { n, shares }));
  }
  for (const t of ten) {
    if (!t.teilB.length) continue;
    const sum = b => cxR(t.teilB.filter(r => r.b === b).reduce((a, r) => a + r.share, 0));
    let b1 = sum(1);
    const src = input.tenancies.find(x => x.key === t.key) || {}, cap = Number(src.rent12) > 0 ? cxR(src.rent12 * 0.08) : null;
    if (cap !== null && b1 > cap + 0.004) {
      t.teilB.push({ b: 1, cap: true, date: '', label: 'Höchstens 8 % der Jahresmiete (§ 7)', rent12: Number(src.rent12), limit: cap, share: cxR(cap - b1) });
      b1 = cap;
    }
    t.teilB.sort((a, b) => a.b - b.b || (a.cap ? 1 : 0) - (b.cap ? 1 : 0) || a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
    t.b1 = b1; t.b2 = sum(2); t.saldo = cxR(t.saldoA + t.b1 + t.b2);
  }
  for (const p of (input.teilBSkip || [])) warn.push({ p, skip: true, t: p.label + ' · Kleinreparatur over 150 € (' + scE(p.net) + ') · not billed' });
  const tot = b => cxR(pos.filter(p => p.b === b).reduce((a, p) => a + p.net, 0));
  return { pos, skip: input.teilBSkip || [], warn, b1: tot(1), b2: tot(2), later: input.teilBLater || 0 };
}

/* ── Model of one year ────────────────────────────────────── */
function scModel(y) {
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID);
  if (!p) return { error: 'Casa Castel is not set up in Controlling yet.' };
  const rec = scRec(y), locked = !!(rec && rec.locked_at && rec.snapshot && rec.snapshot.input);
  let input;
  if (locked) input = JSON.parse(JSON.stringify(rec.snapshot.input));
  else {
    const d = SC.data[y]; if (!d) return { loading: true };
    input = scInputFor(y);
    if (input.error) return { error: input.message };
  }
  const ts = (rec && rec.tenants) || {};
  for (const t of input.tenancies) {
    const s = ts[t.key]; if (!s) continue;
    if (s.vzMonths && Object.keys(s.vzMonths).length && t.vzMap) t.vz = cxR(Object.keys(t.vzMap).reduce((a, ym) => a + (s.vzMonths[ym] !== undefined ? Number(s.vzMonths[ym]) || 0 : t.vzMap[ym].amt), 0));
    else if (s.vz !== undefined && s.vz !== null && s.vz !== '') t.vz = Number(s.vz);
  }
  // Split method (Oct 2026): 'quota' = Kostenquote (default) · 'days' = day-exact by person present
  // (an older nk-casa-engine.js without quota → falls back to day-exact instead of failing)
  const Rd = NkCasa.calc(input), Rq = typeof NkCasa.quota === 'function' ? NkCasa.quota(Rd) : Rd;
  const method = Rq === Rd ? 'days' : 'quota';               // Nov 2026: Kostenquote only (the Day-exact switch is gone)
  const R = method === 'quota' ? Rq : Rd, Ralt = method === 'quota' ? Rd : Rq;
  const g = (typeof ctlSettlementModel === 'function' ? ctlSettlementModel() : []).find(x => x.p.id === CASA_PROP_ID);
  const perM = g ? g.periods.find(pp => pp.to.slice(0, 4) === String(y)) : null;
  const frist = perM ? perM.frist : scPeriod(y).frist;
  const today = cxToday();
  const ten = R.tenants.map(t => {
    const src = input.tenancies.find(x => x.key === t.key) || {};
    const it = perM ? perM.items.find(i => i.type === 'row' && String(i.r.tenant_id) === String(t.tenantId) && scD(i.r.period_from) === t.from) : null;
    const line = it ? { id: String(it.r.id), type: 'row', p, per: perM, it, year: y, frist, from: t.from, to: t.to } : null;
    let st = null; try { st = line ? _stState(line) : null; } catch (e) {}
    const xs = src.extra ? (ts[t.key] || {}).sent : null;
    if (src.extra && xs) st = { res: { dir: xs.dir, amount: xs.amount, date: xs.date, via: xs.via }, k: xs.settled ? 'erledigt' : 'verschickt', booking: null };
    const skipped = !!(it && it.r.status === 'nicht durchgeführt');
    const kAvail = t.mode === 'pauschal' ? 0 : scEinbehalt(t.tenantId, t.from);   // B20: Kaution kept for this NK
    const kau = kAvail > 0 ? { amount: kAvail } : null;
    const einbehalt = kAvail > 0 && (((ts[t.key] || {}).via) || 'kaution') === 'kaution' ? kAvail : 0;
    const k = t.mode === 'pauschal' ? 'none' : skipped ? 'done' : st && st.res ? (st.k === 'erledigt' ? 'done' : 'sent') : 'open';
    const tr = (window._src.casaTen || []).find(x => String(x.id) === String(t.tenantId)) || null;
    const movedOut = t.to < input.period.to || !!(tr && tr.mietende && scD(tr.mietende) < today);
    const alt = (Ralt.tenants.find(x => x.key === t.key) || {});
    return Object.assign({}, t, { altSaldo: alt.saldo, altSum: alt.sum, it, line, st, skipped, k, tr, movedOut, vzMissing: src.vzMissing || [], vzAuto: src.vzAuto ?? src.vz, vzMap: src.vzMap || {}, vzContract: src.vzContract || 0,
                                  extra: !!src.extra, xAddr: src.addr || '', set: ts[t.key] || {}, kau, einbehalt, _exp: src._exp || null });
  });
  const teilB = scTeilB(input, ten);                         // D39: Teil B on top of Teil A → t.saldo = A + B1 + B2 from here on
  // one net amount per tile: > 0 money comes to you · < 0 you pay — results where sent, else the preview
  const money = { ten: null, nIn: 0, nOut: 0, hg: null, hgLines: [], hgAll: input.hgAll || [], back: 0, get: 0 };
  if (R.lines.length) {
    let net = 0;
    for (const t of ten) {
      if (t.k === 'none' || t.skipped) continue;
      const v = t.st && t.st.res ? t.st.res.dir * t.st.res.amount : t.saldo;
      net += v; if (v > 0.004) { money.nIn++; money.get += v; } else if (v < -0.004) { money.nOut++; money.back -= v; }
    }
    money.ten = cxR(net); money.get = cxR(money.get); money.back = cxR(money.back);
  }
  money.hgLines = R.lines.filter(l => l.group === 'hausgeld');              // Strom · Gas · Wasser yearly results (One-off · Versorger)
  if (money.hgLines.length) money.hg = cxR(-money.hgLines.reduce((a, l) => a + l.total, 0));   // a cost (Nachzahlung) = you pay
  const perFull = input.fullPeriod || input.period;
  const out = { p, y, rec, locked, input, R, Rd, Rq, method, quota: Rq.quota, ten, perM, frist, per: perFull, running: perFull.to >= today,
           pv: input.preview || null, sendable: !!perM, warn: input.warn || [], money, today, teilB };
  out.jaGaps = scJaCover(out);                               // Nov 2026: days of this NK year still without a Jahresabrechnung
  return out;
}

/* ── Overview ─────────────────────────────────────────────── */
function stRenderCasa() {
  const el = document.getElementById('tab-casa'); if (!el) return;
  scEnsureHost();
  const B = scYearBounds();                                // D39 (bug 29): from the Casa period, not the calendar year
  if (!SC.year) SC.year = B.lastEnded;
  const y = SC.year;
  const rec = SC.loaded ? scRec(y) : null;
  if (!SC.loaded || (!SC.data[y] && !(rec && rec.locked_at))) {
    // B18: ONE "Loading …" for everything still missing (was two steps = two flashes).
    // This year already on screen (e.g. after "Unlock costs") → it stays until the fresh data is here.
    if (el._scShown !== y) { el._scShown = null; cxPaint(el, '<div class="st-page sc-page"><p class="cx-empty">' + (SC.loaded ? 'Loading ' + y + ' …' : 'Loading …') + '</p></div>'); }
    (SC.loaded ? Promise.resolve() : scLoadRows())
      .then(() => { const r = scRec(y); return (SC.data[y] || (r && r.locked_at)) ? null : scLoadYear(y); })
      .then(() => { if (ST.tab === 'casa' && SC.year === y) stRenderCasa(); })
      .catch(e => { if (ST.tab === 'casa' && SC.year === y) { el._scShown = null; cxPaint(el, '<div class="st-page sc-page"><p class="cx-empty">Could not load ' + y + '.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>'); } });
    return;
  }
  let M;
  try { M = scModel(y); } catch (e) {
    console.error('[settlements] casa', e);
    el._scShown = null; cxPaint(el, '<div class="st-page sc-page"><p class="cx-empty">Could not calculate the NK-Abrechnung.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>');
    return;
  }
  if (M.error) { el._scShown = null; cxPaint(el, '<div class="st-page sc-page"><p class="cx-empty">' + stEsc(M.error) + '</p></div>'); return; }
  SC.model = M;
  for (const yy of [y, y - 1]) {                            // Jahresabrechnungen: this year's bookings (also for a locked year) + last year's month
    if (SC.data[yy] || (SC._jaLd = SC._jaLd || {})[yy]) continue;
    SC._jaLd[yy] = true;
    scLoadYear(yy).then(() => { if (ST.tab === 'casa' && SC.year === y) stRenderCasaQuiet(); }).catch(() => {});
  }

  const nk = M.ten.filter(t => t.k !== 'none');
  const grp = k => M.ten.filter(t => t.k === k);
  const open = grp('open'), sent = grp('sent'), done = grp('done'), none = grp('none');
  const per = M.per;
  const yearNav = '<div class="sc-yr">' +
    '<button class="cx-arw" data-sc="year" data-d="-1" aria-label="Previous year"' + (y <= scMinYear() ? ' disabled' : '') + '><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="sc-yr__t"><div class="sc-yr__m">' + y + '</div><div class="sc-yr__s">' + stNkLabel(per.from, per.to) + ' · ' + (M.running ? 'still running' + (M.pv ? ' · preview as of ' + stDe(M.pv.cutoff) : '') : M.sendable ? 'Frist ' + stDe(M.frist) : 'Frist passed · history') + '</div></div>' +
    '<button class="cx-arw" data-sc="year" data-d="1" aria-label="Next year"' + (y >= B.maxY ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
  const sql = SC.missing || SC.lettersMissing
    ? '<div class="st-soon"><i class="ti ti-database" aria-hidden="true"></i><div><strong>Run the SQL once</strong><span>' +
      (SC.missing ? 'The table nk_abrechnung_casa is missing. ' : '') + (SC.lettersMissing ? 'The letter archive (nk_letters) is missing. ' : '') + 'The SQL is in the chat.</span></div></div>' : '';

  // progress · Tenants + Hausgeld (one net amount each) · Needs you · house costs · rooms
  const total = nk.length, nDone = done.length;
  // Nov 2026: the lock status lives here (the Hausgeld tile shows money) — "ready to lock" once all bills are in
  const rdy = !M.locked && M.sendable && M.R.lines.length && !(M.jaGaps || []).length;
  const progress = stProgress({ done: nDone, sent: sent.length, total, open: open.length, first: M.locked ? 'House costs locked' : rdy ? 'House costs ready to lock' : 'House costs not locked' });
  const mo = M.money, pv = !M.locked ? 'preview · ' : '';
  const tenSub = mo.ten === null ? 'no house costs yet' : pv + mo.nIn + (mo.nIn === 1 ? ' pays you' : ' pay you') + ' · ' + mo.nOut + (mo.nOut === 1 ? ' gets back' : ' get back');
  // Oct 2026 · Hausgeld = the Versorger Jahresabrechnungen of the year (the real bills — not the preview share of the NK)
  const J = scJaModel(M); M.ja = J;
  // Nov 2026 · the two tiles carry what the Casa Castel card showed: Tenants (letters) · Hauskosten (costs, lock, Versorger)
  const nOpenL = M.ten.filter(t => t.k === 'open').length, gapsT = M.locked || M.running ? 0 : (M.jaGaps || []).length, qT = M.quota || {};
  const hkStatus = M.locked ? 'locked' : !M.R.lines.length ? 'nothing booked yet' : M.running ? 'running · preview' : gapsT ? gapsT + (gapsT === 1 ? ' Jahresabrechnung missing' : ' Jahresabrechnungen missing') : M.sendable ? 'ready to lock' : 'not locked';
  const vNet = J.net === null || J.net === undefined ? '' : 'Versorger: ' + (J.net > 0.004 ? 'Guthaben ' : J.net < -0.004 ? 'Nachzahlung ' : 'balanced ') + (Math.abs(J.net) > 0.004 ? scE(Math.abs(J.net)) : '');
  // Nov 2026 · Hausgeld first (the bills come in first), then Tenants — the same order in both tabs and on the Dashboard
  const tiles = '<div class="st-money">' +
    stTile('Jahresabrechnungen', 'receipt', J.net, [gapsT ? gapsT + (gapsT === 1 ? ' Jahresabrechnung missing' : ' Jahresabrechnungen missing') : '',
      M.R.lines.length ? 'Hauskosten ' + scE(M.R.check.total) + (qT.rate ? ' · ' + scE(qT.rate) + '/month' : '') : 'no house costs yet'], 'data-sc="costs"') +
    stTile('NK-Abrechnungen', 'users', mo.ten, tenSub + (M.locked && M.sendable && nOpenL ? ' · ' + nOpenL + ' to send' : ''), 'data-sc="sumTen"') + '</div>';
  void hkStatus; void vNet;

  const L = M.R.check;
  const noData = !M.locked && !M.R.lines.length;
  const label = stNkLabel(per.from, per.to);
  const needs = [];
  // Nov 2026 · Needs you only shows what the Casa Castel card doesn't: "still running" / "Frist passed" (year line),
  // "type the house costs", "Jahresabrechnung missing", "lock" (Hauskosten row + chip) and "letters ready"
  // (NK-Abrechnung row) are gone — what stays are the per-tenant to-dos
  void noData;
  for (const t of sent) if (t.st && t.st.confirm) needs.push({ tone: 'gold', icon: 'check', t: 'Confirm ' + (t.st.res.via === 'miete' ? 'settlement with the rent' : 'settlement via Kaution'),
    s: t.name + ' · ' + t.room + ' · ' + scE(t.st.res.amount), act: 'data-sc="settle" data-k="' + stEsc(t.key) + '"' });
  const nowYm = cxToday().slice(0, 7);
  for (const t of open) {                                   // NK paid not booked in Controlling → taken from the contract
    const miss = Object.keys(t.vzMap || {}).filter(ym => ym < nowYm && (t.vzMap[ym].src === 'contract' || t.vzMap[ym].src === 'open') && !(t.set && t.set.vzMonths && t.set.vzMonths[ym] !== undefined));
    const live = miss.some(ym => t.vzMap[ym].src === 'open');
    if (miss.length && !t.extra) needs.push({ tone: 'gold', icon: 'alert-circle', t: 'NK-Vorauszahlung not booked', s: t.room + ' · ' + miss.map(ym => SC_MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4)).join(', ') + (live ? ' · counted as 0 € until it\u2019s booked' : ' · taken from the contract'), act: 'data-sc="ten" data-k="' + stEsc(t.key) + '"' });
  }
  const need = stNeeds(needs, total && nDone === total ? label + ' is settled' : '');
  const costsCard = '<button class="sc-card sc-costs" data-sc="costs"><span class="sc-costs__i"><i class="ti ti-home" aria-hidden="true"></i></span>' +
    '<span class="sc-costs__t"><b>House costs</b><small class="' + (M.locked ? 'is-ok' : '') + '">' + (M.locked ? '<i class="ti ti-lock" aria-hidden="true"></i> locked ' + scDate(M.rec.locked_at) : 'not locked · preview') + (M.warn.length && !M.locked ? ' · ' + M.warn.length + ' to check' : '') + '</small></span>' +
    '<span class="sc-costs__v">' + scE(L.total) + '</span><i class="ti ti-chevron-right sc-chev" aria-hidden="true"></i></button>';
  const q = M.quota || {}, anySent = M.ten.some(t => t.k === 'sent' || (t.k === 'done' && !t.skipped));
  const nf = (v, d) => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const methSub = M.method === 'quota'
    ? (q.months ? scE(q.rate) + ' per month lived · ' + scMo(q.months) + ' person-months (Ø ' + nf(q.persons, 1) + ' people)' : 'costs ÷ all months lived')
    : 'day by day · split among the people there that day';
  const methCard = '<div class="sc-card sc-meth"><span class="sc-meth__t"><b>How the costs are split</b><small>' + stEsc(methSub) + '</small>' +
      (anySent ? '<small class="sc-meth__lock">Letters already sent – the split stays as it is</small>' : '') + '</span>' +
    '<div class="cx-seg sc-meth__seg" role="group" aria-label="Split method">' +
      '<button class="' + (M.method === 'quota' ? 'on' : '') + '" data-sc="method" data-v="quota" aria-pressed="' + (M.method === 'quota') + '"' + (anySent ? ' disabled' : '') + '>Kostenquote</button>' +
      '<button class="' + (M.method === 'days' ? 'on' : '') + '" data-sc="method" data-v="days" aria-pressed="' + (M.method === 'days') + '"' + (anySent ? ' disabled' : '') + '>Day-exact</button></div></div>';
  const nTodo = M.ten.filter(t => t.k === 'open' || t.k === 'sent').length, nDoneT = M.ten.filter(t => t.k === 'done').length;
  const fchip = (k, l, n) => '<button class="st-chip' + (SC.filter === k ? ' is-on' : '') + '" data-sc="filter" data-k="' + k + '" aria-pressed="' + (SC.filter === k) + '">' + l + (n !== undefined ? '<span class="st-chip__n">' + n + '</span>' : '') + '</button>';
  const filter = '<div class="st-filter" role="group" aria-label="Filter">' + fchip('all', 'All') + fchip('open', 'To do', nTodo) + fchip('done', 'Done', nDoneT) + '</div>';

  const letters = scLettersHtml(y);
  const roomsHtml = scRoomsHtml(M);
  const nRooms = (window._src.rooms || []).filter(r => r.active !== false).length;

  void costsCard; void methCard;
  cxPaint(el, '<div class="st-page sc-page">' + yearNav + sql + progress + tiles + scTbCard(M) + need + filter +   // D39: Teil B (only when there is one)
    stSec('Rooms', nRooms) + roomsHtml + letters +
    (!M.ten.length ? '<p class="cx-empty">No tenants with Kalt + NK in ' + stEsc(stPer(per.from, per.to)) + '.</p>' : '') + '</div>');   // B18: only what changed
  el._scShown = y;
  scRenderModal();
}
/* The Casa Castel card: the same two lines as every Rentals apartment */
const scSteps = (names, cur) => typeof _srSteps === 'function' ? _srSteps(names, cur) : '';
function scHgSuppliers(M) {
  const hs = M.money.hgAll || [];
  return SC_HG_TYPES.filter(([k]) => scHgCat(k)).map(([k, l]) => {
    const c = scHgCat(k);
    return { k, l, list: hs.filter(h => Number(h.catId) === Number(c.id) || String(h.label || '').toLowerCase().startsWith(k)) };
  });
}
function scHgSummary(M) {
  const hs = M.money.hgAll || [], sup = scHgSuppliers(M), miss = sup.filter(x => !x.list.length).map(x => x.l), net = M.money.hg;
  const res = !hs.length ? 'no Jahresabrechnung yet' : net === null || net === undefined ? 'none counted' : (net > 0.004 ? 'Guthaben ' : net < -0.004 ? 'Nachzahlung ' : 'balanced ') + (Math.abs(net) > 0.004 ? scE(Math.abs(net)) : '');
  void miss;
  return 'Jahresabrechnungen paid in ' + M.y + ': ' + res.trim();
}
function scHouseCard(M) {
  const L = M.R.check, noData = !M.locked && !M.R.lines.length;
  const T = M.ten.filter(t => t.k !== 'none'), n = k => T.filter(t => t.k === k).length, open = n('open'), sent = n('sent'), done = n('done');
  const hkChip = M.locked ? ['done', 'locked'] : noData ? ['grey', 'empty'] : M.running ? ['grey', 'running'] : M.sendable ? ['send', 'to lock'] : ['grey', 'preview'];
  const hkSub = (noData ? 'nothing booked yet' : scE(L.total) + ' · ' + (M.locked ? 'locked ' + scDate(M.rec.locked_at) : 'not locked')) + ' · ' + (M.method === 'quota' ? 'Kostenquote' : 'day-exact');
  const nkSub = !T.length ? 'no tenant with Kalt + NK' : !M.locked ? T.length + ' tenants · waiting for the house costs'
    : T.length + ' tenants · ' + [open ? open + ' to send' : '', sent ? sent + ' sent' : '', done ? done + ' settled' : ''].filter(Boolean).join(' · ');
  const nkChip = !T.length ? ['grey', 'no NK'] : !M.locked ? ['grey', 'waiting'] : open ? ['send', 'to send'] : sent ? ['wait', 'sent'] : ['done', 'settled'];
  const rooms = (window._src.rooms || []).filter(r => r.active !== false).length;
  const J = M.ja || scJaModel(M);                          // Nov 2026 · one row: the house costs with their Jahresabrechnungen
  const gapsN = M.locked || M.running ? 0 : (M.jaGaps || []).length, q = M.quota || {};
  const hkMain = noData ? 'nothing booked yet' : scE(L.total) + (q.rate ? ' · ' + scE(q.rate) + ' per month' : '') + (M.pv ? ' · preview' : '');
  const hkMeta = J.n ? (gapsN ? gapsN + (gapsN === 1 ? ' Jahresabrechnung missing' : ' Jahresabrechnungen missing') : J.nIn + ' of ' + J.n + ' Jahresabrechnungen in') : '';
  const hkChip2 = M.locked ? ['done', 'locked'] : noData ? ['grey', 'empty'] : M.running ? ['grey', 'running'] : gapsN ? ['red', 'bill missing'] : M.sendable ? ['send', 'ready to lock'] : ['grey', 'preview'];
  void hkChip; void hkSub;
  return '<div class="sc-card sr5-card"><div class="sr5-h"><span class="sc-av sr5-pav" style="background:#E9DCC6;color:#6B4A1E">CC</span><span class="sr5-h__t"><span class="sr5-pn">Casa Castel</span><span class="sr5-pm">' + stEsc(scHouse().join(', ') + ' · ' + rooms + ' rooms') + '</span></span></div>' +
    '<button class="sc-row sr5-ln" data-sc="costs"><span class="sc-av sr5-av--hv"><i class="ti ti-home" aria-hidden="true"></i></span><span class="sc-row__m"><span class="sc-row__n">Hauskosten</span>' +
      '<span class="sc-row__s">' + stEsc(hkMain) + '</span>' + (hkMeta ? '<span class="sc-row__p' + (gapsN ? ' neg' : '') + '">' + stEsc(hkMeta) + '</span>' : '') + '</span><span class="sc-chip sc-chip--' + hkChip2[0] + '">' + stEsc(hkChip2[1]) + '</span></button>' +
    '<button class="sc-row sr5-ln" data-sc="' + (M.locked && open ? 'start' : 'filter') + '" data-k="open"><span class="sc-av sr5-av--hv"><i class="ti ti-mail" aria-hidden="true"></i></span><span class="sc-row__m"><span class="sc-row__n">NK-Abrechnung</span>' +
      '<span class="sc-row__s">' + stEsc(nkSub) + '</span></span><span class="sc-chip sc-chip--' + nkChip[0] + '">' + stEsc(nkChip[1]) + '</span></button></div>';
}
function scSay(t) {
  const s = t.saldo, a = scE(Math.abs(s));
  if (t.k === 'none') return ['', 'Pauschal – no NK letter' + (t.pnkPaid ? ' · NK in the Pauschale ' + scE(t.pnkPaid) : ' · counts like an empty room')];   // Nov 2026: Kurzzeitvermietung
  if (t.k === 'done') {
    if (t.skipped) return ['', 'skipped · tap to undo'];
    const r = t.st.res, b = t.st.booking;
    if (!r) return ['', 'settled'];
    if (b && Number(b.amount) < 0.005) return ['', r.dir > 0 ? 'let go ' + scE(r.amount) : 'kept ' + scE(r.amount)];
    if (b) return [r.dir > 0 ? 'pos' : 'neg', (r.dir > 0 ? 'paid you ' : 'returned ') + scE(b.amount)];
    if (!r.dir || !r.amount) return ['', 'balanced'];
    const how = r.via === 'kaution' ? ' via Kaution' : r.via === 'miete' ? ' with the rent' : '';
    return [r.dir > 0 ? 'pos' : 'neg', (r.dir > 0 ? 'paid you ' : 'returned ') + scE(r.amount) + how];
  }
  if (t.k === 'sent') {
    const r = t.st.res;
    const how = t.st.confirm ? (r.via === 'miete' ? ' · with the rent' : ' · via Kaution') : '';
    return r.dir > 0 ? ['pos', 'pays you ' + scE(r.amount) + how] : r.dir < 0 ? ['neg', 'gets ' + scE(r.amount) + ' back' + how] : ['', 'balanced'];
  }
  return s > 0 ? ['pos', 'pays you ' + a] : s < 0 ? ['neg', 'gets ' + a + ' back'] : ['', 'balanced'];
}
const scNorm = s => String(s || '').trim().toLowerCase();
function scRoomsHtml(M) {
  const rooms = (window._src.rooms || []).filter(r => r.active !== false).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(r => ({ name: r.name, m2: Number(r.flaeche_m2) || 0 }));
  for (const t of M.ten) if (!rooms.some(r => scNorm(r.name) === scNorm(t.room))) rooms.push({ name: t.room || 'Room', m2: t.m2 || 0 });
  const per = M.R.period;
  return rooms.filter(r => {
    if (SC.filter === 'all') return true;
    const l = M.ten.filter(t => scNorm(t.room) === scNorm(r.name) && t.k !== 'none');
    return SC.filter === 'open' ? l.some(t => t.k === 'open' || t.k === 'sent') : l.length && l.every(t => t.k === 'done');
  }).map(r => {
    const list = M.ten.filter(t => scNorm(t.room) === scNorm(r.name)).sort((a, b) => a.from.localeCompare(b.from));
    // empty days between the tenancies (vacancy) – so every day of the year is accounted for
    const gaps = []; let cur = per.from;
    for (const t of list) {
      if (t.from > cur) gaps.push({ gap: true, from: cur, to: NkCasa.addDays(t.from, -1) });
      const next = NkCasa.addDays(t.to, 1); if (next > cur) cur = next;
    }
    if (cur <= per.to) gaps.push({ gap: true, from: cur, to: per.to });
    const items = list.concat(gaps).sort((a, b) => a.from.localeCompare(b.from));
    const c = scAv(r.name), nk = list.filter(t => t.k !== 'none').length;
    const open = list.filter(t => t.k === 'open').length;
    const chip = !list.length ? ['grey', 'empty'] : !nk ? ['grey', 'Pauschal'] : open ? (M.locked ? ['send', open + ' to send'] : ['grey', 'preview'])
      : list.some(t => t.k === 'sent') ? ['wait', 'waiting'] : ['done', 'settled'];
    return '<div class="sc-card sc-roomc"><div class="sc-roomc__h"><span class="sc-av" style="background:' + c[0] + ';color:' + c[1] + '">' + stEsc(scAbbr(r.name)) + '</span>' +
      '<span class="sc-roomc__t"><b>' + stEsc(r.name) + '</b><small>' + (r.m2 ? String(r.m2).replace('.', ',') + ' m² · ' : '') + (list.length ? list.length + (list.length === 1 ? ' tenant' : ' tenants') : 'no tenant') + '</small></span>' +
      '<span class="sc-chip sc-chip--' + chip[0] + '">' + stEsc(chip[1]) + '</span></div>' +
      items.map(it => it.gap
        ? '<div class="sc-gap">empty ' + stPer(it.from, it.to) + ' · ' + NkCasa.daysBetween(it.from, it.to) + ' days</div>'
        : scRowHtml(it, M, true)).join('') +
      (!M.locked ? '<button class="sc-addt" data-sc="extraNew" data-room="' + stEsc(r.name) + '"><i class="ti ti-user-plus" aria-hidden="true"></i> Add a tenant to this NK</button>' : '') + '</div>';
  }).join('');
}
function scRowHtml(t, M, inRoom) {
  const c = scAv(t.room), say = scSay(t);
  const chip = t.k === 'open' ? (M.locked ? ['send', 'to send'] : ['grey', 'preview']) : t.k === 'sent' ? (t.st.confirm ? ['send', 'confirm'] : ['wait', 'sent ' + stDM(t.st.res.date)]) :
    t.k === 'done' ? ['done', t.skipped ? 'skipped' : t.st.res && t.st.res.dir < 0 ? 'returned' : t.st.booking ? 'paid' : 'settled'] : ['grey', 'Pauschal'];
  const nowYm = M.today ? M.today.slice(0, 7) : cxToday().slice(0, 7);      // D39: months still to come are not "not paid yet"
  const op = Object.keys(t.vzMap || {}).filter(ym => ym <= nowYm && t.vzMap[ym].src === 'open' && !(t.set && t.set.vzMonths && t.set.vzMonths[ym] !== undefined)).sort();
  const per = stPer(t.from, t.to) + (t.movedOut ? ' · moved out' : '') + ((t.teilB || []).length ? ' · incl. Teil B' : '') +   // D39
    (op.length ? ' · ' + op.map(ym => SC_MONTHS_L[Number(ym.slice(5, 7)) - 1]).join(', ') + ' not paid yet' : '');   // Nov 2026: real-only preview
  const amt = say[1].replace(/(\d[\d.]*,\d{2}\s?€)/, '<b>$1</b>');
  return '<button class="sc-row' + (inRoom ? ' sc-row--in' : '') + '" data-sc="ten" data-k="' + stEsc(t.key) + '">' +
    (inRoom ? '' : '<span class="sc-av" style="background:' + c[0] + ';color:' + c[1] + '">' + stEsc(scAbbr(t.room)) + '</span>') +
    '<span class="sc-row__m"><span class="sc-row__n">' + stEsc(t.name) + '</span>' +
      '<span class="sc-row__s"><span class="' + say[0] + '">' + amt + '</span> · ' + stEsc((inRoom ? '' : t.room + ' · ') + per) + '</span></span>' +
    '<span class="sc-chip sc-chip--' + chip[0] + '">' + stEsc(chip[1]) + '</span></button>';
}
function scLettersHtml(y) {
  if (SC.lettersMissing) return '';
  const list = SC.letters.filter(l => l.app === 'casa' && Number(l.year) === Number(y));
  if (!list.length) return '';
  return '<div class="sc-sec">Letters ' + y + ' <span>' + list.length + '</span></div><div class="sc-card sc-list">' + list.map(l =>
    '<button class="sc-row" data-sc="letter" data-id="' + stEsc(l.id) + '"><span class="sc-av sc-av--doc"><i class="ti ti-file-text" aria-hidden="true"></i></span>' +
    '<span class="sc-row__m"><span class="sc-row__n">' + stEsc(l.tenant_name || '') + (l.unit_label ? ' · ' + stEsc(l.unit_label) : '') + '</span>' +
    '<span class="sc-row__p">sent ' + stEsc(scDate(l.sent_at)) + ' · ' + stEsc(Number(l.direction) > 0 ? 'Nachzahlung ' + scE(l.amount) : Number(l.direction) < 0 ? 'Guthaben ' + scE(l.amount) : 'balanced') + '</span></span>' +
    '<span class="sc-open">Open</span></button>').join('') + '</div>';
}

/* ── Detail sheets behind the two tiles ── */
function scSumTen(M) {
  // Nov 2026 · an overview: one line per tenant, grouped by what is next — tap a name to check, send or settle (not here)
  const rows = M.ten.filter(t => t.k !== 'none' && !t.skipped).map(t => {
    const v = t.st && t.st.res ? t.st.res.dir * t.st.res.amount : t.saldo, c = scAv(t.room), amt = Math.abs(v) >= 0.005 ? Math.abs(v) : 0;
    return { av: c, ab: scAbbr(t.room), name: t.name, sub: t.room + ' · ' + stPer(t.from, t.to) + (t.k === 'open' && !M.locked ? ' · preview' : ''),
             amount: amt, dir: v > 0 ? 1 : -1, chip: amt ? null : ['grey', 'balanced'], k: t.k, act: 'data-sc="ten" data-k="' + stEsc(t.key) + '"' };
  });
  // the one action: send the letters (replaces the NK-Abrechnung row and the "letters ready" to-do)
  const nOpen = M.ten.filter(t => t.k === 'open').length;
  const action = !nOpen || !M.sendable ? '' : M.locked
    ? '<button class="cx-btn cx-btn--p st-sendall" data-sc="start"><i class="ti ti-send" aria-hidden="true"></i> Send ' + nOpen + (nOpen === 1 ? ' letter' : ' letters') + '</button>'
    : '<p class="st-sendnote"><i class="ti ti-lock" aria-hidden="true"></i> Lock the house costs first (Jahresabrechnungen) \u2014 then the letters can be sent</p>';   // Nov 2026: info, not a second way in
  const mo = M.money, nSet = rows.filter(r => r.k === 'done').length;
  const cnt = rows.length ? ' · ' + nSet + ' of ' + rows.length + ' settled' : '';
  return stSumSheet({ title: 'NK-Abrechnungen ' + M.y, sub: 'Casa Castel · ' + stNkLabel(M.per.from, M.per.to) + (M.locked ? '' : ' · preview' + (M.pv ? ' as of ' + stDe(M.pv.cutoff) : '')), net: mo.ten, action, dots: { done: nSet, total: rows.length },
    sub2: mo.ten === null ? 'no house costs yet' : mo.nIn + (mo.nIn === 1 ? ' pays you' : ' pay you') + ' · ' + mo.nOut + (mo.nOut === 1 ? ' gets back' : ' get back') + cnt,
    groups: [{ title: M.locked && M.sendable ? 'To send' : 'Not sent yet', count: true, rows: rows.filter(r => r.k === 'open') },
             { title: 'Waiting for money', count: true, rows: rows.filter(r => r.k === 'sent') },
             { title: 'Settled', count: true, rows: rows.filter(r => r.k === 'done') }] }, 'data-sc="close"');
}
/* ── Teil B · from Maintenance (Nov 2026 · D39) ─────────────────────────────
   Check only: who pays is decided in Maintenance › "Who pays?" (the receipt). B1 Kleinreparaturen · B2 Schäden
   (each row opens its receipt), what to check, and the Gesamtverrechnung per Zimmer (Teil A + B1 + B2 = the letter).
   Own small stylesheet (the colours of the agreed mockup), added once. */
const SC_TB_CSS = `
.sc-tb-card { display:flex; align-items:center; gap:10px; width:100%; padding:12px 14px; background:#FDFCFA; border:.5px solid #D9CBB4; border-radius:12px; font:inherit; color:inherit; text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.sc-tb-card__m { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.sc-tb-card__m b { font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; }
.sc-tb-card__m span { font-size:12px; color:#3A3530; }
.sc-tb-card__m small { font-size:11.5px; color:#6F6457; } .sc-tb-card__m em, .sc-tb-w em { font-style:normal; color:#B0661E; }
.sc-tb-hd { display:flex; flex-direction:column; gap:2px; margin:2px 4px 4px; }
.sc-tb-hd b { font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; }
.sc-tb-hd span, .sc-tb-note { font-size:12px; color:#6F6457; }
.sc-tb-note { margin:10px 4px 0; font-size:11.5px; line-height:1.45; }
.sc-tb { margin-top:10px; background:#FDFCFA; border:.5px solid #D9CBB4; border-radius:12px; overflow:hidden; }
.sc-tb--2 { border-color:#BFCBD6; }
.sc-tb__h { display:flex; justify-content:space-between; align-items:baseline; gap:10px; padding:10px 14px; background:#F3EADC; }
.sc-tb--2 .sc-tb__h { background:#E6ECF2; }
.sc-tb__h > span { display:flex; flex-direction:column; gap:1px; }
.sc-tb__h b { font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#7A5527; }
.sc-tb__h small { font-size:11px; color:#6F5A3E; }
.sc-tb--2 .sc-tb__h b { color:#2F4A63; } .sc-tb--2 .sc-tb__h small { color:#3F5568; }
.sc-tb__t { font-size:13px; font-weight:600; color:#1E1B18; white-space:nowrap; }
.sc-tb__r { display:flex; justify-content:space-between; gap:10px; padding:11px 14px; text-decoration:none; color:inherit; border-top:.5px solid #E0DAD0; -webkit-tap-highlight-color:transparent; }
.sc-tb__h + .sc-tb__r { border-top:0; }
.sc-tb__m { display:flex; flex-direction:column; gap:3px; min-width:0; }
.sc-tb__m b { font-size:13.5px; font-weight:500; color:#1E1B18; }
.sc-tb__m small { font-size:11.5px; color:#6F6457; }
.sc-tb__v { font-size:13.5px; font-weight:600; color:#1E1B18; white-space:nowrap; text-align:right; }
.sc-tb__v small { display:block; margin-top:3px; font-size:11px; font-weight:400; color:#8C8174; }
.sc-tb__r.is-cap .sc-tb__m b, .sc-tb__r.is-cap .sc-tb__v { font-weight:500; color:#6F6457; font-size:12.5px; }
.sc-tb-w { margin-top:10px; background:#FDFCFA; border:.5px solid #E8C9A4; border-radius:12px; overflow:hidden; }
.sc-tb-w__h { padding:9px 14px 3px; font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#B0661E; }
.sc-tb-w .sc-tb__r { border-top:0; padding:7px 14px; } .sc-tb-w .sc-tb__r:last-child { padding-bottom:11px; }
.sc-tb-w .sc-tb__m b { font-size:12.5px; color:#7A4A16; }
.sc-tb-lbl { margin:20px 4px 6px; font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; }
.sc-tb-g { background:#FDFCFA; border:.5px solid #E0DAD0; border-radius:12px; padding:4px 12px; display:flex; flex-direction:column; }
.sc-tb-g__r { display:grid; grid-template-columns:84px repeat(4, minmax(0, 1fr)); gap:4px; align-items:baseline; width:100%; padding:8px 0; border:0; border-top:.5px solid #E0DAD0; background:none; font:inherit; font-size:12px; color:#3A3530; text-align:left; }
.sc-tb-g__r:first-child { border-top:0; font-size:10.5px; color:#6F6457; }
button.sc-tb-g__r { cursor:pointer; -webkit-tap-highlight-color:transparent; }
.sc-tb-g__r > span { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.sc-tb-g__r > span:first-child { text-align:left; overflow:hidden; text-overflow:ellipsis; }
.sc-tb-g__r > span:first-child small { display:block; font-size:10.5px; color:#8C8174; }
.sc-tb-g__r > span.is-b1 { color:#7A5527; } .sc-tb-g__r > span.is-b2 { color:#2F4A63; }
.sc-tb-g__r > span.is-nil { color:#8C8174; }
.sc-tb-g__r > span.is-tot { font-weight:600; color:#1E1B18; }
.sc-tb-g__r.is-none { color:#8C8174; } .sc-tb-g__r.is-none > span:last-child { grid-column:span 4; }
`;
(function () {
  if (document.getElementById('scTbCss')) return;
  const st = document.createElement('style'); st.id = 'scTbCss'; st.textContent = SC_TB_CSS;
  (document.head || document.documentElement).appendChild(st);
})();
const scTbHas = M => !!(M && M.teilB && (M.teilB.pos.length || M.teilB.warn.length || ((M.input && M.input.teilBZero) || []).length));   // Nov 2026: + a Schaden returned in full (its switch)
const scTbLink = id => 'maintenance.html#cost=' + encodeURIComponent(id);       // the receipt in Maintenance (deep link)
const scTbNum = v => { const n = cxR(v); return (n < -0.004 ? '−' : '') + Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
/* where / how it is split, e.g. "Gemeinschaftsfläche · ÷ 6 rented = 20,00 €" · "London + New York · ÷ 2 = 120,00 €" · "New York" */
function scTbSub(p) {
  const sh = (p.shares || []).map(s => s.amount), lo = Math.min(...sh), hi = Math.max(...sh);
  const each = !sh.length ? '' : ' = ' + (hi - lo < 0.005 ? scE(lo) : scTbNum(lo) + '–\u2060' + scE(hi));   // word joiner: "16,66–16,67 €" stays on one line
  const n = (p.rooms || []).length;
  const where = p.where === 'zimmer' ? (p.rooms[0] || 'no Zimmer set')
    : 'Gemeinschaftsfläche · ' + (p.b === 2 ? p.rooms.join(' + ') + ' · ' : '') + (n ? '÷ ' + n + (p.b === 1 ? ' rented' : '') + each : 'no Zimmer set');
  const ret = p.gross - p.net > 0.004 ? ' · ' + scE(p.gross) + ' − return ' + scE(p.gross - p.net) : '';
  const off = (p.off || 0) > 0.004 ? ' · return ' + scE(p.off) + ' not counted' : '';   // Nov 2026: Schaden, switched off (your screen only)
  return where + ret + off;
}
/* B1 as the Teil B view sums it: the positions plus the § 7 cap rows (minus) · one number on the card and in the view */
const scTbB1 = M => cxR(M.teilB.b1 + M.ten.reduce((a, t) => a + (((t.teilB || []).find(r => r.cap) || {}).share || 0), 0));
function scTbCard(M) {
  if (!scTbHas(M)) return '';
  const B = M.teilB, nW = B.warn.length, pay = cxR(M.ten.reduce((a, t) => a + (t.b1 || 0) + (t.b2 || 0), 0));
  const parts = [B.pos.some(p => p.b === 1) ? 'B1 Kleinreparaturen ' + scE(scTbB1(M)) : '', B.pos.some(p => p.b === 2) ? 'B2 Schäden ' + scE(B.b2) : ''].filter(Boolean);
  return '<button type="button" class="sc-tb-card" data-sc="teilB"><span class="sc-tb-card__m"><b>Teil B · from Maintenance</b>' +
    '<span>' + stEsc(parts.join(' · ') || 'no positions') + '</span><small>' + stEsc((M.locked ? '' : M.pv ? 'preview · ' : '') + 'tenants pay ' + scE(pay)) +
    (nW ? ' · <em>' + nW + ' to check</em>' : '') + '</small></span><i class="ti ti-chevron-right sc-chev" aria-hidden="true"></i></button>';
}
function scTbView(M) {
  const B = M.teilB || { pos: [], warn: [], b1: 0, b2: 0, later: 0 };
  const row = p => '<a class="sc-tb__r" href="' + stEsc(scTbLink(p.id)) + '"><span class="sc-tb__m"><b>' + stEsc(p.label) + '</b><small>' + stEsc(scTbSub(p)) + '</small></span>' +
    '<span class="sc-tb__v">' + scE(p.net) + '<small>' + stEsc(stDate(p.date)) + '</small></span></a>' +
    (typeof stRetRowsHtml === 'function' ? stRetRowsHtml(p.id, { fixed: p.b === 1, locked: M.locked ? 'locked' : '', gross: p.gross, frozen: p.net }) : '');   // Nov 2026: your screen only
  const block = (b, title, note) => {
    const L = B.pos.filter(p => p.b === b); if (!L.length && !(b === 2 && zeroRows)) return '';
    const capRows = b !== 1 ? [] : M.ten.map(t => [t, (t.teilB || []).find(r => r.cap)]).filter(x => x[1]);
    const caps = capRows.map(([t, c]) =>
      '<div class="sc-tb__r is-cap"><span class="sc-tb__m"><b>' + stEsc('§ 7 cap · ' + t.room + ' · ' + t.name) + '</b><small>' + stEsc('at most 8 % of the yearly rent ' + scE(c.rent12) + ' = ' + scE(c.limit)) + '</small></span>' +
        '<span class="sc-tb__v">' + scTbNum(c.share) + '\u202f€</span></div>').join('');
    const total = b === 1 ? scTbB1(M) : B.b2;   // the sum of the rows (§ 7 cap rows included) · as on the overview card
    return '<div class="sc-tb sc-tb--' + b + '"><div class="sc-tb__h"><span><b>' + title + '</b><small>' + note + '</small></span><span class="sc-tb__t">' + scE(total) + '</span></div>' +
      L.map(row).join('') + caps + (b === 2 ? zeroRows : '') + '</div>';
  };
  // Nov 2026 · a Schaden returned in full: in no position, the letters never see it — here with its returns (switch)
  const Z = typeof stRetZeroHtml === 'function' ? ((M.input && M.input.teilBZero) || []) : [];
  const zeroRows = Z.map(p => stRetZeroHtml(p.label, stDate(p.date) + ' · returned in full · not in Teil B', p.id, { locked: M.locked ? 'locked' : '', gross: p.gross, frozen: 0 })).join('');
  const warn = B.warn.length ? '<div class="sc-tb-w"><div class="sc-tb-w__h">To check</div>' + B.warn.map(w => '<a class="sc-tb__r" href="' + stEsc(scTbLink(w.p.id)) + '"><span class="sc-tb__m"><b>' + stEsc(w.t) + '</b>' +
    '<small>' + stEsc(w.skip ? 'over 150 € is not a Kleinreparatur (§ 7) · in Maintenance › Who pays choose Schaden or NK, or tap Kleinrep. again (you pay)' : w.room ? w.p.label + ' · ' + scE(w.amount) : 'set the Zimmer in Maintenance') + '</small></span></a>').join('') + '</div>' : '';
  // Gesamtverrechnung per Zimmer: every room in order · a room with two NK tenants this year gets two rows
  const rooms = (window._src.rooms || []).filter(r => r.active !== false).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(r => String(r.name));
  for (const t of M.ten) if (!rooms.some(r => scRoomKey(r) === scRoomKey(t.room))) rooms.push(t.room || 'Room');
  const cell = (v, cls) => Math.abs(v || 0) < 0.005 && cls !== 'is-tot' && cls !== 'is-a' ? '<span class="is-nil">–</span>' : '<span class="' + (cls || '') + '">' + scTbNum(v) + '</span>';
  const gRows = rooms.map(room => {
    const L = M.ten.filter(t => scRoomKey(t.room) === scRoomKey(room)), nk = L.filter(t => t.mode === 'nk' && !t.skipped).sort((a, b) => a.from.localeCompare(b.from));
    if (!nk.length) return '<div class="sc-tb-g__r is-none"><span>' + stEsc(room) + '</span><span>' + (L.some(t => t.mode !== 'nk') ? 'Pauschal · no NK letter' : L.length ? 'skipped · no settlement' : 'vacant · no settlement') + '</span></div>';
    return nk.map(t => '<button type="button" class="sc-tb-g__r" data-sc="ten" data-k="' + stEsc(t.key) + '"><span>' + stEsc(room) + (nk.length > 1 ? '<small>' + stEsc(scFirst(t.name)) + '</small>' : '') + '</span>' +
      cell(t.saldoA, 'is-a') + cell(t.b1) + cell(t.b2) + cell(t.saldo, 'is-tot') + '</button>').join('');
  }).join('');
  const head = '<div class="sc-tb-g__r"><span>Zimmer</span><span>Teil A</span><span class="is-b1">B1</span><span class="is-b2">B2</span><span>Total</span></div>';
  const when = M.locked ? 'locked ' + scDate(M.rec.locked_at) + ' · the letters use this snapshot' : M.pv ? 'preview as of ' + stDe(M.pv.cutoff) + (B.later ? ' · ' + B.later + (B.later === 1 ? ' later receipt counts' : ' later receipts count') + ' once that month is in' : '') : '';
  return stMHead('Teil B ' + M.y, 'Casa Castel · ' + stNkLabel(M.per.from, M.per.to) + (when ? ' · ' + when : ''), 'receipt', 'data-sc="close"') +
    '<div class="srm__b mx-b"><div class="sc-tb-hd"><b>Teil B · from Maintenance</b><span>Set in the receipt · check only. Tap to open the receipt.</span></div>' +
    block(1, 'B1 · Kleinreparaturen', '§ 7 · up to 150 € per case') + block(2, 'B2 · Schäden', 'Schadensersatz · full price') + warn +
    '<p class="sc-tb-note">Receipts paid direct are not in Teil B. No positions = no Seite 2.</p>' +
    '<p class="sc-tb-lbl">Gesamtverrechnung per Zimmer</p><div class="sc-tb-g">' + head + gRows + '</div>' +
    '<p class="sc-tb-note" style="margin-top:8px">Minus = Guthaben · Plus = Nachzahlung</p></div>';
}
/* the tenant sheet's calculation with Teil B: "= Teil A · Guthaben" · "+ B1 Kleinreparaturen" · "+ B2 Schäden" (each folds
   open to its positions); the total row below stays as it is. '' without Teil B — the sheet is as before */
function scTbTenRows(t) {
  if (!(t.teilB || []).length) return '';
  const A = t.saldoA;
  const bRow = (b, title) => {
    const L = t.teilB.filter(r => r.b === b); if (!L.length) return '';
    const k = 'tb' + b + ':' + t.key, open = !!SC.open[k], n = L.filter(r => !r.cap).length;
    return stTpRow({ title, sub: stEsc(n + (n === 1 ? ' position' : ' positions') + (L.some(r => r.cap) ? ' · at most 8 % of the yearly rent (§ 7)' : '') + ' · from Maintenance'), value: scE(t['b' + b]),
      act: 'data-sc="fold" data-k="' + stEsc(k) + '" aria-expanded="' + open + '"', icon: open ? 'chevron-up' : 'chevron-down' }) +
      (open ? '<div class="sr-items tp-fold__b">' + L.map(r => '<div class="sr-it"><span>' + stEsc(r.cap ? '§ 7 cap' : r.label) + '<small class="sr-it__s">' +
        stEsc(r.cap ? 'at most 8 % of ' + scE(r.rent12) + ' yearly rent' : stDate(r.date) + ' · ' + (r.where === 'zimmer' ? 'own Zimmer' : 'Gemeinschaftsfläche ÷ ' + r.n) + (r.n > 1 ? ' of ' + scE(r.net) : '')) +
        '</small></span><span>' + scTbNum(r.share) + '\u202f€</span></div>').join('') + '</div>' : '');
  };
  // Teil A signed (a Guthaben is −), so "= Teil A + B1 + B2" adds up to the total below — as Gesamtverrechnung and Seite 2
  return stTpRow({ title: '= Teil A · ' + (A > 0.004 ? 'Nachzahlung' : A < -0.004 ? 'Guthaben' : 'balanced'), sub: 'Betriebskosten', value: scTbNum(A) + '\u202f€', tone: A > 0.004 ? 'pos' : A < -0.004 ? 'neg' : '' }) +
    bRow(1, '+ B1 · Kleinreparaturen') + bRow(2, '+ B2 · Schäden');
}
const SC_HG_TYPES = [['strom', 'Strom'], ['gas', 'Gas'], ['wasser', 'Wasser'], ['entsorg', 'Entsorgung']];   // Versorger with a Jahresabrechnung
/* Nov 2026 · one order everywhere: the cost types' sort order (Providers › Utilities: By law · Contracts · Services) */
const scCatOrd = id => { const c = id === null || id === undefined ? null : (window._ctrl.categories || []).find(x => Number(x.id) === Number(id)); return c && c.sort_order !== null && c.sort_order !== undefined ? Number(c.sort_order) : 900; };
const scHgCat = k => (window._ctrl.categories || []).find(c => c.code !== 'RATE' && String(c.name || '').toLowerCase().startsWith(k)) || null;
function scSumHg(M) {
  // every Jahresabrechnung with "Show in Settlements" (Controlling) · per position: Include in NK · Show in Belegliste
  // enter here (books into Controlling) or in Controlling (shows here) – always the same one entry
  const can = !M.locked, ts = (M.rec && M.rec.tenants) || {}, list = ts.__hgList || {};
  const hs = M.money.hgAll || [], nIn = hs.filter(h => h.on).length, net = M.money.hg;
  const nNach = hs.filter(h => Number((h.info || {}).amount) > 0).length, nGut = hs.length - nNach;
  const sw = (act, id, on, label) => '<button type="button" class="sc-hg__sw' + (on ? ' on' : '') + '" data-sc="' + act + '" data-id="' + stEsc(id) + '"' +
    (can ? '' : ' disabled') + ' aria-pressed="' + on + '"><span class="sc-hg__tr" aria-hidden="true"></span>' + label + '</button>';
  // per supplier: in or not in yet
  const check = SC_HG_TYPES.filter(([k]) => scHgCat(k)).map(([k, l]) => {
    const c = scHgCat(k), got = hs.some(h => Number(h.catId) === Number(c.id) || String(h.label || '').toLowerCase().startsWith(k));
    return '<span class="sc-hg__ck' + (got ? ' is-in' : '') + '">' + (got ? '<i class="ti ti-check" aria-hidden="true"></i>' : '') + stEsc(l) + (got ? '' : ' · not in yet') + '</span>';
  }).join('');
  const rows = hs.map(h => {
    const info = h.info || {}, cost = Number(info.amount) || 0, inn = cost < 0;
    return '<div class="sc-hg__r' + (h.on ? '' : ' is-off') + '">' +
      '<div class="sc-hg__l"><span class="sc-hg__n">' + stEsc(h.label) + '</span><span class="sc-hg__a ' + (inn ? 'pos' : 'neg') + '">' + stEur(cxR(Math.abs(cost))) + '</span></div>' +
      '<div class="sc-hg__s">' + stEsc([inn ? 'Guthaben' : 'Nachzahlung', info.company].filter(Boolean).join(' · ') + (h.on ? '' : ' · not counted')) + '</div>' +
      '<div class="sc-hg__bk"><i class="ti ti-check" aria-hidden="true"></i> booked in Controlling' + (info.date ? ' · ' + stDe(info.date) : '') +
        (can && String(h.id).indexOf('ot:') === 0 ? '<button type="button" class="cx-link sc-hg__rm" data-sc="hgDel" data-id="' + stEsc(h.id) + '">remove</button>' : '') + '</div>' +
      '<div class="sc-hg__sws">' + sw('hgtog', h.id, h.on, 'Include in NK') + sw('hglist', h.id, !!list[h.id], 'Show in Belegliste') + '</div></div>';
  }).join('');
  const k = net === null || net === undefined ? 'nil' : net > 0.004 ? 'in' : net < -0.004 ? 'out' : 'nil';
  const counts = hs.length ? [nNach ? nNach + ' Nachzahlung' : '', nGut ? nGut + ' Guthaben' : '', nIn + ' of ' + hs.length + ' in the NK'].filter(Boolean).join(' · ') + (can ? '' : ' · locked')
                           : 'no Jahresabrechnung yet';
  const hero = '<div class="st-hero st-hero--' + k + '"><span>' + (k === 'in' ? 'you get' : k === 'out' ? 'you pay' : hs.length ? 'nothing counted' : 'nothing yet') + '</span>' +
    '<b>' + (net === null || net === undefined ? '—' : stEur(cxR(Math.abs(net)))) + '</b><small>' + stEsc(counts) + '</small></div>';
  const tot = hs.length ? '<span class="srm__cs ' + (k === 'in' ? 'pos' : k === 'out' ? 'neg' : '') + '">' + (net === null ? '—' : stEur(cxR(Math.abs(net || 0)))) + '</span>' : '';
  // the add form (books into Controlling: One-off · Versorger · Show in Settlements)
  const f = SC.hgNew;
  const typeSeg = SC_HG_TYPES.filter(([k]) => scHgCat(k)).map(([k, l]) => '<button type="button" class="st-seg__b' + (f && f.type === k ? ' is-on' : '') + '" data-sc="hgNewSet" data-f="type" data-v="' + k + '" aria-pressed="' + !!(f && f.type === k) + '">' + l + '</button>').join('');
  const dirSeg = [['1', 'Guthaben', 'you get'], ['-1', 'Nachzahlung', 'you pay']].map(([v, l, sm]) => '<button type="button" class="st-seg__b' + (f && String(f.dir) === v ? ' is-on' : '') + '" data-sc="hgNewSet" data-f="dir" data-v="' + v + '" aria-pressed="' + !!(f && String(f.dir) === v) + '">' + l + '<small>' + sm + '</small></button>').join('');
  const form = !can ? '' : !f ? '<button type="button" class="cx-btn cx-btn--s sc-hg__add" data-sc="hgNew"><i class="ti ti-plus" aria-hidden="true"></i> Jahresabrechnung</button>' :
    '<div class="srm__card sc-hg__form"><p class="srm__ct">New Jahresabrechnung</p>' +
      '<fieldset class="st-f"><legend class="st-f__l">Supplier</legend><div class="st-seg sc-hg__types">' + typeSeg + '</div></fieldset>' +
      '<fieldset class="st-f"><legend class="st-f__l">Result</legend><div class="st-seg st-seg--2">' + dirSeg + '</div></fieldset>' +
      '<div class="sc-hg__row2"><label class="st-f"><span class="st-f__l">Amount</span><span class="st-amt"><input class="st-in" id="scHgAmt" inputmode="decimal" placeholder="0,00" value="' + stEsc(f.amt || '') + '"/><span>€</span></span></label>' +
      '<label class="st-f"><span class="st-f__l">Date</span><input class="st-in" id="scHgDate" type="date" value="' + stEsc(f.date || cxToday()) + '"/></label></div>' +
      '<label class="st-f"><span class="st-f__l">Company</span><input class="st-in" id="scHgCo" placeholder="e.g. eprimo" value="' + stEsc(f.co || '') + '"/></label>' +
      '<p class="sc-hg__hint">Books into Controlling › Casa Castel › One-off, so it is entered only once.</p>' +
      '<div class="srm__bar srm__bar--2"><button type="button" class="cx-btn cx-btn--s" data-sc="hgNewCancel">Cancel</button><button type="button" class="cx-btn cx-btn--p" data-sc="hgNewSave">Book</button></div></div>';
  const card = hs.length ? '<div class="srm__card sc-hg"><div class="srm__ch"><p class="srm__ct">Jahresabrechnungen</p>' + tot + '</div>' + rows + '</div>' : '';
  const note = hs.length ? '<p class="sc-hg__note">' + (can ? 'Jahresabrechnungen are already netted into their cost type in the letter – show them in the Belegliste only when needed.'
                                                          : 'Unlock the house costs to change.') + '</p>' : '';
  return '<div class="srm__h"><div class="srm__ht"><p class="srm__t">Hausgeld</p><p class="srm__s">' + stEsc('Casa Castel · Strom · Gas · Wasser · Entsorgung · ' + stNkLabel(M.per.from, M.per.to)) + '</p></div>' +
    '<button class="srm__x" data-sc="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>' +
    '<div class="srm__b"><div class="srm__one">' + hero + (check ? '<div class="sc-hg__cks">' + check + '</div>' : '') + card + form + note + '</div></div>';
}

/* Hausgeld: a Jahresabrechnung typed here is booked into Controlling (One-off · Versorger · Show in Settlements) */
async function scHgBook(btn) {
  const f = SC.hgNew || {}, g = id => document.getElementById(id);
  const amt = typeof ccParseEUR === 'function' ? ccParseEUR(g('scHgAmt').value) : Number(String(g('scHgAmt').value).replace(/\./g, '').replace(',', '.'));
  const date = g('scHgDate').value, co = g('scHgCo').value.trim();
  const c = f.type ? scHgCat(f.type) : null;
  if (!c) return stSay('Choose Strom, Gas, Wasser or Entsorgung');
  if (!f.dir) return stSay('Choose Guthaben or Nachzahlung');
  if (!amt || amt <= 0) return stSay('Enter the amount');
  if (!date) return stSay('Enter the date');
  const dir = Number(f.dir), d = SC.data[SC.year];
  if (!Array.isArray(window._ctrl.one_time)) window._ctrl.one_time = [];
  // already booked in Controlling? (same cost type, amount and date) → use that one
  const dup = (d ? d.one_time : []).find(o => Number(o.nk_category_id) === Number(c.id) && Math.abs(Number(o.amount) - amt) < 0.005 && String(o.invoice_date).slice(0, 10) === date &&
                                             !scJaMt(o));   // D39 (bug 24): never take over (and rewrite) a Maintenance line
  if (dup) {
    if (!(await stConfirm({ title: 'Already booked', text: c.name + ' · ' + stEur(amt) + ' · ' + stDe(date) + ' is already in Controlling. Use that one instead of booking it twice?', ok: 'Use it' }))) return;
    if (!dup.nk_umlage) { try { await ctlUpdateOneTime(dup.id, { nk_umlage: true }); dup.nk_umlage = true; } catch (e) { return stSay('Could not update it in Controlling'); } }
  } else {
    if (btn) btn.disabled = true;
    try {
      if (!Array.isArray(window._ctrl.one_time)) window._ctrl.one_time = [];
      const row = await ctlAddOneTime({ property_id: CASA_PROP_ID, invoice_date: date, item: c.name + ' · Jahresabrechnung', company: co || null,
                                        amount: cxR(amt), kind: 'Versorger', direction: dir, nk_umlage: true, nk_category_id: c.id,
                                        });
      if (d && !d.one_time.some(o => o.id === row.id)) d.one_time.push(row);
    } catch (e) { if (btn) btn.disabled = false; return stSay('Could not book it in Controlling'); }
  }
  SC.hgNew = null;
  const m = SC.modal; SC.model = scModel(SC.year); stRenderCasa(); SC.modal = m; scRenderModal();
  stSay(dup ? 'Linked to the entry in Controlling' : 'Booked in Controlling');
}
/* One Jahresabrechnung for another NK year: the year before the payment (rule) ↔ the payment year */
async function scHgRemove(lineId) {
  const id = Number(String(lineId).replace('ot:', '')), d = SC.data[SC.year];
  const o = (d ? d.one_time : []).find(x => Number(x.id) === id); if (!o) return;
  if (!Array.isArray(window._ctrl.one_time)) window._ctrl.one_time = [];
  if (!(await stConfirm({ title: 'Remove this Jahresabrechnung?', text: 'It is deleted in Controlling too – it is the same entry.', ok: 'Remove', danger: true }))) return;
  try { await ctlDeleteOneTime(o.id); } catch (e) { return stSay('Could not remove it in Controlling'); }
  d.one_time = d.one_time.filter(x => x.id !== o.id);
  const m = SC.modal; SC.model = scModel(SC.year); stRenderCasa(); SC.modal = m; scRenderModal();
}

/* ── Modal host ───────────────────────────────────────────── */
function scEnsureHost() {
  if (document.getElementById('scModal')) return;
  const h = document.createElement('div'); h.id = 'scModal'; document.body.appendChild(h);
  h.addEventListener('click', scClick);
  h.addEventListener('change', scInput);
  const tab = document.getElementById('tab-casa');
  if (tab && !tab._scWired) { tab._scWired = true; tab.addEventListener('click', scClick); }
}
function scRenderModal() {
  const h = document.getElementById('scModal'); if (!h) return;
  const m = SC.modal, M = SC.model;
  if (!m || !M) { h.innerHTML = ''; h._scViewKey = null; document.body.classList.remove('st-panel-open'); return; }
  if (M.loading) return;                                    // D39: the year is loading again → the pop-up stays as shown until it is back
  let inner = '';
  if (m.view === 'costs') inner = scCostsView(M);
  else if (m.view === 'ten') inner = scTenView(M, m);
  else if (m.view === 'settle') inner = scSettleView(M, m);
  else if (m.view === 'extra') inner = scExtraView(M, m);
  else if (m.view === 'sumTen') inner = scSumTen(M);
  else if (m.view === 'teilB') inner = scTbView(M);                       // D39: Teil B · from Maintenance (check only)
  else if (m.view === 'sumHg' || m.view === 'ja') inner = scCostsView(M);   // Nov 2026: Jahresabrechnungen are part of House costs
  // Oct 2026: a redraw of the SAME pop-up (fold, edit, settle) keeps its scroll position — a new pop-up starts at the top
  // D39 (bug 32): painted with cxPaint (controlling-ui.js) — only what changed is touched, so the field you are typing in
  // keeps its node, text and focus (no keyboard / date picker closing on iOS) and the scroller stays the same element
  const viewKey = m.view + '|' + (m.tid || m.key || m.id || '');
  const same = h._scViewKey === viewKey, oldBody = h.querySelector('.srm__b'), keep = oldBody && same ? oldBody.scrollTop : 0;
  const padKeep = oldBody && same ? oldBody.style.getPropertyValue('padding-bottom') : '';   // a keep-place padding (scKeepPlace) stays
  const html = '<div class="srm" role="dialog" aria-label="NK-Abrechnung Casa Castel"><div class="srm__bg" data-sc="close"></div><div class="srm__win sc-win">' + inner + '</div></div>';
  if (typeof cxPaint === 'function') cxPaint(h, html); else h.innerHTML = html;
  h._scViewKey = viewKey;
  const nb = h.querySelector('.srm__b');
  if (nb && padKeep && nb === oldBody && !nb.style.getPropertyValue('padding-bottom')) nb.style.setProperty('padding-bottom', padKeep, 'important');
  if (nb && !same) nb.scrollTop = 0;                       // another pop-up (the morph may have kept the old scroller)
  else if (nb && keep && nb !== oldBody) nb.scrollTop = keep;   // the scroller was rebuilt after all → back to where it was
  document.body.classList.add('st-panel-open');
}
/* D39 (bug 32): fold / unfold inside the pop-up keeps the tapped row exactly where it is on screen.
   The pop-up scrolls in its own .srm__b (cxKeepPlace only knows the page): note the row's top → redraw →
   scroll the body by the shift. Near the end the body may now be too short for that — a bottom padding
   fills the gap for a moment, then the body glides down to its natural end (as cxKeepPlace does on a page). */
function scKeepPlace(b, sel) {
  const body = b && b.closest ? b.closest('#scModal .srm__b') : null;
  if (!body) return scRenderModal();
  const anc = b.parentElement && b.parentElement.closest('.jb, .sc-ct');   // if the tapped button goes away (e.g. "+ Abschlag")
  const t0 = b.getBoundingClientRect().top, a0 = anc ? anc.getBoundingClientRect().top : 0;
  scRenderModal();
  const nb = document.querySelector('#scModal .srm__b');
  if (!nb) return;
  const now = b.isConnected && b.matches(sel) ? b : nb.querySelector(sel);
  const shift = now ? now.getBoundingClientRect().top - t0 : anc && anc.isConnected ? anc.getBoundingClientRect().top - a0 : 0;
  if (Math.abs(shift) < 1) return;
  const had = !!nb.style.getPropertyValue('padding-bottom'), now0 = parseFloat(getComputedStyle(nb).paddingBottom) || 0;
  const base = had && nb._scPad !== undefined ? nb._scPad : now0;          // the stylesheet's own padding
  const want = nb.scrollTop + shift, more = Math.ceil(want - (nb.scrollHeight - nb.clientHeight));
  if (more > 0) nb.style.setProperty('padding-bottom', (now0 + more) + 'px', 'important');   // .mx-b padding is !important → so is this one
  nb._scPad = base;
  nb.scrollTop = want;
  if (more > 0 || had) scGlideToEnd(nb);
}
/* the body glides (~0.3–0.5 s) from the kept place to its natural end, the extra padding shrinking with it;
   a touch / wheel stops the glide — then the padding shrinks as you scroll up. A redraw of the same pop-up keeps
   the padding (scRenderModal); another keep-place takes over (token). */
function scGlideToEnd(nb) {
  const tok = nb._scGlide = (nb._scGlide || 0) + 1;
  const base = nb._scPad || 0, cur = () => parseFloat(nb.style.getPropertyValue('padding-bottom')) || 0;
  const gone = () => tok !== nb._scGlide || !nb.isConnected || !nb.style.getPropertyValue('padding-bottom');
  const content = () => nb.scrollHeight - (cur() - base);  // the body without the extra padding
  const setExtra = x => { if (x > 0.5) nb.style.setProperty('padding-bottom', (base + Math.ceil(x)) + 'px', 'important'); else nb.style.removeProperty('padding-bottom'); };
  const from = nb.scrollTop, to = Math.max(0, content() - nb.clientHeight);
  if (from - to < 1) { setExtra(0); return; }
  let stopped = false;
  const stop = () => { stopped = true; };
  nb.addEventListener('touchstart', stop, { once: true, passive: true });
  nb.addEventListener('wheel', stop, { once: true, passive: true });
  const trim = () => {                                     // after a stop: shrink the padding as the body scrolls up
    if (gone()) return nb.removeEventListener('scroll', trim);
    const need = Math.max(0, nb.scrollTop + nb.clientHeight - content());
    if (need < cur() - base) setExtra(need);
    if (!need) nb.removeEventListener('scroll', trim);
  };
  const t0 = performance.now(), dur = Math.min(550, 280 + (from - to) * 0.5), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    if (gone()) return;
    if (stopped) { nb.addEventListener('scroll', trim, { passive: true }); return; }
    const k = Math.min(1, (now - t0) / dur), y = from + (to - from) * ease(k);
    setExtra(y + nb.clientHeight - (content()));
    nb.scrollTop = y;
    if (k < 1) requestAnimationFrame(step);
    else { setExtra(0); nb.removeEventListener('touchstart', stop); nb.removeEventListener('wheel', stop); }
  };
  requestAnimationFrame(step);
}
const scHead = (t, s, back, pre) => '<div class="srm__h"><div class="srm__ht">' + (back ? '<button class="srm__back" data-sc="' + back + '"><i class="ti ti-chevron-left" aria-hidden="true"></i> Back</button>' : '') +
  (pre || '') + '<p class="srm__t">' + stEsc(t) + '</p><p class="srm__s">' + stEsc(s) + '</p></div><button class="srm__x" data-sc="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';

/* ── House costs sheet ── */
const SC_QUICK = [['Strom', 'personen'], ['Gas', 'personen'], ['Wasser / Abwasser', 'personen'], ['Müll', 'personen'], ['Grundsteuer', 'personen'], ['Versicherung', 'personen'], ['Internet', 'personen'], ['Reinigung', 'personen'], ['Schornsteinfeger', 'personen']];
function scTypedHtml(M) {
  const pos = ((scRec(M.y) || {}).tenants || {}).__pos || [], ed = SC.posEdit;
  const sum = cxR(pos.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const seg = (id, f, opts, cur) => '<div class="sc-seg">' + opts.map(([v, l]) => '<button class="' + (cur === v ? 'is-on' : '') + '" data-sc="posSet" data-id="' + id + '" data-f="' + f + '" data-v="' + v + '">' + l + '</button>').join('') + '</div>';
  const rows = pos.map(p => {
    const open = ed === p.id;
    return '<button class="sc-pos" data-sc="posEdit" data-id="' + p.id + '"><span><b>' + stEsc(p.label || 'Position') + '</b><small>' + scKeyTxt(p.key) + ' · ' + (p.spread === 'from' && p.date ? 'from ' + stDM(p.date) : 'whole year') + '</small></span><span class="sc-pos__v">' + (Number(p.amount) ? scE(p.amount) : '<em>amount?</em>') + '</span></button>' +
      (open ? '<div class="sc-ed sc-ped"><div class="sc-ped__r"><input class="st-in" data-sc-pos="label" data-id="' + p.id + '" value="' + stEsc(p.label || '') + '" placeholder="Kostenart"/>' +
        '<span class="st-amt sc-ped__a"><input class="st-in" inputmode="decimal" data-sc-pos="amount" data-id="' + p.id + '" value="' + (Number(p.amount) ? stEsc(cxE2(p.amount)) : '') + '" placeholder="per year"/><span>€</span></span></div>' +
        seg(p.id, 'spread', [['year', 'Whole year'], ['from', 'From a date']], p.spread || 'year') +
        (p.spread === 'from' ? '<input class="st-in" type="date" data-sc-pos="date" data-id="' + p.id + '" value="' + stEsc(p.date || M.per.from) + '"/>' : '') +
        '<div class="sc-ped__b"><button class="cx-link" data-sc="posDel" data-id="' + p.id + '">Remove</button><button class="cx-link sr-acc" data-sc="posEdit" data-id="' + p.id + '">Done</button></div></div>' : '');
  }).join('');
  return '<div class="srm__card sc-typed"><p class="sc-cap" style="margin:0">Add a position</p><div class="sc-qa">' +
    SC_QUICK.map(([l, k]) => '<button class="sc-qa__b" data-sc="posAdd" data-l="' + stEsc(l) + '" data-key="' + k + '"><i class="ti ti-plus" aria-hidden="true"></i>' + stEsc(l) + '</button>').join('') +
    '<button class="sc-qa__b" data-sc="posAdd" data-l="" data-key="personen"><i class="ti ti-plus" aria-hidden="true"></i>other</button></div>' +
    (pos.length ? '<p class="sc-cap">Positions</p><div class="sc-posl">' + rows + '<div class="sc-pos sc-pos--t"><b>Total typed</b><span class="sc-pos__v">' + scE(sum) + '</span></div></div>' : '') + '</div>';
}
const scKeyTxt = () => 'by person';
/* "already paid" per month: Controlling where booked, else the contract – every month can be changed */
function scVzEditor(t, can) {
  const yms = Object.keys(t.vzMap || {}).sort(), ov = (t.set && t.set.vzMonths) || {};
  if (!yms.length) return '';
  const vals = yms.map(ym => ov[ym] !== undefined ? Number(ov[ym]) || 0 : t.vzMap[ym].amt);
  const allContract = yms.every(ym => t.vzMap[ym].src === 'contract'), allPaid = yms.every(ym => t.vzMap[ym].src === 'paid');
  const nowYm = cxToday().slice(0, 7), opnAll = yms.filter(ym => t.vzMap[ym].src === 'open');
  const opn = opnAll.filter(ym => ym <= nowYm);                            // Nov 2026: running year, not booked yet → 0 € (D39: not the months to come)
  const nk = allContract ? scContractNk(t, yms[0]) : 0, changed = Object.keys(ov).length > 0;
  const title = changed ? 'Changed by you' : allContract ? 'As per contract' + (nk ? ' · ' + scE(nk) + ' per month' : '') : allPaid ? 'As booked in Controlling' : 'Controlling + contract';
  const sub = opn.length ? 'not paid yet: ' + opn.map(ym => SC_MONTHS[Number(ym.slice(5, 7)) - 1]).join(', ') + ' · counts once it\u2019s booked'
    : opnAll.length ? 'the months to come count once they\u2019re booked'
    : allContract ? 'no NK payments in Controlling for these months' : allPaid ? 'NK part of the rent, by day' : t.vzContract + ' month(s) from the contract';
  return '<div class="sc-vz"><div class="sc-vz__h"><span><b>' + stEsc(title) + '</b><small>' + stEsc(sub) + '</small></span><b>' + scE(t.vz) + '</b></div>' +
    '<div class="sc-vz__m">' + yms.map((ym, i) => '<label class="sc-vz__c' + (ov[ym] !== undefined ? ' is-ov' : '') + '"><small>' + SC_MONTHS[Number(ym.slice(5, 7)) - 1] + '</small>' +
      (can ? '<input inputmode="decimal" data-sc-in="vzm" data-ym="' + ym + '" data-k="' + stEsc(t.key) + '" value="' + stEsc(cxE2(vals[i])) + '"/>' : '<b>' + stEsc(cxE2(vals[i])) + '</b>') + '</label>').join('') + '</div>' +
    '<div class="sc-vz__f">' + (can ? 'Only the months ' + stEsc(scFirst(t.name)) + ' lived here · tap a month to change it' : 'Sent – the amounts are fixed') +
      (can && changed ? ' · <button class="cx-link sc-inl" data-sc="vzReset" data-k="' + stEsc(t.key) + '">reset</button>' : '') + '</div></div>';
}
/* Add a tenant who is not in the app (only for this NK year) */
function scExtraView(M, m) {
  const rooms = (window._src.rooms || []).filter(r => r.active !== false).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const f = (lab, html) => '<div class="sc-xf"><span>' + lab + '</span>' + html + '</div>';
  return stMHead('Add a tenant', stNkLabel(M.per.from, M.per.to) + ' only – not added to Casa Castel', 'inbox', 'data-sc="close"') +
    '<div class="srm__b"><div class="srm__one"><div class="srm__card sc-xcard">' +
      f('Name', '<input class="st-in" id="scxName" placeholder="First and last name"/>') +
      f('Room', '<select class="st-in" id="scxRoom">' + rooms.map(r => '<option' + (scNorm(r.name) === scNorm(m.room) ? ' selected' : '') + '>' + stEsc(r.name) + '</option>').join('') + '</select>') +
      f('Moved in', '<input class="st-in" type="date" id="scxFrom" value="' + M.per.from + '"/>') +
      f('Moved out', '<input class="st-in" type="date" id="scxTo" value="' + M.per.to + '"/>') +
      f('NK / month', '<span class="st-amt"><input class="st-in" inputmode="decimal" id="scxNk" placeholder="per contract"/><span>€</span></span>') +
      f('Address', '<input class="st-in" id="scxAddr" placeholder="Street, PLZ City (if moved out)"/>') +
    '</div><p class="sc-hint2" style="margin-top:6px">The tenant counts in the split day by day, like everyone else.</p></div></div>' +
    '<div class="srm__bar srm__bar--2"><button class="cx-btn cx-btn--s" data-sc="close">Cancel</button><button class="cx-btn cx-btn--p" data-sc="extraSave"' + (SC._xSaving ? ' disabled' : '') + '>Add tenant</button></div>';
}
function scSpreadTxt(M, id) {
  const ln = M.input.lines.find(l => l.id === id); if (!ln || !ln.parts.length) return '';
  const p = ln.parts[0];
  return p.spread === 'year' ? 'over the period' : p.spread === 'from' ? 'from ' + stDe(p.date) + ' to ' + stDe(M.per.to) : 'in its month';
}
/* ── Jahresabrechnungen der Versorger (Oct 2026) ──────────────────────────────
   Typed only here — Controlling › One-off shows them read-only. The same pieces as the
   Rentals Jahresabrechnung window, one block per supplier (Strom · Gas · Wasser · Entsorgung =
   the cost types in Controlling › Setup); each bill:
     received (switch + date) → result (Nachzahlung / Guthaben · amount · company)
     → money paid / received (switch + date + amount)
   The bill lives in the year it was received:
     nk_abrechnung_casa.tenants.__ja = { strom: [ { id, recv, dir, amt, co, ot, pd, pa } ], … }
   The money is the one booking in Controlling › One-off (Casa Castel · Versorger · its cost type ·
   Show in Settlements · source_ref ja:<id>). Nov 2026: it counts by its Abrechnungszeitraum
   (bill.from / bill.to, also on the booking as nk_from / nk_to), split by days into the NK years.
   A booking typed in Controlling before (no bill here) shows as received + paid — received = its date.
   A paid bill folds to one line, like a settled Rentals card.
   Nov 2026 · result "balanced" (dir 0, 0,00 €, as in Rentals): no money step, nothing booked — once received the
   bill is done and covers its Zeitraum (no "no bill" needed).
   Nov 2026 · one bank payment = the bill + the next Abschlag (e.g. Wasser 294,90 € = 256,90 € + 38,00 €): "Abschlag in
   the same payment" (pab) — the booking keeps the bill's amount, the Abschlag goes to the cost type's running cost
   of that month (Controlling › Expenses); pabYm / pabAdd remember what was added, so switching the money off takes it back. */
const SC_JA_ICON = { strom: 'bolt', gas: 'flame', wasser: 'drop', entsorg: 'bin' };
const scJaIsBk = o => Number(o.property_id) === CASA_PROP_ID && !(typeof CX_ABR_KINDS !== 'undefined' && CX_ABR_KINDS.includes(o.kind)) &&
  (o.kind === 'Versorger' || /jahresabrechnung/i.test(String(o.item || '')));
/* D39 (bug 24): a line Maintenance books (maint-link.js) — Maintenance owns it and resets kind, text, amount and date
   on every re-book, so Settlements only links a bill to it and never changes or deletes it */
const scJaMt = o => !!o && (typeof window.mtIsMaintLine === 'function' ? !!window.mtIsMaintLine(o)
  : !!(o.maint_cost_id || o.maint_refund_of || /^maint:/.test(String(o.source_ref || ''))));
const scLastOfMonth = (y, m) => NkCasa.addDays((m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-01', -1);
function scJaSupOf(o) {                                    // which supplier a booking belongs to: its cost type, else its text
  for (const [k] of SC_HG_TYPES) { const c = scHgCat(k); if (c && Number(o.nk_category_id) === Number(c.id)) return k; }
  const t = String(o.item || '').trim().toLowerCase();
  return (SC_HG_TYPES.find(([k]) => t.startsWith(k)) || [])[0] || null;
}
function scJaFindBk(id) {
  if (id === null || id === undefined) return null;
  const k = String(id);
  for (const y of Object.keys(SC.data)) { const o = (((SC.data[y] || {}).one_time) || []).find(x => String(x.id) === k); if (o) return o; }
  const j = (SC.jaBk || []).find(x => String(x.id) === k); if (j) return j;
  return (window._ctrl.one_time || []).find(x => String(x.id) === k) || null;
}
function scJaOwnerYears() {                                // booking id → the year of the bill that owns it
  const m = {};
  for (const r of SC.rows) {
    const ja = (r.tenants || {}).__ja || {};
    for (const k of Object.keys(ja)) for (const b of (ja[k] || [])) if (b && b.ot !== null && b.ot !== undefined) m[String(b.ot)] = Number(r.year);
  }
  return m;
}
/* the bills of one supplier in year y: typed here + older bookings from Controlling */
function scJaBills(y, k, own) {
  const r = scRec(y), list = (((r && r.tenants) || {}).__ja || {})[k] || [];
  own = own || scJaOwnerYears();
  const out = list.map(b => {
    const o = b.ot !== null && b.ot !== undefined ? scJaFindBk(b.ot) : null;
    return Object.assign({}, b, { paid: b.ot !== null && b.ot !== undefined, pd: o ? scD(o.invoice_date) : (b.pd || null), pa: o ? cxR(Number(o.amount) || 0) : (b.pa ?? null) });
  });
  for (const o of ((SC.data[y] || {}).one_time || [])) {
    if (!scJaIsBk(o) || scJaSupOf(o) !== k || own[String(o.id)] !== undefined) continue;
    const day = scD(o.invoice_date), amt = cxR(Number(o.amount) || 0);
    out.push({ id: 'ot:' + o.id, legacy: true, recv: day, dir: Number(o.direction) === 1 ? 1 : -1, amt, co: o.company || '', ot: o.id, paid: true, pd: day, pa: amt });
  }
  return out.sort((a, b) => String(a.recv || a.pd || '9999').localeCompare(String(b.recv || b.pd || '9999')));
}
function scJaExpected(y, k, own) {                         // last year's month (received, else paid) → the same month this year
  const prev = scJaBills(y - 1, k, own).filter(b => b.recv || b.pd);
  if (!prev.length) return null;
  const last = prev[prev.length - 1], m = Number(String(last.recv || last.pd).slice(5, 7));
  if (!m) return null;
  return { m, label: SC_MONTHS[m - 1] + ' ' + y, overdue: NkCasa.addDays(scLastOfMonth(y, m), 15) };   // overdue as in Rentals: 15 days after that month
}
function scJaSupCo(y, k, own) {                            // the company of the latest bill (this year, else last year)
  const a = scJaBills(y, k, own).filter(x => x.co), b = scJaBills(y - 1, k, own).filter(x => x.co);
  return (a.length ? a[a.length - 1] : b.length ? b[b.length - 1] : {}).co || '';
}
/* ── Nov 2026 · each Jahresabrechnung counts by its own Abrechnungszeitraum ─────────────────
   amount × its days in the NK year ÷ all days of its Zeitraum (NkCasa.jaShares) — the parts add
   up exactly to the bill. Its Zeitraum: typed here from the bill, else suggested from the usual
   Abrechnungsjahr in Providers › Utilities (shown as "suggested" until confirmed; when none has
   ended yet, the one a year earlier in the same rhythm). Days before the purchase (Properties ›
   Purchase date) are the seller's: they count in no NK and need no bill.
   A NK year is complete when every day is covered by a bill — or marked "no bill":
     nk_abrechnung_casa.tenants.__noBill = { gas: [ { from, to, at } ], … } */
const SC_MONTHS_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const scJaHist = k => { const c = scHgCat(k); return c && Array.isArray(c.abr_hist) ? c.abr_hist : []; };
const scJaSpan = (a, b) => stDate(a) + '\u2013' + stDate(b);
const scJaMonY = iso => iso ? SC_MONTHS_L[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4) : '';
function scJaYearOf(day) {                                 // the NK year whose period holds a day
  const y = Number(String(day || '').slice(0, 4)); if (!y) return null;
  for (const yy of [y, y + 1, y - 1]) { const p = scPeriod(yy); if (p && day >= p.from && day <= p.to) return yy; }
  return y;
}
function scJaBkAll() {                                     // the bookings: all years (loaded once) + what a loaded year holds
  const m = new Map();
  for (const o of (SC.jaBk || [])) if (scJaIsBk(o)) m.set(String(o.id), o);
  for (const y of Object.keys(SC.data)) for (const o of (((SC.data[y] || {}).one_time) || [])) if (scJaIsBk(o)) m.set(String(o.id), o);
  return [...m.values()];
}
function scJaZr(k, b, o) {                                 // a bill's Zeitraum → { from, to, ok } (ok = from the bill)
  if (b && b.from && b.to) return { from: scD(b.from), to: scD(b.to), ok: true };
  if (o && o.nk_from && o.nk_to) return { from: scD(o.nk_from), to: scD(o.nk_to), ok: true };
  const day = (b && (b.recv || b.pd)) || (o && scD(o.invoice_date)) || null;
  const sg = day && typeof NkCasa.jaSuggest === 'function' ? NkCasa.jaSuggest(scJaHist(k), day) : null;
  return sg ? { from: sg.from, to: sg.to, ok: false, src: sg.src } : null;
}
/* Nov 2026 · result "balanced" (0,00 €) — stored as dir 0 (null = not chosen yet) */
const scJaZero = b => !!b && !b.blank && b.dir === 0;
const scJaDone = b => !!b && (!!b.paid || (scJaZero(b) && !!b.recv));   // paid, or balanced and received
/* the NK years a balanced bill's Zeitraum covers (its days after the purchase) */
function scJaCovTxt(z) {
  if (!z) return '';
  const since = scJaSince(), out = [];
  for (const p of scJaNkPeriods(z)) {
    let f = z.from > p.from ? z.from : p.from; if (since && f < since) f = since;
    const t = z.to < p.to ? z.to : p.to; if (f > t) continue;
    out.push('NK ' + p.y + ': ' + NkCasa.daysBetween(f, t) + ' days');
  }
  return out.length ? 'covers ' + out.join(' · ') : 'outside every NK year';
}
/* every Jahresabrechnung of every year: typed here (received or paid) + older bookings from Controlling */
function scJaAll() {
  const own = scJaOwnerYears(), bks = scJaBkAll(), out = [];
  const bk = id => bks.find(o => String(o.id) === String(id)) || scJaFindBk(id);
  for (const r of SC.rows) {
    const ja = (r.tenants || {}).__ja || {};
    for (const k of Object.keys(ja)) for (const b of (ja[k] || [])) {
      if (!b) continue;
      const paid = b.ot !== null && b.ot !== undefined, o = paid ? bk(b.ot) : null;
      // Nov 2026: paid by a Maintenance receipt with returns → its counted returns lower the bill (a return counts with
      // its receipt, and the receipt counts only through this bill)
      const back = o && typeof stRetNetAmt === 'function' ? cxR(Math.abs(Number(o.amount) || 0) - stRetNetAmt(o)) : 0;
      const dir = Number(b.dir) === 1 ? 1 : Number(b.dir) === -1 ? -1 : 0, amt = cxR(Math.max(0, (Number(b.amt) || (o ? Number(o.amount) || 0 : 0)) - back));
      if (scJaZero(b)) {                                   // Nov 2026: balanced (0,00 €) — nothing to pay, but it covers its Zeitraum
        if (!b.recv || paid) continue;
        const z0 = scJaZr(k, b, null); if (!z0) continue;
        out.push({ k, y: Number(r.year), bid: b.id, id: 'ja:' + b.id, dir: 0, amt: 0, cost: 0, zero: true, day: b.recv, co: b.co || '', from: z0.from, to: z0.to, ok: z0.ok });
        continue;
      }
      if (!(b.recv || paid) || !dir || !(amt > 0)) continue;
      const z = scJaZr(k, b, o); if (!z) continue;
      out.push({ k, y: Number(r.year), bid: b.id, id: paid ? 'ot:' + b.ot : 'ja:' + b.id, dir, amt, cost: dir === 1 ? -amt : amt,
                 day: b.recv || (o && scD(o.invoice_date)) || b.pd || null, co: b.co || (o && o.company) || '', from: z.from, to: z.to, ok: z.ok });
    }
  }
  for (const o of bks) {                                   // booked in Controlling before (no bill typed here)
    if (!o.nk_umlage || own[String(o.id)] !== undefined) continue;
    const k = scJaSupOf(o); if (!k) continue;
    const z = scJaZr(k, null, o), amt = cxR(Number(o.amount) || 0); if (!z || !(amt > 0)) continue;
    const dir = Number(o.direction) === 1 ? 1 : -1, day = scD(o.invoice_date);
    out.push({ k, y: scJaYearOf(day), bid: 'ot:' + o.id, id: 'ot:' + o.id, dir, amt, cost: dir === 1 ? -amt : amt, day, co: o.company || '', from: z.from, to: z.to, ok: z.ok, legacy: true });
  }
  return out;
}
function scJaNkPeriods(z) {                                // the NK periods a Zeitraum touches → [{ y, from, to }]
  const out = [], y0 = Number(z.from.slice(0, 4)) - 1, y1 = Number(z.to.slice(0, 4)) + 1;
  for (let y = y0; y <= y1; y++) { const p = scPeriod(y); if (p && p.from && p.to) out.push({ y, from: p.from, to: p.to }); }
  return out;
}
/* Nov 2026: the purchase date (Properties › Purchase date) — days before it are the seller's and count in no NK */
const scJaSince = () => { const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID); return p && typeof ctlPropSince === 'function' ? ctlPropSince(p) : ''; };
const scJaShares = (z, cost) => z && cost && typeof NkCasa.jaShares === 'function' ? NkCasa.jaShares({ from: z.from, to: z.to, amount: cost }, scJaNkPeriods(z), scJaSince()) : {};
const scJaSplitTxt = sh => Object.keys(sh).sort().map(y => 'NK ' + y + ': ' + scE(Math.abs(sh[y].amount)))
  .concat(sh.before ? ['before the purchase (seller): ' + scE(Math.abs(sh.before.amount))] : []).join(' · ');
/* this NK year's share of every Jahresabrechnung → the engine's src.ja (running year: its days up to the preview) */
function scJaLinesFor(y, per, cutoff) {
  const out = [], e2 = v => cxE2(Math.abs(Number(v) || 0)) + '\u00a0\u20ac';
  for (const b of scJaAll()) {
    const N = NkCasa.daysBetween(b.from, b.to); let share, days;
    if (cutoff) {
      const since = scJaSince(); let f = b.from > per.from ? b.from : per.from; if (since && f < since) f = since;
      const t = b.to < cutoff ? b.to : cutoff;
      if (f > t) continue;
      days = NkCasa.daysBetween(f, t); share = NkCasa.r2(b.cost * days / N);
    } else {
      const sh = scJaShares(b, b.cost)[y]; if (!sh) continue;
      share = sh.amount; days = sh.days;
    }
    if (Math.abs(share) < 0.005) continue;
    const c = scHgCat(b.k), name = c ? c.name : b.k;
    out.push({ id: b.id, catId: c ? c.id : null, share, label: name,
      info: { date: b.day, company: b.co, amount: share, full: b.cost, from: b.from, to: b.to, ok: b.ok, days, of: N, y: b.y, k: b.k, bid: b.bid,
              item: name + ' · Jahresabrechnung ' + scJaSpan(b.from, b.to) + ' · ' + (b.dir === 1 ? 'Guthaben ' : 'Nachzahlung ') + e2(b.amt) + ' · anteilig ' + days + ' von ' + N + ' Tagen' } });
  }
  return out;
}
/* the days of this NK year still without a Jahresabrechnung — per supplier with an Abrechnungsjahr in Providers */
function scJaCover(M) {
  if (!M || M.locked || typeof NkCasa.jaGaps !== 'function') return [];
  const end = M.running ? (M.pv ? M.pv.cutoff : null) : M.per.to; if (!end) return [];
  const all = scJaAll(), today = cxToday(), nb = ((M.rec && M.rec.tenants) || {}).__noBill || {}, out = [];
  for (const [k, l] of SC_HG_TYPES) {
    if (!scHgCat(k)) continue;
    const H = NkCasa.jaHist(scJaHist(k)); if (!H.length) continue;      // no Abrechnungsjahr in Providers → not watched
    const since = scJaSince();                               // Nov 2026: nothing is missing before the purchase
    let from = H[0].from > M.per.from ? H[0].from : M.per.from; if (since && from < since) from = since; if (from > end) continue;
    for (const g of NkCasa.jaGaps({ from, to: end }, all.filter(b => b.k === k).concat(nb[k] || []))) {
      const ex = NkCasa.jaExpect(scJaHist(k), g.to);
      const late = !!ex && NkCasa.addDays(scLastOfMonth(Number(ex.slice(0, 4)), Number(ex.slice(5, 7))), 15) < today;   // as in Rentals: 15 days after that month
      out.push({ k, l, from: g.from, to: g.to, days: g.days, exp: ex, late, expTxt: ex ? 'expected around ' + scJaMonY(ex) : '' });
    }
  }
  return out;
}
/* Nov 2026 · deep link from Controlling › One-off: open the cost type card and the bill of that booking */
function scJaFocus(ot) {
  if (ot === null || ot === undefined || ot === '') return;
  const r = scRec(SC.year), ja = ((r && r.tenants) || {}).__ja || {};
  for (const k of Object.keys(ja)) for (const b of (ja[k] || [])) if (b && String(b.ot) === String(ot)) { SC.open['ct:' + k] = true; SC.open['ja:' + b.id] = true; return; }
  const o = scJaFindBk(ot), k = o ? scJaSupOf(o) : null;
  if (k) { SC.open['ct:' + k] = true; SC.open['ja:ot:' + ot] = true; }
}
/* the Zeitraum also on the booking (Controlling shows it there) — the bill here stays the source */
async function scJaMirror(e) {
  if (!e || e.ot === null || e.ot === undefined) return;
  if (scJaMt(scJaFindBk(e.ot))) return;                    // D39: a Maintenance line is never written from here
  try { scJaSync(await ctlUpdateOneTime(e.ot, { nk_from: e.from || null, nk_to: e.to || null })); }
  catch (err) { console.warn('[settlements] Zeitraum not copied to the booking', err); }
}
function scJaModel(M) {
  const own = scJaOwnerYears(), today = cxToday();
  const watch = !M.locked && (M.running || M.sendable);   // a missing bill can only be "overdue" while the year is still open
  const S = SC_HG_TYPES.filter(([k]) => scHgCat(k)).map(([k, l]) => {
    const bills = scJaBills(M.y, k, own), real = bills.filter(b => b.recv || b.paid);
    const exp = real.length ? null : scJaExpected(M.y, k, own);
    const st = real.some(b => !scJaDone(b)) ? 'open' : real.length ? 'paid' : exp && watch && today > exp.overdue ? 'overdue' : watch ? 'expected' : 'none';
    return { k, l, c: scHgCat(k), icon: SC_JA_ICON[k] || 'receipt', bills, real, exp, st, co: scJaSupCo(M.y, k, own) };
  });
  const all = S.reduce((a, s) => a.concat(s.real), []);
  const net = cxR(all.reduce((a, b) => a + (Number(b.dir) === 1 ? 1 : -1) * (Number(b.amt) || 0), 0));   // > 0 = money comes to you
  const n = S.length, nIn = S.filter(s => s.real.length).length, nPaid = S.filter(s => s.st === 'paid').length;
  const open = S.filter(s => s.st === 'open'), over = S.filter(s => s.st === 'overdue');
  const nOpen = all.filter(b => !scJaDone(b)).length, nZero = all.filter(scJaZero).length;
  const nGut = all.filter(b => Number(b.dir) === 1).length, nNach = all.length - nGut - nZero;
  const netTxt = (net > 0.004 ? 'Guthaben ' : net < -0.004 ? 'Nachzahlung ' : 'balanced') + (Math.abs(net) > 0.004 ? scE(Math.abs(net)) : '');
  const nx = S.filter(s => s.st === 'expected' && s.exp).sort((a, b) => a.exp.m - b.exp.m), next = nx.length ? nx.filter(s => s.exp.m === nx[0].exp.m) : [];
  let say, tone = '', chip;
  if (over.length) { say = over.map(s => s.l).join(' · ') + ' overdue' + (over.length === 1 ? ' · expected ' + over[0].exp.label : ''); tone = 'neg'; chip = ['red', 'overdue']; }
  else if (open.length) {
    const ob = open.length === 1 ? open[0].real.filter(b => !scJaDone(b)) : [];
    say = nPaid + ' of ' + n + ' paid · ' + (ob.length === 1 ? open[0].l + ' ' + scE(Number(ob[0].amt) || 0) + ' not ' + (Number(ob[0].dir) === 1 ? 'received' : 'paid') + ' yet' : nOpen + ' not paid yet');
    tone = 'neg'; chip = ['red', 'open'];
  }
  else if (n && nPaid === n) { say = n + ' of ' + n + ' paid · ' + netTxt; tone = net > 0.004 ? 'pos' : net < -0.004 ? 'neg' : ''; chip = ['done', 'settled']; }
  else if (!watch) { say = nIn + ' of ' + n + ' in' + (nIn ? ' · ' + netTxt : ''); chip = ['grey', nIn ? 'not all in' : 'none']; }
  else { say = nIn + ' of ' + n + ' in' + (next.length ? ' · next: ' + next.map(s => s.l).join(' and ') + ' ~ ' + SC_MONTHS[next[0].exp.m - 1] : ''); chip = ['grey', 'expected']; }
  const tile = !n ? 'no Strom · Gas · Wasser cost type yet' : open.length ? nPaid + ' of ' + n + ' paid · ' + nOpen + ' open'
    : over.length ? nIn + ' of ' + n + ' in · ' + over.length + ' overdue' : nPaid === n ? n + ' of ' + n + ' paid' : nIn + ' of ' + n + ' in';
  const rng = nx.length ? SC_MONTHS[nx[0].exp.m - 1] + (nx[nx.length - 1].exp.m !== nx[0].exp.m ? '–' + SC_MONTHS[nx[nx.length - 1].exp.m - 1] : '') + ' ' + M.y : '';
  const heroSub = nIn + ' of ' + n + ' in' + (nOpen ? ' · ' + nOpen + ' not paid yet' : '') +   // Nov 2026 · lean
    (!nIn && rng ? ' · expected ' + rng : '');
  return { S, n, nIn, nPaid, net: nIn ? net : null, say, tone, chip, tile, heroSub, done: !!n && nPaid === n };
}
function scJaView(M) {
  const J = scJaModel(M), can = !M.locked;
  const head = stMHead('Jahresabrechnungen ' + M.y, 'Casa Castel · ' + (J.S.map(s => s.l).join(' · ') || 'Versorger'), 'receipt', 'data-sc="close"');
  if (!J.n) return head + '<div class="srm__b mx-b"><p class="cx-empty">No Strom, Gas, Wasser or Entsorgung cost type in Controlling › Setup yet.</p></div>';
  const net = J.net, tone = net === null ? 'none' : net > 0.004 ? 'get' : net < -0.004 ? 'pay' : 'zero';
  const hero = stMHero({ tone, label: net === null ? 'Result' : net > 0.004 ? 'Guthaben in total' : net < -0.004 ? 'Nachzahlung in total' : 'Balanced',
                         amount: net, sub: J.heroSub, settled: J.done });
  const lock = M.locked ? '<p class="sc-ja__lock"><i class="ti ti-lock" aria-hidden="true"></i> House costs ' + M.y + ' are locked – unlock them to change. A late payment dated after ' + stDate(M.per.to) + ' can still be booked.</p>' : '';
  return head + '<div class="srm__b mx-b">' + hero + lock + J.S.map(s => scJaSupHtml(M, s, can)).join('') + scJaNkHtml(M) + '</div>';   // Nov 2026 · lean: no footer note
}
/* Nov 2026 · what counts in this NK year: every bill touching it (also those that came the year after) + the days still missing */
function scJaNkHtml(M) {
  const can = !M.locked, nb = ((M.rec && M.rec.tenants) || {}).__noBill || {}, hs = M.money.hgAll || [], gaps = M.jaGaps || [];
  const zeros = scJaAll().filter(b => b.zero), since = scJaSince();   // Nov 2026: balanced bills (0,00 €) — no NK line, but they cover days
  const blocks = SC_HG_TYPES.filter(([k]) => scHgCat(k)).map(([k, l]) => {
    const c = scHgCat(k), watched = NkCasa.jaHist ? NkCasa.jaHist(scJaHist(k)).length > 0 : false;
    const mine = hs.filter(h => (h.info || {}).k ? h.info.k === k : Number(h.catId) === Number(c.id))
      .sort((a, b) => String((a.info || {}).from || '').localeCompare(String((b.info || {}).from || '')) || String(a.id).localeCompare(String(b.id)));
    const rows = mine.map(h => {
      const i = h.info || {}, full = Number(i.full ?? i.amount) || 0, other = i.y && Number(i.y) !== Number(M.y);
      const sub = [i.days && i.of ? i.days + ' of ' + i.of + ' days' : (full < 0 ? 'Guthaben ' : 'Nachzahlung ') + scE(Math.abs(full)), h.on ? '' : 'not in the NK'].filter(Boolean).join(' · ');
      return [String(i.from || ''), '<div class="sc-jn__r' + (h.on ? '' : ' is-off') + '"><span class="sc-jn__m"><b>' + stEsc(i.from && i.to ? scJaSpan(i.from, i.to) : h.label) +
        (i.ok === false ? '<span class="sc-ja__sg">suggested</span>' : '') + '</b>' +
        '<small>' + stEsc(sub) + (other ? ' · <button type="button" class="cx-link sc-jn__go" data-sc="jaYear" data-y="' + Number(i.y) + '">came in ' + Number(i.y) + ' \u203a</button>' : '') + '</small></span>' +
        '<span class="sc-jn__v ' + (Number(i.amount) < 0 ? 'pos' : 'neg') + '">' + scE(Math.abs(Number(i.amount) || 0)) + '</span></div>'];
    });
    const zr = zeros.filter(b => b.k === k).map(b => {
      let f = b.from > M.per.from ? b.from : M.per.from; if (since && f < since) f = since;
      const t = b.to < M.per.to ? b.to : M.per.to; if (f > t) return null;
      const other = b.y && Number(b.y) !== Number(M.y);
      return [String(b.from), '<div class="sc-jn__r is-zero"><span class="sc-jn__m"><b>' + stEsc(scJaSpan(b.from, b.to)) +
        (b.ok === false ? '<span class="sc-ja__sg">suggested</span>' : '') + '</b>' +
        '<small>' + stEsc('balanced · ' + NkCasa.daysBetween(f, t) + ' of ' + NkCasa.daysBetween(b.from, b.to) + ' days') +
        (other ? ' · <button type="button" class="cx-link sc-jn__go" data-sc="jaYear" data-y="' + Number(b.y) + '">came in ' + Number(b.y) + ' \u203a</button>' : '') + '</small></span>' +
        '<span class="sc-jn__v">' + scE(0) + '</span></div>'];
    }).filter(Boolean);
    const gp = gaps.filter(g => g.k === k).map(g => [g.from, '<div class="sc-jn__r is-gap"><span class="sc-jn__m"><b>' + stEsc(scJaSpan(g.from, g.to)) + '</b>' +
      '<small class="' + (M.running ? '' : 'neg') + '">' + stEsc((M.running ? 'still to come' : g.late ? 'missing · overdue' : 'missing') + (g.expTxt ? ' · ' + g.expTxt : '')) + '</small></span>' +
      (can && !M.running ? '<button type="button" class="cx-link sc-jn__nb" data-sc="jaNoBill" data-k="' + k + '" data-f="' + g.from + '" data-t="' + g.to + '">no bill</button>' : '') + '</div>']);
    const nbs = (nb[k] || []).map((x, i) => [String(x.from || ''), '<div class="sc-jn__r is-nb"><span class="sc-jn__m"><b>' + stEsc(scJaSpan(x.from, x.to)) + '</b><small>no bill – marked by you</small></span>' +
      (can ? '<button type="button" class="cx-link sc-jn__nb" data-sc="jaNoBillUndo" data-k="' + k + '" data-i="' + i + '">undo</button>' : '') + '</div>']);
    const list = rows.concat(zr, gp, nbs).sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1]).join('');   // one list in date order
    const none = list ? '' : '<div class="sc-jn__r"><span class="sc-jn__m"><small>nothing in NK ' + M.y + '</small></span></div>';
    const hint = watched || M.locked ? '' : '<p class="sc-jn__h">Set its Abrechnungsjahr in Providers › Utilities – then a missing bill shows here.</p>';
    return '<div class="sc-jn__s"><p class="sc-jn__t">' + stIc(SC_JA_ICON[k] || 'receipt', 15) + '<span>' + stEsc(l) + '</span></p>' + list + none + hint + '</div>';
  }).join('');
  const sum = cxR(hs.filter(h => h.on).reduce((a, h) => a + (Number((h.info || {}).amount) || 0), 0));
  return '<div class="srm__card sc-jn"><div class="srm__ch"><p class="srm__ct">In NK ' + M.y + '</p><span class="srm__cs ' + (sum < -0.004 ? 'pos' : sum > 0.004 ? 'neg' : '') + '">' +
    (hs.length ? (sum < -0.004 ? 'Guthaben ' : sum > 0.004 ? 'Nachzahlung ' : '') + scE(Math.abs(sum)) : '\u2014') + '</span></div>' + blocks +
    '<p class="sc-hg__note">Each bill counts with its days in ' + M.y + '.</p></div>';
}
function scJaSupHtml(M, s, can) {
  const bills = s.bills.length ? s.bills : [{ id: 'new:' + s.k, blank: true, co: s.co }];
  // "+ another one" (e.g. a supplier change) only while a paid block of this supplier is open — keeps the list calm
  const more = can && s.real.length && s.bills.every(b => b.paid) && s.bills.some(b => SC.open['ja:' + b.id])
    ? '<button type="button" class="cx-link sc-ja__more" data-sc="jaAdd" data-k="' + s.k + '"><i class="ti ti-plus" aria-hidden="true"></i> another Jahresabrechnung ' + stEsc(s.l) + '</button>' : '';
  return bills.map(b => scJaBillHtml(M, s, b, can)).join('') + more;
}
function scJaBillHtml(M, s, b, can, bodyOnly) {           // Nov 2026 · bodyOnly: the fields only, opened in place in the House costs pop-up
  const at = ' data-k="' + s.k + '" data-b="' + stEsc(b.id) + '"';
  const dir = Number(b.dir) === 1 ? 1 : Number(b.dir) === -1 ? -1 : 0, paid = !!b.paid, recv = !!b.recv, amt = Number(b.amt) || 0;
  const zero = scJaZero(b), done = paid || (zero && recv), pab = Number(b.pab) || 0;   // Nov 2026: balanced · Abschlag in the same payment
  const open = !!SC.open['ja:' + b.id];
  // Nov 2026 · its Abrechnungszeitraum (from the bill, else suggested) and what it adds to each NK year
  const bo = b.ot !== null && b.ot !== undefined ? scJaFindBk(b.ot) : null;
  const z = !b.blank && (recv || paid) ? scJaZr(s.k, b, bo) : null, base = amt || Number(b.pa) || 0;
  const split = zero ? scJaCovTxt(z) : z && base && dir ? scJaSplitTxt(scJaShares(z, dir === 1 ? -base : base)) : '';
  const nk = z ? ' · ' + scJaSpan(z.from, z.to) + (z.ok ? '' : ' (suggested)') + (split ? ' · ' + split : '') : '';
  const v = amt ? '<span class="sc-ja__v ' + (dir > 0 ? 'pos' : 'neg') + '">' + scE(amt) + '</span>' : zero ? '<span class="sc-ja__v">' + scE(0) + '</span>' : '<span class="sc-ja__v is-nil">\u2014</span>';
  const fx = done && open ? '<button type="button" class="sc-ja__fx" data-sc="jaFold"' + at + ' aria-label="Fold"><i class="ti ti-chevron-up" aria-hidden="true"></i></button>' : '';
  const lbl = '<p class="mx-lbl sc-ja__lbl">' + stIc(s.icon, 16) + '<span class="sc-ja__n">' + stEsc(s.l + (b.co ? ' · ' + b.co : '')) + '</span>' + v + fx + '</p>';
  const absTxt = pab ? (dir > 0 ? ' · Abschlag ' + scE(pab) + ' kept' : ' · + Abschlag ' + scE(pab)) : '';
  if (bodyOnly) return scJaBodyHtml(M, s, b, can, { at, dir, paid, recv, amt, zero, pab, z, split, absTxt, line: bodyOnly.line || null });
  if (done && !open) {                                     // Nov 2026 · lean: result + date · its Zeitraum (+ "suggested") — the split, seller part and Abschlag one tap away
    const t = zero ? 'Balanced · received ' + stDate(b.recv) : (dir > 0 ? 'Guthaben received ' : 'Nachzahlung paid ') + stDate(b.pd);
    return lbl + '<button type="button" class="sc-ja__fold" data-sc="jaFold"' + at + ' aria-expanded="false"><span class="mx-ic" style="background:' + (ST_TINT[s.icon] || '#F3EEE6') + '">' + stIc(s.icon, 24) + '</span>' +
      '<span class="mx-row__m"><span class="mx-rt">' + stEsc(t) + '</span>' +
      (z ? '<span class="mx-rs">' + stEsc(scJaSpan(z.from, z.to)) + (z.ok ? '' : '<span class="sc-ja__sg">suggested</span>') + '</span>' : '') +
      '</span><i class="ti ti-chevron-down" aria-hidden="true"></i></button>';
  }
  return lbl + scJaBodyHtml(M, s, b, can, { at, dir, paid, recv, amt, zero, pab, z, split, absTxt });
}

/* Nov 2026 · the fields of one bill (received · result · amount · Zeitraum · money) — in the House costs pop-up
   opened in place under its row; o.line = its NK line here ("in the NK" and Belegliste switches) */
function scJaBodyHtml(M, s, b, can, o) {
  // Nov 2026 · compact: the result · amount + received on · Zeitraum (one row) · the money as one line · NK / Belegliste chips ·
  // the rare things (company, Abschlag in the same payment, remove) behind ⋯ — every value once
  const { at, dir, paid, recv, amt, zero, pab, z, split, absTxt } = o;
  const ln = o.line || null, list = ((M.rec && M.rec.tenants) || {}).__hgList || {}, dis = can ? '' : ' disabled';
  const opn = k => !!SC.open[k + b.id], tg = (k, inner, cls) => '<button type="button" class="' + cls + '" data-sc="jaOpen" data-o="' + k + stEsc(b.id) + '">' + inner + '</button>';
  // ── result · amount · received on
  const sel = zero ? 0 : dir || null;
  const seg = '<div class="jb-seg" role="group" aria-label="Result">' + [[-1, 'Nachzahlung'], [1, 'Guthaben'], [0, 'balanced']].map(([x, t]) =>
    '<button type="button" class="' + (sel === x ? 'is-on' : '') + '" data-sc="jaDir" data-v="' + x + '"' + at + ' aria-pressed="' + (sel === x) + '"' + dis + '>' + t + '</button>').join('') + '</div>';
  const f = (lbl, input) => '<label class="jb-f"><span>' + lbl + '</span>' + input + '</label>';
  const top = '<div class="jb-g2">' + (zero ? '' : f('Amount', '<span class="jb-amt"><input inputmode="decimal" autocomplete="off" data-scja="amt"' + at + ' value="' + (amt ? cxE2(amt) : '') + '" placeholder="0,00"' + dis + '/><em>\u20ac</em></span>')) +
    f('Received on', '<input type="date" data-scja="recv"' + at + ' value="' + stEsc(b.recv || '') + '"' + dis + '/>') + '</div>';
  // ── Abrechnungszeitraum: one row · how it splits over the NK years
  const zr = z ? '<p class="jb-zl">Zeitraum<span class="jb-tag' + (z.ok ? ' is-ok' : '') + '">' + (z.ok ? 'from the bill' : 'suggested') + '</span>' +
      (!z.ok && can ? '<button type="button" class="cx-link jb-zok" data-sc="jaZok"' + at + '>matches the bill</button>' : '') + '</p>' +
    '<div class="jb-z"><input type="date" data-scja="zf"' + at + ' value="' + stEsc(z.from) + '"' + dis + ' aria-label="From"/><em>–</em><input type="date" data-scja="zt"' + at + ' value="' + stEsc(z.to) + '"' + dis + ' aria-label="To"/></div>' +
    '<p class="jb-split">' + stEsc(split || 'outside every NK year') + '</p>' : '';
  // ── the money (= the booking in Controlling): one line once it moved · date + amount + one button before
  let money = '';
  if (!zero) {
    const ready = recv && !!dir && amt > 0, lockedIn = d => M.locked && !!d && scD(d) <= M.per.to;
    const pdV = b.pd || (recv ? cxToday() : ''), paV = b.pa ?? (amt || null);
    const c = scHgCat(s.k), ym = String(paid ? b.pabYm || b.pd || '' : pdV || '').slice(0, 7), bank = cxR((Number(paV) || 0) + (dir > 0 ? -pab : pab));
    const absHint = pab && paV ? '<p class="jb-split">' + stEsc((dir > 0 ? 'Received ' : 'Bank ') + scE(bank) + ' · the ' + scE(pab) + ' Abschlag ' +
      (paid && !b.pabAdd ? 'was already in ' : 'goes to ') + (c ? c.name : 'its cost type') + (ym ? ' in ' + SC_MONTHS_L[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4) : '')) + '</p>' : '';
    const mtBk = paid && scJaMt(scJaFindBk(b.ot));           // D39 (bug 24): paid with a Maintenance receipt → its date / amount belong to Maintenance
    const payDis = paid ? (lockedIn(b.pd) || pab || mtBk ? ' disabled' : '') : (ready ? '' : ' disabled');
    const fields = '<div class="jb-pay">' + f(dir > 0 ? 'Received on' : 'Paid on', '<input type="date" data-scja="pd"' + at + ' value="' + stEsc(pdV) + '"' + payDis + '/>') +
      f('Amount', '<span class="jb-amt"><input inputmode="decimal" autocomplete="off" data-scja="pa"' + at + ' value="' + (paV ? cxE2(paV) : '') + '" placeholder="0,00"' + payDis + '/><em>\u20ac</em></span>') +
      (paid ? '' : '<button type="button" class="jb-go" data-sc="jaPay"' + at + (ready && can && !scJaBusy(b.id) ? '' : ' disabled') + '><i class="ti ti-check" aria-hidden="true"></i> ' + (dir > 0 ? 'Received' : 'Paid') + '</button>') + '</div>';
    const pabF = (pab || opn('jaPab:')) ? '<div class="jb-g2 jb-pab">' + f(dir > 0 ? 'Abschlag kept from it' : 'Abschlag in the same payment',
      '<span class="jb-amt"><input inputmode="decimal" autocomplete="off" data-scja="pab"' + at + ' value="' + (pab ? cxE2(pab) : '') + '" placeholder="0,00"' + payDis + '/><em>\u20ac</em></span>') + '</div>' + absHint : '';
    if (paid) {
      const lk = opn('jaPayOpen:');
      money = '<div class="jb-money"><i class="ti ti-circle-check" aria-hidden="true"></i><span>' + stEsc((dir > 0 ? 'Received ' : 'Paid ') + stDate(b.pd) + ' · ' + scE(b.pa ?? amt) + absTxt) + '</span>' +
        tg('jaPayOpen:', lk ? 'done' : 'change', 'cx-link jb-ch') + '</div>' +
        (lk ? fields + pabF + (mtBk ? '<p class="jb-split">Paid with a Maintenance receipt \u2013 change its date or amount in Maintenance</p>' : '') + (lockedIn(b.pd) ? '' : '<button type="button" class="cx-link jb-undo" data-sc="jaPay"' + at + (scJaBusy(b.id) ? ' disabled' : '') + '>undo the payment</button>') : '');
    } else money = ready ? fields + pabF + (pab || opn('jaPab:') ? '' : tg('jaPab:', '+ Abschlag in the same payment', 'cx-link jb-add'))
      : '<p class="jb-split">first add: ' + stEsc([!recv ? 'received on' : '', !dir ? 'result' : '', !(amt > 0) ? 'amount' : ''].filter(Boolean).join(' · ')) + '</p>';
  }
  // ── in the NK · in the Belegliste (labelled chips) · ⋯ for company and remove
  const chip = (on, act, icon, t) => '<button type="button" class="jb-chip' + (on ? ' is-on' : '') + '" data-sc="' + act + '" data-id="' + stEsc(ln.id) + '" aria-pressed="' + !!on + '"' + dis + '>' +
    '<i class="ti ti-' + (on ? 'check' : icon) + '" aria-hidden="true"></i> ' + t + '</button>';
  const more = opn('jaMore:');
  const foot = '<div class="jb-foot">' + (ln ? chip(!!ln.on, 'hgtog', 'circle', 'In the NK') + chip(!!list[ln.id], 'hglist', 'list', 'Belegliste') : '') +
    tg('jaMore:', '<i class="ti ti-dots" aria-hidden="true"></i>', 'jb-more' + (more ? ' is-on' : '')) + '</div>' +
    (more ? '<div class="jb-moreb">' + f('Company', '<input type="text" autocomplete="off" data-scja="co"' + at + ' value="' + stEsc(b.co || '') + '"' + dis + '/>') +
      (can && !paid && !b.blank && !b.legacy ? '<button type="button" class="cx-link jb-rm" data-sc="jaDel"' + at + '>remove this bill</button>' : '') + '</div>' : '');
  return '<div class="jb">' + seg + top + zr + money + foot + '</div>';
}

/* ── actions ── */
function scJaCan(M) {
  if (M && M.locked) { stSay('House costs ' + SC.year + ' are locked – unlock them to change'); return false; }
  return true;
}
/* the bill as stored here — a Controlling booking or the empty block becomes a bill on the first change */
function scJaOwn(k, bid) {
  const r = scRecEnsure(SC.year), ja = (r.tenants.__ja = r.tenants.__ja || {}), list = (ja[k] = ja[k] || []);
  let e = list.find(x => x.id === bid);
  if (e) return e;
  const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const o = String(bid).indexOf('ot:') === 0 ? scJaFindBk(String(bid).slice(3)) : null;
  e = o ? { id, recv: scD(o.invoice_date), dir: Number(o.direction) === 1 ? 1 : -1, amt: cxR(Number(o.amount) || 0), co: o.company || '', ot: o.id,
            pd: scD(o.invoice_date), pa: cxR(Number(o.amount) || 0) }
        : { id, recv: null, dir: null, amt: null, co: scJaSupCo(SC.year, k), ot: null, pd: null, pa: null };
  list.push(e);
  (SC.jaIds = SC.jaIds || {})[bid] = id;
  if (SC.open['ja:' + bid]) SC.open['ja:' + id] = true;
  return e;
}
/* C6: this bill's money is being booked / taken off right now (under the id tapped, or the own id it got meanwhile) */
function scJaBusy(bid) {
  const B = SC.jaBusy || {}, m = SC.jaIds || {};
  return !!(B[bid] || (m[bid] && B[m[bid]]) || Object.keys(B).some(x => m[x] === bid));
}
/* redraw the tab + pop-up (after the field change has moved the focus: keep it on the same field) */
function scJaRefresh() {
  setTimeout(() => {
    const a = document.activeElement, f = a && a.dataset ? a.dataset.scja : null;
    let bid = f ? a.dataset.b : null;
    if (bid && SC.jaIds && SC.jaIds[bid]) bid = SC.jaIds[bid];
    stRenderCasaQuiet();
    if (f && bid) {
      const q = window.CSS && CSS.escape ? CSS.escape(bid) : bid;
      const el = document.querySelector('#scModal [data-scja="' + f + '"][data-b="' + q + '"]');
      if (el) { try { el.focus(); } catch (e) {} }
    }
  }, 0);
}
/* the one booking, kept in step in every loaded year and in Controlling's own list */
function scJaSync(row, goneId) {
  const id = String(row ? row.id : goneId);
  for (const y of Object.keys(SC.data)) {
    const d = SC.data[y]; if (!d) continue;
    d.one_time = (d.one_time || []).filter(o => String(o.id) !== id);
    if (row && d.per) { const day = scD(row.invoice_date); if (day >= d.per.from && day <= d.per.to) d.one_time.push(row); }
  }
  const L = (window._ctrl.one_time || []).filter(o => String(o.id) !== id);
  if (row && String(row.invoice_date).slice(0, 4) === String(window._ctrl.year)) L.push(row);
  window._ctrl.one_time = L;
  if (Array.isArray(SC.jaBk)) { SC.jaBk = SC.jaBk.filter(o => String(o.id) !== id); if (row && scJaIsBk(row)) SC.jaBk.push(row); }   // Nov 2026: all years
}
/* D39 (bug 26): a bill's NK line id changes when its money is booked ('ja:<bill>' → 'ot:<booking>') or undone —
   its "In the NK" (__hgOff) and Belegliste (__hgList) choices move with it, in every year that is not locked
   (a Zeitraum can touch two NK years). This year's record is saved by the caller; other years are saved here. */
function scJaRekey(from, to) {
  if (!from || !to || from === to) return;
  for (const r of SC.rows) {
    if (r.locked_at) continue;
    let ch = false;
    for (const f of ['__hgOff', '__hgList']) {
      const o = (r.tenants || {})[f];
      if (o && o[from] !== undefined) { if (o[to] === undefined) o[to] = o[from]; delete o[from]; ch = true; }
    }
    if (ch && Number(r.year) !== Number(SC.year)) scSaveRec(r).catch(e => stSay('Saving failed — ' + (e.message || e)));
  }
}
function scJaAdd(k) {
  if (!scJaCan(SC.model)) return;
  const r = scRecEnsure(SC.year), ja = (r.tenants.__ja = r.tenants.__ja || {});
  const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  (ja[k] = ja[k] || []).push({ id, recv: null, dir: null, amt: null, co: '', ot: null, pd: null, pa: null });
  SC.open['ja:' + id] = true; SC.open['ct:' + k] = true;     // Nov 2026: opens in place, in its cost type card
  scQueueSave(r); scJaRefresh();
}
async function scJaAct(a, btn) {
  const M = SC.model, k = btn.dataset.k, bid = btn.dataset.b;
  const cur = scJaBills(SC.year, k).find(x => x.id === bid) || { id: bid, blank: true };
  if (a === 'jaPay') {                                     // C6: one booking / undo per bill at a time — a redraw meanwhile
    if (scJaBusy(bid)) return;                             // (a field left, ⋯, the Abschlag read) must not give the button back
    const busy = SC.jaBusy || (SC.jaBusy = {});
    busy[bid] = true; btn.disabled = true;
    try { return await (cur.paid ? scJaUnpay(k, bid, cur) : scJaPay(k, bid, cur, btn)); }
    finally { delete busy[bid]; scJaRefresh(); }
  }
  if (!scJaCan(M)) return;
  if (a === 'jaRecv') {
    if (cur.recv && cur.paid) { stSay('Switch off \u201c' + (Number(cur.dir) === 1 ? 'Money received' : 'Money paid') + '\u201d first'); return; }
    const e = scJaOwn(k, bid);
    e.recv = e.recv ? null : cxToday();
    scQueueSave(scRecEnsure(SC.year)); return scJaRefresh();
  }
  if (a === 'jaDir') {
    const e = scJaOwn(k, bid), v = Number(btn.dataset.v) === 1 ? 1 : Number(btn.dataset.v) === 0 ? 0 : -1;
    if (e.dir === v) return;
    if (v === 0) {                                         // Nov 2026: balanced (0,00 €) — nothing booked, so no money may be booked yet
      if (e.ot !== null && e.ot !== undefined) { stSay('Switch off \u201c' + (Number(e.dir) === 1 ? 'Money received' : 'Money paid') + '\u201d first'); return scJaRefresh(); }
      e.dir = 0; e.amt = null; e.pd = null; e.pa = null; e.pab = null;
      scQueueSave(scRecEnsure(SC.year)); return scJaRefresh();
    }
    e.dir = v;
    if (e.ot !== null && e.ot !== undefined) {               // paid already → the booking turns with it
      try { scJaSync(await ctlUpdateOneTime(e.ot, { direction: v })); } catch (err) { stSay('Could not change it in Controlling — ' + (err.message || err)); }
    }
    scQueueSave(scRecEnsure(SC.year)); return scJaRefresh();
  }
  if (a === 'jaZok') {                                     // Nov 2026: the suggested Abrechnungszeitraum is the one on the bill
    const e = scJaOwn(k, bid), z = scJaZr(k, e, e.ot !== null && e.ot !== undefined ? scJaFindBk(e.ot) : null);
    if (!z) return;
    e.from = z.from; e.to = z.to;
    await scJaMirror(e);
    scQueueSave(scRecEnsure(SC.year)); stSay('Abrechnungszeitraum confirmed'); return scJaRefresh();
  }
  if (a === 'jaDel') {
    const r = scRecEnsure(SC.year), ja = r.tenants.__ja || {}, list = ja[k] || [];
    const e = list.find(x => x.id === bid); if (!e || (e.ot !== null && e.ot !== undefined)) return;
    if ((e.recv || e.amt) && !(await stConfirm({ title: 'Remove this Jahresabrechnung?', text: 'Only here – nothing was booked in Controlling for it.', ok: 'Remove', danger: true }))) return;
    ja[k] = list.filter(x => x.id !== bid);
    scQueueSave(r); return scJaRefresh();
  }
}
/* Nov 2026 · a cost type's running cost of one month (Controlling › Expenses), any year — read / set (0 → removed) */
async function scJaRunAt(catId, ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const { data, error } = await _ctlSupa.from('ctrl_expense_castel').select('*').eq('category_id', catId).eq('year', y).eq('month', m);
  if (error) throw error;
  return cxR((data || []).reduce((a, r) => a + (Number(r.amount) || 0), 0));
}
async function scJaRunSet(catId, ym, amount) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  let row = null;
  if (amount > 0.004) {
    const r = await _ctlSupa.from('ctrl_expense_castel').upsert({ category_id: catId, year: y, month: m, amount }, { onConflict: 'category_id,year,month' }).select().single();
    if (r.error) throw r.error; row = r.data;
  } else {
    const r = await _ctlSupa.from('ctrl_expense_castel').delete().eq('category_id', catId).eq('year', y).eq('month', m);
    if (r.error) throw r.error;
  }
  const same = x => Number(x.category_id) === Number(catId) && Number(x.year) === y && Number(x.month) === m;
  for (const k of Object.keys(SC.data)) {                  // every loaded NK year that reads that month
    const d = SC.data[k]; if (!d || !Array.isArray(d.castel_expenses)) continue;
    const had = d.castel_expenses.some(same);
    d.castel_expenses = d.castel_expenses.filter(x => !same(x));
    if (row && (had || (d.per && ym >= d.per.from.slice(0, 7) && ym <= d.per.to.slice(0, 7)))) d.castel_expenses.push(row);
  }
  if (window._ctrl && Array.isArray(window._ctrl.castel_expenses) && Number(window._ctrl.year) === y) {
    window._ctrl.castel_expenses = window._ctrl.castel_expenses.filter(x => !same(x));
    if (row) window._ctrl.castel_expenses.push(row);
  }
  return row;
}
/* Money switch on: the one booking in Controlling › One-off (an identical one already there is used instead) */
async function scJaPay(k, bid, cur, btn) {
  const M = SC.model, c = scHgCat(k); if (!c) return;
  const dir = Number(cur.dir) === 1 ? 1 : Number(cur.dir) === -1 ? -1 : 0, amt = Number(cur.amt) || 0;
  if (!cur.recv || !dir || !(amt > 0)) { stSay('First add: ' + [!cur.recv ? 'received date' : '', !dir ? 'result' : '', !(amt > 0) ? 'amount' : ''].filter(Boolean).join(' · ')); return; }
  const q = window.CSS && CSS.escape ? CSS.escape(bid) : bid;
  const val = f => { const el = document.querySelector('#scModal [data-scja="' + f + '"][data-b="' + q + '"]'); return el ? el.value : ''; };
  const date = scD(val('pd')) || cxToday();
  const pn = cxParse(val('pa')), pay = pn === null || !(pn > 0) ? cxR(amt) : cxR(pn);
  const bn = cxParse(val('pab')), pab = bn === null || !(bn > 0) ? 0 : cxR(bn);   // Nov 2026: the next Abschlag taken with it
  if (M && M.locked && date <= M.per.to) { stSay('House costs ' + SC.year + ' are locked – unlock them, or use a date after ' + stDate(M.per.to)); return; }
  const ym = date.slice(0, 7);
  let absBefore = 0, absAdd = pab;
  if (pab) {
    try { absBefore = await scJaRunAt(c.id, ym); } catch (err) { stSay('Could not read Controlling › Expenses — ' + (err.message || err)); return; }
    if (absBefore > 0.004 && !(await stConfirm({ title: 'Abschlag already booked?',
        text: c.name + ' ' + SC_MONTHS_L[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4) + ' already has ' + scE(absBefore) + ' in Controlling › Expenses. Add the ' + scE(pab) + ' Abschlag from this payment to it?',
        ok: 'Add it', cancel: 'It\u2019s already in' }))) absAdd = 0;
  }
  const own = scJaOwnerYears();
  const all = Object.keys(SC.data).reduce((x, y) => x.concat((SC.data[y] || {}).one_time || []), []).concat(window._ctrl.one_time || []);
  // D39 (bug 24): a Maintenance line can be the same payment too (it is linked, never changed) — then its direction has to match
  const dup = all.find(o => Number(o.property_id) === CASA_PROP_ID && (o.kind === 'Versorger' || o.kind === 'Rechnung') && Number(o.nk_category_id) === Number(c.id) &&
                            Math.abs(Number(o.amount) - pay) < 0.005 && scD(o.invoice_date) === date && own[String(o.id)] === undefined && String(cur.id) !== 'ot:' + o.id &&
                            (!scJaMt(o) || (Number(o.direction) === 1 ? 1 : -1) === dir));
  if (dup && !(await stConfirm({ title: 'Already in Controlling', text: c.name + ' · ' + scE(pay) + ' · ' + stDate(date) + ' is already booked in Controlling › One-off. Use that entry instead of booking it twice?', ok: 'Use it' }))) return;
  const e = scJaOwn(k, bid);
  e.pd = date; e.pa = pay; e.pab = pab || null;
  if (btn) btn.disabled = true;
  let row;
  try {
    if (dup) {
      const fix = {};
      if (!scJaMt(dup)) {                                  // D39 (bug 24): a Maintenance line stays as Maintenance books it
        if (!dup.nk_umlage) fix.nk_umlage = true;
        if (dup.kind !== 'Versorger') fix.kind = 'Versorger';
        if (Number(dup.direction) !== dir) fix.direction = dir;
      }
      row = Object.keys(fix).length ? await ctlUpdateOneTime(dup.id, fix) : dup;
    } else {
      row = await ctlAddOneTime({ property_id: CASA_PROP_ID, invoice_date: date, item: c.name + ' · Jahresabrechnung', company: e.co || null, amount: pay,
                                  kind: 'Versorger', direction: dir, nk_umlage: true, nk_category_id: c.id, source_ref: 'ja:' + e.id,
                                  nk_from: e.from || null, nk_to: e.to || null });       // Nov 2026: its Abrechnungszeitraum (when typed)
    }
  } catch (err) { if (btn) btn.disabled = false; stSay('Could not book it in Controlling — ' + (err.message || err)); return; }
  e.ot = row.id; scJaSync(row);
  scJaRekey('ja:' + e.id, 'ot:' + row.id);                 // D39 (bug 26): "In the NK" / Belegliste follow the new line id
  if (dup && e.from && e.to) await scJaMirror(e);
  e.pabYm = pab ? ym : null; e.pabAdd = null;
  if (absAdd) {                                            // the Abschlag → the cost type's running cost of that month
    try { await scJaRunSet(c.id, ym, cxR(absBefore + absAdd)); e.pabAdd = absAdd; }
    catch (err) { stSay('Abschlag not added in Controlling › Expenses — ' + (err.message || err)); }
  }
  try { await scSaveRec(scRecEnsure(SC.year)); } catch (err) { stSay('Saving failed — ' + (err.message || err)); }
  stSay((dir > 0 ? 'Guthaben booked in Controlling' : 'Nachzahlung booked in Controlling') + (e.pabAdd ? ' · Abschlag added to ' + c.name : ''));
  scJaRefresh();
}
/* Money switch off: the booking goes (it is the same entry) — the bill stays as received */
async function scJaUnpay(k, bid, cur) {
  const M = SC.model;
  if (M && M.locked && cur.pd && scD(cur.pd) <= M.per.to) { stSay('House costs ' + SC.year + ' are locked – unlock them to change'); return; }
  const e0 = scJaOwn(k, bid), c = scHgCat(k), back = Number(e0.pabAdd) || 0;
  const mt = scJaMt(scJaFindBk(e0.ot));                   // D39 (bug 24): a Maintenance receipt is only unlinked — it stays in Maintenance and Controlling
  const absTxt = back && c && e0.pabYm ? ' The ' + scE(back) + ' Abschlag comes off ' + c.name + ' ' + SC_MONTHS_L[Number(e0.pabYm.slice(5, 7)) - 1] + ' ' + e0.pabYm.slice(0, 4) + ' in Controlling › Expenses.' : '';
  if (!(await stConfirm({ title: 'Remove the payment?', text: (mt ? 'The payment is a Maintenance receipt (' + stDate(cur.pd) + ' · ' + scE(cur.pa ?? cur.amt) + ') – it stays in Maintenance and Controlling, only the link to this bill goes.'
      : 'The booking in Controlling › One-off (' + stDate(cur.pd) + ' · ' + scE(cur.pa ?? cur.amt) + ') is deleted too – it is the same entry.') + absTxt, ok: 'Remove', danger: true }))) return;
  const e = scJaOwn(k, bid), id = e.ot;
  if (!mt) { try { await ctlDeleteOneTime(id); } catch (err) { stSay('Could not remove it in Controlling — ' + (err.message || err)); return; } }
  if (!mt) scJaSync(null, id);
  e.ot = null;
  scJaRekey('ot:' + id, 'ja:' + e.id);                     // D39 (bug 26): the switches go back to the bill's own id
  if (back && c && e.pabYm) {                              // Nov 2026: the Abschlag added with it comes off again
    try { const now = await scJaRunAt(c.id, e.pabYm); await scJaRunSet(c.id, e.pabYm, cxR(Math.max(0, now - back))); }
    catch (err) { stSay('Abschlag not taken off in Controlling › Expenses — ' + (err.message || err)); }
  }
  e.pabAdd = null; e.pabYm = null;
  try { await scSaveRec(scRecEnsure(SC.year)); } catch (err) { stSay('Saving failed — ' + (err.message || err)); }
  scJaRefresh();
}
/* Nov 2026 · a gap without a bill (e.g. a supplier that sent none): the NK year counts as complete there */
function scJaNoBill(a, b) {
  if (!scJaCan(SC.model)) return;
  const r = scRecEnsure(SC.year), nb = (r.tenants.__noBill = r.tenants.__noBill || {}), k = b.dataset.k, list = (nb[k] = nb[k] || []);
  if (a === 'jaNoBill') list.push({ from: b.dataset.f, to: b.dataset.t, at: cxToday() });
  else { list.splice(Number(b.dataset.i), 1); if (!list.length) delete nb[k]; }
  scQueueSave(r); stRenderCasaQuiet();
}
/* A field changed (saved on leaving the field) */
async function scJaInput(el) {
  const M = SC.model, f = el.dataset.scja, k = el.dataset.k, bid = el.dataset.b;
  const cur = scJaBills(SC.year, k).find(x => x.id === bid) || { id: bid, blank: true };
  if (f === 'pd' || f === 'pa' || f === 'pab') {
    if (f === 'pab' && cur.paid) return scJaRefresh();     // booked: switch the money off to change it
    if (!cur.paid) {                                       // not paid yet: only what the switch will use
      const e = scJaOwn(k, bid);
      if (f === 'pd') e.pd = scD(el.value) || null;
      else if (f === 'pab') { const n = cxParse(el.value); e.pab = n === null || !(n > 0) ? null : cxR(n); }
      else { const n = cxParse(el.value); e.pa = n === null || !(n > 0) ? null : cxR(n); }
      scQueueSave(scRecEnsure(SC.year)); return scJaRefresh();
    }
    // paid: the same booking moves / changes (never a second one)
    const fields = {};
    if (f === 'pd') { const d = scD(el.value); if (!d) return scJaRefresh(); fields.invoice_date = d; }
    else { const n = cxParse(el.value); if (n === null || !(n > 0)) { stSay('Enter the amount'); return scJaRefresh(); } fields.amount = cxR(n); }
    if (M && M.locked && (scD(cur.pd) <= M.per.to || (fields.invoice_date && fields.invoice_date <= M.per.to))) { stSay('House costs ' + SC.year + ' are locked – unlock them to change'); return scJaRefresh(); }
    const e = scJaOwn(k, bid);
    if (scJaMt(scJaFindBk(e.ot))) { stSay('This payment is a Maintenance receipt – change its date or amount in Maintenance'); return scJaRefresh(); }   // D39 (bug 24)
    try { const row = await ctlUpdateOneTime(e.ot, fields); scJaSync(row); e.pd = scD(row.invoice_date); e.pa = cxR(Number(row.amount) || 0); }
    catch (err) { stSay('Could not change it in Controlling — ' + (err.message || err)); }
    scQueueSave(scRecEnsure(SC.year)); return scJaRefresh();
  }
  if (!scJaCan(M)) return scJaRefresh();
  if (f === 'zf' || f === 'zt') {                          // Nov 2026: the Abrechnungszeitraum from the bill (emptied → suggested again)
    const e = scJaOwn(k, bid), z = scJaZr(k, e, e.ot !== null && e.ot !== undefined ? scJaFindBk(e.ot) : null) || {}, v = scD(el.value) || null;
    if (!v) { delete e.from; delete e.to; }
    else {
      const from = f === 'zf' ? v : (e.from || z.from), to = f === 'zt' ? v : (e.to || z.to);
      if (!from || !to || to < from) { stSay('The Abrechnungszeitraum has to end after it starts'); return scJaRefresh(); }
      e.from = from; e.to = to;
    }
    await scJaMirror(e);
    scQueueSave(scRecEnsure(SC.year)); return scJaRefresh();
  }
  const e = scJaOwn(k, bid), linked = e.ot !== null && e.ot !== undefined;
  const hasBk = linked && !scJaMt(scJaFindBk(e.ot));      // D39 (bug 24): a Maintenance receipt is not changed from here
  if (f === 'amt') {
    const n = cxParse(el.value), old = Number(e.amt) || 0;
    e.amt = n === null || !(n > 0) ? null : cxR(n);
    if (hasBk && e.amt && Math.abs((Number(cur.pa) || 0) - old) < 0.005) {   // the payment was the bill's amount → it follows
      try { const row = await ctlUpdateOneTime(e.ot, { amount: e.amt }); scJaSync(row); e.pa = e.amt; } catch (err) { stSay('Could not change it in Controlling — ' + (err.message || err)); }
    }
  } else if (f === 'recv') {
    const d = scD(el.value) || null;
    if (!d && linked) { stSay('Switch off \u201c' + (Number(e.dir) === 1 ? 'Money received' : 'Money paid') + '\u201d first'); return scJaRefresh(); }
    e.recv = d;
  } else if (f === 'co') {
    e.co = String(el.value || '').trim();
    if (hasBk) { try { scJaSync(await ctlUpdateOneTime(e.ot, { company: e.co || null })); } catch (err) {} }
  }
  scQueueSave(scRecEnsure(SC.year)); return scJaRefresh();
}

/* ── House costs (Nov 2026 · one pop-up: the Jahresabrechnungen are part of their cost type) ─────────────
   Paid during the year (Controlling) → Jahresabrechnungen netted against it → the result per cost type →
   all house costs ÷ all months lived = the price per month → lock. Each fact once; tags only where you're needed.
   A bill is edited in place under its row (one level); bills that came in another year link to that year. */
function scCtLines(M) {                                    // the NK lines, split: Strom · Gas · Wasser · Entsorgung | everything else
  const lines = M.R.lines || [], used = new Set(), types = [];
  for (const [k, l] of SC_HG_TYPES) {
    const c = scHgCat(k); if (!c) continue;
    const mine = ln => Number(ln.catId) === Number(c.id) || (ln.group === 'hausgeld' && ln.catId == null && String(ln.label || '').toLowerCase().startsWith(k));
    const paidL = lines.filter(ln => (ln.group === 'running' || ln.group === 'oneoff') && Number(ln.catId) === Number(c.id));
    const jaL = lines.filter(ln => ln.group === 'hausgeld' && mine(ln));
    paidL.concat(jaL).forEach(ln => used.add(ln.id));
    const paid = cxR(paidL.reduce((a, x) => a + x.total, 0)), ja = cxR(jaL.reduce((a, x) => a + x.total, 0));
    types.push({ k, l, c, paid, ja, total: cxR(paid + ja), hasJa: jaL.length > 0, paidL,
                 hg: (M.money.hgAll || []).filter(h => (h.info || {}).k ? h.info.k === k : mine(h)) });
  }
  types.sort((a, b) => scCatOrd(a.c.id) - scCatOrd(b.c.id));      // Nov 2026: Wasser · Entsorgung · Strom · Gas (the one order)
  return { types, other: lines.filter(ln => !used.has(ln.id)) };
}
function scCostsView(M) {
  const R = M.R, Lc = R.check, lnd = R.landlord, can = !M.locked, q = M.quota || {};
  const nf = (v, d) => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const has = R.lines.length > 0, hasList = R.lines.some(l => l.group !== 'running');
  // ── top: the total · ÷ months lived = the price per month
  const hero = stMHero({ tone: 'none', label: 'House costs ' + M.y, amount: has ? Lc.total : null,   // Nov 2026: option C
    chips: has && M.method === 'quota' && q.months ? [['Months lived', scMo(q.months), '#D7CCEA'], ['per month', scE(q.rate), '#E8C98F']] : [],
    sub: !has ? 'nothing booked in Controlling for ' + stPer(M.per.from, M.per.to) + ' yet'
      : M.locked ? 'locked ' + scDate(M.rec.locked_at) + ' · the letters use this snapshot' : M.pv ? 'preview as of ' + stDe(M.pv.cutoff) : M.method === 'quota' ? '' : 'split day by day among the people living there' });
  const gaps = M.locked || M.running ? [] : (M.jaGaps || []);
  const lockRow = stMRow({ icon: 'lock', title: M.locked ? 'House costs locked' : 'Lock house costs', on: M.locked,
    disabled: !M.locked && (!M.sendable || !has || gaps.length > 0),
    sub: M.locked ? 'locked ' + scDate(M.rec.locked_at) + ' · letters can be sent' : M.running ? 'lock after ' + stDe(M.per.to) : !has ? 'nothing to lock yet'
      : gaps.length ? (gaps.length === 1 ? 'waiting for the ' + gaps[0].l + ' bill' : 'waiting for ' + gaps.length + ' bills') + ' · see below' : 'all bills in · then the letters can be sent',
    right: hasList ? '<button type="button" class="mx-pill" data-sc="listPdf">' + stIc('doc', 15) + 'Belegliste</button>' : '',
    switchAttrs: M.locked ? 'data-sc="unlock"' : 'data-sc="lock"' });
  const warn = (can && M.warn.length ? '<div class="srm__banner is-warn"><div><p class="srm__banner-t">Please check</p><p class="srm__banner-s">' + M.warn.map(stEsc).join('<br/>') + '</p></div></div>' : '') +
    (scRetOld(M) ? '<div class="srm__banner is-warn"><div><p class="srm__banner-t">Locked before the returns rule</p><p class="srm__banner-s">' + stEsc(SC_RET_OLD) + '</p></div></div>' : '');
  const planned = !M.locked && M.input.planned ? M.input.planned : [];
  const plTag = catId => { const p = planned.find(x => Number(x.catId) === Number(catId)); return p ? '<span class="sc-ja__sg">incl. planned ' + stEsc(SC_MONTHS[Number(p.month.slice(5, 7)) - 1]) + '</span>' : ''; };
  const paidLbl = M.pv ? 'Paid until ' + stDate(M.pv.cutoff) : 'Paid in ' + M.y;
  const { types, other } = scCtLines(M);
  const J = scJaModel(M), own = scJaOwnerYears(), since = scJaSince(), zeros = scJaAll().filter(b => b.zero);
  const nb = ((M.rec && M.rec.tenants) || {}).__noBill || {}, gapsAll = M.jaGaps || [];
  const val = v => '<em class="sc-ct__v ' + (v < -0.004 ? 'pos' : v > 0.004 ? 'neg' : 'mut') + '">' + (v < -0.004 ? '−' : v > 0.004 ? '+' : '') + scE(Math.abs(v)) + '</em>';   // − Guthaben · + Nachzahlung
  // Nov 2026 · a Maintenance receipt counts at its net price; its returns show under it with the switch (your screen only).
  // Locked: no switch, and each return says whether the snapshot holds it (gross today − the frozen line)
  const otOf = ln => String(ln.id || '').indexOf('ot:') === 0 ? (((SC.data[M.y] || {}).one_time) || []).find(o => 'ot:' + o.id === String(ln.id)) || null : null;
  const retRows = ln => {
    const o = otOf(ln); if (!o || !o.maint_cost_id || typeof stRetRowsHtml !== 'function') return '';
    return stRetRowsHtml(o.maint_cost_id, { locked: M.locked ? 'locked' : '', gross: Math.abs(Number(o.amount) || 0), frozen: Math.abs(Number((ln.info || {}).amount ?? ln.total) || 0) });
  };
  // a Versorger cost type (Strom · Gas · Wasser · Entsorgung): its Maintenance receipts with returns, under "Paid in …"
  const typeRet = t => (t.paidL || []).map(ln => { const r = retRows(ln); return r ? '<div class="sc-ct__rr"><div class="sc-ct__l"><span>' + stEsc(ln.label) + '</span><span>' + scE(ln.total) + '</span></div>' + r + '</div>' : ''; }).join('');
  // ── one card per Versorger cost type
  const typeCard = t => {
    const S = J.S.find(x => x.k === t.k) || { k: t.k, l: t.l, icon: SC_JA_ICON[t.k] || 'receipt', bills: [], real: [], st: 'none', exp: null };
    const ownBills = scJaBills(M.y, t.k, own);
    const rows = [], shown = new Set();
    const billRow = (key, bid, ownY, head, tags, small, value, line) => {
      const mine = Number(ownY) === Number(M.y), ob = mine ? ownBills.find(x => String(x.id) === String(bid)) : null, open = ob && !!SC.open['ja:' + bid];
      if (ob) shown.add(String(ob.id));
      const other = !mine && ownY ? ' · <button type="button" class="cx-link sc-jn__go" data-sc="jaYear" data-y="' + Number(ownY) + '">came in ' + Number(ownY) + ' \u203a</button>' : '';
      const inner = '<span class="sc-ct__m"><b>' + stEsc(head) + tags + '</b><small>' + stEsc(small) + other + '</small></span>' + value;
      rows.push([key, (ob ? '<button type="button" class="sc-ct__r' + (open ? ' is-open' : '') + '" data-sc="jaFold" data-k="' + t.k + '" data-b="' + stEsc(bid) + '" aria-expanded="' + open + '">' + inner + '</button>'
                         : '<div class="sc-ct__r">' + inner + '</div>') +
        (open ? '<div class="sc-ct__ed">' + scJaBillHtml(M, S, ob, can, { line }) + '</div>' : '')]);
    };
    for (const h of t.hg) {
      const i = h.info || {}, full = Number(i.full ?? i.amount) || 0;
      billRow(String(i.from || ''), i.bid, i.y, i.from && i.to ? scJaSpan(i.from, i.to) : h.label,
        (i.ok === false ? '<span class="sc-ja__sg">suggested</span>' : '') + (h.on ? '' : '<span class="sc-ct__off">not in the NK</span>'),
        (full < 0 ? 'Guthaben ' : 'Nachzahlung ') + scE(Math.abs(full)) + (i.days && i.of ? ' · ' + i.days + ' of ' + i.of + ' days' : ''), val(Number(i.amount) || 0), h);
    }
    for (const b of zeros.filter(x => x.k === t.k)) {
      let f = b.from > M.per.from ? b.from : M.per.from; if (since && f < since) f = since;
      const to = b.to < M.per.to ? b.to : M.per.to; if (f > to) continue;
      billRow(String(b.from), b.bid, b.y, scJaSpan(b.from, b.to), b.ok === false ? '<span class="sc-ja__sg">suggested</span>' : '',
        'balanced · ' + NkCasa.daysBetween(f, to) + ' of ' + NkCasa.daysBetween(b.from, b.to) + ' days', '<em class="sc-ct__v mut">' + scE(0) + '</em>', null);
    }
    for (const g of gapsAll.filter(x => x.k === t.k)) rows.push([g.from, '<div class="sc-ct__r is-gap"><span class="sc-ct__m"><b>' + stEsc(scJaSpan(g.from, g.to)) +
      (M.running ? '' : '<span class="sc-ct__ms">missing</span>') + '</b><small>' + stEsc((M.running ? 'still to come' : g.late ? 'overdue' : 'not in yet') + (g.expTxt ? ' · ' + g.expTxt : '')) +
      (can && !M.running ? ' · <button type="button" class="cx-link sc-jn__nb" data-sc="jaNoBill" data-k="' + t.k + '" data-f="' + g.from + '" data-t="' + g.to + '">no bill</button>' : '') + '</small></span><em class="sc-ct__v mut">\u2014</em></div>']);
    (nb[t.k] || []).forEach((x, i) => rows.push([String(x.from || ''), '<div class="sc-ct__r is-nb"><span class="sc-ct__m"><b>' + stEsc(scJaSpan(x.from, x.to)) + '</b><small>no bill – marked by you' +
      (can ? ' · <button type="button" class="cx-link sc-jn__nb" data-sc="jaNoBillUndo" data-k="' + t.k + '" data-i="' + i + '">undo</button>' : '') + '</small></span><em class="sc-ct__v mut">\u2014</em></div>']));
    // this year's bills that count in no line here (not received yet, or for another NK year)
    for (const b of ownBills.filter(x => !shown.has(String(x.id)))) {
      const open = !!SC.open['ja:' + b.id], z = (b.recv || b.paid) ? scJaZr(t.k, b, b.ot != null ? scJaFindBk(b.ot) : null) : null;
      const head = z ? scJaSpan(z.from, z.to) : 'New Jahresabrechnung', small = !b.recv && !b.paid ? 'not received yet' : 'counts in another NK year';
      rows.push(['9999' + b.id, '<button type="button" class="sc-ct__r' + (open ? ' is-open' : '') + '" data-sc="jaFold" data-k="' + t.k + '" data-b="' + stEsc(b.id) + '" aria-expanded="' + open + '"><span class="sc-ct__m"><b>' + stEsc(head) + '</b><small>' + stEsc(small) + '</small></span><em class="sc-ct__v mut">\u2014</em></button>' +
        (open ? '<div class="sc-ct__ed">' + scJaBillHtml(M, S, b, can, { line: null }) + '</div>' : '')]);
    }
    const attn = gapsAll.some(g => g.k === t.k) || t.hg.some(h => (h.info || {}).ok === false) || ownBills.some(b => !scJaDone(b));
    const open = SC.open['ct:' + t.k] !== undefined ? !!SC.open['ct:' + t.k] : attn;
    const co = scJaSupCo(M.y, t.k, own);
    const head = '<button type="button" class="sc-ct__h" data-sc="fold" data-k="ct:' + t.k + '" aria-expanded="' + open + '"><span class="mx-ic sc-ct__ic" style="background:' + (ST_TINT[S.icon] || '#F3EEE6') + '">' + stIc(S.icon, 20) + '</span>' +
      '<span class="sc-ct__n">' + stEsc(t.l + (co ? ' · ' + co : '')) + '</span><span class="sc-ct__t">' + scE(t.total) + '</span><i class="ti ti-chevron-' + (open ? 'up' : 'down') + '" aria-hidden="true"></i></button>';
    const sum = '<div class="sc-ct__l"><span>' + stEsc(paidLbl) + plTag(t.c.id) + '</span><span>' + scE(t.paid) + '</span></div>' +
      '<div class="sc-ct__l"><span>Jahresabrechnungen</span><span class="' + (t.ja < -0.004 ? 'pos' : t.ja > 0.004 ? 'neg' : '') + '">' + (t.hasJa ? (t.ja < -0.004 ? '−' : t.ja > 0.004 ? '+' : '') + scE(Math.abs(t.ja)) : '\u2014') + '</span></div>' + typeRet(t);
    const body = open ? '<div class="sc-ct__b">' + rows.sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1]).join('') +
      (can ? '<button type="button" class="cx-link sc-ct__add" data-sc="jaAdd" data-k="' + t.k + '"><i class="ti ti-plus" aria-hidden="true"></i> Jahresabrechnung</button>' : '') + '</div>' : '';
    return '<div class="sc-ct">' + head + sum + body + '</div>';
  };
  // ── other house costs: one line each (one-offs and typed costs tagged)
  const pos = ((scRec(M.y) || {}).tenants || {}).__pos || [];
  const oRow = ln => {
    const i = ln.info || {}, tag = ln.group === 'oneoff' ? '<span class="sc-ct__tg">one-off</span>' : ln.group === 'typed' ? '<span class="sc-ct__tg">typed</span>' : ln.group === 'hausgeld' ? '<span class="sc-ct__tg">Jahresabrechnung</span>' : plTag(ln.catId);
    const sub = ln.group === 'oneoff' && i.date ? 'paid ' + stDate(i.date) : '';
    return '<div class="sc-ct__o"><span class="sc-ct__m"><b>' + stEsc(ln.label) + tag + '</b>' + (sub ? '<small>' + stEsc(sub) + '</small>' : '') + '</span><span>' + scE(ln.total) + '</span></div>' + retRows(ln);
  };
  const oSum = cxR(other.reduce((a, x) => a + x.total, 0)), editOpen = !!SC.open['ct:typed'];
  // Nov 2026 · a receipt returned in full: in no line, never in a letter — here (0,00 €) with its returns and switches
  const zRows = typeof stRetZeroHtml === 'function' ? ((M.input && M.input.retZero) || []).map(z =>
    stRetZeroHtml(z.label, 'paid ' + stDate(z.date) + ' · returned in full · not in the NK', z.mc, { locked: M.locked ? 'locked' : '', gross: z.gross, frozen: 0 })).join('') : '';
  const otherCard = other.length || can || zRows ? '<p class="mx-lbl">Other house costs</p><div class="sc-ct sc-ct--o">' +
    other.slice().sort((a, b) => scCatOrd(a.catId) - scCatOrd(b.catId) || (a.group === 'running' ? 0 : 1) - (b.group === 'running' ? 0 : 1) || b.total - a.total).map(oRow).join('') +   // Nov 2026: the one order
    zRows + (other.length ? '<div class="sc-ct__o is-sum"><span>Other house costs</span><span>' + scE(oSum) + '</span></div>' : '<p class="sc-ct__none">Nothing else booked yet.</p>') +
    (can ? '<button type="button" class="cx-link sc-ct__add" data-sc="fold" data-k="ct:typed"><i class="ti ti-' + (editOpen ? 'minus' : 'plus') + '" aria-hidden="true"></i> ' + (editOpen ? 'Done' : pos.length ? 'Add or change a cost' : 'Add a cost') + '</button>' : '') +
    '</div>' + (can && editOpen ? scTypedHtml(M) : '') : '';
  // ── who carries it
  const anySent = M.ten.some(t => t.k === 'sent' || (t.k === 'done' && !t.skipped));
  const kurzC = M.method === 'quota' ? cxR(lnd.pauschalCovered || 0) : 0, youV = cxR((Lc.landlord || 0) - kurzC);   // Nov 2026: you at 0
  const youSub = M.method === 'quota' ? (Math.abs(youV) > 0.004 ? (M.quota && !M.quota.months ? 'nobody on Kalt + NK in this period' : 'rounding') : '')
    : [lnd.pauschal ? 'Pauschal tenants ' + scE(lnd.pauschal) : '', lnd.vacancy ? 'empty days ' + scE(lnd.vacancy) : '', Math.abs(lnd.rounding || 0) > 0.004 ? 'rounding ' + scE(lnd.rounding) : ''].filter(Boolean).join(' · ');
  const who = has ? '<p class="mx-lbl">Who carries it</p><div class="sc-ct sc-ct--o">' +
    '<div class="sc-ct__o"><span>Tenants</span><span>' + scE(Lc.allocated) + '</span></div>' +
    (kurzC ? '<div class="sc-ct__o"><span class="sc-ct__m"><b>Kurzzeitvermietung</b><small>NK inside the Pauschalen</small></span><span>' + scE(kurzC) + '</span></div>' : '') +
    '<div class="sc-ct__o"><span class="sc-ct__m"><b>You</b>' + (youSub ? '<small>' + stEsc(youSub) + '</small>' : '') + '</span><span>' + scE(M.method === 'quota' ? youV : Lc.landlord) + '</span></div>' +
    '<p class="sr-okline' + (Lc.ok ? '' : ' is-warn') + '"><i class="ti ti-' + (Lc.ok ? 'check' : 'alert-triangle') + '" aria-hidden="true"></i> ' + (Lc.ok ? 'adds up' : 'does not add up') + '</p>' +
    (anySent ? '<p class="sc-ct__none">Letters already sent – the split stays as it is.</p>' : '') + '</div>' : '';
  void nf;
  return stMHead('House costs ' + M.y, 'Casa Castel · ' + stNkLabel(M.per.from, M.per.to), 'house', 'data-sc="close"') +
    '<div class="srm__b mx-b">' + hero + '<div class="mx-rows">' + lockRow + '</div>' + warn +
    (types.length ? '<p class="mx-lbl">With Jahresabrechnung</p>' +
      (J.n && J.net !== null && J.net !== undefined ? '<p class="sc-ct__q">' + stEsc('Paid in ' + M.y + ': ' + (J.net > 0.004 ? 'Guthaben ' : J.net < -0.004 ? 'Nachzahlung ' : 'balanced ') + (Math.abs(J.net) > 0.004 ? scE(Math.abs(J.net)) : '') + ' · ' + J.nIn + ' of ' + J.n + ' in') + '</p>' : '') +   // Nov 2026: the supplier money of the year (also on the tile)
      types.map(typeCard).join('') : '') + otherCard + who + '</div>';
}
/* The add form for a Jahresabrechnung (books into Controlling: One-off · Versorger) */
function scHgForm() {
  const f = SC.hgNew;
  const typeSeg = SC_HG_TYPES.filter(([k]) => scHgCat(k)).map(([k, l]) => '<button type="button" class="st-seg__b' + (f.type === k ? ' is-on' : '') + '" data-sc="hgNewSet" data-f="type" data-v="' + k + '" aria-pressed="' + (f.type === k) + '">' + l + '</button>').join('');
  const dirSeg = [['1', 'Guthaben', 'you get'], ['-1', 'Nachzahlung', 'you pay']].map(([v, l, sm]) => '<button type="button" class="st-seg__b' + (String(f.dir) === v ? ' is-on' : '') + '" data-sc="hgNewSet" data-f="dir" data-v="' + v + '" aria-pressed="' + (String(f.dir) === v) + '">' + l + '<small>' + sm + '</small></button>').join('');
  return '<div class="sc-hg__form"><p class="st-f__l">New Jahresabrechnung</p>' +
    '<div class="st-seg sc-hg__types">' + typeSeg + '</div><div class="st-seg st-seg--2">' + dirSeg + '</div>' +
    '<div class="sc-hg__row2"><label class="st-f"><span class="st-f__l">Amount</span><span class="st-amt"><input class="st-in" id="scHgAmt" inputmode="decimal" placeholder="0,00" value="' + stEsc(f.amt || '') + '"/><span>€</span></span></label>' +
    '<label class="st-f"><span class="st-f__l">Date</span><input class="st-in" id="scHgDate" type="date" value="' + stEsc(f.date || cxToday()) + '"/></label></div>' +
    '<label class="st-f"><span class="st-f__l">Company</span><input class="st-in" id="scHgCo" placeholder="e.g. eprimo" value="' + stEsc(f.co || '') + '"/></label>' +
    '<p class="sc-hg__hint">Date = when it was paid or refunded – it counts in that NK year.</p>' +
    '<div class="sc-hg__fb"><button type="button" class="cx-link" data-sc="hgNewCancel">Cancel</button><button type="button" class="cx-btn cx-btn--p" data-sc="hgNewSave">Book</button></div></div>';
}

/* ── Tenant sheet (also used by Start) ── */
function scTenView(M, m) {
  // Oct 2026 · one level — the same frame as Rentals: amount · "Letter sent" · "Paid back / Received" · details below
  const t = M.ten.find(x => x.key === m.key);
  if (!t) return stMHead('Tenant', '', 'calc', 'data-sc="close"') + '<div class="srm__b mx-b"><p class="cx-empty">Not found.</p></div>';
  const s = t.set, c = scAv(t.room), first = scFirst(t.name);
  const kAttr = 'data-k="' + stEsc(t.key) + '"';
  const head = stMHead(t.name, t.room + (t.m2 ? ' · ' + String(t.m2).replace('.', ',') + ' m²' : '') + ' · ' + stNkLabel(M.per.from, M.per.to) + (t.movedOut ? ' · moved out' : ''), { ini: scAbbr(t.room), bg: c[0], fg: c[1] }, 'data-sc="close"');
  const flowLnk = m.flow ? '<button class="mx-skip" data-sc="flowNext">' + (m.i + 1) + ' of ' + m.flow.length + ' · next ›</button>' : '';
  if (t.k === 'none') {
    const pc = Number(t.pnkPaid) || 0;                     // Nov 2026: a short-term stay carries only the NK inside its Pauschale
    return head + '<div class="srm__b mx-b">' + stMHero({ tone: 'zero', label: first + ' pays Pauschal', amount: null, sub: 'no NK letter' }) +
      stMCard('House costs', 'calc', '<div class="mx-dr"><span class="mx-d" style="background:#E8C98F"></span><span>' + (pc ? 'NK inside the Pauschale ' + scE(pc) : 'No NK inside the Pauschale') + '<small>' + (pc ? 'counts as \u201cAnteil Kurzzeitvermietung\u201d · the rest is shared by the Kalt + NK tenants' : 'counts like an empty room · the Kalt + NK tenants share the house costs') + '</small></span><span></span></div>') + '</div>';
  }
  if (t.skipped) {
    return head + '<div class="srm__b mx-b">' + stMHero({ tone: 'zero', label: 'This NK is skipped', amount: null, sub: 'no letter and no result – it counts as done' }) +
      '<div class="tp-acts" style="margin-top:12px">' + stTpBtn('data-sc="setUndo" ' + kAttr, 'arrow-back-up', 'Bring it back', false) + '</div>' + flowLnk + '</div>';   // Nov 2026: labelled
  }
  const res = t.k === 'sent' || t.k === 'done' ? t.st && t.st.res : null;
  const saldo = res ? res.dir * res.amount : t.saldo;
  const noData = !M.R.lines.length;
  if (noData) return head + '<div class="srm__b mx-b">' + stMHero({ tone: 'none', label: 'NK-Abrechnung ' + M.y, amount: null, sub: first + ' lived here ' + t.days + ' days · the share follows once the house costs are typed' }) +
    '<div class="mx-rows">' + stMRow({ icon: 'receipt', title: 'House costs', sub: 'nothing booked yet', right: '<button type="button" class="mx-pill" data-sc="costs">Type house costs</button>' }) + '</div>' +
    (t.extra ? '<button class="mx-skip" data-sc="extraDel" ' + kAttr + '>Remove this tenant</button>' : '') + '</div>';
  const sent = t.k === 'sent' || t.k === 'done', done = t.k === 'done';
  const hero = stTpHero({ tone: saldo > 0.004 ? 'get' : saldo < -0.004 ? 'pay' : 'zero',
    label: saldo > 0.004 ? first + (done ? ' paid you' : ' pays you') : saldo < -0.004 ? first + (done ? ' got back' : ' gets back') : 'All even',
    amount: Math.abs(saldo) < 0.005 ? 0 : saldo,
    sub: !sent && !M.locked ? (M.pv ? 'preview as of ' + stDe(M.pv.cutoff) : 'preview until the house costs are locked') : '', settled: done,
    bars: [['Share', t.sum, '#E3B9A6'], ['Paid', t.vz, '#A9BFD3'], (t.teilB || []).length ? ['Teil B', cxR(t.b1 + t.b2), '#E8C98F'] : null] });   // Nov 2026: why, at a glance (D39: + Teil B)
  // ── Nov 2026 · steps with labelled buttons (no unlabelled switches) · the PDF is a real button
  const canSend = M.sendable && M.locked && !noData;
  const how = { zahlung: 'bank transfer', miete: 'with the rent', kaution: 'via Kaution' };
  const hasMoney = Math.abs(saldo) >= 0.005;
  const via = sent ? (res.via || 'zahlung') : scVia(t);
  const pdf = sent ? scLetterBtn(t).replace('cx-btn cx-btn--s', 'tp-btn').replace('Open letter', 'Open letter (PDF)').replace('PDF (recreated)', 'Open letter (PDF)')
    : stTpBtn('data-sc="pdf" ' + kAttr, 'file-text', 'Open letter (PDF)', false);
  const ways = !sent && hasMoney && M.sendable ? '<p class="tp-mini">Settle by</p><div class="mx-ways tp-ways">' + [['zahlung', 'bank', 'bank transfer'], ['miete', 'house', 'with the rent'], ['kaution', 'safe', 'via Kaution']].map(([k, ic, l]) =>
    '<button type="button" class="' + (via === k ? 'is-on' : '') + '" data-sc="viaSet" data-v="' + k + '" ' + kAttr + ' aria-pressed="' + (via === k) + '">' + stIc(ic, 16) + l + '</button>').join('') + '</div>' : '';
  const s1 = { n: 1, state: sent ? 'done' : canSend ? 'open' : 'wait', title: 'Letter',
    sub: sent ? 'sent ' + stDate(res.date) : !M.sendable ? 'Frist passed' : !M.locked ? 'lock the house costs first' : 'not sent yet · Frist ' + stDate(M.frist),
    undo: sent && !done ? '<button type="button" class="tp-undo" data-sc="reopen" ' + kAttr + '>undo</button>' : '',
    body: sent ? '<div class="tp-acts">' + pdf + '</div>' : ways + '<div class="tp-acts">' + pdf + stTpBtn('data-sc="send" ' + kAttr, SC.sending === t.key ? 'loader' : 'check', SC.sending === t.key ? 'Saving' : 'Mark as sent', true, !canSend || !!SC.sending) + '</div>' };   // C6: as it is while a letter saves
  let s2 = null;
  if (hasMoney) {
    const bk = t.st && t.st.booking;
    const payBox = sent && !done && !t.extra ? '<div class="mx-pay">' +
      '<label class="mx-f"><span>On</span><input type="date" data-scpay="date" ' + kAttr + ' value="' + stEsc(bk ? scD(bk.invoice_date) : (t.it && scD(t.it.r.paid_date)) || cxToday()) + '"/></label>' +
      (via === 'zahlung' ? '<label class="mx-f"><span>Amount</span><span class="mx-amt"><input inputmode="decimal" autocomplete="off" data-scpay="amt" ' + kAttr + ' value="' + stEsc(cxE2(bk ? cxR(bk.amount) : res.amount)) + '"/><em>€</em></span></label>' : '') + '</div>' : '';
    s2 = { n: 2, state: done ? 'done' : sent ? 'open' : 'wait', title: 'Money',
      sub: done ? stEsc(scSay(t)[1]) : sent ? stEsc((saldo > 0 ? first + ' pays you ' : first + ' gets back ') + scE(Math.abs(saldo)) + ' · ' + how[via]) : 'after the letter',
      undo: done ? '<button type="button" class="tp-undo" data-sc="setUndo" ' + kAttr + '>undo</button>' : '',
      body: sent && !done ? payBox + '<div class="tp-acts">' + stTpBtn('data-sc="payOn" ' + kAttr, 'check', saldo > 0 ? 'Received' : 'Paid back', true) + '</div>' : '' };
  }
  // ── calculation · one right-hand column for every amount
  const q = M.quota || {}, vzOpen = SC.pill && SC.pill.k === t.key && SC.pill.p === 'vz';
  const vzEd = vzOpen ? scVzEditor(t, t.k === 'open' && M.sendable && !(t.st && t.st.res)) : '';
  const vzOver = s.vz !== undefined && s.vz !== null && s.vz !== '';
  const vzSrc = (vzOver || (s.vzMonths && Object.keys(s.vzMonths).length)) ? 'changed by you' : t.vzContract ? t.vzContract + ' month(s) per contract' : 'per Controlling';
  const lk = 'tl:' + t.key, lo = !!SC.open[lk];
  const calc = stTpRow({ title: 'Lived here', sub: stEsc(stPer(t.from, t.to)), value: M.method === 'quota' ? scMo(t.months) + ' months' : t.days + ' days' }) +
    stTpRow({ title: 'Share', sub: stEsc(M.method === 'quota' && q.months ? scMo(t.months) + ' × ' + scE(q.rate) + ' · per cost type' : 'day by day · per cost type'), value: scE(t.sum),
      act: 'data-sc="fold" data-k="' + lk + '" aria-expanded="' + lo + '"', icon: lo ? 'chevron-up' : 'chevron-down' }) +
    (lo ? '<div class="sr-items tp-fold__b">' + scShareLines(t).map(g => '<div class="sr-it"><span>' + stEsc(g.label) + '<small class="sr-it__s">' + stEsc(scPct(g)) + ' of ' + scE(g.total) + '</small></span><span>' + scE(g.amount) + '</span></div>').join('') + '</div>' : '') +
    stTpRow({ title: '− Vorauszahlungen', sub: stEsc(vzSrc) + ' · per month', value: scE(t.vz), act: 'data-sc="pill" data-p="vz" ' + kAttr, icon: vzOpen ? 'chevron-up' : 'chevron-down' }) + vzEd +
    scTbTenRows(t) +                                                                   // D39: = Teil A · + B1 · + B2 (only with Teil B)
    stTpRow({ title: '= ' + (saldo > 0 ? first + ' pays you' : saldo < 0 ? first + ' gets back' : 'all even'), value: scE(Math.abs(saldo)), tone: saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : '', tot: true });
  // ── letter details: one folded line with ✓ complete / what is missing (opens by itself when something is missing)
  let letter = '';
  if (M.sendable && t.k === 'open') {
    const addr = String(s.addr !== undefined ? s.addr : scAddrDefault(t).join('\n'));
    const addrShort = addr.split('\n').filter(Boolean).slice(0, 2).join(', ') || 'address missing';
    const list = s.list !== undefined ? !!s.list : scListDefault();
    const pill = SC.pill && SC.pill.k === t.key ? SC.pill.p : null, miss = !addr.trim();
    const lOpen = pill === 'letter' || pill === 'addr' || pill === 'via' || miss;
    const chip = miss ? '<span class="tp-chip is-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> needs: address</span>' : '<span class="tp-chip is-ok"><i class="ti ti-check" aria-hidden="true"></i> complete</span>';
    const lsub = [addrShort, scDate(s.date || cxToday()), (s.days ?? 30) + ' days', 'Belegliste ' + (list ? 'on' : 'off')].join(' · ');
    letter = stTpLbl('mail', '#FAF0DC', '#854F0B', 'Letter') + '<div class="tp-card">' +
      '<button type="button" class="tp-r" data-sc="pill" data-p="letter" ' + kAttr + ' aria-expanded="' + lOpen + '"><span class="tp-r__m"><b>Letter details ' + chip + '</b><small>' + stEsc(lsub) + '</small></span><span class="tp-r__v"></span>' +
        '<span class="tp-r__i"><i class="ti ti-chevron-' + (lOpen ? 'up' : 'down') + '" aria-hidden="true"></i></span></button>' +
      (lOpen ? '<div class="tp-form">' +
        '<label class="tp-f"><span>Address' + (t.movedOut ? ' · new address after moving out' : '') + '</span><textarea class="st-in sc-ta" rows="2" data-sc-in="addr" ' + kAttr + '>' + stEsc(addr) + '</textarea></label>' +
        (saldo < 0 || t.einbehalt > 0 ? '<label class="tp-f"><span>' + stEsc(first) + '’s IBAN · for the Guthaben</span><input class="st-in" data-sc-in="iban" ' + kAttr + ' value="' + stEsc(s.iban || '') + '" placeholder="DE…"/></label>' : '') +
        '<div class="tp-g2"><label class="tp-f"><span>Pay within (days)</span><input class="st-in" inputmode="numeric" data-sc-in="days" ' + kAttr + ' value="' + stEsc(s.days ?? 30) + '"/></label>' +
          '<div class="tp-f"><span>Belegliste</span><button class="sc-pill' + (list ? ' is-ok' : '') + '" data-sc="tg" data-f="list" ' + kAttr + ' aria-pressed="' + list + '"><i class="ti ti-' + (list ? 'check' : 'list') + '" aria-hidden="true"></i>' + (list ? 'on' : 'off') + '</button></div></div>' +
        scToggle('former', t.key, s.former !== undefined ? !!s.former : t.movedOut, 'Former tenant', 'the letter says "das ehemalige Zimmer"', true) +
      '</div>' : '') + '</div>';
  }
  const xDel = t.extra && t.k === 'open' ? '<button class="mx-skip" data-sc="extraDel" ' + kAttr + '>Remove this tenant from this NK</button>'
    : t.k === 'open' && t.line ? '<button class="mx-skip" data-sc="skip" ' + kAttr + '>Skip this NK-Abrechnung</button>' : '';
  return head + '<div class="srm__b mx-b tp-b">' + hero + stTpSteps([s1, s2]) +
    stTpLbl('calculator', '#E6EEF6', '#2F5470', 'Calculation') + '<div class="tp-card">' + calc + '</div>' + letter + xDel + flowLnk + '</div>';
}

function scToggle(f, key, on, t, s, can) {
  return '<button type="button" class="sc-tg' + (on ? ' on' : '') + '" data-sc="tg" data-f="' + f + '" data-k="' + stEsc(key) + '"' + (can ? '' : ' disabled') + ' aria-pressed="' + on + '">' +
    '<span class="sc-tg__t"><b>' + t + '</b><small>' + s + '</small></span><span class="sc-tg__sw" aria-hidden="true"></span></button>';
}
function scLetterBtn(t) {
  const L = SC.letters.find(l => l.app === 'casa' && String(l.tenant_id) === String(t.tenantId) && scD(l.period_from) === t.from);
  return L ? '<button class="cx-btn cx-btn--s" data-sc="letter" data-id="' + stEsc(L.id) + '"><i class="ti ti-file-text" aria-hidden="true"></i> Open letter</button>'
           : '<button class="cx-btn cx-btn--s" data-sc="pdf" data-k="' + stEsc(t.key) + '"><i class="ti ti-file-text" aria-hidden="true"></i> PDF (recreated)</button>';
}
/* How the result is settled: chosen in the sheet, else Kaution when part of it is held back for the NK */
/* Kaution-Einbehalt (B20, Oct 2026): Tenants › Kaution › "Kept · for NK-Abrechnung" (column nk_einbehalt,
   once the Kaution is settled). It is offset in the tenant's NK-Abrechnung when the letter says "With the Kaution"
   (the default while it is unused) — only once: an NK already sent with the Kaution for another period has used it.
   Controlling gets the NK result itself; the Kaution never shows there. */
function scEinbehalt(tid, from) {
  const k = SC.kaution && tid != null ? SC.kaution[String(tid)] : null;
  const E = k && k.settled ? cxR(Number(k.nk_einbehalt) || 0) : 0;
  if (!(E > 0)) return 0;
  const f = String(from || '').slice(0, 10);
  const used = (window._src.abr || []).some(a => a && a.kind === 'nk_tenant' && (!a.app || a.app === 'casa') && a.status !== 'storniert' &&
    String(a.tenant_id) === String(tid) && a.settle_via === 'kaution' && String(a.period_from || '').slice(0, 10) !== f);
  return used ? 0 : E;
}
const scVia = t => (t.set && t.set.via) || (t.kau && t.kau.amount > 0 ? 'kaution' : 'zahlung');
/* D39 (bug 29): the NK years by the Casa period ("beginnt am"), not by the calendar — a year is the period that
   ENDS in it (scPeriod): maxY = the running period (the last one the arrows reach), lastEnded = the one before it
   (the one that is settled now). With a 01.01 start this is this year and last year, as before. */
function scYearBounds() {
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID) || {};
  const cur = typeof ctlPeriodOf === 'function' ? ctlPeriodOf(p, cxToday()) : null;
  const maxY = cur ? Number(cur.to.slice(0, 4)) : Number(cxToday().slice(0, 4));
  return { maxY, lastEnded: maxY - 1 };
}
/* First year to show: the purchase of Casa Castel (Properties › Purchase date) — the NK year whose period holds it */
function scMinYear() {
  const B = scYearBounds();
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID);
  const iso = p ? ctlPropSince(p) : '';
  const per = iso && typeof ctlPeriodOf === 'function' ? ctlPeriodOf(p, iso) : null;
  const y = per ? Number(per.to.slice(0, 4)) : Number(String(iso).slice(0, 4));
  return y ? Math.min(y, B.lastEnded) : B.lastEnded - 3;
}
/* Casa Castel address as letter lines – "Alsenstr. 60, 55252 Mainz-Kastel" never gets the PLZ twice */
function scHouse() {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const a = String(s.objekt_adresse || '').trim(), plz = String(s.objekt_plz_ort || '').trim();
  const lines = a ? (plz && !a.includes(plz) ? [a, plz] : a.split(/\s*,\s*/)) : String(typeof ADDRESS !== 'undefined' ? ADDRESS : '').split(/\s*,\s*/);
  return lines.map(x => x.trim()).filter(Boolean);
}
const scListDefault = () => { try { return localStorage.getItem('sc_list') !== '0'; } catch (e) { return true; } };
function scAddrDefault(t) {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const house = scHouse();
  if (t.extra && t.xAddr) return t.xAddr.split('\n').filter(Boolean);
  if (t.movedOut) return t.tr && t.tr.address ? String(t.tr.address).split(/\s*,\s*|\n/).filter(Boolean) : [];
  return house;
}

/* ── Settle ── */
function scSettleView(M, m) {
  const t = M.ten.find(x => x.key === m.key); if (!t) return scHead('Settle', '', 'backTen');
  const o = scSetObj(t, M);
  const body = t.skipped ? '<div class="srm__state is-ok"><span><i class="ti ti-check" aria-hidden="true"></i> Skipped · counts as done</span><span class="srm__state-a">' +
      '<button class="cx-link" data-sc="setUndo" data-k="' + stEsc(t.key) + '">undo</button></span></div>'
    : o ? '<div class="srm__card st-sg">' + stSetRow(o) + '</div>' : '<p class="cx-empty">Nothing to settle – the result is balanced.</p>';
  return scHead('Settle – ' + t.name, stNkLabel(t.from, t.to) + ' · ' + t.room, 'backTen') +
    '<div class="srm__b"><div class="srm__one srm__narrow">' + body + '<p class="st-hint">What you type goes to Controlling on the day you tap Settled. 0 € counts as done.</p></div></div>';
}
/* One settle line for stSetRow — null when there is nothing to settle here (balanced, added tenant) */
function scSetObj(t, M) {
  if (t.extra || !t.line) return null;
  const res = t.st && t.st.res, key = 'c:' + t.key;
  const base = { key, ns: 'sc', attrs: 'data-k="' + stEsc(t.key) + '"', av: scAv(t.room), ab: scAbbr(t.room), name: t.name, party: 'tenant',
                 sub: t.room + ' · ' + stPer(t.from, t.to), openAttr: 'data-sc="ten" data-k="' + stEsc(t.key) + '"' };
  if (!res) {
    if (t.k !== 'open' || Math.abs(t.saldo || 0) < 0.005) return null;
    return Object.assign(base, { state: 'locked', dir: t.saldo > 0 ? 1 : -1, soll: Math.abs(t.saldo), sub: base.sub + (M.locked ? '' : ' · preview'),
                                 lockText: M.locked ? 'Send the NK letter first' : 'Lock the house costs, then send the letter' });
  }
  if (!res.amount || !res.dir) return null;
  const b = t.st.booking, done = t.k === 'done';
  return Object.assign(base, { state: SC.setEdit === key ? 'edit' : done ? 'settled' : 'open', dir: res.dir, soll: res.amount,
    sub: base.sub + (res.via === 'kaution' && t.einbehalt > 0 ? ' · offset with the Kaution-Einbehalt ' + stEur(t.einbehalt) : ''),   // B20
    ist: b ? cxR(b.amount) : done ? res.amount : null, date: b ? scD(b.invoice_date) : null,
    note: done && !b && SC.setEdit !== key ? ({ kaution: 'Settled via Kaution', miete: 'Settled with the rent' }[res.via] || null) : null });
}
/* Settled: the typed amount (0 is fine) → booking in Controlling today → the line is done */
async function scSetAmount(key, raw, btn, when) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t || !t.line) return;
  const st = t.st || {}, res = st.res, b = st.booking;
  if (!res || !res.amount) { stSay('Nothing to settle'); return; }
  const s = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!s) { stSay('Type the amount – 0 is fine'); return; }
  const parsed = cxParse(s);
  if (parsed === null || isNaN(parsed)) { stSay('That amount is not a number'); return; }
  const amt = cxR(Math.abs(parsed));
  let date = scD(when) || cxToday(), linkedManual = null, took = null;   // Oct 2026: the day the money moved (default today)
  if (btn) btn.disabled = true;
  try {
    if (res.via !== 'zahlung') { await _ctlSupa.from('abr_results').update({ settle_via: 'zahlung' }).eq('id', res.id); res.db.settle_via = 'zahlung'; await _stUpsertSettlement(t.line, { settled_via: 'zahlung' }); }
    let mine = null;
    if (b && amt && (Number(b.direction) === 1 ? 1 : -1) === res.dir && _stIsOwnBooking(b) && (mine = await _stFindOwnEntry(CASA_PROP_ID, res, amt, false))) {
      // C3c (as in Controlling): a typo corrected — the apps' booking gets the amount of your own unlinked entry → that
      // booking goes and your entry is the payment again (it counted twice: the corrected booking and your entry)
      await ctlDeleteOneTime(b.id);
      window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id);
    }
    if (b && !mine) {
      // Nov 2026 fix: the result changed direction since it was paid (Nachzahlung ↔ Guthaben) → its booking turns too
      // (it kept the old direction: Controlling counted the money the wrong way and showed it on both sides)
      const f = { amount: amt, invoice_date: date };
      if ((Number(b.direction) === 1 ? 1 : -1) !== res.dir) Object.assign(f, { direction: res.dir, item: stNkLabel(t.from, t.to) + ' · ' + t.name + ' · ' + (res.dir > 0 ? 'Nachzahlung' : 'Guthaben') });
      const d = await ctlUpdateOneTime(b.id, f);
      const i = (window._src.abrPay || []).findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
    } else if (amt && (took = await _stTakeOwnEntry(CASA_PROP_ID, res, amt, false, mine))) {   // #6: already typed in Controlling → link it, no 2nd booking (C3c: other years too)
      linkedManual = took.o; date = String((took.row || linkedManual).invoice_date || date).slice(0, 10);
      if (took.row.id !== linkedManual.id) linkedManual = null;             // #1: booked meanwhile elsewhere → that booking is the payment
    } else {
      const d = await ctlAbrAdd({ property_id: CASA_PROP_ID, invoice_date: date, item: stNkLabel(t.from, t.to) + ' · ' + t.name + ' · ' + (res.dir > 0 ? 'Nachzahlung' : 'Guthaben'),
                                  amount: amt, kind: 'NK-Abrechnung', direction: res.dir, source_ref: 'abr:' + res.id });   // #1: booked meanwhile → that booking
      date = String(d.invoice_date || date).slice(0, 10);
    }
    await _stConfirmSettled(t.line, 'zahlung', date);
  } catch (e) { stSay('Could not save — ' + (e.message || e)); if (btn) btn.disabled = false; return; }
  SC.setEdit = null; ctlSettlementInvalidate(); stSay(linkedManual ? 'Settled · linked to your entry in Controlling from ' + stDate(date) : 'Settled');
  const m = SC.modal;
  SC.model = scModel(M.y); stRenderCasa();
  SC.modal = m && m.view === 'settle' ? (m.back || { view: 'ten', key }) : m; scRenderModal();
}
/* Skip this NK (no letter, no result) – counts as done; "Undo skip" brings it back */
const _scSkipBusy = new Set();                               // C6: a 2nd Skip of the same line while its save runs does nothing
async function scSkip(key) {
  if (_scSkipBusy.has(key)) return;
  const M = SC.model, t = M && M.ten.find(x => x.key === key), m0 = SC.modal; if (!t || !t.line) return;
  if (!(await stConfirm({ title: 'Skip this NK?', ok: 'Skip', text: 'No letter and no result for ' + t.name + ' – it counts as done. You can undo it later.' }))) return;
  if (_scSkipBusy.has(key)) return;
  _scSkipBusy.add(key);
  try { await _stUpsertSettlement(t.line, { status: 'nicht durchgeführt', amount: null, direction: null, settled_via: null }); }
  catch (e) { stSay('Could not save — ' + (e.message || e)); return; }
  finally { _scSkipBusy.delete(key); }
  ctlSettlementInvalidate(); stSay('Skipped');
  scSaveEnd(M.y, key, m0, 'keep');
}
/* Back to open (sent, waiting): the booking in Controlling goes too; a skipped NK comes back as open */
async function scSetUndo(key) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t || !t.line) return;
  const st = t.st || {}, res = st.res, b = st.booking;
  if (!(await stConfirm({ title: 'Back to open?', ok: 'Back to open',
    text: _stUndoText(b, scDate, scE) }))) return;
  try {
    if (t.skipped) await _stUpsertSettlement(t.line, { status: 'offen' });
    else {
      if (b) await _stUndoBooking(b);                                // own booking removed · your own entry only unlinked
      if (res && res.via !== 'zahlung') { await _ctlSupa.from('abr_results').update({ settle_via: 'zahlung' }).eq('id', res.id); res.db.settle_via = 'zahlung'; await _stUpsertSettlement(t.line, { settled_via: 'zahlung' }); }
      await _stUpsertSettlement(t.line, { status: 'verschickt' });
    }
  } catch (e) { stSay('Could not undo — ' + (e.message || e)); return; }
  SC.setEdit = null; ctlSettlementInvalidate(); stSay('Back to open');
  const m = SC.modal; SC.model = scModel(M.y); stRenderCasa(); SC.modal = m; scRenderModal();
}

/* ── Share lines for letter + details (Oct 2026) ────────────
   · a Versorger Jahresabrechnung (One-off · Versorger) is netted into its cost type:
     Strom Abschläge + Strom Jahresabrechnung(en) = one "Strom" line showing the result
   · range = people (or m²) sharing it on the tenant's days → "5 bis 7 Personen" in the letter head
   · the share is shown in % of the house cost (scPct)                            */
function scShareLines(t) {
  // one line per cost type: Abschläge (running) + Jahresabrechnungen (hausgeld) + invoices with that cost type (oneoff);
  // invoices without a cost type → ONE last line "Allgemeine Hauskosten" (details in the Belegliste)
  const out = [], byKey = {};
  for (const l of (t.lines || [])) {
    const hasCat = l.catId !== null && l.catId !== undefined;
    const k = hasCat ? 'cat:' + l.catId : l.group === 'oneoff' ? 'allg' : l.id;
    let g = byKey[k];
    if (!g) {
      g = byKey[k] = { id: k === 'allg' ? 'allg' : l.id, label: k === 'allg' ? 'Allgemeine Hauskosten' : (l.group === 'running' ? l.label : (l.catName || l.label)),
                       key: l.key, total: 0, amount: 0, range: null, run: 0, hg: 0, nHg: 0, inv: 0, nInv: 0, allg: k === 'allg', catId: hasCat ? l.catId : null };
      out.push(g);
    }
    g.total += l.total; g.amount += l.amount;
    if (l.range) g.range = g.range ? { lo: Math.min(g.range.lo, l.range.lo), hi: Math.max(g.range.hi, l.range.hi) } : { lo: l.range.lo, hi: l.range.hi };
    if (l.group === 'hausgeld') { g.hg += l.total; g.nHg++; }
    else if (l.group === 'oneoff') { g.inv += l.total; g.nInv++; }
    else { g.run += l.total; g.id = l.id; g.label = l.label; }            // the running line names it
  }
  out.forEach(g => { g.total = cxR(g.total); g.amount = cxR(g.amount); g.hg = cxR(g.hg); g.run = cxR(g.run); g.inv = cxR(g.inv);
                     g.merged = !g.allg && (g.nHg > 0 || (g.nInv > 0 && g.run)); });
  return out.filter(g => !g.allg).sort((a, b) => scCatOrd(a.catId) - scCatOrd(b.catId)).concat(out.filter(g => g.allg));     // the one order · Allgemeine Hauskosten always last
}
const scMo = v => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });   // 7 · 6,5 · 0,77
function scPct(g) {                                     // share of the house cost, e.g. "10,21 %"
  if (!g.total || Math.abs(g.total) < 0.005) return '\u2013';
  return (g.amount / g.total * 100).toFixed(2).replace('.', ',') + '\u00a0%';
}

/* ── Letter data ─────────────────────────────────────────── */
async function scLetterData(M, t) {
  if (typeof loadSettings === 'function') { try { await loadSettings(); } catch (e) {} }
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const set = t.set || {};
  const dt = iso => stDate(iso);
  const house = scHouse();
  const addr = String(set.addr !== undefined ? set.addr : scAddrDefault(t).join('\n')).split('\n').map(x => x.trim()).filter(Boolean);
  const former = set.former !== undefined ? !!set.former : t.movedOut;
  const list = set.list !== undefined ? !!set.list : scListDefault();
  const date = set.date || cxToday(), days = Number(set.days ?? 30) || 30;
  const sender = [s.vermieter_name, ...String(s.vermieter_adresse || '').split(/\s*,\s*|\n/)].map(z => String(z || '').trim()).filter(Boolean);
  const ort = s.unterschrift_ort || ((String(s.vermieter_adresse || '').match(/\d{5}\s+([^,\n]+)/) || [])[1] || '').trim();
  const y = M.y, per = M.R.period, partial = t.days < M.R.days;
  const keyTxt = l => {
    if (l.key === 'flaeche') return 'Zimmerfläche';
    const ln = M.input.lines.find(x => x.id === l.id), p = ln && ln.parts[0];
    return p && p.spread === 'from' ? 'Personen ab ' + dt(p.date) : 'Personen';
  };
  const eur = v => { const n = Number(v) || 0; return (n < -0.004 ? '\u2212\u00a0' : '') + Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac'; };
  const hgList = ((scRec(M.y) || {}).tenants || {}).__hgList || {};
  const extraLines = M.input.lines.filter(l => l.info && t.lines.some(x => x.id === l.id) && (l.group !== 'hausgeld' || hgList[l.id]))
    .sort((a, b) => String(a.info.date).localeCompare(String(b.info.date)));
  const SL = scShareLines(t);
  const merged = SL.some(g => g.nHg > 0), hasFl = SL.some(g => g.key === 'flaeche');
  // how many people lived in the house during this tenancy (all Personen lines together)
  const occ = SL.filter(g => g.key === 'personen' && g.range).reduce((a, g) => a ? { lo: Math.min(a.lo, g.range.lo), hi: Math.max(a.hi, g.range.hi) } : { lo: g.range.lo, hi: g.range.hi }, null);
  const span = (a, b) => (String(a).slice(0, 4) === String(b).slice(0, 4) ? dt(a).slice(0, 6) : dt(a)) + ' \u2013 ' + dt(b);
  // Jahresabrechnung netted into its cost type → a small line under it
  const subRow = g => {
    if (g.allg) return { sub: g.nInv + (g.nInv === 1 ? ' Einzelrechnung' : ' Einzelrechnungen') + (list && extraLines.length ? ', siehe Belegliste' : '') };
    const p = [];
    if (g.run) p.push('Abschläge ' + eur(g.run));
    if (g.nHg) p.push((g.hg < 0 ? 'abzüglich ' : 'zuzüglich ') + (g.nHg > 1 ? 'Jahresabrechnungen ' : 'Jahresabrechnung ') + eur(Math.abs(g.hg)) + (g.hg < 0 ? ' (Guthaben)' : ' (Nachzahlung)'));
    if (g.nInv) p.push((p.length ? 'zuzüglich ' : '') + (g.nInv === 1 ? 'Einzelrechnung ' : 'Einzelrechnungen ') + eur(g.inv));
    return { sub: p.join(' ') };
  };
  const Q = M.method === 'quota' && M.quota && M.quota.months ? M.quota : null;   // Kostenquote
  const nf = (v, d) => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const rows = [];
  const qPct = Q ? nf(t.months / Q.months * 100, 2) + '\u00a0%' : '';      // the same share for every cost type
  SL.forEach(g => { rows.push(Q ? [g.label, eur(g.total), eur(g.amount)] : [g.label, eur(g.total), keyTxt(g), scPct(g), eur(g.amount)]); if (g.merged || g.allg) rows.push(subRow(g)); });
  const first = scFirst(t.name);
  const D = {
    brand: 'Casa Castel', unitLabel: 'Zimmer', unitName: t.room, du: true,
    footer: house.join(' \u00b7 '), sender, vermieter: s.vermieter_name || '', ort, date, names: [t.name], addr,
    title: 'Betriebskostenabrechnung ' + y,
    subtitle: 'Mietobjekt ' + house.join(', ') + ' \u00b7 Zimmer ' + t.room + (t.m2 ? ' (' + String(t.m2).replace('.', ',') + ' m²)' : '') + ' \u00b7 Abrechnungszeitraum ' + dt(per.from) + ' bis ' + dt(per.to),
    greeting: 'Hallo ' + first + ',',
    closing: 'Viele Grüße',
    introHtml: 'anbei die Abrechnung der Betriebskosten für das ' + (former ? 'ehemalige ' : '') + 'Zimmer „' + t.room + '“ in der Casa Castel für den Zeitraum vom <strong>' + dt(per.from) + ' bis ' + dt(per.to) + '</strong>.' +
      ' Die Kosten des Hauses werden tagesgenau auf alle Personen verteilt, die im Haus wohnen.' +
      (partial ? ' Das Zimmer wurde vom ' + dt(t.from) + ' bis ' + dt(t.to) + ' bewohnt (' + t.days + ' von ' + M.R.days + ' Tagen) – berechnet werden nur diese Tage.' : ''),
    sum: t.sum, vz: t.vz, saldo: t.saldo, via: t.saldo ? scVia(t) : 'zahlung', einbehalt: t.einbehalt || 0, due: NkCasa.addDays(date, days),
    bank: { inhaber: s.kontoinhaber || s.vermieter_name || '', bank: s.bankname || '', iban: s.iban || '', bic: s.bic || '' },
    verwendung: 'NK ' + y + ' Casa Castel ' + t.room + ' ' + String(t.name).split(' ').slice(-1)[0], tenantIban: set.iban || '', former,
    hinweise: [],
    outro: 'Die Aufstellung aller Kosten und die Berechnung deines Anteils findest du auf Seite 2.',
    anlagen: list && extraLines.length ? 'Belegliste (Seite 3)' : '',
    title2: 'Aufstellung der Betriebskosten ' + y,
    subtitle2: 'Zimmer ' + t.room + ' \u00b7 Casa Castel, ' + house.join(', '),
    facts: [['Abrechnungszeitraum', span(per.from, per.to), M.R.days + ' Tage'],
            ['Nutzungszeitraum', span(t.from, t.to), t.days + ' Tage'],
            ...(occ ? [['Personen im Haus', occ.lo === occ.hi ? String(occ.lo) : occ.lo + ' bis ' + occ.hi, 'im Nutzungszeitraum']] : []),
            ],
    intro2: 'Umgelegt werden die im Mietvertrag vereinbarten Betriebskosten des Hauses.',
    table: {
      cols: [{ label: 'Kostenart', w: '33%' }, { label: 'Kosten Haus', w: '15%', cls: 'r' }, { label: 'Verteilt nach', w: '21%', cls: 'k' }, { label: 'Anteil', w: '13%', cls: 'r' }, { label: 'Betrag', w: '18%', cls: 'r' }],
      rows,
      sumLabel: 'Summe Anteil',
      vzLabel: 'abzüglich geleisteter Vorauszahlungen',
    },
    notes2Title: 'So wird gerechnet',
    notes2: ['Die Kosten jedes Tages werden zu gleichen Teilen auf alle Personen verteilt, die an diesem Tag im Haus wohnen.' +
               '',
             'Der Anteil in % ist je Kostenart verschieden: Die Kosten fallen zu unterschiedlichen Zeiten an, und es wohnen nicht immer gleich viele Personen im Haus.',
             'Monatliche Kosten zählen im jeweiligen Monat, Jahresbeträge gleichmäßig über alle Tage, Einzelrechnungen ab dem Rechnungsdatum bis zum Ende des Zeitraums.',
             ...(merged ? ['Jahresabrechnungen der Versorger sind direkt mit den Abschlägen der jeweiligen Kostenart verrechnet.'] : []),
             'Nicht umlagefähige Kosten sind nicht enthalten.'],
    extra: list && extraLines.length ? { title: 'Belegliste ' + y, sumLabel: 'Summe Belege', intro: extraLines.some(l => l.group === 'hausgeld') ? 'Einzelrechnungen und Jahresabrechnungen der Versorger, die in die Aufstellung eingeflossen sind – Jahresabrechnungen mit ihrem Anteil für ' + y + '. Laufende Abschläge stehen dort mit ihrem Jahresbetrag.' : 'Die Einzelrechnungen, die auf Seite ' + ((t.teilB || []).length ? 1 : 2) + ' in die Aufstellung eingeflossen sind – ohne eigene Kostenart unter „Allgemeine Hauskosten“.',   // D39: with Teil B the right page
      rows: extraLines.map(l => [l.info.date, l.info.item || l.label, l.info.company || '', l.info.amount]), sum: cxR(extraLines.reduce((a, l) => a + l.info.amount, 0)) } : null,
  };
  if (!Q) return scLetterLayout(D, M, t, { SL, Q, merged, list, extraLines, house, partial });
  // ── Kostenquote: every lived month carries the same amount
  const mo = scMo(t.months);
  D.introHtml = 'anbei die Abrechnung der Betriebskosten für das ' + (former ? 'ehemalige ' : '') + 'Zimmer „' + t.room + '“ in der Casa Castel für den Zeitraum vom <strong>' + dt(per.from) + ' bis ' + dt(per.to) + '</strong>.' +
    ' Die Kosten des Hauses werden gleichmäßig auf alle bewohnten Monate verteilt – jeder Monat, in dem jemand im Haus gewohnt hat, trägt den gleichen Betrag.' +
    (partial ? ' Das Zimmer wurde vom ' + dt(t.from) + ' bis ' + dt(t.to) + ' bewohnt (' + mo + ' Monate).' : '');
  const kz = Number(Q.kurz) || 0, base = kz ? Q.pool : Q.total;           // Nov 2026: − Anteil Kurzzeitvermietung
  D.facts = [['Abrechnungszeitraum', span(per.from, per.to), M.R.days + ' Tage'],
             ['Bewohnte Monate im Haus', scMo(Q.months), 'Ø ' + nf(Q.persons, 1) + ' Personen'],
             ['Kosten je Monat', eur(Q.rate), eur(base) + ' ÷ ' + scMo(Q.months)],
             ['Dein Anteil', qPct, 'deine ' + mo + ' Monate ÷ ' + scMo(Q.months)]];
  D.intro2 = 'Kosten des Hauses ' + eur(Q.total) + (kz ? ' − Anteil Kurzzeitvermietung ' + eur(kz) + ' = ' + eur(base) : '') + ' ÷ ' + scMo(Q.months) + ' bewohnte Monate = <strong>' + eur(Q.rate) + ' je Monat</strong>. ' +
    mo + ' Monate × ' + eur(Q.rate) + ' = <strong>' + eur(t.sum) + '</strong>. Das sind ' + qPct + ' der Kosten – so verteilt sich der Betrag auf die Kostenarten:';
  D.table.cols = [{ label: 'Kostenart', w: '52%' }, { label: 'Kosten Haus', w: '24%', cls: 'r' }, { label: 'Dein Betrag', w: '24%', cls: 'r' }];
  D.notes2 = ['Alle umlagefähigen Kosten des Jahres werden zusammengezählt und gleichmäßig auf alle bewohnten Monate verteilt (Personenmonate). Ein- und Auszugsmonate zählen tagesgenau.',
              'Jeder bewohnte Monat kostet dadurch gleich viel – egal, wann im Jahr und wie viele Personen gerade im Haus wohnen.',
              ...(merged ? ['Jahresabrechnungen der Versorger zählen anteilig nach ihrem Abrechnungszeitraum und sind mit den Abschlägen der jeweiligen Kostenart verrechnet.'] : []),
              'Nicht umlagefähige Kosten sind nicht enthalten.'];
  return scLetterLayout(D, M, t, { SL, Q, merged, list, extraLines, house, partial });
}
/* One-page letter (Oct 2026): costs left · monthly NK-Vorauszahlungen right · one result box · Belegliste on page 2 */
const SC_MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function scLetterLayout(D, M, t, o) {
  const dt = iso => stDate(iso);
  const eur = v => { const n = Number(v) || 0; return (n < -0.004 ? '\u2212\u00a0' : '') + Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac'; };
  const nf = (v, d) => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const Q = o.Q, mo = scMo(t.months), per = M.R.period;
  D.title = 'Betriebskostenabrechnung ' + dt(t.from) + ' \u2013 ' + dt(t.to);
  D.facts1 = [['Zimmer', t.room, 'Casa Castel \u00b7 ' + (o.house[0] || '')],
              ['Zeitraum', dt(t.from) + ' \u2013 ' + dt(t.to), Q ? mo + ' Monate' : t.days + (o.partial ? ' von ' + M.R.days : '') + ' Tage'],
              Q ? ['Anteil', nf(t.months / Q.months * 100, 2) + '\u00a0%', mo + ' von ' + scMo(Q.months) + ' bewohnten Monaten']
                : ['Abrechnungsjahr', dt(per.from) + ' \u2013 ' + dt(per.to), 'Verteilung nach Personen']];
  D.introHtml = 'anbei die Betriebskostenabrechnung für den genannten Zeitraum.' + (o.partial ? ' Berechnet werden nur die bewohnten ' + (Q ? 'Monate.' : 'Tage.') : '');
  const kz = Q ? Number(Q.kurz) || 0 : 0;                                   // Nov 2026: one line before the split, only when there is one
  D.costs = { cols: [{ label: 'Kostenart', w: '52%' }, { label: 'Haus gesamt', w: '24%', cls: 'r' }, { label: 'Anteil', w: '24%', cls: 'r' }],
              rows: o.SL.map(g => [g.label, eur(g.total), eur(g.amount)]).concat(kz ? [['abzüglich Anteil Kurzzeitvermietung', eur(-kz), '']] : []),
              sumMid: Q ? (kz ? Q.pool : Q.total) : cxR(o.SL.reduce((a, g) => a + (Number(g.total) || 0), 0)) };
  const ov = (t.set && t.set.vzMonths) || {};
  D.vzMonths = Object.keys(t.vzMap || {}).sort().map(ym => ({ label: SC_MON[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4), amt: ov[ym] !== undefined ? Number(ov[ym]) || 0 : t.vzMap[ym].amt }));
  const beleg = o.list && o.extraLines.length, pBeleg = (t.teilB || []).length ? 3 : 2;   // D39: Teil B is Seite 2 → the Belegliste Seite 3
  D.hints = [Q ? 'Verteilung: Hauskosten' + (kz ? ' abzüglich Anteil Kurzzeitvermietung' : '') + ' \u00f7 alle bewohnten Monate im Haus = gleicher Betrag je Monat für alle Zimmer.'
               : 'Verteilung: Die Kosten jedes Tages werden zu gleichen Teilen auf alle Personen verteilt, die an diesem Tag im Haus wohnen.',
             'Enthalten sind die im Abrechnungszeitraum gezahlten Kosten. Versorger-Jahresabrechnungen zählen anteilig nach ihrem eigenen Abrechnungszeitraum (tagesgenau) und sind mit den Abschlägen der jeweiligen Kostenart verrechnet.',
             ...(beleg ? ['Die Einzelrechnungen stehen in der Belegliste auf Seite ' + pBeleg + '.'] : [])];
  D.anlagen = beleg ? 'Belegliste (Seite ' + pBeleg + ')' : '';
  D.outro = ''; D.table = null;
  if ((t.teilB || []).length) scLetterTeilB(D, M, t, beleg);
  return D;
}
/* D39 · the letter's Teil B page (German, drawn by nk-letter.js) — only for a tenant with Teil B rows.
   Page 1 keeps the Teil A result (D.saldo = t.saldoA) and says where the netting is (the Gesamtverrechnung); the payment
   text moves there and is for the total (t.saldo = A + B1 + B2 — the amount that is sent and booked). B1 and B2 are separate
   blocks; a row says only "Dein Zimmer" or "Gemeinschaftsfläche · ÷ n …" — never other rooms or tenants. */
function scLetterTeilB(D, M, t, beleg) {
  const eur = v => { const n = Number(v) || 0; return (n < -0.004 ? '\u2212\u00a0' : '') + Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac'; };
  const R = t.teilB || [], dein = D.du ? 'Dein' : 'Ihr';
  let nA = 0;                                                // Anlage n = the invoice of the n-th position (B1 first, then B2)
  // "Rechnung" = the amount billed for the invoice (Anlage). Nov 2026 (owner): returns are never mentioned in a letter —
  // the amount is the one after returns (net), with no "Rückgabe" line or note; only Settlements on your screen shows them
  const bill = r => r.net;
  const sub = r => {
    if (r.cap) return '8\u00a0% von ' + eur(r.rent12) + ' Jahresmiete';
    const where = r.where === 'zimmer' ? dein + ' Zimmer'
      : 'Gemeinschaftsfläche · ' + (r.n === 1 ? (r.b === 2 ? 'verursacht durch ' + dein.toLowerCase() + ' Zimmer' : 'einziges vermietetes Zimmer')
                                              : '÷ ' + r.n + (r.b === 2 ? ' verursachende Zimmer' : ' vermietete Zimmer'));
    return where + ' · Anlage ' + (++nA);
  };
  const block = (k, title, note) => {
    const L = R.filter(r => r.b === k); if (!L.length) return null;
    return { k, title, note, sumLabel: 'Summe B' + k, sum: t['b' + k],
             rows: L.map(r => ({ date: r.cap ? '' : r.date, label: r.label, sub: sub(r), bill: r.cap ? null : bill(r), share: r.share })) };
  };
  const blocks = [block(1, 'B1 · Kleinreparaturen', '§ 7 Mietvertrag · bis 150 € je Fall'), block(2, 'B2 · Schäden', 'Schadensersatz')].filter(Boolean);
  const has1 = blocks.some(b => b.k === 1), has2 = blocks.some(b => b.k === 2), A = t.saldoA;
  const zr = (String(t.from).slice(0, 4) === String(t.to).slice(0, 4) ? stDate(t.from).slice(0, 6) : stDate(t.from)) + '\u2013' + stDate(t.to);
  const legal = has1 && has2
    ? 'B1 und B2 sind keine Betriebskosten und nicht Teil der Betriebskostenabrechnung (Seite 1). B1 beruht auf § 7 Mietvertrag (Kleinreparaturen), B2 auf Schadensersatz. Beide werden mit dem Ergebnis aus Teil A verrechnet; Einwände zu B1 oder B2 berühren die Betriebskostenabrechnung nicht.'
    : (has1 ? 'B1' : 'B2') + ' gehört nicht zu den Betriebskosten und ist nicht Teil der Betriebskostenabrechnung (Seite 1). ' + (has1 ? 'B1 beruht auf § 7 Mietvertrag (Kleinreparaturen)' : 'B2 beruht auf Schadensersatz') +
      ' und wird mit dem Ergebnis aus Teil A verrechnet; Einwände zu ' + (has1 ? 'B1' : 'B2') + ' berühren die Betriebskostenabrechnung nicht.';
  D.teilB = {
    kicker: 'NK-Abrechnung ' + M.y, title: 'Teil B · Sonstige Forderungen', sub: 'keine Betriebskosten · getrennt von Teil A',
    who: [t.name, 'Casa Castel · Zimmer ' + t.room, 'Zeitraum ' + zr],
    cols: ['Datum', 'Position', 'Rechnung', dein + ' Anteil'], blocks,
    gesamt: 'Gesamtverrechnung',
    rows: [['Teil A · Betriebskosten (Seite 1) · ' + (A > 0.004 ? 'Nachzahlung' : A < -0.004 ? 'Guthaben' : 'ausgeglichen'), A]]
      .concat(has1 ? [['B1 · Kleinreparaturen', t.b1]] : [], has2 ? [['B2 · Schäden', t.b2]] : []),
    saldo: t.saldo, what: has1 && has2 ? 'Kleinreparaturen und Schäden' : has1 ? 'Kleinreparaturen' : 'Schäden', legal,
    anlagen: nA === 1 ? 'Anlage 1: Rechnung zur Position oben' : 'Anlagen 1\u2013' + nA + ': Rechnungen zu den Positionen oben',
  };
  D.saldo = A;                                               // page 1: the Teil A result (the total is on Seite 2)
  D.anlagen = [beleg ? 'Belegliste (Seite 3)' : '', nA === 1 ? 'Rechnung zu Teil B' : nA + ' Rechnungen zu Teil B'].filter(Boolean).join(' · ');
  return D;
}
const scFileName = (M, t) => ccPdfFileName('NK-Abrechnung', M.y, 'Casa-Castel', t.room, String(t.name).split(' ').slice(-1)[0]);

/* ── Actions ─────────────────────────────────────────────── */
const scQ = v => window.CSS && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&');   // a value inside [data-…="…"]
async function scClick(e) {
  const b = e.target.closest('[data-sc]'); if (!b || b.disabled) return;
  const a = b.dataset.sc, M = SC.model;
  if (a === 'year') { SC.year += Number(b.dataset.d); SC.modal = null; return stRenderCasa(); }
  if (a === 'close') { SC.modal = null; SC.setEdit = null; return scRenderModal(); }
  if (a === 'fold') {                                      // Nov 2026: a cost type card can start open (needs you) → toggle what is shown
    const k = b.dataset.k, shown = b.getAttribute('aria-expanded') === 'true';
    SC.open[k] = String(k).indexOf('ct:') === 0 && b.hasAttribute('aria-expanded') ? !shown : !SC.open[k];
    return scKeepPlace(b, '[data-sc="fold"][data-k="' + scQ(k) + '"]');   // D39 (bug 32): the tapped header stays put
  }
  if (a === 'costs') { SC.modal = { view: 'costs' }; return scRenderModal(); }
  if (a === 'ja' || a === 'sumHg') { SC.modal = { view: 'costs' }; return scRenderModal(); }   // Nov 2026: one pop-up
  if (a === 'jaFold') { const k = 'ja:' + b.dataset.b; SC.open[k] = !SC.open[k]; return scKeepPlace(b, '[data-sc="jaFold"][data-b="' + scQ(b.dataset.b) + '"]'); }
  if (a === 'jaOpen') { const k = b.dataset.o; SC.open[k] = !SC.open[k]; return scKeepPlace(b, '[data-sc="jaOpen"][data-o="' + scQ(k) + '"]'); }   // Nov 2026: the bill's small folds (change · Abschlag · ⋯)
  if (a === 'jaAdd') return scJaAdd(b.dataset.k);
  if (a === 'jaRecv' || a === 'jaDir' || a === 'jaPay' || a === 'jaDel' || a === 'jaZok') return scJaAct(a, b);
  if (a === 'jaYear') { SC.year = Number(b.dataset.y) || SC.year; SC.modal = { view: 'costs' }; return stRenderCasa(); }   // a bill that came the year after
  if (a === 'jaNoBill' || a === 'jaNoBillUndo') return scJaNoBill(a, b);
  if (a === 'sumTen' || a === 'teilB') { SC.modal = { view: a }; return scRenderModal(); }
  if (a === 'hgNew') { SC.hgNew = { type: b.dataset.t || '', dir: '', amt: '', date: '', co: '' }; return scRenderModal(); }
  if (a === 'hgNewCancel') { SC.hgNew = null; return scRenderModal(); }
  if (a === 'hgNewSet') {
    const f = SC.hgNew || (SC.hgNew = {}), g = id => document.getElementById(id);
    f.amt = g('scHgAmt') ? g('scHgAmt').value : f.amt; f.date = g('scHgDate') ? g('scHgDate').value : f.date; f.co = g('scHgCo') ? g('scHgCo').value : f.co;
    f[b.dataset.f] = b.dataset.v; return scRenderModal();
  }
  if (a === 'hgNewSave') return scHgBook(b);
  if (a === 'hgDel') return scHgRemove(b.dataset.id);

  if (a === 'hglist') {                                    // Hausgeld sheet: show a Jahresabrechnung in the Belegliste or not
    if (M && M.locked) return;
    const r = scRecEnsure(SC.year), li = r.tenants.__hgList = r.tenants.__hgList || {}, id = b.dataset.id;
    if (li[id]) delete li[id]; else li[id] = true;
    scQueueSave(r); const m = SC.modal; SC.model = scModel(SC.year); stRenderCasa(); SC.modal = m; return scRenderModal();
  }
  if (a === 'hgtog') {                                     // Hausgeld sheet: include / leave out one Jahresabrechnung
    if (M && M.locked) return;
    const r = scRecEnsure(SC.year), off = r.tenants.__hgOff = r.tenants.__hgOff || {}, id = b.dataset.id;
    if (off[id]) delete off[id]; else off[id] = true;
    scQueueSave(r); const m = SC.modal; SC.model = scModel(SC.year); stRenderCasa(); SC.modal = m; return scRenderModal();
  }
  if (a === 'filter') { SC.filter = b.dataset.k; return stRenderCasa(); }
  if (a === 'method') { const r = scRecEnsure(SC.year); r.tenants.__method = b.dataset.v === 'days' ? 'days' : 'quota'; scQueueSave(r); SC.model = scModel(SC.year); return stRenderCasa(); }
  if (a === 'ten') { SC.modal = { view: 'ten', key: b.dataset.k }; SC.pill = null; return scRenderModal(); }
  if (a === 'start') { const keys = M.ten.filter(t => t.k === 'open').map(t => t.key); if (keys.length) { SC.modal = { view: 'ten', key: keys[0], flow: keys, i: 0 }; scRenderModal(); } return; }
  if (a === 'flowNext') return scFlowNext();
  if (a === 'letter') return scOpenLetter(b.dataset.id);
  if (a === 'tg') {
    const s = scSet(b.dataset.k), f = b.dataset.f, on = b.getAttribute('aria-pressed') !== 'true';
    s[f] = on; if (f === 'list') { try { localStorage.setItem('sc_list', on ? '1' : '0'); } catch (x) {} }
    scQueueSave(scRecEnsure(SC.year)); SC.model = scModel(SC.year); return scRenderModal();
  }
  if (a === 'pill') { const cur = SC.pill && SC.pill.k === b.dataset.k && SC.pill.p === b.dataset.p; SC.pill = cur ? null : { k: b.dataset.k, p: b.dataset.p }; return scRenderModal(); }
  if (a === 'viaSet') { scSet(b.dataset.k).via = b.dataset.v; scQueueSave(scRecEnsure(SC.year)); SC.model = scModel(SC.year); return scRenderModal(); }
  if (a === 'manual') { stSwitchTab('dashboard'); setTimeout(() => { if (typeof sdNew === 'function') { SD.d = sdNew(); SD.d.property_id = CASA_PROP_ID; SD.modal = 'calc'; sdRenderModal(); } }, 80); return; }
  if (a === 'posAdd' || a === 'posEdit' || a === 'posSet' || a === 'posDel') {
    const r = scRecEnsure(SC.year), list = (r.tenants.__pos = r.tenants.__pos || []);
    if (a === 'posAdd') { const id = Date.now().toString(36); list.push({ id, label: b.dataset.l, amount: null, key: b.dataset.key || 'personen', spread: 'year' }); SC.posEdit = id; }
    if (a === 'posEdit') SC.posEdit = SC.posEdit === b.dataset.id ? null : b.dataset.id;
    if (a === 'posSet') { const p = list.find(x => x.id === b.dataset.id); if (p) p[b.dataset.f] = b.dataset.v; }
    if (a === 'posDel') { r.tenants.__pos = list.filter(x => x.id !== b.dataset.id); SC.posEdit = null; }
    scQueueSave(r); SC.model = scModel(SC.year); scRenderModal(); stRenderCasaQuiet(); return;
  }
  if (a === 'vzReset') { const s = scSet(b.dataset.k); delete s.vzMonths; delete s.vz; scQueueSave(scRecEnsure(SC.year)); SC.model = scModel(SC.year); return scRenderModal(); }
  if (a === 'extraNew') { SC.modal = { view: 'extra', room: b.dataset.room }; return scRenderModal(); }
  if (a === 'extraSave') {
    if (SC._xSaving) return;                                  // C6: a 2nd tap while it saves adds nothing (the tenant counted twice)
    const v = id => (document.getElementById(id) || {}).value || '';
    const name = v('scxName').trim(), from = scD(v('scxFrom')), to = scD(v('scxTo'));
    if (!name || !from) { stSay('Please enter the name and the move-in'); return; }
    const y = SC.year, r = scRecEnsure(y), nk = cxParse(v('scxNk'));
    const x = { id: Date.now().toString(36), name, room: v('scxRoom'), from, to: to || null, nk: nk === null ? 0 : cxR(nk),
      addr: v('scxAddr').split(/\s*,\s*/).filter(Boolean).join('\n') };
    (r.tenants.__extra = r.tenants.__extra || []).push(x);
    SC._xSaving = true; b.disabled = true;                    // drawn disabled too (scExtraView): a redraw keeps it
    try { await scSaveRec(r); }
    catch (err) { r.tenants.__extra = r.tenants.__extra.filter(e => e !== x); stSay('Saving failed — ' + (err.message || err)); return; }   // not saved → not kept (a retry adds it once)
    finally { SC._xSaving = false; document.querySelectorAll('[data-sc="extraSave"]').forEach(e => { e.disabled = false; }); }
    if (SC.modal && SC.modal.view === 'extra') SC.modal = null;   // a pop-up opened meanwhile stays
    SC.model = scModel(SC.year); stRenderCasa(); stSay(name + ' added for ' + y); return;
  }
  if (a === 'extraDel') {
    if (!(await stConfirm({ title: 'Remove this tenant?', text: 'Only from ' + stNkLabel(M.per.from, M.per.to) + ' – nothing changes in Casa Castel › Tenants.', ok: 'Remove', danger: true }))) return;
    const r = scRecEnsure(SC.year), id = String(b.dataset.k).replace(/^x:/, '');
    r.tenants.__extra = (r.tenants.__extra || []).filter(x => x.id !== id); delete r.tenants[b.dataset.k];
    try { await scSaveRec(r); } catch (err) { stSay('Saving failed — ' + (err.message || err)); return; }
    SC.modal = null; SC.model = scModel(SC.year); return stRenderCasa();
  }
  if (a === 'lock') return scLock(b);
  if (a === 'unlock') return scUnlock();
  if (a === 'listPdf') return scListPdf(b);
  if (a === 'pdf') return scPdf(b.dataset.k, b);
  if (a === 'send') return scSend(b.dataset.k, b);
  if (a === 'settle') {
    const t = M && M.ten.find(x => x.key === b.dataset.k);
    if (t && t.extra) {                                           // added tenant: no booking in Controlling – just mark it
      const y = SC.year, m0 = SC.modal;
      if (!(await stConfirm({ title: 'Mark ' + t.name + '\'s NK-Abrechnung as settled?', ok: 'Settled' }))) return;
      const s = scSet(t.key); if (s.sent) s.sent.settled = cxToday();
      try { await scSaveRec(scRecEnsure(y)); } catch (err) {}
      return scSaveEnd(y, t.key, m0);
    }
    SC.modal = { view: 'ten', key: b.dataset.k }; return scRenderModal();   // Oct 2026: no separate settle level
  }
  if (a === 'payOn') {                                              // the money switch: full amount today (change it under "Payment details")
    const t = M && M.ten.find(x => x.key === b.dataset.k); if (!t) return;
    if (t.extra) { const y = SC.year, m0 = SC.modal, s2 = scSet(t.key); if (s2.sent) s2.sent.settled = cxToday(); try { await scSaveRec(scRecEnsure(y)); } catch (err) {} return scSaveEnd(y, t.key, m0); }
    const res = t.st && t.st.res; if (!res) { stSay('Send the letter first'); return; }
    const date = scD(scPayVal('date')) || cxToday();
    if (res.via && res.via !== 'zahlung') {
      b.disabled = true;
      try { await _stConfirmSettled(t.line, res.via, date); } catch (err) { stSay('Could not save — ' + (err.message || err)); b.disabled = false; return; }
      ctlSettlementInvalidate(); stSay('Settled'); const m0 = SC.modal; SC.model = scModel(SC.year); stRenderCasa(); SC.modal = m0; return scRenderModal();
    }
    return scSetAmount(t.key, scPayVal('amt') ?? cxE2(res.amount), b, date);
  }
  if (a === 'backTen') { SC.setEdit = null; const m = SC.modal; SC.modal = (m && m.back) || { view: 'ten', key: m && m.key }; return scRenderModal(); }
  if (a === 'setOk') return scSetAmount(b.dataset.k, stSetVal(b), b);
  if (a === 'setEdit') { SC.setEdit = 'c:' + b.dataset.k; scRenderModal(); const inp = document.querySelector('#scModal input[data-stset="' + SC.setEdit + '"]'); if (inp) { inp.focus(); inp.select(); } return; }
  if (a === 'setCancel') { SC.setEdit = null; return scRenderModal(); }
  if (a === 'setUndo') return scSetUndo(b.dataset.k);
  if (a === 'skip') return scSkip(b.dataset.k);
  if (a === 'reopen') {
    const t = M && M.ten.find(x => x.key === b.dataset.k);
    if (t && t.extra) { const y = SC.year, m0 = SC.modal; if (!(await stConfirm({ title: 'Back to open?', ok: 'Back to open' }))) return; delete scSet(t.key).sent; try { await scSaveRec(scRecEnsure(y)); } catch (err) {} return scSaveEnd(y, t.key, m0); }
    return scReopen(b.dataset.k);
  }
}
const scPayVal = f => { const el = document.querySelector('#scModal [data-scpay="' + f + '"]'); return el ? el.value : null; };
/* A change in the fields after the switch is on: the same booking moves / changes (never a second one) */
async function scPayEdit(el) {
  const M = SC.model, t = M && M.ten.find(x => x.key === el.dataset.k); if (!t || t.k !== 'done' || !t.st || !t.st.res) return;
  const res = t.st.res, date = scD(scPayVal('date')) || cxToday();
  if (res.via && res.via !== 'zahlung') {
    try { await _stConfirmSettled(t.line, res.via, date); } catch (err) { stSay('Could not save — ' + (err.message || err)); return; }
    ctlSettlementInvalidate(); stSay('Date saved'); const m0 = SC.modal; SC.model = scModel(SC.year); stRenderCasa(); SC.modal = m0; return scRenderModal();
  }
  return scSetAmount(t.key, scPayVal('amt') ?? cxE2(res.amount), null, date);
}
function scInput(e) {
  const el = e.target;
  if (el && el.dataset && el.dataset.scja) return scJaInput(el);              // Jahresabrechnungen pop-up
  if (el && el.dataset && el.dataset.scpay) return scPayEdit(el);
  if (el && el.dataset && el.dataset.scPos) {                         // typed house position
    const r = scRecEnsure(SC.year), p = (r.tenants.__pos || []).find(x => x.id === el.dataset.id); if (!p) return;
    const f = el.dataset.scPos;
    if (f === 'amount') { const n = cxParse(el.value); p.amount = n === null ? null : cxR(n); } else p[f] = f === 'date' ? scD(el.value) : el.value;
    scQueueSave(r); SC.model = scModel(SC.year); scRenderModal(); stRenderCasaQuiet(); return;
  }
  if (el && el.dataset && el.dataset.scIn === 'vzm') {                // NK paid, one month
    const s = scSet(el.dataset.k), n = cxParse(el.value);
    s.vzMonths = s.vzMonths || {};
    if (el.value.trim() === '' || n === null) delete s.vzMonths[el.dataset.ym]; else s.vzMonths[el.dataset.ym] = cxR(n);
    delete s.vz;
    scQueueSave(scRecEnsure(SC.year)); SC.model = scModel(SC.year); scRenderModal(); stRenderCasaQuiet(); return;
  }
  const f = el && el.dataset && el.dataset.scIn; if (!f) return;
  const s = scSet(el.dataset.k);
  let v = el.value;
  if (f === 'vz') { const n = cxParse(v); s.vz = v.trim() === '' || n === null ? null : cxR(n); }
  else if (f === 'days') s.days = Math.max(0, Math.round(Number(v) || 0)) || 30;
  else s[f] = v;
  scQueueSave(scRecEnsure(SC.year));
  if (f === 'vz' || f === 'via') { SC.model = scModel(SC.year); scRenderModal(); stRenderCasaQuiet(); }
}
function stRenderCasaQuiet() { const m = SC.modal; stRenderCasa(); SC.modal = m; scRenderModal(); }
/* C6: the end of a save started in a Casa pop-up (or on the Casa page): back to that tenant, or on in 'Send letters',
   only while the owner is still where it started (Casa tab, that year, that pop-up or none). Moved on meanwhile (other
   tab or year, another tenant, X, next ›): only what is on screen now is drawn again.
   how: 'next' = on to the next letter in 'Send letters' · 'keep' = stay in 'Send letters' · else the tenant's pop-up */
function scSaveEnd(y, key, m0, how) {
  const here = ST.tab === 'casa' && SC.year === y && SC.modal === m0 && (!m0 || m0.key === key);
  if (SC.year === y) SC.model = scModel(y);
  stRenderCasa();
  if (!here) return;
  const flow = m0 && m0.flow ? m0 : null;
  if (flow && how === 'next') return scFlowNext();
  SC.modal = flow && how === 'keep' ? flow : { view: 'ten', key }; scRenderModal();
}
function scFlowNext() {
  const m = SC.modal; if (!m || !m.flow) return;
  const left = m.flow.filter((k, i) => i > m.i && (SC.model.ten.find(t => t.key === k) || {}).k === 'open');
  if (!left.length) { SC.modal = null; stSay('That was the last letter'); return stRenderCasa(); }
  m.i = m.flow.indexOf(left[0]); m.key = left[0]; scRenderModal();
}

/* Nov 2026 · a year locked before the returns rule (settlements-returns.js): its snapshot still holds a Maintenance
   return as a line of its own — the letters would show it. Unlock and lock again (the numbers then follow the rule). */
const SC_RET_OLD = 'This year was locked with Maintenance returns as lines of their own. Unlock and lock it again, then the letters and the Belegliste can be made.';
function scRetOld(M) {
  if (!M || !M.locked || !M.input || typeof stRetIsLine !== 'function') return false;
  return (M.input.lines || []).some(l => {
    const id = String(l.id || ''); if (l.group !== 'oneoff' || id.indexOf('ot:') !== 0) return false;
    const o = scJaFindBk(id.slice(3));
    return o ? stRetIsLine(o) : /R\u00fcckgabe zu Beleg/.test(String(l.label || '') + ' ' + String((l.info || {}).item || ''));
  });
}
async function scLock(btn) {
  const M = SC.model; if (!M || M.locked) return;
  const gaps = M.running ? [] : (M.jaGaps || []);           // Nov 2026: every day of the year covered by a Jahresabrechnung (or "no bill")
  if (gaps.length) { stSay('Jahresabrechnung missing: ' + gaps.map(g => g.l + ' ' + scJaSpan(g.from, g.to)).join(' · ') + ' – add it or mark \u201cno bill\u201d under Jahresabrechnungen'); return; }
  // D39: Teil B (Maintenance) did not load → try once more; a year is never locked without it (the snapshot would
  // keep "no Teil B" for good). Checked again after "Lock anyway?": the year can load again meanwhile (app back in front)
  const ready = async () => {
    const d = SC.data[M.y];
    if (!d) { stSay(M.y + ' is still loading – try again in a moment'); return false; }
    // Nov 2026: the Maintenance returns did not load → once more; never locked without them (a receipt would freeze at gross)
    if (typeof ST_RET !== 'undefined' && ST_RET.error) {
      await stLoadReturns();
      if (ST_RET.error) { stSay(stRetFailTxt + ', then lock'); return false; }
      SC.model = scModel(M.y); stRenderCasaQuiet(); stSay('The returns are loaded now – check the numbers, then lock'); return false;
    }
    if (!(d.mt && d.mt.error)) return true;
    const mt = await scLoadTeilB(d.per || scPeriod(M.y));
    if (mt && mt.error) { stSay('Teil B (Maintenance) could not be loaded – reload the page, then lock'); return false; }
    d.mt = mt; stRenderCasaQuiet(); stSay('Teil B is loaded now – check it, then lock'); return false;
  };
  if (!(await ready())) return;
  if (M.warn.length && !(await stConfirm({ title: 'Lock the house costs anyway?', text: M.warn.length + ' point(s) to check:\n' + M.warn.join('\n'), ok: 'Lock anyway' }))) return;
  if (!(await ready())) return;
  // the snapshot is what is on screen now: a point to check that came in meanwhile (fresh data) is shown first
  const M2 = scModel(M.y);
  if (!M2 || M2.loading || M2.error || !M2.R) { stSay(M.y + ' is still loading – try again in a moment'); return; }
  if (M2.locked) { stRenderCasaQuiet(); stSay('Costs locked'); return; }
  if ((M2.warn || []).some(w => !M.warn.includes(w))) { stRenderCasaQuiet(); stSay('The numbers changed meanwhile – check them, then lock'); return; }
  const r = scRecEnsure(M.y);
  const input = scInputFor(M.y);
  input.tenancies = (input.tenancies || []).map(t => { const c = Object.assign({}, t); delete c._exp; return c; });   // the snapshot keeps data only
  r.snapshot = { input, total: M2.R.check.total, at: new Date().toISOString() };
  r.locked_at = new Date().toISOString();
  if (btn) btn.disabled = true;
  try { await scSaveRec(r); stSay('Costs locked'); }
  catch (e) { r.locked_at = null; r.snapshot = null; stSay(SC.missing ? 'Please run the Casa Castel settlements SQL first' : 'Saving failed — ' + (e.message || e)); }
  stRenderCasa();                                                   // Oct 2026: the house costs modal stays open (the switch just flips)
}
async function scUnlock() {
  const M = SC.model; if (!M || !M.locked) return;
  const sent = M.ten.filter(t => t.k === 'sent' || t.k === 'done').length;
  if (!(await stConfirm({ title: 'Unlock the house costs?', text: 'The numbers then follow Controlling again.' + (sent ? '\n' + sent + ' letter(s) were already sent – they stay as sent and archived.' : ''), ok: 'Unlock' }))) return;
  const r = scRecEnsure(M.y); const keep = { locked_at: r.locked_at, snapshot: r.snapshot };
  r.locked_at = null; r.snapshot = null;
  try { await scSaveRec(r); delete SC.data[M.y]; stSay('Costs unlocked'); }
  catch (e) { Object.assign(r, keep); stSay('Saving failed — ' + (e.message || e)); }
  stRenderCasa();
}

async function scPdf(key, btn) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t) return;
  if (scRetOld(M)) { stSay(SC_RET_OLD); return; }
  const reset = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Creating PDF'; btn.disabled = true; }
  try {
    const out = await nkLetterPdf(await scLetterData(M, t), scFileName(M, t));
    await ccOpenPdf(out.blob, out.name);
  } catch (e) { console.error('[settlements] casa PDF', e); stNotice('The PDF could not be created. Please try again.'); }
  finally { if (btn) { btn.innerHTML = reset; btn.disabled = false; } }
}
async function scListPdf(btn) {
  const M = SC.model; if (!M) return;
  if (scRetOld(M)) { stSay(SC_RET_OLD); return; }
  if (typeof loadSettings === 'function') { try { await loadSettings(); } catch (e) {} }
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const house = scHouse();
  const ex = M.input.lines.filter(l => l.info);
  const d = { brand: 'Casa Castel', unitLabel: 'NK', unitName: String(M.y), footer: house.join(' \u00b7 '), listOnly: true,
              extra: { title: 'Belegliste ' + M.y + ' \u00b7 Einzelrechnungen', intro: 'Hausgeld-Jahresabrechnungen und Einzelrechnungen, die in die Nebenkosten ' + M.y + ' eingeflossen sind.',
                       rows: ex.map(l => [l.info.date, l.info.item || l.label, l.info.company || '', l.info.amount]), sum: cxR(ex.reduce((a, l) => a + l.info.amount, 0)) } };
  const reset = btn ? btn.innerHTML : ''; if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Creating PDF'; }
  try { const out = await nkLetterPdf(d, ccPdfFileName('Belegliste', M.y, 'Casa-Castel')); await ccOpenPdf(out.blob, out.name); }
  catch (e) { console.error(e); stNotice('The PDF could not be created. Please try again.'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = reset; } }
}

/* Mark as sent: letter → archive, result → Controlling (same path as Rentals)
   C6: one letter at a time — while it saves every 'Mark as sent' is drawn off (this one 'Saving'), so a redraw of the
   pop-up meanwhile (Letter details, a fold) does not give the button back for a 2nd letter and result. Once done the
   pop-up is drawn again (its end drew it while the letter still counted as saving) */
async function scSend(key, btn) {
  if (SC.sending) return;
  SC.sending = key;
  try { return await _scSendNow(key, btn); }
  finally { SC.sending = null; if (SC.modal) scRenderModal(); }
}
async function _scSendNow(key, btn) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key), m0 = SC.modal; if (!t) return;
  if (!M.locked) { stSay('Lock the house costs first'); return; }
  if (scRetOld(M)) { stSay(SC_RET_OLD); return; }
  if (t.extra) return scSendExtra(M, t, btn, m0);
  if (!t.line) { stSay('This tenant is not in the settlement list – check move-in / move-out in Casa Castel'); return; }
  const s = t.set || {};
  const amount = Math.abs(t.saldo), dir = t.saldo > 0 ? 1 : t.saldo < 0 ? -1 : 0;
  const via = t.einbehalt > 0 ? 'kaution' : dir ? scVia(t) : 'zahlung';   // B20: settled with the Kaution-Einbehalt
  const amountRec = amount;
  const date = s.date || cxToday();
  const reset = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Saving'; }
  clearTimeout(SC.saveTimer); try { await scSaveRec(scRecEnsure(M.y)); } catch (e) {}
  let pdf = null;
  try { pdf = await nkLetterPdf(await scLetterData(M, t), scFileName(M, t)); } catch (e) { console.warn('[settlements] letter for archive', e); }
  const r = t.it.r;
  const resRow = { property_id: CASA_PROP_ID, kind: 'nk_tenant', year: M.y, period_from: t.from, period_to: t.to, app: 'casa', tenant_id: t.tenantId || null,
                   unit_label: t.room || null, tenant_name: t.name || null, direction: dir, amount: cxR(amountRec), result_date: date,
                   due_date: dir ? NkCasa.addDays(date, Number(s.days ?? 30) || 30) : null, settle_via: via, status: 'fertig', source: 'settlements_app' };
  const before = { status: r.status || 'offen', amount: r.amount ?? null, direction: r.direction ?? null, settled_via: r.settled_via ?? null, result_id: r.result_id ?? null };
  let row;
  try { row = await _stUpsertSettlement(t.line, { status: 'verschickt', amount: cxR(amountRec), direction: dir, settled_via: via }); }
  catch (err) { stSay(_stSqlMissing(err) ? 'Please run the Settlements SQL in Supabase first' : 'Saving failed — ' + (err.message || err)); if (btn) { btn.disabled = false; btn.innerHTML = reset; } return; }
  try {
    const saved = await _stWriteResult(null, resRow);
    await _ctlSupa.from('ctrl_settlements').update({ result_id: saved.id }).eq('id', row.id);
    row.result_id = saved.id;
  } catch (err) {
    await _ctlSupa.from('ctrl_settlements').update(before).eq('id', row.id);
    Object.assign(row, before);
    stSay('Saving failed — ' + (err.message || err));
    if (btn) { btn.disabled = false; btn.innerHTML = reset; }
    ctlSettlementInvalidate(); stRenderCasa(); return;
  }
  if (pdf) await scArchive(M, t, pdf, { dir, amount: cxR(amountRec), addr: String(s.addr !== undefined ? s.addr : scAddrDefault(t).join('\n')) });
  ctlSettlementInvalidate();
  stSay('Marked as sent');
  scSaveEnd(M.y, key, m0, 'next');
}
async function scSendExtra(M, t, btn, m0) {
  const s = scSet(t.key), dir = t.saldo > 0 ? 1 : t.saldo < 0 ? -1 : 0, date = s.date || cxToday();
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Saving'; }
  let pdf = null;
  try { pdf = await nkLetterPdf(await scLetterData(M, t), scFileName(M, t)); } catch (e) { console.warn('[settlements] letter', e); }
  s.sent = { date, dir, amount: cxR(Math.abs(t.saldo)), via: dir ? scVia(t) : 'zahlung' };
  try { await scSaveRec(scRecEnsure(M.y)); } catch (e) { stSay('Saving failed — ' + (e.message || e)); return; }
  if (pdf) await scArchive(M, t, pdf, { dir, amount: s.sent.amount, addr: String(s.addr !== undefined ? s.addr : scAddrDefault(t).join('\n')) });
  stSay('Marked as sent');
  scSaveEnd(M.y, t.key, m0, 'next');
}
async function scArchive(M, t, pdf, x) {
  if (SC.lettersMissing) { stSay('Marked as sent · run the archive SQL to keep a copy of the letter'); return; }
  try {
    const path = 'casa/' + M.y + '/' + Date.now() + '-' + pdf.name;
    const up = await _ctlSupa.storage.from(SC_BUCKET).upload(path, pdf.blob, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw up.error;
    const row = { app: 'casa', property_id: CASA_PROP_ID, year: M.y, period_from: t.from, period_to: t.to, tenant_id: t.tenantId || null, tenant_name: t.name,
                  unit_label: t.room, address: x.addr || null, direction: x.dir, amount: x.amount, file_path: path, file_name: pdf.name, source: 'app', sent_at: new Date().toISOString() };
    const ins = await _ctlSupa.from(SC_LETTERS).insert(row).select().single();
    if (ins.error) throw ins.error;
    SC.letters.unshift(ins.data);
  } catch (e) { console.warn('[settlements] archive', e); stSay('Marked as sent · the letter could not be archived (' + (e.message || e) + ')'); }
}
async function scOpenLetter(id) {
  const L = SC.letters.find(l => String(l.id) === String(id)); if (!L) return;
  try {
    const { data, error } = await _ctlSupa.storage.from(SC_BUCKET).createSignedUrl(L.file_path, 600);
    if (error || !data) throw error || new Error('no link');
    ccOpenUrl(data.signedUrl, L.file_name || 'NK-Abrechnung.pdf');
  } catch (e) { stSay('The letter could not be opened — ' + (e.message || e)); }
}

async function scReopen(key) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key), m0 = SC.modal; if (!t || !t.line) return;
  const res = t.st && t.st.res, b = res ? ctlAbrBooking(res) : null;
  if (!(await stConfirm({ title: 'Set ' + t.name + ' back to open?', ok: 'Back to open', danger: true,
    text: b ? _stUndoText(b, scDate, scE) : res ? 'The result disappears from Controlling.' : '' }))) return;
  try {
    if (res) await ctlAbrStorno(res);                           // own booking removed · your own entry only unlinked · result cancelled
    if (!(t.it.r._virtual || String(t.it.r.id).startsWith('v:'))) await ctlSettleOpen(t.it.r);   // shared with Controlling's 'cancel' (C1 #4)
  } catch (e) { stSay('Failed — ' + (e.message || e)); return; }
  ctlSettlementInvalidate(); stSay('Back to open');
  scSaveEnd(M.y, key, m0);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && SC.modal) { SC.modal = null; scRenderModal(); } });

/* C6: each of these is one save from its first write to its last (settlements-tab-tracking.js) */
if (typeof ctlWriting === 'function') { scSend = ctlWriting(scSend); scSetAmount = ctlWriting(scSetAmount); scSetUndo = ctlWriting(scSetUndo); scSkip = ctlWriting(scSkip); }
