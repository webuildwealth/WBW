#!/usr/bin/env python3
"""Was bringt Phase 2? Misst es an den Leads, die schon da sind.

Vor dem Bauen messen. Die Frage ist nicht, ob Impressum-Crawling im Prinzip
funktioniert, sondern wie viele DEINER Leads ueberhaupt eine Spur haben, der
man folgen kann. Drei Stufen, nach Kosten sortiert:

    Stufe 0  Telefon steht schon in der Anzeige        (Phase 1, gebaut)
    Stufe 1  Website steht in der Anzeige              -> Impressum crawlen
    Stufe 2  Nicht-Freemail-Mailadresse in der Anzeige -> Domain ableiten
    Rest     keine Spur                                -> nur kostenpflichtige Suche

Aufruf
    python3 scripts/messe_phase2.py
    python3 scripts/messe_phase2.py --leads data/reports/<run_id>_enriched_leads.json

Ohne Argument wird die neueste *_enriched_leads.json unter data/reports/
genommen. Das Skript liest nur und schreibt nichts.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

from mfa_pipeline.impressum import domain_aus_email  # noqa: E402


def neuester_lauf(ordner: pathlib.Path) -> pathlib.Path | None:
    treffer = sorted(ordner.glob("*_enriched_leads.json"))
    if not treffer:
        treffer = sorted(ordner.glob("*_leads.json"))
    return treffer[-1] if treffer else None


def lade(pfad: pathlib.Path) -> list[dict]:
    daten = json.loads(pfad.read_text(encoding="utf-8"))
    if isinstance(daten, dict):
        for schluessel in ("leads", "results", "items"):
            if isinstance(daten.get(schluessel), list):
                return daten[schluessel]
        return []
    return daten if isinstance(daten, list) else []


def balken(anteil: float, breite: int = 32) -> str:
    voll = round(anteil * breite)
    return "█" * voll + "·" * (breite - voll)


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument("--leads", help="Pfad zur Leads-JSON")
    zerleger.add_argument("--zeige", type=int, default=0,
                          help="so viele Beispiele je Stufe ausgeben")
    argumente = zerleger.parse_args()

    if argumente.leads:
        pfad = pathlib.Path(argumente.leads)
    else:
        pfad = neuester_lauf(pathlib.Path("data/reports"))
        if pfad is None:
            print("Keine Leads-Datei unter data/reports/ gefunden.\n"
                  "Mit --leads einen Pfad angeben.", file=sys.stderr)
            return 2

    leads = lade(pfad)
    if not leads:
        print(f"{pfad} enthaelt keine Leads.", file=sys.stderr)
        return 2

    stufen: dict[str, list[dict]] = {
        "hat_telefon": [], "hat_website": [], "domain_aus_mail": [], "keine_spur": [],
    }

    for lead in leads:
        if lead.get("phone"):
            stufen["hat_telefon"].append(lead)
        elif lead.get("website"):
            stufen["hat_website"].append(lead)
        elif domain_aus_email(lead.get("email")):
            stufen["domain_aus_mail"].append(lead)
        else:
            stufen["keine_spur"].append(lead)

    gesamt = len(leads)
    print(f"\n{pfad}\n{gesamt} Leads\n")

    beschriftung = {
        "hat_telefon":     "Stufe 0  Telefon steht in der Anzeige",
        "hat_website":     "Stufe 1  Website bekannt, Impressum crawlbar",
        "domain_aus_mail": "Stufe 2  Domain aus Mailadresse ableitbar",
        "keine_spur":      "Rest     nur ueber kostenpflichtige Suche",
    }
    for schluessel, titel in beschriftung.items():
        anzahl = len(stufen[schluessel])
        anteil = anzahl / gesamt
        print(f"  {titel:<46} {anzahl:>4}  {anteil:>4.0%}  {balken(anteil)}")

    erreichbar = gesamt - len(stufen["keine_spur"])
    heute = len(stufen["hat_telefon"])
    print()
    print(f"  {'Heute anrufbar':<46} {heute:>4}  {heute/gesamt:>4.0%}")
    print(f"  {'Nach Phase 2 erreichbar (Obergrenze)':<46} {erreichbar:>4}"
          f"  {erreichbar/gesamt:>4.0%}")
    print("\n  Die Obergrenze setzt voraus, dass jedes Impressum eine Nummer\n"
          "  fuehrt. Realistisch sind davon etwa 85 Prozent:"
          f" rund {round(erreichbar * 0.85)} von {gesamt}"
          f" ({erreichbar * 0.85 / gesamt:.0%}).")

    if argumente.zeige:
        for schluessel, titel in beschriftung.items():
            proben = stufen[schluessel][: argumente.zeige]
            if not proben:
                continue
            print(f"\n{titel}")
            for lead in proben:
                print(f"  {(lead.get('company_name') or '?')[:44]:<44}"
                      f"  mail={lead.get('email') or '-'}"
                      f"  web={lead.get('website') or '-'}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
