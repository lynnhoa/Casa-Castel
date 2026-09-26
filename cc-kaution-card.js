/* ─────────────────────────────────────────────────────────────
   cc-kaution-card.js — Kaution section of the Tenants tab
   One card, one layout, five phases — shared by BOTH apps:
     Rentals      (rentals-tab-tenants.js, table rnt_kaution)  app key 'rnt'
     Casa Castel  (tab-tenants.js,         table kaution)      app key 'tn'
   Each app registers an adapter (ccKautionRegister) and calls
   ccKautionSectionHTML() where the old section was.

   Phases (same fields, same places — only values / what is editable change)
     1 Open       nothing received          Received (+ Received on) editable
     2 X € open   received < Soll           Received (+ Received on) editable
     3 Held       received ≥ Soll           read-only · EDIT · SETTLE
     4 Settle     at move-out               Deduction (+ Reason) editable, refund calculated
     5 Settled    settled                   read-only · UNDO

   Data: received, returned, settled, settled_at (exist)
         received_at, deduction_reason (new, optional — shown only when the
         database has them; see the SQL in the release notes)
   Deduction = received − returned  ·  Refund to tenant = returned
   ───────────────────────────────────────────────────────────── */

const _CCK = {};                               // app key → adapter + ui state

function ccKautionRegister(app, adapter) {
  _CCK[app] = Object.assign({ ui: {} }, adapter);
  _cckStyles();
}

