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
     4 Settle     at move-out               the form opens by itself until the refund is paid
     B24: ONE form (Edit) for every field — see "the section" below
     5 Settled    settled                   read-only · UNDO

   Data: received, returned, settled, settled_at (exist)
         received_at, deduction_reason (new, optional — shown only when the
         database has them; see the SQL in the release notes)
   Deduction = received − returned = other reasons + nk_einbehalt  ·  Refund to tenant = returned
   nk_einbehalt (Kept · for NK-Abrechnung) is offset in Settlements with the tenant's NK-Abrechnung;
   Kaution itself never shows in Controlling.
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

/* Which phase, and what the pill / bar / caption say (B24: the phase comes from the data only —
   whether the form is open is ui.mode 'edit', or the move-out form that opens by itself) */
function ccKautionPhase(k, soll, rec, ui) {
  const recv = _cckNum(k && k.received), ret = _cckNum(k && k.returned), settled = !!(k && k.settled);
  const movedOut = !!rec && (rec.status === 'former' ||
    (rec.mietende && typeof ccTnDaysUntil === 'function' && ccTnDaysUntil(rec.mietende) < 0));
  let phase;
  if (settled) phase = 5;
  else if (recv > 0 && movedOut) phase = 4;                                   // moved out, not refunded yet
  else if (recv > 0 && (soll == null || recv >= soll - 0.005)) phase = 3;
  else if (recv > 0) phase = 2;
  else phase = 1;
  // A refund saved while the tenant still lives there and not paid yet: the Kaution is still held
  const planned = !settled && !movedOut && ret > 0;
  return { phase, recv, ret, settled, soll, movedOut, planned, open: soll != null ? Math.max(0, soll - recv) : 0 };
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
    case 3: if (P.planned) return { pill: ['Held', 'tnp-blue'], bar: [100, '#0C447C'], cap: `Fully held · planned refund ${f(P.ret)} not paid out` };
            return { pill: ['Held', 'tnp-blue'], bar: [100, '#0C447C'],
      cap: P.soll && P.recv > P.soll + 0.005 ? `Fully received · ${f(P.recv - P.soll)} above Soll` : 'Fully received' };
    case 4: return { pill: ['Settle', 'tnp-amber'], bar: [100, '#0C447C'], cap: `${f(P.recv)} held · paid out only with REFUND PAID` };
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
  return `<div class="cck-f"><input id="${id}" type="number" data-cc-num="2" value="${value === '' || value == null ? '' : _cckEsc(value)}" placeholder="0,00" ${dis}
    oninput="${oninput}"/><span class="cck-eur">€</span></div>`;
}
function _cckDate(id, iso, oninput, dis) {
  return `<div class="cck-f"><input id="${id}" type="date" value="${_cckEsc(iso || '')}" ${dis} oninput="${oninput}" onchange="${oninput}"/></div>`;
}
function _cckText(id, value, oninput, dis) {
  return `<div class="cck-f"><input id="${id}" type="text" maxlength="120" value="${_cckEsc(value || '')}" placeholder="Optional" ${dis} oninput="${oninput}"/></div>`;
}
function _cckRo(v) { return `<div class="cck-ro">${_cckEsc(v)}</div>`; }

/* ── the section ──────────────────────────────────────────────
   B24 (Oct 2026): ONE form for everything — Edit opens all fields at once:
     Kaution Soll · Received · Received on · Kept · other reasons · Reason · Kept · for NK-Abrechnung ·
     Refund to tenant · Refunded on
   Refund = Received − Kept (other) − Kept (NK). Type the kept amounts → the refund is calculated;
   type the refund → "Kept · other reasons" is calculated. "Refunded on" filled = the refund is paid
   (Settled); empty = not paid yet (the Kaution is still held). After the move-out the form opens by itself.
   Same rows in every state — only values change.                                                       */
const _cckR2 = v => Math.round((Number(v) || 0) * 100) / 100;
/* B25 (6): what you typed in the open form, kept in A.ui[tid].draft — a redraw of the tenant card
   (≈30 actions do that) used to rebuild the form from the saved values and drop it */
