#!/usr/bin/env python3
# =============================================================================
#  tools/strukturdaten.py — erzeugt die JSON-LD-Bloecke aller Seiten neu.
#
#  Warum ein Skript und kein handgepflegter Block: Die FAQ-Strukturdaten muessen
#  woertlich dem entsprechen, was auf der Seite sichtbar steht. Google wertet
#  FAQ-Markup ab, das vom sichtbaren Text abweicht, und Antwortmaschinen zitieren
#  im Zweifel den sichtbaren Text. Handgepflegt driftet das nach der zweiten
#  Textaenderung auseinander; hier wird es aus dem HTML gelesen.
#
#  Aufruf:  python3 tools/strukturdaten.py
#  Kein Build-Schritt, keine Abhaengigkeiten — das Skript schreibt die fertigen
#  HTML-Dateien direkt zurueck. Nach jeder Textaenderung an einer FAQ einmal
#  laufen lassen und das Ergebnis mitcommitten.
# =============================================================================

import html
import json
import re
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
BASIS = "https://www.finanz-medizin.com"

ANFANG = "<!-- ===== Strukturdaten — erzeugt von tools/strukturdaten.py ===== -->"
ENDE = "<!-- ===== Ende Strukturdaten ===== -->"

# -----------------------------------------------------------------------------
#  Profile, unter denen die Marke sonst noch auffindbar ist.
#
#  Das ist das wichtigste Feld dieser ganzen Datei. sameAs ist die Verbindung
#  zwischen der Website und allen anderen Orten, an denen dieselbe Firma steht.
#  Erst darueber erkennen Suchmaschinen und Sprachmodelle, dass es sich um EINE
#  Einheit handelt und nicht um zufaellig gleichnamige Treffer.
#
#  Getrennt nach Firma und Person, weil sameAs am falschen Knoten schadet: Ein
#  Instagram-Konto der Marke ist kein Profil von Benedict Hintz, und ein
#  persoenliches LinkedIn-Profil ist keines der Firma.
#
#  Regel fuer neue Eintraege: immer die blanke Profil-URL, ohne Parameter.
#  Share-Tokens (stkn=), Kampagnenkennungen (utm_source=) und Sitzungsdaten
#  gehoeren nicht in Strukturdaten — sie sind fluechtig, teils personenbezogen,
#  und machen aus einer stabilen Kennung eine, die in einem halben Jahr ins
#  Leere zeigt.
# -----------------------------------------------------------------------------
PROFILE: list[str] = [
    "https://www.provenexpert.com/de-de/finanz-medizin/",
    "https://de.trustpilot.com/review/finanz-medizin.com",
    "https://www.instagram.com/finanz.medizin/",
    "https://www.linkedin.com/company/finanz-medizin/",
    # Google Unternehmensprofil. Der Kurzlink ist die Fassung, die das Profil
    # selbst unter "Profil teilen" ausgibt. Falls spaeter die ausgeschriebene
    # maps.google.com-Adresse vorliegt, ist die stabiler — dann hier ersetzen.
    "https://maps.app.goo.gl/RutqhUqfo4KG87rTA",
]

#  Offen: die Facebook-Unternehmensseite. Geliefert wurde bisher nur ein
#  Teilen-Link (facebook.com/share/...). Der taugt hier nicht — er ist ein
#  undurchsichtiger Weiterleiter, aus dem niemand ablesen kann, wohin er zeigt,
#  und Teilen-Links koennen sich aendern. Gebraucht wird die Adresse der Seite
#  selbst: facebook.com/<nutzername> oder facebook.com/profile.php?id=<nummer>.
#
#  Profile, die zur Person Benedict Hintz gehoeren — nicht zur Marke.
#  Hier gehoert das persoenliche LinkedIn-Profil hinein, sobald es steht.
PROFILE_PERSON: list[str] = [
    "https://www.linkedin.com/in/benedict-hintz/",
]

ORG = f"{BASIS}/#organisation"
PERSON = f"{BASIS}/#benedict-hintz"
SITE = f"{BASIS}/#website"


def faq_auslesen(roh: str) -> list[dict]:
    """Zieht die Frage-Antwort-Paare aus dem sichtbaren FAQ-Markup."""
    paare = []
    for block in re.findall(r'<div class="faq__item">(.*?)</div>\s*</div>\s*</div>', roh, re.S):
        frage = re.search(r'<button class="faq__q"[^>]*>(.*?)<span', block, re.S)
        antwort = re.search(r'<div class="faq__a"><div>(.*?)$', block, re.S)
        if not (frage and antwort):
            continue
        paare.append({
            "@type": "Question",
            "name": text(frage.group(1)),
            "acceptedAnswer": {"@type": "Answer", "text": text(antwort.group(1))},
        })
    return paare


