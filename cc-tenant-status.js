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
  if (x.recv > 0 && x.held > 0) return _ccTnPill('tnp-green', 'Kaution ' + fmtEUR(x.held));
  if (x.recv > 0)               return _ccTnPill('tnp-amber', 'Kaution settle?');
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
  const d = ccTnDaysUntil(rec.mietende);
  if (d !== null && d >= 0) return null;
  return { level: 'amber', text: 'Tenant still active' };
}
function ccTnStaffelTodo(state, fmtDateISO) {
  if (!state) return null;
  if (state.state === 'overdue')  return { level: 'red',   text: `Staffel overdue ${state.days} day${state.days === 1 ? '' : 's'}` };
  if (state.state === 'reminder') return { level: 'amber', text: `Staffel from ${fmtDateISO(state.entry.effective_date)}` };
  return null;
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
function ccTnRow1(vacant, kautionPill) {
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