const _CCK_NATIVE = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;
function _cckRaw(el) { try { return _CCK_NATIVE ? _CCK_NATIVE.get.call(el) : el.value; } catch (e) { return el ? el.value : ''; } }
const _CCK_FIELDS = [['sv', 'cck-sv'], ['r', 'cck-r'], ['rd', 'cck-rd'], ['d', 'cck-d'], ['g', 'cck-g'], ['nk', 'cck-nk'], ['ref', 'cck-ref'], ['fd', 'cck-fd']];
function _cckDraftRead(pfx) {
  const out = {};
  // plain values (amount 1635.5 · date 2026-01-15): the boxes only take that form back when redrawn —
  // "1.635,00" / "15.01.2026" came back empty
  _CCK_FIELDS.forEach(([key, id]) => { const el = document.getElementById(id + '-' + pfx); if (el) out[key] = el.value; });
  return out;
}
function _cckHasNk(A) { return Object.values(A.map() || {}).some(r => r && Object.prototype.hasOwnProperty.call(r, 'nk_einbehalt')); }

function ccKautionSectionHTML(app, tid, ctx, rec) {
  const A = _CCK[app]; if (!A) return '';
  const pfx   = _cckPfx(ctx, tid);
  const k     = (tid && A.map()[tid]) || { received: 0, returned: 0, settled: false };
  const R     = rec || (tid ? A.rec(tid) : null);
  const info  = A.soll(R);
  const soll  = info ? _cckNum(info.amount) : null;
  const ui    = (tid && A.ui[tid]) || {};
  const P     = ccKautionPhase(k, soll, R, ui);
  const L     = _cckLook(P, A, k);
  const extra = _cckHasExtra(A);
  const hasNk = _cckHasNk(A);
  const dis   = tid ? '' : 'disabled';
  const sec   = ctx === 'modal' ? 'tn-msec'        : 'tn-sec';
  const body  = ctx === 'modal' ? 'tn-msec-body'   : 'tn-sec-body';
  const foot  = ctx === 'modal' ? 'tn-msec-footer' : 'tn-sec-footer';
  const q     = `'${app}','${pfx}','${tid || ''}'`;
  const onIn  = `ccKautionInput(${q},this)`;
  const f     = A.fmt;
  const grid  = extra ? 'cck-grid' : 'cck-grid cck-one';

  // the form is open: Edit, after the move-out (until refunded), or a placeholder without tenant
  const editing = !tid || ui.mode === 'edit' || P.phase === 4;

  // values as saved — nothing decided yet (no refund, nothing kept) = empty fields
  const nkv     = hasNk ? _cckNum(k.nk_einbehalt) : 0;
  const decided = P.settled || P.ret > 0 || nkv > 0;
  const ded     = decided ? Math.max(0, P.recv - P.ret) : 0;
  const oth     = Math.max(0, _cckR2(ded - nkv));
  const refDate = P.settled ? _cckDateOnly(k.settled_at) : '';

  const D     = editing && ui.draft ? ui.draft : null;              // B25 (6): typed, not saved yet
  const dv    = (key, v) => (D && Object.prototype.hasOwnProperty.call(D, key) ? D[key] : v);
  const money = (id, v) => _cckMoney(`${id}-${pfx}`, dv(id.slice(4), v), onIn, dis);
  const cell  = (label, inner, id) => _cckCell(label, inner, id ? `${id}-${pfx}` : null);
  const roM   = v => _cckRo(f(v));
  const val   = (v, show) => show ? _cckRo(f(v)) : _cckOff;

  const sollRow = editing && tid && A.saveSoll
    ? `<div class="${grid}">${cell('Kaution Soll', money('cck-sv', soll != null ? soll : ''), 'cck-sv')}${extra ? '<div></div>' : ''}</div>` : '';
  const r1 = editing
    ? cell('Received', money('cck-r', P.recv || ''), 'cck-r') +
      (extra ? cell('Received on', _cckDate(`cck-rd-${pfx}`, dv('rd', _cckDateOnly(k.received_at)), onIn, dis), 'cck-rd') : '')
    : cell('Received', roM(P.recv)) + (extra ? cell('Received on', k.received_at ? _cckRo(A.fmtDate(k.received_at)) : _cckOff) : '');
  const othLbl = hasNk ? 'Kept · other reasons' : 'Kept';
  const r2 = editing
    ? cell(othLbl, money('cck-d', decided ? oth : ''), 'cck-d') +
      (extra ? cell('Reason', _cckText(`cck-g-${pfx}`, dv('g', k.deduction_reason), onIn, dis), 'cck-g') : '')
    : cell(othLbl, val(oth, decided)) + (extra ? cell('Reason', k.deduction_reason ? _cckRo(k.deduction_reason) : _cckOff) : '');
  const nkHint = '<div class="cck-nkhint">offset in Settlements with the NK-Abrechnung</div>';
  const r3 = !hasNk ? '' : `<div class="${grid}">${editing
    ? cell('Kept · for NK-Abrechnung', money('cck-nk', decided && nkv ? nkv : ''), 'cck-nk') + (extra ? nkHint : '')
    : cell('Kept · for NK-Abrechnung', val(nkv, decided)) + (extra ? (nkv > 0 ? nkHint : '<div></div>') : '')}</div>`;
  const refRow = editing
    ? cell('Refund to tenant', money('cck-ref', decided ? P.ret : ''), 'cck-ref') +
      cell('Refunded on', _cckDate(`cck-fd-${pfx}`, dv('fd', refDate), onIn, dis), 'cck-fd')
    : cell('Refund to tenant', val(P.ret, decided)) + cell('Refunded on', P.settled && k.settled_at ? _cckRo(A.fmtDate(k.settled_at)) : _cckOff);
  const note = !decided ? (editing ? 'Type what you keep, or the refund · empty = all still held' : 'Calculated at move-out')
    : hasNk ? `${f(P.recv)} received − ${f(oth)} other − ${f(nkv)} for NK` : `${f(P.recv)} received − ${f(ded)} kept`;

  // Buttons (same place in every state): form → Cancel · Save · otherwise Edit
  const B = (label, act, kind) =>
    `<button type="button" class="${kind === 'save' ? 'tn-btn cc-save' : 'cck-b cck-bs'}" id="cck-${act}-${pfx}" ${dis}${kind === 'save' && D ? ' data-cc-save="dirty" aria-disabled="false"' : ''}
      onclick="ccKautionAct(${q},'${act}')">${label}</button>`;
  const slot = editing ? (tid && ui.mode === 'edit' ? B('Cancel', 'cancel', 's') : '') + B('Save', 'save', 'save')
                       : B('<i class="ti ti-pencil"></i> Edit', 'edit', 's');
  // Short card while the Kaution is simply held: one line says it all — Edit opens the full form
  const compact = !!tid && !editing && P.phase <= 3;

  return `
<div class="${sec} cck" id="cck-${pfx}" data-app="${app}" data-tid="${tid || ''}" data-ctx="${ctx}" style="${tid ? '' : 'opacity:.45;pointer-events:none;'}" data-cc-save-scope>
  <div class="${body}" style="padding-top:10px">
    <div class="cck-title">
      <span class="tn-sec-lbl">Kaution</span>
      <span class="tnp ${L.pill[1]}" id="cck-pill-${pfx}">${L.pill[0]}</span>
    </div>
    <div class="cck-hint" data-ksoll-for="${tid || ''}" data-ksoll-kind="hint" style="${info ? '' : 'display:none'}">${info ? `Soll: ${f(info.amount)} · ${_cckEsc(info.text)}` : ''}</div>
    ${sollRow}
    ${compact ? `<div class="cck-sum">${f(P.recv)} <span>received${k.received_at ? ' \u00b7 ' + A.fmtDate(k.received_at) : ''}</span></div>` : ''}
    <div class="cck-bar"><div id="cck-bar-${pfx}" style="width:${L.bar[0]}%;background:${L.bar[1]}"></div></div>
    <div class="cck-cap" id="cck-cap-${pfx}">${L.cap}</div>
    ${compact ? '' : `<div class="${grid}">${r1}</div>
    <div class="${grid}">${r2}</div>
    ${r3}
    <div class="cck-refund${editing || P.phase === 5 ? '' : ' cck-dim'}">
      <div class="cck-grid" style="margin-bottom:0;align-items:end">${refRow}</div>
      <div class="cck-note" id="cck-rn-${pfx}">${note}</div>
    </div>`}
  </div>
  <div class="${foot} cck-foot" style="gap:6px">${_cckFootOrder('', slot)}</div>
</div>`;
}

