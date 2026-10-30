/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — CONTRACTS TAB
   tab-contracts.js (Oct 2026 · Contracts bucket 2 of 3)

   One table of every Casa Castel running cost (the cost types of Controlling) with
   its provider contract: price now · next step (cancel by / any month / can't cancel)
   · reminder pills. Tap a row → the provider pop-up:
     Price · Dates · Bonus · Details · Documents
   Each section button opens its small form right in that section; Save returns to
   the read view. Edit turns the whole pop-up into one form. + opens New contract.

   Source of truth for Casa Castel costs: prices + from-months stay in
   ctrl_castel_amount_history (Controlling reads them as before); cost type, rhythm,
   due months and NK split stay in ctrl_castel_categories. New:
   house_contracts · house_contract_bonuses · house_contract_docs (+ storage
   'contract-docs'). Money is confirmed only in Controlling.

   Reminder pills (calculated, nothing stored but your click-away):
     red   No contract from …   it ends within 8 weeks and nothing follows
     amber No confirmation       14 days after cancelling
     amber Cancel by …           8 weeks before the last day to cancel
                                 (term · special cancel right · price guarantee)
     amber Claim …               a bonus needs something from you
     amber Bonus?                a bonus is 4 weeks late
   Rate (Properties) and Gärtner · Putzdienst · Winterdienst (Providers) are not here.
   ───────────────────────────────────────────────────────────── */

const CTR_SKIP = ['RATE', 'GAERTNER', 'PUTZDIENST', 'WINTERDIENST'];
const CTR_NOTICE = [['unknown', 'not known'], ['none', "can't be cancelled"], ['2w', '2 weeks'], ['4w', '4 weeks'], ['6w', '6 weeks'],
  ['1m', '1 month'], ['2m', '2 months'], ['3m', '3 months'], ['6m', '6 months'], ['12m', '12 months']];
const CTR_FREQ = [['monatlich', 'Monthly'], ['vierteljährlich', 'Quarterly'], ['jährlich', 'Yearly'], ['sporadisch', 'As needed']];
const CTR_BONUS_KINDS = ['Neukundenbonus', 'Sofortbonus', 'Cashback', 'Gutschein', 'Punkte', 'Bonus'];
const CTR_DOC_KINDS = [['contract', 'Contract'], ['price', 'Price letter'], ['cancellation', 'Kündigung'], ['confirmation', 'Confirmation'], ['other', 'Other']];
const CTR_BUCKET = 'contract-docs';
const CTR_SHORT = { ENTSORGUNG: 'Entsorgung', VERSICHERUNG_WGB: 'Wohngebäude', VERSICHERUNG_HP: 'Haftpflicht', WARTUNG_HEIZUNG: 'Heizung Wartung', WARTUNG_ENTHAERT: 'Enthärtung Wartung' };
const CTR_MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const CTR_MON_L = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CTR = { cats: [], hist: [], cons: [], bons: [], docs: [], loaded: false, err: '', open: null, form: '', arg: null, add: null, busy: false };

/* ── small helpers ─────────────────────────────────────────── */
const _ctrE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _ctrN = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const _ctrR = n => Math.round(_ctrN(n) * 100) / 100;
const _ctrEur = n => ccFmtNum(_ctrR(n), 2) + '\u00a0€';
const _ctrEurS = n => ccFmtNum(_ctrR(n), 'auto') + '\u00a0€';
const _ctrD = v => (v ? String(v).slice(0, 10) : '');
const _ctrT = () => ccTodayISO();
const _ctrF = iso => (iso ? ccFmtDate(iso) : '');
const _ctrFS = iso => (iso ? ccFmtDateShort(iso) : '');
const _ctrMY = iso => (iso ? iso.slice(5, 7) + '.' + iso.slice(0, 4) : '');
const _ctrId = v => String(v ?? '');
function _ctrAddM(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
}
function _ctrAddD(iso, n) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
function _ctrNotice(iso, notice, sign) {
  const d = { '2w': 14, '4w': 28, '6w': 42 }[notice]; if (d) return _ctrAddD(iso, sign * d);
  const m = { '1m': 1, '2m': 2, '3m': 3, '6m': 6, '12m': 12 }[notice]; return m ? _ctrAddM(iso, sign * m) : null;
}
const _ctrCancellable = n => !!n && n !== 'unknown' && n !== 'none';
const _ctrNoticeLbl = n => (CTR_NOTICE.find(x => x[0] === n) || CTR_NOTICE[0])[1];
function _ctrParseMonth(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})[.\/-](\d{4})$/) || String(v || '').trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!m) return null;
  const [mo, y] = m[1].length === 4 ? [+m[2], +m[1]] : [+m[1], +m[2]];
  return mo >= 1 && mo <= 12 && y > 1999 && y < 2100 ? y + '-' + String(mo).padStart(2, '0') + '-01' : null;
}
const _ctrDateIn = v => (String(v || '').trim() ? ccParseDate(String(v).trim()) : null);

/* ── cost types, prices ────────────────────────────────────── */
const _ctrCat = id => CTR.cats.find(c => _ctrId(c.id) === _ctrId(id));
const _ctrSkip = c => CTR_SKIP.includes(String(c.code || '').toUpperCase());
const _ctrName = c => CTR_SHORT[String(c.code || '').toUpperCase()] || c.name || '';   // short name in the table
const _ctrRows = () => CTR.cats.filter(c => c.active !== false && !_ctrSkip(c))
  .sort((a, b) => (_ctrN(a.sort_order) || 999) - (_ctrN(b.sort_order) || 999) || String(a.name).localeCompare(String(b.name)));
function _ctrFreq(c) {
  const f = String(c.frequency || 'monatlich').toLowerCase();
  if (/sporad|bedarf/.test(f)) return 'need';
  if (/viertel|quart/.test(f)) return 'quarter';
  if (/halb/.test(f)) return 'half';
  if (/jähr|jahr/.test(f)) return 'year';
  return 'month';
}
const _ctrPer = c => ({ month: 'month', quarter: 'quarter', half: 'half-year', year: 'year', need: 'as needed' })[_ctrFreq(c)];
const _ctrDue = c => (Array.isArray(c.due_months) ? c.due_months.map(Number).filter(n => n >= 1 && n <= 12) : []);
const _ctrPeriods = catId => CTR.hist.filter(h => _ctrId(h.category_id) === _ctrId(catId))
  .sort((a, b) => _ctrD(a.valid_from).localeCompare(_ctrD(b.valid_from)));
function _ctrPriceAt(c, first) {            // same rule as Controlling: the period that started on or before the 1st
  const list = _ctrPeriods(c.id);
  if (!list.length) return { amount: _ctrN(c.default_amount), row: null };
  let i = 0;
  list.forEach((h, k) => { if (_ctrD(h.valid_from) <= first) i = k; });
  return { amount: _ctrN(list[i].amount), row: list[i] };
}
const _ctrNow = c => _ctrPriceAt(c, _ctrT().slice(0, 7) + '-01');
function _ctrPerYear(c, amount) {
  const f = _ctrFreq(c), dm = _ctrDue(c);
  if (f === 'need') return dm.length ? amount * dm.length : 0;
  if (f === 'month') return amount * (dm.length || 12);
  return dm.length ? amount * dm.length : 0;     // quarterly / yearly need their months (as in Controlling)
}

/* ── contracts, dates, pills ───────────────────────────────── */
const _ctrConsOf = catId => CTR.cons.filter(k => _ctrId(k.category_id) === _ctrId(catId) && !k.deleted_at)
  .sort((a, b) => _ctrD(a.starts_on).localeCompare(_ctrD(b.starts_on)));
const _ctrK = id => CTR.cons.find(k => _ctrId(k.id) === _ctrId(id));
const _ctrBonsOf = k => (k ? CTR.bons.filter(b => _ctrId(b.contract_id) === _ctrId(k.id)) : []);
const _ctrDocsOf = k => (k ? CTR.docs.filter(d => _ctrId(d.contract_id) === _ctrId(k.id)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) : []);
function _ctrTerm(k) {
  const t = _ctrT();
  const minEnd = k.starts_on && k.min_months ? _ctrAddM(_ctrD(k.starts_on), _ctrN(k.min_months)) : null;
  let until = _ctrD(k.runs_until) || null;
  if (!until && minEnd && (k.then_rule !== 'monthly' || minEnd > t)) until = minEnd;
  let renewed = false;
  if (until && k.then_rule === 'renew' && _ctrN(k.renew_months) > 0 && _ctrCancellable(k.notice)) {
    let g = 0;
    while (_ctrNotice(until, k.notice, -1) < t && g++ < 80) { until = _ctrAddM(until, _ctrN(k.renew_months)); renewed = true; }
  }
  const cancelBy = until && _ctrCancellable(k.notice) && !(k.then_rule === 'monthly' && until <= t) ? _ctrNotice(until, k.notice, -1) : null;
  const anyMonth = _ctrCancellable(k.notice) && k.then_rule === 'monthly' && (!until || until <= t) && (!k.min_months || !!minEnd);
  return { until, cancelBy, anyMonth, minEnd, renewed };
}
function _ctrEnd(k) {
  if (k.cancelled_on) return _ctrD(k.ends_on) || null;
  if (k.then_rule === 'ends') return _ctrTerm(k).until;
  return null;
}
function _ctrMain(catId) {
  const t = _ctrT(), list = _ctrConsOf(catId);
  if (!list.length) return null;
  const live = list.filter(k => { const e = _ctrEnd(k); return !e || e >= t; });
  return live.find(k => !k.starts_on || _ctrD(k.starts_on) <= t) || live[0] || list[list.length - 1];
}
const _ctrNext = k => _ctrConsOf(k.category_id).find(x => x.id !== k.id && x.starts_on && (!k.starts_on || _ctrD(x.starts_on) > _ctrD(k.starts_on)));
const _ctrBonusAmt = b => (b.paid === 'points' || b.amount === null || b.amount === undefined ? (b.points ? b.points + ' points' : '') : _ctrEurS(b.amount));

