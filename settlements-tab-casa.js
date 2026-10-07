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

const scD = iso => String(iso || '').slice(0, 10);
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
async function scLoadRows() {
  SC.loading = true;
  try {
    const r = await _ctlSupa.from(SC_TABLE).select('*').order('year');
    if (r.error) { SC.missing = true; SC.rows = []; } else { SC.missing = false; SC.rows = r.data || []; }
    const l = await _ctlSupa.from(SC_LETTERS).select('*').order('sent_at', { ascending: false });
    if (l.error) { SC.lettersMissing = true; SC.letters = []; } else { SC.lettersMissing = false; SC.letters = l.data || []; }
  } finally { SC.loaded = true; SC.loading = false; }
}
/* The Casa Castel period that ends in year y — from "beginnt am" in Controlling › Setup */
function scPeriod(y) {
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID) || {};
  return ctlPeriodEndingIn(p, Number(y));
}
async function scLoadYear(y) {
  if (SC.data[y]) return SC.data[y];
  const per = scPeriod(y), y0 = Number(per.from.slice(0, 4)), y1 = Number(per.to.slice(0, 4));
  const [c, o] = await Promise.all([
    _ctlSupa.from('ctrl_expense_castel').select('*').gte('year', y0).lte('year', y1),
    _ctlSupa.from('ctrl_expense_one_time').select('*').eq('property_id', CASA_PROP_ID).gte('invoice_date', per.from).lte('invoice_date', per.to),
  ]);
  if (c.error) throw c.error;
  if (o.error) throw o.error;
  return (SC.data[y] = { castel_expenses: c.data || [], one_time: o.data || [], per });
}
const scRec = y => SC.rows.find(r => Number(r.year) === Number(y)) || null;
function scRecEnsure(y) {
  let r = scRec(y);
  if (!r) { const per = scPeriod(y); r = { year: y, period_from: per.from, period_to: per.to, locked_at: null, snapshot: null, tenants: {} }; SC.rows.push(r); }
  r.tenants = r.tenants || {};
  return r;
}
async function scSaveRec(r) {
  const payload = { year: r.year, period_from: r.period_from, period_to: r.period_to, locked_at: r.locked_at || null,
                    snapshot: r.snapshot || null, tenants: r.tenants || {}, updated_at: new Date().toISOString() };
  const { data, error } = await _ctlSupa.from(SC_TABLE).upsert(payload, { onConflict: 'year' }).select().single();
  if (error) throw error;
  Object.assign(r, data);
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
function scVzMonths(input, y) {
  const T = input.tenancies, inc = window._src.incAll || [];
  for (const t of T) { t.vzMap = {}; t.vzAuto = 0; t.vzContract = 0; }
  for (const ym of (input.months || [])) {
    const yy = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), dim = new Date(yy, m, 0).getDate();
    const mFrom = ym + '-01', mTo = ym + '-' + String(dim).padStart(2, '0');
    const groups = {};
    for (const t of T) {
      if (t.mode !== 'nk') continue;
      const a = t.from > mFrom ? t.from : mFrom, b = t.to < mTo ? t.to : mTo; if (a > b) continue;
      const days = NkCasa.daysBetween(a, b), g = t.unitId === null || t.unitId === undefined ? 'solo:' + t.key : t.unitId;
      (groups[g] = groups[g] || []).push({ t, days, a });
    }
    for (const g of Object.keys(groups)) {
      const list = groups[g], row = g.startsWith('solo:') ? null : inc.find(r => String(r.unit_id) === String(g) && Number(r.year) === yy && Number(r.month) === m);
      const sumDays = list.reduce((a, x) => a + x.days, 0);
      for (const x of list) {
        const amt = row ? (Number(row.nebenkosten) || 0) * x.days / sumDays : scContractNk(x.t, ym, x.a) * x.days / dim;
        x.t.vzMap[ym] = { amt: cxR(amt), src: row ? 'paid' : 'contract' };
        x.t.vzAuto += amt; if (!row) x.t.vzContract++;
      }
    }
  }
  for (const t of T) { t.vzAuto = cxR(t.vzAuto); t.vz = t.vzAuto; t.vzMissing = []; }
}
function scInputFor(y) {
  const d = SC.data[y], per0 = d.per || scPeriod(y);
  const casa = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID);
  const tenancies = casa && typeof ctlTenanciesFor === 'function' ? ctlTenanciesFor(casa, per0, false) : null;
  const input = NkCasa.fromControlling(y, { castel_expenses: d.castel_expenses, one_time: d.one_time, income: window._src.incAll || [], period: per0, tenancies });
  if (input.error) return input;
  const ts = (scRec(y) || {}).tenants || {};
  for (const p of (ts.__pos || [])) {
    const amt = Number(p.amount) || 0; if (!amt) continue;
    const from = p.spread === 'from' && p.date;
    input.lines.push({ id: 'typed:' + p.id, label: p.label || 'Position', group: 'typed', key: p.key === 'flaeche' ? 'flaeche' : 'personen',
                       parts: [from ? { amount: amt, spread: 'from', date: p.date } : { amount: amt, spread: 'year' }],
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
  scVzMonths(input, y);
  input.warn = (input.warn || []).filter(w => !/NK paid missing/.test(w));
  return input;
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
  const R = NkCasa.calc(input);
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
    const kau = null, einbehalt = 0;                       // Kaution stays in Casa Castel › Tenants (handled by hand)
    const k = t.mode === 'pauschal' ? 'none' : skipped ? 'done' : st && st.res ? (st.k === 'erledigt' ? 'done' : 'sent') : 'open';
    const tr = (window._src.casaTen || []).find(x => String(x.id) === String(t.tenantId)) || null;
    const movedOut = t.to < input.period.to || !!(tr && tr.mietende && scD(tr.mietende) < today);
    return Object.assign({}, t, { it, line, st, skipped, k, tr, movedOut, vzMissing: src.vzMissing || [], vzAuto: src.vzAuto ?? src.vz, vzMap: src.vzMap || {}, vzContract: src.vzContract || 0,
                                  extra: !!src.extra, xAddr: src.addr || '', set: ts[t.key] || {}, kau, einbehalt, _exp: src._exp || null });
  });
  // one net amount per tile: > 0 money comes to you · < 0 you pay — results where sent, else the preview
  const money = { ten: null, nIn: 0, nOut: 0, hg: null, hgLines: [], back: 0, get: 0 };
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
  return { p, y, rec, locked, input, R, ten, perM, frist, per: input.period, running: input.period.to >= today, sendable: !!perM, warn: input.warn || [], money, today };
}

