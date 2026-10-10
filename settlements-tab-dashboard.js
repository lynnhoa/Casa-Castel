/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — DASHBOARD TAB + MANUAL NK-ABRECHNUNG
   settlements-tab-dashboard.js

   Dashboard (first tab, read only + one button)
     · "NK-Abrechnung erstellen" → manual calculator (older years, anything not in the app)
     · Needs you        at most 3 next steps from Rentals and Casa Castel (tap = jump there)
     · Rentals / Casa Castel summary: progress ring · you pay back / you get · Frist countdown
     · Casa Castel house costs per year (locked snapshots)
     · Drafts (manual) · Last letters (archive)

   Manual NK-Abrechnung (table nk_abrechnung_manual)
     property sets the Betreff · tenant name + current address typed (former tenants)
     cost lines: 100 % · by days · % · direct € → the tenant's share
     Vorauszahlungen: one field per month (fill all) · result · settle by
     Preview PDF (same frame as every NK letter, nk-letter.js) → Mark as sent →
     archive (nk_letters, app 'manual') + optional result in Controlling (abr_results)
   ───────────────────────────────────────────────────────────── */

'use strict';

const SD = { loaded: false, loading: false, missing: false, drafts: [], modal: null, d: null, saveTimer: null, dirty: false, year: null };
const SD_TABLE = 'nk_abrechnung_manual';
const SD_SPLITS = [['full', '100 %'], ['days', 'By days'], ['pct', '%'], ['direct', 'Direct €']];

const sdD = iso => String(iso || '').slice(0, 10);
const sdE = v => stEur(cxR(v));
const sdDays = (a, b) => Math.round((new Date(sdD(b) + 'T12:00:00Z') - new Date(sdD(a) + 'T12:00:00Z')) / 864e5) + 1;
const sdNum = v => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : cxParse(String(v)); return n === null || isNaN(n) ? null : n; };

/* ── Load ─────────────────────────────────────────────────── */
async function sdLoad() {
  SD.loading = true;
  try {
    const tasks = [];
    if (typeof SR !== 'undefined' && !SR.loaded && typeof srLoadRows === 'function') tasks.push(srLoadRows());
    if (typeof SC !== 'undefined' && !SC.loaded && typeof scLoadRows === 'function') tasks.push(scLoadRows());
    tasks.push((async () => {
      const r = await _ctlSupa.from(SD_TABLE).select('*').order('updated_at', { ascending: false });
      if (r.error) { SD.missing = true; SD.drafts = []; } else { SD.missing = false; SD.drafts = r.data || []; }
    })());
    await Promise.all(tasks);
    const y = Number(cxToday().slice(0, 4)) - 1, rec = typeof scRec === 'function' ? scRec(y) : null;
    if (!(rec && rec.locked_at) && typeof scLoadYear === 'function') { try { await scLoadYear(y); } catch (e) {} }
  } finally { SD.loaded = true; SD.loading = false; }
}

/* ── Summaries ────────────────────────────────────────────── */
function sdRentals(Y) {
  let infos;
  try { infos = _srYearModel(Y).map(_srCardInfo4); } catch (e) { console.warn('[settlements] dashboard rentals', e); return null; }
  const live = infos.filter(i => i.k !== 'before'), S = srSummary(infos);
  const s = { live: live.length, settled: live.filter(i => i.k === 'settled').length, back: 0, get: 0, toSend: 0, steps: [], frist: null,
              ten: S.ten, hg: S.hg, sent: 0, hvIn: S.nHgIn };
  for (const i of live) {
    if (i.c.per.frist && (!s.frist || i.c.per.frist < s.frist) && i.k !== 'settled') s.frist = i.c.per.frist;
    for (const r of i.rows) {
      if (r.kind !== 'ten') continue;
      if (r.k === 'open') s.toSend++;
      if (r.k === 'sent' && r.st.confirm) s.steps.push({ o: 2, ic: 'check', t: 'Confirm settlement ' + (r.st.res.via === 'miete' ? 'with the rent' : 'via Kaution'), s: 'Rentals · ' + i.c.p.name + ' · ' + stEur(r.st.res.amount), go: { tab: 'rentals', ck: i.c.ck, view: 'settle', tid: String(r.it.r.id), y: Y } });
    }
    const hv = i.hv; if (!hv) continue;
    if (hv.k === 'ueberfaellig') s.steps.push({ o: 1, ic: 'alert-circle', red: true, t: 'Jahresabrechnung overdue', s: 'Rentals · ' + i.c.p.name, go: { tab: 'rentals', ck: i.c.ck, view: 'hv', y: Y } });
    else if (hv.k === 'erfassen') s.steps.push({ o: 3, ic: 'pencil', t: 'Enter costs', s: 'Rentals · ' + i.c.p.name, go: { tab: 'rentals', ck: i.c.ck, view: 'hv', y: Y } });
    else if (hv.k === 'weg') s.steps.push({ o: 4, ic: 'scale', t: 'Enter the WEG result', s: 'Rentals · ' + i.c.p.name, go: { tab: 'rentals', ck: i.c.ck, view: 'hv', y: Y } });
  }
  return s;
}
function sdCasa(Y) {
  if (typeof scModel !== 'function' || typeof SC === 'undefined' || !SC.loaded) return null;
  let M; try { M = scModel(Y); } catch (e) { return null; }
  if (!M || M.error || M.loading) return null;
  const nk = M.ten.filter(t => t.k !== 'none');
  return { M, total: nk.length, done: nk.filter(t => t.k === 'done').length, open: nk.filter(t => t.k === 'open').length, sent: nk.filter(t => t.k === 'sent').length,
           back: M.money.back, get: M.money.get, ten: M.money.ten, hg: M.money.hg, frist: M.frist, locked: M.locked, sendable: M.sendable,
           confirm: nk.filter(t => t.k === 'sent' && t.st && t.st.confirm) };
}
const sdLeft = iso => iso ? Math.round((new Date(sdD(iso) + 'T12:00:00Z') - new Date(cxToday() + 'T12:00:00Z')) / 864e5) : null;

