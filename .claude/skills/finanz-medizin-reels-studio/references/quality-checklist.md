# QUALITÄTSKONTROLLE

`scripts/qa.py` läuft automatisch am Ende von `build_reel.py` → `qa-report.md`. **FAIL = nicht veröffentlichen.** Der Rest ist manuelle Abnahme.

## Automatisch geprüft
Format 1080×1920 · H.264/yuv420p · 30 fps · AAC · Länge 20–60 s · Lautheit −14 ±1,5 LUFS · True Peak ≤ −1 dBTP · keine Schwarzbilder · kein Standbild > 1,2 s · Hook-Einsatz ≤ 1 s, Hook ≤ 4 s · Szenen ≤ 12 s · Caption-Regeln (≤ 2 Wörter, ≥ 0,14 s, keine Überlappung, in Szene) · **Caption-Sync gegen Sprachenergie** · **Layout/Safe-Zones je Szene** (DOM-Prüfung).

## Zusätzlich im Talking-Head-Modus (automatisch)
Gesicht frei (vordere Overlays gegen gemessenes 30-fps-Tracking) · hintere Elemente ≤ 45 % verdeckt · ≥ 3 Overlay-Typen · Inhalts-Abdeckung 30–90 % · keine gleiche Einblendung an gleicher Stelle direkt hintereinander · Caption-Sync gegen ASR-Zeitstempel.
**Manuell:** Transkript in `plan.md` auf Erkennungsfehler prüfen (Eigennamen, Zahlen!) · Matte-Kanten bei schnellen Handbewegungen ansehen · Jump-Cuts auf abgeschnittene Silben hören.

## Manuell (vor Freigabe)
**Inhalt & Recht**
- [ ] Jede Zahl nachgerechnet/quellenbelegt (`meta.sources`); Stand zeitabhängiger Werte genannt.
- [ ] Annahmen der Beispielrechnung im Bild sichtbar; kein Prognose-/Garantiecharakter.
- [ ] Keine individuelle Empfehlung, keine Produkt-/Anbieternennung, nichts außerhalb des Erlaubnisumfangs (`storytelling.md`).
- [ ] Disclaimer im Outro lesbar (≥ 2 s), Caption-Text mit Hinweis + Impressum-Link.
- [ ] Werbung als solche erkennbar, wo zutreffend.
- [ ] Keine fremden Marken/Bilder/Musik ohne Lizenz (Studio erzeugt alles selbst).

**Storytelling**
- [ ] Hook löst das Versprechen ein; Neugier ohne Clickbait.
- [ ] Jeder Block liefert Mehrwert (Zahl/Regel/Prüfschritt), keine Floskel.
- [ ] Schluss mit Konsequenz/Handlung; Loop zum Hook stimmig.

**Bild & Ton**
- [ ] Contactsheet: Jede Szene verständlich ohne Ton; Zahlen lesbar auf Handy-Größe.
- [ ] Animationen erklären (Wachsen/Schrumpfen entspricht Inhalt), nichts blinkt/überfrachtet.
- [ ] Captions treffen Sprache (Stichproben an 5 Stellen, Szenenübergänge besonders).
- [ ] Stimme verständlich, Aussprache von Fachbegriffen/Zahlen korrekt (TTS: Zahlen/Abkürzungen prüfen, ggf. `spoken` Override).
- [ ] Musik/SFX unter der Stimme, kein Pumpen.
- [ ] Auf echtem Smartphone im Reels-Player geprüft: nichts in Instagram-Leisten, Untertitel lesbar bei Sonnenlicht-Helligkeit.

## Bekannte Grenzen
Pico-Stimme klingt synthetisch (Modus 1/2) · Modus 3: Inhaltserkennung regelbasiert, Matte aus 256-px-Modell · Wort-Timings in Modus 1/2 geschätzt (siehe `editing-guide.md`) · Sprecher-Freisteller nicht implementiert · Layout-Check erkennt Zonenverletzungen, nicht Lesbarkeit/Ästhetik.
