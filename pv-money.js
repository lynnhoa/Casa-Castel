/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · LYNN: MONEY · Phase 6a
   pv-money.js
     Invoice cards under the day card: amount + the month's visits →
       Check ✓ · Open (signed link, 1 h) · Fix + note (back to her).
     History (M8): month lines "2 visits · invoices 170,00 € · 1 to
       check · 1 missing" → Close month → Controlling (all checked;
       a visit without invoice asks first) · closed: sum · paid ✓ ·
       Reopen month · Open in Controlling. Visit rows carry their
       invoice (Fix / Check / Open) or "No invoice yet → Upload".
     People: the Controlling cost type the closed months go to.
   Money is confirmed as paid ONLY in Controlling (paid ✓ comes back).
   Depends on: utils.js, pv-core.js, pv-pics.js, pv-invoice.js,
               pv-admin.js, pv-review.js, controlling-auth.js
   ───────────────────────────────────────────────────────────── */

/* ── INVOICE CARDS (reports area) ───────────────────────── */
function pvaInvoiceCardsHTML(d) {
  const inv = (d && d.invoices) || [];
  return inv.map(i => {
    const label = i.visit_date ? pvWdDM(i.visit_date, true) : pvInvMonthName(i.month, true);
    const who = i.by ? `<span class="k-mob-week-dates-sm">${_pvagAvatarByName(i.by)}</span>` : '';
    if (i.status === 'returned') {
      return `<div class="pva-rep" style="margin-top:12px;padding-top:12px;border-top:.5px solid var(--cc-rule);">
          <div class="k-mob-week-top-row"><span class="k-mob-status-chip flagged">${pvPic('chip_invoice', 13)}Invoice · returned</span>${who}</div>
          <div class="k-mob-week-body"><div class="k-mob-week-left"><span class="k-mob-week-room">${esc(label)}</span>
            <span class="k-mob-week-dates-sm">${pvEur(i.amount)} · waiting for a new invoice</span>
            ${i.note ? `<span class="k-note k-note--flag">„${esc(i.note)}“</span>` : ''}</div></div></div>`;
    }
    return `<div class="pva-rep" style="margin-top:12px;padding-top:12px;border-top:.5px solid var(--cc-rule);">
        <div class="k-mob-week-top-row"><span class="k-mob-status-chip submitted">${pvPic('chip_invoice', 13)}Invoice · to check</span>${who}</div>
        <div class="k-mob-week-body">
          <div class="k-mob-week-left"><span class="k-mob-week-room">${esc(label)}</span>
            <span class="k-mob-week-dates-sm">${pvEur(i.amount)} · invoice ${pvDM(i.invoice_date)}${String(i.invoice_date).slice(0, 4)}</span>
            <span class="k-note k-note--wait" style="display:flex;align-items:center;gap:6px;">${pvPic('inv_line', 12)}${i.month_visits} ${i.month_visits === 1 ? 'visit' : 'visits'} in ${esc(pvInvMonthName(i.month, true))}</span></div>
          <div class="k-mob-week-acts">
            <button class="k-mob-wact green" type="button" aria-label="Check invoice" onclick="pvaInvCheck('${i.id}')">${pvPic('act_check', 14)}<span>Check</span></button>
            <button class="k-mob-wact blue" type="button" aria-label="Open invoice" onclick="pvaInvOpen('${esc(i.path)}')">${pvPic('act_open', 14)}<span>Open</span></button>
            <button class="k-mob-wact red" type="button" aria-label="Ask for correction" onclick="pvaInvFix('${i.id}')">${pvPic('act_fix', 14)}<span>Fix</span></button>
          </div>
        </div></div>`;
  }).join('');
}
async function pvaInvCheck(id) {
  const { data, error } = await pvaRpc('pv_admin_check_invoice', { p_id: id });
  if (error) { pvaToast('No connection — try again.'); return; }
  pvaToast(data && data.error ? (data.error === 'closed' ? 'That month is closed — reopen it first.' : 'Already changed — refreshed.') : 'Invoice checked ✓');
  pvaLoad(); _pvmRefreshHistory();
}
async function pvaInvOpen(path) {
  const w = window.open('', '_blank');
  const { data, error } = await _ctlSupa.storage.from('provider-invoices').createSignedUrl(path, 3600);
  if (error || !data || !data.signedUrl) { if (w) w.close(); pvaToast('Could not open the invoice.'); return; }
  if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank');
}
let _pvmFixId = null;
function pvaInvFix(id) {
  _pvmFixId = id;
  $a('pvaFixBody').innerHTML = `
    <p class="pv-intro" style="margin:0 0 8px;">What should she correct? She gets the invoice back with your note and uploads a new one.</p>
    <textarea id="pvaFixNote" class="pv-field pv-textarea" rows="3" maxlength="300" placeholder="z. B. Bitte Datum auf 16.10. ändern." style="height:auto;padding:8px 9px;"></textarea>
    <div class="cc-sec-foot" style="margin-top:14px;"><button class="cc-foot-btn" type="button" data-close="pvaFixScrim">Cancel</button>
      <button class="cc-foot-btn cc-foot-btn--red" type="button" onclick="pvaInvFixSend()">${pvPic('act_fix', 12)}Send back</button></div>`;
  $a('pvaFixScrim').classList.remove('pv-hidden');
  setTimeout(() => { const n = $a('pvaFixNote'); if (n) n.focus(); }, 50);
}
async function pvaInvFixSend() {
  const note = ($a('pvaFixNote').value || '').trim();
  if (!note) { pvaToast('Write what she should correct.'); return; }
  const { data, error } = await pvaRpc('pv_admin_return_invoice', { p_id: _pvmFixId, p_note: note });
  if (error) { pvaToast('No connection — try again.'); return; }
  $a('pvaFixScrim').classList.add('pv-hidden');
  pvaToast(data && data.error ? (data.error === 'closed' ? 'That month is closed — reopen it first.' : 'Already changed — refreshed.') : 'Sent back for correction.');
  pvaLoad(); _pvmRefreshHistory();
}

