/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · UTILITIES TAB
   pv-utilities.js (Oct 2026) — first tab of the Providers app
   (moved here from the Casa Castel app's Contracts tab)

   One card per property (folds like Maintenance), each with its table
   Contract · Cost · Next. Casa Castel shows every Casa cost type (the cost
   types of Controlling); other properties show their contracts by type.
   Tap a row → the provider pop-up: Price · Dates · Bonus · Details ·
   Documents. Section buttons open their small form right there; Save
   returns to the read view. Edit turns the pop-up into one form.

   Source of truth
     Casa Castel   prices + from-months in ctrl_castel_amount_history (Controlling
                   reads them), rhythm / due months / NK split in ctrl_castel_categories
     other props   house_contracts.kind / rhythm / due_months + house_contract_prices
                   (reminders, prices, PDFs, bonuses — no Soll in Controlling)
     all           house_contracts · house_contract_bonuses · house_contract_docs
                   (storage 'contract-docs') · house_utility_props (properties shown)
   Money is confirmed only in Controlling (bonuses paid to the account).
   No calculations here: raw data (Abschlag, Arbeitspreis, Grundpreis), dates,
   countdowns and the cost changes — the Abrechnung lives in Settlements.

   Reminder pills (calculated, nothing stored but your click-away):
     red   No contract from …   it ends within 8 weeks and nothing follows
     amber No confirmation       14 days after cancelling
     amber Cancel by …           8 weeks before the last day to cancel
                                 (term · special cancel right · price guarantee)
     amber Claim …               a bonus needs something from you
     amber Bonus?                a bonus is 4 weeks late
     grey  New price MM.JJJJ     8 weeks before a known new price (info, not a to-do)
   ───────────────────────────────────────────────────────────── */

const PVU_CASA = 7;                                          // Casa Castel = ctrl_properties 7 (CASA_PROP_ID)
const PVU_KINDS = ['Strom', 'Gas', 'Wasser', 'Internet', 'Versicherung', 'Other'];
const CTR_SKIP = ['RATE', 'GAERTNER', 'PUTZDIENST', 'WINTERDIENST'];
const CTR_NOTICE = [['unknown', 'not known'], ['none', "can't be cancelled"], ['2w', '2 weeks'], ['4w', '4 weeks'], ['6w', '6 weeks'],
  ['1m', '1 month'], ['2m', '2 months'], ['3m', '3 months'], ['6m', '6 months'], ['12m', '12 months']];
const CTR_FREQ = [['monatlich', 'Monthly'], ['vierteljährlich', 'Quarterly'], ['jährlich', 'Yearly'], ['sporadisch', 'As needed']];
const CTR_FREQ_K = CTR_FREQ.slice(0, 3);                     // other properties: no "as needed"
const CTR_BONUS_KINDS = ['Neukundenbonus', 'Sofortbonus', 'Cashback', 'Gutschein', 'Punkte', 'Bonus'];
const CTR_DOC_KINDS = [['contract', 'Contract'], ['price', 'Price letter'], ['cancellation', 'Kündigung'], ['confirmation', 'Confirmation'], ['other', 'Other']];
const CTR_BUCKET = 'contract-docs';
const CTR_CHECK24 = 'https://kundenbereich.check24.de/';    // your CHECK24 customer area (bills, cashback, contracts)
const CTR_SHORT = { ENTSORGUNG: 'Entsorgung', VERSICHERUNG_WGB: 'Wohngebäude', VERSICHERUNG_HP: 'Haftpflicht', WARTUNG_HEIZUNG: 'Heizung Wartung', WARTUNG_ENTHAERT: 'Enthärtung Wartung' };
const CTR_MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const CTR_MON_L = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CTR = {
  props: [], uprops: [], cats: [], hist: [], cons: [], bons: [], docs: [], prices: [],
  loaded: false, err: '', at: 0, todo: 0,
  open: null, form: '', arg: null, add: null, busy: false, addProp: false,
  fold: (() => { try { return JSON.parse(localStorage.getItem('pvu_fold') || '{}') || {}; } catch (e) { return {}; } })(),
};

/* ── small helpers ─────────────────────────────────────────── */
const _pvuDb = () => (typeof _ctlSupa !== 'undefined' && _ctlSupa) || (typeof sbL !== 'undefined' && sbL) || null;
const _ctrToast = m => { if (typeof pvaToast === 'function') pvaToast(m); else console.log('[utilities]', m); };
function _ctrFail(e) { console.error('[utilities]', e); _ctrToast('Not saved – ' + String((e && (e.message || e.code)) || 'please try again').slice(0, 70)); }
const _ctrE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _ctrN = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const _ctrR = n => Math.round(_ctrN(n) * 100) / 100;
const _ctrEur = n => ccFmtNum(_ctrR(n), 2) + '\u00a0€';
const _ctrEurS = n => ccFmtNum(_ctrR(n), 'auto') + '\u00a0€';
const _ctrNum2 = v => (v === null || v === undefined || v === '' ? '' : ccFmtNum(Number(v), 2));
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
/* "in 11 months" · "in 12 days" · "today" — the time left until a date */
function _ctrIn(iso) {
  const t = _ctrT(); if (!iso) return '';
  const [y1, m1, d1] = t.split('-').map(Number), [y2, m2, d2] = iso.split('-').map(Number);
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
  if (days < 0) return 'passed';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 31) return 'in ' + days + ' days';
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return 'in ' + months + (months === 1 ? ' month' : ' months');
}
/* links: "eprimo.de" → https://eprimo.de · phone → tel: · mail → mailto: */
function _ctrUrl(v) {
  const s = String(v || '').trim(); if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s) ? 'https://' + s : '';
}
const _ctrTel = v => String(v || '').replace(/[^\d+]/g, '');

/* ── properties, cost types, contracts ─────────────────────── */
const _ctrPid = k => Number(k.property_id ?? PVU_CASA);
const _ctrProp = id => CTR.props.find(p => Number(p.id) === Number(id));
const _ctrPropName = id => (_ctrProp(id) || {}).name || (Number(id) === PVU_CASA ? 'Casa Castel' : 'Property');
function _ctrShownProps() {
  const ids = new Set(CTR.uprops.map(u => Number(u.property_id)));
  ids.add(PVU_CASA);
  CTR.cons.forEach(k => ids.add(_ctrPid(k)));
  const list = CTR.props.filter(p => ids.has(Number(p.id)));
  if (!list.some(p => Number(p.id) === PVU_CASA)) list.push({ id: PVU_CASA, name: 'Casa Castel' });
  return list.sort((a, b) => Number(a.id) - Number(b.id));
}
const _ctrCat = id => CTR.cats.find(c => _ctrId(c.id) === _ctrId(id));
const _ctrSkip = c => CTR_SKIP.includes(String(c.code || '').toUpperCase());
const _ctrName = c => CTR_SHORT[String(c.code || '').toUpperCase()] || c.name || '';   // short name in the table
const _ctrRows = () => CTR.cats.filter(c => c.active !== false && !_ctrSkip(c))
  .sort((a, b) => (_ctrN(a.sort_order) || 999) - (_ctrN(b.sort_order) || 999) || String(a.name).localeCompare(String(b.name)));

/* A slot = one row of a property's table:
   Casa Castel → one Casa cost type (key c:<category>) · other property → one type of contract (key p:<property>:<type>) */
const _ctrCatSlot = c => ({ key: 'c:' + c.id, pid: PVU_CASA, cat: c, kind: null, name: c.name || '', short: _ctrName(c) });
const _ctrKindSlot = (pid, kind) => ({ key: 'p:' + Number(pid) + ':' + kind, pid: Number(pid), cat: null, kind, name: kind, short: kind });
function _ctrSlots(pid) {
  if (Number(pid) === PVU_CASA) return _ctrRows().map(_ctrCatSlot);
  const kinds = [...new Set(CTR.cons.filter(k => _ctrPid(k) === Number(pid) && !k.category_id && !k.deleted_at).map(k => k.kind || 'Other'))];
  const ord = k => { const i = PVU_KINDS.indexOf(k); return i < 0 ? 99 : i; };
  return kinds.sort((a, b) => ord(a) - ord(b) || a.localeCompare(b)).map(k => _ctrKindSlot(pid, k));
}
function _ctrSlot(key) {
  const k = String(key || '');
  if (k.startsWith('c:')) { const c = _ctrCat(k.slice(2)); return c ? _ctrCatSlot(c) : null; }
  const m = k.match(/^p:(\d+):(.+)$/);
  return m ? _ctrKindSlot(m[1], m[2]) : null;
}
const _ctrSlotOfK = k => (k.category_id ? (_ctrCat(k.category_id) ? _ctrCatSlot(_ctrCat(k.category_id)) : null) : _ctrKindSlot(_ctrPid(k), k.kind || 'Other'));
const _ctrConsOf = s => CTR.cons.filter(k => !k.deleted_at && (s.cat ? _ctrId(k.category_id) === _ctrId(s.cat.id)
  : (!k.category_id && _ctrPid(k) === s.pid && (k.kind || 'Other') === s.kind)))
  .sort((a, b) => _ctrD(a.starts_on).localeCompare(_ctrD(b.starts_on)));
const _ctrBonsOf = k => (k ? CTR.bons.filter(b => _ctrId(b.contract_id) === _ctrId(k.id)) : []);
const _ctrDocsOf = k => (k ? CTR.docs.filter(d => _ctrId(d.contract_id) === _ctrId(k.id)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) : []);
const _ctrIsEnergy = s => /strom|gas/i.test(s.cat ? (s.cat.name || '') + ' ' + (s.cat.code || '') : s.kind || '');

/* rhythm + due months: the Casa cost type, or the contract itself (other properties) */
function _ctrSrc(s) {
  if (s.cat) return s.cat;
  const k = _ctrMain(s);
  return { frequency: (k && k.rhythm) || 'monatlich', due_months: (k && k.due_months) || null };
}
function _ctrFreq(src) {
  const f = String(src.frequency || 'monatlich').toLowerCase();
  if (/sporad|bedarf/.test(f)) return 'need';
  if (/viertel|quart/.test(f)) return 'quarter';
  if (/halb/.test(f)) return 'half';
  if (/jähr|jahr/.test(f)) return 'year';
  return 'month';
}
const _ctrPer = src => ({ month: 'month', quarter: 'quarter', half: 'half-year', year: 'year', need: 'as needed' })[_ctrFreq(src)];
const _ctrDue = src => (Array.isArray(src.due_months) ? src.due_months.map(Number).filter(n => n >= 1 && n <= 12) : []);
function _ctrPerYear(src, amount) {
  const f = _ctrFreq(src), dm = _ctrDue(src);
  if (f === 'need') return dm.length ? amount * dm.length : 0;
  if (f === 'month') return amount * (dm.length || 12);
  return dm.length ? amount * dm.length : 0;     // quarterly / yearly need their months (as in Controlling)
}

/* prices: Casa Castel → ctrl_castel_amount_history (by cost type) · other → house_contract_prices (by contract) */
const _ctrPeriods = catId => CTR.hist.filter(h => _ctrId(h.category_id) === _ctrId(catId))
  .sort((a, b) => _ctrD(a.valid_from).localeCompare(_ctrD(b.valid_from)));
function _ctrPeriodsOf(s) {
  if (s.cat) return _ctrPeriods(s.cat.id);
  const k = _ctrMain(s); if (!k) return [];
  return CTR.prices.filter(p => _ctrId(p.contract_id) === _ctrId(k.id)).sort((a, b) => _ctrD(a.valid_from).localeCompare(_ctrD(b.valid_from)));
}
function _ctrPriceAt(s, first) {            // same rule as Controlling: the period that started on or before the 1st
  const list = _ctrPeriodsOf(s);
  if (!list.length) return { amount: s.cat ? _ctrN(s.cat.default_amount) : 0, row: null };
  let i = 0;
  list.forEach((h, k) => { if (_ctrD(h.valid_from) <= first) i = k; });
  return { amount: _ctrN(list[i].amount), row: list[i] };
}
const _ctrNow = s => _ctrPriceAt(s, _ctrT().slice(0, 7) + '-01');
/* a known price CHANGE ahead (the first price of a contract that has not started is no change) */
const _ctrNextPrice = s => { const first = _ctrT().slice(0, 7) + '-01', list = _ctrPeriodsOf(s); return list.find((h, i) => i > 0 && _ctrD(h.valid_from) > first) || null; };

