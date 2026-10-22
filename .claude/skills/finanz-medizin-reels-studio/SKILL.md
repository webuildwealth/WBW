---
name: finanz-medizin-reels-studio
description: Produziert fertige Instagram Reels (MP4, 1080x1920, 30 fps, H.264/AAC) für die Marke Finanz-Medizin (Finanzwissen für Ärzte, MFA, ZFA, Praxisinhaber). Nutze diesen Skill, wenn der Nutzer ein Reel, Instagram-Video, Short oder Wissensvideo zu Altersvorsorge, Geldanlage, Versicherungen (BU), Steuern, Praxisfinanzen oder Mitarbeiterbenefits möchte - als Thema ("Erstelle ein Reel über 3 Fehler bei der BU"), als fertiges Skript, oder als unbearbeitetes Sprechvideo (Talking Head), das vollautomatisch transkribiert, geschnitten, freigestellt und mit passenden Einblendungen versehen wird. Formate - Tipps, Fehler, Mythos vs. Fakt, Aha-Fakten, Checklisten, Vergleiche. Liefert Video, Untertitel (SRT), Storyboard, QA-Bericht.
---

# Finanz-Medizin Content Reels Studio

Automatisiertes Reels-Studio: **Thema/Skript → recherchiertes, faktengeprüftes Skript → Storyboard → animierte Szenen → Sprache, Untertitel, Sounddesign → MP4 + QA**. Stil und Regeln stammen aus der analysierten Referenz (`references/reference-style.md`), Optik aus dem Corporate Design der Website (`references/brand-guide.md`).

## Wann welcher Modus
| Modus | Eingabe | Vorgehen |
|---|---|---|
| **1 Thema → Reel** | „Erstelle ein Reel über …" | Schritte 1–7 unten |
| **2 Skript → Reel** | fertiger Text | Text **nicht inhaltlich verändern**; nur in Szenen gliedern (Schritt 3), Zahlen/Aussagen prüfen und Auffälligkeiten melden, nicht still ändern |
| **3 Rohvideo → Reel (Talking Head)** | unbearbeitetes Sprechvideo | **`python3 scripts/talking_head.py <video> --out <dir>`** – vollautomatisch, kein JSON (siehe `references/talking-head.md`). Danach Schritte 6–7 unten. |

## Workflow Modus 3 (Talking Head)
1. `python3 scripts/talking_head.py <rohvideo> --script <skript> --out <dir> --plan-only` (Skript optional, verbessert Schreibweisen) → `<dir>/plan.md` lesen: Transkript, erkannte Struktur, jede Einblendung mit Begründung.
2. Plan fachlich prüfen (Zahlen aus dem Transkript stimmen? Begriffe korrekt erkannt?). Nur wenn nötig `<dir>/plan.json` anpassen (Texte, Typen, `image`-Overlays mit generierten/lizenzierten Bildern) – das erledigt Claude, nicht der Nutzer.
3. `python3 scripts/talking_head.py <rohvideo> --script <skript> --out <dir>` (bzw. `--plan <dir>/plan.json` bei Anpassungen; Transkript/Analyse werden aus `<dir>/work` wiederverwendet).
4. `qa-report.md` + 4–6 Frames ansehen (Gesicht frei? Plakate sichtbar? Captions synchron?), dann übergeben.

## Workflow (Modus 1)
1. **Fachlich analysieren & recherchieren.** Format wählen (`references/content-formats.md`). Zeitabhängige Fakten (Grenzen, Sätze, Freibeträge, Tarife, Rechtsstand) mit aktueller Quelle belegen (Websuche). Unbelegbares **nicht** behaupten. Rechenbeispiele selbst nachrechnen (Python). Zielgruppe festlegen (Angestellte / Praxisinhaber / MFA).
2. **Hook & Skript** nach `references/storytelling.md` (Hook ≤ 9 Wörter, Zahl/Gegensatz; Wortbudget ~2,2 Wörter/s; Ziffern schreiben; Rechtsrahmen beachten – keine Einzelempfehlung, keine Produktnennung).
3. **Storyboard schreiben** (JSON, Schema unten): je Gedanke eine Szene, Szenentyp nach Entscheidungstabelle in `content-formats.md`. Startpunkt: passende Datei aus `templates/storyboards/`. Elemente über `cue` an Wörter des `vo` binden.
4. **Gestaltung prüfen** (schnell, ~10 s): `python3 scripts/build_reel.py <sb>.json --out <dir> --stills 1,5,9,…` und die PNGs in `<dir>/stills/` ansehen (Lesbarkeit, Überlauf, Safe-Zones).
5. **Bauen:** `python3 scripts/build_reel.py <sb>.json --out <dir>` (≈ 90–120 s für 50 s Video; ruft am Ende `qa.py` auf).
6. **QA auswerten:** `<dir>/qa-report.md`. FAIL beheben. Danach `contactsheet.jpg` und 3–5 Frames ansehen und `references/quality-checklist.md` (manuell) abhaken.
7. **Übergabe:** `<slug>.mp4`, `captions.srt`, `storyboard.json`/`timeline.json` (editierbar, `rerender.sh`), `voiceover.wav`, `poster.jpg`, Instagram-Caption (`meta.instagramCaption`), Quellenliste. **Transparent melden:** TTS-Stimme ist Platzhalter; was nicht automatisch prüfbar war.

