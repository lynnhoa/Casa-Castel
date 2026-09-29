/* ─────────────────────────────────────────────────────────────
   NK-ABRECHNUNGEN in the tenant card — read-only from Settlements
   cc-nk-settle.js  (phase 3f)

   Settlements is the one place where NK-Abrechnungen are made and tracked
   (ctrl_settlements + abr_results). The tenant card only shows them:
   period · status · result, and "Open in Settlements".
   Entries from the old tracking (nk_entries / rnt_nk_entries) stay visible
   below, read-only, so nothing disappears.
   ───────────────────────────────────────────────────────────── */

const CC_NKS = { rows: null, res: null, loading: null, casaProp: null };

function _ccNksDb() { return (typeof sbL !== 'undefined' && sbL) ? sbL : null; }
function _ccNksEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _ccNksD(iso) { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
function _ccNksEur(n) { return (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

async function ccNksLoad() {
  const db = _ccNksDb(); if (!db) return;
  if (CC_NKS.loading) return CC_NKS.loading;
  CC_NKS.loading = Promise.all([
    db.from('ctrl_settlements').select('*').not('tenant_id', 'is', null),
    db.from('abr_results').select('*'),
    db.from('ctrl_properties').select('*').eq('id', 7),                // Casa Castel: NK period start + "in portfolio since"
  ]).then(([a, b, c]) => {
    CC_NKS.rows = a.error ? [] : (a.data || []);
    CC_NKS.res  = b.error ? [] : (b.data || []);
    CC_NKS.casaProp = c && !c.error && c.data && c.data[0] ? c.data[0] : {};
    document.querySelectorAll('.cc-nks').forEach(el => { el.innerHTML = _ccNksInner(el.dataset.tid, el._legacy || [], el._due || []); });
  }).catch(() => { CC_NKS.rows = []; CC_NKS.res = []; })
    .finally(() => { CC_NKS.loading = null; });
  return CC_NKS.loading;
}

function _ccNksResult(r) {
  const list = CC_NKS.res || [];
  const x = r.result_id ? list.find(a => String(a.id) === String(r.result_id))
    : list.find(a => String(a.tenant_id || '') === String(r.tenant_id || '') && a.period_from && String(a.period_from).slice(0, 10) === String(r.period_from).slice(0, 10));
  if (!x) return '';
  const amt = Number(x.amount) || 0, dir = Number(x.direction) || 0;
  if (!amt || !dir) return 'Ausgeglichen';
  return (dir > 0 ? 'Nachzahlung ' : 'Guthaben ') + _ccNksEur(amt);
}
function _ccNksStatus(s) {
  if (s === 'erledigt' || s === 'bezahlt') return ['tnp-green', 'done'];
  if (s === 'verschickt') return ['tnp-blue', 'sent'];
  if (s === 'nicht durchgeführt') return ['tnp-gray', 'skipped'];
  return ['tnp-amber', 'open'];
}

/* Is an NK-Abrechnung still open for this tenant? The same data the section shows:
   Settlements (not done / not paid / not "nicht durchgeführt") + old tracking not paid. */
function ccNksHasOpen(tid, legacy, due) {
  const rows = (CC_NKS.rows || []).filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant'));
  if (rows.some(r => !_NK_DONE.includes(r.status))) return true;
  if ((legacy || []).some(e => !e.paid)) return true;
  return ccNksDueOpen(tid, legacy, due).length > 0;
}

/* ── DUE NK-Abrechnungen (Casa) — the same rules as Settlements ─────────────
   A tenant owes an Abrechnung for every settlement period that has ENDED, whose
   Frist (period end + 12 months) has not passed, and in which they paid
   Kalt + NK on at least one day. Pauschal-only spans never count.
   Done = a Settlements line "erledigt / bezahlt / nicht durchgeführt"
   (or an old entry marked paid). Nothing entered yet = open.              */
const _nkAdd = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const _NK_DONE = ['erledigt', 'bezahlt', 'nicht durchgeführt'];
function _ccNksToday() { return typeof ccTodayISO === 'function' ? ccTodayISO() : new Date().toISOString().slice(0, 10); }
function ccNksPeriods(prop) {
  const p = prop || CC_NKS.casaProp || {}, today = _ccNksToday();
  const st = /^\d{2}-\d{2}$/.test(String(p.nk_period_start || '')) ? p.nk_period_start : '01-01';
  const since = String(p.in_portfolio_since || '').slice(0, 10), ty = Number(today.slice(0, 4)), out = [];
  for (let y = ty - 3; y <= ty; y++) {
    let from = y + '-' + st; const to = _nkAdd((y + 1) + '-' + st, -1);
    if (since && to < since) continue;
    if (since && from < since) from = since;
    const frist = _nkAdd((y + 2) + '-' + st, -1);
    if (to < today && frist >= today) out.push({ from, to, frist, year: Number(to.slice(0, 4)) });
  }
  return out;
}
function _ccNksPerLabel(from, to) {
  if (from.slice(5) === '01-01' && to.slice(5) === '12-31' && from.slice(0, 4) === to.slice(0, 4)) return from.slice(0, 4);
  return from.slice(0, 4) + '/' + to.slice(2, 4);
}
/* hasKaltNK(from, to) → true when the tenant paid Kalt + NK on any day of that span */
function ccNksDue(rec, hasKaltNK) {
  const mb = String(rec && rec.mietbeginn || '').slice(0, 10);
  if (!mb) return [];
  const me = String(rec.mietende || '').slice(0, 10) || '9999-12-31';
  return ccNksPeriods().map(P => {
    const from = mb > P.from ? mb : P.from, to = me < P.to ? me : P.to;
    if (from > to) return null;
    if (typeof hasKaltNK === 'function' && !hasKaltNK(from, to)) return null;   // pauschal → no Abrechnung
    return { ...P, spanFrom: from, spanTo: to, label: _ccNksPerLabel(P.from, P.to) };
  }).filter(Boolean);
}
/* The due periods that are not done yet */
function ccNksDueOpen(tid, legacy, due) {
  const rows = (CC_NKS.rows || []).filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant'));
  return (due || []).filter(d => {
    const m = rows.filter(r => Number(r.covers_year) === d.year || (String(r.period_from).slice(0, 10) >= d.from && String(r.period_from).slice(0, 10) <= d.to));
    if (m.length) return m.some(r => !_NK_DONE.includes(r.status));
    const old = (legacy || []).filter(e => String(e.period || '').includes(String(d.year)));
    if (old.length) return old.some(e => !e.paid);
    return true;
  });
}

/* Which NK-Abrechnung is open, for the card pill: "NK 2025 open" (oldest open first) */
function ccNksOpenLabel(tid, legacy, due) {
  const dOpen = ccNksDueOpen(tid, legacy, due).sort((a, b) => a.from.localeCompare(b.from));
  const rows = (CC_NKS.rows || []).filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant')
    && !['erledigt', 'bezahlt', 'nicht durchgeführt'].includes(r.status))
    .sort((a, b) => String(a.period_from).localeCompare(String(b.period_from)));
  let y = rows.length ? (rows[0].covers_year || String(rows[0].period_to || rows[0].period_from || '').slice(0, 4)) : '';
  if (!y) {
    const o = (legacy || []).filter(e => !e.paid).sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')))[0];
    y = o ? String(o.period || '').replace(/^.*?(\d{4}).*$/, '$1') : '';
  }
  if (dOpen.length && (!y || dOpen[0].label.slice(0, 4) < String(y))) y = dOpen[0].label;
  return y ? 'NK ' + y + ' open' : 'NK open';
}

/* An entry from the old NK tracking: mark it done or delete it — right here, no SQL.
   (New Abrechnungen are made in Settlements.) */
async function ccNksOldAction(id, tid) {
  const casa = typeof _tnNK !== 'undefined' && _tnNK[tid];
  const map  = casa ? _tnNK : (typeof _rntNK !== 'undefined' ? _rntNK : null);
  const table = casa ? 'nk_entries' : 'rnt_nk_entries';
  const list = map && map[tid] ? map[tid] : [];
  const e = list.find(x => String(x.id) === String(id));
  const db = _ccNksDb();
  if (!e || !db) return;
  // Rentals has no in-app dialog yet → plain question, "Mark done" only
  if (typeof ccDialog !== 'function') {
    if (e.paid || !confirm('NK ' + (e.period || '') + ' (old tracking)\n\nMark as done?')) return;
  }
  const v = typeof ccDialog !== 'function' ? 'done' : await ccDialog({ icon: 'ti-receipt', title: 'NK ' + _ccNksEsc(e.period || ''),
    body: 'An entry from the old NK tracking. New Abrechnungen are made in Settlements.',
    actions: [{ label: 'Cancel', value: null }, { label: 'Delete', value: 'del', danger: true, icon: 'ti-trash' },
              ...(e.paid ? [] : [{ label: 'Mark done', value: 'done', primary: true }])] });
  if (!v) return;
  if (v === 'del') {
    if (!(await ccConfirm('Delete NK ' + _ccNksEsc(e.period || '') + '?', 'This old entry is removed for good.', 'Delete', true))) return;
    const { error } = await db.from(table).delete().eq('id', e.id);
    if (error) { if (typeof ccSaveFailed === 'function') ccSaveFailed(error, 'NK entry'); return; }
    map[tid] = list.filter(x => x !== e);
  } else {
    const { error } = await db.from(table).update({ sent: true, paid: true }).eq('id', e.id);
    if (error) { if (typeof ccSaveFailed === 'function') ccSaveFailed(error, 'NK entry'); return; }
    e.sent = true; e.paid = true;
  }
  if (typeof _tnRender === 'function') _tnRender();
  if (typeof _rntRender === 'function') _rntRender();
}

/* ── SKIP an NK-Abrechnung ("I'm not doing this one") ─────────────────────
   Saved exactly like Settlements does: a ctrl_settlements line with status
   "nicht durchgeführt". Pill and count disappear; the line stays, greyed,
   and can be reopened. Casa only: skip one year for every Casa tenant.      */
const _NK_CASA_PROP = 7;
function _ccNksName(tid) {
  const r = typeof _tnRecords !== 'undefined' ? _tnRecords.find(x => String(x.id) === String(tid)) : null;
  return r ? ([r.first_name, r.last_name].filter(Boolean).join(' ') || r.room || '') : '';
}
function _ccNksRefresh() {
  document.querySelectorAll('.cc-nks').forEach(el => { el.innerHTML = _ccNksInner(el.dataset.tid, el._legacy || [], el._due || []); });
  if (typeof _tnRender === 'function') _tnRender();
  if (typeof _rntRender === 'function') _rntRender();
}
async function _ccNksSetStatus(row, status) {
  const db = _ccNksDb(); if (!db) return false;
  const { data, error } = await db.from('ctrl_settlements').update({ status }).eq('id', row.id).select().single();
  if (error) { if (typeof ccSaveFailed === 'function') ccSaveFailed(error, 'NK-Abrechnung'); return false; }
  Object.assign(row, data || { status });
  return true;
}
async function _ccNksInsertSkip(tid, d) {
  const db = _ccNksDb(); if (!db) return false;
  const row = { property_id: _NK_CASA_PROP, tenant_id: tid, app: 'casa', kind: 'nk_tenant', covers_year: d.year,
                period_from: d.spanFrom, period_to: d.spanTo, note: null, status: 'nicht durchgeführt' };
  const { data, error } = await db.from('ctrl_settlements').insert(row).select().single();
  if (error) { if (typeof ccSaveFailed === 'function') ccSaveFailed(error, 'NK-Abrechnung'); return false; }
  CC_NKS.rows = (CC_NKS.rows || []).concat([data || row]);
  return true;
}
/* Every Casa tenant with this year still open → [{ tid, name, d (due item) | row (stored open line) }] */
function _ccNksCasaOpenForYear(year) {
  if (typeof _tnRecords === 'undefined' || typeof _tnNkDue !== 'function') return [];
  const out = [];
  _tnRecords.filter(r => r.status === 'active' || r.status === 'former').forEach(r => {
    const legacy = (typeof _tnNK !== 'undefined' && _tnNK[r.id]) || [];
    const d = ccNksDueOpen(r.id, legacy, _tnNkDue(r)).find(x => x.year === year);
    if (!d) return;
    const row = (CC_NKS.rows || []).find(x => String(x.tenant_id) === String(r.id) && (!x.kind || x.kind === 'nk_tenant')
      && (Number(x.covers_year) === year) && (x.status === 'offen' || x.status === 'erstellt' || !x.status));
    out.push({ tid: r.id, name: [r.first_name, r.last_name].filter(Boolean).join(' ') + ' (' + r.room + ')', d, row });
  });
  return out;
}
async function _ccNksSkipAll(year, label) {
  const list = _ccNksCasaOpenForYear(year);
  if (!list.length) return;
  const ok = await ccConfirm('Skip NK ' + _ccNksEsc(label) + ' for all?',
    'Marks it "nicht durchgeführt" for ' + list.length + ' tenant' + (list.length === 1 ? '' : 's') + ':<br><strong>' +
    list.map(x => _ccNksEsc(x.name)).join('<br>') + '</strong><br>You can reopen each one later.', 'Skip all', true);
  if (!ok) return;
  for (const x of list) { if (x.row) await _ccNksSetStatus(x.row, 'nicht durchgeführt'); else await _ccNksInsertSkip(x.tid, x.d); }
  if (typeof ccToast === 'function') ccToast('NK ' + label + ' skipped for ' + list.length);
  _ccNksRefresh();
}
async function _ccNksAskSkip(title, body, casaYear, label) {
  if (typeof ccDialog !== 'function') return confirm(title + '\n\nMark as "nicht durchgeführt"?') ? 'one' : null;
  const others = casaYear ? _ccNksCasaOpenForYear(casaYear).length : 0;
  return ccDialog({ icon: 'ti-receipt', title, body,
    actions: [{ label: 'Cancel', value: null },
              ...(others > 1 ? [{ label: 'Skip all ' + label, value: 'all' }] : []),
              { label: 'Skip', value: 'one', primary: true }] });
}
/* A due year with nothing entered yet (Casa) */
async function ccNksDueAction(tid, year) {
  const rec = typeof _tnRecords !== 'undefined' ? _tnRecords.find(r => String(r.id) === String(tid)) : null;
  const d = rec && typeof _tnNkDue === 'function' ? ccNksDueOpen(tid, (typeof _tnNK !== 'undefined' && _tnNK[tid]) || [], _tnNkDue(rec)).find(x => x.year === year) : null;
  if (!d) return;
  const v = await _ccNksAskSkip('NK ' + _ccNksEsc(d.label) + ' · ' + _ccNksEsc(_ccNksName(tid)),
    _ccNksD(d.spanFrom) + ' – ' + _ccNksD(d.spanTo) + ' · due by ' + _ccNksD(d.frist) +
    '<br>Not doing this one? It is saved as "nicht durchgeführt", the same as in Settlements. You can reopen it any time.', year, d.label);
  if (v === 'all') return _ccNksSkipAll(year, d.label);
  if (v === 'one' && await _ccNksInsertSkip(tid, d)) _ccNksRefresh();
}
/* A line from Settlements: open → skip · skipped → reopen */
async function ccNksRowAction(tid, id) {
  const row = (CC_NKS.rows || []).find(r => String(r.id) === String(id)); if (!row) return;
  const per = _ccNksD(row.period_from) + ' – ' + _ccNksD(row.period_to);
  if (row.status === 'nicht durchgeführt') {
    const ok = typeof ccConfirm === 'function'
      ? await ccConfirm('Reopen this NK-Abrechnung?', per + ' · ' + _ccNksEsc(_ccNksName(tid)) + ' is due again.', 'Reopen')
      : confirm('Reopen NK ' + per + '?');
    if (ok && await _ccNksSetStatus(row, 'offen')) _ccNksRefresh();
    return;
  }
  const casa = Number(row.property_id) === _NK_CASA_PROP;
  const year = Number(row.covers_year) || Number(String(row.period_to || '').slice(0, 4));
  const label = String(year);
  const v = await _ccNksAskSkip('NK ' + label + ' · ' + _ccNksEsc(_ccNksName(tid)),
    per + '<br>Not doing this one? It is saved as "nicht durchgeführt", the same as in Settlements. You can reopen it any time.', casa ? year : null, label);
  if (v === 'all') return _ccNksSkipAll(year, label);
  if (v === 'one' && await _ccNksSetStatus(row, 'nicht durchgeführt')) _ccNksRefresh();
}

/* legacy = the tenant's entries from the old tracking (tap one to mark it done or delete it) */
function ccNksSectionHTML(tid, ctx, legacy, due) {
  if (CC_NKS.rows === null && !CC_NKS.loading) setTimeout(ccNksLoad, 0);
  const sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
  const id = 'nks-' + String(tid).replace(/[^A-Za-z0-9]/g, '').slice(0, 16) + (ctx === 'modal' ? '-m' : '');
  setTimeout(() => { const el = document.getElementById(id); if (el) { el._legacy = legacy || []; el._due = due || []; } }, 0);
  return `<div class="${sec} cc-nks-wrap"><div class="tn-sec-body" style="padding-top:10px;padding-bottom:12px">
    <div class="cc-nks-head"><span class="tn-sec-lbl">NK-Abrechnungen</span></div>
    <div class="cc-nks" id="${id}" data-tid="${_ccNksEsc(tid)}">${_ccNksInner(tid, legacy || [], due || [])}</div>
    <div class="cc-sec-foot"><a class="cc-foot-btn" href="settlements.html"><i class="ti ti-external-link"></i> Open in Settlements</a></div>
  </div></div>`;
}
function _ccNksInner(tid, legacy, due) {
  if (CC_NKS.rows === null) return '<p class="tn-empty">Loading…</p>';
  const rows = CC_NKS.rows.filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant'))
    .sort((a, b) => String(b.period_from).localeCompare(String(a.period_from)));
  const line = r => {
    const [cls, txt] = _ccNksStatus(r.status), res = _ccNksResult(r);
    const tap = r.status === 'offen' || r.status === 'erstellt' || !r.status || r.status === 'nicht durchgeführt';
    const inner = `<span class="cc-nks-per">${_ccNksD(r.period_from)} – ${_ccNksD(r.period_to)}</span>
      <span class="cc-nks-res">${_ccNksEsc(res)}</span>
      <span class="tnp ${cls}">${txt}</span>`;
    return tap
      ? `<button type="button" class="cc-nks-row" onclick="ccNksRowAction('${_ccNksEsc(String(tid))}','${_ccNksEsc(String(r.id))}')">${inner}<i class="ti ti-chevron-right" style="font-size:13px;color:var(--cc-stone)" aria-hidden="true"></i></button>`
      : `<div class="cc-nks-row">${inner}</div>`;
  };
  const old = (legacy || []).slice().sort((a, b) => String(b.period || '').localeCompare(String(a.period || ''))).map(e => `
    <button type="button" class="cc-nks-row is-old" onclick="ccNksOldAction('${_ccNksEsc(String(e.id))}','${_ccNksEsc(String(tid))}')">
      <span class="cc-nks-per">${_ccNksEsc(e.period || '')}</span>
      <span class="cc-nks-res">${e.amount ? _ccNksEur(e.amount) : ''}</span>
      <span class="tnp ${e.paid ? 'tnp-green' : e.sent ? 'tnp-blue' : 'tnp-amber'}">${e.paid ? 'done' : e.sent ? 'sent' : 'open'}</span>
      <i class="ti ti-chevron-right" style="font-size:13px;color:var(--cc-stone)" aria-hidden="true"></i></button>`).join('');
  // due, but nothing entered in Settlements yet
  const pending = ccNksDueOpen(tid, legacy, due).filter(d => !rows.some(r => Number(r.covers_year) === d.year
    || (String(r.period_from).slice(0, 10) >= d.from && String(r.period_from).slice(0, 10) <= d.to)))
    .map(d => `<button type="button" class="cc-nks-row" onclick="ccNksDueAction('${_ccNksEsc(String(tid))}',${d.year})">
      <span class="cc-nks-per">${_ccNksD(d.spanFrom)} – ${_ccNksD(d.spanTo)}</span>
      <span class="cc-nks-res">due by ${_ccNksD(d.frist)}</span>
      <span class="tnp tnp-amber">open</span>
      <i class="ti ti-chevron-right" style="font-size:13px;color:var(--cc-stone)" aria-hidden="true"></i></button>`).join('');
  return ((rows.length || pending) ? pending + rows.map(line).join('') : '<p class="tn-empty">No Abrechnung due.</p>') +
    (old ? `<div class="cc-nks-old-lbl">Earlier (old tracking)</div>${old}` : '');
}