function _cckEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _cckNum(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function _cckPfx(ctx, tid) { return `${ctx}_${String(tid || 'none').replace(/-/g, '').slice(0, 8)}`; }
function _cckHasExtra(A) {                     // new columns present in the database?
  const m = A.map() || {};
  return Object.values(m).some(r => r && Object.prototype.hasOwnProperty.call(r, 'received_at'));
}
function _cckDateOnly(v) {
  if (!v) return '';
  return typeof ccParseDate === 'function' ? (ccParseDate(v) || '') : String(v).slice(0, 10);
}

/* Which phase, and what the pill / bar / caption say */
function ccKautionPhase(k, soll, rec, ui) {
  const recv = _cckNum(k && k.received), ret = _cckNum(k && k.returned), settled = !!(k && k.settled);
  const mode = (ui && ui.mode) || '';
  const movedOut = !!rec && (rec.status === 'former' ||
    (rec.mietende && typeof ccTnDaysUntil === 'function' && ccTnDaysUntil(rec.mietende) < 0));
  let phase;
  if (settled) phase = 5;
  else if (recv > 0 && (mode === 'settle' || ret > 0 || movedOut)) phase = 4;
  else if (recv > 0 && mode !== 'edit' && (soll == null || recv >= soll - 0.005)) phase = 3;
  else if (recv > 0) phase = 2;
  else phase = 1;
  return { phase, recv, ret, settled, soll, open: soll != null ? Math.max(0, soll - recv) : 0 };
}

function _cckLook(P, A, k) {
  const f = A.fmt;
  const pct = P.soll ? Math.min(100, Math.round(P.recv / P.soll * 100)) : (P.recv > 0 ? 100 : 0);
  switch (P.phase) {
    case 1: return { pill: ['Open', 'tnp-amber'], bar: [pct, '#C9922E'],
      cap: P.soll ? `0,00 € of ${f(P.soll)} received` : 'Nothing received yet' };
    case 2: return P.open > 0
      ? { pill: [`${f(P.open)} open`, 'tnp-amber'], bar: [pct, '#C9922E'], cap: `${f(P.recv)} received · ${f(P.open)} open` }
      : { pill: ['Held', 'tnp-blue'], bar: [100, '#0C447C'], cap: 'Fully received' };
    case 3: return { pill: ['Held', 'tnp-blue'], bar: [100, '#0C447C'],
      cap: P.soll && P.recv > P.soll + 0.005 ? `Fully received · ${f(P.recv - P.soll)} above Soll` : 'Fully received' };
    case 4: return { pill: ['Settle', 'tnp-amber'], bar: [100, '#0C447C'], cap: `${f(P.recv)} held` };
    default: return { pill: ['Settled', 'tnp-green'], bar: [100, '#3B6D11'],
      cap: 'Settled' + (k && k.settled_at ? ' on ' + A.fmtDate(k.settled_at) : '') };
  }
}

/* ── building blocks ── */
const _cckOff = '<div class="cck-ro cck-off">—</div>';
function _cckCell(label, inner, forId) {
  const lab = forId ? `<label class="cck-fl" for="${forId}">${label}</label>` : `<div class="cck-fl">${label}</div>`;
  return `<div>${lab}${inner}</div>`;
}
function _cckMoney(id, value, oninput, dis) {
  return `<div class="cck-f"><input id="${id}" type="number" data-cc-num="2" value="${value === '' ? '' : value}" placeholder="0,00" ${dis}
    oninput="${oninput}"/><span class="cck-eur">€</span></div>`;
}
function _cckDate(id, iso, oninput, dis) {
  return `<div class="cck-f"><input id="${id}" type="date" value="${_cckEsc(iso || '')}" ${dis} oninput="${oninput}" onchange="${oninput}"/></div>`;
}
function _cckText(id, value, oninput, dis) {
  return `<div class="cck-f"><input id="${id}" type="text" maxlength="120" value="${_cckEsc(value || '')}" placeholder="Optional" ${dis} oninput="${oninput}"/></div>`;
}
function _cckRo(v) { return `<div class="cck-ro">${_cckEsc(v)}</div>`; }

/* ── the section ── */
function ccKautionSectionHTML(app, tid, ctx, rec) {
  const A = _CCK[app]; if (!A) return '';
  const pfx   = _cckPfx(ctx, tid);
  const k     = (tid && A.map()[tid]) || { received: 0, returned: 0, settled: false };
  const info  = A.soll(rec || (tid ? A.rec(tid) : null));
  const soll  = info ? _cckNum(info.amount) : null;
  const ui    = (tid && A.ui[tid]) || {};
  const P     = ccKautionPhase(k, soll, rec || (tid ? A.rec(tid) : null), ui);
  const L     = _cckLook(P, A, k);
  const extra = _cckHasExtra(A);
  const dis   = tid ? '' : 'disabled';
  const sec   = ctx === 'modal' ? 'tn-msec'        : 'tn-sec';
  const body  = ctx === 'modal' ? 'tn-msec-body'   : 'tn-sec-body';
  const foot  = ctx === 'modal' ? 'tn-msec-footer' : 'tn-sec-footer';
  const q     = `'${app}','${pfx}','${tid || ''}'`;
  const onIn  = `ccKautionInput(${q})`;
  const f     = A.fmt;
  const grid  = extra ? 'cck-grid' : 'cck-grid cck-one';

  // Row 1 · Received
  const r1a = (P.phase <= 2)
    ? _cckCell('Received', _cckMoney(`cck-r-${pfx}`, P.recv || '', onIn, dis), `cck-r-${pfx}`)
    : _cckCell('Received', _cckRo(f(P.recv)));
  const r1b = !extra ? '' : (P.phase <= 2)
    ? _cckCell('Received on', _cckDate(`cck-rd-${pfx}`, _cckDateOnly(k.received_at), onIn, dis), `cck-rd-${pfx}`)
    : _cckCell('Received on', k.received_at ? _cckRo(A.fmtDate(k.received_at)) : _cckOff);

  // Row 2 · Deduction + Reason
  // Not yet refunded (returned 0, not settled) = no deduction yet → full refund.
  const ded = (P.phase === 5 || P.ret > 0) ? Math.max(0, P.recv - P.ret) : 0;
  const r2a = P.phase === 4
    ? _cckCell('Deduction', _cckMoney(`cck-d-${pfx}`, P.ret > 0 ? Math.round(ded * 100) / 100 : '', onIn, dis), `cck-d-${pfx}`)
    : P.phase === 5 ? _cckCell('Deduction', _cckRo(f(ded))) : _cckCell('Deduction', _cckOff);
  const r2b = !extra ? '' : P.phase === 4
    ? _cckCell('Reason', _cckText(`cck-g-${pfx}`, k.deduction_reason, onIn, dis), `cck-g-${pfx}`)
    : P.phase === 5 ? _cckCell('Reason', k.deduction_reason ? _cckRo(k.deduction_reason) : _cckOff) : _cckCell('Reason', _cckOff);

  // Refund box
  let refund = '—', note = 'Calculated at move-out', r3b;
  if (P.phase === 4) {
    refund = f(P.recv - ded); note = `${f(P.recv)} held − ${f(ded)} deduction`;
    r3b = _cckCell('Refunded on', _cckDate(`cck-fd-${pfx}`, ui.refDate || (typeof ccTodayISO === 'function' ? ccTodayISO() : ''), onIn, dis), `cck-fd-${pfx}`);
  } else if (P.phase === 5) {
    refund = f(P.ret); note = `${f(P.recv)} − ${f(ded)} deduction`;
    r3b = _cckCell('Refunded on', k.settled_at ? _cckRo(A.fmtDate(k.settled_at)) : _cckOff);
  } else {
    r3b = _cckCell('Refunded on', _cckOff);
  }

  // Buttons (same place in every phase)
  const B = (label, act, kind, extraCls = '') =>
    `<button type="button" class="${kind === 'save' ? 'tn-btn cc-save ' + extraCls : 'cck-b ' + (kind === 'p' ? 'cck-bp' : 'cck-bs')}" id="cck-${act}-${pfx}" ${dis}
      onclick="ccKautionAct(${q},'${act}')">${label}</button>`;
  let btns = '';
  if (P.phase <= 2)      btns = (ui.mode === 'edit' ? B('Cancel', 'cancel', 's') : '') + B('Save', 'save', 'save');
  else if (P.phase === 3) btns = B('Edit', 'edit', 's') + B('Settle', 'settle', 'p');
  else if (P.phase === 4) btns = (ui.mode === 'settle' && P.ret === 0 ? B('Back', 'cancel', 's') : '') + B('Save', 'save', 'save', 'cck-sec') + B('Refund paid', 'paid', 'p');
  else                    btns = B('Undo', 'undo', 's');

  return `
<div class="${sec} cck" id="cck-${pfx}" data-app="${app}" data-tid="${tid || ''}" data-ctx="${ctx}" style="${tid ? '' : 'opacity:.45;pointer-events:none;'}" data-cc-save-scope>
  <div class="${body}" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px">
      <span class="tn-sec-lbl" style="flex:1">Kaution</span>
      <span class="tnp ${L.pill[1]}" id="cck-pill-${pfx}">${L.pill[0]}</span>
    </div>
    <div class="cck-hint" data-ksoll-for="${tid || ''}" data-ksoll-kind="hint" style="${info ? '' : 'display:none'}">${info ? `Soll: ${f(info.amount)} · ${_cckEsc(info.text)}` : ''}</div>
    <div class="cck-bar"><div id="cck-bar-${pfx}" style="width:${L.bar[0]}%;background:${L.bar[1]}"></div></div>
    <div class="cck-cap" id="cck-cap-${pfx}">${L.cap}</div>
    <div class="${grid}">${r1a}${r1b}</div>
    <div class="${grid}">${r2a}${r2b}</div>
    <div class="cck-refund${P.phase >= 4 ? '' : ' cck-dim'}">
      <div class="cck-grid" style="margin-bottom:0;align-items:end">
        ${_cckCell('Refund to tenant', `<div class="cck-ro cck-rv" id="cck-rv-${pfx}">${refund}</div>`)}${r3b}
      </div>
      <div class="cck-note" id="cck-rn-${pfx}">${note}</div>
    </div>
  </div>
  <div class="${foot} cck-foot" style="gap:6px">${btns}</div>
</div>`;
}

/* ── live typing: pill, bar, caption, refund; SAVE turns dark ── */
function ccKautionInput(app, pfx, tid) {
  const A = _CCK[app]; if (!A) return;
  const $ = id => document.getElementById(id);
  const k = (tid && A.map()[tid]) || { received: 0, returned: 0, settled: false };
  const info = A.soll(tid ? A.rec(tid) : null);
  const soll = info ? _cckNum(info.amount) : null;
  const rIn = $(`cck-r-${pfx}`), dIn = $(`cck-d-${pfx}`);
  if (rIn) {                                           // phases 1–2
    const recv = _cckNum(rIn.value);
    const P = { phase: 2, recv, ret: 0, soll, open: soll != null ? Math.max(0, soll - recv) : 0 };
    if (recv <= 0) P.phase = 1;
    const L = _cckLook(P, A, k);
    const pill = $(`cck-pill-${pfx}`); if (pill) { pill.className = 'tnp ' + L.pill[1]; pill.textContent = L.pill[0]; }
    const bar = $(`cck-bar-${pfx}`); if (bar) { bar.style.width = L.bar[0] + '%'; bar.style.background = L.bar[1]; }
    const cap = $(`cck-cap-${pfx}`); if (cap) cap.textContent = L.cap;
  }
  if (dIn) {                                           // phase 4
    const recv = _cckNum(k.received);
    const raw = dIn.value, d = _cckNum(raw);
    const rv = $(`cck-rv-${pfx}`), rn = $(`cck-rn-${pfx}`);
    const bad = raw !== '' && (d < 0 || d > recv + 0.005);
    if (rn) { rn.classList.toggle('cck-err', bad); rn.textContent = bad ? `Enter a deduction up to ${A.fmt(recv)}` : `${A.fmt(recv)} held − ${A.fmt(d)} deduction`; }
    if (rv) rv.textContent = bad ? '—' : A.fmt(recv - d);
  }
  const fd = $(`cck-fd-${pfx}`);
  if (fd && tid) { A.ui[tid] = A.ui[tid] || {}; A.ui[tid].refDate = fd.value; }
  const save = $(`cck-save-${pfx}`);
  if (save && typeof ccSaveSet === 'function') ccSaveSet(save, 'dirty');
}

/* ── buttons ── */
async function ccKautionAct(app, pfx, tid, act) {
  const A = _CCK[app]; if (!A || !tid) return;
  const $ = id => document.getElementById(id);
  const ui = A.ui[tid] = A.ui[tid] || {};
  const redraw = () => { _cckRedraw(app, pfx); A.afterChange(tid); };

  if (act === 'edit')   { ui.mode = 'edit';   return redraw(); }
  if (act === 'settle') { ui.mode = 'settle'; return redraw(); }
  if (act === 'cancel') { ui.mode = '';       return redraw(); }

  const k0 = A.map()[tid];
  const recvNow = $(`cck-r-${pfx}`) ? _cckNum($(`cck-r-${pfx}`).value) : _cckNum(k0 && k0.received);

  if (act === 'save' || act === 'paid') {
    let returned = _cckNum(k0 && k0.returned);
    const dIn = $(`cck-d-${pfx}`);
    if (dIn) {
      const d = _cckNum(dIn.value);
      if (dIn.value !== '' && (d < 0 || d > recvNow + 0.005)) { dIn.focus(); return; }
      returned = Math.round((recvNow - d) * 100) / 100;
    }
    await A.saveAmounts(tid, recvNow, returned);        // memory + database (existing path)
    const k = A.map()[tid];
    if (!k || !k.id) return;
    const upd = {};
    if (_cckHasExtra(A)) {                              // (a first save may have just created the row)
      const rd = $(`cck-rd-${pfx}`), g = $(`cck-g-${pfx}`);
      if (rd) upd.received_at = rd.value || null;
      if (g)  upd.deduction_reason = g.value.trim() || null;
    }
    if (act === 'paid') {
      const fd = $(`cck-fd-${pfx}`);
      upd.settled = true;
      upd.settled_at = (fd && fd.value) || (typeof ccTodayISO === 'function' ? ccTodayISO() : new Date().toISOString());
    }
    if (Object.keys(upd).length) {
      const before = {}; Object.keys(upd).forEach(key => { before[key] = k[key]; });
      Object.assign(k, upd);
      const { error } = await ccQueueWrite(A.writeKey + tid, () => sbL.from(A.table).update(upd).eq('id', k.id));
      if (error) { Object.assign(k, before); if (typeof ccSaveFailed === 'function') ccSaveFailed(error, A.failLabel); }
    }
    if (act === 'paid' || (act === 'save' && ui.mode === 'edit')) ui.mode = '';
    redraw();
    const saveBtn = $(`cck-save-${pfx}`);
    if (saveBtn && act === 'save' && typeof ccSaveSet === 'function') ccSaveSet(saveBtn, 'saved');
    return;
  }

  if (act === 'undo') {
    if (!k0 || !k0.id) return;
    const before = { settled: k0.settled, settled_at: k0.settled_at };
    k0.settled = false; k0.settled_at = null;
    const { error } = await ccQueueWrite(A.writeKey + tid, () => sbL.from(A.table).update({ settled: false, settled_at: null }).eq('id', k0.id));
    if (error) { Object.assign(k0, before); if (typeof ccSaveFailed === 'function') ccSaveFailed(error, A.failLabel); }
    return redraw();
  }
}

function _cckRedraw(app, pfx) {
  const el = document.getElementById('cck-' + pfx); if (!el) return;
  const A = _CCK[app]; const tid = el.dataset.tid, ctx = el.dataset.ctx;
  const tmp = document.createElement('div');
  tmp.innerHTML = ccKautionSectionHTML(app, tid, ctx, tid ? A.rec(tid) : null);
  const nx = tmp.firstElementChild;
  if (nx) el.replaceWith(nx);
}

/* ── styles (once) — sizes from the app: 34 px fields like today's Kaution fields ── */
function _cckStyles() {
  if (typeof document === 'undefined' || document.getElementById('cck-styles')) return;
  const s = document.createElement('style');
  s.id = 'cck-styles';
  s.textContent = `
.cck-hint{font-size:10px;color:var(--cc-taupe);margin:4px 0 7px}
.cck-bar{height:3px;border-radius:2px;background:var(--cc-surface);overflow:hidden}
.cck-bar>div{height:3px;border-radius:2px;transition:width .2s}
.cck-cap{font-size:10px;color:var(--cc-taupe);margin:5px 0 10px;min-height:14px}
.cck-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px}
.cck-grid.cck-one{grid-template-columns:minmax(0,1fr)}
.cck-fl{display:block;font-size:10px;color:var(--cc-taupe);margin-bottom:3px}
.cck-f{display:flex;align-items:center;height:34px;box-sizing:border-box;padding:0 9px;border-radius:6px;border:1px solid var(--cc-rule);background:var(--cc-white)}
.cck-f:focus-within{border-color:var(--cc-gold)}
html .cck-f input{flex:1;min-width:0;width:auto;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;border:none!important;border-radius:0!important;background-color:transparent!important;box-shadow:none!important;outline:none;font-family:inherit;font-size:12px!important;font-weight:400!important;color:var(--cc-ink);font-variant-numeric:tabular-nums;-webkit-appearance:none}
html .cck-f input.cc-cal{padding-right:24px!important;background-position:right 0 center!important;background-size:15px 15px!important}
html .cck-f input::placeholder{color:var(--cc-stone)}
@media (hover:none) and (pointer:coarse){html body #tab-tenants .cck .cck-f input:not([type=checkbox]):not([type=radio]):not([type=file]),html body .cck .cck-f input:not([type=checkbox]):not([type=radio]):not([type=file]){font-size:13px!important}}
.cck-eur{font-size:11px;color:var(--cc-taupe);margin-left:6px}
.cck-ro{height:34px;display:flex;align-items:center;font-size:12px;color:var(--cc-ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cck-off{color:var(--cc-stone)}
.cck-refund{background:var(--cc-surface);border-radius:8px;padding:8px 10px;margin-bottom:10px}
.cck-refund.cck-dim{opacity:.5}
.cck-rv{font-size:14px;font-weight:500}
.cck-note{font-size:10px;color:var(--cc-taupe);margin-top:2px;min-height:13px}
.cck-note.cck-err{color:#A32D2D}
.cck-b{height:36px;padding:0 16px;border-radius:8px;font-family:inherit;font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cck-b:disabled{opacity:.5;cursor:default}
.cck-bp{min-width:96px;padding:0 18px;background:var(--cc-ink);color:var(--cc-white);border:.5px solid var(--cc-ink)}
.cck-bs{background:transparent;color:var(--cc-taupe);border:.5px solid var(--cc-rule)}
html button.cc-save.cck-sec{background:transparent!important;color:var(--cc-taupe)!important;border-color:var(--cc-rule)!important;min-width:0!important;padding:0 16px!important}
`;
  (document.head || document.documentElement).appendChild(s);
}
