# hubspot-mailer

Versendet E-Mails, die in HubSpot an einem Kontakt, einem Unternehmen oder einem
Lead hinterlegt sind, über das Google-Workspace-Postfach `info@finanz-medizin.com`.

Wer in HubSpot Betreff und Text einträgt, den Status auf **queued** stellt und
den Haken bei *E-Mail senden* setzt, hat die Mail damit verschickt. Alles
Weitere — Empfänger bestimmen, Platzhalter füllen, Signatur anhängen, senden,
Status zurückschreiben — erledigt dieser Dienst.

**Keine Abhängigkeiten.** Node 20 oder neuer, sonst nichts. Kein `npm install`,
keine Lieferkette, nichts, was in zwei Jahren ein Sicherheitsupdate braucht.

---

## Inhalt

1. [Warum eigener Code und nicht Make.com](#1-warum-eigener-code-und-nicht-makecom)
2. [Architektur](#2-architektur)
3. [HubSpot-Properties](#3-hubspot-properties)
4. [HubSpot einrichten](#4-hubspot-einrichten)
5. [Google Workspace und Gmail einrichten](#5-google-workspace-und-gmail-einrichten)
6. [Installation](#6-installation)
7. [Deployment](#7-deployment)
8. [Bedienung: eine Mail verschicken](#8-bedienung-eine-mail-verschicken)
9. [Keine doppelten Mails — wie das funktioniert](#9-keine-doppelten-mails--wie-das-funktioniert)
10. [Fehlerbehandlung](#10-fehlerbehandlung)
11. [Testfälle und Test mit einem HubSpot-Testkontakt](#11-testfälle-und-test-mit-einem-hubspot-testkontakt)
12. [Protokoll und Überwachung](#12-protokoll-und-überwachung)
13. [Weitere Mailtypen hinzufügen](#13-weitere-mailtypen-hinzufügen)
14. [Grenzen](#14-grenzen)

---

## 1. Warum eigener Code und nicht Make.com

Die ehrliche Antwort zuerst: **Für viele Aufgaben wäre Make.com die richtige
Wahl.** Ein Szenario „HubSpot Property geändert → Gmail senden“ ist dort in
zwanzig Minuten geklickt, und niemand muss einen Server betreiben.

Für *diese* Aufgabe ist es die falsche Wahl, und zwar wegen eines einzigen
Satzes aus der Anforderung: *dieselbe E-Mail darf niemals zweimal verschickt
werden.*

Was dagegen spricht, Punkt für Punkt:

| | Make.com / HubSpot-Workflows | Eigener Dienst |
|---|---|---|
| **Dublettenschutz** | Kein Sperrmechanismus. Man baut ihn über einen Data Store nach — der aber *nach* dem Versand geschrieben wird. Genau im Fenster dazwischen entsteht die doppelte Mail. | Anspruch wird **vor** dem Versand auf die Platte gezwungen. Ein Absturz mittendrin führt nie zu einer zweiten Mail. |
| **Abgerissene Verbindung** | Make wiederholt automatisch. Wenn Gmail die Mail angenommen hatte und nur die Antwort verlorenging, geht sie ein zweites Mal raus. | Ein unklarer Ausgang wird als unklar behandelt: kein blinder Zweitversuch, Fall geht auf `needs_review`. |
| **Empfänger am Unternehmen** | Iterator über alle verknüpften Kontakte ist der naheliegende Weg — und verschickt an alle. | Mehrdeutigkeit ist ein Abbruchgrund, kein Sonderfall. |
| **Nachvollziehbarkeit** | Ausführungsprotokolle, 30 Tage, in fremder Oberfläche. | Ein strukturiertes Protokoll im eigenen journald, so lange man will. |
| **Versionierung** | Logik lebt in einer GUI. Kein Diff, kein Review, kein Rollback. | Im selben Git wie die Website. |
| **Kosten** | Je Operation. Ein Lauf braucht 4–6 Operationen. | Ein kleiner Server, den es ohnehin geben kann. |

Dazu kommt: **HubSpot-native Mails sind hier keine Option.** Der Workflow-Baustein
„E-Mail senden“ verlangt Marketing Hub Professional und verschickt über HubSpots
Server, nicht über Ihr Gmail-Postfach. Sales-Sequenzen senden zwar aus dem
verbundenen Postfach, nehmen den Text aber aus HubSpot-Vorlagen statt aus
frei befüllbaren Properties.

**Wann Sie das hier wieder rauswerfen sollten:** Wenn sich herausstellt, dass in
der Praxis zwei Mails pro Woche verschickt werden und eine versehentliche
Dublette verschmerzbar wäre. Dann ist ein Make-Szenario weniger Aufwand im
Betrieb, und dieser Ordner kann weg.

---

## 2. Architektur

```
                          ┌──────────────────────────────────────┐
  HubSpot                 │  hubspot-mailer (ein Node-Prozess)   │
  ┌──────────────┐        │                                      │
  │ Kontakt      │ Webhook│  server.js ─── Signatur v3 prüfen    │
  │ Unternehmen  ├───────►│      │              │                │
  │ Lead         │  (push)│      │         202 sofort zurück     │
  └──────┬───────┘        │      ▼                               │
         │                │  Warteschlange (1 Arbeiter)          │
         │ Suche          │      │                               │
         │◄───────────────┤  Scheduler (60 s) ── fällige und     │
         │  (pull, 60 s)  │      │              verpasste Mails   │
         │                │      ▼                               │
         │                │  ┌────────── pipeline.js ─────────┐  │
         │  Datensatz     │  │ 1 laden                        │  │
         │◄───────────────┼──┤ 2 prüfen (Freigabe, Status)    │  │
         │                │  │ 3 Empfänger eindeutig?         │  │
         │                │  │ 4 Text bauen, Platzhalter      │  │
         │                │  │ 5 Send-ID = Fingerabdruck      │  │
         │                │  │ 6 ANSPRUCH im Ledger  ◄────────┼──┼─── ledger.jsonl
         │                │  │ 7 Gmail senden ────────────────┼──┼──► Gmail API
         │  Status, ID,   │  │ 8 Ledger: versendet            │  │
         │  Zeitpunkt     │  │ 9 HubSpot nachführen           │  │
         │◄───────────────┼──┴────────────────────────────────┘  │
         │                └──────────────────────────────────────┘
```

### Zwei Wege herein, ein Weg hindurch

**Webhook (push).** HubSpot meldet die Änderung, die Mail geht binnen Sekunden
raus. Das ist der normale Betrieb — keine Dauerabfrage der API.

**Scheduler (pull, alle 60 Sekunden).** Er hat zwei Aufgaben, und die zweite ist
die wichtigere:

* geplante Mails fällig stellen — ein Webhook kann nicht melden, dass „jetzt
  Dienstag 09:00“ ist;
* **verpasste Ereignisse nachholen.** Webhooks gehen verloren: der Dienst startet
  gerade neu, das Netz hängt, HubSpot gibt nach fünf Versuchen auf. Wer sich
  allein darauf verlässt, findet irgendwann eine Mail, die seit drei Tagen auf
  `queued` steht und nie rausging.

Eine Suchabfrage je Objektart und Minute sind rund 4 300 Aufrufe am Tag gegen
ein Limit von 100 je zehn Sekunden — das fällt nicht ins Gewicht. Und weil beide
Wege durch dieselbe Pipeline laufen, kann der Scheduler nichts doppelt senden,
was der Webhook schon erledigt hat.

Fällt die Webhook-Zustellung ganz aus (kein Client-Secret verfügbar, kein
öffentlicher Endpunkt möglich), funktioniert der Dienst **allein mit dem
Scheduler** weiter. Die Mails gehen dann bis zu 60 Sekunden später raus. Das ist
kein Notbetrieb, sondern eine vollwertige Betriebsart.

### Die Dateien

| Datei | Aufgabe |
|---|---|
| `server.js` | HTTP-Adapter. Der einzige Teil, der Node-HTTP kennt. |
| `src/app.js` | Baut alles zusammen. Hosterunabhängig — wie `lib/lead-core.js` im selben Repository. |
| `src/pipeline.js` | Der Ablauf einer Mail von `queued` bis `sent`. |
| `src/store.js` | Das Ledger. Hier scheitern doppelte Mails. |
| `src/recipient.js` | Wer bekommt die Mail. Kontakt / Unternehmen / Lead. |
| `src/template.js` | Platzhalter, HTML, Nur-Text-Fassung, Signatur. |
| `src/mime.js` | Die Nachricht nach RFC 5322. Umlaute, Header-Injection. |
| `src/gmail.js` | Versand und Nachschau im Postausgang. |
| `src/google-auth.js` | OAuth 2.0: Dienstkonto-JWT oder Refresh-Token. |
| `src/hubspot.js` | HubSpot-API: lesen, schreiben, suchen, verknüpfen. |
| `src/webhook.js` | Signatur v3, Ereignisse vereinheitlichen. |
| `src/scheduler.js` | Der Minutentakt. |
| `src/queue.js` | Warteschlange, ein Arbeiter, Zusammenfassung. |
| `src/retry.js` | Wann darf wiederholt werden, wann nicht. |
| `src/config.js` | Alles aus Umgebungsvariablen. |
| `src/log.js` | Strukturiertes Protokoll mit Maskierung. |

### Warum ein langlaufender Prozess und nicht Netlify Functions

Das Repository hat bereits Netlify Functions (`netlify/functions/`), und es läge
nahe, das hier genauso zu machen. Es passt aber nicht:

* **Das Dateisystem ist flüchtig.** Das Ledger — die Stelle, die doppelte Mails
  verhindert — wäre nach jedem Kaltstart leer. Damit wäre der Kern der
  Anforderung nicht erfüllt.
* **Der Scheduler braucht einen Prozess**, der zwischen den Läufen etwas weiß.

Wer es dennoch auf Netlify betreiben will, ersetzt `src/store.js` durch eine
Fassung auf Netlify Blobs oder Postgres. Die Schnittstelle sind vier Methoden:
`claim`, `markiereVersendet`, `markiereFehler`, `markierePruefung`. Alles andere
bleibt unverändert.

---

## 3. HubSpot-Properties

Alle Namen sind über Umgebungsvariablen änderbar (`PROP_*` in `.env.example`).
Angelegt werden sie an **Kontakten, Unternehmen und Leads** mit:

```bash
npm run setup:properties
```

### Was Sie ausfüllen

| Property | Typ | Bedeutung |
|---|---|---|
| `automation_email_enabled` | Ja/Nein | **Der Hauptschalter.** Ohne Haken passiert nichts, egal was im Status steht. |
| `automation_email_status` | Auswahl | Siehe unten. Auf `queued` stellen heißt: losschicken. |
| `automation_email_subject` | Text | Betreff. Platzhalter erlaubt. |
| `automation_email_body` | Mehrzeiliger Text | Der Mailtext. Klartext oder HTML — beides wird erkannt. |
| `automation_send_at` | Datum/Uhrzeit | Leer = sofort. Zeitpunkt in der Zukunft = dann. |
| `automation_email_sender` | Auswahl | Aus welchem Postfach. Leer = Standard. |
| `automation_email_template` | Auswahl | Für spätere Mailtypen, siehe Abschnitt 13. |
| `automation_email_recipient` | Text | Ausdrückliche Empfängeradresse. Schlägt jede Herleitung. |
| `automation_email_contact_id` | Text | **Nur an Unternehmen.** Die Kontakt-ID des gewollten Ansprechpartners. |
| `automation_meeting_at` | Datum/Uhrzeit | Quelle für `{{meeting_date}}` und `{{meeting_time}}`. |
| `automation_email_send_key` | Text | Nur nötig, um denselben Text absichtlich erneut zu senden. |

### Was die Automation zurückschreibt

| Property | Typ | Inhalt |
|---|---|---|
| `automation_email_status` | Auswahl | `sent`, `failed`, `needs_review`, … |
| `automation_email_sent_at` | Datum/Uhrzeit | Wann die Mail rausging |
| `automation_email_id` | Text | Die Send-ID. Steht auch als Kopfzeile `X-Automation-Send-Id` in der Mail. |
| `automation_email_message_id` | Text | Die Kennung, die Gmail vergeben hat |
| `automation_email_attempts` | Zahl | Wie oft tatsächlich versucht wurde |
| `automation_email_error` | Mehrzeiliger Text | Klartext des Fehlers samt Hinweis, was zu tun ist |

### Die Zustände

```
draft ──► queued ──► scheduled ──► sending ──► sent
             │                        │
             │                        ├──► failed        (sauber gescheitert, erneut möglich)
             │                        └──► needs_review  (Ausgang unklar, Mensch muss nachsehen)
             └──► cancelled
```

Sechs Zustände standen in der Anforderung. Zwei sind dazugekommen, weil der
Betrieb sie braucht:

* **`sending`** — zwischen „Anspruch gesetzt“ und „Gmail hat quittiert“ liegt ein
  Fenster von Millisekunden. Ohne eigenen Zustand wäre von außen nicht zu sehen,
  dass hier gerade jemand arbeitet.
* **`needs_review`** — wenn nicht sicher zu klären ist, ob die Mail raus ist.
  Hier wird bewusst nichts automatisch wiederholt. Eine fehlende Mail ist
  reparierbar, eine doppelte nicht.

**Ausgelöst wird bei gesetztem Haken und Status `queued`, `scheduled` oder leer.**
Der leere Status ist der einfachste Weg aus der Anforderung: Haken setzen, fertig.
Jeder andere Status — `draft`, `sent`, `failed`, `cancelled`, `needs_review` —
löst nichts aus, und ohne Haken passiert ohnehin nichts.

Wer sicher gehen will, dass niemand versehentlich beim Entwerfen sendet, setzt
den Status beim Anlegen auf `draft` — dann ist der Haken folgenlos, bis jemand
bewusst auf `queued` stellt.

---

## 4. HubSpot einrichten

### 4.1 Private App anlegen

**Einstellungen → Integrationen → Private Apps → Private App erstellen**

Scopes:

| Scope | wofür |
|---|---|
| `crm.objects.contacts.read` / `.write` | Kontakte lesen und Status zurückschreiben |
| `crm.objects.companies.read` / `.write` | dasselbe für Unternehmen |
| `crm.objects.leads.read` / `.write` | dasselbe für Leads (falls vorhanden) |
| `crm.schemas.contacts.write` | Properties anlegen — nur einmal beim Einrichten |
| `crm.schemas.companies.write` | dito |

Aus dem Reiter **Auth**:

* den **Access Token** nach `HUBSPOT_ACCESS_TOKEN`
* das **Client Secret**, falls vorhanden, nach `HUBSPOT_WEBHOOK_SECRET`

### 4.2 Properties anlegen

```bash
npm run setup:properties -- --dry   # erst zeigen, was passieren würde
npm run setup:properties            # dann anlegen
```

Das Skript ist beliebig oft aufrufbar. Vorhandenes wird nicht angefasst, nur
Fehlendes ergänzt; bei Auswahlfeldern werden fehlende Optionen nachgetragen.
Kennt Ihr Portal die Objektart Leads nicht (erst ab Sales Hub Professional),
wird sie übersprungen — ohne Abbruch.

### 4.3 Trigger einrichten

Drei Wege. Nehmen Sie den, der zu Ihrem Tarif passt.

#### Weg A — Webhook-Abonnement der Private App (am direktesten)

**Private App → Webhooks**

* Ziel-URL: `https://automation.finanz-medizin.com/hubspot/webhook`
* Abonnements anlegen für:
  * `contact.propertyChange` → `automation_email_status`
  * `contact.propertyChange` → `automation_email_enabled`
  * `company.propertyChange` → dieselben beiden
  * `lead.propertyChange` → dieselben beiden (falls vorhanden)

Die Anfragen werden mit dem Client Secret signiert; der Dienst prüft die
Signatur nach Verfahren v3 samt Zeitstempel gegen Wiedereinspielung.

> **Falls Ihre Private App kein Client Secret anzeigt:** Dann gibt es für dieses
> Abonnement keine Signatur, und Weg A ist so nicht abzusichern. Zwei saubere
> Auswege:
> 1. **Weg B** nehmen (Workflow-Webhook) — der kann eigene Kopfzeilen mitgeben.
> 2. Eine **nicht erratbare URL** verwenden: `WEBHOOK_PATH=/hubspot/webhook/<32 zufällige Zeichen>`
>    zusammen mit `WEBHOOK_REQUIRE_SIGNATURE=false`. Das schützt nur so weit, wie
>    die URL geheim bleibt — sie steht in Proxy-Protokollen. Zusätzlich im
>    Reverse-Proxy auf HubSpots IP-Bereiche einschränken.
>
> Oder Sie verzichten ganz auf Webhooks und lassen nur den Scheduler laufen
> (`POLL_ENABLED=true`, kein Abonnement). Die Mails gehen dann bis zu 60
> Sekunden später raus — sonst ändert sich nichts.

#### Weg B — Workflow mit „Webhook senden“ (ab Professional)

**Automatisierung → Workflows → Neu → Kontaktbasiert**

* Auslöser: *`automation_email_status` ist `queued`* **und** *`automation_email_enabled` ist `Ja`*
* Aktion: **Webhook senden**
  * Methode: `POST`
  * URL: `https://automation.finanz-medizin.com/hubspot/trigger`
  * Authentifizierung/Kopfzeile: `X-Automation-Token: <WEBHOOK_SHARED_SECRET>`
  * Rumpf (falls anpassbar):
    ```json
    { "objectType": "contacts", "objectId": "{{ contact.hs_object_id }}" }
    ```

Der Dienst versteht auch den Standardrumpf von HubSpot (`vid`, `companyId`).

#### Weg C — nur Scheduler

Nichts weiter einrichten. `POLL_ENABLED=true` genügt; der Dienst findet alles,
was auf `queued` oder fällig auf `scheduled` steht. Für den Anfang die
unkomplizierteste Variante.

---

## 5. Google Workspace und Gmail einrichten

Zwei Wege. **Nehmen Sie den ersten, wenn Sie Workspace-Administrator sind.**

### 5.1 Empfohlen: Dienstkonto mit domainweiter Delegierung

Damit läuft der Versand ohne Benutzerinteraktion und ohne Token, der irgendwann
abläuft. Für einen Dienst, der jahrelang unbeaufsichtigt arbeiten soll, ist das
der richtige Weg. Das Repository nutzt dasselbe Verfahren bereits für den
Kalender (`lib/booking-core.js`) — es kann sogar dasselbe Dienstkonto sein.

**Schritt 1 — Projekt und Dienstkonto** (console.cloud.google.com)

1. Projekt anlegen oder das vorhandene nehmen.
2. **APIs & Dienste → Bibliothek → Gmail API → Aktivieren**
3. **IAM & Verwaltung → Dienstkonten → Dienstkonto erstellen**
   Name z. B. `hubspot-mailer`.
4. Beim angelegten Konto: **Schlüssel → Schlüssel hinzufügen → JSON**.
   Die Datei wird einmal heruntergeladen und ist nicht wiederherstellbar.
5. Die **numerische Client-ID** notieren (Feld `client_id` in der JSON-Datei,
   ungefähr 21 Ziffern). Die brauchen Sie gleich — nicht die E-Mail-Adresse.

**Schritt 2 — Delegierung freigeben** (admin.google.com)

**Sicherheit → Zugriffs- und Datenkontrolle → API-Steuerung → Domainweite
Delegierung verwalten → Neu hinzufügen**

* Client-ID: die numerische ID aus Schritt 1.5
* OAuth-Bereiche:
  ```
  https://www.googleapis.com/auth/gmail.send
  ```
  Wenn Sie `GMAIL_VERIFY_ENABLED=true` setzen wollen (siehe Abschnitt 10),
  zusätzlich, **kommagetrennt in derselben Zeile**:
  ```
  https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.readonly
  ```

Die Freigabe braucht bis zu 15 Minuten, bis sie wirkt.

**Schritt 3 — JSON in die Konfiguration**

Mehrzeiliges JSON überlebt `.env`-Dateien schlecht, deshalb base64:

```bash
base64 -w0 hubspot-mailer-abc123.json
```

Die Ausgabe nach `GOOGLE_SERVICE_ACCOUNT=`. Anschließend **die JSON-Datei
löschen** — sie ist ein Generalschlüssel für jedes Postfach Ihrer Domain im
freigegebenen Umfang.

**Schritt 4 — prüfen**

```bash
npm run check
```

Bei `unauthorized_client` sagt die Ausgabe genau, welche Client-ID mit welchen
Scopes einzutragen ist.

### 5.2 Ohne Adminrechte: OAuth mit Refresh-Token

1. **APIs & Dienste → OAuth-Zustimmungsbildschirm**, Typ *Intern*, Scope
   `.../auth/gmail.send` hinzufügen.
2. **Anmeldedaten → OAuth-Client-ID → Desktop-App.**
3. Einmalig als `info@finanz-medizin.com` anmelden und den Refresh-Token holen
   (z. B. über die OAuth 2.0 Playground mit eigener Client-ID, Haken bei
   *Use your own OAuth credentials*).
4. In `.env`:
   ```
   GOOGLE_AUTH_MODE=oauth
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REFRESH_TOKEN=...
   ```

> **Wichtig:** Solange der Zustimmungsbildschirm auf *Testing* steht, läuft der
> Refresh-Token nach **sieben Tagen** ab und der Versand bleibt stehen. Für den
> Dauerbetrieb muss er auf *In production* stehen.

### 5.3 Zustellbarkeit

Damit die Mails nicht im Spam landen, müssen für `finanz-medizin.com` gesetzt
sein: **SPF** (`include:_spf.google.com`), **DKIM** (in der Admin-Konsole unter
Apps → Google Workspace → Gmail → E-Mail authentifizieren erzeugen und den
TXT-Eintrag setzen) und **DMARC**. Das ist unabhängig von dieser Automation,
fällt aber genau dann auf, wenn die ersten Mails rausgehen.

---

## 6. Installation

```bash
# Node 20 oder neuer
node -v

cd automation/hubspot-mailer

cp .env.example .env
chmod 600 .env
# .env ausfüllen — mindestens HUBSPOT_ACCESS_TOKEN, GOOGLE_SERVICE_ACCOUNT,
# GMAIL_SENDER_EMAIL und WEBHOOK_SHARED_SECRET

# Geheimnis für /hubspot/trigger erzeugen:
openssl rand -base64 32

npm run setup:properties   # Properties in HubSpot anlegen
npm run check              # Selbsttest
npm test                   # 102 Testfälle
npm start                  # starten
```

`npm run check` geht der Reihe nach alles durch und sagt bei jedem Punkt nicht
nur „kaputt“, sondern woran es liegt und was zu tun ist.

---

## 7. Deployment

Der Dienst braucht: ausgehendes HTTPS, einen Port, ein beschreibbares
Datenverzeichnis. 256 MB RAM reichen.

### 7.1 systemd auf einem kleinen Server (empfohlen)

```bash
# Benutzer und Verzeichnisse
sudo useradd --system --no-create-home --shell /usr/sbin/nologin hubspot-mailer
sudo mkdir -p /opt/hubspot-mailer /etc/hubspot-mailer

# Anwendung
sudo cp -r src scripts templates server.js package.json /opt/hubspot-mailer/
sudo chown -R root:root /opt/hubspot-mailer

# Zugangsdaten
sudo cp .env /etc/hubspot-mailer/hubspot-mailer.env
sudo chown root:hubspot-mailer /etc/hubspot-mailer/hubspot-mailer.env
sudo chmod 640 /etc/hubspot-mailer/hubspot-mailer.env

# Dienst
sudo cp deploy/hubspot-mailer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hubspot-mailer
sudo journalctl -u hubspot-mailer -f
```

Die Unit legt über `StateDirectory` das Verzeichnis `/var/lib/hubspot-mailer`
an. **Dort liegt das Ledger.** Es darf weder nach `/tmp` noch in ein
Verzeichnis, das ein Deployment überschreibt.

### 7.2 Docker

```bash
docker build -t hubspot-mailer -f deploy/Dockerfile .
docker run -d --name hubspot-mailer \
  --env-file /etc/hubspot-mailer/hubspot-mailer.env \
  -v hubspot-mailer-data:/var/lib/hubspot-mailer \
  -p 127.0.0.1:8080:8080 \
  --restart unless-stopped \
  hubspot-mailer
```

**Der Datenträger ist nicht optional.** Ohne ihn fängt das Ledger bei jedem
Neustart des Containers bei null an — und eine Mail, die schon raus ist, könnte
ein zweites Mal verschickt werden.

### 7.3 Reverse-Proxy

`deploy/Caddyfile` liegt bei. HubSpot verlangt für Webhooks eine öffentlich
erreichbare `https`-Adresse mit gültigem Zertifikat. Wichtig sind die
weitergereichten Kopfzeilen `X-Forwarded-Proto` und `X-Forwarded-Host` — ohne
sie sieht der Dienst nur `http://127.0.0.1`, während HubSpots Signatur über die
öffentliche Adresse gebildet wurde. Wer `PUBLIC_BASE_URL` setzt, ist davon
unabhängig; beides zusammen ist richtig.

Nach außen gehören nur `/hubspot/webhook`, `/hubspot/trigger` und `/healthz`.
`/metrics` und `/readyz` bleiben im eigenen Netz.

### 7.4 Aktualisieren

```bash
sudo systemctl stop hubspot-mailer     # wartet auf laufende Versände
sudo cp -r src scripts templates server.js /opt/hubspot-mailer/
sudo systemctl start hubspot-mailer
```

Beim Beenden wird angenommene Arbeit noch fertig gemacht (`TimeoutStopSec=45`),
damit kein Anspruch im Ledger offen stehen bleibt. Das Ledger in
`/var/lib/hubspot-mailer` wird dabei nicht angefasst.

### 7.5 Sicherung

Sichern Sie `/var/lib/hubspot-mailer/ledger.jsonl` mit. Geht die Datei
verloren, ist der Dublettenschutz für alle darin vermerkten Mails weg — ein
erneutes `queued` würde sie noch einmal verschicken.

---

## 8. Bedienung: eine Mail verschicken

An einem Kontakt in HubSpot:

| Feld | Eintrag |
|---|---|
| E-Mail senden | ☑ Ja |
| E-Mail Betreff | `Ihre Unterlagen zum Gespräch am {{meeting_date}}` |
| E-Mail Inhalt | `Guten Tag {{firstname}} {{lastname}},`<br><br>`anbei wie besprochen die Unterlagen. Unser Termin ist am {{meeting_date}} um {{meeting_time}}.`<br><br>`Viele Grüße`<br>`{{sender_name}}` |
| Gewünschter Versandzeitpunkt | leer = sofort |
| E-Mail Status | **Zum Versand freigegeben (queued)** |

Speichern. Nach wenigen Sekunden (Webhook) oder spätestens einer Minute
(Scheduler) steht dort:

| Feld | Inhalt |
|---|---|
| E-Mail Status | Versendet (sent) |
| E-Mail versendet am | 21.09.2026 08:42 |
| E-Mail Send-ID | `a3f2c9…` |
| E-Mail Gmail-ID | `18f3a…` |

### Platzhalter

| Platzhalter | Quelle |
|---|---|
| `{{firstname}}` `{{lastname}}` | Kontakt |
| `{{salutation}}` `{{jobtitle}}` | Kontakt |
| `{{company}}` | verknüpftes Unternehmen, sonst Feld *Firma* am Kontakt |
| `{{meeting_date}}` | `automation_meeting_at`, z. B. *Dienstag, 22.09.2026* |
| `{{meeting_time}}` | `automation_meeting_at`, z. B. *10:30 Uhr* |
| `{{sender_name}}` `{{sender_email}}` | Absenderkonto |
| `{{email}}` | Empfängeradresse |

**Ersatzwert:** `{{firstname|zusammen}}` setzt *zusammen* ein, falls der Vorname
fehlt.

**Fehlt ein Wert und steht kein Ersatz dabei, wird nicht gesendet.** Der Status
geht auf `failed`, und in `automation_email_error` steht, welcher Platzhalter
leer war und wie man es behebt. Das ist Absicht: „Guten Tag ,“ ist schlimmer als
eine Mail, die zehn Minuten später rausgeht.

Eigene Platzhalter über `PLACEHOLDER_MAP`:

```
PLACEHOLDER_MAP={"praxis":"company:name","fachgebiet":"contact:fachgebiet","berater":"const:Benedict Hintz"}
```

Quellen: `record:` (auslösender Datensatz), `contact:`, `company:`, `recipient:`,
`sender:`, `meeting:`, `const:`.

### Empfänger

| Objekt | Reihenfolge |
|---|---|
| **Kontakt** | 1. `automation_email_recipient` → 2. `email` |
| **Unternehmen** | 1. `automation_email_recipient` → 2. `automation_email_contact_id` → 3. genau **ein** verknüpfter Kontakt mit Adresse |
| **Lead** | 1. `automation_email_recipient` → 2. genau **ein** verknüpfter Kontakt → 3. über das verknüpfte Unternehmen, nach dessen Regeln |

**Bei mehreren möglichen Empfängern wird nicht gesendet.** Der Status geht auf
`failed`, und die Fehlermeldung nennt die Kontakt-IDs zur Auswahl:

> Mit dem Unternehmen sind 3 Kontakte mit E-Mail-Adresse verknüpft — damit ist
> der Empfänger nicht eindeutig. Bitte die Kontakt-ID des gewünschten
> Ansprechpartners in `automation_email_contact_id` eintragen. Zur Auswahl
> stehen: 501, 502, 507.

### Zeitgesteuert senden

`automation_send_at` auf einen Zeitpunkt in der Zukunft, Status auf `queued`.
Der Dienst setzt den Status auf `scheduled` und schickt die Mail, sobald sie
fällig ist. Ein Verschieben des Zeitpunkts erzeugt **keine** zweite Mail — der
Wunschzeitpunkt geht bewusst nicht in die Send-ID ein.

### Signatur

`templates/signature.html` wird an jede Mail angehängt. Platzhalter funktionieren
dort genauso. Tabellen und Inline-Styles sind in E-Mails kein schlechter Stil,
sondern die einzige Technik, die Outlook, Apple Mail, Gmail und Thunderbird
gleich darstellen.

> **Noch einzutragen:** Registernummer und Aufsichtsbehörde. Die Zeile steht
> auskommentiert am Ende von `templates/signature.html` — bitte mit den Angaben
> aus `impressum.html` füllen und einkommentieren.

`templates/wrapper.html` ist das Gerüst drumherum; `{{content}}` wird durch Text
plus Signatur ersetzt. Bewusst schlicht gehalten: kein Logo-Banner, keine bunten
Knöpfe, keine Zählpixel. Eine Mail aus einer Beratung soll wie ein Brief
aussehen und nicht wie ein Newsletter — das hilft auch gegen den Spam-Ordner.

---

## 9. Keine doppelten Mails — wie das funktioniert

Das ist der Kern. Vier Schichten, die unabhängig voneinander greifen.

### Schicht 1 — Die Send-ID

Jede Mail bekommt einen Fingerabdruck aus dem, was beim Empfänger ankommt:

```
SHA-256( Objektart + Datensatz-ID + Empfänger + Absender
       + Betreff + Text + Vorlage + Freigabeschlüssel )
```

Dieselbe Mail ergibt immer dieselbe ID — heute, in einem Monat, nach einem
Neustart, auch wenn HubSpot dasselbe Ereignis fünfmal schickt.

Bewusst **nicht** enthalten ist der Wunschzeitpunkt. Wer eine geplante Mail von
Dienstag auf Mittwoch schiebt, hat keine zweite Mail geschrieben.

Unsichtbare Unterschiede zählen ebenfalls nicht: ein zusätzliches Leerzeichen am
Zeilenende ergibt keine neue Mail.

### Schicht 2 — Der Anspruch vor dem Versand

```js
const anspruch = ledger.claim(sendId, …);   // synchron, danach fsync
if (anspruch.ergebnis !== 'acquired') return;
await gmail.sende(…);                        // erst jetzt
```

Die Reihenfolge ist das Entscheidende. Der Anspruch wird geschrieben **und auf
die Platte gezwungen**, bevor Gmail aufgerufen wird. Stürzt der Dienst mitten im
Versand ab, findet er nach dem Neustart einen Eintrag im Zustand `sending` vor
und sendet eben nicht noch einmal. Der umgekehrte Weg — erst senden, dann
vermerken — verliert genau in diesem Moment.

`claim()` ist durchgehend synchron. Damit kann sich zwischen Prüfung und Vermerk
kein zweiter Vorgang dazwischenschieben; in einer Node-Ereignisschleife gibt es
innerhalb eines synchronen Blocks kein Rennen.

Der `fsync` kostet ein paar Millisekunden. Ohne ihn stünde der Eintrag nur im
Seiten-Cache des Betriebssystems und wäre bei einem Stromausfall weg.

### Schicht 3 — Die vier Antworten

| Antwort | Bedeutung | Reaktion |
|---|---|---|
| `acquired` | frei | senden |
| `duplicate` | nachweislich schon raus | **nicht** senden; HubSpot auf `sent` korrigieren |
| `in_flight` | ein anderer Vorgang arbeitet daran | nichts tun |
| `blocked` | steht auf Prüfung | nichts tun, bis ein Mensch entscheidet |

Der Zweig `duplicate` korrigiert nebenbei den CRM-Stand. Das greift genau dann,
wenn der Versand geklappt hat, das Zurückschreiben nach HubSpot aber nicht —
beim nächsten Anlauf steht der Status wieder richtig, ohne dass eine zweite Mail
rausgeht.

### Schicht 4 — Die Kopfzeile in der Mail selbst

Jede Nachricht trägt `X-Automation-Send-Id: <Send-ID>`. Damit lässt sich im
Postausgang von Gmail zweifelsfrei nachsehen, ob eine bestimmte Mail raus ist —
unabhängig davon, ob Gmail die Message-ID durch eine eigene ersetzt hat. Genau
das nutzt die Nachschau aus Abschnitt 10.

### Absichtlich dieselbe Mail noch einmal senden

Tragen Sie in `automation_email_send_key` etwas Neues ein, z. B. `Nachfass 1`.
Das ändert den Fingerabdruck und gibt den Weg frei. Ohne diese Änderung
verhindert die Sperre die Wiederholung — auch wenn Sie den Status zehnmal auf
`queued` zurückstellen.

### Grenze

Das schützt **einen Prozess auf einer Maschine**. Wer zwei Instanzen parallel
betreibt, muss `src/store.js` gegen Postgres oder Redis tauschen; die
Schnittstelle sind vier Methoden. Für das Volumen, das ein Gmail-Postfach
überhaupt verschicken darf — 2 000 Empfänger am Tag —, reicht eine Instanz
mit Abstand.

---

## 10. Fehlerbehandlung

### Der Kern: wann darf wiederholt werden

Ein Fehler darf nur dann wiederholt werden, wenn feststeht, dass die Gegenseite
**nichts** getan hat.

| Fehler | Einordnung | Reaktion |
|---|---|---|
| HTTP 429, 500–599, 408 | `ja` — Gmail hat geantwortet, also nicht gesendet | bis zu 3 Versuche, exponentiell (2 s, 8 s, 32 s, mit Streuung) |
| HTTP 400, 403, 404 | `nein` — endgültig | sofort `failed`, kein zweiter Versuch |
| `ECONNREFUSED`, `ENOTFOUND` | `ja` — die Verbindung kam nie zustande | wiederholen |
| `ECONNRESET`, `ETIMEDOUT`, Abbruch | **`unklar`** | siehe unten |

Der letzte Fall ist der gefährliche: Die Anfrage kann angekommen und die Mail
verschickt worden sein — nur die Antwort hat den Rückweg nicht geschafft. Blind
wiederholen hieße riskieren, dass sie zweimal ankommt.

**Mit `GMAIL_VERIFY_ENABLED=true`** sieht der Dienst im Postausgang nach der
Kopfzeile `X-Automation-Send-Id` nach:

* gefunden → die Mail ist raus, wird nachträglich als `sent` gebucht;
* nicht gefunden → es ist **belegt**, dass nichts raus ist, also darf gefahrlos
  wiederholt werden.

Das braucht den Scope `gmail.readonly`. Gesucht wird nicht über die
Gmail-Volltextsuche (die indiziert eigene Kopfzeilen nicht), sondern indem die
letzten 50 Nachrichten im Ordner *Gesendet* einzeln nach ihren Kopfzeilen
gefragt werden — und das nur im Zweifelsfall.

**Ohne diese Möglichkeit** geht der Fall auf `needs_review`, und in
`automation_email_error` steht:

> Der Ausgang des Versands ist ungeklärt: … Bitte im Gmail-Postausgang von
> info@finanz-medizin.com nachsehen, ob die Mail dort steht. Es wird bewusst
> nichts automatisch wiederholt, damit sie nicht doppelt ankommt. Danach den
> Status von Hand auf „sent“ (war schon raus) oder „queued“ (war nicht raus)
> setzen.

Das ist eine bewusste Abwägung: lieber eine Mail, die zehn Minuten liegenbleibt,
als eine, die zweimal ankommt. Wenn Sie automatische Klärung wollen, geben Sie
den `gmail.readonly`-Scope frei.

### Was in HubSpot ankommt

Jeder Fehler landet im Klartext in `automation_email_error` — mit dem konkreten
Handgriff, nicht nur mit dem Symptom:

| Ursache | Meldung (gekürzt) |
|---|---|
| Kein Empfänger | *Der Kontakt hat keine E-Mail-Adresse.* |
| Mehrdeutig | *… 3 Kontakte … Bitte die Kontakt-ID … eintragen. Zur Auswahl stehen: 501, 502, 507.* |
| Platzhalter leer | *Zu diesen Platzhaltern fehlt der Wert: firstname. … oder im Text einen Ersatz angeben, z. B. `{{firstname|Kunde}}`.* |
| Delegierung fehlt | *Gmail verweigert den Versand im Namen von … Die domainweite Delegierung deckt den Scope gmail.send für dieses Postfach nicht ab.* |
| Kontingent | *Gmail-Kontingent erschöpft … Google Workspace erlaubt 2.000 Empfänger je Tag und Postfach.* |
| Allowlist | *Die Adresse steht nicht auf SEND_ALLOWLIST. Der Dienst läuft im eingeschränkten Testbetrieb.* |

Nach `failed` genügt ein Zurückstellen auf `queued`, um es erneut zu versuchen —
der Ledger-Eintrag steht auf `failed` und lässt einen neuen Anspruch zu.

### Bremsen

| Grenze | Standard | wogegen |
|---|---|---|
| `SEND_MAX_PER_MINUTE` | 30 | dagegen, dass ein versehentlich massenhaft gesetztes Kennzeichen in Minuten das Tageskontingent verbrennt |
| `SEND_DAILY_LIMIT` | 1500 | gegen Googles Grenze von 2 000 |
| `HUBSPOT_MAX_RPS` | 8 | gegen HubSpots 100 je 10 Sekunden |
| Warteschlange | 5 000 | gegen vollen Arbeitsspeicher |

---

## 11. Testfälle und Test mit einem HubSpot-Testkontakt

### 11.1 Die automatisierten Tests

```bash
npm test
```

102 Testfälle, keine Netzwerkverbindung nötig, unter zwei Sekunden.

| Datei | Fälle | prüft |
|---|---|---|
| `test/store.test.js` | 11 | **Dublettenschutz:** Anspruch, Absturz zwischen Anspruch und Versand, abgeschnittene Zeile nach Stromausfall, 1 000 Ansprüche → genau eine Freigabe, Verdichtung |
| `test/pipeline.test.js` | 31 | **Der ganze Ablauf:** Versand, Nachführen in HubSpot, fünf gleichzeitige Webhooks → eine Mail, Neustart nach Absturz, Zeitsteuerung, jeder Fehlerpfad |
| `test/recipient.test.js` | 14 | **Empfänger:** Kontakt, Unternehmen mit einem/mehreren/benanntem Kontakt, Lead über Kontakt und über Unternehmen |
| `test/mime.test.js` | 12 | **Die Nachricht:** Umlaute nach RFC 2047, Schnitt an Zeichengrenzen, Header-Injection über Betreff und Absendername, Zeilenlängen, Sommer-/Winterzeit |
| `test/template.test.js` | 16 | **Text:** Platzhalter, Ersatzwerte, HTML-Maskierung, Klartext↔HTML, Skript-Entfernung, deutsche Entitäten |
| `test/webhook.test.js` | 18 | **Eingang:** Signatur v3 echt/verfälscht/fremd/abgelaufen, Ereignisformate, Wiederholbarkeit, Warteschlange |

Die wichtigsten davon im Klartext:

```
✓ derselbe Datensatz zweimal verarbeitet sendet nur einmal
✓ fünf gleichzeitige Webhook-Ereignisse ergeben eine Mail
✓ ein Absturz nach dem Versand führt beim Neustart nicht zur zweiten Mail
✓ bei abgerissener Verbindung ohne Nachsehmöglichkeit wird nichts wiederholt
✓ war die Mail trotz Abbruch doch raus, wird sie nachträglich als versendet gebucht
✓ ist nachweislich nichts rausgegangen, wird gefahrlos wiederholt
✓ schlägt das Schreiben nach HubSpot fehl, gilt die Mail trotzdem als versendet
✓ Unternehmen mit mehreren Kontakten: lieber nichts als an alle
✓ ein Platzhalter ohne Wert bricht ab statt eine Lücke zu verschicken
✓ eine mitgeschnittene Anfrage lässt sich nicht später erneut einspielen
✓ Header-Injection über den Betreff geht nicht
```

### 11.2 Test mit einem echten HubSpot-Testkontakt

**Schritt 0 — Sicherheitsnetz spannen.** Bevor Sie am echten Portal testen:

```bash
# in .env
SEND_ALLOWLIST=benedict.hintz@gmail.com
```

Ab jetzt geht Post ausschließlich an diese Adresse. Jeder andere Kontakt bekommt
`failed` mit deutlichem Hinweis — auch wenn Sie versehentlich bei einem echten
Interessenten den Haken setzen.

**Schritt 1 — Testkontakt anlegen.** In HubSpot: *Kontakte → Kontakt erstellen*

| Feld | Wert |
|---|---|
| Vorname / Nachname | Test / Automation |
| E-Mail | Ihre eigene Adresse |
| Firma | Testpraxis |

**Schritt 2 — nur ansehen, nichts senden.** Die ID steht in der URL
(`…/contact/12345/`):

```bash
npm run send:test -- --type contacts --id 12345 --preview
```

Ausgabe:

```
Vorschau contacts/12345
  Empfaenger:   benedict.hintz@gmail.com   (ermittelt ueber: kontakt.email)
  Absender:     info@finanz-medizin.com
  Betreff:      Ihre Unterlagen zum Gespräch am Dienstag, 22.09.2026
  Send-ID:      a3f2c9d1e4b7…
  Im Ledger:    noch nicht vorhanden
  Status jetzt: queued
  Freigegeben:  true
  Platzhalter:  firstname=Test, lastname=Automation, company=Testpraxis, …

  HTML:  /var/lib/hubspot-mailer/vorschau-contacts-12345.html
  Text:  /var/lib/hubspot-mailer/vorschau-contacts-12345.txt
```

Die HTML-Datei im Browser öffnen. Hier sehen Sie genau das, was der Empfänger
sehen würde — Platzhalter gefüllt, Signatur dran, Gerüst drumherum.

**Schritt 3 — Gmail-Weg allein prüfen.** Ohne HubSpot, nur Google:

```bash
npm run send:test -- --to benedict.hintz@gmail.com
```

Kommt die Mail an, steht die gesamte Google-Seite: Dienstkonto, Delegierung,
Scope, Postfach.

**Schritt 4 — der volle Weg.** Am Testkontakt in HubSpot:

* *E-Mail senden* ☑
* Betreff und Inhalt füllen
* Status → **queued**, speichern

Und dann zusehen:

```bash
sudo journalctl -u hubspot-mailer -f
```

```
{"event":"trigger.erkannt","objectType":"contacts","objectId":"12345","trigger":"webhook"}
{"event":"empfaenger.ermittelt","recipient":"b***@gmail.com","quelle":"kontakt.email"}
{"event":"versand.versuch","versuch":1,"sendId":"a3f2c9d1…"}
{"event":"versand.erfolgreich","message_id":"18f3a…","dauer_ms":842}
{"event":"hubspot.aktualisiert","status":"sent"}
```

In HubSpot steht der Kontakt jetzt auf *Versendet*, mit Zeitpunkt und Send-ID.

**Schritt 5 — die Dublettensperre ausprobieren.** Das ist der Test, auf den es
ankommt. Stellen Sie den Status von Hand zurück auf **queued** und speichern Sie.

```
{"event":"dublette.abgewehrt","sendId":"a3f2c9d1…","gesendet_am":"2026-09-21T06:42:11Z"}
{"event":"hubspot.aktualisiert","status":"sent"}
```

**Es kommt keine zweite Mail an.** HubSpot springt zurück auf *Versendet*.

Wiederholen Sie es beliebig oft — auch mehrmals schnell hintereinander, auch mit
einem Neustart des Dienstes dazwischen.

**Schritt 6 — absichtlich erneut senden.** Tragen Sie in *Freigabeschlüssel*
`Nachfass 1` ein und stellen Sie den Status wieder auf `queued`. Jetzt kommt die
Mail — weil Sie es ausdrücklich gesagt haben.

**Schritt 7 — Zeitsteuerung.** *Gewünschter Versandzeitpunkt* auf drei Minuten in
der Zukunft, Status `queued`. Der Status springt auf *Geplant*; drei Minuten
später steht dort *Versendet*.

**Schritt 8 — Fehlerfälle.** Jeweils Status auf `queued` und schauen, was in
*E-Mail Fehler* steht:

* E-Mail-Adresse am Kontakt leeren
* einen Platzhalter benutzen, dessen Feld leer ist
* ein Unternehmen mit zwei verknüpften Kontakten nehmen

**Schritt 9 — Sicherheitsnetz lösen.** `SEND_ALLOWLIST` aus der `.env` nehmen,
Dienst neu starten. Der Selbsttest zeigt beim nächsten Lauf, ob die Liste noch
aktiv ist.

### 11.3 Endpunkte von Hand prüfen

```bash
curl -s localhost:8080/healthz
curl -s -H "X-Automation-Token: $WEBHOOK_SHARED_SECRET" localhost:8080/metrics | jq

# Einen Datensatz von Hand anstoßen
curl -s -X POST localhost:8080/hubspot/trigger \
  -H "Content-Type: application/json" \
  -H "X-Automation-Token: $WEBHOOK_SHARED_SECRET" \
  -d '{"objectType":"contacts","objectId":"12345"}'
```

---

## 12. Protokoll und Überwachung

Eine Zeile JSON je Ereignis auf stdout — von `journalctl`, Docker, Loki oder
CloudWatch gleichermaßen lesbar.

**Zwei Regeln sind hart verdrahtet:** Der Text einer Mail taucht nie im
Protokoll auf — nicht gekürzt, nicht gehasht, gar nicht. Und Adressen stehen
maskiert da (`b***@gmail.com`). Für die Frage „an wen ging das“ reicht das; für
ein Datenleck nicht. Tokens, private Schlüssel und JWTs werden zusätzlich über
Mustererkennung entfernt, auch wenn sie unter einem harmlosen Feldnamen stehen.

Nachvollziehbar bleibt alles, was gefordert war:

| Frage | Ereignis |
|---|---|
| Wann wurde ein Trigger erkannt? | `trigger.erkannt` mit `objectType`, `objectId`, `trigger` |
| Welcher Datensatz? | `objectType` + `objectId` in jeder Zeile |
| Welche Send-ID? | `sendId` ab Schritt 5 |
| Wurde gesendet? | `versand.erfolgreich` mit `message_id` und `dauer_ms` |
| Wann? | `ts` in jeder Zeile, ISO 8601 UTC |
| Gab es einen Fehler? | `versand.fehler`, `versand.endgueltig_fehlgeschlagen`, `versand.ungeklaert` |
| Wurde eine Dublette verhindert? | `dublette.abgewehrt` |

Nützliche Abfragen:

```bash
# Alles zu einer Send-ID
journalctl -u hubspot-mailer -o cat | jq -c 'select(.sendId=="a3f2c9d1…")'

# Was heute rausging
journalctl -u hubspot-mailer --since today -o cat | jq -c 'select(.event=="versand.erfolgreich")'

# Verhinderte Dubletten
journalctl -u hubspot-mailer -o cat | jq -c 'select(.event=="dublette.abgewehrt")'

# Fälle, die einen Menschen brauchen
journalctl -u hubspot-mailer -o cat | jq -c 'select(.event=="versand.ungeklaert")'
```

### Was überwacht gehört

`GET /metrics` (mit `X-Automation-Token`) liefert:

```json
{
  "versand": { "gesendet": 42, "fehlgeschlagen": 1, "doppelt": 3, "pruefung": 0 },
  "poller":  { "durchlaeufe": 1440, "letzterLauf": "2026-09-21T08:42:00Z", "letzterFehler": null },
  "ledger":  { "eintraege": 1204, "gesendet_24h": 42, "offene_faelle": 0 },
  "warteschlange": 0
}
```

Drei Alarme genügen:

| Bedingung | heißt |
|---|---|
| `ledger.offene_faelle > 0` | jemand muss im Postausgang nachsehen |
| `poller.letzterLauf` älter als 5 Minuten | der Scheduler steht |
| `warteschlange > 100` | es staut sich |

In HubSpot lässt sich dieselbe Frage ohne Technik beantworten: eine Liste mit
*E-Mail Status ist einer von `failed`, `needs_review`*. Wer da draufschaut, sieht
alles, was Aufmerksamkeit braucht.

---

## 13. Weitere Mailtypen hinzufügen

Die Automation kennt keine Mailtypen — sie verschickt, was in den Properties
steht. Für unterschiedliche Anlässe gibt es drei Wege, von einfach nach mächtig.

### Weg 1 — Vorlage in HubSpot, kein Code

Für jeden Anlass einen Wert in `automation_email_template`:

```
TEMPLATE_OPTIONS=standard,erstinformation,terminbestaetigung,nachfass,jahresgespraech
```

```bash
npm run setup:properties   # ergänzt die neuen Optionen
```

Dann ein HubSpot-Workflow je Anlass, der Betreff und Text in die Properties
schreibt und den Status auf `queued` setzt. Beispiel *Terminbestätigung*:

* Auslöser: *Termin gebucht*
* Aktion 1: `automation_email_template` = `terminbestaetigung`
* Aktion 2: `automation_email_subject` = `Ihr Termin am {{meeting_date}}`
* Aktion 3: `automation_email_body` = der Text
* Aktion 4: `automation_email_enabled` = Ja
* Aktion 5: `automation_email_status` = `queued`

Der Wert geht in die Send-ID ein. Dieselbe Person kann also *Erstinformation*
und *Nachfass* bekommen, auch wenn der Text zufällig identisch wäre.

**Das deckt die meisten Fälle ab, und es braucht keine Zeile Code.**

### Weg 2 — Neue Platzhalter

```
PLACEHOLDER_MAP={"praxis":"company:name","fachgebiet":"contact:fachgebiet","kammer":"record:aerztekammer"}
```

Neu starten, fertig. Die Felder werden automatisch mitgeladen.

### Weg 3 — Feste Textbausteine im Code

Wenn ein Mailtyp immer denselben Text hat, soll er nicht in jedem Datensatz
stehen. Dafür in `src/pipeline.js`, direkt vor `baueMail`:

```js
/* Feste Texte je Vorlage. Was im Datensatz steht, gewinnt — so lässt sich
   im Einzelfall abweichen, ohne den Code anzufassen. */
const BAUSTEINE = {
  erstinformation: {
    betreff: 'Ihre Erstinformation',
    rumpf: '<p>Guten Tag {{firstname}},</p><p>anbei unsere Erstinformation …</p>'
  }
};

const vorlage = BAUSTEINE[String(props[this.cfg.props.template] || '')] || {};
const betreffRoh = String(props[this.cfg.props.subject] || vorlage.betreff || '').trim();
const rumpfRoh   = String(props[this.cfg.props.body]    || vorlage.rumpf   || '').trim();
```

### Weitere Objektarten

Deals oder Tickets aufnehmen:

```
OBJECT_TYPES=contacts,companies,leads,deals
```

`npm run setup:properties` legt die Properties dort an, `src/hubspot.js` kennt
die Pfade schon. Für Deals und Tickets muss die Empfängerermittlung in
`src/recipient.js` noch ergänzt werden — die Regeln des Unternehmens sind dabei
die richtige Vorlage: **eindeutig oder gar nicht.**

### Weiteres Absenderpostfach

```
SENDER_ACCOUNTS={"info":{"email":"info@finanz-medizin.com","name":"Finanz & Medizin"},"beratung":{"email":"beratung@finanz-medizin.com","name":"Benedict Hintz","replyTo":"benedict@finanz-medizin.com"}}
```

Das neue Postfach muss in der domainweiten Delegierung mit abgedeckt sein (sie
gilt für die ganze Domain, also in der Regel automatisch).
`npm run setup:properties` ergänzt die Auswahl in HubSpot.

### Nahe Erweiterungen

* **Mail in der HubSpot-Zeitleiste protokollieren.** Ein `POST` auf
  `/crm/v3/objects/emails` mit Verknüpfung zum Kontakt, direkt nach
  `buchVersandAb()` in `src/pipeline.js`. Braucht den Scope für
  E-Mail-Engagements. Rund 30 Zeilen.
* **Anhänge.** `src/mime.js` müsste von `multipart/alternative` auf
  `multipart/mixed` mit eingebettetem `alternative` umgestellt werden. Die
  Quelle der Dateien wäre zu klären — HubSpot-Dateien-API oder fester Ordner.
* **Sendefenster.** Keine Geschäftspost um drei Uhr nachts: eine Prüfung in
  `src/pipeline.js` vor dem Anspruch, die außerhalb der Zeiten auf `scheduled`
  mit dem nächsten Werktagmorgen setzt.
* **Zweite Instanz.** `src/store.js` gegen Postgres tauschen, dabei `claim()`
  als `INSERT … ON CONFLICT DO NOTHING` auf einer eindeutigen Spalte `send_id`.
  Das ist derselbe Gedanke, nur von der Datenbank durchgesetzt.

---

## 14. Grenzen

Was dieser Dienst **nicht** tut, und warum:

* **Keine Anhänge.** Siehe oben — nachrüstbar, aber heute nicht drin.
* **Keine Massenmails.** Gmail erlaubt 2 000 Empfänger am Tag; wer mehr braucht,
  nimmt ein Versandsystem mit eigener Zustellinfrastruktur.
* **Keine Öffnungs- oder Klickmessung.** Das wären Zählpixel, und die wollten
  Sie auf der Website schon nicht — es wäre auch ein eigener
  datenschutzrechtlicher Vorgang.
* **Keine zweite Instanz.** Der Dublettenschutz ist auf einen Prozess auf einer
  Maschine ausgelegt. Siehe Abschnitt 9, letzter Absatz.
* **Keine Abmeldeverwaltung.** Wer in HubSpot auf der Sperrliste steht, wird
  hier nicht geprüft. Für Werbe-Mails müsste das ergänzt werden; für die
  1:1-Korrespondenz aus einer laufenden Beratung ist es nicht einschlägig.

**Zwei Dinge, die Sie im Blick behalten sollten:**

1. **Das Ledger ist die kritische Datei.** `/var/lib/hubspot-mailer/ledger.jsonl`
   gehört ins Backup. Geht sie verloren, ist der Dublettenschutz für alles darin
   Vermerkte weg.
2. **Der Mailtext kommt aus einem Freitextfeld.** Wer Schreibrechte auf einen
   Kontakt hat, kann bestimmen, was von `info@finanz-medizin.com` verschickt
   wird. Skripte und Ereignisattribute werden entfernt, Kopfzeilen lassen sich
   nicht einschmuggeln — aber der Text selbst ist ungeprüft. In einem
   Zwei-Personen-Portal ist das unerheblich; bei zwanzig Mitarbeitern wäre eine
   Freigabestufe zu überlegen.