/* ── contract dates ────────────────────────────────────────── */
function _ctrTerm(k) {
  const t = _ctrT();
  const minEnd = k.starts_on && k.min_months ? _ctrAddM(_ctrD(k.starts_on), _ctrN(k.min_months)) : null;
  let until = _ctrD(k.runs_until) || null;
  if (!until && minEnd && (k.then_rule !== 'monthly' || minEnd > t)) until = minEnd;
  if (until && k.then_rule === 'renew' && _ctrN(k.renew_months) > 0 && _ctrCancellable(k.notice)) {
    let g = 0;
    while (_ctrNotice(until, k.notice, -1) < t && g++ < 80) until = _ctrAddM(until, _ctrN(k.renew_months));
  }
  const cancelBy = until && _ctrCancellable(k.notice) && !(k.then_rule === 'monthly' && until <= t) ? _ctrNotice(until, k.notice, -1) : null;
  const anyMonth = _ctrCancellable(k.notice) && k.then_rule === 'monthly' && (!until || until <= t) && (!k.min_months || !!minEnd);
  return { until, cancelBy, anyMonth, minEnd };
}
function _ctrEnd(k) {
  if (k.cancelled_on) return _ctrD(k.ends_on) || null;
  if (k.then_rule === 'ends') return _ctrTerm(k).until;
  return null;
}
function _ctrMain(s) {
  const t = _ctrT(), list = _ctrConsOf(s);
  if (!list.length) return null;
  const live = list.filter(k => { const e = _ctrEnd(k); return !e || e >= t; });
  return live.find(k => !k.starts_on || _ctrD(k.starts_on) <= t) || live[0] || list[list.length - 1];
}
const _ctrNext = k => { const s = _ctrSlotOfK(k); return s ? _ctrConsOf(s).find(x => x.id !== k.id && x.starts_on && (!k.starts_on || _ctrD(x.starts_on) > _ctrD(k.starts_on))) : null; };
const _ctrBonusAmt = b => (b.paid === 'points' || b.amount === null || b.amount === undefined ? (b.points ? b.points + ' points' : '') : _ctrEurS(b.amount));

/* ── one row: pills + the Next column ──────────────────────── */
function _ctrState(s) {
  const t = _ctrT(), k = _ctrMain(s), now = _ctrNow(s), src = _ctrSrc(s);
  const st = { s, k, now, src, pills: [], pill: null, next: '', mu: false, ahead: null };
  const nx = _ctrNextPrice(s);
  if (nx && _ctrAddD(_ctrD(nx.valid_from), -56) <= t) st.ahead = nx;
  if (!k) { st.next = '—'; st.mu = true; return st; }
  const end = _ctrEnd(k), succ = _ctrNext(k);
  if (end && !succ && !k.no_successor && _ctrAddD(end, -56) <= t)
    st.pills.push({ lvl: 'red', kind: 'nocontract', date: _ctrAddD(end, 1), end, text: 'No contract from ' + _ctrFS(_ctrAddD(end, 1)) });
  if (k.cancelled_on && !k.cancel_confirmed_on && _ctrAddD(_ctrD(k.cancelled_on), 14) <= t && (!end || end >= t))
    st.pills.push({ lvl: 'amber', kind: 'confirm', text: 'No confirmation' });
  if (!k.cancelled_on && k.notice !== 'none') {
    const term = _ctrTerm(k), cands = [];
    if (term.cancelBy && k.then_rule !== 'ends') cands.push({ date: term.cancelBy, why: 'term' });
    const sp = _ctrPeriodsOf(s).map(h => _ctrD(h.special_cancel_until)).filter(d => d && d >= t).sort()[0];
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
  const sm = iso => '<small>' + _ctrE(_ctrIn(iso)) + '</small>';
  if (k.notice === 'none') { st.next = "can't cancel"; st.mu = true; }
  else if (k.cancelled_on) st.next = end ? 'ends<br>' + _ctrF(end) + (end >= t ? sm(end) : '') : 'cancelled';
  else {
    const term = _ctrTerm(k);
    if (k.then_rule === 'ends' && term.until) st.next = (term.until >= t ? 'ends<br>' : 'ended<br>') + _ctrF(term.until) + (term.until >= t ? sm(term.until) : '');
    else if (term.anyMonth) st.next = 'any month';
    else if (term.cancelBy && term.cancelBy >= t) st.next = 'cancel by<br>' + _ctrF(term.cancelBy) + sm(term.cancelBy);
    else if (term.until && term.until >= t) st.next = 'runs until<br>' + _ctrF(term.until) + sm(term.until);   // too late for this term, rule after it unknown
    else if (term.until) { st.next = 'check dates'; st.mu = true; }                                           // its dates have passed
    else { st.next = 'add details'; st.mu = true; }
  }
  return st;
}
const _ctrPillHTML = p => (p ? `<span class="ctr-chip${p.lvl === 'red' ? ' red' : ''}">${_ctrE(p.text)}</span>` : '');
const _ctrAheadHTML = h => (h ? `<span class="ctr-chip g">New price ${_ctrMY(_ctrD(h.valid_from))}</span>` : '');

/* ── styles (Providers look: same tokens as Maintenance cards and the pop-ups) ── */
(function () {
  if (typeof document === 'undefined' || document.getElementById('pvu-css')) return;
  const s = document.createElement('style'); s.id = 'pvu-css';
  s.textContent = `
.pva-off { display:none !important; }
#pvaUtil { flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; background:var(--cc-bg); line-height:1.4; }
@media (min-width:900px) { body.pva #pvaUtil { grid-column:1 / -1; grid-row:3 / 6; } }
.pvu-pg { max-width:760px; margin:0 auto; padding:20px 14px calc(28px + env(safe-area-inset-bottom,0px)); }
.pvu-ttl { display:flex; align-items:center; gap:8px; margin:0 0 20px; }
.pvu-h1 { flex:1; min-width:0; margin:0; font-family:'Cormorant Garamond',Georgia,serif; font-size:28px; font-weight:300; line-height:1.1; color:var(--cc-ink); }
.ctr-plus { width:36px; height:36px; border-radius:50%; border:none; background:var(--cc-ink); color:var(--cc-white) !important; display:inline-flex; align-items:center; justify-content:center; font-size:17px; cursor:pointer; flex-shrink:0; }
.pvu-sum { margin:-10px 0 14px; }
.pvu-sum1 { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
.pvu-sum1 b { font-size:9px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; }
.pvu-sum1 span { font-size:11.5px; color:#9A8E7E; text-align:right; }
.pvu-sum2 { display:flex; flex-wrap:wrap; column-gap:14px; margin-top:2px; }
.pvu-sum2 span { white-space:nowrap; font-size:13px; font-weight:600; color:var(--cc-charcoal); }
.pvu-sum2 i { font-style:normal; font-size:9px; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:#A89C8C; margin-right:4px; }
.pvu-card { background:var(--cc-white); border:1px solid #DED6CA; border-radius:12px; overflow:hidden; margin:0 0 20px; box-shadow:0 1px 2px rgba(58,45,30,.07),0 10px 24px -12px rgba(58,45,30,.32); }
.pvu-card__hd { display:flex; align-items:baseline; justify-content:space-between; gap:8px; padding:16px 16px 12px; }
.pvu-card__name { margin:0; min-width:0; font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; line-height:1.1; color:var(--cc-ink); overflow-wrap:anywhere; }
.pvu-card__sum { flex-shrink:0; font-size:14px; font-weight:500; color:var(--cc-charcoal); white-space:nowrap; }
.pvu-card__sum.mu { color:var(--cc-stone); }
.pvu-band { display:flex; align-items:center; gap:8px; width:100%; padding:9px 16px; border:none; border-top:1px solid #E2DBD0; border-radius:0; background:#F1ECE4; font-family:inherit; text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.pvu-band b { font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--cc-charcoal); }
.pvu-band span { font-size:11px; color:#9A8E7E; }
.pvu-band i { margin-left:auto; font-size:14px; color:var(--cc-stone); transition:transform .2s; }
.pvu-band[aria-expanded="true"] i { transform:rotate(180deg); }
.pvu-empty { padding:12px 16px 14px; font-size:12px; color:#9A8E7E; border-top:1px solid #EDE8E0; }
.pvu-acts { display:flex; align-items:center; gap:16px; padding:10px 16px 12px; border-top:1px solid #EDE8E0; }
.pvu-lk { background:none; border:none; padding:2px 0; font-family:inherit; font-size:12.5px; font-weight:500; color:#8A6535 !important; cursor:pointer; display:inline-flex; align-items:center; gap:4px; }
.pvu-lk.mu { color:#B5AA99 !important; font-weight:400; }
.pvu-addp { display:block; width:100%; border:1px dashed #D5CCBE; border-radius:12px; padding:13px 16px; background:none; text-align:center; font-family:inherit; font-size:12px; font-weight:500; letter-spacing:.07em; text-transform:uppercase; color:#8A6535 !important; cursor:pointer; }
.pvu-addf { border:1px dashed #D5CCBE; border-radius:12px; padding:14px 16px; }
.ctr-chip { display:inline-block; font-size:10.5px; font-weight:500; line-height:1.5; padding:2px 8px; border-radius:10px; background:#FDF0D8; color:#633806; white-space:nowrap; }
.ctr-chip.red { background:#F7E4DC; color:#8A3B22; }
.ctr-chip.g { background:#EFE9E0; color:#9A8E7E; }
.ctr-chip.ok { background:#EAF3DE; color:#27500A; }
.ctr-th, .ctr-tr, .ctr-tf { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,.9fr) minmax(0,1fr); gap:8px; align-items:center; padding:0 16px; }
.ctr-th { min-height:30px; border-top:1px solid #EDE8E0; font-size:9.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A7F70; }
.ctr-th span:nth-child(n+2) { text-align:right; }
.ctr-tr { width:100%; min-height:52px; padding-top:8px; padding-bottom:8px; border:none; border-top:1px solid #EDE8E0; background:none; font-family:inherit; text-align:left; color:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.ctr-tr:nth-of-type(even) { background:#FAF7F2; }
.ctr-tr:active { background:var(--cc-surface); }
.ctr-c1 b { display:block; font-size:13.5px; font-weight:500; line-height:1.25; color:var(--cc-ink); -webkit-hyphens:auto; hyphens:auto; overflow-wrap:break-word; }
.ctr-c1 span { display:block; font-size:11.5px; color:#9A8E7E; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ctr-c2 { text-align:right; }
.ctr-c2 b { display:block; font-size:13.5px; font-weight:600; color:var(--cc-ink); white-space:nowrap; }
.ctr-c2 span { display:block; font-size:11px; color:#9A8E7E; }
.ctr-c3 { font-size:12px; color:#7A6F62; line-height:1.3; text-align:right; }
.ctr-c3.mu { color:#B5AA99; }
.ctr-c3 small { display:block; font-size:10.5px; color:#B5AA99; margin-top:1px; }
.ctr-c3 .ctr-chip + br + .ctr-chip, .ctr-c3 .ctr-chip.g { margin-top:3px; }
.ctr-tf { padding-top:10px; padding-bottom:10px; border-top:1px solid #D9CFC2; background:#F3EEE6; }
.ctr-tf > b { font-size:13px; font-weight:600; color:var(--cc-ink); }
.ctr-foot { font-size:11.5px; color:#9A8E7E; margin:14px 4px 0; line-height:1.5; }
.ctr-empty { padding:28px 16px; text-align:center; font-size:13px; color:#9A8E7E; }
.pvu-scrim { position:absolute; inset:0; z-index:120; background:rgba(30,27,24,.5); display:flex; flex-direction:column; justify-content:flex-end; transition:opacity .22s ease; }
.pvu-scrim.pv-closed { opacity:0; pointer-events:none; }
.pvu-scrim > .cc-modal-sheet { max-height:92vh; max-height:92dvh; padding-bottom:0; transition:transform .22s cubic-bezier(.3,.9,.3,1); }
.pvu-scrim.pv-closed > .cc-modal-sheet { transform:translateY(24px); }
@media (min-width:900px) { body.pva .pvu-scrim { justify-content:center; align-items:center; } body.pva .pvu-scrim > .cc-modal-sheet { width:min(640px,92%); max-height:86vh; border-radius:14px; } }
.pvu-scrim .ctr-hd { display:flex; align-items:flex-start; gap:10px; padding:20px 20px 12px; border-bottom:.5px solid var(--cc-rule); flex-shrink:0; }
.ctr-hd-t { flex:1; min-width:0; }
.ctr-kk { font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:#9A8E7E; line-height:1.4; }
.ctr-st { font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; font-weight:300; line-height:1.12; color:var(--cc-ink); margin-top:2px; }
.ctr-st.mu { color:#B5AA99; font-style:italic; }
.ctr-sub { font-size:12px; color:#9A8E7E; margin-top:2px; }
.ctr-hd .ctr-chip { margin-top:8px; }
.ctr-hb { display:flex; gap:6px; align-items:center; flex-shrink:0; }
.ctr-b { border:.5px solid var(--cc-rule); background:var(--cc-white); border-radius:14px; min-height:30px; padding:0 11px; font-family:inherit; font-size:11.5px; font-weight:500; color:#7A6F62 !important; display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap; text-decoration:none; }
.ctr-b.dk { background:#3A3530; color:#fff !important; border-color:#3A3530; }
.ctr-b.gold { border-color:#D9BF94; color:#8A6535 !important; background:#FBF6EE; }
.ctr-x { width:30px; height:30px; border-radius:50%; background:var(--cc-surface); border:none; color:#9A8E7E !important; display:inline-flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer; }
.ctr-body { flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:2px 20px max(20px,env(safe-area-inset-bottom,20px)); line-height:1.4; }
.ctr-rem { margin:14px 0 2px; border-radius:12px; padding:11px 12px; background:#FDF6EA; border:1px solid #F0D2A0; }
.ctr-rem.red { background:#FCF1F1; border-color:#F0B4B4; }
.ctr-rem p { margin:0; font-size:12.5px; line-height:1.5; color:#5C534A; }
.ctr-rem p b { color:#633806; font-weight:600; }
.ctr-rem.red p b { color:#791F1F; }
.ctr-ra { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; margin-top:10px; }
.ctr-ra .ctr-b { min-height:32px; border-radius:16px; }
.ctr-sec { padding:14px 0 8px; border-top:1px solid #EDE8E0; }
.ctr-sec:first-child, .ctr-rem + .ctr-sec { border-top:none; }
.ctr-sec.on { background:#F8F4EE; margin:0 -20px; padding:14px 20px; border-top:1px solid var(--cc-rule); }
.ctr-sh2 { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; }
.ctr-sl { font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; }
.ctr-kv { display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:6px 0; font-size:13.5px; }
.ctr-kv > span { color:#9A8E7E; flex-shrink:0; }
.ctr-kv > b { font-weight:500; text-align:right; color:var(--cc-ink); overflow-wrap:anywhere; }
.ctr-kv > b.e { color:#C8BFB0; font-weight:400; }
.ctr-kv small { color:#9A8E7E; font-weight:400; font-size:12px; }
.ctr-a { color:#8A6535 !important; font-weight:500; text-decoration:none; border-bottom:1px solid #E6D3B3; }
.ctr-a i { font-size:13px; margin-right:3px; vertical-align:-1px; }
.ctr-sm { font-size:11.5px; color:#9A8E7E; padding:2px 0 4px; line-height:1.45; }
.ctr-hist { margin-top:4px; border-top:1px dashed #E6DED2; padding-top:4px; }
.ctr-hist > div { padding:3px 0; }
.ctr-hist .r { display:flex; justify-content:space-between; gap:10px; font-size:12px; color:#9A8E7E; }
.ctr-hist .raw { font-size:11px; color:#B5AA99; }
.ctr-bo { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-top:1px solid #F1ECE4; cursor:pointer; }
.ctr-bo:first-of-type { border-top:none; }
.ctr-bo .t { flex:1; min-width:0; }
.ctr-bo .t b { display:block; font-size:13.5px; font-weight:500; color:var(--cc-ink); }
.ctr-bo .t span { display:block; font-size:11.5px; color:#9A8E7E; margin-top:1px; }
.ctr-bo .a { text-align:right; white-space:nowrap; font-size:13.5px; font-weight:600; color:var(--cc-ink); }
.ctr-bo .a .ctr-chip { margin-top:3px; }
.ctr-lnk { font-size:12px; color:#8A6535 !important; cursor:pointer; background:none; border:none; padding:2px 0; font-family:inherit; text-align:left; }
.ctr-doc { display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px solid #F1ECE4; }
.ctr-doc:first-of-type { border-top:none; }
.ctr-doc button.o { flex:1; min-width:0; display:flex; align-items:center; gap:10px; background:none; border:none; padding:0; font-family:inherit; text-align:left; cursor:pointer; color:inherit; }
.ctr-doc .ic { width:30px; height:30px; border-radius:50%; background:#F5EFE6; color:#8A6535; display:inline-flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.ctr-doc .t b { display:block; font-size:13px; font-weight:500; color:var(--cc-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ctr-doc .t span { display:block; font-size:11px; color:#9A8E7E; }
.ctr-doc .del { background:none; border:none; color:#C8BFB0 !important; font-size:16px; cursor:pointer; padding:4px; }
.ctr-fs { font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; margin:22px 0 0; }
.ctr-fs:first-child { margin-top:6px; }
.ctr-fl { display:block; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--cc-charcoal); margin:12px 0 6px; }
.ctr-in { width:100%; box-sizing:border-box; min-height:42px; padding:0 12px; border:.5px solid var(--cc-rule); border-radius:8px; background:var(--cc-white); font-family:inherit; font-size:16px; color:var(--cc-ink); }
.ctr-full .ctr-in { background:var(--cc-bg); }
.ctr-in:disabled { color:#9A8E7E; background:#F1ECE4; }
textarea.ctr-in { min-height:70px; padding:10px 12px; resize:vertical; }
select.ctr-in { -webkit-appearance:none; appearance:none; }
.ctr-in.r { text-align:right; }
.ctr-2 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px; }
.ctr-seg { display:flex; border:.5px solid var(--cc-rule); border-radius:8px; overflow:hidden; }
.ctr-seg button { flex:1; min-height:40px; border:none; border-left:.5px solid var(--cc-rule); background:var(--cc-white); font-family:inherit; font-size:12.5px; color:var(--cc-charcoal); cursor:pointer; padding:0 4px; }
.ctr-seg button:first-child { border-left:none; }
.ctr-seg button.on { background:var(--cc-ink); color:var(--cc-white); }
.ctr-mons { display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:6px; }
.ctr-mons button { min-height:34px; border:.5px solid var(--cc-rule); border-radius:8px; background:var(--cc-white); font-family:inherit; font-size:12.5px; color:#9A8E7E; cursor:pointer; }
.ctr-mons button.on { background:#F3EADC; border-color:#D9BF94; color:#8A6535; font-weight:600; }
.ctr-file { display:flex; align-items:center; gap:8px; min-height:42px; padding:0 12px; border:1px dashed #D5CCBE; border-radius:8px; background:var(--cc-white); font-size:13px; color:#9A8E7E; cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ctr-file input { display:none; }
.ctr-hint { margin:8px 0 0; font-size:12px; line-height:1.5; color:#7A6F62; }
.ctr-ft { display:flex; justify-content:flex-end; align-items:center; gap:14px; margin-top:16px; }
.pvu-bp { height:40px; padding:0 22px; border:none; border-radius:8px; background:var(--cc-ink); color:var(--cc-white) !important; font-family:inherit; font-size:13px; font-weight:500; cursor:pointer; }
.pvu-bg { height:40px; padding:0 6px; border:none; background:none; color:var(--cc-stone) !important; font-family:inherit; font-size:13px; cursor:pointer; }
.ctr-ft .ctr-del { margin-right:auto; background:none; border:none; color:#A0533A !important; font-family:inherit; font-size:12.5px; cursor:pointer; padding:0; }
`;
  (document.head || document.documentElement).appendChild(s);
})();

/* ── load ──────────────────────────────────────────────────── */
async function _ctrFetch() {
  const db = _pvuDb(); if (!db) throw new Error('no connection');
  const q = t => db.from(t).select('*');
  const res = await Promise.all([
    q('ctrl_properties').order('id'),
    q('house_utility_props'),
    q('ctrl_castel_categories').order('sort_order'),
    q('ctrl_castel_amount_history'),
    q('house_contracts').is('deleted_at', null),
    q('house_contract_bonuses'),
    q('house_contract_docs'),
    q('house_contract_prices'),
  ]);
  const bad = res.find(r => r.error);
  if (bad) throw bad.error;
  [CTR.props, CTR.uprops, CTR.cats, CTR.hist, CTR.cons, CTR.bons, CTR.docs, CTR.prices] = res.map(r => r.data || []);
  CTR.loaded = true; CTR.err = ''; CTR.at = Date.now();
}
const _ctrErrText = e => (/house_utility_props|house_contract_prices|property_id|house_contracts|does not exist|schema cache/i.test(String(e && (e.message || e)))
  ? 'Run the Utilities SQL in Supabase first.' : 'Utilities could not be loaded. Please try again.');
const _pvuVisible = () => { const h = document.getElementById('pvaUtil'); return !!h && !h.classList.contains('pva-off'); };

/* the tab (pv-admin.js calls these) */
function pvuTodo() { return CTR.todo || 0; }
async function pvuBoot() {                                   // the gold dot, also before the tab is opened
  if (CTR.loaded) return;
  try { await _ctrFetch(); _ctrDot(); } catch (e) { /* the tab shows the reason when opened */ }
}
async function pvuShow() {
  if (!document.getElementById('pvaUtil')) return;
  if (!CTR.loaded || Date.now() - CTR.at > 20000) {
    if (!CTR.loaded) pvuRender();
    try { await _ctrFetch(); } catch (e) { console.error('[utilities] load', e); CTR.err = _ctrErrText(e); }
  }
  pvuRender();
  let want = null;                                           // Controlling › Setup › "Open in Utilities"
  try { want = sessionStorage.getItem('pvu_open'); if (want) sessionStorage.removeItem('pvu_open'); } catch (e) {}
  if (want && CTR.loaded && _ctrSlot(want) && (!want.startsWith('c:') || _ctrCat(want.slice(2)))) ctrOpen(want);
}
function _ctrDot() {
  let n = 0;
  if (CTR.loaded) for (const p of _ctrShownProps()) for (const s of _ctrSlots(p.id)) if (_ctrState(s).pill) n++;
  CTR.todo = n;
  document.querySelector('#pvaTabs [data-util]')?.classList.toggle('cc-tab--dot', n > 0);
  return n;
}
/* back from another app: fresh data — unless you are typing */
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !CTR.loaded || CTR.busy || Date.now() - CTR.at < 20000) return;
  if (CTR.form || CTR.addProp || CTR.open === 'new') return;
  try { await _ctrFetch(); } catch (e) { return; }
  _ctrDot();
  if (_pvuVisible()) pvuRender();
  if (CTR.open !== null) _ctrPaint();
});

