# Instagram-Automation „Beratung" (ManyChat)

Schreibt jemand **„Beratung"** in die Instagram-Direktnachrichten, antwortet ManyChat
innerhalb von Sekunden, fragt die Zielgruppe ab und schickt den Link auf die
Terminauswahl. Dort trägt sich die Person selbst in einen freien Slot ein — der
Termin landet direkt im Geschäftskalender, ohne Zwischenschritt und ohne Rückfrage.

**Ziel der Strecke:** DM → Zielgruppe geklärt → Terminlink → gebuchter Termin.
Ein Klick, ein Formular, fertig.

---

## Was Sie brauchen

| Voraussetzung | Hinweis |
|---|---|
| Instagram **Professional-Konto** (Business oder Creator) | Privatkonten können nicht automatisiert werden |
| Verknüpfte Facebook-Seite | Meta verlangt das für die Messaging-API |
| Einstellung *Nachrichten → Zugriff auf Nachrichten erlauben* aktiv | Instagram-App → Einstellungen → Nachrichten und Story-Antworten → **Zugriff auf Nachrichten durch Tools von Drittanbietern erlauben** |
| ManyChat-Konto, Instagram verbunden | Für Keyword-Trigger auf Instagram ist **Pro** nötig |
| Live-Domain mit funktionierender Terminbuchung | `/termin` muss erreichbar sein, siehe unten |

### Vorher prüfen: Führt der Link zu echten Terminen?

Die Terminauswahl zieht freie Zeiten aus dem Google-Kalender
(`netlify/functions/slots.js`). Ist der Kalender nicht eingerichtet, zeigt die Seite
still einen Rückruf-Block statt Terminen — die Automation liefe dann ins Leere.

Testen Sie deshalb **vor** dem Scharfschalten im Browser:

```
https://www.finanz-medizin.com/termin
```

Erwartung: Die Seite springt zur Terminauswahl und zeigt Tage mit Uhrzeiten. Sehen
Sie stattdessen „Wir rufen Sie zurück", erst die Kalenderanbindung fertigstellen
(siehe `SETUP.md`), dann die Automation aktivieren.

### Die Kurz-URLs

In `netlify.toml` sind zwei Adressen hinterlegt, die direkt in die Terminauswahl
springen und die Herkunft mitführen:

| Adresse | Ziel |
|---|---|
| `finanz-medizin.com/termin` | `ueber-uns.html#termin` + `utm_source=instagram&utm_medium=dm&utm_campaign=manychat-beratung` |
| `finanz-medizin.com/beratung` | dasselbe (zweite Schreibweise für Story und Bio) |

Die UTM-Parameter landen über `sessionStorage` in der Buchung und stehen damit in
der Terminbeschreibung im Kalender. Sie sehen also bei jedem Termin, ob er aus dem
Instagram-DM kam.

Für die Zielgruppen-Zuordnung hängen Sie in ManyChat je Zweig `&utm_content=…` an:

```
https://www.finanz-medizin.com/termin?utm_content=praxisinhaber
https://www.finanz-medizin.com/termin?utm_content=angestellt
https://www.finanz-medizin.com/termin?utm_content=mfa
https://www.finanz-medizin.com/termin?utm_content=sonstiges
```

> Die Kurz-URL ergänzt die Parameter automatisch; ein zusätzlicher `utm_content` in
> der aufgerufenen Adresse wird durch den Redirect **nicht** übernommen. Wenn Sie
> `utm_content` je Zweig auswerten wollen, verlinken Sie in ManyChat direkt die
> vollständige Adresse:
>
> ```
> https://www.finanz-medizin.com/ueber-uns.html?utm_source=instagram&utm_medium=dm&utm_campaign=manychat-beratung&utm_content=praxisinhaber#termin
> ```
>
> In den Nachrichtentexten (`nachrichten-beratung.md`) stehen beide Varianten.

---

## Aufbau der Automation

```
Auslöser: DM enthält "Beratung" (+ Varianten)
      │
      ▼
[1] Begrüßung + Frage nach der Zielgruppe        ← Quick Replies
      │
      ├── Praxisinhaber:in ──┐
      ├── Angestellte:r Arzt/Ärztin ──┤
      ├── MFA / Praxisteam ──┤        → Tag setzen, utm_content setzen
      └── Etwas anderes ─────┘
                             │
                             ▼
              [2] Terminkarte mit Button „Freie Zeiten ansehen"
                             │
             ┌───────────────┴───────────────┐
      Link geklickt                    nicht geklickt
             │                                │
      Tag „Termin-Link geklickt"     [3] Erinnerung nach 1 Stunde
             │                                │
             │                       [4] Erinnerung nach 20 Stunden
             │                                │
             └──────────► Ende ◄──────────────┘

Jederzeit: „Lieber schreiben" → Human-Agent-Übergabe + Benachrichtigung an Sie
```

