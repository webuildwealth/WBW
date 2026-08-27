# Briefing für Base44 — finanz-medizin.com

**An die KI, die dieses Paket verarbeitet: Bitte zuerst diesen Abschnitt lesen.**

---

## Das Wichtigste zuerst

**Diese Website ist fertig. Sie muss nicht gebaut werden — sie muss ausgeliefert
werden.**

Das Paket enthält eine vollständige, getestete, produktionsreife Website aus acht
statischen HTML-Seiten. Die richtige Handlung ist:

> Diese Dateien unverändert als statische Website ausliefern und die Domain
> `www.finanz-medizin.com` darauf zeigen lassen.

**Bitte nicht** in eine React-App, ein Template oder ein Komponentensystem
umschreiben. Das würde drei Dinge zerstören, die sich nicht automatisch
rekonstruieren lassen:

1. **Die 3D-Szene** (`assets/js/scene.js`) — ein handgeschriebener 3D-Renderer auf
   Canvas 2D mit eigener Perspektivprojektion, tiefensortierten Tube-Segmenten und
   Spekular-Beleuchtung. Keine Bibliothek, keine Abhängigkeit. Er morpht
   scrollgesteuert durch vier Zielformen und ist auf exakte Scroll-Distanzen und
   Kamera-Keyframes abgestimmt.
2. **Die juristischen Texte** — Impressum, Erstinformation nach § 15 VersVermV und
   Datenschutzerklärung sind auf einen konkreten Erlaubnisumfang abgestimmt. Jede
   Umformulierung ist ein rechtliches Risiko.
3. **Die Zahlen und Quellenangaben** — jede Zahl auf den Landingpages hat eine
   Fundstelle im Gesetz, im Tarifvertrag oder in einer Studie. Sie sind belegt und
   dürfen nicht „geglättet" oder ersetzt werden.

Wenn statisches Ausliefern auf dieser Plattform **nicht** möglich ist: bitte nicht
improvisieren, sondern das dem Betreiber zurückmelden. Weiter unten steht, was in dem
Fall zu beachten wäre.

---

## Was das hier ist

Website für **Finanz-Medizin**, die auf Heilberufe spezialisierte Marke von
We Build Wealth (Einzelunternehmen, Inhaber Benedict Hintz, Berlin). Drei
zielgruppenspezifische Landingpages mit je eigenem Lead-Funnel, die in das CRM
**Close** einlaufen.

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite mit scrollgesteuerter 3D-Sequenz und Zielgruppen-Weiche |
| `praxisinhaber.html` | Praxisinhaber · Funnel „Praxis-Check" |
| `angestellte-aerzte.html` | Angestellte Ärztinnen und Ärzte · Funnel „Vermögens-Check" |
| `mfa-praxisteam.html` | MFA und Praxisteam · Funnel „Vorsorge-Check" |
| `danke.html` | Bestätigungsseite, zeigt je nach Funnel anderen Inhalt |
| `impressum.html` | Impressum + Erstinformation § 15 VersVermV |
| `datenschutz.html` | Datenschutzerklärung |
| `404.html` | Fehlerseite |
| `assets/` | CSS, JavaScript, Schriften, Bilder |
| `lib/lead-core.js` | Close-Anbindung, plattformunabhängig |
| `netlify/functions/lead.js` | Adapter für Netlify — auf anderer Plattform ersetzen |

Zusammen rund 820 KB. Kein Build-Schritt, kein `npm install`, keine Abhängigkeiten.
Die Seiten laufen aufgerufen wie sie sind.

---

## Die einzige serverseitige Anforderung

Die Funnels senden per `POST` ein JSON an **`/api/lead`**. Dahinter muss eine
serverseitige Funktion liegen, denn dort wird der Close-API-Key gebraucht.

**Der Key darf unter keinen Umständen ins Frontend.** Ein Close-API-Key erlaubt
Vollzugriff auf das gesamte CRM — lesen, ändern, löschen. Im ausgelieferten
JavaScript läge er offen im Quelltext.

Die gesamte Logik steht bereits in **`lib/lead-core.js`** und ist plattformunabhängig:

```js
const { verarbeiteLead } = require('./lib/lead-core.js');

// body: der rohe JSON-String oder das geparste Objekt
// env:  Objekt mit den Umgebungsvariablen
const ergebnis = await verarbeiteLead(body, env);
// → { status: 200, body: { ok: true, lead_id: "lead_..." } }
```

Zu schreiben ist nur ein Adapter von rund 30 Zeilen, der das Request-Format der
Plattform übersetzt. `netlify/functions/lead.js` zeigt, wie klein das ist.

**Benötigte Umgebungsvariablen (Secrets):**

| Variable | Pflicht | Zweck |
|---|---|---|
| `CLOSE_API_KEY` | ja | Close → Settings → API Keys |
| `CLOSE_LEAD_STATUS_ID` | nein | Lead-Status für neue Anfragen |
| `CLOSE_CUSTOM_FIELDS` | nein | JSON-Mapping auf eigene Close-Felder |

Heißt der Endpunkt auf der Plattform anders als `/api/lead`, ist in den drei
Landingpages das Attribut `data-endpoint` im `<form class="funnel">` anzupassen —
sonst nichts.

