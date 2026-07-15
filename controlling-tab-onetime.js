/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EINMALIG TAB
   controlling-tab-onetime.js

   Two-level structure:
     · Surface  = portfolio overview
                  · Filters (month + search)
                  · Portfolio Gesamt card
                  · Property list (one compact row per property)
     · Drawer   = per-property drilldown
                  · Summe card on top
                  · Add-form
                  · Entries list (scrolls freely — works for 100s)
   Reuses the shared #ctDrawer element (same used by Dashboard's
   monthly-entry drawer).

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlOtFilterMonth = (function(){
  try { const v = localStorage.getItem('ctl_ot_month');
        return v === null ? 'all' : (v === 'all' ? 'all' : Number(v)); }
  catch(e){ return 'all'; }
})();
let _ctlOtSearch      = '';
let _ctlOtDrawerPid   = null;

function _ctlOtSave() {
  try { localStorage.setItem('ctl_ot_month', String(_ctlOtFilterMonth)); } catch(e){}
}

/* Deep-link entry point used by monthly-entry drawer's "Öffnen" button.
   Sets filter, then caller (controlling-tab-entry.js) switches tab + opens drawer. */
window.ctlOtDeepLink = function (pid, month) {
  _ctlOtFilterMonth = month;
  _ctlOtSave();
};

document.getElementById('tab-onetime').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Einmalige Ausgaben</h1>
        <div class="ct-sub" id="ctOtSub">Alle Monate · 2026</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;">
      <select class="ct-input ct-input--filter" id="ctOtFiltMonth" style="text-align:left;"></select>
      <input  class="ct-input ct-input--filter" id="ctOtSearch" type="search" style="text-align:left;" placeholder="Suchen (Firma, Beschreibung)…"/>
    </div>

    <div class="ct-section" style="margin-bottom:16px;">
      <div style="text-align:center;padding:6px 0;">
        <div style="font-size:10px;font-weight:500;letter-spacing:.11em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:8px;">Gesamt Portfolio</div>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;color:var(--cc-ink);font-feature-settings:'lnum' 1,'tnum' 1;font-variant-numeric:lining-nums tabular-nums;" id="ctOtPortfolioTotal">0,00 €</div>
        <div style="font-size:11px;color:var(--cc-taupe);margin-top:4px;" id="ctOtPortfolioSub">—</div>
      </div>
    </div>

    <div class="ct-cardhead ct-cardhead-ot" aria-hidden="true">
      <span>Immobilie</span>
      <span>Summe</span>
    </div>

    <table class="ct-tbl">
      <thead>
        <tr>
          <th>Immobilie</th>
          <th class="num" style="width:80px;">Einträge</th>
          <th class="num" style="width:100px;">Summe</th>
          <th style="width:24px;"></th>
        </tr>
      </thead>
      <tbody id="ctOtPropList"></tbody>
    </table>
  </div>
