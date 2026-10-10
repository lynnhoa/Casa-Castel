/* ─────────────────────────────────────────────────────────────
   RENTALS — TENANTS TAB
   rentals-tab-tenants.js

   Tenant lifecycle management for apartments and parking spots.
   One scrolling list: Wohnungen group + Stellplätze group.
   Exposes: loadRntTenants(), _rntGetProfile(aptId), _rntGetParkingProfile(pkId)
   Depends on: constants.js, supabase-client.js,
               rentals-tab-apartments.js (appApartments),
               rentals-tab-parking.js   (appParking)
   ───────────────────────────────────────────────────────────── */


/* ══════════════════════════════════════════════════════════════
   1. HTML INJECT
══════════════════════════════════════════════════════════════ */
document.getElementById('tab-tenants').innerHTML = `
  <div class="tn-hdr">
    <h1 class="cc-h1">Tenants</h1>
  </div>
  <!-- Summary line (small): IST — rent of everyone living there today + Kaution held -->
  <div class="cc-sum2" id="rnt-kaution-summary" style="display:none"></div>
  <div class="tn-list" id="rntTenantsList"></div>


  <div class="tn-overlay" id="rntModal" onclick="_rntModalOutside(event)">
    <div class="tn-sheet" id="rntSheet">
      <div class="tn-sheet-hdr">
        <div style="flex:1;min-width:0">
          <div class="tn-sheet-name" id="rntModalName"></div>
          <div class="tn-sheet-sub"  id="rntModalSub"></div>
        </div>
        <button class="tn-icon-btn" onclick="_rntCloseModal()" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="tn-sheet-body"   id="rntModalBody"></div>
      <div class="tn-sheet-footer" id="rntModalFooter"></div>
    </div>
  </div>

  <div class="tn-overlay" id="rntNKVorausModal" onclick="_rntNKVorausModalOutside(event)">
    <div class="tn-sheet" id="rntNKVorausSheet" style="max-height:70vh">
      <div class="tn-sheet-hdr">
        <div style="flex:1;min-width:0">
          <div class="tn-sheet-name" id="rntNKVorausModalTitle">Nebenkostenerhöhungen</div>
          <div class="tn-sheet-sub"  id="rntNKVorausModalSub"></div>
        </div>
        <button class="tn-icon-btn" onclick="_rntNKVorausModalClose()" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="tn-sheet-body" id="rntNKVorausModalBody"></div>
    </div>
  </div>

  <div class="tn-overlay" id="rntStaffelModal" onclick="_rntStaffelModalOutside(event)">
    <div class="tn-sheet" id="rntStaffelSheet" style="max-height:70vh">
      <div class="tn-sheet-hdr">
        <div style="flex:1;min-width:0">
          <div class="tn-sheet-name" id="rntStaffelModalTitle">New Mieterhöhung</div>
          <div class="tn-sheet-sub" id="rntStaffelModalSub"></div>
        </div>
        <button class="tn-icon-btn" onclick="_rntStaffelModalClose()" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="tn-sheet-body" id="rntStaffelModalBody"></div>
    </div>
  </div>

  <div class="tn-confirm-overlay" id="rntConfirm">
    <div class="tn-confirm-box">
      <div class="tn-confirm-icon"><i class="ti ti-alert-triangle"></i></div>
      <div class="tn-confirm-title">Delete tenant record</div>
      <div class="tn-confirm-body" id="rntConfirmBody"></div>
      <div class="tn-confirm-btns">
        <button class="tn-btn tn-btn-ghost"  onclick="_rntCancelDelete()">Cancel</button>
        <button class="tn-btn tn-btn-danger" id="rntConfirmOk" onclick="_rntConfirmDelete()">
          <i class="ti ti-trash"></i> Delete
        </button>
      </div>
    </div>
  </div>
`;


/* ══════════════════════════════════════════════════════════════
   2. STYLES  (reuse tn- CSS from CC; add rnt-specific overrides)
══════════════════════════════════════════════════════════════ */
(function () {
  const existing = document.getElementById('rnt-tenant-styles');
  if (existing) existing.remove();
  const s = document.createElement('style');
  s.id = 'rnt-tenant-styles';
  s.textContent = `
/* ── PAGE ── */
.tn-hdr { margin-bottom: 20px; }
/* ── Casa Castel layout (Oct 2026): Kaution line · slim card · rent title · Übergabe · Former row ── */
html .rnt-ist .cc-sumline__vals { grid-template-columns:minmax(0, 1fr); }
.tn-ctp { display:inline-flex; align-items:center; height:20px; padding:0 8px; border-radius:10px; font-size:11px; font-weight:500; letter-spacing:.02em; white-space:nowrap; margin-left:6px; }
.tn-ctp--kurzzeit    { background:#F1EEF6; color:#5B4A7A; border:.5px solid #CFC4E0; }
.tn-ctp--mietvertrag { background:#EEF2EC; color:#46604A; border:.5px solid #C3D1C0; }
.tn-ctp--gewerbe     { background:#E6F1FB; color:#0C447C; border:.5px solid #85B7EB; }
#tab-tenants .tn-slim .tn-slim-top { align-items:center; gap:8px; }
#tab-tenants .tn-slim .tn-slim-top .tn-room-lbl { margin:0; }
#tab-tenants .tn-slim .tn-hdr-mid { margin-top:2px; }
#tab-tenants .tn-slim-info { display:flex; align-items:center; gap:4px 10px; flex-wrap:wrap; margin-top:4px; font-size:13px; color:#9A8E7E; }
#tab-tenants .tn-slim-info .tn-ctp { margin-left:0; }
#tab-tenants .tn-slim-txt { white-space:nowrap; }
#tab-tenants .tn-slim-txt b { font-weight:500; color:var(--cc-charcoal); }
#tab-tenants .tn-slim-next { white-space:nowrap; color:#8C5A30; font-size:12.5px; }
.tn-rent-wrap { background:var(--cc-surface); border-bottom:var(--cc-border); flex-direction:column; }
.tn-rent-wrap .tn-rent-bar { border-bottom:none; background:transparent; }
.tn-rtitle { display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; padding:10px 14px 0; }
.tn-rent-wrap .tn-rc:first-child { padding-left:14px; }
.tn-rt-name { font-size:13px; font-weight:500; color:var(--cc-charcoal); }
.tn-rt-dates { font-size:11px; color:var(--cc-taupe); }
#tab-tenants .rnt-ub { padding:11px 14px; }
#tab-tenants .tn-more-in { margin:0 -14px; border-top:var(--cc-border); background:var(--cc-bg); }
#tab-tenants .tn-more-in > .tn-sec { border-bottom:none; background:transparent; }
.tn-list { display:flex; flex-direction:column; gap:8px;
  padding-bottom: max(40px, env(safe-area-inset-bottom, 40px)); }

/* ── GROUP HEADER ── */
.rnt-group-hdr { font-size:9px; font-weight:600; letter-spacing:.14em;
  text-transform:uppercase; color:var(--cc-stone);
  padding:4px 2px 6px; margin-top:8px; }
.rnt-group-hdr:first-child { margin-top:0; }
.tn-ct-next { font-size:11px; color:#8C5A30; }
.tn-ve-missing { color:#854F0B; font-weight:500; }

/* ── CARD ── */
.tn-card { background:var(--cc-white); border:var(--cc-border);
  border-radius:var(--cc-r-lg); overflow:hidden; transition:border-color .15s; }
.tn-card.open { border-color:var(--cc-stone); }

/* ── HEADER ── */
.tn-hdr-wrap { padding:11px 14px; cursor:pointer; user-select:none;
  border-radius:var(--cc-r-lg) var(--cc-r-lg) 0 0; overflow:hidden;
  -webkit-tap-highlight-color:transparent; }
.tn-hdr-top { display:flex; align-items:center; gap:8px; }
.tn-room-lbl { font-size:10px; font-weight:500; letter-spacing:.09em;
  text-transform:uppercase; color:var(--cc-taupe); }
.tn-chev { font-size:18px; color:var(--cc-stone); flex-shrink:0; margin-left:0;
  transition:transform .2s cubic-bezier(.32,.72,0,1); }
.tn-card.open .tn-chev { transform:rotate(90deg); }
.tn-hdr-mid { display:flex; align-items:baseline; gap:8px; margin-top:4px; flex-wrap:wrap; }
.tn-tenant-name { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px;
  font-weight:400; color:var(--cc-ink); line-height:1.1; }
.tn-tenant-dates { font-size:11px; color:var(--cc-taupe); }
.tn-hdr-bot { display:flex; align-items:center; gap:5px; margin-top:5px; flex-wrap:wrap; }
.tn-warm { font-size:11px; font-weight:500; color:var(--cc-charcoal); }
.tn-dim  { font-size:10px; font-weight:300; color:var(--cc-stone); }
.tn-dot-sep { width:3px; height:3px; border-radius:50%;
  background:var(--cc-rule); flex-shrink:0; }
.tn-hdr-addr { font-size:10px; color:var(--cc-stone); margin-top:2px; }

/* ── PILLS ── */
.tnp { display:inline-flex; align-items:center; font-size:9px; font-weight:600;
  letter-spacing:.07em; text-transform:uppercase;
  padding:2px 7px; border-radius:var(--cc-r-pill); white-space:nowrap; }
.tnp-green { background:#EAF3DE; color:#27500A; border:.5px solid #97C459; }
.tnp-blue  { background:#E6F1FB; color:#0C447C; border:.5px solid #85B7EB; }
.tnp-amber { background:#FAEEDA; color:#633806; border:.5px solid #EF9F27; }
.tnp-red   { background:#FCEBEB; color:#791F1F; border:.5px solid #F09595; }
.tnp-gray  { background:var(--cc-surface); color:var(--cc-taupe);
  border:.5px solid var(--cc-rule); }

/* ── CARD BODY ── */
.tn-body { border-top:var(--cc-border); display:none;
  border-radius:0 0 var(--cc-r-lg) var(--cc-r-lg); overflow:hidden; }
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
.tn-rent-form { display:grid; grid-template-columns:1fr 1fr 1fr;
  gap:6px; padding:10px 14px 12px; border-bottom:var(--cc-border); align-items:end; }
.tn-rf { display:flex; flex-direction:column; gap:3px; }
.tn-rf input { width:100%; font-size:12px; padding:3px 8px;
  border-radius:var(--cc-r-sm); border:var(--cc-border);
  background:var(--cc-surface); color:var(--cc-charcoal);
  font-family:inherit; outline:none; -webkit-appearance:none; }
.tn-rf input:focus { border-color:var(--cc-gold); background:var(--cc-white); }
.tn-rf input[data-mh-lock][readonly] { background:var(--cc-surface); color:var(--cc-taupe); }
.tn-rf-hint a { color:#8A6535; }
.tn-rf-derived { font-size:11px; font-weight:400; color:var(--cc-charcoal);
  padding:5px 8px; background:var(--cc-surface); border-radius:var(--cc-r-sm);
  border:var(--cc-border); }
.tn-rf-hint { font-size:10px; color:var(--cc-stone); grid-column:1/-1; }
.tn-rf-save-row { display:flex; gap:6px; justify-content:flex-end; grid-column:1/-1; }

/* ── H-fixes (layout): one straight rent row + no iPhone zoom ─────────────
   Rent row: three equal columns; fields and the Warmmiete box share one
   height and line up at the bottom, even when a label wraps.            */
.tn-rent-form { grid-template-columns:1fr 1fr 1fr; align-items:end; }
.tn-rf > input, .tn-rf-derived { box-sizing:border-box; height:38px; }
.tn-rf > input { padding:0 10px; }
.tn-rf-derived { display:flex; align-items:center; padding:0 10px; font-size:12px; }
.tn-fg { align-items:end; }
/* iPhone/iPad: a field with text under 16 px makes iOS zoom into the page
   on every tap. On touch devices all fields in this tab use 16 px.       */
@media (hover:none) and (pointer:coarse) {
  #tab-tenants input:not([type=checkbox]):not([type=radio]):not([type=file]),
  #tab-tenants select,
  #tab-tenants textarea { font-size:16px !important; }
  #tab-tenants .tn-kc-input { min-height:34px; }
  .tn-rf-derived { font-size:16px; }
}

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
#tab-tenants .tn-field input   { font-size:12px !important; }
#tab-tenants .tn-rf input      { font-size:12px !important; }
#tab-tenants .tn-kc-input      { font-size:11px !important; }
#tab-tenants .tn-nk-add-form input { font-size:12px !important; }

/* ── BUTTONS ── */
.tn-btn { display:inline-flex; align-items:center; gap:4px;
  border-radius:var(--cc-r-pill); font-weight:500; font-family:inherit;
  cursor:pointer; transition:opacity .15s; -webkit-tap-highlight-color:transparent; }
.tn-btn:active { opacity:.75; }
.tn-btn-sm { height:36px; padding:0 12px; font-size:11px;
  border:.5px solid var(--cc-rule); background:none; color:var(--cc-taupe); }
.tn-btn-sm i { font-size:12px; }
.tn-btn-former { color:var(--cc-stone); }
.tn-btn-armed { background:#FBEFD6 !important; border-color:var(--cc-gold) !important; color:#8a6535 !important; }
.tn-btn-primary { height:36px; padding:0 12px; font-size:11px;
  background:var(--cc-ink); color:var(--cc-white); border:none; }
.tn-btn-primary i { font-size:12px; }
.tn-btn-done { height:36px; padding:0 12px; font-size:11px;
  border:.5px solid #97C459; background:#EAF3DE; color:#27500A; }
.tn-btn-done i { font-size:12px; }
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
.tn-doc-row  { display:flex; align-items:center; gap:8px; padding:6px 0; }
.tn-doc-name { flex:1; font-size:11px; color:var(--cc-charcoal); }
.tn-doc-btns { display:flex; gap:4px; margin-left:4px; }
.tn-doc-btn  { display:inline-flex; align-items:center; gap:3px; height:24px;
  padding:0 8px; border-radius:var(--cc-r-sm); font-size:10px; font-weight:500;
  border:.5px solid var(--cc-rule); background:none; color:var(--cc-taupe);
  cursor:pointer; font-family:inherit; }
.tn-doc-btn i { font-size:10px; }
.tn-doc-btn.off { opacity:.35; pointer-events:none; }

/* ── KAUTION ── */
.tn-kaut-hint { font-size:10px; color:var(--cc-stone); margin-bottom:6px; }
.tn-kaut-override-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.tn-kaut-override-lbl { font-size:10px; color:var(--cc-stone); flex:1; }
.tn-kaut-ovr-sw { position:relative; width:32px; height:18px; flex-shrink:0; }
.tn-kaut-ovr-sw input { opacity:0; width:0; height:0; position:absolute; }
.tn-kaut-ovr-sw__t { position:absolute; inset:0; background:var(--cc-rule);
  border-radius:9px; transition:background .2s; cursor:pointer; }
.tn-kaut-ovr-sw__t::after { content:''; position:absolute; top:2px; left:2px;
  width:14px; height:14px; border-radius:50%; background:white;
  transition:transform .2s; box-shadow:0 1px 2px rgba(0,0,0,.15); }
.tn-kaut-ovr-sw input:checked+.tn-kaut-ovr-sw__t { background:var(--cc-ink); }
.tn-kaut-ovr-sw input:checked+.tn-kaut-ovr-sw__t::after { transform:translateX(14px); }
.tn-kaut-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
.tn-kc { background:var(--cc-surface); border-radius:var(--cc-r-sm); padding:7px 9px; }
.tn-kc-lbl { font-size:10px; font-weight:500; letter-spacing:.09em;
  text-transform:uppercase; color:var(--cc-taupe); margin-bottom:3px; }
.tn-kc-val { font-size:11px; font-weight:400; color:var(--cc-charcoal); }
.tn-kc-val.gold { color:var(--cc-gold); }
.tn-kc-input { width:100%; font-size:11px; font-weight:400; padding:3px 5px;
  border-radius:4px; border:.5px solid var(--cc-rule);
  background:var(--cc-white); color:var(--cc-charcoal);
  font-family:inherit; outline:none; margin-top:1px; -webkit-appearance:none; }
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
  align-items:center; justify-content:center; font-size:9px; flex-shrink:0; cursor:default; }
.tn-nd.tap { cursor:pointer; -webkit-tap-highlight-color:transparent; }
.tn-nd.tap:active { transform:scale(.88); }
.tn-nd-off  { background:var(--cc-surface); color:var(--cc-stone); border:.5px solid var(--cc-rule); }
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

/* ── NK VORAUSZAHLUNG ── */
.tn-nkv-current { display:flex; align-items:center; gap:8px;
  padding:7px 10px; background:var(--cc-surface);
  border-radius:var(--cc-r-sm); margin-bottom:10px; }
.tn-nkv-cur-amount { font-size:13px; font-weight:500; color:var(--cc-charcoal); flex:1; }
.tn-nkv-cur-since  { font-size:10px; color:var(--cc-stone); white-space:nowrap; }
.tn-nkv-row { display:flex; flex-direction:column; gap:6px;
  padding:8px 0; border-bottom:var(--cc-border); }
.tn-nkv-row:last-of-type { border-bottom:none; }
.tn-nkv-top  { display:flex; align-items:center; gap:8px; }
.tn-nkv-date { font-size:11px; color:var(--cc-taupe); flex:1; }
.tn-nkv-amount { font-size:13px; font-weight:500; color:var(--cc-charcoal); }
.tn-nkv-amount.past { font-weight:400; color:var(--cc-stone); }
.tn-nkv-pills { display:flex; gap:5px; flex-wrap:wrap; padding-left:20px; }
.tn-nkv-pill { display:inline-flex; align-items:center; gap:3px;
  font-size:10px; font-weight:500; padding:2px 8px;
  border-radius:var(--cc-r-pill); white-space:nowrap;
  cursor:default; font-family:inherit; border:none; }
.tn-nkv-pill.done    { background:#EAF3DE; color:#27500A; }
button.tn-nkv-pill.done { cursor:pointer; -webkit-tap-highlight-color:transparent; }
button.tn-nkv-pill.done:active { opacity:.7; }
.tn-nkv-pill.pending { background:var(--cc-surface); color:var(--cc-stone);
  border:.5px solid var(--cc-rule); cursor:pointer;
  -webkit-tap-highlight-color:transparent; }
.tn-nkv-pill.pending:active { opacity:.7; }
.tn-nkv-pill i { font-size:10px; }
.tn-nkv-add-form { display:flex; align-items:center; gap:6px;
  padding-top:8px; border-top:var(--cc-border); margin-top:4px; flex-wrap:wrap; }
.tn-nkv-add-form input { font-size:12px; padding:5px 8px;
  border-radius:var(--cc-r-sm); border:.5px solid var(--cc-gold);
  background:var(--cc-white); color:var(--cc-charcoal);
  font-family:inherit; outline:none; width:120px; }
.tn-nkv-add-form input[type=number], .tn-nkv-add-form input[data-cc-num] { width:90px; }
.tn-nkv-verlauf-btn { font-size:10px; color:var(--cc-stone);
  text-decoration:underline; text-underline-offset:2px;
  background:none; border:none; cursor:pointer; font-family:inherit;
  padding:0; -webkit-tap-highlight-color:transparent; }

/* ── FORMER ── */
.tn-former-row { display:flex; align-items:center; gap:10px;
  padding:7px 14px; border-bottom:var(--cc-border); cursor:pointer;
  -webkit-tap-highlight-color:transparent; }
.tn-former-row:last-of-type { border-bottom:none; }
.tn-former-row:active { background:var(--cc-surface); }
.tn-former-info   { flex:1; min-width:0; }
.tn-former-name   { font-size:11px; font-weight:400; color:var(--cc-taupe); }
.tn-former-period { font-size:11px; color:var(--cc-stone); }
.tn-former-pills  { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
/* Former row: pills on their own line — never over name or dates */
.tn-former-row { flex-wrap:wrap; row-gap:6px; padding:10px 14px; }
.tn-former-row .tn-former-info { flex:1 1 0; min-width:0; }
.tn-former-row .tn-former-name, .tn-former-row .tn-former-period { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tn-former-row .tn-former-name { font-size:13px; color:var(--cc-charcoal); }
.tn-former-row .tn-former-period { font-size:11px; color:var(--cc-taupe); margin-top:2px; }
.tn-former-row .tn-former-pills { order:3; flex:1 0 100%; justify-content:flex-start; }
.tn-former-row .tn-former-pills:empty { display:none; }
.tn-former-row > .tn-btn, .tn-former-row > .ti { order:2; flex-shrink:0; }
.tn-show-older { display:flex; align-items:center; gap:5px; padding:7px 14px;
  font-size:11px; color:var(--cc-stone); cursor:pointer; background:none;
  border:none; font-family:inherit; width:100%;
  border-top:var(--cc-border); -webkit-tap-highlight-color:transparent; }
.tn-show-older i { font-size:12px; }
.tn-kaution-nudge { display:flex; align-items:center; gap:8px; padding:6px 14px;
  background:#FAEEDA55; border-top:0.5px solid #EF9F2760; cursor:pointer; }
.tn-kaution-nudge i { color:#BA7517; }
.tn-nudge-name   { font-size:10px; color:#854F0B; flex:1; }
.tn-nudge-kept   { font-size:10px; font-weight:600; color:#633806; }
.tn-nudge-status { font-size:9px; font-weight:600; letter-spacing:.05em;
  text-transform:uppercase; color:#BA7517; }
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
.tn-arc-info   { flex:1; }
.tn-arc-name   { font-size:11px; color:var(--cc-taupe); }
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
.tn-sheet-sub  { font-size:11px; color:var(--cc-taupe); margin-top:2px;
  display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.tn-sheet-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.tn-sheet-footer { display:flex; align-items:center; gap:8px;
  padding:10px 16px; padding-bottom:max(10px,env(safe-area-inset-bottom,10px));
  border-top:var(--cc-border); background:var(--cc-surface); flex-shrink:0; }
.tn-sheet-spacer { flex:1; }
.tn-msec { border-bottom:var(--cc-border); }
.tn-msec:last-child { border-bottom:none; }
.tn-msec-body   { padding:8px 16px 0; }
.tn-msec-footer { display:flex; align-items:center; justify-content:flex-end;
  gap:6px; padding:8px 16px; }
.tn-msec-hdr { display:flex; align-items:center; gap:8px; padding:10px 16px 0; }
.tn-msec-lbl { font-size:9px; font-weight:500; letter-spacing:.11em;
  text-transform:uppercase; color:var(--cc-taupe); flex:1; }

/* ── CONFIRM OVERLAY ── */
.tn-confirm-overlay { display:none; position:fixed; inset:0; z-index:500;
  background:rgba(30,27,24,.35); align-items:center; justify-content:center; padding:24px; }
.tn-confirm-overlay.open { display:flex; }
.tn-confirm-box { background:var(--cc-white); border-radius:var(--cc-r-lg);
  padding:24px 20px 20px; max-width:300px; width:100%;
  animation:tnConfirmPop .2s cubic-bezier(.32,.72,0,1); }
@keyframes tnConfirmPop { from{transform:scale(.94);opacity:0} to{transform:scale(1);opacity:1} }
.tn-confirm-icon  { font-size:26px; color:#C4705A; margin-bottom:10px; }
.tn-confirm-title { font-family:'Cormorant Garamond',Georgia,serif;
  font-size:18px; font-weight:400; color:var(--cc-ink); margin-bottom:6px; }
.tn-confirm-body  { font-size:13px; color:var(--cc-taupe); line-height:1.55; margin-bottom:18px; }
.tn-confirm-btns  { display:flex; align-items:center; gap:10px; }

/* ── EMPTY / MISC ── */
.tn-empty { font-size:12px; color:var(--cc-stone); font-style:italic; padding:3px 0; }

/* ── DESKTOP ── */
@media (min-width:701px) {
  .tn-overlay { align-items:center; }
  .tn-sheet { border-radius:var(--cc-r-lg); max-height:82vh; }
  .tn-sheet-footer { padding-bottom:12px; }
  .tn-former-row:hover { background:var(--cc-surface); }
}

/* ── 3.5 FIELD ALIGNMENT — same standard as Rooms / Apartments / Parking ──
   Edit fields: 8 px corners, same background + weight everywhere, 10 px rows,
   small uppercase labels. Saved profile labels stay as they are. */
.tn-fg, .tn-rent-form { gap:10px 8px; }
.tn-field, .tn-rf { gap:4px; }
.tn-field input, .tn-rf input { border-radius:var(--cc-r-md); background:var(--cc-bg); font-weight:300; }
.tn-rf-derived { border-radius:var(--cc-r-md); font-weight:300; }
.tn-rf .tn-flbl, .tn-field:has(input) .tn-flbl {
  font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; }
.tn-rf-save-row .tn-btn { white-space:nowrap; }
.tn-rf-save-row .tn-rf-hint { flex:1; min-width:0; }
.tn-edit-rent-btn { border-radius:6px; letter-spacing:.06em; text-transform:uppercase; }

/* ── CHOPPED-OFF FIXES ──
   Rent bar (Kaltmiete · NK · Warmmiete · Edit): cells may shrink, so Edit stays inside the card. */
.tn-rent-bar { min-width:0; }
.tn-rc { min-width:0; padding:7px 7px; }
.tn-rc:last-child { padding:6px 8px; }
.tn-rlbl { letter-spacing:.02em; white-space:nowrap; }
.tn-rval, .tn-rsub { white-space:nowrap; }
.tn-edit-rent-btn { padding:0 8px; }
/* The contract-type pill is already in the card header — not repeated in the rent bar (it squeezed the columns) */
.tn-rent-bar .tn-rc:last-child .tnp { display:none; }
.tn-rc .tn-rlbl, .tn-rc .tn-rval, .tn-rc .tn-rsub { overflow:hidden; text-overflow:clip; }
/* Header: status pills wrap under each other instead of running out of the card */
.tn-hdr-top { min-width:0; }
.tn-room-lbl { flex-shrink:0; }
.tn-hdr-top > [id^="hdr-kpill-"] { flex-shrink:1 !important; min-width:0; flex-wrap:wrap; justify-content:flex-end; row-gap:4px; }
.tn-hdr-mid, .tn-hdr-bot { min-width:0; max-width:100%; }
.tn-hdr-bot > * { min-width:0; max-width:100%; }
.tn-tenant-name { overflow-wrap:anywhere; }
/* Profile edit: Name, Email, Phone, Birthday and Address one per row (long values were cut);
   Move in / Move out stay side by side */
.tn-fg { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
.tn-fg > .tn-field { min-width:0; }
.tn-fg > .tn-field:has(> input):not(:has(> input[data-f="mietbeginn"])):not(:has(> input[data-f="mietende"])) { grid-column:1/-1; }
  `;
  document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════
   3. STATE
══════════════════════════════════════════════════════════════ */
let _rntRecords      = [];
let _rntKaution      = {};
let _rntNK           = {};
let _rntDocs         = {};
let _rntProfileCache = {};   // keyed 'apt_<uuid>' or 'pk_<uuid>'
let _rntShowOlder    = {};
let _rntOpenCards    = new Set();
let _rntModalTid     = null;
let _rntUploadTid    = null;
let _rntUploadType   = null;
let _rntDeleteId     = null;
let _rntNKVoraus     = {};   // apartment_id → [{...}]
let _rntStaffel      = {};   // apartment_id OR parking_id → [{...}] sorted effective_date desc


/* ══════════════════════════════════════════════════════════════
   4. PRICING HELPERS
══════════════════════════════════════════════════════════════ */
function _rntAptPricing(aptId) {
  const a = appApartments?.find(a => a.id === aptId);
  if (!a) return { kaltmiete: null, nebenkosten: null };
  return {
    kaltmiete:   Number(a.pricing?.kaltmiete)    || null,
    nebenkosten: Number(a.pricing?.nk_pauschale) || null,
  };
}

function _rntPkPricing(pkId) {
  const p = appParking?.find(p => p.id === pkId);
  if (!p) return { miete: null };
  return { miete: Number(p.pricing?.miete) || null };
}

// Kaution soll: the tenant's own agreed amount if saved, otherwise the card
// rule (override while its toggle is ON, else 3× Kaltmiete / 3× Parkmiete)
/* Soll + where it comes from — ONE source for Kaution section, rent form and pop-up.
   Individuell · Mieter → Individuell · Karte → Standard (rule).
   Rentals has no "Kurzzeit" tenant type: a fixed stay of ≤ 3 months uses the Kurzzeit rule (1×). */
function _rntKautionSollInfo(rec) {
  if (!rec) return null;
  if (rec.kaution_soll != null && rec.kaution_soll !== '') return { amount: Number(rec.kaution_soll), text: 'Fest seit Einzug' };
  if (rec.apartment_id) {
    const a  = appApartments?.find(x => x.id === rec.apartment_id);
    const pr = a?.pricing || {};
    const ovr = ccKautionOverride(pr);
    if (ovr !== null) return { amount: ovr, text: 'Individuell \u00b7 Karte' };
    const gewerbe = a?.zimmer_type === 'Gewerbefläche';
    const shortStay = !gewerbe && rec.mietbeginn && rec.mietende && ccKzIsLong(rec.mietbeginn, rec.mietende) === false;
    if (shortStay) {
      const hasKz = pr.kurzzeit_kaltmiete != null && pr.kurzzeit_kaltmiete !== '';
      const kalt  = hasKz ? Number(pr.kurzzeit_kaltmiete) : (Number(pr.kaltmiete) || 0);
      const nk    = hasKz ? (Number(pr.kurzzeit_nk) || 0) : (Number(pr.nk_pauschale) || 0);
      if (!kalt) return null;
      const k = ccKaution({ contract: 'kurzzeit', mode: nk > 0 ? 'kalt_nk' : 'pauschal', kalt, nk, start: rec.mietbeginn, end: rec.mietende });
      return { amount: k.amount, text: 'Standard \u00b7 ' + k.rule };
    }
    if (!Number(pr.kaltmiete)) return null;
    const k = ccKaution({ contract: gewerbe ? 'gewerbe' : 'mietvertrag', kalt: pr.kaltmiete });
    return { amount: k.amount, text: 'Standard \u00b7 ' + k.rule };
  }
  if (rec.parking_id) {
    const s  = appParking?.find(x => x.id === rec.parking_id);
    const pr = s?.pricing || {};
    const ovr = ccKautionOverride(pr);
    if (ovr !== null) return { amount: ovr, text: 'Individuell \u00b7 Karte' };
    if (!Number(pr.miete)) return null;
    const k = ccKaution({ contract: 'parking', kalt: pr.miete });
    return { amount: k.amount, text: 'Standard \u00b7 ' + k.rule };
  }
  return null;
}
function _rntRefreshKautionSoll(tid) {
  const info = _rntKautionSollInfo(_rntRecords.find(r => r.id === tid));
  document.querySelectorAll(`[data-ksoll-for="${tid}"]`).forEach(el => {
    if (el.dataset.ksollKind === 'hint') { el.textContent = info ? `Soll: ${_rntFmtEUR(info.amount)} \u00b7 ${info.text}` : ''; el.style.display = info ? '' : 'none'; }
    else el.textContent = info ? `Soll \u00b7 ${_rntFmtEUR(info.amount)} \u00b7 ${info.text}` : 'Soll \u00b7 \u2014';
  });
}
function _rntKautionSoll(rec) { const i = _rntKautionSollInfo(rec); return i ? i.amount : null; }

/* Mieterhöhung steps (Staffel + typed) that belong to ONE tenancy — the previous tenant's stay with them.
   tid omitted → the unit's current tenant. Rule shared with Casa Castel + Controlling (ccTnStepOwned). */
function _rntOwnSteps(unitId, tid) {
  const all = _rntStaffel[unitId] || [];
  const recs = (_rntRecords || []).filter(r => String(r.apartment_id) === String(unitId) || String(r.parking_id) === String(unitId));
  if (tid === undefined) {
    const a = recs.filter(r => r.status === 'active').sort((x, y) => String(ccRpIso(y.mietbeginn)).localeCompare(String(ccRpIso(x.mietbeginn))))[0];
    tid = a ? a.id : null;
  }
  if (!tid) return [];
  const rec = recs.find(r => String(r.id) === String(tid));
  return all.filter(e => typeof ccTnStepOwned === 'function' ? ccTnStepOwned(e, rec, recs) : true);
}
const _rntMhKind = e => (typeof CC_MH_KINDS !== 'undefined' && CC_MH_KINDS[e.kind || 'staffel']) || 'Staffel';

/* Kaution from the rent that applied at move-in (Staffel history), or null */
function _rntStaffelStartSoll(rec) {
  const unitId = rec.apartment_id || rec.parking_id;
  if (!unitId || !rec.mietbeginn) return null;
  const e = _rntOwnSteps(unitId, rec.id)
    .filter(x => x.effective_date && x.effective_date <= rec.mietbeginn)
    .sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)))[0];
  if (!e || !(Number(e.amount) > 0)) return null;
  if (rec.parking_id) return ccKaution({ contract: 'parking', kalt: Number(e.amount) }).amount;
  const a = appApartments?.find(x => x.id === rec.apartment_id);
  const gewerbe = a?.zimmer_type === 'Gewerbefläche';
  if (!gewerbe && rec.mietende && ccKzIsLong(rec.mietbeginn, rec.mietende) === false) return null;   // short stay: no Staffel
  return ccKaution({ contract: gewerbe ? 'gewerbe' : 'mietvertrag', kalt: Number(e.amount) }).amount;
}

