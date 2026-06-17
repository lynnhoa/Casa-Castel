/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — ROOMS TAB
   js/tab-rooms.js

   Full rooms management:
   - Card list with expand/collapse, drag-to-sort (SortableJS)
   - Edit mode per card (all fields, chips, steppers)
   - Vacant / occupied toggle (instant Supabase write)
   - Inventar modal (Anlage A)
   - Contract modals: Kurzzeitmietvertrag (full + PDF),
     Mietvertrag (structure only, PDF coming),
     Übergabeprotokoll (structure only, PDF coming)
   - Kurzzeitmietvertrag PDF via hidden iframe
   - i18n via t() from nav.js
   - Delete with confirmation dialog

   Depends on: rooms-data.js, settings.js, utils.js, nav.js
   ───────────────────────────────────────────────────────────── */


/* ── INJECT HTML ─────────────────────────────────────────── */
document.getElementById('tab-rooms').innerHTML = `

    <!-- Page header -->
    <div class="rp-hdr">
      <h1 class="cc-h1" data-i18n="rooms_title">Rooms</h1>
      <button class="rp-add-btn" id="roomAddBtn">
        <i class="ti ti-plus"></i>
        <span data-i18n="rooms_add">Add room</span>
      </button>
    </div>

    <!-- Summary bar -->
    <div class="rp-summary" id="roomsSummary" style="display:none;">
      <div>
        <div class="rp-summary__label">Gesamtkaltmiete / Monat</div>
        <div class="rp-summary__breakdown" id="roomsSummaryBreakdown"></div>
      </div>
      <div>
        <div class="rp-summary__total" id="roomsSummaryTotal"></div>
        <div class="rp-summary__sub" id="roomsSummarySub">nur belegte Zimmer</div>
      </div>
    </div>

    <!-- Card list -->
    <div class="rp-list" id="roomsList"></div>

  <!-- ══ INVENTAR MODAL ══ -->
  <div class="rm-overlay" id="inventarOverlay">
    <div class="rm-sheet" id="inventarSheet">
      <div class="rm-sheet__hdr">
        <div>
          <div class="rm-sheet__title" data-i18n="rooms_inventar">Inventar</div>
          <div class="rm-sheet__sub" id="inventarSubtitle"></div>
        </div>
        <button class="rm-sheet__close" id="inventarClose"><i class="ti ti-x"></i></button>
      </div>
      <div class="rm-sheet__body">
        <div class="inv-list" id="inventarList"></div>
        <button class="inv-add-btn" id="inventarAddRow">
          <i class="ti ti-plus"></i>
          <span data-i18n="rooms_add_item">Add item</span>
        </button>
      </div>
      <div class="rm-sheet__footer">
        <button class="rm-btn rm-btn--ghost" id="inventarCancel" data-i18n="rooms_cancel">Cancel</button>
        <button class="rm-btn rm-btn--primary" id="inventarSave" data-i18n="rooms_save">Save</button>
      </div>
    </div>
  </div>

  <!-- ══ CONTRACT MODAL ══ -->
  <div class="rm-overlay" id="contractOverlay">
    <div class="rm-sheet rm-sheet--tall" id="contractSheet">
      <div class="rm-sheet__hdr">
        <div>
          <div class="rm-contract-type" id="contractTypeLbl"></div>
          <div class="rm-sheet__title" id="contractTitleLbl"></div>
          <div class="rm-sheet__sub" id="contractSubLbl"></div>
        </div>
        <button class="rm-sheet__close" id="contractClose"><i class="ti ti-x"></i></button>
      </div>
      <div class="rm-sheet__body" id="contractBody"></div>
      <div class="rm-sheet__footer" id="contractFooter"></div>
    </div>
  </div>

  <!-- ══ PDF PREVIEW OVERLAY ══ -->
  <div id="pdfPreviewOverlay" style="display:none;position:fixed;inset:0;z-index:600;background:var(--cc-surface);flex-direction:column;overflow:hidden;">
    <!-- Sticky header bar -->
    <div id="pdfPreviewHdr" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:max(14px,env(safe-area-inset-top,14px)) 12px 12px;background:var(--cc-white);border-bottom:0.5px solid var(--cc-rule);flex-shrink:0;z-index:10;">
      <button id="pdfPreviewClose" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:0.5px solid var(--cc-rule);border-radius:50%;cursor:pointer;color:var(--cc-stone);font-size:16px;flex-shrink:0;font-family:inherit;-webkit-tap-highlight-color:transparent;">✕</button>
      <span id="pdfPreviewTitle" style="flex:1;text-align:center;font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--cc-taupe);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <button id="pdfZoomOut" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0.5px solid var(--cc-rule);border-radius:8px;cursor:pointer;color:var(--cc-charcoal);font-size:15px;font-family:inherit;font-weight:300;">−</button>
        <span id="pdfZoomLabel" style="font-size:11px;font-weight:500;color:var(--cc-taupe);min-width:38px;text-align:center;">100%</span>
        <button id="pdfZoomIn" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0.5px solid var(--cc-rule);border-radius:8px;cursor:pointer;color:var(--cc-charcoal);font-size:15px;font-family:inherit;font-weight:300;">+</button>
        <button id="pdfPreviewSaveBtn" style="display:flex;align-items:center;gap:6px;height:40px;padding:0 16px;background:var(--cc-ink);color:var(--cc-white);border:none;border-radius:8px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;margin-left:4px;">
          <i class="ti ti-printer" style="font-size:14px;"></i> PDF
        </button>
      </div>
    </div>
    <!-- Scrollable preview body -->
    <div id="pdfPreviewBody" style="flex:1;overflow-y:auto;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:24px 16px 40px;display:flex;flex-direction:column;align-items:center;background:var(--cc-surface);">
      <div id="pdfPreviewDoc" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start;"></div>
    </div>
  </div>

  <!-- ══ CONFIRM DELETE ══ -->
  <div class="rm-confirm-overlay" id="confirmOverlay">
    <div class="rm-confirm-box">
      <div class="rm-confirm-icon"><i class="ti ti-alert-triangle"></i></div>
      <div class="rm-confirm-title" data-i18n="rooms_delete">Delete room</div>
      <div class="rm-confirm-body" id="confirmBody"></div>
      <div class="rm-confirm-btns">
        <button class="rm-btn rm-btn--cancel" id="confirmCancel">Cancel</button>
        <button class="rm-btn rm-btn--danger" id="confirmOk"><i class="ti ti-trash"></i> Delete room</button>
      </div>
    </div>
  </div>
`;


/* ── STYLES ──────────────────────────────────────────────── */
(function() {
  if (document.getElementById('rooms-tab-styles')) return;
  const s = document.createElement('style');
  s.id = 'rooms-tab-styles';
  s.textContent = `
.rp-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
.rp-add-btn {
  display:flex; align-items:center; gap:6px; padding:8px 14px; min-height:36px;
  background:var(--cc-ink); color:var(--cc-white); border:none; border-radius:var(--cc-r-sm);
  font-size:11px; font-weight:500; letter-spacing:.07em; text-transform:uppercase; white-space:nowrap;
}
.rp-add-btn i { font-size:14px; }

.rp-list { display:flex; flex-direction:column; gap:8px; }

/* SortableJS states */
.sortable-ghost { opacity:.3; background:var(--cc-surface)!important; border:1px dashed var(--cc-stone)!important; }
.sortable-chosen { box-shadow:0 8px 32px rgba(30,27,24,.16)!important; z-index:10; position:relative; }

/* ── ROOM CARD ── */
/* ── ROOM CARD ── */
.rc {
  background:var(--cc-white); border:var(--cc-border); border-radius:var(--cc-r-lg);
  overflow:hidden; transition:box-shadow .2s;
}
.rc.rc--expanded { box-shadow:0 4px 24px rgba(30,27,24,.10); }
.rc.rc--editing  { box-shadow:0 4px 24px rgba(30,27,24,.10); border-color:var(--cc-stone); }

/* Header */
.rc-hdr {
  display:flex; align-items:flex-start; gap:10px;
  padding:16px 16px 14px 12px; cursor:pointer; user-select:none;
}
.rc-drag {
  display:flex; align-items:center; justify-content:center;
  width:26px; height:26px; color:var(--cc-stone); font-size:15px;
  cursor:grab; flex-shrink:0; opacity:.4; transition:opacity .15s;
  touch-action:none; margin-top:4px;
}
.rc-drag:hover { opacity:.9; }
.rc--editing .rc-drag { opacity:0; pointer-events:none; }
.rc-hdr__info { flex:1; min-width:0; }

/* Name row: serif name + status badge inline */
.rc-hdr__namerow { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.rc-hdr__name {
  font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400;
  color:var(--cc-ink); line-height:1.1;
}
.rc-hdr__name--inactive { color:var(--cc-stone); }
.rc-hdr__meta { font-size:11px; color:var(--cc-taupe); margin-top:3px; }

/* Status badge — inline with name */
.rc-status-badge {
  font-size:9px; font-weight:600; letter-spacing:.07em; text-transform:uppercase;
  padding:3px 9px; border-radius:var(--cc-r-pill); flex-shrink:0; white-space:nowrap;
}
.rc-status--occupied { background:#EAF3DE; color:#27500A; border:.5px solid #9AC87A; }
.rc-status--vacant   { background:#F5F0EB; color:#8C6A3A; border:.5px solid #D4A87A; }

/* Tag row below meta */
.rc-hdr__tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:7px; }
.rc-tag {
  font-size:9px; font-weight:500; letter-spacing:.06em; text-transform:uppercase;
  padding:2px 8px; border-radius:var(--cc-r-sm); white-space:nowrap;
}
.rc-tag--type    { background:var(--cc-surface); color:var(--cc-taupe); border:.5px solid var(--cc-rule); }
.rc-tag--kitchen { background:#E6F1FB; color:#0C447C; border:.5px solid #85B7EB; }
.rc-hdr__rent { display:flex; align-items:center; justify-content:space-between; margin-top:9px; padding-top:8px; border-top:0.5px solid var(--cc-rule); gap:10px; }
.rc-hdr__rent-left { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.rc-hdr__rent-top { display:flex; align-items:center; gap:6px; }
.rc-rent-badge { font-size:9px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; padding:2px 8px; border-radius:var(--cc-r-pill); white-space:nowrap; }
.rc-rent-badge--mietvertrag { background:#EFF6FF; color:#1E40AF; border:.5px solid #93C5FD; }
.rc-rent-badge--kurzzeit    { background:#FFF7ED; color:#92400E; border:.5px solid #F6C177; }
.rc-rent-badge--none        { background:var(--cc-surface); color:var(--cc-stone); border:.5px solid var(--cc-rule); }
.rc-rent-amount { font-size:14px; font-weight:500; color:var(--cc-charcoal); letter-spacing:-.01em; flex-shrink:0; white-space:nowrap; align-self:center; }
.rc-rent-detail { font-size:10px; font-weight:300; color:var(--cc-stone); }
.rc-price-toggle { display:flex; align-items:center; background:var(--cc-surface); border-radius:var(--cc-r-pill); padding:2px; border:.5px solid var(--cc-rule); flex-shrink:0; width:fit-content; align-self:flex-start; }
.rc-price-toggle__opt { font-size:9px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; padding:3px 9px; border-radius:var(--cc-r-pill); border:none; background:none; cursor:pointer; color:var(--cc-stone); font-family:inherit; transition:all .15s; white-space:nowrap; }
.rc-price-toggle__opt.active--mietvertrag { background:#EFF6FF; color:#1E40AF; }
.rc-price-toggle__opt.active--kurzzeit    { background:#FFF7ED; color:#92400E; }
.rc-hdr__rent-info { min-width:0; }
.rp-summary { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; margin-bottom:4px; background:var(--cc-white); border:var(--cc-border); border-radius:var(--cc-r-lg); }
.rp-summary__label { font-size:9px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--cc-taupe); margin-bottom:2px; }
.rp-summary__breakdown { font-size:11px; font-weight:300; color:var(--cc-stone); }
.rp-summary__total { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; color:var(--cc-ink); line-height:1; text-align:right; }
.rp-summary__sub { font-size:10px; font-weight:300; color:var(--cc-stone); text-align:right; }
.rc-chevron { color:var(--cc-stone); font-size:18px; flex-shrink:0; margin-top:4px; transition:transform .22s cubic-bezier(.32,.72,0,1); }
.rc--expanded .rc-chevron, .rc--editing .rc-chevron { transform:rotate(90deg); }

/* Read body */
.rc-read { display:none; border-top:var(--cc-border); }
.rc--expanded:not(.rc--editing) .rc-read { display:block; }

/* Action strip — one row, two buttons */
.rc-actions {
  display:flex; gap:6px; padding:8px 14px;
  background:var(--cc-white); border-bottom:var(--cc-border);
}
.rc-act {
  height:28px; display:flex; align-items:center; justify-content:center; gap:4px;
  padding:0 12px; border-radius:var(--cc-r-pill); font-size:9px; font-weight:600;
  letter-spacing:.07em; text-transform:uppercase; cursor:pointer;
  font-family:inherit; background:none; transition:opacity .15s; -webkit-tap-highlight-color:transparent;
  white-space:nowrap;
}
.rc-act:active { opacity:.7; }
.rc-act--mark-vacant   { color:#8C6A3A; border:.5px solid #D4A87A; }
.rc-act--mark-occupied { color:#27500A; border:.5px solid #9AC87A; }
.rc-act--kitchen-on    { color:#0C447C; border:.5px solid #85B7EB; }
.rc-act--kitchen-off   { color:var(--cc-stone); border:.5px solid var(--cc-rule); }

/* Sections */
.rc-section { padding:11px 14px; border-bottom:var(--cc-border); }
.rc-section--miete { padding:11px 14px 11px 12px; border-bottom:var(--cc-border); border-left:3px solid var(--cc-gold); }
.rc-stitle {
  font-size:9px; font-weight:600; letter-spacing:.11em; text-transform:uppercase;
  color:var(--cc-stone); margin-bottom:7px;
}
.rc-rows { display:flex; flex-direction:column; }
.rc-row { display:flex; gap:10px; padding:3px 0; align-items:baseline; }
.rc-row__k { font-size:11px; color:var(--cc-taupe); min-width:88px; flex-shrink:0; }
.rc-row__v { font-size:12px; color:var(--cc-charcoal); flex:1; }
/* Keys inline */
.rc-keys { display:flex; gap:14px; flex-wrap:wrap; }
.rc-key  { display:flex; align-items:center; gap:4px; font-size:12px; color:var(--cc-charcoal); }
.rc-key i{ font-size:11px; color:var(--cc-stone); }

/* Inventar row */
.rc-inv-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:11px 16px; border-bottom:var(--cc-border);
}
.rc-inv-count { font-size:13px; font-weight:500; color:var(--cc-charcoal); }
.rc-inv-label { font-size:9px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-stone); margin-bottom:2px; }
.rc-inv-btn {
  font-size:10px; font-weight:500; letter-spacing:.07em; text-transform:uppercase;
  color:var(--cc-taupe); background:none; border:.5px solid var(--cc-rule);
  border-radius:var(--cc-r-sm); padding:5px 12px; cursor:pointer; font-family:inherit;
}

/* Contracts — button rows */
.rc-contracts { padding:11px 14px; }
.rc-contracts-title {
  font-size:9px; font-weight:600; letter-spacing:.11em; text-transform:uppercase;
  color:var(--cc-stone); margin-bottom:8px;
}
.rc-doc-row { display:flex; align-items:center; gap:7px; margin-bottom:6px; }
.rc-doc-row:last-child { margin-bottom:0; }
.rc-doc-btn {
  flex:1; height:40px; display:flex; align-items:center; justify-content:space-between;
  padding:0 13px; background:#F5EFE6; color:#5C3D1E;
  border:.5px solid #D4B896; border-radius:var(--cc-r-md);
  font-family:inherit; font-size:13px; font-weight:500;
  cursor:pointer; transition:background .12s; -webkit-tap-highlight-color:transparent;
}
.rc-doc-btn:active { background:#EDE3D6; }
.rc-doc-btn i { font-size:13px; color:#B8956A; opacity:.8; }
.rc-doc-toggle {
  display:flex; background:var(--cc-surface); border:.5px solid var(--cc-rule);
  border-radius:var(--cc-r-pill); padding:3px; gap:2px;
  height:40px; align-items:center; flex-shrink:0;
}
.rc-doc-toggle button {
  height:100%; padding:0 10px;
  font-size:9px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
  border:none; cursor:pointer; font-family:inherit;
  color:var(--cc-taupe); background:none; border-radius:var(--cc-r-pill);
  transition:all .15s; white-space:nowrap;
}
.rc-doc-toggle button.active { background:var(--cc-white); color:var(--cc-charcoal); box-shadow:0 1px 3px rgba(30,27,24,.10); }

/* Card footer — edit button */
.rc-card-footer {
  display:flex; align-items:center; justify-content:flex-end;
  padding:10px 14px; border-top:var(--cc-border); background:var(--cc-surface);
}
.rc-edit-open-btn {
  display:flex; align-items:center; gap:5px;
  padding:7px 14px; min-height:32px; background:transparent; border:.5px solid var(--cc-rule);
  border-radius:var(--cc-r-sm); font-size:10px; font-weight:500; letter-spacing:.07em;
  text-transform:uppercase; color:var(--cc-taupe); transition:border-color .15s;
  font-family:inherit; cursor:pointer;
}
.rc-edit-open-btn:hover { border-color:var(--cc-stone); }

/* Edit body */
.rc-edit { display:none; border-top:2px solid var(--cc-gold); background:var(--cc-white); }
.rc--editing .rc-edit { display:block; }
.rc-edit-section { padding:14px 16px; border-bottom:var(--cc-border); }
.rc-edit-section:last-of-type { border-bottom:none; }
.rc-edit-stitle {
  font-size:9px; font-weight:500; letter-spacing:.11em; text-transform:uppercase;
  color:var(--cc-taupe); margin-bottom:10px;
}
.rc-field { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
.rc-field:last-child { margin-bottom:0; }
.rc-field-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.rc-field__label {
  font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:var(--cc-taupe);
}
.rc-input {
  width:100%; min-height:38px; padding:8px 10px; background:var(--cc-bg);
  border:var(--cc-border); border-radius:var(--cc-r-sm); font-family:inherit;
  font-size:13px; font-weight:300; color:var(--cc-charcoal); outline:none;
  transition:border-color .15s; -webkit-appearance:none;
}
.rc-input:focus { border-color:var(--cc-charcoal); }
.rc-input::placeholder { color:var(--cc-stone); }
.rc-input[type=number]::-webkit-inner-spin-button,
.rc-input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
.rc-input[type=number] { -moz-appearance:textfield; }
.rc-chips { display:flex; flex-wrap:wrap; gap:6px; }
.rc-chip {
  padding:5px 10px; border-radius:var(--cc-r-pill); font-size:10px; font-weight:500;
  letter-spacing:.06em; text-transform:uppercase; border:var(--cc-border);
  background:var(--cc-bg); color:var(--cc-taupe); cursor:pointer; transition:all .15s;
}
.rc-chip.on { background:var(--cc-ink); color:var(--cc-white); border-color:var(--cc-ink); }
.rc-chip--orphan { opacity:.45; border-style:dashed; }
.rc-pricing-toggle {
  display:flex; border:var(--cc-border); border-radius:var(--cc-r-pill);
  overflow:hidden; background:var(--cc-surface); width:fit-content; margin-bottom:10px;
}
.rc-pricing-toggle button {
  padding:7px 16px; font-size:10px; font-weight:500; letter-spacing:.07em;
  text-transform:uppercase; border:none; background:transparent; color:var(--cc-stone);
  transition:background .15s,color .15s;
}
.rc-pricing-toggle button.active { background:var(--cc-ink); color:var(--cc-white); }
.rc-stepper { display:flex; align-items:center; border:var(--cc-border); border-radius:var(--cc-r-sm); overflow:hidden; width:fit-content; }
.rc-stepper button { width:32px; height:32px; background:var(--cc-surface); border:none; font-size:16px; color:var(--cc-charcoal); display:flex; align-items:center; justify-content:center; }
.rc-stepper__v { min-width:36px; text-align:center; font-size:13px; padding:0 4px; color:var(--cc-charcoal); }
.rc-toggle-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.rc-toggle-row:last-child { margin-bottom:0; }
.rc-tlabel { font-size:13px; color:var(--cc-charcoal); }
.cc-sw { position:relative; width:40px; height:24px; flex-shrink:0; }
.cc-sw input { opacity:0; width:0; height:0; }
.cc-sw__t { position:absolute; inset:0; background:var(--cc-rule); border-radius:12px; transition:background .2s; cursor:pointer; }
.cc-sw__t::after { content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:white; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.15); }
.cc-sw input:checked+.cc-sw__t { background:var(--cc-ink); }
.cc-sw input:checked+.cc-sw__t::after { transform:translateX(16px); }
.rc-edit-footer {
  padding:12px 14px;
  padding-bottom:max(14px,env(safe-area-inset-bottom,14px));
  border-top:var(--cc-border);
  background:var(--cc-surface);
}
.rc-save-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
/* Edit footer Cancel — text link, same Option D style */
.rm-btn--ghost {
  flex-shrink:0; height:48px; padding:0 16px;
  background:none; border:none; color:var(--cc-stone);
  font-size:13px; font-weight:400; letter-spacing:0; text-transform:none;
  cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent;
}
.rm-btn--ghost:active { opacity:.6; }
/* Edit footer Save — wide dark pill */
.rm-btn--primary {
  flex:1; height:48px; background:var(--cc-ink); color:var(--cc-white); border:none;
  border-radius:var(--cc-r-md); font-size:13px; font-weight:500;
  letter-spacing:0; text-transform:none;
  display:flex; align-items:center; justify-content:center; gap:6px;
}
.rm-btn--primary:active { opacity:.85; }
.rm-btn--primary:disabled { opacity:.45; cursor:not-allowed; }
/* Delete — full width subtle danger link */
.rm-btn--delete {
  width:100%; min-height:40px; background:transparent;
  border:.5px solid #EAC4BB; border-radius:var(--cc-r-sm);
  color:#C4705A; font-size:11px; font-weight:500;
  letter-spacing:.06em; text-transform:uppercase;
  display:flex; align-items:center; justify-content:center; gap:6px;
  cursor:pointer; font-family:inherit;
}
.rm-btn--delete:active { background:#FBF0EE; }

/* Desktop: cards use full cc-main width */
@media(min-width:701px) {
  .rp-list { max-width:none; margin:0; }
  .rc-hdr { padding:18px 18px 16px 14px; }
  .rc-actions { padding:10px 16px; }
  .rc-doc-row:hover { background:var(--cc-surface); }
}

/* iPad touch — action buttons larger tap target */
@media(hover:none) {
  .rc-act { height:40px; font-size:11px; }
  .rc-doc-row:active { background:var(--cc-surface); }
}

/* ── CONTRACT FOOTER BUTTONS: Option D ── */
/* Override rm-btn--ghost and rm-btn--pdf for contract footer only */
.rm-btn--cancel {
  flex-shrink:0; height:48px; padding:0 16px;
  background:none; border:none; color:var(--cc-stone);
  font-size:13px; font-weight:400; letter-spacing:0; text-transform:none;
  cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent;
}
.rm-btn--cancel:active { opacity:.6; }
/* Override pdf button — larger, sentence case, rounded */
#contractFooter .rm-btn--pdf,
#contractFooter .rm-btn--pdf-disabled {
  flex:1; height:48px; border-radius:var(--cc-r-md);
  font-size:13px; font-weight:500; letter-spacing:0; text-transform:none;
  display:flex; align-items:center; justify-content:center; gap:8px;
}
#contractFooter .rm-btn--pdf { background:var(--cc-ink); color:var(--cc-white); border:none; }
#contractFooter .rm-btn--pdf:active { opacity:.85; }
#contractFooter .rm-btn--pdf-disabled { background:var(--cc-surface); color:var(--cc-stone); border:var(--cc-border); cursor:not-allowed; }
/* Footer layout with safe area */
.rm-sheet__footer {
  padding:12px 16px !important;
  padding-bottom:max(16px,env(safe-area-inset-bottom,16px)) !important;
  align-items:center !important;
  gap:10px !important;
}

/* ── SHEET / OVERLAY ── */
.rm-overlay {
  display:none; position:fixed; inset:0; z-index:400;
  background:rgba(30,27,24,.22); backdrop-filter:blur(2px);
  align-items:flex-end; justify-content:center;
}
.rm-overlay.open { display:flex; }
@media(min-width:701px){
  .rm-overlay { align-items:center; }
  .rm-sheet { border-radius:var(--cc-r-lg)!important; max-height:78vh!important; }
}
.rm-sheet {
  width:100%; max-width:500px; max-height:88vh;
  background:var(--cc-white); border-radius:20px 20px 0 0;
  display:flex; flex-direction:column;
  animation:rmSheetUp .26s cubic-bezier(.32,.72,0,1);
}
.rm-sheet--tall { max-height:92vh; }
@keyframes rmSheetUp { from{transform:translateY(40px);opacity:0;} to{transform:none;opacity:1;} }

.rm-sheet__hdr {
  display:flex; align-items:flex-start; justify-content:space-between;
  padding:20px 20px 14px; border-bottom:var(--cc-border); flex-shrink:0;
  position:relative;
}
.rm-contract-type {
  font-size:9px; font-weight:500; letter-spacing:.11em; text-transform:uppercase;
  color:var(--cc-gold); margin-bottom:3px;
}
.rm-sheet__title { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:300; color:var(--cc-ink); }
.rm-sheet__sub { font-size:12px; color:var(--cc-taupe); margin-top:2px; }
.rm-sheet__close {
  width:30px; height:30px; display:flex; align-items:center; justify-content:center;
  background:var(--cc-surface); border:var(--cc-border); border-radius:50%;
  color:var(--cc-taupe); font-size:13px; flex-shrink:0;
}
.rm-sheet__body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:16px 20px; }
.rm-sheet__footer { padding:12px 16px; padding-bottom:max(16px,env(safe-area-inset-bottom,16px)); border-top:var(--cc-border); flex-shrink:0; display:flex; align-items:center; gap:10px; }

/* Contract modal body elements */
.rm-prefilled {
  background:var(--cc-bg); border:var(--cc-border); border-radius:var(--cc-r-sm);
  padding:12px 14px; margin-bottom:14px;
}
.rm-prefilled__title {
  font-size:9px; font-weight:500; letter-spacing:.1em; text-transform:uppercase;
  color:var(--cc-stone); margin-bottom:8px;
}
.rm-pre-row { display:flex; gap:8px; padding:3px 0; font-size:12px; }
.rm-pre-row span:first-child { color:var(--cc-stone); min-width:88px; flex-shrink:0; }
.rm-pre-row span:last-child { color:var(--cc-charcoal); }

.rm-kaution-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px; background:var(--cc-gold-lt); border-radius:var(--cc-r-sm);
  margin-bottom:14px;
}
.rm-kaution-lbl { font-size:9px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:#9A6A2A; margin-bottom:2px; }
.rm-kaution-rule { font-size:11px; color:#7A5A2A; }
.rm-kaution-val { font-family:'Cormorant Garamond',Georgia,serif; font-size:20px; font-weight:400; color:#7A5A2A; }

.rm-fields-title {
  font-size:9px; font-weight:500; letter-spacing:.1em; text-transform:uppercase;
  color:var(--cc-taupe); margin-bottom:10px;
}
.rm-field { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
.rm-field:last-child { margin-bottom:0; }
.rm-field label { font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:var(--cc-taupe); }
.rm-input {
  width:100%; min-height:40px; padding:9px 12px; background:var(--cc-bg);
  border:var(--cc-border); border-radius:var(--cc-r-sm); font-family:inherit;
  font-size:14px; font-weight:300; color:var(--cc-charcoal);
  outline:none; transition:border-color .15s; -webkit-appearance:none;
}
.rm-input:focus { border-color:var(--cc-charcoal); }
.rm-input::placeholder { color:var(--cc-stone); }
.rm-field-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }

/* Erster Monat toggle */
.rm-field--toggle { background:var(--cc-bg); border:var(--cc-border); border-radius:var(--cc-r-sm); padding:10px 12px; margin-bottom:10px; }
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

/* Übergabe Mieter pill toggle */
.ub-mieter-pill {
  position: relative;
  width: 44px;
  height: 26px;
  background: var(--cc-ink);
  border-radius: 13px;
  cursor: pointer;
  transition: background .25s;
  flex-shrink: 0;
}
.ub-mieter-pill[data-state="manual"] {
  background: var(--cc-rule);
}
.ub-mieter-pill__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  transition: transform .25s cubic-bezier(.32,.72,0,1);
}
.ub-mieter-pill[data-state="manual"] .ub-mieter-pill__knob {
  transform: translateX(18px);
}

.rm-coming-soon {
  display:flex; flex-direction:column; align-items:center; text-align:center;
  padding:32px 20px;
}
.rm-coming-soon i { font-size:36px; color:var(--cc-stone); margin-bottom:12px; }
.rm-coming-soon h3 { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:300; color:var(--cc-ink); margin-bottom:6px; }
.rm-coming-soon p { font-size:13px; color:var(--cc-taupe); line-height:1.6; }

/* Inventar modal */
.inv-list {
  display:flex; flex-direction:column; border:var(--cc-border);
  border-radius:var(--cc-r-sm); overflow:hidden; margin-bottom:8px;
}
.inv-row { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:.5px solid var(--cc-rule); background:var(--cc-bg); }
.inv-row:last-child { border-bottom:none; }
.inv-name { flex:1; min-height:32px; background:transparent; border:none; font-family:inherit; font-size:13px; color:var(--cc-charcoal); outline:none; }
.inv-qty { width:48px; min-height:32px; background:var(--cc-white); border:var(--cc-border); border-radius:var(--cc-r-sm); text-align:center; font-family:inherit; font-size:13px; color:var(--cc-charcoal); outline:none; }
.inv-rm { width:24px; height:24px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:var(--cc-stone); font-size:13px; flex-shrink:0; transition:color .15s; }
.inv-rm:hover { color:#C4705A; }
.inv-add-btn {
  display:flex; align-items:center; gap:6px; width:100%; min-height:36px; padding:0 12px;
  background:var(--cc-white); border:.5px dashed var(--cc-rule); border-radius:var(--cc-r-sm);
  font-size:11px; font-weight:500; letter-spacing:.07em; text-transform:uppercase; color:var(--cc-taupe);
}

/* Confirm dialog */
.rm-confirm-overlay {
  display:none; position:fixed; inset:0; z-index:600;
  background:rgba(30,27,24,.3); backdrop-filter:blur(3px);
  align-items:center; justify-content:center; padding:24px;
}
.rm-confirm-overlay.open { display:flex; }

.rm-coming-soon {
  display:flex; flex-direction:column; align-items:center; text-align:center;
  padding:32px 20px;
}
.rm-coming-soon i { font-size:36px; color:var(--cc-stone); margin-bottom:12px; }
.rm-coming-soon h3 { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:300; color:var(--cc-ink); margin-bottom:6px; }
.rm-coming-soon p { font-size:13px; color:var(--cc-taupe); line-height:1.6; }

/* Inventar modal */
.inv-list {
  display:flex; flex-direction:column; border:var(--cc-border);
  border-radius:var(--cc-r-sm); overflow:hidden; margin-bottom:8px;
}
.inv-row { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:.5px solid var(--cc-rule); background:var(--cc-bg); }
.inv-row:last-child { border-bottom:none; }
.inv-name { flex:1; min-height:32px; background:transparent; border:none; font-family:inherit; font-size:13px; color:var(--cc-charcoal); outline:none; }
.inv-qty { width:48px; min-height:32px; background:var(--cc-white); border:var(--cc-border); border-radius:var(--cc-r-sm); text-align:center; font-family:inherit; font-size:13px; color:var(--cc-charcoal); outline:none; }
.inv-rm { width:24px; height:24px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:var(--cc-stone); font-size:13px; flex-shrink:0; transition:color .15s; }
.inv-rm:hover { color:#C4705A; }
.inv-add-btn {
  display:flex; align-items:center; gap:6px; width:100%; min-height:36px; padding:0 12px;
  background:var(--cc-white); border:.5px dashed var(--cc-rule); border-radius:var(--cc-r-sm);
  font-size:11px; font-weight:500; letter-spacing:.07em; text-transform:uppercase; color:var(--cc-taupe);
}

/* Confirm dialog */
.rm-confirm-overlay {
  display:none; position:fixed; inset:0; z-index:600;
  background:rgba(30,27,24,.3); backdrop-filter:blur(3px);
  align-items:center; justify-content:center; padding:24px;
}
.rm-confirm-overlay.open { display:flex; }

/* ── SIGNATURE PAD ────────────────────────────────────────── */
.sig-pad-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 800;
  background: #1a1a1a;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.sig-pad-overlay.open { display: flex; }

.sig-pad-rotate-msg {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #f0e8da;
  font-family: 'Lato', sans-serif;
  font-size: 14px;
  text-align: center;
}
.sig-pad-rotate-msg i { font-size: 48px; color: #b8975a; }

.sig-pad-ui {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 12px;
}

.sig-pad-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 700px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.sig-pad-label {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 16px;
  color: #f0e8da;
  letter-spacing: 0.03em;
}
.sig-pad-role {
  font-family: 'Lato', sans-serif;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #b8975a;
  margin-top: 2px;
}
.sig-pad-actions {
  display: flex;
  gap: 10px;
}
.sig-pad-btn {
  height: 36px;
  padding: 0 18px;
  border-radius: 4px;
  font-family: 'Lato', sans-serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
}
.sig-pad-btn--clear { background: #3a3530; color: #c8c4bf; }
.sig-pad-btn--done  { background: #f0e8da; color: #5a4020; }
.sig-pad-btn--cancel { background: transparent; color: #888780; border: 0.5px solid #3a3530; }


.rm-confirm-box {
  background:var(--cc-white); border-radius:var(--cc-r-lg); padding:28px 24px 24px;
  max-width:320px; width:100%; box-shadow:0 24px 60px rgba(30,27,24,.18);
  animation:confirmPop .2s cubic-bezier(.32,.72,0,1);
}
@keyframes confirmPop { from{transform:scale(.94);opacity:0;} to{transform:scale(1);opacity:1;} }
.rm-confirm-icon { font-size:28px; color:#C4705A; margin-bottom:12px; }
.rm-confirm-title { font-family:'Cormorant Garamond',Georgia,serif; font-size:20px; font-weight:400; color:var(--cc-ink); margin-bottom:6px; }
.rm-confirm-body { font-size:13px; color:var(--cc-taupe); line-height:1.6; margin-bottom:20px; }
.rm-confirm-btns { display:flex; align-items:center; gap:10px; }
/* danger btn — wide red, same height as contract PDF btn */
.rm-btn--danger {
  flex:1; height:48px; background:#C4705A; color:var(--cc-white); border:none;
  border-radius:var(--cc-r-md); font-size:13px; font-weight:500;
  letter-spacing:0; text-transform:none;
  display:flex; align-items:center; justify-content:center; gap:8px;
  cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent;
}
.rm-btn--danger:active { opacity:.85; }
  `;
  document.head.appendChild(s);
})();


