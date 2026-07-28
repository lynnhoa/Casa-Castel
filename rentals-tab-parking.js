/* ─────────────────────────────────────────────────────────────
   RENTALS — PARKING TAB
   rentals-tab-parking.js

   Full parking space management — direct parallel to rentals-tab-apartments.js:
   - Card list with expand/collapse, drag-to-sort (SortableJS)
   - Per-section inline edit (Identity, Miete, Schlüssel)
   - Vacant / occupied toggle
   - Contract modal: Mietvertrag (befristet + unbefristet)
   - Delete with confirmation

   Types: Tiefgarage · Stellplatz · Einzelgarage · Duplex-Anlage

   Depends on: rentals-constants.js, rentals-supabase-client.js
   ───────────────────────────────────────────────────────────── */


/* ── INJECT HTML ─────────────────────────────────────────── */
document.getElementById('tab-parking').innerHTML = `

  <div class="rp-hdr">
    <h1 class="rp-title">Parking</h1>
    <button class="rp-add-btn" id="pkAddBtn">
      <i class="ti ti-plus"></i> Add
    </button>
  </div>

  <div class="rp-summary" id="pkSummary" style="display:none">
    <div>
      <div class="rp-summary__label">Total Miete / Monat</div>
      <div class="rp-summary__breakdown" id="pkSummaryBreakdown"></div>
    </div>
    <div>
      <div class="rp-summary__total" id="pkSummaryTotal"></div>
      <div class="rp-summary__sub">occupied only</div>
    </div>
  </div>

  <div class="rp-list" id="pkList"></div>

  <!-- ══ CONTRACT MODAL ══ -->
  <div class="rm-overlay" id="pkContractOverlay">
    <div class="rm-sheet rm-sheet--tall">
      <div class="rm-sheet__hdr">
        <div>
          <div class="rm-contract-type" id="pkContractTypeLbl"></div>
          <div class="rm-sheet__title" id="pkContractTitleLbl"></div>
          <div class="rm-sheet__sub" id="pkContractSubLbl"></div>
        </div>
        <button class="rm-sheet__close" id="pkContractClose"><i class="ti ti-x"></i></button>
      </div>
      <div class="rm-sheet__body" id="pkContractBody"></div>
      <div class="rm-sheet__footer" id="pkContractFooter"></div>
    </div>
  </div>

  <!-- ══ CONFIRM DELETE ══ -->
  <div class="rm-confirm-overlay" id="pkConfirmOverlay">
    <div class="rm-confirm-box">
      <div class="rm-confirm-icon"><i class="ti ti-alert-triangle"></i></div>
      <div class="rm-confirm-title">Delete parking space</div>
      <div class="rm-confirm-body" id="pkConfirmBody"></div>
      <div class="rm-confirm-btns">
        <button class="rm-btn--cancel" id="pkConfirmCancel">Cancel</button>
        <button class="rm-btn--danger" id="pkConfirmOk"><i class="ti ti-trash"></i> Delete</button>
      </div>
    </div>
  </div>
`;


/* ── STYLES ──────────────────────────────────────────────── */
(function() {
  if (document.getElementById('pk-tab-styles-v1')) return;
  const s = document.createElement('style');
  s.id = 'pk-tab-styles-v1';
  s.textContent = `
/* ── CARD ── */
.pk-card {
  background:var(--cc-white); border:var(--cc-border); border-radius:var(--cc-r-lg);
  overflow:hidden; transition:box-shadow .2s;
}
.pk-card.pk--open { box-shadow:0 4px 24px rgba(30,27,24,.08); }

/* Header */
.pk-hdr {
  display:flex; align-items:flex-start; gap:10px;
  padding:14px 16px; cursor:pointer; user-select:none;
}
.pk-drag {
  color:var(--cc-stone); font-size:14px; flex-shrink:0; opacity:.4;
  margin-top:4px; cursor:grab; touch-action:none;
}
.pk-drag:hover { opacity:.9; }
.pk-hdr__info { flex:1; min-width:0; }
.pk-hdr__namerow { display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap; }
.pk-hdr__name { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; color:var(--cc-ink); line-height:1.1; }
.pk-status-badge { font-size:9px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; padding:3px 9px; border-radius:var(--cc-r-pill); flex-shrink:0; }
.pk-status--occupied { background:#EAF3DE; color:#27500A; border:.5px solid #9AC87A; }
.pk-status--vacant   { background:#F5F0EB; color:#8C6A3A; border:.5px solid #D4A87A; }
.pk-hdr__addr { font-size:10px; color:var(--cc-stone); margin-bottom:3px; }
.pk-hdr__tags { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:5px; }
.pk-tag { font-size:9px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; padding:2px 7px; border-radius:20px; }
.pk-tag--tg { background:#E6F1FB; color:#0C447C; border:.5px solid #85B7EB; }
.pk-tag--sp { background:var(--cc-surface); color:var(--cc-taupe); border:.5px solid var(--cc-rule); }
.pk-tag--eg { background:#EAF3DE; color:#27500A; border:.5px solid #9AC87A; }
.pk-tag--da { background:#FAEEDA; color:#633806; border:.5px solid #EF9F27; }
.pk-hdr__rent { font-size:12px; color:var(--cc-charcoal); margin-top:2px; }
.pk-hdr__rent strong { color:var(--cc-gold); font-weight:500; }
.pk-hdr__rent--vacant { color:var(--cc-stone); font-style:italic; font-size:12px; }
.pk-chevron { color:var(--cc-stone); font-size:16px; transition:transform .22s cubic-bezier(.32,.72,0,1); flex-shrink:0; margin-top:4px; }
.pk--open .pk-chevron { transform:rotate(90deg); }

/* Body */
.pk-body { display:none; border-top:var(--cc-border); }
.pk--open .pk-body { display:block; }

/* Actions strip */
.pk-actions { display:flex; gap:6px; padding:8px 14px; border-bottom:var(--cc-border); }
.pk-act {
  height:28px; display:flex; align-items:center; gap:4px; padding:0 12px;
  border-radius:var(--cc-r-pill); font-size:9px; font-weight:600; letter-spacing:.07em;
  text-transform:uppercase; cursor:pointer; font-family:inherit; background:none;
  -webkit-tap-highlight-color:transparent; white-space:nowrap;
}
.pk-act:active { opacity:.7; }
.pk-act--mark-vacant   { color:#8C6A3A; border:1px solid #D4A87A; }
.pk-act--mark-occupied { color:#27500A; border:1px solid #9AC87A; }

/* Sections */
.pk-section { padding:11px 14px; border-bottom:var(--cc-border); position:relative; }
.pk-section--miete { padding:11px 14px 11px 12px; border-bottom:var(--cc-border); border-left:3px solid var(--cc-gold); position:relative; border-radius:0; }
.pk-stitle { font-size:9px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--cc-stone); margin-bottom:7px; }
.pk-row { display:flex; justify-content:space-between; align-items:baseline; padding:3px 0; gap:12px; }
.pk-row__k { font-size:11px; color:var(--cc-taupe); flex-shrink:0; }
.pk-row__v { font-size:12px; color:var(--cc-charcoal); text-align:right; }
.pk-row__v--gold { color:var(--cc-gold); font-weight:500; }
.pk-row__v--muted { color:var(--cc-stone); font-size:11px; }

/* Section edit button */
.pk-section-edit { display:flex; justify-content:flex-end; margin-top:10px; }
.pk-sec-edit-btn {
  display:flex; align-items:center; gap:4px; height:26px; padding:0 10px;
  background:none; border:.5px solid var(--cc-rule); border-radius:6px;
  font-size:10px; font-weight:500; letter-spacing:.06em; text-transform:uppercase;
  color:var(--cc-taupe); cursor:pointer; font-family:inherit;
}
.pk-sec-edit-btn:hover { border-color:var(--cc-stone); }

/* Keys */
.pk-keys { display:flex; flex-wrap:wrap; gap:8px; }
.pk-key { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--cc-taupe); background:var(--cc-surface); padding:4px 10px; border-radius:20px; border:.5px solid var(--cc-rule); }

/* Contracts */
.pk-contracts { padding:11px 14px; }
.pk-contracts-title { font-size:9px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--cc-stone); margin-bottom:8px; }
.pk-doc-row { display:flex; align-items:center; gap:7px; margin-bottom:6px; }
.pk-doc-row:last-child { margin-bottom:0; }
.pk-doc-btn {
  flex:1; height:40px; display:flex; align-items:center; justify-content:space-between;
  padding:0 13px; background:#F5EFE6; color:#5C3D1E; border:.5px solid #D4B896;
  border-radius:var(--cc-r-md); font-family:inherit; font-size:13px; font-weight:500; cursor:pointer;
}
.pk-doc-btn i { font-size:13px; color:#B8956A; opacity:.8; }

/* Card footer delete */
.pk-card-footer { display:flex; justify-content:flex-end; padding:10px 14px; border-top:var(--cc-border); background:var(--cc-surface); }
.pk-delete-btn {
  display:flex; align-items:center; gap:5px; padding:6px 12px; background:transparent;
  border:.5px solid #EAC4BB; border-radius:var(--cc-r-md); color:#C4705A;
  font-size:10px; font-weight:500; letter-spacing:.06em; text-transform:uppercase;
  cursor:pointer; font-family:inherit;
}

/* Edit fields — reuse apt- classes (already in DOM from apartments tab) */

/* Responsive */
@media(min-width:701px) {
  .pk-hdr { padding:16px 18px; }
  .pk-actions { padding:10px 16px; }
}
/* Mieter prefill pill toggle (shared with Casa Castel pattern) */
.ub-mieter-pill { position:relative; width:44px; height:26px; background:var(--cc-ink); border-radius:13px; cursor:pointer; transition:background .25s; flex-shrink:0; }
.ub-mieter-pill[data-state="manual"] { background:var(--cc-rule); }
.ub-mieter-pill__knob { position:absolute; top:3px; left:3px; width:20px; height:20px; background:#ffffff; border-radius:50%; box-shadow:0 1px 4px rgba(0,0,0,0.18); transition:transform .25s cubic-bezier(.32,.72,0,1); }
.ub-mieter-pill[data-state="manual"] .ub-mieter-pill__knob { transform:translateX(18px); }
/* Staffelmiete / Befristung pill toggle — self-contained (matches apartments) */
.rm-pill-toggle { display:flex; align-items:center; gap:8px; background:none; border:none; cursor:pointer; padding:0; flex-shrink:0; }
.rm-pill-toggle__track { position:relative; width:40px; height:22px; background:var(--cc-stone); border-radius:11px; transition:background .2s; flex-shrink:0; }
.rm-pill-toggle[data-mode="voll"] .rm-pill-toggle__track,
.rm-pill-toggle[data-mode="befristet"] .rm-pill-toggle__track,
.rm-pill-toggle[data-mode="ja"] .rm-pill-toggle__track { background:var(--cc-charcoal); }
.rm-pill-toggle__knob { position:absolute; top:3px; left:3px; width:16px; height:16px; background:#fff; border-radius:50%; transition:transform .2s; }
.rm-pill-toggle[data-mode="voll"] .rm-pill-toggle__knob,
.rm-pill-toggle[data-mode="befristet"] .rm-pill-toggle__knob,
.rm-pill-toggle[data-mode="ja"] .rm-pill-toggle__knob { transform:translateX(18px); }
.rm-pill-toggle__lbl { font-size:12px; font-weight:500; color:var(--cc-charcoal); min-width:52px; }
  `;
  document.head.appendChild(s);
})();


