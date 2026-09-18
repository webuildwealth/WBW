# finanz-medizin.com

Statische Website mit drei zielgruppenspezifischen Landingpages und Lead-Funnels für
**Finanz-Medizin** — die auf Heilberufe spezialisierte Marke von We Build Wealth
(Einzelunternehmen, Inhaber Benedict Hintz).

Kein Build-Schritt, keine Abhängigkeiten, kein Framework. Ordner hochladen, fertig.

> **Hosterwechsel geplant?** [DEPLOYMENT.md](DEPLOYMENT.md) listet auf, was die Seite
> von einem Hoster braucht, und was beim Wechsel anzupassen ist. Die Close-Logik in
> `lib/lead-core.js` ist plattformunabhängig — zu ersetzen ist nur der Adapter.

---

## Seitenstruktur

| Datei | Zweck | Funnel |
|---|---|---|
| `index.html` | Hub mit 3D-Scroll-Sequenz und Zielgruppen-Weiche | — |
| `praxisinhaber.html` | Praxisinhaberinnen und Praxisinhaber | Praxis-Check |
| `angestellte-aerzte.html` | Angestellte Ärztinnen und Ärzte | Vermögens-Check |
| `mfa-praxisteam.html` | MFA und Praxisteam | Vorsorge-Check |
| `beratung.html` | Vollbild-Kurzcheck für Social Media (`/beratung`) | Kurzcheck |
| `danke.html` | Bestätigungsseite, segmentspezifisch | — |
| `impressum.html` | Impressum + Erstinformation § 15 VersVermV | — |
| `datenschutz.html` | Datenschutzerklärung (DSGVO) | — |
| `404.html` | Fehlerseite, von Netlify automatisch ausgeliefert | — |
| `assets/js/beratung.js` | Ablauf des Kurzchecks: Fragen, Terminwahl, Absenden | Kurzcheck |
| `lib/lead-core.js` | Close-Logik, hosterunabhängig — prüft, baut Lead und Notiz, sendet | alle |
| `netlify/functions/lead.js` | Netlify-Adapter, rund 30 Zeilen, enthält keine Fachlogik | alle |

### Zielgruppen-Ansprache

Jede Landingpage argumentiert bewusst anders:

- **Praxisinhaber** — betriebswirtschaftlich. Fluktuationskosten, Steuerhebel sortiert
  nach Wirkung, Vorher-Nachher-Vergleiche, vollständige Quellen und Rechenwege für den
  Steuerberater.
- **Angestellte Ärzte** — Opportunitätskosten. Grenzsteuersatz als Hebel, Zeit als
  Faktor, Arbeitskraftabsicherung mit den vertragsrelevanten Details, Vorbereitung auf
  die Niederlassung.
- **MFA & Praxisteam** — Sicherheit und Verständlichkeit. Kein Fachjargon, alles in
  Euro, Fokus auf Altersarmut, Teilzeit- und Familienlücken sowie darauf, dass die
  meisten Leistungen die Praxis zahlt. Explizite Vertraulichkeitszusage gegenüber
  dem Arbeitgeber.

---

## Vor dem Livegang — Pflichtpunkte

### 1. Rechtsangaben — weitgehend erledigt

`impressum.html` ist vollständig und enthält keine Platzhalter mehr. Grundlage sind
die verbindlichen Angaben aus dem Impressum von We Build Wealth:

- **Anbieter:** Benedict Hintz, Einzelunternehmer, Calvinstraße 3, 10557 Berlin
- **Finanz-Medizin ist eine Marke** und ein Geschäftsbereich des Einzelunternehmens
  We Build Wealth — keine eigene Gesellschaft, kein Handelsregistereintrag, keine
  USt-IdNr. Die Erlaubnisse sind Benedict Hintz persönlich erteilt.
- § 34d Abs. 1 GewO: `D-5V3H-7KX3I-54` · § 34f Abs. 1 S. 1 Nr. 1 GewO: `D-F-107-RV51-31`
- Aufsicht: IHK Berlin · Register: DIHK

