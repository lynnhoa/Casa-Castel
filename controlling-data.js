/* ─────────────────────────────────────────────────────────────
   CONTROLLING — DATA LAYER
   controlling-data.js

   Kalt view logic:
     · Apartments:  Ausgaben o. Hausgeld  (Hausgeld = passthrough)
     · Casa Castel: only Rate stays; every other category is a
                    Betriebskosten passthrough covered by tenant
                    Nebenkosten.
   ───────────────────────────────────────────────────────────── */

'use strict';

const CASA_PROP_ID = 7;

/* Casa: only these category codes count toward Kalt-view expenses.
   Everything else is treated as a Nebenkosten-passthrough.        */
const CASA_KALT_CODES = ['RATE'];

window._ctrl = {
  year: new Date().getFullYear(),
  properties: [], units: [], categories: [],
  income: [], apt_expenses: [], castel_expenses: [],
  one_time: [], recon: [],
  diff: null                   // CP2: { inc, cst, apt } — the "On purpose" columns exist (CONTROLLING-C1.sql)
};

/* Nov 2026 (C1 #17): every read is checked first — one failed read changes nothing (it switched the year anyway,
   without its bookings, and 'Book all' then overwrote real amounts). All parts are taken over together and the
   year is set last, so a failed year change leaves you exactly where you were.
   C5 (#31): opt (only the reload when the app comes back, controlling-soll.js) = { ok(seq), quiet } — its rows are taken
   over only if ok() still says so (no newer load, the same year, no save on its way or made meanwhile); quiet = a
   failed read is no error message (the screen simply keeps what it has). Every other load works exactly as before. */
let _ctlLoadSeq = 0;
async function ctlLoadAll(year, opt) {
  const y = year || window._ctrl.year, seq = ++_ctlLoadSeq;
  const inc0 = window._src && window._src.incAll;

  const probe = ctlDiffProbe();                              // CP2: once per page, next to the first load
  const [p, u, c, inc, apt, cst, ot, rec] = await Promise.all([
    _ctlSupa.from('ctrl_properties').select('*').order('id'),
    _ctlSupa.from('ctrl_units').select('*').order('property_id').order('sort_order'),
    _ctlSupa.from('ctrl_castel_categories').select('*').order('sort_order'),
    _ctlSupa.from('ctrl_income_months').select('*').eq('year', y),
    _ctlSupa.from('ctrl_expense_apartments').select('*').eq('year', y),
    _ctlSupa.from('ctrl_expense_castel').select('*').eq('year', y),
    _ctlSupa.from('ctrl_expense_one_time').select('*').gte('invoice_date', y + '-01-01').lt('invoice_date', (y+1) + '-01-01'),
    _ctlSupa.from('ctrl_reconciliation').select('*').eq('year', y),
  ]);
  const rows = { properties: p, units: u, categories: c, income: inc, apt_expenses: apt, castel_expenses: cst, one_time: ot, recon: rec };
  for (const k in rows) if (rows[k].error) { if (!(opt && opt.quiet)) console.error('[controlling] load', k, rows[k].error); throw rows[k].error; }
  if (opt && typeof opt.ok === 'function' && !opt.ok(seq)) throw new Error('not taken over');
  const yearChanged = window._ctrl.year !== y;
  for (const k in rows) window._ctrl[k] = rows[k].data || [];
  window._ctrl.year = y;
  // C5: the all-years copy (balances) gets this year's rows as just read — unless a newer read of it came meanwhile
  if (Array.isArray(inc0) && window._src.incAll === inc0) {
    const key = r => r.unit_id + '|' + r.month, fresh = new Map(window._ctrl.income.filter(r => r.year === y).map(r => [key(r), r]));
    const out = [];
    for (const r of inc0) { if (r.year !== y) out.push(r); else if (fresh.has(key(r))) { out.push(fresh.get(key(r))); fresh.delete(key(r)); } }
    window._src.incAll = out.concat([...fresh.values()]);
  }
  // C5: a tenant without a saved rent learns it from the loaded year's entries — another year, that Soll anew
  if (yearChanged && typeof ctlSollDropLearned === 'function') ctlSollDropLearned();
  ctlDataChanged();                                          // C5: new rows → the Tenant history works its balances out again
  await probe;
}