/* ── HISTORY WITH MONEY (M8) ────────────────────────────── */
let _pvmUpload = null;      /* { visit, month } open inline upload row */
let _pvmFiles = [];
function _pvmInvOf(v) { return (_pvh.invoices || []).find(i => i.visit_id === v.id && i.status !== 'replaced'); }
function _pvmMonthInvoice(m) { return (_pvh.invoices || []).find(i => !i.visit_id && String(i.month).slice(0, 7) === String(m).slice(0, 7) && i.status !== 'replaced'); }
function _pvmInvRow(inv, opts) {
  if (inv) {
    const st = inv.status;
    const tail = st === 'to_check'
      ? `<button class="cc-foot-btn cc-foot-btn--danger" type="button" onclick="pvaInvFix('${inv.id}')">Fix</button><button class="cc-foot-btn" type="button" onclick="pvaInvCheck('${inv.id}')" style="background:#EAF3DE;color:#27500A;border-color:#97C459;">${pvPic('act_check', 12)}Check</button>`
      : st === 'returned' ? `<span class="pv-k" style="color:#A32D2D;">returned${inv.note ? ' · „' + esc(inv.note) + '“' : ''}</span>`
      : `<span class="pv-k" style="color:#27500A;">✓ checked</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:7px 8px;border-radius:10px;background:#F5F2ED;">
        <span class="pic pic--x" style="width:28px;height:28px;border-radius:8px;">${pvPic('chip_invoice', 16)}</span>
        <p style="flex:1;font-size:13px;color:#1E1B18;cursor:pointer;" onclick="pvaInvOpen('${esc(inv.path)}')">Invoice <b style="font-weight:600;">${pvEur(inv.amount)}</b></p>${tail}</div>`;
  }
  if (!opts || !opts.canUpload) return '';
  const open = _pvmUpload && _pvmUpload.key === opts.key;
  return `<div style="margin-top:8px;padding:7px 8px;border-radius:10px;border:1px dashed #C8BFB0;">
      <div style="display:flex;align-items:center;gap:8px;"><span class="pic pic--x" style="width:28px;height:28px;border-radius:8px;">${pvPic('chip_invoice', 16)}</span>
        <p style="flex:1;font-size:13px;color:#9A8E7E;">No invoice yet</p>
        <button class="cc-foot-btn" type="button" onclick="pvaUploadOpen('${opts.key}', '${opts.visit || ''}', '${opts.month}')">${pvPic('upload', 12)}Upload</button></div>
      ${open ? `<div class="pv-edit-row" style="margin-top:8px;">
          <div class="pv-chips"><span class="k-mob-n-chip" style="cursor:pointer;" onclick="pvaUploadPick()">${_pvmFiles.length ? '✓ ' + (_pvmFiles.some(pvInvIsPdf) ? 'PDF' : _pvmFiles.length + ' photo' + (_pvmFiles.length === 1 ? '' : 's')) : 'Choose PDF or photos'}</span></div>
          <div class="pv-kv" style="margin-top:8px;"><div><label class="pv-k">Amount</label><input id="pvaUpAmt" class="pv-field" inputmode="decimal" placeholder="0,00 €"/></div>
            <div><label class="pv-k">Invoice date</label><input id="pvaUpDate" class="pv-field" type="date" value="${ccTodayISO()}"/></div></div>
          <div class="cc-sec-foot" style="margin-top:10px;"><button class="cc-foot-btn" type="button" onclick="pvaUploadClose()">Cancel</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="pvaUploadSend()">Upload</button></div>
          <input type="file" id="pvaUpFile" accept="application/pdf,image/*" multiple style="display:none;"/>
        </div>` : ''}
    </div>`;
}
function _pvmMonthLine(mo, visits, d) {
  const key = String(mo.month).slice(0, 7);
  const today = (d && d.today) || ccTodayISO();
  const past = key < String(today).slice(0, 7);
  const vs = visits.filter(v => String(v.date).slice(0, 7) === key);
  const counted = vs.filter(v => ['done', 'sent', 'redo'].includes(v.status) && !(v.unplanned && v.status !== 'done'));
  const inv = (_pvh.invoices || []).filter(i => String(i.month).slice(0, 7) === key && i.status !== 'replaced');
  const sum = inv.filter(i => i.status === 'checked').reduce((a, i) => a + Number(i.amount || 0), 0);
  const toCheck = inv.filter(i => i.status === 'to_check' || i.status === 'returned').length;
  const missing = mo.mode === 'per_visit' ? counted.filter(v => !inv.some(i => i.visit_id === v.id)).length
                : mo.mode === 'monthly' ? (counted.length && !inv.some(i => !i.visit_id) ? 1 : 0) : 0;
  const parts = [`${vs.length} ${vs.length === 1 ? 'visit' : 'visits'}`];
  if (mo.mode !== 'none') {
    parts.push(`invoices <b style="font-weight:600;">${pvEur(sum)}</b>`);
    if (toCheck) parts.push(`${toCheck} to check`);
    if (missing && mo.status !== 'closed') parts.push(`${missing} missing`);
  } else parts.push('no invoices (Controlling by hand)');
  let act = '';
  if (mo.mode !== 'none' && mo.status === 'closed') {
    act = `<p style="font-size:13px;color:#1E1B18;margin-top:6px;display:flex;align-items:center;gap:5px;">${pvPic('closed_line', 14)}Closed ${pvDM(String(mo.closed_at).slice(0, 10))} · <b style="font-weight:600;">${pvEur(mo.closed_sum)}</b> · ${mo.paid_at ? 'paid ✓' : 'not paid yet'}</p>
      ${mo.changed ? '<span class="k-note k-note--flag">Changed after it was paid ✓ — confirm again in Controlling.</span>' : ''}
      <div class="cc-sec-foot" style="margin-top:8px;"><button class="cc-foot-btn is-left" type="button" onclick="pvaMonthReopen('${mo.month}')">Reopen month</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="location.href='controlling.html'">${pvPic('ctrl_open', 12)}Open in Controlling</button></div>`;
  } else if (mo.mode !== 'none' && past && (vs.length || inv.length)) {
    const off = toCheck > 0;
    act = `${mo.status === 'reopened' ? '<span class="k-note">Reopened — close again to update Controlling.</span>' : ''}${mo.changed ? '<span class="k-note k-note--flag">Changed after it was paid ✓ — confirm again in Controlling.</span>' : ''}
      <button class="pv-big" type="button" onclick="pvaMonthClose('${mo.month}', ${missing})"${off ? ' disabled style="min-height:46px;margin-top:10px;background:#D9D2C7;"' : ' style="min-height:46px;margin-top:10px;"'}><span class="pv-big__ico">${pvPic('close_month', 18)}</span><span class="pv-big__txt"><span class="pv-big__de" style="font-size:14px;">Close month → Controlling</span><span class="pv-big__en">${off ? 'check all invoices first' : 'sum of the checked invoices'}</span></span></button>`;
  }
  const mInv = mo.mode === 'monthly' ? _pvmInvRow(_pvmMonthInvoice(mo.month), { canUpload: counted.length > 0 && mo.status !== 'closed', key: 'm' + key, month: mo.month }) : '';
  return `<div class="pv-sec" style="padding:10px 12px;margin:6px 0 8px;">
      <p style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#9A8E7E;">${esc(_pvMonthName(key + '-01', true))}</p>
      <p style="font-size:13px;color:#1E1B18;margin-top:2px;">${parts.join(' · ')}</p>${mInv}${act}</div>`;
}
/* the History body with money (pv-review.js calls this for Lynn) */
function pvaHistoryMoneyHTML(list, d) {
  const months = (_pvh.months || []);
  const keys = new Set(list.map(v => String(v.date).slice(0, 7)));
  (_pvh.invoices || []).forEach(i => keys.add(String(i.month).slice(0, 7)));
  months.forEach(m => { if (m.status !== 'open') keys.add(String(m.month).slice(0, 7)); });
  const ordered = Array.from(keys).sort().reverse();
  if (!ordered.length) return '<p class="pv-k" style="padding:10px 2px;">No visits yet.</p>';
  const avatar = n => _pvagAvatarByName(n).replace('width:20px;height:20px', 'width:22px;height:22px').replace('font-size:8px', 'font-size:9px');
  return ordered.map(k => {
    const mo = months.find(m => String(m.month).slice(0, 7) === k) || { month: k + '-01', mode: 'per_visit', status: 'open' };
    const rows = list.filter(v => String(v.date).slice(0, 7) === k).map(v => {
      const inv = _pvmInvOf(v);
      const counted = ['done', 'sent', 'redo'].includes(v.status) && !(v.unplanned && v.status !== 'done');
      const row = pvHistoryRowHTML(v, true, avatar);
      const invHtml = mo.mode === 'per_visit' ? _pvmInvRow(inv, { canUpload: counted && mo.status !== 'closed', key: 'v' + v.id, visit: v.id, month: mo.month }) : '';
      return invHtml ? row.replace(/<\/div>\s*$/, invHtml + '</div>') : row;
    }).join('');
    return _pvmMonthLine(mo, list, d) + rows;
  }).join('');
}
async function pvaMonthClose(month, missing) {
  if (missing && !(await ccConfirm('Close anyway?', `${missing} ${missing === 1 ? 'visit has' : 'visits have'} no invoice. Closing hands the sum of the checked invoices to Controlling.`, 'Close month', false))) return;
  const { data, error } = await pvaRpc('pv_admin_close_month', { p_job: _pvaJob, p_month: month, p_force: !!missing });
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data && data.error) {
    pvaToast({ no_category: 'Pick the Controlling cost type in People first.', unchecked: 'Check all invoices first.', not_over: 'The month isn\u2019t over yet.' }[data.error] || 'Already changed — refreshed.');
    _pvmRefreshHistory(); return;
  }
  if (data && data.confirm) { pvaMonthClose(month, data.n); return; }
  pvaToast(`${_pvMonthName(month, true)} closed · ${pvEur(data.sum)} → Controlling`);
  _pvmRefreshHistory(); pvaLoad();
}
async function pvaMonthReopen(month) {
  if (!(await ccConfirm('Reopen month?', 'For a correction or a late invoice. Close it again to update Controlling.', 'Reopen', false))) return;
  const { data, error } = await pvaRpc('pv_admin_reopen_month', { p_job: _pvaJob, p_month: month });
  if (error || (data && data.error)) { pvaToast('Already changed — refreshed.'); }
  else pvaToast('Month reopened.');
  _pvmRefreshHistory();
}
function pvaUploadOpen(key, visit, month) { _pvmUpload = { key, visit: visit || null, month }; _pvmFiles = []; _pvhRender(); }
function pvaUploadClose() { _pvmUpload = null; _pvmFiles = []; _pvhRender(); }
function pvaUploadPick() {
  const fi = $a('pvaUpFile');
  if (!fi) return;
  const amt = $a('pvaUpAmt') ? $a('pvaUpAmt').value : '', dt = $a('pvaUpDate') ? $a('pvaUpDate').value : '';
  fi.value = '';
  fi.onchange = () => {
    _pvmFiles = Array.from(fi.files || []);
    _pvhRender();
    if ($a('pvaUpAmt')) $a('pvaUpAmt').value = amt;
    if ($a('pvaUpDate') && dt) $a('pvaUpDate').value = dt;
  };
  fi.click();
}
async function pvaUploadSend() {
  const u = _pvmUpload;
  const amount = ccParseEUR(($a('pvaUpAmt') || {}).value);
  const date = ($a('pvaUpDate') || {}).value || ccTodayISO();
  if (!u || !_pvmFiles.length) { pvaToast('Choose the PDF or photos first.'); return; }
  if (!(amount > 0)) { pvaToast('Enter the amount.'); return; }
  try {
    const blob = await pvInvMakePdf(_pvmFiles);
    const path = pvInvPath(_pvaJob, u.month, u.visit ? 'termin' : 'monat');
    const { error } = await _ctlSupa.storage.from('provider-invoices').upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (error) { pvaToast('Upload failed — try again.'); return; }
    const { data, error: e2 } = await pvaRpc('pv_admin_upload_invoice', { p_job: _pvaJob, p_visit: u.visit, p_month: u.visit ? null : u.month, p_amount: amount, p_date: date, p_path: path });
    if (e2) { pvaToast('No connection — try again.'); return; }
    if (data && data.error) { pvaToast({ closed: 'That month is closed — reopen it first.', exists: 'There is already an invoice.', mode: 'This month needs no invoice.' }[data.error] || 'Already changed — refreshed.'); return; }
    pvaToast('Invoice uploaded — check it when ready.');
    _pvmUpload = null; _pvmFiles = [];
    _pvmRefreshHistory(); pvaLoad();
  } catch (e) { pvaToast('Could not read that file.'); }
}
async function _pvmRefreshHistory() {
  if (!$a('pvaHistoryScrim') || $a('pvaHistoryScrim').classList.contains('pv-hidden')) return;
  const { data, error } = await pvaRpc('pv_admin_history', { p_job: _pvaJob, p_before: null, p_months: Math.max(3, _pvh.monthsLoaded || 3) });
  if (error || !data || data.error) return;
  Object.assign(_pvh, { visits: data.visits || [], next: data.next_before, invoices: data.invoices || [], months: data.months || [], today: data.today });
  _pvhRender();
}

