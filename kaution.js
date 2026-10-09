/* ─────────────────────────────────────────────────────────────
   KAUTION — one rule for every card, generator, PDF and Tenants tab
   kaution.js   (loaded by landlord.html and rentals-index.html)

   Rule (decided Sep 2026):
   1. Manual value typed in the generator  → used for THAT PDF only
   2. Card override                        → only while its toggle is ON
   3. Rule: base × multiplier
        base        Kalt + NK pricing → Kaltmiete
                    Pauschal pricing  → Pauschalmiete (Kalt + NK)
                    Parking           → Miete
        multiplier  Mietvertrag / Gewerbe / Parking → 3×
                    Kurzzeit ≤ 3 Monate → 1× · > 3 Monate → 3×
   An empty field always falls back to the rule (never 0 €).
   Typing 0 on purpose gives 0 €.
   ───────────────────────────────────────────────────────────── */

function ccKautionRound(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/* Base amount for the pricing mode ('kalt_nk' | 'pauschal') */
function ccKautionBase(mode, kalt, nk) {
  const k = Number(kalt) || 0;
  const n = Number(nk)   || 0;
  return mode === 'pauschal' ? k + n : k;
}

/* Accepts 'YYYY-MM-DD', 'DD.MM.YYYY' or a Date — returns a local Date or null */
function _ccKautionDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

/* Kurzzeit: true when the stay is longer than 3 months.
   Exact calendar months — 01.10.–31.12. = 3 Monate (1×), 01.10.–01.01. = > 3 Monate (3×).
   null when start or end is missing. */
function ccKzIsLong(start, end) {
  const s = _ccKautionDate(start);
  const e = _ccKautionDate(end);
  if (!s || !e || e < s) return null;
  const limit = new Date(s.getFullYear(), s.getMonth() + 3, s.getDate());
  return e >= limit;
}

function ccKautionMultiplier(contract, start, end) {
  if (contract === 'kurzzeit') return ccKzIsLong(start, end) ? 3 : 1;
  return 3;   // mietvertrag · gewerbe · parking
}

/* Card override — only while the toggle is ON and a value is entered */
function ccKautionOverride(rec) {
  if (!rec || !rec.kaution_override) return null;
  const v = rec.kaution_default;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/* Manual generator value — empty = none (rule applies), '0' = 0 € */
function ccKautionManual(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/* Short text shown under "Kaution" in cards and generators */
function ccKautionRuleText(contract, mode, start, end) {
  const lbl = contract === 'parking' ? 'Miete' : (mode === 'pauschal' ? 'Pauschal' : 'Kalt');
  if (contract === 'kurzzeit') {
    const long = ccKzIsLong(start, end);
    if (long === null) return `≤ 3 Monate 1× · > 3 Monate 3× ${lbl}`;
    return long ? `> 3 Monate → 3× ${lbl}` : `≤ 3 Monate → 1× ${lbl}`;
  }
  return `3× ${lbl}`;
}

/* The one function everything calls.
   opts: { contract:'mietvertrag'|'kurzzeit'|'gewerbe'|'parking',
           mode:'kalt_nk'|'pauschal', kalt, nk,
           rec   (card pricing row with kaution_override / kaution_default),
           start, end (Kurzzeit dates), manual (generator field value) }
   returns { amount, source:'manual'|'override'|'rule', rule } */
function ccKaution(opts = {}) {
  const { contract = 'mietvertrag', mode = 'kalt_nk', kalt = 0, nk = 0,
          rec = null, start = null, end = null, manual = null } = opts;
  const ruleTxt = ccKautionRuleText(contract, mode, start, end);

  const m = ccKautionManual(manual);
  if (m !== null) return { amount: ccKautionRound(m), source: 'manual', rule: ruleTxt };

  const o = ccKautionOverride(rec);
  if (o !== null) return { amount: ccKautionRound(o), source: 'override', rule: 'Individuelle Kaution (Karte)' };

  const amount = ccKautionBase(contract === 'parking' ? 'kalt_nk' : mode, kalt, nk)
               * ccKautionMultiplier(contract, start, end);
  return { amount: ccKautionRound(amount), source: 'rule', rule: ruleTxt };
}
