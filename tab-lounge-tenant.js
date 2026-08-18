/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — TENANT LOUNGE TAB
   js/tab-lounge-tenant.js

   Tenant Lounge: read announcements + notice, send/receive chat.
   No compose, no delete, no reset — read + send own messages only.
   Depends on: constants.js, utils.js, supabase-client.js,
               chat-viewport.js
   ───────────────────────────────────────────────────────────── */

/* ── INJECT HTML ────────────────────────────────────────── */
document.getElementById('tab-lounge').innerHTML = `

  <!-- Mobile: ann strip + notice strip + chat — hidden on desktop via CSS -->
  <div class="l-ann-strip">
    <div id="ann-list"><p class="cc-note" style="padding:4px 0;">No announcement yet.</p></div>
  </div>

  <div class="l-notice-strip" id="notice-strip">
    <span class="l-notice-icon">ⓘ</span>
    <span class="l-notice-text" id="notice-strip-text"></span>
  </div>

  <div class="l-chat">
    <div class="l-chat-hdr">
      <span class="l-chat-lbl">House chat</span>
      <button class="l-chat-tlink" id="lounge-refresh-btn">↺ Refresh</button>
    </div>
    <div class="l-feed" id="lounge-feed">
      <p class="cc-note" style="padding:8px 0 4px;">No messages yet. Say hello 👋</p>
    </div>
    <div class="l-compose">
      <input class="l-compose-input" id="lounge-input" type="text" placeholder="Message the house…"/>
      <button class="l-compose-send" id="lounge-send">↑</button>
    </div>
  </div>

  <!-- Desktop 2-column layout — hidden on mobile via CSS -->
  <div class="l-desktop-grid">

    <!-- Left column: announcement + notice (read-only) -->
    <div class="l-desktop-left">

      <div class="l-dsk-section">
        <div class="l-dsk-section-hdr">
          <span class="l-dsk-section-lbl">Announcement</span>
        </div>
        <div id="ann-list-desktop"><p class="cc-note" style="padding:4px 0;">No announcement yet.</p></div>
      </div>

    </div><!-- /.l-desktop-left -->

    <!-- Right column: chat -->
    <div class="l-desktop-right">
      <div class="l-dsk-chat-hdr">
        <span class="l-dsk-chat-lbl">House chat</span>
        <button class="l-dsk-chat-link" id="lounge-refresh-btn-desktop">↺ Refresh</button>
      </div>
      <div id="lounge-notice-banner-desktop" style="display:none;flex-shrink:0;padding:8px 14px;border-bottom:0.5px solid #EAD96B;align-items:center;gap:8px;">
        <span style="font-size:13px;flex-shrink:0;" id="lounge-notice-banner-icon-dsk">ⓘ</span>
        <span id="lounge-notice-banner-text-dsk" style="flex:1;font-size:12px;font-weight:300;line-height:1.5;"></span>
      </div>
      <div class="l-feed" id="lounge-feed-desktop">
        <p class="cc-note" style="padding:8px 0 4px;">No messages yet. Say hello 👋</p>
      </div>
      <div class="compose-bar">
        <textarea class="compose-input" id="lounge-input-desktop" placeholder="Message the house…" rows="1"></textarea>
        <button class="compose-send" id="lounge-send-desktop">↑</button>
      </div>
    </div><!-- /.l-desktop-right -->

  </div><!-- /.l-desktop-grid -->
`

/* ── STATE ──────────────────────────────────────────────── */
let _loungeSub = null;

/* ── ANNOUNCEMENTS ──────────────────────────────────────── */
async function loadAnnouncements() {
  const el = document.getElementById('ann-list'); if (!el) return;
  if (!sbL) { el.innerHTML = '<p class="cc-note" style="padding:4px 0;">—</p>'; return; }
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','announcement').order('created_at',{ascending:false}).limit(1).maybeSingle();
  _renderAnn(data);
}