function _ctrState(c) {
  const t = _ctrT(), k = _ctrMain(c.id), now = _ctrNow(c), st = { c, k, now, pills: [], pill: null, next: '', mu: false };
  if (!k) {
    st.next = '—';
    st.mu = true;
    return st;
  }
  const end = _ctrEnd(k), nxt = _ctrNext(k);
  if (end && !nxt && !k.no_successor && _ctrAddD(end, -56) <= t)
    st.pills.push({ lvl: 'red', kind: 'nocontract', date: _ctrAddD(end, 1), end, text: 'No contract from ' + _ctrFS(_ctrAddD(end, 1)) });
  if (k.cancelled_on && !k.cancel_confirmed_on && _ctrAddD(_ctrD(k.cancelled_on), 14) <= t && (!end || end >= t))
    st.pills.push({ lvl: 'amber', kind: 'confirm', text: 'No confirmation' });
  if (!k.cancelled_on && k.notice !== 'none') {
    const term = _ctrTerm(k), cands = [];
    if (term.cancelBy && k.then_rule !== 'ends') cands.push({ date: term.cancelBy, why: 'term', until: term.until });
    const sp = _ctrPeriods(c.id).map(h => _ctrD(h.special_cancel_until)).filter(d => d && d >= t).sort()[0];
    if (sp) cands.push({ date: sp, why: 'special' });
    if (k.price_fixed_until && _ctrD(k.price_fixed_until) >= t) cands.push({ date: _ctrD(k.price_fixed_until), why: 'guarantee' });
    const due = cands.filter(x => x.date >= t && _ctrAddD(x.date, -56) <= t && _ctrD(k.kept_cancel_by) !== x.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (due) st.pills.push(Object.assign({ lvl: 'amber', kind: 'cancelby', text: 'Cancel by ' + _ctrFS(due.date) }, due));
  }
  for (const b of _ctrBonsOf(k)) {
    if (b.paid === 'points') continue;
    if (b.status === 'open' && b.condition && !b.expected_on)
      st.pills.push({ lvl: 'amber', kind: 'claim', b, text: 'Claim ' + _ctrBonusAmt(b) });
    else if ((b.status === 'open' || b.status === 'claimed') && b.expected_on && _ctrAddD(_ctrD(b.expected_on), 28) <= t)
      st.pills.push({ lvl: 'amber', kind: 'late', b, text: 'Bonus?' });
  }
  st.pill = st.pills[0] || null;
  if (k.notice === 'none') { st.next = "can't cancel"; st.mu = true; }
  else if (k.cancelled_on) st.next = end ? 'ends<br>' + _ctrF(end) : 'cancelled';
  else {
    const term = _ctrTerm(k);
    if (k.then_rule === 'ends' && term.until) st.next = 'ends<br>' + _ctrF(term.until);
    else if (term.anyMonth) st.next = 'any month';
    else if (term.cancelBy) st.next = 'cancel by<br>' + _ctrF(term.cancelBy) + (term.until ? '<small>ends ' + _ctrF(term.until) + '</small>' : '');
    else { st.next = 'add details'; st.mu = true; }
  }
  return st;
}
const _ctrPillHTML = p => (p ? `<span class="ctr-chip${p.lvl === 'red' ? ' red' : ''}">${_ctrE(p.text)}</span>` : '');

/* ── styles ────────────────────────────────────────────────── */
(function () {
  if (typeof document === 'undefined' || document.getElementById('ctr-css')) return;
  const s = document.createElement('style'); s.id = 'ctr-css';
  s.textContent = `
.cc-tab--dot { position:relative; }
.cc-tab--dot::after { content:''; position:absolute; top:10px; right:2px; width:6px; height:6px; border-radius:50%; background:var(--cc-gold); }
#tab-contracts .ctr-wrap { max-width:760px; }
#tab-contracts .rp-hdr { gap:8px; }
#tab-contracts .rp-hdr .cc-h1 { flex:1; }
.ctr-plus { width:36px; height:36px; border-radius:50%; border:none; background:var(--cc-ink); color:var(--cc-white); display:inline-flex; align-items:center; justify-content:center; font-size:17px; cursor:pointer; flex-shrink:0; }
.ctr-chip { display:inline-block; font-size:10.5px; font-weight:500; padding:2px 8px; border-radius:10px; background:#FDF0D8; color:#633806; white-space:nowrap; }
.ctr-chip.red { background:#F7E4DC; color:#8A3B22; }
.ctr-chip.g { background:#EFE9E0; color:#9A8E7E; }
.ctr-chip.ok { background:#EAF3DE; color:#27500A; }
.ctr-tbl { background:var(--cc-white); border:var(--cc-border); border-radius:14px; overflow:hidden; }
.ctr-th, .ctr-tr, .ctr-tf { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,.9fr) minmax(0,1fr); gap:8px; align-items:center; padding:0 12px; }
.ctr-th { min-height:34px; background:var(--cc-surface); font-size:9.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A7F70; }
.ctr-th span:nth-child(n+2) { text-align:right; }
.ctr-tr { width:100%; min-height:52px; padding-top:8px; padding-bottom:8px; border:none; border-top:1px solid #EDE8E0; background:none; font-family:inherit; text-align:left; color:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.ctr-tr:nth-of-type(odd) { background:#FAF7F2; }
.ctr-tr:active { background:var(--cc-surface); }
.ctr-c1 b { display:block; font-size:13.5px; font-weight:500; line-height:1.25; color:var(--cc-ink); -webkit-hyphens:auto; hyphens:auto; overflow-wrap:break-word; }
.ctr-c1 span { display:block; font-size:11.5px; color:var(--cc-taupe); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ctr-c2 { text-align:right; }
.ctr-c2 b { display:block; font-size:13.5px; font-weight:600; color:var(--cc-ink); white-space:nowrap; }
.ctr-c2 span { display:block; font-size:11px; color:var(--cc-taupe); }
.ctr-c3 { font-size:12px; color:#7A6F62; line-height:1.3; text-align:right; }
.ctr-c3.mu { color:#B5AA99; }
.ctr-c3 small { display:block; font-size:10.5px; color:#B5AA99; margin-top:1px; }
.ctr-tf { padding-top:10px; padding-bottom:10px; border-top:1px solid #D9CFC2; background:#F3EEE6; }
.ctr-tf > b { font-size:13px; font-weight:600; color:var(--cc-ink); }
.ctr-foot { font-size:11.5px; color:var(--cc-taupe); margin:12px 4px 0; line-height:1.5; }
.ctr-empty { padding:28px 16px; text-align:center; font-size:13px; color:var(--cc-taupe); }
#ctrSheet .tn-sheet { max-width:560px; }
.ctr-hd { display:flex; align-items:flex-start; gap:10px; padding:16px 18px 12px; border-bottom:var(--cc-border); flex-shrink:0; }
.ctr-hd-t { flex:1; min-width:0; }
.ctr-kk { font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:var(--cc-taupe); }
.ctr-st { font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; font-weight:400; line-height:1.12; color:var(--cc-ink); margin-top:2px; }
.ctr-st.mu { color:#B5AA99; font-style:italic; }
.ctr-sub { font-size:12px; color:var(--cc-taupe); margin-top:2px; }
.ctr-hd .ctr-chip { margin-top:8px; }
.ctr-hb { display:flex; gap:6px; align-items:center; flex-shrink:0; }
.ctr-b { border:var(--cc-border); background:var(--cc-white); border-radius:14px; min-height:30px; padding:0 12px; font-family:inherit; font-size:11.5px; font-weight:500; color:#7A6F62; display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap; }
.ctr-b.dk { background:#3A3530; color:#fff; border-color:#3A3530; }
.ctr-x { width:34px; height:34px; border-radius:50%; background:var(--cc-surface); border:var(--cc-border); color:var(--cc-taupe); display:inline-flex; align-items:center; justify-content:center; font-size:15px; cursor:pointer; }
.ctr-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:2px 18px max(18px,env(safe-area-inset-bottom,18px)); }
.ctr-rem { margin:14px 0 2px; border-radius:12px; padding:11px 12px; background:#FDF6EA; border:1px solid #F0D2A0; }
.ctr-rem.red { background:#FCF1F1; border-color:#F0B4B4; }
.ctr-rem p { margin:0; font-size:12.5px; line-height:1.5; color:#5C534A; }
.ctr-rem p b { color:#633806; font-weight:600; }
.ctr-rem.red p b { color:#791F1F; }
.ctr-ra { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; margin-top:10px; }
.ctr-ra .ctr-b { min-height:32px; border-radius:16px; }
.ctr-sec { padding:14px 0 8px; border-top:1px solid #EDE8E0; }
.ctr-sec:first-child, .ctr-rem + .ctr-sec { border-top:none; }
.ctr-sec.on { background:#F8F4EE; margin:0 -18px; padding:14px 18px; border-top:1px solid var(--cc-rule); }
.ctr-sh2 { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; }
.ctr-sl { font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; }
.ctr-kv { display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:6px 0; font-size:13.5px; }
.ctr-kv span { color:var(--cc-taupe); flex-shrink:0; }
.ctr-kv b { font-weight:500; text-align:right; color:var(--cc-ink); overflow-wrap:anywhere; }
.ctr-kv b.e { color:#C8BFB0; font-weight:400; }
.ctr-sm { font-size:11.5px; color:var(--cc-taupe); padding:2px 0 4px; line-height:1.45; }
.ctr-hist { margin-top:4px; border-top:1px dashed #E6DED2; padding-top:4px; }
.ctr-hist div { display:flex; justify-content:space-between; gap:10px; font-size:12px; color:var(--cc-taupe); padding:3px 0; }
.ctr-bo { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-top:1px solid #F1ECE4; cursor:pointer; }
.ctr-bo:first-of-type { border-top:none; }
.ctr-bo .t { flex:1; min-width:0; }
.ctr-bo .t b { display:block; font-size:13.5px; font-weight:500; color:var(--cc-ink); }
.ctr-bo .t span { display:block; font-size:11.5px; color:var(--cc-taupe); margin-top:1px; }
.ctr-bo .a { text-align:right; white-space:nowrap; font-size:13.5px; font-weight:600; color:var(--cc-ink); }
.ctr-bo .a .ctr-chip { margin-top:3px; }
.ctr-lnk { font-size:12px; color:#8A6535; cursor:pointer; background:none; border:none; padding:2px 0; font-family:inherit; text-align:left; }
.ctr-doc { display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px solid #F1ECE4; }
.ctr-doc:first-of-type { border-top:none; }
.ctr-doc button.o { flex:1; min-width:0; display:flex; align-items:center; gap:10px; background:none; border:none; padding:0; font-family:inherit; text-align:left; cursor:pointer; color:inherit; }
.ctr-doc .ic { width:30px; height:30px; border-radius:50%; background:#F5EFE6; color:#8A6535; display:inline-flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.ctr-doc .t b { display:block; font-size:13px; font-weight:500; color:var(--cc-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ctr-doc .t span { display:block; font-size:11px; color:var(--cc-taupe); }
.ctr-doc .del { background:none; border:none; color:#C8BFB0; font-size:16px; cursor:pointer; padding:4px; }
.ctr-fs { font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; margin:22px 0 0; }
.ctr-fs:first-child { margin-top:6px; }
.ctr-fl { display:block; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--cc-charcoal); margin:12px 0 6px; }
.ctr-in { width:100%; box-sizing:border-box; min-height:42px; padding:0 12px; border:.5px solid var(--cc-rule); border-radius:8px; background:var(--cc-white); font-family:inherit; font-size:16px; color:var(--cc-ink); }
.ctr-sec.on .ctr-in, .ctr-sec.on .ctr-seg button:not(.on) { background:var(--cc-white); }
.ctr-full .ctr-in { background:var(--cc-bg); }
textarea.ctr-in { min-height:70px; padding:10px 12px; resize:vertical; }
select.ctr-in { -webkit-appearance:none; appearance:none; }
.ctr-in.r { text-align:right; }
.ctr-2 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px; }
.ctr-seg { display:flex; border:.5px solid var(--cc-rule); border-radius:8px; overflow:hidden; }
.ctr-seg button { flex:1; min-height:40px; border:none; border-left:.5px solid var(--cc-rule); background:var(--cc-white); font-family:inherit; font-size:12.5px; color:var(--cc-charcoal); cursor:pointer; padding:0 4px; }
.ctr-seg button:first-child { border-left:none; }
.ctr-seg button.on { background:var(--cc-ink); color:var(--cc-white); }
.ctr-mons { display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:6px; }
.ctr-mons button { min-height:34px; border:.5px solid var(--cc-rule); border-radius:8px; background:var(--cc-white); font-family:inherit; font-size:12.5px; color:var(--cc-taupe); cursor:pointer; }
.ctr-mons button.on { background:#F3EADC; border-color:#D9BF94; color:#8A6535; font-weight:600; }
.ctr-file { display:flex; align-items:center; gap:8px; min-height:42px; padding:0 12px; border:1px dashed #D5CCBE; border-radius:8px; background:var(--cc-white); font-size:13px; color:var(--cc-taupe); cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ctr-file input { display:none; }
.ctr-hint { margin:8px 0 0; font-size:12px; line-height:1.5; color:#7A6F62; }
.ctr-ft { display:flex; justify-content:flex-end; align-items:center; gap:14px; margin-top:16px; }
.ctr-ft .rm-btn--primary { flex:0 0 auto; height:40px; padding:0 22px; }
.ctr-ft .rm-btn--ghost { height:40px; }
.ctr-ft .ctr-del { margin-right:auto; background:none; border:none; color:#A0533A; font-family:inherit; font-size:12.5px; cursor:pointer; padding:0; }
@media (min-width:701px) { .ctr-body { padding-bottom:20px; } }
`;
  (document.head || document.documentElement).appendChild(s);
})();

/* ── load ──────────────────────────────────────────────────── */
async function _ctrFetch() {
  const q = t => sbL.from(t).select('*');
  const res = await Promise.all([
    q('ctrl_castel_categories').order('sort_order'),
    q('ctrl_castel_amount_history'),
    q('house_contracts').is('deleted_at', null),
    q('house_contract_bonuses'),
    q('house_contract_docs'),
  ]);
  const bad = res.find(r => r.error);
  if (bad) throw bad.error;
  [CTR.cats, CTR.hist, CTR.cons, CTR.bons, CTR.docs] = res.map(r => r.data || []);
  CTR.loaded = true; CTR.err = '';
}
async function loadContracts() {
  const host = document.getElementById('tab-contracts');
  if (!host || typeof sbL === 'undefined' || !sbL) return;
  if (!CTR.loaded) host.innerHTML = '<div class="ctr-wrap"><div class="ctr-empty">Loading contracts …</div></div>';
  try { await _ctrFetch(); }
  catch (e) {
    console.error('[contracts] load', e);
    CTR.err = /house_contracts|does not exist|schema cache/i.test(String(e && e.message)) ? 'Run the Contracts SQL (bucket 1) in Supabase first.' : 'Contracts could not be loaded. Please try again.';
  }
  ctrRender();
}
/* the gold dot on the tab, also before the tab was opened */
async function ctrBoot() {
  if (CTR.loaded || typeof sbL === 'undefined' || !sbL || !document.getElementById('tab-contracts')) return;
  try { await _ctrFetch(); _ctrDot(); } catch (e) { /* the tab shows the reason when opened */ }
}
function _ctrDot() {
  const n = CTR.loaded ? _ctrRows().filter(c => _ctrState(c).pill).length : 0;
  document.querySelector('.cc-tab[data-tab="contracts"]')?.classList.toggle('cc-tab--dot', n > 0);
  return n;
}

/* ── the table ─────────────────────────────────────────────── */
function ctrRender() {
  const host = document.getElementById('tab-contracts');
  if (!host) return;
  const todo = _ctrDot();
  if (CTR.err && !CTR.loaded) { host.innerHTML = `<div class="ctr-wrap"><div class="ctr-empty">${_ctrE(CTR.err)}</div></div>`; return; }
  let year = 0;
  const rows = _ctrRows().map(c => {
    const st = _ctrState(c), k = st.k, amt = st.now.amount, f = _ctrFreq(c), py = _ctrPerYear(c, amt);
    year += py;
    const cost = amt > 0 ? `<b>${_ctrEur(amt)}</b><span>${f === 'need' ? 'as needed' : '/ ' + _ctrPer(c)}</span>` : '<b>—</b>';
    const who = k ? (k.provider || 'provider missing') : 'no contract';
    const next = st.pill ? _ctrPillHTML(st.pill) : st.next;
    return `<button type="button" class="ctr-tr" data-ctr="open" data-c="${_ctrE(c.id)}"><span class="ctr-c1"><b lang="de">${_ctrE(_ctrName(c))}</b><span>${_ctrE(who)}</span></span>` +
      `<span class="ctr-c2">${cost}</span><span class="ctr-c3${st.pill || !st.mu ? '' : ' mu'}">${next}</span></button>`;
  }).join('');
  host.innerHTML = `<div class="ctr-wrap">
    <div class="rp-hdr"><h1 class="cc-h1">Contracts</h1>${todo ? `<span class="ctr-chip">${todo} to do</span>` : ''}
      <button type="button" class="ctr-plus" data-ctr="new" aria-label="New contract"><i class="ti ti-plus" aria-hidden="true"></i></button></div>
    <div class="ctr-tbl"><div class="ctr-th"><span>Contract</span><span>Cost</span><span>Next</span></div>${rows || '<div class="ctr-empty">No cost types yet.</div>'}
      <div class="ctr-tf"><b>Total</b><span class="ctr-c2"><b>${_ctrEur(year)}</b><span>/ year</span></span><span class="ctr-c3">Ø ${_ctrEur(year / 12)}<br>/ month</span></div></div>
    <p class="ctr-foot">Rate (Properties) and Putzdienst · Gärtner · Winterdienst (Providers) stay in their apps.</p></div>`;
  if (CTR.open !== null) _ctrPaint();
}

/* ── the provider pop-up ───────────────────────────────────── */
function _ctrSheet() {
  let el = document.getElementById('ctrSheet');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'tn-overlay cc-sheet-ov'; el.id = 'ctrSheet';
  el.innerHTML = '<div class="tn-sheet" role="dialog" aria-modal="true" aria-label="Contract"></div>';
  el.addEventListener('click', e => { if (e.target === el && !CTR.form) ctrClose(); });
  el.addEventListener('click', _ctrClick);
  el.addEventListener('change', _ctrChange);
  document.body.appendChild(el);
  return el;
}
function ctrOpen(catId) {
  const el = _ctrSheet();
  if (!el.classList.contains('open') && typeof ccAnchorSet === 'function') ccAnchorSet();
  CTR.open = catId; CTR.form = ''; CTR.arg = null;
  _ctrPaint();
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function ctrClose() {
  const el = document.getElementById('ctrSheet'); if (!el) return;
  el.classList.remove('open');
  CTR.open = null; CTR.form = ''; CTR.arg = null; CTR.add = null;
  el.querySelector('.tn-sheet').innerHTML = '';
  if (!document.querySelector('.tn-overlay.open')) document.body.style.overflow = '';
  if (typeof ccAnchorRestore === 'function') ccAnchorRestore();
}
function _ctrPaint() {
  const el = document.getElementById('ctrSheet'); if (!el) return;
  const box = el.querySelector('.tn-sheet');
  const body = box.querySelector('.ctr-body'), y = body ? body.scrollTop : 0;
  box.innerHTML = CTR.open === 'new' ? _ctrNewHTML() : _ctrSheetHTML();
  const nb = box.querySelector('.ctr-body'); if (nb) nb.scrollTop = CTR.form ? y : 0;
}
const _ctrKV = (k, v) => `<div class="ctr-kv"><span>${_ctrE(k)}</span><b${v === '' || v === null || v === undefined ? ' class="e"' : ''}>${v === '' || v === null || v === undefined ? '—' : v}</b></div>`;
const _ctrBtn = (txt, act, extra = '', dk = false) => `<button type="button" class="ctr-b${dk ? ' dk' : ''}" data-ctr="${act}"${extra}>${txt}</button>`;
const _ctrSec = (title, btn, body, on) => `<div class="ctr-sec${on ? ' on' : ''}"><div class="ctr-sh2"><span class="ctr-sl">${title}</span>${btn || ''}</div>${body}</div>`;
const _ctrFoot = (save, del) => `<div class="ctr-ft">${del || ''}<button type="button" class="rm-btn rm-btn--ghost" data-ctr="fcancel">Cancel</button><button type="button" class="rm-btn rm-btn--primary" data-ctr="${save}">Save</button></div>`;
const _ctrSegH = (name, opts, cur) => `<div class="ctr-seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${_ctrE(v)}"${String(v) === String(cur) ? ' class="on"' : ''}>${_ctrE(l)}</button>`).join('')}</div>`;
const _ctrInp = (id, label, val, ph = '', cls = '', extra = '') => `<div><label class="ctr-fl" for="${id}">${label}</label><input class="ctr-in${cls ? ' ' + cls : ''}" id="${id}" type="text" value="${_ctrE(val ?? '')}" placeholder="${_ctrE(ph)}"${extra}></div>`;
const _ctrDateInp = (id, label, iso) => _ctrInp(id, label, iso ? _ctrF(iso) : '', 'TT.MM.JJJJ', '', ' inputmode="numeric" autocomplete="off"');
const _ctrMonInp = (id, label, iso) => _ctrInp(id, label, iso ? _ctrMY(iso) : '', 'MM.JJJJ', '', ' inputmode="numeric" autocomplete="off"');
const _ctrAmtInp = (id, label, v) => _ctrInp(id, label, v === null || v === undefined || v === '' ? '' : ccFmtNum(v, 2), '0,00', 'r', ' inputmode="decimal" autocomplete="off"');
const _ctrSel = (id, label, opts, cur) => `<div><label class="ctr-fl" for="${id}">${label}</label><select class="ctr-in" id="${id}">${opts.map(([v, l]) => `<option value="${_ctrE(v)}"${String(v) === String(cur) ? ' selected' : ''}>${_ctrE(l)}</option>`).join('')}</select></div>`;
const _ctrFileInp = (label) => `<label class="ctr-fl">${label}</label><label class="ctr-file"><i class="ti ti-upload" aria-hidden="true"></i><span data-file-name>Add PDF</span><input type="file" id="ctrFile" accept="application/pdf,.pdf"></label>`;

function _ctrReminderHTML(c, st) {
  const p = st.pill, k = st.k; if (!p || !k) return '';
  const R = (txt, a1, a2, red) => `<div class="ctr-rem${red ? ' red' : ''}"><p>${txt}</p><div class="ctr-ra">${a1}${a2}</div></div>`;
  const prov = _ctrE(k.provider || 'This contract');
  if (p.kind === 'nocontract') return R(`<b>No ${_ctrE(_ctrName(c))} from ${_ctrF(p.date)}.</b> ${prov} ends ${_ctrF(p.end)} and no next contract is set up.`,
    _ctrBtn('Not needed', 'act', ' data-a="notneeded"'), _ctrBtn('Add next contract', 'act', ' data-a="addnext"', true), true);
  if (p.kind === 'confirm') return R(`<b>No confirmation yet.</b> You cancelled on ${_ctrF(_ctrD(k.cancelled_on))}.`,
    _ctrBtn('Confirmed', 'act', ' data-a="confirmed"'), _ctrBtn('Add the letter', 'act', ' data-a="confirmdoc"', true));
  if (p.kind === 'cancelby') {
    const term = _ctrTerm(k);
    const txt = p.why === 'special' ? `<b>Special cancel right until ${_ctrF(p.date)}.</b> After the price increase you can leave without the usual notice.`
      : p.why === 'guarantee' ? `<b>The price guarantee ends ${_ctrF(p.date)}.</b> Prices can rise after that, a good moment to compare.`
      : `<b>Last day to cancel: ${_ctrF(p.date)}.</b> ` + (k.then_rule === 'renew' && term.until ? `If you keep it, it renews to ${_ctrF(_ctrAddM(term.until, _ctrN(k.renew_months)))}.` : k.then_rule === 'monthly' ? 'After that it runs on monthly.' : `It ends ${_ctrF(term.until)}.`);
    return R(txt, _ctrBtn('Keep', 'act', ` data-a="keep" data-d="${p.date}"`), _ctrBtn('Cancel contract', 'act', ' data-a="cancelform"', true));
  }
  if (p.kind === 'claim') return R(`<b>Claim your ${_ctrE(_ctrBonusAmt(p.b))} ${_ctrE(p.b.kind)}.</b> ${_ctrE(p.b.condition)}`,
    _ctrBtn('Skip', 'act', ` data-a="skip" data-b="${_ctrE(p.b.id)}"`),
    p.b.source === 'check24' ? _ctrBtn('Open CHECK24 ↗', 'act', ' data-a="check24"', true) : _ctrBtn('Claimed', 'act', ` data-a="claimed" data-b="${_ctrE(p.b.id)}"`, true));
  if (p.kind === 'late') return R(`<b>Did the ${_ctrE(_ctrBonusAmt(p.b))} ${_ctrE(p.b.kind)} arrive?</b> It was expected in ${_ctrMY(_ctrD(p.b.expected_on))}.`,
    _ctrBtn('Not coming', 'act', ` data-a="lost" data-b="${_ctrE(p.b.id)}"`),
    p.b.paid === 'bill' ? _ctrBtn('Received', 'act', ` data-a="billok" data-b="${_ctrE(p.b.id)}"`, true) : _ctrBtn('Confirm in Controlling ↗', 'act', ' data-a="controlling"', true));
  return '';
}

function _ctrSheetHTML() {
  const c = _ctrCat(CTR.open); if (!c) return '';
  const st = _ctrState(c), k = st.k, f = CTR.form;
  if (f === 'edit') return _ctrHeadHTML(c, st, true) + `<div class="ctr-body ctr-full">${_ctrEditHTML(c, k)}</div>`;
  const ed = !f ? _ctrBtn('Edit', 'form', ' data-f="edit"') : '';
  return _ctrHeadHTML(c, st, false, ed) + `<div class="ctr-body">${f ? '' : _ctrReminderHTML(c, st)}${_ctrPriceSec(c, st)}${_ctrDatesSec(c, st)}${k ? _ctrBonusSec(k) + _ctrDetailsSec(c, k) + _ctrDocsSec(k) : _ctrNoContractSec(c)}</div>`;
}
function _ctrHeadHTML(c, st, edit, ed = '') {
  const k = st.k;
  return `<div class="ctr-hd"><div class="ctr-hd-t"><div class="ctr-kk">${_ctrE(c.name)}${edit ? ' · edit' : ''}</div>` +
    `<div class="ctr-st${k && k.provider ? '' : ' mu'}">${_ctrE(k ? (k.provider || 'Provider not set') : 'No contract yet')}</div>` +
    (k && k.tariff ? `<div class="ctr-sub">${_ctrE(k.tariff)}</div>` : '') + (!edit && st.pill ? _ctrPillHTML(st.pill) : '') +
    `</div><div class="ctr-hb">${ed}<button type="button" class="ctr-x" data-ctr="${edit ? 'fcancel' : 'close'}" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div></div>`;
}

/* Price */
function _ctrPriceSec(c, st) {
  const on = CTR.form === 'price', now = st.now, f = _ctrFreq(c), dm = _ctrDue(c);
  const list = _ctrPeriods(c.id).slice().reverse();
  if (on) {
    const reason = CTR.arg || 'Preiserhöhung', korr = reason === 'Korrektur';
    return _ctrSec('Price · New price', '', _ctrKV('Now', now.amount ? _ctrEur(now.amount) + ' / ' + _ctrPer(c) : '—') +
      `<label class="ctr-fl">Reason</label>${_ctrSegH('reason', [['Preiserhöhung', 'Preiserhöhung'], ['Neuer Abschlag', 'Neuer Abschlag'], ['Korrektur', 'Korrektur']], reason)}` +
      (korr ? `<div class="ctr-2">${_ctrAmtInp('ctrPrAmt', 'Correct price €', now.amount)}<div></div></div><p class="ctr-hint">Korrektur only fixes a wrong amount, from the same month as before. Nothing new starts.</p>`
        : `<div class="ctr-2">${_ctrMonInp('ctrPrFrom', 'Gilt ab', '')}${_ctrAmtInp('ctrPrAmt', 'Price €', '')}</div>` +
          (reason === 'Preiserhöhung' ? `<div class="ctr-2">${_ctrDateInp('ctrPrSpec', 'Special cancel until', '')}<div></div></div>` : '') +
          (st.k && /strom|gas/i.test(c.name || '') ? `<div class="ctr-2">${_ctrAmtInp('ctrPrWork', 'Arbeitspreis ct/kWh', '')}${_ctrAmtInp('ctrPrBase', 'Grundpreis €/month', '')}</div>` : '') +
          _ctrFileInp('Letter (PDF, optional)') +
          `<p class="ctr-hint">Gilt ab is the month the new amount is for, the way you book it in Controlling. Earlier months keep their price.</p>`) +
      _ctrFoot('saveprice'), true);
  }
  const since = now.row && _ctrD(now.row.valid_from) > '2000-01-01' ? _ctrMY(_ctrD(now.row.valid_from)) : 'start';
  const py = _ctrPerYear(c, now.amount);
  const hist = list.filter(h => _ctrD(h.valid_from) > '2000-01-01').slice(0, 4).map((h, i) => {
    const prev = list[i + 1];
    return `<div><span>${_ctrMY(_ctrD(h.valid_from))}${h.reason ? ' · ' + _ctrE(h.reason) : ''}</span><span>${prev ? _ctrEur(prev.amount) + ' → ' : ''}${_ctrEur(h.amount)}</span></div>`;
  }).join('');
  return _ctrSec('Price', _ctrBtn('New price', 'form', ' data-f="price"'),
    _ctrKV('Now', now.amount ? _ctrEur(now.amount) + (f === 'need' ? ' · as needed' : ' / ' + _ctrPer(c)) : '') +
    _ctrKV('Since', since) +
    (f !== 'month' && dm.length ? _ctrKV('Due in', dm.map(m => CTR_MON_L[m - 1]).join(' · ')) : '') +
    (py ? _ctrKV('Per year', _ctrEur(py)) : '') +
    (hist ? `<div class="ctr-hist">${hist}</div>` : ''));
}

/* Dates */
function _ctrDatesSec(c, st) {
  const k = st.k; if (!k) return '';
  const term = _ctrTerm(k), on = CTR.form === 'cancel';
  if (on) {
    const t = _ctrT();
    let ends = term.until && k.then_rule !== 'monthly' ? term.until : null;
    if (!ends && _ctrCancellable(k.notice)) { const e = _ctrNotice(t, k.notice, 1); ends = _ctrAddD(_ctrAddM(e.slice(0, 7) + '-01', 1), -1); }
    const conf = CTR.arg || 'waiting';
    return _ctrSec('Dates · Cancel contract', '', _ctrKV('Notice', _ctrNoticeLbl(k.notice) + (term.anyMonth ? ' · any month' : term.cancelBy ? ' · by ' + _ctrF(term.cancelBy) : '')) +
      `<div class="ctr-2">${_ctrDateInp('ctrCnOn', 'Cancelled on', t)}${_ctrDateInp('ctrCnEnd', 'Ends on', ends)}</div>` +
      `<label class="ctr-fl">Confirmation</label>${_ctrSegH('conf', [['waiting', 'Waiting'], ['received', 'Received']], conf)}` +
      _ctrFileInp('Letter (PDF, optional)') +
      `<p class="ctr-hint">Controlling counts this contract until the end month. Add the next contract with + so the cost goes on.</p>` +
      _ctrFoot('savecancel'), true);
  }
  let rows;
  if (k.cancelled_on) {
    rows = _ctrKV('Start', _ctrF(_ctrD(k.starts_on))) + _ctrKV('Cancelled on', _ctrF(_ctrD(k.cancelled_on))) + _ctrKV('Ends on', _ctrF(_ctrD(k.ends_on))) +
      _ctrKV('Confirmation', k.cancel_confirmed_on ? 'received ' + _ctrF(_ctrD(k.cancel_confirmed_on)) : 'waiting') +
      `<button type="button" class="ctr-lnk" data-ctr="act" data-a="withdraw">Undo the cancellation</button>`;
  } else {
    const can = k.notice === 'none' ? "can't be cancelled" : term.anyMonth ? 'any month' : term.cancelBy ? 'by ' + _ctrF(term.cancelBy) : '';
    rows = _ctrKV('Start', _ctrF(_ctrD(k.starts_on))) +
      (k.min_months ? _ctrKV('Minimum', k.min_months + ' months' + (term.minEnd ? ' · until ' + _ctrF(term.minEnd) : '')) : '') +
      (k.notice === 'none' ? '' : _ctrKV('Runs until', term.until && !(k.then_rule === 'monthly' && term.until <= _ctrT()) ? _ctrF(term.until) : (k.then_rule === 'monthly' ? 'open-ended' : ''))) +
      (k.notice === 'none' ? '' : _ctrKV('Notice', k.notice === 'unknown' ? '' : _ctrNoticeLbl(k.notice))) +
      (k.then_rule === 'renew' ? _ctrKV('Then', 'renews by ' + (k.renew_months || 12) + ' months') : '') +
      _ctrKV('You can cancel', can) +
      (k.price_fixed_until ? _ctrKV('Price fixed until', _ctrF(_ctrD(k.price_fixed_until)) + (_ctrD(k.price_fixed_until) < _ctrT() ? ' · ended' : '')) : '') +
      (k.next_reading ? _ctrKV('Next meter reading', _ctrF(_ctrD(k.next_reading))) : '');
  }
  const btn = !k.cancelled_on && _ctrCancellable(k.notice) ? _ctrBtn('Cancel', 'form', ' data-f="cancel"') : '';
  return _ctrSec('Dates', btn, rows);
}

/* Bonus */
function _ctrBonusLine(b) {
  const from = b.source === 'check24' ? 'CHECK24' : b.source === 'other' ? 'other' : 'provider';
  const paid = b.paid === 'bill' ? 'on the bill' : b.paid === 'points' ? 'points' : 'to your account';
  const when = b.status === 'open' || b.status === 'claimed' ? (b.expected_on ? 'expected ' + _ctrMY(_ctrD(b.expected_on)) : (b.condition ? _ctrE(b.condition) : '')) : '';
  return [from, paid, when].filter(Boolean).join(' · ');
}
function _ctrBonusChip(b) {
  const lbl = { open: 'Open', claimed: 'Claimed', received: b.paid === 'points' ? 'Confirmed' : 'Received', skipped: 'Skipped', lost: 'Not coming' }[b.status] || b.status;
  const cls = b.status === 'received' ? 'ok' : b.status === 'open' || b.status === 'claimed' ? '' : 'g';
  return `<span class="ctr-chip${cls ? ' ' + cls : ''}">${_ctrE(lbl)}${b.status_on && b.status !== 'open' ? ' ' + _ctrFS(_ctrD(b.status_on)) : ''}</span>`;
}
function _ctrBonusSec(k) {
  const on = CTR.form === 'bonus', list = _ctrBonsOf(k);
  if (on) {
    const b = CTR.arg ? list.find(x => _ctrId(x.id) === _ctrId(CTR.arg)) : null;
    const kind = b ? b.kind : 'Cashback', pts = kind === 'Punkte' || (b && b.paid === 'points');
    const del = b ? `<button type="button" class="ctr-del" data-ctr="delbonus" data-b="${_ctrE(b.id)}">Delete</button>` : '';
    return _ctrSec(b ? 'Bonus · Edit' : 'Bonus · Add', '',
      `<div class="ctr-2">${_ctrSel('ctrBoKind', 'Type', CTR_BONUS_KINDS.map(x => [x, x]).concat(b && !CTR_BONUS_KINDS.includes(b.kind) ? [[b.kind, b.kind]] : []), kind)}` +
      (pts ? _ctrInp('ctrBoPts', 'Points', b ? b.points : '', '0', 'r', ' inputmode="numeric"') : _ctrAmtInp('ctrBoAmt', 'Amount €', b ? b.amount : '')) + `</div>` +
      `<label class="ctr-fl">From</label>${_ctrSegH('bsrc', [['provider', 'Provider'], ['check24', 'CHECK24'], ['other', 'Other']], b ? b.source : 'check24')}` +
      (pts ? '' : `<label class="ctr-fl">Paid</label>${_ctrSegH('bpaid', [['bill', 'On the bill'], ['account', 'To your account']], b ? b.paid : 'account')}`) +
      `<div class="ctr-2">${_ctrMonInp('ctrBoExp', 'Expected', b ? _ctrD(b.expected_on) : '')}${_ctrSel('ctrBoNk', 'In NK', [['0', 'No'], ['1', 'Yes']], b && b.in_nk ? '1' : '0')}</div>` +
      _ctrInp('ctrBoCond', 'What you need to do (optional)', b ? b.condition : '', 'e.g. upload the first bill') +
      (b ? `<label class="ctr-fl">Status</label>${_ctrSegH('bstat', [['open', 'Open'], ['claimed', 'Claimed'], ['received', 'Received'], ['lost', 'Not coming']], b.status === 'skipped' ? 'lost' : b.status)}` : '') +
      `<p class="ctr-hint">Paid to your account: you confirm it in Controlling once the money is in. On the bill: it's already in the Jahresabrechnung.</p>` +
      _ctrFoot('savebonus', del), true);
  }
  const rows = list.map(b => `<div class="ctr-bo" data-ctr="form" data-f="bonus" data-b="${_ctrE(b.id)}"><span class="t"><b>${_ctrE(b.kind)}</b><span>${_ctrBonusLine(b)}</span></span><span class="a">${_ctrE(_ctrBonusAmt(b))}<br>${_ctrBonusChip(b)}</span></div>`).join('');
  const openAcc = list.some(b => b.paid === 'account' && (b.status === 'open' || b.status === 'claimed'));
  return _ctrSec('Bonus', _ctrBtn('+ Add', 'form', ' data-f="bonus"'),
    (rows || '<div class="ctr-sm">No bonus noted.</div>') + (openAcc ? `<button type="button" class="ctr-lnk" data-ctr="act" data-a="controlling">Confirm in Controlling once it's in ↗</button>` : ''));
}