/* Bottom row: Edit / Cancel · Save on the right */
function _cckFootOrder(btns, slot) {
  const box = document.createElement('div'); box.innerHTML = btns;
  const left = [], right = [];
  [...box.children].forEach(b => (/'(unplan|undo)'\)/.test(b.getAttribute('onclick') || '') ? left : right).push(b.outerHTML));
  return left.join('') + '<span class="cc-foot-right">' + slot + right.join('') + '</span>';
}

/* The form as typed → { recv, d (other), n (NK), rf (refund), any, bad } — refund and "other" follow each other:
   typing the refund → other = received − refund − NK · typing anything else → refund = received − other − NK */
function _cckForm(pfx, k, src) {
  const $ = id => document.getElementById(id);
  const rIn = $(`cck-r-${pfx}`), dIn = $(`cck-d-${pfx}`), nIn = $(`cck-nk-${pfx}`), fIn = $(`cck-ref-${pfx}`);
  const has = el => !!el && el.value !== '';
  const recv = rIn ? _cckNum(rIn.value) : _cckNum(k && k.received);
  let d = has(dIn) ? _cckNum(dIn.value) : 0, n = has(nIn) ? _cckNum(nIn.value) : 0, rf = has(fIn) ? _cckNum(fIn.value) : 0;
  const any = has(dIn) || has(nIn) || has(fIn);
  const fromRefund = !!(src && fIn && src === fIn) || (!has(dIn) && !has(nIn) && has(fIn));
  if (any) {
    if (fromRefund) { d = _cckR2(recv - rf - n); if (src && dIn) dIn.value = d >= 0 ? String(d) : ''; }
    else { rf = _cckR2(recv - d - n); if (src && fIn) fIn.value = String(rf); }
  }
  const bad = any && (d < -0.004 || n < -0.004 || rf < -0.004);
  return { recv, d: Math.max(0, d), n, rf, any, bad, rIn, dIn, nIn, fIn };
}