**Erlaubnisumfang beachten.** Die § 34f-Erlaubnis deckt nur Nr. 1 ab (offene
Investmentvermögen); geschlossene Investmentvermögen und Vermögensanlagen sind nicht
umfasst. Eine Erlaubnis nach § 34c oder § 34i GewO besteht nicht. Weil die Seiten
Immobilien, Sachwerte und Beteiligungen thematisieren, steht auf `index.html`,
`praxisinhaber.html` und `angestellte-aerzte.html` jeweils ein Hinweis, der die
Grenzen benennt und auf `impressum.html#umfang` verweist. **Wird das Angebot
inhaltlich erweitert, ist dieser Hinweis mitzuführen.**

In `datenschutz.html` sind noch drei Punkte offen (gelb markiert):

- Anschrift von Netlify aus dem DPA (Abschnitt 3)
- Anschrift des Close-Betreibers aus dem DPA (Abschnitt 4)
- jeweils die Frage der Zertifizierung unter dem EU-US Data Privacy Framework

Danach den Hinweiskasten entfernen und im CSS Abschnitt 21 (`.todo`, `.todo-note`)
löschen.

### 2. Schriften — erledigt

Manrope, Inter und Newsreader liegen unter `assets/fonts/` und werden vom eigenen
Server ausgeliefert. **Die Seite ruft keine externe Domain mehr auf** — geprüft mit
einem Browserlauf: null externe Requests. Damit ist kein Consent-Dialog nötig, und
die Content-Security-Policy kommt vollständig mit `'self'` aus.

- Subsets `latin` und `latin-ext`, `font-display: swap`
- 14 `@font-face`-Regeln oben in `assets/css/site.css`; die Dateien werden über
  `unicode-range` nur geladen, wenn sie gebraucht werden — für deutschen Text sind
  das drei Dateien, zusammen rund 134 KB
- Die beiden wichtigsten Schnitte werden im `<head>` per `rel="preload"` vorgeladen
- `netlify.toml` cached `/assets/fonts/*` ein Jahr immutable

**Wenn eine Schrift ersetzt wird**, muss der Dateiname mit wechseln — sonst liefern
Browser wegen `immutable` weiter die alte Datei aus.

**Optimierungsmöglichkeit:** Newsreader wird nur für die Kursiv-Zitate auf
`praxisinhaber.html` gebraucht und kostet rund 62 KB. Wer darauf verzichten mag,
löscht die `@font-face`-Regeln und die Datei — der Fallback in `--font-serif` ist
Georgia und sieht dort ordentlich aus.

### 3. Close-Anbindung scharfschalten

Die Funnels senden an `/api/lead`. Dahinter liegt die Netlify Function
`netlify/functions/lead.js`, die in Close einen **Lead mit Kontakt** und eine
**Notiz mit allen Antworten** anlegt.

**Warum eine Function und kein direkter Aufruf aus dem Browser:** Ein Close-API-Key
erlaubt Vollzugriff auf das gesamte CRM — Lesen, Ändern, Löschen. Im Frontend läge er
im Quelltext offen und wäre binnen Stunden missbraucht. Er gehört ausschließlich
serverseitig in eine Umgebungsvariable.

#### Einzurichten in Netlify → Site configuration → Environment variables

| Variable | Pflicht | Zweck |
|---|---|---|
| `CLOSE_API_KEY` | ja | Close → Settings → API Keys → New API Key |
| `CLOSE_LEAD_STATUS_ID` | nein | Lead-Status für neue Anfragen, z. B. `stat_…`. Ohne Angabe greift der Close-Standard |
| `CLOSE_CUSTOM_FIELDS` | nein | Mapping auf echte Close-Felder, siehe unten |

Nach dem Setzen einen Redeploy auslösen — Functions lesen die Variablen beim Start.

#### Was in Close ankommt

- **Lead-Name:** der Praxisname, sonst der Personenname
- **Kontakt:** Name, E-Mail, Telefon
- **Beschreibung:** „Praxis-Check über finanz-medizin.com" (je nach Funnel)
- **Notiz** mit allen Antworten, Erreichbarkeit, Einwilligung, Landingpage, Verweis,
  UTM-Parametern, Ausfülldauer und Zeitstempel

