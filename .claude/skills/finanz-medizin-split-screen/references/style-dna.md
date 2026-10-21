# REFERENCE STYLE DNA – Split-Screen-Erklärreel

Quelle: ein Referenzvideo (Instagram-Reel von „kallawaymarketing“, Thema „Claude als Social-Media-Tool“), aufgenommen als
**iPhone-Bildschirmaufnahme** (1206×2622 px, 60 fps, 61,05 s, H.264/AAC). Instagram-Oberfläche (Statusleiste, „Für dich/Freunde“,
Like-/Kommentar-Buttons, Profilzeile, Navigationsleiste) ist im Bild und gehört **nicht** zum Reel-Design.
Inhalt/Branding der Referenz wird nicht übernommen – nur die **Editing-Regeln**. Die Markenidentität kommt aus `brand-guide.md`.

Legende: **[M]** = gemessen (Skript/ffmpeg), **[S]** = geschätzt aus Standbildern (alle 3 s ein Bild, 20 Bilder), **[?]** = nicht ermittelt.

## 1. Layout & Bildkomposition
| Eigenschaft | Wert | |
|---|---|---|
| Trennlinie Grafik/Sprecher | bei **66,6 %** der Bildhöhe (Zeile 1747 von 2622) | [M] |
| Grafikbereich | oberes Zweidrittel, ohne sichtbaren Rahmen, gesamte Breite | [M]/[S] |
| Sprecherbereich | unteres Drittel (enthält in der Aufnahme die IG-Profilzeile) | [M] |
| Sprecher-Ausschnitt | Halbtotale/Brust-aufwärts, Kopf sitzt direkt unter der Trennlinie, Kappe/Kopf oben angeschnitten, Blick in die Kamera | [S] |
| Vollbild-Passagen | gelegentlich (ca. 3 von 20 Stichproben) Sprecher vollformatig, Grafik entfällt; Wiederkehr zum Split bei nächster Visualisierung | [S] |
| Hintergrund Grafik | hellgrau mit feinem Gitterpapier-Raster („Notizbuch“-Look) | [S] |
| Verbindung der Hälften | Untertitelwort sitzt **genau an der Trennlinie** (oben Grafik, direkt darunter Kopf); Wort ist der visuelle Klebepunkt | [S] |
| Grafik-Rahmen | Inhalte stehen frei oder als Karte mit dünner Linie/Schatten; großzügiger Rand (~8 % seitlich) | [S] |

**Abweichung zum Auftrag:** Der Auftrag verlangt 50:50, die Referenz nutzt ≈ 2:1. Der Skill rendert **50:50 als Standard** und kann mit
`--ratio 0.667` die Referenzaufteilung erzeugen.

## 2. Schnitt & Rhythmus
| Eigenschaft | Wert | |
|---|---|---|
| Bildänderungen (Schwelle 0,15) | 34 in 61 s → Ø alle **1,8 s**, max. Abstand 5,5 s | [M] |
| große Szenenwechsel (Schwelle 0,25) | 17 in 61 s → Ø alle ≈ 3,5 s (Grafik-Motiv wechselt) | [M] |
| Rhythmus | kein starres Raster; Abstände 1–6 s, abhängig vom Inhalt (Aufzählung schnell, Screenshot-Beispiel länger) | [M]/[S] |
| Sprecher-Schnitte | Jump-Cuts ohne Pausen; Kopfgröße/Position wechselt zwischen Cuts minimal (Zoom-Cut) | [S] |
| Sprechtempo | schnell, praktisch ohne Atempausen (silencedetect −35 dB/0,25 s: nur 1 Treffer in 61 s) | [M] |
| Übergänge | harte Schnitte + kurze Slide/Zoom-Einblendungen der Karten; Headline „baut sich“ Wort für Wort auf | [S] |
| Kamerabewegung | keine echte; Dynamik entsteht durch Einblenden/Skalieren der Grafikelemente (Pop, Slide) | [S] |

## 3. Visual Storytelling
- Visualisierung ist **wörtlich/demonstrativ**: Gesagtes „Prompt eingeben“ → Screenshot des Prompt-Felds; „Video-URL“ → Handy-Mockup;
  „mehrere Videos analysieren“ → Bildraster aus 6 Thumbnails mit Cursor; „Trends, Patterns, Insights“ → Dokument mit handschriftlichen Callouts + Pfeilen. [S]