/* ── the Utilities page ────────────────────────────────────── */
function _ctrRowHTML(s) {
  const st = _ctrState(s), k = st.k, src = st.src, amt = st.now.amount, f = _ctrFreq(src);
  const cost = amt > 0 ? `<b>${_ctrEur(amt)}</b><span>${f === 'need' ? 'as needed' : '/ ' + _ctrPer(src)}</span>` : '<b>—</b>';
  const who = k ? (k.provider || 'provider missing') : 'no contract';
  const next = st.pill ? _ctrPillHTML(st.pill) : st.next + (st.ahead ? '<br>' + _ctrAheadHTML(st.ahead) : '');
  return { st, py: _ctrPerYear(src, amt), html: `<button type="button" class="ctr-tr" data-ctr="open" data-s="${_ctrE(s.key)}"><span class="ctr-c1"><b lang="de">${_ctrE(s.short)}</b><span>${_ctrE(who)}</span></span>` +
    `<span class="ctr-c2">${cost}</span><span class="ctr-c3${st.pill || st.ahead || !st.mu ? '' : ' mu'}">${next}</span></button>` };
}
function pvuRender() {
  const host = document.getElementById('pvaUtil'); if (!host) return;
  const todo = _ctrDot();
  if (!CTR.loaded) { host.innerHTML = `<div class="pvu-pg"><div class="ctr-empty">${_ctrE(CTR.err || 'Loading utilities …')}</div></div>`; return; }
  let yearAll = 0, nK = 0;
  const props = _ctrShownProps();
  const cards = props.map(p => {
    const pid = Number(p.id), casa = pid === PVU_CASA, slots = _ctrSlots(pid);
    let year = 0, todoP = 0;
    const rows = slots.map(s => { const r = _ctrRowHTML(s); year += r.py; if (r.st.pill) todoP++; return r.html; }).join('');
    yearAll += year;
    const nCons = CTR.cons.filter(k => _ctrPid(k) === pid && !k.deleted_at).length; nK += nCons;
    const open = CTR.fold[pid] !== false;
    const cnt = casa ? slots.length + ' cost types' : (slots.length ? slots.length + (slots.length === 1 ? ' contract' : ' contracts') : 'No contracts');
    const body = !open ? '' : (slots.length
      ? `<div class="ctr-th"><span>Contract</span><span>Cost</span><span>Next</span></div>${rows}` +
        `<div class="ctr-tf"><b>Total</b><span class="ctr-c2"><b>${_ctrEur(year)}</b><span>/ year</span></span><span class="ctr-c3">Ø ${_ctrEur(year / 12)}<br>/ month</span></div>` +
        (casa ? '' : `<div class="pvu-acts"><button type="button" class="pvu-lk" data-ctr="newfor" data-p="${pid}"><i class="ti ti-plus" aria-hidden="true"></i>Add contract</button></div>`)
      : `<div class="pvu-empty">No utilities for ${_ctrE(p.name)} yet.</div><div class="pvu-acts"><button type="button" class="pvu-lk" data-ctr="newfor" data-p="${pid}"><i class="ti ti-plus" aria-hidden="true"></i>Add contract</button>` +
        `<button type="button" class="pvu-lk mu" data-ctr="rmprop" data-p="${pid}">Remove from Utilities</button></div>`);
    return `<section class="pvu-card" aria-label="${_ctrE(p.name)}"><div class="pvu-card__hd"><h2 class="pvu-card__name">${_ctrE(p.name)}</h2>` +
      `<span class="pvu-card__sum${year ? '' : ' mu'}">${year ? _ctrEur(year) + ' / year' : '—'}</span></div>` +
      `<button type="button" class="pvu-band" data-ctr="fold" data-p="${pid}" aria-expanded="${open}"><b>${_ctrE(cnt)}</b>${todoP ? `<span>· ${todoP} to do</span>` : ''}<i class="ti ti-chevron-down" aria-hidden="true"></i></button>${body}</section>`;
  }).join('');
  const shown = new Set(props.map(p => Number(p.id)));
  const free = CTR.props.filter(p => p.active !== false && !shown.has(Number(p.id)));
  const addProp = CTR.addProp
    ? `<div class="pvu-addf"><label class="ctr-fl" for="pvuAddProp" style="margin-top:0">Add property</label>` +
      (free.length ? `<select class="ctr-in" id="pvuAddProp">${free.map(p => `<option value="${_ctrE(p.id)}">${_ctrE(p.name)}</option>`).join('')}</select>` +
        `<p class="ctr-hint">Only the properties you add show here. Then add their contracts with Add contract.</p>` +
        `<div class="ctr-ft"><button type="button" class="pvu-bg" data-ctr="addpropno">Cancel</button><button type="button" class="pvu-bp" data-ctr="addpropok">Add</button></div>`
        : `<p class="ctr-hint">All properties are here already.</p><div class="ctr-ft"><button type="button" class="pvu-bg" data-ctr="addpropno">Close</button></div>`) + `</div>`
    : `<button type="button" class="pvu-addp" data-ctr="addprop"><i class="ti ti-plus" aria-hidden="true"></i> Add property</button>`;
  host.innerHTML = `<div class="pvu-pg">
    <div class="pvu-ttl"><h1 class="pvu-h1">Utilities</h1>${todo ? `<span class="ctr-chip">${todo} to do</span>` : ''}
      <button type="button" class="ctr-plus" data-ctr="new" aria-label="New contract"><i class="ti ti-plus" aria-hidden="true"></i></button></div>
    <div class="pvu-sum"><div class="pvu-sum1"><b>Running costs</b><span>${props.length} ${props.length === 1 ? 'property' : 'properties'} · ${nK} ${nK === 1 ? 'contract' : 'contracts'}</span></div>
      <div class="pvu-sum2"><span><i>Per year</i>${_ctrEur(yearAll)}</span><span><i>Ø month</i>${_ctrEur(yearAll / 12)}</span></div></div>
    ${cards}${addProp}
    <p class="ctr-foot">Rate comes from Properties. Putzdienst, Gärtner and Winterdienst are the job tabs here.</p></div>`;
}

