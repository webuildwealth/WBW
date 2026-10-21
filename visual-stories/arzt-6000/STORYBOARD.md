# Story 1: „Der Arzt mit 6.000 € netto“

**Kernaussage:** Hohes Einkommen bedeutet nicht automatisch Vermögensaufbau. Steigen die Ausgaben mit dem Einkommen, bleibt kaum etwas übrig.
**Format:** 1080 × 960 px, 30 fps, 24 s, ohne Ton. Datei: `arzt-6000_oberes-video_1080x960.mp4`

## Zahlen (transparentes Modell, keine Quelle nötig)
Alle Werte sind **frei gewählte Beispielwerte**, keine Statistik.

| Posten | €/Monat |
|---|---|
| Einkommen (netto) | 6.000 |
| Auto-Leasing | 900 |
| Wohnung (Miete) | 2.000 |
| Lebensstil (Restaurants, Reisen, Shopping, Abos) | 2.900 |
| **Übrig** | **200** |

Die Fußnote „Beispielrechnung · keine Anlageberatung“ steht in den Szenen 4 und 5.

## Szenen und Timing
Das Timing ist an das Skript angelehnt. Die Dauern stehen oben in `engine/anim.js` (`SCENES`) und lassen sich an deine Sprechgeschwindigkeit anpassen.

| # | Zeit | Sprechtext (Vorschlag) | Bild | Kamera | Emotion |
|---|---|---|---|---|---|
| 1 | 0,0–4,5 s | „Stell dir vor, ein junger Arzt verdient 6.000 € netto.“ | Dr. Jonas geht durch den Krankenhausflur auf die Kamera zu, hebt das Smartphone; Karte „Gehalt eingegangen +6.000 €“, Münzen springen | Push-in, Flur-Perspektive | stolz |
| 2 | 4,5–9,0 s | „Er kauft sich ein teures Auto …“ | Orangefarbener Sportwagen fährt bei Dämmerung ein, Jonas am Steuer; Karte „Leasing 900 €/Monat“ | seitliche Fahrt, Parallax-Skyline | glücklich |
| 3 | 9,0–13,5 s | „… zieht in eine große Wohnung …“ | Jonas betritt die Wohnung, Stehlampe geht an, er breitet staunend die Arme aus; Karte „Miete 2.000 €/Monat“ | langsamer Schwenk | überrascht → stolz |
| 4 | 13,5–19,0 s | „… und gewöhnt sich an seinen Lebensstandard.“ | Jonas am Schreibtisch; die Budgetleiste (6.000 €) füllt sich mit Auto, Wohnung, Lebensstil; nur ein winziger türkiser Rest bleibt | langsames Push-in | neutral → besorgt |
| 5 | 19,0–24,0 s | „Doch später merkt er, dass er kaum Vermögen aufgebaut hat.“ | Nahaufnahme: erst Schreck, dann nachdenklich (Hand am Kinn); Gedankenblase mit fast leerem Sparglas | Close-up, langsamer Zoom | schockiert → nachdenklich → erkennend |

Übergänge: diagonaler Amber-Lichtwisch (0,5 s).

## Dramaturgie
Ausgangssituation (1) → Entwicklung (2–3) → Problem (4) → Erkenntnis (5).
Die Geschichte ist auch ohne Ton verständlich: Gehalt rein, Ausgaben füllen die Leiste, am Ende bleibt fast nichts.

## Technische Umsetzung
Es stand kein Bild- oder Videogenerator zur Verfügung. Das Video ist deshalb **programmatisch gerendert** (Canvas-Vektoranimation → PNG-Frames → ffmpeg). Der Vorteil: Charakter, Orte und Farben sind in jedem Frame identisch. Der Nachteil: Der Stil ist sauberes Vektor-Cinematic, kein fotorealistisches 3D wie bei KI-Videomodellen.

Neu rendern: `node engine/render.mjs video out.mp4 30` (benötigt `playwright-core`, Chromium und ffmpeg). Vorschau einzelner Zeitpunkte: `node engine/render.mjs preview out/p 1.0,5.0,10.0`.
