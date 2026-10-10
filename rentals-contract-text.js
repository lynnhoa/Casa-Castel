/* ─────────────────────────────────────────────────────────────
   RENTALS — CONTRACT TEXT (Oct 2026)
   rentals-contract-text.js

   The paragraphs of the Kurzzeitmietvertrag and the Mietvertrag
   (Apartments tab). One order, the same § numbers in both:

     §1 Mietzeit ↔         §9  Tierhaltung
     §2 Nutzung            §10 Betreten des Mietobjekts
     §3 Kündigung ↔        §11 Übergabe und Rückgabe
     §4 Miete ↔ + ending   §12 Haftpflichtversicherung
     §5 Untervermietung    §13 Hausordnung
     §6 Schlüsselübergabe  §14 Datenschutz
     §7 Kaution            §15 Sonstige Vereinbarungen
     §8 Kleinreparaturen   §16 Energieausweis (only when filled)

   ↔ = each contract keeps its own function (Kurzzeit: fixed end,
   no ordinary Kündigung, pro-rata days · Mietvertrag: unbefristet
   with 3 months, or befristet with Grund, Staffelmiete).
   Everything else is word-for-word identical — kept in ONE place
   here so the two contracts can never drift apart again.
   Gewerbe and Parking contracts are not affected.

   rntContractClauses(d, kind, eur, cl)
     d    the contract data (_buildRentalKurzzeitData / _buildRentalMietvertragData)
     kind 'kurzzeit' | 'mietvertrag'
     eur  the template's euro formatter
     cl   the template's clause markup (num, title, body, first)
   ───────────────────────────────────────────────────────────── */

