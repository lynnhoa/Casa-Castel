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
  // needs you — both areas in one list
  const steps = (ren ? ren.steps : []).slice();
  if (casa && casa.sendable) {
    if (!casa.locked) steps.push({ o: 2, ic: 'lock', t: 'Lock house costs', s: 'Casa Castel · ' + casaLabel, go: { tab: 'casa', view: 'costs', y: Y } });
    else if (casa.open) steps.push({ o: 5, ic: 'send', t: casa.open + (casa.open === 1 ? ' letter ready' : ' letters ready'), s: 'Casa Castel · ' + casaLabel, go: { tab: 'casa', view: 'start', y: Y } });
  }
  if (casa) casa.confirm.forEach(t => steps.push({ o: 2, ic: 'check', t: 'Confirm settlement ' + (t.st.res.via === 'miete' ? 'with the rent' : 'via Kaution'), s: 'Casa Castel · ' + t.name + ' · ' + stEur(t.st.res.amount), go: { tab: 'casa', view: 'settle', key: t.key, y: Y } }));
  if (ren && ren.toSend) steps.push({ o: 6, ic: 'send', t: ren.toSend + (ren.toSend === 1 ? ' letter ready' : ' letters ready'), s: 'Rentals · periods ending in ' + Y, go: { tab: 'rentals', y: Y } });
  steps.sort((a, b) => a.o - b.o);
  SD.steps = steps;
  const need = stNeeds(steps.map((x, i) => ({ tone: x.red ? 'red' : 'gold', icon: x.ic, t: x.t, s: x.s, act: 'data-sd="go" data-i="' + i + '"' })), 'periods ending in ' + Y + ' are on track');
  // two area cards — the same numbers and colours as the tabs
  const line = (label, net, emptyTxt) => '<span class="sd-ml"><small>' + label + '</small>' + (net === null || net === undefined
    ? '<b class="is-nil">' + stEsc(emptyTxt) + '</b>' : '<b class="' + (net > 0.004 ? 'pos' : net < -0.004 ? 'neg' : 'is-nil') + '">' + (net > 0.004 ? 'you get ' : net < -0.004 ? 'you pay ' : 'balanced ') + (Math.abs(net) >= 0.005 ? sdE(Math.abs(net)) : '') + '</b>') + '</span>';
  const area = (tab, name, n, sent, t, frist, l1, l2) => {
    const left = sdLeft(frist);
    return '<button class="sc-card sd-area" data-sd="tab" data-t="' + tab + '"><span class="sd-area__n">' + name + '</span>' +
      '<span class="sd-area__r">' + stRing(n, sent, t, '', 58) + '<span class="sd-area__s">settled' + (left !== null ? '<br><b class="' + (left < 60 ? 'is-warn' : '') + '">' + (left >= 0 ? left + ' days left' : 'Frist passed') + '</b>' : '') + '</span></span>' +
      '<span class="sd-area__ls">' + l1 + l2 + '</span></button>';
  };
  const areas = '<div class="sd-areas">' +
    (ren ? area('rentals', 'Rentals', ren.settled, 0, ren.live, ren.frist, line('Tenants', ren.ten, 'waiting for the Jahresabrechnungen'), line('Hausgeld', ren.hg, 'no Jahresabrechnung yet')) : '') +
    (casa ? area('casa', 'Casa Castel', casa.done, casa.sent, casa.total, casa.frist, line('Tenants', casa.ten, 'no house costs yet'), line('Hausgeld', casa.hg, 'no Jahresabrechnung yet')) : '') + '</div>';
  const yearNav = '<div class="sc-yr">' +
    '<button class="cx-arw" data-sd="year" data-d="-1" aria-label="Previous year"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="sc-yr__t"><div class="sc-yr__m">' + Y + '</div><div class="sc-yr__s">periods ending in ' + Y + ' · status ' + stDe(cxToday()) + '</div></div>' +
    '<button class="cx-arw" data-sd="year" data-d="1" aria-label="Next year"' + (Y >= ty ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
  // the cute one: manual NK-Abrechnung (older years or anything not in the app)
  const create = '<button class="sd-c4" data-sd="new"><span class="sd-c4__i" aria-hidden="true">🏡<span class="sd-c4__s">✨</span></span>' +
    '<span class="sd-c4__t"><b>NK-Abrechnung erstellen</b><small>manual · older years</small></span><span class="sd-c4__p" aria-hidden="true"><i class="ti ti-plus"></i></span></button>';
  // house costs per year (Casa Castel)
  const yrs = (typeof SC !== 'undefined' ? SC.rows : []).filter(r => r.snapshot && r.snapshot.total !== undefined).map(r => ({ y: Number(r.year), v: Number(r.snapshot.total) || 0, locked: true }));
  if (casa && !casa.locked && !yrs.some(x => x.y === Y)) yrs.push({ y: Y, v: casa.M.R.check.total, locked: false });
  yrs.sort((a, b) => a.y - b.y);
  const last4 = yrs.slice(-4), mx = Math.max(1, ...last4.map(x => x.v));
  let chart = '';
  if (last4.length) {
    const lastTwo = last4.slice(-2), ch = lastTwo.length === 2 && lastTwo[0].v ? (lastTwo[1].v - lastTwo[0].v) / lastTwo[0].v * 100 : null;
    chart = stSec('House costs Casa Castel') + '<div class="sc-card"><div class="sd-ch">' +
      last4.map((x, i) => '<div class="sd-ch__c"><span class="sd-ch__v">' + Math.round(x.v).toLocaleString('de-DE') + '</span><span class="sd-ch__b' + (i === last4.length - 1 ? ' is-last' : '') + (x.locked ? '' : ' is-prev') + '" style="height:' + Math.max(4, Math.round(x.v / mx * 70)) + 'px"></span><span class="sd-ch__y">' + x.y + '</span></div>').join('') + '</div>' +
      (ch !== null ? '<p class="sd-ch__f">' + lastTwo[1].y + ': ' + (ch >= 0 ? '+ ' : '− ') + Math.abs(ch).toFixed(1).replace('.', ',') + ' % vs. ' + lastTwo[0].y + (last4[last4.length - 1].locked ? '' : ' · preview') + '</p>' : '') + '</div>';
  }
  // drafts + last letters
  const drafts = SD.drafts.filter(d => d.status !== 'sent');
  const draftsHtml = drafts.length ? '<div class="sc-sec">Drafts <span>' + drafts.length + '</span></div><div class="sc-card sc-list">' + drafts.map(d =>
    '<button class="sc-row" data-sd="openDraft" data-id="' + stEsc(d.id) + '"><span class="sc-av sc-av--doc"><i class="ti ti-pencil" aria-hidden="true"></i></span><span class="sc-row__m"><span class="sc-row__n">' + stEsc(d.tenant_name || 'Tenant') + '</span>' +
    '<span class="sc-row__p">' + stEsc(sdPropName(d) + ' · NK ' + String(d.period_to || '').slice(0, 4)) + '</span></span><span class="sc-open">Open</span></button>').join('') + '</div>' : '';
  const letters = (typeof SC !== 'undefined' ? SC.letters : []).slice(0, 3);
  const lettersHtml = letters.length ? '<div class="sc-sec">Last letters</div><div class="sc-card sc-list">' + letters.map(l =>
    '<button class="sc-row" data-sd="letter" data-id="' + stEsc(l.id) + '"><span class="sc-av sc-av--doc"><i class="ti ti-file-text" aria-hidden="true"></i></span><span class="sc-row__m"><span class="sc-row__n">' + stEsc((l.tenant_name || '') + (l.unit_label ? ' · ' + l.unit_label : '')) + '</span>' +
    '<span class="sc-row__p">' + stEsc((l.source === 'manual' ? 'manual · ' : '') + 'NK ' + l.year + ' · sent ' + stDate(String(l.sent_at).slice(0, 10)) + ' · ' + (Number(l.direction) > 0 ? 'Nachzahlung ' + sdE(l.amount) : Number(l.direction) < 0 ? 'Guthaben ' + sdE(l.amount) : 'balanced')) + '</span></span><span class="sc-open">Open</span></button>').join('') + '</div>' : '';
  const sql = SD.missing ? '<div class="st-soon"><i class="ti ti-database" aria-hidden="true"></i><div><strong>Run the SQL once</strong><span>The table nk_abrechnung_manual is missing – the SQL is in the chat.</span></div></div>' : '';

  el.innerHTML = '<div class="st-page sc-page sd-page">' + create + yearNav + sql +
    need + areas + chart + draftsHtml + lettersHtml + '</div>';
  sdRenderModal();
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
           lines: [{ label: '', amount: null, split: 'full', value: null }], vz: [], settle_via: 'zahlung', due_days: 30, letter_date: cxToday(), book: false, status: 'draft' };
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
  if (p) { const apt = ctlPropLinks(p).apt || {}; return [[apt.adresse, apt.wohnungsnummer ? 'Whg. ' + apt.wohnungsnummer : ''].filter(Boolean).join(', '), apt.plz_ort || ''].filter(Boolean); }
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
    (SD.modal === 'preview' ? sdPreviewView() : sdCalcView()) + '</div></div>';
  const b = h.querySelector('.srm__b'); if (b) b.scrollTop = top;
  document.body.classList.add('st-panel-open');
}
const sdOpt = (v, l, on) => '<option value="' + stEsc(v) + '"' + (on ? ' selected' : '') + '>' + stEsc(l) + '</option>';
function sdUseMonths(d) {
  const uf = (d.use_from || d.period_from || '').slice(0, 7), ut = (d.use_to || d.period_to || '').slice(0, 7);
  return sdMonths(d).filter(ym => ym >= uf && ym <= ut);
}
function sdCalcView() {
  const d = SD.d, x = sdCalc(d), sent = d.status === 'sent', dis = sent ? ' disabled' : '';
  const props = sdProps(), p = d.property_id ? props.find(q => q.id === Number(d.property_id)) : null, casa = p && p.id === CASA_PROP_ID, other = !d.property_id && d.title_name !== '';
  const rooms = (window._src.rooms || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const tens = sdTenants(d);
  const row = (lab, html) => '<div class="sd-f"><span>' + lab + '</span>' + html + '</div>';
  const two = (a, b) => '<span class="sd-two">' + a + '<i>–</i>' + b + '</span>';
  const top = '<div class="sd-box">' +
    row('Property', '<select class="sd-in" data-sdf="property_id"' + dis + '>' + sdOpt('', '— choose —', !d.property_id && !other) + props.map(q => sdOpt(q.id, q.name, Number(d.property_id) === q.id)).join('') + sdOpt('other', 'Other …', other) + '</select>') +
    (casa ? row('Room', '<select class="sd-in" data-sdf="unit_label"' + dis + '>' + sdOpt('', '— choose —', !d.unit_label) + rooms.map(r => sdOpt(r.name, r.name, d.unit_label === r.name)).join('') + '</select>') : '') +
    (other ? row('Name', '<input class="sd-in" data-sdf="title_name" value="' + stEsc(String(d.title_name).trim()) + '" placeholder="name of the property"' + dis + '/>') : '') +
    row('Period', two('<input class="sd-in" type="date" data-sdf="period_from" value="' + stEsc(d.period_from) + '"' + dis + '/>', '<input class="sd-in" type="date" data-sdf="period_to" value="' + stEsc(d.period_to) + '"' + dis + '/>')) +
    row('Tenant', '<input class="sd-in" list="sdTen" data-sdf="tenant_name" value="' + stEsc(d.tenant_name) + '" placeholder="type or choose"' + dis + '/>' +
      '<datalist id="sdTen">' + tens.map(t => '<option value="' + stEsc([t.first_name, t.last_name].filter(Boolean).join(' ')) + '">').join('') + '</datalist>') +
    row('Address', '<input class="sd-in" data-sdf="address1" value="' + stEsc(String(d.address || '').split('\n').filter(Boolean).join(', ')) + '" placeholder="Street, PLZ City"' + dis + '/>') +
  '</div>' +
  '<button class="sd-more" data-sd="more"><i class="ti ti-' + (SD.more ? 'minus' : 'plus') + '" aria-hidden="true"></i> ' + (SD.more ? 'less' : 'more · lived from–until, IBAN, former tenant') + '</button>' +
  (SD.more ? '<div class="sd-box">' +
    row('Lived', two('<input class="sd-in" type="date" data-sdf="use_from" value="' + stEsc(d.use_from || '') + '"' + dis + '/>', '<input class="sd-in" type="date" data-sdf="use_to" value="' + stEsc(d.use_to || '') + '"' + dis + '/>')) +
    row('IBAN', '<input class="sd-in" data-sdf="iban" value="' + stEsc(d.iban || '') + '" placeholder="only for a Guthaben"' + dis + '/>') +
    row('Former', '<label class="sd-chk"><input type="checkbox" data-sd="tg" data-f="former"' + (d.former ? ' checked aria-pressed="true"' : ' aria-pressed="false"') + dis + '/> moved out · "ehemalige Wohnung"</label>') +
  '</div>' : '');
  // positions
  const pos = '<p class="sd-cap">Positions</p><div class="sd-box sd-box--p">' + (d.lines || []).map((l, i) => {
    const c = x.lines[i];
    return '<div class="sd-pl"><div class="sd-pl__r"><input class="sd-in sd-pl__l" list="sdKinds" data-sdl="label" data-i="' + i + '" value="' + stEsc(l.label || '') + '" placeholder="Kostenart"' + dis + '/>' +
      '<span class="sd-amt"><input class="sd-in" inputmode="decimal" data-sdl="amount" data-i="' + i + '" value="' + stEsc(l.amount === null || l.amount === undefined ? '' : cxE2(l.amount)) + '" placeholder="' + (l.split === 'direct' ? 'optional' : 'Kosten') + '"' + dis + '/><em>€</em></span>' +
      (sent ? '' : '<button class="sd-x" data-sd="delLine" data-i="' + i + '" aria-label="Remove line"><i class="ti ti-x" aria-hidden="true"></i></button>') + '</div>' +
      '<div class="sd-pl__r2"><select class="sd-in sd-pl__s" data-sdl="split" data-i="' + i + '"' + dis + '>' + SD_SPLITS.map(([v, t]) => sdOpt(v, t, l.split === v)).join('') + '</select>' +
      (l.split === 'pct' || l.split === 'direct' ? '<span class="sd-amt sd-amt--s"><input class="sd-in" inputmode="decimal" data-sdl="value" data-i="' + i + '" value="' + stEsc(l.value === null || l.value === undefined ? '' : String(l.value).replace('.', ',')) + '" placeholder="' + (l.split === 'pct' ? 'Anteil' : 'Betrag') + '"' + dis + '/><em>' + (l.split === 'pct' ? '%' : '€') + '</em></span>' : '') +
      '<span class="sd-pl__sh">share <b data-sd-share="' + i + '">' + (c.share === null ? '—' : sdE(c.share)) + '</b></span></div></div>';
  }).join('') +
  '<datalist id="sdKinds">' + (typeof SR_KINDS !== 'undefined' ? SR_KINDS.map(k => '<option value="' + stEsc(k.l) + '">').join('') : '') + '</datalist>' +
  (sent ? '' : '<button class="sd-add" data-sd="addLine"><i class="ti ti-plus" aria-hidden="true"></i> Add position</button>') +
  '<div class="sd-tot"><span>Tenant share</span><b id="sdSum">' + sdE(x.sum) + '</b></div></div>';
  // NK paid
  const um = sdUseMonths(d), vals = um.map(ym => sdNum(sdVzOf(d, ym)));
  const same = vals.length && vals.every(v => v !== null && v === vals[0]) ? vals[0] : null;
  const perMonth = SD.perMonth || (!same && vals.some(v => v !== null));
  const vz = '<p class="sd-cap">NK paid</p><div class="sd-box sd-box--p">' +
    (perMonth
      ? '<div class="sd-months">' + um.map(ym => '<label class="sd-m"><small>' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5, 7)) - 1] + (um.length > 12 ? ' ' + ym.slice(2, 4) : '') + '</small>' +
          '<input class="sd-in" inputmode="decimal" data-sdv="' + ym + '" value="' + stEsc(sdVzOf(d, ym) === null ? '' : cxE2(sdVzOf(d, ym))) + '"' + dis + '/></label>').join('') + '</div>' +
        '<div class="sd-tot"><span>Paid</span><b id="sdVz">' + sdE(x.vz) + '</b></div>'
      : '<div class="sd-vz1"><span class="sd-amt"><input class="sd-in" inputmode="decimal" data-sdx="vzone" value="' + (same !== null ? stEsc(cxE2(same)) : '') + '" placeholder="per month"' + dis + '/><em>€</em></span>' +
          '<span>× ' + um.length + (um.length === 1 ? ' month' : ' months') + ' = <b id="sdVz">' + sdE(x.vz) + '</b></span></div>') +
    (sent ? '' : '<button class="sd-add" data-sd="perMonth">' + (perMonth ? 'same amount every month' : 'different per month') + '</button>') + '</div>';
  // result + how it is settled
  const tone = x.saldo > 0 ? 'neg' : x.saldo < 0 ? 'pos' : '';
  const res = '<div class="sd-res"><span class="sc-hero__l ' + tone + '" id="sdResL">' + sdResLabel(d, x) + '</span><span class="sd-res__v ' + tone + '" id="sdRes">' + sdE(Math.abs(x.saldo)) + '</span>' +
    '<span class="sd-res__s" id="sdResS">' + sdE(x.sum) + ' − ' + sdE(x.vz) + (x.saldo > 0 ? ' · Nachzahlung' : x.saldo < 0 ? ' · Guthaben' : '') + '</span></div>' +
    '<div class="sd-box">' +
      row('Settle', '<select class="sd-in" data-sdf="settle_via"' + dis + '>' + [['zahlung', 'Bank transfer'], ['kaution', 'With the Kaution'], ['miete', 'With the rent']].map(([v, t]) => sdOpt(v, t, d.settle_via === v)).join('') + '</select>') +
      row('Within', '<span class="sd-two"><input class="sd-in" inputmode="numeric" data-sdf="due_days" value="' + stEsc(d.due_days ?? 30) + '"' + dis + '/><i>days</i></span>') +
      row('Letter', '<input class="sd-in" type="date" data-sdf="letter_date" value="' + stEsc(d.letter_date || cxToday()) + '"' + dis + '/>') +
      (d.property_id ? row('Controlling', '<label class="sd-chk"><input type="checkbox" data-sd="tg" data-f="book"' + (d.book ? ' checked aria-pressed="true"' : ' aria-pressed="false"') + dis + '/> also book the result</label>') : '') +
    '</div>';
  const head = '<div class="srm__h"><div class="srm__ht"><p class="srm__t">' + (d.id ? 'NK-Abrechnung' : 'New NK-Abrechnung') + '</p><p class="srm__s">manual · ' + (sent ? 'sent ' + stDate(String(d.sent_at || '').slice(0, 10)) : SD.dirty ? 'not saved yet' : 'draft') + '</p></div>' +
    '<button class="srm__x" data-sd="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>';
  const bar = sent ? '<div class="srm__bar srm__bar--2"><button class="cx-btn cx-btn--s" data-sd="close">Close</button><button class="cx-btn cx-btn--p" data-sd="pdf"><i class="ti ti-file-text" aria-hidden="true"></i> PDF</button></div>'
    : '<div class="srm__bar srm__bar--2">' + (d.id ? '<button class="cx-btn cx-btn--s" data-sd="delDraft" aria-label="Delete draft"><i class="ti ti-trash" aria-hidden="true"></i></button>' : '') +
      '<button class="cx-btn cx-btn--s" data-sd="save">Save</button><button class="cx-btn cx-btn--p" data-sd="preview">Preview <i class="ti ti-arrow-right" aria-hidden="true"></i></button></div>';
  return head + '<div class="srm__b"><div class="srm__one sd-form">' + top + pos + vz + res + '</div></div>' + bar;
}
function scToggleSd(f, on, t, s, can) {
  return '<button type="button" class="sc-tg' + (on ? ' on' : '') + '" data-sd="tg" data-f="' + f + '"' + (can ? '' : ' disabled') + ' aria-pressed="' + !!on + '">' +
    '<span class="sc-tg__t"><b>' + t + '</b><small>' + s + '</small></span><span class="sc-tg__sw" aria-hidden="true"></span></button>';
}
function sdResLabel(d, x) {
  const first = String(d.tenant_name || 'The tenant').split(' ')[0];
  return x.saldo > 0 ? first + ' pays you' : x.saldo < 0 ? first + ' gets back' : 'balanced';
}
function sdPreviewView() {
  const d = SD.d, x = sdCalc(d);
  const issues = [];
  if (!d.tenant_name) issues.push('the tenant\'s name');
  if (!String(d.address || '').trim()) issues.push('the address');
  if (!d.property_id && !d.title_name) issues.push('the property');
  if (x.missing) issues.push('an amount in the costs');
  return '<div class="srm__h"><div class="srm__ht"><button class="srm__back" data-sd="back"><i class="ti ti-chevron-left" aria-hidden="true"></i> Back to calculator</button><p class="srm__t">Letter · NK ' + String(d.period_to).slice(0, 4) + '</p>' +
    '<p class="srm__s">' + stEsc((d.tenant_name || '—') + ' · ' + sdPropName(d)) + ' · manual</p></div><button class="srm__x" data-sd="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>' +
    '<div class="srm__b"><div class="srm__one">' +
      (issues.length ? '<div class="srm__banner is-warn"><div><p class="srm__banner-t">Still missing</p><p class="srm__banner-s">' + stEsc(issues.join(', ')) + '</p></div></div>' : '') +
      '<div class="srm__card sc-hero"><span class="sc-hero__l ' + (x.saldo > 0 ? 'neg' : x.saldo < 0 ? 'pos' : '') + '">' + sdResLabel(d, x) + '</span><span class="sc-hero__v ' + (x.saldo > 0 ? 'neg' : x.saldo < 0 ? 'pos' : '') + '">' + sdE(Math.abs(x.saldo)) + '</span></div>' +
      '<div class="srm__card"><div class="sc-li"><span>Letter date</span><span>' + stDate(d.letter_date || cxToday()) + '</span></div>' +
        '<div class="sc-li"><span>To<small>' + stEsc(String(d.address || '').split('\n').filter(Boolean).join(', ')) + '</small></span><span>' + stEsc(d.tenant_name || '—') + '</span></div>' +
        '<div class="sc-li"><span>Due</span><span>' + (d.due_days ?? 30) + ' days</span></div>' +
        (d.property_id ? '<div class="sc-li"><span>Also book in Controlling</span><span>' + (d.book ? 'yes' : 'no') + '</span></div>' : '') + '</div>' +
      '<p class="sd-hint" style="text-align:center">Mark as sent → the letter is saved to the archive and the property\'s history</p>' +
    '</div></div>' +
    '<div class="srm__bar srm__bar--2"><button class="cx-btn cx-btn--s" data-sd="pdf"' + (issues.length ? ' disabled' : '') + '><i class="ti ti-file-text" aria-hidden="true"></i> Create PDF</button>' +
      '<button class="cx-btn cx-btn--p" data-sd="send"' + (issues.length ? ' disabled' : '') + '>Mark as sent</button></div>';
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
  if (el.dataset.sdf === 'address1') { d.address = el.value.split(/\s*,\s*/).filter(Boolean).join('\n'); SD.dirty = true; return; }
  if (el.dataset.sdf && ['tenant_name', 'address', 'iban', 'title_name', 'due_days'].includes(el.dataset.sdf)) {
    const f = el.dataset.sdf; d[f] = f === 'due_days' ? (Math.max(0, Math.round(Number(el.value) || 0)) || 30) : el.value; SD.dirty = true;
    if (f === 'tenant_name') { const l = document.getElementById('sdResL'); if (l) l.textContent = sdResLabel(d, sdCalc(d)); }
  }
}
function sdChange(e) {
  const el = e.target, d = SD.d; if (!d) return;
  const f = el.dataset.sdf;
  if (el.dataset.sdl === 'split') { const l = d.lines[Number(el.dataset.i)]; if (l) { l.split = el.value; if (el.value === 'full' || el.value === 'days') l.value = null; } SD.dirty = true; return sdRenderModal(); }
  if (f === 'tenant_name') {                                       // a known tenant → fill address, days and NK
    const t = sdTenants(d).find(z => [z.first_name, z.last_name].filter(Boolean).join(' ').toLowerCase() === String(el.value).trim().toLowerCase());
    if (t) { d.tenant_ref = String(t.id); d.tenant_name = [t.first_name, t.last_name].filter(Boolean).join(' ');
      const out = t.mietende && sdD(t.mietende) < cxToday(); d.former = !!out;
      d.address = out && t.address ? String(t.address).split(/\s*,\s*|\n/).filter(Boolean).join('\n') : sdPropAddr(d).join('\n');
      sdTenantPeriod(d, t); SD.dirty = true; return sdRenderModal(); }
    d.tenant_ref = ''; return;
  }
  if (!f || ['address', 'address1', 'iban', 'title_name', 'due_days'].includes(f)) return;
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
    if (t) {
      d.tenant_name = [t.first_name, t.last_name].filter(Boolean).join(' ');
      const out = t.mietende && sdD(t.mietende) < cxToday();
      d.former = !!out;
      d.address = out && t.address ? String(t.address).split(/\s*,\s*|\n/).filter(Boolean).join('\n') : sdPropAddr(d).join('\n');
      sdTenantPeriod(d, t);
    }
    return sdRenderModal();
  }
  if (f === 'period_from' || f === 'period_to') {                 // new period → the tenant's days and monthly NK follow
    d[f] = el.value;
    const t = d.tenant_ref ? sdTenants(d).find(x => String(x.id) === String(d.tenant_ref)) : null;
    if (t) sdTenantPeriod(d, t);
    return sdRenderModal();
  }
  if (f === 'use_from' || f === 'use_to' || f === 'letter_date' || f === 'unit_label' || f === 'settle_via') { d[f] = el.value; return sdRenderModal(); }
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
  const d = SD.d, x = sdCalc(d);
  x.lines.forEach((l, i) => { const e = document.querySelector('[data-sd-share="' + i + '"]'); if (e) e.textContent = l.share === null ? '—' : sdE(l.share); });
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  set('sdSum', sdE(x.sum)); set('sdVz', sdE(x.vz)); set('sdRes', sdE(Math.abs(x.saldo)));
  set('sdResS', sdE(x.sum) + ' − ' + sdE(x.vz) + (x.saldo > 0 ? ' · Nachzahlung' : x.saldo < 0 ? ' · Guthaben' : ''));
  const l = document.getElementById('sdResL'); if (l) { l.textContent = sdResLabel(d, x); l.className = 'sc-hero__l ' + (x.saldo > 0 ? 'neg' : x.saldo < 0 ? 'pos' : ''); }
  const r = document.getElementById('sdRes'); if (r) r.className = 'sc-hero__v ' + (x.saldo > 0 ? 'neg' : x.saldo < 0 ? 'pos' : '');
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
  return {
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
    const out = await nkLetterPdf(await sdLetterData(d), sdFileName(d)); await ccOpenPdf(out.blob, out.name);
  } catch (e) { console.error('[settlements] manual PDF', e); stNotice('The PDF could not be created. Please try again.'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = reset; } }
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
  if (a === 'new') { SD.d = sdNew(); SD.modal = 'calc'; SD.dirty = false; return sdRenderModal(); }
  if (a === 'openDraft') { const r = SD.drafts.find(x => String(x.id) === String(b.dataset.id)); if (r) { SD.d = JSON.parse(JSON.stringify(r)); SD.d.lines = SD.d.lines || []; SD.d.vz = SD.d.vz || []; SD.modal = 'calc'; SD.dirty = false; sdRenderModal(); } return; }
  if (a === 'go') return sdGo((SD.steps || [])[Number(b.dataset.i)] && SD.steps[Number(b.dataset.i)].go);
  if (a === 'year') { SD.year = (SD.year || Number(cxToday().slice(0, 4)) - 1) + Number(b.dataset.d); return stRenderDashboard(); }
  if (a === 'tab') return stSwitchTab(b.dataset.t);
  if (a === 'letter') return scOpenLetter(b.dataset.id);
  if (!d) return;
  if (a === 'close') { if (SD.dirty && !(await stConfirm({ title: 'Close without saving?', ok: 'Close', danger: true }))) return; SD.modal = null; SD.d = null; SD.dirty = false; return sdRenderModal(); }
  if (a === 'addLine') { d.lines.push({ label: '', amount: null, split: d.use_from || d.use_to ? 'days' : 'full', value: null }); SD.dirty = true; return sdRenderModal(); }
  if (a === 'delLine') { d.lines.splice(Number(b.dataset.i), 1); SD.dirty = true; return sdRenderModal(); }
  if (a === 'fill') {
    const n = sdNum((document.getElementById('sdFill') || {}).value); if (n === null) { stSay('Type the monthly amount first'); return; }
    d.vz = sdMonths(d).map(ym => ({ ym, amount: cxR(n) })); SD.dirty = true; return sdRenderModal();
  }
  if (a === 'tg') { d[b.dataset.f] = b.type === 'checkbox' ? b.checked : b.getAttribute('aria-pressed') !== 'true'; SD.dirty = true; return sdRenderModal(); }
  if (a === 'more') { SD.more = !SD.more; return sdRenderModal(); }
  if (a === 'perMonth') { SD.perMonth = !SD.perMonth; if (!SD.perMonth) { const um = sdUseMonths(d), v = um.map(ym => sdNum(sdVzOf(d, ym))).find(z => z !== null); d.vz = v === undefined ? [] : um.map(ym => ({ ym, amount: v })); SD.dirty = true; } return sdRenderModal(); }
  if (a === 'save') { await sdSave(); return sdRenderModal(); }
  if (a === 'preview') { SD.modal = 'preview'; sdSave(true); return sdRenderModal(); }
  if (a === 'back') { SD.modal = 'calc'; return sdRenderModal(); }
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
