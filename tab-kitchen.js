/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v3 — LANDLORD KITCHEN TAB
   js/tab-kitchen.js

   Architecture: one loadKitchen() function, called on init and
   by every realtime event. No mobile/desktop split in JS.
   CSS handles layout. Pattern mirrors tab-cleaning.js exactly.

   PWA KEYBOARD FIX — three layers (unchanged from v2):
   1. initChatViewport() in layout.js covers tab-kitchen.
   2. wireComposeBlur(#k-mob-msg-input) at bottom of this file.
   3. overscroll-behavior:none/.k-mob-feed in casa-castel.css.

   S1 (19.10.2026) · INSTANT BUTTONS — a kitchen button redraws its
   card at once, the buttons stay grey until the save has answered
   (max 15 s), error / no answer → back + toast, chat lines in tap
   order, and an older reload can no longer draw over a newer one.
   Details at _kRun (ACTION HANDLERS).

   S2 (19.10.2026) · FEWER RELOADS — realtime events, reopening the
   app, the new-week check and the reload after a button share one
   reload timer: a burst of changes gives one reload. A new week is
   created only once. Details at _kScheduleReload (MAIN LOAD).

   Depends on: constants.js, utils.js, storage.js,
               supabase-client.js, chat-viewport.js
   ───────────────────────────────────────────────────────────── */

/* ── INJECT HTML ────────────────────────────────────────── */
document.getElementById('tab-kitchen').innerHTML = `

  <!-- Single wrapper — CSS makes it full-width on desktop too -->
  <div id="k-mob-wrapper">

    <!-- Rotation progress strip -->
    <div class="k-mob-rot" id="k-mob-rot-strip"></div>

    <!-- Week card + action buttons -->
    <div class="k-mob-week">
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip pending" id="k-mob-status-chip"></span>
        <div class="k-mob-week-corner-links">
          <button class="k-mob-week-corner-link" onclick="kitchenOpenModal('history')">history</button>
        </div>
      </div>
      <div class="k-mob-week-body">
        <div class="k-mob-week-left">
          <span class="k-mob-week-room" id="k-mob-room-name">—</span>
          <span class="k-mob-week-dates-sm" id="k-mob-dates">—</span>
          <span class="k-note" id="k-mob-note" style="display:none;"></span>
        </div>
        <div class="k-mob-week-acts" id="k-mob-actions"></div>
      </div>
    </div>

    <!-- Last week — shown only while last week still needs a review -->
    <div class="k-last" id="k-mob-last" style="display:none;"></div>

    <!-- Nudge banner -->
    <div id="k-mob-nudge-banner" style="display:none;flex-shrink:0;padding:8px 14px;background:#FEFCE8;border-bottom:0.5px solid #EAD96B;align-items:center;gap:8px;">
      <span style="font-size:13px;flex-shrink:0;">⚑</span>
      <span id="k-mob-nudge-banner-text" style="flex:1;font-size:11px;color:#78640A;font-weight:400;"></span>
      <span id="k-mob-nudge-banner-status" style="font-size:9px;font-weight:500;padding:2px 7px;border-radius:8px;background:#FEF9C3;border:0.5px solid #EAD96B;color:#78640A;white-space:nowrap;flex-shrink:0;"></span>
      <button onclick="_kDismissNudgeBanner()" style="flex-shrink:0;background:none;border:none;font-size:14px;color:#A0860E;cursor:pointer;padding:2px 4px;line-height:1;">✕</button>
    </div>

    <!-- Proof & chat -->
    <div class="k-mob-chat">
      <div class="k-mob-chat-hdr">
        <span class="k-mob-chat-lbl">Proof &amp; chat</span>
        ${ccRefreshBtnHtml('loadKitchen()')}
      </div>
      <div class="k-mob-feed" id="k-feed-mob"></div>
      <div id="k-compose-mob"></div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       DESKTOP GRID — hidden on mobile via CSS (@media max-width:700px)
       Shown on desktop via @media min-width:701px
       All IDs written by the same render functions as mobile.
       ═══════════════════════════════════════════════════════ -->
  <div class="k-desktop-grid">

    <!-- Left column: week card + rotation + nudge compose -->
    <div class="k-desktop-left">

      <!-- Last week — shown only while last week still needs a review -->
      <div class="k-dsk-section" id="k-dsk-last-sec" style="display:none;">
        <div class="k-dsk-section-hdr">
          <span class="k-dsk-section-lbl">Last week</span>
        </div>
        <div id="k-dsk-last"></div>
      </div>

      <!-- This week -->
      <div class="k-dsk-section">
        <div class="k-dsk-section-hdr">
          <span class="k-dsk-section-lbl">This week</span>
          <span class="k-mob-status-chip pending" id="k-dsk-status-chip"></span>
        </div>
        <div class="k-mob-week-body" style="margin-top:0;">
          <div class="k-mob-week-left">
            <span class="k-mob-week-room" id="k-dsk-room-name">—</span>
            <span class="k-mob-week-dates-sm" id="k-dsk-dates">—</span>
            <span class="k-note" id="k-dsk-note" style="display:none;"></span>
          </div>
        </div>
        <div class="k-dsk-act-row" id="k-dsk-actions"></div>
      </div>

      <!-- Rotation list -->
      <div class="k-dsk-section">
        <div class="k-dsk-section-hdr">
          <span class="k-dsk-section-lbl">Rotation</span>
          <button class="k-dsk-section-link" onclick="kitchenOpenModal('history')">history ›</button>
        </div>
        <div id="k-dsk-rot-list"></div>
      </div>

      <!-- Nudge compose — inline on desktop (replaces bottom-sheet modal) -->
      <div class="k-dsk-section k-dsk-nudge-section" style="border-bottom:none;">
        <div class="k-dsk-section-hdr">
          <span class="k-dsk-section-lbl">Send nudge</span>
          <button class="k-dsk-section-link" onclick="kitchenOpenModal('nudgelog')">log ›</button>
        </div>
        <div class="k-nudge-compose-card">
          <p class="k-nudge-sublbl">What's the issue?</p>
          <div class="k-nudge-type-row" id="k-dsk-nudge-type-row">
            <button class="k-nudge-type-chip" data-type="Trash not taken out">
              <span class="k-nudge-chip-icon">🗑</span>
              <span class="k-nudge-chip-label">Trash</span>
            </button>
            <button class="k-nudge-type-chip" data-type="Dishes not clean">
              <span class="k-nudge-chip-icon">🍽</span>
              <span class="k-nudge-chip-label">Dishes</span>
            </button>
            <button class="k-nudge-type-chip" data-type="Fridge not clean">
              <span class="k-nudge-chip-icon">🧊</span>
              <span class="k-nudge-chip-label">Fridge</span>
            </button>
          </div>
          <p class="k-nudge-sublbl" style="margin-top:10px;">Who should see this?</p>
          <div class="k-nudge-to-row" id="k-dsk-nudge-to-row">
            <button class="k-mob-n-chip k-nudge-to-chip" data-to="All">All rooms</button>
          </div>
          <textarea class="issue-note-input k-nudge-note" id="k-dsk-nudge-note" placeholder="Add a note… (optional)" rows="2"></textarea>
          <button class="k-nudge-send-btn" id="k-dsk-nudge-send-btn">Send nudge</button>
        </div>
      </div>

    </div><!-- /.k-desktop-left -->

    <!-- Right column: nudge banner + proof feed + compose -->
    <div class="k-desktop-right">

      <!-- Chat header -->
      <div class="k-dsk-chat-hdr">
        <span class="k-dsk-chat-lbl">Proof &amp; chat</span>
        ${ccRefreshBtnHtml('loadKitchen()')}
      </div>

      <!-- Nudge banner (desktop) -->
      <div id="k-dsk-nudge-banner" style="display:none;flex-shrink:0;padding:7px 14px;background:#FEFCE8;border-bottom:0.5px solid #EAD96B;align-items:center;gap:8px;">
        <span style="font-size:12px;flex-shrink:0;">⚑</span>
        <span id="k-dsk-nudge-banner-text" style="flex:1;font-size:11px;color:#78640A;font-weight:400;"></span>
        <span id="k-dsk-nudge-banner-status" style="font-size:9px;font-weight:500;padding:2px 7px;border-radius:8px;background:#FEF9C3;border:0.5px solid #EAD96B;color:#78640A;white-space:nowrap;flex-shrink:0;"></span>
        <button onclick="_kDismissNudgeBannerDsk()" style="flex-shrink:0;background:none;border:none;font-size:14px;color:#A0860E;cursor:pointer;padding:2px 4px;line-height:1;">✕</button>
      </div>

      <!-- Feed -->
      <div class="k-dsk-feed" id="k-feed-dsk"></div>

      <!-- Compose bar -->
      <div id="k-compose-dsk"></div>

    </div><!-- /.k-desktop-right -->

  </div><!-- /.k-desktop-grid -->

  <!-- History modal -->
  <div class="cc-modal-overlay" id="kitchen-modal-history" onclick="if(event.target===this)kitchenCloseModal('history')">
    <div class="cc-modal-sheet" style="max-height:70vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">History</span>
        <button class="cc-modal-close" onclick="kitchenCloseModal('history')">✕</button>
      </div>
      <div class="cc-modal-body" id="k-mob-history-body"><p class="cc-note">Loading…</p></div>
    </div>
  </div>

  <!-- Nudge modal -->
  <div class="cc-modal-overlay" id="kitchen-modal-nudge" onclick="if(event.target===this)kitchenCloseModal('nudge')">
    <div class="cc-modal-sheet" style="max-height:75vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">Send a nudge</span>
        <button class="cc-modal-close" onclick="kitchenCloseModal('nudge')">✕</button>
      </div>
      <div class="cc-modal-body">
        <p class="k-nudge-sublbl">What's the issue?</p>
        <div class="k-nudge-type-row" id="k-mob-nudge-type-row">
          <button class="k-nudge-type-chip" data-type="Trash not taken out">
            <span class="k-nudge-chip-icon">🗑</span>
            <span class="k-nudge-chip-label">Trash</span>
          </button>
          <button class="k-nudge-type-chip" data-type="Dishes not clean">
            <span class="k-nudge-chip-icon">🍽</span>
            <span class="k-nudge-chip-label">Dishes</span>
          </button>
          <button class="k-nudge-type-chip" data-type="Fridge not clean">
            <span class="k-nudge-chip-icon">🧊</span>
            <span class="k-nudge-chip-label">Fridge</span>
          </button>
        </div>
        <p class="k-nudge-sublbl" style="margin-top:14px;">Who should see this?</p>
        <div class="k-nudge-to-row" id="k-mob-nudge-to-row">
          <button class="k-mob-n-chip k-nudge-to-chip" data-to="All">All rooms</button>
          ${getKitchenRooms().map(r => `<button class="k-mob-n-chip k-nudge-to-chip" data-to="${r}">${r}</button>`).join('')}
        </div>
        <textarea class="issue-note-input k-nudge-note" id="k-mob-nudge-note" placeholder="Add a note… (optional)" rows="2"></textarea>
        <button class="k-nudge-send-btn" id="k-mob-nudge-send-btn">Send nudge</button>
      </div>
    </div>
  </div>

  <!-- Nudge log modal -->
  <div class="cc-modal-overlay" id="kitchen-modal-nudgelog" onclick="if(event.target===this)kitchenCloseModal('nudgelog')">
    <div class="cc-modal-sheet" style="max-height:70vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">Nudge log</span>
        <button class="cc-modal-close" onclick="kitchenCloseModal('nudgelog')">✕</button>
      </div>
      <div class="cc-modal-body" id="k-mob-nudgelog-body"><p class="cc-note">Loading…</p></div>
    </div>
  </div>

  <!-- Flag sheet — why the proof has to be redone -->
  <div class="cc-modal-overlay" id="kitchen-modal-flag" onclick="if(event.target===this)kitchenCloseModal('flag')">
    <div class="cc-modal-sheet" style="max-height:75vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title" id="k-flag-title">Flag proof</span>
        <button class="cc-modal-close" onclick="kitchenCloseModal('flag')">✕</button>
      </div>
      <div class="cc-modal-body">
        <p class="k-nudge-sublbl">What has to be redone?</p>
        <div class="k-flag-reasons" id="k-flag-reasons">
          <button type="button" class="k-mob-n-chip" data-reason="Trash">Trash</button>
          <button type="button" class="k-mob-n-chip" data-reason="Dishes">Dishes</button>
          <button type="button" class="k-mob-n-chip" data-reason="Overview photo unclear">Overview photo unclear</button>
          <button type="button" class="k-mob-n-chip" data-reason="Not clean enough">Not clean enough</button>
        </div>
        <textarea class="issue-note-input k-nudge-note" id="k-flag-note" placeholder="Add a note… (optional)" rows="2"></textarea>
        <p class="k-flag-err" id="k-flag-err" style="display:none;">Pick a reason or write a note.</p>
        <button class="k-nudge-send-btn" id="k-flag-send-btn" onclick="_kFlagConfirm()">Flag — ask for new photos</button>
      </div>
    </div>
  </div>
`;

/* ── MODAL HELPERS ──────────────────────────────────────── */
function kitchenOpenModal(name) {
  document.getElementById('kitchen-modal-' + name)?.classList.add('open');
  if (name === 'history')  _populateKHistory();
  if (name === 'nudgelog') _populateKNudgeLog();
}
function kitchenCloseModal(name) {
  document.getElementById('kitchen-modal-' + name)?.classList.remove('open');
}

/* ── SUPABASE HELPERS ───────────────────────────────────── */
async function _kGetWeek(idx) {
  if (!sbL) return null;
  const { data } = await sbL.from('kitchen_weeks').select('*').eq('week_index', idx).maybeSingle();
  return data;
}
// Actions always write to the exact week that is on screen (by its id)
async function _kUpdateRow(row, patch) {
  if (!sbL || !row) return { error: 'no row' };
  const res = await sbL.from('kitchen_weeks').update(patch).eq('id', row.id);
  if (res.error) alert('Could not save — ' + (res.error.message || 'please try again.'));
  return res;
}
/* D6 (Oct 2026): the same update, also setting "waits for you" (no_auto: no 48h auto-approve).
   Undo → on (you decide) · Flag / Reopen → off (the tenant's next proof gets the normal 48h).
   A database without that column runs the same update without it — the action never fails because of it. */
async function _kUpdateRowAuto(row, patch) {
  if (!sbL || !row) return { error: 'no row' };
  let res = await sbL.from('kitchen_weeks').update(patch).eq('id', row.id);
  if (res.error && 'no_auto' in patch && /no_auto/.test(String(res.error.message || res.error.details || ''))) {
    const p2 = { ...patch }; delete p2.no_auto;
    res = await sbL.from('kitchen_weeks').update(p2).eq('id', row.id);
  }
  if (res.error) alert('Could not save — ' + (res.error.message || 'please try again.'));
  return res;
}
async function _kGetComments(weekId) {
  if (!sbL) return [];
  const { data } = await sbL.from('kitchen_comments').select('*').eq('week_id', weekId).order('created_at', { ascending: true });
  return data || [];
}
async function _kAddComment(weekId, room, text, isFlag) {
  if (!sbL) return;
  await sbL.from('kitchen_comments').insert({ week_id: weekId, room, text, is_flag: !!isFlag });
  // comment_count increment removed — history modal counts from kitchen_comments directly
}
async function _kDeleteComment(commentId) {
  if (!sbL) return;
  await sbL.from('kitchen_comments').delete().eq('id', commentId);
}
async function _kDeleteComments(weekId) {
  if (!sbL || !weekId) return;
  await sbL.from('kitchen_comments').delete().eq('week_id', weekId);
}
/* Status lines in the chat stay neutral — nobody is named (older messages included) */
function _kSysText(t) {
  t = String(t || '').trim();
  if (/^✗ Marked missed/.test(t)) return '✗ Marked missed';
  if (/^✓ Flag removed/.test(t))  return '✓ Redo cancelled';
  return t.replace(/\s+by\s+(the\s+)?(landlord|Casa Castel)\.?$/i, '').replace(/\.$/, '');
}
let _kAutoResetRanFor = null;
const K_HISTORY_WEEKS = 8;    // history keeps the last 8 weeks (current week included)
const K_HISTORY_FROM  = 39;   // history starts with the week 05.10 – 11.10.2026 (first real week; earlier weeks were tests)
const K_NUDGE_LOG_MAX = 20;   // nudge log keeps the newest 20 nudges

/* Storage paths of one week's proof photos (week row + its chat comments) */
function _kWeekPhotoPaths(row, comments) {
  const paths = [];
  if (row.photo_path) paths.push(row.photo_path);
  if (Array.isArray(row.photos)) row.photos.forEach(p => { if (p && p.path) paths.push(p.path); });
  (comments || []).forEach(c => {
    if (!c.text) return;
    if (c.text.startsWith('[submission] ')) {
      try { const d = JSON.parse(c.text.replace('[submission] ', '')); (d.photos || []).forEach(p => { if (p && p.path) paths.push(p.path); }); } catch (e) {}
    } else if (c.text.startsWith('[photo] ')) {
      const url = c.text.replace('[photo] ', '').trim();
      const mi = url.indexOf('kitchen-proofs/');
      if (mi !== -1) paths.push(decodeURIComponent(url.slice(mi + 'kitchen-proofs/'.length)));
    }
  });
  return paths;
}

/* History cap: delete weeks older than the last K_HISTORY_WEEKS — never a week
   of the current rotation cycle (the rotation view reads those rows). Photos and
   chat of the deleted weeks go with them. Nudge log trimmed to the newest 20. */
async function _kTrimHistory(currentIdx) {
  if (!sbL) return;
  const rooms      = _kGetRoomList();
  const cyclePos   = rooms.length ? ((currentIdx % rooms.length) + rooms.length) % rooms.length : 0;
  const cycleStart = currentIdx - cyclePos;
  const keepFrom   = Math.min(currentIdx - (K_HISTORY_WEEKS - 1), cycleStart);

  const { data: old, error } = await sbL.from('kitchen_weeks').select('*').lt('week_index', keepFrom);
  if (error) { console.warn('[kitchen] history trim read:', error.message); }
  else if (old && old.length) {
    const ids   = old.map(r => r.id);
    const paths = [];
    for (const row of old) paths.push(..._kWeekPhotoPaths(row, await _kGetComments(row.id)));
    if (paths.length) { try { await sbL.storage.from('kitchen-proofs').remove(paths); } catch (e) { console.warn('Storage cleanup error', e); } }
    const { error: cErr } = await sbL.from('kitchen_comments').delete().in('week_id', ids);
    if (cErr) console.warn('[kitchen] history trim comments:', cErr.message);
    const { error: wErr } = await sbL.from('kitchen_weeks').delete().in('id', ids);
    if (wErr) console.warn('[kitchen] history trim weeks:', wErr.message);
  }

  const { data: extra } = await sbL.from('lounge_data').select('id')
    .eq('type', 'kitchen_nudge').order('created_at', { ascending: false })
    .range(K_NUDGE_LOG_MAX, K_NUDGE_LOG_MAX + 999);
  if (extra && extra.length) {
    const { error: nErr } = await sbL.from('lounge_data').delete().in('id', extra.map(n => n.id));
    if (nErr) console.warn('[kitchen] nudge log trim:', nErr.message);
  }
}

async function _kAutoReset(currentIdx) {
  // K8: remove proof photos + chat of weeks older than 30 days, then trim history to 8 weeks (runs once per week per landlord session)
  if (!sbL || _kAutoResetRanFor === currentIdx) return;
  _kAutoResetRanFor = currentIdx;
  const THIRTY = 30 * 24 * 60 * 60 * 1000;
  const { data } = await sbL.from('kitchen_weeks').select('*').lt('week_index', currentIdx).order('week_index', { ascending: false });
  if (!data || !data.length) { await _kTrimHistory(currentIdx); await _kCleanupMore(currentIdx); return; }
  const cutoff = Date.now() - THIRTY;
  for (const row of data) {
    const ts = row.submitted_at || row.closed_at || row.created_at;
    if (!ts || new Date(ts).getTime() > cutoff) continue;
    if (!row.photos && !row.photo_path && !row.photo_url && row.closed_at) continue; // already cleaned
    const comments = await _kGetComments(row.id);
    const paths = _kWeekPhotoPaths(row, comments);
    if (paths.length) { try { await sbL.storage.from('kitchen-proofs').remove(paths); } catch (e) { console.warn('Storage cleanup error', e); } }
    if (comments.length) await sbL.from('kitchen_comments').delete().eq('week_id', row.id);
    await sbL.from('kitchen_weeks').update({ photos: null, photo_path: null, photo_url: null, closed_at: row.closed_at || new Date().toISOString() }).eq('id', row.id);
  }
  await _kTrimHistory(currentIdx);   // history cap: last 8 weeks + newest 20 nudges
  await _kCleanupMore(currentIdx);   // Oct 2026: test weeks + every kitchen photo older than 30 days
}

/* Oct 2026 · no proof photo is kept forever (Kitchen):
   · test weeks before 05.10.2026 (K_HISTORY_FROM) are deleted with their chat — once they have left
     the rotation strip, so nothing on screen changes
   · every kitchen PHOTO older than 30 days goes, also leftovers no longer linked to a week, and every
     photo of the test weeks (list from cc_kitchen_cleanup_due, PHOTO-CLEANUP.sql)
   Never the Lounge folder, never a PDF. Nothing here may break the Kitchen tab. */
async function _kCleanupMore(currentIdx) {
  if (!sbL) return;
  try {
    const n = _kGetRoomList().length || 5, back = Math.floor((n - 1) / 2);   // weeks the strip shows back
    const before = Math.min(K_HISTORY_FROM, currentIdx - back);
    const { data: test, error } = await sbL.from('kitchen_weeks').select('*').lt('week_index', before);
    if (!error && test && test.length) {
      const ids = test.map(r => r.id), paths = [];
      for (const row of test) paths.push(..._kWeekPhotoPaths(row, await _kGetComments(row.id)));
      if (paths.length) { try { await sbL.storage.from('kitchen-proofs').remove(paths); } catch (e) {} }
      const { error: cErr } = await sbL.from('kitchen_comments').delete().in('week_id', ids);
      if (!cErr) await sbL.from('kitchen_weeks').delete().in('id', ids);
    }
  } catch (e) { console.warn('[kitchen] test weeks', e); }
  try {
    for (let round = 0; round < 10; round++) {
      const { data: due, error } = await sbL.rpc('cc_kitchen_cleanup_due', { p_limit: 500 });
      if (error || !Array.isArray(due) || !due.length) break;          // SQL not run yet / nothing due
      let gone = 0;
      for (let i = 0; i < due.length; i += 100) {
        const { data: del, error: dErr } = await sbL.storage.from('kitchen-proofs').remove(due.slice(i, i + 100));
        if (dErr) return;
        gone += (del || []).length;
      }
      if (!gone || due.length < 500) break;                             // nothing could be deleted / all done
    }
  } catch (e) { console.warn('[kitchen] photo clean-up', e); }
}

/* ── ROOM LIST + WEEK INFO ──────────────────────────────── */
function _kGetRoomList() {
  const kitchenEnabled = typeof getKitchenRooms === 'function' ? getKitchenRooms() : [];
  if (typeof appRooms !== 'undefined' && appRooms.length > 0) {
    return [...appRooms]
      .filter(r => r.active && kitchenEnabled.includes(r.name))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(r => r.name);
  }
  return kitchenEnabled;
}
function _kWeekInfo(idx) {
  if (idx < 0) return null;
  const rot  = _kGetRoomList();
  if (!rot.length) return kWeekInfo(idx);
  const room = rot[idx % rot.length];
  const start = new Date(K_START.getTime() + idx * 7 * 24 * 60 * 60 * 1000);
  const end   = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  end.setHours(23, 59, 59, 999);
  const daysLeft = Math.max(0, Math.ceil((end - new Date()) / (24 * 60 * 60 * 1000)));
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  return { room, start, end, daysLeft, i: idx, dateRange: fmt(start) + ' – ' + fmt(end) };
}

/* Local calendar helpers: a kitchen week is Monday 00:00 to Sunday 23:59 (German time) */
function _kYmd(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function _kAddDays(dt, n) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n); }

