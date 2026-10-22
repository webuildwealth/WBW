# Implementierungsstand (ehrlich)

Stand der Tests: Sandbox-Umgebung (Linux, ffmpeg 6, Chromium via Playwright, Python 3.13). `python3 scripts/selftest.py` → 27/27 grün.
**Es wurde noch kein echtes Sprechervideo von Finanz-Medizin verarbeitet.** Sprecherschnitt/Montage wurden mit einem *synthetischen* Clip
(Testbild + Tonbursts) getestet, die Gesichtserkennung separat an einem Standbild mit echtem Gesicht.

## ✅ Implementiert **und** getestet
| Funktion | Test |
|---|---|
| Storyboard-Auflösung über Phrasen-Anker, Lücken-/Überlappungsprüfung | selftest, 4 Beispiele |
| Zahlenprüfung (Skript/Annahme/Rechnung), Rechenprüfung `derived`, Ablehnung erfundener Zahlen | Negativtests im selftest |
| Render der oberen Hälfte (alle 10 Szenentypen, Figuren-Alterung, Untertitel, Übergänge) → H.264 | Stills aller Beispiele geprüft; Voll-Render A/B/C |
| Sprecherschnitt: Pausen entfernen, Füllwörter („äh“) und Dopplungen entfernen, Zoom-Cuts, Zeit-Remapping der Wörter | synthetischer Clip, selftest |
| Schnitt nur nach Lautstärke (ohne Transkript) | selftest |
| Sounddesign synthetisch (whoosh/pop/tick/thud/ding/rise, Musik-Pad), automatische Platzierung | selftest + Hörprüfung nicht möglich → nur Pegel/Peaks gemessen |
| Montage (vstack 50:50), Sidechain-Ducking, 2-Pass-Loudnorm −14 LUFS, Limiter, Export 1080×1920/H.264/AAC/30 fps | QC-Report der Demos |
| QC-Skript (Format, Codec, Lautheit, Peak, Standbilder, Szenenlängen) + Kontaktbogen | Demos |
| Gesichtserkennung (OpenCV-Haar) | 1 echtes Gesicht (Referenz-Standbild): erkannt, Position plausibel |

| Vollautomatik: `build_reel.py --video roh.mp4` ohne Storyboard (Regel-Regisseur) bis `reel.mp4` | synthetischer 42-s-Clip, selftest |
| Regel-Regisseur erkennt Figur/Geschlecht, Mythos→Realität, Ruhestand (Alterung + Vergleich), Inflation über Satzgrenzen, Aufzählungen, CTA | selftest + Sichtprüfung |
| Eigene Illustrationen (`svg`: draw/pop/up/left/right, Parallax, Kamerafahrt) | Szenenkatalog D + Demo |
| Zahlwörter (drei, zweitens …) gelten als belegt | selftest |
| Canva-Connector erzeugt passende Illustration | 1 Testbild erzeugt; **nur 200-px-Vorschau** ins Projekt übertragbar (CDN gesperrt) |

| Personen → Fotos (Bibliothek/KI/Suche), jung→alt-Überblendung, Badge auf Foto | Bibliotheks-Pfad mit Platzhalterbildern geprüft (keine echten Personenfotos verfügbar) |
| Transkript des Nutzers: Abgleich mit Whisper-Wörtern / Verteilung auf Sprechpausen ohne Modell | Pausen-Verteilung mit synthetischem Clip: Abweichung Ø 0,62 s, max 1,39 s; Füllwörter werden so NICHT erkannt |

| Ordner-Workflow `reel.py original/IMG.MOV --skript 3 --cta Vorsorge` → `fertig/` | nachgebaute Ordnerstruktur in der Cloud-Sandbox (**nicht auf dem Mac getestet**) |
| iPhone-HDR (HEVC 10 Bit HLG, 60 fps) → SDR H.264 30 fps | synthetischer HLG-Clip |
| CTA-Karte ab dem Satz mit dem CTA-Wort | Testlauf |
| `mac_setup.sh` (Homebrew, venv, Whisper-Modell, Chromium) | nur Syntax geprüft – **nicht ausgeführt** |

## ⚠️ Benötigt zusätzliche Werkzeuge / Voraussetzungen
| Funktion | Voraussetzung |
|---|---|
| Transkription mit Wortzeiten | `pip install faster-whisper` **plus Modell-Download** (HuggingFace). In der Test-Sandbox war der Download gesperrt (403) → **mit echter Sprache ungetestet**. Alternativen: `--from-srt` (mit kleiner Test-SRT geprüft; Wortzeiten linear innerhalb der Untertitelzeile verteilt → ungenauer als Whisper) / `--from-json` (ungetestet) |
| Gesichtserkennung | `opencv-python-headless<5` (OpenCV 5 hat keine Haar-Cascades) |
| Chromium | Playwright-Chromium oder `FM_CHROMIUM=/pfad` |
| Realistische/KI-Bilder, echte Figurenanimation per Video-KI | externer Bild-/Videogenerator (nicht angebunden); Engine nimmt fertige Bilder als `image`-Szene (Ken-Burns) |
| Markenmusik | eigene lizenzierte Datei (`--music`) – das Standard-Pad ist nur ein schlichter Platzhalter |

## ❌ Noch nicht realisiert / Einschränkungen
- Links/Rechts-Layout (nur Oben/Unten; Verhältnis per `--ratio` frei).
- Claude-API-Regie (`--engine claude`) ist implementiert, aber **ungetestet** (kein API-Key in der Testumgebung). Bildsuche und OpenAI-Generierung: implementiert, **ungetestet** (Hosts gesperrt; Fehler werden sauber gemeldet, Pipeline läuft ohne Bilder weiter).
- Regel-Regisseur versteht keine Inhalte, nur Muster (Beträge, Prozente, Schlüsselwörter) – Qualität deutlich unter Claude-Regie.
- Szenen nur als vektorbasierte Illustration (Figur „Arzt/Ärztin“, 4 Umgebungen); weitere Figuren (MFA, Patient, Praxisinhaber) und Orte müssen in `engine.js` ergänzt werden.
- Gesichts-Tracking nur als fester Ausschnitt je Schnittsegment (keine kontinuierliche Nachführung); keine Beleuchtungs-/Farbkorrektur außer leichtem `eq` und `--auto-light`.
- Soundqualität nicht per Gehör beurteilt; Hintergrundmusik der Referenz nicht analysiert.
- Instagram-Safe-Zones sind Schätzwerte.
- Keine Mehrsprecher-/Mehrkamera-Unterstützung; Beispielzahlen aus `examples/A` (3.200 €) sind eine **nicht freigegebene Annahme**.
- Renderzeit: ≈ 2 s pro Videosekunde (CPU), 45-s-Reel ≈ 1,5–2 Minuten.