/* Details */
function _ctrDetailsSec(c, k) {
  const nk = c.nk_key === 'none' ? 'not in NK' : (c.nk_key === 'flaeche' ? 'by area' : 'by person') + (c.nk_key === 'none' ? '' : ' · ' + (c.nk_spread === 'year' ? 'over the year' : 'in its month'));
  const bv = [k.booked_via, k.booking_no].filter(Boolean).join(' · ');
  return _ctrSec('Details', '', _ctrKV('Holder', _ctrE(k.holder)) + _ctrKV('Customer no.', _ctrE(k.customer_no)) + _ctrKV('Contract no.', _ctrE(k.contract_no)) +
    _ctrKV('Meter no.', _ctrE(k.meter_no)) + (k.malo_id || /strom|gas/i.test(c.name || '') ? _ctrKV('MaLo-ID', _ctrE(k.malo_id)) : '') +
    _ctrKV('Booked via', _ctrE(bv)) + _ctrKV('Phone', _ctrE(k.phone)) + _ctrKV('Email', _ctrE(k.email)) + _ctrKV('Portal', _ctrE(k.portal)) +
    _ctrKV('NK-Abrechnung', nk) + (k.note ? `<div class="ctr-sm">${_ctrE(k.note)}</div>` : ''));
}

/* Documents */
function _ctrDocsSec(k) {
  const on = CTR.form === 'doc', list = _ctrDocsOf(k);
  if (on) {
    return _ctrSec('Documents · Add PDF', '', `<label class="ctr-fl">Kind</label>${_ctrSegH('dkind', CTR_DOC_KINDS.slice(0, 4), CTR.arg || 'contract')}` +
      _ctrFileInp('File') + _ctrFoot('savedoc'), true);
  }
  const lbl = v => (CTR_DOC_KINDS.find(x => x[0] === v) || CTR_DOC_KINDS[4])[1];
  const rows = list.map(d => `<div class="ctr-doc"><button type="button" class="o" data-ctr="opendoc" data-d="${_ctrE(d.id)}" data-cc-pdf><span class="ic"><i class="ti ti-file-text" aria-hidden="true"></i></span>` +
    `<span class="t"><b>${_ctrE(d.name || 'Document')}</b><span>${_ctrE(lbl(d.kind))} · ${_ctrF(ccDayOf(d.created_at))}</span></span></button>` +
    `<button type="button" class="del" data-ctr="deldoc" data-d="${_ctrE(d.id)}" aria-label="Delete"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join('');
  return _ctrSec('Documents', _ctrBtn('+ PDF', 'form', ' data-f="doc"'), rows || '<div class="ctr-sm">No documents yet.</div>');
}

function _ctrNoContractSec(c) {
  return _ctrSec('Contract', _ctrBtn('+ Add contract', 'act', ' data-a="addnext"'),
    `<div class="ctr-sm">No contract for ${_ctrE(c.name)} yet. Add one when you have it, then its dates and reminders show up here.</div>`);
}

/* Edit (the whole pop-up) */
function _ctrEditHTML(c, k) {
  const f = c.frequency || 'monatlich', dm = _ctrDue(c);
  const kHTML = !k ? '' :
    `<div class="ctr-fs">Provider</div><div class="ctr-2">${_ctrInp('eProv', 'Name', k.provider)}${_ctrInp('eTariff', 'Tariff', k.tariff, 'optional')}</div>` +
    `<div class="ctr-2">${_ctrInp('eHolder', 'Holder', k.holder, 'optional')}${_ctrInp('eVia', 'Booked via', k.booked_via, 'e.g. CHECK24')}</div>` +
    `<div class="ctr-2">${_ctrInp('eViaNo', 'Its number', k.booking_no, 'optional')}<div></div></div>` +
    `<div class="ctr-fs">Numbers</div><div class="ctr-2">${_ctrInp('eCust', 'Customer no.', k.customer_no, 'optional')}${_ctrInp('eNo', 'Contract / policy no.', k.contract_no, 'optional')}</div>` +
    `<div class="ctr-2">${_ctrInp('eMeter', 'Meter no.', k.meter_no, 'optional')}${_ctrInp('eMalo', 'MaLo-ID', k.malo_id, 'optional')}</div>` +
    `<div class="ctr-fs">Contact</div><div class="ctr-2">${_ctrInp('ePhone', 'Phone', k.phone, 'optional', '', ' inputmode="tel"')}${_ctrInp('eMail', 'Email', k.email, 'optional', '', ' inputmode="email"')}</div>` +
    _ctrInp('ePortal', 'Portal', k.portal, 'optional') +
    `<div class="ctr-fs">Dates</div><div class="ctr-2">${_ctrDateInp('eStart', 'Start', _ctrD(k.starts_on))}${_ctrInp('eMin', 'Minimum (months)', k.min_months, 'optional', 'r', ' inputmode="numeric"')}</div>` +
    `<div class="ctr-2">${_ctrDateInp('eUntil', 'Runs until', _ctrD(k.runs_until))}${_ctrSel('eNotice', 'Notice', CTR_NOTICE, k.notice || 'unknown')}</div>` +
    `<label class="ctr-fl">Then</label>${_ctrSegH('then', [['renew', 'Renews'], ['monthly', 'Monthly'], ['ends', 'Ends'], ['unknown', 'Not sure']], k.then_rule || 'unknown')}` +
    `<div class="ctr-2">${_ctrInp('eRenew', 'Renews by (months)', k.renew_months || (k.then_rule === 'renew' ? 12 : ''), '12', 'r', ' inputmode="numeric"')}${_ctrDateInp('eFixed', 'Price fixed until', _ctrD(k.price_fixed_until))}</div>` +
    `<div class="ctr-2">${_ctrDateInp('eRead', 'Next meter reading', _ctrD(k.next_reading))}<div></div></div>`;
  return kHTML +
    `<div class="ctr-fs">Cost · ${_ctrE(c.name)}</div>` +
    `<div class="ctr-2">${_ctrSel('eFreq', 'Rhythm', CTR_FREQ, CTR_FREQ.some(x => x[0] === f) ? f : 'monatlich')}<div></div></div>` +
    `<label class="ctr-fl">Due in (empty = every month)</label><div class="ctr-mons" data-mons>${CTR_MON.map((m, i) => `<button type="button" data-m="${i + 1}"${dm.includes(i + 1) ? ' class="on"' : ''}>${m}</button>`).join('')}</div>` +
    `<label class="ctr-fl">NK-Abrechnung · split</label>${_ctrSegH('nkkey', [['personen', 'By person'], ['flaeche', 'By area'], ['none', 'Not in NK']], c.nk_key || 'personen')}` +
    `<label class="ctr-fl">NK-Abrechnung · booking</label>${_ctrSegH('nkspread', [['month', 'In its month'], ['year', 'Over the year']], c.nk_spread || 'month')}` +
    (k ? `<label class="ctr-fl" for="eNote">Note</label><textarea class="ctr-in" id="eNote" placeholder="anything else">${_ctrE(k.note || '')}</textarea>` : '') +
    `<p class="ctr-hint">The price changes with New price, so past months stay right.</p>` +
    _ctrFoot('saveedit', k ? `<button type="button" class="ctr-del" data-ctr="delcontract">Delete contract</button>` : '');
}

/* New contract (from + or "Add next contract") */
function _ctrNewHTML() {
  const a = CTR.add || {}, cats = _ctrRows();
  const cur = a.catId ? _ctrCat(a.catId) : null;
  const opts = cats.map(c => [c.id, c.name]).concat([['__new', '+ New cost type']]);
  const isNew = a.catId === '__new';
  const now = cur ? _ctrNow(cur) : { amount: null };
  return `<div class="ctr-hd"><div class="ctr-hd-t"><div class="ctr-kk">Contracts</div><div class="ctr-st">New contract</div><div class="ctr-sub">for Casa Castel</div></div>` +
    `<div class="ctr-hb"><button type="button" class="ctr-x" data-ctr="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div></div>` +
    `<div class="ctr-body ctr-full"><div class="ctr-fs">What</div>` +
    `<div class="ctr-2">${_ctrSel('nCat', 'Cost type', [['', 'choose']].concat(opts), a.catId || '')}${_ctrInp('nProv', 'Provider', a.provider || '', 'name')}</div>` +
    (isNew ? `<div class="ctr-2">${_ctrInp('nName', 'New cost type', '', 'e.g. Haftpflicht')}${_ctrSel('nFreq', 'Rhythm', CTR_FREQ, 'monatlich')}</div>` : '') +
    _ctrInp('nTariff', 'Tariff', '', 'optional') +
    `<div class="ctr-fs">Price</div><div class="ctr-2">${_ctrAmtInp('nAmt', 'Price €', isNew ? '' : (now.amount || ''))}${_ctrMonInp('nFrom', 'From', a.start || '')}</div>` +
    (cur ? `<p class="ctr-hint">Now ${now.amount ? _ctrEur(now.amount) + ' / ' + _ctrPer(cur) : 'no price'}. A different price starts from the month above; earlier months keep theirs.</p>` : '') +
    `<div class="ctr-fs">Dates</div><div class="ctr-2">${_ctrDateInp('nStart', 'Start', a.start || '')}${_ctrDateInp('nUntil', 'Runs until', '')}</div>` +
    `<div class="ctr-2">${_ctrSel('nNotice', 'Notice', CTR_NOTICE, '1m')}${_ctrInp('nMin', 'Minimum (months)', '', 'optional', 'r', ' inputmode="numeric"')}</div>` +
    `<label class="ctr-fl">Then</label>${_ctrSegH('then', [['renew', 'Renews'], ['monthly', 'Monthly'], ['ends', 'Ends'], ['unknown', 'Not sure']], 'monthly')}` +
    `<div class="ctr-fs">Numbers</div><div class="ctr-2">${_ctrInp('nCust', 'Customer no.', '', 'optional')}${_ctrInp('nMeter', 'Meter no.', '', 'optional')}</div>` +
    `<div class="ctr-2">${_ctrInp('nVia', 'Booked via', '', 'e.g. CHECK24')}${_ctrInp('nViaNo', 'Its number', '', 'optional')}</div>` +
    _ctrFileInp('Contract (PDF, optional)') +
    `<p class="ctr-hint">Bonuses and more details can be added after saving.</p>` +
    `<div class="ctr-ft"><button type="button" class="rm-btn rm-btn--ghost" data-ctr="close">Cancel</button><button type="button" class="rm-btn rm-btn--primary" data-ctr="savenew">Save</button></div></div>`;
}

/* ── events ────────────────────────────────────────────────── */
document.addEventListener('click', e => {
  const t = e.target.closest('#tab-contracts [data-ctr]'); if (!t) return;
  if (t.dataset.ctr === 'open') ctrOpen(t.dataset.c);
  else if (t.dataset.ctr === 'new') { CTR.add = {}; ctrOpen('new'); }
});
function _ctrSegVal(name) { const b = document.querySelector(`#ctrSheet [data-seg="${name}"] button.on`); return b ? b.dataset.v : null; }
const _ctrVal = id => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
function _ctrChange(e) {
  if (e.target.id === 'ctrFile') {
    const f = e.target.files && e.target.files[0];
    const span = e.target.closest('.ctr-file')?.querySelector('[data-file-name]');
    if (span) span.textContent = f ? f.name : 'Add PDF';
  }
  if (e.target.id === 'ctrBoKind') {           // points ⇄ amount: swap just that field
    const pts = e.target.value === 'Punkte';
    if (pts !== !!document.getElementById('ctrBoPts')) _ctrSwapPts(pts);
  }
  if (e.target.id === 'nCat') { CTR.add = Object.assign({}, CTR.add || {}, { catId: e.target.value }); _ctrPaint(); }
}
function _ctrSwapPts(pts) {
  const s = document.getElementById('ctrBoKind'); if (!s) return;
  const cell = s.closest('.ctr-2').children[1];
  cell.outerHTML = pts ? _ctrInp('ctrBoPts', 'Points', '', '0', 'r', ' inputmode="numeric"') : _ctrAmtInp('ctrBoAmt', 'Amount €', '');
}
async function _ctrClick(e) {
  const seg = e.target.closest('#ctrSheet .ctr-seg button');
  if (seg) {
    seg.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === seg));
    if (seg.parentElement.dataset.seg === 'reason') { CTR.arg = seg.dataset.v; _ctrPaint(); }
    return;
  }
  const mon = e.target.closest('#ctrSheet [data-mons] button');
  if (mon) { mon.classList.toggle('on'); return; }
  const t = e.target.closest('#ctrSheet [data-ctr]'); if (!t || CTR.busy) return;
  const a = t.dataset.ctr;
  if (a === 'close') return ctrClose();
  if (a === 'form') { CTR.form = t.dataset.f; CTR.arg = t.dataset.b || null; return _ctrPaint(); }
  if (a === 'fcancel') { CTR.form = ''; CTR.arg = null; return _ctrPaint(); }
  if (a === 'opendoc') return _ctrOpenDoc(t.dataset.d);
  const run = {
    act: () => _ctrAct(t.dataset.a, t.dataset),
    saveprice: _ctrSavePrice, savecancel: _ctrSaveCancel, savebonus: _ctrSaveBonus, savedoc: _ctrSaveDoc,
    saveedit: _ctrSaveEdit, savenew: _ctrSaveNew,
    delbonus: () => _ctrDelBonus(t.dataset.b), deldoc: () => _ctrDelDoc(t.dataset.d), delcontract: _ctrDelContract,
  }[a];
  if (!run) return;
  CTR.busy = true;
  try { await run(); }
  catch (err) { console.error('[contracts]', a, err); if (typeof ccSaveFailed === 'function') ccSaveFailed(err, 'contract'); else ccToast('Could not save – please try again', true); }
  finally { CTR.busy = false; }
}
/* after any change: fresh data, back to the read view inside the pop-up */
async function _ctrAfter(msg) {
  await _ctrFetch();
  CTR.form = ''; CTR.arg = null;
  ctrRender();
  if (CTR.open !== null) _ctrPaint();
  if (msg && typeof ccSavedToast === 'function') ccSavedToast(msg);
}
const _ctrQ = (r, what) => { if (r && r.error) throw r.error; return r ? r.data : null; };

