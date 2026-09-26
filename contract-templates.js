/* ─────────────────────────────────────────────────────────────
   CONTRACT TEMPLATES (Req 3)
   contract-templates.js   (loaded by landlord.html and rentals-index.html)

   Save a finished contract as a template and renew it later.
   - Scope: Rooms (Kurzzeit, Mietvertrag) · Apartments (Kurzzeit, Mietvertrag, Gewerbe)
   - Saved only when you tap "Save as template" in the generator
   - One template per unit and contract type (saving again replaces it)
   - Renew: same tenant, terms, Staffel amounts and Kaution as saved;
            start / end / signing dates cleared; Staffel dates follow the new start
   - Stored in Supabase table contract_templates (landlord only)

   Each tab registers an adapter with ccTplRegister(kind, {...}):
     snapshot(body)              → object with every generator field
     renew(type, unitId, snap)   → opens the generator and refills it
     body() / currentTenant(id)  → generator body element / Tenants-tab profile
     prefix(type, unitId)        → field id prefix ('cm-', 'apt-mv-', …)
     openType(type)              → generator type to open ('gewerbe' → 'mietvertrag')
   ───────────────────────────────────────────────────────────── */

const CC_TPL_SCOPE = { room: ['kurzzeit', 'mietvertrag'], apartment: ['kurzzeit', 'mietvertrag', 'gewerbe'] };
const CC_TPL_LABEL = { kurzzeit: 'Kurzzeitmiete', mietvertrag: 'Mietvertrag', gewerbe: 'Gewerbemietvertrag' };
const _ccTplAdapters = {};
let   _ccTplCache    = null;      // key → { unit_kind, unit_id, contract_type, meta, saved_at }
let   _ccTplLoading  = null;

function ccTplRegister(kind, adapter) { _ccTplAdapters[kind] = adapter; }
function ccTplInScope(kind, type) { return !!(CC_TPL_SCOPE[kind] && CC_TPL_SCOPE[kind].includes(type)); }
function _ccTplKey(kind, id, type) { return kind + '|' + String(id) + '|' + type; }
function _ccTplDb() { return (typeof sbL !== 'undefined' && sbL) ? sbL : null; }
function _ccTplEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _ccTplFmtDate(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v);
}
function _ccTplErrText(error) {
  const msg = (error && (error.message || String(error))) || 'Unknown error';
  if (/contract_templates/.test(msg) && /(does not exist|not find|schema cache)/i.test(msg))
    return 'Template table missing — run the Req 3 SQL in Supabase first.';
  return msg;
}

/* ── DATA ─────────────────────────────────────────────────── */
async function ccTplLoadAll(force = false) {
  if (_ccTplCache && !force) return _ccTplCache;
  if (_ccTplLoading) return _ccTplLoading;
  const db = _ccTplDb();
  if (!db) return (_ccTplCache = {});
  _ccTplLoading = db.from('contract_templates')
    .select('unit_kind,unit_id,contract_type,meta,saved_at')
    .then(({ data, error }) => {
      if (error) { console.warn('[templates] load:', _ccTplErrText(error)); _ccTplCache = {}; return _ccTplCache; }
      const c = {};
      (data || []).forEach(r => { c[_ccTplKey(r.unit_kind, r.unit_id, r.contract_type)] = r; });
      _ccTplCache = c;
      return c;
    })
    .catch(e => { console.warn('[templates] load:', e); _ccTplCache = {}; return _ccTplCache; })
    .finally(() => { _ccTplLoading = null; });
  return _ccTplLoading;
}
function ccTplGet(kind, id, type) { return _ccTplCache ? (_ccTplCache[_ccTplKey(kind, id, type)] || null) : null; }

async function ccTplFetchFields(kind, id, type) {
  const db = _ccTplDb(); if (!db) throw new Error('No database connection.');
  const { data, error } = await db.from('contract_templates').select('fields,meta,saved_at')
    .eq('unit_kind', kind).eq('unit_id', String(id)).eq('contract_type', type).maybeSingle();
  if (error) throw new Error(_ccTplErrText(error));
  return data;
}

async function ccTplSave(kind, id, type, fields, meta) {
  const db = _ccTplDb(); if (!db) throw new Error('No database connection.');
  const row = { unit_kind: kind, unit_id: String(id), contract_type: type, fields, meta, saved_at: new Date().toISOString() };
  const { error } = await db.from('contract_templates').upsert(row, { onConflict: 'unit_kind,unit_id,contract_type' });
  if (error) throw new Error(_ccTplErrText(error));
  if (!_ccTplCache) _ccTplCache = {};
  _ccTplCache[_ccTplKey(kind, id, type)] = { unit_kind: kind, unit_id: String(id), contract_type: type, meta, saved_at: row.saved_at };
  ccTplRefreshCardLines(true);
}

