/* ─────────────────────────────────────────────────────────────
   RENTALS — APARTMENTS TAB
   rentals-tab-apartments.js

   Full apartment management:
   - Card list with expand/collapse, drag-to-sort (SortableJS)
   - Per-section inline edit (Identity, Miete, Verwaltung, Zähler, Schlüssel)
   - Vacant / occupied toggle
   - Inventar modal (Anlage A)
   - Contract modals: Kurzzeitmiete, Mietvertrag, Übergabeprotokoll
     (PDF generation — coming next build)
   - Delete with confirmation

   Depends on: rentals-constants.js, rentals-supabase-client.js
   ───────────────────────────────────────────────────────────── */


/* ── INJECT HTML ─────────────────────────────────────────── */
document.getElementById('tab-apartments').innerHTML = `

  <div class="rp-hdr">
    <h1 class="rp-title">Apartments</h1>
    <button class="rp-add-btn" id="aptAddBtn">
      <i class="ti ti-plus"></i> Add
    </button>
  </div>

  <div class="rp-summary" id="aptSummary" style="display:none">
    <div>
      <div class="rp-summary__label">Gesamtkaltmiete / Monat</div>
      <div class="rp-summary__breakdown" id="aptSummaryBreakdown"></div>
    </div>
    <div>
      <div class="rp-summary__total" id="aptSummaryTotal"></div>
      <div class="rp-summary__sub">nur belegte Wohnungen</div>
    </div>
  </div>

  <div class="rp-list" id="aptList"></div>

  <!-- ══ INVENTAR MODAL ══ -->
  <div class="rm-overlay" id="aptInventarOverlay">
    <div class="rm-sheet">
      <div class="rm-sheet__hdr">
        <div>
          <div class="rm-sheet__title">Inventar</div>
          <div class="rm-sheet__sub" id="aptInventarSubtitle"></div>
        </div>
        <button class="rm-sheet__close" id="aptInventarClose"><i class="ti ti-x"></i></button>
      </div>
      <div class="rm-sheet__body">
        <div class="inv-list" id="aptInventarList"></div>
        <button class="inv-add-btn" id="aptInventarAddRow">
          <i class="ti ti-plus"></i> Add item
        </button>
      </div>
      <div class="rm-sheet__footer">
        <button class="rm-btn--ghost" id="aptInventarCancel">Cancel</button>
        <button class="rm-btn--primary" id="aptInventarSave">Save</button>
      </div>
    </div>
  </div>

  <!-- ══ CONTRACT MODAL ══ -->
  <div class="rm-overlay" id="aptContractOverlay">
    <div class="rm-sheet rm-sheet--tall">
      <div class="rm-sheet__hdr">
        <div>
          <div class="rm-contract-type" id="aptContractTypeLbl"></div>
          <div class="rm-sheet__title" id="aptContractTitleLbl"></div>
          <div class="rm-sheet__sub" id="aptContractSubLbl"></div>
        </div>
        <button class="rm-sheet__close" id="aptContractClose"><i class="ti ti-x"></i></button>
      </div>
      <div class="rm-sheet__body" id="aptContractBody"></div>
      <div class="rm-sheet__footer" id="aptContractFooter"></div>
    </div>
  </div>

  <!-- ══ HAUSGELD HISTORY MODAL ══ -->
  <div class="rm-overlay" id="aptHGModal" onclick="_aptHGModalOutside(event)">
    <div class="rm-sheet" style="max-height:70vh">
      <div class="rm-sheet__hdr">
        <div style="flex:1;min-width:0">
          <div class="rm-sheet__title">Hausgeld History</div>
          <div class="rm-sheet__sub" id="aptHGModalSub"></div>
        </div>
        <button class="rm-sheet__close" onclick="_aptHGModalClose()"><i class="ti ti-x"></i></button>
      </div>
      <div class="rm-sheet__body" id="aptHGModalBody"></div>
    </div>
  </div>

  <!-- ══ CONFIRM DELETE ══ -->
  <div class="rm-confirm-overlay" id="aptConfirmOverlay">
    <div class="rm-confirm-box">
      <div class="rm-confirm-icon"><i class="ti ti-alert-triangle"></i></div>
      <div class="rm-confirm-title">Delete apartment</div>
      <div class="rm-confirm-body" id="aptConfirmBody"></div>
      <div class="rm-confirm-btns">
        <button class="rm-btn--cancel" id="aptConfirmCancel">Cancel</button>
        <button class="rm-btn--danger" id="aptConfirmOk"><i class="ti ti-trash"></i> Delete</button>
      </div>
    </div>
  </div>
`;


/* ── STYLES ──────────────────────────────────────────────── */
(function() {
  if (document.getElementById('apt-tab-styles-v2')) return;
  const s = document.createElement('style');
  s.id = 'apt-tab-styles-v2';
  s.textContent = `
/* Page header */
.rp-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; padding-top:24px; }
.rp-title { font-family:'Cormorant Garamond',Georgia,serif; font-size:32px; font-weight:300; color:var(--cc-ink); }
.rp-add-btn {
  display:flex; align-items:center; gap:6px; padding:8px 14px; min-height:34px;
  background:var(--cc-ink); color:var(--cc-white); border:none; border-radius:var(--cc-r-md);
  font-size:11px; font-weight:500; letter-spacing:.07em; text-transform:uppercase;
  font-family:inherit; cursor:pointer;
}

/* Summary */
.rp-summary { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; margin-bottom:12px; background:var(--cc-white); border:var(--cc-border); border-radius:var(--cc-r-lg); }
.rp-summary__label { font-size:9px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--cc-taupe); margin-bottom:2px; }
.rp-summary__breakdown { font-size:11px; color:var(--cc-stone); }
.rp-summary__total { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; color:var(--cc-ink); text-align:right; }
.rp-summary__sub { font-size:10px; color:var(--cc-stone); text-align:right; }

/* Card list */
.rp-list { display:flex; flex-direction:column; gap:8px; padding-bottom:40px; }

/* SortableJS */
.sortable-ghost  { opacity:.3; background:var(--cc-surface)!important; border:1px dashed var(--cc-stone)!important; }
.sortable-chosen { box-shadow:0 8px 32px rgba(30,27,24,.16)!important; z-index:10; position:relative; }

/* ── CARD ── */
.apt-card {
  background:var(--cc-white); border:var(--cc-border); border-radius:var(--cc-r-lg);
  overflow:hidden; transition:box-shadow .2s;
}
.apt-card.apt--open { box-shadow:0 4px 24px rgba(30,27,24,.08); }

/* Header */
.apt-hdr {
  display:flex; align-items:flex-start; gap:10px;
  padding:14px 16px; cursor:pointer; user-select:none;
}
.apt-drag {
  color:var(--cc-stone); font-size:14px; flex-shrink:0; opacity:.4;
  margin-top:4px; cursor:grab; touch-action:none;
}
.apt-drag:hover { opacity:.9; }
.apt-hdr__info { flex:1; min-width:0; }
.apt-hdr__namerow { display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap; }
.apt-hdr__name { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; color:var(--cc-ink); line-height:1.1; }
.apt-status-badge { font-size:9px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; padding:3px 9px; border-radius:var(--cc-r-pill); flex-shrink:0; }
.apt-status--occupied { background:#EAF3DE; color:#27500A; border:.5px solid #9AC87A; }
.apt-status--vacant   { background:#F5F0EB; color:#8C6A3A; border:.5px solid #D4A87A; }
.apt-hdr__addr { font-size:10px; color:var(--cc-stone); margin-bottom:3px; }
.apt-hdr__tags { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:5px; }
.apt-tag { font-size:9px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; padding:2px 7px; border-radius:20px; }
.apt-tag--apt { background:var(--cc-surface); color:var(--cc-taupe); border:.5px solid var(--cc-rule); }
.apt-tag--gew { background:#E6F1FB; color:#0C447C; border:.5px solid #85B7EB; }
.apt-hdr__rent { font-size:12px; color:var(--cc-charcoal); margin-top:2px; }
.apt-hdr__rent strong { color:var(--cc-gold); font-weight:500; }
.apt-hdr__rent--vacant { color:var(--cc-stone); font-style:italic; font-size:12px; }
.apt-chevron { color:var(--cc-stone); font-size:16px; transition:transform .22s cubic-bezier(.32,.72,0,1); flex-shrink:0; margin-top:4px; }
.apt--open .apt-chevron { transform:rotate(90deg); }

/* Body */
.apt-body { display:none; border-top:var(--cc-border); }
.apt--open .apt-body { display:block; }

/* Actions strip */
.apt-actions { display:flex; gap:6px; padding:8px 14px; border-bottom:var(--cc-border); }
.apt-act {
  height:28px; display:flex; align-items:center; gap:4px; padding:0 12px;
  border-radius:var(--cc-r-pill); font-size:9px; font-weight:600; letter-spacing:.07em;
  text-transform:uppercase; cursor:pointer; font-family:inherit; background:none;
  -webkit-tap-highlight-color:transparent; white-space:nowrap;
}
.apt-act:active { opacity:.7; }
.apt-act--mark-vacant   { color:#8C6A3A; border:.5px solid #D4A87A; }
.apt-act--mark-occupied { color:#27500A; border:.5px solid #9AC87A; }

/* Sections */
.apt-section { padding:11px 14px; border-bottom:var(--cc-border); position:relative; }
.apt-section--miete { padding:11px 14px 11px 12px; border-bottom:var(--cc-border); border-left:3px solid var(--cc-gold); position:relative; }
.apt-stitle { font-size:9px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--cc-stone); margin-bottom:7px; }
.apt-row { display:flex; justify-content:space-between; align-items:baseline; padding:3px 0; gap:12px; }
.apt-row__k { font-size:11px; color:var(--cc-taupe); flex-shrink:0; }
.apt-row__v { font-size:12px; color:var(--cc-charcoal); text-align:right; }
.apt-row__v--gold { color:var(--cc-gold); font-weight:500; }
.apt-row__v--muted { color:var(--cc-stone); font-size:11px; }
.apt-row__v--mono { font-family:'Courier New',monospace; font-size:11px; color:var(--cc-charcoal); }

/* Meter groups */
.apt-meter-group { margin-bottom:8px; }
.apt-meter-group:last-of-type { margin-bottom:0; }
.apt-meter-group__title {
  font-size:9px; font-weight:600; letter-spacing:.1em; text-transform:uppercase;
  color:var(--cc-taupe); margin-bottom:4px; display:flex; align-items:center; gap:4px;
}

/* Section edit button */
.apt-section-edit { display:flex; justify-content:flex-end; margin-top:10px; }
.apt-sec-edit-btn {
  display:flex; align-items:center; gap:4px; height:26px; padding:0 10px;
  background:none; border:.5px solid var(--cc-rule); border-radius:6px;
  font-size:10px; font-weight:500; letter-spacing:.06em; text-transform:uppercase;
  color:var(--cc-taupe); cursor:pointer; font-family:inherit;
}
.apt-sec-edit-btn:hover { border-color:var(--cc-stone); }

/* Edit field styles */
.apt-edit-active { background:var(--cc-white); }
.apt-field { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
.apt-field:last-child { margin-bottom:0; }
.apt-field__label { font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:var(--cc-taupe); }
.apt-input {
  width:100%; min-height:38px; padding:8px 10px; background:var(--cc-bg);
  border:var(--cc-border); border-radius:var(--cc-r-md); font-family:inherit;
  font-size:13px; font-weight:300; color:var(--cc-charcoal); outline:none;
  transition:border-color .15s; -webkit-appearance:none;
}
.apt-input:focus { border-color:var(--cc-charcoal); }
.apt-input::placeholder { color:var(--cc-stone); }
.apt-input--mono { font-family:'Courier New',monospace; font-size:12px; }
.apt-field-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.apt-field-row .apt-field { margin-bottom:0; }

/* Save/cancel row */
.apt-save-row { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
.apt-btn--cancel {
  height:36px; padding:0 16px; background:none; border:.5px solid var(--cc-rule);
  border-radius:var(--cc-r-md); font-size:11px; font-weight:500; letter-spacing:.07em;
  text-transform:uppercase; color:var(--cc-taupe); cursor:pointer; font-family:inherit;
}
.apt-btn--save {
  height:36px; padding:0 20px; background:var(--cc-ink); color:var(--cc-white);
  border:none; border-radius:var(--cc-r-md); font-size:11px; font-weight:500;
  letter-spacing:.07em; text-transform:uppercase; cursor:pointer; font-family:inherit;
}
.apt-btn--save:disabled { opacity:.5; cursor:not-allowed; }

/* Stepper */
.apt-stepper { display:flex; align-items:center; border:var(--cc-border); border-radius:var(--cc-r-md); overflow:hidden; width:fit-content; }
.apt-stepper button { width:34px; height:34px; background:var(--cc-surface); border:none; font-size:16px; color:var(--cc-charcoal); cursor:pointer; font-family:inherit; display:flex; align-items:center; justify-content:center; }
.apt-stepper__v { min-width:36px; text-align:center; font-size:13px; padding:0 4px; color:var(--cc-charcoal); }

/* Kaution toggle */
.apt-toggle-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.apt-tlabel { font-size:13px; color:var(--cc-charcoal); }
.cc-sw { position:relative; width:40px; height:24px; flex-shrink:0; }
.cc-sw input { opacity:0; width:0; height:0; }
.cc-sw__t { position:absolute; inset:0; background:var(--cc-rule); border-radius:12px; transition:background .2s; cursor:pointer; }
.cc-sw__t::after { content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:white; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.15); }
.cc-sw input:checked + .cc-sw__t { background:var(--cc-ink); }
.cc-sw input:checked + .cc-sw__t::after { transform:translateX(16px); }

/* Pricing toggle */
.apt-pricing-toggle { display:flex; border:var(--cc-border); border-radius:var(--cc-r-pill); overflow:hidden; background:var(--cc-surface); width:fit-content; margin-bottom:10px; }
.apt-pricing-toggle button { padding:7px 16px; font-size:10px; font-weight:500; letter-spacing:.07em; text-transform:uppercase; border:none; background:transparent; color:var(--cc-stone); cursor:pointer; font-family:inherit; transition:background .15s,color .15s; }
.apt-pricing-toggle button.active { background:var(--cc-ink); color:var(--cc-white); }

/* Keys */
.apt-keys { display:flex; flex-wrap:wrap; gap:8px; }
.apt-key { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--cc-taupe); background:var(--cc-surface); padding:4px 10px; border-radius:20px; border:.5px solid var(--cc-rule); }

/* Inventar row */
.apt-inv-row { display:flex; align-items:center; justify-content:space-between; padding:11px 16px; border-bottom:var(--cc-border); }
.apt-inv-label { font-size:11px; font-weight:500; color:var(--cc-charcoal); }
.apt-inv-count { font-size:10px; color:var(--cc-taupe); margin-top:1px; }
.apt-inv-btn {
  font-size:10px; font-weight:500; letter-spacing:.07em; text-transform:uppercase;
  color:var(--cc-taupe); background:none; border:.5px solid var(--cc-rule);
  border-radius:var(--cc-r-md); padding:5px 12px; cursor:pointer; font-family:inherit;
  display:flex; align-items:center; gap:4px;
}

/* Contracts */
.apt-contracts { padding:11px 14px; }
.apt-contracts-title { font-size:9px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--cc-stone); margin-bottom:8px; }
.apt-doc-row { display:flex; align-items:center; gap:7px; margin-bottom:6px; }
.apt-doc-row:last-child { margin-bottom:0; }
.apt-doc-btn {
  flex:1; height:40px; display:flex; align-items:center; justify-content:space-between;
  padding:0 13px; background:#F5EFE6; color:#5C3D1E; border:.5px solid #D4B896;
  border-radius:var(--cc-r-md); font-family:inherit; font-size:13px; font-weight:500; cursor:pointer;
}
.apt-doc-btn i { font-size:13px; color:#B8956A; opacity:.8; }
.apt-doc-toggle {
  display:flex; background:var(--cc-surface); border:.5px solid var(--cc-rule);
  border-radius:var(--cc-r-pill); padding:3px; gap:2px; height:40px; align-items:center; flex-shrink:0;
}
.apt-doc-toggle button {
  height:100%; padding:0 10px; font-size:9px; font-weight:600; letter-spacing:.08em;
  text-transform:uppercase; border:none; cursor:pointer; font-family:inherit;
  color:var(--cc-taupe); background:none; border-radius:var(--cc-r-pill); transition:all .15s;
}
.apt-doc-toggle button.active { background:var(--cc-white); color:var(--cc-charcoal); box-shadow:0 1px 3px rgba(30,27,24,.10); }

/* Card footer delete */
.apt-card-footer { display:flex; justify-content:flex-end; padding:10px 14px; border-top:var(--cc-border); background:var(--cc-surface); }
.apt-delete-btn {
  display:flex; align-items:center; gap:5px; padding:6px 12px; background:transparent;
  border:.5px solid #EAC4BB; border-radius:var(--cc-r-md); color:#C4705A;
  font-size:10px; font-weight:500; letter-spacing:.06em; text-transform:uppercase;
  cursor:pointer; font-family:inherit;
}

/* HV link */
.apt-hv-link { font-size:12px; color:var(--cc-gold); text-decoration:none; }

/* ── OVERLAYS ── */
.rm-overlay {
  display:none; position:fixed; inset:0; z-index:400;
  background:rgba(30,27,24,.22); backdrop-filter:blur(2px);
  align-items:flex-end; justify-content:center;
  /* prevent overlay itself from scrolling horizontally */
  overflow:hidden;
}
.rm-overlay.open { display:flex; }
.rm-sheet {
  width:100%; max-width:500px;
  /* iOS: use dvh so address bar doesn't cut off footer */
  max-height:90dvh; max-height:90vh;
  background:var(--cc-white); border-radius:20px 20px 0 0;
  display:flex; flex-direction:column;
  animation:rmSheetUp .26s cubic-bezier(.32,.72,0,1);
  /* prevent sheet itself from causing horizontal scroll */
  overflow:hidden;
}
.rm-sheet--tall { max-height:96dvh; max-height:96vh; }
@keyframes rmSheetUp { from{transform:translateY(40px);opacity:0;} to{transform:none;opacity:1;} }
.rm-sheet__hdr { display:flex; align-items:flex-start; justify-content:space-between; padding:20px 20px 14px; border-bottom:var(--cc-border); flex-shrink:0; }
.rm-contract-type { font-size:9px; font-weight:500; letter-spacing:.11em; text-transform:uppercase; color:var(--cc-gold); margin-bottom:3px; }
.rm-sheet__title { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:300; color:var(--cc-ink); }
.rm-sheet__sub { font-size:12px; color:var(--cc-taupe); margin-top:2px; }
.rm-sheet__close { width:30px; height:30px; display:flex; align-items:center; justify-content:center; background:var(--cc-surface); border:var(--cc-border); border-radius:50%; color:var(--cc-taupe); font-size:13px; cursor:pointer; flex-shrink:0; }
.rm-sheet__body {
  flex:1; overflow-y:auto; overflow-x:hidden;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior:contain;
  padding:16px 20px;
  /* prevent wide children from pushing sheet width */
  width:100%; box-sizing:border-box;
}
.rm-sheet__footer {
  padding:12px 16px;
  padding-bottom:max(16px,env(safe-area-inset-bottom,16px));
  border-top:var(--cc-border); flex-shrink:0;
  display:flex; align-items:center; gap:10px;
  /* ensure footer is never cut off on iPhone notch */
  position:relative; z-index:1;
}
.rm-btn--ghost { flex-shrink:0; height:48px; padding:0 16px; background:none; border:none; color:var(--cc-stone); font-size:13px; cursor:pointer; font-family:inherit; }
.rm-btn--primary { flex:1; height:48px; background:var(--cc-ink); color:var(--cc-white); border:none; border-radius:var(--cc-r-md); font-size:13px; font-weight:500; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; font-family:inherit; }
.rm-btn--primary:disabled { opacity:.45; cursor:not-allowed; }
.rm-btn--cancel { flex-shrink:0; height:48px; padding:0 16px; background:none; border:none; color:var(--cc-stone); font-size:13px; cursor:pointer; font-family:inherit; }
.rm-btn--pdf { flex:1; height:48px; background:var(--cc-ink); color:var(--cc-white); border:none; border-radius:var(--cc-r-md); font-size:13px; font-weight:500; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; font-family:inherit; }
.rm-btn--pdf:disabled { opacity:.45; cursor:not-allowed; }

/* Contract body elements */
.rm-prefilled { background:var(--cc-bg); border:var(--cc-border); border-radius:var(--cc-r-md); padding:12px 14px; margin-bottom:14px; width:100%; box-sizing:border-box; overflow:hidden; }
.rm-prefilled__title { font-size:9px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-stone); margin-bottom:8px; }
.rm-pre-row { display:flex; gap:8px; padding:3px 0; font-size:12px; min-width:0; }
.rm-pre-row span:first-child { color:var(--cc-stone); min-width:80px; max-width:100px; flex-shrink:0; }
.rm-pre-row span:last-child { word-break:break-word; min-width:0; }
.rm-kaution-row { display:flex; align-items:flex-end; justify-content:space-between; padding:10px 14px; background:var(--cc-gold-lt); border-radius:var(--cc-r-md); margin-bottom:14px; gap:12px; min-width:0; width:100%; box-sizing:border-box; }
.rm-kaution-lbl { font-size:9px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:#9A6A2A; margin-bottom:2px; }
.rm-kaution-rule { font-size:11px; color:#7A5A2A; }
.rm-fields-title { font-size:9px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-taupe); margin-bottom:10px; margin-top:6px; }
.rm-field { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
.rm-field:last-child { margin-bottom:0; }
.rm-field label { font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:var(--cc-taupe); }
.rm-input { width:100%; min-height:30px; padding:4px 10px; background:var(--cc-bg); border:var(--cc-border); border-radius:var(--cc-r-md); font-family:inherit; font-size:16px; font-weight:300; color:var(--cc-charcoal); outline:none; box-sizing:border-box; -webkit-appearance:none; }
.rm-input:focus { border-color:var(--cc-charcoal); }
.rm-input::placeholder { color:var(--cc-stone); }
.rm-field-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.rm-field-row .rm-field { margin-bottom:0; }
.rm-field--toggle { background:var(--cc-bg); border:var(--cc-border); border-radius:var(--cc-r-md); padding:10px 12px; margin-bottom:10px; }
.rm-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.rm-toggle-label { font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:var(--cc-taupe); margin-bottom:2px; }
.rm-toggle-sub { font-size:12px; color:var(--cc-stone); }
.rm-pill-toggle { display:flex; align-items:center; gap:8px; background:none; border:none; cursor:pointer; padding:0; flex-shrink:0; }
.rm-pill-toggle__track { position:relative; width:40px; height:22px; background:var(--cc-stone); border-radius:11px; transition:background .2s; flex-shrink:0; }
.rm-pill-toggle[data-mode="voll"] .rm-pill-toggle__track,
.rm-pill-toggle[data-mode="befristet"] .rm-pill-toggle__track { background:var(--cc-charcoal); }
.rm-pill-toggle__knob { position:absolute; top:3px; left:3px; width:16px; height:16px; background:#fff; border-radius:50%; transition:transform .2s; }
.rm-pill-toggle[data-mode="voll"] .rm-pill-toggle__knob,
.rm-pill-toggle[data-mode="befristet"] .rm-pill-toggle__knob { transform:translateX(18px); }
.rm-pill-toggle__lbl { font-size:12px; font-weight:500; color:var(--cc-charcoal); min-width:52px; }

/* Zähler table in modal */
.rm-zaehler-table { width:100%; border-collapse:collapse; margin-bottom:14px; }
.rm-zaehler-table th { font-size:9px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-stone); border-bottom:.5px solid var(--cc-rule); padding:3px 0 6px; text-align:left; }
.rm-zaehler-table td { font-size:12px; color:var(--cc-charcoal); padding:6px 0; border-bottom:.5px solid var(--cc-surface); vertical-align:middle; }
.rm-zaehler-table tr:last-child td { border-bottom:none; }
.rm-zaehler-nr { font-family:'Courier New',monospace; font-size:10px; color:var(--cc-stone); }
.rm-zaehler-input { width:100%; min-height:34px; padding:6px 10px; background:var(--cc-bg); border:var(--cc-border); border-radius:6px; font-family:inherit; font-size:13px; color:var(--cc-charcoal); outline:none; }
.rm-zaehler-input:focus { border-color:var(--cc-charcoal); }
.rm-zaehler-input::placeholder { color:var(--cc-stone); }

/* Kaution fälligkeit pills */
.rm-fael-btn { font-size:11px; padding:4px 10px; border-radius:20px; border:.5px solid var(--cc-rule); background:none; cursor:pointer; font-family:inherit; color:var(--cc-charcoal); }
.rm-fael-btn.active { border-color:var(--cc-charcoal); background:var(--cc-charcoal); color:#fff; }

/* Inventar modal */
.inv-list { display:flex; flex-direction:column; border:var(--cc-border); border-radius:var(--cc-r-md); overflow:hidden; margin-bottom:8px; }
.inv-row { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:.5px solid var(--cc-rule); background:var(--cc-bg); }
.inv-row:last-child { border-bottom:none; }
.inv-name { flex:1; min-height:32px; background:transparent; border:none; font-family:inherit; font-size:13px; color:var(--cc-charcoal); outline:none; }
.inv-qty { width:48px; min-height:32px; background:var(--cc-white); border:var(--cc-border); border-radius:6px; text-align:center; font-family:inherit; font-size:13px; color:var(--cc-charcoal); outline:none; }
.inv-rm { width:24px; height:24px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:var(--cc-stone); font-size:13px; flex-shrink:0; cursor:pointer; }
.inv-rm:hover { color:#C4705A; }
.inv-add-btn { display:flex; align-items:center; gap:6px; width:100%; min-height:36px; padding:0 12px; background:var(--cc-white); border:.5px dashed var(--cc-rule); border-radius:var(--cc-r-md); font-size:11px; font-weight:500; letter-spacing:.07em; text-transform:uppercase; color:var(--cc-taupe); cursor:pointer; font-family:inherit; }

/* Confirm dialog */
.rm-confirm-overlay { display:none; position:fixed; inset:0; z-index:600; background:rgba(30,27,24,.3); backdrop-filter:blur(3px); align-items:center; justify-content:center; padding:24px; }
.rm-confirm-overlay.open { display:flex; }
.rm-confirm-box { background:var(--cc-white); border-radius:var(--cc-r-lg); padding:28px 24px 24px; max-width:320px; width:100%; box-shadow:0 24px 60px rgba(30,27,24,.18); animation:confirmPop .2s cubic-bezier(.32,.72,0,1); }
@keyframes confirmPop { from{transform:scale(.94);opacity:0;} to{transform:scale(1);opacity:1;} }
.rm-confirm-icon { font-size:28px; color:#C4705A; margin-bottom:12px; }
.rm-confirm-title { font-family:'Cormorant Garamond',Georgia,serif; font-size:20px; font-weight:400; color:var(--cc-ink); margin-bottom:6px; }
.rm-confirm-body { font-size:13px; color:var(--cc-taupe); line-height:1.6; margin-bottom:20px; }
.rm-confirm-btns { display:flex; align-items:center; gap:10px; }
.rm-btn--danger { flex:1; height:48px; background:#C4705A; color:var(--cc-white); border:none; border-radius:var(--cc-r-md); font-size:13px; font-weight:500; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; font-family:inherit; }

/* Coming soon placeholder */
.rm-coming-soon { display:flex; flex-direction:column; align-items:center; text-align:center; padding:32px 20px; }
.rm-coming-soon i { font-size:36px; color:var(--cc-stone); margin-bottom:12px; }
.rm-coming-soon h3 { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:300; color:var(--cc-ink); margin-bottom:6px; }
.rm-coming-soon p { font-size:13px; color:var(--cc-taupe); line-height:1.6; }

/* ── RESPONSIVE ── */

/* iPad (768px+) and Desktop (1024px+): modals centered, not bottom-sheet */
@media(min-width:701px) {
  /* Modal: center-aligned dialog instead of bottom sheet */
  .rm-overlay { align-items:center; }
  .rm-sheet {
    border-radius:var(--cc-r-lg) !important;
    max-height:82vh !important;
    max-height:82dvh !important;
    width:calc(100% - 48px);
    max-width:560px;
  }
  .rm-sheet--tall {
    max-height:88vh !important;
    max-height:88dvh !important;
  }
  /* Card list: single column on all screens (matches rooms tab) */
  /* Summary bar wider */
  .rp-summary { margin-bottom:16px; }
  /* Card headers */
  .apt-hdr { padding:16px 18px; }
  .apt-actions { padding:10px 16px; }
  /* 2-col field rows in modals on wider screens */
  .rm-field-row { grid-template-columns:1fr 1fr; }
}

/* Desktop (1024px+): wider modal */
@media(min-width:1024px) {
  .rm-sheet {
    max-width:600px;
  }
}

/* iOS PWA safe areas — handle notch/home-indicator */
@supports (padding: env(safe-area-inset-bottom)) {
  .rm-sheet__footer {
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
}

/* ── HAUSGELD HISTORY ── */
.apt-hg-sec { border-bottom:var(--cc-border); }
.apt-hg-body { padding:10px 14px 0; }
.apt-hg-header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.apt-hg-lbl { font-size:9px; font-weight:500; letter-spacing:.11em; text-transform:uppercase; color:var(--cc-taupe); flex:1; }
.apt-hg-verlauf-btn { font-size:10px; color:var(--cc-stone); text-decoration:underline; text-underline-offset:2px; background:none; border:none; cursor:pointer; font-family:inherit; padding:0; -webkit-tap-highlight-color:transparent; }
.apt-hg-add-btn { display:inline-flex; align-items:center; gap:4px; border-radius:var(--cc-r-pill); font-weight:500; font-family:inherit; cursor:pointer; height:24px; padding:0 9px; font-size:10px; border:.5px solid var(--cc-rule); background:none; color:var(--cc-taupe); }
.apt-hg-current { display:flex; align-items:center; gap:8px; padding:7px 10px; background:var(--cc-surface); border-radius:var(--cc-r-sm); margin-bottom:10px; }
.apt-hg-cur-amount { font-size:13px; font-weight:500; color:var(--cc-charcoal); flex:1; }
.apt-hg-cur-since { font-size:10px; color:var(--cc-stone); white-space:nowrap; }
.apt-hg-row { display:flex; flex-direction:column; gap:6px; padding:8px 0; border-bottom:var(--cc-border); }
.apt-hg-row:last-of-type { border-bottom:none; }
.apt-hg-row-top { display:flex; align-items:center; gap:8px; }
.apt-hg-date { font-size:11px; color:var(--cc-taupe); flex:1; }
.apt-hg-amount { font-size:13px; font-weight:500; color:var(--cc-charcoal); }
.apt-hg-amount.past { font-weight:400; color:var(--cc-stone); }
.apt-hg-pills { display:flex; gap:5px; flex-wrap:wrap; padding-left:20px; }
.apt-hg-pill { display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:500; padding:2px 8px; border-radius:var(--cc-r-pill); white-space:nowrap; cursor:default; font-family:inherit; border:none; }
.apt-hg-pill.done { background:#EAF3DE; color:#27500A; }
.apt-hg-pill.pending { background:var(--cc-surface); color:var(--cc-stone); border:.5px solid var(--cc-rule); cursor:pointer; -webkit-tap-highlight-color:transparent; }
.apt-hg-pill.pending:active { opacity:.7; }
.apt-hg-pill i { font-size:10px; }
.apt-hg-add-form { display:flex; align-items:center; gap:6px; padding-top:8px; border-top:var(--cc-border); margin-top:4px; flex-wrap:wrap; padding-bottom:10px; }
.apt-hg-add-form input { font-size:12px; padding:5px 8px; border-radius:var(--cc-r-sm); border:.5px solid var(--cc-gold); background:var(--cc-white); color:var(--cc-charcoal); font-family:inherit; outline:none; width:120px; }
.apt-hg-add-form input[type=number] { width:90px; }
.apt-hg-status-pill { display:inline-flex; align-items:center; gap:3px; font-size:9px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; padding:3px 8px; border-radius:var(--cc-r-pill); background:#FAEEDA; color:#633806; border:.5px solid #EF9F27; }
/* Mieter prefill pill toggle (shared with Casa Castel pattern) */
.ub-mieter-pill { position:relative; width:44px; height:26px; background:var(--cc-ink); border-radius:13px; cursor:pointer; transition:background .25s; flex-shrink:0; }
.ub-mieter-pill[data-state="manual"] { background:var(--cc-rule); }
.ub-mieter-pill__knob { position:absolute; top:3px; left:3px; width:20px; height:20px; background:#ffffff; border-radius:50%; box-shadow:0 1px 4px rgba(0,0,0,0.18); transition:transform .25s cubic-bezier(.32,.72,0,1); }
.ub-mieter-pill[data-state="manual"] .ub-mieter-pill__knob { transform:translateX(18px); }
.rnt-group-hdr { font-size:9px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--cc-stone); padding:4px 2px 6px; margin-top:8px; }
.rnt-group-hdr:first-child { margin-top:0; }
  `;
  document.head.appendChild(s);
})();


