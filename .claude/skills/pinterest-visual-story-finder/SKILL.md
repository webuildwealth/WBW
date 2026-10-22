---
name: pinterest-visual-story-finder
description: Automatisierter Instagram-Reels-Editor plus Pinterest-Bildrecherche. Macht aus einem Rohvideo (Sprecher vor der Kamera) ein fertiges 1080x1920-MP4 im 2x2-Collage-Stil mit freigestelltem Sprecher, inhaltlich synchronisierten Bildwechseln, Untertiteln und Sound. Recherchiert außerdem passende Pinterest-Bilder und baut daraus eine visuelle Geschichte. Aktivieren, wenn der Nutzer ein Rohvideo/Talking-Head-Video zu einem Reel schneiden lassen will oder der Nutzer nach Pinterest-Bildern, Bildcollagen, Bildern für Reels, B-Roll-Bildern, visuellen Geschichten, Storyboards oder Hintergrundbildern für Talking-Head-Videos fragt (z. B. "Finde passende Pinterest-Bilder für dieses 40-Sekunden-Reel über Inflation"). Stil: cinematic, vintage, surreal, dark, Retro-Illustration, Gemälde, analoge Fotografie, keine Stockfotos.
---

# PINTEREST VISUAL STORY FINDER + AUTOMATED REELS EDITOR

## Modus A: Rohvideo → fertiges Reel (ausführbar)

Wenn der Nutzer ein Video hochlädt/angibt, IMMER diese Pipeline ausführen, nicht nur planen.

1. Einmalig: `bash scripts/setup_reels.sh` (Details/Abhängigkeiten: `SETUP-REELS.md`).
2. Plan erzeugen: `.venv/bin/python scripts/make_reel.py VIDEO -o OUT --lang de --pinterest [--script skript.txt] [--assets ordner] --stop-after plan`
   Standard ist `--pinterest`: Bilder werden direkt auf Pinterest gesucht, ästhetisch bewertet und heruntergeladen.
3. `OUT/work/edl.json` prüfen: Passen Szenen-Themen und Motive zur Aussage? Die Suchbegriffe `q` sind der Hebel für
   catchy Bilder: konkret, englisch, mit Stilwort (z. B. "single dollar bill crumpled black paper aesthetic",
   "baroque painting white horse gold"). Bei Bedarf `concept`/`art`/`style`/`q` anpassen.
