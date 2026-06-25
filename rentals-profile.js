/* ─────────────────────────────────────────────────────────────
   RENTALS — PROFILE MODAL
   rentals-profile.js

   Slide-in profile panel for Rentals nav dropdown.
   Source of truth: same Supabase `settings` row as Casa Castel.
   Sections: Vermieter · Objekt · Bankverbindung · Energieausweis

   Depends on: constants.js, supabase-client.js, settings.js
   ───────────────────────────────────────────────────────────── */


/* ── STYLES ──────────────────────────────────────────────── */
(function _injectRentalsProfileStyles() {
  if (document.getElementById('rp-profile-styles')) return;
  const s = document.createElement('style');
  s.id = 'rp-profile-styles';
  s.textContent = `

/* Overlay */
.rp-prf-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 500;
  pointer-events: none;
}
.rp-prf-overlay.open {
  display: flex;
  pointer-events: none;
}
.rp-prf-overlay.open::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(30,27,24,.18);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}

/* Panel */
.rp-prf-panel {
  position: absolute;
  top: 0; bottom: 0; right: 0;
  width: 420px;
  max-width: 100%;
  background: var(--cc-bg);
  border-left: 0.5px solid var(--cc-rule);
  box-shadow: -6px 0 28px rgba(30,27,24,.10);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  animation: rpPrfSlide .24s cubic-bezier(.32,.72,0,1);
}
@keyframes rpPrfSlide {
  from { transform: translateX(32px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@media (max-width: 700px) {
  .rp-prf-panel {
    width: 100%;
    border-left: none;
    animation: rpPrfSlideUp .26s cubic-bezier(.32,.72,0,1);
  }
  @keyframes rpPrfSlideUp {
    from { transform: translateY(24px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
}

/* Header */
.rp-prf-hdr {
  flex-shrink: 0;
  background: var(--cc-white);
  border-bottom: 0.5px solid var(--cc-rule);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rp-prf-hdr__title {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 22px;
  font-weight: 300;
  color: var(--cc-ink);
  line-height: 1;
}
.rp-prf-hdr__sub {
  font-size: 10px;
  color: var(--cc-taupe);
  margin-top: 3px;
  letter-spacing: .04em;
}
.rp-prf-hdr__close {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--cc-surface);
  border: 0.5px solid var(--cc-rule);
  display: flex; align-items: center; justify-content: center;
  color: var(--cc-taupe);
  font-size: 13px;
  cursor: pointer;
  transition: background .15s;
  -webkit-tap-highlight-color: transparent;
}
.rp-prf-hdr__close:hover { background: var(--cc-rule); }

/* Body */
.rp-prf-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: max(40px, env(safe-area-inset-bottom, 40px));
}

/* Save status toast */
.rp-prf-toast {
  position: absolute;
  bottom: max(24px, env(safe-area-inset-bottom, 24px));
  left: 50%; transform: translateX(-50%);
  background: var(--cc-ink);
  color: var(--cc-white);
  font-size: 12px;
  padding: 8px 16px;
  border-radius: 20px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s;
  white-space: nowrap;
  z-index: 10;
}
.rp-prf-toast.show { opacity: 1; }

/* Card */
.rp-prf-card {
  background: var(--cc-white);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-lg);
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color .15s;
}
.rp-prf-card--editing { border-top: 2px solid var(--cc-gold); }

/* Card header */
.rp-prf-card__hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border-bottom: 0.5px solid var(--cc-rule);
  background: var(--cc-white);
}
.rp-prf-card--editing .rp-prf-card__hdr {
  background: #FBF7F2;
  border-bottom-color: var(--cc-gold-lt);
}
.rp-prf-card__title {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--cc-taupe);
}
.rp-prf-card--editing .rp-prf-card__title { color: var(--cc-charcoal); }

/* Edit / Save / Cancel buttons */
.rp-prf-btn-edit {
  font-size: 10px; font-weight: 500;
  color: var(--cc-gold);
  background: none; border: none;
  display: flex; align-items: center; gap: 3px;
  cursor: pointer; padding: 0;
  letter-spacing: .05em;
  -webkit-tap-highlight-color: transparent;
}
.rp-prf-btn-edit i { font-size: 11px; }
.rp-prf-save-cancel { display: flex; gap: 6px; }
.rp-prf-btn-cancel {
  height: 26px; padding: 0 10px;
  background: transparent;
  color: var(--cc-taupe);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-sm);
  font-size: 9px; font-weight: 500;
  letter-spacing: .07em; text-transform: uppercase;
  cursor: pointer; font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.rp-prf-btn-save {
  height: 26px; padding: 0 12px;
  background: var(--cc-ink);
  color: var(--cc-white);
  border: none;
  border-radius: var(--cc-r-sm);
  font-size: 9px; font-weight: 500;
  letter-spacing: .07em; text-transform: uppercase;
  cursor: pointer; font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.rp-prf-btn-save:disabled { opacity: .5; cursor: not-allowed; }

/* Read rows */
.rp-prf-rows { padding: 2px 0; }
.rp-prf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 0.5px solid #F0EBE3;
  min-height: 38px;
}
.rp-prf-row:last-child { border-bottom: none; }
.rp-prf-lbl {
  font-size: 11px;
  color: var(--cc-stone);
  min-width: 100px;
  flex-shrink: 0;
}
.rp-prf-val {
  font-size: 13px;
  color: var(--cc-charcoal);
  font-weight: 300;
  flex: 1;
  word-break: break-word;
}
.rp-prf-empty {
  font-size: 13px;
  color: var(--cc-stone);
  font-style: italic;
}
.rp-prf-iban {
  font-size: 12px;
  letter-spacing: .05em;
  background: var(--cc-surface);
  color: var(--cc-charcoal);
  padding: 2px 7px;
  border-radius: var(--cc-r-sm);
}

/* Edit inputs */
.rp-prf-edit-body { padding: 10px 14px 14px; }
.rp-prf-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.rp-prf-field:last-child { margin-bottom: 0; }
.rp-prf-field label {
  font-size: 10px; font-weight: 500;
  letter-spacing: .09em; text-transform: uppercase;
  color: var(--cc-taupe);
}
.rp-prf-input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: var(--cc-bg);
  border: 0.5px solid var(--cc-rule);
  border-radius: var(--cc-r-sm);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 16px; /* 16px prevents iOS zoom */
  font-weight: 300;
  color: var(--cc-ink);
  outline: none;
  box-sizing: border-box;
  -webkit-appearance: none;
  transition: border-color .15s, box-shadow .15s;
}
.rp-prf-input:focus {
  border-color: var(--cc-gold);
  box-shadow: 0 0 0 2px var(--cc-gold-lt);
}
.rp-prf-input::placeholder { color: var(--cc-stone); font-style: italic; }
.rp-prf-input--mono { font-family: 'Inter', monospace; letter-spacing: .04em; }
.rp-prf-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.rp-prf-field-row .rp-prf-field { margin-bottom: 0; }

/* Energia badge */
.rp-prf-energy-badge {
  display: inline-flex; align-items: center;
  background: var(--cc-gold-lt);
  color: #7A5A2A;
  border: 0.5px solid var(--cc-gold);
  border-radius: var(--cc-r-sm);
  font-size: 11px; font-weight: 500;
  padding: 2px 8px;
}

`;
  document.head.appendChild(s);
})();