/* ── ROTATION STATE ─────────────────────────────────────── */
// Finished weeks: the saved result wins (set by the Sunday close in the database).
// Current / future weeks: live rules — away only when ONE absence covers Mon–Sun.
function _kRotState(opts) {
  const { isNow, isPast, isNext, dbStatus, room, weekStart, absenceRows } = opts;
  if (isPast) {
    if (dbStatus === 'approved')  return 'done';
    if (dbStatus === 'absent')    return 'absent';
    if (dbStatus === 'skipped')   return 'skipped';
    if (dbStatus === 'submitted') return 'review';   // proof waiting for review / auto-approve
    if (dbStatus === 'missed')    return 'missed';
    // No saved result for this room, or the week isn't closed yet (pending / flagged):
    // same rule as the Monday close — Away, else Vacant, else Missed. Never "No result".
    if (absenceRows && weekStart) {
      const pS = _kYmd(weekStart), pE = _kYmd(_kAddDays(weekStart, 6));
      if (absenceRows.some(a => a.room === room && absCoversWeek(a, pS, pE))) return 'absent';
    }
    if (kVacantInWeek(room, weekStart ? kWeekIdx(weekStart) : kWeekIdx())) return 'skipped';
    return 'missed';
  }
  if (isNow && dbStatus === 'absent')  return 'absent';
  if (isNow && dbStatus === 'skipped') return 'skipped';
  if (absenceRows && weekStart) {
    const wStart = _kYmd(weekStart);
    const wEnd   = _kYmd(_kAddDays(weekStart, 6));
    if (absenceRows.some(a => a.room === room && absCoversWeek(a, wStart, wEnd))) return 'absent';
  }
  if (kVacantInWeek(room, weekStart ? kWeekIdx(weekStart) : kWeekIdx())) return 'skipped';   // vacant = nobody lived there any day of this week
  if (isNow) {
    if (dbStatus === 'approved') return 'done';
    if (dbStatus === 'missed')   return 'missed';   // landlord marked the current week as missed
    return 'now';
  }
  return isNext ? 'next' : 'upcoming';
}