/* ── HELPERS ─────────────────────────────────────────────── */
function pkEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* Resolve active tenant profile for a parking space — cache first, Supabase fallback. */
async function _pkResolveTenantProfile(pkId) {
  // DB is the source of truth for co-tenants: first_name_2 / first_name_3 live
  // on the SAME record row as Mieter 1, so reading the row directly makes
  // Mieter 2/3 resolve exactly like Mieter 1 (the cache can hold a hollow
  // tenant2/3 on older builds, which is why cache-first left them blank).
  if (typeof sbL !== 'undefined') {
    try {
      const { data } = await sbL
        .from('rnt_tenant_records')
        .select('first_name,last_name,email,phone,birthday,address,first_name_2,last_name_2,email_2,phone_2,birthday_2,address_2,first_name_3,last_name_3,email_3,phone_3,birthday_3,address_3')
        .eq('parking_id', pkId)
        .eq('status', 'active')
        .order('mietbeginn', { ascending: false })
        .limit(1)
        .single();
      if (data && (data.first_name || data.last_name)) {
        const mk = (fn, ln, em, ph, bd, ad) => ({
          firstName: fn || '', lastName: ln || '', email: em || '',
          phone: ph || '', birthday: bd || '', address: ad || '',
        });
        const tenant1 = mk(data.first_name, data.last_name, data.email, data.phone, data.birthday, data.address);
        const tenant2 = (data.first_name_2 || data.last_name_2)
          ? mk(data.first_name_2, data.last_name_2, data.email_2, data.phone_2, data.birthday_2, data.address_2) : null;
        const tenant3 = (data.first_name_3 || data.last_name_3)
          ? mk(data.first_name_3, data.last_name_3, data.email_3, data.phone_3, data.birthday_3, data.address_3) : null;
        return { ...tenant1, tenant1, tenant2, tenant3 };
      }
    } catch { /* fall through to cache */ }
  }
  // Fallback: cached profile (used only if the DB read is unavailable)
  if (typeof _rntGetParkingProfile === 'function') {
    const cached = _rntGetParkingProfile(pkId);
    if (cached && (cached.firstName || cached.lastName)) {
      return {
        ...cached,
        tenant1: { firstName: cached.firstName, lastName: cached.lastName, email: cached.email, phone: cached.phone, birthday: cached.birthday, address: cached.address },
        tenant2: (cached.tenant2 && (cached.tenant2.firstName || cached.tenant2.lastName)) ? { ...cached.tenant2, address: cached.tenant2.address || '' } : null,
        tenant3: (cached.tenant3 && (cached.tenant3.firstName || cached.tenant3.lastName)) ? { ...cached.tenant3, address: cached.tenant3.address || '' } : null,
      };
    }
  }
  return {};
}

