# MAP 4 · Everything in D39 that is Casa-specific → how to generalise "Who pays?" to every property

Read-only map of HEAD 8571afb (D39 included). Line numbers are for the current files.
"Property of the case" = `maint_cases.property_id` = `ctrl_properties.id` (same id in Controlling, Settlements and SQL).
Two NK families exist (see allprops/props.md, allprops/rentals-nk.md):
- **casa** = property 7: Zimmer from `rooms`, tenants in `tenant_records` (by room NAME), NK = Casa engine
  (`nk-casa-engine.js`), record `nk_abrechnung_casa` (one row per year, `locked_at` + `snapshot`).
- **rentals** = every other active property: units `ctrl_units` → `ctlUnitLink` → `rentals_apartments` /
  `rentals_parking`, tenants in `rnt_tenant_records` (by `apartment_id` / `parking_id`), NK = `_srCalc`
  (settlements-tab-rentals.js:258), record `nk_abrechnung_rentals` (one row per property + period_from, NO lock).
Example: "Kaiser-W-R 17" (id 5) = one WEG apartment, one tenant at a time, NK period 01-01. Kostheim (id 1) starts 07-01.

Short answer
- D39 has ~45 hard-coded Casa points. Most sit in 10 small helpers in maintenance.js (3342-3800) and in
  4 functions of settlements-tab-casa.js. The sheet UI itself (mtWhoBody / mtWhoRender / CSS) is generic; it only
  needs other data and other words ("Wohnung" instead of "Zimmer", § 8 instead of § 7).
- Generalise through ONE per-property context object, built in Maintenance from the case's property:
  `WC = mtWhoCtx(pid) = { fam: 'casa'|'rentals', units:[{name, link}], tenancies(unit, day), cats, catNone,
  period(day), lock rows, max (150/200), para ('§ 7'/'§ 8'/…), capBase }`. Every mtWho* helper takes it
  instead of reading MT.rooms / MT.whoTen / MT_CASA_ID / MT_WHO_MAX.
- Data contract: keep all six pay_* columns. pay_rooms = the UNIT names of that property (Casa: room name, which is
  already the Casa unit name). Add ONE column `pay_kind text` (Rentals cost type key from SR_KINDS; pay_cat stays the
  Casa ctrl_castel_categories id) and `ctrl_expense_one_time.nk_kind text` (also works as the "D40 has run" probe).
- SQL: replace every `= 7` by "Maintenance owns the NK of every property"; migrate the non-Casa Controlling NK
  switches into pay_type 'nk' exactly like D39 § 3 (details in § 9).

---------------------------------------------------------------------------------------------------------------

## 1 · The gate: which receipts get "Who pays?"

| # | where | Casa assumption today | generalise to |
|---|---|---|---|
| 1.1 | maintenance.js:194 `MT_CASA_ID = 7` | the only property with Who pays | keep (family test), but stop using it as the gate |
| 1.2 | maintenance.js:2373-2376 `mtIsCasa` (id 7 or name "casacastel") | — | keep for Casa-only things (Details › Zimmer, Bericht); add `mtWhoFam(pid)` = 'casa' / 'rentals' (a property with ≥ 1 linked living unit) / null |
| 1.3 | maintenance.js:3358 `mtWhoOn = c => MT.d39 && mtIsCasa(c.property_id)` | Casa only | `MT.d40 && !!mtWhoFam(c.property_id)` (D39-only DB: Casa only, as today) |
| 1.4 | maintenance.js:1517-1518, 1527 (row tag), 1571 (receipt pop-up row) | gated by mtWhoOn | nothing — follows 1.3 |
| 1.5 | maintenance.js:1940 lock re-read before Save; 1967-1979 lock / vacant checks; 2002 `nkTake`; 2047 pay_* in the row payload | each repeats `mtIsCasa(c.property_id)` | replace by `mtWhoOn(c)` (5 places) |
| 1.6 | maintenance.js:3342-3354 header, maintenance.css:685-689 header | "Casa Castel receipts only" | comment only |
| 1.7 | PLAN.md:47 "Casa Castel only … Non-Casa receipts never get pay_*" | rule | new rule: every property with a linked unit; parking-only / unlinked property: no tag |

## 2 · Units / rooms ("Where" + chips)

