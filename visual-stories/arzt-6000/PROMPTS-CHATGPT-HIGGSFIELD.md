# Story 1 „Arzt mit 6.000 € netto“: Produktionsanleitung (fotorealistisch, credit-sparend)

**Stand: Mit diesen Prompts wurden noch keine Medien erzeugt.**
Ablauf: ChatGPT (Bilder) → Higgsfield (Bild zu Video) → Schnitt (CapCut o. Ä.)

> **Hinweis zu Higgsfield:** Menünamen und Credit-Preise ändern sich oft. Ich nenne die Werkzeuge nach Higgsfields eigener Beschreibung, aber **prüfe immer die Credit-Anzeige am Generate-Button**, bevor du klickst. Die Preise stammen aus Vergleichsseiten und sind nicht bestätigt.

---

## 0. Credit-Plan (Szene 1 bis 5, je 5 s)

Richtwerte aus Reviews (nicht bestätigt): Kling 3.0 kostet etwa 1 $ pro 10-s-Clip in 720p, Veo 3.1 etwa 2,90 $ pro 8-s-Clip. Rechne mit 2 bis 3 Versuchen pro brauchbarem Clip.

1. **Standardmodell für alle 5 Clips: Kling (neueste Version).** Es ist deutlich günstiger als Veo und für Menschen im Alltag gut genug.
2. **Auflösung 720p, Länge 5 s.** 1080p brauchst du nicht, da du ohnehin auf 1080 × 960 croppst und das Reel komprimiert wird.
3. **Audio ausschalten**, falls das Modell einen Schalter dafür hat. Du sprichst selbst.
4. **Kein Soul ID/Character-Training für diese Story.** Das verlangt laut Higgsfield rund 20 oder mehr Referenzfotos und kostet Zeit und Credits. Stattdessen reicht das **Start-Frame-Verfahren**: Das ChatGPT-Bild wird als erstes Bild des Videos genutzt und das Gesicht bleibt aus dem Bild erhalten. Soul ID lohnt sich erst, wenn Jonas eine feste Serienfigur wird.
5. **Erst ein Test:** Generiere zuerst nur Szene 1. Wenn Gesicht und Bewegung passen, mach die anderen vier.
6. **Teste im Bild, nicht im Video.** Fehler wie falsche Hände oder Brillen korrigierst du in ChatGPT, denn Bilder kosten bei Higgsfield keine Credits.
7. **Nur wenn der Platz reicht:** Szene 5 (Nahaufnahme) darf mit Veo 3.1 laufen, weil sie die emotionale Schlüsselszene ist.

---

## 1. ChatGPT: Jonas als Referenz anlegen

Lege **einen** Chat an und bleibe für alle Bilder darin. So bleibt das Gesicht am stabilsten.

**Stil-Block (an jeden Bild-Prompt anhängen):**
```
Photorealistic cinematic still, shot on ARRI Alexa with a 35mm lens, natural skin texture with visible pores, realistic lighting, subtle film grain, shallow depth of field, warm natural color grading with soft amber highlights, realistic everyday setting in Germany. Looks like a frame from a modern German TV drama, not CGI, not cartoon, not illustration. No text, no logos, no watermark. Aspect ratio 1:1, main subject centered with headroom, nothing important near the edges.
```
(1:1 statt 9:8, weil ChatGPT das Format sicherer liefert. Du croppst später.)

**Prompt A, Referenzfoto:**
```
Photorealistic portrait photo of "Jonas": 31 years old, German, friendly and approachable, slim athletic build, short dark-brown hair neatly styled, light stubble, brown eyes, thin black rectangular glasses. White doctor's coat over navy scrubs, stethoscope around his neck, hospital ID badge. Waist-up, looking at the camera with a calm smile, soft daylight, neutral grey background. [STIL-BLOCK]
```
Speichere das beste Bild als `jonas_referenz.png`.

---

## 2. ChatGPT: Die 5 Start-Frames

Vor jedem Prompt schreibst du: *„Use exactly this person from my reference image: same face, hair, glasses and age.“* und hängst das Referenzbild an.

