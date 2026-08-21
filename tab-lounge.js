/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — LANDLORD LOUNGE TAB
   js/tab-lounge.js

   Renders the Lounge tab for the landlord.
   - Announcement: post/delete, pin toggle
   - Notice strip: post/clear, colour picker (yellow/green/red)
   - Chat: realtime feed, send, delete, reset
   - Three bottom-sheet modals (mobile): Ann · Notice · Actions
   Depends on: constants.js, utils.js, storage.js, supabase-client.js,
               chat-viewport.js
   ───────────────────────────────────────────────────────────── */

/* ── INJECT HTML ────────────────────────────────────────── */
document.getElementById('tab-lounge').innerHTML = `

  <!-- ① Mobile: ann strip + notice strip + chat — hidden on desktop via CSS -->
  <div class="l-ann-strip">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:9px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#8C5A1A;">Announcement</span>
      <button onclick="loungeOpenModal('ann')" style="font-size:9px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--cc-taupe);background:none;border:none;cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px;">Edit ›</button>
    </div>
    <div id="ann-list"><p class="cc-note" style="padding:4px 0;">No announcement posted yet.</p></div>
  </div>

  <div class="l-notice-strip" id="notice-posted">
    <span class="l-notice-icon">ⓘ</span>
    <span class="l-notice-text" id="notice-posted-text"></span>
    <button class="l-notice-edit" onclick="loungeOpenModal('notice')">Edit ›</button>
  </div>

  <div class="l-chat">
    <div class="l-chat-hdr">
      <span class="l-chat-lbl">House chat</span>
      <div style="display:flex;gap:10px;align-items:center;">
        <button class="l-chat-tlink" onclick="loadLounge()">↺ Refresh</button>
        <button class="l-chat-tlink" onclick="loungeOpenModal('actions')" style="background:var(--cc-ink);color:var(--cc-white);border:none;border-radius:var(--cc-r-sm);padding:4px 10px;text-decoration:none;font-size:10px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;">⋯ More</button>
      </div>
    </div>
    <div class="l-feed" id="lounge-feed">
      <p class="cc-note" style="padding:8px 0 4px;">No messages yet.</p>
    </div>
    <div class="l-compose">
      <button class="l-action-btn" onclick="loungeOpenModal('actions')" title="Actions">⊕</button>
      <input class="l-compose-input" id="lounge-input" type="text" placeholder="Message as Casa Castel…"/>
      <button class="l-compose-send" id="lounge-send">↑</button>
    </div>
  </div>

  <!-- ② Desktop 2-column layout — hidden on mobile via CSS -->
  <div class="l-desktop-grid">

    <!-- Left column: current status + compose forms -->
    <div class="l-desktop-left">

      <div class="l-dsk-section">
        <div class="l-dsk-section-hdr">
          <span class="l-dsk-section-lbl">Announcement</span>
          <button class="l-dsk-section-action" onclick="loungeOpenModal('ann')">+ New</button>
        </div>
        <div id="ann-list-desktop"><p class="cc-note" style="padding:4px 0;">No announcement posted yet.</p></div>
      </div>

      <div class="l-dsk-section">
        <p class="l-dsk-compose-lbl">New announcement</p>
        <div class="cc-input-wrap cc-mb-8">
          <label class="cc-input-label" for="ann-title-input">Title (optional)</label>
          <input class="cc-input" id="ann-title-input" type="text" placeholder="e.g. Important: bin day change"/>
        </div>
        <div class="cc-input-wrap cc-mb-8">
          <label class="cc-input-label" for="ann-body-input">Message</label>
          <textarea class="cc-input cc-textarea" id="ann-body-input" placeholder="Write your announcement…" rows="3"></textarea>
        </div>
        <label class="pin-toggle">
          <input type="checkbox" id="ann-pin-check"/>
          <span class="pin-toggle-label">Pin this announcement</span>
        </label>
        <div class="ann-compose-actions">
          <button class="cc-btn cc-btn--primary" id="ann-post-btn" style="flex:1;">Post to app</button>
          <a class="btn-email" id="ann-email-btn" href="#" target="_blank" style="flex:1;justify-content:center;">✉ Email all</a>
        </div>
      </div>

      <div class="l-dsk-section" style="border-bottom:none;">
        <p class="l-dsk-compose-lbl">Post notice</p>
        <div class="notice-compose">
          <div class="notice-compose__header">
            <span class="notice-compose__icon">ⓘ</span>
            <span class="notice-compose__label">Write a notice</span>
            <div class="notice-color-picker" style="margin-left:auto;display:flex;gap:6px;align-items:center;">
              <button type="button" class="notice-color-btn notice-color-btn--yellow active" data-color="yellow" title="Yellow" aria-label="Yellow"></button>
              <button type="button" class="notice-color-btn notice-color-btn--green"  data-color="green"  title="Green"  aria-label="Green"></button>
              <button type="button" class="notice-color-btn notice-color-btn--red"    data-color="red"    title="Red"    aria-label="Red"></button>
            </div>
          </div>
          <textarea class="notice-compose__input" id="notice-input" rows="2" placeholder="e.g. Plumber visiting Thursday 10–12. Please keep hallway clear."></textarea>
          <div class="notice-compose__footer">
            <button type="button" class="cc-btn--ghost" id="notice-clear-btn" style="display:none;flex:1;">Clear notice</button>
            <button type="button" class="notice-compose__btn" id="notice-post-btn" style="flex:1;">Post notice</button>
          </div>
        </div>
      </div>

    </div><!-- /.l-desktop-left -->

    <!-- Right column: chat (feed + fixed compose bar) -->
    <div class="l-desktop-right">
      <div class="l-dsk-chat-hdr">
        <span class="l-dsk-chat-lbl">House chat</span>
        <div style="display:flex;gap:10px;align-items:center;">
          <button class="l-dsk-chat-link" onclick="loadLounge()">↺ Refresh</button>
          <a class="l-dsk-chat-link" id="lounge-email-all-desktop" href="#" target="_blank">✉ Email all</a>
          <button class="l-dsk-chat-link l-dsk-chat-link--danger" id="lounge-reset-btn">↺ Reset chat</button>
        </div>
      </div>
      <div id="lounge-notice-banner-desktop" style="display:none;flex-shrink:0;padding:8px 14px;border-bottom:0.5px solid #EAD96B;align-items:center;gap:8px;">
        <span style="font-size:13px;flex-shrink:0;" id="lounge-notice-banner-icon-dsk">ⓘ</span>
        <span id="lounge-notice-banner-text-dsk" style="flex:1;font-size:12px;font-weight:300;line-height:1.5;"></span>
        <button onclick="clearNotice()" style="font-size:9px;font-weight:500;letter-spacing:0.07em;text-transform:uppercase;color:#9F1239;background:none;border:none;cursor:pointer;flex-shrink:0;font-family:inherit;">Clear</button>
      </div>
      <div class="lounge-feed" id="lounge-feed-desktop">
        <p class="cc-note" style="padding:8px 0 4px;">No messages yet.</p>
      </div>
      <div class="compose-bar">
        <textarea class="compose-input" id="lounge-input-desktop" placeholder="Message as Casa Castel… @London @Paris @Oslo" rows="1"></textarea>
        <button class="compose-send" id="lounge-send-desktop">↑</button>
      </div>
    </div><!-- /.l-desktop-right -->

  </div><!-- /.l-desktop-grid -->

  <!-- ── MOBILE MODALS ── -->

  <!-- Announcement modal -->
  <div class="cc-modal-overlay" id="lounge-modal-ann" onclick="if(event.target===this)loungeCloseModal('ann')">
    <div class="cc-modal-sheet" style="max-height:85vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">Announcement</span>
        <button class="cc-modal-close" onclick="loungeCloseModal('ann')">✕</button>
      </div>
      <div class="cc-modal-body">
        <p style="font-size:9px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:8px;">Currently posted</p>
        <div id="ann-list-modal"><p class="cc-note" style="padding:4px 0;">No announcement posted yet.</p></div>
        <div style="height:0.5px;background:var(--cc-rule);margin:14px 0;"></div>
        <p style="font-size:9px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:10px;">Post new announcement</p>
        <div class="cc-input-wrap cc-mb-8">
          <label class="cc-input-label" for="ann-title-input-mob">Title (optional)</label>
          <input class="cc-input" id="ann-title-input-mob" type="text" placeholder="e.g. Important: bin day change"/>
        </div>
        <div class="cc-input-wrap cc-mb-8">
          <label class="cc-input-label" for="ann-body-input-mob">Message</label>
          <textarea class="cc-input cc-textarea" id="ann-body-input-mob" placeholder="Write your announcement…" rows="3"></textarea>
        </div>
        <label class="pin-toggle" style="margin-bottom:14px;">
          <input type="checkbox" id="ann-pin-check-mob"/>
          <span class="pin-toggle-label">Pin this announcement</span>
        </label>
        <div class="ann-compose-actions">
          <button class="cc-btn cc-btn--primary" id="ann-post-btn-mob" style="flex:1;">Post to app</button>
          <a class="btn-email" id="ann-email-btn-mob" href="#" target="_blank" style="flex:1;justify-content:center;">✉ Email all</a>
        </div>
      </div>
    </div>
  </div>

  <!-- Notice modal -->
  <div class="cc-modal-overlay" id="lounge-modal-notice" onclick="if(event.target===this)loungeCloseModal('notice')">
    <div class="cc-modal-sheet" style="max-height:80vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">Notice</span>
        <button class="cc-modal-close" onclick="loungeCloseModal('notice')">✕</button>
      </div>
      <div class="cc-modal-body">
        <p style="font-size:9px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:8px;">Active notice</p>
        <div id="lounge-notice-preview" style="margin-bottom:4px;"><p class="cc-note" style="padding:4px 0;">No notice posted yet.</p></div>
        <div style="height:0.5px;background:var(--cc-rule);margin:14px 0;"></div>
        <p style="font-size:9px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:10px;">Post new notice</p>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:9px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--cc-taupe);">Colour</span>
          <button type="button" class="notice-color-btn notice-color-btn--yellow active" data-color="yellow" aria-label="Yellow"></button>
          <button type="button" class="notice-color-btn notice-color-btn--green"  data-color="green"  aria-label="Green"></button>
          <button type="button" class="notice-color-btn notice-color-btn--red"    data-color="red"    aria-label="Red"></button>
        </div>
        <textarea class="notice-compose__input" id="notice-input-mob" rows="3" placeholder="e.g. Plumber visiting Thursday 10–12. Please keep hallway clear." style="width:100%;box-sizing:border-box;margin-bottom:12px;"></textarea>
        <div style="display:flex;gap:8px;">
          <button type="button" class="cc-btn--ghost" id="notice-clear-btn-mob" style="display:none;flex:1;">Clear notice</button>
          <button type="button" class="notice-compose__btn" id="notice-post-btn-mob" style="flex:1;">Post notice</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Actions modal -->
  <div class="cc-modal-overlay" id="lounge-modal-actions" onclick="if(event.target===this)loungeCloseModal('actions')">
    <div class="cc-modal-sheet" style="max-height:60vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">Lounge actions</span>
        <button class="cc-modal-close" onclick="loungeCloseModal('actions')">✕</button>
      </div>
      <div class="cc-modal-body" style="padding:0;">
        <button onclick="loungeCloseModal('actions');setTimeout(()=>loungeOpenModal('ann'),120);" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;background:none;border:none;border-bottom:0.5px solid var(--cc-rule);cursor:pointer;text-align:left;font-family:inherit;">
          <div style="width:36px;height:36px;border-radius:var(--cc-r-md);background:var(--cc-surface);border:0.5px solid var(--cc-rule);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📢</div>
          <div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);margin:0 0 2px;">Post announcement</p><p style="font-size:11px;font-weight:300;color:var(--cc-taupe);margin:0;">Push a message to all tenants</p></div>
          <span style="margin-left:auto;color:var(--cc-stone);font-size:16px;">›</span>
        </button>
        <button onclick="loungeCloseModal('actions');setTimeout(()=>loungeOpenModal('notice'),120);" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;background:none;border:none;border-bottom:0.5px solid var(--cc-rule);cursor:pointer;text-align:left;font-family:inherit;">
          <div style="width:36px;height:36px;border-radius:var(--cc-r-md);background:var(--cc-surface);border:0.5px solid var(--cc-rule);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">ℹ</div>
          <div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);margin:0 0 2px;">Post notice</p><p style="font-size:11px;font-weight:300;color:var(--cc-taupe);margin:0;">Info strip above the chat</p></div>
          <span style="margin-left:auto;color:var(--cc-stone);font-size:16px;">›</span>
        </button>
        <a id="lounge-email-all-mob" href="#" target="_blank" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border-bottom:0.5px solid var(--cc-rule);text-decoration:none;">
          <div style="width:36px;height:36px;border-radius:var(--cc-r-md);background:var(--cc-surface);border:0.5px solid var(--cc-rule);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">✉</div>
          <div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);margin:0 0 2px;">Email all tenants</p><p style="font-size:11px;font-weight:300;color:var(--cc-taupe);margin:0;">Open email to all rooms</p></div>
          <span style="margin-left:auto;color:var(--cc-stone);font-size:16px;">›</span>
        </a>
        <button id="lounge-reset-btn-mob" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;background:none;border:none;cursor:pointer;text-align:left;font-family:inherit;">
          <div style="width:36px;height:36px;border-radius:var(--cc-r-md);background:var(--cc-surface);border:0.5px solid var(--cc-rule);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">↺</div>
          <div><p style="font-size:13px;font-weight:500;color:#9F1239;margin:0 0 2px;">Reset chat</p><p style="font-size:11px;font-weight:300;color:var(--cc-taupe);margin:0;">Delete all messages</p></div>
        </button>
      </div>
    </div>
  </div>
`;