async function _ctrAct(act, ds) {
  const c = _ctrCat(CTR.open), st = c ? _ctrState(c) : null, k = st ? st.k : null, t = _ctrT();
  if (act === 'check24') { window.open('https://www.check24.de/', '_blank'); return; }
  if (act === 'controlling') { try { sessionStorage.setItem('ctl_open', 'casa-oneoff'); } catch (e) {} location.href = 'controlling.html'; return; }
  if (act === 'cancelform') { CTR.form = 'cancel'; CTR.arg = null; return _ctrPaint(); }
  if (act === 'confirmdoc') { CTR.form = 'doc'; CTR.arg = 'confirmation'; return _ctrPaint(); }
  if (act === 'addnext') {
    const end = k ? _ctrEnd(k) : null;
    CTR.add = { catId: c ? c.id : '', start: end ? _ctrAddD(end, 1) : '' };
    CTR.open = 'new'; CTR.form = ''; return _ctrPaint();
  }
  if (!k) return;
  const upd = f => sbL.from('house_contracts').update(f).eq('id', k.id);
  const updB = (id, f) => sbL.from('house_contract_bonuses').update(f).eq('id', id);
  if (act === 'keep') { _ctrQ(await upd({ kept_cancel_by: ds.d })); return _ctrAfter('Kept · reminder gone'); }
  if (act === 'notneeded') { _ctrQ(await upd({ no_successor: true })); return _ctrAfter('Noted · no next contract needed'); }
  if (act === 'confirmed') { _ctrQ(await upd({ cancel_confirmed_on: t })); return _ctrAfter('Confirmation noted'); }
  if (act === 'withdraw') {
    const ok = typeof ccConfirm === 'function' ? await ccConfirm('Undo the cancellation?', 'The contract runs on as before.', 'Undo') : true;
    if (!ok) return;
    _ctrQ(await upd({ cancelled_on: null, ends_on: null, cancel_confirmed_on: null })); return _ctrAfter('Cancellation undone');
  }
  if (act === 'skip') { _ctrQ(await updB(ds.b, { status: 'skipped', status_on: t })); return _ctrAfter('Skipped · reminder gone'); }
  if (act === 'lost') { _ctrQ(await updB(ds.b, { status: 'lost', status_on: t })); return _ctrAfter('Marked as not coming'); }
  if (act === 'claimed') { _ctrQ(await updB(ds.b, { status: 'claimed', status_on: t })); return _ctrAfter('Marked as claimed'); }
  if (act === 'billok') { _ctrQ(await updB(ds.b, { status: 'received', status_on: t })); return _ctrAfter('Marked as received'); }
}