/* ── SHARED HELPERS ─────────────────────────────────────── */
// German currency: 1.234,56 €
function fmtEUR(n) {
  const num = Number(n);
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
// German number without € (for inline use)
function fmtNum(n) {
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── SHARED HELPER — parse JSONB arrays from Supabase ────── */
// Supabase sometimes returns JSONB as a raw string instead of parsed array
function _parseArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

/* ── LOAD ROOMS ──────────────────────────────────────────── */
/* ── DEFAULT ROOMS — seeded into Supabase if table is empty ─ */
const _DEFAULT_ROOMS = [
  {
    name: 'Paris', room_type: '2-Zimmer mit eigener Küche', floor: 'Dachgeschoss',
    flaeche_m2: 28, kitchen_type: 'Eigene Küche', active: true, vacant: false,
    badezimmer: ['Bad 2. OG'],
    gemeinschaftsraeume: ['Terrasse','Garten','Vorgarten & Fahrradabstellplatz'],
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    monatl_miete: null, mietvertrag_pricing: 'pauschal',
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    inventar: [], sort_order: 0,
  },
  {
    name: 'Copenhagen', room_type: 'WG Zimmer', floor: '1. OG',
    flaeche_m2: 12, kitchen_type: 'Geteilte Küche', active: true, vacant: false,
    badezimmer: ['Bad 2. OG'],
    gemeinschaftsraeume: ['Küche','Terrasse','Garten','Vorgarten & Fahrradabstellplatz'],
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    monatl_miete: null, mietvertrag_pricing: 'pauschal',
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    inventar: [], sort_order: 1,
  },
  {
    name: 'Stockholm', room_type: 'WG Zimmer', floor: '1. OG',
    flaeche_m2: 16, kitchen_type: 'Geteilte Küche', active: true, vacant: false,
    badezimmer: ['Bad 1. OG'],
    gemeinschaftsraeume: ['Küche','Terrasse','Garten','Vorgarten & Fahrradabstellplatz'],
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    monatl_miete: null, mietvertrag_pricing: 'pauschal',
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    inventar: [], sort_order: 2,
  },
  {
    name: 'Oslo', room_type: 'WG Zimmer', floor: '1. OG',
    flaeche_m2: 13, kitchen_type: 'Geteilte Küche', active: true, vacant: false,
    badezimmer: ['Bad 2. OG'],
    gemeinschaftsraeume: ['Küche','Terrasse','Garten','Vorgarten & Fahrradabstellplatz'],
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    monatl_miete: null, mietvertrag_pricing: 'pauschal',
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    inventar: [], sort_order: 3,
  },
  {
    name: 'London', room_type: 'WG Zimmer', floor: 'EG',
    flaeche_m2: 25, kitchen_type: 'Geteilte Küche', active: true, vacant: false,
    badezimmer: ['Bad 1. OG'],
    gemeinschaftsraeume: ['Küche','Terrasse','Garten','Vorgarten & Fahrradabstellplatz'],
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    monatl_miete: null, mietvertrag_pricing: 'pauschal',
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    inventar: [], sort_order: 4,
  },
  {
    name: 'New York', room_type: 'Zimmer mit eigener Küche', floor: 'UG',
    flaeche_m2: 16, kitchen_type: 'Eigene Küche', active: true, vacant: false,
    badezimmer: ['Bad 1. OG'],
    gemeinschaftsraeume: ['Terrasse','Garten','Vorgarten & Fahrradabstellplatz'],
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    monatl_miete: null, mietvertrag_pricing: 'pauschal',
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    inventar: [], sort_order: 5,
  },
  {
    name: 'Los Angeles', room_type: 'Zimmer mit eigener Küche', floor: 'EG',
    flaeche_m2: 15, kitchen_type: 'Eigene Küche', active: true, vacant: false,
    badezimmer: ['Bad 1. OG'],
    gemeinschaftsraeume: ['Terrasse','Garten','Vorgarten & Fahrradabstellplatz'],
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    monatl_miete: null, mietvertrag_pricing: 'pauschal',
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    inventar: [], sort_order: 6,
  },
];

async function loadRooms() {
  // Ensure settings are loaded first so chips render correctly
  if (!appSettings.vermieter_name && typeof loadSettings === 'function') {
    await loadSettings();
  }

  // Sync kitchen access config from Supabase into localStorage
  if (typeof loadKitchenRoomsFromSupabase === 'function') {
    await loadKitchenRoomsFromSupabase();
  }

  await loadRoomsData();

  // If Supabase returned no rooms, seed the defaults directly via Supabase
  // bypassing saveRoom() to do a single bulk insert
  if (appRooms.length === 0 && sbL) {
    console.log('[rooms] No rooms found — seeding defaults...');
    const { data, error } = await sbL
      .from('rooms')
      .insert(_DEFAULT_ROOMS.map(r => ({ ...r })))
      .select();
    if (!error && data) {
      appRooms.push(...data);
      appRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    } else {
      console.warn('[rooms] Seed failed:', error?.message);
    }
  }

  _renderRoomsList();
  _initSortable();
  // Re-render if settings change (bathrooms / shared spaces lists update)
  if (!loadRooms._settingsWired) { loadRooms._settingsWired = true; onSettingsChange(() => _renderRoomsList()); }

  // Re-render when any room changes via realtime (another device, or other tabs)
  if (!loadRooms._roomsChangeWired) {
    loadRooms._roomsChangeWired = true;
    onRoomsChange(() => {
      _renderRoomsList();
    });
  }

  // Realtime: re-render room cards when kitchen_config changes on another device
  if (sbL && !loadRooms._kitchenRtWired) {
    loadRooms._kitchenRtWired = true;
    sbL.channel('rooms-kitchen-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_data' }, async payload => {
        const type = payload.new?.type || payload.old?.type;
        if (type === 'kitchen_config') {
          await loadKitchenRoomsFromSupabase();
          _renderRoomsList();
        }
      })
      .subscribe();
  }
}


/* ── RENDER LIST ─────────────────────────────────────────── */
function _updateRoomsSummary(rooms) {
  const bar = document.getElementById('roomsSummary');
  const bd  = document.getElementById('roomsSummaryBreakdown');
  const tot = document.getElementById('roomsSummaryTotal');
  if (!bar || !bd || !tot) return;
  if (!rooms || !rooms.length) { bar.style.display = 'none'; return; }
  let kalt = 0, nk = 0, occupied = 0;
  rooms.forEach(r => {
    if (r.vacant !== false) return;  // skip vacant, null, or undefined
    occupied++;
    const type = _getActiveType(r);
    if (!type) return;
    const info = _getRentInfo(r, type);
    if (!info) return;
    kalt += info.kalt;
    nk   += info.nk;
  });
  bar.style.display = 'flex';
  bd.textContent  = occupied + ' / ' + rooms.length + ' belegt · ' + fmtEUR(nk) + ' NK separat';
  tot.textContent = fmtEUR(kalt);
}

function _renderRoomsList() {
  const list = document.getElementById('roomsList');
  if (!list) return;

  // Snapshot expanded card IDs before clobbering DOM (realtime re-renders must not collapse cards)
  const expandedIds = new Set(
    [...list.querySelectorAll('.rc--expanded')].map(c => c.dataset.id)
  );

  const rooms = appRooms.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  if (!rooms.length) {
    list.innerHTML = `<p style="font-size:13px;color:var(--cc-stone);font-style:italic;padding:20px 0;">No rooms yet. Add your first room.</p>`;
    _updateRoomsSummary([]);
    return;
  }

  list.innerHTML = rooms.map(r => _roomCardHTML(r)).join('');

  // Restore expanded state after re-render
  expandedIds.forEach(id => {
    const card = list.querySelector(`.rc[data-id="${id}"]`);
    if (card) card.classList.add('rc--expanded');
  });

  _updateRoomsSummary(rooms);
  _bindAllCards();
}


/* ── CARD HTML ───────────────────────────────────────────── */
function _getRentInfo(r, type) {
  // Returns {kalt, nk, total, detail} for a given type
  if (type === 'mietvertrag') {
    if (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) {
      const kalt = Number(r.kaltmiete)||0, nk = Number(r.nk_pauschale)||0;
      return { kalt, nk, total: kalt+nk, detail: fmtEUR(kalt)+' kalt + '+fmtEUR(nk)+' NK' };
    }
    if (r.mietvertrag_miete) {
      const tot = Number(r.mietvertrag_miete)||0;
      const nk  = Number(r.nk_pauschale)||0;
      return { kalt: tot - nk, nk, total: tot, detail: 'pauschal inkl. NK' };
    }
  }
  if (type === 'kurzzeit' && r.kurzzeit_kaltmiete) {
    const kalt = Number(r.kurzzeit_kaltmiete)||0;
    const nk   = Number(r.kurzzeit_nk)||0;
    const isPauschal = (r.kurzzeit_pricing || 'pauschal') === 'pauschal';
    const detail = isPauschal
      ? fmtEUR(kalt+nk) + ' pauschal inkl. NK'
      : fmtEUR(kalt) + ' kalt + ' + fmtEUR(nk) + ' NK';
    return { kalt, nk, total: kalt+nk, detail };
  }
  return null;
}

function _getActiveType(r) {
  const hasMv = !!(r.kaltmiete || r.mietvertrag_miete);
  const hasKz = !!r.kurzzeit_kaltmiete;

  // Only honour persisted type if that type actually has data
  if (r.active_price_type === 'mietvertrag' && hasMv) return 'mietvertrag';
  if (r.active_price_type === 'kurzzeit'    && hasKz) return 'kurzzeit';

  // Fallback: mietvertrag first, then kurzzeit
  if (hasMv) return 'mietvertrag';
  if (hasKz) return 'kurzzeit';
  return null;
}

async function _toggleRentType(btn) {
  const toggle = btn.closest('.rc-price-toggle');
  const card   = btn.closest('.rc');
  const type   = btn.dataset.type;
  const rid    = card.dataset.id;

  // Update toggle active state immediately (optimistic)
  toggle.querySelectorAll('.rc-price-toggle__opt').forEach(b => {
    b.className = 'rc-price-toggle__opt' + (b.dataset.type === type ? ' active--'+type : '');
  });

  // Update in-memory room object
  const r = appRooms.find(x => x.id === rid);
  if (!r) return;
  r.active_price_type = type;

  // Persist to Supabase + notify all tabs (tenants re-renders with correct kaution)
  if (sbL) {
    sbL.from('rooms').update({ active_price_type: type }).eq('id', rid).then(({ error }) => {
      if (error) console.warn('[rooms] active_price_type save error:', error.message);
    });
  }
  if (typeof _notifyRoomsListeners === 'function') _notifyRoomsListeners('UPDATE', r);

  // Update amount + detail in card
  const info = _getRentInfo(r, type);
  if (info) {
    const amountEl = card.querySelector('.rc-rent-amount');
    const detailEl = card.querySelector('.rc-rent-detail');
    if (amountEl) amountEl.textContent = fmtEUR(info.total);
    if (detailEl) detailEl.textContent = info.detail;
  }

  _updateRoomsSummary(appRooms);
}

function _rentRowHTML(r) {
  const hasMv = !!(r.kaltmiete || r.mietvertrag_miete);
  const hasKz = !!r.kurzzeit_kaltmiete;
  const hasBoth = hasMv && hasKz;
  const activeType = _getActiveType(r);
  const info = activeType ? _getRentInfo(r, activeType) : null;

  if (!hasMv && !hasKz) {
    return `<div class="rc-hdr__rent"><div class="rc-hdr__rent-left"><div class="rc-hdr__rent-top"><span class="rc-rent-badge rc-rent-badge--none">Nicht gesetzt</span></div></div></div>`;
  }

  const amountHTML = info ? `<span class="rc-rent-amount">${fmtEUR(info.total)}</span>` : '';
  const detailHTML = info ? `<span class="rc-rent-detail">${info.detail}</span>` : '';

  if (hasBoth) {
    const mvActive = activeType === 'mietvertrag' ? ' active--mietvertrag' : '';
    const kzActive = activeType === 'kurzzeit'    ? ' active--kurzzeit'    : '';
    return `<div class="rc-hdr__rent">
      <div class="rc-hdr__rent-left">
        <div class="rc-price-toggle">
          <button class="rc-price-toggle__opt${mvActive}" data-type="mietvertrag" onclick="event.stopPropagation();_toggleRentType(this)">Mietvertrag</button>
          <button class="rc-price-toggle__opt${kzActive}"  data-type="kurzzeit"    onclick="event.stopPropagation();_toggleRentType(this)">Kurzzeit</button>
        </div>
        <div class="rc-hdr__rent-info">${detailHTML}</div>
      </div>
      ${amountHTML}
    </div>`;
  }

  const badgeClass = activeType === 'mietvertrag' ? 'rc-rent-badge--mietvertrag' : 'rc-rent-badge--kurzzeit';
  const badgeLabel = activeType === 'mietvertrag' ? 'Mietvertrag' : 'Kurzzeit';
  return `<div class="rc-hdr__rent">
    <div class="rc-hdr__rent-left">
      <div class="rc-hdr__rent-top"><span class="rc-rent-badge ${badgeClass}">${badgeLabel}</span></div>
      <div class="rc-hdr__rent-info">${detailHTML}</div>
    </div>
    ${amountHTML}
  </div>`;
}

function _roomCardHTML(r) {
  const vacant   = r.vacant;
  const badgeVac = vacant
    ? `<span class="rc-badge rc-badge--vacant">${t('rooms_vacant')}</span>`
    : `<span class="rc-badge rc-badge--occupied">${t('rooms_occupied')}</span>`;
  const badgeType = r.room_type
    ? `<span class="rc-badge rc-badge--type">${esc(r.room_type)}</span>` : '';
  const kitchenRooms  = typeof getKitchenRooms === 'function' ? getKitchenRooms() : [];
  const hasKitchen    = kitchenRooms.includes(r.name);
  const badgeKitchen  = hasKitchen ? `<span class="rc-badge rc-badge--kitchen">Kitchen</span>` : '';

  const gemStr = _parseArr(r.gemeinschaftsraeume).join(', ') || '—';
  const badStr = _parseArr(r.badezimmer).join(', ') || '—';
  const invCount = Array.isArray(r.inventar) ? r.inventar.length : 0;

  // Rent display
  // Kaution helper — base depends on pricing mode, override wins
  function _kautionForType(base, multiplier) {
    if (r.kaution_override && r.kaution_default) return Number(r.kaution_default);
    return Math.round(base * multiplier);
  }

  let rentRead = '';
  if (r.kurzzeit_kaltmiete) {
    const kalt = Number(r.kurzzeit_kaltmiete)||0;
    const nk   = Number(r.kurzzeit_nk)||0;
    const isPauschal = (r.kurzzeit_pricing||'pauschal') === 'pauschal';
    const display = isPauschal ? fmtEUR(kalt+nk)+' pauschal inkl. NK' : fmtEUR(kalt)+' kalt + '+fmtEUR(nk)+' NK';
    const kzBase = isPauschal ? kalt + nk : kalt;
    const kzKaution = _kautionForType(kzBase, 1);
    rentRead += `<div class="rc-row"><span class="rc-row__k">Kurzzeit</span><span class="rc-row__v">${display} / Monat</span></div>`;
    rentRead += `<div class="rc-row"><span class="rc-row__k" style="padding-left:8px;color:var(--cc-stone)">↳ Kaution</span><span class="rc-row__v" style="color:var(--cc-stone)">${fmtEUR(kzKaution)} · 1× ${isPauschal ? 'Pauschal' : 'Kalt'}${r.kaution_override ? ' (override)' : ''}</span></div>`;
  }
  if (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) {
    const kalt = Number(r.kaltmiete)||0, nk = Number(r.nk_pauschale)||0;
    const mvKaution = _kautionForType(kalt, 3);
    rentRead += `<div class="rc-row"><span class="rc-row__k">Mietvertrag</span><span class="rc-row__v">${fmtEUR(kalt)} kalt + ${fmtEUR(nk)} NK</span></div>`;
    rentRead += `<div class="rc-row"><span class="rc-row__k" style="padding-left:8px;color:var(--cc-stone)">↳ Kaution</span><span class="rc-row__v" style="color:var(--cc-stone)">${fmtEUR(mvKaution)} · 3× Kalt${r.kaution_override ? ' (override)' : ''}</span></div>`;
  } else if (r.kaltmiete) {
    const kalt = Number(r.kaltmiete)||0, nk = Number(r.nk_pauschale)||0;
    const tot = kalt + nk;
    const mvKaution = _kautionForType(tot, 3);
    rentRead += `<div class="rc-row"><span class="rc-row__k">Mietvertrag</span><span class="rc-row__v">${fmtEUR(tot)} pauschal inkl. NK</span></div>`;
    rentRead += `<div class="rc-row"><span class="rc-row__k" style="padding-left:8px;color:var(--cc-stone)">↳ Kaution</span><span class="rc-row__v" style="color:var(--cc-stone)">${fmtEUR(mvKaution)} · 3× Pauschal${r.kaution_override ? ' (override)' : ''}</span></div>`;
  }

  // Shared space chips (edit)
  const allSpaces = _parseArr(appSettings.gemeinschaftsraeume);
  const selSpaces = _parseArr(r.gemeinschaftsraeume);
  const spaceChips = allSpaces.map(sp => {
    const on = selSpaces.includes(sp) ? 'on' : '';
    return `<span class="rc-chip ${on}" data-space="${esc(sp)}" onclick="this.classList.toggle('on')">${esc(sp)}</span>`;
  }).join('');
  // Orphaned spaces (removed from settings but still on room)
  selSpaces.filter(s => !allSpaces.includes(s)).forEach(sp => {
    // already handled below if none
  });

  // Bathroom chips (edit)
  const allBads = _parseArr(appSettings.badezimmer);
  const selBads = _parseArr(r.badezimmer);
  const badChips = allBads.map(b => {
    const on = selBads.includes(b) ? 'on' : '';
    return `<span class="rc-chip ${on}" data-bad="${esc(b)}" onclick="this.classList.toggle('on')">${esc(b)}</span>`;
  }).join('');

  // Pricing toggles
  const mvIsPauschal = r.mietvertrag_pricing === 'pauschal';
  const kzIsPauschal = (r.kurzzeit_pricing || 'pauschal') === 'pauschal';

  return `
  <div class="rc" data-id="${r.id}" data-room="${esc(r.name)}">
    <!-- ── HEADER ── -->
    <div class="rc-hdr" onclick="if(!event.target.closest('.rc-drag'))_toggleCard(this.closest('.rc'))">
      <i class="ti ti-grip-vertical rc-drag"></i>
      <div class="rc-hdr__info">
        <div class="rc-hdr__namerow">
          <span class="rc-hdr__name">${esc(r.name)}</span>
          <span class="rc-status-badge ${vacant ? 'rc-status--vacant' : 'rc-status--occupied'}">
            ${vacant ? t('rooms_vacant') : t('rooms_occupied')}
          </span>
        </div>
        <div class="rc-hdr__meta">${r.flaeche_m2 ? r.flaeche_m2 + ' m²' : ''}${r.floor ? ' · ' + esc(r.floor) : ''}</div>
        <div class="rc-hdr__tags">
          ${r.room_type ? `<span class="rc-tag rc-tag--type">${esc(r.room_type)}</span>` : ''}
          ${hasKitchen ? `<span class="rc-tag rc-tag--kitchen">Kitchen ✓</span>` : ''}
        </div>
        ${_rentRowHTML(r)}
      </div>
      <i class="ti ti-chevron-right rc-chevron"></i>
    </div>

    <!-- ── READ MODE ── -->
    <div class="rc-read">

      <!-- Actions — slim ghost pills -->
      <div class="rc-actions">
        <button class="rc-act ${vacant ? 'rc-act--mark-occupied' : 'rc-act--mark-vacant'}"
          data-vacantbtn="${r.id}"
          onclick="_toggleVacant('${r.id}',this)">
          <i class="ti ${vacant ? 'ti-door-enter' : 'ti-door-exit'}" style="font-size:11px;"></i>
          ${vacant ? t('rooms_mark_occupied') : t('rooms_mark_vacant')}
        </button>
        <button class="rc-act ${hasKitchen ? 'rc-act--kitchen-on' : 'rc-act--kitchen-off'}"
          data-kitchenbtn="${esc(r.name)}"
          onclick="_toggleKitchenRoom('${esc(r.name)}',this)">
          <i class="ti ti-tool-kitchen-2" style="font-size:11px;"></i>
          ${hasKitchen ? 'Kitchen: On' : 'Kitchen: Off'}
        </button>
      </div>

      <!-- Mietobjekt -->
      <div class="rc-section">
        <div class="rc-stitle">Mietobjekt</div>
        <div class="rc-rows">
          <div class="rc-row"><span class="rc-row__k">Küche</span><span class="rc-row__v">${esc(r.kitchen_type||'—')}</span></div>
          <div class="rc-row"><span class="rc-row__k">Bad</span><span class="rc-row__v">${esc(badStr)}</span></div>
          <div class="rc-row"><span class="rc-row__k">Shared Spaces</span><span class="rc-row__v">${esc(gemStr)}</span></div>
        </div>
      </div>

      <!-- Miete — gold left border accent -->
      <div class="rc-section--miete">
        <div class="rc-stitle">Miete</div>
        <div class="rc-rows">
          ${rentRead || '<div class="rc-row"><span class="rc-row__v" style="color:var(--cc-stone);font-style:italic;">Not set</span></div>'}
        </div>
      </div>

      <!-- Schlüssel — inline icons -->
      <div class="rc-section">
        <div class="rc-stitle">Schlüssel</div>
        <div class="rc-keys">
          <div class="rc-key"><i class="ti ti-home"></i> Haustür ×${r.haustuerschluessel||1}</div>
          <div class="rc-key"><i class="ti ti-key"></i> Zimmer ×${r.zimmerschluessel||1}</div>
          ${r.briefkastenschluessel ? `<div class="rc-key"><i class="ti ti-mail"></i> Briefkasten ×${r.briefkastenschluessel}</div>` : ''}
        </div>
      </div>

      <!-- Inventar -->
      <div class="rc-inv-row">
        <div>
          <div class="rc-inv-label">Inventar · Anlage A</div>
          <div class="rc-inv-count">${invCount} ${invCount === 1 ? 'Gegenstand' : 'Gegenstände'}</div>
        </div>
        <button class="rc-inv-btn" onclick="_openInventar('${r.id}')">
          <i class="ti ti-list"></i> Edit
        </button>
      </div>

      <!-- Contracts — proper buttons -->
      <div class="rc-contracts">
        <div class="rc-contracts-title">Contracts</div>

        <div class="rc-doc-row">
          <button class="rc-doc-btn" onclick="_openContract('kurzzeit','${r.id}')">
            Kurzzeitmiete <i class="ti ti-chevron-right"></i>
          </button>
        </div>

        <div class="rc-doc-row">
          <button class="rc-doc-btn" onclick="_openContract('mietvertrag','${r.id}')">
            Mietvertrag <i class="ti ti-chevron-right"></i>
          </button>
        </div>

        <div class="rc-doc-row">
          <button class="rc-doc-btn" onclick="_openContract('ueberg','${r.id}')">
            Übergabeprotokoll <i class="ti ti-chevron-right"></i>
          </button>
          <div class="rc-doc-toggle" id="eu-${r.id}" onclick="event.stopPropagation()">
            <button class="active" onclick="_setEU('${r.id}',0,this)">Einzug</button>
            <button onclick="_setEU('${r.id}',1,this)">Auszug</button>
          </div>
        </div>

      </div>

      <!-- Footer: edit -->
      <div class="rc-card-footer">
        <button class="rc-edit-open-btn" onclick="_enterEdit(this.closest('.rc'))">
          <i class="ti ti-pencil"></i> Edit room details
        </button>
      </div>
    </div>

    <!-- EDIT MODE -->
    <div class="rc-edit">
      <div class="rc-edit-section">
        <div class="rc-edit-stitle">Identity</div>
        <div class="rc-field-row">
          <div class="rc-field"><label class="rc-field__label">Name</label><input class="rc-input" data-f="name" value="${esc(r.name)}"/></div>
          <div class="rc-field"><label class="rc-field__label">Floor</label><input class="rc-input" data-f="floor" value="${esc(r.floor||'')}"/></div>
        </div>
        <div class="rc-field-row">
          <div class="rc-field"><label class="rc-field__label">Size m²</label><input class="rc-input" type="number" data-f="flaeche_m2" value="${r.flaeche_m2||''}"/></div>
          <div class="rc-field"><label class="rc-field__label">Type</label>
            <select class="rc-input" data-f="room_type">
              <option ${r.room_type==='WG Zimmer'?'selected':''}>WG Zimmer</option>
              <option ${r.room_type==='Zimmer mit eigener Küche'?'selected':''}>Zimmer mit eigener Küche</option>
              <option ${r.room_type==='2-Zimmer mit eigener Küche'?'selected':''}>2-Zimmer mit eigener Küche</option>
            </select>
          </div>
        </div>
        <div class="rc-toggle-row">
          <span class="rc-tlabel" data-i18n="rooms_vacant">${t('rooms_vacant')}</span>
          <label class="cc-sw"><input type="checkbox" data-f="vacant" ${r.vacant?'checked':''}/><span class="cc-sw__t"></span></label>
        </div>

      </div>

      <div class="rc-edit-section">
        <div class="rc-edit-stitle">Mietobjekt</div>
        <div class="rc-field">
          <label class="rc-field__label">Kitchen</label>
          <select class="rc-input" data-f="kitchen_type">
            <option value="Eigene Küche"    ${r.kitchen_type==='Eigene Küche'   ?'selected':''}>Eigene Küche</option>
            <option value="Geteilte Küche" ${r.kitchen_type==='Geteilte Küche'?'selected':''}>Geteilte Küche</option>
            <option value="Keine Küche"   ${r.kitchen_type==='Keine Küche'  ?'selected':''}>Keine Küche</option>
          </select>
        </div>
        <div class="rc-field">
          <label class="rc-field__label">Bathroom</label>
          <div class="rc-chips" data-chipgroup="badezimmer">${badChips || '<span style="font-size:12px;color:var(--cc-stone);">Add bathrooms in Profile first</span>'}</div>
        </div>
        <div class="rc-field">
          <label class="rc-field__label">Shared spaces</label>
          <div class="rc-chips" data-chipgroup="gemeinschaftsraeume">${spaceChips || '<span style="font-size:12px;color:var(--cc-stone);">Add shared spaces in Profile first</span>'}</div>
        </div>
      </div>

      <div class="rc-edit-section">
        <div class="rc-edit-stitle">Kurzzeit Pricing</div>
        <div class="rc-toggle-row">
          <span class="rc-tlabel">${kzIsPauschal ? 'Pauschal' : 'Kalt + NK'}</span>
          <label class="cc-sw"><input type="checkbox" data-kztoggle ${kzIsPauschal?'':'checked'} onchange="_onKzToggle(this)"/><span class="cc-sw__t"></span></label>
        </div>
        <div class="rc-field-row">
          <div class="rc-field"><label class="rc-field__label">Kaltmiete (€)</label><input class="rc-input" type="number" data-f="kurzzeit_kaltmiete" value="${r.kurzzeit_kaltmiete||''}"/></div>
          <div class="rc-field"><label class="rc-field__label">Nebenkosten (€)</label><input class="rc-input" type="number" data-f="kurzzeit_nk" value="${r.kurzzeit_nk||''}"/></div>
        </div>
      </div>

      <div class="rc-edit-section">
        <div class="rc-edit-stitle">Mietvertrag Pricing</div>
        <div class="rc-toggle-row">
          <span class="rc-tlabel">${mvIsPauschal ? 'Pauschal' : 'Kalt + NK'}</span>
          <label class="cc-sw"><input type="checkbox" data-mvtoggle ${mvIsPauschal?'checked':''} onchange="_onMvToggle(this)"/><span class="cc-sw__t"></span></label>
        </div>
        <div class="rc-field-row">
          <div class="rc-field"><label class="rc-field__label">Kaltmiete (€)</label><input class="rc-input" type="number" data-f="kaltmiete" value="${r.kaltmiete||''}"/></div>
          <div class="rc-field"><label class="rc-field__label">Nebenkosten (€)</label><input class="rc-input" type="number" data-f="nk_pauschale" value="${r.nk_pauschale||''}"/></div>
        </div>
        <div class="rc-toggle-row" style="margin-top:6px;">
          <span class="rc-tlabel">Custom Kaution</span>
          <label class="cc-sw"><input type="checkbox" data-f="kaution_override" ${r.kaution_override?'checked':''} onchange="_toggleKautionOverride(this)"/><span class="cc-sw__t"></span></label>
        </div>
        <div data-kautionoverridefield style="${r.kaution_override?'':'display:none;'}">
          <div class="rc-field"><label class="rc-field__label">Kaution (€)</label><input class="rc-input" type="number" data-f="kaution_default" value="${r.kaution_default||''}"/></div>
        </div>
      </div>

      <div class="rc-edit-section">
        <div class="rc-edit-stitle">Schlüssel</div>
        <div class="rc-field-row">
          <div class="rc-field">
            <label class="rc-field__label">Haustür</label>
            <div class="rc-stepper"><button onclick="_step(this,-1)">−</button><span class="rc-stepper__v" data-f="haustuerschluessel">${r.haustuerschluessel||1}</span><button onclick="_step(this,1)">+</button></div>
          </div>
          <div class="rc-field">
            <label class="rc-field__label">Zimmer</label>
            <div class="rc-stepper"><button onclick="_step(this,-1)">−</button><span class="rc-stepper__v" data-f="zimmerschluessel">${r.zimmerschluessel||1}</span><button onclick="_step(this,1)">+</button></div>
          </div>
        </div>
        <div class="rc-field">
          <label class="rc-field__label">Briefkasten</label>
          <div class="rc-stepper"><button onclick="_step(this,-1)">−</button><span class="rc-stepper__v" data-f="briefkastenschluessel">${r.briefkastenschluessel||0}</span><button onclick="_step(this,1)">+</button></div>
        </div>
      </div>

      <div class="rc-edit-section" style="border-bottom:none;">
        <button class="rc-inv-btn" onclick="_openInventar('${r.id}')">
          <i class="ti ti-list"></i> Edit Inventar →
        </button>
      </div>

      <div class="rc-edit-footer">
        <div class="rc-save-row">
          <button class="rm-btn rm-btn--ghost" onclick="_cancelEdit(this.closest('.rc'))" data-i18n="rooms_cancel">${t('rooms_cancel')}</button>
          <button class="rm-btn rm-btn--primary" onclick="_saveCard(this.closest('.rc'))" data-i18n="rooms_save">${t('rooms_save')}</button>
        </div>
        <button class="rm-btn rm-btn--delete" onclick="_confirmDelete(this.closest('.rc'))">
          <i class="ti ti-trash"></i> <span data-i18n="rooms_delete">${t('rooms_delete')}</span>
        </button>
      </div>
    </div>
  </div>`;
}


/* ── BIND ALL CARDS ──────────────────────────────────────── */
function _bindAllCards() {
  // Delegated — nothing extra needed, all handlers inline
  // Re-apply i18n
  applyLang(typeof _currentLang !== 'undefined' ? _currentLang : 'en');
}


/* ── CARD INTERACTIONS ───────────────────────────────────── */
function _toggleCard(card) {
  if (card.classList.contains('rc--editing')) return;
  card.classList.toggle('rc--expanded');
  // When expanding: scroll card top into view just below the sticky nav
  if (card.classList.contains('rc--expanded')) {
    requestAnimationFrame(() => {
      const cardTop  = card.getBoundingClientRect().top + window.scrollY;
      const navH     = document.querySelector('.cc-nav')?.offsetHeight || 56;
      const headerH  = document.querySelector('.cc-header')?.offsetHeight || 52;
      const offset   = navH + headerH + 8; // 8px breathing room
      window.scrollTo({ top: cardTop - offset, behavior: 'smooth' });
    });
  }
}

function _enterEdit(card) {
  card.classList.add('rc--expanded', 'rc--editing');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _cancelEdit(card) {
  card.classList.remove('rc--editing');
  // Re-render this card from cache to discard changes
  const id = card.dataset.id;
  const room = getRoomById(id);
  if (room) {
    const wasExpanded = card.classList.contains('rc--expanded');
    card.outerHTML = _roomCardHTML(room);
    const newCard = document.querySelector(`.rc[data-id="${id}"]`);
    if (wasExpanded && newCard) newCard.classList.add('rc--expanded');
  }
  _bindAllCards();
  _initSortable();
}

function _onKzToggle(chk) {
  const label = chk.closest('.rc-toggle-row').querySelector('.rc-tlabel');
  label.textContent = chk.checked ? 'Kalt + NK' : 'Pauschal';
}

function _onMvToggle(chk) {
  const label = chk.closest('.rc-toggle-row').querySelector('.rc-tlabel');
  label.textContent = chk.checked ? 'Pauschal' : 'Kalt + NK';
}

function _toggleKautionOverride(chk) {
  const field = chk.closest('.rc-edit-section').querySelector('[data-kautionoverridefield]');
  if (field) field.style.display = chk.checked ? '' : 'none';
}

function _step(btn, delta) {
  const val = btn.parentElement.querySelector('.rc-stepper__v');
  let n = parseInt(val.textContent) + delta;
  if (n < 0) n = 0;
  val.textContent = n;
}

function _setEU(roomId, idx, btn) {
  const tog = document.getElementById('eu-' + roomId);
  if (!tog) return;
  tog.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === idx));
}

