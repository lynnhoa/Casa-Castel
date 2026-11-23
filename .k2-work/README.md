# Package 2 notes — delete this folder before the next package 2 PR (bring it back on the branch after the merge)

Package 1 (Kaution, six wrong Settlements calculations) is merged: PR #67, main c1b8774.
Package 2 A + B (12 items: letters + saved dates) is merged: PR #68, main d507335 (20.11.2026), re-check PR #69, main 779da20 (21.11.2026) —
items 32, 33, 34, 35, 37, 42, 39, 41, 36, 40 (A) and 29, 57 (B), plus the review fixes (Rentals sent letter keeps its
date, a line sent with "NK-Abrechnung erstellen" opens that archived letter, "1 day" on Rentals screens).

Still open: the other package 2 items, in `k2-items.json` (all except the 12 above), split into 10 small packages (owner OK 22.11.2026):
  1 Casa added tenants 53, 54 — DONE (PR #71, main 1dddd1f) · 2 Settlements↔Controlling 30, 31 — DONE (PR #72, main 6524785) · 3 Casa Pauschal+Kalt/NK 52, 56, PRE-SHEET-PERIOD — DONE (PR #73, main 423a47f) ·
  4 'Former tenant' switches 43, 44 — DONE, owner chose A: switch removed, letters unchanged (PR #74, main 4cdb8f3) · 5 Rentals JA/WEG status 55, 48, 50, 47 · 6 Rentals NK window numbers 22, 23, 24 ·
  7 Rentals tiles/lists 45, 49, 38 · 8 Dashboard 46, 51 (owner decision), 58 · 9 words 60, 61, 62, 64, 65 · 10 Kaution card leftovers (addendum).
The most important ones (money / buttons: 53, 30, 31) are done, and packages 3 (52, 56, sheet period) and 4 (43, 44). The rest: wrong numbers on screen only, wrong words only,
buttons / statuses.

For package 5 (seen in package 2's review, older than package 2): a paid WEG result corrected to "balanced" ("Change it")
keeps its booking (e.g. −120), and Controlling's row then reads "Guthaben of 0,00 €". Repro: scratchpad
k2p2/review/w2-weg-to-balanced.js. Also known since package 2: a line whose Ist was cleared BEFORE PR #72 still says
'erledigt' (the fix works from the next clearing) — no repair planned unless the owner asks.

Known since package 3 (PR #73), all rare, left as they were:
- A Casa tenant who switches twice in one NK year (Kalt + NK → Pauschal → Kalt + NK): the card shows and skips only the
  first Kalt + NK part; Settlements has a second line that stays open (fix would be one due item per stretch, matched by
  period_from). Review script: scratchpad k2p3/review/t1.js case A.
- A skip the OLD card rule saved on a Pauschal part (period 01.02.–31.12.) stays there: the card says 'skipped', Settlements
  keeps the Kalt + NK line open. The owner can mark that line 'not done' in Settlements. No repair planned.
- Rentals card (not checked, candidate for package 6/7): a flat tenant who switches Pauschal ↔ Kalt + NK in one period
  may get the same label as Casa had (Pauschal months included), and the Rentals link (&p=&t=) opens the tenant's first
  item, which can be the Pauschal part. Casa's fix (_tnKaltNKSpan / f=) was not applied to Rentals.
- Package 4 (PR #74): the manual letter's moved-out mark (d.former, no switch any more) comes only from a tenant picked
  from the app (sdPickTenant) and goes only when that tenant is replaced by another typed name or another property
  (SD.leftPick in sdInput/sdChange). Old drafts keep their stored value. Casa letters never used it (du: same text).
- Manual NK letters (NK-Abrechnung erstellen) store covers_year = the year of the letter's own end date (since #29 the
  tenant's own days), not the year the period ends — only matters for 01.07.–30.06. periods.

- `k2-items.json`: the 38 items (Rentals 16, Casa Castel 11, Dashboard / Tracking 11) — 12 of them done in PR #68.
- `k2-map.json`: the technical map of those items and its review.
- `settlements-bugs-validated.json`: the 51 validated Settlements bugs the list came from.
- `addendum-k1-walkthrough.json`: 8 more candidates seen in package 1's last checks (RNT-LEERSTAND-PERIOD = item 22).
  Main shows them too; check each again before fixing.

Plan agreed with the owner: smaller PRs by area, each merged the same day; items that only change text get a quick check.
Repro scripts of the audit: scratchpad rt/sb/<area>/… (REPO=<tree> node …), see each item's audit.repro.
