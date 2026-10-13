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
               cc-german-format.js (CC_TZ, ccFmtTs), pv-pics.js (icons, optional)
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
  if (st === 'done')  return { item: 'done',   badge: 'done',    seg: 'done',   de: 'Erledigt', en: 'Done' };
  if (st === 'sent')  return { item: 'review', badge: 'review',  seg: 'review', de: 'Gesendet', en: 'Sent' };
  if (st === 'redo')  return { item: 'review', badge: 'review',  seg: 'review', de: 'Nochmal',  en: 'Redo' };
  if (st === 'missed')return { item: 'missed', badge: 'missed',  seg: 'missed', de: 'Verpasst', en: 'Missed' };
  if (st === 'cancelled_by_provider')
                      return { item: 'missed', badge: 'missed',  seg: 'missed', de: 'Abgesagt', en: 'Cancelled' };
  if (st === 'cancelled')
                      return { item: 'absent', badge: 'absent',  seg: '',       de: v.cancelled_by === 'pause' ? 'Pause' : 'Abgesagt', en: v.cancelled_by === 'pause' ? 'Pause' : 'Cancelled' };
  if (st === 'in_progress' || (st === 'planned' && v.date === todayIso))
                      return { item: 'now',    badge: en ? 'now' : 'myturn', seg: '', de: 'Heute', en: 'Today' };
  if (v.focus)        return { item: 'next',   badge: 'next',    seg: '',       de: 'Nächster', en: 'Next' };
  return               { item: '',             badge: 'upcoming',seg: '',       de: '—',        en: '—' };
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
    return `<div class="k-mob-rot-seg ${b.seg}"></div>`;
  }).join('');
  const items = strip.map(v => {
    const b = _pvStripBadge(v, todayIso, en);
    return `<div class="k-mob-rot-item ${b.item}"><span class="k-mob-rot-badge ${b.badge}">${en ? b.en : pvEsc(b.de)}</span><span class="k-mob-rot-room">${pvWdDM(v.date, en)}</span><span class="k-mob-rot-dates">${pvEsc(pvStripHTMLToday(v, todayIso, en))}</span></div>`;
  }).join('');
  return `<div class="k-mob-rot-line"></div><div class="k-mob-rot-segs">${segs}</div><div class="k-mob-rot-items">${items}</div>`;
}

/* ── DATES ──────────────────────────────────────────────── */
function pvAddDays(iso, n) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* ── HOLIDAYS (Hessen · display only, never auto-moved) ─── */
function _pvEaster(y) {                      /* Gregorian computus → UTC ms of Easter Sunday */
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
        f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mo - 1, da);
}
const _pvHol = {};
function pvHoliday(iso) {
  const y = +String(iso).slice(0, 4);
  if (!_pvHol[y]) {
    const e = _pvEaster(y), rel = n => new Date(e + n * 86400000).toISOString().slice(0, 10), fix = md => y + '-' + md;
    _pvHol[y] = {
      [fix('01-01')]: 'Neujahr', [rel(-2)]: 'Karfreitag', [rel(0)]: 'Ostersonntag', [rel(1)]: 'Ostermontag',
      [fix('05-01')]: 'Tag der Arbeit', [rel(39)]: 'Christi Himmelfahrt', [rel(49)]: 'Pfingstsonntag', [rel(50)]: 'Pfingstmontag',
      [rel(60)]: 'Fronleichnam', [fix('10-03')]: 'Tag der Deutschen Einheit', [fix('12-25')]: '1. Weihnachtstag', [fix('12-26')]: '2. Weihnachtstag'
    };
  }
  return _pvHol[y][String(iso).slice(0, 10)] || null;
}

/* ── PROVIDER CARD (service app + Lynn's read-only preview) ─
   Buttons carry data-act: start · list · cancel · undo            */
