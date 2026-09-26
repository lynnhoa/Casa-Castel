'use strict';

/* ══════════════════════════════════════════════════════
   properties-portfolio.js
   Renders Portfolio tab + all modals (detail, edit, add, confirm).
   Identical layout to mockup-v3.
══════════════════════════════════════════════════════ */

/* ── PORTFOLIO LIST ── */
function renderPortfolio() {
  const props = window._props || [];

  const tRate = props.reduce((s,p) => s + n(p.rate), 0);
  const tTilg = props.reduce((s,p) => s + n(p.tilgung), 0);
  const tZins = props.reduce((s,p) => s + n(p.zinsen), 0);
  const tRest = props.reduce((s,p) => s + n(p.restschuld), 0);

  /* Portfolio header */
  document.getElementById('port-summary').innerHTML = `
    <div class="port-header">
      <div class="port-header__left">
        <div class="port-header__title">${props.length} properties</div>
        <div class="port-header__meta">${mio(tRest)} remaining debt</div>
      </div>
      <div class="port-header__right">
        <div class="port-header__amount">${eur(tRate)}<span class="port-header__mo"> / mo</span></div>
        <div class="port-header__split"><span class="t">${eur(tTilg)} Tilgung</span> · <span class="z">${eur(tZins)} Zinsen</span></div>
      </div>
    </div>`;

  /* Rows */
  const rows = props.map(p => {
    const rc = p.zb_status === 'red' ? ' port-row--red'
             : p.zb_status === 'amber' ? ' port-row--amber' : '';
    const zp = p.zb_status === 'red'
      ? `<span class="zb-pill zb-pill--red">🔴 ${p.zb}</span>`
      : p.zb_status === 'amber'
      ? `<span class="zb-pill zb-pill--amber">⚠ ${p.zb}</span>`
      : `<span class="zb-pill zb-pill--ok">${p.zb}</span>`;
    const sp = p.sparv ? '<span class="sparv-pill">Sparv.</span>' : '';
    const rd = n(p.rate) > 0
      ? eur(p.rate)
      : `<span style="color:var(--cc-stone)">—</span>`;
    const sd = n(p.rate) > 0
      ? `<span class="t">${eur(p.tilgung)}</span> / <span class="z">${eur(p.zinsen)}</span>`
      : `<span style="color:var(--cc-stone)">no payment</span>`;

    return `
      <div class="port-row${rc}" onclick="openDetail(${p.id})">
        <div class="port-row__no">${String(p.sort_order).padStart(2, '0')}</div>
        <div class="port-row__main">
          <div class="port-row__name">${p.name} ${zp} ${sp}</div>
          <div class="port-row__sub">${p.cat} · ${p.m2} m² · ${p.bank} · ${p.zinssatz.toFixed(2).replace('.', ',')} %</div>
        </div>
        <div class="port-row__nums">
          <div class="port-row__rate">${rd}</div>
          <div class="port-row__split">${sd}</div>
        </div>
        <span class="port-chev">›</span>
      </div>`;
  }).join('');

  const addRow = `
    <div class="port-add-row" onclick="openAdd()">
      <i class="ti ti-plus"></i> Add property
    </div>`;

  document.getElementById('port-list').innerHTML = rows + addRow;
}

/* ── DETAIL MODAL ── */
let _pid = null;
let _editing = false;

