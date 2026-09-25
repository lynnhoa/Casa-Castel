/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — TENANT KITCHEN TAB
   js/tab-kitchen-tenant.js

   Proof upload: single button → step through 3 photos (trash,
   geschirr, overview) → submit → posts [submission] to chat.
   Button only shown when isMyTurn && status pending|flagged.

   Chat: identical to landlord. Room = currentRoom from auth.js.
   Realtime: kitchen-tenant-rt channel.

   Depends on: constants.js, utils.js, supabase-client.js,
               chat-viewport.js
   ───────────────────────────────────────────────────────────── */

/* ── INJECT HTML ────────────────────────────────────────── */
document.getElementById('tab-kitchen').innerHTML = `


  <!-- ══ MOBILE WRAPPER ══ -->
  <div id="k-mob-wrapper">

    <!-- Rotation progress strip -->
    <div class="k-mob-rot" id="k-mob-rot-strip"></div>

    <!-- Week card -->
    <div class="k-mob-week">
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip pending" id="k-mob-status-chip"></span>
        <div class="k-mob-week-corner-links">
          <button class="k-mob-week-corner-link" onclick="kitchenTenantOpenModal('history')">history</button>
        </div>
      </div>
      <div class="k-mob-week-body">
        <div class="k-mob-week-left">
          <span class="k-mob-week-room" id="k-mob-room-name">—</span>
          <span class="k-mob-week-dates-sm" id="k-mob-dates">—</span>
          <span class="k-mob-absent-note" id="k-mob-absent-note" style="display:none;"></span>
        </div>
        <!-- Upload proof button — shown only when it is tenant's turn -->
        <div id="k-ten-act"></div>
      </div>
    </div>

    <!-- Nudge banner — shown when landlord sends a nudge to this room -->
    <div id="k-ten-nudge-banner" style="display:none;flex-shrink:0;padding:8px 14px;background:#FEFCE8;border-bottom:0.5px solid #EAD96B;align-items:center;gap:8px;">
      <span style="font-size:13px;flex-shrink:0;">⚑</span>
      <span id="k-ten-nudge-banner-text" style="flex:1;font-size:11px;color:#78640A;font-weight:400;"></span>
      <button onclick="_kTenMarkNudgeDone()" style="flex-shrink:0;background:#FEF9C3;border:0.5px solid #EAD96B;border-radius:6px;font-size:10px;font-weight:500;color:#78640A;cursor:pointer;padding:4px 10px;font-family:inherit;white-space:nowrap;">✓ Done</button>
    </div>



    <!-- Chat -->
    <div class="k-mob-chat">
      <div class="k-mob-chat-hdr">
        <span class="k-mob-chat-lbl">Proof &amp; chat</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="k-mob-tlink" onclick="initKitchenMobile()">↺ Refresh</button>
        </div>
      </div>
      <div class="k-mob-feed" id="k-feed-mob"></div>
      <div class="k-mob-compose">
        <input class="k-mob-compose-input" id="k-mob-msg-input" type="text" placeholder="Write to kitchen group…"/>
        <input type="file" id="k-mob-photo-file" accept="image/*" capture="environment" style="display:none;"/>
        <button class="k-mob-camera-btn" id="k-mob-photo-btn" aria-label="Send photo" title="Send photo">
          <i class="ti ti-camera" style="font-size:18px;"></i>
        </button>
      </div>
    </div>

  </div><!-- /#k-mob-wrapper -->

  <!-- Desktop 2-col grid (hidden on mobile via CSS) -->
  <div class="k-desktop-grid">

    <!-- Left column: week card + rotation + history -->
    <div class="k-desktop-left">

      <!-- This week -->
      <div class="k-dsk-section">
        <div class="k-dsk-section-hdr">
          <span class="k-dsk-section-lbl">This week</span>
          <span class="k-mob-status-chip pending" id="k-ten-dsk-chip"></span>
        </div>
        <span class="k-mob-week-room" id="k-ten-dsk-room">—</span>
        <span class="k-mob-week-dates-sm" style="display:block;margin-top:3px;" id="k-ten-dsk-dates">—</span>
        <span class="k-mob-week-absent-note" id="k-ten-dsk-absent-note" style="display:none;margin-top:3px;"></span>
        <div id="k-ten-dsk-act"></div>
      </div>

      <!-- Rotation — rot-tl style matching cleaning tab -->
      <div class="k-dsk-section">
        <div class="k-dsk-section-hdr">
          <span class="k-dsk-section-lbl">Rotation</span>
        </div>
        <div id="k-ten-dsk-rot"></div>
      </div>

      <!-- History -->
      <div class="k-dsk-section" style="border-bottom:none;">
        <div class="k-dsk-section-hdr">
          <span class="k-dsk-section-lbl">History</span>
          <button class="k-dsk-section-link" onclick="kitchenTenantOpenModal('history')">see all ›</button>
        </div>
        <div id="k-ten-dsk-hist"><p class="cc-note">Loading…</p></div>
      </div>

    </div><!-- /.k-desktop-left -->

    <!-- Right column: header + nudge banner + feed + compose -->
    <div class="k-desktop-right">

      <!-- Header -->
      <div class="k-dsk-chat-hdr">
        <span class="k-dsk-chat-lbl">Proof &amp; chat</span>
        <button class="k-dsk-chat-link" onclick="initKitchenMobile()">↺ Refresh</button>
      </div>

      <!-- Nudge banner -->
      <div id="k-ten-dsk-nudge-banner" style="display:none;flex-shrink:0;padding:8px 14px;background:#FEFCE8;border-bottom:0.5px solid #EAD96B;align-items:center;gap:8px;">
        <span style="font-size:12px;flex-shrink:0;color:#A0860E;">⚑</span>
        <span id="k-ten-dsk-nudge-text" style="flex:1;font-size:11px;color:#78640A;font-weight:400;"></span>
        <button onclick="_kTenMarkNudgeDone()" style="flex-shrink:0;background:#FEF9C3;border:0.5px solid #EAD96B;border-radius:6px;font-size:10px;font-weight:500;color:#78640A;cursor:pointer;padding:4px 10px;font-family:inherit;white-space:nowrap;">✓ Done</button>
      </div>

      <!-- Feed -->
      <div class="k-dsk-feed" id="k-ten-dsk-feed"></div>

      <!-- Compose bar — matches lounge desktop style -->
      <div class="k-ten-dsk-compose">
        <input class="k-ten-dsk-compose-input" id="k-ten-dsk-msg-input" type="text" placeholder="Write to kitchen group…"/>
        <input type="file" id="k-ten-dsk-photo-file" accept="image/*" style="display:none;"/>
        <button class="k-ten-dsk-camera" id="k-ten-dsk-photo-btn" aria-label="Send photo" title="Send photo">
          <i class="ti ti-camera" style="font-size:15px;"></i>
        </button>
        <button class="k-ten-dsk-compose-send" id="k-ten-dsk-send-btn" aria-label="Send message">↑</button>
      </div>

    </div><!-- /.k-desktop-right -->

  </div><!-- /.k-desktop-grid -->


  <!-- History modal -->
  <div class="cc-modal-overlay" id="kitchen-tenant-modal-history" onclick="if(event.target===this)kitchenTenantCloseModal('history')">
    <div class="cc-modal-sheet" style="max-height:70vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">History</span>
        <button class="cc-modal-close" onclick="kitchenTenantCloseModal('history')">✕</button>
      </div>
      <div class="cc-modal-body" id="k-ten-history-body"><p class="cc-note">Loading…</p></div>
    </div>
  </div>
`;

