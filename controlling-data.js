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
  one_time: [], recon: []
};

async function ctlLoadAll(year) {
  const y = year || window._ctrl.year;
  window._ctrl.year = y;

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
  for (const k in rows) {
    if (rows[k].error) { console.error('[controlling] load', k, rows[k].error); throw rows[k].error; }
    window._ctrl[k] = rows[k].data || [];
  }
}

/* ── Lookup helpers ─────────────────────────────────────────── */
function ctlProp(pid)   { return window._ctrl.properties.find(p => p.id === pid); }
function ctlUnit(uid)   { return window._ctrl.units.find(u => u.id === uid); }
function ctlCat(cid)    { return window._ctrl.categories.find(c => c.id === cid); }
function ctlUnitsOf(pid){ return window._ctrl.units.filter(u => u.property_id === pid); }

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

  // One-time expenses returned SEPARATELY. Dashboard toggle decides
  // whether to include them in the totals shown to the user.
  let oneTime = 0;
  for (const ot of window._ctrl.one_time) {
    if (ot.property_id !== pid) continue;
    const d = ctlParseDate(ot.invoice_date);
    if (d.year !== y || d.month !== month) continue;
    oneTime += Number(ot.amount || 0);
  }

  const expNet = expTotal - expPassthru;
  return {
    kalt, neben, warm: kalt + neben,
    exp_total: expTotal, exp_passthru: expPassthru, exp_net: expNet,
    one_time: oneTime,
    gesamt:     (kalt + neben) - expTotal,   // recurring only
    netto_kalt: kalt - expNet,               // recurring only
  };
}

/* ── Portfolio + annual rollups ─────────────────────────────── */
function ctlPortfolioMonth(month) {
  const acc = { kalt:0, neben:0, warm:0, exp_total:0, exp_passthru:0, exp_net:0, one_time:0, gesamt:0, netto_kalt:0 };
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const m = ctlPropertyMonth(p.id, month);
    for (const k of Object.keys(m)) {
      acc[k] = (Number(acc[k]) || 0) + (Number(m[k]) || 0);
    }
  }
  return acc;
}
function ctlPortfolioYear() {
  const acc = { kalt:0, neben:0, warm:0, exp_total:0, exp_passthru:0, exp_net:0, one_time:0, gesamt:0, netto_kalt:0, recon:0 };
  for (let m = 1; m <= 12; m++) {
    const p = ctlPortfolioMonth(m);
    for (const k of Object.keys(p)) {
      acc[k] = (Number(acc[k]) || 0) + (Number(p[k]) || 0);
    }
  }
  for (const r of window._ctrl.recon) acc.recon += Number(r.hausgeld_ausgleich || 0) + Number(r.nebenkosten_ausgleich || 0);
  acc.gesamt     += acc.recon;
  acc.netto_kalt += acc.recon;
  return acc;
}

function ctlMonthStatus(month) {
  const y  = window._ctrl.year;
  const cy = new Date().getFullYear();
  const cm = new Date().getMonth() + 1;
  // Future is strictly calendar-based — prefilled forecast rows don't count.
  if (y > cy || (y === cy && month > cm)) return 'future';
  return window._ctrl.income.some(r => r.year === y && r.month === month) ? 'done' : 'pending';
}

/* ── Writes (upsert) ────────────────────────────────────────── */
async function ctlUpsertIncome(unit_id, month, kaltmiete, nebenkosten) {
  const y = window._ctrl.year;
  const payload = { unit_id, year: y, month, kaltmiete, nebenkosten };
  const { data, error } = await _ctlSupa.from('ctrl_income_months')
    .upsert(payload, { onConflict: 'unit_id,year,month' }).select().single();
  if (error) throw error;
  const idx = window._ctrl.income.findIndex(r => r.unit_id === unit_id && r.year === y && r.month === month);
  if (idx >= 0) window._ctrl.income[idx] = data;
  else window._ctrl.income.push(data);
  return data;
}

async function ctlUpsertApt(property_id, month, fields) {
  const y = window._ctrl.year;
  const payload = { property_id, year: y, month, ...fields };
  const { data, error } = await _ctlSupa.from('ctrl_expense_apartments')
    .upsert(payload, { onConflict: 'property_id,year,month' }).select().single();
  if (error) throw error;
  const idx = window._ctrl.apt_expenses.findIndex(r => r.property_id === property_id && r.year === y && r.month === month);
  if (idx >= 0) window._ctrl.apt_expenses[idx] = data;
  else window._ctrl.apt_expenses.push(data);
  return data;
}

