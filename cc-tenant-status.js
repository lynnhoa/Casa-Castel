/* ═════════════════════════════════════════════════════════════
   TENANT STATUS — one set of rules, wording and colours for the
   Tenants tab of BOTH apps (Casa Castel rooms · Rentals apartments/parking).
   Each app only supplies its data; nothing here reads app state.

   Colours    red = overdue · amber = to do / open · green = done / paid
              blue = money held (info) · grey = neutral state
   Wording    English status words, German domain nouns (Kaution, Staffel, NK)

   Collapsed card
     Row 1  ······················· [Kaution 1.500 €] [Occupied] ›   ← state, always the same spot
     Row 2  UNIT NAME (full width, wraps — never cut)   · Rentals apartments: address
     Row 2b Tenant name  dates
     Row 3  650 € warm · 500 + 150 Kalt + NK · Mietvertrag          ← info
     Row 4  [red to-dos] [amber to-dos]  ← only if any · wraps · max 3 + "+N"
   ═════════════════════════════════════════════════════════════ */

const CC_TN_MOVEOUT_WINDOW = 30;   // "Move-out in N days" shows from 30 days before

function _ccTnPill(cls, text) { return `<span class="tnp ${cls}">${text}</span>`; }

/* Days from today until an ISO date (negative = in the past) */
function ccTnDaysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d)) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

/* ── KAUTION ─────────────────────────────────────────────────── */
/* Held = received − returned. Status: Pending → Held → Partly returned → Returned – settle? → Settled */
function ccTnKaution(k) {
  const recv = Number(k?.received) || 0, ret = Number(k?.returned) || 0, settled = !!k?.settled;
  return { recv, ret, settled, held: Math.max(0, recv - ret) };
}
function ccTnKautionStatus(recv, ret, settled) {
  recv = Number(recv) || 0; ret = Number(ret) || 0;
  if (settled)          return { label: 'Settled',            cls: 'tnp-green' };
  if (recv === 0)       return { label: 'Pending',            cls: 'tnp-amber' };
  if (ret <= 0)         return { label: 'Held',               cls: 'tnp-blue'  };
  if (ret < recv)       return { label: 'Partly returned',    cls: 'tnp-amber' };
  return                       { label: 'Returned \u2013 settle?', cls: 'tnp-amber' };
}
/* Row-1 Kaution pill for the ACTIVE tenant. sollAmount > 0 = a Kaution is expected. */
function ccTnKautionPill(k, sollAmount, fmtEUR) {
  const x = ccTnKaution(k);
  if (x.settled) return '';
  const soll = Number(sollAmount) || 0;
  if (x.recv > 0 && x.ret === 0 && soll > 0 && x.recv < soll - 0.005)
    return _ccTnPill('tnp-amber', 'Kaution ' + fmtEUR(soll - x.recv) + ' open');   // shortfall
  // Card header = the tenant who lives there: a refund only planned (not paid) doesn't reduce what is held
  if (x.recv > 0) return _ccTnPill('tnp-green', 'Kaution ' + fmtEUR(x.recv));
  if (Number(sollAmount) > 0)   return _ccTnPill('tnp-amber', 'Kaution open');
  return '';
}
/* Former tenant row */
function ccTnFormerKautionPill(k, fmtEUR, fmtDate) {
  const x = ccTnKaution(k);
  if (!x.recv) return '';
  if (x.settled) return _ccTnPill('tnp-green', fmtEUR(x.ret) + ' returned' + (k.settled_at ? ' \u00b7 ' + fmtDate(k.settled_at) : ''));
  if (x.held > 0) return _ccTnPill('tnp-amber', fmtEUR(x.held) + ' open');
  return _ccTnPill('tnp-amber', 'Kaution settle?');
}
/* Tab summary: money currently held (unsettled, received − returned) */
function ccTnHeldTotal(records, kautionById) {
  return (records || []).reduce((sum, r) => {
    const x = ccTnKaution(kautionById[r.id]);
    return sum + (x.settled ? 0 : x.held);
  }, 0);
}

/* ── TO-DOS ──────────────────────────────────────────────────── */
function ccTnMoveOutTodo(rec) {
  if (!rec || !rec.mietende) return null;
  const d = ccTnDaysUntil(rec.mietende);
  if (d === null) return null;
  if (d < 0) return { level: 'red', text: `Move-out overdue ${-d} day${-d === 1 ? '' : 's'}` };
  if (d === 0) return { level: 'amber', text: 'Move-out today' };
  if (d <= CC_TN_MOVEOUT_WINDOW) return { level: 'amber', text: `Move-out in ${d} day${d === 1 ? '' : 's'}` };
  return null;
}
/* Unit marked vacant but the tenant was never moved out (a future end date is planned, not a to-do) */
function ccTnStillActiveTodo(vacant, rec) {
  if (!vacant || !rec) return null;
  { const m = ccTnDaysUntil(rec.mietbeginn); if (m !== null && m > 0) return null; }   // signed, moves in later — not a to-do
  const d = ccTnDaysUntil(rec.mietende);
  if (d !== null && d >= 0) return null;
  return { level: 'amber', text: 'Tenant still active' };
}
/* Contract ends within 60 days and no move-out recorded → renew or record the move-out */
function ccTnRenewalTodo(rec) {
  if (!rec || !rec.vertragsende || rec.mietende || rec.status !== 'active') return null;
  const d = ccTnDaysUntil(rec.vertragsende);
  if (d === null || d > 60) return null;
  const s = String(rec.vertragsende).slice(0, 10).split('-');
  return { level: d < 0 ? 'red' : 'amber', text: (d < 0 ? 'Contract ended ' : 'Contract ends ') + s[2] + '.' + s[1] + '.' + s[0] };
}
function ccTnStaffelTodo(state, fmtDateISO) {
  if (!state) return null;
  if (state.state === 'overdue')  return { level: 'red',   text: `Staffel overdue ${state.days} day${state.days === 1 ? '' : 's'}` };
  if (state.state === 'reminder') return { level: 'amber', text: `Staffel from ${fmtDateISO(state.entry.effective_date)}` };
  return null;
}
/* NK-Vorauszahlung change not yet confirmed with the tenant — same timing as Staffel:
   nothing until 30 days before · amber "NK change from 01.01." · red once the date has passed.
   Only this tenancy's changes (linked to the tenant, or dated after the move-in). */