/* ── INJECT WIZARD INTO BODY (escapes overflow:hidden on kitchen tab) ── */
(function() {
  const wiz = document.createElement('div');
  wiz.id = 'k-ten-wizard';
  wiz.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;flex-direction:column;align-items:center;justify-content:center;padding:0;';
  wiz.innerHTML = `
    <div style="background:var(--cc-bg);display:flex;flex-direction:column;width:100%;height:100%;max-width:480px;max-height:100%;border-radius:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:0.5px solid var(--cc-rule);flex-shrink:0;">
        <span style="font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--cc-taupe);">Kitchen proof</span>
        <button onclick="_kTenWizCancel()" style="font-size:14px;color:var(--cc-stone);background:none;border:none;cursor:pointer;padding:4px 8px;">✕</button>
      </div>
      <div id="k-ten-wiz-dots" style="display:flex;gap:6px;justify-content:center;padding:12px 0 4px;flex-shrink:0;"></div>
      <div style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;">
        <div id="k-ten-wiz-slide"></div>
      </div>
      <input type="file" id="k-ten-wiz-file" accept="image/*" style="display:none;"/>
      <div style="padding:16px 20px;padding-bottom:max(16px,env(safe-area-inset-bottom,16px));border-top:0.5px solid var(--cc-rule);flex-shrink:0;display:flex;gap:10px;">
        <button id="k-ten-wiz-back-btn" onclick="_kTenWizBack()" style="height:44px;padding:0 18px;background:none;border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-sm);color:var(--cc-taupe);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;">← Back</button>
        <button id="k-ten-wiz-next-btn" onclick="_kTenWizNext()" style="flex:1;height:44px;background:var(--cc-ink);border:none;border-radius:var(--cc-r-sm);color:var(--cc-white);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;opacity:0.4;pointer-events:none;">Next →</button>
      </div>
    </div>`;
  document.body.appendChild(wiz);
})();

/* ── MODAL HELPERS ──────────────────────────────────────── */
function kitchenTenantOpenModal(name) {
  document.getElementById('kitchen-tenant-modal-' + name)?.classList.add('open');
  if (name === 'history') _kTenPopulateHistory();
}
function kitchenTenantCloseModal(name) {
  document.getElementById('kitchen-tenant-modal-' + name)?.classList.remove('open');
}

/* ── LOCAL HELPERS (not in shared utils) ────────────────── */
function _kTenRoomInitials(r) {
  const w = r.split(' ');
  return w.length > 1 ? w[0][0] + w[1][0] : r.slice(0, 2).toUpperCase();
}

async function _kTenCompressImage(file, maxPx = 1280, quality = 0.80) {
  return new Promise(resolve => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function _kTenOpenPhoto(url, label) {
  let overlay = document.getElementById('k-ten-photo-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'k-ten-photo-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;cursor:pointer;';
    overlay.innerHTML = '<img id="k-ten-overlay-img" style="max-width:100%;max-height:90%;border-radius:8px;object-fit:contain;"/>'
      + '<p id="k-ten-overlay-lbl" style="color:#fff;font-size:11px;margin-top:10px;opacity:0.6;text-transform:capitalize;"></p>';
    overlay.addEventListener('click', () => { overlay.style.display = 'none'; });
    document.body.appendChild(overlay);
  }
  document.getElementById('k-ten-overlay-img').src = url;
  document.getElementById('k-ten-overlay-lbl').textContent = label || '';
  overlay.style.display = 'flex';
}

/* ── WEEK GUARD (K1) ────────────────────────────────────── */
// The open tab must always work on the CURRENT week. If a new week started while the
// app was open, reload the kitchen tab first (returns false when it had to reload).
let _kTenReloading = null;
async function _kTenEnsureCurrentWeek() {
  if (!_kTenWeekRow || _kTenWeekRow.week_index === kWeekIdx()) return true;
  if (!_kTenReloading) _kTenReloading = initKitchenMobile().finally(() => { _kTenReloading = null; });
  await _kTenReloading;
  return false;
}

/* ── SUPABASE HELPERS (identical to landlord) ───────────── */
async function _kTenGetWeek(idx) {
  if (!sbL) return null;
  const { data } = await sbL.from('kitchen_weeks').select('*').eq('week_index', idx).maybeSingle();
  return data;
}
async function _kTenGetComments(weekId) {
  if (!sbL) return [];
  const { data } = await sbL.from('kitchen_comments').select('*').eq('week_id', weekId).order('created_at', { ascending: true });
  return data || [];
}
async function _kTenAddComment(weekId, room, text, isFlag) {
  if (!sbL) return;
  await sbL.from('kitchen_comments').insert({ week_id: weekId, room, text, is_flag: !!isFlag });
}

/* Local calendar helpers: a kitchen week is Monday 00:00 to Sunday 23:59 (German time) */
function _kYmd(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function _kAddDays(dt, n) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n); }

/* ── ROTATION STATE HELPER (mirrors landlord) ───────────── */
function _kRotState(opts) {
  const { isNow, isPast, isNext, dbStatus, room, weekStart, absenceRows } = opts;
  // Absence first — explicit absence overrides vacancy, now, next, missed
  if (absenceRows && weekStart) {
    const wStart = _kYmd(weekStart);
    const wEnd   = _kYmd(_kAddDays(weekStart, 6));
    const absent = absenceRows.some(a => a.room === room && a.from_date <= wEnd && a.to_date >= wStart);
    if (absent) return 'absent';
  }
  if (isVacant(room)) return 'skipped';
  if (isNow) {
    if (dbStatus === 'approved') return 'done';
    if (dbStatus === 'missed')   return 'missed';   // landlord marked the current week as missed
    return 'now';
  }
  if (!isPast) return isNext ? 'next' : 'upcoming';
  if (!dbStatus)               return 'none';
  if (dbStatus === 'approved') return 'done';
  if (dbStatus === 'skipped')  return 'skipped';
  if (dbStatus === 'absent')   return 'absent';
  return 'missed';
}

/* ── STATE ──────────────────────────────────────────────── */
let _kTenWeekRow    = null;
let _kTenChannel    = null;
let _kTenMobSending = false;

/* ─────────────────────────────────────────────────────────
   PROOF WIZARD — one slide at a time
   Slide 0 = Trash, 1 = Dishes, 2 = Overview
   Each slide: instruction → take photo → preview + retake
   Back/Next navigate; last slide Next = Submit
   ───────────────────────────────────────────────────────── */
const _kWizSlots = [
  { type: 'trash',    emoji: '🗑️', label: 'Trash',    hint: 'Please take a photo of the emptied trash can.' },
  { type: 'geschirr', emoji: '🍽️', label: 'Dishes',   hint: 'Please take a photo of the sink without any dishes left.' },
  { type: 'overview', emoji: '🏠', label: 'Overview', hint: 'Please take a photo of the full kitchen, cleaned.' },
];
let _kWizBlobs      = [null, null, null];
let _kWizPreviews   = [null, null, null];
let _kWizSubmitting = false;
let _kWizStep       = 0;

function _kTenWizOpen() {
  _kWizBlobs    = [null, null, null];
  _kWizPreviews.forEach(u => u && URL.revokeObjectURL(u));
  _kWizPreviews = [null, null, null];
  _kWizSubmitting = false;
  _kWizStep = 0;
  const fileInput = document.getElementById('k-ten-wiz-file');
  if (fileInput) {
    if (window.innerWidth <= 700) fileInput.setAttribute('capture', 'environment');
    else fileInput.removeAttribute('capture');
  }
  _kTenWizRender();
  document.getElementById('k-ten-wizard').style.display = 'flex';
}

function _kTenWizCancel() {
  document.getElementById('k-ten-wizard').style.display = 'none';
}

function _kTenWizRender() {
  const step     = _kWizStep;
  const slot     = _kWizSlots[step];
  const hasPhoto = !!_kWizBlobs[step];
  const preview  = _kWizPreviews[step];
  const isLast   = step === _kWizSlots.length - 1;

  const dotsEl = document.getElementById('k-ten-wiz-dots');
  if (dotsEl) {
    dotsEl.innerHTML = _kWizSlots.map((_, i) => {
      const bg = i < step ? '#9AC87A' : i === step ? 'var(--cc-gold)' : 'var(--cc-rule)';
      return `<div style="width:24px;height:3px;border-radius:2px;background:${bg};"></div>`;
    }).join('');
  }

  const slideEl = document.getElementById('k-ten-wiz-slide');
  if (slideEl) {
    slideEl.innerHTML =
      `<div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:36px;margin-bottom:8px;">${slot.emoji}</div>
        <p style="font-size:16px;font-weight:500;color:var(--cc-ink);margin-bottom:4px;">${slot.label}</p>
        <p style="font-size:12px;color:var(--cc-taupe);">${slot.hint}</p>
      </div>
      <div onclick="_kTenWizTakePhoto()" style="width:100%;aspect-ratio:3/4;border-radius:var(--cc-r-md);overflow:hidden;border:${hasPhoto ? '1.5px solid var(--cc-gold)' : '1px dashed var(--cc-rule)'};background:var(--cc-surface);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;cursor:pointer;">`
      + (hasPhoto && preview
          ? `<img src="${preview}" style="width:100%;height:100%;object-fit:cover;display:block;" alt="${slot.label}"/>
             <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.45);padding:8px 0;text-align:center;font-size:9px;color:#fff;letter-spacing:0.06em;text-transform:uppercase;">↺ tap to retake</div>`
          : `<i class="ti ti-camera" style="font-size:36px;color:var(--cc-stone);" aria-hidden="true"></i>
             <span style="font-size:11px;color:var(--cc-taupe);margin-top:8px;">Opening camera…</span>`)
      + `</div>`;
  }

  // Auto-fire camera on mobile when no photo taken yet for this slide
  if (window.innerWidth <= 700 && !hasPhoto) {
    setTimeout(() => _kTenWizTakePhoto(), 120);
  }

  const backBtn = document.getElementById('k-ten-wiz-back-btn');
  if (backBtn) backBtn.style.display = step === 0 ? 'none' : '';

  const nextBtn = document.getElementById('k-ten-wiz-next-btn');
  if (nextBtn) {
    nextBtn.textContent         = _kWizSubmitting ? 'Uploading…' : isLast ? '↑ Submit' : 'Next →';
    nextBtn.style.opacity       = hasPhoto ? '1' : '0.4';
    nextBtn.style.pointerEvents = hasPhoto ? 'auto' : 'none';
    nextBtn.onclick             = isLast ? _kTenWizSubmit : _kTenWizNext;
  }
}

function _kTenWizTakePhoto() {
  if (_kWizSubmitting) return;
  const file = document.getElementById('k-ten-wiz-file');
  file.value = '';
  file.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const blob     = await _kTenCompressImage(f);
    const localUrl = URL.createObjectURL(blob);
    if (_kWizPreviews[_kWizStep]) URL.revokeObjectURL(_kWizPreviews[_kWizStep]);
    _kWizBlobs[_kWizStep]    = blob;
    _kWizPreviews[_kWizStep] = localUrl;
    _kTenWizRender();
  };
  file.click();
}

