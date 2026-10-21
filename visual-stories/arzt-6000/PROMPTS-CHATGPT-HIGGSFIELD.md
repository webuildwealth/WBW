# Story 1 „Arzt mit 6.000 € netto“ – Prompt-Paket
**Hinweis: Mit diesen Prompts wurden noch keine Medien erzeugt.** Sie sind zum Einfügen in ChatGPT (Bilder) und Higgsfield (Image-to-Video) gedacht.

## Ablauf
1. **ChatGPT:** Charakter-Sheet erzeugen (Prompt A). Das beste Ergebnis speichern.
2. **ChatGPT:** Für jede Szene das Charakter-Sheet hochladen und den Keyframe-Prompt (B1–B5) verwenden. So bleibt Dr. Jonas in allen Szenen gleich.
3. **Higgsfield:** Jeden Keyframe als Startbild nutzen (Image-to-Video, 5 s) und den Motion-Prompt (C1–C5) einfügen. Kamera-Presets wie „Dolly In“ oder „Orbit“ passend wählen.
4. **Schnitt (CapCut/Premiere):** Clips auf 1080 × 960 px zuschneiden (9:8), obere Reel-Hälfte, Übergänge mit Licht-Flash. Zahlen-Overlays (6.000 €, 900 €, 2.000 €, „übrig: 200 €“) im Schnitt einsetzen, nicht generieren lassen. KI-Text wird oft fehlerhaft.

## Stil-Block (an jeden Bild-Prompt anhängen)
```
Style: high-end cinematic 3D animation, Pixar/Illumination quality, soft global illumination, warm amber key light with deep navy shadows, subtle volumetric haze, shallow depth of field, rich detailed environment, 35mm film look. Color palette: dark navy, warm amber/orange glow, small teal accents. No text, no logos, no watermark. Aspect ratio 9:8 (square-ish), subject centered with headroom, nothing important at the edges.
```

## A – Charakter-Sheet (ChatGPT)
```
Character reference sheet of "Dr. Jonas": a 30-year-old German doctor, slim build, average height, light skin, short dark-brown hair with a side part and a small quiff, light three-day stubble, warm brown eyes, thin black rectangular glasses. Wears an open white doctor's coat over teal scrubs, a stethoscope around his neck, a small orange name badge on the coat, dark navy trousers, white sneakers. Show front view, 3/4 view, side view, and 4 facial expressions (proud smile, amazed, worried, thoughtful). Neutral dark background. [STIL-BLOCK]
```

## B – Keyframes (ChatGPT, jeweils mit hochgeladenem Charakter-Sheet)
**B1 Krankenhaus:** `Use the uploaded character exactly. Dr. Jonas walks toward the camera down a modern hospital corridor at night, ceiling lights reflecting on the polished floor, warm amber light from door windows. He looks at his smartphone with a proud, surprised smile; the phone screen glows amber. Medium-wide shot, low angle. [STIL-BLOCK]`

**B2 Sportwagen:** `Use the uploaded character exactly. Dr. Jonas sits behind the wheel of a sleek orange sports coupe, driving through a city at golden-hour dusk, skyline silhouettes and glowing streetlights, headlights on. He smiles confidently, one hand on the wheel. 3/4 front view of the car, the driver clearly visible through the windshield. [STIL-BLOCK]`

**B3 Wohnung:** `Use the uploaded character exactly. Dr. Jonas steps into a large luxurious penthouse apartment at night: floor-to-ceiling windows with a glowing city skyline, designer sofa, warm floor lamp, plants. He spreads his arms in amazement, looking around. Wide shot from a slightly low angle. [STIL-BLOCK]`

**B4 Schreibtisch:** `Use the uploaded character exactly. Dr. Jonas sits at a dark wooden desk at night, lit by the cold glow of his laptop and a warm desk lamp. A floating holographic budget bar beside him is almost completely filled with orange, coral and violet blocks, only a tiny teal sliver left. He frowns, looking worried. Medium shot over the desk. [STIL-BLOCK]`

**B5 Erkenntnis:** `Use the uploaded character exactly. Close-up of Dr. Jonas in a dim room with warm amber bokeh behind him, hand on his chin, thoughtful and slightly concerned expression, eyes looking down to the side as if realizing something. Beside him on the desk, an almost empty glass savings jar with only three coins, softly lit. [STIL-BLOCK]`

## C – Motion-Prompts (Higgsfield, Image-to-Video, je ~5 s)
- **C1:** `He keeps walking slowly toward the camera, glances at his phone and breaks into a proud smile. Ceiling lights pass overhead. Slow dolly-in, natural walk cycle, subtle camera shake.`
- **C2:** `The car glides forward through the dusk city, wheels spinning, streetlights sweeping across the glossy paint. Slow orbit from the front 3/4 view to the side. He smiles.`
- **C3:** `He walks two steps into the room, the floor lamp switches on with a warm glow, he slowly spreads his arms in amazement. Slow pan right with slight push-in.`
- **C4:** `The holographic bar fills block by block until only a tiny teal sliver remains, glowing. His expression shifts from neutral to worried. Very slow push-in.`
- **C5:** `He lowers his gaze to the nearly empty jar, then looks up thoughtfully, small realization nod. Slow push-in on his face, bokeh drifting.`

Negativ (falls das Tool es anbietet): `distorted hands, extra fingers, warped face, changing outfit, changing hair, text, letters, logos, watermark, flicker, morphing`
