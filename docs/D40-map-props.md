# MAP 1 · Properties, units, tenants, NK settlements, letters (read-only map for "Who pays?" on all properties)

Repo /home/user/Casa-Castel at main incl. D39. All line numbers are from the current files.

## 0. Short answer

- There are exactly **two NK models** in the code, plus parking (no NK) and a manual fallback:
  1. **Casa Castel** (`ctrl_properties.id = 7`, `CASA_PROP_ID` controlling-data.js:14, `MT_CASA_ID` maintenance.js:194):
     a whole house with individually let **Zimmer** (`rooms` + `tenant_records`). NK = own provider costs (Kostenquote).
     Settlements › Casa Castel tab, `nk_abrechnung_casa` (one row per year), Teil B (D39) exists.
  2. **Every other active property** (id ≠ 7) = a **Rentals Wohnung** (in practice one WEG Eigentumswohnung per
     property, e.g. "Kaiser-W-R 17", "Kaiserstr. WHG 507", "Adam-K-S. 1-3, WHG 08"): `ctrl_properties.rentals_apartment_ref`
     → `rentals_apartments` → tenants in `rnt_tenant_records.apartment_id`. NK = the tenant's share of the HV's
     Hausgeldabrechnung + NK-only items. Settlements › Rentals tab, `nk_abrechnung_rentals` (one row per property +
     period). No Teil B yet.
  3. **Parking units** (Stellplatz / Tiefgarage / TG, any property incl. Casa): `ctrl_units` → `rentals_parking` → tenants
     in `rnt_tenant_records.parking_id`. **No NK at all** (skipped everywhere).
  4. Settlements › Dashboard › **manual NK-Abrechnung** (`nk_abrechnung_manual`): typed by hand, any property, no link
     to tenant records. The old Tracking tab is gone.
- `maint_cases.property_id` = `ctrl_properties.id` (MAINTENANCE-D1.sql:3-7). A case has **no unit column** for
  non-Casa (only free-text `area`, e.g. "Balkon"; `report_room` is Casa only). The tenant comes from
  property → its units → unit link → tenancies on the receipt date, with the same rule as Controlling (`_cxTenancies`).

## 1. Property kinds (data sources)

### 1a. `ctrl_properties` (Controlling's property list = the list Maintenance and Settlements use)
- Loaded by `ctlLoadAll` (controlling-data.js:31, `.order('id')`), Maintenance `mtLoad` (maintenance.js:282), cc-nk-settle.js:25.
- Fields seen in code: `id` (bigint), `name`, `active`, `sort_order` (SETTLEMENTS-RENTALS.sql:57-61), `rentals_apartment_ref`
  (text id of `rentals_apartments`), `loan_ref` (id of `properties` = Properties app / loan), `nk_period_start` ('MM-DD',
  default '01-01'), `hv_expected_month`, `in_portfolio_since` (SETTLEMENTS-RENTALS.sql:22-24), `grundsteuer_months`,
  fallback plan values `def_hausgeld`, `def_grundsteuer`, `def_rate`, `def_zinsen` (controlling-tab-setup.js:150, :162).
  No SQL in the repo creates the table.
- The 10 properties (SETTLEMENTS-RENTALS.sql:58-60, purchase order): 1 Kostheim · 2 Kaiserstr. WHG 507 · 3 Campo Novo ·
  4 Kaiserstr. WHG 516 · 5 Kaiser-W-R 17 · 6 Wallaustr. 44 · 7 Casa Castel · 8 Adam-K-S. 1-3, WHG 08 · 9 Adam-K-S. 1-3,
  WHG 10 · 10 Studio One. Every non-Casa one has a Hausverwaltung (SETTLEMENTS-RENTALS.sql:43-52) → WEG apartments.
  NK periods: Kostheim starts 07-01, all others 01-01 (SETTLEMENTS-RENTALS.sql:34-36).