/* ── MODAL HELPERS ──────────────────────────────────────── */
function loungeOpenModal(name) {
  document.getElementById('lounge-modal-' + name)?.classList.add('open');
  if (name === 'ann')    _populateAnnModal();
  if (name === 'notice') _populateNoticeModal();
  if (name === 'actions') {
    _setEmailHref('lounge-email-all-mob');
    if (!document.getElementById('lounge-reset-btn-mob')._wired) {
      document.getElementById('lounge-reset-btn-mob').addEventListener('click', resetChat);
      document.getElementById('lounge-reset-btn-mob')._wired = true;
    }
  }
}
function loungeCloseModal(name) {
  document.getElementById('lounge-modal-' + name)?.classList.remove('open');
}

/* ── STATE ──────────────────────────────────────────────── */
let _noticeColor = 'yellow';
let _loungeSub   = null;

/* ── ANNOUNCEMENTS ──────────────────────────────────────── */
let _lastRenderedAnnId = null;
async function loadAnnouncements() {
  const el = document.getElementById('ann-list');
  if (!sbL) { el.innerHTML = '<p class="cc-note" style="padding:4px 0;">Connect Supabase.</p>'; return; }
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','announcement').order('created_at',{ascending:false}).limit(1).maybeSingle();
  _renderAnn(data);
}

