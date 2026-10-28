'use strict';

/* ══════════════════════════════════════════════════════
   properties-sheet.js — the property pop-up (Oct 2026)
   One pop-up for everything, in the Settlements look (header tile · brown section labels · cards):
     new   → 4 fields: Name · Address · Purchase date (= Übergabe) · Kaufpreis, live Grunderwerbsteuer.
             Save → the same pop-up becomes the property: the Kauf checklist is created, "Added" seal once.
     view  → [KPIs + monthly payment — only with a loan] · Kauf · Finanzierung · Objekt · footer Edit.
             Add loan / Change loan, Yearly update and Objekt open inline — one at a time; unsaved
             changes are asked about, never lost silently.
     edit  → the full form for corrections (worked-out values are shown, not typed) · Delete.
   Worked out:
     · market value = the price at the start · Restschuld = the Darlehen at the start
     · Paid off = Darlehen − Restschuld (with a Bausparvertrag you type it — the loan isn't repaid directly)
     · Zinsen = Rate − Tilgung · Equity € = price + Kaufnebenkosten − Darlehen (only while it is empty)
     · rate status from "Fixed rate until": within 6 months amber, within 3 months or passed red —
       also checked on every app start, so the dashboard alert stays current
   The purchase date is the Übergabe: Controlling expects costs and rent from that month, Settlements
   leaves the periods before it to the seller.
══════════════════════════════════════════════════════ */

const PS = { mode: 'view', open: null, dirty: false, justAdded: null, busy: false, skipPop: false };
const psEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const psNum = v => Number(v) || 0;
const psR2 = v => Math.round((Number(v) || 0) * 100) / 100;
const psToday = () => (typeof ccTodayISO === 'function' ? ccTodayISO() : new Date().toISOString().slice(0, 10));
const psProp = id => (window._props || []).find(x => String(x.id) === String(id)) || null;
const psHasLoan = p => !!p && (psNum(p.darlehen) > 0 || psNum(p.rate) > 0);
const psDash = v => (v === null || v === undefined || v === '' || v === '—' ? '' : String(v));
const psPct = v => (typeof ccFmtNum === 'function' ? ccFmtNum(psNum(v), 2) : String(v)) + '\u00a0%';

/* any date text (ISO or TT.MM.JJJJ) → ISO, else '' */
function psIso(v) {
  const s = psDash(v).trim();
  if (!s) return '';
  if (typeof ccParseDate === 'function') { try { const d = ccParseDate(s, true); if (d) return d; } catch (e) {} }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}
/* "Fixed rate until": a date, MM/JJJJ or a year ("bis 2036") → a day */
function psZbIso(zb) {
  const iso = psIso(zb);
  if (iso) return iso;
  const s = psDash(zb);
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);                         // "bis 15.06.2030"
  if (m) { const d = psIso(m[1] + '.' + m[2] + '.' + m[3]); if (d) return d; }
  m = s.match(/\b(\d{1,2})[./](\d{4})\b/);
  if (m) return new Date(Date.UTC(Number(m[2]), Number(m[1]), 0)).toISOString().slice(0, 10);
  m = s.match(/\b((?:19|20)\d{2})\b/);
  return m ? m[1] + '-12-31' : '';
}
function psZbStatus(zb) {
  const iso = psZbIso(zb);
  if (!iso) return null;
  const days = (Date.parse(iso + 'T12:00:00Z') - Date.parse(psToday() + 'T12:00:00Z')) / 864e5;
  return days <= 92 ? 'red' : days <= 183 ? 'amber' : 'ok';
}
const psZbText = p => { const iso = psIso(p.zb); return iso ? ccFmtDate(iso) : (psDash(p.zb) || '—'); };
const psCity = p => { const m = psDash(p.addr).match(/\b\d{5}\s+([^,]+)/); return m ? m[1].trim() : ''; };
const psRestUntouched = p => !(psNum(p.restschuld) > 0) || (!psIso(p.restschuld_date) && psR2(p.restschuld) === psR2(p.darlehen));
const psMonthStart = iso => String(iso || psToday()).slice(0, 8) + '01';
function psFirstRateDefault(p) {                       // the month after the Übergabe (else this month)
  const k = psIso(p.kaufdatum);
  if (!k) return psMonthStart(psToday());
  const d = new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 1));
  return d.toISOString().slice(0, 10);
}

/* The rate status follows the date on every app start (the dashboard reads the stored status) */
async function psAutoStatus() {                       // → how many changed (then the page is drawn again)
  let changed = 0;
  for (const p of (window._props || [])) {
    const want = psHasLoan(p) ? psZbStatus(p.zb) : 'ok';
    if (!want || want === p.zb_status) continue;
    try { const d = await updateProperty(p.id, { zb_status: want }); Object.assign(p, d || {}, { zb_status: want }); changed++; }
    catch (e) { console.warn('[properties] rate status', e); }
  }
  return changed;
}

/* ── The app's own question (instead of the browser's) ── */
function propConfirm(title, desc, ok, danger) {
  return new Promise(res => {
    const ov = document.getElementById('confirmOverlay');
    if (!ov) { res(window.confirm(title + (desc ? '\n\n' + desc : ''))); return; }
    ov.querySelector('.confirm-box__title').textContent = title;
    document.getElementById('confirmDesc').textContent = desc || '';
    const okBtn = document.getElementById('confirmOkBtn'), cancel = ov.querySelector('.btn-cf-cancel');
    okBtn.textContent = ok || 'OK';
    okBtn.classList.toggle('is-safe', !danger);
    const done = v => { ov.classList.remove('open'); okBtn.onclick = null; cancel.onclick = null; res(v); };
    okBtn.onclick = () => done(true);
    cancel.onclick = () => done(false);
    ov.classList.add('open');
  });
}

