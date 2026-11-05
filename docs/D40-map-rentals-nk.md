# MAP 2 · Rentals NK-Abrechnung + letter → where "Who pays?" / Teil B plugs in

Read-only map of HEAD 8571afb (D39 included). All line numbers are for the current files.
"SR file" = /home/user/Casa-Castel/settlements-tab-rentals.js (2299 lines).

## 0. Short version
- Rentals = one Controlling property (`ctrl_properties.id`, every active one except 7) = one apartment
  (`ctlPropLinks(p).apt`, `rentals_apartments`) = one tenant at a time (`rnt_tenant_records.apartment_id`).
  The Maintenance key `maint_cases.property_id` is the same id as `c.p.id` in Settlements, so the join is direct.
- The Rentals NK engine is only `_srCalc` in the SR file (no separate rnt engine; `rnt_nk_entries` is the old
  read-only tracking). It is a per-position split by days, NOT the Casa Kostenquote pool.
- Stored in `nk_abrechnung_rentals` (one row per property + period_from). There is NO lock and NO snapshot. "Sent"
  = ctrl_settlements 'verschickt' + abr_results row + archived PDF in nk_letters; after that only the auto-items stop
  syncing. Teil B therefore needs its own freeze (proposed: `rec.tenants[tid].teilB`, written in `_srSend`).
- The letter already uses nkLetterHtml (nk-letter.js). D39's Teil B page (`d.teilB`) is generic, so Rentals only has
  to fill `d.teilB` and give `saldo = Teil A`. The Rentals PDF pipeline (`_srLetterBlob`) does NOT run the D39
  `[data-pgref]` page fix-up. It must be copied in.
- Maintenance lines reach the Rentals NK only through Controlling's switch: `nk_umlage = true`, then
  `_srAutoNkItems`, then the "NK only" positions. The cost type is ignored (always `kind 'sonst'`, label = item text).
  For non-Casa lines `nk_category_id` is never set and never read.
- There is no cost-type table per Rentals property. The catalogue is the hard-coded `SR_KINDS` (§ 2 BetrKV,
  SR file :48-78) with text keys. `pay_cat` (bigint → ctrl_castel_categories) cannot hold these keys, so a new text
  field is needed.

## 1. How a Rentals NK-Abrechnung is computed

### 1.1 Data loaded (`_srLoadRowsNow`, SR :104-136)
| what | source | line |
|---|---|---|
| own records | `nk_abrechnung_rentals` select * | :108 |
| letter archive | `nk_letters` (sent_at desc) | :112 |
| Hausgeld + Grundsteuer Ist per month | `ctrl_expense_apartments` (property_id,year,month,hausgeld,grundsteuer), paged with ctlReadAll | :116-121 |
| **NK auto-items** | `ctrl_expense_one_time` `.eq('nk_umlage', true)`, ALL properties, ALL years, paged | :123-127 → `SR.nkOt` |
| Kaution-Einbehalt | `rnt_kaution` → `SR.kaution[tenant_id]` | :128-131 |
| global (Controlling) | `window._src`: apts, verw (rentals_verwaltung: HV, grundsteuer_mtl), rntTen (rnt_tenant_records), staffel, rntNkV, settle (ctrl_settlements), abr (abr_results), abrPay, readings (meter_readings), zaehler (rentals_zaehler) | controlling-soll.js:55-75 |

### 1.2 Year model / tenants (`_srYearModel` :904, `_srItemsFor` :868)
- Properties: `active && id !== CASA_PROP_ID`, sorted by `stPropOrder` (sort_order from SETTLEMENTS-RENTALS.sql).
- Period: `ctlPeriodEndingIn(p, Y)` (controlling-soll.js:1230), per property `nk_period_start`
  (Kostheim 07-01, the others 01-01). Frist = end + 12 months. Override per record: `_srPer(c, rec)` :187.
  Before the purchase: `c.before` (`_srBought` :1155). In the purchase year the months before it use the contract Soll (`_srCalc` :289-299).
