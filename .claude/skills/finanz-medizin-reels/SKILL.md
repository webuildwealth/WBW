---
name: finanz-medizin-reels
description: Reels für Finanz-Medizin (Finanzberatung für Heilberufe) schneiden und animieren – Rohvideo rein, fertiges 9:16-Reel raus. Tight Cut (Pausen, Versprecher, verworfene Takes raus), automatische deutsche Untertitel, Hook als großer Text, Zahlen groß einblenden, leichter Zoom, CTA-Einblendung im letzten Satz, dezente Whooshs, alles in den Markenfarben. Formate: standard, frage, liste, mythos, rechnung. Verwenden, sobald ein Rohvideo für Finanz-Medizin kommt oder der Nutzer „Reel“, „schneiden“, „Skript 07“, „CTA …“, „Take … raus“ oder ein Format nennt.
---

# Finanz-Medizin Reels

Werkzeug: `python3 <skill>/scripts/reel.py` (im Folgenden `reel`). ffmpeg schneidet, HyperFrames
(HTML + GSAP, Version fest auf 0.8.184) rendert die Einblendungen, Parakeet erkennt die Sprache mit Wortzeiten.
Arbeitsordner: `$FM_ROOT`, sonst `~/Videos/FinanzMedizin` mit `original/` (nur lesen), `fertig/`, `assets/`,
`arbeit/<nr>/` (Zwischendateien).

## Ablauf

0. **Einmal pro Sitzung:** `reel check`. Fehlt etwas, siehe „Einrichtung“ unten.
1. **Erst besprechen, dann schneiden.** Skript, CTA und Caption mit dem Nutzer festlegen. Nicht schneiden, bevor
   das steht. Das Skript als Textdatei speichern (`arbeit/<nr>/skript.txt`), es korrigiert die Untertitel.
2. **Pro Video nennt der Nutzer:** Skriptnummer, CTA-Stichwort, welche Takes rausfliegen.
3. **Vorbereiten:** `reel prep <rohvideo> --nr <nr>`. Querformat: `--crop-x 0..1` setzt den Ausschnitt, das
   Standbild `arbeit/<nr>/still.jpg` ansehen. Die Ausgabe listet die Takes (T1, T2, …) mit Text.
   Passt die Nummerierung des Nutzers nicht eindeutig zu dieser Liste, die Liste zeigen und nachfragen.
   Hinweis „ähnlich wie …“ = vermutlich verworfener Versuch; behalten wird der letzte vollständige Take.
4. **Schnitt:** `reel cut <nr> --drop T2,T4` (Takes) und `--drop-range von-bis` (Rohsekunden) für unwichtige
   Details. Den ausgegebenen „Text nach dem Schnitt“ wie ein Skript lesen: keine Wiederholungen, keine halben
   Sätze, Länge 10–45 s. Dann `reel render-cut <nr>`.
5. **Einblendungen:** `reel spec <nr> --cta STICHWORT --format <format> --hook "Zeile 1|Zeile *2*"
   --script arbeit/<nr>/skript.txt [--cta-sub "…"] [--logo]`. Danach `arbeit/<nr>/spec.json` von Hand
   nacharbeiten (siehe FORMATE.md): Zahlen beschriften oder streichen, Hervorhebungen mit `*…*` setzen,
   Zeiten prüfen. Der Hook kommt aus dem Skript, nicht erfunden.
6. **Bauen und prüfen:** `reel build <nr>` (Lint muss 0 Fehler melden; Warnungen zu Sub-Kompositionen sind
   normal), dann `reel preview <nr> --at <Hook>,<Zahl>,<CTA>,…` und jedes Standbild ansehen: echte Schrift (Manrope/
   Inter, kein Ersatz), nichts läuft aus dem Bild, Gesicht frei, nichts in den Instagram-Rändern.
7. **Rendern:** `reel render <nr>` -> `fertig/<nr>_<STICHWORT>.mp4` (1080×1920, 30 fps, H.264 High CRF 17,
   AAC 256k, −14 LUFS / −1 dBTP). Die vereinbarte Caption als `fertig/<nr>_<STICHWORT>.txt` daneben legen.
8. **Übergeben:** Video mit `SendUserFile` schicken (bis etwa 30 MB; sonst die `_handy.mp4`-Kopie). Kurz
   berichten: Roh- und Schnittlänge, was rausgeflogen ist, wo Hook, Zahlen, Zooms und CTA sitzen, was unsicher war.

