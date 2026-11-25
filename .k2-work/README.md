# Package 2 notes — delete this folder before the next package 2 PR (bring it back on the branch after the merge)

Package 1 (Kaution, six wrong Settlements calculations) is merged: PR #67, main c1b8774.
Package 2 A + B (12 items: letters + saved dates) is merged: PR #68, main d507335 (20.11.2026), re-check PR #69, main 779da20 (21.11.2026) —
items 32, 33, 34, 35, 37, 42, 39, 41, 36, 40 (A) and 29, 57 (B), plus the review fixes (Rentals sent letter keeps its
date, a line sent with "NK-Abrechnung erstellen" opens that archived letter, "1 day" on Rentals screens).

Still open: the other package 2 items, in `k2-items.json` (all except the 12 above), split into 10 small packages (owner OK 22.11.2026):
  1 Casa added tenants 53, 54 — DONE (PR #71, main 1dddd1f) · 2 Settlements↔Controlling 30, 31 — DONE (PR #72, main 6524785) · 3 Casa Pauschal+Kalt/NK 52, 56, PRE-SHEET-PERIOD — DONE (PR #73, main 423a47f) ·
  4 'Former tenant' switches 43, 44 — DONE, owner chose A: switch removed, letters unchanged (PR #74, main 4cdb8f3) · 5 Rentals JA/WEG status 55, 48, 50, 47 + WEG balanced text — DONE (PR #75, main f5d5dc4) · 6 Rentals NK window numbers 22, 23, 24 — DONE (PR #76, main 8a98511) ·
  7 Rentals tiles/lists 45, 49, 38 — DONE (PR #78, main 3acbaf5) · 8 Dashboard 46, 51 (owner decision), 58 · 9 words 60, 61, 62, 64, 65 · 10 Kaution card leftovers (addendum).
The most important ones (money / buttons: 53, 30, 31) are done, and packages 3 (52, 56, sheet period), 4 (43, 44) 5 (55, 48, 50, 47) and 6 (22, 23, 24). The rest: wrong numbers on screen only, wrong words only,
buttons / statuses.

Package 5 (PR #75) also fixed the Controlling text of a paid WEG result corrected to "balanced": it now reads "the
Abrechnung is now balanced" (was "a Guthaben of 0,00 € – settle it again in Settlements"). The booking stays on purpose
(the money went out; delete it in Controlling if it did not). Notes for later: sdRentals().steps (Dashboard) is computed
but never drawn — its 'Frist soon' text has no visible effect. Also known since package 2: a line whose Ist was cleared BEFORE PR #72 still says
'erledigt' (the fix works from the next clearing) — no repair planned unless the owner asks.

Known since package 7 (PR #78), older than it, left as it is:
- A letter sent BEFORE PR #78 has no ts.as_sent: its window keeps the live calculation below the sent result (no
  figures are made up). Letters sent from PR #78 on keep their figures (ts.as_sent: at, sum, vz, src, lines).
- With no archived copy at all (archive failed) and costs corrected after the send, "Open letter (PDF)" draws the
  letter from today's costs (same as before). Possible later fix: keep the button off / draw from ts.as_sent.
- Not applied from the audit: renaming the chip 'letter ready' → 'to send'.

Other work merged the same day (not package 2): PR #77 kitchen chat — the red missed line wraps inside the chat,
a late proof's photos show once (under the week it arrives in; the week it was for keeps a compact "↑ Late proof" line).
PR #79 photos (main e1f6f01): in-app camera that stays open + swipe view with delete for the 3 Übergabeprotokolle and the
Schadensbericht; photos kept per protocol until Approve / Cancel / Discard; Approve no longer saves an old Draft after photo
changes; Beschreibung kept on ✕. Noted, older than it: a change made while a Draft PDF is still being created (or Mediathek
photos still being read) is missing from that Draft; Renovierung list numbers vs PDF order (Vorher first).
To check on the owner's iPhone: camera permission, sideways, after a call, Casa ↔ Rentals, a 24-photo protocol through Approve.
PR #80 (main 8108f50): Rentals Übergabeprotokoll / Renew open right over Tenants — the generators live on the page (as Casa);
before, the Apartments / Parking list flashed first (tab switch + 80 ms) and the app jumped back on close.
PR #81 (main 9cdaf01): Maintenance receipts as the Übergabe — Camera from the first photo (no "Next part"), thumbnails with ×, large
view; × on the camera strip (receipts + Übergabe; not the Bericht camera, which stores at once); file names "Beleg <No.> <Shop> <What> <Date>"
(return "Rückgabe …", "(2)"), set on every save. Owner to check on the iPhone: camera, strip ×, names after save.

Known since package 6 (PR #76), older than it, left as it is (fixes would change letters or move costs from the tenants):
- A one-off typed by hand as exactly a list name (e.g. 'Heizkosten') and marked for the NK is stored by the sync as kind
  'sonst' with that label; a later save of the record maps it to 'heizung'. With heating meters, the letter then splits it
  by meters while the open window keeps the days split until reopened, and the letter depends on whether a save happened.
  Repro: scratchpad k2p6/rv/openwin/w4b-auto-heat-meters.js. Proper fix = one rule for auto rows (owner decision).

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