/* ── the provider pop-up (Providers modal: bottom sheet on the phone, window on iPad / laptop) ── */
function _ctrSheet() {
  let el = document.getElementById('pvuScrim');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'pvu-scrim pv-hidden'; el.id = 'pvuScrim';
  el.innerHTML = '<div class="cc-modal-sheet" role="dialog" aria-modal="true" aria-label="Contract"></div>';
  el.addEventListener('click', e => { if (e.target === el && !CTR.form && CTR.open !== 'new') ctrClose(); });
  el.addEventListener('click', _ctrClick);
  el.addEventListener('change', _ctrChange);
  (document.getElementById('pvApp') || document.body).appendChild(el);
  return el;
}
function ctrOpen(key) {
  const el = _ctrSheet();
  CTR.open = key; CTR.form = ''; CTR.arg = null;
  _ctrPaint();
  el.classList.remove('pv-hidden', 'pv-closed');
}
function ctrClose() {
  const el = document.getElementById('pvuScrim'); if (!el) return;
  CTR.open = null; CTR.form = ''; CTR.arg = null; CTR.add = null;
  el.classList.add('pv-closed');
  setTimeout(() => { if (CTR.open === null) { el.classList.add('pv-hidden'); el.classList.remove('pv-closed'); el.firstElementChild.innerHTML = ''; } }, 230);
}
function _ctrPaint() {
  const el = document.getElementById('pvuScrim'); if (!el) return;
  const box = el.firstElementChild;
  const body = box.querySelector('.ctr-body'), y = body ? body.scrollTop : 0;
  box.innerHTML = CTR.open === 'new' ? _ctrNewHTML() : _ctrSheetHTML();
  const nb = box.querySelector('.ctr-body'); if (nb) nb.scrollTop = CTR.form ? y : 0;
}
const _ctrKV = (k, v) => `<div class="ctr-kv"><span>${_ctrE(k)}</span><b${v === '' || v === null || v === undefined ? ' class="e"' : ''}>${v === '' || v === null || v === undefined ? '—' : v}</b></div>`;
const _ctrBtn = (txt, act, extra = '', dk = false) => `<button type="button" class="ctr-b${dk ? ' dk' : ''}" data-ctr="${act}"${extra}>${txt}</button>`;
const _ctrSec = (title, btn, body, on) => `<div class="ctr-sec${on ? ' on' : ''}"><div class="ctr-sh2"><span class="ctr-sl">${title}</span>${btn || ''}</div>${body}</div>`;
const _ctrFoot = (save, del) => `<div class="ctr-ft">${del || ''}<button type="button" class="pvu-bg" data-ctr="fcancel">Cancel</button>${save ? `<button type="button" class="pvu-bp" data-ctr="${save}">Save</button>` : ''}</div>`;
const _ctrSegH = (name, opts, cur) => `<div class="ctr-seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${_ctrE(v)}"${String(v) === String(cur) ? ' class="on"' : ''}>${_ctrE(l)}</button>`).join('')}</div>`;
const _ctrInp = (id, label, val, ph = '', cls = '', extra = '') => `<div><label class="ctr-fl" for="${id}">${label}</label><input class="ctr-in${cls ? ' ' + cls : ''}" id="${id}" type="text" value="${_ctrE(val ?? '')}" placeholder="${_ctrE(ph)}"${extra}></div>`;
const _ctrDateInp = (id, label, iso) => _ctrInp(id, label, iso ? _ctrF(iso) : '', 'TT.MM.JJJJ', '', ' inputmode="numeric" autocomplete="off"');
const _ctrMonInp = (id, label, iso) => _ctrInp(id, label, iso ? _ctrMY(iso) : '', 'MM.JJJJ', '', ' inputmode="numeric" autocomplete="off"');
const _ctrAmtInp = (id, label, v, extra = '') => _ctrInp(id, label, v === null || v === undefined || v === '' ? '' : ccFmtNum(v, 2), '0,00', 'r', ' inputmode="decimal" autocomplete="off"' + extra);
const _ctrSel = (id, label, opts, cur, extra = '') => `<div><label class="ctr-fl" for="${id}">${label}</label><select class="ctr-in" id="${id}"${extra}>${opts.map(([v, l]) => `<option value="${_ctrE(v)}"${String(v) === String(cur) ? ' selected' : ''}>${_ctrE(l)}</option>`).join('')}</select></div>`;
const _ctrFileInp = label => `<label class="ctr-fl">${label}</label><label class="ctr-file"><i class="ti ti-upload" aria-hidden="true"></i><span data-file-name>Add PDF</span><input type="file" id="ctrFile" accept="application/pdf,.pdf"></label>`;
const _ctrMonsH = (cur, hidden) => `<div data-mons-wrap${hidden ? ' hidden' : ''}><label class="ctr-fl">Due in</label><div class="ctr-mons" data-mons>${CTR_MON.map((m, i) => `<button type="button" data-m="${i + 1}"${(cur || []).map(Number).includes(i + 1) ? ' class="on"' : ''}>${m}</button>`).join('')}</div></div>`;

function _ctrReminderHTML(s, st) {
  const p = st.pill, k = st.k; if (!p || !k) return '';
  const R = (txt, a1, a2, red) => `<div class="ctr-rem${red ? ' red' : ''}"><p>${txt}</p><div class="ctr-ra">${a1}${a2}</div></div>`;
  const prov = _ctrE(k.provider || 'This contract');
  if (p.kind === 'nocontract') return R(`<b>No ${_ctrE(s.short)} from ${_ctrF(p.date)}.</b> ${prov} ends ${_ctrF(p.end)} and no next contract is set up.`,
    _ctrBtn('Not needed', 'act', ' data-a="notneeded"'), _ctrBtn('Add next contract', 'act', ' data-a="addnext"', true), true);
  if (p.kind === 'confirm') return R(`<b>No confirmation yet.</b> You cancelled on ${_ctrF(_ctrD(k.cancelled_on))}.`,
    _ctrBtn('Confirmed', 'act', ' data-a="confirmed"'), _ctrBtn('Add the letter', 'act', ' data-a="confirmdoc"', true));
  if (p.kind === 'cancelby') {
    const term = _ctrTerm(k);
    const txt = p.why === 'special' ? `<b>Special cancel right until ${_ctrF(p.date)}</b> (${_ctrE(_ctrIn(p.date))}). After the price increase you can leave without the usual notice.`
      : p.why === 'guarantee' ? `<b>The price guarantee ends ${_ctrF(p.date)}</b> (${_ctrE(_ctrIn(p.date))}). Prices can rise after that, a good moment to compare.`
      : `<b>Last day to cancel: ${_ctrF(p.date)}</b> (${_ctrE(_ctrIn(p.date))}). ` + (k.then_rule === 'renew' && term.until ? `If you keep it, it renews to ${_ctrF(_ctrAddM(term.until, _ctrN(k.renew_months)))}.` : k.then_rule === 'monthly' ? 'After that it runs on monthly.' : `It runs until ${_ctrF(term.until)}.`);
    return R(txt, _ctrBtn('Keep', 'act', ` data-a="keep" data-d="${p.date}"`), _ctrBtn('Cancel contract', 'act', ' data-a="cancelform"', true));
  }
  if (p.kind === 'claim') return R(`<b>Claim your ${_ctrE(_ctrBonusAmt(p.b))} ${_ctrE(p.b.kind)}.</b> ${_ctrE(p.b.condition)}`,
    _ctrBtn('Skip', 'act', ` data-a="skip" data-b="${_ctrE(p.b.id)}"`),
    p.b.source === 'check24' ? `<a class="ctr-b dk" href="${CTR_CHECK24}" target="_blank" rel="noopener">Open CHECK24 ↗</a>` : _ctrBtn('Claimed', 'act', ` data-a="claimed" data-b="${_ctrE(p.b.id)}"`, true));
  if (p.kind === 'late') return R(`<b>Did the ${_ctrE(_ctrBonusAmt(p.b))} ${_ctrE(p.b.kind)} arrive?</b> It was expected in ${_ctrMY(_ctrD(p.b.expected_on))}.`,
    _ctrBtn('Not coming', 'act', ` data-a="lost" data-b="${_ctrE(p.b.id)}"`),
    p.b.paid === 'bill' ? _ctrBtn('Received', 'act', ` data-a="billok" data-b="${_ctrE(p.b.id)}"`, true) : _ctrBtn('Confirm in Controlling ↗', 'act', ' data-a="controlling"', true));
  return '';
}

function _ctrSheetHTML() {
  const s = _ctrSlot(CTR.open); if (!s) return '';
  const st = _ctrState(s), k = st.k, f = CTR.form;
  if (f === 'edit') return _ctrHeadHTML(s, st, true) + `<div class="ctr-body ctr-full">${_ctrEditHTML(s, k)}</div>`;
  const portal = k && _ctrUrl(k.portal);
  const ed = !f ? (portal ? `<a class="ctr-b gold" href="${_ctrE(portal)}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i>Portal</a>` : '') + _ctrBtn('Edit', 'form', ' data-f="edit"') : '';
  return _ctrHeadHTML(s, st, false, ed) + `<div class="ctr-body">${f ? '' : _ctrReminderHTML(s, st)}${_ctrPriceSec(s, st)}${_ctrDatesSec(s, st)}${k ? _ctrBonusSec(k) + _ctrDetailsSec(s, k) + _ctrDocsSec(k) : _ctrNoContractSec(s)}</div>`;
}
function _ctrHeadHTML(s, st, edit, ed = '') {
  const k = st.k, kick = s.cat ? s.name : _ctrPropName(s.pid) + ' · ' + s.kind;
  return `<div class="ctr-hd"><div class="ctr-hd-t"><div class="ctr-kk">${_ctrE(kick)}${edit ? ' · edit' : ''}</div>` +
    `<div class="ctr-st${k && k.provider ? '' : ' mu'}">${_ctrE(k ? (k.provider || 'Provider not set') : 'No contract yet')}</div>` +
    (k && k.tariff ? `<div class="ctr-sub">${_ctrE(k.tariff)}</div>` : '') + (!edit && st.pill ? _ctrPillHTML(st.pill) : '') +
    `</div><div class="ctr-hb">${ed}<button type="button" class="ctr-x" data-ctr="${edit ? 'fcancel' : 'close'}" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div></div>`;
}

