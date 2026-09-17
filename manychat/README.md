# Instagram-Automation „Beratung" (ManyChat)

**Eine** Automation, **eine** Nachricht. Wer dem Instagram-Profil „Beratung"
schreibt, bekommt binnen Sekunden eine Antwort mit drei Knöpfen — je einer pro
Zielgruppe. Der Knopf führt nicht auf die Startseite, sondern direkt in den Check
weiter unten auf der passenden Seite, wo Rolle, Anliegen und Kontaktdaten
eingetragen werden. Die Anfrage läuft von dort über `/api/lead` ins CRM.

Absichtlich klein gehalten: keine Verzögerungen, keine Erinnerungen, keine Tags,
keine Custom Fields, keine Integration. Damit läuft die Strecke im Free-Plan und
besteht aus genau einem beweglichen Teil.

---

## Was der Free-Plan hergibt

Stand September 2026, nach der Umstellung vom 2. März 2026:

| | Free |
|---|---|
| Aktive Automationen gleichzeitig | **4** |
| Aktive Kontakte pro Monat | **25** |
| Kanäle | 2 (z. B. Instagram + Messenger) |
| Nutzer / Inbox-Plätze | 1 |
| Keyword-Auslöser, Kommentar-zu-DM, Default Reply | enthalten |
| Broadcasts, Integrationen, AI, WhatsApp/SMS | nicht enthalten |

**Die echte Grenze sind die 25 Kontakte, nicht die Zahl der Automationen.** Ein
Kontakt gilt als aktiv, sobald die Automation im Abrechnungsmonat mit ihm
interagiert. Ab dem 26. Menschen antwortet sie nicht mehr — die Nachricht läuft
dann ins Leere, ohne dass es jemandem auffällt.

Praktisch heißt das:

- Für eine Bio-Verlinkung und gelegentliche DMs reicht Free.
- Sobald ein Reel läuft, ist das Kontingent an einem Tag weg. Ein einziges
  ordentlich laufendes Video mit Kommentar-Auslöser sprengt es.
- Deshalb: **wöchentlich in ManyChat unter Contacts nachsehen**, wie viele aktive
  Kontakte der Monat schon verbraucht hat. Wird es regelmäßig eng, ist Pro fällig —
  oder die Automation läuft nur in Phasen, in denen sie gebraucht wird.

Limits und Preise ändert ManyChat ohne Vorwarnung. Vor dem Einrichten einmal in
**Settings → Billing** nachsehen, was im Konto tatsächlich steht.

---

## Die Links

In `netlify.toml` liegen Kurzadressen, die direkt in den Check der jeweiligen Seite
springen und die Instagram-Herkunft als UTM-Parameter mitführen:

| Adresse | landet |
|---|---|
| `finanz-medizin.com/check-praxis` | Praxis-Check auf `praxisinhaber.html` |
| `finanz-medizin.com/check-arzt` | Vermögens-Check auf `angestellte-aerzte.html` |
| `finanz-medizin.com/check-mfa` | Vorsorge-Check auf `mfa-praxisteam.html` |
| `finanz-medizin.com/beratung` | Zielgruppen-Weiche auf der Startseite |
| `finanz-medizin.com/termin` | Terminauswahl auf `ueber-uns.html` |

Die Parameter landen über `sessionStorage` in der Anfrage und stehen in der
CRM-Notiz unter „Kampagne" — Sie sehen bei jeder Anfrage, dass sie aus dem
Instagram-DM kam und welchen Knopf die Person gedrückt hat.

---

## Die Nachricht

### Textteil

```
Schön, dass Sie da sind — und danke für die Nachricht.

Damit Sie nicht die Standardantwort bekommen: Auf der Website stehen ein paar
Fragen zu Ihrer Situation. Rund 90 Sekunden, keine Unterlagen nötig. Danach
weiß ich, worum es bei Ihnen geht, und melde mich mit einem konkreten
Vorschlag statt mit Allgemeinplätzen.

Suchen Sie sich unten aus, was auf Sie zutrifft — der Knopf führt direkt zu
den Fragen.
```

### Karte mit drei Knöpfen

| Feld | Inhalt |
|---|---|
| Titel | `Ihre Situation in 90 Sekunden` |
| Untertitel | `Fünf Fragen. Danach melde ich mich persönlich.` |
| Bild | optional, quadratisch, 1080 × 1080 px |
| Button 1 | `Ich habe eine Praxis` → Open Website → `https://www.finanz-medizin.com/check-praxis` |
| Button 2 | `Ich bin angestellt` → Open Website → `https://www.finanz-medizin.com/check-arzt` |
| Button 3 | `MFA / Praxisteam` → Open Website → `https://www.finanz-medizin.com/check-mfa` |

Drei Knöpfe sind auf Instagram das Maximum pro Karte — mehr Zielgruppen passen
nicht, und mehr braucht die Seite auch nicht.

### Zweite Textnachricht, direkt danach

```
Zur Einordnung: Wir sind Versicherungsvermittler nach § 34d GewO und
Finanzanlagenvermittler nach § 34f GewO. Alle Pflichtangaben stehen hier:
finanz-medizin.com/impressum
```

Das ist die Erstinformation nach § 15 VersVermV, fällig beim ersten
Geschäftskontakt — eine Zeile, kein Datenschutztext. Wer sie nicht will, löscht sie
hier mit, damit die Datei zeigt, was tatsächlich verschickt wird.

### Falls Knöpfe nicht angezeigt werden