/* ── Overview ─────────────────────────────────────────────── */
function stRenderCasa() {
  const el = document.getElementById('tab-casa'); if (!el) return;
  scEnsureHost();
  if (!SC.loaded) {
    el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">Loading …</p></div>';
    if (!SC.loading) scLoadRows().then(() => { if (ST.tab === 'casa') stRenderCasa(); });
    return;
  }
  const ty = Number(cxToday().slice(0, 4));
  if (!SC.year) SC.year = ty - 1;
  const y = SC.year;
  const rec = scRec(y);
  if (!SC.data[y] && !(rec && rec.locked_at)) {
    el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">Loading ' + y + ' …</p></div>';
    scLoadYear(y).then(() => { if (ST.tab === 'casa' && SC.year === y) stRenderCasa(); })
      .catch(e => { el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">Could not load ' + y + '.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>'; });
    return;
  }
  let M;
  try { M = scModel(y); } catch (e) {
    console.error('[settlements] casa', e);
    el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">Could not calculate the NK-Abrechnung.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>';
    return;
  }
  if (M.error) { el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">' + stEsc(M.error) + '</p></div>'; return; }
  SC.model = M;

  const nk = M.ten.filter(t => t.k !== 'none');
  const grp = k => M.ten.filter(t => t.k === k);
  const open = grp('open'), sent = grp('sent'), done = grp('done'), none = grp('none');
  const per = M.per;
  const yearNav = '<div class="sc-yr">' +
    '<button class="cx-arw" data-sc="year" data-d="-1" aria-label="Previous year"' + (y <= scMinYear() ? ' disabled' : '') + '><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="sc-yr__t"><div class="sc-yr__m">' + y + '</div><div class="sc-yr__s">' + stNkLabel(per.from, per.to) + ' · ' + (M.running ? 'still running' : M.sendable ? 'Frist ' + stDe(M.frist) : 'Frist passed · history') + '</div></div>' +
    '<button class="cx-arw" data-sc="year" data-d="1" aria-label="Next year"' + (y >= ty ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
  const sql = SC.missing || SC.lettersMissing
    ? '<div class="st-soon"><i class="ti ti-database" aria-hidden="true"></i><div><strong>Run the SQL once</strong><span>' +
      (SC.missing ? 'The table nk_abrechnung_casa is missing. ' : '') + (SC.lettersMissing ? 'The letter archive (nk_letters) is missing. ' : '') + 'The SQL is in the chat.</span></div></div>' : '';

  // progress · Tenants + Hausgeld (one net amount each) · Needs you · house costs · rooms
  const total = nk.length, nDone = done.length;
  const progress = stProgress({ done: nDone, sent: sent.length, total, open: open.length, first: M.locked ? 'House costs locked' : 'House costs not locked' });
  const mo = M.money, pv = !M.locked ? 'preview · ' : '';
  const tenSub = mo.ten === null ? 'no house costs yet' : pv + mo.nIn + (mo.nIn === 1 ? ' pays you' : ' pay you') + ' · ' + mo.nOut + (mo.nOut === 1 ? ' gets back' : ' get back');
  const hgSub = mo.hg === null ? 'Strom · Gas · Wasser · no Jahresabrechnung yet' : 'Strom · Gas · Wasser · ' + mo.hgLines.length + ' in';
  const tiles = '<div class="st-money">' + stTile('Tenants', 'users', mo.ten, tenSub, 'data-sc="sumTen"') + stTile('Hausgeld', 'receipt', mo.hg, hgSub, 'data-sc="sumHg"') + '</div>';

  const L = M.R.check;
  const noData = !M.locked && !M.R.lines.length;
  const label = stNkLabel(per.from, per.to);
  const needs = [];
  if (M.running) needs.push({ tone: 'calm', icon: 'clock', t: 'Still running', s: 'NK-Abrechnung after ' + stDe(per.to) + ' · the numbers are a preview' });
  else if (!M.sendable) needs.push({ tone: 'calm', icon: 'archive', t: 'Frist passed', s: 'letters and results stay here as history' });
  if (noData) needs.push({ tone: 'gold', icon: 'pencil', t: 'Type the house costs', s: 'nothing booked in Controlling for ' + stPer(per.from, per.to), act: 'data-sc="costs"' });
  else if (M.sendable && !M.locked) needs.push({ tone: 'gold', icon: 'lock', t: 'Lock house costs', s: label + ' · then the letters can be sent', act: 'data-sc="costs"' });
  else if (M.sendable && open.length) needs.push({ tone: 'gold', icon: 'send', t: open.length + (open.length === 1 ? ' letter ready' : ' letters ready'), s: open.map(t => t.room).join(', '), act: 'data-sc="start"' });
  for (const t of sent) if (t.st && t.st.confirm) needs.push({ tone: 'gold', icon: 'check', t: 'Confirm ' + (t.st.res.via === 'miete' ? 'settlement with the rent' : 'settlement via Kaution'),
    s: t.name + ' · ' + t.room + ' · ' + scE(t.st.res.amount), act: 'data-sc="settle" data-k="' + stEsc(t.key) + '"' });
  const nowYm = cxToday().slice(0, 7);
  for (const t of open) {                                   // NK paid not booked in Controlling → taken from the contract
    const miss = Object.keys(t.vzMap || {}).filter(ym => ym < nowYm && t.vzMap[ym].src === 'contract' && !(t.set && t.set.vzMonths && t.set.vzMonths[ym] !== undefined));
    if (miss.length && !t.extra) needs.push({ tone: 'gold', icon: 'alert-circle', t: 'NK-Vorauszahlung not booked', s: t.room + ' · ' + miss.map(ym => SC_MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4)).join(', ') + ' · taken from the contract', act: 'data-sc="ten" data-k="' + stEsc(t.key) + '"' });
  }
  const need = stNeeds(needs, total && nDone === total ? label + ' is settled' : '');
  const costsCard = '<button class="sc-card sc-costs" data-sc="costs"><span class="sc-costs__i"><i class="ti ti-home" aria-hidden="true"></i></span>' +
    '<span class="sc-costs__t"><b>House costs</b><small class="' + (M.locked ? 'is-ok' : '') + '">' + (M.locked ? '<i class="ti ti-lock" aria-hidden="true"></i> locked ' + scDate(M.rec.locked_at) : 'not locked · preview') + (M.warn.length && !M.locked ? ' · ' + M.warn.length + ' to check' : '') + '</small></span>' +
    '<span class="sc-costs__v">' + scE(L.total) + '</span><i class="ti ti-chevron-right sc-chev" aria-hidden="true"></i></button>';
  const nTodo = M.ten.filter(t => t.k === 'open' || t.k === 'sent').length, nDoneT = M.ten.filter(t => t.k === 'done').length;
  const fchip = (k, l, n) => '<button class="st-chip' + (SC.filter === k ? ' is-on' : '') + '" data-sc="filter" data-k="' + k + '" aria-pressed="' + (SC.filter === k) + '">' + l + (n !== undefined ? '<span class="st-chip__n">' + n + '</span>' : '') + '</button>';
  const filter = '<div class="st-filter" role="group" aria-label="Filter">' + fchip('all', 'All') + fchip('open', 'To do', nTodo) + fchip('done', 'Done', nDoneT) + '</div>';

  const letters = scLettersHtml(y);
  const roomsHtml = scRoomsHtml(M);
  const nRooms = (window._src.rooms || []).filter(r => r.active !== false).length;

  el.innerHTML = '<div class="st-page sc-page">' + yearNav + sql + progress + tiles + need + costsCard + filter +
    stSec('Rooms', nRooms) + roomsHtml + letters +
    (!M.ten.length ? '<p class="cx-empty">No tenants with Kalt + NK in ' + stEsc(stPer(per.from, per.to)) + '.</p>' : '') + '</div>';
  scRenderModal();
}
function scNext(icon, t, s, act, btn) {
  return '<div class="sc-card sc-next"><span class="sc-next__i"><i class="ti ti-' + icon + '" aria-hidden="true"></i></span><div class="sc-next__t"><b>' + t + '</b><span>' + s + '</span></div>' +
    '<button class="sc-go" data-sc="' + act + '">' + btn + '</button></div>';
}
function scNextStart(open) {
  const av = open.slice(0, 3).map((t, i) => { const c = scAv(t.room); return '<span class="sc-av sc-av--s" style="background:' + c[0] + ';color:' + c[1] + (i ? ';margin-left:-10px' : '') + '">' + stEsc(scAbbr(t.room)) + '</span>'; }).join('');
  return '<div class="sc-card sc-start"><div class="sc-start__av">' + av + '</div><div class="sc-next__t"><b>' + open.length + (open.length === 1 ? ' letter' : ' letters') + ' ready</b><span>' +
    stEsc(open.map(t => t.room).join(', ')) + '</span></div><button class="sc-go sc-go--light" data-sc="start">Start <i class="ti ti-arrow-right" aria-hidden="true"></i></button></div>';
}
function scSay(t) {
  const s = t.saldo, a = scE(Math.abs(s));
  if (t.k === 'none') return ['', 'Pauschal – no NK'];
  if (t.k === 'done') {
    if (t.skipped) return ['', 'skipped'];
    const r = t.st.res, b = t.st.booking;
    if (!r) return ['', 'settled'];
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
  const per = stPer(t.from, t.to) + (t.movedOut ? ' · moved out' : '');
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
  const rows = M.ten.filter(t => t.k !== 'none' && !t.skipped).map(t => {
    const v = t.st && t.st.res ? t.st.res.dir * t.st.res.amount : t.saldo, c = scAv(t.room);
    return { av: c, ab: scAbbr(t.room), name: t.name, sub: t.room + ' · ' + stPer(t.from, t.to) + (t.k === 'open' && !M.locked ? ' · preview' : ''),
             amount: Math.abs(v) >= 0.005 ? Math.abs(v) : 0, dir: v > 0 ? 1 : -1, act: 'data-sc="ten" data-k="' + stEsc(t.key) + '"' };
  });
  const mo = M.money;
  return stSumSheet({ title: 'Tenants', sub: 'Casa Castel · ' + stNkLabel(M.per.from, M.per.to) + (M.locked ? '' : ' · preview'), net: mo.ten,
    sub2: mo.ten === null ? 'no house costs yet' : mo.nIn + (mo.nIn === 1 ? ' pays you' : ' pay you') + ' · ' + mo.nOut + (mo.nOut === 1 ? ' gets back' : ' get back'),
    groups: [{ title: 'Pay you', rows: rows.filter(r => r.amount && r.dir > 0) }, { title: 'Get back', rows: rows.filter(r => r.amount && r.dir < 0) },
             { title: 'Balanced', rows: rows.filter(r => !r.amount).map(r => Object.assign(r, { chip: ['grey', 'balanced'] })) }] }, 'data-sc="close"');
}
function scSumHg(M) {
  const rows = M.money.hgLines.map((l, i) => {
    const info = l.info || {};
    return { av: stAv(i + 5), ab: String(l.label || '?').slice(0, 2).toUpperCase(), name: l.label,
             sub: [info.company, info.date ? stDe(info.date) : ''].filter(Boolean).join(' · ') || 'Jahresabrechnung',
             amount: Math.abs(l.total), dir: l.total > 0 ? -1 : 1 };
  });
  return stSumSheet({ title: 'Hausgeld', sub: 'Casa Castel · Strom · Gas · Wasser · ' + stNkLabel(M.per.from, M.per.to), net: M.money.hg,
    sub2: rows.length ? rows.filter(r => r.dir < 0).length + ' Nachzahlung · ' + rows.filter(r => r.dir > 0).length + ' Guthaben' : 'no Jahresabrechnung yet',
    groups: [{ title: 'You pay', rows: rows.filter(r => r.dir < 0) }, { title: 'You get', rows: rows.filter(r => r.dir > 0) }] }, 'data-sc="close"');
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
  if (!m || !M) { h.innerHTML = ''; document.body.classList.remove('st-panel-open'); return; }
  let inner = '';
  if (m.view === 'costs') inner = scCostsView(M);
  else if (m.view === 'ten') inner = scTenView(M, m);
  else if (m.view === 'settle') inner = scSettleView(M, m);
  else if (m.view === 'extra') inner = scExtraView(M, m);
  else if (m.view === 'sumTen') inner = scSumTen(M);
  else if (m.view === 'sumHg') inner = scSumHg(M);
  h.innerHTML = '<div class="srm" role="dialog" aria-label="NK-Abrechnung Casa Castel"><div class="srm__bg" data-sc="close"></div><div class="srm__win sc-win">' + inner + '</div></div>';
  document.body.classList.add('st-panel-open');
}
const scHead = (t, s, back, pre) => '<div class="srm__h"><div class="srm__ht">' + (back ? '<button class="srm__back" data-sc="' + back + '"><i class="ti ti-chevron-left" aria-hidden="true"></i> Back</button>' : '') +
  (pre || '') + '<p class="srm__t">' + stEsc(t) + '</p><p class="srm__s">' + stEsc(s) + '</p></div><button class="srm__x" data-sc="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';

/* ── House costs sheet ── */
const SC_QUICK = [['Strom', 'personen'], ['Gas', 'flaeche'], ['Wasser / Abwasser', 'personen'], ['Müll', 'personen'], ['Grundsteuer', 'personen'], ['Versicherung', 'personen'], ['Internet', 'personen'], ['Reinigung', 'personen'], ['Schornsteinfeger', 'personen']];
function scTypedHtml(M) {
  const pos = ((scRec(M.y) || {}).tenants || {}).__pos || [], ed = SC.posEdit;
  const sum = cxR(pos.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const seg = (id, f, opts, cur) => '<div class="sc-seg">' + opts.map(([v, l]) => '<button class="' + (cur === v ? 'is-on' : '') + '" data-sc="posSet" data-id="' + id + '" data-f="' + f + '" data-v="' + v + '">' + l + '</button>').join('') + '</div>';
  const rows = pos.map(p => {
    const open = ed === p.id;
    return '<button class="sc-pos" data-sc="posEdit" data-id="' + p.id + '"><span><b>' + stEsc(p.label || 'Position') + '</b><small>' + scKeyTxt(p.key) + ' · ' + (p.spread === 'from' && p.date ? 'from ' + stDM(p.date) : 'whole year') + '</small></span><span class="sc-pos__v">' + (Number(p.amount) ? scE(p.amount) : '<em>amount?</em>') + '</span></button>' +
      (open ? '<div class="sc-ed sc-ped"><div class="sc-ped__r"><input class="st-in" data-sc-pos="label" data-id="' + p.id + '" value="' + stEsc(p.label || '') + '" placeholder="Kostenart"/>' +
        '<span class="st-amt sc-ped__a"><input class="st-in" inputmode="decimal" data-sc-pos="amount" data-id="' + p.id + '" value="' + (Number(p.amount) ? stEsc(cxE2(p.amount)) : '') + '" placeholder="per year"/><span>€</span></span></div>' +
        seg(p.id, 'key', [['personen', 'By person'], ['flaeche', 'By room m²']], p.key || 'personen') +
        seg(p.id, 'spread', [['year', 'Whole year'], ['from', 'From a date']], p.spread || 'year') +
        (p.spread === 'from' ? '<input class="st-in" type="date" data-sc-pos="date" data-id="' + p.id + '" value="' + stEsc(p.date || M.per.from) + '"/>' : '') +
        '<div class="sc-ped__b"><button class="cx-link" data-sc="posDel" data-id="' + p.id + '">Remove</button><button class="cx-link sr-acc" data-sc="posEdit" data-id="' + p.id + '">Done</button></div></div>' : '');
  }).join('');
  return '<div class="srm__card sc-typed"><p class="sc-cap" style="margin:0">Add a position</p><div class="sc-qa">' +
    SC_QUICK.map(([l, k]) => '<button class="sc-qa__b" data-sc="posAdd" data-l="' + stEsc(l) + '" data-key="' + k + '"><i class="ti ti-plus" aria-hidden="true"></i>' + stEsc(l) + '</button>').join('') +
    '<button class="sc-qa__b" data-sc="posAdd" data-l="" data-key="personen"><i class="ti ti-plus" aria-hidden="true"></i>other</button></div>' +
    (pos.length ? '<p class="sc-cap">Positions</p><div class="sc-posl">' + rows + '<div class="sc-pos sc-pos--t"><b>Total typed</b><span class="sc-pos__v">' + scE(sum) + '</span></div></div>' : '') + '</div>';
}
const scKeyTxt = k => k === 'flaeche' ? 'by room m²' : 'by person';
/* "already paid" per month: Controlling where booked, else the contract – every month can be changed */
function scVzEditor(t, can) {
  const yms = Object.keys(t.vzMap || {}).sort(), ov = (t.set && t.set.vzMonths) || {};
  if (!yms.length) return '';
  const vals = yms.map(ym => ov[ym] !== undefined ? Number(ov[ym]) || 0 : t.vzMap[ym].amt);
  const allContract = yms.every(ym => t.vzMap[ym].src === 'contract'), allPaid = yms.every(ym => t.vzMap[ym].src === 'paid');
  const nk = allContract ? scContractNk(t, yms[0]) : 0, changed = Object.keys(ov).length > 0;
  const title = changed ? 'Changed by you' : allContract ? 'As per contract' + (nk ? ' · ' + scE(nk) + ' per month' : '') : allPaid ? 'As booked in Controlling' : 'Controlling + contract';
  const sub = allContract ? 'no NK payments in Controlling for these months' : allPaid ? 'NK part of the rent, by day' : t.vzContract + ' month(s) from the contract';
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
  return scHead('Add a tenant', stNkLabel(M.per.from, M.per.to) + ' only – not added to Casa Castel', '') +
    '<div class="srm__b"><div class="srm__one"><div class="srm__card sc-xcard">' +
      f('Name', '<input class="st-in" id="scxName" placeholder="First and last name"/>') +
      f('Room', '<select class="st-in" id="scxRoom">' + rooms.map(r => '<option' + (scNorm(r.name) === scNorm(m.room) ? ' selected' : '') + '>' + stEsc(r.name) + '</option>').join('') + '</select>') +
      f('Moved in', '<input class="st-in" type="date" id="scxFrom" value="' + M.per.from + '"/>') +
      f('Moved out', '<input class="st-in" type="date" id="scxTo" value="' + M.per.to + '"/>') +
      f('NK / month', '<span class="st-amt"><input class="st-in" inputmode="decimal" id="scxNk" placeholder="per contract"/><span>€</span></span>') +
      f('Address', '<input class="st-in" id="scxAddr" placeholder="Street, PLZ City (if moved out)"/>') +
    '</div><p class="sc-hint2" style="margin-top:6px">The tenant counts in the split day by day, like everyone else.</p></div></div>' +
    '<div class="srm__bar srm__bar--2"><button class="cx-btn cx-btn--s" data-sc="close">Cancel</button><button class="cx-btn cx-btn--p" data-sc="extraSave">Add tenant</button></div>';
}
function scSpreadTxt(M, id) {
  const ln = M.input.lines.find(l => l.id === id); if (!ln || !ln.parts.length) return '';
  const p = ln.parts[0];
  return p.spread === 'year' ? 'over the period' : p.spread === 'from' ? 'from ' + stDe(p.date) + ' to ' + stDe(M.per.to) : 'in its month';
}
function scCostsView(M) {
  const R = M.R, groups = [['typed', 'Typed by you', 'positions'], ['running', 'Running costs', 'Expenses · Casa Castel'], ['hausgeld', 'Hausgeld', 'One-off · yearly Strom / Gas / Wasser results'], ['oneoff', 'NK one-offs', 'One-off · shared from the purchase date']];
  const warn = !M.locked && M.warn.length ? '<div class="srm__banner is-warn"><div><p class="srm__banner-t">Please check</p><p class="srm__banner-s">' + M.warn.map(stEsc).join('<br/>') + '</p></div></div>' : '';
  const lockB = M.locked
    ? '<div class="srm__banner"><div><p class="srm__banner-t"><i class="ti ti-lock" aria-hidden="true"></i> Costs locked</p><p class="srm__banner-s">' + scDate(M.rec.locked_at) + ' · the letters use this snapshot</p></div><button class="cx-link" data-sc="unlock">Unlock</button></div>'
    : M.R.lines.some(l => l.group !== 'typed') ? '<div class="srm__banner"><div><p class="srm__banner-t">Not locked yet</p><p class="srm__banner-s">Live from Controlling. Lock the house costs once everything for ' + stPer(M.per.from, M.per.to) + ' is booked – then the letters can be sent.</p></div></div>' : '';
  const card = ([g, t, s]) => {
    if (g === 'typed' && !M.locked) return scTypedHtml(M);
    const ls = R.lines.filter(l => l.group === g); if (!ls.length) return '';
    const sum = cxR(ls.reduce((a, l) => a + l.total, 0)), k = 'cg:' + g, o = !!SC.open[k];
    return '<div class="srm__card sc-cg"><button class="sc-cg__h" data-sc="fold" data-k="' + k + '" aria-expanded="' + o + '"><span><b>' + t + '</b><small>' + s + ' · ' + ls.length + (ls.length === 1 ? ' line' : ' lines') + '</small></span>' +
      '<span class="sc-cg__v">' + scE(sum) + ' <i class="ti ti-chevron-' + (o ? 'up' : 'down') + '" aria-hidden="true"></i></span></button>' +
      (o ? ls.map(l => '<div class="sc-li"><span>' + stEsc(l.label) + '<small>' + scKeyTxt(l.key) + ' · ' + scSpreadTxt(M, l.id) + '</small></span><span>' + scE(l.total) + '</span></div>').join('') : '') + '</div>';
  };
  const Lc = R.check, lnd = R.landlord, tot = Math.max(Math.abs(Lc.total), 0.01);
  const who = '<div class="srm__card"><p class="srm__ct" style="font-size:20px">Who pays</p>' +
    '<div class="sc-bar"><span style="flex:' + Math.max(0, Lc.allocated) + ';background:#B8956A"></span><span style="flex:' + Math.max(0, lnd.total) + ';background:#E3D5BF"></span></div>' +
    '<div class="sc-li"><span>Tenants · split by day</span><span>' + scE(Lc.allocated) + '</span></div>' +
    (lnd.pauschal ? '<div class="sc-li"><span>You · Pauschal tenants<small>their share stays with you</small></span><span>' + scE(lnd.pauschal) + '</span></div>' : '') +
    (lnd.vacancy ? '<div class="sc-li"><span>You · Leerstand days</span><span>' + scE(lnd.vacancy) + '</span></div>' : '') +
    (lnd.rounding ? '<div class="sc-li"><span>Rounding</span><span>' + scE(lnd.rounding) + '</span></div>' : '') +
    '<div class="srm__chk' + (Lc.ok ? '' : ' is-warn') + '"><span><i class="ti ti-' + (Lc.ok ? 'check' : 'alert-triangle') + '" aria-hidden="true"></i> ' + (Lc.ok ? 'adds up' : 'does not add up') + '</span><span>' + scE(Lc.total) + '</span></div></div>';
  void tot;
  const hasList = R.lines.some(l => l.group !== 'running');
  const fromC = R.lines.some(l => l.group !== 'typed'), typed = R.lines.some(l => l.group === 'typed');
  return scHead('House costs', 'Casa Castel · ' + stNkLabel(M.per.from, M.per.to) + ' · ' + (fromC && typed ? 'from Controlling + typed by you' : fromC ? 'from Controlling' : 'typed by you'), '') +
    '<div class="srm__b"><div class="srm__one">' + warn + lockB + groups.map(card).join('') +
      (R.lines.length ? who : '') + '</div></div>' +
    '<div class="srm__bar srm__bar--2">' + (hasList ? '<button class="cx-btn cx-btn--s" data-sc="listPdf"><i class="ti ti-file-text" aria-hidden="true"></i> Invoice list PDF</button>' : '') +
      (M.locked ? '' : M.sendable ? '<button class="cx-btn cx-btn--p" data-sc="lock"' + (R.lines.length ? '' : ' disabled') + '><i class="ti ti-lock" aria-hidden="true"></i> Lock house costs</button>'
        : M.running ? '<button class="cx-btn cx-btn--p" disabled><i class="ti ti-lock" aria-hidden="true"></i> Lock after ' + stDe(M.per.to) + '</button>' : '') + '</div>';
}

/* ── Tenant sheet (also used by Start) ── */
function scTenView(M, m) {
  const t = M.ten.find(x => x.key === m.key);
  if (!t) return scHead('Tenant', '', '') + '<div class="srm__b"><p class="cx-empty">Not found.</p></div>';
  const s = t.set, c = scAv(t.room), first = scFirst(t.name);
  const flow = m.flow ? '<div class="sc-flow">' + m.flow.map((k, i) => '<span class="' + (i === m.i ? 'is-on' : i < m.i ? 'is-done' : '') + '"></span>').join('') + '<em>' + (m.i + 1) + ' of ' + m.flow.length + '</em></div>' : '';
  const head = '<div class="srm__h sc-th"><div class="srm__ht">' + flow + '<div class="sc-th__r"><span class="sc-av sc-av--m" style="background:' + c[0] + ';color:' + c[1] + '">' + stEsc(scAbbr(t.room)) + '</span>' +
    '<span><p class="srm__t">' + stEsc(t.name) + '</p><p class="srm__s">' + stEsc(t.room + (t.m2 ? ' · ' + String(t.m2).replace('.', ',') + ' m²' : '') + (t.movedOut ? ' · moved out' : '')) + '</p></span></div></div>' +
    '<button class="srm__x" data-sc="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';
  if (t.k === 'none') return head + '<div class="srm__b"><div class="srm__one"><div class="sc-res"><span class="sc-res__l">' + stEsc(first) + ' pays Pauschal</span><span class="sc-res__v">no NK</span><span class="sc-res__w">The Nebenkosten are included in the rent – this share stays with you.</span></div></div></div>';
  const res = t.k === 'sent' || t.k === 'done' ? t.st && t.st.res : null;
  const saldo = res ? res.dir * res.amount : t.saldo;
  const tone = saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : 'even';            // money that comes to you = green
  const noData = !M.R.lines.length;
  const why = noData ? 'There are no NK costs or payments for ' + stPer(M.per.from, M.per.to) + ' in Controlling yet.'
    : saldo > 0 ? first + '\'s share was a little more than the NK paid with the rent.'
    : saldo < 0 ? first + ' paid a bit more NK than the share – the rest goes back.' : 'The NK paid with the rent covers the share exactly.';
  if (noData) return head + '<div class="srm__b"><div class="srm__one sc-sheet">' +
    '<div class="sc-card sc-nodata"><b><i class="ti ti-pencil" aria-hidden="true"></i> Type the house costs first</b>' +
    '<span>' + stEsc(first) + ' lived here ' + t.days + ' days (' + stEsc(stPer(t.from, t.to)) + '). As soon as the house costs are typed, ' + stEsc(first) + '\'s share is calculated here.</span>' +
    '<span class="sc-nodata__b"><button class="sc-go" data-sc="costs">Type house costs</button></span></div>' +
    (t.extra ? '<button class="cx-link sc-skipflow" data-sc="extraDel" data-k="' + stEsc(t.key) + '">Remove this tenant</button>' : '') + '</div></div>';
  const hero = '<div class="sc-res is-' + tone + '"><span class="sc-res__l">' + (saldo > 0 ? stEsc(first) + ' pays you' : saldo < 0 ? stEsc(first) + ' gets back' : '<i class="ti ti-circle-check" aria-hidden="true"></i> All even') + '</span>' +
    '<span class="sc-res__v">' + scE(Math.abs(saldo)) + '</span>' +
    '<span class="sc-res__w">' + stEsc(why) + (!M.locked && t.k === 'open' && !noData ? ' <em>Preview until the house costs are locked.</em>' : '') + '</span></div>';
  const tiles = '<div class="sc-tiles"><div class="sc-tile"><i class="ti ti-calendar" aria-hidden="true"></i><small>lived here</small><b>' + t.days + ' days</b></div>' +
    '<div class="sc-tile"><i class="ti ti-home" aria-hidden="true"></i><small>' + stEsc(first) + '\'s share</small><b>' + scE(t.sum) + '</b></div>' +
    '<button class="sc-tile sc-tile--b' + (SC.pill && SC.pill.k === t.key && SC.pill.p === 'vz' ? ' is-on' : '') + '" data-sc="pill" data-p="vz" data-k="' + stEsc(t.key) + '"><i class="ti ti-coins" aria-hidden="true"></i><small>already paid ›</small><b>' + scE(t.vz) + '</b></button></div>';
  const vzOpen = SC.pill && SC.pill.k === t.key && SC.pill.p === 'vz';
  const vzEd = vzOpen ? scVzEditor(t, t.k === 'open' && M.sendable && !(t.st && t.st.res)) : '';
  const kau = '';                                           // Kaution + Einbehalt: Casa Castel › Tenants, by hand
  // details: what the share is made of + the NK paid
  const lk = 'tl:' + t.key, lo = !!SC.open[lk], canEdit = t.k === 'open' && M.sendable;
  const pers = cxR(t.lines.filter(l => l.key === 'personen').reduce((a, l) => a + l.amount, 0)), fl = cxR(t.lines.filter(l => l.key === 'flaeche').reduce((a, l) => a + l.amount, 0));
  const vzOver = s.vz !== undefined && s.vz !== null && s.vz !== '';
  const det = '<button class="sc-more2" data-sc="fold" data-k="' + lk + '" aria-expanded="' + lo + '">See what the share is made of <i class="ti ti-chevron-' + (lo ? 'up' : 'down') + '" aria-hidden="true"></i></button>' +
    (lo ? '<div class="sc-det">' +
      '<div class="sc-det__s"><span><i class="ti ti-users" aria-hidden="true"></i> shared by person, day by day</span><b>' + scE(pers) + '</b></div>' +
      '<div class="sc-det__s"><span><i class="ti ti-flame" aria-hidden="true"></i> Gas by room size (' + (t.m2 ? String(t.m2).replace('.', ',') + ' m²' : 'm²') + ')</span><b>' + scE(fl) + '</b></div>' +
      t.lines.map(l => '<div class="sc-li"><span>' + stEsc(l.label) + '<small>' + (l.share * 100).toFixed(1).replace('.', ',') + ' % of ' + scE(l.total) + '</small></span><span>' + scE(l.amount) + '</span></div>').join('') +
      '<div class="sc-li"><span>Already paid<small>' + (t.vzContract ? t.vzContract + ' month(s) as per contract' : 'NK part of the rent, by day') + (vzOver || (s.vzMonths && Object.keys(s.vzMonths).length) ? ' · changed by you' : '') + '</small></span><span>' + scE(t.vz) + '</span></div>' +

    '</div>' : '');
  // the letter as pills
  let letter = '';
  if (M.sendable && t.k === 'open') {
    const addr = String(s.addr !== undefined ? s.addr : scAddrDefault(t).join('\n'));
    const addrShort = addr.split('\n').filter(Boolean).slice(0, 2).join(', ') || 'address missing';
    const via = scVia(t), viaTxt = { zahlung: 'Bank transfer', kaution: 'With the Kaution', miete: 'With the rent' }[via] + ' · ' + (s.days ?? 30) + ' days';
    const list = s.list !== undefined ? !!s.list : scListDefault();
    const pill = SC.pill && SC.pill.k === t.key ? SC.pill.p : null;
    const pl = (p, ic, txt, warn) => '<button class="sc-pill' + (pill === p ? ' is-on' : '') + (warn ? ' is-warn' : '') + '" data-sc="pill" data-p="' + p + '" data-k="' + stEsc(t.key) + '"><i class="ti ti-' + ic + '" aria-hidden="true"></i>' + stEsc(txt) + '</button>';
    let ed = '';
    if (pill === 'addr') ed = '<div class="sc-ed"><label class="st-f"><span class="st-f__l">Address' + (t.movedOut ? ' · new address after moving out' : '') + '</span><textarea class="st-in sc-ta" rows="3" data-sc-in="addr" data-k="' + stEsc(t.key) + '">' + stEsc(addr) + '</textarea></label>' +
      (saldo < 0 || t.einbehalt > 0 ? '<label class="st-f"><span class="st-f__l">' + stEsc(first) + '\'s IBAN (optional)</span><input class="st-in" data-sc-in="iban" data-k="' + stEsc(t.key) + '" value="' + stEsc(s.iban || '') + '" placeholder="DE…"/></label>' : '') +
      scToggle('former', t.key, s.former !== undefined ? !!s.former : t.movedOut, 'Former tenant', 'the letter says "Ihr ehemaliges Zimmer"', true) + '</div>';
    if (pill === 'via') ed = '<div class="sc-ed"><div class="sc-opts">' + [['zahlung', 'Bank transfer'], ['kaution', 'With the Kaution'], ['miete', 'With the rent']].map(([v, l]) =>
      '<button class="sc-opt' + (via === v ? ' is-on' : '') + '" data-sc="viaSet" data-v="' + v + '" data-k="' + stEsc(t.key) + '">' + l + '</button>').join('') + '</div>' +
      '<label class="st-f"><span class="st-f__l">Pay within (days)</span><input class="st-in" inputmode="numeric" data-sc-in="days" data-k="' + stEsc(t.key) + '" value="' + stEsc(s.days ?? 30) + '"/></label></div>';
    letter = '<p class="sc-cap">The letter</p><div class="sc-pills">' + pl('addr', 'mail', addrShort, !addr.trim()) + (saldo || t.einbehalt ? pl('via', 'building-bank', viaTxt) : '') +
      '<button class="sc-pill' + (list ? ' is-ok' : '') + '" data-sc="tg" data-f="list" data-k="' + stEsc(t.key) + '" aria-pressed="' + list + '"><i class="ti ti-' + (list ? 'check' : 'list') + '" aria-hidden="true"></i>Invoice list ' + (list ? 'on' : 'off') + '</button></div>' +
      ed + '<p class="sc-hint2">Tap a pill to change it.</p>';
  }
  // where it stands
  const status = t.k === 'sent' ? '<div class="sc-stat is-wait"><i class="ti ti-hourglass" aria-hidden="true"></i> Sent ' + stDate(res.date) +
      (t.st.confirm ? ' · ' + (res.via === 'miete' ? 'settled with the rent' : 'settled via Kaution') + ' – confirm it once done' : ' · waiting for the money') + '</div>'
    : t.k === 'done' ? '<div class="sc-stat is-done"><i class="ti ti-circle-check" aria-hidden="true"></i> ' + stEsc(t.skipped ? 'Skipped' : 'Settled · ' + scSay(t)[1]) + '</div>' : '';
  let bar = '';
  if (t.k === 'open' && M.sendable) bar = '<button class="cx-btn cx-btn--s" data-sc="pdf" data-k="' + stEsc(t.key) + '"><i class="ti ti-file-text" aria-hidden="true"></i> PDF</button>' +
    '<button class="cx-btn cx-btn--p" data-sc="send" data-k="' + stEsc(t.key) + '"' + (M.locked && !noData ? '' : ' disabled') + '>' + (m.flow ? 'Sent · next <i class="ti ti-arrow-right" aria-hidden="true"></i>' : 'Mark as sent') + '</button>';
  else if (t.k === 'sent') bar = scLetterBtn(t) + '<button class="cx-btn cx-btn--p" data-sc="settle" data-k="' + stEsc(t.key) + '">' + (t.st.confirm ? 'Confirm' : 'Settle') + '</button>';
  else if (t.k === 'done') bar = scLetterBtn(t) + '<button class="cx-btn cx-btn--s" data-sc="reopen" data-k="' + stEsc(t.key) + '">Back to open</button>';
  const skipFlow = m.flow ? '<button class="cx-link sc-skipflow" data-sc="flowNext">Skip for now ›</button>' : '';
  const lockHint = t.k === 'open' && M.sendable && !M.locked && !noData ? '<p class="sc-hint2" style="text-align:center">Lock the house costs to send the letter.</p>' : '';
  const xDel = t.extra && t.k === 'open' ? '<button class="cx-link sc-skipflow" data-sc="extraDel" data-k="' + stEsc(t.key) + '">Remove this tenant from this NK</button>' : '';
  return head + '<div class="srm__b"><div class="srm__one sc-sheet">' + hero + tiles + vzEd + kau + status + det + letter + lockHint + skipFlow + xDel + '</div></div>' +
    (bar ? '<div class="srm__bar srm__bar--2">' + bar + '</div>' : '');
}
function scToggle(f, key, on, t, s, can) {
  return '<button type="button" class="sc-tg' + (on ? ' on' : '') + '" data-sc="tg" data-f="' + f + '" data-k="' + stEsc(key) + '"' + (can ? '' : ' disabled') + ' aria-pressed="' + on + '">' +
    '<span class="sc-tg__t"><b>' + t + '</b><small>' + s + '</small></span><span class="sc-tg__sw" aria-hidden="true"></span></button>';
}
function scStep(n, t, s, state, extra) {
  return '<div class="sc-step is-' + state + '"><span class="sc-step__d">' + (state === 'done' ? '<i class="ti ti-check" aria-hidden="true"></i>' : n) + '</span><span><b>' + t + '</b><small>' + stEsc(s) + (extra ? ' · ' + stEsc(extra) : '') + '</small></span></div>';
}
function scLetterBtn(t) {
  const L = SC.letters.find(l => l.app === 'casa' && String(l.tenant_id) === String(t.tenantId) && scD(l.period_from) === t.from);
  return L ? '<button class="cx-btn cx-btn--s" data-sc="letter" data-id="' + stEsc(L.id) + '"><i class="ti ti-file-text" aria-hidden="true"></i> Open letter</button>'
           : '<button class="cx-btn cx-btn--s" data-sc="pdf" data-k="' + stEsc(t.key) + '"><i class="ti ti-file-text" aria-hidden="true"></i> PDF (recreated)</button>';
}
/* How the result is settled: chosen in the sheet, else Kaution when part of it is held back for the NK */
const scVia = t => (t.set && t.set.via) || 'zahlung';
/* First year to show: the purchase of Casa Castel (Controlling "in portfolio since" or the purchase date in Properties) */
function scMinYear() {
  const ty = Number(cxToday().slice(0, 4));
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID);
  let iso = p && p.in_portfolio_since ? String(p.in_portfolio_since).slice(0, 10) : '';
  if (!iso && p) { const loan = ctlPropLinks(p).loan; if (loan && typeof _srIsoAny === 'function') iso = _srIsoAny(loan.kaufdatum); }
  const y = Number(iso.slice(0, 4));
  return y ? Math.min(y, ty - 1) : ty - 4;
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
  const t = M.ten.find(x => x.key === m.key); if (!t) return scHead('Settle', '', 'back');
  const res = t.st && t.st.res, b = t.st && t.st.booking;
  const cur = m.choice || (t.skipped ? 'skip' : b ? 'paid' : res && res.via !== 'zahlung' ? res.via : res ? 'paid' : 'skip');
  const opt = (v, ti, s, extra) => '<div class="srm__opt' + (cur === v ? ' is-on' : '') + '" data-sc="choice" data-v="' + v + '"><input type="radio" name="scSettle" value="' + v + '"' + (cur === v ? ' checked' : '') + '/>' +
    '<div class="srm__opt-b"><span class="srm__opt-t">' + ti + '</span><span class="srm__opt-s">' + s + '</span>' + (cur === v && extra ? extra : '') + '</div></div>';
  const amt = b ? Number(b.amount) : res ? res.amount : 0;
  const paidX = '<div class="sr-grid2 srm__opt-f"><label class="st-f"><span class="st-f__l">Amount</span><span class="st-amt"><input class="st-in" inputmode="decimal" id="scSetAmt" value="' + stEsc(cxE2(amt)) + '"/><span>€</span></span></label>' +
    '<label class="st-f"><span class="st-f__l">Date</span><input class="st-in" type="date" id="scSetDate" value="' + stEsc(b ? scD(b.invoice_date) : cxToday()) + '"/></label></div>';
  let opts = '';
  if (res && res.amount) {
    opts += opt('paid', res.dir > 0 ? 'Paid by ' + stEsc(scFirst(t.name)) : 'Paid back to ' + stEsc(scFirst(t.name)), 'by transfer · the amount may differ from the result (' + scE(res.amount) + ')', paidX);
    opts += opt('kaution', 'Settled via Kaution', 'you keep track of the Einbehalt in Casa Castel › Tenants', '');
    opts += opt('miete', 'Settled with the rent', 'no extra transfer', '');
  }
  opts += opt('skip', 'Skipped', 'not paid or not claimed – counts as done', '');
  return scHead('Settle – ' + t.name, stNkLabel(t.from, t.to) + ' · ' + t.room + (res ? ' · ' + (res.dir > 0 ? 'Nachzahlung ' : 'Guthaben ') + scE(res.amount) : ''), 'backTen') +
    '<div class="srm__b"><div class="srm__one srm__narrow">' + opts +
      '<label class="st-f"><span class="st-f__l">Note (optional)</span><input class="st-in" id="scSetNote" value="' + stEsc(t.set.settle_note || '') + '"/></label></div></div>' +
    '<div class="srm__bar srm__bar--2"><button class="cx-btn cx-btn--s" data-sc="backTen">Cancel</button><button class="cx-btn cx-btn--p" data-sc="settleSave" data-k="' + stEsc(t.key) + '">Save</button></div>';
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
    if (l.key === 'flaeche') return 'Zimmerfläche, tagesgenau';
    const ln = M.input.lines.find(x => x.id === l.id), p = ln && ln.parts[0];
    return p && p.spread === 'from' ? 'Personen ab ' + dt(p.date) : 'Personen, tagesgenau';
  };
  const pct = v => (v * 100).toFixed(2).replace('.', ',') + ' %';
  const eur = v => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac';
  const extraLines = M.input.lines.filter(l => l.info && t.lines.some(x => x.id === l.id));
  const last = String(t.name).split(' ').slice(-1)[0];
  return {
    brand: 'Casa Castel', unitLabel: 'Zimmer', unitName: t.room,
    footer: house.join(' \u00b7 '), sender, vermieter: s.vermieter_name || '', ort, date, names: [t.name], addr,
    title: 'Betriebskostenabrechnung ' + y,
    subtitle: 'Mietobjekt ' + house.join(', ') + ' \u00b7 Zimmer ' + t.room + (t.m2 ? ' (' + String(t.m2).replace('.', ',') + ' m²)' : '') + ' \u00b7 Abrechnungszeitraum ' + dt(per.from) + ' bis ' + dt(per.to),
    greeting: 'Guten Tag ' + t.name + ',',
    introHtml: 'hiermit rechnen wir die Betriebskosten für Ihr ' + (former ? 'ehemaliges ' : '') + 'Zimmer „' + t.room + '“ in der Casa Castel für den Abrechnungszeitraum vom <strong>' + dt(per.from) + ' bis ' + dt(per.to) + '</strong> ab.' +
      (partial ? ' Sie haben das Zimmer vom ' + dt(t.from) + ' bis ' + dt(t.to) + ' bewohnt (' + t.days + ' von ' + M.R.days + ' Tagen).' : '') +
      ' Die Kosten des Hauses wurden tagesgenau verteilt – Sie zahlen nur für die Tage, an denen Sie im Haus gewohnt haben.',
    sum: t.sum, vz: t.vz, saldo: t.saldo, via: t.saldo ? scVia(t) : 'zahlung', einbehalt: t.einbehalt || 0, due: NkCasa.addDays(date, days),
    bank: { inhaber: s.kontoinhaber || s.vermieter_name || '', bank: s.bankname || '', iban: s.iban || '', bic: s.bic || '' },
    verwendung: 'NK ' + y + ' Casa Castel ' + t.room + ' ' + last, tenantIban: set.iban || '', former,
    hinweise: ['Die Aufstellung aller Kosten, die Verteilerschlüssel und die Berechnung Ihres Anteils finden Sie auf Seite 2.',
               'Die Belege können Sie nach vorheriger Terminabsprache einsehen.',
               'Einwendungen gegen diese Abrechnung teilen Sie uns bitte spätestens bis zum Ablauf des zwölften Monats nach Zugang mit (§ 556 Abs. 3 Satz 5 BGB).'],
    anlagen: list && extraLines.length ? 'Belegliste (Seite 3)' : '',
    intro2: 'Abrechnungszeitraum ' + dt(per.from) + ' bis ' + dt(per.to) + ' (' + M.R.days + ' Tage)' + (partial ? ' \u00b7 Ihr Nutzungszeitraum ' + dt(t.from) + ' bis ' + dt(t.to) + ' (' + t.days + ' Tage)' : '') + '. Umgelegt werden die im Mietvertrag vereinbarten Betriebskosten des Hauses.',
    table: {
      cols: [{ label: 'Kostenart', w: '31%' }, { label: 'Kosten Haus', w: '17%', cls: 'r' }, { label: 'Verteilerschlüssel', w: '26%', cls: 'k' }, { label: 'Anteil', w: '11%', cls: 'r' }, { label: 'Ihr Betrag', w: '15%', cls: 'r' }],
      rows: t.lines.map(l => [l.label, eur(l.total), keyTxt(l), pct(l.share), eur(l.amount)]),
      vzLabel: 'abzüglich geleisteter Vorauszahlungen',
    },
    note2: 'Personen, tagesgenau: Die Kosten jedes Tages werden zu gleichen Teilen auf alle Mieter verteilt, die an diesem Tag im Haus gewohnt haben. ' +
      'Zimmerfläche, tagesgenau (Gas/Heizung): Die Kosten jedes Tages werden im Verhältnis Ihrer Zimmerfläche zur Fläche aller an diesem Tag bewohnten Zimmer verteilt. ' +
      'Monatliche Kosten zählen in ihrem Monat, Jahresbeträge gleichmäßig über alle Tage. Einzelrechnungen werden ab dem Rechnungsdatum bis zum Ende des Zeitraums verteilt. Nicht umlagefähige Kosten sind nicht enthalten.',
    extra: list && extraLines.length ? { title: 'Belegliste ' + y + ' \u00b7 Einzelrechnungen', intro: 'Diese Rechnungen sind in die Aufstellung auf Seite 2 eingeflossen. Laufende Kosten stehen dort mit ihrem Jahresbetrag.',
      rows: extraLines.map(l => [l.info.date, l.info.item || l.label, l.info.company || '', l.info.amount]), sum: cxR(extraLines.reduce((a, l) => a + l.info.amount, 0)) } : null,
  };
}
const scFileName = (M, t) => ccPdfFileName('NK-Abrechnung', M.y, 'Casa-Castel', t.room, String(t.name).split(' ').slice(-1)[0]);

/* ── Actions ─────────────────────────────────────────────── */
async function scClick(e) {
  const b = e.target.closest('[data-sc]'); if (!b || b.disabled) return;
  const a = b.dataset.sc, M = SC.model;
  if (a === 'year') { SC.year += Number(b.dataset.d); SC.modal = null; return stRenderCasa(); }
  if (a === 'close') { SC.modal = null; return scRenderModal(); }
  if (a === 'fold') { SC.open[b.dataset.k] = !SC.open[b.dataset.k]; return scRenderModal(); }
  if (a === 'costs') { SC.modal = { view: 'costs' }; return scRenderModal(); }
  if (a === 'sumTen' || a === 'sumHg') { SC.modal = { view: a }; return scRenderModal(); }
  if (a === 'filter') { SC.filter = b.dataset.k; return stRenderCasa(); }
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
    const v = id => (document.getElementById(id) || {}).value || '';
    const name = v('scxName').trim(), from = scD(v('scxFrom')), to = scD(v('scxTo'));
    if (!name || !from) { stSay('Please enter the name and the move-in'); return; }
    const r = scRecEnsure(SC.year), nk = cxParse(v('scxNk'));
    (r.tenants.__extra = r.tenants.__extra || []).push({ id: Date.now().toString(36), name, room: v('scxRoom'), from, to: to || null, nk: nk === null ? 0 : cxR(nk),
      addr: v('scxAddr').split(/\s*,\s*/).filter(Boolean).join('\n') });
    try { await scSaveRec(r); } catch (err) { stSay('Saving failed — ' + (err.message || err)); return; }
    SC.modal = null; SC.model = scModel(SC.year); stRenderCasa(); stSay(name + ' added for ' + SC.year); return;
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
      if (!(await stConfirm({ title: 'Mark ' + t.name + '\'s NK-Abrechnung as settled?', ok: 'Settled' }))) return;
      const s = scSet(t.key); if (s.sent) s.sent.settled = cxToday();
      try { await scSaveRec(scRecEnsure(SC.year)); } catch (err) {}
      SC.model = scModel(SC.year); stRenderCasa(); SC.modal = { view: 'ten', key: t.key }; return scRenderModal();
    }
    SC.modal = { view: 'settle', key: b.dataset.k, back: SC.modal }; return scRenderModal();
  }
  if (a === 'backTen') { const m = SC.modal; SC.modal = (m && m.back) || { view: 'ten', key: m && m.key }; return scRenderModal(); }
  if (a === 'choice') { SC.modal.choice = b.dataset.v; return scRenderModal(); }
  if (a === 'settleSave') return scSettleSave(b.dataset.k, b);
  if (a === 'reopen') {
    const t = M && M.ten.find(x => x.key === b.dataset.k);
    if (t && t.extra) { if (!(await stConfirm({ title: 'Back to open?', ok: 'Back to open' }))) return; delete scSet(t.key).sent; try { await scSaveRec(scRecEnsure(SC.year)); } catch (err) {} SC.model = scModel(SC.year); stRenderCasa(); SC.modal = { view: 'ten', key: t.key }; return scRenderModal(); }
    return scReopen(b.dataset.k);
  }
}
function scInput(e) {
  const el = e.target;
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
function scFlowNext() {
  const m = SC.modal; if (!m || !m.flow) return;
  const left = m.flow.filter((k, i) => i > m.i && (SC.model.ten.find(t => t.key === k) || {}).k === 'open');
  if (!left.length) { SC.modal = null; stSay('That was the last letter'); return stRenderCasa(); }
  m.i = m.flow.indexOf(left[0]); m.key = left[0]; scRenderModal();
}

async function scLock(btn) {
  const M = SC.model; if (!M || M.locked) return;
  if (M.warn.length && !(await stConfirm({ title: 'Lock the house costs anyway?', text: M.warn.length + ' point(s) to check:\n' + M.warn.join('\n'), ok: 'Lock anyway' }))) return;
  const r = scRecEnsure(M.y);
  const input = scInputFor(M.y);
  input.tenancies = (input.tenancies || []).map(t => { const c = Object.assign({}, t); delete c._exp; return c; });   // the snapshot keeps data only
  r.snapshot = { input, total: M.R.check.total, at: new Date().toISOString() };
  r.locked_at = new Date().toISOString();
  if (btn) btn.disabled = true;
  try { await scSaveRec(r); stSay('Costs locked'); }
  catch (e) { r.locked_at = null; r.snapshot = null; stSay(SC.missing ? 'Please run the Casa Castel settlements SQL first' : 'Saving failed — ' + (e.message || e)); }
  SC.modal = null; stRenderCasa();
}
async function scUnlock() {
  const M = SC.model; if (!M || !M.locked) return;
  const sent = M.ten.filter(t => t.k === 'sent' || t.k === 'done').length;
  if (!(await stConfirm({ title: 'Unlock the house costs?', text: 'The numbers then follow Controlling again.' + (sent ? '\n' + sent + ' letter(s) were already sent – they stay as sent and archived.' : ''), ok: 'Unlock' }))) return;
  const r = scRecEnsure(M.y); const keep = { locked_at: r.locked_at, snapshot: r.snapshot };
  r.locked_at = null; r.snapshot = null;
  try { await scSaveRec(r); delete SC.data[M.y]; stSay('Costs unlocked'); }
  catch (e) { Object.assign(r, keep); stSay('Saving failed — ' + (e.message || e)); }
  SC.modal = null; stRenderCasa();
}

async function scPdf(key, btn) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t) return;
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

/* Mark as sent: letter → archive, result → Controlling (same path as Rentals) */
async function scSend(key, btn) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t) return;
  if (!M.locked) { stSay('Lock the house costs first'); return; }
  if (t.extra) return scSendExtra(M, t, btn);
  if (!t.line) { stSay('This tenant is not in the settlement list – check move-in / move-out in Casa Castel'); return; }
  const s = t.set || {};
  const amount = Math.abs(t.saldo), dir = t.saldo > 0 ? 1 : t.saldo < 0 ? -1 : 0;
  const via = dir ? scVia(t) : 'zahlung';
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
  const flow = SC.modal && SC.modal.flow ? SC.modal : null;
  SC.model = scModel(M.y);
  stRenderCasa();
  if (flow) { SC.modal = flow; scFlowNext(); } else { SC.modal = { view: 'ten', key }; scRenderModal(); }
}
async function scSendExtra(M, t, btn) {
  const s = scSet(t.key), dir = t.saldo > 0 ? 1 : t.saldo < 0 ? -1 : 0, date = s.date || cxToday();
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Saving'; }
  let pdf = null;
  try { pdf = await nkLetterPdf(await scLetterData(M, t), scFileName(M, t)); } catch (e) { console.warn('[settlements] letter', e); }
  s.sent = { date, dir, amount: cxR(Math.abs(t.saldo)), via: dir ? scVia(t) : 'zahlung' };
  try { await scSaveRec(scRecEnsure(M.y)); } catch (e) { stSay('Saving failed — ' + (e.message || e)); return; }
  if (pdf) await scArchive(M, t, pdf, { dir, amount: s.sent.amount, addr: String(s.addr !== undefined ? s.addr : scAddrDefault(t).join('\n')) });
  stSay('Marked as sent');
  const flow = SC.modal && SC.modal.flow ? SC.modal : null;
  SC.model = scModel(M.y); stRenderCasa();
  if (flow) { SC.modal = flow; scFlowNext(); } else { SC.modal = { view: 'ten', key: t.key }; scRenderModal(); }
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

async function scSettleSave(key, btn) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t || !t.line) return;
  const m = SC.modal, choice = m.choice || (document.querySelector('#scModal input[name="scSettle"]:checked') || {}).value;
  const note = (document.getElementById('scSetNote') || {}).value || '';
  const st = t.st || {}, res = st.res, b = st.booking, l = t.line;
  if (btn) btn.disabled = true;
  try {
    const setVia = async via => { await _ctlSupa.from('abr_results').update({ settle_via: via }).eq('id', res.id); res.db.settle_via = via; await _stUpsertSettlement(l, { settled_via: via }); };
    const dropBooking = async () => { if (b) { await ctlDeleteOneTime(b.id); window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id); } };
    if (choice === 'paid' && res) {
      const amt = cxR(Math.abs(cxParse((document.getElementById('scSetAmt') || {}).value || '0') || 0));
      const date = scD((document.getElementById('scSetDate') || {}).value) || cxToday();
      if (!(amt > 0)) { stSay('Please enter the amount'); if (btn) btn.disabled = false; return; }
      if (res.via !== 'zahlung') await setVia('zahlung');
      if (b) {
        const d = await ctlUpdateOneTime(b.id, { amount: amt, invoice_date: date });
        const i = (window._src.abrPay || []).findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
      } else {
        const d = await ctlAddOneTime({ property_id: CASA_PROP_ID, invoice_date: date, item: stNkLabel(t.from, t.to) + ' · ' + t.name + ' · ' + (res.dir > 0 ? 'Nachzahlung' : 'Guthaben'),
                                        amount: amt, kind: 'NK-Abrechnung', direction: res.dir, source_ref: 'abr:' + res.id });
        window._src.abrPay = (window._src.abrPay || []).concat([d]);
      }
      await _stConfirmSettled(l, 'zahlung', date);
    } else if ((choice === 'kaution' || choice === 'miete') && res) {
      await dropBooking(); await setVia(choice); await _stConfirmSettled(l, choice, cxToday());
    } else if (choice === 'skip') {
      await dropBooking();
      if (res) { await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', res.id); res.db.status = 'storniert'; }
      await _stUpsertSettlement(l, { status: 'nicht durchgeführt', amount: null, direction: null, settled_via: null, result_id: null });
    }
    scSet(key).settle_note = note || null;
    try { await scSaveRec(scRecEnsure(M.y)); } catch (e) {}
    ctlSettlementInvalidate();
    stSay('Saved');
  } catch (e) { stSay('Saving failed — ' + (e.message || e)); if (btn) btn.disabled = false; return; }
  SC.model = scModel(M.y); stRenderCasa();
  SC.modal = { view: 'ten', key }; scRenderModal();
}
async function scReopen(key) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t || !t.line) return;
  const res = t.st && t.st.res, b = res ? ctlAbrBooking(res) : null;
  if (!(await stConfirm({ title: 'Set ' + t.name + ' back to open?', ok: 'Back to open', danger: true,
    text: b ? 'The payment of ' + scDate(b.invoice_date) + ' (' + scE(b.amount) + ') in Controlling is removed too.' : res ? 'The result disappears from Controlling.' : '' }))) return;
  try {
    if (b) { await ctlDeleteOneTime(b.id); window._src.abrPay = (window._src.abrPay || []).filter(o => o.id !== b.id); }
    if (res) { const { error } = await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', res.id); if (error) throw error; res.db.status = 'storniert'; }
    if (!(t.it.r._virtual || String(t.it.r.id).startsWith('v:'))) {
      try { await _stUpsertSettlement(t.line, { status: 'offen', amount: null, direction: null, settled_via: null, result_id: null }); }
      catch (e) { await _stUpsertSettlement(t.line, { status: 'offen', amount: null, direction: null, settled_via: null }); }
    }
  } catch (e) { stSay('Failed — ' + (e.message || e)); return; }
  ctlSettlementInvalidate(); stSay('Back to open');
  SC.model = scModel(M.y); stRenderCasa();
  SC.modal = { view: 'ten', key }; scRenderModal();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && SC.modal) { SC.modal = null; scRenderModal(); } });