/* Price — raw data and the cost changes; no calculations */
const _ctrCt = v => _ctrNum2(v) + ' ct/kWh';
const _ctrGp = v => _ctrNum2(v) + ' € / month';
function _ctrRawLine(h, prev) {
  const part = (lbl, key, unit) => {
    if (h[key] === null || h[key] === undefined) return '';
    const was = prev && prev[key] !== null && prev[key] !== undefined && Number(prev[key]) !== Number(h[key]) ? _ctrNum2(prev[key]) + ' → ' : '';
    return lbl + ' ' + was + _ctrNum2(h[key]) + ' ' + unit;
  };
  return [part('AP', 'work_price', 'ct'), part('GP', 'base_price', '€')].filter(Boolean).join(' · ');
}
function _ctrPriceSec(s, st) {
  const on = CTR.form === 'price', now = st.now, src = st.src, f = _ctrFreq(src), dm = _ctrDue(src), energy = _ctrIsEnergy(s);
  const list = _ctrPeriodsOf(s).slice().reverse();
  if (on) {
    const reason = CTR.arg || 'Preiserhöhung', korr = reason === 'Korrektur', r = now.row || {};
    return _ctrSec('Price · New price', '', _ctrKV('Now', now.amount ? _ctrEur(now.amount) + ' / ' + _ctrPer(src) : '') +
      `<label class="ctr-fl">Reason</label>${_ctrSegH('reason', [['Preiserhöhung', 'Preiserhöhung'], ['Neuer Abschlag', 'Neuer Abschlag'], ['Korrektur', 'Korrektur']], reason)}` +
      (korr ? `<div class="ctr-2">${_ctrAmtInp('ctrPrAmt', 'Correct price €', now.amount)}<div></div></div>` +
          (energy ? `<div class="ctr-2">${_ctrAmtInp('ctrPrWork', 'Arbeitspreis ct/kWh', r.work_price)}${_ctrAmtInp('ctrPrBase', 'Grundpreis €/month', r.base_price)}</div>` : '') +
          `<p class="ctr-hint">Korrektur fixes or fills in the current price, from the same month as before. Nothing new starts.</p>`
        : `<div class="ctr-2">${_ctrMonInp('ctrPrFrom', 'Gilt ab', '')}${_ctrAmtInp('ctrPrAmt', 'Price €', '')}</div>` +
          (reason === 'Preiserhöhung' ? `<div class="ctr-2">${_ctrDateInp('ctrPrSpec', 'Special cancel until', '')}<div></div></div>` : '') +
          (energy ? `<div class="ctr-2">${_ctrAmtInp('ctrPrWork', 'Arbeitspreis ct/kWh', '')}${_ctrAmtInp('ctrPrBase', 'Grundpreis €/month', '')}</div>` : '') +
          _ctrFileInp('Letter (PDF, optional)') +
          `<p class="ctr-hint">Gilt ab is the month the new amount is for${s.cat ? ', the way you book it in Controlling' : ''}. Earlier months keep their price.</p>`) +
      _ctrFoot('saveprice'), true);
  }
  const since = now.row && _ctrD(now.row.valid_from) > '2000-01-01' ? _ctrMY(_ctrD(now.row.valid_from)) : 'start';
  const py = _ctrPerYear(src, now.amount), nx = _ctrNextPrice(s);
  const hist = list.filter(h => _ctrD(h.valid_from) > '2000-01-01').slice(0, 5).map(h => {
    const j = list.indexOf(h), prev = list[j + 1], raw = energy ? _ctrRawLine(h, prev) : '';
    return `<div><div class="r"><span>${_ctrMY(_ctrD(h.valid_from))}${h.reason ? ' · ' + _ctrE(h.reason) : ''}</span><span>${prev ? _ctrEur(prev.amount) + ' → ' : ''}${_ctrEur(h.amount)}</span></div>` +
      (raw ? `<div class="raw">${_ctrE(raw)}</div>` : '') + `</div>`;
  }).join('');
  const r = now.row || {};
  return _ctrSec('Price', _ctrBtn('New price', 'form', ' data-f="price"'),
    _ctrKV('Now', now.amount ? _ctrEur(now.amount) + (f === 'need' ? ' · as needed' : ' / ' + _ctrPer(src)) : '') +
    _ctrKV('Since', since) +
    (energy ? _ctrKV('Arbeitspreis', r.work_price !== null && r.work_price !== undefined ? _ctrE(_ctrCt(r.work_price)) : '') +
              _ctrKV('Grundpreis', r.base_price !== null && r.base_price !== undefined ? _ctrE(_ctrGp(r.base_price)) : '') : '') +
    (nx ? _ctrKV('Next', _ctrEur(nx.amount) + ' from ' + _ctrMY(_ctrD(nx.valid_from)) + ` <small>· ${_ctrE(_ctrIn(_ctrD(nx.valid_from)))}</small>`) : '') +
    (f !== 'month' && dm.length ? _ctrKV('Due in', dm.map(m => CTR_MON_L[m - 1]).join(' · ')) : '') +
    (py ? _ctrKV('Per year', _ctrEur(py)) : '') +
    (hist ? `<div class="ctr-hist">${hist}</div>` : ''));
}

/* Dates — with the time left */
function _ctrDatesSec(s, st) {
  const k = st.k; if (!k) return '';
  const term = _ctrTerm(k), on = CTR.form === 'cancel', t = _ctrT();
  const inS = iso => (iso && iso >= t ? ` <small>· ${_ctrE(_ctrIn(iso))}</small>` : '');
  if (on) {
    let ends = term.until && k.then_rule !== 'monthly' ? term.until : null;
    if (!ends && _ctrCancellable(k.notice)) { const e = _ctrNotice(t, k.notice, 1); ends = _ctrAddD(_ctrAddM(e.slice(0, 7) + '-01', 1), -1); }
    const conf = CTR.arg || 'waiting';
    return _ctrSec('Dates · Cancel contract', '', _ctrKV('Notice', _ctrNoticeLbl(k.notice) + (term.anyMonth ? ' · any month' : term.cancelBy && term.cancelBy >= t ? ' · by ' + _ctrF(term.cancelBy) : '')) +
      `<div class="ctr-2">${_ctrDateInp('ctrCnOn', 'Cancelled on', t)}${_ctrDateInp('ctrCnEnd', 'Ends on', ends)}</div>` +
      `<label class="ctr-fl">Confirmation</label>${_ctrSegH('conf', [['waiting', 'Waiting'], ['received', 'Received']], conf)}` +
      _ctrFileInp('Letter (PDF, optional)') +
      `<p class="ctr-hint">${s.cat ? 'Controlling counts this contract until the end month. ' : ''}Add the next contract with + so it goes on.</p>` +
      _ctrFoot('savecancel'), true);
  }
  let rows;
  if (k.cancelled_on) {
    rows = _ctrKV('Start', _ctrF(_ctrD(k.starts_on))) + _ctrKV('Cancelled on', _ctrF(_ctrD(k.cancelled_on))) + _ctrKV('Ends on', _ctrF(_ctrD(k.ends_on)) + inS(_ctrD(k.ends_on))) +
      _ctrKV('Confirmation', k.cancel_confirmed_on ? 'received ' + _ctrF(_ctrD(k.cancel_confirmed_on)) : 'waiting') +
      `<button type="button" class="ctr-lnk" data-ctr="act" data-a="withdraw">Undo the cancellation</button>`;
  } else {
    const can = k.notice === 'none' ? "can't be cancelled" : term.anyMonth ? 'any month'
      : term.cancelBy && term.cancelBy >= t ? 'by ' + _ctrF(term.cancelBy) + inS(term.cancelBy)
      : term.until && term.until >= t ? 'too late for this term' : term.until ? 'check the dates' : '';
    const untilTxt = term.until && !(k.then_rule === 'monthly' && term.until <= t) ? _ctrF(term.until) + inS(term.until) : (k.then_rule === 'monthly' ? 'open-ended' : '');
    rows = _ctrKV('Start', _ctrF(_ctrD(k.starts_on))) +
      (k.min_months ? _ctrKV('Minimum', k.min_months + ' months' + (term.minEnd ? ' · until ' + _ctrF(term.minEnd) : '')) : '') +
      (k.notice === 'none' ? '' : _ctrKV('Runs until', untilTxt)) +
      (k.notice === 'none' ? '' : _ctrKV('Notice', k.notice === 'unknown' ? '' : _ctrNoticeLbl(k.notice))) +
      (k.then_rule === 'renew' ? _ctrKV('Then', 'renews by ' + (k.renew_months || 12) + ' months') : '') +
      _ctrKV('You can cancel', can) +
      (k.price_fixed_until ? _ctrKV('Price fixed until', _ctrF(_ctrD(k.price_fixed_until)) + (_ctrD(k.price_fixed_until) < t ? ' · ended' : inS(_ctrD(k.price_fixed_until)))) : '') +
      (k.next_reading ? _ctrKV('Next meter reading', _ctrF(_ctrD(k.next_reading)) + inS(_ctrD(k.next_reading))) : '');
  }
  const btn = !k.cancelled_on && _ctrCancellable(k.notice) ? _ctrBtn('Cancel', 'form', ' data-f="cancel"') : '';
  return _ctrSec('Dates', btn, rows);
}