/* Position of this week's room in the rotation — taken from the saved week
   (the database decides the room per week), modulo only as a fallback. */
function _kCyclePos(rooms, idx, weekRow) {
  const n = rooms.length; if (!n) return 0;
  const p = weekRow ? rooms.indexOf(weekRow.room) : -1;
  return p !== -1 ? p : ((idx % n) + n) % n;
}

/* Small formatters shared by the week card + last-week card */
function _kFmtDM(d) { const p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '.' + p(d.getMonth() + 1); }
function _kWeekRange(idx) {
  const s = new Date(K_START.getTime() + idx * 7 * 24 * 60 * 60 * 1000);
  const e = new Date(s.getTime() + 6 * 24 * 60 * 60 * 1000);
  return _kFmtDM(s) + ' – ' + _kFmtDM(e);
}
function _kAutoAt(row) {
  const t = row && (row.submitted_at || row.created_at);
  return t ? new Date(new Date(t).getTime() + 48 * 60 * 60 * 1000) : null;
}
function _kFmtWhen(d) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const p = n => String(n).padStart(2, '0');
  return days[d.getDay()] + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function _kSetNote(ids, text, tone) {
  ids.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = text || '';
    el.className = 'k-note' + (tone ? ' k-note--' + tone : '');
    el.style.display = text ? '' : 'none';
  });
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
  return /^(\[(photo|submission|system|late)\]|✓|↩|✗|⚑)/.test(t) ? '\u200B' + t : t;
}

/* ── SENDER DISPLAY (K14) ───────────────────────────────── */
// Shows the real sender: the tenant's room, or "Casa Castel" (landlord) — same look as the tenant app.
function _kSenderHtml(room) {
  const isCC = room === 'Casa Castel';
  return {
    avatar: `<div class="k-chat-avatar${isCC ? ' k-chat-avatar--me' : ''}"${isCC ? ' style="background:var(--cc-ink);color:var(--cc-white);"' : ''}${ccAvAttrs(room)}>${esc(roomInitials(room || ''))}</div>`,
    name:   `<span class="k-chat-name"${isCC ? ' style="color:var(--cc-gold);"' : ''}${ccNameAttrs(room)}>${esc(ccNameText(room || ''))}</span>`
  };
}

/* Photo strip for a proof submission (3 photos with labels) */
function _kPhotoStrip(photos) {
  const labels = { trash:'Trash', geschirr:'Dishes', overview:'Overview' };
  const lbl    = t => labels[t] || t;
  if (!photos || !photos.length) return '';
  return '<div style="display:flex;gap:4px;margin-top:8px;">'
    + photos.filter(p => p && _kProofUrl(p.url)).map(p =>
        `<div style="flex:1;min-width:0;aspect-ratio:3/4;border-radius:6px;overflow:hidden;border:0.5px solid var(--cc-rule);position:relative;cursor:pointer;" data-url="${esc(_kProofUrl(p.url))}" data-label="${esc(lbl(p.type))}" onclick="openPhotoModal(this.dataset.url,this.dataset.label)">`
        + `<img src="${esc(_kProofUrl(p.url))}" alt="${esc(p.type)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'"/>`
        + `<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.5);font-size:8px;font-weight:500;color:#fff;letter-spacing:0.05em;text-transform:uppercase;padding:3px 4px;text-align:center;">${esc(lbl(p.type))}</span>`
        + `</div>`
      ).join('') + '</div>';
}

