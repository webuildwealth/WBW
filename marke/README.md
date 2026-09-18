# Markenmaterial — Archiv

Ausgangsdateien der Marke. **Nicht die Fassungen, die die Website ausliefert** —
die liegen in `assets/img/` und sind für das Web optimiert.

| Datei | Was es ist |
|---|---|
| `finanz-medizin-logo-original.svg` | Logo, wie geliefert |
| `entwurf-2026-08-27.png` | unsortierter Entwurf, Herkunft ungeprüft |

## Zum SVG: es ist keines

Die Datei trägt die Endung `.svg`, enthält aber keine Vektoren. Im Inneren steckt
ein PNG, base64-kodiert in eine SVG-Hülle gepackt:

```xml
<svg width="1533" height="1026">
  <image href="data:image/png;base64,iVBORw0KGgo…">
```

Das hat zwei Folgen, die man kennen sollte:

- **Es skaliert nicht.** Über 1533 Pixel Breite wird es unscharf wie jedes
  Rasterbild. Der Vorteil, für den man ein SVG nimmt, ist nicht vorhanden.
- **Es ist 1,3 MB groß** — dieselbe Bildinformation liegt in `assets/img/` als
  PNG mit 31 KB und als WebP mit 54 KB vor.

Deshalb wird diese Datei **nicht** auf der Website eingebunden. Sie liegt hier,
weil sie die gelieferte Ausgangsfassung ist.

Wer ein echtes Vektorlogo braucht — für Druck, Stempel, Fahrzeugbeschriftung oder
große Formate —, muss es nachzeichnen lassen. Aus dieser Datei lässt es sich
nicht gewinnen.
