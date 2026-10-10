/* ─────────────────────────────────────────────────────────────
   CONTROLLING — ABRECHNUNGEN RESULTS (NK · Hausgeld) in Income / Expenses
   controlling-abr.js

   Controlling does no settlement tracking. It only shows FINISHED results
   and lets you confirm when the money moved:
     Income   (+1)  NK Nachzahlung vom Mieter · Hausgeld Guthaben von WEG
     Expenses (−1)  NK Guthaben an Mieter   · Hausgeld Nachzahlung an WEG
   Sources of results
     · abr_results            (manual "+ Abrechnung" now, Settlements app later)
     · tenant-tab NK entries  (Casa Castel / Rentals, with an amount) — interim
   When a row shows
     · nothing before a result exists (no placeholders)
     · open → in its month (due date, else result date); if that month is over,
       it moves along into the current month ("fällig seit …") until confirmed
     · confirmed → in the month paid (the booking's date)
     · settled via Kaution / Miete / Hausgeld or 0 € → once, as information
   Bookings stay in ctrl_expense_one_time (kind NK-Abrechnung / Hausgeldabrechnung,
   source_ref 'abr:<id>' or the tenant-tab ref) → Dashboard unchanged.
   Never part of "Alle offenen wie geplant".
   ───────────────────────────────────────────────────────────── */

'use strict';

const CX_ABR_KINDS = ['NK-Abrechnung', 'Hausgeldabrechnung'];
const _cxAbr = { form: null };                         // 'pid|dir' of the open "+ Abrechnung" form
let _cxAbrIndex = {};                                   // row id → { res | legacy }

const _cxYm = iso => { const s = String(iso || '').slice(0, 10); return s ? Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) : null; };
const _cxAbrVia = { kaution: 'settled with Kaution', miete: 'settled with rent', hausgeld: 'settled with Hausgeld' };

function _cxAbrLabel(kind, year, dir, unit, name, from, to) {
  const per = from && to && typeof ctlPeriodLabel === 'function' ? ctlPeriodLabel(from, to) : String(year);   // NK dd.mm.yyyy–dd.mm.yyyy
  if (kind === 'weg_hausgeld') return 'Hausgeld ' + per + ' · ' + (dir > 0 ? 'Guthaben from WEG' : dir < 0 ? 'Nachzahlung to WEG' : 'balanced');
  return 'NK ' + per + [unit, name].filter(Boolean).map(x => ' · ' + x).join('') + ' · ' +
    (dir > 0 ? 'Nachzahlung from tenant' : dir < 0 ? 'Guthaben to tenant' : 'balanced');
}

/* Every result (all years), newest first */
function ctlAbrResults() {
  const S = window._src, out = [];
  const props = window._ctrl.properties;
  for (const r of (S.abr || [])) {
    if (r.status === 'storniert') continue;
    const dir = Number(r.direction) || 0;
    out.push({ key: 'abr:' + r.id, refs: ['abr:' + r.id].concat(r.source_ref ? [r.source_ref] : []), db: r,
               pid: Number(r.property_id), kind: r.kind, year: r.year, dir, amount: cxR(r.amount),
               date: String(r.due_date || r.result_date || '').slice(0, 10), via: r.settle_via || 'zahlung',
               label: _cxAbrLabel(r.kind, r.year, dir, r.unit_label, r.tenant_name, r.period_from, r.period_to), manual: true });
  }
  // interim: NK entries with an amount from the tenant tabs (not yet taken over into abr_results)
  const over = new Set((S.abr || []).filter(r => r.status !== 'storniert' && r.source_ref).map(r => r.source_ref));
  const yr = e => { const m = String(e.period || '').match(/20\d\d/g); return m ? Number(m[m.length - 1]) : null; };
  const aptProp = aptId => props.filter(p => p.active).find(p => { const l = ctlPropLinks(p); return l.apt && String(l.apt.id) === String(aptId); });
  // #7 (Oct 2026): the same tenant + year already has a result from Settlements → the old Tenants-tab entry is hidden
  const newRes = new Set((S.abr || []).filter(r => r.status !== 'storniert' && r.kind === 'nk_tenant' && r.tenant_id).map(r => String(r.tenant_id) + '|' + Number(r.year)));
  const add = (e, ref, t, p, unit) => {
    const amt = _cxNum(e.amount);
    if (!amt || !p || over.has(ref) || newRes.has(String(e.tenant_id) + '|' + yr(e))) return;
    const dir = amt > 0 ? 1 : -1, y = yr(e) || '';
    out.push({ key: ref, refs: [ref], pid: p.id, kind: 'nk_tenant', year: y, dir, amount: cxR(Math.abs(amt)),
               date: e.created_at ? (typeof ccDayOf === 'function' ? ccDayOf(e.created_at) : String(e.created_at).slice(0, 10)) : cxToday(), via: 'zahlung',
               label: _cxAbrLabel('nk_tenant', y, dir, unit, t ? [t.first_name, t.last_name].filter(Boolean).join(' ') : ''), tenantTab: true });
  };
  for (const e of (S.rntNk || [])) {
    const t = S.rntTen.find(x => String(x.id) === String(e.tenant_id));
    const p = t && t.apartment_id ? aptProp(t.apartment_id) : null;
    add(e, 'rnt_nk:' + e.id, t, p, '');
  }
  const casa = props.find(p => p.id === CASA_PROP_ID && p.active);
  for (const e of (S.casaNk || [])) {
    const t = S.casaTen.find(x => String(x.id) === String(e.tenant_id));
    add(e, 'nk:' + e.id, t, casa, t && t.room);
  }
  return out;
}

