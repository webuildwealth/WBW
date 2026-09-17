# Instagram-Automationen (ManyChat)

Vier Automationen, vier Auslöserwörter, **ein** Ziel: `finanz-medizin.com/beratung`.
Die Adresse springt auf der Startseite in die Zielgruppen-Weiche — von dort kann man
den Finanzcheck starten oder einfach weiterscrollen. Jede Anfrage aus dem Check läuft
über `/api/lead` ins CRM.

| Automation | Auslöserwörter |
|---|---|
| `IG · Beratung` | Beratung, beraten, Beratungstermin, Erstgespräch |
| `IG · Arzt-Check` | Arzt-Check, Arztcheck, Arzt Check, Ärztecheck |
| `IG · MFA-Check` | MFA-Check, MFAcheck, MFA Check, ZFA-Check, ZFAcheck, ZFA Check |
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

Aufbau überall gleich, vier Bausteine:

1. **Begrüßung** — in allen vier identisch, damit die Marke wiedererkennbar bleibt
2. **Zwei Schmerzpunkte**, die nur für diese Zielgruppe gelten — der einzige Teil,
   der wirklich wechselt
3. **Der Check**, unverbindlich formuliert: anfragen *oder* einfach scrollen
4. **Abbinder** — identisch, plus der Knopf

Der Link steht **nicht** im Text, sondern im Knopf darunter:

| Feld | Inhalt |
|---|---|
| Button | `Webseite` → Open Website → `https://www.finanz-medizin.com/beratung` |

Instagram zeigt keine Formatierung: kein Fett, kein Kursiv, Absätze ja. Alle vier
Texte liegen bei rund 400 Zeichen und damit weit unter der Grenze von 1.000.

### `IG · Beratung`

```
Hey, cool dass du deine Zukunft selber in die Hand nimmst :)

Hier kannst du deinen eigenen Finanzcheck selber anfragen oder einfach auf
unserer Webseite scrollen.

Falls du dann noch Fragen hast, schreib uns gern wieder

Dein Finanz Medizin Team
Bene & Zoe
```

### `IG · Arzt-Check`

```
Hey, cool dass du deine Zukunft selber in die Hand nimmst :)

Als Ärztin oder Arzt verdienst du gut — nur bleibt nach Steuern oft deutlich
weniger übrig als gedacht. Und ob das Versorgungswerk im Ernstfall wirklich
reicht, hat kaum jemand mal durchgerechnet.

Genau da schauen wir mit dir drauf. Hier kannst du deinen eigenen Finanzcheck
anfragen oder einfach auf unserer Webseite scrollen.

Falls du dann noch Fragen hast, schreib uns gern wieder

Dein Finanz Medizin Team
Bene & Zoe
```

### `IG · MFA-Check` (auch für ZFAs)

```
Hey, cool dass du deine Zukunft selber in die Hand nimmst :)

Teilzeit und Familienzeit reißen später die größten Löcher in die Rente — und
genau das trifft MFAs und ZFAs am härtesten. Das Gute: Einen großen Teil der
Vorsorge zahlt die Praxis, nicht du. Wissen die wenigsten.

Was für dich drin ist, schauen wir uns zusammen an. Hier kannst du deinen
eigenen Finanzcheck anfragen oder einfach auf unserer Webseite scrollen.

Falls du dann noch Fragen hast, schreib uns gern wieder

Dein Finanz Medizin Team
Bene & Zoe
```

Wenn die Nachricht noch eine Zeile verträgt, ist das hier die wirksamste — die
Sorge, dass der Chef davon erfährt, hält viele vom Schreiben ab:

```
Und keine Sorge: Was du uns erzählst, bleibt bei uns. Auch gegenüber deiner
Praxis.
```

### `IG · Pflege-Check`

```
Hey, cool dass du deine Zukunft selber in die Hand nimmst :)

In der Pflege gehst du körperlich ans Limit — ausgerechnet da ist die
Absicherung meistens am dünnsten. Dazu Schichten, Teilzeit und Zulagen: bei der
Rente macht das später einen riesigen Unterschied.

Was das für dich heißt, rechnen wir dir in Ruhe aus. Hier kannst du deinen
eigenen Finanzcheck anfragen oder einfach auf unserer Webseite scrollen.

Falls du dann noch Fragen hast, schreib uns gern wieder

Dein Finanz Medizin Team
Bene & Zoe
```

### Warum diese Schmerzpunkte

Jeweils zwei, nicht fünf — eine DM ist kein Landingpage-Text, und wer alles
aufzählt, trifft nichts.

| Zielgruppe | Punkt 1 | Punkt 2 |
|---|---|---|
| Ärztinnen und Ärzte | Steuerlast: hohes Brutto, ernüchterndes Netto | Versorgungswerk — kaum jemand weiß, was im Ernstfall wirklich kommt |
| MFA und ZFA | Teilzeit und Familienzeit reißen die Rentenlücke | Die Praxis zahlt mit — der einzige Punkt, der gute Nachricht statt Problem ist |
| Pflege | Körperlich harter Job, dünne Absicherung | Schicht, Teilzeit, Zulagen — Rentenwirkung wird unterschätzt |

Alle drei enden unverbindlich: „anfragen **oder** einfach scrollen". Kein „jetzt
sichern", keine Frist, kein Countdown. Bei dieser Zielgruppe kostet Druck genau die
Leute, die man haben will.

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