function pkFmtEUR(n) {
  const num = Number(n);
  if (!num && num !== 0) return '—';
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function pkFmtEURCompact(n) {
  const num = Number(n);
  if (!num && num !== 0) return '—';
  return num.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function pkFmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const PK_TYPES = ['Tiefgarage', 'Stellplatz', 'Einzelgarage', 'Duplex-Anlage'];

function _pkTypeTagClass(type) {
  if (type === 'Tiefgarage')    return 'pk-tag--tg';
  if (type === 'Einzelgarage')  return 'pk-tag--eg';
  if (type === 'Duplex-Anlage') return 'pk-tag--da';
  return 'pk-tag--sp';
}


/* ── DATA STORE ──────────────────────────────────────────── */
let appParking    = [];   // array of parking objects (joined from all tables)
let _pkSbClient   = null;


/* ── LOAD ────────────────────────────────────────────────── */
async function loadParking() {
  _pkSbClient = typeof sbL !== 'undefined' ? sbL : null;
  if (!_pkSbClient) { console.warn('[parking] No Supabase client'); _renderPkList(); return; }

  try {
    const [
      { data: spots },
      { data: pricing },
      { data: schlussel },
    ] = await Promise.all([
      _pkSbClient.from('rentals_parking').select('*').order('sort_order'),
      _pkSbClient.from('rentals_parking_pricing').select('*'),
      _pkSbClient.from('rentals_parking_schlussel').select('*'),
    ]);

    appParking = (spots || []).map(p => ({
      ...p,
      pricing:   (pricing   || []).find(r => r.parking_id === p.id) || {},
      schlussel: (schlussel || []).find(r => r.parking_id === p.id) || {},
    }));
  } catch(e) {
    console.error('[parking] Load failed:', e);
  }

  _renderPkList();
  _pkInitSortable();
}


/* ── RENDER LIST ─────────────────────────────────────────── */
function _updatePkSummary() {
  const bar = document.getElementById('pkSummary');
  const bd  = document.getElementById('pkSummaryBreakdown');
  const tot = document.getElementById('pkSummaryTotal');
  if (!bar) return;
  if (!appParking.length) { bar.style.display = 'none'; return; }

  let total = 0, occupied = 0;
  appParking.forEach(p => {
    if (p.vacant) return;
    occupied++;
    total += Number(p.pricing?.miete) || 0;
  });

  bar.style.display = 'flex';
  bd.textContent  = occupied + ' / ' + appParking.length + ' occupied';
  tot.textContent = pkFmtEURCompact(total);
}

function _renderPkList() {
  const list = document.getElementById('pkList');
  if (!list) return;
  if (!appParking.length) {
    list.innerHTML = `<p style="font-size:13px;color:var(--cc-stone);font-style:italic;padding:20px 0">No parking spaces yet. Add your first space.</p>`;
    _updatePkSummary();
    return;
  }
  list.innerHTML = appParking.map(p => _pkCardHTML(p)).join('');
  _updatePkSummary();
}


/* ── CARD HTML ───────────────────────────────────────────── */
function _pkCardHTML(p) {
  const pr     = p.pricing   || {};
  const sk     = p.schlussel || {};
  const vacant = p.vacant;

  // Header rent line
  const miete = Number(pr.miete) || 0;
  const rentHTML = miete
    ? `<strong>${pkFmtEURCompact(miete)}</strong> / mo`
    : `<span class="pk-hdr__rent--vacant">No pricing set</span>`;

  // Kaution
  const kaution = (pr.kaution_default !== null && pr.kaution_default !== undefined && pr.kaution_default !== '')
    ? Number(pr.kaution_default)
    : miete * 3;

  return `
<div class="pk-card${vacant ? '' : ''}" data-id="${p.id}" data-name="${pkEsc(p.name)}">

  <!-- HEADER -->
  <div class="pk-hdr" onclick="if(!event.target.closest('.pk-drag'))_pkToggle(this.closest('.pk-card'))">
    <i class="ti ti-grip-vertical pk-drag"></i>
    <div class="pk-hdr__info">
      <div class="pk-hdr__namerow">
        <span class="pk-hdr__name">${pkEsc(p.name)}</span>
        <span class="pk-status-badge ${vacant ? 'pk-status--vacant' : 'pk-status--occupied'}">
          ${vacant ? 'Vacant' : 'Occupied'}
        </span>
      </div>
      ${p.adresse ? `<div class="pk-hdr__addr">${pkEsc(p.adresse)}${p.plz_ort ? ', ' + pkEsc(p.plz_ort) : ''}</div>` : ''}
      <div class="pk-hdr__tags">
        ${p.parking_type ? `<span class="pk-tag ${_pkTypeTagClass(p.parking_type)}">${pkEsc(p.parking_type)}</span>` : ''}
        ${p.level_position ? `<span class="pk-tag pk-tag--sp">${pkEsc(p.level_position)}</span>` : ''}
      </div>
      <div class="pk-hdr__rent">${rentHTML}</div>
    </div>
    <i class="ti ti-chevron-right pk-chevron"></i>
  </div>

  <!-- BODY -->
  <div class="pk-body">

    <!-- Status action -->
    <div class="pk-actions">
      <button class="pk-act ${vacant ? 'pk-act--mark-occupied' : 'pk-act--mark-vacant'}"
        onclick="_pkToggleVacant('${p.id}',this)">
        <i class="ti ${vacant ? 'ti-door-enter' : 'ti-door-exit'}" style="font-size:11px"></i>
        ${vacant ? 'Mark as Occupied' : 'Mark as Vacant'}
      </button>
    </div>

    <!-- 1. IDENTITY -->
    <div class="apt-section" id="pk-identity-${p.id}">
      <div class="pk-stitle">Identity</div>
      <!-- READ -->
      <div class="pk-sec-read">
        <div class="pk-row"><span class="pk-row__k">Name</span><span class="pk-row__v">${pkEsc(p.name)}</span></div>
        <div class="pk-row"><span class="pk-row__k">Type</span><span class="pk-row__v">${pkEsc(p.parking_type || '—')}</span></div>
        <div class="pk-row"><span class="pk-row__k">Address</span><span class="pk-row__v">${pkEsc(p.adresse || '—')}</span></div>
        <div class="pk-row"><span class="pk-row__k">PLZ / Ort</span><span class="pk-row__v">${pkEsc(p.plz_ort || '—')}</span></div>
        ${p.property_ref ? `<div class="pk-row"><span class="pk-row__k">Property</span><span class="pk-row__v">${pkEsc(p.property_ref)}</span></div>` : ''}
        ${p.level_position ? `<div class="pk-row"><span class="pk-row__k">Level / Position</span><span class="pk-row__v">${pkEsc(p.level_position)}</span></div>` : ''}
        ${p.gerichtsstand ? `<div class="pk-row"><span class="pk-row__k">Gerichtsstand</span><span class="pk-row__v">${pkEsc(p.gerichtsstand)}</span></div>` : ''}
        <div class="pk-section-edit">
          <button class="pk-sec-edit-btn" onclick="_pkEnterSection('identity','${p.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT -->
      <div class="pk-sec-edit" style="display:none">
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Name</div><input class="apt-input" data-f="name" value="${pkEsc(p.name)}"/></div>
          <div class="apt-field"><div class="apt-field__label">Type</div>
            <select class="apt-input" data-f="parking_type">
              ${PK_TYPES.map(t => `<option ${p.parking_type===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="apt-field"><div class="apt-field__label">Address</div><input class="apt-input" data-f="adresse" value="${pkEsc(p.adresse||'')}"/></div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">PLZ / Ort</div><input class="apt-input" data-f="plz_ort" value="${pkEsc(p.plz_ort||'')}" placeholder="55118 Mainz"/></div>
          <div class="apt-field"><div class="apt-field__label">Gerichtsstand</div><input class="apt-input" data-f="gerichtsstand" value="${pkEsc(p.gerichtsstand||'')}" placeholder="z.B. Wiesbaden"/></div>
        </div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Property ref</div><input class="apt-input" data-f="property_ref" value="${pkEsc(p.property_ref||'')}" placeholder="e.g. Studio One"/></div>
          <div class="apt-field"><div class="apt-field__label">Level / Position</div><input class="apt-input" data-f="level_position" value="${pkEsc(p.level_position||'')}" placeholder="e.g. UG1, Nr. 4"/></div>
        </div>
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_pkCancelSection('identity','${p.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_pkSaveIdentity('${p.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 2. MIETE -->
    <div class="pk-section--miete" id="pk-miete-${p.id}">
      <div class="pk-stitle">Miete</div>
      <!-- READ -->
      <div class="pk-sec-read">
        ${miete
          ? `<div class="pk-row"><span class="pk-row__k">Miete</span><span class="pk-row__v pk-row__v--gold">${pkFmtEURCompact(miete)} / mo</span></div>
             <div class="pk-row"><span class="pk-row__k" style="padding-left:8px;color:var(--cc-stone)">↳ Kaution</span><span class="pk-row__v pk-row__v--muted">${pkFmtEURCompact(kaution)} · 3× Miete${pr.kaution_override ? ' (override)' : ''}</span></div>`
          : `<div class="pk-row"><span class="pk-row__v" style="color:var(--cc-stone);font-style:italic">Not set</span></div>`}
        <div class="pk-section-edit">
          <button class="pk-sec-edit-btn" onclick="_pkEnterSection('miete','${p.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT -->
      <div class="pk-sec-edit" style="display:none">
        <div class="apt-field"><div class="apt-field__label">Miete (€/mo)</div><input class="apt-input" type="number" data-f="miete" value="${pr.miete||''}"/></div>
        <div class="apt-toggle-row">
          <span class="apt-tlabel">Custom Kaution</span>
          <label class="cc-sw"><input type="checkbox" data-f="kaution_override" ${pr.kaution_override?'checked':''} onchange="_pkToggleKautionOverride(this)"/><span class="cc-sw__t"></span></label>
        </div>
        <div data-kautionfield style="${pr.kaution_override?'':'display:none'}">
          <div class="apt-field"><div class="apt-field__label">Kaution (€)</div><input class="apt-input" type="number" data-f="kaution_default" value="${pr.kaution_default||''}"/></div>
        </div>
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_pkCancelSection('miete','${p.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_pkSaveMiete('${p.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 3. SCHLÜSSEL -->
    <div class="apt-section" id="pk-schlussel-${p.id}">
      <div class="pk-stitle">Schlüssel</div>
      <!-- READ -->
      <div class="pk-sec-read">
        <div class="pk-keys">
          <div class="pk-key"><i class="ti ti-key"></i> Parking ×${sk.parking_schluessel ?? 1}</div>
          ${(sk.haustuerschluessel > 0) ? `<div class="pk-key"><i class="ti ti-home"></i> Haustür ×${sk.haustuerschluessel}</div>` : ''}
        </div>
        <div class="pk-section-edit">
          <button class="pk-sec-edit-btn" onclick="_pkEnterSection('schlussel','${p.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT -->
      <div class="pk-sec-edit" style="display:none">
        <div class="apt-field-row">
          <div class="apt-field">
            <div class="apt-field__label">Parking key</div>
            <div class="apt-stepper">
              <button onclick="_aptStep(this,-1)">−</button>
              <span class="apt-stepper__v" data-sf="parking_schluessel">${sk.parking_schluessel ?? 1}</span>
              <button onclick="_aptStep(this,1)">+</button>
            </div>
          </div>
          <div class="apt-field">
            <div class="apt-field__label">Haustür</div>
            <div class="apt-stepper">
              <button onclick="_aptStep(this,-1)">−</button>
              <span class="apt-stepper__v" data-sf="haustuerschluessel">${sk.haustuerschluessel ?? 0}</span>
              <button onclick="_aptStep(this,1)">+</button>
            </div>
          </div>
        </div>
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_pkCancelSection('schlussel','${p.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_pkSaveSchlussel('${p.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 4. CONTRACT -->
    <div class="pk-contracts">
      <div class="pk-contracts-title">Contract</div>
      <div class="pk-doc-row">
        <button class="pk-doc-btn" onclick="_pkOpenContract('mietvertrag','${p.id}')">
          Mietvertrag <i class="ti ti-chevron-right"></i>
        </button>
      </div>
      <div class="pk-doc-row">
        <button class="pk-doc-btn" onclick="_pkOpenContract('ueberg','${p.id}')">
          Übergabeprotokoll <i class="ti ti-chevron-right"></i>
        </button>
        <div class="apt-doc-toggle" id="pk-eu-${p.id}">
          <button class="active" onclick="event.stopPropagation();_pkSetEU('${p.id}',0,this)">Einzug</button>
          <button onclick="event.stopPropagation();_pkSetEU('${p.id}',1,this)">Auszug</button>
        </div>
      </div>
    </div>

    <!-- FOOTER: delete -->
    <div class="pk-card-footer">
      <button class="pk-delete-btn" onclick="_pkConfirmDelete('${p.id}','${pkEsc(p.name)}')">
        <i class="ti ti-trash"></i> Delete
      </button>
    </div>

  </div>
</div>`;
}


/* ── CARD INTERACTIONS ───────────────────────────────────── */
function _pkToggle(card) {
  card.classList.toggle('pk--open');
  if (card.classList.contains('pk--open')) {
    requestAnimationFrame(() => {
      const top    = card.getBoundingClientRect().top + window.scrollY;
      const header = document.querySelector('.cc-header')?.offsetHeight || 100;
      window.scrollTo({ top: top - header - 8, behavior: 'smooth' });
    });
  }
}


/* ── SECTION EDIT ────────────────────────────────────────── */
function _pkEnterSection(section, pkId) {
  const el = document.getElementById(`pk-${section}-${pkId}`);
  if (!el) return;
  el.querySelector('.pk-sec-read').style.display = 'none';
  el.querySelector('.pk-sec-edit').style.display = '';
  el.querySelector('.apt-input, .apt-stepper__v')?.focus?.();
}

function _pkCancelSection(section, pkId) {
  const spot = appParking.find(p => p.id === pkId);
  if (!spot) return;
  const card = document.querySelector(`.pk-card[data-id="${pkId}"]`);
  if (!card) return;
  const wasOpen = card.classList.contains('pk--open');
  card.outerHTML = _pkCardHTML(spot);
  const newCard = document.querySelector(`.pk-card[data-id="${pkId}"]`);
  if (wasOpen && newCard) newCard.classList.add('pk--open');
}


/* ── SAVE: IDENTITY ──────────────────────────────────────── */
async function _pkSaveIdentity(pkId) {
  const el  = document.getElementById(`pk-identity-${pkId}`);
  const btn = el?.querySelector('.apt-btn--save');
  if (!btn) return;
  btn.textContent = '…'; btn.disabled = true;

  const data = {};
  el.querySelectorAll('[data-f]').forEach(inp => {
    const k = inp.dataset.f;
    data[k] = inp.type === 'number' ? (inp.value !== '' ? parseFloat(inp.value) : null) : inp.value;
  });

  if (_pkSbClient) {
    const { error } = await _pkSbClient.from('rentals_parking').update(data).eq('id', pkId);
    if (error) {
      console.error('[parking] identity save failed:', error);
      alert('Konnte nicht speichern:\n' + (error.message || 'Unbekannter Fehler') +
            (error.hint ? '\n\n' + error.hint : ''));
      btn.textContent = 'Error'; btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000);
      return;
    }
  }

  const spot = appParking.find(p => p.id === pkId);
  if (spot) Object.assign(spot, data);
  _pkRerenderCard(pkId);
}


/* ── SAVE: MIETE ─────────────────────────────────────────── */
async function _pkSaveMiete(pkId) {
  const el  = document.getElementById(`pk-miete-${pkId}`);
  const btn = el?.querySelector('.apt-btn--save');
  if (!btn) return;
  btn.textContent = '…'; btn.disabled = true;

  const data = {};
  el.querySelectorAll('[data-f]').forEach(inp => {
    const k = inp.dataset.f;
    if (inp.type === 'checkbox') data[k] = inp.checked;
    else if (inp.type === 'number') data[k] = inp.value !== '' ? parseFloat(inp.value) : null;
    else data[k] = inp.value;
  });

  const spot = appParking.find(p => p.id === pkId);
  if (!spot) return;

  if (_pkSbClient) {
    const prId = spot.pricing?.id;
    let error;
    if (prId) {
      ({ error } = await _pkSbClient.from('rentals_parking_pricing').update(data).eq('id', prId));
    } else {
      const res = await _pkSbClient.from('rentals_parking_pricing').insert({ parking_id: pkId, ...data }).select().single();
      error = res.error;
      if (!error) spot.pricing = res.data;
    }
    if (error) { btn.textContent = 'Error'; btn.disabled = false; setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000); return; }
  }

  if (spot.pricing) Object.assign(spot.pricing, data);
  else spot.pricing = data;
  _pkRerenderCard(pkId);
}


/* ── KAUTION OVERRIDE TOGGLE (PARKING) ───────────────────── */
function _pkToggleKautionOverride(chk) {
  const field = chk.closest('[id^="pk-miete-"]').querySelector('[data-kautionfield]');
  if (field) field.style.display = chk.checked ? '' : 'none';
}


/* ── KAUTION FÄLLIGKEIT HELPER (PARKING) ─────────────────── */
function _pkKfSelect(prefix, val, clickedBtn) {
  const parent = clickedBtn.closest('div');
  parent.querySelectorAll('.rm-fael-btn').forEach(b => { b.classList.remove('active'); delete b.dataset.val; });
  clickedBtn.classList.add('active');
  clickedBtn.dataset.val = val;
  const custom = document.getElementById(`${prefix}-fael-custom`);
  if (custom) custom.style.display = val === 'custom' ? '' : 'none';
}


/* ── KAUTION FÄLLIGKEIT READER (PARKING) ─────────────────── */
function _pkReadKautionFael() {
  const active = document.querySelector('.rm-fael-btn.active[data-prefix="pk-mv"]');
  const val    = active ? (active.dataset.val || active.textContent.trim()) : null;
  if (!val || val === '5' || val === '5 Tage') return '5';
  if (val === 'sofort' || val === 'Sofort')    return 'sofort';
  if (val === 'custom' || val === 'Individuell') {
    const custom = document.getElementById('pk-mv-fael-custom-val')?.value.trim();
    return custom && !isNaN(custom) ? custom : '5';
  }
  return '5';
}


/* ── STAFFELMIETE TOGGLE ──────────────────────────────────── */
function _pkToggleStaffel() {
  const btn  = document.getElementById('pk-mv-staffel-btn');
  const lbl  = document.getElementById('pk-mv-staffel-lbl');
  const sub  = document.getElementById('pk-mv-staffel-sub');
  const body = document.getElementById('pk-mv-staffel-body');
  if (!btn) return;
  const on = btn.dataset.mode === 'nein';
  btn.dataset.mode = on ? 'ja'   : 'nein';
  lbl.textContent  = on ? 'Ja'   : 'Nein';
  sub.textContent  = on ? 'Aktiv': 'Keine Staffelung';
  if (body) body.style.display = on ? '' : 'none';
  if (on) {
    const rows = document.getElementById('pk-mv-staffel-rows');
    if (rows && rows.querySelectorAll('.pk-mv-staffel-row').length === 0) {
      for (let i = 0; i < 4; i++) _pkAddStaffel(true);
    }
  }
}


/* ── STAFFELMIETE CALC DATES ──────────────────────────────── */
function _pkCalcStaffelDates() {
  const startVal  = document.getElementById('pk-mv-start')?.value;
  const intervall = parseInt(document.getElementById('pk-mv-staffel-intervall')?.value) || 1;

  const fmtDt = dt =>
    String(dt.getDate()).padStart(2,'0') + '.' +
    String(dt.getMonth()+1).padStart(2,'0') + '.' + dt.getFullYear();

  // Parking Mindestlaufzeit is always 1 year — Staffel starts after that
  let staffelStart = null;
  if (startVal) {
    const d = new Date(startVal);
    d.setFullYear(d.getFullYear() + 1); // 1 year after Mietbeginn
    staffelStart = d;
  }

  // Gate + Staffel button
  const addBtn  = document.getElementById('pk-mv-staffel-add-btn');
  const addHint = document.getElementById('pk-mv-staffel-add-hint');
  if (addBtn) {
    addBtn.disabled       = !staffelStart;
    addBtn.style.cursor   = staffelStart ? 'pointer'        : 'not-allowed';
    addBtn.style.color    = staffelStart ? 'var(--cc-charcoal)' : 'var(--cc-stone)';
    addBtn.style.opacity  = staffelStart ? '1'              : '.5';
  }
  if (addHint) addHint.style.display = staffelStart ? 'none' : '';

  // Update row date labels
  if (staffelStart) {
    const rows = document.querySelectorAll('.pk-mv-staffel-row');
    rows.forEach((row, i) => {
      const dateLbl = row.querySelector('.pk-mv-staffel-datum');
      if (dateLbl) {
        const d2 = new Date(staffelStart);
        d2.setFullYear(d2.getFullYear() + i * intervall);
        dateLbl.textContent = fmtDt(d2);
      }
    });
  }
}


/* ── STAFFELMIETE ADD / REMOVE ────────────────────────────── */
function _pkAddStaffel(force) {
  const startVal = document.getElementById('pk-mv-start')?.value;
  if (!force && !startVal) return;
  const container = document.getElementById('pk-mv-staffel-rows');
  if (!container) return;
  const count = container.querySelectorAll('.pk-mv-staffel-row').length;
  if (count >= 4) return;
  const miete = Number(document.getElementById('pk-mv-staffel-anfang')?.value) || 0;
  const row = document.createElement('div');
  row.className = 'pk-mv-staffel-row';
  row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';
  row.innerHTML = `
    <input class="rm-input pk-mv-staffel-betrag" type="number" step="0.01"
      placeholder="${miete ? (miete + (count+1)*5).toFixed(2) : (85 + count*5) + '.00'}"
      style="width:120px;-webkit-appearance:textfield;appearance:textfield;"/>
    <span style="font-size:11px;color:var(--cc-stone);">€ ab</span>
    <span class="pk-mv-staffel-datum" style="font-size:11px;font-weight:500;color:var(--cc-charcoal);">—</span>`;
  container.appendChild(row);
  _pkCalcStaffelDates();
}

function _pkRemoveStaffel() {
  const container = document.getElementById('pk-mv-staffel-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.pk-mv-staffel-row');
  if (rows.length > 0) rows[rows.length - 1].remove();
}


/* ── SAVE: SCHLÜSSEL ─────────────────────────────────────── */
async function _pkSaveSchlussel(pkId) {
  const el  = document.getElementById(`pk-schlussel-${pkId}`);
  const btn = el?.querySelector('.apt-btn--save');
  if (!btn) return;
  btn.textContent = '…'; btn.disabled = true;

  const data = {};
  el.querySelectorAll('[data-sf]').forEach(span => {
    data[span.dataset.sf] = parseInt(span.textContent, 10) || 0;
  });

  const spot = appParking.find(p => p.id === pkId);
  if (!spot) return;

  if (_pkSbClient) {
    const skId = spot.schlussel?.id;
    let error;
    if (skId) {
      ({ error } = await _pkSbClient.from('rentals_parking_schlussel').update(data).eq('id', skId));
    } else {
      const res = await _pkSbClient.from('rentals_parking_schlussel').insert({ parking_id: pkId, ...data }).select().single();
      error = res.error;
      if (!error) spot.schlussel = res.data;
    }
    if (error) { btn.textContent = 'Error'; btn.disabled = false; setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000); return; }
  }

  if (spot.schlussel) Object.assign(spot.schlussel, data);
  else spot.schlussel = { parking_id: pkId, ...data };
  _pkRerenderCard(pkId);
}


/* ── RERENDER CARD ───────────────────────────────────────── */
function _pkRerenderCard(pkId) {
  const spot = appParking.find(p => p.id === pkId);
  const card = document.querySelector(`.pk-card[data-id="${pkId}"]`);
  if (!spot || !card) return;
  const newDiv = document.createElement('div');
  newDiv.innerHTML = _pkCardHTML(spot);
  const newCard = newDiv.firstElementChild;
  newCard.classList.add('pk--open');
  card.parentNode.insertBefore(newCard, card);
  card.remove();
  _pkInitSortable();
  _updatePkSummary();
}


/* ── TOGGLE VACANT ───────────────────────────────────────── */
async function _pkToggleVacant(pkId, btn) {
  btn.disabled = true;
  const spot = appParking.find(p => p.id === pkId);
  if (!spot) { btn.disabled = false; return; }

  const newVacant = !spot.vacant;

  if (_pkSbClient) {
    const { error } = await _pkSbClient.from('rentals_parking').update({ vacant: newVacant }).eq('id', pkId);
    if (error) { btn.disabled = false; return; }
  }

  spot.vacant = newVacant;
  _pkRerenderCard(pkId);
  _updatePkSummary();
}


/* ── CONTRACT MODAL ──────────────────────────────────────── */
let _pkContractId = null;

function _pkSetEU(pkId, idx, btn) {
  const tog = document.getElementById('pk-eu-' + pkId);
  if (!tog) return;
  tog.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === idx));
}

async function _pkOpenContract(type, pkId) {
  _pkContractId = pkId;
  const spot = appParking.find(p => p.id === pkId);
  if (!spot) return;

  const pr = spot.pricing   || {};
  const sk = spot.schlussel || {};

  document.getElementById('pkContractTypeLbl').textContent  = type === 'mietvertrag' ? 'Mietvertrag' : 'Übergabeprotokoll';
  document.getElementById('pkContractTitleLbl').textContent = spot.name;
  document.getElementById('pkContractSubLbl').textContent   = spot.parking_type || '';

  if (type === 'mietvertrag') {
    const _pkMvProfile = await _pkResolveTenantProfile(pkId);
    document.getElementById('pkContractBody').innerHTML   = _pkBodyMietvertrag(spot, pr, sk, _pkMvProfile);
    document.getElementById('pkContractFooter').innerHTML =
      `<button class="rm-btn--cancel" id="pkContractCancelBtn">Cancel</button>
       <button class="rm-btn--pdf" id="pkMvPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;

    document.getElementById('pkContractCancelBtn')?.addEventListener('click', () => {
      document.getElementById('pkContractOverlay').classList.remove('open');
    });
    if (typeof _wirePkMvPdfBtn === 'function') _wirePkMvPdfBtn();
    document.getElementById('pk-mv-befristung-btn')?.addEventListener('click', _pkToggleMvBefristung);
    document.getElementById('pk-mv-start')?.addEventListener('change', _pkCalcStaffelDates);
    const _pkSafang = document.getElementById('pk-mv-staffel-anfang');
    if (_pkSafang && !_pkSafang.dataset.edited) _pkSafang.value = String(pr.miete || '');
    document.getElementById('pk-mv-staffel-anfang')?.addEventListener('input', function() { this.dataset.edited = '1'; });

  } else if (type === 'ueberg') {
    const isEinzug = document.getElementById('pk-eu-' + pkId)?.querySelector('.active')?.textContent?.trim() === 'Einzug';
    document.getElementById('pkContractTitleLbl').textContent = (isEinzug ? 'Einzug' : 'Auszug') + ' — ' + spot.name;
    const _pkUbProfile = await _pkResolveTenantProfile(pkId);
    document.getElementById('pkContractBody').innerHTML   = _pkBodyUeberg(spot, sk, isEinzug, _pkUbProfile);
    document.getElementById('pkContractFooter').innerHTML =
      `<button class="rm-btn--cancel" id="pkContractCancelBtn">Cancel</button>
       <button class="rm-btn--pdf" id="pkUebergPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;

    document.getElementById('pkContractCancelBtn')?.addEventListener('click', () => {
      document.getElementById('pkContractOverlay').classList.remove('open');
    });
    document.getElementById('pkUebergPdfBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('pkUebergPdfBtn');
      if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Generating\u2026'; btn.disabled = true; }
      try {
        await pkGenerateUebergPDF(isEinzug);
      } finally {
        if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
      }
    });
  }

  document.getElementById('pkContractOverlay').classList.add('open');
}

document.getElementById('pkContractClose')?.addEventListener('click', () => {
  document.getElementById('pkContractOverlay').classList.remove('open');
});
document.getElementById('pkContractOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('pkContractOverlay'))
    document.getElementById('pkContractOverlay').classList.remove('open');
});


/* ── CONTRACT BODY: MIETVERTRAG ──────────────────────────── */
function _pkAddMieterBlock() {
  const b2 = document.getElementById('pk-mv-mieter2');
  const b3 = document.getElementById('pk-mv-mieter3');
  const addBtn = document.getElementById('pk-mv-addbtn');
  if (b2 && b2.style.display === 'none') {
    b2.style.display = '';
    document.getElementById('pk-mv-name2')?.focus();
  } else if (b3 && b3.style.display === 'none') {
    b3.style.display = '';
    document.getElementById('pk-mv-name3')?.focus();
  }
  if (b3 && b3.style.display !== 'none' && addBtn) addBtn.style.display = 'none';
}

function _pkRemoveMieterBlock(n) {
  const b = document.getElementById(`pk-mv-mieter${n}`);
  if (!b) return;
  b.style.display = 'none';
  b.querySelectorAll('input').forEach(inp => inp.value = '');
  const addBtn = document.getElementById('pk-mv-addbtn');
  if (addBtn) addBtn.style.display = '';
}

function _pkBodyMietvertrag(spot, pr, sk, profile = {}) {
  let _pkMvTenantName  = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  let _pkMvTenantEmail = profile.email   || '';
  let _pkMvTenantAdr   = profile.address || '';
  let _pkMvTenantDob   = profile.birthday || '';
  if (_pkMvTenantDob && _pkMvTenantDob.includes('-') && _pkMvTenantDob.length === 10) {
    const [_y,_m,_d] = _pkMvTenantDob.split('-');
    _pkMvTenantDob = `${_d}.${_m}.${_y}`;
  }
  const _pkMvHasTenant = !!_pkMvTenantName;

  const _pkFmtDob = (b) => {
    if (b && b.includes('-') && b.length === 10) { const [y,m,d] = b.split('-'); return `${d}.${m}.${y}`; }
    return b || '';
  };
  const _t2 = profile.tenant2 || null;
  const _t3 = profile.tenant3 || null;
  const _t2Name  = _t2 ? [_t2.firstName, _t2.lastName].filter(Boolean).join(' ') : '';
  const _t2Adr   = _t2?.address || '';
  const _t2Dob   = _t2 ? _pkFmtDob(_t2.birthday) : '';
  const _t2Email = _t2?.email || '';
  const _t2Tel   = _t2?.phone || '';
  const _t3Name  = _t3 ? [_t3.firstName, _t3.lastName].filter(Boolean).join(' ') : '';
  const _t3Adr   = _t3?.address || '';
  const _t3Dob   = _t3 ? _pkFmtDob(_t3.birthday) : '';
  const _t3Email = _t3?.email || '';
  const _t3Tel   = _t3?.phone || '';

  const miete   = Number(pr.miete) || 0;
  const kaution = (pr.kaution_default !== null && pr.kaution_default !== undefined && pr.kaution_default !== '')
    ? Number(pr.kaution_default)
    : miete * 3;

  return `
    <div class="rm-prefilled">
      <div class="rm-prefilled__title">Pre-filled from parking space</div>
      <div class="rm-pre-row"><span>Space</span><span>${pkEsc(spot.name)}</span></div>
      <div class="rm-pre-row"><span>Type</span><span>${pkEsc(spot.parking_type || '—')}</span></div>
      <div class="rm-pre-row"><span>Address</span><span>${pkEsc(spot.adresse || '—')}</span></div>
      <div class="rm-pre-row"><span>PLZ / Ort</span><span>${pkEsc(spot.plz_ort || '—')}</span></div>
      ${spot.level_position ? `<div class="rm-pre-row"><span>Position</span><span>${pkEsc(spot.level_position)}</span></div>` : ''}
      <div class="rm-pre-row"><span>Gerichtsstand</span><span>${pkEsc(spot.gerichtsstand || '—')}</span></div>
      <div class="rm-pre-row"><span>Miete</span><span>${pkFmtEURCompact(miete)} / mo</span></div>
      <div class="rm-pre-row"><span>Kaution</span><span>${pkFmtEURCompact(kaution)}${pr.kaution_override ? ' (override)' : ' · 3× Miete'}</span></div>
      <div class="rm-pre-row"><span>Schlüssel</span><span>Parking ×${sk.parking_schluessel ?? 1}${sk.haustuerschluessel > 0 ? ' · Haustür ×' + sk.haustuerschluessel : ''}</span></div>
    </div>

    <div class="rm-fields-title">Mieterdaten</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--cc-taupe);font-weight:400;" id="pkMvMieterRoomLbl">${pkEsc(spot.name)} Mieter</span>
      <div class="ub-mieter-pill" id="pkMvMieterPill"
        data-state="room"
        data-tenant-name="${pkEsc(_pkMvTenantName)}"
        data-tenant-email="${pkEsc(_pkMvTenantEmail)}"
        data-tenant-adr="${pkEsc(_pkMvTenantAdr)}"
        data-tenant-dob="${pkEsc(_pkMvTenantDob)}"
        onclick="_togglePkMvMieter()">
        <div class="ub-mieter-pill__knob"></div>
      </div>
      <span style="font-size:11px;color:var(--cc-stone);" id="pkMvMieterManualLbl">Manuell</span>
    </div>
    <div class="rm-field"><label>Name</label><input class="rm-input" id="pk-mv-name" value="${pkEsc(_pkMvTenantName)}" placeholder="Vor- und Nachname…"/></div>
    <div class="rm-field"><label>Adresse</label><input class="rm-input" id="pk-mv-adr" value="${pkEsc(_pkMvTenantAdr)}" placeholder="Aktuelle Adresse…"/></div>
    <div class="rm-field"><label>Geburtsdatum</label><input class="rm-input" id="pk-mv-dob" value="${pkEsc(_pkMvTenantDob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/></div>
    <div class="rm-field"><label>E-Mail</label><input class="rm-input" id="pk-mv-email" type="email" value="${pkEsc(_pkMvTenantEmail)}" placeholder="mieter@beispiel.de"/></div>
    <div class="rm-field"><label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="pk-mv-tel" type="tel" placeholder="+49 …"/></div>

    <div id="pk-mv-mieter2" style="display:${_t2 ? '' : 'none'}">
      <div class="rm-fields-title" style="display:flex;align-items:center;gap:10px;margin-top:6px"><span>Mieterdaten — Mieter 2</span><button type="button" onclick="_pkRemoveMieterBlock(2)" style="font-size:11px;color:var(--cc-stone);background:none;border:none;cursor:pointer;font-family:inherit;text-transform:none;letter-spacing:0;margin-left:auto">Entfernen</button></div>
      <div class="rm-field"><label>Name</label><input class="rm-input" id="pk-mv-name2" value="${pkEsc(_t2Name)}" placeholder="Vor- und Nachname…"/></div>
      <div class="rm-field"><label>Adresse</label><input class="rm-input" id="pk-mv-adr2" value="${pkEsc(_t2Adr)}" placeholder="Aktuelle Adresse…"/></div>
      <div class="rm-field"><label>Geburtsdatum</label><input class="rm-input" id="pk-mv-dob2" value="${pkEsc(_t2Dob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/></div>
      <div class="rm-field"><label>E-Mail</label><input class="rm-input" id="pk-mv-email2" type="email" value="${pkEsc(_t2Email)}" placeholder="mieter@beispiel.de"/></div>
      <div class="rm-field"><label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="pk-mv-tel2" type="tel" value="${pkEsc(_t2Tel)}" placeholder="+49 …"/></div>
    </div>

    <div id="pk-mv-mieter3" style="display:${_t3 ? '' : 'none'}">
      <div class="rm-fields-title" style="display:flex;align-items:center;gap:10px;margin-top:6px"><span>Mieterdaten — Mieter 3</span><button type="button" onclick="_pkRemoveMieterBlock(3)" style="font-size:11px;color:var(--cc-stone);background:none;border:none;cursor:pointer;font-family:inherit;text-transform:none;letter-spacing:0;margin-left:auto">Entfernen</button></div>
      <div class="rm-field"><label>Name</label><input class="rm-input" id="pk-mv-name3" value="${pkEsc(_t3Name)}" placeholder="Vor- und Nachname…"/></div>
      <div class="rm-field"><label>Adresse</label><input class="rm-input" id="pk-mv-adr3" value="${pkEsc(_t3Adr)}" placeholder="Aktuelle Adresse…"/></div>
      <div class="rm-field"><label>Geburtsdatum</label><input class="rm-input" id="pk-mv-dob3" value="${pkEsc(_t3Dob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/></div>
      <div class="rm-field"><label>E-Mail</label><input class="rm-input" id="pk-mv-email3" type="email" value="${pkEsc(_t3Email)}" placeholder="mieter@beispiel.de"/></div>
      <div class="rm-field"><label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="pk-mv-tel3" type="tel" value="${pkEsc(_t3Tel)}" placeholder="+49 …"/></div>
    </div>

    <button type="button" id="pk-mv-addbtn" onclick="_pkAddMieterBlock()" style="font-size:11px;padding:6px 12px;border-radius:6px;border:.5px solid var(--cc-rule);background:none;color:var(--cc-taupe);cursor:pointer;font-family:inherit;display:${(_t2 && _t3) ? 'none' : 'flex'};align-items:center;gap:6px;margin-top:4px;margin-bottom:4px"><i class="ti ti-plus" style="font-size:13px"></i> Mieter hinzufügen</button>

    <div class="rm-fields-title" style="margin-top:6px">Mietzeit</div>
    <div class="rm-field"><label>Mietbeginn *</label><input class="rm-input" id="pk-mv-start" type="date" onclick="try{this.showPicker()}catch(e){}" oninput="_pkCalcStaffelDates()"/></div>

    <div class="rm-field--toggle">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Befristung</div>
          <div class="rm-toggle-sub" id="pk-mv-befristung-sub">Unbefristet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="pk-mv-befristung-btn" data-mode="unbefristet">
          <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
          <span class="rm-pill-toggle__lbl" id="pk-mv-befristung-lbl">Nein</span>
        </button>
      </div>
    </div>

    <div id="pk-mv-befristung-details" style="display:none">
      <div class="rm-field"><label>Mietende *</label><input class="rm-input" id="pk-mv-end" type="date" onclick="try{this.showPicker()}catch(e){}"/></div>
    </div>

    <div class="rm-field" style="margin-top:4px">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label>
      <input class="rm-input" id="pk-mv-sig" type="date" onclick="try{this.showPicker()}catch(e){}"/>
    </div>

    <div class="rm-fields-title" style="margin-top:6px">Fahrzeug</div>
    <div class="rm-field-row">
      <div class="rm-field"><label>Kennzeichen <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="pk-mv-kennzeichen" placeholder="z.B. MZ-AB 123"/></div>
      <div class="rm-field"><label>Fahrzeugtyp <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="pk-mv-fahrzeug" placeholder="z.B. Skoda Fabia"/></div>
    </div>

    <div id="pk-mv-staffel-wrap" style="margin-top:6px;">
      <div class="rm-field--toggle">
        <div class="rm-toggle-row">
          <div>
            <div class="rm-toggle-label">Staffelmiete</div>
            <div class="rm-toggle-sub" id="pk-mv-staffel-sub">Keine Staffelung</div>
          </div>
          <button type="button" class="rm-pill-toggle" id="pk-mv-staffel-btn" data-mode="nein" onclick="_pkToggleStaffel()">
            <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
            <span class="rm-pill-toggle__lbl" id="pk-mv-staffel-lbl">Nein</span>
          </button>
        </div>
      </div>
      <div id="pk-mv-staffel-body" style="display:none">
        <div class="rm-field-row" style="margin-bottom:8px;">
          <div class="rm-field">
            <label>Intervall</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input class="rm-input" id="pk-mv-staffel-intervall" type="number" min="1" value="2" style="width:60px;-webkit-appearance:textfield;appearance:textfield;" oninput="_pkCalcStaffelDates()"/>
              <span style="font-size:12px;color:var(--cc-stone);">Jahr(e)</span>
            </div>
          </div>
        </div>
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--cc-stone);margin-bottom:6px;">Anfangsmiete (während Mindestlaufzeit)</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <input class="rm-input" id="pk-mv-staffel-anfang" type="number" step="0.01" value="${miete||''}" placeholder="80,00" style="width:120px;-webkit-appearance:textfield;appearance:textfield;"/>
          <span style="font-size:11px;color:var(--cc-stone);">€ / Monat</span>
          <span style="font-size:11px;color:var(--cc-taupe);" id="pk-mv-staffel-anfang-ab">ab Mietbeginn</span>
        </div>
        <div id="pk-mv-staffel-rows"></div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <button type="button" id="pk-mv-staffel-add-btn" onclick="_pkAddStaffel()" disabled style="font-size:11px;padding:4px 12px;border-radius:20px;border:.5px solid var(--cc-rule);background:none;cursor:not-allowed;font-family:inherit;color:var(--cc-stone);opacity:.5;">+ Staffel</button>
          <button type="button" onclick="_pkRemoveStaffel()" style="font-size:11px;padding:4px 12px;border-radius:20px;border:.5px solid var(--cc-rule);background:none;cursor:pointer;font-family:inherit;color:var(--cc-stone);">− Staffel</button>
          <span id="pk-mv-staffel-add-hint" style="font-size:10.5px;color:var(--cc-stone);font-style:italic;">Bitte zuerst Mietbeginn ausfüllen</span>
        </div>
      </div>
    </div>

    <div class="rm-fields-title" style="margin-top:6px">Kaution</div>
    <div class="rm-kaution-row" style="align-items:flex-end;gap:12px">
      <div>
        <div class="rm-kaution-lbl">Kaution (§ 551 BGB)</div>
        <div class="rm-kaution-rule">3 × Monatsmiete</div>
      </div>
      <input class="rm-input" id="pk-mv-kaution" type="number" style="width:90px;text-align:right;font-size:13px" value="${kaution}"/>
    </div>
    <div class="rm-kaution-lbl" style="margin-bottom:6px">Kaution Fälligkeit</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <button class="rm-fael-btn" data-prefix="pk-mv" onclick="_pkKfSelect('pk-mv','5',this)">5 Tage</button>
      <button class="rm-fael-btn active" data-prefix="pk-mv" data-val="sofort" onclick="_pkKfSelect('pk-mv','sofort',this)">Sofort</button>
      <button class="rm-fael-btn" data-prefix="pk-mv" onclick="_pkKfSelect('pk-mv','custom',this)">Individuell</button>
    </div>
    <div id="pk-mv-fael-custom" style="display:none">
      <div class="rm-field">
        <label>Tage nach Unterzeichnung</label>
        <input class="rm-input" id="pk-mv-fael-custom-val" type="number" placeholder="z.B. 14"/>
      </div>
    </div>`;
}

function _pkToggleMvBefristung() {
  const btn     = document.getElementById('pk-mv-befristung-btn');
  const lbl     = document.getElementById('pk-mv-befristung-lbl');
  const sub     = document.getElementById('pk-mv-befristung-sub');
  const details = document.getElementById('pk-mv-befristung-details');
  if (!btn) return;
  const on = btn.dataset.mode === 'unbefristet';
  btn.dataset.mode      = on ? 'befristet'  : 'unbefristet';
  lbl.textContent       = on ? 'Ja'         : 'Nein';
  sub.textContent       = on ? 'Befristet'  : 'Unbefristet';
  details.style.display = on ? ''           : 'none';
}

function _togglePkMvMieter() {
  const pill      = document.getElementById('pkMvMieterPill');
  const manualLbl = document.getElementById('pkMvMieterManualLbl');
  if (!pill) return;
  const isRoom = pill.dataset.state === 'room';
  if (isRoom) {
    pill.dataset.state = 'manual';
    document.getElementById('pk-mv-name').value  = '';
    document.getElementById('pk-mv-adr').value   = '';
    document.getElementById('pk-mv-dob').value   = '';
    document.getElementById('pk-mv-email').value = '';
    document.getElementById('pk-mv-name').focus();
    if (manualLbl) manualLbl.style.color = 'var(--cc-charcoal)';
  } else {
    pill.dataset.state = 'room';
    document.getElementById('pk-mv-name').value  = pill.dataset.tenantName  || '';
    document.getElementById('pk-mv-adr').value   = pill.dataset.tenantAdr   || '';
    document.getElementById('pk-mv-dob').value   = pill.dataset.tenantDob   || '';
    document.getElementById('pk-mv-email').value = pill.dataset.tenantEmail || '';
    if (manualLbl) manualLbl.style.color = 'var(--cc-stone)';
  }
}

function _togglePkUbMieter() {
  const pill      = document.getElementById('pkUbMieterPill');
  const manualLbl = document.getElementById('pkUbMieterManualLbl');
  if (!pill) return;
  const isRoom = pill.dataset.state === 'room';
  if (isRoom) {
    pill.dataset.state = 'manual';
    document.getElementById('pk-ub-mieter-name').value = '';
    document.getElementById('pk-ub-mieter-adr').value  = '';
    document.getElementById('pk-ub-mieter-name').focus();
    if (manualLbl) manualLbl.style.color = 'var(--cc-charcoal)';
  } else {
    pill.dataset.state = 'room';
    document.getElementById('pk-ub-mieter-name').value = pill.dataset.tenantName || '';
    document.getElementById('pk-ub-mieter-adr').value  = pill.dataset.tenantAdr  || '';
    if (manualLbl) manualLbl.style.color = 'var(--cc-stone)';
  }
}


/* ── CONTRACT BODY: ÜBERGABEPROTOKOLL ───────────────────── */
function _pkBodyUeberg(spot, sk, isEinzug, profile = {}) {
  const _pkUbTenantName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const _pkUbTenantAdr  = profile.address || '';
  const _pkUbHasTenant  = !!_pkUbTenantName;
  return `
    <div class="rm-fields-title">Mieter</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--cc-taupe);font-weight:400;" id="pkUbMieterRoomLbl">${pkEsc(spot.name)} Mieter</span>
      <div class="ub-mieter-pill" id="pkUbMieterPill"
        data-state="room"
        data-tenant-name="${pkEsc(_pkUbTenantName)}"
        data-tenant-adr="${pkEsc(_pkUbTenantAdr)}"
        onclick="_togglePkUbMieter()">
        <div class="ub-mieter-pill__knob"></div>
      </div>
      <span style="font-size:11px;color:var(--cc-stone);" id="pkUbMieterManualLbl">Manuell</span>
    </div>
    <div class="rm-field"><label>Mieter Name</label><input class="rm-input" id="pk-ub-mieter-name" value="${pkEsc(_pkUbTenantName)}" placeholder="Vor- und Nachname…"/></div>
    <div class="rm-field"><label>Mieter Adresse</label><input class="rm-input" id="pk-ub-mieter-adr" value="${pkEsc(_pkUbTenantAdr)}" placeholder="Aktuelle Adresse…"/></div>
    <div class="rm-field"><label>Übergabedatum</label><input class="rm-input" id="pk-ub-datum" type="text" placeholder="TT.MM.JJJJ"/></div>
    ${!isEinzug ? `
    <div class="rm-field"><label>Neue Adresse des Mieters</label><input class="rm-input" id="pk-ub-neue-adr" placeholder="Neue Adresse nach Auszug…"/></div>` : ''}

    <div class="rm-field" style="margin-top:4px">
      <label>Zustand / Bemerkungen</label>
      <textarea class="rm-input" id="pk-ub-zustand" rows="3" style="resize:vertical;line-height:1.5" placeholder="Zustand des Stellplatzes / der Tiefgarage bei Übergabe…"></textarea>
    </div>

    <div class="rm-fields-title" style="margin-top:6px">Schlüsselübergabe</div>
    <div class="rm-field-row" style="margin-bottom:10px">
      <div class="rm-field"><label>Parking key</label><input class="rm-input" id="pk-ub-pkschluessel" type="number" value="${sk.parking_schluessel ?? 1}" min="0"/></div>
      ${(sk.haustuerschluessel > 0) ? `<div class="rm-field"><label>Haustür</label><input class="rm-input" id="pk-ub-haustur" type="number" value="${sk.haustuerschluessel}" min="0"/></div>` : ''}
    </div>

    <div class="rm-field">
      <label>Allgemeine Bemerkungen</label>
      <textarea class="rm-input" id="pk-ub-bemerkungen" rows="2" style="resize:vertical;line-height:1.5" placeholder="Sonstige Anmerkungen…"></textarea>
    </div>
    <div class="rm-field" style="margin-top:4px">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label>
      <input class="rm-input" id="pk-ub-sig" type="date" onclick="try{this.showPicker()}catch(e){}"/>
    </div>`;
}


/* ── ADD PARKING SPACE ───────────────────────────────────── */
document.getElementById('pkAddBtn')?.addEventListener('click', () => {
  const list   = document.getElementById('pkList');
  const tempId = 'new-' + Date.now();

  const blank = {
    id: tempId, name: '', parking_type: 'Tiefgarage',
    adresse: '', plz_ort: '', property_ref: '', level_position: '', gerichtsstand: '',
    vacant: true,
    pricing: {}, schlussel: {},
  };

  const div = document.createElement('div');
  div.innerHTML = _pkCardHTML(blank);
  const card = div.firstElementChild;
  card.classList.add('pk--open');
  list.insertBefore(card, list.firstChild);
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Open identity for editing immediately
  const identitySection = card.querySelector(`#pk-identity-${tempId}`);
  if (identitySection) {
    identitySection.querySelector('.pk-sec-read').style.display = 'none';
    identitySection.querySelector('.pk-sec-edit').style.display = '';
    identitySection.querySelector('.apt-input')?.focus();
  }

  // Override save for new card
  const saveBtn = identitySection?.querySelector('.apt-btn--save');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const name = identitySection.querySelector('[data-f="name"]')?.value.trim();
      if (!name) { alert('Name is required.'); return; }

      const data = { vacant: true, sort_order: appParking.length };
      identitySection.querySelectorAll('[data-f]').forEach(inp => {
        const k = inp.dataset.f;
        data[k] = inp.type === 'number' ? (inp.value !== '' ? parseFloat(inp.value) : null) : inp.value;
      });

      saveBtn.textContent = '…'; saveBtn.disabled = true;

      if (_pkSbClient) {
        const { data: newSpot, error } = await _pkSbClient.from('rentals_parking').insert(data).select().single();
        if (error || !newSpot) { saveBtn.textContent = 'Error'; saveBtn.disabled = false; return; }
        await Promise.all([
          _pkSbClient.from('rentals_parking_pricing').insert({ parking_id: newSpot.id }),
          _pkSbClient.from('rentals_parking_schlussel').insert({ parking_id: newSpot.id }),
        ]);
        appParking.push({ ...newSpot, pricing: {}, schlussel: {} });
      }

      card.remove();
      _renderPkList();
      _pkInitSortable();
    };
  }

  // Cancel for new card
  const cancelBtn = identitySection?.querySelector('.apt-btn--cancel');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      card.style.transition = 'opacity .15s';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 150);
    };
  }
});