`;

window.renderOneTime = function () {
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
    renderOtSurface();
  };
  searchInp.oninput = e => {
    _ctlOtSearch = e.target.value.toLowerCase();
    renderOtSurface();
  };

  renderOtSurface();
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

function renderOtSurface() {
  const y = window._ctrl.year;
  let portfolioTotal = 0;
  let propsWithEntries = 0;

  const rows = window._ctrl.properties.filter(p => p.active).map(p => {
    const entries = window._ctrl.one_time.filter(o => o.property_id === p.id && matchesFilter(o, y));
    const total   = entries.reduce((s, o) => s + Number(o.amount || 0), 0);
    if (entries.length > 0) propsWithEntries++;
    portfolioTotal += total;
    return { p, count: entries.length, total };
  });

  // Portfolio Gesamt card
  document.getElementById('ctOtPortfolioTotal').textContent = ctlEur(portfolioTotal);
  const subParts = [];
  if (_ctlOtFilterMonth !== 'all') subParts.push(ctlMonthName(_ctlOtFilterMonth));
  subParts.push(y);
  subParts.push(propsWithEntries + ' Immobilie' + (propsWithEntries === 1 ? '' : 'n') + ' mit Einträgen');
  document.getElementById('ctOtPortfolioSub').textContent = subParts.join(' · ');

  // Header sub-line
  const scopeParts = [];
  if (_ctlOtFilterMonth !== 'all') scopeParts.push(ctlMonthName(_ctlOtFilterMonth));
  if (_ctlOtSearch)                scopeParts.push('"' + _ctlOtSearch + '"');
  document.getElementById('ctOtSub').textContent =
    (scopeParts.length ? scopeParts.join(' · ') : 'Alle Monate') + ' · ' + y;

  // Property list
  let html = '';
  for (const { p, count, total } of rows) {
    const muted = count === 0;
    const numStyle = muted ? ' style="color:var(--cc-stone);"' : '';
    html +=
      '<tr style="cursor:pointer;" onclick="ctlOtOpenProperty(' + p.id + ')">' +
        '<td>' + p.name + '</td>' +
        '<td class="num"' + numStyle + '>' + count + '</td>' +
        '<td class="num"' + numStyle + '>' + (total > 0 ? ctlEur(total) : '—') + '</td>' +
        '<td style="text-align:right;color:var(--cc-taupe);"><i class="ti ti-chevron-right"></i></td>' +
      '</tr>';
  }
  document.getElementById('ctOtPropList').innerHTML = html;
}

/* ══ PROPERTY DRAWER ══════════════════════════════════════════ */

window.ctlOtOpenProperty = function (pid) {
  _ctlOtDrawerPid = pid;
  const prop = ctlProp(pid);
  document.getElementById('ctDrawerTitle').textContent = prop.name + ' · Einmalige Ausgaben';
  document.getElementById('ctDrawer').dataset.opener = 'onetime';
  document.getElementById('ctDrawerBody').innerHTML = renderOtDrawerBody(pid);
  document.getElementById('ctDrawer').classList.add('open');
  wireOtDrawer();
};

function renderOtDrawerBody(pid) {
  const y = window._ctrl.year;
  const entries = window._ctrl.one_time
    .filter(o => o.property_id === pid && matchesFilter(o, y))
    .sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1));
  const total = entries.reduce((s, o) => s + Number(o.amount || 0), 0);
  const defDate = new Date().toISOString().slice(0, 10);

  const filterScope = [];
  if (_ctlOtFilterMonth !== 'all') filterScope.push(ctlMonthName(_ctlOtFilterMonth));
  if (_ctlOtSearch)                filterScope.push('"' + _ctlOtSearch + '"');
  const scopeLbl = filterScope.length ? filterScope.join(' · ') : 'Ganzes Jahr';

  // Summary card
  const summaryHtml =
    '<div class="ct-section" style="margin-bottom:14px;">' +
      '<div style="text-align:center;padding:4px 0;">' +
        '<div style="font-size:10px;font-weight:500;letter-spacing:.11em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:6px;">Summe · ' + scopeLbl + '</div>' +
        '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:28px;color:var(--cc-ink);font-feature-settings:\'lnum\' 1,\'tnum\' 1;font-variant-numeric:lining-nums tabular-nums;">' + ctlEur(total) + '</div>' +
        '<div style="font-size:11px;color:var(--cc-taupe);margin-top:4px;">' + (entries.length === 1 ? '1 Eintrag' : entries.length + ' Einträge') + '</div>' +
      '</div>' +
    '</div>';

  // Add form
  const addFormHtml =
    '<div class="ct-section" style="margin-bottom:14px;">' +
      '<div class="ct-section__ttl"><span>Neuer Eintrag</span></div>' +
      '<div style="display:grid;grid-template-columns:120px 1fr;gap:6px;margin-bottom:6px;">' +
        '<input class="ct-input ct-otd-inp" data-field="date" type="date" style="text-align:left;" value="' + defDate + '"/>' +
        '<input class="ct-input ct-otd-inp" data-field="company" type="text" style="text-align:left;" placeholder="Firma"/>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 90px 44px;gap:6px;align-items:center;">' +
        '<input class="ct-input ct-otd-inp" data-field="item" type="text" style="text-align:left;" placeholder="Beschreibung"/>' +
        '<input class="ct-input ct-otd-inp" data-field="amt"  type="number" step="0.01" inputmode="decimal" placeholder="0,00"/>' +
        '<button class="ct-btn-sm primary" onclick="ctlOtDrawerAdd()" title="Hinzufügen"><i class="ti ti-plus"></i></button>' +
      '</div>' +
    '</div>';

  // Entries list
  let listHtml = '<div class="ct-section">' +
    '<div class="ct-section__ttl"><span>Einträge</span></div>';
  if (!entries.length) {
    listHtml += '<div style="padding:20px 0;text-align:center;color:var(--cc-stone);font-size:12px;">' +
      (filterScope.length ? 'Keine Einträge für diesen Filter' : 'Noch keine Einträge') +
      '</div>';
  } else {
    for (const o of entries) {
      const cmp  = o.company ? String(o.company) : '';
      const itm  = o.item    ? String(o.item)    : '';
      const desc = cmp && itm ? '<strong>' + cmp + '</strong> · ' + itm
                              : (cmp || itm || '—');
      listHtml +=
        '<div class="ct-row">' +
          '<div class="ct-row__lbl" style="font-size:12px;">' + desc + '<small>' + fmtOtDate(o.invoice_date) + '</small></div>' +
          '<div class="ct-row__lbl" style="text-align:right;font-variant-numeric:tabular-nums;font-size:13px;">' + ctlEur(o.amount) + '</div>' +
          '<div style="text-align:right;"><button class="ct-btn-sm" onclick="ctlOtDelete(' + o.id + ')" title="Löschen"><i class="ti ti-trash"></i></button></div>' +
        '</div>';
    }
  }
  listHtml += '</div>';

  return summaryHtml + addFormHtml + listHtml;
}

function wireOtDrawer() {
  // Focus Firma input for rapid entry
  setTimeout(() => {
    const firma = document.querySelector('#ctDrawerBody input.ct-otd-inp[data-field="company"]');
    firma?.focus();
  }, 100);

  // Enter key on any input submits
  document.querySelectorAll('#ctDrawerBody input.ct-otd-inp').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.ctlOtDrawerAdd();
      }
    });
  });
}

function fmtOtDate(iso) {
  const d = ctlParseDate(iso);
  return String(d.day).padStart(2,'0') + '.' + String(d.month).padStart(2,'0') + '.' + String(d.year).slice(2);
}

window.ctlOtDrawerAdd = async function () {
  if (!_ctlOtDrawerPid) return;
  const inps = {};
  document.querySelectorAll('#ctDrawerBody input.ct-otd-inp').forEach(inp => {
    inps[inp.dataset.field] = inp.value;
  });
  const date    = inps.date;
  const company = (inps.company || '').trim() || null;
  const item    = (inps.item    || '').trim();
  const amt     = Number(inps.amt);
  if (!date || !item || !amt) { ctlToast('Datum · Beschreibung · Betrag'); return; }
  try {
    await ctlInsertOneTime(_ctlOtDrawerPid, date, item, amt, company);
    ctlToast('Hinzugefügt');
    document.getElementById('ctDrawerBody').innerHTML = renderOtDrawerBody(_ctlOtDrawerPid);
    wireOtDrawer();
    window.renderDashboard?.();  // dashboard totals depend on this
  } catch (e) {
    console.error(e); ctlToast('Fehler beim Speichern');
  }
};

window.ctlOtDelete = async function (id) {
  if (!confirm('Eintrag löschen?')) return;
  try {
    await ctlDeleteOneTime(id);
    if (_ctlOtDrawerPid) {
      document.getElementById('ctDrawerBody').innerHTML = renderOtDrawerBody(_ctlOtDrawerPid);
      wireOtDrawer();
    }
    window.renderDashboard?.();
    ctlToast('Gelöscht');
  } catch (e) {
    console.error(e); ctlToast('Fehler');
  }
};
