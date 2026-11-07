# Properties · logic and calculation bug map (audit 07.11.2026, fixed)

Scope: properties.html + properties-dashboard.js · properties-portfolio.js · properties-knk.js · properties-sheet.js,
and what they write for Controlling (loan_terms_history, Kaufnebenkosten bookings, "Fixed rate until").
Only behaviour that is meant to work; nothing that is "not built yet".
Every bug was reproduced first in a headless browser (properties.html with an in-memory database) and checked
again after the fix, together with 16 regression runs of the flows around it (first loan, rate change, yearly update,
Edit, Kauf list paid / unpaid, Controlling bookings from before, delete), and 5 more for the owner's answers (the real
10-property portfolio with the shared loan, Bausparvertrag before and after the savings are transferred).

## Fixed

| # | What was wrong | Example | Where | Fix |
|---|---|---|---|---|
| 1 | **Delete property: wrong question, Cancel did nothing.** After any other question in the pop-up ("Discard the changes?", "Remove the payment?") the delete box kept that title and button, and Cancel had no handler any more — only Delete or a reload got you out. | Edit → Cancel (Discard) → Edit → Delete property → box says "Discard the changes?" · "Discard"; Cancel stays open | properties-portfolio.js `confirmDelete` | asked with the pop-up's own question (`propConfirm`): "Delete property?" · Delete · Cancel always works |
| 2 | **Deleted with typed changes → "Discard the changes?" for a property that no longer exists**; the pop-up stayed open on it | Edit, type, Delete property | properties-portfolio.js `doDelete` | the property is gone → nothing left to keep, the pop-up closes |
| 3 | **Negative Zinsen.** Zinsen = Monatsrate − Tilgung; the check "Tilgung > Monatsrate" only ran when a Monatsrate was typed | Add loan: Darlehen 100.000, Tilgung 300, no Monatsrate → Zinsen −300 €; Edit: Monatsrate cleared → Zinsen −581,25 € (Controlling: a negative "Zinsen" Soll for a Bausparvertrag) | properties-sheet.js `psSaveLoan`, `saveEdit`, live line in `psCalc` | an empty Monatsrate counts as 0: "The Tilgung can't be more than the Monatsrate". Checked when Monatsrate or Tilgung is typed, so an old record does not block e.g. a new bank name |
| 4 | **Edit: Restschuld kept a Darlehen you changed back.** It follows the Darlehen while untouched, but did not go back | Darlehen 140.000 → 150.000 → 140.000, Save → Restschuld 150.000 on a Darlehen of 140.000 | properties-sheet.js `psCalc` | `psFollow`: source back to its value → the field goes back too. A Restschuld typed by hand (also typed back to its old value) is never overwritten |
| 5 | **Rate change "valid from" an earlier month than a change saved before: Controlling kept the old rate.** Controlling takes the newest history row up to each month, so the later row still won | change rate 900 € from 01.11., then correct to 950 € from 01.10. → Properties shows 950 €, Controlling Nov+ 900 € | properties-portfolio.js `_propSaveLoanHistory` | the terms are valid from that month ON: later rows of that property are removed (only when there are any, so the usual change is unchanged) |
| 6 | **Grunderwerbsteuer / Makler did not follow a changed Kaufpreis.** "% of the price" was worked out once | Kaufpreis 180.000 → 200.000: row says "6,00 % of 200.000,00 €" but 10.800 € (12.000 € right); Acquisition costs and the dashboard too low. A price typed later never gave them an amount | properties-knk.js `knkPriceChanged`, called by `saveEdit` | rows still waiting for the invoice (not paid, no invoice) follow the new price; the list sum = Acquisition costs follows. An amount typed by hand stays |
| 7 | **Market value stayed 0 when the price was typed later.** "Market value = the price at the start" only worked in the New form | New property without a price → Edit: Kaufpreis 250.000 → market value 0 → Equity and "Market value today" too low | properties-sheet.js `psCalc` / `saveEdit` | while untouched (0 or = the old price) the market value follows the Kaufpreis in Edit, visible before Save; a value of its own is never changed |
| 8 | **Double tap on the Kauf card → everything twice.** No guard while saving | "Start checklist" ×2 → 12 rows, Acquisition costs 21.600 instead of 10.800 €. "Paid" ×2 → two bookings in Controlling › One-off, Kauf list total doubled | properties-knk.js click handler | one Kauf change at a time; a second tap while it saves is ignored |
| 9 | **Half-saved automatic booking.** A paid cost whose property was set up in Controlling later is booked on the next start; when the row could not be linked to the booking, the booking stayed | list total counted twice (row + "typed in Controlling"), and every next start booked it again | properties-knk.js `knkAutoBook` | as "Paid" already did: the booking is removed again when the row can't be linked |
| 10 | **Dashboard counted every property as a loan** | the portfolio: 10 properties, 9 loans — WHG 08 and WHG 10 share one loan, entered on one of the two → "10 loans combined", "repaid across 10 loans" | properties-dashboard.js | counts the loans: properties with a Darlehen or Monatsrate → "9 loans". A shared loan entered once counts once, in the totals too |
| 11 | **"Purchase period 2020–2026" was fixed text** | wrong as soon as a purchase is before 2020 or after 2026 | properties-dashboard.js | from the purchase dates: "Purchase period 2020–2024" · one year: "Purchased 2024" · none: left out |
| 12 | **One loan without an interest rate blanked Dashboard and Portfolio** (`null.toFixed`) | the whole page empty; after a save the toast said "Not saved" although it was saved | properties-dashboard.js alerts, properties-portfolio.js rows | no rate → 0,00 % |
| 13 | **Controlling's Zinsbindung reminder read only the year** of "Fixed rate until", but Properties saves the full date | 15.02.2027: no reminder in Nov 2026 (Properties already amber); "ends 2027 – enter the new rate" from Jun 2027, months after the end; "ended" only from 2028 | controlling-soll.js `ctlZinsbindungNote` | the date's month (6 months before it: "ends 15.02.2027", after it "ended …"); "06/2030" its month; a year alone ("bis 2030") December as before |
| 14 | **Bausparvertrag: the savings counted as "Paid off"** (owner, 07.11.2026: a Bausparvertrag loan is not paid off until the Sparbetrag is transferred to pay it) | Darlehen 140.000, Restschuld 140.000, 25.000 € saved → "17,86 % paid off", Dashboard "Paid off" 25.000 € too high, and Restschuld + Paid off > Darlehen | `paidOff()` in properties.html · properties-dashboard.js · properties-sheet.js | Paid off = Darlehen − Restschuld for every loan. The typed "Paid off (Bausparvertrag)" fields are gone; the savings count once the bank's Restschuld drops (Yearly update with its date). Older entries: worked out at once — the savings typed before are no longer shown and are replaced on the next save |

