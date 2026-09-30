# Settlements · Rentals — build 4 (01.10.2026)

1. SQL: in SETTLEMENTS-RENTALS.sql only the LAST block (sort_order = purchase order) is new — run it if you haven't yet.
   Everything above it you already ran.
2. Copy all files into the repo root (replace), push → Vercel deploys.
3. iPhone: close the app completely and reopen it.

What changed
- Tabs: Rentals (first) · Casa Castel. The Tracking tab is gone – Rentals IS the tracker now.
- Rentals tracker: all Wohnungen for the chosen year, purchase order. Per Wohnung the Hausgeld line + one line per tenant:
  Period · Status · Result · Sent (tick) · Settled · PDF. Tap any line to open it.
- NK-Abrechnung (modal): ① Jahresabrechnung — Received on, Statement date, costs as a table
  (umlagefähig + nicht umlagefähig, folds to one line once saved), WEG result + check · ② NK per tenant.
- Tenant: result, period (from Rentals, editable for this NK only), Vorauszahlungen, letter, Create PDF, Mark sent, Skip this NK.
- Settle: paid (amount may differ) · offset (Kaution / rent / Hausgeld) · skipped — always editable, with "Undo".
- English UI, German key terms. The tenant letter stays German.