function _kTenWizBack() {
  if (_kWizStep > 0) { _kWizStep--; _kTenWizRender(); }
}

function _kTenWizNext() {
  if (_kWizBlobs[_kWizStep] && _kWizStep < _kWizSlots.length - 1) {
    _kWizStep++;
    _kTenWizRender();
  }
}

async function _kTenWizSubmit() {
  if (_kWizSubmitting) return;
  if (!sbL || !_kTenWeekRow) { alert('No connection. Please refresh.'); return; }
  if (!(await _kTenEnsureCurrentWeek())) {
    document.getElementById('k-ten-wizard').style.display = 'none';
    alert("A new week has started, so the kitchen tab was refreshed. Please check this week's status.");
    return;
  }

  const room = (typeof currentRoom !== 'undefined' ? currentRoom : '') || '';
  _kWizSubmitting = true;

  const submitBtn = document.getElementById('k-ten-wiz-next-btn');
  if (submitBtn) { submitBtn.textContent = 'Uploading 1/3…'; submitBtn.style.pointerEvents = 'none'; }

  try {
    const idx      = kWeekIdx();
    const uploaded = [];
    const total    = _kWizSlots.length;
    let   done     = 0;

    for (let i = 0; i < _kWizSlots.length; i++) {
      const blob = _kWizBlobs[i];
      if (!blob) continue;
      const type = _kWizSlots[i].type;
      const path = 'week-' + idx + '-' + room + '-' + type + '-' + Date.now() + '.jpg';
      if (submitBtn) submitBtn.textContent = 'Uploading ' + (done + 1) + '/' + total + '…';

      // Wrap upload in a 30s timeout so it never hangs indefinitely
      const uploadResult = await Promise.race([
        sbL.storage.from('kitchen-proofs').upload(path, blob, { upsert: true, contentType: 'image/jpeg' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000))
      ]);

      if (uploadResult.error) {
        console.error('Upload error ' + type, uploadResult.error);
        _kWizSubmitting = false;
        _kTenWizRender();
        alert('Photo ' + (done + 1) + ' failed to upload — please try again.');
        return;
      }

      const { data } = sbL.storage.from('kitchen-proofs').getPublicUrl(path);
      uploaded.push({ type, path, url: data.publicUrl });
      done++;
    }

    if (!uploaded.length) {
      alert('Upload failed — please try again.');
      _kWizSubmitting = false;
      _kTenWizRender();
      return;
    }

    // isReupload: was flagged OR already has photos (guards against stale local status)
    const isReupload = _kTenWeekRow.status === 'flagged'
                    || !!(_kTenWeekRow.photos && _kTenWeekRow.photos.length)
                    || !!(_kTenWeekRow.reupload_count);
    const patch = {
      status:       'submitted',
      submitted_at: new Date().toISOString(),
    };
    if (isReupload) {
      // Re-upload: keep original photos column intact — new photos go in the comment only
      patch.reupload_count = (_kTenWeekRow.reupload_count || 0) + 1;
      patch.flagged        = false;
    } else {
      // First upload: write photos to the row
      patch.photos = uploaded;
    }
    const { error: updateErr } = await sbL.from('kitchen_weeks').update(patch).eq('id', _kTenWeekRow.id);
    if (updateErr) {
      console.error('[kitchen] week update failed', JSON.stringify(updateErr));
      alert('Save failed: ' + (updateErr.message || updateErr.code || JSON.stringify(updateErr)));
      _kWizSubmitting = false;
      _kTenWizRender();
      return;
    }

    // Post [submission] comment — this is what the feed renderer reads on both sides
    const commentPayload = JSON.stringify({ photos: uploaded, isReupload });
    await _kTenAddComment(_kTenWeekRow.id, room, '[submission] ' + commentPayload, false);

    // Post a visible system message on resubmit so landlord sees it in the feed
    // even if the realtime UPDATE on kitchen_weeks arrives before the row propagates
    if (isReupload) {
      await _kTenAddComment(_kTenWeekRow.id, room, '[system] ' + room + ' has resubmitted.', false);
    }

    // Close wizard
    document.getElementById('k-ten-wizard').style.display = 'none';
    _kWizSubmitting = false;

    // Patch local state and render immediately from it — no re-fetch.
    // Avoids the race where a fresh DB fetch returns the old row before the write propagates.
    // Realtime subscription fires ~100–800ms later and does the authoritative re-sync.
    _kTenWeekRow = { ..._kTenWeekRow, ...patch };
    await _kTenRenderWeekCard(_kTenWeekRow);
    await _kTenRenderFeed();

  } catch (err) {
    console.error('Proof submit error', err);
    alert('Error submitting — please try again.');
    _kWizSubmitting = false;
    _kTenWizRender();
  }
}

