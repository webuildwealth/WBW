# Instagram-Automation „Beratung" (ManyChat)

Schreibt jemand **„Beratung"** in die Instagram-Direktnachrichten, antwortet ManyChat
innerhalb von Sekunden und schickt den Link auf den Check der Website. Dort wählen
die Leute selbst Rolle und Anliegen aus und hinterlassen ihre Kontaktdaten — die
Anfrage landet über `/api/lead` im CRM, mit allen Antworten in der Notiz.

**Ziel der Strecke:** DM → Link → ausgefüllter Check → Anfrage bei Ihnen.
Kein Hin und Her in der DM, keine Rückfrage nach Telefonnummer.

---

## Was Sie brauchen

| Voraussetzung | Hinweis |
|---|---|
| Instagram **Professional-Konto** (Business oder Creator) | Privatkonten können nicht automatisiert werden |
| Verknüpfte Facebook-Seite | Meta verlangt das für die Messaging-API |
| Einstellung *Nachrichten → Zugriff auf Nachrichten erlauben* aktiv | Instagram-App → Einstellungen → Nachrichten und Story-Antworten → **Zugriff auf Nachrichten durch Tools von Drittanbietern erlauben** |
| ManyChat-Konto, Instagram verbunden | Für Keyword-Trigger auf Instagram ist **Pro** nötig |
| Funktionierender Check auf der Live-Domain | `/beratung` muss erreichbar sein und der Check muss absenden |

### Die Kurz-URLs

In `netlify.toml` liegen fünf Adressen, die kurz genug für eine Direktnachricht sind
und die Herkunft als UTM-Parameter mitführen:

| Adresse | Ziel | wofür |
|---|---|---|
| `finanz-medizin.com/beratung` | Startseite, Zielgruppen-Weiche | Einstieg ohne Vorauswahl |
| `finanz-medizin.com/check-praxis` | Praxis-Check, direkt im Formular | Rolle schon in der DM geklärt |
| `finanz-medizin.com/check-arzt` | Vermögens-Check | dito |
| `finanz-medizin.com/check-mfa` | Vorsorge-Check | dito |
| `finanz-medizin.com/termin` | Terminauswahl auf der Über-uns-Seite | für alle, die lieber sofort einen Termin wählen |

Die UTM-Parameter landen über `sessionStorage` in der Anfrage und stehen damit in
der CRM-Notiz unter „Kampagne". Sie sehen bei jeder Anfrage, ob sie aus dem
Instagram-DM kam — und bei den drei `check-`Adressen auch, welche Rolle die Person
in der DM angegeben hat.

---

## Zwei Varianten — eine reicht

### A) Kurz: ein Link, alles Weitere macht die Website

Eine einzige Nachricht mit dem Link auf `/beratung`. Die Website fragt ohnehin nach
Rolle und Anliegen — die DM muss das nicht vorwegnehmen.

```
Auslöser: DM enthält "Beratung" (+ Varianten)
      │
      ▼
[1] Nachricht mit Link auf /beratung
      │
      ▼
[3] Erinnerung nach 1 Stunde, wenn nicht geklickt
      │
      ▼
[4] Erinnerung nach 20 Stunden, wenn nicht geklickt
```

### B) Mit Rollenfrage in der DM

Eine Quick-Reply-Frage vorweg, dann der passende `check-`Link. Kostet ein Antippen,
spart der Person einen Klick auf der Website — und Sie sehen die Rolle schon, bevor
der Check abgeschickt ist.

```
Auslöser: DM enthält "Beratung" (+ Varianten)
      │
      ▼
[1] Begrüßung + Rollenfrage           ← Quick Replies
      │
      ├── Ich habe eine Praxis   → Field linkziel = /check-praxis
      ├── Angestellt in Klinik   → Field linkziel = /check-arzt
      ├── MFA / Praxisteam       → Field linkziel = /check-mfa
      └── Etwas anderes          → Field linkziel = /beratung
      │
      ▼
[2] Nachricht mit Button „Check starten" auf {{linkziel}}
      │
      ▼
[3] und [4] wie oben
```

**Empfehlung: mit A anfangen.** Wenn die Klickquote steht, lässt sich die Rollenfrage
jederzeit davorsetzen. Andersherum verliert man Leute an einem Schritt, den die
Website ohnehin besser macht.

Beide Varianten enden gleich: Wer den Link geklickt hat, bekommt keine Erinnerung
mehr. Wer lieber schreibt, landet bei Ihnen im Live-Chat.

---

## Einrichtung, Schritt für Schritt

### 1. Instagram verbinden

ManyChat → **Settings → Channels → Instagram → Connect**. Mit dem Facebook-Konto
anmelden, das die verknüpfte Seite verwaltet, und alle abgefragten Berechtigungen
erteilen. Danach in der Instagram-App prüfen, dass *Zugriff auf Nachrichten durch
Tools von Drittanbietern* eingeschaltet ist — ohne diesen Schalter empfängt ManyChat
keine DMs.

### 2. Tags anlegen

**Settings → Tags → New Tag:**

`beratung-angefragt`, `link-geklickt`, `mensch-gewuenscht`

Für Variante B zusätzlich: ein Custom Field `linkziel` (Text) unter
**Settings → Fields → User Fields** sowie die Tags `zg-praxisinhaber`,
`zg-angestellt`, `zg-mfa`, `zg-sonstiges`.

### 3. Flow anlegen

**Automation → + New Automation → Start from scratch**, Name:
`IG · Beratung → Check`.

Trigger hinzufügen: **Instagram → Keyword**.