/* ── CP2 (#10) · "On purpose" ─────────────────────────────────
   A difference between Soll and Ist can be marked as meant (agreed, Kaution, pays later …).
   Needs CONTROLLING-C1.sql; probed once like MT.d39 — without it everything works as before
   and no row offers "On purpose".
     Income, Casa Castel costs  diff_ok + diff_reason on the month row (a tenant change: the whole unit)
     Apartment costs            diff_marks { line: reason | null } — one month row holds several lines
   Changing an amount clears its mark in the same save (the difference is new). */
const CTL_DIFF_REASONS = ['agreed', 'reduction', 'kaution', 'later', 'other'];
const _ctlNoDiffCol = e => /diff_(ok|reason|marks)/i.test(String((e && (e.message || e.details)) || ''));
async function ctlDiffProbe() {
  if (window._ctrl.diff) return window._ctrl.diff;
  const has = async (t, c) => { try { return !(await _ctlSupa.from(t).select(c).limit(1)).error; } catch (e) { return false; } };
  const [inc, cst, apt] = await Promise.all([has('ctrl_income_months', 'diff_ok,diff_reason'),
    has('ctrl_expense_castel', 'diff_ok,diff_reason'), has('ctrl_expense_apartments', 'diff_marks')]);
  return (window._ctrl.diff = { inc, cst, apt });
}
const ctlDiffOn = k => !!(window._ctrl.diff && window._ctrl.diff[k]);
/* The mark of a saved month row → { ok, reason } · null = not marked */
function ctlDiffMark(row) { return row && row.diff_ok ? { ok: true, reason: row.diff_reason || null } : null; }
function ctlAptMark(row, key) {
  const d = row && row.diff_marks;
  return d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, key) ? { ok: true, reason: d[key] || null } : null;
}
const _ctlR2 = v => Math.round((Number(v) || 0) * 100) / 100;
const _ctlMarkFields = mark => ({ diff_ok: !!(mark && mark.ok), diff_reason: mark && mark.ok && CTL_DIFF_REASONS.includes(mark.reason) ? mark.reason : null });
/* Income: the amount changed? (the unit's total, or one tenant's part in a change month) */
function _ctlIncChanged(old, kalt, nk, split) {
  if (_ctlR2(Number(old.kaltmiete || 0) + Number(old.nebenkosten || 0)) !== _ctlR2(Number(kalt || 0) + Number(nk || 0))) return true;
  if (!split || !old.split || typeof old.split !== 'object') return false;
  const ks = new Set(Object.keys(split).concat(Object.keys(old.split)));
  for (const k of ks) if (_ctlR2(old.split[k]) !== _ctlR2(split[k]) || (k in split) !== (k in old.split)) return true;
  return false;
}
function _ctlIncCache(data) {
  ctlDataChanged();                                                // C5: the Tenant history balances follow
  const y = data.year, m = data.month, u = data.unit_id;
  const all = window._src && window._src.incAll;                   // keep the all-years copy (balances) in step
  if (all) { const j = all.findIndex(r => r.unit_id === u && r.year === y && r.month === m); if (j >= 0) all[j] = data; else all.push(data); }
  const idx = window._ctrl.income.findIndex(r => r.unit_id === u && r.year === y && r.month === m);
  if (idx >= 0) window._ctrl.income[idx] = data; else window._ctrl.income.push(data);
  if (typeof ctlSollDropUnit === 'function') ctlSollDropUnit(u);   // x6: a learned rent follows the new entry at once
}
/* Set (mark = { ok:true, reason }) or clear (null) the mark. Only the mark changes:
   the amounts and the split per tenant stay exactly as they are. */