/* ── ACTION BUTTON (upload proof / re-upload) ───────────── */
// Called from _kTenRenderWeekCard with state+freshRow already derived — no extra fetch.
function _kTenRenderActBtnToEl(el, state, freshRow) {
  if (!el) return;
  if (state !== 'now') { el.innerHTML = ''; return; }
  const dbStatus = freshRow ? freshRow.status : null;
  const isDsk = el.id === 'k-ten-dsk-act';
  if (dbStatus === 'flagged') {
    el.innerHTML = isDsk
      ? `<button class="k-ten-upload-pill red" onclick="_kTenWizOpen()"><i class="ti ti-upload" style="font-size:14px;"></i> Re-upload proof</button>`
      : `<button class="k-mob-wact red" onclick="_kTenWizOpen()" aria-label="Re-upload proof"><i class="ti ti-camera-plus"></i><span>Re-upload</span></button>`;
  } else if (!dbStatus || dbStatus === 'pending') {
    el.innerHTML = isDsk
      ? `<button class="k-ten-upload-pill blue" onclick="_kTenWizOpen()"><i class="ti ti-upload" style="font-size:14px;"></i> Upload proof</button>`
      : `<button class="k-mob-wact blue" onclick="_kTenWizOpen()" aria-label="Upload proof"><i class="ti ti-camera-plus"></i><span>Proof</span></button>`;
  } else {
    el.innerHTML = '';
  }
}

/* ── WEEK CARD ──────────────────────────────────────────── */
async function _kTenRenderWeekCard(overrideRow) {
  const wi = _kTenWeekInfo(kWeekIdx()); if (!wi) return;
  const myRoom = (typeof currentRoom !== 'undefined' ? currentRoom : '') || '';
  const isAssigned = wi.room === myRoom;

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
  const dateStr = isAssigned
    ? fmt(wi.start) + ' – ' + fmt(wi.end) + (wi.daysLeft > 0 ? ' · ' + wi.daysLeft + 'd left' : ' · ends today')
    : wi.room + "'s turn · " + fmt(wi.start) + ' – ' + fmt(wi.end);
  document.getElementById('k-mob-room-name').textContent = myRoom;
  document.getElementById('k-mob-dates').textContent = dateStr;
  const dskRoom  = document.getElementById('k-ten-dsk-room');
  const dskDates = document.getElementById('k-ten-dsk-dates');
  if (dskRoom)  dskRoom.textContent  = myRoom;
  if (dskDates) dskDates.textContent = dateStr;

  // If caller passes overrideRow (e.g. after optimistic patch), use it directly — no DB fetch.
  // Otherwise fetch fresh from Supabase as normal.
  let state = null;
  let freshRow = null;
  if (isAssigned) {
    const idx = kWeekIdx();
    let row, absRes;
    if (overrideRow) {
      [row, absRes] = await Promise.all([
        Promise.resolve(overrideRow),
        sbL ? sbL.from('kitchen_absences').select('room,from_date,to_date').then(r => r.data || []) : Promise.resolve([])
      ]);
    } else {
      [row, absRes] = await Promise.all([
        _kTenGetWeek(idx),
        sbL ? sbL.from('kitchen_absences').select('room,from_date,to_date').then(r => r.data || []) : Promise.resolve([])
      ]);
    }
    freshRow = row;
    state = _kRotState({
      isNow:       true,
      isPast:      false,
      dbStatus:    freshRow ? freshRow.status : null,
      room:        wi.room,
      weekStart:   wi.start,
      absenceRows: absRes,
    });
  }

  // Chip
  const _setChip = (el, cls, txt) => { if (el) { el.className = cls; el.textContent = txt; } };
  const chip    = document.getElementById('k-mob-status-chip');
  const dskChip = document.getElementById('k-ten-dsk-chip');
  if (chip || dskChip) {
    if (!isAssigned) {
      _setChip(chip,    'k-mob-status-chip not-your-turn', '— Not your turn');
      _setChip(dskChip, 'k-mob-status-chip not-your-turn', '— Not your turn');
    } else {
      const dbStatus = freshRow ? freshRow.status : null;
      const isResub  = state === 'now' && freshRow && freshRow.reupload_count > 0 && dbStatus !== 'flagged';
      const chipCls = state === 'done'    ? 'approved'
                    : state === 'missed'  ? 'missed'
                    : state === 'absent'  ? 'skipped'
                    : state === 'skipped' ? 'skipped'
                    : dbStatus === 'flagged'                        ? 'flagged'
                    : dbStatus === 'submitted' && isResub           ? 'resubmitted'
                    : dbStatus === 'submitted'                      ? 'submitted'
                    : 'pending';
      const chipTxt = state !== 'now'
        ? ({ done:'✓ Approved', missed:'✗ Missed', absent:'— Away', skipped:'— Skipped' }[state] || 'Pending')
        : dbStatus === 'flagged'       ? '⚑ Redo'
        : isResub                      ? '↑↑ Re-submitted'
        : dbStatus === 'submitted'     ? '↑ Submitted'
        : 'Pending';
      _setChip(chip,    'k-mob-status-chip ' + chipCls, chipTxt);
      _setChip(dskChip, 'k-mob-status-chip ' + chipCls, chipTxt);
    }
  }

  // Action button — same fetch, same state
  const actEl    = document.getElementById('k-ten-act');
  const dskActEl = document.getElementById('k-ten-dsk-act');
  const _setAct = (el) => {
    if (!el) return;
    if (!isAssigned) { el.innerHTML = ''; return; }
    _kTenRenderActBtnToEl(el, state, freshRow);
  };
  _setAct(actEl);
  _setAct(dskActEl);

  const absNote = document.getElementById('k-mob-absent-note');
  const dskAbsNote = document.getElementById('k-ten-dsk-absent-note');
  if (freshRow && freshRow.is_absent) {
    const txt = isAssigned
      ? '📅 You are absent — no proof required'
      : '📅 ' + wi.room + ' is absent — no proof required';
    if (absNote) { absNote.textContent = txt; absNote.style.display = ''; }
    if (dskAbsNote) { dskAbsNote.textContent = txt; dskAbsNote.style.display = ''; }
  } else {
    if (absNote) absNote.style.display = 'none';
    if (dskAbsNote) dskAbsNote.style.display = 'none';
  }
}

/* ── ROTATION STRIP ─────────────────────────────────────── */
function _kTenGetRoomList() {
  const kitchenEnabled = typeof getKitchenRooms === 'function' ? getKitchenRooms() : [];
  if (typeof appRooms !== 'undefined' && appRooms.length > 0) {
    return [...appRooms]
      .filter(r => r.active && kitchenEnabled.includes(r.name))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(r => r.name);
  }
  return kitchenEnabled;
}

function _kTenWeekInfo(idx) {
  if (idx < 0) return null;
  const rot   = _kTenGetRoomList();
  if (!rot.length) return kWeekInfo(idx);
  const room  = rot[idx % rot.length];
  const start = new Date(K_START.getTime() + idx * 7 * 24 * 60 * 60 * 1000);
  const end   = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  end.setHours(23, 59, 59, 999);
  const daysLeft = Math.max(0, Math.ceil((end - new Date()) / (24 * 60 * 60 * 1000)));
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
  return { room, start, end, daysLeft, i: idx, dateRange: fmt(start) + ' – ' + fmt(end) };
}

