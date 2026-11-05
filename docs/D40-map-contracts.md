# MAP 3 · Contract terms per property type (Kleinreparatur · Schaden · Betriebskosten · Where)

Read-only map of /home/user/Casa-Castel at HEAD 8571afb (D39 included). Line numbers are for the current files.
Git history of the contract files starts at one upload commit (15e3648, 2026-10-15), so older clause wordings
cannot be recovered from the repo.

## 0. Short answer

- There are **5 contract templates** in the code. All tenant-facing text is German.
  | Template | File | Used for |
  |---|---|---|
  | Casa master (kurzzeit / jahres / mietvertrag) | cc-contract-master.js | Casa Castel Zimmer (property 7) |
  | Rentals Mietvertrag (Wohnung) | rentals-mietvertrag.js + shared §§ in rentals-contract-text.js | every non-Casa apartment, `zimmer_type` ≠ 'Gewerbefläche' |
  | Rentals Kurzzeitmietvertrag (Wohnung) | rentals-kurzzeit.js + rentals-contract-text.js | same apartments, fixed stay |
  | Gewerbemietvertrag | rentals-gewerbe-mietvertrag.js | apartments with `zimmer_type === 'Gewerbefläche'` |
  | Parking Mietvertrag | rentals-parking-mietvertrag.js | Stellplatz / TG (`rnt_tenant_records.parking_id`) |
- Kleinreparatur terms:
  - Casa § 7: 150 € per case, cap 8 % of the Jahresmiete.
  - Rentals Wohnung § 8 (Mietvertrag and Kurzzeit): 150 € per case, cap 8 % of the Jahresnettokaltmiete. A
    Pauschal contract uses the Jahrespauschalmiete as the base.
  - Gewerbe: 200 € per case, cap 8 % of the Jahresnettokaltmiete. The § number is § 6, or § 7 with Staffelmiete.
  - Parking: no clause at all.
- Over the per-case limit the tenant pays nothing in every template. This is the correct rule: a
  Selbstbeteiligung on bigger repairs is not allowed.
- "Gemeinschaftsfläche ÷ rented units" is only covered by contract text in **Casa** (§ 7, last sentence). The
  Rentals § 8 and the Gewerbe clause have no such sentence. In a WEG Wohnung, repairs of the
  Gemeinschaftseigentum belong to the WEG (Hausgeld / Erhaltungsrücklage). They are never a Kleinreparatur and
  never NK.
- **Old contracts exist.** Tenants entered by hand or migrated have rent periods with `source 'tenant_form'` or
  `'migration'`, not `'generator'`. The app cannot know their clause, so the terms must be configurable per
  tenant. Proposal in § 5: three nullable columns, with the template value as the default and an amber
  "assumed" hint for tenants that have no contract made by the app.

## 1. The clauses, verbatim locations

### 1a. Casa Castel master (cc-contract-master.js). One text for kurzzeit, jahres and mietvertrag.
| Topic | Line | Content |
|---|---|---|
| § 7 Kleinreparaturen | :341 | "…an Gegenständen, die dem häufigen Zugriff des Mieters unterliegen, trägt der Mieter bis 150 € pro Einzelfall, höchstens jedoch 8 % der Jahresmiete pro Jahr. Übersteigen die Kosten einer einzelnen Reparatur 150 €, trägt der Mieter keinen Anteil. Für solche Gegenstände in den Gemeinschaftsräumen gilt dasselbe; die Kosten werden zu gleichen Teilen auf die Mieter der vermieteten Zimmer verteilt." |
| Gemeinschaftsbereiche | :306 | Right to co-use the listed Gemeinschaftsbereiche (`room.gemeinschaftsraeume`). The tenant must treat the Zimmer and the Gemeinschaftsflächen properly and report Mängel. |
| § 6 Kaution / Schäden | :340 | "Vom Mieter selbstverschuldete Schäden werden zu 100 % von der Kaution abgezogen." |
| § 12 Haftpflicht | :346 | The tenant must hold a private Haftpflichtversicherung. |
| Betriebskosten / Umlageschlüssel | :277 (list), :294-298 | Kalt + NK: "Betriebskosten … durch die Summe der von allen Mietern bewohnten Monate geteilt (Ein- und Auszugsmonat tageweise)". Pauschal: everything included, "keine gesonderte Umlage oder Nachforderung". |
| § 3 Miete Pauschal | :332 | Pauschalmiete includes all NK. |
| D39 implementation | settlements-tab-casa.js:308-311 (rent12 = tenant_records.kaltmiete × 12), :336 (> 150 € → skip), :383-386 (8 % cap row), :2315 letter "§ 7 Mietvertrag · bis 150 € je Fall", :2319-2320 legal note; maintenance.js:3356 `MT_WHO_MAX = 150`, :3507, :3614 | |

