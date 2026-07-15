/* ─────────────────────────────────────────────────────────────
   CONTROLLING — ONE-TIME EXPENSES TAB
   controlling-tab-onetime.js

   Single-form entry for one-time expenses across all properties.
   Row lands in the correct property × month based on invoice_date.
   Filters: property + month + free-text search.

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlOtFilterProp  = 'all';        // 'all' | property_id
let _ctlOtFilterMonth = 'all';        // 'all' | 1..12
let _ctlOtSearch      = '';

document.getElementById('tab-onetime').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Einmalige Ausgaben</h1>
        <div class="ct-sub" id="ctOtSub">Alle Immobilien · verteilt via Rechnungsdatum</div>
      </div>
    </div>

    <!-- Add row -->
    <div class="ct-section">
      <div class="ct-section__ttl"><span>Neuer Eintrag</span></div>
      <div style="display:grid;grid-template-columns:130px 1fr;gap:6px;margin-bottom:6px;">
        <input class="ct-input" type="date" id="ctOtNewDate" style="text-align:left;"/>
        <select class="ct-input" id="ctOtNewProp" style="text-align:left;">
          <option value="">Immobilie wählen…</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <input class="ct-input" type="text" id="ctOtNewCompany" style="text-align:left;" placeholder="Firma"/>
        <input class="ct-input" type="text" id="ctOtNewItem"    style="text-align:left;" placeholder="Beschreibung"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 44px;gap:6px;">
        <input class="ct-input" type="number" id="ctOtNewAmt" step="0.01" inputmode="decimal" placeholder="0,00"/>
        <button class="ct-btn-sm primary" id="ctOtNewAdd" title="Hinzufügen"><i class="ti ti-plus"></i></button>
      </div>
    </div>

    <!-- Filters -->
    <div class="ct-section">
      <div class="ct-section__ttl"><span>Filter</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <select class="ct-input" id="ctOtFiltProp"  style="text-align:left;"></select>
        <select class="ct-input" id="ctOtFiltMonth" style="text-align:left;"></select>
      </div>
      <input class="ct-input" type="search" id="ctOtSearch" style="text-align:left;" placeholder="Suchen (Firma, Beschreibung)…"/>
    </div>

    <!-- Log -->
    <table class="ct-tbl">
      <thead>
        <tr>
          <th style="width:78px;">Datum</th>
          <th>Immobilie</th>
          <th>Firma · Beschreibung</th>
          <th class="num" style="width:90px;">Betrag</th>
          <th style="width:30px;"></th>
        </tr>
      </thead>
      <tbody id="ctOtLog"></tbody>
    </table>
  </div>
`;

window.renderOneTime = function () {
  const y = window._ctrl.year;

  // Populate property dropdowns
  const propSel = document.getElementById('ctOtNewProp');
  const filtSel = document.getElementById('ctOtFiltProp');
  propSel.innerHTML = '<option value="">Immobilie wählen…</option>';
  filtSel.innerHTML = '<option value="all">Alle Immobilien</option>';
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    propSel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    filtSel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  }

  // Populate month dropdown
  const monthSel = document.getElementById('ctOtFiltMonth');
  monthSel.innerHTML = '<option value="all">Alle Monate</option>';
  for (let m = 1; m <= 12; m++) {
    monthSel.innerHTML += `<option value="${m}">${ctlMonthName(m)}</option>`;
  }

  // Restore filter state, set today as default new-entry date
  document.getElementById('ctOtNewDate').value = new Date().toISOString().slice(0, 10);
  filtSel.value  = _ctlOtFilterProp;
  monthSel.value = _ctlOtFilterMonth;
  document.getElementById('ctOtSearch').value = _ctlOtSearch;

  // Wire filters
  filtSel.onchange = () => {
    _ctlOtFilterProp = filtSel.value === 'all' ? 'all' : Number(filtSel.value);
    renderOtLog();
  };
  monthSel.onchange = () => {
    _ctlOtFilterMonth = monthSel.value === 'all' ? 'all' : Number(monthSel.value);
    renderOtLog();
  };
  document.getElementById('ctOtSearch').oninput = e => {
    _ctlOtSearch = e.target.value.toLowerCase();
    renderOtLog();
  };

  // Wire add
  document.getElementById('ctOtNewAdd').onclick = addNewOneTime;
  // Also allow Enter on any of the text inputs
  ['ctOtNewCompany', 'ctOtNewItem', 'ctOtNewAmt'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') addNewOneTime();
    });
  });

  renderOtLog();
};

function renderOtLog() {
  const y = window._ctrl.year;

  let rows = window._ctrl.one_time.filter(o => ctlParseDate(o.invoice_date).year === y);
  if (_ctlOtFilterProp !== 'all')  rows = rows.filter(o => o.property_id === _ctlOtFilterProp);
  if (_ctlOtFilterMonth !== 'all') rows = rows.filter(o => ctlParseDate(o.invoice_date).month === _ctlOtFilterMonth);
  if (_ctlOtSearch) {
    const q = _ctlOtSearch;
    rows = rows.filter(o => (o.company || '').toLowerCase().includes(q) || (o.item || '').toLowerCase().includes(q));
  }
  rows.sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1));   // newest first

  let html = '';
  let total = 0;
  for (const o of rows) {
    total += Number(o.amount || 0);
    const p = ctlProp(o.property_id);
    const cmp = o.company || '';
    const itm = o.item || '';
    const desc = cmp && itm ? `<strong>${cmp}</strong> · ${itm}` : (cmp || itm || '—');
    html +=
      '<tr>' +
        '<td style="font-variant-numeric:tabular-nums;">' + fmtDate(o.invoice_date) + '</td>' +
        '<td>' + (p?.name || '—') + '</td>' +
        '<td style="font-size:12px;">' + desc + '</td>' +
        '<td class="num">' + ctlEur(o.amount) + '</td>' +
        '<td><button class="ct-btn-sm" onclick="ctlOtDelete(' + o.id + ')" title="Löschen"><i class="ti ti-trash"></i></button></td>' +
      '</tr>';
  }
  if (!rows.length) {
    html = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--cc-taupe);font-size:12px;">Keine Einträge</td></tr>';
  } else {
    html +=
      '<tr class="total">' +
        '<td colspan="3">Summe (' + rows.length + ')</td>' +
        '<td class="num">' + ctlEur(total) + '</td>' +
        '<td></td>' +
      '</tr>';
  }
  document.getElementById('ctOtLog').innerHTML = html;

  // Header sub-line reflects the filter state
  const parts = [];
  if (_ctlOtFilterProp !== 'all')  parts.push(ctlProp(_ctlOtFilterProp)?.name || '?');
  if (_ctlOtFilterMonth !== 'all') parts.push(ctlMonthName(_ctlOtFilterMonth));
  document.getElementById('ctOtSub').textContent =
    (parts.length ? parts.join(' · ') : 'Alle Immobilien · alle Monate') + ' · ' + y;
}

function fmtDate(iso) {
  const d = ctlParseDate(iso);
  return String(d.day).padStart(2,'0') + '.' + String(d.month).padStart(2,'0') + '.' + String(d.year).slice(2);
}

async function addNewOneTime() {
  const date    = document.getElementById('ctOtNewDate').value;
  const pid     = Number(document.getElementById('ctOtNewProp').value);
  const company = document.getElementById('ctOtNewCompany').value.trim() || null;
  const item    = document.getElementById('ctOtNewItem').value.trim();
  const amt     = Number(document.getElementById('ctOtNewAmt').value);

  if (!date || !pid || !item || !amt) {
    ctlToast('Datum · Immobilie · Beschreibung · Betrag');
    return;
  }
  try {
    await ctlInsertOneTime(pid, date, item, amt, company);
    ctlToast('Hinzugefügt');
    // Clear the transaction-specific fields; keep date + property for rapid entry
    document.getElementById('ctOtNewCompany').value = '';
    document.getElementById('ctOtNewItem').value    = '';
    document.getElementById('ctOtNewAmt').value     = '';
    document.getElementById('ctOtNewCompany').focus();
    renderOtLog();
    // Dashboard totals depend on this, refresh in the background
    window.renderDashboard?.();
  } catch (e) {
    console.error(e);
    ctlToast('Fehler beim Speichern');
  }
}

window.ctlOtDelete = async function (id) {
  if (!confirm('Eintrag löschen?')) return;
  try {
    await ctlDeleteOneTime(id);
    renderOtLog();
    window.renderDashboard?.();
    ctlToast('Gelöscht');
  } catch (e) {
    console.error(e);
    ctlToast('Fehler');
  }
};