const _PV_REASON = { krank: ['krank', 'sick'], termin: ['anderer Termin', 'other plans'], anderes: ['anderes', 'other'] };
function _pvIco(name, size) { return typeof pvPic === 'function' ? pvPic(name, size) : ''; }
function _pvExtraNote(v) {
  const x = v && v.extra_task;
  if (!x || !x.de) return '';
  return `<span class="k-note" style="color:#A3512A;">Extra heute: ${pvEsc(x.de)}${x.en ? ' · ' + pvEsc(x.en) : ''}</span>`;
}
function _pvCancelLink() {
  return `<button type="button" data-act="cancel" style="display:block;margin:8px auto 0;min-height:36px;padding:0 12px;background:none;border:none;font-size:13px;font-weight:500;color:#A32D2D;text-decoration:underline;text-underline-offset:3px;">Kann nicht kommen <span style="font-weight:400;color:#C07070;">· Can't come</span></button>`;
}
function _pvListBtn(total, light) {
  return `<button class="pv-big pv-big--light" type="button" data-act="list"${light ? '' : ' style="min-height:48px;margin-top:8px;"'}>
      <span class="pv-big__ico"${light ? '' : ' style="width:32px;height:32px;"'}>${_pvIco('btn_list', light ? 20 : 17)}</span>
      <span class="pv-big__txt"><span class="pv-big__de"${light ? '' : ' style="font-size:14px;"'}>Putzliste ansehen</span><span class="pv-big__en">View cleaning list</span></span>
      ${light && total ? `<span class="pv-big__count" style="background:#EDE8E0;color:#6B5E4E;">${total}</span>` : ''}
    </button>`;
}
function _pvStartAnyway(compact) {           /* no visit in the photo window → unplanned start */
  const btn = `<button class="pv-big pv-big--light" type="button" data-act="unplanned"${compact ? ' style="min-height:48px;margin-top:8px;"' : ''}>
      <span class="pv-big__ico"${compact ? ' style="width:32px;height:32px;"' : ''}>${_pvIco('btn_unplanned', compact ? 17 : 20)}</span>
      <span class="pv-big__txt"><span class="pv-big__de"${compact ? ' style="font-size:14px;"' : ''}>Trotzdem starten</span><span class="pv-big__en">Start anyway · unplanned</span></span>
    </button>`;
  return compact ? `<div style="margin-top:12px;padding-top:10px;border-top:.5px solid var(--cc-rule);"><span class="k-note" style="margin-top:0;">Heute trotzdem geputzt? Starte hier – Casa Castel prüft es. · Cleaned anyway? Casa Castel checks it.</span>${btn}</div>` : btn;
}
function _pvCovered(v) { const c = v.counts || {}; return (c.done || 0) + (c.np || 0); }
function _pvSpan(v) {                        /* 10:12–11:40 */
  const a = pvHM(v.first_photo_at || v.started_at), b = pvHM(v.sent_at);
  return a && b ? a + '–' + b : (a || b || '');
}
function _pvSuppliesLink() {
  return `<button type="button" data-act="supplies" style="display:block;margin:6px auto 0;min-height:32px;padding:0 12px;background:none;border:none;font-size:12.5px;font-weight:500;color:#6B5E4E;text-decoration:underline;text-underline-offset:3px;">Fehlt etwas? <span style="font-weight:400;color:#9A8E7E;">· Something missing?</span></button>`;
}
function _pvRedoStrip(r) {                   /* a redo still open on another visit's day → red strip under the card */
  const fl = (r.points || []).filter(p => p.flagged);
  return `<div style="margin-top:12px;padding:10px 12px;border-radius:12px;background:#FEF6F5;border:1px solid #F5A8A5;display:flex;align-items:center;gap:10px;">
      <span style="flex:1;min-width:0;font-size:12.5px;line-height:1.35;color:#7A2020;"><b style="font-weight:600;">Nochmal offen · Redo open</b><br>${pvEsc(pvWdDM(r.date))}: ${pvEsc(fl.map(p => p.de).join(', '))}${r.redo_until ? ' · bis ' + pvWdDM(r.redo_until) : ''}</span>
      <button type="button" data-act="redo-other" style="flex-shrink:0;min-height:40px;padding:0 14px;border-radius:12px;border:1px solid #D9B878;background:#F3DDB0;color:#4A3410;font-size:13px;font-weight:600;">Neu machen</button>
    </div>`;
}
function pvProviderCardHTML(s) {
  const c0 = _pvProviderCard(s);
  const v = s && s.card;
  let extra = '';
  if (v && ['sent', 'done'].includes(v.status) && typeof pvInvoiceCardButton === 'function') extra += pvInvoiceCardButton(s);
  if (v && v.redo_other) extra += _pvRedoStrip(v.redo_other);
  if (typeof pvInvoiceBlocks === 'function') extra += pvInvoiceBlocks(s);
  if (!v || ['planned', 'in_progress', 'sent', 'done', 'redo'].includes(v.status)) extra += _pvSuppliesLink();
  return { turn: c0.turn, html: c0.html + extra };
}
function _pvProviderCard(s) {
  const v = s && s.card;
  if (!v) {
    return { turn: '', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip">${_pvIco('chip_later', 13)}Kein Termin heute <span class="en">· No visit today</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(s.today))}</span>
        <span class="k-mob-week-dates-sm">Kein nächster Termin · no next visit</span>
        <span class="k-note">Heute trotzdem geputzt? Starte hier – Casa Castel prüft es. · Cleaned anyway? Casa Castel checks it.</span>
      </div></div>
      ${_pvStartAnyway(false)}` };
  }
  const counts = v.counts || {};
  const total = counts.total || 0;
  const n = pvDaysUntil(v.date, s.today);
  const open = !!(v.window && v.window.open);
  const dayChip = n === 0 ? 'Heute <span class="en">· Today</span>' : n === 1 ? 'Morgen <span class="en">· Tomorrow</span>' : 'Noch offen <span class="en">· Still open</span>';
  const lastLine = () => {
    const lv = v.last_visit;
    return lv && lv.status === 'done' ? `<span class="k-note k-note--done">Letzter Termin ${pvDM(lv.date)}: erledigt ✓ · Last visit: done</span>` : '';
  };
  const movedLine = () => v.moved_from && v.moved_from !== v.date
    ? `<span class="k-note">Neuer Termin (vorher ${pvDM(v.moved_from)}) · New date (was ${pvDM(v.moved_from)})</span>` : '';
  const unplannedLine = v.unplanned ? '<span class="k-note">Ohne Termin – Casa Castel prüft es. · Unplanned – Casa Castel checks it.</span>' : '';
  const forLine = () => v.person_id && v.person_id !== localStorage.getItem('pv_person') && v.person
    ? `<span class="k-note">Geplant für ${pvEsc(v.person)} · planned for ${pvEsc(v.person)}</span>` : '';
  const reopenLine = v.reopen_until && new Date(v.reopen_until) > new Date() ? `<span class="k-note">Wieder offen bis ${pvWdDM(String(v.reopen_until).slice(0, 10))} ${pvHM(v.reopen_until)} · Reopened</span>` : '';

  if (v.status === 'planned' && open) {                     /* photo window open: yellow to-do */
    return { turn: 'turn', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip myturn">${_pvIco('chip_today', 13)}${dayChip}</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${v.time ? 'ab ' + pvEsc(v.time) + ' · ' : ''}${total} Fotos · ${total} photos</span>
        <span class="k-note">Erst putzen, dann fotografieren. · Clean first, then take photos.</span>
        ${forLine()}${reopenLine}${_pvExtraNote(v)}${movedLine()}
      </div></div>
      <button class="pv-big" type="button" data-act="start">
        <span class="pv-big__ico">${_pvIco('btn_cam', 20)}</span>
        <span class="pv-big__txt"><span class="pv-big__de">Fotos starten</span><span class="pv-big__en">Start photos</span></span>
        <span class="pv-big__count">0 / ${total}</span>
      </button>
      ${_pvListBtn(total, false)}
      ${v.can_cancel ? _pvCancelLink() : ''}` };
  }

  if (v.status === 'planned') {                             /* next visit (window not open yet) */
    const inDays = n === 1 ? 'morgen · tomorrow' : `in ${n} Tagen · in ${n} days`;
    return { turn: '', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip next">${_pvIco('chip_next', 13)}Nächster Termin <span class="en">· Next visit</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${v.time ? 'ab ' + pvEsc(v.time) + ' · ' : ''}${inDays}</span>
        ${forLine()}${lastLine()}${_pvExtraNote(v)}${movedLine()}
      </div></div>
      ${_pvListBtn(total, true)}
      ${v.can_cancel ? _pvCancelLink() : ''}
      ${_pvStartAnyway(true)}` };
  }

  if (v.status === 'in_progress') {                         /* paused / running: continue where you were */
    const cov = _pvCovered(v);
    const all = total > 0 && cov >= total;
    return { turn: 'turn', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip myturn">${_pvIco('chip_today', 13)}${dayChip}</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${cov} von ${total} Fotos · since ${pvHM(v.started_at)}</span>
        <span class="k-note">${all ? 'Alles fotografiert – jetzt senden. · All done – now send.' : 'Pausiert – mach weiter, wo du warst. · Paused – continue where you were.'}</span>
        ${unplannedLine}${_pvExtraNote(v)}
      </div></div>
      <div class="pv-prog"><span style="width:${total ? Math.round(cov / total * 1000) / 10 : 0}%"></span></div>
      <button class="pv-big" type="button" data-act="continue">
        <span class="pv-big__ico">${_pvIco(all ? 'send' : 'btn_continue', 20)}</span>
        <span class="pv-big__txt"><span class="pv-big__de">${all ? 'Senden' : 'Weiter'}</span><span class="pv-big__en">${all ? 'Send' : 'Continue'}</span></span>
        <span class="pv-big__count">${cov} / ${total}</span>
      </button>` };
  }

  if (v.status === 'redo') {                                /* Lynn asked for some areas again */
    const fl = (v.points || []).filter(p => p.flagged);
    const redone = fl.filter(p => p.redone && (p.path || p.np)).length;
    const names = fl.map(p => p.de).join(', ');
    return { turn: 'redo', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip flagged">${_pvIco('chip_redo', 13)}Nochmal <span class="en">· Redo</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">Nur ${fl.length} ${fl.length === 1 ? 'Bereich' : 'Bereiche'} neu · only ${fl.length} ${fl.length === 1 ? 'area' : 'areas'} again${v.redo_until ? ' · bis ' + pvWdDM(v.redo_until) : ''}</span>
        <div style="display:flex;align-items:center;gap:8px;margin-top:7px;">${fl.slice(0, 3).map(p => `<span class="pic pic--${pvEsc(p.zone || 'c')}" style="width:36px;height:36px;border-radius:10px;">${_pvIco(p.pic, 22)}</span>`).join('')}<span class="k-note k-note--flag" style="margin-top:0;">${pvEsc(names)}${v.flag_note ? ': „' + pvEsc(v.flag_note) + '“' : ''}</span></div>
      </div></div>
      <button class="pv-big" type="button" data-act="redo">
        <span class="pv-big__ico">${_pvIco('btn_redo', 20)}</span>
        <span class="pv-big__txt"><span class="pv-big__de">${fl.length} ${fl.length === 1 ? 'Foto' : 'Fotos'} neu machen</span><span class="pv-big__en">Retake ${fl.length} ${fl.length === 1 ? 'photo' : 'photos'}</span></span>
        <span class="pv-big__count">${redone} / ${fl.length}</span>
      </button>` };
  }

  if (v.status === 'sent') {
    return { turn: 'wait', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip submitted">${_pvIco('chip_sent', 13)}Gesendet <span class="en">· Sent</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${total} Fotos · ${_pvSpan(v)}</span>
        <span class="k-note k-note--wait">Wird geprüft. · Waiting for review.</span>${unplannedLine}
      </div></div>
      <button class="pv-big pv-big--light" type="button" data-act="list" style="min-height:48px;margin-top:8px;">
        <span class="pv-big__ico">${_pvIco('btn_list', 20)}</span>
        <span class="pv-big__txt"><span class="pv-big__de">Putzliste ansehen</span><span class="pv-big__en">View cleaning list</span></span>
        <span class="pv-big__count">${_pvCovered(v)} / ${total}</span>
      </button>` };
  }

  if (v.status === 'done') {
    return { turn: 'done', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip approved">${_pvIco('chip_photos', 13)}Erledigt <span class="en">· Done</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${total} Fotos · ${_pvSpan(v)}</span>
        <span class="k-note k-note--done">Danke! · Thank you!</span>
      </div></div>` };
  }

  if (v.status === 'rejected') {
    return { turn: '', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip" style="background:#EDE8E0;border:1px solid #E0DAD0;color:#6B5E4E;">Nicht gezählt <span class="en">· Not counted</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-note">Casa Castel hat diesen Termin nicht gezählt. · Casa Castel did not count this visit.</span>
      </div></div>` };
  }

  if (v.status === 'missed') {
    return { turn: 'redo', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip missed">${_pvIco('chip_cancel', 13)}Nicht gesendet <span class="en">· Not sent</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-note k-note--flag">Casa Castel meldet sich. · Casa Castel will get in touch.</span>
      </div></div>` };
  }

  if (v.status === 'cancelled_by_provider') {
    const r = _PV_REASON[v.cancel_reason] || ['', ''];
    const why = r[0] ? ` · Grund: ${r[0]} · reason: ${r[1]}` : '';
    return { turn: 'redo', html: `
      <div class="k-mob-week-top-row"><span class="k-mob-status-chip missed">${_pvIco('chip_cancel', 13)}Abgesagt <span class="en">· Cancelled</span></span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${v.time ? 'ab ' + pvEsc(v.time) : ''}${why}</span>
        ${v.cancel_note ? `<span class="k-note">„${pvEsc(v.cancel_note)}“</span>` : ''}
        <span class="k-note k-note--flag">Casa Castel plant einen neuen Termin. · Casa Castel plans a new date.</span>
      </div></div>
      ${v.can_undo_cancel ? `<button type="button" data-act="undo" style="display:flex;align-items:center;gap:6px;margin:8px auto 0;min-height:36px;padding:0 12px;background:none;border:none;font-size:13px;font-weight:500;color:#6B5E4E;text-decoration:underline;text-underline-offset:3px;">${_pvIco('undo', 14)}Rückgängig <span style="font-weight:400;color:#9A8E7E;">· Undo</span></button>` : ''}` };
  }

  return { turn: '', html: `
    <div class="k-mob-week-top-row"><span class="k-mob-status-chip">${_pvIco('chip_next', 13)}${pvEsc(v.status)}</span></div>
    <div class="k-mob-week-body"><div class="k-mob-week-left"><span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span></div></div>` };
}

/* ── SUPPLIES ("Fehlt etwas?", board P9) ────────────────── */
const PV_SUPPLIES = [
  ['bags', 'Müllbeutel', 'Bin bags', 'k', 'sup_bags'], ['soap', 'Spülmittel', 'Dish soap', 'k', 'sup_soap'],
  ['paper', 'WC-Papier', 'Toilet paper', 'b', 'sup_paper'], ['cleaner', 'Putzmittel', 'Cleaner', 'c', 'sup_cleaner'],
  ['vacbags', 'Staubsaugerbeutel', 'Vacuum bags', 'f', 'sup_vacbags'], ['other', 'Anderes', 'Other', 'x', 'sup_other']
];
function pvSuppliesText(pl, en) {
  const names = [].concat(pl.items || []).filter(k => k !== 'other').map(k => {
    const it = PV_SUPPLIES.find(x => x[0] === k);
    return it ? (en ? it[2] : it[1]) : k;
  });
  if (pl.note) names.push('„' + pl.note + '“');
  return names.join(', ');
}

/* ── HISTORY ROW (Lynn M8 · provider read-only) ──────────── */
function _pvMonthName(iso, en) {
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number);
  return new Intl.DateTimeFormat(en ? 'en-GB' : 'de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}
function _pvHistPill(v, en) {
  const t = {
    done: ['hc-pill--done', 'Done', 'Erledigt'], sent: ['', 'To review', 'Gesendet'], redo: ['hc-pill--missed', 'Redo', 'Nochmal'],
    missed: ['hc-pill--missed', 'Missed', 'Verpasst'], rejected: ['hc-pill--later', 'Not counted', 'Nicht gezählt'],
    cancelled: ['hc-pill--away', v.cancelled_by === 'pause' ? 'Pause' : 'Cancelled', v.cancelled_by === 'pause' ? 'Pause' : 'Abgesagt'],
    cancelled_by_provider: ['hc-pill--missed', 'Cancelled by ' + (v.cancelled_person || 'provider'), 'Abgesagt'],
    in_progress: ['hc-pill--now', 'In progress', 'Läuft']
  }[v.status] || ['hc-pill--later', v.status, v.status];
  const st = t[0] ? '' : ' style="background:#FDE4D0;border-color:#F0A877;color:#8A3E12;"';
  return `<span class="hc-pill ${t[0]}"${st}>${pvEsc(en ? t[1] : t[2])}</span>`;
}
function pvHistoryRowHTML(v, en, avatar) {
  const th = v.thumbs || [];
  const c = v.counts || {};
  const span = (v.first_photo_at || v.started_at) && v.sent_at ? pvHM(v.first_photo_at || v.started_at) + '–' + pvHM(v.sent_at) : '';
  const meta = [];
  if (span) meta.push(span);
  if (c.done) meta.push(c.done + (en ? ' photos' : ' Fotos'));
  if (c.np) meta.push(c.np + (en ? ' not possible' : ' nicht möglich'));
  if ((v.people || []).length > 1) meta.push(v.people.join(' + '));
  if (v.unplanned) meta.push(en ? 'unplanned' : 'ohne Termin');
  const notes = [];
  if ((v.flagged_names || []).length) notes.push((en ? 'Redo ' : 'Nochmal: ') + v.flagged_names.join(', ') + (v.flag_note ? ' · „' + v.flag_note + '“' : ''));
  if (v.status === 'cancelled_by_provider' && v.cancel_reason) notes.push((en ? 'Reason: ' : 'Grund: ') + ({ krank: en ? 'sick' : 'krank', termin: en ? 'other plans' : 'anderer Termin', anderes: en ? 'other' : 'anderes' }[v.cancel_reason] || '') + (v.cancel_note ? ' · „' + v.cancel_note + '“' : ''));
  if (v.moved_from && v.moved_from !== v.date) notes.push((en ? 'moved from ' : 'verschoben von ') + pvDM(v.moved_from));
  const show = th.slice(0, 7), more = th.length - show.length;
  const strip = show.map(p => p.path
      ? `<div class="pv-ph"${en ? ` data-view="${pvEsc(v.id)}|${pvEsc(p.key)}"` : ''} style="background:#D9D1C5 url('${pvEsc(pvProofUrl(p.path))}') center/cover no-repeat;"></div>`
      : `<div class="pv-ph pv-ph--np"${en ? ` data-view="${pvEsc(v.id)}|${pvEsc(p.key)}" style="background:#FEF6F5;border-color:#F5A8A5;color:#A32D2D;"` : ''}>–</div>`).join('')
    + (more > 0 ? `<div class="pv-ph pv-ph--more" style="font-size:11px;"${en ? ` data-view="${pvEsc(v.id)}|${pvEsc(th[7].key)}"` : ''}>+${more}</div>` : '');
  return `<div class="pv-hv">
      <div class="pv-hv__top"><p class="pv-hv__d">${pvWdDM(v.date, en)}${String(v.date).slice(0, 4)}</p>${(v.people || []).map(n => avatar ? avatar(n) : '').join('')}${_pvHistPill(v, en)}</div>
      ${meta.length ? `<p class="pv-hv__meta">${pvEsc(meta.join(' · '))}</p>` : ''}
      ${strip ? `<div class="pv-strip">${strip}</div>` : ''}
      ${notes.length ? `<p class="pv-hv__note">${pvEsc(notes.join(' · '))}</p>` : ''}
    </div>`;
}
function pvHistoryHTML(visits, en, avatar) {
  if (!visits.length) return `<p class="pv-k" style="padding:10px 2px;">${en ? 'No visits yet.' : 'Noch keine Termine · No visits yet'}</p>`;
  let h = '', month = '';
  visits.forEach(v => {
    const mo = String(v.month || v.date).slice(0, 7);
    if (mo !== month) {
      month = mo;
      const n = visits.filter(x => String(x.month || x.date).slice(0, 7) === mo).length;
      h += `<div class="pv-sec" style="padding:10px 12px;margin:${h ? '6px' : '0'} 0 8px;"><p style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#9A8E7E;">${pvEsc(_pvMonthName(mo + '-01', en))}</p><p style="font-size:13px;color:#1E1B18;margin-top:2px;">${n} ${en ? (n === 1 ? 'visit' : 'visits') : (n === 1 ? 'Termin · visit' : 'Termine · visits')}</p></div>`;
    }
    h += pvHistoryRowHTML(v, en, avatar);
  });
  return h;
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
  else if (pl.date) txt += ' · ' + pvWdDM(pl.date, en);                 /* which visit the line is about */
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
  const av = name === 'Casa Castel' ? 'CC' : String(name).trim().charAt(0).toUpperCase();
  const del = opts.canDelete ? `<button type="button" aria-label="Delete message" onclick="${opts.onDelete}('${m.id}')" style="align-self:center;width:28px;height:28px;border-radius:50%;border:.5px solid var(--cc-rule);background:var(--cc-white);color:var(--cc-taupe);display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"></path></svg></button>` : '';
  const pl = m.payload || {};
  let body = '';
  if (m.kind === 'photo' && pl.path) body += `<img src="${pvEsc(pvProofUrl(pl.path))}" alt="" style="max-width:180px;border-radius:8px;display:block;margin-top:2px;" loading="lazy"/>`;
  if (m.kind === 'supplies') body += `<p class="k-chat-text">${opts.en ? 'Missing supplies' : 'Fehlt · Missing'}: ${pvEsc(pvSuppliesText(pl, opts.en))}</p>`;
  if (m.kind === 'damage') {
    body += `<p class="k-chat-text">${opts.en ? 'Damage reported' : 'Schaden gemeldet · Damage reported'}${pl.note ? ': „' + pvEsc(pl.note) + '“' : ''}</p>`;
    if (pl.path) body += `<img src="${pvEsc(pvProofUrl(pl.path))}" alt="" style="max-width:180px;border-radius:8px;display:block;margin-top:4px;" loading="lazy"${opts.en ? ` data-photo="${pvEsc(pl.path)}"` : ''}/>`;
  }
  if (pl.text && m.kind !== 'damage') body += `<p class="k-chat-text">${pvEsc(pl.text)}</p>`;
  return `<div class="k-chat-row"><span class="k-chat-avatar">${pvEsc(av)}</span><div class="k-chat-body"><div class="k-chat-meta"><span class="k-chat-name">${pvEsc(name)}</span><span class="k-chat-time">${pvTs(m.at)}</span></div>${body}</div>${del}</div>`;
}
function _pvSentBlock(m, state, en) {         /* "Gesendet" block · Lynn: the review grid (every photo, tap = viewer) */
  const pl = m.payload || {};
  const re = pl.code === 'resent';
  const shots = (state.photos[m.visit_id] || []).filter(p => p.path || p.np);
  if (en) {
    const why = { besetzt: 'occupied', kaputt: 'broken', anderes: 'other' };
    const grid = shots.map(p => p.path
        ? `<div class="pv-ph" data-view="${pvEsc(m.visit_id)}|${pvEsc(p.key)}" style="background:#D9D1C5 url('${pvEsc(pvProofUrl(p.path))}') center/cover no-repeat;"><span>${pvEsc(p.de || '')}</span></div>`
        : `<div class="pv-ph pv-ph--np" data-view="${pvEsc(m.visit_id)}|${pvEsc(p.key)}" style="background:#FEF6F5;border-color:#F5A8A5;color:#A32D2D;">–<span>${pvEsc(p.de || '')}</span></div>`).join('');
    const nps = shots.filter(p => p.np && !p.path).map(p => `<p class="pv-np">${pvPic('np_line', 12)}${pvEsc(p.de)} not possible (${why[p.np] || p.np})</p>`).join('');
    return `<div class="pv-sub"><div class="pv-sub__top">${pl.person ? `<span class="pv-name-pill">${pvEsc(pl.person)}</span>` : ''}<span class="pv-badge ${re ? 'pv-badge--re' : 'pv-badge--sub'}">${re ? '↑↑ Re-sent' : '↑ Submitted'}</span><span class="pv-time">${pvTs(m.at)} · tap a photo to enlarge</span></div>${grid ? `<div class="pv-grid" style="grid-template-columns:repeat(7,minmax(0,1fr));">${grid}</div>` : ''}${nps}</div>`;
  }
  const show = shots.slice(0, 4), more = shots.length - show.length;
  const grid = show.map(p => p.path
      ? `<div class="pv-ph" style="background:#D9D1C5 url('${pvEsc(pvProofUrl(p.path))}') center/cover no-repeat;"><span>${pvEsc(p.de || '')}</span></div>`
      : `<div class="pv-ph pv-ph--np"${en ? ' style="background:#FEF6F5;border-color:#F5A8A5;color:#A32D2D;"' : ''}>–<span>${pvEsc(p.de || '')}</span></div>`).join('')
    + (more > 0 ? `<div class="pv-ph pv-ph--more">+${more}</div>` : '');
  const badge = re ? (en ? '↑↑ Re-sent' : '↑↑ Neu gesendet · Re-sent') : (en ? '↑ Submitted' : '↑ Gesendet · Sent');
  return `<div class="pv-sub"><div class="pv-sub__top">${pl.person ? `<span class="pv-name-pill">${pvEsc(pl.person)}</span>` : ''}<span class="pv-badge ${re ? 'pv-badge--re' : 'pv-badge--sub'}">${badge}</span><span class="pv-time">${pvTs(m.at)}</span></div>${grid ? `<div class="pv-grid">${grid}</div>` : ''}</div>`;
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
    if (m.kind === 'system') {
      const code = (m.payload || {}).code;
      html += (code === 'sent' || code === 'resent') && state.photos && state.photos[m.visit_id] ? _pvSentBlock(m, state, opts.en) : _pvSysLine(m, opts.en);
    }
    else html += pvChatRowHTML(m, opts.canDelete || m.person_id != null ? opts : { en: opts.en });
  });
  return html;
}

/* ── NO BLINKS: patch only what changed · the chat keeps the reader's place ── */
function pvSetHTML(el, html) {
  if (!el || el.__pvHtml === html) return false;
  el.innerHTML = html;
  el.__pvHtml = html;
  return true;
}
function pvSetFeed(el, html) {
  if (!el) return;
  const atEnd = el.__pvHtml === undefined || el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  if (pvSetHTML(el, html) && atEnd) el.scrollTop = el.scrollHeight;
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