### 1b. Rentals Wohnung: Mietvertrag and Kurzzeit share §§ (rentals-contract-text.js)
| Topic | Line | Content |
|---|---|---|
| § 2 Nutzung | :47-51 | The tenant treats the Wohnung **and the Gemeinschaftsflächen** carefully and reports Mängel. With several tenants: "Mehrere Mieter haften als Gesamtschuldner". |
| § 7 Kaution | :96-100 | Barkaution on a Kautionskonto (§ 551), "Rückzahlung nach Prüfung des Zustands bei Auszug". No damage sentence (unlike Casa § 6). |
| **§ 8 Kleinreparaturen** | :108-114 (list entry :130) | "Die Kosten für kleine Instandhaltungen an Gegenständen, die dem häufigen Zugriff des Mieters ausgesetzt sind (Installationsgegenstände für Elektrizität, Wasser und Gas, Heiz- und Kocheinrichtungen, Fenster- und Türverschlüsse), trägt der Mieter bis 150 € im Einzelfall, höchstens 8 % der **Jahrespauschalmiete** \| **Jahresnettokaltmiete** pro Jahr. Übersteigen die Kosten einer einzelnen Reparatur 150 €, trägt der Mieter keinen Anteil." The cap base is Pauschal vs Kalt from `pausch` (:110): for Kurzzeit `kzMode`, for Mietvertrag `pricingMode`. **No Gemeinschaftsflächen sentence.** |
| § 12 Haftpflicht | :134 | Private Haftpflichtversicherung. |
| Betriebskosten (Mietvertrag) | rentals-mietvertrag.js:417-438 (full §§ 1, 2 BetrKV list), :468-472 | "Umlageschlüssel: wie in der Jahresabrechnung der Eigentümergemeinschaft (§ 556a Abs. 3 BGB), sonst nach Wohnfläche; verbrauchsabhängige Kosten nach Verbrauch. Heizung und Warmwasser … Heizkostenverordnung." New Betriebskosten may be added. |
| Betriebskosten (Kurzzeit) | rentals-kurzzeit.js:303-324, :403-407 | Same key for kalt_nk. Pauschal: "sämtliche … Betriebskosten … bereits enthalten. Eine gesonderte Umlage oder Nachforderung erfolgt nicht". |
| Pricing mode | rentals-mietvertrag.js:47-58; rentals-kurzzeit.js:41-47 | 'kalt_nk' \| 'pauschal' |

**Side finding (contract text, not D39):** in the Rentals **Mietvertrag** the Betriebskosten block is always the
Kalt + NK wording ("Neben der Kaltmiete trägt der Mieter anteilig…", rentals-mietvertrag.js:471, page 2 :527). This
holds even when `pricingMode === 'pauschal'`, where § 4 says "Pauschalmiete … inkl. Nebenkosten"
(rentals-contract-text.js:74). Kurzzeit switches the wording correctly (rentals-kurzzeit.js:404-406). By
§ 305c Abs. 2 BGB this unclear text is read in the tenant's favour, so assume no NK settlement for a Pauschal
Mietvertrag. Worth fixing separately.