/* Bonus — money paid to your account is confirmed only in Controlling */
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
const _ctrBooked = b => !!b && b.paid === 'account' && b.status === 'received';
function _ctrBonusSec(k) {
  const on = CTR.form === 'bonus', list = _ctrBonsOf(k);
  if (on) {
    const b = CTR.arg ? list.find(x => _ctrId(x.id) === _ctrId(CTR.arg)) : null;
    const ro = _ctrBooked(b), dis = ro ? ' disabled' : '';
    const kind = b ? b.kind : 'Cashback', pts = kind === 'Punkte' || (b && b.paid === 'points');
    const del = b && !ro ? `<button type="button" class="ctr-del" data-ctr="delbonus" data-b="${_ctrE(b.id)}">Delete</button>` : '';
    const acc = !b || b.paid === 'account';
    const stat = !b || ro ? '' : `<label class="ctr-fl">Status</label>${_ctrSegH('bstat', b.paid === 'account'
      ? [['open', 'Open'], ['claimed', 'Claimed'], ['lost', 'Not coming']]
      : [['open', 'Open'], ['claimed', 'Claimed'], ['received', 'Received'], ['lost', 'Not coming']], b.status === 'skipped' ? 'lost' : b.status)}`;
    return _ctrSec(b ? (ro ? 'Bonus · Booked' : 'Bonus · Edit') : 'Bonus · Add', '',
      `<div class="ctr-2">${_ctrSel('ctrBoKind', 'Type', CTR_BONUS_KINDS.map(x => [x, x]).concat(b && !CTR_BONUS_KINDS.includes(b.kind) ? [[b.kind, b.kind]] : []), kind, dis)}` +
      (pts ? _ctrInp('ctrBoPts', 'Points', b ? b.points : '', '0', 'r', ' inputmode="numeric"' + dis) : _ctrAmtInp('ctrBoAmt', 'Amount €', b ? b.amount : '', dis)) + `</div>` +
      (ro ? '' : `<label class="ctr-fl">From</label>${_ctrSegH('bsrc', [['provider', 'Provider'], ['check24', 'CHECK24'], ['other', 'Other']], b ? b.source : 'check24')}` +
        (pts ? '' : `<label class="ctr-fl">Paid</label>${_ctrSegH('bpaid', [['bill', 'On the bill'], ['account', 'To your account']], b ? b.paid : 'account')}`) +
        `<div class="ctr-2">${_ctrMonInp('ctrBoExp', 'Expected', b ? _ctrD(b.expected_on) : '')}${_ctrSel('ctrBoNk', 'In NK', [['0', 'No'], ['1', 'Yes']], b && b.in_nk ? '1' : '0')}</div>` +
        _ctrInp('ctrBoCond', 'What you need to do (optional)', b ? b.condition : '', 'e.g. upload the first bill')) +
      stat +
      `<p class="ctr-hint">${ro ? `Booked in Controlling on ${_ctrF(_ctrD(b.status_on))}. Change the amount there, under One-off.`
        : acc ? 'Paid to your account: you confirm it in Controlling once the money is in. On the bill: it is already in the Jahresabrechnung.'
        : 'On the bill: it is already in the Jahresabrechnung.'}</p>` +
      _ctrFoot(ro ? '' : 'savebonus', del), true);
  }
  const rows = list.map(b => `<div class="ctr-bo" data-ctr="form" data-f="bonus" data-b="${_ctrE(b.id)}"><span class="t"><b>${_ctrE(b.kind)}</b><span>${_ctrBonusLine(b)}</span></span><span class="a">${_ctrE(_ctrBonusAmt(b))}<br>${_ctrBonusChip(b)}</span></div>`).join('');
  const openAcc = list.some(b => b.paid === 'account' && (b.status === 'open' || b.status === 'claimed'));
  return _ctrSec('Bonus', _ctrBtn('+ Add', 'form', ' data-f="bonus"'),
    (rows || '<div class="ctr-sm">No bonus noted.</div>') + (openAcc ? `<button type="button" class="ctr-lnk" data-ctr="act" data-a="controlling">Confirm in Controlling once it's in ↗</button>` : ''));
}

/* Details — portal, phone and email open with one tap */
function _ctrDetailsSec(s, k) {
  const bv = [k.booked_via, k.booking_no].filter(Boolean).join(' · ');
  const url = _ctrUrl(k.portal), tel = _ctrTel(k.phone), mail = String(k.email || '').trim();
  const portal = !k.portal ? '' : url ? `<a class="ctr-a" href="${_ctrE(url)}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i>${_ctrE(k.portal)}</a>` : _ctrE(k.portal);
  const phone = !k.phone ? '' : tel ? `<a class="ctr-a" href="tel:${_ctrE(tel)}"><i class="ti ti-phone" aria-hidden="true"></i>${_ctrE(k.phone)}</a>` : _ctrE(k.phone);
  const email = !mail ? '' : /@/.test(mail) ? `<a class="ctr-a" href="mailto:${_ctrE(mail)}"><i class="ti ti-mail" aria-hidden="true"></i>${_ctrE(mail)}</a>` : _ctrE(mail);
  const nk = s.cat ? _ctrKV('NK-Abrechnung', s.cat.nk_key === 'none' ? 'not in NK' : 'by person · ' + (s.cat.nk_spread === 'year' ? 'over the year' : 'in its month')) : '';
  return _ctrSec('Details', '', _ctrKV('Holder', _ctrE(k.holder)) + _ctrKV('Customer no.', _ctrE(k.customer_no)) + _ctrKV('Contract no.', _ctrE(k.contract_no)) +
    _ctrKV('Meter no.', _ctrE(k.meter_no)) + (k.malo_id || _ctrIsEnergy(s) ? _ctrKV('MaLo-ID', _ctrE(k.malo_id)) : '') +
    _ctrKV('Booked via', _ctrE(bv)) + _ctrKV('Phone', phone) + _ctrKV('Email', email) + _ctrKV('Portal', portal) + nk +
    (k.note ? `<div class="ctr-sm">${_ctrE(k.note)}</div>` : ''));
}

/* Documents */
function _ctrDocsSec(k) {
  const on = CTR.form === 'doc', list = _ctrDocsOf(k);
  if (on) return _ctrSec('Documents · Add PDF', '', `<label class="ctr-fl">Kind</label>${_ctrSegH('dkind', CTR_DOC_KINDS.slice(0, 4), CTR.arg || 'contract')}` + _ctrFileInp('File') + _ctrFoot('savedoc'), true);
  const lbl = v => (CTR_DOC_KINDS.find(x => x[0] === v) || CTR_DOC_KINDS[4])[1];
  const rows = list.map(d => `<div class="ctr-doc"><button type="button" class="o" data-ctr="opendoc" data-d="${_ctrE(d.id)}"><span class="ic"><i class="ti ti-file-text" aria-hidden="true"></i></span>` +
    `<span class="t"><b>${_ctrE(d.name || 'Document')}</b><span>${_ctrE(lbl(d.kind))} · ${_ctrF(ccDayOf(d.created_at))}</span></span></button>` +
    `<button type="button" class="del" data-ctr="deldoc" data-d="${_ctrE(d.id)}" aria-label="Delete"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join('');
  return _ctrSec('Documents', _ctrBtn('+ PDF', 'form', ' data-f="doc"'), rows || '<div class="ctr-sm">No documents yet.</div>');
}
function _ctrNoContractSec(s) {
  return _ctrSec('Contract', _ctrBtn('+ Add contract', 'act', ' data-a="addnext"'),
    `<div class="ctr-sm">No contract for ${_ctrE(s.short)} yet. Add one when you have it, then its dates and reminders show up here.</div>`);
}

/* Edit (the whole pop-up) */
function _ctrEditHTML(s, k) {
  const src = s.cat || (k ? { frequency: k.rhythm || 'monatlich', due_months: k.due_months } : { frequency: 'monatlich' });
  const f = src.frequency || 'monatlich', dm = _ctrDue(src);
  const kHTML = !k ? '' :
    `<div class="ctr-fs">Provider</div>` +
    (s.cat ? '' : `<div class="ctr-2">${_ctrSel('eKind', 'Type', PVU_KINDS.map(x => [x, x]).concat(PVU_KINDS.includes(k.kind) ? [] : [[k.kind, k.kind]]), k.kind || 'Other')}<div></div></div>`) +
    `<div class="ctr-2">${_ctrInp('eProv', 'Name', k.provider)}${_ctrInp('eTariff', 'Tariff', k.tariff, 'optional')}</div>` +
    `<div class="ctr-2">${_ctrInp('eHolder', 'Holder', k.holder, 'optional')}${_ctrInp('eVia', 'Booked via', k.booked_via, 'e.g. CHECK24')}</div>` +
    `<div class="ctr-2">${_ctrInp('eViaNo', 'Its number', k.booking_no, 'optional')}<div></div></div>` +
    `<div class="ctr-fs">Numbers</div><div class="ctr-2">${_ctrInp('eCust', 'Customer no.', k.customer_no, 'optional')}${_ctrInp('eNo', 'Contract / policy no.', k.contract_no, 'optional')}</div>` +
    `<div class="ctr-2">${_ctrInp('eMeter', 'Meter no.', k.meter_no, 'optional')}${_ctrInp('eMalo', 'MaLo-ID', k.malo_id, 'optional')}</div>` +
    `<div class="ctr-fs">Contact</div><div class="ctr-2">${_ctrInp('ePhone', 'Phone', k.phone, 'optional', '', ' inputmode="tel"')}${_ctrInp('eMail', 'Email', k.email, 'optional', '', ' inputmode="email"')}</div>` +
    _ctrInp('ePortal', 'Portal (web address)', k.portal, 'e.g. eprimo.de or the login link', '', ' inputmode="url" autocapitalize="off"') +
    `<div class="ctr-fs">Dates</div><div class="ctr-2">${_ctrDateInp('eStart', 'Start', _ctrD(k.starts_on))}${_ctrInp('eMin', 'Minimum (months)', k.min_months, 'optional', 'r', ' inputmode="numeric"')}</div>` +
    `<div class="ctr-2">${_ctrDateInp('eUntil', 'Runs until', _ctrD(k.runs_until))}${_ctrSel('eNotice', 'Notice', CTR_NOTICE, k.notice || 'unknown')}</div>` +
    `<label class="ctr-fl">Then</label>${_ctrSegH('then', [['renew', 'Renews'], ['monthly', 'Monthly'], ['ends', 'Ends'], ['unknown', 'Not sure']], k.then_rule || 'unknown')}` +
    `<div class="ctr-2">${_ctrInp('eRenew', 'Renews by (months)', k.renew_months || (k.then_rule === 'renew' ? 12 : ''), '12', 'r', ' inputmode="numeric"')}${_ctrDateInp('eFixed', 'Price fixed until', _ctrD(k.price_fixed_until))}</div>` +
    `<div class="ctr-2">${_ctrDateInp('eRead', 'Next meter reading', _ctrD(k.next_reading))}<div></div></div>`;
  const cost = `<div class="ctr-fs">Cost · ${_ctrE(s.cat ? s.name : s.kind)}</div>` +
    `<div class="ctr-2">${_ctrSel('eFreq', 'Rhythm', s.cat ? CTR_FREQ : CTR_FREQ_K, (s.cat ? CTR_FREQ : CTR_FREQ_K).some(x => x[0] === f) ? f : 'monatlich', ' data-rhythm')}<div></div></div>` +
    _ctrMonsH(dm, f === 'monatlich') +
    (s.cat ? `<label class="ctr-fl">NK-Abrechnung · split</label>${_ctrSegH('nkkey', [['personen', 'By person'], ['none', 'Not in NK']], s.cat.nk_key === 'none' ? 'none' : 'personen')}` +
      `<label class="ctr-fl">NK-Abrechnung · booking</label>${_ctrSegH('nkspread', [['month', 'In its month'], ['year', 'Over the year']], s.cat.nk_spread || 'month')}` : '');
  return kHTML + (s.cat || k ? cost : '') +
    (k ? `<label class="ctr-fl" for="eNote">Note</label><textarea class="ctr-in" id="eNote" placeholder="anything else">${_ctrE(k.note || '')}</textarea>` : '') +
    `<p class="ctr-hint">The price changes with New price, so past months stay right.</p>` +
    _ctrFoot('saveedit', k ? `<button type="button" class="ctr-del" data-ctr="delcontract">Delete contract</button>` : '');
}

/* New contract (from +, a property's "Add contract" or "Add next contract") */
function _ctrNewHTML() {
  const a = CTR.add || {}, props = _ctrShownProps();
  const pid = Number(a.pid || PVU_CASA), casa = pid === PVU_CASA;
  const cur = casa && a.catId && a.catId !== '__new' ? _ctrCat(a.catId) : null;
  const isNew = casa && a.catId === '__new';
  const now = cur ? _ctrNow(_ctrCatSlot(cur)) : { amount: null };
  const rhythm = a.rhythm || 'monatlich';
  return `<div class="ctr-hd"><div class="ctr-hd-t"><div class="ctr-kk">Utilities</div><div class="ctr-st">New contract</div><div class="ctr-sub">${_ctrE(_ctrPropName(pid))}</div></div>` +
    `<div class="ctr-hb"><button type="button" class="ctr-x" data-ctr="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div></div>` +
    `<div class="ctr-body ctr-full"><div class="ctr-fs">What</div>` +
    `<div class="ctr-2">${_ctrSel('nProp', 'Property', props.map(p => [p.id, p.name]), pid, ' data-keep')}` +
    (casa ? _ctrSel('nCat', 'Cost type', [['', 'choose']].concat(_ctrRows().map(c => [c.id, c.name])).concat([['__new', '+ New cost type']]), a.catId || '', ' data-keep')
          : _ctrSel('nKind', 'Type', PVU_KINDS.map(x => [x, x]), a.kind || 'Strom')) + `</div>` +
    (isNew ? _ctrInp('nName', 'New cost type', '', 'e.g. Haftpflicht') : '') +
    (isNew || !casa ? `<div class="ctr-2">${_ctrSel('nFreq', 'Rhythm', isNew ? CTR_FREQ : CTR_FREQ_K, rhythm, ' data-rhythm')}<div></div></div>` + _ctrMonsH(a.due || [], rhythm === 'monatlich') : '') +
    `<div class="ctr-2">${_ctrInp('nProv', 'Provider', a.provider || '', 'name')}${_ctrInp('nTariff', 'Tariff', '', 'optional')}</div>` +
    `<div class="ctr-fs">Price</div><div class="ctr-2">${_ctrAmtInp('nAmt', 'Price €', isNew || !casa ? '' : (now.amount || ''))}${_ctrMonInp('nFrom', 'From', a.start || '')}</div>` +
    (cur ? `<p class="ctr-hint">Now ${now.amount ? _ctrEur(now.amount) + ' / ' + _ctrPer(cur) : 'no price'}. A different price starts from the month above; earlier months keep theirs.</p>` : '') +
    `<div class="ctr-fs">Dates</div><div class="ctr-2">${_ctrDateInp('nStart', 'Start', a.start || '')}${_ctrDateInp('nUntil', 'Runs until', '')}</div>` +
    `<div class="ctr-2">${_ctrSel('nNotice', 'Notice', CTR_NOTICE, '1m')}${_ctrInp('nMin', 'Minimum (months)', '', 'optional', 'r', ' inputmode="numeric"')}</div>` +
    `<label class="ctr-fl">Then</label>${_ctrSegH('then', [['renew', 'Renews'], ['monthly', 'Monthly'], ['ends', 'Ends'], ['unknown', 'Not sure']], 'monthly')}` +
    `<div class="ctr-fs">Numbers</div><div class="ctr-2">${_ctrInp('nCust', 'Customer no.', '', 'optional')}${_ctrInp('nMeter', 'Meter no.', '', 'optional')}</div>` +
    `<div class="ctr-2">${_ctrInp('nVia', 'Booked via', '', 'e.g. CHECK24')}${_ctrInp('nViaNo', 'Its number', '', 'optional')}</div>` +
    _ctrInp('nPortal', 'Portal (web address)', '', 'optional', '', ' inputmode="url" autocapitalize="off"') +
    _ctrFileInp('Contract (PDF, optional)') +
    `<p class="ctr-hint">Bonuses and more details can be added after saving.</p>` +
    `<div class="ctr-ft"><button type="button" class="pvu-bg" data-ctr="close">Cancel</button><button type="button" class="pvu-bp" data-ctr="savenew">Save</button></div></div>`;
}

/* ── events ────────────────────────────────────────────────── */
document.addEventListener('click', async e => {
  const t = e.target.closest('#pvaUtil [data-ctr]'); if (!t || CTR.busy) return;
  const a = t.dataset.ctr, pid = Number(t.dataset.p);
  if (a === 'open') return ctrOpen(t.dataset.s);
  if (a === 'new') { CTR.add = { pid: PVU_CASA }; return ctrOpen('new'); }
  if (a === 'newfor') { CTR.add = { pid }; return ctrOpen('new'); }
  if (a === 'fold') { CTR.fold[pid] = CTR.fold[pid] === false; try { localStorage.setItem('pvu_fold', JSON.stringify(CTR.fold)); } catch (er) {} return pvuRender(); }
  if (a === 'addprop') { CTR.addProp = true; return pvuRender(); }
  if (a === 'addpropno') { CTR.addProp = false; return pvuRender(); }
  if (a === 'addpropok' || a === 'rmprop') {
    CTR.busy = true;
    try {
      if (a === 'addpropok') {
        const v = Number(document.getElementById('pvuAddProp')?.value); if (!v) return;
        _ctrQ(await _pvuDb().from('house_utility_props').insert({ property_id: v }));
        CTR.addProp = false; CTR.fold[v] = true;
        await _ctrFetch(); pvuRender(); _ctrToast(_ctrPropName(v) + ' added');
      } else {
        if (CTR.cons.some(k => _ctrPid(k) === pid)) return;
        _ctrQ(await _pvuDb().from('house_utility_props').delete().eq('property_id', pid));
        await _ctrFetch(); pvuRender(); _ctrToast('Removed from Utilities');
      }
    } catch (er) { _ctrFail(er); }
    finally { CTR.busy = false; }
  }
});
function _ctrSegVal(name) { const b = document.querySelector(`#pvuScrim [data-seg="${name}"] button.on`); return b ? b.dataset.v : null; }
const _ctrVal = id => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
const _ctrMonsVal = () => [...document.querySelectorAll('#pvuScrim [data-mons] button.on')].map(b => +b.dataset.m);
/* New contract: property / cost type changed → repaint, keeping what was typed */
function _ctrKeepNew(patch) {
  const box = document.querySelector('#pvuScrim .cc-modal-sheet'); if (!box) return;
  const keep = {};
  box.querySelectorAll('input[id]:not([type=file]), select[id]').forEach(el => { keep[el.id] = el.value; });
  const then = _ctrSegVal('then');
  CTR.add = Object.assign({}, CTR.add || {}, { due: _ctrMonsVal() }, patch);
  _ctrPaint();
  Object.entries(keep).forEach(([id, v]) => { const el = document.getElementById(id); if (el && !(id in patch) && !['nProp', 'nCat'].includes(id)) el.value = v; });
  if (then) document.querySelector(`#pvuScrim [data-seg="then"] button[data-v="${then}"]`)?.click();
}
function _ctrChange(e) {
  const id = e.target.id;
  if (id === 'ctrFile') {
    const f = e.target.files && e.target.files[0];
    const span = e.target.closest('.ctr-file')?.querySelector('[data-file-name]');
    if (span) span.textContent = f ? f.name : 'Add PDF';
  }
  if (id === 'ctrBoKind') {                                // points ⇄ amount: swap just that field
    const pts = e.target.value === 'Punkte';
    if (pts !== !!document.getElementById('ctrBoPts')) _ctrSwapPts(pts);
  }
  if (e.target.hasAttribute('data-rhythm')) {              // due months only for quarterly / yearly / as needed
    const w = e.target.closest('.cc-modal-sheet').querySelector('[data-mons-wrap]');
    if (w) w.hidden = e.target.value === 'monatlich';
  }
  if (id === 'nProp') _ctrKeepNew({ pid: Number(e.target.value), catId: '' });
  if (id === 'nCat') _ctrKeepNew({ catId: e.target.value });
}
function _ctrSwapPts(pts) {
  const s = document.getElementById('ctrBoKind'); if (!s) return;
  const cell = s.closest('.ctr-2').children[1];
  cell.outerHTML = pts ? _ctrInp('ctrBoPts', 'Points', '', '0', 'r', ' inputmode="numeric"') : _ctrAmtInp('ctrBoAmt', 'Amount €', '');
}
async function _ctrClick(e) {
  const seg = e.target.closest('#pvuScrim .ctr-seg button');
  if (seg) {
    seg.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === seg));
    if (seg.parentElement.dataset.seg === 'reason') { CTR.arg = seg.dataset.v; _ctrPaint(); }
    return;
  }
  const mon = e.target.closest('#pvuScrim [data-mons] button');
  if (mon) { mon.classList.toggle('on'); return; }
  const t = e.target.closest('#pvuScrim [data-ctr]'); if (!t || CTR.busy) return;
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
  catch (err) { _ctrFail(err); }
  finally { CTR.busy = false; }
}
/* after any change: fresh data, back to the read view inside the pop-up */
async function _ctrAfter(msg) {
  await _ctrFetch();
  CTR.form = ''; CTR.arg = null;
  pvuRender();
  if (CTR.open !== null) _ctrPaint();
  if (msg) _ctrToast(msg);
}
const _ctrQ = r => { if (r && r.error) throw r.error; return r ? r.data : null; };
const _ctrCur = () => { const s = _ctrSlot(CTR.open); return s ? { s, k: _ctrMain(s) } : { s: null, k: null }; };

