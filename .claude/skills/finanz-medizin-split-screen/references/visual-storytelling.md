# Visuelles Storytelling – vom Gesagten zum Bild

Das ist die Kernaufgabe. Der Skill (= Claude als Regisseur) schreibt das **Storyboard `story.json`**; die Scripts rendern es.
Kein Script „versteht“ Inhalte. Qualität entsteht durch die Entscheidungen hier.

## 1. Vorgehen (immer in dieser Reihenfolge)
1. **Transkript lesen** (`out/transcript.txt`, bereinigt) oder Skript lesen.
2. **Kernaussage in einem Satz** formulieren. Alles Bildliche dient dieser Aussage.
3. **Beats bestimmen**: Wo ändert sich Gedanke, Zahl, Ort, Zeit, Perspektive? Ein Beat = eine Szene. Typisch 4–10 Szenen pro 30–45 s.
4. Pro Beat die Frage: *Was würde ein Zuschauer ohne Ton sehen müssen, um genau diesen Satz zu verstehen?* → Szenentyp wählen (Tabelle 2).
5. **Figuren/Orte festlegen** (Abschnitt 3) und durchgängig verwenden.
6. **Zahlen klären** (Abschnitt 4) – bevor irgendetwas gerendert wird.
7. **Anker setzen**: `"at": "<Phrase aus dem Gesagten>"` je Szene (Abschnitt 5).
8. `storyboard.py resolve/check` → Vorschau-Stills ansehen (`--still-only`) → erst dann voll rendern.

## 2. Wahl des Szenentyps
| Gesagt wird … | Szenentyp | Beispiel |
|---|---|---|
| Person/Situation/Lebensphase („ein Arzt…“, „im Ruhestand“) | `character` (+ `env`, `age`, `ageTo`, `badge`, `warn`) | Arzt 38 → 67, Wohnung → Ruhestand |
| ein Betrag, eine Quote, ein Zähler | `counter` / `stat` | 100 € zählt hoch, „−44,6 %“ |
| zwei Größen im Vergleich, Differenz/Lücke | `gap_bars` | 6.000 € vs. 3.200 € → Lücke 2.800 € |
| Entwicklung über Zeit mit Zinseszins/Inflation | `inflation` (rechnet echt), `timeline` | 100 € bei 3 % über 20 Jahre |
| Zeitstrahl, Phasen, Meilensteine | `timeline` (+ `markers`) | Jahr 0 → 30 |
| Behauptung/Irrtum/Mythos | `myth` (durchgestrichen + Stempel) | „Erst wenn du gar nicht mehr arbeiten kannst?“ |
| Gegenüberstellung Richtig/Falsch, Vorher/Nachher, Option A/B | `compare` (mit ✓/✗) | Was viele glauben / Was oft zählt |
| Aufzählung (Fehler, Schritte, Gründe) | `bullets` | 3 häufige Fehler |
| Einstieg/Themenkarte/Fazit | `title` (fette Grotesk + kursiver Akzent) | „Drei Fehler *kosten Geld*“ |
| eigenes/generiertes Bild, Screenshot, Dokument | `image` (Ken-Burns-Zoom/Pan) | Police, Gehaltsabrechnung |
| Metapher/Bildidee ohne passenden Typ | `svg` – von Claude gezeichnete Illustration mit animierten Ebenen | Weg mit drei Stolperfallen, löchriger Eimer „Rente“ |

Zusätzlich je Szene `callouts` (handschriftliche Annotation + Pfeil), `warn` (rotes Warndreieck), `badge` (Zahlenkarte an Figur).
**Keine Dekoration ohne Aussage**: Wenn ein Bild nichts erklärt, streichen und die vorige Szene verlängern/verändern.

## 3. Konsistente Figuren und Orte
- Figuren stehen in `figures{}` (Name → `gender`, `hair`, optional `glasses`). Standardfigur: `doc` (Arzt, männlich, dunkles Haar); `gender:"f"` für Ärztin.
- **Dieselbe Figur** bleibt über alle Szenen; Alterung nur über `age`/`ageTo` (Haare ergrauen, Falten, Brille, Haltung, Gehstock ab 64,
  Freizeitkleidung im Ruhestand). Zeitraffer = `ageTo` + `year`→`yearTo` + `envTo` (Umgebung blendet um die Mitte der Alterung über).
- Orte (`env`): `apartment`, `hospital`, `praxis`, `retirement`. Wiederkehrende Orte behalten Position der Möbel → Zuschauer erkennt sie wieder.
- Stimmung: `mood:"worried"` für Problem-Beats, Standard freundlich; `pose:"wave"` für Begrüßung.
- Neue Figuren/Orte: in `templates/engine.js` (`person()`, `ENVS`) ergänzen – im selben flachen Vektorstil, Markenfarben.
- Realistische/KI-Bilder (Typ `image`) nur, wenn ein Bildgenerator verfügbar ist **und** die Rechte geklärt sind; immer mit Bewegung (Zoom/Pan) und passender Bildunterschrift.