### 1c. Gewerbemietvertrag (rentals-gewerbe-mietvertrag.js)
| Topic | Line | Content |
|---|---|---|
| § numbering | :296-304 | `_pn = 2`. Without Staffel: Kaution § 3, Aufrechnung § 4, Nebenkosten § 5, **Kleinreparaturen § 6**, Haftpflicht § 7, Instandhaltung § 8. With Staffel everything moves +1 (Kleinreparaturen **§ 7**). The paragraph number is therefore **per contract**, not per template. |
| **Kleinreparaturen** | :441-442 | Installationsgegenstände (Elektrizität, Wasser, Gas), Heizung, Kocheinrichtungen, Fenster- und Türverschlüsse, Griffe "soweit diese seinem direkten Zugriff unterliegen, bis zu einem Betrag von **200,00 € je Einzelfall**. Die Gesamtbelastung … ist auf **8 % der Jahresnettokaltmiete** begrenzt. Übersteigt eine Reparatur den vorgenannten Einzelbetrag, trägt der Vermieter die vollständigen Kosten." No time unit is stated for the cap; read it as per year. |
| Instandhaltung | :447-453 | (1) The landlord bears Dach und Fach, structure, Fenster/Verglasung as a building part, and supply lines outside the Mietfläche. (2) The tenant bears **laufende Wartung und Pflege** of the sanitary items inside the Mietfläche. Repairs fall to the tenant only within the Kleinreparatur clause, unless the tenant, its staff, customers or visitors caused the damage. (3) **Glasversicherung** for all glazing at the tenant's cost; glass breakage regardless of cause goes through it. Culpable damage to windows is the tenant's. (4) Bausubstanz, anfängliche/verdeckte Mängel and Alterung are excluded. The tenant must prove an initial defect via the Einzugsprotokoll. (5) **Wartung** of Anlagen serving only the Mietfläche is at the tenant's own cost. (6) Damage must be reported. |
| Haftpflicht | :444-445 | Betriebshaftpflicht of at least 3.000.000 €. |
| Nebenkosten | :259-283 (list incl. **Verwalter-Vergütung :268, Erhaltung Allgemein :274**), :434-439, :515 | Verwaltungskosten may be passed on in Gewerbe. The list is "abschließend". Key (3) :437: consumption by meter, the rest by **Nutzfläche ÷ Gesamtnutzfläche** of the building. No antenna and no lift costs (:436). |
| Rückgabe | :471-472 | Damage beyond normal wear is removed at the tenant's cost. |

### 1d. Parking (rentals-parking-mietvertrag.js)
- No Kleinreparatur and no NK clause. Rent only.
- § 5 Haftung (:373-374): the landlord is not liable for the car.
- Kaution (:377-379): "Schäden, die der Mieter zu vertreten hat, können von der Kaution abgezogen werden."
- Stellplatzordnung § 6 Haftung (:440-441).
- No NK settlement exists for parking (controlling-soll.js:1265-1267; see MAP 1).

## 2. How the app knows a tenant's contract (and that it may be old)

- Contract **type** per Rentals tenancy: `rntContractType(rec)` (rentals-tab-tenants.js:2061-2065). It reads the
  latest `rent_periods.contract_type` ('mietvertrag' | 'kurzzeit'), else `rnt_tenant_records.contract_type`.
  **Gewerbe** is not a type: it is `rentals_apartments.zimmer_type === 'Gewerbefläche'` (`_rntHasCt` :2051,
  cc-contract-flow.js:120-124). Parking = `parking_id`.
- Pricing mode on a day: `rent_periods.mode` 'pauschal' | 'kalt_nk' (UPDATE.sql:7-18). Without a period the mode
  is Kalt + NK (`_cxLegacyMode`, controlling-soll.js:559-560).
- **Was the contract made by the app?** `rent_periods.source`:
  - `'generator'`: made by the contract flow (cc-contract-flow.js:1165, :1168, kind 'contract').
  - `'renew'`: a renewal, also generated (:1155).
  - `'tenant_form'`: typed in on the tenant card (rentals-tab-tenants.js:3429-3430).
  - `'migration'`: migrated, "Miete vom Mieter übernommen" (cc-rent-engine.js:157-160).
  - Also usable: a 'mietvertrag' document in `rnt_tenant_documents` with variant 'unsigned' is only written by
    the generator (cc-contract-flow.js:1027). A tenant with only a 'signed' upload has an outside or old contract.
- Conclusion: **old contracts exist** for every tenant without a 'generator' or 'renew' period. This includes
  Casa tenants (`tenant_records`, kind 'migrated' in tab-tenants.js:845, :2005). For them the 150 € / 8 % rule is
  an **assumption**: the old clause may name another amount, a fixed € cap, or no Kleinreparaturklausel at all.