/* ── HELPERS ─────────────────────────────────────────────── */
function aptEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* Resolve active tenant profile for an apartment — checks cache first,
   falls back to a direct Supabase query if tenants tab hasn't loaded yet. */
async function _aptResolveTenantProfile(aptId) {
  if (typeof _rntGetProfile === 'function') {
    const cached = _rntGetProfile(aptId);
    if (cached && (cached.firstName || cached.lastName)) return cached;
  }
  if (typeof sbL === 'undefined') return {};
  try {
    const { data } = await sbL
      .from('rnt_tenant_records')
      .select('first_name,last_name,email,phone,birthday,address')
      .eq('apartment_id', aptId)
      .eq('status', 'active')
      .order('mietbeginn', { ascending: false })
      .limit(1)
      .single();
    if (!data) return {};
    return {
      firstName: data.first_name || '',
      lastName:  data.last_name  || '',
      email:     data.email      || '',
      phone:     data.phone      || '',
      birthday:  data.birthday   || '',
      address:   data.address    || '',
    };
  } catch { return {}; }
}


/* Auto-insert dots while typing a German date: 13011992 → 13.01.1992
   Shared by apartments and parking tabs (apartments loads first). */
function _autoFormatGermanDate(e) {
  const input  = e.target;
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length > 4) out = digits.slice(0,2) + '.' + digits.slice(2,4) + '.' + digits.slice(4);
  else if (digits.length > 2) out = digits.slice(0,2) + '.' + digits.slice(2);
  if (input.value !== out) {
    input.value = out;
    try { input.setSelectionRange(out.length, out.length); } catch(_) {}
  }
}
function aptFmtEUR(n) {
  const num = Number(n);
  if (!num && num !== 0) return '—';
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function aptFmtEURCompact(n) {
  const num = Number(n);
  if (!num && num !== 0) return '—';
  // No decimals if whole number
  return num.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}


/* ── DATA STORE ──────────────────────────────────────────── */
let appApartments = [];     // array of apartment objects (joined from all tables)
let _aptSbClient  = null;   // set below after Supabase is confirmed
let _aptHausgeld  = {};     // apt_id → [{id, apt_id, effective_date, amount, weg_notified, notified_date, hv_adjusted, adjusted_date}]


/* ── LOAD ────────────────────────────────────────────────── */
async function loadApartments() {
  _aptSbClient = typeof sbL !== 'undefined' ? sbL : null;
  if (!_aptSbClient) { console.warn('[apartments] No Supabase client'); _renderAptList(); return; }

  try {
    const [
      { data: apts },
      { data: pricing },
      { data: verwaltung },
      { data: zaehler },
      { data: schlussel },
      { data: inventar },
      { data: hausgeld },
    ] = await Promise.all([
      _aptSbClient.from('rentals_apartments').select('*').order('sort_order'),
      _aptSbClient.from('rentals_pricing').select('*'),
      _aptSbClient.from('rentals_verwaltung').select('*'),
      _aptSbClient.from('rentals_zaehler').select('*').order('sort_order'),
      _aptSbClient.from('rentals_schlussel').select('*'),
      _aptSbClient.from('rentals_inventar').select('*').order('sort_order'),
      _aptSbClient.from('rentals_hausgeld_history').select('*').order('effective_date', { ascending: false }),
    ]);

    // Join all tables by apartment_id
    appApartments = (apts || []).map(a => ({
      ...a,
      pricing:    (pricing    || []).find(p => p.apartment_id === a.id) || {},
      verwaltung: (verwaltung || []).find(v => v.apartment_id === a.id) || {},
      zaehler:    (zaehler    || []).filter(z => z.apartment_id === a.id),
      schlussel:  (schlussel  || []).find(s => s.apartment_id === a.id) || {},
      inventar:   (inventar   || []).filter(i => i.apartment_id === a.id),
    }));

    // Build hausgeld store keyed by apt_id, already DESC from DB
    _aptHausgeld = {};
    (hausgeld || []).forEach(e => {
      if (!_aptHausgeld[e.apt_id]) _aptHausgeld[e.apt_id] = [];
      _aptHausgeld[e.apt_id].push(e);
    });
  } catch(e) {
    console.error('[apartments] Load failed:', e);
  }

  _renderAptList();
  _aptInitSortable();
}


/* ── RENDER LIST ─────────────────────────────────────────── */
function _updateAptSummary() {
  const bar = document.getElementById('aptSummary');
  const bd  = document.getElementById('aptSummaryBreakdown');
  const tot = document.getElementById('aptSummaryTotal');
  if (!bar) return;
  if (!appApartments.length) { bar.style.display = 'none'; return; }

  let kalt = 0, nk = 0, occupied = 0;
  appApartments.forEach(a => {
    if (a.vacant) return;
    occupied++;
    kalt += Number(a.pricing?.kaltmiete) || 0;
    nk   += Number(a.pricing?.nk_pauschale) || 0;
  });

  bar.style.display = 'flex';
  bd.textContent  = occupied + ' / ' + appApartments.length + ' belegt · ' + aptFmtEURCompact(nk) + ' NK separat';
  tot.textContent = aptFmtEURCompact(kalt);
}

function _renderAptList() {
  const list = document.getElementById('aptList');
  if (!list) return;
  if (!appApartments.length) {
    list.innerHTML = `<p style="font-size:13px;color:var(--cc-stone);font-style:italic;padding:20px 0">No apartments yet. Add your first apartment.</p>`;
    _updateAptSummary();
    return;
  }
  const wohnungen  = appApartments.filter(a => a.zimmer_type !== 'Gewerbefläche');
  const gewerbe    = appApartments.filter(a => a.zimmer_type === 'Gewerbefläche');
  const bothExist  = wohnungen.length && gewerbe.length;
  let html = '';
  if (wohnungen.length) {
    if (bothExist) html += `<div class="rnt-group-hdr">Wohnungen</div>`;
    html += wohnungen.map(a => _aptCardHTML(a)).join('');
  }
  if (gewerbe.length) {
    if (bothExist) html += `<div class="rnt-group-hdr" style="margin-top:16px;">Gewerbeflächen</div>`;
    html += gewerbe.map(a => _aptCardHTML(a)).join('');
  }
  list.innerHTML = html;
  _updateAptSummary();
}


/* ── CARD HTML ───────────────────────────────────────────── */
function _aptCardHTML(a) {
  const p  = a.pricing    || {};
  const v  = a.verwaltung || {};
  const sk = a.schlussel  || {};
  const zaehler  = a.zaehler  || [];
  const inventar = a.inventar || [];
  const vacant   = a.vacant;

  // Header rent line
  const kalt = Number(p.kaltmiete) || 0;
  const nk   = Number(p.nk_pauschale) || 0;
  const warm = kalt + nk;
  const rentHTML = (kalt || nk)
    ? `<strong>${aptFmtEURCompact(warm)}</strong> warm · ${aptFmtEURCompact(kalt)} + ${aptFmtEURCompact(nk)} NK`
    : `<span class="apt-hdr__rent--vacant">No pricing set</span>`;

  // Kaution
  const kautionAmt = (p.kaution_default !== null && p.kaution_default !== undefined && p.kaution_default !== '')
    ? Number(p.kaution_default)
    : kalt * 3;

  // Kurzzeit
  const kzKalt = Number(p.kurzzeit_kaltmiete) || 0;
  const kzNk   = Number(p.kurzzeit_nk) || 0;
  const kzWarm = kzKalt + kzNk;
  const kzKaution = p.kaution_override && p.kaution_default ? Number(p.kaution_default) : kzKalt;

  // Zähler grouped by type category
  const meterGroups = _groupZaehler(zaehler);

  // Inventar count
  const invCount = inventar.length;

  // Hausgeld helpers
  const hgEntries = _aptHausgeld[a.id] || [];
  const hgHasOpen = hgEntries.some(e => !e.weg_notified);
  const hgPendingEntry = hgHasOpen ? hgEntries.find(e => !e.weg_notified) : null;

  return `
<div class="apt-card${vacant ? '' : ''}" data-id="${a.id}" data-name="${aptEsc(a.name)}">

  <!-- HEADER -->
  <div class="apt-hdr" onclick="if(!event.target.closest('.apt-drag'))_aptToggle(this.closest('.apt-card'))">
    <i class="ti ti-grip-vertical apt-drag"></i>
    <div class="apt-hdr__info">
      <div class="apt-hdr__namerow">
        <span class="apt-hdr__name">${aptEsc(a.name)}</span>
        <span class="apt-status-badge ${vacant ? 'apt-status--vacant' : 'apt-status--occupied'}">
          ${vacant ? 'Vacant' : 'Occupied'}
        </span>
      </div>
      ${a.adresse ? `<div class="apt-hdr__addr">${aptEsc(a.adresse)}</div>` : ''}
      <div class="apt-hdr__tags">
        ${a.zimmer_type ? `<span class="apt-tag ${a.zimmer_type === 'Gewerbefläche' ? 'apt-tag--gew' : 'apt-tag--apt'}">${aptEsc(a.zimmer_type)}</span>` : ''}
      </div>
      <div class="apt-hdr__rent">${rentHTML}</div>
      ${hgHasOpen && hgPendingEntry ? `<div class="apt-hdr__pills" style="margin-top:5px"><span class="apt-hg-status-pill"><i class="ti ti-alert-triangle" style="font-size:9px" aria-hidden="true"></i> Hausgeld +${aptFmtEURCompact(hgPendingEntry.amount)}</span></div>` : ''}
    </div>
    <i class="ti ti-chevron-right apt-chevron"></i>
  </div>

  <!-- BODY -->
  <div class="apt-body">

    <!-- Status action -->
    <div class="apt-actions">
      <button class="apt-act ${vacant ? 'apt-act--mark-occupied' : 'apt-act--mark-vacant'}"
        onclick="_aptToggleVacant('${a.id}',this)">
        <i class="ti ${vacant ? 'ti-door-enter' : 'ti-door-exit'}" style="font-size:11px"></i>
        ${vacant ? 'Mark as Occupied' : 'Mark as Vacant'}
      </button>
    </div>

    <!-- 1. IDENTITY -->
    <div class="apt-section" id="apt-identity-${a.id}">
      <div class="apt-stitle">Identity</div>
      <!-- READ -->
      <div class="apt-sec-read">
        <div class="apt-row"><span class="apt-row__k">Name</span><span class="apt-row__v">${aptEsc(a.name)}</span></div>
        <div class="apt-row"><span class="apt-row__k">Adresse</span><span class="apt-row__v">${aptEsc(a.adresse || '—')}</span></div>
        <div class="apt-row"><span class="apt-row__k">PLZ / Ort</span><span class="apt-row__v">${aptEsc(a.plz_ort || '—')}</span></div>
        <div class="apt-row"><span class="apt-row__k">Gerichtsstand</span><span class="apt-row__v">${aptEsc(a.gerichtsstand || '—')}</span></div>
        <div class="apt-row"><span class="apt-row__k">Unterzeichnung</span><span class="apt-row__v">${aptEsc(a.unterschrift_ort || '—')}</span></div>
        <div class="apt-row"><span class="apt-row__k">Heizungsart</span><span class="apt-row__v">${aptEsc(a.heizungsart || '—')}</span></div>
        <div class="apt-row"><span class="apt-row__k">Rooms</span><span class="apt-row__v">${aptEsc(a.zimmer_type || '—')}</span></div>
        <div class="apt-row"><span class="apt-row__k">Floor</span><span class="apt-row__v">${aptEsc(a.floor || '—')}</span></div>
        <div class="apt-row"><span class="apt-row__k">Size</span><span class="apt-row__v">${a.flaeche_m2 ? a.flaeche_m2 + ' m²' : '—'}</span></div>
        <div class="apt-row"><span class="apt-row__k">Energieklasse</span><span class="apt-row__v">${aptEsc(a.energieklasse || '—')}</span></div>
        <div class="apt-section-edit">
          <button class="apt-sec-edit-btn" onclick="_aptEnterSection('identity','${a.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT (hidden) -->
      <div class="apt-sec-edit" style="display:none">
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Name</div><input class="apt-input" data-f="name" value="${aptEsc(a.name)}"/></div>
          <div class="apt-field"><div class="apt-field__label">Floor</div><input class="apt-input" data-f="floor" value="${aptEsc(a.floor||'')}"/></div>
        </div>
        <div class="apt-field"><div class="apt-field__label">Adresse</div><input class="apt-input" data-f="adresse" value="${aptEsc(a.adresse||'')}"/></div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">PLZ / Ort</div><input class="apt-input" data-f="plz_ort" value="${aptEsc(a.plz_ort||'')}" placeholder="55246 Mainz-Kostheim"/></div>
          <div class="apt-field"><div class="apt-field__label">Gerichtsstand</div><input class="apt-input" data-f="gerichtsstand" value="${aptEsc(a.gerichtsstand||'')}" placeholder="z.B. Wiesbaden"/></div>
        </div>
        <div class="apt-field"><div class="apt-field__label">Unterzeichnungsort</div><input class="apt-input" data-f="unterschrift_ort" value="${aptEsc(a.unterschrift_ort||'')}" placeholder="z.B. Wiesbaden"/></div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Size m²</div><input class="apt-input" type="number" data-f="flaeche_m2" value="${a.flaeche_m2||''}"/></div>
          <div class="apt-field"><div class="apt-field__label">Rooms</div>
            <select class="apt-input" data-f="zimmer_type">
              ${['1 Zimmer','2 Zimmer','3 Zimmer','4 Zimmer','Gewerbefläche'].map(t =>
                `<option ${a.zimmer_type===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="apt-field"><div class="apt-field__label">Heizungsart</div>
          <select class="apt-input" data-f="heizungsart">
            ${['Zentralheizung','Fernwärme','Etagenheizung'].map(t =>
              `<option ${a.heizungsart===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Energieklasse</div><input class="apt-input" data-f="energieklasse" value="${aptEsc(a.energieklasse||'')}" placeholder="z.B. C"/></div>
          <div class="apt-field"><div class="apt-field__label">Endenergiebedarf</div><input class="apt-input" data-f="endenergiebedarf" value="${aptEsc(a.endenergiebedarf||'')}" placeholder="kWh/m²·a"/></div>
        </div>
        <div class="apt-field"><div class="apt-field__label">Energieausweisart</div><input class="apt-input" data-f="energieausweisart" value="${aptEsc(a.energieausweisart||'')}" placeholder="Bedarfsausweis / Verbrauchsausweis"/></div>
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_aptCancelSection('identity','${a.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_aptSaveIdentity('${a.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 2. MIETE -->
    <div class="apt-section--miete" id="apt-miete-${a.id}">
      <div class="apt-stitle">Miete</div>
      <!-- READ -->
      <div class="apt-sec-read">
        ${kalt || nk ? `
        <div class="apt-row"><span class="apt-row__k">${a.zimmer_type === 'Gewerbefläche' ? 'Gewerbemiete' : 'Mietvertrag'}</span><span class="apt-row__v apt-row__v--gold">${aptFmtEURCompact(kalt)} kalt + ${aptFmtEURCompact(nk)} NK</span></div>
        <div class="apt-row"><span class="apt-row__k" style="padding-left:8px;color:var(--cc-stone)">↳ Kaution</span><span class="apt-row__v apt-row__v--muted">${aptFmtEURCompact(kautionAmt)} · 3× Kalt${p.kaution_override ? ' (override)' : ''}</span></div>
        ` : `<div class="apt-row"><span class="apt-row__v" style="color:var(--cc-stone);font-style:italic">Not set</span></div>`}
        ${kzKalt ? `
        <div class="apt-row" style="margin-top:6px"><span class="apt-row__k">Kurzzeit</span><span class="apt-row__v">${aptFmtEURCompact(kzWarm)} / Monat</span></div>
        <div class="apt-row"><span class="apt-row__k" style="padding-left:8px;color:var(--cc-stone)">↳ Kaution</span><span class="apt-row__v apt-row__v--muted">${aptFmtEURCompact(kzKaution)} · 1× Kalt</span></div>
        ` : ''}
        <div class="apt-section-edit">
          <button class="apt-sec-edit-btn" onclick="_aptEnterSection('miete','${a.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT -->
      <div class="apt-sec-edit" style="display:none">
        <div class="apt-stitle" style="margin-top:2px">Mietvertrag</div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Kaltmiete (€)</div><input class="apt-input" type="number" data-f="kaltmiete" value="${p.kaltmiete||''}"/></div>
          <div class="apt-field"><div class="apt-field__label">Nebenkosten (€)</div><input class="apt-input" type="number" data-f="nk_pauschale" value="${p.nk_pauschale||''}"/></div>
        </div>
        <div class="apt-toggle-row">
          <span class="apt-tlabel">Custom Kaution</span>
          <label class="cc-sw"><input type="checkbox" data-f="kaution_override" ${p.kaution_override?'checked':''} onchange="_aptToggleKautionOverride(this)"/><span class="cc-sw__t"></span></label>
        </div>
        <div data-kautionfield style="${p.kaution_override?'':'display:none'}">
          <div class="apt-field"><div class="apt-field__label">Kaution (€)</div><input class="apt-input" type="number" data-f="kaution_default" value="${p.kaution_default||''}"/></div>
        </div>
        ${a.zimmer_type !== 'Gewerbefläche' ? `
        <div class="apt-stitle" style="margin-top:10px">Kurzzeit</div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Kaltmiete (€)</div><input class="apt-input" type="number" data-f="kurzzeit_kaltmiete" value="${p.kurzzeit_kaltmiete||''}"/></div>
          <div class="apt-field"><div class="apt-field__label">Nebenkosten (€)</div><input class="apt-input" type="number" data-f="kurzzeit_nk" value="${p.kurzzeit_nk||''}"/></div>
        </div>` : ''}
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_aptCancelSection('miete','${a.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_aptSaveMiete('${a.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 3. VERWALTUNG -->
    <div class="apt-section" id="apt-verwaltung-${a.id}">
      <div class="apt-stitle">Verwaltung & Kosten</div>
      <!-- READ -->
      <div class="apt-sec-read">
        ${v.hausverwaltung ? `<div class="apt-row"><span class="apt-row__k">Hausverwaltung</span><span class="apt-row__v">${aptEsc(v.hausverwaltung)}</span></div>` : ''}
        ${v.hv_email ? `<div class="apt-row"><span class="apt-row__k">E-Mail</span><span class="apt-row__v"><a class="apt-hv-link" href="mailto:${aptEsc(v.hv_email)}">${aptEsc(v.hv_email)}</a></span></div>` : ''}
        ${v.hv_telefon ? `<div class="apt-row"><span class="apt-row__k">Telefon</span><span class="apt-row__v">${aptEsc(v.hv_telefon)}</span></div>` : ''}
        ${v.hausgeld_mtl ? `<div class="apt-row" style="margin-top:6px"><span class="apt-row__k">Hausgeld</span><span class="apt-row__v">${aptFmtEURCompact(v.hausgeld_mtl)} / mtl.</span></div>` : ''}
        ${v.grundsteuer_mtl ? `<div class="apt-row"><span class="apt-row__k">Grundsteuer</span><span class="apt-row__v">${aptFmtEURCompact(v.grundsteuer_mtl)} / Quartal</span></div>` : ''}
        ${(v.abrechnung_von && v.abrechnung_bis) ? `<div class="apt-row"><span class="apt-row__k">Abrechnung</span><span class="apt-row__v">${aptEsc(v.abrechnung_von)} – ${aptEsc(v.abrechnung_bis)}${v.abrechnungsmonat ? ' · ' + aptEsc(v.abrechnungsmonat) : ''}</span></div>` : ''}
        ${v.strom_provider ? `<div class="apt-row"><span class="apt-row__k">Strom Provider</span><span class="apt-row__v">${aptEsc(v.strom_provider)}</span></div>` : ''}
        ${!v.hausverwaltung && !v.hausgeld_mtl ? `<div class="apt-row"><span class="apt-row__v" style="color:var(--cc-stone);font-style:italic">Not set</span></div>` : ''}
        <div class="apt-section-edit">
          <button class="apt-sec-edit-btn" onclick="_aptEnterSection('verwaltung','${a.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT -->
      <div class="apt-sec-edit" style="display:none">
        <div class="apt-field"><div class="apt-field__label">Hausverwaltung</div><input class="apt-input" data-vf="hausverwaltung" value="${aptEsc(v.hausverwaltung||'')}"/></div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">E-Mail</div><input class="apt-input" type="email" data-vf="hv_email" value="${aptEsc(v.hv_email||'')}"/></div>
          <div class="apt-field"><div class="apt-field__label">Telefon</div><input class="apt-input" type="tel" data-vf="hv_telefon" value="${aptEsc(v.hv_telefon||'')}"/></div>
        </div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Hausgeld (€/mtl)</div><input class="apt-input" type="number" data-vf="hausgeld_mtl" value="${v.hausgeld_mtl||''}"/></div>
          <div class="apt-field"><div class="apt-field__label">Grundsteuer (€/Quartal)</div><input class="apt-input" type="number" data-vf="grundsteuer_mtl" value="${v.grundsteuer_mtl||''}"/></div>
        </div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Abrechnung von</div><input class="apt-input" data-vf="abrechnung_von" value="${aptEsc(v.abrechnung_von||'')}" placeholder="01.01."/></div>
          <div class="apt-field"><div class="apt-field__label">Abrechnung bis</div><input class="apt-input" data-vf="abrechnung_bis" value="${aptEsc(v.abrechnung_bis||'')}" placeholder="31.12."/></div>
        </div>
        <div class="apt-field-row">
          <div class="apt-field"><div class="apt-field__label">Abrechnungsmonat</div><input class="apt-input" data-vf="abrechnungsmonat" value="${aptEsc(v.abrechnungsmonat||'')}" placeholder="März"/></div>
          <div class="apt-field"><div class="apt-field__label">Strom Provider</div><input class="apt-input" data-vf="strom_provider" value="${aptEsc(v.strom_provider||'')}"/></div>
        </div>
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_aptCancelSection('verwaltung','${a.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_aptSaveVerwaltung('${a.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 3b. HAUSGELD HISTORY -->
    ${_aptHGSectionHTML(a.id)}

    <!-- 4. ZÄHLER -->
    <div class="apt-section" id="apt-zaehler-${a.id}">
      <div class="apt-stitle">Zähler</div>
      <!-- READ -->
      <div class="apt-sec-read">
        ${meterGroups.length ? meterGroups.map(g => `
          <div class="apt-meter-group">
            <div class="apt-meter-group__title"><i class="ti ${g.icon}"></i> ${g.label}</div>
            ${g.meters.map(m => `
              <div class="apt-row">
                <span class="apt-row__k">${aptEsc(m.subLabel || 'Nr.')}</span>
                <span class="apt-row__v apt-row__v--mono">${aptEsc(m.zaehler_nr || '—')}</span>
              </div>`).join('')}
          </div>`).join('')
        : `<div class="apt-row"><span class="apt-row__v" style="color:var(--cc-stone);font-style:italic">Not set</span></div>`}
        <div class="apt-section-edit">
          <button class="apt-sec-edit-btn" onclick="_aptEnterSection('zaehler','${a.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT -->
      <div class="apt-sec-edit" style="display:none">
        <div id="apt-zaehler-edit-rows-${a.id}">
          ${zaehler.map(z => `
            <div class="apt-field-row" data-zaehler-id="${z.id}">
              <div class="apt-field">
                <div class="apt-field__label">${aptEsc(z.typ)}</div>
                <input class="apt-input apt-input--mono" data-zf="zaehler_nr" value="${aptEsc(z.zaehler_nr||'')}"/>
              </div>
              <div class="apt-field" style="justify-content:flex-end;padding-top:18px">
                <button onclick="this.closest('[data-zaehler-id]').remove()" style="width:32px;height:32px;background:none;border:.5px solid var(--cc-rule);border-radius:6px;cursor:pointer;color:var(--cc-stone);display:flex;align-items:center;justify-content:center">
                  <i class="ti ti-trash" style="font-size:12px"></i>
                </button>
              </div>
            </div>`).join('')}
        </div>
        <button onclick="_aptAddZaehlerRow('${a.id}')" style="display:flex;align-items:center;gap:6px;width:100%;min-height:36px;padding:0 12px;background:var(--cc-white);border:.5px dashed var(--cc-rule);border-radius:var(--cc-r-md);font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--cc-taupe);cursor:pointer;font-family:inherit;margin-top:8px;">
          <i class="ti ti-plus"></i> Add meter
        </button>
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_aptCancelSection('zaehler','${a.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_aptSaveZaehler('${a.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 5. SCHLÜSSEL -->
    <div class="apt-section" id="apt-schlussel-${a.id}">
      <div class="apt-stitle">Schlüssel</div>
      <!-- READ -->
      <div class="apt-sec-read">
        <div class="apt-keys">
          <div class="apt-key"><i class="ti ti-home"></i> Haustür ×${sk.haustuerschluessel ?? 1}</div>
          <div class="apt-key"><i class="ti ti-key"></i> ${a.zimmer_type === 'Gewerbefläche' ? 'Mietfläche' : 'Wohnung'} ×${sk.wohnungsschluessel ?? 1}</div>
          ${(sk.briefkastenschluessel > 0) ? `<div class="apt-key"><i class="ti ti-mail"></i> Briefkasten ×${sk.briefkastenschluessel}</div>` : ''}
        </div>
        <div class="apt-section-edit">
          <button class="apt-sec-edit-btn" onclick="_aptEnterSection('schlussel','${a.id}')">
            <i class="ti ti-pencil" style="font-size:10px"></i> Edit
          </button>
        </div>
      </div>
      <!-- EDIT -->
      <div class="apt-sec-edit" style="display:none">
        <div class="apt-field-row">
          <div class="apt-field">
            <div class="apt-field__label">Haustür</div>
            <div class="apt-stepper">
              <button onclick="_aptStep(this,-1)">−</button>
              <span class="apt-stepper__v" data-sf="haustuerschluessel">${sk.haustuerschluessel ?? 1}</span>
              <button onclick="_aptStep(this,1)">+</button>
            </div>
          </div>
          <div class="apt-field">
            <div class="apt-field__label">${a.zimmer_type === 'Gewerbefläche' ? 'Mietfläche' : 'Wohnung'}</div>
            <div class="apt-stepper">
              <button onclick="_aptStep(this,-1)">−</button>
              <span class="apt-stepper__v" data-sf="wohnungsschluessel">${sk.wohnungsschluessel ?? 1}</span>
              <button onclick="_aptStep(this,1)">+</button>
            </div>
          </div>
        </div>
        <div class="apt-field">
          <div class="apt-field__label">Briefkasten</div>
          <div class="apt-stepper">
            <button onclick="_aptStep(this,-1)">−</button>
            <span class="apt-stepper__v" data-sf="briefkastenschluessel">${sk.briefkastenschluessel ?? 0}</span>
            <button onclick="_aptStep(this,1)">+</button>
          </div>
        </div>
        <div class="apt-save-row">
          <button class="apt-btn--cancel" onclick="_aptCancelSection('schlussel','${a.id}')">Cancel</button>
          <button class="apt-btn--save" onclick="_aptSaveSchlussel('${a.id}')">Save</button>
        </div>
      </div>
    </div>

    <!-- 6. INVENTAR -->
    <div class="apt-inv-row">
      <div>
        <div class="apt-inv-label">Inventar · Anlage A</div>
        <div class="apt-inv-count">${invCount} ${invCount === 1 ? 'Gegenstand' : 'Gegenstände'}</div>
      </div>
      <button class="apt-inv-btn" onclick="_aptOpenInventar('${a.id}')">
        <i class="ti ti-list"></i> Edit
      </button>
    </div>

    <!-- 7. CONTRACTS -->
    <div class="apt-contracts">
      <div class="apt-contracts-title">Contracts</div>
      ${a.zimmer_type !== 'Gewerbefläche' ? `
      <div class="apt-doc-row">
        <button class="apt-doc-btn" onclick="_aptOpenContract('kurzzeit','${a.id}')">
          Kurzzeitmiete <i class="ti ti-chevron-right"></i>
        </button>
      </div>` : ''}
      <div class="apt-doc-row">
        <button class="apt-doc-btn" onclick="_aptOpenContract('mietvertrag','${a.id}')">
          ${a.zimmer_type === 'Gewerbefläche' ? 'Gewerbemietvertrag' : 'Mietvertrag'} <i class="ti ti-chevron-right"></i>
        </button>
      </div>
      <div class="apt-doc-row">
        <button class="apt-doc-btn" onclick="_aptOpenContract('ueberg','${a.id}')">
          Übergabeprotokoll <i class="ti ti-chevron-right"></i>
        </button>
        <div class="apt-doc-toggle" id="apt-eu-${a.id}">
          <button class="active" onclick="event.stopPropagation();_aptSetEU('${a.id}',0,this)">Einzug</button>
          <button onclick="event.stopPropagation();_aptSetEU('${a.id}',1,this)">Auszug</button>
        </div>
      </div>
    </div>

    <!-- FOOTER: delete -->
    <div class="apt-card-footer">
      <button class="apt-delete-btn" onclick="_aptConfirmDelete('${a.id}','${aptEsc(a.name)}')">
        <i class="ti ti-trash"></i> ${a.zimmer_type === 'Gewerbefläche' ? 'Delete Gewerbefläche' : 'Delete apartment'}
      </button>
    </div>

  </div>
</div>`;
}


/* ── METER GROUPING HELPER ───────────────────────────────── */
function _groupZaehler(zaehler) {
  const categories = [
    { key: 'Strom',       icon: 'ti-bolt',          label: 'Strom',       types: ['Strom'] },
    { key: 'Gas',         icon: 'ti-flame',          label: 'Gas',         types: ['Gas'] },
    { key: 'Heizung',     icon: 'ti-flame',          label: 'Heizung',     types: ['Heizung Bad','Heizung 1','Heizung 2','Heizung 3'] },
    { key: 'Warmwasser',  icon: 'ti-droplet',        label: 'Warmwasser',  types: ['Warmwasser','Warmwasser Bad','Warmwasser Küche'] },
    { key: 'Kaltwasser',  icon: 'ti-droplet-half-2', label: 'Kaltwasser',  types: ['Kaltwasser','Kaltwasser Bad','Kaltwasser Küche'] },
    { key: 'Wasser',      icon: 'ti-droplet',        label: 'Wasser',      types: ['Wasser'] },
  ];

  const groups = [];
  categories.forEach(cat => {
    const meters = zaehler.filter(z => cat.types.includes(z.typ));
    if (!meters.length) return;
    groups.push({
      label: cat.label,
      icon:  cat.icon,
      meters: meters.map(m => ({
        ...m,
        subLabel: meters.length === 1 ? 'Nr.' : m.typ,
      })),
    });
  });
  return groups;
}


/* ── CARD INTERACTIONS ───────────────────────────────────── */
function _aptToggle(card) {
  card.classList.toggle('apt--open');
  if (card.classList.contains('apt--open')) {
    requestAnimationFrame(() => {
      const top    = card.getBoundingClientRect().top + window.scrollY;
      const header = document.querySelector('.cc-header')?.offsetHeight || 100;
      window.scrollTo({ top: top - header - 8, behavior: 'smooth' });
    });
  }
}

function _aptSetEU(aptId, idx, btn) {
  const tog = document.getElementById('apt-eu-' + aptId);
  if (!tog) return;
  tog.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === idx));
}


/* ── SECTION EDIT ────────────────────────────────────────── */
function _aptEnterSection(section, aptId) {
  const el = document.getElementById(`apt-${section}-${aptId}`);
  if (!el) return;
  el.querySelector('.apt-sec-read').style.display = 'none';
  el.querySelector('.apt-sec-edit').style.display = '';
  el.classList.add('apt-edit-active');
  el.querySelector('.apt-input, .apt-stepper__v')?.focus?.();
}

function _aptCancelSection(section, aptId) {
  const el = document.getElementById(`apt-${section}-${aptId}`);
  if (!el) return;
  // Re-render just this card from memory to discard edits
  const apt = appApartments.find(a => a.id === aptId);
  if (!apt) return;
  const card = document.querySelector(`.apt-card[data-id="${aptId}"]`);
  if (!card) return;
  const wasOpen = card.classList.contains('apt--open');
  card.outerHTML = _aptCardHTML(apt);
  const newCard = document.querySelector(`.apt-card[data-id="${aptId}"]`);
  if (wasOpen && newCard) newCard.classList.add('apt--open');
}


/* ── SAVE: IDENTITY ──────────────────────────────────────── */
async function _aptSaveIdentity(aptId) {
  const el  = document.getElementById(`apt-identity-${aptId}`);
  const btn = el?.querySelector('.apt-btn--save');
  if (!btn) return;
  btn.textContent = '…'; btn.disabled = true;

  const data = {};
  el.querySelectorAll('[data-f]').forEach(inp => {
    const k = inp.dataset.f;
    data[k] = inp.type === 'number' ? (inp.value !== '' ? parseFloat(inp.value) : null) : inp.value;
  });

  if (_aptSbClient) {
    const { error } = await _aptSbClient.from('rentals_apartments').update(data).eq('id', aptId);
    if (error) {
      console.error('[apartments] Save identity failed:', error, data);
      alert('Save failed: ' + (error.message || JSON.stringify(error)));
      btn.textContent = 'Error'; btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000);
      return;
    }
  }

  // Update in-memory
  const apt = appApartments.find(a => a.id === aptId);
  if (apt) Object.assign(apt, data);

  _aptRerenderCard(aptId);
}


/* ── SAVE: MIETE ─────────────────────────────────────────── */
async function _aptSaveMiete(aptId) {
  const el  = document.getElementById(`apt-miete-${aptId}`);
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

  const apt = appApartments.find(a => a.id === aptId);
  if (!apt) return;

  if (_aptSbClient) {
    // Upsert pricing row
    const pricingId = apt.pricing?.id;
    let error;
    if (pricingId) {
      ({ error } = await _aptSbClient.from('rentals_pricing').update(data).eq('id', pricingId));
    } else {
      const res = await _aptSbClient.from('rentals_pricing').insert({ apartment_id: aptId, ...data }).select().single();
      error = res.error;
      if (!error) apt.pricing = res.data;
    }
    if (error) {
      console.error('[apartments] Save miete failed:', error, data);
      btn.textContent = 'Error'; btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000);
      return;
    }
  }

  if (apt.pricing) Object.assign(apt.pricing, data);
  else apt.pricing = data;

  _aptRerenderCard(aptId);
}