/* ── FEED HTML BUILDER ──────────────────────────────────── */
function _kBuildFeedHtml(comments, weekRow) {
  const labels = { trash:'Trash', geschirr:'Dishes', overview:'Overview' };
  const lbl    = t => labels[t] || t;
  const events = [];
  const hasSub = comments.some(c => c.text && c.text.startsWith('[submission] '));
  if (!hasSub && weekRow.submitted_at && weekRow.photos && weekRow.photos.length) {
    events.push({ _type:'submission', _ts:new Date(weekRow.submitted_at).getTime(), room:weekRow.room, photos:weekRow.photos, isReupload:false });
  }
  comments.forEach(c => {
    if (c.text && c.text.startsWith('[submission] ')) {
      try {
        const p = JSON.parse(c.text.slice(13));
        events.push({ _type:'submission', _ts:new Date(c.created_at).getTime(), room:c.room, photos:p.photos||[], isReupload:!!p.isReupload });
      } catch(e) {}
    } else if (c.text && c.text.startsWith('[late] ')) {
      try {
        const p = JSON.parse(c.text.slice(7));
        events.push({ _type:'late', _ts:new Date(c.created_at).getTime(), room:c.room, photos:p.photos||[], week:p.week||'' });
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
    if (ev._type === 'late') {
      return `<div style="padding:8px 0;border-bottom:0.5px solid var(--cc-rule);">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:500;color:var(--cc-ink);background:var(--cc-surface);border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-pill);padding:2px 9px;">${esc(ev.room)}</span>
          <span class="k-late-badge">Late proof · ${esc(ev.week)}</span><span style="font-size:10px;color:var(--cc-stone);">${fmtTs(ev._ts)}</span>
        </div>${_kPhotoStrip(ev.photos)}</div>`;
    }
    if (ev._type === 'submission') {
      const isRe = flagSeen; flagSeen = false;
      const photoStrip = ev.photos && ev.photos.length
        ? '<div style="display:flex;gap:4px;margin-top:8px;">'
          + ev.photos.filter(p => p && _kProofUrl(p.url)).map(p =>
              `<div style="flex:1;min-width:0;aspect-ratio:3/4;border-radius:6px;overflow:hidden;border:0.5px solid var(--cc-rule);position:relative;cursor:pointer;" data-url="${esc(_kProofUrl(p.url))}" data-label="${esc(lbl(p.type))}" onclick="openPhotoModal(this.dataset.url,this.dataset.label)">`
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
      const why = ev.text && ev.text.startsWith('⚑ Redo: ') ? ev.text.slice(2) : 'Re-upload requested';
      return `<div class="k-sys-event" data-comment-id="${ev.id}">
        <div class="k-sys-event__line"></div>
        <span class="k-sys-event__text k-sys-event__text--flag">⚑ ${esc(why)} · ${fmtTs(ev._ts)}</span>
        <button class="k-delete-btn k-delete-btn--sys" title="Delete">✕</button>
        <div class="k-sys-event__line"></div></div>`;
    }
    const isSysApproved = ev.text && (ev.text.startsWith('✓ Approved') || ev.text.startsWith('↩ Approval'));
    if (isSysApproved) {
      const isApproved = ev.text.startsWith('✓ Approved');
      const isAuto     = ev.text.startsWith('✓ Approved automatically');
      return `<div class="k-sys-event" data-comment-id="${ev.id}">
        <div class="k-sys-event__line"></div>
        <span class="k-sys-event__text${isApproved ? ' k-sys-event__text--approved' : ''}">
          ${isApproved ? '✓ Done' : '↩ Approval undone'} · ${fmtTs(ev._ts)}
        </span>
        <div class="k-sys-event__line"></div></div>`;
    }
    if (ev.text && ev.text.startsWith('✗ ')) {
      return `<div class="k-sys-event" data-comment-id="${ev.id}">
        <div class="k-sys-event__line"></div>
        <span class="k-sys-event__text k-sys-event__text--missed">${esc(_kSysText(ev.text))} · ${fmtTs(ev._ts)}</span>
        <div class="k-sys-event__line"></div></div>`;
    }
    if (ev.text && ev.text.startsWith('✓ ') && !ev.text.startsWith('✓ Approved') && !ev.text.startsWith('✓ Approval')) {
      return `<div class="k-sys-event" data-comment-id="${ev.id}">
        <div class="k-sys-event__line"></div>
        <span class="k-sys-event__text k-sys-event__text--done">${esc(_kSysText(ev.text))} · ${fmtTs(ev._ts)}</span>
        <div class="k-sys-event__line"></div></div>`;
    }
    if (ev.text && ev.text.startsWith('[photo] ') && _kProofUrl(ev.text.slice(8))) {
      const pUrl = esc(_kProofUrl(ev.text.slice(8)));
      const who  = _kSenderHtml(ev.room);
      return `<div class="k-chat-row" data-comment-id="${ev.id}">
        ${who.avatar}
        <div style="flex:1;min-width:0;"><div class="k-chat-meta">
          ${who.name}
          <span class="k-chat-time">${fmtTs(ev._ts)}</span></div>
          <div style="margin-top:5px;"><img src="${pUrl}" alt="photo"
            style="max-width:100%;border-radius:6px;display:block;object-fit:contain;cursor:pointer;"
            onclick="openPhotoModal(this.src,'Photo')" onerror="this.style.display='none'"/></div>
        </div>
        <button class="k-delete-btn" title="Delete">✕</button></div>`;
    }
    const who = _kSenderHtml(ev.room);
    return `<div class="k-chat-row" data-comment-id="${ev.id}">
      ${who.avatar}
      <div style="flex:1;min-width:0;"><div class="k-chat-meta">
        ${who.name}
        <span class="k-chat-time">${fmtTs(ev._ts)}</span></div>
        <p class="k-chat-text">${esc(ev.text)}</p>
      </div>
      <button class="k-delete-btn" title="Delete">✕</button></div>`;
  }).join('');
}

/* B18: write a box only when its content really changed (ccSetHTML in direct-save.js) —
   a reload with the same data leaves the screen alone: no blink, photos not reloaded */
function _kSet(el, html) {
  if (!el) return false;
  if (typeof ccSetHTML === 'function') return ccSetHTML(el, html);
  el.innerHTML = html; return true;
}

/* ── FEED RENDER ────────────────────────────────────────── */
let _kFeedSeq = 0;   // S1: only the newest chat render draws — an older, slower one never overwrites it
async function _kRenderFeed(weekRow) {
  const el    = document.getElementById('k-feed-mob'); if (!el) return;
  const elDsk = document.getElementById('k-feed-dsk');
  const seq   = ++_kFeedSeq;
  if (!weekRow) {
    const none = '<p class="cc-note" style="padding:8px 0;">No data.</p>';
    _kSet(el, none);
    _kSet(elDsk, none);
    return;
  }
  const [comments, prevHtml] = await Promise.all([_kGetComments(weekRow.id), _kPrevWeekHtml(weekRow)]);
  if (seq !== _kFeedSeq) return;
  let html = _kBuildFeedHtml(comments, weekRow);
  if (prevHtml) html = prevHtml + _kWeekDivider('This week', weekRow) + html;   // last week first, then this week
  const changed = [_kSet(el, html) ? el : null, _kSet(elDsk, html) ? elDsk : null];
  // Wire delete buttons on both feeds (only a feed that was just redrawn — the others are wired already)
  changed.forEach(feed => {
    if (!feed) return;
    feed.querySelectorAll('[data-comment-id] .k-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const row = btn.closest('[data-comment-id]');
        const id  = row && row.dataset.commentId; if (!id) return;
        if (!(await ccConfirm('Delete this message?', '', 'Delete', true))) return;
        await _kDeleteComment(id);
        await _kRenderFeed(_kWeekRow);
      });
    });
    scrollToBottom(feed);
  });
}

/* ── LAST WEEK IN THE CHAT (Oct 2026) ─────────────────────
   The chat shows last week's proof + messages first, then this week — each under a small
   divider. Always only the week before the current one (it moves on every Monday).
   Display only: the stored data and the 30-day photo clean-up are unchanged. */
function _kWeekDivider(label, row) {
  const pad = n => String(n).padStart(2, '0');
  let range = '';
  if (row && row.week_index != null && typeof K_START !== 'undefined') {
    const s = new Date(K_START.getTime() + row.week_index * 7 * 24 * 60 * 60 * 1000);
    const e = new Date(s.getTime() + 6 * 24 * 60 * 60 * 1000);
    range = pad(s.getDate()) + '.' + pad(s.getMonth() + 1) + '. – ' + pad(e.getDate()) + '.' + pad(e.getMonth() + 1) + '.';
  }
  return `<div class="k-sys-event k-week-div"><div class="k-sys-event__line"></div>
    <span class="k-sys-event__text">${esc(label)}${row && row.room ? ' · ' + esc(row.room) : ''}${range ? ' · ' + range : ''}</span>
    <div class="k-sys-event__line"></div></div>`;
}
async function _kPrevWeekHtml(weekRow) {
  if (!sbL || !weekRow || weekRow.week_index == null) return '';
  try {
    const { data: prev } = await sbL.from('kitchen_weeks').select('*').eq('week_index', weekRow.week_index - 1).maybeSingle();
    if (!prev) return '';
    const comments = await _kGetComments(prev.id);
    const body = _kBuildFeedHtml(comments, prev);
    if (/^<p class="cc-note"/.test(body)) return '';          // nothing happened last week → no section
    return _kWeekDivider('Last week', prev) + body;
  } catch (e) { return ''; }
}

