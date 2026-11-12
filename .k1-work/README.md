# Work notes (paused 12.11.2026) — delete this folder before the package 1 PR

Package 1 (Kaution workflow + K1b card linking + critical Settlements fixes) is combined on this branch.
State: e6232fd (combine + review fixes, review-fix check interrupted) + the settle fixes (unchecked).
Still to do before merge:
- Card fixes: check:k1b:f4 new problems 0-3, CARD-1/F3 (open at once, fixed 'From receipt' slot), F2 (one-sum change month).
- Check the review fixes (R-F1, R-F2, R-F3, casa-txt-1/2) and the settle fixes (F1, CARD-2, F4).
- Full regression, phone walkthrough + picture guide, PR, merge.
Findings and verdicts: k1-review-findings.json. Package 2 (paused until next week): k2-items.json, k2-map.json.

## Six critical calculation fixes alone (paused 12.11.2026, 14:30)
Built on main 511dbef as branch crit-local (b7946ea + 8442d1d); patches in crit/ (apply with `git am` on 511dbef).
First independent check: 1 still broken + 1 new problem, both fixed in 8442d1d. The second independent check was
running when paused. To finish: re-run that check, then PR + merge.