| # | where | Casa assumption | generalise to |
|---|---|---|---|
| 2.1 | maintenance.js:313-318 `MT.rooms` from table `rooms` | the chips are Casa rooms | keep for Casa; add `MT.whoUnits[pid]`: for rentals load `ctrl_units` (property_id,name,unit_type,source_type,source_ref,sort_order) + `rentals_apartments(id,name,zimmer_type)` and mirror `ctlUnitLink` (controlling-soll.js:242-266): saved source wins, parking (`_cxIsParking` :211) left out, one living unit → auto-link to the property's apartment (`ctlPropLinks` :214, same as `mtSbApt` maintenance.js:2420-2425 but with the id≠7 guard). Maintenance does not load controlling-soll.js, so copy the ~20 lines |
| 2.2 | maintenance.js:3406-3410 `mtRoomCanon` / `mtRoomSort` | MT.rooms order | `WC.units` order (ctrl_units.sort_order) |
| 2.3 | maintenance.js:3434-3441 `mtWhoRooms(day)` | all = MT.rooms | all = WC.units names |
| 2.4 | maintenance.js:3566-3589 `mtWhoState` room0 = `c.report_room`, `mtWhoPrefill`, `mtWhoOrt`, `MT_SB_ALL` (:195) | the entry's Zimmer (Casa-only field, maintenance.js:536, 705) | rentals: one living unit → that unit; several → none (user picks). report_room stays Casa |
| 2.5 | maintenance.js:3631-3663 `mtWhoBody` Where section `[Gemeinschaftsfläche | Zimmer]`, chips, hint "6 rented Zimmer" (:3648-3653) | a house of Zimmer | ONE unit: hide Where + chips (pay_where 'zimmer', pay_rooms [that unit]) → the sheet is Type · Payment · result (still the same lean sheet). Several units: same sheet, words "Wohnung"/"Einheit" |
| 2.6 | Kleinreparatur + Gemeinschaftsfläche (maintenance.js:3449, 3455, 3591; settlements-tab-casa.js:335) | Casa contract § 7 extends Kleinreparaturen to Gemeinschaftsräume (cc-contract-master.js:341) | Rentals § 8 (rentals-contract-text.js:108-113) does NOT → for rentals offer Kleinreparatur only for the unit itself (no 'gemein'); Schaden on Gemeinschaftseigentum stays possible ("caused by" the unit) |
| 2.7 | maintenance.js:3504-3514 tag texts `Kleinrep. · Gemeinschaft`, `3 Zimmer`, `no Zimmer`; :3615, 3618, 3621 result texts "per Zimmer", "Choose the Zimmer", "No Zimmer rented" | "Zimmer" | `WC.word` = 'Zimmer' (casa) / 'Wohnung' (rentals). One unit: tag `Kleinrep. · Wohnung` or just `Kleinreparatur` |
| 2.8 | data contract pay_rooms text[] = rooms.name (PLAN.md:37-48, D39.sql:12) | room names | = unit names of the property (Casa: unchanged, since Casa units are named after the rooms). Risk: a unit rename breaks the match (same risk as a Casa room rename today) — optional later: `pay_unit_ids` |
| 2.9 | settlements-tab-casa.js:345-354 `scTbRooms` (window._src.rooms) | Casa room order | Rentals copy: `ctlUnitsFor(pid)` order |
| 2.10 | case moves to another property (Edit › Objekt, maintenance.js:697) | not handled in D39 (Casa pay_* stay on a receipt that moved away, only ignored) | NEW: when property_id changes, reset klein/schaden pay_rooms (other house) and pay_cat/pay_kind (other catalogue); nk may stay with "no cost type" |

## 3 · Tenants on a day (the tenancy rule)