**Warum die Zwischenfrage?** Sie kostet eine Antippen-Sekunde, bringt aber die
Segmentierung, die die Website ohnehin fährt (Praxisinhaber / angestellte Ärzte /
MFA). Die Antwort landet als Tag in ManyChat und als `utm_content` im Termin — Sie
gehen ins Gespräch und wissen, mit wem Sie sprechen. Wer die Frage überspringen
will, baut Schritt 1 auf eine einzige Nachricht mit Terminbutton um; alles Übrige
bleibt gleich.

---

## Einrichtung, Schritt für Schritt

### 1. Instagram verbinden

ManyChat → **Settings → Channels → Instagram → Connect**. Mit dem Facebook-Konto
anmelden, das die verknüpfte Seite verwaltet, und alle abgefragten Berechtigungen
erteilen. Danach in der Instagram-App prüfen, dass *Zugriff auf Nachrichten durch
Tools von Drittanbietern* eingeschaltet ist — ohne diesen Schalter empfängt ManyChat
keine DMs.

### 2. Custom Fields und Tags anlegen

**Settings → Fields → User Fields → New Field:**

| Feld | Typ | Zweck |
|---|---|---|
| `zielgruppe` | Text | praxisinhaber / angestellt / mfa / sonstiges |
| `terminlink` | Text | die je Zweig gesetzte vollständige Buchungsadresse |

**Settings → Tags → New Tag:**

`beratung-angefragt`, `zg-praxisinhaber`, `zg-angestellt`, `zg-mfa`,
`zg-sonstiges`, `terminlink-geklickt`, `mensch-gewuenscht`

### 3. Flow anlegen

**Automation → + New Automation → Start from scratch**, Name:
`IG · Beratung → Termin`.

Trigger hinzufügen: **Instagram → Keyword**.