/* The booking of a result (any year) */
function ctlAbrBooking(res) {
  return (window._src.abrPay || []).find(o => res.refs.includes(o.source_ref)) || null;
}

/* Rows of one property card in a month, for one direction (+1 Income, −1 Expenses) */
function ctlAbrRows(pid, y, m, dir) {
  const rows = [], ym = y * 12 + m, t = cxToday(), cur = _cxYm(t);
  const results = ctlAbrResults().filter(r => r.pid === pid && r.dir === dir);
  const usedRefs = new Set();
  for (const r of results) {
    const b = ctlAbrBooking(r);
    if (b) usedRefs.add(b.source_ref);
    const rym = _cxYm(r.date) || cur;
    if (r.via !== 'zahlung' || !r.amount) {                                // information only
      if (rym === ym) rows.push({ id: 'abrI:' + r.key, res: r, info: true });
      continue;
    }
    if (b) { if (_cxYm(b.invoice_date) === ym) rows.push({ id: 'abr:' + r.key, res: r, booking: b, soll: r.amount, ist: cxR(b.amount) }); continue; }
    const showIn = rym >= cur ? rym : cur;                                 // overdue → moves along to the current month
    if (showIn === ym) rows.push({ id: 'abr:' + r.key, res: r, soll: r.amount, ist: null, overdue: rym < cur ? rym : null });
  }
  // bookings without a result (older manual NK / Hausgeld entries) — shown in the month paid
  for (const o of (window._src.abrPay || [])) {
    if (Number(o.property_id) !== pid || usedRefs.has(o.source_ref) || _cxYm(o.invoice_date) !== ym) continue;
    if ((Number(o.direction) === 1 ? 1 : -1) !== dir) continue;
    if (results.some(r => r.refs.includes(o.source_ref))) continue;
    rows.push({ id: 'abrL:' + o.id, legacy: o, soll: cxR(o.amount), ist: cxR(o.amount) });
  }
  return rows;
}
/* open results of a property in a month (for card status, summaries, Dashboard) */
function ctlAbrOpenCount(pid, y, m, dir) {
  return ctlAbrRows(pid, y, m, dir).filter(r => !r.info && r.ist === null).length;
}