- Items: for each `ctlUnitsFor(p.id)` unit (parking skipped), `_cxTenancies(link)` windows, split into spans by
  `_cxRentDay(...).mode` → note 'Pauschal' or Kalt+NK. Each item is matched to a stored ctrl_settlements row
  (`ctlSettlementSame`) or a virtual one (`_cxSetVirtual`). Plus one `weg_hausgeld` item (`c.weg`).
  `it.r` = {id, tenant_id, period_from, period_to, note, status, covers_year, result_id …}, `it.e.unit_name`.
- Tenant record: `_srTenantOf(r)` :180 (window._src.rntTen by id). Names: first/last + _2/_3 (co-tenants on ONE record → one letter).

### 1.3 Record `nk_abrechnung_rentals` (SETTLEMENTS-RENTALS.sql:4-24, RLS "authenticated" since SETTLEMENTS-PHASE6-7.sql:40-50)
`id, property_id, apartment_id, period_from, period_to, hv_date, key_mode, keys jsonb, positions jsonb, tenants jsonb,
received_on, asked_on, beschluss_on, weg_direction, weg_amount, weg_due, weg_via`. Unique (property_id, period_from).
- `positions[]`: `{id, kind (SR_KINDS key), label, u (umlagefähig), origin 'hv'|'nk', nk (false = unticked), total, key
  ('flaeche'|'mea'|'einheiten'|'personen'|'verbrauch'|'direkt'), ku, kt, amount, split 'tage'|'mieter', gk (Grundkosten %),
  auto ('gs' | 'ot:<one_time id>'), src}`
- `keys`: flaeche_u/t, mea_u/t, einh_u/t, hg_paid, ja_v, ja_done, meters{name:{start,end}}
- `tenants{tenant_id}`: `{addr, iban, date, days, via, vz, direct{posId:€}, new_vz, new_vz_from, anlagen, settle_note}`
- Save: `srSaveRow` :138-160 (falls back when the step-1 columns are missing). Autosave: `_srAutoSave` :1570.

### 1.4 Inputs → positions
1. **Hausgeld / WEG Jahresabrechnung** (Window A `_srHvView` :1436). The amounts for the apartment from the HV's
   Einzelabrechnung, umlagefähig (u) or not. Completeness check: `_srRecSummary` :244, `_srJaDone` :481
   (keys.ja_done; marked automatically in `_srAutoSave` :1578-1583). WEG result → `_srWriteWeg` :561
   (abr_results kind 'weg_hausgeld'). Without a complete Jahresabrechnung there is NO NK (`_srTenInfo` gives x only when sumOk).
2. **umlagefähige Anteile**: `_srInNk(p)` :243 = (origin 'nk' or u) && nk !== false. Amount per apartment:
   `_srUnitAmt` :221 (override amount, else total × ku/kt).
3. **Grundsteuer**: auto-item 'gs' in `_srAutoNkItems` :1001-1013 (Controlling Ist per month, else Rentals Soll per quarter).
4. **One-off costs with nk_umlage ("NK auto-items")**: `_srAutoNkItems` :1014-1020 (see § 4).
5. **Meter readings**: Verbrauch positions → `_srConsSplit` :353 (Grundkosten gk %, rest by Zählerstand from
   meter_readings Einzug/Auszug + keys.meters start/end, else by days lived; Leerstand never gets consumption).
6. **Vorauszahlungen**: `ctlSettlementFigures` (controlling-soll.js:1405) → nkIst (Controlling) else nkSoll
   (contract). Override `ts.vz`. Months list `_srVzMonths` :463.

### 1.5 Split per tenant (`_srCalc` :258-316)
- tDays = the tenant's span ∩ period. Each position: `amt = unit × tDays/perDays`. Consumption: `_srConsSplit` g+v.
  `split 'mieter'` → `ts.direct[pos.id]` typed per tenant (Zwischenablesung).
- `saldo = sum − vz` (> 0 Nachzahlung, < 0 Guthaben). Kaution: `_srEinbehalt(r)` :591 (rnt_kaution.nk_einbehalt
  once settled, used once) → `kau`, `einbehalt` (when via 'kaution').
- Returns `{lines, sum, vz, vzSoll, vzIst, vzOv, vzMonths, pre, saldo, tDays, perDays, from, to, per, partial,
  missing, direct, t, apt, ts, kau, einbehalt}` (:312-313).
