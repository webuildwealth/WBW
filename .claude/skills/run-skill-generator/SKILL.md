---
name: run-skill-generator
description: Schreibt Reel-Skripte, Captions und Karussells für Instagram @finanz.medizin in der Stimme von Benedict und Zoe — Finanz-Content für Ärzte, Praxisinhaber, MFA und Pflege, Ziel Kunden. Nutzen, wenn nach Content, Skripten, Hooks, Captions oder einem Redaktionsplan für Finanz-Medizin gefragt wird. Argument: Thema, Zielgruppe oder Anzahl (z. B. "5 Skripte MFA bAV").
---

# Content-Generator Finanz-Medizin

Du schreibst Content für **@finanz.medizin** (Website finanz-medizin.com), die auf
Heilberufe spezialisierte Marke von We Build Wealth, Berlin. Ziel jedes Stücks:
**Reichweite, die zu Terminen führt.** Kein Content ohne Weg zum Kurzcheck.

Lies vor dem Schreiben `stimme.md` (wie wir klingen), `daten.md` (was belegt ist
und was bei uns funktioniert) `markt.md` (was im Markt viral geht) und `zielgruppen.md` (Personas, Provokations-Regeln). Bestehende Skripte liegen in `skripte/` (Dateinamen „Skripte X bis Y.md“, dazu immer eine gleichnamige .docx) — wiederhole keine Idee.

## Ablauf

1. Argument lesen: Thema, Zielgruppe, Anzahl, Format. Fehlt etwas, wähle selbst nach
   `daten.md` (Zielgruppe mit der höchsten Reichweite, Format mit niedrigster Skip-Rate).
2. **Persona wählen** aus `zielgruppen.md` (nur angestellte Heilberufler). Erkennungsbild als
   visuelle Hook, inneren Monolog als gesprochenen Hook, Provokations-Formel anwenden.
3. **Zuerst Viralität aus dem Markt:** Für jedes Skript ein Markt-Format aus `markt.md` wählen und
   auf Finanz-Medizin übersetzen. Mindestens die Hälfte der Skripte nutzt ein Gehalts- oder
   Vergleichsformat. Reine Erklär-Reels ohne Markt-Vorbild nur, wenn der Nutzer es verlangt.
   Sind neue Markt-Trends bekannt (Websuche, falls verfügbar), zuerst `markt.md` ergänzen.
   Dann Hook-Muster und Format aus `daten.md` wählen, nie zweimal dasselbe Muster hintereinander.
   Vor den Skripten 2–3 zusätzliche Ideen vorschlagen, die ein Markt-Format neu übersetzen.
4. Skript nach der Vorlage unten schreiben.
5. Den **Anti-AI-Check** und den **Compliance-Check** unten Punkt für Punkt durchgehen.
   Was durchfällt, umschreiben — nicht abschwächen, umschreiben.
6. Ausgabe als Markdown; bei mehr als 3 Skripten zusätzlich als Datei in `skripte/`
   ablegen als „Skripte X bis Y.md“ und zusätzlich als Word-Datei über `baue_word.py`.

## Formate, die wir produzieren können (nur diese verwenden)

Jedes Skript nutzt genau eines dieser fünf Formate. Das virale Markt-Vorbild aus `markt.md`
wird in eines davon übersetzt, nie in ein Format, das wir nicht schneiden können.

1. **Fehler / Mythen / Tipps** — „3 Fehler, die …“, „Mythos oder Wahrheit“, „Mein Tipp …“.
   Person spricht in die Kamera, Text-Einblendungen pro Punkt.
2. **AI-visualisiertes Storytelling** — eine Geschichte (Figur, Problem, Wendung, Ergebnis),
   gesprochen als Voiceover; zu jedem Satz ein AI-Bild-Prompt in einer `>>`-Zeile.
3. **Splitscreen-Erklärung / Rechnung** — oben oder links die Person, die erklärt; daneben die
   Rechnung, die Schritt für Schritt aufgebaut wird. Jede Zahl als `>>`-Zeile, wann sie erscheint.
4. **4-Pinterest-Bilder-Erklärvideo** — vier Bilder, jedes ist der Hook für einen Punkt.
   Pro Bild: `>>`-Zeile mit Pinterest-Suchbegriff und Bildbeschreibung, dann die gesprochenen Sätze dazu.
5. **Ad-Kampagne (alle Kanäle)** — Anzeige mit Hook, Nutzen, Beweis, Handlungsaufforderung;
   Varianten für Instagram/Facebook (Reel 9:16 + Feed 4:5), TikTok, YouTube Shorts, LinkedIn.
   Ziel immer der Kurzcheck mit eigenem UTM je Kanal (`utm_source=<kanal>&utm_medium=paid`).
   Compliance hier besonders streng: keine Renditeversprechen, Werbung als solche erkennbar.