- **Message contains** (nicht „is exactly", sonst greift „Ich hätte gern eine
  Beratung" nicht):
  `Beratung`, `beraten`, `Termin`, `Erstgespräch`, `Gespräch`, `Beratungstermin`
- Groß- und Kleinschreibung ist ManyChat egal, Varianten wie „BERATUNG" sind
  abgedeckt.
- **Keine** sehr kurzen oder alltäglichen Wörter aufnehmen (`Info`, `Hi`, `?`) — die
  fangen Nachrichten ab, die eigentlich zu Ihnen gehören.

Danach die Nachrichten aus **[`nachrichten-beratung.md`](nachrichten-beratung.md)**
eintragen. Dort steht jeder Text fertig zum Kopieren, mit Buttons und Verzweigungen.

### 4. Verzweigung und Verzögerungen

- Nach den Quick Replies je Zweig: **Action → Set Custom Field** (`zielgruppe`,
  `terminlink`) und **Add Tag** (`zg-…`), dann weiter zur gemeinsamen Terminkarte.
- Die Terminkarte nutzt einen **Button vom Typ „Open Website"** mit
  `{{terminlink}}`. So genügt eine Karte für alle vier Zweige.
- Danach: **Smart Delay 1 Stunde** → **Condition: Tag `terminlink-geklickt` gesetzt?**
  → ja: Ende · nein: Erinnerung [3].
- Dann **Smart Delay 19 Stunden** → dieselbe Bedingung → nein: Erinnerung [4].
- Am Button „Open Website" unter *Actions* zusätzlich **Add Tag
  `terminlink-geklickt`** hinterlegen. Nur so wissen die Erinnerungen, wann sie
  schweigen müssen.

> **Das 24-Stunden-Fenster von Meta.** Nach der letzten Nachricht der Person dürfen
> Sie 24 Stunden lang frei antworten. Danach ist Schluss — deshalb liegt die zweite
> Erinnerung bei 20 Stunden (1 h + 19 h) und nicht später. Wer länger nachfassen
> will, braucht das **Human Agent Tag** (7 Tage, nur für echte, individuelle
> Antworten eines Menschen) — kein Werkzeug für automatische Serienerinnerungen.

### 5. Übergabe an einen Menschen

Der Button „Lieber schreiben" in Schritt 2 setzt den Tag `mensch-gewuenscht`,
stoppt über **Action → Remove from Sequence / Stop Automation** alle weiteren
Erinnerungen und benachrichtigt Sie per **Action → Send Notification → Email an
info@finanz-medizin.com**. Die Konversation läuft dann im ManyChat-Live-Chat weiter.

Das ist kein Nebenschauplatz: Menschen, die in der DM lieber schreiben als klicken,
sind oft die ernsthaftesten Anfragen.

### 6. Optional: Kommentar-Auslöser

**Automation → New → Instagram → Comments.** Wer unter einem Beitrag „Beratung"
kommentiert, bekommt automatisch dieselbe DM. Zwei Dinge dabei beachten:

- Eine öffentliche Antwort auf den Kommentar mitschicken („Ist unterwegs 📩"),
  sonst wirkt der Beitrag unbeantwortet.
- Menschen, die Ihrem Konto noch nie geschrieben haben, erreicht die DM nur, wenn
  sie den Kommentar geschrieben haben — Meta erlaubt genau dieses eine Fenster.

### 7. Testen, bevor es live geht

Checkliste, von einem **zweiten** Instagram-Konto aus:

- [ ] „beratung" klein geschrieben → Automation startet
- [ ] „Ich hätte gerne eine Beratung" → Automation startet (Contains prüfen)
- [ ] Jeder der vier Quick Replies führt zur Terminkarte mit passendem Link
- [ ] Button öffnet die Terminauswahl und zeigt **echte freie Zeiten**
- [ ] Testtermin buchen → Eintrag erscheint im Google-Kalender, Beschreibung enthält
      `utm_source=instagram`
- [ ] Tag `terminlink-geklickt` ist gesetzt → Erinnerung bleibt aus
- [ ] Ohne Klick: Erinnerung kommt nach 1 Stunde
- [ ] „Lieber schreiben" → E-Mail an info@finanz-medizin.com kommt an, keine
      weiteren Automatiknachrichten
- [ ] Testtermin im Kalender wieder löschen

Erst danach die Automation auf **Live** stellen.

---

## Rechtliches — nicht überspringen

### Erstinformation nach § 15 VersVermV

Sie treten als Versicherungsvermittler (§ 34d GewO) und Finanzanlagenvermittler
(§ 34f GewO) auf. Die Erstinformation ist **beim ersten Geschäftskontakt** zu geben,
und eine Beratungsanfrage in der DM ist ein solcher. Deshalb steht in Schritt 2 der
Hinweis mit dem Link auf `impressum.html` — der Absatz gehört dort hin und darf
nicht wegen der Länge gekürzt werden.

### Datenschutz

ManyChat verarbeitet Instagram-Profilname, Instagram-ID und den gesamten
Nachrichtenverlauf und sitzt in den USA. Das ist eine Auftragsverarbeitung, die in
`datenschutz.html` fehlt. Einen fertigen Textbaustein zum Einfügen finden Sie in
**[`datenschutz-baustein.md`](datenschutz-baustein.md)** — vor dem Livegang von
Ihrer Rechtsberatung prüfen lassen, das ist kein juristisches Gutachten.

Zusätzlich:

- DPA bei ManyChat abschließen (Settings → Billing → Data Processing Addendum) und
  die dortige Anschrift in den Textbaustein übernehmen.
- Die automatischen Erinnerungen bleiben innerhalb der von der Person selbst
  begonnenen Konversation. Werbliche Nachrichten an Kontakte, die nur einmal
  geschrieben und danach nicht reagiert haben, brauchen eine Einwilligung — die
  holt diese Automation bewusst nicht ein und verschickt daher auch nichts
  dergleichen.
- Kontakte, die `mensch-gewuenscht` gesetzt haben, nicht in Broadcast-Listen
  übernehmen.

---

## Wartung

| Was | Wie oft | Warum |
|---|---|---|
| Testdurchlauf vom Zweitkonto | monatlich | Meta ändert Messaging-Regeln ohne Ankündigung |
| Freie Zeiten im Kalender prüfen | wöchentlich | Ein leerer Kalender macht die ganze Strecke wertlos |
| Auslöser-Wörter gegen echte DMs prüfen | quartalsweise | Menschen schreiben anders, als man annimmt |
| Klickquote (Tag `terminlink-geklickt` / Tag `beratung-angefragt`) | monatlich | Unter 40 % stimmt etwas mit dem Text von Schritt 2 nicht |

Alle Nachrichtentexte liegen in `nachrichten-beratung.md`. Ändern Sie sie dort mit,
wenn Sie in ManyChat etwas anpassen — sonst weiß in drei Monaten niemand mehr, was
tatsächlich verschickt wird.
