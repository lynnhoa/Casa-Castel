# D40 · Who pays for all properties — plan (Option B chosen, start after the weekly limit reset Mon 09.11.2026 17:00)

Option B (first version, ~15 h): all WEG flats + Gewerbe; NK / Kleinreparatur / Schaden; via NK or Direct; Rentals letter Seite 2 (Teil B); Controlling read-only. Later: parking chips (Studio One), per-tenant Kleinreparatur terms UI, Casa onto shared loader, 8 % cap incl. Direct for Casa.

Owner decisions still open (recommended defaults): 1 no Kleinreparatur on WEG Gemeinschaftseigentum · 2 old contracts: assume 150 €/8 % · 3 former tenant within 6 months · 4 8 % cap counts Direct (Rentals) · 5 migrate non-Casa Controlling NK switches into Who pays › NK.

Note: D39 is closed and merged (lynnhoa/Casa-Castel#13, #14); the critic's 'D39 not closed' point is outdated.

# "Who pays?" for every property · implementation map (D40)

Repo /home/user/Casa-Castel (static vanilla JS + Supabase, no build step), HEAD 8571afb incl. D39.
Sources: allprops/props.md (MAP 1), rentals-nk.md (MAP 2), contracts.md (MAP 3), casa-specific.md (MAP 4), wf1/PLAN.md (D39).
UI English, Fachbegriffe German, tenant letters German. Version tag `…-D40`, SQL file `MAINTENANCE-D40.sql`.

Facts I checked in the code myself (not taken from the maps alone):
- `mtWhoOn = c => MT.d39 && mtIsCasa(c.property_id)` (maintenance.js:3358); `MT_WHO_MAX = 150` (:3356); `mtWhoLoad` reads only
  `ctrl_castel_categories`, `tenant_records(room,…)`, `nk_abrechnung_casa` (:3361-3372); `mtWhoWins` matches by room name (:3420).
- MAINTENANCE-D39.sql: `casa := c.property_id = 7` (:120); `maint_pay` only `if casa and r.return_of is null` (:191);
  non-Casa NK comes from `nk_keep` (:213-216); on conflict non-Casa keeps Controlling's switch (:232-235); refund line only `if casa` (:241).
- `_srCalc` returns `saldo: cxR(sum - vz)` with no Teil B (settlements-tab-rentals.js:312); `_srSend` sends `|x.saldo|` (:811);
  `_srAutoNkItems` always `kind: 'sonst'` (:1018); `_srNkAutoSync` stops once a tenant letter is sent (:1031) and does not update `kind` (:1036-1040).
- `_srLetterBlob` (:704-727) numbers pages but has no `[data-pgref]` fix-up; `nkLetterPdf` has it (nk-letter.js:306).
- `nk_abrechnung_rentals` has no lock and no snapshot; unique per (property_id, period_from) (SETTLEMENTS-RENTALS.sql:4-13).
- `_cxOtNkFixed` is true only for refund lines or property 7 (controlling-tab-onetime.js:94); `_cxOtNkYear` reads the Casa period (:101-106).
- `ctlUnitLink` auto-links a non-Casa unit only when the property has exactly one living unit (controlling-soll.js:264-266);
  `_cxTenancies` is the shared tenancy rule (:530-556). Maintenance does not load controlling-soll.js.
- `scLoadTeilB` already queries every property and then keeps `property_id === CASA_PROP_ID` (settlements-tab-casa.js:120-129).

## 1 · Owner view (the same lean sheet)

The sheet stays `#mtWhoModal`: title "Who pays?", sub "<What> · <NET €>", Type `[NK | Kleinreparatur | Schaden]`, an optional
middle row, Payment `[With NK-Abrechnung | Direct]` (+ "Paid on"), result box, footer Reset · Cancel · Save. No new rows, no
text input. Only the middle row and the words change with the property. The row tag and the receipt pop-up row work as in D39.

| Property type (example) | Type buttons | Middle row | Payment | Result box / where it shows up |
|---|---|---|---|---|
| **Casa Castel** (Zimmer) | as D39 | Where `[Gemeinschaftsfläche \| Zimmer]` + room chips | as D39 | unchanged: Settlements › Casa Castel, Teil A / Seite 2 "Casa Castel · Zimmer X", § 7 |
| **WEG Wohnung, one unit** (Kaiser-W-R 17, Kaiserstr. WHG 507/516, Campo Novo, Wallaustr. 44, Adam-K-S. WHG 08/10, Kostheim) | NK · Kleinreparatur · Schaden | **No Where.** One quiet line: "Tenant on 12.03.2026 · Müller". If nobody lives there on that day: "Wohnung vacant on 12.03.2026". For Schaden only, the last tenant who moved out within 6 months appears as one chip "Müller · moved out 31.08." | With NK-Abrechnung (disabled with a hint when the tenant is Pauschal on that day, has no NK, or that NK letter is already sent) · Direct | NK → "38,90 € to NK · Wartung / NK 2026 · Teil A" → Settlements › Rentals, NK-only position of that property (page 1). Klein → "95,00 € · Müller / NK 2026 · Teil B1 Kleinreparaturen · § 8" → Settlements › Rentals › tenant, letter **Seite 2**. Schaden → "… · Teil B2 Schäden". Direct → "from Müller · paid / Controlling deducts 95,00 € · not in Teil B" |
| **Gewerbefläche** (`zimmer_type 'Gewerbefläche'`) | same | same | same | same, limit **200 €** ("Kleinrep. >200 €"), letter "Kleinreparaturen · Mietvertrag · bis 200 € je Fall" (no § number: it is § 6 or § 7 per contract) |
| **Wohnung + parking** (Studio One: Wohnung, TG 1–3, SP 1–2) | same | Unit chips `[Wohnung · TG 1 · TG 2 · TG 3 · SP 1 · SP 2]` only for Klein/Schaden, Wohnung preselected; tenant line under them | parking unit → Direct only ("parking · no NK-Abrechnung") | parking: Kleinreparatur disabled (no clause); Schaden Direct → refund line in Controlling only |
| **Several Wohnungen in one property** (none today) | same | Unit chips; Klein single-select; Schaden "Caused by · several possible" multi-select | as above | Teil B per Wohnung (equal cent split over the picked units, as Casa); no Kleinreparatur on Gemeinschaftsfläche |
| **Property without a tenant link** (no `rentals_apartment_ref`, no linked unit) | NK only; Klein/Schaden disabled "No tenant link · set the unit in Controlling › Setup" | — | — | NK goes into nothing until linked (Rentals lists the property as "unlinked"); hint "no NK settlement for this property yet" |

**(critic) Scope cut:** drop the "Several Wohnungen in one property" row from D40 (none exist today). Keep the data contract
(`pay_rooms` array) so it can come later. The Studio One parking chips stay, but as a two-state row only: `[Wohnung | Parking]`
+ the unit, Schaden Direct only.
**(critic) WEG hint:** "Kaiser-W-R 17 · Balkon" is the typical trap: a Balkon is often Gemeinschaftseigentum and is paid or
refunded by the WEG through the Hausgeld. With no Where row, nothing stops a Kleinreparatur on it. Add one quiet line in the
Klein result box for WEG flats: "Only inside the Wohnung (Sondereigentum) · WEG repairs are not a Kleinreparatur".
Common to all: Kleinreparatur disabled when NET > the limit; hidden for parking and for a tenant whose terms say "no clause".
Old contract (no `rent_periods.source` 'generator'/'renew'): amber line "Old contract · 150 € / 8 % assumed". Before the purchase
date: "Before purchase · not billed". Locked: "Billed in NK 2026 · letter sent" (Rentals) / "· locked in Settlements" (Casa).
Tag texts: `NK · Wartung` (nothing chosen → `NK · Sonstige Betriebskosten`), `Kleinrep. · Wohnung`, `Kleinrep. · TG 1`,
`Schaden · Müller` (the tenant's last name, not the unit, for single-unit properties), Direct ` · paid` / ` · open`, `Kleinrep. >200 €`.

## 2 · Data model

### 2a. Reused unchanged (D39 contract)
`pay_type` nk|klein|schaden · `pay_cat` (Casa cost type id, Casa only) · `pay_where` gemein|zimmer · `pay_rooms` text[] ·
`pay_via` nk|direct · `pay_paid_on` · `ctrl_expense_one_time.maint_refund_of` / `maint_pay` · NET = receipt − returns.
New meaning for non-Casa: `pay_rooms` = the **unit name(s)** of the property (the `ctrl_units.name` of the living unit; with no
unit row, the apartment name). Single unit → `pay_where 'zimmer'`, `pay_rooms [that unit]`. `pay_where 'gemein'` outside Casa
only for Schaden with several causing units (same as Casa's "caused by").

### 2b. New columns (MAINTENANCE-D40.sql § 1, all nullable, safe to run twice)
| table.column | type | meaning |
|---|---|---|
| maint_costs.pay_kind | text | Rentals NK cost type = an `SR_KINDS` key (`sonst` when nothing chosen). Casa keeps `pay_cat` |
| maint_costs.pay_tenant | text | Rentals klein/schaden: the tenancy that pays (`rnt_tenant_records.id`). Written by Maintenance on Save (the tenant on cost_date, or the former tenant picked). Recomputed on receipt Save when the date or unit changes (like D39's klein+gemein rooms) |
| maint_costs.pay_max | numeric | the Kleinreparatur limit that applied when saved (150 / 200 / tenant value) → snapshot "m" for Controlling |
| ctrl_expense_one_time.nk_kind | text | the cost type carried into Rentals (`pay_kind`); its presence is also the "D40 has run" probe |
| rnt_tenant_records.kr_max, kr_cap_pct, kr_cap_eur | numeric | per-tenant Kleinreparatur terms for old contracts; null = template; `kr_max = 0` = no clause |
| tenant_records.kr_max, kr_cap_pct, kr_cap_eur | numeric | same for Casa (D39 behaviour unchanged while null) |

**(critic) pay_tenant semantics:** "recomputed on Save when the date changes" overwrites a former tenant the owner picked on
purpose. Store it in only two cases: the owner picked a former tenant, or the tenant on the day as Maintenance saw it. Keep a
flag `"pick"` in the snapshot (or `pay_tenant_pick boolean`) and recompute only when it is not a pick. Settlements bills by
bill day against its own items. It uses `pay_tenant` only to move the bill day to a picked tenant's last day, and it warns
when its item tenant on the day ≠ `pay_tenant`. The id type of `rnt_tenant_records.id` is not in the repo SQL, so compare as
text (`::text`) in the SQL join.
**(critic) Cap base:** `rnt_tenant_records.kaltmiete` is the old tenant-form value. Since the rent engine, the real Kaltmiete is
in `rent_periods` + Staffel (`_cxRentDay(...).k`, controlling-soll.js:626). In Settlements use `_cxRentDay` k on the bill day × 12
(the fields are already there); fall back to `kaltmiete × 12`. Freeze the value in the Teil B snapshot.
**(critic) Cap must count Direct too:** § 8 / § 7 cap the yearly total of Kleinreparaturen. `scTeilB` (settlements-tab-casa.js:381-387)
only counts via-NK rows, so a tenant can pay 4 × 150 € Direct plus more in Teil B. In D40, `wpCap` subtracts that tenant's Direct
Kleinreparaturen in the same period first, and the sheet hints "8 % cap reached" when they hit the cap. For Casa this changes D39
numbers, so it is an owner decision (§ 6 no. 13). Default: Rentals yes, Casa unchanged until confirmed.
`maint_pay` snapshot gains `"k"` (pay_kind), `"m"` (pay_max), `"u"` (payer display: rooms for Casa, tenant name for Rentals).
Template terms (in the shared module, used when the tenant columns are null):

| Unit | per case | cap | cap base | letter § |
|---|---|---|---|---|
| Casa Zimmer | 150 € | 8 % | Kaltmiete × 12 (D39) | § 7 |
| Wohnung Kalt + NK | 150 € | 8 % | Jahresnettokaltmiete (kaltmiete × 12) | § 8 |
| Wohnung Pauschal | 150 € | 8 % | Jahrespauschalmiete (Direct only anyway) | § 8 |
| Gewerbe | 200 € | 8 % | Jahresnettokaltmiete | none ("Mietvertrag") |
| Parking | none | — | — | — |

### 2c. MAINTENANCE-D40.sql (header and numbered sections like D39; ends with `notify pgrst, 'reload schema';` and checks)
0. **(critic) Prerequisite:** D39 is not closed. HEAD 8571afb is "D39 final gate: fixes in progress" plus an open "NK per-line
   rounding (F3) and 1000-row loading" checkpoint, and nothing shows that MAINTENANCE-D39.sql has run in production.
   D40 starts only after the D39 gate is green and merged. D40.sql must be a superset of D39 (every D39 column, index and
   function with `if not exists` / `create or replace`), so it is correct whether or not D39 ran.
1. **Columns** above + check `pay_kind` is null unless pay_type = 'nk'. **(critic) No CHECK constraint here:** a cached D39
   client (service worker) that changes nk → klein does not know `pay_kind` and would get a save error. Instead the booking
   ignores `pay_kind` unless pay_type = 'nk', and Maintenance clears it on Save.
2. **Pre-checks (select only, expected results in comments):** non-Casa lines with `nk_umlage = true` per property; receipt/return
   pairs whose switches differ (expected 0 or a handful); non-Casa receipts still carrying Casa room names in pay_rooms.
3. **Migration (before the rebook):**
   - Non-Casa receipts whose Controlling line has `nk_umlage` and `pay_type is null` → `pay_type 'nk'`, `pay_kind` = the `kind` of the
     stored Rentals position with `auto = 'ot:' || o.id` (from `nk_abrechnung_rentals.positions`), else `'sonst'`.
   - Unbooked receipts with `nk_keep->>'p' = property_id and (nk_keep->>'u')::boolean` → same, then `nk_keep = null`.
   - Receipts that moved away from Casa: klein/schaden with Casa room names → pay_* cleared (listed by the pre-check first); nk → keep, `pay_cat = null`.
   - Receipt/return conflict: the receipt wins (the return now follows it).
   - **(critic) Correction to "moved away from Casa · nk → keep":** for non-Casa lines D39 already set `nk_umlage` from the
     Controlling switch and cleared it on a move (D39.sql:232-235). Keeping `pay_type 'nk'` would turn the NK ON in that
     property's open NK. Rule for every non-Casa receipt: `pay_type 'nk'` ⇔ its line has `nk_umlage` today; klein/schaden
     with Casa room names → cleared; `pay_cat` always null.
   - **(critic)** Returns can carry `nk_keep` too (the "not ok" save runs for `r`, which may be a return). Clear the non-Casa
     return `nk_keep` without migrating it, because returns follow their receipt.
   - **(critic) Effect on open settlements, listed by a pre-check:** the return rule adds a negative auto-item `ot:<return id>`
     to every unsent Rentals record whose receipt is NK and whose return was off (MAP 2 § 3: "the NK takes the gross amount").
     That is a fix, but it changes open numbers. The pre-check lists property, period, amount and whether any letter is sent
     (sent → nothing changes, `_srNkAutoSync` skips it). Same list for receipts whose Controlling switch is on although the
     receipt is unbooked (they come back via nk_keep).
   - `pay_kind` from `positions`: in practice always 'sonst' (auto-items are written with 'sonst', :1018, and a kind is
     only changed when someone edited the position). Needs `jsonb_array_elements(positions)`; if several records hold the
     same `auto`, take the newest `period_from`.
4. **`maint_book_line` generalised:**
   - `fam_casa := c.property_id = 7` only picks `pay_cat` vs `pay_kind`; every other `casa` branch applies to all properties.
   - NK switch for receipts **and returns** of every property: `nk_umlage = (h.pay_type = 'nk')`, `nk_category_id = pay_cat`
     (Casa) else null, `nk_kind = coalesce(h.pay_kind,'sonst')` (non-Casa nk) else null. On conflict always `excluded.*`
     (Maintenance owns the NK everywhere).
   - Drop the bug-27 `nk_keep` save for non-Casa (:125-135); keep `nk_keep` only for the linked hand-typed line, with `"p"` = that property (:136-170, :294-299).
   - `maint_pay` for every booked receipt (+k, m, u).
   - Refund line for every property (same ok/direct/paid/NET > 0 rule). `company` = Casa rooms, or the tenant name from `pay_tenant`
     (join `rnt_tenant_records` first_name/last_name), else the unit name. Item `title · Erstattung Mieter · <company>`.
   - `maint_unbook` restores the typed switch for every property (:70-79).
   - Keep D39's safety rules: no self-update in the BEFORE DELETE path; `is distinct from` on every self-update.
   - **(critic)** Generalise the linked hand-typed line rule (D39.sql:149-170, :294-299, `p` = 7 hard-coded in 6 places) to
     every property. Otherwise a non-Casa receipt marked klein/schaden that is linked to a line typed with NK on is billed in
     Teil A (the typed line, via `_srAutoNkItems`) AND in Teil B. That is a double charge.
   - **(critic)** Personal data: `company` = tenant name ends up in the Controlling export for the Steuerberater. Use
     "Mieter <Nachname>" (short), and never the IBAN or address.
5. **Rebook** every cost once (receipts first), as D39:316-323.
6. **Checks:** nk_wrong = 0 for all properties; non-Casa `pay_type 'nk'` count = switches that were on; refunds_missing = 0;
   no non-Casa receipt with `pay_cat`. Comment: "Do not run D39 again after D40."
   **(critic)** Order SQL → files is not enough here: with D40.sql run and the old Controlling JS still cached, the switch is
   still editable and silently overwritten by the next rebook. Bump every `?v=` tag and the SW cache in the same release, and
   tell the owner to reload Controlling once. Add check `kind_missing = 0` (non-Casa NK lines without `nk_kind`). Add a
   Hausgeld check: non-Casa NK receipts whose `pay_kind` also appears as an `origin 'hv'` position of the same record. This
   flags possible double billing with the HV statement and is shown as a warning, not a failure.

## 3 · Connecting each property (case → units → tenant on date → its NK)

Chain, identical in Maintenance and Settlements (one implementation in the shared module, fed with arrays):
**(critic)** Settlements must NOT get a second tenancy chain: its letters are built from `_srItemsFor` (`ctlUnitsFor` +
`ctlUnitLink` + `_cxTenancies` + `_cxRentDay` spans). Teil B in Settlements attaches to those existing items by bill day only.
`wpUnits/wpTenancies/wpModeOn` are a Maintenance-only port (Maintenance does not load controlling-soll.js), pinned by a Node
test that runs the port and the real controlling-soll.js functions on the same fixtures (TT.MM.JJJJ dates, former tenant
without Mietende, planned tenant, Pauschal span in the middle, parking by name, saved link vs auto link).
1. `case.property_id` → `ctrl_properties` → family: 7 = casa; else rentals.
2. Units: casa → `rooms` (D39). rentals → `ctrl_units` of the property in `sort_order`, linked like `ctlUnitLink`: saved
   `source_type/source_ref` wins; parking by `/garage|stellplatz|\btg\b/i`; one living unit → the property's apartment
   (`rentals_apartment_ref`, else same name, never for id 7). No unit row but an apartment link → one implicit unit "Wohnung".
   **(critic) Wrong: drop the implicit unit.** `ctlUnitsFor(pid)` returns only real `ctrl_units` rows for id ≠ 7
   (controlling-soll.js:272-275) and `_srItemsFor` builds tenant items only from them (settlements-tab-rentals.js:872).
   Without a unit row Settlements has NO tenant item, so a Klein/Schaden "with NK" that Maintenance shows as billed to Müller
   is silently never billed. Rule: no `ctrl_units` row → treat as "No tenant link" (Klein/Schaden with NK disabled, Direct ok).
3. Tenancies of a unit: `rnt_tenant_records` by `apartment_id` / `parking_id`, dates normalised, rule of `_cxTenancies`
   (from = Mietbeginn; to = Mietende, else active → open, else day before the next move-in or today).
4. Rent mode on the day: newest `rent_periods` (app 'rentals', tenant_id) with `valid_from ≤ day` → `mode`; none → Kalt + NK.
5. NK period: `ctlPeriodOf` rule with **that property's** `nk_period_start` (Kostheim 07-01); label = year of the period end.
   Settlements uses its stored record period (`_srPer`) when it was overridden.
   **(critic)** Today Teil A auto-items pick costs by the standard `c.per` (`_srAutoNkItems` :1002) while `_srCalc` uses
   `_srPer` (:259). Teil B must use the same window as Teil A of the same letter. Either both use `_srPer` (changes Teil A of
   unsent records with a custom period: list them in the pre-checks) or both `c.per` plus a warning for costs in the gap.
   Maintenance must read the stored custom period (`nk_abrechnung_rentals.period_from/to`) or its "NK 2026" label is wrong.
6. **Bill day** = cost_date, or the tenant's last day when a former tenant was picked. The Rentals record whose period contains
   the bill day gets the position; the tenant's Kalt + NK span containing the bill day pays it.

Maintenance loads (lazy, in `mtWhoLoad`, fail-soft = rooms/units all enabled, no hint, no lock): `ctrl_units`,
`rentals_apartments(id,name,wohnungsnummer,zimmer_type)`, `rentals_parking(id,name,parking_type)`,
`rnt_tenant_records(id,apartment_id,parking_id,status,mietbeginn,mietende,kaltmiete,contract_type,first_name,last_name,kr_*)`,
`rent_periods(app,tenant_id,valid_from,mode,source)`, lock rows (§ 4). `mtSbTenant` switches to the same chain.
**(critic) Missing loads and lock source:**
- Purchase date: `_srBought` reads `properties.kaufdatum` via `ctlPropLinks(p).loan` (`loan_ref`, else same name;
  controlling-soll.js:214-221). Maintenance must load `properties(id,name,kaufdatum)` too, or "Before purchase" cannot work.
- Rentals "letter sent" lock: records sent before D40 have no freeze marker, so the lock cannot come from
  `nk_abrechnung_rentals.tenants[*].teilB` alone. Read `abr_results(property_id,tenant_id,period_from,period_to,kind,app,status)`
  with kind 'nk_tenant', app 'rentals', status ≠ 'storniert' (what `_srSend` writes, :823-826). Teil A lock = any such row
  for the property + period (that is exactly when `_srNkAutoSync` stops, :1031). Teil B lock = a row for that tenant + period.
  Without this a receipt switched to NK in an already-sent year turns `nk_umlage` on but never reaches a letter, while
  Maintenance shows "NK 2025".
- Also load `nk_abrechnung_rentals(property_id,period_from,period_to)` for custom periods (no need to pull `tenants` jsonb,
  which holds IBANs and addresses).
- All loads paged (1000-row cap, the open HEAD commit); `rent_periods` and `rnt_tenant_records` can pass 1000 rows over time.
- `mtSbTenant` (Schadensbericht PDF) should stay as it is in D40: switching it changes existing PDFs and is not needed.

Edge cases:
| Case | Behaviour |
|---|---|
| Vacant unit on cost_date | Kleinreparatur: "Wohnung vacant · you pay" (Save disabled for Klein). Schaden: chip of the last tenant who moved out ≤ 6 months before (§ 548); none → "you pay" |
| Two tenants in one year | the tenant on cost_date; each NK letter carries only its own receipts. Handover day (both match): both chips, the outgoing preselected |
| Former tenant picked after move-out | bill day = their last day; if that period's letter is already sent → With NK disabled "NK 2025 letter already sent · use Direct" |
| Pauschal (Mietvertrag Pauschal, Kurzzeit Pauschal) | With NK disabled "Pauschal · no NK letter"; Direct only. Settlements warns "stays with you" if it ever arrives |
| Parking unit | no Kleinreparatur, no NK; Schaden Direct only |
| Property without NK settlement (unlinked, parking-only) | NK selectable but hinted "no NK settlement yet"; Klein/Schaden disabled without a tenant |
| HV statement not in yet | Teil B waits with the NK (often 6–10 months); sheet hint "waits for the HV statement" when no record exists |
| Before purchase date | not billed, hint in the sheet; Settlements filters with `_srBought` |
| Case moved to another property (Edit › Objekt) | Maintenance resets klein/schaden pay_rooms/pay_tenant and pay_cat/pay_kind; nk stays with "no cost type" |
| Co-tenants on one record | one letter, Gesamtschuldner, no per-person split |
| Tenant dates corrected after Save | pay_tenant stays; Settlements warns when that tenant has no Kalt + NK span on the bill day |
| Unit renamed | pay_tenant keeps the Rentals link; Casa unchanged (same risk as D39) |

## 4 · Settlements

### 4a. Shared module `who-pays.js` (new, loaded by maintenance.html, settlements.html, controlling.html)
Pure functions on plain arrays (no DOM, no Supabase), unit-tested in Node:
- `WP_KINDS` (moved from `SR_KINDS`, settlements-tab-rentals.js:48-78; SR keeps `const SR_KINDS = WP_KINDS`) + `wpNkChips()` (u:true,
  not Verbrauch/Grundsteuer/CO₂/Instandhaltung).
- `wpUnits(prop, units, apts, parking)`, `wpTenancies(link, ten)`, `wpModeOn(tid, periods, day)`, `wpPeriodOf(prop, day)`.
- `wpTerms(tenant, unit, day)` → `{max, capPct, capEur, base, para, assumed}` (template table above).
- `wpLoadMt(sb)` (one paged load of klein/schaden receipts + returns + cases of all properties; `scTbMissing` fail-soft) →
  Casa `scLoadTeilB` filters it to property 7 and its period (letter must stay byte-identical; golden test).
- `wpTeilBPos(mt, pid, per, maxOf)` (port of `scTeilBPos`), `wpSplit(net, units)` (largest-remainder cents),
  `wpCap(rows, rent12, pct, label)` (the minus row).

### 4b. Rentals Teil B (settlements-tab-rentals.js)
- **Load:** `SR.mt = wpLoadMt()` next to `SR.nkOt` (:123-127).
- **Positions:** `_srTeilBPos(c, rec)`: case.property_id = c.p.id, receipt, klein/schaden, via nk, bill day in `_srPer(c, rec)`, ≥ `_srBought`,
  NET > 0; Klein over its `pay_max`/terms → warning, not billed.
- **Per tenant (`_srCalc`, before the return at :312):** rows where `pay_tenant = it.r.tenant_id` (else the unit's tenant on the bill
  day), span not Pauschal, not skipped, bill day inside `it.r.period_from/to`; share 100 % (several units: `wpSplit`). Cap per
  `wpTerms`: 8 % × kaltmiete × 12 (frozen). Return `saldoA = sum − vz`, `b1`, `b2`, `teilB`, `saldo = saldoA + b1 + b2`.
  Consumers then follow automatically: `_srSend`, `srSummary`/Dashboard, `_srCard5`, `_srNkView`, `_srSetObj`, cc-nk-settle.js.
- **Freeze (no lock in Rentals):** `_srSend` writes `rec.tenants[tid].teilB = {rows, b1, b2, terms}` and `sent = date` before `srSaveRow`
  (:818); `_srCalc` uses it once sent; cleared on reopen (`_stReopen` :2249-2252) and on Skip (`_srSkipNk` :1995).
- **Auto NK items:** `_srAutoNkItems` uses `kind: o.nk_kind || 'sonst'`; `_srNkAutoSync` also updates `kind` and adds it to `sig`.
  Klein/schaden never become positions (SQL keeps nk_umlage false).
- **UI (English, Casa look, reuse `SC_TB_CSS`):** "Teil B · from Maintenance" card in `_srNkView` after `costCard` (B1, B2, warnings,
  tap → `maintenance.html#cost=<id>`); tenant view hero bar "Teil B", calculation rows "= Teil A · …", "+ B1 Kleinreparaturen",
  "+ B2 Schäden"; tenant list sub "incl. Teil B". Shown only when positions or warnings exist.
- **Letter Seite 2 (German, Sie, same design as Casa):** `_srLetterData` sets `saldo = saldoA` when Teil B rows exist and builds `teilB`
  like `scLetterTeilB`: kicker "NK-Abrechnung <J> · Seite 2", "Teil B · Sonstige Forderungen", who = names, "<Wohnung name> · Wohnung <nr>",
  Zeitraum; B1 "Kleinreparaturen · § 8 Mietvertrag · bis 150 € je Fall" (Gewerbe "· Mietvertrag · bis 200 € je Fall"; old contract
  "Mietvertrag (Kleinreparaturklausel) · bis <max> € je Fall"); B2 "Schäden · Schadensersatz"; row sub "Ihre Wohnung · Anlage n" (never
  "÷ n Zimmer"); cap "Höchstens 8 % der Jahresnettokaltmiete (§ 8)"; Gesamtverrechnung (Teil A, B1, B2, total) with the payment
  sentence incl. Kaution (`d.einbehalt`); Anlagen "Rechnungen zu den Positionen oben". `srLetterHtml` passes `teilB`.
  `_srLetterBlob` gets the `[data-pgref]` fix-up (or calls `nkLetterPdf`). Without Teil B: byte-identical to today.
- **Totals:** `_srSend` amount/direction = |A + B1 + B2|; abr_results, ctrl_settlements and the NK-Abrechnung booking carry the total (as Casa).
- **(critic) Load failure must block, not hide:** `SR.mt` with a network error (not "column missing") must make the tenant view
  say "Teil B unknown" and disable Mark sent, as Casa does (`{error}`, settlements-tab-casa.js:111-113). Otherwise a letter goes
  out without Teil B and the freeze stores an empty Teil B for good. `scTbMissing` moves into who-pays.js (today it is defined
  in settlements-tab-casa.js:114 and only works because that file loads later). Large `.in('id', …)` lists over all years can
  pass URL limits: load returns with `not('return_of','is',null)` paged, and cases with `property_id <> 7` paged.
- **(critic) Freeze per item, not per tenant id:** `rec.tenants` is keyed by tenant_id (:263), but one tenant can have two
  Kalt + NK items in one period (Kalt+NK → Pauschal → Kalt+NK split at :881-888, or a move-out and back). A per-tenant
  `ts.teilB` would bill the frozen rows on BOTH items. Store `ts.teilB = { [it.r.id or period_from]: {...} }`, and apply the
  8 % cap once per tenant per period across their items.
- **(critic) Reopen has two callers:** `_stReopen` lives in settlements-tab-tracking.js:535. The SR callers are :2142 (untick
  Sent) and :2251. Clear the freeze in both, or inside a Rentals wrapper of `_stReopen`, plus `_srSkipNk` :1995.
- **(critic) `_srNkAutoSync` + kind:** once `kind` is synced from `nk_kind`, a kind edited by hand in Settlements on an auto-item
  is overwritten on the next load. Make the kind of `auto:'ot:…'` items read-only there ("Set in Maintenance › Who pays").
  Adding `kind` to `sig` re-saves every open record with auto-items once after the release. That is harmless but expected.
- **(critic) Hausgeld double count:** Teil A of a WEG flat already holds the HV's umlagefähige items. A Maintenance NK receipt with
  the same kind (e.g. Wartung, Garten) may be the same cost. Show a warning on the auto-item when an `origin 'hv'` position of the
  same kind exists. Do not block it.
- **(critic) Letter checks:** the Rentals letter today is one page with `extra: null`. With Teil B it becomes 2–3 pages. The
  golden tests must cover: no Teil B (byte-identical), Teil B with Nachzahlung A + Guthaben total, Kaution einbehalt > total,
  Gesamtverrechnung flowing to page 3 (pgref), Gewerbe § `P.klein` (6 or 7, depends on Staffel; read it from the contract
  generator rather than writing "Mietvertrag" without a §), and `du:false` on every sentence of the TB page.

### 4c. Casa tab
Only switches `scLoadTeilB` to `wpLoadMt` and reads `wpTerms` (null tenant columns → identical numbers). Golden test: D39 Casa model
and letter HTML for 2025/2026 before = after.
**(critic) Recommend NOT touching the Casa tab in D40** (decision 9 → No). D39 is still in its final gate, and Casa has a
lock + snapshot path (`snapshot->input->teilB`) that a loader change can break for locked years. Share only the pure helpers
(`wpSplit`, `wpCap`, kinds) by copying them; move Casa onto the shared loader in a later small release with the golden test.
Saves ~1.5–2 agent-h and removes the biggest risk to existing, locked settlements.

## 5 · Controlling (controlling-tab-onetime.js, maint-link.js)
- `_cxOtNkFixed = isMaint && (refund || has nk_kind column)` → the NK switch is read-only for **every** Maintenance line once D40 ran
  ("Set in Maintenance › Who pays", summary, "Open in Maintenance"). Before D40: D39 behaviour.
- `_cxOtNkYear(iso, pid)` with the line's own property; callers :129, :145, :151.
- Cost type label: Casa `ctrl_castel_categories`; others `WP_KINDS[nk_kind || maint_pay.k].l`; pill `NK · Wartung`.
- `_cxOtWhoHTML`: who = rooms (Casa) or `maint_pay.u` (tenant name); limit check uses `maint_pay.m` instead of 150 (:123).
- Refund lines ("Tenant refund") for all properties (mtIsMaintLine already covers maint_refund_of).
- Summary card per property that has such lines in the year (area filter), same text as Casa: "Maintenance <year> · <property>:
  Expenses X · − paid by tenants Y · Your cost Z" + "Charged on" list. NK (Teil A) lines are not in "paid by tenants".
- **(critic) Hard-coded Casa bits to replace, not just the limit:** `_cxOtTenants` (:107-133) uses `n > 150`, the texts
  "Kleinrep. >150 €", "no Zimmer set", "Gemeinschaftsfläche"; `_cxOtMtSumHTML` (:365) is gated on `cxAreaPid(CASA_PROP_ID)`
  and filters `property_id === CASA_PROP_ID`; `_cxOtWhoHTML` cost-type name uses `window._ctrl.categories` only.
- **(critic) "via NK (planned)" overstates more for Rentals:** a Rentals Teil B row is not billed when the tenant is Pauschal or
  vacant on the day, has NK skipped, or the HV statement never comes. Controlling has `window._src` (rntTen, rentP), so
  `_cxOtTenants` can mark these as "stays with you" in the same way Casa marks "no Zimmer".
- **(critic) Maintenance side of Controlling links:** the "Already in Controlling?" link dialog keeps a typed line's NK switch
  for Casa only (maintenance.js:2002 `nkTake`, :2009, :2030). Extend it to all properties (typed NK on → preset Who pays › NK),
  together with the Casa-only lock checks before Save (:1940, :1967) and the preset at :2047.

## 6 · Decisions for the owner (question → recommended default)
1. Kleinreparatur on Gemeinschaftseigentum in WEG flats? → **No** (§ 8 has no such sentence; the WEG pays). Schaden yes.
2. Old contracts with another or no Kleinreparatur clause? → **Assume the template, show "Old contract · assumed"**; add the
   kr_* columns now; the small "Kleinreparatur: 150 € / 8 % · Change" row on the tenant card only if you have such contracts (+3 h).
3. Damage found at move-out, invoice after the tenant left: may the sheet offer the former tenant? → **Yes, within 6 months**
   (§ 548); with NK only while that tenant's letter is unsent, else Direct / Kaution.
4. Cost type chips for Rentals NK (Wartung, Reinigung, Garten, …)? → **Yes**, same short list for all flats, default Sonstige Betriebskosten.
5. Migrate today's Controlling NK switches on non-Casa Maintenance lines into Who pays › NK, and make the switch read-only? → **Yes**; on a receipt/return mismatch the receipt wins.
6. Parking: Schaden Direct only, no Kleinreparatur? → **Yes**.
7. 8 % cap base: Kaltmiete × 12 from the tenant record (as Casa) or the Kaltmiete actually owed in the period (Staffel, pro rata)? → **Kaltmiete × 12 everywhere** now; revisit later.
8. Gewerbe with USt option: limit and Teil B on gross or net? → **Gross** (ask the Steuerberater).
9. Refactor Casa Teil B onto the shared module? → **Yes for load/positions/split/cap only**, guarded by a byte-identical golden test.
10. Teil B waits for the HV statement (months)? → **Accept**; the sheet says so; Direct is the fast path.
11. Properties without a tenant link: NK only? → **Yes**, with a hint to link the unit in Controlling › Setup.
12. "Neu für alt" on Schäden: full invoice? → **Full invoice** (as D39); the receipt amount stays editable.
13. **(critic)** Does the 8 % cap count Kleinreparaturen paid Direct? → **Yes for Rentals** (the law caps the yearly total).
    Casa D39 does not count them yet; changing Casa changes D39 numbers → ask.
14. **(critic) Old-contract detection:** `rent_periods.source` 'generator'/'renew' is set only for contracts made in the app
    (cc-rent-engine.js: also 'migration', 'tenant_form'). Most current tenants would show the amber "Old contract · assumed"
    line on every sheet. Recommended: a one-time "Kleinreparatur clause in this contract? 150 € / 200 € / none" per active
    Rentals tenant, stored in `kr_max`. This makes T6 required (~2 h). If nobody has confirmed it, Kleinreparatur stays allowed with
    the amber line, as planned.
15. **(critic)** Decision 9 → **No for D40** (see § 4c).
16. **(critic)** Decision 8 (Gewerbe): the Gewerbe contract is "umsatzsteuerfrei, Option § P.umsatzsteuer vorbehalten"
    (rentals-gewerbe-mietvertrag.js:335, :474-475). Gross is right while the option is not exercised. If it ever is, Teil B
    needs USt lines. Out of scope; Gewerbe Teil B shows a hint "no USt option assumed".

## 7 · Effort for an agent team

Anchor: D39 (similar size: ~2,070 lines build + ~630 lines in two review rounds, plus 36 bug fixes) took about **10 h wall-clock**
from plan (01:57) to final gate (~12:00), 2 agents at a time. D40 has no bug list but more data plumbing (two tenant models, a
live-data migration, a second letter pipeline), so it should be about the same size.

| Track | Content | Agent-h | Can run with |
|---|---|---|---|
| T1 SQL | MAINTENANCE-D40.sql, migration, checks, PGlite tests (Casa + non-Casa + returns + refunds + rerun) | 3–4 | T2 |
| T2 Shared | who-pays.js (kinds, units, tenancy, mode, period, terms, Teil B pos/split/cap) + Node unit tests | 2–3 | T1 |
| T3 Maintenance | per-property context, loads, sheet variants/texts, tag, lock per property, pay_tenant/pay_max on Save, case-move reset, mtSbTenant, 390/1280 no-jump regression | 5–7 | T4 |
| T4 Settlements | Rentals Teil B model, freeze, UI, letter Seite 2 + pgref, nk_kind sync, Casa onto shared loader + golden test | 5–7 | T3 |
| T5 Controlling | read-only for all, NK year per property, kind labels, refunds, per-property summary | 2–3 | T3/T4 tail |
| T6 optional | tenant-card terms row (Rentals + Casa) | 2–3 | T5 |
| Review 1 + fixes | 2 reviewers over 4 areas, verified findings fixed (D39 had 31) | 4–5 | — |
| Review 2 + final gate | — | 2–3 | — |
| Real data | owner runs the pre-checks + D40 in Supabase; agent checks Kaiser-W-R 17, Studio One, Kostheim, Casa (letters, totals, Controlling) | 1–2 (+ owner) | — |

- **Agent time:** about 25–35 h (+2–3 h with T6).
- **Wall-clock with 2 agents at a time in one workflow:** wave 1 T1 ∥ T2 (~3.5 h) → wave 2 T3 ∥ T4 (~6.5 h) → T5 + integration
  (~2.5 h) → review 1 (~4 h) → review 2 + gate (~2.5 h) → real data (~1.5 h) ≈ **20 h**.
- **With a second workflow in parallel** (T1 + T5 there; T3/T4 start on the fixed `who-pays.js` interface without waiting for T2):
  critical path T4 → reviews → real data ≈ **13–15 h**.
- **Realistic answer: about 14 h wall-clock (range 11–20 h)**, i.e. start today, finished tomorrow, plus the time until you run
  the SQL in Supabase.
- Uncertainty (±40 %): real data surprises (units without a link, old TT.MM.JJJJ dates, Rentals records with custom periods), how many
  review findings come back, and how fast the decisions in § 6 are answered. Decisions 2, 3 and 9 change the size most.

### 7b. (critic) The estimate is too optimistic
- **The anchor is wrong.** Git shows D39 from plan (01:57) → build commit 04:16 → review 1 fixed 10:15 (**~6 h for review 1**,
  not 4) → review 2 10:27–10:49 → final gate 11:53 and 11:57 "fixes in progress" → 12:18 another "in progress" checkpoint.
  So D39 took **≥ 10.5 h and is still not closed**. "About the same size" also understates D40: it touches four apps
  (Maintenance, Settlements Rentals, Controlling, SQL on live non-Casa data), while D39 touched one property.
- **"Realistic 14 h" assumes a second parallel workflow** that the user has not asked for. With the setup D39 used (2 agents at
  a time), the plan's own sum is ~20 h, before the work added above.
- **Added by this review:** Rentals lock from abr_results (+1 h), freeze per item + cap incl. Direct (+1 h), linked-line
  and link-dialog generalisation (+1 h), port-vs-controlling-soll parity tests (+1 h), T6 needed for old contracts (+2 h),
  D39 gate closed first (+1–2 h). **Removed:** Casa onto the shared loader (−1.5 h), several-Wohnungen variant (−1 h).
- **Corrected agent time: about 30–40 h.**
- **Corrected wall-clock, 2 agents at a time, one workflow:** close D39 (~1.5 h) → T1 ∥ T2 (~3.5 h) → T3 ∥ T4 (~7 h) →
  T5 + T6 + integration (~3 h) → review 1 + fixes (~5.5 h) → review 2 + gate (~3 h) → real data (~1.5 h) ≈ **24 h**.
- **Realistic answer: about 24 h wall-clock (range 18–32 h), i.e. two full working days**, plus the time until the owner
  runs D40.sql in Supabase and checks Kaiser-W-R 17 / Studio One / Kostheim letters. With a second workflow in parallel: ~17–19 h.
- **Faster option (MVP, ~15 h wall-clock):** single-unit Wohnung + Gewerbe only (all current non-Casa flats), NK cost type +
  Klein/Schaden with NK or Direct + Rentals Teil B letter + Controlling read-only. Later: parking chips, kr_* terms UI, Casa onto
  the shared loader, cap incl. Direct for Casa.