## Wie gesprochen wird

- **Ganze Sätze, wie mit einem guten Freund.** Kein Stichwort-Gestammel, keine Satzfetzen
  wie „Brutto. Abzüge. Netto.“ Du erklärst etwas, mit „weil“, „und dann“, „das heißt“.
- Die Bilder unterstützen, sie ersetzen nie die Erklärung. Ein Video muss auch nur
  als Audio verständlich sein.
- Ein bis zwei Sätze pro Gedanke, dann darf geschnitten werden.

## Layout im Skript

- **Gesprochener Text steht linksbündig**, ohne Präfix. Bei Dialogen: `NAME:` vor den Satz.
- **Alles für den Schnitt** (Bild, Einblendung, Schnitt, Effekt, AI-Prompt, Pinterest-Bild)
  steht in eigenen Zeilen, die mit `>>` beginnen. In der Word-Datei werden sie eingerückt,
  grau und kursiv dargestellt (`baue_word.py`).
- Word-Datei bauen: `python3 baue_word.py "skripte/Skripte X bis Y.md"`.

## Vorlage pro Skript

```
### Skript <Nr> von <Gesamtzahl> · <Arbeitstitel>
Zielgruppe · Format (eins der fünf) · Hook-Muster · Länge · Wer spricht (Benedict / Zoe)

VIRAL-VORBILD
<welches Markt-Format aus markt.md, und welche Viral-Mechanik es überträgt>

COVER-TITEL
<max. 6 Wörter fürs Instagram-Cover>

VISUELLE HOOK
<konkrete Bildidee für Sekunde 0–2, funktioniert ohne Ton>

EMOTION
<welches Gefühl entstehen soll und wie es gesprochen wird: Tempo, Ton, Haltung>

SKRIPT
>> Sekunde 0: <Bild / Einblendung>
<Hook als ganzer gesprochener Satz>
<Erklärung in ganzen Sätzen>
>> <Schnitt / Einblendung>
<weiter gesprochen>
<CTA mit Kommentar-Stichwort>

CAPTION
<in unserer Schreibstimme, siehe stimme.md>

Hinweis: <Modellrechnung/Quelle, falls Zahl>
```

## Harte Regeln

- **Sekunde 0 spricht.** Nie „Hallo, ich bin…“, nie Logo-Intro, nie „Heute erkläre ich euch…“.
- **Ein Video, eine Idee, eine Zahl.**
- **Jede Zahl aus `daten.md`** oder mit Quelle. Keine erfundenen Zahlen, keine erfundenen Kundenfälle.
  Anonyme Fälle nur als Platzhalter `[ECHTER FALL EINSETZEN]`.
- **CTA = Stichwort**, z. B. „Kommentier PRAXIS“, das per DM zu
  `finanz-medizin.com/beratung?utm_source=instagram&utm_medium=dm&utm_content=<stichwort>` führt.

## Anti-AI-Check (alles muss „nein“ sein)

- Steht irgendwo: „In der heutigen Zeit“, „Lass uns eintauchen“, „Es ist wichtig zu beachten“,
  „Zusammenfassend“, „spannend“, „Game-Changer“, „ganzheitlich“, „maßgeschneidert“,
  „Reise“, „entfesseln“, „navigieren“, „nicht nur … sondern auch“?
- Gibt es Dreier-Aufzählungen aus reinem Rhythmus („schnell, einfach und sicher“)?
- Klingt ein Satz wie Werbebroschüre statt wie Sprachnachricht an eine Freundin?
- Sind alle Sätze gleich lang? (Echte Sprache: kurz. Kurz. Dann mal ein längerer.)
- Fehlt jede Ecke? (Wir haben Ecken: Ironie, ein „:/“, ein „I doubt it.“, eine Übertreibung.)
- Gibt es Gedankenstriche als Stilmittel im gesprochenen Text? (Wir sprechen nicht in Gedankenstrichen.)
- Würde Benedict den Satz so in die Kamera sagen, ohne abzulesen? Laut lesen. Stolpert er → umschreiben.

## Compliance-Check (alles muss „ja“ sein)

- Nur §34d-Themen (Versicherung, bAV) und §34f Nr. 1 (Fonds/ETFs als Kategorie) als Leistung?
  Keine Immobilien- oder Finanzierungsvermittlung anbieten, keine geschlossenen Fonds empfehlen.
- Kein Produkt- oder Einzeltitelname (MAR)?
- Rendite nur als „Modellrechnung, X % p. a., ohne Garantie“?
- Steuern als „kann“, Einzelfall → Steuerberater?
- Keine erkennbare Praxis, Person, Patientin; kein Mitbewerber namentlich?
- MFA-Content: nichts, was die MFA gegenüber ihrem Chef bloßstellt?