## 3. Legal frame (Wohnraum unless noted)

- **§ 535 Abs. 1 S. 2 BGB**: the landlord must keep the Mietsache in good order (Instandhaltung /
  Instandsetzung). A tenant pays for repairs only on a valid contract clause (Kleinreparatur) or as
  Schadensersatz.
- **§ 538 BGB**: wear from normal use is not the tenant's.
- **Kleinreparaturklausel case law** (AGB control, § 307 BGB): BGH 07.06.1989 – VIII ZR 91/88 (BGHZ 108, 1) and
  BGH 06.05.1992 – VIII ZR 129/91 (BGHZ 118, 194). A clause is valid only if all of these hold:
  1. It covers only items under the tenant's **frequent and direct access**. The usual list follows § 28 Abs. 3
     II. BV, and the Rentals § 8 and Gewerbe clauses copy it.
  2. It has a **per-case limit**. Instanzgerichte have accepted about 75–120 € in the past, and 100–150 € is
     the range quoted today. **150 € is at the upper edge**, which is a risk.
  3. It has a **yearly cap**, accepted as 6–8 % of the Jahres(netto)kalt­miete or a fixed €.
  4. It only shifts **costs** (Kostentragung). A clause that makes the tenant carry out or commission repairs
     (Vornahmeklausel) without limits is invalid.
  5. **No share** of bigger repairs is passed on: over the limit the tenant pays nothing. All templates
     do this, and D39 follows it.
  - An invalid clause is void as a whole. There is no geltungserhaltende Reduktion (§ 306 BGB), so the tenant
    then pays nothing. This is why the terms must be per tenant for old contracts.
  - Casa § 7 names no items ("Gegenständen, die dem häufigen Zugriff des Mieters unterliegen"). It is valid in
    substance but less transparent than the Rentals list (§ 307 Abs. 1 S. 2 BGB). This is a small risk.
- **Which amount is compared with the limit**: the invoice the landlord paid, **including USt** (the tenant's
  cost), after credit notes. D39's "NET" means receipt − returns, not net of VAT. That is right for Wohnraum. For
  Gewerbe with a USt option (§ 9 UStG, rentals-gewerbe-mietvertrag.js:474-476) the landlord deducts Vorsteuer,
  so the net amount is the cost: decide this with the Steuerberater. Default: keep gross.
- **"Jahresmiete" for the cap**: Casa § 7 says "Jahresmiete" and Rentals § 8 says Jahresnettokaltmiete (or
  Jahrespauschalmiete). An unclear wording is read in the tenant's favour (§ 305c Abs. 2 BGB), so the Casa cap
  is taken on the Kaltmiete. D39 does this (settlements-tab-casa.js:308-311). "Pro Jahr" with a partial or
  Staffel year: the tenant-friendly, defensible base is the **Kaltmiete actually owed in the NK period**
  (pro rata, Staffel-aware via rent_periods / `_cxRentDay` controlling-soll.js:626-650). D39 Casa uses
  kaltmiete × 12 from the tenant record: no Staffel, no pro rata. That is acceptable but generous. Align both
  when Rentals is built.
- **§ 556 BGB / BetrKV**: only Betriebskosten agreed in the contract can go into the NK-Abrechnung.
  Instandhaltung and Instandsetzung are **never Betriebskosten** (§ 1 Abs. 2 Nr. 2 BetrKV; the app's
  `SR_KINDS` 'instand' u:false, settlements-tab-rentals.js:76). So a repair receipt can never be "NK". Only real
  Betriebskosten can, e.g. Wartung, Ungezieferbekämpfung, Gartenpflege, Rauchwarnmelder-Wartung.
  Kleinreparatur and Schaden are **not** Betriebskosten. They may be sent with the NK letter only clearly apart
  (Teil B, as D39 does).
  - The Ausschlussfrist of § 556 Abs. 3 does not apply to Teil B. Kleinreparatur claims fall under the normal
    limitation (§§ 195, 199 BGB, 3 years).
  - § 556a Abs. 3 BGB: for vermietetes Wohnungseigentum the WEG key applies unless agreed otherwise. That is
    the Rentals contract text.