Beispiel:

```
=== Praxis-Check über finanz-medizin.com ===

ANGABEN AUS DEM CHECK
  • Praxisform: Einzelpraxis
  • Teamgröße: 4–8 Mitarbeitende
  • Wichtigstes Ziel: Team halten und gewinnen, Steuerlast senken
  • Bereits vorhanden: Nein, bisher nichts

KONTAKT
  • Praxis: Hausarztpraxis Berger
  • Erreichbarkeit: Nachmittags (14 – 18 Uhr)
  • Einwilligung Kontaktaufnahme: ja

HERKUNFT
  • Landingpage: /praxisinhaber.html
  • Kampagne: utm_source=google, utm_campaign=praxis-q3
  • Ausfülldauer: 74 Sekunden
```

Die Beschriftungen stammen aus den `data-label`-Attributen im Markup — eine neue
Funnel-Frage erscheint automatisch mit dem richtigen Namen in der Notiz, ohne dass
die Function angefasst werden muss.

#### Optional: eigene Close-Felder befüllen

Damit sich Anfragen in Close filtern und in Smart Views auswerten lassen, legen Sie
dort Lead-Custom-Fields an und hinterlegen das Mapping als JSON:

```
CLOSE_CUSTOM_FIELDS = {"funnel":"cf_a1b2c3","praxisform":"cf_d4e5f6","teamgroesse":"cf_g7h8i9"}
```

Links stehen die Funnel-Schlüssel (`funnel`, `praxisform`, `teamgroesse`,
`prioritaet`, `betrieblich`, `status`, `ziel`, `sparrate`, `bestand`, `rolle`,
`lebensphase`, `sorge`, `praxisangebot`, `seite`, `kampagne`, `erreichbarkeit`),
rechts die Feld-IDs aus Close. Unbekannte oder falsch formatierte IDs werden
ignoriert, die Notiz enthält ohnehin alles.

#### Schutzmechanismen der Function

- Honeypot: ausgefülltes `website`-Feld wird verworfen, der Bot bekommt trotzdem 200
- Pflichtprüfung für Name, E-Mail-Format und Einwilligung
- Längenbegrenzung aller Felder, bevor sie ins CRM wandern
- Nur `POST`; Fehler werden ohne personenbezogene Daten protokolliert

#### Verhalten im Fehlerfall

Antwortet Close nicht, gibt die Function `502` zurück und die Seite zeigt „Das hat
gerade nicht geklappt — schreiben Sie uns an info@finanz-medizin.com". **Die Anfrage
wird in diesem Fall nicht zwischengespeichert.** Wer das absichern will, kann in der
Function zusätzlich in Netlify Blobs schreiben oder eine Benachrichtigungs-E-Mail
auslösen — beides bewusst nicht eingebaut, um die Zahl der Auftragsverarbeiter klein
zu halten.

#### Lokal testen

```bash
npm i -g netlify-cli
netlify dev          # bedient /api/lead gegen die echte Function
```

Ohne `netlify dev` läuft die Seite weiterhin über `python3 -m http.server`, der
Funnel läuft dann aber ins Leere — `/api/lead` existiert nur auf Netlify.

### 4. Domain und Metadaten

Alle `canonical`- und `og:url`-Angaben zeigen bereits auf
`https://www.finanz-medizin.com/`. Bei abweichender Domain zusätzlich `sitemap.xml`
und `robots.txt` anpassen.

---

## Technik

### 3D-Szene ohne Bibliothek

`assets/js/scene.js` enthält einen eigenen 3D-Renderer auf Canvas 2D: perspektivische
Projektion, tiefensortierte Tube-Segmente mit Spekular-Glanz, extrudierte Balken und
schattierte Scheiben. Keine WebGL-Abhängigkeit, kein Three.js, rund 20 KB unminifiziert.

Die Startseite morpht scrollgesteuert über vier Zielformen:

```
0  STETHOSKOP  →  1  EKG  →  2  WACHSTUMSKURVE  →  3  SIGNET (Bildmarke)
```

Steuerung über Data-Attribute am `<canvas>`:

