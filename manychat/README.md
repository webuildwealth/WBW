# Instagram-Automationen (ManyChat)

Vier Automationen, vier Auslöserwörter, **ein** Ziel: `finanz-medizin.com/beratung`.
Die Adresse springt auf der Startseite in die Zielgruppen-Weiche — von dort kann man
den Finanzcheck starten oder einfach weiterscrollen. Jede Anfrage aus dem Check läuft
über `/api/lead` ins CRM.

| Automation | Auslöserwörter |
|---|---|
| `IG · Beratung` | Beratung, beraten, Beratungstermin, Erstgespräch |
| `IG · Arzt-Check` | Arzt-Check, Arztcheck, Arzt Check, Ärztecheck |
| `IG · MFA-Check` | MFA-Check, MFAcheck, MFA Check |
| `IG · Pflege-Check` | Pflege-Check, Pflegecheck, Pflege Check |

Damit ist der Free-Plan voll: **vier gleichzeitig aktive Automationen** sind dort das
Maximum. Für eine Default Reply ist kein Platz mehr — wer die haben will, muss eine
der vier abschalten oder auf Pro.

---

## Was der Free-Plan hergibt

Stand September 2026, nach der Umstellung vom 2. März 2026:

| | Free |
|---|---|
| Aktive Automationen gleichzeitig | **4** |
| Aktive Kontakte pro Monat | **25** — über alle vier zusammen |
| Kanäle | 2 (z. B. Instagram + Messenger) |
| Nutzer / Inbox-Plätze | 1 |
| Keyword-Auslöser, Kommentar-zu-DM, Default Reply | enthalten |
| Broadcasts, Integrationen, AI, WhatsApp/SMS | nicht enthalten |

**Die echte Grenze sind die 25 Kontakte, nicht die Zahl der Automationen.** Ein
Kontakt gilt als aktiv, sobald eine der Automationen im Abrechnungsmonat mit ihm
interagiert; die vier teilen sich dasselbe Kontingent. Ab dem 26. Menschen antwortet
keine mehr — still, ohne Fehlermeldung.

Praktisch heißt das: Für Bio-Link und gelegentliche DMs reicht Free. Sobald ein Reel
läuft, ist das Kontingent an einem Tag weg. Deshalb **wöchentlich unter Contacts
nachsehen**, wie viele aktive Kontakte der Monat schon verbraucht hat.

Limits und Preise ändert ManyChat ohne Vorwarnung. Vor dem Einrichten einmal in
**Settings → Billing** nachsehen, was im Konto tatsächlich steht.

---

## Die Nachrichten

Alle vier enden gleich: derselbe Link, dieselbe Verabschiedung. Nur der Einstieg
wechselt, damit die Antwort zum Auslöserwort passt.

### `IG · Beratung`

```
Hey! Cool, dass du deine Finanzen selbst in die Hand nimmst — die meisten
schieben genau das jahrelang vor sich her.

Wir sind Bene und Zoe von Finanz-Medizin. Wir machen Geld für Leute im
Gesundheitswesen verständlich: kein Fachchinesisch, kein Verkaufsgespräch,
alles in Euro.

Wo du gerade stehst, findest du in rund 90 Sekunden raus:
finanz-medizin.com/beratung

Da kannst du deinen Finanzcheck anfragen oder erstmal in Ruhe stöbern — ganz
wie du magst. Und wenn du Fragen hast: einfach hier schreiben, wir lesen jede
Nachricht selbst.

Viel Spaß damit
Bene & Zoe
```

### `IG · Arzt-Check`

```
Hey! Cool, dass du das angehst. Als Arzt oder Ärztin verdienst du gut — nur
bleibt davon oft deutlich weniger hängen, als es müsste. Steuer, Zeit und ein
paar Verträge, die keiner liest: genau da liegen die größten Hebel.

Wir sind Bene und Zoe von Finanz-Medizin. Kein Fachchinesisch, kein
Verkaufsgespräch, alles in Euro.

Wo du gerade stehst, findest du in rund 90 Sekunden raus:
finanz-medizin.com/beratung

Da kannst du deinen Finanzcheck anfragen oder erstmal in Ruhe stöbern. Fragen?
Schreib einfach hier — wir lesen jede Nachricht selbst.

Viel Spaß damit
Bene & Zoe
```