- Links: `ctlPropLinks(p)` (controlling-soll.js:214-225): apt = `rentals_apartment_ref`, else (only for id ≠ 7) the
  apartment with the same normalised name (`_cxNorm`, :197); loan = `loan_ref`, else same name.
  Purchase date = `properties.kaufdatum` of the linked loan (`ctlPropSince` :228-232); nothing before it.
- Maintenance's own copy: `mtSbApt(c)` (maintenance.js:2420-2425): `rentals_apartment_ref`, else same name (no id ≠ 7 guard).

### 1b. `properties` (Properties app = loans/portfolio)
- Fields: `id, name, sort_order, addr, cat, m2, kaufdatum, bank, zinssatz, rate, tilgung, zinsen, restschuld, zb, zb_status, sparv`
  (properties-portfolio.js:31-60). `cat` is display only, from `CAT_OPTIONS` (properties-portfolio.js:207-211:
  1–4-Zimmer-Wohnung, Studio / Appartement, Einfamilienhaus, Mehrfamilienhaus, Doppelhaushälfte, Reihenhaus,
  Wohngemeinschaft, Gewerbeeinheit, Gemischte Nutzung) — **no logic reads it** (grep: only properties-*.js).
  Only `kaufdatum` matters elsewhere (Controlling, Settlements, cc-nk-settle.js:72-83).

### 1c. `rentals_apartments` (Rentals › Apartments)
- Fields used: `id, name, adresse, plz_ort, wohnungsnummer, flaeche_m2, zimmer_type ('1 Zimmer'…'4 Zimmer' | 'Gewerbefläche',
  rentals-tab-apartments.js:1110-1112), unterschrift_ort, vacant, heizungsart, energie*`.
  Gewerbe = `zimmer_type === 'Gewerbefläche'` (rentals-tab-apartments.js:933-934; Gewerbemietvertrag).
- Satellites: `rentals_verwaltung` (apartment_id, hausverwaltung, hv_email, hv_telefon, hausgeld_mtl, grundsteuer_mtl),
  `rentals_pricing` (apartment_id, kaltmiete, nk_pauschale/nebenkosten, kurzzeit_*), `rentals_hausgeld_history`,
  `rentals_zaehler` (meters), `rnt_staffelmiete_history`, `rnt_nk_vorauszahlung_history`, `rnt_kaution`.

### 1d. `ctrl_units` (Controlling units of a property)
- Fields: `id, property_id, name, unit_type, sort_order, source_type, source_ref, def_kaltmiete, def_nebenkosten`
  (controlling-data.js:32, controlling-tab-setup.js:110-112, :307).
- `unit_type` values in code: `'Zimmer'` (Casa virtual units, controlling-soll.js:279; income tab default
  controlling-tab-income.js:178), parking types (`rentals_parking.parking_type` e.g. 'Tiefgarage'/'Stellplatz', else
  'Stellplatz', controlling-tab-setup.js:306-307); anything else typed in Setup. Parking test is a regex on
  `unit_type + name`: `/garage|stellplatz|\btg\b/i` (`_cxIsParking` controlling-soll.js:211). There is no 'Apartment'
  constant — a non-parking unit of a non-Casa property is "living" (Setup heading "Apartment(s)", controlling-tab-setup.js:167).
- `source_type` values: `'rentals_apartment'` (ref = rentals_apartments.id), `'rentals_parking'` (ref = rentals_parking.id),
  `'casa_room'` (ref = rooms.id since CONTROLLING-ROOM-IDS.sql:5-15; old rows: room name) — controlling-soll.js:244-251.
- `ctlUnitLink(u, p)` (controlling-soll.js:242-266): saved source wins; else parking by name (:255-259); Casa room by name
  (:260-263); **non-Casa: auto link to the property's apartment only if the property has exactly ONE living unit** (:264-266).
- `ctlUnitsFor(pid)` (controlling-soll.js:272-281): the units in sort order; Casa adds virtual units for rooms without a
  unit (`unit_type 'Zimmer'`, `source_type 'casa_room'`).

### 1e. Casa: `rooms` + `tenant_records`
- `rooms`: `id, name, active, vacant, sort_order, flaeche_m2, pricing fields` (tab-rooms.js:796-830). Names in
  constants.js:18. Maintenance keeps names only (`MT.rooms`, maintenance.js:313-318).