/* New price */
async function _ctrSavePrice() {
  const c = _ctrCat(CTR.open); if (!c) return;
  const k = _ctrMain(c.id), reason = _ctrSegVal('reason') || 'Preiserhöhung';
  const amt = ccParseEUR(_ctrVal('ctrPrAmt'));
  if (amt === null || amt < 0) { ccToast('Enter the price', true); return; }
  const list = _ctrPeriods(c.id);
  if (reason === 'Korrektur') {
    const now = _ctrNow(c);
    if (now.row) _ctrQ(await sbL.from('ctrl_castel_amount_history').update({ amount: _ctrR(amt) }).eq('id', now.row.id));
    else _ctrQ(await sbL.from('ctrl_castel_categories').update({ default_amount: _ctrR(amt) }).eq('id', c.id));
    return _ctrAfter('Price corrected');
  }
  const from = _ctrParseMonth(_ctrVal('ctrPrFrom'));
  if (!from) { ccToast('Gilt ab: MM.JJJJ', true); return; }
  if (list.some(h => _ctrD(h.valid_from) === from)) { ccToast('There is already a price from ' + _ctrMY(from) + ' – use Korrektur', true); return; }
  const spec = _ctrDateInSafe('ctrPrSpec'); if (spec === false) return;
  const letter = await _ctrUpload(k, 'price');
  if (letter === false) return;
  if (!list.length)                              // keep every month before it at today's price
    _ctrQ(await sbL.from('ctrl_castel_amount_history').insert({ category_id: c.id, valid_from: '2000-01-01', amount: _ctrR(_ctrN(c.default_amount)), reason: 'Start' }));
  const row = { category_id: c.id, valid_from: from, amount: _ctrR(amt), reason, contract_id: k ? k.id : null };
  if (spec) row.special_cancel_until = spec;
  if (letter) row.letter_path = letter;
  const w = ccParseEUR(_ctrVal('ctrPrWork')), g = ccParseEUR(_ctrVal('ctrPrBase'));
  if (w !== null) row.work_price = w;
  if (g !== null) row.base_price = g;
  _ctrQ(await sbL.from('ctrl_castel_amount_history').insert(row));
  return _ctrAfter('New price from ' + _ctrMY(from));
}
function _ctrDateInSafe(id) {
  const v = _ctrVal(id); if (!v) return null;
  const iso = ccParseDate(v); if (!iso) { ccToast('Date: TT.MM.JJJJ', true); return false; }
  return iso;
}

