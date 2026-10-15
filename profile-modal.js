/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — PROFILE MODAL
   profile-modal.js

   Strategy: each card renders in READ or EDIT mode as a whole.
   Clicking Edit re-renders that card's inner HTML in edit mode.
   Clicking Save/Cancel re-renders it back in read mode.
   No display toggling on individual elements — zero CSS conflicts.

   Writes via updateSettings() from settings.js.
   Depends on: settings.js, utils.js
   ───────────────────────────────────────────────────────────── */


/* ── BUILD SHELL ─────────────────────────────────────────── */

function _buildProfileHTML() {
  if (document.getElementById('profileOverlay')) return;
  const el = document.createElement('div');
  el.id = 'profileOverlay';
  el.className = 'prf-overlay';
  el.innerHTML = `
    <div class="prf-panel" id="profilePanel">
      <div class="prf-hdr">
        <div>
          <div class="prf-hdr__title">Profile</div>
          <div class="prf-hdr__sub">Casa Castel</div>
        </div>
        <button class="prf-hdr__close" id="profileClose" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="prf-body" id="profileBody"></div>
    </div>
  `;
  document.getElementById('appShell')?.appendChild(el);
}


/* ── OPEN / CLOSE ────────────────────────────────────────── */

async function openProfile() {
  const overlay = document.getElementById('profileOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  await loadSettings();
  if (!appSettings.vermieter_email) appSettings.vermieter_email = 'mgmt.tenant.mainz@gmail.com';
  _renderAll();
}

function closeProfile() {
  document.getElementById('profileOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}


/* ── RENDER ALL SECTIONS ─────────────────────────────────── */

function _renderAll() {
  const body = document.getElementById('profileBody');
  if (!body) return;
  body.innerHTML = '';

  const sections = [
    { key: 'vermieter',      title: 'Vermieter' },
    { key: 'objekt',         title: 'Objekt' },
    { key: 'bank',           title: 'Bankverbindung' },
    { key: 'energieausweis', title: 'Energieausweis' },
    { key: 'gemeinschaft',   title: 'Gemeinschaftsräume' },
    { key: 'badezimmer',     title: 'Badezimmer' },
    { key: 'zaehler',        title: 'Zähler' },
  ];

  sections.forEach(({ key, title }) => {
    const card = document.createElement('div');
    card.className = 'prf-card';
    card.dataset.section = key;
    body.appendChild(card);
    _renderCard(key, title, false);
  });
}


/* ── RENDER ONE CARD ─────────────────────────────────────── */
/* editing=false → read view   editing=true → edit view      */

function _renderCard(section, title, editing) {
  const card = document.querySelector(`.prf-card[data-section="${section}"]`);
  if (!card) return;

  const s = appSettings;
  card.className = 'prf-card' + (editing ? ' prf-card--editing' : '');

  const header = `
    <div class="prf-card__hdr">
      <span class="prf-card__title">${title || section}</span>
      <div class="prf-card__actions">
        ${editing
          ? `<div class="prf-save-cancel">
               <button class="prf-btn-cancel" data-cancel="${section}">Cancel</button>
               <button class="prf-btn-save"   data-save="${section}">Save</button>
             </div>`
          : `<button class="prf-btn-edit" data-edit="${section}">
               <i class="ti ti-pencil" aria-hidden="true"></i> Edit
             </button>`
        }
      </div>
    </div>`;

  let body = '';

  if (['vermieter', 'objekt', 'bank', 'energieausweis'].includes(section)) {
    const fields = _fieldsFor(section, s);
    body = `<div class="prf-rows">` +
      fields.map(f => `
        <div class="prf-row">
          <span class="prf-lbl">${f.label}</span>
          ${editing
            ? `<input class="prf-inline" data-key="${f.key}"
                 value="${esc(s[f.key] || f.default || '')}"
                 type="${f.type || 'text'}"
                 placeholder="${f.placeholder || ''}"
                 autocomplete="off"/>`
            : `<span class="prf-val" data-field="${f.key}">${_readVal(f.key, s, f.default)}</span>`
          }
        </div>`).join('') +
      `</div>`;

  } else if (section === 'gemeinschaft' || section === 'badezimmer') {
    const listKey  = section === 'gemeinschaft' ? 'gemeinschaftsraeume' : 'badezimmer';
    const items    = s[listKey] || [];
    if (editing) {
      body = _editListBody(section, items);
    } else {
      body = `<div class="prf-rows prf-read-rows">` +
        (items.length
          ? items.map(n => `<div class="prf-row"><span class="prf-val prf-val--full">${esc(n)}</span></div>`).join('')
          : '<div class="prf-row"><span class="prf-empty">—</span></div>') +
        `</div>`;
    }

  } else if (section === 'zaehler') {
    const items = s.zaehler || [];
    if (editing) {
      body = _editZaehlerBody(items);
    } else {
      const TYPE_CLASS = { Strom: '', Gas: 'prf-z-type--gas', Wasser: 'prf-z-type--wasser' };
      body = `<div class="prf-rows prf-read-rows">` +
        (items.length
          ? items.map(z => `
              <div class="prf-row">
                <span class="prf-z-type ${TYPE_CLASS[z.type] || ''}">${esc(z.type)}</span>
                <span class="prf-val">${esc(z.nummer)}</span>
              </div>`).join('')
          : '<div class="prf-row"><span class="prf-empty">—</span></div>') +
        `</div>`;
    }
  }

  card.innerHTML = header + body;
  _bindCard(card, section);

  if (editing) {
    card.querySelector('.prf-inline, .prf-add-input, .prf-list-input')?.focus();
  }
}


/* ── FIELD DEFINITIONS ───────────────────────────────────── */

function _fieldsFor(section, s) {
  if (section === 'vermieter') return [
    { key: 'vermieter_name',    label: 'Name' },
    { key: 'vermieter_adresse', label: 'Adresse' },
    { key: 'vermieter_email',   label: 'E-Mail', type: 'email', placeholder: 'mgmt.tenant.mainz@gmail.com', default: 'mgmt.tenant.mainz@gmail.com' },
  ];
  if (section === 'objekt') return [
    { key: 'objekt_adresse',   label: 'Adresse' },
    { key: 'objekt_plz_ort',   label: 'PLZ / Ort' },
    { key: 'gerichtsstand',    label: 'Gerichtsstand' },
    { key: 'unterschrift_ort', label: 'Unterzeichnung (Casa Castel)' },
  ];
  if (section === 'bank') return [
    { key: 'kontoinhaber', label: 'Kontoinhaber' },
    { key: 'iban',         label: 'IBAN', placeholder: 'DE00 0000 0000 0000 0000 00' },
    { key: 'bic',          label: 'BIC' },
  ];
  if (section === 'energieausweis') return [
    { key: 'energieklasse',     label: 'Effizienzklasse',   placeholder: 'z. B. D' },
    { key: 'energieausweisart', label: 'Art des Ausweises', placeholder: 'Verbrauchsausweis' },
    { key: 'endenergiebedarf',  label: 'Endenergiebedarf',  placeholder: '142 kWh/(m²·a)' },
  ];
  return [];
}

function _readVal(key, s, fallback) {
  const v = s[key] || fallback || '';
  if (!v) return '<span class="prf-empty">—</span>';
  if (key === 'iban') return `<span class="prf-iban">${esc(v)}</span>`;
  if (key === 'vermieter_email') return `<a href="mailto:${esc(v)}" class="prf-email">${esc(v)}</a>`;
  return esc(v);
}


/* ── EDIT BODIES FOR LIST SECTIONS ──────────────────────── */

function _editListBody(section, items) {
  const rows = items.map((n, i) => `
    <div class="prf-list-item" data-idx="${i}">
      <input class="prf-list-input" data-list="${section}" data-idx="${i}"
             value="${esc(n)}" autocomplete="off"/>
      <button class="prf-list-remove" data-list="${section}" data-idx="${i}" aria-label="Entfernen">
        <i class="ti ti-trash"></i>
      </button>
    </div>`).join('');

  return `
    <div class="prf-list-edit">
      <div class="prf-list" id="prf-list-${section}">${rows}</div>
      <div class="prf-add-row">
        <input class="prf-add-input" id="prf-add-${section}" placeholder="Neu hinzufügen…" autocomplete="off"/>
        <button class="prf-add-btn" data-add="${section}"><i class="ti ti-plus"></i></button>
      </div>
    </div>`;
}

function _editZaehlerBody(items) {
  const rows = items.map((z, i) => {
    const opts = ['Strom','Gas','Wasser','Sonstige']
      .map(v => `<option value="${v}"${v === z.type ? ' selected' : ''}>${v}</option>`).join('');
    return `
      <div class="prf-list-item prf-list-item--z" data-idx="${i}">
        <select class="prf-z-select" data-idx="${i}">${opts}</select>
        <input  class="prf-z-input"  data-idx="${i}" value="${esc(z.nummer)}" placeholder="Nummer…" autocomplete="off"/>
        <button class="prf-list-remove" data-list="zaehler" data-idx="${i}" aria-label="Entfernen">
          <i class="ti ti-trash"></i>
        </button>
      </div>`;
  }).join('');

  return `
    <div class="prf-list-edit">
      <div class="prf-list" id="prf-list-zaehler">${rows}</div>
      <div class="prf-add-row prf-zaehler-add">
        <select class="prf-add-select" id="prf-add-zaehler-type">
          <option value="Strom">Strom</option>
          <option value="Gas">Gas</option>
          <option value="Wasser">Wasser</option>
          <option value="Sonstige">Sonstige</option>
        </select>
        <input class="prf-add-input" id="prf-add-zaehler-nr" placeholder="Nummer…" autocomplete="off"/>
        <button class="prf-add-btn" data-add="zaehler"><i class="ti ti-plus"></i></button>
      </div>
    </div>`;
}


/* ── BIND ONE CARD ───────────────────────────────────────── */

const _TITLES = {
  vermieter:      'Vermieter',
  objekt:         'Objekt',
  bank:           'Bankverbindung',
  energieausweis: 'Energieausweis',
  gemeinschaft:   'Gemeinschaftsräume',
  badezimmer:     'Badezimmer',
  zaehler:        'Zähler',
};

function _bindCard(card, section) {
  /* Edit button */
  card.querySelector('[data-edit]')?.addEventListener('click', e => {
    e.stopPropagation();
    _renderCard(section, _TITLES[section], true);
  });

  /* Cancel button */
  card.querySelector('[data-cancel]')?.addEventListener('click', () => {
    _renderCard(section, _TITLES[section], false);
  });

  /* Save button */
  card.querySelector('[data-save]')?.addEventListener('click', () => {
    _doSave(section);
  });

  /* Add button */
  card.querySelector('[data-add]')?.addEventListener('click', e => {
    _addListItem(e.currentTarget.dataset.add);
  });

  /* Remove buttons (delegation for dynamically added rows) */
  card.addEventListener('click', e => {
    const rb = e.target.closest('.prf-list-remove');
    if (rb) _removeListItem(rb.dataset.list, parseInt(rb.dataset.idx, 10));
  });

  /* Enter in add inputs */
  const addSections = section === 'zaehler'
    ? [{ id: 'prf-add-zaehler-nr', key: 'zaehler' }]
    : section === 'gemeinschaft' || section === 'badezimmer'
      ? [{ id: `prf-add-${section}`, key: section }]
      : [];
  addSections.forEach(({ id, key }) => {
    card.querySelector(`#${id}`)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') _addListItem(key); });
  });
}


/* ── SAVE ────────────────────────────────────────────────── */

async function _doSave(section) {
  const card    = document.querySelector(`.prf-card[data-section="${section}"]`);
  const saveBtn = card?.querySelector('[data-save]');
  if (!card || !saveBtn) return;

  saveBtn.textContent = '…';
  saveBtn.disabled    = true;

  let fields = {};

  if (['vermieter', 'objekt', 'bank', 'energieausweis'].includes(section)) {
    card.querySelectorAll('.prf-inline[data-key]').forEach(inp => {
      fields[inp.dataset.key] = inp.value.trim();
    });

  } else if (section === 'gemeinschaft') {
    fields.gemeinschaftsraeume = _collectList(card, 'gemeinschaft');

  } else if (section === 'badezimmer') {
    fields.badezimmer = _collectList(card, 'badezimmer');

  } else if (section === 'zaehler') {
    const items = [];
    card.querySelectorAll('.prf-list-item--z').forEach(row => {
      const type   = row.querySelector('.prf-z-select')?.value;
      const nummer = row.querySelector('.prf-z-input')?.value.trim();
      if (type && nummer) items.push({ type, nummer });
    });
    fields.zaehler = items;
  }

  const result = await updateSettings(fields);

  if (!result.ok) {
    saveBtn.textContent = 'Error';
    saveBtn.disabled    = false;
    setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 2000);
    return;
  }

  /* Re-render this card in read mode with fresh appSettings (already updated by updateSettings) */
  _renderCard(section, _TITLES[section], false);
}

function _collectList(card, listKey) {
  const items = [];
  card.querySelectorAll(`.prf-list-input[data-list="${listKey}"]`).forEach(inp => {
    const v = inp.value.trim();
    if (v) items.push(v);
  });
  return items;
}


/* ── LIST ITEM ADD / REMOVE ──────────────────────────────── */

function _addListItem(listKey) {
  if (listKey === 'zaehler') {
    const type = document.getElementById('prf-add-zaehler-type')?.value;
    const nr   = document.getElementById('prf-add-zaehler-nr')?.value.trim();
    if (!type || !nr) return;
    const list = document.getElementById('prf-list-zaehler');
    if (!list) return;
    const idx  = list.querySelectorAll('.prf-list-item').length;
    const opts = ['Strom','Gas','Wasser','Sonstige']
      .map(v => `<option value="${v}"${v === type ? ' selected' : ''}>${v}</option>`).join('');
    const row = document.createElement('div');
    row.className = 'prf-list-item prf-list-item--z';
    row.dataset.idx = idx;
    row.innerHTML = `
      <select class="prf-z-select" data-idx="${idx}">${opts}</select>
      <input  class="prf-z-input"  data-idx="${idx}" value="${esc(nr)}" placeholder="Nummer…" autocomplete="off"/>
      <button class="prf-list-remove" data-list="zaehler" data-idx="${idx}" aria-label="Entfernen">
        <i class="ti ti-trash"></i>
      </button>`;
    list.appendChild(row);
    document.getElementById('prf-add-zaehler-nr').value = '';
    return;
  }

  const inp  = document.getElementById(`prf-add-${listKey}`);
  const name = inp?.value.trim();
  if (!name) return;
  const list = document.getElementById(`prf-list-${listKey}`);
  if (!list) return;
  const idx  = list.querySelectorAll('.prf-list-item').length;
  const row  = document.createElement('div');
  row.className = 'prf-list-item';
  row.dataset.idx = idx;
  row.innerHTML = `
    <input class="prf-list-input" data-list="${listKey}" data-idx="${idx}"
           value="${esc(name)}" autocomplete="off"/>
    <button class="prf-list-remove" data-list="${listKey}" data-idx="${idx}" aria-label="Entfernen">
      <i class="ti ti-trash"></i>
    </button>`;
  list.appendChild(row);
  inp.value = '';
  inp.focus();
}

function _removeListItem(listKey, idx) {
  const list = document.getElementById(`prf-list-${listKey}`);
  list?.querySelector(`.prf-list-item[data-idx="${idx}"]`)?.remove();
  list?.querySelectorAll('.prf-list-item').forEach((el, i) => {
    el.dataset.idx = i;
    el.querySelectorAll('[data-idx]').forEach(c => c.dataset.idx = i);
  });
}


/* ── INIT ────────────────────────────────────────────────── */

function initProfileModal() {
  _injectStyles();
  _buildProfileHTML();

  document.addEventListener('click', e => {
    if (e.target.closest('#profileClose')) closeProfile();
  });

  document.addEventListener('pointerdown', e => {
    const overlay = document.getElementById('profileOverlay');
    if (!overlay?.classList.contains('open')) return;
    const panel = document.getElementById('profilePanel');
    if (panel && !panel.contains(e.target)) closeProfile();
  });
}


/* ── STYLES ──────────────────────────────────────────────── */

function _injectStyles() {
  if (document.getElementById('prf-styles')) return;
  const s = document.createElement('style');
  s.id = 'prf-styles';
  s.textContent = `

.prf-overlay {
  display: none;
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 500;
  pointer-events: none;
}
.prf-overlay.open {
  display: flex;
  pointer-events: none;
}
.prf-panel {
  position: absolute;
  top: 0; bottom: 0; right: 0;
  width: 480px;
  max-width: 100%;
  background: var(--cc-bg);
  border-left: 0.5px solid var(--cc-rule);
  box-shadow: -6px 0 28px rgba(30,27,24,0.10);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  pointer-events: auto;
  animation: prfSlide 0.24s cubic-bezier(0.32,0.72,0,1);
}
@keyframes prfSlide {
  from { transform: translateX(32px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
.prf-overlay.open::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(30,27,24,0.18);
  backdrop-filter: blur(2px);
  pointer-events: none;
}
@media (max-width: 700px) {
  .prf-panel {
    width: 100%;
    border-left: none;
    animation: prfSlideUp 0.26s cubic-bezier(0.32,0.72,0,1);
  }
  @keyframes prfSlideUp {
    from { transform: translateY(24px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
}
.prf-hdr {
  flex-shrink: 0;
  background: var(--cc-white);
  border-bottom: 0.5px solid var(--cc-rule);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.prf-hdr__title {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 22px;
  font-weight: 300;
  color: var(--cc-ink);
  line-height: 1;
}
.prf-hdr__sub {
  font-size: 10px;
  color: var(--cc-taupe);
  margin-top: 3px;
  letter-spacing: 0.04em;
}
.prf-hdr__close {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--cc-surface);
  border: 0.5px solid var(--cc-rule);
  display: flex; align-items: center; justify-content: center;
  color: var(--cc-taupe);
  font-size: 13px;
  transition: background 0.15s;
}
.prf-hdr__close:hover { background: var(--cc-rule); }
.prf-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: max(80px, env(safe-area-inset-bottom, 80px));
}
.prf-card {
  background: var(--cc-white);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-lg);
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color 0.15s;
}
.prf-card--editing {
  border-top: 2px solid var(--cc-gold);
}
.prf-card__hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border-bottom: 0.5px solid var(--cc-rule);
  background: var(--cc-white);
}
.prf-card--editing .prf-card__hdr {
  background: #FBF7F2;
  border-bottom-color: var(--cc-gold-lt);
}
.prf-card__title {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cc-taupe);
}
.prf-card--editing .prf-card__title { color: var(--cc-charcoal); }
.prf-card__actions { display: flex; align-items: center; }
.prf-btn-edit {
  font-size: 10px;
  font-weight: 500;
  color: var(--cc-gold);
  background: none;
  border: none;
  display: flex; align-items: center; gap: 3px;
  cursor: pointer;
  padding: 0;
  letter-spacing: 0.05em;
  -webkit-tap-highlight-color: transparent;
}
.prf-btn-edit i { font-size: 11px; }
.prf-save-cancel { display: flex; gap: 6px; }
.prf-btn-cancel {
  height: 26px; padding: 0 10px;
  background: transparent;
  color: var(--cc-taupe);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-sm);
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.07em; text-transform: uppercase;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.prf-btn-save {
  height: 26px; padding: 0 12px;
  background: var(--cc-ink);
  color: var(--cc-white);
  border: none;
  border-radius: var(--cc-r-sm);
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.07em; text-transform: uppercase;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.prf-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.prf-rows { padding: 2px 0; }
.prf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 0.5px solid #F0EBE3;
  min-height: 38px;
}
.prf-row:last-child { border-bottom: none; }
.prf-lbl {
  font-size: 11px;
  color: var(--cc-stone);
  min-width: 96px;
  flex-shrink: 0;
}
.prf-val {
  font-size: 13px;
  color: var(--cc-charcoal);
  font-weight: 300;
  flex: 1;
}
.prf-val--full { min-width: 0; flex: 1; }
.prf-empty {
  font-size: 13px;
  color: var(--cc-stone);
  font-style: italic;
}
.prf-iban {
  font-family: 'Inter', monospace;
  font-size: 12px;
  letter-spacing: 0.05em;
  background: var(--cc-surface);
  color: var(--cc-charcoal);
  padding: 2px 7px;
  border-radius: var(--cc-r-sm);
}
.prf-inline {
  flex: 1;
  height: 30px;
  background: var(--cc-bg);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-sm);
  padding: 0 9px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 300;
  color: var(--cc-ink);
  outline: none;
  box-sizing: border-box;
  -webkit-appearance: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.prf-inline:focus {
  border-color: var(--cc-gold);
  box-shadow: 0 0 0 2px var(--cc-gold-lt);
}
.prf-inline::placeholder { color: var(--cc-stone); font-style: italic; }
.prf-list-edit { padding: 8px 14px 12px; }
.prf-list {
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-sm);
  overflow: hidden;
  margin-bottom: 6px;
  background: var(--cc-bg);
}
.prf-list:empty { display: none; }
.prf-list-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-bottom: 0.5px solid var(--cc-rule);
  background: var(--cc-bg);
}
.prf-list-item:last-child { border-bottom: none; }
.prf-list-input {
  flex: 1; min-height: 30px;
  background: transparent; border: none;
  padding: 4px 2px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px; font-weight: 300;
  color: var(--cc-charcoal);
  outline: none;
}
.prf-list-input:focus { color: var(--cc-ink); }
.prf-list-remove {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none;
  border-radius: var(--cc-r-sm);
  color: var(--cc-stone); font-size: 13px;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.prf-list-remove:hover { color: #C4705A; background: #FBF0EE; }
.prf-add-row {
  display: flex; gap: 6px; align-items: center;
  background: var(--cc-white);
  border: 0.5px dashed var(--cc-rule);
  border-radius: var(--cc-r-sm);
  padding: 5px 8px;
}
.prf-add-input {
  flex: 1; min-height: 30px;
  background: transparent; border: none;
  padding: 4px 2px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px; font-weight: 300;
  color: var(--cc-charcoal);
  outline: none;
}
.prf-add-input::placeholder { color: var(--cc-stone); }
.prf-add-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: var(--cc-surface);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-sm);
  color: var(--cc-charcoal); font-size: 14px;
  flex-shrink: 0;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.prf-add-btn:hover { background: var(--cc-rule); }
.prf-z-type {
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 2px 7px; border-radius: var(--cc-r-sm);
  background: var(--cc-gold-lt); color: #7A5A2A;
  border: 0.5px solid var(--cc-gold);
  flex-shrink: 0; min-width: 46px; text-align: center;
}
.prf-z-type--gas    { background:#EAF3DE; color:#27500A; border-color:#9AC87A; }
.prf-z-type--wasser { background:#E0EEF8; color:#1A4A6A; border-color:#7AB4D8; }
.prf-z-select {
  height: 30px;
  background: var(--cc-white);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-sm);
  padding: 0 8px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px; color: var(--cc-charcoal);
  outline: none; width: 82px; flex-shrink: 0;
  -webkit-appearance: none;
}
.prf-z-select:focus { border-color: var(--cc-gold); }
.prf-z-input {
  flex: 1; min-height: 30px;
  background: transparent; border: none;
  padding: 4px 2px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px; font-weight: 300;
  color: var(--cc-charcoal); outline: none;
}
.prf-list-item--z { align-items: center; gap: 6px; }
.prf-zaehler-add { flex-wrap: wrap; gap: 6px; }
.prf-add-select {
  height: 30px; background: transparent; border: none;
  padding: 4px; font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px; color: var(--cc-charcoal);
  outline: none; width: 82px; flex-shrink: 0;
  -webkit-appearance: none;
}

  `;
  document.head.appendChild(s);
}