/* ── Open · close (the back gesture closes it once) ── */
function psOpenOverlay() {
  const ov = document.getElementById('detailOverlay');
  if (ov.classList.contains('open')) return;
  try { history.pushState({ modal: 'detail' }, ''); } catch (e) {}
  ov.classList.add('open');
}
async function closeDetail(fromPop) {
  if (PS.dirty && !(await propConfirm('Discard the changes?', 'What you typed in this pop-up is not saved yet.', 'Discard', true))) {
    if (fromPop) { try { history.pushState({ modal: 'detail' }, ''); } catch (e) {} }
    return;
  }
  PS.dirty = false; PS.open = null; PS.mode = 'view'; PS.justAdded = null;
  if (typeof KNK !== 'undefined') KNK.open = null;
  document.getElementById('detailOverlay').classList.remove('open');
  _pid = null; _editing = false;
  if (!fromPop && history.state && history.state.modal === 'detail') { PS.skipPop = true; try { history.back(); } catch (e) { PS.skipPop = false; } }
}
window.addEventListener('popstate', () => {
  if (PS.skipPop) { PS.skipPop = false; return; }
  const ov = document.getElementById('detailOverlay');
  if (ov && ov.classList.contains('open')) closeDetail(true);
});
function openDetail(id) {
  const p = psProp(id);
  if (!p) return;
  _pid = p.id; _editing = false;
  PS.mode = 'view'; PS.open = null; PS.dirty = false;
  if (PS.justAdded !== p.id) PS.justAdded = null;
  psRender();
  psOpenOverlay();
}
function openAdd() {
  _pid = null; _editing = false;
  PS.mode = 'new'; PS.open = null; PS.dirty = false; PS.justAdded = null;
  psRender();
  psOpenOverlay();
}
/* knkRender and older code call these */
function renderView(p) {
  if (!p || PS.mode !== 'view' || String(p.id) !== String(_pid)) return;
  if (PS.open) {                                  // a form is open: redraw only the Kauf list — never the form
    const box = document.getElementById('psKnk');
    if (box && typeof knkSectionHTML === 'function') box.innerHTML = knkSectionHTML(p);
    return;
  }
  psRender();
}
function toggleEdit() { if (PS.mode === 'edit') { PS.mode = 'view'; _editing = false; } else { PS.mode = 'edit'; _editing = true; } PS.dirty = false; psRender(); }
/* An inline form is open with changes → ask first. true = it may close */
async function psCloseInline() {
  if (PS.open && PS.dirty && !(await propConfirm('Discard the changes?', 'What you typed here is not saved yet.', 'Discard', true))) return false;
  PS.open = null; PS.dirty = false;
  return true;
}

/* ── What a form showed when it opened (only real changes are saved) ── */
function psSnap(root) {
  const s = {};
  if (!root) return s;
  root.querySelectorAll('input[id], select[id]').forEach(el => { s[el.id] = el.value; });
  root.querySelectorAll('.ps-tg[id]').forEach(b => { s[b.id] = b.classList.contains('on'); });
  return s;
}
function psChanged(id) {
  const el = document.getElementById(id);
  if (!el || !PS.snap || !(id in PS.snap)) return false;
  if (el.classList.contains('ps-tg')) return el.classList.contains('on') !== PS.snap[id];
  if (el.dataset && el.dataset.ccNum) {
    const a = parseFloat(el.value), b = parseFloat(PS.snap[id]);
    return (isFinite(a) ? psR2(a) : null) !== (isFinite(b) ? psR2(b) : null);
  }
  return String(el.value ?? '').trim() !== String(PS.snap[id] ?? '').trim();
}

/* ── Pieces (the same everywhere) ── */
function psField(id, label, kind, value, ph) {
  const v = value === null || value === undefined ? '' : value;
  const inp = kind === 'num'  ? '<input class="cc-input" id="' + id + '" type="number" data-cc-num="2" inputmode="decimal" value="' + psEsc(v) + '"/>'
            : kind === 'm2'   ? '<input class="cc-input" id="' + id + '" type="number" data-cc-num="auto" inputmode="decimal" value="' + psEsc(v) + '"/>'
            : kind === 'date' ? '<input class="cc-input" id="' + id + '" type="date" value="' + psEsc(v) + '"/>'
            : '<input class="cc-input" id="' + id + '" autocomplete="off" value="' + psEsc(v) + '" placeholder="' + psEsc(ph || '') + '"/>';
  return '<div class="ps-f"><label for="' + id + '">' + label + '</label>' + inp + '</div>';
}
const psRO = (label, value, note, id, hidden) => '<div class="ps-f"' + (id ? ' id="' + id + '-box"' : '') + (hidden ? ' hidden' : '') + '><span class="ps-f__l">' + label + '</span>' +
  '<div class="ps-ro"><span' + (id ? ' id="' + id + '"' : '') + '>' + value + '</span>' + (note ? '<small>' + note + '</small>' : '') + '</div></div>';
const psSwitch = (id, title, sub, on) => '<div class="ps-sw"><div class="ps-sw__m"><span class="ps-sw__t">' + title + '</span><span class="ps-sw__s">' + sub + '</span></div>' +
  '<button type="button" class="ps-tg' + (on ? ' on' : '') + '" id="' + id + '" data-ps="tg" role="switch" aria-checked="' + !!on + '" aria-label="' + psEsc(title) + '"></button></div>';
const psSwitchVal = id => { const b = document.getElementById(id); return !!(b && b.classList.contains('on')); };
const psLabel = (icon, text, extra) => '<p class="ps-l"><i class="ti ' + icon + '" aria-hidden="true"></i>' + text + (extra || '') + '</p>';
const psBtns = save => '<div class="ps-bts"><button type="button" class="ps-btn" data-ps="cancelInline">Cancel</button><button type="button" class="ps-btn ps-btn--p" data-ps="' + save + '">Save</button></div>';
function psCatSelect(id, cur) {
  const opts = (typeof CAT_OPTIONS !== 'undefined' ? CAT_OPTIONS : []).slice();
  if (cur && !opts.includes(cur)) opts.unshift(cur);
  return '<select class="cc-select" id="' + id + '">' + (cur ? '' : '<option value="" selected>Choose</option>') +
    opts.map(o => '<option' + (o === cur ? ' selected' : '') + '>' + psEsc(o) + '</option>').join('') + '</select>';
}

