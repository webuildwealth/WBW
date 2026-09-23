# MFA-Lead-Sourcing-Pipeline — Analyse, Architektur und Review

**Status:** Planungsdokument (Phase 1–19), Stand 2026-08-31. Der Plan ist inzwischen teilweise
umgesetzt und die BA-API hat sich geändert — **§ 16 (Nachtrag zum Livegang) korrigiert, was in
den Abschnitten 1–15 überholt ist.** Bei Widersprüchen gilt § 16.
**Datum:** 2026-08-31, Nachtrag 2026-09-05
**Review-Ergebnis:** Runde 1 `CHANGES_REQUIRED` → Plan V2 → Runde 2 `APPROVED (mit 4 Auflagen)`

---

## 0. Zusammenfassung in zehn Zeilen

Ziel ist eine Liste deutscher Praxen, MVZ und Kliniken, die **aktuell MFA suchen**, angereichert
bis zum Entscheider. Die Analyse hat drei Ergebnisse, die den ursprünglich skizzierten Aufbau
deutlich vereinfachen:

1. Die BA-Jobdetails liefern **Website, vollständige Arbeitgeberadresse, Branche, Betriebsgröße
   und eine stabile Arbeitgeber-ID** frei Haus. Ein großer Teil des Enrichments ist damit
   First-Party und kostenlos — Overture und Suchmaschinen werden von der Hauptquelle zum Fallback.
2. Das Feld `beruf` ist eine **normalisierte** BA-Berufsbezeichnung (nicht der Anzeigentitel).
   Damit wird die Relevanzfilterung deterministisch statt Freitext-Raterei.
3. Der eigentliche Engpass ist nicht die Technik, sondern **§ 7 UWG**: Kalt-E-Mail an Praxen ohne
   vorherige Einwilligung ist unzulässig, auch B2B. Die Pipeline ist zulässig, die naheliegende
   Verwendung ihres Outputs wäre es nicht. Das ist im Plan gelöst, muss aber bewusst entschieden
   werden.

---

## 1. CURRENT REPOSITORY

### 1.1 Zwei getrennte Dinge

Das Repository `webuildwealth/WBW` und die hochgeladene ZIP sind **nicht dasselbe Projekt**:

| | `webuildwealth/WBW` (Arbeitsverzeichnis) | `jobsuche-api-main` (ZIP) |
|---|---|---|
| Inhalt | Statische Website `finanz-medizin.com` | OpenAPI-Spezifikation der BA-Jobsuche |
| Technik | HTML/CSS/Vanilla-JS, Netlify Functions (Node) | YAML-Spec + generierter Python-Client |
| Bezug zur Pipeline | Zielsystem für die Leads (Close CRM) | Datenquelle |

Es existiert **keine bestehende BA-API-Integration im Repository**. Die ZIP enthält die
Spezifikation und Beispielskripte des Community-Projekts `bundesAPI/jobsuche-api`, nicht
laufenden Integrationscode. Der Auftrag beginnt hier also näher bei null, als die Formulierung
„enthält bereits eine Anbindung" vermuten lässt — was die Freiheitsgrade erhöht.

### 1.2 Was im Repo existiert

```
index.html, praxisinhaber.html, angestellte-aerzte.html,   # 3 Landingpages + Hub
mfa-praxisteam.html, ueber-uns.html, danke.html,
impressum.html, datenschutz.html, 404.html
assets/js/{scene,funnel,calc,booking,rail,main}.js         # handgeschrieben, kein Build
lib/{lead-core,close,booking-core}.js                      # Lead-Logik, hosterunabhängig
netlify/functions/{lead,booking,slots}.js                  # dünne Adapter
netlify.toml                                               # publish = "."
```

Relevante Beobachtungen:

- **`lib/lead-core.js` + `lib/close.js`**: Es existiert bereits eine saubere, hosterunabhängige
  Anbindung an **Close CRM** (`legeLeadAn`, `baueLead`). Die Pipeline hat damit einen fertigen
  Zielkanal — Leads müssen nicht nur als CSV enden, sie können in dasselbe CRM laufen, in dem
  die Funnel-Leads landen. Die Trennung „Kern ohne Plattformwissen + dünner Adapter" ist die
  Konvention des Repos und wird von der Pipeline übernommen.
- **Kein Build, keine Dependencies, kein Test-Setup, kein Logging-Framework, keine Datenbank.**
  Es gibt nichts, worauf die Pipeline aufsetzen könnte, und nichts, was sie stören dürfte.
- **`BASE44-BRIEF.md`** dokumentiert ausdrücklich: Die Website ist fertig und darf nicht
  umgebaut werden. Die Pipeline muss daher strikt additiv und isoliert bleiben.
- **Geschäftlicher Kontext** (aus `README.md`, `praxisinhaber.html`): Finanz-Medizin verkauft an
  **Praxisinhaber** — u. a. mit dem Argument Fluktuationskosten und Mitarbeiterbindung. Eine
  Praxis mit offener MFA-Stelle hat genau dieses Problem *jetzt*. Der Lead-Ansatz ist also
  fachlich stimmig; die offene Stelle ist der Aufhänger und zugleich (siehe § 12) das
  entscheidende juristische Argument für den Sachbezug.

### 1.3 Befund mit Sofortrelevanz: `publish = "."`

`netlify.toml` Zeile 7 veröffentlicht das **Repository-Wurzelverzeichnis** als Website. Ein
Verzeichnis `pipeline/` mit Datenbank oder CSV-Exporten wäre bei einem CLI-Deploy aus dem
Arbeitsverzeichnis unter `finanz-medizin.com/pipeline/...` **öffentlich abrufbar** — inklusive
personenbezogener Entscheiderdaten. Siehe Risiko R-2 und die Auflage A-2.

---

## 2. Die BA-API — was sie wirklich hergibt

### 2.1 Zugang

- Basis: `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service`
- Auth: Header `X-API-Key: jobboerse-jobsuche` — eine feste Client-ID aus der Mobile-App,
  **kein persönlicher Schlüssel, keine Registrierung, keine Kosten**.
- Es handelt sich um eine **inoffizielle, reverse-engineerte Schnittstelle**. Es gibt keine
  offizielle BA-API für die Jobsuche und damit auch keine Nutzungsbedingungen, die die Nutzung
  ausdrücklich gestatten. Siehe Risiko R-1.

> **Hinweis zur Verifikation:** In dieser Session ist `rest.arbeitsagentur.de` durch die
> Egress-Policy blockiert (403 auf CONNECT). Alle Aussagen unten stammen aus der Spezifikation,
> den Beispielskripten und öffentlicher Dokumentation, **nicht aus einem Live-Aufruf**. Der
> erste reale Lauf ist deshalb als Kalibrierungslauf geplant (Auflage A-1).

### 2.2 Endpunkte

| Endpunkt | Zweck | Kosten |
|---|---|---|
| `GET /pc/v6/jobs` bzw. `/pc/v4/app/jobs` | Suche, liefert Trefferliste + **Facetten** | frei |
| `GET /pc/v4/jobdetails/{base64(refnr)}` | Volldetails je Anzeige | frei |
| `GET /ct/v1/arbeitgeberlogo/{hash}` | Arbeitgeberlogo, 404 = normal | frei |

### 2.3 Suchparameter (relevant für uns)

`was`, `wo`, `umkreis`, `berufsfeld`, `arbeitgeber`, `page`, `size`, `veroeffentlichtseit` (0–100
Tage), `angebotsart` (1=ARBEIT), `befristung`, `arbeitszeit` (vz/tz/snw/ho/mj), `zeitarbeit`
(bool), `pav` (bool), `behinderung`, `corona`.

Für uns entscheidend:

- **`angebotsart=1`** — nur echte Arbeitsstellen, schließt Ausbildung (4) und Praktikum (34) aus.
  Ausbildungsstellen sind für den Vertrieb ein *anderer* Case; als Option konfigurierbar.
- **`zeitarbeit=false` und `pav=false`** — schließt Zeitarbeitsfirmen und private
  Arbeitsvermittler aus. Das ist nicht nur ein Relevanz-, sondern ein **Company-Resolution-Filter**:
  Bei diesen Anzeigen ist der Inserent nicht die Praxis, der Lead wäre also strukturell falsch.
- **`veroeffentlichtseit`** — der Hebel für inkrementelle Läufe (siehe § 9).
- **`facetten`** in der Antwort — liefert die Verteilung über `beruf`, `branche`, `arbeitgeber`,
  `arbeitsort_plz` usw. **Damit kalibriert sich die Filterliste aus echten Daten selbst**,
  statt geraten zu werden. Das ist die Antwort auf „Filterlogik aus der tatsächlichen
  Datenstruktur ableiten".

### 2.4 Der eigentliche Fund: die Jobdetails

`JobDetails` enthält weit mehr als einen Anzeigentext:

| Feld | Bedeutung für den Lead |
|---|---|
| `arbeitgeber` | Firmenname wie inseriert |
| ~~`arbeitgeberHashId`~~ | in `/pc/v6/jobs` nicht mehr vorhanden — siehe § 16.1 |
| **`arbeitgeberKundennummerHash`** | **stabile Arbeitgeber-Identität, seit v6 der Dedup-Schlüssel; nicht in jeder Anzeige gesetzt** |
| **`arbeitgeberAdresse`** | `strasse`, `strasseHausnummer`, `plz`, `ort`, `region`, `land` |
| **`arbeitgeberdarstellungUrl`** | **die Website des Arbeitgebers — direkt von der BA** |
| `arbeitgeberdarstellung` | Selbstdarstellung, enthält oft Kontaktangaben |
| `branche`, `branchengruppe` | `industry` ohne externe Quelle |
| **`betriebsgroesse`** | `employee_count` ohne externe Quelle |
| `arbeitsorte[]` | je Standort Adresse **und `koordinaten.lat/lon`** |
| `stellenangebotsBeschreibung` | enthält sehr häufig **„Ansprechpartner", Telefon, E-Mail** |
| `anzahlOffeneStellen` | Anzahl Stellen pro Anzeige → Scoring |
| `hauptDkz` | BA-Berufscode → deterministische Filterung |
| `arbeitszeitmodelle`, `befristung`, `eintrittsdatum`, `verguetung` | Job-Attribute |
| `anzeigeAnonym` | Arbeitgeber anonymisiert → Lead unbrauchbar, muss raus |
| `externeUrl` | externe Anzeigen-URL |

**Konsequenz für die Architektur:** Firmenname, Adresse, Geokoordinaten, Branche,
Mitarbeiterzahl, Website und häufig sogar Telefon/Ansprechpartner kommen aus **einer einzigen
kostenlosen First-Party-Quelle**. Overture, Suchmaschinen und Website-Crawling sind nur noch
für die Lücken zuständig. Das senkt Kosten, Rechtsrisiko und Fehlerquote gleichzeitig.

### 2.5 Deterministische Relevanzfilterung statt Freitextsuche

`beruf` ist **nicht** der Anzeigentitel, sondern die von der BA zugeordnete, normalisierte
Berufsbezeichnung. Zusätzlich gibt `hauptDkz` den Berufscode. Recherchierte Anker:

- `dkz=33212` → **Medizinische/r Fachangestellte/r** (BERUFENET-Steckbrief)
- `dkz=14704` → Zahnmedizinische/r Fachangestellte/r (Abgrenzung; optional als eigenes Segment)

Daraus folgt eine dreistufige Filterung:

1. **Recall (Discovery):** breit über eine Synonymliste im `was`-Parameter suchen —
   *Medizinische Fachangestellte, MFA, Arzthelfer, Arzthelferin, Praxisassistenz,
   Medizinische Assistenz, Medizinische Fachkraft, Praxismitarbeiter* — plus `berufsfeld`
   für Gesundheit/Medizin.
2. **Precision (Filter):** Treffer **nur behalten**, wenn `beruf` bzw. `hauptDkz` auf der
   kalibrierten Whitelist steht. Damit fallen Pflegehelfer, Krankenpflege, Reinigung,
   Verwaltung ohne Medizinbezug und Studentenjobs deterministisch heraus — ohne LLM.
3. **Graubereich:** Nur Datensätze, deren `beruf` weder auf der White- noch auf der Blacklist
   steht, gehen in eine LLM-Einzelfallprüfung (mit Cache). Erfahrungsgemäß ein kleiner
   einstelliger Prozentsatz → vernachlässigbare Kosten.

Die White-/Blacklist wird **nicht geraten**, sondern im Kalibrierungslauf aus den `facetten`
(`beruf`-Verteilung) erzeugt und einmal manuell abgenommen. Sie liegt als versionierte
`config/berufe.yaml` im Repo und ist damit nachvollziehbar und änderbar.

### 2.6 Abdeckung: Sharding statt Glück

Unbekannt und in dieser Session nicht prüfbar ist, ob die API die Gesamttrefferzahl
(`maxErgebnisse`) über `page`/`size` vollständig ausliefert oder ab einer Tiefe abschneidet.
Der Plan behandelt das als gegeben und **shardet die Suche**, statt auf tiefe Pagination zu
setzen:

- Shard-Dimension 1: **Geografie** — Liste der ~400 Kreise bzw. PLZ-Regionen als `wo` mit
  passendem `umkreis`, überlappungsarm gewählt.
- Shard-Dimension 2: **Zeitfenster** über `veroeffentlichtseit` (z. B. 0–7, 8–14, …).
- Shard-Dimension 3: **Synonym** aus der `was`-Liste.

Nach jedem Shard wird `maxErgebnisse` mit der Zahl tatsächlich eingesammelter Treffer
verglichen. Bleibt eine Lücke, wird der Shard automatisch feiner geteilt (Rekursion).
Das ist die einzige Methode, die ohne Kenntnis interner Limits nachweisbar vollständig ist —
und sie protokolliert ihre eigene Vollständigkeit (`coverage_audit`-Tabelle).

---

## 3. PROPOSED ARCHITECTURE

### 3.1 Sprache und Ort

- **Python 3.11**, weil der BA-Client, die Overture-/DuckDB-Werkzeuge und das gesamte
  Daten-Ökosystem dort liegen. Die Website bleibt unangetastet.
- Ort: `pipeline/` im Repo, **strikt isoliert** — eigenes `requirements.txt`, kein gemeinsamer
  Build, keine Änderung an `netlify.toml` außer einer Absicherung (Auflage A-2).
