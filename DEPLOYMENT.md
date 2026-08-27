# Deployment — was die Seite von einem Hoster braucht

Diese Seite ist bewusst anspruchslos gebaut: acht statische HTML-Dateien, ein
Stylesheet, drei JavaScript-Dateien, Bilder und Schriften. Kein Build-Schritt, kein
Framework, keine Datenbank. Genau **eine** Sache braucht einen Server: der
Funnel-Endpunkt, weil dort der Close-API-Key liegt.

---

## Die Anforderungsliste

Anhand dieser sechs Punkte lässt sich jeder Hoster prüfen.

| # | Anforderung | Wozu | Ohne das … |
|---|---|---|---|
| 1 | **Statische Dateien ausliefern** — eigene `.html`, `.css`, `.js`, `.woff2`, `.svg`, `.png`, `.jpg` hochladen oder aus einem Git-Repo deployen | Die Seite selbst | geht gar nichts |
| 2 | **Eigene Domain** mit HTTPS | `www.finanz-medizin.com` | Seite läuft nur unter einer Fremd-Subdomain |
| 3 | **Serverseitige Funktion**, die einen `POST` mit JSON annimmt und eine Umgebungsvariable lesen kann | Close-Anbindung; der API-Key darf niemals ins Frontend | Funnel sammelt keine Leads |
| 4 | **Response-Header frei setzen** (CSP, HSTS, `X-Frame-Options`, Cache-Control) | Sicherheit und Caching | funktioniert, aber ohne Schutzschicht |
| 5 | **Eigene 404-Seite** | `404.html` im Seitendesign | Standard-Fehlerseite des Hosters |
| 6 | **Weiterleitungen** (301) | Kurz-URLs `/praxisinhaber`, `/mfa` für Anzeigen | Kurz-URLs entfallen, Seite läuft normal weiter |

**Unverzichtbar sind 1, 2 und 3.** Die Punkte 4 bis 6 sind wünschenswert; fällt einer
weg, funktioniert die Seite trotzdem — man verliert Schutzschicht beziehungsweise
Komfort.

---

## Was bei einem Hosterwechsel anzupassen ist

Der Aufwand ist klein, weil die Fachlogik nicht am Hoster hängt:

| Datei | Änderung |
|---|---|
| `lib/lead-core.js` | **keine.** Enthält die gesamte Close-Logik, kennt keine Plattform |
| `netlify/functions/lead.js` | wird durch einen gleich kurzen Adapter der neuen Plattform ersetzt (rund 30 Zeilen: Request entgegennehmen, `verarbeiteLead(body, env)` aufrufen, Antwort zurückgeben) |
| `netlify.toml` | wird durch das Konfigurationsformat der neuen Plattform ersetzt — Header, Caching, Weiterleitungen |
| Die drei Landingpages | nur falls der Endpunkt nicht mehr `/api/lead` heißt: `data-endpoint` im `<form>` anpassen |
| `datenschutz.html` Abschnitt 3 | neuen Hoster als Auftragsverarbeiter eintragen |

Liegt der Endpunkt auf einer **anderen Domain** als die Seite, kommen zwei Dinge dazu:
CORS-Header auf der Funktion und die fremde Domain in der `connect-src`-Direktive der
CSP. Auf derselben Domain entfällt beides.

---

## Base44 prüfen

Base44 ist ein KI-App-Baukasten: Anwendungen entstehen dort im Editor als React-App
mit eigenem Backend. Diese Seite ist dagegen handgeschriebenes HTML mit einem eigenen
3D-Canvas-Renderer. Ob beides zusammenpasst, entscheidet sich an Anforderung 1.

Im Base44-Konto nach folgenden Begriffen suchen:

**Für Anforderung 1 — statische Dateien**
- „Static hosting", „Upload files", „Custom code", „Import HTML", „GitHub"
- Gibt es eine Möglichkeit, fertige Dateien hochzuladen oder ein Repository zu
  verbinden? Oder entsteht jede App zwingend im Editor?

**Für Anforderung 2 — Domain**
- „Custom domain", „Domains" in den App-Einstellungen
- Ist das im gebuchten Abo enthalten?

**Für Anforderung 3 — Backend**
- „Backend functions", „Functions", „Secrets", „Environment variables"
- Falls ja: Welche Signatur hat so eine Funktion? Bekommt sie ein `Request`-Objekt?
  Wie werden Secrets gelesen?

**Für Anforderung 4 — Header**
- „Headers", „Security", „CSP" — häufig nicht konfigurierbar. Das wäre verschmerzbar.

Mit diesen Antworten ist der Umbau eine überschaubare Sache.

### Wenn Base44 nur Apps aus dem Editor kann

Dann stehen zwei Wege offen:

1. **Seite bleibt, wo sie ist, Base44 für anderes.** Beide Angebote können
   nebeneinander laufen — die WBW-Seite auf Base44, Finanz-Medizin als statische
   Seite. Verlinkt sind sie ohnehin über den Footer.
2. **Neubau in Base44.** Ehrlich gesagt teuer: Die scrollgesteuerte 3D-Sequenz, die
   Funnel-Engine und das Design-System sind rund 3.000 Zeilen handgeschriebener Code.
   In einem Editor-Baukasten müsste das nachgebaut werden, und die 3D-Szene ließe sich
   dort vermutlich nicht eins zu eins abbilden.

### Zur Kostenfrage

Falls der Wechsel Geld sparen soll: Netlifys kostenlose Stufe deckt diese Seite
vollständig ab. Eine statische Seite dieser Größe und ein Funnel, der pro Absendung
zwei API-Aufrufe macht, bleiben deutlich unter allen Grenzen des Gratis-Tarifs. Ein
Wechsel spart hier also nichts — er lohnt nur, wenn Sie ohnehin alles an einem Ort
haben wollen.

---

## Aktueller Stand: Netlify

Die vollständige Netlify-Konfiguration steht in `netlify.toml`, die Einrichtung ist
im [README](README.md) beschrieben. Kurz:

- `[build] publish = "."`, `functions = "netlify/functions"`, kein Build-Command
- Post-Processing aus, damit „Pretty URLs" nicht mit den `canonical`-Tags kollidieren
- Sicherheits-Header und Caching pro Verzeichnis
- `/api/lead` als Rewrite (Status 200, **nicht** 301 — ein Redirect verlöre den
  POST-Body)
- Umgebungsvariable `CLOSE_API_KEY` setzen, danach einmal neu deployen
