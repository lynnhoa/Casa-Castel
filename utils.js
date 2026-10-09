/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — UTILS
   js/utils.js

   Pure functions only. No DOM access. No side effects.
   Depends on: constants.js
   ───────────────────────────────────────────────────────────── */

/* ── STRING HELPERS ─────────────────────────────────────── */
function esc(s) {
  return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function roomInitials(r) {
  const w = r.split(' ');
  return w.length > 1 ? w[0][0] + w[1][0] : r.slice(0, 2).toUpperCase();
}

/* ── DATE / TIME ────────────────────────────────────────── */
/* Chat / activity time → "26.09. · 14:30" (German time; helper in cc-german-format.js) */
function fmtTs(ts) {
  if (typeof ccFmtTs === 'function') return ccFmtTs(ts);
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '. · ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fmtDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
}

/* ── KITCHEN WEEK CALC ──────────────────────────────────── */
/* Completely independent Mon–Sun weeks from K_START.
   Kitchen rotation (Copenhagen, Stockholm, Oslo, London, Berlin)
   cycles over KITCHEN_ROOMS independently from HC rotation. */
const _K_DAY = 24 * 60 * 60 * 1000;

function kWeekIdx(d) {
  const now = d || new Date();
  // Count calendar days (not milliseconds) so summer/winter time never shifts the week change
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const k1    = Date.UTC(K_START.getFullYear(), K_START.getMonth(), K_START.getDate());
  if (today < k1) return -1;
  return Math.floor((today - k1) / (7 * _K_DAY));
}

function kWeekInfo(i) {
  if (i < 0) return null;
  const room  = K_ROTATION[i % K_ROTATION.length];
  const start = new Date(K_START.getTime() + i * 7 * _K_DAY);
  const end   = new Date(start.getTime() + 6 * _K_DAY);
  end.setHours(23, 59, 59, 999);
  const daysLeft = Math.max(0, Math.ceil((end - new Date()) / _K_DAY));
  return { room, start, end, daysLeft, i, dateRange: fmtDate(start) + ' – ' + fmtDate(end) };
}

/* ── HOUSE CLEANING MONTH CALC ──────────────────────────── */
function currentMonthRoomIdx() {
  const now = new Date();
  const months = (now.getFullYear() - HC_START.getFullYear()) * 12
               + (now.getMonth() - HC_START.getMonth());
  return ((months % ALL_ROOMS.length) + ALL_ROOMS.length) % ALL_ROOMS.length;
}

/* ── ROOM PASSWORDS (set by the landlord) ─────────────────── */
// Strong random password for a room, e.g. "k7Qm-9xKp-3TzR" (no look-alike characters).
function ccGeneratePassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let pw = '';
  bytes.forEach((b, i) => { pw += abc[b % abc.length]; if (i === 3 || i === 7) pw += '-'; });
  return pw;
}
async function ccHashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// Stores a new random password for a room and shows it to the landlord once (in-app popup).
async function ccSetNewRoomPassword(room, reason) {
  if (!sbL || !room) return null;
  // Database creates it (PASSWORDS.sql): login fingerprint + a readable copy for your Tenants card
  const rpc = await sbL.rpc('room_password_reset', { p_room: room });
  if (!rpc.error && rpc.data) {
    if (typeof ccPwRemember === 'function') ccPwRemember(room, rpc.data);
    await ccShowPassword(room, reason || 'New password', rpc.data);
    return rpc.data;
  }
  // Fallback (PASSWORDS.sql not run yet): as before, not readable later
  const pw   = ccGeneratePassword();
  const hash = await ccHashPassword(pw);
  await sbL.from('lounge_data').delete().eq('type', 'password').eq('room', room);
  const { error } = await sbL.from('lounge_data').insert({ type: 'password', room, body: hash });
  if (error) {
    await ccDialog({ icon: 'ti-alert-triangle', tone: 'danger', title: 'Password not saved',
      body: 'Could not save the password for ' + esc(room) + ': ' + esc(error.message), actions: [{ label: 'OK', primary: true }] });
    return null;
  }
  await ccShowPassword(room, reason || 'New password', pw);
  return pw;
}

/* ── IN-APP DIALOG (replaces the plain iPhone alert / confirm) ──
   ccDialog({ icon, tone, title, body(html), actions:[{label, value, primary, danger, icon}] })
   → Promise with the tapped action's value (Cancel / backdrop → null).          */