/* ── live typing: pill, bar, caption, the refund ↔ kept amounts; SAVE turns dark ── */
function ccKautionInput(app, pfx, tid, src) {
  const A = _CCK[app]; if (!A) return;
  const $ = id => document.getElementById(id);
  const k = (tid && A.map()[tid]) || { received: 0, returned: 0, settled: false };
  const info = A.soll(tid ? A.rec(tid) : null);
  const soll = info ? _cckNum(info.amount) : null;
  const F = _cckForm(pfx, k, src);
  if (F.rIn && !k.settled) {                           // received → pill / bar / caption
    const P = { phase: F.recv <= 0 ? 1 : (soll == null || F.recv >= soll - 0.005) ? 3 : 2, recv: F.recv, ret: 0, soll, open: soll != null ? Math.max(0, soll - F.recv) : 0 };
    const L = _cckLook(P, A, k);
    const pill = $(`cck-pill-${pfx}`); if (pill) { pill.className = 'tnp ' + L.pill[1]; pill.textContent = L.pill[0]; }
    const bar = $(`cck-bar-${pfx}`); if (bar) { bar.style.width = L.bar[0] + '%'; bar.style.background = L.bar[1]; }
    const cap = $(`cck-cap-${pfx}`); if (cap) cap.textContent = L.cap;
  }
  [F.dIn, F.nIn, F.fIn].forEach(el => { if (el) el.classList.toggle('cck-err', F.bad); });
  const rn = $(`cck-rn-${pfx}`);
  if (rn) {
    rn.classList.toggle('cck-err', F.bad);
    rn.textContent = F.bad ? `Kept + refund can be at most ${A.fmt(F.recv)}`
      : !F.any ? 'Type what you keep, or the refund · empty = all still held'
      : F.nIn ? `${A.fmt(F.recv)} received − ${A.fmt(F.d)} other − ${A.fmt(F.n)} for NK` : `${A.fmt(F.recv)} received − ${A.fmt(F.d)} kept`;
  }
  const save = $(`cck-save-${pfx}`);
  if (save && typeof ccSaveSet === 'function') ccSaveSet(save, 'dirty');
  if (tid) { A.ui[tid] = A.ui[tid] || {}; A.ui[tid].draft = _cckDraftRead(pfx); }   // B25 (6): survives a redraw
}