Videos aus dem Chat liegen unter `~/.claude/uploads/…`. Die App komprimiert große Videos vor dem Hochladen und
bricht dabei manchmal ab; dann fehlt der `moov`-Block und ffprobe meldet „moov atom not found“. In dem Fall
um erneutes Hochladen bitten (App im Vordergrund lassen, bis der Upload fertig ist) statt zu reparieren.

## Marke und Stil (Vorgaben des Nutzers)

- Dunkelblau `#0C2C4F` · Bordeaux `#751524` · Elfenbein `#F4F0EF`. Auffällige Stellen: roter Text auf weißem
  Kasten (`*…*` in spec.json). Manrope für Hook, Zahlen, CTA; Inter für Untertitel.
- Schnelles Tempo, Pausen raus, unwichtige Details raus. Leichter Zoom bei wichtigen Stellen.
- Hook als großer Text in den ersten 2–3 Sekunden, kein Intro vor dem Hook.
- Wichtige Zahlen kurz groß einblenden. CTA immer, als Einblendung im letzten Satz, keine Endkarte.
- Keine Musik. Übergänge und Soundeffekte schlicht, dezente Whooshs sind okay.
- Länge 10–45 Sekunden. Ausgabe 1080×1920, 30 fps, H.264, hohe Qualität.
- Untertitel automatisch (Parakeet), mit dem Skript abgeglichen; ohne Spracherkennung aus dem Skript.

## Inhaltliche Regeln

- **Keine Disclaimer im Video.**
- Caption: nur wenn es um steuerliche Optimierung geht, ganz am Ende:
  „Alles ist individuell, die Hinweise ersetzen keine Beratung.“
- **Keine Renditeversprechen** – weder im Hook noch in Zahlen-Einblendungen, CTA oder Caption. Zahlen nur für
  Fakten (Steuersätze, Grenzen, Kosten, einfache Rechnungen), nie als erwartete Rendite.
- Erlaubnisumfang beachten: Finanz-Medizin vermittelt nach § 34d und § 34f Abs. 1 Nr. 1 GewO (offene
  Investmentvermögen). Geht ein Skript um Immobilien, geschlossene Fonds oder Beteiligungen, vor dem Schnitt
  darauf hinweisen.

## Layout (1080 × 1920)

Oben (ab 290 px): Hook, Frage-Karte, Zahlen, Listenpunkte, Mythos/Fakt, CTA – immer nur eins davon gleichzeitig.
Unten (ab 1255 px, links vom rechten Rand): Untertitel. Dazwischen bleibt das Gesicht frei. Freigehalten werden
oben 250 px, unten 400 px, rechts 150 px. Zoom-Mittelpunkt `origin` in spec.json (Standard `50% 38%`, auf
Augenhöhe anpassen, wenn das Gesicht woanders sitzt).

## Einrichtung

- Mac: `brew install ffmpeg node` (Node 22+). Dann `npx -y hyperframes@0.8.184 browser ensure` und
  `npx -y hyperframes@0.8.184 models install parakeet`.
- Ist Hugging Face gesperrt (Cloud-Umgebung), das Modell von GitHub holen und an die erwartete Stelle legen;
  die Prüfsummen sind identisch:
  ```bash
  curl -L -o /tmp/pk.tar.bz2 https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2
  mkdir -p ~/.cache/hyperframes/parakeet/parakeet-tdt-0.6b-v3-int8
  tar -xjf /tmp/pk.tar.bz2 -C /tmp && cp /tmp/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/{encoder.int8.onnx,decoder.int8.onnx,joiner.int8.onnx,tokens.txt} ~/.cache/hyperframes/parakeet/parakeet-tdt-0.6b-v3-int8/
  npx -y hyperframes@0.8.184 models install parakeet   # installiert nur noch die Laufzeit
  ```
- Eigenes Logo: `assets/logo-signet.png` im Arbeitsordner ersetzt das mitgelieferte Signet (CTA mit `--logo`,
  Frage-Karte). Whooshs neu erzeugen: `reel sfx`.

## Grenzen

- Kein automatisches Gesichts-Tracking: Querformat-Ausschnitt über `--crop-x`, Zoom-Mittelpunkt über `origin`.
- HDR-Aufnahmen (iPhone) werden beim Vorbereiten auf SDR umgerechnet; Farben am Standbild prüfen.
- Ein Rendering nach dem anderen; 20 s Reel brauchen hier etwa 1,5 Minuten.
