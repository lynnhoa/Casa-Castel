/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — TENANTS TAB
   tab-tenants.js

   Tenant lifecycle management per room.
   Exposes: loadTenants(), _getProfile(room)
   Depends on: constants.js, utils.js, supabase-client.js,
               rooms-data.js, casa-castel.css
   ───────────────────────────────────────────────────────────── */


/* ══════════════════════════════════════════════════════════════
   1. HTML INJECT
══════════════════════════════════════════════════════════════ */
document.getElementById('tab-tenants').innerHTML = `
  <div class="tn-hdr">
    <h1 class="cc-h1">Tenants</h1>
  </div>
  <div class="tn-list" id="tenantsList"></div>

  <input type="file" id="tnFileInput" accept="application/pdf,image/*"
         style="display:none" aria-hidden="true"/>

  <div class="tn-overlay" id="tnModal" onclick="_tnModalOutside(event)">
    <div class="tn-sheet" id="tnSheet">
      <div class="tn-sheet-hdr">
        <div style="flex:1;min-width:0">
          <div class="tn-sheet-name" id="tnModalName"></div>
          <div class="tn-sheet-sub" id="tnModalSub"></div>
        </div>
        <button class="tn-icon-btn" onclick="_tnCloseModal()" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="tn-sheet-body" id="tnModalBody"></div>
      <div class="tn-sheet-footer" id="tnModalFooter"></div>
    </div>
  </div>

  <div class="tn-confirm-overlay" id="tnConfirm">
    <div class="tn-confirm-box">
      <div class="tn-confirm-icon"><i class="ti ti-alert-triangle"></i></div>
      <div class="tn-confirm-title">Delete tenant record</div>
      <div class="tn-confirm-body" id="tnConfirmBody"></div>
      <div class="tn-confirm-btns">
        <button class="tn-btn tn-btn-ghost" onclick="_tnCancelDelete()">Cancel</button>
        <button class="tn-btn tn-btn-danger" id="tnConfirmOk" onclick="_tnConfirmDelete()">
          <i class="ti ti-trash"></i> Delete
        </button>
      </div>
    </div>
  </div>
`;


