# Finanz-Medizin Reels

Claude-Code-Skill: Rohvideo rein, fertiges Instagram-Reel raus – geschnitten, untertitelt und animiert in den
Farben von Finanz-Medizin.

**Was er macht:** Pausen, Versprecher und verworfene Takes raus · deutsche Untertitel automatisch, mit dem
Skript abgeglichen · Hook als großer Text in den ersten Sekunden · wichtige Zahlen groß (auf Wunsch mitzählend) ·
leichter Zoom an wichtigen Stellen · CTA-Einblendung mit Stichwort im letzten Satz · dezente Whooshs ·
1080 × 1920, 30 fps, H.264, Lautheit für Instagram angeglichen.

**Formate:** standard · frage · liste · mythos · rechnung (siehe FORMATE.md).

## So arbeitest du damit

1. Video in den Chat ziehen (oder nach `~/Videos/FinanzMedizin/original/` legen).
2. Skript, CTA und Caption mit Claude besprechen.
3. Sagen: „Reel 07, CTA RENTE, Take 2 und 4 raus, Format Liste“.
4. Claude schneidet, zeigt bei Unklarheiten die Take-Liste, rendert und schickt dir das fertige Reel.

## Installation auf dem Mac

1. Ordner `finanz-medizin-reels` nach `~/.claude/skills/` kopieren (oder das Zip in Claude Code ziehen und
   „installiere diesen Skill“ sagen).
2. Einmalig: `brew install ffmpeg node`, dann neue Claude-Code-Sitzung starten und „prüf die Reel-Werkzeuge“
   sagen. Claude richtet Renderer und Spracherkennung ein (etwa 700 MB Download).

Im Repository liegt der Skill unter `.claude/skills/finanz-medizin-reels/` und ist in jeder Claude-Code-Sitzung
auf diesem Repository automatisch verfügbar.