- **Kein LLM als Pipeline-Rückgrat.** LLMs nur an drei Stellen (Graubereichs-Klassifikation,
  uneindeutige Impressum-Extraktion, Namens-Matching-Zweifelsfälle), jeweils mit Cache,
  deterministischem Vorfilter und Abschaltschalter.

### 3.2 Schichten

```
                    ┌────────────────────────────────────────────┐
                    │  Runner / Orchestrator (run_id, Resume)    │
                    └────────────────────────────────────────────┘
                                        │
   ┌────────────────────────────────────┴─────────────────────────────────┐
   │  Stages (deterministisch, idempotent, je Datensatz fehlerisoliert)   │
   ├──────────────────────────────────────────────────────────────────────┤
   │ 1 discovery      BA-Suche, geo/zeit/synonym-geshardet                │
   │ 2 job_filter     beruf/DKZ-Whitelist, Blacklist, LLM nur im Graubereich│
   │ 3 company_resolve BA-Details → Identität, Adresse, Website, Branche  │
   │ 4 company_enrich  Places-Abgleich (OSM/Overture), Website-Verifikation│
   │ 5 decision_maker  Impressum → Team → Anzeigentext                    │
   │ 6 contact_enrich  E-Mail, Telefon (E.164), Kontaktformular           │
   │ 7 dedupe          Union-Find über Schlüsselhierarchie                │
   │ 8 quality         Confidence-Score, Konfliktauflösung                │
   │ 9 scoring         Lead-Score                                         │
   │10 export          CSV (+ optional Close-CRM-Adapter)                 │
   └──────────────────────────────────────────────────────────────────────┘
                                        │
   ┌────────────────────────────────────┴─────────────────────────────────┐
   │  SourceAdapter (ABC): rate limit · retry/backoff · cache · logging   │
   │  BAAdapter · PlacesAdapter{OSM,Overture} · WebsiteAdapter ·          │
   │  SearchAdapter (default AUS) · DNSAdapter · LLMAdapter               │
   └──────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┴──────────────────┐
                    │  SQLite: companies · jobs · people ·  │
                    │  provenance · errors · runs · cache   │
                    └──────────────────────────────────────┘
```

Jede Stage liest und schreibt ausschließlich die Datenbank und ist damit **einzeln
wiederholbar** (`--stage decision_maker --run-id …`). Ein Absturz in Stage 5 kostet nie die
Arbeit der Stages 1–4.

### 3.3 SourceAdapter — ein Vertrag für alle Quellen

```python
class SourceAdapter(ABC):
    name: str
    rate: RateLimit          # Token-Bucket pro Host
    cache_ttl: timedelta
    def fetch(self, req: Request) -> Response: ...   # mit Retry + Backoff + Jitter
```

Gemeinsam implementiert, nicht je Adapter dupliziert: Token-Bucket-Rate-Limiting, Retry mit
exponentiellem Backoff (nur bei 429/5xx/Timeout, nie bei 4xx), Request-Log in die DB,
Response-Cache mit TTL, `robots.txt`-Prüfung im `WebsiteAdapter`. Eine Quelle auszutauschen
heißt: eine Klasse schreiben, eine Zeile Konfiguration ändern.

---

## 4. DATA SOURCES

| Quelle | Rolle | Kosten | Rate Limit | Warum |
|---|---|---|---|---|
| **BA Jobsuche + Jobdetails** | **Primär** — Jobs, Firma, Adresse, Website, Branche, Größe, Geo | 0 € | unbestätigt ~1000/h → konservativ 1 req/s | Einzige Quelle mit *aktueller Suchabsicht*. Liefert zusätzlich den Großteil der Firmendaten. |
| **Anzeigentext (BA)** | **Primär** für Ansprechpartner/Telefon/E-Mail | 0 € | — | Höchste Ausbeute pro Aufwand: Praxen schreiben Kontaktdaten in die Anzeige. Bereits abgerufen, kein Zusatz-Request. |
| **Website + Impressum** | **Primär** für Entscheider und verifizierte E-Mail | 0 € (Bandbreite) | 1 req/Domain/2 s | § 5 DDG **verpflichtet** zum Impressum mit Vertretungsberechtigtem → strukturell hohe Trefferquote. |
| **OSM / Overpass** | Fallback Website/Telefon/Geo, Cross-Check | 0 € | 1 req/2 s, faire Nutzung | In Deutschland für Arztpraxen erfahrungsgemäß besser gepflegt als kommerzielle POI-Sätze; Tags `amenity=doctors`, `healthcare=*`, `website`, `phone`, `email`. **ODbL** beachten. |
| **Overture Places** | Cross-Check, zweite Meinung | 0 € | keins (lokaler Parquet-Auszug) | Enthält `names`, `categories`, `confidence`, `websites`, `phones`, `emails`, `addresses`, GERS-ID. **Nicht** per API, sondern einmalig als DE-Auszug via DuckDB → danach offline. |
| **DNS/MX** | E-Mail-Domain-Plausibilität | 0 € | — | Billig, offline-nah, kein SMTP-Handshake (siehe R-8). |
| **Suchmaschinen-API** | letzter Fallback Website | **kostenpflichtig** | — | **Standardmäßig AUS.** Nur mit explizitem Flag und Budget-Deckel. |
| **LLM** | Graubereich, uneindeutige Extraktion | **kostenpflichtig** | — | Nur wo Semantik echten Vorteil bringt; mit Cache und Deckel. |
| Handelsregister/Unternehmensregister | bewusst **nicht** | — | — | Für Einzelpraxen ohne HR-Eintrag wertlos, Zugriff restriktiv, Aufwand/Nutzen schlecht. |

### 4.1 Overture — Bewertung (Phase 5)

**Eignung:** Das Places-Schema passt formal gut (Name, Kategorie, Adresse, Koordinaten,
Website, Telefon, E-Mail, Existenz-Confidence, stabile GERS-ID). Der Bezug ist kostenlos als
GeoParquet auf S3/Azure und lässt sich mit DuckDB per Bounding-Box und Kategoriefilter auf
einen deutschen Medizin-Auszug reduzieren — danach entstehen **keine Requests und keine
Kosten** mehr.

**Vorbehalt:** Die Abdeckung kleiner deutscher Einzelpraxen ist in den Places-Daten nicht
belegt und in dieser Session nicht messbar. Sie blind zur Leitquelle zu machen wäre ein Fehler.

**Entscheidung:** Overture wird **nicht** als alleinige oder erste Quelle verwendet. Beide
Kandidaten (OSM und Overture) werden hinter demselben `PlacesAdapter`-Interface implementiert
und im Kalibrierungslauf an denselben 100 Firmen **gemessen** (Match-Rate, Website-Ausbeute,
Adressgenauigkeit). Die Reihenfolge wird nach Messergebnis konfiguriert, nicht nach Vermutung.

**Fallback-Kette (Website/Kontakt), nach Kosten und Verlässlichkeit sortiert:**

```
BA arbeitgeberdarstellungUrl        (kostenlos, first-party)
  → BA Anzeigentext-Extraktion      (kostenlos, bereits geladen)
  → Places (OSM / Overture)         (kostenlos, offline)
  → Domain-Rateverfahren + Verifikation gegen Impressum   (kostenlos, nur verifiziert übernommen)
  → Suchmaschinen-API               (kostenpflichtig, default AUS)
  → NULL
```

---

## 5. DATA MODEL

### 5.1 Architekturentscheidung: normalisiert, nicht flach (Phase 10)

Ein Unternehmen mit drei MFA-Anzeigen darf nicht drei Leads erzeugen. Eine flache
Ein-Zeile-pro-Lead-Tabelle kann das nur mit Sammelspalten abbilden und macht inkrementelle
Läufe, Provenienz und Konfliktauflösung unmöglich.

**Entscheidung: normalisiertes Kernmodell in SQLite, flacher Export als Sicht.**

```
companies 1 ──── n jobs
    │
    ├── n people            (Entscheider und Ansprechpartner)
    ├── n locations         (Mehrstandort)
    └── n field_provenance  (je Feld: Wert, Quelle, URL, Methode, Zeitpunkt, Confidence)

runs · errors · request_log · cache · coverage_audit · suppression
```

`SQLite`, weil: Teil der Standardbibliothek, eine Datei, transaktional, gut genug für
Millionen Zeilen, keine Infrastruktur. Ein späterer Wechsel auf Postgres ist ein
Repository-Austausch, kein Umbau.

**`field_provenance` ist das Herzstück gegen Halluzination.** Kein Wert ohne Herkunftszeile.
Wo zwei Quellen widersprechen, stehen beide in der Tabelle und die Konfliktauflösung ist
nachvollziehbar statt stillschweigend.

### 5.2 Der Export-Datensatz (alle geforderten Felder)

**Job** — `job_id`, `job_title`, `original_job_title`, `job_description`, `gesucht_nach`,
`job_url`, `employment_type`, `publication_date`, `first_seen`, `last_seen`, `job_status`,
`source`, `source_url`, `refnr`, `dkz`, `beruf_normalisiert`, `anzahl_offene_stellen`

**Unternehmen** — `company_name`, `company_name_normalized`, `company_type`, `industry`,
`employee_count`, `address`, `street`, `postal_code`, `city`, `state`, `country`, `latitude`,
`longitude`, `website`, `company_domain`, `ba_employer_hash`, `location_count`

**Entscheider** — `decision_maker_name`, `_first_name`, `_last_name`, `_position`,
`_position_rank` (1–5), `_email`, `_phone`, `_linkedin`, `_source`, `_source_url`, `_verified`

**Kontakt** — `general_email`, `general_phone`, `contact_form_url`, `careers_url`,
`impressum_url`

**Qualität** — `email_type` (`direct_verified` | `direct_public` | `generic_public` |
`pattern_inferred` | `unknown`), `email_verified` (`true`/`false`/`unknown`), `phone_verified`,
`website_verified`, `company_verified`, `decision_maker_verified`, `data_sources`,
`enrichment_timestamp`, `confidence_score`, `lead_score`, `duplicate_key`, `status`

**Aggregat (Dedup-Ergebnis)** — `job_count`, `job_titles`, `job_urls`, `first_job_seen`,
`latest_job_seen`

**Compliance** — `legal_basis`, `art14_notice_status`, `suppressed`, `retention_until`

`company_type` wird deterministisch aus dem Namen abgeleitet (`MVZ`, `GmbH`, `Gemeinschaftspraxis`,
`Praxisgemeinschaft`, `Einzelpraxis`, `Klinik`, `Pflegedienst`, `unknown`) und fließt ins Scoring.

**Regel ohne Ausnahme:** Nicht sicher ermittelte Felder sind `NULL`, nie geraten, nie geglättet.

---

## 6. ENRICHMENT STRATEGY

### 6.1 Company Resolution (Phase 4)

```
BA-Anzeige
 └─ arbeitgeberHashId      ──►  existiert bereits?  ──► ja: nur Job anhängen, fertig (billig!)
 └─ arbeitgeber (Name)          nein ↓
 └─ arbeitgeberAdresse     ──►  Normalisierung (§ 7)
 └─ arbeitgeberdarstellungUrl ─►  Domain (eTLD+1)  ──► verifizieren
 └─ arbeitsorte[].koordinaten ─►  Places-Abgleich (Name + Geo + PLZ)
                                  ↓
                          Website · Telefon · Adresse · Kategorie
```

Der Kniff: `arbeitgeberHashId` beantwortet „kenne ich diese Firma schon?" **bevor** irgendein
externer Request passiert. Bei täglichen Läufen ist das der Hauptgrund, warum Kosten und
Laufzeit nicht mit der Zeit wachsen.

**Website-Verifikation** (`website_verified`) — eine URL gilt erst als bestätigt, wenn sie
lädt (2xx nach Redirects) **und** mindestens eines zutrifft: PLZ oder Straße aus der
BA-Adresse steht im Impressum; der normalisierte Firmenname steht in Title/Impressum;
Telefonnummer stimmt mit einer bereits bekannten überein. Sonst: `website_verified = false`,
Wert bleibt erhalten, Confidence sinkt.

### 6.2 Website-Enrichment (Phase 6)

Gezielt statt flächendeckend crawlen — maximal ~6 Seiten pro Domain:

1. `robots.txt` prüfen und respektieren; identifizierender User-Agent mit Kontakt-URL.
2. Startseite laden, Links einsammeln.
3. Kandidatenseiten nach Linktext/URL-Muster: `impressum`, `kontakt`, `team`, `praxis`,
   `ueber-uns`, `karriere`, `jobs`, `stellenangebote`, `aerzte`, `praxisteam`.
4. Extraktion je Seite: E-Mails (inkl. entschärfter Schreibweisen), Telefonnummern,
   Kontaktformular-URL, Namensblöcke mit Rollenbegriffen.

Rollenbegriffe für die Entscheidersuche: *Geschäftsführer(in), Inhaber(in), Praxisinhaber(in),
Gesellschafter, Vertretungsberechtigt, Ärztliche Leitung, Praxisleitung, Praxismanagement,
Ansprechpartner, Personal, Recruiting, HR*.

### 6.3 Decision-Maker (Phase 7)

**Warum das funktioniert:** § 5 DDG verpflichtet jede geschäftsmäßige Website zu einem
Impressum mit dem Vertretungsberechtigten. Bei einer GmbH/MVZ steht dort der Geschäftsführer,
bei einer Praxis der niedergelassene Arzt. Das ist eine gesetzlich erzwungene, strukturierte
Quelle — deshalb steht sie an erster Stelle, nicht LinkedIn.

Prioritätsstufen (`decision_maker_position_rank`): 1 Geschäftsführer/Inhaber · 2 Praxisinhaber ·
3 Praxisleitung · 4 Personalleitung · 5 HR/Recruiting-Ansprechpartner.

Quellenreihenfolge und resultierendes `decision_maker_source`:

| Rang | Quelle | `_verified` |
|---|---|---|
| 1 | Impressum der **verifizierten** Domain | `true` |
| 2 | Team-/Über-uns-Seite derselben Domain | `true` wenn Rolle explizit, sonst `false` |
| 3 | Ansprechpartner im BA-Anzeigentext | `false` (Rolle oft unklar) |
| 4 | Places-Daten / öffentliche Profile | `false` |
| — | nirgends belegt | **`NULL` — niemals ableiten** |

Stimmen zwei unabhängige Quellen im Namen überein → `decision_maker_verified = true` und
Confidence-Bonus. Widersprechen sie sich → beide in `field_provenance`, Export nimmt die
höherrangige Quelle, `confidence` sinkt, `status = conflict_review`.