function _renderAnn(data) {
  if (data && data.id && data.id === _lastRenderedAnnId) return;
  if (data && data.id) _lastRenderedAnnId = data.id;
  const emptyHtml = '<p class="cc-note" style="padding:4px 0;">No announcement posted yet.</p>';
  const annHtml = !data ? emptyHtml : `<div class="ann-card${data.pinned ? ' ann-card--pinned' : ''}">
    <div class="ann-top">
      <span class="ann-top-lbl">Casa Castel</span>
      ${data.pinned ? '<span class="ann-pin">Pinned</span>' : ''}
      <span class="ann-date">${fmtTs(new Date(data.created_at).getTime())}</span>
    </div>
    ${data.title ? `<p class="ann-title-text">${esc(data.title)}</p>` : ''}
    <p class="ann-body-text">${esc(data.body)}</p>
    <div class="ann-actions"><button class="ann-del" onclick="deleteAnn('${data.id}')">Delete announcement</button></div>
  </div>`;
  const el    = document.getElementById('ann-list');
  const elDsk = document.getElementById('ann-list-desktop');
  if (el)    el.innerHTML    = annHtml;
  if (elDsk) elDsk.innerHTML = annHtml;
  if (document.getElementById('lounge-modal-ann')?.classList.contains('open')) _populateAnnModal();
}