async function ctlSetIncomeMark(unit_id, month, mark) {
  const y = window._ctrl.year;
  const { data, error } = await _ctlSupa.from('ctrl_income_months').update(_ctlMarkFields(mark))
    .eq('unit_id', unit_id).eq('year', y).eq('month', month).select().single();
  if (error) throw error;
  if (!data) throw new Error('not saved – no amount in this month');
  _ctlIncCache(data);
  return data;
}
async function ctlSetCastelMark(category_id, month, mark) {
  const y = window._ctrl.year;
  const { data, error } = await _ctlSupa.from('ctrl_expense_castel').update(_ctlMarkFields(mark))
    .eq('category_id', category_id).eq('year', y).eq('month', month).select().single();
  if (error) throw error;
  if (!data) throw new Error('not saved – no amount in this month');
  const idx = window._ctrl.castel_expenses.findIndex(r => r.category_id === category_id && r.year === y && r.month === month);
  if (idx >= 0) window._ctrl.castel_expenses[idx] = data; else window._ctrl.castel_expenses.push(data);
  return data;
}
async function ctlSetAptMark(property_id, month, key, mark) {
  const y = window._ctrl.year;
  const row = window._ctrl.apt_expenses.find(r => r.property_id === property_id && r.year === y && r.month === month);
  const marks = Object.assign({}, (row && row.diff_marks && typeof row.diff_marks === 'object') ? row.diff_marks : {});
  if (mark && mark.ok) marks[key] = CTL_DIFF_REASONS.includes(mark.reason) ? mark.reason : null; else delete marks[key];
  const { data, error } = await _ctlSupa.from('ctrl_expense_apartments').update({ diff_marks: Object.keys(marks).length ? marks : null })
    .eq('property_id', property_id).eq('year', y).eq('month', month).select().single();
  if (error) throw error;
  if (!data) throw new Error('not saved – no amount in this month');
  const idx = window._ctrl.apt_expenses.findIndex(r => r.property_id === property_id && r.year === y && r.month === month);
  if (idx >= 0) window._ctrl.apt_expenses[idx] = data; else window._ctrl.apt_expenses.push(data);
  return data;
}

/* ── Lookup helpers ─────────────────────────────────────────── */
function ctlProp(pid)   { return window._ctrl.properties.find(p => p.id === pid); }
function ctlUnit(uid)   { return window._ctrl.units.find(u => u.id === uid); }
function ctlCat(cid)    { return window._ctrl.categories.find(c => c.id === cid); }
function ctlUnitsOf(pid){ return window._ctrl.units.filter(u => u.property_id === pid); }

/* ── C5 (Nov 2026, #32 · #33) · one screen = one snapshot ───────────────────────
   A screen is drawn in one go (synchronously): nothing can be saved or loaded while it is drawn. So inside one
   drawing a figure asked for again (a property's month, its links, its Abrechnungen …) is worked out once and
   reused (ctlMemo). The memo starts with the drawing and is thrown away when it ends (ctlScope, try/finally),
   also after an error. Outside a drawing nothing is kept: Settlements, every save and 'Book all' work exactly as
   before. ctlDataChanged() (after any change of the data) also empties a memo that is running.
   _ctlGen counts the changes: the Tenant history keeps its balances until the next one (controlling-soll.js). */
let _ctlMemo = null;
window._ctlGen = 0;
function ctlScope(fn) {
  if (typeof fn !== 'function' || fn._ctlScoped) return fn;
  const w = function () {
    if (_ctlMemo) return fn.apply(this, arguments);                 // drawn inside another drawing (Setup → History)
    _ctlMemo = new Map();
    try { return fn.apply(this, arguments); } finally { _ctlMemo = null; }
  };
  w._ctlScoped = true;
  return w;
}
function ctlMemo(key, make) {
  if (!_ctlMemo) return make();
  if (_ctlMemo.has(key)) return _ctlMemo.get(key);
  const v = make();
  if (_ctlMemo) _ctlMemo.set(key, v);
  return v;
}
function ctlDataChanged() { window._ctlGen++; if (_ctlMemo) _ctlMemo.clear(); }

/* Timezone-safe date parser for invoice_date strings.
   Splits "YYYY-MM-DD..." directly — avoids new Date() shifting the day
   across the UTC boundary in negative timezones.                       */