function _renderAnn(data) {
  const emptyHtml = '<p class="cc-note" style="padding:4px 0;">No announcement yet.</p>';
  const annHtml = !data ? emptyHtml : `
    <div class="ann-card${data.pinned ? ' ann-card--pinned' : ''}">
      <div class="ann-top">
        <span class="ann-top-lbl">Casa Castel</span>
        ${data.pinned ? '<span class="ann-pin">Pinned</span>' : ''}
        <span class="ann-date">${fmtTs(new Date(data.created_at).getTime())}</span>
      </div>
      ${data.title ? `<p class="ann-title-text">${esc(data.title)}</p>` : ''}
      <p class="ann-body-text">${esc(data.body)}</p>
    </div>`;
  const el    = document.getElementById('ann-list');
  const elDsk = document.getElementById('ann-list-desktop');
  if (el)    el.innerHTML    = annHtml;
  if (elDsk) elDsk.innerHTML = annHtml;
}

/* ── NOTICE ─────────────────────────────────────────────── */
async function loadNotice() {
  if (!sbL) { _renderNotice(null); return; }
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','notice').order('created_at',{ascending:false}).limit(1).maybeSingle();
  _renderNotice(data || null);
}

function _renderNotice(data) {
  const strip     = document.getElementById('notice-strip');
  const bannerDsk = document.getElementById('lounge-notice-banner-desktop');
  const textDsk   = document.getElementById('lounge-notice-banner-text-dsk');
  const iconDsk   = document.getElementById('lounge-notice-banner-icon-dsk');
  const cols = {
    yellow: { bg:'#FEFCE8', bd:'#EAD96B', tx:'#78640A', ic:'#A0860E' },
    green:  { bg:'#F0FDF4', bd:'#86EFAC', tx:'#14532D', ic:'#16A34A' },
    red:    { bg:'#FFF1F2', bd:'#FECDD3', tx:'#9F1239', ic:'#E11D48' },
  };
  if (data && data.body) {
    const c = data.color || 'yellow';
    const col = cols[c] || cols.yellow;
    if (strip) {
      document.getElementById('notice-strip-text').textContent = data.body;
      strip.className = 'l-notice-strip visible ' + c;
    }
    if (bannerDsk) {
      bannerDsk.style.display = 'flex';
      bannerDsk.style.background = col.bg;
      bannerDsk.style.borderBottomColor = col.bd;
      if (textDsk) { textDsk.textContent = data.body; textDsk.style.color = col.tx; }
      if (iconDsk) iconDsk.style.color = col.ic;
    }
  } else {
    if (strip)     strip.className = 'l-notice-strip';
    if (bannerDsk) bannerDsk.style.display = 'none';
  }
}

/* ── CHAT ───────────────────────────────────────────────── */
async function loadLounge(room) {
  const feed    = document.getElementById('lounge-feed');
  const feedDsk = document.getElementById('lounge-feed-desktop');
  const empty   = '<p class="cc-note" style="padding:8px 0 4px;">No messages yet. Say hello 👋</p>';
  if (!sbL) {
    if (feed)    feed.innerHTML    = empty;
    if (feedDsk) feedDsk.innerHTML = empty;
    return;
  }
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','message').order('created_at',{ascending:true}).limit(100);
  const html = (!data || !data.length) ? empty : data.map(m => _msgHtml(m, room)).join('');
  if (feed)    { feed.innerHTML    = html; scrollToBottom(feed); }
  if (feedDsk) { feedDsk.innerHTML = html; scrollToBottom(feedDsk); }
}

function _msgHtml(m, currentRoom) {
  const isCC  = m.room === 'Casa Castel';
  const isMe  = m.room === currentRoom;
  return `<div class="msg-row" data-id="${m.id}">
    <div class="msg-avatar${isCC ? ' msg-avatar--mgmt' : ''}">${roomInitials(m.room)}</div>
    <div class="msg-content">
      <div class="msg-meta">
        <span class="msg-name${isCC ? ' msg-name--mgmt' : ''}">${esc(m.room)}</span>
        <span class="msg-time">${fmtTs(new Date(m.created_at).getTime())}</span>
      </div>
      <p class="msg-text">${parseMsg(m.body, currentRoom)}</p>
    </div>
  </div>`;
}