Cache versions bumped: properties-*.js `?v=2026-11-07-PB1` / `PB2` (properties.html), controlling-soll.js
`?v=2026-11-07-PB1` (controlling.html, settlements.html). No SQL needed.

## Checked, correct (no change)

- Dashboard totals, Tilgung/Zinsen split and bar, paid-off %, weighted interest rate (by Darlehen, as labelled), equity
  (market value − Restschuld), best repayment ratio, highest interest.
- Rate status from "Fixed rate until" (within 3 months or passed red, within 6 months amber), also updated on every start;
  free text that is no date keeps the status set by hand.
- First loan: Restschuld = Darlehen, Paid off = Darlehen − Restschuld, Eigenkapital = price + Kaufnebenkosten − Darlehen
  (only while empty), first rate default = the month after the Übergabe, history from that month (earlier months 0).
- Yearly update: Paid off = Darlehen − Restschuld (Bausparvertrag too, #14), equity line, "Stand" date for Controlling's
  Zinsen estimate.
- Kauf list: status (Expected → Invoice → Paid / Not needed), sums, open amount, pill, booking direction (cost −1,
  refund +1, as Controlling reads it), Controlling bookings from before shown once and turned into a row on change,
  unpay deletes the booking, Grunderwerbsteuer 6 % Hessen incl. Kastel / Kostheim / Amöneburg, 5 % Rheinland-Pfalz.
- Purchase date (= Übergabe) as read by Controlling and Settlements (ISO and TT.MM.JJJJ).

## Owner decisions (07.11.2026)

- **Bausparvertrag:** not paid off until the Sparbetrag is transferred to pay the loan → built as #14.
- **Zinssatz stays at 2 decimals** (as in the forms and everywhere it is shown).
- **Restschuld:** entered once a year with its date (Yearly update · Stand) → no change.
- **Shared loan WHG 08 + WHG 10:** entered on one of the two properties → counted once (#10).