function ctlParseDate(dateStr) {
  const parts = String(dateStr).slice(0, 10).split('-');
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

/* ── Per-property monthly aggregation ───────────────────────── */
function ctlPropertyMonth(pid, month) {
  const y = window._ctrl.year;
  const unitIds = ctlUnitsOf(pid).map(u => u.id);
  let kalt = 0, neben = 0;
  for (const row of window._ctrl.income) {
    if (row.year !== y || row.month !== month) continue;
    if (!unitIds.includes(row.unit_id)) continue;
    kalt  += Number(row.kaltmiete  || 0);
    neben += Number(row.nebenkosten || 0);
  }

  let expTotal = 0, expPassthru = 0;
  if (pid === CASA_PROP_ID) {
    for (const row of window._ctrl.castel_expenses) {
      if (row.year !== y || row.month !== month) continue;
      const cat = ctlCat(row.category_id);
      const amt = Number(row.amount || 0);
      expTotal += amt;
      if (!cat || !CASA_KALT_CODES.includes(cat.code)) expPassthru += amt;
    }
  } else {
    for (const row of window._ctrl.apt_expenses) {
      if (row.year !== y || row.month !== month) continue;
      if (row.property_id !== pid) continue;
      const rate     = Number(row.rate       || 0);
      const hausgeld = Number(row.hausgeld   || 0);
      const grund    = Number(row.grundsteuer|| 0);
      const strom    = Number(row.strom      || 0);
      expTotal    += rate + hausgeld + grund + strom;
      expPassthru += hausgeld;
    }
  }

  // One-time entries: out (direction −1, the default) and in (+1)
  let oneTime = 0, oneTimeIn = 0;
  for (const ot of window._ctrl.one_time) {
    if (ot.property_id !== pid || ot.kind === 'Kaufnebenkosten') continue;   // Kaufnebenkosten: part of the purchase, not the cashflow
    const d = ctlParseDate(ot.invoice_date);
    if (d.year !== y || d.month !== month) continue;
    if (Number(ot.direction) === 1) oneTimeIn += Number(ot.amount || 0);
    else                            oneTime   += Number(ot.amount || 0);
  }

  const expNet = expTotal - expPassthru;
  return {
    kalt, neben, warm: kalt + neben,
    exp_total: expTotal, exp_passthru: expPassthru, exp_net: expNet,
    one_time: oneTime, one_time_in: oneTimeIn,
    rein: kalt + neben + oneTimeIn,                           // Cashflow · Konto: everything in
    raus: expTotal + oneTime,                                  //                  everything out
    konto: (kalt + neben + oneTimeIn) - (expTotal + oneTime),
    gesamt:     (kalt + neben) - expTotal,   // recurring only
    netto_kalt: kalt - expNet,               // recurring only
  };
}

/* ── Portfolio + annual rollups ─────────────────────────────── */

/* ── Writes (upsert) ────────────────────────────────────────── */
async function ctlUpsertIncome(unit_id, month, kaltmiete, nebenkosten, split) {
  const y = window._ctrl.year;
  const payload = { unit_id, year: y, month, kaltmiete, nebenkosten };
  if (split !== undefined) payload.split = split;                    // per tenant in change months (G1)
  // CP2: a marked difference whose amount changes is new → the mark goes in the same save
  const old = window._ctrl.income.find(r => r.unit_id === unit_id && r.year === y && r.month === month);
  if (ctlDiffOn('inc') && old && old.diff_ok && _ctlIncChanged(old, kaltmiete, nebenkosten, split)) Object.assign(payload, _ctlMarkFields(null));
  const up = pl => _ctlSupa.from('ctrl_income_months').upsert(pl, { onConflict: 'unit_id,year,month' }).select().single();
  let { data, error } = await up(payload);
  if (error && 'diff_ok' in payload && _ctlNoDiffCol(error)) {      // C1 SQL gone again → save without the mark
    delete payload.diff_ok; delete payload.diff_reason; window._ctrl.diff.inc = false;
    ({ data, error } = await up(payload));
  }
  if (error && 'split' in payload && /split/.test(String(error.message || '')) ) {   // SQL not run yet
    delete payload.split;
    ({ data, error } = await up(payload));
    if (!error && typeof ctlToast === 'function') ctlToast('Saved – the split per tenant only after the SQL update');
  }
  if (error) throw error;
  _ctlIncCache(data);
  return data;
}

async function ctlUpsertApt(property_id, month, fields) {
  const y = window._ctrl.year;
  const payload = { property_id, year: y, month, ...fields };
  // CP2: a line whose amount changes loses its "On purpose" mark (the other lines keep theirs)
  const old = window._ctrl.apt_expenses.find(r => r.property_id === property_id && r.year === y && r.month === month);
  if (ctlDiffOn('apt') && old && old.diff_marks && typeof old.diff_marks === 'object' && !('diff_marks' in fields)) {
    const marks = Object.assign({}, old.diff_marks);
    const num = v => v === null || v === undefined ? null : _ctlR2(v);
    for (const k of Object.keys(fields)) if (k in marks && num(fields[k]) !== num(old[k])) delete marks[k];
    if (Object.keys(marks).length !== Object.keys(old.diff_marks).length) payload.diff_marks = Object.keys(marks).length ? marks : null;
  }
  const up = pl => _ctlSupa.from('ctrl_expense_apartments').upsert(pl, { onConflict: 'property_id,year,month' }).select().single();
  let { data, error } = await up(payload);
  if (error && 'diff_marks' in payload && _ctlNoDiffCol(error)) { delete payload.diff_marks; window._ctrl.diff.apt = false; ({ data, error } = await up(payload)); }
  if (error) throw error;
  const idx = window._ctrl.apt_expenses.findIndex(r => r.property_id === property_id && r.year === y && r.month === month);
  if (idx >= 0) window._ctrl.apt_expenses[idx] = data;
  else window._ctrl.apt_expenses.push(data);
  return data;
}

async function ctlUpsertCastel(category_id, month, amount) {
  const y = window._ctrl.year;
  const payload = { category_id, year: y, month, amount };
  // CP2: a marked difference whose amount changes is new → the mark goes in the same save
  const old = window._ctrl.castel_expenses.find(r => r.category_id === category_id && r.year === y && r.month === month);
  if (ctlDiffOn('cst') && old && old.diff_ok && _ctlR2(old.amount) !== _ctlR2(amount)) Object.assign(payload, _ctlMarkFields(null));
  const up = pl => _ctlSupa.from('ctrl_expense_castel').upsert(pl, { onConflict: 'category_id,year,month' }).select().single();
  let { data, error } = await up(payload);
  if (error && 'diff_ok' in payload && _ctlNoDiffCol(error)) { delete payload.diff_ok; delete payload.diff_reason; window._ctrl.diff.cst = false; ({ data, error } = await up(payload)); }
  if (error) throw error;
  const idx = window._ctrl.castel_expenses.findIndex(r => r.category_id === category_id && r.year === y && r.month === month);
  if (idx >= 0) window._ctrl.castel_expenses[idx] = data;
  else window._ctrl.castel_expenses.push(data);
  return data;
}

async function ctlDeleteIncome(unit_id, month) {
  const y = window._ctrl.year;
  const { error } = await _ctlSupa.from('ctrl_income_months').delete().eq('unit_id', unit_id).eq('year', y).eq('month', month);
  if (error) throw error;
  window._ctrl.income = window._ctrl.income.filter(r => !(r.unit_id === unit_id && r.year === y && r.month === month));
  if (window._src && window._src.incAll) window._src.incAll = window._src.incAll.filter(r => !(r.unit_id === unit_id && r.year === y && r.month === month));
  ctlDataChanged();                                                  // C5: the Tenant history balances follow
  if (typeof ctlSollDropUnit === 'function') ctlSollDropUnit(unit_id);   // x6
}

async function ctlDeleteCastel(category_id, month) {
  const y = window._ctrl.year;
  const { error } = await _ctlSupa.from('ctrl_expense_castel').delete().eq('category_id', category_id).eq('year', y).eq('month', month);
  if (error) throw error;
  window._ctrl.castel_expenses = window._ctrl.castel_expenses.filter(r => !(r.category_id === category_id && r.year === y && r.month === month));
}

/* New unit (e.g. a Casa Castel room like Berlin) — created on its first save */
async function ctlCreateUnit(fields) {
  const sort = Math.max(0, ...window._ctrl.units.filter(u => u.property_id === fields.property_id).map(u => Number(u.sort_order) || 0)) + 1;
  let { data, error } = await _ctlSupa.from('ctrl_units').insert({ sort_order: sort, ...fields }).select().single();
  // Old rows were imported with fixed ids, so the database's own counter can hand out an id
  // that is already taken (duplicate) — or the column has no counter at all (null).
  // Then retry once with the next free id.
  if (error && /duplicate key|23505|null value|23502/i.test(String((error.code || '') + ' ' + (error.message || '')))) {
    const { data: mx } = await _ctlSupa.from('ctrl_units').select('id').order('id', { ascending: false }).limit(1);
    const next = Math.max(0, ...(mx || []).map(r => Number(r.id) || 0), ...window._ctrl.units.map(u => Number(u.id) || 0)) + 1;
    ({ data, error } = await _ctlSupa.from('ctrl_units').insert({ id: next, sort_order: sort, ...fields }).select().single());
  }
  if (error) throw error;
  window._ctrl.units.push(data);
  return data;
}

/* Setup: remove a unit (nothing booked on it — Setup checks that first) */
async function ctlDeleteUnit(id) {
  const { error } = await _ctlSupa.from('ctrl_units').delete().eq('id', id);
  if (error) throw error;
  window._ctrl.units = window._ctrl.units.filter(x => x.id !== id);
}

/* Setup: update one row of ctrl_properties / ctrl_units / ctrl_castel_categories */
const _CTL_MEM = { ctrl_properties: 'properties', ctrl_units: 'units', ctrl_castel_categories: 'categories' };
async function ctlUpdateRow(table, id, fields) {
  const { data, error } = await _ctlSupa.from(table).update(fields).eq('id', id).select().single();
  if (error) throw error;
  if (!data) throw new Error('row ' + id + ' not found');   // never replace the row with nothing
  const list = window._ctrl[_CTL_MEM[table]] || [];
  const i = list.findIndex(r => r.id === id);
  if (i >= 0) list[i] = data;
  if (typeof ctlSollReset === 'function') ctlSollReset();
  return data;
}

/* New property (a new purchase): added at the end, so the list stays in purchase order.
   Old rows were imported with fixed ids → the counter can hand out a taken id: retry once with the next free one. */
async function ctlCreateProperty(name) {
  const fields = { name: String(name || '').trim(), active: true };
  let { data, error } = await _ctlSupa.from('ctrl_properties').insert(fields).select().single();
  if (error && /duplicate key|23505|null value|23502/i.test(String((error.code || '') + ' ' + (error.message || '')))) {
    const { data: mx } = await _ctlSupa.from('ctrl_properties').select('id').order('id', { ascending: false }).limit(1);
    const next = Math.max(0, ...(mx || []).map(r => Number(r.id) || 0), ...window._ctrl.properties.map(p => Number(p.id) || 0)) + 1;
    ({ data, error } = await _ctlSupa.from('ctrl_properties').insert({ id: next, ...fields }).select().single());
  }
  if (error) throw error;
  window._ctrl.properties.push(data);
  window._ctrl.properties.sort((a, b) => a.id - b.id);
  return data;
}

/* Kaufnebenkosten type (Makler · Notar · Grundbuch · Grunderwerbsteuer · Sonstiges) and part (Kauf · Grundschuld):
   if the columns are not there yet (SQL not run), the entry is saved without them */
const _ctlNoKnkCol = e => /knk_(type|part)/i.test(String((e && e.message) || ''));
const _ctlStripKnk = f => { const x = { ...f }; delete x.knk_type; delete x.knk_part; return x; };

/* One-time entry: in (+1) or out (−1), with type and optional link to a settlement */
async function ctlAddOneTime(o) {
  const payload = { property_id: o.property_id, invoice_date: o.invoice_date, item: o.item, amount: o.amount,
                    company: o.company ?? null, kind: o.kind || 'Rechnung', direction: o.direction === 1 ? 1 : -1,
                    source_ref: o.source_ref ?? null };
  if (o.nk_umlage !== undefined) payload.nk_umlage = !!o.nk_umlage;                 // Casa Castel: goes into the NK-Abrechnung
  if (o.nk_category_id !== undefined) payload.nk_category_id = o.nk_category_id;   // … as this Casa cost type (key + booking from Setup)
  if (o.knk_type !== undefined) payload.knk_type = o.knk_type;                     // Kaufnebenkosten: Makler, Notar, …
  if (o.knk_part !== undefined) payload.knk_part = o.knk_part;                     // … Notar / Grundbuch: Kauf or Grundschuld
  if (o.nk_from) payload.nk_from = o.nk_from;                                      // Casa Versorger-Jahresabrechnung: its own Abrechnungsjahr
  if (o.nk_to) payload.nk_to = o.nk_to;
  const ins = pl => _ctlSupa.from('ctrl_expense_one_time').insert(pl).select().single();
  let { data, error } = await ins(payload);
  if (error && /nk_from|nk_to/.test(String(error.message || ''))) { delete payload.nk_from; delete payload.nk_to; ({ data, error } = await ins(payload)); }
  if (error && _ctlNoKnkCol(error)) ({ data, error } = await ins(_ctlStripKnk(payload)));
  if (error) throw error;
  window._ctrl.one_time.push(data);
  return data;
}

/* Edit a one-time entry (One-off edit form · Abrechnungen amount) */
async function ctlUpdateOneTime(id, fields) {
  const upd = f => _ctlSupa.from('ctrl_expense_one_time').update(f).eq('id', id).select().single();
  let { data, error } = await upd(fields);
  if (error && _ctlNoKnkCol(error)) ({ data, error } = await upd(_ctlStripKnk(fields)));
  if (error) throw error;
  if (!data) throw new Error('entry ' + id + ' not found');
  const i = window._ctrl.one_time.findIndex(r => r.id === id);
  if (i >= 0) window._ctrl.one_time[i] = data;
  return data;
}

async function ctlDeleteOneTime(id) {
  const { error } = await _ctlSupa.from('ctrl_expense_one_time').delete().eq('id', id);
  if (error) throw error;
  window._ctrl.one_time = window._ctrl.one_time.filter(r => r.id !== id);
}


/* ── C5 (Nov 2026, #31) · saves on their way ───────────────────────────────────
   Every save of Controlling's own data counts here while it runs (_ctlBusy) and when it starts and ends
   (_ctlWriteSeq). The reload when the app comes back takes the year's rows over only if no save ran meanwhile —
   rows read before a save never hide it (and 'Book all' never books it again). Each save also tells the
   Tenant history that the data changed (ctlDataChanged).
   rows = a save of month rows only (Income / Expenses entries and marks: take, 'Book all', Undo …): the read of the
   other apps' data (ctlSollLoad) contains none of them and is not read again for it — only the income of every year
   keeps your rows (C5 review: taps one after another threw every read away and the old rent stayed). Every other save
   also counts in _ctlSrcBusy / _ctlSrcSeq. ctlIdle(max, src) → once no save (src: of that kind) has run for CTL_QUIET
   ms — 'Book all' saves line after line — at most max ms (default 90 s; a phone gives a request up after ~60 s). */
window._ctlBusy = 0; window._ctlWriteSeq = 0; window._ctlSrcBusy = 0; window._ctlSrcSeq = 0;
const CTL_QUIET = 800;
let _ctlIdleW = [], _ctlLastEnd = 0, _ctlSrcLastEnd = 0;
function ctlIdle(max, src) {
  const end = Date.now() + (max || 90000);
  return new Promise(done => {
    let t = 0;
    const go = () => {
      clearTimeout(t);
      const now = Date.now(), q = (src ? _ctlSrcLastEnd : _ctlLastEnd) + CTL_QUIET - now;
      if (now >= end) return done();
      if ((src ? window._ctlSrcBusy : window._ctlBusy) > 0) { _ctlIdleW.push(go); t = setTimeout(go, end - now); return; }
      if (q > 0) { t = setTimeout(go, Math.min(q, end - now)); return; }
      done();
    };
    go();
  });
}
function ctlWriting(fn, rows) {
  if (typeof fn !== 'function' || fn._ctlWrite) return fn;
  const w = async function () {
    window._ctlBusy++; window._ctlWriteSeq++;
    if (!rows) { window._ctlSrcBusy++; window._ctlSrcSeq++; }
    try { return await fn.apply(this, arguments); }
    finally {
      window._ctlBusy--; window._ctlWriteSeq++; _ctlLastEnd = Date.now();
      if (!rows) { window._ctlSrcBusy--; window._ctlSrcSeq++; _ctlSrcLastEnd = _ctlLastEnd; }
      ctlDataChanged();
      if (_ctlIdleW.length) { const w0 = _ctlIdleW; _ctlIdleW = []; w0.forEach(f => f()); }   // each one looks again
    }
  };
  w._ctlWrite = true;
  return w;
}
ctlUpsertIncome = ctlWriting(ctlUpsertIncome, 1);   ctlUpsertApt = ctlWriting(ctlUpsertApt, 1);       ctlUpsertCastel = ctlWriting(ctlUpsertCastel, 1);
ctlDeleteIncome = ctlWriting(ctlDeleteIncome, 1);   ctlDeleteCastel = ctlWriting(ctlDeleteCastel, 1);
ctlSetIncomeMark = ctlWriting(ctlSetIncomeMark, 1); ctlSetCastelMark = ctlWriting(ctlSetCastelMark, 1); ctlSetAptMark = ctlWriting(ctlSetAptMark, 1);
ctlAddOneTime = ctlWriting(ctlAddOneTime);       ctlUpdateOneTime = ctlWriting(ctlUpdateOneTime); ctlDeleteOneTime = ctlWriting(ctlDeleteOneTime);
ctlCreateUnit = ctlWriting(ctlCreateUnit);       ctlDeleteUnit = ctlWriting(ctlDeleteUnit);     ctlCreateProperty = ctlWriting(ctlCreateProperty);
ctlUpdateRow = ctlWriting(ctlUpdateRow);

/* ── Setup history ──────────────────────────────────────────── */
async function ctlLogHistory(entity_type, entity_id, field, oldV, newV) {
  const a = oldV === null || oldV === undefined ? null : Number(oldV);
  const b = newV === null || newV === undefined ? null : Number(newV);
  if (a === b) return;
  try {
    await _ctlSupa.from('ctrl_setup_history').insert({ entity_type, entity_id, field, old_value: a, new_value: b });
  } catch (e) { console.warn('[controlling] history log failed', e); }
}

/* ── Format helpers ─────────────────────────────────────────── */
const ctlEur = v => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u202f€';
const ctlEur0 = v => ctlEur(v);   // always with cents: 1.200,00 €
/* Signed variant for cashflow: +170,00 €, −340,00 €, 0,00 € */
/* Month cards only: whole euros ("1.139 €") so 6 cards always fit the width.
   Everywhere else amounts keep their cents (ctlEur / ctlEur0). */
const ctlEurWhole = v => Math.round(Number(v) || 0).toLocaleString('de-DE') + '\u202f€';
/* Every month amount fits its card: if it is wider than the card, the font
   steps down (to min. 8.5 px). Runs whenever month cards are drawn or the
   screen width changes — one place for Dashboard, Einnahmen and Ausgaben. */
function ctlFitMonthVals(root) {
  (root || document).querySelectorAll('.ct-month__val').forEach(el => {
    el.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(el).fontSize) || 12;
    while (el.scrollWidth > el.clientWidth + 0.5 && fs > 8.5) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
  });
}
(function () {
  if (typeof document === 'undefined') return;
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => ctlFitMonthVals(document), 0); };
  const start = () => {
    new MutationObserver(ms => { if (ms.some(m => m.target.closest && m.target.closest('.ct-months'))) later(); })
      .observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', later);
    later();
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

const ctlEur0Signed = v => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  const s = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u202f€';
  if (n > 0) return '+\u202f' + s;
  if (n < 0) return '\u2212\u202f' + s;   // real minus sign
  return s;
};
const ctlMonthName = m => ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][m-1];