**B1 Klinik, Gehalt kommt**
```
Jonas in his white coat and navy scrubs walks down a real German hospital corridor in the early evening, fluorescent ceiling lights, linoleum floor with soft reflections, blurred nurses far in the background. He holds his smartphone and looks at it with a quiet, proud smile. Medium shot at eye level, he is in the center of the frame. [STIL-BLOCK]
```
**B2 Neues Auto** (Outfit: dunkelblauer Pullover)
```
Same Jonas, now wearing a dark navy sweater, sits in the driver's seat of a new dark-grey premium sports sedan without visible brand logos, driving through a German city at golden hour. Sunlight comes through the windshield. Relaxed, satisfied smile, one hand on the steering wheel. Shot from the passenger side, his face clearly visible. [STIL-BLOCK]
```
**B3 Große Wohnung**
```
Same Jonas in his navy sweater stands in the middle of a large, newly renovated city apartment in the evening: high ceilings, big windows with city lights, oak floor, a modern sofa, a few moving boxes. He looks around, impressed, keys in his hand. Wide shot, full body visible. [STIL-BLOCK]
```
**B4 Finanzen am Küchentisch**
```
Same Jonas sits at a kitchen table late in the evening, open laptop, banking app on his phone, a stack of letters and bills, a coffee mug. His face is lit by the screen, he frowns slightly and looks worried. Medium close-up. [STIL-BLOCK]
```
**B5 Erkenntnis**
```
Same Jonas sits on his sofa in the dim apartment at night, city lights out of focus behind him. He leans forward with elbows on his knees, one hand at his chin, looking into the distance with a thoughtful, slightly concerned expression. Close-up. [STIL-BLOCK]
```

**Qualitätscheck pro Bild (bevor du es zu Higgsfield nimmst):**
- Gleiches Gesicht, gleiche Brille wie im Referenzbild?
- Hände und Finger richtig?
- Kein Text und Logo im Bild?
- Person mittig? Rand wird beim Crop abgeschnitten.

Wenn nicht, schreib in ChatGPT nur: *„Same image, but fix [Problem]. Keep everything else identical.“*

---

## 3. Higgsfield: Bild zu Video (pro Szene gleich)

**Schritte:**
1. Higgsfield öffnen, Bereich **Video / Image to Video** wählen (bei Higgsfield auch „Start Frame“ genannt).
2. Das ChatGPT-Bild als **Start Frame** hochladen.
3. Modell **Kling** (neueste Version) auswählen.
4. Einstellungen: **5 s, 720p, Audio aus**, Seitenverhältnis 1:1 (sonst 9:16 und später croppen).
5. Falls es Kamera-Presets gibt: das Preset aus der Tabelle wählen. Sonst die Kamerabewegung in den Prompt schreiben.
6. Motion-Prompt einfügen, Negativ-Prompt einfügen, **Credit-Anzeige prüfen**, dann generieren.
7. Bei Fehlern den Prompt nur leicht anpassen (siehe Fehlerliste unten), nicht komplett neu schreiben.

| Szene | Kamera | Motion-Prompt |
|---|---|---|
| C1 | langsamer Push-in | `He walks slowly toward the camera, glances at his phone and a proud smile spreads across his face. Natural walking motion, background staff softly out of focus.` |
| C2 | seitliche Fahrt (Tracking) | `The car drives smoothly through the city, golden sunlight slides across his face, he smiles and adjusts his grip on the wheel.` |
| C3 | langsamer Schwenk / leichter Bogen | `He looks around the room with an amazed expression, turns slowly, then places the keys on the windowsill.` |
| C4 | sehr langsamer Push-in | `He scrolls on his phone, pauses, exhales and leans back. His expression changes from neutral to worried.` |
| C5 | extrem langsamer Push-in (**Veo 3.1 optional**) | `He stares into the distance, slowly rubs his chin, then gives a small thoughtful nod.` |

**Negativ-Prompt (überall, falls das Feld existiert):**
```
cartoon, 3d render, CGI, plastic skin, distorted hands, extra fingers, warped face, changing face, changing glasses, text, logo, watermark, flicker, morphing
```

**Fehler → Anpassung:**
- Gesicht verändert sich → weniger Bewegung im Prompt, Kamera nur „slow push-in“.
- Hände merkwürdig → Hände im Start-Frame aus dem Bild nehmen (in ChatGPT neu erzeugen mit Händen in den Taschen oder auf dem Tisch).
- Bewegung zu hektisch → „slow“ und „subtle“ ergänzen.

---

## 4. Schnitt (CapCut oder Premiere)

1. Projekt auf **1080 × 1920** anlegen.
2. Oben ein Bereich von **1080 × 960**: Clips hineinziehen und die Mitte croppen. Unten kommt dein Selfie-Video.
3. Clips im Sprechrhythmus aneinanderlegen, 4 bis 5 s pro Szene. Passt das Timing nicht, kürze die Clips oder verlangsame sie leicht auf 90 %.
4. **Overlays selbst einblenden** (nicht von der KI erzeugen lassen): `+6.000 € netto`, `Leasing 900 €`, `Miete 2.000 €`, `übrig: 200 €`.
5. Fußnote: `Beispielrechnung · keine Anlageberatung`.
6. Übergänge: harte Schnitte oder kurze Lichtblitze. Beides wirkt natürlich.

## Quellen für die Higgsfield-Angaben
- [Higgsfield Pricing (Luma Labs)](https://lumalabs.ai/news/higgsfield-pricing)
- [Higgsfield: Charakterkonsistenz](https://higgsfield.ai/blog/keep-ai-character-consistent)
- [Higgsfield Review 2026](https://saascrmreview.com/?p=13747)