async function _populateAnnModal() {
  const el = document.getElementById('ann-list-modal'); if (!el) return;

  // Wire post button unconditionally — must happen even when no announcement exists
  const btn = document.getElementById('ann-post-btn-mob');
  if (btn && !btn._wired) {
    btn.addEventListener('click', () => _postAnn('ann-title-input-mob','ann-body-input-mob','ann-pin-check-mob', true));
    btn._wired = true;
  }

  if (!sbL) { el.innerHTML = '<p class="cc-note">Connect Supabase.</p>'; return; }
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','announcement').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if (!data) { el.innerHTML = '<p class="cc-note" style="padding:4px 0;">No announcement posted yet.</p>'; return; }
  el.innerHTML = `<div class="ann-card${data.pinned ? ' ann-card--pinned' : ''}">
    <div class="ann-top">
      <span class="ann-top-lbl">Casa Castel</span>
      ${data.pinned ? '<span class="ann-pin">Pinned</span>' : ''}
      <span class="ann-date">${fmtTs(new Date(data.created_at).getTime())}</span>
    </div>
    ${data.title ? `<p class="ann-title-text">${esc(data.title)}</p>` : ''}
    <p class="ann-body-text">${esc(data.body)}</p>
    <button onclick="deleteAnn('${data.id}')" style="font-size:9px;font-weight:500;letter-spacing:0.07em;text-transform:uppercase;color:#9F1239;background:none;border:none;cursor:pointer;margin-top:10px;padding:0;font-family:inherit;">Delete announcement</button>
  </div>`;
}

