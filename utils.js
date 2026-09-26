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
   Kitchen rotation (London, Copenhagen, Stockholm, Oslo)
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
// Stores a new random password for a room and shows it to the landlord once.
async function ccSetNewRoomPassword(room, reason) {
  if (!sbL || !room) return null;
  const pw   = ccGeneratePassword();
  const hash = await ccHashPassword(pw);
  await sbL.from('lounge_data').delete().eq('type', 'password').eq('room', room);
  const { error } = await sbL.from('lounge_data').insert({ type: 'password', room, body: hash });
  if (error) { alert('Could not save the password for ' + room + ': ' + error.message); return null; }
  try { navigator.clipboard && navigator.clipboard.writeText(pw); } catch (e) {}
  alert((reason || 'New password') + ' for ' + room + ':\n\n' + pw + '\n\nGive it to the tenant. It is shown only this once (also copied to the clipboard).');
  return pw;
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
function kHistPill(status, size) {
  const sm   = size === 'sm';
  const base = sm
    ? 'font-size:9px;padding:1px 7px;border-radius:10px;font-weight:500;white-space:nowrap;border:0.5px solid;'
    : 'font-size:10px;padding:2px 9px;border-radius:20px;font-weight:500;white-space:nowrap;border:0.5px solid;display:inline-block;';
  if (status === 'approved')
    return `<span style="${base}background:#EDF5E8;color:#3A6A1A;border-color:#9AC87A;">✓ Done</span>`;
  if (status === 'submitted')
    return `<span style="${base}background:#FFF7ED;color:#92400E;border-color:#FCD34D;">↑ Submitted</span>`;
  if (status === 'missed')
    return `<span style="${base}background:#FEF2F2;color:#991B1B;border-color:#FCA5A5;">✗ Missed</span>`;
  if (status === 'flagged')
    return `<span style="${base}background:#FFF7ED;color:#C2410C;border-color:#FDBA74;">⚑ Redo</span>`;
  if (status === 'skipped')
    return `<span style="${base}background:#F5F3FF;color:#5B21B6;border-color:#C4B5FD;">Skipped</span>`;
  if (status === 'absent')
    return `<span style="${base}background:#F5EEE8;color:#8C5A30;border-color:#D4A87A;">Away</span>`;
  return `<span style="${base}background:var(--cc-surface);color:var(--cc-stone);border-color:var(--cc-rule);">—</span>`;
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