/* ── Render ── */
function psHead(title, sub) {
  document.getElementById('det-name').textContent = title;
  document.getElementById('det-no').textContent = sub;
}
function psFoot(html) { const f = document.getElementById('detFoot'); if (f) f.innerHTML = html; }
function psRender() {
  const view = document.getElementById('viewMode'), edit = document.getElementById('editMode');
  if (!view || !edit) return;
  if (PS.mode === 'new') {
    const next = (window._props || []).reduce((m, x) => Math.max(m, psNum(x.sort_order)), 0) + 1;
    psHead('New property', 'Will be No. ' + String(next).padStart(2, '0') + ' in your portfolio');
    view.innerHTML = psNewHTML(); view.classList.add('show');
    edit.innerHTML = ''; edit.classList.remove('show');
    psFoot('<button type="button" class="ps-pb" data-ps="cancelNew">Cancel</button><button type="button" class="ps-pb ps-pb--p" id="psNewSave" data-ps="saveNew" disabled>Save</button>');
    psNewSync();
    return;
  }
  const p = psProp(_pid);
  if (!p) return;
  psHead(p.name, ['No. ' + String(p.sort_order).padStart(2, '0'), psCity(p) || psDash(p.cat)].filter(Boolean).join(' · '));
  if (PS.mode === 'edit') {
    edit.innerHTML = psEditHTML(p); edit.classList.add('show');
    view.classList.remove('show');
    PS.snap = psSnap(edit); PS.restFollow = null;
    psFoot('<button type="button" class="ps-pb" data-ps="cancelEdit">Cancel</button><button type="button" class="ps-pb ps-pb--p" data-ps="saveEdit">Save</button>');
    return;
  }
  view.innerHTML = psViewHTML(p); view.classList.add('show');
  edit.innerHTML = ''; edit.classList.remove('show');
  psFoot('<button type="button" class="ps-pb" data-ps="edit">Edit</button>');
  PS.snap = PS.open ? psSnap(view.querySelector('[data-psform]')) : null;
  psCalc();
}

/* New: 4 fields */
function psNewHTML() {
  return psLabel('ti-home', 'Objekt') + '<div class="ps-d">' +
    '<div class="ps-f"><label for="psN-name">Name *</label><input class="cc-input" id="psN-name" data-psn autocomplete="off" placeholder="z. B. Goethestr. 12"/></div>' +
    '<div class="ps-f"><label for="psN-addr">Address</label><input class="cc-input" id="psN-addr" data-psn autocomplete="off" placeholder="Street No., PLZ City"/></div>' +
    '<div class="ps-g"><div class="ps-f"><label for="psN-date">Purchase date (Übergabe)</label><input class="cc-input" id="psN-date" type="date" data-psn/></div>' +
      '<div class="ps-f"><label for="psN-price">Kaufpreis €</label><input class="cc-input" id="psN-price" type="number" data-cc-num="2" inputmode="decimal" data-psn/></div></div>' +
    '<div class="ps-live is-off" id="psN-live"><i class="ti ti-building-bank" aria-hidden="true"></i><span>Grunderwerbsteuer shows up here</span></div></div>' +
    '<p class="ps-note">m², the loan and the costs come later, in the property.</p>';
}
function psNewSync() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const btn = document.getElementById('psNewSave');
  if (btn) btn.disabled = !g('psN-name').trim() || PS.busy;
  const live = document.getElementById('psN-live');
  if (!live) return;
  const price = parseFloat(g('psN-price')), addr = g('psN-addr');
  if (!(price > 0)) { live.classList.add('is-off'); live.querySelector('span').textContent = 'Grunderwerbsteuer shows up here'; return; }
  const rate = typeof knkRate === 'function' ? knkRate({ addr }) : 5;
  const where = psCity({ addr }) || (rate === 6 ? 'Hessen' : 'Rheinland-Pfalz');
  live.classList.remove('is-off');
  live.querySelector('span').textContent = '+ Grunderwerbsteuer ' + eur(psR2(price * rate / 100)) + ' (' + psPct(rate).replace(',00', '') + ', ' + where + ')';
}
async function psSaveNew(btn) {
  if (PS.busy) return;
  const g = id => (document.getElementById(id) || {}).value || '';
  const name = g('psN-name').trim();
  if (!name) return knkSay('Add a name first');
  const price = parseFloat(g('psN-price')), kp = isFinite(price) && price > 0 ? psR2(price) : 0;
  PS.busy = true; if (btn) btn.disabled = true; showLoading(true);
  let created = null;
  try {
    const sort = await getNextSortOrder();
    created = await addProperty({
      sort_order: sort, name, addr: g('psN-addr').trim() || '—', cat: '', m2: 0, kaufdatum: g('psN-date') || '—',
      kaufpreis: kp, ek: 0, nebenkosten: 0, marktwert: kp, darlehen: 0, restschuld: 0, abbezahlt: 0,
      bank: '—', darlehensnr: '—', zinssatz: 0, zb: '—', zb_status: 'ok', rate: 0, tilgung: 0, zinsen: 0, sparv: false,
    });
  } catch (e) {
    knkSay('Not saved — ' + (e.message || e));
    PS.busy = false; showLoading(false); psNewSync();
    return;
  }
  // Saved. From here on the pop-up is the property — a hiccup while reloading never offers a 2nd Save
  PS.dirty = false; PS.mode = 'view'; PS.justAdded = created.id; _pid = created.id;
  let reloaded = true;
  try { window._props = await fetchAll(); }
  catch (e) { reloaded = false; window._props = (window._props || []).filter(x => String(x.id) !== String(created.id)).concat([created]); }
  try {
    const p = psProp(created.id);
    if (p && typeof knkStart === 'function' && typeof KNK !== 'undefined' && KNK.loaded && !KNK.missing) await knkStart(p, { loanLater: true });   // the checklist, ready (Grundschuld rows expected: the loan comes later)
  } catch (e) { console.warn('[properties] checklist', e); }
  PS.busy = false; showLoading(false);
  renderAll(); psRender();
  if (!reloaded) setTimeout(async () => {                            // try the reload once more, quietly
    try { window._props = await fetchAll(); renderAll(); renderView(psProp(_pid)); } catch (e) {}
  }, 2500);
}