async function _postAnn(titleId, bodyId, pinId, closeAfter) {
  if (!sbL) return;
  _lastRenderedAnnId = null;
  const title  = document.getElementById(titleId).value.trim();
  const body   = document.getElementById(bodyId).value.trim();
  if (!body) return;
  const pinned = document.getElementById(pinId).checked;
  await sbL.from('lounge_data').delete().eq('type','announcement');
  const { data } = await sbL.from('lounge_data').insert({ type:'announcement', title, body, pinned }).select().maybeSingle();
  document.getElementById(titleId).value = '';
  document.getElementById(bodyId).value  = '';
  document.getElementById(pinId).checked = false;
  if (data) _renderAnn(data); else loadAnnouncements();
  _updateAnnEmailBtn();
  if (closeAfter) loungeCloseModal('ann');
}

async function deleteAnn(id) {
  if (!sbL) return;
  _lastRenderedAnnId = null;
  await sbL.from('lounge_data').delete().eq('id', id);
  loadAnnouncements();
}

function _updateAnnEmailBtn() {
  const title = document.getElementById('ann-title-input')?.value.trim() || 'Casa Castel Announcement';
  const body  = document.getElementById('ann-body-input')?.value.trim()  || 'Please check the app for the latest announcement.';
  const href  = buildMailto(allTenantEmails(), title, body + '\n\nCasa Castel · ' + ADDRESS);
  ['ann-email-btn','ann-email-btn-mob'].forEach(id => {
    const el = document.getElementById(id); if (el) el.href = href;
  });
}

/* ── NOTICE ─────────────────────────────────────────────── */
async function loadNotice() {
  if (!sbL) return;
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','notice').order('created_at',{ascending:false}).limit(1).maybeSingle();
  _renderNotice(data || null);
}