async function sendLounge(room, inputId) {
  if (!sbL || !room) return;
  const input = document.getElementById(inputId || 'lounge-input');
  if (!input) return;
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  // Optimistic append — no full feed reload
  const tmpId = '_tmp_' + Date.now();
  const opt = { id: tmpId, room, body: text, created_at: new Date().toISOString(), type: 'message' };
  _appendMsg(opt, room);
  const { data } = await sbL.from('lounge_data').insert({ type:'message', room, body:text }).select().maybeSingle();
  _removeOptimistic();
  if (data) _appendMsg(data, room);
}

// Appends a single message to both feeds (deduplicates by id)
function _appendMsg(m, currentRoom) {
  ['lounge-feed', 'lounge-feed-desktop'].forEach(feedId => {
    const feed = document.getElementById(feedId);
    if (!feed) return;
    if (m.id && feed.querySelector(`.msg-row[data-id="${m.id}"]`)) return;
    feed.querySelector('.cc-note')?.remove();
    feed.insertAdjacentHTML('beforeend', _msgHtml(m, currentRoom));
    scrollToBottom(feed);
  });
}

// Removes optimistic placeholder rows from both feeds
function _removeOptimistic() {
  ['lounge-feed', 'lounge-feed-desktop'].forEach(feedId => {
    document.getElementById(feedId)
      ?.querySelectorAll('.msg-row[data-id^="_tmp_"]')
      .forEach(el => el.remove());
  });
}

/* ── REALTIME ───────────────────────────────────────────── */
function subscribeLounge(room) {
  if (!sbL || _loungeSub) return;
  _loungeSub = sbL.channel('lounge-tenant')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'lounge_data' }, payload => {
      const r = payload.new || {};
      if (r.type === 'message')      _appendMsg(r, room);
      if (r.type === 'announcement') _renderAnn(r);
      if (r.type === 'notice')       _renderNotice(r);
      if (r.type === 'hc_done')      loadHouseCleaning?.(room);
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'lounge_data' }, payload => {
      const r = payload.new || {};
      if (r.type === 'announcement') _renderAnn(r);
      if (r.type === 'notice')       _renderNotice(r);
    })
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'lounge_data' }, payload => {
      const old = payload.old || {};
      if (old.type === 'message') {
        if (old.id) document.querySelectorAll(`.msg-row[data-id="${old.id}"]`).forEach(el => el.remove());
      } else if (old.type === 'announcement') {
        _renderAnn(null);
      } else if (old.type === 'notice') {
        _renderNotice(null);
      }
    })
    .subscribe();
}

/* ── EVENT WIRING (called after showApp sets currentRoom) ── */
function initLoungeTab(room) {
  if (initLoungeTab._wired) {
    // Already wired — just reload data without re-attaching event listeners
    loadAnnouncements();
    loadNotice();
    loadLounge(room);
    initLoungeTab._justInited = true;  // prevent loadLoungeAll from firing a second load
    return;
  }
  initLoungeTab._wired = true;

  // Mobile wiring
  document.getElementById('lounge-send')
    ?.addEventListener('click', () => sendLounge(room, 'lounge-input'));
  document.getElementById('lounge-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendLounge(room, 'lounge-input'); }});
  document.getElementById('lounge-refresh-btn')
    ?.addEventListener('click', () => loadLounge(room));

  // Desktop wiring
  document.getElementById('lounge-send-desktop')
    ?.addEventListener('click', () => sendLounge(room, 'lounge-input-desktop'));
  document.getElementById('lounge-input-desktop')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendLounge(room, 'lounge-input-desktop'); }});
  document.getElementById('lounge-refresh-btn-desktop')
    ?.addEventListener('click', () => loadLounge(room));

  // v2 keyboard fix
  wireComposeBlur(document.getElementById('lounge-input'));

  loadAnnouncements();
  loadNotice();
  loadLounge(room);
  initLoungeTab._justInited = true;
  subscribeLounge(room);
}

/* ── loadLoungeAll alias — called by switchTab on tab switch ── */
function loadLoungeAll() {
  const room = (typeof currentRoom !== 'undefined' && currentRoom) ? currentRoom : null;
  // initLoungeTab already loaded everything on first login — skip to avoid double load
  if (initLoungeTab._justInited) { initLoungeTab._justInited = false; return; }
  loadAnnouncements();
  loadNotice();
  if (room) loadLounge(room);
  // If room not yet known, initLoungeTab will load when auth completes
}