- **Schaden (Schadensersatz)**:
  - Legal basis: §§ 280 Abs. 1, 241 Abs. 2 BGB (Obhutspflicht) and § 823 BGB. It needs a breach and
    Vertretenmüssen.
  - The tenant is liable for household members, visitors and own workers (§ 278 BGB) and for Untermieter
    (§ 540 Abs. 2 BGB).
  - Several causers are Gesamtschuldner (§ 840 BGB). Internally they share equally (§ 426), which matches the
    D39 equal split.
  - Several tenants of **one** Rentals Wohnung are Gesamtschuldner by contract (rentals-contract-text.js:50-51).
    One position goes to the tenancy and is **not** split per person.
  - **Abzug "neu für alt"** (§ 249 BGB, Vorteilsausgleich): when an old item is replaced, the full invoice can
    be too much. D39 B2 is "full price". This is a known simplification, so keep the receipt amount editable.
  - **§ 548 Abs. 1 BGB**: the landlord's claims for Veränderung or Verschlechterung of the Mietsache are
    time-barred **6 months after the Rückgabe**. A B2 position for a former tenant on an NK letter sent later
    can fail. Setting off against the Kaution stays possible (§ 215 BGB; BGH 20.07.2016 – VIII ZR 263/14,
    please verify).
  - Gewerbe: glass breakage is on the tenant or its Glasversicherung regardless of fault
    (rentals-gewerbe-mietvertrag.js:450).
- **Gewerbe**: § 307 applies too, but more leniently (B2B), so 200 € / 8 % is fine. Instandhaltung of
  **gemeinschaftlich genutzter Flächen** may not be passed on in AGB without a cost cap (BGH 06.04.2005 – XII ZR
  158/01). This matters only if "Erhaltung Allgemein" (:274) from the HV is ever charged as NK; the cap must
  then apply.
- **Vacant or wrong date**: the person liable is the tenant on the **date of the damage** or repair. For damage
  found at move-out, the receipt date is after Auszug, so the unit counts as "vacant" and D39 says "stays with
  you". For non-Casa Schaden, offer the **previous** tenant too, if they moved out within 6 months of the
  receipt (§ 548). Direct payment or Kaution then fits best.

## 4. What "Gemeinschaftsfläche" means per property type

| Type | Common areas belong to | Kleinreparatur there? | Schaden there? | NK? |
|---|---|---|---|---|
| **Casa Castel** (whole house, Zimmer, sole owner) | landlord. Kitchen, baths and lounge are co-let (cc-contract-master.js:306) | **Yes**, by § 7 last sentence, equal split over the rented Zimmer (D39) | Yes, split over the "caused by" Zimmer (D39) | Betriebskosten via the Kostenquote; repairs never |
| **WEG Wohnung** (all other properties today: Kaiser-W-R 17, Kaiserstr. WHG 507/516, Adam-K-S. 1-3 WHG 08/10, Studio One, …) | the WEG (Gemeinschaftseigentum). Erhaltung by the Gemeinschaft (§§ 18, 19 WEG), costs to owners by MEA (§ 16 Abs. 2 WEG) via Hausgeld / Erhaltungsrücklage / Sonderumlage | **No**: not the tenant's frequent access and no clause sentence. The WEG's repair costs are "Instandhaltung / Rücklage", not umlagefähig (settlements-tab-rentals.js:73-76) | Only if this tenant caused it. The HV or WEG charges the owner, the owner recovers 100 % from the tenant. No split (one tenant party) | Only true Betriebskosten via the HV's Hausgeldabrechnung + NK-only items |
| **Inside the WEG Wohnung** (Sondereigentum, e.g. Bad, Küche, Fenstergriffe) | owner | **Yes**, § 8 items only (Rentals) | Yes, 100 % this tenancy | No (repairs) |
| **Balkon** ("Kaiser-W-R 17 · Balkon") | mixed: the Balkontür-Griff is Sondereigentum or the tenant's access; slab, Abdichtung and Geländer are usually **Gemeinschaftseigentum** | Only a Fenster- or Türverschluss repair ≤ 150 € | Yes, if the tenant caused it | No |
| **House with several flats, all owned by the landlord** (not in the data today: one property = one Wohnung, MAP 1 § 2) | landlord: Treppenhaus, Keller, Waschküche, Haustür | **No** (no clause sentence; not frequent individual access) | Yes, split over the causing **Wohnungen** (like Casa "caused by") | Betriebskosten by the contract key (Wohnfläche); repairs never |
| **Gewerbefläche** (in a WEG building) | the WEG | No | Yes, 100 %, incl. Mitarbeiter, Kunden, Besucher (:449) | NK by Nutzfläche; "Erhaltung Allgemein" only with a cap (XII ZR 158/01) |
| **Parking** | WEG or landlord | No clause → **never** | Yes ("zu vertreten", :379), Kaution or Direct | No NK at all |

