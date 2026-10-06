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
  kau: {},               // tenant_id → kaution row (nk_einbehalt = held back until the NK)
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
    try {                                                   // Kaution (Casa Castel › Tenants) — the NK-Einbehalt is read here
      const ids = (window._src.casaTen || []).map(t => t.id).filter(Boolean);
      SC.kau = {};
      if (ids.length) { const k = await _ctlSupa.from('kaution').select('*').in('tenant_id', ids); (k.data || []).forEach(x => { SC.kau[String(x.tenant_id)] = x; }); }
    } catch (e) { SC.kau = {}; }
  } finally { SC.loaded = true; SC.loading = false; }
}
async function scLoadYear(y) {
  if (SC.data[y]) return SC.data[y];
  const [c, o] = await Promise.all([
    _ctlSupa.from('ctrl_expense_castel').select('*').eq('year', y),
    _ctlSupa.from('ctrl_expense_one_time').select('*').eq('property_id', CASA_PROP_ID).gte('invoice_date', y + '-01-01').lt('invoice_date', (y + 1) + '-01-01'),
  ]);
  if (c.error) throw c.error;
  if (o.error) throw o.error;
  return (SC.data[y] = { castel_expenses: c.data || [], one_time: o.data || [] });
}
const scRec = y => SC.rows.find(r => Number(r.year) === Number(y)) || null;
function scRecEnsure(y) {
  let r = scRec(y);
  if (!r) { r = { year: y, period_from: y + '-01-01', period_to: y + '-12-31', locked_at: null, snapshot: null, tenants: {} }; SC.rows.push(r); }
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

/* ── Model of one year ────────────────────────────────────── */
function scModel(y) {
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID);
  if (!p) return { error: 'Casa Castel is not set up in Controlling yet.' };
  const rec = scRec(y), locked = !!(rec && rec.locked_at && rec.snapshot && rec.snapshot.input);
  let input;
  if (locked) input = JSON.parse(JSON.stringify(rec.snapshot.input));
  else {
    const d = SC.data[y]; if (!d) return { loading: true };
    input = NkCasa.fromControlling(y, { castel_expenses: d.castel_expenses, one_time: d.one_time, income: window._src.incAll || [] });
    if (input.error) return { error: input.message };
  }
  const ts = (rec && rec.tenants) || {};
  for (const t of input.tenancies) { const s = ts[t.key]; if (s && s.vz !== undefined && s.vz !== null && s.vz !== '') t.vz = Number(s.vz); }
  const R = NkCasa.calc(input);
  const g = (typeof ctlSettlementModel === 'function' ? ctlSettlementModel() : []).find(x => x.p.id === CASA_PROP_ID);
  const perM = g ? g.periods.find(pp => pp.to.slice(0, 4) === String(y)) : null;
  const frist = perM ? perM.frist : (y + 1) + '-12-31';
  const today = cxToday();
  const ten = R.tenants.map(t => {
    const src = input.tenancies.find(x => x.key === t.key) || {};
    const it = perM ? perM.items.find(i => i.type === 'row' && String(i.r.tenant_id) === String(t.tenantId) && scD(i.r.period_from) === t.from) : null;
    const line = it ? { id: String(it.r.id), type: 'row', p, per: perM, it, year: y, frist, from: t.from, to: t.to } : null;
    let st = null; try { st = line ? _stState(line) : null; } catch (e) {}
    const skipped = !!(it && it.r.status === 'nicht durchgeführt');
    const kau = SC.kau[String(t.tenantId)] || null;
    const einbehalt = kau && Number(kau.nk_einbehalt) > 0 ? cxR(Number(kau.nk_einbehalt)) : 0;
    let k = t.mode === 'pauschal' ? 'none' : skipped ? 'done' : st && st.res ? (st.k === 'erledigt' ? 'done' : 'sent') : 'open';
    if (k === 'done' && einbehalt > 0 && st && st.res && st.res.via === 'kaution') k = 'sent';   // Kaution still to pay back
    const tr = (window._src.casaTen || []).find(x => String(x.id) === String(t.tenantId)) || null;
    const movedOut = t.to < y + '-12-31' || !!(tr && tr.mietende && scD(tr.mietende) < today);
    return Object.assign({}, t, { it, line, st, skipped, k, tr, movedOut, vzMissing: src.vzMissing || [], vzAuto: src.vz, set: ts[t.key] || {}, kau, einbehalt });
  });
  const money = { back: 0, get: 0 };
  ten.filter(t => t.k === 'sent').forEach(t => {
    const r = t.st.res;
    if (r.via === 'kaution' && t.einbehalt > 0) money.back += Math.max(0, cxR(t.einbehalt - r.dir * r.amount));
    else if (r.via === 'zahlung') { if (r.dir > 0) money.get += r.amount; else money.back += r.amount; }
  });
  return { p, y, rec, locked, input, R, ten, perM, frist, running: (y + '-12-31') >= today, sendable: !!perM, warn: input.warn || [], money, today };
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
  const yearNav = '<div class="sc-yr">' +
    '<button class="cx-arw" data-sc="year" data-d="-1" aria-label="Previous year"' + (y <= scMinYear() ? ' disabled' : '') + '><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="sc-yr__t"><div class="sc-yr__m">NK ' + y + '</div><div class="sc-yr__s">' + (M.running ? 'runs until 31.12.' + y : M.sendable ? 'send by ' + scDate(M.frist) : 'Frist passed · history') + '</div></div>' +
    '<button class="cx-arw" data-sc="year" data-d="1" aria-label="Next year"' + (y >= ty ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
  const sql = SC.missing || SC.lettersMissing
    ? '<div class="st-soon"><i class="ti ti-database" aria-hidden="true"></i><div><strong>Run the SQL once</strong><span>' +
      (SC.missing ? 'The table nk_abrechnung_casa is missing. ' : '') + (SC.lettersMissing ? 'The letter archive (nk_letters) is missing. ' : '') + 'The SQL is in the chat.</span></div></div>' : '';

  // progress + money
  const total = nk.length, nDone = done.length, C = 2 * Math.PI * 34;
  const ring = '<svg class="sc-ring" width="84" height="84" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="34" fill="none" stroke="#EDE8E0" stroke-width="9"/>' +
    '<circle cx="42" cy="42" r="34" fill="none" stroke="#D4B896" stroke-width="9" stroke-linecap="round" transform="rotate(-90 42 42)" stroke-dasharray="' + (total ? C * (nDone + sent.length) / total : 0).toFixed(1) + ' ' + C.toFixed(1) + '"/>' +
    '<circle cx="42" cy="42" r="34" fill="none" stroke="#97C459" stroke-width="9" stroke-linecap="round" transform="rotate(-90 42 42)" stroke-dasharray="' + (total ? C * nDone / total : 0).toFixed(1) + ' ' + C.toFixed(1) + '"/>' +
    '<text x="42" y="40" text-anchor="middle" class="sc-ring__n">' + nDone + '/' + total + '</text><text x="42" y="55" text-anchor="middle" class="sc-ring__s">done</text></svg>';
  const progress = '<div class="sc-card sc-prog">' + ring + '<div class="sc-prog__l">' +
    '<span><i class="sc-dot" style="background:#E9B06A"></i>' + open.length + ' to send</span>' +
    '<span><i class="sc-dot" style="background:#D4B896"></i>' + sent.length + ' waiting for money</span>' +
    '<span><i class="sc-dot" style="background:#97C459"></i>' + nDone + ' done</span></div></div>' +
    '<div class="sc-money"><div class="sc-money__t is-back"><span><i class="ti ti-arrow-up-right" aria-hidden="true"></i> you pay back</span><b>' + scE(M.money.back) + '</b></div>' +
    '<div class="sc-money__t is-get"><span><i class="ti ti-arrow-down-left" aria-hidden="true"></i> you get</span><b>' + scE(M.money.get) + '</b></div></div>';

  // next step
  let next = '';
  if (M.running) next = '<div class="sc-card sc-note"><i class="ti ti-clock" aria-hidden="true"></i> ' + y + ' is still running – the NK-Abrechnung starts after 31.12.' + y + '. The numbers below are a preview.</div>';
  else if (!M.sendable) next = '<div class="sc-card sc-note"><i class="ti ti-archive" aria-hidden="true"></i> The deadline for ' + y + ' has passed. Letters and results stay here as history.</div>';
  else if (!M.locked) next = scNext('home', 'Check and lock the house costs', 'then the letters are ready', 'costs', 'Open');
  else if (open.length) next = scNextStart(open);
  else if (sent.length) next = '<div class="sc-card sc-note"><i class="ti ti-hourglass" aria-hidden="true"></i> All letters sent – ' + sent.length + ' waiting for money. Tap a tenant to settle.</div>';
  else if (total) next = '<div class="sc-card sc-done"><i class="ti ti-confetti" aria-hidden="true"></i><div><b>NK ' + y + ' done</b><span>' + total + ' tenants settled</span></div></div>';

  const L = M.R.check;
  const noData = !M.running && !M.R.lines.length && !M.ten.some(t => t.vz > 0);
  if (noData) next = '<div class="sc-card sc-nodata"><b><i class="ti ti-info-circle" aria-hidden="true"></i> No NK data for ' + y + ' yet</b>' +
    '<span>Controlling has no Casa Castel costs and no NK payments for ' + y + ', so every result would be 0 €.</span>' +
    '<span class="sc-nodata__b"><a class="sc-go" href="controlling.html">Open Controlling</a><button class="sc-go sc-go--ghost" data-sc="manual">Manual NK</button></span></div>';
  const costsCard = '<button class="sc-card sc-costs" data-sc="costs"><span class="sc-costs__i"><i class="ti ti-home" aria-hidden="true"></i></span>' +
    '<span class="sc-costs__t"><b>House costs ' + y + '</b><small class="' + (M.locked ? 'is-ok' : '') + '">' + (M.locked ? '<i class="ti ti-lock" aria-hidden="true"></i> locked ' + scDate(M.rec.locked_at) : 'not locked · preview') + (M.warn.length && !M.locked ? ' · ' + M.warn.length + ' to check' : '') + '</small></span>' +
    '<span class="sc-costs__v">' + scE(L.total) + '</span><i class="ti ti-chevron-right sc-chev" aria-hidden="true"></i></button>';

  const letters = scLettersHtml(y);
  const roomsHtml = scRoomsHtml(M);

  el.innerHTML = '<div class="st-page sc-page">' + yearNav + sql + progress + next + costsCard +
    '<div class="sc-sec">Rooms</div>' + roomsHtml + letters +
    (!M.ten.length ? '<p class="cx-empty">No tenants with Kalt + NK in ' + y + '.</p>' : '') + '</div>';
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
    if (b) return [r.dir > 0 ? 'neg' : 'pos', (r.dir > 0 ? 'paid you ' : 'got back ') + scE(b.amount)];
    if (r.via === 'kaution') return ['', (r.dir > 0 ? 'paid ' : 'got ') + scE(r.amount) + ' via Kaution'];
    if (r.via === 'miete') return ['', scE(r.amount) + ' with the rent'];
    return ['', 'balanced'];
  }
  if (t.k === 'sent') {
    const r = t.st.res;
    if (r.via === 'kaution' && t.einbehalt > 0) { const back = cxR(t.einbehalt - r.dir * r.amount); return back > 0 ? ['pos', 'Kaution: pay back ' + scE(back)] : ['', 'Kaution-Einbehalt used up']; }
    return r.dir > 0 ? ['neg', 'pays you ' + scE(r.amount)] : r.dir < 0 ? ['pos', 'gets ' + scE(r.amount) + ' back'] : ['', 'balanced'];
  }
  return s > 0 ? ['neg', 'pays you ' + a] : s < 0 ? ['pos', 'gets ' + a + ' back'] : ['', 'balanced'];
}
const scNorm = s => String(s || '').trim().toLowerCase();
function scRoomsHtml(M) {
  const rooms = (window._src.rooms || []).filter(r => r.active !== false).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(r => ({ name: r.name, m2: Number(r.flaeche_m2) || 0 }));
  for (const t of M.ten) if (!rooms.some(r => scNorm(r.name) === scNorm(t.room))) rooms.push({ name: t.room || 'Room', m2: t.m2 || 0 });
  const per = M.R.period;
  return rooms.map(r => {
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
      : list.some(t => t.k === 'sent') ? ['wait', 'waiting'] : ['done', '✓ done'];
    return '<div class="sc-card sc-roomc"><div class="sc-roomc__h"><span class="sc-av" style="background:' + c[0] + ';color:' + c[1] + '">' + stEsc(scAbbr(r.name)) + '</span>' +
      '<span class="sc-roomc__t"><b>' + stEsc(r.name) + '</b><small>' + (r.m2 ? String(r.m2).replace('.', ',') + ' m² · ' : '') + (list.length ? list.length + (list.length === 1 ? ' tenant' : ' tenants') : 'no tenant') + '</small></span>' +
      '<span class="sc-chip sc-chip--' + chip[0] + '">' + stEsc(chip[1]) + '</span></div>' +
      items.map(it => it.gap
        ? '<div class="sc-gap">empty ' + stDM(it.from) + '–' + stDM(it.to) + ' · ' + NkCasa.daysBetween(it.from, it.to) + ' days</div>'
        : scRowHtml(it, M, true)).join('') + '</div>';
  }).join('');
}
function scRowHtml(t, M, inRoom) {
  const c = scAv(t.room), say = scSay(t);
  const chip = t.k === 'open' ? (M.locked ? ['send', 'to send'] : ['grey', 'preview']) : t.k === 'sent' ? ['wait', 'sent ' + stDM(t.st.res.date)] :
    t.k === 'done' ? ['done', t.skipped ? 'skipped' : '✓ ' + (t.st.booking ? 'paid' : t.st.res && t.st.res.via === 'kaution' ? 'Kaution' : 'done')] : ['grey', 'Pauschal'];
  const per = (t.days < M.R.days ? stDM(t.from) + '–' + stDM(t.to) : 'whole year') + (t.movedOut ? ' · moved out' : '');
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
  h.innerHTML = '<div class="srm" role="dialog" aria-label="NK-Abrechnung Casa Castel"><div class="srm__bg" data-sc="close"></div><div class="srm__win sc-win">' + inner + '</div></div>';
  document.body.classList.add('st-panel-open');
}
const scHead = (t, s, back, pre) => '<div class="srm__h"><div class="srm__ht">' + (back ? '<button class="srm__back" data-sc="' + back + '"><i class="ti ti-chevron-left" aria-hidden="true"></i> Back</button>' : '') +
  (pre || '') + '<p class="srm__t">' + stEsc(t) + '</p><p class="srm__s">' + stEsc(s) + '</p></div><button class="srm__x" data-sc="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';