async function _toggleVacant(roomId, btn) {
  btn.disabled = true;
  const result = await toggleRoomVacant(roomId);
  if (result.ok) {
    const room = getRoomById(roomId);
    const card = document.querySelector(`.rc[data-id="${roomId}"]`);
    if (card && room) {
      const wasExpanded = card.classList.contains('rc--expanded');
      // Insert new card before old one, then remove old — more reliable than outerHTML on iOS
      const newDiv = document.createElement('div');
      newDiv.innerHTML = _roomCardHTML(room);
      const newCard = newDiv.firstElementChild;
      card.parentNode.insertBefore(newCard, card);
      card.remove();
      if (wasExpanded) newCard.classList.add('rc--expanded');
      _bindAllCards();
      _initSortable();
      _updateRoomsSummary(appRooms);
    }
  } else {
    btn.disabled = false;
  }
}

async function _toggleKitchenRoom(roomName, btn) {
  btn.disabled = true;

  // Toggle kitchenRooms[] in memory and sync to Supabase lounge_data (realtime to tenants)
  const rooms = typeof getKitchenRooms === 'function' ? getKitchenRooms() : [];
  const idx   = rooms.indexOf(roomName);
  if (idx === -1) rooms.push(roomName);
  else            rooms.splice(idx, 1);
  if (typeof syncKitchenRoomsToSupabase === 'function') syncKitchenRoomsToSupabase(rooms);

  // Also persist kitchen_enabled on the rooms row (persistent source of truth)
  const nowEnabled = rooms.includes(roomName);
  const roomObj = appRooms.find(r => r.name === roomName);
  if (roomObj) roomObj.kitchen_enabled = nowEnabled;
  if (sbL) sbL.from('rooms').update({ kitchen_enabled: nowEnabled }).eq('name', roomName);

  // Re-render just this card to reflect new badge + button state
  const card = document.querySelector(`.rc[data-room="${CSS.escape(roomName)}"]`);
  const room = appRooms.find(r => r.name === roomName);
  if (card && room) {
    const wasExpanded = card.classList.contains('rc--expanded');
    const newDiv = document.createElement('div');
    newDiv.innerHTML = _roomCardHTML(room);
    const newCard = newDiv.firstElementChild;
    card.parentNode.insertBefore(newCard, card);
    card.remove();
    if (wasExpanded) newCard.classList.add('rc--expanded');
    _bindAllCards();
    _initSortable();
  } else {
    btn.disabled = false;
  }
}


