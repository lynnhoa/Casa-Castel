/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — MAINTENANCE RETURNS (Nov 2026 · owner decisions 07.11.2026)
   settlements-returns.js   (loaded by settlements.html before the tabs)

   A Maintenance return (maint_costs.return_of = its receipt) is never a line of its own in Settlements:
   · NK — Casa Castel Teil A and Rentals NK: the receipt counts at its net price = receipt − its counted returns.
     Each return has a switch on your screen: Counted (default) · Not counted (maint_costs.settle_count,
     SETTLEMENTS-RETURNS.sql). Not counted → the receipt counts higher by that return.
   · Teil B Kleinreparatur: every return always counts (the lower price; the § 7 limit is on the net) — no switch.
   · Teil B Schaden: the same switch as the NK.
   · Letters and PDFs never show that a return exists or was left out — no line, no word. Only this screen does.
   · A return counts with its receipt (in the receipt's period), whatever its own date.
   · A locked Casa year keeps its snapshot, and a Rentals NK whose letter went out keeps its costs: there the
     returns are shown without a switch, marked "in / not in" the frozen figures.
   · A receipt returned in full is in no line — your screen still lists it (0,00 €) with its returns and switches.
   Without the SQL file: every return counts and no switch is shown. Without the Maintenance tables: nothing changes.
   ───────────────────────────────────────────────────────────── */

'use strict';

const ST_RET = { rows: [], byId: {}, byReceipt: {}, col: false, loaded: false, error: null, p: null };

function _stRetIndex(rows, col) {
  ST_RET.rows = rows; ST_RET.col = !!col; ST_RET.loaded = true; ST_RET.byId = {}; ST_RET.byReceipt = {};
  for (const x of rows) {
    if (!x || x.id === null || x.id === undefined || !x.return_of) continue;
    ST_RET.byId[String(x.id)] = x;
    (ST_RET.byReceipt[String(x.return_of)] = ST_RET.byReceipt[String(x.return_of)] || []).push(x);
  }
  for (const k of Object.keys(ST_RET.byReceipt))
    ST_RET.byReceipt[k].sort((a, b) => String(a.cost_date || '').localeCompare(String(b.cost_date || '')) || String(a.id).localeCompare(String(b.id)));
}

/* the reasons a read may fail "for good": no Maintenance (table or return_of missing) · no switch yet (settle_count missing) */
const _stRetMsg = e => String((e && (e.message || '')) + ' ' + (e && (e.details || '')) + ' ' + (e && (e.hint || '')));
const stRetNoTable = e => !!e && (['42P01', 'PGRST205'].includes(String(e.code || ''))
  || /relation "?(public\.)?maint_costs"? does not exist|could not find the table '?(public\.)?maint_costs/i.test(_stRetMsg(e))
  || /return_of/.test(_stRetMsg(e)) && (['42703', 'PGRST204'].includes(String(e.code || '')) || /does not exist|schema cache/i.test(_stRetMsg(e))));
const stRetNoCol = e => !!e && /settle_count/.test(_stRetMsg(e));

/* every Maintenance return (small table; past 1000 rows in pages) · without settle_count (SQL not run) → all counted.
   One read at a time (the callers share it). Loaded again with every Casa year (never older than its one-offs).
   A read that fails for another reason (network, timeout …) keeps what was loaded before and sets ST_RET.error:
   a warning, no lock and no NK sync until it loads (the letters can never show a return either way: stRetIsLine). */
function stLoadReturns() {
  if (ST_RET.p) return ST_RET.p;
  ST_RET.p = _stLoadReturnsNow().finally(() => { ST_RET.p = null; });
  return ST_RET.p;
}
async function _stLoadReturnsNow() {
  const read = async cols => {
    const q = () => _ctlSupa.from('maint_costs').select(cols).not('return_of', 'is', null);
    const r = await q();
    return typeof ctlReadAll === 'function' ? ctlReadAll(r, q, 'maint_costs (returns)') : r;
  };
  try {
    let col = true, r = await read('id,return_of,amount,cost_date,settle_count');
    if (r.error && stRetNoCol(r.error) && !stRetNoTable(r.error)) { col = false; r = await read('id,return_of,amount,cost_date'); }
    if (r.error) throw r.error;
    _stRetIndex(r.data || [], col); ST_RET.error = null;
  } catch (e) {
    if (stRetNoTable(e)) { _stRetIndex([], false); ST_RET.error = null; return; }   // no Maintenance tables → nothing changes
    ST_RET.error = String((e && (e.message || e.code)) || e || 'error');            // keep the returns loaded before
    console.warn('[settlements] Maintenance returns:', ST_RET.error);
  }
}
const stRetFailTxt = 'Maintenance returns could not be loaded – reload the page';

const stRetOf = receiptId => (receiptId === null || receiptId === undefined ? [] : ST_RET.byReceipt[String(receiptId)] || []);
const stRetIsReturn = maintCostId => maintCostId !== null && maintCostId !== undefined && !!ST_RET.byId[String(maintCostId)];
/* a Controlling line that is a Maintenance return: in the map, or booked as one (Maintenance books a receipt −1 and a
   return +1 · MAINTENANCE-D39.sql) — so a return the map does not know yet is still never a line of its own */
const stRetIsLine = o => !!o && o.maint_cost_id !== null && o.maint_cost_id !== undefined && o.maint_cost_id !== '' &&
  (stRetIsReturn(o.maint_cost_id) || Number(o.direction) === 1);
/* counted unless switched off (no switch column → always counted) */
const stRetOn = x => !(ST_RET.col && x && x.settle_count === false);
const stRetAmt = x => Math.abs(Number(x && x.amount) || 0);
/* the net of a Controlling line: receipt − its counted returns (other lines: their amount) */
function stRetNetAmt(o) {
  const gross = Math.abs(Number(o && o.amount) || 0), rets = o ? stRetOf(o.maint_cost_id) : [];
  if (!rets.length) return gross;
  return Math.max(0, Math.round((gross - rets.reduce((a, x) => a + (stRetOn(x) ? stRetAmt(x) : 0), 0)) * 100) / 100);
}

/* NK rule on Controlling one-off lines: a Maintenance return never stays a line; its receipt counts at its net price
   (receipt − its counted returns). A receipt returned in full (net 0) is left out — into `zero` when given (your
   screen shows it with its returns, so their switch stays in reach). Other lines stay as they are. */
function stRetNetLines(list, zero) {
  const out = [];
  for (const o of (list || [])) {
    if (!o) continue;
    if (stRetIsLine(o)) continue;
    const rets = stRetOf(o.maint_cost_id);
    if (!rets.length) { out.push(o); continue; }
    const gross = Math.abs(Number(o.amount) || 0), net = stRetNetAmt(o);
    if (net <= 0.004) { if (Array.isArray(zero)) zero.push(o); continue; }
    out.push(Object.assign({}, o, { amount: net, _retGross: gross }));
  }
  return out;
}

/* a locked year / a letter sent: which returns are in the frozen figure (gross − frozen = the returns it subtracted)?
   → Set of return ids · null when it cannot be told (no frozen figure, or two ways to reach it) */
function _stRetFrozen(rets, gross, frozen) {
  if (gross === null || gross === undefined || frozen === null || frozen === undefined || rets.length > 12) return null;
  const want = Math.round((Math.abs(Number(gross) || 0) - Math.abs(Number(frozen) || 0)) * 100);
  const c = rets.map(x => Math.round(stRetAmt(x) * 100));
  let hit = -1;
  for (let m = 0; m < (1 << rets.length); m++) {
    let s = 0; for (let i = 0; i < rets.length; i++) if (m & (1 << i)) s += c[i];
    if (s !== want) continue;
    if (hit >= 0) return null;                                // two ways → not known
    hit = m;
  }
  return hit < 0 ? null : new Set(rets.filter((x, i) => hit & (1 << i)).map(x => String(x.id)));
}

/* Your screen only: the returns under a receipt — "↳ Rückgabe 20.03.2026 · 50,00 €  [Counted]".
   o.fixed: Kleinreparatur (always counted, no switch) · o.locked: 'locked' (a locked year) or 'sent' (a letter went
   out) — no switch, and the status says what the frozen figure holds (o.gross receipt, o.frozen its frozen amount) */
function stRetRowsHtml(receiptId, o) {
  const rets = stRetOf(receiptId); if (!rets.length) return '';
  o = o || {};
  const lk = o.locked ? (o.locked === 'sent' ? 'the NK sent' : 'the locked NK') : '';
  const fz = o.locked ? _stRetFrozen(rets, o.gross, o.frozen) : null;
  return '<div class="st-ret">' + rets.map(x => {
    const name = 'Rückgabe ' + stDate(x.cost_date) + ' · ' + stEur(stRetAmt(x));
    let on, st;
    if (o.locked) { on = fz ? fz.has(String(x.id)) : true; st = !fz ? (o.locked === 'sent' ? 'NK sent' : 'locked') : on ? 'in ' + lk : 'not in ' + lk; }
    else { on = o.fixed || stRetOn(x); st = o.fixed ? 'always counted' : on ? 'counted' : 'not counted'; }
    const sw = !o.fixed && !o.locked && ST_RET.col;
    return '<div class="st-ret__r' + (on ? '' : ' is-off') + '"><span class="st-ret__l"><i class="ti ti-corner-down-right" aria-hidden="true"></i>' + stEsc(name) + '</span>' +
      (sw ? '<button type="button" class="st-ret__sw' + (on ? ' is-on' : '') + '" role="switch" aria-checked="' + on + '" data-stret="' + stEsc(x.id) + '" aria-label="' +
              stEsc('Count ' + name) + '"><span aria-hidden="true">' + (on ? 'Counted' : 'Not counted') + '</span><i aria-hidden="true"></i></button>'
          : '<span class="st-ret__st">' + stEsc(st) + '</span>') + '</div>';
  }).join('') + '</div>';
}
/* a receipt returned in full: one muted row (0,00 €) with its returns — your screen only, never a line anywhere */
function stRetZeroHtml(label, sub, receiptId, o) {
  return '<div class="st-ret0"><span class="st-ret0__m"><b>' + stEsc(label) + '</b><small>' + stEsc(sub) + '</small></span><span class="st-ret0__v">' + stEur(0) + '</span></div>' +
    stRetRowsHtml(receiptId, o);
}

/* the switch: saved on the return in Maintenance (one decision, used by every Settlements view) */
async function stRetSwitch(id, on) {
  const x = ST_RET.byId[String(id)];
  if (!x || !ST_RET.col) return false;
  const { error } = await _ctlSupa.from('maint_costs').update({ settle_count: !!on }).eq('id', x.id);
  if (error) { if (typeof stSay === 'function') stSay('Could not save — ' + (error.message || error)); return false; }
  x.settle_count = !!on;
  return true;
}

/* after a switch: every view that counts it is calculated again (Casa year model, Rentals NK costs) */
async function stRetRerender() {
  if (typeof ctlSettlementInvalidate === 'function') ctlSettlementInvalidate();
  if (typeof SC !== 'undefined' && SC && SC.loaded && typeof scModel === 'function' && typeof stRenderCasa === 'function') {
    const m = SC.modal;
    try { SC.model = scModel(SC.year); } catch (e) { console.warn('[settlements] returns · Casa', e); }
    if (ST.tab === 'casa') stRenderCasa();
    SC.modal = m;
    if (m && typeof scRenderModal === 'function') scRenderModal();
  }
  if (typeof SR !== 'undefined' && SR && SR.loaded && ST.tab === 'rentals' && typeof stRenderRentals === 'function') {
    // a change you typed a moment ago is saved first — else the sync skips this NK and the receipt keeps its old amount
    if (typeof _srAutoFlush === 'function') { try { await _srAutoFlush(); } catch (e) { console.warn('[settlements] returns · save', e); } }
    stRenderRentals();                                       // starts the NK sync: the costs that came in by themselves follow
    for (let i = 0; i < 60 && typeof _srNkAutoBusy !== 'undefined' && _srNkAutoBusy; i++) await new Promise(r => setTimeout(r, 50));
    if (SR.modal && !SR.dirty) SR.draft = null;
    if (SR.modal && SR.dirty && typeof _srRetPatchDraft === 'function') _srRetPatchDraft();   // still unsaved: its amounts follow here
    if (typeof _srRerenderPanel === 'function') _srRerenderPanel();
  }
}

if (typeof document !== 'undefined') document.addEventListener('click', async e => {
  const b = e.target && e.target.closest ? e.target.closest('[data-stret]') : null;
  if (!b) return;
  e.preventDefault(); e.stopPropagation();                   // the row's own handlers (links, folds) stay quiet
  if (b.disabled) return;
  const x = ST_RET.byId[String(b.dataset.stret)]; if (!x) return;
  b.disabled = true;
  try { if (await stRetSwitch(x.id, !stRetOn(x))) await stRetRerender(); }
  finally { b.disabled = false; }
}, true);
