# Casa Castel — notes for Claude

## Owner decisions (deliberate — never report these as bugs)

- **Contract generator, "Voller Monat":** a "Voller Monat" choice (Erster / Letzter Monat) stays in force
  even when the switch is hidden (e.g. Mietbeginn moved to the 1st). Deliberate — keep it, no warning.
- **No extra messages:** don't add warnings / toasts / hints for small input slips (e.g. a mistyped Kaution
  that falls back to the rule amount). The owner does not want messages everywhere.

## What counts as a real bug (owner)

- Cosmetic errors that show wrong or sloppy output (wrong text, wrong format, layout) — important.
- Functional glitches: blinking / flashing screens, things that don't open, don't save, don't delete,
  wrong amounts or dates written.