/* ── SAVE CARD ───────────────────────────────────────────── */
async function _saveCard(card) {
  const id   = card.dataset.id;
  const room = getRoomById(id) || {};
  const data = { ...room };

  // Collect simple inputs
  card.querySelectorAll('[data-f]').forEach(el => {
    const key = el.dataset.f;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      data[key] = el.checked;
    } else if (el.tagName === 'INPUT' && el.type === 'number') {
      data[key] = el.value !== '' ? parseFloat(el.value) : null;
    } else if (el.classList.contains('rc-stepper__v')) {
      data[key] = parseInt(el.textContent, 10);
    } else {
      data[key] = el.value;
    }
  });

  // Collect chip selections
  const spaceChips = card.querySelectorAll('[data-chipgroup="gemeinschaftsraeume"] .rc-chip.on');
  data.gemeinschaftsraeume = [...spaceChips].map(c => c.dataset.space);

  const badChips = card.querySelectorAll('[data-chipgroup="badezimmer"] .rc-chip.on');
  data.badezimmer = [...badChips].map(c => c.dataset.bad);

  // Pricing types
  const kzToggle = card.querySelector('[data-kztoggle]');
  if (kzToggle) data.kurzzeit_pricing = kzToggle.checked ? 'kalt_nk' : 'pauschal';
  const mvToggle = card.querySelector('[data-mvtoggle]');
  if (mvToggle) data.mietvertrag_pricing = mvToggle.checked ? 'pauschal' : 'kalt_nk';

  // Save
  const saveBtn = card.querySelector('.rm-btn--primary');
  const origText = saveBtn.innerHTML;
  saveBtn.innerHTML = '…';
  saveBtn.disabled = true;

  const result = await saveRoom(data);

  if (!result.ok) {
    saveBtn.innerHTML = 'Error';
    setTimeout(() => { saveBtn.innerHTML = origText; saveBtn.disabled = false; }, 2000);
    return;
  }

  // Re-render — use insertBefore/remove (more reliable than outerHTML on iOS)
  const newDiv = document.createElement('div');
  newDiv.innerHTML = _roomCardHTML(result.room);
  const newCard = newDiv.firstElementChild;
  // Always restore expanded + read mode (never re-enter edit after save)
  newCard.classList.add('rc--expanded');
  card.parentNode.insertBefore(newCard, card);
  card.remove();
  _bindAllCards();
  _initSortable();
}


/* ── ADD NEW ROOM ────────────────────────────────────────── */
document.getElementById('roomAddBtn')?.addEventListener('click', () => {
  const list = document.getElementById('roomsList');
  const tempId = 'new-' + Date.now();

  const blank = {
    id: null, name: '', room_type: 'WG Zimmer', active: true, vacant: false,
    floor: '', flaeche_m2: null, kitchen_type: 'Geteilte Küche',
    badezimmer: [], gemeinschaftsraeume: [],
    monatl_miete: null, mietvertrag_pricing: 'kalt_nk',
    kurzzeit_pricing: 'pauschal', kurzzeit_kaltmiete: null, kurzzeit_nk: null,
    mietvertrag_miete: null, kaltmiete: null, nk_pauschale: null,
    active_price_type: null,
    kaution_override: false, kaution_default: null,
    haustuerschluessel: 1, zimmerschluessel: 1, briefkastenschluessel: 0,
    inventar: [], sort_order: appRooms.length,
  };

  const div = document.createElement('div');
  div.innerHTML = _roomCardHTML(blank);
  const card = div.firstElementChild;
  card.id = tempId;
  card.classList.add('rc--expanded', 'rc--editing');
  list.insertBefore(card, list.firstChild);
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.querySelector('.rc-input[data-f="name"]')?.focus();

  // Override save for new card
  card.querySelector('.rm-btn--primary').onclick = async () => {
    const name = card.querySelector('[data-f="name"]')?.value.trim();
    if (!name) { alert('Room name is required.'); return; }

    const data = { active: true, vacant: false };
    card.querySelectorAll('[data-f]').forEach(el => {
      const key = el.dataset.f;
      if (el.tagName === 'INPUT' && el.type === 'checkbox') data[key] = el.checked;
      else if (el.tagName === 'INPUT' && el.type === 'number') data[key] = el.value !== '' ? parseFloat(el.value) : null;
      else if (el.classList.contains('rc-stepper__v')) data[key] = parseInt(el.textContent, 10);
      else data[key] = el.value;
    });
    const spaceChips = card.querySelectorAll('[data-chipgroup="gemeinschaftsraeume"] .rc-chip.on');
    data.gemeinschaftsraeume = [...spaceChips].map(c => c.dataset.space);
    const badChips = card.querySelectorAll('[data-chipgroup="badezimmer"] .rc-chip.on');
    data.badezimmer = [...badChips].map(c => c.dataset.bad);
    const kzToggle = card.querySelector('[data-kztoggle]');
    if (kzToggle) data.kurzzeit_pricing = kzToggle.checked ? 'kalt_nk' : 'pauschal';
    const mvToggle = card.querySelector('[data-mvtoggle]');
    if (mvToggle) data.mietvertrag_pricing = mvToggle.checked ? 'pauschal' : 'kalt_nk';
    const activePriceType = card.querySelector('.rc-price-toggle__opt.active--mietvertrag, .rc-price-toggle__opt.active--kurzzeit');
    if (activePriceType) data.active_price_type = activePriceType.dataset.type;
    data.inventar = [];

    const result = await saveRoom(data);
    if (!result.ok) { alert('Save failed: ' + result.error); return; }
    // Write default password hash so tenant can log in immediately
    if (sbL && name) {
      const defaultPw = name.toLowerCase().replace(/\s+/g, '') + '2026';
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(defaultPw));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
      await sbL.from('lounge_data').insert({ type: 'password', room: name, body: hash });
    }
    card.remove();
    _renderRoomsList();
    _initSortable();
  };

  card.querySelector('.rm-btn--ghost').onclick = () => {
    card.style.transition = 'opacity .15s';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 150);
  };
});


/* ── DELETE ──────────────────────────────────────────────── */
let _pendingDeleteId = null;

function _confirmDelete(card) {
  _pendingDeleteId = card.dataset.id;
  const name = card.dataset.room || 'this room';
  document.getElementById('confirmBody').innerHTML =
    `This will permanently delete <strong>${esc(name)}</strong>. This cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('open');
}

document.getElementById('confirmCancel')?.addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.remove('open');
  _pendingDeleteId = null;
});

document.getElementById('confirmOk')?.addEventListener('click', async () => {
  if (!_pendingDeleteId) return;
  const btn = document.getElementById('confirmOk');
  btn.disabled = true;

  const result = await deleteRoom(_pendingDeleteId);
  document.getElementById('confirmOverlay').classList.remove('open');
  _pendingDeleteId = null;
  btn.disabled = false;

  if (result.ok) {
    _renderRoomsList();
    _initSortable();
  }
});


/* ── INVENTAR MODAL ──────────────────────────────────────── */
let _inventarRoomId = null;

function _openInventar(roomId) {
  _inventarRoomId = roomId;
  const room = getRoomById(roomId);
  document.getElementById('inventarSubtitle').textContent = (room?.name || '') + ' · Anlage A';

  const list = document.getElementById('inventarList');
  const items = Array.isArray(room?.inventar) ? room.inventar : [];
  list.innerHTML = items.map(i => `
    <div class="inv-row">
      <input class="inv-name" value="${esc(i.gegenstand)}"/>
      <input class="inv-qty" type="number" value="${i.anzahl}" min="1"/>
      <button class="inv-rm" onclick="this.closest('.inv-row').remove()"><i class="ti ti-trash"></i></button>
    </div>`).join('');

  document.getElementById('inventarOverlay').classList.add('open');
}

document.getElementById('inventarClose')?.addEventListener('click', () => {
  document.getElementById('inventarOverlay').classList.remove('open');
  _inventarRoomId = null;
});

document.getElementById('inventarCancel')?.addEventListener('click', () => {
  document.getElementById('inventarOverlay').classList.remove('open');
  _inventarRoomId = null;
});

document.getElementById('inventarOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('inventarOverlay')) {
    document.getElementById('inventarOverlay').classList.remove('open');
    _inventarRoomId = null;
  }
});

document.getElementById('inventarAddRow')?.addEventListener('click', () => {
  const list = document.getElementById('inventarList');
  const row = document.createElement('div');
  row.className = 'inv-row';
  row.innerHTML = `<input class="inv-name" placeholder="Gegenstand…"/><input class="inv-qty" type="number" value="1" min="1"/><button class="inv-rm" onclick="this.closest('.inv-row').remove()"><i class="ti ti-trash"></i></button>`;
  list.appendChild(row);
  row.querySelector('input').focus();
});

document.getElementById('inventarSave')?.addEventListener('click', async () => {
  if (!_inventarRoomId) return;
  const rows = document.querySelectorAll('#inventarList .inv-row');
  const inventar = [];
  rows.forEach(row => {
    const g = row.querySelector('.inv-name').value.trim();
    const a = parseInt(row.querySelector('.inv-qty').value, 10) || 1;
    if (g) inventar.push({ gegenstand: g, anzahl: a });
  });

  const btn = document.getElementById('inventarSave');
  btn.textContent = '…';
  btn.disabled = true;

  const result = await saveRoomInventar(_inventarRoomId, inventar);
  btn.disabled = false;
  btn.setAttribute('data-i18n', 'rooms_save');
  btn.textContent = t('rooms_save');

  if (result.ok) {
    document.getElementById('inventarOverlay').classList.remove('open');
    // Re-render card to update count
    const room = getRoomById(_inventarRoomId);
    const card = document.querySelector(`.rc[data-id="${_inventarRoomId}"]`);
    if (card && room) {
      const wasExpanded = card.classList.contains('rc--expanded');
      card.outerHTML = _roomCardHTML(room);
      const newCard = document.querySelector(`.rc[data-id="${_inventarRoomId}"]`);
      if (wasExpanded && newCard) newCard.classList.add('rc--expanded');
      _bindAllCards();
      _initSortable();
    }
    _inventarRoomId = null;
  }
});


/* ── CONTRACT MODAL ──────────────────────────────────────── */
let _contractRoomId = null;
let _contractType   = null;

/* ── PDF PREVIEW MODAL ─────────────────────────────────────── */
function _openPdfPreview(title, saveFn) {
  const overlay  = document.getElementById('pdfPreviewOverlay');
  const titleEl  = document.getElementById('pdfPreviewTitle');
  const saveBtn  = document.getElementById('pdfPreviewSaveBtn');
  const closeBtn = document.getElementById('pdfPreviewClose');
  const doc      = document.getElementById('pdfPreviewDoc');
  if (!overlay) return;

  // Build preview from hidden render container
  const renderSrc = document.getElementById('_pdfRenderContainer');
  doc.innerHTML = '';
  let _previewStyle = null;
  let _previewPages = [];

  if (renderSrc) {
    const styleEl = renderSrc.querySelector('style');
    if (styleEl) {
      _previewStyle = document.createElement('style');
      _previewStyle.textContent = styleEl.textContent;
      doc.appendChild(_previewStyle);
    }
    renderSrc.querySelectorAll('.pdf-page').forEach(pg => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'flex-shrink:0;box-shadow:0 2px 12px rgba(0,0,0,.10);border-radius:2px;overflow:hidden;';
      const clone = pg.cloneNode(true);
      clone.style.display = 'block';
      wrapper.appendChild(clone);
      doc.appendChild(wrapper);
      _previewPages.push({ wrapper, clone });
    });
  } else {
    doc.innerHTML = '<p style="padding:24px;color:var(--cc-stone);font-size:12px;text-align:center;">Generating preview…</p>';
  }

  // Zoom state
  let _zoom = null; // null = auto-fit
  const PAGE_W = 794;

  const applyZoom = (zoom) => {
    const bodyW   = document.getElementById('pdfPreviewBody').clientWidth - 32;
    const autoFit = Math.min(1, bodyW / PAGE_W);
    const scale   = zoom !== null ? zoom : autoFit;
    const label   = document.getElementById('pdfZoomLabel');
    if (label) label.textContent = Math.round(scale * 100) + '%';
    _previewPages.forEach(({ wrapper, clone }) => {
      clone.style.transform       = `scale(${scale})`;
      clone.style.transformOrigin = 'top left';
      clone.style.width           = PAGE_W + 'px';
      // wrapper must be sized to the scaled height so scroll works
      const scaledH = 1122.52 * scale; // A4 height in px
      wrapper.style.width  = Math.ceil(PAGE_W * scale) + 'px';
      wrapper.style.height = Math.ceil(scaledH) + 'px';
    });
    doc.style.width = Math.ceil(PAGE_W * scale) + 'px';
  };

  setTimeout(() => applyZoom(null), 60);

  // Zoom buttons
  const zoomIn  = document.getElementById('pdfZoomIn');
  const zoomOut = document.getElementById('pdfZoomOut');
  if (zoomIn) {
    const freshIn = zoomIn.cloneNode(true); zoomIn.parentNode.replaceChild(freshIn, zoomIn);
    freshIn.addEventListener('click', () => {
      const bodyW   = document.getElementById('pdfPreviewBody').clientWidth - 32;
      const autoFit = Math.min(1, bodyW / PAGE_W);
      const cur = _zoom !== null ? _zoom : autoFit;
      _zoom = Math.min(2, Math.round((cur + 0.1) * 10) / 10);
      applyZoom(_zoom);
    });
  }
  if (zoomOut) {
    const freshOut = zoomOut.cloneNode(true); zoomOut.parentNode.replaceChild(freshOut, zoomOut);
    freshOut.addEventListener('click', () => {
      const bodyW   = document.getElementById('pdfPreviewBody').clientWidth - 32;
      const autoFit = Math.min(1, bodyW / PAGE_W);
      const cur = _zoom !== null ? _zoom : autoFit;
      _zoom = Math.max(0.3, Math.round((cur - 0.1) * 10) / 10);
      applyZoom(_zoom);
    });
  }
  window.addEventListener('resize', () => { if (_zoom === null) applyZoom(null); }, { once: true });

  titleEl.innerHTML = `<span style="color:var(--cc-stone);margin-right:4px;">Vorschau ·</span>${title}`;
  overlay.style.display = 'flex';

  // Wire save button — calls original generate function unchanged
  const newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  document.getElementById('pdfPreviewSaveBtn').addEventListener('click', async () => {
    document.getElementById('pdfPreviewOverlay').style.display = 'none';
    await saveFn();
  });

  // Wire close
  const newClose = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newClose, closeBtn);
  document.getElementById('pdfPreviewClose').addEventListener('click', () => {
    document.getElementById('pdfPreviewOverlay').style.display = 'none';
  });
}

function _openContract(type, roomId) {
  _contractRoomId = roomId;
  _contractType   = type;
  const room = getRoomById(roomId);
  if (!room) return;

  document.getElementById('contractOverlay').classList.add('open');

  const typeLbl  = document.getElementById('contractTypeLbl');
  const titleLbl = document.getElementById('contractTitleLbl');
  const subLbl   = document.getElementById('contractSubLbl');
  const body     = document.getElementById('contractBody');
  const footer   = document.getElementById('contractFooter');

  if (type === 'kurzzeit') {
    typeLbl.textContent  = 'Kurzzeitmietvertrag';
    titleLbl.textContent = `New contract — ${room.name}`;
    subLbl.textContent   = `${room.flaeche_m2 ? room.flaeche_m2 + ' m²' : ''} · ${room.floor || ''} · ${room.room_type || ''}`;
    body.innerHTML       = _contractBodyKurzzeit(room);
    footer.innerHTML     = `
      <button class="rm-btn rm-btn--cancel" id="contractCancelBtn">Cancel</button>
      <button class="rm-btn rm-btn--pdf" id="contractPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
    const _kzRawBtn = document.getElementById('contractPdfBtn');
    const _kzPdfBtn = _kzRawBtn.cloneNode(true);
    _kzRawBtn.parentNode.replaceChild(_kzPdfBtn, _kzRawBtn);
    _kzPdfBtn.addEventListener('click', async () => {
      const room2 = getRoomById(_contractRoomId); if (!room2) return;
      const mieterName = document.getElementById('cm-name')?.value.trim();
      const mieterAdr  = document.getElementById('cm-adr')?.value.trim();
      const mieterDob  = document.getElementById('cm-dob')?.value.trim();
      const mieterEmail= document.getElementById('cm-email')?.value.trim();
      const mieterTel  = document.getElementById('cm-tel')?.value.trim();
      const startVal   = document.getElementById('cm-start')?.value;
      const endVal     = document.getElementById('cm-end')?.value;
      const sigVal     = document.getElementById('cm-sig')?.value;
      const ersterMonatVoll  = document.getElementById('cm-erster-btn')?.dataset.mode === 'voll';
      const letzterMonatVoll = document.getElementById('cm-letzter-btn')?.dataset.mode === 'voll';
      if (!startVal || !endVal) { alert('Bitte Mietbeginn und Mietende ausfüllen.'); return; }
      const s    = appSettings;
      const data = _buildMietvertragData(room2, s, { mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel, startVal, endVal, sigVal, ersterMonatVoll, letzterMonatVoll });
      const html = _renderKurzzeitHTML(data);
      // Pre-render into hidden container so preview can read it
      let container = document.getElementById('_pdfRenderContainer');
      if (container) container.remove();
      container = document.createElement('div');
      container.id = '_pdfRenderContainer';
      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#faf9f7;z-index:-1;font-size:11.33px;';
      container.innerHTML = html;
      document.body.appendChild(container);
      await document.fonts.ready;
      if (window.innerWidth >= 701) {
        _openPdfPreview('Kurzzeitmiete', _generateKurzzeitPDF);
      } else {
        await _generateKurzzeitPDF();
      }
    });
    document.getElementById('cm-start')?.addEventListener('change', _updateMonatToggles);
    document.getElementById('cm-end')?.addEventListener('change', _updateMonatToggles);

  } else if (type === 'mietvertrag') {
    typeLbl.textContent  = 'Mietvertrag';
    titleLbl.textContent = `New contract — ${room.name}`;
    subLbl.textContent   = `${room.flaeche_m2 ? room.flaeche_m2 + ' m²' : ''} · ${room.floor || ''}`;
    body.innerHTML       = _contractBodyMietvertrag(room);
    footer.innerHTML     = `
      <button class="rm-btn rm-btn--cancel" id="contractCancelBtn">Cancel</button>
      <button class="rm-btn rm-btn--pdf" id="contractPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
    const _mvRawBtn = document.getElementById('contractPdfBtn');
    const _mvPdfBtn = _mvRawBtn.cloneNode(true);
    _mvRawBtn.parentNode.replaceChild(_mvPdfBtn, _mvRawBtn);
    _mvPdfBtn.addEventListener('click', async () => {
      const room2   = getRoomById(_contractRoomId); if (!room2) return;
      const mieterName  = document.getElementById('mv-name')?.value.trim();
      const mieterAdr   = document.getElementById('mv-adr')?.value.trim();
      const mieterDob   = document.getElementById('mv-dob')?.value.trim();
      const mieterEmail = document.getElementById('mv-email')?.value.trim();
      const mieterTel   = document.getElementById('mv-tel')?.value.trim();
      const startVal    = document.getElementById('mv-start')?.value;
      const sigVal      = document.getElementById('mv-sig')?.value;
      const befristet   = document.getElementById('mv-befristung-btn')?.dataset.mode === 'befristet';
      const endVal      = befristet ? document.getElementById('mv-end')?.value : null;
      const grundVal    = befristet ? (document.querySelector('input[name=\'mv-grund\']:checked')?.value || '') : '';
      const eigenbedarfPerson = grundVal === 'eigenbedarf'
        ? document.getElementById('mv-eigenbedarf-person')?.value.trim() : '';
      if (befristet && grundVal === 'eigenbedarf' && !eigenbedarfPerson) {
        alert('Bitte Eigenbedarfsperson angeben (gesetzliche Pflicht).'); return;
      }
      if (!startVal) { alert('Bitte Mietbeginn ausfüllen.'); return; }
      if (befristet && !endVal) { alert('Bitte Mietende ausfüllen.'); return; }
      const ersterMonatVoll = document.getElementById('mv-erster-btn')?.dataset.mode === 'voll';
      const data = _buildMietvertragOnlyData(room2, appSettings, {
        mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel, startVal, sigVal,
        befristet, endVal, grundVal, eigenbedarfPerson, ersterMonatVoll,
      });
      const html = _renderMietvertragHTML(data);
      let container = document.getElementById('_pdfRenderContainer');
      if (container) container.remove();
      container = document.createElement('div');
      container.id = '_pdfRenderContainer';
      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
      container.innerHTML = html;
      document.body.appendChild(container);
      await document.fonts.ready;
      if (window.innerWidth >= 701) {
        _openPdfPreview('Mietvertrag', _generateMietvertragPDF);
      } else {
        await _generateMietvertragPDF();
      }
    });

  } else if (type === 'ueberg') {
    const isEinzug = document.getElementById('eu-' + roomId)?.querySelector('.active')?.textContent?.trim() === 'Einzug';
    typeLbl.textContent  = 'Übergabeprotokoll';
    titleLbl.textContent = (isEinzug ? 'Einzug' : 'Auszug') + ' — ' + room.name;
    subLbl.textContent   = (room.flaeche_m2 ? room.flaeche_m2 + ' m²' : '') + (room.floor ? ' · ' + room.floor : '');
    body.innerHTML       = _contractBodyUeberg(room, isEinzug);
    footer.innerHTML     = `
      <button class="rm-btn rm-btn--cancel" id="contractCancelBtn">Cancel</button>
      <button class="rm-btn rm-btn--pdf" id="contractPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
    const _ubRawBtn = document.getElementById('contractPdfBtn');
    const _ubPdfBtn = _ubRawBtn.cloneNode(true);
    _ubRawBtn.parentNode.replaceChild(_ubPdfBtn, _ubRawBtn);
    _ubPdfBtn.addEventListener('click', async () => {
      // Validate required fields first
      const mieterName2 = document.getElementById('ub-mieter-name')?.value.trim();
      const datum2      = document.getElementById('ub-datum')?.value;
      // Pre-render into hidden container so preview reads from it
      // _generateUebergPDF will re-render anyway when PDF is actually saved
      await _generateUebergPreviewContainer(isEinzug);
      if (window.innerWidth >= 701) {
        _openPdfPreview('Übergabeprotokoll', () => _generateUebergPDF(isEinzug));
      } else {
        await _generateUebergPDF(isEinzug);
      }
    });
    // Init toggle after DOM renders
    setTimeout(() => { _initUebergMieterToggle(room); }, 50);
  }

  // Cancel: use fresh clone to avoid stale listener accumulation
  const cancelBtn = document.getElementById('contractCancelBtn');
  if (cancelBtn) {
    const freshCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(freshCancel, cancelBtn);
    freshCancel.addEventListener('click', () => {
      document.getElementById('contractOverlay').classList.remove('open');
    });
  }
}

document.getElementById('contractClose')?.addEventListener('click', () => {
  document.getElementById('contractOverlay').classList.remove('open');
});

document.getElementById('contractOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('contractOverlay'))
    document.getElementById('contractOverlay').classList.remove('open');
});