async function ctlUpsertCastel(category_id, month, amount) {
  const y = window._ctrl.year;
  const payload = { category_id, year: y, month, amount };
  const { data, error } = await _ctlSupa.from('ctrl_expense_castel')
    .upsert(payload, { onConflict: 'category_id,year,month' }).select().single();
  if (error) throw error;
  const idx = window._ctrl.castel_expenses.findIndex(r => r.category_id === category_id && r.year === y && r.month === month);
  if (idx >= 0) window._ctrl.castel_expenses[idx] = data;
  else window._ctrl.castel_expenses.push(data);
  return data;
}

async function ctlInsertOneTime(property_id, invoice_date, item, amount, company) {
  const { data, error } = await _ctlSupa.from('ctrl_expense_one_time')
    .insert({ property_id, invoice_date, item, amount, company: company ?? null }).select().single();
  if (error) throw error;
  window._ctrl.one_time.push(data);
  return data;
}

async function ctlDeleteOneTime(id) {
  const { error } = await _ctlSupa.from('ctrl_expense_one_time').delete().eq('id', id);
  if (error) throw error;
  window._ctrl.one_time = window._ctrl.one_time.filter(r => r.id !== id);
}


/* ── Setup history ──────────────────────────────────────────── */
async function ctlLogHistory(entity_type, entity_id, field, oldV, newV) {
  const a = oldV === null || oldV === undefined ? null : Number(oldV);
  const b = newV === null || newV === undefined ? null : Number(newV);
  if (a === b) return;
  try {
    await _ctlSupa.from('ctrl_setup_history').insert({ entity_type, entity_id, field, old_value: a, new_value: b });
  } catch (e) { console.warn('[controlling] history log failed', e); }
}
async function ctlFetchHistory(limit) {
  const { data, error } = await _ctlSupa.from('ctrl_setup_history')
    .select('*').order('changed_at', { ascending: false }).limit(limit || 100);
  if (error) throw error;
  return data || [];
}

async function ctlUpdateUnitDefaults(unit_id, def_kaltmiete, def_nebenkosten) {
  const prev = ctlUnit(unit_id);
  const { data, error } = await _ctlSupa.from('ctrl_units')
    .update({ def_kaltmiete, def_nebenkosten }).eq('id', unit_id).select().single();
  if (error) throw error;
  if (prev) {
    ctlLogHistory('unit', unit_id, 'def_kaltmiete',   prev.def_kaltmiete,   def_kaltmiete);
    ctlLogHistory('unit', unit_id, 'def_nebenkosten', prev.def_nebenkosten, def_nebenkosten);
  }
  const idx = window._ctrl.units.findIndex(u => u.id === unit_id);
  if (idx >= 0) window._ctrl.units[idx] = data;
  return data;
}

async function ctlUpdatePropertyDefaults(pid, fields) {
  const prev = ctlProp(pid);
  const { data, error } = await _ctlSupa.from('ctrl_properties')
    .update(fields).eq('id', pid).select().single();
  if (error) throw error;
  if (prev) for (const k of Object.keys(fields)) ctlLogHistory('property', pid, k, prev[k], fields[k]);
  const idx = window._ctrl.properties.findIndex(p => p.id === pid);
  if (idx >= 0) window._ctrl.properties[idx] = data;
  return data;
}

async function ctlUpdateCategoryDefault(cat_id, default_amount) {
  const prev = ctlCat(cat_id);
  const { data, error } = await _ctlSupa.from('ctrl_castel_categories')
    .update({ default_amount }).eq('id', cat_id).select().single();
  if (error) throw error;
  if (prev) ctlLogHistory('category', cat_id, 'default_amount', prev.default_amount, default_amount);
  const idx = window._ctrl.categories.findIndex(c => c.id === cat_id);
  if (idx >= 0) window._ctrl.categories[idx] = data;
  return data;
}

/* ── Format helpers ─────────────────────────────────────────── */
const ctlEur = v => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u202f€';
const ctlEur0 = v => Math.round(Number(v) || 0).toLocaleString('de-DE') + '\u202f€';
/* Signed variant for cashflow: +170 €, −340 €, 0 € */
const ctlEur0Signed = v => {
  const n = Math.round(Number(v) || 0);
  const s = Math.abs(n).toLocaleString('de-DE') + '\u202f€';
  if (n > 0) return '+\u202f' + s;
  if (n < 0) return '\u2212\u202f' + s;   // real minus sign
  return s;
};
const ctlMonthName = m => ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][m-1];