Das LLM darf hier **ausschließlich aus vorgelegtem Seitentext extrahieren** (Prompt mit
Zwang zu Textbeleg, kein Weltwissen, kein Raten). Findet es keinen Beleg im Text, ist die
Antwort `null` — das wird im Prompt und in der Validierung erzwungen.

### 6.4 E-Mail (Phase 8)

Reihenfolge: persönliche Adresse des Entscheiders auf der Firmendomain → `vorname.nachname@` nur
wenn **so auf der Seite gefunden** → `praxis@`/`kontakt@`/`info@` → `bewerbung@`.

**Kein Raten.** Ein aus einem Muster abgeleiteter Wert wird als `pattern_inferred` markiert,
bekommt `email_verified = unknown`, zählt **null** Punkte in der Confidence und wird
**standardmäßig nicht exportiert** (`--include-inferred-emails` schaltet es frei).

`email_type`: `direct_verified` (persönlich, auf verifizierter Domain gefunden, MX vorhanden) ·
`direct_public` (persönlich, öffentlich gefunden) · `generic_public` (Sammeladresse) ·
`pattern_inferred` · `unknown`.

### 6.5 Telefon (Phase 9)

Extraktion aus Anzeigentext, Impressum, Kontaktseite, Places. Normalisierung nach **E.164**
mit `phonenumbers` (Region `DE`), z. B. `+493012345678`. Ungültige Nummern werden verworfen,
nicht repariert. Durchwahl des Entscheiders schlägt Zentrale.

---

## 7. DEDUPLICATION

### 7.1 Schlüsselhierarchie (stärkster zuerst)

| Tier | Schlüssel | Sicherheit |
|---|---|---|
| T1 | `ba_employer_hash` (`arbeitgeberKundennummerHash`, siehe § 16.1) | exakt, BA-eigene Identität — aber nur dort, wo die BA ihn liefert |
| T2 | `company_domain` (eTLD+1, ohne Freemail/Portale) | sehr hoch |
| T3 | `phone_e164` | hoch |
| T4 | `name_normalized` + `postal_code` | hoch |
| T5 | Fuzzy: Namensähnlichkeit ≥ 0,88 **und** Distanz < 500 m | mittel → Review |

### 7.2 Normalisierung

Kleinschreibung → Umlautfaltung (`ä→ae`) → Rechtsformen entfernen (`gmbh`, `mbh`, `ug`, `gbr`,
`partg`, `mbb`) → Füllwörter entfernen (`praxis`, `praxisgemeinschaft`, `gemeinschaftspraxis`,
`facharztpraxis`, `dr`, `med`, `prof`, `dipl`, `und kollegen`, `& partner`) → Interpunktion und
Mehrfach-Leerzeichen weg → Tokens sortiert.

Damit fallen die Beispiele aus der Aufgabenstellung zusammen:

```
"Praxis Dr. Müller"                      → mueller
"Dr. Müller MVZ GmbH"                    → mueller mvz
"MVZ Müller"                             → mueller mvz
"Praxisgemeinschaft Müller & Kollegen"   → mueller
```

`MVZ` bleibt bewusst erhalten — es unterscheidet eine Einzelpraxis von einem MVZ und ist damit
identitätstragend, kein Rauschen.

### 7.3 Clustering statt Paarvergleich

Blocking über `PLZ-Präfix(3) + erstes Nachnamen-Token` hält den Vergleich klein. Innerhalb
eines Blocks werden die Tier-Schlüssel als Kanten in einen **Union-Find** gegeben; jede
Zusammenhangskomponente ist ein Unternehmen. Das löst Transitivität korrekt (A≡B über Domain,
B≡C über Telefon ⇒ A≡C).

**Schutz gegen Über-Mergen** — der teurere Fehler: T4/T5 verlangen zusätzlich geografische
Übereinstimmung (gleiche PLZ oder < 500 m). Zwei „Praxis Dr. Müller" in Berlin und Hamburg
bleiben getrennt. Verschiedene Praxen im selben Ärztehaus brauchen zusätzlich Namensähnlichkeit.
T5-Merges landen mit `status = merge_review` in `duplicates_*.csv` statt still zu verschmelzen.

Ein Merge behält die Firmenwerte mit der höchsten Provenienz, sammelt alle Jobs, und schreibt
`job_count`, `job_titles`, `job_urls`, `duplicate_key`.

---

## 8. LEAD SCORING & DATA QUALITY

Zwei getrennte Zahlen, weil sie verschiedene Fragen beantworten:
**`confidence_score` = „stimmen die Daten?"**, **`lead_score` = „lohnt sich der Anruf?"**
Beide additiv, deckelbar, vollständig in `config/scoring.yaml` — kein Black-Box-Score. Jeder
Lead bekommt zusätzlich `score_breakdown` als JSON mit jedem einzelnen Beitrag.

### 8.1 Confidence-Score (0–100), Phase 12

| Komponente | Punkte |
|---|---|
| Firmenidentität: `ba_employer_hash` vorhanden | 20 |
| Adresse: vollständige `arbeitgeberAdresse` (Straße+PLZ+Ort) | 15 · nur Arbeitsort: 8 |
| Website: verifiziert (lädt + Adress-/Namensabgleich) | 20 · aus BA, unverifiziert: 10 · aus Places/Suche: 5 |
| Telefon: aus Impressum verifizierter Domain | 15 · aus Anzeige/Places: 8 |
| E-Mail: `direct_verified` | 15 · `direct_public` 12 · `generic_public` 8 · `pattern_inferred` **0** |
| Entscheider: Impressum verifizierter Domain | 20 · Teamseite 15 · Anzeigentext 12 · sonst 5 |
| **Bonus** ≥ 2 unabhängige Quellen stimmen bei Adresse **oder** Telefon überein | +10 |
| **Malus** widersprüchliche Werte zwischen Quellen | −10 |
| **Malus** Domain passt nicht zu Firmenname/Adresse | −15 |
| **Malus** `anzeigeAnonym = true` | −25 |

Summe auf 0–100 gekappt. Bänder: **0–30** sehr unsicher · **31–60** mittel · **61–80** gut ·
**81–100** hoch. Unter 31 wird nicht exportiert, sondern nach `enrichment_errors_*.csv`
geschrieben.

### 8.2 Lead-Score (0–100), Phase 11

| Faktor | Punkte |
|---|---|
| Aktuelle MFA-Stelle (Basis, hat jeder Lead) | +30 |
| 2–3 offene MFA-Stellen | +10 · **≥ 4** | +15 |
| `anzahlOffeneStellen > 1` in einer Anzeige | +5 |
| Betriebsgröße im Zielkorridor (ca. 5–50 Mitarbeiter) | +10 |
| `company_type` MVZ/GmbH/Gemeinschaftspraxis | +8 · Einzelpraxis +5 |
| Entscheider bekannt, Rang 1–3 | +15 · Rang 4–5 +8 |
| Direkte Telefonnummer | +8 |
| Direkte Entscheider-E-Mail (nicht `pattern_inferred`) | +7 |
| Mehrere Standorte | +5 |
| Recruiting-Aktivität: in ≥ 2 Läufen inseriert / Neuveröffentlichung | +5 |
| **Malus** keine Website | −10 |
| **Malus** Zeitarbeit/PAV als Inserent | −25 |
| **Malus** Arbeitgeberidentität unklar (`anzeigeAnonym`) | −20 |
| **Malus** Stelle beim letzten Check nicht mehr aktiv | −15 |
| **Deckel** `confidence_score < 40` ⇒ `lead_score ≤ 50` | — |

Der Deckel verhindert das Kernproblem solcher Listen: ein hübsch aussehender Lead auf dünner
Datenbasis, der dem Vertrieb Zeit stiehlt.

---

## 9. ROBUSTHEIT, BETRIEB, INKREMENTALITÄT

**Fehlerisolierung:** Jede Stage verarbeitet je Datensatz in `try/except`. Ein Fehler schreibt
eine Zeile nach `errors` (run_id, stage, entity, exception, url, timestamp) und die Schleife
läuft weiter. **Keine Pipeline bricht wegen eines Datensatzes ab.** Am Ende steht der Fehler im
Qualitätsreport und in `enrichment_errors_*.csv`.

**Abgedeckte Fälle** (Phase 14): API-Timeout · 429 · 5xx · leere Ergebnisse · ungültige URL ·
Website nicht erreichbar · TLS-Fehler · CAPTCHA erkannt (→ Domain überspringen, nie umgehen) ·
`robots.txt` verbietet (→ überspringen, protokollieren) · fehlende Telefonnummer/E-Mail/
Geschäftsführer (→ `NULL`) · widersprüchliche Daten (→ `conflict_review`) · Dubletten ·
temporäre Netzfehler (→ Retry).

**Retry:** exponentiell mit Jitter (1s/2s/4s/8s, max 4 Versuche), **nur** bei 429/5xx/Timeout.
`Retry-After` wird respektiert. 4xx wird nie wiederholt.

**Resume:** `runs`-Tabelle mit Status je Stage und Shard. Ein abgebrochener Lauf wird mit
`--resume <run_id>` genau dort fortgesetzt, wo er stand.

**Inkrementell (Regel 4):** `veroeffentlichtseit` = Tage seit letztem Lauf + 1 Tag Puffer.
Bekannte `arbeitgeberHashId` überspringt das komplette Company-Enrichment, solange
`enrichment_timestamp` jünger als `ENRICH_TTL_DAYS` (Standard 90) ist und keine Pflichtfelder
fehlen. Jobs bekommen `first_seen`/`last_seen`; wer zwei Läufe fehlt, wird `job_status = closed`.

**Observability (Regel 7):** strukturiertes JSON-Logging (`run_id`, `stage`, `entity_id`,
`source`, `duration_ms`, `cache_hit`), vollständiges `request_log` in der DB, Zähler je Stage,
Qualitätsreport am Ende jedes Laufs.

---

## 10. CSV-EXPORT (Phase 13 & 23)

`output/` (gitignored):

```
mfa_leads_YYYY-MM-DD.csv           # 1 Zeile = 1 Unternehmen, vertriebsfertig
companies_YYYY-MM-DD.csv           # vollständiges Firmenmodell
jobs_YYYY-MM-DD.csv                # 1 Zeile = 1 Stelle, mit company_id
enrichment_errors_YYYY-MM-DD.csv   # Fehler + Leads unter Confidence-Schwelle
duplicates_YYYY-MM-DD.csv          # Merge-Entscheidungen zum Nachprüfen
quality_report_YYYY-MM-DD.md       # Kennzahlen (Phase 22)
```

**Excel-tauglich:** UTF-8 **mit BOM** und **Semikolon** als Trennzeichen (deutsches Excel
interpretiert Komma-CSV sonst falsch), CRLF, Felder mit Trennzeichen/Zeilenumbruch gequotet,
Telefonnummern und PLZ als Text (führende Null bleibt), ISO-Datum. Über `--delimiter ,
--no-bom` auf internationale Werkzeuge umstellbar.

Die Spaltenreihenfolge von `mfa_leads_*.csv` beginnt mit genau der geforderten Vertriebssicht:
`Unternehmen | Geschäftsführer | E-Mail | Telefon | Gesuchte Stelle | Ort | Website | Job-URL |
Lead Score` — danach folgen die technischen Felder.

---

## 11. COST ANALYSIS (Phase 15)

**Der Plan ist so gebaut, dass ein vollständiger Lauf 0 € externe API-Kosten verursacht.**

| Posten | Kosten | Bemerkung |
|---|---|---|
| BA-API (Suche + Details + Logo) | **0 €** | kein Key, keine Abrechnung |
| OSM Overpass | **0 €** | faire Nutzung, Rate Limit beachten |
| Overture Places | **0 €** | einmaliger DE-Auszug via DuckDB, danach offline |
| Website-Abruf, DNS/MX | **0 €** | nur Bandbreite |
| SQLite, alle Bibliotheken | **0 €** | Open Source |
| **Suchmaschinen-API** | **kostenpflichtig** | **default AUS**, Flag + harter Request-Deckel |
| **LLM** | **kostenpflichtig** | nur Graubereich; Schätzung unten |
| E-Mail-Verifikationsdienste | — | **bewusst nicht verwendet** (R-8) |

**LLM-Abschätzung** für 1.000 Leads bei ca. 5 % Graubereich und ca. 15 % uneindeutigen
Impressen: ~200 kurze Aufrufe mit je ~1–2k Tokens. Mit einem kleinen Modell (Haiku-Klasse)
liegt das im **niedrigen einstelligen Euro-Bereich pro 1.000 Leads**. Mit Cache sinkt das bei
Folgeläufen gegen null, weil derselbe Anzeigentext nicht zweimal bewertet wird.

**Request-Ersparnis durch Design:**
- `arbeitgeberHashId`-Kurzschluss ⇒ Firmen-Enrichment nur beim ersten Sehen.
- HTTP-Cache mit TTL je Quelle (Suche 6 h, Jobdetails 30 d, Website 14 d, Places statisch).
- Jobdetails nur für Anzeigen, die den Relevanzfilter überlebt haben — nicht für alle Treffer.
- Website-Crawl auf ≤ 6 Seiten pro Domain begrenzt.
- Budget-Deckel pro Lauf (`MAX_REQUESTS_*`), harter Abbruch statt stiller Kostenexplosion.

---

## 12. RISKS

