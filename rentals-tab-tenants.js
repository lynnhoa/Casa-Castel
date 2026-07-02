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
  <div class="tn-hdr" style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
    <h1 class="cc-h1">Tenants</h1>
    <div id="rnt-kaution-summary" style="display:none;align-items:center;gap:6px;font-size:12px;color:var(--cc-stone);"></div>
  </div>
  <div class="tn-list" id="rntTenantsList"></div>

  <input type="file" id="rntFileInput" accept="application/pdf,image/*"
         style="display:none" aria-hidden="true"/>

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
          <div class="tn-sheet-name">Stufe hinzufügen</div>
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
.tn-list { display:flex; flex-direction:column; gap:8px;
  padding-bottom: max(40px, env(safe-area-inset-bottom, 40px)); }

/* ── GROUP HEADER ── */
.rnt-group-hdr { font-size:9px; font-weight:600; letter-spacing:.14em;
  text-transform:uppercase; color:var(--cc-stone);
  padding:4px 2px 6px; margin-top:8px; }
.rnt-group-hdr:first-child { margin-top:0; }

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
.tn-rent-form { display:grid; grid-template-columns:1fr 1fr 1fr 1fr;
  gap:6px; padding:10px 14px 12px; border-bottom:var(--cc-border); }
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
.tn-nkv-add-form input[type=number] { width:90px; }
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

