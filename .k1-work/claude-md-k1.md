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