## 5. Per-tenant terms field (proposal, for old contracts)

Columns on the tenancy, because the clause belongs to the contract and not to the property.
Same columns on `tenant_records` for Casa old contracts:
```sql
alter table rnt_tenant_records add column if not exists kr_max     numeric;  -- € per case · 0 = no Kleinreparaturklausel · null = template
alter table rnt_tenant_records add column if not exists kr_cap_pct numeric;  -- % of the Jahres(kalt)miete · null = template
alter table rnt_tenant_records add column if not exists kr_cap_eur numeric;  -- fixed € per year (old contracts) · used instead of % when set
alter table tenant_records     add column if not exists kr_max     numeric;
alter table tenant_records     add column if not exists kr_cap_pct numeric;
alter table tenant_records     add column if not exists kr_cap_eur numeric;
```
Resolution, a single function used by Maintenance and Settlements (e.g. `ccKrTerms(tenancy, unit, day)` in a
shared file):
1. If any of the tenant's columns is not null → use it. `kr_max = 0` turns Kleinreparatur off for this tenant.
2. Otherwise use the template default by unit type:
   | Unit | max / case | cap | cap base | § label in letter |
   |---|---|---|---|---|
   | Casa Zimmer | 150 € | 8 % | Kaltmiete ("Jahresmiete") | § 7 Mietvertrag |
   | Rentals Wohnung, Kalt + NK | 150 € | 8 % | Jahresnettokaltmiete | § 8 Mietvertrag |
   | Rentals Wohnung, Pauschal | 150 € | 8 % | Jahrespauschalmiete | § 8 Mietvertrag |
   | Gewerbefläche | 200 € | 8 % | Jahresnettokaltmiete | "Kleinreparaturen (Mietvertrag)". The § is 6 or 7 depending on Staffel, so don't hard-code it |
   | Parking | — (0) | — | — | — |
3. `assumed = true` when the tenancy has **no** `rent_periods` row with `source in ('generator','renew')`. The
   Who-pays sheet then shows an amber hint "Old contract · 150 € / 8 % assumed · check on the tenant card", and
   so does the Teil B view. Nothing is blocked, because the owner knows his old contracts.
   - Tenant card (Rentals and Casa, Edit mode): one small row "Kleinreparatur: 150 € / case · 8 % per year
     (contract) · Change". Hidden for parking.
   - Settlements must freeze the resolved terms with the letter (Casa: `snapshot.input`; Rentals:
     `rec.tenants[tid].teilB`, see MAP 2).
- Hard-coded places that must read the terms instead of 150 / 0.08:
  - maintenance.js:3356 (`MT_WHO_MAX`), :3507 ("Kleinrep. >150 €"), :3614
  - settlements-tab-casa.js:336, :383-385, :812, :2315, :2319-2320
  - These hold for Casa as well, for Casa tenants with an override.

## 6. Output table · per property type

