# Gesprächsmitschriften mit Fathom

Beratungsgespräche laufen als Google Meet. Fathom tritt bei, transkribiert und
fasst zusammen; die Zusammenfassung landet anschließend automatisch als Notiz am
richtigen Vorgang in Close. Niemand tippt etwas ab.

Diese Datei beschreibt die Einrichtung. Der Code dazu steht in
`lib/fathom-core.js` und `netlify/functions/fathom.js`; die Meet-Räume erzeugt
`lib/booking-core.js` beim Anlegen des Termins.

---

## Die Kette im Überblick

| # | Was passiert | Wo |
|---|---|---|
| 1 | Jemand bucht ein Erstgespräch | `assets/js/booking.js` |
| 2 | Termin mit Google-Meet-Raum wird angelegt, Lead in Close | `lib/booking-core.js` |
| 3 | Fathom sieht den Termin im verbundenen Kalender und tritt bei | Fathom |
| 4 | Fathom meldet die fertige Mitschrift an `/api/fathom` | Fathom → Netlify |
| 5 | Zuordnung über die E-Mail-Adresse, Notiz am Lead | `lib/fathom-core.js` |

Reißt die Kette an einer Stelle, reißt sie leise: Ein Gespräch ohne Mitschrift
bleibt ein Gespräch. Nichts davon darf eine Buchung verhindern — deshalb ist
jeder Schritt ab 2 gegen Fehlschläge abgesichert.

---

## 1 · Voraussetzung: Der Termin muss ein Meet sein

Ohne Videoraum gibt es nichts zu transkribieren. `lib/booking-core.js` legt den
Termin deshalb mit `conferenceData` an — versucht es jedenfalls.

**Das ist die Stelle, die erfahrungsgemäß klemmt.** Ein Google-Dienstkonto darf
ohne *Domain-Wide Delegation* weder einen Meet-Raum erzeugen noch einen fremden
Teilnehmer eintragen; Google antwortet mit 403. Der Code versucht es dann ein
zweites Mal ohne beides, damit die Buchung trotzdem gelingt. Im Log steht dann:

```
booking: Termin mit Meet-Raum abgelehnt (403) — zweiter Versuch ohne.
```

Zwei Wege führen aus dieser Lage:

**Weg A — Domain-Wide Delegation** (sauber, setzt Google Workspace voraus)

1. Google Cloud Console → Dienstkonto → *Details* → *Advanced settings* →
   Client-ID notieren
2. Google-Workspace-Admin → *Sicherheit* → *API-Steuerung* →
   *Domainweite Delegierung verwalten* → *Neu hinzufügen*
3. Client-ID eintragen, als Bereich `https://www.googleapis.com/auth/calendar`
4. In `lib/booking-core.js` müsste das JWT dann zusätzlich ein `sub`-Feld mit
   der zu vertretenden Adresse tragen — diese Zeile ist noch zu ergänzen, wenn
   dieser Weg gewählt wird.

**Weg B — fester Meet-Raum** (funktioniert sofort, auch ohne Workspace)

1. https://meet.google.com → *Neue Besprechung* → *Besprechungslink zum späteren
   Teilen erstellen*
2. Den Link (`https://meet.google.com/abc-defg-hij`) als Umgebungsvariable
   `GOOGLE_MEET_URL` in Netlify hinterlegen

Dann tragen alle Termine denselben Raum. Bei 25-Minuten-Gesprächen mit Vorlauf
ist das praktikabel; bei zwei Gesprächen direkt hintereinander sollte zwischen
ihnen eine Lücke stehen, sonst sitzen zwei Interessenten im selben Raum.

Der Link wird der buchenden Person unmittelbar auf der Bestätigung angezeigt und
steht zusätzlich in der Notiz in Close.

---

## 2 · Fathom mit dem Kalender verbinden

1. In Fathom anmelden (das Konto, das auch die Gespräche führt)
2. *Settings* → *Calendar* → den Google-Kalender verbinden, in dem die Termine
   landen — dieselbe Adresse wie `GOOGLE_CALENDAR_ID`
3. Unter *Recording* festlegen, wann der Notetaker beitritt

**Nicht auf „alle Termine automatisch aufzeichnen" stellen.** Aufgezeichnet wird
nur, wenn die Einwilligung vorliegt — siehe Abschnitt 5. Der Termin im Kalender
sagt, ob sie vorliegt: Fehlt sie, trägt der Titel den Zusatz
`[ohne Aufzeichnung]`, und in der Beschreibung steht
`Einwilligung zur Aufzeichnung: NEIN — nicht mitschneiden`.

---

## 3 · Webhook einrichten

Fathom meldet fertige Mitschriften an `https://finanz-medizin.com/api/fathom`.

1. Fathom → *Settings* → *API* → API-Schlüssel erzeugen
2. Webhook anlegen (Oberfläche oder API):