function ccTnNkChangeTodo(entries, rec) {
  if (!rec) return null;
  const iso = v => String(v || '').slice(0, 10);
  const mb = rec.mietbeginn ? ccTnIso(rec.mietbeginn) : '';
  const mine = (entries || []).filter(e => e && !e.tenant_adjusted && !e.ignored &&
      (e.tenant_id ? String(e.tenant_id) === String(rec.id) : (!mb || iso(e.effective_date) >= mb)))
    .sort((a, b) => iso(a.effective_date).localeCompare(iso(b.effective_date)));
  for (const e of mine) {
    const d = ccTnDaysUntil(e.effective_date);
    if (d === null || d > 30) continue;
    const s = iso(e.effective_date).split('-');
    if (d >= 0) return { level: 'amber', text: 'NK change from ' + s[2] + '.' + s[1] + '.' };
    return { level: 'red', text: `NK change overdue ${-d} day${-d === 1 ? '' : 's'}` };
  }
  return null;
}
function ccTnIso(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : s.slice(0, 10);
}

/* ── OCCUPANCY — one rule for Rooms · Apartments · Parking (both apps) ──
   A unit is occupied today when a tenancy covers today: move-in ≤ today ≤ move-out
   (no move-out = open-ended; an active tenant without a move-in date counts).
   A signed tenant who moves in later leaves the unit vacant until then, so the gap
   between two tenants is Leerstand by itself. Units that never had a tenant in
   the app are left as they are. An active tenant whose move-out has passed
   becomes former.
   units: [{ key, vacant }] · unitOf(rec) → unit key · returns what has to change */
function ccOccupancyPlan(units, records, unitOf, todayIso) {
  const occ = new Set(), known = new Set();
  (records || []).forEach(r => {
    if (!r) return;
    const k = unitOf(r); if (k == null || k === '') return;
    known.add(String(k));
    if (r.status === 'archived') return;
    const mb = r.mietbeginn ? ccTnIso(r.mietbeginn) : '', me = r.mietende ? ccTnIso(r.mietende) : '';
    if (mb ? mb > todayIso : r.status !== 'active') return;
    if (me && me < todayIso) return;
    occ.add(String(k));
  });
  const unitChanges = (units || [])
    .filter(u => known.has(String(u.key)) && !!u.vacant === occ.has(String(u.key)))
    .map(u => ({ key: u.key, vacant: !occ.has(String(u.key)) }));
  const toFormer = (records || []).filter(r => r && r.status === 'active' && r.mietende && ccTnIso(r.mietende) < todayIso);
  return { unitChanges, toFormer };
}

/* Row 4: red first, then amber; max 3 + "+N" */
function ccTnTodoRow(todos) {
  const list = (todos || []).filter(Boolean).sort((a, b) => (a.level === 'red' ? 0 : 1) - (b.level === 'red' ? 0 : 1));
  if (!list.length) return '';
  const shown = list.slice(0, 3).map(t => _ccTnPill(t.level === 'red' ? 'tnp-red' : 'tnp-amber', t.text));
  if (list.length > 3) shown.push(_ccTnPill('tnp-gray', '+' + (list.length - 3)));
  return shown.join('');
}
/* Row 1 */
/* A signed tenant who moves in later: "Moves in 01.10." (the unit stays vacant until then) */
function ccTnMovesIn(vacant, rec) {
  if (!vacant || !rec || !rec.mietbeginn) return null;
  const d = ccTnDaysUntil(rec.mietbeginn);
  if (d === null || d <= 0) return null;
  const s = String(rec.mietbeginn).slice(0, 10).split('-');
  return s.length === 3 ? s[2] + '.' + s[1] + '.' : null;
}
function ccTnRow1(vacant, kautionPill, movesIn) {
  if (movesIn) return (kautionPill || '') + _ccTnPill('tnp-amber', 'Moves in ' + movesIn);
  if (vacant) return _ccTnPill('tnp-gray', 'Vacant');
  return (kautionPill || '') + _ccTnPill('tnp-occ', 'Occupied');
}
/* Put the computed pills into a rendered card (after any save) */
function ccTnApplyPills(rid, row1, todo) {
  const r1 = document.getElementById('hdr-kpill-' + rid);
  if (r1) r1.innerHTML = row1;
  const r4 = document.getElementById('hdr-todo-' + rid);
  if (r4) { r4.innerHTML = todo; r4.style.display = todo ? '' : 'none'; }
}

(function () {
  const s = document.createElement('style');
  s.id = 'cc-tenant-status-styles';
  s.textContent = `
html .tnp-occ { background:transparent; color:#27500A; border:.5px solid #97C459; }
html .tn-hdr-top > [id^="hdr-kpill-"] { flex-shrink:0 !important; min-width:auto; flex-wrap:nowrap; }
/* Pills on top (always the same spot), unit name underneath at full width — wraps, never cut */
html .tn-unit-line { display:block; white-space:normal; overflow-wrap:anywhere; margin-top:6px; line-height:1.35; }
html .tn-todo-row { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; padding-top:8px; border-top:.5px solid var(--cc-rule); }
`;
  document.head.appendChild(s);
})();
