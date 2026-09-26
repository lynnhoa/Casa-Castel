/* ─────────────────────────────────────────────────────────────
   cc-german-format.js — German numbers & dates (all management apps)

   Loaded by: rentals-index.html, landlord.html, controlling.html,
              properties.html  (NOT tenant.html)

   What you see / type          What the code and database get
   1.200,00 €  (1.200 / 1200,5) 1200.5   (plain number, unchanged)
   26.09.2026                   2026-09-26 (ISO, unchanged)

   1) Formatting helpers   ccParseEUR, ccFmtNum, ccFmtEUR,
                           ccParseDate, ccFmtDate, ccFmtDateShort,
                           ccTodayISO, ccTodayPlusYearsISO, ccFmtTs
   2) Money fields  <input type="number" data-cc-num="2|auto">
      become text fields with the decimal keyboard. They SHOW German
      (1.200,00) but .value still RETURNS "1200" for the existing code.
      Whole-number fields (keys, counts…) have no data-cc-num and stay as they are.
   3) Date fields   <input type="date">  become text fields TT.MM.JJJJ.
      They SHOW 26.09.2026 but .value still RETURNS "2026-09-26" and
      still ACCEPTS "2026-09-26". Dots are added while typing.
   ───────────────────────────────────────────────────────────── */

const CC_TZ = 'Europe/Berlin';

/* ── NUMBERS ─────────────────────────────────────────────── */

/* Reads what a person typed. Returns a number, or null (empty / not a number).
   1.200,50 → 1200.5 · 1200,5 → 1200.5 · 1.200 → 1200 · 250.000 → 250000
   850.50 → 850.5 (English decimal still understood) · 1,200.50 → null   */
function ccParseEUR(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[€\s\u00a0\u202f]/g, '');
  if (!s) return null;
  let neg = false;
  if (/^[-\u2212]/.test(s)) { neg = true; s = s.slice(1); }
  else if (s[0] === '+') s = s.slice(1);
  if (s.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d*)(,\d*)?$/.test(s)) return null;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (!/^\d*\.?\d*$/.test(s)) {
    return null;
  }
  if (s === '' || s === '.') return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