def text(roh: str) -> str:
    """HTML-Fragment zu sauberem Fliesstext."""
    ohne = re.sub(r"<[^>]+>", " ", roh)
    return re.sub(r"\s+", " ", html.unescape(ohne)).strip()


def kopf(datei: str, titel: str) -> list[dict]:
    """Brotkrumen — sagt Maschinen, wo die Seite im Haus haengt."""
    return [{
        "@type": "BreadcrumbList",
        "@id": f"{BASIS}/{datei}#brotkrumen",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Startseite", "item": f"{BASIS}/"},
            {"@type": "ListItem", "position": 2, "name": titel, "item": f"{BASIS}/{datei}"},
        ],
    }]


def organisation() -> dict:
    """Der Anbieter. Steht einmal auf der Startseite, alles andere verweist darauf."""
    knoten = {
        "@type": ["FinancialService", "ProfessionalService"],
        "@id": ORG,
        "name": "Finanz-Medizin",
        "alternateName": ["Finanz Medizin", "finanz-medizin.com"],
        "legalName": "Benedict Hintz — We Build Wealth",
        "url": f"{BASIS}/",
        "email": "info@finanz-medizin.com",
        "telephone": "+491742920781",
        "image": f"{BASIS}/assets/img/og-finanz-medizin.jpg",
        "logo": f"{BASIS}/assets/img/og-finanz-medizin.jpg",
        "slogan": "Erst der Befund, dann der Plan.",
        "description": (
            "Finanz-Medizin ist die auf Heilberufe spezialisierte Finanz- und "
            "Versicherungsberatung von We Build Wealth: unabhängige Beratung für "
            "Praxisinhaberinnen und Praxisinhaber, angestellte Ärztinnen und Ärzte "
            "sowie medizinische Fachangestellte — zu betrieblicher Altersvorsorge, "
            "Steuergestaltung, Arbeitskraftabsicherung, Praxisabsicherung und "
            "Vermögensaufbau. Ungebundener Makler, kostenfreies Erstgespräch."
        ),
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Calvinstraße 3",
            "postalCode": "10557",
            "addressLocality": "Berlin",
            "addressRegion": "Berlin",
            "addressCountry": "DE",
        },
        "founder": {"@id": PERSON},
        "employee": {"@id": PERSON},
        # Bleibt drin, obwohl Finanz-Medizin nach aussen eigenstaendig auftritt.
        # parentOrganization verschmilzt die beiden Marken nicht — es beschreibt
        # eine eigene Einheit Finanz-Medizin MIT einer benannten Beziehung. Ohne
        # das Feld waere die Marke nicht unabhaengiger, sondern nur schlechter
        # bestimmt. Dazu kommt: Das Impressum nennt das Verhaeltnis ohnehin, und
        # Strukturdaten, die etwas anderes erzaehlen als die Seite, sind ein
        # Widerspruchssignal. Die Trennung gehoert in Profile, Rufnummer und
        # Ansprache — nicht in weggelassene Fakten.
        "parentOrganization": {"@type": "Organization", "name": "We Build Wealth"},
        "areaServed": {"@type": "Country", "name": "Deutschland"},
        "availableLanguage": {"@type": "Language", "name": "Deutsch", "alternateName": "de"},
        "priceRange": "Erstgespräch, Bestandsaufnahme und Konzept kostenfrei",
        "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "Erstberatung",
            "email": "info@finanz-medizin.com",
            "telephone": "+491742920781",
            "availableLanguage": "de",
            "areaServed": "DE",
        },
        # Die beiden Erlaubnisse sind oeffentlich nachpruefbar. Genau das ist der
        # Punkt: Ein Sprachmodell, das eine Empfehlung begruenden soll, greift
        # lieber auf eine Registernummer zurueck als auf ein Werbeversprechen.
        "identifier": [
            {
                "@type": "PropertyValue",
                "name": "Versicherungsmakler nach § 34d Abs. 1 GewO",
                "value": "D-5V3H-7KX3I-54",
                "url": "https://www.vermittlerregister.info",
            },
            {
                "@type": "PropertyValue",
                "name": "Finanzanlagenvermittler nach § 34f Abs. 1 S. 1 Nr. 1 GewO",
                "value": "D-F-107-RV51-31",
                "url": "https://www.vermittlerregister.info",
            },
        ],
        "knowsAbout": [
            "Betriebliche Altersvorsorge für Arztpraxen",
            "Betriebliche Krankenversicherung und Gesundheitsbudget",
            "Basisrente und Sonderausgabenabzug für Ärztinnen und Ärzte",
            "Ärztliches Versorgungswerk",
            "Berufsunfähigkeitsversicherung mit Infektionsklausel",
            "Praxisausfallversicherung und Praxisabsicherung",
            "Private Krankenversicherung und Tarifwechsel nach § 204 VVG",
            "Mitarbeiterbindung und Fluktuationskosten in der Arztpraxis",
            "Vermögensaufbau und Niederlassungsfinanzierung",
            "Altersvorsorge für medizinische Fachangestellte",
        ],
        "audience": [
            {"@type": "Audience", "audienceType": "Praxisinhaberinnen und Praxisinhaber"},
            {"@type": "Audience", "audienceType": "Angestellte Ärztinnen und Ärzte"},
            {"@type": "Audience", "audienceType": "Medizinische Fachangestellte (MFA)"},
            {"@type": "Audience", "audienceType": "Zahnmedizinische Fachangestellte (ZFA)"},
        ],
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Beratungsleistungen für Heilberufe",
            "itemListElement": [
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": "Praxis-Check für Praxisinhaber",
                        "description": (
                            "Bestandsaufnahme für die Praxis: Mitarbeiterbindung über "
                            "betriebliche Leistungen, Steuerhebel nach Wirkung sortiert, "
                            "Absicherung von Ausfall, Haftung und Nachfolge."
                        ),
                        "url": f"{BASIS}/praxisinhaber.html",
                    },
                },
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": "Vermögens-Check für angestellte Ärztinnen und Ärzte",
                        "description": (
                            "Sonderausgabenrahmen neben dem Versorgungswerk, Vermögensaufbau, "
                            "Arbeitskraftabsicherung und Eigenkapital für die Niederlassung."
                        ),
                        "url": f"{BASIS}/angestellte-aerzte.html",
                    },
                },
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": "Vorsorge-Check für MFA und Praxisteam",
                        "description": (
                            "Rentenlücke, Teilzeit- und Familienphasen, Gesundheitsbudget und "
                            "Betriebsrente über die Praxis, Absicherung der Arbeitskraft."
                        ),
                        "url": f"{BASIS}/mfa-praxisteam.html",
                    },
                },
            ],
        },
    }
    if PROFILE:
        knoten["sameAs"] = PROFILE
    return knoten