/* ══════════════════════════════════════════════════════════════
   2. STYLES
══════════════════════════════════════════════════════════════ */
(function() {
  const existing = document.getElementById('tn-styles');
  if (existing) existing.remove();
  const s = document.createElement('style');
  s.id = 'tn-styles';
  s.textContent = `

/* ── PAGE ── */
.tn-hdr { margin-bottom: 20px; }
.tn-list { display:flex; flex-direction:column; gap:8px;
  padding-bottom: max(40px, env(safe-area-inset-bottom, 40px)); }

/* ── CARD ── */
.tn-card { background:var(--cc-white); border:var(--cc-border);
  border-radius:var(--cc-r-lg); overflow:hidden; transition:border-color .15s; }
.tn-card.open { border-color:var(--cc-stone); }

/* ── HEADER ── */
.tn-hdr-wrap { padding:11px 14px; cursor:pointer; user-select:none;
  -webkit-tap-highlight-color:transparent; }
.tn-hdr-top { display:flex; align-items:center; gap:8px; }
.tn-room-lbl { font-size:10px; font-weight:500; letter-spacing:.09em;
  text-transform:uppercase; color:var(--cc-taupe); }
.tn-chev { font-size:18px; color:var(--cc-stone); margin-left:auto; flex-shrink:0;
  transition:transform .2s cubic-bezier(.32,.72,0,1); }
.tn-card.open .tn-chev { transform:rotate(90deg); }
.tn-hdr-mid { display:flex; align-items:baseline; gap:8px; margin-top:4px; flex-wrap:wrap; }
.tn-tenant-name { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; color:var(--cc-ink); line-height:1.1; }
.tn-tenant-dates { font-size:11px; color:var(--cc-taupe); }
.tn-hdr-bot { display:flex; align-items:center; gap:5px; margin-top:5px; flex-wrap:wrap; }
.tn-warm { font-size:11px; font-weight:500; color:var(--cc-charcoal); }
.tn-dim { font-size:10px; font-weight:300; color:var(--cc-stone); }
.tn-dot-sep { width:3px; height:3px; border-radius:50%;
  background:var(--cc-rule); flex-shrink:0; }

/* ── PILLS ── */
.tnp { display:inline-flex; align-items:center; font-size:9px; font-weight:600;
  letter-spacing:.07em; text-transform:uppercase;
  padding:2px 7px; border-radius:var(--cc-r-pill); white-space:nowrap; }
.tnp-green  { background:#EAF3DE; color:#27500A; border:.5px solid #97C459; }
.tnp-blue   { background:#E6F1FB; color:#0C447C; border:.5px solid #85B7EB; }
.tnp-amber  { background:#FAEEDA; color:#633806; border:.5px solid #EF9F27; }
.tnp-red    { background:#FCEBEB; color:#791F1F; border:.5px solid #F09595; }
.tnp-gray   { background:var(--cc-surface); color:var(--cc-taupe);
  border:.5px solid var(--cc-rule); }

/* ── CARD BODY ── */
.tn-body { border-top:var(--cc-border); display:none; }
.tn-card.open .tn-body { display:block; }

/* ── RENT BAR ── */
.tn-rent-bar { display:flex; align-items:stretch;
  background:var(--cc-surface); border-bottom:var(--cc-border); }
.tn-rc { flex:1; padding:7px 11px; border-right:var(--cc-border); }
.tn-rc:last-child { border-right:none; flex:none;
  display:flex; align-items:center; padding:6px 10px; }
.tn-rlbl { font-size:10px; font-weight:500; letter-spacing:.09em;
  text-transform:uppercase; color:var(--cc-taupe); margin-bottom:2px; }
.tn-rval { font-size:13px; font-weight:500; color:var(--cc-charcoal); }
.tn-rsub { font-size:10px; font-weight:300; color:var(--cc-stone); }

/* ── RENT FORM ── */
.tn-rent-form { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px;
  padding:10px 14px 12px; border-bottom:var(--cc-border); }
.tn-rf { display:flex; flex-direction:column; gap:3px; }
.tn-rf input { width:100%; font-size:12px; padding:3px 8px;
  border-radius:var(--cc-r-sm); border:var(--cc-border);
  background:var(--cc-surface); color:var(--cc-charcoal);
  font-family:inherit; outline:none; -webkit-appearance:none; }
.tn-rf input:focus { border-color:var(--cc-gold); background:var(--cc-white); }
.tn-rf-derived { font-size:11px; font-weight:400; color:var(--cc-charcoal);
  padding:5px 8px; background:var(--cc-surface); border-radius:var(--cc-r-sm);
  border:var(--cc-border); }
.tn-rf-hint { font-size:10px; color:var(--cc-stone); grid-column:1/-1; }
.tn-rf-save-row { display:flex; gap:6px; justify-content:flex-end; grid-column:1/-1; }

/* ── SECTION ── */
.tn-sec { border-bottom:var(--cc-border); }
.tn-sec:last-child { border-bottom:none; }
.tn-sec-lbl { font-size:9px; font-weight:500; letter-spacing:.11em;
  text-transform:uppercase; color:var(--cc-taupe); }
.tn-sec-body { padding:8px 14px 0; }
.tn-sec-footer { display:flex; align-items:center; justify-content:flex-end;
  gap:6px; padding:8px 14px; }
.tn-sec-footer-split { display:flex; align-items:center; gap:6px; padding:8px 14px; }
.tn-sec-footer-split .tn-spacer { flex:1; }

/* ── FIELD GRID ── */
.tn-fg { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.tn-field { display:flex; flex-direction:column; gap:3px; }
.tn-field-full { grid-column:1/-1; }
.tn-flbl { font-size:11px; font-weight:400; color:var(--cc-taupe); }
.tn-fval { font-size:12px; color:var(--cc-charcoal); }
.tn-fval.muted { color:var(--cc-stone); font-style:italic; }
.tn-field input { width:100%; font-size:12px; min-height:38px; padding:8px 10px;
  border-radius:var(--cc-r-sm); border:var(--cc-border);
  background:var(--cc-bg); color:var(--cc-charcoal); font-weight:300;
  font-family:inherit; outline:none; -webkit-appearance:none;
  -webkit-text-size-adjust:100%; transition:border-color .15s; }
.tn-field input:focus { border-color:var(--cc-gold); background:var(--cc-white); }
.tn-field input::placeholder { color:var(--cc-stone); }
/* Unified read/edit toggle via .editing on the fg container */
.tn-fg .tn-field input { display:none; }
.tn-fg.editing .tn-field input { display:block; }
.tn-fg.editing .tn-fval { display:none; }
#tab-tenants .tn-field input { font-size:12px !important; }
#tab-tenants .tn-rf input { font-size:12px !important; }
#tab-tenants .tn-kc-input { font-size:11px !important; }
#tab-tenants .tn-nk-add-form input { font-size:12px !important; }
.tn-contract-toggle { display:flex; gap:4px; margin-top:4px; }

/* ── BUTTONS ── */
.tn-btn { display:inline-flex; align-items:center; gap:4px;
  border-radius:var(--cc-r-pill); font-weight:500; font-family:inherit;
  cursor:pointer; transition:opacity .15s; -webkit-tap-highlight-color:transparent; }
.tn-btn:active { opacity:.75; }
.tn-btn-sm { height:36px; padding:0 12px; font-size:11px;
  border:.5px solid var(--cc-rule); background:none; color:var(--cc-taupe); }
.tn-btn-sm i { font-size:12px; }
.tn-btn-primary { height:36px; padding:0 12px; font-size:11px;
  background:var(--cc-ink); color:var(--cc-white); border:none; }
.tn-btn-primary i { font-size:12px; }
.tn-btn-ghost { height:48px; padding:0 16px; font-size:13px; font-weight:400;
  border:none; background:none; color:var(--cc-stone); }
.tn-btn-danger { height:48px; padding:0 16px; font-size:13px; font-weight:400;
  background:none; color:#A32D2D; border:.5px solid #F09595; }
.tn-btn-danger i { font-size:14px; }
.tn-icon-btn { width:28px; height:28px; border-radius:50%;
  background:var(--cc-surface); border:var(--cc-border);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; color:var(--cc-taupe); font-size:13px;
  font-family:inherit; flex-shrink:0; -webkit-tap-highlight-color:transparent; }
.tn-edit-rent-btn { display:inline-flex; align-items:center; gap:4px;
  height:26px; padding:0 10px; border-radius:var(--cc-r-pill); font-size:10px;
  font-weight:500; border:.5px solid var(--cc-rule); background:none;
  color:var(--cc-taupe); cursor:pointer; font-family:inherit; white-space:nowrap; }

/* ── DOCS ── */
.tn-doc-row { display:flex; align-items:center; gap:8px; padding:4px 0; }
.tn-doc-name { flex:1; font-size:11px; color:var(--cc-charcoal); }
.tn-doc-btns { display:flex; gap:4px; margin-left:4px; }
.tn-doc-btn { display:inline-flex; align-items:center; gap:3px; height:24px;
  padding:0 8px; border-radius:var(--cc-r-sm); font-size:10px; font-weight:500;
  border:.5px solid var(--cc-rule); background:none; color:var(--cc-taupe);
  cursor:pointer; font-family:inherit; }
.tn-doc-btn i { font-size:10px; }
.tn-doc-btn.off { opacity:.35; pointer-events:none; }

/* ── KAUTION ── */
.tn-kaut-hint { font-size:10px; color:var(--cc-stone); margin-bottom:6px; }
.tn-kaut-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
.tn-kc { background:var(--cc-surface); border-radius:var(--cc-r-sm); padding:7px 9px; }
.tn-kc-lbl { font-size:10px; font-weight:500; letter-spacing:.09em;
  text-transform:uppercase; color:var(--cc-taupe); margin-bottom:3px; }
.tn-kc-val { font-size:11px; font-weight:400; color:var(--cc-charcoal); }
.tn-kc-val.gold { color:var(--cc-gold); }
.tn-kc-input { width:100%; font-size:11px; font-weight:400; padding:3px 5px;
  border-radius:4px; border:.5px solid var(--cc-rule);
  background:var(--cc-white); color:var(--cc-charcoal);
  font-family:inherit; outline:none; margin-top:1px;
  -webkit-appearance:none; }
.tn-kc-input:focus { border-color:var(--cc-gold); }
.tn-kc-input[type=number]::-webkit-inner-spin-button,
.tn-kc-input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; }
.tn-kc-input[type=number] { -moz-appearance:textfield; }

/* ── NK ── */
.tn-nk-row { display:flex; align-items:center; gap:9px; padding:5px 0;
  border-bottom:var(--cc-border); }
.tn-nk-row:last-of-type { border-bottom:none; }
.tn-nk-period { font-size:11px; font-weight:400; min-width:50px;
  color:var(--cc-charcoal); flex-shrink:0; }
.tn-nk-dots { display:flex; gap:3px; flex-shrink:0; }
.tn-nd { width:18px; height:18px; border-radius:50%; display:flex;
  align-items:center; justify-content:center; font-size:9px; flex-shrink:0;
  cursor:default; }
.tn-nd.tap { cursor:pointer; -webkit-tap-highlight-color:transparent; }
.tn-nd.tap:active { transform:scale(.88); }
.tn-nd-off  { background:var(--cc-surface); color:var(--cc-stone);
  border:.5px solid var(--cc-rule); }
.tn-nd-act  { background:#FAEEDA; color:#633806; border:.5px solid #EF9F27; }
.tn-nd-done { background:#EAF3DE; color:#27500A; border:.5px solid #97C459; }
.tn-nk-info { flex:1; font-size:11px; color:var(--cc-taupe); }
.tn-nk-info .amt { font-weight:500; color:var(--cc-charcoal); }
.tn-nk-btns { display:flex; gap:4px; flex-shrink:0; }
.tn-nk-btn { display:inline-flex; align-items:center; gap:3px; height:24px;
  padding:0 8px; border-radius:var(--cc-r-sm); font-size:10px; font-weight:500;
  border:.5px solid var(--cc-rule); background:none; color:var(--cc-taupe);
  cursor:pointer; font-family:inherit; }
.tn-nk-btn i { font-size:10px; }
.tn-nk-btn-dark { background:var(--cc-ink); color:var(--cc-white); border-color:transparent; }
.tn-nk-btn-del  { color:#A32D2D; border-color:#F09595; }
.tn-add-nk-btn { display:flex; align-items:center; gap:5px; padding-top:8px;
  font-size:11px; color:var(--cc-stone); cursor:pointer; background:none;
  border:none; font-family:inherit; width:100%; }
.tn-add-nk-btn i { font-size:12px; }
.tn-nk-add-form { display:flex; align-items:center; gap:6px;
  padding-top:8px; border-top:var(--cc-border); margin-top:4px; }
.tn-nk-add-form input { flex:1; font-size:12px; padding:5px 8px;
  border-radius:var(--cc-r-sm); border:.5px solid var(--cc-gold);
  background:var(--cc-white); color:var(--cc-charcoal);
  font-family:inherit; outline:none; }

/* ── FORMER ── */
.tn-former-row { display:flex; align-items:center; gap:10px;
  padding:7px 14px; border-bottom:var(--cc-border); cursor:pointer;
  -webkit-tap-highlight-color:transparent; }
.tn-former-row:last-of-type { border-bottom:none; }
.tn-former-row:active { background:var(--cc-surface); }
.tn-former-info { flex:1; min-width:0; }
.tn-former-name { font-size:11px; font-weight:400; color:var(--cc-taupe); }
.tn-former-period { font-size:11px; color:var(--cc-stone); }
.tn-former-pills { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
.tn-show-older { display:flex; align-items:center; gap:5px; padding:7px 14px;
  font-size:11px; color:var(--cc-stone); cursor:pointer; background:none;
  border:none; font-family:inherit; width:100%;
  border-top:var(--cc-border); -webkit-tap-highlight-color:transparent; }
.tn-show-older i { font-size:12px; }
.tn-add-former-btn { display:flex; align-items:center; gap:5px; padding:7px 14px;
  font-size:11px; color:var(--cc-taupe); cursor:pointer; background:none;
  border:none; border-top:var(--cc-border); font-family:inherit; width:100%;
  -webkit-tap-highlight-color:transparent; }
.tn-add-former-btn i { font-size:12px; }
.tn-arc-toggle { display:flex; align-items:center; gap:6px; padding:8px 14px;
  font-size:10px; font-weight:500; letter-spacing:.08em; text-transform:uppercase;
  color:var(--cc-stone); border-top:var(--cc-border); cursor:pointer;
  user-select:none; background:none; border-bottom:none; font-family:inherit; width:100%; }
.tn-arc-body { display:none; background:var(--cc-surface); }
.tn-arc-body.open { display:block; }
.tn-arc-row { display:flex; align-items:center; gap:10px;
  padding:7px 14px; border-top:var(--cc-border); opacity:.5; }
.tn-arc-info { flex:1; }
.tn-arc-name { font-size:11px; color:var(--cc-taupe); }
.tn-arc-period { font-size:10px; color:var(--cc-stone); }

/* ── MODAL OVERLAY ── */
.tn-overlay { display:none; position:fixed; inset:0; z-index:400;
  background:rgba(30,27,24,.28); backdrop-filter:blur(2px);
  align-items:flex-end; justify-content:center; }
.tn-overlay.open { display:flex; }

/* ── MODAL SHEET ── */
.tn-sheet { width:100%; max-width:520px; max-height:90vh;
  background:var(--cc-white); border-radius:20px 20px 0 0;
  display:flex; flex-direction:column;
  animation:tnSheetUp .24s cubic-bezier(.32,.72,0,1); }
@keyframes tnSheetUp {
  from { transform:translateY(32px); opacity:0; }
  to   { transform:none; opacity:1; }
}
.tn-sheet-hdr { display:flex; align-items:flex-start; gap:10px;
  padding:14px 16px 10px; border-bottom:var(--cc-border); flex-shrink:0; }
.tn-sheet-name { font-size:15px; font-weight:500; color:var(--cc-ink); }
.tn-sheet-sub { font-size:11px; color:var(--cc-taupe); margin-top:2px;
  display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.tn-sheet-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.tn-sheet-footer { display:flex; align-items:center; gap:8px;
  padding:10px 16px; padding-bottom:max(10px,env(safe-area-inset-bottom,10px));
  border-top:var(--cc-border); background:var(--cc-surface); flex-shrink:0; }
.tn-sheet-spacer { flex:1; }

/* modal sections */
.tn-msec { border-bottom:var(--cc-border); }
.tn-msec:last-child { border-bottom:none; }
.tn-msec-body { padding:8px 16px 0; }
.tn-msec-footer { display:flex; align-items:center; justify-content:flex-end;
  gap:6px; padding:8px 16px; }
.tn-msec-hdr { display:flex; align-items:center; gap:8px;
  padding:10px 16px 0; }
.tn-msec-lbl { font-size:9px; font-weight:500; letter-spacing:.11em;
  text-transform:uppercase; color:var(--cc-taupe); flex:1; }

/* ── CONFIRM OVERLAY ── */
.tn-confirm-overlay { display:none; position:fixed; inset:0; z-index:500;
  background:rgba(30,27,24,.35); align-items:center; justify-content:center;
  padding:24px; }
.tn-confirm-overlay.open { display:flex; }
.tn-confirm-box { background:var(--cc-white); border-radius:var(--cc-r-lg);
  padding:24px 20px 20px; max-width:300px; width:100%;
  animation:tnConfirmPop .2s cubic-bezier(.32,.72,0,1); }
@keyframes tnConfirmPop { from{transform:scale(.94);opacity:0} to{transform:scale(1);opacity:1} }
.tn-confirm-icon { font-size:26px; color:#C4705A; margin-bottom:10px; }
.tn-confirm-title { font-family:'Cormorant Garamond',Georgia,serif;
  font-size:18px; font-weight:400; color:var(--cc-ink); margin-bottom:6px; }
.tn-confirm-body { font-size:13px; color:var(--cc-taupe);
  line-height:1.55; margin-bottom:18px; }
.tn-confirm-btns { display:flex; align-items:center; gap:10px; }

/* ── EMPTY / MISC ── */
.tn-empty { font-size:12px; color:var(--cc-stone); font-style:italic; padding:3px 0; }

/* ── DESKTOP ── */
@media (min-width:701px) {
  .tn-overlay { align-items:center; }
  .tn-sheet { border-radius:var(--cc-r-lg); max-height:82vh; }
  .tn-sheet-footer { padding-bottom:12px; }
  .tn-former-row:hover { background:var(--cc-surface); }
}

  `;
  document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════
   3. STATE
══════════════════════════════════════════════════════════════ */
let _tnLoaded     = false;
let _tnRoomsWired = false;

let _tnRecords      = [];
let _tnKaution      = {};
let _tnNK           = {};
let _tnDocs         = {};
let _tnProfileCache = {};
let _tnShowOlder    = {};
let _tnModalTid     = null;
let _tnUploadTid    = null;
let _tnUploadType   = null;
let _tnDeleteId     = null;
let _tnKautTimers   = {};


/* ══════════════════════════════════════════════════════════════
   4. PRICING HELPERS
══════════════════════════════════════════════════════════════ */
function _tnRoomContractType(room) {
  if (typeof appRooms === 'undefined') return null;
  const r = appRooms.find(x => x.name === room);
  if (!r) return null;
  const hasMv = (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) || !!r.mietvertrag_miete;
  const hasKz = !!r.kurzzeit_kaltmiete;
  if (r.active_price_type === 'mietvertrag' && hasMv) return 'mietvertrag';
  if (r.active_price_type === 'kurzzeit'    && hasKz) return 'kurzzeit';
  if (hasMv) return 'mietvertrag';
  if (hasKz) return 'kurzzeit';
  return null;
}

function _tnRoomContractTypes(room) {
  if (typeof appRooms === 'undefined') return [];
  const r = appRooms.find(x => x.name === room);
  if (!r) return [];
  const types = [];
  const hasMv = (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) || !!r.mietvertrag_miete;
  const hasKz = !!r.kurzzeit_kaltmiete;
  if (hasMv) types.push('mietvertrag');
  if (hasKz) types.push('kurzzeit');
  return types;
}

function _tnRoomPricing(room) {
  if (typeof appRooms === 'undefined') return {};
  const r = appRooms.find(x => x.name === room);
  if (!r) return {};
  const ctype = _tnRoomContractType(room);
  let kaltmiete = null, nebenkosten = null;
  if (ctype === 'mietvertrag') {
    if (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) {
      kaltmiete   = Number(r.kaltmiete)    || null;
      nebenkosten = Number(r.nk_pauschale) || null;
    } else if (r.mietvertrag_miete) {
      nebenkosten = Number(r.nk_pauschale)      || null;
      kaltmiete   = Number(r.mietvertrag_miete) - (nebenkosten || 0) || null;
    }
  } else if (ctype === 'kurzzeit' && r.kurzzeit_kaltmiete) {
    kaltmiete   = Number(r.kurzzeit_kaltmiete) || null;
    nebenkosten = Number(r.kurzzeit_nk)        || null;
  }
  const kaution_override = !!(r.kaution_override && r.kaution_default);
  const kaution_fixed    = kaution_override ? Number(r.kaution_default) : null;
  return { kaltmiete, nebenkosten, kaution_override, kaution_fixed };
}

function _tnKautionSoll(room, mietbeginn, mietende) {
  const p = _tnRoomPricing(room);
  if (p.kaution_override) return p.kaution_fixed;
  if (!p.kaltmiete) return null;
  function pd(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    return m ? new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`) : null;
  }
  const start = pd(mietbeginn), end = pd(mietende);
  if (start && end && end > start) {
    const months = Math.round((end - start) / (30.44 * 24 * 3600 * 1000));
    return months <= 3 ? Math.round(p.kaltmiete * 1) : Math.round(p.kaltmiete * 3);
  }
  const ctype = _tnRoomContractType(room);
  return ctype === 'kurzzeit' ? Math.round(p.kaltmiete * 1) : Math.round(p.kaltmiete * 3);
}

function _tnPriceLabel(room) {
  if (typeof appRooms === 'undefined') return null;
  const r = appRooms.find(x => x.name === room);
  if (!r) return null;
  const ctype = _tnRoomContractType(room);
  if (!ctype) return null;
  if (ctype === 'mietvertrag') {
    const mode = (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) ? 'Kalt+NK' : 'Pauschal';
    return 'MV \u00b7 ' + mode;
  }
  if (ctype === 'kurzzeit') {
    const mode = (r.kurzzeit_pricing === 'kalt_nk') ? 'Kalt+NK' : 'Pauschal';
    return 'KZ \u00b7 ' + mode;
  }
  return null;
}

function _tnContractLabel(type) {
  if (type === 'mietvertrag') return 'Mietvertrag';
  if (type === 'kurzzeit')    return 'Kurzzeitmietvertrag';
  return null;
}


/* ══════════════════════════════════════════════════════════════
   5. FORMAT HELPERS
══════════════════════════════════════════════════════════════ */
function _tnFmtEUR(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('de-DE', { minimumFractionDigits:0, maximumFractionDigits:2 }) + '\u00a0\u20ac';
}

function _tnFmtDate(d) {
  if (!d) return '';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return d;
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return String(dt.getDate()).padStart(2,'0') + '.' +
         String(dt.getMonth()+1).padStart(2,'0') + '.' +
         dt.getFullYear();
}

function _tnParseDate(s) {
  if (!s || !s.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return s.trim();
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}


/* ══════════════════════════════════════════════════════════════
   6. STATUS HELPERS
══════════════════════════════════════════════════════════════ */
function _tnKautionStatus(recv, ret, settled) {
  if (settled)      return { label:'Settled',  cls:'tnp-green' };
  if (recv === 0)   return { label:'Pending',  cls:'tnp-amber' };
  return                   { label:'Holding',  cls:'tnp-blue'  };
}

function _tnNkHasOpen(tid) {
  return (_tnNK[tid] || []).some(e => !e.paid);
}

function _tnKautionOpen(tid) {
  const k = _tnKaution[tid];
  return k && k.received > 0 && !k.settled;
}

function _tnIsAllDone(tid) {
  return !_tnNkHasOpen(tid) && !_tnKautionOpen(tid);
}

function _tnFormerVisible(rec) {
  if (rec.done) return false;
  if (!rec.mietende) return true;
  if (_tnNkHasOpen(rec.id) || _tnKautionOpen(rec.id)) return true;
  const monthsAgo = (Date.now() - new Date(rec.mietende)) / (30.44 * 24 * 3600 * 1000);
  return monthsAgo < 12;
}

function _tnDaysToMoveOut(rec) {
  if (!rec || !rec.mietende) return null;
  const diff = new Date(rec.mietende) - new Date();
  const days = Math.ceil(diff / (24 * 3600 * 1000));
  return days;
}

// True if dateStr (ISO or DD.MM.YYYY) is today or in the past
function _tnIsPast(dateStr) {
  if (!dateStr) return false;
  const iso = _tnParseDate(dateStr);
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d <= today;
}

function _tnStatusPill(room, activeRec) {
  if (!activeRec) return '';
  const days = _tnDaysToMoveOut(activeRec);
  if (days !== null && days >= 0 && days <= 60)
    return `<span class="tnp tnp-red">Move-out in ${days} day${days===1?'':'s'}</span>`;
  const k = _tnKaution[activeRec.id];
  const recv = k ? Number(k.received) : 0;
  const settled = k ? k.settled : false;
  if (recv === 0)   return `<span class="tnp tnp-amber">Kaution pending</span>`;
  if (!settled)     return `<span class="tnp tnp-blue">Kaution holding</span>`;
  if (_tnNkHasOpen(activeRec.id)) return `<span class="tnp tnp-amber">NK open</span>`;
  return `<span class="tnp tnp-green">All good</span>`;
}


/* ══════════════════════════════════════════════════════════════
   7. SUPABASE LOAD
══════════════════════════════════════════════════════════════ */
async function _tnLoad() {
  if (!sbL) return;

  const rooms = (typeof appRooms !== 'undefined' && appRooms.length)
    ? appRooms.filter(r => r.active).map(r => r.name)
    : (typeof ALL_ROOMS !== 'undefined' ? ALL_ROOMS : []);

  if (!rooms.length) { _tnRender(); return; }

  const { data: records, error } = await sbL
    .from('tenant_records').select('*')
    .in('room', rooms).order('mietbeginn', { ascending: false });

  if (error) { console.warn('[tenants] load:', error.message); return; }
  _tnRecords = records || [];

  const tids = _tnRecords.map(r => r.id);
  if (!tids.length) { _tnRender(); return; }

  const [kRes, nkRes, docRes] = await Promise.all([
    sbL.from('kaution').select('*').in('tenant_id', tids),
    sbL.from('nk_entries').select('*').in('tenant_id', tids).order('period', { ascending: false }),
    sbL.from('tenant_documents').select('*').in('tenant_id', tids),
  ]);

  _tnKaution = {};
  (kRes.data || []).forEach(k => { _tnKaution[k.tenant_id] = k; });

  _tnNK = {};
  (nkRes.data || []).forEach(e => {
    if (!_tnNK[e.tenant_id]) _tnNK[e.tenant_id] = [];
    _tnNK[e.tenant_id].push(e);
  });

  _tnDocs = {};
  (docRes.data || []).forEach(d => {
    if (!_tnDocs[d.tenant_id]) _tnDocs[d.tenant_id] = [];
    _tnDocs[d.tenant_id].push(d);
  });

  _tnProfileCache = {};
  _tnRecords.filter(r => r.status === 'active').forEach(r => {
    _tnProfileCache[r.room] = {
      firstName: r.first_name || '', lastName: r.last_name || '',
      email: r.email || '', phone: r.phone || '',
      birthday: r.birthday || '', address: r.address || '',
    };
  });

  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   8. _getProfile — cross-tab contract (called by tab-rooms.js)
══════════════════════════════════════════════════════════════ */
function _getProfile(room) {
  return _tnProfileCache[room] || {};
}


/* ══════════════════════════════════════════════════════════════
   9. RENDER
══════════════════════════════════════════════════════════════ */
function _tnRender() {
  const list = document.getElementById('tenantsList');
  if (!list) return;

  // Preserve which cards are currently open
  const openIds = new Set(
    [...list.querySelectorAll('.tn-card.open')].map(c => c.id)
  );

  const rooms = (typeof appRooms !== 'undefined' && appRooms.length)
    ? appRooms.filter(r => r.active).sort((a,b) => (a.sort_order||0) - (b.sort_order||0))
    : (typeof ALL_ROOMS !== 'undefined' ? ALL_ROOMS.map(n => ({ name:n, active:true, vacant:false })) : []);

  if (!rooms.length) { list.innerHTML = `<p class="tn-empty">No rooms configured.</p>`; return; }

  list.innerHTML = rooms.map(r => _tnCardHTML(r, openIds)).join('');
  _tnBindCards();
}


/* ══════════════════════════════════════════════════════════════
   10. CARD HTML
══════════════════════════════════════════════════════════════ */
function _tnCardHTML(room, openIds) {
  const rid      = esc(room.name.replace(/\s+/g,'_').toLowerCase());
  const activeRec = _tnRecords.find(r => r.room === room.name && r.status === 'active');
  const formerRecs = _tnRecords
    .filter(r => r.room === room.name && r.status === 'former')
    .sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));
  const archivedRecs = _tnRecords
    .filter(r => r.room === room.name && r.status === 'archived')
    .sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));

  const isOpen = openIds ? openIds.has('tc-' + rid) : false;

  return `
<div class="tn-card${isOpen?' open':''}" id="tc-${rid}" data-room="${esc(room.name)}">
  ${_tnHeaderHTML(rid, room, activeRec)}
  <div class="tn-body" id="tb-${rid}">
    ${activeRec || room.vacant
      ? _tnRentBarHTML(rid, room, activeRec) + _tnRentFormHTML(rid, room, activeRec)
      : ''}
    ${_tnProfileSectionHTML(rid, room, activeRec)}
    ${_tnDocumentsSectionHTML(rid, room, activeRec)}
    ${_tnKautionHTML(rid, activeRec ? activeRec.id : null, 'card')}
    ${_tnNKHTML(rid, activeRec ? activeRec.id : null, 'card')}
    ${_tnFormerSectionHTML(rid, room.name, formerRecs, archivedRecs)}
  </div>
</div>`;
}

/* ── HEADER ── */
function _tnHeaderHTML(rid, room, activeRec) {
  const vacant = !!room.vacant;
  const fullName = activeRec
    ? [activeRec.first_name, activeRec.last_name].filter(Boolean).join(' ')
    : null;

  const liveP = _tnRoomPricing(room.name);
  const storedKalt = activeRec && activeRec.kaltmiete != null ? Number(activeRec.kaltmiete) : null;
  const storedNK   = activeRec && activeRec.nebenkosten != null ? Number(activeRec.nebenkosten) : null;
  const kalt = storedKalt ?? liveP.kaltmiete;
  const nk   = storedNK   ?? liveP.nebenkosten;
  const warm = (kalt != null && nk != null) ? kalt + nk : kalt;
  const priceLabel = _tnPriceLabel(room.name);
  const isKaltNK = priceLabel && priceLabel.includes('Kalt+NK');

  const mietbeginn = activeRec ? _tnFmtDate(activeRec.mietbeginn) : null;
  const mietende   = activeRec ? _tnFmtDate(activeRec.mietende)   : null;
  const dateStr = mietbeginn && mietende
    ? `${mietbeginn} \u2013 ${mietende}`
    : mietbeginn ? `since ${mietbeginn}` : '';

  const statusPill = _tnStatusPill(room.name, activeRec);

  let midLine = '';
  let botLine = '';

  // Bug 1 fix: Occupied/Vacant badge comes purely from rooms.vacant (Supabase rooms table).
  // activeRec presence is independent — a room can be marked occupied in rooms tab
  // but not yet have a tenant record entered here.
  if (vacant) {
    // rooms.vacant = true → always Vacant regardless of tenant records
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No current tenant</span>
               <span class="tnp tnp-gray">Vacant</span>`;
  } else if (activeRec) {
    // rooms.vacant = false AND has active tenant record → Occupied with full info
    midLine = `
      <span class="tn-tenant-name">${esc(fullName || 'Unnamed tenant')}</span>
      <span class="tnp tnp-green">Occupied</span>
      ${dateStr ? `<span class="tn-tenant-dates">${esc(dateStr)}</span>` : ''}`;
    botLine = `
      <div class="tn-hdr-bot">
        ${warm != null ? `<span class="tn-warm">${_tnFmtEUR(warm)}</span><span class="tn-dim">${isKaltNK ? 'warm' : 'pauschal'}</span>` : ''}
        ${(kalt != null && nk != null && isKaltNK) ? `<div class="tn-dot-sep"></div><span class="tn-dim">${_tnFmtEUR(kalt).replace('\u00a0\u20ac','')} + ${_tnFmtEUR(nk).replace('\u00a0\u20ac','')} kalt+NK</span>` : ''}
        ${priceLabel ? `<div class="tn-dot-sep"></div><span class="tnp tnp-gray">${esc(priceLabel)}</span>` : ''}
        ${statusPill ? `<div class="tn-dot-sep"></div>${statusPill}` : ''}
      </div>`;
  } else {
    // rooms.vacant = false but no tenant record yet → Occupied (room is assigned) but no tenant added
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No tenant added</span>
               <span class="tnp tnp-green">Occupied</span>`;
  }

  return `
<div class="tn-hdr-wrap" onclick="_tnToggleCard('tc-${rid}')">
  <div class="tn-hdr-top">
    <span class="tn-room-lbl">${esc(room.name)}</span>
    <i class="ti ti-chevron-right tn-chev" aria-hidden="true"></i>
  </div>
  <div class="tn-hdr-mid">${midLine}</div>
  ${botLine}
</div>`;
}

/* ── RENT BAR ── */
function _tnRentBarHTML(rid, room, rec) {
  const liveP = _tnRoomPricing(room.name);
  const kalt = (rec && rec.kaltmiete != null) ? Number(rec.kaltmiete) : liveP.kaltmiete;
  const nk   = (rec && rec.nebenkosten != null) ? Number(rec.nebenkosten) : liveP.nebenkosten;
  const warm = (kalt != null && nk != null) ? kalt + nk : kalt;
  const priceLabel = _tnPriceLabel(room.name) || '';
  const src  = (rec && rec.kaltmiete != null) ? 'agreed' : 'from rooms tab';

  return `
<div class="tn-rent-bar" id="rbar-${rid}">
  <div class="tn-rc">
    <div class="tn-rlbl">Kaltmiete</div>
    <div class="tn-rval">${kalt != null ? _tnFmtEUR(kalt) : '\u2014'}</div>
    <div class="tn-rsub">${src}</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Nebenkosten</div>
    <div class="tn-rval">${nk != null ? _tnFmtEUR(nk) : '\u2014'}</div>
    <div class="tn-rsub">per month</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Warmmiete</div>
    <div class="tn-rval">${warm != null ? _tnFmtEUR(warm) : '\u2014'}</div>
    <div class="tn-rsub">derived</div>
  </div>
  <div class="tn-rc">
    <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
      ${priceLabel ? `<span class="tnp tnp-gray">${esc(priceLabel)}</span>` : ''}
      <button class="tn-edit-rent-btn" onclick="_tnToggleRentEdit('${rid}')">
        <i class="ti ti-pencil" style="font-size:10px"></i> Edit
      </button>
    </div>
  </div>
</div>`;
}

/* ── RENT FORM ── */
function _tnRentFormHTML(rid, room, rec) {
  const liveP = _tnRoomPricing(room.name);
  const kalt = (rec && rec.kaltmiete != null) ? Number(rec.kaltmiete) : (liveP.kaltmiete ?? '');
  const nk   = (rec && rec.nebenkosten != null) ? Number(rec.nebenkosten) : (liveP.nebenkosten ?? '');
  const warm = (kalt !== '' && nk !== '') ? Number(kalt) + Number(nk) : (kalt !== '' ? kalt : '');
  const tid  = rec ? rec.id : '';
  const ksoll = (rec && rec.kaution_soll != null) ? Number(rec.kaution_soll)
    : (_tnKautionSoll(room.name, rec ? rec.mietbeginn : null, rec ? rec.mietende : null) ?? '');
  const ctype = _tnRoomContractType(room.name);
  const rule  = ctype === 'kurzzeit' ? '1\u00d7 Kaltmiete \u00b7 KZ rule' : '3\u00d7 Kaltmiete \u00b7 MV rule';

  return `
<div class="tn-rent-form" id="rform-${rid}" style="display:none">
  <div class="tn-rf">
    <span class="tn-flbl">Kaltmiete \u20ac/mo</span>
    <input type="number" id="rf-kalt-${rid}" value="${kalt}" placeholder="${liveP.kaltmiete ?? ''}"
      oninput="_tnUpdateWarm('${rid}')"/>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Nebenkosten \u20ac/mo</span>
    <input type="number" id="rf-nk-${rid}" value="${nk}" placeholder="${liveP.nebenkosten ?? ''}"
      oninput="_tnUpdateWarm('${rid}')"/>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Warmmiete</span>
    <div class="tn-rf-derived" id="rf-warm-${rid}">${warm !== '' ? _tnFmtEUR(warm) : '\u2014'}</div>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Kaution soll</span>
    <input type="number" id="rf-ksoll-${rid}" value="${ksoll}" placeholder="${ksoll}"/>
  </div>
  <div class="tn-rf-save-row" style="grid-column:1/-1;justify-content:space-between;align-items:center">
    <span class="tn-rf-hint" style="margin:0">${rule} \u00b7 Pre-filled from rooms tab. Edit to override. Frozen at move-out.</span>
    <div style="display:flex;gap:6px">
      <button class="tn-btn tn-btn-sm" onclick="_tnToggleRentEdit('${rid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary" onclick="_tnSaveRent('${rid}','${tid}','${esc(room.name)}')">
        <i class="ti ti-check"></i> Save rent
      </button>
    </div>
  </div>
</div>`;
}

/* ── PROFILE SECTION ── */
function _tnProfileSectionHTML(rid, room, rec) {
  const isEmpty = !rec || (!rec.first_name && !rec.last_name && !rec.email && !rec.mietbeginn);
  const startEdit = !rec || isEmpty;
  const email    = rec ? esc(rec.email || '') : '';
  const fullName = rec ? [rec.first_name, rec.last_name].filter(Boolean).join(' ') : '';
  const tid = rec ? rec.id : '';
  const editingCls = startEdit ? ' editing' : '';

  const fv = (val, cls) => val
    ? `<span class="tn-fval${cls ? ' '+cls : ''}">${val}</span>`
    : '<span class="tn-fval muted">Not set</span>';

  const grid = `
  <div class="tn-fg${editingCls}" id="pfg-${rid}">
    <div class="tn-field">
      <span class="tn-flbl">Name</span>
      ${fv(esc(fullName))}
      <input data-f="name" type="text" value="${esc(fullName)}" placeholder="Full name"/>
    </div>
    <div class="tn-field">
      <span class="tn-flbl">Birthday</span>
      ${fv(esc(rec ? rec.birthday||'' : ''))}
      <input data-f="birthday" type="text" value="${esc(rec ? rec.birthday||'' : '')}" placeholder="DD.MM.YYYY"/>
    </div>
    <div class="tn-field">
      <span class="tn-flbl">Email</span>
      ${fv(email)}
      <input data-f="email" type="email" value="${email}" placeholder="tenant@mail.de"/>
    </div>
    <div class="tn-field">
      <span class="tn-flbl">Phone</span>
      ${fv(esc(rec ? rec.phone||'' : ''))}
      <input data-f="phone" type="tel" value="${esc(rec ? rec.phone||'' : '')}" placeholder="+49 ..."/>
    </div>
    <div class="tn-field">
      <span class="tn-flbl">Move in</span>
      ${fv(_tnFmtDate(rec ? rec.mietbeginn : ''))}
      <input data-f="mietbeginn" type="text" value="${_tnFmtDate(rec ? rec.mietbeginn : '')}" placeholder="DD.MM.YYYY"/>
    </div>
    <div class="tn-field">
      <span class="tn-flbl">Move out</span>
      <span class="tn-fval${rec && rec.mietende ? '' : ' muted'}">${_tnFmtDate(rec ? rec.mietende : '') || 'Not set — active'}</span>
      <input data-f="mietende" type="text" value="${_tnFmtDate(rec ? rec.mietende : '')}" placeholder="DD.MM.YYYY — becomes Former when reached"/>
    </div>
    <div class="tn-field tn-field-full">
      <span class="tn-flbl">Address</span>
      ${fv(esc(rec ? rec.address||'' : ''))}
      <input data-f="address" type="text" value="${esc(rec ? rec.address||'' : '')}" placeholder="Street, City"/>
    </div>
  </div>`;

  const footerRead = `
  <div class="tn-sec-footer-split" id="pfoot-read-${rid}" ${startEdit ? 'style="display:none"' : ''}>
    ${email ? `<button class="tn-btn tn-btn-sm" onclick="window.location.href=buildMailto('${email}','Message from Casa Castel','')">
      <i class="ti ti-mail"></i> Email</button>` : ''}
    <button class="tn-btn tn-btn-sm" onclick="_tnResetPw('${esc(room.name)}')">
      <i class="ti ti-key"></i> Reset pw</button>
    <div class="tn-spacer"></div>
    <button class="tn-btn tn-btn-sm" id="pedit-btn-${rid}" onclick="_tnToggleProfile('${rid}','${tid}','${esc(room.name)}')">
      <i class="ti ti-pencil"></i> Edit</button>
  </div>`;

  const footerEdit = `
  <div class="tn-sec-footer" id="pfoot-edit-${rid}" ${startEdit ? '' : 'style="display:none"'}>
    ${rec ? `<button class="tn-btn tn-btn-sm" onclick="_tnToggleProfile('${rid}','${tid}','${esc(room.name)}')">Cancel</button>` : ''}
    <button class="tn-btn tn-btn-primary"
      onclick="${rec ? `_tnSaveProfile('${rid}','${tid}','${esc(room.name)}')` : `_tnSaveNewTenant('${rid}','${esc(room.name)}')`}">
      <i class="ti ti-check"></i> Save</button>
  </div>`;

  return `
<div class="tn-sec" id="psec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="margin-bottom:8px"><span class="tn-sec-lbl">Profile</span></div>
    ${grid}
  </div>
  ${footerRead}
  ${footerEdit}
</div>`;
}
/* ── DOCUMENTS SECTION ── */
function _tnDocumentsSectionHTML(rid, room, rec) {
  // Use the single active contract type from rooms tab — not all configured types
  const activeType = _tnRoomContractType(room.name);
  const docs  = rec ? (_tnDocs[rec.id] || []) : [];
  const tid   = rec ? rec.id : '';
  const getDoc = type => docs.find(d => d.type === type);

  const row = (type, label) => {
    const doc    = getDoc(type);
    const signed = !!doc?.file_url;
    const pill   = signed
      ? `<span class="tnp tnp-green">Signed</span>`
      : `<span class="tnp tnp-gray">Not uploaded</span>`;
    const viewBtn = `<button class="tn-doc-btn${signed?'':' off'}" onclick="${signed ? `_tnViewDoc('${esc(doc.file_url)}')` : ''}" title="View">
      <i class="ti ti-eye"></i></button>`;
    const delBtn = signed
      ? `<button class="tn-doc-btn" style="color:#A32D2D;border-color:#F09595"
           onclick="_tnDeleteDoc('${tid}','${type}','${esc(doc.id)}')" title="Delete">
           <i class="ti ti-trash"></i></button>`
      : '';
    const upBtn = tid
      ? `<button class="tn-doc-btn" onclick="_tnTriggerUpload('${tid}','${type}')" title="Upload">
           <i class="ti ti-upload"></i></button>`
      : `<button class="tn-doc-btn off" title="Save profile first"><i class="ti ti-upload"></i></button>`;
    return `<div class="tn-doc-row">
      <span class="tn-doc-name">${esc(label)}</span>
      ${pill}
      <div class="tn-doc-btns">${viewBtn}${delBtn}${upBtn}</div>
    </div>`;
  };

  return `
<div class="tn-sec">
  <div class="tn-sec-body" style="padding-top:10px;padding-bottom:11px">
    <div style="margin-bottom:8px"><span class="tn-sec-lbl">Documents</span></div>
    ${!activeType ? `<p class="tn-empty">No contract type set in rooms tab.</p>` : ''}
    ${activeType === 'mietvertrag' ? row('mietvertrag','Mietvertrag') : ''}
    ${activeType === 'kurzzeit'    ? row('kurzzeitmietvertrag','Kurzzeitmietvertrag') : ''}
    ${row('einzug','Übergabe Einzug')}
  </div>
</div>`;
}

/* ── KAUTION SECTION (shared card + modal) ── */
function _tnKautionHTML(rid, tid, ctx) {
  const k       = (tid && _tnKaution[tid]) || { received:0, returned:0, settled:false };
  const recv    = Number(k.received)  || 0;
  const ret     = Number(k.returned)  || 0;
  const kept    = recv - ret;
  const st      = _tnKautionStatus(recv, ret, k.settled);
  const pfx     = `${ctx}_${(tid||'none').replace(/-/g,'').slice(0,8)}`;
  const dis     = tid ? '' : 'disabled';
  const opac    = tid ? '' : 'opacity:.45;pointer-events:none;';
  const sec     = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
  const body    = ctx === 'modal' ? 'tn-msec-body' : 'tn-sec-body';
  const footer  = ctx === 'modal' ? 'tn-msec-footer' : 'tn-sec-footer';

  let rec = tid ? _tnRecords.find(r => r.id === tid) : null;
  let soll = rec && rec.kaution_soll != null
    ? Number(rec.kaution_soll)
    : (rec ? _tnKautionSoll(rec.room, rec.mietbeginn, rec.mietende) : null);
  const ctype = rec ? _tnRoomContractType(rec.room) : null;
  const rule  = ctype === 'kurzzeit' ? '1\u00d7 Kaltmiete \u00b7 KZ' : '3\u00d7 Kaltmiete \u00b7 MV';

  const settleLabel = k.settled ? 'Settled' : 'Mark settled';
  const settleCls   = k.settled ? 'tn-btn-primary' : 'tn-btn-sm';

  return `
<div class="${sec}" style="${opac}">
  <div class="${body}" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span class="tn-sec-lbl" style="flex:1">Kaution</span>
      <span class="tnp ${st.cls}">${st.label}</span>
    </div>
    ${soll != null ? `<div class="tn-kaut-hint">Soll: ${_tnFmtEUR(soll)} \u00b7 ${rule}</div>` : ''}
    <div class="tn-kaut-grid">
      <div class="tn-kc">
        <div class="tn-kc-lbl">Received</div>
        <input class="tn-kc-input" type="number" id="kr-${pfx}" value="${recv}" ${dis}
          oninput="_tnCalcKaution('${pfx}','${tid||''}')"/>
      </div>
      <div class="tn-kc">
        <div class="tn-kc-lbl">Returned</div>
        <input class="tn-kc-input" type="number" id="kret-${pfx}" value="${ret}" ${dis}
          oninput="_tnCalcKaution('${pfx}','${tid||''}')"/>
      </div>
      <div class="tn-kc">
        <div class="tn-kc-lbl">Kept</div>
        <div class="tn-kc-val${kept > 0 ? ' gold' : ''}" id="kk-${pfx}">${_tnFmtEUR(kept)}</div>
      </div>
    </div>
  </div>
  <div class="${footer}">
    <button class="tn-btn ${settleCls}" id="kset-${pfx}"
      ${dis} onclick="_tnToggleSettle('${pfx}','${tid||''}')">
      <i class="ti ti-check"></i> ${settleLabel}
    </button>
  </div>
</div>`;
}

/* ── NK SECTION (shared card + modal) ── */
function _tnNKHTML(rid, tid, ctx) {
  if (!tid) {
    const sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
    return `<div class="${sec}" style="opacity:.45;pointer-events:none">
      <div class="tn-sec-body" style="padding-top:10px;padding-bottom:11px">
        <div style="margin-bottom:8px"><span class="tn-sec-lbl">NK Abrechnungen</span></div>
        <p class="tn-empty">Save profile first.</p>
      </div></div>`;
  }

  const entries = (_tnNK[tid] || []).slice().sort((a,b) => b.period.localeCompare(a.period));
  const open    = entries.filter(e => !e.paid);
  const settled = entries.filter(e => e.paid);
  const sec     = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
  const openCount = open.length;

  const nkRow = (e) => {
    const created = !!(e.amount || e.document_url);
    const dotC = created ? 'tn-nd-act'  : `tn-nd-off${!created ? ' tap' : ''}`;
    const dotS = e.sent  ? 'tn-nd-done' : (created ? 'tn-nd-off tap' : 'tn-nd-off');
    const dotP = e.paid  ? 'tn-nd-done' : (e.sent  ? 'tn-nd-off tap' : 'tn-nd-off');

    const onC = (!created) ? `onclick="_tnNkCreate('${e.id}')"` : '';
    const onS = (created && !e.sent) ? `onclick="_tnNkMarkSent('${e.id}')"` : '';
    const onP = (e.sent && !e.paid)  ? `onclick="_tnNkMarkPaid('${e.id}')"` : '';

    let info = '';
    if (!created) info = `<span style="color:var(--cc-stone);font-style:italic">Not created</span>`;
    else {
      const dir = e.direction === 'you_pay' ? '\u2193' : '\u2191';
      info = `<span class="amt">${dir} ${_tnFmtEUR(e.amount)}</span>`;
      if (e.sent && !e.paid) info += ` \u00b7 <span style="color:#854F0B;font-weight:500">unpaid</span>`;
      else if (e.paid) info += ` \u00b7 <span style="color:#3B6D11">paid</span>`;
    }

    const createEditBtn = !created
      ? `<button class="tn-nk-btn tn-nk-btn-dark" onclick="_tnNkCreate('${e.id}')">
           <i class="ti ti-calculator"></i> Create</button>`
      : `<button class="tn-nk-btn" onclick="_tnNkCreate('${e.id}')">
           <i class="ti ti-calculator"></i> Edit</button>
         <button class="tn-nk-btn" onclick="_tnNkView('${e.id}')">
           <i class="ti ti-eye"></i> View</button>`;

    return `<div class="tn-nk-row" id="nkrow-${e.id}">
      <span class="tn-nk-period">${esc(e.period)}</span>
      <div class="tn-nk-dots">
        <div class="tn-nd ${dotC}" title="Created" ${onC}><i class="ti ti-file"></i></div>
        <div class="tn-nd ${dotS}" title="Sent"    ${onS}><i class="ti ti-send"></i></div>
        <div class="tn-nd ${dotP}" title="Paid"    ${onP}><i class="ti ti-check"></i></div>
      </div>
      <span class="tn-nk-info" id="nkinfo-${e.id}">${info}</span>
      <div class="tn-nk-btns">
        ${createEditBtn}
        <button class="tn-nk-btn tn-nk-btn-del" onclick="_tnDeleteNk('${e.id}','${tid}')">
          <i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  };

  const settledRow = (e) => {
    const dir = e.direction === 'you_pay' ? '\u2193' : '\u2191';
    return `<div class="tn-nk-row" style="opacity:.5" id="nkrow-${e.id}">
      <span class="tn-nk-period">${esc(e.period)}</span>
      <div class="tn-nk-dots">
        <div class="tn-nd tn-nd-done"><i class="ti ti-file"></i></div>
        <div class="tn-nd tn-nd-done"><i class="ti ti-send"></i></div>
        <div class="tn-nd tn-nd-done"><i class="ti ti-check"></i></div>
      </div>
      <span class="tn-nk-info"><span class="amt">${dir} ${_tnFmtEUR(e.amount)}</span> \u00b7 paid</span>
      <div class="tn-nk-btns">
        <button class="tn-nk-btn" onclick="_tnNkView('${e.id}')">
          <i class="ti ti-eye"></i> View</button>
        <button class="tn-nk-btn tn-nk-btn-del" onclick="_tnDeleteNk('${e.id}','${tid}')">
          <i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  };

  return `
<div class="${sec}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="tn-sec-lbl" style="flex:1">NK Abrechnungen</span>
      ${openCount > 0 ? `<span class="tnp tnp-amber">${openCount} open</span>` : '<span class="tnp tnp-green">All done</span>'}
    </div>
    ${open.map(nkRow).join('')}
    ${settled.map(settledRow).join('')}
    ${!open.length && !settled.length ? `<p class="tn-empty">No NK periods yet.</p>` : ''}
    <button class="tn-add-nk-btn" onclick="_tnAddNkPeriod('${tid}','${ctx}')">
      <i class="ti ti-plus"></i> Add NK period
    </button>
  </div>
</div>`;
}

/* ── FORMER SECTION ── */
function _tnFormerSectionHTML(rid, roomName, formerRecs, archivedRecs) {
  const visible  = formerRecs.filter(r => _tnFormerVisible(r));
  const hidden   = formerRecs.filter(r => !_tnFormerVisible(r) && !r.done);
  const arcList  = archivedRecs;
  const showOld  = !!_tnShowOlder[rid];
  const toShow   = showOld ? [...visible, ...hidden] : visible;

  const formerRow = rec => {
    const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '\u2014';
    const period = [_tnFmtDate(rec.mietbeginn), _tnFmtDate(rec.mietende)].filter(Boolean).join(' \u2013 ');
    const nkDone = !_tnNkHasOpen(rec.id);
    const kDone  = !_tnKautionOpen(rec.id);
    const canHide = nkDone && kDone; // only offer Hide when all business closed
    return `<div class="tn-former-row" style="gap:6px">
      <div class="tn-former-info" onclick="_tnOpenModal('${rec.id}')" style="cursor:pointer;flex:1">
        <div class="tn-former-name">${esc(name)}</div>
        <div class="tn-former-period">${esc(period)}</div>
      </div>
      <div class="tn-former-pills">
        <span class="tnp ${nkDone ? 'tnp-green' : 'tnp-amber'}">${nkDone ? 'NK done' : 'NK open'}</span>
        <span class="tnp ${kDone  ? 'tnp-green' : 'tnp-amber'}">${kDone  ? 'Settled' : 'Kaution open'}</span>
      </div>
      ${canHide
        ? `<button class="tn-btn tn-btn-sm" onclick="_tnHideFormer('${rec.id}')" title="Archive this tenant">
             <i class="ti ti-eye-off" style="font-size:11px"></i></button>`
        : `<i class="ti ti-chevron-right" onclick="_tnOpenModal('${rec.id}')" style="font-size:13px;color:var(--cc-stone);cursor:pointer"></i>`}
    </div>`;
  };

  const arcRow = rec => {
    const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '\u2014';
    const period = [_tnFmtDate(rec.mietbeginn), _tnFmtDate(rec.mietende)].filter(Boolean).join(' \u2013 ');
    return `<div class="tn-arc-row">
      <div class="tn-arc-info">
        <div class="tn-arc-name">${esc(name)}</div>
        <div class="tn-arc-period">${esc(period)}</div>
      </div>
      <button class="tn-btn tn-btn-sm" onclick="_tnReopen('${rec.id}')">Reopen</button>
      <button class="tn-btn tn-btn-sm" onclick="_tnHideFormer('${rec.id}')" title="Keep archived">
        <i class="ti ti-eye-off" style="font-size:11px"></i></button>
    </div>`;
  };

  const arcId = `arc-${rid}`;

  return `
<div class="tn-sec">
  <div class="tn-sec-body" style="padding-top:10px;padding-bottom:0">
    <div style="margin-bottom:6px"><span class="tn-sec-lbl">Former tenants</span></div>
  </div>
  ${toShow.length ? toShow.map(formerRow).join('') : `<p class="tn-empty" style="padding:0 14px 6px">None with open business.</p>`}
  ${hidden.length ? `<button class="tn-show-older" onclick="_tnToggleOlder('${rid}')">
    <i class="ti ti-${showOld ? 'eye-off' : 'eye'}"></i>
    ${showOld ? 'Hide older' : `Show ${hidden.length} older`}
  </button>` : ''}
  <button class="tn-add-former-btn" onclick="_tnAddFormer('${esc(roomName)}')">
    <i class="ti ti-plus"></i> Add former tenant
  </button>
  ${arcList.length ? `
  <button class="tn-arc-toggle" onclick="document.getElementById('${arcId}').classList.toggle('open')">
    <i class="ti ti-archive" style="font-size:13px"></i> Archived (${arcList.length})
  </button>
  <div class="tn-arc-body" id="${arcId}">
    ${arcList.map(arcRow).join('')}
  </div>` : ''}
</div>`;
}


/* ══════════════════════════════════════════════════════════════
   11. MODAL
══════════════════════════════════════════════════════════════ */
function _tnOpenModal(tid) {
  const rec = _tnRecords.find(r => r.id === tid);
  if (!rec) return;
  _tnModalTid = tid;

  const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '\u2014';
  const period = [_tnFmtDate(rec.mietbeginn), _tnFmtDate(rec.mietende)].filter(Boolean).join(' \u2013 ');
  const ctLabel = _tnContractLabel(rec.contract_type);
  const allDone = _tnIsAllDone(tid);

  document.getElementById('tnModalName').textContent = name;
  document.getElementById('tnModalSub').innerHTML =
    esc(period) +
    (ctLabel ? ` <span class="tnp tnp-gray">${esc(ctLabel)}</span>` : '') +
    (allDone  ? ` <span class="tnp tnp-green">All closed</span>` : ` <span class="tnp tnp-amber">Open items</span>`);

  document.getElementById('tnModalBody').innerHTML = _tnModalBodyHTML(rec);
  document.getElementById('tnModalFooter').innerHTML = _tnModalFooterHTML(rec, allDone);

  document.getElementById('tnModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _tnModalBodyHTML(rec) {
  const tid  = rec.id;
  const full = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const ct   = rec.contract_type;
  const dK   = rec.kaltmiete   != null ? Number(rec.kaltmiete)   : null;
  const dNK  = rec.nebenkosten != null ? Number(rec.nebenkosten) : null;
  const dKS  = rec.kaution_soll != null ? Number(rec.kaution_soll) : null;
  const warm = (dK != null && dNK != null) ? dK + dNK : dK;

  const docs  = _tnDocs[tid] || [];
  const getDoc = type => docs.find(d => d.type === type);
  const docRow = (type, label) => {
    const doc    = getDoc(type);
    const signed = !!doc?.file_url;
    const delBtn = signed
      ? `<button class="tn-doc-btn" style="color:#A32D2D;border-color:#F09595"
           onclick="_tnDeleteDoc('${tid}','${type}','${esc(doc.id)}')" title="Delete">
           <i class="ti ti-trash"></i></button>`
      : '';
    return `<div class="tn-doc-row">
      <span class="tn-doc-name">${esc(label)}</span>
      <span class="tnp ${signed ? 'tnp-green' : 'tnp-gray'}">${signed ? 'Signed' : 'Not uploaded'}</span>
      <div class="tn-doc-btns">
        <button class="tn-doc-btn${signed ? '' : ' off'}" onclick="${signed ? `_tnViewDoc('${esc(doc.file_url)}')` : ''}">
          <i class="ti ti-eye"></i></button>
        ${delBtn}
        <button class="tn-doc-btn" onclick="_tnTriggerUpload('${tid}','${type}')">
          <i class="ti ti-upload"></i></button>
      </div>
    </div>`;
  };

  return `
  <!-- PROFILE -->
  <div class="tn-msec" id="mprof-sec-${tid}">
    <div class="tn-msec-body" style="padding-top:10px">
      <div style="margin-bottom:8px"><span class="tn-msec-lbl">Profile</span></div>

      <!-- READ -->
      <div class="tn-fg" id="mprof-read-${tid}">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <span class="tn-fval">${esc(full) || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <span class="tn-fval">${esc(rec.birthday||'') || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <span class="tn-fval">${esc(rec.email||'') || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <span class="tn-fval">${esc(rec.phone||'') || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move in</span>
          <span class="tn-fval">${_tnFmtDate(rec.mietbeginn) || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move out</span>
          <span class="tn-fval">${_tnFmtDate(rec.mietende) || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Kaltmiete</span>
          <span class="tn-fval">${dK != null ? _tnFmtEUR(dK) : '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Nebenkosten</span>
          <span class="tn-fval">${dNK != null ? _tnFmtEUR(dNK) : '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Kaution soll</span>
          <span class="tn-fval">${dKS != null ? _tnFmtEUR(dKS) : '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Contract</span>
          <span class="tn-fval">${ct ? _tnContractLabel(ct) : '<span class="muted">Not set</span>'}</span></div>
      </div>

      <!-- EDIT -->
      <div class="tn-fg" id="mprof-edit-${tid}" style="display:none">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <input data-mf="name" type="text" value="${esc(full)}" placeholder="Full name"/></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <input data-mf="birthday" type="text" value="${esc(rec.birthday||'')}" placeholder="DD.MM.YYYY"/></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <input data-mf="email" type="email" value="${esc(rec.email||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <input data-mf="phone" type="tel" value="${esc(rec.phone||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Move in</span>
          <input data-mf="mietbeginn" type="text" value="${_tnFmtDate(rec.mietbeginn)}"/></div>
        <div class="tn-field"><span class="tn-flbl">Move out</span>
          <input data-mf="mietende" type="text" value="${_tnFmtDate(rec.mietende)}" placeholder="DD.MM.YYYY"/></div>
        <div class="tn-field"><span class="tn-flbl">Kaltmiete</span>
          <input data-mf="kaltmiete" type="number" value="${dK ?? ''}"/></div>
        <div class="tn-field"><span class="tn-flbl">Nebenkosten</span>
          <input data-mf="nebenkosten" type="number" value="${dNK ?? ''}"/></div>
        <div class="tn-field"><span class="tn-flbl">Kaution soll</span>
          <input data-mf="kaution_soll" type="number" value="${dKS ?? ''}"/></div>
        <div class="tn-field">
          <span class="tn-flbl">Contract</span>
          <div class="tn-contract-toggle">
            <button class="tn-btn tn-btn-sm${ct==='mietvertrag'?' tn-btn-primary':''}"
              data-ct="mietvertrag" onclick="_tnModalSetCt('mietvertrag',this)">MV</button>
            <button class="tn-btn tn-btn-sm${ct==='kurzzeit'?' tn-btn-primary':''}"
              data-ct="kurzzeit" onclick="_tnModalSetCt('kurzzeit',this)">KZ</button>
          </div>
        </div>
      </div>
    </div>

    <!-- FOOTER: read = Edit btn · edit = Cancel + Save -->
    <div class="tn-msec-footer" id="mprof-foot-read-${tid}">
      <button class="tn-btn tn-btn-sm" onclick="_tnToggleModalProfile('${tid}')">
        <i class="ti ti-pencil"></i> Edit</button>
    </div>
    <div class="tn-msec-footer" id="mprof-foot-edit-${tid}" style="display:none">
      <button class="tn-btn tn-btn-sm" onclick="_tnToggleModalProfile('${tid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary" onclick="_tnModalSaveProfile('${tid}')">
        <i class="ti ti-check"></i> Save info</button>
    </div>
  </div>

  <!-- DOCUMENTS -->
  <div class="tn-msec">
    <div class="tn-msec-hdr" style="margin-bottom:0">
      <span class="tn-msec-lbl">Documents</span>
    </div>
    <div class="tn-msec-body" style="padding-bottom:11px">
      ${(() => {
        // For former tenants: stored contract_type is the snapshot — use it.
        // For active tenants (ct=null): use rooms tab active toggle.
        const effectiveCt = ct || _tnRoomContractType(rec.room);
        if (effectiveCt === 'mietvertrag')  return docRow('mietvertrag','Mietvertrag');
        if (effectiveCt === 'kurzzeit')     return docRow('kurzzeitmietvertrag','Kurzzeitmietvertrag');
        return docRow('mietvertrag','Mietvertrag') + docRow('kurzzeitmietvertrag','Kurzzeitmietvertrag');
      })()}
      ${docRow('einzug','Übergabe Einzug')}
      ${docRow('auszug','Übergabe Auszug')}
    </div>
  </div>

  <!-- KAUTION -->
  ${_tnKautionHTML('m', tid, 'modal')}

  <!-- NK -->
  ${_tnNKHTML('m', tid, 'modal')}
  `;
}

function _tnModalFooterHTML(rec, allDone) {
  return `
    <button class="tn-btn tn-btn-ghost" onclick="_tnMarkDone('${rec.id}')">
      <i class="ti ti-archive"></i> Archive</button>
    <div class="tn-sheet-spacer"></div>
    <button class="tn-btn tn-btn-danger${allDone ? '' : ''}"
      style="${allDone ? '' : 'opacity:.35;pointer-events:none'}"
      onclick="_tnDeleteFormer('${rec.id}')">
      <i class="ti ti-trash"></i> Delete</button>
    <span style="font-size:10px;color:var(--cc-stone)">When all closed</span>`;
}

function _tnToggleModalProfile(tid) {
  const read  = document.getElementById('mprof-read-' + tid);
  const edit  = document.getElementById('mprof-edit-' + tid);
  const fread = document.getElementById('mprof-foot-read-' + tid);
  const fedit = document.getElementById('mprof-foot-edit-' + tid);
  if (!read || !edit) return;
  const isEditing = read.style.display === 'none';
  read.style.display  = isEditing ? '' : 'none';
  edit.style.display  = isEditing ? 'none' : '';
  if (fread) fread.style.display = isEditing ? '' : 'none';
  if (fedit) fedit.style.display = isEditing ? 'none' : '';
}

function _tnModalSetCt(type, btn) {
  btn.closest('.tn-contract-toggle').querySelectorAll('.tn-btn').forEach(b => {
    b.classList.remove('tn-btn-primary');
    b.classList.add('tn-btn-sm');
  });
  btn.classList.add('tn-btn-primary');
}

function _tnModalUpdateWarm() {
  const body = document.getElementById('tnModalBody');
  if (!body) return;
  const k  = parseFloat(body.querySelector('[data-mf="kaltmiete"]')?.value)   || 0;
  const nk = parseFloat(body.querySelector('[data-mf="nebenkosten"]')?.value) || 0;
}

function _tnCloseModal() {
  document.getElementById('tnModal').classList.remove('open');
  document.body.style.overflow = '';
  _tnModalTid = null;
}

function _tnModalOutside(e) {
  if (e.target === document.getElementById('tnModal')) _tnCloseModal();
}


/* ══════════════════════════════════════════════════════════════
   12. CARD INTERACTIONS
══════════════════════════════════════════════════════════════ */
function _tnToggleCard(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('open');
  if (card.classList.contains('open')) {
    requestAnimationFrame(() => {
      const top  = card.getBoundingClientRect().top + window.scrollY;
      const navH = document.querySelector('.cc-header')?.offsetHeight || 100;
      window.scrollTo({ top: top - navH - 8, behavior:'smooth' });
    });
  }
}

function _tnToggleRentEdit(rid) {
  const bar  = document.getElementById('rbar-'  + rid);
  const form = document.getElementById('rform-' + rid);
  if (!bar || !form) return;
  const show = form.style.display === 'none' || !form.style.display;
  form.style.display = show ? 'grid' : 'none';
  bar.style.display  = show ? 'none' : 'flex';
}

function _tnUpdateWarm(rid) {
  const k  = parseFloat(document.getElementById('rf-kalt-' + rid)?.value) || 0;
  const nk = parseFloat(document.getElementById('rf-nk-'   + rid)?.value) || 0;
  const el = document.getElementById('rf-warm-' + rid);
  if (el) el.textContent = (k || nk) ? _tnFmtEUR(k + nk) : '\u2014';
}

function _tnToggleProfile(rid, tid, room) {
  const fg    = document.getElementById('pfg-'       + rid);
  const fread = document.getElementById('pfoot-read-'+ rid);
  const fedit = document.getElementById('pfoot-edit-'+ rid);
  if (!fg) return;
  const editing = fg.classList.contains('editing');
  fg.classList.toggle('editing', !editing);
  if (fread) fread.style.display = !editing ? 'none' : '';
  if (fedit) fedit.style.display = !editing ? ''     : 'none';
}

function _tnToggleOlder(rid) {
  _tnShowOlder[rid] = !_tnShowOlder[rid];
  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   13. PROFILE SAVE
══════════════════════════════════════════════════════════════ */
function _tnCollectProfile(container, selector) {
  const get = f => container.querySelector(`[${selector}="${f}"]`)?.value?.trim() || '';
  const nameVal = get('name');
  const parts   = nameVal.split(/\s+/);
  const firstName = parts.slice(0,-1).join(' ') || parts[0] || '';
  const lastName  = parts.length > 1 ? parts[parts.length-1] : '';
  return {
    first_name: firstName, last_name: lastName,
    email: get('email'), phone: get('phone'),
    birthday: get('birthday'), address: get('address'),
    mietbeginn: _tnParseDate(get('mietbeginn')),
    mietende:   _tnParseDate(get('mietende')),
    kaltmiete:     parseFloat(container.querySelector(`[${selector}="kaltmiete"]`)?.value)    || null,
    nebenkosten:   parseFloat(container.querySelector(`[${selector}="nebenkosten"]`)?.value)  || null,
    kaution_soll:  parseFloat(container.querySelector(`[${selector}="kaution_soll"]`)?.value) || null,
  };
}

async function _tnSaveNewTenant(rid, roomName) {
  if (!sbL) return;
  const sec = document.getElementById('pfg-' + rid);
  if (!sec) return;
  const btn = document.getElementById('pfoot-edit-' + rid)?.querySelector('.tn-btn-primary');
  if (btn) { btn.textContent = '\u2026'; btn.disabled = true; }

  const p = _tnCollectProfile(sec, 'data-f');
  if (!p.first_name && !p.last_name && !p.email) {
    const inp = sec.querySelector('[data-f="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  const mietende  = p.mietende;
  // Only transition to former if mietende is actually reached (today or past)
  // A future move-out date keeps the tenant active
  const status    = (mietende && _tnIsPast(mietende)) ? 'former' : 'active';
  const liveP     = _tnRoomPricing(roomName);
  const ctype     = _tnRoomContractType(roomName);

  const payload = {
    room: roomName, status, contract_type: mietende ? ctype : null,
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende,
    kaltmiete:    p.kaltmiete   ?? (mietende ? liveP.kaltmiete   : null) ?? null,
    nebenkosten:  p.nebenkosten ?? (mietende ? liveP.nebenkosten : null) ?? null,
    kaution_soll: p.kaution_soll ?? _tnKautionSoll(roomName, p.mietbeginn, mietende) ?? null,
  };

  const { data, error } = await sbL.from('tenant_records').insert(payload).select().single();
  if (error) {
    console.warn('[tenants] create:', error.message);
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  await _tnEnsureKaution(data.id);
  if (status === 'active') await _tnWriteDefaultPw(roomName);
  await _tnLoad();
}
  const sec = document.getElementById('pfg-' + rid);
  if (!sec) return;
  const btn = document.getElementById('pfoot-edit-' + rid)?.querySelector('.tn-btn-primary');
  if (btn) { btn.textContent = '\u2026'; btn.disabled = true; }

  const p   = _tnCollectProfile(sec, 'data-f');
  const rec = _tnRecords.find(r => r.id === tid);
  if (!p.first_name && !p.last_name && !p.email) {
    const inp = sec.querySelector('[data-f="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  const toFormer = !!(p.mietende && _tnIsPast(p.mietende) && rec?.status === 'active');
  const toActive = rec?.status === 'former' && (!p.mietende || !_tnIsPast(p.mietende));
  const liveP    = _tnRoomPricing(roomName);
  const update   = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende: p.mietende,
    kaltmiete:   p.kaltmiete   ?? null,
    nebenkosten: p.nebenkosten ?? null,
    kaution_soll:p.kaution_soll ?? null,
  };
  if (toFormer) {
    update.status        = 'former';
    update.contract_type = _tnRoomContractType(roomName);
    if (!p.kaltmiete)   update.kaltmiete   = liveP.kaltmiete   ?? null;
    if (!p.nebenkosten) update.nebenkosten = liveP.nebenkosten ?? null;
  }
  if (toActive) {
    update.status        = 'active';
    update.contract_type = null;
    update.done          = false;
  }

  const { error } = await sbL.from('tenant_records').update(update).eq('id', tid);
  if (error) {
    console.warn('[tenants] save:', error.message);
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }
  await _tnEnsureKaution(tid);

  // If status changed (active↔former), a full re-render is needed
  if (toFormer || toActive) { await _tnLoad(); return; }

  // Update local cache
  if (rec) Object.assign(rec, update);

  // Update fval spans in-place
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
  const fvals = sec.querySelectorAll('.tn-fval');
  const setFv = (el, val, muteIfEmpty) => {
    if (!el) return;
    if (val) { el.textContent = val; el.classList.remove('muted'); }
    else if (muteIfEmpty) { el.textContent = 'Not set'; el.classList.add('muted'); }
  };
  // Order matches grid: name, birthday, email, phone, movein, moveout, address
  if (fvals[0]) setFv(fvals[0], fullName, true);
  if (fvals[1]) setFv(fvals[1], p.birthday || '', true);
  if (fvals[2]) setFv(fvals[2], p.email || '', true);
  if (fvals[3]) setFv(fvals[3], p.phone || '', true);
  if (fvals[4]) setFv(fvals[4], _tnFmtDate(p.mietbeginn) || '', true);
  if (fvals[5]) {
    const mo = _tnFmtDate(p.mietende);
    fvals[5].textContent = mo || 'Not set \u2014 active';
    fvals[5].classList.toggle('muted', !mo);
  }
  if (fvals[6]) setFv(fvals[6], p.address || '', true);

  // Flip back to read mode — keep card open
  _tnToggleProfile(rid, tid, roomName);
  if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
}

async function _tnSaveRent(rid, tid, roomName) {
  if (!sbL || !tid) return;
  const kalt  = parseFloat(document.getElementById('rf-kalt-'  + rid)?.value) || null;
  const nk    = parseFloat(document.getElementById('rf-nk-'    + rid)?.value) || null;
  const ksoll = parseFloat(document.getElementById('rf-ksoll-' + rid)?.value) || null;
  const { error } = await sbL.from('tenant_records')
    .update({ kaltmiete: kalt, nebenkosten: nk, kaution_soll: ksoll }).eq('id', tid);
  if (error) { console.warn('[tenants] save rent:', error.message); return; }

  // Update local cache
  const rec = _tnRecords.find(r => r.id === tid);
  if (rec) { rec.kaltmiete = kalt; rec.nebenkosten = nk; rec.kaution_soll = ksoll; }

  // Update rent bar read values in-place
  const liveP = _tnRoomPricing(roomName);
  const resolvedKalt = kalt ?? liveP?.kaltmiete ?? null;
  const resolvedNk   = nk   ?? liveP?.nebenkosten ?? null;
  const resolvedWarm = (resolvedKalt != null && resolvedNk != null) ? resolvedKalt + resolvedNk : null;

  const bar = document.getElementById('rbar-' + rid);
  if (bar) {
    const vals = bar.querySelectorAll('.tn-rval');
    if (vals[0]) vals[0].textContent = resolvedKalt != null ? _tnFmtEUR(resolvedKalt) : '\u2014';
    if (vals[1]) vals[1].textContent = resolvedNk   != null ? _tnFmtEUR(resolvedNk)   : '\u2014';
    if (vals[2]) vals[2].textContent = resolvedWarm != null ? _tnFmtEUR(resolvedWarm) : '\u2014';
    const subs = bar.querySelectorAll('.tn-rsub');
    if (subs[0]) subs[0].textContent = kalt != null ? 'agreed' : 'from rooms tab';
    if (subs[1]) subs[1].textContent = nk   != null ? 'agreed' : 'per month';
  }

  // Update kaution hint if visible
  const kautHint = document.querySelector('#tab-tenants .tn-kaut-hint');
  if (kautHint && ksoll != null) {
    const ctype = _tnRoomContractType(roomName);
    const rule = ctype === 'kurzzeit' ? '1\u00d7 Kaltmiete \u00b7 KZ rule' : '3\u00d7 Kaltmiete \u00b7 MV rule';
    kautHint.textContent = `Soll: ${_tnFmtEUR(ksoll)} \u00b7 ${rule}`;
  }

  // Switch back to read bar, keep card open
  _tnToggleRentEdit(rid);
}

async function _tnModalSaveProfile(tid) {
  if (!sbL) return;
  const body = document.getElementById('tnModalBody');
  if (!body) return;

  const p     = _tnCollectProfile(body, 'data-mf');
  const ctBtn = body.querySelector('.tn-contract-toggle .tn-btn-primary');
  const ctype = ctBtn?.dataset?.ct || null;

  const update = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    mietbeginn: p.mietbeginn, mietende: p.mietende,
    contract_type: ctype,
    kaltmiete:   p.kaltmiete   ?? null,
    nebenkosten: p.nebenkosten ?? null,
    kaution_soll:p.kaution_soll ?? null,
  };

  const rec = _tnRecords.find(r => r.id === tid);
  const toActive = rec?.status === 'former' && (!p.mietende || !_tnIsPast(p.mietende));
  if (toActive) {
    update.status        = 'active';
    update.contract_type = null;
    update.done          = false;
  }

  // Update local cache immediately — instant UI
  if (rec) Object.assign(rec, update);

  // Switch back to read mode and refresh read fields
  const readEl = document.getElementById('mprof-read-' + tid);
  const editEl = document.getElementById('mprof-edit-' + tid);
  const freadEl = document.getElementById('mprof-foot-read-' + tid);
  const feditEl = document.getElementById('mprof-foot-edit-' + tid);
  if (readEl && editEl) {
    // Refresh read view values
    const vals = readEl.querySelectorAll('.tn-fval');
    const labels = [
      [p.first_name, p.last_name].filter(Boolean).join(' '),
      rec?.birthday || '',
      rec?.email || '',
      rec?.phone || '',
      _tnFmtDate(p.mietbeginn),
      _tnFmtDate(p.mietende),
      p.kaltmiete != null ? _tnFmtEUR(p.kaltmiete) : '',
      p.nebenkosten != null ? _tnFmtEUR(p.nebenkosten) : '',
      p.kaution_soll != null ? _tnFmtEUR(p.kaution_soll) : '',
      ctype ? _tnContractLabel(ctype) : '',
    ];
    vals.forEach((el, i) => {
      el.innerHTML = labels[i] || '<span class="muted">Not set</span>';
    });
    readEl.style.display = '';
    editEl.style.display = 'none';
    if (freadEl) freadEl.style.display = '';
    if (feditEl) feditEl.style.display = 'none';
  }

  // Update modal header name instantly
  const newName = [p.first_name, p.last_name].filter(Boolean).join(' ') || '\u2014';
  const el = document.getElementById('tnModalName');
  if (el) el.textContent = newName;

  // Fire to Supabase in background
  sbL.from('tenant_records').update(update).eq('id', tid)
    .then(({ error }) => { if (error) console.warn('[tenants] modal save:', error.message); });

  if (toActive) { _tnCloseModal(); }
  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   14. KAUTION INTERACTIONS
══════════════════════════════════════════════════════════════ */
function _tnCalcKaution(pfx, tid) {
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const kept = recv - ret;
  const el   = document.getElementById('kk-' + pfx);
  if (el) {
    el.textContent = _tnFmtEUR(kept);
    el.className   = 'tn-kc-val' + (kept > 0 ? ' gold' : '');
  }
  if (!tid) return;
  clearTimeout(_tnKautTimers[pfx]);
  _tnKautTimers[pfx] = setTimeout(() => _tnSaveKaution(tid, recv, ret), 800);
}

async function _tnSaveKaution(tid, received, returned) {
  if (!sbL) return;
  if (!_tnKaution[tid]) await _tnEnsureKaution(tid);
  const k = _tnKaution[tid];
  if (!k?.id) return;
  k.received = received; k.returned = returned;
  await sbL.from('kaution').update({ received, returned }).eq('id', k.id);
  _tnRefreshFormerBadges(tid);
  if (_tnModalTid === tid) {
    const delBtn = document.getElementById('tnModalFooter')?.querySelector('.tn-btn-danger');
    if (delBtn) {
      const done = _tnIsAllDone(tid);
      delBtn.style.opacity        = done ? '1' : '.35';
      delBtn.style.pointerEvents  = done ? 'auto' : 'none';
    }
  }
}

async function _tnToggleSettle(pfx, tid) {
  if (!sbL || !tid) return;
  if (!_tnKaution[tid]) await _tnEnsureKaution(tid);
  const k = _tnKaution[tid];
  if (!k?.id) return;

  // Toggle immediately in local cache
  k.settled = !k.settled;

  // Update DOM instantly
  const btn = document.getElementById('kset-' + pfx);
  if (btn) {
    btn.innerHTML = `<i class="ti ti-check"></i> ${k.settled ? 'Settled' : 'Mark settled'}`;
    btn.className = `tn-btn ${k.settled ? 'tn-btn-primary' : 'tn-btn-sm'}`;
  }
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const st   = _tnKautionStatus(recv, ret, k.settled);
  const pill = document.querySelector(`#kset-${pfx}`)?.closest('.tn-sec,.tn-msec')?.querySelector('.tnp');
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }

  // Fire to Supabase in background
  sbL.from('kaution').update({ settled: k.settled }).eq('id', k.id)
    .then(({ error }) => { if (error) console.warn('[tenants] settle:', error.message); });

  _tnRefreshFormerBadges(tid);
}

async function _tnEnsureKaution(tid) {
  if (!sbL || _tnKaution[tid]) return;
  const { data } = await sbL.from('kaution')
    .insert({ tenant_id: tid, received:0, returned:0, settled:false })
    .select().single();
  if (data) _tnKaution[tid] = data;
}


/* ══════════════════════════════════════════════════════════════
   15. NK INTERACTIONS
══════════════════════════════════════════════════════════════ */
async function _tnAddNkPeriod(tid, ctx) {
  const scope = (_tnModalTid === tid && ctx === 'modal')
    ? document.getElementById('tnModalBody')
    : document;
  const addBtn = scope?.querySelector(`.tn-add-nk-btn[onclick*="${tid}"]`);
  if (!addBtn) return;

  const wrap = document.createElement('div');
  wrap.className = 'tn-nk-add-form';
  wrap.innerHTML = `
    <input placeholder="e.g. 2025/26" maxlength="12" style="flex:1"/>
    <button class="tn-btn tn-btn-primary" style="flex-shrink:0">Add</button>
    <button class="tn-btn tn-btn-sm" style="flex-shrink:0">Cancel</button>`;
  addBtn.style.display = 'none';
  addBtn.parentNode.insertBefore(wrap, addBtn);
  const inp = wrap.querySelector('input');
  inp.focus();
  wrap.querySelector('.tn-btn-primary').onclick = () => _tnConfirmAddNk(tid, inp, wrap, addBtn);
  wrap.querySelector('.tn-btn-sm').onclick = () => { wrap.remove(); addBtn.style.display = ''; };
}

async function _tnConfirmAddNk(tid, inp, wrap, addBtn) {
  const period = inp.value.trim();
  if (!period || !sbL) return;
  const { data, error } = await sbL.from('nk_entries')
    .insert({ tenant_id: tid, period, sent:false, paid:false }).select().single();
  if (error) { console.warn('[tenants] add NK:', error.message); return; }
  if (!_tnNK[tid]) _tnNK[tid] = [];
  _tnNK[tid].push(data);
  if (_tnModalTid === tid) { _tnOpenModal(tid); } else { _tnRender(); }
}

function _tnNkCreate(nkId) {
  alert('NK calculator — coming soon.\n\nThis will open the NK calculator for this period.');
}

function _tnNkView(nkId) {
  const entry = Object.values(_tnNK).flat().find(e => e.id === nkId);
  if (!entry?.document_url) { alert('No document uploaded yet.'); return; }
  _tnViewDoc(entry.document_url);
}

async function _tnNkMarkSent(nkId) {
  if (!sbL) return;
  const entry = Object.values(_tnNK).flat().find(e => e.id === nkId);
  if (!entry) return;
  entry.sent = true;
  await sbL.from('nk_entries').update({ sent: true }).eq('id', nkId);
  const tid = entry.tenant_id;
  if (_tnModalTid === tid) { _tnOpenModal(tid); } else { _tnRender(); }
}

async function _tnNkMarkPaid(nkId) {
  if (!sbL) return;
  const entry = Object.values(_tnNK).flat().find(e => e.id === nkId);
  if (!entry) return;
  entry.paid = true;
  await sbL.from('nk_entries').update({ paid: true }).eq('id', nkId);
  _tnRefreshFormerBadges(entry.tenant_id);
  const tid = entry.tenant_id;
  if (_tnModalTid === tid) { _tnOpenModal(tid); } else { _tnRender(); }
}

function _tnDeleteNk(nkId, tid) {
  const row = document.getElementById('nkrow-' + nkId);
  if (!row) return;
  const entry = Object.values(_tnNK).flat().find(e => e.id === nkId);
  const period = entry?.period || 'this row';
  row.innerHTML = `
    <span style="font-size:12px;color:var(--cc-taupe);flex:1">Delete ${esc(period)}?</span>
    <div class="tn-nk-btns">
      <button class="tn-nk-btn tn-nk-btn-del" onclick="_tnConfirmDeleteNk('${nkId}','${tid}')">Confirm</button>
      <button class="tn-nk-btn" onclick="_tnRender()">Cancel</button>
    </div>`;
}

async function _tnConfirmDeleteNk(nkId, tid) {
  if (!sbL) return;
  const { error } = await sbL.from('nk_entries').delete().eq('id', nkId);
  if (error) { console.warn('[tenants] delete NK:', error.message); return; }
  if (_tnNK[tid]) _tnNK[tid] = _tnNK[tid].filter(e => e.id !== nkId);
  if (_tnModalTid === tid) { _tnOpenModal(tid); } else { _tnRender(); }
}


/* ══════════════════════════════════════════════════════════════
   16. DOCUMENTS
══════════════════════════════════════════════════════════════ */
function _tnTriggerUpload(tid, type) {
  _tnUploadTid  = tid;
  _tnUploadType = type;
  const inp = document.getElementById('tnFileInput');
  if (inp) { inp.value = ''; inp.click(); }
}

async function _tnViewDoc(fileUrl) {
  if (!fileUrl || !sbL) return;
  // Try signed URL first (works for private buckets — 60s expiry)
  const { data, error } = await sbL.storage
    .from('tenant-documents').createSignedUrl(fileUrl, 60);
  if (data?.signedUrl) { window.open(data.signedUrl, '_blank'); return; }
  // Fallback: try public URL (works if bucket is set to public)
  const { data: pub } = sbL.storage.from('tenant-documents').getPublicUrl(fileUrl);
  if (pub?.publicUrl) { window.open(pub.publicUrl, '_blank'); return; }
  console.warn('[tenants] view doc error:', error?.message);
  _tnToast('Could not open document', true);
}

async function _tnHandleUpload(file) {
  if (!file || !_tnUploadTid || !_tnUploadType || !sbL) return;
  const rec  = _tnRecords.find(r => r.id === _tnUploadTid);
  const room = rec?.room || 'unknown';
  const ext  = file.name.split('.').pop() || 'pdf';
  const path = `${room}/${_tnUploadTid}/${_tnUploadType}.${ext}`;

  const { error: upErr } = await sbL.storage
    .from('tenant-documents').upload(path, file, { upsert:true, contentType:file.type });
  if (upErr) { console.warn('[tenants] upload:', upErr.message); _tnToast('Upload failed', true); return; }

  const { data: docData, error: docErr } = await sbL.from('tenant_documents')
    .upsert({ tenant_id: _tnUploadTid, type: _tnUploadType, file_url: path,
              uploaded_at: new Date().toISOString() },
            { onConflict: 'tenant_id,type' }).select().single();
  if (docErr) { console.warn('[tenants] doc upsert:', docErr.message); return; }

  if (!_tnDocs[_tnUploadTid]) _tnDocs[_tnUploadTid] = [];
  const idx = _tnDocs[_tnUploadTid].findIndex(d => d.type === _tnUploadType);
  if (idx >= 0) _tnDocs[_tnUploadTid][idx] = docData;
  else          _tnDocs[_tnUploadTid].push(docData);

  // Bug 1 fix: targeted update — don't collapse cards
  const tid  = _tnUploadTid;
  if (_tnModalTid === tid) {
    _tnOpenModal(tid); // modal re-open is fine, no card collapse
  } else {
    _tnRefreshDocSection(tid); // swap only the doc section in-place
  }
  _tnToast('Document uploaded \u2713');
}

function _tnRefreshDocSection(tid) {
  const rec = _tnRecords.find(r => r.id === tid);
  if (!rec) return;
  const rid  = rec.room.replace(/\s+/g,'_').toLowerCase();
  const body = document.getElementById('tb-' + rid);
  if (!body) return;
  // Find the sec containing doc-rows and replace it
  const secs = body.querySelectorAll('.tn-sec');
  secs.forEach(sec => {
    if (sec.querySelector('.tn-doc-row')) {
      const tmp = document.createElement('div');
      tmp.innerHTML = _tnDocumentsSectionHTML(rid, { name: rec.room }, rec);
      const newSec = tmp.firstElementChild;
      if (newSec) sec.replaceWith(newSec);
    }
  });
}

function _tnToast(msg, isError) {
  const ex = document.getElementById('tn-toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.id = 'tn-toast';
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:max(28px,env(safe-area-inset-bottom,28px));
    left:50%;transform:translateX(-50%);
    background:${isError ? '#A32D2D' : 'var(--cc-ink)'};color:var(--cc-white);
    font-family:inherit;font-size:12px;font-weight:500;letter-spacing:.02em;
    padding:8px 18px;border-radius:var(--cc-r-pill);z-index:600;
    white-space:nowrap;pointer-events:none;transition:opacity .3s`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2200);
}

async function _tnDeleteDoc(tid, type, docId) {
  if (!sbL) return;
  if (!confirm('Delete this document? This cannot be undone.')) return;
  const doc = (_tnDocs[tid] || []).find(d => d.id === docId);
  if (doc?.file_url) {
    await sbL.storage.from('tenant-documents').remove([doc.file_url]);
  }
  const { error } = await sbL.from('tenant_documents').delete().eq('id', docId);
  if (error) { console.warn('[tenants] delete doc:', error.message); return; }
  if (_tnDocs[tid]) _tnDocs[tid] = _tnDocs[tid].filter(d => d.id !== docId);
  if (_tnModalTid === tid) { _tnOpenModal(tid); } else { _tnRender(); }
}


/* ══════════════════════════════════════════════════════════════
   17. FORMER TENANT MANAGEMENT
══════════════════════════════════════════════════════════════ */
async function _tnAddFormer(roomName) {
  if (!sbL) return;
  const { data, error } = await sbL.from('tenant_records')
    .insert({ room: roomName, status:'former',
              contract_type: _tnRoomContractType(roomName) })
    .select().single();
  if (error) { console.warn('[tenants] add former:', error.message); return; }
  await _tnEnsureKaution(data.id);
  _tnRecords.push(data);
  _tnNK[data.id]   = [];
  _tnDocs[data.id] = [];
  _tnOpenModal(data.id);
  _tnRender();
}

async function _tnMarkDone(tid) {
  if (!sbL) return;
  const rec = _tnRecords.find(r => r.id === tid);
  if (rec) { rec.done = true; rec.status = 'archived'; }
  _tnCloseModal();
  _tnRender();
  // Fire to Supabase in background
  sbL.from('tenant_records').update({ done:true, status:'archived' }).eq('id', tid)
    .then(({ error }) => { if (error) console.warn('[tenants] archive:', error.message); });
}

async function _tnReopen(tid) {
  if (!sbL) return;
  const rec = _tnRecords.find(r => r.id === tid);
  if (rec) { rec.done = false; rec.status = 'former'; }
  _tnRender();
  sbL.from('tenant_records').update({ done:false, status:'former' }).eq('id', tid)
    .then(({ error }) => { if (error) console.warn('[tenants] reopen:', error.message); });
}

async function _tnHideFormer(tid) {
  if (!sbL) return;
  const rec = _tnRecords.find(r => r.id === tid);
  if (rec) { rec.done = true; rec.status = 'archived'; }
  _tnRender();
  sbL.from('tenant_records').update({ done:true, status:'archived' }).eq('id', tid)
    .then(({ error }) => { if (error) console.warn('[tenants] hide:', error.message); });
}

function _tnDeleteFormer(tid) {
  if (!_tnIsAllDone(tid)) return;
  _tnDeleteId = tid;
  const rec  = _tnRecords.find(r => r.id === tid);
  const name = [rec?.first_name, rec?.last_name].filter(Boolean).join(' ') || 'this tenant';
  document.getElementById('tnConfirmBody').innerHTML =
    `This will permanently delete <strong>${esc(name)}</strong> and all related records. Cannot be undone.`;
  document.getElementById('tnConfirm').classList.add('open');
}

function _tnCancelDelete() {
  document.getElementById('tnConfirm').classList.remove('open');
  _tnDeleteId = null;
}

async function _tnConfirmDelete() {
  if (!_tnDeleteId || !sbL) return;
  const btn = document.getElementById('tnConfirmOk');
  if (btn) btn.disabled = true;
  const { error } = await sbL.from('tenant_records').delete().eq('id', _tnDeleteId);
  document.getElementById('tnConfirm').classList.remove('open');
  if (!error) {
    _tnRecords = _tnRecords.filter(r => r.id !== _tnDeleteId);
    delete _tnKaution[_tnDeleteId];
    delete _tnNK[_tnDeleteId];
    delete _tnDocs[_tnDeleteId];
  }
  _tnDeleteId = null;
  if (btn) btn.disabled = false;
  _tnCloseModal();
  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   18. BADGE REFRESH
══════════════════════════════════════════════════════════════ */
function _tnRefreshFormerBadges(tid) {
  document.querySelectorAll('.tn-former-row').forEach(row => {
    if (row.getAttribute('onclick')?.includes(tid)) {
      const pills = row.querySelector('.tn-former-pills');
      if (pills) {
        const nkDone = !_tnNkHasOpen(tid);
        const kDone  = !_tnKautionOpen(tid);
        pills.innerHTML =
          `<span class="tnp ${nkDone ? 'tnp-green' : 'tnp-amber'}">${nkDone ? 'NK done' : 'NK open'}</span>
           <span class="tnp ${kDone  ? 'tnp-green' : 'tnp-amber'}">${kDone  ? 'Settled' : 'Kaution open'}</span>`;
      }
    }
  });
}


/* ══════════════════════════════════════════════════════════════
   19. PASSWORD RESET
══════════════════════════════════════════════════════════════ */
async function _tnWriteDefaultPw(room) {
  if (!sbL) return;
  const defaultPw = room.toLowerCase().replace(/\s+/g,'') + '2026';
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(defaultPw));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  await sbL.from('lounge_data').delete().eq('type','password').eq('room', room);
  await sbL.from('lounge_data').insert({ type:'password', room, body:hash });
}

async function _tnResetPw(room) {
  if (!sbL) { alert('No database connection.'); return; }
  if (!confirm(`Reset password for ${room}?`)) return;
  await _tnWriteDefaultPw(room);
  const pw = room.toLowerCase().replace(/\s+/g,'') + '2026';
  alert(`Password reset for ${room}.\nDefault: ${pw}`);
}


/* ══════════════════════════════════════════════════════════════
   20. BIRTHDAYS
══════════════════════════════════════════════════════════════ */
async function checkBirthdays() {
  if (!sbL) return;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  const key  = `cc_bday_sent_${yyyy}_${mm}_${dd}`;
  const msgs = [];

  Object.entries(_tnProfileCache).forEach(([room, p]) => {
    if (!p.birthday) return;
    const b = p.birthday.trim();
    const dot = b.match(/^(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?$/);
    const iso = b.match(/^\d{4}-(\d{2})-(\d{2})$/);
    let bDay, bMon;
    if (dot)      { bDay = dot[1].padStart(2,'0'); bMon = dot[2].padStart(2,'0'); }
    else if (iso) { bMon = iso[1]; bDay = iso[2]; }
    else return;
    if (bDay === dd && bMon === mm)
      msgs.push('Happy Birthday' + (p.firstName ? ', ' + p.firstName : '') + ' \uD83C\uDF89');
  });

  if (!msgs.length) { localStorage.removeItem(key); return; }
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');
  await sbL.from('lounge_data').delete().eq('type','notice');
  await sbL.from('lounge_data').insert({ type:'notice', body:msgs.join(' \u00b7 '), color:'green' });
  loadNotice?.();
}


/* ══════════════════════════════════════════════════════════════
   21. EVENT BINDS
══════════════════════════════════════════════════════════════ */
function _tnBindCards() {
  const inp = document.getElementById('tnFileInput');
  if (inp && !inp._tnBound) {
    inp._tnBound = true;
    inp.addEventListener('change', () => { if (inp.files?.[0]) _tnHandleUpload(inp.files[0]); });
  }
}


/* ══════════════════════════════════════════════════════════════
   22. REALTIME
══════════════════════════════════════════════════════════════ */
function _tnWireRealtime() {
  if (_tnRoomsWired) return;
  _tnRoomsWired = true;
  if (typeof onRoomsChange === 'function') {
    onRoomsChange(() => { _tnRender(); });
  }
}


/* ══════════════════════════════════════════════════════════════
   23. ENTRY POINT
══════════════════════════════════════════════════════════════ */
async function loadTenants() {
  if (typeof appRooms !== 'undefined' && !appRooms.length && typeof loadRoomsData === 'function') {
    await loadRoomsData();
  }
  _tnWireRealtime();
  await _tnLoad();
  checkBirthdays();
}