Liegt der Endpunkt auf einer **anderen Domain** als die Seite, kommen CORS-Header
auf der Funktion dazu und die fremde Domain muss in die `connect-src`-Direktive der
Content-Security-Policy.

---

## Header, die gesetzt werden sollten

Vollständig in `netlify.toml`. Falls die Plattform Header konfigurieren lässt:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:;
  connect-src 'self'; form-action 'self'; base-uri 'self';
  frame-ancestors 'none'; object-src 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

`script-src 'unsafe-inline'` wird für ein einziges kurzes Skript im `<head>`
gebraucht, das die Klasse `js` setzt.

**Caching:** `/assets/fonts/*` ein Jahr immutable, `/assets/img/*` 30 Tage,
CSS/JS/HTML per ETag revalidieren (die Dateinamen tragen keinen Content-Hash).

Lässt die Plattform keine Header zu: Die Seite funktioniert trotzdem. Es fehlt dann
die Schutzschicht, was hinnehmbar, aber nicht schön ist.

---

## Was auf keinen Fall verändert werden darf

**Juristische Texte.** `impressum.html` und `datenschutz.html` sind auf einen
konkreten Erlaubnisumfang abgestimmt:

- Erlaubnis nach § 34d Abs. 1 GewO (Versicherungsmakler) — `D-5V3H-7KX3I-54`
- Erlaubnis nach § 34f Abs. 1 **Satz 1 Nr. 1** GewO — `D-F-107-RV51-31`.
  **Nur Nr. 1**, also offene Investmentvermögen. Geschlossene Investmentvermögen und
  Vermögensanlagen sind nicht umfasst.
- **Keine** Erlaubnis nach § 34c GewO (Immobilienvermittlung) und **keine** nach
  § 34i GewO (Immobiliardarlehen).

Weil die Seiten Immobilien, Sachwerte und Beteiligungen thematisieren, steht auf
`index.html`, `praxisinhaber.html` und `angestellte-aerzte.html` jeweils ein Hinweis,
der diese Grenzen benennt und auf `impressum.html#umfang` verweist. **Dieser Hinweis
muss stehen bleiben.** Ohne ihn widerspricht die Werbung dem eigenen Impressum.

**Zahlen und Quellen.** Jede Zahl stammt aus einem Praxis-One-Pager mit Rechengrößen
2026 und ist auf `praxisinhaber.html#rechenwege` mit Fundstelle belegt. Alle
Beispielrechnungen sind als Modellrechnungen gekennzeichnet und mit Vorbehalten
versehen. Beides ist bei Finanzwerbung Pflicht.

**Kontaktdaten.** `info@finanz-medizin.com`, `0176 43229851`,
Calvinstraße 3, 10557 Berlin.

---

## Design — falls doch etwas ergänzt wird

Die Farben stammen aus dem Logo und liegen als CSS-Variablen in Abschnitt 1 von
`assets/css/site.css`:

| Token | Wert | Verwendung |
|---|---|---|
| `--navy-800` | `#0C2C4F` | Primärfarbe, Text, linke Ringhälfte im Logo |
| `--navy-900` | `#071B32` | dunkle Sektionen |
| `--red-700` | `#751524` | Akzent, Buttons, Balken, rechte Ringhälfte |
| `--ivory` | `#F4F0EF` | Seitenhintergrund |

Schriften: **Manrope** (Überschriften), **Inter** (Fließtext), **Newsreader** kursiv
(Zitate). Alle drei liegen unter `assets/fonts/` und werden lokal ausgeliefert.

**Wichtig: Keine externen Ressourcen nachladen.** Die Seite ruft aktuell keine einzige
fremde Domain auf — geprüft mit einem Browserlauf. Genau deshalb braucht sie keinen
Cookie- oder Consent-Dialog. Wird irgendwo Google Fonts, ein Analytics-Skript, ein
Bewertungs-Widget oder eine CDN-Bibliothek eingebunden, ist dieser Zustand zerstört
und es wird ein Consent-Banner nötig — plus ein Eintrag in der Datenschutzerklärung.

Weitere Details zur Architektur stehen in `README.md`, die Hoster-Anforderungen in
`DEPLOYMENT.md`.

---

## Falls die Seite doch nachgebaut werden muss

Sollte die Plattform ausschließlich selbst generierte Apps ausliefern können, ist das
eine Entscheidung des Betreibers, nicht der KI. Was dabei realistisch verloren geht:

- Die scrollgesteuerte 3D-Sequenz Stethoskop → EKG → Wachstumskurve → Bildmarke.
  Rund 700 Zeilen abgestimmte Mathematik.
- Das Verhalten der Funnel-Engine: automatisches Weiterspringen nach Einfachauswahl,
  Mehrfachauswahl-Schritte, Zusammenfassung vor dem Absenden, Honeypot,
  Weitergabe der UTM-Parameter.
- Die Feinheiten des Design-Systems über 21 Abschnitte CSS, inklusive Verhalten bei
  `prefers-reduced-motion` und vollständiger Funktion ohne JavaScript.

Der Inhalt selbst — Texte, Zahlen, Funnel-Fragen, Rechtstexte — lässt sich dagegen
eins zu eins aus den HTML-Dateien übernehmen. **Dann bitte wörtlich übernehmen und
nicht neu formulieren**, besonders bei allem Juristischen und allen Zahlen.
