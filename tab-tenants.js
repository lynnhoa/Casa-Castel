/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — LANDLORD TENANTS TAB
   tab-tenants.js

   Tenant lifecycle management per room:
   - Current tenant: profile, documents, kaution, NK Abrechnungen
   - Former tenants: same + Übergabe Auszug, modal sheet, archive
   - Data: Supabase tenant_records, kaution, nk_entries, tenant_documents
   - Links rooms tab: appRooms (vacant, kitchen, active_price_type)
   - Exposes _getProfile(room) for tab-rooms.js contract modals

   Depends on: constants.js, utils.js, storage.js,
               supabase-client.js, rooms-data.js
   ───────────────────────────────────────────────────────────── */


/* ══════════════════════════════════════════════════════════════
   1. INJECT HTML
══════════════════════════════════════════════════════════════ */
document.getElementById('tab-tenants').innerHTML = `
  <div class="tn-hdr">
    <h1 class="cc-h1">Tenants</h1>
  </div>
  <div class="tn-list" id="tenantsList"></div>

  <!-- Hidden file input — reused for all document uploads (iOS PWA safe) -->
  <input type="file" id="tnFileInput" accept="application/pdf,image/*"
         style="display:none" aria-hidden="true"/>

  <!-- ══ FORMER TENANT MODAL ══ -->
  <div class="tn-overlay" id="tnModal" onclick="_tnModalOutside(event)">
    <div class="tn-sheet" id="tnSheet">

      <div class="tn-sheet-hdr">
        <div>
          <div class="tn-sheet-title" id="tnModalTitle"></div>
          <div class="tn-sheet-sub" id="tnModalSub"></div>
        </div>
        <button class="tn-sheet-close" onclick="_tnCloseModal()">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="tn-sheet-body" id="tnModalBody"></div>

      <div class="tn-sheet-footer">
        <button class="tn-btn-done" id="tnModalDone" onclick="_tnMarkDone()">
          <i class="ti ti-check"></i> Mark as done
        </button>
        <button class="tn-btn-del" id="tnModalDel" onclick="_tnDeleteFormer()">
          Delete
        </button>
      </div>

    </div>
  </div>

  <!-- ══ CONFIRM DELETE ══ -->
  <div class="tn-overlay tn-overlay--confirm" id="tnConfirm">
    <div class="tn-confirm-box">
      <div class="tn-confirm-icon"><i class="ti ti-alert-triangle"></i></div>
      <div class="tn-confirm-title">Delete tenant record</div>
      <div class="tn-confirm-body" id="tnConfirmBody"></div>
      <div class="tn-confirm-btns">
        <button class="tn-btn-cancel" onclick="_tnCancelDelete()">Cancel</button>
        <button class="tn-btn-danger" id="tnConfirmOk" onclick="_tnConfirmDelete()">
          <i class="ti ti-trash"></i> Delete
        </button>
      </div>
    </div>
  </div>
`;


