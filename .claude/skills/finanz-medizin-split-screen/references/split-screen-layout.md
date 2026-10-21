# Split-Screen-Layout, Safe Zones, Untertitel

## Geometrie (Standard: Format 9:16, 1080 × 1920, `--ratio 0.5`)
| Bereich | Position | Größe |
|---|---|---|
| Visualisierung (oben) | y 0 – 960 | 1080 × 960 |
| Trennlinie | y 950 – 960 (10 px, Navy; roter Fortschrittsbalken wächst von links) | 1080 × 10 |
| Sprecher (unten) | y 960 – 1920 | 1080 × 960 |

- `--ratio r` setzt die Höhe der Visualisierung = `round(1920·r/2)·2` (z. B. 0,667 → 1280 px, Referenzaufteilung); der Sprecher bekommt den Rest.
- Alle Szenen sind relativ zu `panel_height` gebaut (Zeichenfläche `TOP` … `BOT`); bei anderen Verhältnissen vorher Stills prüfen.
- **Nicht implementiert:** Links/Rechts-Layout (540 × 1920 je Hälfte). Die Szenen sind für breite Flächen komponiert; dafür wäre ein eigener Satz Szenen nötig.

## Visualisierung (oben)
- Zeichenfläche: **y 150 … H−140** (bei 960 px: 150 … 820). Headline/Kernobjekt innerhalb, mindestens 60 px seitlicher Rand.
- Untertitelband: **y H−150 … H−20**, mittig; wird von Szenen freigehalten.
- Marken-Mark (70 px) sitzt rechts auf der Trennlinie (x 980, y H−82); unter 1080 px Breite kein weiteres Logo einblenden.
- Hintergrund: Elfenbein `#F4F0EF` mit 54-px-Raster in 5,5 % Navy („Notizbuch“-Look der Referenz).

## Sprecher (unten)
- Ausschnitt = Cover-Crop auf 1080 × 960 um das erkannte Gesicht (OpenCV-Haar, Median aus 6 Stichproben; Fallback Bildmitte; `--face-x/--face-y` überschreibt).
- Gesichtsmitte bei **40 %** der Ausschnitthöhe (`--headroom`) → Kopf oben nicht abgeschnitten, Schultern sichtbar.
- Jump-Cut-Zooms: Zyklus 1,00 / 1,12 / 1,00 / 1,20 / 1,06 / 1,16 (Gesicht bleibt zentriert; `--no-zoom` schaltet ab).
- Quellformat 9:16 wird skaliert, 16:9 seitlich beschnitten; Quelle sollte Gesicht ≥ 20 % der Bildhöhe haben.

## Instagram-Safe-Zones (Schätzwerte für 1080 × 1920 – Instagram ändert die Oberfläche, vor Veröffentlichung am Handy gegenprüfen)
| Zone | Maß | Konsequenz |
|---|---|---|
| Oben (Header, Kamera-Icon) | ≈ y < 150 | keine Schrift/Logos (Zeichenfläche beginnt bei 150) |
| Unten (Caption, Profilname, Audio-Zeile, Navigation) | ≈ y > 1500 | im Sprecherbild nichts Wichtiges; Gesicht (Mitte ≈ y 1345, Kinn ≈ y 1480) bleibt darüber |
| Rechts (Like/Kommentar/Teilen) | ≈ x > 940, y 1000–1700 | keine Untertitel/Grafik dort; Untertitel haben 120 px Innenabstand |
Untertitel liegen bewusst **über** der Trennlinie (y 810–940), also außerhalb des Gesichts und außerhalb der unteren UI-Zone.

## Untertitel
- Quelle: Wortzeiten (`words[]`); Gruppierung ≤ 3 Wörter (`subtitles.max_words`), Umbruch an Satzzeichen oder Pause > 0,55 s. `max_words:1` = ein Wort pro Einblendung wie in der Referenz.
- Schrift: Manrope ExtraBold, 90 px (kurz) bis 56 px (lang); längstes Wort wird auf 820 px Breite eingepasst (min. 40 px). Elfenbein-Kontur für Lesbarkeit.
- Hervorhebung: Zahlen, `€`, `%` und `keywords[]` in Markenrot; bei Gruppen sind noch nicht gesprochene Wörter auf 32 % abgedunkelt, das aktuelle Wort um 7 % vergrößert („Karaoke“).
- Pop-Animation: 0,14 s `easeOutBack` je Gruppe; Nachlauf 0,35 s, dann Ausblenden.
- Mindestlesbarkeit auf kleinem Display: ≥ 56 px Schrifthöhe, Kontrast ≥ 7:1 (Navy auf Elfenbein).
