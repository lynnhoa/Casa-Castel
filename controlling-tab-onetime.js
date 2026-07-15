/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EINMALIG TAB (per-property cards)
   controlling-tab-onetime.js

   Each active property gets its own card. Entries filtered by
   month + search show inside the card. Add form embedded per
   card, so property_id is implicit. Portfolio summary at the
   bottom.

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlOtFilterMonth = (function(){
  try { const v = localStorage.getItem('ctl_ot_month');
        return v === null ? 'all' : (v === 'all' ? 'all' : Number(v)); }
  catch(e){ return 'all'; }
})();
let _ctlOtSearch      = '';

function _ctlOtSave() {
  try { localStorage.setItem('ctl_ot_month', String(_ctlOtFilterMonth)); } catch(e){}
}

document.getElementById('tab-onetime').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Einmalige Ausgaben</h1>
        <div class="ct-sub" id="ctOtSub">Alle Monate · 2026</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;">
      <select class="ct-input" id="ctOtFiltMonth" style="text-align:left;"></select>
      <input  class="ct-input" id="ctOtSearch" type="search" style="text-align:left;" placeholder="Suchen (Firma, Beschreibung)…"/>
    </div>

    <div id="ctOtProperties"></div>

    <div class="ct-section" style="margin-top:6px;">
      <div class="ct-section__ttl"><span>Zusammenfassung</span></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;">
        <span style="font-size:13px;color:var(--cc-charcoal);" id="ctOtSumFilterLbl">Gesamt (Filter)</span>
        <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:var(--cc-ink);font-variant-numeric:tabular-nums;" id="ctOtSumFilterVal">0,00 €</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:0.5px solid var(--cc-rule);">
        <span style="font-size:11px;letter-spacing:.06em;color:var(--cc-taupe);">Ganzes Jahr</span>
        <span style="font-size:13px;color:var(--cc-taupe);font-variant-numeric:tabular-nums;" id="ctOtSumYearVal">0,00 €</span>
      </div>
    </div>
  </div>