### `IG · MFA-Check`

```
Hey! Cool, dass du das angehst. Im Praxisteam heißt es oft, für Vorsorge sei
kein Geld da — dabei zahlt einen großen Teil davon die Praxis und nicht du.
Das wissen die wenigsten.

Wir sind Bene und Zoe von Finanz-Medizin. Kein Fachchinesisch, kein
Verkaufsgespräch, alles in Euro. Und was du uns erzählst, bleibt bei uns —
auch gegenüber deinem Chef oder deiner Chefin.

Wo du gerade stehst, findest du in rund 90 Sekunden raus:
finanz-medizin.com/beratung

Da kannst du deinen Finanzcheck anfragen oder erstmal in Ruhe stöbern. Fragen?
Schreib einfach hier — wir lesen jede Nachricht selbst.

Viel Spaß damit
Bene & Zoe
```

### `IG · Pflege-Check`

```
Hey! Cool, dass du das angehst. In der Pflege bleibt für sowas selten Zeit und
noch seltener Kopf — umso stärker, dass du es machst. Schichtdienst, Teilzeit,
früher Ausstieg: das sind genau die Dinge, die später an der Rente ziehen.

Wir sind Bene und Zoe von Finanz-Medizin. Kein Fachchinesisch, kein
Verkaufsgespräch, alles in Euro.

Wo du gerade stehst, findest du in rund 90 Sekunden raus:
finanz-medizin.com/beratung

Da kannst du deinen Finanzcheck anfragen oder erstmal in Ruhe stöbern. Fragen?
Schreib einfach hier — wir lesen jede Nachricht selbst.

Viel Spaß damit
Bene & Zoe
```

Alle vier liegen bei rund 600 Zeichen und damit weit unter der
Instagram-Grenze von 1.000. Instagram zeigt **keine** Formatierung: kein Fett,
kein Kursiv, Absätze ja.

### Optional: Knopf statt Textlink

Instagram macht die Adresse im Text klickbar, das genügt. Wer es auffälliger will,
hängt hinter den Text eine Karte:

| Feld | Inhalt |
|---|---|
| Titel | `Dein Finanzcheck` |
| Untertitel | `Ein paar Fragen, rund 90 Sekunden.` |
| Button | `Zur Seite` → Open Website → `https://www.finanz-medizin.com/beratung` |

### Optional: Impressum-Zeile

```
Kurz fürs Protokoll: Wir sind Versicherungsvermittler nach § 34d GewO und
Finanzanlagenvermittler nach § 34f GewO. Alle Pflichtangaben:
finanz-medizin.com/impressum
```

Das ist die Erstinformation nach § 15 VersVermV, fällig beim ersten
Geschäftskontakt. Eine Zeile, kein Datenschutztext. Wer sie weglässt, löscht sie
hier mit, damit die Datei zeigt, was tatsächlich verschickt wird.

---

## Zwei Dinge, die auffallen werden

**Du in der DM, Sie auf der Website.** Die Landingpages siezen durchgehend. Wer aus
dem DM kommt, erlebt den Wechsel beim ersten Klick. Auf Instagram ist Du richtig —
aber wenn es stört, ist die Website die Stelle, an der man nachzieht, nicht die DM.

**Pflege hat keine eigene Karte auf der Weiche.** Dort stehen Praxisinhaber,
angestellte Ärztinnen und Ärzte sowie MFA und Praxisteam. Wer über `Pflege-Check`
kommt, landet also bei einer Karte, die nicht ganz passt. Für den Anfang okay —
läuft der Auslöser dauerhaft, gehört auf der Weiche eine eigene Ansprache dazu.

---

## Einrichtung, Schritt für Schritt

### 1. Voraussetzungen

| Voraussetzung | Hinweis |
|---|---|
| Instagram **Professional-Konto** (Business oder Creator) | Privatkonten können nicht automatisiert werden |
| Verknüpfte Facebook-Seite | Meta verlangt das für die Messaging-API |
| *Zugriff auf Nachrichten durch Tools von Drittanbietern* aktiv | Instagram-App → Einstellungen → Nachrichten und Story-Antworten |
| `finanz-medizin.com/beratung` erreichbar | Muss auf der Startseite in die Weiche springen |