- Pauschal stays and Leerstand: `_srOnYou` :440 / `_srSpanShare` :406 (information only, "on you").

### 1.6 Lock / snapshot
- None. Everything is recomputed live from `rec.positions`. Protection after sending:
  - `_srNkAutoSync` :1030 skips a card once any tenant line has `st.res` ("the NK stays as it was sent").
  - The tenant view shows `st.res` (abr_results) amounts once sent (`_srTenView` :1811 `v = sent ? res.dir*res.amount : x.saldo`).
  - The archived PDF (`_srArchive` :728) is the real frozen copy.
- abr_results: written in `_srSend` :805-846 (`kind 'nk_tenant'`, `app 'rentals'`, `amount |saldo|`, direction,
  settle_via, status 'fertig'), linked to ctrl_settlements by `result_id`. Undo: `_stReopen` (SR :2249-2252);
  Skip: `_srSkipNk` :1995 (abr_results 'storniert').

### 1.7 Letter (`_srLetterData` :745-774 → `srLetterHtml` :776-802 → nkLetterHtml)
- German, neutral "Sie" register (`du: false` :796). Brand = apartment name, `unitLabel 'Wohnung'`, unitName = Wohnungsnummer.
- Title "Betriebskostenabrechnung <useFrom> – <useTo>". Facts: Wohnung, Zeitraum, Grundlage "Hausgeldabrechnung <HV> vom …".
- Costs table: rows = `l.pos.label || _srKind(kind).l` (+ "(Zwischenablesung)" / consumption text), one column for the amount (:791-792).
- vzMonths table, result box, payment text (via / Kaution / IBAN), `extraHtml` = new Vorauszahlung sentence (:782-783),
  hints (Verbrauch, § 556 Abs. 3 BGB), Anlagen = "Einzelabrechnung der Hausverwaltung[, Heizkostenabrechnung]" (`_srDefaultAnlagen` :648).
- `extra: null` (:800): no Belegliste page. Today the letter is a single page.
- PDF: `_srLetterBlob` :704-727 has its OWN copy of the pipeline (`ccFlowPages` → pgn/pgt :719-720 →
  `ccRenderPagesToPdf`). It does NOT run the D39 line in `nkLetterPdf` (nk-letter.js:306) that sets `[data-pgref]`.
  File name: `ccPdfFileName('NK-Abrechnung', periodLabel, aptName, lastName)`.

### 1.8 How a saldo is sent and settled
- `_srSend` :805: amount = |x.saldo|, dir = sign. via = 'kaution' if einbehalt > 0, else the tenant's choice.
  `_stUpsertSettlement(l, {status:'verschickt', …})` → `_stWriteResult(null, resRow)` (settlements-tab-tracking.js:469)
  → ctrl_settlements.result_id. On error: roll back to `before` (:827-833). Then `_srArchive` :728 (storage nk-letters/rentals/<y>/…, table nk_letters).
- Money: `_srSetAmount` :1937 → updates the booking, links a manual entry (`_stFindManualNk`, shielded from Maintenance
  lines by maint-link.js:41), or `ctlAddOneTime({kind:'NK-Abrechnung', direction:res.dir, source_ref:'abr:'+res.id})`,
  then `_stConfirmSettled`. Undo: `_srSetUndo` :1970.
- Consumers that follow `x.saldo` / `st.res`: `srSummary` :1184 (Dashboard settlements-tab-dashboard.js:60, :141),
  `_srCard5` :1240 (nkNet), `_srTenLine` :1271, `_srNkView` hero :1665, `_srNkTens` :1716, `_srSetObj` :1916 (soll),
  `_srChecks` :610 (IBAN needed when saldo > 0), `_srBig` :602, tenant card cc-nk-settle.js:273-317 (abr_results amount only).

## 2. Where Teil B plugs in (Rentals)

