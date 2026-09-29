/* ─────────────────────────────────────────────────────────────
   NK-ABRECHNUNGEN in the tenant card — read-only from Settlements
   cc-nk-settle.js  (phase 3f)

   Settlements is the one place where NK-Abrechnungen are made and tracked
   (ctrl_settlements + abr_results). The tenant card only shows them:
   period · status · result, and "Open in Settlements".
   Entries from the old tracking (nk_entries / rnt_nk_entries) stay visible
   below, read-only, so nothing disappears.
   ───────────────────────────────────────────────────────────── */

const CC_NKS = { rows: null, res: null, loading: null };

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
  ]).then(([a, b]) => {
    CC_NKS.rows = a.error ? [] : (a.data || []);
    CC_NKS.res  = b.error ? [] : (b.data || []);
    document.querySelectorAll('.cc-nks').forEach(el => { el.innerHTML = _ccNksInner(el.dataset.tid, el._legacy || []); });
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
  if (s === 'nicht durchgeführt') return ['tnp-gray', 'not done'];
  return ['tnp-amber', 'open'];
}

/* Is an NK-Abrechnung still open for this tenant? The same data the section shows:
   Settlements (not done / not paid / not "nicht durchgeführt") + old tracking not paid. */
function ccNksHasOpen(tid, legacy) {
  const rows = (CC_NKS.rows || []).filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant'));
  if (rows.some(r => !['erledigt', 'bezahlt', 'nicht durchgeführt'].includes(r.status))) return true;
  return (legacy || []).some(e => !e.paid);
}

/* Which NK-Abrechnung is open, for the card pill: "NK 2025 open" (oldest open first) */
function ccNksOpenLabel(tid, legacy) {
  const rows = (CC_NKS.rows || []).filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant')
    && !['erledigt', 'bezahlt', 'nicht durchgeführt'].includes(r.status))
    .sort((a, b) => String(a.period_from).localeCompare(String(b.period_from)));
  let y = rows.length ? (rows[0].covers_year || String(rows[0].period_to || rows[0].period_from || '').slice(0, 4)) : '';
  if (!y) {
    const o = (legacy || []).filter(e => !e.paid).sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')))[0];
    y = o ? String(o.period || '').replace(/^.*?(\d{4}).*$/, '$1') : '';
  }
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

/* legacy = the tenant's entries from the old tracking (tap one to mark it done or delete it) */
function ccNksSectionHTML(tid, ctx, legacy) {
  if (CC_NKS.rows === null && !CC_NKS.loading) setTimeout(ccNksLoad, 0);
  const sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
  const id = 'nks-' + String(tid).replace(/[^A-Za-z0-9]/g, '').slice(0, 16) + (ctx === 'modal' ? '-m' : '');
  setTimeout(() => { const el = document.getElementById(id); if (el) el._legacy = legacy || []; }, 0);
  return `<div class="${sec} cc-nks-wrap"><div class="tn-sec-body" style="padding-top:10px;padding-bottom:12px">
    <div class="cc-nks-head"><span class="tn-sec-lbl">NK-Abrechnungen</span></div>
    <div class="cc-nks" id="${id}" data-tid="${_ccNksEsc(tid)}">${_ccNksInner(tid, legacy || [])}</div>
    <div class="cc-sec-foot"><a class="cc-foot-btn" href="settlements.html"><i class="ti ti-external-link"></i> Open in Settlements</a></div>
  </div></div>`;
}
function _ccNksInner(tid, legacy) {
  if (CC_NKS.rows === null) return '<p class="tn-empty">Loading…</p>';
  const rows = CC_NKS.rows.filter(r => String(r.tenant_id) === String(tid) && (!r.kind || r.kind === 'nk_tenant'))
    .sort((a, b) => String(b.period_from).localeCompare(String(a.period_from)));
  const line = r => {
    const [cls, txt] = _ccNksStatus(r.status), res = _ccNksResult(r);
    return `<div class="cc-nks-row">
      <span class="cc-nks-per">${_ccNksD(r.period_from)} – ${_ccNksD(r.period_to)}</span>
      <span class="cc-nks-res">${_ccNksEsc(res)}</span>
      <span class="tnp ${cls}">${txt}</span></div>`;
  };
  const old = (legacy || []).slice().sort((a, b) => String(b.period || '').localeCompare(String(a.period || ''))).map(e => `
    <button type="button" class="cc-nks-row is-old" onclick="ccNksOldAction('${_ccNksEsc(String(e.id))}','${_ccNksEsc(String(tid))}')">
      <span class="cc-nks-per">${_ccNksEsc(e.period || '')}</span>
      <span class="cc-nks-res">${e.amount ? _ccNksEur(e.amount) : ''}</span>
      <span class="tnp ${e.paid ? 'tnp-green' : e.sent ? 'tnp-blue' : 'tnp-amber'}">${e.paid ? 'done' : e.sent ? 'sent' : 'open'}</span>
      <i class="ti ti-chevron-right" style="font-size:13px;color:var(--cc-stone)" aria-hidden="true"></i></button>`).join('');
  return (rows.length ? rows.map(line).join('') : '<p class="tn-empty">No Abrechnung in Settlements yet.</p>') +
    (old ? `<div class="cc-nks-old-lbl">Earlier (old tracking)</div>${old}` : '');
}
