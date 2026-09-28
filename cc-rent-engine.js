/* ─────────────────────────────────────────────────────────────
   RENT ENGINE — shared by Casa Castel (landlord.html), Rentals
   (rentals-index.html) and Controlling (controlling.html)
   cc-rent-engine.js

   Rent history lives in the table rent_periods: one row per rent that
   applies from a date on (contract, renewal, manual change, taken over
   from the tenant record). A tenancy (tenant_records / rnt_tenant_records)
   keeps Einzug (mietbeginn) and Auszug (mietende).

     Rent on day d = the tenancy active on d (Einzug ≤ d ≤ Auszug),
                     then its latest period with valid_from ≤ d.
                     No period → the rent stored on the tenant.
     Pauschal      = one all-in amount (period.mode = 'pauschal').

   Rules
     · Nothing is ever guessed: a tenant without a rent stays empty.
     · A period is never overwritten by a later rent: a new rent is a new row.
     · Missing table (SQL not run yet) never breaks anything: the apps
       fall back to the rent stored on the tenant.
   ───────────────────────────────────────────────────────────── */

'use strict';

window.CC_RENT_ENGINE = window.CC_RENT_ENGINE || 'v2';   // 'v1' = Controlling uses the old logic

/* ── Dates ── */
function ccRpIso(v) {
  if (!v) return '';
  if (typeof ccParseDate === 'function') { const r = ccParseDate(v); if (r) return r; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  return '';
}
function ccRpToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function ccRpAddDays(iso, n) {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function ccRpFmt(iso) { const s = ccRpIso(iso); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
const ccRpNum = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

/* ── Store ── */
const CC_RP = { rows: [], loaded: {}, missing: false };

function ccRpIsMissing(err) {
  const msg = String((err && (err.message || err.details || err.hint)) || err || '');
  return /rent_periods/.test(msg) && /(does not exist|not find|schema cache|relation)/i.test(msg);
}
function ccRpIsMissingColumn(err, col) {
  const msg = String((err && (err.message || err.details)) || err || '');
  return msg.includes(col) && /(column|schema cache|does not exist|not find)/i.test(msg);
}

/* Load all periods of one app ('casa' | 'rentals') or all ('*'). Never throws. */
async function ccRpLoad(db, app) {
  if (!db) return [];
  try {
    let q = db.from('rent_periods').select('*');
    if (app && app !== '*') q = q.eq('app', app);
    const { data, error } = await q;
    if (error) throw error;
    CC_RP.rows = CC_RP.rows.filter(r => app !== '*' && r.app !== app).concat(data || []);
    CC_RP.loaded[app || '*'] = true;
    CC_RP.missing = false;
    return data || [];
  } catch (e) {
    if (ccRpIsMissing(e)) CC_RP.missing = true;
    else console.warn('[rent periods] load:', e && e.message || e);
    CC_RP.loaded[app || '*'] = true;
    return [];
  }
}
function ccRpSetRows(rows) { CC_RP.rows = rows || []; CC_RP.loaded['*'] = true; }

/* Periods of one tenancy, oldest first */
function ccRpFor(app, tenantId) {
  const id = String(tenantId);
  return CC_RP.rows.filter(r => r.app === app && String(r.tenant_id) === id)
    .sort((a, b) => ccRpIso(a.valid_from).localeCompare(ccRpIso(b.valid_from)));
}
/* Period in effect on iso (latest valid_from ≤ iso) */
function ccRpAt(periods, iso) {
  let best = null;
  for (const p of periods || []) { const d = ccRpIso(p.valid_from); if (d && d <= iso && (!best || d >= ccRpIso(best.valid_from))) best = p; }
  return best;
}
/* One period → amounts. Pauschal: one amount, booked as Kalt (no NK part). */
function ccRpAmount(p) {
  if (!p) return null;
  if (p.mode === 'pauschal') {
    const t = ccRpNum(p.pauschale) ?? ((ccRpNum(p.kaltmiete) ?? 0) + (ccRpNum(p.nebenkosten) ?? 0));
    return { mode: 'pauschal', kalt: t, nk: 0, total: t };
  }
  const k = ccRpNum(p.kaltmiete) ?? 0, nk = ccRpNum(p.nebenkosten) ?? 0;
  return { mode: 'kalt_nk', kalt: k, nk, total: k + nk };
}

/* ── Change log (G7) — never blocks a save ── */
async function ccRpLog(db, app, tenantId, validFrom, field, oldV, newV) {
  if (!db) return;
  const a = ccRpNum(oldV), b = ccRpNum(newV);
  if (a === b) return;
  try {
    await db.from('ctrl_setup_history').insert({ entity_type: 'rent_period', entity_id: null,
      field: app + ':' + tenantId + ':' + ccRpIso(validFrom) + ':' + field, old_value: a, new_value: b });
  } catch (e) { /* log only */ }
}

/* ── Writes ── */
async function ccRpInsert(db, row) {
  const { data, error } = await db.from('rent_periods').insert(row).select().single();
  if (error) throw error;
  CC_RP.rows.push(data);
  ccRpLog(db, row.app, row.tenant_id, row.valid_from, 'neu', null, (ccRpAmount(data) || {}).total);
  return data;
}
async function ccRpUpdate(db, id, fields) {
  const cur = CC_RP.rows.find(r => r.id === id);
  const before = cur ? (ccRpAmount(cur) || {}).total : null;
  const { data, error } = await db.from('rent_periods').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  const i = CC_RP.rows.findIndex(r => r.id === id);
  if (i >= 0) CC_RP.rows[i] = data; else CC_RP.rows.push(data);
  ccRpLog(db, data.app, data.tenant_id, data.valid_from, 'betrag', before, (ccRpAmount(data) || {}).total);
  return data;
}
async function ccRpDelete(db, id) {
  const cur = CC_RP.rows.find(r => r.id === id);
  const { error } = await db.from('rent_periods').delete().eq('id', id);
  if (error) throw error;
  CC_RP.rows = CC_RP.rows.filter(r => r.id !== id);
  if (cur) ccRpLog(db, cur.app, cur.tenant_id, cur.valid_from, 'geloescht', (ccRpAmount(cur) || {}).total, null);
}

/* Set a rent for a tenancy from a date on.
   o = { app, rec, validFrom, mode, kalt, nk, pauschale, kind, source,
         legacyMode, first_month, last_month, contract_type, contract_end, note }
   · The first time a tenancy gets a period, the rent stored on the tenant is
     kept as the period from Einzug ('migrated'), so history never jumps.
   · Same valid_from as an existing period → that period is updated.        */
async function ccRpSetRent(db, o) {
  if (!db || !o || !o.rec || !o.rec.id) return null;
  const app = o.app, rec = o.rec, from = ccRpIso(o.validFrom);
  if (!from) return null;
  const einzug = ccRpIso(rec.mietbeginn);
  let periods = ccRpFor(app, rec.id);
  if (!periods.length && einzug && from > einzug && (ccRpNum(rec.kaltmiete) !== null || ccRpNum(rec.nebenkosten) !== null)) {
    const lm = o.legacyMode || 'kalt_nk';
    await ccRpInsert(db, {
      app, tenant_id: String(rec.id), valid_from: einzug, kind: 'migrated', mode: lm,
      pauschale: lm === 'pauschal' ? (ccRpNum(rec.kaltmiete) ?? 0) + (ccRpNum(rec.nebenkosten) ?? 0) : null,
      kaltmiete: lm === 'pauschal' ? null : ccRpNum(rec.kaltmiete), nebenkosten: lm === 'pauschal' ? null : ccRpNum(rec.nebenkosten),
      contract_type: rec.contract_type || null, source: 'migration', note: 'Miete vom Mieter übernommen',
    });
    periods = ccRpFor(app, rec.id);
  }
  const mode = o.mode === 'pauschal' ? 'pauschal' : 'kalt_nk';
  const row = {
    app, tenant_id: String(rec.id), valid_from: from, kind: o.kind || 'manual', mode,
    pauschale: mode === 'pauschal' ? ccRpNum(o.pauschale ?? o.kalt) : null,
    kaltmiete: mode === 'pauschal' ? null : ccRpNum(o.kalt), nebenkosten: mode === 'pauschal' ? null : ccRpNum(o.nk),
    source: o.source || 'tenant_form',
  };
  ['first_month', 'last_month', 'contract_type', 'note'].forEach(k => { if (o[k] !== undefined) row[k] = o[k]; });
  if (o.contract_end !== undefined) row.contract_end = ccRpIso(o.contract_end) || null;
  const same = periods.find(p => ccRpIso(p.valid_from) === from);
  return same ? ccRpUpdate(db, same.id, row) : ccRpInsert(db, row);
}

/* Contract generator → rent history (B7, 5.5). Only when the contract's tenant
   name matches exactly one tenancy of that unit; otherwise nothing is written.
   o = { app, db, records, unitKey, unitRef, tenantName, start, end, mode,
         kalt, nk, total, first_month, last_month, contract_type }         */
async function ccRpFromContract(o) {
  try {
    if (!o || !o.db || !o.start || CC_RP.missing) return null;
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const want = norm(o.tenantName);
    if (!want) return null;
    const recs = (o.records || []).filter(r => String(r[o.unitKey]) === String(o.unitRef)
      && norm([r.first_name, r.last_name].filter(Boolean).join(' ')) === want);
    if (recs.length !== 1) {
      if (typeof ccToast === 'function') ccToast(recs.length ? 'Mehrere Mieter mit diesem Namen – Miete nicht in die Historie übernommen' : 'Mieter noch nicht angelegt – Miete nicht in die Historie übernommen');
      return null;
    }
    if (!CC_RP.loaded[o.app] && !CC_RP.loaded['*']) await ccRpLoad(o.db, o.app);
    const rec = recs[0], start = ccRpIso(o.start), einzug = ccRpIso(rec.mietbeginn);
    const mode = o.mode === 'pauschal' ? 'pauschal' : 'kalt_nk';
    // Only a real, final contract belongs in the history — a draft or test PDF does not (fix 3)
    const steps = (o.staffel || []).map(x => ({ date: ccRpIso(x.datum || x.date), amount: ccRpNum(x.betrag ?? x.amount) })).filter(x => x.date && x.amount);
    const nm = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
    const kind = einzug && start > einzug ? 'renewal' : 'contract';
    // Casa Castel: the final contract also sets the tenancy's contract type (shown in the question)
    const ctLbl = o.app === 'casa' ? ({ mietvertrag: 'Mietvertrag', kurzzeit: 'Kurzzeit' })[o.contract_type] || '' : '';
    const q = 'Miete ab ' + ccRpFmt(start) + (ctLbl ? ' (' + ctLbl + ')' : '') + (steps.length ? ' und ' + steps.length + (steps.length === 1 ? ' Staffelstufe' : ' Staffelstufen') : '') +
              ' für ' + nm + ' in die Miethistorie übernehmen?\n\nNur bei einem endgültigen Vertrag – bei einem Entwurf „Abbrechen“.';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(q)) return null;
    const saved = await ccRpSetRent(o.db, {
      app: o.app, rec, validFrom: start, mode, kalt: o.kalt, nk: o.nk, pauschale: o.total,
      kind, source: 'generator', legacyMode: o.legacyMode,
      first_month: o.first_month || 'anteilig', last_month: o.last_month || 'anteilig',
      contract_type: o.contract_type || null, contract_end: o.end || null,
    });
    // Casa Castel: the move-in contract fixes the tenancy's own type (a renewal switches it
    // from its start date through the history entry saved above)
    if (saved && o.app === 'casa' && kind === 'contract' && ctLbl && rec.contract_type !== o.contract_type) {
      const { error: ctErr } = await o.db.from('tenant_records').update({ contract_type: o.contract_type }).eq('id', rec.id);
      if (!ctErr) rec.contract_type = o.contract_type;
      else console.warn('[rent periods] contract type:', ctErr.message);
    }
    // Staffel steps of the contract → this tenant's Staffel history (fix 1)
    if (saved && steps.length && o.staffelTable) {
      for (const st of steps) {
        const { data: ex } = await o.db.from(o.staffelTable).select('*').eq(o.unitKey, o.unitRef).eq('effective_date', st.date);
        if (ex && ex.length) {
          let r = await o.db.from(o.staffelTable).update({ amount: st.amount, tenant_id: String(rec.id) }).eq('id', ex[0].id);
          if (r.error && ccRpIsMissingColumn(r.error, 'tenant_id')) await o.db.from(o.staffelTable).update({ amount: st.amount }).eq('id', ex[0].id);
        } else {
          await ccRpInsertWithTenant(o.db, o.staffelTable, { [o.unitKey]: o.unitRef, effective_date: st.date, amount: st.amount, tenant_adjusted: false }, rec.id);
        }
      }
    }
    if (saved && typeof ccToast === 'function') ccToast('Miete ab ' + ccRpFmt(start) + (steps.length ? ' + ' + steps.length + ' Staffel' : '') + ' in die Miethistorie übernommen');
    return saved;
  } catch (e) {
    if (!ccRpIsMissing(e)) console.warn('[rent periods] contract:', e && e.message || e);
    return null;
  }
}

/* History tables (Staffel, NK-Vorauszahlung): insert with the tenant link (B6).
   If the column doesn't exist yet (SQL not run), insert without it.          */
async function ccRpInsertWithTenant(db, table, row, tenantId) {
  const q = r => db.from(table).insert(r).select().single();
  if (tenantId == null) return q(row);
  const res = await q({ ...row, tenant_id: String(tenantId) });
  if (res.error && ccRpIsMissingColumn(res.error, 'tenant_id')) return q(row);
  return res;
}

/* ── Einzug lock (B1) ───────────────────────────────────────
   A move-in date older than a month is locked in every tenant form.
   Tapping it asks first; a renewal or rent change uses "Miete ändern". */
(function () {
  if (typeof document === 'undefined') return;
  const SEL = 'input[data-f="mietbeginn"], input[data-mf="mietbeginn"]';
  const lock = el => {
    if (el._ccEinzug) return;
    const iso = ccRpIso(el.value);
    if (!iso || iso > ccRpAddDays(ccRpToday(), -31)) return;
    el._ccEinzug = true;
    el.readOnly = true;
    el.classList.add('cc-einzug-lock');
    el.title = 'Einzug – zum Ändern antippen';
  };
  const scan = root => {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) lock(root);
    if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(lock);
  };
  document.addEventListener('click', e => {
    const el = e.target;
    if (!el || !el._ccEinzug || !el.readOnly) return;
    e.preventDefault(); e.stopPropagation();
    const ok = window.confirm('Einzug wirklich ändern?\n\nDas Einzugsdatum verschiebt die ganze Miethistorie. ' +
      'Für eine Verlängerung oder eine neue Miete bitte bei der Miete „Gilt ab" eintragen.');
    if (!ok) return;
    el.readOnly = false;
    el.classList.remove('cc-einzug-lock');
    if (typeof window.ccOpenCalendar === 'function') window.ccOpenCalendar(el);
    else el.focus();
  }, true);
  const start = () => {
    scan(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
    const st = document.createElement('style');
    st.textContent = 'input.cc-einzug-lock{opacity:.75;}';
    document.head.appendChild(st);
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
