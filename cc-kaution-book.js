/* ─────────────────────────────────────────────────────────────
   cc-kaution-book.js — K1b (Nov 2026): what the Kaution card keeps for RENT OWED and DAMAGE
   counts in Controlling by itself. Entered ONCE, on the Kaution card (both apps), nowhere else.
   Loaded after cc-kaution-card.js by landlord.html (Casa, app 'tn') and rentals-index.html ('rnt').

   Needs KAUTION-K1B.sql (kaution.kept · rnt_kaution.kept · ctrl_income_months.kau_part). Until it has run
   the loaded Kaution rows have no 'kept' key: no new row is shown, nothing is read or written — the card is K1.

   The card writes three states, each one safe to write again (a re-save or a double tap writes nothing):
     1 Rent owed  → this tenant's part of the rent month in ctrl_income_months (split[tid] + kau_part[tid])
     2 Damage     → ONE income line in ctrl_expense_one_time, found by source_ref 'kau:<tn|rnt>:<kaution id>'
                    '<Zimmer/flat> · Erstattung Mieter · <Reason> · aus Kaution', dated "Settled on"
     3 the Kaution row with `kept` (written last, by the card)
   Bookings exist only while the card is settled ("Settled on" filled, or everything kept after the move-out).
   Every Save also takes back this tenant's part in every month that is no longer on the card (reconcile), so a
   Save that failed between the bookings and the Kaution row heals itself on the next Save.
   Fix 3: such a failed Save also puts the bookings back to the saved card at once (same queue), and opening a
   moved-out tenant's pop-up sets them back quietly when they still differ (ccKauHeal) — the card and Controlling
   never stay out of step. The receipts of all moved-out tenants are read once after the Tenants page is drawn.
   "Kept · other reasons", "Kept · for NK-Abrechnung", the refund and the Kaution itself book nothing (R1).
   Nothing is written to Maintenance, Settlements or Controlling's own files.
   ───────────────────────────────────────────────────────────── */

const _CCKB = { rc: {}, want: {}, seq: 0, pre: {}, ok: {} };   // rc: app|tid → { list } receipts (loaded once) · { p } on its way · want: the last pop-up asked for
                                                           // pre: app → the prefetch ran · ok: app|tid → bookings checked against the card on this page