// Kaution soll: always 3× kaltmiete (or parkmiete) for rentals
function _rntKautionSoll(rec) {
  if (!rec) return null;
  if (rec.kaution_soll != null) return Number(rec.kaution_soll);
  if (rec.apartment_id) {
    const p = _rntAptPricing(rec.apartment_id);
    return p.kaltmiete ? Math.round(p.kaltmiete * 3) : null;
  }
  if (rec.parking_id) {
    const p = _rntPkPricing(rec.parking_id);
    return p.miete ? Math.round(p.miete * 3) : null;
  }
  return null;
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
  return v.toLocaleString('de-DE', { minimumFractionDigits:0, maximumFractionDigits:2 }) + '\u00a0\u20ac';
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
function _rntKautionStatus(recv, ret, settled) {
  if (settled)               return { label:'Settled',        cls:'tnp-green' };
  if (recv === 0)            return { label:'Pending',        cls:'tnp-amber' };
  if (ret > 0 && ret < recv) return { label:'Refund pending', cls:'tnp-amber' };
  if (ret >= recv)           return { label:'Refund pending', cls:'tnp-amber' };
  return                            { label:'Holding',        cls:'tnp-blue'  };
}

function _rntNkHasOpen(tid) {
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
  return (_rntStaffel[aptId] || []).find(e => new Date(e.effective_date) > today) || null;
}
function _rntStaffelCurrent(aptId) {
  const today = new Date(); today.setHours(0,0,0,0);
  return (_rntStaffel[aptId] || []).find(e => new Date(e.effective_date) <= today) || null;
}
function _rntStaffelPillState(aptId) {
  // Returns null (no pill), 'reminder' (amber, ≤30 days), or 'overdue' (red, past + not adjusted)
  const today = new Date(); today.setHours(0,0,0,0);
  const entries = _rntStaffel[aptId] || [];
  for (const e of entries) {
    if (e.tenant_adjusted) continue;
    const eff = new Date(e.effective_date);
    const diffDays = Math.ceil((eff - today) / (24 * 3600 * 1000));
    if (diffDays > 30) continue;
    if (diffDays >= 0) return { state: 'reminder', entry: e, days: diffDays };
    return { state: 'overdue', entry: e, days: Math.abs(diffDays) };
  }
  return null;
}

function _rntStatusPill(unitId, isApt, activeRec) {
  if (!activeRec) return '';
  const pills = [];
  const days = _rntDaysToMoveOut(activeRec);
  if (days !== null && days >= 0 && days <= 60)
    pills.push(`<span class="tnp tnp-red">Move-out in ${days} day${days===1?'':'s'}</span>`);
  if (isApt && _rntNkHasOpen(activeRec.id))
    pills.push(`<span class="tnp tnp-red">NK open</span>`);
  if (isApt && _rntNKVorausHasOpen(unitId))
    pills.push(`<span class="tnp tnp-amber"><i class="ti ti-alert-triangle" aria-hidden="true"></i> NK-Erhöhung offen</span>`);
  const sf = _rntStaffelPillState(unitId);
  if (sf && sf.state === 'reminder') {
    const fmtD = (d) => { const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };
    pills.push(`<span class="tnp tnp-amber"><i class="ti ti-stairs-up" aria-hidden="true"></i> Staffel ab ${fmtD(sf.entry.effective_date)}</span>`);
  }
  if (sf && sf.state === 'overdue')
    pills.push(`<span class="tnp tnp-red"><i class="ti ti-stairs-up" aria-hidden="true"></i> Staffel ${sf.days} Tage fällig</span>`);
  const k = _rntKaution[activeRec.id];
  const recv = k ? Number(k.received) : 0;
  if (recv > 0 && !k?.settled)
    pills.push(`<span class="tnp tnp-blue">${_rntFmtEUR(recv)} Kaution</span>`);
  return pills.slice(0,2).join('');
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

  const [aptRes, pkRes] = await Promise.all([aptQuery, pkQuery]);
  _rntRecords = [...(aptRes.data || []), ...(pkRes.data || [])];

  const tids = _rntRecords.map(r => r.id);
  if (!tids.length) { _rntRender(); return; }

  const [kRes, nkRes, docRes, vorausRes, staffelRes] = await Promise.all([
    sbL.from('rnt_kaution').select('*').in('tenant_id', tids),
    sbL.from('rnt_nk_entries').select('*').in('tenant_id', tids).order('period', { ascending: false }),
    sbL.from('rnt_tenant_documents').select('*').in('tenant_id', tids),
    aptIds.length
      ? sbL.from('rnt_nk_vorauszahlung_history').select('*')
           .in('apartment_id', aptIds).order('effective_date', { ascending: false })
      : Promise.resolve({ data: [] }),
    (aptIds.length || pkIds.length)
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
      : Promise.resolve({ data: [] }),
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

  _rntRender();
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
  const totalHeld = _rntRecords
    .filter(r => { const k = _rntKaution[r.id]; return k && k.received > 0 && !k.settled; })
    .reduce((sum, r) => sum + Number(_rntKaution[r.id].received), 0);
  const summaryEl = document.getElementById('rnt-kaution-summary');
  if (summaryEl) {
    if (totalHeld > 0) {
      summaryEl.innerHTML = `<i class="ti ti-safe" style="font-size:13px"></i> Kaution held: <strong>${_rntFmtEUR(totalHeld)}</strong>`;
      summaryEl.style.display = 'flex';
    } else {
      summaryEl.style.display = 'none';
    }
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

  _rntOpenCards.forEach(id => document.getElementById(id)?.classList.add('open'));
  _rntBindCards();
}


/* ══════════════════════════════════════════════════════════════
   10. CARD HTML
══════════════════════════════════════════════════════════════ */
function _rntCardHTML({ type, unit }) {
  const isApt = type === 'apt';
  const rid   = (isApt ? 'apt_' : 'pk_') + unit.id.replace(/-/g,'').slice(0,12);
  const cid   = 'tc-' + rid;

  const activeRec = isApt
    ? _rntRecords.find(r => r.apartment_id === unit.id && r.status === 'active')
    : _rntRecords.find(r => r.parking_id   === unit.id && r.status === 'active');

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
    ${activeRec || !unit.vacant
      ? _rntRentBarHTML(rid, type, unit, activeRec) + _rntRentFormHTML(rid, type, unit, activeRec)
      : ''}
    ${_rntProfileSectionHTML(rid, type, unit, activeRec)}
    ${_rntDocumentsSectionHTML(rid, type, unit, activeRec)}
    ${_rntKautionHTML(rid, activeRec ? activeRec.id : null, 'card', activeRec)}
    ${isApt ? _rntNKHTML(rid, activeRec ? activeRec.id : null, 'card') : ''}
    ${isApt ? _rntNKVorausHTML(rid, activeRec ? unit.id : null, 'card') : ''}
    ${isApt ? _rntStaffelHTML(rid, activeRec ? unit.id : null) : _rntPkStaffelHTML(rid, activeRec ? unit.id : null)}
    ${_rntFormerSectionHTML(rid, type, unit, formerRecs, archivedRecs)}
  </div>
</div>`;
}


/* ── HEADER ── */
function _rntHeaderHTML(rid, type, unit, activeRec) {
  const isApt  = type === 'apt';
  const vacant = !!unit.vacant;

  const fullName = activeRec ? _rntFullTenantNames(activeRec) : null;

  // Pricing for header summary
  let warm = null, kalt = null, nk = null, miete = null;
  if (isApt) {
    const liveP = _rntAptPricing(unit.id);
    kalt  = activeRec?.kaltmiete   != null ? Number(activeRec.kaltmiete)   : liveP.kaltmiete;
    nk    = activeRec?.nebenkosten != null ? Number(activeRec.nebenkosten) : liveP.nebenkosten;
    warm  = (kalt != null && nk != null) ? kalt + nk : kalt;
  } else {
    const liveP = _rntPkPricing(unit.id);
    miete = activeRec?.kaltmiete != null ? Number(activeRec.kaltmiete) : liveP.miete;
  }

  const mietbeginn = activeRec ? _rntFmtDate(activeRec.mietbeginn) : null;
  const mietende   = activeRec ? _rntFmtDate(activeRec.mietende)   : null;
  const dateStr = mietbeginn && mietende
    ? `${mietbeginn} \u2013 ${mietende}`
    : mietbeginn ? `since ${mietbeginn}` : '';

  const unitLabel = isApt
    ? unit.name
    : `${unit.name} \u00b7 ${unit.parking_type || 'Stellplatz'}`;

  const statusPill = _rntStatusPill(unit.id, isApt, activeRec);

  let midLine = '', botLine = '';

  if (vacant) {
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No current tenant</span>
               <span class="tnp tnp-gray">Vacant</span>`;
  } else if (activeRec) {
    midLine = `
      <span class="tn-tenant-name">${_rntEsc(fullName || 'Unnamed tenant')}</span>
      <span class="tnp tnp-green">Occupied</span>
      ${dateStr ? `<span class="tn-tenant-dates">${_rntEsc(dateStr)}</span>` : ''}`;
    if (isApt) {
      botLine = `<div class="tn-hdr-bot">
        ${warm != null ? `<span class="tn-warm">${_rntFmtEUR(warm)}</span><span class="tn-dim">warm</span>` : ''}
        ${(kalt != null && nk != null) ? `<div class="tn-dot-sep"></div><span class="tn-dim">${_rntFmtEUR(kalt).replace('\u00a0\u20ac','')} + ${_rntFmtEUR(nk).replace('\u00a0\u20ac','')} kalt+NK</span>` : ''}
      </div>`;
    } else {
      botLine = `<div class="tn-hdr-bot">
        ${miete != null ? `<span class="tn-warm">${_rntFmtEUR(miete)}</span><span class="tn-dim">/ Monat</span>` : ''}
      </div>`;
    }
  } else {
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No tenant added</span>
               <span class="tnp tnp-green">Occupied</span>`;
  }

  return `
<div class="tn-hdr-wrap" onclick="_rntToggleCard('${rid}')">
  <div class="tn-hdr-top">
    <span class="tn-room-lbl">${_rntEsc(unitLabel)}</span>
    <div id="hdr-kpill-${rid}" style="margin-left:auto;display:flex;align-items:center;gap:4px;flex-shrink:0">${statusPill}</div>
    <i class="ti ti-chevron-right tn-chev" aria-hidden="true"></i>
  </div>
  ${isApt && unit.adresse ? `<div class="tn-hdr-addr">${_rntEsc(unit.adresse)}</div>` : ''}
  <div class="tn-hdr-mid">${midLine}</div>
  ${botLine}
</div>`;
}


/* ── RENT BAR ── */
function _rntRentBarHTML(rid, type, unit, rec) {
  const isApt = type === 'apt';

  if (isApt) {
    const liveP = _rntAptPricing(unit.id);
    const kalt  = rec?.kaltmiete   != null ? Number(rec.kaltmiete)   : liveP.kaltmiete;
    const nk    = rec?.nebenkosten != null ? Number(rec.nebenkosten) : liveP.nebenkosten;
    const warm  = (kalt != null && nk != null) ? kalt + nk : kalt;
    const src   = rec?.kaltmiete   != null ? 'agreed' : 'from apartments tab';

    return `
<div class="tn-rent-bar" id="rbar-${rid}">
  <div class="tn-rc">
    <div class="tn-rlbl">Kaltmiete</div>
    <div class="tn-rval">${kalt != null ? _rntFmtEUR(kalt) : '\u2014'}</div>
    <div class="tn-rsub">${src}</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Nebenkosten</div>
    <div class="tn-rval">${nk != null ? _rntFmtEUR(nk) : '\u2014'}</div>
    <div class="tn-rsub">per month</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Warmmiete</div>
    <div class="tn-rval">${warm != null ? _rntFmtEUR(warm) : '\u2014'}</div>
    <div class="tn-rsub">derived</div>
  </div>
  <div class="tn-rc">
    <button class="tn-edit-rent-btn" onclick="_rntToggleRentEdit('${rid}')">
      <i class="ti ti-pencil" style="font-size:10px"></i> Edit
    </button>
  </div>
</div>`;
  } else {
    const liveP = _rntPkPricing(unit.id);
    const miete = rec?.kaltmiete != null ? Number(rec.kaltmiete) : liveP.miete;
    const src   = rec?.kaltmiete != null ? 'agreed' : 'from parking tab';

    return `
<div class="tn-rent-bar" id="rbar-${rid}">
  <div class="tn-rc">
    <div class="tn-rlbl">Parkmiete</div>
    <div class="tn-rval">${miete != null ? _rntFmtEUR(miete) : '\u2014'}</div>
    <div class="tn-rsub">${src}</div>
  </div>
  <div class="tn-rc">
    <button class="tn-edit-rent-btn" onclick="_rntToggleRentEdit('${rid}')">
      <i class="ti ti-pencil" style="font-size:10px"></i> Edit
    </button>
  </div>
</div>`;
  }
}


/* ── RENT FORM ── */
function _rntRentFormHTML(rid, type, unit, rec) {
  const isApt = type === 'apt';
  const tid   = rec ? rec.id : '';
  const ksoll = _rntKautionSoll(rec) ?? '';

  if (isApt) {
    const liveP = _rntAptPricing(unit.id);
    const kalt  = rec?.kaltmiete   != null ? Number(rec.kaltmiete)   : (liveP.kaltmiete ?? '');
    const nk    = rec?.nebenkosten != null ? Number(rec.nebenkosten) : (liveP.nebenkosten ?? '');
    const warm  = (kalt !== '' && nk !== '') ? Number(kalt) + Number(nk) : (kalt !== '' ? kalt : '');

    return `
<div class="tn-rent-form" id="rform-${rid}" style="display:none">
  <div class="tn-rf">
    <span class="tn-flbl">Kaltmiete \u20ac/mo</span>
    <input type="number" id="rf-kalt-${rid}" value="${kalt}" placeholder="${liveP.kaltmiete ?? ''}"
      oninput="_rntUpdateWarm('${rid}')"/>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Nebenkosten \u20ac/mo</span>
    <input type="number" id="rf-nk-${rid}" value="${nk}" placeholder="${liveP.nebenkosten ?? ''}"
      oninput="_rntUpdateWarm('${rid}')"/>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Warmmiete</span>
    <div class="tn-rf-derived" id="rf-warm-${rid}">${warm !== '' ? _rntFmtEUR(warm) : '\u2014'}</div>
  </div>
  <div class="tn-rf" style="grid-column:1/-1">
    <div class="tn-kaut-override-row">
      <span class="tn-kaut-override-lbl">Kaution soll · ${ksoll ? _rntFmtEUR(ksoll) : '\u2014'} (3\u00d7 Kaltmiete)</span>
      <label class="tn-kaut-ovr-sw" title="Override kaution">
        <input type="checkbox" id="rf-ksoll-ovr-${rid}" ${rec?.kaution_soll != null ? 'checked' : ''}
          onchange="_rntToggleKautionOverride(this,'rf-ksoll-${rid}','rf-ksoll-hint-${rid}')"/>
        <span class="tn-kaut-ovr-sw__t"></span>
      </label>
      <span style="font-size:10px;color:var(--cc-stone)">Override</span>
    </div>
    <input type="number" id="rf-ksoll-${rid}"
      value="${rec?.kaution_soll != null ? ksoll : ''}" placeholder="${ksoll}"
      ${rec?.kaution_soll != null ? '' : 'disabled style="opacity:.4"'}/>
  </div>
  <div class="tn-rf-save-row" style="grid-column:1/-1;justify-content:space-between;align-items:center">
    <span class="tn-rf-hint" style="margin:0">Frozen at move-out for former tenants.</span>
    <div style="display:flex;gap:6px">
      <button class="tn-btn tn-btn-sm" onclick="_rntToggleRentEdit('${rid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary" onclick="_rntSaveRent('${rid}','${tid}','apt','${unit.id}')">
        <i class="ti ti-check"></i> Save rent
      </button>
    </div>
  </div>
</div>`;
  } else {
    const liveP = _rntPkPricing(unit.id);
    const miete = rec?.kaltmiete != null ? Number(rec.kaltmiete) : (liveP.miete ?? '');

    return `
<div class="tn-rent-form" id="rform-${rid}" style="display:none">
  <div class="tn-rf">
    <span class="tn-flbl">Parkmiete \u20ac/mo</span>
    <input type="number" id="rf-kalt-${rid}" value="${miete}" placeholder="${liveP.miete ?? ''}"/>
  </div>
  <div class="tn-rf" style="grid-column:1/-1">
    <div class="tn-kaut-override-row">
      <span class="tn-kaut-override-lbl">Kaution soll · ${ksoll ? _rntFmtEUR(ksoll) : '\u2014'} (3\u00d7 Parkmiete)</span>
      <label class="tn-kaut-ovr-sw" title="Override kaution">
        <input type="checkbox" id="rf-ksoll-ovr-${rid}" ${rec?.kaution_soll != null ? 'checked' : ''}
          onchange="_rntToggleKautionOverride(this,'rf-ksoll-${rid}','rf-ksoll-hint-${rid}')"/>
        <span class="tn-kaut-ovr-sw__t"></span>
      </label>
      <span style="font-size:10px;color:var(--cc-stone)">Override</span>
    </div>
    <input type="number" id="rf-ksoll-${rid}"
      value="${rec?.kaution_soll != null ? ksoll : ''}" placeholder="${ksoll}"
      ${rec?.kaution_soll != null ? '' : 'disabled style="opacity:.4"'}/>
  </div>
  <div class="tn-rf-save-row" style="grid-column:1/-1;justify-content:flex-end">
    <button class="tn-btn tn-btn-sm" onclick="_rntToggleRentEdit('${rid}')">Cancel</button>
    <button class="tn-btn tn-btn-primary" onclick="_rntSaveRent('${rid}','${tid}','parking','${unit.id}')">
      <i class="ti ti-check"></i> Save rent
    </button>
  </div>
</div>`;
  }
}


/* ── PROFILE SECTION ── */
function _rntProfileSectionHTML(rid, type, unit, rec) {
  const isEmpty  = !rec || (!rec.first_name && !rec.last_name && !rec.email && !rec.mietbeginn);
  const startEdit = !rec || isEmpty;
  const email    = rec ? _rntEsc(rec.email || '') : '';
  const fullName = rec ? [rec.first_name, rec.last_name].filter(Boolean).join(' ') : '';
  const tid      = rec ? rec.id : '';

  const has2 = !!(rec && (rec.first_name_2 || rec.last_name_2));
  const has3 = !!(rec && (rec.first_name_3 || rec.last_name_3));
  const fullName2 = rec ? [rec.first_name_2, rec.last_name_2].filter(Boolean).join(' ') : '';
  const fullName3 = rec ? [rec.first_name_3, rec.last_name_3].filter(Boolean).join(' ') : '';

  const readView = !rec ? '' : `
  <div class="tn-fg" id="pread-${rid}">
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <span class="tn-fval">${_rntEsc(fullName) || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <span class="tn-fval">${_rntEsc(rec.birthday||'') || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <span class="tn-fval">${email || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <span class="tn-fval">${_rntEsc(rec.phone||'') || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
      <span class="tn-fval">${_rntEsc(rec.address||'') || '<span class="muted">Not set</span>'}</span></div>
    ${has2 ? `
    <div class="tn-field tn-field-full" style="margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;"><span class="tn-flbl">Mieter 2</span></div>
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <span class="tn-fval">${_rntEsc(fullName2) || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <span class="tn-fval">${_rntEsc(rec.birthday_2||'') || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <span class="tn-fval">${_rntEsc(rec.email_2||'') || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <span class="tn-fval">${_rntEsc(rec.phone_2||'') || '<span class="muted">Not set</span>'}</span></div>
    ` : ''}
    ${has3 ? `
    <div class="tn-field tn-field-full" style="margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;"><span class="tn-flbl">Mieter 3</span></div>
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <span class="tn-fval">${_rntEsc(fullName3) || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <span class="tn-fval">${_rntEsc(rec.birthday_3||'') || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <span class="tn-fval">${_rntEsc(rec.email_3||'') || '<span class="muted">Not set</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <span class="tn-fval">${_rntEsc(rec.phone_3||'') || '<span class="muted">Not set</span>'}</span></div>
    ` : ''}
    <div class="tn-field tn-field-full" style="border-top:1px solid var(--cc-rule);margin-top:6px;padding-top:8px;">
      <div class="tn-fg">
        <div class="tn-field"><span class="tn-flbl">Move in</span>
          <span class="tn-fval">${_rntFmtDate(rec.mietbeginn) || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move out</span>
          <span class="tn-fval ${rec.mietende ? '' : 'muted'}">${_rntFmtDate(rec.mietende) || 'Not set \u2014 active'}</span></div>
      </div>
    </div>
  </div>`;

  const tenant2Block = `
  <div id="p2wrap-${rid}" class="tn-field-full" style="display:${has2 ? 'block' : 'none'};grid-column:1/-1;margin-top:6px;border-top:1px solid var(--cc-rule);padding-top:8px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span class="tn-flbl">Mieter 2</span>
      <button type="button" class="tn-btn tn-btn-sm" onclick="_rntRemoveCoTenant('${rid}',2)">Entfernen</button>
    </div>
    <div class="tn-fg">
      <div class="tn-field"><span class="tn-flbl">Name</span>
        <input data-f="name_2" type="text" value="${_rntEsc(fullName2)}" placeholder="Full name"/></div>
      <div class="tn-field"><span class="tn-flbl">Birthday</span>
        <input data-f="birthday_2" type="text" value="${_rntEsc(rec ? rec.birthday_2||'' : '')}" placeholder="DD.MM.YYYY"/></div>
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
      <span class="tn-flbl">Mieter 3</span>
      <button type="button" class="tn-btn tn-btn-sm" onclick="_rntRemoveCoTenant('${rid}',3)">Entfernen</button>
    </div>
    <div class="tn-fg">
      <div class="tn-field"><span class="tn-flbl">Name</span>
        <input data-f="name_3" type="text" value="${_rntEsc(fullName3)}" placeholder="Full name"/></div>
      <div class="tn-field"><span class="tn-flbl">Birthday</span>
        <input data-f="birthday_3" type="text" value="${_rntEsc(rec ? rec.birthday_3||'' : '')}" placeholder="DD.MM.YYYY"/></div>
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
      <i class="ti ti-plus"></i> Mieter hinzuf\u00fcgen
    </button>
  </div>`;

  const editView = `
  <div class="tn-fg" id="pedit-${rid}" ${startEdit ? '' : 'style="display:none"'}>
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <input data-f="name" type="text" value="${_rntEsc(fullName)}" placeholder="Full name"/></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <input data-f="birthday" type="text" value="${_rntEsc(rec ? rec.birthday||'' : '')}" placeholder="DD.MM.YYYY"/></div>
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
        <div class="tn-field"><span class="tn-flbl">Move in</span>
          <input data-f="mietbeginn" type="text" value="${_rntFmtDate(rec ? rec.mietbeginn : '')}" placeholder="DD.MM.YYYY"/></div>
        <div class="tn-field"><span class="tn-flbl">Move out</span>
          <input data-f="mietende" type="text" value="${_rntFmtDate(rec ? rec.mietende : '')}" placeholder="DD.MM.YYYY \u2014 becomes Former when reached"/></div>
      </div>
    </div>
  </div>`;

  const unitId   = type === 'apt' ? unit.id : unit.id;
  const unitType = type;

  const footerRead = `
  <div class="tn-sec-footer-split" id="pfoot-read-${rid}" ${startEdit ? 'style="display:none"' : ''}>
    ${email ? `<button class="tn-btn tn-btn-sm" onclick="window.location.href='mailto:${email}'">
      <i class="ti ti-mail"></i> Email</button>` : ''}
    <div class="tn-spacer"></div>
    <button class="tn-btn tn-btn-sm" id="pedit-btn-${rid}" onclick="_rntToggleProfile('${rid}','${tid}')">
      <i class="ti ti-pencil"></i> Edit</button>
  </div>`;

  const footerEdit = `
  <div class="tn-sec-footer" id="pfoot-edit-${rid}" ${startEdit ? '' : 'style="display:none"'}>
    ${rec ? `<button class="tn-btn tn-btn-sm" onclick="_rntToggleProfile('${rid}','${tid}')">Cancel</button>` : ''}
    <button class="tn-btn tn-btn-primary"
      onclick="${rec
        ? `_rntSaveProfile('${rid}','${tid}','${unitType}','${unitId}')`
        : `_rntSaveNewTenant('${rid}','${unitType}','${unitId}')`}">
      <i class="ti ti-check"></i> Save</button>
  </div>`;

  return `
<div class="tn-sec" id="psec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="margin-bottom:8px"><span class="tn-sec-lbl">Profile</span></div>
    ${readView}
    ${editView}
  </div>
  ${footerRead}
  ${footerEdit}
</div>`;
}


/* ── DOCUMENTS SECTION ── */
function _rntDocumentsSectionHTML(rid, type, unit, rec) {
  const isApt = type === 'apt';
  const docs  = rec ? (_rntDocs[rec.id] || []) : [];
  const tid   = rec ? rec.id : '';
  const getDoc = t => docs.find(d => d.type === t);

  const unitLabel = isApt ? unit.name : (unit.name + ' ' + (unit.parking_type || ''));

  const row = (docType, label) => {
    const doc    = getDoc(docType);
    const signed = !!doc?.file_url;
    const pill   = signed
      ? `<span class="tnp tnp-green">Signed</span>`
      : `<span class="tnp tnp-gray">Not uploaded</span>`;
    const viewBtn = `<button class="tn-doc-btn${signed?'':' off'}" onclick="${signed
      ? `_rntViewDoc('${_rntEsc(doc.file_url)}','${_rntEsc(label)}','${_rntEsc(unitLabel)}')`
      : ''}" title="View"><i class="ti ti-eye"></i></button>`;
    const delBtn = signed
      ? `<button class="tn-doc-btn" style="color:#A32D2D;border-color:#F09595"
           onclick="_rntDeleteDoc('${tid}','${docType}','${_rntEsc(doc.id)}')" title="Delete">
           <i class="ti ti-trash"></i></button>`
      : '';
    const upBtn = tid
      ? `<button class="tn-doc-btn" onclick="_rntTriggerUpload('${tid}','${docType}')" title="Upload">
           <i class="ti ti-upload"></i></button>`
      : `<button class="tn-doc-btn off" title="Save profile first"><i class="ti ti-upload"></i></button>`;
    return `<div class="tn-doc-row">
      <span class="tn-doc-name">${_rntEsc(label)}</span>
      ${pill}
      <div class="tn-doc-btns">${viewBtn}${delBtn}${upBtn}</div>
    </div>`;
  };

  return `
<div class="tn-sec">
  <div class="tn-sec-body" style="padding-top:16px;padding-bottom:14px">
    <div style="margin-bottom:10px"><span class="tn-sec-lbl">Documents</span></div>
    ${isApt
      ? row('mietvertrag','Mietvertrag') + row('uebergabeprotokoll','Übergabeprotokoll')
      : row('parkplatz_mietvertrag','Parkplatz-Mietvertrag') + row('uebergabeprotokoll','Übergabeprotokoll')}
  </div>
</div>`;
}


/* ── KAUTION SECTION ── */
function _rntKautionHTML(rid, tid, ctx, rec) {
  const k      = (tid && _rntKaution[tid]) || { received:0, returned:0, settled:false };
  const recv   = Number(k.received)  || 0;
  const ret    = Number(k.returned)  || 0;
  const kept   = recv - ret;
  const st     = _rntKautionStatus(recv, ret, k.settled);
  const pfx    = `${ctx}_${(tid||'none').replace(/-/g,'').slice(0,8)}`;
  const dis    = tid ? '' : 'disabled';
  const opac   = tid ? '' : 'opacity:.45;pointer-events:none;';
  const sec    = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
  const body   = ctx === 'modal' ? 'tn-msec-body' : 'tn-sec-body';
  const footer = ctx === 'modal' ? 'tn-msec-footer' : 'tn-sec-footer';
  const soll   = _rntKautionSoll(rec || (tid ? _rntRecords.find(r => r.id === tid) : null));

  return `
<div class="${sec}" style="${opac}">
  <div class="${body}" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span class="tn-sec-lbl" style="flex:1">Kaution</span>
      <span class="tnp ${st.cls}" id="kstat-${pfx}">${st.label}</span>
    </div>
    ${soll != null ? `<div class="tn-kaut-hint">Soll: ${_rntFmtEUR(soll)} \u00b7 3\u00d7 Miete</div>` : ''}
    <div class="tn-kaut-grid">
      <div class="tn-kc">
        <div class="tn-kc-lbl">Received</div>
        <input class="tn-kc-input" type="number" id="kr-${pfx}" value="${recv}" ${dis}
          oninput="_rntCalcKaution('${pfx}','${tid||''}')"/>
      </div>
      <div class="tn-kc">
        <div class="tn-kc-lbl">Returned</div>
        <input class="tn-kc-input" type="number" id="kret-${pfx}" value="${ret}" ${dis}
          oninput="_rntCalcKaution('${pfx}','${tid||''}')"/>
      </div>
      <div class="tn-kc">
        <div class="tn-kc-lbl">Kept</div>
        <div class="tn-kc-val${kept > 0 ? ' gold' : ''}" id="kk-${pfx}">${_rntFmtEUR(kept)}</div>
      </div>
    </div>
  </div>
  <div class="${footer}" style="gap:6px">
    ${recv > 0 ? `<button class="tn-btn tn-btn-sm" id="kset-${pfx}"
      ${dis} onclick="_rntToggleSettle('${pfx}','${tid||''}')">
      <i class="ti ti-check"></i> ${k.settled ? 'Settled' : 'Mark settled'}
    </button>` : ''}
    <button class="tn-btn tn-btn-sm" id="ksave-${pfx}"
      ${dis} onclick="_rntSaveKautionBtn('${pfx}','${tid||''}')">
      Save
    </button>
  </div>
</div>`;
}


/* ── NK SECTION (apartments only) ── */
function _rntNKHTML(rid, tid, ctx) {
  if (!tid) {
    const sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
    return `<div class="${sec}" style="opacity:.45;pointer-events:none">
      <div class="tn-sec-body" style="padding-top:10px;padding-bottom:11px">
        <div style="margin-bottom:8px"><span class="tn-sec-lbl">NK Abrechnungen</span></div>
        <p class="tn-empty">Save profile first.</p>
      </div></div>`;
  }

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
      <span class="tn-sec-lbl" style="flex:1">NK Abrechnungen</span>
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


/* ── NK VORAUSZAHLUNG SECTION (apartments only) ── */
function _rntNKVorausHTML(rid, aptId, ctx) {
  if (!aptId) return '';
  const sec     = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
  const entries = _rntNKVoraus[aptId] || [];
  const today   = new Date(); today.setHours(0,0,0,0);
  const current = entries.find(e => new Date(e.effective_date) <= today) || null;
  const pending = entries.filter(e => !e.tenant_adjusted);

  const fmtD = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };
  const isFuture = (e) => new Date(e.effective_date) > today;

  const pillHTML = (e) => {
    const notPill = e.tenant_notified
      ? `<span class="tn-nkv-pill done"><i class="ti ti-mail" aria-hidden="true"></i> Informiert</span>`
      : `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkNotified('${e.id}','${aptId}','${rid}')">
           <i class="ti ti-mail" aria-hidden="true"></i> Informiert?
         </button>`;
    const adjPill = e.tenant_adjusted
      ? `<span class="tn-nkv-pill done"><i class="ti ti-refresh" aria-hidden="true"></i> Angepasst</span>`
      : (e.tenant_notified
          ? `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkAdjusted('${e.id}','${aptId}','${rid}')">
               <i class="ti ti-refresh" aria-hidden="true"></i> Angepasst?
             </button>`
          : `<span class="tn-nkv-pill pending" style="cursor:default;opacity:.4"><i class="ti ti-refresh" aria-hidden="true"></i> Angepasst?</span>`);
    return notPill + adjPill;
  };

  const pendingRows = pending.map(e => `
    <div class="tn-nkv-row" id="nkv-row-${e.id}">
      <div class="tn-nkv-top">
        ${isFuture(e)
          ? `<i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0"></i>`
          : `<i class="ti ti-check" style="font-size:13px;color:#3B6D11;flex-shrink:0"></i>`}
        <span class="tn-nkv-date">${isFuture(e) ? 'ab ' : ''}${fmtD(e.effective_date)}</span>
        <span class="tn-nkv-amount">${_rntFmtEUR(e.amount)}</span>
      </div>
      <div class="tn-nkv-pills">${pillHTML(e)}</div>
    </div>`).join('');

  return `
<div class="${sec}" id="nkv-sec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span class="tn-sec-lbl" style="flex:1">NK Vorauszahlung</span>
      ${entries.length > 1 ? `<button class="tn-nkv-verlauf-btn" onclick="_rntNKVorausOpenModal('${aptId}')">Verlauf</button>` : ''}
      <button class="tn-btn tn-btn-sm" style="height:24px;padding:0 9px;font-size:10px"
        onclick="_rntNKVorausAdd('${aptId}','${rid}','${ctx}')">
        <i class="ti ti-plus" style="font-size:11px"></i> Add
      </button>
    </div>
    ${current ? `
    <div class="tn-nkv-current">
      <i class="ti ti-coin-euro" style="font-size:15px;color:var(--cc-stone)"></i>
      <span class="tn-nkv-cur-amount">${_rntFmtEUR(current.amount)}&thinsp;/&thinsp;mo</span>
      <span class="tn-nkv-cur-since">seit ${fmtD(current.effective_date)}</span>
    </div>` : `<p class="tn-empty">Noch kein Satz eingetragen.</p>`}
    ${pendingRows}
  </div>
</div>`;
}


/* ── NK VORAUSZAHLUNG VERLAUF MODAL ── */
function _rntNKVorausOpenModal(aptId) {
  const entries = (_rntNKVoraus[aptId] || []).slice();
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };
  const isFuture = (e) => new Date(e.effective_date) > today;

  const pillHTML = (e) => {
    const notPill = e.tenant_notified
      ? `<span class="tn-nkv-pill done"><i class="ti ti-mail"></i> Informiert</span>`
      : `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkNotified('${e.id}','${aptId}','m')">
           <i class="ti ti-mail"></i> Informiert?</button>`;
    const adjPill = e.tenant_adjusted
      ? `<span class="tn-nkv-pill done"><i class="ti ti-refresh"></i> Angepasst</span>`
      : (e.tenant_notified
          ? `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkAdjusted('${e.id}','${aptId}','m')">
               <i class="ti ti-refresh"></i> Angepasst?</button>`
          : `<span class="tn-nkv-pill pending" style="cursor:default;opacity:.4"><i class="ti ti-refresh"></i> Angepasst?</span>`);
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
  const sec = document.getElementById(`nkv-sec-${rid}`);
  if (!sec) return;
  if (sec.querySelector('.tn-nkv-add-form')) { sec.querySelector('input[type=date]')?.focus(); return; }
  const body = sec.querySelector('.tn-sec-body');
  const form = document.createElement('div');
  form.className = 'tn-nkv-add-form';
  form.innerHTML = `
    <input type="date" id="nkv-add-date-${rid}" style="width:130px"/>
    <input type="number" id="nkv-add-amount-${rid}" placeholder="Betrag €" step="0.01" min="0"/>
    <button class="tn-btn tn-btn-primary" style="height:30px;font-size:11px;padding:0 10px"
      onclick="_rntNKVorausConfirmAdd('${aptId}','${rid}')"><i class="ti ti-check"></i></button>
    <button class="tn-btn tn-btn-sm" style="height:30px;font-size:11px;padding:0 10px"
      onclick="this.closest('.tn-nkv-add-form').remove()"><i class="ti ti-x"></i></button>`;
  body.appendChild(form);
  form.querySelector('input[type=date]').focus();
}

async function _rntNKVorausConfirmAdd(aptId, rid) {
  const date   = document.getElementById(`nkv-add-date-${rid}`)?.value?.trim();
  const amount = parseFloat(document.getElementById(`nkv-add-amount-${rid}`)?.value);
  if (!date || isNaN(amount) || amount <= 0) return;
  if (!sbL) return;
  const { data, error } = await sbL.from('rnt_nk_vorauszahlung_history')
    .insert({ apartment_id: aptId, effective_date: date, amount,
              tenant_notified: false, tenant_adjusted: false })
    .select().single();
  if (error) { console.warn('[rnt-tenants] nkv add:', error.message); return; }
  if (!_rntNKVoraus[aptId]) _rntNKVoraus[aptId] = [];
  _rntNKVoraus[aptId].unshift(data);
  _rntNKVoraus[aptId].sort((a,b) => b.effective_date.localeCompare(a.effective_date));
  _rntRender();
}

async function _rntNKVorausMarkNotified(id, aptId, rid) {
  if (!sbL) return;
  const today = new Date().toISOString().slice(0,10);
  const { error } = await sbL.from('rnt_nk_vorauszahlung_history')
    .update({ tenant_notified: true, notified_date: today }).eq('id', id);
  if (error) { console.warn('[rnt-tenants] nkv notified:', error.message); return; }
  const entry = (_rntNKVoraus[aptId] || []).find(e => e.id === id);
  if (entry) { entry.tenant_notified = true; entry.notified_date = today; }
  _rntRenderNKVorausRow(id, aptId, rid);
}

async function _rntNKVorausMarkAdjusted(id, aptId, rid) {
  if (!sbL) return;
  const today = new Date().toISOString().slice(0,10);
  const { error } = await sbL.from('rnt_nk_vorauszahlung_history')
    .update({ tenant_adjusted: true, adjusted_date: today }).eq('id', id);
  if (error) { console.warn('[rnt-tenants] nkv adjusted:', error.message); return; }
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
    ? `<span class="tn-nkv-pill done"><i class="ti ti-mail"></i> Informiert</span>`
    : `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkNotified('${id}','${aptId}','${rid}')">
         <i class="ti ti-mail"></i> Informiert?</button>`;
  const adjPill = entry.tenant_adjusted
    ? `<span class="tn-nkv-pill done"><i class="ti ti-refresh"></i> Angepasst</span>`
    : (entry.tenant_notified
        ? `<button class="tn-nkv-pill pending" onclick="_rntNKVorausMarkAdjusted('${id}','${aptId}','${rid}')">
             <i class="ti ti-refresh"></i> Angepasst?</button>`
        : `<span class="tn-nkv-pill pending" style="cursor:default;opacity:.4"><i class="ti ti-refresh"></i> Angepasst?</span>`);
  const pillsEl = row.querySelector('.tn-nkv-pills');
  if (pillsEl) pillsEl.innerHTML = notPill + adjPill;
}


/* ── STAFFELMIETE SECTION (apartments + parking) ── */
function _rntStaffelHTML(rid, aptId) {
  if (!aptId) return '';
  const entries = _rntStaffel[aptId] || [];
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

  const adjBtn = (e) => e.tenant_adjusted
    ? `<span class="tn-nkv-pill done"><i class="ti ti-check" aria-hidden="true"></i> Angepasst</span>`
    : `<button class="tn-nkv-pill pending" onclick="_rntStaffelMarkAdjusted('${e.id}','${aptId}','${rid}')">
         <i class="ti ti-check" aria-hidden="true"></i> Angepasst?</button>`;

  const nextRow = next ? `
    <div class="tn-nkv-row" id="sf-row-${next.id}">
      <div class="tn-nkv-top">
        <i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0" aria-hidden="true"></i>
        <span class="tn-nkv-date">ab ${fmtD(next.effective_date)}</span>
        <span class="tn-nkv-amount">${_rntFmtEUR(next.amount)}</span>
        ${delBtn(next)}
      </div>
      <div class="tn-nkv-pills">${adjBtn(next)}</div>
    </div>` : '';

  const curDisplay = current
    ? `<div class="tn-nkv-current">
        <i class="ti ti-stairs-up" style="font-size:15px;color:var(--cc-stone)" aria-hidden="true"></i>
        <span class="tn-nkv-cur-amount">${_rntFmtEUR(current.amount)}&thinsp;/&thinsp;mo</span>
        <span class="tn-nkv-cur-since">seit ${fmtD(current.effective_date)}</span>
        ${delBtn(current)}
      </div>`
    : (entries.length ? '' : `<p class="tn-empty">Noch keine Staffelstufen eingetragen.</p>`);

  const verlaufLink = entries.length > 1
    ? `<button class="tn-nkv-verlauf-btn" onclick="_rntStaffelOpenVerlauf('${aptId}','${rid}')">Verlauf</button>`
    : '';

  return `
<div class="tn-sec" id="sf-sec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span class="tn-sec-lbl" style="flex:1">Staffelmiete</span>
      ${verlaufLink}
      <button class="tn-btn tn-btn-sm" style="height:24px;padding:0 9px;font-size:10px"
        onclick="_rntStaffelOpenAdd('${aptId}','${rid}')">
        <i class="ti ti-plus" style="font-size:11px" aria-hidden="true"></i> Add
      </button>
    </div>
    ${curDisplay}
    ${nextRow}
  </div>
</div>`;
}

function _rntStaffelOpenAdd(aptId, rid) {
  const apt = (typeof appApartments !== 'undefined' ? appApartments : []).find(a => a.id === aptId);
  const pk  = apt ? null : (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === aptId);
  const label = apt ? (apt.name || apt.adresse || 'Wohnung') : pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Einheit';
  document.getElementById('rntStaffelModalSub').textContent = label;
  document.getElementById('rntStaffelModalBody').innerHTML = `
    <div class="tn-msec-body" style="padding-top:14px;padding-bottom:4px">
      <div class="tn-fg" style="margin-bottom:14px">
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">Gültig ab</span>
          <input type="date" id="sf-add-date" value="${new Date(Date.now()+31536e6).toISOString().slice(0,10)}"/>
          <span class="tn-flbl" style="font-weight:300;margin-top:2px">Datum, ab dem die neue Kaltmiete gilt</span>
        </div>
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">Neue Kaltmiete (€)</span>
          <input type="number" id="sf-add-amount" placeholder="z.B. 1250" step="0.01" min="0"/>
          <span class="tn-flbl" style="font-weight:300;margin-top:2px">Betrag aus dem Staffelmietvertrag entnehmen</span>
        </div>
      </div>
    </div>
    <div class="tn-sheet-footer">
      <button class="tn-btn tn-btn-ghost" style="flex:1;height:44px;font-size:13px"
        onclick="_rntStaffelModalClose()">Cancel</button>
      <button class="tn-btn tn-btn-primary" style="flex:1;height:44px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--cc-r)"
        onclick="_rntStaffelConfirmAdd('${aptId}','${rid}')">
        <i class="ti ti-check" style="font-size:14px" aria-hidden="true"></i> Save
      </button>
    </div>`;
  document.getElementById('rntStaffelModal').classList.add('open');
  setTimeout(() => document.getElementById('sf-add-date')?.focus(), 80);
}

async function _rntStaffelConfirmAdd(aptId, rid) {
  const date   = document.getElementById('sf-add-date')?.value?.trim();
  const amount = parseFloat(document.getElementById('sf-add-amount')?.value);
  if (!date || isNaN(amount) || amount <= 0) return;
  if (!sbL) return;
  const { data, error } = await sbL.from('rnt_staffelmiete_history')
    .insert({ apartment_id: aptId, effective_date: date, amount, tenant_adjusted: false })
    .select().single();
  if (error) { console.warn('[rnt-tenants] staffel add:', error.message); return; }
  if (!_rntStaffel[aptId]) _rntStaffel[aptId] = [];
  _rntStaffel[aptId].push(data);
  _rntStaffel[aptId].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  _rntStaffelModalClose();
  _rntRender();
}

async function _rntPkStaffelConfirmAdd(pkId, rid) {
  const date   = document.getElementById('sf-add-date')?.value?.trim();
  const amount = parseFloat(document.getElementById('sf-add-amount')?.value);
  if (!date || isNaN(amount) || amount <= 0) return;
  if (!sbL) return;
  const { data, error } = await sbL.from('rnt_staffelmiete_history')
    .insert({ parking_id: pkId, effective_date: date, amount, tenant_adjusted: false })
    .select().single();
  if (error) { console.warn('[rnt-tenants] pk staffel add:', error.message); return; }
  if (!_rntStaffel[pkId]) _rntStaffel[pkId] = [];
  _rntStaffel[pkId].push(data);
  _rntStaffel[pkId].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  _rntStaffelModalClose();
  _rntRender();
}


/* ── STAFFELMIETE SECTION (parking clone) ── */
function _rntPkStaffelHTML(rid, pkId) {
  if (!pkId) return '';
  const entries = _rntStaffel[pkId] || [];
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

  const adjBtn = (e) => e.tenant_adjusted
    ? `<span class="tn-nkv-pill done"><i class="ti ti-check" aria-hidden="true"></i> Angepasst</span>`
    : `<button class="tn-nkv-pill pending" onclick="_rntStaffelMarkAdjusted('${e.id}','${pkId}','${rid}')">
         <i class="ti ti-check" aria-hidden="true"></i> Angepasst?</button>`;

  const nextRow = next ? `
    <div class="tn-nkv-row" id="sf-row-${next.id}">
      <div class="tn-nkv-top">
        <i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0" aria-hidden="true"></i>
        <span class="tn-nkv-date">ab ${fmtD(next.effective_date)}</span>
        <span class="tn-nkv-amount">${_rntFmtEUR(next.amount)}</span>
        ${delBtn(next)}
      </div>
      <div class="tn-nkv-pills">${adjBtn(next)}</div>
    </div>` : '';

  const curDisplay = current
    ? `<div class="tn-nkv-current">
        <i class="ti ti-stairs-up" style="font-size:15px;color:var(--cc-stone)" aria-hidden="true"></i>
        <span class="tn-nkv-cur-amount">${_rntFmtEUR(current.amount)}&thinsp;/&thinsp;mo</span>
        <span class="tn-nkv-cur-since">seit ${fmtD(current.effective_date)}</span>
        ${delBtn(current)}
      </div>`
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
  const pk = (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === pkId);
  const label = pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Stellplatz';
  document.getElementById('rntStaffelModalSub').textContent = label;
  document.getElementById('rntStaffelModalBody').innerHTML = `
    <div class="tn-msec-body" style="padding-top:14px;padding-bottom:4px">
      <div class="tn-fg" style="margin-bottom:14px">
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">Gültig ab</span>
          <input type="date" id="sf-add-date" value="${new Date(Date.now()+31536e6).toISOString().slice(0,10)}"/>
          <span class="tn-flbl" style="font-weight:300;margin-top:2px">Datum, ab dem die neue Kaltmiete gilt</span>
        </div>
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">Neue Kaltmiete (€)</span>
          <input type="number" id="sf-add-amount" placeholder="z.B. 110" step="0.01" min="0"/>
          <span class="tn-flbl" style="font-weight:300;margin-top:2px">Betrag aus dem Staffelmietvertrag entnehmen</span>
        </div>
      </div>
    </div>
    <div class="tn-sheet-footer">
      <button class="tn-btn tn-btn-ghost" style="flex:1;height:44px;font-size:13px"
        onclick="_rntStaffelModalClose()">Cancel</button>
      <button class="tn-btn tn-btn-primary" style="flex:1;height:44px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--cc-r)"
        onclick="_rntPkStaffelConfirmAdd('${pkId}','${rid}')">
        <i class="ti ti-check" style="font-size:14px" aria-hidden="true"></i> Save
      </button>
    </div>`;
  document.getElementById('rntStaffelModal').classList.add('open');
  setTimeout(() => document.getElementById('sf-add-date')?.focus(), 80);
}

function _rntPkStaffelOpenVerlauf(pkId, rid) {
  const pk = (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === pkId);
  const label = pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Stellplatz';
  const entries = (_rntStaffel[pkId] || []).slice();
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };

  const rows = entries.map(e => {
    const isFuture = new Date(e.effective_date) > today;
    const adjTag = e.tenant_adjusted
      ? `<span class="tn-nkv-pill done"><i class="ti ti-check" aria-hidden="true"></i> Angepasst</span>`
      : `<button class="tn-nkv-pill pending" onclick="_rntStaffelMarkAdjusted('${e.id}','${pkId}','m')">
           <i class="ti ti-check" aria-hidden="true"></i> Angepasst?</button>`;
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

async function _rntStaffelMarkAdjusted(id, aptId, rid) {
  if (!sbL) return;
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await sbL.from('rnt_staffelmiete_history')
    .update({ tenant_adjusted: true, adjusted_date: today }).eq('id', id);
  if (error) { console.warn('[rnt-tenants] staffel adjusted:', error.message); return; }
  const entry = (_rntStaffel[aptId] || []).find(e => e.id === id);
  if (entry) { entry.tenant_adjusted = true; entry.adjusted_date = today; }
  _rntRender();
}

async function _rntStaffelDelete(id, aptId, rid) {
  if (!sbL) return;
  const { error } = await sbL.from('rnt_staffelmiete_history').delete().eq('id', id);
  if (error) { console.warn('[rnt-tenants] staffel delete:', error.message); return; }
  if (_rntStaffel[aptId]) _rntStaffel[aptId] = _rntStaffel[aptId].filter(e => e.id !== id);
  _rntRender();
}

function _rntStaffelOpenVerlauf(aptId, rid) {
  const apt = (typeof appApartments !== 'undefined' ? appApartments : []).find(a => a.id === aptId);
  const pk  = apt ? null : (typeof appParking !== 'undefined' ? appParking : []).find(p => p.id === aptId);
  const label = apt ? (apt.name || apt.adresse || 'Wohnung') : pk ? (pk.name || pk.adresse || 'Stellplatz') : 'Einheit';
  const entries = (_rntStaffel[aptId] || []).slice();
  const today   = new Date(); today.setHours(0,0,0,0);
  const fmtD    = (d) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; };

  const rows = entries.map(e => {
    const isFuture = new Date(e.effective_date) > today;
    const adjTag = e.tenant_adjusted
      ? `<span class="tn-nkv-pill done"><i class="ti ti-check" aria-hidden="true"></i> Angepasst</span>`
      : `<button class="tn-nkv-pill pending" onclick="_rntStaffelMarkAdjusted('${e.id}','${aptId}','m')">
           <i class="ti ti-check" aria-hidden="true"></i> Angepasst?</button>`;
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
function _rntFormerSectionHTML(rid, type, unit, formerRecs, archivedRecs) {
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
    const kPill   = !hasK ? '' :
      settled
        ? `<span class="tnp tnp-green">${_rntFmtEUR(recv2)} settled</span>`
        : `<span class="tnp tnp-amber">${_rntFmtEUR(recv2)} refund due</span>`;
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
  <div class="tn-sec-body" style="padding-top:10px;padding-bottom:0">
    <div style="margin-bottom:6px"><span class="tn-sec-lbl">Former tenants</span></div>
  </div>
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
    (allDone ? ` <span class="tnp tnp-green">All closed</span>` : ` <span class="tnp tnp-amber">Open items</span>`);

  document.getElementById('rntModalBody').innerHTML   = _rntModalBodyHTML(rec, isApt);
  document.getElementById('rntModalFooter').innerHTML = _rntModalFooterHTML(rec, allDone);
  document.getElementById('rntModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _rntModalBodyHTML(rec, isApt) {
  const tid  = rec.id || '_draft';
  const full = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const dK   = rec.kaltmiete   != null ? Number(rec.kaltmiete)   : null;
  const dNK  = rec.nebenkosten != null ? Number(rec.nebenkosten) : null;
  const dKS  = rec.kaution_soll != null ? Number(rec.kaution_soll) : null;
  const docs = _rntDocs[tid] || [];
  const getDoc = t => docs.find(d => d.type === t);

  const unitId  = rec.apartment_id || rec.parking_id;
  const unitObj = isApt
    ? appApartments?.find(a => a.id === unitId)
    : appParking?.find(p => p.id === unitId);
  const unitLabel = unitObj?.name || '';

  const docRow = (docType, label) => {
    const doc    = getDoc(docType);
    const signed = !!doc?.file_url;
    const delBtn = signed
      ? `<button class="tn-doc-btn" style="color:#A32D2D;border-color:#F09595"
           onclick="_rntDeleteDoc('${tid}','${docType}','${_rntEsc(doc.id)}')" title="Delete">
           <i class="ti ti-trash"></i></button>`
      : '';
    return `<div class="tn-doc-row">
      <span class="tn-doc-name">${_rntEsc(label)}</span>
      <span class="tnp ${signed ? 'tnp-green' : 'tnp-gray'}">${signed ? 'Signed' : 'Not uploaded'}</span>
      <div class="tn-doc-btns">
        <button class="tn-doc-btn${signed ? '' : ' off'}" onclick="${signed
          ? `_rntViewDoc('${_rntEsc(doc.file_url)}','${_rntEsc(label)}','${_rntEsc(unitLabel)}')`
          : ''}"><i class="ti ti-eye"></i></button>
        ${delBtn}
        <button class="tn-doc-btn" onclick="_rntTriggerUpload('${tid}','${docType}')">
          <i class="ti ti-upload"></i></button>
      </div>
    </div>`;
  };

  const soll = _rntKautionSoll(rec);

  return `
  <!-- PROFILE -->
  <div class="tn-msec" id="mprof-sec-${tid}">
    <div class="tn-msec-body" style="padding-top:10px">
      <div style="margin-bottom:8px"><span class="tn-msec-lbl">Profile</span></div>
      <!-- READ -->
      <div class="tn-fg" id="mprof-read-${tid}">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <span class="tn-fval">${_rntEsc(full) || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <span class="tn-fval">${_rntEsc(rec.birthday||'') || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <span class="tn-fval">${_rntEsc(rec.email||'') || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <span class="tn-fval">${_rntEsc(rec.phone||'') || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move in</span>
          <span class="tn-fval">${_rntFmtDate(rec.mietbeginn) || '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move out</span>
          <span class="tn-fval">${_rntFmtDate(rec.mietende) || '<span class="muted">Not set</span>'}</span></div>
        ${isApt ? `
        <div class="tn-field"><span class="tn-flbl">Kaltmiete</span>
          <span class="tn-fval">${dK != null ? _rntFmtEUR(dK) : '<span class="muted">Not set</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Nebenkosten</span>
          <span class="tn-fval">${dNK != null ? _rntFmtEUR(dNK) : '<span class="muted">Not set</span>'}</span></div>
        ` : `
        <div class="tn-field"><span class="tn-flbl">Parkmiete</span>
          <span class="tn-fval">${dK != null ? _rntFmtEUR(dK) : '<span class="muted">Not set</span>'}</span></div>
        `}
        <div class="tn-field"><span class="tn-flbl">Kaution soll</span>
          <span class="tn-fval">${dKS != null
            ? _rntFmtEUR(dKS) + ' <span style="font-size:10px;color:var(--cc-stone)">(override)</span>'
            : soll != null ? _rntFmtEUR(soll) + ' <span style="font-size:10px;color:var(--cc-stone)">(auto)</span>'
            : '<span class="muted">Not set</span>'}</span></div>
      </div>
      <!-- EDIT -->
      <div class="tn-fg" id="mprof-edit-${tid}" style="display:none">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <input data-mf="name" type="text" value="${_rntEsc(full)}" placeholder="Full name"/></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <input data-mf="birthday" type="text" value="${_rntEsc(rec.birthday||'')}" placeholder="DD.MM.YYYY"/></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <input data-mf="email" type="email" value="${_rntEsc(rec.email||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <input data-mf="phone" type="tel" value="${_rntEsc(rec.phone||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Move in</span>
          <input data-mf="mietbeginn" type="text" value="${_rntFmtDate(rec.mietbeginn)}"/></div>
        <div class="tn-field"><span class="tn-flbl">Move out</span>
          <input data-mf="mietende" type="text" value="${_rntFmtDate(rec.mietende)}" placeholder="DD.MM.YYYY"/></div>
        ${isApt ? `
        <div class="tn-field"><span class="tn-flbl">Kaltmiete</span>
          <input data-mf="kaltmiete" type="number" value="${dK ?? ''}"/></div>
        <div class="tn-field"><span class="tn-flbl">Nebenkosten</span>
          <input data-mf="nebenkosten" type="number" value="${dNK ?? ''}"/></div>
        ` : `
        <div class="tn-field"><span class="tn-flbl">Parkmiete</span>
          <input data-mf="kaltmiete" type="number" value="${dK ?? ''}"/></div>
        `}
        <div class="tn-field" style="flex-direction:column;align-items:stretch;gap:4px">
          <div class="tn-kaut-override-row">
            <span class="tn-kaut-override-lbl">Kaution soll · ${soll ? _rntFmtEUR(soll) : '\u2014'} (auto)</span>
            <label class="tn-kaut-ovr-sw">
              <input type="checkbox" id="mkaut-ovr-${tid}" ${dKS != null ? 'checked' : ''}
                onchange="_rntToggleKautionOverride(this,'mkaut-inp-${tid}','mkaut-hint-${tid}')"/>
              <span class="tn-kaut-ovr-sw__t"></span>
            </label>
            <span style="font-size:10px;color:var(--cc-stone)">Override</span>
          </div>
          <input id="mkaut-inp-${tid}" data-mf="kaution_soll" type="number"
            value="${dKS ?? ''}" placeholder="${soll ?? ''}"
            ${dKS != null ? '' : 'disabled style="opacity:.4"'}/>
        </div>
      </div>
    </div>
    <div class="tn-msec-footer" id="mprof-foot-read-${tid}">
      <button class="tn-btn tn-btn-sm" onclick="_rntToggleModalProfile('${tid}')">
        <i class="ti ti-pencil"></i> Edit</button>
    </div>
    <div class="tn-msec-footer" id="mprof-foot-edit-${tid}" style="display:none">
      <button class="tn-btn tn-btn-sm" onclick="_rntToggleModalProfile('${tid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary" onclick="_rntModalSaveProfile('${tid}')">
        <i class="ti ti-check"></i> Save info</button>
    </div>
  </div>

  <!-- DOCUMENTS -->
  <div class="tn-msec">
    <div class="tn-msec-hdr"><span class="tn-msec-lbl">Documents</span></div>
    <div class="tn-msec-body" style="padding-bottom:11px">
      ${isApt
        ? docRow('mietvertrag','Mietvertrag') + docRow('uebergabeprotokoll','Übergabeprotokoll')
        : docRow('parkplatz_mietvertrag','Parkplatz-Mietvertrag') + docRow('uebergabeprotokoll','Übergabeprotokoll')}
    </div>
  </div>

  <!-- KAUTION -->
  ${_rntKautionHTML('m', tid, 'modal', rec)}

  <!-- NK (apartments only) -->
  ${isApt ? _rntNKHTML('m', tid, 'modal') : ''}

  <!-- NK VORAUSZAHLUNG (apartments only) -->
  ${isApt && rec.apartment_id ? _rntNKVorausHTML('m', rec.apartment_id, 'modal') : ''}
  `;
}

function _rntModalFooterHTML(rec, allDone) {
  return `
    <button class="tn-btn tn-btn-ghost" onclick="_rntMarkDone('${rec.id}')">
      <i class="ti ti-archive"></i> Archive</button>
    <div class="tn-sheet-spacer"></div>
    <button class="tn-btn tn-btn-primary" onclick="_rntModalSaveProfile('${rec.id}')">
      <i class="ti ti-check"></i> Save</button>
    <button class="tn-btn tn-btn-danger"
      style="${allDone ? '' : 'opacity:.35;pointer-events:none'}"
      onclick="_rntDeleteFormer('${rec.id}')">
      <i class="ti ti-trash"></i> Delete</button>
    <span style="font-size:10px;color:var(--cc-stone)">When all closed</span>`;
}

function _rntToggleModalProfile(tid) {
  const read  = document.getElementById('mprof-read-'      + tid);
  const edit  = document.getElementById('mprof-edit-'      + tid);
  const fread = document.getElementById('mprof-foot-read-' + tid);
  const fedit = document.getElementById('mprof-foot-edit-' + tid);
  if (!read || !edit) return;
  const isEditing = read.style.display === 'none';
  read.style.display  = isEditing ? '' : 'none';
  edit.style.display  = isEditing ? 'none' : '';
  if (fread) fread.style.display = isEditing ? '' : 'none';
  if (fedit) fedit.style.display = isEditing ? 'none' : '';
}

function _rntCloseModal() {
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

  const isApt   = unitType === 'apt';
  const mietende = p.mietende;
  const status   = (mietende && _rntIsPast(mietende)) ? 'former' : 'active';

  const liveKalt = isApt ? (_rntAptPricing(unitId).kaltmiete ?? null) : (_rntPkPricing(unitId).miete ?? null);
  const liveNK   = isApt ? (_rntAptPricing(unitId).nebenkosten ?? null) : null;

  const payload = {
    apartment_id: isApt ? unitId : null,
    parking_id:   isApt ? null   : unitId,
    status, contract_type: 'mietvertrag',
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende,
    first_name_2: p.first_name_2 || null, last_name_2: p.last_name_2 || null,
    email_2: p.email_2 || null, phone_2: p.phone_2 || null, birthday_2: p.birthday_2 || null, address_2: p.address_2 || null,
    first_name_3: p.first_name_3 || null, last_name_3: p.last_name_3 || null,
    email_3: p.email_3 || null, phone_3: p.phone_3 || null, birthday_3: p.birthday_3 || null, address_3: p.address_3 || null,
    kaltmiete:   p.kaltmiete   ?? (mietende ? liveKalt : null) ?? null,
    nebenkosten: isApt ? (p.nebenkosten ?? (mietende ? liveNK : null) ?? null) : null,
    kaution_soll: p.kaution_soll ?? null,
  };

  const { data, error } = await sbL.from('rnt_tenant_records').insert(payload).select().single();
  if (error) {
    console.warn('[rnt-tenants] create:', error.message);
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  // Flip vacant flag on unit
  if (status === 'active') {
    if (isApt) {
      await sbL.from('rentals_apartments').update({ vacant: false }).eq('id', unitId);
      const a = appApartments?.find(a => a.id === unitId);
      if (a) { a.vacant = false; _aptRerenderCard?.(unitId); }
    } else {
      await sbL.from('rentals_parking').update({ vacant: false }).eq('id', unitId);
      const p = appParking?.find(p => p.id === unitId);
      if (p) p.vacant = false;
    }
  }

  await _rntEnsureKaution(data.id);
  await _rntLoad();
}

async function _rntSaveProfile(rid, tid, unitType, unitId) {
  if (!sbL) return;
  const sec = document.getElementById('pedit-' + rid);
  if (!sec) return;
  const btn = document.getElementById('pfoot-edit-' + rid)?.querySelector('.tn-btn-primary');
  if (btn) { btn.textContent = '\u2026'; btn.disabled = true; }

  const p   = _rntCollectProfile(sec, 'data-f');
  const rec = _rntRecords.find(r => r.id === tid);
  if (!p.first_name && !p.last_name && !p.email) {
    const inp = sec.querySelector('[data-f="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  const isApt    = unitType === 'apt';
  const toFormer = !!(p.mietende && _rntIsPast(p.mietende) && rec?.status === 'active');
  const toActive = rec?.status === 'former' && (!p.mietende || !_rntIsPast(p.mietende));

  const update = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende: p.mietende,
    first_name_2: p.first_name_2 || null, last_name_2: p.last_name_2 || null,
    email_2: p.email_2 || null, phone_2: p.phone_2 || null, birthday_2: p.birthday_2 || null, address_2: p.address_2 || null,
    first_name_3: p.first_name_3 || null, last_name_3: p.last_name_3 || null,
    email_3: p.email_3 || null, phone_3: p.phone_3 || null, birthday_3: p.birthday_3 || null, address_3: p.address_3 || null,
    kaltmiete:    p.kaltmiete   ?? null,
    nebenkosten:  isApt ? (p.nebenkosten ?? null) : null,
    kaution_soll: p.kaution_soll ?? null,
  };

  if (toFormer) {
    update.status = 'former';
    update.contract_type = 'mietvertrag';
    if (!p.kaltmiete && isApt) update.kaltmiete   = _rntAptPricing(unitId).kaltmiete ?? null;
    if (!p.nebenkosten && isApt) update.nebenkosten = _rntAptPricing(unitId).nebenkosten ?? null;
    // flip unit back to vacant
    if (isApt) {
      sbL.from('rentals_apartments').update({ vacant: true }).eq('id', unitId);
      const a = appApartments?.find(a => a.id === unitId);
      if (a) { a.vacant = true; _aptRerenderCard?.(unitId); }
    } else {
      sbL.from('rentals_parking').update({ vacant: true }).eq('id', unitId);
      const pp = appParking?.find(p => p.id === unitId);
      if (pp) pp.vacant = true;
    }
  }
  if (toActive) {
    update.status = 'active';
    update.contract_type = null;
    update.done = false;
    // flip unit back to occupied
    if (isApt) {
      sbL.from('rentals_apartments').update({ vacant: false }).eq('id', unitId);
      const a = appApartments?.find(a => a.id === unitId);
      if (a) { a.vacant = false; _aptRerenderCard?.(unitId); }
    } else {
      sbL.from('rentals_parking').update({ vacant: false }).eq('id', unitId);
      const pp = appParking?.find(p => p.id === unitId);
      if (pp) pp.vacant = false;
    }
  }

  const { error } = await sbL.from('rnt_tenant_records').update(update).eq('id', tid);
  if (error) { console.warn('[rnt-tenants] save profile:', error.message); }
  await _rntEnsureKaution(tid);
  await _rntLoad();
}

async function _rntSaveRent(rid, tid, unitType, unitId) {
  if (!sbL || !tid) return;
  const isApt = unitType === 'apt';
  const kalt  = parseFloat(document.getElementById('rf-kalt-' + rid)?.value) || null;
  const nk    = isApt ? (parseFloat(document.getElementById('rf-nk-' + rid)?.value) || null) : null;
  const ksollOvr = document.getElementById('rf-ksoll-ovr-' + rid);
  const ksollInp = document.getElementById('rf-ksoll-' + rid);
  const ksoll = (ksollOvr?.checked && ksollInp) ? (parseFloat(ksollInp.value) || null) : null;

  const { error } = await sbL.from('rnt_tenant_records')
    .update({ kaltmiete: kalt, nebenkosten: nk, kaution_soll: ksoll }).eq('id', tid);
  if (error) { console.warn('[rnt-tenants] save rent:', error.message); return; }

  const rec = _rntRecords.find(r => r.id === tid);
  if (rec) { rec.kaltmiete = kalt; rec.nebenkosten = nk; rec.kaution_soll = ksoll; }

  const bar = document.getElementById('rbar-' + rid);
  if (bar && isApt) {
    const liveP = _rntAptPricing(unitId);
    const rKalt = kalt ?? liveP.kaltmiete ?? null;
    const rNK   = nk   ?? liveP.nebenkosten ?? null;
    const rWarm = (rKalt != null && rNK != null) ? rKalt + rNK : null;
    const vals  = bar.querySelectorAll('.tn-rval');
    if (vals[0]) vals[0].textContent = rKalt != null ? _rntFmtEUR(rKalt) : '\u2014';
    if (vals[1]) vals[1].textContent = rNK   != null ? _rntFmtEUR(rNK)   : '\u2014';
    if (vals[2]) vals[2].textContent = rWarm != null ? _rntFmtEUR(rWarm) : '\u2014';
  } else if (bar) {
    const liveP = _rntPkPricing(unitId);
    const rMiete = kalt ?? liveP.miete ?? null;
    const vals = bar.querySelectorAll('.tn-rval');
    if (vals[0]) vals[0].textContent = rMiete != null ? _rntFmtEUR(rMiete) : '\u2014';
  }

  _rntToggleRentEdit(rid);
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
  const update = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    mietbeginn: p.mietbeginn, mietende: p.mietende,
    contract_type: rec?.status === 'former' ? 'mietvertrag' : null,
    kaltmiete:    p.kaltmiete   ?? null,
    nebenkosten:  p.nebenkosten ?? null,
    kaution_soll: p.kaution_soll ?? null,
  };

  const toActive = rec?.status === 'former' && (!p.mietende || !_rntIsPast(p.mietende));
  if (toActive) { update.status = 'active'; update.contract_type = null; update.done = false; }

  if (rec) Object.assign(rec, update);

  sbL.from('rnt_tenant_records').update(update).eq('id', tid)
    .then(({ error }) => { if (error) console.warn('[rnt-tenants] modal save:', error.message); });

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
  if (saveBtn) saveBtn.classList.add('tn-btn-primary');
}

async function _rntSaveKautionBtn(pfx, tid) {
  if (!sbL || !tid) return;
  const recv    = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret     = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const saveBtn = document.getElementById('ksave-' + pfx);
  if (saveBtn) { saveBtn.textContent = '\u2026'; saveBtn.disabled = true; }
  await _rntSaveKaution(tid, recv, ret);
  const k   = _rntKaution[tid];
  const st  = _rntKautionStatus(recv, ret, k?.settled || false);
  const pill = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }
  const _rec = _rntRecords.find(r => r.id === tid);
  if (_rec) {
    const _rid   = (_rec.apartment_id ? 'apt_' : 'pk_') + (_rec.apartment_id || _rec.parking_id).replace(/-/g,'').slice(0,12);
    const hdrPill = document.getElementById('hdr-kpill-' + _rid);
    if (hdrPill) {
      const newPills = [];
      const days2 = _rntDaysToMoveOut(_rec);
      if (days2 !== null && days2 >= 0 && days2 <= 60)
        newPills.push(`<span class="tnp tnp-red">Move-out in ${days2} day${days2===1?'':'s'}</span>`);
      if (_rntNkHasOpen(tid))
        newPills.push(`<span class="tnp tnp-red">NK open</span>`);
      if (recv > 0 && !k?.settled)
        newPills.push(`<span class="tnp tnp-blue">${_rntFmtEUR(recv)} Kaution</span>`);
      hdrPill.innerHTML = newPills.slice(0,2).join('');
    }
  }
  if (saveBtn) {
    saveBtn.innerHTML = '<i class="ti ti-check"></i> Saved';
    saveBtn.disabled  = false;
    saveBtn.classList.remove('tn-btn-primary');
    setTimeout(() => { if (saveBtn) saveBtn.innerHTML = 'Save'; }, 1500);
  }
}

async function _rntSaveKaution(tid, received, returned) {
  if (!sbL) return;
  if (!_rntKaution[tid]) await _rntEnsureKaution(tid);
  const k = _rntKaution[tid];
  if (!k?.id) return;
  k.received = received; k.returned = returned;
  await sbL.from('rnt_kaution').update({ received, returned }).eq('id', k.id);
  _rntRefreshFormerBadges(tid);
}

async function _rntToggleSettle(pfx, tid) {
  if (!sbL || !tid) return;
  if (!_rntKaution[tid]) await _rntEnsureKaution(tid);
  const k = _rntKaution[tid];
  if (!k?.id) return;
  k.settled = !k.settled;
  const btn = document.getElementById('kset-' + pfx);
  if (btn) {
    btn.innerHTML = `<i class="ti ti-check"></i> ${k.settled ? 'Settled' : 'Mark settled'}`;
    btn.className = `tn-btn ${k.settled ? 'tn-btn-primary' : 'tn-btn-sm'}`;
  }
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const st   = _rntKautionStatus(recv, ret, k.settled);
  const pill = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }
  sbL.from('rnt_kaution').update({ settled: k.settled }).eq('id', k.id)
    .then(({ error }) => { if (error) console.warn('[rnt-tenants] settle:', error.message); });
  _rntRefreshFormerBadges(tid);
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

async function _rntConfirmAddNk(tid, inp, wrap, addBtn) {
  const period = inp.value.trim();
  if (!period || !sbL) return;
  const { data, error } = await sbL.from('rnt_nk_entries')
    .insert({ tenant_id: tid, period, sent:false, paid:false }).select().single();
  if (error) { console.warn('[rnt-tenants] add NK:', error.message); return; }
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
  if (error) { console.warn('[rnt-tenants] delete NK:', error.message); return; }
  if (_rntNK[tid]) _rntNK[tid] = _rntNK[tid].filter(e => e.id !== nkId);
  if (_rntModalTid === tid) { _rntOpenModal(tid); } else { _rntRender(); }
}


/* ══════════════════════════════════════════════════════════════
   16. DOCUMENTS
══════════════════════════════════════════════════════════════ */
function _rntTriggerUpload(tid, type) {
  _rntUploadTid  = tid;
  _rntUploadType = type;
  const inp = document.getElementById('rntFileInput');
  if (inp) { inp.value = ''; inp.click(); }
}

async function _rntViewDoc(fileUrl, label, unitLabel) {
  if (!fileUrl || !sbL) return;
  const { data, error } = await sbL.storage
    .from('rnt-tenant-documents').createSignedUrl(fileUrl, 300);
  const url = data?.signedUrl;
  if (!url) { _rntToast('Could not open document', true); return; }

  const ext      = fileUrl.split('.').pop().split('?')[0].toLowerCase() || 'pdf';
  const safeName = (label || 'Dokument').replace(/\s+/g, '_');
  const safeUnit = (unitLabel || '').replace(/\s+/g, '_');
  const filename = safeUnit ? `${safeName}_${safeUnit}.${ext}` : `${safeName}.${ext}`;

  const overlay  = document.getElementById('tnDocViewer');
  const frame    = document.getElementById('tnDocViewerFrame');
  if (!overlay || !frame) { window.open(url, '_blank'); return; }

  document.getElementById('tnDocViewerTitle').textContent = label
    ? `${label}${unitLabel ? ' · ' + unitLabel : ''}` : 'Dokument';
  frame.src = `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}`;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.style.display = 'none';
    frame.src = '';
    document.body.style.overflow = '';
    document.getElementById('tnDocViewerClose').onclick = null;
    document.getElementById('tnDocViewerDownload').onclick = null;
  };
  document.getElementById('tnDocViewerClose').onclick = close;
  document.getElementById('tnDocViewerDownload').onclick = async () => {
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const bUrl = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = bUrl; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(bUrl); a.remove(); }, 1000);
    } catch { window.open(url, '_blank'); }
  };
}

async function _rntHandleUpload(file) {
  if (!file || !_rntUploadTid || !_rntUploadType || !sbL) return;
  const rec      = _rntRecords.find(r => r.id === _rntUploadTid);
  const unitId   = rec?.apartment_id || rec?.parking_id || 'unknown';
  const ext      = file.name.split('.').pop() || 'pdf';
  const path     = `${unitId}/${_rntUploadTid}/${_rntUploadType}.${ext}`;

  const { error: upErr } = await sbL.storage
    .from('rnt-tenant-documents').upload(path, file, { upsert:true, contentType:file.type });
  if (upErr) { _rntToast('Upload failed', true); return; }

  const { data: docData, error: docErr } = await sbL.from('rnt_tenant_documents')
    .upsert({ tenant_id: _rntUploadTid, type: _rntUploadType, file_url: path },
            { onConflict: 'tenant_id,type' }).select().single();
  if (docErr) { console.warn('[rnt-tenants] doc upsert:', docErr.message); return; }

  const tid = _rntUploadTid;
  if (!_rntDocs[tid]) _rntDocs[tid] = [];
  const idx = _rntDocs[tid].findIndex(d => d.type === _rntUploadType);
  if (idx >= 0) _rntDocs[tid][idx] = docData;
  else          _rntDocs[tid].push(docData);

  if (_rntModalTid === tid) { _rntOpenModal(tid); } else { _rntRender(); }
  _rntToast('Document uploaded \u2713');
}

async function _rntDeleteDoc(tid, type, docId) {
  if (!sbL) return;
  if (!confirm('Delete this document? This cannot be undone.')) return;
  const doc = (_rntDocs[tid] || []).find(d => d.id === docId);
  if (doc?.file_url) await sbL.storage.from('rnt-tenant-documents').remove([doc.file_url]);
  const { error } = await sbL.from('rnt_tenant_documents').delete().eq('id', docId);
  if (error) { console.warn('[rnt-tenants] delete doc:', error.message); return; }
  if (_rntDocs[tid]) _rntDocs[tid] = _rntDocs[tid].filter(d => d.id !== docId);
  if (_rntModalTid === tid) { _rntOpenModal(tid); } else { _rntRender(); }
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
function _rntAddFormer(unitType, unitId) {
  const draft = {
    id: null,
    apartment_id: unitType === 'apt'     ? unitId : null,
    parking_id:   unitType === 'parking' ? unitId : null,
    status: 'former', contract_type: 'mietvertrag',
    first_name: null, last_name: null, email: null, phone: null,
    birthday: null, address: null, mietbeginn: null, mietende: null,
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
  document.getElementById('rntModalFooter').innerHTML = `
    <div class="tn-sheet-spacer"></div>
    <button class="tn-btn tn-btn-sm" onclick="_rntCloseModal()">Cancel</button>
    <button class="tn-btn tn-btn-primary" onclick="_rntModalSaveDraft()">
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

  const isApt = !!draft.apartment_id;

  const { data, error } = await sbL.from('rnt_tenant_records')
    .insert({
      apartment_id:  draft.apartment_id,
      parking_id:    draft.parking_id,
      status: 'former', contract_type: 'mietvertrag',
      first_name: p.first_name, last_name: p.last_name,
      email: p.email, phone: p.phone, birthday: p.birthday,
      address: p.address, mietbeginn: p.mietbeginn, mietende: p.mietende,
      kaltmiete:   p.kaltmiete   ?? null,
      nebenkosten: isApt ? (p.nebenkosten ?? null) : null,
      kaution_soll: p.kaution_soll ?? null,
    })
    .select().single();

  if (error) {
    console.warn('[rnt-tenants] add former:', error.message);
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  await _rntEnsureKaution(data.id);
  _rntRecords.push(data);
  _rntNK[data.id]   = [];
  _rntDocs[data.id] = [];
  modal._draft = null;

  _rntCloseModal();
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
    .then(({ error }) => { if (error) console.warn('[rnt-tenants] archive:', error.message); });
}

async function _rntReopen(tid) {
  if (!sbL) return;
  const rec = _rntRecords.find(r => r.id === tid);
  if (rec) { rec.done = false; rec.status = 'former'; }
  _rntRender();
  sbL.from('rnt_tenant_records').update({ done:false, status:'former' }).eq('id', tid)
    .then(({ error }) => { if (error) console.warn('[rnt-tenants] reopen:', error.message); });
}

async function _rntHideFormer(tid) {
  if (!sbL) return;
  const rec = _rntRecords.find(r => r.id === tid);
  if (rec) { rec.done = true; rec.status = 'archived'; }
  _rntRender();
  sbL.from('rnt_tenant_records').update({ done:true, status:'archived' }).eq('id', tid)
    .then(({ error }) => { if (error) console.warn('[rnt-tenants] hide:', error.message); });
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
        const recv2  = k ? Number(k.received) : 0;
        const kPill  = !hasK ? '' :
          settled
            ? `<span class="tnp tnp-green">Settled</span>`
            : `<span class="tnp tnp-amber">Refund pending</span>`;
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

  const summaryEl = document.getElementById('rnt-kaution-summary');
  if (summaryEl) {
    const totalHeld = _rntRecords
      .filter(r => { const kk = _rntKaution[r.id]; return kk && kk.received > 0 && !kk.settled; })
      .reduce((sum, r) => sum + Number(_rntKaution[r.id].received), 0);
    if (totalHeld > 0) {
      summaryEl.innerHTML = `<i class="ti ti-safe" style="font-size:13px"></i> Kaution held: <strong>${_rntFmtEUR(totalHeld)}</strong>`;
      summaryEl.style.display = 'flex';
    } else {
      summaryEl.style.display = 'none';
    }
  }
}


/* ══════════════════════════════════════════════════════════════
   19. EVENT BINDS
══════════════════════════════════════════════════════════════ */
function _rntBindCards() {
  const inp = document.getElementById('rntFileInput');
  if (inp && !inp._rntBound) {
    inp._rntBound = true;
    inp.addEventListener('change', () => { if (inp.files?.[0]) _rntHandleUpload(inp.files[0]); });
  }
}


/* ══════════════════════════════════════════════════════════════
   20. ENTRY POINT
══════════════════════════════════════════════════════════════ */
async function loadRntTenants() {
  if (!appApartments?.length) await loadApartments?.();
  if (!appParking?.length)    await loadParking?.();
  await _rntLoad();
}