/* ── buttons: Edit · Cancel · Save ── */
async function ccKautionAct(app, pfx, tid, act) {
  const A = _CCK[app]; if (!A || !tid) return;
  const $ = id => document.getElementById(id);
  const ui = A.ui[tid] = A.ui[tid] || {};
  const redraw = () => { _cckRedraw(app, pfx); A.afterChange(tid); };

  if (act === 'edit')   { ui.mode = 'edit'; ui.draft = null; return redraw(); }
  if (act === 'cancel') { ui.mode = '';     ui.draft = null; return redraw(); }
  if (act !== 'save') return;

  // B25 (5): an unfinished date (e.g. 15.01.202) is never saved as "no date" — say so and stop
  const badDate = [[`cck-rd-${pfx}`, 'Received on'], [`cck-fd-${pfx}`, 'Refunded on']]
    .map(([id, label]) => [$(id), label]).find(([el]) => el && String(_cckRaw(el)).trim() && !el.value);
  if (badDate) {
    badDate[0].setAttribute('aria-invalid', 'true');
    const rn0 = $(`cck-rn-${pfx}`);
    if (rn0) { rn0.classList.add('cck-err'); rn0.textContent = badDate[1] + ': please enter the full date (TT.MM.JJJJ) or leave it empty'; }
    if (typeof ccToast === 'function') ccToast(badDate[1] + ': date not complete — not saved', true);
    return;
  }

  const k0 = A.map()[tid];
  const sv = $(`cck-sv-${pfx}`);
  if (sv && A.saveSoll) {
    const info0 = A.soll(A.rec(tid)); const cur = info0 ? _cckNum(info0.amount) : null;
    const nv = sv.value === '' ? null : Number(sv.value);
    if (nv !== cur && (nv === null || nv >= 0)) await A.saveSoll(tid, nv);
  }
  const F = _cckForm(pfx, k0, null);
  if (F.bad) { (F.fIn || F.dIn)?.focus(); return; }
  const fd = $(`cck-fd-${pfx}`), refDate = fd ? (fd.value || '') : '';
  // nothing kept and no refund typed: still held (0) — or, with a "Refunded on" date, all of it went back
  const returned = F.any ? _cckR2(F.rf) : (refDate ? _cckR2(F.recv) : 0);
  await A.saveAmounts(tid, F.recv, returned);          // memory + database (existing path)
  const k = A.map()[tid];
  if (!k || !k.id) return;
  const upd = {};
  if (_cckHasExtra(A)) {                                // (a first save may have just created the row)
    const rd = $(`cck-rd-${pfx}`), g = $(`cck-g-${pfx}`);
    if (rd) upd.received_at = rd.value || null;
    if (g)  upd.deduction_reason = F.any ? (g.value.trim() || null) : null;
  }
  if (Object.prototype.hasOwnProperty.call(k, 'nk_einbehalt')) upd.nk_einbehalt = F.any ? _cckR2(F.n) : 0;
  upd.settled = !!refDate;                              // "Refunded on" = the refund is paid
  upd.settled_at = refDate || null;
  const before = {}; Object.keys(upd).forEach(key => { before[key] = k[key]; });
  Object.assign(k, upd);
  const { error } = await ccQueueWrite(A.writeKey + tid, () => sbL.from(A.table).update(upd).eq('id', k.id));
  if (error) {                                          // not saved: the form stays open with what you typed
    Object.assign(k, before); if (typeof ccSaveFailed === 'function') ccSaveFailed(error, A.failLabel);
    return redraw();
  }
  ui.mode = ''; ui.draft = null;
  redraw();
}