- **Message contains** (nicht „is exactly", sonst greift „Ich hätte gern eine
  Beratung" nicht):
  `Beratung`, `beraten`, `Termin`, `Erstgespräch`, `Gespräch`, `Beratungstermin`
- Groß- und Kleinschreibung ist ManyChat egal, „BERATUNG" ist mit abgedeckt.
- **Keine** sehr kurzen oder alltäglichen Wörter aufnehmen (`Info`, `Hi`, `?`) — die
  fangen Nachrichten ab, die eigentlich zu Ihnen gehören.

Danach die Nachrichten aus **[`nachrichten-beratung.md`](nachrichten-beratung.md)**
eintragen. Dort steht jeder Text fertig zum Kopieren, für beide Varianten.

### 4. Erinnerungen und Klick-Erkennung

- Am Button „Open Website" unter *Actions* **Add Tag `link-geklickt`** hinterlegen.
  Nur so wissen die Erinnerungen, wann sie schweigen müssen.
- Danach: **Smart Delay 1 Stunde** → **Condition: Tag `link-geklickt` gesetzt?**
  → ja: Ende · nein: Erinnerung [3].
- Dann **Smart Delay 19 Stunden** → dieselbe Bedingung → nein: Erinnerung [4].

> **Das 24-Stunden-Fenster von Meta.** Nach der letzten Nachricht der Person dürfen
> Sie 24 Stunden lang frei antworten. Danach ist Schluss — deshalb liegt die zweite
> Erinnerung bei 20 Stunden (1 h + 19 h) und nicht später. Das ist keine Empfehlung,
> sondern eine Grenze der Plattform: Später verschickte Automatiknachrichten werden
> abgelehnt, und wiederholte Versuche kosten das Konto sein Messaging-Limit.

### 5. Übergabe an einen Menschen

Der Button „Lieber schreiben" setzt den Tag `mensch-gewuenscht`, stoppt über
**Action → Stop Automation** alle weiteren Erinnerungen und benachrichtigt Sie per
**Action → Send Notification → Email an info@finanz-medizin.com**. Die Konversation
läuft dann im ManyChat-Live-Chat weiter.

Das ist kein Nebenschauplatz: Menschen, die in der DM lieber schreiben als klicken,
sind oft die ernsthaftesten Anfragen.

### 6. Optional: Kommentar-Auslöser

**Automation → New → Instagram → Comments.** Wer unter einem Beitrag „Beratung"
kommentiert, bekommt automatisch dieselbe DM. Zwei Dinge dabei beachten:

- Eine öffentliche Antwort auf den Kommentar mitschicken („Ist unterwegs 📩"),
  sonst wirkt der Beitrag unbeantwortet.
- Menschen, die Ihrem Konto noch nie geschrieben haben, erreicht die DM nur über
  genau dieses Kommentar-Fenster.

### 7. Testen, bevor es live geht

Checkliste, von einem **zweiten** Instagram-Konto aus:

- [ ] „beratung" klein geschrieben → Automation startet
- [ ] „Ich hätte gerne eine Beratung" → Automation startet (Contains prüfen)
- [ ] Link öffnet die Seite und springt in den Check, nicht an den Seitenanfang
- [ ] Check testweise vollständig ausfüllen und absenden
- [ ] Anfrage kommt an, Notiz enthält `utm_source=instagram`
- [ ] Tag `link-geklickt` ist gesetzt → Erinnerung bleibt aus
- [ ] Ohne Klick: Erinnerung kommt nach 1 Stunde
- [ ] „Lieber schreiben" → E-Mail kommt an, keine weiteren Automatiknachrichten
- [ ] Testanfrage im CRM wieder löschen

Erst danach die Automation auf **Live** stellen.

---

## Wo die Anfrage landet

Der Check sendet an `/api/lead` → `netlify/functions/lead.js` → CRM. Dort entsteht
ein Lead mit Kontakt und eine Notiz mit allen Antworten, der Erreichbarkeit, der
Landingpage und den Kampagnenparametern. Details stehen im Haupt-`README.md`,
Abschnitt „Close-Anbindung".

Wenn Sie zusätzlich eine E-Mail bei jeder Anfrage wollen, ist die schnellste
Variante die Benachrichtigungsregel im CRM. Alternativ kann `lead.js` die Mail
selbst verschicken — steht heute bewusst nicht drin, ist aber eine Sache von
wenigen Zeilen.

---

## Wartung

| Was | Wie oft | Warum |
|---|---|---|
| Testdurchlauf vom Zweitkonto | monatlich | Meta ändert Messaging-Regeln ohne Ankündigung |
| Auslöser-Wörter gegen echte DMs prüfen | quartalsweise | Menschen schreiben anders, als man annimmt |
| Klickquote (`link-geklickt` / `beratung-angefragt`) | monatlich | Unter 40 % stimmt etwas mit dem Text aus Schritt 1 nicht |
| Abschlussquote (Anfragen im CRM / Klicks) | monatlich | Bricht der Check ab, liegt es an ihm, nicht an der DM |

Alle Nachrichtentexte liegen in `nachrichten-beratung.md`. Ändern Sie sie dort mit,
wenn Sie in ManyChat etwas anpassen — sonst weiß in drei Monaten niemand mehr, was
tatsächlich verschickt wird.

**Ein Hinweis zum Abhaken oder Übergehen:** In der DM-Strecke steht eine Zeile mit
dem Link aufs Impressum (Erstinformation nach § 15 VersVermV, fällig beim ersten
Geschäftskontakt). Sie kostet nichts und deckt einen gewerberechtlichen Punkt ab;
wenn Sie sie nicht wollen, löschen Sie sie in `nachrichten-beratung.md` mit.