## Storyboard-Schema (Kurzform)
```jsonc
{ "meta":  { "title", "slug", "format": "A-F", "fps": 30, "instagramCaption", "sources": [..], "brandFooter": true },
  "voice": { "provider": "pico", "speed": 1.12 },       // pico | espeak; je Szene "audio": "datei.wav" für eigene Stimme
  "music": "bed",                                        // bed | none | Pfad zu lizenzierter Musik
  "scenes": [{
     "id": "…", "type": "hook|tip|error|myth|fact|stat|bars|compare|checklist|outro",
     "vo": "Sprechtext (Ziffern erlaubt)", "spoken": "optional abweichender TTS-Text (gleiche Wortzahl!)",
     "captions": false, "hi": ["Wort"], "minDur": 6, "lead": 0.12, "tail": 0.45,
     "data": { …typabhängig…, "x": { "t": "Text", "cue": "Wort im vo", "untilCue": "…" } },
     "sfx": [{ "name": "ding", "cue": "Wort" }]
  }] }
```
Text-Auszeichnung: `*Akzent*`, `_Serif-Kursiv_`, `~durchgestrichen~`. `cue` = Wort/Wortfolge im `vo` (`Wort@2` = 2. Vorkommen); nicht gefunden → Build bricht mit Klartext ab. Alle Datenfelder je Szenentyp: siehe Vorlagen und `templates/components.js` (Kopfkommentare der Komponenten).

## Dateien
- `references/` – Style DNA, Formate, Storytelling, Brand, Schnitt/Ton, QA
- `templates/` – `brand.css` (Tokens), `components.js` (Grafik-/Animations-Bibliothek), `storyboards/` (Formate A–F, lauffähig)
- `engine/` – `scene.html`/`engine.js` (zeitgesteuerter Renderer), `render_frames.js` (Playwright → FFmpeg, parallel)
- `scripts/` – `build_reel.py` (Modus 1/2), **`talking_head.py`** (Modus 3: `asr.py` Transkription, `script_align.py` Skript-Abgleich, `vision.py` Crop/Freistellung/Tracking, `planner.py` Szenenplanung + Layout), `tts.py`, `align.py`, `sfx.py`, `qa.py`, `rough_cut.py`, `setup.sh`, `package.sh`
- `templates/overlays.js` – Talking-Head-Overlays (Hook, Titel+NR, Plakat, 21 Illustrationen, Zahl, Ring, Balken, Mythos/Fehler/Tipp, Sticker, VS, CTA, Typo, Bild)
- `engine/th.html`, `engine/th.js` – Ebenen-Renderer (hinter/vor der Person)
- `assets/` – Marken-Schriften (Manrope, Inter, Newsreader) und Markenzeichen
- `examples/` – komplettes Test-Reel (Storyboard, Vorschau, QA-Bericht)

## Voraussetzungen (`scripts/setup.sh` prüft/installiert)
`ffmpeg` (libx264, aac) · `node` ≥ 18 + `playwright` mit Chromium · `python3` + `numpy`, `scipy` · TTS: `pico2wave` (apt `libttspico-utils`) · **Modus 3:** `sherpa-onnx`, `mediapipe`, `opencv-python-headless` (pip), `libegl1 libgles2` (apt); Modelle (~510 MB) werden beim ersten Lauf geladen (GitHub-Releases k2-fsa/sherpa-onnx, storage.googleapis.com/mediapipe-models).
Ohne Chromium/Playwright ist **kein Rendern** möglich → dann Storyboard + Timeline + Audio liefern (`--no-render`) und fehlende Schritte benennen.

## Grundsätze
- Visualisierung **erklärt** (Wachsen/Schrumpfen/Vergleichen), sie dekoriert nicht. Keine Stockvideos, keine fremden Medien; Ton und Grafik werden selbst erzeugt.
- Fachliche Korrektheit vor Tempo: lieber differenzieren („teilweise wahr“) als vereinfachen.
- Keine Beratung ersetzen; Disclaimer im Outro nie entfernen.
