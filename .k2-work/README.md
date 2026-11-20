# Package 2 notes — delete this folder before the next package 2 PR (bring it back on the branch after the merge)

Package 1 (Kaution, six wrong Settlements calculations) is merged: PR #67, main c1b8774.
Package 2 A + B (12 items: letters + saved dates) is merged: PR #68, main d507335 (20.11.2026) —
items 32, 33, 34, 35, 37, 42, 39, 41, 36, 40 (A) and 29, 57 (B), plus the review fixes (Rentals sent letter keeps its
date, a line sent with "NK-Abrechnung erstellen" opens that archived letter, "1 day" on Rentals screens).

Still open: the other 26 package 2 items, in `k2-items.json` (all except the 12 above).
Most important of them (money / buttons): 53 (Casa added tenant can't be removed once locked, still counts in every
share), 30 (NK cleared in Controlling, the tenant card still says paid), 31 (WEG result corrected: Settlements says
received while money went out). The rest: wrong numbers on screen only, wrong words only, buttons / statuses.

- `k2-items.json`: the 38 items (Rentals 16, Casa Castel 11, Dashboard / Tracking 11) — 12 of them done in PR #68.
- `k2-map.json`: the technical map of those items and its review.
- `settlements-bugs-validated.json`: the 51 validated Settlements bugs the list came from.
- `addendum-k1-walkthrough.json`: 8 more candidates seen in package 1's last checks (RNT-LEERSTAND-PERIOD = item 22).
  Main shows them too; check each again before fixing.

Plan agreed with the owner: smaller PRs by area, each merged the same day; items that only change text get a quick check.
Repro scripts of the audit: scratchpad rt/sb/<area>/… (REPO=<tree> node …), see each item's audit.repro.