async function _kTenRenderMobRotation() {
  const el = document.getElementById('k-mob-rot-strip'); if (!el) return;
  const rooms      = _kTenGetRoomList();
  const idx        = kWeekIdx();
  const cyclePos   = ((idx % rooms.length) + rooms.length) % rooms.length;
  const cycleStart = idx - cyclePos;
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);

  const [dbRows, absData] = await Promise.all([
    Promise.all(rooms.map((_, i) => _kTenGetWeek(cycleStart + i))),
    sbL ? sbL.from('kitchen_absences').select('room,from_date,to_date').then(r => r.data || []) : Promise.resolve([])
  ]);

  let approvedCount = 0;
  for (let i = 0; i < cyclePos; i++) { if (dbRows[i] && dbRows[i].status === 'approved') approvedCount++; }
  const greenPct = approvedCount > 0 ? ((approvedCount / rooms.length) * 100).toFixed(1) + '%' : '0%';


  // Find the one true next room — first future slot that isn't absent or skipped
  let trueNextI = -1;
  for (let offset = 1; offset <= rooms.length; offset++) {
    const ni     = (cyclePos + offset) % rooms.length;
    const slot   = cycleStart + cyclePos + offset;
    const nRoom  = rooms[ni];
    const nStart = new Date(K_START.getTime() + slot * 7 * 24 * 60 * 60 * 1000);
    const nWs = _kYmd(nStart);
    const nWe = _kYmd(_kAddDays(nStart, 6));
    const nAbsent  = absData.some(a => a.room === nRoom && a.from_date <= nWe && a.to_date >= nWs);
    const nSkipped = isVacant(nRoom);
    if (!nAbsent && !nSkipped) { trueNextI = ni; break; }
  }
  const items = rooms.map((room, i) => {
    // Rows up to the true "next" row belong to the NEXT round once the rotation wraps
    const inNextRound = trueNextI !== -1 && trueNextI < cyclePos && i <= trueNextI;
    const slotIdx = inNextRound ? cycleStart + rooms.length + i : cycleStart + i;
    const info    = kWeekInfo(Math.max(0, slotIdx));
    const dateStr = info ? fmt(info.start) + '–' + fmt(info.end) : '—';
    const dbRow   = inNextRound ? null : dbRows[i];
    const state   = _kRotState({
      isNow:       i === cyclePos,
      isPast:      !inNextRound && i < cyclePos,
      isNext:      i === trueNextI,
      dbStatus:    dbRow ? dbRow.status : null,
      room,
      weekStart:   info ? info.start : null,
      absenceRows: absData,
    });
    const badgeText = { done:'✓', missed:'✗', skipped:'—', absent:'away', now:'Now', none:'—', next:'Next', upcoming:'—' }[state] || '—';
    return `<div class="k-mob-rot-item ${state}"><span class="k-mob-rot-badge ${state}">${badgeText}</span><span class="k-mob-rot-room">${esc(room)}</span><span class="k-mob-rot-dates">${dateStr}</span></div>`;
  }).join('');

  el.innerHTML = `<div class="k-mob-rot-line"></div><div class="k-mob-rot-line-done" style="width:${greenPct}"></div><div class="k-mob-rot-items">${items}</div>`;

  // Also render desktop rotation list — uses same rot-tl CSS classes as landlord desktop
  const dskRot = document.getElementById('k-ten-dsk-rot');
  if (dskRot) {
    dskRot.innerHTML = '<div class="rot-tl">' + rooms.map((room, i) => {
      // Rows up to the true "next" row belong to the NEXT round once the rotation wraps
      const inNextRound = trueNextI !== -1 && trueNextI < cyclePos && i <= trueNextI;
      const slotIdx  = inNextRound ? cycleStart + rooms.length + i : cycleStart + i;
      const start    = new Date(K_START.getTime() + slotIdx * 7 * 24 * 60 * 60 * 1000);
      const end      = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      const dateStr  = fmt(start) + ' – ' + fmt(end);
      const dbRow    = inNextRound ? null : dbRows[i];
      const state    = _kRotState({ isNow: i === cyclePos, isPast: !inNextRound && i < cyclePos, isNext: i === trueNextI, dbStatus: dbRow ? dbRow.status : null, room, weekStart: start, absenceRows: absData });
      const dotClass = { done:'rot-dot--done', now:'rot-dot--now', missed:'rot-dot--missed', skipped:'rot-dot--skipped', absent:'rot-dot--absent' }[state] || 'rot-dot--next';
      const topLine  = state === 'done' || state === 'now' ? 'rot-line-done'
                     : state === 'skipped' ? 'rot-line-skipped'
                     : state === 'absent'  ? 'rot-line-absent'
                     : state === 'missed'  ? 'rot-line-missed' : 'rot-line-faded';
      const botLine  = state === 'done' && slotIdx < idx - 1 ? 'rot-line-done' : 'rot-line-faded';
      const badge    = {
        done:     '<span class="rot-badge rot-badge--done">Done</span>',
        now:      '<span class="rot-badge rot-badge--now">Now</span>',
        next:     '<span class="rot-badge rot-badge--next">Next</span>',
        missed:   '<span class="rot-badge rot-badge--missed">Missed</span>',
        skipped:  '<span class="rot-badge rot-badge--skipped">Skipped</span>',
        absent:   '<span class="rot-badge rot-badge--absent">Away</span>',
        upcoming: '<span class="rot-badge rot-badge--none">—</span>',
      }[state] || '<span class="rot-badge rot-badge--none">—</span>';
      const rowClass = 'rot-tl-row'
        + (state === 'now'     ? ' rot-tl-row--now'
         : state === 'missed'  ? ' rot-tl-row--missed'
         : state === 'skipped' ? ' rot-tl-row--skipped'
         : state === 'absent'  ? ' rot-tl-row--absent'
         : state === 'next'    ? ' rot-tl-row--next' : '');
      return `<div class="${rowClass}"><div class="rot-spine"><div class="rot-spine-top ${topLine}"></div><div class="rot-dot ${dotClass}"></div><div class="rot-spine-bot ${botLine}"></div></div><div class="rot-tl-body"><div class="rot-tl-info"><p class="rot-tl-room">${esc(room)}</p><p class="rot-tl-dates">${dateStr}</p></div>${badge}</div></div>`;
    }).join('') + '</div>';
  }

  // Also render compact history for desktop sidebar
  _kTenRenderDskHistory();
}

async function _kTenRenderDskHistory() {
  const el = document.getElementById('k-ten-dsk-hist'); if (!el || !sbL) return;
  const idx = kWeekIdx();
  const { data } = await sbL.from('kitchen_weeks').select('*').lte('week_index', idx).order('week_index', { ascending: false }).limit(4);
  if (!data || !data.length) { el.innerHTML = '<p class="cc-note" style="font-size:10px;">No history yet.</p>'; return; }
  el.innerHTML = data.map(w => {
    const dateStr = kWeekDateRange(w.week_index);
    return `<div class="k-dsk-hist-row"><div><div class="k-dsk-hist-room">${esc(w.room)}</div><div class="k-dsk-hist-date">${dateStr}</div></div>${kHistPill(w.status, 'sm')}</div>`;
  }).join('');
}