/* ── SAVE: VERWALTUNG ────────────────────────────────────── */
async function _aptSaveVerwaltung(aptId) {
  const el  = document.getElementById(`apt-verwaltung-${aptId}`);
  const btn = el?.querySelector('.apt-btn--save');
  if (!btn) return;
  btn.textContent = '…'; btn.disabled = true;

  const data = {};
  el.querySelectorAll('[data-vf]').forEach(inp => {
    const k = inp.dataset.vf;
    data[k] = inp.type === 'number' ? (inp.value !== '' ? parseFloat(inp.value) : null) : inp.value;
  });

  const apt = appApartments.find(a => a.id === aptId);
  if (!apt) return;

  if (_aptSbClient) {
    const vId = apt.verwaltung?.id;
    let error;
    if (vId) {
      ({ error } = await _aptSbClient.from('rentals_verwaltung').update(data).eq('id', vId));
    } else {
      const res = await _aptSbClient.from('rentals_verwaltung').insert({ apartment_id: aptId, ...data }).select().single();
      error = res.error;
      if (!error) apt.verwaltung = res.data;
    }
    if (error) {
      console.error('[apartments] Save verwaltung failed:', error, data);
      btn.textContent = 'Error'; btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000);
      return;
    }
  }

  if (apt.verwaltung) Object.assign(apt.verwaltung, data);
  else apt.verwaltung = { apartment_id: aptId, ...data };

  _aptRerenderCard(aptId);
}


/* ── SAVE: ZÄHLER ────────────────────────────────────────── */
async function _aptSaveZaehler(aptId) {
  const el  = document.getElementById(`apt-zaehler-${aptId}`);
  const btn = el?.querySelector('.apt-btn--save');
  if (!btn) return;
  btn.textContent = '…'; btn.disabled = true;

  // Collect current rows from DOM
  const rows = el.querySelectorAll('[data-zaehler-id]');
  const newMeters = [];
  rows.forEach((row, i) => {
    const nr  = row.querySelector('[data-zf="zaehler_nr"]')?.value?.trim();
    const typ = row.querySelector('.apt-field__label')?.textContent?.trim();
    if (typ && nr) newMeters.push({ apartment_id: aptId, typ, zaehler_nr: nr, sort_order: i });
  });

  // Also handle rows added via "Add meter" (no data-zaehler-id)
  const newRows = el.querySelectorAll('[data-new-zaehler]');
  newRows.forEach((row, i) => {
    const typ = row.querySelector('[data-zf="typ"]')?.value?.trim();
    const nr  = row.querySelector('[data-zf="zaehler_nr"]')?.value?.trim();
    if (typ && nr) newMeters.push({ apartment_id: aptId, typ, zaehler_nr: nr, sort_order: rows.length + i });
  });

  const apt = appApartments.find(a => a.id === aptId);
  if (!apt) return;

  if (_aptSbClient) {
    // Delete all existing and re-insert
    const { error: delErr } = await _aptSbClient.from('rentals_zaehler').delete().eq('apartment_id', aptId);
    if (delErr) {
      console.error('[apartments] Save zaehler delete failed:', delErr);
      btn.textContent = 'Error'; btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000);
      return;
    }
    if (newMeters.length) {
      const { error: insErr } = await _aptSbClient.from('rentals_zaehler').insert(newMeters);
      if (insErr) {
        console.error('[apartments] Save zaehler insert failed:', insErr, newMeters);
        btn.textContent = 'Error'; btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000);
        return;
      }
    }
  }

  apt.zaehler = newMeters.map((m, i) => ({ ...m, id: `local-${i}` }));
  _aptRerenderCard(aptId);
}


/* ── ADD ZÄHLER ROW ──────────────────────────────────────── */
const _APT_METER_TYPES = ['Strom','Gas','Wasser','Warmwasser','Warmwasser Bad','Warmwasser Küche','Kaltwasser','Kaltwasser Bad','Kaltwasser Küche','Heizung Bad','Heizung 1','Heizung 2','Heizung 3'];

function _aptAddZaehlerRow(aptId) {
  const container = document.getElementById(`apt-zaehler-edit-rows-${aptId}`);
  if (!container) return;
  const div = document.createElement('div');
  div.setAttribute('data-new-zaehler', '1');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;';
  div.innerHTML = `
    <div class="apt-field">
      <div class="apt-field__label">Typ</div>
      <select class="apt-input" data-zf="typ">
        ${_APT_METER_TYPES.map(t => `<option>${t}</option>`).join('')}
      </select>
    </div>
    <div class="apt-field">
      <div class="apt-field__label">Zählernummer</div>
      <input class="apt-input apt-input--mono" data-zf="zaehler_nr" placeholder="Nr…"/>
    </div>`;
  container.appendChild(div);
  div.querySelector('input').focus();
}


/* ── SAVE: SCHLÜSSEL ─────────────────────────────────────── */
async function _aptSaveSchlussel(aptId) {
  const el  = document.getElementById(`apt-schlussel-${aptId}`);
  const btn = el?.querySelector('.apt-btn--save');
  if (!btn) return;
  btn.textContent = '…'; btn.disabled = true;

  const data = {};
  el.querySelectorAll('[data-sf]').forEach(span => {
    data[span.dataset.sf] = parseInt(span.textContent, 10) || 0;
  });

  const apt = appApartments.find(a => a.id === aptId);
  if (!apt) return;

  if (_aptSbClient) {
    const skId = apt.schlussel?.id;
    let error;
    if (skId) {
      ({ error } = await _aptSbClient.from('rentals_schlussel').update(data).eq('id', skId));
    } else {
      const res = await _aptSbClient.from('rentals_schlussel').insert({ apartment_id: aptId, ...data }).select().single();
      error = res.error;
      if (!error) apt.schlussel = res.data;
    }
    if (error) {
      console.error('[apartments] Save schlussel failed:', error, data);
      btn.textContent = 'Error'; btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000);
      return;
    }
  }

  if (apt.schlussel) Object.assign(apt.schlussel, data);
  else apt.schlussel = { apartment_id: aptId, ...data };

  _aptRerenderCard(aptId);
}


/* ── STEPPER ─────────────────────────────────────────────── */
function _aptStep(btn, delta) {
  const val = btn.parentElement.querySelector('.apt-stepper__v');
  let n = parseInt(val.textContent) + delta;
  if (n < 0) n = 0;
  val.textContent = n;
}


/* ── KAUTION OVERRIDE TOGGLE ─────────────────────────────── */
function _aptToggleKautionOverride(chk) {
  const field = chk.closest('[id^="apt-miete-"]').querySelector('[data-kautionfield]');
  if (field) field.style.display = chk.checked ? '' : 'none';
}


/* ── RERENDER CARD ───────────────────────────────────────── */
function _aptRerenderCard(aptId) {
  const apt  = appApartments.find(a => a.id === aptId);
  const card = document.querySelector(`.apt-card[data-id="${aptId}"]`);
  if (!apt || !card) return;
  const newDiv = document.createElement('div');
  newDiv.innerHTML = _aptCardHTML(apt);
  const newCard = newDiv.firstElementChild;
  newCard.classList.add('apt--open');
  card.parentNode.insertBefore(newCard, card);
  card.remove();
  _aptInitSortable();
  _updateAptSummary();
}


/* ── HAUSGELD HISTORY ────────────────────────────────────── */

function _aptHGSectionHTML(aptId) {
  const entries = _aptHausgeld[aptId] || [];
  const today = new Date(); today.setHours(0,0,0,0);
  const current = entries.find(e => new Date(e.effective_date) <= today) || null;
  const pending = entries.filter(e => !e.weg_notified);

  const fmtDate = (d) => {
    if (!d) return '';
    const [y,m,day] = d.split('-');
    return `${day}.${m}.${y}`;
  };

  const isFuture = (e) => new Date(e.effective_date) > today;

  const rowIcon = (e) => isFuture(e)
    ? `<i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0" aria-hidden="true"></i>`
    : `<i class="ti ti-check" style="font-size:13px;color:#3B6D11;flex-shrink:0" aria-hidden="true"></i>`;

  const pillHTML = (e) => {
    return e.weg_notified
      ? `<span class="apt-hg-pill done"><i class="ti ti-check" aria-hidden="true"></i> Noted${e.notified_date ? ' · ' + e.notified_date.split('-').reverse().join('.') : ''}</span>`
      : `<button class="apt-hg-pill pending" onclick="_aptHGMarkNotified('${e.id}','${aptId}')" title="Mark as noted">
           <i class="ti ti-check" aria-hidden="true"></i> Noted?
         </button>`;
  };

  const pendingRows = pending.map(e => `
    <div class="apt-hg-row" id="apt-hg-row-${e.id}">
      <div class="apt-hg-row-top">
        ${rowIcon(e)}
        <span class="apt-hg-date">${isFuture(e) ? 'from ' : ''}${fmtDate(e.effective_date)}</span>
        <span class="apt-hg-amount">${aptFmtEUR(e.amount)}</span>
      </div>
      <div class="apt-hg-pills">${pillHTML(e)}</div>
    </div>`).join('');

  return `
<div class="apt-hg-sec" id="apt-hg-sec-${aptId}">
  <div class="apt-hg-body">
    <div class="apt-hg-header">
      <span class="apt-hg-lbl">Hausgeld increase</span>
      ${entries.length > 1 ? `<button class="apt-hg-verlauf-btn" onclick="_aptHGOpenModal('${aptId}')">History</button>` : ''}
      <button class="apt-hg-add-btn" onclick="_aptHGAdd('${aptId}')">
        <i class="ti ti-plus" style="font-size:11px" aria-hidden="true"></i> Add
      </button>
    </div>
    ${current
      ? `<div class="apt-hg-current">
           <i class="ti ti-building-estate" style="font-size:15px;color:var(--cc-stone)" aria-hidden="true"></i>
           <span class="apt-hg-cur-amount">${aptFmtEUR(current.amount)}&thinsp;/&thinsp;mo</span>
           <span class="apt-hg-cur-since">since ${fmtDate(current.effective_date)}</span>
         </div>`
      : `<p class="apt-empty" style="padding:3px 0 10px;font-size:12px;color:var(--cc-stone);font-style:italic">No rate entered yet.</p>`}
    ${pendingRows}
  </div>
</div>`;
}

function _aptHGOpenModal(aptId) {
  const entries = (_aptHausgeld[aptId] || []).slice();
  const today = new Date(); today.setHours(0,0,0,0);
  const apt = appApartments.find(a => a.id === aptId);

  const fmtDate = (d) => {
    if (!d) return '';
    const [y,m,day] = d.split('-');
    return `${day}.${m}.${y}`;
  };
  const isFuture = (e) => new Date(e.effective_date) > today;

  const pillHTML = (e) => {
    return e.weg_notified
      ? `<span class="apt-hg-pill done"><i class="ti ti-check" aria-hidden="true"></i> Noted${e.notified_date ? ' · ' + e.notified_date.split('-').reverse().join('.') : ''}</span>`
      : `<button class="apt-hg-pill pending" onclick="_aptHGMarkNotified('${e.id}','${aptId}')" title="Mark as noted">
           <i class="ti ti-check" aria-hidden="true"></i> Noted?
         </button>`;
  };

  const rows = entries.map(e => `
    <div class="apt-hg-row" id="apt-hg-row-${e.id}" style="padding-left:16px;padding-right:16px">
      <div class="apt-hg-row-top">
        ${isFuture(e)
          ? `<i class="ti ti-clock" style="font-size:13px;color:var(--cc-gold);flex-shrink:0" aria-hidden="true"></i>`
          : `<i class="ti ti-check" style="font-size:13px;color:#3B6D11;flex-shrink:0" aria-hidden="true"></i>`}
        <span class="apt-hg-date">${isFuture(e) ? 'from ' : ''}${fmtDate(e.effective_date)}</span>
        <span class="apt-hg-amount ${e.hv_adjusted && !isFuture(e) ? 'past' : ''}">${aptFmtEUR(e.amount)}</span>
      </div>
      <div class="apt-hg-pills">${pillHTML(e)}</div>
    </div>`).join('');

  document.getElementById('aptHGModalSub').textContent = apt ? apt.name : '';
  document.getElementById('aptHGModalBody').innerHTML = rows || `<p style="padding:12px 16px;font-size:12px;color:var(--cc-stone);font-style:italic">No entries yet.</p>`;
  document.getElementById('aptHGModal').classList.add('open');
}