```bash
curl -X POST https://api.fathom.ai/external/v1/webhooks \
  -H "X-Api-Key: $FATHOM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "destination_url": "https://finanz-medizin.com/api/fathom",
        "triggered_for": ["my_recordings"],
        "include_summary": true,
        "include_action_items": true,
        "include_transcript": false
      }'
```

Die Antwort enthält ein Geheimnis (`whsec_…`). Es wird genau einmal angezeigt.

`include_transcript` steht bewusst auf `false`: Standardmäßig wandert nur die
Zusammenfassung ins CRM. Wer das Wortprotokoll dort haben will, setzt es auf
`true` **und** `FATHOM_NOTIZ=voll` — beides zusammen, damit es keine
Verkettung von Versehen wird.

---

## 4 · Umgebungsvariablen in Netlify

*Site configuration* → *Environment variables*:

| Variable | Pflicht | Wert |
|---|---|---|
| `FATHOM_WEBHOOK_SECRET` | ja | das `whsec_…` aus Schritt 3. Ohne dieses Geheimnis nimmt der Endpunkt nichts an |
| `FATHOM_API_KEY` | nein | nur nötig, wenn der Webhook Inhalte nicht mitliefert — dann werden sie nachgeholt |
| `FATHOM_NOTIZ` | nein | `zusammenfassung` (Vorgabe), `voll` oder `aus` |
| `FATHOM_EIGENE_DOMAENEN` | nein | Vorgabe `finanz-medizin.com`. Komma-Liste der eigenen Domains — diese Teilnehmer kommen für die Zuordnung nicht infrage |
| `FATHOM_LEAD_ANLEGEN` | nein | `ja` legt einen Lead an, wenn zur E-Mail-Adresse keiner existiert. Vorgabe: nein |
| `GOOGLE_MEET_URL` | nein | fester Meet-Raum, siehe Abschnitt 1, Weg B |

`CLOSE_API_KEY` wird ebenfalls gebraucht, ist aber für die Funnels ohnehin
gesetzt.

Nach dem Setzen einmal *Deploys* → *Trigger deploy* → *Clear cache and deploy
site*. Vorher greifen die Variablen nicht.

---

## 5 · Einwilligung — der Teil, der nicht optional ist

Ein Beratungsgespräch mitzuschneiden, ohne dass die Gegenseite zugestimmt hat,
ist in Deutschland nicht bloß ein Datenschutzverstoß, sondern nach § 201 StGB
strafbar (Verletzung der Vertraulichkeit des Wortes). Deshalb:

- Die Buchungsstrecke enthält ein **eigenes, freiwilliges Häkchen** für die
  Aufzeichnung — getrennt von der Pflichtzustimmung zur Kontaktaufnahme, nicht
  vorausgewählt, und ohne Nachteil, wenn es leer bleibt.
- Die Antwort steht im **Kalendertitel und in der Terminbeschreibung**, damit
  vor dem Gespräch ein Blick genügt.
- Sie steht ebenfalls in der **Notiz in Close**.
- Zu Beginn des Gesprächs **noch einmal mündlich fragen** und die Zustimmung im
  Mitschnitt festhalten. Das ist der Nachweis, der im Zweifel zählt.
- Widerruf ist jederzeit möglich. Dann die Aufzeichnung in Fathom löschen und
  die Notiz in Close entsprechend kürzen.

Abschnitt 6 der Datenschutzerklärung beschreibt das Ganze aus Kundensicht.

**Vor dem Livegang noch zu erledigen:** Mit Fathom einen
Auftragsverarbeitungsvertrag nach Art. 28 DSGVO schließen (Fathom stellt ein
DPA bereit) und den Eintrag im Verzeichnis von Verarbeitungstätigkeiten
ergänzen. Die Datenschutzerklärung nennt Fathom bereits — der Vertrag dahinter
muss dazu auch existieren.

---

## 6 · Abnahme

| Prüfung | Erwartung |
|---|---|
| Testtermin über die Seite buchen | Bestätigung zeigt einen Meet-Link; Termin im Kalender trägt ihn |
| Häkchen „Aufzeichnung" leer lassen | Kalendertitel endet auf `[ohne Aufzeichnung]` |
| `curl -X POST https://finanz-medizin.com/api/fathom -d '{}'` | `401` — ohne gültige Signatur wird nichts angenommen |
| Testgespräch mit Fathom aufzeichnen | Nach wenigen Minuten eine Notiz „Beratungsgespräch — Mitschrift von Fathom" am Lead |
| Netlify-Funktionslog | `fathom: keine Zuordnung` heißt: Die E-Mail-Adresse aus dem Kalender findet keinen Lead in Close |

Bleibt die Zuordnung aus, ist fast immer die Adresse schuld: Fathom kennt nur,
wer im Kalendereintrag als Teilnehmer steht. Ohne Domain-Wide Delegation trägt
das Dienstkonto keine Teilnehmer ein (siehe Abschnitt 1) — dann muss die
Einladung von Hand ergänzt werden, oder es wird Weg A gewählt.