function rntContractClauses(d, kind, eur, cl) {
  const isKz  = kind === 'kurzzeit';
  const blank = '______________';
  const multi = !!(d.hasMieter2 || d.hasMieter3);

  // §1 Mietzeit ↔
  const s1 = isKz
    ? `Das Mietverhältnis ist befristet und endet am ${d.mietende || blank} automatisch ohne Kündigung. ` +
      'Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen. Ein Anspruch auf Verlängerung besteht nicht.'
    : d.befristet
      ? `Das Mietverhältnis ist gemäß \u00a7\u00a0575 Abs.\u00a01 BGB befristet und endet am ${d.mietende || blank} automatisch ohne Kündigung.` +
        (d.grundLabel ? ' Befristungsgrund: ' + d.grundLabel + (d.eigenbedarfPerson ? ' \u2014 ' + d.eigenbedarfPerson : '') + '.' : '') +
        ' Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen.'
      : `Das Mietverhältnis beginnt am ${d.mietbeginn || blank} und läuft auf unbestimmte Zeit.`;

  // §2 Nutzung des Mietobjekts — identical
  const s2 = `Die Wohnung darf ausschließlich zu Wohnzwecken durch ${multi ? 'die namentlich genannten Mieter' : 'den namentlich genannten Mieter'} genutzt werden. ` +
    'Der Mieter ist verpflichtet, die Wohnung und die Gemeinschaftsflächen schonend, sauber und ordnungsgemäß zu behandeln, ausreichend zu heizen, zu lüften und von Ungeziefer freizuhalten. ' +
    'Mängel sind dem Vermieter unverzüglich in Textform anzuzeigen.';

  // §3 Kündigung ↔ (Kurzzeit short · Mietvertrag unbefristet 3 months · befristet like Kurzzeit + Verlängerung)
  const noOrdinary = 'Eine ordentliche Kündigung ist ausgeschlossen. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund (\u00a7\u00a0543 BGB) bleibt unberührt.';
  const s3 = isKz ? noOrdinary
    : d.befristet
      ? noOrdinary + ' Im Falle einer Verlängerung beträgt die Kündigungsfrist für den Mieter 3\u00a0Monate zum Monatsende.'
      : 'Die ordentliche Kündigung richtet sich nach \u00a7\u00a0573c BGB. Kündigungsfrist für den Mieter: 3\u00a0Monate zum Monatsende. ' +
        'Für den Vermieter gilt die gesetzlich gestaffelte Frist. Die Kündigung bedarf der Schriftform. ' +
        'Eine stillschweigende Verlängerung nach \u00a7\u00a0545 BGB ist ausgeschlossen. Die außerordentliche Kündigung aus wichtigem Grund bleibt unberührt.';

  // §4 Miete ↔ own first part + the same ending
  let s4;
  if (isKz) {
    s4 = `Die monatliche Pauschalmiete beträgt ${eur(d.monatlMiete)}. Alle Nebenkosten (Betriebskosten gemäß obiger Liste) sind in der Pauschale enthalten. ` +
      'Zieht der Mieter nicht zum Ersten eines Monats ein oder zum Letzten eines Monats aus, werden die Tage anteilig berechnet; ' +
      'der Tagespreis ergibt sich aus der Monatsmiete geteilt durch die Kalendertage des jeweiligen Monats.';
  } else {
    const hasStaffel = !!(d.staffelAn && d.staffeln && d.staffeln.length);
    const kalt = hasStaffel && d.anfangsmiete ? d.anfangsmiete : d.kaltmiete;
    s4 = d.pricingMode === 'kalt_nk'
      ? `Die monatliche Miete beträgt ${eur(d.gesamtmiete)} (Kaltmiete ${eur(kalt)} zzgl. Nebenkostenvorauszahlung ${eur(d.nkVorauszahlung)}).`
      : `Die monatliche Pauschalmiete beträgt ${eur(d.gesamtmiete)} inkl. Nebenkosten.`;
    if (hasStaffel) {
      s4 += ` Die Kaltmiete ist gemäß \u00a7\u00a0557a BGB gestaffelt: ab ${d.mietbeginn || 'Mietbeginn'} ${eur(d.anfangsmiete)}` +
        d.staffeln.map(st => `; ab ${st.datum} ${eur(st.betrag)}`).join('') + '. ' +
        'Jede Staffel gilt für mindestens zwölf Monate. Während einer laufenden Staffel ist eine Mieterhöhung nach \u00a7\u00a7\u00a0558, 559 BGB ausgeschlossen.';
    }
  }
  s4 += ' Die Miete ist spätestens bis zum dritten Werktag des Monats auf das oben genannte Konto zu überweisen (\u00a7\u00a0556b BGB). ' +
    'Bei Zahlungsverzug ist der Vermieter berechtigt, Verzugszinsen gemäß \u00a7\u00a0288 BGB geltend zu machen.';

  // §6 Schlüsselübergabe — identical (Briefkasten only when there is one)
  const hs = d.hausstuerschluessel ?? 1;
  const ws = isKz ? (d.wohnungsschluessel ?? 1) : (d.zimmerschluessel ?? 1);   // Mietvertrag: the apartment's Wohnungsschlüssel
  const bk = Number(d.briefkastenschluessel) || 0;
  const s6 = `Der Mieter erhält bei Einzug ${hs}\u00a0Haustürschlüssel und ${ws}\u00a0Wohnungsschlüssel` +
    (bk > 0 ? ` sowie ${bk}\u00a0Briefkastenschlüssel` : '') + '. ' +
    'Weitere Schlüssel bedürfen der vorherigen Zustimmung (Textform). Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs. ' +
    'Alle Schlüssel sind bei Auszug zurückzugeben.';

  // §7 Kaution — identical (renewal: the existing Kaution stays)
  const fael = String(d.kautionFaelText || 'sofort nach Vertragsunterzeichnung');
  const s7 = (d.kautionBestehend
      ? 'Die vom Mieter bereits geleistete Kaution' + (d.kaution ? ' von ' + eur(d.kaution) : '') +
        ' bleibt bestehen und sichert auch dieses Mietverhältnis; eine erneute Zahlung ist nicht erforderlich.'
      : `Der Mieter überweist die Kaution von ${eur(d.kaution)} ${fael.startsWith('sofort') ? fael : fael + ' nach Unterzeichnung dieses Vertrages'} auf das oben genannte Konto.`) +
    ' Der Vermieter legt die Barkaution getrennt von seinem Vermögen auf einem Kautionskonto an (\u00a7\u00a0551 BGB). Rückzahlung nach Prüfung des Zustands bei Auszug.';

  // §11 Übergabe und Rückgabe — identical ("möbliert" only with an inventory)
  const furnished = Array.isArray(d.inventar) && d.inventar.length > 0;
  const s11 = `Die Wohnung wird ${furnished ? 'möbliert und ' : ''}in vertragsgemäßem Zustand übergeben. ` +
    'Bei Ein- und Auszug wird ein Übergabeprotokoll erstellt und von beiden Parteien unterzeichnet. ' +
    'Bei Vertragsende ist die Wohnung vollständig geräumt, gereinigt und in vertragsgemäßem Zustand mit allen Schlüsseln zurückzugeben; bauliche Änderungen sind zurückzubauen.';

  // §16 Energieausweis — only when one of the apartment's three fields is filled
  const en = [];
  if (d.energieklasse)     en.push('Energieeffizienzklasse: ' + d.energieklasse + '.');
  if (d.endenergiebedarf)  en.push('Endenergiebedarf: ' + d.endenergiebedarf + '\u00a0kWh/(m\u00b2\u00b7a).');
  if (d.energieausweisart) en.push('Art des Ausweises: ' + d.energieausweisart + '.');

  const list = [
    ['1',  'Mietzeit', s1],
    ['2',  'Nutzung des Mietobjekts', s2],
    ['3',  'Kündigung', s3],
    ['4',  'Miete', s4],
    ['5',  'Untervermietung', 'Eine Untervermietung oder sonstige Überlassung des Mietobjekts an Dritte ist nicht gestattet.'],
    ['6',  'Schlüsselübergabe', s6],
    ['7',  'Kaution', s7],
    ['8',  'Kleinreparaturen', 'Kleinreparaturen an häufig zugänglichen Gegenständen bis 150\u00a0\u20ac pro Maßnahme, max. 8\u202f% der Jahres-Nettokaltmiete p.\u202fa.'],
    ['9',  'Tierhaltung', 'Kleintiere ohne Belästigungspotenzial (Zierfische, Kleinnager) sind erlaubt. Alle weiteren Tiere bedürfen der Zustimmung (Textform).'],
    ['10', 'Betreten des Mietobjekts', 'Bei Gefahr im Verzug jederzeit. Zur Vorbereitung von Verkauf oder Weitervermietung werktags 9:00–12:00 und 15:00–19:00\u202fUhr, mind. 2\u00a0Werktage Vorankündigung (Textform).'],
    ['11', 'Übergabe und Rückgabe', s11],
    ['12', 'Haftpflichtversicherung', 'Der Mieter unterhält für die Dauer des Mietverhältnisses eine private Haftpflichtversicherung und weist sie auf Verlangen nach.'],
    ['13', 'Hausordnung', 'Rauchen ist im gesamten Gebäude nicht gestattet. Nachtruhe gilt von 22:00–07:00\u202fUhr.'],
    ['14', 'Datenschutz', 'Personenbezogene Daten werden gem. Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO ausschließlich zur Vertragsabwicklung verarbeitet, nicht an Dritte weitergegeben und nach Ablauf der gesetzlichen Aufbewahrungsfristen gelöscht.'],
    ['15', 'Sonstige Vereinbarungen', 'Mündliche Nebenabreden bestehen nicht. Änderungen bedürfen der Schriftform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Es gilt deutsches Recht. Gerichtsstand ist ' + (d.gerichtsstand || blank) + '.'],
  ];
  if (en.length) list.push(['16', 'Energieausweis (\u00a7\u00a016a GEG)', 'Der Vermieter hat dem Mieter vor Vertragsschluss den Energieausweis vorgelegt. ' + en.join(' ')]);

  return list.map(([n, t, b], i) => cl(n, t, b, i === 0)).join('\n    ');
}
