# Fondsvergleich · H&H Finanzstrategie

Internes Beratungswerkzeug: **ETF-Depot gegen bis zu drei Fondspolicen** (Brutto- oder
Nettotarif), gerechnet nach den drei Hebeln **Kosten, Steuer und Ablaufleistung**, dazu
**Versorgungslücke, Kapitalbedarf und Sparrate**.
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
| `index.html` | Seite: Kunde → Bedarf → Produkte → Ergebnis → Hebel → Auszahlphase → Szenarien → Rechenweg |
| `engine.js` | Rechenkern, reine Funktionen, läuft auch in Node (`require`) |
| `tests.html` | Tests des Rechenkerns, im Browser öffnen |
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
  Fondswechsel realisieren den aufgelaufenen Gewinn, gleichmäßig über die Laufzeit verteilt.
- **Persönlicher Steuersatz:** Tarif § 32a EStG 2026 mit Soli (Freigrenze, Milderungszone) und
  Kirchensteuer. Grundlage ist die steuerpflichtige gesetzliche Rente (Besteuerungsanteil nach
  Rentenbeginn, fester Rentenfreibetrag, abzüglich KV/PV und Pauschbeträgen). Gezählt wird die
  Mehrsteuer durch die Erträge. Der Tarif wächst mit dem eingestellten Satz. Manuell überschreibbar.
- **Steuer Kapital:** Depot mit Abgeltungsteuer und 30 % Teilfreistellung. Police mit 15 %
  Teilfreistellung, bei 12/62 Halbeinkünfte zum persönlichen Satz, sonst Abgeltungsteuer.
- **Auszahlphase:** Police-Rente = Ablaufleistung ÷ 10.000 × Rentenfaktor, versteuert mit dem
  Ertragsanteil. Entnahmeplan für Depot und Police: feste Netto-Entnahme, Gewinnanteil je Jahr
  besteuert, im Depot zusätzlich die Vorabpauschale. Break-even = Alter, bis zu dem das Depot
  dieselbe Netto-Rente zahlt.
- **Bedarf:** Lücke = Wunsch (mit Inflation) − Netto aus gesetzlicher Rente. Kapitalbedarf = Barwert
  der mit der Inflation steigenden Lücke bis zum Planungsalter. Sparrate = Kapitalbedarf ÷ Endwert
  eines monatlich vorschüssigen Sparplans. Beides vor Steuern auf Erträge.
- **Rentenschätzung:** Entgeltpunkte (Einkommen bis zur BBG ÷ Durchschnittsentgelt × Jahre)
  × Zugangsfaktor × Rentenwert.

Werte Stand 2026: Grundfreibetrag 12.348 €, Basiszins 3,20 %, Rentenwert 42,52 €,
Durchschnittsentgelt 51.944 €, BBG RV 101.400 €, Soli-Freigrenze 20.350 €, KVdR Ø 12,35 %
(7,3 + 1,45 + 3,6). In `engine.js` unter `STAND` jährlich pflegen.

Bewusste Vereinfachungen (auch im Rechner genannt): Ruhestandseinkommen nur aus gesetzlicher
Rente und den Erträgen dieses Vergleichs, Partnereinkommen nicht berücksichtigt, keine KV/PV auf
Entnahmen, keine Günstigerprüfung im Depot, keine Garantien oder Überschüsse.

## Quellen des Rechenwegs

Der Rechenweg ist aus Gesetz, öffentlichen Rechengrößen und dem Notion-Rechenmodell aufgebaut.
Tarifdaten kommen nur aus Versichererangeboten und der eigenen Notion-Datenbank.

## Offen

- **Basiszins** und `STAND` jährlich prüfen (BMF, Januar).
- Basisrente/Rürup und das Altersvorsorgedepot ab 2027: Erst einbauen, wenn die gesetzlichen
  Parameter feststehen.
