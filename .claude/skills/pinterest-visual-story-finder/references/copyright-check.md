# Urheberrecht & Nutzungsrechte (Instagram, ggf. kommerziell)

> Kein Rechtsrat. Pinterest ist **keine** Lizenzquelle: Pins sind meist urheberrechtlich geschützte Werke Dritter. Für monetarisierte/Business-Reels (Marke, Beratung, Werbung) gilt: **ohne Lizenz nicht verwenden.**

## Status-Modell (pro Bild)

| Status | Bedeutung | Handlung |
|---|---|---|
| 🟢 **frei** | Public Domain / CC0 / Open Access, Quelle bestätigt | nutzbar, Quelle trotzdem notieren |
| 🟢 **lizenziert** | Lizenz mit kommerzieller Nutzung (Unsplash, Pexels, CC-BY mit Namensnennung) | Bedingungen erfüllen (Attribution) |
| 🟡 **klärbar** | Urheber/Quelle bekannt, Lizenz nicht geprüft | Lizenzanfrage oder Alternative suchen |
| 🔴 **ungeklärt** | Quelle unbekannt, Pinterest-Repin, Agenturfoto | **nicht verwenden**, nur als Moodboard/Referenz |

## Prüfreihenfolge
1. **Pin öffnen → Originalquelle** (Link "Besuchen"). Pin-Seite nur als Wegweiser verwenden.
2. **Gemälde/historische Werke:** Gemeinfrei, wenn Urheber vor > 70 Jahren starb. **Aber:** Die konkrete Fotografie/Reproduktion ist bei Museen oft separat lizenziert. Open-Access-Sammlungen bevorzugen (Met CC0, Rijksmuseum, NGA, Art Institute of Chicago, Wikimedia Commons mit Lizenzprüfung).
3. **Historische Fotos:** Library of Congress, NYPL, Wikimedia Commons, Flickr Commons prüfen. Rechtehinweis beachten ("No known restrictions" ≠ garantiert frei, aber gute Basis).
4. **Moderne Editorial-/Kunstfotos, Illustrationen, Kinderzeichnungen anderer Personen, Filmstills:** Lizenz einholen oder ersetzen. Filmstills = Rechte der Studios.
5. **Menschen erkennbar:** Persönlichkeitsrechte/DSGVO (Einwilligung) mitdenken. Keine Prominenten für Werbung.
6. **Marken/Logos:** nicht als Hauptmotiv.
7. **KI-Bilder:** Nutzungsbedingungen des Generators prüfen; kennzeichnen, falls plattformrelevant.

## Empfehlungs-Strategie
- **Moodboard (Pinterest) → Ersatz in Lizenzquelle:** Pinterest-Fund als ästhetische Vorlage nutzen, dann ein lizenziertes Pendant finden (Wikimedia, Open Access, Unsplash, Pexels, Adobe Stock, Envato, Eigenfotografie, eigener KI-/Designer-Entwurf).
- Bei Bedarf Urheber:in kontaktieren: Anfrage-Text, Verwendungszweck, Zeitraum, Vergütung. Schriftlich ablegen.
- Aufstellung für jedes Reel führen (`scripts/storyboard.py` erzeugt `bildliste.csv` mit Rechtespalte).

## Ausgabe im Reel-Report
Jede Bildzeile trägt den Rechte-Status. Am Ende: "**Rechtliche Offene Punkte:** n × 🔴, n × 🟡". Empfehle bei 🔴 immer eine konkrete Ersatzstrategie.