/* Kaution Soll is fixed per tenancy (cc-kaution-card.js). Active tenants that
   have none yet get it filled ONCE; afterwards it only changes by hand. */
const _rntSollFilling = new Set();
function _rntFreezeKautionSoll() {
  if (!sbL || typeof ccKautionStartSoll !== 'function') return;
  _rntRecords.forEach(rec => {
    if (rec.status !== 'active' || (rec.kaution_soll != null && rec.kaution_soll !== '') || _rntSollFilling.has(rec.id)) return;
    const amount = ccKautionStartSoll({ current: _rntKautionSollInfo(rec), staffelSoll: _rntStaffelStartSoll(rec),
      mietbeginn: rec.mietbeginn, received: _rntKaution[rec.id]?.received });
    if (!(amount > 0)) return;
    _rntSollFilling.add(rec.id);
    rec.kaution_soll = amount;
    ccQueueWrite('rnt-' + rec.id, () => sbL.from('rnt_tenant_records').update({ kaution_soll: amount }).eq('id', rec.id).is('kaution_soll', null))
      .then(({ error }) => { if (error) { rec.kaution_soll = null; _rntSollFilling.delete(rec.id); console.warn('[rnt-tenants] kaution soll:', error.message); } });
  });
}

/* B3: a rent is only stored when you type it or a contract is generated.
   Today's price is never copied onto a tenant (it used to be, once, here). */
const _rntRentFilling = new Set();
function _rntFreezeRent() { /* intentionally no longer writes */ }

/* The tenant's rent today: rent history first, else the rent stored on the tenant.
   → { mode, kalt, nk, total, src, period? } or null (nothing stored — never the unit price) */
/* ── STAFFEL / NEBENKOSTEN / DETAILS: one row each, the full section opens in a sheet (same as Casa) ── */
function _rntStaffelRowHTML(rid, isApt, unit, rec) {
  if (!rec) return '';
  const own = _rntOwnSteps(unit.id, rec.id);
  const st  = typeof ccTnStepState === 'function' ? ccTnStepState(own) : null;
  const staffel = own.some(e => (e.kind || 'staffel') === 'staffel');
  const meta = st && st.state === 'overdue' ? `<span class="tnp tnp-red">Mieterhöhung overdue</span>`
    : st && st.state === 'reminder' ? `<span class="tnp tnp-amber">Mieterhöhung from ${_rntFmtDate(st.entry.effective_date)}</span>`
    : (typeof ccTnStepNext === 'function' ? ccTnStepNext(own, _rntFmtEUR, _rntFmtDate) : '');
  return ccGroupHTML('', ccRowHTML({ icon: 'trending-up', title: 'Mieterhöhung' + (staffel ? ' <span class="tnp tnp-blue">Staffel</span>' : ''), meta,
    onclick: `_rntSheet('staffel','${rid}','${rec.id}','${isApt ? 'apt' : 'pk'}','${unit.id}')` }));
}
function _rntNkGroupHTML(rid, unit, rec) {
  const rows = [];
  if (!_rntAllPauschal(rec.id)) {
    const open = _rntNkHasOpen(rec.id);
    rows.push(ccRowHTML({ icon: 'receipt', title: 'NK-Abrechnungen',
      meta: open ? `<span class="tnp tnp-amber">${_rntEsc(typeof ccNksOpenLabel === 'function' ? ccNksOpenLabel(rec.id, _rntNK[rec.id], _rntNkDue(rec)) : 'NK open')}</span>` : 'none due',
      onclick: `_rntSheet('nk','${rid}','${rec.id}','apt','${unit.id}')` }));
  }
  const c = _rntNKVorausCurFor(unit.id, rec);
  const pend = typeof ccTnNkChangeTodo === 'function' ? ccTnNkChangeTodo(_rntNKVoraus[unit.id], rec) : null;
  rows.push(ccRowHTML({ icon: 'coin-euro', title: 'NK-Vorauszahlung',
    meta: pend ? `<span class="tnp ${pend.level === 'red' ? 'tnp-red' : 'tnp-amber'}">${_rntEsc(pend.text)}</span>`
               : c ? `${_rntFmtEUR(c.amount)}/mo` : 'not set',
    onclick: `_rntSheet('nkv','${rid}','${rec.id}','apt','${unit.id}')` }));
  return ccGroupHTML('Nebenkosten', rows.join(''));
}
function _rntDetailsGroupHTML(rid, unit, rec) {
  if (typeof ccfDocsSectionHTML !== 'function') return '';
  const kind = rec.apartment_id ? 'apt' : 'pk';
  const n = typeof ccRpFor === 'function' ? ccRpFor('rentals', rec.id).length : 0;
  return ccGroupHTML('Details',
    ccRowHTML({ icon: 'file-text', title: 'Documents', meta: _rntEsc(ccfDocsSummary(rec)), onclick: `_rntSheet('docs','${rid}','${rec.id}','${kind}','${unit.id}')` }) +
    (kind === 'apt' ? ccRowHTML({ icon: 'gauge', title: 'Zählerstände', meta: _rntEsc(ccfMetersSummary(rec)), onclick: `_rntSheet('meters','${rid}','${rec.id}','${kind}','${unit.id}')` }) : '') +   // parking has no Zähler
    (n >= 2 ? ccRowHTML({ icon: 'history', title: 'Rent history', meta: n + ' entries', onclick: `_rntSheet('rent','${rid}','${rec.id}','${kind}','${unit.id}')` }) : ''));
}
/* ── Casa Castel layout (Oct 2026): Kaution line · More list · Übergabe button · Former tenants row ── */
function _rntKautionLine(el, totalHeld) {
  if (!el) return;
  // every apartment and parking spot: who lives there today, and their rent (rent history first)
  const units = [...(typeof appApartments !== 'undefined' ? appApartments : []).map(a => ['apartment_id', a.id]),
                 ...(typeof appParking !== 'undefined' ? appParking : []).map(p => ['parking_id', p.id])];
  if (!units.length) { el.style.display = 'none'; return; }
  let kalt = 0, nk = 0, living = 0;
  units.forEach(([col, id]) => {
    const cur = _ccPickTenancy(_rntRecords.filter(r => r[col] === id && r.status === 'active')).current;
    if (!cur) return;
    living++;
    const r = _rntCurrentRent(cur);
    if (r) { kalt += Number(r.kalt) || 0; nk += Number(r.nk) || 0; }
  });
  const vac = units.length - living;
  el.innerHTML = `<div class="cc-sum2__meta"><b>Ist</b><span>${living} living here${vac ? ' \u00b7 ' + vac + ' vacant' : ''}</span></div>
    <div class="cc-sum2__vals"><span><i>Kalt</i>${_rntFmtEUR(kalt)}</span><span><i>NK</i>${_rntFmtEUR(nk)}</span><span><i>Kaution held</i>${_rntFmtEUR(totalHeld)}</span></div>`;
  el.style.display = 'flex';
}
/* the current tenancy of a unit (same pick as the card) — for the Apartments Soll */
function rntCurrentRecOf(kind, id) {
  const src = _rntLoadedOnce ? _rntRecords : _rntActiveRecs;
  if (!src) return null;
  const col = kind === 'apt' ? 'apartment_id' : 'parking_id';
  return _ccPickTenancy(src.filter(r => r[col] === id && r.status === 'active')).current || null;
}
/* One "More" list = the former Nebenkosten + Details groups (same rows, same sheets) */
function _rntMoreHTML(rid, type, unit, rec) {
  const isApt = type === 'apt', kind = isApt ? 'apt' : 'pk', rows = [];
  if (typeof ccfDocsSectionHTML === 'function') {
    rows.push(ccRowHTML({ icon: 'file-text', title: 'Documents', meta: _rntEsc(ccfDocsSummary(rec)), onclick: `_rntSheet('docs','${rid}','${rec.id}','${kind}','${unit.id}')` }));
    if (isApt) rows.push(ccRowHTML({ icon: 'gauge', title: 'Zählerstände', meta: _rntEsc(ccfMetersSummary(rec)), onclick: `_rntSheet('meters','${rid}','${rec.id}','${kind}','${unit.id}')` }));   // parking has no Zähler
  }
  if (isApt) {
    if (!_rntAllPauschal(rec.id)) {
      const open = _rntNkHasOpen(rec.id);
      rows.push(ccRowHTML({ icon: 'receipt', title: 'NK-Abrechnungen',
        meta: open ? `<span class="tnp tnp-amber">${_rntEsc(typeof ccNksOpenLabel === 'function' ? ccNksOpenLabel(rec.id, _rntNK[rec.id], _rntNkDue(rec)) : 'NK open')}</span>` : 'none due',
        onclick: `_rntSheet('nk','${rid}','${rec.id}','apt','${unit.id}')` }));
    }
    const c = _rntNKVorausCurFor(unit.id, rec);
    const pend = typeof ccTnNkChangeTodo === 'function' ? ccTnNkChangeTodo(_rntNKVoraus[unit.id], rec) : null;
    rows.push(ccRowHTML({ icon: 'coin-euro', title: 'NK-Vorauszahlung',
      meta: pend ? `<span class="tnp ${pend.level === 'red' ? 'tnp-red' : 'tnp-amber'}">${_rntEsc(pend.text)}</span>`
                 : c ? `${_rntFmtEUR(c.amount)}/mo` : 'not set',
      onclick: `_rntSheet('nkv','${rid}','${rec.id}','apt','${unit.id}')` }));
  }
  const n = typeof ccRpFor === 'function' ? ccRpFor('rentals', rec.id).length : 0;
  if (n >= 2) rows.push(ccRowHTML({ icon: 'history', title: 'Rent history', meta: n + ' entries', onclick: `_rntSheet('rent','${rid}','${rec.id}','${kind}','${unit.id}')` }));
  return rows.length ? ccGroupHTML('More', rows.join('')) : '';
}
/* Übergabe — the Apartments-card button, moved here: below everything, above Former tenants */
function _rntUebergHTML(type, unit) {
  const isApt = type === 'apt', pre = isApt ? 'apt' : 'pk', setFn = isApt ? '_aptSetEU' : '_pkSetEU';
  const ein = isApt ? (typeof _aptEuIsEinzug === 'function' ? _aptEuIsEinzug(unit.id) : true)
                    : (typeof _pkEuIsEinzug === 'function' ? _pkEuIsEinzug(unit.id) : true);
  return `
<div class="tn-sec apt-contracts rnt-ub">
  <div class="apt-contracts-title">Create contracts</div>
  <div class="apt-doc-row">
    <button class="apt-doc-btn" onclick="_rntUbOpen('${pre}','${unit.id}')">
      Übergabeprotokoll <i class="ti ti-chevron-right"></i>
    </button>
    <div class="apt-doc-toggle" id="${pre}-eu-${unit.id}">
      <button class="${ein ? 'active' : ''}" onclick="event.stopPropagation();${setFn}('${unit.id}',0,this)">Einzug</button>
      <button class="${ein ? '' : 'active'}" onclick="event.stopPropagation();${setFn}('${unit.id}',1,this)">Auszug</button>
    </div>
  </div>
</div>`;
}
/* The Übergabe generator lives in the Apartments / Parking tab: that tab shows while it is open
   (like Renew), and Tenants comes back as soon as it closes. */