function _renderNotice(data) {
  const strip    = document.getElementById('notice-posted');
  const clearBtn  = document.getElementById('notice-clear-btn');
  const bannerDsk = document.getElementById('lounge-notice-banner-desktop');
  const textDsk   = document.getElementById('lounge-notice-banner-text-dsk');
  const iconDsk   = document.getElementById('lounge-notice-banner-icon-dsk');

  const cols = {
    yellow: { bg:'#FEFCE8', bd:'#EAD96B', tx:'#78640A', ic:'#A0860E' },
    green:  { bg:'#F0FDF4', bd:'#86EFAC', tx:'#14532D', ic:'#16A34A' },
    red:    { bg:'#FFF1F2', bd:'#FECDD3', tx:'#9F1239', ic:'#E11D48' },
  };

  if (!data || !data.body) {
    if (strip)     strip.className = 'l-notice-strip';
    if (clearBtn)  clearBtn.style.display = 'none';
    if (bannerDsk) bannerDsk.style.display = 'none';
    _renderNoticeModalPreview(null);
    return;
  }
  const c = data.color || 'yellow';
  const col = cols[c] || cols.yellow;
  // Mobile strip
  document.getElementById('notice-posted-text').textContent = data.body;
  strip.className = 'l-notice-strip visible ' + c;
  // Sync notice compose textarea + color picker
  const ni = document.getElementById('notice-input'); if (ni) ni.value = data.body;
  document.querySelectorAll('#tab-lounge .l-desktop-grid .notice-color-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.color === c));
  _noticeColor = c;
  if (clearBtn) clearBtn.style.display = '';
  // Desktop banner above chat
  if (bannerDsk) {
    bannerDsk.style.display = 'flex';
    bannerDsk.style.background = col.bg;
    bannerDsk.style.borderBottomColor = col.bd;
    if (textDsk) { textDsk.textContent = data.body; textDsk.style.color = col.tx; }
    if (iconDsk) iconDsk.style.color = col.ic;
  }
  _renderNoticeModalPreview(data);
}

function _renderNoticeModalPreview(data) {
  const el = document.getElementById('lounge-notice-preview'); if (!el) return;
  const clearBtnM = document.getElementById('notice-clear-btn-mob');
  if (clearBtnM) clearBtnM.style.display = (data && data.body) ? '' : 'none';
  if (!data) { el.innerHTML = '<p class="cc-note" style="padding:4px 0;">No notice posted yet.</p>'; return; }
  const cols = {
    yellow: { bg:'#FEFCE8', bd:'#EAD96B', tx:'#78640A', ic:'#A0860E' },
    green:  { bg:'#F0FDF4', bd:'#86EFAC', tx:'#14532D', ic:'#16A34A' },
    red:    { bg:'#FFF1F2', bd:'#FECDD3', tx:'#9F1239', ic:'#E11D48' },
  };
  const col = cols[data.color || 'yellow'];
  el.innerHTML = `<div style="background:${col.bg};border:0.5px solid ${col.bd};border-radius:var(--cc-r-md);padding:10px 12px;display:flex;align-items:flex-start;gap:9px;">
    <span style="font-size:13px;color:${col.ic};flex-shrink:0;">ℹ</span>
    <span style="font-size:13px;font-weight:300;color:${col.tx};flex:1;line-height:1.5;">${esc(data.body)}</span>
    <button onclick="clearNotice()" style="font-size:9px;font-weight:500;letter-spacing:0.07em;text-transform:uppercase;color:#9F1239;background:none;border:none;cursor:pointer;flex-shrink:0;font-family:inherit;">Clear</button>
  </div>`;
}

function _populateNoticeModal() {
  if (sbL) {
    sbL.from('lounge_data').select('*').eq('type','notice')
      .order('created_at',{ascending:false}).limit(1).maybeSingle()
      .then(({ data }) => {
        _renderNoticeModalPreview(data);
        // Show/hide Clear button based on whether a notice exists
        const clearBtnM = document.getElementById('notice-clear-btn-mob');
        if (clearBtnM) clearBtnM.style.display = (data && data.body) ? '' : 'none';
      });
  }
  // Sync color buttons
  const modal = document.getElementById('lounge-modal-notice');
  modal.querySelectorAll('.notice-color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === _noticeColor);
    if (!btn._wired) {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.notice-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _noticeColor = btn.dataset.color;
      });
      btn._wired = true;
    }
  });
  // Lazy-wire post/clear in modal
  const postBtn  = document.getElementById('notice-post-btn-mob');
  const clearBtnM= document.getElementById('notice-clear-btn-mob');
  if (postBtn && !postBtn._wired) {
    postBtn.addEventListener('click', async () => {
      if (!sbL) return;
      const text = document.getElementById('notice-input-mob').value.trim(); if (!text) return;
      await sbL.from('lounge_data').delete().eq('type','notice');
      const { data } = await sbL.from('lounge_data').insert({ type:'notice', body:text, color:_noticeColor }).select().maybeSingle();
      document.getElementById('notice-input-mob').value = '';
      // Sync desktop color picker to match what was just posted
      document.querySelectorAll('#tab-lounge .l-desktop-grid .notice-color-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.color === _noticeColor));
      if (data) _renderNotice(data); else loadNotice();
      loungeCloseModal('notice');
    });
    postBtn._wired = true;
  }
  if (clearBtnM && !clearBtnM._wired) {
    clearBtnM.addEventListener('click', async () => { await clearNotice(); loungeCloseModal('notice'); });
    clearBtnM._wired = true;
  }
  // Note: desktop notice "Clear" button is rendered inline in _renderNotice via onclick="clearNotice()"
}

async function clearNotice() {
  if (!sbL) return;
  _renderNotice(null);
  await sbL.from('lounge_data').delete().eq('type','notice');
}

/* ── CHAT ───────────────────────────────────────────────── */
async function loadLounge() {
  if (!sbL) {
    const el = document.getElementById('lounge-feed');
    if (el) el.innerHTML = '<p class="cc-note" style="padding:8px 0 4px;">Connect Supabase to load messages.</p>';
    return;
  }
  const { data } = await sbL.from('lounge_data').select('*')
    .eq('type','message').order('created_at',{ascending:true}).limit(200);
  _renderMsgs(data || []);
}

/* Mobile compose bar markup — kept in one place so it can be
   re-inserted if any chat operation ever removes it. */
const _MOBILE_COMPOSE_HTML = `
    <div class="l-compose">
      <button class="l-action-btn" onclick="loungeOpenModal('actions')" title="Actions">⊕</button>
      <input class="l-compose-input" id="lounge-input" type="text" placeholder="Message as Casa Castel…"/>
      <button class="l-compose-send" id="lounge-send">↑</button>
    </div>`;

/* Guarantees the mobile compose bar is present + wired. Safe to call
   any number of times: it does nothing if the bar already exists, and
   only ever ADDS it back — it never removes anything. */
