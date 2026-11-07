# Controlling · calculation bug map (audit 07.11.2026, fixed)

**Scope:** controlling.html and its scripts, plus the two places in Settlements and Providers that feed it.

**Left out:**
- anything the owner decided in [CONTROLLING-PLAN.md](CONTROLLING-PLAN.md) (sections B and C);
- the planned packages 3–5;
- anything "not built yet".

**How it was checked:**
- Every bug was reproduced first by running the app's own code in Node with test data and "today" fixed at 07.11.2026.
- Each was checked again after its fix.
- The year export was re-checked: all 322 Excel formulas match their values, the totals agree across sheets, the double-rent case and the date cells are unchanged.

## Fixed

| # | What was wrong | Example | Where | Fix |
|---|---|---|---|---|
| 1 | **A flat rent (Pauschal) lost its NK part when confirmed in the tenant history.** "Confirm as rent from move-in" and "Add rent from a date" saved the Pauschale without "davon NK", including for the months carried over from the tenant. The Casa Castel and Rentals tenant tabs keep it. | Casa tenant, Pauschal 650 € with 130 € NK inside: Soll 520 + 130 → after confirming 650 Kalt + 0 NK, NK covered by the tenant 1.560 € a year → 0 € (Settlements counted it as your cost), new bookings saved as all Kalt | controlling-tab-history.js | Confirm keeps the NK part, so the Soll does not change. "Add rent from a date" carries the old rent over with its NK part first, and the form's NK field is the "davon NK" for a Pauschale (no more than the Pauschale). Entries saved before: optional [CONTROLLING-PAUSCHAL-NK.sql](../CONTROLLING-PAUSCHAL-NK.sql) (preview first) |
| 2 | **Tenant history: months before the purchase counted as "not entered".** | bought 01.07.2025, tenant there since 2019 (600 €), every month since July 2025 entered → "18 months not entered (10.800,00 €)" + "to check" | controlling-soll.js `ctlTenancyBalance` | from the purchase month on, as in Income, Expenses and the Dashboard. A Casa Castel room with no booking at all (no unit row yet) now shows its missing months too (Berlin since 01.03.2026: 8 months, 4.320 €; was "0") |
| 3 | **Loan: after a new interest rate, the months before used it for the Zinsen / Tilgung split.** The loan history keeps Rate / Zinsen / Tilgung, but Properties holds only the newest Zinssatz. | 1,25 % until June, 3,5 % from July → January–June "≈ Zinsen 524 €" instead of 187,50 €; booking such a month saved that split (year export Zinsen / Tilgung) | controlling-soll.js `ctlLoanTerms`, `ctlLoanMonth` | Months under older terms use the split saved with those terms. Today's Zinssatz is used only for the newest terms. A new rate entered in advance (e.g. from 01.01.2027) no longer changes the months before it |
| 4 | **Tenant-change month: one tenant's payment was split into Kalt / NK by the whole room's ratio.** | Ana (500 + 100 NK) until 15.09, Ben (Pauschal 700) from 16.09; Ana pays her 300 → saved as 276,92 + 23,08 (Dashboard Kalt +26,92 €) | controlling-tab-income.js `_cxIncSavePart` | each tenant's payment in the ratio of their own Soll → 250 + 50 |
| 5 | **A one-off dated before the purchase month counted nowhere.** It was listed in One-off and in the export, but the Dashboard and cashflow start at the purchase month. | bought 15.03.2026, Gutachten 500 € on 20.02.2026 → One-off −700 €, Dashboard one-offs 200 € | controlling-tab-onetime.js | Owner's choice still open, so for now it is flagged and the totals are unchanged. The line says "Before the purchase (15.03.2026) – not in the cashflow · a purchase cost belongs in Properties › Kaufnebenkosten, otherwise check the date" |
| 6 | **Year export › Expense Castel: "Kosten" was not the Soll at the Stand.** Kreditrate = today's raw loan rate; Putzdienst / Winterdienst = the Setup amount | 2025 export: 1.520 € next to twelve months of 1.450 €; a split Bausparvertrag: 0 € next to 1.010,50 € | controlling-report.js | Uses the cost type's row of that month (Kreditrate from the loan terms valid then, the Providers price), otherwise its price valid then |
| 7 | **A paid Abrechnung that changed direction afterwards (Nachzahlung ↔ Guthaben).** The booking kept its old direction. It counted as the payment of the new result, showed on both sides, and was turned around wrongly when settled again. | +120 € received in March, corrected to a Guthaben of 80 € → Income "+120 without Abrechnung" and Expenses "paid 120 against 80"; settled again → still "+80 received" | controlling-abr.js · settlements-tab-casa.js · settlements-tab-rentals.js | A booking only pays a result of its own direction. The new result is open, with "booked before as Nachzahlung 120,00 € – settle it again in Settlements"; the booking stays where its money went, with "the Abrechnung is now a Guthaben of 80,00 €". Settling again (in Settlements or Controlling) turns the booking around: −80, new label |
| 8 | **A contract that ends after its minimum term ran one month too long.** "Start + 12 months" was taken as the end. | from 01.01.2026, 12 months, then ends → end 01.01.2027 → Soll also in January 2027; Providers' "cancel by" one day late | controlling-soll.js `ctlContractEnd` · pv-utilities.js `_ctrTerm` | ends the day before: 31.12.2026 (same in Providers) |
| 9 | **Loan estimate one month ahead** with a Restschuld dated on a month's last day. The bank's "per 31.12." is the balance January's Zinsen are charged on. | Restschuld 180.000 per 31.12.2025, 1,25 % → January 186,86 € instead of 187,50 € | controlling-soll.js `ctlLoanMonth` | a date on the last day of a month counts from the next month. Other dates are as before |
| 10 | **Dashboard open count in a tenant-change month:** the room counted as done once anybody's amount was in | September: Ana entered, Ben open → Dashboard "done", Income "1 open" | controlling-tab-dashboard.js `_cxOpenOf` | one line per tenant, as Income counts them |
| 11 | **Invoice export: "Rechnungen" counted refund / income lines** | 10 invoices + 2 refunds → "12 Rechnungen" (One-off: 10) | controlling-export.js | invoices only, in the overview, the page titles and the "exported" message. The lines and the Summe are unchanged |

## Not changed

**Already planned (#31 in CONTROLLING-PLAN.md):** when you come back to Controlling with it still open, this year's bookings are not reloaded. A payment booked in Settlements on another device or tab then shows in Income but not on the Dashboard until a reload.

**Cache versions bumped to `?v=2026-11-07-CB1`:**
- **controlling.html:** controlling-soll / abr / tab-dashboard / tab-income / tab-onetime / export / report / tab-history.js
- **settlements.html:** controlling-soll / abr.js, settlements-tab-casa / rentals.js
- **providers.html:** pv-utilities.js