function _aptHGModalClose() {
  document.getElementById('aptHGModal').classList.remove('open');
}
let _aptHGMouseDownOnOverlay = false;
document.getElementById('aptHGModal')?.addEventListener('mousedown', e => {
  _aptHGMouseDownOnOverlay = (e.target === document.getElementById('aptHGModal'));
});
function _aptHGModalOutside(e) {
  if (_aptHGMouseDownOnOverlay && e.target === document.getElementById('aptHGModal')) _aptHGModalClose();
  _aptHGMouseDownOnOverlay = false;
}

function _aptHGAdd(aptId) {
  const sec = document.getElementById(`apt-hg-sec-${aptId}`);
  if (!sec) return;
  const existing = sec.querySelector('.apt-hg-add-form');
  if (existing) { existing.querySelector('input[type=date]')?.focus(); return; }

  const body = sec.querySelector('.apt-hg-body');
  const form = document.createElement('div');
  form.className = 'apt-hg-add-form';
  form.innerHTML = `
    <input type="date" id="apt-hg-date-${aptId}" />
    <input type="number" id="apt-hg-amount-${aptId}" placeholder="Amount €" step="0.01" min="0" />
    <button class="apt-btn--save" style="height:30px;font-size:11px;padding:0 10px"
      onclick="_aptHGConfirmAdd('${aptId}')">
      <i class="ti ti-check" aria-hidden="true"></i>
    </button>
    <button class="apt-btn--cancel" style="height:30px;font-size:11px;padding:0 10px"
      onclick="this.closest('.apt-hg-add-form').remove()">
      <i class="ti ti-x" aria-hidden="true"></i>
    </button>`;
  body.appendChild(form);
  form.querySelector('input[type=date]').focus();
}

async function _aptHGConfirmAdd(aptId) {
  const dateInp   = document.getElementById(`apt-hg-date-${aptId}`);
  const amountInp = document.getElementById(`apt-hg-amount-${aptId}`);
  const date   = dateInp?.value?.trim();
  const amount = parseFloat(amountInp?.value);
  if (!date || isNaN(amount) || amount <= 0) { dateInp?.focus(); return; }
  if (!_aptSbClient) return;

  const { data, error } = await _aptSbClient.from('rentals_hausgeld_history')
    .insert({ apt_id: aptId, effective_date: date, amount,
              weg_notified: false, hv_adjusted: false })
    .select().single();
  if (error) { console.warn('[apartments] hg add:', error.message); return; }

  if (!_aptHausgeld[aptId]) _aptHausgeld[aptId] = [];
  _aptHausgeld[aptId].unshift(data);
  _aptHausgeld[aptId].sort((a,b) => b.effective_date.localeCompare(a.effective_date));
  _aptRerenderCard(aptId);
}

async function _aptHGMarkNotified(id, aptId) {
  if (!_aptSbClient) return;
  const today = new Date().toISOString().slice(0,10);
  const { error } = await _aptSbClient.from('rentals_hausgeld_history')
    .update({ weg_notified: true, notified_date: today })
    .eq('id', id);
  if (error) { console.warn('[apartments] hg notified:', error.message); return; }
  const entry = (_aptHausgeld[aptId] || []).find(e => e.id === id);
  if (entry) { entry.weg_notified = true; entry.notified_date = today; }
  _aptHGRenderRow(id, aptId);
}

async function _aptHGMarkAdjusted(id, aptId) {
  if (!_aptSbClient) return;
  const today = new Date().toISOString().slice(0,10);
  const { error } = await _aptSbClient.from('rentals_hausgeld_history')
    .update({ hv_adjusted: true, adjusted_date: today })
    .eq('id', id);
  if (error) { console.warn('[apartments] hg adjusted:', error.message); return; }
  const entry = (_aptHausgeld[aptId] || []).find(e => e.id === id);
  if (entry) { entry.hv_adjusted = true; entry.adjusted_date = today; }
  // Full rerender — amber pill on header may need to disappear
  _aptRerenderCard(aptId);
}

function _aptHGRenderRow(id, aptId) {
  const row = document.getElementById('apt-hg-row-' + id);
  if (!row) { _aptRerenderCard(aptId); return; }
  const entry = (_aptHausgeld[aptId] || []).find(e => e.id === id);
  if (!entry) { _aptRerenderCard(aptId); return; }

  const notPill = entry.weg_notified
    ? `<span class="apt-hg-pill done"><i class="ti ti-check" aria-hidden="true"></i> Noted${entry.notified_date ? ' · ' + entry.notified_date.split('-').reverse().join('.') : ''}</span>`
    : `<button class="apt-hg-pill pending" onclick="_aptHGMarkNotified('${id}','${aptId}')">
         <i class="ti ti-check" aria-hidden="true"></i> Noted?
       </button>`;

  const pillsEl = row.querySelector('.apt-hg-pills');
  if (pillsEl) pillsEl.innerHTML = notPill;
}


/* ── TOGGLE VACANT ───────────────────────────────────────── */
async function _aptToggleVacant(aptId, btn) {
  btn.disabled = true;
  const apt = appApartments.find(a => a.id === aptId);
  if (!apt) { btn.disabled = false; return; }

  const newVacant = !apt.vacant;

  if (_aptSbClient) {
    const { error } = await _aptSbClient.from('rentals_apartments').update({ vacant: newVacant }).eq('id', aptId);
    if (error) { btn.disabled = false; return; }
  }

  apt.vacant = newVacant;
  _aptRerenderCard(aptId);
  _updateAptSummary();
}


/* ── INVENTAR MODAL ──────────────────────────────────────── */
let _aptInventarId = null;

function _aptOpenInventar(aptId) {
  _aptInventarId = aptId;
  const apt = appApartments.find(a => a.id === aptId);
  document.getElementById('aptInventarSubtitle').textContent = (apt?.name || '') + ' · Anlage A';

  const list  = document.getElementById('aptInventarList');
  const items = apt?.inventar || [];
  list.innerHTML = items.map(i => `
    <div class="inv-row">
      <input class="inv-name" value="${aptEsc(i.name)}"/>
      <input class="inv-qty" type="number" value="${i.anzahl ?? 1}" min="1"/>
      <button class="inv-rm" onclick="this.closest('.inv-row').remove()"><i class="ti ti-trash"></i></button>
    </div>`).join('');

  document.getElementById('aptInventarOverlay').classList.add('open');
}

document.getElementById('aptInventarClose')?.addEventListener('click', () => {
  document.getElementById('aptInventarOverlay').classList.remove('open');
  _aptInventarId = null;
});

document.getElementById('aptInventarCancel')?.addEventListener('click', () => {
  document.getElementById('aptInventarOverlay').classList.remove('open');
  _aptInventarId = null;
});

let _aptInventarMouseDownOnOverlay = false;
document.getElementById('aptInventarOverlay')?.addEventListener('mousedown', e => {
  _aptInventarMouseDownOnOverlay = (e.target === document.getElementById('aptInventarOverlay'));
});
document.getElementById('aptInventarOverlay')?.addEventListener('click', e => {
  if (_aptInventarMouseDownOnOverlay && e.target === document.getElementById('aptInventarOverlay')) {
    document.getElementById('aptInventarOverlay').classList.remove('open');
    _aptInventarId = null;
  }
  _aptInventarMouseDownOnOverlay = false;
});

document.getElementById('aptInventarAddRow')?.addEventListener('click', () => {
  const list = document.getElementById('aptInventarList');
  const row  = document.createElement('div');
  row.className = 'inv-row';
  row.innerHTML = `<input class="inv-name" placeholder="Gegenstand…"/><input class="inv-qty" type="number" value="1" min="1"/><button class="inv-rm" onclick="this.closest('.inv-row').remove()"><i class="ti ti-trash"></i></button>`;
  list.appendChild(row);
  row.querySelector('input').focus();
});

document.getElementById('aptInventarSave')?.addEventListener('click', async () => {
  if (!_aptInventarId) return;
  const rows    = document.querySelectorAll('#aptInventarList .inv-row');
  const inventar = [];
  rows.forEach(row => {
    const name   = row.querySelector('.inv-name').value.trim();
    const anzahl = parseInt(row.querySelector('.inv-qty').value, 10) || 1;
    if (name) inventar.push({ name, anzahl, apartment_id: _aptInventarId });
  });

  const btn = document.getElementById('aptInventarSave');
  btn.textContent = '…'; btn.disabled = true;

  if (_aptSbClient) {
    // Delete + reinsert
    await _aptSbClient.from('rentals_inventar').delete().eq('apartment_id', _aptInventarId);
    if (inventar.length) {
      inventar.forEach((item, i) => { item.sort_order = i; });
      await _aptSbClient.from('rentals_inventar').insert(inventar);
    }
  }

  const apt = appApartments.find(a => a.id === _aptInventarId);
  if (apt) apt.inventar = inventar;

  btn.textContent = 'Save'; btn.disabled = false;
  document.getElementById('aptInventarOverlay').classList.remove('open');
  _aptRerenderCard(_aptInventarId);
  _aptInventarId = null;
});


/* ── CONTRACT MODAL ──────────────────────────────────────── */
let _aptContractId   = null;
let _aptContractType = null;

async function _aptOpenContract(type, aptId) {
  _aptContractId   = aptId;
  _aptContractType = type;
  const apt = appApartments.find(a => a.id === aptId);
  if (!apt) return;

  const p  = apt.pricing    || {};
  const sk = apt.schlussel  || {};

  const typeLbl  = document.getElementById('aptContractTypeLbl');
  const titleLbl = document.getElementById('aptContractTitleLbl');
  const subLbl   = document.getElementById('aptContractSubLbl');
  const body     = document.getElementById('aptContractBody');
  const footer   = document.getElementById('aptContractFooter');

  const aptInfo = [apt.zimmer_type, apt.heizungsart, apt.flaeche_m2 ? apt.flaeche_m2 + ' m²' : ''].filter(Boolean).join(' · ');
  subLbl.textContent = aptInfo;

  if (type === 'kurzzeit') {
    typeLbl.textContent  = 'Kurzzeitmiete';
    titleLbl.textContent = apt.name;
    const kzKalt = Number(p.kurzzeit_kaltmiete) || 0;
    const kzNk   = Number(p.kurzzeit_nk) || 0;
    const kzBase = kzKalt + kzNk || Number(p.kaltmiete) || 0;
    const _kzProfile = await _aptResolveTenantProfile(apt.id);
    body.innerHTML = _aptBodyKurzzeit(apt, p, sk, kzKalt, kzNk, kzBase, _kzProfile);
    footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" id="aptKzPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;

    setTimeout(() => {
      document.getElementById('aptKzPdfBtn')?.addEventListener('click', async () => {
        const apt2        = appApartments.find(a => a.id === _aptContractId);
        if (!apt2) return;
        const mieterName  = document.getElementById('apt-cm-name')?.value.trim();
        const mieterAdr   = document.getElementById('apt-cm-adr')?.value.trim();
        const mieterDob   = document.getElementById('apt-cm-dob')?.value.trim();
        const mieterEmail = document.getElementById('apt-cm-email')?.value.trim();
        const startVal    = document.getElementById('apt-cm-start')?.value;
        const endVal      = document.getElementById('apt-cm-end')?.value;
        const sigVal      = document.getElementById('apt-cm-sig')?.value;
        const kautionVal  = document.getElementById('apt-cm-kaution')?.value;
        const kautionFael = _aptReadKautionFael('cm');
        if (!startVal || !endVal) { alert('Bitte Mietbeginn und Mietende ausfüllen.'); return; }
        const btn = document.getElementById('aptKzPdfBtn');
        if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Generating\u2026'; btn.disabled = true; }
        try {
          if (typeof loadSettings === 'function') await loadSettings();
          const data = _buildRentalKurzzeitData(apt2, appSettings, {
            mieterName, mieterAdr, mieterDob, mieterEmail, startVal, endVal, sigVal, kautionVal, kautionFael,
          });
          const html = _renderRentalKurzzeitHTML(data);
          let container = document.getElementById('_pdfRenderContainer');
          if (container) container.remove();
          container = document.createElement('div');
          container.id = '_pdfRenderContainer';
          container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
          container.innerHTML = html;
          document.body.appendChild(container);
          await document.fonts.ready;
          await new Promise(r => setTimeout(r, 300));
          const safeName = mieterName ? mieterName.replace(/\s+/g,'_') : apt2.name;
          const filename = `Kurzzeitmiete_${apt2.name}_${safeName}.pdf`;
          await _aptGenericPdfAction(container, filename, btn, '<i class="ti ti-printer"></i> Generate PDF');
        } catch(err) {
          console.error('[Kurzzeit PDF]', err);
          alert('PDF generation failed. Please try again.');
          if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
        }
      });
    }, 0);

  } else if (type === 'mietvertrag') {
    const isGewerbe = apt.zimmer_type === 'Gewerbefläche';
    typeLbl.textContent  = isGewerbe ? 'Gewerbemietvertrag' : 'Mietvertrag';
    titleLbl.textContent = apt.name;
    const kalt   = Number(p.kaltmiete) || 0;
    const nk     = Number(p.nk_pauschale) || 0;
    const kaution = (p.kaution_default !== null && p.kaution_default !== undefined && p.kaution_default !== '')
      ? Number(p.kaution_default)
      : kalt * 3;
    const _mvProfile = await _aptResolveTenantProfile(apt.id);

    if (isGewerbe) {
      body.innerHTML = _aptBodyGewerbe(apt, p, sk, kalt, nk, kaution, _mvProfile);
      footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" id="aptGwPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
      setTimeout(() => {
        _aptGwInitInteractions();
        document.getElementById('aptGwPdfBtn')?.addEventListener('click', async () => {
          const apt2 = appApartments.find(a => a.id === _aptContractId);
          if (!apt2) return;

          // Read all fields
          const szenario       = document.querySelector('.apt-gw-szenario-btn.active')?.dataset.s || 'S1';
          const nutzungSelect  = document.getElementById('apt-gw-nutzung-select')?.value;
          const nutzungFrei    = document.getElementById('apt-gw-nutzung-frei')?.value.trim();
          const nutzungszweck  = nutzungSelect === 'Sonstige' ? nutzungFrei : nutzungSelect;
          const etage          = apt2.floor || '';
          const moebliert      = document.getElementById('apt-gw-moebliert-btn')?.dataset.mode === 'ja';
          const mieterName     = document.getElementById('apt-gw-name')?.value.trim();
          const mieterAdr      = document.getElementById('apt-gw-adr')?.value.trim();
          const mieterDob      = document.getElementById('apt-gw-dob')?.value.trim();
          const mieterEmail    = document.getElementById('apt-gw-email')?.value.trim();
          const mieterTel      = document.getElementById('apt-gw-tel')?.value.trim();
          const startVal       = document.getElementById('apt-gw-start')?.value;
          const festNum        = parseInt(document.getElementById('apt-gw-fest-num')?.value) || 0;
          const festUnit       = document.getElementById('apt-gw-fest-unit')?.value || 'Jahre';
          const kaltmiete      = parseFloat(document.getElementById('apt-gw-kalt')?.value) || 0;
          const nkVZ           = parseFloat(document.getElementById('apt-gw-nk')?.value) || 0;
          const kautionVal     = parseFloat(document.getElementById('apt-gw-kaution')?.value) || 0;
          const kautionFael    = _aptReadKautionFael('gw');
          const sigVal         = document.getElementById('apt-gw-sig')?.value;

          // Validate
          // S1 fields
          let kuendigungsfrist = 6;
          let staffeln = [];
          let staffelAn = false;
          if (szenario === 'S1') {
            kuendigungsfrist = parseInt(document.getElementById('apt-gw-kuendfrist')?.value) || 6;
            staffelAn = document.getElementById('apt-gw-staffel-btn')?.dataset.mode === 'ja';
            if (staffelAn) {
              const rows = document.querySelectorAll('.apt-gw-staffel-row');
              for (const row of rows) {
                const betrag = parseFloat(row.querySelector('.apt-gw-staffel-betrag')?.value) || 0;
                const datum = row.querySelector('.apt-gw-staffel-datum')?.textContent?.trim();
                staffeln.push({ datum, betrag });
              }
            }
          }

          // S3 fields
          let verlaengerungJahre = 0, ankuendigungMonate = 6, neueKaltmiete = 0, verlaengerungBis = '';
          if (szenario === 'S3') {
            verlaengerungJahre  = parseInt(document.getElementById('apt-gw-verl-jahre')?.value) || 0;
            ankuendigungMonate  = parseInt(document.getElementById('apt-gw-ankuend')?.value) || 6;
            neueKaltmiete       = parseFloat(document.getElementById('apt-gw-neue-kalt')?.value) || 0;
            verlaengerungBis    = document.getElementById('apt-gw-verl-bis-display')?.textContent?.replace('Verlängerung bis: ','').trim();
          }

          const btn = document.getElementById('aptGwPdfBtn');
          if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Generating\u2026'; btn.disabled = true; }
          try {
            if (typeof loadSettings === 'function') await loadSettings();
            const data = _buildGewerbeMietvertragData(apt2, appSettings, {
              szenario, nutzungszweck, etage, moebliert,
              mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel,
              startVal, festNum, festUnit, kaltmiete, nkVZ,
              kautionVal, kautionFael, sigVal,
              kuendigungsfrist, staffelAn, staffeln,
              verlaengerungJahre, ankuendigungMonate, neueKaltmiete, verlaengerungBis,
            });
            const html = _renderGewerbeMietvertragHTML(data);
            let container = document.getElementById('_pdfRenderContainer');
            if (container) container.remove();
            container = document.createElement('div');
            container.id = '_pdfRenderContainer';
            container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
            container.innerHTML = html;
            document.body.appendChild(container);
            await document.fonts.ready;
            await new Promise(r => setTimeout(r, 300));
            const safeName = mieterName ? mieterName.replace(/\s+/g,'_') : apt2.name;
            const filename = `Gewerbemietvertrag_${apt2.name}_${safeName}.pdf`;
            await _aptGenericPdfAction(container, filename, btn, '<i class="ti ti-printer"></i> Generate PDF');
          } catch(err) {
            console.error('[Gewerbe PDF]', err);
            alert('PDF generation failed. Please try again.');
            if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
          }
        });
      }, 0);

    } else {
    body.innerHTML = _aptBodyMietvertrag(apt, p, sk, kalt, nk, kaution, _mvProfile);
    footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" id="aptMvPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
    setTimeout(() => {
      document.getElementById('aptMvPdfBtn')?.addEventListener('click', async () => {
        const apt2              = appApartments.find(a => a.id === _aptContractId);
        if (!apt2) return;
        const mieterName        = document.getElementById('apt-mv-name')?.value.trim();
        const mieterAdr         = document.getElementById('apt-mv-adr')?.value.trim();
        const mieterDob         = document.getElementById('apt-mv-dob')?.value.trim();
        const mieterEmail       = document.getElementById('apt-mv-email')?.value.trim();
        const startVal          = document.getElementById('apt-mv-start')?.value;
        const sigVal            = document.getElementById('apt-mv-sig')?.value;
        const kautionFael       = _aptReadKautionFael('mv');
        const befristet         = document.getElementById('apt-mv-befristung-btn')?.dataset.mode === 'befristet';
        const endVal            = befristet ? document.getElementById('apt-mv-end')?.value : null;
        const grundVal          = befristet ? (document.querySelector('input[name="apt-mv-grund"]:checked')?.value || '') : '';
        const eigenbedarfPerson = grundVal === 'eigenbedarf' ? document.getElementById('apt-mv-eigenbedarf-person')?.value.trim() : '';
        if (!startVal) { alert('Bitte Mietbeginn ausfüllen.'); return; }
        if (befristet && !endVal) { alert('Bitte Mietende ausfüllen.'); return; }
        if (befristet && grundVal === 'eigenbedarf' && !eigenbedarfPerson) {
          alert('Bitte Eigenbedarfsperson angeben (gesetzliche Pflicht).'); return;
        }
        const btn = document.getElementById('aptMvPdfBtn');
        if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Generating\u2026'; btn.disabled = true; }
        try {
          if (typeof loadSettings === 'function') await loadSettings();
          const aptRoom = {
            ...apt2,
            name:               apt2.name,
            flaeche_m2:         apt2.flaeche_m2,
            gemeinschaftsraeume: [],
            haustuerschluessel:  apt2.schlussel?.haustuerschluessel ?? 1,
            zimmerschluessel:    apt2.schlussel?.wohnungsschluessel ?? 1,
            kaltmiete:           apt2.pricing?.kaltmiete,
            nk_pauschale:        apt2.pricing?.nk_pauschale,
            mietvertrag_pricing: 'kalt_nk',
            kaution_override:    apt2.pricing?.kaution_override,
            kaution_default:     apt2.pricing?.kaution_default,
            inventar:            apt2.inventar || [],
          };
          const data = _buildRentalMietvertragData(aptRoom, appSettings, {
            mieterName, mieterAdr, mieterDob, mieterEmail, startVal, sigVal,
            befristet, endVal, grundVal, eigenbedarfPerson, kautionFael,
          });
          const html = _renderRentalMietvertragHTML(data);
          let container = document.getElementById('_pdfRenderContainer');
          if (container) container.remove();
          container = document.createElement('div');
          container.id = '_pdfRenderContainer';
          container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
          container.innerHTML = html;
          document.body.appendChild(container);
          await document.fonts.ready;
          await new Promise(r => setTimeout(r, 300));
          const safeName = mieterName ? mieterName.replace(/\s+/g,'_') : apt2.name;
          const filename = `Mietvertrag_${apt2.name}_${safeName}.pdf`;
          await _aptGenericPdfAction(container, filename, btn, '<i class="ti ti-printer"></i> Generate PDF');
        } catch(err) {
          console.error('[Mietvertrag PDF]', err);
          alert('PDF generation failed. Please try again.');
          if (btn) { btn.innerHTML = '<i class="ti ti-printer"></i> Generate PDF'; btn.disabled = false; }
        }
      });
      document.getElementById('apt-mv-start')?.addEventListener('input', _aptUpdateMvMonatToggle);
    }, 0);
    } // end Wohnraum else

  } else if (type === 'ueberg') {
    const isEinzug = document.getElementById('apt-eu-' + aptId)?.querySelector('.active')?.textContent?.trim() === 'Einzug';
    typeLbl.textContent  = 'Übergabeprotokoll';
    titleLbl.textContent = (isEinzug ? 'Einzug' : 'Auszug') + ' — ' + apt.name;
    const _ubProfile = await _aptResolveTenantProfile(apt.id);
    body.innerHTML = _aptBodyUeberg(apt, sk, isEinzug, _ubProfile);
    footer.innerHTML = `<button class="rm-btn--cancel" id="aptContractCancelBtn">Cancel</button><button class="rm-btn--pdf" id="aptUebergPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
    setTimeout(() => {
      document.getElementById('aptUebergPdfBtn')?.addEventListener('click', () => {
        aptGenerateUebergPDF(isEinzug);
      });
    }, 0);
  }

  // Wire cancel
  setTimeout(() => {
    document.getElementById('aptContractCancelBtn')?.addEventListener('click', () => {
      document.getElementById('aptContractOverlay').classList.remove('open');
    });
  }, 0);

  document.getElementById('aptContractOverlay').classList.add('open');
}

document.getElementById('aptContractClose')?.addEventListener('click', () => {
  document.getElementById('aptContractOverlay').classList.remove('open');
});
let _aptContractMouseDownOnOverlay = false;
document.getElementById('aptContractOverlay')?.addEventListener('mousedown', e => {
  _aptContractMouseDownOnOverlay = (e.target === document.getElementById('aptContractOverlay'));
});
document.getElementById('aptContractOverlay')?.addEventListener('click', e => {
  if (_aptContractMouseDownOnOverlay && e.target === document.getElementById('aptContractOverlay'))
    document.getElementById('aptContractOverlay').classList.remove('open');
  _aptContractMouseDownOnOverlay = false;
});


/* ── CONTRACT BODY: KURZZEIT ─────────────────────────────── */
function _aptBodyKurzzeit(apt, p, sk, kzKalt, kzNk, kzBase, profile = {}) {
  let _aptCmTenantName  = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  let _aptCmTenantEmail = profile.email   || '';
  let _aptCmTenantAdr   = profile.address || '';
  let _aptCmTenantDob   = profile.birthday || '';
  if (_aptCmTenantDob && _aptCmTenantDob.includes('-') && _aptCmTenantDob.length === 10) {
    const [_y,_m,_d] = _aptCmTenantDob.split('-');
    _aptCmTenantDob = `${_d}.${_m}.${_y}`;
  }
  const _aptCmHasTenant = !!_aptCmTenantName;
  const rentDisplay = kzKalt
    ? `${aptFmtEURCompact(kzKalt)} kalt + ${aptFmtEURCompact(kzNk)} NK / Monat`
    : `${aptFmtEURCompact(p.kaltmiete || 0)} kalt + ${aptFmtEURCompact(p.nk_pauschale || 0)} NK / Monat`;

  return `
    <div class="rm-prefilled">
      <div class="rm-prefilled__title">Pre-filled from apartment</div>
      <div class="rm-pre-row"><span>Apartment</span><span>${aptEsc(apt.name)}</span></div>
      <div class="rm-pre-row"><span>Adresse</span><span>${aptEsc(apt.adresse || '—')}</span></div>
      <div class="rm-pre-row"><span>PLZ / Ort</span><span>${aptEsc(apt.plz_ort || '—')}</span></div>
      <div class="rm-pre-row"><span>Gerichtsstand</span><span>${aptEsc(apt.gerichtsstand || '—')}</span></div>
      <div class="rm-pre-row"><span>Unterzeichnung</span><span>${aptEsc(apt.unterschrift_ort || '—')}</span></div>
      <div class="rm-pre-row"><span>Size</span><span>${apt.flaeche_m2 ? apt.flaeche_m2 + ' m²' : '—'}</span></div>
      <div class="rm-pre-row"><span>Miete</span><span>${rentDisplay}</span></div>
      <div class="rm-pre-row"><span>Schlüssel</span><span>Haustür ×${sk.haustuerschluessel ?? 1} · Wohnung ×${sk.wohnungsschluessel ?? 1}</span></div>
    </div>

    <div class="rm-kaution-row" style="align-items:flex-end;gap:12px">
      <div>
        <div class="rm-kaution-lbl">Kaution</div>
        <div class="rm-kaution-rule" id="apt-cm-kaution-rule">≤ 3 Monate → 1× · > 3 Monate → 3×</div>
      </div>
      <input class="rm-input" id="apt-cm-kaution" type="number" style="width:90px;text-align:right;font-size:13px" value="${kzBase}" data-auto="1" oninput="this.removeAttribute('data-auto')"/>
    </div>
    <div style="margin-bottom:20px">
      <div class="rm-kaution-lbl" style="margin-bottom:6px">Kaution Fälligkeit</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="rm-fael-btn" data-prefix="cm" onclick="_aptKfSelect('cm','sofort',this)">Sofort</button>
        <button class="rm-fael-btn active" data-prefix="cm" data-val="5" onclick="_aptKfSelect('cm','5',this)">5 Tage</button>
        <button class="rm-fael-btn" data-prefix="cm" onclick="_aptKfSelect('cm','custom',this)">Individuell</button>
        <input type="number" id="apt-cm-fael-custom" style="width:64px;font-size:12px;padding:3px 6px;border:.5px solid var(--cc-rule);border-radius:6px;display:none;font-family:inherit" placeholder="Tage"/>
      </div>
    </div>

    <div class="rm-fields-title">Mieterdaten</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--cc-taupe);font-weight:400;" id="aptCmMieterRoomLbl">${aptEsc(apt.name)} Mieter</span>
      <div class="ub-mieter-pill" id="aptCmMieterPill"
        data-state="room"
        data-tenant-name="${aptEsc(_aptCmTenantName)}"
        data-tenant-email="${aptEsc(_aptCmTenantEmail)}"
        data-tenant-adr="${aptEsc(_aptCmTenantAdr)}"
        data-tenant-dob="${aptEsc(_aptCmTenantDob)}"
        onclick="_toggleAptCmMieter()">
        <div class="ub-mieter-pill__knob"></div>
      </div>
      <span style="font-size:11px;color:var(--cc-stone);" id="aptCmMieterManualLbl">Manuell</span>
    </div>
    <div class="rm-field"><label>Mieter Name</label><input class="rm-input" id="apt-cm-name" value="${aptEsc(_aptCmTenantName)}" placeholder="Full name…"/></div>
    <div class="rm-field"><label>Mieter Adresse</label><input class="rm-input" id="apt-cm-adr" value="${aptEsc(_aptCmTenantAdr)}" placeholder="Current address…"/></div>
    <div class="rm-field"><label>Geburtsdatum</label><input class="rm-input" id="apt-cm-dob" value="${aptEsc(_aptCmTenantDob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/></div>
    <div class="rm-field"><label>E-Mail</label><input class="rm-input" id="apt-cm-email" type="email" value="${aptEsc(_aptCmTenantEmail)}" placeholder="mieter@beispiel.de"/></div>
    <div class="rm-field"><label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="apt-cm-tel" type="tel" placeholder="+49 …"/></div>
    <div class="rm-field-row" style="margin-bottom:10px">
      <div class="rm-field"><label>Mietbeginn *</label><input class="rm-input" id="apt-cm-start" type="date" onclick="try{this.showPicker()}catch(e){}"/></div>
      <div class="rm-field"><label>Mietende *</label><input class="rm-input" id="apt-cm-end" type="date" onclick="try{this.showPicker()}catch(e){}"/></div>
    </div>
    <div class="rm-field"><label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="apt-cm-sig" type="date" onclick="try{this.showPicker()}catch(e){}"/></div>`;
}


/* ── CONTRACT BODY: MIETVERTRAG ──────────────────────────── */
function _aptBodyMietvertrag(apt, p, sk, kalt, nk, kaution, profile = {}) {
  let _aptMvTenantName  = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  let _aptMvTenantEmail = profile.email   || '';
  let _aptMvTenantAdr   = profile.address || '';
  let _aptMvTenantDob   = profile.birthday || '';
  if (_aptMvTenantDob && _aptMvTenantDob.includes('-') && _aptMvTenantDob.length === 10) {
    const [_y,_m,_d] = _aptMvTenantDob.split('-');
    _aptMvTenantDob = `${_d}.${_m}.${_y}`;
  }
  const _aptMvHasTenant = !!_aptMvTenantName;
  return `
    <div class="rm-prefilled">
      <div class="rm-prefilled__title">Pre-filled from apartment</div>
      <div class="rm-pre-row"><span>Apartment</span><span>${aptEsc(apt.name)}</span></div>
      <div class="rm-pre-row"><span>Adresse</span><span>${aptEsc(apt.adresse || '—')}</span></div>
      <div class="rm-pre-row"><span>PLZ / Ort</span><span>${aptEsc(apt.plz_ort || '—')}</span></div>
      <div class="rm-pre-row"><span>Gerichtsstand</span><span>${aptEsc(apt.gerichtsstand || '—')}</span></div>
      <div class="rm-pre-row"><span>Unterzeichnung</span><span>${aptEsc(apt.unterschrift_ort || '—')}</span></div>
      <div class="rm-pre-row"><span>Miete</span><span>${aptFmtEURCompact(kalt)} kalt + ${aptFmtEURCompact(nk)} NK</span></div>
      <div class="rm-pre-row"><span>Gesamtmiete</span><span>${aptFmtEURCompact(kalt + nk)} / Monat</span></div>
      <div class="rm-pre-row"><span>Schlüssel</span><span>Haustür ×${sk.haustuerschluessel ?? 1} · Wohnung ×${sk.wohnungsschluessel ?? 1}</span></div>
    </div>

    <div class="rm-kaution-row" style="align-items:flex-end;gap:12px">
      <div>
        <div class="rm-kaution-lbl">Kaution (§ 551 BGB)</div>
        <div class="rm-kaution-rule">3 × Kaltmiete</div>
      </div>
      <input class="rm-input" id="apt-mv-kaution" type="number" style="width:90px;text-align:right;font-size:13px" value="${kaution}"/>
    </div>
    <div style="margin-bottom:20px">
      <div class="rm-kaution-lbl" style="margin-bottom:6px">Kaution Fälligkeit</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="rm-fael-btn" data-prefix="mv" onclick="_aptKfSelect('mv','sofort',this)">Sofort</button>
        <button class="rm-fael-btn active" data-prefix="mv" data-val="5" onclick="_aptKfSelect('mv','5',this)">5 Tage</button>
        <button class="rm-fael-btn" data-prefix="mv" onclick="_aptKfSelect('mv','custom',this)">Individuell</button>
        <input type="number" id="apt-mv-fael-custom" style="width:64px;font-size:12px;padding:3px 6px;border:.5px solid var(--cc-rule);border-radius:6px;display:none;font-family:inherit" placeholder="Tage"/>
      </div>
    </div>

    <div class="rm-fields-title">Mieterdaten</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--cc-taupe);font-weight:400;" id="aptMvMieterRoomLbl">${aptEsc(apt.name)} Mieter</span>
      <div class="ub-mieter-pill" id="aptMvMieterPill"
        data-state="room"
        data-tenant-name="${aptEsc(_aptMvTenantName)}"
        data-tenant-email="${aptEsc(_aptMvTenantEmail)}"
        data-tenant-adr="${aptEsc(_aptMvTenantAdr)}"
        data-tenant-dob="${aptEsc(_aptMvTenantDob)}"
        onclick="_toggleAptMvMieter()">
        <div class="ub-mieter-pill__knob"></div>
      </div>
      <span style="font-size:11px;color:var(--cc-stone);" id="aptMvMieterManualLbl">Manuell</span>
    </div>
    <div class="rm-field"><label>Name</label><input class="rm-input" id="apt-mv-name" value="${aptEsc(_aptMvTenantName)}" placeholder="Vor- und Nachname…"/></div>
    <div class="rm-field"><label>Adresse</label><input class="rm-input" id="apt-mv-adr" value="${aptEsc(_aptMvTenantAdr)}" placeholder="Aktuelle Adresse…"/></div>
    <div class="rm-field"><label>Geburtsdatum</label><input class="rm-input" id="apt-mv-dob" value="${aptEsc(_aptMvTenantDob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/></div>
    <div class="rm-field"><label>E-Mail</label><input class="rm-input" id="apt-mv-email" type="email" value="${aptEsc(_aptMvTenantEmail)}" placeholder="mieter@beispiel.de"/></div>
    <div class="rm-field"><label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label><input class="rm-input" id="apt-mv-tel" type="tel" placeholder="+49 …"/></div>

    <div class="rm-fields-title" style="margin-top:6px">Mietzeit</div>
    <div class="rm-field"><label>Mietbeginn *</label><input class="rm-input" id="apt-mv-start" type="date" onclick="try{this.showPicker()}catch(e){}"/></div>

    <div class="rm-field--toggle">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Befristung</div>
          <div class="rm-toggle-sub" id="apt-mv-befristung-sub">Unbefristet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="apt-mv-befristung-btn" data-mode="unbefristet" onclick="_aptToggleMvBefristung()">
          <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
          <span class="rm-pill-toggle__lbl" id="apt-mv-befristung-lbl">Nein</span>
        </button>
      </div>
    </div>

    <div id="apt-mv-befristung-details" style="display:none">
      <div class="rm-field"><label>Mietende *</label><input class="rm-input" id="apt-mv-end" type="date" onclick="try{this.showPicker()}catch(e){}"/></div>
      <div class="rm-field">
        <label>Befristungsgrund (§ 575 BGB — Pflicht)</label>
        <div style="display:flex;flex-direction:column;gap:7px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0">
            <input type="radio" name="apt-mv-grund" value="eigenbedarf" checked style="accent-color:var(--cc-ink)" onchange="_aptUpdateMvGrundDetail()"/> Eigenbedarf
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0">
            <input type="radio" name="apt-mv-grund" value="abriss" style="accent-color:var(--cc-ink)" onchange="_aptUpdateMvGrundDetail()"/> Abriss / wesentliche Umbaumaßnahmen
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0">
            <input type="radio" name="apt-mv-grund" value="dienst" style="accent-color:var(--cc-ink)" onchange="_aptUpdateMvGrundDetail()"/> Dienstwohnung
          </label>
        </div>
      </div>
      <div class="rm-field" id="apt-mv-eigenbedarf-wrap">
        <label>Eigenbedarfsperson * <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400">(Pflicht nach BGH)</span></label>
        <input class="rm-input" id="apt-mv-eigenbedarf-person" placeholder="z.B. Tochter des Vermieters…"/>
      </div>
    </div>

    <div class="rm-field" style="margin-top:4px">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0">(optional)</span></label>
      <input class="rm-input" id="apt-mv-sig" type="date" onclick="try{this.showPicker()}catch(e){}"/>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════
   GEWERBEMIETVERTRAG — MODAL BODY + INTERACTIONS
