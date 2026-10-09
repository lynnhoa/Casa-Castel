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
      ${ccRefreshBtnHtml('', 'lounge-refresh-btn')}
    </div>
    <div class="l-feed" id="lounge-feed">
      <p class="cc-note" style="padding:8px 0 4px;">No messages yet. Say hello 👋</p>
    </div>
    <div id="lounge-compose-mob"></div>
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
        ${ccRefreshBtnHtml('', 'lounge-refresh-btn-desktop')}
      </div>
      <div id="lounge-notice-banner-desktop" style="display:none;flex-shrink:0;padding:8px 14px;border-bottom:0.5px solid #EAD96B;align-items:center;gap:8px;">
        <span style="font-size:13px;flex-shrink:0;" id="lounge-notice-banner-icon-dsk">ⓘ</span>
        <span id="lounge-notice-banner-text-dsk" style="flex:1;font-size:12px;font-weight:300;line-height:1.5;"></span>
      </div>
      <div class="l-feed" id="lounge-feed-desktop">
        <p class="cc-note" style="padding:8px 0 4px;">No messages yet. Say hello 👋</p>
      </div>
      <div id="lounge-compose-dsk"></div>
    </div><!-- /.l-desktop-right -->

  </div><!-- /.l-desktop-grid -->
`

/* ── STATE ──────────────────────────────────────────────── */
let _loungeSub = null;
/* Every render counts up; a load whose answer arrives after a newer render
   (e.g. a live insert) is dropped, so an old answer never hides a new post */
let _annSeq = 0, _noticeSeq = 0;
let _loungeDelTimer = null;   // one reload after a burst of live deletes

/* ── ANNOUNCEMENTS ──────────────────────────────────────── */
async function loadAnnouncements() {
  const el = document.getElementById('ann-list'); if (!el) return;
  if (!sbL) { el.innerHTML = '<p class="cc-note" style="padding:4px 0;">—</p>'; return; }
  const my = ++_annSeq;
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','announcement').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if (my !== _annSeq) return;   // a newer announcement was shown meanwhile
  _renderAnn(data);
}

function _renderAnn(data) {
  _annSeq++;
  const emptyHtml = '<p class="cc-note" style="padding:4px 0;">No announcement yet.</p>';
  const annHtml = !data ? emptyHtml : `
    <div class="ann-card${data.pinned ? ' ann-card--pinned' : ''}">
      <div class="ann-top">
        <span class="ann-top-lbl">Casa Castel</span>
        ${_annFresh(data) ? '<span class="ann-new">New</span>' : ''}
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
  _annCurrent = data || null;
  _annCheckNew();
}

/* ── NEW ANNOUNCEMENT ──────────────────────────────────────
   Each phone remembers the date of the last announcement it has seen
   (localStorage cc_ann_seen = created_at). A newer one:
     · pops up once as a sheet (title + text + "Got it"), on any tab
     · gold dot on the Lounge tab until it was seen
     · gold "New" chip on the card while unseen and for 3 days after posting
   Closing the sheet (Got it, ✕ or tapping outside) = seen.
   An edit keeps the original date → it never pops up again.        */
const CC_ANN_SEEN    = 'cc_ann_seen';
const CC_ANN_NEW_MS  = 3 * 24 * 60 * 60 * 1000;   // "New" chip stays 3 days
let _annCurrent = null;
function _annKey(a)    { return a && a.created_at ? String(a.created_at) : null; }
function _annIsUnseen(a) {
  const k = _annKey(a); if (!k) return false;
  try { return localStorage.getItem(CC_ANN_SEEN) !== k; } catch (e) { return false; }
}
function _annFresh(a) {
  if (!a) return false;
  if (_annIsUnseen(a)) return true;
  return Date.now() - new Date(a.created_at).getTime() < CC_ANN_NEW_MS;
}
function _annCheckNew() {
  const unseen = localStorage.getItem('cc_role') === 'tenant'
              && !new URLSearchParams(location.search).has('preview')   // landlord preview: never
              && _annIsUnseen(_annCurrent);
  document.querySelector('.cc-tab[data-tab="lounge"]')?.classList.toggle('ann-unseen', unseen);
  if (unseen) _annShowNew(); else _annHideNew();
}
function _annModal() {
  let ov = document.getElementById('ann-new-modal');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.className = 'cc-modal-overlay';
  ov.id = 'ann-new-modal';
  ov.innerHTML = `
    <div class="cc-modal-sheet ann-new-sheet">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title"><span class="ann-new-dot" aria-hidden="true"></span>New announcement</span>
        <button class="cc-modal-close" aria-label="Close" data-ann-seen>✕</button>
      </div>
      <div class="cc-modal-body">
        <p class="ann-new-meta"><span>Casa Castel</span><span id="ann-new-date"></span></p>
        <p class="ann-title-text ann-new-title" id="ann-new-title"></p>
        <p class="ann-body-text ann-new-body" id="ann-new-body"></p>
        <button type="button" class="ann-new-btn" data-ann-seen>Got it</button>
      </div>
    </div>`;
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-ann-seen]')) _annMarkSeen();
  });
  document.body.appendChild(ov);
  return ov;
}
function _annShowNew() {
  const a = _annCurrent; if (!a) return;
  const ov = _annModal();
  const t = document.getElementById('ann-new-title');
  t.textContent = a.title || '';
  t.style.display = a.title ? '' : 'none';
  document.getElementById('ann-new-body').textContent = a.body || '';
  document.getElementById('ann-new-date').textContent = fmtTs(new Date(a.created_at).getTime());
  ov.classList.add('open');
}
function _annHideNew() { document.getElementById('ann-new-modal')?.classList.remove('open'); }
function _annMarkSeen() {
  const k = _annKey(_annCurrent);
  if (k) { try { localStorage.setItem(CC_ANN_SEEN, k); } catch (e) {} }
  _annCheckNew();
}