| # | Risiko | Schwere | Behandlung |
|---|---|---|---|
| **R-1** | BA-API ist **inoffiziell**; keine Nutzungsbedingungen, die kommerzielle Massenabfrage gestatten. Änderungen oder Sperrung jederzeit möglich. | **hoch** | Konservatives Rate Limit, identifizierender User-Agent, Volumen so klein wie nötig; Adapter kapselt die Quelle austauschbar; Vertragsbruch-/Sperr-Risiko bewusst vom Auftraggeber zu tragen. |
| **R-2** | `publish = "."` ⇒ Pipeline, DB und Lead-CSV bei CLI-Deploy **öffentlich** unter finanz-medizin.com. | **hoch** | Auflage A-2: `output/`, `*.db`, `cache/` in `.gitignore`; `pipeline/`-Pfad in `netlify.toml` auf 404; Empfehlung: eigenes Repository. |
| **R-3** | **§ 7 UWG**: Kalt-**E-Mail** an Praxen ohne vorherige ausdrückliche Einwilligung ist unzulässig — auch B2B. Kalt-**Telefon** verlangt „mutmaßliche Einwilligung" mit konkretem Sachbezug; das **BVerwG (29.01.2025, 6 C 3.23)** hat entschieden, dass Kontaktdaten aus öffentlichen Verzeichnissen für Telefon-Kaltakquise **nicht** auf berechtigtes Interesse gestützt werden können. | **hoch** | Siehe § 12.1. Kein technisches, sondern ein Verwendungsproblem — der Plan liefert die Felder, um es sauber zu lösen. |
| **R-4** | **DSGVO Art. 14**: Entscheiderdaten stammen nicht von der betroffenen Person ⇒ Informationspflicht binnen eines Monats. | **hoch** | Feld `art14_notice_status`, Textbaustein und Prozess vorgesehen; Art. 6 Abs. 1 lit. f mit dokumentierter Abwägung (LIA) als Grundlage. |
| **R-5** | Overture-Abdeckung deutscher Einzelpraxen unbelegt. | mittel | Nicht als Leitquelle; A/B-Messung gegen OSM im Kalibrierungslauf entscheidet. |
| **R-6** | Vollständigkeit der BA-Suche (Trefferabschneidung bei tiefer Pagination) unbekannt. | mittel | Sharding + `coverage_audit` mit Soll-Ist-Abgleich je Shard, rekursive Verfeinerung. |
| **R-7** | Inserent ≠ Praxis (Zeitarbeit, PAV, Personalberatung, anonyme Anzeigen). | mittel | `zeitarbeit=false`, `pav=false`, `anzeigeAnonym`-Ausschluss, Blacklist bekannter Personaldienstleister. |
| **R-8** | SMTP-Verifikation von E-Mails gilt vielerorts als missbräuchlich und wird geblockt; erzeugt zudem falsche Sicherheit. | mittel | **Nicht implementieren.** Nur MX-Prüfung; `email_verified` bleibt sonst `unknown`. |
| **R-9** | **ODbL** (OSM): Share-alike kann bei Weitergabe einer abgeleiteten Datenbank greifen. | mittel | OSM-Daten intern zur Anreicherung; Herkunft je Feld protokolliert; vor Weitergabe an Dritte juristisch klären; Attribution im Export. |
| **R-10** | Website-Scraping: `robots.txt`, Lastverursachung, CAPTCHA. | mittel | `robots.txt` respektieren, 1 req/Domain/2 s, identifizierender UA, **keine CAPTCHA-Umgehung**, bei Sperre abbrechen. |
| **R-11** | Halluzinierte Entscheider durch LLM. | mittel | LLM extrahiert nur aus vorgelegtem Text mit Belegzwang; ohne Textbeleg `NULL`; jeder Wert mit Quell-URL in `field_provenance`. |
| **R-12** | Datenaufbewahrung ohne Löschkonzept. | niedrig | `retention_until`, Standard 24 Monate ohne Geschäftsbeziehung; `suppression`-Tabelle für Widersprüche, wird bei jedem Lauf angewandt. |

### 12.1 Empfohlene Verwendungsstrategie zu R-3 (bewusst zu entscheiden)

Der Plan baut die Liste so, dass **rechtlich saubere Kanäle** möglich sind:

- **Telefon** mit konkretem Sachbezug: Die Praxis inseriert *jetzt* eine MFA-Stelle; ein
  Angebot zu Mitarbeiterbindung/Benefits hat damit einen spezifischen Bezug zum Gewerbe des
  Angerufenen. Das ist die belastbarste Variante — aber nach dem BVerwG-Urteil kein
  Freibrief, sondern eine Einzelfallabwägung, die dokumentiert gehört.
- **Postalisch**: Briefwerbung ist der rechtlich unkritischste Kanal (Art. 6 Abs. 1 lit. f mit
  Widerspruchsmöglichkeit) — die Adressqualität der Pipeline ist dafür ausgezeichnet.
- **Einwilligungsbasiert**: Die Liste als Zielgruppe für Content/Ads verwenden, die in die
  bestehenden Funnels auf finanz-medizin.com führen — dort wird die Einwilligung sauber erhoben
  und der Lead landet ohnehin in Close.
- **Nicht empfohlen**: Kalt-E-Mail-Aussendung an `decision_maker_email`. Deshalb ist
  `pattern_inferred` standardmäßig aus dem Export ausgeschlossen und jeder Lead trägt
  `legal_basis`.

**Das ist eine Geschäftsentscheidung, keine technische.** Die Pipeline ist in allen Varianten
dieselbe; nur der Export und der Kanal ändern sich.

---

## 13. IMPLEMENTATION PLAN (Phase 20)

Zehn Schritte, jeder für sich testbar und lauffähig.

| # | Schritt | Ergebnis | Tests |
|---|---|---|---|
| 1 | Gerüst: `pipeline/`, Config, JSON-Logging, SQLite-Schema, Migrationen, `.gitignore`, Netlify-Absicherung | `python -m pipeline init` legt DB an | Schema-Test |
| 2 | `SourceAdapter`-Basis: Rate Limit, Retry/Backoff, Cache, Request-Log, robots.txt | wiederverwendbare Basis | Unit-Tests mit Fake-Clock, 429/5xx/Timeout simuliert |
| 3 | `BAAdapter` + Modelle | Suche, Jobdetails, Logo | Tests gegen **aufgezeichnete Fixtures**, kein Netz |
| 4 | Stage 1–2: Discovery mit Sharding + `coverage_audit`, Relevanzfilter über `beruf`/DKZ | relevante Jobs in der DB | Filter-Tests mit Positiv-/Negativkatalog |
| 5 | Stage 3: Company Resolution, Normalisierung, `company_type`, Website-Verifikation | Firmen in der DB | Normalisierungs-Tests inkl. der vier Müller-Varianten |
| 6 | Stage 4: `PlacesAdapter` (OSM + Overture) | Geo-/Kontakt-Anreicherung | Fixture-Tests, A/B-Messskript |
| 7 | Stage 5–6: `WebsiteAdapter`, Impressum-/Team-Parser, E-Mail, Telefon (E.164) | Entscheider und Kontakt | Parser-Tests an ~20 echten Impressum-HTML-Fixtures |
| 8 | Stage 7–9: Dedup (Union-Find), Confidence, Lead-Score | zusammengeführte, bewertete Leads | Dedup-Tests (auch **Nicht**-Merge-Fälle), Score-Tabellen-Tests |
| 9 | Stage 10: CSV-Export, Qualitätsreport, optionaler Close-Adapter | Dateien in `output/` | Excel-Kompatibilität, Golden-File-Test |
| 10 | Runner, Resume, Inkrementalität, CLI, README | `python -m pipeline run --region berlin --limit 100` | End-to-End gegen Fixtures |

**Teststrategie:** `pytest`. Unit-Tests laufen **ohne Netz** gegen aufgezeichnete Fixtures
(VCR-Prinzip). Integrationstests hinter `-m network`. Reproduzierbare Läufe über `run_id`,
festen Seed und eingefrorene Fixtures.

### 13.1 Kalibrierungs- und Testlauf (Phase 21/22)

Erster realer Lauf klein und in einer Region, in der `rest.arbeitsagentur.de` erreichbar ist:
**Berlin + 50 km, ~100 relevante Anzeigen, 50–100 Unternehmen.** Der Lauf hat zwei Aufgaben:

1. **Kalibrieren:** `beruf`-Facetten auswerten → White-/Blacklist erzeugen und manuell abnehmen;
   Trefferabschneidung prüfen; OSM vs. Overture messen.
2. **Qualität messen** — der Report gibt aus: gefundene Anzeigen · relevante Anzeigen ·
   eindeutige Unternehmen · mit Website · mit Telefon · mit E-Mail · mit Entscheider · mit
   Entscheider-E-Mail · Dubletten · Fehler · ⌀ Confidence · ⌀ Lead-Score · **Top-10-Fehler**.

Zusätzlich eine **manuelle Stichprobe von 20 Leads** gegen die echten Websites. Erst wenn
Company-Match ≥ 95 % und der Anteil falsch positiver Jobs ≤ 5 % liegt, wird hochskaliert.

---

## 14. REVIEW (Phase 18/19)

> **Kennzeichnung:** Diese Umgebung stellt keine echte zweite Agenteninstanz mit eigenem
> Kontext bereit. Der Review wurde deshalb als **bewusst gegnerische zweite Prüfperspektive**
> durchgeführt: Der Prüfer sucht Gründe, den Plan **abzulehnen**, nicht ihn zu bestätigen.
> Beide Runden sind unverändert dokumentiert, inklusive der Punkte, an denen Runde 1 den
> ursprünglichen Entwurf zurückgewiesen hat.

### 14.1 Review-Runde 1 — Ergebnis: `CHANGES_REQUIRED`

Geprüft gegen: Datenqualität · Company Resolution · Enrichment · Engineering · Kosten ·
Compliance · Betrieb.

| # | Befund | Schwere |
|---|---|---|
| F-1 | **Der Plan liefert eine Kalt-E-Mail-Liste, ohne zu sagen, dass Kalt-E-Mail nach § 7 UWG unzulässig ist.** Ein Vertriebsteam würde die Spalte `decision_maker_email` genau so verwenden. Ohne Kanalstrategie, `legal_basis`, Art.-14-Prozess und Suppression-Liste ist der Plan nicht freigabefähig. | **Blocker** |
| F-2 | **`publish = "."` wurde übersehen.** Ein `pipeline/`-Verzeichnis mit Lead-Daten wäre bei CLI-Deploy öffentlich abrufbar — personenbezogene Daten auf einer Marketing-Website. | **Blocker** |
| F-3 | Overture war im Erstentwurf faktisch Leitquelle für Company Resolution, obwohl die Abdeckung deutscher Einzelpraxen unbelegt ist. Verstößt gegen die eigene Vorgabe „nicht blind verwenden". | schwer |
| F-4 | Vollständigkeit war unterstellt: einfache Pagination über `was`-Suchen, ohne Nachweis, dass die API alle Treffer ausliefert. Ohne Sharding und Soll-Ist-Abgleich ist „möglichst vollständig" nicht belegbar. | schwer |
| F-5 | Inserent wurde mit Arbeitgeber gleichgesetzt. Zeitarbeit, private Arbeitsvermittlung und anonyme Anzeigen erzeugen strukturell falsche Leads. | schwer |
| F-6 | **`arbeitgeberHashId`, `arbeitgeberdarstellungUrl`, `betriebsgroesse`, `branche` und `arbeitgeberAdresse` waren nicht ausgewertet.** Der Entwurf hätte extern und teuer beschafft, was die BA gratis mitliefert — und hätte einen schlechteren Dedup-Schlüssel benutzt als den, den die BA selbst vergibt. | schwer |
| F-7 | LLM war im Hauptpfad der Job-Klassifikation vorgesehen: unnötige Kosten, nicht reproduzierbar, schlechter als eine Whitelist auf einem bereits normalisierten Feld. | mittel |
| F-8 | SMTP-E-Mail-Verifikation vorgesehen — technisch unzuverlässig, reputationsschädlich, erzeugt Scheinsicherheit. | mittel |
| F-9 | Nur ein Score geplant (vermischt „Daten stimmen" mit „Lead lohnt sich"). Ein hübscher Lead auf dünner Basis wäre oben gelandet. | mittel |
| F-10 | Kein Löschkonzept, keine Aufbewahrungsfrist, keine Widerspruchsliste. | mittel |
| F-11 | **In dieser Session ist die BA-API blockiert.** Der Plan tat so, als seien seine Annahmen über Antwortstruktur und Limits verifiziert. Sie sind es nicht. | mittel |
| F-12 | ODbL-Share-alike bei OSM-Weitergabe nicht adressiert. | gering |

### 14.2 Überarbeitung → Plan V2

Jeder Befund ist im vorliegenden Dokument eingearbeitet:

| Befund | Änderung | Fundstelle |
|---|---|---|
| F-1 | Kanalstrategie, `legal_basis`, `art14_notice_status`, `suppression`, `pattern_inferred` nicht im Standard-Export | § 12.1, § 5.2, § 6.4 |
| F-2 | `.gitignore`, 404-Regel für `/pipeline/*`, Empfehlung eigenes Repository | § 1.3, R-2, Auflage A-2 |
| F-3 | Overture zum Fallback degradiert, `PlacesAdapter` mit zwei Implementierungen, A/B-Messung entscheidet | § 4.1, Schritt 6 |
| F-4 | Sharding über Geografie/Zeit/Synonym + `coverage_audit` mit rekursiver Verfeinerung | § 2.6 |
| F-5 | `zeitarbeit=false`, `pav=false`, `anzeigeAnonym`-Ausschluss, Dienstleister-Blacklist, Lead-Score-Malus | § 2.3, § 8.2 |
| F-6 | BA-Detailfelder sind jetzt Primärquelle; `arbeitgeberHashId` ist T1-Dedup-Schlüssel und Kosten-Kurzschluss | § 2.4, § 6.1, § 7.1 |
| F-7 | Deterministische `beruf`/DKZ-Whitelist; LLM nur im Graubereich mit Cache | § 2.5 |
| F-8 | SMTP-Verifikation gestrichen, nur MX | § 4, R-8 |
| F-9 | Zwei getrennte Scores + Confidence-Deckel auf den Lead-Score | § 8 |
| F-10 | `retention_until`, `suppression`-Tabelle | R-12 |
| F-11 | Erster Lauf ist ausdrücklich Kalibrierungslauf; Tests fixture-basiert | § 2.1, § 13.1, Auflage A-1 |
| F-12 | ODbL-Behandlung und Attribution | R-9 |

### 14.3 Review-Runde 2 — Ergebnis: **`APPROVED`** (mit 4 Auflagen)