/* ── SECTIONS CONFIG ─────────────────────────────────────── */
const _RP_SECTIONS = [
  {
    key:    'vermieter',
    title:  'Vermieter',
    fields: [
      { key: 'vermieter_name',    label: 'Name',    placeholder: 'Vor- und Nachname…' },
      { key: 'vermieter_adresse', label: 'Adresse', placeholder: 'Straße, PLZ Ort…' },
      { key: 'vermieter_email',   label: 'E-Mail',  placeholder: 'email@beispiel.de', type: 'email' },
    ],
  },
  {
    key:    'bank',
    title:  'Bankverbindung',
    fields: [
      { key: 'kontoinhaber', label: 'Kontoinhaber', placeholder: 'Name des Kontoinhabers…' },
      { key: 'bankname',     label: 'Bank',         placeholder: 'z.B. DKB' },
      { key: 'iban',         label: 'IBAN',         placeholder: 'DE00 0000 0000 0000 0000 00', mono: true },
      { key: 'bic',          label: 'BIC',          placeholder: 'XXXXXXXX' },
    ],
  },
];


/* ── BUILD SHELL ─────────────────────────────────────────── */
function _buildRentalsProfileShell() {
  if (document.getElementById('rpPrfOverlay')) return;
  const el = document.createElement('div');
  el.id        = 'rpPrfOverlay';
  el.className = 'rp-prf-overlay';
  el.innerHTML = `
    <div class="rp-prf-panel" id="rpPrfPanel">
      <div class="rp-prf-hdr">
        <div>
          <div class="rp-prf-hdr__title">Profile</div>
          <div class="rp-prf-hdr__sub">Vermieter · Bank · shared with Casa Castel</div>
        </div>
        <button class="rp-prf-hdr__close" id="rpPrfClose" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="rp-prf-body" id="rpPrfBody"></div>
      <div class="rp-prf-toast" id="rpPrfToast"></div>
    </div>
  `;
  document.getElementById('appShell')?.appendChild(el);

  // Close on backdrop click
  el.addEventListener('click', e => {
    if (e.target === el) closeRentalsProfile();
  });
  document.getElementById('rpPrfClose').addEventListener('click', closeRentalsProfile);
}


