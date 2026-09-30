# Settlements › Rentals — build 3 (30.09.2026) · contains builds 2 + 3

1. SQL: only the last block of SETTLEMENTS-RENTALS.sql is new (sort_order) — the rest you already ran.
2. Copy all files into the repo root (replace), push → Vercel deploys.
3. iPhone: close the app completely and reopen, so the new version loads.

Build 3
- Jahresabrechnung form: Erhalten am · Abrechnung vom · WEG-Ergebnis · umlagefähige Kosten der Wohnung (one amount each).
  No Umlageschlüssel / Gebäude-m² / MEA / Einheiten / Gesamtkosten any more. Zeitraum only behind "ändern".
  "je Mieter" only appears when the tenant changed in that period.
- Letter page 2: Kostenart · Kosten der Wohnung · Ihr Anteil; the HV's Einzelabrechnung is named as basis and Anlage.
- Fixed order in Rentals and Tracking = your purchase order (ctrl_properties.sort_order).
