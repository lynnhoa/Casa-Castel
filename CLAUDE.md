# Casa Castel — notes for Claude

## Owner decisions (deliberate — never report these as bugs)

- **Contract generator, "Voller Monat":** a "Voller Monat" choice (Erster / Letzter Monat) stays in force
  even when the switch is hidden (e.g. Mietbeginn moved to the 1st). Deliberate — keep it, no warning.
- **No extra messages:** don't add warnings / toasts / hints for small input slips (e.g. a mistyped Kaution
  that falls back to the rule amount). The owner does not want messages everywhere.

## Owner facts

- **London is 16 m²** (not 26, not 25). PREISLISTE-ROOMS.sql has the same value.
- **Kurzzeit Pauschal with 0 € "davon NK" can be intentional** (e.g. Dhruv Iyengar, Petteri Tuomola, Maria Porro,
  June 2026) — never repair these as "missing NK part" (DATA-CHECK section A, strength 3).
- **Renzo Zavala Rivera (New York): NK 100 € from move-in on** — the NK-Anpassung 01.10.2025 to 100 € is not damage.
- **Data check of 08.11.2026 is done:** only Renzo's renewal end was repaired (contract_end 30.09.2027).

## What counts as a real bug (owner)

- Cosmetic errors that show wrong or sloppy output (wrong text, wrong format, layout) — important.
- Functional glitches: blinking / flashing screens, things that don't open, don't save, don't delete,
  wrong amounts or dates written.