### 2. Instagram verbinden

ManyChat → **Settings → Channels → Instagram → Connect**. Mit dem Facebook-Konto
anmelden, das die verknüpfte Seite verwaltet, und alle Berechtigungen erteilen. Ohne
den Schalter aus der Tabelle oben empfängt ManyChat keine DMs — das ist die häufigste
Ursache, wenn „nichts passiert".

### 3. Die vier Automationen anlegen

Für jede: **Automation → + New Automation → Start from scratch**, Namen wie in der
Tabelle oben. Trigger: **Instagram → Keyword**, Bedingung **Message contains**, die
Wörter aus der Tabelle eintragen. Dann den passenden Text einfügen. Mehr Bausteine
haben diese Automationen nicht.

Drei Regeln für die Auslöserwörter:

- **Contains statt is exactly**, sonst greift „Ich hätte gern eine Beratung" nicht.
- **Keine Überschneidungen.** Kein `Check` als eigenes Wort, sonst wissen drei
  Automationen gleichzeitig, dass sie gemeint sind. Deshalb steht in jeder Liste
  immer die volle Kombination, nie nur `MFA` oder nur `Pflege`.
- **Keine Alltagswörter** (`Info`, `Hi`, `?`). Die fangen Nachrichten ab, die
  eigentlich zu dir gehören.

Groß- und Kleinschreibung ist ManyChat egal: `BERATUNG`, `Beratung` und `beratung`
lösen dieselbe Automation aus, ein Eintrag genügt.

### 4. Testen, bevor es live geht

Von einem **zweiten** Instagram-Konto aus, für jede der vier:

- [ ] Auslöserwort klein geschrieben → Antwort kommt
- [ ] Auslöserwort in einem Satz → Antwort kommt
- [ ] Nur **eine** Automation antwortet, nicht zwei gleichzeitig
- [ ] Link öffnet die Startseite und springt in die Weiche
- [ ] Check einmal komplett ausfüllen und absenden
- [ ] Anfrage kommt an, Notiz enthält `utm_source=instagram`
- [ ] Testanfrage im CRM löschen, Testkontakt in ManyChat löschen — er zählt sonst
      gegen die 25

Erst danach auf **Live** stellen.

---

## Die Kurz-URLs

In `netlify.toml` liegen fünf Adressen. Die Strecke nutzt nur die erste; die
übrigen sind für Stories, Bio und Anzeigen da.

| Adresse | landet |
|---|---|
| `finanz-medizin.com/beratung` | Startseite, Zielgruppen-Weiche — **Ziel aller vier Automationen** |
| `finanz-medizin.com/check-praxis` | Praxis-Check auf `praxisinhaber.html` |
| `finanz-medizin.com/check-arzt` | Vermögens-Check auf `angestellte-aerzte.html` |
| `finanz-medizin.com/check-mfa` | Vorsorge-Check auf `mfa-praxisteam.html` |
| `finanz-medizin.com/termin` | Terminauswahl auf `ueber-uns.html` |

Alle hängen die Instagram-Herkunft als UTM-Parameter an. Die landen über
`sessionStorage` in der Anfrage und stehen in der CRM-Notiz unter „Kampagne" — du
siehst also, welche Anfrage aus dem DM kam.

---

## Wo die Anfrage landet

Der Check sendet an `/api/lead` → `netlify/functions/lead.js` → CRM. Dort entsteht
ein Lead mit Kontakt und eine Notiz mit allen Antworten, Erreichbarkeit, Landingpage
und Kampagnenparametern. Details im Haupt-`README.md`, Abschnitt „Close-Anbindung".

---

## Wartung

| Was | Wie oft | Warum |
|---|---|---|
| Aktive Kontakte in ManyChat prüfen | wöchentlich | Bei 25 stoppen alle vier stillschweigend |
| Testdurchlauf vom Zweitkonto | monatlich | Meta ändert Messaging-Regeln ohne Ankündigung |
| Auslöserwörter gegen echte DMs prüfen | quartalsweise | Menschen schreiben anders, als man annimmt |

Änderst du die Texte in ManyChat, ändere sie hier mit — sonst weiß in drei Monaten
niemand mehr, was tatsächlich verschickt wird.