/* ── CONTRACT BODY: ÜBERGABEPROTOKOLL ───────────────────── */
function _contractBodyUeberg(room, isEinzug) {
  const s = appSettings;
  // Load tenant from localStorage
  const profile   = (typeof S !== 'undefined') ? S.get('room_profile_' + room.name, {}) : {};
  const tenantName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  const zaehler = _parseArr(s.zaehler);
  const strom   = zaehler.find(z => z.type === 'Strom');
  const gas     = zaehler.find(z => z.type === 'Gas');
  const wasser  = zaehler.find(z => z.type === 'Wasser');

  return `
    <!-- Mieter toggle — iOS-style pill -->
    <div class="rm-fields-title" style="margin-bottom:10px;">Mieter</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--cc-taupe);font-weight:400;">${esc(room.name)} Mieter</span>
      <div class="ub-mieter-pill" id="uebergMieterPill" data-state="room" onclick="_toggleUebergMieter('${room.id}')">
        <div class="ub-mieter-pill__knob"></div>
      </div>
      <span style="font-size:11px;color:var(--cc-stone);" id="uebergMieterManualLbl">Manuell</span>
    </div>
    <div class="rm-field" id="uebergMieterNameWrap">
      <label>Mieter Name</label>
      <input class="rm-input" id="ub-mieter-name" value="${esc(tenantName)}" placeholder="Vor- und Nachname…"/>
    </div>
    <div class="rm-field">
      <label>Mieter Adresse <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;">(frei eingeben)</span></label>
      <input class="rm-input" id="ub-mieter-adr" placeholder="Aktuelle Adresse…"/>
    </div>

    <!-- Übergabedatum -->
    <div class="rm-field" style="margin-top:4px;">
      <label>Übergabedatum</label>
      <input class="rm-input" id="ub-datum" type="text" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/>
    </div>
    ${!isEinzug ? `
    <!-- Neue Adresse — Auszug only -->
    <div class="rm-field">
      <label>Neue Adresse des Mieters</label>
      <input class="rm-input" id="ub-neue-adr" placeholder="Neue Adresse nach Auszug…"/>
    </div>` : '<input type="hidden" id="ub-neue-adr"/>'}

    <!-- Mängelbeschreibung -->
    <div class="rm-field" style="margin-top:8px;">
      <label>Mängelbeschreibung / Zustand</label>
      <textarea class="rm-input" id="ub-maengel" rows="3" style="resize:vertical;line-height:1.5;" placeholder="Zustand des Zimmers bei Übergabe…"></textarea>
    </div>

    <!-- Zählerstände -->
    <div class="rm-fields-title" style="margin-top:6px;margin-bottom:8px;">Zählerstände</div>
    <div class="rm-field-row">
      <div class="rm-field">
        <label>Strom <span style="font-size:9px;color:var(--cc-stone);">${strom ? strom.nummer : ''}</span></label>
        <input class="rm-input" id="ub-strom" placeholder="Stand…"/>
      </div>
      <div class="rm-field">
        <label>Gas <span style="font-size:9px;color:var(--cc-stone);">${gas ? gas.nummer : ''}</span></label>
        <input class="rm-input" id="ub-gas" placeholder="Stand…"/>
      </div>
    </div>
    <div class="rm-field" style="max-width:50%;padding-right:4px;">
      <label>Wasser <span style="font-size:9px;color:var(--cc-stone);">${wasser ? wasser.nummer : ''}</span></label>
      <input class="rm-input" id="ub-wasser" placeholder="Stand…"/>
    </div>

    <!-- Schlüssel -->
    <div class="rm-fields-title" style="margin-top:6px;margin-bottom:8px;">Schlüsselübergabe</div>
    <div class="rm-field-row">
      <div class="rm-field">
        <label>Haustür</label>
        <input class="rm-input" type="number" id="ub-haustur" value="${room.haustuerschluessel || 1}" min="0"/>
      </div>
      <div class="rm-field">
        <label>Zimmertür</label>
        <input class="rm-input" type="number" id="ub-zimmertur" value="${room.zimmerschluessel || 1}" min="0"/>
      </div>
    </div>

    <!-- Allgemeine Bemerkungen -->
    <div class="rm-field" style="margin-top:4px;">
      <label>Allgemeine Bemerkungen</label>
      <textarea class="rm-input" id="ub-bemerkungen" rows="3" style="resize:vertical;line-height:1.5;" placeholder="Sonstige Anmerkungen…"></textarea>
    </div>

    <!-- Unterzeichnungsdatum — at end -->
    <div class="rm-field" style="margin-top:4px;">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;">(optional)</span></label>
      <input class="rm-input" id="ub-sig" type="date" onclick="try{this.showPicker()}catch(e){}" />
    </div>
  `;
}

function _initUebergMieterToggle(room) {
  // Pill toggle is handled by _toggleUebergMieter via onclick
  // Just store tenant name on the pill for reference
  const profile    = (typeof S !== 'undefined') ? S.get('room_profile_' + room.name, {}) : {};
  const tenantName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const pill = document.getElementById('uebergMieterPill');
  if (pill) pill.dataset.tenantName = tenantName;
}

function _toggleUebergMieter(roomId) {
  const pill      = document.getElementById('uebergMieterPill');
  const nameInput = document.getElementById('ub-mieter-name');
  const manualLbl = document.getElementById('uebergMieterManualLbl');
  if (!pill || !nameInput) return;

  const isRoom = pill.dataset.state === 'room';

  if (isRoom) {
    // Switch to manual
    pill.dataset.state = 'manual';
    nameInput.value = '';
    nameInput.focus();
    if (manualLbl) manualLbl.style.color = 'var(--cc-charcoal)';
  } else {
    // Switch back to room tenant
    pill.dataset.state = 'room';
    nameInput.value = pill.dataset.tenantName || '';
    if (manualLbl) manualLbl.style.color = 'var(--cc-stone)';
  }
}


/* ── CONTRACT BODY: KURZZEIT ─────────────────────────────── */
/* Auto-insert dots while typing a German date: 13011992 → 13.01.1992 */
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

function _toggleErsterMonat() {
  const btn  = document.getElementById('cm-erster-btn');
  const lbl  = document.getElementById('cm-erster-lbl');
  const sub  = document.getElementById('cm-erster-sub');
  if (!btn) return;
  const isVoll = btn.dataset.mode === 'anteilig';
  btn.dataset.mode = isVoll ? 'voll' : 'anteilig';
  lbl.textContent  = isVoll ? 'Voller Monat' : 'Anteilig';
  sub.textContent  = isVoll ? 'Voller Monat — pauschal' : 'Anteilig — wird berechnet';
}

function _updateMonatToggles() {
  const startVal = document.getElementById('cm-start')?.value;
  const endVal   = document.getElementById('cm-end')?.value;

  // — Kaution display update —
  const kautionValEl  = document.getElementById('cm-kaution-val');
  const kautionRuleEl = document.getElementById('cm-kaution-rule');
  if (kautionValEl && startVal && endVal) {
    const room = getRoomById(_contractRoomId);
    if (room) {
      const kzKalt = Number(room.kurzzeit_kaltmiete) || 0;
      const kzNk   = Number(room.kurzzeit_nk) || 0;
      const kzIsPauschal = (room.kurzzeit_pricing || 'pauschal') !== 'kalt_nk';
      const rent   = kzIsPauschal ? kzKalt + kzNk : kzKalt;
      const totalMonths = Math.round(
        (new Date(endVal) - new Date(startVal)) / (30.44 * 24 * 3600 * 1000)
      );
      let kaution, ruleText;
      if (room.kaution_override && room.kaution_default) {
        kaution   = Number(room.kaution_default);
        ruleText  = 'Individuelle Kaution';
      } else if (totalMonths <= 3) {
        kaution   = rent;
        ruleText  = `≤ 3 Monate → 1× (${totalMonths} Mon.)`;
      } else {
        kaution   = rent * 3;
        ruleText  = `> 3 Monate → 3× (${totalMonths} Mon.)`;
      }
      kautionValEl.textContent  = fmtEUR(kaution);
      kautionRuleEl.textContent = ruleText;
    }
  }

  // — Erster Monat toggle —
  const ersterWrap = document.getElementById('cm-erster-wrap');
  if (ersterWrap) {
    const show = startVal && new Date(startVal).getDate() !== 1;
    ersterWrap.style.display = show ? '' : 'none';
    if (!show || startVal !== (ersterWrap._lastStart || '')) {
      const btn = document.getElementById('cm-erster-btn');
      const lbl = document.getElementById('cm-erster-lbl');
      const sub = document.getElementById('cm-erster-sub');
      if (btn) { btn.dataset.mode = 'anteilig'; lbl.textContent = 'Anteilig'; sub.textContent = 'Anteilig — wird berechnet'; }
    }
    ersterWrap._lastStart = startVal;
  }

  // — Letzter Monat toggle —
  const letzterWrap = document.getElementById('cm-letzter-wrap');
  if (letzterWrap) {
    let show = false;
    if (startVal && endVal) {
      const s = new Date(startVal);
      const e = new Date(endVal);
      const sameMonth = e.getFullYear() === s.getFullYear() && e.getMonth() === s.getMonth();
      const lastDayOfEndMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
      const letzterAnteilig = e.getDate() !== lastDayOfEndMonth;
      show = !sameMonth && letzterAnteilig;
    }
    letzterWrap.style.display = show ? '' : 'none';
    if (!show || endVal !== (letzterWrap._lastEnd || '')) {
      const btn = document.getElementById('cm-letzter-btn');
      const lbl = document.getElementById('cm-letzter-lbl');
      const sub = document.getElementById('cm-letzter-sub');
      if (btn) { btn.dataset.mode = 'anteilig'; lbl.textContent = 'Anteilig'; sub.textContent = 'Anteilig — wird berechnet'; }
    }
    letzterWrap._lastEnd = endVal;
  }
}

function _toggleLetzterMonat() {
  const btn = document.getElementById('cm-letzter-btn');
  const lbl = document.getElementById('cm-letzter-lbl');
  const sub = document.getElementById('cm-letzter-sub');
  if (!btn) return;
  const isVoll = btn.dataset.mode === 'anteilig';
  btn.dataset.mode   = isVoll ? 'voll' : 'anteilig';
  lbl.textContent    = isVoll ? 'Voller Monat' : 'Anteilig';
  sub.textContent    = isVoll ? 'Voller Monat — pauschal' : 'Anteilig — wird berechnet';
}

function _updateMvMonatToggle() {
  const startVal   = document.getElementById('mv-start')?.value;
  const ersterWrap = document.getElementById('mv-erster-wrap');
  if (!ersterWrap) return;
  const show = startVal && new Date(startVal).getDate() !== 1;
  ersterWrap.style.display = show ? '' : 'none';
  if (!show) {
    const btn = document.getElementById('mv-erster-btn');
    const lbl = document.getElementById('mv-erster-lbl');
    const sub = document.getElementById('mv-erster-sub');
    if (btn) { btn.dataset.mode = 'anteilig'; lbl.textContent = 'Anteilig'; sub.textContent = 'Anteilig — wird berechnet'; }
  }
}

function _toggleMvErsterMonat() {
  const btn = document.getElementById('mv-erster-btn');
  const lbl = document.getElementById('mv-erster-lbl');
  const sub = document.getElementById('mv-erster-sub');
  if (!btn) return;
  const isVoll = btn.dataset.mode === 'anteilig';
  btn.dataset.mode = isVoll ? 'voll' : 'anteilig';
  lbl.textContent  = isVoll ? 'Voller Monat' : 'Anteilig';
  sub.textContent  = isVoll ? 'Voller Monat — pauschal' : 'Anteilig — wird berechnet';
}

function _contractBodyKurzzeit(room) {
  const s         = appSettings;
  const gemStr    = _parseArr(room.gemeinschaftsraeume).join(', ') || '—';
  const kzKalt    = Number(room.kurzzeit_kaltmiete) || 0;
  const kzNk      = Number(room.kurzzeit_nk) || 0;
  const kzIsPauschal = (room.kurzzeit_pricing || 'pauschal') !== 'kalt_nk';
  const kzTotal   = kzKalt + kzNk;
  const kzBase    = kzIsPauschal ? kzTotal : kzKalt;
  const rentDisplay = kzIsPauschal ? fmtEUR(kzTotal) + ' pauschal inkl. NK' : fmtEUR(kzKalt) + ' kalt + ' + fmtEUR(kzNk) + ' NK';
  const schluessel= `Haustür ×${room.haustuerschluessel||1} · Zimmer ×${room.zimmerschluessel||1}`;
  const kautionRule = '≤ 3 Monate → 1×  ·  > 3 Monate → 3×';
  const kautionVal  = room.kaution_override && room.kaution_default
    ? fmtEUR(room.kaution_default)
    : fmtEUR(kzBase);

  return `
    <div class="rm-prefilled">
      <div class="rm-prefilled__title">Pre-filled from room & profile</div>
      <div class="rm-pre-row"><span>Room</span><span>${esc(room.name)}</span></div>
      <div class="rm-pre-row"><span>Size</span><span>ca. ${room.flaeche_m2||'—'} m²</span></div>
      <div class="rm-pre-row"><span>Shared</span><span>${esc(gemStr)}</span></div>
      <div class="rm-pre-row"><span>Rent</span><span>${rentDisplay} / Monat</span></div>
      <div class="rm-pre-row"><span>Vermieter</span><span>${esc(s.vermieter_name||'—')}</span></div>
      <div class="rm-pre-row"><span>Vermieter E-Mail</span><span>${esc(s.vermieter_email||'—')}</span></div>
      <div class="rm-pre-row"><span>IBAN</span><span>${esc(s.iban||'—')}</span></div>
      <div class="rm-pre-row"><span>BIC</span><span>${esc(s.bic||'—')}</span></div>
      <div class="rm-pre-row"><span>Schlüssel</span><span>${esc(schluessel)}</span></div>
    </div>

    <div class="rm-kaution-row">
      <div>
        <div class="rm-kaution-lbl">Kaution (auto)</div>
        <div class="rm-kaution-rule" id="cm-kaution-rule">${kautionRule}</div>
      </div>
      <div class="rm-kaution-val" id="cm-kaution-val">${kautionVal}</div>
    </div>

    <div class="rm-fields-title">Tenant details — enter manually</div>
    <div class="rm-field"><label>Mieter Name</label><input class="rm-input" id="cm-name" placeholder="Full name…"/></div>
    <div class="rm-field"><label>Mieter Adresse</label><input class="rm-input" id="cm-adr" placeholder="Current address…"/></div>
    <div class="rm-field"><label>Geburtsdatum</label><input class="rm-input" id="cm-dob" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/></div>
    <div class="rm-field"><label>E-Mail</label><input class="rm-input" id="cm-email" type="email" placeholder="mieter@beispiel.de"/></div>
    <div class="rm-field"><label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;">(optional)</span></label><input class="rm-input" id="cm-tel" type="tel" placeholder="+49 …"/></div>
    <div class="rm-field-row">
      <div class="rm-field"><label>Mietbeginn <span style="color:#c0392b;font-weight:700;">*</span></label><input class="rm-input" id="cm-start" type="date" onclick="try{this.showPicker()}catch(e){}" /></div>
      <div class="rm-field"><label>Mietende <span style="color:#c0392b;font-weight:700;">*</span></label><input class="rm-input" id="cm-end" type="date" onclick="try{this.showPicker()}catch(e){}" /></div>
    </div>
    <div class="rm-field">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;">(optional)</span></label>
      <input class="rm-input" id="cm-sig" type="date" onclick="try{this.showPicker()}catch(e){}" />
    </div>
    <div class="rm-field rm-field--toggle" id="cm-erster-wrap" style="display:none">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Erster Monat</div>
          <div class="rm-toggle-sub" id="cm-erster-sub">Anteilig — wird berechnet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="cm-erster-btn" data-mode="anteilig" onclick="_toggleErsterMonat()">
          <span class="rm-pill-toggle__track">
            <span class="rm-pill-toggle__knob"></span>
          </span>
          <span class="rm-pill-toggle__lbl" id="cm-erster-lbl">Anteilig</span>
        </button>
      </div>
    </div>
    <div class="rm-field rm-field--toggle" id="cm-letzter-wrap" style="display:none">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Letzter Monat</div>
          <div class="rm-toggle-sub" id="cm-letzter-sub">Anteilig — wird berechnet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="cm-letzter-btn" data-mode="anteilig" onclick="_toggleLetzterMonat()">
          <span class="rm-pill-toggle__track">
            <span class="rm-pill-toggle__knob"></span>
          </span>
          <span class="rm-pill-toggle__lbl" id="cm-letzter-lbl">Anteilig</span>
        </button>
      </div>
    </div>`;
}

function _contractBodyComingSoon(name) {
  return `
    <div class="rm-coming-soon">
      <i class="ti ti-file-off"></i>
      <h3>${esc(name)}</h3>
      <p>Template is being finalised. The structure and fields are ready — PDF generation will be activated once the template is complete.</p>
    </div>`;
}


/* ── PDF GENERATION — KURZZEITMIETVERTRAG ────────────────── */
async function _generateKurzzeitPDF() {
  const room = getRoomById(_contractRoomId);
  if (!room) return;

  const mieterName = document.getElementById('cm-name')?.value.trim();
  const mieterAdr  = document.getElementById('cm-adr')?.value.trim();
  const mieterDob  = document.getElementById('cm-dob')?.value.trim();
  const mieterEmail= document.getElementById('cm-email')?.value.trim();
  const mieterTel  = document.getElementById('cm-tel')?.value.trim();
  const startVal   = document.getElementById('cm-start')?.value;
  const endVal     = document.getElementById('cm-end')?.value;
  const sigVal     = document.getElementById('cm-sig')?.value;
  const ersterMonatVoll = document.getElementById('cm-erster-btn')?.dataset.mode === 'voll';
  const letzterMonatVoll = document.getElementById('cm-letzter-btn')?.dataset.mode === 'voll';

  if (!startVal || !endVal) {
    alert('Bitte Mietbeginn und Mietende ausfüllen.');
    return;
  }

  // Show loading state on button
  const pdfBtn = document.getElementById('contractPdfBtn');
  const origHTML = pdfBtn?.innerHTML;
  if (pdfBtn) { pdfBtn.innerHTML = '<i class="ti ti-loader"></i> Generating…'; pdfBtn.disabled = true; }

  const s    = appSettings;
  const data = _buildMietvertragData(room, s, { mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel, startVal, endVal, sigVal, ersterMonatVoll, letzterMonatVoll });
  const html = _renderKurzzeitHTML(data);

  // Render template in hidden div
  let container = document.getElementById('_pdfRenderContainer');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = '_pdfRenderContainer';
  container.style.cssText = [
    'position:fixed',
    'top:0',
    'left:-9999px',
    'width:794px',        // A4 at 96dpi
    'background:#faf9f7',
    'z-index:-1',
    'font-size:11.33px',  // 8.5pt at 96dpi
  ].join(';');
  container.innerHTML = html;
  document.body.appendChild(container);

  // Wait for fonts to load
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 400));

  try {
    const { jsPDF } = window.jspdf;

    // A4 dimensions in mm
    const A4_W = 210;
    const A4_H = 297;
    const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Find page break elements
    const pages = container.querySelectorAll('.pdf-page');

    if (pages.length > 0) {
      // Render each page separately
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pages[i], {
          scale: 3,
          useCORS: true,
          backgroundColor: '#faf9f7',
          width: 794,
          windowWidth: 794,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, A4_W, A4_H);
      }
    } else {
      // Fallback: render full container and split into A4 pages
      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#faf9f7',
        width: 794,
        windowWidth: 794,
      });
      const imgData    = canvas.toDataURL('image/jpeg', 0.95);
      const imgW       = A4_W;
      const imgH       = (canvas.height * A4_W) / canvas.width;
      let   heightLeft = imgH;
      let   position   = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= A4_H;
      while (heightLeft > 0) {
        position -= A4_H;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
        heightLeft -= A4_H;
      }
    }

    // Save directly — no dialog
    const filename = `Kurzzeitmietvertrag_${room.name}_${mieterName.replace(/\s+/g,'_')}.pdf`;
    pdf.save(filename);

  } catch(err) {
    console.error('[PDF] Generation failed:', err);
    alert('PDF generation failed. Please try again.');
  } finally {
    container.remove();
    if (pdfBtn) { pdfBtn.innerHTML = origHTML; pdfBtn.disabled = false; }
  }
}


