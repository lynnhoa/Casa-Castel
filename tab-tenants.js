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
  <div class="tn-hdr" style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
    <h1 class="cc-h1">Tenants</h1>
  </div>
  <!-- IST line: what the tenants living here pay today + Kaution held (Rooms shows the Soll) -->
  <div class="cc-sumline" id="tn-ist" style="display:none;margin-bottom:10px"></div>
  <div id="tn-open-summary" class="tn-open-summary" style="display:none"></div>
  <div class="tn-list" id="tenantsList"></div>


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

  <div class="tn-overlay" id="tnNKVorausModal" onclick="_tnNKVorausModalOutside(event)">
    <div class="tn-sheet" id="tnNKVorausSheet" style="max-height:70vh">
      <div class="tn-sheet-hdr">
        <div style="flex:1;min-width:0">
          <div class="tn-sheet-name" id="tnNKVorausModalTitle">Nebenkostenerhöhungen</div>
          <div class="tn-sheet-sub" id="tnNKVorausModalSub"></div>
        </div>
        <button class="tn-icon-btn" onclick="_tnNKVorausModalClose()" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="tn-sheet-body" id="tnNKVorausModalBody"></div>
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
  border-radius:var(--cc-r-lg) var(--cc-r-lg) 0 0; overflow:hidden;
  -webkit-tap-highlight-color:transparent; }
.tn-hdr-top { display:flex; align-items:center; gap:8px; }
.tn-room-lbl { font-size:10px; font-weight:500; letter-spacing:.09em;
  text-transform:uppercase; color:var(--cc-taupe); }