- `tenant_records`: `room` (room NAME), `status` active|former|archived, `contract_type` jahres|mietvertrag|kurzzeit,
  `mietbeginn`, `mietende`, `vertragsbeginn`, `vertragsende`, `rent_from`/`rent_until`, `kaltmiete`, `nebenkosten`, names
  (_2/_3), `address`… Dates ISO or TT.MM.JJJJ.

### 1f. Rentals: `rnt_tenant_records`
- Insert payload rentals-tab-tenants.js:3274-3299 (new) and :3769-3784 (former):
  `apartment_id` **or** `parking_id` (one is null), `status`, `contract_type` ('mietvertrag' default | 'kurzzeit'),
  `first_name, last_name` (+ `_2`, `_3`, each with email/phone/birthday/address), `email, phone, birthday, address`,
  `mietbeginn`, `mietende`, `vertragsbeginn`, `vertragsende`, `rent_from`/`rent_until` ('contract' | 'move'),
  `kaltmiete`, `nebenkosten` (apartments only, null for parking), `kaution_soll`, `done`, `created_at`, `id`.
- **Status**: `'active'` (new, mietende not past), `'former'` (mietende ≤ today: :3271; occupancy sync :2137;
  reopen :3819), `'archived'` with `done:true` (:3810, :3828).
- **Date format**: the app writes ISO `YYYY-MM-DD` (`_rntParseDate` rentals-tab-tenants.js:899-905 converts TT.MM.JJJJ);
  older rows may be text → always normalise with `_cxD` (controlling-soll.js:199-209) / `ccParseDate` / `mtIso`.
- Rent mode per day: `rent_periods` (UPDATE.sql:7-18: `app 'rentals'`, `tenant_id` text, `valid_from`, `mode`
  'pauschal'|'kalt_nk', `pauschale`, `kaltmiete`, `nebenkosten`, `contract_type`, `contract_end`). Without a rent
  period a Rentals tenancy is always Kalt + NK (`_cxLegacyMode` returns 'kalt_nk' for non-Casa, controlling-soll.js:559-560).

## 2. How a Maintenance case links to units and tenants

- `maint_cases.property_id` → `ctrl_properties.id` (re-linked by name in MAINTENANCE-D1.sql:3-7; the comment
  "properties.id" in MAINTENANCE.sql:7 is outdated). `property_name` keeps the name. `area` is free text
  ("Kaiser-W-R 17 · Balkon" = property name + area, `mtWhere` maintenance.js:323-328: the room part is Casa only).
- `report_room` (MAINTENANCE-D5.sql:15) is set only for Casa (Zimmer name or `__gemeinschaft__`); the room box is
  hidden for non-Casa (`mtSbVis` maintenance.js:2390-2396).
- **Canonical chain (Controlling / Settlements)**: `p = ctrl_properties[case.property_id]` → `ctlUnitsFor(p.id)` →
  for each unit `ctlUnitLink(u, p)` → `{type: rentals_apartment | rentals_parking | casa_room, ref, obj}` →
  `_cxTenancies(link)` (controlling-soll.js:530-556).
  Settlements Rentals skips parking units (`_srItemsFor` settlements-tab-rentals.js:873-875, `ctlTenanciesFor`
  controlling-soll.js:1265-1267).
- **What Maintenance does today (non-Casa)**: the Schadensbericht's Mieter only (`mtSbTenant` maintenance.js:2434-2449):
  `mtSbApt` → `rnt_tenant_records.apartment_id`, plain date overlap on `case_date`, newest move-in wins; **ignores
  ctrl_units, parking units, the former-without-mietende rule**. Maintenance does **not** load controlling-soll.js
  (maintenance.html:19-104), so `ctlUnitLink` / `_cxTenancies` are not available there; D39 wrote a mirror for Casa
  (`mtWhoWins` maintenance.js:3420-3432) that reads `tenant_records(room,status,mietbeginn,mietende)` only
  (`mtWhoLoad` :3361-3372).