const CCKB_CASA = 7;                                       // Casa Castel in Controlling (CASA_PROP_ID)
const _ckbNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');     // = Controlling's _cxNorm
const _ckbR2 = v => Math.round((Number(v) || 0) * 100) / 100;
const _ckbIsParking = u => /garage|stellplatz|\btg\b/i.test(String(u.unit_type || '') + ' ' + String(u.name || ''));   // = _cxIsParking
const _ckbHas = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const _ckbD = v => (typeof ccParseDate === 'function' ? (ccParseDate(v) || '') : '') || String(v || '').slice(0, 10);
const _ckbToday = () => (typeof ccTodayISO === 'function' ? ccTodayISO() : new Date().toISOString().slice(0, 10));
const _CKB_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ccKauMonthLabel = ym => { const m = /^(\d{4})-(\d{2})/.exec(String(ym || '')); return m ? _CKB_MON[Number(m[2]) - 1] + ' ' + m[1] : String(ym || ''); };
const _ckbFmtD = iso => { const s = _ckbD(iso); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };
const _ckbAddMonths = (ym, n) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n; const d = new Date(y, m, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

/* Each app adds its K1b part to its Kaution adapter (tab-tenants.js / rentals-tab-tenants.js):
     rentAt(rec, iso) → { nk, total }   the tenant's rent that day (Pauschal: "davon NK" of the rent entry, else 0)
     unitRef(rec)     → { type: 'casa_room' | 'rentals_apartment' | 'rentals_parking', id, room, label }
     months(rec)      → { from: move-in, out: move-out, end: contract end, pay: last day of the rent window }
     others(rec)      → the other tenancies of the same Zimmer / flat / parking space
     casa             → true: Casa Castel (property 7, receipts of this Zimmer) */
function ccKautionBookRegister(app, kb) {
  if (typeof _CCK === 'undefined' || !_CCK[app]) return;
  _CCK[app].kb = kb;
}

/* K1b is on: the database has KAUTION-K1B.sql (the loaded Kaution rows carry `kept`) */
function _ckbSql(A) { return Object.values((A && A.map && A.map()) || {}).some(r => _ckbHas(r, 'kept')); }
function _ckbMovedOut(rec) { return typeof ccKautionPhase === 'function' && !!rec && ccKautionPhase({}, null, rec, {}).movedOut; }
/* the new rows belong to this card: a moved-out tenant, the SQL has run, the app takes part */
function ccKauOn(A, tid, rec) {
  return !!(A && A.kb && tid && _ckbSql(A) && _ckbMovedOut(rec || A.rec(tid)));
}
function _ckbKept(k) {
  const x = k && k.kept && typeof k.kept === 'object' ? k.kept : null;
  const rent = x && Array.isArray(x.rent) ? x.rent.filter(r => r && /^\d{4}-\d{2}$/.test(String(r.m || '')) && Number(r.a) > 0) : [];
  const d = x && x.dmg && typeof x.dmg === 'object' ? x.dmg : null;
  return { rent, dmg: { a: d ? _ckbR2(d.a) : 0, r: d ? String(d.r || '') : '', cost: d && d.cost != null ? String(d.cost) : null } };
}
function _ckbKeptSum(k) { const K = _ckbKept(k); return _ckbR2(K.rent.reduce((s, r) => s + _ckbR2(r.a), 0) + K.dmg.a); }

/* ── months: the later of Move-out and Contract end, back 12 months, never before the move-in ── */
function ccKauMonths(A, rec) {
  const M = (A.kb.months && A.kb.months(rec)) || {};
  const out = _ckbD(M.out), end = _ckbD(M.end), from = _ckbD(M.from);
  const top = (out > end ? out : end) || _ckbD(M.pay) || _ckbToday();
  const last = top.slice(0, 7), first = from ? from.slice(0, 7) : '';
  const list = [];
  for (let i = 0; i < 12; i++) { const ym = _ckbAddMonths(last, -i); if (first && ym < first) break; list.push(ym); }
  if (!list.length) list.push(last);
  const pay = (_ckbD(M.pay) || top).slice(0, 7);
  return { list, def: list.includes(pay) ? pay : list[0] };
}

/* ── receipts: Maintenance › Schäden, "You pay", from the move-in to today, net > 0, not on another card,
   not marked for the NK in Controlling (its One-off line has the NK switch on: the NK-Abrechnung bills it already) ──
   read for one tenant (a tap) or for all moved-out tenants at once (the prefetch) → Map tenant id → list */
async function _ckbIn(make, ids) {                         // .in() in parts of 100 ids — a long list never makes the address too long
  const parts = [];
  for (let i = 0; i < ids.length; i += 100) parts.push(ids.slice(i, i + 100));
  const res = await Promise.all(parts.map(make));
  const bad = res.find(r => r.error); if (bad) throw bad.error;
  return res.reduce((a, r) => a.concat(r.data || []), []);
}
async function _ckbReceiptsReadAll(A, app, recs) {
  const K = A.kb, out = new Map(), pidOf = new Map();
  recs.forEach(r => out.set(String(r.id), []));
  if (K.casa) recs.forEach(r => pidOf.set(String(r.id), CCKB_CASA));
  else {
    const D = await _ckbReadUnits(app);
    recs.forEach(r => { const U = ccKauUnitOf(D, K.unitRef(r)); if (U) pidOf.set(String(r.id), U.p.id); });
  }
  const pids = [...new Set(pidOf.values())];
  if (!pids.length) return out;
  const q = sbL.from('maint_cases').select('*').eq('kind', 'schaden');
  const cs = await (pids.length === 1 ? q.eq('property_id', pids[0]) : q.in('property_id', pids));
  if (cs.error) throw cs.error;
  const casesOf = r => (cs.data || []).filter(c => pidOf.has(String(r.id)) && String(c.property_id) === String(pidOf.get(String(r.id)))
    && (!K.casa || _ckbNorm(c.report_room) === _ckbNorm(r.room)));
  const cases = new Map(); recs.forEach(r => casesOf(r).forEach(c => cases.set(String(c.id), c)));
  if (!cases.size) return out;
  const all = await _ckbIn(p => sbL.from('maint_costs').select('*').in('case_id', p), [...cases.values()].map(c => c.id));
  const rcp = all.filter(x => !x.return_of);
  const ids = rcp.map(x => x.id);
  let rets = all.filter(x => x.return_of);
  const nk = new Set();
  if (ids.length) {                                        // returns are read by their receipt as well (any case) · the receipts' Controlling lines
    const [rr, ln] = await Promise.all([
      _ckbIn(p => sbL.from('maint_costs').select('*').in('return_of', p), ids),
      _ckbIn(p => sbL.from('ctrl_expense_one_time').select('maint_cost_id,nk_umlage').in('maint_cost_id', p), ids),
    ]);
    const seen = new Set(rets.map(x => String(x.id)));
    rr.forEach(x => { if (!seen.has(String(x.id))) rets.push(x); });
    ln.forEach(o => { if (o.nk_umlage) nk.add(String(o.maint_cost_id)); });
  }
  const today = _ckbToday();
  recs.forEach(rec => {
    const mine = new Set(casesOf(rec).map(c => String(c.id))), from = _ckbD(rec.mietbeginn);
    out.set(String(rec.id), rcp.filter(x => mine.has(String(x.case_id)) && !x.pay_type && !nk.has(String(x.id)))   // Who pays empty = "You pay" (never NK / Kleinreparatur / Schaden) · Rentals: not on the NK
      .map(x => {
        const c = cases.get(String(x.case_id)) || {};
        const back = rets.filter(t => String(t.return_of) === String(x.id)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const date = _ckbD(x.cost_date), text = String(x.description || x.brand || c.title || '').trim() || 'Receipt';
        return { id: String(x.id), date, text, net: Math.max(0, _ckbR2((Number(x.amount) || 0) - back)) };
      })
      .filter(x => x.net > 0.004 && x.date && (!from || x.date >= from) && x.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date) || a.text.localeCompare(b.text)));
  });
  return out;
}
async function _ckbReceiptsRead(A, app, rec) { return (await _ckbReceiptsReadAll(A, app, [rec])).get(String(rec.id)) || []; }
/* loaded ONCE per tenant: by the prefetch, else before the move-out form shows (pop-up open / Edit).
   The prefetch failed meanwhile ({ again }) → read for this tenant now, as a tap always did */
function ccKauReceiptsLoad(app, tid) {
  const A = _CCK[app], key = app + '|' + tid, st = _CCKB.rc[key];
  if (st && st.list) return Promise.resolve(st);
  if (st && st.p) return st.p.then(r => (r && r.again ? ccKauReceiptsLoad(app, tid) : r));
  const rec = A && A.rec(tid);
  if (!A || !A.kb || !rec) return Promise.resolve({ list: [] });
  const p = _ckbReceiptsRead(A, app, rec)
    .then(list => (_CCKB.rc[key] = { list }), e => { delete _CCKB.rc[key]; console.warn('[kaution] receipts:', (e && e.message) || e); return { list: [] }; });
  _CCKB.rc[key] = { p };
  return p;
}
/* Prefetch (once per page): after the Tenants page has been drawn, when the phone is idle, ONE read for the receipts of
   every moved-out tenant — a tap then opens the pop-up at once (it waits only while this read is still on its way).
   Nothing on screen changes. A failed read keeps nothing: a tap reads that tenant's receipts as before. */
function ccKauPrefetch(app) {
  const A = _CCK[app];
  if (!A || !A.kb || !A.kb.all || _CCKB.pre[app]) return;
  const run = () => {
    if (_CCKB.pre[app] || !_ckbSql(A)) return;
    const recs = (A.kb.all() || []).filter(r => r && r.id && !_CCKB.rc[app + '|' + r.id] && ccKauOn(A, r.id, r));
    if (!recs.length) return;
    _CCKB.pre[app] = 1;
    const p = _ckbReceiptsReadAll(A, app, recs);
    p.catch(e => console.warn('[kaution] receipts:', (e && e.message) || e));
    recs.forEach(r => {
      const key = app + '|' + r.id;
      const q = p.then(m => (_CCKB.rc[key] = { list: m.get(String(r.id)) || [] }),
        () => { if (_CCKB.rc[key] && _CCKB.rc[key].p === q) delete _CCKB.rc[key]; return { list: [], again: true }; });
      _CCKB.rc[key] = { p: q };
    });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 250);
}
/* the receipts this card may offer: not picked by another Kaution card (its own pick stays) */
function _ckbReceipts(A, app, tid) {
  const st = _CCKB.rc[app + '|' + tid];
  if (!st || !st.list) return [];
  const taken = new Set();
  Object.entries(A.map() || {}).forEach(([t, k]) => { if (String(t) !== String(tid)) { const c = _ckbKept(k).dmg.cost; if (c) taken.add(c); } });
  return st.list.filter(x => !taken.has(x.id));
}
/* Opening the pop-up of a moved-out tenant: its receipts first, so the form never changes after it shows.
   Only the pop-up tapped last opens: a tenant tapped while another one's receipts load wins, and nothing opens once
   another pop-up was opened (or this one closed) in the meantime (state: the app's pop-up as it is now) */
function ccKauBeforeOpen(app, tid, open, state) {
  const A = _CCK[app], tok = _CCKB.want[app] = ++_CCKB.seq;
  if (!ccKauOn(A, tid)) return open();
  ccKauCheck(app, tid);                                    // this tenant's bookings = the card as saved (in the background, quiet)
  const st = _CCKB.rc[app + '|' + tid];
  if (st && st.list) return open();
  const s0 = state ? state() : '';
  return ccKauReceiptsLoad(app, tid).then(() => { if (_CCKB.want[app] === tok && (!state || state() === s0)) open(); });
}
/* Edit (moved-out tenant): the receipts first · on a settled card the refund counts as typed (tk.paid = the refund
   paid out): a change of Received / Rent owed / Damage goes into "Kept · other reasons"; typing "Kept · other reasons"
   moves the NK amount (part T); without an NK field the refund follows, but never below what was paid out — keeping
   more than that shows "Kept + refund can be at most …" and Save waits. Typing the refund itself ends this. */
async function ccKauEdit(app, tid, ui, redraw) {
  const A = _CCK[app], k = A.map()[tid];
  await ccKauReceiptsLoad(app, tid);
  const paid = !!(k && k.settled);
  ui.mode = 'edit'; ui.draft = null; ui.typed = paid ? 'ref' : null; ui.tk = paid ? { ref: 1, paid: _ckbR2(k.returned) } : null; delete ui.kbN;
  return redraw();
}

/* ── the rows on the card ─────────────────────────────────── */
function _ckbStyles() {
  if (typeof document === 'undefined' || document.getElementById('cckb-styles')) return;
  const s = document.createElement('style');
  s.id = 'cckb-styles';
  s.textContent = `
html body #tab-tenants .cck .cck-f select,html body .cck .cck-f select{flex:1;min-width:0;width:100%;height:30px!important;min-height:0!important;margin:0!important;padding:0 18px 0 0!important;border:none!important;border-radius:0!important;box-shadow:none!important;outline:none;font-family:inherit;font-size:14px!important;font-weight:400!important;color:var(--cc-charcoal)!important;text-overflow:ellipsis;cursor:pointer;-webkit-appearance:none;appearance:none;background:transparent url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23A39A8D' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 0 center!important}
@media (hover:none) and (pointer:coarse){html body #tab-tenants .cck .cck-f select,html body .cck .cck-f select{font-size:13px!important}}
.cck:has(.cckb-r) .cck-refund .cck-note{min-height:3.3em}
.cckb-r[hidden]{display:none!important}
.cckb-more{display:block;margin:-3px 0 9px;padding:0;border:none;background:none;font:inherit;font-size:11px;color:var(--cc-taupe);text-decoration:underline;text-underline-offset:2px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cckb-more[hidden]{display:none}
`;
  (document.head || document.documentElement).appendChild(s);
}
/* → null (K1: nothing new) or { rows, keptSum, note(oth, nkv), shown (form only: the amounts as drawn) } for ccKautionSectionHTML */
function ccKauView(A, app, tid, R, k, P, editing, pfx, ui) {
  if (!P.movedOut || !ccKauOn(A, tid, R)) return null;
  _ckbStyles();
  const f = A.fmt, K = _ckbKept(k), q = `'${app}','${pfx}','${tid}'`;
  const keptSum = _ckbKeptSum(k), rentSum = _ckbR2(K.rent.reduce((s, r) => s + _ckbR2(r.a), 0));
  const note = (oth, nkv) => ccKauNote(f, P.recv, [[rentSum, 'rent'], [K.dmg.a, 'damage'], [oth, 'other'], [nkv, 'for NK']]);
  const cell = (label, inner, id) => _cckCell(label, inner, id ? `${id}-${pfx}` : null);
  if (!editing) {                                          // read-only: only the rows that have a value
    delete ui.kbN;
    const rows = K.rent.map((r, i) => `<div class="cck-grid">${i ? `<div>${_cckRo(f(r.a))}</div><div>${_cckRo(ccKauMonthLabel(r.m))}</div>`
        : cell('Rent owed', _cckRo(f(r.a))) + cell('Month', _cckRo(ccKauMonthLabel(r.m)))}</div>`).join('')
      + (K.dmg.a > 0 ? `<div class="cck-grid">${cell('Damage', _cckRo(f(K.dmg.a)))}${cell('Reason', K.dmg.r ? _cckRo(K.dmg.r) : _cckOff)}</div>` : '');
    return { rows, keptSum, note };
  }
  const D = ui.draft || null;
  const dv = (key, v) => (D && _ckbHas(D, key) ? D[key] : v);
  const on = `ccKautionInput(${q},this)`;
  const M = ccKauMonths(A, R);
  // rows filled (typed or saved) + the ones added with "+ month" — never fewer than one, at most three
  const amt = i => dv('k' + i, K.rent[i] ? K.rent[i].a : '');
  let n = 1; for (let i = 0; i < 3; i++) if (String(amt(i) ?? '') !== '') n = i + 1;
  n = Math.min(3, Math.max(n, Number(dv('kn', 0)) || 0, Number(ui.kbN) || 0));
  // a shown row keeps its month (saved, or as typed — a saved month outside the list stays, added below); an empty row
  // gets the first month no other row uses, counting down from the preset ("+ month" never repeats a shown month)
  const months = [0, 1, 2].map(i => { const v = dv('m' + i, K.rent[i] ? K.rent[i].m : ''); return i < n && v ? v : ''; });
  const used = new Set(months.filter(Boolean));
  for (let i = 0; i < 3; i++) if (!months[i]) { months[i] = _ckbFreeMonth(M, used, i); used.add(months[i]); }
  const monthOf = i => months[i];
  const sel = (i, v) => {
    const opts = M.list.includes(v) ? M.list : M.list.concat(v).sort().reverse();
    return `<div class="cck-f"><select id="cckb-m${i}-${pfx}" aria-label="Month of rent owed ${i + 1}" onchange="${on}">${
      opts.map(o => `<option value="${o}"${o === v ? ' selected' : ''}>${ccKauMonthLabel(o)}</option>`).join('')}</select></div>`;
  };
  const bare = inner => `<div>${inner}</div>`;            // rows 2 and 3: no labels of their own
  const rentRow = i => `<div class="cck-grid cckb-r" id="cckb-r${i}-${pfx}"${i >= n ? ' hidden' : ''}>${
    i ? bare(_cckMoney(`cckb-k${i}-${pfx}`, amt(i), on, '')) + bare(sel(i, monthOf(i)))
      : cell('Rent owed', _cckMoney(`cckb-k0-${pfx}`, amt(0), on, ''), 'cckb-k0') + cell('Month', sel(0, monthOf(0)), 'cckb-m0')}</div>`;
  const more = `<button type="button" class="cckb-more" id="cckb-more-${pfx}"${n >= 3 ? ' hidden' : ''} onclick="ccKauMore(${q})">+ month</button>`;
  const list = _ckbReceipts(A, app, tid);
  const picked = dv('kr', K.dmg.cost || '');
  const rcp = !list.length ? '' : `<div class="cck-grid cck-one">${cell('From receipt',
    `<div class="cck-f"><select id="cckb-kr-${pfx}" onchange="ccKauPick(${q},this)"><option value="">— none —</option>${
      list.map(x => `<option value="${_cckEsc(x.id)}"${x.id === picked ? ' selected' : ''}>${_cckEsc(_ckbFmtD(x.date) + ' · ' + x.text + ' · ' + f(x.net))}</option>`).join('')}</select></div>`, 'cckb-kr')}</div>`;
  const dmg = `<div class="cck-grid">${cell('Damage', _cckMoney(`cckb-ka-${pfx}`, dv('ka', K.dmg.a > 0 ? K.dmg.a : ''), on, ''), 'cckb-ka')}${
    cell('Reason', _cckText(`cckb-kg-${pfx}`, dv('kg', K.dmg.r), on, ''), 'cckb-kg')}</div>`;
  const shown = { [`cckb-ka-${pfx}`]: dv('ka', K.dmg.a > 0 ? K.dmg.a : '') };   // the amounts as drawn (the note of a draft)
  [0, 1, 2].forEach(i => { shown[`cckb-k${i}-${pfx}`] = amt(i); });
  return { rows: [0, 1, 2].map(rentRow).join('') + more + rcp + dmg, keptSum, note, shown };
}
/* the first month of the list that no row uses, counting down from the preset, then the later months —
   every month used: the preset and the months before it, row by row (as before) */
function _ckbFreeMonth(M, used, i) {
  const d = Math.max(0, M.list.indexOf(M.def));
  return M.list.slice(d).concat(M.list.slice(0, d).reverse()).find(m => !used.has(m)) || M.list[Math.min(d + i, M.list.length - 1)];
}
/* "+ month": the next Rent owed | Month row (at most three) — shown at once, nothing moves while typing.
   An empty new row shows the first month the rows above do not use yet (counting down from the preset) */
function ccKauMore(app, pfx, tid) {
  const A = _CCK[app]; if (!A || !tid) return;
  const ui = A.ui[tid] = A.ui[tid] || {};
  const $ = id => document.getElementById(id);
  let n0 = 0; for (let i = 0; i < 3; i++) { const r = $(`cckb-r${i}-${pfx}`); if (r && !r.hidden) n0 = i + 1; }
  const n = Math.min(3, n0 + 1); ui.kbN = n;
  for (let i = 0; i < n; i++) { const r = $(`cckb-r${i}-${pfx}`); if (r) r.hidden = false; }
  const b = $(`cckb-more-${pfx}`); if (b && n >= 3) b.hidden = true;
  const a = $(`cckb-k${n - 1}-${pfx}`), m = $(`cckb-m${n - 1}-${pfx}`), rec = A.rec(tid);
  if (n > n0 && a && m && a.value === '' && rec) {
    const used = new Set(); for (let i = 0; i < n - 1; i++) { const s = $(`cckb-m${i}-${pfx}`); if (s && s.value) used.add(s.value); }
    const v = _ckbFreeMonth(ccKauMonths(A, rec), used, n - 1);
    if ([...m.options].some(o => o.value === v)) m.value = v;
  }
  if (ui.draft) { ui.draft.kn = n; if (m) ui.draft['m' + (n - 1)] = m.value; }
  if (a) try { a.focus(); } catch (e) {}
}
/* "From receipt": fills Damage (its net) and Reason ("<text> · <date>") — both stay editable; nothing else */
function ccKauPick(app, pfx, tid, sel) {
  const A = _CCK[app]; if (!A) return;
  const x = _ckbReceipts(A, app, tid).find(r => r.id === sel.value);
  const a = document.getElementById(`cckb-ka-${pfx}`), g = document.getElementById(`cckb-kg-${pfx}`);
  if (x && a) a.value = String(x.net);
  if (x && g) g.value = x.text + ' · ' + _ckbFmtD(x.date);
  ccKautionInput(app, pfx, tid, a || sel);
}
/* the form as typed → { on, sum, any, neg, rent, dmg } (rent and damage count like the NK part)
   get: the fields as drawn from the draft (pop-up opened again, a "Not saved") — else the page */
function ccKauFormSum(pfx, get) {
  const $ = get || (id => document.getElementById(id));
  if (!$(`cckb-k0-${pfx}`)) return { on: false, sum: 0, any: false, neg: false, rent: 0, dmg: 0 };
  let rent = 0, any = false, neg = false;
  for (let i = 0; i < 3; i++) { const el = $(`cckb-k${i}-${pfx}`); if (el && el.value !== '') { any = true; const v = _cckNum(el.value); if (v < 0) neg = true; rent += v; } }
  const d = $(`cckb-ka-${pfx}`), dmg = d && d.value !== '' ? _cckNum(d.value) : 0;
  if (d && d.value !== '') { any = true; if (dmg < 0) neg = true; }
  return { on: true, sum: _ckbR2(rent + dmg), any, neg, rent: _ckbR2(rent), dmg: _ckbR2(dmg) };
}
function ccKauDraftRead(pfx) {
  const out = {}, $ = id => document.getElementById(id);
  for (let i = 0; i < 3; i++) {
    const a = $(`cckb-k${i}-${pfx}`), m = $(`cckb-m${i}-${pfx}`), r = $(`cckb-r${i}-${pfx}`);
    if (a) out['k' + i] = a.value; if (m) out['m' + i] = m.value; if (r && !r.hidden) out.kn = i + 1;
  }
  [['kr', 'cckb-kr'], ['ka', 'cckb-ka'], ['kg', 'cckb-kg']].forEach(([key, id]) => { const el = $(`${id}-${pfx}`); if (el) out[key] = el.value; });
  return out;
}
/* "2.400,00 € received − 1.000,00 € rent − 400,00 € damage − 300,00 € for NK" (only parts above 0) */
function ccKauNote(fmt, recv, parts) {
  return fmt(recv) + ' received' + parts.filter(([v]) => Number(v) > 0.004).map(([v, l]) => ' − ' + fmt(v) + ' ' + l).join('');
}
function ccKauLiveNote(A, F) { return ccKauNote(A.fmt, F.recv, [[F.kb.rent, 'rent'], [F.kb.dmg, 'damage'], [F.d, 'other'], [F.nIn ? F.n : 0, 'for NK']]); }
/* what Save keeps: rows with the same month added together, empty rows left out */
function _ckbPlan(pfx) {
  const $ = id => document.getElementById(id), by = new Map();
  for (let i = 0; i < 3; i++) {
    const a = $(`cckb-k${i}-${pfx}`), m = $(`cckb-m${i}-${pfx}`);
    const v = a && a.value !== '' ? _ckbR2(a.value) : 0;
    if (v > 0 && m && /^\d{4}-\d{2}$/.test(m.value)) by.set(m.value, _ckbR2((by.get(m.value) || 0) + v));
  }
  const rent = [...by.entries()].map(([m, a]) => ({ m, a })).sort((x, y) => y.m.localeCompare(x.m));
  const da = $(`cckb-ka-${pfx}`), dg = $(`cckb-kg-${pfx}`), dr = $(`cckb-kr-${pfx}`);
  const a = da && da.value !== '' ? Math.max(0, _ckbR2(da.value)) : 0;
  const r = dg ? String(dg.value || '').trim() : '';
  const cost = dr && dr.value ? String(dr.value) : null;
  const dmg = { a, r, cost };
  const kept = rent.length || a > 0 ? Object.assign(rent.length ? { rent } : {}, a > 0 ? { dmg } : {}) : null;
  return { rent, dmg, kept };
}

/* ── Controlling: which unit is this tenancy's (ctlUnitLink's rules, ported in full) ── */
async function _ckbReadUnits(app) {
  const base = [sbL.from('ctrl_properties').select('*'), sbL.from('ctrl_units').select('*')];
  const more = app === 'tn' ? [sbL.from('rooms').select('*')] : [sbL.from('rentals_apartments').select('*'), sbL.from('rentals_parking').select('*')];
  const res = await Promise.all(base.concat(more));
  const bad = res.find(r => r.error); if (bad) throw bad.error;
  const [p, u, a, b] = res.map(r => r.data || []);
  return app === 'tn' ? { props: p, units: u, rooms: a, apts: [], parking: [] } : { props: p, units: u, rooms: [], apts: a, parking: b };
}
/* _ctlPropLinks (the flat of a property): rentals_apartment_ref, else the flat named like the property (not Casa) */
function _ckbPropApt(p, D) {
  if (p.rentals_apartment_ref) return D.apts.find(a => String(a.id) === String(p.rentals_apartment_ref)) || null;
  if (p.id !== CCKB_CASA) return D.apts.find(a => _ckbNorm(a.name) === _ckbNorm(p.name)) || null;
  return null;
}
/* = ctlUnitLink(u, p): an explicit link first (a broken one links nothing), then parking, Casa by name, the one flat */
function ccKauUnitLink(u, p, D) {
  if (u.source_type && u.source_ref) {
    const ref = String(u.source_ref);
    if (u.source_type === 'rentals_apartment') { const o = D.apts.find(a => String(a.id) === ref); return o ? { type: u.source_type, ref } : null; }
    if (u.source_type === 'rentals_parking') { const o = D.parking.find(a => String(a.id) === ref); return o ? { type: u.source_type, ref } : null; }
    if (u.source_type === 'casa_room') {
      const o = D.rooms.find(r => String(r.id) === ref) || D.rooms.find(r => _ckbNorm(r.name) === _ckbNorm(ref));
      return o ? { type: u.source_type, ref: o.name, id: String(o.id) } : null;
    }
    return null;
  }
  if (!p) return null;
  if (_ckbIsParking(u)) {
    const pk = D.parking.find(x => _ckbNorm(x.name) === _ckbNorm(u.name)) || D.parking.find(x => _ckbNorm(x.name) === _ckbNorm(p.name + ' ' + u.name));
    return pk ? { type: 'rentals_parking', ref: String(pk.id) } : null;
  }
  if (p.id === CCKB_CASA) {
    const r = D.rooms.find(x => _ckbNorm(x.name) === _ckbNorm(u.name));
    return r ? { type: 'casa_room', ref: r.name, id: String(r.id) } : null;
  }
  const apt = _ckbPropApt(p, D);
  if (!apt) return null;
  const living = D.units.filter(x => x.property_id === p.id && !_ckbIsParking(x));
  return living.length === 1 ? { type: 'rentals_apartment', ref: String(apt.id) } : null;
}
/* the tenancy's unit (as Controlling lists it: properties by id, units by sort order, then Casa rooms without a unit)
   → { u, p, link } · u.id null = a Casa room without a unit (created on the first booking, as Income does) · null = none */
function ccKauUnitOf(D, ref) {
  if (!ref) return null;
  const hit = l => !!l && (ref.type === 'casa_room' ? l.type === 'casa_room' && _ckbNorm(l.ref) === _ckbNorm(ref.room)
                                                    : l.type === ref.type && l.ref === String(ref.id));
  const props = D.props.slice().sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  for (const p of props) {
    const units = D.units.filter(u => u.property_id === p.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const u of units) { const l = ccKauUnitLink(u, p, D); if (hit(l)) return { u, p, link: l }; }
    if (p.id === CCKB_CASA) {                              // = ctlUnitsFor: active rooms that no unit is linked to yet
      const taken = new Set(units.map(u => { const l = ccKauUnitLink(u, p, D); return l && l.type === 'casa_room' ? l.ref : null; }).filter(Boolean));
      for (const r of D.rooms) {
        if (r.active === false || taken.has(r.name)) continue;
        const u = { id: null, virtual: true, property_id: p.id, name: r.name, unit_type: 'Zimmer', source_type: 'casa_room', source_ref: String(r.id) };
        const l = { type: 'casa_room', ref: r.name, id: String(r.id) };
        if (hit(l)) return { u, p, link: l };
      }
    }
  }
  return null;
}
/* = ctlCreateUnit (via _cxIncUnit): made once — a unit made meanwhile (an earlier tap) is used */
async function _ckbUnitMake(U, units) {
  const f = { property_id: U.u.property_id, name: U.u.name, unit_type: U.u.unit_type || 'Zimmer', source_type: U.u.source_type, source_ref: U.u.source_ref };
  const have = await sbL.from('ctrl_units').select('*').eq('property_id', f.property_id).eq('source_type', f.source_type).eq('source_ref', f.source_ref);
  if (have.error) throw have.error;
  if ((have.data || []).length) return have.data[0];
  const sort = Math.max(0, ...units.filter(u => u.property_id === f.property_id).map(u => Number(u.sort_order) || 0)) + 1;
  let { data, error } = await sbL.from('ctrl_units').insert({ sort_order: sort, ...f }).select().single();
  if (error && /duplicate key|23505|null value|23502/i.test(String((error.code || '') + ' ' + (error.message || '')))) {
    const { data: mx } = await sbL.from('ctrl_units').select('id').order('id', { ascending: false }).limit(1);
    const next = Math.max(0, ...(mx || []).map(r => Number(r.id) || 0), ...units.map(u => Number(u.id) || 0)) + 1;
    ({ data, error } = await sbL.from('ctrl_units').insert({ id: next, sort_order: sort, ...f }).select().single());
  }
  if (error) throw error;
  return data;
}

/* ── the rent part: this tenant's Kaution part of one month row (kau-rent-math.js) ──
   split[tid] = max(0, split[tid] − kau_part[tid].a) + a · NK = old − kau_part[tid].nk + nk (≤ total) ·
   a bank transfer typed in Controlling and another tenant's part stay untouched */
function ccKauRentSet(row, tid, a, nk) {
  const kp = Object.assign({}, (row && row.kau_part && typeof row.kau_part === 'object') ? row.kau_part : {});
  const old = kp[tid] || { a: 0, nk: 0 };
  if (_ckbR2(old.a) === _ckbR2(a) && _ckbR2(old.nk) === _ckbR2(nk)) return { op: 'none' };
  let split = row && row.split && typeof row.split === 'object' && !Array.isArray(row.split) && Object.keys(row.split).length ? Object.assign({}, row.split) : null;
  const legacy = !!row && !split;                          // an old row without split: its amount was this tenant's
  if (!split) split = row ? { [tid]: _ckbR2(Number(row.kaltmiete || 0) + Number(row.nebenkosten || 0)) } : {};
  const t = _ckbR2(Math.max(0, Number(split[tid] || 0) - _ckbR2(old.a)) + _ckbR2(a));
  if (t > 0) split[tid] = t; else delete split[tid];
  if (a > 0) kp[tid] = { a: _ckbR2(a), nk: _ckbR2(nk) }; else delete kp[tid];
  const total = _ckbR2(Object.values(split).reduce((s, v) => s + Number(v || 0), 0));
  const n = Math.min(total, Math.max(0, _ckbR2(Number((row && row.nebenkosten) || 0) - _ckbR2(old.nk) + _ckbR2(nk))));
  if (!Object.keys(split).length) return { op: 'delete', legacy };
  return { op: 'upsert', legacy, kaltmiete: _ckbR2(total - n), nebenkosten: _ckbR2(n), split, kau_part: Object.keys(kp).length ? kp : null };
}
/* the NK part of a kept rent: a × NK / rent of that month (Pauschal: "davon NK" of the rent entry, else 0) */
function _ckbNkOf(A, rec, ym, a) {
  const day = ym + '-01', mb = _ckbD(rec.mietbeginn);
  const r = (A.kb.rentAt && A.kb.rentAt(rec, mb && mb > day && mb.slice(0, 7) === ym ? mb : day)) || {};
  const T = Number(r.total) || 0, N = Math.max(0, Math.min(Number(r.nk) || 0, T));
  return T > 0 ? Math.min(_ckbR2(a), _ckbR2(a * N / T)) : 0;
}
/* another tenancy of the same unit lived there in that month (_cxTenancies windows) */
function _ckbShared(A, rec, ym) {
  const list = ((A.kb.others && A.kb.others(rec)) || []).concat([rec]);
  const today = _ckbToday(), first = ym + '-01', lastD = ym + '-' + String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, '0');
  const ws = list.map(t => ({ t, from: _ckbD(t.mietbeginn), to: _ckbD(t.mietende) })).filter(w => w.from).sort((a, b) => a.from.localeCompare(b.from));
  ws.forEach((w, i) => {
    if (w.to) return;
    if (w.t.status === 'active') { w.to = '9999-12-31'; return; }
    const nx = ws.slice(i + 1).find(x => x.from > w.from);
    if (nx) { const d = new Date(nx.from + 'T12:00:00'); d.setDate(d.getDate() - 1); w.to = d.toISOString().slice(0, 10); } else w.to = today;
  });
  return ws.some(w => String(w.t.id) !== String(rec.id) && w.from <= lastD && w.to >= first);
}

