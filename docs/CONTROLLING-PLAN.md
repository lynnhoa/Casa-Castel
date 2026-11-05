# Controlling · improvement map (audit 05.11.2026, build later)

Data in the database is correct; this is about calculation and display only. Effort S = under 1 h, M = 1–3 h (agent).
Colours everywhere: green = money to you (Nachzahlung, rent in), red = money from you (Guthaben, costs out). Use the same
tokens as Settlements (PR lynnhoa/Casa-Castel#15):

| Token | Value |
|---|---|
| green text | `#16801F` |
| green strong | `#11691A` |
| green background | `#DDEFD3` |
| red text | `#C42B14` |
| red strong | `#A3230E` |
| red background | `#F9DCD3` |

Amounts are bold (Cormorant 600/700).

## A · Decided: build

| # | What | Where | How | Effort |
|---|---|---|---|---|
| 1 | Abrechnung booked twice on double tap | controlling-abr.js:198-208 (async handler, no guard), :109 `usedRefs` hides the 2nd row | in-flight set per result key + disable button; SQL unique index on `ctrl_expense_one_time(source_ref)` for kinds NK-/Hausgeldabrechnung (check for existing duplicates first); show a duplicate as "booked twice · delete one" | S |
| 2 | Sold (inactive) property vanishes from past years and the export | controlling-tab-dashboard.js:322, :374, :462 · controlling-report.js:61, :79 filter `p.active` | a property counts in a period if active OR it has bookings/income in that period (or purchase ≤ period ≤ sale date if a sale date exists) | M |
| 3 | Casa Kreditrate uses today's rate for every month | controlling-soll.js:1157-1158, :1173-1175 (`pl.loan.rate`) | same as apartments (:1012): `L = ctlLoanTerms(pl.loan, y, m)`, `ctlLoanMonth(L, y, m)`, incl. Zinsen/Tilgung split | S |
| 4 | "Book all open as planned" works for future months | controlling-tab-income.js:157-169 · controlling-tab-expenses.js:132-142 | hide/disable for months after the current one ("not due yet"); single rows stay editable | S |
| 6 | New non-Casa property never gets its apartment unit (rent missing everywhere) | controlling-tab-setup.js:166-168 (only parking), controlling-soll.js:1525ff `ctlCreateUnit` | "+ Apartment" in Setup creates the `rentals_apartment` unit for the linked apartment; `ctlSetupLinkState` flags "linked, but no living unit" | S–M |
| 20/21 | Contrast | controlling-ui.js:285 (income in gold `#B8956A`), `.cx-r__u` 11 px `#9A8E7E` (3.1:1), sub lines 10 px | the green/red tokens above for every in/out amount, Abrechnung Guthaben/Nachzahlung, month sums ("+ 100 €" green, costs "− 80 €" red); row label 13 px `#5F5649`, sub 12 px `#6E6357`; the room name stays the label (owner: room is right) | S |
| 27 | One-off list | controlling-tab-onetime.js:534 (search), :419-451 (Kaufnebenkosten-only card) | the summary follows the search ("matching · n · €") and search matches amounts; a card with only Kaufnebenkosten shows its KNK total instead of "0 €" with no empty "By month"; drop the duplicate "Kaufnebenkosten" pill so the description is not cut at 390 px | S |
| 28 | Small display fixes | history: controlling-tab-history.js:51-53 · Grundsteuer chips: controlling-tab-setup.js:42-45 · pv-ctrl.js:122 · Dashboard:373 | history: "balanced for 1 month entered · 9 months not entered (5.400 €)" in amber · chips: Jan Feb Mar … in a 6×2 grid · toast in English ("Paid ✓ did not reach Providers – try again") via `ctlToast` · January compares with December: load the previous December once (cached) | S |
| 30 | Purchase month | controlling-soll.js:233-236 `ctlPropOwned`, :1007 · `_cxUnitSollV2`, `ctlCostRows` | per property in Setup: "First month: [Full month · From handover day]" (default Full = as today); "From handover" prorates rent, Hausgeld and Kreditrate from `kaufdatum` | M |
| 31 | Return to the app reloads about 28 tables (mobile data, flicker) | controlling-soll.js:174-187 (`visibilitychange`, every ≥ 20 s, `select *` with paging) | reload only what changes from outside (tenant_records, rent_periods, rooms, current-year income/one-offs, loans); the rest on a full reload or every 10 min; same result | M |
| 32 | Recalculation on every tap | controlling-tab-dashboard.js:95-122, :461-466, :375 · controlling-data.js:63-117 · controlling-tab-history.js:117-122 | index rows by property × month once per data version; year/chart = sum of cached months; history balance cached per tenancy, invalidated per unit; same output | M |
| 34 | Dead code (~150 lines) | controlling-tab-setup.js:367-509 (`_cxSuProvCatHTML`, `_cxSuContractCatHTML`, `_cxPerHTML`, `_cxMoneyF`, `_cxInContracts`, `_cxPerCorrectNow`) · onetime new-entry/KNK form paths, `_cxOtDefaultDate` | remove | S |

## B · Waiting for the owner's answer (explained in chat)

| # | Item |
|---|---|
| 13 | Rename the export "Income" column (it holds running cashflow) |
| 14 | Pauschal shown as Kalt 0 / NK 0 / Pauschal 650 in Income vs Kalt 550 / NK 100 on the Dashboard |
| 15 | Setup: keep it as "links and checks" only; Hausgeld and rate shown read-only with today's values from Rentals / Properties |
| 16 | One-off gross vs net: show "paid · back · net" on the screen and in the export |
| 17 | 1-cent / 1-€ rounding · "2 partial months" label |
| 18 | Income cards close by themselves while typing |
| 23 | Per-property line "6/8 let · 2.300 of 2.500 € received" |
| 24 | Chart: amounts, zero line, legend for negative months |
| 29 | Strom row for apartments |
| 33 | Unused open-items loop in Year view, `ctlAbrResults` rebuilt about 78× per render (speed only) |
| 10 | Not answered yet: an overpayment hides open rows on the card header |
| 11 | Not answered yet: the Year chart uses cashflow incl. one-offs, the Month view without them |

## C · Decided: no change

| # | Decision |
|---|---|
| 5 | Grundsteuer chip jump |
| 7 | Grundsteuer is quarterly (correct as is) |
| 8 | Kalt view stays as it is |
| 9 | "ALL DONE" stays (Ist ≠ Soll is normal) |
| 12 | Month view stays without one-offs |
| 19 | No open-rent reminders |
| 22 | No Zinsen/Tilgung on the Dashboard |
| 25 | No payment date |
| 26 | Soll tap may overwrite |

NK repayment: in Warm (the main cashflow) a tenant's NK result is already counted, in the month it is booked:
- Settlements "paid/received" books an NK-Abrechnung line, so the money counts in Warm.
- A skipped NK ("nicht durchgeführt") books nothing, which is correct because no money moved.

Only the Kalt view does not add it back, and the owner keeps Kalt as it is.