## 4. Zahlen – nie erfinden
Jede gezeigte Zahl muss eine von drei Herkünften haben, sonst bricht `storyboard.py check` ab:
1. **Skript/Transkript** (steht im gesprochenen Text),
2. **`assumptions[]`** (Beispielannahme, z. B. Ruhestandseinkommen 3.200 €) – mit Text; `"approved": true` erst nach Freigabe durch die verantwortliche Person bzw. Fachprüfung,
3. **`derived[]`** (Berechnung aus 1/2, z. B. `"formula":"6000-3200"`, Ergebnis wird nachgerechnet).
Annahmen, die nicht im Video gesagt werden, **sichtbar kennzeichnen** (z. B. Callout „Beispielrechnung“) oder den Sprecher bitten, sie zu nennen.
Inflation: Der Szenentyp `inflation` rechnet `Betrag / (1 + Rate)^Jahre`; 100 € bei 3 % nach 20 Jahren = **55,37 €** (−44,6 %); Warenkorb teurer: ×1,806.

## 5. Synchronisierung
- Szenenbeginn = erstes Wort der `at`-Phrase − `lead` (Standard 0,12 s): Bild erscheint minimal *vor* dem Wort. Mindestabstand 0,4 s zur vorigen Szene.
- Ende einer Szene = Beginn der nächsten; letzte Szene endet mit dem Video. Keine Lücken, keine Überlappungen.
- `at` ist case-/satzzeichen-unabhängig, sucht ab der vorigen Szene vorwärts. Eindeutige, kurze Phrasen (2–3 Wörter) wählen.
- Wortinterne Effekte (Stempel, Zahl springt, Balken wächst) per Props-Zeitversatz (`stamp_t`, `gap_t`, `badge.t`, `callouts[].t`) auf das Wort legen:
  Wortzeit aus `storyboard.resolved.json → words` minus Szenenstart.
- Modus C ohne Audio: Wortzeiten sind **Schätzungen** (≈ 2,7 Wörter/s) – nach der echten Aufnahme `build_reel.py --video …` mit demselben Storyboard erneut laufen lassen, Sync folgt dann automatisch den echten Wortzeiten.

## 6. Tempo und Dramaturgie
- Szenenlänge richtet sich nach Inhalt: Zahl/Pop 1–2 s, Figurenszene 2–3 s, Diagramm/Rechnung 3–5 s, Zeitraffer bis 4 s. **Nie > 6–7 s ohne neue Veränderung** (Callout, Zahl, Zoom nachlegen).
- Kurzer Satz, großes Thema → mehrere schnelle Veränderungen erlaubt (Szene + Callouts + Badge).
- Interessante Animation (Alterung, Kurve) darf lang stehen – das Auge folgt der Bewegung.
- Übergänge: `push` (neuer Gedanke), `slide` (Fortsetzung/nächster Schritt), `zoom` (Pointe/Zahl), `fade` (gleiche Szene weitergeführt), `wipe` (Zeitsprung), `cut` (gleiche Figur, andere Phase).
- Dramaturgie-Schema für 30–45 s: **Hook (Problem/Frage, 0–3 s) → Bild der Situation → Zahl/Beweis → Konsequenz → Lösung/Handlung → CTA** (CTA-Karte als `title`).

## 7. Die drei Referenz-Übersetzungen (liegen als `examples/A|B|C_*.json` vor)
**A – Altersvorsorge** (Arzt, 6.000 € netto): `character` (Wohnung, winkend) → `character`+`badge` „6.000 €“ → Zeitraffer 38→67, 2026→2055,
Wohnung→Ruhestandsort → `character` (67, sorgenvoll, Gehstock) → `gap_bars` (6.000 vs. 3.200 [Annahme], Lücke berechnet) → `counter` „2.800 € Versorgungslücke“.
**B – Berufsunfähigkeit**: `character` Krankenhaus → `warn`-Dreieck → `myth` mit Stempel „MYTHOS“ → `myth` „Pauschal falsch.“ → `compare`
(Was viele glauben / Was oft zählt) mit Callout „tarifabhängig!“. Fachliche Aussagen zu Bedingungen **immer vom Berater/Compliance freigeben lassen**.
**C – Inflation**: `counter` „100 €“ → `timeline` Jahr 0→20 → `inflation` (Kurve 100→55,37 €, Badge −44,6 %) → `counter` „44,6 %“ + Zusatz „ca. 55 € Kaufkraft“.

## 8. Storyboard-Schema (Autorenformat)
```jsonc
{
 "meta": {"title":"…", "fps":30, "ratio":0.5, "subtitles":{"max_words":3,"enabled":true,"font_size":null}, "keywords":["Ruhestand"]},
 "script": "voller gesprochener Text (für Zahlenprüfung/Modus C)",
 "figures": {"doc":{"gender":"m","hair":"2B2320"}},
 "assumptions": [{"value":3200,"unit":"€/Monat","text":"Beispiel…","approved":false}],
 "derived": [{"value":2800,"formula":"6000-3200","decimals":0}],
 "scenes": [{
   "id":"s1", "at":"verdient 6.000",           // Anker (erste Szene startet bei 0)
   "type":"character", "transition":"fade", "tr_duration":0.2,
   "props":{ … typabhängig, siehe animation-guide.md … },
   "callouts":[{"t":1.0,"text":"Beispiel","x":200,"y":300,"arrow":{"dx":120,"dy":80}}],
   "keywords":["netto"],                      // Untertitel rot hervorheben
   "sfx":["ding"]                             // zusätzlich zu den automatischen Effekten
 }]
}
```
