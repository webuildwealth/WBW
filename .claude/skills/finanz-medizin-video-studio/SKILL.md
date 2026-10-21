---
name: finanz-medizin-video-studio
description: FINANZ-MEDIZIN VIDEO PRODUCTION STUDIO – Produktionssystem für Social-Media-Videos (Reels, Ads) von Finanz-Medizin. Schneidet Rohmaterial automatisch, erzeugt Untertitel, Vollbild-Grafiken (Kennzahlen, Balkendiagramme, Listen, Karten), Zahlenanimationen, Zooms, Whooshs und rendert 9:16-MP4 (1080x1920, 30 fps, H.264/AAC) mit anschließender Qualitätsprüfung. Verwenden bei „bearbeite dieses Video im Finanz-Medizin-Stil“, „Werbeanzeige/Ad schneiden“, „Grafik/Animation für Reel“, „Zahlen einblenden“, „Qualitätscheck“. Die Schnitt-Engine liegt im Schwester-Skill finanz-medizin-reels.
---

# Finanz-Medizin Video Production Studio

Stil-Vorbild: `references/style-dna.md` (aus dem Referenzvideo abgeleitet, mit Kennzeichnung gesichert/geschätzt).
Marke: `references/brand-guide.md`. Regeln für Schnitt und Animation: `references/editing-playbook.md`.
Abnahme: `references/quality-checklist.md` + `scripts/qa.py`. Nur das lesen, was der Schritt braucht.

## Engine
`python3 ~/.claude/skills/finanz-medizin-reels/scripts/reel.py <befehl>` (kurz `reel`; Befehle, spec.json und
Einrichtung stehen in `finanz-medizin-reels/SKILL.md` und `FORMATE.md`). Beide Skill-Ordner zusammen installieren.
Technik: ffmpeg (Schnitt, Ton), HyperFrames/GSAP (Grafiken, Animation, Rendering), Parakeet (deutsche Sprache mit
Wortzeiten). Remotion wurde bewusst nicht gewählt: Es braucht React-Build und eine Remotion-Lizenzprüfung, HyperFrames
liefert dasselbe aus reinem HTML.

## Ablauf bei „Bearbeite dieses Video im Finanz-Medizin-Stil“
1. `reel check`. Skript, CTA-Stichwort und Caption mit dem Nutzer klären (nicht schneiden, bevor das steht).
2. `reel prep` -> Takes ansehen -> `reel cut … --drop …` -> `reel render-cut`. Inhaltliche Aussagen nie umstellen oder kürzen,
   wenn sich der Sinn ändert; nur Pausen, Versprecher, verworfene Takes und Nebensächliches raus.
3. **Gestaltung festlegen** (Playbook, Abschnitt „Wann welche Grafik“): `reel spec` erzeugt Hook, Untertitel, Zahlen, CTA;
   dann in `spec.json` `scenes` ergänzen (Vollbild-Grafiken) und Zahlen beschriften. **Zahlen nur aus dem Skript oder
   vom Nutzer**; fehlt eine Zahl, nachfragen oder ohne Zahl gestalten, nie schätzen.
4. `reel build` (Lint 0 Fehler) -> `reel preview --at …` -> jedes Standbild ansehen.
5. `reel render` -> `python3 scripts/qa.py fertig/<nr>_<STICHWORT>.mp4 --spec arbeit/<nr>/spec.json --script <skript>`.
   FAIL beheben und neu rendern. Erst dann übergeben und kurz berichten (was raus, wo Grafiken/CTA, Warnungen).
6. Optional liefern: `arbeit/<nr>/hf/` (editierbarer Animationscode, Vorschau mit `npx hyperframes preview`),
   Untertitel als SRT (`npx hyperframes transcribe … --to srt`).

## Szenen (Vollbild-Grafiken) in spec.json
```json
"scenes": [
 {"start": 7.0, "end": 9.5, "kind": "stat", "lead": "waren über", "value": "1.000 %", "label": "zusätzlicher *Umsatz*",
  "count": {"from": 0, "to": 1000, "dec": 0, "suffix": " %"}},
 {"start": 10, "end": 14, "kind": "chart", "title": "Entwicklung",
  "bars": [{"label": "vorher", "value": 1.7, "text": "1,7 %"}, {"label": "nachher", "value": 9.6, "text": "9,6 %"}]},
 {"start": 15, "end": 18, "kind": "list", "title": "Wir prüfen", "items": ["Verträge", "Steuer", "Vorsorge"]},
 {"start": 19, "end": 22, "kind": "card", "title": "Die *Checkliste*", "image": "checkliste.png"}
]
```
`image` liegt im Arbeitsordner unter `assets/`; ohne Bild erscheint das Signet. Balkenhöhen sind proportional zu
`value`, die Trendlinie erscheint ab drei Balken. Untertitel und Zahlen-Overlays pausieren automatisch in Szenen.
Eigene neue Grafiktypen: CSS in `template/reel.css`, Animation in `template/engine.js` (`ANIM`), HTML in `scene_html()`
von `reel.py`; Regeln: nur Transformationen animieren (kein letterSpacing/width), jede Einblendung braucht eine `id`.

## Was funktioniert, was nicht (getestet in dieser Umgebung)
| Fähigkeit | Stand |
|---|---|
| Transkription deutsch mit Wortzeiten, Untertitel aus Skript abgeglichen | getestet, läuft |
| Tight Cut, Takes, Hook, Zahlen (mitzählend), Zoom, CTA, Whooshs, Loudness | getestet, läuft |
| Vollbild-Grafiken stat/chart/list/card, Wipe-Übergang | getestet (Standbilder + Render) |
| Qualitätsprüfung `qa.py` | getestet (positiv und negativ) |
| Echtes Kamerabild mit Sprecher | nicht getestet: nur Platzhalter + synthetische Stimme verfügbar |
| Rauschminderung / Sprachkompression | nicht eingebaut (nur Lautheit); auf Wunsch ergänzbar |
| B-Roll / Stockmaterial | nur vom Nutzer gelieferte Dateien (Karte/Bild); kein Stock-Zugriff |
| Musik | bewusst keine (Vorgabe Reels). Für Ads nur lizenzfreie Dateien des Nutzers |
| Motion-Tracking | nicht vorhanden; Zoom-Mittelpunkt wird von Hand gesetzt |
| CapCut-Projektdatei | nicht möglich (kein verlässliches Austauschformat); stattdessen MP4 + HTML-Projekt + SRT |
| Marken-Logo-Datei, Markenschriften | Website-Signet und Manrope/Inter als Stand der Website; eigene Dateien in `assets/` ablegen |
