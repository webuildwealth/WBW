# Reels-Pipeline: Installation & Betrieb

## Einmalig einrichten
```bash
bash scripts/setup_reels.sh                 # venv + Pakete + MediaPipe-Modelle + Selbsttest
WHISPER=small bash scripts/setup_reels.sh   # zusätzlich Whisper-Modell vorladen (empfohlen)
```
| Komponente | Wofür | Installation | Pflicht? |
|---|---|---|---|
| FFmpeg ≥ 5 | Import, Rendering, Audio, Export | macOS `brew install ffmpeg` · Ubuntu `sudo apt install ffmpeg` · Windows `winget install ffmpeg` | ja |
| Python ≥ 3.10 | Pipeline | python.org / Homebrew | ja |
| libEGL (nur Linux) | MediaPipe-Laufzeit | `sudo apt install libegl1 libgles2 libgl1` | ja für Freistellung |
| MediaPipe-Modelle | Freistellung (Haare/Gesicht/Körper/Kleidung) | lädt `setup_reels.sh` von storage.googleapis.com | ja für Freistellung |
| faster-whisper + Modell | Transkription mit Wort-Zeitstempeln, alle Sprachen | Paket via pip; Modell lädt beim 1. Lauf von huggingface.co | empfohlen |
| pocketsphinx | Offline-Transkription nur Englisch (ungenau) | via pip, Modell im Paket | optional |
| Internet zu api.openverse.org / commons.wikimedia.org | lizenzierte Bilder (`--online`) | – | optional |

Offline-Whisper: Modellordner (z. B. `Systran/faster-whisper-small`) herunterladen und `--whisper-model /pfad/zum/ordner` angeben.

## Ein Reel erzeugen
```bash
.venv/bin/python scripts/make_reel.py rohvideo.mp4 -o mein_reel --lang de
```
Wichtige Optionen:
- `--script skript.txt`: korrigiert das Transkript (Schreibweise) oder ersetzt einen fehlenden Spracherkenner
- `--assets ordner/`: eigene oder lizenzierte Bilder (empfohlen für den Referenz-Look), Lizenzen in `assets.json`:
  `[{"file": "dollar.jpg", "tags": ["dollar","money"], "license": "CC0", "source": "https://…", "author": "…"}]`
  Lizenz `pinterest`/`unknown` wird ohne `--pinterest`/`--allow-unlicensed` ausgeschlossen.
- `--pinterest`: Bilder direkt auf Pinterest suchen, nach Ästhetik bewerten und herunterladen (Standard-Empfehlung).
  Braucht Zugriff auf `www.pinterest.com` und `i.pinimg.com`. Optional für den Browser-Fallback:
  `.venv/bin/pip install playwright && .venv/bin/playwright install chromium`
- `--online`: Openverse + Wikimedia Commons (nur kommerziell nutzbare Lizenzen, Attribution im Report)
- `--image-gen-cmd 'python gen.py --prompt {prompt} --out {out}'`: eigener KI-Bildgenerator für fehlende Motive
- `--music track.mp3`, `--sfx-dir sfx/`, `--no-sfx`, `--highlight F5C542`
- `--matte-video maske.mov`: eigene Maske (Alpha oder Schwarz/Weiß) statt automatischer Freistellung
- `--stop-after plan`: nur EDL erzeugen → `mein_reel/work/edl.json` bearbeiten → ohne Flag erneut starten

## Ergebnis
```
mein_reel/final.mp4          1080x1920, 30 fps, H.264 High, yuv420p, AAC 48 kHz, ~-14 LUFS, max. 16 Mbit/s
mein_reel/report.md          Szenen, Bildwechsel, verwendete Pins (Links), Quellen, Hinweise
mein_reel/work/assets/*_kandidaten.jpg   Pinterest-Kandidaten je Bildplatz (#0 = gewählt)
mein_reel/bildrechte.csv     Rechte-Protokoll pro Bild
mein_reel/untertitel.srt     Untertitel-Datei
mein_reel/project/           edl.json, transcript.json, mix.wav, voice_proc.wav, sfx.wav, images/,
                             layers/background.mp4, speaker_green.mp4, speaker_matte.mp4
```

## Gemessene Leistung (4 CPU-Kerne, keine GPU, 27-s-Video)
Freistellung ≈ 8 fps, Rendering ≈ 6–8 fps, Gesamtlauf ≈ 4–5 Minuten.

## Grenzen (ehrlich)
- Freistellung ist bildbasiert (MediaPipe) mit zeitlicher Glättung, kein spezialisiertes Video-Matting. Feine
  Haarsträhnen vor unruhigem Hintergrund können ausfransen. Für Profi-Qualität: Maske extern erzeugen
  (z. B. CapCut „Hintergrund entfernen“ als Alpha-Export, Runway, RobustVideoMatting) und `--matte-video` nutzen.
- Ohne Bildquellen erzeugt der Offline-Generator stilisierte Motive (dunkel/vintage/naiv/barock). Den
  fotografischen Look des Referenz-Reels erreichen nur echte Fotos/Gemälde (`--assets`, `--online`).
- Pinterest hat keine offizielle öffentliche Such-API. `reelkit/pinterest.py` nutzt den internen Such-Endpunkt der
  Website, ersatzweise die HTML-Suchseite oder einen Headless-Browser. Ändert Pinterest sein Format, greift der
  nächste Weg; die Auswahl-Logik ist mit `scripts/selftest_pinterest.py` offline getestet. Gegen das echte Pinterest
  konnte in der Build-Umgebung nicht getestet werden (Netzwerk gesperrt).
- Pinterest-Bilder gehören ihren Urhebern; die Nutzung verantwortet der Nutzer. Pin-Links stehen im Report.
- Themen-Erkennung nutzt ein Stichwort-Lexikon (`reelkit/concepts.py`, DE/EN). Für bessere Motivwahl prüft
  Claude die EDL nach `--stop-after plan` und passt Motive/Bilder an.
