# BRAND GUIDE: FINANZ-MEDIZIN (VIDEO)

Quelle: `assets/css/site.css` der Website (Navy `#0C2C4F`, Bordeaux `#751524`, Off-White `#F4F0EF`; alle aus dem Logo abgeleitet). Tokens liegen in `templates/brand.css`. **Wird ein offizielles Brand-Paket mit abweichenden Werten geliefert, dort ersetzen (eine Datei).**

## Farben
| Token | Hex | Einsatz |
|---|---|---|
| `--navy-900/800/700/600/500` | `#071B32 / #0C2C4F / #11395F / #17486F / #1E5A88` | Hintergrund, Infofelder (Tipp/Fakt), Spaltenkopf A |
| `--red-700/500` | `#751524 / #A5293B` | Fehlerkarte, Spaltenkopf B, Balken-Verlust |
| `--signal` ⚑ | `#D63A50` | **Video-Erweiterung**: hellere Rot-Stufe für Chips, Ring, Balken auf Navy (Kontrast) |
| `--rose` | `#E8919E` | Akzent-Text auf dunklem Grund (aus site.css) – Hervorhebung im Hook/Captions |
| `--ivory / --white` | `#F4F0EF / #FFFFFF` | Mythos-Karte, Badges, Text |
Grün wird **nicht** verwendet (Marke = Rot/Blau/Weiß); Bestätigung = weißer Haken auf Blau.
**Semantik:** Blau = Wissen/Tipp/Fakt · Rot = Fehler/Risiko/Verlust/Mythos-Tab · Weiß = Lösung/Alternative.

## Typografie
| Rolle | Schrift | Gewicht | Einsatz |
|---|---|---|---|
| Display/Headline/Captions | **Manrope** | 800, Laufweite −0,035 em | Titel, Zahlen, Untertitel |
| Redaktioneller Akzent | **Newsreader Italic** | 500 | 1–2 Schlüsselwörter im Hook, `_Wort_` |
| Fließtext/Subzeilen | **Inter** | 500 | Body, Quellen, Disclaimer |
Größen (1080 × 1920): Hook 104–176 px · Kartentitel 92 · Body 46 · Caption 88 · Zahl-KPI bis 250 · Disclaimer 30.
Auszeichnung im Text: `*Akzent*` (Rose/Rot), `_Serif-Kursiv_`, `~durchgestrichen~`.

## Bausteine (Komponentenbibliothek)
`hook` · `tip` (blau) · `error` (rot) · `myth` (Karte→Stempel→Fakt) · `fact` · `stat` · `bars` · `compare` · `checklist` · `outro`. Wiedererkennung: 48-px-Eckradius, Chip-Labels in Versalien mit Sperrung, Nummern-Badge „NR. n“, Marken-Footer (Zeichen + „finanz-medizin“), animierter Navy→Rot-Verlauf, dezentes Gitter, Ringe im Hook.

## Logo
`assets/img/mark-finanz-medizin.png` (Aeskulap + Ring + Balken). Das PNG hat hellen Grund → immer auf **Elfenbein-Kreis** (Outro) bzw. als kleines rundes Zeichen im Footer. Nicht verzerren, nicht einfärben. Lizenz: Eigenes Marken-Asset.

## Safe Zones (Instagram Reels, 1080 × 1920)
| Zone | Bereich | Regel |
|---|---|---|
| Oben | y < 226 | frei (Profil/Kamera-Leiste) |
| Inhalt | y 226–1200, x 120–960 | Karten/Diagramme |
| Caption | y 1236–1456 | Untertitel (zentriert) |
| Marken-Footer | y ≈ 1472 | Zeichen + Name |
| Unten | y > 1500 | frei (Caption/Username/Audio-Leiste) |
| Rechts | x > 960, y 900–1450 | frei (Like/Kommentar/Teilen) |
Der Layout-Check in `qa.py` prüft diese Zonen automatisch im Endzustand jeder Szene.

## Tonalität
Du-Ansprache, sachlich-zugewandt, keine Superlative, kein Alarmismus. Fachbegriffe erklären. Humor nur über Gegenüberstellung (Mythos/Fakt), nie über Betroffene (Krankheit, Berufsunfähigkeit).
