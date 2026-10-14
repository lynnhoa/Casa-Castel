/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · INVOICES (board P7) · Phase 6a
   pv-invoice.js
     Shared (both apps): photos or a PDF file → ONE PDF, the same way
       as the contract flow (cc-contract-flow.js ccfImagesToPdf).
     Provider sheet: for this visit (per visit) or a month (monthly) —
       Foto · Aus Fotos · Datei → amount (1.200,00 €) + date → Senden.
       Stored in provider-invoices <job>/<yyyy-mm>/…pdf; she can never
       open stored invoices, she only sees "✓ hochgeladen".
   Depends on: jsPDF (window.jspdf), cc-german-format.js (ccParseEUR,
               ccTodayISO), pv-core.js, pv-pics.js; the provider part
               also pv-service.js (_pvState, _pvLoad, pvOpenScrim …)
   ───────────────────────────────────────────────────────────── */

/* ── ONE PDF FROM PHOTOS OR A PDF FILE ──────────────────── */
function _pvInvLoadImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
async function pvInvImagesToPdf(files) {        /* = ccfImagesToPdf (repo contract flow) */
  const { jsPDF } = window.jspdf;
  let pdf = null;
  for (const f of files) {
    const img = await _pvInvLoadImage(f);
    const max = 2200, sc = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const data = c.toDataURL('image/jpeg', 0.85);
    const land = w > h, pw = land ? 297 : 210, ph = land ? 210 : 297;
    if (!pdf) pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: land ? 'landscape' : 'portrait' });
    else pdf.addPage('a4', land ? 'landscape' : 'portrait');
    const k = Math.min(pw / w, ph / h), iw = w * k, ih = h * k;
    pdf.addImage(data, 'JPEG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
    if (img.close) img.close();
  }
  if (!pdf) throw new Error('no photos');
  return pdf.output('blob');
}
function pvInvIsPdf(f) { return f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')); }
async function pvInvMakePdf(files) {
  const pdf = files.find(pvInvIsPdf);
  if (pdf) return pdf;
  return pvInvImagesToPdf(files.filter(f => /^image\//.test(f.type || '')));
}
function pvInvPath(job, month, tag) {
  return `${job}/${String(month).slice(0, 7)}/${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.pdf`;
}
function pvInvMonthName(iso, en) { return _pvMonthName(String(iso).slice(0, 7) + '-01', en); }
function pvEur(n) { return typeof ccFmtEUR === 'function' ? ccFmtEUR(Number(n) || 0) : (Number(n) || 0).toFixed(2).replace('.', ',') + ' €'; }

/* ── PROVIDER: the invoice blocks under the day card ────── */
function pvInvoiceBlocks(s) {                  /* slim: one thin line per open invoice (returned · monthly · missing) */
  const t = s && s.invoice_todo;
  if (!t) return '';
  const card = s.card;
  const line = (tone, txt, sub, btn, attrs) => `<div class="pv-inv-line pv-inv-line--${tone}">${pvPic('chip_invoice', 14)}<span class="pv-inv-line__t">${txt}${sub ? `<span class="pv-inv-line__s"> · ${sub}</span>` : ''}</span><button class="pv-inv-line__b" type="button" data-act="inv" ${attrs}>${btn}</button></div>`;
  let h = '';
  (t.returned || []).forEach(r => {
    const label = r.visit_date ? pvWdFull(r.visit_date) : pvInvMonthName(r.month, false);
    h += line('flag', `<b>Rechnung zurück</b> · ${pvEsc(r.visit_date ? pvWdDM(r.visit_date) : label)}`, r.note ? `„${pvEsc(r.note)}“` : pvEsc(pvEur(r.amount)),
      'Neu · New', `data-visit="${pvEsc(r.visit_id || '')}" data-month="${pvEsc(r.month)}" data-label="${pvEsc(label)}"`);
  });
  if (t.prompt) {
    const mn = pvInvMonthName(t.prompt.month, false);
    h += line('now', `<b>Monatsrechnung</b> · ${pvEsc(mn)}`, `${t.prompt.visits} ${t.prompt.visits === 1 ? 'Termin' : 'Termine'}`,
      'Hochladen', `data-visit="" data-month="${pvEsc(t.prompt.month)}" data-label="${pvEsc(mn)}"`);
  }
  (t.missing || []).forEach(m => {
    if (card && card.id === m.id) return;                    /* the card itself shows the "Rechnung" square */
    h += line('wait', `<b>Rechnung fehlt</b> · ${pvEsc(pvWdDM(m.date))}`, '',
      'Hochladen', `data-visit="${pvEsc(m.id)}" data-month="${pvEsc(String(m.date).slice(0, 7) + '-01')}" data-label="${pvEsc('Termin ' + pvWdDM(m.date))}"`);
  });
  return h;
}
function pvInvoiceWact(s) {                    /* "Rechnung" as a square on the right of the card (like Start) */
  const t = s && s.invoice_todo, v = s && s.card;
  if (!t || !v || !(t.missing || []).some(m => m.id === v.id)) return '';
  return `<button class="k-mob-wact gold pv-wact" type="button" data-act="inv" data-visit="${pvEsc(v.id)}" data-month="${pvEsc(String(v.date).slice(0, 7) + '-01')}" data-label="${pvEsc('Termin ' + pvWdDM(v.date))}">${pvPic('btn_invoice', 18)}<span>Rechnung</span></button>`;
}
function pvInvoiceCardButton() { return ''; }  /* the old full-width button is gone (slim card) */

/* ── PROVIDER: the sheet ────────────────────────────────── */
const _pvInv = { target: null, files: [], amount: '', date: '', busy: false };
function pvInvOpen(target) {
  const last = _pvState && _pvState.invoice_todo && _pvState.invoice_todo.last_amount;
  Object.assign(_pvInv, { target, files: [], amount: last ? pvEur(last).replace(/\s*€$/, '') : '', date: ccTodayISO(), busy: false });
  _pvInvRender();
  pvOpenScrim('pv-inv-scrim');
}
function _pvInvRender() {
  const t = _pvInv.target || {};
  const f = _pvInv.files;
  const imgs = f.filter(x => !pvInvIsPdf(x)).length;
  const ready = f.length && ccParseEUR(_pvInv.amount) > 0;
  const src = (k, pic, de, en) => `<button type="button" data-src="${k}" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px 10px;border-radius:14px;border:1px solid #E0DAD0;background:#FDFCFA;"><span class="pic pic--x" style="width:46px;height:46px;border-radius:14px;">${pvPic(pic, 26)}</span><span style="font-size:13px;font-weight:600;color:#1E1B18;line-height:1.15;">${de}</span><span style="font-size:10.5px;color:#9A8E7E;line-height:1.15;">${en}</span></button>`;
  $id('pv-inv-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;"><span class="pv-k">Für · for</span><span class="k-mob-n-chip selected" style="display:inline-flex;align-items:center;gap:5px;">${pvPic('inv_for', 12)}${pvEsc(t.label || '')}</span></div>
    <div style="display:flex;gap:8px;margin-top:12px;">${src('cam', 'inv_cam', 'Foto', 'Take photo')}${src('lib', 'inv_lib', 'Aus Fotos', 'From photos')}${src('file', 'inv_file', 'Datei', 'File (PDF)')}</div>
    ${f.length ? `<div style="display:flex;align-items:center;gap:10px;margin-top:12px;padding:8px 10px;border-radius:12px;background:#F5F2ED;">
        <span class="pv-ph" style="width:40px;height:52px;flex:0 0 40px;background:#D9D1C5;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6B5E4E;">PDF</span>
        <div style="flex:1;min-width:0;"><p style="font-size:13px;font-weight:500;color:#1E1B18;">${imgs ? `Rechnung · ${imgs} ${imgs === 1 ? 'Foto' : 'Fotos'} → PDF` : 'Rechnung · PDF'}</p><p style="font-size:11px;color:#9A8E7E;">${imgs ? `Invoice · ${imgs} ${imgs === 1 ? 'photo' : 'photos'} → PDF` : pvEsc((f[0] && f[0].name) || 'Invoice · PDF')}</p></div>
        <button type="button" data-src="clear" aria-label="Entfernen · remove" style="width:32px;height:32px;border-radius:16px;border:.5px solid #E0DAD0;background:#FDFCFA;color:#9A8E7E;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>
      </div>` : ''}
    <div class="pv-kv" style="margin-top:14px;">
      <div><label class="pv-lbl" for="pv-inv-amt" style="margin-bottom:4px;">Betrag <span class="en">Amount</span></label><input id="pv-inv-amt" class="cc-input" inputmode="decimal" placeholder="0,00 €" value="${pvEsc(_pvInv.amount)}" style="font-family:inherit;font-size:20px;font-weight:600;color:#1E1B18;"/></div>
      <div><label class="pv-lbl" for="pv-inv-date" style="margin-bottom:4px;">Datum <span class="en">Date</span></label><input id="pv-inv-date" class="cc-input" type="date" value="${pvEsc(_pvInv.date)}" style="font-family:inherit;"/></div>
    </div>
    <p style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11.5px;color:#6B5E4E;">${pvPic('inv_info', 14)}Nur Casa Castel sieht die Rechnung. · Only Casa Castel can see it.</p>
    <button class="pv-big${ready ? '' : ' pv-big--off'}" type="button" id="pv-inv-send" style="justify-content:center;margin-top:14px;"${ready ? '' : ' disabled'}><span class="pv-big__ico">${_pvInv.busy ? '<span class="pv-spin"></span>' : pvPic('inv_send', 20)}</span><span class="pv-big__txt" style="flex:0 1 auto;"><span class="pv-big__de">Senden</span><span class="pv-big__en">Send</span></span></button>
    <input type="file" id="pv-inv-file" style="display:none;"/>`;
  const amt = $id('pv-inv-amt'), dt = $id('pv-inv-date');
  amt.addEventListener('input', () => {
    _pvInv.amount = amt.value;
    const b = $id('pv-inv-send'), ok = _pvInv.files.length && ccParseEUR(_pvInv.amount) > 0;
    b.disabled = !ok; b.classList.toggle('pv-big--off', !ok);
  });
  dt.addEventListener('change', () => { _pvInv.date = dt.value; });
  dt.addEventListener('input', () => { _pvInv.date = dt.value; });
}
function _pvInvPick(kind) {
  const fi = $id('pv-inv-file');
  fi.value = '';
  fi.multiple = kind === 'lib';
  fi.accept = kind === 'file' ? 'application/pdf' : 'image/*';
  if (kind === 'cam') fi.setAttribute('capture', 'environment'); else fi.removeAttribute('capture');
  fi.onchange = () => {
    const picked = Array.from(fi.files || []);
    if (!picked.length) return;
    _pvInv.amount = $id('pv-inv-amt').value;
    if (kind === 'file' || picked.some(pvInvIsPdf)) _pvInv.files = [picked.find(pvInvIsPdf) || picked[0]];
    else _pvInv.files = (_pvInv.files.some(pvInvIsPdf) ? [] : _pvInv.files).concat(picked).slice(0, 10);
    _pvInvRender();
  };
  fi.click();
}
async function _pvInvSend() {
  const t = _pvInv.target, s = _pvState;
  if (_pvInv.busy || !t || !s || !s.job) return;
  const amount = ccParseEUR($id('pv-inv-amt').value);
  const date = $id('pv-inv-date').value || ccTodayISO();
  if (!_pvInv.files.length) { pvToast('Bitte Foto oder PDF wählen · Please add a photo or PDF'); return; }
  if (!(amount > 0)) { pvToast('Bitte Betrag eingeben · Please enter the amount'); return; }
  _pvInv.busy = true; _pvInv.amount = $id('pv-inv-amt').value; _pvInv.date = date; _pvInvRender();
  try {
    const blob = await pvInvMakePdf(_pvInv.files);
    const path = pvInvPath(s.job.id, t.month, t.visit ? 'termin' : 'monat');
    const up = await pvSupa.storage.from('provider-invoices').upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (up && up.error) { pvToast('Upload nicht möglich – nochmal versuchen · Upload failed – try again'); return; }
    const { data, error } = await pvRpc('pv_upload_invoice', { p_token: localStorage.getItem('pv_token'), p_visit: t.visit || null,
      p_month: t.visit ? null : t.month, p_amount: amount, p_date: date, p_path: path });
    if (_pvIsAuthError(error)) { _pvToLogin(); return; }
    if (error) { pvToast('Keine Verbindung · No connection'); return; }
    if (data && data.error) {
      const m = { closed: 'Monat abgeschlossen – Casa Castel muss ihn öffnen · Month closed', exists: 'Schon hochgeladen · Already uploaded',
                  mode: 'Keine Rechnung nötig · No invoice needed', not_allowed: 'Du sendest keine Rechnungen · You don\u2019t send invoices',
                  visit: 'Für diesen Termin nicht möglich · Not possible for this visit', amount: 'Betrag prüfen · Check the amount' };
      pvToast(m[data.error] || 'Schon geändert · Already changed');
      return;
    }
    pvCloseScrim('pv-inv-scrim');
    pvToast('✓ Hochgeladen · Uploaded');
    _pvLoad();
  } catch (e) {
    pvToast('Rechnung nicht lesbar – andere Datei? · Could not read it – another file?');
  } finally { _pvInv.busy = false; if (!$id('pv-inv-scrim').classList.contains('pv-hidden')) _pvInvRender(); }
}
document.addEventListener('DOMContentLoaded', () => {
  const body = document.getElementById('pv-inv-body');
  if (!body) return;
  body.addEventListener('click', e => {
    const src = e.target.closest('[data-src]');
    if (src) {
      const k = src.getAttribute('data-src');
      if (k === 'clear') { _pvInv.files = []; _pvInv.amount = $id('pv-inv-amt').value; _pvInvRender(); }
      else _pvInvPick(k);
      return;
    }
    if (e.target.closest('#pv-inv-send')) _pvInvSend();
  });
});