async function ccTplDelete(kind, id, type) {
  const db = _ccTplDb(); if (!db) throw new Error('No database connection.');
  const { error } = await db.from('contract_templates').delete()
    .eq('unit_kind', kind).eq('unit_id', String(id)).eq('contract_type', type);
  if (error) throw new Error(_ccTplErrText(error));
  if (_ccTplCache) delete _ccTplCache[_ccTplKey(kind, id, type)];
  ccTplRefreshCardLines(true);
}

/* A room / apartment was deleted → its templates go with it (silent, best effort) */
function ccTplDeleteUnit(kind, id) {
  const db = _ccTplDb(); if (!db) return;
  db.from('contract_templates').delete().eq('unit_kind', kind).eq('unit_id', String(id))
    .then(({ error }) => { if (error) console.warn('[templates] unit cleanup:', error.message); });
  if (_ccTplCache) Object.keys(_ccTplCache).forEach(k => { if (k.indexOf(kind + '|' + String(id) + '|') === 0) delete _ccTplCache[k]; });
}

/* ── CARD LINE: "Template · Anna Muster · 01.11.2026   Renew · Delete" ── */
/* The card leaves an empty slot; it is filled from the loaded templates. */
function ccTplSlot(kind, id, type) {
  if (!ccTplInScope(kind, type)) return '';
  return `<div class="cc-tpl-line" data-cc-tpl="${_ccTplEsc(_ccTplKey(kind, id, type))}"></div>`;
}
function _ccTplLineHTML(kind, id, type, t) {
  const meta  = t.meta || {};
  const bits  = ['Template', meta.tenant, meta.start ? 'from ' + _ccTplFmtDate(meta.start) : 'saved ' + _ccTplFmtDate((t.saved_at || '').slice(0, 10))]
    .filter(Boolean).map(_ccTplEsc).join(' · ');
  const a = `'${kind}','${_ccTplEsc(String(id))}','${type}'`;
  return `<i class="ti ti-bookmark"></i><span class="cc-tpl-line__txt">${bits}</span>
    <button type="button" class="cc-tpl-link" onclick="event.stopPropagation();ccTplRenew(${a})">Renew</button>
    <button type="button" class="cc-tpl-link cc-tpl-link--del" onclick="event.stopPropagation();ccTplAskDelete(this,${a})">Delete</button>`;
}
function _ccTplFillSlot(el) {
  const [kind, id, type] = (el.dataset.ccTpl || '').split('|');
  const t = ccTplGet(kind, id, type);
  el.dataset.ccTplFilled = '1';
  el.innerHTML = t ? _ccTplLineHTML(kind, id, type, t) : '';
}
function ccTplRefreshCardLines(all = false) {
  const sel = all ? '.cc-tpl-line[data-cc-tpl]' : '.cc-tpl-line[data-cc-tpl]:not([data-cc-tpl-filled])';
  const slots = document.querySelectorAll(sel);
  if (!slots.length) return;
  if (!_ccTplCache) { ccTplLoadAll().then(() => ccTplRefreshCardLines(true)); return; }
  slots.forEach(_ccTplFillSlot);
}
/* Cards are re-rendered in many places — fill any new empty slot automatically */
(function () {
  let t = null;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => ccTplRefreshCardLines(false), 30); };
  const start = () => {
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches?.('.cc-tpl-line') || n.querySelector?.('.cc-tpl-line:not([data-cc-tpl-filled])'))) { schedule(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/* Delete: inline confirmation on the card line (no pop-up) */
function ccTplAskDelete(btn, kind, id, type) {
  const line = btn.closest('.cc-tpl-line'); if (!line) return;
  const a = `'${kind}','${_ccTplEsc(String(id))}','${type}'`;
  line.innerHTML = `<span class="cc-tpl-line__txt">Delete this template?</span>
    <button type="button" class="cc-tpl-link cc-tpl-link--del" onclick="event.stopPropagation();ccTplConfirmDelete(this,${a})">Delete</button>
    <button type="button" class="cc-tpl-link" onclick="event.stopPropagation();ccTplRefreshCardLines(true)">Keep</button>`;
}
async function ccTplConfirmDelete(btn, kind, id, type) {
  const line = btn.closest('.cc-tpl-line');
  btn.disabled = true;
  try { await ccTplDelete(kind, id, type); if (typeof showToast === 'function') showToast('Template deleted'); }
  catch (e) {
    if (line) line.innerHTML = `<span class="cc-tpl-line__txt cc-tpl-err">Not deleted — ${_ccTplEsc(e.message)}</span>
      <button type="button" class="cc-tpl-link" onclick="event.stopPropagation();ccTplRefreshCardLines(true)">OK</button>`;
  }
}

/* ── GENERATOR: "Save as template" bar above Cancel / Generate PDF ── */
function ccTplAttach({ kind, unitId, type, footer }) {
  if (!footer) return;
  footer.querySelector('.cc-tpl-bar')?.remove();
  if (!ccTplInScope(kind, type)) return;
  if (!_ccTplCache) ccTplLoadAll();
  const bar = document.createElement('div');
  bar.className = 'cc-tpl-bar';
  bar.innerHTML = `<button type="button" class="cc-tpl-save"><i class="ti ti-bookmark"></i> Save as template</button>
    <span class="cc-tpl-status"></span>`;
  footer.insertBefore(bar, footer.firstChild);
  bar.querySelector('.cc-tpl-save').addEventListener('click', () => _ccTplOnSave(bar, kind, unitId, type));
}

function _ccTplMeta(kind, unitId, type, body) {
  const ad = _ccTplAdapters[kind];
  const p  = ad.prefix(type, unitId);
  const v  = id => (body.querySelector('#' + CSS.escape(p + id))?.value || '').trim();
  return { start: v('start'), tenant: v('name'), kaution: v('kaution') };
}

async function _ccTplOnSave(bar, kind, unitId, type, confirmed = false) {
  const ad = _ccTplAdapters[kind]; if (!ad) return;
  const status = bar.querySelector('.cc-tpl-status');
  const saveBtn = bar.querySelector('.cc-tpl-save');
  await ccTplLoadAll();
  const existing = ccTplGet(kind, unitId, type);
  if (existing && !confirmed) {
    const when = existing.meta?.start ? 'from ' + _ccTplFmtDate(existing.meta.start) : 'saved ' + _ccTplFmtDate((existing.saved_at || '').slice(0, 10));
    status.className = 'cc-tpl-status';
    status.innerHTML = `Replace template ${_ccTplEsc(when)}?
      <button type="button" class="cc-tpl-link" data-act="yes">Replace</button>
      <button type="button" class="cc-tpl-link" data-act="no">Keep</button>`;
    status.querySelector('[data-act=yes]').onclick = () => _ccTplOnSave(bar, kind, unitId, type, true);
    status.querySelector('[data-act=no]').onclick  = () => { status.innerHTML = ''; };
    return;
  }
  const body = ad.body();
  if (!body) return;
  saveBtn.disabled = true;
  status.className = 'cc-tpl-status';
  status.textContent = 'Saving…';
  try {
    await ccTplSave(kind, unitId, type, ad.snapshot(body), _ccTplMeta(kind, unitId, type, body));
    status.className = 'cc-tpl-status cc-tpl-ok';
    status.textContent = '✓ Template saved';
  } catch (e) {
    status.className = 'cc-tpl-status cc-tpl-err';
    status.textContent = 'Not saved — ' + e.message;
  } finally { saveBtn.disabled = false; }
}

/* ── RENEW ────────────────────────────────────────────────── */
async function ccTplRenew(kind, unitId, type) {
  const ad = _ccTplAdapters[kind]; if (!ad) return;
  let row;
  try { row = await ccTplFetchFields(kind, unitId, type); }
  catch (e) { if (typeof showToast === 'function') showToast('Template not loaded — ' + e.message); return; }
  if (!row || !row.fields) { ccTplRefreshCardLines(true); return; }

  await ad.renew(ad.openType(type), unitId, row.fields);
  await new Promise(r => setTimeout(r, 60));
  const body = ad.body(); if (!body) return;
  const p = ad.prefix(type, unitId);

  // 1) New contract period: clear every date field (start, end, signing, Sonderkündigung…)
  body.querySelectorAll('input[type=date], input.cc-date').forEach(el => {
    el.value = '';
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Staffel: amounts stay; dates are shown again once the new start is entered
  body.querySelectorAll('.apt-mv-staffel-datum, .apt-gw-staffel-datum').forEach(el => { el.textContent = '—'; });

  // 2) Kaution stays exactly as in the template (never recalculated on renew)
  Object.entries(row.fields.fields || {}).forEach(([id, val]) => {
    if (!/-kaution$/.test(id)) return;
    const el = body.querySelector('#' + CSS.escape(id));
    if (el) { el.value = val; el.removeAttribute('data-auto'); }
  });

  // 3) Banner: what this is + what to check
  _ccTplBanner(body, kind, unitId, type, row, p);
  body.scrollTop = 0;
}

function _ccTplBanner(body, kind, unitId, type, row, p) {
  body.querySelector('.cc-tpl-banner')?.remove();
  const meta = row.meta || {};
  const ad   = _ccTplAdapters[kind];
  const when = meta.start ? 'from ' + _ccTplFmtDate(meta.start) : 'saved ' + _ccTplFmtDate((row.saved_at || '').slice(0, 10));
  const kaut = body.querySelector('#' + CSS.escape(p + 'kaution'))?.value;

  // Tenants tab has newer details than the template? (hint only — nothing is changed)
  const diffs = [];
  try {
    const cur = ad.currentTenant ? ad.currentTenant(unitId) : null;
    if (cur && (cur.firstName || cur.lastName)) {
      const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const val  = id => body.querySelector('#' + CSS.escape(p + id))?.value || '';
      const pairs = [
        ['Name',    val('name'),  [cur.firstName, cur.lastName].filter(Boolean).join(' ')],
        ['Email',   val('email'), cur.email],
        ['Phone',   val('tel'),   cur.phone],
        ['Address', val('adr'),   cur.address],
      ];
      pairs.forEach(([lbl, tplV, curV]) => { if (norm(curV) && norm(tplV) !== norm(curV)) diffs.push(lbl); });
    }
  } catch (e) {}

  const b = document.createElement('div');
  b.className = 'cc-tpl-banner';
  b.innerHTML = `
    <div class="cc-tpl-banner__title"><i class="ti ti-bookmark"></i> Renewal of template ${_ccTplEsc(when)}</div>
    <div class="cc-tpl-banner__row">Enter the new contract dates.${body.querySelector('.apt-mv-staffel-row, .apt-gw-staffel-row') ? ' Staffel amounts are kept; their dates follow the new start.' : ''}</div>
    <div class="cc-tpl-banner__row">Kaution stays at ${kaut ? _ccTplEsc(Number(kaut).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' €' : 'the saved amount'} — change it by hand if the rent changes.</div>
    ${diffs.length ? `<div class="cc-tpl-banner__row cc-tpl-banner__warn">Tenants tab has different ${_ccTplEsc(diffs.join(', '))} — the template values are used.</div>` : ''}`;
  body.insertBefore(b, body.firstChild);
}

/* ── STYLES ───────────────────────────────────────────────── */
(function () {
  if (document.getElementById('cc-tpl-styles')) return;
  const s = document.createElement('style');
  s.id = 'cc-tpl-styles';
  s.textContent = `
.cc-tpl-line { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:2px 2px 8px; font-size:11px; color:var(--cc-taupe); }
.cc-tpl-line:empty { display:none; }
.cc-tpl-line > i { font-size:12px; color:var(--cc-gold); }
.cc-tpl-line__txt { flex:1; min-width:0; }
.cc-tpl-link { background:none; border:none; padding:6px 2px; font-family:inherit; font-size:11px; font-weight:500;
  color:var(--cc-gold); text-decoration:underline; text-underline-offset:2px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.cc-tpl-link--del { color:#C4705A; }
.cc-tpl-err { color:#C4705A; }
.cc-tpl-bar { flex-basis:100%; order:-1; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
#contractFooter, #aptContractFooter { flex-wrap:wrap; }
.cc-tpl-save { display:inline-flex; align-items:center; gap:5px; height:30px; padding:0 12px; background:none;
  border:.5px solid var(--cc-rule); border-radius:6px; font-family:inherit; font-size:10px; font-weight:500;
  letter-spacing:.06em; text-transform:uppercase; color:var(--cc-taupe); cursor:pointer; }
.cc-tpl-save:disabled { opacity:.5; }
.cc-tpl-status { font-size:11px; color:var(--cc-taupe); }
.cc-tpl-status.cc-tpl-ok { color:#27500A; }
.cc-tpl-banner { background:#F5EFE6; border-left:3px solid var(--cc-gold); border-radius:var(--cc-r-md);
  padding:10px 12px; margin-bottom:14px; font-size:12px; color:var(--cc-charcoal); line-height:1.4; }
.cc-tpl-banner__title { font-weight:500; margin-bottom:4px; display:flex; align-items:center; gap:6px; }
.cc-tpl-banner__title i { color:var(--cc-gold); }
.cc-tpl-banner__row { color:var(--cc-taupe); font-size:11px; }
.cc-tpl-banner__warn { color:#8C5A30; margin-top:4px; }
  `;
  document.head.appendChild(s);
})();