function _ensureMobileCompose() {
  const chat = document.querySelector('#tab-lounge .l-chat');
  if (!chat || chat.querySelector('.l-compose')) return;   // already there → no-op
  chat.insertAdjacentHTML('beforeend', _MOBILE_COMPOSE_HTML);
  document.getElementById('lounge-send')
    ?.addEventListener('click', sendLounge);
  document.getElementById('lounge-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendLounge(); }});
  if (typeof wireComposeBlur === 'function') wireComposeBlur(document.getElementById('lounge-input'));
}

function _renderMsgs(msgs) {
  const feed    = document.getElementById('lounge-feed');
  const feedDsk = document.getElementById('lounge-feed-desktop');
  const html = !msgs.length
    ? '<p class="cc-note" style="padding:8px 0 4px;">No messages yet.</p>'
    : msgs.map(m => _msgHtml(m, true)).join('');
  if (feed)    feed.innerHTML    = html;
  if (feedDsk) feedDsk.innerHTML = html;
  scrollToBottom(feed);
  scrollToBottom(feedDsk);
  _ensureMobileCompose();   // re-show the compose bar if a render ever dropped it
}

function _msgHtml(m, canDelete) {
  const isCC = m.room === 'Casa Castel';
  return `<div class="msg-row" data-id="${m.id}">
    <div class="msg-avatar${isCC ? ' msg-avatar--mgmt' : ''}">${roomInitials(m.room)}</div>
    <div class="msg-content">
      <div class="msg-meta">
        <span class="msg-name${isCC ? ' msg-name--mgmt' : ''}">${esc(m.room)}</span>
        <span class="msg-time">${fmtTs(new Date(m.created_at).getTime())}</span>
      </div>
      <p class="msg-text">${parseMsg(m.body, 'Casa Castel')}</p>
    </div>
    ${canDelete ? `<button class="msg-del" title="Delete" onclick="deleteMsg('${m.id}')">✕</button>` : ''}
  </div>`;
}

// Appends a single message to both feeds (deduplicates by id)
function _appendMsg(m) {
  [document.getElementById('lounge-feed'), document.getElementById('lounge-feed-desktop')].forEach(feed => {
    if (!feed) return;
    // Skip if this exact id is already rendered (prevents optimistic + realtime duplicate)
    if (m.id && feed.querySelector(`.msg-row[data-id="${m.id}"]`)) return;
    feed.querySelector('.cc-note')?.remove();
    feed.insertAdjacentHTML('beforeend', _msgHtml(m, true));
    scrollToBottom(feed);
  });
}

// Removes optimistic placeholder rows (id starts with _tmp_) from both feeds
function _removeOptimistic() {
  [document.getElementById('lounge-feed'), document.getElementById('lounge-feed-desktop')].forEach(feed => {
    if (!feed) return;
    feed.querySelectorAll('.msg-row[data-id^="_tmp_"]').forEach(el => el.remove());
  });
}

async function sendLounge() {
  if (!sbL) return;
  const input = document.getElementById('lounge-input');
  const text  = input.value.trim(); if (!text) return;
  input.value = '';
  const tmpId = '_tmp_' + Date.now();
  const opt = { id: tmpId, room:'Casa Castel', body:text, created_at: new Date().toISOString(), type:'message' };
  _appendMsg(opt);
  const { data } = await sbL.from('lounge_data').insert({ type:'message', room:'Casa Castel', body:text }).select().maybeSingle();
  // Remove optimistic row — realtime subscription will append the real one,
  // or we append it directly if realtime is slow
  _removeOptimistic();
  if (data) _appendMsg(data);
}

async function sendLoungeDesktop() {
  if (!sbL) return;
  const input = document.getElementById('lounge-input-desktop');
  const text  = input.value.trim(); if (!text) return;
  input.value = '';
  const tmpId = '_tmp_' + Date.now();
  const opt = { id: tmpId, room:'Casa Castel', body:text, created_at: new Date().toISOString(), type:'message' };
  _appendMsg(opt);
  const { data } = await sbL.from('lounge_data').insert({ type:'message', room:'Casa Castel', body:text }).select().maybeSingle();
  _removeOptimistic();
  if (data) _appendMsg(data);
}

async function deleteMsg(id) {
  if (!sbL) return;
  document.querySelectorAll(`.msg-row[data-id="${id}"]`).forEach(el => el.remove());
  await sbL.from('lounge_data').delete().eq('id', id);
}

async function resetChat() {
  if (!sbL) return;
  if (!confirm('Delete all chat messages? This cannot be undone.')) return;
  _renderMsgs([]);
  await sbL.from('lounge_data').delete().eq('type','message');
  _ensureMobileCompose();   // realtime delete events can re-render — keep the bar
}

/* ── REALTIME ───────────────────────────────────────────── */
function subscribeLounge() {
  if (!sbL || _loungeSub) return;
  _loungeSub = sbL.channel('lounge-landlord')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'lounge_data' }, payload => {
      const r = payload.new;
      if (r.type === 'message')      _appendMsg(r);
      if (r.type === 'announcement') { _lastRenderedAnnId = null; _renderAnn(r); }
      if (r.type === 'notice')       _renderNotice(r);
      if (r.type === 'hc_done')      loadHouseCleaning?.();
    })
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'lounge_data' }, payload => {
      const old = payload.old || {};
      if (old.type === 'message') {
        // Remove just that message row from both feeds
        if (old.id) {
          document.querySelectorAll(`.msg-row[data-id="${old.id}"]`).forEach(el => el.remove());
        }
      } else if (old.type === 'announcement') {
        loadAnnouncements();
      } else if (old.type === 'notice') {
        _renderNotice(null);
      } else {
        // Unknown type — full reload as fallback
        loadLoungeAll();
      }
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'lounge_data' }, payload => {
      const r = payload.new;
      if (r.type === 'announcement') { _lastRenderedAnnId = null; _renderAnn(r); }
      if (r.type === 'notice')       _renderNotice(r);
    })
    .subscribe();
}

