# Animation, Grafikdesign, Übergänge – Referenz der Engine

Alle Animationen sind **deterministisch** (`FM.seek(t)`): gleiche Zeit → gleiches Bild; kein CSS-Transition-Timing, keine Zufallswerte.
Dadurch ist Rendern reproduzierbar und Stills (`--stills`) zeigen exakt, was im Video erscheint.

## Bewegungsgrammatik
| Zweck | Dauer | Easing | Beispiel |
|---|---|---|---|
| Pop-In (Karte, Badge, Warnschild, Callout) | 0,35–0,5 s | `easeOutBack` (leichtes Überschwingen) | Badge „6.000 €“ |
| Slide/Push-Übergang | 0,35 s (`tr_duration`) | `easeOutCubic`, alte Szene gleitet 22–25 % mit und blendet auf 40–50 % ab | `push`, `slide` |
| Zahl zählt hoch | ≤ 2,2 s (`count_time`) | `easeOutCubic` | Zähler |
| Balken wachsen | 1,0 s, versetzt um 0,55 s | `easeOutCubic` | `gap_bars` |
| Kurve/Zeitstrahl läuft | 60–75 % der Szene | `easeInOutCubic` | `inflation`, `timeline` |
| Alterung/Zeitraffer | `lapse` (Standard ≤ 3,2 s) | `easeInOutCubic`; Umgebung überblendet bei 42–58 % | `character` |
| Stempel | 0,3 s, 2× → 1× + 0,25 s Schütteln | `easeOutBack` | `myth` |
| Pfeil zeichnet sich | 0,45 s | linear (`stroke-dashoffset`) | `callouts[].arrow` |
| Headline-Aufbau | 0,09 s Versatz je Wort, 0,4 s je Wort | `easeOutBack` | `title` |
| Ken-Burns | über die ganze Szene | `easeInOutCubic`, Zoom 1,0→1,15 | `image` |
Leerlauf: Figuren atmen (±2 px, 2,2 rad/s) und gestikulieren leicht – nichts steht je komplett still.

## Übergänge (`transition`, pro Szene für den *Eintritt*)
`push` (von unten, Standard) · `slide` (von rechts) · `zoom` (Skalierung 1,25→1, alte Szene vergrößert/ausgeblendet) · `fade` · `wipe` (Maske von links) · `cut`.
Jeder nicht-`cut`-Übergang löst automatisch einen `whoosh` aus (siehe Sound).

## Szenentypen und Props
**title** – `kicker`, `line1` (fette Grotesk, Pflicht), `accent` (kursive Serif, Rot), `sub`, `size`
**character** – `figure`, `env` (`apartment|hospital|praxis|retirement`), `envTo`, `age`, `ageTo`, `year`, `yearTo`, `lapse`, `lapseStart`,
  `x`, `scale` (1,28), `pose` (`wave`), `mood` (`worried`), `badge{text|value,countFrom,valueTo,unit,label,tone,t,x,y,size}`, `warn{t,x,y}`
**counter / stat** – `label`, `from`, `to` (Pflicht), `unit`, `decimals`, `tone` (`blue|red|gray|green|navy`), `caption`, `count_time`, `size`
**gap_bars** – `title`, `bars[{label,value,tone}]` (Pflicht), `max`, `unit`, `gap{label,value?}` (Wert = Differenz, wenn nicht angegeben), `gap_t`
**inflation** – `amount` (100), `rate` (3), `years` (20): Kurve = `amount/(1+rate/100)^Jahr`, Lesewert, Verlust-Badge (berechnet)
**timeline** – `from`, `to` (Pflicht), `step`, `prefix` („Jahr “), `label`, `markers[{year,label,tone}]`
**myth** – `text` (Pflicht), `kicker`, `size`, `stamp`, `stampSize`, `stamp_t`, `strike_t`, `sr`/`sy` (Stempelposition), `warn:false`
**compare** – `left`/`right{title,tone,items[{text,mark:"check|cross|dot"}]}`, `vs`
**bullets** – `title`, `items[]`
**image** (Foto) – `src` (relativ zur Storyboard-Datei), `src2` + `cross_t`/`cross_d` (Überblendung, z. B. dieselbe Person älter), `badge`, `warn`, `year`/`yearTo`, `focus` (object-position), `frame:"full"`, `credit`, `caption`, `zoom_from`, `zoom_to`, `pan_x_from/to`, `pan_y_from/to`
**svg** (eigene Illustration) – `layers[{svg, t, d, enter:"pop|fade|up|left|right|draw|none", origin:"x y", depth (Parallax 0–1), float (Schweben px)}]`,
  `camera{from,to,x_from,x_to,y_from,y_to}`, `caption`, `bg`. Koordinatensystem 1080 × 960; Markenfarben verwenden; sichtbarer `<text>` unterliegt der Zahlenprüfung.