/* Kaution Soll — the one place to change it (fixed per tenancy) */
function ccKautionEditSoll(app, pfx, tid) {
  const f = document.getElementById('cck-sf-' + pfx); if (!f) return;
  f.hidden = false; document.getElementById('cck-sv-' + pfx)?.focus();
}
async function ccKautionSaveSoll(app, pfx, tid) {
  const A = _CCK[app]; if (!A || !A.saveSoll || !tid) return;
  const raw = document.getElementById('cck-sv-' + pfx)?.value;
  const v = raw === '' || raw == null ? null : Number(raw);
  if (v !== null && !(v >= 0)) return;
  const ok = await A.saveSoll(tid, v);
  if (ok !== false) { _cckRedraw(app, pfx); if (A.afterChange) A.afterChange(tid); }
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
  if (!document.getElementById('cck-soll-css')) {
    const st = document.createElement('style'); st.id = 'cck-soll-css';
    st.textContent = '.cck-soll-edit{margin-left:6px;padding:0;border:none;background:none;font:inherit;font-size:11px;color:var(--cc-taupe);text-decoration:underline;text-underline-offset:2px;cursor:pointer}'
      + '.cck-soll-form{display:flex;gap:6px;align-items:center;margin:6px 0 8px}.cck-soll-form[hidden]{display:none}'
      + '.cck-soll-form input{flex:1;min-width:0;height:34px;padding:0 10px;border:.5px solid var(--cc-rule);border-radius:8px;background:var(--cc-bg);font:inherit;font-size:14px}';
    document.head.appendChild(st);
  }
  if (typeof document === 'undefined' || document.getElementById('cck-styles')) return;
  const s = document.createElement('style');
  s.id = 'cck-styles';
  s.textContent = `
.cck-hint{font-size:10px;color:var(--cc-taupe);margin:4px 0 7px}
.cck-nkhint{font-size:10px;line-height:1.4;color:var(--cc-taupe);align-self:end;padding-bottom:10px}
.cck-bar{height:3px;border-radius:2px;background:var(--cc-surface);overflow:hidden}
.cck-bar>div{height:3px;border-radius:2px;transition:width .2s}
.cck-cap{font-size:10px;color:var(--cc-taupe);margin:5px 0 10px;min-height:14px}
.cck-sum{font-size:15px;font-weight:500;color:var(--cc-charcoal);margin:2px 0 6px}
.cck-sum span{font-size:11px;font-weight:400;color:var(--cc-taupe)}
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
.cck-fixed-hint{font-size:10px;color:var(--cc-taupe);margin-top:4px;line-height:1.4}
.cck-soll-hint{font-size:10px;color:var(--cc-taupe);margin-top:3px}
.cck-b{height:36px;padding:0 16px;border-radius:8px;font-family:inherit;font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cck-b:disabled{opacity:.5;cursor:default}
.cck-bp{min-width:96px;padding:0 18px;background:var(--cc-ink);color:var(--cc-white);border:.5px solid var(--cc-ink)}
.cck-bs{background:transparent;color:var(--cc-taupe);border:.5px solid var(--cc-rule)}
html button.cc-save.cck-sec{background:transparent!important;color:var(--cc-taupe)!important;border-color:var(--cc-rule)!important;min-width:0!important;padding:0 16px!important}
`;
  (document.head || document.documentElement).appendChild(s);
}

/* ── KAUTION SOLL: fixed per tenancy ────────────────────────────
   Set ONCE at move-in, saved on the tenant (kaution_soll). It does not
   follow rent changes (Staffel, index, new rent) or contract renewals of
   the same tenant — only a manual change in the tenant's profile.

   Filling a tenant that has no fixed Soll yet (existing tenants, once):
     1 unit-level individual Kaution (card)          → that amount
     2 Staffel history shows the rent at move-in     → Kaution from that rent
     3 tenancy < 12 months (rent cannot have risen)   → Kaution from today's rent
     4 tenancy ≥ 12 months: Kaution received > 0      → the amount received
     5 otherwise                                      → Kaution from today's rent  */
function ccKautionStartSoll({ current, staffelSoll, mietbeginn, received }) {
  const cur = current && Number(current.amount) > 0 ? Number(current.amount) : null;
  if (current && /^Individuell/.test(current.text || '') && cur) return cur;
  if (Number(staffelSoll) > 0) return Math.round(Number(staffelSoll) * 100) / 100;
  const d = mietbeginn && typeof ccTnDaysUntil === 'function' ? ccTnDaysUntil(mietbeginn) : null;
  if (d == null || d > -365) return cur;
  if (Number(received) > 0) return Math.round(Number(received) * 100) / 100;
  return cur;
}

/* Contract generators: the current tenant's fixed Kaution Soll goes into the
   Kaution field (instead of a value recalculated from today's rent). */
function ccApplyFixedKaution(inputId, amount) {
  if (amount == null || amount === '' || !(Number(amount) > 0)) return;
  const el = document.getElementById(inputId); if (!el) return;
  el.removeAttribute('data-auto');                      // no longer follows rent / dates
  el.value = String(Number(amount));
  const box = el.closest('.rm-field') || el.parentElement;
  if (box && !box.querySelector('.cck-fixed-hint')) {
    const h = document.createElement('div');
    h.className = 'cck-fixed-hint';
    h.textContent = 'Kaution-Soll des aktuellen Mieters (fest seit Einzug). Für einen neuen Mieter bitte anpassen.';
    box.appendChild(h);
  }
}