| Attribut | Bedeutung |
|---|---|
| `data-scene="stage"` | scrollgesteuert; erwartet einen `.stage`-Vorfahren |
| `data-scene="idle"` | Dauerrotation, für Hero-Grafiken der Landingpages |
| `data-target="0…3"` | Ausgangsform |
| `data-drift="0…3"` | Zielform, zwischen der langsam hin- und hergemorpht wird |
| `data-spin` | Rotationsgeschwindigkeit (Standard 0.16) |
| `data-tilt` | Neigung der Kamera (Standard 0.10) |

Die Scrolldistanz der Sequenz steuert `.stage { height: 380svh }` in Abschnitt 7 des
CSS. Bei `prefers-reduced-motion: reduce` rendert die Szene ein einziges statisches
Bild, die Sticky-Bühne wird zu einem normalen Textabschnitt, und alle Reveals sind
sofort sichtbar.

Performance: Ein `IntersectionObserver` pausiert jede Szene außerhalb des Viewports;
die Renderschleife läuft nur, solange mindestens ein Canvas sichtbar ist.

### Funnel-Engine

`assets/js/funnel.js` liest die Schritte deklarativ aus dem Markup:

```html
<form class="funnel" data-funnel="name" data-endpoint="">
  <div class="fstep is-active" data-name="feld" data-label="Beschriftung">
    <div class="opts">
      <button class="opt" data-value="Wert"><span>Text <small>Zusatz</small></span></button>
    </div>
  </div>
  <div class="fstep" data-name="…" data-multi>…</div>   <!-- Mehrfachauswahl -->
  <div class="fstep" data-final>…</div>                  <!-- Kontaktschritt -->
</form>
```

- Einfachauswahl springt nach 260 ms automatisch weiter (Commitment-Effekt)
- `data-multi` erlaubt Mehrfachauswahl und blendet einen „Weiter“-Button ein
- `data-optional` macht einen Auswahlschritt überspringbar
- `data-required` / `data-min` auf Feldern steuern die Validierung
- `[data-fm-summary]` rendert vor dem Absenden eine Zusammenfassung aller Antworten
- Honeypot-Feld `name="website"` blockt Bots
- UTM- und Klick-Parameter werden aus der URL in den `sessionStorage` übernommen und
  beim Absenden mitgeschickt

### Kurzcheck für Social Media (`beratung.html`)

Eine Frage je Bildschirm, am Ende ein echter Termin — gedacht für den Link in der
Instagram-Biografie und für Story-Sticker. Die Seite ist bewusst eigenständig und
benutzt die Funnel-Engine **nicht**: Sie hat eine andere Schale (Vollbild statt
Karte im Seitenfluss), spricht per „du" statt „Sie" und endet in der Terminbuchung
statt in einer Weiterleitung.

| Datei | Rolle |
|---|---|
| `beratung.html` | Fragen und Schritte, deklarativ im Markup |
| `assets/js/beratung.js` | Ablauf, Terminwahl, Absenden |
| `assets/css/beratung.css` | nur die Vollbild-Schale; setzt `site.css` voraus |

**Adressen** — `/beratung`, `/instagram` und `/insta` führen alle auf
`beratung.html` (Weiterleitungen in `netlify.toml`). Für die Auswertung an den Link
in der Biografie `?utm_source=instagram&utm_medium=bio` anhängen; `main.js` legt
die Parameter im `sessionStorage` ab und schickt sie beim Absenden als `kampagne`
mit ins CRM.

**Zwei Wege, je nachdem was der Kalender hergibt**

1. `/api/slots` liefert freie Zeiten → der Interessent wählt selbst, die Buchung
   läuft über `/api/booking`, der Termin steht sofort.
2. Kalender nicht eingerichtet, nicht erreichbar oder ohne freie Zeit → an der
   Stelle der Uhrzeiten wird nach der Erreichbarkeit gefragt und die Anfrage geht
   über `/api/lead` als Rückruf-Bitte ins CRM (`funnel: "instagram"`).

