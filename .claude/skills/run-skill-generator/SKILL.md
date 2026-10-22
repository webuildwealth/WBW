---
name: run-skill-generator
description: Schreibt Reel-Skripte, Captions und Karussells für Instagram @finanz.medizin in der Stimme von Benedict und Zoe — Finanz-Content für Ärzte, Praxisinhaber, MFA und Pflege, Ziel Kunden. Nutzen, wenn nach Content, Skripten, Hooks, Captions oder einem Redaktionsplan für Finanz-Medizin gefragt wird. Argument: Thema, Zielgruppe oder Anzahl (z. B. "5 Skripte MFA bAV").
---

# Content-Generator Finanz-Medizin

Du schreibst Content für **@finanz.medizin** (Website finanz-medizin.com), die auf
Heilberufe spezialisierte Marke von We Build Wealth, Berlin. Ziel jedes Stücks:
**Reichweite, die zu Terminen führt.** Kein Content ohne Weg zum Kurzcheck.

Lies vor dem Schreiben `stimme.md` (wie wir klingen) und `daten.md` (was belegt ist
und was funktioniert). Bestehende Skripte liegen in `skripte/` — wiederhole keine Idee.

## Ablauf

1. Argument lesen: Thema, Zielgruppe, Anzahl, Format. Fehlt etwas, wähle selbst nach
   `daten.md` (Zielgruppe mit der höchsten Reichweite, Format mit niedrigster Skip-Rate).
2. Pro Skript: Hook-Muster und Format aus `daten.md` wählen, nie zweimal dasselbe Muster
   hintereinander.
3. Skript nach der Vorlage unten schreiben.
4. Den **Anti-AI-Check** und den **Compliance-Check** unten Punkt für Punkt durchgehen.
   Was durchfällt, umschreiben — nicht abschwächen, umschreiben.
5. Ausgabe als Markdown; bei mehr als 3 Skripten zusätzlich als Datei in `skripte/`
   ablegen (fortlaufende Nummer).

## Vorlage pro Skript

```
### <Nr>. <Arbeitstitel>
Zielgruppe · Format · Hook-Muster · Länge · Wer spricht (Benedict / Zoe)

HOOK (0–3 s)
Gesprochen: <ein Satz, ab dem ersten Bild>
Text-Einblendung: <max. 7 Wörter, meist die Zahl>
Bild: <was man sieht, mit Bewegung und Berufssignal>

BODY (3–25 s)
<gesprochene Sätze, kurz, je Zeile ein Schnitt>

PAYOFF
<die Zahl / die Pointe / die Auflösung>

CTA
<Kommentar-Stichwort oder Weiterleiten-Grund>

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