/* 1200.5 → "1.200,50"   dec: 2 (fixed) | 'auto' (0–2) | any whole number */
function ccFmtNum(n, dec = 2) {
  if (n === null || n === undefined || n === '') return '';
  const v = typeof n === 'number' ? n : ccParseEUR(n);
  if (v === null || !isFinite(v)) return '';
  const min = dec === 'auto' ? 0 : dec;
  const max = dec === 'auto' ? 2 : dec;
  return v.toLocaleString('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
}

/* 1200.5 → "1.200,50 €" */
function ccFmtEUR(n) {
  return ccFmtNum(Number(n) || 0, 2) + '\u00a0€';
}

/* ── DATES ───────────────────────────────────────────────── */

function _ccPad(n) { return String(n).padStart(2, '0'); }

function _ccValidYMD(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;   // 31.02. etc.
  return `${y}-${_ccPad(m)}-${_ccPad(d)}`;
}

/* German calendar date of a moment in time (Date or timestamp string) */
function _ccBerlinYMD(date) {
  const parts = {};
  new Intl.DateTimeFormat('de-DE', { timeZone: CC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* Reads a date. Returns ISO "YYYY-MM-DD" or null.
   26.09.2026 · 6.9.2026 · 26.09.26 · 2026-09-26 · full timestamps (German date)
   strict=true: only 4-digit years (used while typing)                       */
function ccParseDate(v, strict = false) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : _ccBerlinYMD(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return _ccValidYMD(+m[1], +m[2], +m[3]);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {                    // timestamp → German day
    const t = new Date(s);
    return isNaN(t) ? null : _ccBerlinYMD(t);
  }
  m = s.match(strict ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/ : /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += 2000;
    return _ccValidYMD(y, +m[2], +m[1]);
  }
  return null;
}

/* → "26.09.2026". Text that is not a date (e.g. "2019") is returned as is. */
function ccFmtDate(v) {
  if (!v) return '';
  const iso = ccParseDate(v);
  if (!iso) return String(v);
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/* → "26.09." */
function ccFmtDateShort(v) {
  const iso = ccParseDate(v);
  if (!iso) return v ? String(v) : '';
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

/* Today in Germany as "YYYY-MM-DD" — correct in summer time, winter time and abroad */
function ccTodayISO() {
  return _ccBerlinYMD(new Date());
}

/* Today + n years ("YYYY-MM-DD"); 29.02. becomes 28.02. in non-leap years */
function ccTodayPlusYearsISO(n) {
  const [y, m, d] = ccTodayISO().split('-').map(Number);
  const ty = y + n;
  return _ccValidYMD(ty, m, d) || _ccValidYMD(ty, m, d - 1);
}

/* Chat / activity time → "26.09. · 14:30" (German time) */
function ccFmtTs(ts) {
  const t = new Date(ts);
  if (isNaN(t)) return '';
  const parts = {};
  new Intl.DateTimeFormat('de-DE', { timeZone: CC_TZ, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(t).forEach(p => { parts[p.type] = p.value; });
  return `${parts.day}.${parts.month}. · ${parts.hour}:${parts.minute}`;
}

/* Is this input a (converted) number field? Used by the save functions. */
function ccIsNumInput(el) {
  return !!el && (el.type === 'number' || el.hasAttribute('data-cc-num'));
}

/* ── INPUT FIELDS ────────────────────────────────────────── */
(function () {
  if (typeof window === 'undefined' || typeof HTMLInputElement === 'undefined') return;
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const nget = el => NATIVE.get.call(el);
  const nset = (el, v) => NATIVE.set.call(el, v);
  const PLAIN_NUM = /^-?\d+(\.\d+)?$/;
  const PICKER_ONLY = /^\s*try\s*\{\s*this\.showPicker\(\)\s*;?\s*\}\s*catch\s*\(\s*e\s*\)\s*\{\s*\}\s*;?\s*$/;

  /* ── money / decimal fields ── */
  function upgradeNum(el) {
    if (el._ccNum) return;
    el._ccNum = true;
    const mode = el.getAttribute('data-cc-num');
    const dec  = (mode === 'auto') ? 'auto' : (Number(mode) || 2);
    const raw  = nget(el);                               // "850.5" from the template
    el.setAttribute('type', 'text');
    el.setAttribute('inputmode', 'decimal');
    el.setAttribute('autocomplete', 'off');
    el.removeAttribute('step');
    const ph = el.getAttribute('placeholder');
    if (ph && PLAIN_NUM.test(ph.trim())) el.setAttribute('placeholder', ccFmtNum(Number(ph), dec));
    el._ccDec = dec;
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() {                                             // "1.200,50" → "1200.5" (rounded to cents)
        const n = ccParseEUR(nget(el));
        if (n === null) return '';
        const f = Math.pow(10, dec === 'auto' ? 2 : dec);
        return String(Math.round(n * f) / f);
      },
      set(v) {
        if (v === null || v === undefined || v === '') { nset(el, ''); return; }
        const s = String(v).trim();
        const n = PLAIN_NUM.test(s) ? Number(s) : ccParseEUR(s);
        nset(el, n === null ? s : ccFmtNum(n, dec));
        el.removeAttribute('aria-invalid');
      },
    });
    el.value = raw;
  }

  /* ── date fields ── */
  function upgradeDate(el) {
    if (el._ccDate) return;
    el._ccDate = true;
    const raw = nget(el);                                // "2026-09-26" from the template
    el.setAttribute('type', 'text');
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('placeholder', 'TT.MM.JJJJ');
    el.classList.add('cc-date');
    const oc = el.getAttribute('onclick');
    if (oc && PICKER_ONLY.test(oc)) el.removeAttribute('onclick');   // no picker any more
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() { return ccParseDate(nget(el), true) || ''; },
      set(v) {
        if (v === null || v === undefined || v === '') { nset(el, ''); return; }
        const iso = ccParseDate(v);
        nset(el, iso ? ccFmtDate(iso) : String(v));
        el.removeAttribute('aria-invalid');
      },
    });
    el.value = raw;
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches('input[data-cc-num]')) upgradeNum(root);
    if (root.matches('input[type=date]'))   upgradeDate(root);
    root.querySelectorAll('input[data-cc-num]').forEach(upgradeNum);
    root.querySelectorAll('input[type=date]').forEach(upgradeDate);
  }

  /* Dots while typing a date: 26092026 → 26.09.2026 (runs before the page's own handlers) */
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el || !el._ccDate) return;
    if (e.inputType && !e.inputType.startsWith('insert')) return;   // deleting: leave alone
    const cur = nget(el);
    if (!/^[\d.]*$/.test(cur)) return;
    const digits = cur.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4)      out = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
    else if (digits.length > 2) out = digits.slice(0, 2) + '.' + digits.slice(2);
    if (cur.includes('.')) return;                      // person types the dots themselves
    if (out !== cur) { nset(el, out); try { el.setSelectionRange(out.length, out.length); } catch (_) {} }
  }, true);

  /* Tidy on leaving the field: 1200,5 → 1.200,50 · 6.9.26 → 06.09.2026 · mark invalid */
  document.addEventListener('focusout', e => {
    const el = e.target;
    if (!el) return;
    const txt = el._ccNum || el._ccDate ? nget(el).trim() : null;
    if (txt === null) return;
    if (!txt) { el.removeAttribute('aria-invalid'); return; }
    if (el._ccNum) {
      const n = ccParseEUR(txt);
      if (n === null) { el.setAttribute('aria-invalid', 'true'); return; }
      nset(el, ccFmtNum(n, el._ccDec));
    } else {
      const iso = ccParseDate(txt);
      if (!iso) { el.setAttribute('aria-invalid', 'true'); return; }
      const shown = ccFmtDate(iso);
      if (shown !== txt) {
        nset(el, shown);
        el.dispatchEvent(new Event('input',  { bubbles: true }));   // e.g. 26.09.26 → pages recalculate
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    el.removeAttribute('aria-invalid');
  }, true);

  /* Invalid entry: red outline, so nothing is saved empty without you noticing */
  const st = document.createElement('style');
  st.textContent =
    'input[aria-invalid="true"]{border-color:#C0392B!important;box-shadow:0 0 0 1px #C0392B!important;}' +
    'input.cc-date{font-variant-numeric:tabular-nums;}';
  (document.head || document.documentElement).appendChild(st);

  new MutationObserver(muts => {
    for (const m of muts) m.addedNodes.forEach(scan);
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.body) scan(document.body);
  document.addEventListener('DOMContentLoaded', () => scan(document.body));
})();

/* ── GERMAN CALENDAR ─────────────────────────────────────────
   Every date field in the 4 management apps gets a calendar icon.
   Tap the icon → German calendar (September 2026, Mo–So, Heute).
   Always German, whatever language the phone is set to.
   Typing stays possible (tap the field itself).

   Which fields:
     • converted date pickers (input.cc-date — Mietbeginn, Mietende,
       Unterzeichnungsdatum, Gültig ab, Datum …)       → value stays ISO for the code
     • typed German date fields (Geburtsdatum, Übergabedatum, Mietbeginn /
       Mietende in the Tenants tabs, Kaufdatum)          → writes "26.09.2026"
     • Abrechnung von / bis (day + month, no year)       → writes "01.01."       */
(function () {
  if (typeof window === 'undefined' || typeof HTMLInputElement === 'undefined') return;
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const nget = el => NATIVE.get.call(el);
  const nset = (el, v) => NATIVE.set.call(el, v);

  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WDAYS  = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const TEXT_DATE = [
    'input[placeholder^="TT.MM.JJJJ"]', 'input[oninput*="_autoFormatGermanDate"]',
    'input[data-f="mietbeginn"]', 'input[data-f="mietende"]', 'input[data-mf="mietbeginn"]', 'input[data-mf="mietende"]',
    'input[data-f^="birthday"]', 'input[data-mf^="birthday"]', '#e-kaufdatum', '#a-kaufdatum',
  ].join(',');
  const DAY_MONTH = 'input[data-vf="abrechnung_von"], input[data-vf="abrechnung_bis"]';
  const ZONE = 44;                                        // px on the right of the field = the calendar icon

  function kindOf(el) {
    if (el._ccDate) return 'iso';
    if (el.matches(DAY_MONTH)) return 'daymonth';
    if (el.matches(TEXT_DATE)) return 'text';
    return null;
  }
  function isBirthday(el) {
    return /dob/i.test(el.id || '') || /^birthday/.test(el.dataset.f || el.dataset.mf || '');
  }
  function mark(el) {
    if (el._ccCal || el.type === 'hidden' || el.type === 'checkbox') return;
    const k = kindOf(el); if (!k) return;
    el._ccCal = k;
    el.classList.add('cc-cal');
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    const sel = 'input.cc-date, ' + TEXT_DATE + ', ' + DAY_MONTH;
    if (root.matches(sel)) mark(root);
    root.querySelectorAll(sel).forEach(mark);
  }

  /* current value of a field → {y, m, d} (y = null for day+month) */
  function readVal(el) {
    const k = el._ccCal;
    if (k === 'daymonth') {
      const m = nget(el).trim().match(/^(\d{1,2})\.(\d{1,2})\.?$/);
      return m ? { y: null, m: +m[2], d: +m[1] } : null;
    }
    const iso = k === 'iso' ? el.value : ccParseDate(nget(el));
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d };
  }
  function writeVal(el, y, m, d) {
    const p = n => String(n).padStart(2, '0');
    if (el._ccCal === 'iso')           el.value = y ? `${y}-${p(m)}-${p(d)}` : '';
    else if (el._ccCal === 'daymonth') nset(el, m ? `${p(d)}.${p(m)}.` : '');
    else                               nset(el, y ? `${p(d)}.${p(m)}.${y}` : '');
    el.removeAttribute('aria-invalid');
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ── the calendar sheet ── */
  let cur = null;                                         // { el, y, m, sel }
  function open(el) {
    if (el.disabled || el.readOnly) return;
    el.blur();                                            // no keyboard under the calendar
    const today = ccTodayISO().split('-').map(Number);
    const v = readVal(el);
    const dm = el._ccCal === 'daymonth';
    let y = v && v.y ? v.y : (isBirthday(el) ? today[0] - 35 : today[0]);
    let m = v ? v.m : (isBirthday(el) ? 1 : today[1]);
    cur = { el, y: dm ? 2024 : y, m, sel: v, dm, bday: isBirthday(el), today };   // 2024: day+month grid allows 29.02.
    const label = (el.closest('.rm-field, .apt-field, .tn-field, .e-field, .ct-row, div')?.querySelector('label, .apt-field__label, .tn-flbl, .e-lbl')?.textContent || 'Datum').replace(/\*/g, '').trim();
    close();
    const ov = document.createElement('div');
    ov.className = 'cccal-ov'; ov.id = 'ccCal';
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.innerHTML = `
      <div class="cccal" role="dialog" aria-modal="true" aria-label="${label.replace(/"/g, '')} wählen">
        <div class="cccal__hdr">
          <span class="cccal__ttl">${label.replace(/</g, '&lt;')}</span>
          <button type="button" class="cccal__x" aria-label="Schließen" data-a="close"><i class="ti ti-x"></i></button>
        </div>
        <div class="cccal__nav">
          <button type="button" class="cccal__arw" data-a="prev" aria-label="Vorheriger Monat"><i class="ti ti-chevron-left"></i></button>
          <select class="cccal__sel" data-a="month" aria-label="Monat">${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select>
          ${dm ? '' : `<select class="cccal__sel" data-a="year" aria-label="Jahr"></select>`}
          <button type="button" class="cccal__arw" data-a="next" aria-label="Nächster Monat"><i class="ti ti-chevron-right"></i></button>
        </div>
        ${dm ? '' : `<div class="cccal__wd">${WDAYS.map(w => `<span>${w}</span>`).join('')}</div>`}
        <div class="cccal__grid" role="grid"></div>
        <div class="cccal__btns">
          <button type="button" class="cccal__clr" data-a="clear">Leeren</button>
          ${dm ? '' : `<button type="button" class="cccal__today" data-a="today">Heute</button>`}
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
    ov.addEventListener('change', e => {
      if (e.target.dataset.a === 'month') cur.m = +e.target.value;
      if (e.target.dataset.a === 'year')  cur.y = +e.target.value;
      draw();
    });
    document.addEventListener('keydown', onKey);
    draw();
  }
  function close() {
    document.getElementById('ccCal')?.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function onClick(e) {
    const b = e.target.closest('[data-a], [data-d]'); if (!b || !cur) return;
    if (b.dataset.d) { writeVal(cur.el, cur.dm ? null : cur.y, cur.m, +b.dataset.d); close(); return; }
    const a = b.dataset.a;
    if (a === 'close') close();
    else if (a === 'prev') { cur.m--; if (cur.m < 1) { cur.m = 12; if (!cur.dm) cur.y--; } draw(); }
    else if (a === 'next') { cur.m++; if (cur.m > 12) { cur.m = 1; if (!cur.dm) cur.y++; } draw(); }
    else if (a === 'today') { const t = cur.today; writeVal(cur.el, t[0], t[1], t[2]); close(); }
    else if (a === 'clear') { writeVal(cur.el, null, null, null); close(); }
  }
  function draw() {
    const ov = document.getElementById('ccCal'); if (!ov || !cur) return;
    const { y, m, sel, dm, bday, today } = cur;
    ov.querySelector('[data-a="month"]').value = String(m);
    const ys = ov.querySelector('[data-a="year"]');
    if (ys) {
      const hi = bday ? today[0] : today[0] + 20, lo = today[0] - 100;
      const from = Math.min(lo, y), to = Math.max(hi, y);
      if (ys.dataset.range !== from + '-' + to) {
        let o = ''; for (let k = to; k >= from; k--) o += `<option value="${k}">${k}</option>`;
        ys.innerHTML = o; ys.dataset.range = from + '-' + to;
      }
      ys.value = String(y);
    }
    const days = new Date(y, m, 0).getDate();
    const lead = dm ? 0 : (new Date(y, m - 1, 1).getDay() + 6) % 7;   // Monday first
    let h = '';
    for (let i = 0; i < lead; i++) h += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const isSel = sel && sel.d === d && sel.m === m && (dm || sel.y === y);
      const isToday = !dm && today[0] === y && today[1] === m && today[2] === d;
      h += `<button type="button" class="cccal__day${isSel ? ' is-sel' : ''}${isToday ? ' is-today' : ''}" data-d="${d}"
              aria-label="${d}. ${MONTHS[m - 1]}${dm ? '' : ' ' + y}"${isSel ? ' aria-pressed="true"' : ''}>${d}</button>`;
    }
    ov.querySelector('.cccal__grid').innerHTML = h;
  }

  /* tap on the icon (right edge) → calendar; tap elsewhere → type as before */
  const inZone = (el, x) => { const r = el.getBoundingClientRect(); return x >= r.right - ZONE && x <= r.right + 2; };
  let t0 = null;                                          // a swipe that starts on the icon is a scroll, not a tap
  document.addEventListener('touchstart', e => {
    const t = e.touches && e.touches[0]; t0 = t ? { x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', e => {
    const el = e.target; if (!el || !el._ccCal) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || (t0 && Math.hypot(t.clientX - t0.x, t.clientY - t0.y) > 10)) return;
    if (inZone(el, t.clientX)) { e.preventDefault(); open(el); }
  }, { capture: true, passive: false });
  document.addEventListener('mousedown', e => {
    const el = e.target; if (el && el._ccCal && inZone(el, e.clientX)) e.preventDefault();
  }, true);
  document.addEventListener('click', e => {
    const el = e.target; if (el && el._ccCal && inZone(el, e.clientX)) { e.preventDefault(); open(el); }
  }, true);

  window.ccOpenCalendar = open;                           // e.g. for tests

  const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239A8E7E' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='5' width='16' height='16' rx='2'/%3E%3Cpath d='M16 3v4M8 3v4M4 11h16M8 15h2M8 18h2'/%3E%3C/svg%3E";
  const st = document.createElement('style');
  st.textContent = `
html input.cc-cal { background-image:url("${ICON}") !important; background-repeat:no-repeat !important;
  background-position:right 11px center !important; background-size:18px 18px !important; padding-right:40px !important; }
.cccal-ov { position:fixed; inset:0; z-index:800; background:rgba(30,27,24,.45); display:flex; align-items:flex-end; justify-content:center; }
.cccal { width:100%; max-width:420px; box-sizing:border-box; background:var(--cc-white, #FDFCFA); border-radius:16px 16px 0 0;
  padding:14px 16px max(16px, env(safe-area-inset-bottom, 16px)); animation:cccalUp .22s cubic-bezier(.32,.72,0,1); color:var(--cc-ink, #1E1B18); }
@keyframes cccalUp { from { transform:translateY(24px); opacity:0; } to { transform:none; opacity:1; } }
.cccal__hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.cccal__ttl { font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-taupe, #9A8E7E); }
.cccal__x { width:36px; height:36px; border-radius:50%; border:.5px solid var(--cc-rule, #E0DAD0); background:none; color:var(--cc-stone, #C8BFB0);
  display:flex; align-items:center; justify-content:center; font-size:15px; cursor:pointer; }
.cccal__nav { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
.cccal__arw { width:40px; height:40px; flex-shrink:0; border:.5px solid var(--cc-rule, #E0DAD0); border-radius:8px; background:var(--cc-white, #FDFCFA);
  color:var(--cc-charcoal, #3A3530); display:flex; align-items:center; justify-content:center; font-size:16px; cursor:pointer; }
.cccal__sel { flex:1; min-width:0; height:40px; padding:0 10px; border:.5px solid var(--cc-rule, #E0DAD0); border-radius:8px; background:var(--cc-white, #FDFCFA);
  color:var(--cc-ink, #1E1B18); font-family:inherit; font-size:16px; -webkit-appearance:none; appearance:none; text-align:center; }
.cccal__wd, .cccal__grid { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:2px; }
.cccal__wd span { text-align:center; font-size:10px; font-weight:600; letter-spacing:.06em; color:var(--cc-taupe, #9A8E7E); padding:4px 0; }
.cccal__day { height:42px; border:none; border-radius:8px; background:none; font-family:inherit; font-size:15px; color:var(--cc-ink, #1E1B18); cursor:pointer;
  font-variant-numeric:tabular-nums; -webkit-tap-highlight-color:transparent; }
.cccal__day:active { background:var(--cc-surface, #EDE8E0); }
.cccal__day.is-today { box-shadow:inset 0 0 0 1px var(--cc-gold, #B8956A); color:#5C3D1E; font-weight:600; }
.cccal__day.is-sel { background:var(--cc-ink, #1E1B18); color:#fff; font-weight:600; box-shadow:none; }
.cccal__btns { display:flex; justify-content:space-between; align-items:center; margin-top:10px; }
.cccal__clr { height:40px; padding:0 4px; border:none; background:none; color:var(--cc-taupe, #9A8E7E); font-family:inherit; font-size:13px; cursor:pointer; }
.cccal__today { height:40px; padding:0 18px; border:.5px solid #D4B896; border-radius:8px; background:#F5EFE6; color:#5C3D1E;
  font-family:inherit; font-size:13px; font-weight:500; cursor:pointer; }
.cccal button:focus-visible, .cccal select:focus-visible { outline:2px solid var(--cc-ink, #1E1B18); outline-offset:2px; }
@media (prefers-reduced-motion: reduce) { .cccal { animation:none; } }`;
  (document.head || document.documentElement).appendChild(st);

  new MutationObserver(muts => { for (const m of muts) m.addedNodes.forEach(scan); })
    .observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) scan(document.body);
  document.addEventListener('DOMContentLoaded', () => scan(document.body));
})();