def person() -> dict:
    knoten = {
        "@type": "Person",
        "@id": PERSON,
        "name": "Benedict Hintz",
        "jobTitle": "Versicherungsmakler und Finanzanlagenvermittler",
        "description": (
            "Inhaber von We Build Wealth und Berater der Marke Finanz-Medizin. "
            "Berät ausschließlich Angehörige der Heilberufe."
        ),
        "url": f"{BASIS}/ueber-uns.html",
        "worksFor": {"@id": ORG},
        "email": "info@finanz-medizin.com",
        "knowsLanguage": "de",
        "hasCredential": [
            {
                "@type": "EducationalOccupationalCredential",
                "credentialCategory": "Erlaubnis nach § 34d Abs. 1 GewO (Versicherungsmakler)",
                "identifier": "D-5V3H-7KX3I-54",
                "recognizedBy": {"@type": "Organization", "name": "IHK Berlin"},
            },
            {
                "@type": "EducationalOccupationalCredential",
                "credentialCategory": "Erlaubnis nach § 34f Abs. 1 S. 1 Nr. 1 GewO (Finanzanlagenvermittler)",
                "identifier": "D-F-107-RV51-31",
                "recognizedBy": {"@type": "Organization", "name": "IHK Berlin"},
            },
        ],
    }
    if PROFILE_PERSON:
        knoten["sameAs"] = PROFILE_PERSON
    return knoten


def webseite(datei: str, name: str, beschreibung: str, zielgruppe: str | None = None) -> dict:
    knoten = {
        "@type": "WebPage",
        "@id": f"{BASIS}/{datei}" if datei else f"{BASIS}/",
        "url": f"{BASIS}/{datei}" if datei else f"{BASIS}/",
        "name": name,
        "description": beschreibung,
        "inLanguage": "de-DE",
        "isPartOf": {"@id": SITE},
        "about": {"@id": ORG},
        "provider": {"@id": ORG},
        "primaryImageOfPage": f"{BASIS}/assets/img/og-finanz-medizin.jpg",
    }
    if datei:
        knoten["breadcrumb"] = {"@id": f"{BASIS}/{datei}#brotkrumen"}
    if zielgruppe:
        knoten["audience"] = {"@type": "Audience", "audienceType": zielgruppe}
    return knoten


