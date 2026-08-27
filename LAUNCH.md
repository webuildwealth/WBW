# Launch-Anleitung

Diese Datei ist der einzige Zettel, den Sie zum Livegang brauchen.
Reihenfolge einhalten — Schritt 1 bringt die Seite online, alles danach
schaltet Funktionen dazu. Die Seite läuft auch ohne Schritt 3 und 4;
solange die Schlüssel fehlen, zeigt sie statt des Kalenders still ein
Rückrufformular.

Zeitbedarf: Schritt 1 fünf Minuten, Schritt 3 zehn, Schritt 4 zwanzig.

---

## 1 · Seite auf Netlify bringen

**Weg A — ZIP hochladen (kein Terminal nötig)**

1. https://app.netlify.com → *Add new site* → *Deploy manually*
2. `finanz-medizin-netlify.zip` ins Feld ziehen
3. Fertig. Netlify vergibt eine Adresse wie `zufallsname.netlify.app`.

**Weg B — aus dem Git-Repository (empfohlen)**

Damit deployt jede Änderung automatisch.

1. *Add new site* → *Import an existing project* → GitHub → Repository `webuildwealth/WBW`
2. Branch: `claude/finanzen-medizin-website-9set7w`
3. Build command: **leer lassen**
4. Publish directory: **`.`**
5. Functions directory: **`netlify/functions`**

Beides funktioniert, weil `netlify.toml` die Einstellungen ohnehin mitbringt.

---

## 2 · Domain verbinden

*Site configuration* → *Domain management* → *Add a domain* → `finanz-medizin.com`

Netlify nennt Ihnen dann die Nameserver oder die DNS-Einträge. Beim
Registrar eintragen, dann `www` als Alias ergänzen. Netlify stellt das
Let's-Encrypt-Zertifikat automatisch aus, sobald die DNS-Änderung
durchgelaufen ist (meist unter einer Stunde, bis zu 24).

Da `finanz-medizin.com` bereits erreichbar ist: Erst die neue Seite auf
der Netlify-Adresse prüfen, dann umstellen. Sonst ist die alte Seite weg,
bevor die neue steht.

---

## 3 · Close anbinden

Damit landen Check-Anfragen **und** Terminbuchungen im CRM.

1. Close → *Settings* → *API Keys* → *New API Key*, Namen z. B. „Website"
2. Netlify → *Site configuration* → *Environment variables* → *Add*

| Variable | Wert |
|---|---|
| `CLOSE_API_KEY` | der Schlüssel aus Close (beginnt mit `api_`) |

Optional, wenn neue Anfragen in einer bestimmten Spalte landen sollen:

| Variable | Wert |
|---|---|
| `CLOSE_LEAD_STATUS_ID` | die Status-ID aus Close, beginnt mit `stat_` |

> Den Schlüssel niemand zeigen und nirgends in eine Datei schreiben — er
> gibt vollen Zugriff auf das CRM, auch zum Löschen. Er gehört
> ausschließlich in die Netlify-Umgebungsvariablen; von dort kommt er nie
> in den Browser des Besuchers.

---

## 4 · Google Kalender anbinden

Die Seite trägt Termine über ein **Dienstkonto** ein. Das ist ein
technischer Google-Account, dem Sie Ihren Kalender freigeben — kein
OAuth-Login, kein Ablaufen, kein Zustimmungsdialog.

**4.1 Projekt und Dienstkonto**

1. https://console.cloud.google.com → oben Projekt anlegen, z. B. „Finanz-Medizin"
2. *APIs & Services* → *Library* → **Google Calendar API** → *Enable*
3. *APIs & Services* → *Credentials* → *Create credentials* → *Service account*
   - Name z. B. `website-buchung`, dann *Done*
4. Auf das angelegte Dienstkonto klicken → Reiter *Keys* →
   *Add key* → *Create new key* → **JSON** → es lädt eine `.json`-Datei herunter
5. In dieser Datei steht ein Feld `client_email`, etwa
   `website-buchung@finanz-medizin.iam.gserviceaccount.com`. Die brauchen Sie gleich.

**4.2 Kalender freigeben**

1. https://calendar.google.com → beim gewünschten Kalender auf die drei
   Punkte → *Einstellungen und Freigabe*