/* View */
function psViewHTML(p) {
  const seal = PS.justAdded === p.id
    ? '<div class="ps-seal"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i><div><b>Added to your portfolio</b><span>Next: the costs when the invoices come, and the loan</span></div></div>' : '';
  return seal + (psHasLoan(p) ? psKpisHTML(p) : '') + '<div id="psKnk">' + (typeof knkSectionHTML === 'function' ? knkSectionHTML(p) : '') + '</div>' + psFinHTML(p) + psObjHTML(p);
}
function psKpisHTML(p) {
  const equity = psNum(p.marktwert) - psNum(p.restschuld);
  const rate = psNum(p.rate), tPct = rate > 0 ? psR2(psNum(p.tilgung) / rate * 100) : 0, zPct = rate > 0 ? psR2(100 - tPct) : 0;
  return '<div class="mod-kpis">' +
      '<div class="mod-kpi"><div class="mod-kpi__lbl">Restschuld</div><div class="mod-kpi__val">' + mio(p.restschuld) + '</div><div class="ps-kpi__s">of ' + eur(p.darlehen) + '</div></div>' +
      '<div class="mod-kpi"><div class="mod-kpi__lbl">Equity</div><div class="mod-kpi__val mod-kpi__val--gold">' + mio(equity) + '</div><div class="ps-kpi__s">Value ' + mio(p.marktwert) + '</div></div>' +
      '<div class="mod-kpi"><div class="mod-kpi__lbl">Interest</div><div class="mod-kpi__val">' + psPct(p.zinssatz) + '</div><div class="ps-kpi__s">until ' + psEsc(psZbText(p)) + '</div></div></div>' +
    (rate > 0 ? '<div class="mod-rate"><div class="mod-rate__hdr"><span class="mod-rate__lbl">Monthly payment</span><span class="mod-rate__total">' + eur(rate) + '</span></div>' +
      '<div class="mod-rate__parts"><div class="mod-rate__part mod-rate__part--t"><div class="mod-rate__part-lbl">Tilgung</div><div class="mod-rate__part-val">' + eur(p.tilgung) + '</div><div class="mod-rate__part-pct">' + psPct(tPct) + ' of payment</div></div>' +
      '<div class="mod-rate__part mod-rate__part--z"><div class="mod-rate__part-lbl">Zinsen</div><div class="mod-rate__part-val">' + eur(p.zinsen) + '</div><div class="mod-rate__part-pct">' + psPct(zPct) + ' of payment</div></div></div>' +
      '<div class="mini-rb"><div class="mini-rb-t" style="width:' + tPct + '%"></div><div class="mini-rb-z" style="width:' + zPct + '%"></div></div></div>' : '');
}
function psFinHTML(p) {
  if (PS.open === 'loan') return psLabel('ti-building-bank', 'Finanzierung') + psLoanFormHTML(p);
  if (PS.open === 'year') return psLabel('ti-building-bank', 'Finanzierung') + psYearFormHTML(p);
  if (!psHasLoan(p)) {
    return psLabel('ti-building-bank', 'Finanzierung') + '<div class="ps-c"><div class="ps-c__h"><span class="ps-c__l">Darlehen</span><span class="ps-c__t ps-nil">—</span></div>' +
      '<div class="ps-c__s">No loan yet · add it when the bank contract is there</div>' +
      '<button type="button" class="ps-btn" data-ps="open" data-v="loan"><i class="ti ti-plus" aria-hidden="true"></i>Add loan</button></div>';
  }
  const dar = psNum(p.darlehen), paid = psNum(p.abbezahlt), pct = dar > 0 ? psR2(paid / dar * 100) : 0;
  const st = p.zb_status === 'red' ? '<span class="ps-pill ps-pill--red">urgent</span>' : p.zb_status === 'amber' ? '<span class="ps-pill ps-pill--amber">within 6 months</span>' : '';
  const nr = psDash(p.darlehensnr);
  return psLabel('ti-building-bank', 'Finanzierung', '<button type="button" class="ps-lk" data-ps="open" data-v="year">Yearly update</button>') +
    '<div class="ps-d ps-sum">' + psEsc(psDash(p.bank) || 'Bank') + ' · Darlehen <b>' + eur(dar) + '</b>' +
      '<br>' + psPct(p.zinssatz) + ' · fixed until ' + psEsc(psZbText(p)) + ' ' + st +
      '<br><small>Rate ' + eur(p.rate) + ' · Tilgung ' + eur(p.tilgung) + ' · Zinsen ' + eur(p.zinsen) + (p.sparv ? ' · Bausparvertrag' : '') + (nr ? ' · Nr. ' + psEsc(nr) : '') + '</small>' +
      '<div class="ps-prog"><i style="width:' + Math.min(100, Math.max(pct, 0.5)) + '%"></i></div>' +
      '<small>' + psPct(pct) + ' paid off · ' + eur(paid) + ' of ' + eur(dar) + (psIso(p.restschuld_date) ? ' · Stand ' + ccFmtDate(psIso(p.restschuld_date)) : '') + '</small>' +
      '<div class="ps-sum__a"><button type="button" class="ps-lk" data-ps="open" data-v="loan">Change loan</button></div></div>';
}
function psLoanFormHTML(p) {
  const first = !psHasLoan(p), v = x => (first || !psNum(x) ? '' : x);
  return '<div class="ps-d" data-psform="loan">' +
    '<div class="ps-g">' + psField('psL-bank', 'Bank', 'text', first ? '' : psDash(p.bank), 'z. B. Sparkasse') + psField('psL-dar', 'Darlehen €', 'num', v(p.darlehen)) + '</div>' +
    '<div class="ps-g">' + psField('psL-zins', 'Zinssatz %', 'num', v(p.zinssatz)) + psField('psL-zb', 'Fixed rate until', 'date', first ? '' : psZbIso(p.zb)) + '</div>' +
    '<div class="ps-g">' + psField('psL-rate', 'Monatsrate €', 'num', v(p.rate)) + psField('psL-tilg', 'Tilgung €/Mo', 'num', v(p.tilgung)) + '</div>' +
    '<div class="ps-g">' + psField('psL-nr', 'Darlehensnr.', 'text', first ? '' : psDash(p.darlehensnr), 'optional') +
      psField('psL-from', first ? 'First rate on' : 'Changes valid from', 'date', first ? psFirstRateDefault(p) : psMonthStart(psToday())) + '</div>' +
    '<p class="ps-sm" id="psL-calc"></p>' +
    psSwitch('psL-sparv', 'Bausparvertrag', 'the Tilgung goes into a savings contract', !!p.sparv) +
    psBtns('saveLoan') + '</div>';
}
function psYearFormHTML(p) {
  return '<div class="ps-d" data-psform="year"><p class="ps-sm ps-sm--top">Once a year · from the bank statement</p>' +
    '<div class="ps-g">' + psField('psY-rest', 'Restschuld €', 'num', p.restschuld) + psField('psY-date', 'Stand', 'date', psIso(p.restschuld_date) || psToday()) + '</div>' +
    (p.sparv ? psField('psY-paid', 'Paid off € (Bausparvertrag)', 'num', p.abbezahlt) : '') +
    psField('psY-mw', 'Market value €', 'num', p.marktwert) +
    '<p class="ps-sm" id="psY-calc"></p>' + psBtns('saveYear') + '</div>';
}
function psObjHTML(p) {
  if (PS.open === 'obj') {
    return psLabel('ti-home', 'Objekt') + '<div class="ps-d" data-psform="obj"><div class="ps-g ps-g--w">' +
      '<div class="ps-f"><label for="psO-cat">Type</label>' + psCatSelect('psO-cat', psDash(p.cat)) + '</div>' +
      psField('psO-m2', 'm²', 'm2', psNum(p.m2) > 0 ? p.m2 : '') + '</div>' + psBtns('saveObj') + '</div>';
  }
  const has = psDash(p.cat) && psNum(p.m2) > 0;
  const addr = psDash(p.addr), kd = psIso(p.kaufdatum);
  const line2 = [addr, kd ? 'Übergabe ' + ccFmtDate(kd) : ''].filter(Boolean).join(' · ');
  return psLabel('ti-home', 'Objekt') + '<button type="button" class="ps-d ps-sum ps-tap" data-ps="open" data-v="obj">' +
    (has ? psEsc(psDash(p.cat) + ' · ' + ccM2(p.m2) + ' m²') + (line2 ? '<br><small>' + psEsc(line2) + '</small>' : '')
         : psEsc(line2 || p.name) + '<br><small class="ps-warn">' + (psDash(p.cat) ? 'm² missing' : psNum(p.m2) > 0 ? 'Type missing' : 'm² and type missing') + ' · tap to add</small>') +
    '<i class="ti ti-chevron-right ps-tap__c" aria-hidden="true"></i></button>';
}
/* Live "worked out" lines in the open form */
function psCalc() {
  const p = psProp(_pid), g = id => { const el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; };
  const lc = document.getElementById('psL-calc');
  if (lc && p) {
    const rate = g('psL-rate'), tilg = g('psL-tilg'), dar = g('psL-dar');
    const bits = [];
    if (rate > 0 && isFinite(tilg)) bits.push('Zinsen ' + eur(psR2(rate - tilg)) + ' / Mo');
    if (dar > 0 && (!psHasLoan(p) || (psChanged('psL-dar') && psRestUntouched(p)))) bits.push('Restschuld = ' + eur(dar));
    lc.textContent = bits.length ? bits.join(' · ') + ' · worked out' : 'Zinsen = Monatsrate − Tilgung · worked out';
    lc.classList.toggle('ps-warn', rate > 0 && tilg > rate);
    if (rate > 0 && tilg > rate) lc.textContent = 'The Tilgung is more than the Monatsrate';
  }
  const yc = document.getElementById('psY-calc');
  if (yc && p) {
    const rest = g('psY-rest'), mw = g('psY-mw');
    const paid = p.sparv ? g('psY-paid') : psNum(p.darlehen) - rest;
    const bits = [];
    if (isFinite(paid)) bits.push('Paid off ' + eur(psR2(Math.max(0, paid))));
    if (isFinite(mw) && isFinite(rest)) bits.push('Equity ' + eur(psR2(mw - rest)));
    yc.textContent = bits.length ? bits.join(' · ') + ' · worked out' : '';
  }
  if (PS.mode === 'edit' && p) {
    const ez = document.getElementById('e-zinsen-ro');
    if (ez) { const r = g('e-rate'), t = g('e-tilgung'); ez.textContent = eur((psChanged('e-rate') || psChanged('e-tilgung')) && isFinite(r) && isFinite(t) ? psR2(r - t) : p.zinsen); }
    const re = document.getElementById('e-restschuld'), d = g('e-darlehen');
    if (re && psChanged('e-darlehen') && psRestUntouched(p) && PS.restFollow !== false && isFinite(d)) {   // Restschuld follows the Darlehen
      PS.setting = true; try { re.value = String(d); } finally { PS.setting = false; }
      PS.restFollow = true;
    }
    const sp = psSwitchVal('e-sparv'), auto = document.getElementById('e-paid-ro-box'), typed = document.getElementById('e-paid-typed');
    if (auto && typed) { auto.hidden = sp; typed.hidden = !sp; }
    const ep = document.getElementById('e-paid-ro');
    if (ep && !sp) {
      const dd = g('e-darlehen'), rr = g('e-restschuld');
      const ch = psChanged('e-darlehen') || psChanged('e-restschuld') || psChanged('e-sparv');
      ep.textContent = eur(ch && isFinite(dd) && isFinite(rr) && (rr > 0 || dd === 0) ? psR2(Math.max(0, dd - rr)) : p.abbezahlt);
    }
  }
}

