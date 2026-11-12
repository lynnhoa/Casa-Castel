# Casa Castel — notes for Claude

## Owner decisions (deliberate — never report these as bugs)

- **Contract generator, "Voller Monat":** a "Voller Monat" choice (Erster / Letzter Monat) stays in force
  even when the switch is hidden (e.g. Mietbeginn moved to the 1st). Deliberate — keep it, no warning.
- **No extra messages:** don't add warnings / toasts / hints for small input slips (e.g. a mistyped Kaution
  that falls back to the rule amount). The owner does not want messages everywhere.
- **Casa Castel has no Mieterhöhung — deliberate, permanent.** Never ask the owner to run CASA-MIETERHOEHUNG.sql,
  never report the missing `casa_mieterhoehung_history` table or a "Not saved" on a Casa Mieterhöhung as a bug,
  and never build, repair or suggest Casa Mieterhöhungen. (Rentals keeps its Mieterhöhung / Index / Korrektur.)
- **Rentals data checks are done (09.11.2026):** RENTALS-CHECK.sql and PARKING-MINDESTLAUFZEIT.sql came back clean —
  no repair SQL, and PARKING-MINDESTLAUFZEIT-FIX.sql is not to be run.
- **Kaution = the tenant's money (11.11.2026).** Receiving, holding or refunding a Kaution is never counted in
  Controlling — not as income, not as an expense, no "On purpose · Kaution" reason. (§ 551 BGB: kept apart from own money.)
- **Only the Verrechnung counts, once it happens.** A part held for the NK-Abrechnung counts 0 € while held. When that NK
  is settled, Controlling books ONE line = held part + what the tenant really transferred − what the owner really paid
  back, dated the day the money moved. Examples with 300 € held: Nachzahlung 200 → +200 · Nachzahlung 450 → +450 ·
  Guthaben 50 → −50 · balanced → 0 (the "Paid back" tap books nothing). The part going back is never counted.
- **Bank transfer only.** An NK result is never settled "with the rent" or by a free "via Kaution" choice. Old stored
  results ("miete", old confirmed "via Kaution" rows without a booking) stay as stored — never convert them.
- **Rent owed / damage kept from the Kaution are entered once, on the Kaution card** (move-out form: Rent owed + Month,
  Damage + Reason, optional "From receipt"). The card books the rent month as received in Controlling (kau_part on
  ctrl_income_months) and the damage as one "Erstattung Mieter · … · aus Kaution" income line. Nothing is written to
  Maintenance. "Kept · other reasons" books nothing. Needs KAUTION-K1B.sql; without it the card works as before.
- **Kaution card limits are deliberate:** the new rows only show for tenants who have moved out; "Kept · for
  NK-Abrechnung" only for tenants with an NK-Abrechnung; the hold is used by the first NK letter dated on or after
  "Settled on".
- **Tenants carry the costs, not the owner (R5)** — wherever law and contract allow a choice (e.g. Heizkosten /
  Warmwasser 30 % by days / 70 % by consumption), choose the one that charges the tenants. Never more than the real
  costs; empty days stay with the owner by law. Never report such a choice as a bug.
- **Keep it simple (R4):** clear, user-friendly, no hidden functions, no extra levels.

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