/* ── HTML: the "Abrechnungen" section of a property card ── */
function cxAbrSection(p, y, m, dir) {
  const rows = ctlAbrRows(p.id, y, m, dir);
  const fk = p.id + '|' + dir, formOpen = _cxAbr.form === fk;
  const mon = ym => CX_MONTHS[(ym - 1) % 12].slice(0, 3);
  let h = '<div class="cx-abr-h"><span class="cx-lbl">Abrechnungen</span>' +
    '<a class="cx-link" href="settlements.html" style="color:var(--cx-acc)">open in Settlements ›</a></div>';
  for (const r of rows) {
    _cxAbrIndex[r.id] = Object.assign({ p, dir }, r);
    if (r.info) {
      h += '<div class="cx-r"><div class="cx-r__top"><span class="cx-r__u">' + cxEsc(r.res.label) + '</span>' + cxPill('grey', 'settled') + '</div>' +
        '<div class="cx-r__sub">' + cxEsc((r.res.amount ? cxEur(r.res.amount) + ' · ' : '') + (_cxAbrVia[r.res.via] || 'balanced') + ' – no payment') + '</div>' +
        (r.res.manual ? '<div class="cx-r__sub"><button class="cx-link cx-link--a" data-cx="abrStorno" data-id="' + cxEsc(r.id) + '">cancel</button></div>' : '') + '</div>';
      continue;
    }
    const label = r.legacy ? (r.legacy.item || r.legacy.kind) : r.res.label;
    const sub = r.legacy ? 'booked ' + cxFmtDate(r.legacy.invoice_date) + ' · without Abrechnung'
      : r.booking ? 'paid ' + cxFmtDate(r.booking.invoice_date)
      : (r.res.tenantTab ? 'from the tenant tab' : 'Abrechnung of ' + cxFmtDate(r.res.db.result_date));
    h += cxRow({ id: r.id, label, soll: r.soll, ist: r.ist, allowEmpty: true,
                 pills: r.overdue ? cxPill('open', 'due since ' + mon(r.overdue)) : '',
                 sub: cxEsc(sub) + (r.res && r.res.manual ? ' · <button class="cx-link cx-link--a cx-link--in" data-cx="abrStorno" data-id="' + cxEsc(r.id) + '">cancel</button>' : '') });
  }
  if (formOpen) h += _cxAbrFormHTML(p, dir);
  return '<div class="cx-abr' + (!rows.length && !formOpen ? ' cx-abr--empty' : '') + '">' + h + '</div>';
}

