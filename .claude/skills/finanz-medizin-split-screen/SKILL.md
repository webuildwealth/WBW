---
name: finanz-medizin-split-screen
description: >-
  FINANZ-MEDIZIN SPLIT-SCREEN EXPLAINER STUDIO – macht aus einem Sprechervideo (oder nur einem Skript) ein Instagram-Reel
  im Split-Screen: oben animierte visuelle Erklärung (Figuren, Zahlen, Diagramme, Mythen-Karten), unten der Sprecher,
  mit Jump-Cuts, Untertiteln, Sounddesign und Marken-Design Finanz-Medizin (Rot/Blau/Weiß). Nutzen bei Anfragen wie
  „Erstelle daraus ein Split-Screen-Erklärvideo“, „Reel aus meinem Video“, „Storyboard/Visualisierung zu diesem Skript“,
  „Instagram Reel für Finanz-Medizin“, „Split-Screen“, „Erklärvideo Altersvorsorge/BU/Inflation“.
---

# FINANZ-MEDIZIN SPLIT-SCREEN EXPLAINER STUDIO

Du arbeitest als **Regisseur + Cutter + Motion Designer**. Die Scripts in `scripts/` rendern, prüfen und montieren deterministisch –
**die kreative Entscheidung (was wird zu welchem Satz gezeigt) triffst du** und schreibst sie als `story.json`.

**Lies zuerst `references/status.md`** (was ist implementiert/getestet/offen) und sage dem Nutzer ehrlich, was du tatsächlich produziert hast
(fertiges Reel ≠ Vorschau ohne Sprecher ≠ nur Storyboard).

## Bildsprache-Vorgabe von Finanz-Medizin (verbindlich)
- **Personen immer als echte Fotos** (realistische Menschen/Gesichter), nie als Comic-/Zeichentrickfigur – sonst wirkt der Kanal unseriös.
  Ablauf je Person: eigene Fotobibliothek `assets/photos/` → fotorealistisches KI-Foto → lizenzfreie Fotosuche.
  Dieselbe Person durchgängig: gleiche Bildbeschreibung (Alter, Geschlecht, Rolle), jung→alt per Überblendung (`image` mit `src2`).
- **Zahlen, Diagramme, Zeitstrahlen, Vergleiche, Mythos-Karten dürfen generierte Grafik bleiben.**
- Die gezeichnete Figur (`character`) ist nur noch **Notfall-Platzhalter**, wenn keine Fotoquelle erreichbar ist – das wird im Lauf als
  WARNUNG gemeldet und muss dem Nutzer gesagt werden; ein solches Reel nicht als final ausgeben.
- Rechte: Erkennbare echte Menschen in Werbung brauchen eine Model-Freigabe. CC-Fotos (Openverse/Wikimedia) regeln nur das Urheberrecht,
  nicht das Persönlichkeitsrecht → für Personen bevorzugt **KI-generierte Fotos** oder Stockfotos mit Model Release (eigene Lizenz, in
  `assets/photos/` ablegen, Nachweis in gleichnamiger `.txt`). Keine realen Prominenten/Kunden/Patienten.

## Modi
| Modus | Eingabe | Ergebnis |
|---|---|---|
| **A** Rohvideo → Reel | Sprechervideo | Transkription, Schnitt, Storyboard von dir, Render, Mix, `reel.mp4` |
| **B** Skript + Rohvideo | beides | wie A; Skript dient der Textkorrektur/Zahlenprüfung, Sync folgt der echten Sprache |
| **C** Skript → Storyboard | nur Skript | `story.json`, Stills, Vorschau-Reel mit Sprecher-Platzhalter (Wortzeiten geschätzt) |

## Mac-Workflow (Claude-Desktop-App, Standard für Finanz-Medizin)
Ordner `~/Videos/FinanzMedizin/` mit `original/` (iPhone-Originale per AirDrop mit „Alle Fotodaten“), `skripte/` (Transkripte als .txt,
z. B. `3 Altersvorsorge.txt`), `fotos/` (eigene lizenzierte Personenfotos), `arbeit/`, `fertig/`. Einmalig: `bash scripts/mac_setup.sh`.