/* ── ROTATION STRIP ─────────────────────────────────────── */
async function _kRenderRotation(weekRow, absData, preRows) {
  const el = document.getElementById('k-mob-rot-strip'); if (!el) return;
  const rooms = _kGetRoomList();
  if (!rooms.length) { _kSet(el, ''); return; }
  /* B31 (Oct 2026) — SLIDING WINDOW: the strip shows as many weeks as there are kitchen rooms,
     in time order, with this week in the middle (5 rooms → 2 weeks back · Now · 2 ahead). Every
     room appears once — a recent turn with its result, or its next turn with the date. Each week
     the rooms move one step; there is no jump when a round ends.
     Was: the rooms in fixed order, each with its own week — near the end of a round the next
     room jumped to the front with a future date, before the past weeks of the others.
     Display only: who is next (same rule as before), reminders and history are unchanged. */
  const idx      = kWeekIdx();
  const n        = rooms.length;
  const cyclePos = _kCyclePos(rooms, idx, weekRow);              // this week's room (from the saved week)
  const back     = Math.floor((n - 1) / 2), ahead = n - 1 - back;
  const pad = n2 => String(n2).padStart(2, '0');
  const fmt = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);

  let _rows = preRows;                                            // loadKitchen: weeks idx − n … idx + n
  if (!_rows) {
    if (!sbL) return;
    const { data } = await sbL.from('kitchen_weeks').select('*')
      .gte('week_index', idx - back).lte('week_index', idx + ahead);
    _rows = data || [];
  }
  const roomAt = k => rooms[(((cyclePos + k) % n) + n) % n];      // rotation order, k weeks from now

  // The one true next room — same rule as before: the first coming week whose room is not away / vacant
  let nextK = -1;
  for (let k = 1; k <= n; k++) {
    const slot = idx + k, nRoom = roomAt(k);
    const nStart = new Date(K_START.getTime() + slot * 7 * 24 * 60 * 60 * 1000);
    const nWs = _kYmd(nStart), nWe = _kYmd(_kAddDays(nStart, 6));
    if (!absData.some(a => a.room === nRoom && absCoversWeek(a, nWs, nWe)) && !kVacantInWeek(nRoom, slot)) { nextK = k; break; }
  }

  // The weeks on screen: past weeks + this week show who really had them (the saved week);
  // coming weeks follow the rotation. A saved week counts for its own room only.
  const slots = [];
  for (let k = -back; k <= ahead; k++) {
    const slot = idx + k, want = roomAt(k);
    const row  = _rows.find(r => r.week_index === slot && r.room === want)
              || (k <= 0 ? _rows.find(r => r.week_index === slot) : null) || null;
    const room = row ? row.room : want;
    const info = kWeekInfo(Math.max(0, slot));
    let state  = _kRotState({
      isNow:       k === 0,
      isPast:      k < 0,
      isNext:      k === nextK,
      dbStatus:    row ? row.status : null,
      room,
      weekStart:   info ? info.start : null,
      absenceRows: absData,
    });
    if (state === 'done' && row && row.is_late) state = 'late';
    slots.push({ k, slot, room, info, row, state });
  }

  const _segStates = slots.map(x => x.state);
  const items = slots.map(x => _kRotItemHTML(x.state, x.room, x.info ? fmt(x.info.start) + '–' + fmt(x.info.end) : '—')).join('');
  _kSet(el, `<div class="k-mob-rot-line"></div>${_kRotSegsHTML(_segStates)}<div class="k-mob-rot-items">${items}</div>`);

  // Desktop timeline — the same weeks, top to bottom
  const elDsk = document.getElementById('k-dsk-rot-list');
  if (elDsk) {
    _kSet(elDsk, '<div class="rot-tl">' + slots.map(x => {
      const room    = x.room, _shown = x.room, dbRow = x.row;
      const dateStr = x.info ? fmt(x.info.start) + ' – ' + fmt(x.info.end) : '—';
      const state   = x.state === 'late' ? 'done' : x.state;       // the badge says "Done (late)"
      const dotClass = { done:'rot-dot--done', now:'rot-dot--now', missed:'rot-dot--missed', skipped:'rot-dot--skipped', absent:'rot-dot--absent' }[state] || 'rot-dot--next';
      const topLine  = state === 'done' || state === 'now' ? 'rot-line-done'
                     : state === 'skipped' ? 'rot-line-skipped'
                     : state === 'absent'  ? 'rot-line-absent'
                     : state === 'missed'  ? 'rot-line-missed' : 'rot-line-faded';
      const botLine  = state === 'done' && x.k < 0 ? 'rot-line-done' : 'rot-line-faded';
      const badge    = {
        done:     `<span class="rot-badge rot-badge--done">✓ ${dbRow && dbRow.is_late ? 'Done (late)' : 'Done'}</span>`,
        review:   '<span class="rot-badge rot-badge--next">↑ Review</span>',
        now:      '<span class="rot-badge rot-badge--now">Now</span>',
        next:     '<span class="rot-badge rot-badge--next">Next</span>',
        missed:   '<span class="rot-badge rot-badge--missed">Missed</span>',
        skipped:  '<span class="rot-badge rot-badge--skipped">Vacant</span>',
        absent:   '<span class="rot-badge rot-badge--absent">Away</span>',
        upcoming: '<span class="rot-badge rot-badge--none">—</span>',
        none:     '<span class="rot-badge rot-badge--none">No result</span>',
      }[state] || '<span class="rot-badge rot-badge--none">—</span>';
      const rowClass = 'rot-tl-row'
        + (state === 'now'     ? ' rot-tl-row--now'
         : state === 'missed'  ? ' rot-tl-row--missed'
         : state === 'skipped' ? ' rot-tl-row--skipped'
         : state === 'absent'  ? ' rot-tl-row--absent'
         : state === 'next'    ? ' rot-tl-row--next' : '');
      const email   = tenantEmail(room);
      const profile = (typeof _getProfile === 'function') ? _getProfile(room) : (S ? S.get('room_profile_' + room, {}) : {});
      const name    = profile.firstName || room;
      const subject = encodeURIComponent('Casa Castel Kitchen — Proof required');
      const body    = encodeURIComponent(`Hi ${name},\n\nPlease clean the kitchen and upload your proof in the app.\n\nCasa Castel`);
      const mailBtn = email
        ? `<a href="mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}" target="_blank" title="Send reminder to ${esc(room)}" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:var(--cc-r-sm);background:var(--cc-surface);border:0.5px solid var(--cc-rule);color:var(--cc-taupe);text-decoration:none;flex-shrink:0;margin-left:5px;" aria-label="Send reminder to ${esc(room)}"><i class="ti ti-mail" style="font-size:12px;" aria-hidden="true"></i></a>`
        : '';
      return `<div class="${rowClass}"><div class="rot-spine"><div class="rot-spine-top ${topLine}"></div><div class="rot-dot ${dotClass}"></div><div class="rot-spine-bot ${botLine}"></div></div><div class="rot-tl-body"><div class="rot-tl-info"><p class="rot-tl-room">${esc(_shown)}</p><p class="rot-tl-dates">${dateStr}</p></div><div style="display:flex;align-items:center;">${badge}${mailBtn}</div></div></div>`;
    }).join('') + '</div>');
  }
}
/* ── WEEK CARD ──────────────────────────────────────────── */
function _kRenderWeekCard(weekRow, absData) {
  const idx = kWeekIdx();
  const wi  = _kWeekInfo(idx); if (!wi) return;
  const room    = (weekRow && weekRow.room) || wi.room;          // saved room wins
  const dateStr = _kFmtDM(wi.start) + ' – ' + _kFmtDM(wi.end) + (wi.daysLeft > 0 ? ' · ' + wi.daysLeft + 'd left' : ' · ends today');

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('k-mob-room-name', room);
  setTxt('k-mob-dates', dateStr);
  setTxt('k-dsk-room-name', room);
  setTxt('k-dsk-dates', dateStr);

  const dbStatus = weekRow ? weekRow.status : null;
  const state    = _kRotState({ isNow: true, isPast: false, dbStatus, room, weekStart: wi.start, absenceRows: absData });
  const isResub  = state === 'now' && weekRow && weekRow.reupload_count > 0 && dbStatus !== 'flagged';
  const isAuto   = !!(weekRow && weekRow.approved_by === 'auto');
  const isLate   = !!(weekRow && weekRow.is_late);

  // Chip — status is checked before reupload_count so flagged always wins
  const chipCls = state === 'done'     ? 'approved'
                : state === 'missed'   ? 'missed'
                : state === 'absent'   ? 'skipped'
                : state === 'skipped'  ? 'skipped'
                : dbStatus === 'flagged'                      ? 'flagged'
                : dbStatus === 'submitted' && isResub         ? 'resubmitted'
                : dbStatus === 'submitted'                    ? 'submitted'
                : 'pending';
  const chipTxt = state !== 'now'
    ? ({ done: isLate ? '✓ Done (late)' : '✓ Done',
         missed:'✗ Missed', absent:'— Away', skipped:'— Vacant' }[state] || 'Pending')
    : dbStatus === 'flagged'       ? '⚑ Redo'
    : isResub                      ? '↑↑ Re-submitted'
    : dbStatus === 'submitted'     ? '↑ Submitted'
    : 'Pending';
  ['k-mob-status-chip', 'k-dsk-status-chip'].forEach(id => {
    const chip = document.getElementById(id);
    if (chip) { chip.className = 'k-mob-status-chip ' + chipCls; chip.textContent = chipTxt; }
  });

  // One short line under the dates: what happens next
  let note = '', tone = '';
  if (state === 'absent')       { note = room + ' is away this week — no kitchen turn.'; }
  else if (state === 'skipped') { note = room + ' is vacant — no kitchen turn this week.'; }
  else if (dbStatus === 'submitted') {
    const at = _kAutoAt(weekRow);
    note = weekRow.no_auto ? 'Waiting for your review — no auto-approve.'
         : at && at > new Date() ? 'Auto-approves ' + _kFmtWhen(at)
         : 'Auto-approving…';
  }
  else if (dbStatus === 'flagged' && weekRow.flag_reason) { note = 'Redo: ' + weekRow.flag_reason; tone = 'flag'; }
  else if (state === 'missed') {
    note = weekRow && weekRow.late_until && new Date(weekRow.late_until) > new Date()
      ? 'Late proof possible until ' + _kFmtWhen(new Date(weekRow.late_until))
      : 'Marked missed.';
    tone = 'flag';
  }
  _kSetNote(['k-mob-note', 'k-dsk-note'], note, tone);

  // Action buttons
  let items = [];
  if (state === 'skipped' || state === 'absent') {
    // no buttons
  } else if (isResub || dbStatus === 'submitted') {
    items.push(`<button class="k-mob-wact green" onclick="kApprove()" aria-label="Approve"><i class="ti ti-circle-check"></i><span>Approve</span></button>`);
    items.push(`<button class="k-mob-wact red"   onclick="kFlag()"    aria-label="Flag"><i class="ti ti-flag"></i><span>Flag</span></button>`);
  } else if (dbStatus === 'approved') {
    items.push(`<button class="k-mob-wact amber" onclick="kUnapprove()" aria-label="Undo"><i class="ti ti-arrow-back-up"></i><span>Undo</span></button>`);
  } else if (dbStatus === 'flagged') {
    items.push(`<button class="k-mob-wact amber" onclick="kUnflag()"   aria-label="Unflag"><i class="ti ti-flag-off"></i><span>Unflag</span></button>`);
    items.push(`<button class="k-mob-wact blue"  onclick="kReminder()" aria-label="Remind"><i class="ti ti-mail"></i><span>Remind</span></button>`);
  } else if (dbStatus === 'missed') {
    items.push(`<button class="k-mob-wact amber" onclick="kReopen()"  aria-label="Reopen"><i class="ti ti-rotate"></i><span>Reopen</span></button>`);
  } else {
    items.push(`<button class="k-mob-wact blue"  onclick="kReminder()" aria-label="Remind"><i class="ti ti-mail"></i><span>Remind</span></button>`);
    items.push(`<button class="k-mob-wact red"   onclick="kReset()"   aria-label="Missed"><i class="ti ti-ban"></i><span>Missed</span></button>`);
  }
  const actEl  = document.getElementById('k-mob-actions');
  const actDsk = document.getElementById('k-dsk-actions');
  _kSet(actEl,  items.join(''));
  _kSet(actDsk, items.join(''));
}

/* ── LAST WEEK CARD ─────────────────────────────────────────
   Shown only while last week still needs you: a (late) proof is
   waiting for review. Same Approve / Flag as this week.          */
let _kLastSeq = 0;   // S1: only the newest draw counts — an older one can't bring the card back after it was hidden
async function _kRenderLastWeek(lastRow) {
  const mob    = document.getElementById('k-mob-last');
  const dsk    = document.getElementById('k-dsk-last');
  const dskSec = document.getElementById('k-dsk-last-sec');
  const seq    = ++_kLastSeq;
  const hide = () => { if (mob) mob.style.display = 'none'; if (dskSec) dskSec.style.display = 'none'; };
  if (!lastRow || lastRow.status !== 'submitted') { hide(); return; }

  // Photos of the newest upload for that week
  let photos = lastRow.photos || [];
  try {
    const comments = await _kGetComments(lastRow.id);
    const subs = comments.filter(c => c.text && c.text.startsWith('[submission] '));
    if (subs.length) photos = JSON.parse(subs[subs.length - 1].text.slice(13)).photos || photos;
  } catch (e) {}
  if (seq !== _kLastSeq) return;

  const at    = _kAutoAt(lastRow);
  const label = lastRow.is_late ? '↑ Late proof' : '↑ In review';
  const when  = lastRow.no_auto ? 'Waiting for your review'
              : at && at > new Date() ? 'Auto-approves ' + _kFmtWhen(at) : 'Auto-approving…';
  const html = `
    <div class="k-last__top">
      <div class="k-last__info">
        <span class="k-last__room">${esc(lastRow.room)}</span>
        <span class="k-last__meta">Last week · ${_kWeekRange(lastRow.week_index)} · ${when}</span>
      </div>
      <span class="k-mob-status-chip submitted">${label}</span>
    </div>
    <div class="k-last__body">
      <div class="k-last__photos">${_kPhotoStrip(photos)}</div>
      <div class="k-mob-week-acts">
        <button class="k-mob-wact green" onclick="kApprove('last')" aria-label="Approve last week"><i class="ti ti-circle-check"></i><span>Approve</span></button>
        <button class="k-mob-wact red"   onclick="kFlag('last')"    aria-label="Flag last week"><i class="ti ti-flag"></i><span>Flag</span></button>
      </div>
    </div>`;
  if (mob) { _kSet(mob, html); mob.style.display = ''; }
  _kSet(dsk, html);
  if (dskSec) dskSec.style.display = '';
}

