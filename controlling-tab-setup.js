/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SETUP TAB
   controlling-tab-setup.js

   Standing-plan defaults, grouped by property:
     · One card per property; its units listed inside
     · Wohnungen expense defaults (table)
     · Casa Castel category defaults
   No year selector — defaults are "current truth". Every change
   is logged to ctrl_setup_history; the "Historie" link opens the
   shared drawer with the change log.

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('tab-setup').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Setup</h1>
        <div class="ct-sub">Standardwerte · Vorbelegung für „Plan übernehmen"</div>
      </div>
      <button class="ct-btn-sm" id="ctSetupHistory" style="display:flex;align-items:center;gap:5px;">
        <i class="ti ti-history"></i> Historie
      </button>
    </div>

    <div id="ctSetupUnits"></div>

    <div class="ct-section">
      <div class="ct-section__ttl"><span>Wohnungen — Ausgaben-Standardwerte</span></div>
      <div id="ctSetupProps"></div>
    </div>

    <div class="ct-section">
      <div class="ct-section__ttl"><span>Casa Castel — Kategorien</span></div>
      <div id="ctSetupCats"></div>
    </div>
  </div>
`;

window.renderSetup = function () {
  /* ── Units, grouped per property ──────────────────────────── */
  const uHost = document.getElementById('ctSetupUnits');
  let html = '';
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const units = ctlUnitsOf(p.id);
    if (!units.length) continue;
    let rows = '<div class="ct-col-hdr"><div>Einheit</div><div>Kaltmiete</div><div>Nebenkosten</div></div>';
    for (const u of units) {
      const sub = (u.unit_type && u.unit_type !== u.name) ? '<small>' + u.unit_type + '</small>' : '';
      rows +=
        '<div class="ct-row">' +
          '<div class="ct-row__lbl">' + u.name + sub + '</div>' +
          '<input class="ct-input ct-input--setup" type="number" step="0.01" inputmode="decimal" ' +
            'data-setup="unit" data-id="' + u.id + '" data-field="def_kaltmiete" ' +
            'value="' + (u.def_kaltmiete ?? '') + '"/>' +
          '<input class="ct-input ct-input--setup" type="number" step="0.01" inputmode="decimal" ' +
            'data-setup="unit" data-id="' + u.id + '" data-field="def_nebenkosten" ' +
            'value="' + (u.def_nebenkosten ?? '') + '"/>' +
        '</div>';
    }
    html +=
      '<div class="ct-section ct-setup-group">' +
        '<div class="ct-setup-group__name">' + p.name + '</div>' +
        rows +
      '</div>';
  }
  uHost.innerHTML = html;

  /* ── Wohnungen — expense defaults (scrollable table) ───────── */
  const pHost = document.getElementById('ctSetupProps');
  let ph = '<div style="overflow-x:auto;"><table class="ct-tbl" style="min-width:640px;">' +
    '<thead><tr>' +
      '<th>Immobilie</th>' +
      '<th class="num">Rate</th><th class="num">Zinsen</th><th class="num">Tilgung</th>' +
      '<th class="num">Hausgeld</th><th class="num">Grundst.</th><th class="num">Strom</th>' +
    '</tr></thead><tbody>';
  for (const p of window._ctrl.properties) {
    if (p.id === CASA_PROP_ID || !p.active) continue;
    ph += '<tr><td>' + p.name + '</td>';
    for (const f of ['def_rate','def_zinsen','def_tilgung','def_hausgeld','def_grundsteuer','def_strom']) {
      ph += '<td class="num" style="padding:4px 4px;">' +
        '<input class="ct-input ct-input--setup" type="number" step="0.01" inputmode="decimal" ' +
          'data-setup="prop" data-id="' + p.id + '" data-field="' + f + '" ' +
          'style="max-width:84px;" value="' + (p[f] ?? '') + '"/></td>';
    }
    ph += '</tr>';
  }
  ph += '</tbody></table></div>';
  pHost.innerHTML = ph;

  /* ── Casa Castel categories ────────────────────────────────── */
  const cHost = document.getElementById('ctSetupCats');
  let ch = '<div class="ct-col-hdr"><div>Kategorie</div><div>Standard</div><div></div></div>';
  for (const c of window._ctrl.categories) {
    ch +=
      '<div class="ct-row">' +
        '<div class="ct-row__lbl">' + c.name + '<small>' + (c.frequency || '') + '</small></div>' +
        '<input class="ct-input ct-input--setup" type="number" step="0.01" inputmode="decimal" ' +
          'data-setup="cat" data-id="' + c.id + '" data-field="default_amount" ' +
          'value="' + (c.default_amount ?? '') + '"/>' +
        '<div></div>' +
      '</div>';
  }
  cHost.innerHTML = ch;

  /* ── Save on blur ──────────────────────────────────────────── */
  document.querySelectorAll('#tab-setup input.ct-input[data-setup]').forEach(inp => {
    inp.addEventListener('focus', () => inp.classList.add('dirty'));
    inp.addEventListener('blur',  saveSetupField);
  });

  document.getElementById('ctSetupHistory').onclick = ctlOpenHistory;
};

async function saveSetupField(e) {
  const inp   = e.currentTarget;
  const kind  = inp.dataset.setup;
  const id    = Number(inp.dataset.id);
  const field = inp.dataset.field;
  const val   = inp.value === '' ? null : Number(inp.value);
  try {
    if (kind === 'unit') {
      const u = ctlUnit(id);
      const kalt  = field === 'def_kaltmiete'   ? val : u.def_kaltmiete;
      const neben = field === 'def_nebenkosten' ? val : u.def_nebenkosten;
      await ctlUpdateUnitDefaults(id, kalt, neben);
    }
    else if (kind === 'prop') {
      await ctlUpdatePropertyDefaults(id, { [field]: val });
    }
    else if (kind === 'cat') {
      await ctlUpdateCategoryDefault(id, val);
    }
    inp.classList.remove('dirty');
    ctlToast('Gespeichert');
  } catch (err) {
    console.error(err); ctlToast('Fehler');
  }
}

/* ── Historie drawer ─────────────────────────────────────────── */

const FIELD_NAMES = {
  def_kaltmiete: 'Kaltmiete', def_nebenkosten: 'Nebenkosten',
  def_rate: 'Rate', def_zinsen: 'Zinsen', def_tilgung: 'Tilgung',
  def_hausgeld: 'Hausgeld', def_grundsteuer: 'Grundsteuer', def_strom: 'Strom',
  default_amount: 'Standardbetrag',
};

function historyEntityName(h) {
  if (h.entity_type === 'unit') {
    const u = ctlUnit(h.entity_id);
    if (!u) return 'Einheit #' + h.entity_id;
    const p = ctlProp(u.property_id);
    return (p ? p.name + ' · ' : '') + u.name;
  }
  if (h.entity_type === 'property') return ctlProp(h.entity_id)?.name || 'Immobilie #' + h.entity_id;
  if (h.entity_type === 'category') return ctlCat(h.entity_id)?.name || 'Kategorie #' + h.entity_id;
  return '#' + h.entity_id;
}

async function ctlOpenHistory() {
  document.getElementById('ctDrawerTitle').textContent = 'Historie · Standardwerte';
  document.getElementById('ctDrawer').dataset.opener = 'setup';
  document.getElementById('ctDrawerBody').innerHTML =
    '<div style="padding:30px 0;text-align:center;color:var(--cc-taupe);font-size:13px;">Lade…</div>';
  document.getElementById('ctDrawer').classList.add('open');

  let rows = [];
  try { rows = await ctlFetchHistory(200); }
  catch (e) {
    document.getElementById('ctDrawerBody').innerHTML =
      '<div style="padding:30px 0;text-align:center;color:var(--cc-notice-text);font-size:13px;">Historie konnte nicht geladen werden.</div>';
    return;
  }

  if (!rows.length) {
    document.getElementById('ctDrawerBody').innerHTML =
      '<div class="ct-section"><div style="padding:24px 0;text-align:center;color:var(--cc-stone);font-size:13px;">' +
      'Noch keine Änderungen protokolliert.<br><small style="font-size:11px;">Jede Änderung an Standardwerten erscheint hier automatisch.</small></div></div>';
    return;
  }

  const fmtVal = v => v === null || v === undefined ? '—' : ctlEur(v);
  const fmtDate = ts => {
    const d = new Date(ts);
    return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getFullYear()).slice(2) +
           ' · ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  };

  let html = '<div class="ct-section">';
  for (const h of rows) {
    html +=
      '<div class="ct-row" style="grid-template-columns:1fr auto;">' +
        '<div class="ct-row__lbl">' + historyEntityName(h) +
          '<small>' + (FIELD_NAMES[h.field] || h.field) + ' · ' + fmtDate(h.changed_at) + '</small></div>' +
        '<div style="font-size:13px;font-variant-numeric:lining-nums tabular-nums;color:var(--cc-ink);white-space:nowrap;">' +
          '<span style="color:var(--cc-stone);text-decoration:line-through;">' + fmtVal(h.old_value) + '</span>' +
          ' <span style="color:var(--cc-taupe);">→</span> ' + fmtVal(h.new_value) +
        '</div>' +
      '</div>';
  }
  html += '</div>';
  document.getElementById('ctDrawerBody').innerHTML = html;
}
