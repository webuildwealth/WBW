# EDITING GUIDE (Schnitt, Animation, Ton, Export)

## Rhythmus
- Hook 2,5–3,5 s. Danach neue visuelle Information **alle 6–9 s**, innerhalb einer Szene alle 1–2 s ein Element (Cue).
- Szenenlänge = Sprechdauer + `lead` 0,12 s + `tail` 0,45 s (dicht wie die Referenz). `minDur` nur, wenn Animation länger braucht.
- Szenenwechsel: Ausgang 0,14 s (Fade + 40 px Hub), Eingang durch Komponenten-Intro; SFX-Whoosh 60 ms *vor* dem Wechsel.
- Dezenter Schiebezoom 1,0 → 1,035 pro Szene (Leben im Standbild, keine „Kamerafahrt“).
- Elemente erscheinen **mit dem ersten Wort**, das sie erklärt (`cue`), nicht davor.

## Animationstiming (Frame-genau, 30 fps)
| Element | Dauer | Easing |
|---|---|---|
| Karte rein | 0,5 s | outBack (c=1,0), 160 px Hub, Opacity 2× schneller |
| Text-/Zeilen-Reveal | 0,4 s | outCubic, 24–44 px Hub, optional Blur 8–10 px |
| Hook-Wort | 0,32 s | outCubic, Blur 10 px |
| Count-up | bis zum Zielwort (`untilCue`), sonst 1,6 s | outCubic |
| Balken | 0,7 s | outCubic, 0,5 s versetzt (oder Cue) |
| Haken zeichnen | 0,35 s | inOutCubic (Strichlänge) |
| Stempel | 0,28 s | outBack, Scale 2 → 1, Rotation −8°, Kartenschütteln 0,25 s |
| Flip Mythos→Fakt | 0,55 s | inOutCubic, rotateY 180° |
| Caption-Pop | 0,11 s | outBack, Scale 0,88 → 1 |
Regeln: nie mehr als **3 gleichzeitig bewegte Elemente**; Zahlen immer tabellarisch (`tabular-nums`); Animation = Erklärung (Wachsen = Zunahme, Schrumpfen = Verlust).

## Untertitel
Wort-für-Wort-Chunks: **max. 2 Wörter, ≤ 16 Zeichen**, Satzzeichen beenden den Chunk. Mindestdauer 0,14 s. Luft < 0,25 s wird geschlossen (kein Flackern). Hook-Szenen ohne Untertitel (Text = Untertitel). Schlüsselwörter mit `hi` pro Szene in Rose. Zeiten stammen aus der Sprach-Analyse (siehe unten); `captions.srt` wird mitgeliefert.

## Zeitbestimmung (Sprache → Wort-Timings)
1. TTS/Audio pro Szene → Sprachgrenzen aus Energie (−42 dB).
2. Wortgewichtung nach Silben/Zeichen + Satzzeichenpausen, Grenzen werden an **Energieminima (±90 ms)** eingerastet.
3. **Genauigkeit:** gut für 1–2-Wort-Captions (QA prüft, dass Sprache im Caption-Fenster liegt); **keine** Forced-Alignment-Genauigkeit. Eigene Aufnahmen → `faster-whisper` für exakte Wort-Timings (`align.whisper_words`) oder Timings als JSON (`scene.words`).

## Sounddesign (alles synthetisch, lizenzfrei)
| Ereignis | Klang | Pegel rel. |
|---|---|---|
| Szenenwechsel | `whoosh` 0,5 s | 0,8 |
| Karte erscheint | `pop` (Sinus-Sweep 900→260 Hz) | 0,8–0,9 |
| Fehlerkarte | `thud` (Sweep 120→42 Hz + Rauschen) | 1,0 |
| Prüf-Scan (Mythos) | `scan` (Sweep 260→1500 Hz) | 0,7 |
| Urteil-Stempel | `stamp` (Thud + Crack) | 1,0 |
| Zähler | `tick`-Serie, Tonhöhe fällt | 0,45 |
| Haken/Bestätigung | `ding` (1568 + 2349 Hz) | 0,7 |
| Hook | `riser` 0,5 s + `pop` | 0,35/0,55 |
Musik: ruhiges Bett (Am–F–C–G, gezupfte Achtel, 92 bpm), **Sidechain-Ducking** unter Sprache (−70 %, Attack 40 ms, Release 350 ms), Pegel ≈ −26 dB zur Stimme. **Platzhalter**; für Releases lizenzierte Musik via `music: "<Pfad>"` (Nutzungsrechte prüfen, Instagram-Musikbibliothek ist für Business-Konten eingeschränkt).
Stimme: **Pico-TTS ist eine hörbar synthetische Platzhalterstimme.** Für Veröffentlichung: eigene Aufnahme (`scene.audio`) oder lizenzierter TTS-Dienst. Abmischung: Stimme −1,5 dBFS Peak, SFX × 0,42, Musik × 0,20 (geduckt), `tanh`-Soft-Clip, dann **2-Pass-loudnorm auf −14 LUFS / −1,5 dBTP** (stereo, AAC 192 kbit/s, 48 kHz).

## Export
H.264 High, yuv420p, **1080 × 1920, 30 fps**, CRF 16 (Renderer) → AAC 192k, `+faststart`, BT.709-Tags. Typische Größe 15–30 MB bei 50 s. Dateien: `<slug>.mp4`, `captions.srt`, `timeline.json`, `storyboard.json`, `voiceover.wav`, `poster.jpg`, `contactsheet.jpg`, `qa-report.md`, `rerender.sh`.

## Modus 3 (Rohvideo)
`rough_cut.py` entfernt Pausen > 0,35 s (Jump-Cuts, Schwelle −32 dB). Storyboard-Szenen bekommen `source:{from,to}` (Sekunden im Rohvideo) + `vo` (Transkript für Untertitel) und optional `place:{y,scale}`, damit Karten das Gesicht nicht verdecken. Build mit `--base cut.mp4`: Ton kommt aus dem Video, Overlays werden transparent gerendert und über das Video gelegt. *Mechanik getestet mit synthetischem Material; mit echtem Talking-Head vor Veröffentlichung visuell abnehmen (Gesichtsverdeckung!).*
