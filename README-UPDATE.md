# Settlements › Rentals — NK-Abrechnung (30.09.2026)

1. Run SETTLEMENTS-RENTALS.sql once in Supabase (skip if already done).
2. Copy these files into the repo root (replace), push → Vercel deploys.

New
- settlements-tab-rentals.js   Rentals tab: HV-Abrechnung, calculation per tenant, PDF letter, "Verschickt" → Tracking + Controlling
- SETTLEMENTS-RENTALS.sql      table nk_abrechnung_rentals

Changed
- settlements.html             loads the new tab + PDF tools (html2canvas, jsPDF, pdf-open.js)
- settlements.css              Rentals tab styles (phone / iPad / desktop)
- settlements-app.js           closing the panel + reload work for both tabs
- settlements-tab-calc.js      Rentals placeholder removed (Casa Castel placeholder unchanged)
- settlements-tab-tracking.js  "Change" Abrechnungszeitraum refreshes the tab you are on
- pdf-open.js                  the new PDF button uses the same iPhone viewer flow ([data-cc-pdf])
