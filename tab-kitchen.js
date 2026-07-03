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
        </div>
        <div class="k-mob-week-acts" id="k-mob-actions"></div>
      </div>
    </div>

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
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="k-mob-tlink" onclick="kClearChat()">✕ Clear</button>
          <button class="k-mob-tlink" onclick="loadKitchen()">↺ Refresh</button>
        </div>
      </div>
      <div class="k-mob-feed" id="k-feed-mob"></div>
      <div class="k-mob-compose">
        <input class="k-mob-compose-input" id="k-mob-msg-input" type="text" placeholder="Write to kitchen group…"/>
        <button class="k-mob-nudge-flag-btn" id="k-mob-nudge-flag-btn" onclick="kitchenOpenModal('nudge')" aria-label="Send a nudge">⚑</button>
        <input type="file" id="k-mob-photo-file" accept="image/*" capture="environment" style="display:none;"/>
        <button class="k-mob-camera-btn" id="k-mob-photo-btn" aria-label="Send photo">
          <i class="ti ti-camera" style="font-size:18px;"></i>
        </button>
      </div>
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
        <div style="display:flex;gap:10px;align-items:center;">
          <button class="k-dsk-chat-link" onclick="loadKitchen()">↺ Refresh</button>
          <button class="k-dsk-chat-link" onclick="kClearChat()">✕ Clear</button>
        </div>
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
      <div class="k-mob-compose" style="padding-bottom:10px!important;">
        <input class="k-mob-compose-input" id="k-dsk-msg-input" type="text" placeholder="Write to kitchen group…"/>
        <button class="k-mob-nudge-flag-btn" id="k-dsk-nudge-flag-btn" onclick="kitchenOpenModal('nudge')" aria-label="Send a nudge">⚑</button>
        <input type="file" id="k-dsk-photo-file" accept="image/*" style="display:none;"/>
        <button class="k-mob-camera-btn" id="k-dsk-photo-btn" aria-label="Send photo">
          <i class="ti ti-camera" style="font-size:18px;"></i>
        </button>
      </div>

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
async function _kUpdateWeek(idx, patch) {
  if (!sbL) return;
  await sbL.from('kitchen_weeks').update(patch).eq('week_index', idx);
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
async function _kAutoReset(currentIdx) {
  if (!sbL) return;
  const THIRTY = 30 * 24 * 60 * 60 * 1000;
  const { data } = await sbL.from('kitchen_weeks').select('*').lt('week_index', currentIdx).order('week_index', { ascending: false });
  if (!data || !data.length) return;
  const cutoff = Date.now() - THIRTY;
  for (const row of data) {
    const ts = row.submitted_at || row.closed_at || row.created_at;
    if (!ts || new Date(ts).getTime() > cutoff) continue;
    if (row.photo_path) await sbL.storage.from('kitchen-proofs').remove([row.photo_path]);
    await sbL.from('kitchen_comments').delete().eq('week_id', row.id);
    if (row.photo_path || row.photo_url || row.photos)
      await sbL.from('kitchen_weeks').update({ photos: null, photo_path: null, photo_url: null, closed_at: row.closed_at || new Date().toISOString() }).eq('id', row.id);
  }
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

/* ── ROTATION STATE ─────────────────────────────────────── */
function _kRotState(opts) {
  const { isNow, isPast, isNext, dbStatus, room, weekStart, absenceRows } = opts;
  if (absenceRows && weekStart) {
    const wStart = weekStart.toISOString().slice(0, 10);
    const wEnd   = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (absenceRows.some(a => a.room === room && a.from_date <= wEnd && a.to_date >= wStart)) return 'absent';
  }
  if (isVacant(room)) return 'skipped';
  if (isNow) {
    if (dbStatus === 'approved') return 'done';
    return 'now';
  }
  if (!isPast) return isNext ? 'next' : 'upcoming';
  if (!dbStatus)               return 'none';
  if (dbStatus === 'approved') return 'done';
  if (dbStatus === 'skipped')  return 'skipped';
  if (dbStatus === 'absent')   return 'absent';
  return 'missed';
}

/* ── FEED HTML BUILDER ──────────────────────────────────── */
function _kBuildFeedHtml(comments, weekRow) {
  const labels = { trash:'Trash', geschirr:'Geschirr', overview:'Kitchen' };
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
          + ev.photos.filter(p => p.url).map(p =>
              `<div style="flex:1;min-width:0;aspect-ratio:3/4;border-radius:6px;overflow:hidden;border:0.5px solid var(--cc-rule);position:relative;cursor:pointer;" onclick="openPhotoModal('${p.url}','${lbl(p.type)}')">`
              + `<img src="${p.url}" alt="${p.type}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'"/>`
              + `<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.5);font-size:8px;font-weight:500;color:#fff;letter-spacing:0.05em;text-transform:uppercase;padding:3px 4px;text-align:center;">${lbl(p.type)}</span>`
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
      return `<div class="k-sys-event" data-comment-id="${ev.id}">
        <div class="k-sys-event__line"></div>
        <span class="k-sys-event__text k-sys-event__text--flag">⚑ Re-upload requested · ${fmtTs(ev._ts)}</span>
        <button class="k-delete-btn k-delete-btn--sys" title="Delete">✕</button>
        <div class="k-sys-event__line"></div></div>`;
    }
    const isSysApproved = ev.text && (ev.text.startsWith('✓ Approved') || ev.text.startsWith('↩ Approval'));
    if (isSysApproved) {
      const isApproved = ev.text.startsWith('✓ Approved');
      return `<div class="k-sys-event" data-comment-id="${ev.id}">
        <div class="k-sys-event__line"></div>
        <span class="k-sys-event__text${isApproved ? ' k-sys-event__text--approved' : ''}">
          ${isApproved ? '✓ Approved' : '↩ Approval undone'} · ${fmtTs(ev._ts)}
        </span>
        <div class="k-sys-event__line"></div></div>`;
    }
    if (ev.text && ev.text.startsWith('✓ ') && !ev.text.startsWith('✓ Approved') && !ev.text.startsWith('✓ Approval')) {
      return `<div class="k-sys-event" data-comment-id="${ev.id}">
        <div class="k-sys-event__line"></div>
        <span class="k-sys-event__text k-sys-event__text--done">${esc(ev.text)} · ${fmtTs(ev._ts)}</span>
        <div class="k-sys-event__line"></div></div>`;
    }
    if (ev.text && ev.text.startsWith('[photo] ')) {
      const pUrl = ev.text.slice(8).trim();
      return `<div class="k-chat-row" data-comment-id="${ev.id}">
        <div class="k-chat-avatar k-chat-avatar--me" style="background:var(--cc-ink);color:var(--cc-white);">MG</div>
        <div style="flex:1;min-width:0;"><div class="k-chat-meta">
          <span class="k-chat-name" style="color:var(--cc-gold);">Casa Castel</span>
          <span class="k-chat-time">${fmtTs(ev._ts)}</span></div>
          <div style="margin-top:5px;"><img src="${pUrl}" alt="photo"
            style="max-width:100%;border-radius:6px;display:block;object-fit:contain;cursor:pointer;"
            onclick="openPhotoModal(this.src,'Photo')" onerror="this.style.display='none'"/></div>
        </div>
        <button class="k-delete-btn" title="Delete">✕</button></div>`;
    }
    return `<div class="k-chat-row" data-comment-id="${ev.id}">
      <div class="k-chat-avatar">${roomInitials(ev.room)}</div>
      <div style="flex:1;min-width:0;"><div class="k-chat-meta">
        <span class="k-chat-name">${esc(ev.room)}</span>
        <span class="k-chat-time">${fmtTs(ev._ts)}</span></div>
        <p class="k-chat-text">${esc(ev.text)}</p>
      </div>
      <button class="k-delete-btn" title="Delete">✕</button></div>`;
  }).join('');
}