Auftrag des Nutzers, z. B. **„Schneide original/IMG_1234.MOV, Skript 3, CTA-Wort ‚Vorsorge‘“** → ausführen:
```bash
~/Videos/FinanzMedizin/.venv/bin/python .claude/skills/finanz-medizin-split-screen/scripts/reel.py original/IMG_1234.MOV --skript 3 --cta Vorsorge
```
Dann als Regie-Stufe 2 `arbeit/IMG_1234/qc/contact.png` + `story.auto.json` prüfen, ggf. verbessern und mit
`build_reel.py --video … --transcript … --storyboard arbeit/IMG_1234/story.json --out-dir arbeit/IMG_1234 --cta …` neu rendern, Ergebnis nach
`fertig/IMG_1234_reel.mp4` kopieren. iPhone-HDR (HLG/Dolby Vision, HEVC, 10 Bit, 60 fps, 4K) wird automatisch nach SDR/H.264/30 fps umgewandelt.
Ergebnis: `fertig/IMG_1234_reel.mp4`, `_qc.md`, ggf. `_bildnachweise.txt` (für die Caption). Dem Nutzer berichten, welche Szenen
Platzhalter enthalten (WARNUNG-Zeilen) – Reel mit Zeichenfiguren nicht als final ausgeben.

## Ablauf (Modus A/B) – ein Befehl, kein JSON
```bash
S=.claude/skills/finanz-medizin-split-screen
python3 $S/scripts/setup_check.py                                   # Voraussetzungen
python3 $S/scripts/build_reel.py --video roh.mp4 --transcript transkript.txt --out-dir out/   # alles automatisch → out/reel.mp4 + out/qc/
```
Der Nutzer liefert **Rohvideo + Transkript**. Automatisch: Transkription (faster-whisper; Schreibweise aus dem Transkript übernommen – ohne Modell werden die Transkript-Wörter auf die Sprechpausen verteilt, Näherung ±0,6 s) → Schnitt (Pausen, Füllwörter, Zoom-Cuts) → **Storyboard** (`auto_storyboard.py`:
Claude-API, wenn `ANTHROPIC_API_KEY` gesetzt; sonst regelbasierter Regisseur) → Zahlenprüfung (fehlerhafte Szenen werden durch neutrale
Titelkarten ersetzt, nie verfälscht) → Render → Sounddesign → Montage → QC.

**Wenn du (Claude) den Skill in einer Session ausführst, bist du die Regie-Stufe 2:** nach dem automatischen Lauf `out/story.auto.json` und
`out/qc/contact.png` ansehen und gezielt verbessern – v. a. Titelkarten ohne echte Bildidee durch eigene **`svg`-Illustrationen** (Ebenen mit
`draw/pop/up`, Parallax `depth`, Kamerafahrt) oder durch Bilder ersetzen, dann `build_reel.py --video roh.mp4 --storyboard out/story.json`.
Der Nutzer muss dafür nichts tun.

Optionen: `--images search` (lizenzfreie Fotos, Openverse/Wikimedia, Nachweise → `out/credits.txt`), `--images generate` (KI-Bilder per
`OPENAI_API_KEY`), `--engine rules|claude`, `--review` (nach Storyboard-Stills anhalten), `--words words.json` (vorhandenes Transkript),
`--face-x/--face-y`, `--auto-light`, `--ratio 0.667`, `--music pfad.mp3|none`.

### Bilder – Quellen und Voraussetzungen
| Quelle | Wie | Voraussetzung |
|---|---|---|
| Eigene Illustrationen (Szenentyp `svg`, Figuren, Diagramme) | Claude zeichnet je Aussage | keine – funktioniert offline |
| Lizenzfreie Fotos | `image_search.py` (nur CC0/PDM/CC BY/CC BY-SA, Nachweis automatisch) | Hosts `api.openverse.org`, `commons.wikimedia.org`, `upload.wikimedia.org` (+ Bildhosts) freigeben |
| KI-Bildgenerierung | `image_gen.py` (OpenAI Images) oder in der Session Canva-Connector `generate-image` | `OPENAI_API_KEY` + Host `api.openai.com` bzw. Canva-Download-Host für volle Auflösung |
| Transkription | faster-whisper | Host `huggingface.co` (+ `cdn-lfs.huggingface.co`, `*.xethub.hf.co`) für den einmaligen Modell-Download |

