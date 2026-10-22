# TALKING-HEAD-EDITOR (Modus 3, vollautomatisch)

Ein Befehl, kein JSON:
```bash
python3 scripts/talking_head.py mein_rohvideo.mov --out out/reel-01
```
Optionen: `--zoom subtle|strong|off` · `--music none|bed|<lizenzierte Datei>` · `--no-cut` · `--plan-only` (stoppt nach der Planung, `plan.md` lesen) · `--plan plan.json` (geprüften Plan verwenden).

## Pipeline
| # | Schritt | Technik | Ergebnis |
|---|---|---|---|
| 1 | Transkription | sherpa-onnx + NVIDIA **Parakeet TDT 0.6B v3** (offline, Deutsch, Satzzeichen, Token-Zeitstempel) | `work/words_raw.json` |
| 2 | Jump-Cuts | Pausen > 0,45 s zwischen Wörtern entfernen (0,12 s Vorlauf, 0,18 s Nachlauf, 12-ms-Audio-Fades) | `work/cuts.json`, neu getaktete Wörter |
| 3 | 9:16-Smart-Crop | BlazeFace auf 12 Stichproben → Ausschnitt um das mediane Gesicht; Hochkant 9:16 bleibt unverändert | `work/proxy.mp4` 1080×1920@30 |
| 4 | Analyse | 5 fps: Gesicht (geglättet) + Personen-Belegung (Selfie-Multiclass, Raster 40 px) | `work/analysis.npz` |
| 5 | Planung | `planner.py`: Sätze → Struktur (Hook, Listen, Kategorien) → Visual-Auswahl mit Begründung → Zooms → Layout | `plan.json`, `plan.md` |
| 6 | Freistellung | 30 fps, Zoom pro Abschnitt, Matte mit Guided Filter an Haar-/Schulterkanten, zeitliche Glättung | `work/base.mp4`, `work/matte.mp4`, `work/track.json` |
| 7 | Overlays | Chromium rendert zwei transparente Ebenen: **back** (hinter der Person) und **front** (davor + Untertitel) | `work/back.mov`, `work/front.mov` |
| 8 | Ton | Stimme: Hochpass, leichte Rauschminderung, Kompressor; SFX je Einblendung; optional Musik mit Ducking; −14 LUFS | `work/mix.wav` |
| 9 | Composite | Video → back → **freigestellte Person** → front | `<name>_reel.mp4`, `captions.srt`, `poster.jpg` |
| 10 | QA | Technik, Lautheit, **Gesicht frei (gegen gemessenes Tracking)**, Sichtbarkeit hinterer Elemente, Vielfalt, Abdeckung, Caption-Sync | `qa-report.md` |

## Inhaltserkennung (deutsch, regelbasiert)
| Erkannt an | Kategorie | Visual (Kandidaten, Score) |
|---|---|---|
| erster Satz | Hook | Wort-für-Wort-Typo, Zahlen/Eigennamen in Serif-Kursiv + Akzent (DNA R1) |
| „Nummer 3", „Tipp 2", „erstens", „zu guter Letzt", Eigennamen-Satzanfang nach angekündigter Anzahl („Fünf Bücher …") | Listen-Element | Titel + NR-Badge oben (DNA R3/R7) + **Titel-Plakat hinter der Person** (DNA R5) |
| Mythos, „viele glauben", „stimmt nicht" | Mythos | Mythos-Karte mit Stempel (Falsch / Mythos?) |
| Fehler, falsch, vermeide | Fehler | rote Fehlerkarte mit Schütteln |
| zwei Zahlen gleicher Einheit | Vergleich | Mini-Balkendiagramm |
| eine Zahl (€, %, Jahre; auch Zahlwörter „zweihundertfünfzig") | Kennzahl | Count-up-Zahl bzw. Prozent-Ring |
| „A vs./oder/statt B" | Gegenüberstellung | VS-Leiste |
| Tipp, solltest, achte, prüfe | Tipp | blaue Tipp-Karte |
| unglaublich, wichtig, Lieblings…, niemals | Betonung | Sticker am Kopf |
| Fachbegriff im Lexikon (Rente, BU, Steuer, ETF, Inflation, Praxis …) | Motiv | eigene Illustration hinter der Person (21 Motive) |
| folgen, speichern, kommentieren (am Ende) | CTA | CTA-Pille mit Markenzeichen |

**Keine starren Layouts:** Pro Satz bis zu zwei Kandidaten. Derselbe Typ wie bei den letzten zwei Overlays wird abgewertet, große Elemente wechseln die Seite (links/rechts), Plakate rotieren Farbtöne. Die Position berechnet der Layout-Solver für jedes Overlay aus dem tatsächlichen Bild.

## Layout-Solver (Gesicht frei)
- **Gesicht:** Vereinigung der Gesichtsboxen im Einblendungsfenster plus 10 % Rand gilt als harte Sperrzone. Vordere Elemente, Hook und Titel dürfen sie nie schneiden.
- **Vordere Elemente:** höchstens 18 % Überdeckung mit der Person.
- **Hintere Elemente:** höchstens 45 % verdeckt, da die Person darübergelegt wird. Das erzeugt den Tiefeneffekt der Referenz (Cover hinter dem Sprecher).
- **Instagram-Zonen:** oben ab y 226, Caption-Zone ab y 1236 frei, rechte Button-Spalte ab x 960 ab y 900 frei.
- **Keine Kollision:** zeitgleiche Overlays überlappen sich nicht. Bewertet werden Größe, Belegung, gewünschte Lage und Seitenwechsel.

## Bilder
- **Eingebaut, lizenzfrei:** 21 SVG-Illustrationen (`templates/overlays.js`, `FM.ILLUSTRATIONS`) und typografische Plakate. Fremde Cover/Logos werden bewusst **nicht** verwendet (Urheber-/Markenrecht).
- **Eigene Bilder:** Overlay-Typ `image` (`data.src`, optional `credit`), z. B. über `--plan` eingebunden.
- **Recherche/Generierung:** In dieser Umgebung sind Bild-APIs (Openverse, Wikimedia) netzseitig gesperrt. Innerhalb einer Claude-Sitzung kann Claude ein Bild mit einem verfügbaren Bildgenerator erzeugen bzw. ein lizenziertes Bild beschaffen, als `image`-Overlay in `plan.json` eintragen und mit `--plan` rendern.

## Grenzen
- Die Klassifikation ist regelbasiert. Ironie und indirekte Formulierungen werden nicht verstanden. Abhilfe: `--plan-only`; Claude prüft `plan.md` und passt den Plan an.
- Die Matte stammt aus einem 256×256-Modell plus Guided Filter. Feine Haare und schnelle Handbewegungen können ausfransen. Hintergrund-Elemente deshalb nicht hinter wehenden Haaren platzieren.
- Ein Gesicht wird vorausgesetzt (Einzelsprecher). Mehrere Personen werden nicht unterschieden.
- Rechenzeit (4 CPU-Kerne): ≈ 6–8 Minuten pro Minute Video, Hauptanteil Freistellung und Ebenen-Rendering.
