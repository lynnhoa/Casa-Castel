# Settlements · Rentals — build 5 (01.10.2026) · contains builds 2–5

1. SQL: in SETTLEMENTS-RENTALS.sql only the LAST block (sort_order) is new — run it if you haven't yet. No other new SQL.
2. Copy all files into the repo root (replace), push → Vercel deploys.
3. iPhone: close the app completely and reopen it.

Build 5 · Hausgeld and NK are two separate processes
- Tracker: "Hausgeld · Jahresabrechnung" line → Hausgeld window · tenant line → that tenant's NK ·
  "NK-Abrechnung ›" on a Wohnung → NK window. No top button any more.
- Hausgeld window (you ↔ WEG): received on, statement date, ALL costs (umlagefähig + nicht umlagefähig),
  WEG result, check, settings. Bottom: Save · "Create NK · n umlagefähige costs".
- NK window (you ↔ tenants): the umlagefähige Hausgeld costs, ticked (untick if not in the contract; amounts are
  changed in Hausgeld only) + NK-only costs (Grundsteuer from Rentals, "Add cost") · live tenant previews.
- Hausgeld totals and the WEG check count Hausgeld costs only; the NK counts ticked Hausgeld costs + NK-only costs.
- Existing entries keep working (they count as Hausgeld costs).