/* ══════════════════════════════════════════════════════════════
   2. STYLES
══════════════════════════════════════════════════════════════ */
(function () {
  const existing = document.getElementById('tn-styles');
  if (existing) existing.remove();
  const s = document.createElement('style');
  s.id = 'tn-styles';
  s.textContent = `

/* ── PAGE HEADER ── */
.tn-hdr { margin-bottom: 20px; }

/* ── CARD LIST ── */
.tn-list { display: flex; flex-direction: column; gap: 8px; }

/* ── TENANT CARD ── */
.tc {
  background: var(--cc-white);
  border: var(--cc-border);
  border-radius: var(--cc-r-lg);
  overflow: hidden;
  transition: box-shadow .2s;
}
.tc.open { box-shadow: 0 4px 24px rgba(30,27,24,.09); }

/* card header */
.tc-hdr {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 15px 16px 13px 13px;
  cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
}
.tc-hdr-info { flex: 1; min-width: 0; }
.tc-namerow  { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
.tc-name     { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 400; color: var(--cc-ink); line-height: 1.1; }
.tc-badges   { display: flex; gap: 4px; flex-shrink: 0; align-items: center; flex-wrap: wrap; }
.tc-meta     { font-size: 11px; color: var(--cc-taupe); margin-top: 2px; }
.tc-tenant-line { font-size: 12px; color: var(--cc-charcoal); margin-top: 3px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.tc-tenant-line.vacant { color: var(--cc-stone); font-style: italic; }
.tc-hdr-pill {
  font-size: 10px; font-weight: 400; letter-spacing: 0; text-transform: none;
  padding: 1px 7px; border-radius: var(--cc-r-pill);
  background: var(--cc-surface); border: .5px solid var(--cc-rule);
  color: var(--cc-taupe); white-space: nowrap; flex-shrink: 0;
}
.tc-hdr-pill-warm { color: var(--cc-charcoal); font-weight: 500; }
.tc-hdr-pill-k-pending { background: #FAEEDA; border-color: #EF9F27; color: #854F0B; }
.tc-hdr-pill-k-holding { background: #E6F1FB; border-color: #85B7EB; color: #0C447C; }
.tc-hdr-pill-k-settled { background: #EAF3DE; border-color: #9AC87A; color: #27500A; }
.tc-chev {
  color: var(--cc-stone); font-size: 17px; flex-shrink: 0; margin-top: 5px;
  transition: transform .22s cubic-bezier(.32,.72,0,1);
}
.tc.open .tc-chev { transform: rotate(90deg); }

/* card body */
.tc-body { border-top: var(--cc-border); display: none; }
.tc.open .tc-body { display: block; }

/* ── BADGES ── */
.tb {
  font-size: 9px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  padding: 3px 8px; border-radius: var(--cc-r-pill);
  white-space: nowrap; flex-shrink: 0; display: inline-block;
}
.tb-occ { background: #EAF3DE; color: #27500A; border: .5px solid #9AC87A; }
.tb-vac { background: #F5F0EB; color: #8C6A3A; border: .5px solid #D4A87A; }
.tb-kit { background: #E6F1FB; color: #0C447C; border: .5px solid #85B7EB; }
.tb-price {
  background: none; color: var(--cc-stone); border: .5px solid var(--cc-rule);
  font-weight: 500; letter-spacing: .04em;
}
.tb-nko { background: #FAEEDA; color: #854F0B; border: .5px solid #EF9F27; }
.tb-nkd { background: #EAF3DE; color: #3B6D11; border: .5px solid #97C459; }
.tb-kop { background: #FAEEDA; color: #854F0B; border: .5px solid #EF9F27; }
.tb-kst { background: #EAF3DE; color: #27500A; border: .5px solid #9AC87A; }
.tb-hld { background: #E6F1FB; color: #0C447C; border: .5px solid #85B7EB; }
.tb-mut { background: #EDE8E0; color: #9A8E7E; border: .5px solid #E0DAD0; }
.tb-mv  { background: #EDE8E0; color: #3A3530; border: .5px solid #C8BFB0; }
.tb-kz  { background: #E8D9C4; color: #7A5820; border: .5px solid #C4A06A; }

/* ── SECTIONS ── */
.tn-sec { padding: 12px 14px; border-bottom: var(--cc-border); }
.tn-sec:last-child { border-bottom: none; }
.tn-sec-gold { border-left: 3px solid var(--cc-gold); padding-left: 13px; }
.tn-sec-gold.no-tenant { border-left-color: var(--cc-rule); }

/* ── SECTION LABEL ── */
.tn-slbl {
  font-size: 9px; font-weight: 600; letter-spacing: .11em; text-transform: uppercase;
  color: var(--cc-stone); margin-bottom: 9px; display: block;
}
.tn-slbl-gold { color: var(--cc-gold); }
.tn-slbl-note { font-size: 9px; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--cc-stone); margin-left: 4px; }

/* ── KV READ ROWS ── */
.tn-kv   { display: flex; gap: 10px; padding: 3px 0; align-items: baseline; }
.tn-kv-k { font-size: 11px; color: var(--cc-taupe); min-width: 88px; flex-shrink: 0; }
.tn-kv-v { font-size: 12px; color: var(--cc-charcoal); flex: 1; }
.tn-kv-v.muted { color: var(--cc-stone); font-style: italic; }

/* ── EDIT FORM ROWS ── */
.tn-ef   { display: flex; gap: 10px; padding: 3px 0; align-items: center; }
.tn-ef-k { font-size: 11px; color: var(--cc-taupe); min-width: 88px; flex-shrink: 0; line-height: 1.4; }
.tn-ef input {
  flex: 1; background: var(--cc-surface); border: var(--cc-border);
  border-radius: var(--cc-r-sm); padding: 5px 8px;
  font-family: 'Inter', inherit; font-size: 11px; font-weight: 300;
  color: var(--cc-charcoal); line-height: 1.4;
  outline: none; transition: border-color .15s; min-width: 0;
  -webkit-appearance: none; -webkit-text-size-adjust: 100%;
}
.tn-ef input:focus { border-color: var(--cc-gold); background: var(--cc-white); }
.tn-ef input::placeholder { color: var(--cc-stone); font-style: normal; font-weight: 300; }
.tn-ef-note { font-size: 10px; color: var(--cc-taupe); margin-top: 4px; padding-left: 98px; }

/* profile read/edit toggle */
.tn-sec-gold.editing .tn-profile-read { display: none; }
.tn-sec-gold.editing .tn-profile-edit { display: block; }
.tn-profile-read { display: block; }
.tn-profile-edit { display: none; }

.tn-save-row { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.tn-btn-save {
  height: 32px; padding: 0 14px; background: var(--cc-ink); color: var(--cc-white);
  border: none; border-radius: var(--cc-r-sm); font-size: 10px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; cursor: pointer; font-family: inherit;
  transition: opacity .15s;
}
.tn-btn-save:active { opacity: .85; }
.tn-btn-cancel-sm {
  height: 32px; padding: 0 10px; background: none; color: var(--cc-taupe);
  border: none; font-size: 13px; cursor: pointer; font-family: inherit;
}

/* ── ACTIONS STRIP ── */
.tn-acts {
  display: flex; gap: 6px; padding: 8px 14px;
  border-bottom: var(--cc-border); align-items: center;
}
.tn-act {
  height: 28px; display: flex; align-items: center; gap: 4px;
  padding: 0 11px; border-radius: var(--cc-r-pill);
  font-size: 9px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  cursor: pointer; font-family: inherit; background: none; white-space: nowrap;
  -webkit-tap-highlight-color: transparent; transition: opacity .15s;
}
.tn-act:active { opacity: .7; }
.tn-act-email { color: #0C447C; border: .5px solid #85B7EB; }
.tn-act-reset { color: var(--cc-taupe); border: var(--cc-border); }
.tn-act-edit  { color: var(--cc-taupe); border: var(--cc-border); margin-left: auto; }
.tn-act-add   { color: var(--cc-taupe); border: var(--cc-border); }

/* ── DOCUMENT ROWS — Pattern A (external sig) ── */
.tn-doc-row {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 0; border-bottom: .5px solid #F0EDE8;
}
.tn-doc-row:last-child { border-bottom: none; }
.tn-doc-name { font-size: 12px; color: var(--cc-charcoal); flex: 1; min-width: 0; }
.tn-doc-name-sm { font-size: 11px; color: var(--cc-taupe); flex: 1; min-width: 0; }

/* doc status pills */
.tn-ds {
  font-size: 9px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  padding: 2px 7px; border-radius: var(--cc-r-pill); flex-shrink: 0; white-space: nowrap;
}
.tn-ds-none    { background: #EDE8E0; color: #9A8E7E; border: .5px solid #E0DAD0; }
.tn-ds-pending { background: #FAEEDA; color: #854F0B; border: .5px solid #EF9F27; }
.tn-ds-signed  { background: #EAF3DE; color: #3B6D11; border: .5px solid #9AC87A; }
.tn-ds-done    { background: #EAF3DE; color: #3B6D11; border: .5px solid #9AC87A; }

/* doc buttons */
.tn-doc-btn {
  height: 26px; display: flex; align-items: center; gap: 3px;
  padding: 0 9px; border-radius: var(--cc-r-sm);
  font-size: 9px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  flex-shrink: 0; transition: opacity .15s; border: none;
}
.tn-doc-btn:active { opacity: .7; }
.tn-doc-btn-dark  { background: var(--cc-ink); color: var(--cc-white); }
.tn-doc-btn-ghost { background: none; color: var(--cc-taupe); border: var(--cc-border); }
.tn-doc-btn-ghost.off { opacity: .3; pointer-events: none; }

/* ── KAUTION ── */
.tn-k-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 8px; align-items: end; margin-bottom: 10px;
}
.tn-k-col { display: flex; flex-direction: column; gap: 4px; }
.tn-k-lbl {
  font-size: 9px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--cc-taupe);
}
.tn-k-input {
  width: 100%; background: var(--cc-surface); border: var(--cc-border);
  border-radius: var(--cc-r-sm); padding: 6px 8px;
  font-family: 'Inter', inherit; font-size: 12px; font-weight: 400;
  color: var(--cc-charcoal); line-height: 1.4;
  outline: none; transition: border-color .15s;
  -webkit-appearance: none; -webkit-text-size-adjust: 100%;
}
.tn-k-input:focus { border-color: var(--cc-gold); background: var(--cc-white); }
.tn-k-input[type=number]::-webkit-inner-spin-button,
.tn-k-input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.tn-k-input[type=number] { -moz-appearance: textfield; }
.tn-k-kept {
  width: 100%; background: var(--cc-surface); border: var(--cc-border);
  border-radius: var(--cc-r-sm); padding: 6px 8px;
  font-size: 13px; font-weight: 500; color: var(--cc-gold);
}
.tn-k-status-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tn-k-settle {
  font-size: 9px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  padding: 4px 11px; border-radius: var(--cc-r-pill); cursor: pointer;
  border: .5px solid #EF9F27; background: #FAEEDA; color: #854F0B;
  font-family: inherit; transition: all .15s; flex-shrink: 0;
}
.tn-k-settle.on { background: #EAF3DE; color: #27500A; border-color: #9AC87A; }

/* ── NK ROWS ── */
.tn-nk-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: .5px solid #F0EDE8;
}
.tn-nk-row:last-of-type { border-bottom: none; }
.tn-nk-yr { font-size: 12px; font-weight: 600; color: var(--cc-charcoal); min-width: 52px; flex-shrink: 0; }
.tn-nk-yr.done { color: var(--cc-stone); }
.tn-nk-info { flex: 1; font-size: 11px; color: var(--cc-taupe); min-width: 0; line-height: 1.4; }
.tn-nk-info .amt { color: var(--cc-charcoal); font-weight: 500; }
.tn-nk-info .unpaid { color: #854F0B; font-weight: 600; }
.tn-nk-info .paidlbl { color: #3B6D11; font-weight: 600; }

/* three dots */
.tn-dots { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
.tn-dot {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s; flex-shrink: 0;
}
.tn-dot.tap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tn-dot.tap:active { transform: scale(.88); }
.tn-dot i { font-size: 10px; }
.tn-dot-empty { background: none; border: 1.5px solid #E0DAD0; }
.tn-dot-empty i { color: #E0DAD0; }
.tn-dot-c { background: #E6F1FB; border: 1.5px solid #85B7EB; }
.tn-dot-c i { color: #0C447C; }
.tn-dot-s { background: #FAEEDA; border: 1.5px solid #EF9F27; }
.tn-dot-s i { color: #854F0B; }
.tn-dot-p { background: #EAF3DE; border: 1.5px solid #9AC87A; }
.tn-dot-p i { color: #3B6D11; }
.tn-dot-done { background: #EAF3DE; border: 1.5px solid #9AC87A; opacity: .4; }
.tn-dot-done i { color: #3B6D11; }

/* settled section */
.tn-settled-toggle {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 0 2px; cursor: pointer; user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.tn-settled-lbl { font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--cc-stone); }
.tn-settled-chev { color: var(--cc-stone); font-size: 12px; transition: transform .2s; }
.tn-settled-toggle.open .tn-settled-chev { transform: rotate(90deg); }
.tn-settled-list { display: none; border-top: .5px solid #F0EDE8; margin-top: 4px; }
.tn-settled-list.open { display: block; }

/* add NK */
.tn-add-nk {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 0 2px; background: none; border: none;
  border-top: .5px solid #F0EDE8;
  font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  color: var(--cc-stone); cursor: pointer; font-family: inherit;
  margin-top: 4px; width: 100%; transition: color .15s;
  -webkit-tap-highlight-color: transparent;
}
.tn-add-nk:hover { color: var(--cc-taupe); }

/* ── FORMER TENANT ROWS ── */
.tn-former-rows { border-top: var(--cc-border); }
.tn-former-row {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-bottom: var(--cc-border);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  user-select: none; transition: background .12s;
}
.tn-former-row:active { background: #F9F7F4; }
.tn-former-row:last-of-type { border-bottom: none; }
.tn-fr-info { flex: 1; min-width: 0; }
.tn-fr-name { font-size: 13px; font-weight: 500; color: var(--cc-charcoal); }
.tn-fr-period { font-size: 10px; color: var(--cc-taupe); margin-top: 1px; }
.tn-fr-badges { display: flex; gap: 4px; flex-shrink: 0; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.tn-fr-arr {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; border: var(--cc-border); color: var(--cc-taupe); font-size: 12px; flex-shrink: 0;
}
.tn-add-former-btn {
  display: flex; align-items: center; gap: 5px; width: 100%;
  padding: 9px 14px; background: none; border: none; border-top: var(--cc-border);
  font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  color: var(--cc-taupe); cursor: pointer; font-family: inherit; transition: color .15s;
  -webkit-tap-highlight-color: transparent;
}
.tn-add-former-btn:active { color: var(--cc-charcoal); }

/* archived */
.tn-arc-toggle {
  display: flex; align-items: center; gap: 6px; padding: 9px 14px;
  cursor: pointer; font-size: 10px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--cc-stone); border-top: var(--cc-border);
  user-select: none; -webkit-tap-highlight-color: transparent;
}
.tn-arc-body { display: none; background: var(--cc-surface); }
.tn-arc-body.open { display: block; }
.tn-arc-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-top: var(--cc-border); opacity: .55;
}
.tn-arc-info { flex: 1; }
.tn-arc-name { font-size: 12px; color: var(--cc-taupe); }
.tn-arc-period { font-size: 10px; color: var(--cc-stone); }
.tn-btn-reopen {
  font-size: 9px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  padding: 3px 9px; border-radius: var(--cc-r-pill);
  color: var(--cc-taupe); border: var(--cc-border); background: none;
  cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent;
}

/* ── MODAL OVERLAY ── */
.tn-overlay {
  display: none; position: fixed; inset: 0; z-index: 400;
  background: rgba(30,27,24,.22); backdrop-filter: blur(2px);
  align-items: flex-end; justify-content: center;
}
.tn-overlay.open { display: flex; }
.tn-overlay--confirm { align-items: center; padding: 24px; z-index: 500; }

/* ── MODAL SHEET ── */
.tn-sheet {
  width: 100%; max-width: 500px; max-height: 90vh;
  background: var(--cc-white); border-radius: 20px 20px 0 0;
  display: flex; flex-direction: column;
  animation: tnSheetUp .26s cubic-bezier(.32,.72,0,1);
}
@keyframes tnSheetUp {
  from { transform: translateY(40px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
.tn-sheet-hdr {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 18px 20px 14px; border-bottom: var(--cc-border); flex-shrink: 0;
}
.tn-sheet-title {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 22px; font-weight: 400; color: var(--cc-ink); line-height: 1.15; margin-bottom: 4px;
}
.tn-sheet-sub { font-size: 11px; color: var(--cc-taupe); display: flex; align-items: center; gap: 6px; }
.tn-sheet-close {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  background: var(--cc-surface); border: var(--cc-border); border-radius: 50%;
  color: var(--cc-taupe); font-size: 13px; cursor: pointer; font-family: inherit; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.tn-sheet-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }

/* modal sections — same visual as card sections */
.tn-msec { padding: 14px 20px; border-bottom: var(--cc-border); }
.tn-msec:last-child { border-bottom: none; }

.tn-sheet-footer {
  padding: 12px 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
  border-top: var(--cc-border); flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
}
.tn-btn-done {
  flex: 1; height: 44px; background: var(--cc-ink); color: var(--cc-white); border: none;
  border-radius: var(--cc-r-md); font-size: 12px; font-weight: 500;
  cursor: pointer; font-family: inherit;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: opacity .15s; -webkit-tap-highlight-color: transparent;
}
.tn-btn-done:active { opacity: .85; }
.tn-btn-del {
  height: 44px; padding: 0 16px; background: none; color: #C4705A;
  border: .5px solid #EAC4BB; border-radius: var(--cc-r-md);
  font-size: 12px; cursor: pointer; font-family: inherit; opacity: .3; pointer-events: none;
  transition: opacity .15s; -webkit-tap-highlight-color: transparent;
}
.tn-btn-del.on { opacity: 1; pointer-events: auto; }

/* ── CONFIRM DELETE ── */
.tn-confirm-box {
  background: var(--cc-white); border-radius: var(--cc-r-lg);
  padding: 28px 24px 24px; max-width: 320px; width: 100%;
  box-shadow: 0 24px 60px rgba(30,27,24,.18);
  animation: tnConfirmPop .2s cubic-bezier(.32,.72,0,1);
}
@keyframes tnConfirmPop { from { transform: scale(.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.tn-confirm-icon { font-size: 28px; color: #C4705A; margin-bottom: 12px; }
.tn-confirm-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 400; color: var(--cc-ink); margin-bottom: 6px; }
.tn-confirm-body { font-size: 13px; color: var(--cc-taupe); line-height: 1.6; margin-bottom: 20px; }
.tn-confirm-btns { display: flex; align-items: center; gap: 10px; }
.tn-btn-cancel {
  flex-shrink: 0; height: 48px; padding: 0 16px; background: none; border: none;
  color: var(--cc-stone); font-size: 13px; cursor: pointer; font-family: inherit;
}
.tn-btn-danger {
  flex: 1; height: 48px; background: #C4705A; color: var(--cc-white); border: none;
  border-radius: var(--cc-r-md); font-size: 13px; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; font-family: inherit;
}

.tn-ctype-toggle { display: flex; gap: 4px; flex-wrap: wrap; }
.tn-ctype-btn {
  font-size: 9px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  padding: 4px 11px; border-radius: var(--cc-r-pill); cursor: pointer;
  font-family: inherit; background: none; color: var(--cc-taupe);
  border: var(--cc-border); transition: all .15s;
  -webkit-tap-highlight-color: transparent;
}
.tn-ctype-btn.on { background: var(--cc-ink); color: var(--cc-white); border-color: var(--cc-ink); }

/* ── FINANCIAL STAT CELLS ── */
.tn-fin-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 8px; margin: 10px 0 8px;
}
.tn-fin-cell {
  background: var(--cc-surface); border-radius: var(--cc-r-sm);
  padding: 8px 10px;
}
.tn-fin-lbl {
  font-size: 9px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--cc-taupe); margin-bottom: 3px;
}
.tn-fin-val {
  font-size: 15px; font-weight: 500; color: var(--cc-charcoal); line-height: 1.2;
}
.tn-fin-val.gold { color: var(--cc-gold); }
.tn-fin-src {
  font-size: 9px; color: var(--cc-stone); margin-top: 2px;
}
.tn-fin-divider {
  height: 0.5px; background: var(--cc-rule); margin: 10px 0;
}
.tn-fin-note {
  font-size: 10px; color: var(--cc-taupe); margin-top: 8px;
  padding: 5px 9px; background: var(--cc-surface);
  border-radius: var(--cc-r-sm); border-left: 2px solid var(--cc-gold);
}

/* staffelmiete toggle */
.tn-staf-toggle { display: flex; gap: 4px; }
.tn-staf-btn {
  font-size: 9px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  padding: 3px 10px; border-radius: var(--cc-r-pill); cursor: pointer;
  font-family: inherit; background: none; color: var(--cc-taupe);
  border: var(--cc-border); transition: all .15s;
  -webkit-tap-highlight-color: transparent;
}
.tn-staf-btn.on { background: var(--cc-ink); color: var(--cc-white); border-color: var(--cc-ink); }

/* ── EMPTY STATE ── */
.tn-empty { font-size: 12px; color: var(--cc-stone); font-style: italic; padding: 3px 0; }

/* ── DESKTOP / IPAD ── */
@media (min-width: 701px) {
  .tn-overlay { align-items: center; }
  .tn-sheet   { border-radius: var(--cc-r-lg); max-height: 80vh; }
  .tn-sheet-footer { padding-bottom: 16px; }
  .tn-former-row:hover { background: #F9F7F4; }
  .tn-add-former-btn:hover { color: var(--cc-charcoal); }
  /* Cards full width — matches rooms tab .rp-list behavior */
  .tn-list { max-width: none; margin: 0; }
}

/* ── PWA iOS bottom safe area on card list ── */
#tab-tenants .tn-list {
  padding-bottom: max(40px, env(safe-area-inset-bottom, 40px));
}

  `;
  document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════
   3. STATE
══════════════════════════════════════════════════════════════ */

// Guards
let _tnLoaded        = false;  // true after first HTML inject + event bind
let _tnRoomsWired    = false;  // true after onRoomsChange registered

// In-memory caches — populated by _tnLoad()
// Keyed by tenant_record.id
let _tnRecords  = [];          // all tenant_record rows for this property
let _tnKaution  = {};          // { [tenant_id]: kaution_row }
let _tnNK       = {};          // { [tenant_id]: [nk_entry, …] }
let _tnDocs     = {};          // { [tenant_id]: [doc_row, …] }

// Active profile cache keyed by room name — for _getProfile()
let _tnProfileCache = {};      // { [room]: { firstName, lastName, … } }

// Modal state
let _tnModalTenantId = null;   // tenant_record.id currently open in modal

// File upload state
let _tnUploadTenantId  = null;
let _tnUploadDocType   = null;

// Delete state
let _tnDeleteId = null;


/* ══════════════════════════════════════════════════════════════
   4. HELPERS
══════════════════════════════════════════════════════════════ */

function _tnFmtEUR(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

function _tnFmtDate(d) {
  if (!d) return '';
  // Already DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return d;
  // ISO date → DD.MM.YYYY
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return String(dt.getDate()).padStart(2,'0') + '.' +
         String(dt.getMonth()+1).padStart(2,'0') + '.' +
         dt.getFullYear();
}

function _tnParseDate(s) {
  // DD.MM.YYYY → ISO YYYY-MM-DD for Supabase date column
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

// Derive contract_type label from rooms tab (live for current, snapshot for former)
function _tnContractLabel(type) {
  if (type === 'mietvertrag') return 'Mietvertrag';
  if (type === 'kurzzeit')    return 'Kurzzeitmietvertrag';
  return null;
}

// Get active_price_type from appRooms for a room name
function _tnRoomContractType(roomName) {
  if (typeof appRooms === 'undefined') return null;
  const r = appRooms.find(x => x.name === roomName);
  if (!r) return null;
  // Mirror _getActiveType logic from tab-rooms.js
  const hasMv = (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) || !!r.mietvertrag_miete;
  const hasKz = !!r.kurzzeit_kaltmiete;
  if (r.active_price_type === 'mietvertrag' && hasMv) return 'mietvertrag';
  if (r.active_price_type === 'kurzzeit'    && hasKz) return 'kurzzeit';
  if (hasMv) return 'mietvertrag';
  if (hasKz) return 'kurzzeit';
  return null;
}

// Get both contract types if room has dual pricing
function _tnRoomContractTypes(roomName) {
  if (typeof appRooms === 'undefined') return [];
  const r = appRooms.find(x => x.name === roomName);
  if (!r) return [];
  const types = [];
  const hasMv = (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) || !!r.mietvertrag_miete;
  const hasKz = !!r.kurzzeit_kaltmiete;
  if (hasMv) types.push('mietvertrag');
  if (hasKz) types.push('kurzzeit');
  return types;
}

// Pull live pricing from rooms tab — mirrors _getRentInfo() from tab-rooms.js exactly
function _tnRoomPricing(roomName) {
  if (typeof appRooms === 'undefined') return {};
  const r = appRooms.find(x => x.name === roomName);
  if (!r) return {};
  const ctype = _tnRoomContractType(roomName);

  let kaltmiete   = null;
  let nebenkosten = null;

  if (ctype === 'mietvertrag') {
    if (r.mietvertrag_pricing === 'kalt_nk' && r.kaltmiete) {
      // Kalt + NK mode: kaltmiete and NK are separate fields
      kaltmiete   = Number(r.kaltmiete)    || null;
      nebenkosten = Number(r.nk_pauschale) || null;
    } else if (r.mietvertrag_miete) {
      // Pauschal mode: mietvertrag_miete is the warm total, NK is still in nk_pauschale
      nebenkosten = Number(r.nk_pauschale)    || null;
      kaltmiete   = Number(r.mietvertrag_miete) - (nebenkosten || 0) || null;
    }
  } else if (ctype === 'kurzzeit' && r.kurzzeit_kaltmiete) {
    // Kurzzeit: kurzzeit_kaltmiete is always kalt, kurzzeit_nk is NK
    kaltmiete   = Number(r.kurzzeit_kaltmiete) || null;
    nebenkosten = Number(r.kurzzeit_nk)        || null;
  }

  // kaution_override wins; otherwise caller uses _tnKautionSoll() with dates
  const kaution_override = !!(r.kaution_override && r.kaution_default);
  const kaution_fixed    = kaution_override ? Number(r.kaution_default) : null;

  return { kaltmiete, nebenkosten, kaution_override, kaution_fixed };
}

// Duration-aware kaution_soll — mirrors rooms tab contract modal logic exactly
// mietbeginn / mietende: ISO strings or DD.MM.YYYY or null
function _tnKautionSoll(roomName, mietbeginn, mietende) {
  const p = _tnRoomPricing(roomName);
  if (p.kaution_override) return p.kaution_fixed;
  if (!p.kaltmiete) return null;
  // Parse either ISO or DD.MM.YYYY
  function _parseD(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    return m ? new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`) : null;
  }
  const start = _parseD(mietbeginn);
  const end   = _parseD(mietende);
  if (start && end && end > start) {
    const months = Math.round((end - start) / (30.44 * 24 * 3600 * 1000));
    return months <= 3
      ? Math.round(p.kaltmiete * 1)
      : Math.round(p.kaltmiete * 3);
  }
  // No dates: KZ defaults to 1×, MV defaults to 3×
  const ctype = _tnRoomContractType(roomName);
  return ctype === 'kurzzeit'
    ? Math.round(p.kaltmiete * 1)
    : Math.round(p.kaltmiete * 3);
}

// Short pricing label for card header badge
// e.g. "MV · Kalt+NK", "MV · Pauschal", "KZ · Kalt+NK", "KZ · Pauschal"
function _tnPriceLabel(roomName) {
  if (typeof appRooms === 'undefined') return null;
  const r = appRooms.find(x => x.name === roomName);
  if (!r) return null;
  const ctype = _tnRoomContractType(roomName);
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
function _tnKautionStatus(received, returned, settled) {
  if (settled) {
    if (returned === received) return { label: 'Fully returned', cls: 'tb-kst' };
    if (returned > 0)          return { label: 'Partially kept', cls: 'tb-kst' };
    return                            { label: 'Fully kept',     cls: 'tb-kst' };
  }
  if (received === 0)          return { label: 'Pending',            cls: 'tb-mut' };
  if (returned === 0)          return { label: 'Holding',            cls: 'tb-hld' };
  const kept = received - returned;
  if (kept > 0)                return { label: 'Partially settled',  cls: 'tb-kop' };
  return                              { label: 'Fully returned',      cls: 'tb-kst' };
}

// NK open = has any entry that is not (paid=true)
function _tnNkHasOpen(tenantId) {
  const entries = _tnNK[tenantId] || [];
  return entries.some(e => !e.paid);
}

// Kaution open = received > 0 and not settled
function _tnKautionOpen(tenantId) {
  const k = _tnKaution[tenantId];
  if (!k) return false;
  return k.received > 0 && !k.settled;
}

// Build former tenant status badges HTML
function _tnFormerBadges(tenantId) {
  const nkOpen = _tnNkHasOpen(tenantId);
  const kOpen  = _tnKautionOpen(tenantId);
  let html = '';
  if (nkOpen)  html += `<span class="tb tb-nko">NK open</span>`;
  if (!nkOpen) html += `<span class="tb tb-nkd">NK done</span>`;
  const k = _tnKaution[tenantId];
  if (k) {
    const st = _tnKautionStatus(k.received, k.returned, k.settled);
    if (kOpen)  html += `<span class="tb tb-kop">Kaution</span>`;
    if (!kOpen) html += `<span class="tb tb-kst">Settled</span>`;
  }
  return html;
}

// Is former tenant "done" — all business closed + manually done or auto-archived
function _tnIsAllDone(tenantId) {
  return !_tnNkHasOpen(tenantId) && !_tnKautionOpen(tenantId);
}

// Visibility: show former tenant if open business OR < 12 months since move-out OR !done
function _tnFormerVisible(rec) {
  // Always hide if manually marked done
  if (rec.done) return false;
  // Always show if not done (covers newly added records with no mietende)
  if (!rec.mietende) return true;
  // Show if open business
  if (_tnNkHasOpen(rec.id)) return true;
  if (_tnKautionOpen(rec.id)) return true;
  // Show if within 12-month grace period
  const monthsAgo = (Date.now() - new Date(rec.mietende)) / (30.44 * 24 * 3600 * 1000);
  if (monthsAgo < 12) return true;
  return false;
}


/* ══════════════════════════════════════════════════════════════
   5. SUPABASE — LOAD
══════════════════════════════════════════════════════════════ */

async function _tnLoad() {
  if (!sbL) return;

  // Get room names from appRooms (already loaded by loadRooms)
  const rooms = (typeof appRooms !== 'undefined' && appRooms.length)
    ? appRooms.filter(r => r.active).map(r => r.name)
    : ALL_ROOMS;

  // Fetch all tenant records for this property
  const { data: records, error: recErr } = await sbL
    .from('tenant_records')
    .select('*')
    .in('room', rooms)
    .order('mietbeginn', { ascending: false });

  if (recErr) { console.warn('[tenants] load error:', recErr.message); return; }
  _tnRecords = records || [];

  const tenantIds = _tnRecords.map(r => r.id);
  if (!tenantIds.length) { _tnRender(); return; }

  // Parallel load of related tables
  const [kRes, nkRes, docRes] = await Promise.all([
    sbL.from('kaution').select('*').in('tenant_id', tenantIds),
    sbL.from('nk_entries').select('*').in('tenant_id', tenantIds).order('period', { ascending: false }),
    sbL.from('tenant_documents').select('*').in('tenant_id', tenantIds),
  ]);

  // Build caches
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

  // Build profile cache for _getProfile() — active tenants only
  _tnProfileCache = {};
  _tnRecords.filter(r => r.status === 'active').forEach(r => {
    _tnProfileCache[r.room] = {
      firstName: r.first_name || '',
      lastName:  r.last_name  || '',
      email:     r.email      || '',
      phone:     r.phone      || '',
      birthday:  r.birthday   || '',
      address:   r.address    || '',
    };
  });

  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   6. _getProfile — called synchronously by tab-rooms.js
      Replaces old lounge_data implementation.
      Returns { firstName, lastName, email, phone, birthday, address }
══════════════════════════════════════════════════════════════ */
function _getProfile(room) {
  return _tnProfileCache[room] || {};
}


/* ══════════════════════════════════════════════════════════════
   7. RENDER
══════════════════════════════════════════════════════════════ */

function _tnRender() {
  const list = document.getElementById('tenantsList');
  if (!list) return;

  // Get rooms in sort_order (same as rooms tab)
  const rooms = (typeof appRooms !== 'undefined' && appRooms.length)
    ? appRooms.filter(r => r.active).sort((a,b) => (a.sort_order||0) - (b.sort_order||0))
    : ALL_ROOMS.map(n => ({ name: n, active: true, vacant: false }));

  if (!rooms.length) {
    list.innerHTML = `<p class="tn-empty">No rooms found.</p>`;
    return;
  }

  list.innerHTML = rooms.map(r => _tnCardHTML(r)).join('');
  _tnBindCards();
  // Pre-fill kaution on any blank forms (vacant rooms rendered in edit mode)
  rooms.forEach(r => {
    const rid = r.name.replace(/\s+/g,'_').toLowerCase();
    const sec = document.getElementById('cursec-' + rid);
    if (sec && sec.classList.contains('editing')) _tnUpdateKautionSoll(rid);
  });
}


/* ══════════════════════════════════════════════════════════════
   8. CARD HTML
══════════════════════════════════════════════════════════════ */

function _tnCardHTML(room) {
  const vacant     = !!room.vacant;
  const hasKitchen = !!room.kitchen_enabled ||
    (typeof getKitchenRooms === 'function' && getKitchenRooms().includes(room.name));

  // Active tenant record for this room
  const activeRec = _tnRecords.find(r => r.room === room.name && r.status === 'active');

  // Former tenant records
  const formerRecs = _tnRecords
    .filter(r => r.room === room.name && r.status === 'former')
    .sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));

  // Archived records
  const archivedRecs = _tnRecords
    .filter(r => r.room === room.name && r.status === 'archived')
    .sort((a,b) => new Date(b.mietende||0) - new Date(a.mietende||0));

  // Collapsed header info
  const tenantName = activeRec
    ? ([activeRec.first_name, activeRec.last_name].filter(Boolean).join(' ') || null)
    : null;

  // Warmmiete + Kaltmiete for collapsed header — live from rooms tab
  const _hdrP    = _tnRoomPricing(room.name);
  const _hdrKalt = _hdrP.kaltmiete != null ? _tnFmtEUR(_hdrP.kaltmiete) : null;
  const _hdrWarm = (_hdrP.kaltmiete != null && _hdrP.nebenkosten != null)
    ? _tnFmtEUR(_hdrP.kaltmiete + _hdrP.nebenkosten)
    : (_hdrP.kaltmiete != null ? _tnFmtEUR(_hdrP.kaltmiete) : null);

  // Kaution pill for collapsed header
  const _hdrK = activeRec ? (_tnKaution[activeRec.id] || null) : null;
  const _hdrKSoll = activeRec?.kaution_soll != null
    ? Number(activeRec.kaution_soll)
    : _tnKautionSoll(room.name, activeRec?.mietbeginn || null, activeRec?.mietende || null);
  const _hdrKPill = (function() {
    if (!activeRec) return '';
    if (!_hdrK || _hdrK.received === 0) {
      const amt = _hdrKSoll ? _tnFmtEUR(_hdrKSoll) + ' ' : '';
      return `<span class="tc-hdr-pill tc-hdr-pill-k-pending">${amt}Kaution pending</span>`;
    }
    if (_hdrK.settled) {
      return `<span class="tc-hdr-pill tc-hdr-pill-k-settled">Kaution settled</span>`;
    }
    return `<span class="tc-hdr-pill tc-hdr-pill-k-holding">${_tnFmtEUR(_hdrK.received)} holding</span>`;
  })();

  const rid = esc(room.name.replace(/\s+/g,'_').toLowerCase());

  return `
  <div class="tc" id="tc-${rid}" data-room="${esc(room.name)}">
    <div class="tc-hdr" onclick="_tnToggleCard('tc-${rid}')">
      <div class="tc-hdr-info">
        <div class="tc-namerow">
          <span class="tc-name">${esc(room.name)}</span>
          <div class="tc-badges">
            <span class="tb ${vacant ? 'tb-vac' : 'tb-occ'}">${vacant ? 'Vacant' : 'Occupied'}</span>
            ${hasKitchen ? `<span class="tb tb-kit">Kitchen</span>` : ''}
            ${(function(){ const pl = _tnPriceLabel(room.name); return pl ? `<span class="tb tb-price">${esc(pl)}</span>` : ''; })()}
          </div>
        </div>
        <div class="tc-meta">${room.flaeche_m2 ? room.flaeche_m2 + ' m²' : ''}${room.floor ? ' · ' + esc(room.floor) : ''}</div>
        <div class="tc-tenant-line ${tenantName ? '' : 'vacant'}">
          ${tenantName ? esc(tenantName) : 'No current tenant'}${tenantName ? `
            ${_hdrKalt ? `<span class="tc-hdr-pill">${_hdrKalt} Kalt</span>` : ''}
            ${_hdrWarm ? `<span class="tc-hdr-pill tc-hdr-pill-warm">${_hdrWarm} Warm</span>` : ''}
            ${_hdrKPill}` : ''}
        </div>
      </div>
      <i class="ti ti-chevron-right tc-chev" aria-hidden="true"></i>
    </div>

    <div class="tc-body">
      ${_tnCurrentTenantHTML(room, activeRec)}
      ${_tnDocumentsHTML(room, activeRec)}
      ${_tnKautionHTML(activeRec?.id || null, 'card')}
      ${_tnNKHTML(activeRec?.id || null, 'card')}
      ${_tnFormerSectionHTML(room.name, formerRecs, archivedRecs)}
    </div>
  </div>`;
}


/* ── CURRENT TENANT SECTION ── */
function _tnCurrentTenantHTML(room, rec) {
  const rid = esc(room.name.replace(/\s+/g,'_').toLowerCase());

  // Is record effectively empty? (no key fields filled yet)
  const isEmpty = !rec || (!rec.first_name && !rec.last_name && !rec.email && !rec.mietbeginn);

  // No record yet — show blank edit form, save creates the record
  if (!rec) {
    const liveP0 = _tnRoomPricing(room.name);
    const dKalt0  = liveP0.kaltmiete   ?? null;
    const dNk0    = liveP0.nebenkosten  ?? null;
    const dKSoll0 = _tnKautionSoll(room.name, null, null);
    const dWarm0  = (dKalt0 != null && dNk0 != null) ? dKalt0 + dNk0 : dKalt0;

    return `
  <div class="tn-sec tn-sec-gold editing" id="cursec-${rid}" data-tenant-id="">
    <span class="tn-slbl tn-slbl-gold">Current tenant</span>
    <div class="tn-profile-read" style="display:none"></div>
    <div class="tn-profile-edit">
      <div class="tn-ef"><span class="tn-ef-k">Name</span><input data-f="name" value="" placeholder="Full name"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Email</span><input data-f="email" type="email" value="" placeholder="tenant@mail.de"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Phone</span><input data-f="phone" type="tel" value="" placeholder="+49 ..."/></div>
      <div class="tn-ef"><span class="tn-ef-k">Birthday</span><input data-f="birthday" value="" placeholder="DD.MM.YYYY"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Address</span><input data-f="address" value="" placeholder="Street, City"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Move in</span><input data-f="mietbeginn" value="" placeholder="DD.MM.YYYY" oninput="_tnUpdateKautionSoll('${rid}')"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Move out</span><input data-f="mietende" value="" placeholder="DD.MM.YYYY \u2014 sets tenant as Former" oninput="_tnUpdateKautionSoll('${rid}')"/></div>
      <div class="tn-ef-note">Setting move out date moves this tenant to Former on save.</div>

      <div class="tn-fin-divider"></div>
      <div class="tn-slbl" style="margin-bottom:8px">Agreed rent &amp; kaution</div>

      <div class="tn-ef">
        <span class="tn-ef-k">Kaltmiete</span>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <input data-f="kaltmiete" type="number" value="${dKalt0 ?? ''}" placeholder="${dKalt0 ?? ''}" oninput="_tnUpdateWarm('${rid}')"/>
          <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">\u20ac/mo</span>
        </div>
      </div>
      <div class="tn-ef">
        <span class="tn-ef-k">Nebenkosten</span>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <input data-f="nebenkosten" type="number" value="${dNk0 ?? ''}" placeholder="${dNk0 ?? ''}" oninput="_tnUpdateWarm('${rid}')"/>
          <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">\u20ac/mo</span>
        </div>
      </div>
      <div class="tn-ef" style="padding-bottom:2px">
        <span class="tn-ef-k" style="color:var(--cc-stone);font-size:10px">Warmmiete</span>
        <span id="warm-${rid}" style="font-size:11px;color:var(--cc-gold);font-weight:500">${dWarm0 != null ? _tnFmtEUR(dWarm0) : '\u2014'} <span style="color:var(--cc-stone);font-size:9px">auto-derived</span></span>
      </div>
      <div class="tn-ef">
        <span class="tn-ef-k">Kaution soll</span>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <input data-f="kaution_soll" type="number" value="${dKSoll0 ?? ''}" placeholder="${dKSoll0 ?? ''}" oninput="_tnUpdateKautionSoll('${rid}')"/>
          <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">\u20ac</span>
        </div>
      </div>
      <div class="tn-ef-note tn-kaution-rule-hint" style="padding-left:0;color:var(--cc-stone);font-size:10px"></div>
      <div class="tn-ef">
        <span class="tn-ef-k">Staffelmiete</span>
        <div class="tn-staf-toggle">
          <button class="tn-staf-btn" onclick="_tnSetStaf('${rid}',true,this)">Ja</button>
          <button class="tn-staf-btn on" onclick="_tnSetStaf('${rid}',false,this)">Nein</button>
        </div>
      </div>
      <div class="tn-fin-note">Pre-filled from rooms tab. Edit to set this tenant's actual agreed terms.</div>

      <div class="tn-save-row">
        <button class="tn-btn-save" onclick="_tnSaveNewTenant('${rid}','${esc(room.name)}')">Save</button>
      </div>
    </div>
  </div>`;
  }


  const email           = esc(rec.email || '');
  const fullName        = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const mietendeDisplay = rec.mietende ? _tnFmtDate(rec.mietende) : null;
  const autoEdit        = isEmpty ? ' editing' : '';

  // Financial values — stored override takes priority, live rooms tab as fallback
  // Active: null in DB = live from rooms tab. Stored value = agreed override.
  // Former: always stored snapshot (set at move-out). Editable correction.
  const isFormer = rec.status === 'former' || rec.status === 'archived';
  const liveP  = _tnRoomPricing(room.name);
  const dKalt  = rec.kaltmiete    != null ? Number(rec.kaltmiete)    : (liveP.kaltmiete   ?? null);
  const dNk    = rec.nebenkosten  != null ? Number(rec.nebenkosten)  : (liveP.nebenkosten  ?? null);
  const dKSoll = rec.kaution_soll != null ? Number(rec.kaution_soll) : _tnKautionSoll(room.name, rec.mietbeginn || null, rec.mietende || null);
  const dWarm  = (dKalt != null && dNk != null) ? dKalt + dNk : dKalt;
  const staf   = !!rec.staffelmiete;
  // Source label: show where current display value comes from
  const dSrc   = (rec.kaltmiete != null) ? 'agreed' : 'live · rooms tab';

  return `
  <div class="tn-sec tn-sec-gold${autoEdit}" id="cursec-${rid}" data-tenant-id="${rec.id}">
    <span class="tn-slbl tn-slbl-gold">Current tenant</span>

    <!-- READ VIEW -->
    <div class="tn-profile-read">
      <div class="tn-kv"><span class="tn-kv-k">Name</span><span class="tn-kv-v">${esc(fullName) || '<span class="muted">Not set</span>'}</span></div>
      <div class="tn-kv"><span class="tn-kv-k">Email</span><span class="tn-kv-v">${email || '<span class="muted">Not set</span>'}</span></div>
      <div class="tn-kv"><span class="tn-kv-k">Phone</span><span class="tn-kv-v">${esc(rec.phone||'') || '<span class="muted">Not set</span>'}</span></div>
      <div class="tn-kv"><span class="tn-kv-k">Birthday</span><span class="tn-kv-v">${esc(rec.birthday||'') || '<span class="muted">Not set</span>'}</span></div>
      <div class="tn-kv"><span class="tn-kv-k">Address</span><span class="tn-kv-v">${esc(rec.address||'') || '<span class="muted">Not set</span>'}</span></div>
      <div class="tn-kv"><span class="tn-kv-k">Move in</span><span class="tn-kv-v">${_tnFmtDate(rec.mietbeginn) || '<span class="muted">Not set</span>'}</span></div>
      <div class="tn-kv"><span class="tn-kv-k">Move out</span><span class="tn-kv-v ${mietendeDisplay ? '' : 'muted'}">${mietendeDisplay || 'Not set \u2014 still active'}</span></div>

      <div class="tn-fin-divider"></div>
      <div class="tn-slbl" style="margin-bottom:8px">Agreed rent &amp; kaution</div>

      <div class="tn-fin-grid">
        <div class="tn-fin-cell">
          <div class="tn-fin-lbl">Kaltmiete</div>
          <div class="tn-fin-val">${dKalt != null ? _tnFmtEUR(dKalt) : '<span class="muted">\u2014</span>'}</div>
          <div class="tn-fin-src">${dSrc}</div>
        </div>
        <div class="tn-fin-cell">
          <div class="tn-fin-lbl">Nebenkosten</div>
          <div class="tn-fin-val">${dNk != null ? _tnFmtEUR(dNk) : '<span class="muted">\u2014</span>'}</div>
          <div class="tn-fin-src">${dSrc}</div>
        </div>
        <div class="tn-fin-cell">
          <div class="tn-fin-lbl">Warmmiete</div>
          <div class="tn-fin-val gold">${dWarm != null ? _tnFmtEUR(dWarm) : '<span class="muted">\u2014</span>'}</div>
          <div class="tn-fin-src">derived</div>
        </div>
      </div>

      <div class="tn-kv">
        <span class="tn-kv-k">Kaution soll</span>
        <span class="tn-kv-v">${dKSoll != null ? _tnFmtEUR(dKSoll) : '<span class="muted">Not set</span>'}${dKSoll && dKalt ? ` <span style="color:var(--cc-stone);font-size:10px">\u00b7 ${Math.round(dKSoll/dKalt*10)/10}\u00d7 Kaltmiete</span>` : ''}</span>
      </div>
      <div class="tn-kv"><span class="tn-kv-k">Staffelmiete</span><span class="tn-kv-v">${staf ? 'Ja' : 'Nein'}</span></div>
      <div class="tn-fin-note">Values from rooms tab. Edit to override for this tenant.</div>
    </div>

    <!-- EDIT VIEW -->
    <div class="tn-profile-edit">
      <div class="tn-ef"><span class="tn-ef-k">Name</span><input data-f="name" value="${esc(fullName)}" placeholder="Full name"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Email</span><input data-f="email" type="email" value="${email}" placeholder="tenant@mail.de"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Phone</span><input data-f="phone" type="tel" value="${esc(rec.phone||'')}" placeholder="+49 ..."/></div>
      <div class="tn-ef"><span class="tn-ef-k">Birthday</span><input data-f="birthday" value="${esc(rec.birthday||'')}" placeholder="DD.MM.YYYY"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Address</span><input data-f="address" value="${esc(rec.address||'')}" placeholder="Street, City"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Move in</span><input data-f="mietbeginn" value="${_tnFmtDate(rec.mietbeginn)}" placeholder="DD.MM.YYYY" oninput="_tnUpdateKautionSoll('${rid}')"/></div>
      <div class="tn-ef"><span class="tn-ef-k">Move out</span><input data-f="mietende" value="${_tnFmtDate(rec.mietende)}" placeholder="DD.MM.YYYY \u2014 sets tenant as Former" oninput="_tnUpdateKautionSoll('${rid}')"/></div>
      <div class="tn-ef-note">Setting move out date moves this tenant to Former on save.</div>


      <div class="tn-fin-divider"></div>
      <div class="tn-slbl" style="margin-bottom:8px">Rent &amp; kaution</div>

      <div class="tn-ef">
        <span class="tn-ef-k">Kaltmiete</span>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <input data-f="kaltmiete" type="number" value="${dKalt ?? ''}" placeholder="${liveP.kaltmiete ?? '—'}" oninput="_tnUpdateWarm('${rid}')"/>
          <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">€/mo</span>
        </div>
      </div>
      <div class="tn-ef">
        <span class="tn-ef-k">Nebenkosten</span>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <input data-f="nebenkosten" type="number" value="${dNk ?? ''}" placeholder="${liveP.nebenkosten ?? '—'}" oninput="_tnUpdateWarm('${rid}')"/>
          <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">€/mo</span>
        </div>
      </div>
      <div class="tn-ef" style="padding-bottom:2px">
        <span class="tn-ef-k" style="color:var(--cc-stone);font-size:10px">Warmmiete</span>
        <span id="warm-${rid}" style="font-size:11px;color:var(--cc-gold);font-weight:500">${dWarm != null ? _tnFmtEUR(dWarm) : '—'} <span style="color:var(--cc-stone);font-size:9px">auto-derived</span></span>
      </div>
      <div class="tn-ef">
        <span class="tn-ef-k">Kaution soll</span>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <input data-f="kaution_soll" type="number" value="${dKSoll ?? ''}" placeholder="${_tnKautionSoll(room.name, rec.mietbeginn||null, rec.mietende||null) ?? ''}" oninput="_tnUpdateKautionSoll('${rid}')"/>
          <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">€</span>
        </div>
      </div>
      <div class="tn-ef-note tn-kaution-rule-hint" style="padding-left:0;color:var(--cc-stone);font-size:10px"></div>
      <div class="tn-ef">
        <span class="tn-ef-k">Staffelmiete</span>
        <div class="tn-staf-toggle">
          <button class="tn-staf-btn${staf ? ' on' : ''}" onclick="_tnSetStaf('${rid}',true,this)">Ja</button>
          <button class="tn-staf-btn${!staf ? ' on' : ''}" onclick="_tnSetStaf('${rid}',false,this)">Nein</button>
        </div>
      </div>
      <div class="tn-fin-note">${isFormer ? 'Frozen at move-out — edit to correct.' : 'Placeholders from rooms tab. Set agreed values here to override.'}</div>

    </div>
  </div>

  <div class="tn-acts">
    ${email ? `<button class="tn-act tn-act-email"
      onclick="window.location.href=buildMailto('${email}','Message from Casa Castel','')">
      <i class="ti ti-mail" style="font-size:11px"></i> Email
    </button>` : ''}
    <button class="tn-act tn-act-reset" onclick="_tnResetPw('${esc(room.name)}')">
      <i class="ti ti-key" style="font-size:11px"></i> Reset pw
    </button>
    <button class="tn-act tn-act-edit" id="editbtn-${rid}" onclick="_tnEditOrSave('${rid}','${rec.id}')">
      <i class="ti ti-pencil" style="font-size:11px"></i> Edit
    </button>
  </div>`;
}




/* ── DOCUMENTS SECTION (Pattern A — external sig + upload) ── */
function _tnDocumentsHTML(room, activeRec) {
  const types  = _tnRoomContractTypes(room.name);
  const docs   = activeRec ? (_tnDocs[activeRec.id] || []) : [];
  const tid    = activeRec?.id || null;
  const getDoc = (type) => docs.find(d => d.type === type);

  const docRow = (type, label) => {
    const doc    = getDoc(type);
    const signed = !!doc?.file_url;
    const status = signed
      ? `<span class="tn-ds tn-ds-signed">Signed</span>`
      : `<span class="tn-ds tn-ds-none">Not uploaded</span>`;
    const viewBtn = signed
      ? `<button class="tn-doc-btn tn-doc-btn-ghost" onclick="_tnViewDoc('${doc.file_url}')">
           <i class="ti ti-eye" style="font-size:10px"></i> View
         </button>`
      : `<button class="tn-doc-btn tn-doc-btn-ghost off">
           <i class="ti ti-eye" style="font-size:10px"></i> View
         </button>`;
    const uploadBtn = tid
      ? `<button class="tn-doc-btn tn-doc-btn-ghost"
           onclick="_tnTriggerUpload('${tid}','${type}')">
           <i class="ti ti-upload" style="font-size:10px"></i>
         </button>`
      : `<button class="tn-doc-btn tn-doc-btn-ghost off" title="Save tenant profile first">
           <i class="ti ti-upload" style="font-size:10px"></i>
         </button>`;
    return `
    <div class="tn-doc-row">
      <span class="tn-doc-name">${esc(label)}</span>
      ${status}
      ${viewBtn}
      ${uploadBtn}
    </div>`;
  };

  return `
  <div class="tn-sec">
    <span class="tn-slbl">Documents<span class="tn-slbl-note"> · generated in rooms tab · upload signed copy here</span></span>
    ${types.includes('mietvertrag')  ? docRow('mietvertrag',        'Mietvertrag')         : ''}
    ${types.includes('kurzzeit')     ? docRow('kurzzeitmietvertrag','Kurzzeitmietvertrag') : ''}
    ${docRow('einzug', 'Übergabe Einzug')}
    ${!types.length ? `<p class="tn-empty">No contract type set — configure in rooms tab.</p>` : ''}
  </div>`;
}


/* ── KAUTION SECTION ── */
function _tnKautionHTML(tenantId, context) {
  const k = (tenantId && _tnKaution[tenantId]) || { received: 0, returned: 0, settled: false };
  const recv    = Number(k.received)  || 0;
  const ret     = Number(k.returned)  || 0;
  const kept    = recv - ret;
  const st      = _tnKautionStatus(recv, ret, k.settled);
  const keptClr = kept === 0 ? '#3B6D11' : 'var(--cc-gold)';
  const prefix  = context + '_' + (tenantId || 'none').replace(/-/g,'').slice(0,8);
  const disabled = tenantId ? '' : 'disabled title="Save tenant profile first"';
  const opacity  = tenantId ? '' : 'opacity:.45;pointer-events:none;';

  const cls = context === 'modal' ? 'tn-msec' : 'tn-sec';
  const lbl = context === 'modal'
    ? `<span class="tn-slbl tn-slbl-gold">Kaution</span>`
    : `<span class="tn-slbl">Kaution</span>`;

  return `
  <div class="${cls}" style="${opacity}">
    ${lbl}
    <div class="tn-k-grid">
      <div class="tn-k-col">
        <span class="tn-k-lbl">Received</span>
        <input class="tn-k-input" type="number" id="kr-${prefix}"
          value="${recv}" ${disabled}
          oninput="_tnCalcKaution('${prefix}','${tenantId}')"/>
      </div>
      <div class="tn-k-col">
        <span class="tn-k-lbl">Returned</span>
        <input class="tn-k-input" type="number" id="kret-${prefix}"
          value="${ret}" ${disabled}
          oninput="_tnCalcKaution('${prefix}','${tenantId}')"/>
      </div>
      <div class="tn-k-col">
        <span class="tn-k-lbl">Kept</span>
        <div class="tn-k-kept" id="kk-${prefix}" style="color:${keptClr}">${_tnFmtEUR(kept)}</div>
      </div>
    </div>
    <div class="tn-k-status-row">
      <span class="tb ${st.cls}" id="ks-${prefix}">${st.label}</span>
      <button class="tn-k-settle${k.settled ? ' on' : ''}" id="kset-${prefix}"
        ${disabled}
        onclick="_tnToggleSettle('${prefix}','${tenantId}')">
        ${k.settled ? 'Settled' : 'Mark settled'}
      </button>
    </div>
    ${!tenantId ? `<p class="tn-empty" style="margin-top:6px">Save tenant profile first to track kaution.</p>` : ''}
  </div>`;
}


/* ── NK SECTION (Pattern B — internal create/view) ── */
function _tnNKHTML(tenantId, context) {
  // If no tenantId yet — show section with disabled state
  if (!tenantId) {
    const cls = context === 'modal' ? 'tn-msec' : 'tn-sec';
    return `
    <div class="${cls}" style="opacity:.45;pointer-events:none;">
      <span class="tn-slbl">NK Abrechnungen<span class="tn-slbl-note"> · create and manage here</span></span>
      <p class="tn-empty">Save tenant profile first to track NK periods.</p>
    </div>`;
  }

  const entries = (_tnNK[tenantId] || []).slice().sort((a,b) => b.period.localeCompare(a.period));
  const openEntries    = entries.filter(e => !e.paid);
  const settledEntries = entries.filter(e => e.paid);
  const cls = context === 'modal' ? 'tn-msec' : 'tn-sec';

  const nkRowHTML = (e) => {
    const created = !!e.amount || !!e.document_url;
    const dotC = created  ? 'tn-dot tn-dot-c'     : 'tn-dot tn-dot-empty tap';
    const dotS = e.sent   ? 'tn-dot tn-dot-s'     : (created ? 'tn-dot tn-dot-empty tap' : 'tn-dot tn-dot-empty');
    const dotP = e.paid   ? 'tn-dot tn-dot-p'     : (e.sent  ? 'tn-dot tn-dot-empty tap' : 'tn-dot tn-dot-empty');

    const dirArrow = e.direction === 'you_pay' ? '↓ You pay' : '↑ Tenant pays';
    let infoHtml = '';
    if (!created) {
      infoHtml = `<span style="color:var(--cc-stone);font-style:italic">Not created yet</span>`;
    } else {
      infoHtml = `<span class="amt">${esc(dirArrow)} · ${_tnFmtEUR(e.amount)}</span>`;
      if (e.sent && !e.paid) infoHtml += ` · <span class="unpaid">Unpaid</span>`;
    }

    const createBtn = !created
      ? `<button class="tn-doc-btn tn-doc-btn-dark"
           data-action="nk-create" data-tenant-id="${e.tenant_id}" data-period="${esc(e.period)}"
           data-nk-id="${e.id}"
           onclick="_tnNkCreate('${e.id}')">
           <i class="ti ti-calculator" style="font-size:10px"></i> Create
         </button>`
      : `<button class="tn-doc-btn tn-doc-btn-ghost" style="margin-right:3px"
           data-action="nk-edit" data-nk-id="${e.id}"
           onclick="_tnNkCreate('${e.id}')">
           <i class="ti ti-calculator" style="font-size:10px"></i>
         </button>
         <button class="tn-doc-btn tn-doc-btn-dark"
           onclick="_tnNkView('${e.id}')">
           <i class="ti ti-eye" style="font-size:10px"></i> View
         </button>`;

    const onDotC = !created ? `onclick="_tnNkCreate('${e.id}')"` : '';
    const onDotS = (created && !e.sent) ? `onclick="_tnNkMarkSent('${e.id}')"` : '';
    const onDotP = (e.sent && !e.paid)  ? `onclick="_tnNkMarkPaid('${e.id}')"` : '';

    return `
    <div class="tn-nk-row" id="nkrow-${e.id}">
      <span class="tn-nk-yr">${esc(e.period)}</span>
      <div class="tn-dots">
        <div class="${dotC}" title="Created" ${onDotC}><i class="ti ti-file"></i></div>
        <div class="${dotS}" title="Sent"    ${onDotS}><i class="ti ti-send"></i></div>
        <div class="${dotP}" title="Paid"    ${onDotP}><i class="ti ti-check"></i></div>
      </div>
      <span class="tn-nk-info" id="nkinfo-${e.id}">${infoHtml}</span>
      ${createBtn}
    </div>`;
  };

  const settledRowHTML = (e) => {
    const dirArrow = e.direction === 'you_pay' ? '↓ Paid' : '↑ Paid';
    return `
    <div class="tn-nk-row">
      <span class="tn-nk-yr done">${esc(e.period)}</span>
      <div class="tn-dots">
        <div class="tn-dot tn-dot-done"><i class="ti ti-file"></i></div>
        <div class="tn-dot tn-dot-done"><i class="ti ti-send"></i></div>
        <div class="tn-dot tn-dot-done"><i class="ti ti-check"></i></div>
      </div>
      <span class="tn-nk-info" style="color:var(--cc-stone)">
        <span style="color:var(--cc-taupe)">${esc(dirArrow)} · ${_tnFmtEUR(e.amount)}</span>
        · <span class="paidlbl" style="opacity:.6">Paid ✓</span>
      </span>
      <button class="tn-doc-btn tn-doc-btn-ghost" onclick="_tnNkView('${e.id}')">
        <i class="ti ti-eye" style="font-size:10px"></i> View
      </button>
    </div>`;
  };

  const stCount   = settledEntries.length;
  const stLabel   = stCount + ' settled ' + (stCount === 1 ? 'year' : 'years');
  const stToggleId = `stog-${tenantId.slice(0,8)}-${context}`;
  const stListId   = `slist-${tenantId.slice(0,8)}-${context}`;

  return `
  <div class="${cls}">
    <span class="tn-slbl">NK Abrechnungen<span class="tn-slbl-note"> · create and manage here</span></span>

    ${openEntries.length ? openEntries.map(nkRowHTML).join('') : ''}
    ${!openEntries.length && !settledEntries.length
      ? `<p class="tn-empty" style="margin-bottom:4px">No NK periods yet</p>` : ''}

    ${stCount > 0 ? `
    <div class="tn-settled-toggle" id="${stToggleId}"
      onclick="_tnToggleSettled('${stToggleId}','${stListId}')">
      <i class="ti ti-chevron-right tn-settled-chev"></i>
      <span class="tn-settled-lbl">${stLabel}</span>
    </div>
    <div class="tn-settled-list" id="${stListId}">
      ${settledEntries.map(settledRowHTML).join('')}
    </div>` : ''}

    <button class="tn-add-nk" onclick="_tnAddNkPeriod('${tenantId}')">
      <i class="ti ti-plus" style="font-size:11px"></i> Add NK period
    </button>
  </div>`;
}


/* ── FORMER TENANTS SECTION ── */
function _tnFormerSectionHTML(roomName, formerRecs, archivedRecs) {
  const visibleFormers  = formerRecs.filter(r => _tnFormerVisible(r));
  const hiddenFormers   = formerRecs.filter(r => !_tnFormerVisible(r));
  const allArchived     = [...hiddenFormers, ...archivedRecs];
  const arcId           = `arc-${esc(roomName.replace(/\s+/g,'_').toLowerCase())}`;

  const formerRowHTML = (rec) => {
    const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '—';
    const period = [_tnFmtDate(rec.mietbeginn), _tnFmtDate(rec.mietende)].filter(Boolean).join(' – ');
    return `
    <div class="tn-former-row" onclick="_tnOpenModal('${rec.id}')">
      <div class="tn-fr-info">
        <div class="tn-fr-name">${esc(name)}</div>
        <div class="tn-fr-period">${esc(period)}</div>
      </div>
      <div class="tn-fr-badges">${_tnFormerBadges(rec.id)}</div>
      <div class="tn-fr-arr"><i class="ti ti-chevron-right"></i></div>
    </div>`;
  };

  const arcRowHTML = (rec) => {
    const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '—';
    const period = [_tnFmtDate(rec.mietbeginn), _tnFmtDate(rec.mietende)].filter(Boolean).join(' – ');
    return `
    <div class="tn-arc-row">
      <div class="tn-arc-info">
        <div class="tn-arc-name">${esc(name)}</div>
        <div class="tn-arc-period">${esc(period)}</div>
      </div>
      <button class="tn-btn-reopen" onclick="_tnReopen('${rec.id}')">Reopen</button>
    </div>`;
  };

  return `
  <div class="tn-sec" style="padding:10px 0 0;border-bottom:none">
    <span class="tn-slbl" style="padding:0 14px;margin-bottom:6px">Former tenants</span>
    ${visibleFormers.length
      ? `<div class="tn-former-rows">${visibleFormers.map(formerRowHTML).join('')}</div>`
      : `<p class="tn-empty" style="padding:0 14px 6px">None with open business</p>`}
  </div>
  <button class="tn-add-former-btn" onclick="_tnAddFormer('${esc(roomName)}')">
    <i class="ti ti-plus" style="font-size:12px"></i> Add former tenant
  </button>
  ${allArchived.length ? `
  <div class="tn-arc-toggle" onclick="_tnToggleArc('${arcId}')">
    <i class="ti ti-archive" style="font-size:13px"></i> Show archived
    <i class="ti ti-chevron-down" style="font-size:12px;margin-left:auto"></i>
  </div>
  <div class="tn-arc-body" id="${arcId}">
    ${allArchived.map(arcRowHTML).join('')}
  </div>` : ''}`;
}


/* ══════════════════════════════════════════════════════════════
   9. MODAL — Former tenant case management
══════════════════════════════════════════════════════════════ */

function _tnOpenModal(tenantId) {
  const rec  = _tnRecords.find(r => r.id === tenantId);
  if (!rec) return;
  _tnModalTenantId = tenantId;

  const name   = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || '—';
  const period = [_tnFmtDate(rec.mietbeginn), _tnFmtDate(rec.mietende)].filter(Boolean).join(' – ');
  const ctype  = rec.contract_type;
  const ctLabel = _tnContractLabel(ctype);

  document.getElementById('tnModalTitle').textContent = name;

  const subEl = document.getElementById('tnModalSub');
  subEl.innerHTML = esc(period) +
    (ctLabel ? ` <span class="tb ${ctype === 'mietvertrag' ? 'tb-mv' : 'tb-kz'}">${esc(ctLabel)}</span>` : '');

  // Delete enabled only when all business is closed
  const delBtn = document.getElementById('tnModalDel');
  delBtn.classList.toggle('on', _tnIsAllDone(tenantId));

  // Build modal body — profile first, then documents, kaution, NK
  document.getElementById('tnModalBody').innerHTML =
    _tnModalProfileHTML(rec) +
    _tnModalDocsHTML(rec) +
    _tnKautionHTML(tenantId, 'modal') +
    _tnNKHTML(tenantId, 'modal');

  document.getElementById('tnModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _tnModalProfileHTML(rec) {
  const fullName = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const ctype    = rec.contract_type;
  const staf     = !!rec.staffelmiete;
  const dKalt    = rec.kaltmiete    != null ? Number(rec.kaltmiete)    : null;
  const dNk      = rec.nebenkosten  != null ? Number(rec.nebenkosten)  : null;
  const dKSoll   = rec.kaution_soll != null ? Number(rec.kaution_soll) : null;
  const dWarm    = (dKalt != null && dNk != null) ? dKalt + dNk : dKalt;

  const ctypeToggle = (type, label) => `
    <button class="tn-ctype-btn ${ctype === type ? 'on' : ''}"
      data-ctype="${type}"
      onclick="_tnModalSetCtype('${rec.id}','${type}',this)">
      ${label}
    </button>`;

  return `
  <div class="tn-msec">
    <span class="tn-slbl tn-slbl-gold">Tenant info</span>
    <div class="tn-ef"><span class="tn-ef-k">Name</span><input data-mf="name" value="${esc(fullName)}" placeholder="Full name"/></div>
    <div class="tn-ef"><span class="tn-ef-k">Email</span><input data-mf="email" type="email" value="${esc(rec.email||'')}" placeholder="tenant@mail.de"/></div>
    <div class="tn-ef"><span class="tn-ef-k">Phone</span><input data-mf="phone" type="tel" value="${esc(rec.phone||'')}" placeholder="+49 …"/></div>
    <div class="tn-ef"><span class="tn-ef-k">Birthday</span><input data-mf="birthday" value="${esc(rec.birthday||'')}" placeholder="DD.MM.YYYY"/></div>
    <div class="tn-ef"><span class="tn-ef-k">Move in</span><input data-mf="mietbeginn" value="${_tnFmtDate(rec.mietbeginn)}" placeholder="DD.MM.YYYY"/></div>
    <div class="tn-ef"><span class="tn-ef-k">Move out</span><input data-mf="mietende" value="${_tnFmtDate(rec.mietende)}" placeholder="DD.MM.YYYY"/></div>
    <div class="tn-ef" style="align-items:flex-start;padding-top:4px">
      <span class="tn-ef-k" style="padding-top:4px">Contract</span>
      <div class="tn-ctype-toggle">
        ${ctypeToggle('mietvertrag','Mietvertrag')}
        ${ctypeToggle('kurzzeit','Kurzzeit')}
      </div>
    </div>

    <div class="tn-fin-divider"></div>
    <div class="tn-slbl" style="margin-bottom:8px">Rent &amp; kaution</div>

    <div class="tn-ef">
      <span class="tn-ef-k">Kaltmiete</span>
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
        <input data-mf="kaltmiete" type="number" value="${dKalt ?? ''}" placeholder="0" oninput="_tnModalUpdateWarm()"/>
        <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">€/mo</span>
      </div>
    </div>
    <div class="tn-ef">
      <span class="tn-ef-k">Nebenkosten</span>
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
        <input data-mf="nebenkosten" type="number" value="${dNk ?? ''}" placeholder="0" oninput="_tnModalUpdateWarm()"/>
        <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">€/mo</span>
      </div>
    </div>
    <div class="tn-ef" style="padding-bottom:2px">
      <span class="tn-ef-k" style="color:var(--cc-stone);font-size:10px">Warmmiete</span>
      <span id="tn-modal-warm" style="font-size:11px;color:var(--cc-gold);font-weight:500">${dWarm != null ? _tnFmtEUR(dWarm) : '—'} <span style="color:var(--cc-stone);font-size:9px">auto-derived</span></span>
    </div>
    <div class="tn-ef">
      <span class="tn-ef-k">Kaution soll</span>
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
        <input data-mf="kaution_soll" type="number" value="${dKSoll ?? ''}" placeholder="0"/>
        <span style="font-size:10px;color:var(--cc-taupe);flex-shrink:0">€</span>
      </div>
    </div>
    <div class="tn-ef">
      <span class="tn-ef-k">Staffelmiete</span>
      <div class="tn-staf-toggle">
        <button class="tn-staf-btn${staf ? ' on' : ''}" onclick="_tnModalStaf(true,this)">Ja</button>
        <button class="tn-staf-btn${!staf ? ' on' : ''}" onclick="_tnModalStaf(false,this)">Nein</button>
      </div>
    </div>

    <div class="tn-save-row" style="margin-top:10px">
      <button class="tn-btn-save" onclick="_tnModalSaveProfile('${rec.id}')">Save info</button>
    </div>
  </div>`;
}

async function _tnModalSaveProfile(tenantId) {
  if (!sbL) return;
  const body = document.getElementById('tnModalBody');
  const btn  = body.querySelector('.tn-btn-save');
  const orig = btn.innerHTML; btn.innerHTML = '…'; btn.disabled = true;

  const nameVal  = body.querySelector('[data-mf="name"]')?.value.trim()     || '';
  const emailVal = body.querySelector('[data-mf="email"]')?.value.trim()    || '';
  const phoneVal = body.querySelector('[data-mf="phone"]')?.value.trim()    || '';
  const bdayVal  = body.querySelector('[data-mf="birthday"]')?.value.trim() || '';
  const beginVal = body.querySelector('[data-mf="mietbeginn"]')?.value.trim() || '';
  const endeVal  = body.querySelector('[data-mf="mietende"]')?.value.trim()   || '';
  const ctypeBtn = body.querySelector('.tn-ctype-btn.on');
  const ctype    = ctypeBtn?.dataset.ctype || null;

  if (!nameVal && !emailVal) {
    const inp = body.querySelector('[data-mf="name"]');
    if (inp) { inp.style.borderColor = '#C4705A'; inp.focus(); }
    btn.innerHTML = orig; btn.disabled = false;
    return;
  }

  const nameParts = nameVal.split(/\s+/);
  const firstName = nameParts.slice(0,-1).join(' ') || nameParts[0] || '';
  const lastName  = nameParts.length > 1 ? nameParts[nameParts.length-1] : '';

  // Financial from modal (modal profile section has these fields)
  const kaltMVal  = parseFloat(body.querySelector('[data-mf="kaltmiete"]')?.value)   || null;
  const nkMVal    = parseFloat(body.querySelector('[data-mf="nebenkosten"]')?.value)  || null;
  const kSollMVal = parseFloat(body.querySelector('[data-mf="kaution_soll"]')?.value) || null;
  const stafMBtn  = body.querySelector('.tn-staf-btn.on');
  const stafMVal  = stafMBtn ? stafMBtn.textContent.trim() === 'Ja' : false;

  const update = {
    first_name:    firstName,
    last_name:     lastName,
    email:         emailVal,
    phone:         phoneVal,
    birthday:      bdayVal,
    mietbeginn:    _tnParseDate(beginVal),
    mietende:      _tnParseDate(endeVal),
    contract_type: ctype,
    kaltmiete:     kaltMVal,
    nebenkosten:   nkMVal,
    kaution_soll:  kSollMVal,
    staffelmiete:  stafMVal,
  };

  const { error } = await sbL.from('tenant_records').update(update).eq('id', tenantId);
  if (error) {
    console.warn('[tenants] modal save error:', error.message);
    btn.innerHTML = 'Error'; btn.disabled = false;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
    return;
  }

  // Update local cache
  const rec = _tnRecords.find(r => r.id === tenantId);
  if (rec) Object.assign(rec, update);

  btn.innerHTML = '✓ Saved'; btn.disabled = false;
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 1500);

  // Update modal title + sub
  const newName = [firstName, lastName].filter(Boolean).join(' ') || '—';
  const period  = [_tnFmtDate(update.mietbeginn), _tnFmtDate(update.mietende)].filter(Boolean).join(' – ');
  document.getElementById('tnModalTitle').textContent = newName;
  const ctLabel = _tnContractLabel(ctype);
  document.getElementById('tnModalSub').innerHTML = esc(period) +
    (ctLabel ? ` <span class="tb ${ctype === 'mietvertrag' ? 'tb-mv' : 'tb-kz'}">${esc(ctLabel)}</span>` : '');

  // Refresh former row badges on card
  _tnRender();
}

function _tnModalSetCtype(tenantId, type, btn) {
  btn.closest('.tn-ctype-toggle').querySelectorAll('.tn-ctype-btn')
    .forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

function _tnModalUpdateWarm() {
  const body = document.getElementById('tnModalBody');
  if (!body) return;
  const kalt = parseFloat(body.querySelector('[data-mf="kaltmiete"]')?.value)   || 0;
  const nk   = parseFloat(body.querySelector('[data-mf="nebenkosten"]')?.value)  || 0;
  const el   = document.getElementById('tn-modal-warm');
  if (!el) return;
  el.innerHTML = (kalt || nk)
    ? _tnFmtEUR(kalt + nk) + ' <span style="color:var(--cc-stone);font-size:9px">auto-derived</span>'
    : '\u2014 <span style="color:var(--cc-stone);font-size:9px">auto-derived</span>';
}

function _tnModalStaf(val, btn) {
  btn.closest('.tn-staf-toggle').querySelectorAll('.tn-staf-btn')
    .forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

function _tnModalDocsHTML(rec) {
  const docs   = _tnDocs[rec.id] || [];
  const getDoc = (type) => docs.find(d => d.type === type);
  const ctype  = rec.contract_type;

  const docRow = (type, label) => {
    const doc    = getDoc(type);
    const signed = !!doc?.file_url;
    return `
    <div class="tn-doc-row">
      <span class="tn-doc-name">${esc(label)}</span>
      <span class="tn-ds ${signed ? 'tn-ds-signed' : 'tn-ds-none'}">${signed ? 'Signed' : 'Not uploaded'}</span>
      ${signed
        ? `<button class="tn-doc-btn tn-doc-btn-ghost" onclick="_tnViewDoc('${doc.file_url}')"><i class="ti ti-eye" style="font-size:10px"></i> View</button>`
        : `<button class="tn-doc-btn tn-doc-btn-ghost off"><i class="ti ti-eye" style="font-size:10px"></i> View</button>`}
      <button class="tn-doc-btn tn-doc-btn-ghost" onclick="_tnTriggerUpload('${rec.id}','${type}')">
        <i class="ti ti-upload" style="font-size:10px"></i>
      </button>
    </div>`;
  };

  return `
  <div class="tn-msec">
    <span class="tn-slbl">Documents<span class="tn-slbl-note"> · generated in rooms tab · upload signed copy here</span></span>
    ${ctype === 'mietvertrag'  ? docRow('mietvertrag',        'Mietvertrag')          : ''}
    ${ctype === 'kurzzeit'     ? docRow('kurzzeitmietvertrag','Kurzzeitmietvertrag')  : ''}
    ${!ctype                   ? docRow('mietvertrag',        'Mietvertrag')          : ''}
    ${!ctype                   ? docRow('kurzzeitmietvertrag','Kurzzeitmietvertrag')  : ''}
    ${docRow('einzug',  'Übergabe Einzug')}
    ${docRow('auszug',  'Übergabe Auszug')}
  </div>`;
}

function _tnCloseModal() {
  document.getElementById('tnModal').classList.remove('open');
  document.body.style.overflow = '';
  _tnModalTenantId = null;
}

function _tnModalOutside(e) {
  if (e.target === document.getElementById('tnModal')) _tnCloseModal();
}


/* ══════════════════════════════════════════════════════════════
   10. CARD INTERACTIONS
══════════════════════════════════════════════════════════════ */

function _tnToggleCard(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('open');
  if (card.classList.contains('open')) {
    requestAnimationFrame(() => {
      const top    = card.getBoundingClientRect().top + window.scrollY;
      const navH   = document.querySelector('.cc-header')?.offsetHeight || 100;
      window.scrollTo({ top: top - navH - 8, behavior: 'smooth' });
    });
  }
}

function _tnToggleEdit(secId) {
  document.getElementById(secId)?.classList.toggle('editing');
}

function _tnEditOrSave(rid, tenantId) {
  const sec = document.getElementById('cursec-' + rid);
  const btn = document.getElementById('editbtn-' + rid);
  if (!sec || !btn) return;
  const isEditing = sec.classList.contains('editing');
  if (isEditing) {
    // Currently in edit mode — trigger save
    _tnSaveProfile(rid, tenantId);
  } else {
    // Enter edit mode
    sec.classList.add('editing');
    btn.innerHTML = '<i class="ti ti-check" style="font-size:11px"></i> Save';
    btn.style.color = 'var(--cc-ink)';
    btn.style.borderColor = 'var(--cc-ink)';
    // Pre-fill kaution placeholder based on existing dates
    _tnUpdateKautionSoll(rid);
  }
}

// Called after save completes to reset the button
function _tnResetEditBtn(rid) {
  const btn = document.getElementById('editbtn-' + rid);
  if (!btn) return;
  btn.innerHTML = '<i class="ti ti-pencil" style="font-size:11px"></i> Edit';
  btn.style.color = '';
  btn.style.borderColor = '';
}

function _tnCancelEdit(rid) {
  document.getElementById('cursec-' + rid)?.classList.remove('editing');
  _tnResetEditBtn(rid);
}

function _tnToggleArc(id) {
  document.getElementById(id)?.classList.toggle('open');
}

// Live-update Warmmiete derived display in edit form
function _tnUpdateWarm(rid) {
  const sec  = document.getElementById('cursec-' + rid);
  if (!sec) return;
  const kalt = parseFloat(sec.querySelector('[data-f="kaltmiete"]')?.value)   || 0;
  const nk   = parseFloat(sec.querySelector('[data-f="nebenkosten"]')?.value) || 0;
  const el   = document.getElementById('warm-' + rid);
  if (!el) return;
  if (kalt || nk) {
    el.innerHTML = _tnFmtEUR(kalt + nk) + ' <span style="color:var(--cc-stone);font-size:9px">auto-derived</span>';
  } else {
    el.innerHTML = '\u2014 <span style="color:var(--cc-stone);font-size:9px">auto-derived</span>';
  }
}

// Live-update Kaution soll when dates or kaltmiete change
function _tnUpdateKautionSoll(rid) {
  const sec  = document.getElementById('cursec-' + rid);
  if (!sec) return;
  const room = sec.closest('.tc')?.dataset.room;
  if (!room) return;
  const inp  = sec.querySelector('[data-f="kaution_soll"]');
  if (!inp) return;
  // Don't overwrite if user manually typed a value
  if (inp.value.trim() !== '') return;
  const begin = sec.querySelector('[data-f="mietbeginn"]')?.value.trim() || null;
  const ende  = sec.querySelector('[data-f="mietende"]')?.value.trim()   || null;
  const soll  = _tnKautionSoll(room, begin, ende);
  if (soll != null) {
    inp.placeholder = String(soll);
    // Show rule hint
    const hint = sec.querySelector('.tn-kaution-rule-hint');
    if (hint) {
      const r = appRooms?.find(x => x.name === room);
      if (r?.kaution_override && r?.kaution_default) {
        hint.textContent = 'Fixed override';
      } else if (begin && ende) {
        const months = Math.round((new Date(ende.includes('.') ? ende.split('.').reverse().join('-') : ende) - new Date(begin.includes('.') ? begin.split('.').reverse().join('-') : begin)) / (30.44*24*3600*1000));
        hint.textContent = months <= 3 ? `${months} Mon. → 1× Kaltmiete` : `${months} Mon. → 3× Kaltmiete`;
      } else {
        const ctype = _tnRoomContractType(room);
        hint.textContent = ctype === 'kurzzeit' ? 'KZ default → 1× Kaltmiete' : 'MV default → 3× Kaltmiete';
      }
    }
  }
}

// Staffelmiete toggle
function _tnSetStaf(rid, val, btn) {
  btn.closest('.tn-staf-toggle').querySelectorAll('.tn-staf-btn')
    .forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

function _tnToggleSettled(toggleId, listId) {
  document.getElementById(toggleId)?.classList.toggle('open');
  document.getElementById(listId)?.classList.toggle('open');
}


/* ══════════════════════════════════════════════════════════════
   11. PROFILE SAVE
══════════════════════════════════════════════════════════════ */

// Save a brand new tenant record (no existing id — called from blank form)
async function _tnSaveNewTenant(rid, roomName) {
  if (!sbL) return;
  const sec = document.getElementById('cursec-' + rid);
  if (!sec) return;

  const btn = sec.querySelector('.tn-btn-save');
  const orig = btn.innerHTML; btn.innerHTML = '…'; btn.disabled = true;

  const nameVal    = sec.querySelector('[data-f="name"]')?.value.trim()       || '';
  const emailVal   = sec.querySelector('[data-f="email"]')?.value.trim()      || '';
  const phoneVal   = sec.querySelector('[data-f="phone"]')?.value.trim()      || '';
  const bdayVal    = sec.querySelector('[data-f="birthday"]')?.value.trim()   || '';
  const addrVal    = sec.querySelector('[data-f="address"]')?.value.trim()    || '';
  const beginVal   = sec.querySelector('[data-f="mietbeginn"]')?.value.trim() || '';
  const endeVal    = sec.querySelector('[data-f="mietende"]')?.value.trim()   || '';

  if (!nameVal && !emailVal) {
    const nameInp = sec.querySelector('[data-f="name"]');
    if (nameInp) { nameInp.style.borderColor = '#C4705A'; nameInp.focus(); }
    btn.innerHTML = orig; btn.disabled = false;
    return;
  }
  const nameParts = nameVal.split(/\s+/);
  const firstName = nameParts.slice(0,-1).join(' ') || nameParts[0] || '';
  const lastName  = nameParts.length > 1 ? nameParts[nameParts.length-1] : '';
  const mietbeginn = _tnParseDate(beginVal);
  const mietende   = _tnParseDate(endeVal);
  const status     = mietende ? 'former' : 'active';
  const contractType = mietende ? _tnRoomContractType(roomName) : null;

  // Snapshot financial only if creating as former (has mietende)
  const finSnap = mietende ? _tnRoomPricing(roomName) : {};

  const { data, error } = await sbL.from('tenant_records')
    .insert({
      room: roomName, status, contract_type: contractType,
      first_name: firstName, last_name: lastName,
      email: emailVal, phone: phoneVal, birthday: bdayVal,
      address: addrVal, mietbeginn, mietende,
      kaltmiete:    finSnap.kaltmiete   ?? null,
      nebenkosten:  finSnap.nebenkosten ?? null,
      kaution_soll: (parseFloat(sec.querySelector('[data-f="kaution_soll"]')?.value) || null)
                    ?? _tnKautionSoll(roomName, mietbeginn, mietende)
                    ?? null,
      staffelmiete: false,
    })
    .select().single();

  if (error) {
    console.warn('[tenants] create error:', error.message);
    btn.innerHTML = 'Error'; btn.disabled = false;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
    return;
  }

  await _tnEnsureKaution(data.id);
  // Write default password so tenant can log in (delete+insert — lounge_data has no unique constraint)
  if (status === 'active') {
    const defaultPw = roomName.toLowerCase().replace(/\s+/g,'') + '2026';
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(defaultPw));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    await sbL.from('lounge_data').delete().eq('type','password').eq('room', roomName);
    await sbL.from('lounge_data').insert({ type: 'password', room: roomName, body: hash });
  }

  btn.innerHTML = orig; btn.disabled = false;
  await _tnLoad();
}

async function _tnSaveProfile(rid, tenantId) {
  const sec = document.getElementById('cursec-' + rid);
  if (!sec) return;

  // Button may be editbtn- (from tn-acts) or .tn-btn-save (from save row)
  const btn = document.getElementById('editbtn-' + rid) || sec.querySelector('.tn-btn-save');
  if (!btn) return;
  const orig = btn.innerHTML;
  btn.innerHTML = '…'; btn.disabled = true;

  // Collect fields
  const nameVal    = sec.querySelector('[data-f="name"]')?.value.trim()       || '';
  const emailVal   = sec.querySelector('[data-f="email"]')?.value.trim()      || '';
  const phoneVal   = sec.querySelector('[data-f="phone"]')?.value.trim()      || '';
  const bdayVal    = sec.querySelector('[data-f="birthday"]')?.value.trim()   || '';
  const addrVal    = sec.querySelector('[data-f="address"]')?.value.trim()    || '';
  const beginVal   = sec.querySelector('[data-f="mietbeginn"]')?.value.trim() || '';
  const endeVal    = sec.querySelector('[data-f="mietende"]')?.value.trim()   || '';

  // Require at least name or email
  if (!nameVal && !emailVal) {
    const nameInp = sec.querySelector('[data-f="name"]');
    if (nameInp) { nameInp.style.borderColor = '#C4705A'; nameInp.focus(); }
    btn.innerHTML = orig; btn.disabled = false;
    return;
  }

  const nameParts  = nameVal.split(/\s+/);
  const firstName  = nameParts.slice(0,-1).join(' ') || nameParts[0] || '';
  const lastName   = nameParts.length > 1 ? nameParts[nameParts.length-1] : '';

  const mietbeginn = _tnParseDate(beginVal);
  const mietende   = _tnParseDate(endeVal);

  // Financial fields from edit form
  const sec2      = document.getElementById('cursec-' + rid);
  const rec    = _tnRecords.find(r => r.id === tenantId);
  const room   = rec?.room;
  const isTransitioningToFormer = !!(mietende && rec?.status === 'active');

  // Financial fields — always read from form (same edit view for all statuses)
  const stafBtn  = sec?.querySelector('.tn-staf-btn.on');
  const stafVal  = stafBtn ? stafBtn.textContent.trim() === 'Ja' : !!rec?.staffelmiete;
  const kaltVal  = parseFloat(sec?.querySelector('[data-f="kaltmiete"]')?.value)   || null;
  const nkVal    = parseFloat(sec?.querySelector('[data-f="nebenkosten"]')?.value)  || null;
  const kSollVal = parseFloat(sec?.querySelector('[data-f="kaution_soll"]')?.value)
    || _tnKautionSoll(room, beginVal || null, endeVal || null)
    || null;

  const update = {
    first_name:   firstName,
    last_name:    lastName,
    email:        emailVal,
    phone:        phoneVal,
    birthday:     bdayVal,
    address:      addrVal,
    mietbeginn:   mietbeginn,
    mietende:     mietende,
    staffelmiete: stafVal,
    // Store whatever the user typed (null = empty = falls back to live rooms tab in display)
    kaltmiete:    kaltVal,
    nebenkosten:  nkVal,
    kaution_soll: kSollVal,
  };

  if (isTransitioningToFormer) {
    // Transitioning to former: snapshot rooms tab values if user left fields empty
    const snap = _tnRoomPricing(room);
    update.status        = 'former';
    update.contract_type = _tnRoomContractType(room);
    if (!kaltVal)  update.kaltmiete    = snap.kaltmiete    ?? null;
    if (!nkVal)    update.nebenkosten  = snap.nebenkosten  ?? null;
    if (!kSollVal) update.kaution_soll = snap.kaution_soll ?? null;
  }

  if (!sbL) { btn.innerHTML = orig; btn.disabled = false; return; }

  const { error } = await sbL.from('tenant_records').update(update).eq('id', tenantId);

  if (error) {
    console.warn('[tenants] save error:', error.message);
    btn.innerHTML = 'Error'; btn.disabled = false;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
    return;
  }

  // Update local record
  if (rec) Object.assign(rec, update);

  // Update profile cache
  if (update.status !== 'former') {
    _tnProfileCache[room] = {
      firstName: firstName, lastName: lastName,
      email: emailVal, phone: phoneVal,
      birthday: bdayVal, address: addrVal,
    };
  } else {
    delete _tnProfileCache[room];
  }

  btn.innerHTML = orig; btn.disabled = false;
  sec.classList.remove('editing');
  _tnResetEditBtn(rid);

  // Ensure kaution row exists for this tenant
  await _tnEnsureKaution(tenantId);

  // Re-render
  await _tnLoad();
}


/* ══════════════════════════════════════════════════════════════
   12. ADD TENANT / FORMER
══════════════════════════════════════════════════════════════ */

async function _tnAddTenant(roomName) {
  if (!sbL) return;
  const { data, error } = await sbL.from('tenant_records')
    .insert({ room: roomName, status: 'active' })
    .select().single();
  if (error) { console.warn('[tenants] add tenant error:', error.message); return; }
  await _tnEnsureKaution(data.id);
  await _tnLoad();
  // Open edit mode on the new card
  const rid = roomName.replace(/\s+/g,'_').toLowerCase();
  setTimeout(() => {
    document.getElementById('tc-' + rid)?.classList.add('open');
    document.getElementById('cursec-' + rid)?.classList.add('editing');
  }, 100);
}

async function _tnAddFormer(roomName) {
  if (!sbL) return;
  const { data, error } = await sbL.from('tenant_records')
    .insert({ room: roomName, status: 'former', contract_type: _tnRoomContractType(roomName) })
    .select().single();
  if (error) { console.warn('[tenants] add former error:', error.message); return; }
  await _tnEnsureKaution(data.id);
  await _tnLoad();
  // Open modal for the new former tenant
  _tnOpenModal(data.id);
}

async function _tnEnsureKaution(tenantId) {
  if (!sbL || _tnKaution[tenantId]) return;
  const { data } = await sbL.from('kaution')
    .insert({ tenant_id: tenantId, received: 0, returned: 0, settled: false })
    .select().single();
  if (data) _tnKaution[tenantId] = data;
}


/* ══════════════════════════════════════════════════════════════
   13. KAUTION INTERACTIONS
══════════════════════════════════════════════════════════════ */

function _tnCalcKaution(prefix, tenantId) {
  const recv = parseFloat(document.getElementById('kr-'   + prefix)?.value)  || 0;
  const ret  = parseFloat(document.getElementById('kret-' + prefix)?.value) || 0;
  const kept = recv - ret;
  const kkEl = document.getElementById('kk-' + prefix);
  const ksEl = document.getElementById('ks-' + prefix);
  if (kkEl) {
    kkEl.textContent    = _tnFmtEUR(kept);
    kkEl.style.color    = kept === 0 ? '#3B6D11' : 'var(--cc-gold)';
  }
  const k   = _tnKaution[tenantId] || {};
  const st  = _tnKautionStatus(recv, ret, k.settled);
  if (ksEl) { ksEl.textContent = st.label; ksEl.className = 'tb ' + st.cls; }

  // Debounce save to Supabase
  clearTimeout(kkEl?._saveTimer);
  if (kkEl) kkEl._saveTimer = setTimeout(() => _tnSaveKaution(tenantId, recv, ret), 800);
}

async function _tnSaveKaution(tenantId, received, returned) {
  if (!sbL) return;
  // Create kaution row if it doesn't exist yet
  if (!_tnKaution[tenantId]) await _tnEnsureKaution(tenantId);
  const k = _tnKaution[tenantId];
  if (!k?.id) return;
  k.received = received; k.returned = returned;
  await sbL.from('kaution').update({ received, returned }).eq('id', k.id);
  // Refresh former badge if visible
  _tnRefreshFormerBadges(tenantId);
  // Refresh modal delete button
  if (_tnModalTenantId === tenantId) {
    document.getElementById('tnModalDel')?.classList.toggle('on', _tnIsAllDone(tenantId));
  }
}

async function _tnToggleSettle(prefix, tenantId) {
  if (!sbL) return;
  if (!_tnKaution[tenantId]) await _tnEnsureKaution(tenantId);
  const k = _tnKaution[tenantId];
  if (!k?.id) return;
  const on = !k.settled;
  k.settled = on;
  const btn = document.getElementById('kset-' + prefix);
  if (btn) { btn.classList.toggle('on', on); btn.textContent = on ? 'Settled' : 'Mark settled'; }
  const recv = parseFloat(document.getElementById('kr-'   + prefix)?.value) || 0;
  const ret  = parseFloat(document.getElementById('kret-' + prefix)?.value) || 0;
  const st   = _tnKautionStatus(recv, ret, on);
  const ksEl = document.getElementById('ks-' + prefix);
  if (ksEl) { ksEl.textContent = st.label; ksEl.className = 'tb ' + st.cls; }
  await sbL.from('kaution').update({ settled: on }).eq('id', k.id);
  _tnRefreshFormerBadges(tenantId);
  if (_tnModalTenantId === tenantId) {
    document.getElementById('tnModalDel')?.classList.toggle('on', _tnIsAllDone(tenantId));
  }
}


/* ══════════════════════════════════════════════════════════════
   14. NK INTERACTIONS
══════════════════════════════════════════════════════════════ */

async function _tnAddNkPeriod(tenantId) {
  if (!sbL) return;
  // Scope to modal body if open, else document
  const scope = (_tnModalTenantId === tenantId && document.getElementById('tnModal')?.classList.contains('open'))
    ? document.getElementById('tnModalBody')
    : document;
  const btn = scope?.querySelector(`.tn-add-nk[onclick*="${tenantId}"]`);
  if (!btn) return;

  // Build inline period input
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 0 4px;border-top:.5px solid #F0EDE8;margin-top:4px;';
  wrap.innerHTML = `
    <input data-nk-period="1"
      style="flex:1;background:var(--cc-surface);border:var(--cc-border);border-radius:var(--cc-r-sm);
             padding:5px 8px;font-family:'Inter',inherit;font-size:11px;font-weight:300;color:var(--cc-charcoal);line-height:1.4;
             outline:none;border-color:var(--cc-gold);background:var(--cc-white);-webkit-appearance:none;-webkit-text-size-adjust:100%;"
      placeholder="e.g. 2024/25" maxlength="10"/>
    <button style="height:28px;padding:0 11px;background:var(--cc-ink);color:var(--cc-white);
                   border:none;border-radius:var(--cc-r-sm);font-size:9px;font-weight:600;
                   letter-spacing:.06em;text-transform:uppercase;cursor:pointer;font-family:inherit;"
      onclick="_tnConfirmAddNk('${tenantId}',this.parentNode.querySelector('[data-nk-period]'))">Add</button>
    <button style="height:28px;padding:0 8px;background:none;color:var(--cc-stone);
                   border:var(--cc-border);border-radius:var(--cc-r-sm);font-size:9px;
                   font-weight:600;letter-spacing:.06em;text-transform:uppercase;
                   cursor:pointer;font-family:inherit;"
      onclick="_tnCancelAddNk(this.parentNode,'${tenantId}')">Cancel</button>`;
  btn.style.display = 'none';
  btn.parentNode.insertBefore(wrap, btn);
  wrap.querySelector('input').focus();
}

async function _tnConfirmAddNk(tenantId, inp) {
  if (!inp) return;
  const period = inp.value.trim();
  if (!period) { inp.focus(); return; }
  if (!sbL) return;

  const { data, error } = await sbL.from('nk_entries')
    .insert({ tenant_id: tenantId, period, sent: false, paid: false })
    .select().single();
  if (error) { console.warn('[tenants] add NK error:', error.message); return; }

  if (!_tnNK[tenantId]) _tnNK[tenantId] = [];
  _tnNK[tenantId].push(data);

  // Re-render relevant section
  if (_tnModalTenantId === tenantId) {
    _tnOpenModal(tenantId);
  } else {
    _tnRender();
  }
}

function _tnCancelAddNk(wrap, tenantId) {
  if (!wrap) return;
  const scope = (_tnModalTenantId === tenantId && document.getElementById('tnModal')?.classList.contains('open'))
    ? document.getElementById('tnModalBody') : document;
  const btn = scope?.querySelector(`.tn-add-nk[onclick*="${tenantId}"]`);
  if (btn) btn.style.display = '';
  wrap.remove();
}

// Placeholder — will open NK calculator when built
function _tnNkCreate(nkId) {
  // TODO: open NK calculator with nkId context
  // On save, calculator writes amount + direction + document_url to nk_entries
  alert('NK calculator — coming soon.\n\nWhen built, this will open the calculator for this period.');
}

function _tnNkView(nkId) {
  const entry = Object.values(_tnNK).flat().find(e => e.id === nkId);
  if (!entry?.document_url) { alert('No document yet.'); return; }
  _tnViewDoc(entry.document_url);
}

async function _tnNkMarkSent(nkId) {
  if (!sbL) return;
  const entry = Object.values(_tnNK).flat().find(e => e.id === nkId);
  if (!entry) return;
  entry.sent = true;
  await sbL.from('nk_entries').update({ sent: true }).eq('id', nkId);

  // Update dot in DOM without full re-render
  const dotS = document.querySelector(`#nkrow-${nkId} .tn-dots .tn-dot:nth-child(2)`);
  if (dotS) {
    dotS.className = 'tn-dot tn-dot-s';
    dotS.removeAttribute('onclick');
    dotS.title = 'Sent';
  }
  const dotP = document.querySelector(`#nkrow-${nkId} .tn-dots .tn-dot:nth-child(3)`);
  if (dotP) {
    dotP.className = 'tn-dot tn-dot-empty tap';
    dotP.setAttribute('onclick', `_tnNkMarkPaid('${nkId}')`);
    dotP.title = 'Paid — tap to mark';
  }
  // Update info
  const infoEl = document.getElementById('nkinfo-' + nkId);
  if (infoEl) {
    const cur = infoEl.querySelector('.amt');
    if (cur && !infoEl.querySelector('.unpaid')) {
      const sp = document.createElement('span');
      sp.className = 'unpaid'; sp.textContent = 'Unpaid';
      infoEl.appendChild(document.createTextNode(' · '));
      infoEl.appendChild(sp);
    }
  }
  _tnRefreshFormerBadges(entry.tenant_id);
}

async function _tnNkMarkPaid(nkId) {
  if (!sbL) return;
  const entry = Object.values(_tnNK).flat().find(e => e.id === nkId);
  if (!entry) return;
  entry.paid = true;
  await sbL.from('nk_entries').update({ paid: true }).eq('id', nkId);
  _tnRefreshFormerBadges(entry.tenant_id);
  if (_tnModalTenantId === entry.tenant_id) {
    document.getElementById('tnModalDel')?.classList.toggle('on', _tnIsAllDone(entry.tenant_id));
  }
  // Full re-render to move row to settled section
  if (_tnModalTenantId === entry.tenant_id) {
    _tnOpenModal(entry.tenant_id);
  } else {
    _tnRender();
  }
}


/* ══════════════════════════════════════════════════════════════
   15. DOCUMENTS — UPLOAD
══════════════════════════════════════════════════════════════ */

function _tnTriggerUpload(tenantId, docType) {
  _tnUploadTenantId = tenantId;
  _tnUploadDocType  = docType;
  const inp = document.getElementById('tnFileInput');
  if (inp) { inp.value = ''; inp.click(); }
}

function _tnViewDoc(fileUrl) {
  if (!fileUrl) return;
  // Get signed URL from Supabase Storage then open
  if (sbL) {
    const { data } = sbL.storage.from('tenant-documents').getPublicUrl(fileUrl);
    if (data?.publicUrl) { window.open(data.publicUrl, '_blank'); return; }
  }
  window.open(fileUrl, '_blank');
}

async function _tnHandleUpload(file) {
  if (!file || !_tnUploadTenantId || !_tnUploadDocType) return;
  if (!sbL) return;

  const rec  = _tnRecords.find(r => r.id === _tnUploadTenantId);
  const room = rec?.room || 'unknown';
  const ext  = file.name.split('.').pop() || 'pdf';
  const path = `${room}/${_tnUploadTenantId}/${_tnUploadDocType}.${ext}`;

  // Upload to Supabase Storage
  const { error: upErr } = await sbL.storage
    .from('tenant-documents')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) { console.warn('[tenants] upload error:', upErr.message); return; }

  // Upsert document row
  const { data: docData, error: docErr } = await sbL.from('tenant_documents')
    .upsert({
      tenant_id:   _tnUploadTenantId,
      type:        _tnUploadDocType,
      file_url:    path,
      uploaded_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,type' })
    .select().single();

  if (docErr) { console.warn('[tenants] doc upsert error:', docErr.message); return; }

  // Update local cache
  if (!_tnDocs[_tnUploadTenantId]) _tnDocs[_tnUploadTenantId] = [];
  const idx = _tnDocs[_tnUploadTenantId].findIndex(d => d.type === _tnUploadDocType);
  if (idx >= 0) _tnDocs[_tnUploadTenantId][idx] = docData;
  else          _tnDocs[_tnUploadTenantId].push(docData);

  // Re-render
  if (_tnModalTenantId === _tnUploadTenantId) {
    _tnOpenModal(_tnUploadTenantId);
  } else {
    _tnRender();
  }
}


/* ══════════════════════════════════════════════════════════════
   16. FORMER TENANT MANAGEMENT
══════════════════════════════════════════════════════════════ */

async function _tnMarkDone() {
  const id = _tnModalTenantId;
  if (!id || !sbL) return;
  await sbL.from('tenant_records').update({ done: true, status: 'archived' }).eq('id', id);
  const rec = _tnRecords.find(r => r.id === id);
  if (rec) { rec.done = true; rec.status = 'archived'; }
  _tnCloseModal();
  _tnRender();
}

async function _tnReopen(tenantId) {
  if (!sbL) return;
  await sbL.from('tenant_records').update({ done: false, status: 'former' }).eq('id', tenantId);
  const rec = _tnRecords.find(r => r.id === tenantId);
  if (rec) { rec.done = false; rec.status = 'former'; }
  _tnRender();
}

function _tnDeleteFormer() {
  const id = _tnModalTenantId;
  if (!id) return;
  if (!_tnIsAllDone(id)) return; // safety: only delete when all done
  const rec = _tnRecords.find(r => r.id === id);
  const name = [rec?.first_name, rec?.last_name].filter(Boolean).join(' ') || 'this tenant';
  _tnDeleteId = id;
  document.getElementById('tnConfirmBody').innerHTML =
    `This will permanently delete <strong>${esc(name)}</strong> and all their records. This cannot be undone.`;
  document.getElementById('tnConfirm').classList.add('open');
}

function _tnCancelDelete() {
  document.getElementById('tnConfirm').classList.remove('open');
  _tnDeleteId = null;
}

async function _tnConfirmDelete() {
  if (!_tnDeleteId || !sbL) return;
  const btn = document.getElementById('tnConfirmOk');
  btn.disabled = true;

  // Supabase cascade deletes kaution, nk_entries, tenant_documents via FK
  const { error } = await sbL.from('tenant_records').delete().eq('id', _tnDeleteId);

  document.getElementById('tnConfirm').classList.remove('open');
  if (!error) {
    _tnRecords    = _tnRecords.filter(r => r.id !== _tnDeleteId);
    delete _tnKaution[_tnDeleteId];
    delete _tnNK[_tnDeleteId];
    delete _tnDocs[_tnDeleteId];
  }
  _tnDeleteId = null;
  btn.disabled = false;
  _tnCloseModal();
  _tnRender();
}


/* ══════════════════════════════════════════════════════════════
   17. BADGE REFRESH (partial DOM update for former rows)
══════════════════════════════════════════════════════════════ */

function _tnRefreshFormerBadges(tenantId) {
  // Update badges on the former row in the card without full re-render
  const rows = document.querySelectorAll('.tn-former-row');
  rows.forEach(row => {
    if (row.getAttribute('onclick')?.includes(tenantId)) {
      const badgesEl = row.querySelector('.tn-fr-badges');
      if (badgesEl) badgesEl.innerHTML = _tnFormerBadges(tenantId);
    }
  });
}


/* ══════════════════════════════════════════════════════════════
   18. PASSWORD RESET
══════════════════════════════════════════════════════════════ */

async function _tnResetPw(room) {
  if (!sbL) { alert('No database connection.'); return; }
  if (!confirm(`Reset password for ${room}? The tenant will need to use the default password to log in.`)) return;
  await sbL.from('lounge_data').delete().eq('type','password').eq('room', room);
  const defaultPw = room.toLowerCase().replace(/\s+/g,'') + '2026';
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(defaultPw));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  await sbL.from('lounge_data').insert({ type: 'password', room, body: hash });
  alert(`Password reset for ${room}. Default: ${defaultPw}`);
}


/* ══════════════════════════════════════════════════════════════
   19. BIRTHDAY NOTICES
      Reads from _tnProfileCache (active tenants only)
══════════════════════════════════════════════════════════════ */

async function checkBirthdays() {
  if (!sbL) return;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  const dedup = 'cc_bday_sent_' + yyyy + '_' + mm + '_' + dd;
  const msgs  = [];

  Object.entries(_tnProfileCache).forEach(([room, p]) => {
    if (!p.birthday) return;
    const b   = p.birthday.trim();
    const dot = b.match(/^(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?$/);
    const iso = b.match(/^\d{4}-(\d{2})-(\d{2})$/);
    let bDay, bMon;
    if (dot)      { bDay = dot[1].padStart(2,'0'); bMon = dot[2].padStart(2,'0'); }
    else if (iso) { bMon = iso[1]; bDay = iso[2]; }
    else return;
    if (bDay === dd && bMon === mm) {
      msgs.push('Happy Birthday' + (p.firstName ? ', ' + p.firstName : '') + ' 🎉🥳');
    }
  });

  if (!msgs.length) { localStorage.removeItem(dedup); return; }
  if (localStorage.getItem(dedup)) return;
  localStorage.setItem(dedup, '1');
  await sbL.from('lounge_data').delete().eq('type','notice');
  await sbL.from('lounge_data').insert({ type:'notice', body: msgs.join(' · '), color:'green' });
  loadNotice?.();
}


/* ══════════════════════════════════════════════════════════════
   20. EVENT BINDS
══════════════════════════════════════════════════════════════ */

function _tnBindCards() {
  // File upload handler (single hidden input reused for all uploads)
  const inp = document.getElementById('tnFileInput');
  if (inp && !inp._tnBound) {
    inp._tnBound = true;
    inp.addEventListener('change', () => {
      if (inp.files?.[0]) _tnHandleUpload(inp.files[0]);
    });
  }
}


/* ══════════════════════════════════════════════════════════════
   21. REALTIME — rooms tab changes
══════════════════════════════════════════════════════════════ */

function _tnWireRealtime() {
  if (_tnRoomsWired) return;
  _tnRoomsWired = true;
  if (typeof onRoomsChange === 'function') {
    onRoomsChange(() => {
      // Vacant/kitchen/contract type changed in rooms tab — re-render card headers
      _tnRender();
    });
  }
}


/* ══════════════════════════════════════════════════════════════
   22. ENTRY POINT
      Called by layout.js every time user switches to Tenants tab.
      Idempotent: re-fetches data, re-renders. Does not re-inject HTML.
══════════════════════════════════════════════════════════════ */

async function loadTenants() {
  // Ensure rooms data is loaded first (appRooms needed for card render)
  if (typeof appRooms !== 'undefined' && !appRooms.length && typeof loadRoomsData === 'function') {
    await loadRoomsData();
  }
  _tnWireRealtime();
  await _tnLoad();
  checkBirthdays();
}
