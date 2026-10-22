# Story 1 „Arzt mit 6.000 € netto“ – Prompt-Paket (fotorealistisch)
**Mit diesen Prompts wurden noch keine Medien erzeugt.** Workflow: ChatGPT (Bilder) → Higgsfield (Image-to-Video) → Schnitt.

## Stil: realistisch und alltagsnah
Ziel: Die Bilder sollen wie ein echter Kurzfilm oder eine hochwertige Werbung aussehen und kein Cartoon sein. Normale Menschen, echte deutsche Orte (Klinikflur, Altbau- und Neubauwohnung, Tiefgarage), natürliches Licht. Der Zuschauer soll denken: „Das könnte ich sein.“

**Stil-Block (an jeden Bild-Prompt anhängen):**
```
Photorealistic cinematic still, shot on ARRI Alexa with a 35mm lens, natural skin texture with visible pores, realistic lighting, subtle film grain, shallow depth of field, warm and natural color grading with soft amber highlights, realistic everyday setting in Germany. Looks like a frame from a modern German TV drama or a premium commercial, not CGI, not cartoon, not illustration. No text, no logos, no watermark. Aspect ratio 9:8, main subject centered with headroom.
```

## A – Charakterreferenz Jonas (ChatGPT, zuerst erstellen)
```
Realistic portrait photo series of the same man, "Jonas": 31 years old, German, friendly and approachable, slim athletic build, short dark-brown hair neatly styled, light stubble, brown eyes, thin black rectangular glasses. Wears a white doctor's coat over navy scrubs, a stethoscope around his neck and a hospital ID badge. Create 4 photos: front portrait, 3/4 view, side profile, full body standing. Same face in every photo, neutral grey studio background, soft daylight. [STIL-BLOCK]
```
Zusätzlich ein Outfit „privat“: *same man, same face, wearing a dark navy sweater and chinos.* Das brauchst du für die Szenen 2 bis 5.

**Tipp für gleichbleibende Gesichter:** In jedem neuen Chat zuerst das Referenzbild hochladen und schreiben: *„Use exactly this person, same face, hair, glasses and age.“* In Higgsfield kannst du Jonas alternativ als **Soul ID / Character** anlegen, dann bleibt das Gesicht über alle Clips stabil.

## B – Szenenbilder (ChatGPT, Referenz hochladen)
**B1 Klinik, Gehalt kommt:**
`Use exactly this person. Jonas walks down a real German hospital corridor in the early evening, fluorescent ceiling lights, linoleum floor with reflections, nurses blurred in the background. He holds his smartphone and looks at it with a quiet, proud smile. Medium shot, camera in front of him at eye level. [STIL-BLOCK]`

**B2 Neues Auto:**
`Use exactly this person, wearing his navy sweater. Jonas sits in the driver's seat of a new dark-grey premium sports sedan (no visible brand logo), driving through a German city at golden hour, sunlight flaring through the windshield. Relaxed, satisfied smile, one hand on the steering wheel. Shot from the passenger side. [STIL-BLOCK]`

**B3 Große Wohnung:**
`Use exactly this person, wearing his navy sweater. Jonas stands in a large, newly renovated city apartment in the evening: high ceilings, big windows overlooking city lights, oak floor, a designer sofa, still a few moving boxes. He looks around, impressed, keys in his hand. Wide shot. [STIL-BLOCK]`

**B4 Kontoauszug:**
`Use exactly this person. Jonas sits at his kitchen table late in the evening, laptop open, banking app on his phone, a stack of letters and bills next to a coffee mug. His face is lit by the screen; he frowns slightly, worried. Medium close-up. [STIL-BLOCK]`

**B5 Erkenntnis:**
`Use exactly this person. Close-up of Jonas sitting on his sofa in the dim apartment at night, city lights behind him out of focus. He leans forward, elbows on his knees, hand rubbing his chin, looking into the distance with a thoughtful, slightly concerned expression, realizing something. [STIL-BLOCK]`

## C – Higgsfield-Motion-Prompts (Image-to-Video, je ~5 s)
| Szene | Kamera-Preset | Motion-Prompt |
|---|---|---|
| C1 | Dolly In | `He walks slowly toward the camera, glances at his phone and a proud smile spreads across his face. Natural walk, realistic body movement, background staff moving softly out of focus.` |
| C2 | Car Grip / Tracking | `The car drives smoothly through the city, golden sunlight and shadows slide across his face, he smiles and adjusts his grip on the wheel.` |
| C3 | Slow Pan / Arc | `He steps into the room, turns slowly while looking around, a small amazed laugh, then puts the keys on the windowsill.` |
| C4 | Slow Push In | `He scrolls on his phone, pauses, exhales and leans back; his expression turns from neutral to worried.` |
| C5 | Super Slow Push In | `He stares into the distance, slowly rubs his chin, then gives a small, thoughtful nod.` |

Negativ-Prompt (falls verfügbar): `cartoon, 3d render, CGI, plastic skin, distorted hands, extra fingers, warped face, changing face, changing glasses, text, logo, watermark, flicker, morphing`

## D – Schnitt
- Clips auf **1080 × 960** croppen (obere Reel-Hälfte). Den Bildmittelpunkt beim Generieren mittig halten.
- Zahlen im Schnitt als dezente Overlays einblenden: *+6.000 € netto*, *Leasing 900 €*, *Miete 2.000 €*, *übrig: 200 €*. Dazu die Fußnote „Beispielrechnung · keine Anlageberatung“.
- Übergänge: kurze Licht- oder Weißblitze, sonst harte Schnitte im Sprechrhythmus.