- **Several units per property?** Possible in the schema: a property may have several `ctrl_units`, each linked to its
  own rentals apartment (`source_type 'rentals_apartment'`) or parking space, each with its own tenants; Setup says
  "Apartments" when > 1 (controlling-tab-setup.js:167); `_srAptOf(c, t)` uses the tenant's own apartment
  (settlements-tab-rentals.js:181-184). But the Rentals NK is **one HV record per property + period**
  (`nk_abrechnung_rentals_uq (property_id, period_from)`, SETTLEMENTS-RENTALS.sql:13) with one `c.apt`
  (`_srYearModel` :904-916), every stay gets `unit amount × own days / period days` (`_srCalc` :258-325) — so two
  flats in one property would each be charged the whole Wohnung's costs. **In practice: one property = one Wohnung**
  (+ optional parking: e.g. Studio One has TG 1–3 and SP 1–2, rentals-tab-parking.js:1509-1515). Two flats in one house
  are two properties ("Kaiserstr. WHG 507" / "516", controlling-tab-setup.js:1-3).
- **WEG apartment vs whole house**
  - Casa (whole house, sole owner): costs are the owner's provider contracts (`ctrl_expense_castel` by
    `ctrl_castel_categories`) + one-offs (`nk_umlage`); split by Kostenquote over all Zimmer tenants
    (nk-casa-engine.js `quota`); the Gemeinschaftsräume are the landlord's, so § 7 Kleinreparatur/Schaden on them is
    shared by the rented Zimmer (cc-contract-master.js:341). No WEG (ctlTenanciesFor adds `weg_hausgeld` only for non-Casa, :1263).
  - WEG Wohnung: the owner pays Hausgeld to the WEG via the HV (`rentals_verwaltung.hausgeld_mtl`,
    `ctrl_expense_apartments`); the tenant's NK = umlagefähige positions of the HV's Hausgeldabrechnung (keys Wohnfläche,
    MEA, Einheiten, Personen, Verbrauch, direkt; settlements-tab-rentals.js:46-85) + NK-only items (Grundsteuer,
    one-offs marked NK, `_srAutoNkItems` :1001-1022). Repairs of Gemeinschaftseigentum are the WEG's
    (Instandhaltung / Rücklage = nicht umlagefähig, SR_KINDS :73-76). There is **one tenant party per unit** — no
    "Gemeinschaftsfläche ÷ n rented Zimmer"; a Maintenance receipt there is Sondereigentum (e.g. Balkon, inside the
    Wohnung) or tenant-caused damage.

## 3. "The tenant of this unit on date X" (Rentals)

Tables: `ctrl_properties` (rentals_apartment_ref) · `ctrl_units` (property_id, name, unit_type, source_type, source_ref) ·
`rentals_apartments` / `rentals_parking` (id) · `rnt_tenant_records` (apartment_id | parking_id, status, mietbeginn,
mietende, vertragsbeginn, vertragsende, rent_from, rent_until, kaltmiete, nebenkosten, contract_type, names, created_at) ·
`rent_periods` (app 'rentals', tenant_id = rnt_tenant_records.id as text, valid_from, mode).

Rule = `_cxTenancies(link)` (controlling-soll.js:530-556), the same for Casa and Rentals:
1. `list` = `rntTen.filter(t => String(t.apartment_id) === link.ref)` (or `parking_id` for parking).
2. `from = _cxD(mietbeginn)`; no move-in → no window (flagged `noStart`).
3. `to = _cxD(mietende)`; empty: `status === 'active'` → `'9999-12-31'`; otherwise (former, archived) → the day before
   the next dated move-in in that unit, else today (`noEnd`).
4. Inside: `from ≤ X ≤ to` (string compare of ISO dates). Move-in and move-out day both count; on a handover day two
   tenants can match (Controlling: "two at once = double rent").
5. Rent window `payFrom/payTo` (contract dates unless `rent_from/rent_until === 'move'`) is for rent only; Settlements
   and Teil B use the move dates.
