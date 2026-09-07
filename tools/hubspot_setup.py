#!/usr/bin/env python3
"""
Legt die CRM-Feldstruktur für WBW/FM in HubSpot an.

Was das Skript macht
    - Eigenschaftsgruppe "WBW Vertrieb" auf Kontakt, Unternehmen und Deal
    - alle Properties aus dem CRM-Bauplan, mit den exakten internen Werten
    - wandelt geschaftsbereich und lead_source_detail von Freitext in Dropdowns
    - löscht auf Wunsch die 28 leeren Altfelder (nur mit --loeschen)

Verhaeltnis zur mfa-lead-pipeline
    Die Pipeline besitzt eigene Properties (ba_*, mfa_*, do_not_contact) und
    ueberschreibt sie bei jedem Lauf. Dieses Skript fasst davon NICHTS an — mit
    einer Ausnahme: `lead_source_detail` wird einmalig von Freitext auf
    Aufzaehlung umgestellt. Die Werteliste unten muss deckungsgleich mit
    src/mfa_pipeline/lead_kategorie.py sein, sonst weist HubSpot den naechsten
    Pipeline-Lauf mit HTTP 400 zurueck.

    Ebenfalls unangetastet: lifecyclestage, hs_lead_status und
    hubspot_owner_id. Die Pipeline schreibt sie laut ihrer properties.py
    absichtlich nie — dieses Skript legt sie auch nicht an.

Was es NICHT macht
    Pipelines, Deal-Phasen und Lifecycle-Phasen. Die kann die Properties-API
    nicht anlegen — das bleibt Handarbeit in der HubSpot-Oberfläche.

Bedienung
    export HUBSPOT_TOKEN="pat-eu1-..."
    python3 tools/hubspot_setup.py              # Trockenlauf, schreibt nichts
    python3 tools/hubspot_setup.py --anwenden   # schreibt
    python3 tools/hubspot_setup.py --anwenden --loeschen

Der Token stammt aus einer Private App:
    Einstellungen -> Integrationen -> Private Apps -> App erstellen
    Scopes: crm.schemas.contacts.write, crm.schemas.companies.write,
            crm.schemas.deals.write (jeweils read wird automatisch ergänzt)

Nur Standardbibliothek — kein pip install nötig.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASIS = "https://api.hubapi.com"
GRUPPE = "wbw_vertrieb"
GRUPPE_LABEL = "WBW Vertrieb"

# --------------------------------------------------------------------------
# Wertelisten. Die internen Werte sind bewusst so gewählt, wie sie bereits in
# den Daten stehen (FM/WBW gross) — dann muss beim Typwechsel kein einziger
# Datensatz nachgezogen werden.
# --------------------------------------------------------------------------

GESCHAEFTSBEREICH = [
    ("FM", "FM — Finanzen & Medizin"),
    ("WBW", "WBW — We Build Wealth"),
]

LEAD_SOURCE_DETAIL = [
    # BA-Kategorien: vergibt die Pipeline (src/mfa_pipeline/lead_kategorie.py).
    # Diese Liste MUSS mit deren OPTIONEN uebereinstimmen.
    ("ba_mfa", "BA — MFA"),
    ("ba_zahnmedizin", "BA — Zahnmedizin"),
    ("ba_medtechnik", "BA — Medizinische Technologie"),
    ("ba_pflege", "BA — Pflege"),
    ("ba_therapie", "BA — Therapie"),
    ("ba_arzt", "BA — Arzt"),
    ("ba_sonstige", "BA — Sonstiger Gesundheitsberuf"),
    # Uebrige Wege
    ("website", "Website-Formular"),
    ("linkedin", "LinkedIn-Nachricht"),
    ("netzwerk", "Persoenliches Netzwerk"),
    ("empfehlung", "Empfehlung"),
    ("social", "Social Media"),
]

KANAL = [
    ("coldcall", "Telefonakquise"),
    ("website", "Website-Formular"),
    ("linkedin", "LinkedIn-Nachricht"),
    ("netzwerk", "Privates Anschreiben"),
    ("empfehlung", "Empfehlung"),
]

NICHT_KONTAKTIEREN = [
    ("widerspruch", "Widerspruch — nie wieder anrufen"),
    ("kein_bedarf", "Kein Bedarf"),
    ("wettbewerb", "Wettbewerber"),
    ("falsche_zielgruppe", "Falsche Zielgruppe"),
    ("dublette", "Dublette"),
]

KONTAKTBEZIEHUNG = [
    ("familie", "Familie"),
    ("freundeskreis", "Freundeskreis"),
    ("empfehlung", "Empfehlung"),
    ("geschaeftlich", "Geschäftlich"),
    ("kalt", "Kaltkontakt"),
    ("eigen", "Eigener Datensatz"),
]

SPARTE = [
    ("kai", "Kapitalanlageimmobilie"),
    ("investment", "Investment"),
    ("vorsorge", "Vorsorge & Absicherung"),
    ("finanzierung", "Finanzierung"),
]

VERLUSTGRUND = [
    ("nicht_erschienen", "Nicht erschienen"),
    ("kein_bedarf", "Kein Bedarf"),
    ("preis", "Preis"),
    ("wettbewerb", "Wettbewerb"),
    ("nicht_erreichbar", "Nicht mehr erreichbar"),
]


def auswahl(name, label, werte, beschreibung=""):
    return {
        "name": name,
        "label": label,
        "type": "enumeration",
        "fieldType": "select",
        "groupName": GRUPPE,
        "description": beschreibung,
        "options": [
            {"label": t, "value": w, "displayOrder": i}
            for i, (w, t) in enumerate(werte)
        ],
    }


def text(name, label, beschreibung=""):
    return {
        "name": name,
        "label": label,
        "type": "string",
        "fieldType": "text",
        "groupName": GRUPPE,
        "description": beschreibung,
    }


def zahl(name, label, beschreibung="", waehrung=False):
    feld = {
        "name": name,
        "label": label,
        "type": "number",
        "fieldType": "number",
        "groupName": GRUPPE,
        "description": beschreibung,
    }
    if waehrung:
        feld["showCurrencySymbol"] = True
    return feld


# --------------------------------------------------------------------------
# Der Bauplan als Daten. Pro Objekttyp eine Liste von Property-Definitionen.
# --------------------------------------------------------------------------

PLAN = {
    "contacts": [
        auswahl("geschaftsbereich", "Geschäftsbereich", GESCHAEFTSBEREICH,
                "FM oder WBW. Bestimmt, zu welchem Geschäft der Kontakt gehört."),
        auswahl("lead_source_detail", "Lead-Quelle Detail", LEAD_SOURCE_DETAIL,
                "Was der Lead ist, nicht woher die Abfrage kam. Bei BA-Leads von der "
                "Pipeline aus dem Feld beruf gesetzt, sonst beim Anlegen."),
        auswahl("kanal", "Kanal", KANAL,
                "Über welchen Weg der Kontakt entstanden ist."),
        auswahl("nicht_kontaktieren_grund", "Nicht kontaktieren — Grund", NICHT_KONTAKTIEREN,
                "Sperrliste. 'Widerspruch' darf vom Import NIEMALS überschrieben werden."),
        auswahl("kontaktbeziehung", "Beziehung", KONTAKTBEZIEHUNG,
                "Ersetzt Rollenzusätze im Namensfeld."),
        zahl("anrufversuche", "Anrufversuche",
             "Zähler erfolgloser Kontaktversuche. Ab 5 automatisch unqualifiziert."),
        text("empfohlen_von", "Empfohlen von",
             "Name des Empfehlungsgebers."),
    ],
    "companies": [
        auswahl("geschaftsbereich", "Geschäftsbereich", GESCHAEFTSBEREICH,
                "FM oder WBW. Praxen aus der MFA-Pipeline sind FM."),
        auswahl("lead_source_detail", "Lead-Quelle Detail", LEAD_SOURCE_DETAIL,
                "Einmalige Umstellung von Freitext auf Aufzaehlung. Danach besitzt die "
                "Pipeline dieses Feld und setzt es je Lead aus dem BA-Feld beruf."),
        auswahl("nicht_kontaktieren_grund", "Nicht kontaktieren — Grund", NICHT_KONTAKTIEREN,
                "Der GRUND zur Sperre. Der Schalter selbst ist do_not_contact, das die "
                "Pipeline besitzt und bei jedem Lauf respektiert."),
        zahl("anrufversuche", "Anrufversuche",
             "Zähler erfolgloser Kontaktversuche."),
    ],
    "deals": [
        auswahl("geschaftsbereich", "Geschäftsbereich", GESCHAEFTSBEREICH),
        auswahl("kanal", "Kanal", KANAL,
                "Damit nach Abschluss nachvollziehbar bleibt, welcher Kanal den Umsatz brachte."),
        auswahl("sparte", "Sparte", SPARTE,
                "Produktlinie. Mehrere Sparten pro Kunde = mehrere Deals."),
        auswahl("verlustgrund", "Verlustgrund", VERLUSTGRUND,
                "'Nicht erschienen' gehört hierher, nicht in eine Pipeline-Phase."),
        zahl("objekt_kaufpreis", "Objekt — Kaufpreis",
             "Nur bei Sparte Kapitalanlageimmobilie.", waehrung=True),
        text("objekt_adresse", "Objekt — Adresse",
             "Lage des Objekts. Nur bei Sparte Kapitalanlageimmobilie."),
        zahl("objekt_mietrendite", "Objekt — Mietrendite brutto (%)",
             "Nur bei Sparte Kapitalanlageimmobilie."),
        zahl("objekt_kaufpreisfaktor", "Objekt — Kaufpreisfaktor",
             "Kaufpreis geteilt durch Jahresnettomiete."),
    ],
}

# Geprüft leer: kein einziger der 51 Kontakte trägt in diesen Feldern einen Wert.
ZU_LOESCHEN = {
    "contacts": (
        ["adresse", "haus_nr_", "ort", "plz", "linkedin_profile_url"]
        + ["kakiyo_campaign", "kakiyo_prospect_id", "kakiyo_status"]
        + [f"calendly_question_{i}" for i in range(1, 11)]
        + [f"calendly_answer_{i}" for i in range(1, 11)]
    )
}


# --------------------------------------------------------------------------
# HubSpot-Zugriff. Nur urllib, damit kein pip install nötig ist.
# --------------------------------------------------------------------------

class HubSpotFehler(Exception):
    pass


def anfrage(methode, pfad, token, daten=None):
    rumpf = json.dumps(daten).encode() if daten is not None else None
    req = urllib.request.Request(BASIS + pfad, data=rumpf, method=methode)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as antwort:
            roh = antwort.read()
            return json.loads(roh) if roh else {}
    except urllib.error.HTTPError as fehler:
        text_ = fehler.read().decode("utf-8", "replace")
        if fehler.code == 429:
            time.sleep(2)
            return anfrage(methode, pfad, token, daten)
        raise HubSpotFehler(f"HTTP {fehler.code} bei {methode} {pfad}: {text_}") from None
    except urllib.error.URLError as fehler:
        raise HubSpotFehler(f"Netzwerkfehler bei {methode} {pfad}: {fehler.reason}") from None


def gruppe_sicherstellen(objekt, token, anwenden):
    try:
        anfrage("GET", f"/crm/v3/properties/{objekt}/groups/{GRUPPE}", token)
        print(f"  Gruppe {GRUPPE_LABEL!r} existiert bereits")
        return
    except HubSpotFehler as fehler:
        if "HTTP 404" not in str(fehler):
            raise
    if not anwenden:
        print(f"  [Trockenlauf] Gruppe {GRUPPE_LABEL!r} würde angelegt")
        return
    anfrage("POST", f"/crm/v3/properties/{objekt}/groups", token,
            {"name": GRUPPE, "label": GRUPPE_LABEL, "displayOrder": -1})
    print(f"  Gruppe {GRUPPE_LABEL!r} angelegt")


def bestand_lesen(objekt, name, token):
    try:
        return anfrage("GET", f"/crm/v3/properties/{objekt}/{name}", token)
    except HubSpotFehler as fehler:
        if "HTTP 404" in str(fehler):
            return None
        raise


def property_anlegen_oder_aendern(objekt, definition, token, anwenden):
    name = definition["name"]
    vorhanden = bestand_lesen(objekt, name, token)

    if vorhanden is None:
        if not anwenden:
            print(f"  [Trockenlauf] NEU    {name}")
            return "neu"
        anfrage("POST", f"/crm/v3/properties/{objekt}", token, definition)
        print(f"  NEU    {name}")
        return "neu"

    alter_typ = vorhanden.get("type")
    neuer_typ = definition["type"]
    if alter_typ == neuer_typ and neuer_typ != "enumeration":
        print(f"  gleich {name}")
        return "unverändert"

    hinweis = f" ({alter_typ} -> {neuer_typ})" if alter_typ != neuer_typ else ""
    if not anwenden:
        print(f"  [Trockenlauf] ÄNDERN {name}{hinweis}")
        return "geändert"

    # name und type-Wechsel gehen per PATCH; groupName mitschicken, damit das
    # Feld in die neue Gruppe wandert.
    aenderung = {k: v for k, v in definition.items() if k != "name"}
    anfrage("PATCH", f"/crm/v3/properties/{objekt}/{name}", token, aenderung)
    print(f"  ÄNDERN {name}{hinweis}")
    return "geändert"


def properties_loeschen(objekt, namen, token, anwenden):
    entfernt = 0
    for name in namen:
        if bestand_lesen(objekt, name, token) is None:
            continue
        if not anwenden:
            print(f"  [Trockenlauf] LÖSCHEN {name}")
            entfernt += 1
            continue
        anfrage("DELETE", f"/crm/v3/properties/{objekt}/{name}", token)
        print(f"  LÖSCHEN {name}")
        entfernt += 1
    return entfernt


def main():
    zerleger = argparse.ArgumentParser(
        description="Legt die WBW/FM-Feldstruktur in HubSpot an.")
    zerleger.add_argument("--anwenden", action="store_true",
                          help="tatsächlich schreiben (ohne das nur Trockenlauf)")
    zerleger.add_argument("--loeschen", action="store_true",
                          help="zusätzlich die 28 geprüft leeren Altfelder entfernen")
    argumente = zerleger.parse_args()

    token = os.environ.get("HUBSPOT_TOKEN", "").strip()
    if not token:
        print("HUBSPOT_TOKEN ist nicht gesetzt.\n"
              '  export HUBSPOT_TOKEN="pat-eu1-..."', file=sys.stderr)
        return 2

    modus = "SCHREIBEN" if argumente.anwenden else "TROCKENLAUF (schreibt nichts)"
    print(f"Modus: {modus}\n")

    bilanz = {"neu": 0, "geändert": 0, "unverändert": 0}
    try:
        for objekt, definitionen in PLAN.items():
            print(f"{objekt}:")
            gruppe_sicherstellen(objekt, token, argumente.anwenden)
            for definition in definitionen:
                ergebnis = property_anlegen_oder_aendern(
                    objekt, definition, token, argumente.anwenden)
                bilanz[ergebnis] += 1
            print()

        if argumente.loeschen:
            for objekt, namen in ZU_LOESCHEN.items():
                print(f"{objekt} — Altfelder entfernen:")
                anzahl = properties_loeschen(objekt, namen, token, argumente.anwenden)
                print(f"  {anzahl} Felder betroffen\n")
    except HubSpotFehler as fehler:
        print(f"\nAbbruch: {fehler}", file=sys.stderr)
        print("Bereits ausgeführte Schritte bleiben bestehen; das Skript ist "
              "wiederholbar und überspringt, was schon passt.", file=sys.stderr)
        return 1

    print(f"Bilanz: {bilanz['neu']} neu, {bilanz['geändert']} geändert, "
          f"{bilanz['unverändert']} unverändert")
    if not argumente.anwenden:
        print("\nDas war ein Trockenlauf. Zum Schreiben: --anwenden")
    else:
        print("\nOffen bleibt Handarbeit in der HubSpot-Oberfläche:\n"
              "  - Lifecycle-Phasen: S1/Setting, S2/Closing, S3, Investment, KAI, Immo\n"
              "    löschen (alle mit 0 Datensätzen), Kunde/Service -> Kunde umbenennen,\n"
              "    Sales Qualified Lead und Opportunity ergänzen\n"
              "  - Deal-Pipeline: Upselling/S3, Investment/Immobilie und\n"
              "    Service/Betreuung entfernen; es bleibt S0 -> S1 -> S2 -> Abschluss")
    return 0


if __name__ == "__main__":
    sys.exit(main())