async function _ctrAct(act, ds) {
  const { s, k } = _ctrCur(), st = s ? _ctrState(s) : null, t = _ctrT(), db = _pvuDb();
  if (act === 'controlling') {
    try { sessionStorage.setItem('ctl_open', s && s.pid !== PVU_CASA ? 'rentals-oneoff' : 'casa-oneoff'); } catch (e) {}
    location.href = 'controlling.html'; return;
  }
  if (act === 'cancelform') { CTR.form = 'cancel'; CTR.arg = null; return _ctrPaint(); }
  if (act === 'confirmdoc') { CTR.form = 'doc'; CTR.arg = 'confirmation'; return _ctrPaint(); }
  if (act === 'addnext') {
    const end = k ? _ctrEnd(k) : null;
    CTR.add = { pid: s ? s.pid : PVU_CASA, catId: s && s.cat ? s.cat.id : '', kind: s && !s.cat ? s.kind : '', rhythm: k && k.rhythm ? k.rhythm : 'monatlich', due: k && k.due_months ? k.due_months : [], start: end ? _ctrAddD(end, 1) : '' };
    CTR.open = 'new'; CTR.form = ''; return _ctrPaint();
  }
  if (!k || !st) return;
  const upd = f => db.from('house_contracts').update(f).eq('id', k.id);
  const updB = (id, f) => db.from('house_contract_bonuses').update(f).eq('id', id);
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

function _ctrDateInSafe(id) {
  const v = _ctrVal(id); if (!v) return null;
  const iso = ccParseDate(v); if (!iso) { _ctrToast('Date: TT.MM.JJJJ'); return false; }
  return iso;
}
const _ctrAmtOrNull = id => { const v = _ctrVal(id); return v ? ccParseEUR(v) : null; };

/* New price · Korrektur */
async function _ctrSavePrice() {
  const { s, k } = _ctrCur(); if (!s) return;
  const db = _pvuDb(), energy = _ctrIsEnergy(s), reason = _ctrSegVal('reason') || 'Preiserhöhung';
  const amt = ccParseEUR(_ctrVal('ctrPrAmt'));
  if (amt === null || amt < 0) { _ctrToast('Enter the price'); return; }
  const w = energy ? _ctrAmtOrNull('ctrPrWork') : null, g = energy ? _ctrAmtOrNull('ctrPrBase') : null;
  if ((energy && _ctrVal('ctrPrWork') && w === null) || (energy && _ctrVal('ctrPrBase') && g === null)) { _ctrToast('Arbeitspreis / Grundpreis: e.g. 16,60'); return; }
  const list = _ctrPeriodsOf(s), now = _ctrNow(s);
  const T = s.cat ? 'ctrl_castel_amount_history' : 'house_contract_prices';
  if (reason === 'Korrektur') {
    const f = { amount: _ctrR(amt) };
    if (energy) { f.work_price = w; f.base_price = g; }
    if (now.row) _ctrQ(await db.from(T).update(f).eq('id', now.row.id));
    else if (s.cat) {
      if (energy && (w !== null || g !== null)) _ctrQ(await db.from(T).insert(Object.assign({ category_id: s.cat.id, valid_from: '2000-01-01', reason: 'Start' }, f)));
      _ctrQ(await db.from('ctrl_castel_categories').update({ default_amount: _ctrR(amt) }).eq('id', s.cat.id));
    } else {
      if (!k) return;
      const from = k.starts_on ? _ctrD(k.starts_on).slice(0, 7) + '-01' : _ctrT().slice(0, 7) + '-01';
      _ctrQ(await db.from(T).insert(Object.assign({ contract_id: k.id, valid_from: from, reason: 'Start' }, f)));
    }
    return _ctrAfter('Price corrected');
  }
  const from = _ctrParseMonth(_ctrVal('ctrPrFrom'));
  if (!from) { _ctrToast('Gilt ab: MM.JJJJ'); return; }
  if (list.some(h => _ctrD(h.valid_from) === from)) { _ctrToast('There is already a price from ' + _ctrMY(from) + ' – use Korrektur'); return; }
  if (!s.cat && !k) { _ctrToast('Add the contract first'); return; }
  const spec = _ctrDateInSafe('ctrPrSpec'); if (spec === false) return;
  const letter = await _ctrUpload(k, 'price');
  if (letter === false) return;
  if (s.cat && !list.length)                                 // Casa Castel: keep every month before it at today's price
    _ctrQ(await db.from(T).insert({ category_id: s.cat.id, valid_from: '2000-01-01', amount: _ctrR(_ctrN(s.cat.default_amount)), reason: 'Start' }));
  const row = s.cat ? { category_id: s.cat.id, valid_from: from, amount: _ctrR(amt), reason, contract_id: k ? k.id : null }
                    : { contract_id: k.id, valid_from: from, amount: _ctrR(amt), reason };
  if (spec) row.special_cancel_until = spec;
  if (letter) row.letter_path = letter;
  if (w !== null) row.work_price = w;
  if (g !== null) row.base_price = g;
  _ctrQ(await db.from(T).insert(row));
  return _ctrAfter('New price from ' + _ctrMY(from));
}

/* Cancel */
async function _ctrSaveCancel() {
  const { k } = _ctrCur(); if (!k) return;
  const on = _ctrDateInSafe('ctrCnOn'), end = _ctrDateInSafe('ctrCnEnd');
  if (on === false || end === false) return;
  if (!on || !end) { _ctrToast('Enter both dates'); return; }
  const letter = await _ctrUpload(k, 'cancellation'); if (letter === false) return;
  const conf = _ctrSegVal('conf') === 'received';
  _ctrQ(await _pvuDb().from('house_contracts').update({ cancelled_on: on, ends_on: end, cancel_confirmed_on: conf ? _ctrT() : null, no_successor: false }).eq('id', k.id));
  return _ctrAfter('Cancelled · ends ' + _ctrF(end));
}

/* Bonus */
async function _ctrSaveBonus() {
  const { k } = _ctrCur(); if (!k) return;
  const b = CTR.arg ? CTR.bons.find(x => _ctrId(x.id) === _ctrId(CTR.arg)) : null;
  if (_ctrBooked(b)) return;                                 // booked in Controlling: read only here
  const kind = _ctrVal('ctrBoKind') || 'Bonus', pts = kind === 'Punkte';
  const row = { kind, source: _ctrSegVal('bsrc') || 'check24', in_nk: _ctrVal('ctrBoNk') === '1', condition: _ctrVal('ctrBoCond') || null };
  if (pts) { const p = parseInt(_ctrVal('ctrBoPts'), 10); if (!(p > 0)) { _ctrToast('Enter the points'); return; } row.points = p; row.amount = null; row.paid = 'points'; }
  else { const a = ccParseEUR(_ctrVal('ctrBoAmt')); if (a === null || a <= 0) { _ctrToast('Enter the amount'); return; } row.amount = _ctrR(a); row.points = null; row.paid = _ctrSegVal('bpaid') || 'account'; }
  const ex = _ctrVal('ctrBoExp');
  if (ex) { const m = _ctrParseMonth(ex); if (!m) { _ctrToast('Expected: MM.JJJJ'); return; } row.expected_on = m; } else row.expected_on = null;
  const db = _pvuDb();
  if (b) {
    let st = _ctrSegVal('bstat') || b.status;
    if (st === 'received' && row.paid === 'account') st = b.status;           // money to the account: only Controlling confirms it
    if (st !== b.status) { row.status = st; row.status_on = _ctrT(); }
    _ctrQ(await db.from('house_contract_bonuses').update(row).eq('id', b.id));
    return _ctrAfter('Bonus saved');
  }
  row.contract_id = k.id; row.status = 'open';
  _ctrQ(await db.from('house_contract_bonuses').insert(row));
  return _ctrAfter('Bonus added');
}
async function _ctrDelBonus(id) {
  const ok = typeof ccConfirm === 'function' ? await ccConfirm('Delete this bonus?', 'It is removed from the contract.', 'Delete', true) : true;
  if (!ok) return;
  _ctrQ(await _pvuDb().from('house_contract_bonuses').delete().eq('id', id));
  return _ctrAfter('Bonus deleted');
}

/* Documents */
async function _ctrUpload(k, kind) {                         // → storage path, null (no file) or false (failed)
  const input = document.getElementById('ctrFile');
  const f = input && input.files && input.files[0];
  if (!f) return null;
  if (!k) { _ctrToast('Add the contract first, then its PDFs'); return false; }
  if (!/pdf$/i.test(f.type || '') && !/\.pdf$/i.test(f.name || '')) { _ctrToast('Please choose a PDF'); return false; }
  const safe = String(f.name || 'document.pdf').replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = k.id + '/' + Date.now() + '-' + safe, db = _pvuDb();
  const up = await db.storage.from(CTR_BUCKET).upload(path, f, { contentType: 'application/pdf', upsert: false });
  if (up && up.error) { console.error('[utilities] upload', up.error); _ctrToast('The PDF could not be uploaded'); return false; }
  _ctrQ(await db.from('house_contract_docs').insert({ contract_id: k.id, kind, name: f.name || safe, path }));
  return path;
}
async function _ctrSaveDoc() {
  const { k } = _ctrCur(); if (!k) return;
  if (!document.getElementById('ctrFile')?.files?.[0]) { _ctrToast('Choose a PDF first'); return; }
  const kind = _ctrSegVal('dkind') || 'other';
  const p = await _ctrUpload(k, kind);
  if (p === false) return;
  if (kind === 'confirmation' && k.cancelled_on && !k.cancel_confirmed_on)   // the confirmation letter = confirmed
    _ctrQ(await _pvuDb().from('house_contracts').update({ cancel_confirmed_on: _ctrT() }).eq('id', k.id));
  return _ctrAfter(kind === 'confirmation' && k.cancelled_on ? 'PDF added · confirmation noted' : 'PDF added');
}
function _ctrOpenDoc(id) {
  const d = CTR.docs.find(x => _ctrId(x.id) === _ctrId(id)); if (!d) return;
  const w = window.open('', '_blank');                       // opened at the tap, the link follows (iPhone app too)
  _pvuDb().storage.from(CTR_BUCKET).createSignedUrl(d.path, 300).then(({ data, error }) => {
    if (error || !data || !data.signedUrl) { if (w) w.close(); _ctrToast('Could not open the document'); return; }
    if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank');
  });
}
async function _ctrDelDoc(id) {
  const d = CTR.docs.find(x => _ctrId(x.id) === _ctrId(id)); if (!d) return;
  const ok = typeof ccConfirm === 'function' ? await ccConfirm('Delete this PDF?', _ctrE(d.name || ''), 'Delete', true) : true;
  if (!ok) return;
  const db = _pvuDb();
  await db.storage.from(CTR_BUCKET).remove([d.path]);
  _ctrQ(await db.from('house_contract_docs').delete().eq('id', d.id));
  return _ctrAfter('PDF deleted');
}

/* Edit */
async function _ctrSaveEdit() {
  const { s, k } = _ctrCur(); if (!s) return;
  const db = _pvuDb();
  const dms = _ctrMonsVal();
  const freq = _ctrVal('eFreq') || (s.cat ? s.cat.frequency : 'monatlich') || 'monatlich';
  const due = freq === 'monatlich' ? null : (dms.length ? dms : null);
  let newKey = CTR.open;
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
    if (!s.cat) {                                            // other property: type, rhythm and months live on the contract
      row.kind = _ctrVal('eKind') || s.kind; row.rhythm = freq; row.due_months = due;
      newKey = 'p:' + s.pid + ':' + row.kind;
    }
    _ctrQ(await db.from('house_contracts').update(row).eq('id', k.id));
  }
  if (s.cat) {
    const key = _ctrSegVal('nkkey') || 'personen';
    _ctrQ(await db.from('ctrl_castel_categories').update({ frequency: freq, due_months: due,
      nk_key: key === 'personen' && s.cat.nk_key && s.cat.nk_key !== 'none' ? s.cat.nk_key : key,   // "by area" stays as stored (split by person anyway)
      nk_spread: _ctrSegVal('nkspread') || s.cat.nk_spread || 'month' }).eq('id', s.cat.id));
  }
  CTR.open = newKey;
  return _ctrAfter('Saved');
}
async function _ctrDelContract() {
  const { k } = _ctrCur(); if (!k) return;
  const ok = typeof ccConfirm === 'function' ? await ccConfirm('Delete this contract?', 'Its dates, bonuses and PDFs are no longer shown.', 'Delete', true) : true;
  if (!ok) return;
  _ctrQ(await _pvuDb().from('house_contracts').update({ deleted_at: new Date().toISOString() }).eq('id', k.id));
  const s = _ctrSlot(CTR.open);
  await _ctrFetch();
  if (s && !s.cat && !_ctrConsOf(s).length) { CTR.open = null; ctrClose(); pvuRender(); _ctrToast('Contract deleted'); return; }
  return _ctrAfter('Contract deleted');
}