.tn-chev { font-size:18px; color:var(--cc-stone); flex-shrink:0; margin-left:0;
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
.tn-body { border-top:var(--cc-border); display:none; border-radius:0 0 var(--cc-r-lg) var(--cc-r-lg); overflow:hidden; }
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
/* Former tenant with open items: one line under the card header, clearly apart from the current tenant */
.tn-former-line { display:flex; align-items:center; gap:8px; width:100%; margin:0; padding:9px 14px 10px;
  background:var(--cc-bg); border:none; border-top:var(--cc-border); font-family:inherit; text-align:left;
  cursor:pointer; -webkit-tap-highlight-color:transparent; }
.tn-former-line:active { background:var(--cc-surface); }
.tn-fl-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }
.tn-fl-top { display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
.tn-fl-lbl { font-size:9.5px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-taupe); }
.tn-fl-name { font-size:12px; color:var(--cc-charcoal); }
.tn-fl-out { font-size:11px; color:var(--cc-taupe); }
.tn-fl-pills { display:flex; gap:4px; flex-wrap:wrap; }
.tn-fl-chev { font-size:15px; color:var(--cc-stone); }
.tn-card.open .tn-former-line { display:none; }   /* opened card: the Former tenants list at the bottom shows them */
.tn-open-summary { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:-12px 0 16px; }
.tn-open-lbl { font-size:11px; color:var(--cc-taupe); }
/* Running contract: its name and dates inside the beige bar */
.tn-rent-wrap { background:var(--cc-surface); border-bottom:var(--cc-border); }
.tn-rent-wrap .tn-rent-bar { border-bottom:none; background:transparent; }
.tn-rtitle { display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; padding:10px 14px 0; }
.tn-rent-wrap .tn-rc:first-child { padding-left:14px; }
.tn-rt-name { font-size:13px; font-weight:500; color:var(--cc-charcoal); }
.tn-rt-dates { font-size:11px; color:var(--cc-taupe); }
/* One contract as a line (next contract · earlier contracts) */
.tn-cstrip { border-bottom:var(--cc-border); }
.tn-cstrip .cc-inline-panel { padding:0 14px 12px; }
.tn-crow { display:flex; align-items:center; gap:8px; width:100%; padding:10px 14px; background:none; border:none;
  font-family:inherit; text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.tn-crow:active { background:var(--cc-surface); }
.tn-crow-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
.tn-crow-top { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.tn-crow-name { font-size:13px; color:var(--cc-charcoal); }
.tn-crow-sub { font-size:11px; color:var(--cc-taupe); }
.tn-crow-amt { display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0; }
.tn-crow-warm { font-size:14px; font-weight:500; color:var(--cc-charcoal); }
.tn-crow-chev { font-size:15px; color:var(--cc-stone); }
.tn-cstrip--due { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#FAEEDA; }
.tn-cstrip--quiet { display:flex; align-items:center; gap:10px; padding:8px 14px; }
.tn-cstrip-qtxt { flex:1; font-size:12px; color:var(--cc-taupe); }
.tn-cstrip-txt { flex:1; font-size:12px; line-height:1.4; color:#633806; }
.tn-earlier .tn-arc-toggle { color:var(--cc-taupe); border:none; }
.tn-earlier-body { background:var(--cc-surface); }
.tn-earlier-body .tn-crow { border-top:var(--cc-border); }
.tn-earlier-body .tn-crow-name, .tn-earlier-body .tn-crow-warm { color:var(--cc-taupe); }
.tn-earlier .cc-inline-panel { padding:0 14px 12px; background:var(--cc-surface); }


/* ── RENT FORM ── */
.tn-rent-form { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px;
  padding:10px 14px 12px; border-bottom:var(--cc-border); }
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
.tn-pw-need { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:10px 0 2px; padding:9px 11px;
  background:#FAEEDA; border:.5px solid #EF9F27; border-radius:8px; font-size:12px; line-height:1.4; color:#633806; }
.tn-pw-need span { flex:1; min-width:150px; }
.tn-pw-need .tn-btn { background:var(--cc-white); }
.tn-pw-test { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 12px; padding:9px 11px;
  background:var(--cc-bg); border:var(--cc-border); border-radius:8px; font-size:12px; line-height:1.4; color:var(--cc-charcoal); }
.tn-pw-test i { color:var(--cc-taupe); }
.tn-pw-test span { flex:1; min-width:150px; }

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
#tab-tenants .tn-field input { font-size:12px !important; }
#tab-tenants .tn-rf input { font-size:12px !important; }
#tab-tenants .tn-kc-input { font-size:11px !important; }
#tab-tenants .tn-nk-add-form input { font-size:12px !important; }
.tn-contract-toggle { display:flex; gap:4px; margin-top:4px; }
.tn-ct-next { font-size:11px; color:#8C5A30; }
.tn-ve-missing { color:#854F0B; font-weight:500; }

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
.tn-doc-row { display:flex; align-items:center; gap:8px; padding:6px 0; }
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
.tn-kaut-override-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.tn-kaut-override-lbl { font-size:10px; color:var(--cc-stone); flex:1; }
.tn-kaut-ovr-sw { position:relative; width:32px; height:18px; flex-shrink:0; }
.tn-kaut-ovr-sw input { opacity:0; width:0; height:0; position:absolute; }
.tn-kaut-ovr-sw__t { position:absolute; inset:0; background:var(--cc-rule); border-radius:9px; transition:background .2s; cursor:pointer; }
.tn-kaut-ovr-sw__t::after { content:''; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:white; transition:transform .2s; box-shadow:0 1px 2px rgba(0,0,0,.15); }
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

/* ── NK VORAUSZAHLUNG ── */
.tn-nkv-current { display:flex; align-items:center; gap:8px;
  padding:7px 10px; background:var(--cc-surface);
  border-radius:var(--cc-r-sm); margin-bottom:10px; }
.tn-nkv-cur-amount { font-size:13px; font-weight:500;
  color:var(--cc-charcoal); flex:1; }
.tn-nkv-cur-since { font-size:10px; color:var(--cc-stone); white-space:nowrap; }
.tn-nkv-row { display:flex; flex-direction:column; gap:6px;
  padding:8px 0; border-bottom:var(--cc-border); }
.tn-nkv-row:last-of-type { border-bottom:none; }
.tn-nkv-top { display:flex; align-items:center; gap:8px; }
.tn-nkv-date { font-size:11px; color:var(--cc-taupe); flex:1; }
.tn-nkv-amount { font-size:13px; font-weight:500; color:var(--cc-charcoal); }
.tn-nkv-amount.past { font-weight:400; color:var(--cc-stone); }
.tn-nkv-pills { display:flex; gap:5px; flex-wrap:wrap; padding-left:20px; }
.tn-nkv-pill { display:inline-flex; align-items:center; gap:3px;
  font-size:10px; font-weight:500; padding:2px 8px;
  border-radius:var(--cc-r-pill); white-space:nowrap;
  cursor:default; font-family:inherit; border:none; }
.tn-nkv-pill.done { background:#EAF3DE; color:#27500A; }
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
.tn-former-info { flex:1; min-width:0; }
.tn-former-name { font-size:11px; font-weight:400; color:var(--cc-taupe); }
.tn-former-period { font-size:11px; color:var(--cc-stone); }
.tn-former-pills { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
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
.tn-nudge-name { font-size:10px; color:#854F0B; flex:1; }
.tn-nudge-kept { font-size:10px; font-weight:600; color:#633806; }
.tn-nudge-status { font-size:9px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:#BA7517; }
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
#tab-tenants .tn-del-btn { color:#A32D2D !important; border-color:#F09595 !important; margin-right:auto; }

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
let _tnLoaded     = false;
let _tnRoomsWired = false;

let _tnRecords      = [];
let _tnKaution      = {};
let _tnNK           = {};
let _tnDocs         = {};
let _tnProfileCache = {};
let _tnShowOlder    = {};
let _tnOpenCards    = new Set();
let _tnModalTid     = null;
let _tnUploadTid    = null;
let _tnUploadType   = null;
let _tnDeleteId     = null;
let _tnKautTimers   = {};
let _tnNKVoraus     = {}; // room → [{id, room, effective_date, amount, tenant_notified, notified_date, tenant_adjusted, adjusted_date}]
let _tnMh           = {}; // room → Mieterhöhungen [{id, room, tenant_id, effective_date, amount, kind, tenant_adjusted, ignored}] (casa_mieterhoehung_history)


/* ══════════════════════════════════════════════════════════════
   4. PRICING HELPERS
══════════════════════════════════════════════════════════════ */
/* Contract types of a Casa Castel tenancy (Oct 2026):
   'kurzzeit' (shown as befristet / Kurzzeit) · 'jahres' (Jahresvertrag, ends 31.08.,
   renewed yearly, Mietvertrag prices) · 'mietvertrag' (unbefristet).
   Kurzzeit + Jahresvertrag have a contract end and can be renewed.            */
function _tnIsFixed(t) { return t === 'kurzzeit' || t === 'jahres'; }
function _tnRoomContractType(room) {
  if (typeof appRooms === 'undefined') return null;
  const r = appRooms.find(x => x.name === room);
  if (!r) return null;
  const hasMv = !!(r.kaltmiete || r.mietvertrag_miete); // Pauschal or Kalt+NK
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
  const hasMv = !!(r.kaltmiete || r.mietvertrag_miete);
  const hasKz = !!r.kurzzeit_kaltmiete;
  if (hasMv) types.push('mietvertrag');
  if (hasKz) types.push('kurzzeit');
  return types;
}

function _tnRoomPricing(room, ctypeArg) {
  if (typeof appRooms === 'undefined') return {};
  const r = appRooms.find(x => x.name === room);
  if (!r) return {};
  const ctype = ctypeArg || _tnRoomContractType(room);   // the tenancy's type; the room's offer only as a fallback
  let kaltmiete = null, nebenkosten = null;
  if (ctype === 'jahres' && typeof ccRoomJahresOwn === 'function' && ccRoomJahresOwn(r)) {   // its own baseline
    const fx = Number(r.jahres_kaution) > 0 ? Number(r.jahres_kaution) : null;
    return { kaltmiete: Number(r.jahres_kaltmiete) || null, nebenkosten: Number(r.jahres_nk) || null,
             kaution_override: !!fx, kaution_fixed: fx };
  }
  if (ctype === 'mietvertrag' || ctype === 'jahres') {   // Jahresvertrag without its own price: the Mietvertrag price
    if (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) {
      kaltmiete   = Number(r.kaltmiete)    || null;
      nebenkosten = Number(r.nk_pauschale) || null;
    } else if (r.kaltmiete) {
      // Pauschal with direct kaltmiete field (standard setup)
      kaltmiete   = Number(r.kaltmiete)    || null;
      nebenkosten = Number(r.nk_pauschale) || null;
    } else if (r.mietvertrag_miete) {
      // Legacy: total in mietvertrag_miete, derive kaltmiete by subtracting NK
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

function _tnToggleKautionOverride(el, inputId, hintId) {
  const on = el.checked;
  const inp = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  if (inp) { inp.disabled = !on; inp.style.opacity = on ? '1' : '.4'; if (on) inp.focus(); }
  if (hint) hint.style.display = on ? 'none' : '';
}

/* Soll + where it comes from — ONE source for Kaution section, rent form and pop-up.
   Individuell · Mieter (set on the tenant) → Individuell · Karte (room card) → Standard (rule). */
function _tnKautionSollInfo(rec) {
  if (!rec) return null;
  if (rec.kaution_soll != null && rec.kaution_soll !== '') return { amount: Number(rec.kaution_soll), text: 'Fest seit Einzug' };
  const ctype = _tnBaseContractType(rec) || _tnRoomContractType(rec.room);   // the first contract of this tenancy
  const p = _tnRoomPricing(rec.room, ctype);
  if (p.kaution_override && p.kaution_fixed != null && p.kaution_fixed !== '') return { amount: Number(p.kaution_fixed), text: 'Individuell \u00b7 Karte' };
  { // the tenant's own rent at move-in (their first contract) — today's room price only if no rent is known
    const own = _tnContracts(rec)[0];
    const a = own && own.amt;
    if (a && a.total > 0 && typeof ccKaution === 'function') {
      const kz = ctype === 'kurzzeit', pa = a.mode === 'pauschal';
      const amount = ccKaution({ contract: kz ? 'kurzzeit' : 'mietvertrag', mode: pa ? 'pauschal' : 'kalt_nk',
        kalt: pa ? a.total : a.kalt, nk: pa ? 0 : a.nk, start: rec.mietbeginn, end: rec.mietende }).amount;
      if (amount != null) {
        const rule = typeof ccKautionRuleText === 'function'
          ? ccKautionRuleText(kz ? 'kurzzeit' : 'mietvertrag', pa ? 'pauschal' : 'kalt_nk', rec.mietbeginn, rec.mietende) : '';
        return { amount, text: 'Standard' + (rule ? ' \u00b7 ' + rule : '') + ' \u00b7 own rent' };
      }
    }
  }
  const amount = _tnKautionSoll(rec.room, rec.mietbeginn, rec.mietende, ctype);
  if (amount == null) return null;
  const r = typeof appRooms !== 'undefined' ? appRooms.find(x => x.name === rec.room) : null;
  const isPauschal = ctype === 'kurzzeit' ? (r?.kurzzeit_pricing || 'pauschal') !== 'kalt_nk' : r?.mietvertrag_pricing !== 'kalt_nk';
  const rule = typeof ccKautionRuleText === 'function'
    ? ccKautionRuleText(ctype === 'kurzzeit' ? 'kurzzeit' : 'mietvertrag', isPauschal ? 'pauschal' : 'kalt_nk', rec.mietbeginn, rec.mietende) : '';
  return { amount, text: 'Standard' + (rule ? ' \u00b7 ' + rule : '') };
}
/* After saving: refresh exactly this tenant's Soll lines (no full repaint → nothing typed elsewhere is lost) */
/* Kaution Soll is fixed per tenancy (cc-kaution-card.js). Active tenants that
   have none yet get it filled ONCE; afterwards it only changes by hand. */
const _tnSollFilling = new Set();
function _tnFreezeKautionSoll() {
  if (!sbL || typeof ccKautionStartSoll !== 'function') return;
  _tnRecords.forEach(rec => {
    if (rec.status !== 'active' || (rec.kaution_soll != null && rec.kaution_soll !== '') || _tnSollFilling.has(rec.id)) return;
    const amount = ccKautionStartSoll({ current: _tnKautionSollInfo(rec), staffelSoll: null,
      mietbeginn: rec.mietbeginn, received: _tnKaution[rec.id]?.received });
    if (!(amount > 0)) return;
    _tnSollFilling.add(rec.id);
    rec.kaution_soll = amount;
    ccQueueWrite('tn-' + rec.id, () => sbL.from('tenant_records').update({ kaution_soll: amount }).eq('id', rec.id).is('kaution_soll', null))
      .then(({ error }) => { if (error) { rec.kaution_soll = null; _tnSollFilling.delete(rec.id); console.warn('[tenants] kaution soll:', error.message); } });
  });
}

/* Rent is fixed per tenancy (like the Kaution Soll). Active tenants without a
   stored rent / contract type get today's room price saved ONCE.          */
const _tnRentFilling = new Set();
function _tnFreezeRent() {
  // B3: a rent is only stored when you type it or a contract is generated.
  // Today's room price is never copied onto a tenant. Only the contract type
  // of an active tenant without one is filled in (from the room).
  if (!sbL) return;
  _tnRecords.forEach(rec => {
    if (rec.status !== 'active' || _tnRentFilling.has(rec.id) || rec.contract_type) return;
    const ct = _tnRoomContractType(rec.room);
    if (!ct) return;
    _tnRentFilling.add(rec.id);
    rec.contract_type = ct;
    ccQueueWrite('tn-' + rec.id, () => sbL.from('tenant_records').update({ contract_type: ct }).eq('id', rec.id))
      .then(({ error }) => { if (error) { rec.contract_type = null; _tnRentFilling.delete(rec.id); console.warn('[tenants] contract type:', error.message); } });
  });
}

/* Gap 2: a tenancy whose rent has no history entry yet (typed on the tenant before rent history existed)
   gets ONE entry at its move-in with what the card shows today (rent + Pauschal / Kalt + NK). From then
   on the room's pricing can never change it again. Current and former tenants. Runs once per load. */
const _tnModeLocking = new Set();
function _tnLockRentMode() {
  if (!sbL || typeof ccRpSetRent !== 'function' || typeof CC_RP === 'undefined' || CC_RP.missing || !CC_RP.loaded.casa) return;
  _tnRecords.forEach(rec => {
    if (!(rec.status === 'active' || rec.status === 'former') || _tnModeLocking.has(rec.id)) return;
    if (!rec.mietbeginn || (rec.kaltmiete == null && rec.nebenkosten == null)) return;   // no rent typed → nothing to lock
    if (ccRpFor('casa', rec.id).length) return;                                          // already has its own entry
    const mode = _tnLegacyMode(rec.room, rec);
    const k = Number(rec.kaltmiete) || 0, n = Number(rec.nebenkosten) || 0;
    _tnModeLocking.add(rec.id);
    ccRpSetRent(sbL, { app: 'casa', rec, validFrom: _ccIso(rec.mietbeginn), mode,
      kalt: mode === 'pauschal' ? k + n : k, nk: mode === 'pauschal' ? null : n, pauschale: k + n,
      contract_type: tnContractType(rec) || undefined, kind: 'migrated', source: 'migration',
      note: 'Rent mode locked from the tenant card', legacyMode: mode })
      .catch(e => { _tnModeLocking.delete(rec.id); console.warn('[tenants] lock rent mode:', e && e.message || e); });
  });
}

/* Pauschal or Kalt + NK for a tenant without rent history: from the room's
   pricing for the tenant's contract type (same rule as the Kaution). */
function _tnLegacyMode(roomName, rec) {
  const r = typeof appRooms !== 'undefined' ? appRooms.find(x => x.name === roomName) : null;
  const ctype = (rec && tnContractType(rec)) || _tnRoomContractType(roomName);
  const own = ctype === 'jahres' && typeof ccRoomJahresOwn === 'function' && ccRoomJahresOwn(r);
  const isP = ctype === 'kurzzeit' ? (r?.kurzzeit_pricing || 'pauschal') !== 'kalt_nk'
    : own ? r.jahres_pricing === 'pauschal' : r?.mietvertrag_pricing !== 'kalt_nk';
  return isP ? 'pauschal' : 'kalt_nk';
}
/* The tenant's rent today: rent history first, else the rent stored on the tenant.
   → { mode, kalt, nk, total, src } or null (nothing stored — never the room price) */
function _tnCurrentRent(rec, roomName) {
  if (!rec) return null;
  const per = typeof ccRpFor === 'function' ? ccRpAt(ccRpFor('casa', rec.id), ccRpToday()) : null;
  let out = null;
  if (per) out = { ...ccRpAmount(per), src: 'history', period: per };
  else if (rec.kaltmiete != null || rec.nebenkosten != null) {
    const mode = _tnLegacyMode(roomName, rec);
    const k = Number(rec.kaltmiete) || 0, n = Number(rec.nebenkosten) || 0;
    out = mode === 'pauschal' ? { mode, kalt: k + n, nk: 0, total: k + n, src: 'tenant' } : { mode, kalt: k, nk: n, total: k + n, src: 'tenant' };
  }
  // a Mieterhöhung that has started (not skipped) is today's rent — Kaltmiete, or the Pauschalmiete — the same as Controlling
  const st = out ? _tnMhAt(rec, roomName || rec.room, ccRpToday(), per ? ccRpIso(per.valid_from) : ccRpIso(rec.mietbeginn)) : null;
  if (st) out = out.mode === 'pauschal' ? { ...out, kalt: Number(st.amount), total: Number(st.amount), src: 'mh', step: st }
                                        : { ...out, kalt: Number(st.amount), total: Number(st.amount) + (Number(out.nk) || 0), src: 'mh', step: st };
  return out;
}
function _tnMhAt(rec, roomName, iso, base) {
  if (typeof _tnOwnMh !== 'function') return null;
  return _tnOwnMh(roomName, rec).filter(e => !e.ignored && ccRpIso(e.effective_date) <= iso && (!base || ccRpIso(e.effective_date) >= base))
    .sort((a, b) => ccRpIso(b.effective_date).localeCompare(ccRpIso(a.effective_date)))[0] || null;
}
function _tnMhNext(rec, roomName) {
  if (!rec || typeof _tnOwnMh !== 'function') return null;
  return _tnOwnMh(roomName || rec.room, rec).filter(e => !e.ignored && ccRpIso(e.effective_date) > ccRpToday())
    .sort((a, b) => ccRpIso(a.effective_date).localeCompare(ccRpIso(b.effective_date)))[0] || null;
}

/* Contract generators: the active tenant's fixed Kaution Soll (or null) */
function tnFixedKautionSoll(roomName) {
  const rec = (_tnRecords || []).filter(r => r.room === roomName && r.status === 'active')
    .sort((a, b) => String(b.mietbeginn || '').localeCompare(String(a.mietbeginn || '')))[0];
  const v = rec && rec.kaution_soll;
  return v != null && v !== '' && Number(v) > 0 ? Number(v) : null;
}

function _tnRefreshKautionSoll(tid) {
  const info = _tnKautionSollInfo(_tnRecords.find(r => r.id === tid));
  document.querySelectorAll(`[data-ksoll-for="${tid}"]`).forEach(el => {
    if (el.dataset.ksollKind === 'hint') { el.textContent = info ? `Soll: ${_tnFmtEUR(info.amount)} \u00b7 ${info.text}` : ''; el.style.display = info ? '' : 'none'; }
    else el.textContent = info ? `Soll \u00b7 ${_tnFmtEUR(info.amount)} \u00b7 ${info.text}` : 'Soll \u00b7 \u2014';
  });
}

function _tnKautionSoll(room, mietbeginn, mietende, ctypeArg) {
  const p = _tnRoomPricing(room, ctypeArg);
  if (p.kaution_override) return p.kaution_fixed;
  if (!p.kaltmiete) return null;

  // Pauschal: kaution base = kaltmiete + NK (full monthly charge)
  // Kalt+NK:  kaution base = kaltmiete only (legal standard § 551 BGB)
  const r = typeof appRooms !== 'undefined' ? appRooms.find(x => x.name === room) : null;
  const ctype = ctypeArg || _tnRoomContractType(room);
  const isPauschal = ctype === 'kurzzeit'
    ? (r?.kurzzeit_pricing || 'pauschal') !== 'kalt_nk'
    : r?.mietvertrag_pricing !== 'kalt_nk';
  // Shared rule (kaution.js): Mietvertrag 3× · Kurzzeit ≤ 3 Monate 1×, > 3 Monate 3×
  return ccKaution({
    contract: ctype === 'kurzzeit' ? 'kurzzeit' : 'mietvertrag',
    mode: isPauschal ? 'pauschal' : 'kalt_nk',
    kalt: p.kaltmiete, nk: p.nebenkosten || 0,
    start: mietbeginn, end: mietende,
  }).amount;
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
  if (type === 'kurzzeit')    return 'Kurzzeit';
  if (type === 'jahres')      return 'Jahresvertrag';
  return null;
}

/* ── CONTRACT TYPE — belongs to the tenancy, never to the room ─────────────
   The room only has an OFFER (Rooms → Asking rent → Offer). It pre-selects the
   type of a NEW tenant; after that the tenancy owns its type:
     · Tenants → Tenant → Contract (new tenant form + Edit) · former/next pop-up
     · a final contract from the generator and Renew write it into the rent
       history from their start date (so a renewal can switch Kurzzeit → Mietvertrag)
   Type on a day = the latest rent-history entry with a type on/before that day,
   else the type stored on the tenant. A signed tenant who moves in later is
   read on the move-in day.                                                    */
function _tnTypedPeriods(rec) {
  if (!rec || !rec.id || typeof ccRpFor !== 'function') return [];
  return ccRpFor('casa', rec.id).filter(p => p.contract_type === 'mietvertrag' || p.contract_type === 'kurzzeit' || p.contract_type === 'jahres');
}
function _tnTypeDay(rec) {
  const today = typeof ccRpToday === 'function' ? ccRpToday() : _ccTodayIso();
  const mb = rec && rec.mietbeginn ? _ccIso(rec.mietbeginn) : '';
  return mb && mb > today ? mb : today;
}
function tnContractType(rec, iso) {
  if (!rec) return null;
  const per = typeof ccRpAt === 'function' ? ccRpAt(_tnTypedPeriods(rec), iso || _tnTypeDay(rec)) : null;
  return (per && per.contract_type) || rec.contract_type || null;
}
/* The first contract of the tenancy: the main Documents slot and the Kaution rule */
function _tnBaseContractType(rec) {
  if (!rec) return null;
  const first = _tnTypedPeriods(rec).find(p => p.kind !== 'renewal');
  return (first && first.contract_type) || rec.contract_type || null;
}
/* A planned change of type (a renewal with another contract type) → { type, from } */
function _tnCtNextChange(rec) {
  if (!rec) return null;
  const day = _tnTypeDay(rec), now = tnContractType(rec);
  const nx = _tnTypedPeriods(rec).find(p => _ccIso(p.valid_from) > day && p.contract_type !== now);
  return nx ? { type: nx.contract_type, from: nx.valid_from } : null;
}
/* ── CONTRACTS (Casa) ─────────────────────────────────────────────
   A tenancy = Erstvertrag + one contract per renewal (rent history kind 'renewal').
   Each contract has its own dates, type and rent. The beige bar shows the
   running one; a renewal that starts later is one line under it; renewed
   contracts fold into "Earlier contracts" at the bottom of the card.        */
function _tnContracts(rec) {
  if (!rec) return [];
  const per = typeof ccRpFor === 'function' ? ccRpFor('casa', rec.id) : [];
  const mb  = _ccIso(rec.mietbeginn);
  const ren = per.filter(p => p.kind === 'renewal' && (!mb || _ccIso(p.valid_from) > mb));
  const list = [{ start: mb || (per[0] ? _ccIso(per[0].valid_from) : ''), renewal: null }]
    .concat(ren.map(p => ({ start: _ccIso(p.valid_from), renewal: p })));
  return list.map((c, i) => {
    const last = i === list.length - 1;
    const type = tnContractType(rec, c.start || undefined);
    const end  = !last ? _ccAddDaysIso(list[i + 1].start, -1)
               : (_ccIso(rec.vertragsende) || (c.renewal && c.renewal.contract_end ? _ccIso(c.renewal.contract_end) : ''));
    const pAt  = c.start && typeof ccRpAt === 'function' ? ccRpAt(per, c.start) : null;
    const own  = pAt && _ccIso(pAt.valid_from) === c.start ? pAt : null;   // the entry that starts this contract
    const amt  = pAt ? ccRpAmount(pAt) : (i === 0 ? _tnCurrentRent(rec, rec.room) : null);
    const name = i === 0 ? (list.length > 1 || _tnIsFixed(type) ? 'Erstvertrag' : 'Mietvertrag') : i + '. Verlängerung';
    return { i, name, start: c.start, end, type, amt, period: own, renewal: c.renewal, last };
  });
}
function _tnContractState(rec) {
  const all = _tnContracts(rec);
  if (!all.length) return { all, cur: null, next: null, earlier: [] };
  const today = _ccTodayIso();
  let r = -1; all.forEach((c, i) => { if (c.start && c.start <= today) r = i; });
  if (r === -1) r = 0;
  return { all, cur: all[r], next: all[r + 1] || null, earlier: all.slice(0, r).reverse() };
}
function _tnTypeWord(t) { return t === 'kurzzeit' ? 'befristet' : t === 'jahres' ? 'Jahresvertrag' : t === 'mietvertrag' ? 'unbefristet' : ''; }
function _tnContractDates(c) {
  if (!c || !c.start) return '';
  if (c.end) return _ccFmtD(c.start) + ' \u2013 ' + _ccFmtD(c.end);
  return (c.start > _ccTodayIso() ? 'from ' : 'since ') + _ccFmtD(c.start);
}
function _tnContractSub(c) { return [_tnTypeWord(c.type), _tnContractDates(c)].filter(Boolean).join(' \u00b7 '); }
function _tnAmtShort(a) {
  if (!a) return '';
  return a.mode === 'pauschal' ? 'pauschal' : _tnFmtEUR(a.kalt).replace('\u00a0\u20ac', '') + ' + ' + _tnFmtEUR(a.nk).replace('\u00a0\u20ac', '');
}

/* One contract as a line (the next contract under the bar · earlier contracts in the fold) */
function _tnContractRowHTML(rec, c, pill, rid, where) {
  return `<button type="button" class="tn-crow" onclick="_tnContractEdit('${rid}','${rec.id}',${c.i},'${where}')">
    <span class="tn-crow-main"><span class="tn-crow-top"><span class="tn-crow-name">${esc(c.name)}</span>${pill}</span>
      <span class="tn-crow-sub">${esc(_tnContractSub(c))}</span></span>
    <span class="tn-crow-amt"><span class="tn-crow-warm">${c.amt ? _tnFmtEUR(c.amt.total) : '\u2014'}</span>
      <span class="tn-crow-sub">${esc(_tnAmtShort(c.amt))}</span></span>
    <i class="ti ti-chevron-right tn-crow-chev" aria-hidden="true"></i></button>`;
}

/* Under the beige bar: the renewal that starts later — or, 60 days before the end, Renew */
function _tnContractStripHTML(rid, room, rec) {
  if (!rec) return '';
  const st = _tnContractState(rec);
  if (st.next) {
    return `<div class="tn-cstrip" id="cstrip-${rid}">${_tnContractRowHTML(rec, st.next, `<span class="tnp tnp-blue">ab ${_ccFmtD(st.next.start)}</span>`, rid, 'cstrip-' + rid)}</div>`;
  }
  const c = st.cur;
  if (c && c.last && _tnIsFixed(c.type) && c.end && !rec.mietende && rec.status === 'active' && typeof ccTnDaysUntil === 'function') {
    const d = ccTnDaysUntil(c.end);
    if (d !== null && d <= 60) {
      return `<div class="tn-cstrip tn-cstrip--due" id="cstrip-${rid}">
        <span class="tn-cstrip-txt">${d < 0 ? 'Contract ended ' + _ccFmtD(c.end) + ' \u2014 not renewed yet' : 'No contract after ' + _ccFmtD(c.end) + ' yet'}</span>
        <button type="button" class="tn-btn tn-btn-primary" onclick="ccfRenewOpen('${rec.id}')"><i class="ti ti-refresh"></i> Renew</button></div>`;
    }
    if (d !== null) {   // earlier: a quiet line — renewing ahead of time is always possible
      return `<div class="tn-cstrip tn-cstrip--quiet" id="cstrip-${rid}">
        <span class="tn-cstrip-qtxt">Ends ${_ccFmtD(c.end)} \u00b7 not renewed yet</span>
        <button type="button" class="tn-btn tn-btn-sm" onclick="ccfRenewOpen('${rec.id}')"><i class="ti ti-refresh"></i> Renew</button></div>`;
    }
  }
  return '';
}
function _tnRenewDueShown(rec) { return !!rec && /tn-cstrip--due/.test(_tnContractStripHTML('x', null, rec)); }

/* Bottom of the card: contracts that were renewed (newest first), folded */
const _tnEarlierOpen = {};
function _tnEarlierContractsHTML(rid, rec) {
  if (!rec) return '';
  const e = _tnContractState(rec).earlier;
  if (!e.length) return '';
  const open = !!_tnEarlierOpen[rid];
  return `<div class="tn-sec tn-earlier" id="earlier-${rid}">
    <button type="button" class="tn-arc-toggle" onclick="_tnEarlierOpen['${rid}']=!_tnEarlierOpen['${rid}'];_tnRender()">
      <i class="ti ti-file-text" style="font-size:13px" aria-hidden="true"></i> Earlier contracts (${e.length})
      <span style="flex:1"></span><i class="ti ti-chevron-${open ? 'down' : 'right'}" style="font-size:13px" aria-hidden="true"></i></button>
    ${open ? `<div class="tn-earlier-body">${e.map(c => _tnContractRowHTML(rec, c, '<span class="tnp tnp-gray">Renewed</span>', rid, 'earlier-' + rid)).join('')}</div>` : ''}
  </div>`;
}

/* Correct ONE contract (the next one or an earlier one) — only its own rent entry changes */
function _tnContractEdit(rid, tid, i, secId) {
  const rec = _tnRecords.find(r => r.id === tid); if (!rec) return;
  const c = _tnContracts(rec)[i]; if (!c) return;
  const mode = c.amt && c.amt.mode === 'pauschal' ? 'pauschal' : 'kalt_nk';
  const pausch = mode === 'pauschal';
  const signed = (_tnDocs[tid] || []).some(d => d.type === 'verlaengerung_' + c.start && (d.variant || 'signed') === 'signed');
  const canRemove = !!(c.renewal && c.last && !signed);
  const body = `<div class="tn-fg" style="margin-top:4px">
      <div class="tn-field tn-field-full"><span class="tn-flbl">Contract</span>${_tnCtSegHTML('data-cc', c.type || 'mietvertrag')}</div>
      <div class="tn-field"><span class="tn-flbl">Start</span><span class="tn-fval">${_ccFmtD(c.start)}</span></div>
      <div class="tn-field" data-cc="endwrap"${c.type === 'mietvertrag' && !c.end ? ' style="display:none"' : ''}><span class="tn-flbl">Contract end</span>${c.last
        ? `<input type="text" data-cc="end" value="${c.end ? _ccFmtD(c.end) : ''}" placeholder="TT.MM.JJJJ"/>`
        : `<span class="tn-fval">${_ccFmtD(c.end)}</span>`}</div>
      <div class="tn-field tn-field-full"><span class="tn-flbl">Rent</span>${_tnModeSegHTML('data-cc', mode)}</div>
      <div class="tn-field"><span class="tn-flbl" data-kaltlbl>${pausch ? 'Pauschalmiete' : 'Kaltmiete'}</span><input type="number" data-cc-num="2" data-cc="k" value="${c.amt ? (pausch ? c.amt.total : c.amt.kalt) : ''}"/></div>
      <div class="tn-field" data-nkwrap${pausch ? ' style="display:none"' : ''}><span class="tn-flbl">Nebenkosten</span><input type="number" data-cc-num="2" data-cc="n" value="${c.amt && !pausch ? c.amt.nk : ''}"/></div>
    </div>
    <p class="tn-rf-hint" style="margin:10px 0 0">Changes only the ${esc(c.name)} (${esc(_tnContractDates(c))}). Other contracts stay as they are.</p>
    ${canRemove ? `<button type="button" class="tn-btn tn-btn-sm tn-del-btn" style="margin-top:10px" onclick="_tnRenewDelete('${tid}','${c.renewal.id}')"><i class="ti ti-trash"></i> Remove renewal</button>` : ''}`;
  _ccPanelOpen(secId, esc(c.name) + ' \u00b7 ' + esc(_tnContractDates(c)), body, async panel => {
    const ctNew = panel.querySelector('[data-cc="ct"]')?.value || c.type || null;
    const mNew  = panel.querySelector('[data-cc="rent_mode"]')?.value === 'pauschal' ? 'pauschal' : 'kalt_nk';
    const k = parseFloat(panel.querySelector('[data-cc="k"]')?.value);
    const n = mNew === 'pauschal' ? null : parseFloat(panel.querySelector('[data-cc="n"]')?.value);
    if (isNaN(k) || (mNew !== 'pauschal' && isNaN(n))) { ccToast('Please enter the rent', true); return false; }
    let endNew;
    if (c.last) {
      const raw = (panel.querySelector('[data-cc="end"]')?.value || '').trim();
      endNew = raw ? (_tnParseDate(raw) || false) : null;
      if (endNew === false) { ccToast('Contract end: TT.MM.JJJJ', true); return false; }
      if (ctNew === 'mietvertrag') endNew = null;
      if (_tnIsFixed(ctNew) && !endNew) { ccToast('Befristet / Jahresvertrag needs a contract end', true); return false; }
      if (endNew && c.start && endNew < c.start) { ccToast('Contract end is before the start', true); return false; }
    }
    const fields = mNew === 'pauschal' ? { mode: 'pauschal', pauschale: k, kaltmiete: null, nebenkosten: null }
                                       : { mode: 'kalt_nk', kaltmiete: k, nebenkosten: n, pauschale: null };
    if (ctNew) fields.contract_type = ctNew;
    try {
      if (c.period) await ccRpUpdate(sbL, c.period.id, fields);          // keeps its kind (Start / Verlängerung)
      else await ccRpSetRent(sbL, { app: 'casa', rec, validFrom: c.start, mode: mNew, kalt: k, nk: n, pauschale: k,
                                    contract_type: ctNew || undefined,
                                    kind: c.i === 0 ? 'migrated' : 'renewal', source: 'tenant_form', legacyMode: _tnLegacyMode(rec.room, rec) });
    } catch (e) { ccSaveFailed(e, 'contract'); return false; }
    // tenant record: rent in force today · type + contract end of the latest contract
    const upd = {};
    const now = _tnCurrentRent(rec, rec.room);
    if (now && now.src === 'history') {
      const k2 = now.mode === 'pauschal' ? now.total : now.kalt, n2 = now.mode === 'pauschal' ? null : now.nk;
      if (k2 !== Number(rec.kaltmiete) || n2 !== (rec.nebenkosten == null ? null : Number(rec.nebenkosten))) { upd.kaltmiete = k2; upd.nebenkosten = n2; }
    }
    if (c.last && ctNew && ctNew !== rec.contract_type) upd.contract_type = ctNew;
    if (c.last && endNew !== undefined && (endNew || null) !== (_ccIso(rec.vertragsende) || null)) upd.vertragsende = endNew;
    if (Object.keys(upd).length) {
      Object.assign(rec, upd);
      ccQueueWrite('tn-' + tid, () => sbL.from('tenant_records').update(upd).eq('id', tid));
    }
    setTimeout(_tnRender, 0);
    return true;
  });
}

/* An edited type also goes into the history entry that decides it — else that entry would win */
function _tnSyncTypePeriod(rec, type) {
  if (!rec || !type || !sbL || typeof ccRpUpdate !== 'function') return;
  const per = ccRpAt(_tnTypedPeriods(rec), _tnTypeDay(rec));
  if (!per || per.contract_type === type) return;
  const before = per.contract_type;
  per.contract_type = type;   // instant: the card reads it
  ccRpUpdate(sbL, per.id, { contract_type: type }).catch(err => {
    per.contract_type = before;
    _tnRender();
    if (typeof ccSaveFailed === 'function') ccSaveFailed(err, 'contract type'); else console.warn('[tenants] contract type:', err && err.message || err);
  });
}
/* Rent mode belongs to the tenancy's contract, never to the room's current offer:
   Pauschal | Kalt + NK — chosen in the beige Edit (running contract) and in the pop-up (former / next). */
function _tnModeSegHTML(attr, value) {
  const v = value === 'pauschal' ? 'pauschal' : 'kalt_nk';
  const opt = (t, l) => `<button type="button" class="cc-seg__opt${v === t ? ' is-on' : ''}" role="radio" aria-checked="${v === t}" data-rmode="${t}" onclick="_tnSetMode(this)">${l}</button>`;
  return `<div class="cc-seg tn-contract-toggle" role="radiogroup" aria-label="Rent">${opt('kalt_nk', 'Kalt + NK')}${opt('pauschal', 'Pauschal')}<input type="hidden" ${attr}="rent_mode" value="${v}"/></div>`;
}
function _tnSetMode(btn) {
  const seg = btn.closest('.cc-seg'); if (!seg) return;
  seg.querySelectorAll('.cc-seg__opt').forEach(o => { const on = o === btn; o.classList.toggle('is-on', on); o.setAttribute('aria-checked', on ? 'true' : 'false'); });
  const inp = seg.querySelector('input[type=hidden]'); if (inp) inp.value = btn.dataset.rmode;
  if (seg.closest('#tnModalBody')) setTimeout(_tnDraftSollUpdate, 0);
  const box = seg.closest('.tn-rent-form, .tn-fg'); if (!box) return;
  const p = btn.dataset.rmode === 'pauschal';
  if (p && seg.dataset.last !== 'pauschal') {
    const kIn = box.querySelector('[data-mf="kaltmiete"],[data-f="kaltmiete"],[data-cc="k"],input[id^="rf-kalt-"]');
    const nIn = box.querySelector('[data-mf="nebenkosten"],[data-f="nebenkosten"],[data-cc="n"],input[id^="rf-nk-"]');
    const k = parseFloat(kIn && kIn.value), n = parseFloat(nIn && nIn.value);
    if (kIn && !isNaN(k) && !isNaN(n) && n) { kIn.value = +(k + n).toFixed(2); nIn.value = ''; kIn.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  seg.dataset.last = btn.dataset.rmode;
  box.querySelectorAll('[data-nkwrap]').forEach(el => { el.style.display = p ? 'none' : ''; });
  box.querySelectorAll('[data-kaltlbl]').forEach(el => { el.textContent = p ? 'Pauschalmiete' : 'Kaltmiete'; });
}
/* The mode a tenant pays on a day (rent history first, else the room's offer as before) */
function _tnModeAt(rec, iso) {
  const per = rec && typeof ccRpAt === 'function' ? ccRpAt(ccRpFor('casa', rec.id), iso || ccRpToday()) : null;
  return per ? (per.mode === 'pauschal' ? 'pauschal' : 'kalt_nk') : _tnLegacyMode(rec.room, rec);
}
/* Pauschal for the whole tenancy → no NK-Abrechnung at all (no NK section, no "NK open") */
function _tnAllPauschal(rec) {
  if (!rec) return false;
  const cs = _tnContracts(rec);
  return cs.length > 0 && cs.every(c => c.amt && c.amt.mode === 'pauschal');
}

/* The choice Mietvertrag | Kurzzeit | Jahresvertrag (tenant form, pop-up, Renew) — value in a hidden field */
function _tnCtSegHTML(attr, value) {
  const v = value === 'kurzzeit' || value === 'jahres' ? value : 'mietvertrag';
  const opt = (t, l) => `<button type="button" class="cc-seg__opt${v === t ? ' is-on' : ''}" role="radio" aria-checked="${v === t}" data-ct="${t}" onclick="_tnSetCt(this)">${l}</button>`;
  return `<div class="cc-seg tn-contract-toggle" role="radiogroup" aria-label="Contract">${opt('mietvertrag', 'Mietvertrag')}${opt('kurzzeit', 'Kurzzeit')}${opt('jahres', 'Jahresvertrag')}<input type="hidden" ${attr}="${attr === 'data-cc' ? 'ct' : 'contract_type'}" value="${v}"/></div>`;
}
function _tnSetCt(btn) {
  const seg = btn.closest('.cc-seg');
  if (!seg) return;
  seg.querySelectorAll('.cc-seg__opt').forEach(o => { const on = o === btn; o.classList.toggle('is-on', on); o.setAttribute('aria-checked', on ? 'true' : 'false'); });
  const inp = seg.querySelector('input[type=hidden]');
  if (inp) inp.value = btn.dataset.ct;
  const endWrap = seg.closest('.cc-inline-panel, .tn-newc, .tn-rent-form')?.querySelector('[data-cc="endwrap"]');
  if (endWrap) endWrap.style.display = btn.dataset.ct === 'mietvertrag' ? 'none' : '';
  // "Add former tenant": the suggested Kaution Soll and rent hint follow the chosen type
  const modal = document.getElementById('tnModal');
  if (modal && modal._draft && seg.closest('#tnModalBody')) {
    const d = modal._draft, body = document.getElementById('tnModalBody'), ct = btn.dataset.ct;
    const val = f => body.querySelector(`[data-mf="${f}"]`)?.value || '';
    _tnDraftSollUpdate();
    const sp = _tnRoomPricing(d.room, ct), hint = body.querySelector('.cc-soll-hint');
    if (hint && sp.kaltmiete != null) hint.textContent = `Empty rent = today's Soll: ${_tnFmtEUR(sp.kaltmiete)}${sp.nebenkosten != null ? ' + ' + _tnFmtEUR(sp.nebenkosten) + ' NK' : ''}. Please check what this tenant paid back then.`;
  }
}


/* ══════════════════════════════════════════════════════════════
   5. FORMAT HELPERS
══════════════════════════════════════════════════════════════ */
function _tnFmtEUR(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + '\u00a0\u20ac';
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
function _tnKautionStatus(recv, ret, settled) { return ccTnKautionStatus(recv, ret, settled); }   // shared (cc-tenant-status.js)

/* Kalt + NK on any day between from and to (the tenant's own rent history; old tenants: as entered) */
function _tnHasKaltNKBetween(rec, from, to) {
  const per = typeof ccRpFor === 'function' ? ccRpFor('casa', rec.id) : [];
  if (!per.length) return _tnLegacyMode(rec.room, rec) !== 'pauschal';
  const first = ccRpAt(per, from);
  const modes = (first ? [first] : [{ mode: _tnLegacyMode(rec.room, rec) }])
    .concat(per.filter(p => ccRpIso(p.valid_from) > from && ccRpIso(p.valid_from) <= to));
  return modes.some(p => p.mode !== 'pauschal');
}
function _tnNkDue(rec) { return rec && typeof ccNksDue === 'function' ? ccNksDue(rec, (f, t) => _tnHasKaltNKBetween(rec, f, t)) : []; }
function _tnNkOpenLabel(rec) {
  return typeof ccNksOpenLabel === 'function' ? ccNksOpenLabel(rec.id, _tnNK[rec.id], _tnNkDue(rec)) : 'NK open';
}
function _tnNkHasOpen(tid) {
  const rec = _tnRecords.find(r => r.id === tid);
  if (rec && _tnAllPauschal(rec)) return false;                                     // pauschal → no NK-Abrechnung
  if (typeof ccNksHasOpen === 'function') return ccNksHasOpen(tid, _tnNK[tid], rec ? _tnNkDue(rec) : []);   // Settlements + old tracking + due
  return (_tnNK[tid] || []).some(e => !e.paid);
}

/* Open items of a FORMER tenant as pills (NK with year · Kaution still to settle) — '' when nothing is open */
function _tnFormerOpenPills(r) {
  const out = [];
  if (_tnNkHasOpen(r.id)) out.push(`<span class="tnp tnp-amber">${esc(_tnNkOpenLabel(r))}</span>`);
  if (_tnKautionOpen(r.id)) {
    const held = _tnKautionKept(r.id);
    out.push(`<span class="tnp tnp-amber">${held > 0 ? 'Kaution ' + _tnFmtEUR(held) + ' to settle' : 'Kaution: mark settled'}</span>`);
  }
  return out.join('');
}
/* Whole house: NK open (current + former) · Kaution to settle (former) */
function _tnOpenCounts() {
  const act = _tnRecords.filter(r => r.status === 'active' || r.status === 'former');
  return {
    nk: act.filter(r => _tnNkHasOpen(r.id)).length,
    kaution: act.filter(r => r.status === 'former' && _tnKautionOpen(r.id)).length,
  };
}
/* IST today: the rent of every tenant living in the house now (rent history first).
   Pauschal: the NK part inside the Pauschale counts as NK, the rest as Kalt. */
function _tnIstTotals() {
  let kalt = 0, nk = 0, n = 0;
  const rooms = [...new Set(_tnRecords.filter(r => r.status === 'active').map(r => r.room))];
  rooms.forEach(room => {
    const cur = _ccPickTenancy(_tnRecords.filter(r => r.room === room && r.status === 'active')).current;
    if (!cur) return;
    n++;
    const r = _tnCurrentRent(cur, room); if (!r) return;
    if (r.mode === 'pauschal') {
      const nkIn = Math.min(Number(r.total) || 0, Number(r.period && r.period.nebenkosten) || 0);
      kalt += Math.max(0, (Number(r.total) || 0) - nkIn); nk += nkIn;
    } else { kalt += Number(r.kalt) || 0; nk += Number(r.nk) || 0; }
  });
  const total = typeof appRooms !== 'undefined' ? appRooms.filter(r => r && r.active !== false).length : rooms.length;
  return { kalt, nk, tenants: n, rooms: total };
}
/* Current tenants whose Kaution is not (fully) received — same rule as the card pill */
function _tnKautionMissingCount() {
  let c = 0;
  const rooms = [...new Set(_tnRecords.filter(r => r.status === 'active').map(r => r.room))];
  rooms.forEach(room => {
    const cur = _ccPickTenancy(_tnRecords.filter(r => r.room === room && r.status === 'active')).current;
    if (!cur) return;
    const x = ccTnKaution(_tnKaution[cur.id]);
    if (x.settled) return;
    const soll = Number((_tnKautionSollInfo(cur) || {}).amount) || 0;
    if (soll > 0 && x.recv < soll - 0.005 && x.ret === 0) c++;
  });
  return c;
}
function _tnSummaryUpdate() {
  const held = ccTnHeldTotal(_tnRecords, _tnKaution);
  const ist = document.getElementById('tn-ist');
  if (ist) {
    const t = _tnIstTotals();
    const vac = Math.max(0, t.rooms - t.tenants);
    ist.innerHTML = `<div class="cc-sumline__top">Actual (IST) · ${t.tenants} living here${vac ? ' · ' + vac + ' vacant' : ''} · today</div>
      <div class="cc-sumline__vals"><div><span>Kalt</span><b>${_tnFmtEUR(t.kalt)}</b></div><div><span>NK</span><b>${_tnFmtEUR(t.nk)}</b></div><div><span>Kaution held</span><b>${_tnFmtEUR(held)}</b></div></div>`;
    ist.style.display = _tnRecords.length ? '' : 'none';
  }
  const oc = document.getElementById('tn-open-summary');
  if (oc) {
    const c = _tnOpenCounts(), miss = _tnKautionMissingCount();
    const pills = (c.nk ? `<span class="tnp tnp-amber">NK \u00b7 ${c.nk}</span>` : '')
      + (miss ? `<span class="tnp tnp-amber">Kaution missing \u00b7 ${miss}</span>` : '')
      + (c.kaution ? `<span class="tnp tnp-amber">Kaution to settle \u00b7 ${c.kaution}</span>` : '');
    oc.innerHTML = pills ? `<span class="tn-open-lbl">Open:</span>${pills}` : '';
    oc.style.display = pills ? 'flex' : 'none';
  }
}

function _tnKautionOpen(tid) {
  const k = _tnKaution[tid];
  return k && k.received > 0 && !k.settled;
}

function _tnKautionKept(tid) {
  const k = _tnKaution[tid];
  if (!k) return 0;
  return Math.max(0, (k.received || 0) - (k.returned || 0));
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

/* Kalt + NK tenancy? (NK Vorauszahlung and its reminder only apply there — not to Pauschal) */
function _tnIsKaltNK(rec, roomName) {
  if (!rec) return false;
  const cur = _tnCurrentRent(rec, roomName || rec.room);
  return (cur ? cur.mode : _tnLegacyMode(roomName || rec.room, rec)) !== 'pauschal';
}

/* ── NK VORAUSZAHLUNG HELPERS ── */
function _tnNKVorausCurrent(room) {
  const today = new Date(); today.setHours(0,0,0,0);
  return (_tnNKVoraus[room] || []).find(e => new Date(e.effective_date) <= today) || null;
}
function _tnNKVorausHasOpen(room) {
  // true if any entry is not yet fully adjusted
  return (_tnNKVoraus[room] || []).some(e => !e.tenant_adjusted);
}

/* Card pills (row 1 state + row 4 to-dos) — ONE function, used for the first render
   and for every refresh after a save. Rules/wording/colours: cc-tenant-status.js */
function _tnCardPills(room, activeRec) {
  const vacant = !!room.vacant;
  const todos = [];
  if (activeRec) {
    todos.push(ccTnMoveOutTodo(activeRec));
    if (_tnIsFixed(tnContractType(activeRec))) todos.push(ccTnRenewalTodo(activeRec));   // Kurzzeit + Jahresvertrag are renewed
    if (_tnIsFixed(tnContractType(activeRec)) && !activeRec.vertragsende && !activeRec.mietende)
      todos.push({ level: 'amber', text: 'Contract end missing' });
    if (_tnNkHasOpen(activeRec.id)) todos.push({ level: 'amber', text: _tnNkOpenLabel(activeRec) });   // Settlements + old tracking
    if (_tnIsKaltNK(activeRec, room.name) && typeof ccTnNkChangeTodo === 'function')
      todos.push(ccTnNkChangeTodo(_tnNKVoraus[room.name], activeRec));
    if (typeof ccTnStepState === 'function')                                          // "Mieterhöhung from 01.05." · overdue
      todos.push(ccTnStaffelTodo(ccTnStepState(_tnOwnMh(room.name, activeRec)), d => { const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}.${m}.`; }));
    todos.push(ccTnStillActiveTodo(vacant, activeRec));
  }
  const movesIn = ccTnMovesIn(vacant, activeRec);
  const kPill = ((!vacant || movesIn) && activeRec)
    ? ccTnKautionPill(_tnKaution[activeRec.id], (_tnKautionSollInfo(activeRec) || {}).amount, _tnFmtEUR) : '';
  return { row1: ccTnRow1(vacant, kPill, movesIn), todo: ccTnTodoRow(todos) };
}
function _tnRefreshCardPills(roomName) {
  const room = (typeof appRooms !== 'undefined' ? appRooms : []).find(r => r.name === roomName);
  if (!room) return;
  const _pk = _ccPickTenancy(_tnRecords.filter(r => r.room === roomName && r.status === 'active'));
  const rec = _pk.current || _pk.next;
  const p = _tnCardPills(room, rec);
  ccTnApplyPills(esc(roomName.replace(/\s+/g,'_').toLowerCase()), p.row1, p.todo);
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
  if (!tids.length) { _tnProfileCache = {}; _tnLoadedOnce = true; _tnRender(); return; }

  const [kRes, nkRes, docRes, vorausRes, , , , , mhRes] = await Promise.all([
    sbL.from('kaution').select('*').in('tenant_id', tids),
    sbL.from('nk_entries').select('*').in('tenant_id', tids).order('period', { ascending: false }),
    sbL.from('tenant_documents').select('*').in('tenant_id', tids),
    sbL.from('nk_vorauszahlung_history').select('*').in('room', rooms).order('effective_date', { ascending: false }),
    typeof ccRpLoad === 'function' ? ccRpLoad(sbL, 'casa') : Promise.resolve([]),   // rent history (rent_periods)
    typeof ccNksLoad === 'function' ? ccNksLoad() : Promise.resolve(),               // NK-Abrechnungen (Settlements)
    typeof ccfLoadReadings === 'function' ? ccfLoadReadings(tids) : Promise.resolve(), // Zählerstände (meter_readings)
    _tnLoadPwDates(),                                                                  // when each room's tenant-app password was given
    sbL.from('casa_mieterhoehung_history').select('*').in('room', rooms).order('effective_date', { ascending: false })
      .then(r => r, () => ({ data: [] })),                                             // Mieterhöhungen (table missing → none)
  ]);
  _tnMh = {};
  ((mhRes && !mhRes.error && mhRes.data) || []).forEach(e => { (_tnMh[e.room] = _tnMh[e.room] || []).push(e); });

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

  _tnNKVoraus = {};
  (vorausRes.data || []).forEach(e => {
    if (!_tnNKVoraus[e.room]) _tnNKVoraus[e.room] = [];
    _tnNKVoraus[e.room].push(e); // already ordered effective_date DESC from DB
  });

  _tnProfileCache = {};
  _tnRecords.filter(r => r.status === 'active').forEach(r => {
    _tnProfileCache[r.room] = {
      firstName: r.first_name || '', lastName: r.last_name || '',
      email: r.email || '', phone: r.phone || '',
      birthday: r.birthday || '', address: r.address || '',
    };
  });
  _tnLoadedOnce = true;

  _tnFreezeKautionSoll();   // existing tenants: fix the Kaution Soll once
  _tnFreezeRent();          // existing active tenants: fix their rent once
  _tnLockRentMode();        // Pauschal / Kalt + NK: locked per tenancy, never from the room again
  _tnSyncOccupancy();       // occupied / vacant from the dates (and former after the move-out)
  _tnRenderIfChanged();
}

/* Tenant-app password (B2): the date each room's password was given. A tenant who
   moved in after that date (or a room without one) still needs theirs. */
let _tnPwAt = {};
async function _tnLoadPwDates() {
  try {
    const { data, error } = await sbL.from('lounge_data').select('room, created_at').eq('type', 'password');
    if (error) { console.warn('[tenants] password dates:', error.message); return; }
    _tnPwAt = {};
    (data || []).forEach(r => { if (r.room && (!_tnPwAt[r.room] || r.created_at > _tnPwAt[r.room])) _tnPwAt[r.room] = r.created_at; });
    _tnPwLoaded = true;
  } catch (e) { console.warn('[tenants] password dates:', e); }
}
let _tnPwLoaded = false;
function _tnNeedsPw(rec) {
  if (!_tnPwLoaded || !rec || rec.status !== 'active') return false;
  const inAt = _ccIso(rec.mietbeginn);
  if (!inAt || inAt > _ccTodayIso()) return false;                  // not moved in yet
  const at = _tnPwAt[rec.room];
  return !at || String(at).slice(0, 10) < inAt;
}
/* Empty room (T2): a password to log into the tenant app yourself and test.
   The next tenant gets their own (amber reminder from move-in day) — then this one stops working. */
function _tnEmptyRoomPwHTML(room) {
  if (!_tnPwLoaded) return '';
  const at = _tnPwAt[room];
  const r = esc(room);
  return `<div class="tn-pw-test"><i class="ti ti-key"></i>
    <span>Tenant app: ${at ? 'password set ' + _tnFmtDate(String(at).slice(0, 10)) + (typeof ccRoomPwInline === 'function' ? ccRoomPwInline(room) : '') : 'no password'}</span>
    <button class="tn-btn tn-btn-sm" onclick="_tnSetTestPw('${r}')">${at ? 'New password' : 'Set password'}</button></div>`;
}
async function _tnSetTestPw(room) {
  if (!sbL) { alert('No database connection.'); return; }
  if (!confirm(`Set a tenant-app password for ${room}? Use it to log in and test. When a tenant moves in, give them a new one.`)) return;
  const pw = await ccSetNewRoomPassword(room, 'Tenant-app password');
  if (pw) { _tnPwAt[room] = new Date().toISOString(); _tnRender(); }
}
async function _tnGivePw(room, name) {
  if (!sbL) { alert('No database connection.'); return; }
  if (!confirm(`Give ${name || 'the tenant'} a tenant-app password for ${room}? A previous password stops working.`)) return;
  const pw = await ccSetNewRoomPassword(room, 'Login password');
  if (pw) { _tnPwAt[room] = new Date().toISOString(); _tnRender(); }
}

/* After a (re)load: repaint only if the data really changed and you are not in
   the middle of editing here (unsaved Kaution / rent / profile, an open NK form).
   Otherwise the screen stays exactly as it is — nothing typed gets lost. */
let _tnRenderedSig = null;
function _tnRenderIfChanged() {
  const sig = ccStableJSON([_tnRecords, _tnKaution, _tnNK, _tnDocs, _tnNKVoraus, _tnProfileCache, _tnPwAt,
                              (typeof _ccfReadings !== 'undefined' ? _ccfReadings : {}),
                              (typeof CC_RP !== 'undefined' ? CC_RP.rows.filter(r => r.app === 'casa') : []),
                              (typeof appRooms !== 'undefined' ? appRooms : []).map(r => [r.id, r.name, r.active, r.vacant, r.sort_order,
                                r.kaltmiete, r.nk_pauschale, r.kurzzeit_kaltmiete, r.kurzzeit_nk, r.mietvertrag_pricing, r.kurzzeit_pricing, r.kaution_override, r.kaution_default, r.active_price_type])]);
  const list  = document.getElementById('tenantsList');
  const shown = !!(list && list.querySelector('.tn-card'));
  if (shown && sig === _tnRenderedSig) return;
  const tab = document.getElementById('tab-tenants');
  if (shown && tab && tab.querySelector('.cc-save[data-cc-save="dirty"], .tn-nk-add-form, .tn-nkv-add-form')) return;
  _tnRender();
  _tnRenderedSig = sig;
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

  const rooms = (typeof appRooms !== 'undefined' && appRooms.length)
    ? appRooms.filter(r => r.active).sort((a,b) => (a.sort_order||0) - (b.sort_order||0))
    : (typeof ALL_ROOMS !== 'undefined' ? ALL_ROOMS.map(n => ({ name:n, active:true, vacant:false })) : []);

  if (!rooms.length) { list.innerHTML = `<p class="tn-empty">No rooms configured.</p>`; return; }

  // Snapshot any cards currently open in the DOM before wiping
  document.querySelectorAll('.tn-card.open').forEach(el => _tnOpenCards.add(el.id));

  // Summary: total kaution held across all tenants (active + unsettled former)
  _tnSummaryUpdate();   // Kaution held + "Open: NK · n  Kaution · n"

  // Same cards in the same order as on screen → swap only the cards whose content changed
  // (Rentals does the same): no flash, no jump, and an open form in another card stays open
  const cards = rooms.map(r => ({ id: 'tc-' + esc(r.name.replace(/\s+/g,'_').toLowerCase()), html: _tnCardHTML(r) }));
  const onScreen = [...list.querySelectorAll(':scope > .tn-card')];
  if (typeof ccSwapCard === 'function' && onScreen.length === cards.length && onScreen.every((c, i) => c.id === cards[i].id)) {
    cards.forEach((c, i) => {
      if (_tnCardCache[c.id] === c.html) return;
      ccSwapCard(onScreen[i], c.html, 'open');
      _tnCardCache[c.id] = c.html;
    });
    _tnBindCards();
    if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
    return;
  }
  list.innerHTML = cards.map(c => c.html).join('');
  _tnCardCache = {};
  cards.forEach(c => { _tnCardCache[c.id] = c.html; });

  // Restore open state (read mode is the default after re-render — no extra work needed)
  _tnOpenCards.forEach(id => document.getElementById(id)?.classList.add('open'));

  _tnBindCards();
  if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
}
let _tnCardCache = {};   // card id → its HTML as last drawn


/* ══════════════════════════════════════════════════════════════
   10. CARD HTML
══════════════════════════════════════════════════════════════ */
function _tnCardHTML(room) {
  const rid      = esc(room.name.replace(/\s+/g,'_').toLowerCase());
  const _pick = _ccPickTenancy(_tnRecords.filter(r => r.room === room.name && r.status === 'active'));
  // Current tenant first; a signed next tenant only takes the card when nobody lives there now
  const activeRec = _pick.current || _pick.next;
  const nextRec   = _pick.current ? _pick.next : null;
  const formerRecs = _tnRecords
    .filter(r => r.room === room.name && r.status === 'former')
    .sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));
  const archivedRecs = _tnRecords
    .filter(r => r.room === room.name && r.status === 'archived')
    .sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));

  const isOpen = false;

  // Collapsed nudge: former tenants with unsettled kaution
  const formerNudges = formerRecs
    .map(r => ({ r, pills: _tnFormerOpenPills(r) }))
    .filter(x => x.pills)
    .map(({ r, pills }) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '\u2014';
      return `<button type="button" class="tn-former-line" onclick="event.stopPropagation();_tnOpenModal('${r.id}')">
        <span class="tn-fl-main">
          <span class="tn-fl-top"><span class="tn-fl-lbl">Former</span><span class="tn-fl-name">${esc(name)}</span>${r.mietende ? `<span class="tn-fl-out">\u00b7 moved out ${_tnFmtDate(r.mietende)}</span>` : ''}</span>
          <span class="tn-fl-pills">${pills}</span></span>
        <i class="ti ti-chevron-right tn-fl-chev" aria-hidden="true"></i></button>`;
    }).join('');

  return `
<div class="tn-card${isOpen?' open':''}" id="tc-${rid}" data-room="${esc(room.name)}">
  ${_tnHeaderHTML(rid, room, activeRec)}
  ${formerNudges}
  <div class="tn-body" id="tb-${rid}">
    ${activeRec
      ? _tnRentBarHTML(rid, room, activeRec) + _tnRentFormHTML(rid, room, activeRec) + _tnContractStripHTML(rid, room, activeRec) + _tnMhRowHTML(rid, room, activeRec)
      : _tnNewContractHTML(rid, room)}
    ${_ccNextTenantHTML(nextRec, nextRec ? esc([nextRec.first_name, nextRec.last_name].filter(Boolean).join(' ')) : '', _tnFmtDate, '_tnOpenModal')}
    ${_tnProfileSectionHTML(rid, room, activeRec)}
    ${activeRec ? _tnKautionHTML(rid, activeRec.id, 'card') : ''}
    ${activeRec ? _tnNkGroupHTML(rid, room, activeRec) : ''}
    ${activeRec ? _tnDetailsGroupHTML(rid, activeRec) : ''}
    ${_tnEarlierContractsHTML(rid, activeRec)}
    ${_tnFormerSectionHTML(rid, room.name, formerRecs, archivedRecs)}
  </div>
</div>`;
}

/* ── NEBENKOSTEN + DETAILS: one row each, the full section opens in a sheet ── */
function _tnNkGroupHTML(rid, room, rec) {
  const rows = [];
  if (!_tnAllPauschal(rec)) {
    const open = _tnNkHasOpen(rec.id);
    rows.push(ccRowHTML({ icon: 'receipt', title: 'NK-Abrechnungen',
      meta: open ? `<span class="tnp tnp-amber">${esc(_tnNkOpenLabel(rec))}</span>` : 'none due',
      onclick: `_tnSheet('nk','${rid}','${rec.id}')` }));
  }
  if (_tnIsKaltNK(rec, room.name)) {
    const c = _tnNKVorausCurFor(room.name);
    const pend = typeof ccTnNkChangeTodo === 'function' ? ccTnNkChangeTodo(_tnNKVoraus[room.name], rec) : null;
    rows.push(ccRowHTML({ icon: 'coin-euro', title: 'NK-Vorauszahlung',
      meta: pend ? `<span class="tnp ${pend.level === 'red' ? 'tnp-red' : 'tnp-amber'}">${esc(pend.text)}</span>`
                 : c ? `${_tnFmtEUR(c.amount)}/mo` : 'not set',
      onclick: `_tnSheet('nkv','${rid}','${rec.id}')` }));
  }
  return rows.length ? ccGroupHTML('Nebenkosten', rows.join('')) : '';
}
function _tnDetailsGroupHTML(rid, rec) {
  if (typeof ccfDocsSectionHTML !== 'function') return '';
  return ccGroupHTML('Details',
    ccRowHTML({ icon: 'file-text', title: 'Documents', meta: esc(ccfDocsSummary(rec)), onclick: `_tnSheet('docs','${rid}','${rec.id}')` }) +
    ccRowHTML({ icon: 'gauge', title: 'Zählerstände', meta: esc(ccfMetersSummary(rec)), onclick: `_tnSheet('meters','${rid}','${rec.id}')` }));
}
function _tnSheet(kind, rid, tid) {
  const rec0 = _tnRecords.find(r => String(r.id) === String(tid)); if (!rec0) return;
  const titles = { nk: 'NK-Abrechnungen', nkv: 'NK-Vorauszahlung', docs: 'Documents', meters: 'Zählerstände', mh: 'Mieterhöhung' };
  ccSheetOpen({
    title: titles[kind],
    kicker: rec0.room + ' \u00b7 ' + ([rec0.first_name, rec0.last_name].filter(Boolean).join(' ') || ''),
    build: () => {
      const rec = _tnRecords.find(r => String(r.id) === String(tid)); if (!rec) return '';
      if (kind === 'nk')     return _tnNKHTML(rid, rec.id, 'card');
      if (kind === 'nkv')    return _tnNKVorausHTML(rid, rec.room, 'card');
      if (kind === 'docs')   return ccfDocsSectionHTML(rec, 'card');
      if (kind === 'meters') return ccfMetersSectionHTML(rec, 'card');
      if (kind === 'mh')     return _tnMhHTML(rid, rec.room, rec);
      return '';
    },
  });
}

/* NK-Vorauszahlung of the room's CURRENT tenant: their own latest rate (never the previous
   tenant's); none entered yet → the NK of their contract, from the move-in */
function _tnNKVorausWho(room) {
  const today = _ccTodayIso();
  return (_tnRecords || []).filter(r => r.room === room && r.status === 'active')
    .sort((a, b) => String(a.mietbeginn || '').localeCompare(String(b.mietbeginn || '')))
    .find(r => !r.mietbeginn || _ccIso(r.mietbeginn) <= today) || null;
}
function _tnNKVorausCurFor(room) {
  const who = _tnNKVorausWho(room); if (!who) return null;
  const mb = who.mietbeginn ? _ccIso(who.mietbeginn) : '', today = _ccTodayIso();
  const e = (_tnNKVoraus[room] || []).filter(x => x.tenant_id ? String(x.tenant_id) === String(who.id)
      : (!mb || String(x.effective_date).slice(0, 10) >= mb))
    .find(x => String(x.effective_date).slice(0, 10) <= today);
  if (e) return { amount: Number(e.amount), since: String(e.effective_date).slice(0, 10) };
  const r = _tnCurrentRent(who, room);
  if (r && r.mode !== 'pauschal' && r.nk) return { amount: Number(r.nk), since: mb, fromContract: true };
  return null;
}

/* ── HEADER ── */
function _tnHeaderHTML(rid, room, activeRec) {
  // A signed tenant who moves in later is shown like a tenant ("from 01.10.2026"), not as "No current tenant"
  const _movesIn = typeof ccTnMovesIn === 'function' ? ccTnMovesIn(!!room.vacant, activeRec) : null;
  const vacant = !!room.vacant && !_movesIn;
  const fullName = activeRec
    ? [activeRec.first_name, activeRec.last_name].filter(Boolean).join(' ')
    : null;

  // The tenant's own rent (history → stored on the tenant) and own contract type — same as the rent bar below
  const curR = _tnCurrentRent(activeRec, room.name);
  const isKaltNK = !!curR && curR.mode !== 'pauschal';
  const kalt = curR ? curR.kalt : null;
  const nk   = curR ? curR.nk   : null;
  const warm = curR ? curR.total : null;

  const mietbeginn = activeRec ? _tnFmtDate(activeRec.mietbeginn) : null;
  const mietende   = activeRec ? _tnFmtDate(activeRec.mietende)   : null;
  const _cs = activeRec ? _tnContractState(activeRec) : null;
  const _lastC = _cs && _cs.all.length ? _cs.all[_cs.all.length - 1] : null;
  const dateStr = mietbeginn && mietende
    ? `${mietbeginn} \u2013 ${mietende} (move-out)`
    : mietbeginn ? `${_movesIn ? 'from' : 'since'} ${mietbeginn}${_lastC && _lastC.end ? ' \u00b7 contract until ' + _ccFmtD(_lastC.end) : ''}` : '';
  const _nextC = _cs ? _cs.next : null;
  const _mhN = activeRec ? _tnMhNext(activeRec, room.name) : null;   // next Mieterhöhung
  const hdrNext = _nextC && _nextC.amt && curR && _nextC.amt.total !== curR.total
    ? `<div class="tn-dot-sep"></div><span class="tn-dim" style="color:#8C5A30">\u2192 ${_tnFmtEUR(_nextC.amt.total)} ab ${_ccFmtD(_nextC.start)}</span>`
    : _mhN && curR
    ? `<div class="tn-dot-sep"></div><span class="tn-dim" style="color:#8C5A30">\u2192 ${_tnFmtEUR(curR.mode === 'pauschal' ? Number(_mhN.amount) : Number(_mhN.amount) + (Number(curR.nk) || 0))} ab ${_ccFmtD(String(_mhN.effective_date).slice(0, 10))}</span>` : '';

  const pills = _tnCardPills(room, activeRec);
  const ctLabel = activeRec ? (_tnTypeWord(tnContractType(activeRec)) || '') : '';

  let midLine = '';
  let botLine = '';

  // Bug 1 fix: Occupied/Vacant badge comes purely from rooms.vacant (Supabase rooms table).
  // activeRec presence is independent — a room can be marked occupied in rooms tab
  // but not yet have a tenant record entered here.
  if (vacant) {
    // rooms.vacant = true → always Vacant regardless of tenant records
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No current tenant</span>`;
  } else if (activeRec) {
    // rooms.vacant = false AND has active tenant record → Occupied with full info
    midLine = `
      <span class="tn-tenant-name">${esc(fullName || 'Unnamed tenant')}</span>
      ${dateStr ? `<span class="tn-tenant-dates">${esc(dateStr)}</span>` : ''}`;
    botLine = `
      <div class="tn-hdr-bot">
        ${warm != null ? `<span class="tn-warm">${_tnFmtEUR(warm)}</span><span class="tn-dim">${isKaltNK ? 'warm' : 'pauschal'}</span>` : ''}
        ${(kalt != null && nk != null && isKaltNK) ? `<div class="tn-dot-sep"></div><span class="tn-dim">${_tnFmtEUR(kalt).replace('\u00a0\u20ac','')} + ${_tnFmtEUR(nk).replace('\u00a0\u20ac','')} Kalt + NK</span>` : ''}
        ${ctLabel ? `<div class="tn-dot-sep"></div><span class="tn-dim">${ctLabel}</span>` : ''}
        ${hdrNext}
      </div>`;
  } else {
    // rooms.vacant = false but no tenant record yet → Occupied (room is assigned) but no tenant added
    midLine = `<span class="tn-tenant-name" style="color:var(--cc-stone);font-weight:400;font-style:italic">No tenant added</span>`;
  }

  return `
<div class="tn-hdr-wrap" onclick="_tnToggleCard('tc-${rid}')">
  <div class="tn-hdr-top">
    <div id="hdr-kpill-${rid}" style="margin-left:auto;display:flex;align-items:center;gap:4px">${pills.row1}</div>
    <i class="ti ti-chevron-right tn-chev" aria-hidden="true"></i>
  </div>
  <div class="tn-room-lbl tn-unit-line">${esc(room.name)}</div>
  <div class="tn-hdr-mid">${midLine}</div>
  ${botLine}
  <div class="tn-todo-row" id="hdr-todo-${rid}" style="${pills.todo ? '' : 'display:none'}">${pills.todo}</div>
</div>`;
}


/* ══ MIETERHÖHUNG (Casa Castel) ═══════════════════════════════════════════
   One tenancy owns its steps (ccTnStepOwned). Typed here — Mieterhöhung · Index · Korrektur — and
   counted by Controlling from their date on (skipped never). A renewal with a new rent shows as
   "Verlängerung" (rent history, read-only). Pauschal tenants: the amount is the new Pauschalmiete. */
function _tnOwnMh(roomName, rec) {
  if (!rec) return [];
  const recs = _tnRecords.filter(r => r.room === roomName);
  return (_tnMh[roomName] || []).filter(e => typeof ccTnStepOwned === 'function' ? ccTnStepOwned(e, rec, recs) : true);
}
const _tnMhKind = e => (typeof CC_MH_KINDS !== 'undefined' && CC_MH_KINDS[e.kind || 'mieterhoehung']) || 'Mieterhöhung';
function _tnMhRowHTML(rid, room, rec) {
  if (!rec) return '';
  const own = _tnOwnMh(room.name, rec);
  const st = typeof ccTnStepState === 'function' ? ccTnStepState(own) : null;
  const fd = d => _ccFmtD(String(d).slice(0, 10));
  const meta = st && st.state === 'overdue' ? `<span class="tnp tnp-red">Mieterhöhung overdue</span>`
    : st && st.state === 'reminder' ? `<span class="tnp tnp-amber">Mieterhöhung from ${fd(st.entry.effective_date)}</span>`
    : (typeof ccTnStepNext === 'function' ? ccTnStepNext(own, _tnFmtEUR, fd) : '');
  return ccGroupHTML('', ccRowHTML({ icon: 'trending-up', title: 'Mieterhöhung', meta, onclick: `_tnSheet('mh','${rid}','${rec.id}')` }));
}
function _tnMhHTML(rid, roomName, rec) {
  const own = _tnOwnMh(roomName, rec).slice().sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fd = d => _ccFmtD(String(d).slice(0, 10));
  const pausch = !_tnIsKaltNK(rec, roomName);
  const cur = _tnCurrentRent(rec, roomName);
  const st = e => e.ignored ? ['tnp-gray', 'skipped'] : e.tenant_adjusted ? ['tnp-green', 'adjusted']
    : new Date(e.effective_date) > today ? ['tnp-amber', 'upcoming'] : ['tnp-red', 'open'];
  const next = own.filter(e => !e.ignored && !e.tenant_adjusted).sort((a, b) => String(a.effective_date).localeCompare(String(b.effective_date)))[0];
  const ren = (typeof ccRpFor === 'function' ? ccRpFor('casa', rec.id) : []).filter(p => p.kind === 'renewal')
    .map(p => ({ renewal: true, effective_date: ccRpIso(p.valid_from), amount: (ccRpAmount(p) || {})[pausch ? 'total' : 'kalt'] }));
  const all = own.concat(ren).sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)));
  const btn = (e, k, on, lbl) => `<button type="button" class="tn-nkv-pill ${on ? (k === 'adj' ? 'done' : 'ignored') : 'pending'}" onclick="_tnMhToggle('${e.id}','${esc(roomName)}','${k}')">${lbl}</button>`;
  const rows = all.map(e => {
    if (e.renewal) return `<div class="tn-mh-r"><span class="tn-mh-t">From ${fd(e.effective_date)} · ${e.amount != null ? _tnFmtEUR(e.amount) : '—'}</span><span class="tnp tnp-gray">Verlängerung</span></div>`;
    const s = st(e);
    return `<div class="tn-mh-r"><span class="tn-mh-t"${e.ignored ? ' style="text-decoration:line-through;color:var(--cc-taupe)"' : ''}>From ${fd(e.effective_date)} · ${_tnFmtEUR(e.amount)}</span>
      <span class="tnp tnp-gray">${_tnMhKind(e)}</span><span class="tnp ${s[0]}">${s[1]}</span>
      <button class="tn-icon-btn" style="color:var(--cc-stone)" aria-label="Delete" onclick="_tnMhDelete('${e.id}','${esc(roomName)}')"><i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i></button></div>`;
  }).join('');
  return `
<div class="tn-sec" id="mh-sec-${rid}"><div class="tn-sec-body" style="padding-top:10px">
  <style>.tn-mh-r{display:flex;align-items:center;gap:6px;padding:8px 0;border-top:var(--cc-border);font-size:12.5px}.tn-mh-r:first-of-type{border-top:none}.tn-mh-t{flex:1;min-width:0}</style>
  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px">
    <span><span class="tn-flbl" style="display:block">${pausch ? 'Pauschalmiete' : 'Kaltmiete'} now</span>
      <b style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500">${cur ? _tnFmtEUR(pausch ? cur.total : cur.kalt) : '—'}</b> <span class="tn-flbl">/mo</span></span>
  </div>
  ${next ? `<div style="border-radius:10px;background:#FAEEDA;border:.5px solid #EF9F27;padding:10px 12px;margin-bottom:10px">
      <div class="tn-flbl" style="color:#8A6535">Next Mieterhöhung</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b style="font-size:16px">${_tnFmtEUR(next.amount)}</b><span style="font-size:12px;color:#633806">from ${fd(next.effective_date)}</span></div>
      <div style="display:flex;gap:6px;margin-top:6px">${btn(next, 'adj', false, '<i class="ti ti-check"></i> Adjusted')}${btn(next, 'ign', false, '<i class="ti ti-ban"></i> Skip')}</div></div>`
    : `<p class="tn-empty" style="margin:0 0 10px">No Mieterhöhung planned.</p>`}
  ${rows ? `<div class="tn-msec-lbl" style="margin:4px 0 2px">All Mieterhöhungen</div>${rows}` : ''}
  <div id="mh-add-${rid}" style="display:none;margin-top:12px;border-top:var(--cc-border);padding-top:12px">
    <div class="cc-add-grid">
      <label class="cc-add-f"><span class="tn-flbl">From</span><input type="date" id="mh-date-${rid}" value="${ccTodayPlusYearsISO(1)}"/></label>
      <label class="cc-add-f"><span class="tn-flbl">New ${pausch ? 'Pauschalmiete' : 'Kaltmiete'} €</span><input type="number" data-cc-num="2" id="mh-amt-${rid}" placeholder="0,00" step="0.01" min="0"/></label>
      <label class="cc-add-f"><span class="tn-flbl">Type</span><select class="cc-select" id="mh-kind-${rid}"><option value="mieterhoehung">Mieterhöhung</option><option value="index">Index</option><option value="korrektur">Korrektur</option></select></label>
    </div>
    <div class="cc-add-slot"><button type="button" class="cc-add-btn" onclick="document.getElementById('mh-add-${rid}').style.display='none'">Cancel</button>
      <button type="button" class="cc-add-btn is-primary" onclick="_tnMhAdd('${rid}','${esc(roomName)}','${rec.id}')">Save</button></div>
  </div>
  <div class="cc-sec-foot"><button type="button" onclick="const f=document.getElementById('mh-add-${rid}');f.style.display='block';f.querySelector('input[type=number]')?.focus()"><i class="ti ti-plus"></i> Mieterhöhung</button></div>
</div></div>`;
}
async function _tnMhAdd(rid, roomName, tid) {
  const date = document.getElementById('mh-date-' + rid)?.value?.trim();
  const amount = parseFloat(document.getElementById('mh-amt-' + rid)?.value);
  const kind = document.getElementById('mh-kind-' + rid)?.value || 'mieterhoehung';
  if (!date || isNaN(amount) || amount <= 0) { ccToast('Please enter the date and the new rent', true); return; }
  const { data, error } = await sbL.from('casa_mieterhoehung_history')
    .insert({ room: roomName, tenant_id: String(tid), effective_date: date, amount, kind, tenant_adjusted: false, ignored: false }).select().single();
  if (error) { ccSaveFailed(error, 'Mieterhöhung (SQL run?)'); return; }
  (_tnMh[roomName] = _tnMh[roomName] || []).unshift(data);
  if (typeof ccSavedToast === 'function') ccSavedToast('Mieterhöhung saved');
  _tnRender(); if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
}
async function _tnMhToggle(id, roomName, k) {
  const e = (_tnMh[roomName] || []).find(x => String(x.id) === String(id)); if (!e) return;
  const upd = k === 'adj' ? { tenant_adjusted: !e.tenant_adjusted } : { ignored: !e.ignored };
  const { error } = await sbL.from('casa_mieterhoehung_history').update(upd).eq('id', id);
  if (error) { ccSaveFailed(error, 'Mieterhöhung'); return; }
  Object.assign(e, upd);
  if (typeof ccSavedToast === 'function') ccSavedToast(k === 'adj' ? 'Adjusted' : (e.ignored ? 'Skipped' : 'Applied again'));
  _tnRender(); if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
}
async function _tnMhDelete(id, roomName) {
  const ok = typeof ccConfirm === 'function' ? await ccConfirm('Delete this Mieterhöhung?', 'Controlling then uses the previous rent again for these months.', 'Delete', true) : true;
  if (!ok) return;
  const { error } = await sbL.from('casa_mieterhoehung_history').delete().eq('id', id);
  if (error) { ccSaveFailed(error, 'Mieterhöhung'); return; }
  _tnMh[roomName] = (_tnMh[roomName] || []).filter(x => String(x.id) !== String(id));
  _tnRender(); if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
}
/* Former tenant: their Mieterhöhungen stay with them as read-only info */
function _tnMhInfoHTML(rec) {
  const own = _tnOwnMh(rec.room, rec).slice().sort((a, b) => String(a.effective_date).localeCompare(String(b.effective_date)));
  if (!own.length) return '';
  const end = rec.mietende ? String(rec.mietende).slice(0, 10) : null;
  return `<div class="tn-msec"><div class="tn-msec-body" style="padding-top:10px">
    <div style="margin-bottom:4px"><span class="tn-msec-lbl">Mieterhöhungen</span></div>
    ${end ? `<p class="tn-empty" style="margin:0 0 4px">Moved out ${_ccFmtD(end)} – these steps stay with this tenancy and count nowhere after the move-out.</p>` : ''}
    ${own.map(e => { const d = String(e.effective_date).slice(0, 10);
      const s = end && d > end ? ['tnp-gray', 'not reached'] : e.ignored ? ['tnp-gray', 'skipped'] : e.tenant_adjusted ? ['tnp-green', 'adjusted'] : ['tnp-gray', 'not adjusted'];
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:var(--cc-border);font-size:12.5px"><span style="flex:1">From ${_ccFmtD(d)} · ${_tnFmtEUR(e.amount)}</span><span class="tnp tnp-gray">${_tnMhKind(e)}</span><span class="tnp ${s[0]}">${s[1]}</span></div>`; }).join('')}
  </div></div>`;
}
/* ── RENT BAR = the running contract (its name and dates inside the beige) ── */
function _tnRentBarHTML(rid, room, rec) {
  const cur = _tnCurrentRent(rec, room.name);
  const priceLabel = _tnPriceLabel(room.name) || '';
  const st = rec ? _tnContractState(rec) : null;
  const c  = st ? st.cur : null;
  // a rent change inside the running contract (e.g. NK-Anpassung) — the next contract has its own line
  const nextP = rec && typeof ccRpFor === 'function'
    ? ccRpFor('casa', rec.id).find(p => ccRpIso(p.valid_from) > ccRpToday() && p.kind !== 'renewal'
        && (!st || !st.next || ccRpIso(p.valid_from) < st.next.start)) : null;
  const pausch = cur && cur.mode === 'pauschal';
  const _mhN0 = rec ? _tnMhNext(rec, room.name) : null;          // next Mieterhöhung → "neu ab" under the rent
  const title = c ? `<div class="tn-rtitle"><span class="tn-rt-name">${esc(c.name)}</span><span class="tn-rt-dates">${esc(_tnContractSub(c))}</span></div>` : '';

  return `
<div class="tn-rent-wrap" id="rbar-${rid}">
  ${title}
  <div class="tn-rent-bar">
  <div class="tn-rc">
    <div class="tn-rlbl">${pausch ? 'Pauschal' : 'Kaltmiete'}</div>
    <div class="tn-rval">${cur ? _tnFmtEUR(pausch ? cur.total : cur.kalt) : '\u2014'}</div>
    <div class="tn-rsub">${_mhN0 ? `<span style="color:#8C5A30">neu ab ${ccRpFmt(_mhN0.effective_date)}</span>` : cur ? 'per month' : 'not set'}</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Nebenkosten</div>
    <div class="tn-rval">${!cur ? '\u2014' : pausch ? 'inkl.' : _tnFmtEUR(cur.nk)}</div>
    <div class="tn-rsub">${nextP ? 'neu ab ' + ccRpFmt(nextP.valid_from) : 'per month'}</div>
  </div>
  <div class="tn-rc">
    <div class="tn-rlbl">Warmmiete</div>
    <div class="tn-rval">${cur ? _tnFmtEUR(cur.total) : '\u2014'}</div>
    <div class="tn-rsub">${pausch ? 'pauschal' : 'Kalt + NK'}</div>
  </div>
  <div class="tn-rc">
    <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
      ${priceLabel ? `<span class="tnp tnp-gray">${esc(priceLabel)}</span>` : ''}
      <button class="tn-edit-rent-btn" onclick="_tnToggleRentEdit('${rid}')">
        <i class="ti ti-pencil" style="font-size:10px"></i> Edit
      </button>
    </div>
  </div>
  </div>
</div>`;
}

/* ── RENT FORM ──
   Shows only the tenant's own rent (B3). Today's room price is a grey hint.
   "Gilt ab" empty = correct the current rent · a date = new rent from that day
   (the old rent stays in the history). */
function _tnRentFormHTML(rid, room, rec) {
  const liveP = _tnRoomPricing(room.name, rec ? tnContractType(rec) : null);
  const cur   = _tnCurrentRent(rec, room.name);
  const mode  = cur ? cur.mode : _tnLegacyMode(room.name, rec);
  const pausch = mode === 'pauschal';
  const kalt = cur ? (pausch ? cur.total : cur.kalt) : '';
  const nk   = cur && !pausch ? cur.nk : '';
  const warm = cur ? cur.total : '';
  const hintK = pausch ? ((Number(liveP.kaltmiete) || 0) + (Number(liveP.nebenkosten) || 0) || '') : (liveP.kaltmiete ?? '');
  const tid  = rec ? rec.id : '';
  const ksoll = (rec && rec.kaution_soll != null) ? Number(rec.kaution_soll)
    : (_tnKautionSoll(room.name, rec ? rec.mietbeginn : null, rec ? rec.mietende : null, rec ? _tnBaseContractType(rec) : null) ?? '');
  const st  = rec ? _tnContractState(rec) : null;
  const c   = st ? st.cur : null;
  const ct  = c ? (c.type || 'mietvertrag') : 'mietvertrag';

  return `
<div class="tn-rent-form" id="rform-${rid}" data-mode="${mode}" style="display:none">
  ${c ? `<div class="tn-rf" style="grid-column:1/-1"><span class="tn-flbl">Contract \u00b7 ${esc(c.name)}</span>${_tnCtSegHTML('data-rf', ct)}</div>
  <div class="tn-rf"><span class="tn-flbl">Start</span><div class="tn-rf-derived">${c.start ? _ccFmtD(c.start) : '\u2014'}</div></div>
  <div class="tn-rf" data-cc="endwrap"${c.last && ct === 'mietvertrag' ? ' style="display:none"' : ''}><span class="tn-flbl">Contract end</span>${c.last
      ? `<input type="text" id="rf-end-${rid}" value="${c.end ? _ccFmtD(c.end) : ''}" placeholder="TT.MM.JJJJ"/>`
      : `<div class="tn-rf-derived">${_ccFmtD(c.end)}</div>`}</div>
  <div class="tn-rf" style="grid-column:1/-1"><span class="tn-flbl">Rent</span>${_tnModeSegHTML('data-rf', mode)}</div>` : ''}
  <div class="tn-rf">
    <span class="tn-flbl"><span data-kaltlbl>${pausch ? 'Pauschalmiete' : 'Kaltmiete'}</span> \u20ac/mo</span>
    <input type="number" data-cc-num="2" id="rf-kalt-${rid}" value="${kalt}" placeholder="${hintK}" readonly data-mh-lock
      oninput="_tnUpdateWarm('${rid}')"/>
    <span class="tn-rf-hint" style="margin:3px 0 0">Raise it with <a href="#" onclick="event.preventDefault();_tnSheet('mh','${rid}','${tid}')">Mieterhöhung</a> · <a href="#" onclick="event.preventDefault();ccMhUnlock(this)">Correct</a></span>
  </div>
  <div class="tn-rf" data-nkwrap${pausch ? ' style="display:none"' : ''}>
    <span class="tn-flbl">Nebenkosten \u20ac/mo</span>
    <input type="number" data-cc-num="2" id="rf-nk-${rid}" value="${nk}" placeholder="${liveP.nebenkosten ?? ''}"
      oninput="_tnUpdateWarm('${rid}')"/>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Warmmiete</span>
    <div class="tn-rf-derived" id="rf-warm-${rid}">${warm !== '' ? _tnFmtEUR(warm) : '\u2014'}</div>
  </div>
  <div class="tn-rf">
    <span class="tn-flbl">Gilt ab</span>
    <input type="text" id="rf-from-${rid}" value="" placeholder="TT.MM.JJJJ"/>
  </div>
  <!-- Kaution Soll: only in the Kaution section -->
  <div class="tn-rf-save-row" style="grid-column:1/-1;justify-content:space-between;align-items:center">
    <span class="tn-rf-hint" style="margin:0">${c ? `Changes only the ${esc(c.name)}${st.next ? ` \u2014 the ${esc(st.next.name)} keeps its own rent` : ''}. ` : ''}Gilt ab leer = correct it \u00b7 a date = change from that day (e.g. NK)</span>
    <div style="display:flex;gap:6px">
      <button class="tn-btn tn-btn-sm" onclick="_tnToggleRentEdit('${rid}')">Cancel</button>
      <button class="tn-btn tn-btn-primary cc-save" onclick="_tnSaveRent('${rid}','${tid}','${esc(room.name)}')">
        Save
      </button>
    </div>
  </div>
</div>`;
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

/* ── TENANCY (3b): Contract end · Move-out · Renew ──
   Contract end ≠ move-out: the contract can end and be renewed with the same tenant;
   only a move-out makes the tenant former and the unit vacant. Both dates are set in Edit.
   Renew follows the contract type: Kurzzeit (befristet) is renewed, Mietvertrag
   (unbefristet) never. A renewal removes a planned move-out. */
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

/* Empty room: the next tenant's contract, in the beige bar's place — same layout as an occupied room */
function _tnNewContractHTML(rid, room) {
  const ct = _tnRoomContractType(room.name) || 'mietvertrag';
  const hasVE = _ccHasVE(_tnRecords);
  return `
<div class="tn-rent-wrap tn-newc" id="newc-${rid}">
  <div class="tn-rtitle"><span class="tn-rt-name">New contract</span><span class="tn-rt-dates">for the next tenant</span></div>
  <div class="tn-fg" style="padding:8px 14px 12px">
    <div class="tn-field tn-field-full"><span class="tn-flbl">Contract</span>${_tnCtSegHTML('data-f', ct)}</div>
    ${hasVE ? `<div class="tn-field" data-cc="endwrap"${ct === 'mietvertrag' ? ' style="display:none"' : ''}><span class="tn-flbl">Contract end</span>
      <input data-f="vertragsende" type="text" value="" placeholder="TT.MM.JJJJ"/></div>` : ''}
    <div class="tn-field tn-field-full"><span class="tn-flbl">Rent</span>${_tnModeSegHTML('data-f', 'kalt_nk')}</div>
    <div class="tn-field"><span class="tn-flbl" data-kaltlbl>Kaltmiete</span>
      <input data-f="kaltmiete" type="number" data-cc-num="2" inputmode="decimal" value="" placeholder="0,00"/></div>
    <div class="tn-field" data-nkwrap><span class="tn-flbl">Nebenkosten</span>
      <input data-f="nebenkosten" type="number" data-cc-num="2" inputmode="decimal" value="" placeholder="0,00"/></div>
    <div class="tn-field"><span class="tn-flbl">Kaution</span>
      <input data-f="kaution_soll" type="number" data-cc-num="2" inputmode="decimal" value="" placeholder="0,00"/></div>
  </div>
</div>`;
}

function _tnProfileSectionHTML(rid, room, rec) {
  const isEmpty = !rec || (!rec.first_name && !rec.last_name && !rec.email && !rec.mietbeginn);
  const startEdit = !rec || isEmpty;
  const email = rec ? esc(rec.email || '') : '';
  const fullName = rec ? [rec.first_name, rec.last_name].filter(Boolean).join(' ') : '';

  const ct     = rec ? tnContractType(rec) : null;
  const ctNext = rec ? _tnCtNextChange(rec) : null;
  const ctRead = ct
    ? esc(_tnContractLabel(ct)) + (ctNext ? ` <span class="tn-ct-next">\u2192 ${esc(_tnContractLabel(ctNext.type))} ab ${_ccFmtD(ctNext.from)}</span>` : '')
    : '<span class="muted">Not set</span>';
  const ctEdit = ct || _tnRoomContractType(room.name) || 'mietvertrag';   // a new tenant starts with the room's offer
  const hasVE  = _ccHasVE(_tnRecords);
  // Contract end: a Mietvertrag without an end date is unbefristet; a Kurzzeit always needs one
  const veRead    = rec && rec.vertragsende ? _tnFmtDate(rec.vertragsende) : (ct === 'mietvertrag' ? 'unbefristet' : '');
  const veMissing = !!(rec && _tnIsFixed(ct) && !rec.vertragsende && !rec.mietende);

  const readView = !rec ? '' : `
  <div class="tn-fg" id="pread-${rid}">
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <span class="tn-fval">${esc(rec.birthday||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <span class="tn-fval">${esc(rec.phone||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field tn-field-full"><span class="tn-flbl">Email</span>
      <span class="tn-fval">${email || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
      <span class="tn-fval">${esc(rec.address||'') || '<span class="muted">—</span>'}</span></div>
    <div class="tn-field tn-field-full" style="border-top:1px solid var(--cc-rule);margin-top:6px;padding-top:8px;">
      <div class="tn-fg">
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <span class="tn-fval">${_tnFmtDate(rec.mietbeginn) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <span class="tn-fval ${rec.mietende ? '' : 'muted'}">${_tnFmtDate(rec.mietende) || 'open-ended'}</span></div>
        ${veMissing ? `<div class="tn-field"><span class="tn-flbl">Contract end</span>
          <span class="tn-fval"><span class="tn-ve-missing">Missing</span> \u00b7 set it in the rent bar (Edit)</span></div>` : ''}
      </div>
    </div>
  </div>`;

  const editView = `
  <div class="tn-fg" id="pedit-${rid}" ${startEdit ? '' : 'style="display:none"'}>
    <div class="tn-field"><span class="tn-flbl">Name</span>
      <input data-f="name" type="text" value="${esc(fullName)}" placeholder="Full name"/></div>
    <div class="tn-field"><span class="tn-flbl">Birthday</span>
      <input data-f="birthday" type="text" value="${esc(rec ? rec.birthday||'' : '')}" placeholder="TT.MM.JJJJ"/></div>
    <div class="tn-field"><span class="tn-flbl">Email</span>
      <input data-f="email" type="email" value="${email}" placeholder="tenant@mail.de"/></div>
    <div class="tn-field"><span class="tn-flbl">Phone</span>
      <input data-f="phone" type="tel" value="${esc(rec ? rec.phone||'' : '')}" placeholder="+49 ..."/></div>
    <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
      <input data-f="address" type="text" value="${esc(rec ? rec.address||'' : '')}" placeholder="Street, City"/></div>
    <div class="tn-field-full" style="grid-column:1/-1;border-top:1px solid var(--cc-rule);margin-top:6px;padding-top:8px;">
      <div class="tn-fg">
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <input data-f="mietbeginn" type="text" value="${_tnFmtDate(rec ? rec.mietbeginn : '')}" placeholder="TT.MM.JJJJ"/></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <input data-f="mietende" type="text" value="${_tnFmtDate(rec ? rec.mietende : '')}" placeholder="TT.MM.JJJJ"/></div>
      </div>
    </div>
  </div>`;

  const tid = rec ? rec.id : '';

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
    ${rec ? `<button type="button" class="cc-foot-btn tn-del-btn" onclick="_tnDeleteTenant('${tid}')"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>` : ''}
    <div class="cc-slot">
    ${rec ? `<button class="tn-btn tn-btn-sm" onclick="_tnToggleProfile('${rid}','${tid}','${esc(room.name)}')">Cancel</button>` : ''}
    <button class="tn-btn tn-btn-primary cc-save${rec ? '' : ' cc-save--create'}"
      onclick="${rec ? `_tnSaveProfile('${rid}','${tid}','${esc(room.name)}')` : `_tnSaveNewTenant('${rid}','${esc(room.name)}')`}">
      Save</button>
    </div>
  </div>`;

  return `
<div class="tn-sec" id="psec-${rid}">
  <div class="tn-sec-body" style="padding-top:10px">
    <div style="margin-bottom:8px"><span class="tn-sec-lbl">Tenant</span></div>
    ${!rec ? _tnEmptyRoomPwHTML(room.name) : ''}
    ${readView}
    ${rec && typeof ccRoomPwLineHTML === 'function' ? ccRoomPwLineHTML(room.name) : ''}
    ${editView}
    ${rec && _tnNeedsPw(rec) ? `<div class="tn-pw-need"><i class="ti ti-key"></i>
      <span>Tenant-app password not given yet · moved in ${_tnFmtDate(rec.mietbeginn)}</span>
      <button class="tn-btn tn-btn-sm" onclick="_tnGivePw('${esc(room.name)}','${esc([rec.first_name, rec.last_name].filter(Boolean).join(' '))}')">Give password</button></div>` : ''}
  </div>
  ${footerRead}
  ${footerEdit}
</div>`;
}

/* ── DOCUMENTS SECTION ── */

/* ── KAUTION SECTION (shared card + modal) ── */
/* Kaution section — shared card (cc-kaution-card.js): one layout, five phases */
function _tnKautionHTML(rid, tid, ctx) {
  return ccKautionSectionHTML('tn', tid, ctx, tid ? _tnRecords.find(r => r.id === tid) : null);
}
ccKautionRegister('tn', {
  // Kaution Soll lives only here (Kaution section) — fixed per tenancy
  saveSoll: async (tid, v) => {
    const rec = _tnRecords.find(r => r.id === tid); if (!rec || !sbL) return false;
    const before = rec.kaution_soll; rec.kaution_soll = v;
    const { error } = await sbL.from('tenant_records').update({ kaution_soll: v }).eq('id', tid);
    if (error) { rec.kaution_soll = before; alert('Could not save — ' + error.message); return false; }
    return true;
  },
  table: 'kaution', writeKey: 'tnk-', failLabel: 'kaution',
  map:  () => _tnKaution,
  rec:  tid => _tnRecords.find(r => r.id === tid) || null,
  soll: rec => _tnKautionSollInfo(rec),
  fmt:  n => _tnFmtEUR(n),
  fmtDate: d => _tnFmtDate(d),
  saveAmounts: (tid, received, returned) => _tnSaveKaution(tid, received, returned),
  afterChange: tid => {
    _tnRefreshFormerBadges(tid);
    const r = _tnRecords.find(x => x.id === tid);
    if (r) _tnRefreshCardPills(r.room);
  },
});


/* ── NK SECTION (shared card + modal) ── */
function _tnNKHTML(rid, tid, ctx) {
  if (!tid) {
    const sec = ctx === 'modal' ? 'tn-msec' : 'tn-sec';
    return `<div class="${sec}" style="opacity:.45;pointer-events:none">
      <div class="tn-sec-body" style="padding-top:10px;padding-bottom:11px">
        <div style="margin-bottom:8px"><span class="tn-sec-lbl">NK-Abrechnungen</span></div>
        <p class="tn-empty">Save profile first.</p>
      </div></div>`;
  }

  // 3f · NK-Abrechnungen are made in Settlements — here read-only
  if (typeof ccNksSectionHTML === 'function') return ccNksSectionHTML(tid, ctx, _tnNK[tid] || [], _tnNkDue(_tnRecords.find(r => r.id === tid)));
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
      <span class="tn-sec-lbl" style="flex:1">NK-Abrechnungen</span>
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

/* ── NK VORAUSZAHLUNG SECTION (card + modal) ── */
function _tnNKVorausHTML(rid, room, ctx) {
  const who = _tnNKVorausWho(room);
  const mb  = who && who.mietbeginn ? _ccIso(who.mietbeginn) : '';
  const entries = (_tnNKVoraus[room] || []).filter(x => !who || (x.tenant_id ? String(x.tenant_id) === String(who.id) : (!mb || String(x.effective_date).slice(0, 10) >= mb)));
  return ccNkvSheetHTML({ sec: ctx === 'modal' ? 'tn-msec' : 'tn-sec', rid, entries, cur: _tnNKVorausCurFor(room), fmtEUR: _tnFmtEUR,
    onAdd: `_tnNKVorausAdd('${esc(room)}','${rid}','${ctx}')`,
    onNotified: `_tnNKVorausMarkNotified('$ID','${esc(room)}','${rid}')`,
    onAdjusted: `_tnNKVorausMarkAdjusted('$ID','${esc(room)}','${rid}')`,
    onSkip: `_tnNkvSkip('$ID','${esc(room)}')`,
    onHistory: `_tnNKVorausOpenModal('${esc(room)}')` });
}
async function _tnNkvSkip(id, room) {
  const e = (_tnNKVoraus[room] || []).find(x => String(x.id) === String(id)); if (!e) return;
  const on = !e.ignored;
  const { error } = await sbL.from('nk_vorauszahlung_history').update({ ignored: on }).eq('id', id);
  if (error) { ccSaveFailed(error, 'NK-Vorauszahlung (SQL run?)'); return; }
  e.ignored = on;
  if (typeof ccSavedToast === 'function') ccSavedToast(on ? 'Change skipped' : 'Change applied again');
  _tnRender(); if (typeof ccSheetRefresh === 'function') ccSheetRefresh();
}

function _tnNKVorausOpenModal(room) {
  const entries = (_tnNKVoraus[room] || []).slice(); // already DESC
  const today = new Date(); today.setHours(0,0,0,0);
  const fmtDate = (d) => {
    if (!d) return '';
    const [y,m,day] = d.split('-');
    return `${day}.${m}.${y}`;
  };
  const isFuture = (e) => new Date(e.effective_date) > today;

  const pillHTML = (e) => {
    const notPill = e.tenant_notified
      ? `<span class="tn-nkv-pill done"><i class="ti ti-mail" aria-hidden="true"></i> Informed</span>`
      : `<button class="tn-nkv-pill pending" onclick="_tnNKVorausMarkNotified('${e.id}','${room}','m')" title="Mark as informed">
           <i class="ti ti-mail" aria-hidden="true"></i> Informed?
         </button>`;
    const adjPill = e.tenant_adjusted
      ? `<span class="tn-nkv-pill done"><i class="ti ti-refresh" aria-hidden="true"></i> Adjusted</span>`
      : (e.tenant_notified
          ? `<button class="tn-nkv-pill pending" onclick="_tnNKVorausMarkAdjusted('${e.id}','${room}','m')" title="Mark as adjusted">
               <i class="ti ti-refresh" aria-hidden="true"></i> Adjusted?
             </button>`
          : `<span class="tn-nkv-pill pending" style="cursor:default;opacity:.4"><i class="ti ti-refresh" aria-hidden="true"></i> Adjusted?</span>`);
    return notPill + adjPill;
  };

  const rows = entries.map(e => `
    <div class="tn-nkv-row" id="nkv-row-${e.id}" style="padding-left:16px;padding-right:16px">
      <div class="tn-nkv-top">
        ${isFuture(e)
          ? `<i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0" aria-hidden="true"></i>`
          : `<i class="ti ti-check" style="font-size:13px;color:#3B6D11;flex-shrink:0" aria-hidden="true"></i>`}
        <span class="tn-nkv-date">${isFuture(e) ? 'ab ' : ''}${fmtDate(e.effective_date)}</span>
        <span class="tn-nkv-amount ${e.tenant_adjusted && !isFuture(e) ? 'past' : ''}">${_tnFmtEUR(e.amount)}</span>
      </div>
      <div class="tn-nkv-pills">${pillHTML(e)}</div>
    </div>`).join('');

  document.getElementById('tnNKVorausModalSub').textContent = room.charAt(0).toUpperCase() + room.slice(1);
  document.getElementById('tnNKVorausModalBody').innerHTML = rows || `<p class="tn-empty" style="padding:12px 16px">Noch keine Einträge.</p>`;
  document.getElementById('tnNKVorausModal').classList.add('open');
}

function _tnNKVorausModalClose() {
  document.getElementById('tnNKVorausModal').classList.remove('open');
}
function _tnNKVorausModalOutside(e) {
  if (e.target === document.getElementById('tnNKVorausModal')) _tnNKVorausModalClose();
}

/* ── NK VORAUSZAHLUNG ADD ── */
function _tnNKVorausAdd(room, rid, ctx) {
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
      <button type="button" class="cc-add-btn is-primary" onclick="_tnNKVorausConfirmAdd('${room}','${rid}')">Save</button>
    </div>`;
  body.insertBefore(form, body.querySelector('.cc-sec-foot') || null);
  form.querySelector('input[type=date]').focus();
}

async function _tnNKVorausConfirmAdd__run(room, rid) {
  const dateInp   = document.getElementById(`nkv-add-date-${rid}`);
  const amountInp = document.getElementById(`nkv-add-amount-${rid}`);
  const date   = dateInp?.value?.trim();
  const amount = parseFloat(amountInp?.value);
  if (!date || isNaN(amount) || amount <= 0) {
    dateInp?.focus();
    return;
  }
  if (!sbL) return;
  const actT = (_tnRecords || []).filter(r => r.room === room && r.status === 'active')
    .sort((a, b) => String(b.mietbeginn || '').localeCompare(String(a.mietbeginn || '')))[0];
  const nkRow = { room, effective_date: date, amount, tenant_notified: false, tenant_adjusted: false };
  const { data, error } = typeof ccRpInsertWithTenant === 'function'
    ? await ccRpInsertWithTenant(sbL, 'nk_vorauszahlung_history', nkRow, actT ? actT.id : null)
    : await sbL.from('nk_vorauszahlung_history').insert(nkRow).select().single();
  if (error) { ccSaveFailed(error, 'NK Vorauszahlung'); return; }
  if (!_tnNKVoraus[room]) _tnNKVoraus[room] = [];
  _tnNKVoraus[room].unshift(data);
  _tnNKVoraus[room].sort((a,b) => b.effective_date.localeCompare(a.effective_date));
  _tnRender();
}

/* ── NK VORAUSZAHLUNG MARK NOTIFIED ── */
async function _tnNKVorausMarkNotified(id, room, rid) {
  if (!sbL) return;
  const today = ccTodayISO();
  const { error } = await sbL.from('nk_vorauszahlung_history')
    .update({ tenant_notified: true, notified_date: today })
    .eq('id', id);
  if (error) { ccSaveFailed(error, 'NK Vorauszahlung'); return; }
  const entry = (_tnNKVoraus[room] || []).find(e => e.id === id);
  if (entry) { entry.tenant_notified = true; entry.notified_date = today; }
  _tnRenderNKVorausRow(id, room, rid);
}

/* ── NK VORAUSZAHLUNG MARK ADJUSTED ── */
async function _tnNKVorausMarkAdjusted(id, room, rid) {
  if (!sbL) return;
  const today = ccTodayISO();
  const { error } = await sbL.from('nk_vorauszahlung_history')
    .update({ tenant_adjusted: true, adjusted_date: today })
    .eq('id', id);
  if (error) { ccSaveFailed(error, 'NK Vorauszahlung'); return; }
  const entry = (_tnNKVoraus[room] || []).find(e => e.id === id);
  if (entry) { entry.tenant_adjusted = true; entry.adjusted_date = today; }
  // full re-render: header pill may disappear, row moves to history
  _tnRender();
}

/* ── NK VORAUSZAHLUNG LIGHTWEIGHT ROW REFRESH ── */
function _tnRenderNKVorausRow(id, room, rid) {
  // refresh just the pill state within an existing row — avoids full re-render
  const row = document.getElementById('nkv-row-' + id);
  if (!row) { _tnRender(); return; }
  const entry = (_tnNKVoraus[room] || []).find(e => e.id === id);
  if (!entry) { _tnRender(); return; }
  const today = new Date(); today.setHours(0,0,0,0);
  const isFuture = new Date(entry.effective_date) > today;
  const notPill = entry.tenant_notified
    ? `<span class="tn-nkv-pill done"><i class="ti ti-mail" aria-hidden="true"></i> Informed</span>`
    : `<button class="tn-nkv-pill pending" onclick="_tnNKVorausMarkNotified('${id}','${room}','${rid}')">
         <i class="ti ti-mail" aria-hidden="true"></i> Informed?
       </button>`;
  const adjPill = entry.tenant_adjusted
    ? `<span class="tn-nkv-pill done"><i class="ti ti-refresh" aria-hidden="true"></i> Adjusted</span>`
    : (entry.tenant_notified
        ? `<button class="tn-nkv-pill pending" onclick="_tnNKVorausMarkAdjusted('${id}','${room}','${rid}')">
             <i class="ti ti-refresh" aria-hidden="true"></i> Adjusted?
           </button>`
        : `<span class="tn-nkv-pill pending" style="cursor:default;opacity:.4"><i class="ti ti-refresh" aria-hidden="true"></i> Adjusted?</span>`);
  const pillsEl = row.querySelector('.tn-nkv-pills');
  if (pillsEl) pillsEl.innerHTML = notPill + adjPill;
}

/* ── FORMER SECTION ── */
function _tnFormerSectionHTML(rid, roomName, formerRecs, archivedRecs) {
  const visible  = formerRecs.filter(r => _tnFormerVisible(r));
  const hidden   = formerRecs.filter(r => !_tnFormerVisible(r) && !r.done);
  const arcList  = archivedRecs;
  const showOld  = !!_tnShowOlder[rid];
  const toShow   = showOld ? [...visible, ...hidden] : visible;

  const formerRow = rec => {
    const name    = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '\u2014';
    const period  = [_tnFmtDate(rec.mietbeginn), _tnFmtDate(rec.mietende)].filter(Boolean).join(' \u2013 ');
    const k       = _tnKaution[rec.id];
    const settled = k?.settled || false;
    const kept    = _tnKautionKept(rec.id);
    const hasK    = k && k.received > 0;
    const canHide = settled; // only offer Hide when kaution settled
    const recv2   = k ? Number(k.received) : 0;
    const ret2    = k ? Number(k.returned) : 0;
    const sdate   = k?.settled_at ? _tnFmtDate(k.settled_at) : '';
    const kPill   = ccTnFormerKautionPill(k, _tnFmtEUR, _tnFmtDate);   // shared: remaining amount, not received
    return `<div class="tn-former-row" style="gap:6px">
      <div class="tn-former-info" onclick="_tnOpenModal('${rec.id}')" style="cursor:pointer;flex:1">
        <div class="tn-former-name">${esc(name)}</div>
        <div class="tn-former-period">${esc(period)}</div>
      </div>
      <div class="tn-former-pills">${_tnNkHasOpen(rec.id) ? `<span class="tnp tnp-amber">${esc(_tnNkOpenLabel(rec))}</span>` : ''}${kPill}</div>
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
  const ctLabel = _tnContractLabel(tnContractType(rec));
  const allDone = _tnIsAllDone(tid);

  document.getElementById('tnModalName').textContent = name;
  document.getElementById('tnModalSub').innerHTML =
    esc(period) +
    (ctLabel ? ` <span class="tnp tnp-gray">${esc(ctLabel)}</span>` : '') +
    (allDone  ? ` <span class="tnp tnp-green">All done</span>` : ` <span class="tnp tnp-amber">Open items</span>`);

  document.getElementById('tnModalBody').innerHTML = _tnModalBodyHTML(rec);
  document.getElementById('tnModalFooter').innerHTML = _tnModalFooterHTML(rec, allDone);

  document.getElementById('tnModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _tnModalBodyHTML(rec) {
  const tid  = rec.id || '_draft';
  const full = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const ct   = tnContractType(rec);                 // the tenancy's own type
  const ctK  = _tnBaseContractType(rec) || ct;       // first contract: Kaution rule + Documents
  const dMode = _tnModeAt(rec, [_ccIso(rec.mietende) || ccRpToday(), ccRpToday()].sort()[0]);
  const dPau = dMode === 'pauschal';
  const dK   = rec.kaltmiete   != null ? Number(rec.kaltmiete) + (dPau && rec.nebenkosten != null ? Number(rec.nebenkosten) : 0) : null;
  const dNK  = rec.nebenkosten != null ? Number(rec.nebenkosten) : null;
  const dKS  = rec.kaution_soll != null ? Number(rec.kaution_soll) : null;
  const warm = (dK != null && dNK != null) ? dK + dNK : dK;
  const mhInfo = rec.id && rec.status !== 'active' ? _tnMhInfoHTML(rec) : '';

  return `${mhInfo}
  <!-- PROFILE -->
  <div class="tn-msec" id="mprof-sec-${tid}">
    <div class="tn-msec-body" style="padding-top:10px">
      <div style="margin-bottom:8px"><span class="tn-msec-lbl">Tenant</span></div>

      <!-- READ -->
      <div class="tn-fg" id="mprof-read-${tid}">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <span class="tn-fval">${esc(full) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <span class="tn-fval">${esc(rec.birthday||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <span class="tn-fval">${esc(rec.email||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <span class="tn-fval">${esc(rec.phone||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
          <span class="tn-fval">${esc(rec.address||'') || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Contract end</span>
          <span class="tn-fval">${_tnFmtDate(rec.vertragsende) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <span class="tn-fval">${_tnFmtDate(rec.mietbeginn) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <span class="tn-fval">${_tnFmtDate(rec.mietende) || '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Kaltmiete</span>
          <span class="tn-fval">${dK != null ? _tnFmtEUR(dK) : '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Nebenkosten</span>
          <span class="tn-fval">${dNK != null ? _tnFmtEUR(dNK) : '<span class="muted">—</span>'}</span></div>
        <div class="tn-field"><span class="tn-flbl">Kaution soll</span>
          <span class="tn-fval">${(() => {
            const live = _tnKautionSoll(rec.room, rec.mietbeginn, rec.mietende, ctK);
            if (dKS != null) return _tnFmtEUR(dKS) + ' <span style="font-size:10px;color:var(--cc-stone)">(fixed)</span>';
            if (live != null) return _tnFmtEUR(live) + ' <span style="font-size:10px;color:var(--cc-stone)">(auto)</span>';
            return '<span class="muted">—</span>';
          })()}</span></div>
        <div class="tn-field"><span class="tn-flbl">Contract</span>
          <span class="tn-fval">${ct ? _tnContractLabel(ct) : '<span class="muted">—</span>'}</span></div>
      </div>

      <!-- EDIT -->
      <div class="tn-fg" id="mprof-edit-${tid}" style="display:none">
        <div class="tn-field"><span class="tn-flbl">Name</span>
          <input data-mf="name" type="text" value="${esc(full)}" placeholder="Full name"/></div>
        <div class="tn-field"><span class="tn-flbl">Birthday</span>
          <input data-mf="birthday" type="text" value="${esc(rec.birthday||'')}" placeholder="TT.MM.JJJJ"/></div>
        <div class="tn-field"><span class="tn-flbl">Email</span>
          <input data-mf="email" type="email" value="${esc(rec.email||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Phone</span>
          <input data-mf="phone" type="tel" value="${esc(rec.phone||'')}"/></div>
        <div class="tn-field tn-field-full"><span class="tn-flbl">Address</span>
          <input data-mf="address" type="text" value="${esc(rec.address||'')}"/></div>
        <div class="tn-field"><span class="tn-flbl">Contract end</span>
          <input data-mf="vertragsende" type="text" value="${_tnFmtDate(rec.vertragsende)}" placeholder="TT.MM.JJJJ"/></div>
        <div class="tn-field"><span class="tn-flbl">Move-in</span>
          <input data-mf="mietbeginn" type="text" value="${_tnFmtDate(rec.mietbeginn)}"/></div>
        <div class="tn-field"><span class="tn-flbl">Move-out</span>
          <input data-mf="mietende" type="text" value="${_tnFmtDate(rec.mietende)}" placeholder="TT.MM.JJJJ"/></div>
        <div class="tn-field tn-field-full"><span class="tn-flbl">Rent</span>
          ${_tnModeSegHTML('data-mf', dMode)}</div>
        <div class="tn-field"><span class="tn-flbl" data-kaltlbl>${dPau ? 'Pauschalmiete' : 'Kaltmiete'}</span>
          <input data-mf="kaltmiete" type="number" data-cc-num="2" value="${dK ?? ''}"/></div>
        <div class="tn-field" data-nkwrap${dPau ? ' style="display:none"' : ''}><span class="tn-flbl">Nebenkosten</span>
          <input data-mf="nebenkosten" type="number" data-cc-num="2" value="${dPau ? '' : (dNK ?? '')}"/></div>
        <div class="tn-field" style="flex-direction:column;align-items:stretch;gap:4px">
          <span class="tn-flbl">Kaution Soll</span>
          <input id="mkaut-inp-${tid}" data-mf="kaution_soll" type="number" data-cc-num="2"
            value="${dKS ?? _tnKautionSoll(rec.room, rec.mietbeginn, rec.mietende, ctK) ?? ''}" placeholder="${_tnKautionSoll(rec.room, rec.mietbeginn, rec.mietende, ctK) ?? ''}"/>
          <span class="cck-soll-hint">Fest seit Einzug · ändert sich nicht mit der Miete</span>
        </div>
        <div class="tn-field tn-field-full">
          <span class="tn-flbl">Contract</span>
          ${_tnCtSegHTML('data-mf', ct || _tnRoomContractType(rec.room) || 'mietvertrag')}
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
      <button class="tn-btn tn-btn-primary cc-save" onclick="_tnModalSaveProfile('${tid}')">
        Save</button>
    </div>
  </div>

  <!-- ZÄHLERSTÄNDE + DOCUMENTS (Unsigned | Signed) — same sections as the card -->
  ${typeof ccfDocsSectionHTML === 'function' ? ccfMetersSectionHTML(rec, 'modal') + ccfDocsSectionHTML(rec, 'modal') : ''}

  <!-- KAUTION -->
  ${_tnKautionHTML('m', tid, 'modal')}

  <!-- NK -->
  ${_tnAllPauschal(rec) ? '' : _tnNKHTML('m', tid, 'modal')}

  <!-- NK VORAUSZAHLUNG (the room's current tenant only — never in a former tenant's pop-up) -->
  ${rec.status === 'active' && _tnIsKaltNK(rec, rec.room) ? _tnNKVorausHTML('m', rec.room, 'modal') : ''}
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

/* Snapshot of the edit fields → closing with changes asks instead of silently dropping them */
function _ccModalSnap(edit) { return JSON.stringify([...edit.querySelectorAll('input,select,textarea')].map(i => i.type === 'checkbox' ? i.checked : i.value)); }
function _tnToggleModalProfile(tid) {
  const read  = document.getElementById('mprof-read-' + tid);
  const edit  = document.getElementById('mprof-edit-' + tid);
  const fread = document.getElementById('mprof-foot-read-' + tid);
  const fedit = document.getElementById('mprof-foot-edit-' + tid);
  if (!read || !edit) return;
  const isEditing = read.style.display === 'none';
  if (!isEditing) edit.dataset.snap = _ccModalSnap(edit);
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
  // Unsaved changes in the edit view → ask (instead of silently dropping them)
  if (_tnModalTid) {
    const ed = document.getElementById('mprof-edit-' + _tnModalTid);
    if (ed && ed.style.display !== 'none' && ed.dataset.snap && ed.dataset.snap !== _ccModalSnap(ed)) {
      const tid = _tnModalTid;
      if (confirm('Änderungen speichern?')) {
        ed.dataset.snap = '';                           // answered once — the save may close the view itself
        Promise.resolve(_tnModalSaveProfile(tid)).then(() => { if (_tnModalTid === tid) _tnCloseModal(); });
        return;
      }
    }
  }
  // If profile is in edit mode, cancel it first (x = cancel, not save)
  if (_tnModalTid) {
    const read  = document.getElementById('mprof-read-'      + _tnModalTid);
    const edit  = document.getElementById('mprof-edit-'      + _tnModalTid);
    const fread = document.getElementById('mprof-foot-read-' + _tnModalTid);
    const fedit = document.getElementById('mprof-foot-edit-' + _tnModalTid);
    if (edit && edit.style.display !== 'none') {
      // Restore read mode
      if (read)  read.style.display  = '';
      if (edit)  edit.style.display  = 'none';
      if (fread) fread.style.display = '';
      if (fedit) fedit.style.display = 'none';
    }
  }
  const modal = document.getElementById('tnModal');
  modal._draft = null;
  modal.classList.remove('open');
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
    _tnOpenCards.add(id);
    requestAnimationFrame(() => {
      const top  = card.getBoundingClientRect().top + window.scrollY;
      const navH = document.querySelector('.cc-header')?.offsetHeight || 100;
      window.scrollTo({ top: top - navH - 8, behavior:'smooth' });
    });
  } else {
    _tnOpenCards.delete(id);
  }
}

function _tnToggleRentEdit(rid) {
  const bar  = document.getElementById('rbar-'  + rid);
  const form = document.getElementById('rform-' + rid);
  if (!bar || !form) return;
  const show = form.style.display === 'none' || !form.style.display;
  if (show) {   // always open with the saved values (a Cancel never leaves half-typed fields behind)
    const card = form.closest('.tn-card'), roomName = card && card.dataset.room;
    const room = roomName && typeof appRooms !== 'undefined' ? appRooms.find(r => r.name === roomName) : null;
    const pick = roomName ? _ccPickTenancy(_tnRecords.filter(r => r.room === roomName && r.status === 'active')) : null;
    const rec = pick ? (pick.current || pick.next) : null;
    if (room && rec) {
      const tmp = document.createElement('div'); tmp.innerHTML = _tnRentFormHTML(rid, room, rec).trim();
      const fresh = tmp.firstElementChild;
      if (fresh) { form.replaceWith(fresh); fresh.style.display = 'grid'; bar.style.display = 'none'; return; }
    }
  }
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
  const read    = document.getElementById('pread-'     + rid);
  const edit    = document.getElementById('pedit-'     + rid);
  const fread   = document.getElementById('pfoot-read-'+ rid);
  const fedit   = document.getElementById('pfoot-edit-'+ rid);
  if (!read || !edit) return;
  const editing = read.style.display === 'none';
  read.style.display  = editing ? '' : 'none';
  edit.style.display  = editing ? 'none' : '';
  if (fread) fread.style.display = editing ? '' : 'none';
  if (fedit) fedit.style.display = editing ? 'none' : '';
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
    vertragsende: container.querySelector(`[${selector}="vertragsende"]`) ? _tnParseDate(get('vertragsende')) : undefined,
    contract_type: container.querySelector(`[${selector}="contract_type"]`) ? (get('contract_type') || null) : undefined,
    kaltmiete:     parseFloat(container.querySelector(`[${selector}="kaltmiete"]`)?.value)    || null,
    nebenkosten:   parseFloat(container.querySelector(`[${selector}="nebenkosten"]`)?.value)  || null,
    kaution_soll:  (() => {
      const inp = container.querySelector(`[${selector}="kaution_soll"]`);
      if (!inp) return null;
      // Only save when override is explicitly enabled (input is enabled)
      if (inp.disabled) return null;
      return parseFloat(inp.value) || null;
    })(),
  };
}

/* The room's price is always the starting rent of a new tenant — also for
   tenants entered for the past. You can change it by hand. */
function _tnNewIsCurrent(mietbeginn) {
  return true;
  if (typeof ccRpIso !== 'function') return true;
  const iso = ccRpIso(mietbeginn);
  return !iso || iso >= ccRpAddDays(ccRpToday(), -31);
}

async function _tnSaveNewTenant(rid, roomName) {
  if (!sbL) return;
  const sec = document.getElementById('pedit-' + rid);
  if (!sec) return;
  const btn = document.getElementById('pfoot-edit-' + rid)?.querySelector('.tn-btn-primary');
  if (btn) { btn.textContent = '\u2026'; btn.disabled = true; }

  const p = _tnCollectProfile(sec, 'data-f');
  { const nc = document.getElementById('newc-' + rid);            // Contract, Contract end, rent and Kaution sit in the beige block
    if (nc) {
      const q = _tnCollectProfile(nc, 'data-f');
      const raw = f => (nc.querySelector(`[data-f="${f}"]`)?.value || '').trim();
      const num = f => { const v = parseFloat(raw(f).replace(',', '.')); return isNaN(v) ? null : v; };
      if (q.contract_type !== undefined) p.contract_type = q.contract_type;
      if (q.vertragsende !== undefined) p.vertragsende = q.vertragsende;
      p._mode = nc.querySelector('[data-f="rent_mode"]')?.value === 'pauschal' ? 'pauschal' : 'kalt_nk';
      p.kaltmiete = num('kaltmiete');
      p.nebenkosten = p._mode === 'pauschal' ? null : num('nebenkosten');
      p._typedRent = p.kaltmiete != null;
      if (num('kaution_soll') != null) p.kaution_soll = num('kaution_soll');
      // the rent is required — otherwise the chosen Rent mode would get lost
      const missing = p.kaltmiete == null ? 'kaltmiete' : (p._mode !== 'pauschal' && p.nebenkosten == null ? 'nebenkosten' : null);
      if (missing) {
        const f = nc.querySelector(`[data-f="${missing}"]`);
        if (f) { f.style.borderColor = '#C4705A'; f.focus(); }
        ccToast('Please enter the rent in "New contract"', true);
        if (btn) { btn.innerHTML = 'Save'; btn.disabled = false; }
        return;
      }
    } }
  if (!p.first_name && !p.last_name && !p.email) {
    const inp = sec.querySelector('[data-f="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }
  if (!_ccTenancyOk(sec, 'data-f', p, _tnRecords.filter(r => r.room === roomName), null, btn, r => [r.first_name, r.last_name].filter(Boolean).join(' '))) return;

  const mietende  = p.mietende;
  // Only transition to former if mietende is actually reached (today or past)
  // A future move-out date keeps the tenant active
  const status    = (mietende && _tnIsPast(mietende)) ? 'former' : 'active';
  const ctype     = p.contract_type || _tnRoomContractType(roomName);   // chosen in the form (pre-selected from the room's offer)
  const liveP     = _tnRoomPricing(roomName, ctype);

  const payload = {
    room: roomName, status, contract_type: ctype || null,   // belongs to this tenancy from now on
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende,
    // Rent belongs to the tenancy: fixed at move-in (room price now), changes via NK or by hand
    // Room price only for a current move-in (≤ 31 days ago or later); a tenant
    // entered for the past stays without rent until you type it (B3)
    kaltmiete:    p.kaltmiete   ?? (_tnNewIsCurrent(p.mietbeginn) ? liveP.kaltmiete   : null) ?? null,
    nebenkosten:  p.nebenkosten ?? (_tnNewIsCurrent(p.mietbeginn) ? liveP.nebenkosten : null) ?? null,
    kaution_soll: p.kaution_soll ?? _tnKautionSoll(roomName, p.mietbeginn, mietende, ctype) ?? null,
  };
  if (p.vertragsende !== undefined) payload.vertragsende = ctype === 'mietvertrag' ? null : (p.vertragsende || null);
  if (p._typedRent && p._mode === 'pauschal') payload.nebenkosten = null;

  const { data, error } = await sbL.from('tenant_records').insert(payload).select().single();
  if (error) {
    ccSaveFailed(error, 'new tenant');
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }
  // Rent typed in "New contract" = the Erstvertrag's rent and mode (never the room's offer later)
  if (p._typedRent && data.mietbeginn && typeof ccRpSetRent === 'function') {
    try {
      await ccRpSetRent(sbL, { app: 'casa', rec: data, validFrom: _ccIso(data.mietbeginn), mode: p._mode,
        kalt: Number(data.kaltmiete) || 0, nk: p._mode === 'pauschal' ? null : (Number(data.nebenkosten) || 0),
        pauschale: Number(data.kaltmiete) || 0, contract_type: ctype || undefined,
        kind: 'migrated', source: 'tenant_form', legacyMode: p._mode });
    } catch (e) { ccSaveFailed(e, 'rent history'); }
  }

  await _tnEnsureKaution(data.id);
  if (status === 'active') await ccSetNewRoomPassword(roomName, 'Login password');
  await _tnLoad();
}

// Manual "move to former": two-tap confirm on the button, then force status→former
// (keeps whatever move-out date is entered — even a future one — so the room frees up now)
function _tnMoveToFormerConfirm(btn, rid, tid, roomName) {
  if (btn.dataset.armed === '1') {
    _tnSaveProfile(rid, tid, roomName, true);
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

/* Record move-out: the last day the tenant pays → then former + vacant (automatic) */
function _tnMoveOutOpen(rid, tid) {
  const rec = _tnRecords.find(r => r.id === tid); if (!rec) return;
  _ccPanelOpen('psec-' + rid, 'Record move-out', `
    <div class="tn-fg"><div class="tn-field"><span class="tn-flbl">Move-out (last day)</span>
      <input data-cc="date" type="text" placeholder="TT.MM.JJJJ" value="${_tnFmtDate(rec.vertragsende || '')}"/></div></div>
    <p class="cc-inline-hint">After this date the tenant becomes a former tenant and the room is vacant — automatically.
    Then: Übergabe Auszug (Documents) · settle the Kaution · NK-Abrechnung in Settlements.</p>`, async p => {
    const iso = _tnParseDate(p.querySelector('[data-cc="date"]').value || '');
    if (!iso) { p.querySelector('[data-cc="date"]').style.borderBottomColor = '#C4705A'; return false; }
    const upd = { mietende: iso };
    if (_tnIsPast(iso)) upd.status = 'former';
    const { error } = await sbL.from('tenant_records').update(upd).eq('id', tid);
    if (error) { alert('Could not save — ' + error.message); return false; }
    Object.assign(rec, upd); _tnRender(); return true;
  });
}
/* Renew (Casa 1-year contracts): same tenant, same Kaution — new contract end, optional new rent */
/* The renewals of a tenancy, oldest first: "1. Verlängerung ab 01.10.2026" (+ type if it switches) */
function _tnRenewalRows(rec) {
  if (!rec || !rec.id || typeof ccRpFor !== 'function') return [];
  const list = ccRpFor('casa', rec.id).filter(p => p.kind === 'renewal');
  return list.map((p, i) => {
    const before = tnContractType(rec, ccRpAddDays(_ccIso(p.valid_from), -1));
    const label = (i + 1) + '. Verlängerung ab ' + _ccFmtD(p.valid_from)
      + ((p.contract_type && before && p.contract_type !== before) ? ' \u00b7 ' + _tnContractLabel(p.contract_type) : '');
    return { p, n: i + 1, key: 'verlaengerung_' + _ccIso(p.valid_from), label, last: i === list.length - 1 };
  });
}

/* Remove a renewal saved by mistake (only the latest, only while no signed contract is uploaded):
   the rent-history entry goes, Contract end goes back to the day before it started. */
async function _tnRenewDelete(tid, pid) {
  const rec = _tnRecords.find(r => r.id === tid);
  const per = typeof ccRpFor === 'function' ? ccRpFor('casa', tid).find(p => String(p.id) === String(pid)) : null;
  if (!rec || !per || !sbL) return;
  const prevEnd = ccRpAddDays(_ccIso(per.valid_from), -1);
  const n = _tnRenewalRows(rec).find(x => String(x.p.id) === String(pid))?.n || '';
  if (!(await ccConfirm(`Remove the ${n}. Verlängerung?`, `Starts ${_ccFmtD(per.valid_from)}. The contract end goes back to ${_ccFmtD(prevEnd)}.`, 'Remove', true))) return;
  try { await ccRpDelete(sbL, per.id); } catch (e) { ccSaveFailed(e, 'remove renewal'); return; }
  const before = rec.vertragsende;
  rec.vertragsende = prevEnd;
  _tnRender();
  ccQueueWrite('tn-' + tid, () => sbL.from('tenant_records').update({ vertragsende: prevEnd }).eq('id', tid))
    .then(({ error }) => { if (error) { rec.vertragsende = before; _tnRender(); ccSaveFailed(error, 'contract end'); } });
}



async function _tnSaveProfile(rid, tid, roomName, forceFormer) {
  if (!sbL) return;
  const sec = document.getElementById('pedit-' + rid);
  if (!sec) return;
  const p   = _tnCollectProfile(sec, 'data-f');
  const rec = _tnRecords.find(r => r.id === tid);
  if (!p.first_name && !p.last_name && !p.email) {
    // Name and email cleared → the tenant should go: ask, never delete silently
    if (rec) { await _tnDeleteTenant(tid); return; }
    const inp = sec.querySelector('[data-f="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    return;
  }
  if (!_ccTenancyOk(sec, 'data-f', p, _tnRecords.filter(r => r.room === roomName), tid, null, r => [r.first_name, r.last_name].filter(Boolean).join(' '))) return;

  // Fix 7: "To former" needs a move-out date (default today, editable) — a former tenant
  // without Auszug would otherwise keep a Soll until the next tenant moves in
  if (forceFormer && !p.mietende) {
    const today = new Date(), dflt = String(today.getDate()).padStart(2, '0') + '.' + String(today.getMonth() + 1).padStart(2, '0') + '.' + today.getFullYear();
    const v = prompt('Auszugsdatum (TT.MM.JJJJ):', dflt);
    if (v === null) return;
    const iso = _tnParseDate(String(v).trim());
    if (!iso) { if (typeof ccToast === 'function') ccToast('Bitte ein Datum im Format TT.MM.JJJJ eingeben', true); return; }
    p.mietende = iso;
    const inp = sec.querySelector('[data-f="mietende"]'); if (inp) inp.value = v.trim();
  }

  // Manual "To former" (forceFormer) demotes even when mietende is today/future,
  // so the room frees up now; auto-demote on a past move-out date still applies.
  const toFormer = !!forceFormer || !!(p.mietende && _tnIsPast(p.mietende) && rec?.status === 'active');
  // Reverse: former tenant whose mietende is cleared or set to future → back to active
  const toActive = rec?.status === 'former' && (!p.mietende || !_tnIsPast(p.mietende));
  const update   = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    address: p.address, mietbeginn: p.mietbeginn, mietende: p.mietende,
    kaution_soll:p.kaution_soll ?? rec?.kaution_soll ?? null,   // a profile save never wipes the fixed Soll
  };
  if (p.vertragsende !== undefined) update.vertragsende = p.vertragsende || null;
  // Contract type belongs to the tenancy — the room's offer never changes it
  const ctBefore  = rec ? tnContractType(rec) : null;
  const ctChanged = !!(rec && p.contract_type && p.contract_type !== ctBefore);
  if (p.contract_type) update.contract_type = p.contract_type;
  // B20: the rent is only written when this form actually has rent fields —
  // the card's profile form has none, so saving a phone number never wipes the rent.
  if (sec.querySelector('[data-f="kaltmiete"]'))   update.kaltmiete   = p.kaltmiete   ?? null;
  if (sec.querySelector('[data-f="nebenkosten"]')) update.nebenkosten = p.nebenkosten ?? null;
  if (toFormer) {
    // B4: moving to former changes status (and keeps the Auszug) — the rent is never filled in
    update.status = 'former';
    if (!rec?.contract_type && !update.contract_type) update.contract_type = _tnRoomContractType(roomName);
  }
  if (toActive) {
    update.status        = 'active';   // the contract type stays with the tenancy
    update.done          = false;
  }

  // Direct save: card first, database in the background (direct-save.js)
  const before = rec ? { ...rec } : null;
  if (rec) Object.assign(rec, update);
  if (ctChanged) _tnSyncTypePeriod(rec, p.contract_type);
  _tnSyncOccupancy();
  _tnRebuildProfileCache();
  _tnRender();

  ccQueueWrite('tn-' + tid, () => sbL.from('tenant_records').update(update).eq('id', tid))
    .then(async ({ error }) => {
      if (error) {
        if (rec && before) { Object.keys(update).forEach(k => { rec[k] = before[k]; }); }
        if (ctChanged && ctBefore) _tnSyncTypePeriod(rec, ctBefore);
        _tnRebuildProfileCache();
        _tnRender();
        ccSaveFailed(error, 'tenant profile');
        return;
      }
      await _tnEnsureKaution(tid);
      if (toFormer || toActive) await _tnLoad();   // tenant moved between active / former: quiet full refresh
    });
}

/* Occupancy from the dates — ONE rule for both apps (ccOccupancyPlan in cc-tenant-status.js).
   Runs after every load and every tenant save; writes only what really changed. */
function _tnSyncOccupancy() {
  if (!sbL || typeof ccOccupancyPlan !== 'function' || typeof appRooms === 'undefined' || !appRooms.length) return;
  const plan = ccOccupancyPlan(appRooms.filter(r => r.active).map(r => ({ key: r.name, vacant: !!r.vacant })),
                               _tnRecords, r => r.room, _ccTodayIso());
  plan.unitChanges.forEach(u => {
    const room = appRooms.find(r => r.name === u.key); if (!room) return;
    const before = !!room.vacant;
    room.vacant = u.vacant;
    ccQueueWrite('room-occ-' + room.id, () => sbL.from('rooms').update({ vacant: u.vacant }).eq('id', room.id))
      .then(res => { if (res && res.error) { room.vacant = before; ccSaveFailed(res.error, 'room occupancy'); } });
  });
  plan.toFormer.forEach(rec => {
    rec.status = 'former';
    ccQueueWrite('tn-' + rec.id, () => sbL.from('tenant_records').update({ status: 'former' }).eq('id', rec.id))
      .then(res => { if (res && res.error) { rec.status = 'active'; ccSaveFailed(res.error, 'tenant status'); } });
  });
  if (plan.toFormer.length) _tnRebuildProfileCache();
  if (plan.unitChanges.length && typeof _renderRoomsList === 'function' && document.getElementById('roomsList')) {
    try { _renderRoomsList(); } catch (e) {}
  }
}

/* Profile cache (names for the contract generators) from the records in memory */
function _tnRebuildProfileCache() {
  _tnProfileCache = {};
  _tnRecords.filter(r => r.status === 'active').forEach(r => {
    _tnProfileCache[r.room] = {
      firstName: r.first_name || '', lastName: r.last_name || '',
      email: r.email || '', phone: r.phone || '',
      birthday: r.birthday || '', address: r.address || '',
    };
  });
}

async function _tnSaveRent(rid, tid, roomName) {
  if (!sbL || !tid) return;
  const form  = document.getElementById('rform-' + rid);
  const modeSel = form?.querySelector('[data-rf="rent_mode"]')?.value;
  const mode  = (modeSel || form?.dataset.mode) === 'pauschal' ? 'pauschal' : 'kalt_nk';
  const kaltV = parseFloat(document.getElementById('rf-kalt-' + rid)?.value);
  const nkV   = parseFloat(document.getElementById('rf-nk-'   + rid)?.value);
  const kalt  = isNaN(kaltV) ? null : kaltV;
  const nk    = mode === 'pauschal' ? null : (isNaN(nkV) ? null : nkV);
  const from  = typeof ccRpIso === 'function' ? ccRpIso(document.getElementById('rf-from-' + rid)?.value) : '';
  const ksollInp = document.getElementById('rf-ksoll-' + rid);
  const ksoll = ksollInp ? (parseFloat(ksollInp.value) || null) : (_tnRecords.find(r => r.id === tid)?.kaution_soll ?? null);
  const rec = _tnRecords.find(r => r.id === tid);
  if (!rec) return;
  const before = { kaltmiete: rec.kaltmiete, nebenkosten: rec.nebenkosten, kaution_soll: rec.kaution_soll };
  const legacyMode = _tnLegacyMode(roomName, rec);
  const today = ccRpToday();
  const cst = _tnContractState(rec), cc = cst.cur;
  // A date only inside the running contract — the next contract has its own line
  if (from && cc && ((cc.start && from < cc.start) || (cc.end && from > cc.end))) {
    ccToast('Gilt ab must lie inside the ' + cc.name + ' (' + _tnContractDates(cc) + ')', true);
    return;
  }
  const ctNew  = form?.querySelector('[data-rf="contract_type"]')?.value || null;
  const endInp = document.getElementById('rf-end-' + rid);
  let endNew = endInp ? (_tnParseDate(endInp.value.trim()) || null) : undefined;
  if (endInp && endInp.value.trim() && !endNew) { ccToast('Contract end: TT.MM.JJJJ', true); return; }
  if (endInp && (ctNew || (cc && cc.type)) === 'mietvertrag') endNew = null;             // unbefristet = no end
  if (endInp && _tnIsFixed(ctNew || (cc && cc.type)) && !endNew) { ccToast('Befristet / Jahresvertrag needs a contract end', true); return; }
  // ── 2 · a rent is required (an empty field would save 0,00 €)
  if (kalt == null || (mode !== 'pauschal' && nk == null)) { ccToast('Please enter the rent', true); return; }

  // Rent history (rent_periods). Table missing → only the tenant record is saved.
  let histOk = true;
  try {
    const sameDay = from ? ccRpFor('casa', rec.id).find(p => ccRpIso(p.valid_from) === from) : null;
    if (sameDay) {
      // that day already starts an entry (Erstvertrag, Verlängerung…): correct it, keep what it is
      await ccRpUpdate(sbL, sameDay.id, mode === 'pauschal' ? { mode, pauschale: kalt, kaltmiete: null, nebenkosten: null }
                                                           : { mode, kaltmiete: kalt, nebenkosten: nk, pauschale: null });
    } else if (from) {
      await ccRpSetRent(sbL, { app: 'casa', rec, validFrom: from, mode, kalt, nk, pauschale: kalt,
                               kind: 'manual', source: 'tenant_form', legacyMode });
    } else {
      const per = ccRpAt(ccRpFor('casa', rec.id), today);
      if (per) await ccRpUpdate(sbL, per.id, mode === 'pauschal' ? { mode, pauschale: kalt, kaltmiete: null, nebenkosten: null }
                                                                 : { mode, kaltmiete: kalt, nebenkosten: nk, pauschale: null });
      else if (cc && cc.start) {
        // no rent history yet: the contract's own entry keeps rent + mode (never the room's offer again)
        await ccRpSetRent(sbL, { app: 'casa', rec, validFrom: cc.start, mode, kalt, nk, pauschale: kalt,
                                 kind: 'migrated', source: 'tenant_form', legacyMode });
      }
    }
  } catch (e) {
    histOk = false;
    if (from) { ccToast('Miethistorie nicht verfügbar (SQL noch nicht ausgeführt) – Miete nur beim Mieter gespeichert', true); }
    console.warn('[tenants] rent history:', e && e.message || e);
  }

  // The tenant record keeps the rent in effect today (a future rent waits in the history)
  const upd = { kaution_soll: ksoll };
  if (!from || from <= today || !histOk) { upd.kaltmiete = kalt; upd.nebenkosten = nk; }
  // Contract type of the running contract (+ the tenancy's type when it is the latest contract)
  if (ctNew && cc && ctNew !== cc.type) {
    _tnSyncTypePeriod(rec, ctNew);
    if (cc.last) upd.contract_type = ctNew;
  }
  // Contract end of the latest contract
  if (endNew !== undefined && cc && cc.last && (endNew || null) !== (_ccIso(rec.vertragsende) || null)) {
    upd.vertragsende = endNew;
    if (cc.renewal && typeof ccRpUpdate === 'function') ccRpUpdate(sbL, cc.renewal.id, { contract_end: endNew }).catch(() => {});
  }
  Object.assign(rec, upd);
  ccQueueWrite('tn-' + tid, () => sbL.from('tenant_records').update(upd).eq('id', tid))
    .then(({ error }) => {
      if (!error) return;
      Object.assign(rec, before);
      _tnRender();
      ccSaveFailed(error, 'tenant rent');
    });

  // Whole card redrawn (card stays open): header, beige bar and the line under it stay in step
  _tnRender();

  _tnRefreshKautionSoll(tid);
  _tnRefreshCardPills(roomName);
}

async function _tnModalSaveProfile(tid) {
  if (!sbL) return;
  const body = document.getElementById('tnModalBody');
  if (!body) return;

  // If profile is not in edit mode, only save kaution and return
  const editGuard = document.getElementById('mprof-edit-' + tid);
  if (!editGuard || editGuard.style.display === 'none') {
    // Save kaution if inputs exist in modal
    const kPfx = `modal_${(tid||'none').replace(/-/g,'').slice(0,8)}`;
    const recv = parseFloat(document.getElementById('kr-'   + kPfx)?.value);
    const ret  = parseFloat(document.getElementById('kret-' + kPfx)?.value);
    if (!isNaN(recv) && !isNaN(ret)) await _tnSaveKaution(tid, recv, ret);
    _tnCloseModal();
    return;
  }

  const p     = _tnCollectProfile(body, 'data-mf');
  { const _r = _tnRecords.find(r => r.id === tid);
    if (_r && !_ccTenancyOk(body, 'data-mf', p, _tnRecords.filter(r => r.room === _r.room), tid, null, r => [r.first_name, r.last_name].filter(Boolean).join(' '))) return; }
  const rec = _tnRecords.find(r => r.id === tid);
  const ctBefore  = rec ? tnContractType(rec) : null;
  const ctype     = p.contract_type || rec?.contract_type || null;
  const ctChanged = !!(rec && ctype && ctype !== ctBefore);
  const update = {
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, phone: p.phone, birthday: p.birthday,
    mietbeginn: p.mietbeginn, mietende: p.mietende,
    contract_type: ctype,
    kaution_soll:p.kaution_soll ?? rec?.kaution_soll ?? null,   // never wiped by a profile save
  };
  if (body.querySelector('[data-mf="address"]')) update.address = p.address || null;
  if (body.querySelector('[data-mf="vertragsende"]')) update.vertragsende = p.vertragsende || null;
  const hasRent = !!body.querySelector('[data-mf="kaltmiete"]');   // B20: only when the form shows the rent
  const modeNew = body.querySelector('[data-mf="rent_mode"]')?.value || null;
  const pauNew  = modeNew === 'pauschal';
  if (hasRent) { update.kaltmiete = p.kaltmiete ?? null; update.nebenkosten = pauNew ? null : (p.nebenkosten ?? null); }
  // The rent + mode go into the rent history (the entry of their last day) — so the room's offer never changes them again
  if (hasRent && rec && typeof ccRpFor === 'function') {
    const hist = ccRpFor('casa', rec.id);
    const lastDay = [ccRpIso(p.mietende) || ccRpToday(), ccRpToday()].sort()[0];
    const per = ccRpAt(hist, lastDay);
    const k = Number(p.kaltmiete) || 0, n = pauNew ? 0 : (Number(p.nebenkosten) || 0);
    const mode = modeNew || (per ? per.mode : _tnLegacyMode(rec.room, rec));
    const f = mode === 'pauschal' ? { mode: 'pauschal', pauschale: k, kaltmiete: null, nebenkosten: null }
                                  : { mode: 'kalt_nk', kaltmiete: p.kaltmiete ?? null, nebenkosten: p.nebenkosten ?? null, pauschale: null };
    if (per) {
      const a = ccRpAmount(per) || {};
      if ((per.mode === 'pauschal' ? 'pauschal' : 'kalt_nk') !== mode || k + n !== a.total || (mode !== 'pauschal' && k !== a.kalt)) {
        ccRpUpdate(sbL, per.id, f).catch(e => ccSaveFailed(e, 'rent history'));
      }
    } else if (ccRpIso(p.mietbeginn) && (p.kaltmiete != null || modeNew)) {
      ccRpSetRent(sbL, { app: 'casa', rec: { ...rec, ...update }, validFrom: ccRpIso(p.mietbeginn), mode, kalt: k, nk: n, pauschale: k,
                         kind: 'migrated', source: 'tenant_form', legacyMode: _tnLegacyMode(rec.room, rec) })
        .catch(e => ccSaveFailed(e, 'rent history'));
    }
  }

  const toActive = rec?.status === 'former' && (!p.mietende || !_tnIsPast(p.mietende));
  if (toActive) {
    update.status        = 'active';   // the contract type stays with the tenancy
    update.done          = false;
  }

  // Update local cache immediately — instant UI
  const beforeRec = rec ? { ...rec } : null;
  if (rec) Object.assign(rec, update);
  if (ctChanged) _tnSyncTypePeriod(rec, ctype);
  _tnSyncOccupancy();

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
      el.innerHTML = labels[i] || '<span class="muted">—</span>';
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
  ccQueueWrite('tn-' + tid, () => sbL.from('tenant_records').update(update).eq('id', tid))
    .then(({ error }) => {
      if (!error) return;
      if (rec && beforeRec) Object.keys(update).forEach(k => { rec[k] = beforeRec[k]; });
      _tnRender();
      ccSaveFailed(error, 'tenant');
    });

  _tnCloseModal();
  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   14. KAUTION INTERACTIONS
══════════════════════════════════════════════════════════════ */
function _tnCalcKaution(pfx, tid) {
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const kept = recv - ret;

  // Update kept display
  const el = document.getElementById('kk-' + pfx);
  if (el) {
    el.textContent = _tnFmtEUR(Math.max(0, kept));
    el.className   = 'tn-kc-val' + (kept > 0 ? ' gold' : '');
  }

  // Update status pill live (using current settled state from cache)
  const k = tid ? _tnKaution[tid] : null;
  const settled = k?.settled || false;
  const st = _tnKautionStatus(recv, ret, settled);
  const pill = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }

  // Show/hide Mark settled button based on whether recv > 0
  const footer = document.getElementById('kset-' + pfx)?.parentElement;
  if (footer && !document.getElementById('kset-' + pfx) && recv > 0 && tid) {
    const btn = document.createElement('button');
    btn.className = 'tn-btn tn-btn-sm';
    btn.id = 'kset-' + pfx;
    btn.innerHTML = '<i class="ti ti-check"></i> Mark settled';
    btn.onclick = () => _tnToggleSettle(pfx, tid);
    footer.insertBefore(btn, footer.firstChild);
  }

  // Mark save button as dirty
  const saveBtn = document.getElementById('ksave-' + pfx);
  if (saveBtn) ccSaveSet(saveBtn, 'dirty');     // unsaved change → dark SAVE
}

async function _tnSaveKautionBtn(pfx, tid) {
  if (!sbL || !tid) return;
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;
  const saveBtn = document.getElementById('ksave-' + pfx);
  _tnSaveKaution(tid, recv, ret);   // memory now, database in the background
  // Update section status pill
  const k    = _tnKaution[tid];
  const st   = _tnKautionStatus(recv, ret, k?.settled || false);
  const pill = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }
  // Update card header pill — find rid from tenant record
  const _rec = _tnRecords.find(r => r.id === tid);
  if (_rec) {
    const _rid = _rec.room.replace(/\s+/g,'_').toLowerCase();
    _tnRefreshCardPills(_rec.room);   // same rules as the first render — nothing gets dropped
  }
  if (saveBtn) ccSaveSet(saveBtn, 'saved');     // saved → grey ✓ SAVED until the next change
}

async function _tnSaveKaution(tid, received, returned) {
  if (!sbL) return;
  // Memory first (synchronously), so the card can update at once
  const k0 = _tnKaution[tid];
  const before = k0 ? { received: k0.received, returned: k0.returned } : null;
  if (k0) { k0.received = received; k0.returned = returned; }
  _tnRefreshFormerBadges(tid);
  if (_tnModalTid === tid) {
    const delBtn = document.getElementById('tnModalFooter')?.querySelector('.tn-btn-danger');
    if (delBtn) {
      const done = _tnIsAllDone(tid);
      delBtn.style.opacity        = done ? '1' : '.35';
      delBtn.style.pointerEvents  = done ? 'auto' : 'none';
    }
  }
  // Then the database (row created first if this tenant has none yet)
  if (!_tnKaution[tid]) await _tnEnsureKaution(tid);
  const k = _tnKaution[tid];
  if (!k?.id) return;
  k.received = received; k.returned = returned;
  const { error } = await ccQueueWrite('tnk-' + tid, () => sbL.from('kaution').update({ received, returned }).eq('id', k.id));
  if (error) {
    if (before) { k.received = before.received; k.returned = before.returned; }
    _tnRefreshFormerBadges(tid);
    ccSaveFailed(error, 'kaution');
  }
}

async function _tnToggleSettle(pfx, tid) {
  if (!sbL || !tid) return;
  if (!_tnKaution[tid]) await _tnEnsureKaution(tid);
  const k = _tnKaution[tid];
  if (!k?.id) return;

  // Toggle immediately in local cache
  k.settled = !k.settled;

  // Snapshot the amounts the user typed at the moment of settling
  const recv = parseFloat(document.getElementById('kr-'   + pfx)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + pfx)?.value) || 0;

  const upd = { settled: k.settled };
  if (k.settled) {
    k.received = recv; k.returned = ret;
    k.settled_at = new Date().toISOString();
    upd.received = recv; upd.returned = ret; upd.settled_at = k.settled_at;
  } else {
    k.settled_at = null;
    upd.settled_at = null;
  }

  // Update DOM instantly
  const btn = document.getElementById('kset-' + pfx);
  if (btn) {
    btn.innerHTML = `<i class="ti ti-check"></i> ${k.settled ? 'Settled' : 'Mark settled'}`;
    btn.className = `tn-btn ${k.settled ? 'tn-btn-done' : 'tn-btn-sm'}`;
  }
  const st   = _tnKautionStatus(recv, ret, k.settled);
  const pill = document.getElementById('kstat-' + pfx);
  if (pill) { pill.className = `tnp ${st.cls}`; pill.textContent = st.label; }

  // Fire to Supabase in background
  sbL.from('kaution').update(upd).eq('id', k.id)
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'Kaution settled'); _tnLoad(); } });
  { const _r = _tnRecords.find(r => r.id === tid); if (_r) _tnRefreshCardPills(_r.room); }

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

async function _tnConfirmAddNk__run(tid, inp, wrap, addBtn) {
  const period = inp.value.trim();
  if (!period || !sbL) return;
  const { data, error } = await sbL.from('nk_entries')
    .insert({ tenant_id: tid, period, sent:false, paid:false }).select().single();
  if (error) { ccSaveFailed(error, 'NK period'); return; }
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
  if (error) { ccSaveFailed(error, 'delete NK period'); return; }
  if (_tnNK[tid]) _tnNK[tid] = _tnNK[tid].filter(e => e.id !== nkId);
  if (_tnModalTid === tid) { _tnOpenModal(tid); } else { _tnRender(); }
}


/* ══════════════════════════════════════════════════════════════
   16. DOCUMENTS
══════════════════════════════════════════════════════════════ */

async function _tnViewDoc(fileUrl, label, roomName) {
  if (!fileUrl || !sbL) return;
  // Temporary private link (5 min) → opens in the iPhone's own viewer / a new
  // browser tab on top of the app (Phase 1). No in-app viewer, no "PDF" step,
  // and the document is no longer passed through Google's online viewer.
  const { data, error } = await sbL.storage
    .from('tenant-documents').createSignedUrl(fileUrl, 300);
  const url = data?.signedUrl;
  if (!url) {
    console.warn('[tenants] view doc error:', error?.message);
    _tnToast('Could not open document', true);
    return;
  }
  const title = label ? `${label}${roomName ? ' – ' + roomName : ''}` : 'Dokument';
  if (typeof ccOpenUrl === 'function') ccOpenUrl(url, title);
  else window.open(url, '_blank');
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



/* ══════════════════════════════════════════════════════════════
   17. FORMER TENANT MANAGEMENT
══════════════════════════════════════════════════════════════ */
function _tnAddFormer(roomName, pre) {
  // Open modal with a local draft — nothing written to DB until Save
  const draft = {
    id: null,
    room: roomName,
    status: 'former',
    contract_type: _tnRoomContractType(roomName),
    first_name: null, last_name: null, email: null, phone: null,
    birthday: null, address: null,
    mietbeginn: (pre && pre.from) || null, mietende: (pre && pre.to) || null,
    kaltmiete: null, nebenkosten: null, kaution_soll: null,
  };
  _tnOpenModalDraft(draft);
}

/* "Add former tenant": suggested Kaution Soll from the rent typed in this form (same rule as everywhere:
   Mietvertrag 3×, Kurzzeit ≤ 3 months 1×) — until you type your own amount */
function _tnDraftSollUpdate() {
  const modal = document.getElementById('tnModal'), body = document.getElementById('tnModalBody');
  if (!modal || !modal._draft || !body) return;
  const inp = body.querySelector('[data-mf="kaution_soll"]'); if (!inp || inp.dataset.touched) return;
  const val = f => body.querySelector(`[data-mf="${f}"]`)?.value || '';
  const ct = val('contract_type') || modal._draft.contract_type || 'mietvertrag';
  const mode = val('rent_mode') === 'pauschal' ? 'pauschal' : 'kalt_nk';
  const k = parseFloat(val('kaltmiete')), n = parseFloat(val('nebenkosten'));
  let soll = null;
  if (!isNaN(k) && k > 0 && typeof ccKaution === 'function') {
    soll = ccKaution({ contract: ct === 'kurzzeit' ? 'kurzzeit' : 'mietvertrag', mode, kalt: k, nk: mode === 'pauschal' ? 0 : (n || 0),
                       start: _tnParseDate(val('mietbeginn')), end: _tnParseDate(val('mietende')) }).amount;
  }
  inp.value = soll != null ? soll : '';
  inp.placeholder = soll != null ? soll : '';
}

function _tnOpenModalDraft(draft) {
  _tnModalTid = null; // null signals draft mode

  document.getElementById('tnModalName').textContent = 'New former tenant';
  document.getElementById('tnModalSub').innerHTML =
    `<span class="tnp tnp-gray">${esc(draft.room)}</span>`;

  document.getElementById('tnModalBody').innerHTML = _tnModalBodyHTML(draft);
  { // Past tenant: an empty rent takes today's Soll — show it so it can be checked
    const sp = _tnRoomPricing(draft.room, draft.contract_type) || {};
    if (sp.kaltmiete != null) document.getElementById('tnModalBody').insertAdjacentHTML('afterbegin',
      `<p class="cc-soll-hint">Empty rent = today's Soll: ${_tnFmtEUR(sp.kaltmiete)}${sp.nebenkosten != null ? ' + ' + _tnFmtEUR(sp.nebenkosten) + ' NK' : ''}. Please check what this tenant paid back then.</p>`);
  }
  // Footer: just Save + Cancel for draft
  document.getElementById('tnModalFooter').innerHTML = `
    <div class="tn-sheet-spacer"></div>
    <button class="tn-btn tn-btn-sm" onclick="_tnCloseModal()">Cancel</button>
    <button class="tn-btn tn-btn-primary cc-save cc-save--create" onclick="_tnModalSaveDraft()">
      <i class="ti ti-check"></i> Save</button>`;

  // Store draft data for save
  document.getElementById('tnModal')._draft = draft;
  { const b = document.getElementById('tnModalBody');
    const ks = b.querySelector('[data-mf="kaution_soll"]'); if (ks) { ks.value = ''; ks.placeholder = ''; }
    b.oninput = e => { if (e.target.matches('[data-mf="kaution_soll"]')) e.target.dataset.touched = '1';
                       else if (e.target.matches('[data-mf="kaltmiete"],[data-mf="nebenkosten"],[data-mf="mietbeginn"],[data-mf="mietende"]')) _tnDraftSollUpdate(); }; }

  // Open in edit mode immediately
  const body = document.getElementById('tnModalBody');
  const read  = body.querySelector('[id^="mprof-read-"]');
  const edit  = body.querySelector('[id^="mprof-edit-"]');
  const fread = body.querySelector('[id^="mprof-foot-read-"]');
  const fedit = body.querySelector('[id^="mprof-foot-edit-"]');
  if (read)  read.style.display  = 'none';
  if (edit)  edit.style.display  = '';
  if (fread) fread.style.display = 'none';
  if (fedit) fedit.style.display = 'none';

  document.getElementById('tnModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function _tnModalSaveDraft() {
  if (!sbL) return;
  const modal = document.getElementById('tnModal');
  const draft = modal._draft;
  if (!draft) return;

  const body = document.getElementById('tnModalBody');
  const p    = _tnCollectProfile(body, 'data-mf');
  const ctype = p.contract_type || draft.contract_type || null;

  const btn = document.getElementById('tnModalFooter')?.querySelector('.tn-btn-primary');
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  if (!_ccTenancyOk(body, 'data-mf', p, _tnRecords.filter(r => r.room === draft.room), null, btn, r => [r.first_name, r.last_name].filter(Boolean).join(' '))) return;

  const { data, error } = await sbL.from('tenant_records')
    .insert({
      room: draft.room, status: 'former', contract_type: ctype,
      first_name: p.first_name, last_name: p.last_name,
      email: p.email, phone: p.phone, birthday: p.birthday,
      address: p.address, mietbeginn: p.mietbeginn, mietende: p.mietende,
      // Starting rent = the room's price (Soll) unless you typed another amount
      kaltmiete: p.kaltmiete ?? _tnRoomPricing(draft.room, ctype).kaltmiete ?? null,
      nebenkosten: p.nebenkosten ?? _tnRoomPricing(draft.room, ctype).nebenkosten ?? null,
      kaution_soll: p.kaution_soll ?? null,
    })
    .select().single();

  if (error) {
    ccSaveFailed(error, 'former tenant');
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Save'; btn.disabled = false; }
    return;
  }

  // The Rent choice (Kalt + NK | Pauschal) is saved with the tenant's contract — never taken from the room's offer later
  const modeSel = body.querySelector('[data-mf="rent_mode"]')?.value;
  if (modeSel && data.mietbeginn && typeof ccRpSetRent === 'function') {
    const k = Number(data.kaltmiete) || 0, n = Number(data.nebenkosten) || 0;
    try {
      await ccRpSetRent(sbL, { app: 'casa', rec: data, validFrom: _ccIso(data.mietbeginn), mode: modeSel,
        kalt: modeSel === 'pauschal' ? k + n : k, nk: modeSel === 'pauschal' ? null : n, pauschale: k + n,
        contract_type: ctype || undefined, kind: 'migrated', source: 'tenant_form', legacyMode: modeSel });
      if (modeSel === 'pauschal' && n) { data.kaltmiete = k + n; data.nebenkosten = null;
        sbL.from('tenant_records').update({ kaltmiete: k + n, nebenkosten: null }).eq('id', data.id).then(() => {}); }
    } catch (e) { ccSaveFailed(e, 'rent history'); }
  }

  await _tnEnsureKaution(data.id);
  _tnRecords.push(data);
  _tnSyncOccupancy();
  _tnNK[data.id]   = [];
  _tnDocs[data.id] = [];
  modal._draft = null;

  _tnCloseModal();
  if (window._ccReturnTo) { location.href = window._ccReturnTo; return; }   // came from Settlements → straight back
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
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'tenant archive'); _tnLoad(); } });
}

async function _tnReopen(tid) {
  if (!sbL) return;
  const rec = _tnRecords.find(r => r.id === tid);
  if (rec) { rec.done = false; rec.status = 'former'; }
  _tnRender();
  sbL.from('tenant_records').update({ done:false, status:'former' }).eq('id', tid)
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'tenant reopen'); _tnLoad(); } });
}

async function _tnHideFormer(tid) {
  if (!sbL) return;
  const rec = _tnRecords.find(r => r.id === tid);
  if (rec) { rec.done = true; rec.status = 'archived'; }
  _tnRender();
  sbL.from('tenant_records').update({ done:true, status:'archived' }).eq('id', tid)
    .then(({ error }) => { if (error) { ccSaveFailed(error, 'tenant hide'); _tnLoad(); } });
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
  const ok = await _tnDeleteCascade(_tnDeleteId);
  document.getElementById('tnConfirm').classList.remove('open');
  _tnDeleteId = null;
  if (btn) btn.disabled = false;
  _tnCloseModal();
  if (ok) await _tnLoad(); else _tnRender();
}

/* Delete a tenant from the card (Edit → Delete, or Save with name + email cleared).
   Always asks first. Removes the tenant and everything linked to them. */
async function _tnDeleteTenant(tid) {
  const rec = _tnRecords.find(r => r.id === tid); if (!rec || !sbL) return;
  const name = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || 'this tenant';
  const yes = await ccConfirm('Delete ' + esc(name) + '?',
    `Removes <strong>${esc(name)}</strong> (${esc(rec.room)}) and everything linked: Kaution, NK, rent history, Zählerstände and documents. Cannot be undone.`,
    'Delete', true);
  if (!yes) return;
  if (await _tnDeleteCascade(tid)) {
    // nobody left who lives there → Vacant (the dates rule only knows rooms that still have a tenant record)
    const room = typeof appRooms !== 'undefined' ? appRooms.find(r => r.name === rec.room) : null;
    const today = _ccTodayIso();
    const lives = _tnRecords.some(r => r.room === rec.room && r.status === 'active' && (!r.mietbeginn || _ccIso(r.mietbeginn) <= today));
    if (room && !room.vacant && !lives) {
      room.vacant = true;
      ccQueueWrite('room-occ-' + room.id, () => sbL.from('rooms').update({ vacant: true }).eq('id', room.id));
    }
    await _tnLoad();                       // occupancy (vacant / occupied) follows from the dates again
    _tnRender();                           // always redraw: a deleted tenant must never stay on screen
    if (typeof ccToast === 'function') ccToast(name + ' deleted');
  }
}

/* Everything linked to one tenant, then the tenant. A table that doesn't exist is skipped. */
async function _tnDeleteCascade(tid) {
  if (!sbL || !tid) return false;
  const docs = _tnDocs[tid] || [];
  const soft = async (q, what) => {
    try { const { error } = await q; if (error && !/does not exist|schema cache|Could not find/i.test(error.message || '')) console.warn('[tenants] delete ' + what + ':', error.message); }
    catch (e) { console.warn('[tenants] delete ' + what + ':', e); }
  };
  await Promise.all([
    soft(sbL.from('kaution').delete().eq('tenant_id', tid), 'Kaution'),
    soft(sbL.from('nk_entries').delete().eq('tenant_id', tid), 'NK'),
    soft(sbL.from('nk_vorauszahlung_history').delete().eq('tenant_id', String(tid)), 'NK-Vorauszahlung'),
    soft(sbL.from('rent_periods').delete().eq('app', 'casa').eq('tenant_id', String(tid)), 'rent history'),
    soft(sbL.from('meter_readings').delete().eq('app', 'casa').eq('tenant_id', String(tid)), 'Zählerstände'),
    soft(sbL.from('tenant_documents').delete().eq('tenant_id', tid), 'documents'),
  ]);
  const paths = docs.map(d => d && d.file_url).filter(Boolean);
  if (paths.length) { try { await sbL.storage.from('tenant-documents').remove(paths); } catch (e) {} }
  const { error } = await sbL.from('tenant_records').delete().eq('id', tid);
  if (error) { ccSaveFailed(error, 'delete tenant'); return false; }
  _tnRecords = _tnRecords.filter(r => r.id !== tid);
  delete _tnKaution[tid]; delete _tnNK[tid]; delete _tnDocs[tid];
  return true;
}


/* ══════════════════════════════════════════════════════════════
   18. BADGE REFRESH
══════════════════════════════════════════════════════════════ */
function _tnRefreshFormerBadges(tid) {
  // Former line, list pills and the "Open" count all come from the same data → just redraw
  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   19. PASSWORD RESET
══════════════════════════════════════════════════════════════ */
async function _tnResetPw(room) {   // the new password also shows in the card (pw-requests-admin.js)
  if (!sbL) { alert('No database connection.'); return; }
  if (!(await ccConfirm('Reset password · ' + esc(room), 'The old password stops working. The new one is shown once.', 'Reset'))) return;
  const pw = await ccSetNewRoomPassword(room, 'New password');
  if (pw) { _tnPwAt[room] = new Date().toISOString(); _tnRender(); }
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
  // Document uploads: cc-contract-flow.js (Unsigned | Signed, photos → PDF)
  if (typeof ccPwApply === 'function') ccPwApply();   // room passwords (pw-requests-admin.js)
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
/* Preload for the contract generators (Rooms tab): tenant data is fetched once
   in the background so a generator opens instantly with the names already known. */
let _tnLoadedOnce  = false;
let _tnWarmPromise = null;
function tnTenantsLoaded() { return _tnLoadedOnce; }
/* The CURRENT tenant's rent of a room (moved in, active) — null if none / not loaded yet */
function tnCurrentRentOf(roomName) {
  if (!_tnLoadedOnce) return null;
  const cur = _ccPickTenancy(_tnRecords.filter(r => r.room === roomName && r.status === 'active')).current;
  if (!cur) return null;
  const r = _tnCurrentRent(cur, roomName);
  return r ? { kalt: Number(r.kalt) || 0, nk: Number(r.nk) || 0, total: Number(r.total) || 0, mode: r.mode, ctype: tnContractType(cur) } : null;
}
/* The CURRENT tenancy of a room for the Rooms header: its contract type, the
   end of a Kurzzeit contract and its rent (rent may be null = not stored yet).
   null = nobody lives there now, or the tenants are not loaded yet.          */
function tnCurrentTenancyOf(roomName) {
  if (!_tnLoadedOnce) return null;
  const cur = _ccPickTenancy(_tnRecords.filter(r => r.room === roomName && r.status === 'active')).current;
  if (!cur) return null;
  const r = _tnCurrentRent(cur, roomName);
  // Already renewed → the LATEST contract end ("bis … · verlängert"); renewed as unbefristet → the running end ("then Mietvertrag")
  const st = _tnContractState(cur), last = st.all[st.all.length - 1];
  const renewed = !!st.next;
  const then = renewed && last && last.type === 'mietvertrag' ? 'mietvertrag' : null;
  return {
    ctype: tnContractType(cur), renewed, then, start: _ccIso(cur.mietbeginn || ''),
    end: renewed ? (then ? _ccAddDaysIso(st.next.start, -1) : (last.end || '')) : _ccIso(cur.vertragsende || cur.mietende || ''),
    rent: r ? { kalt: Number(r.kalt) || 0, nk: Number(r.nk) || 0, total: Number(r.total) || 0, mode: r.mode } : null,
  };
}
/* One line for the Rooms card: who lives in the room (read-only pointer — Tenants is the
   one place where tenant data is kept and edited) */
function tnRoomWhoLine(roomName) {
  if (!_tnLoadedOnce) return null;
  const recs = _tnRecords.filter(r => r.room === roomName);
  const pick = _ccPickTenancy(recs.filter(r => r.status === 'active'));
  const nm = r => [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unnamed tenant';
  if (pick.current) {
    const r = pick.current, ct = tnContractType(r);
    const st = _tnContractState(r), last = st.all[st.all.length - 1];
    const end = _ccIso(r.mietende) || (last && last.end) || _ccIso(r.vertragsende);
    const tail = r.mietende ? 'moves out ' + _ccFmtD(r.mietende)
      : end && _tnIsFixed(ct) ? 'bis ' + _ccFmtD(end) : (r.mietbeginn ? 'since ' + _ccFmtD(r.mietbeginn) : '');
    return { kind: 'current', text: [nm(r), _tnTypeWord(ct), tail].filter(Boolean).join(' · ') };
  }
  if (pick.next) return { kind: 'next', text: 'Moves in ' + _ccFmtD(pick.next.mietbeginn) + ' · ' + nm(pick.next) };
  const lastOut = recs.map(r => _ccIso(r.mietende)).filter(Boolean).sort().pop();
  return { kind: 'vacant', since: lastOut ? _ccFmtD(_ccAddDaysIso(lastOut, 1)) : '' };
}
function tnWarmTenants() {
  if (_tnLoadedOnce) return Promise.resolve();
  if (!_tnWarmPromise) {
    _tnWarmPromise = loadTenants()
      .then(() => {   // Rooms header + total show the tenants' real rent once known
        try { if (typeof _renderRoomsList === 'function' && document.getElementById('roomsList')) _renderRoomsList(); } catch (e) {}
      })
      .catch(e => console.warn('[tenants] preload:', e))
      .finally(() => { _tnWarmPromise = null; });
  }
  return _tnWarmPromise;
}

async function loadTenants() {
  if (typeof appRooms !== 'undefined' && !appRooms.length && typeof loadRoomsData === 'function') {
    await loadRoomsData();
  }
  _tnWireRealtime();
  await _tnLoad();
  // Birthday notice now comes from the daily Supabase job (BIRTHDAY.sql) — checkBirthdays() is no longer called
  const h = _ccTakeFormerHandoff('casa');
  if (h && h.room) { _ccReturnBanner(document.getElementById('tab-tenants')); _tnAddFormer(h.room, h); }
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
async function _tnNKVorausConfirmAdd(...args) { return ccOnce('_tnNKVorausConfirmAdd', () => _tnNKVorausConfirmAdd__run(...args)); }
async function _tnConfirmAddNk(...args) { return ccOnce('_tnConfirmAddNk', () => _tnConfirmAddNk__run(...args)); }