### 2.1 Model
| step | hook | what |
|---|---|---|
| load | SR :123-127 (next to `SR.nkOt`), state SR :31-42 | new `SR.mt = {cases, costs}`: `maint_costs` (id,case_id,amount,cost_date,return_of,description,receipt_no,pay_type,pay_where,pay_rooms,pay_via,pay_paid_on[, new tenant/kind field]) with `pay_type in (klein,schaden)` + their returns (`return_of in …`) + `maint_cases` (id,title,kind,property_id) with `property_id <> 7`. All years (like nkOt), paged with ctlReadAll. Fail-soft: reuse `scTbMissing` (settlements-tab-casa.js:114; global, loaded later but called at runtime). |
| positions | new `_srTeilBPos(c, rec)` next to `_srAutoNkItems` (:1001) | per card: case.property_id === c.p.id, receipt (no return_of), `coalesce(pay_via,'nk')='nk'`, cost_date in `_srPer(c, rec)` and ≥ `_srBought(c.p)`, NET = amount − Σ returns > 0. Kleinreparatur over the limit (150 €, Gewerbe 200 €) goes to `skip`. Label = description, else entry title. Port of `scTeilBPos` (settlements-tab-casa.js:321-343). |
| per tenant | `_srCalc` :258-316, before the `return` at :312 | find the position's tenant: this `it` when `it.r.tenant_id`, `it.r.note !== 'Pauschal'`, not skipped, and `_srD(it.r.period_from) ≤ date ≤ _srD(it.r.period_to)`. 100 % share (one tenant per apartment, so no cent split). The § 8 cap is 8 % of the Jahresnettokaltmiete: `kaltmiete × 12` from rnt_tenant_records, or Σ Kalt Soll for the year. It is a minus row. Set `x.saldoA = sum − vz`, `x.b1`, `x.b2`, `x.teilB = [rows]`, `x.saldo = saldoA + b1 + b2`. Every consumer in § 1.8 then follows automatically. |
| warnings | `_srNkView` card + Dashboard | position with no Kalt+NK tenant on its date (Leerstand, Pauschal, NK skipped, before purchase) → "no NK letter on <date> · stays with you" (as `scTeilB` settlements-tab-casa.js:361-394). |
| freeze ("snapshot") | `_srSend` :805, before `srSaveRow(rec)` :818 | write `rec.tenants[tid].teilB = x.teilB` (ids, b, date, label, gross, net, share, cap rows). `_srCalc` uses `ts.teilB` when present, else the live positions. Clear it on reopen (SR :2249-2252 `_stReopen`) and on Skip (`_srSkipNk` :1995). For a locked receipt, Maintenance's Who-pays sheet reads `nk_abrechnung_rentals.tenants->*->teilB` ids (the equivalent of `MT_WHO_LOCKQ` maintenance.js:3374, which reads `nk_abrechnung_casa`). That table allows only authenticated users. |
| auto-sync guard | `_srNkAutoSync` :1030 | unchanged (Teil B is not a position). Never let Kleinreparatur / Schaden become a position: the SQL must keep their `nk_umlage` false for all properties (as D39 does for Casa). |

### 2.2 UI (same look as Casa, reuse the global `SC_TB_CSS`, injected at load by settlements-tab-casa.js:754-758)
- NK window `_srNkView` :1611: add a "Teil B · from Maintenance" fold or card after `costCard`, before `tenCard` (:1661).
  It shows only when there are positions or warnings: B1 list, B2 list (tap → `maintenance.html#cost=<id>`) and the warnings.
- Tenant rows `_srNkTens` :1716-1740: the amount follows the total; add the sub "incl. Teil B".
- Tenant view `_srTenView` :1794:
  - Hero bars :1816: add `['Teil B', b1+b2, '#E8C98F']`, as Casa does at settlements-tab-casa.js:1918.
  - Calculation :1849-1867: before the "=" row (:1865), add "= Teil A · Nachzahlung/Guthaben", "+ B1 Kleinreparaturen" and "+ B2 Schäden" (port of `scTbTenRows` settlements-tab-casa.js:819-833). The Kaution row (:1866) already uses the total.
- Card `_srCard5` :1209-1259 and `_srTenLine` :1271: values follow saldo. You can add "incl. Teil B" to the NK mini-tile lines.
- Live refresh `_srRefreshTenant` :633 uses `_srCalc`, so it needs no change.

