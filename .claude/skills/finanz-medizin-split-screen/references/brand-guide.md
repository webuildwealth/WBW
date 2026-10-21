# Corporate Design Finanz-Medizin

Quelle: Design-System der Website (`assets/css/site.css`, README „Design-System“, `BASE44-BRIEF.md`) – Werte unverändert übernommen.
Markenfarben laut Auftrag: **Rot, Blau, Weiß**.

## Farben
| Token | Hex | Verwendung im Reel |
|---|---|---|
| Navy 800 | `#0C2C4F` | Primärfarbe, Haupttext, Balken „Heute“, Trennlinie |
| Navy 900 | `#071B32` | Schatten, Konturen, dunkle Details |
| Navy 700 / 500 | `#11395F` / `#1E5A88` | Flächen (Sofa, Kittel-Details), Karten-Akzente |
| Navy 300 / 100 / 050 | `#6F93B4` / `#D6E1EC` / `#EDF2F7` | sekundäre Balken, Linien, Wandfarbe |
| Rot 500 | `#A5293B` | **Akzent**: Zahlen, Warnungen, Kurven, Lücke, hervorgehobene Wörter |
| Rot 700 / 600 | `#751524` / `#8C1E2F` | Schattenkanten, Dach, Stempel-Rand |
| Rot 100 / 050 | `#F1DDE0` / `#FAF0F1` | Flächenfüllung „Verlust/Lücke“ |
| Elfenbein | `#F4F0EF` | Hintergrund der Visualisierung |
| Weiß | `#FFFFFF` | Karten, Kittel |
| Grün 700 / 050 | `#17683F` / `#E4F3EA` | nur für ✓ „richtig/positiv“ und Pflanzen – sparsam |
Regel: **Navy = Information, Rot = Aufmerksamkeit/Problem, Weiß/Elfenbein = Ruhe.** Pro Bild genau ein roter Schwerpunkt.

## Typografie (lokal in `assets/fonts/`, OFL-Lizenz)
- **Manrope** (Variable, 200–800): Headlines, Zahlen, Untertitel, UI-Texte – Gewicht 800 für Schlagzeilen/Zahlen, 700 für Labels.
- **Newsreader Italic**: Akzentwörter in Headlines, Callouts, Zitate – nur in Rot oder Navy.
- **Inter**: kleiner Fließtext (selten; Reel-Text soll ohnehin kurz sein).
Keine weiteren Schriften, keine Systemschriften-Fallbacks im Endergebnis (Render prüft per `document.fonts.ready`).

## Logo
`assets/img/mark-finanz-medizin.png` (Zeichen: Äskulapstab im blau-roten Ring mit Balken) als 70-px-Badge auf der Trennlinie;
`logo-finanz-medizin.png` für Endkarte/CTA (`image`-Szene). Logo nicht verzerren, nicht umfärben.

## Tonalität
Seriös, klar, du-Ansprache (wie im Beispielskript), keine Panikmache, keine Heilsversprechen. Zielgruppe: Ärzte, Praxisinhaber, MFA/ZFA und weitere
medizinische Berufe → Beispiele aus dem Praxis-/Klinikalltag (Dienstplan, Praxisübernahme, Nettogehalt, Berufsunfähigkeit).
Themen: Altersvorsorge, Vermögensaufbau, Versicherungen, Steuern, Geldanlage, finanzielle Fehler, Mitarbeiterbindung, Praxisfinanzen.

## Compliance-Hinweise (keine Rechtsberatung – vor Veröffentlichung intern/anwaltlich prüfen lassen)
- Keine Renditegarantien; Beispielrechnungen als **Beispiel** kennzeichnen (Callout), Annahmen offenlegen (`assumptions`).
- Produkt-/Tarifaussagen (z. B. BU-Bedingungen) sind tarifabhängig → „tarifabhängig“-Hinweis, keine Pauschalversprechen.
- Werbekennzeichnung und Pflichtangaben/Impressum nach geltendem Recht in der Caption ergänzen; HWG/UWG-Grenzen für Heilberufe-Bezug beachten.
- Keine echten Personen/Patientendaten in Beispielen; Figuren sind fiktiv.