function openDetail(id) {
  _pid = id;
  _editing = false;
  const p = (window._props || []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('det-no').textContent = `No. ${String(p.sort_order).padStart(2, '0')} · ${p.cat}`;
  document.getElementById('det-name').textContent = p.name;
  document.getElementById('editBtn').textContent = 'Edit';
  document.getElementById('editBtn').classList.remove('on');
  renderView(p);
  document.getElementById('viewMode').classList.add('show');
  document.getElementById('editMode').classList.remove('show');
  history.pushState({ modal: 'detail' }, '');
  document.getElementById('detailOverlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  _pid = null;
  _editing = false;
}

function toggleEdit() {
  _editing = !_editing;
  const p = (window._props || []).find(x => x.id === _pid);
  if (!p) return;
  if (_editing) {
    renderEditForm(p);
    document.getElementById('editBtn').textContent = 'Cancel';
    document.getElementById('editBtn').classList.add('on');
    document.getElementById('viewMode').classList.remove('show');
    document.getElementById('editMode').classList.add('show');
  } else {
    document.getElementById('editBtn').textContent = 'Edit';
    document.getElementById('editBtn').classList.remove('on');
    document.getElementById('viewMode').classList.add('show');
    document.getElementById('editMode').classList.remove('show');
  }
}

/* ── VIEW MODE ── */
function renderView(p) {
  const equity  = n(p.marktwert) - n(p.restschuld);
  const abbPct  = n(p.darlehen) > 0 ? Math.round(n(p.abbezahlt) / n(p.darlehen) * 1000) / 10 : 0;
  const tPct    = n(p.rate) > 0 ? Math.round(n(p.tilgung) / n(p.rate) * 1000) / 10 : 0;
  const zPct    = 100 - tPct;

  const sparvH = p.sparv ? `
    <div class="mod-sparv">
      <span style="font-size:14px;flex-shrink:0;margin-top:2px;color:var(--cc-gold)">🐷</span>
      <div class="mod-sparv__txt">
        <span class="mod-sparv__ttl">Savings contract active</span>
        To be applied towards repayment at maturity.
      </div>
    </div>` : '';

  const rateH = n(p.rate) > 0 ? `
    <div class="mod-rate">
      <div class="mod-rate__hdr">
        <span class="mod-rate__lbl">Monthly payment</span>
        <span class="mod-rate__total">${eur(p.rate)}</span>
      </div>
      <div class="mod-rate__parts">
        <div class="mod-rate__part mod-rate__part--t">
          <div class="mod-rate__part-lbl">Tilgung</div>
          <div class="mod-rate__part-val">${eur(p.tilgung)}</div>
          <div class="mod-rate__part-pct">${tPct} % of payment</div>
        </div>
        <div class="mod-rate__part mod-rate__part--z">
          <div class="mod-rate__part-lbl">Zinsen</div>
          <div class="mod-rate__part-val">${eur(p.zinsen)}</div>
          <div class="mod-rate__part-pct">${zPct} % of payment</div>
        </div>
      </div>
      <div class="mini-rb">
        <div class="mini-rb-t" style="width:${tPct}%"></div>
        <div class="mini-rb-z" style="width:${zPct}%"></div>
      </div>
    </div>` : `<p style="font-size:12px;color:var(--cc-stone);margin-bottom:14px">No payment recorded.</p>`;

  document.getElementById('viewMode').innerHTML = `
    ${sparvH}
    <div class="mod-kpis">
      <div class="mod-kpi">
        <div class="mod-kpi__lbl">Restschuld</div>
        <div class="mod-kpi__val">${mio(p.restschuld)}</div>
        <div style="font-size:10px;color:var(--cc-stone);margin-top:2px">of ${eur(p.darlehen)}</div>
      </div>
      <div class="mod-kpi">
        <div class="mod-kpi__lbl">Equity</div>
        <div class="mod-kpi__val mod-kpi__val--gold">${mio(equity)}</div>
        <div style="font-size:10px;color:var(--cc-stone);margin-top:2px">Value ${mio(p.marktwert)}</div>
      </div>
      <div class="mod-kpi">
        <div class="mod-kpi__lbl">Interest rate</div>
        <div class="mod-kpi__val">${p.zinssatz.toFixed(2).replace('.', ',')} %</div>
        <div style="font-size:10px;color:var(--cc-stone);margin-top:2px">Fixed until ${p.zb}</div>
      </div>
    </div>
    ${rateH}
    <span class="mod-sec">Repayment progress</span>
    <div style="margin-bottom:14px">
      <div class="mod-prog-bg">
        <div class="mod-prog-fill" style="width:${Math.max(abbPct, 0.3)}%"></div>
      </div>
      <div class="mod-prog-lbls">
        <span class="mod-prog-lbl">${abbPct} % paid off</span>
        <span class="mod-prog-lbl">${eur(p.abbezahlt)} of ${eur(p.darlehen)}</span>
      </div>
    </div>
    <span class="mod-sec">Loan</span>
    <div class="mod-row"><span class="mod-key">Bank</span><span class="mod-val">${p.bank || '—'}</span></div>
    <div class="mod-row"><span class="mod-key">Loan number</span><span class="mod-val">${p.darlehensnr || '—'}</span></div>
    <div class="mod-row"><span class="mod-key">Loan amount</span><span class="mod-val">${eur(p.darlehen)}</span></div>
    <div class="mod-row"><span class="mod-key">Interest rate</span><span class="mod-val">${p.zinssatz.toFixed(2).replace('.', ',')} %</span></div>
    <div class="mod-row"><span class="mod-key">Fixed rate until</span><span class="mod-val">${p.zb}</span></div>
    <div class="mod-row"><span class="mod-key">Savings contract</span><span class="mod-val ${p.sparv ? 'mod-val--gold' : ''}">${p.sparv ? 'Yes' : 'No'}</span></div>
    <span class="mod-sec">Purchase</span>
    <div class="mod-row"><span class="mod-key">Address</span><span class="mod-val" style="font-size:12px">${p.addr}</span></div>
    <div class="mod-row"><span class="mod-key">Type</span><span class="mod-val">${p.cat}</span></div>
    <div class="mod-row"><span class="mod-key">Size</span><span class="mod-val">${p.m2} m²</span></div>
    <div class="mod-row"><span class="mod-key">Purchase price</span><span class="mod-val">${eur(p.kaufpreis)}</span></div>
    <div class="mod-row"><span class="mod-key">Acquisition costs</span><span class="mod-val">${eur(p.nebenkosten)}</span></div>
    <div class="mod-row"><span class="mod-key">Equity</span><span class="mod-val">${eur(p.ek)}</span></div>
    <div class="mod-row"><span class="mod-key">Purchase date</span><span class="mod-val">${ccFmtDate(p.kaufdatum)}</span></div>
    <div class="mod-row"><span class="mod-key">Est. market value</span><span class="mod-val mod-val--gold">${eur(p.marktwert)}</span></div>`;
}

/* ── EDIT FORM ── */
const CAT_OPTIONS = [
  '1-Zimmer-Wohnung','2-Zimmer-Wohnung','3-Zimmer-Wohnung','4-Zimmer-Wohnung',
  'Studio / Appartement','Einfamilienhaus','Mehrfamilienhaus','Doppelhaushälfte',
  'Reihenhaus','Wohngemeinschaft','Gewerbeeinheit','Gemischte Nutzung'
];

function catSelect(id, current) {
  const cur = (current || '').trim();
  current = cur;
  return `<select class="cc-select" id="${id}">
    ${CAT_OPTIONS.map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('')}
  </select>`;
}

function renderEditForm(p) {
  document.getElementById('editMode').innerHTML = `
    <span class="e-sec">Property</span>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Short name</label><input class="cc-input" id="e-name" value="${p.name}"/></div>
      <div class="e-field"><label class="e-lbl">Type</label>${catSelect('e-cat', p.cat)}</div>
    </div>
    <div class="e-field"><label class="e-lbl">Address</label><input class="cc-input" id="e-addr" value="${p.addr}"/></div>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Size m²</label><input class="cc-input" id="e-m2" type="number" data-cc-num="auto" value="${p.m2}"/></div>
      <div class="e-field"><label class="e-lbl">Purchase date</label><input class="cc-input" id="e-kaufdatum" value="${ccFmtDate(p.kaufdatum)}" placeholder="TT.MM.JJJJ"/></div>
    </div>
    <span class="e-sec">Purchase</span>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Purchase price €</label><input class="cc-input" id="e-kaufpreis" type="number" data-cc-num="2" value="${p.kaufpreis}"/></div>
      <div class="e-field"><label class="e-lbl">Equity €</label><input class="cc-input" id="e-ek" type="number" data-cc-num="2" value="${p.ek}"/></div>
    </div>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Acquisition costs €</label><input class="cc-input" id="e-nebenkosten" type="number" data-cc-num="2" value="${p.nebenkosten}"/></div>
      <div class="e-field"><label class="e-lbl">Est. market value €</label><input class="cc-input" id="e-marktwert" type="number" data-cc-num="2" value="${p.marktwert}"/></div>
    </div>
    <span class="e-sec">Financing</span>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Bank</label><input class="cc-input" id="e-bank" value="${p.bank}"/></div>
      <div class="e-field"><label class="e-lbl">Loan number</label><input class="cc-input" id="e-darlehensnr" value="${p.darlehensnr}"/></div>
    </div>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Loan amount €</label><input class="cc-input" id="e-darlehen" type="number" data-cc-num="2" value="${p.darlehen}"/></div>
      <div class="e-field"><label class="e-lbl">Remaining debt €</label><input class="cc-input" id="e-restschuld" type="number" data-cc-num="2" value="${p.restschuld}"/></div>
    </div>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Paid off €</label><input class="cc-input" id="e-abbezahlt" type="number" data-cc-num="2" value="${p.abbezahlt}"/></div>
      <div class="e-field"><label class="e-lbl">Interest rate %</label><input class="cc-input" id="e-zinssatz" type="number" data-cc-num="auto" step="0.01" value="${p.zinssatz}"/></div>
    </div>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Fixed rate until</label><input class="cc-input" id="e-zb" value="${p.zb}"/></div>
      <div class="e-field"><label class="e-lbl">Rate status</label>
        <select class="cc-select" id="e-zb-status">
          <option value="ok"${p.zb_status === 'ok' ? ' selected' : ''}>OK</option>
          <option value="amber"${p.zb_status === 'amber' ? ' selected' : ''}>⚠ 6 months</option>
          <option value="red"${p.zb_status === 'red' ? ' selected' : ''}>🔴 Urgent</option>
        </select>
      </div>
    </div>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Monthly payment €</label><input class="cc-input" id="e-rate" type="number" data-cc-num="2" value="${p.rate}"/></div>
      <div class="e-field"><label class="e-lbl">Repayment €/mo</label><input class="cc-input" id="e-tilgung" type="number" data-cc-num="2" value="${p.tilgung}"/></div>
    </div>
    <div class="e-grid">
      <div class="e-field"><label class="e-lbl">Interest €/mo</label><input class="cc-input" id="e-zinsen" type="number" data-cc-num="2" value="${p.zinsen}"/></div>
      <div class="e-field"><label class="e-lbl">Savings contract</label>
        <select class="cc-select" id="e-sparv">
          <option value="false"${!p.sparv ? ' selected' : ''}>No</option>
          <option value="true"${p.sparv ? ' selected' : ''}>Yes</option>
        </select>
      </div>
    </div>
    <button class="cc-btn--primary" onclick="saveEdit()">Save</button>
    <button class="cc-btn--secondary" onclick="toggleEdit()">Cancel</button>
    <button class="btn-delete" onclick="confirmDelete()">Delete property</button>`;
}

/* ── SAVE EDIT ── */
async function saveEdit() {
  const g  = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const gn = id => { const v = parseFloat(g(id)); return isNaN(v) ? 0 : v; };

  const p = (window._props || []).find(x => x.id === _pid);
  if (!p) return;

  const fields = {
    name:       g('e-name')       || p.name,
    cat:        g('e-cat')        || p.cat,
    addr:       g('e-addr')       || p.addr,
    m2:         parseInt(g('e-m2')) || p.m2,
    kaufdatum:  g('e-kaufdatum')  || p.kaufdatum,
    kaufpreis:  gn('e-kaufpreis') || p.kaufpreis,
    ek:         gn('e-ek')        || p.ek,
    nebenkosten:gn('e-nebenkosten'),
    marktwert:  gn('e-marktwert') || p.marktwert,
    bank:       g('e-bank')       || p.bank,
    darlehensnr:g('e-darlehensnr')|| p.darlehensnr,
    darlehen:   gn('e-darlehen')  || p.darlehen,
    restschuld: gn('e-restschuld'),
    abbezahlt:  gn('e-abbezahlt'),
    zinssatz:   gn('e-zinssatz')  || p.zinssatz,
    zb:         g('e-zb')         || p.zb,
    zb_status:  g('e-zb-status')  || 'ok',
    rate:       gn('e-rate'),
    tilgung:    gn('e-tilgung'),
    zinsen:     gn('e-zinsen'),
    sparv:      g('e-sparv') === 'true',
  };

  try {
    showLoading(true);
    await updateProperty(_pid, fields);
    window._props = await fetchAll();
    renderAll();
    _editing = false;
    document.getElementById('editBtn').textContent = 'Edit';
    document.getElementById('editBtn').classList.remove('on');
    const updated = window._props.find(x => x.id === _pid);
    if (updated) renderView(updated);
    document.getElementById('viewMode').classList.add('show');
    document.getElementById('editMode').classList.remove('show');
  } catch(err) {
    alert('Error saving: ' + err.message);
  } finally {
    showLoading(false);
  }
}

/* ── DELETE ── */
let _delId = null;

function confirmDelete() {
  const p = (window._props || []).find(x => x.id === _pid);
  if (!p) return;
  _delId = _pid;
  document.getElementById('confirmDesc').textContent =
    `"${p.name}" will be permanently deleted.`;
  document.getElementById('confirmOkBtn').onclick = doDelete;
  document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  _delId = null;
}

async function doDelete() {
  closeConfirm();
  try {
    showLoading(true);
    await deleteProperty(_delId);
    window._props = await fetchAll();
    closeDetail();
    renderAll();
  } catch(err) {
    alert('Error deleting: ' + err.message);
  } finally {
    showLoading(false);
  }
}

/* ── ADD PROPERTY ── */
function openAdd() {
  const props = window._props || [];
  const next = props.length
    ? Math.max(...props.map(p => p.sort_order)) + 1
    : 1;
  document.getElementById('nextNo').textContent = next;
  history.pushState({ modal: 'add' }, '');
  document.getElementById('addOverlay').classList.add('open');
}

function closeAdd() {
  document.getElementById('addOverlay').classList.remove('open');
}

async function saveNew() {
  const g  = id => { const el = document.getElementById(id); return el ? el.value.trim() : null; };
  const gn = id => { const v = parseFloat(g(id)); return isNaN(v) ? 0 : v; };

  const name = g('a-name');
  if (!name) { alert('Short name is required.'); return; }

  const nextSort = await getNextSortOrder();

  const fields = {
    sort_order:  nextSort,
    name,
    addr:        g('a-addr')        || '—',
    cat:         g('a-cat')         || '2-Zimmer-Wohnung',
    m2:          parseInt(g('a-m2'))|| 0,
    kaufdatum:   g('a-kaufdatum')   || '—',
    kaufpreis:   gn('a-kaufpreis'),
    ek:          gn('a-ek'),
    nebenkosten: gn('a-nebenkosten'),
    darlehen:    gn('a-darlehen'),
    restschuld:  gn('a-restschuld'),
    abbezahlt:   gn('a-abbezahlt'),
    marktwert:   gn('a-marktwert'),
    bank:        g('a-bank')        || '—',
    darlehensnr: g('a-darlehensnr') || '—',
    zinssatz:    gn('a-zinssatz'),
    zb:          g('a-zb')          || '—',
    zb_status:   g('a-zb-status')   || 'ok',
    rate:        gn('a-rate'),
    tilgung:     gn('a-tilgung'),
    zinsen:      gn('a-zinsen'),
    sparv:       g('a-sparv') === 'true',
  };

  try {
    showLoading(true);
    await addProperty(fields);
    window._props = await fetchAll();
    closeAdd();
    renderAll();
    // Clear form
    ['a-name','a-addr','a-m2','a-kaufdatum','a-kaufpreis','a-ek','a-nebenkosten',
     'a-darlehen','a-restschuld','a-abbezahlt','a-marktwert','a-bank',
     'a-darlehensnr','a-zinssatz','a-zb','a-rate','a-tilgung','a-zinsen']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  } catch(err) {
    alert('Error saving: ' + err.message);
  } finally {
    showLoading(false);
  }
}
