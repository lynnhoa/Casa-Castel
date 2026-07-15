/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SETUP TAB
   controlling-tab-setup.js

   Edit standing-plan values (used by "Confirm as expected"):
     · Unit default rents (Kalt/Neben)
     · Property expense defaults (Rate/Zinsen/Tilgung/Hausgeld/Grundsteuer/Strom)
     · Casa Castel category defaults
   Plus the active year selector.

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('tab-setup').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Setup</h1>
        <div class="ct-sub">Standing plan · Vorbelegungen für „Confirm as expected"</div>
      </div>
      <div>
        <label style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cc-taupe);display:block;text-align:right;margin-bottom:4px;">Jahr</label>
        <select id="ctYearSel" class="ct-input ct-input--filter" style="width:100px;text-align:center;">
        </select>
      </div>
    </div>

    <div class="ct-section">
      <div class="ct-section__ttl"><span>Mieteinheiten — Standardmiete</span></div>
      <div id="ctSetupUnits"></div>
    </div>

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
  /* Year selector */
  const yrSel = document.getElementById('ctYearSel');
  const now = new Date().getFullYear();
  yrSel.innerHTML = '';
  for (let y = 2026; y <= now + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === window._ctrl.year) opt.selected = true;
    yrSel.appendChild(opt);
  }
  yrSel.onchange = async () => {
    ctlShowLoading(true);
    try {
      await ctlLoadAll(Number(yrSel.value));
      window.renderSetup();
      window.renderDashboard?.();
    } catch (e) { console.error(e); ctlToast('Fehler beim Jahr laden'); }
    finally { ctlShowLoading(false); }
  };

  /* Units */
  const uHost = document.getElementById('ctSetupUnits');
  let uh = '<div class="ct-col-hdr"><div>Einheit</div><div>Kaltmiete</div><div>Nebenkosten</div></div>';
  for (const u of window._ctrl.units) {
    const p = ctlProp(u.property_id);
    uh +=
      '<div class="ct-row">' +
        '<div class="ct-row__lbl">' + (p?.name || '?') + ' · ' + u.name + '<small>' + (u.unit_type || '') + '</small></div>' +
        '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
          'data-setup="unit" data-id="' + u.id + '" data-field="def_kaltmiete" ' +
          'value="' + (u.def_kaltmiete ?? '') + '"/>' +
        '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
          'data-setup="unit" data-id="' + u.id + '" data-field="def_nebenkosten" ' +
          'value="' + (u.def_nebenkosten ?? '') + '"/>' +
      '</div>';
  }
  uHost.innerHTML = uh;

  /* Properties (apartment-style only — Casa uses categories below) */
  const pHost = document.getElementById('ctSetupProps');
  let ph = '<div style="overflow-x:auto;"><table class="ct-tbl" style="min-width:640px;">' +
    '<thead><tr>' +
      '<th>Immobilie</th>' +
      '<th class="num">Rate</th><th class="num">Zinsen</th><th class="num">Tilgung</th>' +
      '<th class="num">Hausgeld</th><th class="num">Grundst.</th><th class="num">Strom</th>' +
    '</tr></thead><tbody>';
  for (const p of window._ctrl.properties) {
    if (p.id === CASA_PROP_ID) continue;
    ph += '<tr><td>' + p.name + '</td>';
    for (const f of ['def_rate','def_zinsen','def_tilgung','def_hausgeld','def_grundsteuer','def_strom']) {
      ph += '<td class="num" style="padding:4px 4px;">' +
        '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
          'data-setup="prop" data-id="' + p.id + '" data-field="' + f + '" ' +
          'style="max-width:80px;" value="' + (p[f] ?? '') + '"/></td>';
    }
    ph += '</tr>';
  }
  ph += '</tbody></table></div>';
  pHost.innerHTML = ph;

  /* Casa categories */
  const cHost = document.getElementById('ctSetupCats');
  let ch = '<div class="ct-col-hdr"><div>Kategorie</div><div>Standard</div><div></div></div>';
  for (const c of window._ctrl.categories) {
    ch +=
      '<div class="ct-row">' +
        '<div class="ct-row__lbl">' + c.name + '<small>' + (c.frequency || '') + '</small></div>' +
        '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
          'data-setup="cat" data-id="' + c.id + '" data-field="default_amount" ' +
          'value="' + (c.default_amount ?? '') + '"/>' +
        '<div></div>' +
      '</div>';
  }
  cHost.innerHTML = ch;

  /* Wire save-on-blur for all setup inputs */
  document.querySelectorAll('#tab-setup input.ct-input[data-setup]').forEach(inp => {
    inp.addEventListener('focus', () => inp.classList.add('dirty'));
    inp.addEventListener('blur',  saveSetupField);
  });
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
