# CONTENT-FORMATE (A–F)

Jedes Format hat eine **Vorlage** in `templates/storyboards/format-*.json` (lauffähig, Beispielinhalte mit Prüfhinweis). Kernregel: **ein Gedanke pro Szene**, jede Szene bekommt die Visualisierung, die den Inhalt erklärt (nicht dekoriert).

| Format | Vorlage | Szenenfolge | Ziellänge |
|---|---|---|---|
| A – 3–5 Tipps | `format-a-tipps.json` | hook → tip ×3–5 → outro | 30–45 s |
| B – Fehler | `format-b-fehler.json` | hook → error ×3–4 (Fehler → Folge → Besser) → outro | 35–50 s |
| C – Mythos vs. Realität | `format-c-mythos.json` | hook → myth → (stat/bars) → fact → tip → outro | 40–55 s |
| D – Fakten/Aha | `format-d-fakt.json` | hook → stat → bars → fact → outro | 25–40 s |
| E – Mini-Checkliste | `format-e-checkliste.json` | hook → checklist → outro | 20–35 s |
| F – Vergleich/Erklärung | `format-f-vergleich.json` | hook → compare → fact → outro | 25–40 s |

## Wahl der Visualisierung (Entscheidungstabelle)
| Aussage im Skript | Szenentyp | Warum |
|---|---|---|
| „Tipp/Regel + Begründung“ | `tip` (blaues Infofeld, Icon, optional KPI) | Reihenfolge und Zählung sichtbar |
| „Fehler – Folge – besser“ | `error` (rote Karte → Folge-Box → weiße Alternative) | Kausalität in 3 Schritten |
| „Behauptung wird geprüft“ | `myth` (Karte → Scan → Stempel → Flip auf Fakt) | Spannung → Auflösung |
| „Eine Zahl, die überrascht“ | `stat` (Count-up + Ring) | Größe/Anteil sofort erfassbar |
| „Entwicklung über Zeit“ | `bars` (wachsende/schrumpfende Balken, Delta-Chip) | Verlauf ohne Achsenlesen |
| „A gegen B“ | `compare` (Spaltenkopf blau/rot, Zeilen) | gleiche Kriterien nebeneinander |
| „Prüfe diese Punkte“ | `checklist` (Haken zeichnen sich) | Abarbeiten = Belohnung |
| „Kernaussage/Merksatz/Quelle“ | `fact` | Ruhepunkt + Quellenzeile |
| „CTA/Abschluss/Disclaimer“ | `outro` | Marke + Handlung + Rechtshinweis |

## Format-Details
**A – Tipps.** Jeder Tipp: Nummer, Handlungsverb im Titel, *ein* belegbares Detail (Zahl, Frist, Begriff). Keine Allgemeinplätze („früh investieren“) – stattdessen prüfbare Aussage („3–6 Monatsausgaben als Rücklage ist eine verbreitete Faustregel“).
**B – Fehler.** Reihenfolge: häufigster/teuerster Fehler *zuerst* oder zuletzt (Cliffhanger). Folge **konkret** (Zahl, Rechenbeispiel mit Annahmen). „Besser“ immer als prüfbarer Schritt, nicht als Produktempfehlung.
**C – Mythos.** Hook nennt den Mythos als These. Urteil differenziert (Wahr / Teilweise wahr / Falsch). Fakt-Seite ≤ 2 Belegpunkte. Danach Konsequenz (Zahl) und Handlungsrahmen.
**D – Aha.** Nur Inhalte, die sich *rechnen* oder *belegen* lassen. Rechenweg im Hook/Outro-Text oder `note` offenlegen. Zeitabhängige Zahlen (Beitragssätze, Grenzen) → Stand + Quelle nennen.
**E – Checkliste.** 3–5 Punkte, je ≤ 4 Wörter + 1 Subzeile. Haken im Takt der Aufzählung („Erstens, zweitens …“ als Cues).
**F – Vergleich.** 3 Kriterien max.; immer gleiche Reihenfolge links/rechts; keine Siegerkür, wenn die Antwort situationsabhängig ist (→ Fakt-Szene „hängt von …“).

## Neues Format ergänzen
Storyboard kopieren, Szenentypen kombinieren, `cue`-Felder auf Wörter im `vo` setzen. Fehlende Cues brechen den Build **mit Klartext-Fehler** (verhindert stille Fehl-Synchronisation).