Manche Instagram-Versionen zeigen Karten nicht sauber an. Dann diese Fassung als
reine Textnachricht verwenden — Instagram macht die Adressen klickbar:

```
Schön, dass Sie da sind — und danke für die Nachricht.

Auf der Website stehen ein paar Fragen zu Ihrer Situation. Rund 90 Sekunden,
keine Unterlagen nötig. Danach melde ich mich mit einem konkreten Vorschlag.

Passend zu Ihnen:
Eigene Praxis: finanz-medizin.com/check-praxis
Angestellt in Klinik oder Praxis: finanz-medizin.com/check-arzt
MFA oder Praxisteam: finanz-medizin.com/check-mfa
```

---

## Einrichtung, Schritt für Schritt

### 1. Voraussetzungen

| Voraussetzung | Hinweis |
|---|---|
| Instagram **Professional-Konto** (Business oder Creator) | Privatkonten können nicht automatisiert werden |
| Verknüpfte Facebook-Seite | Meta verlangt das für die Messaging-API |
| *Zugriff auf Nachrichten durch Tools von Drittanbietern* aktiv | Instagram-App → Einstellungen → Nachrichten und Story-Antworten |
| Check auf der Live-Domain funktionsfähig | `finanz-medizin.com/check-praxis` muss im Formular landen und absenden |

### 2. Instagram verbinden

ManyChat → **Settings → Channels → Instagram → Connect**. Mit dem Facebook-Konto
anmelden, das die verknüpfte Seite verwaltet, und alle Berechtigungen erteilen.
Ohne den Schalter aus der Tabelle oben empfängt ManyChat keine DMs — das ist die
häufigste Ursache, wenn „nichts passiert".

### 3. Automation anlegen

**Automation → + New Automation → Start from scratch**, Name: `IG · Beratung`.

**Trigger:** Instagram → **Keyword**, Bedingung **Message contains**:

```
Beratung
beratung
beraten
Beratungstermin
Erstgespräch
```

- „Contains" statt „is exactly", sonst greift „Ich hätte gern eine Beratung" nicht.
- Groß- und Kleinschreibung ist ManyChat egal — „BERATUNG" ist mit abgedeckt, der
  zweite Eintrag schadet aber nicht.
- **Keine** alltäglichen Kurzwörter aufnehmen (`Info`, `Hi`, `?`). Die fangen
  Nachrichten ab, die eigentlich zu Ihnen gehören.

Dann die Nachricht aus dem Abschnitt oben eintragen: Textblock, Karte mit den drei
Knöpfen, Impressum-Zeile. Fertig — mehr Bausteine hat diese Automation nicht.

### 4. Testen, bevor es live geht

Von einem **zweiten** Instagram-Konto aus:

- [ ] „beratung" klein geschrieben → Antwort kommt
- [ ] „Ich hätte gerne eine Beratung" → Antwort kommt
- [ ] Jeder der drei Knöpfe öffnet die richtige Seite
- [ ] Die Seite springt in den Check, nicht an den Seitenanfang
- [ ] Check einmal komplett ausfüllen und absenden
- [ ] Anfrage kommt an, Notiz enthält `utm_source=instagram`
- [ ] Testanfrage im CRM wieder löschen

Erst danach auf **Live** stellen. Und den Testkontakt in ManyChat löschen — er zählt
sonst gegen die 25.

### 5. Wenn später mehr gebraucht wird

Die drei Ausbaustufen in der Reihenfolge, in der sie sich lohnen:

1. **Default Reply** (zweite Automation, auch im Free-Plan): eine kurze Antwort auf
   alles, was kein Auslöserwort enthält, damit niemand im Leeren steht.
2. **Kommentar-zu-DM** (dritte Automation): Wer unter einem Beitrag „Beratung"
   kommentiert, bekommt dieselbe Nachricht. Achtung, genau das frisst die 25
   Kontakte an einem Tag auf.
3. **Erinnerung nach einer Stunde**, wenn niemand geklickt hat. Braucht Smart Delay
   und eine Tag-Bedingung — sinnvoll erst mit Pro, und Meta lässt Automatiknachrichten
   ohnehin nur 24 Stunden nach der letzten Nachricht der Person zu.

---

## Wo die Anfrage landet

Der Check sendet an `/api/lead` → `netlify/functions/lead.js` → CRM. Dort entsteht
ein Lead mit Kontakt und eine Notiz mit allen Antworten, Erreichbarkeit,
Landingpage und Kampagnenparametern. Details im Haupt-`README.md`, Abschnitt
„Close-Anbindung".

Wenn Sie zusätzlich bei jeder Anfrage eine E-Mail wollen, ist die
Benachrichtigungsregel im CRM der schnellste Weg. Alternativ kann `lead.js` die Mail
selbst verschicken — steht heute bewusst nicht drin, wäre aber eine Sache von
wenigen Zeilen.

---

## Wartung

| Was | Wie oft | Warum |
|---|---|---|
| Aktive Kontakte in ManyChat prüfen | wöchentlich | Bei 25 stoppt die Automation stillschweigend |
| Testdurchlauf vom Zweitkonto | monatlich | Meta ändert Messaging-Regeln ohne Ankündigung |
| Auslöser-Wörter gegen echte DMs prüfen | quartalsweise | Menschen schreiben anders, als man annimmt |

Ändern Sie die Texte in ManyChat, ändern Sie sie hier mit — sonst weiß in drei
Monaten niemand mehr, was tatsächlich verschickt wird.