### 2.3 Letter page 2
- `_srLetterData` :745-774:
  - `saldo: x.saldo` (:764) becomes `x.teilB.length ? x.saldoA : x.saldo`.
  - Build `teilB` the way `scLetterTeilB` (settlements-tab-casa.js:2296-2337) does, with Rentals wording:
    - kicker 'NK-Abrechnung ' + Jahr (period end) or the period label.
    - who = [names joined, aptName + (Wohnungsnummer ? ' · Wohnung ' + nr : ''), 'Zeitraum ' + useFrom–useTo].
    - cols ['Datum','Position','Rechnung','Ihr Anteil'].
    - B1 note '§ 8 Mietvertrag · bis 150 € je Fall'. Gewerbe: its own § number (`P.klein`, rentals-gewerbe-mietvertrag.js:301/441) and 200 €.
    - Row sub 'Ihre Wohnung · Anlage n' (no Gemeinschaftsfläche / ÷ n split).
    - Cap row 'Höchstens 8 % der Jahresnettokaltmiete (§ 8)'.
    - The legal text refers to § 8.
    - rows = Teil A (Seite 1) + B1 + B2; saldo = total; anlagen 'Anlagen 1–n: Rechnungen zu den Positionen oben'.
  - `anlagen` (:766): append ' · n Rechnungen zu Teil B'.
- `srLetterHtml` :776-802: pass `teilB: d.teilB` into the nkLetterHtml object (e.g. next to `extra: null` :800).
  Without Teil B the object is unchanged, so the HTML stays byte-identical (nk-letter.js adds NK_LETTER_CSS_B only with TB, :159).
- `_srLetterBlob` :704-727: after pgn/pgt (:719-720), add the D39 `[data-pgref]` fix-up (copy nk-letter.js:306), or call
  `nkLetterPdf`. Without it, "ab Seite 2" / "auf Seite 2" stay "2" even when the Gesamtverrechnung flows to page 3.
- nk-letter.js needs no change: the TB page (:274-286), `pay1B` (:231) and `payFor(TS)` (:182-201) are generic.
  `du:false` gives the neutral wording.

### 2.4 Total incl. Kaution
- The letter: `payFor(TS, |TS|)` on the Teil B page uses `d.einbehalt` and `d.via` (already passed at SR :764), so the
  Kaution is netted against A + B1 + B2. Page 1 shows only the Teil A box and the "Zusammen mit Teil B …" sentence.
- The send: `_srSend` :811 `amount = |x.saldo|` (the total), `via = einbehalt > 0 ? 'kaution' : …` (:814). abr_results and
  Controlling's NK-Abrechnung booking carry the total, as in Casa.

## 3. Maintenance lines → Rentals NK today
- SQL (MAINTENANCE-D39.sql `maint_book_line`):
  - Non-Casa receipt line: `nk_u/nk_c` = the kept switch `nk_keep` (same property) else false/null (:204-220).
  - On conflict, Controlling's switch is kept (:232-235). Saved on unbook (:123-135).
  - The return line is a separate row, also with nk_umlage false. If a receipt is switched to NK in Controlling, its return is NOT, so the NK takes the gross amount (Casa fixed this in D39, non-Casa did not).
  - `maint_pay` is written only for Casa (`if casa and r.return_of is null`). The refund line ("Erstattung Mieter") is created only for Casa.
- Controlling switch (non-Casa Maintenance line): `_cxOtMaintFormHTML` controlling-tab-onetime.js:161-191 "Show in Settlements".
  The cost type `_cxOtNkCatHTML` :829-840 returns '' when `pid !== CASA_PROP_ID`, so `nk_category_id` is always null for non-Casa (`_cxOtSaveMaint` :224-243).
- Settlements: `SR.nkOt` → `_srAutoNkItems` :1014-1020 → `{auto:'ot:'+id, kind:'sonst', origin:'nk', u:true, label:o.item||o.company,
  amount: ±amount (direction 1 = minus), key:'direkt', src:'marked for the NK · <date>'}`. `_srNkAutoSync` :1024-1050 writes them into
  `rec.positions` (only when `rec.id` exists, no letter sent, not typing). An unticked auto-item keeps `nk:false` (:1036-1039).
  The split is by days like every position: a December repair is also charged to a tenant who left in March.
  The letter row label is the raw item text (e.g. "<entry title> · Beleg 12 · <description>", up to 200 chars).