/* ── OPEN / CLOSE ────────────────────────────────────────── */
async function openRentalsProfile() {
  _buildRentalsProfileShell();
  document.getElementById('rpPrfOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  // Close nav dropdown if open
  document.getElementById('navProfileMenu')?.classList.remove('open');

  // Load settings from Supabase (shared table)
  if (typeof loadSettings === 'function') {
    await loadSettings();
  }
  _rpRenderAll();
}

function closeRentalsProfile() {
  document.getElementById('rpPrfOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}


/* ── RENDER ALL ──────────────────────────────────────────── */
function _rpRenderAll() {
  const body = document.getElementById('rpPrfBody');
  if (!body) return;
  body.innerHTML = '';
  _RP_SECTIONS.forEach(sec => {
    const card = document.createElement('div');
    card.className    = 'rp-prf-card';
    card.dataset.section = sec.key;
    body.appendChild(card);
    _rpRenderCard(sec.key, false);
  });
}


/* ── RENDER CARD ─────────────────────────────────────────── */
function _rpRenderCard(sectionKey, editing) {
  const sec  = _RP_SECTIONS.find(s => s.key === sectionKey);
  const card = document.querySelector(`.rp-prf-card[data-section="${sectionKey}"]`);
  if (!sec || !card) return;

  const s = (typeof appSettings !== 'undefined') ? appSettings : {};

  const actionsHTML = editing
    ? `<div class="rp-prf-save-cancel">
         <button class="rp-prf-btn-cancel" data-cancel="${sectionKey}">Cancel</button>
         <button class="rp-prf-btn-save"   data-save="${sectionKey}">Save</button>
       </div>`
    : `<button class="rp-prf-btn-edit" data-edit="${sectionKey}">
         <i class="ti ti-pencil"></i> Edit
       </button>`;

  if (editing) {
    card.className = 'rp-prf-card rp-prf-card--editing';
    card.innerHTML = `
      <div class="rp-prf-card__hdr">
        <span class="rp-prf-card__title">${sec.title}</span>
        ${actionsHTML}
      </div>
      <div class="rp-prf-edit-body">
        ${sec.fields.map(f => `
          <div class="rp-prf-field">
            <label>${f.label}</label>
            <input class="rp-prf-input${f.mono ? ' rp-prf-input--mono' : ''}"
              data-key="${f.key}"
              type="${f.type || 'text'}"
              value="${_rpEsc(s[f.key] || '')}"
              placeholder="${f.placeholder || ''}"
              autocomplete="off"
            />
          </div>
        `).join('')}
      </div>
    `;
  } else {
    card.className = 'rp-prf-card';
    const rowsHTML = sec.fields.map(f => {
      const val = s[f.key];
      let valHTML;
      if (!val) {
        valHTML = `<span class="rp-prf-empty">—</span>`;
      } else if (f.key === 'iban') {
        valHTML = `<span class="rp-prf-iban">${_rpEsc(val)}</span>`;
      } else if (f.key === 'energieklasse') {
        valHTML = `<span class="rp-prf-energy-badge">${_rpEsc(val)}</span>`;
      } else {
        valHTML = `<span class="rp-prf-val">${_rpEsc(val)}</span>`;
      }
      return `
        <div class="rp-prf-row">
          <span class="rp-prf-lbl">${f.label}</span>
          ${valHTML}
        </div>`;
    }).join('');
    card.innerHTML = `
      <div class="rp-prf-card__hdr">
        <span class="rp-prf-card__title">${sec.title}</span>
        ${actionsHTML}
      </div>
      <div class="rp-prf-rows">${rowsHTML}</div>
    `;
  }

  _rpBindCard(card, sectionKey);
}


/* ── BIND ────────────────────────────────────────────────── */
function _rpBindCard(card, sectionKey) {
  card.querySelector(`[data-edit="${sectionKey}"]`)?.addEventListener('click', () => {
    _rpRenderCard(sectionKey, true);
    card.querySelector('.rp-prf-input')?.focus();
  });
  card.querySelector(`[data-cancel="${sectionKey}"]`)?.addEventListener('click', () => {
    _rpRenderCard(sectionKey, false);
  });
  card.querySelector(`[data-save="${sectionKey}"]`)?.addEventListener('click', () => {
    _rpDoSave(sectionKey, card);
  });
}


/* ── SAVE ────────────────────────────────────────────────── */
async function _rpDoSave(sectionKey, card) {
  const saveBtn = card.querySelector(`[data-save="${sectionKey}"]`);
  if (saveBtn) saveBtn.disabled = true;

  const sec    = _RP_SECTIONS.find(s => s.key === sectionKey);
  const fields = {};
  card.querySelectorAll('.rp-prf-input[data-key]').forEach(inp => {
    fields[inp.dataset.key] = inp.value.trim();
  });

  const result = (typeof updateSettings === 'function')
    ? await updateSettings(fields)
    : { ok: false, error: 'No settings module loaded.' };

  if (result.ok) {
    _rpRenderCard(sectionKey, false);
    _rpShowToast('Saved');
  } else {
    if (saveBtn) saveBtn.disabled = false;
    _rpShowToast('Save failed — ' + (result.error || 'unknown error'));
  }
}


/* ── TOAST ───────────────────────────────────────────────── */
function _rpShowToast(msg) {
  const t = document.getElementById('rpPrfToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}


/* ── HELPER ──────────────────────────────────────────────── */
function _rpEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ── SUPABASE PREFILL (run once in SQL editor) ───────────────
   UPDATE settings SET bankname = 'DKB' WHERE id = (SELECT id FROM settings LIMIT 1);
   ─────────────────────────────────────────────────────────── */