/* New contract */
async function _ctrSaveNew() {
  const db = _pvuDb(), pid = Number(_ctrVal('nProp') || PVU_CASA), casa = pid === PVU_CASA;
  let catId = casa ? _ctrVal('nCat') : '';
  if (casa && !catId) { _ctrToast('Choose the cost type'); return; }
  const prov = _ctrVal('nProv');
  if (!prov) { _ctrToast('Enter the provider'); return; }
  const start = _ctrDateInSafe('nStart'), until = _ctrDateInSafe('nUntil');
  if (start === false || until === false) return;
  const amtTxt = _ctrVal('nAmt'), amt = amtTxt ? ccParseEUR(amtTxt) : null;
  if (amtTxt && (amt === null || amt < 0)) { _ctrToast('Price: e.g. 56,00'); return; }
  const fromTxt = _ctrVal('nFrom');
  const from = fromTxt ? _ctrParseMonth(fromTxt) : (start ? start.slice(0, 7) + '-01' : null);
  if (fromTxt && !from) { _ctrToast('From: MM.JJJJ'); return; }
  const freq = _ctrVal('nFreq') || 'monatlich', dms = _ctrMonsVal();
  const due = freq === 'monatlich' ? null : (dms.length ? dms : null);
  if (freq !== 'monatlich' && freq !== 'sporadisch' && !due) { _ctrToast('Choose the months it is due'); return; }
  const kind = casa ? null : (_ctrVal('nKind') || 'Other');
  if (casa && catId === '__new') {
    const name = _ctrVal('nName');
    if (!name) { _ctrToast('Name the new cost type'); return; }
    const code = name.toUpperCase().replace(/[ÄÖÜ]/g, x => ({ 'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE' }[x])).replace(/ß/g, 'SS').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'COST';
    const maxSort = Math.max(0, ...CTR.cats.map(x => _ctrN(x.sort_order)));
    const ins = _ctrQ(await db.from('ctrl_castel_categories').insert({ name, code, frequency: freq, due_months: due, default_amount: amt !== null ? _ctrR(amt) : 0,
      active: true, sort_order: maxSort + 1, nk_key: 'personen', nk_spread: 'month' }).select().single());
    catId = ins ? ins.id : null;
    if (!catId) throw new Error('cost type not saved');
  } else if (casa && amt !== null) {
    const c = _ctrCat(catId), sl = _ctrCatSlot(c), now = from ? _ctrPriceAt(sl, from) : _ctrNow(sl), list = _ctrPeriods(c.id);
    if (_ctrR(amt) !== _ctrR(now.amount)) {
      if (!from) { _ctrToast('From: the month the new price starts'); return; }
      if (list.some(h => _ctrD(h.valid_from) === from)) _ctrQ(await db.from('ctrl_castel_amount_history').update({ amount: _ctrR(amt) }).eq('category_id', c.id).eq('valid_from', from));
      else {
        if (!list.length) _ctrQ(await db.from('ctrl_castel_amount_history').insert({ category_id: c.id, valid_from: '2000-01-01', amount: _ctrR(_ctrN(c.default_amount)), reason: 'Start' }));
        _ctrQ(await db.from('ctrl_castel_amount_history').insert({ category_id: c.id, valid_from: from, amount: _ctrR(amt), reason: 'Neuer Vertrag' }));
      }
    }
  }
  const intOr = v => { const n = parseInt(v, 10); return n > 0 ? n : null; };
  const then = _ctrSegVal('then') || 'unknown';
  const row = {
    property_id: pid, category_id: casa ? catId : null, kind, rhythm: casa ? null : freq, due_months: casa ? null : due,
    provider: prov, tariff: _ctrVal('nTariff') || null, starts_on: start, runs_until: until,
    notice: _ctrVal('nNotice') || 'unknown', then_rule: then, renew_months: then === 'renew' ? 12 : null, min_months: intOr(_ctrVal('nMin')),
    customer_no: _ctrVal('nCust') || null, meter_no: _ctrVal('nMeter') || null, booked_via: _ctrVal('nVia') || null, booking_no: _ctrVal('nViaNo') || null,
    portal: _ctrVal('nPortal') || null,
  };
  const k = _ctrQ(await db.from('house_contracts').insert(row).select().single());
  if (k && !casa && amt !== null)
    _ctrQ(await db.from('house_contract_prices').insert({ contract_id: k.id, valid_from: from || _ctrT().slice(0, 7) + '-01', amount: _ctrR(amt), reason: 'Start' }));
  if (k && document.getElementById('ctrFile')?.files?.[0]) await _ctrUpload(k, 'contract');
  if (!CTR.uprops.some(u => Number(u.property_id) === pid))
    await db.from('house_utility_props').insert({ property_id: pid });   // the property shows in Utilities from now on
  CTR.open = casa ? 'c:' + catId : 'p:' + pid + ':' + kind; CTR.add = null; CTR.fold[pid] = true;
  return _ctrAfter('Contract added');
}