### 3.1 Every reader of nk_umlage / nk_category_id that matters for non-Casa
| file:line | reads | note |
|---|---|---|
| settlements-tab-rentals.js:124 | `.eq('nk_umlage', true)` | the auto-items load (all properties) |
| settlements-tab-rentals.js:1016-1019 | `o.nk_umlage`, property_id, invoice_date in `c.per` (NOT `_srPer`), ≥ purchase; excludes kinds NK-Abrechnung/Hausgeldabrechnung/Kaufnebenkosten | `kind:'sonst'` always, nk_category_id ignored |
| settlements-tab-rentals.js:1024-1050 | auto positions sync | label/amount/src updated, **kind not** (must be added to the update and to `sig` if a cost type comes) |
| settlements-tab-tracking.js:417 | `!o.nk_umlage` in `_stFindManualNk` | Maintenance lines hidden by maint-link.js:41 shield |
| controlling-tab-onetime.js:85,94 | `_cxOtIsMaint`, `_cxOtNkFixed` (Casa+D39 or refund only) | non-Casa Maintenance lines keep the switch |
| controlling-tab-onetime.js:161-191, 224-243 | maint form + save: `nk_umlage`, `nk_category_id` (null without chooser) | |
| controlling-tab-onetime.js:258, 294, 301-304, 377, 623, 732-743, 790-794, 803-805, 829-850 | normal form, pills "NK", dirty check, save, Casa-only cost type | |
| controlling-data.js:237-238 | payload passes nk_umlage / nk_category_id | |
| MAINTENANCE-D39.sql:123-135, 204-235 | nk_keep + on-conflict rules for non-Casa | |
| maintenance.js:1853, 2002, 2009, 2030 | `nk_umlage`/`nk_category_id` of a linkable line | Casa only (`mtIsCasa`) |
| nk-casa-engine.js:253-265, settlements-tab-casa.js:269, 901-911, 1111-1114, 1226, 1632-1651, NK-CHECK-B.sql | Casa only | not for Rentals |
| cc-nk-settle.js | — | does not read these columns |

## 4. Cost types per Rentals property
- No table. `ctrl_castel_categories` is Casa only (controlling-data.js:34; `_cxOtNkCatHTML` Casa only).
- Rentals catalogue = `SR_KINDS` (SR :48-78), text keys, same for every property. `u:true` = umlagefähig.
  The record's positions use these keys. The NK-only positions are `origin 'nk'`.
- Who pays › NK › cost type for a Rentals receipt → an SR_KINDS key with `u:true`. Leave out 'grundsteuer' (auto), 'co2'
  (neg, direkt), 'heizung'/'warmwasser' (Verbrauch). Default (nothing chosen) = 'sonst' "Sonstige Betriebskosten", the
  Rentals equivalent of "Allgemeine Hauskosten". Likely candidates for receipts: wartung, rwm_wartung, reinigung, garten, winter,
  ungeziefer, schornstein, hauswart, strom, muell, sonst. Note: 'instand' (Instandhaltung / Reparaturen) is `u:false`. A repair is
  not a Betriebskosten item, which is exactly why Kleinreparaturen go to Teil B.
- Storage: `pay_cat bigint` cannot hold a text key.
  - Option A: new `maint_costs.pay_kind text` + `ctrl_expense_one_time.nk_kind text`, both written by SQL.
  - Option B: carry `"k"` in the `maint_pay` snapshot, which then has to be written for all properties, not only Casa.
  - Either way `_srAutoNkItems` :1018 becomes `kind: o.nk_kind || (pay && pay.k) || 'sonst'`.
  - Optionally the letter label becomes `_srKind(kind).l` with the item text as a sub, instead of the raw item (srLetterHtml :791-792).
- Chips for Rentals in the sheet = the same list (not per property). Most-used = count over that property's past positions/auto-items.