/* ── BUILD MIETVERTRAG DATA ──────────────────────────────── */
function _buildMietvertragData(room, s, { mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel = '', startVal, endVal, sigVal, ersterMonatVoll = false, letzterMonatVoll = false }) {
  const fmt = d => {
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' +
           dt.getFullYear();
  };

  const start     = new Date(startVal);
  const end       = new Date(endVal);
  const kzKalt    = Number(room.kurzzeit_kaltmiete) || 0;
  const kzNk      = Number(room.kurzzeit_nk) || 0;
  const kzPricing = room.kurzzeit_pricing || 'pauschal';
  const rent      = kzKalt + kzNk;  // full total used for all pro-rata math
  const gemStr    = _parseArr(room.gemeinschaftsraeume).join(', ');

  // Partial first month
  const firstDayOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const ersterAnteilig  = start.getDate() !== 1;
  let ersterTage = 0, ersterBetrag = 0, ersterTagespreis = 0;
  if (ersterAnteilig) {
    const daysInFirstMonth = new Date(start.getFullYear(), start.getMonth()+1, 0).getDate();
    ersterTage       = daysInFirstMonth - start.getDate() + 1;
    ersterTagespreis = rent / daysInFirstMonth;
    if (ersterMonatVoll) {
      ersterBetrag = rent;
    } else {
      ersterBetrag = Math.round(ersterTagespreis * ersterTage * 100) / 100;
    }
  }

  // Partial last month
  const lastDayOfMonth  = new Date(end.getFullYear(), end.getMonth()+1, 0);
  const letzterAnteilig = end.getDate() !== lastDayOfMonth.getDate();
  const sameCalendarMonth = end.getFullYear() === start.getFullYear() && end.getMonth() === start.getMonth();
  const letzteZahlungNoetig = !sameCalendarMonth;
  let letzterTage = 0, letzterBetrag = 0, letzterTagespreis = 0;
  if (letzterAnteilig) {
    const daysInLastMonth = lastDayOfMonth.getDate();
    letzterTage       = end.getDate();
    letzterTagespreis = rent / daysInLastMonth;
    if (letzterMonatVoll) {
      letzterBetrag = rent;
    } else {
      letzterBetrag = Math.round(letzterTagespreis * letzterTage * 100) / 100;
    }
  }

  // Count full months between
  let fullMonths = 0;
  const ms = new Date(ersterAnteilig ? new Date(start.getFullYear(), start.getMonth()+1, 1) : start);
  const me = new Date(letzterAnteilig ? new Date(end.getFullYear(), end.getMonth(), 1) : new Date(end.getFullYear(), end.getMonth()+1, 1));
  fullMonths = (me.getFullYear() - ms.getFullYear()) * 12 + (me.getMonth() - ms.getMonth());
  if (fullMonths < 0) fullMonths = 0;

  const gesamtmiete = Math.round(
    (ersterBetrag + fullMonths * rent + letzterBetrag) * 100
  ) / 100;

  // Kaution — base: Pauschal = full total, Kalt+NK = kaltmiete only
  const totalMonths = Math.round((end - start) / (30.44 * 24 * 3600 * 1000));
  const kzIsPauschalForKaution = (room.kurzzeit_pricing || 'pauschal') !== 'kalt_nk';
  const kautionBase = kzIsPauschalForKaution ? kzKalt + kzNk : kzKalt;
  let kaution;
  if (room.kaution_override && room.kaution_default) {
    kaution = Number(room.kaution_default);
  } else {
    kaution = totalMonths <= 3 ? kautionBase : kautionBase * 3;
  }

  // Zahlungsplan
  const firstPayDate = new Date(start.getFullYear(), start.getMonth(), 1);
  // 1. Zahlung = partial first month (if any) + first full month
  let z1Betrag, z1Desc;
  if (ersterAnteilig && fullMonths > 0) {
    const firstFullMonthName = new Date(start.getFullYear(), start.getMonth()+1, 1)
      .toLocaleString('de-DE',{month:'long'});
    const firstPartMonthName = start.toLocaleString('de-DE',{month:'long'});
    z1Betrag = Math.round((ersterBetrag + rent) * 100) / 100;
    z1Desc   = ersterMonatVoll
      ? `${firstPartMonthName} (voll) + ${firstFullMonthName}`
      : `Anteil ${firstPartMonthName} + ${firstFullMonthName}`;
  } else if (ersterAnteilig) {
    z1Betrag = ersterBetrag;
    z1Desc   = ersterMonatVoll
      ? `${start.toLocaleString('de-DE',{month:'long'})} (voll)`
      : `Anteil ${start.toLocaleString('de-DE',{month:'long'})}`;
  } else {
    z1Betrag = rent;
    z1Desc   = start.toLocaleString('de-DE',{month:'long'});
  }
  const z1Faellig = fmt(start);

  // Weitere Zahlungen (> 2 full months remaining after z1)
  const remainingAfterZ1 = ersterAnteilig ? fullMonths - 1 : fullMonths - 1;
  const weitereZahlungen = remainingAfterZ1 > 1;
  const weitereZahlungenBetrag = weitereZahlungen ? rent : null;

  // Last payment
  let zlBetrag, zlDesc;
  if (letzterAnteilig) {
    zlBetrag = letzterBetrag;
    zlDesc   = letzterMonatVoll
      ? `${end.toLocaleString('de-DE',{month:'long'})} (voll)`
      : `Anteil ${end.toLocaleString('de-DE',{month:'long'})}`;
  } else {
    zlBetrag = rent;
    zlDesc   = end.toLocaleString('de-DE',{month:'long'});
  }
  // Due date = 3rd of that month
  const zlFaellig = fmt(new Date(end.getFullYear(), end.getMonth(), 3));

  return {
    // Vermieter
    vermieterName:    s.vermieter_name || '',
    vermieterAdresse: s.vermieter_adresse || '',
    vermieterEmail:   s.vermieter_email || '',
    vermieterSig:     s.vermieter_name || '',
    // Objekt
    objektAdresse:    s.objekt_adresse || '',
    objektPLZOrt:     s.objekt_plz_ort || '',
    // Bank
    kontoinhaber:     s.kontoinhaber || '',
    iban:             s.iban || '',
    bic:              s.bic || '',
    // Gerichtsstand
    gerichtsstand:    s.gerichtsstand || 'Wiesbaden',
    unterschriftOrt:  s.unterschrift_ort || 'Wiesbaden',
    footerAdresse:    s.objekt_adresse ? (s.objekt_plz_ort && s.objekt_adresse.includes(s.objekt_plz_ort) ? s.objekt_adresse : s.objekt_adresse + ' \u00b7 ' + (s.objekt_plz_ort || '')) : '',
    // Mieter
    mieterName,
    mieterAdresse:      mieterAdr,
    mieterGeburtsdatum: mieterDob,
    mieterEmail:        mieterEmail || '',
    mieterTelefon:      mieterTel   || '',
    // Zimmer
    zimmerName:       room.name,
    zimmerFlaeche:    room.flaeche_m2 || 0,
    gemeinschaftsraeume: gemStr,
    // Mietzeit
    mietbeginn:       fmt(start),
    mietende:         fmt(end),
    // Partial months
    ersterMonatAnteilig:  ersterAnteilig,
    ersterMonatVoll:      ersterAnteilig && ersterMonatVoll,
    ersterMonatTage:      ersterAnteilig ? ersterTage : null,
    ersterMonatTagespreis:ersterAnteilig ? ersterTagespreis : null,
    ersterMonatBetrag:    ersterAnteilig ? ersterBetrag : null,
    letzterMonatAnteilig: letzterAnteilig,
    letzterMonatVoll:     letzterAnteilig && letzterMonatVoll,
    letzteZahlungNoetig,
    letzterMonatTage:     letzterAnteilig ? letzterTage : null,
    letzterMonatTagespreis:letzterAnteilig ? letzterTagespreis : null,
    letzterMonatBetrag:   letzterAnteilig ? letzterBetrag : null,
    // Miete
    monatlMiete:  rent,
    kzKaltmiete:  kzKalt,
    kzNk:         kzNk,
    kzPricing:    kzPricing,
    gesamtmiete,
    // Zahlungsplan
    weitereZahlungen,
    zahlung1Betrag:   z1Betrag,
    zahlung1Beschreibung: z1Desc,
    zahlung1Faellig:  z1Faellig,
    weitereZahlungenBetrag,
    letzteZahlungBetrag:  zlBetrag,
    letzteZahlungBeschreibung: zlDesc,
    letzteZahlungFaellig: zlFaellig,
    // Kaution
    kaution,
    // Schlüssel
    hausstuerschluessel: room.haustuerschluessel || 1,
    zimmerschluessel:    room.zimmerschluessel || 1,
    // Inventar
    inventar: Array.isArray(room.inventar) ? room.inventar : [],
    // Signing
    unterzeichnungsDatum: sigVal ? fmt(new Date(sigVal)) : '',
    // Energieausweis — house-level, from appSettings
    energieklasse:     s.energieklasse     || '',
    endenergiebedarf:  s.endenergiebedarf  || '',
    energieausweisart: s.energieausweisart || '',
  };
}