## Ablauf (Modus C)
`python3 $S/scripts/build_reel.py --storyboard story.json --out-dir out/` → `out/preview_ohne_sprecher.mp4`, `out/storyboard.resolved.json`, `out/qc/`.
Später mit echter Aufnahme **dasselbe `story.json`** mit `--video` erneut laufen lassen – die `at`-Anker richten die Bilder an der echten Sprache aus.

## Deine Regie-Aufgabe (Kern)
1. Transkript/Skript lesen → Kernaussage in einem Satz → Beats (ein Gedanke = eine Szene).
2. Je Beat den passenden Szenentyp wählen (Tabelle in `visual-storytelling.md`), Figur/Ort konsistent halten (`doc` altert, `env` wechselt).
3. **Zahlen**: nur aus Skript, freigegebener Annahme (`assumptions`) oder Rechnung (`derived`). `storyboard.py check` muss grün sein. Nicht erfundene Werte verwenden;
   Annahmen dem Nutzer nennen („Ich habe 3.200 € Rente als Beispiel angenommen – freigeben?“).
4. Anker `at` setzen, Tempo inhaltlich wählen (kein starres Raster), Callouts/Warn/Badge für zusätzliche Veränderungen.
5. Erst `--still-only`, Bilder **ansehen** (Read auf PNG), korrigieren; dann Voll-Render; `out/qc/contact.png` ansehen und `references/quality-checklist.md` abhaken.
6. Dem Nutzer berichten: Pfade der Dateien, was automatisch geprüft wurde, was manuell zu prüfen bleibt (Compliance, Annahmen, Musiklizenz).

## Layout-Standard
Hochformat 1080 × 1920, **oben Visualisierung / unten Sprecher, 50:50** (Referenz: 2/3 : 1/3 → `--ratio 0.667`). Details, Safe-Zones, Untertitel: `references/split-screen-layout.md`.

## Marken
Navy `#0C2C4F`, Rot `#A5293B`/`#751524`, Elfenbein/Weiß; Manrope + Newsreader Italic. Aus dem Website-Design-System übernommen: `references/brand-guide.md`.

## Dateien
| Pfad | Inhalt |
|---|---|
| `references/style-dna.md` | gemessene/geschätzte Stilanalyse des Referenzvideos |
| `references/visual-storytelling.md` | Regeln Sprache → Bild, Storyboard-Schema |
| `references/split-screen-layout.md` | Geometrie, Safe-Zones, Untertitel |
| `references/animation-guide.md` | Props aller Szenen, Easing, Übergänge, Sound |
| `references/brand-guide.md` | Farben, Schriften, Tonalität, Compliance |
| `references/quality-checklist.md` | automatische + manuelle Prüfung |
| `references/status.md` | Implementierungsstand (implementiert / getestet / benötigt Tools / offen) |
| `templates/engine.html, engine.js` | Render-Engine (Figuren, Umgebungen, Szenentypen, Untertitel); `story-template.json` Startvorlage |
| `assets/` | Markenschriften (woff2), Logo/Mark; Figuren und Hintergründe sind in der Engine als Vektor-Code hinterlegt |
| `scripts/` | `build_reel.py` (Orchestrator), `transcribe.py`, `cut_speaker.py`, `storyboard.py`, `render_top.py`, `sfx.py`, `compose.py`, `qc.py`, `setup_check.py`, `selftest.py`, `package_skill.sh` |
| `examples/` | Storyboards A (Altersvorsorge), B (BU-Mythos), C (Inflation), D (Szenenkatalog) + `demo/*.mp4` Vorschauen |

## Nicht tun
- Nicht behaupten, ein Reel sei fertig, wenn nur Storyboard/Vorschau ohne Sprecher existiert.
- Keine Zahlen, Renditen oder Tarifaussagen erfinden; keine Personen/Marken imitieren; keine Medien ohne Lizenz.
- Sprecher nicht künstlich verändern (kein Face-Retouching, keine Stimm-Veränderung); Schnitte dürfen die Aussage nicht verfälschen – bei Füllwort-/Wiederholungs-Schnitten Transkript gegenlesen.
