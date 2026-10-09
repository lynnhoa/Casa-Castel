# Controlling · Setup review (27.09.2026)

## Built in this update
- Setup rebuilt: Prüfen (Verknüpfungen · Mieten und Soll · Mieterhistorie) → Objekte → Stellplätze → Casa Castel Kostenarten.
- Planwerte card removed. A missing link shows its one fallback field inline in the property card
  (Kreditrate without Darlehen · Hausgeld/Grundsteuer without Rentals-Wohnung · Kalt/NK for an unlinked flat).
- Strom removed from Setup and from the Ausgaben Soll (past Strom entries stay as Ist).
- New Stellplätze section: every parking unit, dropdown shows Rentals parking only, Rentals price + tenant,
  "In Rentals, noch in keinem Objekt" with "Hinzufügen" (creates the unit already linked).
- Parking has no Planwert any more; unlinked parking = Soll 0 + hint "Setup › Stellplätze".
- Auto-match for parking: exact name or property name + unit name ("Casa Castel" + "Stellplatz").
- Einnahmen: parking rows read "Miete 100,00 €".

## Bugs found and fixed
1. Unit dropdown offered every source for every unit (a flat could be linked to a Casa room) → options now match the unit kind.
2. One Rentals space / flat could be linked to two units → double Soll. Taken sources are now disabled and flagged.
3. Unit linked to another Rentals flat than its property (rent from A, Hausgeld from B) → flagged.
4. Parking auto-match only on identical names → Casa Castel Stellplatz never linked.
5. Stale parking Planwerte were silently used as Soll (Stellplatz 2 = 0 €, Rentals SP 3 = 130 €).
6. Casa Kreditrate amount editable although the linked loan overrides it → shown read-only.
7. Changing the Abrechnungszeitraum moved settlements without warning → hint added.
8. Unused Controlling units could not be removed → "Einheit entfernen" (only without any entries).
9. Fallback fields without labels once filled → labelled rows.

## Known limits (not built)
- "— nicht verknüpft —" for Rentals-Wohnung / Darlehen: if a flat or loan has the same name as the
  property, the name match links it again (pill "vorgeschlagen"). A deliberate "no loan" needs a DB flag.
- Casa Castel Kostenarten: no add / rename / hide in Controlling.

## Manual to-dos (Setup)
1. Setup › Stellplätze: link Studio One Tiefgarage 1–3 and Stellplatz 1–2 to the Rentals spaces
   (numbering differs: Stellplatz 1/2 ↔ SP 3/SP 4). Then add what is left, remove units that no longer exist.
2. Rentals › Parking: set a price for Casa Castel Stellplatz (or the rent on its tenant).
3. Setup › Objekte › Darlehen: link every property that has a loan; confirm Kaiserstr. WHG 507 (Zins 0 € Planwert).
4. Setup › Vorschläge nach Namen: check, then "Alle Vorschläge übernehmen".
5. Setup › Prüfen: work through Verknüpfungen and Mieten und Soll until both are clean.
