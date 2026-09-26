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