/* ── RENDER KURZZEIT HTML FOR PRINT ──────────────────────── */
function _renderKurzzeitHTML(d) {

  const fmtN = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur  = n => fmtN(n) + ' €';

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }

    .page {
      position: relative;
      width: 793.71px;
      height: 1122.52px;
      background: #ffffff;
      overflow: hidden;
    }

    /* HEADER — vertically centered content, balanced padding */
    .hdr {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 83.15px;
      background: #f0e8da;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 80px;
    }
    .hdr__wordmark {
      font-family: 'Playfair Display', serif;
      font-size: 26px;
      font-weight: 400;
      color: #7a5c30;
      letter-spacing: 0.05em;
      line-height: 1;
    }
    .hdr__room {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }
    .hdr__room-label {
      font-family: 'Lato', sans-serif;
      font-size: 7px;
      font-weight: 400;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #b8975a;
      line-height: 1;
    }
    .hdr__room-name {
      font-family: 'Playfair Display', serif;
      font-size: 12px;
      font-weight: 400;
      color: #7a5c30;
      line-height: 1;
    }

    /* FOOTER */
    .ftr {
      position: absolute;
      left: 80px;
      right: 80px;
      bottom: 32px;
    }
    .ftr__rule {
      border: none;
      border-top: 0.5px solid #e8dbc5;
      margin-bottom: 7px;
    }
    .ftr__row {
      display: flex;
      justify-content: space-between;
      font-family: 'Lato', sans-serif;
      font-size: 8px;
      font-weight: 300;
      color: #aaa59e;
      line-height: 1;
    }

    /* CONTENT — wider margins, well clear of edges */
    .content {
      position: absolute;
      top: 143.63px;
      left: 80px;
      right: 80px;
      bottom: 90px;
      overflow: hidden;
    }

    /* DOC TITLE */
    .doc-title {
      font-family: 'Playfair Display', serif;
      font-size: 21px;
      font-weight: 400;
      color: #1a1a1a;
      line-height: 1.15;
      margin-bottom: 4px;
    }
    .doc-subtitle {
      font-family: 'Lato', sans-serif;
      font-size: 9.5px;
      font-weight: 300;
      color: #aaa59e;
      margin-bottom: 28px;
    }

    /* SECTION HEADERS */
    .sec {
      font-family: 'Lato', sans-serif;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      color: #4a4540;
      margin-top: 14px;
      margin-bottom: 0;
      padding-top: 2px;
      padding-bottom: 5px;
      border-bottom: 0.6px solid #d8d3cc;
    }
    .sec--first { margin-top: 0; }
    .sec--lg { font-size: 8.5px; margin-top: 22px; }
    .sec--lg.sec--first { margin-top: 0; }

    /* KV ROWS — more breathing room from divider */
    .kv { display: flex; padding: 3.5px 0; align-items: baseline; }
    .kv__k {
      font-family: 'Lato', sans-serif;
      font-size: 11px;
      font-weight: 300;
      color: #6a6560;
      min-width: 140px;
      flex-shrink: 0;
      line-height: 1.55;
      padding-right: 10px;
    }
    .kv__v {
      font-family: 'Lato', sans-serif;
      font-size: 11px;
      font-weight: 400;
      color: #1a1a1a;
      flex: 1;
      line-height: 1.55;
    }
    .kv-gap { height: 10px; }

    /* TOTAL BOX — vertically centered text, balanced padding */
    .total-box {
      background: #f0e8d8;
      border-radius: 3px;
      padding: 9px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      margin-bottom: 28px;
    }
    .total-box__label, .total-box__value {
      font-family: 'Lato', sans-serif;
      font-size: 10.5px;
      font-weight: 700;
      color: #8a6535;
      line-height: 1;
    }

    /* NOTE */
    .note {
      font-family: 'Lato', sans-serif;
      font-size: 10.5px;
      font-weight: 300;
      color: #6a6560;
      margin-top: 10px;
      line-height: 1.55;
    }

    /* CLAUSES */
    .clause { margin-top: 9px; }
    .clause--first { margin-top: 16px; }
    .clause__title {
      font-family: 'Lato', sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #4a4540;
      margin-bottom: 3px;
      line-height: 1.4;
    }
    .clause__body {
      font-family: 'Lato', sans-serif;
      font-size: 11px;
      font-weight: 300;
      color: #3a3530;
      line-height: 1.55;
    }

    /* NUTZUNG */
    .nutzung {
      font-family: 'Lato', sans-serif;
      font-size: 11px;
      font-weight: 300;
      color: #3a3530;
      line-height: 1.55;
      margin-top: 7px;
      margin-bottom: 16px;
    }

    /* INVENTAR TABLE */
    .inv-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .inv-table th {
      font-family: 'Lato', sans-serif;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #888780;
      border-bottom: 0.5px solid #d8d3cc;
      padding: 3px 0 4px;
      text-align: left;
    }
    .inv-table td {
      font-family: 'Lato', sans-serif;
      font-size: 11px;
      font-weight: 300;
      color: #1a1a1a;
      padding: 3.5px 0;
      line-height: 1.55;
    }

    /* COMMENT LINES */
    .comment-label {
      font-family: 'Lato', sans-serif;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      color: #4a4540;
      margin-top: 66px;
      padding-top: 2px;
      padding-bottom: 5px;
      border-bottom: 0.6px solid #d8d3cc;
    }
    .comment-line { border-bottom: 0.5px solid #e0dbd4; height: 26px; margin-top: 2px; }

    /* SIGNATURE */
    .sig-block { margin-top: 92px; display: flex; justify-content: space-between; }
    .sig-col { width: 44%; }
    .sig-top-line { border: none; border-top: 0.6px solid #3a3530; margin-bottom: 7px; }
    .sig-prefill { font-family: 'Lato', Georgia, serif; font-size: 10px; font-style: italic; font-weight: 300; color: #8a7a66; margin-bottom: 4px; line-height: 1.4; }
    .sig-date-label {
      font-family: 'Lato', sans-serif;
      font-size: 9px;
      font-weight: 300;
      color: #aaa59e;
      margin-bottom: 4px;
    }
    .sig-write-gap { height: 88px; }
    .sig-line { border: none; border-top: 0.6px solid #3a3530; margin-bottom: 7px; }
    .sig-role {
      font-family: 'Lato', sans-serif;
      font-size: 9px;
      font-weight: 400;
      color: #888780;
    }
    .sig-name {
      font-family: 'Lato', sans-serif;
      font-size: 9px;
      font-weight: 300;
      color: #3a3530;
      margin-top: 4px;
    }
  `;

  const hdr = (room) => `
    <div class="hdr">
      <span class="hdr__wordmark">Casa Castel</span>
      <div class="hdr__room">
        <span class="hdr__room-label">Zimmer</span>
        <span class="hdr__room-name">${room}</span>
      </div>
    </div>`;

  const ftr = (n) => `
    <div class="ftr">
      <hr class="ftr__rule"/>
      <div class="ftr__row">
        <span>${d.footerAdresse}</span>
        <span>${n}</span>
      </div>
    </div>`;

  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const sec = (t, lg, first) => `<div class="sec${lg?' sec--lg':''}${first?' sec--first':''}">${t}</div>`;
  const clause = (num, title, body, first) => `
    <div class="clause${first?' clause--first':''}">
      <div class="clause__title">§ ${num} ${title}</div>
      <div class="clause__body">${body}</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<title>Kurzzeitmietvertrag — ${d.zimmerName}</title>
<style>${CSS}</style>
</head>
<body>

<!-- PAGE 1 -->
<div class="pdf-page page">
  ${hdr(d.zimmerName)}
  ${ftr(1)}
  <div class="content">
    <div class="doc-title">Kurzzeitmietvertrag</div>
    <div class="doc-subtitle">Befristetes Mietverhältnis · Zimmervermietung</div>

    ${sec('Vermieter', false, true)}
    ${kv('Name', d.vermieterName)}
    ${kv('Adresse', d.vermieterAdresse)}
    ${d.vermieterEmail ? kv('E-Mail', d.vermieterEmail) : ''}

    ${sec('Mieter', false, false)}
    ${kv('Name', d.mieterName)}
    ${kv('Adresse', d.mieterAdresse)}
    ${kv('Geburtsdatum', d.mieterGeburtsdatum)}
    ${d.mieterEmail ? kv('E-Mail', d.mieterEmail) : ''}
    ${d.mieterTelefon ? kv('Telefon', d.mieterTelefon) : ''}

    ${sec('Mietobjekt', false, false)}
    ${kv('Adresse', d.objektAdresse)}
    ${kv('Bezeichnung', d.zimmerName)}
    ${kv('Wohnfläche', 'ca. ' + d.zimmerFlaeche + ' m²')}
    ${kv('Mitgenutzte Räume', d.gemeinschaftsraeume)}
    ${kv('Möblierung', 'Möbliert · Inventar siehe Anlage A')}

    ${sec('Mietzeit &amp; Mietzins', false, false)}
    ${kv('Mietbeginn', d.mietbeginn)}
    ${kv('Mietende', d.mietende)}
    ${d.ersterMonatAnteilig ? kv(d.ersterMonatVoll ? 'Erster Monat (voll)' : 'Anteil erster Monat', eur(d.ersterMonatBetrag) + (d.ersterMonatVoll ? '' : ' (' + d.ersterMonatTage + ' Tage, Basis ' + new Date(d.mietbeginn.split('.').reverse().join('-')).toLocaleString('de-DE', {month:'long'}).replace(/\w+/, m => m[0].toUpperCase() + m.slice(1)) + ')')) : ''}
    ${d.kzPricing === 'kalt_nk'
      ? kv('Kaltmiete', eur(d.kzKaltmiete)) + kv('Nebenkosten', eur(d.kzNk))
      : kv('Monatliche Miete', eur(d.monatlMiete) + ' (pauschal inkl. NK)')
    }

    <div class="total-box">
      <span class="total-box__label">Gesamtmiete:</span>
      <span class="total-box__value">${eur(d.gesamtmiete)}</span>
    </div>

    ${sec('Zahlungsplan &amp; Bankverbindung', true, false)}
    ${kv('1. Zahlung', eur(d.zahlung1Betrag) + ' (' + d.zahlung1Beschreibung + '), fällig am ' + d.zahlung1Faellig)}
    ${d.weitereZahlungen ? kv('Weitere Zahlungen', eur(d.weitereZahlungenBetrag) + ' monatlich, jeweils fällig 3. Werktag') : ''}
    ${d.letzteZahlungNoetig ? kv('Letzte Zahlung', eur(d.letzteZahlungBetrag) + ' (' + d.letzteZahlungBeschreibung + '), fällig am ' + d.letzteZahlungFaellig) : ''}
    ${kv('Kaution', eur(d.kaution) + ' (fällig 5 Tage nach Unterzeichnung)')}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber', d.kontoinhaber)}
    ${kv('IBAN', d.iban)}
    ${kv('BIC', d.bic)}

    <p class="note">Alle Zahlungen per Überweisung. Verwendungszweck: Casa Castel – ${d.zimmerName} – Miete Monat Jahr / Kaution.</p>
  </div>
</div>

<!-- PAGE 2 -->
<div class="pdf-page page">
  ${hdr(d.zimmerName)}
  ${ftr(2)}
  <div class="content">
    ${sec('Nutzungsrechte Gemeinschaftsbereiche', true, true)}
    <p class="nutzung">Ab Mietbeginn steht dem Mieter die Mitnutzung folgender Gemeinschaftsbereiche zu: ${d.gemeinschaftsraeume}. Die Nutzung erfolgt schonend und rücksichtsvoll. Eine Reinigungspflicht nach jeder Nutzung wird ausdrücklich vereinbart.</p>

    ${clause('1', 'Befristung und Beendigung', 'Das Mietverhältnis ist gemäß § 575 Abs. 1 Nr. 3 BGB auf ausdrücklichen Wunsch des Mieters befristet. Der Mieter hat erklärt, das Mietobjekt nur für den vereinbarten Zeitraum zu benötigen. Das Mietverhältnis endet automatisch ohne Kündigung. Eine stillschweigende Verlängerung nach § 545 BGB wird ausdrücklich ausgeschlossen. Ein Anspruch auf Verlängerung besteht nicht.', true)}
    ${(() => {
      const hatPartiell = d.ersterMonatAnteilig || d.letzterMonatAnteilig;
      const vollParts = [
        d.ersterMonatAnteilig && d.ersterMonatVoll ? 'erster Monat' : null,
        d.letzterMonatAnteilig && d.letzterMonatVoll ? 'letzter Monat' : null,
      ].filter(Boolean).join(' und ');
      const alleVoll = hatPartiell && vollParts.length > 0 &&
        (!d.ersterMonatAnteilig || d.ersterMonatVoll) &&
        (!d.letzterMonatAnteilig || d.letzterMonatVoll);

      let proRataText;
      if (!hatPartiell) {
        proRataText = '';
      } else if (alleVoll) {
        proRataText = ' Der ' + vollParts + ' wird als voller Monat berechnet.';
      } else {
        proRataText = ' Zieht der Mieter nicht zum ersten eines Monats ein oder zum letzten eines Monats aus, werden die Tage anteilig berechnet. Der Tagespreis ergibt sich aus der Monatsmiete geteilt durch die tatsächliche Anzahl der Kalendertage des jeweiligen Monats.';
      }

      if (d.kzPricing === 'kalt_nk') {
        const base = 'Die monatliche Kaltmiete beträgt ' + eur(d.kzKaltmiete) + ', zuzüglich einer NK-Vorauszahlung von ' + eur(d.kzNk) + '.';
        const proRataKalt = !hatPartiell ? '' : alleVoll
          ? ' Der ' + vollParts + ' wird als voller Monat berechnet.'
          : ' Zieht der Mieter nicht zum ersten eines Monats ein oder zum letzten eines Monats aus, werden die Tage anteilig berechnet. Der Tagespreis ergibt sich aus der Gesamtmiete (' + eur(d.monatlMiete) + ') geteilt durch die tatsächliche Anzahl der Kalendertage des jeweiligen Monats.';
        return clause('2', 'Mietzins &amp; Anteilige Berechnung', base + proRataKalt, false);
      } else {
        const base = 'Die monatliche Pauschalmiete beträgt ' + eur(d.monatlMiete) + '.';
        const nkText = ' Alle Nebenkosten (Strom, Wasser, Heizung, WLAN) sind in der Pauschale enthalten.';
        return clause('2', 'Mietzins &amp; Anteilige Berechnung', base + proRataText + nkText, false);
      }
    })()}
    ${clause('3', 'Fälligkeit der Mietzahlungen', 'Die Miete ist jeweils spätestens bis zum dritten Werktag des fälligen Monats zu überweisen (§ 556b BGB). Bei Zahlungsverzug ist der Vermieter berechtigt, Verzugszinsen gemäß § 288 BGB geltend zu machen.', false)}
    ${clause('4', 'Kaution', 'Der Mieter zahlt eine Kaution von ' + eur(d.kaution) + ' spätestens 5 Tage nach Unterzeichnung. Vom Mieter selbstverschuldete Schäden werden zu 100 % von der Kaution abgezogen. Kleinreparaturen bis 100 € pro Schadensfall gehen zu Lasten des Mieters (§ 535 BGB). Schäden in Gemeinschaftsbereichen werden anteilig auf alle Bewohner aufgeteilt. Der verbleibende Betrag wird nach Prüfung des Zustands zurückerstattet.', false)}
    ${clause('5', 'Schlüsselübergabe', 'Der Mieter erhält bei Einzug ' + d.hausstuerschluessel + ' Haustürschlüssel und ' + d.zimmerschluessel + ' Zimmerschlüssel. Alle Schlüssel sind bei Auszug an den Vermieter zurückzugeben. Bei Verlust trägt der Mieter die vollständigen Kosten für den Schlossaustausch.', false)}
    ${clause('6', 'Zustand &amp; Übergabe', 'Das Zimmer wird möbliert und in vertragsgemäßem Zustand übergeben. Ein Übergabeprotokoll wird bei Ein- und Auszug erstellt und von beiden Parteien unterzeichnet. Das Zimmer ist in gleichem Zustand zurückzugeben.', false)}
    ${clause('7', 'Haftpflichtversicherung', 'Der Mieter ist verpflichtet, für die Dauer des Mietverhältnisses eine gültige private Haftpflichtversicherung zu unterhalten und dem Vermieter auf Verlangen nachzuweisen.', false)}
    ${clause('8', 'Hausordnung', 'Rauchen ist im gesamten Gebäude nicht gestattet. Haustiere sind nicht erlaubt. Untervermietung ist ohne schriftliche Zustimmung des Vermieters untersagt. Nachtruhe gilt von 22:00 bis 07:00 Uhr.', false)}
    ${clause('9', 'Datenschutz', 'Personenbezogene Daten werden ausschließlich zur Vertragsabwicklung gespeichert (Art. 6 Abs. 1 lit. b DSGVO) und nach Ablauf der gesetzlichen Aufbewahrungsfrist gelöscht.', false)}
    ${clause('10', 'Salvatorische Klausel &amp; Gerichtsstand', 'Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Es gilt deutsches Recht. Gerichtsstand ist ' + d.gerichtsstand + '.', false)}
  </div>
</div>

<!-- PAGE 3 -->
<div class="pdf-page page">
  ${hdr(d.zimmerName)}
  ${ftr(3)}
  <div class="content">
    ${(d.energieklasse || d.endenergiebedarf || d.energieausweisart) ? `
    <div class="sec sec--lg sec--first">Energieausweis (\u00a7\u00a016a GEG)</div>
    <p class="nutzung" style="margin-top:6px;font-size:10.5px;line-height:1.55;color:#3a3530;">Der Vermieter hat dem Mieter vor Vertragsschluss den Energieausweis vorgelegt. Effizienzklasse: ${d.energieklasse||'\u2014'}. Endenergiebedarf: ${d.endenergiebedarf ? d.endenergiebedarf+' kWh/(m\u00b2\u00b7a)' : '\u2014'}. Art: ${d.energieausweisart||'\u2014'}.</p>` : ''}

    <div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div>
    <div class="comment-line"></div>
    <div class="comment-line"></div>
    <div class="comment-line"></div>
    <div class="comment-line"></div>

    <div class="sig-block">
      <div class="sig-col">
        ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
        <div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Vermieter</div>
        <div class="sig-name">${d.vermieterName}</div>
      </div>
      <div class="sig-col">
        ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
        <div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Mieter</div>
        <div class="sig-name">${d.mieterName}</div>
      </div>
    </div>
  </div>
</div>

<!-- PAGE 4 -->
<div class="pdf-page page">
  ${hdr(d.zimmerName)}
  ${ftr(4)}
  <div class="content">
    ${sec('Anlage A — Inventar', true, true)}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anzahl</th></tr></thead>
      <tbody>
        ${d.inventar.map(i => `<tr><td>${i.gegenstand}</td><td>${i.anzahl}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

</body>
</html>`;
}

/* ── PDF GENERATION — ÜBERGABEPROTOKOLL ─────────────────── */
async function _generateUebergPreviewContainer(isEinzug) {
  // Collects current form values and renders Übergabe HTML into _pdfRenderContainer
  // so _openPdfPreview can display it. _generateUebergPDF remains unchanged.
  const room = getRoomById(_contractRoomId); if (!room) return;
  const s = appSettings;
  const mieterName  = document.getElementById('ub-mieter-name')?.value.trim() || '';
  const mieterAdr   = document.getElementById('ub-mieter-adr')?.value.trim() || '';
  const datum       = document.getElementById('ub-datum')?.value || '';
  const sigVal      = document.getElementById('ub-sig')?.value || '';
  const neueAdr     = document.getElementById('ub-neue-adr')?.value.trim() || '';
  const maengel     = document.getElementById('ub-maengel')?.value.trim() || '';
  const bemerkungen = document.getElementById('ub-bemerkungen')?.value.trim() || '';
  const stromStand  = document.getElementById('ub-strom')?.value.trim() || '';
  const gasStand    = document.getElementById('ub-gas')?.value.trim() || '';
  const wasserStand = document.getElementById('ub-wasser')?.value.trim() || '';
  const haustur     = document.getElementById('ub-haustur')?.value || '1';
  const zimmertur   = document.getElementById('ub-zimmertur')?.value || '1';
  const zaehler = _parseArr(s.zaehler);
  const strom   = zaehler.find(z => z.type === 'Strom');
  const gas     = zaehler.find(z => z.type === 'Gas');
  const wasser  = zaehler.find(z => z.type === 'Wasser');
  const fmtDate = v => { if (!v) return ''; if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v; const dd = new Date(v); return String(dd.getDate()).padStart(2,'0') + '.' + String(dd.getMonth()+1).padStart(2,'0') + '.' + dd.getFullYear(); };
  const inventar = Array.isArray(room.inventar) ? room.inventar : [];
  const d = {
    isEinzug, datum: fmtDate(datum),
    objekt: s.objekt_adresse || '', zimmer: room.name, zimmerName: room.name,
    flaeche: room.zimmerFlaeche || room.flaeche_m2 || '',
    zimmerFlaeche: room.flaeche_m2 || '',
    gemeinschaftsraeume: _parseArr(room.gemeinschaftsraeume).join(', ') || '',
    mieterName, mieterAdresse: mieterAdr, mieterGeburtsdatum: '', mieterEmail: '',
    vermieterName: s.vermieter_name || s.landlord_name || '',
    vermieterAdresse: s.vermieter_adresse || s.landlord_address || '',
    vermieterEmail: s.vermieter_email || '',
    objektAdresse: s.objekt_adresse || '',
    unterschriftOrt: s.unterschrift_ort || 'Wiesbaden',
    unterzeichnungsDatum: fmtDate(sigVal),
    neueAdresseMieter: neueAdr, maengel, bemerkungen,
    strom:   { nummer: strom?.nummer || '', stand: stromStand },
    gas:     { nummer: gas?.nummer || '', stand: gasStand },
    wasser:  { nummer: wasser?.nummer || '', stand: wasserStand },
    haustur: parseInt(haustur), zimmertur: parseInt(zimmertur),
    footerAdresse: s.footer_adresse || s.objekt_adresse || '',
    inventar,
  };
  const html = _renderUebergHTML(d);
  let container = document.getElementById('_pdfRenderContainer');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = '_pdfRenderContainer';
  container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
  container.innerHTML = html;
  document.body.appendChild(container);
  await document.fonts.ready;
}

async function _generateUebergPDF(isEinzug) {
  const room = getRoomById(_contractRoomId);
  if (!room) return;

  const mieterName  = document.getElementById('ub-mieter-name')?.value.trim();
  const mieterAdr   = document.getElementById('ub-mieter-adr')?.value.trim();
  const datum       = document.getElementById('ub-datum')?.value;
  const sigVal      = document.getElementById('ub-sig')?.value;
  const neueAdr     = document.getElementById('ub-neue-adr')?.value.trim() || '';
  const maengel     = document.getElementById('ub-maengel')?.value.trim() || '';
  const bemerkungen = document.getElementById('ub-bemerkungen')?.value.trim() || '';
  const stromStand  = document.getElementById('ub-strom')?.value.trim() || '';
  const gasStand    = document.getElementById('ub-gas')?.value.trim() || '';
  const wasserStand = document.getElementById('ub-wasser')?.value.trim() || '';
  const haustur     = document.getElementById('ub-haustur')?.value || '1';
  const zimmertur   = document.getElementById('ub-zimmertur')?.value || '1';


  const s = appSettings;
  const zaehler = _parseArr(s.zaehler);
  const strom   = zaehler.find(z => z.type === 'Strom');
  const gas     = zaehler.find(z => z.type === 'Gas');
  const wasser  = zaehler.find(z => z.type === 'Wasser');

  const fmtDate = v => {
    if (!v) return '';
    // Already formatted as TT.MM.JJJJ from text input
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v;
    // Fallback: parse ISO date from old data
    const d = new Date(v);
    return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
  };

  const d = {
    isEinzug,
    datum:        fmtDate(datum),
    objekt:       s.objekt_adresse || '',
    zimmer:       room.name,
    flaeche:      room.flaeche_m2 || '',
    floor:        room.floor || '',
    vermieter:    s.vermieter_name || '',
    mieterName,
    mieterAdr,
    neueAdr,
    maengel,
    bemerkungen,
    strom:        { nummer: strom?.nummer || '', stand: stromStand },
    gas:          { nummer: gas?.nummer || '', stand: gasStand },
    wasser:       { nummer: wasser?.nummer || '', stand: wasserStand },
    haustur:      parseInt(haustur),
    zimmertur:    parseInt(zimmertur),
    footerAdresse: s.footer_adresse || s.objekt_adresse || '',
    unterschriftOrt:    s.unterschrift_ort || 'Wiesbaden',
    unterzeichnungsDatum: sigVal ? fmtDate(sigVal.includes('.') ? sigVal : new Date(sigVal).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'})) : '',
  };

  const pdfBtn = document.getElementById('contractPdfBtn');
  const origHTML = pdfBtn?.innerHTML;
  if (pdfBtn) { pdfBtn.innerHTML = '<i class="ti ti-loader"></i> Generating…'; pdfBtn.disabled = true; }

  const html = _renderUebergHTML(d);

  let container = document.getElementById('_pdfRenderContainer');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = '_pdfRenderContainer';
  container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
  container.innerHTML = html;
  document.body.appendChild(container);

  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 400));

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const pages = container.querySelectorAll('.pdf-page');

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const canvas = await html2canvas(pages[i], {
        scale: 3, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794,
      });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
    }

    const filename = `Übergabeprotokoll_${room.name}_${mieterName.replace(/\s+/g,'_')}.pdf`;
    pdf.save(filename);
  } catch(err) {
    console.error('[PDF] Übergabe failed:', err);
    alert('PDF generation failed. Please try again.');
  } finally {
    container.remove();
    if (pdfBtn) { pdfBtn.innerHTML = origHTML; pdfBtn.disabled = false; }
  }
}


/* ── RENDER ÜBERGABEPROTOKOLL HTML ───────────────────────── */
function _renderUebergHTML(d) {
  // Read exact CSS from approved mockup
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .pdf-page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }

    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da;
      display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400;
      color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400;
      letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400;
      color:#7a5c30; line-height:1; }

    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif;
      font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }

    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }

    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400;
      color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300;
      color:#aaa59e; margin-bottom:22px; }

    .type-toggle {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-bottom: 36px;
      padding: 9px 12px;
      background: #f7f4f0;
      border-radius: 3px;
      border: 0.5px solid #e8e2d8;
      height: 36px;
    }
    .type-option {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: 'Lato', sans-serif;
      font-size: 11px;
      font-weight: 400;
      color: #1a1a1a;
      line-height: 13px;
      height: 13px;
    }
    .type-box {
      display: inline-block;
      width: 13px;
      height: 13px;
      border: 1px solid #888780;
      border-radius: 2px;
      flex-shrink: 0;
      vertical-align: middle;
      position: relative;
    }
    .type-box--checked { background: #1a1a1a; border-color: #1a1a1a; }
    .type-box--checked::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 7px;
      height: 4px;
      border-left: 1.5px solid white;
      border-bottom: 1.5px solid white;
      transform: rotate(-45deg);
      display: block;
    }
    .type-date {
      margin-left: auto;
      font-family: 'Lato', sans-serif;
      font-size: 10px;
      font-weight: 300;
      color: #6a6560;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      line-height: 13px;
      height: 13px;
    }
    .type-date-val { font-weight: 400; color: #1a1a1a; }

    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.13em; text-transform:uppercase; color:#4a4540;
      margin-top:40px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:12px; }

    .kv { display:flex; padding:3.5px 0; align-items:baseline; }
    .kv__k { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#6a6560;
      min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
    .kv__v { font-family:'Lato',sans-serif; font-size:11px; font-weight:400; color:#1a1a1a; flex:1; line-height:1.55; }

    .write-line { border-bottom:0.5px solid #b8b3ac; height:24px; margin-top:3px; }
    .write-text { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#1a1a1a; padding-top:2px; line-height:1.5; }

    .zaehler-table { width:100%; border-collapse:collapse; margin-top:16px; }
    .zaehler-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.12em; text-transform:uppercase; color:#888780;
      border-bottom:0.5px solid #d8d3cc; padding:3px 0 5px; text-align:left; }
    .zaehler-table td { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#1a1a1a; padding:5px 0; }
    .stand-val { font-weight:400; }
    .stand-empty { border-bottom:0.5px solid #b8b3ac; display:inline-block; width:80%; height:18px; }

    .schluessel-row { display:flex; gap:36px; margin-top:22px; }
    .schluessel-item { display:flex; align-items:flex-end; gap:8px; }
    .schluessel-item__label { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#6a6560; white-space:nowrap; padding-bottom:2px; }
    .schluessel-item__val { font-family:'Lato',sans-serif; font-size:11px; font-weight:400;
      color:#1a1a1a; padding-bottom:2px; }
    .sonstiges-row { display:flex; align-items:flex-end; gap:8px; margin-top:16px; }
    .sonstiges-label { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#6a6560; white-space:nowrap; flex-shrink:0; padding-bottom:2px; }
    .sonstiges-val { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#1a1a1a; flex:1; padding-bottom:2px; border-bottom:0.5px solid #b8b3ac; min-height:18px; }

    .sig-block { margin-top:120px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-top-line { border:none; border-top:0.5px solid #b8b3ac; margin-bottom:7px; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#aaa59e; margin-bottom:4px; }
    .sig-write-gap { height:74px; }
    .sig-line { border:none; border-top:0.5px solid #b8b3ac; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }

    /* Multiline text in write area */
    .write-area { font-family:'Lato',sans-serif; font-size:11px; font-weight:300;
      color:#1a1a1a; line-height:1.55; padding-top:3px; white-space:pre-wrap; word-break:break-word; }
  `;

  const hdr = (n) => `
    <div class="hdr">
      <span class="hdr__wordmark">Casa Castel</span>
      <div class="hdr__room">
        <span class="hdr__room-label">Zimmer</span>
        <span class="hdr__room-name">${d.zimmer}</span>
      </div>
    </div>`;

  const ftr = (n) => `
    <div class="ftr">
      <hr class="ftr__rule"/>
      <div class="ftr__row">
        <span>${d.footerAdresse}</span>
        <span>${n}</span>
      </div>
    </div>`;

  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v || ''}</span></div>`;

  // Write lines with text or blank lines
  const writeField = (text, lines) => {
    if (text) {
      return `<div class="write-area">${esc(text)}</div>`;
    }
    return Array(lines).fill('<div class="write-line"></div>').join('');
  };

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"/><style>${CSS}</style></head>
<body>

<!-- PAGE 1 -->
<div class="pdf-page">
  ${hdr(1)}
  ${ftr(1)}
  <div class="content">
    <div class="doc-title">Übergabeprotokoll</div>
    <div class="doc-subtitle">Zimmervermietung · ${d.objekt}</div>

    <div class="type-toggle">
      <div class="type-option">
        <div class="type-box ${d.isEinzug ? 'type-box--checked' : ''}"></div>
        Einzug
      </div>
      <div class="type-option">
        <div class="type-box ${!d.isEinzug ? 'type-box--checked' : ''}"></div>
        Auszug
      </div>
      <div class="type-date">
        Übergabedatum&nbsp;<span class="type-date-val">${d.datum}</span>
      </div>
    </div>

    <div class="sec sec--first">Objekt &amp; Parteien</div>
    ${kv('Objekt / Adresse', d.objekt)}
    ${kv('Zimmer', d.zimmer + (d.flaeche ? ' · ca. ' + d.flaeche + ' m²' : '') + (d.floor ? ' · ' + d.floor : ''))}
    ${kv('Vermieter', d.vermieter)}
    ${kv('Mieter', d.mieterName)}
    ${kv('Adresse Mieter', d.mieterAdr)}
    ${!d.isEinzug && d.neueAdr ? kv('Neue Adresse', d.neueAdr) : ''}

    <div class="sec">Mängelbeschreibung / Zustand</div>
    <div style="margin-top:4px;">${writeField(d.maengel, 6)}</div>

    <div class="sec">Zählerstände</div>
    <table class="zaehler-table">
      <thead><tr><th style="width:16%">Art</th><th style="width:42%">Nummer</th><th>Stand</th></tr></thead>
      <tbody>
        <tr>
          <td>Strom</td><td>${d.strom.nummer}</td>
          <td>${d.strom.stand ? `<span class="stand-val">${esc(d.strom.stand)}</span>` : '<span class="stand-empty"></span>'}</td>
        </tr>
        <tr>
          <td>Gas</td><td>${d.gas.nummer}</td>
          <td>${d.gas.stand ? `<span class="stand-val">${esc(d.gas.stand)}</span>` : '<span class="stand-empty"></span>'}</td>
        </tr>
        <tr>
          <td>Wasser</td><td>${d.wasser.nummer}</td>
          <td>${d.wasser.stand ? `<span class="stand-val">${esc(d.wasser.stand)}</span>` : '<span class="stand-empty"></span>'}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- PAGE 2 -->
<div class="pdf-page">
  ${hdr(2)}
  ${ftr(2)}
  <div class="content">
    <div class="sec sec--first">Allgemeine Bemerkungen</div>
    <div style="margin-top:4px;">${writeField(d.bemerkungen, 9)}</div>

    <div class="sec" style="margin-top:64px;">Schlüsselübergabe</div>
    <div class="schluessel-row">
      <div class="schluessel-item">
        <span class="schluessel-item__label">Haustür</span>
        <span class="schluessel-item__val">${d.haustur}</span>
      </div>
      <div class="schluessel-item">
        <span class="schluessel-item__label">Zimmertür</span>
        <span class="schluessel-item__val">${d.zimmertur}</span>
      </div>
    </div>

    <div class="sig-block">
      <div class="sig-col">
        ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
        <div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Vermieter</div>
        <div class="sig-name">${d.vermieter}</div>
      </div>
      <div class="sig-col">
        ${d.unterzeichnungsDatum ? `<div class="sig-prefill">${d.unterschriftOrt}, ${d.unterzeichnungsDatum}</div>` : '<div class="sig-date-label">Datum, Ort</div>'}
        <div class="sig-write-gap"></div>
        <hr class="sig-line"/>
        <div class="sig-role">Mieter</div>
        <div class="sig-name">${esc(d.mieterName)}</div>
      </div>
    </div>
  </div>
</div>

</body></html>`;
}


/* ── SORTABLE ────────────────────────────────────────────── */
function _initSortable() {
  if (typeof Sortable === 'undefined') return;
  const list = document.getElementById('roomsList');
  if (!list || list._sortable) return;

  list._sortable = Sortable.create(list, {
    animation: 180,
    handle: '.rc-drag',
    delay: 150,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd(evt) {
      const ids = [...evt.to.querySelectorAll('.rc[data-id]')]
        .map(c => c.dataset.id)
        .filter(Boolean);
      saveRoomOrder(ids);
    }
  });
}


/* ── I18N ADDITIONS TO LANG (injected into existing LANG) ── */
// Called after nav.js defines LANG — patches rooms keys in
(function _patchRoomsLang() {
  if (typeof LANG === 'undefined') return;

  const en = {
    rooms_title:         'Rooms',
    rooms_add:           'Add room',
    rooms_edit:          'Edit room',
    rooms_delete:        'Delete room',
    rooms_save:          'Save',
    rooms_cancel:        'Cancel',
    rooms_vacant:        'Vacant',
    rooms_occupied:      'Occupied',
    rooms_mark_vacant:   'Mark as vacant',
    rooms_mark_occupied: 'Mark as occupied',
    rooms_inventar:      'Inventar',
    rooms_add_item:      'Add item',
    rooms_contracts:     'Contracts',
  };

  const de = {
    rooms_title:         'Zimmer',
    rooms_add:           'Zimmer hinzufügen',
    rooms_edit:          'Zimmer bearbeiten',
    rooms_delete:        'Zimmer löschen',
    rooms_save:          'Speichern',
    rooms_cancel:        'Abbrechen',
    rooms_vacant:        'Leer',
    rooms_occupied:      'Belegt',
    rooms_mark_vacant:   'Als leer markieren',
    rooms_mark_occupied: 'Als belegt markieren',
    rooms_inventar:      'Inventar',
    rooms_add_item:      'Artikel hinzufügen',
    rooms_contracts:     'Verträge',
  };

  Object.assign(LANG.en, en);
  Object.assign(LANG.de, de);
})();


/* ═══════════════════════════════════════════════════════════════════════════
 *  CASA CASTEL — MIETVERTRAG
 *  Append this entire file to the end of tab-rooms.js
 *
 *  Contains:
 *    _buildMietvertragOnlyData()   — data builder
 *    _contractBodyMietvertrag()    — modal body HTML
 *    _toggleMvBefristung()         — toggle helper
 *    _updateMvGrundDetail()        — radio helper
 *    _renderMietvertragHTML()      — 3-page PDF HTML
 *    _generateMietvertragPDF()     — html2canvas + jsPDF
 *
 *  In _openContract(), replace the `} else if (type === 'mietvertrag') {`
 *  block with the one shown in the comment at the bottom of this file.
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ── DATA BUILDER ─────────────────────────────────────────────────────────── */

function _buildMietvertragOnlyData(room, s, {
  mieterName, mieterAdr, mieterDob, mieterEmail, mieterTel = '',
  startVal, sigVal,
  befristet = false, endVal = null,
  grundVal = '', eigenbedarfPerson = '',
  ersterMonatVoll = false,
}) {
  const fmt = d => {
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2,'0') + '.' +
           String(dt.getMonth()+1).padStart(2,'0') + '.' +
           dt.getFullYear();
  };

  const gemStr = _parseArr(room.gemeinschaftsraeume).join(', ');

  // First partial month note
  let ersterMonatNote = '';
  if (startVal) {
    const start = new Date(startVal);
    if (start.getDate() !== 1) {
      const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const tage = daysInMonth - start.getDate() + 1;
      const mvKalt = Number(room.kaltmiete) || 0;
      const mvNk   = Number(room.nk_pauschale) || 0;
      const isKaltNk = room.mietvertrag_pricing === 'kalt_nk' && room.kaltmiete;
      const rentForNote = isKaltNk ? mvKalt : mvKalt + mvNk;
      const suffix      = isKaltNk ? ' (Kaltmiete-Anteil)' : ' (pauschal inkl. NK)';
      const betrag = rentForNote ? fmtEUR(Math.round(rentForNote / daysInMonth * tage * 100) / 100) : '';
      ersterMonatNote = ersterMonatVoll
        ? `Erster Monat (${start.toLocaleString('de-DE',{month:'long'})}) wird als voller Monat berechnet.`
        : `Erster Monat anteilig: ${tage} von ${daysInMonth} Tagen${betrag ? ' = ' + betrag + suffix : ''}.`;
    }
  }

  let kaltmiete, nkVorauszahlung, gesamtmiete, pricingMode;
  if (room.mietvertrag_pricing === 'kalt_nk' && room.kaltmiete) {
    kaltmiete       = Number(room.kaltmiete);
    nkVorauszahlung = Number(room.nk_pauschale) || 0;
    gesamtmiete     = kaltmiete + nkVorauszahlung;
    pricingMode     = 'kalt_nk';
  } else {
    kaltmiete       = Number(room.kaltmiete) || 0;
    nkVorauszahlung = Number(room.nk_pauschale) || 0;
    gesamtmiete     = kaltmiete + nkVorauszahlung;
    pricingMode     = 'pauschal';
  }

  const kautionBase = pricingMode === 'pauschal'
    ? kaltmiete + nkVorauszahlung
    : kaltmiete;
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
    footerAdresse:    s.objekt_adresse ? (s.objekt_plz_ort && s.objekt_adresse.includes(s.objekt_plz_ort) ? s.objekt_adresse : s.objekt_adresse + ' \u00b7 ' + (s.objekt_plz_ort || '')) : '',
    kontoinhaber:     s.kontoinhaber      || '',
    iban:             s.iban              || '',
    bic:              s.bic               || '',
    gerichtsstand:    s.gerichtsstand     || 'Wiesbaden',
    unterschriftOrt:  s.unterschrift_ort  || 'Wiesbaden',
    mieterName,
    mieterAdresse:      mieterAdr   || '',
    mieterGeburtsdatum: mieterDob   || '',
    mieterEmail:        mieterEmail || '',
    mieterTelefon:      mieterTel   || '',
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
    hausstuerschluessel: room.haustuerschluessel || 1,
    zimmerschluessel:    room.zimmerschluessel    || 1,
    inventar: Array.isArray(room.inventar) ? room.inventar : [],
    unterzeichnungsDatum: sigVal ? fmt(new Date(sigVal)) : '',
    ersterMonatNote,
    // Energieausweis — house-level, from appSettings
    energieklasse:     s.energieklasse     || '',
    endenergiebedarf:  s.endenergiebedarf  || '',
    energieausweisart: s.energieausweisart || '',
  };
}


/* ── MODAL BODY ───────────────────────────────────────────────────────────── */

function _contractBodyMietvertrag(room) {
  const s       = appSettings;
  const profile = (typeof _getProfile === 'function') ? _getProfile(room.name) : {};

  const tenantName    = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const tenantEmail   = profile.email   || '';
  const tenantAddress = profile.address || '';
  let   tenantDob     = profile.birthday || '';
  if (tenantDob && tenantDob.includes('-') && tenantDob.length === 10) {
    const [y, m, day] = tenantDob.split('-');
    tenantDob = `${day}.${m}.${y}`;
  }

  const gemStr = _parseArr(room.gemeinschaftsraeume).join(', ') || '—';
  const schluessel = `Haustür \u00d7${room.haustuerschluessel || 1} \u00b7 Zimmer \u00d7${room.zimmerschluessel || 1}`;

  let kaltDisplay, gesamtDisplay;
  if (room.mietvertrag_pricing === 'kalt_nk' && room.kaltmiete) {
    kaltDisplay   = `${fmtEUR(room.kaltmiete)} kalt + ${fmtEUR(room.nk_pauschale || 0)} NK`;
    gesamtDisplay = fmtEUR((Number(room.kaltmiete) || 0) + (Number(room.nk_pauschale) || 0));
  } else {
    const m = room.mietvertrag_miete || room.monatl_miete || 0;
    kaltDisplay   = `${fmtEUR(m)} pauschal inkl. NK`;
    gesamtDisplay = fmtEUR(m);
  }

  const kaltBase   = Number(room.kaltmiete || room.mietvertrag_miete || room.monatl_miete) || 0;
  const isPauschal = room.mietvertrag_pricing !== 'kalt_nk';
  const nkBase     = isPauschal ? (Number(room.nk_pauschale) || 0) : 0;
  const kaution    = room.kaution_override && room.kaution_default
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
        <div class="rm-kaution-rule">3 \u00d7 Kaltmiete \u00b7 Treuhandkonto</div>
      </div>
      <div class="rm-kaution-val">${fmtEUR(kaution)}</div>
    </div>

    <div class="rm-fields-title" style="margin-top:2px;">Mieterdaten</div>

    <div class="rm-field">
      <label>Name</label>
      <input class="rm-input" id="mv-name" value="${esc(tenantName)}" placeholder="Vor- und Nachname\u2026"/>
    </div>
    <div class="rm-field">
      <label>Adresse</label>
      <input class="rm-input" id="mv-adr" value="${esc(tenantAddress)}" placeholder="Aktuelle Adresse\u2026"/>
    </div>
    <div class="rm-field">
      <label>Geburtsdatum</label>
      <input class="rm-input" id="mv-dob" value="${esc(tenantDob)}" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"/>
    </div>
    <div class="rm-field">
      <label>E-Mail</label>
      <input class="rm-input" id="mv-email" type="email" value="${esc(tenantEmail)}" placeholder="mieter@beispiel.de"/>
    </div>
    <div class="rm-field">
      <label>Telefon <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(optional)</span></label>
      <input class="rm-input" id="mv-tel" type="tel" placeholder="+49 …"/>
    </div>

    <div class="rm-fields-title" style="margin-top:6px;">Mietzeit</div>

    <div class="rm-field">
      <label>Mietbeginn <span style="color:#c0392b;font-weight:700;">*</span></label>
      <input class="rm-input" id="mv-start" type="date" onclick="try{this.showPicker()}catch(e){}" oninput="_updateMvMonatToggle()"/>
    </div>

    <div class="rm-field rm-field--toggle" id="mv-erster-wrap" style="display:none">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Erster Monat</div>
          <div class="rm-toggle-sub" id="mv-erster-sub">Anteilig — wird berechnet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="mv-erster-btn" data-mode="anteilig" onclick="_toggleMvErsterMonat()">
          <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
          <span class="rm-pill-toggle__lbl" id="mv-erster-lbl">Anteilig</span>
        </button>
      </div>
    </div>

    <div class="rm-field--toggle" style="margin-bottom:10px;">
      <div class="rm-toggle-row">
        <div>
          <div class="rm-toggle-label">Befristung</div>
          <div class="rm-toggle-sub" id="mv-befristung-sub">Unbefristet</div>
        </div>
        <button type="button" class="rm-pill-toggle" id="mv-befristung-btn"
          data-mode="unbefristet" onclick="_toggleMvBefristung()">
          <span class="rm-pill-toggle__track"><span class="rm-pill-toggle__knob"></span></span>
          <span class="rm-pill-toggle__lbl" id="mv-befristung-lbl">Nein</span>
        </button>
      </div>
    </div>

    <div id="mv-befristung-details" style="display:none;">
      <div class="rm-field">
        <label>Mietende <span style="color:#c0392b;font-weight:700;">*</span></label>
        <input class="rm-input" id="mv-end" type="date" onclick="try{this.showPicker()}catch(e){}" />
      </div>
      <div class="rm-field">
        <label>Befristungsgrund <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(§ 575 BGB \u2014 Pflicht)</span></label>
        <div style="display:flex;flex-direction:column;gap:7px;margin-top:2px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="mv-grund" value="eigenbedarf" checked
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateMvGrundDetail()"/>
            Eigenbedarf
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="mv-grund" value="abriss"
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateMvGrundDetail()"/>
            Abriss / wesentliche Umbaumaßnahmen
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--cc-charcoal);text-transform:none;letter-spacing:0;">
            <input type="radio" name="mv-grund" value="dienst"
              style="width:16px;height:16px;accent-color:var(--cc-ink);flex-shrink:0;" onchange="_updateMvGrundDetail()"/>
            Dienstwohnung (§ 575 Abs. 1 Nr. 2 BGB)
          </label>
        </div>
      </div>
      <div class="rm-field" id="mv-eigenbedarf-wrap">
        <label>Eigenbedarfsperson <span style="color:#c0392b;font-weight:700;">*</span> <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(Pflicht nach BGH)</span></label>
        <input class="rm-input" id="mv-eigenbedarf-person"
          placeholder="z.\u202fB. Tochter des Vermieters, Eigennutzung durch Vermieter\u2026"/>
      </div>
    </div>

    <div class="rm-field" style="margin-top:4px;">
      <label>Unterzeichnungsdatum <span style="font-size:9px;color:var(--cc-stone);text-transform:none;letter-spacing:0;font-weight:400;">(optional)</span></label>
      <input class="rm-input" id="mv-sig" type="date" onclick="try{this.showPicker()}catch(e){}" />
    </div>`;
}

function _toggleMvBefristung() {
  const btn     = document.getElementById('mv-befristung-btn');
  const lbl     = document.getElementById('mv-befristung-lbl');
  const sub     = document.getElementById('mv-befristung-sub');
  const details = document.getElementById('mv-befristung-details');
  if (!btn) return;
  const on      = btn.dataset.mode === 'unbefristet';
  btn.dataset.mode    = on ? 'befristet'   : 'unbefristet';
  lbl.textContent     = on ? 'Ja'          : 'Nein';
  sub.textContent     = on ? 'Befristet'   : 'Unbefristet';
  details.style.display = on ? '' : 'none';
}

function _updateMvGrundDetail() {
  const val  = document.querySelector('input[name="mv-grund"]:checked')?.value;
  const wrap = document.getElementById('mv-eigenbedarf-wrap');
  if (wrap) wrap.style.display = val === 'eigenbedarf' ? '' : 'none';
}


/* ── PDF HTML RENDERER ────────────────────────────────────────────────────── */

function _renderMietvertragHTML(d) {

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
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }
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
    .nk-intro { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; line-height:1.55; margin-top:7px; margin-bottom:10px; }
    .nk-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:24px; }
    .nk-item { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; padding:2.5px 0; line-height:1.4; }
    .nk-item--full { grid-column:1/-1; border-bottom:none; }
    .clause { margin-top:8px; }
    .clause--first { margin-top:10px; }
    .clause__title { font-family:'Lato',sans-serif; font-size:11px; font-weight:700; color:#4a4540; margin-bottom:2px; line-height:1.4; }
    .clause__body { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#3a3530; line-height:1.55; }
    .inv-table { width:100%; border-collapse:collapse; margin-top:6px; }
    .inv-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#888780; border-bottom:0.5px solid #d8d3cc; padding:3px 0 4px; text-align:left; }
    .inv-table td { font-family:'Lato',sans-serif; font-size:11px; font-weight:300; color:#1a1a1a; padding:3.5px 0; line-height:1.55; }
    .comment-label { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:48px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .comment-line { border-bottom:0.5px solid #e0dbd4; height:26px; margin-top:2px; }
    .sig-block { margin-top:70px; display:flex; justify-content:space-between; }
    .sig-col { width:44%; }
    .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#aaa59e; margin-bottom:4px; }
    .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:300; color:#8a7a66; margin-bottom:4px; line-height:1.4; }
    .sig-write-gap { height:60px; }
    .sig-line { border:none; border-top:0.6px solid #3a3530; margin-bottom:7px; }
    .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#888780; }
    .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:300; color:#3a3530; margin-top:4px; }
  `;

  const hdr = room => `<div class="hdr"><span class="hdr__wordmark">Casa Castel</span><div class="hdr__room"><span class="hdr__room-label">Zimmer</span><span class="hdr__room-name">${room}</span></div></div>`;
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

  const NK_ITEMS = ['Grundsteuer','Entsorgungsbetriebe','Wasserversorgung &amp; Entwässerung','Strom','Gas / Heizung (zentrale Heizungsanlage)','Internet (Gemeinschaftsanschluss)','Wohngebäudeversicherung','Haus- &amp; Grundbesitzerhaftpflicht','Wartung Heizungsanlage','Wartung Enthärtungsanlage inkl. Regeneriersalz','Schornsteinfeger','Gartenpflege','Gebäudereinigung / Putzdienst','Winterdienst'];
  const nkRows = NK_ITEMS.map(i => `<div class="nk-item">${i}</div>`).join('') +
    `<div class="nk-item nk-item--full">Hauswart / sonstige anfallende Betriebskosten i.\u202fs.\u202fv. \u00a7\u00a02 Nr.\u00a017 BetrKV</div>`;

  const invRows = d.inventar.length
    ? d.inventar.map(i => `<tr><td>${i.gegenstand}</td><td>${i.anzahl}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:#aaa59e;font-size:10px;padding-top:6px;">Kein Inventar hinterlegt</td></tr>`;

  const subtitle = 'Zimmervermietung';

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
    ${d.mieterTelefon?kv('Telefon',d.mieterTelefon):''}
    ${sec('Mietobjekt',false,false)}
    ${kv('Adresse',d.objektAdresse)}${kv('Bezeichnung',d.zimmerName)}
    ${kv('Zimmergröße','ca.\u00a0'+d.zimmerFlaeche+'\u00a0m\u00b2')}
    ${kv('Mitgenutzte Räume',d.gemeinschaftsraeume||'—')}
    ${kv('Möblierung','Möbliert\u2002\u00b7\u2002Inventar siehe Anlage\u00a0A')}
    ${sec('Mietzeit',false,false)}
    ${kv('Mietbeginn',d.mietbeginn||'—')}
    ${d.ersterMonatNote ? kv('Erster Monat',d.ersterMonatNote) : ''}
    ${d.befristet
      ? ''
      : kv('Kündigungsfrist','3\u00a0Monate \u00b7 Schriftform (\u00a7\u00a0573c BGB)')
        + kv('\u00a7\u00a0545 BGB','Keine stillschweigende Verlängerung')
    }
    ${sec('Miete &amp; Bankverbindung',true,false)}
    ${d.pricingMode==='kalt_nk'
      ? kv('Kaltmiete',eur(d.kaltmiete)+'\u2002/ Monat')
        + kv('Nebenkosten VZ',eur(d.nkVorauszahlung)+'\u2002/ Monat (Vorauszahlung)')
      : kv('Pauschalmiete',eur(d.kaltmiete)+'\u2002/ Monat (inkl. NK)')
    }
    <div class="total-box"><span class="total-box__label">Gesamtmiete monatlich:</span><span class="total-box__value">${eur(d.gesamtmiete)}</span></div>
    ${kv('Fälligkeit','Spätestens 3.\u00a0Werktag des Monats (\u00a7\u00a0556b BGB)')}
    ${kv('Kaution',eur(d.kaution)+'\u2002(fällig binnen 5 Tagen nach Vertragsunterschrift, \u00a7\u00a0551 BGB)')}
    <div class="kv-gap"></div>
    ${kv('Kontoinhaber',d.kontoinhaber)}${kv('IBAN',d.iban)}${kv('BIC',d.bic)}
    <p class="note">Alle Zahlungen per Überweisung. Verwendungszweck: Casa Castel \u2013 ${d.zimmerName} \u2013 Miete Monat Jahr / Kaution.</p>
  </div>
</div>`;

  const page2 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(2)}
  <div class="content">
    ${sec('Betriebskosten gem. \u00a7\u00a71,\u00a02 BetrKV',true,true)}
    <p class="nk-intro">Neben der Kaltmiete trägt der Mieter anteilig folgende Betriebskosten. Umlageschlüssel: Gesamtnutzfläche des Mieters (Zimmer + anteilige Gemeinschaftsfläche) im Verhältnis zur Gesamtnutzfläche aller Zimmer. Heizung und Warmwasser nach HeizkostenV.</p>
    <div class="nk-grid">${nkRows}</div>
    <p class="nk-intro" style="margin-top:6px;border-top:0.5px solid #e8dbc5;padding-top:5px;color:#6a6560;font-style:italic;">Winterdienst wird grundsätzlich vom Mieter erledigt. Unter Umständen wird dieser gelegentlich organisiert, sofern nicht erledigt, wird dieser in den Nebenkosten berücksichtigt.</p>
    <div style="margin-top:24px;">${cl('1',d.befristet?'Befristung und Beendigung':'Mietzeit',
      d.befristet
        ? `Das Mietverhältnis ist gemäß \u00a7\u00a0575 Abs.\u00a01 BGB befristet und endet am ${d.mietende} automatisch ohne Kündigung (\u00a7\u00a0545 BGB findet keine Anwendung). Das Zimmer darf ausschließlich zu Wohnzwecken durch den namentlich genannten Mieter genutzt werden.`
        : 'Das Mietverhältnis ist unbefristet. Das Zimmer darf ausschließlich zu Wohnzwecken durch den namentlich genannten Mieter genutzt werden. Der Mieter ist verpflichtet, das Zimmer und die Gemeinschaftsflächen schonend, sauber und ordnungsgemäß zu behandeln, ausreichend zu heizen, zu lüften und von Ungeziefer freizuhalten. Mängel sind dem Vermieter unverzüglich in Textform anzuzeigen.',
      true)}</div>
    ${cl('2','Kündigung',
      d.befristet
        ? 'Das befristete Mietverhältnis endet am '+d.mietende+' automatisch ohne Kündigung (\u00a7\u00a0575 BGB). Befristungsgrund: '+d.grundLabel+(d.eigenbedarfPerson?' \u2014 '+d.eigenbedarfPerson:'')+'. Eine ordentliche Kündigung ist ausgeschlossen; die außerordentliche Kündigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unberührt. Im Falle einer Verlängerung beträgt die Kündigungsfrist für den Mieter 3\u00a0Monate zum Monatsende.'
        : 'Die ordentliche Kündigung richtet sich nach \u00a7\u00a0573c BGB. Kündigungsfrist für den Mieter: 3\u00a0Monate zum Monatsende. Für den Vermieter gilt die gesetzlich gestaffelte Frist. Die Kündigung bedarf der Schriftform. Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen. Die außerordentliche Kündigung aus wichtigem Grund bleibt unberührt.')}
    ${(() => {
      const istVoll = d.ersterMonatNote && d.ersterMonatNote.includes('voller Monat');
      let proRataText = '';
      if (d.ersterMonatNote && !istVoll) {
        proRataText = ' Zieht der Mieter nicht zum ersten eines Monats ein, werden die Tage anteilig berechnet. Der Tagespreis ergibt sich aus der Monatsmiete geteilt durch die tatsächliche Anzahl der Kalendertage des jeweiligen Monats.';
      } else if (istVoll) {
        proRataText = ' Der erste Monat wird als voller Monat berechnet.';
      }
      return d.pricingMode === 'kalt_nk'
        ? cl('3','Mietzins','Die monatliche Kaltmiete beträgt '+eur(d.kaltmiete)+', zuzüglich einer NK-Vorauszahlung von '+eur(d.nkVorauszahlung)+'.'+proRataText)
        : cl('3','Mietzins','Die monatliche Pauschalmiete beträgt '+eur(d.gesamtmiete)+'. Alle Nebenkosten (Strom, Wasser, Heizung, WLAN) sind in der Pauschale enthalten.'+proRataText);
    })()}
    ${cl('4','Untervermietung',
      'Eine Untervermietung oder sonstige Überlassung des Mietobjekts an Dritte ist nicht gestattet.')}
    ${cl('5','Schlüsselübergabe',
      `Der Mieter erhält bei Einzug ${d.hausstuerschluessel}\u00a0Haustürschlüssel und ${d.zimmerschluessel}\u00a0Zimmerschlüssel. Weitere Schlüssel bedürfen der vorherigen Zustimmung (Textform). Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs. Alle Schlüssel sind bei Auszug zurückzugeben.`)}
    ${cl('6','Kaution',
      `Der Mieter überweist die Kaution von ${eur(d.kaution)} binnen 5 Tagen nach Unterzeichnung dieses Vertrages auf das oben genannte Konto. Der Vermieter legt die Barkaution getrennt von seinem Vermögen auf einem Treuhandkonto an (\u00a7\u00a0551 BGB). Rückzahlung nach Prüfung des Zustands bei Auszug.`)}
    ${cl('7','Schönheitsreparaturen &amp; Kleinreparaturen',
      'Schönheitsreparaturen je nach Abnutzungsgrad auf Kosten des Mieters. Kleinreparaturen an häufig zugänglichen Gegenständen bis 150\u00a0\u20ac pro Maßnahme, max. 8\u202f% der Jahres-Nettokaltmiete p.\u202fa.')}
    ${cl('8','Tierhaltung',
      'Kleintiere ohne Belästigungspotenzial (Zierfische, Kleinnager) sind erlaubt. Alle weiteren Tiere bedürfen der Zustimmung (Textform).')}
    ${cl('9','Betreten des Mietobjekts',
      'Das Zimmer wird nur nach vorheriger Ankündigung (mind. 2\u00a0Werktage in Textform) betreten, z.\u202fB. zur Besichtigung bei Verkauf oder Weitervermietung sowie für notwendige Instandhaltungsarbeiten. Bei Gefahr im Verzug ist das Betreten jederzeit ohne Vorankündigung zulässig.')}
  </div>
</div>`;

  const page3 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(3)}
  <div class="content">
    ${cl('10','Rückgabe bei Vertragsende',
      'Vollständig geräumt, gereinigt, in vertragsgemäßem Zustand, alle Schlüssel. Bauliche Änderungen sind rückzubauen. Ein Übergabeprotokoll wird erstellt und beidseitig unterzeichnet.',true)}
    ${cl('11','Aufrechnung &amp; Zurückbehaltungsrecht',
      'Der Mieter kann gegen Forderungen des Vermieters nur mit unbestrittenen oder rechtskräftig festgestellten Gegenforderungen aufrechnen. Das Zurückbehaltungsrecht ist auf Mängelrechte nach \u00a7\u00a7\u00a0536\u00a0ff. BGB beschränkt und setzt eine mindestens einmonatige vorherige Ankündigung in Textform voraus.')}
    ${cl('12','Haftpflichtversicherung',
      'Der Mieter unterhält für die Dauer des Mietverhältnisses eine private Haftpflichtversicherung und weist sie auf Verlangen nach.')}
    ${cl('13','Hausordnung',
      'Rauchen ist im gesamten Gebäude nicht gestattet. Nachtruhe gilt von 22:00–07:00\u202fUhr. Die Hausordnung ist Bestandteil dieses Vertrages (Anlage\u00a0B).')}
    ${cl('14','Datenschutz',
      'Personenbezogene Daten werden gem. Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO zur Vertragsabwicklung verarbeitet, nicht an Dritte weitergegeben und 11\u00a0Jahre nach Vertragsende gelöscht.')}
    ${cl('15','Sonstige Vereinbarungen',
      'Mündliche Nebenabreden bestehen nicht. Änderungen bedürfen der Schriftform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Gerichtsstand ist '+d.gerichtsstand+'.')}
    ${cl('16','Energieausweis (\u00a7\u00a016a GEG)',
      'Der Vermieter hat dem Mieter vor Vertragsschluss den Energieausweis vorgelegt. Energieeffizienzklasse: '+(d.energieklasse||'—')+'. Endenergiebedarf: '+(d.endenergiebedarf ? d.endenergiebedarf+' kWh/(m\u00b2\u00b7a)' : '—')+'. Art des Ausweises: '+(d.energieausweisart||'—')+'.')}
    <div class="comment-label">Sonstige Anmerkungen</div>
    <div class="comment-line"></div><div class="comment-line"></div>
    <div class="comment-line"></div><div class="comment-line"></div>
    ${sigBlock()}
  </div>
</div>`;

  const page4 = `<div class="pdf-page page">
  ${hdr(d.zimmerName)}${ftr(4)}
  <div class="content">
    ${sec('Anlage A \u2014 Inventar',true,true)}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anzahl</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<title>Mietvertrag \u2014 ${d.zimmerName}</title>
<style>${CSS}</style></head>
<body>${page1}${page2}${page3}${page4}</body></html>`;
}


/* ── PDF GENERATOR ────────────────────────────────────────────────────────── */

async function _generateMietvertragPDF() {
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
 *  REPLACE IN _openContract():
 *
 *  } else if (type === 'mietvertrag') {
 *    typeLbl.textContent  = 'Mietvertrag';
 *    titleLbl.textContent = `New contract — ${room.name}`;
 *    subLbl.textContent   = `${room.flaeche_m2 ? room.flaeche_m2 + ' m²' : ''} · ${room.floor || ''}`;
 *    body.innerHTML       = _contractBodyMietvertrag(room);
 *    footer.innerHTML     = `
 *      <button class="rm-btn rm-btn--cancel" id="contractCancelBtn">Cancel</button>
 *      <button class="rm-btn rm-btn--pdf" id="contractPdfBtn"><i class="ti ti-printer"></i> Generate PDF</button>`;
 *
 *    document.getElementById('contractPdfBtn').addEventListener('click', async () => {
 *      const room2   = getRoomById(_contractRoomId); if (!room2) return;
 *      const mieterName  = document.getElementById('mv-name')?.value.trim();
 *      const mieterAdr   = document.getElementById('mv-adr')?.value.trim();
 *      const mieterDob   = document.getElementById('mv-dob')?.value.trim();
 *      const mieterEmail = document.getElementById('mv-email')?.value.trim();
 *      const startVal    = document.getElementById('mv-start')?.value;
 *      const sigVal      = document.getElementById('mv-sig')?.value;
 *      const befristet   = document.getElementById('mv-befristung-btn')?.dataset.mode === 'befristet';
 *      const endVal      = befristet ? document.getElementById('mv-end')?.value : null;
 *      const grundVal    = befristet ? (document.querySelector('input[name="mv-grund"]:checked')?.value || '') : '';
 *      const eigenbedarfPerson = grundVal === 'eigenbedarf'
 *        ? document.getElementById('mv-eigenbedarf-person')?.value.trim() : '';
 *      if (!mieterName) { alert('Bitte Mietername eingeben.'); return; }
 *      if (!startVal)   { alert('Bitte Mietbeginn auswählen.'); return; }
 *      if (befristet && !endVal) { alert('Bitte Mietende angeben.'); return; }
 *      if (befristet && grundVal === 'eigenbedarf' && !eigenbedarfPerson) {
 *        alert('Bitte Eigenbedarfsperson angeben (gesetzliche Pflicht).'); return;
 *      }
 *      const data = _buildMietvertragOnlyData(room2, appSettings, {
 *        mieterName, mieterAdr, mieterDob, mieterEmail, startVal, sigVal,
 *        befristet, endVal, grundVal, eigenbedarfPerson,
 *      });
 *      const html = _renderMietvertragHTML(data);
 *      let container = document.getElementById('_pdfRenderContainer');
 *      if (container) container.remove();
 *      container = document.createElement('div');
 *      container.id = '_pdfRenderContainer';
 *      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
 *      container.innerHTML = html;
 *      document.body.appendChild(container);
 *      await document.fonts.ready;
 *      if (window.innerWidth >= 701) {
 *        _openPdfPreview('Mietvertrag', _generateMietvertragPDF);
 *      } else {
 *        await _generateMietvertragPDF();
 *      }
 *    });
 *
 * ═══════════════════════════════════════════════════════════════════════════ */