/* ── Saves ── */
async function psSaveProp(p, fields, msg, history) {
  PS.busy = true; showLoading(true);
  try {
    await updateProperty(p.id, fields);
    let warn = false;
    if (history) {                                   // the rate date for Controlling (after the property is saved)
      try { await _propSaveLoanHistory(p.id, p, Object.assign({}, p, fields), history); }
      catch (e) { console.warn('[properties] loan history', e); warn = true; }
    }
    try { window._props = await fetchAll(); } catch (e) { Object.assign(p, fields); }
    PS.open = null; PS.dirty = false; PS.snap = null;
    renderAll(); psRender();
    if (warn) knkSay((msg || 'Saved') + ' — but the rate date for Controlling could not be saved', 7000);
    else if (msg) knkSay(msg);
    return true;
  } catch (e) { knkSay('Not saved — ' + (e.message || e)); return false; }
  finally { PS.busy = false; showLoading(false); }
}
/* f = the property with the changes (merged) */
const psTermsChanged = (p, f) => ['rate', 'tilgung', 'zinsen'].some(k => psR2(f[k]) !== psR2(p[k])) || _propDebitOf(f) !== _propDebitOf(p);
async function psSaveLoan() {
  const p = psProp(_pid);
  if (!p || PS.busy) return;
  const val = id => (document.getElementById(id) || {}).value || '';
  const num = id => { const x = parseFloat(val(id)); return isFinite(x) ? psR2(x) : 0; };
  const dar = num('psL-dar'), rate = num('psL-rate'), tilg = num('psL-tilg');
  if (!(dar > 0)) { knkSay('Add the Darlehen first'); return; }
  if (rate > 0 && tilg > rate) { knkSay('The Tilgung can’t be more than the Monatsrate'); return; }
  const first = !psHasLoan(p), zbIso = val('psL-zb'), sparv = psSwitchVal('psL-sparv');
  const f = {}, put = (key, id, v) => { if (first || psChanged(id)) f[key] = v; };
  put('bank', 'psL-bank', val('psL-bank').trim() || '—');
  put('darlehensnr', 'psL-nr', val('psL-nr').trim() || '—');
  put('darlehen', 'psL-dar', dar);
  put('zinssatz', 'psL-zins', num('psL-zins'));
  put('zb', 'psL-zb', zbIso ? ccFmtDate(zbIso) : '—');
  put('rate', 'psL-rate', rate);
  put('tilgung', 'psL-tilg', tilg);
  put('sparv', 'psL-sparv', sparv);
  if ('rate' in f || 'tilgung' in f) f.zinsen = psR2(rate - tilg);
  if (first || ('darlehen' in f && psRestUntouched(p))) f.restschuld = dar;
  const rest = 'restschuld' in f ? f.restschuld : psNum(p.restschuld);
  if (!sparv && (first || 'darlehen' in f || 'restschuld' in f || 'sparv' in f)) f.abbezahlt = psR2(Math.max(0, dar - rest));
  if ((first || 'darlehen' in f) && !(psNum(p.ek) > 0)) {
    const knk = typeof knkHas === 'function' && knkHas(p) ? knkSum(p).total : psNum(p.nebenkosten);
    f.ek = psR2(Math.max(0, psNum(p.kaufpreis) + knk - dar));
  }
  if (first || 'zb' in f) f.zb_status = psZbStatus(f.zb) || (first || f.zb === '—' ? 'ok' : p.zb_status || 'ok');
  if (!Object.keys(f).length) { PS.open = null; PS.dirty = false; PS.snap = null; psRender(); return; }   // nothing changed
  const from = psMonthStart(val('psL-from') || psToday());
  await psSaveProp(p, f, first ? 'Loan saved' : 'Loan changed', psTermsChanged(p, Object.assign({}, p, f)) ? from : null);
}
async function psSaveYear() {
  const p = psProp(_pid);
  if (!p || PS.busy) return;
  const val = id => (document.getElementById(id) || {}).value || '';
  const rest = parseFloat(val('psY-rest')), mw = parseFloat(val('psY-mw'));
  if (!isFinite(rest) || rest < 0) { knkSay('Enter the Restschuld'); return; }
  const f = { restschuld: psR2(rest), restschuld_date: val('psY-date') || null, marktwert: isFinite(mw) && mw > 0 ? psR2(mw) : psNum(p.marktwert) };
  if (p.sparv) { const pd = parseFloat(val('psY-paid')); f.abbezahlt = isFinite(pd) ? psR2(pd) : psNum(p.abbezahlt); }
  else f.abbezahlt = psR2(Math.max(0, psNum(p.darlehen) - f.restschuld));
  await psSaveProp(p, f, 'Updated');
}
async function psSaveObj() {
  const p = psProp(_pid);
  if (!p || PS.busy) return;
  const cat = (document.getElementById('psO-cat') || {}).value || '', m2 = parseFloat((document.getElementById('psO-m2') || {}).value);
  await psSaveProp(p, { cat, m2: isFinite(m2) && m2 > 0 ? psR2(m2) : 0 }, 'Saved');
}