/* ── NUDGE BANNER ───────────────────────────────────────── */
async function _kLoadNudgeBanner(weekRow) {
  if (!sbL) return;
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type', 'kitchen_nudge').is('resolved_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const banner = document.getElementById('k-mob-nudge-banner');
  const text   = document.getElementById('k-mob-nudge-banner-text');
  const status = document.getElementById('k-mob-nudge-banner-status');
  const bannerDsk = document.getElementById('k-dsk-nudge-banner');
  const textDsk   = document.getElementById('k-dsk-nudge-banner-text');
  const statusDsk = document.getElementById('k-dsk-nudge-banner-status');
  if (!banner || !text) return;
  if (!data) {
    banner.style.display = 'none';
    if (bannerDsk) bannerDsk.style.display = 'none';
    return;
  }
  const to   = data.room === 'All' ? 'All rooms' : data.room;
  const note = data.title ? ` · ${data.title}` : '';
  text.textContent = `${data.body}${note} → ${to}`;
  if (textDsk) textDsk.textContent = `${data.body}${note} → ${to}`;
  const _setStatus = (el, weekRow, data) => {
    if (!el) return;
    if (weekRow && data.room !== 'All' && data.room === weekRow.room) {
      const statusMap = { pending:'Pending', submitted:'Submitted', approved:'Approved', flagged:'Flagged', missed:'Missed', skipped:'Vacant' };
      el.textContent = statusMap[weekRow.status] || '';
      el.style.display = el.textContent ? '' : 'none';
    } else { el.style.display = 'none'; }
  };
  _setStatus(status, weekRow, data);
  _setStatus(statusDsk, weekRow, data);
  banner.style.display = 'flex';
  if (bannerDsk) bannerDsk.style.display = 'flex';
}
/* Dismiss = mark the open nudge as resolved (kept in the log), never delete */
async function _kDismissNudgeBanner() {
  const b = document.getElementById('k-mob-nudge-banner'); if (b) b.style.display = 'none';
  const d = document.getElementById('k-dsk-nudge-banner'); if (d) d.style.display = 'none';
  if (sbL) await sbL.from('lounge_data')
    .update({ resolved_at: new Date().toISOString(), resolved_by: 'Casa Castel' })
    .eq('type', 'kitchen_nudge').is('resolved_at', null);
}
var _kDismissNudgeBannerDsk = _kDismissNudgeBanner;

/* ── MODAL POPULATORS ───────────────────────────────────── */
async function _populateKHistory() {
  const el = document.getElementById('k-mob-history-body');
  if (!sbL) { el.innerHTML = '<p class="cc-note">Connect Supabase.</p>'; return; }
  const idx = kWeekIdx();
  const { data } = await sbL.from('kitchen_weeks').select('*').gte('week_index', K_HISTORY_FROM).lte('week_index', idx).order('week_index', { ascending: false }).limit(K_HISTORY_WEEKS);
  if (!data || !data.length) { el.innerHTML = '<p class="cc-note">No history yet.</p>'; return; }
  el.innerHTML = data.map(w => {
    const dateStr = kWeekDateRange(w.week_index);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid var(--cc-rule);"><div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);">${esc(w.room)}</p><p style="font-size:11px;color:var(--cc-taupe);">${dateStr}</p></div>${kHistPill(w.status, '', w)}</div>`;
  }).join('');
}
async function _populateKNudgeLog() {
  const el = document.getElementById('k-mob-nudgelog-body');
  if (!sbL) { el.innerHTML = '<p class="cc-note">Connect Supabase.</p>'; return; }
  const { data } = await sbL.from('lounge_data').select('*').eq('type', 'kitchen_nudge').order('created_at', { ascending: false }).limit(K_NUDGE_LOG_MAX);
  if (!data || !data.length) { el.innerHTML = '<p class="cc-note">No nudges sent yet.</p>'; return; }
  el.innerHTML = data.map(n => {
    const state = n.resolved_at
      ? (n.resolved_by === 'replaced'
          ? `<span class="k-nudge-state">↺ Replaced by a newer nudge</span>`
          : `<span class="k-nudge-state k-nudge-state--done">✓ Resolved${n.resolved_by ? ' by ' + esc(n.resolved_by) : ''} · ${fmtTs(new Date(n.resolved_at).getTime())}</span>`)
      : `<span class="k-nudge-state">Open</span>`;
    const note = n.title ? ` · ${esc(n.title)}` : '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:0.5px solid var(--cc-rule);"><div style="min-width:0;"><p style="font-size:13px;font-weight:500;color:var(--cc-ink);">${esc(n.body)}${note}</p><p style="font-size:11px;color:var(--cc-taupe);">→ ${esc(n.room === 'All' ? 'All rooms' : n.room)} · ${fmtTs(new Date(n.created_at).getTime())}</p>${state}</div><button onclick="_kDeleteNudge('${n.id}',this)" style="font-size:10px;color:var(--cc-stone);background:none;border:none;cursor:pointer;flex-shrink:0;">✕</button></div>`;
  }).join('');
}
async function _kDeleteNudge(id, btn) {
  if (!sbL) return;
  await sbL.from('lounge_data').delete().eq('id', id);
  btn.closest('div[style]')?.remove();
}

/* ── CLEAR CHAT ─────────────────────────────────────────── */
async function kClearChat() {
  if (!_kWeekRow) return;
  if (!(await ccConfirm('Clear the kitchen chat?', 'All messages and proof photos are deleted. This cannot be undone.', 'Clear all', true))) return;
  const paths = [];
  if (_kWeekRow.photos && Array.isArray(_kWeekRow.photos))
    _kWeekRow.photos.forEach(p => { if (p.path) paths.push(p.path); });
  const comments = await _kGetComments(_kWeekRow.id);
  comments.forEach(c => {
    if (!c.text) return;
    if (c.text.startsWith('[submission] ')) {
      try { const d = JSON.parse(c.text.replace('[submission] ', '')); (d.photos||[]).forEach(p => { if (p.path) paths.push(p.path); }); } catch(e) {}
    } else if (c.text.startsWith('[photo] ')) {
      const url = c.text.replace('[photo] ', '').trim();
      const marker = 'kitchen-proofs/';
      const mi = url.indexOf(marker);
      if (mi !== -1) paths.push(decodeURIComponent(url.slice(mi + marker.length)));
    }
  });
  if (sbL && paths.length) sbL.storage.from('kitchen-proofs').remove(paths).catch(e => console.warn('Storage cleanup error', e));
  if (sbL && _kWeekRow.photos) await sbL.from('kitchen_weeks').update({ photos: null }).eq('id', _kWeekRow.id);
  await _kDeleteComments(_kWeekRow.id);
  await loadKitchen();
}

/* ── SEND MESSAGE ───────────────────────────────────────── */

/* ── PHOTO UPLOAD ───────────────────────────────────────── */

/* ── ACTION HANDLERS ────────────────────────────────────── */
let _kWeekRow    = null;
let _kLastRow    = null;   // last week, when it still needs a review
let _kActionBusy = false;
let _kMobSending = false;
let _kChannel    = null;
let _kFlagTarget = null;

/* New-week safety: if the app was left open into a new week, refresh first
   so a button never acts on the wrong week. Returns false when it refreshed. */
async function _kEnsureCurrentWeek() {
  if (!_kWeekRow || _kWeekRow.week_index === kWeekIdx()) return true;
  await loadKitchen();
  alert('A new week has started, so the kitchen tab was refreshed. Please check again.');
  return false;
}
// Which week a button acts on: this week (default) or last week
function _kTarget(which) { return which === 'last' ? _kLastRow : _kWeekRow; }

/* S1 (19.10.2026) — INSTANT BUTTONS
   Every kitchen button (Approve · Flag · Undo · Unflag · Missed · Reopen) runs through _kRun
   with its save data + chat line — both exactly as before:
   · the card is redrawn at once with the new status — same draw code as a reload, so it looks
     exactly like the result; rotation strip + chat follow with the normal reload
   · all kitchen buttons stay grey (blocked) until the save has answered, max K_SAVE_LIMIT_MS
   · not saved → the card goes back (the "Could not save" toast comes from _kUpdateRow);
     no answer in time → back + toast; a late answer still counts (chat line + reload)
   · the chat line is written in the background, strictly in tap order (_kQueueChat)
   · an older reload can no longer draw over the new state (_kLoadSeq); reloads asked for
     during the save are skipped — the reload right after the save covers them           */
const K_SAVE_LIMIT_MS = 15000;
let _kAbsData = [];                 // absences of the last load — the instant redraw needs them
let _kLoadSeq = 0;                  // newest reload wins (see _kLoad)
let _kChatQ   = Promise.resolve();  // chat lines one after the other

/* Grey + blocked while a save runs (the style lives here — no CSS file change) */
(function _kBusyCss() {
  if (document.getElementById('k-busy-css')) return;
  const st = document.createElement('style'); st.id = 'k-busy-css';
  st.textContent = '#tab-kitchen.k-busy .k-mob-wact{opacity:.45;pointer-events:none;}';
  document.head.appendChild(st);
})();
function _kBusyUI(on) {
  const t = document.getElementById('tab-kitchen');
  if (t) t.classList.toggle('k-busy', !!on);
}
/* Draws one card from a row: this week → week card · last week → last-week card */
function _kDrawRow(which, r) {
  if (which === 'last') { _kLastRow = r; _kRenderLastWeek(r); }
  else                  { _kWeekRow = r; _kRenderWeekCard(r, _kAbsData); }
}
/* A promise with a time limit → its own result, or { timeout: true } */
function _kWithLimit(p, ms) {
  let t;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise(res => { t = setTimeout(() => res({ timeout: true }), ms); }),
  ]);
}
/* Chat lines are written one after the other, in tap order */
function _kQueueChat(weekId, text, isFlag) {
  _kChatQ = _kChatQ.then(() => _kAddComment(weekId, 'Casa Castel', text, isFlag))
                   .catch(e => console.warn('[kitchen] chat line', e));
  return _kChatQ;
}

