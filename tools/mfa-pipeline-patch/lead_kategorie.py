"""Kategorie eines Leads fuer `lead_source_detail`.

Warum dieses Modul existiert
    Bisher schrieb `mapping.py` den Namen des Suchlaufs in das Feld:
    "BA Jobsuche — MFA Berlin 50 km", fuer jeden Lead denselben Wert. Das ist
    die Herkunft der ABFRAGE, nicht die des Leads. Am 2026-09-07 trugen so
    alle 114 Firmen dasselbe Etikett, obwohl nur 43 davon MFA-Stellen waren
    und 40 Zahnarztpraxen.

    Der Suchlauf ist damit nicht verloren: er steht in `ba_source`, und wann
    ein Lead gesehen wurde, in `ba_first_seen` / `ba_last_seen`.

Warum `beruf` und nicht der Anzeigentitel
    Aus demselben Grund, aus dem `mfa_filter` auf `beruf` und `hauptDkz`
    entscheidet: der Titel ist Marketingtext ("Augenperle gesucht (m/w/d)"),
    `beruf` ist die normalisierte Berufsbezeichnung der BA. Der Titel dient
    nur als Rueckfallebene, wenn `beruf` fehlt.

Reihenfolge der Regeln
    Sie ist die eigentliche Logik, nicht die Stichwortliste. Zahnmedizin steht
    vorn, weil "Zahnmedizinische/r Fachangestellte/r" sonst ueber den Teilstring
    "medizinische fachangestellte" als MFA durchginge. MFA vor Arzt, weil
    "Arzthelfer/in" sonst zur Arztstelle wird.
"""
from __future__ import annotations

import re
from typing import Optional

from .normalize import normalize_text

SONSTIGE = "ba_sonstige"

# Reihenfolge = Vorrang. Die erste Kategorie, deren Muster greift, gewinnt.
REGELN: list[tuple[str, list[str]]] = [
    ("ba_zahnmedizin", [
        r"zahnmedizin", r"zahnärzt", r"zahnarzt", r"zahnheilkunde",
        r"kieferorthopäd", r"\bzfa\b", r"\bzmp\b", r"\bzmf\b",
        r"prophylaxe", r"stuhlassistenz", r"behandlungsassistenz", r"\bkfo\b",
    ]),
    ("ba_mfa", [
        # Die BA schreibt "Medizinische/r Fachangestellte/r"; je nach
        # Normalisierung steht zwischen den Woertern "/r ", " r " oder nur " ".
        r"medizinisch.{0,8}fachangestellte",
        r"arzthelfer", r"\bmfa\b",
    ]),
    ("ba_arzt", [
        r"facharzt", r"fachärzt", r"assistenzarzt", r"oberarzt",
        r"arzt/ärztin", r"ärztin/arzt", r"\barzt\b", r"\bärztin\b",
        # Nur in Anzeigentiteln, nie in BA-Berufsbezeichnungen: die Kurzform
        # kommt ausschliesslich als Paar vor, einzeln waere \bfa\b viel zu
        # unspezifisch.
        r"\bfä\s*/\s*fa\b", r"\bfa\s*/\s*fä\b", r"hausärzte",
    ]),
    ("ba_medtechnik", [
        r"medizinisch.{0,8}technolog", r"\bmtr\b", r"\bmt-r\b",
        r"\bmtla\b", r"\bmta\b", r"laboratoriumsanalytik",
        r"radiologieassistent",
    ]),
    ("ba_pflege", [
        r"pflegefachmann", r"pflegefachfrau", r"pflegefachkraft",
        r"krankenpfleger", r"krankenschwester", r"altenpfleger",
        r"gesundheits-\s*und\s*krankenpfleg", r"pflegehelfer",
    ]),
    ("ba_therapie", [
        r"physiotherapeut", r"ergotherapeut", r"logopäd", r"masseur",
        r"osteopath",
    ]),
]

_KOMPILIERT = [
    (name, [re.compile(m) for m in muster]) for name, muster in REGELN
]


def kategorie(beruf: Optional[str], job_title: Optional[str] = None) -> str:
    """Interner Wert fuer `lead_source_detail`.

    `beruf` ist die normalisierte BA-Berufsbezeichnung und entscheidet.
    `job_title` greift nur, wenn `beruf` fehlt oder nichts trifft.

    Trifft nichts, ist das Ergebnis `ba_sonstige` — bewusst, nicht geraten.
    Ein falsch etikettierter Lead verfaelscht dauerhaft jede Auswertung; ein
    unsortierter faellt beim ersten Anruf auf.
    """
    for quelle in (beruf, job_title):
        norm = normalize_text(quelle)
        if not norm:
            continue
        for name, muster in _KOMPILIERT:
            if any(m.search(norm) for m in muster):
                return name
    return SONSTIGE


# Die Werteliste fuer die HubSpot-Property `lead_source_detail`.
#
# Sie enthaelt MEHR, als dieses Modul je zurueckgibt: die Pipeline vergibt nur
# die ba_*-Werte, aber dasselbe Feld wird auch von den Website-Funnels und bei
# manuell angelegten Leads befuellt. Eine Aufzaehlung muss alle Werte kennen,
# die irgendwo geschrieben werden — sonst weist HubSpot den Schreibzugriff ab.
#
# properties.py importiert diese Liste, damit es genau eine Quelle gibt.
OPTIONEN: list[tuple[str, str]] = [
    # Von dieser Pipeline vergeben
    ("ba_mfa", "BA — MFA"),
    ("ba_zahnmedizin", "BA — Zahnmedizin"),
    ("ba_medtechnik", "BA — Medizinische Technologie"),
    ("ba_pflege", "BA — Pflege"),
    ("ba_therapie", "BA — Therapie"),
    ("ba_arzt", "BA — Arzt"),
    ("ba_sonstige", "BA — Sonstiger Gesundheitsberuf"),
    # Von anderen Wegen vergeben, hier nur deklariert
    ("website", "Website-Formular"),
    ("linkedin", "LinkedIn-Nachricht"),
    ("netzwerk", "Persoenliches Netzwerk"),
    ("empfehlung", "Empfehlung"),
    ("social", "Social Media"),
]