══════════════════════════════════════════════════════════════ */

function _aptBodyGewerbe(apt, p, sk, kalt, nk, kaution, profile = {}) {
  let _gwTenantName  = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  let _gwTenantEmail = profile.email   || '';
  let _gwTenantAdr   = profile.address || '';
  let _gwTenantDob   = profile.birthday || '';
  if (_gwTenantDob && _gwTenantDob.includes('-') && _gwTenantDob.length === 10) {
    const [_y,_m,_d] = _gwTenantDob.split('-');
    _gwTenantDob = `${_d}.${_m}.${_y}`;
  }
  const kaltFmt = n => Number(n||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
  const schluessel = `Haustür \u00d7${sk.haustuerschluessel??1} \u00b7 Wohnung \u00d7${sk.wohnungsschluessel??1}`;

  return `
    <div class="rm-prefilled">
      <div class="rm-prefilled__title">Pre-filled from apartment</div>
      <div class="rm-pre-row"><span>Name</span><span>${aptEsc(apt.name)}</span></div>
      <div class="rm-pre-row"><span>Adresse</span><span>${aptEsc(apt.adresse||'—')}</span></div>
      <div class="rm-pre-row"><span>PLZ / Ort</span><span>${aptEsc(apt.plz_ort||'—')}</span></div>
      <div class="rm-pre-row"><span>Fläche</span><span>${apt.flaeche_m2?apt.flaeche_m2+' m²':'—'}</span></div>
      <div class="rm-pre-row"><span>Kaltmiete</span><span>${kaltFmt(kalt)}</span></div>
      <div class="rm-pre-row"><span>Gerichtsstand</span><span>${aptEsc(apt.gerichtsstand||'—')}</span></div>
      <div class="rm-pre-row"><span>Schlüssel</span><span>${aptEsc(schluessel)}</span></div>
    </div>

    <div class="rm-fields-title">Vertragsmodell</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
      <button type="button" class="apt-gw-szenario-btn active" data-s="S1"
        onclick="_aptGwSetSzenario('S1')"
        style="font-size:11px;padding:5px 12px;border-radius:20px;border:.5px solid var(--cc-charcoal);background:var(--cc-charcoal);color:#fff;cursor:pointer;font-family:inherit;">
        S1 · Mindestlaufzeit
      </button>
      <button type="button" class="apt-gw-szenario-btn" data-s="S2"
        onclick="_aptGwSetSzenario('S2')"
        style="font-size:11px;padding:5px 12px;border-radius:20px;border:.5px solid var(--cc-rule);background:none;color:var(--cc-charcoal);cursor:pointer;font-family:inherit;">
        S2 · Befristet Ende
      </button>
      <button type="button" class="apt-gw-szenario-btn" data-s="S3"
        onclick="_aptGwSetSzenario('S3')"
        style="font-size:11px;padding:5px 12px;border-radius:20px;border:.5px solid var(--cc-rule);background:none;color:var(--cc-charcoal);cursor:pointer;font-family:inherit;">
        S3 · Verlängerungsoption
      </button>
    </div>

    <div class="rm-fields-title">Mietobjekt</div>
    <div class="rm-field">
      <label>Nutzungszweck</label>
      <select class="rm-input" id="apt-gw-nutzung-select" onchange="_aptGwNutzungChange()">
        <option value="">— bitte wählen —</option>
        <option>Büro / Bürofläche</option>
        <option>Praxis / Gesundheitswesen</option>
        <option>Einzelhandel</option>
        <option>Lager / Logistik</option>
        <option>Gastronomie</option>
        <option>Ausstellungsfläche</option>
        <option>Produktion / Werkstatt</option>
        <option>Sonstige</option>
      </select>
    </div>
    <div class="rm-field" id="apt-gw-nutzung-frei-wrap" style="display:none;">
      <label>Nutzungszweck (Freitext) <span style="color:#c0392b;font-weight:700;">*</span></label>
      <input class="rm-input" id="apt-gw-nutzung-frei" placeholder="z.B. Kosmetikstudio…"/>
    </div>
    <div class="rm-field--toggle">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Möbliert</div>
          <div class="rm-toggle-sub" id="apt-gw-moebliert-sub">Ohne Inventar</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="apt-gw-moebliert-btn" data-mode="nein" onclick="_aptGwToggleMoebliert()">
          <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
          <span class="rm-pill-toggle__lbl" id="apt-gw-moebliert-lbl">Nein</span>
        </button>
      </div>
    </div>

    <div class="rm-fields-title">Mieterdaten</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--cc-taupe);font-weight:400;" id="aptGwMieterRoomLbl">${aptEsc(apt.name)} Mieter</span>
      <div class="ub-mieter-pill" id="aptGwMieterPill"
        data-state="room"
        data-tenant-name="${aptEsc(_gwTenantName)}"
        data-tenant-email="${aptEsc(_gwTenantEmail)}"
        data-tenant-adr="${aptEsc(_gwTenantAdr)}"
        data-tenant-dob="${aptEsc(_gwTenantDob)}"
        onclick="_toggleAptGwMieter()">
        <div class="ub-mieter-pill__knob"></div>
      </div>
      <span style="font-size:11px;color:var(--cc-stone);" id="aptGwMieterManualLbl">Manuell</span>
    </div>
    <div class="rm-field"><label>Name</label><input class="rm-input" id="apt-gw-name" value="${aptEsc(_gwTenantName)}" placeholder="Vor- und Nachname…"/></div>
    <div class="rm-field"><label>Adresse</label><input class="rm-input" id="apt-gw-adr" value="${aptEsc(_gwTenantAdr)}" placeholder="Aktuelle Adresse…"/></div>
    <div class="rm-field"><label>Geburtsdatum</label><input class="rm-input" id="apt-gw-dob" value="${aptEsc(_gwTenantDob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/></div>
    <div class="rm-field"><label>E-Mail</label><input class="rm-input" id="apt-gw-email" type="email" value="${aptEsc(_gwTenantEmail)}" placeholder="mieter@beispiel.de"/></div>
    <div class="rm-field"><label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;">(optional)</span></label><input class="rm-input" id="apt-gw-tel" type="tel" placeholder="+49 …"/></div>

    <div class="rm-fields-title" style="margin-top:6px;">Mietzeit</div>
    <div class="rm-field"><label>Mietbeginn</label><input class="rm-input" id="apt-gw-start" type="date" onclick="try{this.showPicker()}catch(e){}" oninput="_aptGwCalcDates()"/></div>
    <div class="rm-field-row">
      <div class="rm-field">
        <label>Festlaufzeit</label>
        <input class="rm-input" id="apt-gw-fest-num" type="number" min="1" placeholder="2" style="-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcDates()"/>
      </div>
      <div class="rm-field">
        <label>&nbsp;</label>
        <select class="rm-input" id="apt-gw-fest-unit" onchange="_aptGwCalcDates()">
          <option value="Jahre">Jahre</option>
          <option value="Monate">Monate</option>
        </select>
      </div>
    </div>
    <div id="apt-gw-enddatum-display" style="font-size:12px;color:var(--cc-taupe);margin-bottom:12px;display:none;">
      Endet am: <strong id="apt-gw-enddatum-val"></strong>
    </div>

    <div id="apt-gw-s1-fields">
      <div class="rm-field">
        <label>Kündigungsfrist danach</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input class="rm-input" id="apt-gw-kuendfrist" type="number" min="1" value="6" style="width:70px;-webkit-appearance:textfield;appearance:textfield;"/>
          <span style="font-size:12px;color:var(--cc-stone);">Monate zum Quartalsende</span>
        </div>
      </div>
    </div>

    <div id="apt-gw-s3-fields" style="display:none;">
      <div class="rm-field-row">
        <div class="rm-field">
          <label>Verlängerung um</label>
          <input class="rm-input" id="apt-gw-verl-jahre" type="number" min="1" placeholder="2" style="-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcDates()"/>
        </div>
        <div class="rm-field">
          <label>&nbsp;</label>
          <input class="rm-input" value="Jahre" disabled style="color:var(--cc-stone);background:var(--cc-bg);"/>
        </div>
      </div>
      <div class="rm-field">
        <label>Ankündigungsfrist</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input class="rm-input" id="apt-gw-ankuend" type="number" min="1" value="6" style="width:70px;-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcDates()"/>
          <span style="font-size:12px;color:var(--cc-stone);">Monate vor Ende</span>
        </div>
      </div>
      <div id="apt-gw-s3-dates-display" style="display:none;margin-bottom:12px;background:var(--cc-bg);border:var(--cc-border);border-radius:var(--cc-r-sm);padding:10px 12px;">
        <div style="font-size:11px;color:var(--cc-stone);margin-bottom:4px;">Mieter muss bis: <strong id="apt-gw-ankuend-display"></strong> mitteilen</div>
        <div style="font-size:11px;color:var(--cc-stone);">Verlängerung bis: <strong id="apt-gw-verl-bis-display"></strong></div>
      </div>
      <div class="rm-field-row">
        <div class="rm-field">
          <label>Neue Kaltmiete</label>
          <input class="rm-input" id="apt-gw-neue-kalt" type="number" step="0.01" placeholder="950,00" style="-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcVerl('kalt')"/>
        </div>
        <div class="rm-field">
          <label>oder Erhöhung %</label>
          <input class="rm-input" id="apt-gw-erhöhung-pct" type="number" step="0.1" placeholder="5" style="-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcVerl('pct')"/>
        </div>
      </div>
      <div id="apt-gw-neue-kalt-display" style="font-size:12px;color:var(--cc-taupe);margin-bottom:12px;display:none;">
        Neue Gesamtmiete ab Verlängerung: <strong id="apt-gw-neue-gesamt-val"></strong>
      </div>
    </div>

    <div id="apt-gw-staffel-wrap">
      <div class="rm-field--toggle" style="margin-top:6px;">
        <div class="rm-toggle-row">
          <div>
            <div class="rm-toggle-label">Staffelmiete</div>
            <div class="rm-toggle-sub" id="apt-gw-staffel-sub">Aktiv</div>
          </div>
          <button type="button" class="rm-pill-toggle" id="apt-gw-staffel-btn" data-mode="ja" onclick="_aptGwToggleStaffel()">
            <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
            <span class="rm-pill-toggle__lbl" id="apt-gw-staffel-lbl">Ja</span>
          </button>
        </div>
      </div>
      <div id="apt-gw-staffel-body">
        <div class="rm-field-row" style="margin-bottom:8px;">
          <div class="rm-field">
            <label>Intervall</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input class="rm-input" id="apt-gw-staffel-intervall" type="number" min="1" value="1" style="width:60px;-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcDates()"/>
              <span style="font-size:12px;color:var(--cc-stone);">Jahr(e)</span>
            </div>
          </div>
        </div>
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--cc-stone);margin-bottom:6px;">Anfangsmiete (während Festlaufzeit)</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <input class="rm-input" id="apt-gw-staffel-anfang" type="number" step="0.01" value="${kalt||''}" placeholder="800,00" style="width:120px;-webkit-appearance:textfield;appearance:textfield;"/>
          <span style="font-size:11px;color:var(--cc-stone);">€ / Monat</span>
          <span style="font-size:11px;color:var(--cc-taupe);" id="apt-gw-staffel-anfang-ab">ab Mietbeginn</span>
        </div>
        <div id="apt-gw-staffel-rows"></div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <button type="button" id="apt-gw-staffel-add-btn" onclick="_aptGwAddStaffel()" disabled style="font-size:11px;padding:4px 12px;border-radius:20px;border:.5px solid var(--cc-rule);background:none;cursor:not-allowed;font-family:inherit;color:var(--cc-stone);opacity:.5;">+ Staffel</button>
          <button type="button" onclick="_aptGwRemoveStaffel()" style="font-size:11px;padding:4px 12px;border-radius:20px;border:.5px solid var(--cc-rule);background:none;cursor:pointer;font-family:inherit;color:var(--cc-stone);">− Staffel</button>
          <span id="apt-gw-staffel-add-hint" style="font-size:10.5px;color:var(--cc-stone);font-style:italic;">Bitte zuerst Mietbeginn &amp; Festlaufzeit ausfüllen</span>
        </div>
      </div>
    </div>

    <div class="rm-fields-title" style="margin-top:10px;">Miete &amp; Kaution</div>
    <div class="rm-field-row">
      <div class="rm-field">
        <label>Kaltmiete</label>
        <input class="rm-input" id="apt-gw-kalt" type="number" step="0.01" value="${kalt||''}" placeholder="800,00" style="-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcGesamt()"/>
      </div>
      <div class="rm-field">
        <label>Nebenkosten VZ</label>
        <input class="rm-input" id="apt-gw-nk" type="number" step="0.01" value="${nk||''}" placeholder="150,00" style="-webkit-appearance:textfield;appearance:textfield;" oninput="_aptGwCalcGesamt()"/>
      </div>
    </div>
    <div id="apt-gw-gesamt-display" style="font-size:12px;color:var(--cc-taupe);margin-bottom:12px;">
      Gesamtmiete: <strong id="apt-gw-gesamt-val">${kalt||nk ? aptFmtEURCompact((kalt||0)+(nk||0)) : '—'}</strong> / Monat
    </div>
    <div class="rm-field">
      <label>Kaution</label>
      <input class="rm-input" id="apt-gw-kaution" type="number" step="0.01" value="${kaution ? Math.round(kaution) : (kalt ? Math.round(kalt*3) : '')}" placeholder="2400,00" style="-webkit-appearance:textfield;appearance:textfield;"/>
    </div>
    <div style="margin-bottom:16px;">
      <div class="rm-kaution-lbl" style="margin-bottom:6px;">Kaution Fälligkeit</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="rm-fael-btn" data-prefix="gw" onclick="_aptKfSelect('gw','sofort',this)">Sofort</button>
        <button class="rm-fael-btn active" data-prefix="gw" data-val="5" onclick="_aptKfSelect('gw','5',this)">5 Tage</button>
        <button class="rm-fael-btn" data-prefix="gw" onclick="_aptKfSelect('gw','custom',this)">Individuell</button>
        <input type="number" id="apt-gw-fael-custom" style="width:64px;font-size:12px;padding:3px 6px;border:.5px solid var(--cc-rule);border-radius:6px;display:none;font-family:inherit;-webkit-appearance:textfield;appearance:textfield;" placeholder="Tage"/>
      </div>
    </div>

    <div class="rm-field" style="margin-top:4px;">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;">(optional)</span></label>
      <input class="rm-input" id="apt-gw-sig" type="date" onclick="try{this.showPicker()}catch(e){}"/>
    </div>`;
}

/* ── GEWERBE: Szenario Switch ─────────────────────────── */
function _aptGwSetSzenario(s) {
  document.querySelectorAll('.apt-gw-szenario-btn').forEach(btn => {
    const active = btn.dataset.s === s;
    btn.style.background    = active ? 'var(--cc-charcoal)' : 'none';
    btn.style.color         = active ? '#fff' : 'var(--cc-charcoal)';
    btn.style.borderColor   = active ? 'var(--cc-charcoal)' : 'var(--cc-rule)';
  });
  const s1 = document.getElementById('apt-gw-s1-fields');
  const s3 = document.getElementById('apt-gw-s3-fields');
  const sw = document.getElementById('apt-gw-staffel-wrap');
  if (s1) s1.style.display = s === 'S1' ? '' : 'none';
  if (s3) s3.style.display = s === 'S3' ? '' : 'none';
  if (sw) sw.style.display = s === 'S1' ? '' : 'none';
  _aptGwCalcDates();
}

/* ── GEWERBE: Nutzungszweck Freifeld ──────────────────── */
function _aptGwNutzungChange() {
  const sel  = document.getElementById('apt-gw-nutzung-select')?.value;
  const wrap = document.getElementById('apt-gw-nutzung-frei-wrap');
  if (wrap) wrap.style.display = sel === 'Sonstige' ? '' : 'none';
}

/* ── GEWERBE: Möbliert Toggle ─────────────────────────── */
function _aptGwToggleMoebliert() {
  const btn = document.getElementById('apt-gw-moebliert-btn');
  const lbl = document.getElementById('apt-gw-moebliert-lbl');
  const sub = document.getElementById('apt-gw-moebliert-sub');
  if (!btn) return;
  const on = btn.dataset.mode === 'nein';
  btn.dataset.mode  = on ? 'ja'  : 'nein';
  lbl.textContent   = on ? 'Ja' : 'Nein';
  sub.textContent   = on ? 'Inventar wird als Anlage A eingefügt' : 'Ohne Inventar';
}

/* ── GEWERBE: Staffelmiete Toggle ─────────────────────── */
function _aptGwToggleStaffel() {
  const btn  = document.getElementById('apt-gw-staffel-btn');
  const lbl  = document.getElementById('apt-gw-staffel-lbl');
  const sub  = document.getElementById('apt-gw-staffel-sub');
  const body = document.getElementById('apt-gw-staffel-body');
  if (!btn) return;
  const on = btn.dataset.mode === 'nein';
  btn.dataset.mode   = on ? 'ja'   : 'nein';
  lbl.textContent    = on ? 'Ja'   : 'Nein';
  sub.textContent    = on ? 'Aktiv': 'Keine Staffelung';
  if (body) body.style.display = on ? '' : 'none';
}

/* ── GEWERBE: Date calculations ───────────────────────── */
function _aptGwCalcDates() {
  const startVal  = document.getElementById('apt-gw-start')?.value;
  const festNum   = parseInt(document.getElementById('apt-gw-fest-num')?.value) || 0;
  const festUnit  = document.getElementById('apt-gw-fest-unit')?.value || 'Jahre';
  const intervall = parseInt(document.getElementById('apt-gw-staffel-intervall')?.value) || 1;

  const fmtDt = dt => {
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' + dt.getFullYear();
  };

  // Calculate Mietende
  let mietende = null;
  if (startVal && festNum) {
    const d = new Date(startVal);
    if (festUnit === 'Jahre') d.setFullYear(d.getFullYear() + festNum);
    else d.setMonth(d.getMonth() + festNum);
    d.setDate(d.getDate() - 1); // last day before new period
    mietende = d;
    const endDisp = document.getElementById('apt-gw-enddatum-display');
    const endVal  = document.getElementById('apt-gw-enddatum-val');
    if (endDisp && endVal) { endDisp.style.display = ''; endVal.textContent = fmtDt(d); }
  }

  // Gate "+ Staffel" button until Mietbeginn & Festlaufzeit are known
  const addBtn  = document.getElementById('apt-gw-staffel-add-btn');
  const addHint = document.getElementById('apt-gw-staffel-add-hint');
  if (addBtn) {
    addBtn.disabled = !mietende;
    addBtn.style.cursor   = mietende ? 'pointer' : 'not-allowed';
    addBtn.style.color    = mietende ? 'var(--cc-charcoal)' : 'var(--cc-stone)';
    addBtn.style.opacity  = mietende ? '1' : '.5';
  }
  if (addHint) addHint.style.display = mietende ? 'none' : '';

  // Staffel dates — start from mietende + 1 day
  if (mietende) {
    const rows = document.querySelectorAll('.apt-gw-staffel-row');
    rows.forEach((row, i) => {
      const dateLbl = row.querySelector('.apt-gw-staffel-datum');
      if (dateLbl) {
        const d2 = new Date(mietende);
        d2.setDate(d2.getDate() + 1); // day after mietende
        d2.setFullYear(d2.getFullYear() + i * intervall);
        if (i > 0) {
          // each staffel is intervall years after the previous
          const base = new Date(mietende);
          base.setDate(base.getDate() + 1);
          base.setFullYear(base.getFullYear() + i * intervall);
          dateLbl.textContent = fmtDt(base);
        } else {
          dateLbl.textContent = fmtDt(d2);
        }
      }
    });
  }

  // S3 dates
  const szenario = document.querySelector('.apt-gw-szenario-btn.active')?.dataset.s;
  if (szenario === 'S3' && mietende) {
    const verlJahre   = parseInt(document.getElementById('apt-gw-verl-jahre')?.value) || 0;
    const ankuendMon  = parseInt(document.getElementById('apt-gw-ankuend')?.value) || 0;
    const s3disp      = document.getElementById('apt-gw-s3-dates-display');
    const ankuendDisp = document.getElementById('apt-gw-ankuend-display');
    const verlBisDisp = document.getElementById('apt-gw-verl-bis-display');

    if (verlJahre && ankuendMon && s3disp) {
      const ankuendDt = new Date(mietende);
      ankuendDt.setMonth(ankuendDt.getMonth() - ankuendMon);
      const verlBisDt = new Date(mietende);
      verlBisDt.setFullYear(verlBisDt.getFullYear() + verlJahre);
      s3disp.style.display = '';
      if (ankuendDisp) ankuendDisp.textContent = fmtDt(ankuendDt);
      if (verlBisDisp) verlBisDisp.textContent = fmtDt(verlBisDt);
    } else if (s3disp) {
      s3disp.style.display = 'none';
    }
  }
}

/* ── GEWERBE: Staffel add / remove ───────────────────── */
function _aptGwAddStaffel() {
  const startVal = document.getElementById('apt-gw-start')?.value;
  const festNum  = parseInt(document.getElementById('apt-gw-fest-num')?.value) || 0;
  if (!startVal || !festNum) return; // need Mietbeginn & Festlaufzeit to compute Staffel dates
  const container = document.getElementById('apt-gw-staffel-rows');
  if (!container) return;
  const count = container.querySelectorAll('.apt-gw-staffel-row').length;
  if (count >= 4) return;
  const row = document.createElement('div');
  row.className = 'apt-gw-staffel-row';
  row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';
  row.innerHTML = `
    <input class="rm-input apt-gw-staffel-betrag" type="number" step="0.01"
      placeholder="${850 + count*50}.00"
      style="width:120px;-webkit-appearance:textfield;appearance:textfield;"
      oninput="_aptGwCalcGesamt()"/>
    <span style="font-size:11px;color:var(--cc-stone);">€ ab</span>
    <span class="apt-gw-staffel-datum" style="font-size:11px;font-weight:500;color:var(--cc-charcoal);">—</span>`;
  container.appendChild(row);
  _aptGwCalcDates();
}

function _aptGwRemoveStaffel() {
  const container = document.getElementById('apt-gw-staffel-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.apt-gw-staffel-row');
  if (rows.length > 0) rows[rows.length - 1].remove();
}

/* ── GEWERBE: Gesamt live ────────────────────────────── */
function _aptGwCalcGesamt() {
  const kalt = parseFloat(document.getElementById('apt-gw-kalt')?.value) || 0;
  const nk   = parseFloat(document.getElementById('apt-gw-nk')?.value)   || 0;
  const el   = document.getElementById('apt-gw-gesamt-val');
  if (el) el.textContent = (kalt || nk)
    ? (kalt + nk).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €'
    : '—';
  // Also sync Anfangsmiete if staffel is on
  const anfang = document.getElementById('apt-gw-staffel-anfang');
  if (anfang && !anfang.dataset.edited) anfang.value = kalt || '';
}

/* ── GEWERBE: S3 Prozent ↔ Betrag ───────────────────── */
function _aptGwCalcVerl(source) {
  const kalt    = parseFloat(document.getElementById('apt-gw-kalt')?.value) || 0;
  const nk      = parseFloat(document.getElementById('apt-gw-nk')?.value)   || 0;
  const pctEl   = document.getElementById('apt-gw-erhöhung-pct');
  const kaltEl  = document.getElementById('apt-gw-neue-kalt');
  const dispEl  = document.getElementById('apt-gw-neue-kalt-display');
  const gestEl  = document.getElementById('apt-gw-neue-gesamt-val');
  if (!pctEl || !kaltEl) return;

  let neueKalt = 0;
  if (source === 'pct') {
    const pct = parseFloat(pctEl.value) || 0;
    neueKalt = kalt * (1 + pct / 100);
    kaltEl.value = neueKalt ? neueKalt.toFixed(2) : '';
  } else {
    neueKalt = parseFloat(kaltEl.value) || 0;
    const pct = kalt ? ((neueKalt - kalt) / kalt * 100) : 0;
    pctEl.value = pct ? pct.toFixed(1) : '';
  }
  if (dispEl && gestEl && neueKalt) {
    dispEl.style.display = '';
    gestEl.textContent = (neueKalt + nk).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
  } else if (dispEl) {
    dispEl.style.display = 'none';
  }
}

/* ── GEWERBE: Mieter prefill toggle ─────────────────── */
function _toggleAptGwMieter() {
  const pill      = document.getElementById('aptGwMieterPill');
  const manualLbl = document.getElementById('aptGwMieterManualLbl');
  if (!pill) return;
  const isRoom = pill.dataset.state === 'room';
  if (isRoom) {
    pill.dataset.state = 'manual';
    document.getElementById('apt-gw-name').value  = '';
    document.getElementById('apt-gw-adr').value   = '';
    document.getElementById('apt-gw-dob').value   = '';
    document.getElementById('apt-gw-email').value = '';
    document.getElementById('apt-gw-name').focus();
    if (manualLbl) manualLbl.style.color = 'var(--cc-charcoal)';
  } else {
    pill.dataset.state = 'room';
    document.getElementById('apt-gw-name').value  = pill.dataset.tenantName  || '';
    document.getElementById('apt-gw-adr').value   = pill.dataset.tenantAdr   || '';
    document.getElementById('apt-gw-dob').value   = pill.dataset.tenantDob   || '';
    document.getElementById('apt-gw-email').value = pill.dataset.tenantEmail || '';
    if (manualLbl) manualLbl.style.color = 'var(--cc-stone)';
  }
}

/* ── GEWERBE: Init all interactions after body inject ── */
function _aptGwInitInteractions() {
  // Start with S1 active
  _aptGwSetSzenario('S1');
  // Add first staffel row by default
  _aptGwAddStaffel();
  // Sync Anfangsmiete with kaltmiete field
  document.getElementById('apt-gw-kalt')?.addEventListener('input', () => {
    const anfang = document.getElementById('apt-gw-staffel-anfang');
    if (anfang && !anfang.dataset.edited) {
      anfang.value = document.getElementById('apt-gw-kalt')?.value || '';
    }
  });
  document.getElementById('apt-gw-staffel-anfang')?.addEventListener('input', function() {
    this.dataset.edited = '1';
  });
}

function _aptToggleMvBefristung() {
  const btn     = document.getElementById('apt-mv-befristung-btn');
  const lbl     = document.getElementById('apt-mv-befristung-lbl');
  const sub     = document.getElementById('apt-mv-befristung-sub');
  const details = document.getElementById('apt-mv-befristung-details');
  if (!btn) return;
  const on = btn.dataset.mode === 'unbefristet';
  btn.dataset.mode      = on ? 'befristet'  : 'unbefristet';
  lbl.textContent       = on ? 'Ja'         : 'Nein';
  sub.textContent       = on ? 'Befristet'  : 'Unbefristet';
  details.style.display = on ? ''           : 'none';
}

function _aptUpdateMvGrundDetail() {
  const val  = document.querySelector('input[name="apt-mv-grund"]:checked')?.value;
  const wrap = document.getElementById('apt-mv-eigenbedarf-wrap');
  if (wrap) wrap.style.display = val === 'eigenbedarf' ? '' : 'none';
}

function _aptUpdateMvMonatToggle() {
  // placeholder — erster Monat logic in PDF build
}

function _toggleAptCmMieter() {
  const pill      = document.getElementById('aptCmMieterPill');
  const manualLbl = document.getElementById('aptCmMieterManualLbl');
  if (!pill) return;
  const isRoom = pill.dataset.state === 'room';
  if (isRoom) {
    pill.dataset.state = 'manual';
    document.getElementById('apt-cm-name').value  = '';
    document.getElementById('apt-cm-adr').value   = '';
    document.getElementById('apt-cm-dob').value   = '';
    document.getElementById('apt-cm-email').value = '';
    document.getElementById('apt-cm-name').focus();
    if (manualLbl) manualLbl.style.color = 'var(--cc-charcoal)';
  } else {
    pill.dataset.state = 'room';
    document.getElementById('apt-cm-name').value  = pill.dataset.tenantName  || '';
    document.getElementById('apt-cm-adr').value   = pill.dataset.tenantAdr   || '';
    document.getElementById('apt-cm-dob').value   = pill.dataset.tenantDob   || '';
    document.getElementById('apt-cm-email').value = pill.dataset.tenantEmail || '';
    if (manualLbl) manualLbl.style.color = 'var(--cc-stone)';
  }
}

function _toggleAptMvMieter() {
  const pill      = document.getElementById('aptMvMieterPill');
  const manualLbl = document.getElementById('aptMvMieterManualLbl');
  if (!pill) return;
  const isRoom = pill.dataset.state === 'room';
  if (isRoom) {
    pill.dataset.state = 'manual';
    document.getElementById('apt-mv-name').value  = '';
    document.getElementById('apt-mv-adr').value   = '';
    document.getElementById('apt-mv-dob').value   = '';
    document.getElementById('apt-mv-email').value = '';
    document.getElementById('apt-mv-name').focus();
    if (manualLbl) manualLbl.style.color = 'var(--cc-charcoal)';
  } else {
    pill.dataset.state = 'room';
    document.getElementById('apt-mv-name').value  = pill.dataset.tenantName  || '';
    document.getElementById('apt-mv-adr').value   = pill.dataset.tenantAdr   || '';
    document.getElementById('apt-mv-dob').value   = pill.dataset.tenantDob   || '';
    document.getElementById('apt-mv-email').value = pill.dataset.tenantEmail || '';
    if (manualLbl) manualLbl.style.color = 'var(--cc-stone)';
  }
}

function _toggleAptUbMieter() {
  const pill      = document.getElementById('aptUbMieterPill');
  const manualLbl = document.getElementById('aptUbMieterManualLbl');
  if (!pill) return;
  const isRoom = pill.dataset.state === 'room';
  if (isRoom) {
    pill.dataset.state = 'manual';
    document.getElementById('apt-ub-mieter-name').value = '';
    document.getElementById('apt-ub-mieter-adr').value  = '';
    document.getElementById('apt-ub-mieter-name').focus();
    if (manualLbl) manualLbl.style.color = 'var(--cc-charcoal)';
  } else {
    pill.dataset.state = 'room';
    document.getElementById('apt-ub-mieter-name').value = pill.dataset.tenantName || '';
    document.getElementById('apt-ub-mieter-adr').value  = pill.dataset.tenantAdr  || '';
    if (manualLbl) manualLbl.style.color = 'var(--cc-stone)';
  }
}


/* ── CONTRACT BODY: ÜBERGABEPROTOKOLL ───────────────────── */
function _aptBodyUeberg(apt, sk, isEinzug, profile = {}) {
  const _aptUbTenantName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const _aptUbTenantAdr  = profile.address || '';
  const _aptUbHasTenant  = !!_aptUbTenantName;
  const zaehler = apt.zaehler || [];

  const zaehlerRows = zaehler.map(z => `
    <tr>
      <td>${aptEsc(z.typ)}</td>
      <td class="rm-zaehler-nr">${aptEsc(z.zaehler_nr || '—')}</td>
      <td><input class="rm-zaehler-input" id="apt-ub-z-${z.id}" placeholder="Stand…"/></td>
    </tr>`).join('');

  return `
    ${apt.zimmer_type === 'Gewerbefläche' ? `
    <div class="rm-field"><label>Nutzungszweck</label><input class="rm-input" id="apt-ub-nutzungszweck" placeholder="z.B. Büro, Lagerfläche…"/></div>
    ` : ''}
    <div class="rm-fields-title">Mieter</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--cc-taupe);font-weight:400;" id="aptUbMieterRoomLbl">${aptEsc(apt.name)} Mieter</span>
      <div class="ub-mieter-pill" id="aptUbMieterPill"
        data-state="room"
        data-tenant-name="${aptEsc(_aptUbTenantName)}"
        data-tenant-adr="${aptEsc(_aptUbTenantAdr)}"
        onclick="_toggleAptUbMieter()">
        <div class="ub-mieter-pill__knob"></div>
      </div>
      <span style="font-size:11px;color:var(--cc-stone);" id="aptUbMieterManualLbl">Manuell</span>
    </div>
    <div class="rm-field"><label>Mieter Name</label><input class="rm-input" id="apt-ub-mieter-name" value="${aptEsc(_aptUbTenantName)}" placeholder="Vor- und Nachname…"/></div>
    <div class="rm-field"><label>Mieter Adresse</label><input class="rm-input" id="apt-ub-mieter-adr" value="${aptEsc(_aptUbTenantAdr)}" placeholder="Aktuelle Adresse…"/></div>
    <div class="rm-field"><label>Übergabedatum</label><input class="rm-input" id="apt-ub-datum" type="text" placeholder="TT.MM.JJJJ"/></div>
    ${!isEinzug ? `
    <div class="rm-field"><label>Neue Adresse des Mieters</label><input class="rm-input" id="apt-ub-neue-adr" placeholder="Neue Adresse nach Auszug…"/></div>` : ''}

    <div class="rm-field" style="margin-top:4px">
      <label>Mängelbeschreibung / Zustand</label>
      <textarea class="rm-input" id="apt-ub-maengel" rows="3" style="resize:vertical;line-height:1.5" placeholder="Zustand der Wohnung bei Übergabe…"></textarea>
    </div>

    <div class="rm-fields-title" style="margin-top:6px">Zählerstände</div>
    ${zaehler.length ? `
    <table class="rm-zaehler-table">
      <thead><tr><th style="width:28%">Art</th><th style="width:36%">Nummer</th><th>Stand</th></tr></thead>
      <tbody>${zaehlerRows}</tbody>
    </table>` : `<p style="font-size:12px;color:var(--cc-stone);font-style:italic;margin-bottom:14px">Keine Zähler hinterlegt — in Identität Zähler hinzufügen</p>`}

    <div class="rm-fields-title">Schlüsselübergabe</div>
    <div class="rm-field-row" style="margin-bottom:10px">
      <div class="rm-field"><label>Haustür</label><input class="rm-input" id="apt-ub-haustur" type="number" value="${sk.haustuerschluessel ?? 1}" min="0"/></div>
      <div class="rm-field"><label>Wohnungstür</label><input class="rm-input" id="apt-ub-wohnungtur" type="number" value="${sk.wohnungsschluessel ?? 1}" min="0"/></div>
    </div>

    <div class="rm-field">
      <label>Allgemeine Bemerkungen</label>
      <textarea class="rm-input" id="apt-ub-bemerkungen" rows="3" style="resize:vertical;line-height:1.5" placeholder="Sonstige Anmerkungen…"></textarea>
    </div>
    <div class="rm-field" style="margin-top:4px">
      <label>Unterzeichnungsdatum</label>
      <input class="rm-input" id="apt-ub-sig" type="date" onclick="try{this.showPicker()}catch(e){}"/>
    </div>`;
}


/* ── KAUTION FÄLLIGKEIT HELPER ───────────────────────────── */
function _aptKfSelect(prefix, val, clickedBtn) {
  const parent = clickedBtn.closest('div');
  parent.querySelectorAll('.rm-fael-btn').forEach(b => { b.classList.remove('active'); delete b.dataset.val; });
  clickedBtn.classList.add('active');
  clickedBtn.dataset.val = val;
  const custom = document.getElementById(`apt-${prefix}-fael-custom`);
  if (custom) custom.style.display = val === 'custom' ? '' : 'none';
}


/* ── ADD APARTMENT ───────────────────────────────────────── */
document.getElementById('aptAddBtn')?.addEventListener('click', () => {
  const list   = document.getElementById('aptList');
  const tempId = 'new-' + Date.now();

  const blank = {
    id: tempId, name: '', adresse: '', zimmer_type: '1 Zimmer', heizungsart: 'Zentralheizung',
    floor: '', flaeche_m2: null, energieklasse: '', endenergiebedarf: '', energieausweisart: '',
    vacant: false, active: true,
    pricing: {}, verwaltung: {}, zaehler: [], schlussel: {}, inventar: [],
  };

  const div = document.createElement('div');
  div.innerHTML = _aptCardHTML(blank);
  const card = div.firstElementChild;
  card.classList.add('apt--open');
  list.insertBefore(card, list.firstChild);
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Open identity section for editing immediately
  const identitySection = card.querySelector(`#apt-identity-${tempId}`);
  if (identitySection) {
    identitySection.querySelector('.apt-sec-read').style.display = 'none';
    identitySection.querySelector('.apt-sec-edit').style.display = '';
    identitySection.querySelector('.apt-input')?.focus();
  }

  // Override save for new card
  const saveBtn = identitySection?.querySelector('.apt-btn--save');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const name = identitySection.querySelector('[data-f="name"]')?.value.trim();
      if (!name) { alert('Name is required.'); return; }

      const data = { vacant: false, active: true, sort_order: appApartments.length };
      identitySection.querySelectorAll('[data-f]').forEach(inp => {
        const k = inp.dataset.f;
        data[k] = inp.type === 'number' ? (inp.value !== '' ? parseFloat(inp.value) : null) : inp.value;
      });

      saveBtn.textContent = '…'; saveBtn.disabled = true;

      if (_aptSbClient) {
        const { data: newApt, error } = await _aptSbClient.from('rentals_apartments').insert(data).select().single();
        if (error || !newApt) { saveBtn.textContent = 'Error'; saveBtn.disabled = false; return; }
        // Create linked rows
        await Promise.all([
          _aptSbClient.from('rentals_pricing').insert({ apartment_id: newApt.id }),
          _aptSbClient.from('rentals_verwaltung').insert({ apartment_id: newApt.id }),
          _aptSbClient.from('rentals_schlussel').insert({ apartment_id: newApt.id }),
        ]);
        appApartments.push({ ...newApt, pricing: {}, verwaltung: {}, zaehler: [], schlussel: {}, inventar: [] });
      }

      card.remove();
      _renderAptList();
      _aptInitSortable();
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
let _aptPendingDeleteId = null;

function _aptConfirmDelete(aptId, name) {
  _aptPendingDeleteId = aptId;
  document.getElementById('aptConfirmBody').innerHTML =
    `This will permanently delete <strong>${aptEsc(name)}</strong> and all linked data. This cannot be undone.`;
  document.getElementById('aptConfirmOverlay').classList.add('open');
}

document.getElementById('aptConfirmCancel')?.addEventListener('click', () => {
  document.getElementById('aptConfirmOverlay').classList.remove('open');
  _aptPendingDeleteId = null;
});

document.getElementById('aptConfirmOk')?.addEventListener('click', async () => {
  if (!_aptPendingDeleteId) return;
  const btn = document.getElementById('aptConfirmOk');
  btn.disabled = true;

  if (_aptSbClient) {
    // Cascade deletes via FK on delete cascade
    await _aptSbClient.from('rentals_apartments').delete().eq('id', _aptPendingDeleteId);
  }

  appApartments = appApartments.filter(a => a.id !== _aptPendingDeleteId);
  document.getElementById('aptConfirmOverlay').classList.remove('open');
  _aptPendingDeleteId = null;
  btn.disabled = false;

  _renderAptList();
  _aptInitSortable();
});


/* ── KAUTION FÄLLIGKEIT READER ───────────────────────────── */
function _aptReadKautionFael(prefix) {
  const active = document.querySelector(`.rm-fael-btn.active[data-prefix="${prefix}"]`);
  const val    = active ? (active.dataset.val || active.textContent.trim()) : null;
  if (!val || val === '5' || val === '5 Tage') return '5';
  if (val === 'sofort' || val === 'Sofort')    return 'sofort';
  if (val === 'custom' || val === 'Individuell') {
    const custom = document.getElementById(`apt-${prefix}-fael-custom`)?.value.trim();
    return custom && !isNaN(custom) ? custom : '5';
  }
  return '5';
}


/* ── CONTRACT PDF PREVIEW — close wiring (overlay is static in index.html) ── */
document.getElementById('aptCPdfPreviewClose')?.addEventListener('click', () => {
  document.getElementById('aptContractPdfPreviewOverlay').style.display = 'none';
  document.getElementById('aptContractOverlay')?.classList.add('open');
});

/* Shared helper — renders all .pdf-page nodes from container into jsPDF,
   shows desktop preview overlay or saves directly on mobile.
   Resets btnEl to resetHtml when done. */
async function _aptGenericPdfAction(container, filename, btnEl, resetHtml) {
  const { jsPDF } = window.jspdf;
  const pages = container.querySelectorAll('.pdf-page');

  if (window.innerWidth >= 701) {
    // ── Desktop: show preview overlay ───────────────────────
    const overlay   = document.getElementById('aptContractPdfPreviewOverlay');
    const doc       = document.getElementById('aptCPdfPreviewDoc');
    const titleEl   = document.getElementById('aptCPdfPreviewTitle');
    const saveBtn   = document.getElementById('aptCPdfSaveBtn');
    titleEl.textContent = filename.replace(/_/g,' ').replace('.pdf','');
    doc.innerHTML = '';
    overlay.style.display = 'flex';

    const bodyEl = document.getElementById('aptCPdfPreviewBody');
    const bodyW  = (bodyEl?.clientWidth || 400) - 32;
    const scale  = Math.min(1, bodyW / 794);
    const canvases = [];
    for (const pg of pages) {
      const canvas = await html2canvas(pg, { scale:2, useCORS:true, backgroundColor:'#ffffff', width:794, windowWidth:794 });
      canvases.push(canvas);
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'flex-shrink:0;box-shadow:0 2px 12px rgba(0,0,0,.10);border-radius:2px;overflow:hidden;';
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/jpeg', 0.95);
      img.style.cssText = `width:${794*scale}px;height:${1123*scale}px;display:block;`;
      wrapper.appendChild(img);
      doc.appendChild(wrapper);
    }
    container.remove();

    // Re-enable trigger button
    if (btnEl) { btnEl.innerHTML = resetHtml; btnEl.disabled = false; }

    // Wire save button
    const freshSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(freshSave, saveBtn);
    freshSave.addEventListener('click', async e => {
      e.stopPropagation();
      freshSave.innerHTML = '<i class="ti ti-loader"></i> Saving\u2026'; freshSave.disabled = true;
      const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
      canvases.forEach((c, i) => {
        if (i > 0) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      });
      pdf.save(filename);
      freshSave.innerHTML = '<i class="ti ti-printer" style="font-size:14px;"></i> PDF'; freshSave.disabled = false;
      overlay.style.display = 'none';
      document.getElementById('aptContractOverlay')?.classList.add('open');
    });

  } else {
    // ── Mobile: generate + save directly ────────────────────
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const canvas = await html2canvas(pages[i], { scale:3, useCORS:true, backgroundColor:'#ffffff', width:794, windowWidth:794 });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
    }
    pdf.save(filename);
    container.remove();
    if (btnEl) { btnEl.innerHTML = resetHtml; btnEl.disabled = false; }
    document.getElementById('aptContractOverlay')?.classList.add('open');
  }
}


/* ── SORTABLE ────────────────────────────────────────────── */
function _aptInitSortable() {
  if (typeof Sortable === 'undefined') return;
  const list = document.getElementById('aptList');
  if (!list || list._sortable) return;

  list._sortable = Sortable.create(list, {
    animation: 180,
    handle: '.apt-drag',
    delay: 150,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd(evt) {
      const ids = [...evt.to.querySelectorAll('.apt-card[data-id]')]
        .map(c => c.dataset.id).filter(Boolean);
      if (_aptSbClient) {
        ids.forEach((id, i) => {
          _aptSbClient.from('rentals_apartments').update({ sort_order: i }).eq('id', id);
          const a = appApartments.find(x => x.id === id);
          if (a) a.sort_order = i;
        });
      }
    }
  });
}


/* ── KURZZEIT PDF BUILDER ───────────────────────────────── */
/* ── DATA BUILDER ─────────────────────────────────────────────────────────── */

function _buildRentalKurzzeitData(apt, s, {
  mieterName, mieterAdr, mieterDob, mieterEmail,
  startVal, endVal, sigVal,
  kautionVal, kautionFael = '5',
}) {
  const fmt = d => {
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' +
           dt.getFullYear();
  };

  const p  = apt.pricing   || {};
  const sk = apt.schlussel || {};

  // Pricing: use kurzzeit-specific rates if set, else fall back to standard
  const kzKalt = Number(p.kurzzeit_kaltmiete) || Number(p.kaltmiete) || 0;
  const kzNk   = Number(p.kurzzeit_nk)        || Number(p.nk_pauschale) || 0;
  const monatlMiete = kzKalt + kzNk;

  // Date maths
  const start   = new Date(startVal);
  const end     = new Date(endVal);

  // Days in first and last month
  const daysInFirstMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const daysInLastMonth  = new Date(end.getFullYear(),   end.getMonth()   + 1, 0).getDate();

  const ersterMonatAnteilig  = start.getDate() !== 1;
  const letzterMonatAnteilig = end.getDate()   !== daysInLastMonth;

  const ersterMonatTage      = ersterMonatAnteilig  ? daysInFirstMonth  - start.getDate() + 1 : null;
  const letzterMonatTage     = letzterMonatAnteilig ? end.getDate()                           : null;
  const ersterMonatTagespreis  = ersterMonatAnteilig  ? monatlMiete / daysInFirstMonth : null;
  const letzterMonatTagespreis = letzterMonatAnteilig ? monatlMiete / daysInLastMonth  : null;
  const ersterMonatBetrag    = ersterMonatAnteilig  ? ersterMonatTagespreis  * ersterMonatTage  : null;
  const letzterMonatBetrag   = letzterMonatAnteilig ? letzterMonatTagespreis * letzterMonatTage : null;

  // Count full months between (exclusive of partial first/last)
  let fullMonthStart = new Date(start);
  if (ersterMonatAnteilig) {
    fullMonthStart = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }
  let fullMonthEnd = new Date(end);
  if (letzterMonatAnteilig) {
    fullMonthEnd = new Date(end.getFullYear(), end.getMonth(), 0);
  }
  const fullMonths = Math.max(0,
    (fullMonthEnd.getFullYear() - fullMonthStart.getFullYear()) * 12 +
    (fullMonthEnd.getMonth()    - fullMonthStart.getMonth()) + 1
  );
  const weitereZahlungen = fullMonths > 1;

  // Gesamtmiete
  const gesamtmiete =
    (ersterMonatBetrag  || (!ersterMonatAnteilig  ? monatlMiete : 0)) +
    (letzterMonatBetrag || (!letzterMonatAnteilig ? monatlMiete : 0)) +
    Math.max(0, fullMonths - (ersterMonatAnteilig ? 0 : 1) - (letzterMonatAnteilig ? 0 : 1)) * monatlMiete;

  // Zahlungsplan
  const monthName = d => d.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  const fmtDate   = d => fmt(d);

  let zahlung1Betrag, zahlung1Beschreibung, zahlung1Faellig;
  let weitereZahlungenBetrag = null;
  let letzteZahlungBetrag, letzteZahlungBeschreibung, letzteZahlungFaellig;

  if (ersterMonatAnteilig) {
    zahlung1Betrag       = ersterMonatBetrag + (fullMonths >= 1 ? monatlMiete : 0);
    zahlung1Beschreibung = ersterMonatBetrag !== null
      ? `Anteil ${monthName(start)}` + (fullMonths >= 1 ? ` + ${monthName(fullMonthStart)}` : '')
      : monthName(start);
    zahlung1Faellig = fmtDate(start);
  } else {
    zahlung1Betrag       = monatlMiete;
    zahlung1Beschreibung = monthName(start);
    zahlung1Faellig      = fmtDate(start);
  }

  if (weitereZahlungen) {
    weitereZahlungenBetrag = monatlMiete;
  }

  if (letzterMonatAnteilig) {
    letzteZahlungBetrag       = letzterMonatBetrag;
    letzteZahlungBeschreibung = `Anteil ${monthName(end)}`;
    letzteZahlungFaellig      = fmtDate(new Date(end.getFullYear(), end.getMonth(), 1));
  } else {
    letzteZahlungBetrag       = monatlMiete;
    letzteZahlungBeschreibung = monthName(end);
    letzteZahlungFaellig      = fmtDate(new Date(end.getFullYear(), end.getMonth(), 1));
  }

  // Inventar
  const inventar = (apt.inventar || []).map(i => ({
    gegenstand: i.name || i.gegenstand || '',
    anzahl:     i.anzahl || 1,
  }));

  return {
    vermieterName:    s.vermieter_name    || '',
    vermieterAdresse: s.vermieter_adresse || '',
    vermieterEmail:   s.vermieter_email   || '',
    vermieterSig:     s.vermieter_name    || '',
    objektAdresse:    apt.adresse         || s.objekt_adresse || '',
    objektPLZOrt:     apt.plz_ort         || s.objekt_plz_ort || '',
    footerAdresse:    (apt.adresse || s.objekt_adresse || '') + (apt.plz_ort || s.objekt_plz_ort ? ' \u00b7 ' + (apt.plz_ort || s.objekt_plz_ort || '') : ''),
    kontoinhaber:     s.kontoinhaber      || '',
    bankname:         s.bankname          || '',
    iban:             s.iban              || '',
    bic:              s.bic               || '',
    gerichtsstand:    s.gerichtsstand     || 'Wiesbaden',
    unterschriftOrt:  s.unterschrift_ort  || 'Wiesbaden',
    mieterName,
    mieterAdresse:      mieterAdr   || '',
    mieterGeburtsdatum: mieterDob   || '',
    mieterEmail:        mieterEmail || '',
    wohnungName:        apt.name,
    wohnungFlaeche:     apt.flaeche_m2 || 0,
    gemeinschaftsraeume: '',   // apartments don't have shared-room lists
    mietbeginn:  startVal ? fmt(new Date(startVal)) : '',
    mietende:    endVal   ? fmt(new Date(endVal))   : '',
    monatlMiete,
    gesamtmiete,
    ersterMonatAnteilig,
    letzterMonatAnteilig,
    ersterMonatTage,
    ersterMonatTagespreis,
    ersterMonatBetrag,
    letzterMonatTage,
    letzterMonatTagespreis,
    letzterMonatBetrag,
    weitereZahlungen,
    zahlung1Betrag,
    zahlung1Beschreibung,
    zahlung1Faellig,
    weitereZahlungenBetrag,
    letzteZahlungBetrag,
    letzteZahlungBeschreibung,
    letzteZahlungFaellig,
    kaution:              Number(kautionVal) || monatlMiete,
    kautionFaelText:      kautionFael === 'sofort' ? 'sofort nach Vertragsunterzeichnung' : `binnen ${kautionFael}\u00a0Tagen`,
    hausstuerschluessel:  sk.haustuerschluessel  || 1,
    wohnungsschluessel:   sk.wohnungsschluessel   || 1,
    inventar,
    unterzeichnungsDatum: sigVal ? fmt(new Date(sigVal)) : '',
  };
}


/* ── PDF HTML RENDERER ────────────────────────────────────────────────────── */

function _renderRentalKurzzeitHTML(d) {

  const fmtN = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur  = n => fmtN(n) + ' \u20ac';

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:62px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#aaa59e; margin-bottom:28px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:14px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:0; }
    .sec--lg { font-size:8.5px; margin-top:22px; }
    .sec--lg.sec--first { margin-top:0; }
    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#6a6560; min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:11px; font-weight:400; color:#1a1a1a; flex:1; line-height:1.55; }
    .kv-gap { height:10px; }
    .total-box { background:#f0e8d8; border-radius:3px; padding:9px 10px; display:flex; justify-content:space-between; align-items:center; margin-top:10px; margin-bottom:24px; }
    .total-box__label, .total-box__value { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:700; color:#8a6535; line-height:1; }
    .note { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#6a6560; margin-top:10px; line-height:1.55; }
    .nk-intro { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#3a3530; line-height:1.55; margin-top:7px; margin-bottom:10px; }
    .nk-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:24px; }
    .nk-item { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; padding:2.5px 0; line-height:1.4; }
    .nk-item--full { grid-column:1/-1; border-bottom:none; }
    .clause { margin-top:8px; }
    .clause--first { margin-top:16px; }
    .clause__title { font-family:'Lato',sans-serif; font-size:11px; font-weight:700; color:#4a4540; margin-bottom:2px; line-height:1.4; }
    .clause__body { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#3a3530; line-height:1.55; }
    .inv-table { width:100%; border-collapse:collapse; margin-top:6px; }
    .inv-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; text-align:left; }
    .inv-table td { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#1a1a1a; padding:3.5px 0; line-height:1.55; }
    .comment-label { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:32px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .comment-line { border-bottom:0.5px solid #e0dbd4; height:26px; margin-top:2px; }
    .sig-block { margin-top:40px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#aaa59e; margin-bottom:4px; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-write-gap { height:60px; }
    .sig-line { border:none; border-top:0.6px solid #3a3530; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }
  `;

  const hdr = name => `<div class="hdr"><span class="hdr__wordmark">Casa Castel</span><div class="hdr__room"><span class="hdr__room-label">Wohnung</span><span class="hdr__room-name">${name}</span></div></div>`;
  const ftr = n    => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${d.footerAdresse}</span><span>${n}</span></div></div>`;
  const kv  = (k,v)=> `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const sec = (t,lg,first) => `<div class="sec${lg?' sec--lg':''}${first?' sec--first':''}">${t}</div>`;
  const cl  = (num,title,body,first) => `<div class="clause${first?' clause--first':''}"><div class="clause__title">\u00a7\u00a0${num}\u2002${title}</div><div class="clause__body">${body}</div></div>`;

  const sigBlock = () => `<div class="sig-block">
    <div class="sig-col">
      ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Vermieter</div><div class="sig-name">${d.vermieterSig}</div>
    </div>
    <div class="sig-col">
      ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter</div><div class="sig-name">${d.mieterName}</div>
    </div>
  </div>`;

  // Full §§ 1, 2 BetrKV list — same as Mietvertrag, broad / Hausverwaltung-safe
  const NK_ITEMS = [
    'Laufende öffentliche Lasten (Grundsteuer)',
    'Wasserversorgung',
    'Entwässerung / Abwasser',
    'Betrieb der zentralen Heizungsanlage inkl. Abgasanlage',
    'Betrieb der zentralen Warmwasserversorgungsanlage',
    'Verbundene Heizungs- &amp; Warmwasserversorgungsanlage',
    'Personen- oder Lastenaufzug',
    'Straßenreinigung &amp; Müllbeseitigung',
    'Gebäudereinigung &amp; Ungezieferbekämpfung',
    'Gartenpflege',
    'Beleuchtung (Gemeinschaftsflächen)',
    'Schornsteinreinigung',
    'Sach- &amp; Haftpflichtversicherung',
    'Hauswart',
    'Gemeinschaftsantennenanlage / Breitbandkabelnetz',
    'Einrichtungen für die Wäschepflege',
    'Winterdienst',
  ];
  const nkRows = NK_ITEMS.map(i => `<div class="nk-item">${i}</div>`).join('') +
    `<div class="nk-item nk-item--full">Sonstige Betriebskosten i.\u202fs.\u202fd. \u00a7\u00a72 Nr.\u00a017 BetrKV (insbes. Wartung Heizung, Enthärtungsanlage, sonstige Anlagen)</div>`;

  const invRows = d.inventar.length
    ? d.inventar.map(i => `<tr><td>${i.gegenstand}</td><td>${i.anzahl}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:#aaa59e;font-size:10px;padding-top:6px;">Kein Inventar hinterlegt</td></tr>`;

  // ── PAGE 1: Parteien, Mietobjekt, Mietzeit & Mietzins, Zahlungsplan ───────

  const page1 = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(1)}
  <div class="content">
    <div class="doc-title">Kurzzeitmiete</div>
    <div class="doc-subtitle">Befristetes Mietverhältnis \u00b7 Wohnungsvermietung</div>
    ${sec('Vermieter',false,true)}
    ${kv('Name',d.vermieterName)}${kv('Adresse',d.vermieterAdresse)}
    ${d.vermieterEmail?kv('E-Mail',d.vermieterEmail):''}
    ${sec('Mieter',false,false)}
    ${kv('Name',d.mieterName)}${kv('Adresse',d.mieterAdresse)}
    ${kv('Geburtsdatum',d.mieterGeburtsdatum)}
    ${d.mieterEmail?kv('E-Mail',d.mieterEmail):''}
    ${sec('Mietobjekt',false,false)}
    ${kv('Adresse',d.objektAdresse + (d.objektPLZOrt ? ', ' + d.objektPLZOrt : ''))}${kv('Bezeichnung',d.wohnungName)}
    ${kv('Wohnungsgröße','ca.\u00a0'+d.wohnungFlaeche+'\u00a0m\u00b2')}
    ${kv('Möblierung','Möbliert\u2002\u00b7\u2002Inventar siehe Anlage\u00a0A')}
    ${sec('Mietzeit &amp; Mietzins',false,false)}
    ${kv('Mietbeginn',d.mietbeginn||'—')}
    ${kv('Mietende',  d.mietende  ||'—')}
    ${d.ersterMonatAnteilig
      ? kv('Anteil erster Monat', eur(d.ersterMonatBetrag) + '\u2002(' + d.ersterMonatTage + ' Tage \u00d7 ' + eur(d.ersterMonatTagespreis) + '/Tag)')
      : ''}
    ${kv('Monatliche Miete', eur(d.monatlMiete) + '\u2002/ Monat (Vollmonat, pauschal inkl. NK)')}
    ${d.letzterMonatAnteilig
      ? kv('Anteil letzter Monat', eur(d.letzterMonatBetrag) + '\u2002(' + d.letzterMonatTage + ' Tage \u00d7 ' + eur(d.letzterMonatTagespreis) + '/Tag)')
      : ''}
    <div class="total-box"><span class="total-box__label">Gesamtmiete:</span><span class="total-box__value">${eur(d.gesamtmiete)}</span></div>
    ${sec('Zahlungsplan &amp; Bankverbindung',true,false)}
    ${kv('1. Zahlung', eur(d.zahlung1Betrag) + '\u2002(' + d.zahlung1Beschreibung + '), fällig am ' + d.zahlung1Faellig)}
    ${d.weitereZahlungen
      ? kv('Weitere Zahlungen', eur(d.weitereZahlungenBetrag) + '\u2002monatlich, jeweils fällig 3.\u00a0Werktag')
      : ''}
    ${kv('Letzte Zahlung', eur(d.letzteZahlungBetrag) + '\u2002(' + d.letzteZahlungBeschreibung + '), fällig am ' + d.letzteZahlungFaellig)}
    ${kv('Kaution', eur(d.kaution) + '\u2002(fällig ' + d.kautionFaelText + (d.kautionFaelText.startsWith('sofort') ? ')' : ' nach Vertragsunterzeichnung)'))}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber',d.kontoinhaber)}${kv('Bank',d.bankname)}${kv('IBAN',d.iban)}${kv('BIC',d.bic)}
    <p class="note">Alle Zahlungen per Überweisung. Verwendungszweck: Casa Castel \u2013 ${d.wohnungName} \u2013 Miete Monat Jahr / Kaution.</p>
  </div>
</div>`;

  // ── PAGE 2: NK-Liste + Klauseln §1–§10 ────────────────────────────────────

  const page2 = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(2)}
  <div class="content">
    ${sec('Betriebskosten gem. \u00a7\u00a71,\u00a02 BetrKV',true,true)}
    <p class="nk-intro">Die monatliche Miete versteht sich als Warmmiete pauschal inkl. aller nachfolgenden Betriebskosten gemäß §§\u00a01,\u00a02 BetrKV. Umlageschlüssel: Wohnfläche der Mietwohnung im Verhältnis zur Gesamtwohnfläche des Gebäudes. Heizung und Warmwasser werden nach den Vorschriften der Heizkostenverordnung abgerechnet. Entstehen nach Vertragsschluss neue Betriebskosten i.\u202fS.\u202fd. BetrKV, können diese vom Vermieter auf den Mieter umgelegt werden.</p>
    <div class="nk-grid">${nkRows}</div>
    ${cl('1','Befristung und Beendigung',
      'Das Mietverhältnis ist gemäß \u00a7\u00a0575 Abs.\u00a01 Nr.\u00a03 BGB auf ausdrücklichen Wunsch des Mieters befristet. Das Mietverhältnis endet am ' + d.mietende + ' automatisch ohne Kündigung. Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen. Ein Anspruch auf Verlängerung besteht nicht.',
      true)}
    ${cl('2','Mietzins &amp; Anteilige Berechnung',
      'Die monatliche Pauschalmiete beträgt ' + eur(d.monatlMiete) + '. Zieht der Mieter nicht zum ersten eines Monats ein oder zum letzten eines Monats aus, werden die Tage anteilig berechnet. Der Tagespreis ergibt sich aus der Monatsmiete geteilt durch die tatsächliche Anzahl der Kalendertage des jeweiligen Monats. Alle Nebenkosten (Betriebskosten gemäß obiger Liste) sind in der Pauschale enthalten.')}
    ${cl('3','Fälligkeit der Mietzahlungen',
      'Die Miete ist jeweils spätestens bis zum dritten Werktag des fälligen Monats zu überweisen (\u00a7\u00a0556b BGB). Bei Zahlungsverzug ist der Vermieter berechtigt, Verzugszinsen gemäß \u00a7\u00a0288 BGB geltend zu machen.')}
    ${cl('4','Kaution',
      'Der Mieter zahlt eine Kaution von ' + eur(d.kaution) + ' ' + d.kautionFaelText + (d.kautionFaelText.startsWith('sofort') ? '' : ' nach Vertragsunterzeichnung') + '. Der Vermieter legt die Barkaution getrennt von seinem Vermögen auf einem Kautionskonto an (\u00a7\u00a0551 BGB). Vom Mieter selbstverschuldete Schäden werden von der Kaution abgezogen. Kleinreparaturen bis 100\u202f\u20ac pro Schadensfall gehen zu Lasten des Mieters (\u00a7\u00a0535 BGB). Der verbleibende Betrag wird nach Prüfung des Zustands zurückerstattet.')}
    ${cl('5','Schlüsselübergabe',
      'Der Mieter erhält bei Einzug ' + d.hausstuerschluessel + '\u00a0Haustürschlüssel und ' + d.wohnungsschluessel + '\u00a0Wohnungsschlüssel. Alle Schlüssel sind bei Auszug zurückzugeben. Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs.')}
    ${cl('6','Zustand &amp; Übergabe',
      'Die Wohnung wird möbliert und in vertragsgemäßem Zustand übergeben. Ein Übergabeprotokoll wird bei Ein- und Auszug erstellt und von beiden Parteien unterzeichnet. Die Wohnung ist in gleichem Zustand zurückzugeben.')}
    ${cl('7','Haftpflichtversicherung',
      'Der Mieter ist verpflichtet, für die Dauer des Mietverhältnisses eine gültige private Haftpflichtversicherung zu unterhalten und dem Vermieter auf Verlangen nachzuweisen.')}
    ${cl('8','Hausordnung',
      'Rauchen ist im gesamten Gebäude nicht gestattet. Haustiere sind ohne schriftliche Zustimmung nicht erlaubt. Untervermietung ist untersagt. Nachtruhe gilt von 22:00–07:00\u202fUhr.')}
    ${cl('9','Datenschutz',
      'Personenbezogene Daten werden ausschließlich zur Vertragsabwicklung gespeichert (Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO) und nach Ablauf der gesetzlichen Aufbewahrungsfrist gelöscht.')}
    ${cl('10','Salvatorische Klausel &amp; Gerichtsstand',
      'Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Es gilt deutsches Recht. Gerichtsstand ist ' + d.gerichtsstand + '.')}
  </div>
</div>`;

  // ── PAGE 3: Inventar, Anmerkungen, Unterschriften ──────────────────────────

  const page3 = `<div class="pdf-page page">
  ${hdr(d.wohnungName)}${ftr(3)}
  <div class="content">
    ${sec('Anlage A \u2014 Inventar',true,true)}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anzahl</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>
    <div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div>
    ${sigBlock()}
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Kurzzeitmiete \u2014 ${d.wohnungName}</title>
<style>${CSS}</style></head>
<body>${page1}${page2}${page3}</body></html>`;
}


/* ── PDF GENERATOR ────────────────────────────────────────────────────────── */

async function _generateRentalKurzzeitPDF() {
  const container = document.getElementById('_pdfRenderContainer');
  if (!container) return;
  const pages = container.querySelectorAll('.pdf-page');
  if (!pages.length) return;
  const { jsPDF } = window.jspdf;
  const pdf  = new jsPDF({ unit:'px', format:'a4', orientation:'portrait' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false });
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfW, pdfH);
  }
  const wohnungName = container.querySelector('.hdr__room-name')?.textContent?.trim() || 'Wohnung';
  const mieterName  = [...(container.querySelectorAll('.kv__v')||[])]
    .find(el => el.previousElementSibling?.textContent?.includes('Name'))
    ?.textContent?.trim() || 'Mieter';
  pdf.save(`Kurzzeitmiete_${wohnungName}_${mieterName.replace(/\s+/g,'_')}.pdf`);
}


/* ── MIETVERTRAG PDF BUILDER ────────────────────────────── */
/* ── DATA BUILDER ─────────────────────────────────────────────────────────── */

function _buildRentalMietvertragData(room, s, {
  mieterName, mieterAdr, mieterDob, mieterEmail,
  startVal, sigVal,
  befristet = false, endVal = null,
  grundVal = '', eigenbedarfPerson = '',
  kautionFael = '5',
}) {
  const fmt = d => {
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' +
           dt.getFullYear();
  };

  const _gem = room.gemeinschaftsraeume;
  const gemStr = Array.isArray(_gem) ? _gem.join(', ') : (typeof _gem === 'string' ? _gem : '');

  let kaltmiete, nkVorauszahlung, gesamtmiete, pricingMode;
  if (room.mietvertrag_pricing === 'kalt_nk' && room.kaltmiete) {
    kaltmiete       = Number(room.kaltmiete);
    nkVorauszahlung = Number(room.nk_pauschale) || 0;
    gesamtmiete     = kaltmiete + nkVorauszahlung;
    pricingMode     = 'kalt_nk';
  } else {
    kaltmiete       = Number(room.kaltmiete) || Number(room.mietvertrag_miete) || Number(room.monatl_miete) || 0;
    nkVorauszahlung = Number(room.nk_pauschale) || 0;
    gesamtmiete     = kaltmiete + nkVorauszahlung;
    pricingMode     = 'pauschal';
  }

  // Pauschal: kaution base = full monthly charge (kaltmiete + NK)
  // Kalt+NK:  kaution base = kaltmiete only (§ 551 BGB)
  const kautionBase = pricingMode === 'pauschal' ? kaltmiete + nkVorauszahlung : kaltmiete;
  const kaution = room.kaution_override && room.kaution_default
    ? Number(room.kaution_default)
    : kautionBase * 3;

  const grundLabels = {
    eigenbedarf: 'Eigenbedarf (§\u00a0575 Abs.\u00a01 Nr.\u00a01 BGB)',
    abriss:      'Abriss / wesentliche Umbaumaßnahmen (§\u00a0575 Abs.\u00a01 Nr.\u00a03 BGB)',
    dienst:      'Dienstwohnung (§\u00a0575 Abs.\u00a01 Nr.\u00a02 BGB)',
  };

  return {
    vermieterName:    s.vermieter_name    || '',
    vermieterAdresse: s.vermieter_adresse || '',
    vermieterEmail:   s.vermieter_email   || '',
    vermieterSig:     s.vermieter_name    || '',
    objektAdresse:    s.objekt_adresse    || '',
    objektPLZOrt:     s.objekt_plz_ort    || '',
    footerAdresse:    s.objekt_adresse ? s.objekt_adresse + ' \u00b7 ' + (s.objekt_plz_ort || '') : '',
    kontoinhaber:     s.kontoinhaber      || '',
    bankname:         s.bankname          || '',
    iban:             s.iban              || '',
    bic:              s.bic               || '',
    gerichtsstand:    s.gerichtsstand     || 'Wiesbaden',
    unterschriftOrt:  s.unterschrift_ort  || 'Wiesbaden',
    mieterName,
    mieterAdresse:      mieterAdr   || '',
    mieterGeburtsdatum: mieterDob   || '',
    mieterEmail:        mieterEmail || '',
    zimmerName:          room.name,
    zimmerFlaeche:       room.flaeche_m2 || 0,
    gemeinschaftsraeume: gemStr,
    mietbeginn: startVal ? fmt(new Date(startVal)) : '',
    befristet,
    mietende:         befristet && endVal ? fmt(new Date(endVal)) : '',
    grundLabel:       grundLabels[grundVal] || '',
    eigenbedarfPerson: eigenbedarfPerson || '',
    pricingMode,
    kaltmiete,
    nkVorauszahlung,
    gesamtmiete,
    kaution,
    kautionFaelText: kautionFael === 'sofort' ? 'sofort nach Vertragsunterzeichnung' : `binnen ${kautionFael}\u00a0Tagen`,
    hausstuerschluessel: room.haustuerschluessel || 1,
    zimmerschluessel:    room.zimmerschluessel    || 1,
    inventar: Array.isArray(room.inventar) ? room.inventar : [],
    unterzeichnungsDatum: sigVal ? fmt(new Date(sigVal)) : '',
  };
}


/* ── MODAL BODY ───────────────────────────────────────────────────────────── */

function _contractBodyRentalMietvertrag(room) {
  const s       = appSettings;
  const profile = (typeof _rntGetProfile === 'function') ? _rntGetProfile(room.id) : {};

  const tenantName  = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const tenantEmail = profile.email || '';
  let   tenantDob   = profile.birthday || '';
  if (tenantDob && tenantDob.includes('-') && tenantDob.length === 10) {
    const [y, m, day] = tenantDob.split('-');
    tenantDob = `${day}.${m}.${y}`;
  }

  const _gem2 = room.gemeinschaftsraeume;
  const gemStr = (Array.isArray(_gem2) ? _gem2.join(', ') : (typeof _gem2 === 'string' ? _gem2 : '')) || '—';
  const _fmtEUR = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const schluessel = `Haustür \u00d7${room.haustuerschluessel || 1} \u00b7 Zimmer \u00d7${room.zimmerschluessel || 1}`;

  let kaltDisplay, gesamtDisplay;
  if (room.mietvertrag_pricing === 'kalt_nk' && room.kaltmiete) {
    const kalt = Number(room.kaltmiete) || 0;
    const nk   = Number(room.nk_pauschale) || 0;
    kaltDisplay   = `${_fmtEUR(kalt)} kalt + ${_fmtEUR(nk)} NK`;
    gesamtDisplay = _fmtEUR(kalt + nk);
  } else {
    const kalt = Number(room.kaltmiete) || Number(room.mietvertrag_miete) || Number(room.monatl_miete) || 0;
    const nk   = Number(room.nk_pauschale) || 0;
    kaltDisplay   = `${_fmtEUR(kalt + nk)} pauschal inkl. NK`;
    gesamtDisplay = _fmtEUR(kalt + nk);
  }

  const kaltBase = Number(room.kaltmiete || room.mietvertrag_miete || room.monatl_miete) || 0;
  const nkBase   = room.mietvertrag_pricing !== 'kalt_nk' ? (Number(room.nk_pauschale) || 0) : 0;
  const kaution  = room.kaution_override && room.kaution_default
    ? Number(room.kaution_default)
    : (kaltBase + nkBase) * 3;

  return `
    <div class="rm-prefilled">
      <div class="rm-prefilled__title">Pre-filled from room &amp; profile</div>
      <div class="rm-pre-row"><span>Room</span><span>${esc(room.name)}</span></div>
      <div class="rm-pre-row"><span>Größe</span><span>ca. ${room.flaeche_m2 || '—'} m\u00b2</span></div>
      <div class="rm-pre-row"><span>Gemeinschaft</span><span>${esc(gemStr)}</span></div>
      <div class="rm-pre-row"><span>Miete</span><span>${kaltDisplay}</span></div>
      <div class="rm-pre-row"><span>Gesamtmiete</span><span>${gesamtDisplay} / Monat</span></div>
      <div class="rm-pre-row"><span>Vermieter</span><span>${esc(s.vermieter_name || '—')}</span></div>
      <div class="rm-pre-row"><span>IBAN</span><span>${esc(s.iban || '—')}</span></div>
      <div class="rm-pre-row"><span>Schlüssel</span><span>${esc(schluessel)}</span></div>
    </div>

    <div class="rm-kaution-row">
      <div>
        <div class="rm-kaution-lbl">Kaution (§ 551 BGB)</div>
        <div class="rm-kaution-rule">3 \u00d7 Kaltmiete</div>
      </div>
      <div class="rm-kaution-val">${_fmtEUR(kaution)}</div>
    </div>

    <div class="rm-fields-title" style="margin-top:2px;">Mieterdaten</div>

    <div class="rm-field">
      <label>Name</label>
      <input class="rm-input" id="rv-name" value="${esc(tenantName)}" placeholder="Vor- und Nachname\u2026"/>
    </div>
    <div class="rm-field">
      <label>Adresse <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(manuell)</span></label>
      <input class="rm-input" id="rv-adr" placeholder="Aktuelle Adresse\u2026"/>
    </div>
    <div class="rm-field">
      <label>Geburtsdatum</label>
      <input class="rm-input" id="rv-dob" value="${esc(tenantDob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/>
    </div>
    <div class="rm-field">
      <label>E-Mail</label>
      <input class="rm-input" id="rv-email" type="email" value="${esc(tenantEmail)}" placeholder="mieter@beispiel.de"/>
    </div>

    <div class="rm-fields-title" style="margin-top:6px;">Mietzeit</div>

    <div class="rm-field">
      <label>Mietbeginn</label>
      <input class="rm-input" id="rv-start" type="date"/>
    </div>

    <div class="rm-field--toggle" style="margin-bottom:10px;">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Befristung</div>
          <div class="rm-toggle-sub" id="rv-befristung-sub">Unbefristet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="rv-befristung-btn"
          data-mode="unbefristet" onclick="_toggleRentalMvBefristung()">
          <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
          <span class="rm-pill-toggle__lbl" id="rv-befristung-lbl">Nein</span>
        </button>
      </div>
    </div>

    <div id="rv-befristung-details" style="display:none;">
      <div class="rm-field">
        <label>Mietende</label>
        <input class="rm-input" id="rv-end" type="date"/>
      </div>
      <div class="rm-field">
        <label>Befristungsgrund <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(§ 575 BGB \u2014 Pflicht)</span></label>
        <div style="display:flex;flex-direction:column;gap:7px;margin-top:2px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="rv-grund" value="eigenbedarf" checked
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateRentalMvGrundDetail()"/>
            Eigenbedarf
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="rv-grund" value="abriss"
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateRentalMvGrundDetail()"/>
            Abriss / wesentliche Umbaumaßnahmen
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="rv-grund" value="dienst"
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateRentalMvGrundDetail()"/>
            Dienstwohnung (§ 575 Abs. 1 Nr. 2 BGB)
          </label>
        </div>
      </div>
      <div class="rm-field" id="rv-eigenbedarf-wrap">
        <label>Eigenbedarfsperson <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(Pflicht nach BGH)</span></label>
        <input class="rm-input" id="rv-eigenbedarf-person"
          placeholder="z.\u202fB. Tochter des Vermieters, Eigennutzung durch Vermieter\u2026"/>
      </div>
    </div>

    <div class="rm-field" style="margin-top:4px;">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(optional)</span></label>
      <input class="rm-input" id="rv-sig" type="date"/>
    </div>`;
}

function _toggleRentalMvBefristung() {
  const btn     = document.getElementById('rv-befristung-btn');
  const lbl     = document.getElementById('rv-befristung-lbl');
  const sub     = document.getElementById('rv-befristung-sub');
  const details = document.getElementById('rv-befristung-details');
  if (!btn) return;
  const on      = btn.dataset.mode === 'unbefristet';
  btn.dataset.mode    = on ? 'befristet'   : 'unbefristet';
  lbl.textContent     = on ? 'Ja'          : 'Nein';
  sub.textContent     = on ? 'Befristet'   : 'Unbefristet';
  details.style.display = on ? '' : 'none';
}

function _updateRentalMvGrundDetail() {
  const val  = document.querySelector('input[name="rv-grund"]:checked')?.value;
  const wrap = document.getElementById('rv-eigenbedarf-wrap');
  if (wrap) wrap.style.display = val === 'eigenbedarf' ? '' : 'none';
}


/* ── PDF HTML RENDERER ────────────────────────────────────────────────────── */

function _renderRentalMietvertragHTML(d) {

  const fmtN = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur  = n => fmtN(n) + ' \u20ac';

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:62px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#aaa59e; margin-bottom:28px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:14px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:0; }
    .sec--lg { font-size:8.5px; margin-top:22px; }
    .sec--lg.sec--first { margin-top:0; }
    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#6a6560; min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:11px; font-weight:400; color:#1a1a1a; flex:1; line-height:1.55; }
    .kv-gap { height:10px; }
    .total-box { background:#f0e8d8; border-radius:3px; padding:9px 10px; display:flex; justify-content:space-between; align-items:center; margin-top:10px; margin-bottom:24px; }
    .total-box__label, .total-box__value { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:700; color:#8a6535; line-height:1; }
    .note { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#6a6560; margin-top:10px; line-height:1.55; }
    .nk-intro { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#3a3530; line-height:1.55; margin-top:7px; margin-bottom:10px; }
    .nk-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:24px; }
    .nk-item { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; padding:2.5px 0; line-height:1.4; }
    .nk-item--full { grid-column:1/-1; border-bottom:none; }
    .clause { margin-top:8px; }
    .clause--first { margin-top:52px; }
    .clause__title { font-family:'Lato',sans-serif; font-size:11px; font-weight:700; color:#4a4540; margin-bottom:2px; line-height:1.4; }
    .clause__body { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#3a3530; line-height:1.55; }
    .inv-table { width:100%; border-collapse:collapse; margin-top:6px; }
    .inv-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; text-align:left; }
    .inv-table td { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#1a1a1a; padding:3.5px 0; line-height:1.55; }
    .comment-label { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:48px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .comment-line { border-bottom:0.5px solid #e0dbd4; height:26px; margin-top:2px; }
    .sig-block { margin-top:52px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#aaa59e; margin-bottom:4px; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-write-gap { height:60px; }
    .sig-line { border:none; border-top:0.6px solid #3a3530; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }
  `;

  const hdr = room => `<div class="hdr"><span class="hdr__wordmark">Casa Castel</span><div class="hdr__room"><span class="hdr__room-label">Wohnung</span><span class="hdr__room-name">${room}</span></div></div>`;
  const ftr = n    => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${d.footerAdresse}</span><span>${n}</span></div></div>`;
  const kv  = (k,v)=> `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const sec = (t,lg,first) => `<div class="sec${lg?' sec--lg':''}${first?' sec--first':''}">${t}</div>`;
  const cl  = (num,title,body,first) => `<div class="clause${first?' clause--first':''}"><div class="clause__title">\u00a7\u00a0${num}\u2002${title}</div><div class="clause__body">${body}</div></div>`;

  const sigBlock = () => `<div class="sig-block">
    <div class="sig-col">
      ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Vermieter</div><div class="sig-name">${d.vermieterSig}</div>
    </div>
    <div class="sig-col">
      ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
      <div class="sig-write-gap"></div><hr class="sig-line"/>
      <div class="sig-role">Mieter</div><div class="sig-name">${d.mieterName}</div>
    </div>
  </div>`;

  // Full §§ 1, 2 BetrKV list — broad / Hausverwaltung-safe for apartment rentals
  const NK_ITEMS = [
    'Laufende öffentliche Lasten (Grundsteuer)',
    'Wasserversorgung',
    'Entwässerung / Abwasser',
    'Betrieb der zentralen Heizungsanlage inkl. Abgasanlage',
    'Betrieb der zentralen Warmwasserversorgungsanlage',
    'Verbundene Heizungs- &amp; Warmwasserversorgungsanlage',
    'Personen- oder Lastenaufzug',
    'Straßenreinigung &amp; Müllbeseitigung',
    'Gebäudereinigung &amp; Ungezieferbekämpfung',
    'Gartenpflege',
    'Beleuchtung (Gemeinschaftsflächen)',
    'Schornsteinreinigung',
    'Sach- &amp; Haftpflichtversicherung',
    'Hauswart',
    'Gemeinschaftsantennenanlage / Breitbandkabelnetz',
    'Einrichtungen für die Wäschepflege',
    'Winterdienst',
  ];
  const nkRows = NK_ITEMS.map(i => `<div class="nk-item">${i}</div>`).join('') +
    `<div class="nk-item nk-item--full">Sonstige Betriebskosten i.\u202fs.\u202fd. \u00a7\u00a72 Nr.\u00a017 BetrKV (insbes. Wartung Heizung, Enthärtungsanlage, sonstige Anlagen)</div>`;

  const invRows = d.inventar.length
    ? d.inventar.map(i => `<tr><td>${i.gegenstand}</td><td>${i.anzahl}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:#aaa59e;font-size:10px;padding-top:6px;">Kein Inventar hinterlegt</td></tr>`;

  const subtitle = d.befristet
    ? 'Befristetes Mietverhältnis \u00b7 Wohnungsvermietung'
    : 'Unbefristetes Mietverhältnis \u00b7 Wohnungsvermietung';

  const page1 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(1)}
  <div class="content">
    <div class="doc-title">Mietvertrag</div>
    <div class="doc-subtitle">${subtitle}</div>
    ${sec('Vermieter',false,true)}
    ${kv('Name',d.vermieterName)}${kv('Adresse',d.vermieterAdresse)}
    ${d.vermieterEmail?kv('E-Mail',d.vermieterEmail):''}
    ${sec('Mieter',false,false)}
    ${kv('Name',d.mieterName)}${kv('Adresse',d.mieterAdresse)}
    ${kv('Geburtsdatum',d.mieterGeburtsdatum)}
    ${d.mieterEmail?kv('E-Mail',d.mieterEmail):''}
    ${sec('Mietobjekt',false,false)}
    ${kv('Adresse',d.objektAdresse + (d.objektPLZOrt ? ', ' + d.objektPLZOrt : ''))}${kv('Bezeichnung',d.zimmerName)}
    ${kv('Wohnungsgröße','ca.\u00a0'+d.zimmerFlaeche+'\u00a0m\u00b2')}
    ${kv('Mitgenutzte Räume',d.gemeinschaftsraeume||'—')}
    ${kv('Möblierung','Möbliert\u2002\u00b7\u2002Inventar siehe Anlage\u00a0A')}
    ${sec('Mietzeit',false,false)}
    ${kv('Mietbeginn',d.mietbeginn||'—')}
    ${d.befristet
      ? ''
      : kv('Kündigung','3\u00a0Monate (Mieter) / gestaffelt (Vermieter) \u00b7 \u00a7\u00a0573c BGB \u00b7 Schriftform')
        + kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verlängerung')
    }
    ${sec('Miete &amp; Bankverbindung',true,false)}
    ${d.pricingMode==='kalt_nk'
      ? kv('Kaltmiete',eur(d.kaltmiete)+'\u2002/ Monat')
        + kv('Nebenkosten VZ',eur(d.nkVorauszahlung)+'\u2002/ Monat (Vorauszahlung)')
      : kv('Pauschalmiete',eur(d.gesamtmiete)+'\u2002/ Monat (inkl. NK)')
    }
    <div class="total-box"><span class="total-box__label">Gesamtmiete monatlich:</span><span class="total-box__value">${eur(d.gesamtmiete)}</span></div>
    ${kv('Fälligkeit','Spätestens 3.\u00a0Werktag des Monats (\u00a7\u00a0556b BGB)')}
    ${kv('Kaution',eur(d.kaution)+'\u2002(fällig '+(d.kautionFaelText.startsWith('sofort') ? d.kautionFaelText+', \u00a7\u00a0551 BGB)' : d.kautionFaelText+' nach Vertragsunterzeichnung, \u00a7\u00a0551 BGB)'))}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber',d.kontoinhaber)}${kv('Bank',d.bankname)}${kv('IBAN',d.iban)}${kv('BIC',d.bic)}
    <p class="note">Alle Zahlungen per Überweisung. Verwendungszweck: Casa Castel \u2013 ${d.zimmerName} \u2013 Miete Monat Jahr / Kaution.</p>
  </div>
</div>`;

  const page2 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(2)}
  <div class="content">
    ${sec('Betriebskosten gem. \u00a7\u00a71,\u00a02 BetrKV',true,true)}
    <p class="nk-intro">Neben der Kaltmiete trägt der Mieter anteilig folgende Betriebskosten gemäß §§\u00a01,\u00a02 BetrKV in ihrer jeweils geltenden Fassung. Umlageschlüssel: Wohnfläche der Mietwohnung im Verhältnis zur Gesamtwohnfläche des Gebäudes. Heizung und Warmwasser werden nach den Vorschriften der Heizkostenverordnung abgerechnet. Entstehen nach Vertragsschluss neue Betriebskosten i.\u202fS.\u202fd. BetrKV, können diese vom Vermieter auf den Mieter umgelegt werden.</p>
    <div class="nk-grid">${nkRows}</div>
    ${cl('1',d.befristet?'Befristung und Beendigung':'Nutzung des Mietobjekts',
      d.befristet
        ? `Das Mietverhältnis ist gemäß \u00a7\u00a0575 Abs.\u00a01 BGB befristet und endet am ${d.mietende} automatisch ohne Kündigung (\u00a7\u00a0545 BGB findet keine Anwendung). Die Wohnung darf ausschließlich zu Wohnzwecken durch den namentlich genannten Mieter genutzt werden.`
        : 'Die Wohnung darf ausschließlich zu Wohnzwecken durch den namentlich genannten Mieter genutzt werden. Der Mieter ist verpflichtet, die Wohnung und die Gemeinschaftsflächen schonend, sauber und ordnungsgemäß zu behandeln, ausreichend zu heizen, zu lüften und von Ungeziefer freizuhalten. Mängel sind dem Vermieter unverzüglich in Textform anzuzeigen.',
      true)}
    ${cl('2','Kündigung',
      d.befristet
        ? 'Das befristete Mietverhältnis endet am '+d.mietende+' automatisch ohne Kündigung (\u00a7\u00a0575 BGB). Befristungsgrund: '+d.grundLabel+(d.eigenbedarfPerson?' \u2014 '+d.eigenbedarfPerson:'')+'. Eine ordentliche Kündigung ist ausgeschlossen; die außerordentliche Kündigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unberührt. Im Falle einer Verlängerung beträgt die Kündigungsfrist für den Mieter 3\u00a0Monate zum Monatsende.'
        : 'Die ordentliche Kündigung richtet sich nach \u00a7\u00a0573c BGB. Kündigungsfrist für den Mieter: 3\u00a0Monate zum Monatsende. Für den Vermieter gilt die gesetzlich gestaffelte Frist. Die Kündigung bedarf der Schriftform. Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen. Die außerordentliche Kündigung aus wichtigem Grund bleibt unberührt.')}
    ${cl('3','Untervermietung',
      'Eine Untervermietung oder sonstige Überlassung des Mietobjekts an Dritte ist nicht gestattet.')}
    ${cl('4','Schlüsselübergabe',
      `Der Mieter erhält bei Einzug ${d.hausstuerschluessel}\u00a0Haustürschlüssel und ${d.zimmerschluessel}\u00a0Zimmerschlüssel. Weitere Schlüssel bedürfen der vorherigen Zustimmung (Textform). Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs. Alle Schlüssel sind bei Auszug zurückzugeben.`)}
    ${cl('5','Kaution',
      `Der Mieter überweist die Kaution von ${eur(d.kaution)} ${d.kautionFaelText.startsWith('sofort') ? d.kautionFaelText : d.kautionFaelText + ' nach Vertragsunterzeichnung dieses Vertrages'} auf das oben genannte Konto. Der Vermieter legt die Barkaution getrennt von seinem Vermögen auf einem Kautionskonto an (\u00a7\u00a0551 BGB). Rückzahlung nach Prüfung des Zustands bei Auszug.`)}
    ${cl('6','Schönheitsreparaturen &amp; Kleinreparaturen',
      'Schönheitsreparaturen je nach Abnutzungsgrad auf Kosten des Mieters. Kleinreparaturen an häufig zugänglichen Gegenständen bis 150\u00a0\u20ac pro Maßnahme, max. 8\u202f% der Jahres-Nettokaltmiete p.\u202fa.')}
    ${cl('7','Tierhaltung',
      'Kleintiere ohne Belästigungspotenzial (Zierfische, Kleinnager) sind erlaubt. Alle weiteren Tiere bedürfen der Zustimmung (Textform).')}
    ${cl('8','Betreten des Mietobjekts',
      'Bei Gefahr im Verzug jederzeit. Zur Vorbereitung von Verkauf oder Weitervermietung werktags 9:00–12:00 und 15:00–19:00\u202fUhr, mind. 2\u00a0Werktage Vorankündigung (Textform).')}
    ${cl('9','Rückgabe bei Vertragsende',
      'Vollständig geräumt, gereinigt, in vertragsgemäßem Zustand, alle Schlüssel. Bauliche Änderungen sind rückzubauen. Ein Übergabeprotokoll wird erstellt und beidseitig unterzeichnet.')}
  </div>
</div>`;

  const page3 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(3)}
  <div class="content">
    ${cl('10','Haftpflichtversicherung',
      'Der Mieter unterhält für die Dauer des Mietverhältnisses eine private Haftpflichtversicherung und weist sie auf Verlangen nach.',true)}
    ${cl('11','Hausordnung',
      'Rauchen ist im gesamten Gebäude nicht gestattet. Nachtruhe gilt von 22:00–07:00\u202fUhr. Die Hausordnung ist Bestandteil dieses Vertrages (Anlage\u00a0B).')}
    ${cl('12','Datenschutz',
      'Personenbezogene Daten werden gem. Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO zur Vertragsabwicklung verarbeitet, nicht an Dritte weitergegeben und 11\u00a0Jahre nach Vertragsende gelöscht.')}
    ${cl('13','Sonstige Vereinbarungen',
      'Mündliche Nebenabreden bestehen nicht. Änderungen bedürfen der Schriftform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Gerichtsstand ist '+d.gerichtsstand+'.')}
    ${sec('Anlage A \u2014 Inventar',true,false)}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anzahl</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>
    <div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div><div class="comment-line"></div>
    ${sigBlock()}
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Mietvertrag \u2014 ${d.zimmerName}</title>
<style>${CSS}</style></head>
<body>${page1}${page2}${page3}</body></html>`;
}


/* ── PDF GENERATOR ────────────────────────────────────────────────────────── */

async function _generateRentalMietvertragPDF() {
  const container = document.getElementById('_pdfRenderContainer');
  if (!container) return;
  const pages = container.querySelectorAll('.pdf-page');
  if (!pages.length) return;
  const { jsPDF } = window.jspdf;
  const pdf  = new jsPDF({ unit:'px', format:'a4', orientation:'portrait' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false });
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfW, pdfH);
  }
  const roomName   = container.querySelector('.hdr__room-name')?.textContent?.trim() || 'Zimmer';
  const mieterName = [...(container.querySelectorAll('.kv__v')||[])]
    .find(el => el.previousElementSibling?.textContent?.includes('Name'))
    ?.textContent?.trim() || 'Mieter';
  pdf.save(`Mietvertrag_${roomName}_${mieterName.replace(/\s+/g,'_')}.pdf`);
}


/* ═══════════════════════════════════════════════════════════════════════════
 *  REPLACE IN rentals _openContract():
 *
 *  } else if (type === 'mietvertrag') {
 *    typeLbl.textContent  = 'Mietvertrag';
 *    titleLbl.textContent = `New contract — ${apt.name}`;
 *    subLbl.textContent   = `${apt.flaeche_m2 ? apt.flaeche_m2 + ' m²' : ''}`;
 *    body.innerHTML       = _contractBodyRentalMietvertrag(apt);
 *    footer.innerHTML     = `
 *      <button class="rm-btn rm-btn--cancel" id="contractCancelBtn">Cancel</button>
 *      <button class="rm-btn rm-btn--pdf" id="contractPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
 *
 *    document.getElementById('contractPdfBtn').addEventListener('click', async () => {
 *      const apt2        = getRentalById(_contractAptId); if (!apt2) return;
 *      const mieterName  = document.getElementById('rv-name')?.value.trim();
 *      const mieterAdr   = document.getElementById('rv-adr')?.value.trim();
 *      const mieterDob   = document.getElementById('rv-dob')?.value.trim();
 *      const mieterEmail = document.getElementById('rv-email')?.value.trim();
 *      const startVal    = document.getElementById('rv-start')?.value;
 *      const sigVal      = document.getElementById('rv-sig')?.value;
 *      const befristet   = document.getElementById('rv-befristung-btn')?.dataset.mode === 'befristet';
 *      const endVal      = befristet ? document.getElementById('rv-end')?.value : null;
 *      const grundVal    = befristet ? (document.querySelector('input[name="rv-grund"]:checked')?.value || '') : '';
 *      const eigenbedarfPerson = grundVal === 'eigenbedarf'
 *        ? document.getElementById('rv-eigenbedarf-person')?.value.trim() : '';
 *      if (!mieterName) { alert('Bitte Mietername eingeben.'); return; }
 *      if (!startVal)   { alert('Bitte Mietbeginn auswählen.'); return; }
 *      if (befristet && !endVal) { alert('Bitte Mietende angeben.'); return; }
 *      if (befristet && grundVal === 'eigenbedarf' && !eigenbedarfPerson) {
 *        alert('Bitte Eigenbedarfsperson angeben (gesetzliche Pflicht).'); return;
 *      }
 *      const data = _buildRentalMietvertragData(apt2, appSettings, {
 *        mieterName, mieterAdr, mieterDob, mieterEmail, startVal, sigVal,
 *        befristet, endVal, grundVal, eigenbedarfPerson,
 *      });
 *      const html = _renderRentalMietvertragHTML(data);
 *      let container = document.getElementById('_pdfRenderContainer');
 *      if (container) container.remove();
 *      container = document.createElement('div');
 *      container.id = '_pdfRenderContainer';
 *      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
 *      container.innerHTML = html;
 *      document.body.appendChild(container);
 *      await document.fonts.ready;
 *      if (window.innerWidth >= 701) {
 *        _openPdfPreview('Mietvertrag', _generateRentalMietvertragPDF);
 *      } else {
 *        await _generateRentalMietvertragPDF();
 *      }
 *    });
 *
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ── HAUSGELD PREFILL SQL ────────────────────────────────────
   Run once in Supabase SQL editor after creating the table.
   Replace apt_id values with actual UUIDs from rentals_apartments.

CREATE TABLE rentals_hausgeld_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apt_id           uuid NOT NULL REFERENCES rentals_apartments(id) ON DELETE CASCADE,
  effective_date   date NOT NULL,
  amount           numeric(10,2) NOT NULL,
  weg_notified     boolean NOT NULL DEFAULT false,
  notified_date    date,
  hv_adjusted      boolean NOT NULL DEFAULT false,
  adjusted_date    date,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX ON rentals_hausgeld_history(apt_id, effective_date DESC);
ALTER TABLE rentals_hausgeld_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON rentals_hausgeld_history FOR ALL TO anon USING (true) WITH CHECK (true);

-- Prefill: Kostheim → 293 € from 01.07.2026
INSERT INTO rentals_hausgeld_history (apt_id, effective_date, amount, weg_notified, hv_adjusted)
VALUES (
  (SELECT id FROM rentals_apartments WHERE name = 'Kostheim' LIMIT 1),
  '2026-07-01', 293.00, false, false
);

-- Prefill: Kaiser-W-R 17 → 187 € from 01.08.2026
INSERT INTO rentals_hausgeld_history (apt_id, effective_date, amount, weg_notified, hv_adjusted)
VALUES (
  (SELECT id FROM rentals_apartments WHERE name = 'Kaiser-W-R 17' LIMIT 1),
  '2026-08-01', 187.00, false, false
);
   ──────────────────────────────────────────────────────────── */