def dienstleistung(datei: str, name: str, beschreibung: str, zielgruppe: str,
                   bausteine: list[str]) -> dict:
    return {
        "@type": "Service",
        "@id": f"{BASIS}/{datei}#leistung",
        "name": name,
        "description": beschreibung,
        "serviceType": "Finanz- und Versicherungsberatung für Heilberufe",
        "provider": {"@id": ORG},
        "areaServed": {"@type": "Country", "name": "Deutschland"},
        "audience": {"@type": "Audience", "audienceType": zielgruppe},
        "url": f"{BASIS}/{datei}",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "EUR",
            "description": "Erstgespräch, Bestandsaufnahme und Konzept sind kostenfrei.",
        },
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": name,
            "itemListElement": [
                {"@type": "Offer", "itemOffered": {"@type": "Service", "name": b}}
                for b in bausteine
            ],
        },
    }


def faq_knoten(datei: str, paare: list[dict]) -> list[dict]:
    if not paare:
        return []
    ziel = f"{BASIS}/{datei}" if datei else f"{BASIS}/"
    return [{
        "@type": "FAQPage",
        "@id": f"{ziel}#faq",
        "inLanguage": "de-DE",
        "mainEntityOfPage": {"@id": ziel},
        "mainEntity": paare,
    }]


# -----------------------------------------------------------------------------
#  Seitendefinitionen
# -----------------------------------------------------------------------------

def graph_startseite(roh: str) -> list[dict]:
    return [
        organisation(),
        person(),
        {
            "@type": "WebSite",
            "@id": SITE,
            "url": f"{BASIS}/",
            "name": "Finanz-Medizin",
            "inLanguage": "de-DE",
            "publisher": {"@id": ORG},
        },
        webseite("", "Finanz-Medizin — Finanzberatung für Ärzte, Praxisinhaber und Praxisteams",
                 "Spezialisierte Finanzberatung für Arztpraxen, angestellte Ärztinnen und "
                 "Ärzte sowie medizinische Fachangestellte."),
        *faq_knoten("", faq_auslesen(roh)),
    ]


def graph_praxisinhaber(roh: str) -> list[dict]:
    datei = "praxisinhaber.html"
    ziel = "Praxisinhaberinnen und Praxisinhaber"
    return [
        webseite(datei, "Praxiskonzept für Praxisinhaber — Team halten, Steuern senken",
                 "Für Praxisinhaberinnen und Praxisinhaber: MFA langfristig binden statt teuer "
                 "nachbesetzen, steuerlichen Spielraum nutzen, Praxis und Privatvermögen absichern.",
                 ziel),
        dienstleistung(
            datei, "Praxis-Check für Praxisinhaberinnen und Praxisinhaber",
            "Bestandsaufnahme für die Praxis: Mitarbeiterbindung über betriebliche Leistungen, "
            "Steuerhebel nach Wirkung sortiert, Absicherung von Ausfall, Haftung und Nachfolge — "
            "mit vollständigem Rechenweg für den Steuerberater.",
            ziel,
            [
                "Betriebliche Altersvorsorge mit Förderbetrag nach § 100 EStG",
                "Betriebliche Krankenversicherung und Gesundheitsbudget für das Team",
                "Sachbezug nach § 8 Abs. 2 S. 11 EStG",
                "Praxisausfallversicherung",
                "Berufs- und Betriebshaftpflicht der Praxis",
                "Praxisnachfolge und Übergabeplanung",
                "Senkung der Fluktuationskosten bei MFA",
            ],
        ),
        *kopf(datei, "Praxisinhaber"),
        *faq_knoten(datei, faq_auslesen(roh)),
    ]