/* ── FEED SAFETY HELPERS (K2/K3) ────────────────────────── */
// Only real proof-storage URLs are rendered as images; anything else is shown as plain text.
function _kProofUrl(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  return /^https:\/\/[^"'<>\s]+\/storage\/v1\/object\/public\/kitchen-proofs\/[^"'<>]+$/.test(s) ? s : '';
}
// Typed chat text must never look like a system marker ([photo] / [submission] / [system] / ✓ / ↩).
function _kSafeChatText(t) {
  return /^(\[(photo|submission|system)\]|✓|↩)/.test(t) ? '\u200B' + t : t;
}

/* ── FEED RENDERER (identical to landlord, no delete buttons) */
function _kTenBuildFeedHtml(comments, weekRow) {
  const labels = { trash: 'Trash', geschirr: 'Dishes', overview: 'Overview' };
  const lbl    = t => labels[t] || t;
  const events = [];

  const hasSub = comments.some(c => c.text && c.text.startsWith('[submission] '));
  if (!hasSub && weekRow.submitted_at && weekRow.photos && weekRow.photos.length) {
    let photos = weekRow.photos || [];
    if (!photos.length && weekRow.photo_url) photos = [{ url: weekRow.photo_url, type: 'overview' }];
    events.push({ _type:'submission', _ts:new Date(weekRow.submitted_at).getTime(), room:weekRow.room, photos, isReupload:false });
  }
  comments.forEach(c => {
    if (c.text && c.text.startsWith('[submission] ')) {
      try {
        const p = JSON.parse(c.text.slice(13));
        events.push({ _type:'submission', _ts:new Date(c.created_at).getTime(), room:c.room, photos:p.photos||[], isReupload:!!p.isReupload });
      } catch(e) {}
    } else if (c.text && c.text.startsWith('[system] ')) {
      events.push({ _type:'system', _ts:new Date(c.created_at).getTime(), text:c.text.slice(9) });
    } else {
      events.push({ _type:'comment', _ts:new Date(c.created_at).getTime(), ...c });
    }
  });
  events.sort((a, b) => a._ts - b._ts);

  if (!events.length) return '<p class="cc-note" style="padding:8px 0;">No activity yet this week.</p>';

  let flagSeen = false;
  return events.map(ev => {

    if (ev._type === 'submission') {
      const isRe = flagSeen; flagSeen = false;
      const photoStrip = ev.photos && ev.photos.length
        ? '<div style="display:flex;gap:4px;margin-top:8px;">'
          + ev.photos.filter(p => p && _kProofUrl(p.url)).map(p =>
              `<div style="flex:1;min-width:0;aspect-ratio:3/4;border-radius:6px;overflow:hidden;border:0.5px solid var(--cc-rule);position:relative;cursor:pointer;" data-url="${esc(_kProofUrl(p.url))}" data-label="${esc(lbl(p.type))}" onclick="_kTenOpenPhoto(this.dataset.url,this.dataset.label)">`
              + `<img src="${esc(_kProofUrl(p.url))}" alt="${esc(p.type)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'"/>`
              + `<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.5);font-size:8px;font-weight:500;color:#fff;letter-spacing:0.05em;text-transform:uppercase;padding:3px 4px;text-align:center;">${esc(lbl(p.type))}</span>`
              + `</div>`
            ).join('') + '</div>'
        : '';
      const badge = isRe
        ? '<span class="k-reupload-badge">↑ Re-uploaded</span>'
        : '<span style="font-size:9px;font-weight:500;background:#EDF5E8;color:#3A6A1A;border:0.5px solid #9AC87A;border-radius:3px;padding:1px 5px;">↑ Submitted</span>';
      return `<div style="padding:8px 0;border-bottom:0.5px solid var(--cc-rule);">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:500;color:var(--cc-ink);background:var(--cc-surface);border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-pill);padding:2px 9px;">${esc(ev.room)}</span>
          ${badge}<span style="font-size:10px;color:var(--cc-stone);">${fmtTs(ev._ts)}</span>
        </div>${photoStrip}</div>`;
    }

    if (ev._type === 'system') {
      return `<div style="padding:6px 0;border-bottom:0.5px solid var(--cc-rule);display:flex;align-items:center;gap:6px;">
        <span style="font-size:10px;color:var(--cc-taupe);">↑↑</span>
        <span style="font-size:11px;color:var(--cc-ink);flex:1;">${esc(ev.text)}</span>
        <span style="font-size:10px;color:var(--cc-stone);">${fmtTs(ev._ts)}</span>
      </div>`;
    }
    if (ev.is_flag) {
      flagSeen = true;
      return `<div class="k-sys-event"><div class="k-sys-event__line"></div>
        <span class="k-sys-event__text k-sys-event__text--flag">⚑ Re-upload requested · ${fmtTs(ev._ts)}</span>
        <div class="k-sys-event__line"></div></div>`;
    }

    const isSysApproved = ev.text && (ev.text.startsWith('✓ Approved') || ev.text.startsWith('↩ Approval'));
    if (isSysApproved) {
      const isApproved = ev.text.startsWith('✓ Approved');
      return `<div class="k-sys-event"><div class="k-sys-event__line"></div>
        <span class="k-sys-event__text${isApproved ? ' k-sys-event__text--approved' : ''}">
          ${isApproved ? '✓ Approved' : '↩ Approval undone'} · ${fmtTs(ev._ts)}
        </span><div class="k-sys-event__line"></div></div>`;
    }

    if (ev.text && ev.text.startsWith('✓ ') && !ev.text.startsWith('✓ Approved') && !ev.text.startsWith('✓ Approval')) {
      return `<div class="k-sys-event"><div class="k-sys-event__line"></div>
        <span class="k-sys-event__text k-sys-event__text--done">${esc(ev.text)} · ${fmtTs(ev._ts)}</span>
        <div class="k-sys-event__line"></div></div>`;
    }

    if (ev.text && ev.text.startsWith('[photo] ') && _kProofUrl(ev.text.slice(8))) {
      const pUrl = esc(_kProofUrl(ev.text.slice(8)));
      const isCC = ev.room === 'Casa Castel';
      return `<div class="k-chat-row">
        <div class="k-chat-avatar${isCC?' k-chat-avatar--me':''}" ${isCC?'style="background:var(--cc-ink);color:var(--cc-white);"':''}>${_kTenRoomInitials(ev.room)}</div>
        <div style="flex:1;min-width:0;"><div class="k-chat-meta">
          <span class="k-chat-name"${isCC?' style="color:var(--cc-gold);"':''}>${esc(ev.room)}</span>
          <span class="k-chat-time">${fmtTs(ev._ts)}</span></div>
          <div style="margin-top:5px;"><img src="${pUrl}" alt="photo"
            style="max-width:100%;border-radius:6px;display:block;object-fit:contain;cursor:pointer;"
            onclick="_kTenOpenPhoto(this.src,'Photo')" onerror="this.style.display='none'"/></div>
        </div></div>`;
    }

    const isCC = ev.room === 'Casa Castel';
    return `<div class="k-chat-row">
      <div class="k-chat-avatar${isCC?' k-chat-avatar--me':''}" ${isCC?'style="background:var(--cc-ink);color:var(--cc-white);"':''}>${_kTenRoomInitials(ev.room)}</div>
      <div style="flex:1;min-width:0;"><div class="k-chat-meta">
        <span class="k-chat-name"${isCC?' style="color:var(--cc-gold);"':''}>${esc(ev.room)}</span>
        <span class="k-chat-time">${fmtTs(ev._ts)}</span></div>
        <p class="k-chat-text">${esc(ev.text)}</p>
      </div></div>`;

  }).join('');
}

async function _kTenRenderFeed() {
  const row = _kTenWeekRow;
  const empty  = '<p class="cc-note" style="padding:8px 0;">No data.</p>';
  const missed = '<p class="cc-note" style="padding:8px 0;">Week reset — marked as missed.</p>';
  const elMob = document.getElementById('k-feed-mob');
  const elDsk = document.getElementById('k-ten-dsk-feed');
  if (!row) {
    if (elMob) elMob.innerHTML = empty;
    if (elDsk) elDsk.innerHTML = empty;
    return;
  }
  if (row.status === 'missed') {
    if (elMob) elMob.innerHTML = missed;
    if (elDsk) elDsk.innerHTML = missed;
    return;
  }
  const comments = await _kTenGetComments(row.id);
  const html = _kTenBuildFeedHtml(comments, row);
  if (elMob) { elMob.innerHTML = html; scrollToBottom(elMob); }
  if (elDsk) { elDsk.innerHTML = html; scrollToBottom(elDsk); }
}

/* ── HISTORY MODAL ──────────────────────────────────────── */
async function _kTenPopulateHistory() {
  const el = document.getElementById('k-ten-history-body');
  if (!sbL) { el.innerHTML = '<p class="cc-note">Connect Supabase.</p>'; return; }
  const idx = kWeekIdx();
  const { data } = await sbL.from('kitchen_weeks').select('*').lte('week_index', idx).order('week_index', { ascending: false }).limit(12);
  if (!data || !data.length) { el.innerHTML = '<p class="cc-note">No past weeks yet.</p>'; return; }
  el.innerHTML = data.map(w => {
    const dateStr = kWeekDateRange(w.week_index);
    const c  = w.comment_count ? ` · ${w.comment_count} comment${w.comment_count !== 1 ? 's' : ''}` : '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid var(--cc-rule);">
      <div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);">${esc(w.room)}</p>
      <p style="font-size:11px;color:var(--cc-taupe);">${dateStr}${c}</p></div>
      ${kHistPill(w.status)}</div>`;
  }).join('');
}

/* ── SEND — text (identical to landlord, room = currentRoom) */
async function _kTenMobSendMsg() {
  const inp  = document.getElementById('k-mob-msg-input');
  const text = inp.value.trim();
  if (!text || !_kTenWeekRow || _kTenMobSending) return;
  await _kTenEnsureCurrentWeek();
  _kTenMobSending = true; inp.value = '';
  const room = (typeof currentRoom !== 'undefined' ? currentRoom : '') || '';
  const feed = document.getElementById('k-feed-mob');
  if (feed) {
    const tmp = document.createElement('div'); tmp.className = 'k-chat-row'; tmp.id = 'k-mob-optimistic';
    tmp.innerHTML = `<div class="k-chat-avatar">${_kTenRoomInitials(room)}</div>`
      + `<div style="flex:1;min-width:0;"><div class="k-chat-meta">`
      + `<span class="k-chat-name">${esc(room)}</span>`
      + `<span class="k-chat-time" style="opacity:0.5;">sending…</span></div>`
      + `<p class="k-chat-text">${esc(text)}</p></div>`;
    feed.appendChild(tmp); scrollToBottom(feed);
  }
  _kTenAddComment(_kTenWeekRow.id, room, _kSafeChatText(text), false)
    .finally(() => { _kTenMobSending = false; });
}

/* ── SEND — camera photo in chat ────────────────────────── */
async function _kTenSendPhoto(file, feedId) {
  if (!file || !_kTenWeekRow) { alert('No active week.'); return; }
  await _kTenEnsureCurrentWeek();
  if (file.size > 30 * 1024 * 1024) { alert('Max 30MB.'); return; }
  const room       = (typeof currentRoom !== 'undefined' ? currentRoom : '') || '';
  const compressed = await _kTenCompressImage(file);
  const feed       = document.getElementById(feedId);
  const localUrl   = URL.createObjectURL(compressed);
  if (feed) {
    const tmp = document.createElement('div'); tmp.className = 'k-chat-row'; tmp.id = 'k-ten-photo-optimistic';
    tmp.innerHTML = `<div class="k-chat-avatar">${_kTenRoomInitials(room)}</div>`
      + `<div style="flex:1;min-width:0;"><div class="k-chat-meta">`
      + `<span class="k-chat-name">${esc(room)}</span>`
      + `<span class="k-chat-time" style="opacity:0.5;">uploading…</span></div>`
      + `<div style="margin-top:5px;"><img src="${localUrl}" style="max-width:100%;border-radius:6px;object-fit:contain;opacity:0.7;"/></div></div>`;
    feed.appendChild(tmp); scrollToBottom(feed);
  }
  const idx  = kWeekIdx();
  const path = 'week-' + idx + '-' + room + '-chat-' + Date.now() + '.jpg';
  const { error } = await sbL.storage.from('kitchen-proofs').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
  document.getElementById('k-ten-photo-optimistic')?.remove();
  if (error) { console.error('Chat photo upload', error); alert('Upload failed.'); return; }
  const { data } = sbL.storage.from('kitchen-proofs').getPublicUrl(path);
  await _kTenAddComment(_kTenWeekRow.id, room, '[photo] ' + data.publicUrl, false);
}

/* ── REALTIME ───────────────────────────────────────────── */
function _kTenSubscribe(idx) {
  if (_kTenChannel) { sbL.removeChannel(_kTenChannel); _kTenChannel = null; }
  _kTenChannel = sbL.channel('kitchen-tenant-rt')
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'kitchen_weeks' }, async payload => {
      if (!_kTenWeekRow) return;
      if (!(await _kTenEnsureCurrentWeek())) return;   // K1: new week → tab was reloaded
      const fresh = await _kTenGetWeek(kWeekIdx());
      if (!fresh) return;
      _kTenWeekRow = fresh;

      await _kTenRenderWeekCard();
      await _kTenRenderFeed();
      await _kTenRenderMobRotation();
    })
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'kitchen_comments' }, async payload => {
      if (!payload.new || !_kTenWeekRow) return;
      if (!(await _kTenEnsureCurrentWeek())) return;   // K1
      if (payload.new.week_id && payload.new.week_id !== _kTenWeekRow.id) return;
      document.getElementById('k-mob-optimistic')?.remove();
      document.getElementById('k-ten-dsk-optimistic')?.remove();
      await _kTenRenderFeed();
    })
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'kitchen_comments' }, async () => {
      if (!_kTenWeekRow) return;
      if (!(await _kTenEnsureCurrentWeek())) return;   // K1
      await _kTenRenderFeed();
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'lounge_data' }, async payload => {
      const t = payload.new?.type || payload.old?.type;
      const isDelete = payload.eventType === 'DELETE' || (!payload.new?.id && payload.old?.id);
      if (t === 'kitchen_config' && payload.new?.body) { _applyKitchenConfig(payload.new.body); await _kTenRenderWeekCard(); await _kTenRenderMobRotation(); }
      if (t === 'kitchen_nudge' || isDelete) { await _kTenLoadNudgeBanner(); }
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'kitchen_absences' }, async () => {
      await _kTenRenderMobRotation();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, async () => {
      if (typeof loadRoomsData === 'function') await loadRoomsData();
      await _kTenRenderWeekCard();
      await _kTenRenderMobRotation();
    })
    .subscribe();
}

/* ── MAIN INIT ──────────────────────────────────────────── */
async function initKitchenMobile() {
  if (typeof loadRoomsData === 'function') await loadRoomsData();
  await loadKitchenRoomsFromSupabase();

  await _kTenRenderWeekCard();

  const idx  = kWeekIdx(new Date());
  const info = _kTenWeekInfo(Math.max(0, idx));
  if (!sbL) { await _kTenRenderMobRotation(); return; }

  const [, weekRowFresh] = await Promise.all([
    _kTenRenderMobRotation(),
    _kTenGetWeek(idx)
  ]);

  let weekRow = weekRowFresh;
  if (!weekRow) {
    const { data } = await sbL.from('kitchen_weeks')
      .insert({ week_index: idx, room: info.room, status: 'pending' })
      .select().single();
    weekRow = data || (await _kTenGetWeek(idx));
  }
  _kTenWeekRow = weekRow;

  await _kTenRenderWeekCard();
  await _kTenRenderFeed();
  await _kTenLoadNudgeBanner();
  _kTenSubscribe(idx);
}

/* ── NUDGE BANNER ───────────────────────────────────────── */
async function _kTenLoadNudgeBanner() {
  if (!sbL || _kTenNudgeBusy) return;
  const myRoom = (typeof currentRoom !== 'undefined' ? currentRoom : '') || localStorage.getItem('cc_room') || '';
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type', 'kitchen_nudge')
    .order('created_at', { ascending: false })
    .limit(5);
  const banner = document.getElementById('k-ten-nudge-banner');
  const text   = document.getElementById('k-ten-nudge-banner-text');
  if (!banner || !text) return;
  // Find nudge for this room or all
  const nudge = (data || []).find(n => {
    if (n.room !== myRoom && n.room !== 'All') return false;
    return true;
  });
  const dskBanner = document.getElementById('k-ten-dsk-nudge-banner');
  const dskText   = document.getElementById('k-ten-dsk-nudge-text');
  if (!nudge) {
    if (banner) banner.style.display = 'none';
    if (dskBanner) dskBanner.style.display = 'none';
    return;
  }
  const note = nudge.title ? ` · ${nudge.title}` : '';
  const msg  = `${nudge.body}${note}`;
  if (banner) {
    text.textContent         = msg;
    banner.dataset.nudgeBody = nudge.body;
    banner.dataset.nudgeId   = nudge.id;
    banner.dataset.nudgeRoom = nudge.room;
    banner.style.display     = 'flex';
  }
  if (dskBanner && dskText) {
    dskText.textContent          = msg;
    dskBanner.dataset.nudgeBody  = nudge.body;
    dskBanner.dataset.nudgeId    = nudge.id;
    dskBanner.dataset.nudgeRoom  = nudge.room;
    dskBanner.style.display      = 'flex';
  }
}
let _kTenNudgeBusy = false;
async function _kTenMarkNudgeDone() {
  if (_kTenNudgeBusy) return; _kTenNudgeBusy = true;
  try {
    const myRoom = (typeof currentRoom !== 'undefined' ? currentRoom : '') || localStorage.getItem('cc_room') || '';
    const banner    = document.getElementById('k-ten-nudge-banner');
    const nudgeBody = banner?.dataset.nudgeBody || '';
    const nudgeId   = banner?.dataset.nudgeId   || '';
    const resolvedMap = {
      'Trash not taken out': 'Trash taken out',
      'Dishes not clean':    'Dishes cleaned',
      'Fridge not clean':    'Fridge cleaned',
    };
    const resolved = resolvedMap[nudgeBody] || (nudgeBody || 'Done');
    // Hide banner immediately
    if (banner) {
      banner.style.display = 'none';
      banner.dataset.nudgeId = '';
      banner.dataset.nudgeRoom = '';
      banner.dataset.nudgeBody = '';
    }
    // Post system message to feed
    if (sbL && _kTenWeekRow && nudgeBody) {
      await _kTenAddComment(_kTenWeekRow.id, myRoom, `✓ ${myRoom} — ${resolved} · done`, false);
      await _kTenRenderFeed();
    }
    // Always delete the nudge — first person to tap Done resolves it for everyone
    if (sbL && nudgeId) {
      await sbL.from('lounge_data').delete().eq('id', nudgeId);
    }
  } finally { _kTenNudgeBusy = false; }
}

/* ── WIRE COMPOSE (identical to landlord) ───────────────── */
(function _kTenWireMobSend() {
  const mobInput  = document.getElementById('k-mob-msg-input');
  const mobPhoto  = document.getElementById('k-mob-photo-btn');
  const mobFile   = document.getElementById('k-mob-photo-file');

  mobInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _kTenMobSendMsg(); } });

  mobPhoto?.addEventListener('click', () => mobFile?.click());
  mobFile?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    mobFile.value = ''; mobPhoto.style.opacity = '0.5';
    await _kTenSendPhoto(file, 'k-feed-mob');
    mobPhoto.style.opacity = '';
  });

  wireComposeBlur(mobInput);

  // Desktop compose wiring
  const dskInput  = document.getElementById('k-ten-dsk-msg-input');
  const dskSend   = document.getElementById('k-ten-dsk-send-btn');
  const dskPhoto  = document.getElementById('k-ten-dsk-photo-btn');
  const dskFile   = document.getElementById('k-ten-dsk-photo-file');

  dskInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _kTenDskSendMsg(); }
  });
  dskSend?.addEventListener('click', () => _kTenDskSendMsg());
  dskPhoto?.addEventListener('click', () => dskFile?.click());
  dskFile?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    dskFile.value = ''; dskPhoto.style.opacity = '0.5';
    await _kTenSendPhoto(file, 'k-ten-dsk-feed');
    dskPhoto.style.opacity = '';
  });
})();

async function _kTenDskSendMsg() {
  const inp  = document.getElementById('k-ten-dsk-msg-input');
  const text = inp ? inp.value.trim() : '';
  if (!text || !_kTenWeekRow || _kTenMobSending) return;
  await _kTenEnsureCurrentWeek();
  _kTenMobSending = true; inp.value = '';
  const room = (typeof currentRoom !== 'undefined' ? currentRoom : '') || '';
  const feed = document.getElementById('k-ten-dsk-feed');
  if (feed) {
    const tmp = document.createElement('div'); tmp.className = 'k-chat-row'; tmp.id = 'k-ten-dsk-optimistic';
    tmp.innerHTML = `<div class="k-chat-avatar">${_kTenRoomInitials(room)}</div>`
      + `<div style="flex:1;min-width:0;"><div class="k-chat-meta">`
      + `<span class="k-chat-name">${esc(room)}</span>`
      + `<span class="k-chat-time" style="opacity:0.5;">sending…</span></div>`
      + `<p class="k-chat-text">${esc(text)}</p></div>`;
    feed.appendChild(tmp); scrollToBottom(feed);
  }
  _kTenAddComment(_kTenWeekRow.id, room, _kSafeChatText(text), false)
    .finally(() => { _kTenMobSending = false; });
}

/* ── SHOW KITCHEN TAB IN NAV ────────────────────────────── */
function _kTenShowTabIfEligible() {
  const room = (typeof currentRoom !== 'undefined' ? currentRoom : null)
             || localStorage.getItem('cc_room');
  if (!room) return;
  // Show kitchen tab if room is in kitchen_config (lounge_data) OR has kitchen_enabled in rooms table
  const inKitchenConfig = getKitchenRooms().includes(room);
  const inRoomsTable    = typeof appRooms !== 'undefined'
    && !!appRooms.find(r => r.name === room)?.kitchen_enabled;
  if (inKitchenConfig || inRoomsTable) {
    document.getElementById('kitchenTab')?.style.removeProperty('display');
  }
}
// Load kitchen config from Supabase into kitchenRooms[] memory, then show tab if eligible.
// getKitchenRooms() now reads kitchenRooms[] — no localStorage fallback.
(async function _kTenEnsureTabVisible() {
  await loadKitchenRoomsFromSupabase();
  _kTenShowTabIfEligible();
})();

/* ── WEEK CHANGE WHILE OPEN (K1) ───────────────────────── */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') _kTenEnsureCurrentWeek(); });
setInterval(() => { if (document.visibilityState === 'visible') _kTenEnsureCurrentWeek(); }, 60 * 1000);

/* ── NAV ALIAS ──────────────────────────────────────────── */
var initKitchenMobExtend = initKitchenMobile;
var initKitchen          = initKitchenMobile; // layout.js calls initKitchen on desktop
