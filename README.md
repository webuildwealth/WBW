# finanz-medizin.com

Statische Website mit drei zielgruppenspezifischen Landingpages und Lead-Funnels für
**Finanz-Medizin** — die auf Heilberufe spezialisierte Finanz- und Versicherungsberatung
der WeBuildWealth-Gruppe.

Kein Build-Schritt, keine Abhängigkeiten, kein Framework. Ordner hochladen, fertig.

---

## Seitenstruktur

| Datei | Zweck | Funnel |
|---|---|---|
| `index.html` | Hub mit 3D-Scroll-Sequenz und Zielgruppen-Weiche | — |
| `praxisinhaber.html` | Praxisinhaberinnen und Praxisinhaber | Praxis-Check |
| `angestellte-aerzte.html` | Angestellte Ärztinnen und Ärzte | Vermögens-Check |
| `mfa-praxisteam.html` | MFA und Praxisteam | Vorsorge-Check |
| `danke.html` | Bestätigungsseite, segmentspezifisch | — |
| `impressum.html` | Impressum + Erstinformation § 15 VersVermV | — |
| `datenschutz.html` | Datenschutzerklärung (DSGVO) | — |

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

### 1. Rechtsangaben vervollständigen

`impressum.html` und `datenschutz.html` enthalten gelb markierte Platzhalter
(`<mark class="todo">`) plus je einen Hinweiskasten (`.todo-note`). Zu ergänzen sind
insbesondere:

- Firmierung, Rechtsform, Geschäftsführung, Registergericht, HRB, USt-IdNr., Telefon
- zuständige IHK als Erlaubnis- und Aufsichtsbehörde
- Hosting-Anbieter und Auftragsverarbeiter des Formular-Endpunkts
- ggf. Datenschutzbeauftragter

Anschrift (Calvinstraße 3, 10557 Berlin) sowie die Registernummern nach § 34d GewO
(`D-5V3H-7KX3I-54`) und § 34f GewO (`D-F-107-RV51-31`) stammen aus dem
Praxis-One-Pager und sollten gegengeprüft werden.

Nach dem Ausfüllen: Hinweiskästen entfernen und im CSS Abschnitt 21 (`.todo`,
`.todo-note`) löschen.

### 2. Schriften lokal ausliefern (DSGVO)

Aktuell werden Manrope, Inter und Newsreader über Google Fonts geladen. Für einen
deutschen Webauftritt ohne Consent-Dialog sollten die Schriften selbst gehostet werden:

1. Schriften bei [gwfh.mranftl.com](https://gwfh.mranftl.com) oder direkt von
   Google Fonts als WOFF2 herunterladen und unter `assets/fonts/` ablegen.
2. In allen HTML-Dateien die drei `<link>`-Zeilen zu `fonts.googleapis.com` /
   `fonts.gstatic.com` entfernen.
3. `@font-face`-Regeln oben in `assets/css/site.css` einfügen (`font-display: swap`).
4. In `datenschutz.html` Abschnitt 8 die Variante B löschen.

Die CSS-Variablen enthalten vollständige System-Font-Fallbacks — die Seite bleibt
auch ohne Webfonts korrekt gesetzt.

### 3. Funnel-Endpunkt konfigurieren

Ohne Endpunkt leiten die Formulare nur auf `danke.html` weiter; **es wird nichts
versendet.** Für den Produktivbetrieb in der jeweiligen Landingpage setzen:

```html
<form class="funnel" data-funnel="praxisinhaber" data-endpoint="https://…">
```

Der Endpunkt erhält einen `POST` mit `Content-Type: application/json`. Beispiel-Payload:

```json
{
  "funnel": "praxisinhaber",
  "praxisform": "Einzelpraxis",
  "teamgroesse": "4–8 Mitarbeitende",
  "prioritaet": "Team halten und gewinnen, Steuerlast senken",
  "betrieblich": "Nein, bisher nichts",
  "vorname": "Anna", "nachname": "Berger",
  "praxis": "Hausarztpraxis Berger",
  "email": "…", "telefon": "…",
  "erreichbarkeit": "Nachmittags (14 – 18 Uhr)",
  "einwilligung": "ja",
  "kampagne": "{\"utm_source\":\"google\"}",
  "seite": "/praxisinhaber.html",
  "verweis": "https://www.google.com/",
  "dauer_sek": 74,
  "zeitpunkt": "2026-08-26T10:12:33.000Z"
}
```

Ein HTTP-2xx gilt als Erfolg und löst die Weiterleitung aus; alles andere zeigt eine
Fehlermeldung mit der E-Mail-Adresse als Rückfallweg an. Geeignet sind Formspree,
Make/Zapier-Webhooks, HubSpot-Forms oder ein eigener Endpunkt.

**Datenschutz beachten:** Sobald ein externer Dienst eingebunden ist, muss er in
`datenschutz.html` Abschnitt 4 als Auftragsverarbeiter benannt werden.

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
3. **Gemeinsames CRM** — alle drei Funnels senden an denselben Endpunkt und lassen
   sich über das Feld `funnel` auseinanderhalten.
4. **Unterverzeichnis statt Subdomain** — SEO-seitig stärker wäre
   `webuildwealth.de/finanz-medizin/`; dann alle absoluten Pfade in `canonical`,
   `og:url` und `sitemap.xml` anpassen.

---

## Lokal ansehen

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Reine Statik — jedes Hosting mit Dateiauslieferung genügt (Netlify, Vercel, Cloudflare
Pages, klassisches Webhosting). Empfohlen: HTTPS erzwingen, `www` als kanonische
Variante festlegen und langfristiges Caching für `/assets/` setzen.

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