function _rntUbOpen(pre, unitId) {
  const isApt = pre === 'apt';
  const ov = document.getElementById(isApt ? 'aptContractOverlay' : 'pkContractOverlay');
  if (ov && !ov._rntBack) {
    ov._rntBack = true;
    new MutationObserver(() => {
      if (!ov.classList.contains('open') && window._rntUbReturn) {
        const t = window._rntUbReturn; window._rntUbReturn = null;
        if (typeof switchTab === 'function') switchTab(t);
      }
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  }
  if (typeof switchTab === 'function') switchTab(isApt ? 'apartments' : 'parking');
  setTimeout(async () => {
    window._rntUbReturn = 'tenants';
    try { if (isApt) await _aptOpenContract('ueberg', unitId); else await _pkOpenContract('ueberg', unitId); }
    finally { if (!ov || !ov.classList.contains('open')) window._rntUbReturn = null; }   // did not open → no jump later
  }, 80);
}
/* Former tenants — one row that opens the same list (Show older · Add former tenant · Archived) */
const _rntMoreOpen = {};
function _rntMoreToggle(key) { _rntMoreOpen[key] = !_rntMoreOpen[key]; _rntRender(); }
function _rntFormerRowHTML(rid, type, unit, formerRecs, archivedRecs) {
  const k = rid + ':former', open = !!_rntMoreOpen[k];
  const nOpen = formerRecs.filter(r => _rntNkHasOpen(r.id) || _rntKautionOpen(r.id)).length;
  const meta = !formerRecs.length && !archivedRecs.length ? 'none'
    : nOpen ? `<span class="tnp tnp-amber">${nOpen} open</span>` : String(formerRecs.length + archivedRecs.length);
  let html = ccRowHTML({ icon: 'users', title: 'Former tenants', meta, onclick: `_rntMoreToggle('${k}')` }).replace('cc-grow"', `cc-grow${open ? ' is-open' : ''}"`);
  if (open) html += `<div class="tn-more-in">${_rntFormerSectionHTML(rid, type, unit, formerRecs, archivedRecs, true)}</div>`;
  return ccGroupHTML('', html);
}

function _rntSheet(kind, rid, tid, ukind, unitId) {
  const rec0 = _rntRecords.find(r => String(r.id) === String(tid)); if (!rec0) return;
  const unit = (ukind === 'apt' ? (typeof appApartments !== 'undefined' ? appApartments : []) : (typeof appParking !== 'undefined' ? appParking : []))
    .find(u => String(u.id) === String(unitId));
  const titles = { staffel: 'Mieterhöhung', nk: 'NK-Abrechnungen', nkv: 'NK-Vorauszahlung', docs: 'Documents', meters: 'Zählerstände', rent: 'Rent history' };
  const unitName = unit ? (unit.name || unit.bezeichnung || unit.label || '') : '';
  ccSheetOpen({
    title: titles[kind],
    kicker: [unitName, _rntFullTenantNames(rec0)].filter(Boolean).join(' \u00b7 '),
    build: () => {
      const rec = _rntRecords.find(r => String(r.id) === String(tid)); if (!rec) return '';
      if (kind === 'staffel') return ukind === 'apt' ? _rntStaffelHTML(rid, unitId, tid) : _rntPkStaffelHTML(rid, unitId, tid);
      if (kind === 'nk')      return _rntNKHTML(rid, rec.id, 'card');
      if (kind === 'nkv')     return _rntNKVorausHTML(rid, unitId, 'card');
      if (kind === 'docs')    return ccfDocsSectionHTML(rec, 'card');
      if (kind === 'meters')  return ccfMetersSectionHTML(rec, 'card');
      if (kind === 'rent') {
        const h = _ccRentTimelineHTML('rentals', rec, _rntFmtEUR);
        return h ? '<div class="tn-sec"><div class="tn-sec-body" style="padding-top:10px">' + h.replace('<details class="cc-tl">', '<details class="cc-tl" open>') + '</div></div>' : '';
      }
      return '';
    },
  });
}
/* NK-Vorauszahlung of the unit's CURRENT tenant (never the previous tenant's rate) */
function _rntNKVorausCurFor(aptId, who) {
  const today = _ccTodayIso();
  if (!who) {
    who = (_rntRecords || []).filter(r => r.apartment_id === aptId && r.status === 'active')
      .sort((a, b) => String(a.mietbeginn || '').localeCompare(String(b.mietbeginn || '')))
      .find(r => !r.mietbeginn || _ccIso(r.mietbeginn) <= today) || null;
  }
  if (!who) return null;
  const mb = who.mietbeginn ? _ccIso(who.mietbeginn) : '';
  const e = (_rntNKVoraus[aptId] || []).filter(x => x.tenant_id ? String(x.tenant_id) === String(who.id)
      : (!mb || String(x.effective_date).slice(0, 10) >= mb))
    .find(x => String(x.effective_date).slice(0, 10) <= today);
  if (e) return { amount: Number(e.amount), since: String(e.effective_date).slice(0, 10), ignored: e.ignored };
  const r = _rntCurrentRent(who);
  if (r && r.mode !== 'pauschal' && r.nk) return { amount: Number(r.nk), since: mb, fromContract: true };
  return null;
}

function _rntCurrentRent(rec) {
  if (!rec) return null;
  const per = typeof ccRpFor === 'function' ? ccRpAt(ccRpFor('rentals', rec.id), ccRpToday()) : null;
  let out = null;
  if (per) out = { ...ccRpAmount(per), src: 'history', period: per };
  else if (rec.kaltmiete != null || rec.nebenkosten != null) {
    const k = Number(rec.kaltmiete) || 0, n = Number(rec.nebenkosten) || 0;
    out = { mode: 'kalt_nk', kalt: k, nk: n, total: k + n, src: 'tenant' };
  }
  // a Mieterhöhung that has started (not skipped) is today's Kaltmiete — the same as Controlling
  const st = out && out.mode !== 'pauschal' ? _rntMhAt(rec, ccRpToday(), per ? ccRpIso(per.valid_from) : ccRpIso(rec.mietbeginn)) : null;
  if (st) out = { ...out, kalt: Number(st.amount), total: Number(st.amount) + (Number(out.nk) || 0), src: 'mh', step: st };
  return out;
}
/* The tenant's latest Mieterhöhung on/before iso (and not before base) · the next one after today */
function _rntMhAt(rec, iso, base) {
  const unitId = rec.apartment_id || rec.parking_id; if (!unitId || typeof _rntOwnSteps !== 'function') return null;
  return _rntOwnSteps(unitId, rec.id).filter(e => !e.ignored && ccRpIso(e.effective_date) <= iso && (!base || ccRpIso(e.effective_date) >= base))
    .sort((a, b) => ccRpIso(b.effective_date).localeCompare(ccRpIso(a.effective_date)))[0] || null;
}
function _rntMhNext(rec) {
  const unitId = rec && (rec.apartment_id || rec.parking_id); if (!unitId || typeof _rntOwnSteps !== 'function') return null;
  return _rntOwnSteps(unitId, rec.id).filter(e => !e.ignored && e.kind !== 'start' && ccRpIso(e.effective_date) > ccRpToday())
    .sort((a, b) => ccRpIso(a.effective_date).localeCompare(ccRpIso(b.effective_date)))[0] || null;
}




/* Contract generators: the active tenant's fixed Kaution Soll (or null) */
function rntFixedKautionSoll(kind, id) {
  const src = _rntLoadedOnce ? _rntRecords : _rntActiveRecs;
  const col = kind === 'apt' ? 'apartment_id' : 'parking_id';
  const rec = (src || []).filter(r => r[col] === id && r.status === 'active')
    .sort((a, b) => String(b.mietbeginn || '').localeCompare(String(a.mietbeginn || '')))[0];
  const v = rec && rec.kaution_soll;
  return v != null && v !== '' && Number(v) > 0 ? Number(v) : null;
}


function _rntToggleKautionOverride(el, inputId, hintId) {
  const on  = el.checked;
  const inp  = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  if (inp)  { inp.disabled = !on; inp.style.opacity = on ? '1' : '.4'; if (on) inp.focus(); }
  if (hint) hint.style.display = on ? 'none' : '';
}


/* ══════════════════════════════════════════════════════════════
   5. FORMAT HELPERS
══════════════════════════════════════════════════════════════ */
function _rntFullTenantNames(rec) {
  if (!rec) return '';
  const names = [
    [rec.first_name, rec.last_name].filter(Boolean).join(' '),
    [rec.first_name_2, rec.last_name_2].filter(Boolean).join(' '),
    [rec.first_name_3, rec.last_name_3].filter(Boolean).join(' '),
  ].filter(Boolean);
  return names.join(', ');
}

function _rntFmtEUR(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + '\u00a0\u20ac';
}

function _rntFmtDate(d) {
  if (!d) return '';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return d;
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return String(dt.getDate()).padStart(2,'0') + '.' +
         String(dt.getMonth()+1).padStart(2,'0') + '.' +
         dt.getFullYear();
}

function _rntParseDate(s) {
  if (!s || !s.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return s.trim();
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

function _rntIsPast(dateStr) {
  if (!dateStr) return false;
  const iso = _rntParseDate(dateStr);
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  return d <= today;
}

function _rntEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ══════════════════════════════════════════════════════════════
   6. STATUS HELPERS
══════════════════════════════════════════════════════════════ */
function _rntKautionStatus(recv, ret, settled) { return ccTnKautionStatus(recv, ret, settled); }   // shared (cc-tenant-status.js)

/* Pauschal for the whole tenancy (every rent-history entry pauschal) → no NK-Abrechnung */
function _rntAllPauschal(tid) {
  const per = typeof ccRpFor === 'function' ? ccRpFor('rentals', tid) : [];
  return per.length > 0 && per.every(p => p.mode === 'pauschal');
}
/* NK periods that are due for this tenant — from the apartment's own Abrechnungszeitraum (Controlling) */
function _rntNkDue(rec) {
  if (!rec || typeof ccNksDueFor !== 'function') return [];
  const apt = rec.apartment_id ? (appApartments || []).find(a => String(a.id) === String(rec.apartment_id)) : null;
  return apt ? ccNksDueFor(rec, apt) : [];
}
function _rntNkHasOpen(tid) {
  if (_rntAllPauschal(tid)) return false;                                           // pauschal → no NK-Abrechnung
  const rec = (_rntRecords || []).find(r => String(r.id) === String(tid));
  if (typeof ccNksHasOpen === 'function') return ccNksHasOpen(tid, _rntNK[tid], _rntNkDue(rec));   // Settlements + old tracking
  return (_rntNK[tid] || []).some(e => !e.paid);
}

function _rntKautionOpen(tid) {
  const k = _rntKaution[tid];
  return k && k.received > 0 && !k.settled;
}

function _rntKautionKept(tid) {
  const k = _rntKaution[tid];
  if (!k) return 0;
  return Math.max(0, (k.received || 0) - (k.returned || 0));
}

function _rntIsAllDone(tid) {
  return !_rntNkHasOpen(tid) && !_rntKautionOpen(tid);
}

function _rntFormerVisible(rec) {
  if (rec.done) return false;
  if (!rec.mietende) return true;
  if (_rntNkHasOpen(rec.id) || _rntKautionOpen(rec.id)) return true;
  const monthsAgo = (Date.now() - new Date(rec.mietende)) / (30.44 * 24 * 3600 * 1000);
  return monthsAgo < 12;
}

function _rntDaysToMoveOut(rec) {
  if (!rec || !rec.mietende) return null;
  const diff = new Date(rec.mietende) - new Date();
  return Math.ceil(diff / (24 * 3600 * 1000));
}

function _rntNKVorausCurrent(aptId) {
  const today = new Date(); today.setHours(0,0,0,0);
  return (_rntNKVoraus[aptId] || []).find(e => new Date(e.effective_date) <= today) || null;
}

function _rntNKVorausHasOpen(aptId) {
  return (_rntNKVoraus[aptId] || []).some(e => !e.tenant_adjusted);
}

function _rntStaffelNext(aptId) {
  const today = new Date(); today.setHours(0,0,0,0);
  return _rntOwnSteps(aptId).find(e => new Date(e.effective_date) > today) || null;
}
function _rntStaffelCurrent(aptId) {
  const today = new Date(); today.setHours(0,0,0,0);
  return _rntOwnSteps(aptId).find(e => new Date(e.effective_date) <= today) || null;
}
function _rntStaffelPillState(aptId) {
  // Returns null (no pill), 'reminder' (amber, ≤30 days), or 'overdue' (red, past + not adjusted) — own steps only
  if (typeof ccTnStepState === 'function') return ccTnStepState(_rntOwnSteps(aptId));
  const today = new Date(); today.setHours(0,0,0,0);
  const entries = _rntOwnSteps(aptId);
  for (const e of entries) {
    if (e.tenant_adjusted || e.ignored) continue;     // ignored steps are never a to-do
    const eff = new Date(e.effective_date);
    const diffDays = Math.ceil((eff - today) / (24 * 3600 * 1000));
    if (diffDays > 30) continue;
    if (diffDays >= 0) return { state: 'reminder', entry: e, days: diffDays };
    return { state: 'overdue', entry: e, days: Math.abs(diffDays) };
  }
  return null;
}

/* Card pills (row 1 state + row 4 to-dos) — ONE function, used for the first render
   and for every refresh after a save. Rules/wording/colours: cc-tenant-status.js */
function _rntCardPills(unit, isApt, activeRec) {
  const vacant = !!unit.vacant;
  const todos = [];
  if (activeRec) {
    todos.push(ccTnMoveOutTodo(activeRec));
    const _ct = _rntHasCt(unit, isApt) ? rntContractType(activeRec) : null;
    if (!_rntHasCt(unit, isApt) || _ct === 'kurzzeit') todos.push(ccTnRenewalTodo(activeRec));   // Mietvertrag is never renewed
    if (_ct === 'kurzzeit' && !activeRec.vertragsende && !activeRec.mietende) todos.push({ level: 'amber', text: 'Contract end missing' });
    todos.push(ccTnStaffelTodo(_rntStaffelPillState(unit.id), d => { const [y, m, day] = d.split('-'); return `${day}.${m}.`; }));
    if (isApt && _rntNkHasOpen(activeRec.id)) todos.push({ level: 'amber', text: typeof ccNksOpenLabel === 'function' ? ccNksOpenLabel(activeRec.id, _rntNK[activeRec.id]) : 'NK open' });   // Settlements + old tracking
    if (isApt && typeof ccTnNkChangeTodo === 'function') todos.push(ccTnNkChangeTodo(_rntNKVoraus[unit.id], activeRec));
    todos.push(ccTnStillActiveTodo(vacant, activeRec));
  }
  const movesIn = ccTnMovesIn(vacant, activeRec);
  const kPill = ((!vacant || movesIn) && activeRec)
    ? ccTnKautionPill(_rntKaution[activeRec.id], (_rntKautionSollInfo(activeRec) || {}).amount, _rntFmtEUR) : '';
  return { row1: ccTnRow1(vacant, kPill, movesIn), todo: ccTnTodoRow(todos) };
}
function _rntRefreshCardPills(unitId) {
  const apt = (typeof appApartments !== 'undefined' ? appApartments : []).find(a => a.id === unitId);
  const pk  = apt ? null : (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === unitId);
  const unit = apt || pk; if (!unit) return;
  const isApt = !!apt;
  const _pk = _ccPickTenancy((_rntRecords || []).filter(r => (isApt ? r.apartment_id : r.parking_id) === unitId && r.status === 'active'));
  const rec = _pk.current || _pk.next;
  const p = _rntCardPills(unit, isApt, rec);
  ccTnApplyPills((isApt ? 'apt_' : 'pk_') + String(unitId).replace(/-/g, '').slice(0, 12), p.row1, p.todo);
}


/* ══════════════════════════════════════════════════════════════
   7. SUPABASE LOAD
══════════════════════════════════════════════════════════════ */
async function _rntLoad() {
  if (!sbL) return;
  if (!appApartments?.length && !appParking?.length) { _rntRender(); return; }

  const aptIds = (appApartments || []).map(a => a.id);
  const pkIds  = (appParking    || []).map(p => p.id);

  // Load all tenant records for apartments
  const aptQuery = aptIds.length
    ? sbL.from('rnt_tenant_records').select('*')
        .in('apartment_id', aptIds).order('mietbeginn', { ascending: false })
    : Promise.resolve({ data: [] });

  // Load all tenant records for parking
  const pkQuery = pkIds.length
    ? sbL.from('rnt_tenant_records').select('*')
        .in('parking_id', pkIds).order('mietbeginn', { ascending: false })
    : Promise.resolve({ data: [] });

  // Vorauszahlung + Staffelmiete only need apartment/parking ids — they do
  // NOT depend on tenant ids, so they run in the same round-trip as the
  // records instead of waiting for them.
  const vorausQuery = aptIds.length
    ? sbL.from('rnt_nk_vorauszahlung_history').select('*')
         .in('apartment_id', aptIds).order('effective_date', { ascending: false })
    : Promise.resolve({ data: [] });

  const staffelQuery = (aptIds.length || pkIds.length)
    ? (() => {
        let q = sbL.from('rnt_staffelmiete_history').select('*');
        if (aptIds.length && pkIds.length)
          q = q.or(`apartment_id.in.(${aptIds.join(',')}),parking_id.in.(${pkIds.join(',')})`);
        else if (aptIds.length)
          q = q.in('apartment_id', aptIds);
        else
          q = q.in('parking_id', pkIds);
        return q.order('effective_date', { ascending: false });
      })()
    : Promise.resolve({ data: [] });

  const [aptRes, pkRes, vorausRes, staffelRes] =
    await Promise.all([aptQuery, pkQuery, vorausQuery, staffelQuery]);
  _rntRecords = [...(aptRes.data || []), ...(pkRes.data || [])];

  const tids = _rntRecords.map(r => r.id);
  if (!tids.length) { _rntProfileCache = {}; _rntLoadedOnce = true; _rntRender(); return; }

  const [kRes, nkRes, docRes] = await Promise.all([
    sbL.from('rnt_kaution').select('*').in('tenant_id', tids),
    sbL.from('rnt_nk_entries').select('*').in('tenant_id', tids).order('period', { ascending: false }),
    sbL.from('rnt_tenant_documents').select('*').in('tenant_id', tids),
    typeof ccRpLoad === 'function' ? ccRpLoad(sbL, 'rentals') : Promise.resolve([]),   // rent history (rent_periods)
    typeof ccNksLoad === 'function' ? ccNksLoad() : Promise.resolve(),                  // NK-Abrechnungen (Settlements)
    typeof ccfLoadReadings === 'function' ? ccfLoadReadings(tids) : Promise.resolve(),  // Zählerstände (meter_readings)
  ]);

  _rntKaution = {};
  (kRes.data || []).forEach(k => { _rntKaution[k.tenant_id] = k; });

  _rntNK = {};
  (nkRes.data || []).forEach(e => {
    if (!_rntNK[e.tenant_id]) _rntNK[e.tenant_id] = [];
    _rntNK[e.tenant_id].push(e);
  });

  _rntDocs = {};
  (docRes.data || []).forEach(d => {
    if (!_rntDocs[d.tenant_id]) _rntDocs[d.tenant_id] = [];
    _rntDocs[d.tenant_id].push(d);
  });

  _rntNKVoraus = {};
  (vorausRes.data || []).forEach(e => {
    if (!_rntNKVoraus[e.apartment_id]) _rntNKVoraus[e.apartment_id] = [];
    _rntNKVoraus[e.apartment_id].push(e);
  });

  _rntStaffel = {};
  (staffelRes.data || []).forEach(e => {
    const key = e.apartment_id || e.parking_id;
    if (!key) return;
    if (!_rntStaffel[key]) _rntStaffel[key] = [];
    _rntStaffel[key].push(e);
  });
  // Newest first — sorted here, never relying on the order the database sent
  Object.values(_rntStaffel).forEach(list => list.sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date))));

  // Build profile cache
  _rntProfileCache = {};
  _rntRecords.filter(r => r.status === 'active').forEach(r => {
    const key = r.apartment_id ? 'apt_' + r.apartment_id : 'pk_' + r.parking_id;
    _rntProfileCache[key] = {
      firstName: r.first_name || '', lastName: r.last_name || '',
      email: r.email || '', phone: r.phone || '',
      birthday: r.birthday || '', address: r.address || '',
      tenant2: (r.first_name_2 || r.last_name_2) ? {
        firstName: r.first_name_2 || '', lastName: r.last_name_2 || '',
        email: r.email_2 || '', phone: r.phone_2 || '',
        birthday: r.birthday_2 || '', address: r.address_2 || '',
      } : null,
      tenant3: (r.first_name_3 || r.last_name_3) ? {
        firstName: r.first_name_3 || '', lastName: r.last_name_3 || '',
        email: r.email_3 || '', phone: r.phone_3 || '',
        birthday: r.birthday_3 || '', address: r.address_3 || '',
      } : null,
    };
  });
  _rntLoadedOnce = true;

  _rntSyncOccupancy();       // occupied / vacant from the dates (and former after the move-out)
  try { if (typeof _updateAptSummary === 'function') _updateAptSummary(); } catch (e) {}   // Soll: contract types now known
  _rntFreezeKautionSoll();   // existing tenants: fix the Kaution Soll once
  _rntFreezeRent();          // existing active tenants: fix their rent once
  _rntRenderIfChanged();
}

/* After a (background) load: repaint only if the data really changed and you
   are not in the middle of editing here — otherwise the screen stays as it is. */
let _rntRenderedSig = null;
function _rntRenderIfChanged() {
  const sig = ccStableJSON([_rntRecords, _rntKaution, _rntNK, _rntDocs, _rntNKVoraus, _rntStaffel, _rntProfileCache,
                              (typeof _ccfReadings !== 'undefined' ? _ccfReadings : {}),
                              (appApartments || []).map(a => [a.id, a.name, a.vacant, a.zimmer_type, a.pricing, a.adresse]),
                              (appParking    || []).map(p => [p.id, p.name, p.vacant, p.pricing, p.adresse])]);
  const list  = document.getElementById('rntTenantsList');
  const shown = !!(list && list.querySelector('.tn-card'));
  if (shown && sig === _rntRenderedSig) return;
  if (shown && typeof _rtBusy === 'function' && _rtBusy('tenants')) return;
  _rntRender();
  _rntRenderedSig = sig;
}


/* ══════════════════════════════════════════════════════════════
   8. CROSS-TAB PROFILE FUNCTIONS (called by apartments + parking tabs)
══════════════════════════════════════════════════════════════ */
function _rntGetProfile(aptId) {
  return _rntProfileCache['apt_' + aptId] || {};
}

function _rntGetParkingProfile(pkId) {
  return _rntProfileCache['pk_' + pkId] || {};
}


/* ══════════════════════════════════════════════════════════════
   9. RENDER
══════════════════════════════════════════════════════════════ */
function _rntRender() {
  const list = document.getElementById('rntTenantsList');
  if (!list) return;

  const aptsAll = [...(appApartments || [])].sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
  const apts    = aptsAll.filter(a => a.zimmer_type !== 'Gewerbefläche');
  const gewerbe = aptsAll.filter(a => a.zimmer_type === 'Gewerbefläche');
  const parking = [...(appParking    || [])].sort((a,b) => (a.sort_order||0) - (b.sort_order||0));

  if (!apts.length && !parking.length) {
    list.innerHTML = `<p class="tn-empty">No units configured.</p>`;
    return;
  }

  // Snapshot open cards
  document.querySelectorAll('.tn-card.open').forEach(el => _rntOpenCards.add(el.id));

  // Kaution held summary
  const totalHeld = ccTnHeldTotal(_rntRecords, _rntKaution);   // received − returned, unsettled
  _rntKautionLine(document.getElementById('rnt-kaution-summary'), totalHeld);

  // Same cards in the same order as on screen → redraw only the cards whose
  // content changed (no full rebuild → no flash / jump when you open the tab)
  const units   = [...apts.map(a => ({ type: 'apt', unit: a })), ...gewerbe.map(a => ({ type: 'apt', unit: a })),
                   ...parking.map(p => ({ type: 'parking', unit: p }))];
  const cardId  = u => 'tc-' + (u.type === 'apt' ? 'apt_' : 'pk_') + String(u.unit.id).replace(/-/g, '').slice(0, 12);
  const groups  = [apts.length > 0, gewerbe.length > 0, parking.length > 0].join();
  const onScreen = [...list.querySelectorAll(':scope > .tn-card')];
  if (list.dataset.groups === groups && onScreen.length === units.length &&
      onScreen.every((c, i) => c.id === cardId(units[i]))) {
    units.forEach((u, i) => {
      const cardHtml = _rntCardHTML(u);
      const same = _rntNormCard(cardHtml);                 // open / closed does not count as a change
      if (_rntCardCache[onScreen[i].id] === same) return;
      ccSwapCard(onScreen[i], cardHtml, 'open');
      _rntCardCache[onScreen[i].id] = same;
    });
    _rntBindCards();
    if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
    return;
  }

  let html = '';
  if (apts.length) {
    html += `<div class="rnt-group-hdr">Wohnungen</div>`;
    html += apts.map(a => _rntCardHTML({ type: 'apt', unit: a })).join('');
  }
  if (gewerbe.length) {
    html += `<div class="rnt-group-hdr" style="margin-top:${apts.length ? '16px' : '0'}">Gewerbeflächen</div>`;
    html += gewerbe.map(a => _rntCardHTML({ type: 'apt', unit: a })).join('');
  }
  if (parking.length) {
    html += `<div class="rnt-group-hdr" style="margin-top:${(apts.length || gewerbe.length) ? '16px' : '0'}">Stellplätze</div>`;
    html += parking.map(p => _rntCardHTML({ type: 'parking', unit: p })).join('');
  }
  list.innerHTML = html;
  list.dataset.groups = groups;
  _rntCardCache = {};
  units.forEach(u => { _rntCardCache[cardId(u)] = _rntNormCard(_rntCardHTML(u)); });

  _rntOpenCards.forEach(id => document.getElementById(id)?.classList.add('open'));
  _rntBindCards();
  if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
}

/* Each card's HTML as last drawn (card id → html), for the redraw-only-changes check */
let _rntCardCache = {};
function _rntNormCard(html) { return html.replace('<div class="tn-card open"', '<div class="tn-card"'); }


/* ══════════════════════════════════════════════════════════════
   10. CARD HTML
══════════════════════════════════════════════════════════════ */
function _rntCardHTML({ type, unit }) {
  const isApt = type === 'apt';
  const rid   = (isApt ? 'apt_' : 'pk_') + unit.id.replace(/-/g,'').slice(0,12);
  const cid   = 'tc-' + rid;

  const _pick = _ccPickTenancy(_rntRecords.filter(r => (isApt ? r.apartment_id : r.parking_id) === unit.id && r.status === 'active'));
  // Current tenant first; a signed next tenant only takes the card when nobody lives there now
  const activeRec = _pick.current || _pick.next;
  const nextRec   = _pick.current ? _pick.next : null;

  const formerRecs = (isApt
    ? _rntRecords.filter(r => r.apartment_id === unit.id && r.status === 'former')
    : _rntRecords.filter(r => r.parking_id   === unit.id && r.status === 'former')
  ).sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));

  const archivedRecs = (isApt
    ? _rntRecords.filter(r => r.apartment_id === unit.id && r.status === 'archived')
    : _rntRecords.filter(r => r.parking_id   === unit.id && r.status === 'archived')
  ).sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));

  const formerNudges = formerRecs
    .filter(r => { const k = _rntKaution[r.id]; return k && k.received > 0 && !k.settled; })
    .map(r => {
      const name = _rntFullTenantNames(r) || '\u2014';
      const kk   = _rntKaution[r.id];
      const kept = _rntKautionKept(r.id);
      const allReturned = kk && kk.returned >= kk.received;
      const keptStr   = kept > 0 ? _rntFmtEUR(kept) + ' kept' : allReturned ? 'fully returned' : 'full refund';
      const statusStr = allReturned ? 'Mark settled' : 'Refund pending';
      return `<div class="tn-kaution-nudge" onclick="_rntOpenModal('${r.id}')">
        <i class="ti ti-user" style="font-size:11px"></i>
        <span class="tn-nudge-name">${_rntEsc(name)} · former</span>
        <span class="tn-nudge-kept">${keptStr}</span>
        <span class="tn-nudge-status">${statusStr}</span>
        <i class="ti ti-chevron-right" style="font-size:11px"></i>
      </div>`;
    }).join('');

  const isOpen = _rntOpenCards.has(cid);

  return `
<div class="tn-card${isOpen ? ' open' : ''}" id="${cid}">
  ${_rntHeaderHTML(rid, type, unit, activeRec)}
  ${formerNudges}
  <div class="tn-body" id="tb-${rid}">
    ${activeRec
      ? _rntRentBarHTML(rid, type, unit, activeRec) + _rntRentFormHTML(rid, type, unit, activeRec) + _rntStaffelRowHTML(rid, isApt, unit, activeRec)
      : ''}
    ${_ccNextTenantHTML(nextRec, nextRec ? _rntEsc(_rntFullTenantNames(nextRec)) : '', _rntFmtDate, '_rntOpenModal')}
    ${_rntProfileSectionHTML(rid, type, unit, activeRec)}
    ${activeRec ? _rntKautionHTML(rid, activeRec.id, 'card', activeRec) : ''}
    ${activeRec ? _rntMoreHTML(rid, type, unit, activeRec) : ''}
    ${_rntUebergHTML(type, unit)}
    ${_rntFormerRowHTML(rid, type, unit, formerRecs, archivedRecs)}
  </div>
</div>`;
}


/* ── HEADER ── */
function _rntHeaderHTML(rid, type, unit, activeRec) {
  const isApt  = type === 'apt';
  // A signed tenant who moves in later is shown like a tenant ("from 01.10.2026"), not as "No current tenant"
  const _movesIn = typeof ccTnMovesIn === 'function' ? ccTnMovesIn(!!unit.vacant, activeRec) : null;
  const vacant = !!unit.vacant && !_movesIn;

  const fullName = activeRec ? _rntFullTenantNames(activeRec) : null;

  // Pricing for header summary
  let warm = null, kalt = null, nk = null, miete = null;
  const curR = _rntCurrentRent(activeRec);   // the tenant's own rent — no unit price fallback (B3)
  const _mhN = activeRec ? _rntMhNext(activeRec) : null;   // next Mieterhöhung → brown "→ … ab …"
  if (isApt) {
    const liveP = _rntAptPricing(unit.id);
    kalt  = curR ? curR.kalt : (activeRec ? null : liveP.kaltmiete);
    nk    = curR ? curR.nk   : (activeRec ? null : liveP.nebenkosten);
    warm  = (kalt != null && nk != null) ? kalt + nk : kalt;
  } else {
    const liveP = _rntPkPricing(unit.id);
    miete = curR ? curR.kalt : (activeRec ? null : liveP.miete);
  }

  const mietbeginn = activeRec ? _rntFmtDate(activeRec.mietbeginn) : null;
  const mietende   = activeRec ? _rntFmtDate(activeRec.mietende)   : null;
  const dateStr = mietbeginn && mietende
    ? `${mietbeginn} \u2013 ${mietende}`
    : mietbeginn ? `${_movesIn ? 'from' : 'since'} ${mietbeginn}` : '';

  const unitLabel = isApt
    ? unit.name
    : `${unit.name} \u00b7 ${unit.parking_type || 'Stellplatz'}`;

  const pills = _rntCardPills(unit, isApt, activeRec);
  const ctLabel = !isApt ? '' : (unit.zimmer_type === 'Gewerbefläche' ? 'Gewerbe'
    : (_rntContractLabel(rntContractType(activeRec)) || 'Mietvertrag'));

  let midLine = '', botLine = '';

  if (vacant) {
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No current tenant</span>`;
  } else if (activeRec) {
    // Slim closed card (Casa Castel layout): name, then ONE line — contract · since/bis · rent · next change
    midLine = `<span class="tn-tenant-name">${_rntEsc(fullName || 'Unnamed tenant')}</span>`;
    const ctCls = !ctLabel ? '' : ctLabel === 'Gewerbe' ? 'gewerbe' : /kurz/i.test(ctLabel) ? 'kurzzeit' : 'mietvertrag';
    if (isApt) {
      botLine = `<div class="tn-slim-info">
        ${ctLabel ? `<span class="tn-ctp tn-ctp--${ctCls}">${_rntEsc(ctLabel)}</span>` : ''}
        ${dateStr ? `<span class="tn-slim-txt">${_rntEsc(dateStr)}</span>` : ''}
        ${warm != null ? `<span class="tn-slim-txt"><b>${_rntFmtEUR(warm)}</b> warm</span>` : ''}
        ${(kalt != null && nk != null) ? `<span class="tn-slim-txt">${_rntFmtEUR(kalt).replace('\u00a0\u20ac','')} + ${_rntFmtEUR(nk).replace('\u00a0\u20ac','')} Kalt + NK</span>` : ''}
        ${_mhN && nk != null ? `<span class="tn-slim-next">\u2192 ${_rntFmtEUR(Number(_mhN.amount) + Number(nk))} ab ${_rntFmtDate(_mhN.effective_date)}</span>` : ''}
      </div>`;
    } else {
      botLine = `<div class="tn-slim-info">
        ${dateStr ? `<span class="tn-slim-txt">${_rntEsc(dateStr)}</span>` : ''}
        ${miete != null ? `<span class="tn-slim-txt"><b>${_rntFmtEUR(miete)}</b> Miete</span>` : ''}
        ${_mhN ? `<span class="tn-slim-next">\u2192 ${_rntFmtEUR(_mhN.amount)} ab ${_rntFmtDate(_mhN.effective_date)}</span>` : ''}
      </div>`;
    }
  } else {
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No tenant added</span>`;
  }

  return `
<div class="tn-hdr-wrap tn-slim" onclick="_rntToggleCard('${rid}')">
  <div class="tn-hdr-top tn-slim-top">
    <div class="tn-room-lbl tn-unit-line">${_rntEsc(unitLabel)}</div>
    <div id="hdr-kpill-${rid}" style="margin-left:auto;display:flex;align-items:center;gap:4px">${pills.row1}</div>
    <i class="ti ti-chevron-right tn-chev" aria-hidden="true"></i>
  </div>
  ${isApt && (unit.adresse || unit.wohnungsnummer) ? `<div class="tn-hdr-addr">${_rntEsc([unit.adresse, unit.wohnungsnummer].filter(Boolean).join(' \u00b7 '))}</div>` : ''}
  <div class="tn-hdr-mid">${midLine}</div>
  ${botLine}
  <div class="tn-todo-row" id="hdr-todo-${rid}" style="${pills.todo ? '' : 'display:none'}">${pills.todo}</div>
</div>`;
}


/* ── RENT BAR ── (the tenant's own rent only; B3) */
function _rntRentBarHTML(rid, type, unit, rec) {
  const isApt = type === 'apt';
  const cur   = _rntCurrentRent(rec);
  const src   = !cur ? 'not set' : cur.src === 'mh' ? 'since ' + ccRpFmt(cur.step.effective_date) : (cur.src === 'history' ? 'ab ' + ccRpFmt(cur.period.valid_from) : 'agreed');
  const nextP = rec && typeof ccRpFor === 'function'
    ? ccRpFor('rentals', rec.id).find(p => ccRpIso(p.valid_from) > ccRpToday()) : null;
  const nextM = _rntMhNext(rec);                                   // next Mieterhöhung → "neu ab" under the Kaltmiete
  const kSub  = nextM ? `<span style="color:#8C5A30">neu ab ${ccRpFmt(nextM.effective_date)}</span>` : src;
  // title row: contract · dates (the same words as on the closed card)
  const _mi  = rec && typeof ccTnMovesIn === 'function' ? ccTnMovesIn(!!unit.vacant, rec) : null;
  const _mb  = rec ? _rntFmtDate(rec.mietbeginn) : '', _me = rec ? _rntFmtDate(rec.mietende) : '';
  const _dt  = _mb && _me ? `${_mb} \u2013 ${_me}` : _mb ? `${_mi ? 'from' : 'since'} ${_mb}` : '';
  const _ct  = !isApt ? '' : (unit.zimmer_type === 'Gewerbefläche' ? 'Gewerbe' : (_rntContractLabel(rntContractType(rec)) || 'Mietvertrag'));
  const rTitle = (_ct || _dt) ? `<div class="tn-rtitle">${_ct ? `<span class="tn-rt-name">${_rntEsc(_ct)}</span>` : ''}${_dt ? `<span class="tn-rt-dates">${_rntEsc(_dt)}</span>` : ''}</div>` : '';

  if (isApt) {
    return `
<div class="tn-rent-wrap" id="rbar-${rid}">${rTitle}<div class="tn-rent-bar">
  <div class="tn-rc">
    <div class="tn-rlbl">Kaltmiete</div>
    <div class="tn-rval">${cur ? _rntFmtEUR(cur.kalt) : '\u2014'}</div>
    <div class="tn-rsub">${kSub}</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Nebenkosten</div>
    <div class="tn-rval">${cur ? _rntFmtEUR(cur.nk) : '\u2014'}</div>
    <div class="tn-rsub">${nextP ? 'neu ab ' + ccRpFmt(nextP.valid_from) : 'per month'}</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Warmmiete</div>
    <div class="tn-rval">${cur ? _rntFmtEUR(cur.total) : '\u2014'}</div>
    <div class="tn-rsub">Kalt + NK</div>
  </div>
  <div class="tn-rc">
    <button class="tn-edit-rent-btn" onclick="_rntToggleRentEdit('${rid}')">
      <i class="ti ti-pencil" style="font-size:10px"></i> Edit
    </button>
  </div>
</div></div>`;
  } else {
    return `
<div class="tn-rent-wrap" id="rbar-${rid}">${rTitle}<div class="tn-rent-bar">
  <div class="tn-rc">
    <div class="tn-rlbl">Parkmiete</div>
    <div class="tn-rval">${cur ? _rntFmtEUR(cur.kalt) : '\u2014'}</div>
    <div class="tn-rsub">${nextM ? kSub : nextP ? 'neu ab ' + ccRpFmt(nextP.valid_from) : src}</div>
  </div>
  <div class="tn-rc">
    <button class="tn-edit-rent-btn" onclick="_rntToggleRentEdit('${rid}')">
      <i class="ti ti-pencil" style="font-size:10px"></i> Edit
    </button>
  </div>
</div></div>`;
  }
}


/* ── RENT FORM ──
   Value = the tenant's own rent; the unit's price is only a grey hint (B3).
   "Gilt ab" empty = correct the current rent · a date = new rent from that day. */