## 5. What is different from Casa (design decisions for the build)
1. **One unit, one tenant at a time.** There is no Zimmer and no cent split. "Where" (Gemeinschaftsfläche | Zimmer) has little meaning:
   common property belongs to the WEG and is paid through the Hausgeld, so the landlord cannot bill it as Kleinreparatur.
   Recommendation: hide "Where" for Rentals and treat the position as "Ihre Wohnung". If a property has more than one living unit
   (`ctlUnitsFor`), pay_rooms = [unit name] matched to `it.e.unit_name`.
2. **The tenant comes from the date.** A Schaden is often found at the Auszug-Übergabe and invoiced after the tenant has left.
   A by-date match then finds nobody, or the NEXT tenant. Recommendation: store the causing tenant explicitly
   (e.g. `pay_tenant` = rnt_tenant_records.id). Default = the tenant on cost_date, else the last tenant who moved out before it.
   Put it into the NK of the period that contains that tenant's last day, or offer Direct / Kaution.
3. **The NK waits for the HV Jahresabrechnung.** No NK exists before `_srJaDone`, often 6–10 months after the period, so Teil B
   "with NK-Abrechnung" waits as long. Direct is more important here.
4. **Pauschal stays get no NK letter** (it.r.note 'Pauschal'): warning, stays with you, or Direct.
5. **Split by days per position**, not the Kostenquote pool. Teil B must stay outside `lines` and `positions`.
6. **No lock.** A freeze is needed at send (§ 2.1). After sending, the auto-items stop but `_srCalc` is still live.
7. **Contract clause:**
   - Wohnung Mietvertrag: § 8 (rentals-contract-text.js:108-130), ≤ 150 € per case, 8 % of the Jahresnettokaltmiete (Pauschal: Jahrespauschalmiete).
   - Gewerbe (rentals_apartments.zimmer_type 'Gewerbefläche'): § P.klein, ≤ 200 €, 8 % of the Jahresnettokaltmiete.
   - Casa: § 7, 150 €, 8 % of the Jahresmiete.
   - The Who-pays "Kleinrep. >150 €" limit and the hint therefore depend on the property/unit type.
8. **Letter:** neutral "Sie" (du:false); brand = apartment name; "Wohnung <nr>"; no Belegliste. Teil B is page 2 and the
   letter has 2 pages instead of 1.
9. **NK period per property** (nk_period_start, Kostheim 07-01). The "NK 2026" label = year of the period end
   (`ctlPeriodOf(p, cost_date)`), with the purchase-date cut (`_srBought`) and the custom period (`_srPer`).
10. **Kaution** = `rnt_kaution.nk_einbehalt` (Casa: `kaution`). It is already netted against the total by nkLetterHtml.
11. **Returns:** today the non-Casa return lines are not NK-marked. With Who pays › NK for every property, the SQL has to set
    `nk_umlage`/`nk_kind` on returns too, as Casa does.
12. **Ownership of the NK switch:** today Controlling owns it for non-Casa lines (nk_keep). Copying the function means Maintenance
    owns it for every property. Migrate existing switches → pay_type 'nk' (like D39 § 3) and make the switch read-only in
    Controlling for all properties (`_cxOtNkFixed`).
13. **Refund line ("Erstattung Mieter")** for Rentals: company = tenant name instead of room names. The Rentals Settlements side is
    unaffected (nk_umlage false; `_srFindBooking`/`_stFindManualNk` are shielded via maint_refund_of).

## 6. Effort (rough estimate, Rentals NK + letter only)
- Load + positions + `_srCalc` Teil B + freeze at send/reopen/skip: ~150–200 lines.
- UI (NK window card, tenant calc rows, hero bar, warnings): ~120–180 lines.
- Letter (`_srLetterData` teilB builder, srLetterHtml pass-through, pgref fix in `_srLetterBlob`): ~80 lines.
- Cost type for the NK auto-items (`_srAutoNkItems` + sync sig, + SQL column): ~20 lines JS.
- Tests: Playwright with Settlements stubs (wf/verify-ja-maint harness), letters with and without Teil B,
  byte-identical letter without Teil B, Kaution cases.
- Order of magnitude: about half a day to one day of agent work for this part alone. Maintenance (sheet for all properties,
  tenant lookup for Rentals) and the SQL generalisation come on top.
