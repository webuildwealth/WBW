#!/usr/bin/env python3
"""
Leitet die Lead-Kategorie aus dem Stellentitel einer BA-Anzeige ab.

Warum das nötig ist
    Der Suchlauf "MFA Berlin 50 km" zieht nicht nur MFA-Stellen: im Bestand
    stecken Zahnarztpraxen, Labore, Radiologien und Facharztstellen. Wer die
    Kategorie aus dem NAMEN DES SUCHLAUFS ableitet, schreibt allen 114 Firmen
    dasselbe falsche Etikett. Deshalb entscheidet hier der Stellentitel.

Die Reihenfolge der Regeln ist die eigentliche Logik
    Titel nennen oft mehrere Berufe ("MFA / Krankenpfleger / Altenpflege-
    Helfer", "MFA mit Röntgenschein oder MTR"). Es gewinnt die Kategorie, die
    weiter oben steht — nicht die, die zufällig zuerst im Text vorkommt.
    Zahnmedizin steht vorn, weil sie sich am eindeutigsten erkennen lässt;
    MFA davor vor Arzt, weil "Arzthelfer" sonst als Arztstelle durchginge.

Bedienung
    from ba_klassifizierung import kategorie
    kategorie("ZFA gesucht im schönem Oranienburg")   -> "ba_zahnmedizin"

    python3 tools/ba_klassifizierung.py --selbsttest  # gegen echte Titel

Nur Standardbibliothek.
"""

import re
import sys

SONSTIGE = "ba_sonstige"

# Reihenfolge = Vorrang. Die erste Kategorie, deren Muster greift, gewinnt.
REGELN = [
    ("ba_zahnmedizin", [
        r"\bzfa\b", r"\bzmp\b", r"\bzmf\b", r"\bzahnmedizin",
        r"\bzahnärzt", r"\bzahnarzt", r"\bzahnheilkunde",
        r"prophylaxe", r"kieferorthopäd", r"\bkfo\b",
        r"stuhlassistenz", r"behandlungsassistenz", r"\bpzr\b",
        r"\bdental",
    ]),
    # Vor Arzt, sonst wird "Arzthelfer" zur Arztstelle.
    # Vor Pflege und Medizintechnik, weil Misch-Titel wie "MFA / Pflegefach-
    # kraft" oder "MFA mit Röntgenschein oder MTR" primär MFA-Stellen sind.
    ("ba_mfa", [
        r"\bmfa\b", r"\bmfa[/'’]", r"medizinische[rn]?\s*/?\s*r?\s+fachangestellte",
        r"medizinischer?\s+fachangestellter", r"\barzthelfer",
    ]),
    ("ba_arzt", [
        r"\bfachärzt", r"\bfacharzt", r"\bassistenzarzt", r"\boberarzt",
        r"\bass\.?\s*arzt", r"\bärztin\b", r"\barzt\b", r"\bhausärzte\b",
        # "FÄ/FA für Allgemeinmedizin" — die Kurzform kommt nur als Paar vor.
        # Einzeln waere \bfa\b viel zu unspezifisch.
        r"\bfä\s*/\s*fa\b", r"\bfa\s*/\s*fä\b",
    ]),
    ("ba_medtechnik", [
        r"\bmtr\b", r"\bmt-r\b", r"\bmtla\b", r"\bmta\b",
        r"medizinischer?\s+technolog", r"laboratoriumsanalytik",
        r"radiologieassistent",
    ]),
    ("ba_pflege", [
        r"pflegefachkraft", r"pflegefachfrau", r"pflegefachmann",
        r"krankenschwester", r"krankenpfleger", r"gesundheits-\s*und",
        r"altenpflege", r"\bgukp\b", r"pflegehelfer", r"\bpflegekraft\b",
    ]),
    ("ba_therapie", [
        r"physiotherap", r"ergotherap", r"logopäd", r"osteopath",
    ]),
]