6. Kalt + NK vs Pauschal on X: `_cxRentDay(...).mode` (controlling-soll.js:626-650) from `rent_periods`; Settlements
   splits a tenant into spans with `note 'Pauschal'` (`_srItemsFor` :877-888). Pauschal spans get no letter
   (`_srTenInfo` :952-962: kind 'pausch').

Maintenance-side equivalent (no controlling-soll.js there): load `ctrl_units` (property_id, name, unit_type, source_type,
source_ref, sort_order), `rentals_apartments` (id, name), `rentals_parking` (id, name), `rnt_tenant_records`
(id, apartment_id, parking_id, status, mietbeginn, mietende, kaltmiete, contract_type, first_name, last_name) and
reproduce `ctlPropLinks` + `ctlUnitLink` + steps 1-4 (generalise `mtWhoWins` from "room name" to "unit link").
Settlements Rentals has it all already (`window._src.rntTen`, `ctlUnitsFor`, `_cxTenancies`).

## 4. Which properties have an NK settlement, and where

| Where | Who | Table | Code |
|---|---|---|---|
| Settlements › Casa Castel | property 7 only | `nk_abrechnung_casa` (1 row / year, `tenants` jsonb, `snapshot`, `locked_at`) | settlements-tab-casa.js; engine nk-casa-engine.js |
| Settlements › Rentals | every `ctrl_properties.active && id ≠ 7`, from the purchase date | `nk_abrechnung_rentals` (property_id, apartment_id, period_from/to, positions, keys, tenants, WEG fields) | `_srYearModel` settlements-tab-rentals.js:904-916 |
| Settlements › Rentals (WEG) | same properties, owner ↔ WEG | `ctrl_settlements kind 'weg_hausgeld'` | `_srItemsFor` :871, `_srWriteWeg` :561 |
| Settlements › Dashboard (manual) | any property, typed by hand | `nk_abrechnung_manual` (SETTLEMENTS-PHASE6-7.sql:4-29) | settlements-tab-dashboard.js:1-18 |
| none | parking units, Pauschal / Kurzzeit spans, unlinked units | — | ctlTenanciesFor :1265-1268, `_srTenInfo` :953 |

- Tabs: Dashboard · Casa · Rentals (settlements-app.js:6-7, :18, :90-93). 'tracking' is only the boot-error fallback
  (:52-56); `srOpenFromTracking` is a stub (settlements-tab-rentals.js:2070).
- Results go to `ctrl_settlements` (nk_tenant, per tenant + span) + `abr_results` (kind nk_tenant, app casa|rentals) for
  both tabs (`scSend` settlements-tab-casa.js:2575; `_srSend` settlements-tab-rentals.js:805-857). Tenant cards
  only show them (cc-nk-settle.js, landlord.html:154 and rentals-index.html:118).