/* ── Edit: the full form for corrections ── */
function psEditHTML(p) {
  const listSum = typeof knkTotalNote === 'function' && knkTotalNote(p) === 'sum of the Kauf list';
  const debit = p.bank_debit || (p.sparv ? 'split' : 'rate');
  return psLabel('ti-home', 'Objekt') + '<div class="ps-d">' +
      psField('e-name', 'Name *', 'text', p.name) +
      '<div class="ps-g ps-g--w"><div class="ps-f"><label for="e-cat">Type</label>' + psCatSelect('e-cat', psDash(p.cat)) + '</div>' + psField('e-m2', 'm²', 'm2', psNum(p.m2) > 0 ? p.m2 : '') + '</div>' +
      psField('e-addr', 'Address', 'text', psDash(p.addr), 'Street No., PLZ City') +
      psField('e-kaufdatum', 'Purchase date (Übergabe)', 'date', psIso(p.kaufdatum)) + '</div>' +
    psLabel('ti-coins', 'Kauf') + '<div class="ps-d"><div class="ps-g">' +
      psField('e-kaufpreis', 'Kaufpreis €', 'num', p.kaufpreis) + psField('e-marktwert', 'Market value €', 'num', p.marktwert) + '</div><div class="ps-g">' +
      (listSum ? psRO('Acquisition costs', eur(p.nebenkosten), 'Kauf list') : psField('e-nebenkosten', 'Acquisition costs €', 'num', p.nebenkosten)) +
      psField('e-ek', 'Eigenkapital €', 'num', p.ek) + '</div></div>' +
    psLabel('ti-building-bank', 'Finanzierung') + '<div class="ps-d"><div class="ps-g">' +
      psField('e-bank', 'Bank', 'text', psDash(p.bank)) + psField('e-darlehensnr', 'Darlehensnr.', 'text', psDash(p.darlehensnr), 'optional') + '</div><div class="ps-g">' +
      psField('e-darlehen', 'Darlehen €', 'num', p.darlehen) + psField('e-restschuld', 'Restschuld €', 'num', p.restschuld) + '</div><div class="ps-g">' +
      psField('e-restschuld-date', 'Restschuld as of', 'date', psIso(p.restschuld_date)) +
      '<div class="ps-f"><label for="e-bank-debit">Bank debits</label><select class="cc-select" id="e-bank-debit">' +
        '<option value="rate"' + (debit === 'rate' ? ' selected' : '') + '>One Kreditrate</option><option value="split"' + (debit === 'split' ? ' selected' : '') + '>Zinsen + Tilgung</option></select></div></div><div class="ps-g">' +
      psField('e-zinssatz', 'Zinssatz %', 'num', p.zinssatz) + psField('e-zb', 'Fixed rate until', 'date', psZbIso(p.zb)) + '</div>' +
      (psHasLoan(p) && !psZbIso(p.zb) ? '<div class="ps-g"><div class="ps-f"><label for="e-zb-status">Rate status</label><select class="cc-select" id="e-zb-status">' +
        [['ok', 'OK'], ['amber', 'Within 6 months'], ['red', 'Urgent']].map(([v, t]) => '<option value="' + v + '"' + ((p.zb_status || 'ok') === v ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select></div><p class="ps-sm ps-sm--side">Set by hand — “' + psEsc(psDash(p.zb) || '—') + '” isn’t a date</p></div>' : '') +
      '<div class="ps-g">' +
      psField('e-rate', 'Monatsrate €', 'num', p.rate) + psField('e-tilgung', 'Tilgung €/Mo', 'num', p.tilgung) + '</div><div class="ps-g">' +
      psRO('Zinsen €/Mo', eur(p.zinsen), 'worked out', 'e-zinsen-ro') +
      psRO('Paid off €', eur(p.abbezahlt), 'worked out', 'e-paid-ro', !!p.sparv) +
      '<div class="ps-f" id="e-paid-typed"' + (p.sparv ? '' : ' hidden') + '><label for="e-abbezahlt">Paid off €</label>' +
        '<input class="cc-input" id="e-abbezahlt" type="number" data-cc-num="2" inputmode="decimal" value="' + psEsc(p.abbezahlt) + '"/></div></div>' +
      psSwitch('e-sparv', 'Bausparvertrag', 'the Tilgung goes into a savings contract', !!p.sparv) +
      '<div class="ps-g">' + psField('e-valid-from', 'Rate changes valid from', 'date', psMonthStart(psToday())) +
        '<p class="ps-sm ps-sm--side">Earlier months in Controlling keep the old rate</p></div></div>' +
    '<button type="button" class="ps-del" data-ps="delete">Delete property</button>';
}
async function saveEdit() {
  const p = psProp(_pid);
  if (!p || PS.busy) return;
  const g = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const nz = id => { const v = parseFloat(g(id)); return isFinite(v) ? psR2(v) : 0; };
  const name = String(g('e-name') || '').trim();
  if (!name) { knkSay('Add a name first'); return; }
  const rate = nz('e-rate'), tilg = nz('e-tilgung');
  if (rate > 0 && tilg > rate) { knkSay('The Tilgung can’t be more than the Monatsrate'); return; }
  const f = {}, put = (key, id, v) => { if (psChanged(id)) f[key] = typeof v === 'function' ? v() : v; };
  put('name', 'e-name', name);
  put('cat', 'e-cat', () => g('e-cat') || '');
  put('addr', 'e-addr', () => String(g('e-addr') || '').trim() || '—');
  put('m2', 'e-m2', () => nz('e-m2'));
  put('kaufdatum', 'e-kaufdatum', () => g('e-kaufdatum') || '—');
  put('kaufpreis', 'e-kaufpreis', () => nz('e-kaufpreis'));
  put('marktwert', 'e-marktwert', () => nz('e-marktwert'));
  put('nebenkosten', 'e-nebenkosten', () => nz('e-nebenkosten'));
  put('ek', 'e-ek', () => nz('e-ek'));
  put('bank', 'e-bank', () => String(g('e-bank') || '').trim() || '—');
  put('darlehensnr', 'e-darlehensnr', () => String(g('e-darlehensnr') || '').trim() || '—');
  put('darlehen', 'e-darlehen', () => nz('e-darlehen'));
  put('restschuld', 'e-restschuld', () => nz('e-restschuld'));
  put('restschuld_date', 'e-restschuld-date', () => g('e-restschuld-date') || null);
  put('bank_debit', 'e-bank-debit', () => g('e-bank-debit') || null);
  put('zinssatz', 'e-zinssatz', () => nz('e-zinssatz'));
  put('zb', 'e-zb', () => { const iso = g('e-zb'); return iso ? ccFmtDate(iso) : '—'; });
  put('rate', 'e-rate', rate);
  put('tilgung', 'e-tilgung', tilg);
  put('sparv', 'e-sparv', () => psSwitchVal('e-sparv'));
  if ('rate' in f || 'tilgung' in f) f.zinsen = psR2(psNum('rate' in f ? f.rate : p.rate) - psNum('tilgung' in f ? f.tilgung : p.tilgung));
  if ('darlehen' in f && !('restschuld' in f) && psRestUntouched(p)) f.restschuld = f.darlehen;     // follows until the first Yearly update
  const sparv = 'sparv' in f ? f.sparv : !!p.sparv;
  if (sparv) { if (psChanged('e-abbezahlt') || 'sparv' in f) f.abbezahlt = nz('e-abbezahlt'); }
  else if ('darlehen' in f || 'restschuld' in f || 'sparv' in f) {
    const dar = 'darlehen' in f ? f.darlehen : psNum(p.darlehen), rest = 'restschuld' in f ? f.restschuld : psNum(p.restschuld);
    f.abbezahlt = rest > 0 || dar === 0 ? psR2(Math.max(0, dar - rest)) : psNum(p.abbezahlt);
  }
  const m = Object.assign({}, p, f);
  if ('zb' in f || 'darlehen' in f || 'rate' in f) f.zb_status = psHasLoan(m) ? (psZbStatus(m.zb) || (m.zb === '—' ? 'ok' : p.zb_status || 'ok')) : 'ok';
  if (psChanged('e-zb-status') && !psZbIso(m.zb)) f.zb_status = g('e-zb-status');
  if (!Object.keys(f).length) { PS.mode = 'view'; _editing = false; PS.dirty = false; PS.snap = null; psRender(); return; }   // nothing changed
  const from = psMonthStart(g('e-valid-from') || psToday());
  PS.mode = 'view'; _editing = false;
  const ok = await psSaveProp(p, f, 'Saved', psTermsChanged(p, Object.assign({}, p, f)) ? from : null);
  if (!ok) { PS.mode = 'edit'; _editing = true; }
}

/* ── Wiring ── */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-ps]');
  if (!b || b.disabled || !b.closest('#detailOverlay')) return;
  const a = b.dataset.ps;
  if (a === 'cancelNew') return closeDetail();
  if (a === 'saveNew') return psSaveNew(b);
  if (a === 'edit') {
    if (!(await psCloseInline())) return;
    if (typeof KNK !== 'undefined') KNK.open = null;
    PS.mode = 'edit'; PS.dirty = false; _editing = true; psRender();
    const body = document.querySelector('#detailOverlay .sheet-body'); if (body) body.scrollTop = 0;
    return;
  }
  if (a === 'cancelEdit') {
    if (PS.dirty && !(await propConfirm('Discard the changes?', 'What you typed in this form is not saved yet.', 'Discard', true))) return;
    PS.mode = 'view'; PS.dirty = false; _editing = false; return psRender();
  }
  if (a === 'saveEdit') return saveEdit();
  if (a === 'delete') return confirmDelete();
  if (a === 'open') {
    const v = b.dataset.v;
    if (PS.open === v) return;
    if (!(await psCloseInline())) return;
    if (typeof KNK !== 'undefined') KNK.open = null;
    PS.open = v; PS.dirty = false; psRender();
    setTimeout(() => { const form = document.querySelector('#viewMode [data-psform]'); if (form && form.scrollIntoView) form.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
    return;
  }
  if (a === 'cancelInline') {
    if (PS.dirty && !(await propConfirm('Discard the changes?', 'What you typed here is not saved yet.', 'Discard', true))) return;
    PS.open = null; PS.dirty = false; PS.snap = null; return psRender();
  }
  if (a === 'saveLoan') return psSaveLoan();
  if (a === 'saveYear') return psSaveYear();
  if (a === 'saveObj') return psSaveObj();
  if (a === 'tg') { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); PS.dirty = true; psCalc(); }
});
/* Typing marks the pop-up as changed — only while that form is really open. (A field that is
   removed while it has focus — e.g. right after Save — still sends "change"; that must not count.) */
function psTyped(e) {
  if (PS.setting) return;                                  // a value the pop-up set itself (Restschuld following)
  const el = e.target;
  if (!el || !el.closest || !el.isConnected || !el.closest('#detailOverlay')) return;
  if (el.id === 'e-restschuld') PS.restFollow = false;     // typed by hand → it no longer follows the Darlehen
  if (el.dataset && el.dataset.psn !== undefined) { if (PS.mode === 'new') { PS.dirty = true; psNewSync(); } return; }
  if ((el.closest('[data-psform]') && PS.open && PS.mode === 'view') || (el.closest('#editMode') && PS.mode === 'edit')) { PS.dirty = true; psCalc(); }
}
document.addEventListener('input', psTyped);
document.addEventListener('change', psTyped);
