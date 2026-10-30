/* ─────────────────────────────────────────────────────────────
   CONTROLLING — ABRECHNUNGEN RESULTS (NK · Hausgeld) in Income / Expenses
   controlling-abr.js

   Controlling does no settlement tracking. It only shows FINISHED results
   and lets you confirm when the money moved:
     Income   (+1)  NK Nachzahlung vom Mieter · Hausgeld Guthaben von WEG
     Expenses (−1)  NK Guthaben an Mieter   · Hausgeld Nachzahlung an WEG
   Sources of results
     · abr_results            (written by Settlements; the old manual
                               "+ Abrechnung" form is gone — Fix 1, Oct 2026)
     · tenant-tab NK entries  (Casa Castel / Rentals, with an amount) — interim
   When a row shows
     · nothing before a result exists (no placeholders)
     · open → in its month (due date, else result date); if that month is over,
       it moves along into the current month ("fällig seit …") until confirmed
     · confirmed → in the month paid (the booking's date)
     · settled via Kaution / Miete / Hausgeld or 0 € → once, as information
   Bookings stay in ctrl_expense_one_time (kind NK-Abrechnung / Hausgeldabrechnung,
   source_ref 'abr:<id>' or the tenant-tab ref) → Dashboard unchanged.
   Fix 3 (Oct 2026): Casa Castel's Versorger Jahresabrechnungen (Strom · Gas · Wasser ·
   Entsorgung, typed and paid in Settlements › Casa Castel, kind Versorger) show here too —
   read-only, in the month paid: Guthaben in Income, Nachzahlung in Expenses. One-off no
   longer lists them; the Dashboard counts them with the Abrechnungen.
   Never part of "Alle offenen wie geplant".
   ───────────────────────────────────────────────────────────── */

'use strict';

const CX_ABR_KINDS = ['NK-Abrechnung', 'Hausgeldabrechnung'];
/* Fix 3: a Casa Castel Versorger Jahresabrechnung (Strom · Gas · Wasser · Entsorgung) — an Abrechnung, not a one-off */
function ctlIsCasaJa(o) { return !!o && Number(o.property_id) === CASA_PROP_ID && o.kind === 'Versorger'; }
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
  // Fix 3: Casa Castel's Versorger Jahresabrechnungen — typed and paid in Settlements, shown read-only in the month paid
  if (Number(pid) === CASA_PROP_ID) {
    for (const o of (window._ctrl.one_time || [])) {
      if (!ctlIsCasaJa(o) || _cxYm(o.invoice_date) !== ym) continue;
      if ((Number(o.direction) === 1 ? 1 : -1) !== dir) continue;
      rows.push({ id: 'abrV:' + o.id, ja: o, info: true });
    }
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
  const mon = ym => CX_MONTHS[(ym - 1) % 12].slice(0, 3);
  let h = '<div class="cx-abr-h"><span class="cx-lbl">Abrechnungen</span>' +
    '<a class="cx-link" href="settlements.html" style="color:var(--cx-acc)">open in Settlements ›</a></div>';
  for (const r of rows) {
    _cxAbrIndex[r.id] = Object.assign({ p, dir }, r);
    if (r.ja) {                                                            // Fix 3: Versorger Jahresabrechnung · read-only
      const inn = Number(r.ja.direction) === 1;
      h += '<div class="cx-r"><div class="cx-r__top"><span class="cx-r__u">' + cxEsc(r.ja.item || 'Jahresabrechnung') + '</span>' +
        cxPill(inn ? 'ok' : 'grey', inn ? 'Guthaben' : 'Nachzahlung') + '</div>' +
        '<div class="cx-r__sub">' + cxEsc(cxEur(r.ja.amount) + ' · ' + (inn ? 'received ' : 'paid ') + cxFmtDate(r.ja.invoice_date) + ' · from Settlements') + '</div></div>';
      continue;
    }
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
  return '<div class="cx-abr' + (!rows.length ? ' cx-abr--empty' : '') + '">' + h + '</div>';
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
      if (!(await ccConfirm('Delete this booking?', ccEscHtml(e.legacy.item || ''), 'Delete', true))) return;
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
  if (a === 'take' && /^abr/.test(b.dataset.id || '')) {
    const e = _cxAbrIndex[b.dataset.id];
    if (e && !e.info && e.ist === null) { try { await _cxAbrBook(e, e.soll); } catch (err) { cxToastErr(err); } }
    rerender(); return true;
  }
  if (a === 'abrStorno') {
    const e = _cxAbrIndex[b.dataset.id];
    if (!e || !e.res || !e.res.manual) return true;
    const bk = ctlAbrBooking(e.res);
    if ((await ccDialog({ icon: 'ti-alert-triangle', tone: 'danger', title: 'Cancel this Abrechnung?', body: ccEscHtml(e.res.label) + (bk ? '<br><br>The booking of ' + cxFmtDate(bk.invoice_date) + ' (' + cxEur(bk.amount) + ') will be deleted too.' : ''), actions: [{ label: 'Keep', value: false }, { label: 'Cancel Abrechnung', value: true, danger: true }] })) !== true) return true;
    try {
      if (bk) { await ctlDeleteOneTime(bk.id); window._src.abrPay = window._src.abrPay.filter(o => o.id !== bk.id); }
      const { error } = await _ctlSupa.from('abr_results').update({ status: 'storniert' }).eq('id', e.res.db.id);
      if (error) throw error;
      e.res.db.status = 'storniert';
    } catch (err) { cxToastErr(err); }
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
    if (r.ja) { done += cxR(r.ja.amount); continue; }                    // Fix 3: Jahresabrechnung, already paid
    if (r.info) continue;
    if (r.ist === null) { open++; openSum += r.soll; } else done += r.ist;
  }
  if (!open && !done) return '';
  return 'Abrechnungen · ' + [open ? open + ' open (' + (dir > 0 ? '+' : '\u2212') + '\u202f' + cxEur(openSum) + ')' : '', done ? 'done ' + cxEur(done) : ''].filter(Boolean).join(' · ');
}