| Prüffeld | Bewertung |
|---|---|
| BA-API korrekt verwendet | **ja** — Endpunkte, Auth, Base64-`refnr`, Detailfelder korrekt; Annahmen als unverifiziert gekennzeichnet |
| Job-Filterung ausreichend, False Positives minimiert | **ja** — deterministisch auf normalisiertem Feld statt Freitext; Graubereich isoliert und messbar |
| Relevante MFA-Stellen werden gefunden | **plausibel, noch nicht belegt** — breiter Recall + Sharding + Coverage-Audit; Nachweis im Kalibrierungslauf (A-1) |
| Company Resolution zuverlässig | **ja** — BA-eigene Arbeitgeber-ID schlägt jede externe Heuristik |
| Overture sinnvoll integriert | **ja** — als messbarer Fallback, nicht als Glaubenssatz |
| Entscheider zuverlässig auffindbar | **ja** — Impressumspflicht als strukturelle Quelle; klare Rangfolge |
| Keine Halluzination, Quellen nachvollziehbar | **ja** — `field_provenance` je Feld, Belegzwang für das LLM, `NULL` statt Vermutung |
| Skalierbar und modular | **ja** — Stages über DB entkoppelt, Adapter austauschbar, SQLite→Postgres ohne Umbau |
| Unnötige API-Abhängigkeiten | **keine** — Standardlauf 0 € |
| Caching und Rate Limits | **ja** — in der Adapter-Basis, nicht je Quelle nachgebaut |
| Kosten | **ja** — bezifferte LLM-Obergrenze, Budget-Deckel, kostenpflichtige Quellen default aus |
| Compliance | **bedingt** — technisch sauber gelöst; die **Kanalentscheidung** liegt beim Auftraggeber (A-3) |
| Betrieb: Logging, Monitoring, Fehler, Resume, inkrementell | **ja** — je Datensatz isoliert, `runs`/`errors`/`request_log`, `--resume`, TTL-basiertes Re-Enrichment |

**Auflagen — verbindlich vor bzw. während der Umsetzung:**

- **A-1 — Kalibrierung vor Skalierung.** Der erste reale Lauf ist ein Kalibrierungslauf
  (~100 Anzeigen). White-/Blacklist, Trefferabschneidung und OSM-vs-Overture werden gemessen
  und abgenommen, bevor breit gelaufen wird. Da die BA-API in dieser Session blockiert ist,
  muss dieser Lauf in einer Umgebung mit Zugriff erfolgen.
- **A-2 — Datenabfluss ausschließen, bevor die erste Zeile Pipeline-Code entsteht.**
  `output/`, `*.db`, `cache/` in `.gitignore`; `/pipeline/*` in `netlify.toml` auf 404.
  Empfehlung: eigenes Repository — dann entfällt das Risiko vollständig.
- **A-3 — Kanalentscheidung schriftlich.** Vor dem ersten Export ist festzulegen, über welchen
  Kanal die Leads kontaktiert werden (Empfehlung: Telefon mit Sachbezug + Post +
  einwilligungsbasierte Funnels). `legal_basis` wird entsprechend gesetzt.
- **A-4 — Qualitätsschwelle.** Skalierung erst bei Company-Match ≥ 95 % und
  False-Positive-Rate ≤ 5 % in der manuellen Stichprobe.

---

## 15. FINAL RECOMMENDATION — was vor dem Coding noch zu klären ist

1. **Repository-Frage (blockierend für Schritt 1).** Eigenes Repo für die Pipeline, oder
   `pipeline/` hier mit den Schutzmaßnahmen aus A-2? Empfehlung: **eigenes Repository** —
   sauberer, und die Website bleibt garantiert das, was `BASE44-BRIEF.md` verspricht.
2. **Kanalentscheidung (A-3).** Bestimmt, welche Spalten überhaupt exportiert werden.
3. **Zielsystem.** Nur CSV, oder zusätzlich direkt nach **Close** über den bereits vorhandenen
   `lib/close.js`-Pfad? Letzteres wäre wenig Zusatzaufwand und würde Funnel-Leads und
   Outbound-Leads im selben System zusammenführen.
4. **Segmentabgrenzung.** Nur MFA, oder auch **ZFA** (Zahnmedizinische Fachangestellte, DKZ
   14704) und Tiermedizinische Fachangestellte? Eine Zeile Konfiguration, aber eine
   Zielgruppenentscheidung.
5. **Geografischer Erstumfang.** Bundesweit oder zunächst Berlin/Brandenburg? Beeinflusst
   Laufzeit und Rate-Limit-Druck, nicht die Architektur.
6. **LLM ja/nein.** Ohne LLM funktioniert alles, nur der Graubereich (~5 % der Jobs) und
   uneindeutige Impressen bleiben unbearbeitet. Mit LLM: wenige Euro pro 1.000 Leads.

**Ohne diese sechs Antworten kann Schritt 1 nicht sauber beginnen; Punkte 4–6 lassen sich
notfalls mit den dokumentierten Standardwerten (nur MFA, Berlin+50 km, LLM aus) vorbelegen.**

---

## 16. NACHTRAG ZUM LIVEGANG (2026-09-05)

Die Abschnitte 1–15 sind der Plan vom 2026-08-31. Sie bleiben unverändert stehen, damit
nachvollziehbar bleibt, was geplant war. Dieser Abschnitt hält fest, was der reale Betrieb
inzwischen ergeben hat — und was vor dem Livegang noch offen ist.

### 16.1 Die BA-API hat sich geändert: v4 → v6

Der Suchendpunkt `/pc/v4/app/jobs` antwortet nicht mehr. Die Suche läuft über
**`GET /pc/v6/jobs`**; die Details bleiben bei `/pc/v4/jobdetails/{base64(refnr)}`. Die Antwort
hat eine andere Hülle und andere Feldnamen:

| v4 | v6 |
|---|---|
| `stellenangebote[]` | `ergebnisliste[]` |
| `refnr` | `referenznummer` |
| `beruf` | `hauptberuf` |
| `arbeitgeber` | `firma` |
| `arbeitsort.{plz,ort}` | `stellenlokationen[0].adresse.{plz,ort}` |
| `arbeitsort.koordinaten.{lat,lon}` | `stellenlokationen[0].{breite,laenge}` |
| **`arbeitgeberHashId`** | **existiert nicht mehr** |

Der Client normalisiert v6 auf die v4-Form zurück, damit die nachgelagerten Stufen unverändert
bleiben. **Für den Dedup-Schlüssel gilt das nicht:** `arbeitgeberHashId` ist ersatzlos
entfallen, an seine Stelle tritt `arbeitgeberKundennummerHash`. Das ist ein *anderer* Wert für
denselben Arbeitgeber, kein umbenanntes Feld.

Zwei Folgen, die § 7.1 so nicht vorgesehen hatte:

1. **Der T1-Schlüssel ist nicht mehr flächendeckend.** Nach den Zählern des Kalibrierungslaufs
   trägt ein Teil der Anzeigen keinen Hash. Diese Datensätze fallen auf T4
   (`name_normalized` + `plz`) zurück — einen Schlüssel, den § 7.1 selbst nur mit „hoch"
   statt „exakt" bewertet.
2. **Ein Arbeitgeber kann unter zwei Schlüsseln erscheinen** — einmal mit Hash, einmal ohne.
   Genau daraus entsteht die Dublette: der Sync legt für jede Variante einen eigenen
   HubSpot-Datensatz an. Das betrifft auch aufeinanderfolgende Läufe, nicht nur eine
   einzelne Datei.

Die Property `ba_employer_hash_id` in HubSpot trägt weiterhin die Beschreibung
„arbeitgeberHashId der Bundesagentur". Das ist seit dem Wechsel falsch und gehört korrigiert,
bevor jemand anderes damit arbeitet.

### 16.2 Stand HubSpot (gemessen am 2026-09-05)

Abfrage über die CRM-Suche: **10 Companies insgesamt, davon 0 mit gesetztem
`ba_employer_hash_id`.** Die Aufräumaktion nach den Sync-Tests war also vollständig.

Das ist die gute Nachricht zur Dublettenfrage: Es gibt **keine Altbestände im alten
Schlüsselformat**, gegen die der erste echte Lauf kollidieren könnte. Der Schlüsselwechsel
v4 → v6 ist damit *jetzt* folgenlos — und nur jetzt. Nach dem ersten produktiven Sync ist
der Bestand da und jede spätere Schlüsseländerung wird teuer.

### 16.3 Deploy-Risiko R-2 ist eingetreten

§ 1.3 und Risiko R-2 haben beschrieben, was passiert, wenn aus dem falschen Verzeichnis
deployt wird. Genau das ist geschehen: Die Deploy-Logs weisen als Deploy-Pfad das
Pipeline-Verzeichnis aus, nicht das Website-Verzeichnis. `netlify deploy --prod` veröffentlicht
das aktuelle Arbeitsverzeichnis — bei `publish = "."` ohne weitere Rückfrage.

Konsequenz für die Arbeitsweise, nicht nur für die Dokumentation:

- Deploys **ausschließlich** aus dem Website-Verzeichnis, nie aus dem Pipeline-Verzeichnis.
- Vor jedem Deploy den Pfad in der Netlify-Ausgabe lesen, bevor man bestätigt.
- Die Pipeline gehört auf einen Pfad, der mit dem Website-Verzeichnis nichts gemeinsam hat.