/* ── PEOPLE: Controlling cost type ──────────────────────── */
let _pvmCats = null;
async function pvaLoadCtrlCats() {
  if (_pvmCats) return _pvmCats;
  const { data, error } = await pvaRpc('pv_admin_ctrl_categories', {});
  _pvmCats = !error && Array.isArray(data) ? data : [];
  return _pvmCats;
}
function pvaCtrlCatHTML(j) {
  if ((j.next_mode || j.invoice_mode) === 'none' && j.invoice_mode === 'none') return '';
  const cats = _pvmCats || [];
  return `<div style="margin-top:10px;"><p class="pv-k">Controlling cost type <span style="color:#9A8E7E;">· where a closed month goes</span></p>
      <div class="pv-chips">${cats.length ? cats.map(c => `<span class="k-mob-n-chip${String(j.ctrl_category_id) === String(c.id) ? ' selected' : ''}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;" onclick="pvaSetCtrlCat('${esc(c.id)}')">${esc(c.name)}</span>`).join('') : '<span class="pv-k">No Casa Castel cost types found in Controlling.</span>'}</div>
      ${j.ctrl_category_id ? '' : '<span class="k-note k-note--flag">Pick one — closing a month needs it.</span>'}</div>`;
}
async function pvaSetCtrlCat(id) {
  const { data, error } = await pvaRpc('pv_admin_set_ctrl_category', { p_job: _pvaJob, p_category: id });
  if (error || (data && data.error)) { pvaToast('Could not save — try again.'); return; }
  pvaToast('Cost type saved.');
  pvaLoad();
}

function pvaVisitInvoiceOpen(v) {                /* History filter "Open invoices" */
  const mo = (_pvh.months || []).find(m => String(m.month).slice(0, 7) === String(v.date).slice(0, 7));
  if (!mo || mo.mode !== 'per_visit' || mo.status === 'closed') return false;
  const inv = _pvmInvOf(v);
  if (inv) return inv.status === 'to_check' || inv.status === 'returned';
  return ['done', 'sent', 'redo'].includes(v.status) && !(v.unplanned && v.status !== 'done');
}
