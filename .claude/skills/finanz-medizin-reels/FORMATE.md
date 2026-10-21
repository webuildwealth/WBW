# Formate und spec.json

Alle Formate teilen Schnitt, Untertitel, Zoom, CTA und Whooshs. Sie unterscheiden sich in dem, was oben im
Bild erscheint. `reel spec` legt einen Vorschlag an; danach wird `arbeit/<nr>/spec.json` von Hand angepasst.

| Format | Wofür | Oben im Bild | spec-Aufruf |
|---|---|---|---|
| `standard` | Ein Gedanke, eine Botschaft | Hook (2–3 s), Zahlen, CTA | `--hook "Zeile 1|Zeile *2*"` |
| `frage` | Frage aus der Praxis beantworten | Frage-Karte mit Signet statt Hook | `--hook "Lohnt sich …?"` |
| `liste` | „3 Fehler“, „3 Tipps“ | Nummer + Titel je Punkt | `--items "A|B|C"`, erkennt „Erstens/Zweitens …“ |
| `mythos` | Irrtum aufklären | MYTHOS (wird durchgestrichen), dann FAKT | `--mythos "…" --fakt "…"` |
| `rechnung` | Beispielrechnung | Zahlen zählen hoch, dichter getaktet | Zahlen kommen aus dem Gesprochenen |

Elemente lassen sich frei mischen: Ein `standard`-Reel kann eine Mythos-Karte bekommen, eine Liste eine Zahl.
Oben steht immer nur ein Element gleichzeitig – Zeiten so legen, dass sie sich nicht überschneiden.

## spec.json

Alle Zeiten in Sekunden auf der Zeitleiste des **geschnittenen** Videos. `*Wort*` = Hervorhebung
(Bordeaux, in Untertiteln roter Text auf weißem Kasten).

```json
{
 "nr": "07", "format": "standard", "duration": 31.2,
 "origin": "50% 38%",
 "jumpcut_zoom": true,
 "hook": {"start": 0, "end": 2.6, "lines": ["Angestellte Ärzte", "zahlen *zu viel* Steuern?"]},
 "captions": [{"start": 3.1, "end": 4.2, "text": "Ab rund *70.000 Euro*"}],
 "numbers": [{"start": 7.9, "end": 9.3, "value": "42 %", "label": "Spitzensteuersatz"},
             {"start": 18.4, "end": 20.3, "value": "960 €", "label": "im Jahr",
              "count": {"to": 960, "dec": 0, "suffix": " €"}}],
 "zooms": [{"start": 0, "end": 2.6, "scale": 1.08, "ease": "none"},
           {"start": 7.9, "end": 9.3, "scale": 1.14}],
 "cta": {"start": 27.5, "keyword": "RENTE", "top": "Kommentiere", "sub": "und ich schicke dir die Übersicht",
         "logo": false},
 "cuts": [3.27, 9.53],
 "sfx": [{"at": 0, "name": "whoosh"}, {"at": 7.85, "name": "whoosh-soft", "volume": 0.32}]
}
```

- `origin`: Zoom-Mittelpunkt, auf Augenhöhe legen.
- `jumpcut_zoom`: an Schnittstellen (`cuts`, kommt von `render-cut`) zwischen 100 % und 106 % springen,
  höchstens alle 2,5 s.
- `zooms`: leichter Zoom an wichtigen Stellen; `"ease": "none"` = langsames Heranfahren über die ganze Dauer.
- `numbers[].count`: Zahl zählt hoch bis `to` (`dec` Nachkommastellen, `suffix` Einheit).
- `cta.logo`: Signet im CTA-Kasten. `sfx[].name`: `whoosh` oder `whoosh-soft`, `volume` Standard 0.32.

Weitere Blöcke je Format:

```json
{
 "question": {"start": 0, "end": 3, "label": "Frage aus der Praxis", "text": "Lohnt sich eine *BU* schon im Studium?"},
 "items": [{"start": 4.5, "end": 6.2, "n": 1, "of": 3, "title": "Gesundheitsfragen"}],
 "myth": [{"start": 10.9, "end": 13.1, "kind": "mythos", "text": "Das Versorgungswerk reicht"},
          {"start": 13.2, "end": 16.3, "kind": "fakt", "text": "Zahlt meist nur bei *vollständiger* BU"}]
}
```

`question` ersetzt `hook`. Nicht gebrauchte Blöcke einfach weglassen. Nach jeder Änderung:
`reel build <nr>`, dann `reel preview <nr> --at …`.

## Gestaltung anpassen

- Farben, Größen, Positionen: `template/reel.css` (alles in Pixeln auf 1080 × 1920).
- Bewegungen (Einflug, Dauer, Federung, CTA-Puls): `template/engine.js`, ein Eintrag je Elementtyp.
- Änderungen gelten für alle künftigen Reels; bereits gebaute Projekte mit `reel build <nr>` neu erzeugen.