/* ── DELETE ──────────────────────────────────────────────── */
let _pkPendingDeleteId = null;

function _pkConfirmDelete(pkId, name) {
  _pkPendingDeleteId = pkId;
  document.getElementById('pkConfirmBody').innerHTML =
    `This will permanently delete <strong>${pkEsc(name)}</strong> and all linked data. This cannot be undone.`;
  document.getElementById('pkConfirmOverlay').classList.add('open');
}

document.getElementById('pkConfirmCancel')?.addEventListener('click', () => {
  document.getElementById('pkConfirmOverlay').classList.remove('open');
  _pkPendingDeleteId = null;
});

document.getElementById('pkConfirmOk')?.addEventListener('click', async () => {
  if (!_pkPendingDeleteId) return;
  const btn = document.getElementById('pkConfirmOk');
  btn.disabled = true;

  if (_pkSbClient) {
    await _pkSbClient.from('rentals_parking').delete().eq('id', _pkPendingDeleteId);
  }

  appParking = appParking.filter(p => p.id !== _pkPendingDeleteId);
  document.getElementById('pkConfirmOverlay').classList.remove('open');
  _pkPendingDeleteId = null;
  btn.disabled = false;
  _renderPkList();
  _pkInitSortable();
});


/* ── SORTABLE ────────────────────────────────────────────── */
function _pkInitSortable() {
  if (typeof Sortable === 'undefined') return;
  const list = document.getElementById('pkList');
  if (!list || list._sortable) return;

  list._sortable = Sortable.create(list, {
    animation: 180,
    handle: '.pk-drag',
    delay: 150,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd(evt) {
      const ids = [...evt.to.querySelectorAll('.pk-card[data-id]')]
        .map(c => c.dataset.id).filter(Boolean);
      if (_pkSbClient) {
        ids.forEach((id, i) => {
          _pkSbClient.from('rentals_parking').update({ sort_order: i }).eq('id', id);
          const p = appParking.find(x => x.id === id);
          if (p) p.sort_order = i;
        });
      }
    }
  });
}