function _rntRentFormHTML(rid, type, unit, rec) {
  const isApt = type === 'apt';
  const tid   = rec ? rec.id : '';
  const ksoll = _rntKautionSoll(rec) ?? '';
  const cur   = _rntCurrentRent(rec);
  const fromRow = `
  <div class="tn-rf">
    <span class="tn-flbl">Gilt ab</span>
    <input type="text" id="rf-from-${rid}" value="" placeholder="TT.MM.JJJJ"/>
  </div>`;

  if (isApt) {
    const liveP = _rntAptPricing(unit.id);
    const kalt  = cur ? cur.kalt : '';
    const nk    = cur ? cur.nk : '';
    const warm  = cur ? cur.total : '';

    return `
<div class="tn-rent-form" id="rform-${rid}" style="display:none">
  <div class="tn-rf">
    <span class="tn-flbl">Kaltmiete \u20ac/mo</span>
    <input type="number" data-cc-num="2" id="rf-kalt-${rid}" value="${kalt}" placeholder="${liveP.kaltmiete ?? ''}"
      readonly data-mh-lock oninput="_rntUpdateWarm('${rid}')"/>
    <span class="tn-rf-hint" style="margin:3px 0 0">Raise it with <a href="#" onclick="event.preventDefault();_rntSheet('staffel','${rid}','${tid}','apt','${unit.id}')">Mieterhöhung</a> · <a href="#" onclick="event.preventDefault();ccMhUnlock(this)">Correct</a></span>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Nebenkosten \u20ac/mo</span>
    <input type="number" data-cc-num="2" id="rf-nk-${rid}" value="${nk}" placeholder="${liveP.nebenkosten ?? ''}"
      oninput="_rntUpdateWarm('${rid}')"/>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Warmmiete</span>
    <div class="tn-rf-derived" id="rf-warm-${rid}">${warm !== '' ? _rntFmtEUR(warm) : '\u2014'}</div>
  </div>${fromRow}
  <!-- Kaution Soll: only in the Kaution section -->
  <div class="tn-rf-save-row" style="grid-column:1/-1;justify-content:space-between;align-items:center">
    <span class="tn-rf-hint" style="margin:0">Gilt ab leer = aktuelle Miete korrigieren · Datum = neue Miete ab diesem Tag</span>
    <div style="display:flex;gap:6px">
      <button class="tn-btn tn-btn-sm" onclick="_rntToggleRentEdit('${rid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary cc-save" onclick="_rntSaveRent('${rid}','${tid}','apt','${unit.id}')">
        Save
      </button>
    </div>
  </div>
</div>`;
  } else {
    const liveP = _rntPkPricing(unit.id);
    const miete = cur ? cur.kalt : '';

    return `
<div class="tn-rent-form" id="rform-${rid}" style="display:none">
  <div class="tn-rf">
    <span class="tn-flbl">Parkmiete \u20ac/mo</span>
    <input type="number" data-cc-num="2" id="rf-kalt-${rid}" value="${miete}" placeholder="${liveP.miete ?? ''}" readonly data-mh-lock/>
    <span class="tn-rf-hint" style="margin:3px 0 0">Raise it with <a href="#" onclick="event.preventDefault();_rntSheet('staffel','${rid}','${tid}','pk','${unit.id}')">Mieterhöhung</a> · <a href="#" onclick="event.preventDefault();ccMhUnlock(this)">Correct</a></span>
  </div>${fromRow}
  <!-- Kaution Soll: only in the Kaution section -->
  <div class="tn-rf-save-row" style="grid-column:1/-1;justify-content:space-between;align-items:center">
    <span class="tn-rf-hint" style="margin:0">Gilt ab leer = korrigieren · Datum = neue Miete</span>
    <div style="display:flex;gap:6px">
      <button class="tn-btn tn-btn-sm" onclick="_rntToggleRentEdit('${rid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary cc-save" onclick="_rntSaveRent('${rid}','${tid}','parking','${unit.id}')">
        Save
      </button>
    </div>
  </div>
</div>`;
  }
}


/* ── PROFILE SECTION ── */

/* ── Tenancy in time: current (moved in) and next (signed, moves in later) ── */
function _ccTodayIso() { const d = new Date(); const p = n => String(n).padStart(2,'0'); return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()); }
function _ccIso(v) { if (!v) return ''; const s = String(v).trim(); const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? m[3] + '-' + m[2] + '-' + m[1] : s.slice(0, 10); }
function _ccPickTenancy(actives) {
  const t = _ccTodayIso();
  const cur = actives.filter(r => !r.mietbeginn || _ccIso(r.mietbeginn) <= t).sort((a, b) => _ccIso(b.mietbeginn).localeCompare(_ccIso(a.mietbeginn)))[0] || null;
  const next = actives.filter(r => r.mietbeginn && _ccIso(r.mietbeginn) > t).sort((a, b) => _ccIso(a.mietbeginn).localeCompare(_ccIso(b.mietbeginn)))[0] || null;
  return { current: cur, next };
}

/* Move-in is required; overlapping tenancies on one unit need a confirmation */
function _ccTenancyOk(container, attr, p, sameUnit, selfId, btn, nameOf) {
  const reset = () => { if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; } };
  if (!p.mietbeginn) {
    const inp = container && container.querySelector('[' + attr + '="mietbeginn"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); inp.placeholder = 'Move-in required'; }
    reset(); return false;
  }
  const a1 = _ccIso(p.mietbeginn), a2 = p.mietende ? _ccIso(p.mietende) : '9999-12-31';
  const hit = (sameUnit || []).find(o => o.id !== selfId && o.status !== 'archived' && o.mietbeginn &&
    _ccIso(o.mietbeginn) <= a2 && (o.mietende ? _ccIso(o.mietende) : '9999-12-31') >= a1);
  if (hit) {
    const nm = nameOf(hit) || 'another tenant';
    const ok = confirm('This tenancy overlaps with ' + nm + ' on the same unit.\n\nFor a renewal, keep the existing tenant and extend it instead of adding a new one.\n\nSave anyway?');
    if (!ok) { reset(); return false; }
  }
  return true;
}

/* ── TENANCY (3b): Contract end · Renew (Casa 1-year contracts) · Record move-out ──
   Contract end ≠ move-out: the contract can end and be renewed with the same tenant;
   only a move-out makes the tenant former and the unit vacant (automatic, at night). */