REGELN_KOMPILIERT = [
    (name, [re.compile(m, re.IGNORECASE) for m in muster])
    for name, muster in REGELN
]


def kategorie(stellentitel):
    """Gibt den internen Wert für lead_source_detail zurück.

    Unbekannte oder nichtssagende Titel ("Verstärkung für tolles Team
    gesucht") ergeben ba_sonstige. Das ist Absicht: lieber ehrlich
    unsortiert als falsch einsortiert — ein falsch etikettierter Lead
    verfälscht die Auswertung, ein unsortierter fällt beim Anruf auf.
    """
    titel = (stellentitel or "").strip()
    if not titel:
        return SONSTIGE
    for name, muster in REGELN_KOMPILIERT:
        if any(m.search(titel) for m in muster):
            return name
    return SONSTIGE


# --------------------------------------------------------------------------
# Selbsttest gegen die 114 Stellentitel, die am 7. September 2026 tatsächlich
# im Portal standen. Erwartungswerte von Hand gesetzt.
# --------------------------------------------------------------------------

BEISPIELE = [
    # Zahnmedizin — der grösste Fehlbestand des MFA-Suchlaufs
    ("ZFA gesucht im schönem Oranienburg", "ba_zahnmedizin"),
    ("Zahnmedizinische/r Prophylaxeassistent/in", "ba_zahnmedizin"),
    ("ZMF/ ZMP  (m/w/d) für Standort Berlin-Buch gesucht", "ba_zahnmedizin"),
    ("Stuhlassistenz (m/w/d) gesucht", "ba_zahnmedizin"),
    ("Erwachsenenprophylaxe Minijob 1x wöchentlich", "ba_zahnmedizin"),
    ("Quereinsteiger für Behandlungsassistenz (m/w/d)", "ba_zahnmedizin"),
    ("ZFA (m/w/d) in moderner KFO-Praxis gesucht", "ba_zahnmedizin"),
    ("Zahnärzt*in und Zahnärzt*in für Kinderzahnheilkunde", "ba_zahnmedizin"),
    ("angestellter Zahnarzt m/w/d", "ba_zahnmedizin"),
    ("Zahnmedizinische Fachangestellte (ZFA) für Assistenz und PZR gesucht", "ba_zahnmedizin"),
    ("Zahnmedizinische/r Verwaltungsassistent/in (m/w/d)", "ba_zahnmedizin"),
    ("Zahnmedizinische Abrechnung (Charle / Z1 oder ZGM Z1 oder Ivoris) (m/w/d)", "ba_zahnmedizin"),
    ("Kieferorthopädische Praxis Adler-KFO im Prenzlauer Berg sucht sympathische:n ZFA",
     "ba_zahnmedizin"),

    # MFA — der eigentliche Zielberuf
    ("MFA", "ba_mfa"),
    ("MFA m/w/d", "ba_mfa"),
    ("MFA (m,w,d) für 20 Stunden gesucht", "ba_mfa"),
    ("Medizinische Fachangestellte", "ba_mfa"),
    ("Medizinische Fachangestellte (MFA) (m/w/d)", "ba_mfa"),
    ("Medizinische/r Fachangestellte/r (m/w/d) in Berlin-Schöneberg", "ba_mfa"),
    ("Medizinischer Fachangestellter (m/w/d) f. Innere Medizin gesucht!", "ba_mfa"),
    ("Medizinische /r Fachangestellte/ r (MFA) (m/w/d) Nierenzentrum", "ba_mfa"),
    ("Arzthelferin", "ba_mfa"),
    ("Arzthelfer (m/w/d)", "ba_mfa"),
    ("Arzthelfer/in MFA (mwd)  in TZ", "ba_mfa"),
    ("Minijob MFA, Arzthelferin für Hausarztpraxis gesucht", "ba_mfa"),
    # Misch-Titel: MFA schlägt Pflege und Medizintechnik
    ("MFA/Krankenschwester/Quereinsteiger (m/w/d)", "ba_mfa"),
    ("Pflegefachkraft / MFA (m/w/d) für die Dialyse", "ba_mfa"),
    ("MVZ Onkologie Tempelhof sucht MFA/ Pflegefachkraft (w/m/d)", "ba_mfa"),
    ("MFA mit Röntgenschein (m/w/d) oder MTR", "ba_mfa"),
    ("MFA / Krankenpfleger / Altenpflege-Helfer (m/w/x) für Praxis", "ba_mfa"),
    ("*** 40 Urlaubstage *** MFA / Endoskopie-Schwester / GuKP (m/w/d)", "ba_mfa"),

    # Arzt
    ("FÄ/FA für Allgemeinmedizin (m/w/d) in Teilzeit gesucht", "ba_arzt"),
    ("Facharzt für Innere Medizin mit Schwerpunkt Hämatologie", "ba_arzt"),
    ("Fachärztin / Facharzt für Allgemeinmedizin (m/w/d)", "ba_arzt"),
    ("Facharzt für Laboratoriumsmedizin (m/w/d)", "ba_arzt"),
    ("Ass. Arzt*in Stelle in Hoppegarten", "ba_arzt"),
    ("Facharzt / Ärztin der Augenheilkunde", "ba_arzt"),
    ("Stellenangebot Hausärzte im Quartier in Beelitz-Heilstätten", "ba_arzt"),

    # Medizintechnik
    ("Medizinischer Technologe für Radiologie (MTR) (m/w/d) gesucht", "ba_medtechnik"),
    ("Medizinischer Technologe für Laboratoriumsanalytik (m/w/d)", "ba_medtechnik"),
    ("Starten Sie als MT-R Ihre Zukunft im modernsten MVZ Berlins!", "ba_medtechnik"),

    # Pflege
    ("Privatpraxis sucht Kinderkrankenschwester/-pfleger (m/w/d) in TZ", "ba_pflege"),

    # Ehrlich unsortiert — Titel ohne Berufsangabe
    ("Augenperle gesucht (m/w/d)", "ba_sonstige"),
    ("Verstärkung für tolles Team gesucht", "ba_sonstige"),
    ("Leitstellendisponent*in", "ba_sonstige"),
    ("Praxismanager für unser MVZ (m/w/d)", "ba_sonstige"),
    ("Nicht ärztliche Praxisleitung/Controlling  (m/w/d),", "ba_sonstige"),
    ("🩺Kinderarztpraxis sucht Verstärkung!", "ba_sonstige"),
    ("Große Hausarztpraxis sucht Verstärkung!!", "ba_sonstige"),
    ("Wir Suchen Dich zur Verstärkung unseres Team!", "ba_sonstige"),
    ("Freundliche HNO-Praxis sucht Verstärkung (m/w/d)", "ba_sonstige"),
    ("Frauenarztpraxis in Steglitz sucht Verstärkung", "ba_sonstige"),
    ("Praxisassistenz & Patientenservice für TCM-Praxis (m/w/d)", "ba_sonstige"),
    ("", "ba_sonstige"),
    (None, "ba_sonstige"),
]


def selbsttest():
    fehler = []
    for titel, erwartet in BEISPIELE:
        ist = kategorie(titel)
        if ist != erwartet:
            fehler.append((titel, erwartet, ist))

    print(f"{len(BEISPIELE) - len(fehler)} von {len(BEISPIELE)} Titeln richtig eingeordnet\n")
    if fehler:
        print("Abweichungen:")
        for titel, erwartet, ist in fehler:
            print(f"  {titel!r}\n     erwartet {erwartet}, bekommen {ist}")
    return 1 if fehler else 0


if __name__ == "__main__":
    if "--selbsttest" in sys.argv:
        sys.exit(selbsttest())
    for zeile in sys.stdin:
        zeile = zeile.rstrip("\n")
        if zeile:
            print(f"{kategorie(zeile)}\t{zeile}")
