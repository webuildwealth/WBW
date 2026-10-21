# Bildauswahl

## Score-Karte (je 0-5, gewichtet)

| Kriterium | Gewicht | Frage |
|---|---|---|
| 1 Passung zur Aussage | ×3 | Unterstützt es genau diesen Satz (wörtlich oder metaphorisch)? |
| 2 Kreativität/Originalität | ×3 | Hat man es schon 100× gesehen? Überraschend? |
| 3 Emotionale Wirkung | ×2 | Löst es sofort ein Gefühl aus? |
| 4 Referenzstil | ×2 | Vintage/Cinematic/Surreal/Gemälde/Textur? |
| 5 Bildqualität | ×2 | ≥ 1080 px Breite für Zelle, ≥ 1600 px für Vollbild, scharf, ohne Wasserzeichen |
| 6 Reel-Eignung | ×2 | Hochformat/zuschneidbar, Motiv ausserhalb Gesichtszone |
| 7 Kombinierbarkeit | ×1 | Farben/Kontrast passen zu den anderen Zellen |
| 8 Rechte | ×1 | Status laut `copyright-check.md` |

Maximalpunkte: 80. **≥ 60** = empfehlen, **45-59** = Alternative, **< 45** = verwerfen.

## K.-o.-Kriterien (sofort verwerfen)
Sichtbares Stock-Wasserzeichen · Pinterest-Screenshot mit UI · KI-Finanz-Klischee · erkennbare Privatperson ohne Einwilligung · Marken-/Logo-Hauptmotiv ohne Absicht · Auflösung unter 700 px Breite · Text im Bild, der gegen Untertitel arbeitet.

## Prozess
1. 8-12 Kandidaten sichten, 3-5 behalten.
2. Pro Szene **1 Favorit + 2 Alternativen**, dazu eine Begründung in einem Satz.
3. Kandidaten **paarweise** auf Kollagentauglichkeit testen (Farbe, Helligkeit, Motivart). Mindestens ein dunkles und ein helles Bild je Collage.
4. Wiederholungen streichen: gleiche Motivklasse (z. B. zwei Geldhaufen) nur, wenn der Kontrast Absicht ist.
5. Auflösung prüfen: `scripts/verify_pin.py` (liefert Pixelmaße, falls erreichbar) oder in der Pin-Detailansicht "Originalbild" öffnen. Nicht schätzen und nicht erfinden; "ungeprüft" angeben.
6. Quelle zurückverfolgen (Pin → "Besuchen"/Quelle → Original). Notiere Domain, Urheber, Lizenz.

## Ausgabeformat pro Bild
```
Szene 3 · Favorit
Link: https://www.pinterest.com/pin/… [VERIFIZIERT: abgerufen am JJJJ-MM-TT]  (oder: Suchlink [SUCHANFRAGE])
Quelle: Domain / Urheber
Auflösung: 1200×1800 px (geprüft) | ungeprüft
Rechte: 🔴 ungeklärt / 🟡 klärbar / 🟢 frei (Lizenz)
Score: 66/80
Warum: Das Bild zeigt … und erzeugt …; liegt als Eckzelle oben rechts.
```