/* Cancel */
async function _ctrSaveCancel() {
  const c = _ctrCat(CTR.open), k = c ? _ctrMain(c.id) : null; if (!k) return;
  const on = _ctrDateInSafe('ctrCnOn'), end = _ctrDateInSafe('ctrCnEnd');
  if (on === false || end === false) return;
  if (!on || !end) { ccToast('Enter both dates', true); return; }
  const letter = await _ctrUpload(k, 'cancellation'); if (letter === false) return;
  const conf = _ctrSegVal('conf') === 'received';
  _ctrQ(await sbL.from('house_contracts').update({ cancelled_on: on, ends_on: end, cancel_confirmed_on: conf ? _ctrT() : null, no_successor: false }).eq('id', k.id));
  return _ctrAfter('Cancelled · ends ' + _ctrF(end));
}

/* Bonus */
async function _ctrSaveBonus() {
  const c = _ctrCat(CTR.open), k = c ? _ctrMain(c.id) : null; if (!k) return;
  const b = CTR.arg ? CTR.bons.find(x => _ctrId(x.id) === _ctrId(CTR.arg)) : null;
  const kind = _ctrVal('ctrBoKind') || 'Bonus', pts = kind === 'Punkte';
  const row = { kind, source: _ctrSegVal('bsrc') || 'check24', in_nk: _ctrVal('ctrBoNk') === '1', condition: _ctrVal('ctrBoCond') || null };
  if (pts) { const p = parseInt(_ctrVal('ctrBoPts'), 10); if (!(p > 0)) { ccToast('Enter the points', true); return; } row.points = p; row.amount = null; row.paid = 'points'; }
  else { const a = ccParseEUR(_ctrVal('ctrBoAmt')); if (a === null || a <= 0) { ccToast('Enter the amount', true); return; } row.amount = _ctrR(a); row.points = null; row.paid = _ctrSegVal('bpaid') || 'account'; }
  const ex = _ctrVal('ctrBoExp');
  if (ex) { const m = _ctrParseMonth(ex); if (!m) { ccToast('Expected: MM.JJJJ', true); return; } row.expected_on = m; } else row.expected_on = null;
  if (b) {
    const s = _ctrSegVal('bstat') || b.status;
    if (s !== b.status) { row.status = s; row.status_on = _ctrT(); }
    _ctrQ(await sbL.from('house_contract_bonuses').update(row).eq('id', b.id));
    return _ctrAfter('Bonus saved');
  }
  row.contract_id = k.id; row.status = 'open';
  _ctrQ(await sbL.from('house_contract_bonuses').insert(row));
  return _ctrAfter('Bonus added');
}
async function _ctrDelBonus(id) {
  const ok = typeof ccConfirm === 'function' ? await ccConfirm('Delete this bonus?', 'It is removed from the contract.', 'Delete', true) : true;
  if (!ok) return;
  _ctrQ(await sbL.from('house_contract_bonuses').delete().eq('id', id));
  return _ctrAfter('Bonus deleted');
}