| # | where | Casa assumption | generalise to |
|---|---|---|---|
| 3.1 | maintenance.js:3361-3373 `mtWhoLoad` loads `tenant_records(room,status,mietbeginn,mietende)` | Casa tenants by room NAME | + `rnt_tenant_records(apartment_id,parking_id,status,mietbeginn,mietende,kaltmiete,contract_type)` (already loaded for the Bericht in `mtSbLoad` :2398-2411) |
| 3.2 | maintenance.js:3420-3432 `mtWhoWins(room)` (= `_cxTenancies` controlling-soll.js:530-552 for casa_room) | `mtNorm(t.room) === mtNorm(room)` | by the unit's link: casa_room → room name; rentals_apartment → `apartment_id === ref`; same from/to rule (Mietbeginn/Mietende, active → open end, former → day before next move-in or today) |
| 3.3 | maintenance.js:3515 `mtWhoVacOn`, 3593 `mtWhoVac`, 3596-3604 `mtWhoProblem` ('vacant', 'norent') | rooms | units — a vacant apartment on the receipt date → 'norent' "Wohnung vacant on … · you pay" |
| 3.4 | settlements-tab-casa.js:361-379 `scTeilB`: tenant = `ten.find(x.mode==='nk' && !x.skipped && room match && from ≤ day ≤ to)` from the Casa engine (R.tenants) | Casa engine tenants | Rentals: the tenant items of `_srItemsFor` / `_srYearModel` (settlements-tab-rentals.js:868, 904): `it.e.unit_name`, `it.r.period_from/to`, note 'Pauschal' = no NK letter → warning "stays with you" (same text as Casa) |
| 3.5 | settlements-tab-casa.js:126-129 Teil B cases filtered `property_id === CASA_PROP_ID`; :120 one query over ALL properties | Casa | load once (e.g. settlements-app.js), group by case.property_id → Casa tab and Rentals tab each take theirs |

## 4 · Cost types for "NK"

