/* =============================================================================
 *  Kampagne: Mitarbeiterfluktuation in Arztpraxen
 *
 *  Erstansprache plus zwei Nachfassmails im Abstand von je sieben Tagen.
 *
 *  Diese Datei darf bearbeitet werden, ohne den uebrigen Code anzufassen —
 *  es ist reiner Text. Nach einer Aenderung den Dienst neu starten.
 *
 *  WICHTIG: Eine Aenderung am Text ergibt eine neue Send-ID. Wer den Text
 *  aendert, nachdem eine Mail schon draussen ist, kann sie damit an dieselbe
 *  Person erneut schicken — aber nur, wenn der Datensatz wieder auf "queued"
 *  steht. Im laufenden Betrieb also besser eine neue Kampagne anlegen, statt
 *  eine laufende umzuschreiben.
 *
 *  Zum Text: Die Fassung hier ist sprachlich ueberarbeitet — Sie-Anrede
 *  durchgehend gross, Portemonnaie statt Portmonee, ein paar Saetze
 *  geradegezogen. Die Aussage ist unveraendert. Was genau geaendert wurde,
 *  steht im README unter "Die Kampagne mfa-fluktuation".
 * ========================================================================== */

'use strict';

module.exports = {
  schluessel: 'mfa-fluktuation',
  name: 'Mitarbeiterfluktuation in Praxen',

  /* Welches Postfach. Muss in SENDER_ACCOUNTS stehen. Fuer Kaltakquise die
     zweite Domain nehmen, damit die Zustellbarkeit von finanz-medizin.com
     unberuehrt bleibt — siehe README, Abschnitt "Zweite Domain". */
  absender: 'akquise',

  /* Bei welchen Werten die Sequenz abbricht. Zusaetzlich zu den globalen
     Abbruchbedingungen aus SEQUENCE_STOP_IF. */
  abbruchWenn: {
    hs_lead_status: ['CONNECTED', 'QUALIFIED', 'UNQUALIFIED'],
    lifecyclestage: ['opportunity', 'customer']
  },

  schritte: [
    /* ---------------------------------------------------------------- 1 */
    {
      nachTagen: 0,
      betreff: 'Warum gute MFAs selten bleiben',
      rumpf:
`{{anrede}},

mein Name ist Benedict Hintz, ich bin Geschäftsführer von Finanz Medizin. Der häufigste Grund, warum Praxispersonal kündigt: Mehr Gehalt kommt nicht im Portemonnaie an. Wer einfach das Brutto erhöht, erreicht damit nicht automatisch mehr Netto.

Erfahrungsgemäß denkt fast jeder Praxisinhaber, er zahle gut genug, damit seine Leute bleiben. Genau das ist der Trugschluss. Häufig sind die Mitarbeiter längst weg, bevor es überhaupt zur Gehaltserhöhung kommt — weil am Markt bereits andere Angebote liegen.

Deshalb kommen die meisten Praxen mit derselben Frage auf uns zu: Wie lässt sich der Arbeitsplatz attraktiver machen, ohne dass es dem Geschäftskonto wehtut und ohne dass ein großer Teil der Erhöhung beim Finanzamt landet?

So senken unsere Kunden innerhalb weniger Wochen die Fluktuation, sparen sich unnötige Stellenanzeigen und vor allem die Zeit für Bewerbungsgespräche, die am Ende zu nichts führen. Über 50 Mandanten haben wir dabei bereits begleitet.

Dafür haben wir ein Konzept entwickelt, mit dem sich individuelle Lösungen in Ihrer Praxis umsetzen lassen — Lösungen, auf die Ihre Mitarbeiter wirklich Lust haben und die im Portemonnaie ankommen.

Dazu würde ich Sie gern zu einem kurzen Kennenlernen einladen. Wir schauen uns an, was Sie Ihren Mitarbeitern heute bieten und womit die Konkurrenz gerade um genau diese Leute wirbt.

Hier können Sie einen Termin wählen:
{{booking_link}}

Oder Sie antworten einfach auf diese Mail mit zwei bis drei Terminvorschlägen.

Mit freundlichen Grüßen
Ihr Finanz-Medizin-Team`
    },

    /* ---------------------------------------------------------------- 2 */
    /* Kurz, ein neuer Gedanke, dieselbe Bitte. Wer nachfasst und dabei nur
       "ich wollte nochmal nachhaken" schreibt, hat den zweiten Versuch
       verschenkt. */
    {
      nachTagen: 7,
      betreff: 'Nachgefragt: was 500 Euro mehr Brutto wirklich bringen',
      antwortAufVorherige: true,
      rumpf:
`{{anrede}},

kurz konkret, weil die Zahl fast immer überrascht: Von 500 Euro mehr Brutto bleiben einer MFA je nach Steuerklasse oft nur rund 250 bis 300 Euro netto. Die Praxis zahlt zusätzlich die Arbeitgeberanteile — es kostet also deutlich mehr, als beim Mitarbeiter ankommt.

Genau an dieser Lücke setzen wir an. Es gibt Bausteine, bei denen fast der volle Betrag beim Mitarbeiter landet und die Praxis trotzdem weniger zahlt als für die Gehaltserhöhung.

Welche davon für Ihre Praxis in Frage kommen, hängt von Ihrer Struktur ab. Das lässt sich in einem kurzen Gespräch klären:
{{booking_link}}

Mit freundlichen Grüßen
Ihr Finanz-Medizin-Team`
    },

    /* ---------------------------------------------------------------- 3 */
    /* Letzte Nachricht, mit ausdruecklichem Ausstieg. Wer hier keinen
       sauberen Ausweg anbietet, wird als Spam markiert — und das schadet
       der Domain mehr, als der eine Kontakt nutzt. */
    {
      nachTagen: 7,
      betreff: 'Letzte Nachricht von mir',
      antwortAufVorherige: true,
      rumpf:
`{{anrede}},

ich möchte nicht aufdringlich werden, deshalb ist das meine letzte Nachricht zu diesem Thema.

Falls Mitarbeiterbindung bei Ihnen gerade nicht ansteht: einfach kurz "kein Interesse" antworten, dann melde ich mich nicht wieder.

Falls doch, der Zeitpunkt aber ungünstig ist, sagen Sie mir gern, wann ich mich wieder melden soll. Und wenn es jetzt passt:
{{booking_link}}

Mit freundlichen Grüßen
Ihr Finanz-Medizin-Team`
    }
  ]
};
