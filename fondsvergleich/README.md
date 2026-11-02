# Fondsvergleich · H&H Finanzstrategie

Internes Beratungswerkzeug: **ETF-Depot gegen bis zu drei Fondspolicen** (Brutto- oder
Nettotarif), gerechnet nach den drei Hebeln **Kosten, Steuer und Ablaufleistung**.
Gestaltung nach H&H Finanzstrategie (Schwarz, Papier, Gold; Playfair Display + Jost,
selbst gehostet). Kein Build-Schritt, keine externen Aufrufe.

Aufruf: `/fondsvergleich/` (lokal: `python3 -m http.server` im Repo-Stamm, dann
`http://localhost:8000/fondsvergleich/`). Die Seite steht auf `noindex` (Meta-Tag,
`X-Robots-Tag` in `netlify.toml`, `robots.txt`).

Der Ordner ist in sich geschlossen und lässt sich 1:1 ins Repo `hh-finanzstrategie`
kopieren.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Seite: Kunde → Produkte → Ergebnis → Hebel → Auszahlphase → Szenarien → Rechenweg |
| `engine.js` | Rechenkern, reine Funktionen, läuft auch in Node (`require`) |
| `fondsvergleich.js` | Oberfläche, Zustand (im Browser gespeichert), Diagramme |
| `fondsvergleich.css` | Gestaltung inkl. Druckfassung (PDF-Bericht über „PDF-Bericht“ → Als PDF speichern) |
| `tarife.js` | Tarifdaten, **erzeugt** von `notion_sync.py` |
| `notion_sync.py` | Holt die Tarife aus Notion und schreibt `tarife.js` |
| `fonts/` | Playfair Display, Jost (aus `hh-finanzstrategie/assets/fonts`) |

## Tarife aus Notion

Quelle ist die Notion-Seite **„Versicherungs-Tarifvergleich – WBW / finanz-medizin“**,
Datenbank **„Tarife“**. Übernommen werden die Sparten Fondsgebundene RV, Private Rente,
Basisrente und bAV, sofern der Status nicht „Veraltet“ ist.

```bash
export NOTION_TOKEN=secret_…          # interne Notion-Integration, mit der Seite geteilt
python3 fondsvergleich/notion_sync.py --dry-run
python3 fondsvergleich/notion_sync.py
```

**Stand 02.11.2026:** Die Datenbank „Tarife“ ist noch leer. Police 1 rechnet deshalb mit
der *Referenzannahme* aus dem Notion-Rechenmodell (α 2,5 %, β 5 %, γ 0,3 %, TER 0,2 %).
Das ist **kein realer Tarif** und ist im Rechner auch so gekennzeichnet. Für eigene
Angebote gibt es „Eigene Werte aus dem Angebot“.

**Empfehlung für die Notion-Datenbank:** Drei Spalten ergänzen, damit der
Ablaufleistungshebel aus Fakten rechnet. Das Skript liest sie automatisch mit:
`Rentenfaktor (€ je 10.000 €)`, `Stückkosten (€ p.a.)`, `Honorar (€)`.

## Rechenmodell

Geprüft am Referenzbeispiel aus Notion (200 €/Monat, 30 Jahre, 6 %, α 2,5 %, β 5 %,
γ 0,3 %, TER 0,2 %):

| Kennzahl | Notion | Rechner |
|---|---|---|
| Ablaufleistung ohne Kosten | ≈ 195.900 € | 195.851 € |
| Ablaufleistung mit Kosten | ≈ 162.100 € | 162.145 € |
| Rendite nach Kosten / RIY | 4,94 % / 1,06 % | 4,94 % / 1,06 % |
| Guthaben nach 3 Jahren | ≈ 6.260 € | 6.262 € |

- **Police:** Sparanteil = Beitrag − β·Beitrag − α-Kosten/60 (Monat 1–60) − Stückkosten/12,
  Wachstum mit Bruttorendite − γ − TER, Beiträge vorschüssig. Nettotarif: Das Honorar kommt aus
  demselben Budget und senkt in den Ratenmonaten den Beitrag.
- **Depot:** gleicher Fonds (TER), Order- und Depotkosten, Vorabpauschale jährlich
  (Basiszins × 0,7, gedeckelt auf den Wertzuwachs, Zukäufe anteilig), Steuer aus dem Depot bezahlt.
- **Steuer Kapital:** Depot mit Abgeltungsteuer und 30 % Teilfreistellung. Police mit 15 %
  Teilfreistellung, bei 12/62 Halbeinkünfte zum Grenzsteuersatz, sonst Abgeltungsteuer.
- **Auszahlphase:** Police-Rente = Ablaufleistung ÷ 10.000 × Rentenfaktor, versteuert mit dem
  Ertragsanteil. Depot mit Entnahmeplan bis zum Planungsalter, Steuer auf den Gewinnanteil
  jeder Entnahme. Break-even = Alter, bis zu dem das Depot dieselbe Netto-Rente zahlt.

Bewusste Vereinfachungen (auch im Rechner genannt): Grenzsteuersatz statt Progression, kein
Soli auf die ESt im Ruhestand, keine KV/PV auf Renten, keine Vorabpauschale in der Entnahme,
keine Garantien oder Überschüsse.

## Offen

- **Abgleich mit fonder (app.fonder-vergleiche.de):** Die Domain ist in der Cloud-Umgebung
  gesperrt, und `/beratung` braucht einen Login. Für einen 1:1-Abgleich die Domain in den
  Netzwerkeinstellungen freigeben oder 2–3 Beispielrechnungen (Eingaben + Ergebnisse,
  gern als PDF-Bericht) bereitstellen. Danach Abweichungen in Rechenweg und Aufbau angleichen.
- **Basiszins** für die Vorabpauschale jährlich prüfen (BMF, Januar). Voreinstellung 2,53 %.
- Erweiterungen, die fonder laut Website anbietet: Basisrente/Rürup und das
  Altersvorsorgedepot ab 2027. Erst einbauen, wenn die gesetzlichen Parameter feststehen.