/* Documents */
async function _ctrUpload(k, kind) {         // → storage path, null (no file) or false (failed)
  const input = document.getElementById('ctrFile');
  const f = input && input.files && input.files[0];
  if (!f) return null;
  if (!k) { ccToast('Add the contract first, then its PDFs', true); return false; }
  if (!/pdf$/i.test(f.type || '') && !/\.pdf$/i.test(f.name || '')) { ccToast('Please choose a PDF', true); return false; }
  const safe = String(f.name || 'document.pdf').replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = k.id + '/' + Date.now() + '-' + safe;
  const up = await sbL.storage.from(CTR_BUCKET).upload(path, f, { contentType: 'application/pdf', upsert: false });
  if (up && up.error) { console.error('[contracts] upload', up.error); ccToast('The PDF could not be uploaded', true); return false; }
  _ctrQ(await sbL.from('house_contract_docs').insert({ contract_id: k.id, kind, name: f.name || safe, path }));
  return path;
}
async function _ctrSaveDoc() {
  const c = _ctrCat(CTR.open), k = c ? _ctrMain(c.id) : null; if (!k) return;
  if (!document.getElementById('ctrFile')?.files?.[0]) { ccToast('Choose a PDF first', true); return; }
  const p = await _ctrUpload(k, _ctrSegVal('dkind') || 'other');
  if (p === false) return;
  return _ctrAfter('PDF added');
}
async function _ctrOpenDoc(id) {
  const d = CTR.docs.find(x => _ctrId(x.id) === _ctrId(id)); if (!d) return;
  const { data, error } = await sbL.storage.from(CTR_BUCKET).createSignedUrl(d.path, 300);
  if (error || !data || !data.signedUrl) {
    if (typeof _ccCloseWaitingTab === 'function') _ccCloseWaitingTab();
    ccToast('Could not open the document', true); return;
  }
  if (typeof ccOpenUrl === 'function') ccOpenUrl(data.signedUrl, d.name || 'Document'); else window.open(data.signedUrl, '_blank');
}
async function _ctrDelDoc(id) {
  const d = CTR.docs.find(x => _ctrId(x.id) === _ctrId(id)); if (!d) return;
  const ok = typeof ccConfirm === 'function' ? await ccConfirm('Delete this PDF?', _ctrE(d.name || ''), 'Delete', true) : true;
  if (!ok) return;
  await sbL.storage.from(CTR_BUCKET).remove([d.path]);
  _ctrQ(await sbL.from('house_contract_docs').delete().eq('id', d.id));
  return _ctrAfter('PDF deleted');
}

