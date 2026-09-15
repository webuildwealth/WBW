#!/usr/bin/env python3
# =============================================================================
#  tools/textlaengen.py — prueft die Textbloecke in PROFILTEXTE.md gegen die
#  Zeichenlimits der Plattformen.
#
#  Hintergrund: Die Limits sind hart. Google schneidet die Unternehmens-
#  beschreibung bei 750 Zeichen ab, LinkedIn den Info-Text bei 2.000 bzw. 2.600.
#  Abgeschnitten wird am Ende — also genau dort, wo bei uns die Registernummern
#  und der Hinweis auf das kostenfreie Erstgespraech stehen.
#
#  Aufruf:  python3 tools/textlaengen.py
#  Nach jeder Aenderung an PROFILTEXTE.md laufen lassen.
# =============================================================================

import re
import sys
from pathlib import Path

DATEI = Path(__file__).resolve().parent.parent / "PROFILTEXTE.md"

# Ueberschrift-Fragment -> Limit. Geprueft wird der erste Codeblock danach.
LIMITS = {
    "Beschreibung (max. 750 Zeichen)": 750,
    "Slogan / Tagline (max. 120 Zeichen)": 120,
    "Info-Text (max. 2.000 Zeichen)": 2000,
    "Schlagzeile (max. 220 Zeichen)": 220,
    "Info-Text (max. 2.600 Zeichen)": 2600,
}

# Die Leistungen im Google-Profil haben alle dasselbe Limit.
LEISTUNGEN_LIMIT = 300


def block_nach(text: str, marke: str) -> str | None:
    i = text.find(marke)
    if i < 0:
        return None
    treffer = re.search(r"```\n(.*?)\n```", text[i:], re.S)
    return treffer.group(1) if treffer else None


def main() -> int:
    text = DATEI.read_text(encoding="utf-8")
    fehler = 0

    for marke, limit in LIMITS.items():
        block = block_nach(text, marke)
        if block is None:
            print(f"  ?  {marke} — nicht gefunden")
            fehler += 1
            continue
        status = "ok" if len(block) <= limit else "ZU LANG"
        if len(block) > limit:
            fehler += 1
        print(f"  {status:8s} {len(block):5d} / {limit:5d}  {marke}")

    leistungen = text.split("## 1.4 Leistungen")[1].split("## 1.5")[0]
    for name, block in re.findall(r"\*\*(.+?)\*\*\n```\n(.*?)\n```", leistungen, re.S):
        status = "ok" if len(block) <= LEISTUNGEN_LIMIT else "ZU LANG"
        if len(block) > LEISTUNGEN_LIMIT:
            fehler += 1
        print(f"  {status:8s} {len(block):5d} / {LEISTUNGEN_LIMIT:5d}  Leistung: {name}")

    print()
    print("Alles innerhalb der Limits." if not fehler else f"{fehler} Block/Bloecke zu lang.")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