/* ── Save, step 1 (before anything is written): the unit, when something is booked on it ──
   → null (K1b not on this card) · { stop } (not saved — the message is shown) · the booking plan */
async function ccKauPrep(app, pfx, tid, settled, settledAt) {
  const A = _CCK[app], rec = A && A.rec(tid);
  if (!A || !A.kb || !rec) return null;
  const P = _ckbPlan(pfx), ref = A.kb.unitRef(rec);
  const KB = { app, tid, rec, settled: !!settled, settledAt: settledAt || null, rent: P.rent, dmg: P.dmg, kept: P.kept, ref, U: null, units: [] };
  const needUnit = KB.settled && (KB.rent.length > 0 || (!A.kb.casa && KB.dmg.a > 0));
  if (!needUnit) return KB;
  let D;
  try { D = await _ckbReadUnits(app); } catch (e) { if (typeof ccSaveFailed === 'function') ccSaveFailed(e, A.failLabel); return { stop: true }; }
  KB.U = ccKauUnitOf(D, ref); KB.units = D.units;
  if (!KB.U) { ccKauNotLinked(KB); return { stop: true }; }
  // an old month row without split while another tenant also lived there: whose money it holds is unknown → not saved
  if (KB.U.u.id != null) for (const t of KB.rent) {
    const r = await sbL.from('ctrl_income_months').select('*').eq('unit_id', KB.U.u.id).eq('year', Number(t.m.slice(0, 4))).eq('month', Number(t.m.slice(5, 7)));
    if (r.error) { if (typeof ccSaveFailed === 'function') ccSaveFailed(r.error, A.failLabel); return { stop: true }; }
    const row = (r.data || [])[0];
    if (row && ccKauRentSet(row, String(tid), t.a, 0).legacy && _ckbShared(A, rec, t.m)) { ccKauNotLinked(KB); return { stop: true }; }
  }
  return KB;
}
function ccKauNotLinked(KB) {
  if (typeof ccToast === 'function') ccToast('Not saved — ' + ((KB.ref && KB.ref.label) || 'this unit') + ' is not linked in Controlling › Setup', true);
}
/* failed after the amounts: the existing message, or the one exact line for a unit that is not linked */
function ccKauFailed(A, KB, res) {
  if (res && res.notLinked) return ccKauNotLinked(KB);
  if (typeof ccSaveFailed === 'function') ccSaveFailed(res && res.error, A.failLabel);
}