| # | where | Casa assumption | generalise to |
|---|---|---|---|
| 4.1 | maintenance.js:124 + 3365 `ctrl_castel_categories` (Casa cost types, no property_id column — controlling-data.js:34) | the only catalogue | rentals: `SR_KINDS` (settlements-tab-rentals.js:48-78, § 2 BetrKV, text keys). Chips = `u:true` kinds without key 'direkt'/'verbrauch' and not `neg` (no Grundsteuer, Heizung, CO₂). Move SR_KINDS to a small shared file (Maintenance + Controlling + Settlements read it) |
| 4.2 | maintenance.js:3484 `mtWhoCatAll`, 3485-3490 `mtWhoCatName` (null → "Allgemeine Hauskosten"), 3491-3500 `mtWhoCatIds` (most used over ALL MT.costs) | Casa ids | per family: casa → as now; rentals → SR_KINDS, none chosen = "Sonstige Betriebskosten" (sonst); count "most used" only over receipts of the same family |
| 4.3 | data: `pay_cat bigint` (D39.sql:16) | a ctrl_castel_categories id | cannot hold SR_KINDS keys → NEW `maint_costs.pay_kind text` (rentals), pay_cat stays casa. maint_pay snapshot + "k" |
| 4.4 | SQL D39.sql:211-212 `nk_c := pay_cat` → `ctrl_expense_one_time.nk_category_id` | Casa id | rentals: `nk_category_id` null, NEW `ctrl_expense_one_time.nk_kind text = pay_kind` |
| 4.5 | settlements-tab-rentals.js:1014-1020 `_srAutoNkItems` → always `kind: 'sonst'`, label = item | cost type ignored | `kind: o.nk_kind || 'sonst'` |
| 4.6 | controlling-tab-onetime.js:136-138 (`_cxOtWhoHTML` cat from ctrl categories, "Allgemeine Hauskosten"), :294 + 304 row pill `NK · <cat>`; :830-841 `_cxOtNkCatHTML` (Casa only) | Casa categories | rentals: label from SR_KINDS by `maint_pay.k` / `nk_kind` |
| 4.7 | maintenance.js:3640 "NK is always shared by all · like all Betriebskosten" | Casa pool | true for rentals too (NK-only position split by days over the period's tenants) — keep |

## 5 · NK period / "NK 2026"

| # | where | Casa assumption | generalise to |
|---|---|---|---|
| 5.1 | maintenance.js:3456-3463 `mtWhoYear(day)` reads `mtProp(MT_CASA_ID).nk_period_start` | Casa period | `mtProp(c.property_id).nk_period_start` (Kostheim 07-01 → "NK 2026" = 01.07.2025–30.06.2026). Same formula as `ctlPeriodOf` controlling-soll.js:1216-1222 |
| 5.2 | controlling-tab-onetime.js:101-106 `_cxOtNkYear(iso)` (Casa property) | Casa | `_cxOtNkYear(iso, o.property_id)`; callers :129, 145, 151 |
| 5.3 | settlements-tab-rentals.js:187-193 `_srPer(c, rec)` | — | a Rentals record can override the period (custom from/to) → Maintenance's year/lock must use the stored record period when one exists (it reads nk_abrechnung_rentals for the lock anyway, § 6) |
| 5.4 | settlements-tab-rentals.js:1016 `since` (purchase date, `_srBought` :1155) | — | NK of a receipt before kaufdatum is never billed → hint in the sheet |
| 5.5 | PLAN.md:84-86 | "the Casa NK period" | "the NK period of the case's property" |

## 6 · Lock ("Billed in NK 2026 · locked in Settlements")

| # | where | Casa assumption | generalise to |
|---|---|---|---|
| 6.1 | maintenance.js:3367 + 3387 read `nk_abrechnung_casa`, :3374 `MT_WHO_LOCKQ` = `snapshot->input->teilB`, :3375-3376 `mtWhoLockRows` (no property) | one Casa table, one row per year | `MT.whoLock` rows get `pid`. Casa as now. Rentals: `nk_abrechnung_rentals(property_id,period_from,period_to,tenants)` — it has NO locked_at/snapshot (SETTLEMENTS-RENTALS.sql:4-24) |
| 6.2 | settlements-tab-casa.js:2506-2537 `scLock` writes `snapshot.input.teilB`; :400-402 locked years use the snapshot; :363 old snapshot = no Teil B | Casa lock | Rentals has no lock: freeze at send. In `_srSend` (settlements-tab-rentals.js:805-848) write `rec.tenants[tid].teilB = [rows]` (ids + shares) and use it for that tenant once sent. "Locked" for Maintenance = the receipt id is in a sent tenant's teilB, or (NK) a tenant letter of that property+period is sent (`ctrl_settlements` app 'rentals', kind 'nk_tenant', status verschickt/erledigt — fields in settlements-tab-tracking.js:374-375) — the auto-items stop syncing after send |
| 6.3 | maintenance.js:3465-3470 `mtWhoLockOf(r)`, 3474-3477 `mtWhoYrOf(day)`, 3478-3482 `mtWhoYrBar` | rows of Casa only | filter by `pid` of the receipt's case: `mtWhoYrOf(pid, day)` (callers :3479 via mtWhoYrBar ← :1968, 1975; :3563, 3573) |
| 6.4 | maintenance.js:3393 visibilitychange re-read; 3381-3392 one read at a time | — | read both tables in one go (still fail-soft: a failed read = no lock) |

## 7 · Kleinreparatur limit (150 €) and the 8 % cap

| # | where | Casa assumption | generalise to |
|---|---|---|---|
| 7.1 | maintenance.js:3356 `MT_WHO_MAX = 150`, used :3507, 3590, 3614, 3637, 3719 | § 7 Casa, 150 € | per contract of the unit's tenant: Casa § 7 150 €; Rentals Wohnung § 8 150 € (rentals-contract-text.js:108-113); Gewerbe (`zimmer_type 'Gewerbefläche'`) 200 €, § 6 or § 7 by Staffel (rentals-gewerbe-mietvertrag.js:296-301, 441-442). Uploaded / old contracts: unknown → 150 € and no § number |
| 7.2 | settlements-tab-casa.js:336 `net > 150.004` (skip), :391 warning text | 150 | `p.max` per position (from the contract) |
| 7.3 | controlling-tab-onetime.js:123 `n > 150` | 150 | Controlling cannot see contracts → put the limit into the snapshot: maint_pay "m" (from a new optional `pay_max`, null = 150) |
| 7.4 | settlements-tab-casa.js:306-312 `rent12 = casaTen.kaltmiete × 12`; :383-386 cap 8 %, label "Höchstens 8 % der Jahresmiete (§ 7)"; :790, 825, 828 UI; :2301 letter "8 % von … Jahresmiete" | Casa tenant record | Rentals: `rnt_tenant_records.kaltmiete × 12` (better: the Staffel-aware Kaltmiete of the NK year, rnt_staffelmiete_history); base word "Jahresnettokaltmiete" (Wohnung + Gewerbe), "Jahrespauschalmiete" only for Pauschal (but Pauschal has no NK letter → Direct only) |
| 7.5 | texts with "§ 7": maintenance.js:3345, 3614, 3624; settlements-tab-casa.js:385, 790, 812, 2315, 2318-2321 (legal note); PLAN.md:50 | Casa contract | `WC.para` ('§ 7' / '§ 8' / '§ 6|7' / '') |

## 8 · Settlements and the letter

| # | where | Casa-only | generalise to |
|---|---|---|---|
| 8.1 | settlements-tab-casa.js:116-132 `scLoadTeilB`, 321-338 `scTeilBPos`, 361-394 `scTeilB` | Casa tab only | logic is generic (NET, equal cent split, warnings, cap): move to a shared helper (e.g. nk-teilb.js) taking `{ positions, tenants(room→tenant on day), cap(t) }`; Casa and Rentals call it |
| 8.2 | settlements-tab-casa.js:266-270, 301 `tbDup` guard (Teil B receipt never also in the house costs) | Casa | Rentals: `_srAutoNkItems` skips lines whose `maint_pay.t` is klein/schaden (SQL books them nk_umlage false anyway) |
| 8.3 | Rentals saldo: `_srCalc` returns `saldo` (settlements-tab-rentals.js:258-316) → `_srSend` amount (:811) | no Teil B | `x.saldoA`, `x.b1`, `x.b2`, `x.saldo = A + B1 + B2` (same as Casa t.saldo) → abr_results, ctrl_settlements, Dashboard follow |
| 8.4 | settlements-tab-casa.js:2296-2335 `scLetterTeilB`: who = "Casa Castel · Zimmer <room>" (:2324), "Dein/Ihr Zimmer", "÷ n vermietete / verursachende Zimmer" (:2302-2304), block note "§ 7 Mietvertrag · bis 150 € je Fall" (:2315) | Casa words | Rentals: `<apartment name> · Wohnung <wohnungsnummer>`, "Ihre Wohnung", neutral register (d.du false), § 8 / 200 € by contract |
| 8.5 | nk-letter.js:181-284 Teil B page | generic (data-driven `d.teilB`) | nothing; but the Rentals PDF path `_srLetterBlob` (settlements-tab-rentals.js:704-744) does NOT run the `[data-pgref]` fix-up of `nkLetterPdf` (nk-letter.js:305-306) → copy it (or use nkLetterPdf) |
| 8.6 | settlements-tab-casa.js:2282, 2240 "Belegliste Seite 2/3" | Casa | Rentals letter has its own page numbering — check when d.teilB is set |
| 8.7 | settlements-tab-casa.js:759-815 Teil B tile/view, :819-830 tenant rows, :1918 bar | Casa tab | copy into the Rentals tenant modal (UI English, same mockups) |

## 9 · SQL (MAINTENANCE-D39.sql) — every `7` and the non-Casa path

| # | line | today | D40 (all properties) |
|---|---|---|---|
| 9.1 | :2-6, :8 | "Casa Castel only · other properties: nothing changes" | header |
| 9.2 | :27-30 nk_keep | non-Casa: Controlling switch kept while unbooked (bug 27); "p":7 = linked hand-typed Casa line | Who pays lives on the receipt → the bug-27 use is no longer needed; keep nk_keep only for the linked hand-typed line, "p" = its property (any) |
| 9.3 | :51-56 § 3 migration `c.property_id = 7 and o.property_id = 7` | Casa only | see § 10 below |
| 9.4 | :70-79 maint_unbook restores the typed NK switch only for property 7 | Casa | every property (Maintenance set it everywhere now) |
| 9.5 | :120 `casa := c.property_id = 7` | the switch for everything below | `own := true` for every booked property; keep `fam_casa := (c.property_id = 7)` only to pick pay_cat vs pay_kind |
| 9.6 | :125-134 not-ok path saves nk_keep for `property_id is distinct from 7` | bug 27 | drop |
| 9.7 | :136-156 Casa klein/schaden linked line: switch off + nk_keep "p":7; restore when "p" = 7 | Casa | all properties, "p" = c.property_id |
| 9.8 | :168-170 link takes nk_keep when "p" = 7 | Casa | "p" = c.property_id |
| 9.9 | :190-206 maint_pay only `casa and return_of is null` | Casa | every receipt; add "k" (pay_kind), "m" (limit) |
| 9.10 | :208-219 nk_u/nk_c: Casa from pay_type; else nk_keep of the same property | — | `nk_u := h.pay_type = 'nk'` for all; `nk_c := pay_cat` (casa) / null; `nk_kind := pay_kind` (rentals) |
| 9.11 | :230-235 on conflict: `excluded.property_id = 7` → from Who pays, else keep `o.nk_umlage` | Controlling owns non-Casa | always `excluded.*` (Maintenance owns NK everywhere) |
| 9.12 | :241 refund line only `casa and …` | Casa | every property |
| 9.13 | :294-299 delete trigger restores linked line when "p" = 7 | Casa | "p" = property of the line |
| 9.14 | :328-355 checks `c.property_id = 7` (:336, :341, :351) | Casa | all properties + per-property counts |

## 10 · Non-Casa behaviour that must change + migration of the non-Casa NK switches

Today (D39) for non-Casa Maintenance lines Controlling owns the NK switch:
- controlling-tab-onetime.js:94 `_cxOtNkFixed` true only for property 7 (and refund lines) → :177-183 shows the editable
  switch "Show in Settlements" for other properties, :224-244 `_cxOtSaveMaint` writes `nk_umlage` (nk_category_id
  stays null: the cost type select :830-831 is Casa only). Each line has its own switch — **returns too**.
- SQL keeps that switch on every re-book (:232-235), remembers it while unbooked (nk_keep, :129-134, :213-215).
- settlements-tab-rentals.js:124 loads every `nk_umlage = true` one-off; :1014-1020 makes it an "NK only" position
  `auto 'ot:<line id>'`, kind 'sonst'. Stored positions keep `nk:false` when you untick one.
- maint-link.js:22 already counts refund lines as Maintenance lines (shield of `_srFindBooking` :41 → refunds are never
  taken as NK payments — good, nothing to change). maint-link.js:8-12 comments say "Casa".

Change: Controlling's switch becomes read-only for EVERY Maintenance line (`_cxOtNkFixed` = isMaint && (refund ||
D40 has run, probe `hasOwnProperty(o,'nk_kind')`)), the read-only block `_cxOtWhoHTML` and the "Tenants pay" pill work
for every property; `_cxOtMtSumHTML` (:366-368, :393) shows one "Maintenance <year> · <property>" card per property
that has such lines (area filter `cxAreaPid(pid)`).

