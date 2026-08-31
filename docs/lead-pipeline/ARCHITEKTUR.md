# MFA-Lead-Sourcing-Pipeline — Analyse, Architektur und Review

**Status:** Planungsdokument (Phase 1–19). **Es wurde noch kein Pipeline-Code implementiert.**
**Datum:** 2026-08-31
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
| **`arbeitgeberHashId`** | **stabile Arbeitgeber-Identität — der beste Dedup-Schlüssel überhaupt** |
| `arbeitgeberKundennummerHash` | Logo-Abruf, zusätzlicher Identitätsanker |
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
| T1 | `ba_employer_hash` (`arbeitgeberHashId`) | exakt, BA-eigene Identität |
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