Der Kalender wird schon beim Laden der Seite abgefragt, nicht erst beim
Terminschritt — bis die fünf Fragen beantwortet sind, ist die Antwort längst da.
Wird ein Termin zwischen Anzeige und Klick von jemand anderem belegt, antwortet
`/api/booking` mit 409; die Seite springt dann mit frisch geholten Zeiten zurück
zur Auswahl und behält die eingegebenen Kontaktdaten.

**Die Antworten im CRM** — sie gehen als Liste `antworten: [{ feld, wert }]` an
`/api/booking` und stehen danach im Kalendereintrag unter „Angaben aus dem
Kurzcheck" sowie in der Close-Notiz unter `ANGABEN AUS DEM KURZCHECK`. Die Grenzen
setzt `lib/booking-core.js` (höchstens 20 Angaben, 80 Zeichen je Feldname, 300 je
Wert), nicht der Aufrufer.

**Messung** — die Seite leitet am Ende bewusst nicht auf `danke.html` um, weil ein
Seitenwechsel die gerade gebuchte Bestätigung wegnähme. Statt des Seitenaufrufs
meldet sie den Abschluss selbst in den `dataLayer`:

| Ereignis | wann |
|---|---|
| `kurzcheck_gestartet` | das Startbild ist weggeklickt |
| `kurzcheck_termin_gebucht` | Termin steht |
| `kurzcheck_lead_gesendet` | Rückruf-Anfrage ist raus |

Jedes Ereignis trägt `kurzcheck_modus` (`termin` oder `rueckruf`) und
`kurzcheck_rolle` mit. Im GTM daraus einen Trigger vom Typ „Benutzerdefiniertes
Ereignis" bauen, sonst zählt für diese Seite keine Conversion.

**Absichten, die man beim Ändern kennen sollte**

- `noindex, follow` im Kopf: Die Seite soll Verkehr aus Social Media annehmen,
  nicht in der Google-Suche mit den Zielgruppenseiten konkurrieren. In `robots.txt`
  steht sie deshalb absichtlich **nicht** — was nicht gelesen werden darf, kann
  auch das `noindex` nicht mitteilen.
- Höhenangaben in `svh`/`dvh` und `viewport-fit=cover`: Der In-App-Browser von
  Instagram blendet seine Leisten beim Scrollen ein und aus. Mit `100vh` stünde der
  Knopf darunter und wäre nicht erreichbar.
- Eingabefelder mit `font-size: 16px`: Darunter zoomt iOS beim Hineintippen.
- Die Fussleiste blendet nur ihren Knopf aus, nie sich selbst — in ihr stehen
  Impressum und Datenschutz, und die müssen von jeder Ansicht aus erreichbar sein.

### Design-System

`assets/css/site.css`, ein Datei-Stylesheet in 21 kommentierten Abschnitten.
Die Farbwerte sind direkt aus dem Logo abgeleitet:

| Token | Wert | Verwendung |
|---|---|---|
| `--navy-800` | `#0C2C4F` | Primärfarbe, Text, Ringhälfte links |
| `--navy-900` | `#071B32` | dunkle Sektionen |
| `--red-700` | `#751524` | Akzent, CTAs, Balken, Ringhälfte rechts |
| `--ivory` | `#F4F0EF` | Seitenhintergrund |

Dunkle Kontexte (`.section--dark`, `.hero--dark`, `.funnel-band`) erben gemeinsam
über `:is()` — eine neue dunkle Sektion braucht nur eine dieser Klassen.

---

## Anbindung an WeBuildWealth

Die Seite ist bewusst eigenständig gehalten, damit sie unter eigener Domain laufen
kann. Für die Verknüpfung mit `webuildwealth.de` bieten sich an:

1. **Footer-Verweis** — bereits vorhanden: „Ein Angebot aus der WeBuildWealth-Gruppe“.
   Dort einen Link auf die Hauptseite ergänzen.
2. **Gemeinsame Rechtsseiten** — falls dieselbe juristische Person dahintersteht,
   können `impressum.html` und `datenschutz.html` auf die bestehenden Seiten von
   webuildwealth.de verweisen statt eigene zu führen.
3. **Gemeinsames CRM** — alle Funnels senden an denselben Endpunkt und lassen sich
   über das Feld `funnel` auseinanderhalten; gebuchte Termine über `segment`.