/* spec = { patch, auto (true → _kUpdateRowAuto), chat (chat line or none), isFlag } */
async function _kRun(which, spec) {
  if (!sbL || _kActionBusy) return;
  if (!(await _kEnsureCurrentWeek())) return;
  if (_kActionBusy) return;                                   // another tap got in first
  const row = _kTarget(which); if (!row) return;
  _kActionBusy = true;
  _kLoadSeq++;                                                // a reload still on its way may no longer draw
  _kBusyUI(true);
  const after = Object.assign({}, row, spec.patch);
  const live  = which === 'last' || row.week_index === kWeekIdx();   // the card on screen shows this row's week
  try {
    if (live) _kDrawRow(which, after);
    const save = spec.auto ? _kUpdateRowAuto(row, spec.patch) : _kUpdateRow(row, spec.patch);
    const res  = await _kWithLimit(save, K_SAVE_LIMIT_MS);
    if (res && res.timeout) {
      if (live) _kDrawRow(which, row);                        // not confirmed → back as it was
      alert('No answer from the server. If it went through, the kitchen updates by itself — otherwise please try again.');
      save.then(r => {                                        // a late answer still counts
        if (!r || r.error) return;
        if (spec.chat) _kQueueChat(row.id, spec.chat, spec.isFlag);
        _kScheduleReload();
      }).catch(() => {});
    } else if (!res || res.error) {
      if (live) _kDrawRow(which, row);                        // not saved → back as it was
    } else if (spec.chat) {
      _kQueueChat(row.id, spec.chat, spec.isFlag);
    }
  } catch (e) {
    console.warn('[kitchen] action', e);
    if (live) _kDrawRow(which, row);
    alert('Could not save — please try again.');
  } finally {
    if (!live) { try { await _kLoad(); } catch (e) {} }      // card was from an older week → redraw before the buttons come back
    _kActionBusy = false;
    _kBusyUI(false);
    if (live) _kScheduleReload();                             // strip, chat + exact data — the buttons are free already
  }
}

function kApprove(which) {
  return _kRun(which, { patch: { status:'approved', flagged:false, approved_at:new Date().toISOString(), approved_by:'landlord' },
                        chat: '✓ Approved.' });
}
/* Flag opens a small sheet: what has to be redone */
async function kFlag(which) {
  if (!(await _kEnsureCurrentWeek())) return;
  const row = _kTarget(which); if (!row) return;
  _kFlagTarget = which === 'last' ? 'last' : 'now';
  document.querySelectorAll('#k-flag-reasons .k-mob-n-chip').forEach(b => b.classList.remove('selected'));
  const note = document.getElementById('k-flag-note'); if (note) note.value = '';
  const err  = document.getElementById('k-flag-err');  if (err) err.style.display = 'none';
  const ttl  = document.getElementById('k-flag-title');
  if (ttl) ttl.textContent = 'Flag proof — ' + row.room + (which === 'last' ? ' · last week' : '');
  kitchenOpenModal('flag');
}
async function _kFlagConfirm() {
  const reasons = [...document.querySelectorAll('#k-flag-reasons .k-mob-n-chip.selected')].map(b => b.dataset.reason);
  const note    = (document.getElementById('k-flag-note')?.value || '').trim();
  if (!reasons.length && !note) { const err = document.getElementById('k-flag-err'); if (err) err.style.display = ''; return; }
  const reason = [reasons.join(', '), note].filter(Boolean).join(' — ');
  kitchenCloseModal('flag');
  await _kRun(_kFlagTarget === 'last' ? 'last' : 'now',
    { patch: { flagged:true, status:'flagged', flag_reason: reason, no_auto:false }, auto: true,   // D6
      chat: '⚑ Redo: ' + reason, isFlag: true });
}
function kUnapprove(which) {
  return _kRun(which, { patch: { status:'submitted', flagged:false, approved_at:null, no_auto:true }, auto: true,   // D6: waits for you
                        chat: '↩ Approval undone.' });
}
function kUnflag(which) {
  return _kRun(which, { patch: { flagged:false, status:'submitted', flag_reason:null },
                        chat: '✓ Redo cancelled.' });
}
/* Missed keeps the chat and the photos — it only changes the status */
async function kReset() {
  const row = _kWeekRow; if (!row) return;
  if (!(await ccConfirm('Mark this week as missed for ' + ccEscHtml(row.room) + '?', '', 'Mark missed', true))) return;
  return _kRun('now', { patch: { status:'missed', flagged:false, closed_at:new Date().toISOString() },
                        chat: '✗ Marked missed.' });
}
async function kReopen() {
  const row = _kWeekRow; if (!row) return;
  if (!(await ccConfirm('Reopen the week for ' + ccEscHtml(row.room) + '?', 'They can upload proof again.', 'Reopen'))) return;
  return _kRun('now', { patch: { status:'pending', flagged:false, flag_reason:null, closed_at:null, photos:null, photo_path:null, photo_url:null, reupload_count:null, submitted_at:null, no_auto:false }, auto: true });   // D6
}
function kReminder() {
  if (!_kWeekRow) return;
  const email = tenantEmail(_kWeekRow.room);
  const name  = (typeof _getProfile === 'function' ? _getProfile(_kWeekRow.room) : (S ? S.get('room_profile_' + _kWeekRow.room, {}) : {})).firstName || _kWeekRow.room;
  window.open(buildMailto(email, 'Casa Castel Kitchen — Proof required',
    `Hi ${name},\n\nPlease clean the kitchen and upload your proof in the app.\n\nCasa Castel`), '_blank');
}

/* ── PHOTO MODAL ────────────────────────────────────────── */
function openPhotoModal(url, label) {
  document.getElementById('k-photo-modal-img').src = url;
  document.getElementById('k-photo-modal-label').textContent = label || '';
  document.getElementById('k-photo-modal').classList.add('visible');
}
function closePhotoModal() {
  document.getElementById('k-photo-modal').classList.remove('visible');
  document.getElementById('k-photo-modal-img').src = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhotoModal(); });

/* ── NUDGE ROOM BUTTONS (refreshed after kitchenRooms loads) */
function _kRefreshNudgeRoomButtons() {
  const rooms = getKitchenRooms();

  // Helper: fully rebuild a "to" row with All + room chips, all wired
  function _buildToRow(rowEl) {
    if (!rowEl) return;
    rowEl.innerHTML = '';
    ['All', ...rooms].forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'k-mob-n-chip k-nudge-to-chip';
      btn.dataset.to = r;
      btn.textContent = r === 'All' ? 'All rooms' : r;
      btn.addEventListener('click', () => {
        rowEl.querySelectorAll('.k-mob-n-chip').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      rowEl.appendChild(btn);
    });
  }

  _buildToRow(document.getElementById('k-mob-nudge-to-row'));
  _buildToRow(document.getElementById('k-dsk-nudge-to-row'));
}

/* ── REALTIME ───────────────────────────────────────────── */
// Any DB change → one bundled reload (S2: _kScheduleReload); plain chat messages redraw only the chat.
function _kSubscribe() {
  if (_kChannel) { sbL.removeChannel(_kChannel); _kChannel = null; }
  _kChannel = sbL.channel('kitchen-landlord-rt')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kitchen_weeks' },    () => _kScheduleReload())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kitchen_comments' }, async payload => {
      // If this is a submission comment, do a full reload so the chip + buttons update.
      // For regular chat messages, only re-render the feed to avoid a premature re-fetch.
      const text = payload.new?.text || '';
      if (text.startsWith('[submission] ') || text.startsWith('[system] ') || text.startsWith('[late] ')) {
        _kScheduleReload();
      } else {
        if (_kWeekRow) await _kRenderFeed(_kWeekRow);
      }
    })
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'kitchen_absences' }, () => _kScheduleReload())
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'lounge_data' },      async payload => { const t = payload.new?.type || payload.old?.type; const isDelete = payload.eventType === 'DELETE' || (!payload.new?.id && payload.old?.id); if (t === 'kitchen_nudge' || isDelete) { await _kLoadNudgeBanner(_kWeekRow); } else if (t === 'hc_done') { _kScheduleReload(); } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, async () => {
      if (typeof loadRoomsData === 'function') await loadRoomsData();
      _kScheduleReload();
    })
    .subscribe();
}

/* ── MAIN LOAD — single function, cleaning tab pattern ─────
   Called on init and by every realtime event.
   Fetches everything fresh, renders everything, no state deps.
   ─────────────────────────────────────────────────────────── */
/* S2 (19.10.2026) — ONE RELOAD TIMER
   Realtime events, reopening the app, the new-week check and the reload after a button all ask
   for a reload here. Each ask restarts a short timer, so a burst of changes (a photo upload =
   2–3 events; a button + its own realtime echo) gives ONE reload — at the latest K_RELOAD_MAX_MS
   after the first ask, so a steady stream can't hold it off. A load that starts anyway (tab
   switch, ↺ button) takes the waiting reload's place (see _kLoad).                             */
const K_RELOAD_WAIT_MS = 350, K_RELOAD_MAX_MS = 1500;
let _kReloadTimer = null, _kReloadFirstAsk = 0;
function _kScheduleReload(ms) {
  const now = Date.now();
  if (!_kReloadTimer) _kReloadFirstAsk = now;
  const wait = Math.max(0, Math.min(ms == null ? K_RELOAD_WAIT_MS : ms, _kReloadFirstAsk + K_RELOAD_MAX_MS - now));
  clearTimeout(_kReloadTimer);
  _kReloadTimer = setTimeout(() => { _kReloadTimer = null; loadKitchen(); }, wait);
}

/* S2: the new week's entry is created only once — a second load that looked before it was saved
   gets that same row instead of creating it again. A failed attempt is tried again by the next load. */
let _kNewWeek = null;   // { idx, p, doneAt }
function _kCreateWeekOnce(idx, room, askedAt) {
  const c = _kNewWeek;
  if (c && c.idx === idx && (!c.doneAt || askedAt < c.doneAt)) return c.p;
  const entry = { idx, doneAt: 0 };
  entry.p = (async () => {
    const { data } = await sbL.from('kitchen_weeks')
      .insert({ week_index: idx, room, status: 'pending' })
      .select().single();
    return data || (await _kGetWeek(idx));
  })().then(r => { entry.doneAt = Date.now(); return r; },
            () => { entry.doneAt = Date.now(); return null; });
  _kNewWeek = entry;
  return entry.p;
}