function _cxAbrFormHTML(p, dir) {
  const casa = p.id === CASA_PROP_ID, f = _cxAbr.f || {};
  const kind = casa ? 'nk_tenant' : (f.kind || 'nk_tenant');
  const ty = Number(cxToday().slice(0, 4));
  const years = [ty - 1, ty - 2, ty - 3, ty];
  // tenants of the property's living units (every tenancy, newest first)
  const opts = [];
  for (const u of ctlUnitsFor(p.id)) {
    if (_cxIsParking(u)) continue;
    const l = ctlUnitLink(u, p); if (!l) continue;
    for (const w of _cxTenancies(l)) opts.push({ v: _cxApp(l) + '|' + w.id + '|' + u.name + '|' + w.name,
      t: u.name + ' · ' + w.name + (w.from ? ' · from ' + cxFmtDate(w.from) : '') });
  }
  const res = kind === 'weg_hausgeld' ? (dir > 0 ? 'Guthaben from WEG' : 'Nachzahlung to WEG') : (dir > 0 ? 'Nachzahlung from tenant' : 'Guthaben to tenant');
  const vias = kind === 'weg_hausgeld' ? [['zahlung', 'by bank transfer'], ['hausgeld', 'settled with Hausgeld']]
                                       : [['zahlung', 'by bank transfer'], ['kaution', 'settled with Kaution'], ['miete', 'settled with rent']];
  return '<div class="cx-form cx-abr-form">' +
    (casa ? '' : '<div class="cx-chips">' + [['nk_tenant', 'NK · tenant'], ['weg_hausgeld', 'Hausgeld · WEG']].map(([v, l]) =>
      '<button class="cx-chip' + (kind === v ? ' on' : '') + '" data-cx="abrKind" data-v="' + v + '">' + l + '</button>').join('') + '</div>') +
    '<div class="cx-r__sub">Result: <b style="font-weight:500">' + cxEsc(res) + '</b> · ' + (dir > 0 ? 'money comes to you' : 'money goes to ' + (kind === 'weg_hausgeld' ? 'the WEG' : 'the tenant')) + '</div>' +
    (kind === 'nk_tenant' ? '<label class="cx-f cx-f--l"><select id="cxAbrTen" aria-label="Tenant"><option value="">— choose tenant —</option>' +
      opts.map(o => '<option value="' + cxEsc(o.v) + '">' + cxEsc(o.t) + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' : '') +
    '<div class="cx-grid2">' +
      '<label class="cx-f cx-f--l"><select id="cxAbrYear" aria-label="Abrechnung year">' + years.map(x => '<option value="' + x + '"' + (x === ty - 1 ? ' selected' : '') + '>Year ' + x + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
      '<label class="cx-f"><input type="text" inputmode="decimal" id="cxAbrAmt" placeholder="Amount" aria-label="Amount"><span>€</span></label>' +
    '</div>' +
    '<div class="cx-grid2">' +
      '<div><div class="cx-set__k">Abrechnung date</div><label class="cx-f cx-f--l"><input type="date" id="cxAbrDate" value="' + cxToday() + '" aria-label="Abrechnung date"></label></div>' +
      '<div><div class="cx-set__k">Due on (optional)</div><label class="cx-f cx-f--l"><input type="date" id="cxAbrDue" aria-label="Due on (optional)"></label></div>' +
    '</div>' +
    '<label class="cx-f cx-f--l"><select id="cxAbrVia" aria-label="How">' + vias.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') + '</select><i class="ti ti-chevron-down" aria-hidden="true"></i></label>' +
    '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="abrAdd" data-k="' + p.id + '|' + dir + '">Cancel</button>' +
      '<button class="cx-btn cx-btn--p" data-cx="abrSave" data-p="' + p.id + '" data-d="' + dir + '" data-kind="' + kind + '">Save</button></div>' +
  '</div>';
}

/* Booking date: today when looking at the current month, else the result's date if it lies in the viewed month,
   else the last (past) or first (future) day of the viewed month */
function _cxAbrPayDate(res, y, m) {
  const t = cxToday(), ym = y * 12 + m, cur = _cxYm(t);
  if (ym === cur) return t;
  if (res && _cxYm(res.date) === ym) return res.date;
  const last = new Date(y, m, 0).getDate();
  return y + '-' + String(m).padStart(2, '0') + '-' + String(ym < cur ? last : 1).padStart(2, '0');
}

async function _cxAbrBook(e, amount) {
  const r = e.res, y = window._ctrl.year, m = CX.month;
  if (e.legacy) {                                                          // booking without result: edit / delete only
    if (amount === null) {
      if (!confirm('Delete booking "' + (e.legacy.item || '') + '"?')) return;
      await ctlDeleteOneTime(e.legacy.id);
      window._src.abrPay = window._src.abrPay.filter(o => o.id !== e.legacy.id);
    } else {
      const d = await ctlUpdateOneTime(e.legacy.id, { amount: cxR(amount) });
      const i = window._src.abrPay.findIndex(o => o.id === e.legacy.id); if (i >= 0) window._src.abrPay[i] = d;
    }
    return;
  }
  const b = ctlAbrBooking(r);
  if (amount === null) {
    if (!b) return;
    await ctlDeleteOneTime(b.id);
    window._src.abrPay = window._src.abrPay.filter(o => o.id !== b.id);
    return;
  }
  if (b) {
    const d = await ctlUpdateOneTime(b.id, { amount: cxR(amount) });
    const i = window._src.abrPay.findIndex(o => o.id === b.id); if (i >= 0) window._src.abrPay[i] = d;
    return;
  }
  const d = await ctlAddOneTime({ property_id: r.pid, invoice_date: _cxAbrPayDate(r, y, m), item: r.label, amount: cxR(amount),
    kind: r.kind === 'weg_hausgeld' ? 'Hausgeldabrechnung' : 'NK-Abrechnung', direction: r.dir, source_ref: r.key });
  window._src.abrPay = (window._src.abrPay || []).concat([d]);
}

/* Handles every Abrechnungen action of a tab. Returns true when it was one. */
async function cxAbrClick(a, b, rerender) {
  if (a === 'abrAdd') { const k = b.dataset.k; _cxAbr.form = _cxAbr.form === k ? null : k; _cxAbr.f = {}; rerender(); return true; }
  if (a === 'abrKind') { _cxAbr.f = { kind: b.dataset.v }; rerender(); return true; }
  if (a === 'take' && /^abr/.test(b.dataset.id || '')) {
    const e = _cxAbrIndex[b.dataset.id];
    if (e && !e.info && e.ist === null) { try { await _cxAbrBook(e, e.soll); } catch (err) { cxToastErr(err); } }
    rerender(); return true;
  }
  if (a === 'abrStorno') {
    const e = _cxAbrIndex[b.dataset.id];
    if (!e || !e.res || !e.res.manual) return true;
    const bk = ctlAbrBooking(e.res);
    if (!confirm('Cancel Abrechnung "' + e.res.label + '"?' + (bk ? '\n\nThe booking of ' + cxFmtDate(bk.invoice_date) + ' (' + cxEur(bk.amount) + ') will be deleted too.' : ''))) return true;
    try {
      if (bk) { await ctlDeleteOneTime(bk.id); window._src.abrPay = window._src.abrPay.filter(o => o.id !== bk.id); }
      const { error } = await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', e.res.db.id);
      if (error) throw error;
      e.res.db.status = 'storniert';
    } catch (err) { cxToastErr(err); }
    rerender(); return true;
  }
  if (a === 'abrSave') {
    const pid = Number(b.dataset.p), dir = Number(b.dataset.d), kind = b.dataset.kind, p = ctlProp(pid);
    const amt = cxParse(document.getElementById('cxAbrAmt')?.value);
    const year = Number(document.getElementById('cxAbrYear')?.value);
    const rdate = String(document.getElementById('cxAbrDate')?.value || '').slice(0, 10) || cxToday();
    const due = String(document.getElementById('cxAbrDue')?.value || '').slice(0, 10) || null;
    const via = document.getElementById('cxAbrVia')?.value || 'zahlung';
    const ten = kind === 'nk_tenant' ? (document.getElementById('cxAbrTen')?.value || '') : '';
    const say = t => { if (typeof ctlToast === 'function') ctlToast(t); };
    if (!(amt > 0)) { say('Please enter the amount'); document.getElementById('cxAbrAmt')?.focus(); return true; }
    if (kind === 'nk_tenant' && !ten) { say('Please choose the tenant'); return true; }
    const [app, tid, unit, name] = ten ? ten.split('|') : [null, null, null, null];
    const row = { property_id: pid, kind, year, app: app || (pid === CASA_PROP_ID ? 'casa' : 'rentals'), tenant_id: tid || null,
                  unit_label: unit || null, tenant_name: name || null, direction: dir, amount: cxR(amt),
                  result_date: rdate, due_date: due, settle_via: via, status: 'fertig', source: 'manual' };
    b.disabled = true;
    try {
      const { data, error } = await _ctlSupa.from('abr_results').insert(row).select().single();
      if (error) throw error;
      window._src.abr = (window._src.abr || []).concat([data]);
      _cxAbr.form = null;
      say('Abrechnung saved');
    } catch (err) {
      const msg = String((err && (err.message || err.code)) || err);
      if (/abr_results_one_weg|duplicate|23505/i.test(msg)) say(kind === 'weg_hausgeld' ? 'There is already a Hausgeldabrechnung for ' + (p ? p.name : '') + ' ' + year : 'This Abrechnung already exists');
      else if (/abr_results|relation|does not exist|42P01/i.test(msg)) say('Please run the SQL (abr_results) first');
      else cxToastErr(err);
      b.disabled = false;
      return true;
    }
    rerender(); return true;
  }
  return false;
}
async function cxAbrInput(id, val, rerender) {
  if (!/^abr/.test(id)) return false;
  const e = _cxAbrIndex[id];
  if (e && !e.info) { try { await _cxAbrBook(e, val === null ? null : val); } catch (err) { cxToastErr(err); } }
  rerender();
  return true;
}

/* One line for the Income / Expenses summary card */
function _cxAbrNote(dir) {
  const y = window._ctrl.year, m = CX.month;
  let open = 0, openSum = 0, done = 0;
  for (const p of window._ctrl.properties.filter(x => x.active && ctlPropOwned(x, y, m))) for (const r of ctlAbrRows(p.id, y, m, dir)) {
    if (r.info) continue;
    if (r.ist === null) { open++; openSum += r.soll; } else done += r.ist;
  }
  if (!open && !done) return '';
  return 'Abrechnungen · ' + [open ? open + ' open (' + (dir > 0 ? '+' : '\u2212') + '\u202f' + cxEur(openSum) + ')' : '', done ? 'done ' + cxEur(done) : ''].filter(Boolean).join(' · ');
}
