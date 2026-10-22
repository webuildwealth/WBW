# Test: Talking-Head-Editor mit echtem Sprechermaterial

**Quelle:** Sprecheraufnahme aus dem Referenzvideo (echte Person, echte deutsche Sprache, 36 s). Ein unbearbeitetes Rohvideo des Nutzers lag noch nicht vor. Weil im Referenzvideo fremde Buchcover und Texte eingebrannt sind, wurde der Hintergrund für diesen Test durch eine neutrale Wand ersetzt (Freistellung aus `vision.py`). Ein schmaler rosa Saum am Kopf (6–11 s) stammt aus dem eingebrannten roten Cover der Quelle, nicht aus der Pipeline.

**Befehl:** `python3 scripts/talking_head.py clean_raw.mp4 --out run2` (ohne JSON-Bearbeitung, 470 s Laufzeit auf 4 CPU-Kernen).

**Ergebnis:**
- Transkript korrekt, inklusive „The Happiness Advantage“ und „Marcus Aurelius“.
- Angekündigte „Fünf Bücher“ erkannt, 5/5 Listenelemente gefunden.
- Pro Element: Titel + NR-Badge oben sowie ein Titel-Plakat hinter dem Kopf (Tiefenstaffelung wie in der Referenz).
- Wort-für-Wort-Hook, Betonungs-Sticker, Sprung-Zooms, Untertitel und SFX.
- QA: 17/17 OK, darunter Gesicht frei, Caption-Sync und −14 LUFS.

Dateien: `preview.mp4` (540×960-Vorschau), `frames.png`, `plan.md` (alle Entscheidungen mit Begründung), `qa-report.md`, `captions.srt`.