Die `.gitignore` dieses Repos (Commit „Datenabfluss ueber das Publish-Verzeichnis
ausschliessen") schützt gegen versehentliches *Versionieren*. Gegen einen CLI-Deploy aus dem
falschen Verzeichnis schützt sie nicht — Netlify lädt hoch, was im Verzeichnis liegt, nicht,
was Git kennt.

### 16.4 Offene Punkte vor dem Livegang

| # | Punkt | Warum blockierend |
|---|---|---|
| 1 | Suchbegriffe und Blacklist in `berufe.yaml` widersprechen sich | Es wird breit gesucht und danach genau das wieder verworfen. Die Zielgruppe ist damit nicht definiert, sondern zufällig. |
| 2 | `validated: false` in `berufe.yaml` | Die Konfiguration ist als ungeprüft markiert und wird trotzdem produktiv verwendet. |
| 3 | Herkunft der angereicherten Kontaktdaten | Regel 8 und 9: keine erfundenen, keine aus Namensmustern gebildeten Adressen. Muss pro Feld nachweisbar sein, nicht plausibel. |
| 4 | Kanalentscheidung (A-3, § 7 UWG) | Ohne sie ist offen, ob die exportierten Spalten überhaupt verwendet werden dürfen. |

Punkt 1 und 2 sind Zielgruppenentscheidungen und keine technischen Fragen — sie lassen sich
nicht durch Anpassen der Tests lösen.

---

## 17. NACHTRAG: TELEFON UND WEBSITE ALS PFLICHTFELDER (2026-09-14)

Vorgabe aus dem Betrieb: Im CRM soll möglichst kein Unternehmen ohne
Telefonnummer **und** ohne Website stehen. Der folgende Abschnitt hält fest, was
dafür implementiert wurde, und — ebenso wichtig — wo die Grenze liegt.

### 17.1 Rangfolge der Telefonquellen (Stand: implementiert)

| Rang | Quelle | `mfa_phone_source` | Konfidenz |
|---|---|---|---|
| 1 | BA-Stellenanzeige | `BA_JOB_DESCRIPTION` | aus dem Anzeigentext |
| 2 | Impressum der Praxis-Website (§ 5 TMG / DDG) | `PRACTICE_IMPRESSUM` | 0,97 |
| 3 | Kontakt, Anfahrt, Sprechzeiten | `PRACTICE_CONTACT_PAGE` | 0,94 |
| 4 | „Über uns", „Team", „Unsere Praxis" | `PRACTICE_ABOUT_PAGE` | 0,90 |
| 5 | Startseite | `PRACTICE_HOMEPAGE` | 0,86 |
| — | OpenStreetMap, Adressabgleich | `OPENSTREETMAP` | 0,82–0,94 |

Rang 4 und 5 sind neu. Grund: Auf kleinen Praxisseiten nennt das Impressum
häufig nur Inhaber, Berufsbezeichnung und Aufsichtsbehörde, während die
Durchwahl ausschließlich auf „Über uns" oder im Kopf der Startseite steht. Wer
dort nicht nachsieht, verliert eine Nummer, die öffentlich dasteht.

Die Startseite steht bewusst zuletzt: Bei Praxisketten zeigt sie gern die Nummer
der Hauptfiliale. Sie wird nur ausgewertet, wenn keine der drei besseren Seiten
eine eindeutige Nummer liefert. Eine Anzeigen-Nummer wird von keiner
Website-Nummer ersetzt.

### 17.2 Der Identitätsnachweis gilt für die Domain, nicht für die Seite

Bisher musste **dieselbe Seite**, auf der die Nummer steht, auch Praxisnamen und
exakte Anzeigenadresse tragen. Für Impressen ist das erfüllt, für Team-Seiten
praktisch nie — sie wiederholen die Anschrift nicht. Die Regel lautet jetzt:

> Eine Nummer wird übernommen, wenn **irgendeine** Seite derselben Domain den
> Praxisnamen zusammen mit der exakten Straße samt Hausnummer und der PLZ aus
> der Anzeige trägt.

Stammt der Nachweis von einer anderen Seite als die Nummer, wird die Fundstelle
des Nachweises in `method` mitgeschrieben (`beleg:<URL>`) und die Konfidenz um
0,03 gesenkt. Findet sich auf der ganzen Domain kein Nachweis, wird **keine**
Nummer übernommen (`site:NotVerified`). Die Schranke gegen fremde Praxen bleibt
damit bestehen; sie greift nur eine Ebene höher.

Nebeneffekt, der eigenständig zählt: Wird die Domain der Praxis zugeordnet, aber
keine eindeutige Nummer gefunden, bleibt die **geprüfte Website** erhalten
(`WEBSITE_VERIFIED_NO_PHONE`). Dieser Fall ging vorher vollständig verloren.

### 17.3 Umfang des Abrufs

Höchstens 14 Seiten je Domain (vorher 8), abgearbeitet nach Beweiskraft:
Impressum vor Kontakt vor „Über uns" vor Startseite. Ein **gefundener** Link
schlägt bei gleichem Rang den geratenen Pfad — bei begrenztem Seitenbudget darf
nicht der Zufall der Navigation entscheiden, ob das Impressum noch drankommt.
`robots.txt` wird weiterhin gelesen und befolgt. Arztverzeichnisse und
Buchungsportale gelten nie als Firmenwebsite: Die dort angezeigte Nummer ist
häufig eine Vermittlungsnummer des Portals, und die ist im CRM schlimmer als gar
keine.

### 17.4 Was diese Änderung nicht leisten kann

Die Vorgabe „kein Unternehmen ohne Telefonnummer und Website" ist mit ehrlichen
Mitteln nicht bei 100 % erfüllbar:

- Ein Teil der Praxen **hat keine Website**. Für sie existiert keine Quelle, die
  eine liefern könnte, ohne sie zu erfinden.
- Die Telefonnummer solcher Praxen steht im Telefonbuch oder auf einem Portal.
  Portalnummern sind bewusst ausgeschlossen (§ 17.3).
- OpenStreetMap deckt nur ab, was dort eingetragen ist.

Daraus folgen zwei getrennte Stellschrauben, die nicht verwechselt werden
dürfen: **Abdeckung erhöhen** (§ 17.1–17.3) und **unvollständige Leads
zurückhalten**. Letzteres leistet `sync_hubspot.py --nur-vollstaendig`; es hält
auch Praxen zurück, die es nachweislich gibt und zu denen eine Nummer vorliegt —
nur eben keine eigene Seite. Deshalb ist es nicht der Standard.

Die Lückenliste `data/reports/*_luecken.json` benennt je Praxis, was fehlt
(`fehlt`, `web_status`). Sie ist die Arbeitsliste für das, was keine Maschine
liefern kann.

### 17.5 Messstand

Gemessen wurde bisher **ohne** die Erweiterung aus § 17.1/17.2, Lauf
`calibration-berlin-50km-mfa-20260906T182340Z-f89f1f`, 133 Leads:

| Stufe | Telefon | Website |
|---|---:|---:|
| nur BA-Anzeige | 15 (11,3 %) | 31 (23,3 %) |
| + Impressum/Kontakt | 21 (15,8 %) | 31 (23,3 %) |
| + OpenStreetMap | 43 (32,3 %) | 51 (38,3 %) |

Die Wirkung der Erweiterung auf „Über uns"/Startseite und auf den
domainweiten Identitätsnachweis ist **noch nicht gemessen**. Sie kann erst im
nächsten vollständigen Lauf beziffert werden; jede Zahl davor wäre geraten. Die
Änderung ist durch 188 Tests abgedeckt, darunter sechs neue Regressionstests für
genau diese Fälle.

---

## 18. NACHTRAG: MVZ ALS VERBUND MEHRERER PRAXEN (2026-09-14)

Ein MVZ ist ein Pool mehrerer Ärzte an mehreren Standorten. Für den Vertrieb ist
jede dieser Praxen ein eigenes Unternehmen mit eigener Telefonnummer und eigener
Adresse. Die Pipeline hat sie bis hierher zu **einer** Firma verschmolzen. Dieser
Abschnitt hält fest, warum, was dagegen unternommen wurde — und einen zweiten
Befund, der beim Nachmessen auffiel und schwerer wiegt als die MVZ-Frage selbst.

### 18.1 Der Schlüssel war der Arbeitgeber, nicht der Standort

Gruppiert wurde nach `arbeitgeberKundennummerHash`. Die Bundesagentur führt alle
Standorte eines MVZ unter **einer** Kundennummer. `build_lead` nahm anschließend
`offers[0]` — also die Adresse der zufällig ersten Anzeige. Aus fünf Praxen wurde
eine Firma mit einer Adresse und einer Telefonnummer.

Gemessen am Lauf `…20260905T171757Z-2501a6`:

| Ebene | Zahl |
|---|---:|
| Arbeitgeber mit Hash (alle Anzeigen) | 1022 |
| davon mit mehr als einer Adresse | 99 (9,7 %) |
| Leads nach MFA- und Arbeitgeberfilter, alt | 201 |
| Leads nach Trennung je Standort | 208 (**+7**) |
| zerlegte Standorte / betroffene Arbeitgeber | 12 / 6 |
| darunter MVZ | Policum, Orthodont, Zahnkultur, Doceins |

Gruppiert wird jetzt nach `hash + PLZ`. Für den CRM-Schlüssel gilt bewusst eine
asymmetrische Regel, weil `ba_employer_hash_id` die `idProperty` des
HubSpot-Upserts ist:

- **Ein Standort → blanker Hash, unverändert.** Alle bereits angelegten
  Companies bleiben zuordenbar; es entstehen keine Dubletten.
- **Mehrere Standorte → `<hash>#<plz>` je Standort.** Sonst überschreiben sie
  einander beim Upsert, und der zuletzt geschriebene Standort gewinnt.

Wer schon unter dem blanken Hash im CRM steht, hinterlässt dabei eine
Karteileiche. `data/reports/<lauf>_standorte.json` listet alten und neuen
Schlüssel, damit das nachvollziehbar von Hand bereinigt werden kann.

### 18.2 Die Nummer des richtigen Standorts

Das Impressum eines MVZ listet jede Praxis mit eigener Anschrift und eigener
Durchwahl. `practice_phone` sah dort bisher nur „mehrere gleichrangige Nummern"
und gab sicherheitshalber **gar keine** zurück — ausgerechnet bei den
Arbeitgebern mit den meisten Stellen also nie eine.

Jede Nummer wird jetzt der Postleitzahl zugeordnet, die im Text am dichtesten
bei ihr steht (Fenster 25 Zeilen; bei Gleichstand gewinnt die davorstehende,
weil die Anschrift über der Durchwahl steht). Genommen wird nur die Nummer des
gesuchten Standorts. Bleibt danach nichts oder mehr als eine übrig, gilt wieder
die alte, strenge Regel — eine falsche Nummer im CRM ist schlimmer als keine.

### 18.3 Befund: die OpenStreetMap-Stufe lief vollständig ins Leere

Beim Nachmessen der MVZ-Adressen fiel auf, dass **kein einziger Lead eine Straße
trägt**. Nachgezählt über alle gespeicherten Läufe:

> In **93.351** BA-Suchantworten kommt `arbeitsort.strasse` **kein einziges Mal**
> vor. Die v6-Suchantwort liefert ausschließlich `plz`, `ort` und `koordinaten`.

Der OSM-Abgleich verlangte aber Straße **und** Hausnummer: `adressschluessel`
gab ohne Straße `None` zurück, `finde` brach sofort ab. Die gesamte
OpenStreetMap-Stufe konnte damit strukturell keinen einzigen Treffer liefern.
Das ist kein Randfall, sondern der Ausfall einer der drei Kontaktquellen.

Die Koordinaten sind dafür brauchbar, und zwar gebäudegenau — nachgeprüft, weil
PLZ-Mittelpunkte wertlos wären: In **237 von 265** Postleitzahlgebieten
desselben Laufs treten mehrere verschiedene Koordinatenpaare auf, in einem
Gebiet bis zu 21.

Der Abgleich läuft deshalb zweistufig. Adresse zuerst, weil eine Hausnummer
eindeutiger ist als jede Entfernung; danach die Entfernung:

| `treffer_art` | Bedingung | Konfidenz |
|---|---|---|
| `adresse` | PLZ + Straße + Hausnummer eindeutig | 0,90 |
| `adresse+name` | mehrere im Haus, Name entscheidet | 0,94 |
| `strasse+name` | Straße + eindeutiger Name | 0,82 |
| `koordinaten` | genau ein Objekt ≤ 50 m, keins im Block (≤ 150 m) | 0,86 |
| `koordinaten+name` | mehrere ≤ 150 m, genau ein Namenstreffer | 0,91 |
| `naehe+name` | genau ein Namenstreffer ≤ 400 m | 0,80 |

Eine abweichende `addr:postcode` am OSM-Objekt schließt den Treffer aus. Die
Postleitzahl ersetzt die Entfernung nicht, sie bremst sie.

### 18.4 Messstand

§ 17.5 gilt unverändert: Die Wirkung der Erweiterungen auf Telefon- und
Website-Abdeckung ist **noch nicht gemessen**. Gemessen sind hier ausschließlich
die Strukturzahlen dieses Abschnitts (99/1022, 201→208, 93.351, 237/265). Die
Änderungen sind durch 201 Tests abgedeckt, darunter 13 neue für Standorttrennung,
standortgenaue Telefonauswahl und Koordinatenabgleich.

Zu beachten beim nächsten Lauf: Die Standorttrennung entsteht beim **Suchen**.
Wer nur `enrich_leads.py` laufen lässt, bekommt die Verbesserungen an Website,
Impressum und OpenStreetMap — aber jedes MVZ bleibt eine einzige Firma.

---

## 19. NACHTRAG: ZIELGRUPPE KLEINERE PRAXEN, UND EIN ECHTER LIVE-LAUF (2026-09-14)

### 19.1 Erster Live-Lauf mit dem 14.09.-Paket

Ein Lauf auf echten Daten (`calibration-berlin-50km-mfa-20260914T142738Z-c07642`)
bestätigte einen bereits dokumentierten, aber noch nicht behobenen Befund:
`max_search_requests: 120` reichte nicht. Das Budget war beim 39. von 67
Suchbegriffen (`Pflegehelfer`) aufgebraucht; **28 Berufsgruppen** — Physio-
therapie, Ergotherapie, Logopädie, Podologie, Hebammen, OTA/ATA, Rettungsdienst,
MTA/MTRA, Apotheker, PTA u. a. — wurden dadurch **überhaupt nicht durchsucht**.
`max_search_requests` steht jetzt auf 250 (67 Begriffe × bis zu ~11 Seiten je
Begriff, mit Reserve).

Ein `--live`-Aufruf ohne `--leads` brach korrekt mit „Keine Leads angegeben"
ab, bevor `HubSpotClient()` instanziiert wurde — geprüft im Code
(`scripts/sync_hubspot.py`): der Rückgabepfad liegt vor der Client-Erzeugung.
Es wurde nichts nach HubSpot geschrieben.

### 19.2 Zielgruppe: kleinere Praxen statt Kliniken und Pflegeketten

Vorgabe: Die Finanzberatung richtet sich an den Praxisinhaber persönlich.
Bei einer Klinik oder Pflegekette entscheidet strukturell eine
Personalabteilung — ein anderer Adressat, unabhängig von Kontaktdaten-Qualität.

Neuer Filter `markiere_grossanbieter()`: Ein Arbeitgeber, der über **alle**
seine Standorte zusammen **6 oder mehr** gleichzeitige MFA-relevante Anzeigen
schaltet, gilt als Großanbieter und wird nicht als Lead übertragen. Gezählt
wird über den ganzen Arbeitgeber (Summe über alle `hash_id`-Standort-Einträge
aus § 18.1), nicht je einzelnem Standort — sonst bliebe eine Kette mit vielen
kleinen Außenstellen (wenige Jobs je Adresse, viele Adressen) unauffällig,
obwohl sie in der Summe eindeutig kein kleiner Anbieter ist. Beleg aus dem
Lauf vom 14.09.: Vivantes allein hatte 46 gleichzeitige Anzeigen an einer
einzigen Postleitzahl.

Einstellbar statt fest verdrahtet:
- `--grossanbieter-ab N` ändert die Schwelle (Standard 6).
- `--ohne-groessenfilter` schaltet den Filter vollständig ab.

`data/reports/<lauf>_employers.json` führt `arbeitgeber_gesamt_jobs` und
`ist_grossanbieter` je Arbeitgeber, damit die Grenze nachvollziehbar bleibt.
Neue Report-Zeile: „Grossanbieter ausgeschlossen (Zielgruppe: kleinere
Praxen)". 7 neue Tests (`markiere_grossanbieter`), darunter der Ketten-Fall
mit vier kleinen Filialen, die einzeln unauffällig wären.

### 19.3 Telefonnummer als Pflichtfeld

Kein neuer Code nötig: `sync_hubspot.py --nur-mit-telefon` (bereits seit dem
Update vom 10.09. vorhanden) überträgt ausschließlich Praxen mit geprüfter
Telefonnummer; alles andere bleibt in der Review-Datei. Google Maps/Places als
zusätzliche Telefonquelle wurde geprüft und **abgelehnt** — kostenpflichtige
API, widerspricht der bestehenden 0-€-Vorgabe. OpenStreetMap (§ 18.3) deckt
denselben Bedarf kostenlos ab.

### 19.4 Messstand

Die Wirkung von Budget-Fix und Größenfilter zusammen auf einem vollständigen
Lauf ist **noch nicht gemessen** — der nächste Lauf beim Nutzer ist ausstehend.
207 Tests grün (pytest und `tests/run_all.py`), 20 davon neu seit § 18
(13 Standorte/OSM, 7 Größenfilter).

---

## 20. NACHTRAG: ALLE ANGABEN FÜR DIE KALTANSPRACHE (2026-09-22)

Die Mail-Automation verlangt pro Empfänger Anrede, Nachname und eine Adresse.
Die Pipeline lieferte davon keins zuverlässig: `contact_name` entstand nur aus
dem BA-Anzeigentext (2,8 % Abdeckung im Lauf vom 14.09.), eine Anrede gab es
gar nicht, und die E-Mail wurde bewusst **nicht** an den Kontakt gehängt, wenn
sie generisch war. Vorgabe: Website, E-Mail und Inhaber sind Pflicht.

### 20.1 Der Crawl lief bei den besten Leads gar nicht

`enrich_web` brach ab, sobald die BA-Anzeige eine Telefonnummer enthielt
(`NOT_NEEDED_JOB_PHONE`). Solange nur die Telefonnummer zählte, war das eine
sinnvolle Ersparnis. Für die Mailkampagne kehrt es sich um: Genau die Praxen
mit der aussagekräftigsten Anzeige wären nie im Impressum nachgeschlagen worden.

Jetzt entscheidet, was **fehlt** (`coldmail_luecken`). Liegen alle vier Angaben
vor, wird nichts abgerufen; fehlt eine, wird die Website besucht. Eine belegte
Anzeigen-Telefonnummer wird dabei nie durch eine Website-Nummer ersetzt — dafür
gibt es einen eigenen Regressionstest.

### 20.2 Rangfolge — Fundstelle vor Rolle

```
Impressum  >  Kontakt  >  Karriere  >  Über uns / Team  >  Startseite
Inhaberin/Inhaber  >  Geschäftsführung  >  Praxisleitung  >  Ärztin/Arzt
```

Das Impressum steht oben, weil § 5 DDG die vertretungsberechtigte Person dort
verlangt — eine Pflichtangabe wiegt schwerer als eine Team-Seite. Steht kein
Inhaber da, wird eine Ärztin oder ein Arzt genommen. Ausgeschlossen bleiben
dauerhaft: die Agentur aus dem Impressum, Datenschutzbeauftragte, Steuerberatung
und Aufsichtsbehörde — alles Rollen, die im Impressum stehen und nicht die
Zielgruppe sind. Karriereseiten (`/karriere`, `/jobs`, `/stellenangebote`) sind
neu im Crawl, Limit 18 Seiten je Praxis.

### 20.3 Die Anrede wird nicht geraten

| Beleg | Konfidenz |
|---|---:|
| „Frau"/„Herr" steht im Text | 0,99 |
| weibliche Rollenform („Inhaberin", „Zahnärztin") | 0,97 |
| männliche Rollenform („Inhaber: Dr. Thomas Meier") | 0,90 |

Aus dem **Vornamen** wird nichts abgeleitet. Eine Namensliste liegt bei rund
jedem zehnten Namen daneben, und eine falsche Anrede ist in einer Erstansprache
teurer als eine fehlende. Fehlt der Beleg, bleibt das Feld leer und der Lead
gilt als nicht anschreibbar.

Offen bleibt die männliche Rollenform: Manche Praxen schreiben „Inhaber"
generisch auch für eine Frau. Deshalb 0,90 statt 0,97, die Konfidenz steht im
Datensatz, und wer nur sichere Anreden will, filtert auf ≥ 0,97.

### 20.4 Regel bewusst geändert: generische Adresse geht an den Kontakt

Bisher kam `info@praxis.de` nicht an den Contact — info@ ist die Praxis, nicht
die Person. Für die Kaltansprache ist das die falsche Bremse: In einer
Einzelpraxis liest genau die gemeinte Person dieses Postfach, und ohne Adresse
gibt es keine Mail. Der Schutzgedanke wandert in die Kennzeichnung:
`mfa_email_typ` hält fest, ob es eine persönliche oder eine allgemeine Adresse
ist. Bewerbungspostfächer (`bewerbung@`) stehen im Rang hinter `info@`, weil sie
bei der Personalstelle landen — sie bleiben aber zulässig, weil sie die Praxis
erreichen.

### 20.5 Messstand

Struktur und Regeln sind durch 233 Tests abgedeckt (25 neu), darunter die
Fälle, die schiefgehen: Agenturadresse aus dem Impressum, Nachname in der
E-Mail-Domain, Satzgrenze zwischen „Frau Wagner." und „Dr. Meier", Straße als
vermeintlicher Name. Die **Abdeckung** der vier Pflichtfelder auf echten Daten
ist noch nicht gemessen — dafür fehlt ein Lauf mit `--kein-cache`.

### 20.6 Nachtrag: Zuständigkeit und Leadstatus (2026-09-22)

Vorgabe: Neue Unternehmen sollen der Firma zugeordnet sein und den Leadstatus
„neu" bekommen. Im Portal (146821371) nachgesehen statt geraten:

- Es existiert **genau ein** Owner (Benedict Hintz). „Zugeordnet" heißt damit
  `hubspot_owner_id`.
- Ein Firmendatensatz „Finanz-Medizin" existiert nicht (nur ein Testsatz), eine
  Marken- oder Business-Unit-Property ebenfalls nicht. Eine Parent-Company-
  Verknüpfung schied damit aus.
- `hs_lead_status` kennt den Wert `NEW` („New").

Die Owner-ID steht **nicht** im Code — sie gehört dem Portal. Ermittelt wird
sie zur Laufzeit über `/crm/v3/owners/`: `HUBSPOT_OWNER_EMAIL` aus der Umgebung,
sonst der einzige aktive Owner. Gibt es mehrere und keine Vorgabe, bleibt das
Feld leer, statt einen zu raten.

**Die Schutzregel wurde dabei nicht aufgegeben, sondern verschoben.** Bis heute
standen `lifecyclestage` und `hs_lead_status` gemeinsam in `NEVER_WRITE`, weil
das Portal eigene Vertriebsstufen führt (S1, S2, Investment, KAI, Immo). Für
`hs_lead_status` ist das Verbot aufgehoben, der Schutz sitzt jetzt eine Ebene
tiefer: Die Property steht in `FILL_IF_EMPTY_COMPANY`, wird also nur gesetzt,
solange das Feld im CRM leer ist. Ein Lead auf „Connected" oder „Bad Timing"
wird von keinem Lauf zurückgesetzt; dasselbe gilt für eine geänderte
Zuständigkeit. Ein Regressionstest hält genau das fest.

`lifecyclestage` bleibt unverändert gesperrt.

### 20.7 Nachtrag: der Engpass ist die Website (2026-09-22)

Erster vollständiger Lauf mit der Impressum-Auswertung, 209 Leads:

| Stufe | Wert |
|---|---:|
| Ansprechpartner **vorher** | 6/209 (2,9 %) |
| Ansprechpartner **nachher** | 38/209 (18,2 %) |
| Inhaber/Arzt zugeordnet | 33/209 (15,8 %) |
| davon mit Anrede | 25/209 (12,0 %) |
| **anschreibbar** | **23/209 (11,0 %)** |

Die Extraktion funktioniert — sie versechsfacht die Ansprechpartner. Der
Engpass liegt davor: **127 von 209 Praxen haben keine Website**, und ohne
Website gibt es kein Impressum, also weder Inhaberin noch Adresse. Von den 82
mit Website wurden 33 zu einem Namen.

Gegenmaßnahme: Die Domain einer bekannten E-Mail wird als Website-**Kandidat**
geprüft (86 Leads haben eine E-Mail). Die Regel „keine Website aus einer
E-Mail-Domain ableiten" bleibt dabei in Kraft und wird nicht gebrochen — die
Domain ist kein Ergebnis, sondern eine Adresse zum Nachsehen. Ob daraus eine
Website wird, entscheidet dieselbe Schranke wie bei jeder anderen Quelle:
Praxisname UND exakte Anzeigenadresse müssen dort stehen. Verifiziert sie sich
nicht, wird nichts übernommen. Freemail-Domains sind ausgeschlossen, weil
t-online.de nicht der Praxis gehört.

Für den zweiten Engpass — 33 Personen aus 82 Websites — liegt noch keine
Ursachenanalyse vor. `scripts/diagnose_coldmail.py` zählt dafür den Trichter
und die Fehlerursachen; ohne diese Zahlen wäre jede weitere Änderung ein
Schuss ins Blaue.

---

## §21 Der zweite Engpass, gemessen (2026-09-22)

Die Ursachenanalyse aus §20.7 liegt jetzt vor. `diagnose_coldmail.py` auf dem
Lauf `calibration-berlin-50km-mfa-20260914T150510Z-f0312f`:

| Befund | Fälle |
|---|---:|
| `site:NotVerified` | **33** |
| `anrede:KeinBeleg` | 8 |
| `person:NichtGefunden` | 6 |
| `page:UnicodeEncodeError` | 4 |
| `page:gaierror` | 4 |
| `email:NichtGefunden` | 3 |
| `page:RobotsDisallowed` / `ValueError` / `RemoteDisconnected` / `URLError` | je 1 |

Die Rechnung geht auf: 82 Websites − 33 verworfen = 49, davon −6 ohne Person,
−8 ohne Anrede, −3 ohne E-Mail = 33 Personen (§20.6). Der Engpass ist damit
benannt, und er war hausgemacht.

### §21.1 `site:NotVerified` — ein Beleg, den wir hatten und wegwarfen

Die Schranke verlangte, dass Praxisname **und** exakte Anzeigenadresse auf der
Domain stehen, bevor von dort irgendetwas übernommen wird. Sie wurde für
*geratene* Kandidaten gebaut — E-Mail-Domain, Suche — und dort ist sie richtig.

Sie wurde aber auch auf Adressen angewandt, die der Arbeitgeber **in seiner
eigenen BA-Stellenanzeige veröffentlicht** hat (Herkunft `BA_JOB_DESCRIPTION`,
§9). Das ist keine Fremdzuschreibung, sondern die Aussage des Arbeitgebers über
sich selbst. Der Nachweis war da; er wurde verworfen und ein zweiter verlangt.

Warum der zweite so oft scheiterte, zeigen die Beispiele: Die Praxis tritt unter
einem Markennamen auf. Die Anzeige nennt „Augen- und Laserzentrum Berlin MVZ
GmbH", die Seite heißt `smileeyes.de` und schreibt nirgends den Firmennamen aus.
Dazu kommt die Adresse: Die Anzeige trägt die PLZ des *Arbeitsorts*, das
Impressum die des *Firmensitzes* — bei einem MVZ regelmäßig verschieden (§17).

Geändert: Die Herkunft des Kandidaten wird mitgeführt. Stammt die URL aus der
Anzeige, ist die Domain damit zugeordnet. Die Herkunft sagt ehrlich, worauf der
Beleg beruht, und die Konfidenz unterscheidet beide Wege:

| Beleg | `method` | Konfidenz |
|---|---|---:|
| Name + exakte Anzeigenadresse auf der Seite | `verified_company_name_and_exact_job_address` | 0,97 |
| URL aus der BA-Anzeige des Arbeitgebers | `published_by_employer_in_ba_job_ad` | 0,93 |

Findet sich unterwegs doch der Seitenbeleg, löst er den Anzeigenbeleg ab und
hebt die Konfidenz. **Für geratene Kandidaten ändert sich nichts** — ohne
Herkunft aus der Anzeige bleibt es bei der alten Schranke. Zwei Tests halten
das fest (`test_geratene_domain_braucht_weiterhin_den_nachweis_auf_der_seite`,
`test_fremde_website_aus_frueherem_lauf_belegt_nichts`).

### §21.2 Eine gesperrte Startseite riss die ganze Domain mit

Die Standardpfade (`/impressum`, `/kontakt`, …) wurden erst **nach** einem
geglückten Abruf der Startseite in die Warteschlange gelegt. Schlug der fehl —
403 hinter einer Bot-Sperre ist bei Praxisseiten der Normalfall —, lief die
Warteschlange leer und das Impressum wurde **nie versucht**, obwohl es
ausgeliefert worden wäre. Genau das steht in den Beispielen: dreimal
`page:HTTPError` und Schluss.

Geändert: Die Saat liegt von Anfang an in der Warteschlange, mit einem Aufschlag
(`SAAT_ABSCHLAG = 5`), der größer ist als jeder echte Rang. Damit kommt die
Startseite weiterhin zuerst und jeder echte Link vor jedem geratenen Pfad — nur
reißt ein Fehlschlag die Domain nicht mehr mit. Der Aufschlag ist nötig: Ohne
ihn drängte sich `/impressum` (Rang 0+1) vor die Startseite (Rang 4), was ein
bestehender Test sofort aufdeckte.

Außerdem trägt der Befund jetzt den Statuscode (`page:HTTP403` statt
`page:HTTPError`). 403 und 404 sind verschiedene Probleme.

### §21.3 `UnicodeEncodeError` — an unserer eigenen Anforderung gescheitert

`clean_url` kodierte den Host nach IDNA, ließ den **Pfad** aber roh. Die
Anfragezeile von `http.client` wird als ASCII kodiert, also brach jeder Link mit
Umlaut ab. Betroffen war ausgerechnet `/über-uns` — die Seite, die nach §17
eigens aufgenommen wurde, weil dort die Inhaberin steht. Pfad und Query werden
jetzt prozentkodiert; `%` bleibt sicher, damit bereits kodierte URLs nicht
doppelt kodiert werden.

### §21.4 `gaierror` — dieselbe Seite, ein Label daneben

Wer `praxis-beispiel.de` in der Anzeige nennt, aber nur
`www.praxis-beispiel.de` im DNS führt, meint dieselbe Seite. Löst der Host nicht
auf, wird einmal die Variante mit bzw. ohne `www.` geprüft. Löst auch die nicht
auf, bleibt der ursprüngliche Fehler stehen — es wird nichts beschönigt.

### §21.5 Die Anrede hält keinen Lead mehr auf

Pflicht waren laut Vorgabe **Inhaber und E-Mail**. Die Anrede als dritte Pflicht
war eine Zutat von mir, und sie hielt 8 Leads auf, zu denen Name und Adresse
belegt vorlagen und nur das grammatische Geschlecht nirgends stand.

Sie wird weiter erfasst, weiter gesucht (`braucht_website_besuch` fragt danach,
obwohl sie nichts mehr blockiert) und getrennt ausgewiesen. **Aus einem Vornamen
wird sie nach wie vor nicht geraten** — „Andrea" ist im Deutschen meist
weiblich, im Italienischen männlich; ein Test hält das fest. Wer nur persönlich
adressierte Leads will, filtert mit `--nur-mit-anrede`.

### §21.6 Was das bringt — und was davon noch nicht gemessen ist

Gemessen ist bisher nur die Ursache, nicht die Wirkung. Deterministisch ist
allein §21.5: Die 8 an der Anrede gescheiterten Leads haben Name und E-Mail und
sind damit anschreibbar. Für §21.1 gilt: Von den 33 verworfenen Domains passiert
jetzt die Schranke, wessen URL aus der Anzeige stammt — ob daraus auch Person
und E-Mail werden, entscheidet erst der Lauf. Dasselbe für §21.2 bis §21.4.

Der nächste `enrich_leads.py`-Lauf misst es. Vorher wird hier keine Zahl
behauptet.

### §21.7 „Alle Kontakte kontaktierbar" — was erreichbar ist und was nicht

Die Vorgabe lautet, alle Kontakte kontaktierbar zu machen. Vollständig ist das
nicht erreichbar, und es ist ehrlicher, das vorher zu sagen als es nachher zu
erklären: Ein erheblicher Teil der Zielgruppe — kleine Einzelpraxen, Podologie,
Logopädie — hat **keine Website und keine veröffentlichte Mailadresse**. Es gibt
dort nichts zu finden, weil nichts publiziert wurde. Keine Technik ändert das.

Was der Lauf vom 2026-09-14 tatsächlich hergibt:

| Kanal | Leads |
|---|---:|
| Telefon | 90 |
| E-Mail | 86 |
| beides | 53 |
| **Telefon ODER E-Mail** | **123 / 209 (58,9 %)** |
| weder noch | 86 |

Die 123 sind die realistische Obergrenze für morgen, nicht 209. Bisher
verdeckte die Auswertung diese Zahl: Sie wies „anschreibbar" (21) und „Telefon
+ Website" (63) aus, aber nie die Vereinigungsmenge — also genau das, was
„kontaktierbar" heißt.

Deshalb neu: `sync_hubspot.py --nur-kontaktierbar` überträgt jeden Lead mit
Telefon **oder** E-Mail und hält nur die zurück, die über keinen Kanal
erreichbar sind. Das ist der breiteste Filter, der noch sinnvoll ist — ein
Datensatz ohne beides ist im CRM eine Karteileiche. Die Zusammenfassung weist
die Zahl ab sofort getrennt aus.

Die Stufen von breit nach eng:

| Schalter | Kriterium | Zweck |
|---|---|---|
| `--nur-kontaktierbar` | Telefon ODER E-Mail | überhaupt erreichbar |
| `--nur-mit-telefon` | geprüftes Telefon | Telefonvertrieb |
| `--nur-anschreibbar` | E-Mail UND Nachname | Mailkampagne |
| `--nur-mit-anrede` | zusätzlich belegte Anrede | persönliche Ansprache |

---

## §22 Was der Probelauf zutage brachte (2026-09-22)

Der erste vollständige `sync_hubspot.py --dry-run` über alle 209 Leads hat
etwas gezeigt, das keine der bisherigen Auswertungen sichtbar gemacht hatte.
Er hätte **34 Kontakte angelegt — mindestens 10 davon waren keine Menschen**:

```
Zeitpunkt der Verlinkung     Rechte Dritter          Diese Feststellung
Einhaltung der Bestimmungen  Bei von Rechtsverletzungen    Herzlich Willkommen
Die Ergotherapie             Ärztekammer Berlin      Herr Dr
```

Alle mit `jobtitle=Inhaberin/Inhaber`. Es sind Bruchstücke aus dem
Haftungsausschluss, der wortgleich in fast jedem deutschen Impressum steht:
„Zum **Zeitpunkt der Verlinkung** waren keine Rechtsverstöße erkennbar", „Bei
Bekanntwerden von **Rechtsverletzungen**".

### §22.1 Die Ursache: ein Namenszusatz zu viel

`_VORSATZ` in `personen.py` listete `der` und `den` als eigenständige
Namenszusätze. Damit passte **jedes** Muster „⟨Großwort⟩ der ⟨Großwort⟩" auf
`_NAME_RE` — Vorname „Zeitpunkt", Zusatz „der", Nachname „Verlinkung".

Derselbe Fehler kostete umgekehrt echte Namen: Die Kette „von der" war nicht
abgedeckt, `name_aus_fragment("Ursula von der Leyen")` gab `None` zurück. Ein
Zusatz, der zu viel erfand und das Richtige nicht erkannte.

Korrigiert: `der`/`den` nur noch als Kette hinter `von`/`van`. Beides ist jetzt
richtig herum, und ein Test hält beide Richtungen fest.

### §22.2 Zwei weitere Sperren

Der Wortschatz des Haftungstextes (`zeitpunkt`, `verlinkung`, `bekanntwerden`,
`einhaltung`, `bestimmungen`, `rechtsverletzung`, `urheberrecht`, …) steht
jetzt in `_KEIN_NAME_RE`. Dazu eine Regel gegen Satzanfänge: Ein Fragment, das
mit Artikel, Pronomen, Präposition oder Adverb beginnt, ist ein Satz und kein
Name — „Die Ergotherapie", „Diese Feststellung", „Bei Bekanntwerden".

Institutionswörter greifen jetzt auch im Kompositum (`\w*kammer`,
`\w*vereinigung`, `\w*verband`). Vorher stand `kammer` mit Wortgrenze davor in
der Liste und ließ „Ärztekammer Berlin" als Person durch. Ein echter Nachname,
der so ein Wort *enthält*, bleibt gültig — „Kathrin Kammermeier" wird erkannt,
weil die Sperre nur greift, wenn das Wort dort endet.

### §22.3 Was noch offen ist — Domains von Nachbarbetrieben

Im selben Probelauf fällt eine zweite Klasse von Fehlern auf, die **nicht**
behoben ist:

| Lead | übernommene Domain |
|---|---|
| Dr. Sabine Hirschmann & Dr. Jan Schnell (Arztpraxis) | `apotheke-in-drewitz.de` |
| MVZ Hämatologie Onkologie Tempelhof | `tempeldent.de` (Zahnarzt) |
| Arona Zahnzentrum Berlin | `therapie-warth.de` |
| Dr. med. Carsten Zarling | `brunnen-apotheke-ludwigsfelde.de` |
| MVZ Nierenzentrum am Treptower Park | E-Mail `info@dsa-marketing.ag` |

Das sind Nachbarbetriebe und Dienstleister, keine Praxen. Solange diese Leads
`UNRESOLVED` bleiben, wird von der Domain nichts Inhaltliches übernommen — das
Feld `domain` wandert aber trotzdem ins CRM.

Das ist zugleich eine Warnung an §21.1: Die dortige Lockerung erkennt die URL
aus der BA-Anzeige als Beleg an. Die Zeile Hirschmann zeigt, dass eine
Anzeigen-URL **nicht immer** dem Arbeitgeber selbst gehört. Die Lockerung
bleibt, weil sie 33 belegte Fälle rettet, aber sie ist keine Gewissheit — die
Konfidenz 0,93 gegenüber 0,97 sagt genau das, und `mfa_email_quelle` nennt bei
jedem Datensatz die Seite, auf der es stand. Vor der ersten Mailwelle gehören
die Adressen mit auffälliger Domain durchgesehen.

## §23 E-Mails für den Bestand in HubSpot (2026-09-23)

Aufgabe: Zu allen Unternehmen, die schon im Portal stehen, die E-Mail-Adresse
heraussuchen und eintragen. Künftig bringt die Pipeline sie selbst mit; der
Bestand hat sie nie bekommen.

### §23.1 Was im Portal steht — gemessen, nicht geschätzt

| | |
|---|---:|
| Unternehmen gesamt | 482 |
| davon mit `mfa_email` (vorher) | 0 |
| aus dieser Pipeline (`ba_source` gesetzt) | 113 |
| aus dem älteren Praxis-Import | 369 |
| mit Domain, ohne E-Mail | 377 |
| davon zusätzlich mit PLZ **und** Straße | 358 |
| ohne jede Domain | 105 |

Der Import ist besser, als er aussah: Er bringt Name, Straße, PLZ, Ort, Domain
und Telefon mit. Genau diese vier Angaben — Name, Straße, PLZ, Domain —
braucht `matches_practice`, um eine Seite einer Praxis zuzuordnen. Für 358
Datensätze ist der volle Beweis also möglich, ohne irgendetwas zu raten.

### §23.2 Kontakte sind keine Quelle

Naheliegender Gedanke: Die E-Mails stehen vielleicht schon an den zugehörigen
Kontakten. Gemessen: Im **gesamten** Portal gibt es 55 Kontakte mit E-Mail,
und das ist das private und berufliche Netzwerk des Inhabers, keine Praxis.
Genau zwei Adressen stammen überhaupt aus dem Praxisumfeld. Diese Spur ist
damit erledigt — nicht „vermutlich dünn", sondern nachgezählt tot.

### §23.3 Was ohne Netz ging: 12 Adressen aus den Anzeigen selbst

Der Kalibrierungslauf hatte 12 Adressen, die der Arbeitgeber **selbst in seine
BA-Stellenanzeige geschrieben** hat. Stärker kann ein Beleg nicht sein: Der
Arbeitgeber hat sie veröffentlicht, die Fundstelle ist die Anzeige, ihre URL
steht mit im Datensatz. Alle 12 Unternehmen waren im Portal, keines hatte eine
E-Mail. Eingetragen mit `mfa_email`, `mfa_email_typ` und `mfa_email_quelle`
(der Anzeigen-URL). Zwölf von zwölf, keine Fehlschläge.

Bei drei von ihnen steht im CRM aus dem unabhängigen Import dieselbe Domain
wie in der Adresse (`my-kinderarzt.de`, `kinderwunschteam.berlin`,
`policum.berlin`) — zwei getrennte Quellen, die sich bestätigen. Eine weicht
ab: `Immanuel MVZ Barnim` hat die Konzerndomain `bernau.immanuel.de`, die
Adresse lautet auf `immanuelalbertinen.de`. Das ist kein Widerspruch, sondern
die Personalabteilung des Trägers — aber es ist der Fall, bei dem man beim
Anschreiben zweimal hinsieht.

### §23.4 `scripts/mails_aus_hubspot.py`

Liest Unternehmen mit Domain und ohne `mfa_email` aus HubSpot, baut daraus
einen Lead und schickt ihn durch dieselbe Anreicherung wie jeden anderen. Die
Beweislast bleibt unverändert: Übernommen wird nur, was auf einer Seite steht,
die sich selbst dieser Praxis zuordnet. Ohne Beleg bleibt das Feld leer.

Drei Entscheidungen, die den Unterschied machen:

**Die Domain-Suche ist abgeschaltet.** Beim Lauf über die BA-Anzeigen ist sie
nötig, weil dort meist gar keine Website bekannt ist. Hier steht die Domain
schon im Datensatz. Würde zusätzlich gesucht, käme die Nachbar-Domain-Gefahr
aus §22.3 zurück — nur diesmal in einen Datensatz hinein, der bereits im CRM
gepflegt wird, wo also niemand mehr nachvollziehen kann, woher die Adresse
stammt. `--auch-suchen` schaltet sie zu; der Beleg bleibt auch dann Pflicht.

**Geschrieben wird nur in leere Felder.** Diese Datensätze sind nicht von der
Pipeline angelegt worden; was dort steht, hat ein Mensch eingetragen. Eine von
Hand gepflegte Adresse gewinnt immer (`--ueberschreiben` hebt das auf, die
`website` bleibt auch dann geschützt).

**Ohne PLZ wird übersprungen, nicht geraten.** `matches_practice` verlangt eine
fünfstellige PLZ; fehlt sie, kann gar nicht geprüft werden. Solche Datensätze
werden gemeldet statt ohne Beweis befüllt.

### §23.5 Die Falle, die fast alles lautlos verschluckt hätte

HubSpot speichert in `domain` den blossen Hostnamen: `praxisname.de`, ohne
Schema. `clean_url` verlangt aber `http` oder `https` und ergänzt von sich aus
nur vor `www.` etwas. Ohne die Umsetzung in `als_url()` wäre **jeder**
Datensatz als „ohne Domain" übersprungen worden: Das Skript wäre durchgelaufen,
hätte keinen Fehler geworfen und hätte nichts getan. Ein Testlauf hätte es
nicht gezeigt — nur ein leerer Bericht am Ende, den man für ein schlechtes
Ergebnis hält statt für einen Defekt. Der Test
`test_blosse_domain_aus_hubspot_wird_zur_adresse` hält das fest.

`clean_url` selbst bleibt unangetastet. Sie schützt an vielen anderen Stellen
davor, dass ein beliebiges Textstück als Adresse durchgeht.

### §23.6 Warum der Lauf auf dem Mac stattfindet

Der Container, in dem dieser Teil entwickelt wurde, kommt nicht ins offene
Netz: Die Egress-Richtlinie beantwortet jedes CONNECT mit 403 — geprüft mit
der `Fetcher`-Klasse der Pipeline selbst, mit dem Abrufwerkzeug der Umgebung
und gegen zwei Praxisdomains sowie Wikipedia. Das ist eine Richtlinie, keine
Störung; sie wird gemeldet, nicht umgangen. Gecrawlt wird deshalb lokal.

### §23.7 Nebenbefund: der Testlauf ohne pytest war rot

`tests/run_all.py` — der einzige Testlauf, der ohne pytest auskommt und damit
auf einem frisch eingerichteten Rechner der einzige überhaupt mögliche — kannte
die Vorrichtung `monkeypatch` nicht und meldete zwei Tests als Fehler. Zwei
dauerhaft rote Tests sind dort schlimmer als gar keiner: Man gewöhnt sich
daran, dass am Ende „2 gescheitert" steht, und der nächste echte Fehlschlag
fällt nicht mehr auf. Nachgebaut ist jetzt genau das, was die beiden Tests
benutzen: `setattr` mit Rückbau. Beide Läufe stehen auf 263/263.

## §24 Der Namensfilter greift zu spät (2026-09-23, Probelauf)

Der Probelauf nach §22 zeigte: Von 42 Kontakten, die der Sync angelegt hätte,
waren **13 keine Menschen**, sondern Satzteile aus Praxisseiten — "Ihren
Hausarzt", "Zurück zur Startseite", "Zuständige Aufsichtsbehörden",
"Personenbezogene Nutzerprofile", "Google Analytics", "Berlin Steglitz",
"Mit Sina", "Eingeschränkte Verfügbarkeit", "Herr Dr". Die Sorte hat sich
gegenüber §22 geändert, die Menge kaum.

### §24.1 Warum der Filter aus §22 sie durchließ

`_SATZANFANG_RE` prüft den **Anfang** des Textstücks. `_NAME_RE.search` greift
aber irgendwo **darin** zu. Aus "Fragen Sie bitte Ihren Hausarzt" wird so die
Person "Ihren Hausarzt": Das Fragment beginnt mit "Fragen", der Filter
schweigt, und das Wortpaar in der Mitte sieht aus wie Vor- und Nachname.

Geprüft wird jetzt **jeder Namensteil einzeln** (`_ist_namensteil`), nicht mehr
nur der Satzanfang: Funktionswörter und Pronomen, Anreden und Titel allein,
Berufs- und Rollenbezeichnungen, Einrichtungen und Seitenbestandteile, die
Ortsnamen der Zielregion, sowie abstrakte Substantive auf -ung/-heit/-keit ab
acht Zeichen Länge (die Längengrenze schützt "Jung" und "Hartung").

### §24.2 Was der Filter kostet

Seltene echte Nachnamen wie "Arzt", "Leiter" oder "Berlin" gehen verloren. Das
ist der günstigere Fehler: Ein fehlender Kontakt fällt beim nächsten Lauf
wieder an, ein erfundener steht für immer im CRM und wird eines Tages
angeschrieben.

Gemessen an den Namen aus dem Probelauf: 16 von 16 Textbrocken abgewiesen,
14 von 14 echten Ansprechpartnern erhalten — "Ursula von der Leyen" und
"Sabine Hartung" eingeschlossen. Beide Listen stehen als Testdaten in
`tests/test_personen.py`.

### §24.3 Nebenbefund: die Anrede stand im Namen

"Inhaber: Frau Dr. med. Andrea Meier" ergab die Person "Frau Dr" — der
Suchlauf griff beim ersten Wortpaar zu und war fertig. Eine vorangestellte
Anrede wird jetzt abgeschnitten, bevor der Name gelesen wird. Sie geht nicht
verloren: Belegt wird sie ohnehin aus der Zeile, nie aus dem Namen.
