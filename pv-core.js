/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · SHARED CORE
   pv-core.js  (loaded by service.html and providers.html)

   • Own Supabase client, fully separated from the app login:
     no session persistence, own storage key — logging in or out
     here never touches cc_role / cc_room / the Supabase auth
     token of the management apps.
   • Formatters (German dates, Fr/Fri weekdays, Berlin time).
   • Renderers for the shared pieces both apps draw from the
     pv_state payload: visit strip, visit card, chat feed.

   Depends on: constants.js (SB_URL, SB_KEY),
               cc-german-format.js (CC_TZ, ccFmtTs)
   ───────────────────────────────────────────────────────────── */

/* ── CLIENT ─────────────────────────────────────────────── */
const pvSupa = supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'pv-no-session' }
});

async function pvRpc(fn, args) {
  try {
    const { data, error } = await pvSupa.rpc(fn, args || {});
    if (error) return { error: error.message || 'network' };
    return { data };
  } catch (e) {
    return { error: 'network' };
  }
}

/* ── SMALL HELPERS ──────────────────────────────────────── */
function pvEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const _pvWdDE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const _pvWdEN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const _pvWdDEFull = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function _pvDow(iso) {                      /* day of week of a YYYY-MM-DD, TZ-safe */
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function pvDM(iso)      { const s = String(iso).slice(0, 10).split('-'); return s[2] + '.' + s[1] + '.'; }
function pvWdDM(iso, en){ return (en ? _pvWdEN : _pvWdDE)[_pvDow(iso)] + ' ' + pvDM(iso); }
function pvWdFull(iso)  { return _pvWdDEFull[_pvDow(iso)] + ' ' + pvDM(iso); }
function pvHM(ts) {                         /* timestamp → HH:MM Berlin */
  if (!ts) return '';
  return new Intl.DateTimeFormat('de-DE', { timeZone: CC_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(ts));
}
function pvTs(ts) {                         /* timestamp → DD.MM. HH:MM Berlin */
  if (!ts) return '';
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: CC_TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
  const g = t => (p.find(x => x.type === t) || {}).value || '';
  return g('day') + '.' + g('month') + '. ' + g('hour') + ':' + g('minute');
}
function pvDaysUntil(iso, todayIso) {
  const a = new Date(String(todayIso).slice(0, 10) + 'T00:00:00Z');
  const b = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/* ── VISIT STRIP ────────────────────────────────────────── */
/* status → strip badge class + label (DE board / EN board)   */
function _pvStripBadge(v, todayIso, en) {
  const st = v.status;
  if (st === 'done')  return { item: 'done',   badge: 'done',    de: 'Erledigt', en: 'Done' };
  if (st === 'sent')  return { item: 'review', badge: 'review',  de: 'Gesendet', en: 'Sent' };
  if (st === 'redo')  return { item: 'review', badge: 'review',  de: 'Nochmal',  en: 'Redo' };
  if (st === 'missed')return { item: '',       badge: 'upcoming',de: 'Verpasst', en: 'Missed' };
  if (st === 'cancelled' || st === 'cancelled_by_provider')
                      return { item: '',       badge: 'upcoming',de: 'Abgesagt', en: 'Cancelled' };
  if (st === 'in_progress' || (st === 'planned' && v.date === todayIso))
                      return { item: 'now',    badge: en ? 'now' : 'myturn', de: 'Heute', en: 'Today' };
  if (v.focus)        return { item: 'next',   badge: 'next',    de: 'Nächster', en: 'Next' };
  return               { item: '',             badge: 'upcoming',de: '—',        en: '—' };
}
function _pvStripTimes(v, en) {
  if (v.status === 'done' || v.status === 'sent') {
    const a = pvHM(v.first_photo_at || v.started_at), b = pvHM(v.sent_at);
    if (a && b) return a + '–' + b;
    if (a) return (en ? 'since ' : 'ab ') + a;
  }
  if (v.status === 'in_progress') return (en ? 'since ' : 'ab ') + pvHM(v.started_at);
  return v.time || '';
}
function pvStripHTMLToday(v, todayIso, en) {   /* planned today: "ab 10:00" on the provider side (board P1b) */
  return v.status === 'planned' && v.date === todayIso && !en && v.time ? 'ab ' + v.time : _pvStripTimes(v, en);
}
function pvStripHTML(strip, todayIso, en) {
  if (!strip || !strip.length) return '';
  const segs = strip.map(v => {
    const b = _pvStripBadge(v, todayIso, en);
    return `<div class="k-mob-rot-seg ${b.item === 'done' ? 'done' : b.item === 'review' ? 'review' : ''}"></div>`;
  }).join('');
  const items = strip.map(v => {
    const b = _pvStripBadge(v, todayIso, en);
    return `<div class="k-mob-rot-item ${b.item}"><span class="k-mob-rot-badge ${b.badge}">${en ? b.en : pvEsc(b.de)}</span><span class="k-mob-rot-room">${pvWdDM(v.date, en)}</span><span class="k-mob-rot-dates">${pvEsc(pvStripHTMLToday(v, todayIso, en))}</span></div>`;
  }).join('');
  return `<div class="k-mob-rot-line"></div><div class="k-mob-rot-segs">${segs}</div><div class="k-mob-rot-items">${items}</div>`;
}

/* ── CHAT FEED (read view, both apps) ───────────────────── */
/* neutral system lines — never "auto", never Lynn's name      */
const _PV_SYS = {
  sent:               ['↑ Gesendet', 'Sent', 'Submitted'],
  resent:             ['↑↑ Neu gesendet', 'Re-sent', 'Re-sent'],
  approved:           ['✓ Bestätigt', 'Approved', 'Approved'],
  rejected:           ['Nicht angenommen', 'Not accepted', 'Not accepted'],
  redo:               ['↻ Nochmal nötig', 'Redo needed', 'Redo requested'],
  review_again:       ['Wird nochmal geprüft', 'In review again', 'Back in review'],
  unflagged:          ['Kein Nochmal nötig', 'No redo needed', 'Redo removed'],
  missed:             ['Nicht erledigt', 'Missed', 'Missed'],
  reopened:           ['Wieder offen', 'Reopened', 'Reopened'],
  replanned:          ['Neu geplant', 'Replanned', 'Replanned'],
  moved:              ['Verschoben', 'Moved', 'Moved'],
  cancelled:          ['Abgesagt', 'Cancelled', 'Cancelled'],
  cancelled_provider: ['Abgesagt', 'Cancelled', 'Cancelled'],
  cancel_undone:      ['Absage zurückgenommen', 'Cancellation undone', 'Cancellation undone'],
  restored:           ['Wieder geplant', 'Planned again', 'Planned again']
};
function _pvSysLine(m, en) {
  const pl = m.payload || {};
  const t = _PV_SYS[pl.code] || ['', '', ''];
  let txt = en ? t[2] : t[0] + ' · ' + t[1];
  if ((pl.code === 'moved' || pl.code === 'replanned') && pl.from && pl.to) txt += ' · ' + pvDM(pl.from) + ' → ' + pvDM(pl.to);
  if ((pl.code === 'cancelled_provider' || pl.code === 'cancel_undone' || pl.code === 'sent' || pl.code === 'resent') && pl.person) txt = pvEsc(pl.person) + ': ' + txt;
  const cls = pl.code === 'approved' ? ' k-sys-event__text--approved' : '';
  return `<div class="k-sys-event"><div class="k-sys-event__line"></div><span class="k-sys-event__text${cls}">${txt} · ${pvTs(m.at)}</span><div class="k-sys-event__line"></div></div>`;
}
function pvDivider(label) {
  return `<div class="k-sys-event k-week-div"><div class="k-sys-event__line"></div><span class="k-sys-event__text">${label}</span><div class="k-sys-event__line"></div></div>`;
}
function pvProofUrl(path) {                 /* provider-proofs is a public bucket */
  return SB_URL + '/storage/v1/object/public/provider-proofs/' + String(path || '').split('/').map(encodeURIComponent).join('/');
}
function _pvInitials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || (p[0] || '')[1] || '');
}
function pvChatRowHTML(m, opts) {
  opts = opts || {};
  const name = m.name || 'Casa Castel';
  const av = name === 'Casa Castel' ? 'CC' : _pvInitials(name).toUpperCase();
  const del = opts.canDelete ? `<button type="button" aria-label="Delete message" onclick="${opts.onDelete}('${m.id}')" style="align-self:center;width:28px;height:28px;border-radius:50%;border:.5px solid var(--cc-rule);background:var(--cc-white);color:var(--cc-taupe);display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"></path></svg></button>` : '';
  const pl = m.payload || {};
  let body = '';
  if (m.kind === 'photo' && pl.path) body += `<img src="${pvEsc(pvProofUrl(pl.path))}" alt="" style="max-width:180px;border-radius:8px;display:block;margin-top:2px;" loading="lazy"/>`;
  if (m.kind === 'supplies') body += `<p class="k-chat-text">${opts.en ? 'Supplies needed' : 'Material fehlt · Supplies needed'}${pl.items ? ': ' + pvEsc([].concat(pl.items).join(', ')) : ''}</p>`;
  if (m.kind === 'damage')   body += `<p class="k-chat-text">${opts.en ? 'Damage' : 'Schaden · Damage'}${pl.note ? ': ' + pvEsc(pl.note) : ''}</p>`;
  if (pl.text) body += `<p class="k-chat-text">${pvEsc(pl.text)}</p>`;
  return `<div class="k-chat-row"><span class="k-chat-avatar">${pvEsc(av)}</span><div class="k-chat-body"><div class="k-chat-meta"><span class="k-chat-name">${pvEsc(name)}</span><span class="k-chat-time">${pvTs(m.at)}</span></div>${body}</div>${del}</div>`;
}
function pvFeedHTML(state, opts) {
  opts = opts || {};
  const chat = (state && state.chat) || [];
  if (!chat.length) {
    return `<p style="text-align:center;padding:24px 16px;color:var(--cc-taupe);font-size:12px;">${opts.en ? 'No messages yet.' : 'Noch keine Nachrichten · No messages yet'}</p>`;
  }
  let html = '';
  let lastDay = '';
  chat.forEach(m => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: CC_TZ }).format(new Date(m.at));   /* Berlin day */
    if (day !== lastDay) {
      lastDay = day;
      const today = day === state.today;
      html += pvDivider(today ? (opts.en ? 'Today · ' : 'Heute · Today · ') + pvDM(day) : pvDM(day));
    }
    if (m.kind === 'system') html += _pvSysLine(m, opts.en);
    else html += pvChatRowHTML(m, m.person_id == null ? { en: opts.en } : opts);
  });
  return html;
}

/* ── TOAST ──────────────────────────────────────────────── */
let _pvToastT = null;
function pvToast(msg) {
  let el = document.getElementById('pv-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pv-toast';
    el.style.cssText = 'position:fixed;bottom:calc(20px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);padding:8px 16px;background:var(--cc-ink);color:var(--cc-white);border-radius:16px;font-size:12px;letter-spacing:.04em;opacity:0;transition:opacity .2s;pointer-events:none;z-index:900;max-width:90vw;text-align:center;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(_pvToastT);
  _pvToastT = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}
