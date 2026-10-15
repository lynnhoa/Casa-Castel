/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS → CONTROLLING · Phase 6b
   pv-ctrl.js — loaded in controlling.html after the Controlling scripts.
     · A month closed in Providers is the Soll of its Casa Castel cost
       type ("from Providers", read-only), invoices one tap away.
     · You confirm it like any cost (tap the Soll / type the Ist) →
       paid ✓ goes back to Providers; clearing the Ist takes it back.
     · Reopened, or changed after you confirmed → a note on the line
       until you confirm again.
   Everything else in Controlling stays as it is. If Providers isn't
   set up, nothing here does anything.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (typeof ctlLoadAll !== 'function' || typeof ctlCasaCostRows !== 'function') return;
  const st = { y: null, rows: [] };
  window._pvCtl = st;
  const same = (a, b) => String(a) === String(b);
  const find = (catId, y, m) => (st.y === y ? st.rows.find(r => same(r.category_id, catId) && r.month === m) : null);
  const catOf = id => (window._ctrl.categories || []).find(c => same(c.id, id));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (typeof cxEur === 'function' ? cxEur(Number(n) || 0) : (Number(n) || 0).toFixed(2).replace('.', ',') + ' €');
  const dm = d => d ? String(d).slice(8, 10) + '.' + String(d).slice(5, 7) + '.' + String(d).slice(0, 4) : '';

  /* "Open in Controlling" from Providers → that month, Casa Castel · Expenses */
  let go = null;
  try { go = JSON.parse(sessionStorage.getItem('pv_ctl_goto') || 'null'); sessionStorage.removeItem('pv_ctl_goto'); } catch (e) {}
  if (go && go.year) window._ctrl.year = go.year;
  const _dash = window.renderDashboard;
  if (typeof _dash === 'function') window.renderDashboard = function () {
    if (go && typeof switchTab === 'function' && typeof CX !== 'undefined') {
      const g = go; go = null;
      CX.month = g.month; CX.area = 'casa';
      return switchTab('expenses');
    }
    return _dash.apply(this, arguments);
  };

  /* load: the year's Providers months, together with Controlling's own data */
  const _load = ctlLoadAll;
  ctlLoadAll = async function () {
    const r = await _load.apply(this, arguments);
    try {
      const { data, error } = await _ctlSupa.rpc('pv_ctrl_year', { p_year: window._ctrl.year });
      st.y = window._ctrl.year; st.rows = !error && Array.isArray(data) ? data : [];
    } catch (e) { st.y = window._ctrl.year; st.rows = []; }
    try {                                                    /* Fix 6: which cost types Providers owns, and since when */
      const { data: cl, error: e2 } = await _ctlSupa.rpc('pv_ctrl_claimed', {});
      st.claimed = !e2 && Array.isArray(cl) ? cl : [];
    } catch (e) { st.claimed = st.claimed || []; }
    return r;
  };

  /* the Soll: a closed Providers month replaces the Setup Soll of its cost type */
  const _rows = ctlCasaCostRows;
  ctlCasaCostRows = function (p, y, m) {
    const plan = _rows.apply(this, arguments) || { rows: [] };
    if (st.y !== y) return plan;
    plan.rows = plan.rows || [];
    st.rows.filter(pv => pv.month === m).forEach(pv => {
      const cat = catOf(pv.category_id);
      if (!cat) return;
      let r = plan.rows.find(x => same(x.catId, cat.id));
      if (!r) {
        r = { key: 'cat:' + cat.id, catId: cat.id, label: cat.name || 'Providers', soll: 0, sub: '', src: '' };
        plan.rows.push(r);
        if (plan.notDue) plan.notDue = plan.notDue.filter(n => n.label !== cat.name);
        if (plan.bedarf) plan.bedarf = plan.bedarf.filter(b => !same(b.catId, cat.id));
      }
      const n = (pv.invoices || []).length;
      r.soll = Math.round(Number(pv.sum || 0) * 100) / 100;
      r.src = 'Providers';
      r.sub = (pv.jobs || []).map(j => j.name).join(' + ') + ' · ' + n + (n === 1 ? ' invoice' : ' invoices');
      r.note = pv.status === 'reopened' ? 'Reopened in Providers — the Soll can still change'
             : pv.changed ? 'Changed in Providers after you confirmed — confirm again' : (r.note || null);
      r.pv = pv;
    });
    /* Fix 6: Providers owns this cost type → months without a closed Providers month
       show no stale Setup Soll (months before Providers took over keep it) */
    (st.claimed || []).forEach(c => {
      const cat = catOf(c.category_id);
      if (!cat || !c.from) return;
      const fy = +String(c.from).slice(0, 4), fm = +String(c.from).slice(5, 7);
      if (y < fy || (y === fy && m < fm)) return;
      if (st.rows.some(pv => same(pv.category_id, c.category_id) && pv.month === m)) return;
      const i = plan.rows.findIndex(x => same(x.catId, cat.id) && x.src !== 'Providers');
      if (i !== -1) {
        plan.rows.splice(i, 1);
        plan.notDue = plan.notDue || [];
        const label = cat.name + ' — from Providers, month not closed yet';
        if (!plan.notDue.some(nd => nd.label === label)) plan.notDue.push({ label });
      }
    });
    return plan;
  };

  /* paid ✓ back: booking (or clearing) the cost in Controlling is the confirmation */
  function note(msg) {
    let el = document.getElementById('pv-ctrl-note');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pv-ctrl-note';
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#1E1B18;color:#FDFCFA;font-size:13px;padding:10px 16px;border-radius:12px;max-width:86vw;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    clearTimeout(el._t); el._t = setTimeout(() => el.remove(), 3200);
  }
  async function paid(catId, m, on) {
    const pv = find(catId, window._ctrl.year, m);
    if (!pv) return;
    let failed = false;
    for (const j of (pv.jobs || [])) {
      if (j.status !== 'closed') continue;
      try {
        const { error } = await _ctlSupa.rpc('pv_confirm_paid', { p_job: j.job_id, p_month: pv.month_iso, p_paid: on });
        if (error) { failed = true; continue; }
      } catch (e) { failed = true; continue; }
      j.paid_at = on ? new Date().toISOString() : null; j.changed = false;
    }
    if (failed) { note('Paid \u2713 kam nicht in Providers an \u2014 bitte noch einmal best\u00e4tigen.'); return; }
    pv.paid = on; pv.changed = false;
  }
  const _ups = ctlUpsertCastel;
  ctlUpsertCastel = async function (category_id, month) {
    const res = await _ups.apply(this, arguments);
    await paid(category_id, month, true);
    return res;
  };
  const _del = ctlDeleteCastel;
  ctlDeleteCastel = async function (category_id, month) {
    const res = await _del.apply(this, arguments);
    await paid(category_id, month, false);
    return res;
  };

  /* drill-down: the month's invoices under the line */
  function decorate() {
    const host = document.getElementById('tab-expenses');
    if (!host || typeof CX === 'undefined' || st.y !== window._ctrl.year) return;
    st.rows.filter(pv => pv.month === CX.month).forEach(pv => {
      const cat = catOf(pv.category_id);
      if (!cat) return;
      const inp = host.querySelector('[data-cx-in="exp:' + CASA_PROP_ID + ':cat:' + cat.id + '"]');
      const row = inp && inp.closest('.cx-r');
      if (!row || row.querySelector('.pv-ctl-link')) return;
      const n = (pv.invoices || []).length;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cx-link pv-ctl-link';
      b.innerHTML = '<i class="ti ti-receipt" aria-hidden="true"></i> ' + n + (n === 1 ? ' invoice' : ' invoices') + (pv.paid ? ' · paid ✓' : '') + ' · open';
      b.addEventListener('click', e => { e.stopPropagation(); sheet(pv, cat); });
      row.appendChild(b);
    });
  }
  if (typeof window.renderExpenses === 'function') {
    const _re = window.renderExpenses;
    window.renderExpenses = function () { const r = _re.apply(this, arguments); try { decorate(); } catch (e) {} return r; };
  }
  function sheet(pv, cat) {
    close();
    const mon = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(pv.month_iso + 'T00:00:00Z'));
    const state = pv.status === 'reopened' ? 'Reopened in Providers — the Soll can still change.'
      : pv.changed ? 'Changed in Providers after you confirmed — confirm the line again.'
      : pv.paid ? 'Paid ✓ — confirmed here, Providers shows it too.' : 'Not confirmed yet — confirm it on the line like any cost.';
    const ov = document.createElement('div');
    ov.id = 'pvCtlSheet';
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:300;background:rgba(30,27,24,.35);display:flex;align-items:flex-end;justify-content:center;');
    ov.innerHTML = '<div role="dialog" aria-label="Invoices from Providers" style="width:min(560px,100%);max-height:80vh;overflow:auto;background:#FDFCFA;border-radius:16px 16px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));font-family:inherit;color:#3A3530;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><p style="font-size:15px;font-weight:600;">' + esc(cat.name) + ' · ' + esc(mon) + '</p>' +
      '<button type="button" data-pvx="close" aria-label="Close" style="width:36px;height:36px;border-radius:18px;border:.5px solid #E0DAD0;background:#FDFCFA;color:#9A8E7E;font-size:16px;">✕</button></div>' +
      '<p style="font-size:12px;color:#9A8E7E;margin-top:2px;">from Providers · ' + esc((pv.jobs || []).map(j => j.name).join(' + ')) + ' · Soll ' + eur(pv.sum) + '</p>' +
      '<p style="font-size:12.5px;margin:10px 0 6px;color:' + (pv.changed || pv.status === 'reopened' ? '#A32D2D' : pv.paid ? '#27500A' : '#8A6535') + ';">' + esc(state) + '</p>' +
      ((pv.invoices || []).map((i, k) => '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:.5px solid #E0DAD0;">' +
        '<div style="flex:1;min-width:0;"><p style="font-size:13.5px;font-weight:500;">' + eur(i.amount) + (i.by ? ' · ' + esc(i.by) : '') + '</p>' +
        '<p style="font-size:11.5px;color:#9A8E7E;">' + (i.visit_date ? 'Visit ' + dm(i.visit_date) + ' · ' : 'Monthly invoice · ') + 'invoice ' + dm(i.invoice_date) + ((pv.jobs || []).length > 1 ? ' · ' + esc(i.job) : '') + '</p></div>' +
        '<button type="button" data-pvx="open" data-k="' + k + '" class="cx-link" style="flex-shrink:0;">Open</button></div>').join('') ||
        '<p style="font-size:12.5px;color:#9A8E7E;padding:8px 0;border-top:.5px solid #E0DAD0;">No checked invoices — closed without invoice.</p>') +
      '</div>';
    ov.addEventListener('click', async e => {
      const t = e.target.closest('[data-pvx]');
      if (e.target === ov || (t && t.dataset.pvx === 'close')) return close();
      if (t && t.dataset.pvx === 'open') {
        const inv = pv.invoices[+t.dataset.k];
        const w = window.open('', '_blank');
        const { data, error } = await _ctlSupa.storage.from('provider-invoices').createSignedUrl(inv.path, 3600);
        if (error || !data || !data.signedUrl) { if (w) w.close(); return; }
        if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank');
      }
    });
    document.body.appendChild(ov);
  }
  function close() { const o = document.getElementById('pvCtlSheet'); if (o) o.remove(); }
})();