/* ── FEED RENDER ────────────────────────────────────────── */
async function _kRenderFeed(weekRow) {
  const el    = document.getElementById('k-feed-mob'); if (!el) return;
  const elDsk = document.getElementById('k-feed-dsk');
  if (!weekRow) {
    el.innerHTML = '<p class="cc-note" style="padding:8px 0;">No data.</p>';
    if (elDsk) elDsk.innerHTML = el.innerHTML;
    return;
  }
  if (weekRow.status === 'missed') {
    el.innerHTML = '<p class="cc-note" style="padding:8px 0;">Week reset — marked as missed.</p>';
    if (elDsk) elDsk.innerHTML = el.innerHTML;
    return;
  }
  const comments = await _kGetComments(weekRow.id);
  const html = _kBuildFeedHtml(comments, weekRow);
  el.innerHTML = html;
  if (elDsk) elDsk.innerHTML = html;
  // Wire delete buttons on both feeds
  [el, elDsk].forEach(feed => {
    if (!feed) return;
    feed.querySelectorAll('[data-comment-id] .k-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const row = btn.closest('[data-comment-id]');
        const id  = row && row.dataset.commentId; if (!id) return;
        if (!confirm('Delete this message?')) return;
        await _kDeleteComment(id);
        await _kRenderFeed(_kWeekRow);
      });
    });
    scrollToBottom(feed);
  });
}

