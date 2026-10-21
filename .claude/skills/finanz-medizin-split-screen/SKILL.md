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

## Modi
| Modus | Eingabe | Ergebnis |
|---|---|---|
| **A** Rohvideo → Reel | Sprechervideo | Transkription, Schnitt, Storyboard von dir, Render, Mix, `reel.mp4` |
| **B** Skript + Rohvideo | beides | wie A; Skript dient der Textkorrektur/Zahlenprüfung, Sync folgt der echten Sprache |
| **C** Skript → Storyboard | nur Skript | `story.json`, Stills, Vorschau-Reel mit Sprecher-Platzhalter (Wortzeiten geschätzt) |

## Ablauf (Modus A/B)
```bash
S=.claude/skills/finanz-medizin-split-screen
python3 $S/scripts/setup_check.py                                            # Voraussetzungen
python3 $S/scripts/build_reel.py --video roh.mp4 --out-dir out/              # 1) transkribieren + schneiden
#   → out/transcript.txt (bereinigt), out/edited.mp4, out/edited.words.json (neue Zeitachse)
#   2) DU schreibst out/story.json (Regeln: references/visual-storytelling.md, Props: references/animation-guide.md)
python3 $S/scripts/build_reel.py --video roh.mp4 --storyboard out/story.json --out-dir out/ --still-only   # Vorschau-Stills prüfen!
python3 $S/scripts/build_reel.py --video roh.mp4 --storyboard out/story.json --out-dir out/              # Voll-Render → out/reel.mp4 + out/qc/
```
- Ohne Whisper-Modell: Transkript anderweitig besorgen (`transcribe.py --from-srt|--from-json`) und mit `--words words.json` übergeben.
- Gesicht wird automatisch gesucht; sonst `--face-x 0.5 --face-y 0.35`. Zu dunkles Video: `--auto-light`. Anderes Verhältnis: `--ratio 0.667`.
- Eigene Musik: `--music pfad.mp3` (nur lizenziert!), keine: `--music none`; Standard ist ein generiertes Platzhalter-Pad.

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