/* ── Render ───────────────────────────────────────────────── */
function stRenderDashboard() {
  const el = document.getElementById('tab-dashboard'); if (!el) return;
  sdEnsureHost();
  if (!SD.loaded) {
    el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">Loading …</p></div>';
    if (!SD.loading) sdLoad().then(() => { if (ST.tab === 'dashboard') stRenderDashboard(); }).catch(e => { el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">Could not load.</p><p class="st-muted">' + stEsc(e.message || e) + '</p></div>'; });
    return;
  }
  const ty = Number(cxToday().slice(0, 4));
  if (!SD.year) SD.year = ty - 1;
  const Y = SD.year;
  if (typeof scLoadYear === 'function' && typeof SC !== 'undefined' && !SC.data[Y] && !((scRec(Y) || {}).locked_at)) {
    el.innerHTML = '<div class="st-page sc-page"><p class="cx-empty">Loading …</p></div>';
    scLoadYear(Y).then(() => { if (ST.tab === 'dashboard') stRenderDashboard(); }).catch(() => { SC.data[Y] = SC.data[Y] || { castel_expenses: [], one_time: [], per: scPeriod(Y) }; stRenderDashboard(); });
    return;
  }
  const ren = sdRentals(Y), casa = sdCasa(Y);
  const casaLabel = casa ? stNkLabel(casa.M.per.from, casa.M.per.to) : '';
  // ── Read-only overview (Oct 2026): no reminders or to-dos here — those live in the tabs
  const O = sdOverview(Y, casa);
  const fr = [ren && ren.frist, casa && casa.frist].filter(Boolean).sort()[0] || null;
  const yearNav = '<div class="sc-yr">' +
    '<button class="cx-arw" data-sd="year" data-d="-1" aria-label="Previous year"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="sc-yr__t"><div class="sc-yr__m">' + Y + '</div><div class="sc-yr__s">NK periods ending in ' + Y + (fr ? ' · Frist ' + stDe(fr) : '') + '</div></div>' +
    '<button class="cx-arw" data-sd="year" data-d="1" aria-label="Next year"' + (Y >= ty ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
  // the cute one stays as it was: manual NK-Abrechnung (older years or anything not in the app)
  const create = '<button class="sd-c4" data-sd="new"><span class="sd-c4__i" aria-hidden="true">🏡<span class="sd-c4__s">✨</span></span>' +
    '<span class="sd-c4__t"><b>NK-Abrechnung erstellen</b><small>manual · older years</small></span><span class="sd-c4__p" aria-hidden="true"><i class="ti ti-plus"></i></span></button>';
  const drafts = SD.drafts.filter(d => d.status !== 'sent');
  const draftsHtml = drafts.length ? '<div class="sdo-dr"><button class="sdo-drb" data-sd="drafts" aria-expanded="' + !!SD.showDrafts + '"><i class="ti ti-pencil" aria-hidden="true"></i>' + drafts.length + (drafts.length === 1 ? ' draft' : ' drafts') + ' <i class="ti ti-chevron-' + (SD.showDrafts ? 'up' : 'down') + '" aria-hidden="true"></i></button></div>' +
    (SD.showDrafts ? '<div class="sc-card sc-list" style="margin-top:6px">' + drafts.map(d =>
      '<button class="sc-row" data-sd="openDraft" data-id="' + stEsc(d.id) + '"><span class="sc-av sc-av--doc"><i class="ti ti-pencil" aria-hidden="true"></i></span><span class="sc-row__m"><span class="sc-row__n">' + stEsc(d.tenant_name || 'Tenant') + '</span>' +
      '<span class="sc-row__p">' + stEsc(sdPropName(d) + ' · NK ' + String(d.period_to || '').slice(0, 4)) + '</span></span><span class="sc-open">Open</span></button>').join('') + '</div>' : '') : '';
  const sql = SD.missing ? '<div class="st-soon"><i class="ti ti-database" aria-hidden="true"></i><div><strong>Run the SQL once</strong><span>The table nk_abrechnung_manual is missing – the SQL is in the chat.</span></div></div>' : '';

  el.innerHTML = '<div class="st-page sc-page sd-page">' + create + draftsHtml + yearNav + sql + sdOverviewHTML(Y, O) + '</div>';
  sdRenderModal();
}


/* ── Overview data (read only) ───────────────────────────────
   Stages per tenant settlement: 0 waiting for costs · 1 calculated · 2 sent · 3 settled.
   Money: > 0 comes to you · < 0 you pay (sent = the real result, otherwise the calculated preview). */
function sdOverview(Y, casa) {
  const O = { stages: [0, 0, 0, 0], get: 0, pay: 0, ten: null, hg: null, ren: null, casa: null };
  const add = (a, v) => v === null || v === undefined ? a : (a === null ? 0 : a) + v;
  // Rentals
  let infos = [];
  try { infos = _srYearModel(Y).map(_srCardInfo4).filter(i => i.k !== 'before'); } catch (e) { console.warn('[settlements] overview rentals', e); }
  if (infos.length) {
    const S = srSummary(infos);
    const R = { stages: [0, 0, 0, 0], ten: S.ten, hg: S.hg, get: 0, pay: 0, props: [] };
    const rk = r => r.skipped || r.k === 'settled' ? 3 : r.k === 'sent' ? 2 : r.k === 'open' ? 1 : 0;
    const hk = hv => !hv ? 3 : hv.k === 'fertig' ? 3 : hv.k === 'zahlung' ? 2 : hv.k === 'weg' ? 1 : 0;
    const order = (window._ctrl.properties || []).filter(p => p.active && p.id !== CASA_PROP_ID).sort(stPropOrder).map(p => p.id);
    for (const i of infos) {
      const rows = i.rows.filter(r => r.kind === 'ten');
      rows.forEach(r => R.stages[rk(r)]++);
      const tr = S.tenRows.filter(x => x.i === i);
      const w = i.hv && i.hv.wegSt && i.hv.wegSt.res ? i.hv.wegSt.res.dir * i.hv.wegSt.res.amount : null;
      R.props.push({ name: i.c.p.name, who: rows.map(r => r.name).filter(Boolean).join(', '),
        stage: Math.min(hk(i.hv), ...(rows.length ? rows.map(rk) : [3])), ten: tr.length ? cxR(tr.reduce((a, x) => a + x.v, 0)) : null,
        hg: w === null ? null : cxR(w), waitHv: !!i.hv && hk(i.hv) === 0, o: order.indexOf(i.c.p.id) });
    }
    S.tenRows.forEach(x => { if (x.v > 0) R.get += x.v; else R.pay -= x.v; });
    S.hgRows.forEach(x => { if (!x.w) return; const v = x.w.dir * x.w.amount; if (v > 0) R.get += v; else R.pay -= v; });
    R.props.sort((a, b) => a.o - b.o);
    R.n = R.stages.reduce((a, v) => a + v, 0); R.done = R.stages[3];
    O.ren = R;
  }
  // Casa Castel
  if (casa && casa.M) {
    const M = casa.M, C = { stages: [0, 0, 0, 0], ten: M.money.ten, hg: M.money.hg, get: M.money.get || 0, pay: M.money.back || 0, rows: [] };
    (M.money.hgLines || []).forEach(l => { const t = Number(l.total) || 0; if (t > 0) C.pay += t; else C.get -= t; });
    let vz = 0, share = 0;
    for (const t of M.ten) {
      if (t.k === 'none') { C.rows.push({ room: t.room, name: t.name, former: t.movedOut, stage: -1, v: null }); continue; }
      const st = t.k === 'done' ? 3 : t.k === 'sent' ? 2 : M.locked ? 1 : 0;
      C.stages[st]++;
      const v = t.st && t.st.res ? t.st.res.dir * t.st.res.amount : (M.R.lines.length ? t.saldo : null);
      C.rows.push({ room: t.room, name: t.name, former: t.movedOut, stage: st, v: v === null ? null : cxR(v) });
      vz += Number(t.vz) || 0; share += Number(t.sum) || 0;
    }
    const total = M.R && M.R.check ? Number(M.R.check.total) || 0 : 0;
    const prevRow = (typeof SC !== 'undefined' ? SC.rows : []).find(r => Number(r.year) === Y - 1 && r.snapshot && r.snapshot.total !== undefined);
    const rooms = ((window._src && window._src.rooms) || []).filter(r => r.active !== false).length;
    C.costs = { total: cxR(total), prev: prevRow ? cxR(Number(prevRow.snapshot.total) || 0) : null, rooms,
                vz: cxR(vz), share: cxR(share), locked: M.locked,
                cats: (M.R.lines || []).filter(l => l.group !== 'hausgeld' && Number(l.total) > 0).sort((a, b) => b.total - a.total).slice(0, 4).map(l => ({ label: l.label, total: cxR(l.total) })) };
    C.n = C.stages.reduce((a, v) => a + v, 0); C.done = C.stages[3];
    if (C.n || C.rows.length || total) O.casa = C;
  }
  for (const X of [O.ren, O.casa]) {
    if (!X) continue;
    X.stages.forEach((v, k) => O.stages[k] += v);
    O.get += X.get; O.pay += X.pay;
    O.ten = add(O.ten, X.ten); O.hg = add(O.hg, X.hg);
  }
  O.get = cxR(O.get); O.pay = cxR(O.pay);
  O.n = O.stages.reduce((a, v) => a + v, 0); O.done = O.stages[3];
  return O;
}

const SDO_ST = [['Waiting for costs', '#DDD5C9'], ['Calculated', '#CDB894'], ['Sent', '#A9BFD3'], ['Settled', '#9DBF7A']];
function sdOverviewHTML(Y, O) {
  if (!O.ren && !O.casa) return '<div class="sdo-card sdo-empty">No settlements for ' + Y + '.</div>';
  const W = v => v === null || v === undefined ? '\u2014' : cxWS(v);
  const cls = v => v === null || v === undefined ? 'nil' : v < -0.4 ? 'neg' : v > 0.4 ? 'pos' : 'nil';
  const pipe = st => '<span class="sdo-pipe">' + st.map((v, k) => v ? '<i style="flex:' + v + ';background:' + SDO_ST[k][1] + '"></i>' : '').join('') + '</span>';
  // Total
  const net = cxR(O.get - O.pay), sc = Math.max(O.get, O.pay, 1);
  const total = '<div class="sdo-card">' +
    '<div class="sdo-hrow"><span class="sdo-lbl">NK ' + Y + ' \u00b7 all properties</span><span class="sdo-mut">result</span></div>' +
    '<div class="sdo-kpis">' +
      '<div class="sdo-kpi"><div class="sdo-k">TENANTS</div><div class="sdo-v sdo-f ' + cls(O.ten) + '">' + W(O.ten) + '</div><div class="sdo-d">' + (O.ten === null ? 'not calculated yet' : 'Nachzahlungen \u2212 Guthaben') + '</div></div>' +
      '<div class="sdo-kpi"><div class="sdo-k">HV \u00b7 VERSORGER</div><div class="sdo-v sdo-f ' + cls(O.hg) + '">' + W(O.hg) + '</div><div class="sdo-d">' + (O.hg === null ? 'no results yet' : 'Hausgeld \u00b7 Strom \u00b7 Gas \u00b7 Wasser') + '</div></div>' +
    '</div>' +
    '<div class="sdo-wf">' +
      '<div class="sdo-wr"><span class="sdo-wn">You get</span><span class="sdo-bar"><i style="width:' + (O.get / sc * 100).toFixed(1) + '%;background:#9DBF7A"></i></span><span class="sdo-wa pos">' + cxWS(O.get) + '</span></div>' +
      '<div class="sdo-wr"><span class="sdo-wn">You pay</span><span class="sdo-bar"><i style="width:' + (O.pay / sc * 100).toFixed(1) + '%;background:#E3A895"></i></span><span class="sdo-wa neg">' + cxW(-O.pay) + '</span></div>' +
      '<div class="sdo-wr"><span class="sdo-wn sdo-wn--b">Net</span><span class="sdo-bar"><i style="width:' + (Math.abs(net) / sc * 100).toFixed(1) + '%;background:' + (net < 0 ? '#D98B74' : '#C9B38F') + '"></i></span><span class="sdo-wa ' + cls(net) + '">' + cxWS(net) + '</span></div>' +
    '</div>' +
    (O.n ? '<div class="sdo-prog"><div class="sdo-ph"><span>Settled</span><span><b class="sdo-f">' + O.done + '</b> of ' + O.n + '</span></div>' + pipe(O.stages) +
      '<div class="sdo-leg">' + SDO_ST.map((x, k) => '<span><i style="background:' + x[1] + '"></i>' + x[0] + ' ' + O.stages[k] + '</span>').join('') + '</div></div>' : '') +
  '</div>';
  // Tiles
  const sec = SD.sec || '';
  const tile = (key, name, icon, X, hgLabel) => '<button class="sdo-tile' + (sec === key ? ' on' : '') + '" data-sd="sec" data-k="' + key + '" aria-expanded="' + (sec === key) + '">' +
    '<span class="sdo-tn"><span class="sdo-ic sdo-ic--' + key + '"><i class="ti ti-' + icon + '" aria-hidden="true"></i></span>' + name + '</span>' +
    '<span class="sdo-tvr"><span class="sdo-k">TENANTS</span><span class="sdo-v2 sdo-f ' + cls(X.ten) + '">' + W(X.ten) + '</span></span>' +
    '<span class="sdo-tvr"><span class="sdo-k">' + hgLabel + '</span><span class="sdo-v2 sdo-f ' + cls(X.hg) + '">' + W(X.hg) + '</span></span>' +
    pipe(X.stages).replace('sdo-pipe', 'sdo-pipe sdo-pipe--s') +
    '<span class="sdo-tf"><span>' + X.done + ' of ' + X.n + ' settled</span><span class="' + cls(cxR(X.get - X.pay)) + '">net ' + cxWS(cxR(X.get - X.pay)) + '</span></span></button>';
  const both = O.ren && O.casa;
  const tiles = '<div class="sdo-two' + (both ? '' : ' sdo-one') + '">' +
    (O.ren ? tile('r', 'Rentals', 'building', O.ren, 'HV \u00b7 WEG') : '') +
    (O.casa ? tile('c', 'Casa Castel', 'home-heart', O.casa, 'VERSORGER') : '') + '</div>' +
    '<div class="sdo-hint">Tap ' + (both ? 'Rentals or Casa Castel' : 'it') + ' for the overview</div>';
  // Panels (one at a time)
  const stTag = k => k < 0 ? '<span class="sdo-st"><i style="background:#EFE8DD"></i>Pauschal</span>' : '<span class="sdo-st"><i style="background:' + SDO_ST[k][1] + '"></i>' + SDO_ST[k][0].replace(' for costs', '') + '</span>';
  let panel = '';
  if (sec === 'r' && O.ren) {
    panel = '<div class="sdo-card"><span class="sdo-lbl">Rentals \u00b7 per property</span>' +
      '<div class="sdo-lh"><span>PROPERTY</span><span>STATUS</span><span>TENANTS</span></div>' +
      O.ren.props.map(x => '<div class="sdo-lr"><span class="sdo-lm"><span class="sdo-ln">' + stEsc(x.name) + '</span><span class="sdo-ls">' +
        stEsc([x.who, x.waitHv ? 'waiting for the HV' : x.hg !== null ? 'HV ' + cxWS(x.hg) : ''].filter(Boolean).join(' \u00b7 ')) + '</span></span>' +
        stTag(x.stage) + '<b class="sdo-lv ' + cls(x.ten) + '">' + W(x.ten) + '</b></div>').join('') + '</div>';
  } else if (sec === 'c' && O.casa) {
    panel = '<div class="sdo-card"><span class="sdo-lbl">Casa Castel \u00b7 per tenant</span>' +
      '<div class="sdo-lh"><span>ROOM \u00b7 TENANT</span><span>STATUS</span><span>RESULT</span></div>' +
      O.casa.rows.map(x => '<div class="sdo-lr"><span class="sdo-lm"><span class="sdo-ln">' + stEsc(x.room || '\u2014') + '</span><span class="sdo-ls">' +
        stEsc([x.name, x.former ? 'former' : ''].filter(Boolean).join(' \u00b7 ')) + '</span></span>' +
        stTag(x.stage) + (x.stage < 0 ? '<b class="sdo-lv sdo-lv--t">in the rent</b>' : '<b class="sdo-lv ' + cls(x.v) + '">' + W(x.v) + '</b>') + '</div>').join('') + '</div>';
  }
  // Casa Castel house costs
  let costs = '';
  const K = O.casa && O.casa.costs;
  if (K && K.total) {
    const ch = K.prev ? (K.total - K.prev) / K.prev * 100 : null;
    const sc2 = Math.max(K.share, K.vz, 1), cov = K.share > 0 ? Math.round(K.vz / K.share * 100) : null;
    const mx = Math.max(1, ...K.cats.map(c => c.total));
    costs = '<div class="sdo-card"><span class="sdo-lbl">Casa Castel \u00b7 house costs ' + Y + (K.locked ? '' : ' \u00b7 preview') + '</span>' +
      '<div class="sdo-cst">' +
        '<div><div class="sdo-k">TOTAL</div><div class="sdo-v3 sdo-f">' + cxW(K.total) + '</div><div class="sdo-d">for the year</div></div>' +
        (K.rooms ? '<div><div class="sdo-k">PER ROOM</div><div class="sdo-v3 sdo-f">' + cxW(K.total / K.rooms) + '</div><div class="sdo-d">\u00d8 \u00b7 ' + K.rooms + ' rooms</div></div>' : '') +
        (ch !== null ? '<div><div class="sdo-k">VS ' + (Y - 1) + '</div><div class="sdo-v3 sdo-f ' + (ch > 0 ? 'neg' : 'pos') + '">' + (ch >= 0 ? '+ ' : '\u2212 ') + Math.abs(ch).toFixed(0) + ' %</div><div class="sdo-d">' + cxWS(K.total - K.prev) + '</div></div>' : '') +
      '</div>' +
      (K.share > 0 ? '<div class="sdo-cmp">' +
        '<div class="sdo-cr"><span>Their share</span><span class="sdo-bar"><i style="width:' + (K.share / sc2 * 100).toFixed(1) + '%;background:#C9B38F"></i></span><span>' + cxW(K.share) + '</span></div>' +
        '<div class="sdo-cr"><span>Vorauszahlungen</span><span class="sdo-bar"><i style="width:' + (K.vz / sc2 * 100).toFixed(1) + '%;background:#9DBF7A"></i></span><span>' + cxW(K.vz) + '</span></div>' +
        '<div class="sdo-cov">NK tenants \u00b7 prepayments cover ' + cov + ' % of their share</div></div>' : '') +
      (K.cats.length ? '<div class="sdo-cats"><div class="sdo-k" style="margin-bottom:4px">BIGGEST COSTS</div>' +
        K.cats.map(c => '<div class="sdo-cat"><span>' + stEsc(c.label) + '</span><span class="sdo-bar sdo-bar--s"><i style="width:' + (c.total / mx * 100).toFixed(1) + '%;background:#D9C6AE"></i></span><span>' + cxW(c.total) + '</span></div>').join('') + '</div>' : '') +
    '</div>';
  }
  return total + tiles + panel + costs;
}

/* ── Jump from the dashboard ── */
function sdGo(g) {
  if (!g) return;
  if (g.tab === 'rentals') {
    SR.year = g.y; stSwitchTab('rentals');
    if (g.ck && g.view === 'settle') { SR.modal = { ck: g.ck, view: 'settle', tid: g.tid || null, weg: !g.tid, from: 'tracker' }; stRenderRentals(); return; }
    if (g.ck && g.view) _srOpen({ ck: g.ck, view: g.view, from: 'tracker' });
    return;
  }
  if (g.tab === 'casa') {
    SC.year = g.y; stSwitchTab('casa');
    setTimeout(() => {
      if (!SC.model) return;
      if (g.view === 'costs') { SC.modal = { view: 'costs' }; scRenderModal(); }
      if (g.view === 'settle' && g.key) { SC.modal = { view: 'settle', key: g.key }; scRenderModal(); }
      if (g.view === 'start') { const keys = SC.model.ten.filter(t => t.k === 'open').map(t => t.key); if (keys.length) { SC.modal = { view: 'ten', key: keys[0], flow: keys, i: 0 }; scRenderModal(); } }
    }, 60);
  }
}

/* ══ Manual NK-Abrechnung ═══════════════════════════════════ */
function sdProps() {
  const all = (window._ctrl.properties || []).filter(p => p.active);
  const casa = all.filter(p => p.id === CASA_PROP_ID), rest = all.filter(p => p.id !== CASA_PROP_ID).sort(stPropOrder);
  return casa.concat(rest);
}
function sdPropName(d) {
  const p = d.property_id ? (window._ctrl.properties || []).find(x => x.id === Number(d.property_id)) : null;
  return p ? p.name + (d.unit_label && p.id === CASA_PROP_ID ? ' · ' + d.unit_label : '') : (d.title_name || 'Other');
}
function sdNew() {
  const y = Number(cxToday().slice(0, 4)) - 1;
  return { id: null, property_id: null, unit_label: '', title_name: '', tenant_ref: '', tenant_name: '', address: '', iban: '', former: false,
           period_from: y + '-01-01', period_to: y + '-12-31', use_from: '', use_to: '',
           lines: [], vz: [], settle_via: 'zahlung', due_days: 30, letter_date: cxToday(), book: false, status: 'draft' };
}
function sdMonths(d) {
  const out = []; if (!d.period_from || !d.period_to || d.period_to < d.period_from) return out;
  let y = Number(d.period_from.slice(0, 4)), m = Number(d.period_from.slice(5, 7));
  const ey = Number(d.period_to.slice(0, 4)), em = Number(d.period_to.slice(5, 7));
  while ((y < ey || (y === ey && m <= em)) && out.length < 36) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const sdVzOf = (d, ym) => { const x = (d.vz || []).find(v => v.ym === ym); return x ? x.amount : null; };
function sdCalc(d) {
  const perDays = d.period_from && d.period_to ? sdDays(d.period_from, d.period_to) : 0;
  const uf = d.use_from || d.period_from, ut = d.use_to || d.period_to;
  const useDays = uf && ut && ut >= uf ? sdDays(uf, ut) : perDays;
  const f = perDays ? useDays / perDays : 1;
  const lines = (d.lines || []).map(l => {
    const a = sdNum(l.amount), v = sdNum(l.value);
    let share = null, key = '';
    if (l.split === 'direct') { share = v; key = 'direkt'; }
    else if (l.split === 'days') { share = a === null ? null : a * f; key = useDays + '/' + perDays + ' Tage'; }
    else if (l.split === 'pct') { share = a === null || v === null ? null : a * v / 100; key = v === null ? '%' : String(v).replace('.', ',') + ' %'; }
    else { share = a; key = '100 %'; }
    return { label: l.label || '', amount: a, split: l.split, value: v, share: share === null ? null : cxR(share), key };
  });
  const sum = cxR(lines.reduce((s, l) => s + (l.share || 0), 0));
  const months = sdMonths(d), vzList = months.map(ym => sdNum(sdVzOf(d, ym)) || 0);
  const vz = cxR(vzList.reduce((s, v) => s + v, 0));
  const same = vzList.length && vzList.every(v => v === vzList[0]) ? vzList[0] : null;
  return { perDays, useDays, partial: useDays < perDays, uf, ut, lines, sum, vz, saldo: cxR(sum - vz), missing: lines.some(l => l.share === null), months, same };
}
function sdTenants(d) {
  const p = d.property_id ? (window._ctrl.properties || []).find(x => x.id === Number(d.property_id)) : null;
  if (!p) return [];
  if (p.id === CASA_PROP_ID) return (window._src.casaTen || []).filter(t => !d.unit_label || String(t.room || '').trim().toLowerCase() === String(d.unit_label).trim().toLowerCase());
  const apt = ctlPropLinks(p).apt; if (!apt) return [];
  return (window._src.rntTen || []).filter(t => String(t.apartment_id) === String(apt.id));
}
function sdPropAddr(d) {
  const s = (typeof appSettings !== 'undefined' && appSettings) || {};
  const p = d.property_id ? (window._ctrl.properties || []).find(x => x.id === Number(d.property_id)) : null;
  if (p && p.id === CASA_PROP_ID) return typeof scHouse === 'function' ? scHouse() : String(typeof ADDRESS !== 'undefined' ? ADDRESS : '').split(/\s*,\s*/).filter(Boolean);
  if (p) { const apt = ctlPropLinks(p).apt || {}; return [[apt.adresse, stWhg(apt.wohnungsnummer)].filter(Boolean).join(', '), apt.plz_ort || ''].filter(Boolean); }
  return [];
}

function sdEnsureHost() {
  if (document.getElementById('sdModal')) return;
  const h = document.createElement('div'); h.id = 'sdModal'; document.body.appendChild(h);
  h.addEventListener('click', sdClick);
  h.addEventListener('input', sdInput);
  h.addEventListener('change', sdChange);
  const tab = document.getElementById('tab-dashboard');
  if (tab && !tab._sdWired) { tab._sdWired = true; tab.addEventListener('click', sdClick); }
}
function sdRenderModal() {
  const h = document.getElementById('sdModal'); if (!h) return;
  if (!SD.modal || !SD.d) { h.innerHTML = ''; if (!(typeof SC !== 'undefined' && SC.modal) && !(typeof SR !== 'undefined' && SR.modal)) document.body.classList.remove('st-panel-open'); return; }
  const top = h.querySelector('.srm__b') ? h.querySelector('.srm__b').scrollTop : 0;
  h.innerHTML = '<div class="srm" role="dialog" aria-label="Manual NK-Abrechnung"><div class="srm__bg" data-sd="close"></div><div class="srm__win sc-win sd-win">' +
    sdCalcView() + '</div></div>';
  const b = h.querySelector('.srm__b'); if (b) b.scrollTop = top;
  document.body.classList.add('st-panel-open');
}
const sdOpt = (v, l, on) => '<option value="' + stEsc(v) + '"' + (on ? ' selected' : '') + '>' + stEsc(l) + '</option>';
function sdUseMonths(d) {
  const uf = (d.use_from || d.period_from || '').slice(0, 7), ut = (d.use_to || d.period_to || '').slice(0, 7);
  return sdMonths(d).filter(ym => ym >= uf && ym <= ut);
}
/* ── Manual NK-Abrechnung · one lean modal (Oct 2026) ────────────────
   One level: no preview screen, positions open inline, the month grid
   opens inline. Result on top, live. Same data, same calculation, same
   letter as before — only the view and how it is filled in changed.   */
const SD_QUICK = ['Strom', 'Gas', 'Wasser / Abwasser', 'Müll', 'Grundsteuer', 'Versicherung', 'Internet', 'Reinigung', 'Schornsteinfeger'];   // as Casa Castel (SC_QUICK)
const SD_SPLIT_BTN = [['full', 'Whole'], ['days', 'By days'], ['pct', '%'], ['direct', 'Fixed €']];
const SD_VIA = [['zahlung', 'Bank transfer'], ['kaution', 'With the Kaution'], ['miete', 'With the rent']];
function sdMissing(d, x) {
  const m = [];
  if (!d.property_id && !String(d.title_name || '').trim()) m.push('property');
  if (!String(d.tenant_name || '').trim()) m.push('tenant');
  if (!String(d.address || '').trim()) m.push('address');
  if (!x.lines.length || x.lines.every(l => l.share === null)) m.push('costs');
  else if (x.missing) m.push('an amount');
  return m;
}
const sdFullYear = d => d.period_from && d.period_to && d.period_from.slice(5) === '01-01' && d.period_to.slice(5) === '12-31' &&
  d.period_from.slice(0, 4) === d.period_to.slice(0, 4) ? Number(d.period_from.slice(0, 4)) : null;
const sdPerLabel = d => sdFullYear(d) ? String(sdFullYear(d)) : d.period_from && d.period_to ? stDate(d.period_from) + '–' + stDate(d.period_to) : '';
function sdSubText(d) {
  const st = d.status === 'sent' ? 'sent ' + stDate(typeof ccDayOf === 'function' ? ccDayOf(d.sent_at) : String(d.sent_at || '').slice(0, 10)) : SD.dirty ? 'not saved yet' : 'draft';
  const prop = d.property_id || String(d.title_name || '').trim() ? sdPropName(d) : '';
  return [prop, String(d.tenant_name || '').trim(), sdPerLabel(d), st].filter(Boolean).join(' · ');
}
// due date = letter date + 14 / 30 days (the letter prints the same date)
function sdDue(d) { const t = new Date((d.letter_date || cxToday()) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + (Number(d.due_days ?? 30) || 30)); return t.toISOString().slice(0, 10); }
function sdHeroSub(d, x, miss) {
  if (miss.length && d.status !== 'sent') return 'Still missing · ' + miss.join(' · ');
  return 'share ' + sdE(x.sum) + ' − paid ' + sdE(x.vz) + (x.saldo > 0 ? ' · Nachzahlung' : x.saldo < 0 ? ' · Guthaben' : '');
}
const sdHasCosts = x => x.lines.some(l => l.share !== null);
const sdTone = x => !sdHasCosts(x) ? '' : x.saldo > 0 ? 'neg' : x.saldo < 0 ? 'pos' : '';
const sdShowIban = (d, x) => x.saldo < 0 && (d.settle_via || 'zahlung') === 'zahlung';
function sdBarHTML(d, miss) {
  if (SD.dirty) SD.pdfMade = false;                                 // changed after the PDF → make the PDF again first
  if (d.status === 'sent') return '<div class="srm__bar srm__bar--2" id="sdBar" data-mode="sent"><button class="cx-btn cx-btn--s" data-sd="close">Close</button>' +
    '<button class="cx-btn cx-btn--p" data-sd="pdf"><i class="ti ti-file-text" aria-hidden="true"></i> PDF</button></div>';
  const ready = SD.pdfMade && !SD.dirty;
  const trash = d.id ? '<button class="cx-btn cx-btn--s sd-trash" data-sd="delDraft" aria-label="Delete draft"><i class="ti ti-trash" aria-hidden="true"></i></button>' : '';
  return '<div class="srm__bar srm__bar--2" id="sdBar" data-mode="' + (ready ? 'send' : 'pdf') + '">' + trash + (ready
    ? '<button class="cx-btn cx-btn--s" data-sd="pdf"><i class="ti ti-file-text" aria-hidden="true"></i> PDF</button><button class="cx-btn cx-btn--p" data-sd="send">Mark as sent</button>'
    : '<button class="cx-btn cx-btn--s" data-sd="save">Save</button><button class="cx-btn cx-btn--p" id="sdPdfBtn" data-sd="pdf"' + (miss.length ? ' disabled' : '') + '><i class="ti ti-file-text" aria-hidden="true"></i> Create PDF</button>') + '</div>';
}
function sdCalcView() {
  const d = SD.d, x = sdCalc(d), sent = d.status === 'sent', dis = sent ? ' disabled' : '', miss = sdMissing(d, x);
  const props = sdProps(), p = d.property_id ? props.find(q => q.id === Number(d.property_id)) : null, casa = p && p.id === CASA_PROP_ID, other = !d.property_id && d.title_name !== '';
  const rooms = (window._src.rooms || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const tens = sdTenants(d);
  const row = (lab, html, extra) => '<div class="sd-f"' + (extra || '') + '><span>' + lab + '</span>' + html + '</div>';
  const two = (a, b) => '<span class="sd-two">' + a + '<i>–</i>' + b + '</span>';
  const cap = (t, icon) => '<p class="sd-cap2"><i class="ti ti-' + icon + '" aria-hidden="true"></i>' + t + '</p>';
  const opt = (act, v, l, on) => '<button type="button" class="sc-opt' + (on ? ' is-on' : '') + '" data-sd="' + act + '" data-v="' + stEsc(v) + '"' + dis + '>' + stEsc(l) + '</button>';
  const tone = sdTone(x);
  // 1 · result, always on top
  const hero = '<div class="srm__card sc-hero sd-hero"><span class="sc-hero__l ' + tone + '" id="sdResL">' + stEsc(sdHasCosts(x) ? sdResLabel(d, x) : 'Add costs to see the result') + '</span>' +
    '<span class="sc-hero__v ' + tone + '" id="sdRes">' + (sdHasCosts(x) ? sdE(Math.abs(x.saldo)) : '—') + '</span>' +
    '<span class="sd-hero__s" id="sdResS">' + stEsc(sdHeroSub(d, x, miss)) + '</span></div>';
  // 2 · who & when
  const fy = sdFullYear(d), yNow = Number(cxToday().slice(0, 4)), years = [yNow - 2, yNow - 1, yNow];
  if (fy && !years.includes(fy)) { years.push(fy); years.sort((a, b) => a - b); }
  const custom = SD.customPeriod || !fy, whole = !d.use_from && !d.use_to;
  const overlap = t => (!t.mietbeginn || sdD(t.mietbeginn) <= d.period_to) && (!t.mietende || sdD(t.mietende) >= d.period_from);
  const sugg = sent ? [] : tens.filter(overlap).slice(0, 6);
  const who = cap('Who &amp; when', 'user') + '<div class="srm__card sd-card">' +
    row('Property', '<select class="sd-in" data-sdf="property_id"' + dis + '>' + sdOpt('', '— choose —', !d.property_id && !other) + props.map(q => sdOpt(q.id, q.name, Number(d.property_id) === q.id)).join('') + sdOpt('other', 'Other …', other) + '</select>') +
    (casa ? row('Room', '<select class="sd-in" data-sdf="unit_label"' + dis + '>' + sdOpt('', '— choose —', !d.unit_label) + rooms.map(r => sdOpt(r.name, r.name, d.unit_label === r.name)).join('') + '</select>') : '') +
    (other ? row('Name', '<input class="sd-in" data-sdf="title_name" value="' + stEsc(String(d.title_name).trim()) + '" placeholder="name of the property"' + dis + '/>') : '') +
    row('Tenant', '<input class="sd-in" list="sdTen" data-sdf="tenant_name" value="' + stEsc(d.tenant_name) + '" placeholder="name"' + dis + '/>' +
      '<datalist id="sdTen">' + tens.map(t => '<option value="' + stEsc([t.first_name, t.last_name].filter(Boolean).join(' ')) + '">').join('') + '</datalist>') +
    (sugg.length ? '<div class="sd-sugg"><span>from the app:</span>' + sugg.map(t => '<button type="button" class="sc-qa__b' + (String(d.tenant_ref) === String(t.id) ? ' is-on' : '') + '" data-sd="pickTen" data-id="' + stEsc(t.id) + '">' +
      stEsc([t.first_name, t.last_name].filter(Boolean).join(' ')) + '</button>').join('') + '</div>' : '') +
    row('Address', '<input class="sd-in" data-sdf="address1" value="' + stEsc(String(d.address || '').split('\n').filter(Boolean).join(', ')) + '" placeholder="street, PLZ city"' + dis + '/>') +
    '<div class="sd-col"><span class="sd-lab">Period</span><div class="sc-opts">' + years.map(y => opt('pyear', y, String(y), !custom && fy === y)).join('') +
      '<button type="button" class="sc-opt' + (custom ? ' is-on' : '') + '" data-sd="customPeriod"' + dis + '>Custom dates</button></div></div>' +
    (custom ? row('From–to', two('<input class="sd-in" type="date" data-sdf="period_from" value="' + stEsc(d.period_from) + '"' + dis + '/>', '<input class="sd-in" type="date" data-sdf="period_to" value="' + stEsc(d.period_to) + '"' + dis + '/>')) : '') +
    '<button type="button" class="sc-tg' + (whole ? ' on' : '') + '" data-sd="whole" aria-pressed="' + whole + '"' + dis + '><span class="sc-tg__t"><b>Lived here the whole period</b><small>' +
      (whole ? stEsc(sdPerLabel(d) && fy ? '01.01.–31.12.' + fy : sdPerLabel(d)) : x.useDays + ' of ' + x.perDays + ' days · costs are split by days') + '</small></span><span class="sc-tg__sw" aria-hidden="true"></span></button>' +
    (whole ? '' : row('Lived', two('<input class="sd-in" type="date" data-sdf="use_from" value="' + stEsc(d.use_from || d.period_from || '') + '"' + dis + '/>', '<input class="sd-in" type="date" data-sdf="use_to" value="' + stEsc(d.use_to || d.period_to || '') + '"' + dis + '/>'))) +
    scToggleSd('former', d.former, 'Former tenant', 'moved out · the letter says „ehemalige ' + (casa ? 'Zimmer' : 'Wohnung') + '“', !sent) + '</div>';
  // 3 · costs
  const used = new Set((d.lines || []).map(l => String(l.label || '').trim().toLowerCase()));
  const qa = sent ? '' : '<div class="sc-qa">' + SD_QUICK.filter(q => !used.has(q.toLowerCase())).map(q => '<button type="button" class="sc-qa__b" data-sd="qa" data-l="' + stEsc(q) + '"><i class="ti ti-plus" aria-hidden="true"></i>' + stEsc(q) + '</button>').join('') +
    '<button type="button" class="sc-qa__b" data-sd="qa" data-l=""><i class="ti ti-plus" aria-hidden="true"></i>Other</button></div>';
  const how = (l, c) => l.split === 'days' ? 'by days · ' + x.useDays + '/' + x.perDays : l.split === 'pct' ? (c.value === null ? '% share' : String(c.value).replace('.', ',') + ' % share') : l.split === 'direct' ? 'fixed amount' : 'whole · 100 %';
  const lines = (d.lines || []).map((l, i) => {
    const c = x.lines[i], name = stEsc(l.label || '') || (SD.open === i ? 'New position' : 'Position');
    if (SD.open === i && !sent) return '<div class="sd-pos-open"><div class="sd-pos-open__h"><b data-sd-lab="' + i + '">' + name + '</b><span>share <b data-sd-share="' + i + '">' + (c.share === null ? '—' : sdE(c.share)) + '</b></span></div>' +
      '<div class="sd-ped"><div class="sd-ped__r"><input class="sd-in" list="sdKinds" data-sdl="label" data-i="' + i + '" value="' + stEsc(l.label || '') + '" placeholder="Kostenart"/>' +
        '<span class="sd-amt"><input class="sd-in" inputmode="decimal" data-sdl="amount" data-i="' + i + '" value="' + stEsc(l.amount === null || l.amount === undefined ? '' : cxE2(l.amount)) + '" placeholder="' + (l.split === 'direct' ? 'optional' : 'Kosten') + '"/><em>€</em></span></div>' +
        '<div class="sc-seg">' + SD_SPLIT_BTN.map(([v, t]) => '<button type="button" class="' + (l.split === v ? 'is-on' : '') + '" data-sd="split" data-i="' + i + '" data-v="' + v + '">' + t + '</button>').join('') + '</div>' +
        (l.split === 'pct' || l.split === 'direct' ? '<div class="sd-ped__r"><span class="sd-lab">' + (l.split === 'pct' ? 'Tenant\'s share' : 'Tenant pays') + '</span><span class="sd-amt sd-amt--s"><input class="sd-in" inputmode="decimal" data-sdl="value" data-i="' + i + '" value="' +
          stEsc(l.value === null || l.value === undefined ? '' : String(l.value).replace('.', ',')) + '" placeholder="' + (l.split === 'pct' ? 'Anteil' : 'Betrag') + '"/><em>' + (l.split === 'pct' ? '%' : '€') + '</em></span></div>' : '') +
        '<div class="sd-ped__b"><button type="button" class="cx-link sd-del" data-sd="delLine" data-i="' + i + '">Remove</button><button type="button" class="cx-link sd-done" data-sd="openLine" data-i="' + i + '">Done</button></div></div></div>';
    const of = c.amount === null ? (l.split === 'direct' ? '' : '<small class="is-warn">amount missing</small>') : c.share !== null && Math.abs(c.share - c.amount) > 0.004 ? '<small>of ' + sdE(c.amount) + '</small>' : '';
    return '<button type="button" class="sd-pos" data-sd="openLine" data-i="' + i + '"' + dis + '><span class="sd-pos__t"><b>' + name + '</b><small>' + how(l, c) + '</small></span>' +
      '<span class="sd-pos__v"><b data-sd-share="' + i + '">' + (c.share === null ? '—' : sdE(c.share)) + '</b>' + of + '</span>' + (sent ? '' : '<i class="ti ti-chevron-right" aria-hidden="true"></i>') + '</button>';
  }).join('');
  const costs = cap('Costs', 'receipt') + '<div class="srm__card sd-card">' + (!(d.lines || []).length && !sent ? '<p class="sd-hint">Tap to add a position</p>' : '') + qa + '<div>' + lines + '</div>' +
    '<datalist id="sdKinds">' + (typeof SR_KINDS !== 'undefined' ? SR_KINDS.map(k => '<option value="' + stEsc(k.l) + '">').join('') : '') + '</datalist>' +
    '<div class="sd-tot"><span>Tenant share</span><b id="sdSum">' + sdE(x.sum) + '</b></div></div>';
  // 4 · NK paid
  const um = sdUseMonths(d), vals = um.map(ym => sdNum(sdVzOf(d, ym)));
  const same = vals.length && vals.every(v => v !== null && v === vals[0]) ? vals[0] : null;
  const perMonth = SD.perMonth || (!same && vals.some(v => v !== null));
  const vz = cap('NK paid', 'coin') + '<div class="srm__card sd-card">' +
    (perMonth
      ? '<div class="sd-months">' + um.map(ym => '<label class="sd-m"><small>' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5, 7)) - 1] + (um.length > 12 ? ' ' + ym.slice(2, 4) : '') + '</small>' +
          '<input class="sd-in" inputmode="decimal" data-sdv="' + ym + '" value="' + stEsc(sdVzOf(d, ym) === null ? '' : cxE2(sdVzOf(d, ym))) + '"' + dis + '/></label>').join('') + '</div>' +
        '<div class="sd-tot"><span>Paid</span><b id="sdVz">' + sdE(x.vz) + '</b></div>'
      : '<div class="sd-vz1"><span class="sd-amt"><input class="sd-in" inputmode="decimal" data-sdx="vzone" value="' + (same !== null ? stEsc(cxE2(same)) : '') + '" placeholder="per month"' + dis + '/><em>€</em></span>' +
          '<span>× ' + um.length + (um.length === 1 ? ' month' : ' months') + ' = <b id="sdVz">' + sdE(x.vz) + '</b></span></div>') +
    (sent ? '' : '<button type="button" class="sd-add" data-sd="perMonth">' + (perMonth ? 'same amount every month' : 'different per month') + '</button>') + '</div>';
  // 5 · settle
  const dues = [14, 30]; if (d.due_days && !dues.includes(Number(d.due_days))) dues.push(Number(d.due_days));
  const settle = cap('Settle', 'send') + '<div class="srm__card sd-card">' +
    '<div class="sd-col"><span class="sd-lab">How</span><div class="sc-opts">' + SD_VIA.map(([v, t]) => opt('via', v, t, (d.settle_via || 'zahlung') === v)).join('') + '</div></div>' +
    row('IBAN', '<input class="sd-in" data-sdf="iban" value="' + stEsc(d.iban || '') + '" placeholder="tenant\'s IBAN for the Guthaben"' + dis + '/>', ' id="sdIban"' + (sdShowIban(d, x) ? '' : ' hidden')) +
    row('Letter', '<input class="sd-in" type="date" data-sdf="letter_date" value="' + stEsc(d.letter_date || cxToday()) + '"' + dis + '/>') +
    '<div class="sd-col"><span class="sd-lab">Due within</span><div class="sd-due"><div class="sc-opts">' + dues.map(n => opt('due', n, n + ' days', Number(d.due_days ?? 30) === n)).join('') + '</div>' +
      '<span class="sd-due__d">due by <b id="sdDue">' + stDate(sdDue(d)) + '</b></span></div></div>' +
    (d.property_id ? scToggleSd('book', d.book, 'Also book in Controlling', 'the result shows in Controlling', !sent) : '') + '</div>';
  const head = '<div class="srm__h"><div class="srm__ht"><p class="srm__t">' + (d.id ? 'NK-Abrechnung' : 'New NK-Abrechnung') + '</p><p class="srm__s" id="sdSub">' + stEsc(sdSubText(d)) + '</p></div>' +
    '<button class="srm__x" data-sd="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';
  return head + '<div class="srm__b"><div class="srm__one sd-form sd-lean">' + hero + who + costs + vz + settle + '</div></div>' + sdBarHTML(d, miss);
}
function scToggleSd(f, on, t, s, can) {
  return '<button type="button" class="sc-tg' + (on ? ' on' : '') + '" data-sd="tg" data-f="' + f + '"' + (can ? '' : ' disabled') + ' aria-pressed="' + !!on + '">' +
    '<span class="sc-tg__t"><b>' + t + '</b><small>' + s + '</small></span><span class="sc-tg__sw" aria-hidden="true"></span></button>';
}
function sdResLabel(d, x) {
  const first = String(d.tenant_name || 'The tenant').split(' ')[0];
  return x.saldo > 0 ? first + ' pays you' : x.saldo < 0 ? first + ' gets back' : 'balanced';
}
/* NK paid typed as one amount: keep it on the months actually lived (after a period / lived change) */
function sdSameVz(d) { const v = sdUseMonths(d).map(ym => sdNum(sdVzOf(d, ym))); return v.length && v.every(z => z !== null && z === v[0]) ? v[0] : null; }
function sdRespread(d, same) { if (same !== null && !SD.perMonth) d.vz = sdUseMonths(d).map(ym => ({ ym, amount: cxR(same) })); }
function sdAfterPeriod(d, same) {
  const t = d.tenant_ref ? sdTenants(d).find(z => String(z.id) === String(d.tenant_ref)) : null;
  if (t) sdTenantPeriod(d, t);
  if (d.use_from && (d.use_from < d.period_from || d.use_from > d.period_to)) d.use_from = '';
  if (d.use_to && (d.use_to < d.period_from || d.use_to > d.period_to)) d.use_to = '';
  sdRespread(d, same);
}
function sdPickTenant(d, t) {
  d.tenant_ref = String(t.id); d.tenant_name = [t.first_name, t.last_name].filter(Boolean).join(' ');
  const out = t.mietende && sdD(t.mietende) < cxToday(); d.former = !!out;
  d.address = out && t.address ? String(t.address).split(/\s*,\s*|\n/).filter(Boolean).join('\n') : sdPropAddr(d).join('\n');
  sdTenantPeriod(d, t);
}

/* ── Inputs ── */
function sdInput(e) {
  const el = e.target, d = SD.d; if (!d) return;
  if (el.dataset.sdl !== undefined) {
    const i = Number(el.dataset.i), k = el.dataset.sdl, l = d.lines[i]; if (!l) return;
    if (k === 'label') l.label = el.value;
    else if (k === 'amount') l.amount = sdNum(el.value);
    else if (k === 'value') l.value = sdNum(el.value);
    SD.dirty = true; return sdTotals();
  }
  if (el.dataset.sdv) {
    const ym = el.dataset.sdv, n = sdNum(el.value);
    d.vz = (d.vz || []).filter(v => v.ym !== ym); if (n !== null) d.vz.push({ ym, amount: cxR(n) });
    SD.dirty = true; return sdTotals();
  }
  if (el.dataset.sdx === 'vzone') {
    const n = sdNum(el.value);
    d.vz = n === null ? [] : sdUseMonths(d).map(ym => ({ ym, amount: cxR(n) }));
    SD.dirty = true; return sdTotals();
  }
  if (el.dataset.sdf === 'address1') { d.address = el.value.split(/\s*,\s*/).filter(Boolean).join('\n'); SD.dirty = true; return sdTotals(); }
  if (el.dataset.sdf && ['tenant_name', 'address', 'iban', 'title_name', 'letter_date'].includes(el.dataset.sdf)) {
    const f = el.dataset.sdf; d[f] = el.value; SD.dirty = true;
    if (f === 'tenant_name') d.tenant_ref = '';                     // typed by hand → no longer the app's tenant
    return sdTotals();
  }
}
function sdChange(e) {
  const el = e.target, d = SD.d; if (!d) return;
  const f = el.dataset.sdf;
  if (f === 'tenant_name') {                                       // a known tenant → fill address, days and NK
    const t = sdTenants(d).find(z => [z.first_name, z.last_name].filter(Boolean).join(' ').toLowerCase() === String(el.value).trim().toLowerCase());
    if (t) { sdPickTenant(d, t); SD.dirty = true; return sdRenderModal(); }
    d.tenant_ref = ''; return;
  }
  if (!f || ['address', 'address1', 'iban', 'title_name'].includes(f)) return;
  SD.dirty = true;
  if (f === 'property_id') {
    if (el.value === 'other') { d.property_id = null; d.title_name = d.title_name || ' '; }
    else { d.property_id = el.value ? Number(el.value) : null; d.title_name = ''; }
    d.unit_label = ''; d.tenant_ref = '';
    if (!d.address) d.address = '';
    return sdRenderModal();
  }
  if (f === 'tenant_ref') {
    d.tenant_ref = el.value;
    const t = sdTenants(d).find(x => String(x.id) === String(el.value));
    if (t) sdPickTenant(d, t);
    return sdRenderModal();
  }
  if (f === 'period_from' || f === 'period_to') {                 // new period → the tenant's days and monthly NK follow
    const same = sdSameVz(d); d[f] = el.value; SD.customPeriod = true;
    sdAfterPeriod(d, same);
    return sdRenderModal();
  }
  if (f === 'use_from' || f === 'use_to') { const same = sdSameVz(d); d[f] = el.value; sdRespread(d, same); return sdRenderModal(); }
  if (f === 'letter_date' || f === 'unit_label' || f === 'settle_via') { d[f] = el.value; return sdRenderModal(); }
}
/* The tenant's own days inside the period + monthly NK from the contract (only while no month is typed in) */
function sdTenantPeriod(d, t) {
  const mb = sdD(t.mietbeginn), me = sdD(t.mietende);
  d.use_from = mb && mb > d.period_from ? mb : ''; d.use_to = me && me < d.period_to ? me : '';
  const nk = sdNum(t.nebenkosten);
  if (nk && !(d.vz || []).some(v => sdNum(v.amount))) {
    const uf = d.use_from || d.period_from, ut = d.use_to || d.period_to;
    d.vz = sdMonths(d).filter(ym => ym >= uf.slice(0, 7) && ym <= ut.slice(0, 7)).map(ym => ({ ym, amount: cxR(nk) }));
  }
}
function sdTotals() {
  const d = SD.d; if (!d) return;
  const x = sdCalc(d), miss = sdMissing(d, x), tone = sdTone(x), has = sdHasCosts(x);
  x.lines.forEach((l, i) => document.querySelectorAll('[data-sd-share="' + i + '"]').forEach(e => { e.textContent = l.share === null ? '—' : sdE(l.share); }));
  (d.lines || []).forEach((l, i) => { const e = document.querySelector('[data-sd-lab="' + i + '"]'); if (e) e.textContent = l.label || 'New position'; });
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  set('sdSum', sdE(x.sum)); set('sdVz', sdE(x.vz)); set('sdDue', stDate(sdDue(d))); set('sdSub', sdSubText(d));
  set('sdRes', has ? sdE(Math.abs(x.saldo)) : '—'); set('sdResL', has ? sdResLabel(d, x) : 'Add costs to see the result'); set('sdResS', sdHeroSub(d, x, miss));
  const l = document.getElementById('sdResL'); if (l) l.className = 'sc-hero__l ' + tone;
  const r = document.getElementById('sdRes'); if (r) r.className = 'sc-hero__v ' + tone;
  const ib = document.getElementById('sdIban'); if (ib) ib.hidden = !sdShowIban(d, x);
  if (SD.dirty) SD.pdfMade = false;
  const bar = document.getElementById('sdBar');
  if (bar && d.status !== 'sent') {
    const mode = SD.pdfMade && !SD.dirty ? 'send' : 'pdf';
    if (bar.dataset.mode !== mode) bar.outerHTML = sdBarHTML(d, miss);
    else { const pb = document.getElementById('sdPdfBtn'); if (pb) pb.disabled = miss.length > 0; }
  }
}

/* ── Save / letter / send ── */
async function sdSave(quiet) {
  const d = SD.d; if (!d) return null;
  const row = { property_id: d.property_id || null, unit_label: d.unit_label || null, title_name: (d.title_name || '').trim() || null, tenant_ref: d.tenant_ref || null,
                tenant_name: d.tenant_name || null, address: d.address || null, iban: d.iban || null, former: !!d.former,
                period_from: d.period_from || null, period_to: d.period_to || null, use_from: d.use_from || null, use_to: d.use_to || null,
                lines: d.lines || [], vz: d.vz || [], settle_via: d.settle_via || 'zahlung', due_days: d.due_days ?? 30, letter_date: d.letter_date || null,
                book: !!d.book, status: d.status || 'draft', sent_at: d.sent_at || null, updated_at: new Date().toISOString(),
                tenant_app: d.tenant_ref && d.property_id ? (Number(d.property_id) === CASA_PROP_ID ? 'casa' : 'rentals') : null };
  const q = d.id ? _ctlSupa.from(SD_TABLE).update(row).eq('id', d.id).select().single() : _ctlSupa.from(SD_TABLE).insert(row).select().single();
  const { data, error } = await q;
  if (error) { stSay(SD.missing ? 'Please run the SQL for the manual NK-Abrechnung first' : 'Saving failed — ' + (error.message || error)); return null; }
  Object.assign(d, data); SD.dirty = false;
  const i = SD.drafts.findIndex(x => x.id === data.id); if (i >= 0) SD.drafts[i] = data; else SD.drafts.unshift(data);
  if (!quiet) stSay('Draft saved');
  return data;
}
async function sdLetterData(d) {
  if (typeof loadSettings === 'function') { try { await loadSettings(); } catch (e) {} }
  const s = (typeof appSettings !== 'undefined' && appSettings) || {}, x = sdCalc(d);
  const p = d.property_id ? (window._ctrl.properties || []).find(q => q.id === Number(d.property_id)) : null;
  const casa = p && p.id === CASA_PROP_ID, apt = p && !casa ? ctlPropLinks(p).apt || {} : {};
  const addr = sdPropAddr(d), dt = iso => stDate(iso), y = String(d.period_to).slice(0, 4);
  const eur = v => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac';
  const unit = casa ? 'Zimmer' : 'Wohnung';
  const objekt = casa ? (d.former ? 'das ehemalige Zimmer' : 'das Zimmer') + (d.unit_label ? ' „' + d.unit_label + '“ in der Casa Castel' : ' in der Casa Castel')
    : (d.former ? 'die ehemalige Wohnung' : 'die Wohnung') + (addr[0] ? ' ' + addr[0] : '');
  const sender = [s.vermieter_name, ...String(s.vermieter_adresse || '').split(/\s*,\s*|\n/)].map(z => String(z || '').trim()).filter(Boolean);
  const ort = s.unterschrift_ort || ((String(s.vermieter_adresse || '').match(/\d{5}\s+([^,\n]+)/) || [])[1] || '').trim();
  const date = d.letter_date || cxToday(), due = new Date(date + 'T12:00:00Z'); due.setUTCDate(due.getUTCDate() + (Number(d.due_days ?? 30) || 30));
  const last = String(d.tenant_name || '').split(' ').slice(-1)[0];
  const brand = casa ? 'Casa Castel' : p ? (apt.name || p.name) : (d.title_name || '').trim();
  const D = {
    brand, unitLabel: casa ? 'Zimmer' : p ? 'Wohnung' : '', unitName: casa ? (d.unit_label || '') : (apt.wohnungsnummer || ''),
    footer: addr.join(' \u00b7 '), sender, vermieter: s.vermieter_name || '', ort, date, names: [d.tenant_name || ''],
    addr: String(d.address || '').split(/\n|,\s*(?=\d{5}\b)/).map(z => z.trim()).filter(Boolean),
    title: 'Betriebskostenabrechnung ' + y,
    subtitle: (addr.length ? 'Mietobjekt ' + addr.join(', ') + (casa && d.unit_label ? ' \u00b7 Zimmer ' + d.unit_label : '') + ' \u00b7 ' : (brand ? brand + ' \u00b7 ' : '')) + 'Abrechnungszeitraum ' + dt(d.period_from) + ' bis ' + dt(d.period_to),
    greeting: d.tenant_name ? (casa ? 'Hallo ' + String(d.tenant_name).split(' ')[0] : 'Guten Tag ' + d.tenant_name) + ',' : (casa ? 'Hallo,' : 'Sehr geehrte Damen und Herren,'),
    du: !!casa, closing: casa ? 'Viele Grüße' : 'Mit freundlichen Grüßen',
    introHtml: 'hiermit erfolgt die Abrechnung der Betriebskosten für ' + objekt + ' für den Abrechnungszeitraum vom <strong>' + dt(d.period_from) + ' bis ' + dt(d.period_to) + '</strong>.' +
      (x.partial ? (casa ? ' Das ' : ' Die ') + unit + ' wurde in diesem Zeitraum vom ' + dt(x.uf) + ' bis ' + dt(x.ut) + ' genutzt (' + x.useDays + ' von ' + x.perDays + ' Tagen).' : ''),
    sum: x.sum, vz: x.vz, saldo: x.saldo, via: x.saldo ? (d.settle_via || 'zahlung') : 'zahlung', due: due.toISOString().slice(0, 10),
    bank: { inhaber: s.kontoinhaber || s.vermieter_name || '', bank: s.bankname || '', iban: s.iban || '', bic: s.bic || '' },
    verwendung: 'NK ' + y + ' ' + (brand || '') + (casa && d.unit_label ? ' ' + d.unit_label : '') + ' ' + last, tenantIban: d.iban || '', former: !!d.former,
    outro: casa ? 'Die Aufstellung der Kosten und die Berechnung deines Anteils findest du auf Seite 2.' : '',
    hinweise: casa ? [] : ['Die Aufstellung der Kosten und die Berechnung des Anteils stehen auf Seite 2.',
               'Die Belege können nach vorheriger Terminabsprache eingesehen werden.',
               'Einwendungen gegen diese Abrechnung sind spätestens bis zum Ablauf des zwölften Monats nach Zugang mitzuteilen (§ 556 Abs. 3 Satz 5 BGB).'],
    intro2: 'Abrechnungszeitraum ' + dt(d.period_from) + ' bis ' + dt(d.period_to) + ' (' + x.perDays + ' Tage)' + (x.partial ? ' \u00b7 Nutzungszeitraum ' + dt(x.uf) + ' bis ' + dt(x.ut) + ' (' + x.useDays + ' Tage)' : '') + '. Umgelegt werden die im Mietvertrag vereinbarten Betriebskosten.',
    table: {
      cols: [{ label: 'Kostenart', w: '38%' }, { label: 'Kosten', w: '22%', cls: 'r' }, { label: 'Verteilung', w: '20%', cls: 'k' }, { label: 'Anteil', w: '20%', cls: 'r' }],
      rows: x.lines.map(l => [l.label, l.amount !== null ? eur(l.amount) : 'lt. Abrechnung', l.key, eur(l.share)]),
      vzLabel: 'abzüglich geleisteter Vorauszahlungen' + (x.same && x.months.length ? ' (' + (d.vz || []).length + ' × ' + eur(x.same) + ')' : ''),
    },
    note2: x.lines.some(l => l.split === 'days') ? 'Anteil nach Tagen: Kosten × Nutzungstage (' + x.useDays + ') / Tage des Abrechnungszeitraums (' + x.perDays + '). Nicht umlagefähige Kosten sind nicht enthalten.' : 'Nicht umlagefähige Kosten sind nicht enthalten.',
    extra: null,
  };
  // One-page letter (Oct 2026): header left only for Casa Castel · costs left · monthly Vorauszahlungen right
  const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  D.brand = casa ? 'Casa Castel' : '';
  D.unitName = casa ? (d.unit_label || '') : (brand || '');
  D.title = 'Betriebskostenabrechnung ' + dt(x.uf) + ' \u2013 ' + dt(x.ut);
  D.facts1 = [[unit, casa ? (d.unit_label || '') : (addr[0] || brand), casa ? 'Casa Castel \u00b7 ' + (addr[0] || '') : (addr[1] || '')],
              ['Zeitraum', dt(x.uf) + ' \u2013 ' + dt(x.ut), x.partial ? x.useDays + ' von ' + x.perDays + ' Tagen' : x.perDays + ' Tage'],
              ...(x.partial ? [['Abrechnungsjahr', dt(d.period_from) + ' \u2013 ' + dt(d.period_to), x.perDays + ' Tage']] : [])];
  D.introHtml = 'anbei die Betriebskostenabrechnung für den genannten Zeitraum.' + (x.partial ? ' Die Kosten sind nach Tagen anteilig berechnet.' : '');
  D.costs = { cols: [{ label: 'Kostenart', w: '70%' }, { label: x.partial ? 'Anteil ' + x.useDays + '/' + x.perDays + ' Tage' : 'Betrag', w: '30%', cls: 'r' }],
              rows: x.lines.map(l => [l.label, l.share === null ? '\u2014' : eur(l.share)]) };
  D.vzMonths = x.months.map(ym => ({ label: MON[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4), amt: sdNum(sdVzOf(d, ym)) || 0 }));
  D.hints = casa ? ['Nicht umlagefähige Kosten sind nicht enthalten.']
                 : ['Nicht umlagefähige Kosten wie Verwaltung und Rücklage sind nicht enthalten.',
                    'Die Belege können nach Terminabsprache eingesehen werden. Einwendungen sind bis zum Ablauf des zwölften Monats nach Zugang mitzuteilen (§ 556 Abs. 3 Satz 5 BGB).'];
  D.table = null; D.outro = '';
  return D;
}
const sdFileName = d => ccPdfFileName('NK-Abrechnung', String(d.period_to).slice(0, 4), sdPropName(d).replace(/\s*·\s*/g, '-'), String(d.tenant_name || '').split(' ').slice(-1)[0]);
async function sdPdf(btn) {
  const d = SD.d; if (!d) return;
  const reset = btn ? btn.innerHTML : ''; if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Creating PDF'; }
  try {
    if (d.status === 'sent') {                                    // sent: open exactly the archived letter
      const L = (typeof SC !== 'undefined' ? SC.letters : []).find(l => d.letter_id && String(l.id) === String(d.letter_id));
      if (L) { await scOpenLetter(L.id); return; }
    }
    const saved = d.status === 'sent' ? null : await sdSave(true);
    const out = await nkLetterPdf(await sdLetterData(d), sdFileName(d));
    if (saved && SD.d === d) { SD.pdfMade = true; sdRenderModal(); }   // next step: Mark as sent
    await ccOpenPdf(out.blob, out.name);
  } catch (e) { console.error('[settlements] manual PDF', e); stNotice('The PDF could not be created. Please try again.'); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = reset; } }
}
async function sdSend(btn) {
  const d = SD.d; if (!d) return;
  const x = sdCalc(d);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Saving'; }
  const saved = await sdSave(true); if (!saved) { if (btn) { btn.disabled = false; btn.textContent = 'Mark as sent'; } return; }
  const Y = Number(String(d.period_to).slice(0, 4)), dir = x.saldo > 0 ? 1 : x.saldo < 0 ? -1 : 0, amount = cxR(Math.abs(x.saldo));
  let letterId = null;
  try {
    const out = await nkLetterPdf(await sdLetterData(d), sdFileName(d));
    const path = 'manual/' + Y + '/' + Date.now() + '-' + out.name;
    const up = await _ctlSupa.storage.from('nk-letters').upload(path, out.blob, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw up.error;
    const row = { app: 'manual', property_id: d.property_id || null, year: Y, period_from: d.period_from, period_to: d.period_to, tenant_id: d.tenant_ref || null,
                  tenant_name: d.tenant_name || null, unit_label: d.unit_label || sdPropName(d), address: d.address || null, direction: dir, amount,
                  file_path: path, file_name: out.name, source: 'manual', sent_at: new Date().toISOString() };
    const ins = await _ctlSupa.from('nk_letters').insert(row).select().single();
    if (ins.error) throw ins.error;
    letterId = ins.data.id;
    if (typeof SC !== 'undefined') SC.letters.unshift(ins.data);
    if (typeof SR !== 'undefined') SR.letters = [ins.data].concat(SR.letters || []);
  } catch (e) { console.warn('[settlements] manual archive', e); stSay('The letter could not be archived (' + (e.message || e) + ') – run the archive SQL'); if (btn) { btn.disabled = false; btn.textContent = 'Mark as sent'; } return; }
  if (d.book && d.property_id) {
    try {
      const p = (window._ctrl.properties || []).find(q => q.id === Number(d.property_id));
      await _stWriteResult(null, { property_id: p.id, kind: 'nk_tenant', year: Y, period_from: d.period_from, period_to: d.period_to, app: p.id === CASA_PROP_ID ? 'casa' : 'rentals',
        tenant_id: d.tenant_ref || null, unit_label: d.unit_label || null, tenant_name: d.tenant_name || null, direction: dir, amount,
        result_date: d.letter_date || cxToday(), due_date: dir ? sdD(new Date(new Date((d.letter_date || cxToday()) + 'T12:00:00Z').getTime() + (Number(d.due_days ?? 30) || 30) * 864e5).toISOString()) : null,
        settle_via: dir ? (d.settle_via || 'zahlung') : 'zahlung', status: 'fertig', source: 'manual' });
      if (typeof ctlSettlementInvalidate === 'function') ctlSettlementInvalidate();
    } catch (e) { stSay('Sent · the result could not be booked in Controlling (' + (e.message || e) + ')'); }
  }
  // a chosen tenant: the result also lands on that tenant's card (Casa Castel / Rentals › Tenants · NK-Abrechnungen)
  if (d.tenant_ref && d.property_id) {
    try {
      const pid = Number(d.property_id), app = pid === CASA_PROP_ID ? 'casa' : 'rentals';
      const res = d.book ? (window._src.abr || []).concat([]).reverse().find(a => String(a.tenant_id || '') === String(d.tenant_ref) && sdD(a.period_from) === sdD(d.period_from) && a.status !== 'storniert') : null;
      const line = { property_id: pid, tenant_id: String(d.tenant_ref), app, kind: 'nk_tenant', covers_year: Y, period_from: d.period_from, period_to: d.period_to,
                     status: dir && d.book ? 'verschickt' : 'erledigt', amount, direction: dir, settled_via: d.settle_via || 'zahlung', note: 'manual',
                     paid_date: dir && d.book ? null : (d.letter_date || cxToday()), result_id: res ? String(res.id) : null };
      const old = (window._src.settle || []).find(r => String(r.tenant_id) === String(d.tenant_ref) && r.app === app && sdD(r.period_from) === sdD(d.period_from));
      const q = old ? _ctlSupa.from('ctrl_settlements').update(line).eq('id', old.id).select().single() : _ctlSupa.from('ctrl_settlements').insert(line).select().single();
      const { data, error } = await q;
      if (!error && data) { window._src.settle = (window._src.settle || []).filter(r => r.id !== data.id).concat([data]); if (typeof ctlSettlementInvalidate === 'function') ctlSettlementInvalidate(); }
    } catch (e) { console.warn('[settlements] manual → tenant card', e); }
  }
  d.status = 'sent'; d.sent_at = new Date().toISOString(); d.letter_id = letterId;
  try { await _ctlSupa.from(SD_TABLE).update({ status: 'sent', sent_at: d.sent_at, letter_id: letterId }).eq('id', d.id); } catch (e) {}
  const i = SD.drafts.findIndex(z => z.id === d.id); if (i >= 0) SD.drafts[i] = Object.assign({}, SD.drafts[i], d);
  stSay('Marked as sent · saved in the archive');
  SD.modal = null; SD.d = null; stRenderDashboard();
}

/* ── Clicks ── */
async function sdClick(e) {
  const b = e.target.closest('[data-sd]'); if (!b || b.disabled) return;
  const a = b.dataset.sd, d = SD.d;
  const fresh = () => { SD.open = null; SD.pdfMade = false; SD.customPeriod = false; SD.perMonth = false; };
  if (a === 'new') { fresh(); SD.d = sdNew(); SD.modal = 'calc'; SD.dirty = false; return sdRenderModal(); }
  if (a === 'openDraft') { const r = SD.drafts.find(x => String(x.id) === String(b.dataset.id)); if (r) { fresh(); SD.d = JSON.parse(JSON.stringify(r)); SD.d.lines = SD.d.lines || []; SD.d.vz = SD.d.vz || []; SD.modal = 'calc'; SD.dirty = false; sdRenderModal(); } return; }
  if (a === 'go') return sdGo((SD.steps || [])[Number(b.dataset.i)] && SD.steps[Number(b.dataset.i)].go);
  if (a === 'year') { SD.year = (SD.year || Number(cxToday().slice(0, 4)) - 1) + Number(b.dataset.d); return stRenderDashboard(); }
  if (a === 'tab') return stSwitchTab(b.dataset.t);
  if (a === 'sec') { SD.sec = SD.sec === b.dataset.k ? '' : b.dataset.k; return stRenderDashboard(); }
  if (a === 'drafts') { SD.showDrafts = !SD.showDrafts; return stRenderDashboard(); }
  if (a === 'letter') return scOpenLetter(b.dataset.id);
  if (!d) return;
  if (a === 'close') { if (SD.dirty && !(await stConfirm({ title: 'Close without saving?', ok: 'Close', danger: true }))) return; SD.modal = null; SD.d = null; SD.dirty = false; return sdRenderModal(); }
  if (a === 'addLine' || a === 'qa') {                             // quick-add chip (or "Other") → a new position, opened
    d.lines.push({ label: a === 'qa' ? (b.dataset.l || '') : '', amount: null, split: d.use_from || d.use_to ? 'days' : 'full', value: null });
    SD.open = d.lines.length - 1; SD.dirty = true; sdRenderModal();
    const f = document.querySelector('#sdModal [data-sdl="' + (d.lines[SD.open].label ? 'amount' : 'label') + '"][data-i="' + SD.open + '"]'); if (f) f.focus();
    return;
  }
  if (a === 'delLine') { d.lines.splice(Number(b.dataset.i), 1); SD.open = null; SD.dirty = true; return sdRenderModal(); }
  if (a === 'openLine') { const i = Number(b.dataset.i); SD.open = SD.open === i ? null : i; return sdRenderModal(); }
  if (a === 'split') { const l = d.lines[Number(b.dataset.i)]; if (l) { l.split = b.dataset.v; if (l.split === 'full' || l.split === 'days') l.value = null; } SD.dirty = true; return sdRenderModal(); }
  if (a === 'pickTen') { const t = sdTenants(d).find(z => String(z.id) === String(b.dataset.id)); if (t) { sdPickTenant(d, t); SD.dirty = true; } return sdRenderModal(); }
  if (a === 'pyear') { const same = sdSameVz(d); d.period_from = b.dataset.v + '-01-01'; d.period_to = b.dataset.v + '-12-31'; SD.customPeriod = false; sdAfterPeriod(d, same); SD.dirty = true; return sdRenderModal(); }
  if (a === 'customPeriod') { SD.customPeriod = true; return sdRenderModal(); }
  if (a === 'whole') {                                             // "Lived here the whole period" — off: own dates, costs split by days
    const same = sdSameVz(d), whole = !d.use_from && !d.use_to;
    if (whole) { d.use_from = d.period_from; d.use_to = d.period_to; (d.lines || []).forEach(l => { if (l.split === 'full') l.split = 'days'; }); }
    else { d.use_from = ''; d.use_to = ''; (d.lines || []).forEach(l => { if (l.split === 'days') l.split = 'full'; }); }
    sdRespread(d, same); SD.dirty = true; return sdRenderModal();
  }
  if (a === 'via') { d.settle_via = b.dataset.v; SD.dirty = true; return sdRenderModal(); }
  if (a === 'due') { d.due_days = Number(b.dataset.v) || 30; SD.dirty = true; return sdRenderModal(); }
  if (a === 'fill') {
    const n = sdNum((document.getElementById('sdFill') || {}).value); if (n === null) { stSay('Type the monthly amount first'); return; }
    d.vz = sdMonths(d).map(ym => ({ ym, amount: cxR(n) })); SD.dirty = true; return sdRenderModal();
  }
  if (a === 'tg') { d[b.dataset.f] = b.type === 'checkbox' ? b.checked : b.getAttribute('aria-pressed') !== 'true'; SD.dirty = true; return sdRenderModal(); }
  if (a === 'perMonth') { SD.perMonth = !SD.perMonth; if (!SD.perMonth) { const um = sdUseMonths(d), v = um.map(ym => sdNum(sdVzOf(d, ym))).find(z => z !== null); d.vz = v === undefined ? [] : um.map(ym => ({ ym, amount: v })); SD.dirty = true; } return sdRenderModal(); }
  if (a === 'save') { await sdSave(); return sdRenderModal(); }
  if (a === 'preview') return sdPdf(b);                            // older callers: the preview screen is gone
  if (a === 'pdf') return sdPdf(b);
  if (a === 'send') return sdSend(b);
  if (a === 'delDraft') {
    if (!(await stConfirm({ title: 'Delete this draft?', ok: 'Delete', danger: true }))) return;
    const { error } = await _ctlSupa.from(SD_TABLE).delete().eq('id', d.id);
    if (error) { stSay('Could not delete — ' + error.message); return; }
    SD.drafts = SD.drafts.filter(x => x.id !== d.id); SD.modal = null; SD.d = null; stRenderDashboard();
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && SD.modal && !SD.dirty) { SD.modal = null; SD.d = null; sdRenderModal(); } });