| Property type | Kleinreparatur limit / case | Yearly cap | Schaden rules | Where options that make sense | Payment | Refs |
|---|---|---|---|---|---|---|
| **Casa Castel** (Zimmer) | 150 € (gross, after returns) | 8 % Jahresmiete (D39: Kaltmiete × 12) | Causer(s) pay 100 %, equal split over the picked Zimmer; Kaution deduction 100 % | **Gemeinschaftsfläche \| Zimmer** (unchanged) | NK letter Teil B or Direct | cc-contract-master.js:306, :340, :341; settlements-tab-casa.js:308-311, :336, :383 |
| **WEG Wohnung, Mietvertrag Kalt + NK** (e.g. Kaiser-W-R 17) | 150 € | 8 % Jahresnettokaltmiete | 100 % to the tenancy (Gesamtschuldner, no per-person split); 6-month § 548 limit after Auszug | **none**: implicit "Wohnung"; the sheet shows the tenant on the date read-only. Optional label for Schaden only: Wohnung \| Gemeinschaftseigentum (no split) | NK letter Teil B (Rentals letter) or Direct | rentals-contract-text.js:47-51, :108-114; rentals-mietvertrag.js:471 |
| **WEG Wohnung, Pauschal** (Mietvertrag or Kurzzeit) | 150 € | 8 % Jahres**pauschal**miete | as above | as above | **Direct only**: no NK letter (rentals-kurzzeit.js:406; Settlements `_srTenInfo` kind 'pausch') | rentals-contract-text.js:110-113 |
| **WEG Wohnung, Kurzzeit Kalt + NK** | 150 € | 8 % Jahresnettokaltmiete (pro rata for a short stay) | as above | as above | NK letter or Direct | rentals-contract-text.js:69, :108-114 |
| **Old contract** (any type, no 'generator' period) | per tenant `kr_max`, default = template, flagged "assumed"; 0 = no clause | `kr_cap_pct` or `kr_cap_eur` | by law (§§ 280, 241 II, 823, 548) | as its type | as its type | cc-contract-flow.js:1165-1168; cc-rent-engine.js:157-160 |
| **Gewerbefläche** | **200 €** | 8 % Jahresnettokaltmiete | 100 %, incl. Mitarbeiter/Kunden/Besucher; **Glas** always on the tenant or its Glasversicherung; Wartung of own Anlagen on the tenant | none (implicit "Mietfläche") | NK letter or Direct | rentals-gewerbe-mietvertrag.js:296-304, :441-442, :447-453 |
| **House with several flats, sole owner** (none today) | 150 € (Wohnung only) | 8 % | causers split equally (like Casa) | Schaden: **Gemeinschaftsfläche \| Wohnung** + unit chips; Kleinreparatur: Wohnung only | NK letter or Direct | (no template sentence for common areas) |
| **Parking** | — (no clause) | — | Schaden "zu vertreten", from the Kaution or Direct | none | **Direct only** (no NK) | rentals-parking-mietvertrag.js:373-379, :440-441 |

"NK" as a pay_type for non-Casa receipts: allowed only for real Betriebskosten. It goes into the Rentals NK as
an NK-only position with key **'direkt'** (nur diese Wohnung), which is what `_srAutoNkItems` already does
(MAP 2). Repairs (Instandhaltung) can never be NK, not even in a WEG.

## 7. Notes for the build

- Keep the sheet lean ("copy this function"):
  - Same 3 types `[NK | Kleinreparatur | Schaden]`.
  - The limit label follows the tenant's terms ("Kleinrep. >200 €" for Gewerbe).
  - Kleinreparatur is hidden for parking and for `kr_max = 0`.
  - The Where row appears only when there is a real choice (Casa; a multi-flat house). Single-unit properties
    show one read-only line instead: "Tenant on 12.03.2026: <name>" (or "vacant · stays with you").
  - "With NK" is disabled with a hint when the tenant has no NK letter (Pauschal, parking).
- Data: for single-unit properties, reuse `pay_where = 'zimmer'` to mean "the unit itself" and store the unit
  name in `pay_rooms[0]`, so there is no schema change for where/rooms. The terms go in the new tenant columns
  above.
- Letter wording (German):
  - Rentals B1 header: "Kleinreparaturen · § 8 Mietvertrag · bis 150 € je Fall".
  - Gewerbe: "Kleinreparaturen · Mietvertrag · bis 200 € je Fall".
  - Old contract: "Kleinreparaturen · Mietvertrag (Kleinreparaturklausel) · bis <kr_max> € je Fall".
  - Row sub: "Ihre Wohnung · Anlage n" instead of "Ihr Zimmer". Never "÷ n vermietete Zimmer" outside Casa.
  - The B2 legal note may add: "Mietsachschäden sind häufig über Ihre private Haftpflichtversicherung gedeckt"
    (Haftpflicht duty: cc-contract-master.js:346, rentals-contract-text.js:134).
