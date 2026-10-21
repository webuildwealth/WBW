# Qualitätscheckliste

## A. Automatisch (`scripts/qc.py`, läuft am Ende von `build_reel.py`)
- [ ] 1080 × 1920, H.264 (yuv420p), AAC 48 kHz, 30 fps
- [ ] Dauer 30–60 s (Kurztests dürfen kürzer sein)
- [ ] Lautheit −14 LUFS ± 1,5, True Peak ≤ −1 dBFS
- [ ] Kein Standbild > 3 s, keine Schwarzbilder
- [ ] Szenenlängen 0,9–9 s; Storyboard-Dauer = Videodauer (± 0,2 s)
- [ ] `storyboard.py check`: alle Zahlen belegt, keine Lücken/Überlappungen, Annahmen sichtbar gemacht

## B. Visuell prüfen – `qc/contact.png` und mindestens 3 Stills in voller Größe ansehen
- [ ] Split-Screen sauber: Trennlinie, kein Ausschnitt über die Linie hinaus, Sprecher nicht verzerrt
- [ ] Gesicht vollständig, Augen im oberen Drittel des Sprecherbildes, kein Untertitel im Gesicht
- [ ] Jede Szene erklärt den **gerade gesagten** Satz (Ton aus: verstehe ich den Gedanken?)
- [ ] Figur/Ort in allen Szenen konsistent (Frisur, Kittel, Möbelposition)
- [ ] Untertitel ≥ 56 px, kontrastreich, nicht in Safe-Zonen rechts/unten
- [ ] Text in Grafiken liegt in der Zeichenfläche (y 150 … H−140)
- [ ] Mindestens ein roter Schwerpunkt, nicht mehr als zwei Akzentfarben je Bild
- [ ] Sprache klingt natürlich (keine Roboter-Artefakte, keine abgeschnittenen Wortanfänge an Jump-Cuts)

## C. Inhalt
- [ ] Jede Zahl: Skript, freigegebene Annahme oder Rechnung; Beispielrechnungen als „Beispiel“ erkennbar
- [ ] Keine Renditeversprechen; tarifabhängige Aussagen mit Hinweis
- [ ] Compliance/Werbekennzeichnung in der Caption
- [ ] Verwendete Medien: nur eigene, synthetische oder lizenzierte Dateien (Musik-Lizenz dokumentiert)

## D. Referenz messen (für Verfeinerung der Style DNA)
```bash
ffprobe -v error -show_streams -show_format -of json ref.mp4
ffmpeg -i ref.mp4 -vf "select='gt(scene,0.15)',showinfo" -vsync vfr -f null - 2>&1 | grep pts_time   # Schnitte
ffmpeg -i ref.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -14                                  # Lautheit
ffmpeg -i ref.mp4 -vf "fps=1/3,scale=360:-1" f_%02d.png                                             # Kontaktbogen
```
Trennlinie: Standbild laden, Zeilenmittel der Helligkeit bilden, größten Sprung suchen (siehe `references/style-dna.md`, Wert 66,6 %).

## E. Selbsttest des Skills
`python3 scripts/selftest.py` – rendert alle Beispiele (Stills), prüft Zahlenvalidierung (inkl. absichtlich falsches Storyboard), Schnittlogik
mit synthetischem Sprecherclip und die komplette Pipeline. Muss vor jeder Weitergabe grün sein.
