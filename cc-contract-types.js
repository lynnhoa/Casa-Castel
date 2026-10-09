/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — CONTRACT TYPES (Oct 2026)
   cc-contract-types.js   (landlord.html, controlling.html — load early)

   Three contract types, stored as text on the tenancy / rent history:
     'kurzzeit'    Kurzzeitmietvertrag  · stay under 6 months · Kurzzeit baseline
     'jahres'      Jahresvertrag        · ends on the next 31.08. · renewed yearly
                                          · Mietvertrag baseline
     'mietvertrag' Mietvertrag          · open-ended (or befristet with a legal
                                          reason) · Mietvertrag baseline
   Existing data is never changed: tenancies stored as 'kurzzeit' stay
   'kurzzeit' until a renewal (Jahresvertrag) or a manual type change.
   ───────────────────────────────────────────────────────────── */

const CC_CT_TYPES = ['kurzzeit', 'jahres', 'mietvertrag'];
const CC_CT_LABEL = { kurzzeit: 'Kurzzeit', jahres: 'Jahresvertrag', mietvertrag: 'Mietvertrag' };

/* Has a fixed end date that is set in the contract (Kurzzeit + Jahresvertrag) */
function ccCtFixed(t) { return t === 'kurzzeit' || t === 'jahres'; }
/* Can be renewed from the tenant card (Kurzzeit staying on → Jahresvertrag) */
function ccCtRenewable(t) { return t === 'kurzzeit' || t === 'jahres'; }
/* Which room baseline / Kaution rule a type uses: 'kurzzeit' | 'mietvertrag' */
function ccCtBase(t) { return t === 'kurzzeit' ? 'kurzzeit' : 'mietvertrag'; }
function ccCtLabel(t) { return CC_CT_LABEL[t] || ''; }
/* PDF title */
function ccCtPdfTitle(t) { return t === 'kurzzeit' ? 'Kurzzeitmietvertrag' : 'Mietvertrag'; }

/* The next 31.08. on or after a date (ISO in, ISO out) */
function ccNext3108(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const y = Number(s.slice(0, 4));
  const cand = y + '-08-31';
  return s <= cand ? cand : (y + 1) + '-08-31';
}