- Abstraktes wird über **UI-Mockups, Karten und Annotationen** erklärt, nicht über Figuren oder Metaphern. [S]
  → Für Finanz-Medizin wird dieses Prinzip um Figuren/Zeitraffer/Diagramme erweitert (siehe `visual-storytelling.md`), da die Themen
  (Rente, Inflation, BU) weniger „zeigbar“ sind als Software.
- Jede Visualisierung erscheint **ca. 0,1–0,3 s vor dem zugehörigen Wort** und bleibt, bis das nächste Argument beginnt. [S]
- Jede Grafik hat **eine Aussage**; nie mehr als 1 Headline + 1 Hauptobjekt + max. 1–2 Annotationen. [S]

## 4. Grafikdesign
| | |
|---|---|
| Headlines | zweiteilig: **fette Grotesk** (schwarz) + **kursive Serif** in Akzentfarbe, teils auf Farbfläche („*The Full Breakdown*“ weiß auf Rot) [S] |
| Untertitel | **ein Wort pro Einblendung**, fette Grotesk, groß, zentriert, schwarz auf hellem Grund/weiß auf Video [S] |
| Annotationen | Handschrift-/Serif-Kursiv + gezeichneter Pfeil (Linie „zeichnet sich“) [S] |
| Farben | neutral Grau/Weiß + **eine** Akzentfarbe (Rot), schwarzer Text; Screenshots bringen ihre eigenen Farben [S] |
| Elemente | Screenshots, Handy-/Fenster-Mockups, Karten mit leichtem Schatten, Bildraster, Logos/Icons [S] |
| Hierarchie | Headline oben (≈ 12 % von oben) → Hauptobjekt Mitte → Untertitelwort an der Trennlinie [S] |
| Texteinblendung | Wort-für-Wort-Aufbau der Headline, ≈ 0,1 s Versatz je Wort [S] |

## 5. Audio
| | |
|---|---|
| Lautheit | **−14,3 LUFS** integriert, LRA 3,2 LU (sehr gleichmäßig), True Peak +1,3 dBFS (leicht übersteuert – nicht übernehmen) | [M] |
| Sprache | direkt, nah mikrofoniert, kaum Raumhall, stark verdichtet [S] |
| Musik/SFX | **nicht eindeutig bestimmbar** (keine Stille im Signal; Trennung Stimme/Bett nicht gemessen) [?] |
| Sync | Bildwechsel an Satz-/Wortgrenzen, nicht auf Beat [S] |

## 6. Übernommene Regeln (verbindlich für den Skill)
1. Eine Aussage = ein Bild; Bildwechsel inhaltsgetrieben (Mittel 1,8–3,5 s), nie starres Raster.
2. Untertitelwort/-gruppe an der Trennlinie als Klebepunkt; hell/dunkel nach Untergrund.
3. Headline = fette Grotesk + kursive Serif in Akzentrot, wortweise Einblendung.
4. Handschriftliche Callouts + gezeichnete Pfeile für Beziehungen („Trends → Muster → Erkenntnisse“).
5. Zurückhaltende Farbwelt: neutraler Grund + eine Akzentfarbe (bei uns Markenrot, Blau als Primärfarbe).
6. Sprecher: Jump-Cuts ohne Pausen, minimale Zoom-Wechsel, Blick in die Kamera.
7. Lautheit ≈ −14 LUFS, True Peak sauber unter −1 dBTP (Referenz übersteuert).

## 7. Nicht bestimmt / Grenzen der Analyse
- Kein Audio-Auswertung von Musik/SFX; keine Transkription (kein Spracherkennungsmodell verfügbar); Animationsdauern/Easing nur aus Standbildern geschätzt.
- Die Referenz ist eine Bildschirmaufnahme: exakte Original-Auflösung und Safe-Zone-Maße der Grafik sind nicht bekannt.
- Weitere Referenzvideos können diese Datei verfeinern: `Referenz-Video → Analyse → Werte hier ergänzen` (Messbefehle siehe `quality-checklist.md`, Abschnitt „Referenz messen“).
