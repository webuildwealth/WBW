# Qualitätscheckliste

Automatisch (`scripts/qa.py <mp4> --spec … --script …`, FAIL = beheben): Format 1080×1920/30 fps/H.264 High/AAC 48 kHz,
Länge 10–45 s, −14 LUFS und Spitze ≤ −1 dBTP, keine schwarzen Frames, keine eingefrorenen Stellen, keine Pausen > 0,7 s,
Hook ab 0 s, CTA ≥ 2 s und im letzten Satz, Untertitel ohne Überlappung und ≤ 4 Wörter, alle Zahlen in Grafiken im Skript,
keine Renditeversprechen.

Von Hand an Standbildern (`reel preview --at`: Hook, jede Zahl/Szene, Mitte, CTA, letzter Frame):
- [ ] Schrift ist echt Manrope/Inter, kein Ersatz; nichts abgeschnitten, nichts in den Instagram-Rändern
- [ ] Untertitel stimmen mit Sprache überein und laufen synchron (3 Stichproben anhören)
- [ ] Sprache verständlich, Whooshs nicht lauter als Sprache
- [ ] Jede Grafik passt zur gesprochenen Aussage; jede Zahl stimmt mit Skript und Fachlichkeit überein
- [ ] Schnittstil wie style-dna (Tempo, Zoom, Szenenwechsel), Marke wie brand-guide
- [ ] Kein Disclaimer im Video, keine Renditeversprechen, Caption-Regel eingehalten
- [ ] Datei lässt sich abspielen (qa.py liest sie) und ist unter ~30 MB oder als `_handy.mp4` vorhanden
Berichten: nur erledigte Prüfungen als erledigt melden; WARN offen nennen.