/* ── LOAD ALL (called on tab switch) ────────────────────── */
async function loadLoungeAll() {
  if (!sbL) { loadAnnouncements(); loadNotice(); loadLounge(); return; }
  const { data } = await sbL.from('lounge_data').select('*')
    .in('type', ['announcement','notice','message'])
    .order('created_at', { ascending: true });
  if (!data) return;
  const ann    = data.filter(d => d.type === 'announcement').pop() || null;
  const notice = data.filter(d => d.type === 'notice').pop()       || null;
  const msgs   = data.filter(d => d.type === 'message');
  _renderAnn(ann);
  _renderNotice(notice);
  _renderMsgs(msgs);
  subscribeLounge();
}

/* ── EVENT WIRING ───────────────────────────────────────── */
(function _wireLoungeEvents() {
  // Desktop ann compose
  document.getElementById('ann-post-btn')
    ?.addEventListener('click', () => _postAnn('ann-title-input','ann-body-input','ann-pin-check', false));
  document.getElementById('ann-title-input')?.addEventListener('input', _updateAnnEmailBtn);
  document.getElementById('ann-body-input')?.addEventListener('input',  _updateAnnEmailBtn);

  // Desktop notice
  document.querySelectorAll('#tab-lounge .l-desktop-grid .notice-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tab-lounge .l-desktop-grid .notice-color-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _noticeColor = btn.dataset.color;
    });
  });
  document.getElementById('notice-post-btn')?.addEventListener('click', async () => {
    if (!sbL) return;
    const text = document.getElementById('notice-input')?.value.trim(); if (!text) return;
    await sbL.from('lounge_data').delete().eq('type','notice');
    const { data } = await sbL.from('lounge_data').insert({ type:'notice', body:text, color:_noticeColor }).select().maybeSingle();
    if (data) _renderNotice(data); else loadNotice();
  });
  document.getElementById('notice-clear-btn')?.addEventListener('click', clearNotice);

  // Mobile chat send
  document.getElementById('lounge-send')
    ?.addEventListener('click', sendLounge);
  document.getElementById('lounge-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendLounge(); }});

  // v2 keyboard fix — replaces old blur scrollTo(0,0)
  wireComposeBlur(document.getElementById('lounge-input'));

  // Desktop chat send
  document.getElementById('lounge-send-desktop')
    ?.addEventListener('click', sendLoungeDesktop);
  document.getElementById('lounge-input-desktop')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendLoungeDesktop(); }});

  // Email hrefs
  _setEmailHref('lounge-email-all-desktop');
  _setEmailHref('lounge-email-all-mob');

  // Desktop reset
  document.getElementById('lounge-reset-btn')?.addEventListener('click', resetChat);
})();

function _setEmailHref(id) {
  const el = document.getElementById(id);
  if (el) el.href = buildMailto(allTenantEmails(), 'Message from Casa Castel', '');
}