**Alle Szenen:** `callouts[{t,text,x,y,size,rot,arrow{dx,dy}}]`, `keywords[]`, `sfx[]`, `transition`, `tr_duration`.

## Grafikregeln
- **Eine Aussage pro Bild**, ≤ 1 Headline + 1 Hauptobjekt + ≤ 2 Callouts; Schrift ≥ 34 px (Labels) / ≥ 56 px (Aussagen).
- Flat-Vector: einheitliche 3–5-px-Konturen (Navy), Karten mit 5-px-Rand + 10-px-„Offset-Schatten“ in derselben Farbe (Markenmerkmal).
- Rot nur als Schwerpunkt; Verlust/Lücke immer Rot 500 auf Rot 100; positive/„richtig“ nur grünes ✓.
- Zahlen: deutsches Format (`6.000 €`, `44,6 %`), Einheit kleiner (0,55×) neben der Zahl.
- Diagramme: Achse + Raster in Navy 100, Beschriftungen ≥ 26 px, Start bei 0 (keine abgeschnittenen Achsen), Datenpunkt mit weißem Rand.
- Texte in Grafiken kurz (Satzfragmente), nie den vollen gesprochenen Satz wiederholen – Untertitel übernehmen das.

## Neue Szene/Figur ergänzen
1. In `templates/engine.js` `SC.meinTyp = (p, lt, dur) => '<div class="abs" …>…</div>'` ergänzen (`p` = props, `lt` = Szenenzeit in s, `dur` = Szenenlänge). Nur Funktionen von `lt` verwenden.
2. Typ in `scripts/storyboard.py` (`SCENE_TYPES`, `REQUIRED`) registrieren; Zahlenprüfung für numerische Props ergänzen.
3. Automatische Effekte in `scripts/sfx.py → plan()` eintragen.
4. Beispiel in `examples/` ablegen und `scripts/selftest.py` laufen lassen.

## Sounddesign (alles synthetisch erzeugt → keine Lizenzprobleme)
| Effekt | Auslöser | Pegel (vor Mix) |
|---|---|---|
| `whoosh` (gefiltertes Rauschen, 0,38 s) | jeder Übergang außer `cut` | −17 dBFS |
| `pop` (Sinus-Sweep, 0,14 s) | Badge, Callout, Warnschild, Vergleichspunkte, Aufzählung | −16 dBFS |
| `tick` (2,6 kHz, 30 ms) | Zähler, alle 75 ms, leiser werdend | −22 dBFS |
| `thud` (Bass + Rauschen) | Stempel, Kurve erreicht Endwert | −14 dBFS |
| `rise` + `ding` | Balken wachsen / Lücke erscheint | −22 / −17 dBFS |
Musikbett: einfaches Pad (Am–F–C–G) **nur als Platzhalter**; für Markenmusik lizenzierte Datei mit `--music pfad` übergeben. Musik −27 dB und unter der
Stimme per Sidechain (Ratio 10, Release 0,5 s) abgesenkt. Gesamtmix 2-Pass-Loudnorm auf −14 LUFS, True Peak ≤ −1,5 dBTP.