`;

window.renderOneTime = function () {
  // Month dropdown
  const monthSel = document.getElementById('ctOtFiltMonth');
  monthSel.innerHTML = '<option value="all">Alle Monate</option>';
  for (let m = 1; m <= 12; m++) {
    monthSel.innerHTML += `<option value="${m}">${ctlMonthName(m)}</option>`;
  }
  monthSel.value = _ctlOtFilterMonth;

  const searchInp = document.getElementById('ctOtSearch');
  searchInp.value = _ctlOtSearch;

  monthSel.onchange = () => {
    _ctlOtFilterMonth = monthSel.value === 'all' ? 'all' : Number(monthSel.value);
    _ctlOtSave();
    renderOtProperties();
  };
  searchInp.oninput = e => {
    _ctlOtSearch = e.target.value.toLowerCase();
    renderOtProperties();
  };

  renderOtProperties();
};

function matchesFilter(o, y) {
  const d = ctlParseDate(o.invoice_date);
  if (d.year !== y) return false;
  if (_ctlOtFilterMonth !== 'all' && d.month !== _ctlOtFilterMonth) return false;
  if (_ctlOtSearch) {
    const q = _ctlOtSearch;
    if (!(o.company || '').toLowerCase().includes(q) &&
        !(o.item    || '').toLowerCase().includes(q)) return false;
  }
  return true;
}

function renderOtProperties() {
  const y = window._ctrl.year;
  const props = window._ctrl.properties.filter(p => p.active);

  const scopeParts = [];
  if (_ctlOtFilterMonth !== 'all') scopeParts.push(ctlMonthName(_ctlOtFilterMonth));
  if (_ctlOtSearch)                scopeParts.push('"' + _ctlOtSearch + '"');
  const scopeLbl = scopeParts.length ? scopeParts.join(' · ') : 'Alle Monate';
  document.getElementById('ctOtSub').textContent = scopeLbl + ' · ' + y;

  const defDate = new Date().toISOString().slice(0, 10);
  let html = '';
  let filterTotal = 0;
  let yearTotal   = 0;

  for (const p of props) {
    // filtered entries for this property
    const entries = window._ctrl.one_time
      .filter(o => o.property_id === p.id && matchesFilter(o, y))
      .sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1));
    const propFilterTotal = entries.reduce((s, o) => s + Number(o.amount || 0), 0);
    filterTotal += propFilterTotal;

    // whole-year total for this property (unfiltered by month/search but restricted to y)
    const propYearTotal = window._ctrl.one_time
      .filter(o => o.property_id === p.id && ctlParseDate(o.invoice_date).year === y)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    yearTotal += propYearTotal;

    // entries HTML
    let entriesHtml;
    if (entries.length) {
      entriesHtml = '';
      for (const o of entries) {
        const cmp  = o.company ? String(o.company) : '';
        const itm  = o.item    ? String(o.item)    : '';
        const desc = cmp && itm ? '<strong>' + cmp + '</strong> · ' + itm
                                : (cmp || itm || '—');
        entriesHtml +=
          '<div class="ct-row">' +
            '<div class="ct-row__lbl" style="font-size:12px;">' + desc + '<small>' + fmtOtDate(o.invoice_date) + '</small></div>' +
            '<div class="ct-row__lbl" style="text-align:right;font-variant-numeric:tabular-nums;font-size:13px;">' + ctlEur(o.amount) + '</div>' +
            '<div style="text-align:right;"><button class="ct-btn-sm" onclick="ctlOtDelete(' + o.id + ')" title="Löschen"><i class="ti ti-trash"></i></button></div>' +
          '</div>';
      }
    } else {
      entriesHtml =
        '<div style="padding:10px 0;font-size:12px;color:var(--cc-stone);text-align:center;">' +
          (scopeParts.length ? 'Keine Einträge für diesen Filter' : 'Keine Einträge') +
        '</div>';
    }

    // add form
    const addFormHtml =
      '<div style="margin-top:8px;padding-top:10px;border-top:0.5px solid var(--cc-rule);">' +
        '<div style="display:grid;grid-template-columns:120px 1fr;gap:6px;margin-bottom:6px;">' +
          '<input class="ct-input ct-ot-inp" data-pid="' + p.id + '" data-field="date" type="date" style="text-align:left;" value="' + defDate + '"/>' +
          '<input class="ct-input ct-ot-inp" data-pid="' + p.id + '" data-field="company" type="text" style="text-align:left;" placeholder="Firma"/>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 90px 44px;gap:6px;align-items:center;">' +
          '<input class="ct-input ct-ot-inp" data-pid="' + p.id + '" data-field="item" type="text" style="text-align:left;" placeholder="Beschreibung"/>' +
          '<input class="ct-input ct-ot-inp" data-pid="' + p.id + '" data-field="amt"  type="number" step="0.01" inputmode="decimal" placeholder="0,00"/>' +
          '<button class="ct-btn-sm primary" onclick="ctlOtAddFor(' + p.id + ')" title="Hinzufügen"><i class="ti ti-plus"></i></button>' +
        '</div>' +
      '</div>';

    // property header — total badge changes color based on value
    const totalColor = propFilterTotal > 0 ? 'var(--cc-ink)' : 'var(--cc-stone)';
    const headerHtml =
      '<div class="ct-section__ttl" style="margin-bottom:10px;">' +
        '<span>' + p.name + '</span>' +
        '<span style="font-variant-numeric:tabular-nums;font-family:\'Cormorant Garamond\',Georgia,serif;font-size:16px;letter-spacing:0;text-transform:none;color:' + totalColor + ';">' + ctlEur(propFilterTotal) + '</span>' +
      '</div>';

    html +=
      '<div class="ct-section" style="margin-bottom:10px;">' +
        headerHtml +
        entriesHtml +
        addFormHtml +
      '</div>';
  }

  document.getElementById('ctOtProperties').innerHTML = html;

  // Summary at the bottom
  document.getElementById('ctOtSumFilterLbl').textContent =
    'Gesamt · ' + scopeLbl;
  document.getElementById('ctOtSumFilterVal').textContent = ctlEur(filterTotal);
  document.getElementById('ctOtSumYearVal').textContent   = ctlEur(yearTotal);

  // Wire Enter-to-add on all text/number inputs
  document.querySelectorAll('#ctOtProperties input.ct-ot-inp').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const pid = Number(inp.dataset.pid);
        window.ctlOtAddFor(pid);
      }
    });
  });
}

function fmtOtDate(iso) {
  const d = ctlParseDate(iso);
  return String(d.day).padStart(2,'0') + '.' + String(d.month).padStart(2,'0') + '.' + String(d.year).slice(2);
}

window.ctlOtAddFor = async function (pid) {
  const inps = {};
  document.querySelectorAll('#ctOtProperties input.ct-ot-inp[data-pid="' + pid + '"]').forEach(inp => {
    inps[inp.dataset.field] = inp.value;
  });
  const date    = inps.date;
  const company = (inps.company || '').trim() || null;
  const item    = (inps.item    || '').trim();
  const amt     = Number(inps.amt);
  if (!date || !item || !amt) { ctlToast('Datum · Beschreibung · Betrag'); return; }
  try {
    await ctlInsertOneTime(pid, date, item, amt, company);
    ctlToast('Hinzugefügt');
    renderOtProperties();
    window.renderDashboard?.();
    // After re-render, refocus the Firma field of this property for rapid next entry
    const firma = document.querySelector('#ctOtProperties input.ct-ot-inp[data-pid="' + pid + '"][data-field="company"]');
    firma?.focus();
  } catch (e) {
    console.error(e); ctlToast('Fehler beim Speichern');
  }
};

window.ctlOtDelete = async function (id) {
  if (!confirm('Eintrag löschen?')) return;
  try {
    await ctlDeleteOneTime(id);
    renderOtProperties();
    window.renderDashboard?.();
    ctlToast('Gelöscht');
  } catch (e) {
    console.error(e); ctlToast('Fehler');
  }
};