function _ccHasVE(list) { return (list || []).some(r => r && Object.prototype.hasOwnProperty.call(r, 'vertragsende')); }
function _ccAddDaysIso(iso, n) { const d = new Date(_ccIso(iso) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function _ccAddYearIso(iso) { const d = new Date(_ccIso(iso) + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); }
function _ccFmtD(iso) { const s = _ccIso(iso); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
function _ccPanelClose(secId) { document.getElementById(secId)?.querySelector('.cc-inline-panel')?.remove(); }
function _ccPanelOpen(secId, title, bodyHtml, onSave) {
  const sec = document.getElementById(secId); if (!sec) return;
  _ccPanelClose(secId);
  sec.insertAdjacentHTML('beforeend', `<div class="cc-inline-panel">
    <div class="cc-inline-head"><span class="tn-sec-lbl">${title}</span></div>
    ${bodyHtml}
    <div class="cc-inline-slot"><button type="button" class="tn-btn tn-btn-sm" data-cc="cancel">Cancel</button>
      <button type="button" class="tn-btn tn-btn-primary" data-cc="save">Save</button></div></div>`);
  const p = sec.querySelector('.cc-inline-panel');
  p.querySelector('[data-cc="cancel"]').onclick = () => p.remove();
  p.querySelector('[data-cc="save"]').onclick = async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = '…';
    const ok = await onSave(p);
    if (ok === false) { b.disabled = false; b.textContent = 'Save'; return; }
    p.remove(); if (typeof ccSavedToast === 'function') ccSavedToast();
  };
  p.querySelector('input')?.focus();
}

/* ── 3c · Miete timeline: every rent the tenancy had / will have (read-only) ── */
function _ccRentTimelineHTML(app, rec, fmtEUR) {
  if (!rec || typeof ccRpFor !== 'function') return '';
  const list = ccRpFor(app, rec.id);
  if (list.length < 2) return '';
  const today = _ccTodayIso();
  let curIdx = -1; list.forEach((p, i) => { if (_ccIso(p.valid_from) <= today) curIdx = i; });
  const kind = { migrated: 'Start', manual: 'Korrektur', renewal: 'Verlängerung', staffel: 'Staffel', index: 'Index', nk: 'NK-Anpassung' };
  const rows = list.slice().reverse().map((p, ri) => {
    const i = list.length - 1 - ri, fut = _ccIso(p.valid_from) > today;
    const amt = p.mode === 'pauschal' ? fmtEUR(p.pauschale) + ' pauschal'
      : fmtEUR(p.kaltmiete) + ' + ' + fmtEUR(p.nebenkosten) + ' NK';
    return `<div class="cc-tl-row${i === curIdx ? ' is-cur' : ''}${fut ? ' is-fut' : ''}">
      <span class="cc-tl-date">ab ${_ccFmtD(p.valid_from)}</span>
      <span class="cc-tl-amt">${amt}</span>
      <span class="cc-tl-kind">${fut ? 'geplant · ' : ''}${kind[p.kind] || p.kind || ''}</span></div>`;
  }).join('');
  return `<details class="cc-tl"><summary>Rent history · ${list.length} entries</summary>${rows}</details>`;
}
function _ccNextTenantHTML(rec, name, fmtDate, openFn) {
  if (!rec) return '';
  return `<div class="cc-next-tenant" onclick="${openFn}('${rec.id}')">
    <span class="cc-next-tenant__lbl">Next tenant</span>
    <span class="cc-next-tenant__name">${name}</span>
    <span class="cc-next-tenant__date">from ${fmtDate(rec.mietbeginn)}</span>
    <i class="ti ti-chevron-right" aria-hidden="true"></i>
  </div>`;
}

function _rntProfileSectionHTML(rid, type, unit, rec) {
  const isEmpty  = !rec || (!rec.first_name && !rec.last_name && !rec.email && !rec.mietbeginn);
  const startEdit = !rec || isEmpty;
  const email    = rec ? _rntEsc(rec.email || '') : '';
  const fullName = rec ? [rec.first_name, rec.last_name].filter(Boolean).join(' ') : '';
  const tid      = rec ? rec.id : '';

  const hasCt  = _rntHasCt(unit, type === 'apt');
  const ct     = rec ? rntContractType(rec) : null;
  const ctNext = (() => {
    if (!rec || !hasCt) return null;
    const day = _rntTypeDay(rec), now = rntContractType(rec);
    const nx = _rntTypedPeriods(rec).find(p => _ccIso(p.valid_from) > day && p.contract_type !== now);
    return nx ? { type: nx.contract_type, from: nx.valid_from } : null;
  })();
  const ctRead = ct ? _rntEsc(_rntContractLabel(ct)) + (ctNext ? ` <span class="tn-ct-next">\u2192 ${_rntContractLabel(ctNext.type)} ab ${_ccFmtD(ctNext.from)}</span>` : '')
                    : '<span class="muted">Not set</span>';
  // Contract end: Mietvertrag / Gewerbe / parking without an end date = unbefristet; a Kurzzeit always needs one
  const veMissing = !!(rec && hasCt && ct === 'kurzzeit' && !rec.vertragsende && !rec.mietende);
  const veHTML = !rec ? '' : veMissing ? '<span class="tn-ve-missing">Missing</span>'
    : (_rntFmtDate(rec.vertragsende) || (hasCt && ct === 'kurzzeit' ? '—' : 'unbefristet'));

  const has2 = !!(rec && (rec.first_name_2 || rec.last_name_2));
  const has3 = !!(rec && (rec.first_name_3 || rec.last_name_3));
  const fullName2 = rec ? [rec.first_name_2, rec.last_name_2].filter(Boolean).join(' ') : '';
  const fullName3 = rec ? [rec.first_name_3, rec.last_name_3].filter(Boolean).join(' ') : '';

  const readView = !rec ? '' : `
  <div class="tn-fg" id="pread-${rid}">
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <span class="tn-fval">${_rntEsc(fullName) || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <span class="tn-fval">${_rntEsc(rec.birthday||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <span class="tn-fval">${email || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <span class="tn-fval">${_rntEsc(rec.phone||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
      <span class="tn-fval">${_rntEsc(rec.address||'') || '<span class="muted">—</span>'}</span></div>
    ${has2 ? `
    <div class="tn-field tn-field-full" style="margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;"><span class="tn-flbl">Tenant 2</span></div>
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <span class="tn-fval">${_rntEsc(fullName2) || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <span class="tn-fval">${_rntEsc(rec.birthday_2||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <span class="tn-fval">${_rntEsc(rec.email_2||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <span class="tn-fval">${_rntEsc(rec.phone_2||'') || '<span class="muted">—</span>'}</span></div>
    ` : ''}
    ${has3 ? `
    <div class="tn-field tn-field-full" style="margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;"><span class="tn-flbl">Tenant 3</span></div>
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <span class="tn-fval">${_rntEsc(fullName3) || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <span class="tn-fval">${_rntEsc(rec.birthday_3||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <span class="tn-fval">${_rntEsc(rec.email_3||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <span class="tn-fval">${_rntEsc(rec.phone_3||'') || '<span class="muted">—</span>'}</span></div>
    ` : ''}
    <div class="tn-field tn-field-full" style="border-top:1px solid var(--cc-rule);margin-top:6px;padding-top:8px;">
      <div class="tn-fg">
        ${hasCt ? `<div class="tn-field tn-field-full"><span class="tn-flbl">Contract</span>
          <span class="tn-fval">${ctRead}</span></div>` : ''}
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <span class="tn-fval">${_rntFmtDate(rec.mietbeginn) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <span class="tn-fval ${rec.mietende ? '' : 'muted'}">${_rntFmtDate(rec.mietende) || 'open-ended'}</span></div>
        ${_ccHasVE(_rntRecords) ? `<div class="tn-field"><span class="tn-flbl">Contract end</span>
          <span class="tn-fval ${rec.vertragsende ? '' : 'muted'}">${veHTML}</span></div>` : ''}
      </div>
    </div>
  </div>`;

  const tenant2Block = `
  <div id="p2wrap-${rid}" class="tn-field-full" style="display:${has2 ? 'block' : 'none'};grid-column:1/-1;margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span class="tn-flbl">Tenant 2</span>
      <button type="button" class="tn-btn tn-btn-sm" onclick="_rntRemoveCoTenant('${rid}',2)">Remove</button>
    </div>
    <div class="tn-fg">
      <div class="tn-field"><span class="tn-flbl">Name</span>
        <input data-f="name_2" type="text" value="${_rntEsc(fullName2)}" placeholder="Full name"/></div>
      <div class="tn-field"><span class="tn-flbl">Birthday</span>
        <input data-f="birthday_2" type="text" value="${_rntEsc(rec ? rec.birthday_2||'' : '')}" placeholder="TT.MM.JJJJ"/></div>
      <div class="tn-field"><span class="tn-flbl">Email</span>
        <input data-f="email_2" type="email" value="${_rntEsc(rec ? rec.email_2||'' : '')}" placeholder="mieter@mail.de"/></div>
      <div class="tn-field"><span class="tn-flbl">Phone</span>
        <input data-f="phone_2" type="tel" value="${_rntEsc(rec ? rec.phone_2||'' : '')}" placeholder="+49 ..."/></div>
      <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
        <input data-f="address_2" type="text" value="${_rntEsc(rec ? rec.address_2||'' : '')}" placeholder="Street, City"/></div>
    </div>
  </div>`;

  const tenant3Block = `
  <div id="p3wrap-${rid}" class="tn-field-full" style="display:${has3 ? 'block' : 'none'};grid-column:1/-1;margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span class="tn-flbl">Tenant 3</span>
      <button type="button" class="tn-btn tn-btn-sm" onclick="_rntRemoveCoTenant('${rid}',3)">Remove</button>
    </div>
    <div class="tn-fg">
      <div class="tn-field"><span class="tn-flbl">Name</span>
        <input data-f="name_3" type="text" value="${_rntEsc(fullName3)}" placeholder="Full name"/></div>
      <div class="tn-field"><span class="tn-flbl">Birthday</span>
        <input data-f="birthday_3" type="text" value="${_rntEsc(rec ? rec.birthday_3||'' : '')}" placeholder="TT.MM.JJJJ"/></div>
      <div class="tn-field"><span class="tn-flbl">Email</span>
        <input data-f="email_3" type="email" value="${_rntEsc(rec ? rec.email_3||'' : '')}" placeholder="mieter@mail.de"/></div>
      <div class="tn-field"><span class="tn-flbl">Phone</span>
        <input data-f="phone_3" type="tel" value="${_rntEsc(rec ? rec.phone_3||'' : '')}" placeholder="+49 ..."/></div>
      <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
        <input data-f="address_3" type="text" value="${_rntEsc(rec ? rec.address_3||'' : '')}" placeholder="Street, City"/></div>
    </div>
  </div>`;

  const addTenantBtn = `
  <div class="tn-field-full" style="display:${has3 ? 'none' : 'block'};grid-column:1/-1;margin-top:4px;margin-bottom:4px;">
    <button type="button" id="paddco-${rid}" class="tn-btn tn-btn-sm" onclick="_rntAddCoTenant('${rid}')">
      <i class="ti ti-plus"></i> Add tenant
    </button>
  </div>`;

  // Phase 4 · new parking tenant who already rents an apartment → copy their details
  const copyOpts = (!rec && type !== 'apt')
    ? _rntRecords.filter(r => r.status === 'active' && r.apartment_id)
        .map(r => `<option value="${_rntEsc(r.id)}">${_rntEsc(_rntFullTenantNames(r))}</option>`).join('') : '';
  const copyRow = copyOpts ? `
    <div class="tn-field tn-field-full"><span class="tn-flbl">Copy details from</span>
      <select class="cc-copy-select" onchange="_rntCopyTenantInto('${rid}', this.value)"><option value="">— new person —</option>${copyOpts}</select></div>` : '';

  const editView = `
  <div class="tn-fg" id="pedit-${rid}" ${startEdit ? '' : 'style="display:none"'}>
    ${copyRow}
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <input data-f="name" type="text" value="${_rntEsc(fullName)}" placeholder="Full name"/></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <input data-f="birthday" type="text" value="${_rntEsc(rec ? rec.birthday||'' : '')}" placeholder="TT.MM.JJJJ"/></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <input data-f="email" type="email" value="${email}" placeholder="mieter@mail.de"/></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <input data-f="phone" type="tel" value="${_rntEsc(rec ? rec.phone||'' : '')}" placeholder="+49 ..."/></div>
    <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
      <input data-f="address" type="text" value="${_rntEsc(rec ? rec.address||'' : '')}" placeholder="Street, City"/></div>
    ${tenant2Block}
    ${tenant3Block}
    ${addTenantBtn}
    <div class="tn-field-full" style="grid-column:1/-1;border-top:1px solid var(--cc-rule);margin-top:6px;padding-top:8px;">
      <div class="tn-fg">
        ${hasCt ? `<div class="tn-field tn-field-full"><span class="tn-flbl">Contract</span>
          ${_rntCtSegHTML('data-f', ct || 'mietvertrag')}</div>` : ''}
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <input data-f="mietbeginn" type="text" value="${_rntFmtDate(rec ? rec.mietbeginn : '')}" placeholder="TT.MM.JJJJ"/></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <input data-f="mietende" type="text" value="${_rntFmtDate(rec ? rec.mietende : '')}" placeholder="TT.MM.JJJJ"/></div>
        ${_ccHasVE(_rntRecords) ? `<div class="tn-field"><span class="tn-flbl">Contract end</span>
          <input data-f="vertragsende" type="text" value="${_rntFmtDate(rec ? rec.vertragsende : '')}" placeholder="TT.MM.JJJJ"/></div>` : ''}
      </div>
    </div>
  </div>`;

  const unitId   = type === 'apt' ? unit.id : unit.id;
  const unitType = type;

  const allMails = rec ? [rec.email, rec.email_2, rec.email_3].filter(Boolean).map(m => _rntEsc(m)).join(',') : '';
  const footerRead = `
  <div class="tn-sec-footer-split" id="pfoot-read-${rid}" ${startEdit ? 'style="display:none"' : ''}>
    ${allMails ? `<button class="tn-btn tn-btn-sm" onclick="window.location.href='mailto:${allMails}'">
      <i class="ti ti-mail"></i> Email</button>` : ''}
    ${rec && rec.status === 'active' && hasCt && ct === 'kurzzeit' ? `<button class="tn-btn tn-btn-sm" onclick="ccfRenewOpen('${tid}')"><i class="ti ti-refresh"></i> Renew</button>` : ''}
    <div class="tn-spacer"></div>
    <button class="tn-btn tn-btn-sm" id="pedit-btn-${rid}" onclick="_rntToggleProfile('${rid}','${tid}')">
      <i class="ti ti-pencil"></i> Edit</button>
  </div>`;

  const footerEdit = `
  <div class="tn-sec-footer" id="pfoot-edit-${rid}" ${startEdit ? '' : 'style="display:none"'}>
    <div class="cc-slot">
    ${rec ? `<button class="tn-btn tn-btn-sm" onclick="_rntToggleProfile('${rid}','${tid}')">Cancel</button>` : ''}
    <button class="tn-btn tn-btn-primary cc-save${rec ? '' : ' cc-save--create'}"
      onclick="${rec
        ? `_rntSaveProfile('${rid}','${tid}','${unitType}','${unitId}')`
        : `_rntSaveNewTenant('${rid}','${unitType}','${unitId}')`}">
      Save</button>
    </div>
  </div>`;

  return `
<div class="tn-sec" id="psec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="margin-bottom:8px"><span class="tn-sec-lbl">Tenant</span></div>
    ${readView}
    ${editView}
  </div>
  ${footerRead}
  ${footerEdit}
</div>`;
}


/* ── DOCUMENTS SECTION ── */


/* ── KAUTION SECTION ── */
/* Kaution section — shared card (cc-kaution-card.js): one layout, five phases */
function _rntKautionHTML(rid, tid, ctx, rec) {
  return ccKautionSectionHTML('rnt', tid, ctx, rec || (tid ? _rntRecords.find(r => r.id === tid) : null));
}
ccKautionRegister('rnt', {
  // Kaution Soll lives only here (Kaution section) — fixed per tenancy
  saveSoll: async (tid, v) => {
    const rec = _rntRecords.find(r => r.id === tid); if (!rec || !sbL) return false;
    const before = rec.kaution_soll; rec.kaution_soll = v;
    const { error } = await sbL.from('rnt_tenant_records').update({ kaution_soll: v }).eq('id', tid);
    if (error) { rec.kaution_soll = before; alert('Could not save — ' + error.message); return false; }
    return true;
  },
  table: 'rnt_kaution', writeKey: 'rntk-', failLabel: 'rentals kaution',
  map:  () => _rntKaution,
  rec:  tid => _rntRecords.find(r => r.id === tid) || null,
  soll: rec => _rntKautionSollInfo(rec),
  fmt:  n => _rntFmtEUR(n),
  fmtDate: d => _rntFmtDate(d),
  saveAmounts: (tid, received, returned) => _rntSaveKaution(tid, received, returned),
  afterChange: tid => {
    _rntRefreshFormerBadges(tid);
    const r = _rntRecords.find(x => x.id === tid);
    if (r) _rntRefreshCardPills(r.apartment_id || r.parking_id);
  },
});


/* ── NK SECTION (apartments only) ── */
function _rntNKHTML(rid, tid, ctx) {
  if (!tid) {
    const sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
    return `<div class="${sec}" style="opacity:.45;pointer-events:none">
      <div class="tn-sec-body" style="padding-top:10px;padding-bottom:11px">
        <div style="margin-bottom:8px"><span class="tn-sec-lbl">NK-Abrechnungen</span></div>
        <p class="tn-empty">Save profile first.</p>
      </div></div>`;
  }

  // 3f · NK-Abrechnungen are made in Settlements — here read-only
  if (typeof ccNksSectionHTML === 'function') return ccNksSectionHTML(tid, ctx, _rntNK[tid] || [], _rntNkDue((_rntRecords || []).find(r => String(r.id) === String(tid))));
  const entries  = (_rntNK[tid] || []).slice().sort((a,b) => b.period.localeCompare(a.period));
  const open     = entries.filter(e => !e.paid);
  const settled  = entries.filter(e =>  e.paid);
  const sec      = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
  const openCount = open.length;

  const nkRow = (e) => {
    const created = !!(e.amount || e.document_url);
    const dotC = created ? 'tn-nd-act'  : 'tn-nd-off tap';
    const dotS = e.sent  ? 'tn-nd-done' : (created ? 'tn-nd-off tap' : 'tn-nd-off');
    const dotP = e.paid  ? 'tn-nd-done' : (e.sent  ? 'tn-nd-off tap' : 'tn-nd-off');
    const onC  = (!created) ? `onclick="_rntNkCreate('${e.id}')"` : '';
    const onS  = (created && !e.sent) ? `onclick="_rntNkMarkSent('${e.id}')"` : '';
    const onP  = (e.sent && !e.paid)  ? `onclick="_rntNkMarkPaid('${e.id}')"` : '';
    let info = '';
    if (!created) info = `<span style="color:var(--cc-stone);font-style:italic">Not created</span>`;
    else {
      info = `<span class="amt">${_rntFmtEUR(e.amount)}</span>`;
      if (e.sent && !e.paid) info += ` \u00b7 <span style="color:#854F0B;font-weight:500">unpaid</span>`;
      else if (e.paid)       info += ` \u00b7 <span style="color:#3B6D11">paid</span>`;
    }
    const createEditBtn = !created
      ? `<button class="tn-nk-btn tn-nk-btn-dark" onclick="_rntNkCreate('${e.id}')">
           <i class="ti ti-calculator"></i> Create</button>`
      : `<button class="tn-nk-btn" onclick="_rntNkCreate('${e.id}')">
           <i class="ti ti-calculator"></i> Edit</button>
         <button class="tn-nk-btn" onclick="_rntNkView('${e.id}')">
           <i class="ti ti-eye"></i> View</button>`;
    return `<div class="tn-nk-row" id="nkrow-${e.id}">
      <span class="tn-nk-period">${_rntEsc(e.period)}</span>
      <div class="tn-nk-dots">
        <div class="tn-nd ${dotC}" title="Created" ${onC}><i class="ti ti-file"></i></div>
        <div class="tn-nd ${dotS}" title="Sent"    ${onS}><i class="ti ti-send"></i></div>
        <div class="tn-nd ${dotP}" title="Paid"    ${onP}><i class="ti ti-check"></i></div>
      </div>
      <span class="tn-nk-info" id="nkinfo-${e.id}">${info}</span>
      <div class="tn-nk-btns">
        ${createEditBtn}
        <button class="tn-nk-btn tn-nk-btn-del" onclick="_rntDeleteNk('${e.id}','${tid}')">
          <i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  };

  const settledRow = (e) => `
    <div class="tn-nk-row" style="opacity:.5" id="nkrow-${e.id}">
      <span class="tn-nk-period">${_rntEsc(e.period)}</span>
      <div class="tn-nk-dots">
        <div class="tn-nd tn-nd-done"><i class="ti ti-file"></i></div>
        <div class="tn-nd tn-nd-done"><i class="ti ti-send"></i></div>
        <div class="tn-nd tn-nd-done"><i class="ti ti-check"></i></div>
      </div>
      <span class="tn-nk-info"><span class="amt">${_rntFmtEUR(e.amount)}</span> \u00b7 paid</span>
      <div class="tn-nk-btns">
        <button class="tn-nk-btn" onclick="_rntNkView('${e.id}')">
          <i class="ti ti-eye"></i> View</button>
        <button class="tn-nk-btn tn-nk-btn-del" onclick="_rntDeleteNk('${e.id}','${tid}')">
          <i class="ti ti-trash"></i></button>
      </div>
    </div>`;

  return `
<div class="${sec}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="tn-sec-lbl" style="flex:1">NK-Abrechnungen</span>
      ${openCount > 0
        ? `<span class="tnp tnp-amber">${openCount} open</span>`
        : (settled.length > 0 ? '<span class="tnp tnp-green">All done</span>' : '')}
    </div>
    ${open.map(nkRow).join('')}
    ${settled.map(settledRow).join('')}
    ${!open.length && !settled.length ? `<p class="tn-empty">No NK periods yet.</p>` : ''}
    <button class="tn-add-nk-btn" style="margin-top:8px" onclick="_rntAddNkPeriod('${tid}','${ctx}')">
      <i class="ti ti-plus"></i> Add NK period
    </button>
  </div>
</div>`;
}


/* ── CONTRACT TYPE (apartments) — same rule as Casa Castel ──
   Kurzzeit (befristet) is renewed, Mietvertrag (unbefristet) never. Gewerbe and parking
   keep their own fixed contract. Type on a day = latest rent-history entry with a type,
   else the type stored on the tenant.                                                    */
function _rntContractLabel(t) { return t === 'kurzzeit' ? 'Kurzzeit' : t === 'mietvertrag' ? 'Mietvertrag' : null; }
function _rntHasCt(unit, isApt) { return !!isApt && !!unit && unit.zimmer_type !== 'Gewerbefläche'; }
function _rntTypedPeriods(rec) {
  if (!rec || !rec.id || typeof ccRpFor !== 'function') return [];
  return ccRpFor('rentals', rec.id).filter(p => p.contract_type === 'mietvertrag' || p.contract_type === 'kurzzeit');
}
function _rntTypeDay(rec) {
  const today = typeof ccRpToday === 'function' ? ccRpToday() : _ccTodayIso();
  const mb = rec && rec.mietbeginn ? _ccIso(rec.mietbeginn) : '';
  return mb && mb > today ? mb : today;
}
function rntContractType(rec, iso) {
  if (!rec) return null;
  const per = typeof ccRpAt === 'function' ? ccRpAt(_rntTypedPeriods(rec), iso || _rntTypeDay(rec)) : null;
  return (per && per.contract_type) || rec.contract_type || null;
}
function _rntSyncTypePeriod(rec, type) {
  if (!rec || !type || !sbL || typeof ccRpUpdate !== 'function') return;
  const per = ccRpAt(_rntTypedPeriods(rec), _rntTypeDay(rec));
  if (!per || per.contract_type === type) return;
  const before = per.contract_type;
  per.contract_type = type;
  ccRpUpdate(sbL, per.id, { contract_type: type }).catch(err => { per.contract_type = before; _rntRender(); ccSaveFailed(err, 'contract type'); });
}
function _rntCtSegHTML(attr, value) {
  const v = value === 'kurzzeit' ? 'kurzzeit' : 'mietvertrag';
  const opt = (t, l) => `<button type="button" class="cc-seg__opt${v === t ? ' is-on' : ''}" role="radio" aria-checked="${v === t}" data-ct="${t}" onclick="_rntSetCt(this)">${l}</button>`;
  return `<div class="cc-seg tn-contract-toggle" role="radiogroup" aria-label="Contract">${opt('mietvertrag', 'Mietvertrag')}${opt('kurzzeit', 'Kurzzeit')}<input type="hidden" ${attr}="${attr === 'data-cc' ? 'ct' : 'contract_type'}" value="${v}"/></div>`;
}
function _rntSetCt(btn) {
  const seg = btn.closest('.cc-seg'); if (!seg) return;
  seg.querySelectorAll('.cc-seg__opt').forEach(o => { const on = o === btn; o.classList.toggle('is-on', on); o.setAttribute('aria-checked', on ? 'true' : 'false'); });
  const inp = seg.querySelector('input[type=hidden]'); if (inp) inp.value = btn.dataset.ct;
  const endWrap = seg.closest('.cc-inline-panel')?.querySelector('[data-cc="endwrap"]');
  if (endWrap) endWrap.style.display = btn.dataset.ct === 'mietvertrag' ? 'none' : '';
}

/* Renewals of a tenancy, oldest first: "1. Verlängerung ab 01.10.2026" (+ type if it switches) */
function _rntRenewalRows(rec) {
  if (!rec || !rec.id || typeof ccRpFor !== 'function') return [];
  const list = ccRpFor('rentals', rec.id).filter(p => p.kind === 'renewal');
  return list.map((p, i) => {
    const before = rntContractType(rec, ccRpAddDays(_ccIso(p.valid_from), -1));
    const label = (i + 1) + '. Verlängerung ab ' + _ccFmtD(p.valid_from)
      + ((p.contract_type && before && p.contract_type !== before) ? ' \u00b7 ' + _rntContractLabel(p.contract_type) : '');
    return { p, n: i + 1, key: 'verlaengerung_' + _ccIso(p.valid_from), label, last: i === list.length - 1 };
  });
}
/* Remove the latest renewal (saved by mistake): entry goes, Contract end back to the day before */
async function _rntRenewDelete(tid, pid) {
  const rec = _rntRecords.find(r => r.id === tid);
  const per = typeof ccRpFor === 'function' ? ccRpFor('rentals', tid).find(p => String(p.id) === String(pid)) : null;
  if (!rec || !per || !sbL) return;
  const prevEnd = ccRpAddDays(_ccIso(per.valid_from), -1);
  const n = _rntRenewalRows(rec).find(x => String(x.p.id) === String(pid))?.n || '';
  if (!confirm(`Remove the ${n}. Verlängerung ab ${_ccFmtD(per.valid_from)}?\n\nThe contract end goes back to ${_ccFmtD(prevEnd)}.`)) return;
  try { await ccRpDelete(sbL, per.id); } catch (e) { ccSaveFailed(e, 'remove renewal'); return; }
  const before = rec.vertragsende;
  rec.vertragsende = prevEnd;
  _rntRender();
  ccQueueWrite('rnt-' + tid, () => sbL.from('rnt_tenant_records').update({ vertragsende: prevEnd }).eq('id', tid))
    .then(({ error }) => { if (error) { rec.vertragsende = before; _rntRender(); ccSaveFailed(error, 'contract end'); } });
}
/* Renewal row → "Create": the matching generator in Apartments, filled in with this renewal */

/* Occupancy from the dates — the same rule as Casa Castel (ccOccupancyPlan).
   Apartments and parking; writes only what really changed. */
function _rntSyncOccupancy() {
  if (!sbL || typeof ccOccupancyPlan !== 'function') return;
  const recs = _rntLoadedOnce ? _rntRecords : (_rntActiveRecs || []);
  if (!recs.length) return;
  const today = _ccTodayIso();
  const run = (units, col, table) => {
    const list = units || [];
    const plan = ccOccupancyPlan(list.map(u => ({ key: u.id, vacant: !!u.vacant })), recs.filter(r => r[col]), r => r[col], today);
    plan.unitChanges.forEach(ch => {
      const u = list.find(x => x.id === ch.key); if (!u) return;
      const before = !!u.vacant; u.vacant = ch.vacant;
      ccQueueWrite('occ-' + ch.key, () => sbL.from(table).update({ vacant: ch.vacant }).eq('id', ch.key))
        .then(res => { if (res && res.error) { u.vacant = before; ccSaveFailed(res.error, 'occupancy'); } });
    });
    return plan;
  };
  const a = run(typeof appApartments !== 'undefined' ? appApartments : [], 'apartment_id', 'rentals_apartments');
  const k = run(typeof appParking    !== 'undefined' ? appParking    : [], 'parking_id',   'rentals_parking');
  [...new Set([...a.toFormer, ...k.toFormer])].forEach(rec => {
    rec.status = 'former';
    ccQueueWrite('rnt-' + rec.id, () => sbL.from('rnt_tenant_records').update({ status: 'former' }).eq('id', rec.id))
      .then(res => { if (res && res.error) { rec.status = 'active'; ccSaveFailed(res.error, 'tenant status'); } });
  });
  try { if (a.unitChanges.length && typeof _renderAptList === 'function' && document.getElementById('aptList')) { _renderAptList(); _updateAptSummary?.(); } } catch (e) {}
  try { if (k.unitChanges.length && typeof _renderPkList === 'function' && document.getElementById('pkList')) { _renderPkList(); _updatePkSummary?.(); } } catch (e) {}
}

/* ── NK VORAUSZAHLUNG SECTION (apartments only) ── */
function _rntNKVorausHTML(rid, aptId, ctx) {
  if (!aptId) return '';
  const who = (_rntRecords || []).find(r => String(r.id) === String(_rntActiveTenantId('apartment_id', aptId)));
  const mb  = who && who.mietbeginn ? _ccIso(who.mietbeginn) : '';
  // this tenancy's Änderungen only (linked to the tenant, or dated from the move-in)
  const entries = (_rntNKVoraus[aptId] || []).filter(x => !who || (x.tenant_id ? String(x.tenant_id) === String(who.id) : (!mb || String(x.effective_date).slice(0, 10) >= mb)));
  return ccNkvSheetHTML({ sec: ctx === 'modal' ? 'tn-msec' : 'tn-sec', rid, entries, cur: _rntNKVorausCurFor(aptId), fmtEUR: _rntFmtEUR,
    onAdd: `_rntNKVorausAdd('${aptId}','${rid}','${ctx}')`,
    onNotified: `_rntNKVorausMarkNotified('$ID','${aptId}','${rid}')`,
    onAdjusted: `_rntNKVorausMarkAdjusted('$ID','${aptId}','${rid}')`,
    onSkip: `_rntNkvSkip('$ID','${aptId}')`,
    onHistory: `_rntNKVorausOpenModal('${aptId}')` });
}
/* Skip an NK-Vorauszahlung change (the tenant keeps paying the previous amount) · tap again to apply */
async function _rntNkvSkip(id, aptId) {
  const e = (_rntNKVoraus[aptId] || []).find(x => String(x.id) === String(id)); if (!e || !sbL) return;
  const on = !e.ignored;
  const { error } = await sbL.from('rnt_nk_vorauszahlung_history').update({ ignored: on }).eq('id', id);
  if (error) { ccSaveFailed(error, 'NK-Vorauszahlung (SQL run?)'); return; }
  e.ignored = on;
  if (typeof ccSavedToast === 'function') ccSavedToast(on ? 'Change skipped' : 'Change applied again');
  _rntRender(); if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
}


/* ── NK VORAUSZAHLUNG VERLAUF MODAL ── */
function _rntNKVorausOpenModal(aptId) {
  const entries = (_rntNKVoraus[aptId] || []).slice();
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };
  const isFuture = (e) => new Date(e.effective_date) > today;

  const pillHTML = (e) => {
    const notPill = e.tenant_notified
      ? `<span class="tn-nkv-pill done"><i class="ti ti-mail"></i> Informed</span>`
      : `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkNotified('${e.id}','${aptId}','m')">
           <i class="ti ti-mail"></i> Informed?</button>`;
    const adjPill = e.tenant_adjusted
      ? `<span class="tn-nkv-pill done"><i class="ti ti-refresh"></i> Adjusted</span>`
      : (e.tenant_notified
          ? `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkAdjusted('${e.id}','${aptId}','m')">
               <i class="ti ti-refresh"></i> Adjusted?</button>`
          : `<span class="tn-nkv-pill pending" style="cursor:default;opacity:.4"><i class="ti ti-refresh"></i> Adjusted?</span>`);
    return notPill + adjPill;
  };

  const rows = entries.map(e => `
    <div class="tn-nkv-row" id="nkv-row-${e.id}" style="padding-left:16px;padding-right:16px">
      <div class="tn-nkv-top">
        ${isFuture(e)
          ? `<i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0"></i>`
          : `<i class="ti ti-check" style="font-size:13px;color:#3B6D11;flex-shrink:0"></i>`}
        <span class="tn-nkv-date">${isFuture(e) ? 'ab ' : ''}${fmtD(e.effective_date)}</span>
        <span class="tn-nkv-amount ${e.tenant_adjusted && !isFuture(e) ? 'past' : ''}">${_rntFmtEUR(e.amount)}</span>
      </div>
      <div class="tn-nkv-pills">${pillHTML(e)}</div>
    </div>`).join('');

  const apt = appApartments?.find(a => a.id === aptId);
  document.getElementById('rntNKVorausModalSub').textContent  = apt?.name || aptId;
  document.getElementById('rntNKVorausModalBody').innerHTML   = rows || `<p class="tn-empty" style="padding:12px 16px">Noch keine Einträge.</p>`;
  document.getElementById('rntNKVorausModal').classList.add('open');
}

function _rntNKVorausModalClose() { document.getElementById('rntNKVorausModal').classList.remove('open'); }
function _rntNKVorausModalOutside(e) { if (e.target === document.getElementById('rntNKVorausModal')) _rntNKVorausModalClose(); }

function _rntNKVorausAdd(aptId, rid, ctx) {
  // Same frame as every section: the form opens at the top, Cancel · Save in the slot
  const sec = document.getElementById(`nkv-sec-${rid}`);
  if (!sec) return;
  if (sec.querySelector('.tn-nkv-add-form')) { sec.querySelector('input[type=date]')?.focus(); return; }
  const body = sec.querySelector('.tn-sec-body');
  const form = document.createElement('div');
  form.className = 'tn-nkv-add-form cc-add-form';
  form.innerHTML = `
    <div class="cc-add-grid">
      <label class="cc-add-f"><span class="tn-flbl">Gültig ab</span><input type="date" id="nkv-add-date-${rid}" value=""/></label>
      <label class="cc-add-f"><span class="tn-flbl">NK-Vorauszahlung €</span><input type="number" data-cc-num="2" id="nkv-add-amount-${rid}" placeholder="0,00" step="0.01" min="0"/></label>
    </div>
    <div class="cc-add-slot">
      <button type="button" class="cc-add-btn" onclick="this.closest('.cc-add-form').remove()">Cancel</button>
      <button type="button" class="cc-add-btn is-primary" onclick="_rntNKVorausConfirmAdd('${aptId}','${rid}')">Save</button>
    </div>`;
  body.insertBefore(form, body.querySelector('.cc-sec-foot') || null);
  form.querySelector('input[type=date]').focus();
}

async function _rntNKVorausConfirmAdd__run(aptId, rid) {
  const date   = document.getElementById(`nkv-add-date-${rid}`)?.value?.trim();
  const amount = parseFloat(document.getElementById(`nkv-add-amount-${rid}`)?.value);
  if (!date || isNaN(amount) || amount <= 0) return;
  if (!sbL) return;
  const { data, error } = await ccRpInsertWithTenant(sbL, 'rnt_nk_vorauszahlung_history',
    { apartment_id: aptId, effective_date: date, amount, tenant_notified: false, tenant_adjusted: false },
    _rntActiveTenantId('apartment_id', aptId));
  if (error) { ccSaveFailed(error, 'NK Vorauszahlung'); return; }
  if (!_rntNKVoraus[aptId]) _rntNKVoraus[aptId] = [];
  _rntNKVoraus[aptId].unshift(data);
  _rntNKVoraus[aptId].sort((a,b) => b.effective_date.localeCompare(a.effective_date));
  _rntRender();
}

async function _rntNKVorausMarkNotified(id, aptId, rid) {
  if (!sbL) return;
  const today = ccTodayISO();
  const { error } = await sbL.from('rnt_nk_vorauszahlung_history')
    .update({ tenant_notified: true, notified_date: today }).eq('id', id);
  if (error) { ccSaveFailed(error, 'NK Vorauszahlung'); return; }
  const entry = (_rntNKVoraus[aptId] || []).find(e => e.id === id);
  if (entry) { entry.tenant_notified = true; entry.notified_date = today; }
  _rntRenderNKVorausRow(id, aptId, rid);
}

async function _rntNKVorausMarkAdjusted(id, aptId, rid) {
  if (!sbL) return;
  const today = ccTodayISO();
  const { error } = await sbL.from('rnt_nk_vorauszahlung_history')
    .update({ tenant_adjusted: true, adjusted_date: today }).eq('id', id);
  if (error) { ccSaveFailed(error, 'NK Vorauszahlung'); return; }
  const entry = (_rntNKVoraus[aptId] || []).find(e => e.id === id);
  if (entry) { entry.tenant_adjusted = true; entry.adjusted_date = today; }
  _rntRender();
}

function _rntRenderNKVorausRow(id, aptId, rid) {
  const row   = document.getElementById('nkv-row-' + id);
  if (!row) { _rntRender(); return; }
  const entry = (_rntNKVoraus[aptId] || []).find(e => e.id === id);
  if (!entry) { _rntRender(); return; }
  const notPill = entry.tenant_notified
    ? `<span class="tn-nkv-pill done"><i class="ti ti-mail"></i> Informed</span>`
    : `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkNotified('${id}','${aptId}','${rid}')">
         <i class="ti ti-mail"></i> Informed?</button>`;
  const adjPill = entry.tenant_adjusted
    ? `<span class="tn-nkv-pill done"><i class="ti ti-refresh"></i> Adjusted</span>`
    : (entry.tenant_notified
        ? `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkAdjusted('${id}','${aptId}','${rid}')">
             <i class="ti ti-refresh"></i> Adjusted?</button>`
        : `<span class="tn-nkv-pill pending" style="cursor:default;opacity:.4"><i class="ti ti-refresh"></i> Adjusted?</span>`);
  const pillsEl = row.querySelector('.tn-nkv-pills');
  if (pillsEl) pillsEl.innerHTML = notPill + adjPill;
}


/* ── STAFFELMIETE SECTION (apartments + parking) ── */
function _rntStaffelHTML(rid, aptId, tid) {
  if (!aptId) return '';
  const entries = _rntOwnSteps(aptId, tid);
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };

  const current = entries.find(e => new Date(e.effective_date) <= today) || null;
  const futureEntries = entries.filter(e => new Date(e.effective_date) > today);
  const next    = futureEntries.length ? futureEntries[futureEntries.length - 1] : null;

  const delBtn = (e) =>
    `<button class="tn-icon-btn" style="color:var(--cc-stone);flex-shrink:0" aria-label="Löschen"
       onclick="_rntStaffelDelete('${e.id}','${aptId}','${rid}')">
       <i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i>
     </button>`;

  const adjBtn = (e) => _rntStaffelPills(e, aptId);

  const nextRow = next ? `
    <div class="tn-nkv-row" id="sf-row-${next.id}">
      <div class="tn-nkv-top">
        <i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0" aria-hidden="true"></i>
        <span class="tn-nkv-date">from ${fmtD(next.effective_date)}</span>
        <span class="tn-nkv-amount${next.ignored ? ' tn-sf-ignored' : ''}">${_rntFmtEUR(next.amount)}</span>
        <span class="tnp tnp-gray">${_rntMhKind(next)}</span>
        ${delBtn(next)}
      </div>
      <div class="tn-nkv-pills">${adjBtn(next)}</div>
    </div>` : '';

  const curDisplay = current
    ? `<div class="tn-nkv-current">
        <i class="ti ti-trending-up" style="font-size:15px;color:var(--cc-stone)" aria-hidden="true"></i>
        <span class="tn-nkv-cur-amount${current.ignored ? ' tn-sf-ignored' : ''}">${_rntFmtEUR(current.amount)}&thinsp;/&thinsp;mo</span>
        <span class="tn-nkv-cur-since">since ${fmtD(current.effective_date)}</span>
        ${delBtn(current)}
      </div>
      <div class="tn-nkv-pills" style="margin:6px 0 2px">${adjBtn(current)}</div>`
    : (entries.length ? '' : `<p class="tn-empty">No Mieterhöhung planned.</p>`);

  // every step of this tenancy: upcoming · adjusted · skipped · start
  const all = entries.slice().sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)));
  const st = e => e.ignored ? ['tnp-gray', 'skipped'] : e.kind === 'start' ? ['tnp-gray', 'start'] : e.tenant_adjusted ? ['tnp-green', 'adjusted']
    : new Date(e.effective_date) > today ? ['tnp-amber', 'upcoming'] : ['tnp-red', 'open'];
  const list = all.length > 1 ? `<div class="tn-msec-lbl" style="margin:12px 0 4px">All Mieterhöhungen</div>` + all.map(e => {
      const s = st(e);
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:var(--cc-border);font-size:12.5px">
        <span style="flex:1;min-width:0;${e.ignored ? 'text-decoration:line-through;color:var(--cc-taupe)' : ''}">From ${fmtD(e.effective_date)} · ${_rntFmtEUR(e.amount)}</span>
        <span class="tnp tnp-gray">${_rntMhKind(e)}</span><span class="tnp ${s[0]}">${s[1]}</span></div>`; }).join('') : '';

  return `
<div class="tn-sec" id="sf-sec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span class="tn-sec-lbl" style="flex:1">Mieterhöhung</span>
      <button class="tn-btn tn-btn-sm" style="height:24px;padding:0 9px;font-size:10px"
        onclick="_rntStaffelOpenAdd('${aptId}','${rid}')">
        <i class="ti ti-plus" style="font-size:11px" aria-hidden="true"></i> Mieterhöhung
      </button>
    </div>
    ${curDisplay}
    ${nextRow}
    ${list}
  </div>
</div>`;
}

function _rntStaffelOpenAdd(aptId, rid) {
  const sec = document.getElementById(`sf-sec-${rid}`);
  if (sec) {
    if (sec.querySelector('.cc-add-form')) { sec.querySelector('#sf-add-date')?.focus(); return; }
    const body = sec.querySelector('.tn-sec-body');
    const form = document.createElement('div');
    form.className = 'cc-add-form';
    form.innerHTML = `
    <div class="cc-add-grid">
      <label class="cc-add-f"><span class="tn-flbl">From</span><input type="date" id="sf-add-date" value="${ccTodayPlusYearsISO(1)}"/></label>
      <label class="cc-add-f"><span class="tn-flbl">New Kaltmiete €</span><input type="number" data-cc-num="2" id="sf-add-amount" placeholder="0,00" step="0.01" min="0"/></label>
      <label class="cc-add-f"><span class="tn-flbl">Type</span><select id="sf-add-kind" class="cc-select">
        <option value="mieterhoehung">Mieterhöhung</option><option value="staffel">Staffel</option><option value="index">Index</option><option value="korrektur">Korrektur</option></select></label>
    </div>
    <div class="cc-add-slot">
      <button type="button" class="cc-add-btn" onclick="this.closest('.cc-add-form').remove()">Cancel</button>
      <button type="button" class="cc-add-btn is-primary" onclick="_rntStaffelConfirmAdd('${aptId}','${rid}')">Save</button>
    </div>`;
    body.insertBefore(form, body.querySelector('.cc-sec-foot') || null);
    form.querySelector('#sf-add-amount').focus();
    return;
  }
  return _rntStaffelOpenAdd__sheet(aptId, rid);
}
function _rntStaffelOpenAdd__sheet(aptId, rid) {
  _rntStaffelSetTitle('New Mieterhöhung');
  _rntStaffelVerlaufOpen = null;
  const apt = (typeof appApartments !== 'undefined' ? appApartments : []).find(a => a.id === aptId);
  const pk  = apt ? null : (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === aptId);
  const label = apt ? (apt.name || apt.adresse || 'Wohnung') : pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Einheit';
  document.getElementById('rntStaffelModalSub').textContent = label;
  document.getElementById('rntStaffelModalBody').innerHTML = `
    <div class="tn-msec-body" style="padding-top:14px;padding-bottom:4px">
      <div class="tn-fg" style="margin-bottom:14px">
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">From</span>
          <input type="date" id="sf-add-date" value="${ccTodayPlusYearsISO(1)}"/>
          <span class="tn-flbl" style="font-weight:300;margin-top:2px">The date the new Kaltmiete counts from</span>
        </div>
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">New Kaltmiete (€)</span>
          <input type="number" data-cc-num="2" id="sf-add-amount" placeholder="1.250,00" step="0.01" min="0"/>
        </div>
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">Type</span>
          <select id="sf-add-kind" class="cc-select"><option value="mieterhoehung">Mieterhöhung</option><option value="staffel">Staffel</option><option value="index">Index</option><option value="korrektur">Korrektur</option></select>
        </div>
      </div>
    </div>
    <div class="tn-sheet-footer">
      <button class="tn-btn tn-btn-ghost" style="flex:1;height:44px;font-size:13px"
        onclick="_rntStaffelModalClose()">Cancel</button>
      <button class="tn-btn tn-btn-primary cc-save cc-save--create" style="flex:1;height:44px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--cc-r)"
        onclick="_rntStaffelConfirmAdd('${aptId}','${rid}')">
        <i class="ti ti-check" style="font-size:14px" aria-hidden="true"></i> Save
      </button>
    </div>`;
  document.getElementById('rntStaffelModal').classList.add('open');
  setTimeout(() => document.getElementById('sf-add-date')?.focus(), 80);
}

/* The unit's current tenant (latest Einzug among active ones) — Staffel / NK steps belong to them (B6) */
function _rntActiveTenantId(col, unitId) {
  const t = (_rntRecords || []).filter(r => String(r[col]) === String(unitId) && r.status === 'active')
    .sort((a, b) => String(ccRpIso(b.mietbeginn)).localeCompare(String(ccRpIso(a.mietbeginn))))[0];
  return t ? t.id : null;
}

async function _rntStaffelConfirmAdd__run(aptId, rid) {
  const date   = document.getElementById('sf-add-date')?.value?.trim();
  const amount = parseFloat(document.getElementById('sf-add-amount')?.value);
  if (!date || isNaN(amount) || amount <= 0) { _rntStaffelAddError(!date, isNaN(amount) || amount <= 0); return; }
  if (!sbL) return;
  const kind = document.getElementById('sf-add-kind')?.value || 'mieterhoehung';
  let { data, error } = await ccRpInsertWithTenant(sbL, 'rnt_staffelmiete_history',
    { apartment_id: aptId, effective_date: date, amount, tenant_adjusted: false, kind },
    _rntActiveTenantId('apartment_id', aptId));
  if (error && /kind/i.test(error.message || '')) ({ data, error } = await ccRpInsertWithTenant(sbL, 'rnt_staffelmiete_history',
    { apartment_id: aptId, effective_date: date, amount, tenant_adjusted: false }, _rntActiveTenantId('apartment_id', aptId)));
  if (error) { ccSaveFailed(error, 'Staffel'); return; }
  if (!_rntStaffel[aptId]) _rntStaffel[aptId] = [];
  _rntStaffel[aptId].push(data);
  _rntStaffel[aptId].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  _rntStaffelModalClose();
  _rntRender();
}

async function _rntPkStaffelConfirmAdd__run(pkId, rid) {
  const date   = document.getElementById('sf-add-date')?.value?.trim();
  const amount = parseFloat(document.getElementById('sf-add-amount')?.value);
  if (!date || isNaN(amount) || amount <= 0) { _rntStaffelAddError(!date, isNaN(amount) || amount <= 0); return; }
  if (!sbL) return;
  const kind = document.getElementById('sf-add-kind')?.value || 'mieterhoehung';
  let { data, error } = await ccRpInsertWithTenant(sbL, 'rnt_staffelmiete_history',
    { parking_id: pkId, effective_date: date, amount, tenant_adjusted: false, kind },
    _rntActiveTenantId('parking_id', pkId));
  if (error && /kind/i.test(error.message || '')) ({ data, error } = await ccRpInsertWithTenant(sbL, 'rnt_staffelmiete_history',
    { parking_id: pkId, effective_date: date, amount, tenant_adjusted: false }, _rntActiveTenantId('parking_id', pkId)));
  if (error) { ccSaveFailed(error, 'Staffel'); return; }
  if (!_rntStaffel[pkId]) _rntStaffel[pkId] = [];
  _rntStaffel[pkId].push(data);
  _rntStaffel[pkId].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  _rntStaffelModalClose();
  _rntRender();
}


/* ── STAFFELMIETE SECTION (parking clone) ── */
function _rntPkStaffelHTML(rid, pkId, tid) {
  if (!pkId) return '';
  if (typeof _rntStaffelHTML === 'function') return _rntStaffelHTML(rid, pkId, tid);   // one Mieterhöhung sheet for apartments + parking
  const entries = _rntOwnSteps(pkId, tid);
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };

  const current = entries.find(e => new Date(e.effective_date) <= today) || null;
  const futureEntries = entries.filter(e => new Date(e.effective_date) > today);
  const next    = futureEntries.length ? futureEntries[futureEntries.length - 1] : null;

  const delBtn = (e) =>
    `<button class="tn-icon-btn" style="color:var(--cc-stone);flex-shrink:0" aria-label="Löschen"
       onclick="_rntStaffelDelete('${e.id}','${pkId}','${rid}')">
       <i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i>
     </button>`;

  const adjBtn = (e) => _rntStaffelPills(e, pkId);

  const nextRow = next ? `
    <div class="tn-nkv-row" id="sf-row-${next.id}">
      <div class="tn-nkv-top">
        <i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0" aria-hidden="true"></i>
        <span class="tn-nkv-date">ab ${fmtD(next.effective_date)}</span>
        <span class="tn-nkv-amount${next.ignored ? ' tn-sf-ignored' : ''}">${_rntFmtEUR(next.amount)}</span>
        ${delBtn(next)}
      </div>
      <div class="tn-nkv-pills">${adjBtn(next)}</div>
    </div>` : '';

  const curDisplay = current
    ? `<div class="tn-nkv-current">
        <i class="ti ti-stairs-up" style="font-size:15px;color:var(--cc-stone)" aria-hidden="true"></i>
        <span class="tn-nkv-cur-amount${current.ignored ? ' tn-sf-ignored' : ''}">${_rntFmtEUR(current.amount)}&thinsp;/&thinsp;mo</span>
        <span class="tn-nkv-cur-since">seit ${fmtD(current.effective_date)}</span>
        ${delBtn(current)}
      </div>
      <div class="tn-nkv-pills" style="margin:6px 0 2px">${adjBtn(current)}</div>`
    : (entries.length ? '' : `<p class="tn-empty">Noch keine Staffelstufen eingetragen.</p>`);

  const verlaufLink = entries.length > 1
    ? `<button class="tn-nkv-verlauf-btn" onclick="_rntPkStaffelOpenVerlauf('${pkId}','${rid}')">Verlauf</button>`
    : '';

  return `
<div class="tn-sec" id="sf-sec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span class="tn-sec-lbl" style="flex:1">Staffelmiete</span>
      ${verlaufLink}
      <button class="tn-btn tn-btn-sm" style="height:24px;padding:0 9px;font-size:10px"
        onclick="_rntPkStaffelOpenAdd('${pkId}','${rid}')">
        <i class="ti ti-plus" style="font-size:11px" aria-hidden="true"></i> Add
      </button>
    </div>
    ${curDisplay}
    ${nextRow}
  </div>
</div>`;
}

function _rntPkStaffelOpenAdd(pkId, rid) {
  const sec = document.getElementById(`sf-sec-${rid}`);
  if (sec) {
    if (sec.querySelector('.cc-add-form')) { sec.querySelector('#sf-add-date')?.focus(); return; }
    const body = sec.querySelector('.tn-sec-body');
    const form = document.createElement('div');
    form.className = 'cc-add-form';
    form.innerHTML = `
    <div class="cc-add-grid">
      <label class="cc-add-f"><span class="tn-flbl">From</span><input type="date" id="sf-add-date" value="${ccTodayPlusYearsISO(1)}"/></label>
      <label class="cc-add-f"><span class="tn-flbl">New Kaltmiete €</span><input type="number" data-cc-num="2" id="sf-add-amount" placeholder="0,00" step="0.01" min="0"/></label>
      <label class="cc-add-f"><span class="tn-flbl">Type</span><select id="sf-add-kind" class="cc-select">
        <option value="mieterhoehung">Mieterhöhung</option><option value="staffel">Staffel</option><option value="index">Index</option><option value="korrektur">Korrektur</option></select></label>
    </div>
    <div class="cc-add-slot">
      <button type="button" class="cc-add-btn" onclick="this.closest('.cc-add-form').remove()">Cancel</button>
      <button type="button" class="cc-add-btn is-primary" onclick="_rntPkStaffelConfirmAdd('${pkId}','${rid}')">Save</button>
    </div>`;
    body.insertBefore(form, body.querySelector('.cc-sec-foot') || null);
    form.querySelector('#sf-add-amount').focus();
    return;
  }
  return _rntPkStaffelOpenAdd__sheet(pkId, rid);
}
function _rntPkStaffelOpenAdd__sheet(pkId, rid) {
  _rntStaffelSetTitle('New Mieterhöhung');
  _rntStaffelVerlaufOpen = null;
  const pk = (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === pkId);
  const label = pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Stellplatz';
  document.getElementById('rntStaffelModalSub').textContent = label;
  document.getElementById('rntStaffelModalBody').innerHTML = `
    <div class="tn-msec-body" style="padding-top:14px;padding-bottom:4px">
      <div class="tn-fg" style="margin-bottom:14px">
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">From</span>
          <input type="date" id="sf-add-date" value="${ccTodayPlusYearsISO(1)}"/>
          <span class="tn-flbl" style="font-weight:300;margin-top:2px">The date the new rent counts from</span>
        </div>
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">New rent (€)</span>
          <input type="number" data-cc-num="2" id="sf-add-amount" placeholder="110,00" step="0.01" min="0"/>
        </div>
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">Type</span>
          <select id="sf-add-kind" class="cc-select"><option value="mieterhoehung">Mieterhöhung</option><option value="staffel">Staffel</option><option value="index">Index</option><option value="korrektur">Korrektur</option></select>
        </div>
      </div>
    </div>
    <div class="tn-sheet-footer">
      <button class="tn-btn tn-btn-ghost" style="flex:1;height:44px;font-size:13px"
        onclick="_rntStaffelModalClose()">Cancel</button>
      <button class="tn-btn tn-btn-primary cc-save cc-save--create" style="flex:1;height:44px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--cc-r)"
        onclick="_rntPkStaffelConfirmAdd('${pkId}','${rid}')">
        <i class="ti ti-check" style="font-size:14px" aria-hidden="true"></i> Save
      </button>
    </div>`;
  document.getElementById('rntStaffelModal').classList.add('open');
  setTimeout(() => document.getElementById('sf-add-date')?.focus(), 80);
}

function _rntPkStaffelOpenVerlauf(pkId, rid) {
  _rntStaffelSetTitle('History');
  _rntStaffelVerlaufOpen = { fn: _rntPkStaffelOpenVerlauf, unitId: pkId, rid };   // refreshed in place after a tap
  const pk = (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === pkId);
  const label = pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Stellplatz';
  const entries = _rntOwnSteps(pkId).slice().reverse();
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };

  const rows = entries.map(e => {
    const isFuture = new Date(e.effective_date) > today;
    const adjTag = _rntStaffelPills(e, pkId);
    const amtCls = e.tenant_adjusted ? 'tn-nkv-amount past' : 'tn-nkv-amount';
    return `
      <div class="tn-nkv-row" style="padding:7px 16px">
        <div class="tn-nkv-top">
          <i class="ti ${isFuture ? 'ti-clock' : 'ti-circle-check'}" style="font-size:13px;color:${isFuture ? 'var(--cc-gold)' : 'var(--cc-green,#3B6D11)'};flex-shrink:0" aria-hidden="true"></i>
          <span class="tn-nkv-date">${isFuture ? 'ab' : 'seit'} ${fmtD(e.effective_date)}</span>
          <span class="${amtCls}">${_rntFmtEUR(e.amount)}</span>
          <button class="tn-icon-btn" style="margin-left:4px;color:var(--cc-stone)" aria-label="Löschen"
            onclick="_rntStaffelDelete('${e.id}','${pkId}','${rid}')">
            <i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i>
          </button>
        </div>
        <div class="tn-nkv-pills">${adjTag}</div>
      </div>`;
  }).join('');

  document.getElementById('rntStaffelModalSub').textContent = label;
  document.getElementById('rntStaffelModalBody').innerHTML = rows ||
    `<p style="padding:14px 16px;font-size:12px;color:var(--cc-stone)">Keine Einträge.</p>`;
  document.getElementById('rntStaffelModal').classList.add('open');
}

/* ── STAFFEL "ANGEPASST" — tap to set, tap again to undo ─────────
   Instant: the pill switches at once (card + Verlauf + header pill);
   the database write runs in the background (one retry). If it fails,
   the pill switches back and a red message says so. */
let _rntStaffelVerlaufOpen = null;   // { fn, unitId, rid } while the Verlauf sheet is open

/* Staffel "Save" with a missing field: red border + one short line under the fields */
function _rntStaffelAddError(noDate, noAmount) {
  const d = document.getElementById('sf-add-date'), a = document.getElementById('sf-add-amount');
  const clear = () => {
    [d, a].forEach(el => { if (el) el.style.borderColor = ''; });
    document.getElementById('sf-add-err')?.remove();
  };
  [[d, noDate], [a, noAmount]].forEach(([el, bad]) => {
    if (!el) return;
    el.style.borderColor = bad ? '#C4705A' : '';
    if (!el._sfErrWired) { el._sfErrWired = true; el.addEventListener('input', clear); el.addEventListener('change', clear); }
  });
  let m = document.getElementById('sf-add-err');
  if (!m) {
    m = document.createElement('div');
    m.id = 'sf-add-err';
    m.setAttribute('role', 'alert');
    m.style.cssText = 'font-size:11px;color:#A32D2D;margin:-6px 0 12px;';
    const fg = (a || d)?.closest('.tn-fg');
    if (fg) fg.insertAdjacentElement('afterend', m); else document.getElementById('rntStaffelModalBody')?.prepend(m);
  }
  m.textContent = noDate && noAmount ? 'Enter the date and the new rent.'
                : noDate ? 'Enter the date from which the new rent applies.'
                : 'Enter a rent above 0 €.';
  (noDate ? d : a)?.focus();
}

function _rntStaffelSetTitle(t) {
  const el = document.getElementById('rntStaffelModalTitle');
  if (el) el.textContent = t;
}

/* Adjusted? + Ignore — the two quick toggles of a Staffel step (saved on tap) */
function _rntStaffelPills(e, unitId) {
  return `<span class="tn-sf-pills" data-sf-pills="${e.id}">${e.ignored ? '' : _rntStaffelAdjPill(e, unitId)}${_rntStaffelIgnPill(e, unitId)}</span>`;
}
function _rntStaffelIgnPill(e, unitId) {
  const on = !!e.ignored;
  return `<button type="button" class="tn-nkv-pill ${on ? 'ignored' : 'pending'}" data-sf-ign="${e.id}"
    aria-pressed="${on}" title="${on ? 'Skipped — the tenant keeps paying the previous amount. Tap to apply again.' : 'Skip this step (keep the previous amount)'}"
    onclick="_rntStaffelToggleIgnored('${e.id}','${unitId}')">
    <i class="ti ti-ban" aria-hidden="true"></i> ${on ? 'Skipped' : 'Skip'}</button>`;
}
function _rntStaffelToggleIgnored(id, unitId) {
  const entry = (_rntStaffel[unitId] || []).find(e => e.id === id);
  if (!entry || !sbL) return;
  const prev = !!entry.ignored;
  entry.ignored = !prev;
  _rntStaffelRefreshUI(id, unitId);
  ccQueueWrite('staffel-ign:' + id, () => sbL.from('rnt_staffelmiete_history').update({ ignored: entry.ignored }).eq('id', id))
    .then(r => {
      if (!r || !r.error) { if (typeof ccSavedToast === 'function') ccSavedToast(entry.ignored ? 'Mieterhöhung skipped' : 'Mieterhöhung applied'); return; }
      entry.ignored = prev;
      _rntStaffelRefreshUI(id, unitId);
      ccSaveFailed(r.error, 'Skip Mieterhöhung');
    });
}

function _rntStaffelAdjPill(e, unitId) {
  const on = !!e.tenant_adjusted;
  return `<button type="button" class="tn-nkv-pill ${on ? 'done' : 'pending'}" data-sf-adj="${e.id}"
    aria-pressed="${on}" onclick="_rntStaffelToggleAdjusted('${e.id}','${unitId}')">
    <i class="ti ti-check" aria-hidden="true"></i> ${on ? 'Adjusted' : 'Adjusted?'}</button>`;
}

function _rntStaffelRefreshUI(id, unitId) {
  const entry = (_rntStaffel[unitId] || []).find(e => e.id === id);
  if (entry) document.querySelectorAll(`[data-sf-pills="${id}"]`).forEach(el => {
    el.outerHTML = _rntStaffelPills(entry, unitId);
  });
  if (entry) document.querySelectorAll(`[id="sf-row-${id}"] .tn-nkv-amount, .tn-nkv-current .tn-nkv-cur-amount`).forEach(el => {
    if (el.closest(`[id="sf-row-${id}"]`) || el.closest('.tn-nkv-current')?.nextElementSibling?.querySelector(`[data-sf-pills="${id}"]`))
      el.classList.toggle('tn-sf-ignored', !!entry.ignored);
  });
  // Verlauf sheet (amount colour follows the state)
  const v = _rntStaffelVerlaufOpen;
  if (v && v.unitId === unitId && document.getElementById('rntStaffelModal')?.classList.contains('open')) {
    const body = document.getElementById('rntStaffelModalBody');
    const top  = body ? body.scrollTop : 0;
    v.fn(v.unitId, v.rid);
    if (body) body.scrollTop = top;
  }
  // Card header pill ("Staffel … fällig" / "Staffel ab …")
  const isApt = (typeof appApartments !== 'undefined' ? appApartments : []).some(a => a.id === unitId);
  const rec   = (_rntRecords || []).find(r => (isApt ? r.apartment_id : r.parking_id) === unitId && r.status === 'active');
  const rid   = (isApt ? 'apt_' : 'pk_') + String(unitId).replace(/-/g, '').slice(0, 12);
  const hdr   = document.getElementById('hdr-kpill-' + rid);
  if (hdr && rec) _rntRefreshCardPills(unitId);
}

function _rntStaffelToggleAdjusted(id, unitId) {
  const entry = (_rntStaffel[unitId] || []).find(e => e.id === id);
  if (!entry || !sbL) return;
  const prev = { on: !!entry.tenant_adjusted, date: entry.adjusted_date ?? null };
  const on   = !prev.on;
  entry.tenant_adjusted = on;
  entry.adjusted_date   = on ? ccTodayISO() : null;
  _rntStaffelRefreshUI(id, unitId);   // instant

  const payload = { tenant_adjusted: on, adjusted_date: entry.adjusted_date };
  ccQueueWrite('staffel:' + id, () => sbL.from('rnt_staffelmiete_history').update(payload).eq('id', id))
    .then(r => {
      if (!r || !r.error) return;
      entry.tenant_adjusted = prev.on;
      entry.adjusted_date   = prev.date;
      _rntStaffelRefreshUI(id, unitId);
      ccSaveFailed(r.error, 'Mieterhöhung adjusted');
    });
}

// Old name, kept so nothing that still calls it breaks
function _rntStaffelMarkAdjusted(id, unitId) { _rntStaffelToggleAdjusted(id, unitId); }

async function _rntStaffelDelete(id, aptId, rid) {
  if (!sbL) return;
  const { error } = await sbL.from('rnt_staffelmiete_history').delete().eq('id', id);
  if (error) { ccSaveFailed(error, 'Staffel'); return; }
  if (_rntStaffel[aptId]) _rntStaffel[aptId] = _rntStaffel[aptId].filter(e => e.id !== id);
  _rntRender();
  // Verlauf sheet open? show the list without the deleted step
  const v = _rntStaffelVerlaufOpen;
  if (v && document.getElementById('rntStaffelModal')?.classList.contains('open')) v.fn(v.unitId, v.rid);
}

function _rntStaffelOpenVerlauf(aptId, rid) {
  _rntStaffelSetTitle('History');
  _rntStaffelVerlaufOpen = { fn: _rntStaffelOpenVerlauf, unitId: aptId, rid };   // refreshed in place after a tap
  const apt = (typeof appApartments !== 'undefined' ? appApartments : []).find(a => a.id === aptId);
  const pk  = apt ? null : (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === aptId);
  const label = apt ? (apt.name || apt.adresse || 'Wohnung') : pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Einheit';
  const entries = _rntOwnSteps(aptId).slice().reverse();
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };

  const rows = entries.map(e => {
    const isFuture = new Date(e.effective_date) > today;
    const adjTag = _rntStaffelPills(e, aptId);
    const amtCls = e.tenant_adjusted ? 'tn-nkv-amount past' : 'tn-nkv-amount';
    return `
      <div class="tn-nkv-row" style="padding:7px 16px">
        <div class="tn-nkv-top">
          <i class="ti ${isFuture ? 'ti-clock' : 'ti-circle-check'}" style="font-size:13px;color:${isFuture ? 'var(--cc-gold)' : 'var(--cc-green,#3B6D11)'};flex-shrink:0" aria-hidden="true"></i>
          <span class="tn-nkv-date">${isFuture ? 'ab' : 'seit'} ${fmtD(e.effective_date)}</span>
          <span class="${amtCls}">${_rntFmtEUR(e.amount)}</span>
          <button class="tn-icon-btn" style="margin-left:4px;color:var(--cc-stone)" aria-label="Löschen"
            onclick="_rntStaffelDelete('${e.id}','${aptId}','${rid}')">
            <i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i>
          </button>
        </div>
        <div class="tn-nkv-pills">${adjTag}</div>
      </div>`;
  }).join('');

  document.getElementById('rntStaffelModalSub').textContent = label;
  document.getElementById('rntStaffelModalBody').innerHTML = rows ||
    `<p style="padding:14px 16px;font-size:12px;color:var(--cc-stone)">Keine Einträge.</p>`;
  document.getElementById('rntStaffelModal').classList.add('open');
}

function _rntStaffelModalClose() { document.getElementById('rntStaffelModal').classList.remove('open'); }
function _rntStaffelModalOutside(e) { if (e.target === document.getElementById('rntStaffelModal')) _rntStaffelModalClose(); }


/* ── FORMER SECTION ── */
function _rntFormerSectionHTML(rid, type, unit, formerRecs, archivedRecs, bare) {
  const visible = formerRecs.filter(r =>  _rntFormerVisible(r));
  const hidden  = formerRecs.filter(r => !_rntFormerVisible(r) && !r.done);
  const showOld = !!_rntShowOlder[rid];
  const toShow  = showOld ? [...visible, ...hidden] : visible;

  const formerRow = rec => {
    const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '\u2014';
    const period = [_rntFmtDate(rec.mietbeginn), _rntFmtDate(rec.mietende)].filter(Boolean).join(' \u2013 ');
    const k      = _rntKaution[rec.id];
    const settled = k?.settled || false;
    const kept    = _rntKautionKept(rec.id);
    const hasK    = k && k.received > 0;
    const recv2   = k ? Number(k.received) : 0;
    const ret2    = k ? Number(k.returned) : 0;
    const sdate   = k?.settled_at ? _rntFmtDate(k.settled_at) : '';
    const kPill   = ccTnFormerKautionPill(k, _rntFmtEUR, _rntFmtDate);   // shared: remaining amount, not received
    return `<div class="tn-former-row" style="gap:6px">
      <div class="tn-former-info" onclick="_rntOpenModal('${rec.id}')" style="cursor:pointer;flex:1">
        <div class="tn-former-name">${_rntEsc(name)}</div>
        <div class="tn-former-period">${_rntEsc(period)}</div>
      </div>
      <div class="tn-former-pills">${kPill}</div>
      ${settled
        ? `<button class="tn-btn tn-btn-sm" onclick="_rntHideFormer('${rec.id}')" title="Archive">
             <i class="ti ti-eye-off" style="font-size:11px"></i></button>`
        : `<i class="ti ti-chevron-right" onclick="_rntOpenModal('${rec.id}')" style="font-size:13px;color:var(--cc-stone);cursor:pointer"></i>`}
    </div>`;
  };

  const arcRow = rec => {
    const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '\u2014';
    const period = [_rntFmtDate(rec.mietbeginn), _rntFmtDate(rec.mietende)].filter(Boolean).join(' \u2013 ');
    return `<div class="tn-arc-row">
      <div class="tn-arc-info">
        <div class="tn-arc-name">${_rntEsc(name)}</div>
        <div class="tn-arc-period">${_rntEsc(period)}</div>
      </div>
      <button class="tn-btn tn-btn-sm" onclick="_rntReopen('${rec.id}')">Reopen</button>
      <button class="tn-btn tn-btn-sm" onclick="_rntHideFormer('${rec.id}')">
        <i class="ti ti-eye-off" style="font-size:11px"></i></button>
    </div>`;
  };

  const arcId = `arc-${rid}`;
  const unitId = unit.id;

  return `
<div class="tn-sec">
  ${bare ? '<div style="height:8px"></div>' : `<div class="tn-sec-body" style="padding-top:10px;padding-bottom:0">
    <div style="margin-bottom:6px"><span class="tn-sec-lbl">Former tenants</span></div>
  </div>`}
  ${toShow.length ? toShow.map(formerRow).join('') : `<p class="tn-empty" style="padding:0 14px 6px">None with open business.</p>`}
  ${hidden.length ? `<button class="tn-show-older" onclick="_rntToggleOlder('${rid}')">
    <i class="ti ti-${showOld ? 'eye-off' : 'eye'}"></i>
    ${showOld ? 'Hide older' : `Show ${hidden.length} older`}
  </button>` : ''}
  <button class="tn-add-former-btn" onclick="_rntAddFormer('${type}','${unitId}')">
    <i class="ti ti-plus"></i> Add former tenant
  </button>
  ${archivedRecs.length ? `
  <button class="tn-arc-toggle" onclick="document.getElementById('${arcId}').classList.toggle('open')">
    <i class="ti ti-archive" style="font-size:13px"></i> Archived (${archivedRecs.length})
  </button>
  <div class="tn-arc-body" id="${arcId}">
    ${archivedRecs.map(arcRow).join('')}
  </div>` : ''}
</div>`;
}


/* ══════════════════════════════════════════════════════════════
   11. MODAL (former tenant details)
══════════════════════════════════════════════════════════════ */
function _rntOpenModal(tid) {
  const rec = _rntRecords.find(r => r.id === tid);
  if (!rec) return;
  _rntModalTid = tid;

  const name    = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '\u2014';
  const period  = [_rntFmtDate(rec.mietbeginn), _rntFmtDate(rec.mietende)].filter(Boolean).join(' \u2013 ');
  const allDone = _rntIsAllDone(tid);
  const isApt   = !!rec.apartment_id;

  document.getElementById('rntModalName').textContent = name;
  document.getElementById('rntModalSub').innerHTML =
    _rntEsc(period) +
    (allDone ? ` <span class="tnp tnp-green">All done</span>` : ` <span class="tnp tnp-amber">Open items</span>`);

  document.getElementById('rntModalBody').innerHTML   = _rntModalBodyHTML(rec, isApt);
  document.getElementById('rntModalFooter').innerHTML = _rntModalFooterHTML(rec, allDone);
  document.getElementById('rntModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}


/* Former tenant: their Mieterhöhungen stay with them as read-only info (reached · skipped · not reached) */
function _rntMhInfoHTML(rec, unitId) {
  const own = _rntOwnSteps(unitId, rec.id).slice().sort((a, b) => String(a.effective_date).localeCompare(String(b.effective_date)));
  if (!own.length) return '';
  const end = rec.mietende ? String(rec.mietende).slice(0, 10) : null;
  const rows = own.map(e => {
    const d = String(e.effective_date).slice(0, 10);
    const st = end && d > end ? ['tnp-gray', 'not reached'] : e.ignored ? ['tnp-gray', 'skipped'] : e.kind === 'start' ? ['tnp-gray', 'start'] : e.tenant_adjusted ? ['tnp-green', 'adjusted'] : ['tnp-gray', 'not adjusted'];
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:var(--cc-border);font-size:12.5px">
      <span style="flex:1;min-width:0">From ${_rntFmtDate(d)} · ${_rntFmtEUR(e.amount)}</span>
      <span class="tnp tnp-gray">${_rntMhKind(e)}</span><span class="tnp ${st[0]}">${st[1]}</span></div>`;
  }).join('');
  return `
  <div class="tn-msec">
    <div class="tn-msec-body" style="padding-top:10px">
      <div style="margin-bottom:4px"><span class="tn-msec-lbl">Mieterhöhungen</span></div>
      ${end ? `<p class="tn-empty" style="margin:0 0 4px">Moved out ${_rntFmtDate(end)} – these steps stay with this tenancy and count nowhere after the move-out.</p>` : ''}
      ${rows}
    </div>
  </div>`;
}
function _rntModalBodyHTML(rec, isApt) {
  const tid  = rec.id || '_draft';
  const full = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const dK   = rec.kaltmiete   != null ? Number(rec.kaltmiete)   : null;
  const dNK  = rec.nebenkosten != null ? Number(rec.nebenkosten) : null;
  const dKS  = rec.kaution_soll != null ? Number(rec.kaution_soll) : null;
  const unitId  = rec.apartment_id || rec.parking_id;
  const unitObj = isApt
    ? appApartments?.find(a => a.id === unitId)
    : appParking?.find(p => p.id === unitId);
  const unitLabel = unitObj?.name || '';

  const soll = _rntKautionSoll(rec);
  const mhInfo = rec.status !== 'active' && rec.id ? _rntMhInfoHTML(rec, unitId) : '';

  return `${mhInfo}
  <!-- PROFILE -->
  <div class="tn-msec" id="mprof-sec-${tid}">
    <div class="tn-msec-body" style="padding-top:10px">
      <div style="margin-bottom:8px"><span class="tn-msec-lbl">Profile</span></div>
      <!-- READ -->
      <div class="tn-fg" id="mprof-read-${tid}">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <span class="tn-fval">${_rntEsc(full) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <span class="tn-fval">${_rntEsc(rec.birthday||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <span class="tn-fval">${_rntEsc(rec.email||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <span class="tn-fval">${_rntEsc(rec.phone||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
          <span class="tn-fval">${_rntEsc(rec.address||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Contract end</span>
          <span class="tn-fval">${_rntFmtDate(rec.vertragsende) || '<span class="muted">—</span>'}</span></div>
        ${[2, 3].filter(n => rec['first_name_' + n] || rec['last_name_' + n]).map(n => `
        <div class="tn-field tn-field-full" style="margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;"><span class="tn-flbl">Tenant ${n}</span></div>
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <span class="tn-fval">${_rntEsc([rec['first_name_' + n], rec['last_name_' + n]].filter(Boolean).join(' '))}</span></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <span class="tn-fval">${_rntEsc(rec['email_' + n] || '') || '<span class="muted">—</span>'}</span></div>`).join('')}
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <span class="tn-fval">${_rntFmtDate(rec.mietbeginn) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <span class="tn-fval">${_rntFmtDate(rec.mietende) || '<span class="muted">—</span>'}</span></div>
        ${isApt ? `
        <div class="tn-field"><span class="tn-flbl">Kaltmiete</span>
          <span class="tn-fval">${dK != null ? _rntFmtEUR(dK) : '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Nebenkosten</span>
          <span class="tn-fval">${dNK != null ? _rntFmtEUR(dNK) : '<span class="muted">—</span>'}</span></div>
        ` : `
        <div class="tn-field"><span class="tn-flbl">Parkmiete</span>
          <span class="tn-fval">${dK != null ? _rntFmtEUR(dK) : '<span class="muted">—</span>'}</span></div>
        `}
        <div class="tn-field"><span class="tn-flbl">Kaution soll</span>
          <span class="tn-fval">${dKS != null
            ? _rntFmtEUR(dKS) + ' <span style="font-size:10px;color:var(--cc-stone)">(override)</span>'
            : soll != null ? _rntFmtEUR(soll) + ' <span style="font-size:10px;color:var(--cc-stone)">(auto)</span>'
            : '<span class="muted">—</span>'}</span></div>
      </div>
      <!-- EDIT -->
      <div class="tn-fg" id="mprof-edit-${tid}" style="display:none">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <input data-mf="name" type="text" value="${_rntEsc(full)}" placeholder="Full name"/></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <input data-mf="birthday" type="text" value="${_rntEsc(rec.birthday||'')}" placeholder="TT.MM.JJJJ"/></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <input data-mf="email" type="email" value="${_rntEsc(rec.email||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <input data-mf="phone" type="tel" value="${_rntEsc(rec.phone||'')}"/></div>
        <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
          <input data-mf="address" type="text" value="${_rntEsc(rec.address||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Contract end</span>
          <input data-mf="vertragsende" type="text" value="${_rntFmtDate(rec.vertragsende)}" placeholder="TT.MM.JJJJ"/></div>
        ${[2, 3].filter(n => rec['first_name_' + n] || rec['last_name_' + n]).map(n => `
        <div class="tn-field tn-field-full" style="margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;"><span class="tn-flbl">Tenant ${n}</span></div>
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <input data-mf="name_${n}" type="text" value="${_rntEsc([rec['first_name_' + n], rec['last_name_' + n]].filter(Boolean).join(' '))}"/></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <input data-mf="email_${n}" type="email" value="${_rntEsc(rec['email_' + n] || '')}"/></div>`).join('')}
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <input data-mf="mietbeginn" type="text" value="${_rntFmtDate(rec.mietbeginn)}"/></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <input data-mf="mietende" type="text" value="${_rntFmtDate(rec.mietende)}" placeholder="TT.MM.JJJJ"/></div>
        ${isApt ? `
        <div class="tn-field"><span class="tn-flbl">Kaltmiete</span>
          <input data-mf="kaltmiete" type="number" data-cc-num="2" value="${dK ?? ''}"/></div>
        <div class="tn-field"><span class="tn-flbl">Nebenkosten</span>
          <input data-mf="nebenkosten" type="number" data-cc-num="2" value="${dNK ?? ''}"/></div>
        ` : `
        <div class="tn-field"><span class="tn-flbl">Parkmiete</span>
          <input data-mf="kaltmiete" type="number" data-cc-num="2" value="${dK ?? ''}"/></div>
        `}
        <div class="tn-field" style="flex-direction:column;align-items:stretch;gap:4px">
          <span class="tn-flbl">Kaution Soll</span>
          <input id="mkaut-inp-${tid}" data-mf="kaution_soll" type="number" data-cc-num="2"
            value="${dKS ?? soll ?? ''}" placeholder="${soll ?? ''}"/>
          <span class="cck-soll-hint">Fest seit Einzug · ändert sich nicht mit der Miete</span>
        </div>
      </div>
    </div>
    <div class="tn-msec-footer" id="mprof-foot-read-${tid}">
      <button class="tn-btn tn-btn-sm" onclick="_rntToggleModalProfile('${tid}')">
        <i class="ti ti-pencil"></i> Edit</button>
    </div>
    <div class="tn-msec-footer" id="mprof-foot-edit-${tid}" style="display:none">
      <button class="tn-btn tn-btn-sm" onclick="_rntToggleModalProfile('${tid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary cc-save" onclick="_rntModalSaveProfile('${tid}')">
        Save</button>
    </div>
  </div>

  <!-- ZÄHLERSTÄNDE + DOCUMENTS (Unsigned | Signed) — same sections as the card -->
  ${typeof ccfDocsSectionHTML === 'function' ? ccfMetersSectionHTML(rec, 'modal') + ccfDocsSectionHTML(rec, 'modal') : ''}

  <!-- KAUTION -->
  ${_rntKautionHTML('m', tid, 'modal', rec)}

  <!-- NK (apartments only) -->
  ${isApt && !_rntAllPauschal(tid) ? _rntNKHTML('m', tid, 'modal') : ''}

  <!-- NK VORAUSZAHLUNG (apartments only) -->
  ${isApt && rec.apartment_id ? _rntNKVorausHTML('m', rec.apartment_id, 'modal') : ''}
  `;
}

function _rntModalFooterHTML(rec, allDone) {
  return `
    <button class="tn-btn tn-btn-ghost" onclick="_rntMarkDone('${rec.id}')">
      <i class="ti ti-archive"></i> Archive</button>
    <div class="tn-sheet-spacer"></div>
    <button class="tn-btn tn-btn-danger"
      style="${allDone ? '' : 'opacity:.35;pointer-events:none'}"
      onclick="_rntDeleteFormer('${rec.id}')">
      <i class="ti ti-trash"></i> Delete</button>
    <span style="font-size:10px;color:var(--cc-stone)">When all closed</span>`;
}

/* Snapshot of the edit fields → closing with changes asks instead of silently dropping them */
function _rntModalSnap(edit) { return JSON.stringify([...edit.querySelectorAll('input,select,textarea')].map(i => i.type === 'checkbox' ? i.checked : i.value)); }
function _rntToggleModalProfile(tid) {
  const read  = document.getElementById('mprof-read-'      + tid);
  const edit  = document.getElementById('mprof-edit-'      + tid);
  const fread = document.getElementById('mprof-foot-read-' + tid);
  const fedit = document.getElementById('mprof-foot-edit-' + tid);
  if (!read || !edit) return;
  const isEditing = read.style.display === 'none';
  if (!isEditing) edit.dataset.snap = _rntModalSnap(edit);
  read.style.display  = isEditing ? '' : 'none';
  edit.style.display  = isEditing ? 'none' : '';
  if (fread) fread.style.display = isEditing ? '' : 'none';
  if (fedit) fedit.style.display = isEditing ? 'none' : '';
}

function _rntCloseModal() {
  // Unsaved changes in the edit view → ask (instead of silently dropping them)
  if (_rntModalTid) {
    const ed = document.getElementById('mprof-edit-' + _rntModalTid);
    if (ed && ed.style.display !== 'none' && ed.dataset.snap && ed.dataset.snap !== _rntModalSnap(ed)) {
      const tid = _rntModalTid;
      if (confirm('Änderungen speichern?')) {
        ed.dataset.snap = '';                           // answered once — the save may close the view itself
        Promise.resolve(_rntModalSaveProfile(tid)).then(() => { if (_rntModalTid === tid) _rntCloseModal(); });
        return;
      }
    }
  }
  if (_rntModalTid) {
    const read  = document.getElementById('mprof-read-'      + _rntModalTid);
    const edit  = document.getElementById('mprof-edit-'      + _rntModalTid);
    const fread = document.getElementById('mprof-foot-read-' + _rntModalTid);
    const fedit = document.getElementById('mprof-foot-edit-' + _rntModalTid);
    if (edit && edit.style.display !== 'none') {
      if (read)  read.style.display  = '';
      if (edit)  edit.style.display  = 'none';
      if (fread) fread.style.display = '';
      if (fedit) fedit.style.display = 'none';
    }
  }
  const modal = document.getElementById('rntModal');
  if (modal) { modal._draft = null; modal.classList.remove('open'); }
  document.body.style.overflow = '';
  _rntModalTid = null;
}

function _rntModalOutside(e) {
  if (e.target === document.getElementById('rntModal')) _rntCloseModal();
}


/* ══════════════════════════════════════════════════════════════
   12. CARD INTERACTIONS
══════════════════════════════════════════════════════════════ */
function _rntToggleCard(rid) {
  const card = document.getElementById('tc-' + rid);
  if (!card) return;
  card.classList.toggle('open');
  if (card.classList.contains('open')) {
    _rntOpenCards.add('tc-' + rid);
    requestAnimationFrame(() => {
      const top  = card.getBoundingClientRect().top + window.scrollY;
      const navH = document.querySelector('.cc-header')?.offsetHeight || 100;
      window.scrollTo({ top: top - navH - 8, behavior: 'smooth' });
    });
  } else {
    _rntOpenCards.delete('tc-' + rid);
  }
}

function _rntToggleRentEdit(rid) {
  const bar  = document.getElementById('rbar-'  + rid);
  const form = document.getElementById('rform-' + rid);
  if (!bar || !form) return;
  const show = form.style.display === 'none' || !form.style.display;
  form.style.display = show ? 'grid' : 'none';
  bar.style.display  = show ? 'none' : 'flex';
}

function _rntUpdateWarm(rid) {
  const k  = parseFloat(document.getElementById('rf-kalt-' + rid)?.value) || 0;
  const nk = parseFloat(document.getElementById('rf-nk-'   + rid)?.value) || 0;
  const el = document.getElementById('rf-warm-' + rid);
  if (el) el.textContent = (k || nk) ? _rntFmtEUR(k + nk) : '\u2014';
}

function _rntToggleProfile(rid, tid) {
  const read  = document.getElementById('pread-'      + rid);
  const edit  = document.getElementById('pedit-'      + rid);
  const fread = document.getElementById('pfoot-read-' + rid);
  const fedit = document.getElementById('pfoot-edit-' + rid);
  if (!read || !edit) return;
  const editing = read.style.display === 'none';
  read.style.display  = editing ? '' : 'none';
  edit.style.display  = editing ? 'none' : '';
  if (fread) fread.style.display = editing ? '' : 'none';
  if (fedit) fedit.style.display = editing ? 'none' : '';
}

/* ── CO-TENANT (Mieter 2/3) ADD/REMOVE ── */
function _rntAddCoTenant(rid) {
  const w2 = document.getElementById('p2wrap-' + rid);
  const w3 = document.getElementById('p3wrap-' + rid);
  const addBtnWrap = document.getElementById('paddco-' + rid)?.parentElement;
  if (!w2) return;
  if (w2.style.display === 'none') {
    w2.style.display = 'block';
    document.querySelector(`#p2wrap-${rid} [data-f="name_2"]`)?.focus();
  } else if (w3 && w3.style.display === 'none') {
    w3.style.display = 'block';
    document.querySelector(`#p3wrap-${rid} [data-f="name_3"]`)?.focus();
  }
  if (w3 && w3.style.display !== 'none' && addBtnWrap) addBtnWrap.style.display = 'none';
}

function _rntRemoveCoTenant(rid, n) {
  const w = document.getElementById(`p${n}wrap-` + rid);
  if (!w) return;
  w.style.display = 'none';
  w.querySelectorAll('input').forEach(inp => inp.value = '');
  const addBtnWrap = document.getElementById('paddco-' + rid)?.parentElement;
  if (addBtnWrap) addBtnWrap.style.display = 'block';
}

function _rntToggleOlder(rid) {
  _rntShowOlder[rid] = !_rntShowOlder[rid];
  _rntRender();
}


/* ══════════════════════════════════════════════════════════════
   13. PROFILE SAVE
══════════════════════════════════════════════════════════════ */
function _rntCollectProfile(container, selector) {
  const get = f => container.querySelector(`[${selector}="${f}"]`)?.value?.trim() || '';
  const nameVal   = get('name');
  const parts     = nameVal.split(/\s+/);
  const firstName = parts.slice(0,-1).join(' ') || parts[0] || '';
  const lastName  = parts.length > 1 ? parts[parts.length-1] : '';

  const splitName = raw => {
    const p = raw.split(/\s+/).filter(Boolean);
    if (!p.length) return { first: '', last: '' };
    return { first: p.slice(0,-1).join(' ') || p[0] || '', last: p.length > 1 ? p[p.length-1] : '' };
  };
  const name2Raw = get('name_2');
  const name3Raw = get('name_3');
  const n2 = splitName(name2Raw);
  const n3 = splitName(name3Raw);

  return {
    first_name: firstName, last_name: lastName,
    email: get('email'), phone: get('phone'),
    birthday: get('birthday'), address: get('address'),
    mietbeginn: _rntParseDate(get('mietbeginn')),
    mietende:   _rntParseDate(get('mietende')),
    vertragsende: container.querySelector(`[${selector}="vertragsende"]`) ? _rntParseDate(get('vertragsende')) : undefined,
    contract_type: container.querySelector(`[${selector}="contract_type"]`) ? (get('contract_type') || null) : undefined,
    first_name_2: n2.first, last_name_2: n2.last,
    email_2: get('email_2'), phone_2: get('phone_2'), birthday_2: get('birthday_2'), address_2: get('address_2'),
    first_name_3: n3.first, last_name_3: n3.last,
    email_3: get('email_3'), phone_3: get('phone_3'), birthday_3: get('birthday_3'), address_3: get('address_3'),
    kaltmiete:   parseFloat(container.querySelector(`[${selector}="kaltmiete"]`)?.value)   || null,
    nebenkosten: parseFloat(container.querySelector(`[${selector}="nebenkosten"]`)?.value) || null,
    kaution_soll: (() => {
      const inp = container.querySelector(`[${selector}="kaution_soll"]`);
      if (!inp || inp.disabled) return null;
      return parseFloat(inp.value) || null;
    })(),
  };
}

/* The unit's price (Apartments / Parking) is always the starting rent of a new
   tenant — also for tenants entered for the past. You can change it by hand. */
function _rntNewIsCurrent(mietbeginn) {
  return true;
  if (typeof ccRpIso !== 'function') return true;
  const iso = ccRpIso(mietbeginn);
  return !iso || iso >= ccRpAddDays(ccRpToday(), -31);
}

async function _rntSaveNewTenant(rid, unitType, unitId) {
  if (!sbL) return;
  const sec = document.getElementById('pedit-' + rid);
  if (!sec) return;
  const btn = document.getElementById('pfoot-edit-' + rid)?.querySelector('.tn-btn-primary');
  if (btn) { btn.textContent = '\u2026'; btn.disabled = true; }

  const p = _rntCollectProfile(sec, 'data-f');
  if (!p.first_name && !p.last_name && !p.email) {
    const inp = sec.querySelector('[data-f="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }
  if (!_ccTenancyOk(sec, 'data-f', p, _rntRecords.filter(r => (unitType === 'apt' ? r.apartment_id : r.parking_id) === unitId), null, btn, r => _rntFullTenantNames(r))) return;

  const isApt   = unitType === 'apt';
  const mietende = p.mietende;
  const status   = (mietende && _rntIsPast(mietende)) ? 'former' : 'active';

  const liveKalt = isApt ? (_rntAptPricing(unitId).kaltmiete ?? null) : (_rntPkPricing(unitId).miete ?? null);
  const liveNK   = isApt ? (_rntAptPricing(unitId).nebenkosten ?? null) : null;

  const payload = {
    apartment_id: isApt ? unitId : null,
    parking_id:   isApt ? null   : unitId,
    status, contract_type: p.contract_type || 'mietvertrag',
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende,
    first_name_2: p.first_name_2 || null, last_name_2: p.last_name_2 || null,
    email_2: p.email_2 || null, phone_2: p.phone_2 || null, birthday_2: p.birthday_2 || null, address_2: p.address_2 || null,
    first_name_3: p.first_name_3 || null, last_name_3: p.last_name_3 || null,
    email_3: p.email_3 || null, phone_3: p.phone_3 || null, birthday_3: p.birthday_3 || null, address_3: p.address_3 || null,
    // Rent belongs to the tenancy: fixed at move-in (price now), changes via Staffel / NK or by hand
    // Unit price only for a current move-in (≤ 31 days ago or later); a tenant
    // entered for the past stays without rent until you type it (B3)
    kaltmiete:   p.kaltmiete   ?? (_rntNewIsCurrent(p.mietbeginn) ? liveKalt : null) ?? null,
    nebenkosten: isApt ? (p.nebenkosten ?? (_rntNewIsCurrent(p.mietbeginn) ? liveNK : null) ?? null) : null,
    // Kaution Soll is fixed at move-in: typed value, else calculated from the rent now
    kaution_soll: p.kaution_soll ?? (_rntKautionSollInfo({ apartment_id: isApt ? unitId : null, parking_id: isApt ? null : unitId,
      mietbeginn: p.mietbeginn, mietende }) || {}).amount ?? null,
  };

  const { data, error } = await sbL.from('rnt_tenant_records').insert(payload).select().single();
  if (error) {
    ccSaveFailed(error, 'new tenant');
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  // Occupied / vacant follows the dates (the reload runs the occupancy check)
  try {
    await _rntEnsureKaution(data.id);
    await _rntLoad();
  } catch (e) {
    console.warn('[rnt-tenants] create (post-insert):', e?.message || e);
    _rntToast('Gespeichert — bitte aktualisieren', true);
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
  }
}

// Manual "move to former": two-tap confirm on the button, then force status→former
// (keeps whatever move-out date is entered — even a future one — so the unit frees up now)
function _rntMoveToFormerConfirm(btn, rid, tid, unitType, unitId) {
  if (btn.dataset.armed === '1') {
    _rntSaveProfile(rid, tid, unitType, unitId, true);
    return;
  }
  const orig = btn.innerHTML;
  btn.dataset.armed = '1';
  btn.classList.add('tn-btn-armed');
  btn.innerHTML = '<i class="ti ti-check"></i> Confirm';
  setTimeout(() => {
    if (btn && btn.dataset.armed === '1') {
      btn.dataset.armed = '0';
      btn.classList.remove('tn-btn-armed');
      btn.innerHTML = orig;
    }
  }, 3500);
}

/* Fill a new tenant's form with an existing tenant's contact details (copy only) */
function _rntCopyTenantInto(rid, tid) {
  const src = _rntRecords.find(r => r.id === tid); const sec = document.getElementById('pedit-' + rid);
  if (!src || !sec) return;
  const set = (f, v) => { const i = sec.querySelector(`[data-f="${f}"]`); if (i && v != null) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } };
  set('name', [src.first_name, src.last_name].filter(Boolean).join(' '));
  set('email', src.email || ''); set('phone', src.phone || ''); set('birthday', src.birthday || ''); set('address', src.address || '');
}

/* Record move-out: the last day the tenant pays → then former + vacant (automatic) */
function _rntMoveOutOpen(rid, tid) {
  const rec = _rntRecords.find(r => r.id === tid); if (!rec) return;
  _ccPanelOpen('psec-' + rid, 'Record move-out', `
    <div class="tn-fg"><div class="tn-field"><span class="tn-flbl">Move-out (last day)</span>
      <input data-cc="date" type="text" placeholder="TT.MM.JJJJ" value="${_rntFmtDate(rec.vertragsende || '')}"/></div></div>
    <p class="cc-inline-hint">After this date the tenant becomes a former tenant and the unit is vacant — automatically.
    Then: Übergabe Auszug (Documents) · settle the Kaution · NK-Abrechnung in Settlements.</p>`, async p => {
    const iso = _rntParseDate(p.querySelector('[data-cc="date"]').value || '');
    if (!iso) { p.querySelector('[data-cc="date"]').style.borderBottomColor = '#C4705A'; return false; }
    const upd = { mietende: iso };
    if (_rntIsPast(iso)) upd.status = 'former';
    const { error } = await sbL.from('rnt_tenant_records').update(upd).eq('id', tid);
    if (error) { alert('Could not save — ' + error.message); return false; }
    Object.assign(rec, upd); _rntRender(); return true;
  });
}

async function _rntSaveProfile(rid, tid, unitType, unitId, forceFormer) {
  if (!sbL) return;
  const sec = document.getElementById('pedit-' + rid);
  if (!sec) return;
  const p   = _rntCollectProfile(sec, 'data-f');
  const rec = _rntRecords.find(r => r.id === tid);
  if (!p.first_name && !p.last_name && !p.email) {
    const inp = sec.querySelector('[data-f="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    return;
  }
  if (!_ccTenancyOk(sec, 'data-f', p, _rntRecords.filter(r => (unitType === 'apt' ? r.apartment_id : r.parking_id) === unitId), tid, null, r => _rntFullTenantNames(r))) return;

  // Fix 7: "To former" needs a move-out date (default today, editable) — a former tenant
  // without Auszug would otherwise keep a Soll until the next tenant moves in
  if (forceFormer && !p.mietende) {
    const today = new Date(), dflt = String(today.getDate()).padStart(2, '0') + '.' + String(today.getMonth() + 1).padStart(2, '0') + '.' + today.getFullYear();
    const v = prompt('Auszugsdatum (TT.MM.JJJJ):', dflt);
    if (v === null) return;
    const iso = _rntParseDate(String(v).trim());
    if (!iso) { if (typeof ccToast === 'function') ccToast('Bitte ein Datum im Format TT.MM.JJJJ eingeben', true); return; }
    p.mietende = iso;
    const inp = sec.querySelector('[data-f="mietende"]'); if (inp) inp.value = v.trim();
  }

  const isApt    = unitType === 'apt';
  const toFormer = !!forceFormer || !!(p.mietende && _rntIsPast(p.mietende) && rec?.status === 'active');
  const toActive = rec?.status === 'former' && (!p.mietende || !_rntIsPast(p.mietende));

  const update = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende: p.mietende,
    first_name_2: p.first_name_2 || null, last_name_2: p.last_name_2 || null,
    email_2: p.email_2 || null, phone_2: p.phone_2 || null, birthday_2: p.birthday_2 || null, address_2: p.address_2 || null,
    first_name_3: p.first_name_3 || null, last_name_3: p.last_name_3 || null,
    email_3: p.email_3 || null, phone_3: p.phone_3 || null, birthday_3: p.birthday_3 || null, address_3: p.address_3 || null,
    kaution_soll: p.kaution_soll ?? rec?.kaution_soll ?? null,   // a profile save never wipes the fixed Soll
  };
  if (p.vertragsende !== undefined) update.vertragsende = p.vertragsende || null;
  const ctBefore  = rec ? rntContractType(rec) : null;
  const ctChanged = !!(rec && p.contract_type && p.contract_type !== ctBefore);
  if (p.contract_type) update.contract_type = p.contract_type;
  // B20: the rent is only written when this form actually has rent fields
  if (sec.querySelector('[data-f="kaltmiete"]')) update.kaltmiete = p.kaltmiete ?? null;
  if (isApt && sec.querySelector('[data-f="nebenkosten"]')) update.nebenkosten = p.nebenkosten ?? null;

  if (toFormer) update.status = 'former';   // B4 / B12: status + Auszug only; occupancy follows the dates
  if (toActive) { update.status = 'active'; update.done = false; }   // the contract type stays with the tenancy

  // Direct save: apply in memory and re-render instantly; persist in the background (1 retry)
  const before = rec ? { ...rec } : null;
  if (rec) Object.assign(rec, update);
  if (ctChanged) _rntSyncTypePeriod(rec, p.contract_type);
  _rntSyncOccupancy();
  _rntEnsureKaution(tid);   // background; no-op when the tenant already has a kaution row
  _rntRender();

  ccQueueWrite('rnt-' + tid, () => sbL.from('rnt_tenant_records').update(update).eq('id', tid))
    .then(({ error }) => {
      if (!error) return;
      if (rec && before) Object.keys(update).forEach(k => { rec[k] = before[k]; });
      if (ctChanged && ctBefore) _rntSyncTypePeriod(rec, ctBefore);
      _rntRender();
      ccSaveFailed(error, 'rentals tenant profile');
    });
}

async function _rntSaveRent(rid, tid, unitType, unitId) {
  if (!sbL || !tid) return;
  const isApt = unitType === 'apt';
  const kaltV = parseFloat(document.getElementById('rf-kalt-' + rid)?.value);
  const nkV   = parseFloat(document.getElementById('rf-nk-' + rid)?.value);
  const kalt  = isNaN(kaltV) ? null : kaltV;
  const nk    = isApt ? (isNaN(nkV) ? null : nkV) : null;
  const from  = typeof ccRpIso === 'function' ? ccRpIso(document.getElementById('rf-from-' + rid)?.value) : '';
  const ksollInp = document.getElementById('rf-ksoll-' + rid);
  const ksoll = ksollInp ? (parseFloat(ksollInp.value) || null) : (_rntRecords.find(r => r.id === tid)?.kaution_soll ?? null);
  const rec = _rntRecords.find(r => r.id === tid);
  if (!rec) return;
  const beforeRent = { kaltmiete: rec.kaltmiete, nebenkosten: rec.nebenkosten, kaution_soll: rec.kaution_soll };
  const today = ccRpToday();

  // Rent history (rent_periods). Table missing → only the tenant record is saved.
  let histOk = true;
  try {
    if (from) {
      await ccRpSetRent(sbL, { app: 'rentals', rec, validFrom: from, mode: 'kalt_nk', kalt, nk,
                               kind: 'manual', source: 'tenant_form', legacyMode: 'kalt_nk' });
    } else {
      const per = ccRpAt(ccRpFor('rentals', rec.id), today);
      if (per) await ccRpUpdate(sbL, per.id, { mode: 'kalt_nk', kaltmiete: kalt, nebenkosten: nk, pauschale: null });
    }
  } catch (e) {
    histOk = false;
    if (from) ccToast('Miethistorie nicht verfügbar (SQL noch nicht ausgeführt) – Miete nur beim Mieter gespeichert', true);
    console.warn('[rnt-tenants] rent history:', e && e.message || e);
  }

  // The tenant record keeps the rent in effect today (a future rent waits in the history)
  const upd = { kaution_soll: ksoll };
  if (!from || from <= today || !histOk) { upd.kaltmiete = kalt; upd.nebenkosten = nk; }
  Object.assign(rec, upd);
  _rntRefreshKautionSoll(tid);
  _rntRefreshCardPills(rec.apartment_id || rec.parking_id);

  // Rent bar + form of this card redrawn in place (card stays open)
  const bar  = document.getElementById('rbar-' + rid);
  const form = document.getElementById('rform-' + rid);
  const unit = isApt ? (typeof appApartments !== 'undefined' ? appApartments.find(a => String(a.id) === String(unitId)) : null)
                     : (typeof appParking !== 'undefined' ? appParking.find(p => String(p.id) === String(unitId)) : null);
  if (bar && form && unit) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _rntRentBarHTML(rid, isApt ? 'apt' : 'parking', unit, rec) + _rntRentFormHTML(rid, isApt ? 'apt' : 'parking', unit, rec);
    bar.replaceWith(tmp.children[0]);
    form.replaceWith(tmp.children[0]);
  } else {
    _rntToggleRentEdit(rid);
  }

  ccQueueWrite('rnt-' + tid, () => sbL.from('rnt_tenant_records').update(upd).eq('id', tid))
    .then(({ error }) => {
      if (!error) return;
      Object.assign(rec, beforeRent);
      _rntRender();
      ccSaveFailed(error, 'rentals tenant rent');
    });
}

async function _rntModalSaveProfile(tid) {
  if (!sbL) return;
  const body = document.getElementById('rntModalBody');
  if (!body) return;

  const editGuard = document.getElementById('mprof-edit-' + tid);
  if (!editGuard || editGuard.style.display === 'none') {
    const kPfx = `modal_${(tid||'none').replace(/-/g,'').slice(0,8)}`;
    const recv = parseFloat(document.getElementById('kr-'   + kPfx)?.value);
    const ret  = parseFloat(document.getElementById('kret-' + kPfx)?.value);
    if (!isNaN(recv) && !isNaN(ret)) await _rntSaveKaution(tid, recv, ret);
    _rntCloseModal();
    return;
  }

  const p    = _rntCollectProfile(body, 'data-mf');
  const rec  = _rntRecords.find(r => r.id === tid);
  if (rec && !_ccTenancyOk(body, 'data-mf', p, _rntRecords.filter(r => rec.apartment_id ? r.apartment_id === rec.apartment_id : r.parking_id === rec.parking_id), tid, null, r => _rntFullTenantNames(r))) return;
  const update = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    mietbeginn: p.mietbeginn, mietende: p.mietende,
    kaution_soll: p.kaution_soll ?? rec?.kaution_soll ?? null,   // never wiped by a profile save
  };
  [2, 3].forEach(n => {   // co-tenants shown in the pop-up
    if (!body.querySelector(`[data-mf="name_${n}"]`)) return;
    update['first_name_' + n] = p['first_name_' + n] || null; update['last_name_' + n] = p['last_name_' + n] || null;
    update['email_' + n] = p['email_' + n] || null;
  });
  if (body.querySelector('[data-mf="address"]')) update.address = p.address || null;
  if (body.querySelector('[data-mf="vertragsende"]')) update.vertragsende = p.vertragsende || null;
  const hasRent = !!body.querySelector('[data-mf="kaltmiete"]');   // B20
  if (hasRent) { update.kaltmiete = p.kaltmiete ?? null; update.nebenkosten = p.nebenkosten ?? null; }
  if (hasRent && rec && typeof ccRpFor === 'function') {           // rent history follows the correction
    const lastDay = [ccRpIso(p.mietende) || ccRpToday(), ccRpToday()].sort()[0];
    const per = ccRpAt(ccRpFor('rentals', rec.id), lastDay);
    if (per && (Number(p.kaltmiete) || 0) + (Number(p.nebenkosten) || 0) !== (ccRpAmount(per) || {}).total)
      ccRpUpdate(sbL, per.id, { kaltmiete: p.kaltmiete ?? null, nebenkosten: p.nebenkosten ?? null })
        .catch(e => ccSaveFailed(e, 'rent history'));
  }

  const toActive = rec?.status === 'former' && (!p.mietende || !_rntIsPast(p.mietende));
  if (toActive) { update.status = 'active'; update.done = false; }   // the contract type stays with the tenancy

  const beforeRec = rec ? { ...rec } : null;
  if (rec) Object.assign(rec, update);
  _rntSyncOccupancy();

  ccQueueWrite('rnt-' + tid, () => sbL.from('rnt_tenant_records').update(update).eq('id', tid))
    .then(({ error }) => {
      if (!error) return;
      if (rec && beforeRec) Object.keys(update).forEach(k => { rec[k] = beforeRec[k]; });
      _rntRender();
      ccSaveFailed(error, 'tenant');
    });

  _rntCloseModal();
  _rntRender();
}


/* ══════════════════════════════════════════════════════════════
   14. KAUTION
══════════════════════════════════════════════════════════════ */
function _rntCalcKaution(pfx, tid) {
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const kept = recv - ret;
  const el   = document.getElementById('kk-' + pfx);
  if (el) { el.textContent = _rntFmtEUR(Math.max(0, kept)); el.className = 'tn-kc-val' + (kept > 0 ? ' gold' : ''); }
  const k       = tid ? _rntKaution[tid] : null;
  const settled = k?.settled || false;
  const st      = _rntKautionStatus(recv, ret, settled);
  const pill    = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }
  const saveBtn = document.getElementById('ksave-' + pfx);
  if (saveBtn) ccSaveSet(saveBtn, 'dirty');     // unsaved change → dark SAVE
  const setBtn = document.getElementById('kset-' + pfx);
  if (setBtn) setBtn.style.display = (recv > 0 && tid) ? '' : 'none';
}

async function _rntSaveKautionBtn(pfx, tid) {
  if (!sbL || !tid) return;
  const recv    = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret     = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const saveBtn = document.getElementById('ksave-' + pfx);
  _rntSaveKaution(tid, recv, ret);   // memory now, database in the background
  const k   = _rntKaution[tid];
  const st  = _rntKautionStatus(recv, ret, k?.settled || false);
  const pill = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }
  const _rec = _rntRecords.find(r => r.id === tid);
  if (_rec) {
    const _rid   = (_rec.apartment_id ? 'apt_' : 'pk_') + (_rec.apartment_id || _rec.parking_id).replace(/-/g,'').slice(0,12);
    _rntRefreshCardPills(_rec.apartment_id || _rec.parking_id);   // same rules as the first render — nothing gets dropped
  }
  if (saveBtn) ccSaveSet(saveBtn, 'saved');     // saved → grey ✓ SAVED until the next change
}

async function _rntSaveKaution(tid, received, returned) {
  if (!sbL) return;
  // Memory first (synchronously), so the card can update at once
  const k0 = _rntKaution[tid];
  const before = k0 ? { received: k0.received, returned: k0.returned } : null;
  if (k0) { k0.received = received; k0.returned = returned; }
  _rntRefreshFormerBadges(tid);
  if (_rntModalTid === tid) {
    const delBtn = document.getElementById('rntModalFooter')?.querySelector('.tn-btn-danger');
    if (delBtn) { const done = _rntIsAllDone(tid); delBtn.style.opacity = done ? '1' : '.35'; delBtn.style.pointerEvents = done ? 'auto' : 'none'; }
  }
  // Then the database (row created first if this tenant has none yet)
  if (!_rntKaution[tid]) await _rntEnsureKaution(tid);
  const k = _rntKaution[tid];
  if (!k?.id) return;
  k.received = received; k.returned = returned;
  const { error } = await ccQueueWrite('rntk-' + tid, () => sbL.from('rnt_kaution').update({ received, returned }).eq('id', k.id));
  if (error) {
    if (before) { k.received = before.received; k.returned = before.returned; }
    _rntRefreshFormerBadges(tid);
    ccSaveFailed(error, 'rentals kaution');
  }
}

async function _rntToggleSettle(pfx, tid) {
  if (!sbL || !tid) return;
  if (!_rntKaution[tid]) await _rntEnsureKaution(tid);
  const k = _rntKaution[tid];
  if (!k?.id) return;
  k.settled = !k.settled;

  // Snapshot the amounts the user typed at the moment of settling.
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;

  const upd = { settled: k.settled };
  if (k.settled) {
    // Record what was returned and the date it was settled.
    k.received = recv; k.returned = ret;
    k.settled_at = new Date().toISOString();
    upd.received = recv; upd.returned = ret; upd.settled_at = k.settled_at;
  } else {
    // Un-settling: clear the date, keep the amounts as-is.
    k.settled_at = null;
    upd.settled_at = null;
  }

  const btn = document.getElementById('kset-' + pfx);
  if (btn) {
    btn.innerHTML = `<i class="ti ti-check"></i> ${k.settled ? 'Settled' : 'Mark settled'}`;
    btn.className = `tn-btn ${k.settled ? 'tn-btn-done' : 'tn-btn-sm'}`;
  }
  const st   = _rntKautionStatus(recv, ret, k.settled);
  const pill = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }
  sbL.from('rnt_kaution').update(upd).eq('id', k.id)
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'Kaution settled'); _rntLoad(); } });
  _rntRefreshFormerBadges(tid);
  { const _r = _rntRecords.find(r => r.id === tid); if (_r) _rntRefreshCardPills(_r.apartment_id || _r.parking_id); }
}

async function _rntEnsureKaution(tid) {
  if (!sbL || _rntKaution[tid]) return;
  const { data } = await sbL.from('rnt_kaution')
    .insert({ tenant_id: tid, received:0, returned:0, settled:false })
    .select().single();
  if (data) _rntKaution[tid] = data;
}


/* ══════════════════════════════════════════════════════════════
   15. NK INTERACTIONS
══════════════════════════════════════════════════════════════ */
async function _rntAddNkPeriod(tid, ctx) {
  const scope  = (_rntModalTid === tid && ctx === 'modal')
    ? document.getElementById('rntModalBody') : document;
  const addBtn = scope?.querySelector(`.tn-add-nk-btn[onclick*="${tid}"]`);
  if (!addBtn) return;
  const wrap = document.createElement('div');
  wrap.className = 'tn-nk-add-form';
  wrap.innerHTML = `
    <input placeholder="e.g. 2025/26" maxlength="12" style="flex:1"/>
    <button class="tn-btn tn-btn-primary" style="flex-shrink:0">Add</button>
    <button class="tn-btn tn-btn-sm"      style="flex-shrink:0">Cancel</button>`;
  addBtn.style.display = 'none';
  addBtn.parentNode.insertBefore(wrap, addBtn);
  const inp = wrap.querySelector('input');
  inp.focus();
  wrap.querySelector('.tn-btn-primary').onclick = () => _rntConfirmAddNk(tid, inp, wrap, addBtn);
  wrap.querySelector('.tn-btn-sm').onclick = () => { wrap.remove(); addBtn.style.display = ''; };
}

async function _rntConfirmAddNk__run(tid, inp, wrap, addBtn) {
  const period = inp.value.trim();
  if (!period || !sbL) return;
  const { data, error } = await sbL.from('rnt_nk_entries')
    .insert({ tenant_id: tid, period, sent:false, paid:false }).select().single();
  if (error) { ccSaveFailed(error, 'NK period'); return; }
  if (!_rntNK[tid]) _rntNK[tid] = [];
  _rntNK[tid].push(data);
  if (_rntModalTid === tid) { _rntOpenModal(tid); } else { _rntRender(); }
}

function _rntNkCreate(nkId) { alert('NK calculator — coming soon.'); }
function _rntNkView(nkId) { alert('No document uploaded yet for this period.'); }

async function _rntNkMarkSent(nkId) {
  if (!sbL) return;
  const entry = Object.values(_rntNK).flat().find(e => e.id === nkId);
  if (!entry) return;
  entry.sent = true;
  await sbL.from('rnt_nk_entries').update({ sent: true }).eq('id', nkId);
  const tid = entry.tenant_id;
  if (_rntModalTid === tid) { _rntOpenModal(tid); } else { _rntRender(); }
}

async function _rntNkMarkPaid(nkId) {
  if (!sbL) return;
  const entry = Object.values(_rntNK).flat().find(e => e.id === nkId);
  if (!entry) return;
  entry.paid = true;
  await sbL.from('rnt_nk_entries').update({ paid: true }).eq('id', nkId);
  _rntRefreshFormerBadges(entry.tenant_id);
  const tid = entry.tenant_id;
  if (_rntModalTid === tid) { _rntOpenModal(tid); } else { _rntRender(); }
}

function _rntDeleteNk(nkId, tid) {
  const row = document.getElementById('nkrow-' + nkId);
  if (!row) return;
  const entry  = Object.values(_rntNK).flat().find(e => e.id === nkId);
  const period = entry?.period || 'this row';
  row.innerHTML = `
    <span style="font-size:12px;color:var(--cc-taupe);flex:1">Delete ${_rntEsc(period)}?</span>
    <div class="tn-nk-btns">
      <button class="tn-nk-btn tn-nk-btn-del" onclick="_rntConfirmDeleteNk('${nkId}','${tid}')">Confirm</button>
      <button class="tn-nk-btn" onclick="_rntRender()">Cancel</button>
    </div>`;
}

async function _rntConfirmDeleteNk(nkId, tid) {
  if (!sbL) return;
  const { error } = await sbL.from('rnt_nk_entries').delete().eq('id', nkId);
  if (error) { ccSaveFailed(error, 'delete NK period'); return; }
  if (_rntNK[tid]) _rntNK[tid] = _rntNK[tid].filter(e => e.id !== nkId);
  if (_rntModalTid === tid) { _rntOpenModal(tid); } else { _rntRender(); }
}


/* ══════════════════════════════════════════════════════════════
   16. DOCUMENTS
══════════════════════════════════════════════════════════════ */

async function _rntViewDoc(fileUrl, label, unitLabel) {
  if (!fileUrl || !sbL) return;
  // Temporary private link (5 min) → opens in the iPhone's own viewer / a new
  // browser tab on top of the app (Phase 1). No in-app viewer, no "PDF" step,
  // and the document is no longer passed through Google's online viewer.
  const { data, error } = await sbL.storage
    .from('rnt-tenant-documents').createSignedUrl(fileUrl, 300);
  const url = data?.signedUrl;
  if (!url) { _rntToast('Could not open document', true); return; }
  const title = label ? `${label}${unitLabel ? ' – ' + unitLabel : ''}` : 'Dokument';
  if (typeof ccOpenUrl === 'function') ccOpenUrl(url, title);
  else window.open(url, '_blank');
}



function _rntToast(msg, isError) {
  const ex = document.getElementById('rnt-toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.id = 'rnt-toast';
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


/* ══════════════════════════════════════════════════════════════
   17. FORMER TENANT MANAGEMENT
══════════════════════════════════════════════════════════════ */
function _rntAddFormer(unitType, unitId, pre) {
  const draft = {
    id: null,
    apartment_id: unitType === 'apt'     ? unitId : null,
    parking_id:   unitType === 'parking' ? unitId : null,
    status: 'former', contract_type: 'mietvertrag',
    first_name: null, last_name: null, email: null, phone: null,
    birthday: null, address: null,
    mietbeginn: (pre && pre.from) || null, mietende: (pre && pre.to) || null,
    kaltmiete: null, nebenkosten: null, kaution_soll: null,
  };
  _rntOpenModalDraft(draft);
}

function _rntOpenModalDraft(draft) {
  _rntModalTid = null;
  const isApt = !!draft.apartment_id;

  const unitId = draft.apartment_id || draft.parking_id;
  const unitObj = isApt
    ? appApartments?.find(a => a.id === unitId)
    : appParking?.find(p => p.id === unitId);

  document.getElementById('rntModalName').textContent = 'New former tenant';
  document.getElementById('rntModalSub').innerHTML =
    `<span class="tnp tnp-gray">${_rntEsc(unitObj?.name || unitId)}</span>`;

  document.getElementById('rntModalBody').innerHTML   = _rntModalBodyHTML(draft, isApt);
  { // Past tenant: an empty rent takes today's Soll — show it so it can be checked
    const sollK = isApt ? _rntAptPricing(draft.apartment_id).kaltmiete : _rntPkPricing(draft.parking_id).miete;
    const sollN = isApt ? _rntAptPricing(draft.apartment_id).nebenkosten : null;
    if (sollK != null) document.getElementById('rntModalBody').insertAdjacentHTML('afterbegin',
      `<p class="cc-soll-hint">Empty rent = today's Soll: ${_rntFmtEUR(sollK)}${sollN != null ? ' + ' + _rntFmtEUR(sollN) + ' NK' : ''}. Please check what this tenant paid back then.</p>`);
  }
  document.getElementById('rntModalFooter').innerHTML = `
    <div class="tn-sheet-spacer"></div>
    <button class="tn-btn tn-btn-sm" onclick="_rntCloseModal()">Cancel</button>
    <button class="tn-btn tn-btn-primary cc-save cc-save--create" onclick="_rntModalSaveDraft()">
      <i class="ti ti-check"></i> Save</button>`;

  document.getElementById('rntModal')._draft = draft;

  const body  = document.getElementById('rntModalBody');
  const read  = body.querySelector('[id^="mprof-read-"]');
  const edit  = body.querySelector('[id^="mprof-edit-"]');
  const fread = body.querySelector('[id^="mprof-foot-read-"]');
  const fedit = body.querySelector('[id^="mprof-foot-edit-"]');
  if (read)  read.style.display  = 'none';
  if (edit)  edit.style.display  = '';
  if (fread) fread.style.display = 'none';
  if (fedit) fedit.style.display = 'none';

  document.getElementById('rntModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function _rntModalSaveDraft() {
  if (!sbL) return;
  const modal = document.getElementById('rntModal');
  const draft = modal._draft;
  if (!draft) return;

  const body = document.getElementById('rntModalBody');
  const p    = _rntCollectProfile(body, 'data-mf');
  const btn  = document.getElementById('rntModalFooter')?.querySelector('.tn-btn-primary');
  if (btn) { btn.textContent = '\u2026'; btn.disabled = true; }
  if (!_ccTenancyOk(body, 'data-mf', p, _rntRecords.filter(r => draft.apartment_id ? r.apartment_id === draft.apartment_id : r.parking_id === draft.parking_id), null, btn, r => _rntFullTenantNames(r))) return;

  const isApt = !!draft.apartment_id;

  const { data, error } = await sbL.from('rnt_tenant_records')
    .insert({
      apartment_id:  draft.apartment_id,
      parking_id:    draft.parking_id,
      status: 'former', contract_type: 'mietvertrag',
      first_name: p.first_name, last_name: p.last_name,
      email: p.email, phone: p.phone, birthday: p.birthday,
      address: p.address, mietbeginn: p.mietbeginn, mietende: p.mietende,
      // Starting rent = the unit's price (Soll) unless you typed another amount
      kaltmiete:   p.kaltmiete   ?? (isApt ? _rntAptPricing(draft.apartment_id).kaltmiete : _rntPkPricing(draft.parking_id).miete) ?? null,
      nebenkosten: isApt ? (p.nebenkosten ?? _rntAptPricing(draft.apartment_id).nebenkosten ?? null) : null,
      kaution_soll: p.kaution_soll ?? null,
    })
    .select().single();

  if (error) {
    ccSaveFailed(error, 'former tenant');
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  await _rntEnsureKaution(data.id);
  _rntRecords.push(data);
  _rntSyncOccupancy();
  _rntNK[data.id]   = [];
  _rntDocs[data.id] = [];
  modal._draft = null;

  _rntCloseModal();
  if (window._ccReturnTo) { location.href = window._ccReturnTo; return; }  // came from Settlements → straight back
  _rntOpenModal(data.id);
  _rntRender();
}

async function _rntMarkDone(tid) {
  if (!sbL) return;
  const rec = _rntRecords.find(r => r.id === tid);
  if (rec) { rec.done = true; rec.status = 'archived'; }
  _rntCloseModal();
  _rntRender();
  sbL.from('rnt_tenant_records').update({ done:true, status:'archived' }).eq('id', tid)
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'tenant archive'); _rntLoad(); } });
}

async function _rntReopen(tid) {
  if (!sbL) return;
  const rec = _rntRecords.find(r => r.id === tid);
  if (rec) { rec.done = false; rec.status = 'former'; }
  _rntRender();
  sbL.from('rnt_tenant_records').update({ done:false, status:'former' }).eq('id', tid)
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'tenant reopen'); _rntLoad(); } });
}

async function _rntHideFormer(tid) {
  if (!sbL) return;
  const rec = _rntRecords.find(r => r.id === tid);
  if (rec) { rec.done = true; rec.status = 'archived'; }
  _rntRender();
  sbL.from('rnt_tenant_records').update({ done:true, status:'archived' }).eq('id', tid)
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'tenant hide'); _rntLoad(); } });
}

function _rntDeleteFormer(tid) {
  if (!_rntIsAllDone(tid)) return;
  _rntDeleteId = tid;
  const rec  = _rntRecords.find(r => r.id === tid);
  const name = [rec?.first_name, rec?.last_name].filter(Boolean).join(' ') || 'this tenant';
  document.getElementById('rntConfirmBody').innerHTML =
    `This will permanently delete <strong>${_rntEsc(name)}</strong> and all related records. Cannot be undone.`;
  document.getElementById('rntConfirm').classList.add('open');
}

function _rntCancelDelete() {
  document.getElementById('rntConfirm').classList.remove('open');
  _rntDeleteId = null;
}

async function _rntConfirmDelete() {
  if (!_rntDeleteId || !sbL) return;
  const btn = document.getElementById('rntConfirmOk');
  if (btn) btn.disabled = true;
  const { error } = await sbL.from('rnt_tenant_records').delete().eq('id', _rntDeleteId);
  if (error) ccSaveFailed(error, 'delete tenant');
  document.getElementById('rntConfirm').classList.remove('open');
  if (!error) {
    _rntRecords = _rntRecords.filter(r => r.id !== _rntDeleteId);
    delete _rntKaution[_rntDeleteId];
    delete _rntNK[_rntDeleteId];
    delete _rntDocs[_rntDeleteId];
  }
  _rntDeleteId = null;
  if (btn) btn.disabled = false;
  _rntCloseModal();
  _rntRender();
}


/* ══════════════════════════════════════════════════════════════
   18. BADGE REFRESH
══════════════════════════════════════════════════════════════ */
function _rntRefreshFormerBadges(tid) {
  const k       = _rntKaution[tid];
  const settled = k?.settled || false;
  const hasK    = k && k.received > 0;

  document.querySelectorAll('.tn-former-row').forEach(row => {
    const infoDiv = row.querySelector('.tn-former-info');
    if (infoDiv?.getAttribute('onclick')?.includes(tid)) {
      const pills = row.querySelector('.tn-former-pills');
      if (pills) {
        const ret2   = k ? Number(k.returned) : 0;
        const sdate  = k?.settled_at ? _rntFmtDate(k.settled_at) : '';
        const kPill  = ccTnFormerKautionPill(k, _rntFmtEUR, _rntFmtDate);
        pills.innerHTML = kPill;
      }
    }
  });

  const kept = _rntKautionKept(tid);
  document.querySelectorAll('.tn-kaution-nudge').forEach(el => {
    if (el.getAttribute('onclick')?.includes(tid)) {
      if (settled || !hasK) { el.remove(); }
      else {
        const keptStr = kept > 0 ? _rntFmtEUR(kept) + ' kept' : 'full refund';
        const keptEl  = el.querySelector('.tn-nudge-kept');
        if (keptEl) keptEl.textContent = keptStr;
      }
    }
  });

  _rntKautionLine(document.getElementById('rnt-kaution-summary'), ccTnHeldTotal(_rntRecords, _rntKaution));
}


/* ══════════════════════════════════════════════════════════════
   19. EVENT BINDS
══════════════════════════════════════════════════════════════ */
function _rntBindCards() {
  // Document uploads: cc-contract-flow.js (Unsigned | Signed, photos → PDF)
}


/* ══════════════════════════════════════════════════════════════
   20. ENTRY POINT
══════════════════════════════════════════════════════════════ */
/* Preload for the contract generators (Apartments / Parking): ONE light query
   for the active tenant records, fetched in the background so a generator opens
   instantly. Deliberately not loadRntTenants() — that would also load the other
   units' tab (and its draft restore) behind your back. */
let _rntLoadedOnce  = false;   // full Tenants-tab load done (_rntRecords is current)
let _rntActiveRecs  = null;    // preloaded active records (until the full load)
let _rntWarmPromise = null;
function rntWarmTenants() {
  if (_rntLoadedOnce || _rntActiveRecs) return Promise.resolve();
  if (typeof sbL === 'undefined' || !sbL) return Promise.resolve();
  if (!_rntWarmPromise) {
    _rntWarmPromise = sbL.from('rnt_tenant_records')
      .select('id,contract_type,apartment_id,parking_id,status,mietbeginn,mietende,kaltmiete,nebenkosten,first_name,last_name,email,phone,birthday,address,first_name_2,last_name_2,email_2,phone_2,birthday_2,address_2,first_name_3,last_name_3,email_3,phone_3,birthday_3,address_3,kaution_soll')
      .then(({ data, error }) => {
        if (error) { console.warn('[rentals tenants] preload:', error.message); return; }
        if (!_rntLoadedOnce) { _rntActiveRecs = data || []; _rntSyncOccupancy(); }   // all statuses; readers filter 'active'
        // headers + totals in Apartments / Parking show the tenants' real rent once known
        try { if (typeof _renderAptList === 'function' && document.getElementById('aptList')) { _renderAptList(); _updateAptSummary(); } } catch (e) {}
        try { if (typeof _renderPkList === 'function' && document.getElementById('pkList')) { _renderPkList(); _updatePkSummary(); } } catch (e) {}
      })
      .catch(e => console.warn('[rentals tenants] preload:', e))
      .finally(() => { _rntWarmPromise = null; });
  }
  return _rntWarmPromise;
}

/* The CURRENT tenant's rent of a unit (moved in, active) — what Apartments /
   Parking show in the header and add up in the total. null = no current tenant
   or records not loaded yet (then the offer price is shown, labelled as such). */
function rntCurrentRentOf(kind, id) {
  const src = _rntLoadedOnce ? _rntRecords : _rntActiveRecs;
  if (!src) return null;
  const col = kind === 'apt' ? 'apartment_id' : 'parking_id';
  const cur = _ccPickTenancy(src.filter(r => r[col] === id && r.status === 'active')).current;
  if (!cur) return null;
  const r = _rntCurrentRent(cur);
  return r ? { kalt: r.kalt, nk: r.nk, total: r.total, name: [cur.first_name, cur.last_name].filter(Boolean).join(' ') } : null;
}

/* Active tenant of a unit, read from the loaded records — the same record the
   database lookup returns (active, newest Mietbeginn), incl. Mieter 2 and 3.
   Returns null while records are not loaded yet (caller then asks the database). */
function rntProfileFromRecords(kind, id) {
  const src = _rntLoadedOnce ? _rntRecords : _rntActiveRecs;
  if (!src) return null;
  const col = kind === 'apt' ? 'apartment_id' : 'parking_id';
  const rec = (src || [])
    .filter(r => r[col] === id && r.status === 'active')
    .sort((a, b) => String(b.mietbeginn || '').localeCompare(String(a.mietbeginn || '')))[0];
  if (!rec || !(rec.first_name || rec.last_name)) return {};
  const mk = (fn, ln, em, ph, bd, ad) => ({
    firstName: fn || '', lastName: ln || '', email: em || '',
    phone: ph || '', birthday: bd || '', address: ad || '',
  });
  const tenant1 = mk(rec.first_name, rec.last_name, rec.email, rec.phone, rec.birthday, rec.address);
  const tenant2 = (rec.first_name_2 || rec.last_name_2)
    ? mk(rec.first_name_2, rec.last_name_2, rec.email_2, rec.phone_2, rec.birthday_2, rec.address_2) : null;
  const tenant3 = (rec.first_name_3 || rec.last_name_3)
    ? mk(rec.first_name_3, rec.last_name_3, rec.email_3, rec.phone_3, rec.birthday_3, rec.address_3) : null;
  return { ...tenant1, tenant1, tenant2, tenant3 };
}

async function loadRntTenants() {
  // Load missing prerequisites in parallel (was: apartments, THEN parking)
  await Promise.all([
    !appApartments?.length ? loadApartments?.() : Promise.resolve(),
    !appParking?.length    ? loadParking?.()    : Promise.resolve(),
  ]);
  await _rntLoad();
  const h = _ccTakeFormerHandoff('rentals');
  if (h && h.aptId != null) {
    const apt = (appApartments || []).find(a => String(a.id) === String(h.aptId));
    if (apt) { _ccReturnBanner(document.getElementById('tab-tenants')); _rntAddFormer('apt', apt.id, h); }
  }
}

/* ── "Mieter nachtragen" from Settlements ─────────────────────
   Settlements (Tracking → Leerstand) opens this tab with the room and
   the empty days. The "Add former tenant" form opens with those dates
   filled in; after saving you go straight back to Settlements.       */
function _ccTakeFormerHandoff(app) {
  let h = null;
  try { h = JSON.parse(sessionStorage.getItem('cc_prefill_former') || 'null'); } catch (e) {}
  if (!h || h.app !== app || Date.now() - (h.t || 0) > 15 * 60 * 1000) return null;
  try { sessionStorage.removeItem('cc_prefill_former'); } catch (e) {}
  window._ccReturnTo = h.back || null;
  return h;
}
function _ccReturnBanner(tabEl) {
  if (!tabEl || !window._ccReturnTo || tabEl.querySelector('.cc-return-bar')) return;
  tabEl.insertAdjacentHTML('afterbegin',
    '<div class="cc-return-bar"><button type="button" onclick="location.href=window._ccReturnTo">' +
    '<i class="ti ti-arrow-left" aria-hidden="true"></i> Zurück zu Settlements</button>' +
    '<span>Mieter für den Leerstand nachtragen</span></div>');
}


/* ── Double-tap lock (ccOnce in direct-save.js): these add a new row ── */
async function _rntNKVorausConfirmAdd(...args) { return ccOnce('_rntNKVorausConfirmAdd', () => _rntNKVorausConfirmAdd__run(...args)); }
async function _rntConfirmAddNk(...args) { return ccOnce('_rntConfirmAddNk', () => _rntConfirmAddNk__run(...args)); }
async function _rntStaffelConfirmAdd(...args) { return ccOnce('_rntStaffelConfirmAdd', () => _rntStaffelConfirmAdd__run(...args)); }
async function _rntPkStaffelConfirmAdd(...args) { return ccOnce('_rntPkStaffelConfirmAdd', () => _rntPkStaffelConfirmAdd__run(...args)); }
