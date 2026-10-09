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
    db.from('ctrl_properties').select('*'),                            // NK period start of every property
    db.from('properties').select('id,name,kaufdatum'),                 // purchase date (Properties) — the only source
  ]).then(([a, b, c, d]) => {
    const app = _ccNksApp();                                             // clean split: only this app's lines
    CC_NKS.rows = (a.error ? [] : (a.data || [])).filter(r => !r.app || r.app === app);
    CC_NKS.res  = b.error ? [] : (b.data || []);
    CC_NKS.props = c && !c.error ? (c.data || []) : [];
    CC_NKS.buys  = d && !d.error ? (d.data || []) : [];
    CC_NKS.casaProp = CC_NKS.props.find(p => Number(p.id) === 7) || {};
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
  const since = _ccNksSince(p), ty = Number(today.slice(0, 4)), out = [];
  for (let y = ty - 3; y <= ty; y++) {
    let from = y + '-' + st; const to = _nkAdd((y + 1) + '-' + st, -1);
    if (since && to < since) continue;
    if (since && from < since) from = since;
    const frist = _nkAdd((y + 2) + '-' + st, -1);
    if (to < today && frist >= today) out.push({ from, to, frist, year: Number(to.slice(0, 4)) });
  }
  return out;
}
/* Purchase date of a Controlling property = Properties › Purchase date (linked by loan_ref, else by name) */
function _ccNksSince(p) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const L = CC_NKS.buys || [];
  const l = p && p.loan_ref ? L.find(x => String(x.id) === String(p.loan_ref)) : L.find(x => p && norm(x.name) === norm(p.name));
  const s = String((l && l.kaufdatum) || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if ((m = s.match(/^(\d{4})$/))) return m[1] + '-01-01';
  return '';
}
function _ccNksPerLabel(from, to) { return _ccNksD(from) + '–' + _ccNksD(to); }   // always dd.mm.yyyy–dd.mm.yyyy
/* Which app this page is: Rentals or Casa Castel (each page has only one tenants tab) */
function _ccNksApp() { return typeof _rntRecords !== 'undefined' ? 'rentals' : 'casa'; }
/* Rentals: the due periods come from the apartment's own Abrechnungszeitraum (Controlling property) */
function ccNksDueFor(rec, apt) {
  const norm = s => String(s || '').trim().toLowerCase();
  const p = (CC_NKS.props || []).find(x => x.rentals_apartment_ref != null && String(x.rentals_apartment_ref) === String(apt.id))
         || (CC_NKS.props || []).find(x => Number(x.id) !== 7 && norm(x.name) === norm(apt.name));
  return p ? ccNksDue(rec, null, p).map(x => ({ ...x, pid: p.id })) : [];
}
/* hasKaltNK(from, to) → true when the tenant paid Kalt + NK on any day of that span */
function ccNksDue(rec, hasKaltNK, prop) {
  const mb = String(rec && rec.mietbeginn || '').slice(0, 10);
  if (!mb) return [];
  const me = String(rec.mietende || '').slice(0, 10) || '9999-12-31';
  return ccNksPeriods(prop).map(P => {
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
  // full dates: "NK 01.01.2025–31.12.2025 open" (oldest open first)
  let lbl = '', from = '';
  if (rows.length && rows[0].period_from && rows[0].period_to) { lbl = _ccNksPerLabel(String(rows[0].period_from).slice(0, 10), String(rows[0].period_to).slice(0, 10)); from = String(rows[0].period_from).slice(0, 10); }
  if (dOpen.length && (!from || dOpen[0].spanFrom < from)) lbl = _ccNksPerLabel(dOpen[0].spanFrom, dOpen[0].spanTo);
  if (!lbl) {
    const o = (legacy || []).filter(e => !e.paid).sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')))[0];
    lbl = o ? String(o.period || '') : '';
  }
  return lbl ? 'NK ' + lbl + ' open' : 'NK open';
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
    <div class="cc-sec-foot"><a class="cc-foot-btn" href="settlements.html"><i class="ti ti-external-link"></i> Open Settlements</a></div>
  </div></div>`;
}
function _ccNksInner(tid, legacy, due) {
  if (CC_NKS.rows === null) return '<p class="tn-empty">Loading…</p>';
  _ccNksStyle();
  const app = _ccNksApp();
  const rows = CC_NKS.rows.filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant') && (!r.app || r.app === app))
    .sort((a, b) => String(b.period_from).localeCompare(String(a.period_from)));
  const first = _ccNksFirst(tid);
  const eur = _ccNksEur, d = _ccNksD;
  const via = { zahlung: 'by transfer', miete: 'with the rent', kaution: 'via Kaution', hausgeld: 'with the Hausgeld' };
  const link = (r, made) => `<a class="cc-nkb__l" href="${_ccNksLink(r, tid)}">${made ? 'Open NK-Abrechnung' : 'Make it in Settlements'} <i class="ti ti-arrow-up-right" aria-hidden="true"></i></a>`;
  const block = r => {
    const x = _ccNksResultRow(r), skipped = r.status === 'nicht durchgeführt', done = _NK_DONE.includes(r.status) && !skipped;
    const dir = x ? Number(x.direction) || 0 : 0, amt = x ? Number(x.amount) || 0 : 0;
    const per = _ccNksPerLabel(String(r.period_from).slice(0, 10), String(r.period_to).slice(0, 10));
    let pill, sent, cls;
    if (skipped)        { pill = ['tnp-gray', 'skipped'];  cls = 'nil';  sent = 'Not made – skipped'; }
    else if (!x)        { pill = ['tnp-amber', 'open'];    cls = 'wait'; sent = 'Not made yet'; }
    else if (!amt || !dir) { pill = [done ? 'tnp-green' : 'tnp-blue', done ? 'settled' : 'sent']; cls = 'nil'; sent = 'Balanced – no money moves'; }
    else if (dir > 0)   { pill = done ? ['tnp-green', 'paid'] : ['tnp-blue', 'sent']; cls = 'in';
                          sent = done ? `${_ccNksEsc(first)} paid you <b>${eur(amt)}</b>` : `${_ccNksEsc(first)} pays you <b>${eur(amt)}</b>`; }
    else                { pill = done ? ['tnp-green', 'returned'] : ['tnp-blue', 'sent']; cls = 'out';
                          sent = done ? `You returned <b>${eur(amt)}</b> to ${_ccNksEsc(first)}` : `${_ccNksEsc(first)} gets <b>${eur(amt)}</b> back`; }
    const meta = x ? ['Letter ' + d(x.result_date), done && r.paid_date ? (dir < 0 ? 'returned ' : 'paid ') + d(r.paid_date) : '', dir ? via[x.settle_via || r.settled_via || 'zahlung'] || '' : ''].filter(Boolean).join(' · ') : '';
    const act = !x || skipped ? `<button type="button" class="cc-nkb__x" onclick="ccNksRowAction('${_ccNksEsc(String(tid))}','${_ccNksEsc(String(r.id))}')">${skipped ? 'Reopen' : 'Skip'}</button>` : '';
    return `<div class="cc-nkb"><div class="cc-nkb__h"><span class="cc-nkb__t">NK ${per}</span><span class="tnp ${pill[0]}">${pill[1]}</span></div>
      <div class="cc-nkb__s is-${cls}">${sent}</div>${meta ? `<div class="cc-nkb__m">${meta}</div>` : ''}
      <div class="cc-nkb__f">${skipped ? '' : link(r, !!x)}${act}</div></div>`;
  };
  // due, but nothing entered in Settlements yet
  const pending = ccNksDueOpen(tid, legacy, due).filter(dd => !rows.some(r => Number(r.covers_year) === dd.year
    || (String(r.period_from).slice(0, 10) >= dd.from && String(r.period_from).slice(0, 10) <= dd.to)))
    .map(dd => {
      const r = { period_from: dd.spanFrom, period_to: dd.spanTo, covers_year: dd.year, property_id: dd.pid || null };
      const skip = app === 'casa' ? `<button type="button" class="cc-nkb__x" onclick="ccNksDueAction('${_ccNksEsc(String(tid))}',${dd.year})">Skip</button>` : '';
      return `<div class="cc-nkb"><div class="cc-nkb__h"><span class="cc-nkb__t">NK ${_ccNksPerLabel(dd.spanFrom, dd.spanTo)}</span><span class="tnp tnp-amber">open</span></div>
        <div class="cc-nkb__s is-wait">Not made yet · Frist ${d(dd.frist)}</div><div class="cc-nkb__f">${link(r, false)}${skip}</div></div>`;
    }).join('');
  const old = (legacy || []).slice().sort((a, b) => String(b.period || '').localeCompare(String(a.period || ''))).map(e => `
    <button type="button" class="cc-nks-row is-old" onclick="ccNksOldAction('${_ccNksEsc(String(e.id))}','${_ccNksEsc(String(tid))}')">
      <span class="cc-nks-per">${_ccNksEsc(e.period || '')}</span>
      <span class="cc-nks-res">${e.amount ? _ccNksEur(e.amount) : ''}</span>
      <span class="tnp ${e.paid ? 'tnp-green' : e.sent ? 'tnp-blue' : 'tnp-amber'}">${e.paid ? 'done' : e.sent ? 'sent' : 'open'}</span>
      <i class="ti ti-chevron-right" style="font-size:13px;color:var(--cc-stone)" aria-hidden="true"></i></button>`).join('');
  return ((rows.length || pending) ? pending + rows.map(block).join('') : '<p class="tn-empty">No NK-Abrechnung due.</p>') +
    (old ? `<div class="cc-nks-old-lbl">Earlier (old tracking)</div>${old}` : '');
}
function _ccNksResultRow(r) {
  const list = (CC_NKS.res || []).filter(a => a.status !== 'storniert');
  return (r.result_id ? list.find(a => String(a.id) === String(r.result_id)) : null)
    || list.find(a => String(a.tenant_id || '') === String(r.tenant_id || '') && a.period_from && String(a.period_from).slice(0, 10) === String(r.period_from).slice(0, 10)) || null;
}
function _ccNksFirst(tid) {
  const list = typeof _rntRecords !== 'undefined' ? _rntRecords : (typeof _tnRecords !== 'undefined' ? _tnRecords : []);
  const r = list.find(x => String(x.id) === String(tid));
  return (r && (r.first_name || r.last_name)) || 'The tenant';
}
/* "Open NK-Abrechnung" → Settlements opens that tab, year and tenant (settlements-ui.js · stOpenLink) */
function _ccNksLink(r, tid) {
  const app = _ccNksApp(), y = Number(String(r.period_to || '').slice(0, 4)) || r.covers_year || '';
  return 'settlements.html#tab=' + (app === 'casa' ? 'casa' : 'rentals') + '&y=' + y + '&t=' + encodeURIComponent(tid) + (app === 'rentals' && r.property_id ? '&p=' + r.property_id : '');
}
function _ccNksStyle() {
  if (document.getElementById('cc-nkb-style')) return;
  const s = document.createElement('style'); s.id = 'cc-nkb-style';
  s.textContent = `
.cc-nkb{padding:12px 0;border-top:var(--cc-border);display:flex;flex-direction:column;gap:6px}
.cc-nkb:first-child{border-top:none;padding-top:4px}
.cc-nkb__h{display:flex;align-items:center;justify-content:space-between;gap:10px}
.cc-nkb__t{font-family:'Cormorant Garamond',Georgia,serif;font-size:19px;color:var(--cc-ink);line-height:1.15}
.cc-nkb__s{padding:9px 12px;border-radius:10px;font-size:13.5px;line-height:1.35}
.cc-nkb__s b{font-weight:600}
.cc-nkb__s.is-in{background:#EEF5E6;color:#27500A}.cc-nkb__s.is-out{background:#F7E9E2;color:#712B13}
.cc-nkb__s.is-wait{background:#FAEEDA;color:#633806}.cc-nkb__s.is-nil{background:var(--cc-surface);color:var(--cc-taupe)}
.cc-nkb__m{font-size:11.5px;color:var(--cc-taupe)}
.cc-nkb__f{display:flex;align-items:center;justify-content:space-between;gap:10px}
.cc-nkb__l{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:#8A6535;text-decoration:none}
.cc-nkb__x{background:none;border:none;font:inherit;font-size:12px;color:var(--cc-taupe);text-decoration:underline;padding:4px 0;cursor:pointer}`;
  document.head.appendChild(s);
}