/* ── House costs sheet ── */
const scKeyTxt = k => k === 'flaeche' ? 'by room m²' : 'by person';
function scSpreadTxt(M, id) {
  const ln = M.input.lines.find(l => l.id === id); if (!ln || !ln.parts.length) return '';
  const p = ln.parts[0];
  return p.spread === 'year' ? 'over the year' : p.spread === 'from' ? 'from ' + stDM(p.date) + ' to 31.12.' : 'in its month';
}
function scCostsView(M) {
  const R = M.R, groups = [['running', 'Running costs', 'Expenses · Casa Castel'], ['hausgeld', 'Hausgeld', 'One-off · yearly Strom / Gas / Wasser results'], ['oneoff', 'NK one-offs', 'One-off · shared from the purchase date']];
  const warn = !M.locked && M.warn.length ? '<div class="srm__banner is-warn"><div><p class="srm__banner-t">Please check</p><p class="srm__banner-s">' + M.warn.map(stEsc).join('<br/>') + '</p></div></div>' : '';
  const lockB = M.locked
    ? '<div class="srm__banner"><div><p class="srm__banner-t"><i class="ti ti-lock" aria-hidden="true"></i> Costs locked</p><p class="srm__banner-s">' + scDate(M.rec.locked_at) + ' · the letters use this snapshot</p></div><button class="cx-link" data-sc="unlock">Unlock</button></div>'
    : '<div class="srm__banner"><div><p class="srm__banner-t">Not locked yet</p><p class="srm__banner-s">Live from Controlling. Lock the costs when everything for ' + M.y + ' is booked – then the letters can be sent.</p></div></div>';
  const card = ([g, t, s]) => {
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
    (lnd.vacancy ? '<div class="sc-li"><span>You · days nobody lived there</span><span>' + scE(lnd.vacancy) + '</span></div>' : '') +
    (lnd.rounding ? '<div class="sc-li"><span>Rounding</span><span>' + scE(lnd.rounding) + '</span></div>' : '') +
    '<div class="srm__chk' + (Lc.ok ? '' : ' is-warn') + '"><span><i class="ti ti-' + (Lc.ok ? 'check' : 'alert-triangle') + '" aria-hidden="true"></i> ' + (Lc.ok ? 'adds up' : 'does not add up') + '</span><span>' + scE(Lc.total) + '</span></div></div>';
  void tot;
  const hasList = R.lines.some(l => l.group !== 'running');
  return scHead('House costs ' + M.y, 'Casa Castel · 01.01.–31.12.' + M.y + ' · from Controlling', '') +
    '<div class="srm__b"><div class="srm__one">' + warn + lockB + groups.map(card).join('') +
      (!R.lines.length ? '<p class="cx-empty">No NK costs found for ' + M.y + '. Check Controlling › Casa Castel › Expenses and the NK settings in Setup.</p>' : '') + who + '</div></div>' +
    '<div class="srm__bar srm__bar--2">' + (hasList ? '<button class="cx-btn cx-btn--s" data-sc="listPdf"><i class="ti ti-file-text" aria-hidden="true"></i> Invoice list PDF</button>' : '') +
      (M.locked ? '' : M.sendable ? '<button class="cx-btn cx-btn--p" data-sc="lock"' + (R.lines.length ? '' : ' disabled') + '><i class="ti ti-lock" aria-hidden="true"></i> Lock costs</button>' : '') + '</div>';
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
  const tone = saldo > 0 ? 'neg' : saldo < 0 ? 'pos' : 'even';
  const noData = !t.lines.length && !t.vz;
  const why = noData ? 'There are no NK costs or payments for ' + M.y + ' in Controlling yet.'
    : saldo > 0 ? first + '\'s share was a little more than the NK paid with the rent.'
    : saldo < 0 ? first + ' paid a bit more NK than the share – the rest goes back.' : 'The NK paid with the rent covers the share exactly.';
  if (noData) return head + '<div class="srm__b"><div class="srm__one sc-sheet">' +
    '<div class="sc-card sc-nodata"><b><i class="ti ti-info-circle" aria-hidden="true"></i> No NK for ' + M.y + ' yet</b>' +
    '<span>' + stEsc(first) + ' lived here ' + t.days + ' days in ' + M.y + ', but there are no house costs and no NK payments for ' + M.y + ' in Controlling – so there is nothing to split yet.</span>' +
    '<span class="sc-nodata__b"><a class="sc-go" href="controlling.html">Open Controlling</a><button class="sc-go sc-go--ghost" data-sc="manual">Manual NK</button></span></div></div></div>';
  const hero = '<div class="sc-res is-' + tone + '"><span class="sc-res__l">' + (saldo > 0 ? stEsc(first) + ' pays you' : saldo < 0 ? stEsc(first) + ' gets back' : '<i class="ti ti-circle-check" aria-hidden="true"></i> All even') + '</span>' +
    '<span class="sc-res__v">' + scE(Math.abs(saldo)) + '</span>' +
    '<span class="sc-res__w">' + stEsc(why) + (!M.locked && t.k === 'open' && !noData ? ' <em>Preview until the house costs are locked.</em>' : '') + '</span></div>';
  const tiles = '<div class="sc-tiles"><div class="sc-tile"><i class="ti ti-calendar" aria-hidden="true"></i><small>lived here</small><b>' + t.days + ' days</b></div>' +
    '<div class="sc-tile"><i class="ti ti-home" aria-hidden="true"></i><small>' + stEsc(first) + '\'s share</small><b>' + scE(t.sum) + '</b></div>' +
    '<div class="sc-tile"><i class="ti ti-coins" aria-hidden="true"></i><small>already paid</small><b>' + scE(t.vz) + '</b></div></div>';
  const kau = t.einbehalt > 0 ? '<div class="sc-kau"><i class="ti ti-lock" aria-hidden="true"></i><span><b>' + scE(t.einbehalt) + ' of the Kaution held back</b><small>' +
    (cxR(t.einbehalt - t.saldo) >= 0 ? 'so ' + stEsc(first) + ' gets ' + scE(cxR(t.einbehalt - t.saldo)) + ' back in the end' : stEsc(first) + ' still pays ' + scE(cxR(t.saldo - t.einbehalt))) + '</small></span></div>' : '';
  // details: what the share is made of + the NK paid
  const lk = 'tl:' + t.key, lo = !!SC.open[lk], canEdit = t.k === 'open' && M.sendable;
  const pers = cxR(t.lines.filter(l => l.key === 'personen').reduce((a, l) => a + l.amount, 0)), fl = cxR(t.lines.filter(l => l.key === 'flaeche').reduce((a, l) => a + l.amount, 0));
  const vzOver = s.vz !== undefined && s.vz !== null && s.vz !== '';
  const det = '<button class="sc-more2" data-sc="fold" data-k="' + lk + '" aria-expanded="' + lo + '">See what the share is made of <i class="ti ti-chevron-' + (lo ? 'up' : 'down') + '" aria-hidden="true"></i></button>' +
    (lo ? '<div class="sc-det">' +
      '<div class="sc-det__s"><span><i class="ti ti-users" aria-hidden="true"></i> shared by person, day by day</span><b>' + scE(pers) + '</b></div>' +
      '<div class="sc-det__s"><span><i class="ti ti-flame" aria-hidden="true"></i> Gas by room size (' + (t.m2 ? String(t.m2).replace('.', ',') + ' m²' : 'm²') + ')</span><b>' + scE(fl) + '</b></div>' +
      t.lines.map(l => '<div class="sc-li"><span>' + stEsc(l.label) + '<small>' + (l.share * 100).toFixed(1).replace('.', ',') + ' % of ' + scE(l.total) + '</small></span><span>' + scE(l.amount) + '</span></div>').join('') +
      '<div class="sc-li"><span>Already paid<small>' + (t.vzMissing.length ? 'NK missing for ' + t.vzMissing.length + ' month(s) in Controlling' : 'NK part of the rent, by day') + (vzOver ? ' · changed by you' : '') + '</small></span><span>' + scE(t.vz) + '</span></div>' +
      (canEdit ? '<label class="st-f"><span class="st-f__l">Other amount paid (optional)</span><span class="st-amt"><input class="st-in" inputmode="decimal" data-sc-in="vz" data-k="' + stEsc(t.key) + '" value="' + (vzOver ? stEsc(cxE2(s.vz)) : '') + '" placeholder="' + stEsc(cxE2(t.vzAuto || 0)) + '"/><span>€</span></span></label>' : '') +
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
  const status = t.k === 'sent' ? '<div class="sc-stat is-wait"><i class="ti ti-hourglass" aria-hidden="true"></i> Sent ' + stDate(res.date) + (t.einbehalt > 0 && res.via === 'kaution' ? ' · Kaution still to pay back' : ' · waiting for the money') + '</div>'
    : t.k === 'done' ? '<div class="sc-stat is-done"><i class="ti ti-circle-check" aria-hidden="true"></i> ' + stEsc(t.skipped ? 'Skipped' : 'Done · ' + scSay(t)[1]) + '</div>' : '';
  let bar = '';
  if (t.k === 'open' && M.sendable) bar = '<button class="cx-btn cx-btn--s" data-sc="pdf" data-k="' + stEsc(t.key) + '"><i class="ti ti-file-text" aria-hidden="true"></i> PDF</button>' +
    '<button class="cx-btn cx-btn--p" data-sc="send" data-k="' + stEsc(t.key) + '"' + (M.locked && !noData ? '' : ' disabled') + '>' + (m.flow ? 'Sent · next <i class="ti ti-arrow-right" aria-hidden="true"></i>' : 'Mark as sent') + '</button>';
  else if (t.k === 'sent') bar = scLetterBtn(t) + '<button class="cx-btn cx-btn--p" data-sc="settle" data-k="' + stEsc(t.key) + '">' + (t.einbehalt > 0 && res.via === 'kaution' ? 'Close the Kaution' : 'Settle') + '</button>';
  else if (t.k === 'done') bar = scLetterBtn(t) + '<button class="cx-btn cx-btn--s" data-sc="reopen" data-k="' + stEsc(t.key) + '">Back to open</button>';
  const skipFlow = m.flow ? '<button class="cx-link sc-skipflow" data-sc="flowNext">Skip for now ›</button>' : '';
  const lockHint = t.k === 'open' && M.sendable && !M.locked && !noData ? '<p class="sc-hint2" style="text-align:center">Lock the house costs to send the letter.</p>' : '';
  return head + '<div class="srm__b"><div class="srm__one sc-sheet">' + hero + tiles + kau + status + det + letter + lockHint + skipFlow + '</div></div>' +
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
const scVia = t => (t.set && t.set.via) || (t.einbehalt > 0 ? 'kaution' : 'zahlung');
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
  const kauCase = t.einbehalt > 0 && res && res.via === 'kaution';
  const amt = b ? Number(b.amount) : kauCase ? Math.max(0, cxR(t.einbehalt - t.saldo)) : res ? res.amount : 0;
  const paidX = '<div class="sr-grid2 srm__opt-f"><label class="st-f"><span class="st-f__l">Amount</span><span class="st-amt"><input class="st-in" inputmode="decimal" id="scSetAmt" value="' + stEsc(cxE2(amt)) + '"/><span>€</span></span></label>' +
    '<label class="st-f"><span class="st-f__l">Date</span><input class="st-in" type="date" id="scSetDate" value="' + stEsc(b ? scD(b.invoice_date) : cxToday()) + '"/></label></div>';
  let opts = '';
  if (kauCase) {
    opts += opt('paid', amt > 0 ? 'Paid back to ' + stEsc(scFirst(t.name)) + ' (Guthaben + Kaution-Einbehalt)' : 'Kaution-Einbehalt used up', 'closes the Kaution · the amount may differ', paidX);
    opts += opt('skip', 'Skipped', 'not paid or not claimed – counts as done', '');
  } else if (res && res.amount) {
    opts += opt('paid', res.dir > 0 ? 'Paid by ' + stEsc(scFirst(t.name)) + (t.einbehalt > 0 ? ' (rest after the Kaution)' : '') : 'Paid back to ' + stEsc(scFirst(t.name)), 'the amount may differ from the result (' + scE(res.amount) + ')', paidX);
    opts += opt('kaution', 'Offset with the Kaution', 'no money moved', '');
    opts += opt('miete', 'Offset with the rent', 'no money moved', '');
  }
  if (!kauCase) opts += opt('skip', 'Skipped', 'not paid or not claimed – counts as done', '');
  return scHead('Settle – ' + t.name, 'NK ' + M.y + ' · ' + t.room + (res ? ' · ' + (res.dir > 0 ? 'Nachzahlung ' : 'Guthaben ') + scE(res.amount) : ''), 'backTen') +
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
  if (a === 'lock') return scLock(b);
  if (a === 'unlock') return scUnlock();
  if (a === 'listPdf') return scListPdf(b);
  if (a === 'pdf') return scPdf(b.dataset.k, b);
  if (a === 'send') return scSend(b.dataset.k, b);
  if (a === 'settle') { SC.modal = { view: 'settle', key: b.dataset.k, back: SC.modal }; return scRenderModal(); }
  if (a === 'backTen') { const m = SC.modal; SC.modal = (m && m.back) || { view: 'ten', key: m && m.key }; return scRenderModal(); }
  if (a === 'choice') { SC.modal.choice = b.dataset.v; return scRenderModal(); }
  if (a === 'settleSave') return scSettleSave(b.dataset.k, b);
  if (a === 'reopen') return scReopen(b.dataset.k);
}
function scInput(e) {
  const el = e.target, f = el && el.dataset && el.dataset.scIn; if (!f) return;
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
  if (M.warn.length && !confirm('There are ' + M.warn.length + ' point(s) to check:\n\n' + M.warn.join('\n') + '\n\nLock the costs anyway?')) return;
  const r = scRecEnsure(M.y);
  const input = NkCasa.fromControlling(M.y, { castel_expenses: SC.data[M.y].castel_expenses, one_time: SC.data[M.y].one_time, income: window._src.incAll || [] });
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
  if (!confirm('Unlock the house costs ' + M.y + '?\n\nThe numbers then follow Controlling again.' + (sent ? '\n' + sent + ' letter(s) were already sent – they stay as sent and archived.' : ''))) return;
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
  } catch (e) { console.error('[settlements] casa PDF', e); alert('The PDF could not be created. Please try again.'); }
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
  catch (e) { console.error(e); alert('The PDF could not be created. Please try again.'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = reset; } }
}

/* Mark as sent: letter → archive, result → Controlling (same path as Rentals) */
async function scSend(key, btn) {
  const M = SC.model, t = M && M.ten.find(x => x.key === key); if (!t) return;
  if (!M.locked) { stSay('Lock the house costs first'); return; }
  if (!t.line) { stSay('This tenant is not in the settlement list – check move-in / move-out in Casa Castel'); return; }
  const s = t.set || {};
  const amount = Math.abs(t.saldo), dir = t.saldo > 0 ? 1 : t.saldo < 0 ? -1 : 0;
  let via = dir ? scVia(t) : (t.einbehalt > 0 ? 'kaution' : 'zahlung');
  let amountRec = amount;
  if (via === 'kaution' && t.einbehalt > 0 && t.saldo > t.einbehalt) { via = 'zahlung'; amountRec = cxR(t.saldo - t.einbehalt); }   // Einbehalt too small → tenant pays the rest
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
    const kauCase = t.einbehalt > 0 && res && res.via === 'kaution';
    const closeKau = async paidBack => {                    // Kaution-Einbehalt done: add what was paid back, nothing held any more
      const k = t.kau; if (!k || !k.id) return;
      const upd = { nk_einbehalt: 0, returned: cxR((Number(k.returned) || 0) + (paidBack || 0)) };
      if (Object.prototype.hasOwnProperty.call(k, 'deduction_reason')) upd.deduction_reason = [k.deduction_reason, 'NK ' + M.y + ' verrechnet'].filter(Boolean).join(' · ');
      const { error } = await _ctlSupa.from('kaution').update(upd).eq('id', k.id); if (error) throw error;
      Object.assign(k, upd);
    };
    if (choice === 'paid' && kauCase) {
      const amt = cxR(Math.abs(cxParse((document.getElementById('scSetAmt') || {}).value || '0') || 0));
      await dropBooking(); await closeKau(amt);
    } else if (choice === 'paid' && res) {
      const amt = cxR(Math.abs(cxParse((document.getElementById('scSetAmt') || {}).value || '0') || 0));
      const date = scD((document.getElementById('scSetDate') || {}).value) || cxToday();
      if (!(amt > 0)) { stSay('Please enter the amount'); if (btn) btn.disabled = false; return; }
      if (t.einbehalt > 0 && res.dir > 0) await closeKau(0);            // the Einbehalt was used for the Nachzahlung
      if (res.via !== 'zahlung') await setVia('zahlung');
      if (b) {
        const d = await ctlUpdateOneTime(b.id, { amount: amt, invoice_date: date });
        const i = (window._src.abrPay || []).findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
      } else {
        const d = await ctlAddOneTime({ property_id: CASA_PROP_ID, invoice_date: date, item: 'NK ' + M.y + ' · ' + t.name + ' · ' + (res.dir > 0 ? 'Nachzahlung' : 'Guthaben'),
                                        amount: amt, kind: 'NK-Abrechnung', direction: res.dir, source_ref: 'abr:' + res.id });
        window._src.abrPay = (window._src.abrPay || []).concat([d]);
      }
    } else if ((choice === 'kaution' || choice === 'miete') && res) {
      await dropBooking(); await setVia(choice);
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
  if (!confirm('Set ' + t.name + ' back to open?' + (b ? '\n\nThe payment of ' + scDate(b.invoice_date) + ' (' + scE(b.amount) + ') in Controlling is removed too.' : res ? '\n\nThe result disappears from Controlling.' : ''))) return;
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