def graph_angestellte(roh: str) -> list[dict]:
    datei = "angestellte-aerzte.html"
    ziel = "Angestellte Ärztinnen und Ärzte"
    return [
        webseite(datei, "Vermögensaufbau für angestellte Ärztinnen und Ärzte",
                 "Steuerlicher Hebel neben dem Versorgungswerk, Vermögensaufbau, Absicherung der "
                 "Arbeitskraft und Eigenkapital für die eigene Niederlassung.",
                 ziel),
        dienstleistung(
            datei, "Vermögens-Check für angestellte Ärztinnen und Ärzte",
            "Was das ärztliche Versorgungswerk offen lässt: ungenutzter Sonderausgabenrahmen, "
            "Vermögensaufbau neben der Grundversorgung, Berufsunfähigkeitsschutz mit "
            "Infektionsklausel und Liquidität für die spätere Niederlassung.",
            ziel,
            [
                "Sonderausgabenabzug und Basisrente neben dem Versorgungswerk",
                "Vermögensaufbau über Depot und Kapitalanlage",
                "Berufsunfähigkeitsversicherung mit Infektionsklausel",
                "Private Krankenversicherung und Tarifwechsel nach § 204 VVG",
                "Eigenkapitalaufbau für die Niederlassung",
                "Nachversicherungsgarantien in der Arbeitskraftabsicherung",
            ],
        ),
        *kopf(datei, "Angestellte Ärzte"),
        *faq_knoten(datei, faq_auslesen(roh)),
    ]


def graph_mfa(roh: str) -> list[dict]:
    datei = "mfa-praxisteam.html"
    ziel = "Medizinische Fachangestellte und Praxisteams"
    return [
        webseite(datei, "Altersvorsorge und Absicherung für MFA und Praxisteams",
                 "Für medizinische Fachangestellte: Rentenlücke schließen, Teilzeit und "
                 "Familienphase ausgleichen, Gesundheitsbudget und Betriebsrente über die "
                 "Praxis nutzen, Arbeitskraft absichern.",
                 ziel),
        dienstleistung(
            datei, "Vorsorge-Check für MFA und Praxisteam",
            "Vorsorge für medizinische Fachangestellte: Rentenlücke, Teilzeit- und "
            "Familienphasen, betriebliche Leistungen, die die Praxis zahlt, und Absicherung "
            "der Arbeitskraft — vertraulich gegenüber dem Arbeitgeber.",
            ziel,
            [
                "Betriebsrente über die Praxis mit Arbeitgeberzuschuss",
                "Gesundheitsbudget über die betriebliche Krankenversicherung",
                "Sachbezug als steuerfreier Gehaltsbaustein",
                "Ausgleich von Rentenlücken durch Teilzeit und Elternzeit",
                "Berufsunfähigkeits- und Grundfähigkeitsschutz",
                "Mitnahme der Anwartschaft beim Praxiswechsel",
            ],
        ),
        *kopf(datei, "MFA & Praxisteam"),
        *faq_knoten(datei, faq_auslesen(roh)),
    ]


def graph_ueber_uns(roh: str) -> list[dict]:
    datei = "ueber-uns.html"
    return [
        {
            "@type": "AboutPage",
            "@id": f"{BASIS}/{datei}",
            "url": f"{BASIS}/{datei}",
            "name": "Über uns — warum wir nur Heilberufe beraten",
            "description": (
                "Finanz-Medizin berät ausschließlich Ärztinnen, Ärzte und Praxisteams. "
                "Wer dahintersteht, wie wir arbeiten und woran Sie uns messen können — "
                "inklusive nachprüfbarer Registernummern."
            ),
            "inLanguage": "de-DE",
            "isPartOf": {"@id": SITE},
            "about": {"@id": ORG},
            "mainEntity": {"@id": PERSON},
            "breadcrumb": {"@id": f"{BASIS}/{datei}#brotkrumen"},
        },
        *kopf(datei, "Über uns"),
    ]


SEITEN = {
    "index.html": graph_startseite,
    "praxisinhaber.html": graph_praxisinhaber,
    "angestellte-aerzte.html": graph_angestellte,
    "mfa-praxisteam.html": graph_mfa,
    "ueber-uns.html": graph_ueber_uns,
}


def schreiben() -> None:
    for datei, bauen in SEITEN.items():
        pfad = WURZEL / datei
        roh = pfad.read_text(encoding="utf-8")

        graph = {"@context": "https://schema.org", "@graph": bauen(roh)}
        block = (
            ANFANG
            + '\n<script type="application/ld+json">\n'
            + json.dumps(graph, ensure_ascii=False, indent=2)
            + "\n</script>\n"
            + ENDE
        )

        if ANFANG in roh:
            neu = re.sub(
                re.escape(ANFANG) + r".*?" + re.escape(ENDE), lambda _: block, roh, flags=re.S
            )
        else:
            neu = roh.replace("</head>", block + "\n\n</head>", 1)

        pfad.write_text(neu, encoding="utf-8")
        anzahl = sum(1 for k in graph["@graph"] if k.get("@type") == "FAQPage"
                     for _ in k["mainEntity"])
        print(f"{datei}: {len(graph['@graph'])} Knoten, {anzahl} FAQ-Eintraege")


if __name__ == "__main__":
    schreiben()