Migration (D40 § 3, before the rebook, safe to run twice — like D39:51-56):
1. Receipts of other properties: `update maint_costs m set pay_type='nk', pay_kind = coalesce(<kind of the stored
   Rentals position with auto = 'ot:'||o.id>, 'sonst'), pay_cat = null from ctrl_expense_one_time o, maint_cases c
   where o.maint_cost_id = m.id and c.id = m.case_id and c.property_id <> 7 and o.property_id = c.property_id and
   m.return_of is null and m.pay_type is null and o.nk_umlage`.
2. Unbooked receipts (no line now): `nk_keep->>'p' = c.property_id and (nk_keep->>'u')::boolean` → same as 1, then
   `nk_keep = null`.
3. Receipts that moved from Casa (non-Casa case with pay_* set): klein/schaden with Casa room names → clear pay_* (list
   them in the check first); nk → keep type, `pay_cat = null`.
4. Returns: after D40 a return follows its receipt. Conflicts change the Rentals NK amount: receipt NK on + return
   off (the return will now lower the NK) and receipt off + return on (the return stops lowering it). List them in a
   pre-check select (expected 0 or a handful) and decide: default = the receipt wins. Periods already sent are safe:
   Rentals stops syncing auto-items after "sent".
5. Linked hand-typed lines: `maint_before` already holds their typed switch (D39:57-59 for all properties) → nothing.
6. Then rebook every cost once (D39:316-323) with the generalised maint_book_line; `notify pgrst`.
7. Checks: nk_wrong = 0 for all properties; non-Casa receipts with pay_type nk = number of switches that were on;
   returns_conflict listed; refunds_missing = 0.
8. Do not run D39 after D40 (it brings back "Controlling owns non-Casa").

Unchanged / already generic: nk-letter.js Teil B renderer, maint-link.js code, maintenance.css (only the header comment
:685-689 says Casa), mtWhoRender/mtWhoBody layout, Save path (mtWhoSave :3765-3800), drafts (:4309), dirty key (:1598).

## 11 · Rough effort (agent work, same quality bar as D39: tests + review rounds)
- SQL D40 (booking for all, migration, checks, PGlite tests): 0.5–1 day.
- Maintenance (per-property context, units/tenants loader, cost-type family, lock per property, words/§/limit,
  case-move reset, tests 390/1280): 1–1.5 days.
- Settlements Rentals (shared Teil B helper, saldo A+B, freeze at send, letter page + pgref, Teil B view): 1.5–2 days.
- Controlling (read-only for all, kind labels, per-property summary, NK year per property): 0.5 day.
- Review + fix rounds (D39 needed ~36 fixes): 1–2 days.
- Total ≈ 4.5–7 working days sequential; with 3–4 parallel agents ≈ 2–3 days wall-clock.