4. **Unterverzeichnis statt Subdomain** — SEO-seitig stärker wäre
   `webuildwealth.de/finanz-medizin/`; dann alle absoluten Pfade in `canonical`,
   `og:url` und `sitemap.xml` anpassen.

---

## Deployment auf Netlify

Die Konfiguration liegt vollständig in `netlify.toml` — kein Build-Schritt, kein
`package.json`, nichts zu installieren.

### Einrichtung

1. In Netlify **Add new site → Import an existing project** und dieses Repository
   verbinden. Branch: der Branch, auf dem die Seite liegt.
2. Build command leer lassen, Publish directory `.` — beides steht schon in
   `netlify.toml` und wird übernommen.
3. Unter **Domain management** `finanz-medizin.com` hinzufügen und
   `www.finanz-medizin.com` als **Primary domain** setzen. Netlify legt die
   Weiterleitung von der Apex-Domain automatisch an; die `canonical`-Tags im
   Markup zeigen bereits auf die `www`-Variante.
4. **HTTPS** wird über Let's Encrypt automatisch bereitgestellt. Danach unter
   Domain management **Force HTTPS** aktivieren.

### Was `netlify.toml` mitbringt

- **Sicherheits-Header** für alle Seiten: HSTS, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` und eine
  Content-Security-Policy.
- **Post-Processing aus** (`skip_processing = true`). Das ist Absicht: Netlifys
  „Pretty URLs" würden `/seite.html` auf `/seite` umleiten, während die
  `canonical`-Tags auf die `.html`-Variante zeigen — das gäbe widersprüchliche
  SEO-Signale. Außerdem soll die Asset-Optimierung CSS und JS nicht umformen.
- **Caching** passend zur Tatsache, dass die Dateinamen keinen Content-Hash tragen:
  CSS und JS werden per ETag revalidiert (Reload kostet nur ein 304, nach einem
  Deploy ist garantiert die neue Fassung aktiv), Bilder 30 Tage.
- **Kurz-URLs** für Anzeigen und Visitenkarten: `/praxisinhaber`, `/aerzte`, `/mfa`,
  `/impressum`, `/datenschutz` leiten per 301 auf die jeweilige Seite.
- **`404.html`** wird von Netlify automatisch als Fehlerseite ausgeliefert.

### Wichtig, sobald der Funnel-Endpunkt steht

Die CSP erlaubt aktuell nur `connect-src 'self'`. Ein externer Endpunkt wird vom
Browser sonst blockiert — die Ziel-Domain muss in `netlify.toml` bei `connect-src`
ergänzt werden. Im Abschnitt steht ein entsprechender Hinweis.

**Naheliegende Option:** Netlify bringt mit *Netlify Forms* eine eigene
Formularverarbeitung mit, inklusive Spamschutz und E-Mail-Benachrichtigung — ohne
Backend und ohne zusätzlichen Auftragsverarbeiter. Das würde den Endpunkt erledigen
und läge datenschutzrechtlich beim ohnehin bereits beauftragten Anbieter.

## Lokal ansehen

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Die Kurz-URLs aus `netlify.toml` greifen lokal nicht — dort direkt die
`.html`-Dateien aufrufen.

---

## Inhaltliche Grundlage

Alle Zahlen stammen aus dem Praxis-One-Pager „Finanz-Medizin · Konzept für Arztpraxen“
(Stand August 2026, Rechengrößen 2026). Die vollständigen Quellen und Rechenwege sind
auf `praxisinhaber.html#rechenwege` veröffentlicht — bewusst nachprüfbar, damit
Steuerberaterinnen und Steuerberater jede Zeile nachvollziehen können.

Ändern sich Rechengrößen (etwa zum 01.01.2027 durch das 2. Betriebsrentenstärkungs-
gesetz), sind folgende Stellen anzupassen: die Hebel-Liste und beide Tabellen auf
`praxisinhaber.html`, die Karte „Extra-Förderung bei Teilzeit“ auf
`mfa-praxisteam.html` sowie die Kennzahlen auf `index.html`.