2. Unter *Für bestimmte Personen freigeben* → *Personen hinzufügen*
3. Die `client_email` aus Schritt 4.1 eintragen
4. Berechtigung: **„Termine ändern"** (nicht nur „Alle Termindetails sehen" —
   sonst kann die Seite lesen, aber nichts eintragen)
5. Weiter unten unter *Kalender integrieren* steht die **Kalender-ID**.
   Beim Hauptkalender ist das Ihre E-Mail-Adresse.

**4.3 In Netlify eintragen**

| Variable | Wert |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT` | der **gesamte Inhalt** der JSON-Datei aus 4.1, in einer Zeile |
| `GOOGLE_CALENDAR_ID` | die Kalender-ID aus 4.2 |

Den JSON-Inhalt einfach komplett kopieren und einfügen — mit allen
Klammern und dem `private_key` samt `\n`. Falls die Oberfläche mit dem
langen Wert Probleme macht, wird auch eine base64-kodierte Fassung
akzeptiert.

**4.4 Buchungsfenster (alle optional)**

| Variable | Vorgabe | Bedeutung |
|---|---|---|
| `BOOKING_TIMEZONE` | `Europe/Berlin` | Zeitzone der angezeigten Zeiten |
| `BOOKING_HOURS` | `9-18` | frühester und spätester Beginn |
| `BOOKING_DAYS` | `1,2,3,4,5` | Wochentage, 1 = Montag |
| `BOOKING_DURATION_MIN` | `25` | Gesprächsdauer |
| `BOOKING_LEAD_HOURS` | `24` | Mindestvorlauf bis zum Termin |
| `BOOKING_HORIZON_DAYS` | `14` | wie weit im Voraus buchbar |

Nach dem Setzen von Umgebungsvariablen einmal *Deploys* → *Trigger deploy*
→ *Clear cache and deploy site*. Vorher greifen sie nicht.

---

## 5 · Abnahme

| Prüfung | Erwartung |
|---|---|
| `https://…/api/slots` im Browser | JSON mit Tagen und Zeiten. `{"ok":false,"grund":"nicht_konfiguriert"}` heißt: Schritt 4 fehlt noch |
| Einen Check ausfüllen | Neuer Lead in Close, mit Notiz und allen Antworten |
| Einen Termin buchen | Eintrag im Google Kalender **und** ein Lead in Close |
| Buchung im Kalender | Titel „Erstgespräch · Vorname Name", Sie sind der einzige Teilnehmer |

Der gebuchte Termin lädt Sie **nicht** per Mail ein — ein Dienstkonto darf
das ohne domainweite Delegation nicht. Der Eintrag steht direkt im
Kalender; die Bestätigung an den Interessenten schicken Sie aus Close.

---

## 6 · Auftragsverarbeitungsverträge

Die Datenschutzerklärung sagt zu, dass mit Netlify, Close und Google
Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO bestehen. Diese
Zusage müssen Sie einlösen — das ist die einzige Aufgabe, die niemand
für Sie erledigen kann:

| Anbieter | Wo |
|---|---|
| Netlify | *Team settings* → *Legal & compliance* → DPA akzeptieren |
| Close | *Settings* → *Legal* — je nach Tarif per Klick oder auf Anfrage |
| Google | Cloud Console → *Terms* — der Cloud-DPA gilt mit der Nutzung als vereinbart |

Das blockiert den technischen Livegang nicht: Die Seite läuft, sobald
Schritt 1 durch ist. Die Verträge sollten aber stehen, bevor der erste
echte Datensatz durchläuft — also bevor Sie die Domain umstellen.

### Später verfeinern, nicht dringend

Die Erklärung nennt Close als „Anbieter mit Sitz in den Vereinigten
Staaten". Das genügt Art. 13 Abs. 1 lit. e DSGVO, der ausdrücklich
Empfänger **oder Kategorien von Empfängern** verlangt. Sobald Sie den
DPA vorliegen haben, können Sie dort die genaue Firmierung und Anschrift
eintragen — schöner, aber nicht erforderlich.

Auf der Über-uns-Seite steht statt eines Porträts eine Signet-Fläche.
Wenn ein Foto vorliegt, tritt es an ihre Stelle; die Gestaltung dafür
liegt bereit (`.person__bild` im Stylesheet).