/* ── ROTATION STRIP ─────────────────────────────────────── */
async function _kRenderRotation(weekRow, absData, preRows) {
  const el = document.getElementById('k-mob-rot-strip'); if (!el) return;
  const rooms = _kGetRoomList();
  if (!rooms.length) { el.innerHTML = ''; return; }
  const idx        = kWeekIdx();
  const cyclePos   = ((idx % rooms.length) + rooms.length) % rooms.length;
  const cycleStart = idx - cyclePos;
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);

  // Cycle rows: use rows prefetched by loadKitchen(); otherwise one ranged
  // query — never one round-trip per room. Missing weeks map to null,
  // exactly like _kGetWeek()'s maybeSingle() did.
  let _rows = preRows;
  if (!_rows) {
    if (!sbL) return;
    const { data } = await sbL.from('kitchen_weeks').select('*')
      .gte('week_index', cycleStart).lte('week_index', cycleStart + rooms.length - 1);
    _rows = data || [];
  }
  const dbRows = rooms.map((_, i) => _rows.find(r => r.week_index === cycleStart + i) || null);

  let approvedCount = 0;
  for (let i = 0; i < cyclePos; i++) { if (dbRows[i] && dbRows[i].status === 'approved') approvedCount++; }
  const greenPct = approvedCount > 0 ? ((approvedCount / rooms.length) * 100).toFixed(1) + '%' : '0%';

  let trueNextI = -1;
  for (let offset = 1; offset <= rooms.length; offset++) {
    const ni     = (cyclePos + offset) % rooms.length;
    const slot   = cycleStart + cyclePos + offset;
    const nRoom  = rooms[ni];
    const nStart = new Date(K_START.getTime() + slot * 7 * 24 * 60 * 60 * 1000);
    const nEnd   = new Date(nStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    const nWs = nStart.toISOString().slice(0, 10);
    const nWe = nEnd.toISOString().slice(0, 10);
    if (!absData.some(a => a.room === nRoom && a.from_date <= nWe && a.to_date >= nWs) && !isVacant(nRoom)) {
      trueNextI = ni; break;
    }
  }

  const items = rooms.map((room, i) => {
    const slotIdx = (i === trueNextI && trueNextI < cyclePos)
      ? cycleStart + rooms.length + i
      : cycleStart + i;
    const info    = kWeekInfo(Math.max(0, slotIdx));
    const dateStr = info ? fmt(info.start) + '–' + fmt(info.end) : '—';
    const dbRow   = dbRows[i];
    const state   = _kRotState({
      isNow:       i === cyclePos,
      isPast:      i < cyclePos,
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

  // Desktop: rot-tl style matching cleaning tab and tenant
  const elDsk = document.getElementById('k-dsk-rot-list');
  if (elDsk) {
    elDsk.innerHTML = '<div class="rot-tl">' + rooms.map((room, i) => {
      const slotIdx = (i === trueNextI && trueNextI < cyclePos)
        ? cycleStart + rooms.length + i
        : cycleStart + i;
      const info    = kWeekInfo(Math.max(0, slotIdx));
      const dateStr = info ? fmt(info.start) + ' – ' + fmt(info.end) : '—';
      const dbRow   = dbRows[i];
      const state   = _kRotState({ isNow:i===cyclePos, isPast:i<cyclePos, isNext:i===trueNextI, dbStatus:dbRow?dbRow.status:null, room, weekStart:info?info.start:null, absenceRows:absData });
      const dotClass = { done:'rot-dot--done', now:'rot-dot--now', missed:'rot-dot--missed', skipped:'rot-dot--skipped', absent:'rot-dot--absent' }[state] || 'rot-dot--next';
      const topLine  = state === 'done' || state === 'now' ? 'rot-line-done'
                     : state === 'skipped' ? 'rot-line-skipped'
                     : state === 'absent'  ? 'rot-line-absent'
                     : state === 'missed'  ? 'rot-line-missed' : 'rot-line-faded';
      const botLine  = state === 'done' && i < cyclePos ? 'rot-line-done' : 'rot-line-faded';
      const badge    = {
        done:     '<span class="rot-badge rot-badge--done">✓ Done</span>',
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
      const email   = tenantEmail(room);
      const profile = (typeof _getProfile === 'function') ? _getProfile(room) : (S ? S.get('room_profile_' + room, {}) : {});
      const name    = profile.firstName || room;
      const subject = encodeURIComponent('Casa Castel Kitchen — Proof required');
      const body    = encodeURIComponent(`Hi ${name},\n\nPlease clean the kitchen and upload your proof in the app.\n\nCasa Castel`);
      const mailBtn = email
        ? `<a href="mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}" target="_blank" title="Send reminder to ${esc(room)}" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:var(--cc-r-sm);background:var(--cc-surface);border:0.5px solid var(--cc-rule);color:var(--cc-taupe);text-decoration:none;flex-shrink:0;margin-left:5px;" aria-label="Send reminder to ${esc(room)}"><i class="ti ti-mail" style="font-size:12px;" aria-hidden="true"></i></a>`
        : '';
      return `<div class="${rowClass}"><div class="rot-spine"><div class="rot-spine-top ${topLine}"></div><div class="rot-dot ${dotClass}"></div><div class="rot-spine-bot ${botLine}"></div></div><div class="rot-tl-body"><div class="rot-tl-info"><p class="rot-tl-room">${esc(room)}</p><p class="rot-tl-dates">${dateStr}</p></div><div style="display:flex;align-items:center;">${badge}${mailBtn}</div></div></div>`;
    }).join('') + '</div>';
  }
}
/* ── WEEK CARD ──────────────────────────────────────────── */
function _kRenderWeekCard(weekRow, absData) {
  const idx = kWeekIdx();
  const wi  = _kWeekInfo(idx); if (!wi) return;
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
  const dateStr = fmt(wi.start) + ' – ' + fmt(wi.end) + (wi.daysLeft > 0 ? ' · ' + wi.daysLeft + 'd left' : ' · ends today');

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('k-mob-room-name', wi.room);
  setTxt('k-mob-dates', dateStr);
  setTxt('k-dsk-room-name', wi.room);
  setTxt('k-dsk-dates', dateStr);

  const state    = _kRotState({
    isNow:       true,
    isPast:      false,
    dbStatus:    weekRow ? weekRow.status : null,
    room:        wi.room,
    weekStart:   wi.start,
    absenceRows: absData,
  });
  const dbStatus = weekRow ? weekRow.status : null;
  const isResub  = state === 'now' && weekRow && weekRow.reupload_count > 0 && dbStatus !== 'flagged';

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
    ? ({ done:'✓ Approved', missed:'✗ Missed', absent:'— Away', skipped:'— Skipped' }[state] || 'Pending')
    : dbStatus === 'flagged'       ? '⚑ Redo'
    : isResub                      ? '↑↑ Re-submitted'
    : dbStatus === 'submitted'     ? '↑ Submitted'
    : 'Pending';
  const chip = document.getElementById('k-mob-status-chip');
  if (chip) { chip.className = 'k-mob-status-chip ' + chipCls; chip.textContent = chipTxt; }
  const chipDsk = document.getElementById('k-dsk-status-chip');
  if (chipDsk) { chipDsk.className = 'k-mob-status-chip ' + chipCls; chipDsk.textContent = chipTxt; }

  // Action buttons
  const actEl = document.getElementById('k-mob-actions');
  if (!actEl) return;
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
  actEl.innerHTML = items.join('');
  const actDsk = document.getElementById('k-dsk-actions');
  if (actDsk) actDsk.innerHTML = items.join('');
}

/* ── NUDGE BANNER ───────────────────────────────────────── */
async function _kLoadNudgeBanner(weekRow) {
  if (!sbL) return;
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type', 'kitchen_nudge').order('created_at', { ascending: false }).limit(1).maybeSingle();
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
    if (weekRow && data.room !== 'All') {
      const statusMap = { pending:'Pending', submitted:'Submitted', approved:'Approved', flagged:'Flagged', missed:'Missed', skipped:'Skipped' };
      el.textContent = statusMap[weekRow.status] || '';
      el.style.display = el.textContent ? '' : 'none';
    } else { el.style.display = 'none'; }
  };
  _setStatus(status, weekRow, data);
  _setStatus(statusDsk, weekRow, data);
  banner.style.display = 'flex';
  if (bannerDsk) bannerDsk.style.display = 'flex';
}
async function _kDismissNudgeBanner() {
  const b = document.getElementById('k-mob-nudge-banner'); if (b) b.style.display = 'none';
  const d = document.getElementById('k-dsk-nudge-banner'); if (d) d.style.display = 'none';
  if (sbL) await sbL.from('lounge_data').delete().eq('type', 'kitchen_nudge');
}
async function _kDismissNudgeBannerDsk() {
  const b = document.getElementById('k-mob-nudge-banner'); if (b) b.style.display = 'none';
  const d = document.getElementById('k-dsk-nudge-banner'); if (d) d.style.display = 'none';
  if (sbL) await sbL.from('lounge_data').delete().eq('type', 'kitchen_nudge');
}

/* ── MODAL POPULATORS ───────────────────────────────────── */
async function _populateKHistory() {
  const el = document.getElementById('k-mob-history-body');
  if (!sbL) { el.innerHTML = '<p class="cc-note">Connect Supabase.</p>'; return; }
  const idx = kWeekIdx();
  const { data } = await sbL.from('kitchen_weeks').select('*').lte('week_index', idx).order('week_index', { ascending: false }).limit(12);
  if (!data || !data.length) { el.innerHTML = '<p class="cc-note">No past weeks yet.</p>'; return; }
  el.innerHTML = data.map(w => {
    const dateStr = kWeekDateRange(w.week_index);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid var(--cc-rule);"><div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);">${esc(w.room)}</p><p style="font-size:11px;color:var(--cc-taupe);">${dateStr}</p></div>${kHistPill(w.status)}</div>`;
  }).join('');
}
async function _populateKNudgeLog() {
  const el = document.getElementById('k-mob-nudgelog-body');
  if (!sbL) { el.innerHTML = '<p class="cc-note">Connect Supabase.</p>'; return; }
  const { data } = await sbL.from('lounge_data').select('*').eq('type', 'kitchen_nudge').order('created_at', { ascending: false }).limit(20);
  if (!data || !data.length) { el.innerHTML = '<p class="cc-note">No nudges sent yet.</p>'; return; }
  el.innerHTML = data.map(n =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid var(--cc-rule);"><div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);">${esc(n.body)}</p><p style="font-size:11px;color:var(--cc-taupe);">→ ${esc(n.room === 'All' ? 'All rooms' : n.room)} · ${fmtTs(new Date(n.created_at).getTime())}</p></div><button onclick="_kDeleteNudge('${n.id}',this)" style="font-size:10px;color:var(--cc-stone);background:none;border:none;cursor:pointer;">✕</button></div>`
  ).join('');
}
async function _kDeleteNudge(id, btn) {
  if (!sbL) return;
  await sbL.from('lounge_data').delete().eq('id', id);
  btn.closest('div[style]')?.remove();
}

/* ── CLEAR CHAT ─────────────────────────────────────────── */
async function kClearChat() {
  if (!_kWeekRow) return;
  if (!confirm('Clear all messages and delete proof photos? This cannot be undone.')) return;
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
async function _kSendMsg() {
  const mobInp = document.getElementById('k-mob-msg-input');
  const dskInp = document.getElementById('k-dsk-msg-input');
  // Use whichever input has content or last had focus
  const inp  = (dskInp && dskInp.value.trim()) ? dskInp : mobInp;
  const text = inp ? inp.value.trim() : ''; if (!text || !_kWeekRow || _kMobSending) return;
  _kMobSending = true; inp.value = '';
  const feed = document.getElementById('k-feed-mob');
  if (feed) {
    const tmp = document.createElement('div'); tmp.className = 'k-chat-row'; tmp.id = 'k-mob-optimistic';
    tmp.innerHTML = '<div class="k-chat-avatar k-chat-avatar--me" style="background:var(--cc-ink);color:var(--cc-white);">MG</div>'
      + '<div style="flex:1;min-width:0;"><div class="k-chat-meta"><span class="k-chat-name" style="color:var(--cc-gold);">Casa Castel</span>'
      + '<span class="k-chat-time" style="opacity:0.5;">sending…</span></div><p class="k-chat-text">' + esc(text) + '</p></div>';
    feed.appendChild(tmp); scrollToBottom(feed);
  }
  _kAddComment(_kWeekRow.id, 'Casa Castel', text, false).finally(() => { _kMobSending = false; });
}

/* ── PHOTO UPLOAD ───────────────────────────────────────── */
async function _kCompressImage(file, maxPx = 1280, quality = 0.80) {
  return new Promise(resolve => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) { if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; } else { w = Math.round(w * maxPx / h); h = maxPx; } }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
async function _kSendPhoto(file) {
  if (!file || !_kWeekRow) { alert('No active week.'); return; }
  if (file.size > 30 * 1024 * 1024) { alert('Max 30MB.'); return; }
  const compressed = await _kCompressImage(file);
  const feed = document.getElementById('k-feed-mob');
  const localUrl = URL.createObjectURL(compressed);
  if (feed) {
    const tmp = document.createElement('div'); tmp.className = 'k-chat-row'; tmp.id = 'k-landlord-photo-optimistic';
    tmp.innerHTML = '<div class="k-chat-avatar k-chat-avatar--me" style="background:var(--cc-ink);color:var(--cc-white);">MG</div>'
      + '<div style="flex:1;min-width:0;"><div class="k-chat-meta"><span class="k-chat-name" style="color:var(--cc-gold);">Casa Castel</span>'
      + '<span class="k-chat-time" style="opacity:0.5;">sending…</span></div>'
      + '<div style="margin-top:5px;"><img src="' + localUrl + '" style="max-width:100%;border-radius:6px;display:block;object-fit:contain;opacity:0.7;"/></div></div>';
    feed.appendChild(tmp); scrollToBottom(feed);
  }
  const idx  = kWeekIdx();
  const path = `week-${idx}-mgmt-${Date.now()}.jpg`;
  const { error } = await sbL.storage.from('kitchen-proofs').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
  document.getElementById('k-landlord-photo-optimistic')?.remove();
  if (error) { alert('Upload failed.'); return; }
  const { data } = sbL.storage.from('kitchen-proofs').getPublicUrl(path);
  await _kAddComment(_kWeekRow.id, 'Casa Castel', '[photo] ' + data.publicUrl, false);
}

/* ── ACTION HANDLERS ────────────────────────────────────── */
let _kWeekRow    = null;
let _kActionBusy = false;
let _kMobSending = false;
let _kChannel    = null;

async function kApprove() {
  if (!_kWeekRow || !sbL || _kActionBusy) return; _kActionBusy = true;
  try {
    await _kUpdateWeek(kWeekIdx(), { status:'approved', flagged:false, approved_at:new Date().toISOString() });
    await _kAddComment(_kWeekRow.id, 'Casa Castel', '✓ Approved by landlord.', false);
    await loadKitchen();
  } finally { _kActionBusy = false; }
}
async function kFlag() {
  if (!_kWeekRow || !sbL || _kActionBusy) return; _kActionBusy = true;
  try {
    await _kUpdateWeek(kWeekIdx(), { flagged:true, status:'flagged' });
    await _kAddComment(_kWeekRow.id, 'Casa Castel', '⚑ Flagged by landlord — please re-upload your photos.', true);
    await loadKitchen();
  } finally { _kActionBusy = false; }
}
async function kUnapprove() {
  if (!_kWeekRow || !sbL || _kActionBusy) return; _kActionBusy = true;
  try {
    await _kUpdateWeek(kWeekIdx(), { status:'submitted', flagged:false, approved_at:null });
    await _kAddComment(_kWeekRow.id, 'Casa Castel', '↩ Approval undone — week back under review.', false);
    await loadKitchen();
  } finally { _kActionBusy = false; }
}
async function kUnflag() {
  if (!_kWeekRow || !sbL || _kActionBusy) return; _kActionBusy = true;
  try {
    await _kUpdateWeek(kWeekIdx(), { flagged:false, status:'submitted' });
    await _kAddComment(_kWeekRow.id, 'Casa Castel', '✓ Flag removed — week back under review.', false);
    await loadKitchen();
  } finally { _kActionBusy = false; }
}
async function kReset() {
  if (!_kWeekRow || !sbL || _kActionBusy) return; _kActionBusy = true;
  try {
    if (!confirm(`Reset week for ${_kWeekRow.room}? Marks as Missed and clears proof.`)) return;
    // Collect all storage paths before deleting comments (same logic as kClearChat)
    const paths = [];
    if (_kWeekRow.photos && Array.isArray(_kWeekRow.photos))
      _kWeekRow.photos.forEach(p => { if (p.path) paths.push(p.path); });
    if (_kWeekRow.photo_path) paths.push(_kWeekRow.photo_path);
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
    if (paths.length) await sbL.storage.from('kitchen-proofs').remove(paths).catch(e => console.warn('Storage cleanup error', e));
    await _kDeleteComments(_kWeekRow.id);
    await _kUpdateWeek(kWeekIdx(), { status:'missed', photos:null, photo_path:null, photo_url:null, flagged:false, closed_at:new Date().toISOString() });
    await loadKitchen();
  } finally { _kActionBusy = false; }
}
async function kReopen() {
  if (!_kWeekRow || !sbL || _kActionBusy) return; _kActionBusy = true;
  try {
    if (!confirm(`Reopen week for ${_kWeekRow.room}? They can upload proof again.`)) return;
    await _kUpdateWeek(kWeekIdx(), { status:'pending', flagged:false, closed_at:null, photos:null, photo_path:null, photo_url:null, reupload_count:null, submitted_at:null });
    await loadKitchen();
  } finally { _kActionBusy = false; }
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
// Cleaning tab pattern: any DB change → loadKitchen(). No state, no guards.
function _kSubscribe() {
  if (_kChannel) { sbL.removeChannel(_kChannel); _kChannel = null; }
  _kChannel = sbL.channel('kitchen-landlord-rt')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kitchen_weeks' },    () => { setTimeout(() => loadKitchen(), 350); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kitchen_comments' }, async payload => {
      // If this is a submission comment, do a full reload so the chip + buttons update.
      // For regular chat messages, only re-render the feed to avoid a premature re-fetch.
      const text = payload.new?.text || '';
      if (text.startsWith('[submission] ') || text.startsWith('[system] ')) {
        setTimeout(() => loadKitchen(), 350);
      } else {
        if (_kWeekRow) await _kRenderFeed(_kWeekRow);
      }
    })
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'kitchen_absences' }, async () => { await loadKitchen(); })
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'lounge_data' },      async payload => { const t = payload.new?.type || payload.old?.type; const isDelete = payload.eventType === 'DELETE' || (!payload.new?.id && payload.old?.id); if (t === 'kitchen_nudge' || (isDelete && payload.old?.type === 'kitchen_nudge')) { await _kLoadNudgeBanner(_kWeekRow); } else if (t === 'hc_done') { await loadKitchen(); } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, async () => {
      if (typeof loadRoomsData === 'function') await loadRoomsData();
      await loadKitchen();
    })
    .subscribe();
}

/* ── MAIN LOAD — single function, cleaning tab pattern ─────
   Called on init and by every realtime event.
   Fetches everything fresh, renders everything, no state deps.
   ─────────────────────────────────────────────────────────── */
async function loadKitchen() {
  // Stage 1 — rooms master data + kitchen config in parallel (was sequential)
  const _needRooms = (typeof appRooms !== 'undefined' && appRooms.length === 0 && typeof loadRoomsData === 'function');
  await Promise.all([
    _needRooms ? loadRoomsData() : Promise.resolve(),
    loadKitchenRoomsFromSupabase(),
  ]);
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
  const _rotRooms   = _kGetRoomList();
  const _cyclePos   = _rotRooms.length ? ((idx % _rotRooms.length) + _rotRooms.length) % _rotRooms.length : 0;
  const _cycleStart = idx - _cyclePos;
  const _cycleEnd   = _rotRooms.length ? _cycleStart + _rotRooms.length - 1 : idx;

  let [cycleRows, absData] = await Promise.all([
    sbL.from('kitchen_weeks').select('*')
      .gte('week_index', Math.min(_cycleStart, idx))
      .lte('week_index', Math.max(_cycleEnd, idx))
      .then(r => r.data || []),
    sbL.from('kitchen_absences').select('room,from_date,to_date').then(r => r.data || [])
  ]);

  let weekRow = cycleRows.find(r => r.week_index === idx) || null;

  // Create row if missing (first visit of a new week only)
  if (!weekRow) {
    const { data } = await sbL.from('kitchen_weeks')
      .insert({ week_index: idx, room: info.room, status: 'pending' })
      .select().single();
    weekRow = data || (await _kGetWeek(idx));
    if (weekRow) cycleRows = cycleRows.concat([weekRow]);
  }
  _kWeekRow = weekRow;

  // Render everything — week card is sync; the three async renderers are
  // independent (different DOM targets, no shared writes) → run in parallel.
  _kRenderWeekCard(weekRow, absData);
  await Promise.all([
    _kRenderFeed(weekRow),
    _kRenderRotation(weekRow, absData, cycleRows),
    _kLoadNudgeBanner(weekRow),
  ]);

  // Start realtime only once — channel must stay alive permanently
  if (!_kChannel) _kSubscribe();

  // Rooms change hook
  if (typeof onRoomsChange === 'function' && !loadKitchen._roomsWired) { loadKitchen._roomsWired = true; onRoomsChange(() => loadKitchen()); }
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
    // Run delete and insert in parallel — avoids two sequential round-trips
    await Promise.all([
      sbL.from('lounge_data').delete().eq('type', 'kitchen_nudge'),
      sbL.from('lounge_data').insert({
        type: 'kitchen_nudge',
        room: toBtn.dataset.to,
        body: typeBtn.dataset.type,
        title: note || null
      })
    ]);
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

/* ── WIRE COMPOSE + PHOTO + PWA KEYBOARD FIX ───────────── */
(function _wireCompose() {
  const mobInput = document.getElementById('k-mob-msg-input');
  const mobPhoto = document.getElementById('k-mob-photo-btn');
  const mobFile  = document.getElementById('k-mob-photo-file');
  const dskInput = document.getElementById('k-dsk-msg-input');
  const dskPhoto = document.getElementById('k-dsk-photo-btn');
  const dskFile  = document.getElementById('k-dsk-photo-file');

  mobInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _kSendMsg(); } });
  dskInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _kSendMsg(); } });

  mobPhoto?.addEventListener('click', () => mobFile?.click());
  mobFile?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    mobFile.value = ''; mobPhoto.style.opacity = '0.5';
    await _kSendPhoto(file);
    mobPhoto.style.opacity = '';
  });

  dskPhoto?.addEventListener('click', () => dskFile?.click());
  dskFile?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    dskFile.value = ''; dskPhoto.style.opacity = '0.5';
    await _kSendPhoto(file);
    dskPhoto.style.opacity = '';
  });

  // PWA keyboard fix — mobile only (not needed on desktop)
  wireComposeBlur(mobInput);
})();