function _ccDlgCss() {
  if (document.getElementById('cc-dlg-css')) return;
  const st = document.createElement('style'); st.id = 'cc-dlg-css';
  st.textContent = `
.cc-dlg-ov { position:fixed; inset:0; z-index:9000; display:flex; align-items:center; justify-content:center;
  padding:24px; background:rgba(30,27,24,.35); -webkit-tap-highlight-color:transparent; }
.cc-dlg { background:var(--cc-white,#FDFCFA); border-radius:var(--cc-r-lg,12px); padding:24px 20px 18px;
  width:100%; max-width:320px; box-shadow:0 10px 40px rgba(30,27,24,.18); font-family:'Inter',system-ui,sans-serif;
  animation:ccDlgPop .2s cubic-bezier(.32,.72,0,1); }
@keyframes ccDlgPop { from{transform:scale(.94);opacity:0} to{transform:scale(1);opacity:1} }
.cc-dlg__icon { font-size:26px; color:var(--cc-gold,#B8956A); margin-bottom:10px; }
.cc-dlg--danger .cc-dlg__icon { color:#C4705A; }
.cc-dlg__title { font-family:'Cormorant Garamond',Georgia,serif; font-size:20px; font-weight:400;
  color:var(--cc-ink,#1E1B18); margin:0 0 6px; }
.cc-dlg__body { font-size:13px; color:var(--cc-taupe,#9A8E7E); line-height:1.55; margin:0 0 18px; }
.cc-dlg__body strong { color:var(--cc-charcoal,#3A3530); font-weight:500; }
.cc-dlg__btns { display:flex; align-items:center; justify-content:flex-end; gap:8px; }
.cc-dlg__btn { height:36px; padding:0 14px; border-radius:18px; font:inherit; font-size:12px; font-weight:500;
  display:inline-flex; align-items:center; gap:5px; cursor:pointer; border:.5px solid var(--cc-rule,#E0DAD0);
  background:var(--cc-white,#FDFCFA); color:var(--cc-taupe,#9A8E7E); }
.cc-dlg__btn:active { opacity:.75; }
.cc-dlg__btn--primary { background:var(--cc-ink,#1E1B18); border-color:var(--cc-ink,#1E1B18); color:var(--cc-white,#FDFCFA); }
.cc-dlg__btn--danger  { background:none; color:#A32D2D; border-color:#F09595; }
.cc-dlg__pw { display:flex; align-items:center; gap:10px; margin:4px 0 12px; padding:12px 12px 12px 14px;
  background:var(--cc-surface,#EDE8E0); border-radius:var(--cc-r-md,8px); }
.cc-dlg__pwtxt { flex:1; font-size:19px; letter-spacing:.04em; color:var(--cc-ink,#1E1B18);
  font-variant-numeric:tabular-nums; user-select:all; -webkit-user-select:all; word-break:break-all; }
.cc-dlg__copy { flex-shrink:0; height:34px; padding:0 11px; border-radius:17px; border:.5px solid var(--cc-rule,#E0DAD0);
  background:var(--cc-white,#FDFCFA); color:var(--cc-taupe,#9A8E7E); font:inherit; font-size:11px; font-weight:500;
  display:inline-flex; align-items:center; gap:5px; cursor:pointer; }
.cc-dlg__copy i { font-size:15px; }
.cc-dlg__copy.is-done { background:#EAF3DE; border-color:#97C459; color:#27500A; }`;
  document.head.appendChild(st);
}
function ccDialog(opts) {
  _ccDlgCss();
  const o = opts || {};
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cc-dlg-ov';
    const acts = (o.actions && o.actions.length) ? o.actions : [{ label: 'OK', primary: true, value: true }];
    ov.innerHTML = `<div class="cc-dlg${o.tone === 'danger' ? ' cc-dlg--danger' : ''}" role="dialog" aria-modal="true">
      ${o.icon ? `<div class="cc-dlg__icon"><i class="ti ${o.icon}" aria-hidden="true"></i></div>` : ''}
      <p class="cc-dlg__title">${o.title || ''}</p>
      ${o.body ? `<div class="cc-dlg__body">${o.body}</div>` : ''}
      <div class="cc-dlg__btns">${acts.map((a, i) =>
        `<button type="button" class="cc-dlg__btn${a.primary ? ' cc-dlg__btn--primary' : ''}${a.danger ? ' cc-dlg__btn--danger' : ''}" data-i="${i}">${a.icon ? `<i class="ti ${a.icon}" aria-hidden="true"></i>` : ''}${a.label}</button>`).join('')}</div>
    </div>`;
    const close = v => { ov.remove(); resolve(v); };
    ov.addEventListener('click', e => { if (e.target === ov && !o.modal) close(null); });
    ov.querySelectorAll('.cc-dlg__btn').forEach(b => b.addEventListener('click', () => {
      const a = acts[+b.dataset.i]; close(a.value === undefined ? null : a.value);
    }));
    document.body.appendChild(ov);
    if (typeof o.onOpen === 'function') o.onOpen(ov);
  });
}
/* Yes / no question in the app's own style → true / false */
async function ccConfirm(title, body, okLabel, danger) {
  const v = await ccDialog({ icon: danger ? 'ti-alert-triangle' : 'ti-help-circle', tone: danger ? 'danger' : '',
    title, body, actions: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, primary: !danger, danger: !!danger, icon: danger ? 'ti-trash' : '' }] });
  return v === true;
}
/* Copy on the user's tap (iOS only allows copying straight after a tap) */
async function ccCopyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
/* New password popup: password + copy icon + Done. Shown only once. */
function ccShowPassword(room, reason, pw) {
  return ccDialog({
    icon: 'ti-key', modal: true,
    title: esc(reason || 'New password') + ' · ' + esc(room),
    body: `<div class="cc-dlg__pw"><span class="cc-dlg__pwtxt">${esc(pw)}</span>
             <button type="button" class="cc-dlg__copy" aria-label="Copy password"><i class="ti ti-copy" aria-hidden="true"></i><span>Copy</span></button></div>
           ${typeof ccPwRemember === 'function' ? 'It stays visible in the Tenants card. The tenant can also get it with “Forgot password?” on the login page.' : 'Give it to the tenant. It is shown only this once.'}`,
    actions: [{ label: 'Done', primary: true, value: true }],
    onOpen: ov => {
      const btn = ov.querySelector('.cc-dlg__copy');
      btn.addEventListener('click', async () => {
        const ok = await ccCopyText(pw);
        btn.classList.toggle('is-done', ok);
        btn.innerHTML = ok ? '<i class="ti ti-check" aria-hidden="true"></i><span>Copied</span>'
                           : '<i class="ti ti-copy" aria-hidden="true"></i><span>Select it</span>';
        if (!ok) { const r = document.createRange(); r.selectNodeContents(ov.querySelector('.cc-dlg__pwtxt')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      });
    },
  });
}

/* ── TENANT CONTACT ─────────────────────────────────────── */
function tenantEmail(room) {
  try {
    // Use Supabase-backed profile cache if available (loaded by tab-tenants.js)
    if (typeof _getProfile === 'function') return _getProfile(room).email || '';
    // Fallback: try both localStorage key variants
    const a = JSON.parse(localStorage.getItem('cc_room_profile_' + room) || '{}');
    const b = JSON.parse(localStorage.getItem('cc_room_' + room) || '{}');
    return a.email || b.email || '';
  } catch { return ''; }
}

function allTenantEmails() {
  return ALL_ROOMS.map(r => tenantEmail(r)).filter(Boolean).join(',');
}

function buildMailto(to, subject, body) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* ── MENTION PARSER ─────────────────────────────────────── */
function parseMsg(text, currentRoom) {
  let s = esc(text);
  ALL_ROOMS.concat(['Casa Castel']).forEach(r => {
    const tag = '@' + r;
    const isSelf = currentRoom && r === currentRoom;
    s = s.replace(
      new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      `<span class="msg-mention${isSelf ? ' msg-mention--me' : ''}">${tag}</span>`
    );
  });
  return s;
}

/* ── SCROLL TO BOTTOM ───────────────────────────────────── */
/* Reliable iOS-safe scroll. Replaces all feed.scrollTop=feed.scrollHeight */
function scrollToBottom(feedEl, tries = 3) {
  if (!feedEl) return;
  feedEl.scrollTop = feedEl.scrollHeight;
  let n = 0;
  const retry = () => {
    if (n++ >= tries) return;
    requestAnimationFrame(() => {
      feedEl.scrollTop = feedEl.scrollHeight;
      retry();
    });
  };
  retry();
}

/* ── KITCHEN HISTORY PILL (shared landlord + tenant) ────────── */
function kHistPill(status, size, row) {
  const sm   = size === 'sm';
  const base = sm
    ? 'font-size:9px;padding:1px 7px;border-radius:10px;font-weight:500;white-space:nowrap;border:0.5px solid;'
    : 'font-size:10px;padding:2px 9px;border-radius:20px;font-weight:500;white-space:nowrap;border:0.5px solid;display:inline-block;';
  const late = !!(row && row.is_late);
  const auto = !!(row && row.approved_by === 'auto');
  if (status === 'approved')
    return `<span style="${base}background:#EDF5E8;color:#3A6A1A;border-color:#9AC87A;">✓ ${late ? 'Done (late)' : 'Done'}</span>`;
  if (status === 'submitted')
    return `<span style="${base}background:#FFF7ED;color:#92400E;border-color:#FCD34D;">↑ ${late ? 'Late proof' : 'Submitted'}</span>`;
  if (status === 'missed')
    return `<span style="${base}background:#FEF2F2;color:#991B1B;border-color:#FCA5A5;">✗ Missed</span>`;
  if (status === 'flagged')
    return `<span style="${base}background:#FFF7ED;color:#C2410C;border-color:#FDBA74;">⚑ Redo</span>`;
  if (status === 'skipped')
    return `<span style="${base}background:#F5F3FF;color:#5B21B6;border-color:#C4B5FD;">Vacant</span>`;
  if (status === 'absent')
    return `<span style="${base}background:#F5EEE8;color:#8C5A30;border-color:#D4A87A;">Away</span>`;
  return `<span style="${base}background:var(--cc-surface);color:var(--cc-stone);border-color:var(--cc-rule);">—</span>`;
}

/* ── ABSENCE RULE (Kitchen + House Cleaning) ─────────────
   A turn is only excused when ONE absence covers the whole
   Monday–Sunday week. Dates are 'YYYY-MM-DD' strings.       */
function absCoversWeek(a, wStartYmd, wEndYmd) {
  return !!a && a.from_date <= wStartYmd && a.to_date >= wEndYmd;
}
function absOverlapsWeek(a, wStartYmd, wEndYmd) {
  return !!a && a.from_date <= wEndYmd && a.to_date >= wStartYmd;
}

/* ── KITCHEN WEEK DATE RANGE (index-only, rotation-independent) ── */
/* Use this in history renderers — never kWeekInfo — so dates stay  */
/* correct even if the room rotation changes later.                  */
function kWeekDateRange(weekIndex) {
  const pad   = n => String(n).padStart(2, '0');
  const fmtD  = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  const start = new Date(K_START.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000);
  const end   = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return fmtD(start) + ' – ' + fmtD(end);
}

/* ── KITCHEN WEEK VACANCY (shared landlord + tenant) ─────────
   Vacant = no tenant lived in the room on ANY day of that Mon–Sun
   week (move-in / move-out dates in the Tenants tab). Same rule as
   the Monday close in the database (kitchen_room_vacant_in_week).
   One call per load returns only room + week + yes/no — no tenant
   data reaches the tenant app. Fallback: today's vacant flag.     */
const _kVacCache = {};
async function kLoadWeekVacancy(fromIdx, toIdx, rpcName) {
  if (typeof sbL === 'undefined' || !sbL) return;
  try {
    // kitchen rooms by default; 'room_vacancy_range' = all rooms (House Cleaning). Same Mon–Sun weeks from 05.01.2026.
    const { data, error } = await sbL.rpc(rpcName || 'kitchen_vacancy_range', { p_from: fromIdx, p_to: toIdx });
    if (error) { console.warn('[kitchen] week vacancy:', error.message); return; }
    (data || []).forEach(r => { _kVacCache[r.room + '|' + r.week_index] = !!r.vacant; });
  } catch (e) { console.warn('[kitchen] week vacancy:', e); }
}
function kVacantInWeek(room, weekIdx) {
  const v = _kVacCache[room + '|' + weekIdx];
  if (typeof v === 'boolean') return v;
  return typeof isVacant === 'function' ? isVacant(room) : false;
}