- Maintenance → Rentals NK today: a Maintenance line with `nk_umlage` (Controlling's switch, kept on conflict by
  MAINTENANCE-D39.sql:232-235, remembered via `nk_keep` :126-135, :213-215) is loaded as `SR.nkOt`
  (settlements-tab-rentals.js:120-127) and becomes an auto "NK only" position `kind 'sonst'`, `key 'direkt'`,
  label = line item, sign by direction (`_srAutoNkItems` :1014-1020), synced into `rec.positions`
  (`_srNkAutoSync` :1024-1050; frozen once any tenant's letter went out :1031). Split by days (`_srCalc`).
  `nk_category_id` is ignored for Rentals (cost types are Casa-only: `_cxOtNkCatHTML` controlling-tab-onetime.js:831).

## 5. Table · property type → unit model → tenant source → NK settlement → letter generator

| Property type | Unit model | Tenant source (on date X) | NK settlement | Letter generator |
|---|---|---|---|---|
| **Casa Castel** (id 7, whole house, Zimmer) | `rooms` (by name) ↔ `ctrl_units` `casa_room` (ref = rooms.id) + virtual units (controlling-soll.js:242-281) | `tenant_records.room` normalised, `_cxTenancies` (:530); Maintenance mirror `mtWhoWins` (maintenance.js:3420) | Settlements › Casa: `scInputFor` (settlements-tab-casa.js:243) → `NkCasa.calc/quota` → `scModel` (:397) + Teil B `scLoadTeilB` (:116) / `scTeilBPos` (:321) / `scTeilB` (:361); store `nk_abrechnung_casa`, lock `scLock` (:2506) | `scLetterData` (:2162) + `scLetterLayout` (:2265) + `scLetterTeilB` (:2296) → `nkLetterHtml`/`nkLetterPdf` (nk-letter.js:157, :292); `du`, "Casa Castel · Zimmer X", § 7 |
| **WEG Wohnung** (all other properties, e.g. Kaiser-W-R 17) | 1 living `ctrl_units` row → `rentals_apartment` (explicit source, or auto when it is the only living unit; property link `rentals_apartment_ref`) | `rnt_tenant_records.apartment_id`, `_cxTenancies`; spans Kalt+NK / Pauschal via `rent_periods` (`_srItemsFor` :868) | Settlements › Rentals: `_srYearModel` (:904) → `_srCardInfo4` (:985) → `_srCalc` (:258, days share of the HV positions + auto NK items); store `nk_abrechnung_rentals`; no lock — frozen per tenant once sent (`st.res`) | `_srLetterData` (:745) → `srLetterHtml` (:776) → `nkLetterHtml`, rendered by `_srLetterBlob` (:704, own flow + numbering, NOT `nkLetterPdf` → no `data-pgref` fix-up); Sie-form (`du:false`), header apt name + "Wohnung <nr>", 1 page, no Belegliste (`extra:null`) |
| **Gewerbefläche** (a Rentals apartment with `zimmer_type 'Gewerbefläche'`) | as WEG Wohnung | as WEG Wohnung | as WEG Wohnung | as WEG Wohnung |
| **Parking** (Stellplatz / TG of any property, incl. Casa) | `ctrl_units` `rentals_parking` → `rentals_parking` (name, parking_type, property_ref) | `rnt_tenant_records.parking_id`, `_cxTenancies` | **none** (skipped: controlling-soll.js:1265-1267, setup "no NK" controlling-tab-setup.js:192) | none (only the Parking contract / Übergabe PDFs) |
| **Property without a Rentals link** | unlinked `ctrl_units` (plan values) | none → unit row with `tenant_id null` (ctlTenanciesFor :1268) | listed as 'unlinked', not calculated (`_srTenInfo` :953) | none |
| **Anything, by hand** | — | typed name/address | Dashboard manual (`nk_abrechnung_manual`) | `sdLetterData` → `nkLetterPdf` (settlements-tab-dashboard.js:692, :706) |

## 6. Contract rules for Kleinreparatur (per property kind)

- Casa Mietvertrag § 7 (cc-contract-master.js:341): ≤ 150 € per case, ≤ 8 % Jahresmiete; Gemeinschaftsräume shared by the
  rented Zimmer. (D39 uses kaltmiete × 12, settlements-tab-casa.js:311.)
- Rentals Mietvertrag + Kurzzeit § 8 (rentals-contract-text.js:108-114, :130): ≤ 150 € per case, ≤ 8 % of the
  **Jahresnettokaltmiete**, or of the **Jahrespauschalmiete** when the contract has no separate Kaltmiete. No
  Gemeinschaft clause.
- Gewerbemietvertrag (rentals-gewerbe-mietvertrag.js:441-446, § number dynamic `P.klein` :301): ≤ **200 €** per case,
  ≤ 8 % Jahresnettokaltmiete; Glasversicherung on the tenant (:450).
- Parking contract: no Kleinreparatur clause; Schäden the tenant is liable for may be taken from the Kaution
  (rentals-parking-mietvertrag.js:379) → Schaden only.

## 7. Implications for "copy this function" (input for the build plan)

1. **Payer resolution must become unit-based**: Casa = rooms; others = the units of the property
   (`ctlUnitsFor` incl. parking). One living unit and no parking → no chips at all (the Wohnung is implied);
   Studio One → chips "Wohnung · TG 1 · TG 2 · TG 3 · SP 1 · SP 2". `pay_where 'gemein'` makes sense only for Casa
   (WEG Gemeinschaftseigentum is the WEG's); for Rentals Schaden "caused by" = unit(s). Store a stable unit key
   (e.g. `apt:<id>` / `pk:<id>` or the ctrl_units id) rather than a name in `pay_rooms`, or keep names and resolve.
2. **Tenant lookup in Maintenance** needs new loads (ctrl_units, rentals_apartments, rentals_parking, rnt_tenant_records
   incl. apartment_id/parking_id) and a generalised `mtWhoWins` (unit link instead of room name). `mtSbTenant` stays
   inconsistent unless also switched.
3. **NK (Teil A) path for Rentals exists already** (nk_umlage → `SR.nkOt` → auto position). Moving ownership to
   Maintenance = `maint_book_line` sets nk_umlage from pay_type for every property (drop the `casa` special case at
   MAINTENANCE-D39.sql:210-219, :232-235; migrate existing Controlling switches into pay_type='nk' like the D39 Casa
   migration) and Controlling's switch read-only for all Maintenance lines (`_cxOtNkFixed`
   controlling-tab-onetime.js:93 is Casa-only; `_cxOtNkYear` :100-104 is Casa-only). Cost type: Rentals NK has no
   cost-type ids (SR_KINDS text keys; `_srAutoNkItems` uses 'sonst'); `pay_cat` (bigint → ctrl_castel_categories)
   does not fit — either no cost-type chips for Rentals, or a new text field / mapping onto SR_KINDS.
4. **Teil B for Rentals** has to be built into settlements-tab-rentals.js: load receipts of that property
   (`maint_cases.property_id = p.id`) in the tenant row's own span, tenant = the Kalt + NK row (`it.r`, tenant_id,
   period_from ≤ date ≤ period_to, not Pauschal, not 'nicht durchgeführt'); `x.saldo = A + B1 + B2` in `_srCalc`
   (feeds `_srSend` amount/direction → ctrl_settlements + abr_results); § 8 cap per tenant (8 % × 12 × Kaltmiete or
   Pauschale; Gewerbe 200 € threshold); freeze the positions when the letter is sent (Rentals has no lock: store e.g.
   `rec.tenants[tid].teilB` ids, which also gives Maintenance its "billed / locked" check, read from
   `nk_abrechnung_rentals`). Note: a Rentals tenant is only calculated after the HV statement is complete
   (`_srCardInfo4` :985-993, `sumOk` :989) — Teil B "with NK-Abrechnung" waits for the HV, possibly a year+.