/* ── SQL ─────────────────────────────────────────────────────
   Run once in Supabase SQL editor.

CREATE TABLE rentals_parking (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  parking_type   text NOT NULL DEFAULT 'Tiefgarage',
  adresse        text,
  plz_ort        text,
  property_ref   text,
  level_position text,
  gerichtsstand  text,
  vacant         boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE rentals_parking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON rentals_parking FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE rentals_parking_pricing (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_id       uuid NOT NULL REFERENCES rentals_parking(id) ON DELETE CASCADE,
  miete            numeric(10,2),
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE rentals_parking_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON rentals_parking_pricing FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE rentals_parking_schlussel (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_id          uuid NOT NULL REFERENCES rentals_parking(id) ON DELETE CASCADE,
  parking_schluessel  integer NOT NULL DEFAULT 1,
  haustuerschluessel  integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE rentals_parking_schlussel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON rentals_parking_schlussel FOR ALL TO anon USING (true) WITH CHECK (true);

-- Prefill: 3 Tiefgaragen + 2 Stellplätze at Kaiser-Wilhelm-Ring 68
INSERT INTO rentals_parking (name, parking_type, adresse, plz_ort, property_ref, gerichtsstand, vacant, sort_order) VALUES
  ('TG 1', 'Tiefgarage', 'Kaiser-Wilhelm-Ring 68', '55118 Mainz', 'Studio One', 'Mainz', false, 0),
  ('TG 2', 'Tiefgarage', 'Kaiser-Wilhelm-Ring 68', '55118 Mainz', 'Studio One', 'Mainz', false, 1),
  ('TG 3', 'Tiefgarage', 'Kaiser-Wilhelm-Ring 68', '55118 Mainz', 'Studio One', 'Mainz', false, 2),
  ('SP 1', 'Stellplatz', 'Kaiser-Wilhelm-Ring 68', '55118 Mainz', 'Studio One', 'Mainz', true,  3),
  ('SP 2', 'Stellplatz', 'Kaiser-Wilhelm-Ring 68', '55118 Mainz', 'Studio One', 'Mainz', true,  4);

-- Pricing for occupied spaces
INSERT INTO rentals_parking_pricing (parking_id, miete)
SELECT id, 60 FROM rentals_parking WHERE name IN ('TG 1','TG 2','TG 3');

-- Schlüssel defaults for all
INSERT INTO rentals_parking_schlussel (parking_id, parking_schluessel, haustuerschluessel)
SELECT id, 1, 1 FROM rentals_parking;
   ──────────────────────────────────────────────────────────── */