const _ckbLineItem = (ref, r) => [(ref && ref.label) || '', 'Erstattung Mieter', r, 'aus Kaution'].filter(Boolean).join(' · ');
/* ── Save, step 2 (in the tenant's write queue, before the Kaution row): set every booking ──
   reads first, works everything out, writes only what differs → { } · { error } · { notLinked } */
async function ccKauApply(KB, kid) {
  try {
    const A = _CCK[KB.app], tid = String(KB.tid), sref = 'kau:' + KB.app + ':' + kid;
    const [kr, dl] = await Promise.all([
      sbL.from('ctrl_income_months').select('*').not('kau_part', 'is', null),
      sbL.from('ctrl_expense_one_time').select('*').eq('source_ref', sref),
    ]);
    if (kr.error) return { error: kr.error };
    if (dl.error) return { error: dl.error };
    const key = (u, y, m) => u + '|' + y + '|' + m;
    const held = new Map();                                // the months that hold this tenant's part now
    (kr.data || []).forEach(r => { if (r.kau_part && typeof r.kau_part === 'object' && _ckbHas(r.kau_part, tid)) held.set(key(r.unit_id, r.year, r.month), r); });
    const ops = [], want = new Set();
    const targets = KB.settled ? KB.rent : [];
    let uid = KB.U ? KB.U.u.id : null;
    if (targets.length && uid == null) {                   // a Casa room without a unit: made meanwhile (an earlier tap)?
      const h = await sbL.from('ctrl_units').select('*').eq('property_id', KB.U.u.property_id).eq('source_type', KB.U.u.source_type).eq('source_ref', KB.U.u.source_ref);
      if (h.error) return { error: h.error };
      if ((h.data || []).length) uid = h.data[0].id;
    }
    for (const t of targets) {
      const y = Number(t.m.slice(0, 4)), m = Number(t.m.slice(5, 7)), nk = _ckbNkOf(A, KB.rec, t.m, t.a);
      let row = null;
      if (uid != null) {
        want.add(key(uid, y, m));
        const r = await sbL.from('ctrl_income_months').select('*').eq('unit_id', uid).eq('year', y).eq('month', m);
        if (r.error) return { error: r.error };
        row = (r.data || [])[0] || null;
      }
      const res = ccKauRentSet(row, tid, t.a, nk);
      if (res.legacy && res.op !== 'none' && _ckbShared(A, KB.rec, t.m)) return { notLinked: true };   // whose money it was is unknown
      ops.push({ y, m, row, res });
    }
    for (const [k, row] of held) if (!want.has(k)) ops.push({ y: row.year, m: row.month, row, res: ccKauRentSet(row, tid, 0, 0), unit: row.unit_id });
    // the damage line
    const lines = (dl.data || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const wantLine = KB.settled && KB.dmg.a > 0 && KB.settledAt;
    let line = null;
    if (wantLine) {
      const pid = A.kb.casa ? CCKB_CASA : KB.U.p.id;
      const item = _ckbLineItem(KB.ref, KB.dmg.r);
      const name = [KB.rec.first_name, KB.rec.last_name].filter(Boolean).join(' ') || null;
      line = { property_id: pid, invoice_date: KB.settledAt, item, amount: _ckbR2(KB.dmg.a), company: name, kind: 'Sonstiges', direction: 1, nk_umlage: false };
    }
    // writes: the unit (once, only when something is booked on it), the month rows, the line
    if (uid == null && ops.some(o => o.unit == null && o.res.op === 'upsert')) { const u = await _ckbUnitMake(KB.U, KB.units); uid = u.id; }
    for (const o of ops) {
      if (o.res.op === 'none') continue;
      const unit = o.unit != null ? o.unit : uid;
      if (unit == null) continue;
      let r;
      if (o.res.op === 'delete') r = await sbL.from('ctrl_income_months').delete().eq('unit_id', unit).eq('year', o.y).eq('month', o.m);
      else {
        const pl = { unit_id: unit, year: o.y, month: o.m, kaltmiete: o.res.kaltmiete, nebenkosten: o.res.nebenkosten, split: o.res.split, kau_part: o.res.kau_part };
        const old = o.row ? _ckbR2(Number(o.row.kaltmiete || 0) + Number(o.row.nebenkosten || 0)) : null;
        if (o.row && _ckbHas(o.row, 'diff_ok') && o.row.diff_ok && old !== _ckbR2(o.res.kaltmiete + o.res.nebenkosten)) {
          pl.diff_ok = false; if (_ckbHas(o.row, 'diff_reason')) pl.diff_reason = null;   // the "On purpose" mark of a changed amount goes
        }
        r = await sbL.from('ctrl_income_months').upsert(pl, { onConflict: 'unit_id,year,month' }).select().single();
      }
      if (r.error) return { error: r.error };
    }
    const same = (o, l) => Number(o.property_id) === Number(l.property_id) && _ckbD(o.invoice_date) === _ckbD(l.invoice_date) && String(o.item || '') === l.item &&
      _ckbR2(o.amount) === l.amount && (o.company ?? null) === l.company && o.kind === l.kind && Number(o.direction) === 1 && !o.nk_umlage;
    const keep = line ? lines[0] || null : null;
    for (const o of lines) if (o !== keep) { const r = await sbL.from('ctrl_expense_one_time').delete().eq('id', o.id); if (r.error) return { error: r.error }; }
    if (line && !keep) {
      const r = await sbL.from('ctrl_expense_one_time').insert(Object.assign({}, line, { source_ref: sref })).select().single();
      if (r.error) return { error: r.error };
    } else if (line && !same(keep, line)) {
      const r = await sbL.from('ctrl_expense_one_time').update(line).eq('id', keep.id).select().single();
      if (r.error) return { error: r.error };
    }
    return {};
  } catch (e) { return { error: e }; }
}

/* ── the card and Controlling never stay out of step (K1b fix 3) ──
   Puts this tenant's bookings back to the Kaution row as it is saved in the database (kept · settled · Settled on):
   right after a Save whose Kaution row was not saved (same write queue, best effort — "Your previous values are back"),
   and when a moved-out tenant's pop-up is opened (check: read first, write only when they differ, once per page).
   Quiet: no message, nothing is drawn again. Only the Kaution's own part of a month is set — an amount typed in
   Controlling stays. Anything that cannot be read or has no unit now is left for the next time. */
function ccKauCheck(app, tid) {
  const key = app + '|' + tid;
  if (_CCKB.ok[key]) return;
  _CCKB.ok[key] = 1;
  ccKauHeal(app, tid, true).then(r => { if (r && (r.error || r.busy)) delete _CCKB.ok[key]; });
}
function ccKauHealAfterFail(app, tid) {
  const key = app + '|' + tid;
  delete _CCKB.ok[key];                                    // the next open checks again
  return ccKauHeal(app, tid, false);
}
function ccKauHeal(app, tid, check) {
  const A = _CCK[app], k0 = A && tid ? A.map()[tid] : null;
  if (!A || !A.kb || !k0 || !k0.id || typeof sbL === 'undefined' || !sbL) return Promise.resolve({});
  return ccQueueWrite(A.writeKey + tid, async () => {
    try {
      const u = A.ui[tid];                                 // typed and not saved yet (or a Save on its way): that Save sets everything
      if (check && u && u.draft) return { busy: true };
      const sref = 'kau:' + app + ':' + k0.id;
      const res = await Promise.all([sbL.from(A.table).select('*').eq('id', k0.id)].concat(check ? [
        sbL.from('ctrl_income_months').select('*').not('kau_part', 'is', null),
        sbL.from('ctrl_expense_one_time').select('*').eq('source_ref', sref)] : []));
      const bad = res.find(r => r.error); if (bad) return { error: bad.error };
      const k = (res[0].data || [])[0];
      if (!k || !_ckbHas(k, 'kept')) return {};
      if (check && !_ckbOff(A, String(tid), k, res[1].data || [], res[2].data || [])) return {};
      const KB = await _ckbSavedKB(A, app, String(tid), k);
      if (!KB) return {};
      const r = await ccKauApply(KB, k.id);
      return r && r.error ? { error: r.error } : {};
    } catch (e) { return { error: e }; }
  });
}
/* the bookings differ from the saved Kaution row k? rows: the month rows with a Kaution part · lines: this card's damage line(s) */
function _ckbOff(A, tid, k, rows, lines) {
  const K = _ckbKept(k), sAt = _ckbD(k.settled_at), rec = A.rec(tid);
  const want = new Map(), have = new Map();
  if (k.settled) K.rent.forEach(r => want.set(r.m, _ckbR2((want.get(r.m) || 0) + _ckbR2(r.a))));
  rows.forEach(r => {
    if (!r.kau_part || typeof r.kau_part !== 'object' || !_ckbHas(r.kau_part, tid)) return;
    const m = r.year + '-' + String(r.month).padStart(2, '0');
    have.set(m, _ckbR2((have.get(m) || 0) + _ckbR2(r.kau_part[tid] && r.kau_part[tid].a)));
  });
  if (want.size !== have.size || [...want].some(([m, a]) => have.get(m) !== a)) return true;
  if (!(k.settled && K.dmg.a > 0 && sAt)) return lines.length > 0;
  if (lines.length !== 1) return true;
  const l = lines[0];
  return _ckbR2(l.amount) !== K.dmg.a || _ckbD(l.invoice_date) !== sAt || String(l.item || '') !== _ckbLineItem(rec && A.kb.unitRef(rec), K.dmg.r)
    || Number(l.direction) !== 1 || !!l.nk_umlage;
}
/* the booking plan of the saved Kaution row k (= what ccKauPrep makes from the form) · null: no unit now */
async function _ckbSavedKB(A, app, tid, k) {
  const rec = A.rec(tid);
  if (!rec) return null;
  const K = _ckbKept(k), by = new Map(), settled = !!k.settled;
  K.rent.forEach(r => by.set(r.m, _ckbR2((by.get(r.m) || 0) + _ckbR2(r.a))));
  const rent = [...by.entries()].map(([m, a]) => ({ m, a })).sort((x, y) => y.m.localeCompare(x.m));
  const KB = { app, tid, rec, settled, settledAt: settled ? (_ckbD(k.settled_at) || null) : null, rent, dmg: K.dmg, kept: k.kept || null,
               ref: A.kb.unitRef(rec), U: null, units: [] };
  if (settled && (rent.length || (!A.kb.casa && K.dmg.a > 0))) {
    const D = await _ckbReadUnits(app);
    KB.U = ccKauUnitOf(D, KB.ref); KB.units = D.units;
    if (!KB.U) return null;
  }
  return KB;
}