/* Edit */
async function _ctrSaveEdit() {
  const c = _ctrCat(CTR.open); if (!c) return;
  const k = _ctrMain(c.id);
  const dms = [...document.querySelectorAll('#ctrSheet [data-mons] button.on')].map(b => +b.dataset.m);
  const freq = _ctrVal('eFreq') || c.frequency || 'monatlich';
  const catRow = { frequency: freq, due_months: dms.length ? dms : null, nk_key: _ctrSegVal('nkkey') || c.nk_key || 'personen', nk_spread: _ctrSegVal('nkspread') || c.nk_spread || 'month' };
  if (k) {
    const d = {};
    for (const [id, f] of [['eStart', 'starts_on'], ['eUntil', 'runs_until'], ['eFixed', 'price_fixed_until'], ['eRead', 'next_reading']]) {
      const v = _ctrDateInSafe(id); if (v === false) return; d[f] = v;
    }
    const intOr = v => { const n = parseInt(v, 10); return n > 0 ? n : null; };
    const then = _ctrSegVal('then') || 'unknown';
    const row = Object.assign(d, {
      provider: _ctrVal('eProv') || null, tariff: _ctrVal('eTariff') || null, holder: _ctrVal('eHolder') || null,
      booked_via: _ctrVal('eVia') || null, booking_no: _ctrVal('eViaNo') || null, customer_no: _ctrVal('eCust') || null,
      contract_no: _ctrVal('eNo') || null, meter_no: _ctrVal('eMeter') || null, malo_id: _ctrVal('eMalo') || null,
      phone: _ctrVal('ePhone') || null, email: _ctrVal('eMail') || null, portal: _ctrVal('ePortal') || null,
      min_months: intOr(_ctrVal('eMin')), notice: _ctrVal('eNotice') || 'unknown', then_rule: then,
      renew_months: then === 'renew' ? (intOr(_ctrVal('eRenew')) || 12) : null, note: _ctrVal('eNote') || null,
    });
    _ctrQ(await sbL.from('house_contracts').update(row).eq('id', k.id));
  }
  _ctrQ(await sbL.from('ctrl_castel_categories').update(catRow).eq('id', c.id));
  return _ctrAfter('Saved');
}
async function _ctrDelContract() {
  const c = _ctrCat(CTR.open), k = c ? _ctrMain(c.id) : null; if (!k) return;
  const ok = typeof ccConfirm === 'function' ? await ccConfirm('Delete this contract?', 'Its dates, bonuses and PDFs are no longer shown. Prices in Controlling stay.', 'Delete', true) : true;
  if (!ok) return;
  _ctrQ(await sbL.from('house_contracts').update({ deleted_at: new Date().toISOString() }).eq('id', k.id));
  return _ctrAfter('Contract deleted');
}

/* New contract */
async function _ctrSaveNew() {
  let catId = _ctrVal('nCat');
  if (!catId) { ccToast('Choose the cost type', true); return; }
  const prov = _ctrVal('nProv');
  if (!prov) { ccToast('Enter the provider', true); return; }
  const start = _ctrDateInSafe('nStart'), until = _ctrDateInSafe('nUntil');
  if (start === false || until === false) return;
  const amtTxt = _ctrVal('nAmt'), amt = amtTxt ? ccParseEUR(amtTxt) : null;
  if (amtTxt && (amt === null || amt < 0)) { ccToast('Price: e.g. 56,00', true); return; }
  const fromTxt = _ctrVal('nFrom');
  let from = fromTxt ? _ctrParseMonth(fromTxt) : (start ? start.slice(0, 7) + '-01' : null);
  if (fromTxt && !from) { ccToast('From: MM.JJJJ', true); return; }
  if (catId === '__new') {
    const name = _ctrVal('nName');
    if (!name) { ccToast('Name the new cost type', true); return; }
    const code = name.toUpperCase().replace(/[ÄÖÜ]/g, x => ({ 'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE' }[x])).replace(/ß/g, 'SS').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'COST';
    const maxSort = Math.max(0, ...CTR.cats.map(x => _ctrN(x.sort_order)));
    const ins = _ctrQ(await sbL.from('ctrl_castel_categories').insert({ name, code, frequency: _ctrVal('nFreq') || 'monatlich', default_amount: amt !== null ? _ctrR(amt) : 0, active: true, sort_order: maxSort + 1, nk_key: 'personen', nk_spread: 'month' }).select().single());
    catId = ins ? ins.id : null;
    if (!catId) throw new Error('cost type not saved');
  } else if (amt !== null) {
    const c = _ctrCat(catId), now = from ? _ctrPriceAt(c, from) : _ctrNow(c), list = _ctrPeriods(c.id);
    if (_ctrR(amt) !== _ctrR(now.amount)) {
      if (!from) { ccToast('From: the month the new price starts', true); return; }
      if (list.some(h => _ctrD(h.valid_from) === from)) _ctrQ(await sbL.from('ctrl_castel_amount_history').update({ amount: _ctrR(amt) }).eq('category_id', c.id).eq('valid_from', from));
      else {
        if (!list.length) _ctrQ(await sbL.from('ctrl_castel_amount_history').insert({ category_id: c.id, valid_from: '2000-01-01', amount: _ctrR(_ctrN(c.default_amount)), reason: 'Start' }));
        _ctrQ(await sbL.from('ctrl_castel_amount_history').insert({ category_id: c.id, valid_from: from, amount: _ctrR(amt), reason: 'Neuer Vertrag' }));
      }
    }
  }
  const intOr = v => { const n = parseInt(v, 10); return n > 0 ? n : null; };
  const then = _ctrSegVal('then') || 'unknown';
  const row = {
    category_id: catId, provider: prov, tariff: _ctrVal('nTariff') || null, starts_on: start, runs_until: until,
    notice: _ctrVal('nNotice') || 'unknown', then_rule: then, renew_months: then === 'renew' ? 12 : null, min_months: intOr(_ctrVal('nMin')),
    customer_no: _ctrVal('nCust') || null, meter_no: _ctrVal('nMeter') || null, booked_via: _ctrVal('nVia') || null, booking_no: _ctrVal('nViaNo') || null,
  };
  const k = _ctrQ(await sbL.from('house_contracts').insert(row).select().single());
  if (k && document.getElementById('ctrFile')?.files?.[0]) await _ctrUpload(k, 'contract');
  CTR.open = catId; CTR.add = null;
  return _ctrAfter('Contract added');
}