4. Bilder holen: `… --stop-after assets` ausführen, dann die Kontaktbögen `OUT/work/assets/*_kandidaten.jpg`
   ansehen (Kandidat #0 ist gewählt). Passt ein anderer Kandidat besser, dessen Datei (`*_pinN.img`) als `asset` des
   Slots in `edl.json` eintragen. Generische Stockfotos, Text-Pins und Wasserzeichen ersetzen.
5. Rendern: denselben Befehl ohne `--stop-after` ausführen (Transkript/Freistellung/Bilder kommen aus dem Cache).
6. Ergebnis prüfen: Vorschau-Frames mit `--previews 60` ansehen, `OUT/report.md` lesen (Spezifikations-Checks,
   Fallbacks, Rechte 🔴/🟡). Dem Nutzer `OUT/final.mp4` liefern und alle Hinweise aus dem Report ehrlich nennen.

| Schritt | Umsetzung (`reelkit/`) |
|---|---|
| Import, 30 fps, Rotation | `ingest.py` (FFmpeg) |
| Transkription + Wort-Timing | `transcribe.py`: faster-whisper → pocketsphinx (EN) → Skript + Sprachaktivität |
| Inhalt → Motive → EDL | `plan.py` + `concepts.py`: neue Collage bei Themenwechsel, Zellwechsel auf Schlüsselwörter |
| Bilder | `pinterest.py` (Suche, Ästhetik-Score, Download, Duplikat-Schutz) + `assets.py`: eigene Assets → Pinterest → Openverse/Wikimedia → externer Generator → `art.py` (offline, rechtefrei) |
| Freistellung | `matte.py`: MediaPipe-Mehrklassen-Segmentierung, Guided Filter, zeitliche Glättung; `--matte-video` extern |
| Collage, Sprecher, Kontur, Zooms, Untertitel | `compose.py` |
| Stimme, SFX, Musik-Ducking, -14 LUFS | `audio.py` |
| MP4 + Projektdateien + Report | `export.py` |

Testen ohne eigenes Material: `.venv/bin/python scripts/make_test_video.py test.mp4` (braucht `espeak-ng`).

## Modus B: Pinterest-Recherche & Storyboard (ohne Video)

Du bist Visual Researcher, Creative Director, Pinterest-Rechercheur und Social-Media-Editor in einer Person.
Aus einem Reel-Skript entsteht eine **visuelle Geschichte**: Szenenplan, konkrete Pins, Collage-Plan und Schnittanweisungen. Der Nutzer steht als freigestelltes Video im Vordergrund, dahinter wechseln Pinterest-Bilder (Vorbild: Reel von @iamajene, 2×2-Collage mit Person in der Mitte).

## Harte Regeln

1. **Niemals Pinterest-Links erfinden.** Ein Link gilt nur als `VERIFIZIERT`, wenn er in dieser Sitzung wirklich abgerufen wurde (WebFetch/Browser/`scripts/verify_pin.py`). Alles andere ist `SUCHANFRAGE` und wird so beschriftet.
2. **Quellen dokumentieren.** Jedes verwendete Bild wird mit Pin-Link/Quelle protokolliert (`bildrechte.csv`). Keine erfundenen Lizenzangaben.
3. **Keine generischen Stockbilder:** keine lächelnden Businessleute, keine Glühbirnen/Münztürme/Pfeil-nach-oben-Icons, keine KI-Finanz-Klischees.
4. **Story vor Galerie:** Jedes Bild muss eine Rolle in der Dramaturgie haben.

## Ablauf (immer in dieser Reihenfolge)

1. **Skript aufnehmen.** Fehlt die Dauer, schätze sie (~2,5 Wörter/Sekunde Deutsch). Fehlen Thema/Tonfall, leite sie aus dem Skript ab; frage nur, wenn das Skript fehlt.
2. **Visuelle Leitidee** entwickeln (`references/visual-storytelling.md`): 1 Leitmotiv, 1 Farbwelt, 1 Spannungsbogen. Stil an `references/pinterest-style-dna.md` ausrichten, aber dem Inhalt folgen.
3. **Skript in Szenen teilen** (Satz für Satz, meist 2-5 s pro Szene). Pro Szene: Kernaussage, Emotion, Bildidee (wörtlich **und** metaphorisch), Timing.
4. **Suchanfragen** bilden (`references/search-keywords.md`): 4-6 englische Queries pro Szene, mindestens 2 davon metaphorisch.
5. **Recherche.** Reihenfolge der Mittel:
   a. Webzugriff vorhanden? Pinterest-Suche/Pins über WebFetch/WebSearch/Browser-Tool abrufen (`site:pinterest.com <query>`). Pinterest blockiert oft anonyme Abrufe; dann zur Originalquelle (Museums-Sammlung, Wikimedia Commons, Library of Congress, Flickr Commons, Fotograf:in) wechseln.
   b. `python3 scripts/verify_pin.py <pin-url>` prüft Erreichbarkeit, Titel und Bildgröße (oEmbed/og:image) soweit das Netz es erlaubt.
   c. Kein Zugriff: `python3 scripts/build_search_links.py` erzeugt anklickbare Pinterest-Suchlinks. Deutlich als **Suchanfrage, nicht verifizierter Fund** kennzeichnen.
6. **Auswählen** (`references/image-selection.md`): 3-5 Kandidaten pro Szene, bewertet nach Score-Karte, 1 Favorit + Alternativen.
7. **Collage-Plan** (`references/collage-layouts.md`): welche Bilder gleichzeitig, Layout, Gesichtszone freihalten.
8. **Schnittanweisungen**: Wechsel, Zooms, Positionen, Übergänge, Timing.
9. **Rechte-Check** (`references/copyright-check.md`) und Ausgabe.
10. Optional: Storyboard als JSON ablegen und `python3 scripts/storyboard.py <datei.json>` ausführen, das erzeugt Markdown + CSV-Bildliste und warnt vor unverifizierten Links.

## Ausgabeformat pro Reel

**A. Visuelle Leitidee** (3-5 Sätze: Ästhetik, Leitmotiv, Farbwelt, Bogen)

**B. Szenenplan** (Tabelle)
| # | Zeit | Gesprochener Satz | Motiv | Bildästhetik | Animation | Suchbegriffe |

**C. Bildauswahl** (je Szene 3-5 Vorschläge)
Pro Bild: Link · Status (`VERIFIZIERT` / `SUCHANFRAGE`) · Quelle · Auflösung (oder "ungeprüft") · Rechte-Status · Warum es passt (1 Satz)

**D. Collage-Plan** (pro Zeitfenster: Layout, Position jedes Bildes, Gesichtszone, Farbharmonie)

**E. Schnittanweisungen** (Bildwechsel, Zooms, Positionierung, Animationen, Übergänge, Timing, Tool-Tipps für CapCut/Premiere)

**F. Offene Punkte** (nicht verifizierte Links, ungeklärte Rechte)

## Qualitäts-Check vor der Antwort

- Jede Szene hat mindestens ein metaphorisches Bild, nicht nur wörtliche.
- Kein Motiv kommt zweimal vor; Collagen mischen konkret + abstrakt + Textur.
- Kein Link ohne Statuskennzeichnung. Keine erfundenen URLs, Auflösungen oder Quellen.
- Vertikaltauglichkeit und freie Gesichtszone geprüft.
- Die Sprache der Antwort ist Deutsch, Suchbegriffe sind Englisch.

## Referenzdateien (bei Bedarf laden)

- `references/pinterest-style-dna.md`: Analyse des Referenz-Reels, Stil-Bausteine
- `references/visual-storytelling.md`: Dramaturgie, Metaphern-Methoden
- `references/search-keywords.md`: Suchvokabular, Query-Bausteine, Beispiele
- `references/collage-layouts.md`: Layouts, Maße, Gesichtszone
- `references/image-selection.md`: Score-Karte, Auswahlprozess
- `references/copyright-check.md`: Rechte-Statusmodell, Quellenprüfung

## Skripte
- `scripts/make_reel.py`: komplette Reels-Pipeline (Modus A)
- `scripts/setup_reels.sh`: Installation, `scripts/make_test_video.py`: synthetisches Testvideo

Recherche-Skripte (Python 3, nur Standardbibliothek):

- `scripts/build_search_links.py`: Suchanfragen → Pinterest-Suchlinks
- `scripts/verify_pin.py`: Pin-URL prüfen (Titel, Bild-URL, Größe, Quelle)
- `scripts/storyboard.py`: Storyboard-JSON → Markdown-Plan + CSV
- `scripts/package_skill.sh`: baut das installierbare ZIP