5. **Letter**: `srLetterHtml` can pass `teilB` to `nkLetterHtml` (already generic, nk-letter.js:20-26); texts must be
   Sie-form, "<apt name> · Wohnung <nr>" (or "Stellplatz …"), § 8 Mietvertrag (Gewerbe: § P.klein, 200 €), row sub
   "Ihre Wohnung · Anlage n". `_srLetterBlob` must add the `data-pgref` page fix-up (or call `nkLetterPdf`).
6. **NK year** per property: `ctlPeriodOf(p, date)` with that property's `nk_period_start` (Kostheim 07-01) — Maintenance's
   `mtWhoYear` (maintenance.js:3457) and Controlling's `_cxOtNkYear` read Casa only.
7. **Direct** (refund income line) is property-agnostic in SQL apart from the `casa` guard (MAINTENANCE-D39.sql:241);
   it is the only way for parking and Pauschal tenants (no NK letter).
8. Gates that say Casa only today: `mtWhoOn` (maintenance.js:3358), `scLoadTeilB` filters property 7
   (settlements-tab-casa.js:129), SQL `casa` variable (MAINTENANCE-D39.sql:120), Controlling `_cxOtNkFixed`/`_cxOtNkYear`,
   D39 migration and checks (:55, :73-77, :336-351).