/* ── NOTICE ─────────────────────────────────────────────── */
async function loadNotice() {
  if (!sbL) { _renderNotice(null); return; }
  const my = ++_noticeSeq;
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','notice').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if (my !== _noticeSeq) return;   // a newer notice was shown meanwhile
  _renderNotice(data || null);
}

function _renderNotice(data) {
  _noticeSeq++;
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

/* A message is text, or a photo ("[photo] <url>") */
function _loungeBodyHtml(body, me) {
  const url = typeof body === 'string' && body.startsWith('[photo] ') ? ccPhotoUrl(body.slice(8)) : '';
  if (url) return `<img class="msg-photo" src="${esc(url)}" alt="Photo" loading="lazy" onclick="ccOpenPhoto(this.src)" onerror="this.style.display='none'"/>`;
  return `<p class="msg-text">${parseMsg(body, me)}</p>`;
}

function _msgHtml(m, currentRoom) {
  const isCC  = m.room === 'Casa Castel';
  const isMe  = m.room === currentRoom;
  return `<div class="msg-row" data-id="${m.id}">
    <div class="msg-avatar${isCC ? ' msg-avatar--mgmt' : ''}"${ccAvAttrs(m.room)}>${roomInitials(m.room)}</div>
    <div class="msg-content">
      <div class="msg-meta">
        <span class="msg-name${isCC ? ' msg-name--mgmt' : ''}"${ccNameAttrs(m.room)}>${esc(ccNameText(m.room))}</span>
        <span class="msg-time">${fmtTs(new Date(m.created_at).getTime())}</span>
      </div>
      ${_loungeBodyHtml(m.body, currentRoom)}
    </div>
  </div>`;
}

/* Send one chat message (text or photo) with an instant "sending" row */
async function _loungeInsert(room, body) {
  const tmpId = '_tmp_' + Date.now();
  _appendMsg({ id: tmpId, room, body, created_at: new Date().toISOString(), type: 'message' }, room);
  const { data, error } = await sbL.from('lounge_data').insert({ type:'message', room, body }).select().maybeSingle();
  _removeOptimistic();
  if (error) throw error;
  if (data) _appendMsg(data, room);
  return true;
}
/* Compose card → photo first (if any), then the text */
async function _loungeSendTenant(room, { text, photo }) {
  if (!sbL || !room) return false;
  if (photo) {
    const url = await ccUploadPhoto(photo, 'lounge/' + room.replace(/[^A-Za-z0-9_-]/g, '') + '-' + Date.now() + '.jpg');
    await _loungeInsert(room, '[photo] ' + url);
  }
  if (text) await _loungeInsert(room, text);
  return true;
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
      // Supabase often sends only the id on delete (no type) → handle every case safely:
      // a deleted message is removed by id; announcement + notice are re-loaded (never just hidden),
      // so the birthday notice going away brings back the notice underneath it.
      const old = payload.old || {};
      if (old.id) document.querySelectorAll(`.msg-row[data-id="${old.id}"]`).forEach(el => el.remove());
      if (old.type === 'message') return;
      // One reload of announcement + notice 0.5 s after the last delete (e.g. "reset chat" deletes many rows at once)
      clearTimeout(_loungeDelTimer);
      _loungeDelTimer = setTimeout(() => { loadAnnouncements(); loadNotice(); }, 500);
    })
    .subscribe();
}

/* Messages + announcement + notice together (resume + refresh buttons) */
function _loungeReloadAll(room) {
  loadAnnouncements();
  loadNotice();
  loadLounge(room);
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

  // Compose cards (phone + iPad/laptop): text, photo (camera or library), send — no + for tenants
  ['lounge-compose-mob', 'lounge-compose-dsk'].forEach(id => ccCompose(document.getElementById(id), {
    placeholder: 'Message the house…',
    camera: 'choice',
    onSend: msg => _loungeSendTenant(room, msg),
  }));
  document.getElementById('lounge-refresh-btn')
    ?.addEventListener('click', () => _loungeReloadAll(room));
  document.getElementById('lounge-refresh-btn-desktop')
    ?.addEventListener('click', () => _loungeReloadAll(room));

  // Posts normally arrive live, but iPhone pauses the live connection while the app is in
  // the background → when the app comes back, reload messages, announcement AND notice (max every 3 s)
  ccOnResume(() => _loungeReloadAll(room), 3000);

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