/* S1: while a button's save runs, a reload is skipped — the reload right after the save covers it */
async function loadKitchen() {
  if (_kActionBusy) return;
  return _kLoad();
}
async function _kLoad() {
  const seq = ++_kLoadSeq;   // S1: newest reload wins — an older one stops before it draws anything
  clearTimeout(_kReloadTimer); _kReloadTimer = null;   // S2: this load fetches everything fresh → a waiting reload is covered
  // Stage 1 — rooms master data + kitchen config in parallel (was sequential)
  const _needRooms = (typeof appRooms !== 'undefined' && appRooms.length === 0 && typeof loadRoomsData === 'function');
  await Promise.all([
    _needRooms ? loadRoomsData() : Promise.resolve(),
    loadKitchenRoomsFromSupabase(),
  ]);
  if (seq !== _kLoadSeq) return;
  _kRefreshNudgeRoomButtons();

  const idx  = kWeekIdx();
  const info = _kWeekInfo(Math.max(0, idx));
  if (!info) return;

  if (!sbL) {
    const el = document.getElementById('k-feed-mob');
    if (el) el.innerHTML = '<p class="cc-note">Connect Supabase to see proof feed.</p>';
    return;
  }

  // Stage 2 — ONE ranged query fetches the current week AND every rotation
  // slot of the cycle (previously: 1 query for the week + 1 query per room).
  // (range covers last week + the whole rotation cycle around this week)
  const _n = Math.max(_kGetRoomList().length, 1);

  const askedAt = Date.now();   // S2: when this load looked (see _kCreateWeekOnce)
  let [cycleRows, absData] = await Promise.all([
    sbL.from('kitchen_weeks').select('*')
      .gte('week_index', idx - _n)
      .lte('week_index', idx + _n)
      .then(r => r.data || []),
    sbL.from('kitchen_absences').select('room,from_date,to_date').then(r => r.data || []),
    kLoadWeekVacancy(idx - _n, idx + _n),   // vacant per week from move-in / move-out dates
  ]);
  if (seq !== _kLoadSeq) return;

  let weekRow = cycleRows.find(r => r.week_index === idx) || null;

  // Create row if missing (first visit of a new week only) — S2: only once, even when two loads overlap
  if (!weekRow) {
    weekRow = await _kCreateWeekOnce(idx, info.room, askedAt);
    if (weekRow) cycleRows = cycleRows.concat([weekRow]);
    if (seq !== _kLoadSeq) return;
  }
  // S1: from here to the week card nothing waits — the rows and the buttons on screen always match
  _kWeekRow = weekRow;
  _kLastRow = cycleRows.find(r => r.week_index === idx - 1) || null;
  _kAbsData = absData;
  _kAutoReset(idx).catch(e => console.warn('[kitchen] auto cleanup', e)); // K8: background, once per week

  // Render everything — week card is sync; the three async renderers are
  // independent (different DOM targets, no shared writes) → run in parallel.
  _kRenderWeekCard(weekRow, absData);
  await Promise.all([
    _kRenderFeed(weekRow),
    _kRenderRotation(weekRow, absData, cycleRows),
    _kLoadNudgeBanner(weekRow),
    _kRenderLastWeek(_kLastRow),
  ]);

  // Start realtime only once — channel must stay alive permanently
  if (!_kChannel) _kSubscribe();

  // Rooms change hook
  if (typeof onRoomsChange === 'function' && !loadKitchen._roomsWired) { loadKitchen._roomsWired = true; onRoomsChange(() => _kScheduleReload()); }
}

/* aliases — layout.js calls both */
var initKitchenMobile = loadKitchen;
var initKitchen       = loadKitchen;

/* ── NUDGE WIRING (mobile modal + desktop inline) ──────────
   Type chips are static HTML — wired once here.
   "To" chips are dynamic — rebuilt + wired inside _kRefreshNudgeRoomButtons()
   every time loadKitchen() runs, so they always reflect current rooms.
   ─────────────────────────────────────────────────────────── */

// Shared send logic so mobile and desktop stay in sync
async function _kSendNudge(typeBtn, toBtn, noteEl, sendBtn, afterSend) {
  if (!typeBtn || !toBtn) {
    sendBtn.textContent = 'Select type & room first';
    sendBtn.style.backgroundColor = '#A32D2D';
    setTimeout(() => { sendBtn.textContent = 'Send nudge'; sendBtn.style.backgroundColor = ''; }, 1800);
    return;
  }
  if (!sbL) return;
  sendBtn.disabled = true;
  const note = noteEl ? noteEl.value.trim() : '';
  // Call afterSend immediately (optimistic) so UI closes/resets without waiting for DB
  if (afterSend) afterSend();
  try {
    // Delete the old nudge FIRST, then insert the new one (K5: run in parallel, the delete
    // could be processed after the insert and remove the new nudge straight away)
    // Only one open nudge at a time: the previous open one is closed (kept in the log)
    await sbL.from('lounge_data')
      .update({ resolved_at: new Date().toISOString(), resolved_by: 'replaced' })
      .eq('type', 'kitchen_nudge').is('resolved_at', null);
    await sbL.from('lounge_data').insert({
      type: 'kitchen_nudge',
      room: toBtn.dataset.to,
      body: typeBtn.dataset.type,
      title: note || null
    });
  } finally {
    sendBtn.disabled = false;
  }
}

(function _wireNudgeAll() {
  // ── Mobile: type chip selection ──
  document.querySelectorAll('#k-mob-nudge-type-row .k-nudge-type-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#k-mob-nudge-type-row .k-nudge-type-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // ── Mobile: send button ──
  document.getElementById('k-mob-nudge-send-btn')?.addEventListener('click', async () => {
    const typeBtn = document.querySelector('#k-mob-nudge-type-row .k-nudge-type-chip.selected');
    const toBtn   = document.querySelector('#k-mob-nudge-to-row .k-mob-n-chip.selected');
    const sendBtn = document.getElementById('k-mob-nudge-send-btn');
    const noteEl  = document.getElementById('k-mob-nudge-note');
    await _kSendNudge(typeBtn, toBtn, noteEl, sendBtn, () => {
      document.querySelectorAll('#k-mob-nudge-type-row .k-nudge-type-chip').forEach(b => b.classList.remove('selected'));
      document.querySelectorAll('#k-mob-nudge-to-row .k-mob-n-chip').forEach(b => b.classList.remove('selected'));
      noteEl.value = '';
      kitchenCloseModal('nudge');
    });
  });

  // ── Desktop: type chip selection ──
  document.querySelectorAll('#k-dsk-nudge-type-row .k-nudge-type-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#k-dsk-nudge-type-row .k-nudge-type-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // ── Desktop: send button ──
  document.getElementById('k-dsk-nudge-send-btn')?.addEventListener('click', async () => {
    const typeBtn = document.querySelector('#k-dsk-nudge-type-row .k-nudge-type-chip.selected');
    const toBtn   = document.querySelector('#k-dsk-nudge-to-row .k-mob-n-chip.selected');
    const sendBtn = document.getElementById('k-dsk-nudge-send-btn');
    const noteEl  = document.getElementById('k-dsk-nudge-note');
    await _kSendNudge(typeBtn, toBtn, noteEl, sendBtn, () => {
      document.querySelectorAll('#k-dsk-nudge-type-row .k-nudge-type-chip').forEach(b => b.classList.remove('selected'));
      document.querySelectorAll('#k-dsk-nudge-to-row .k-mob-n-chip').forEach(b => b.classList.remove('selected'));
      noteEl.value = '';
      sendBtn.textContent = '✓ Nudge sent';
      sendBtn.style.backgroundColor = '#27500A';
      setTimeout(() => { sendBtn.textContent = 'Send nudge'; sendBtn.style.backgroundColor = ''; }, 1800);
    });
  });
})();

/* ── COMPOSE CARD (phone + iPad/laptop) ─────────────────────
   + : Choose photo · Send nudge · Nudge log · Clear chat
       (nudge + log only on the phone — the laptop layout has them
       in the left column). Camera = live photo.                   */
async function _kComposeSend({ text, photo }) {
  if (!sbL || !_kWeekRow) return false;
  if (!(await _kEnsureCurrentWeek())) return false;
  const row = _kWeekRow;
  if (photo) {
    const url = await ccUploadPhoto(photo, `week-${row.week_index}-mgmt-${Date.now()}.jpg`);
    await _kAddComment(row.id, 'Casa Castel', '[photo] ' + url, false);
  }
  if (text) await _kAddComment(row.id, 'Casa Castel', _kSafeChatText(text), false);
  await _kRenderFeed(_kWeekRow);
  return true;
}
(function _mountKitchenCompose() {
  const menu = [
    { icon: 'photo', label: 'Choose photo',  sub: 'From your library', library: true },
    { icon: 'flag',  label: 'Send nudge',    sub: 'Trash, dishes or fridge reminder', mobileOnly: true, onClick: () => kitchenOpenModal('nudge') },
    { icon: 'list',  label: 'Nudge log',     sub: 'Open and resolved nudges',          mobileOnly: true, onClick: () => kitchenOpenModal('nudgelog') },
    { icon: 'trash', label: 'Clear chat',    sub: "Delete this week's messages and photos", danger: true, onClick: () => kClearChat() },
  ];
  ['k-compose-mob', 'k-compose-dsk'].forEach(id => ccCompose(document.getElementById(id), {
    placeholder: 'Write to kitchen group…',
    plus: menu,
    camera: 'live',
    onSend: _kComposeSend,
  }));
})();

/* Reload the kitchen when the app comes back to the front */
ccOnResume(() => _kScheduleReload(0));

/* ── FLAG SHEET CHIPS (multi-select) ────────────────────── */
document.querySelectorAll('#k-flag-reasons .k-mob-n-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('selected');
    const err = document.getElementById('k-flag-err'); if (err) err.style.display = 'none';
  });
});

/* ── NEW WEEK WHILE OPEN ────────────────────────────────────
   Re-check when the app comes back to the front and once a minute;
   a quiet reload (no alert) when nothing was tapped yet.          */
function _kQuietWeekCheck() {
  if (document.visibilityState !== 'visible' || !_kWeekRow) return;
  if (_kWeekRow.week_index !== kWeekIdx()) _kScheduleReload(0);
}
document.addEventListener('visibilitychange', _kQuietWeekCheck);
setInterval(_kQuietWeekCheck, 60 * 1000);

/* ── ROTATION STRIP LABELS (K1/K3/K4) ───────────────────────
   Words instead of symbols; a line segment per week (green = done,
   red = missed, amber = in review). The room order stays fixed; a past
   week shows its result only when it was saved for that room. */
function _kRotLabel(state) {
  return { done: 'Done', late: 'Late', review: 'Review', missed: 'Missed', skipped: 'Vacant', absent: 'Away',
           now: 'Now', none: 'No result', next: 'Next', upcoming: '' }[state] ?? '';
}
function _kRotItemHTML(state, room, dateStr) {
  return `<div class="k-mob-rot-item ${state}"><span class="k-mob-rot-badge ${state}">${_kRotLabel(state)}</span><span class="k-mob-rot-room">${esc(room)}</span><span class="k-mob-rot-dates">${dateStr}</span></div>`;
}
function _kRotSegsHTML(states) {
  return '<div class="k-mob-rot-segs">' + states.map(s => `<span class="k-mob-rot-seg ${s}"></span>`).join('') + '</div>';
}
