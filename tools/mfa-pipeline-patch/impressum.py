"""Enrichment Phase 2 — Domain finden und Impressum auswerten.

Phase 1 (`enrichment.py`) liest nur, was in der BA-Anzeige steht. Gemessen am
2026-09-07 ergab das bei 124 Praxen 11 Telefonnummern, also 9 Prozent. Das ist
kein Fehler, sondern der dokumentierte Umfang von Phase 1.

Diese Stufe holt die Nummer dort, wo sie rechtlich stehen MUSS: im Impressum
der Praxis-Website. Arztpraxen fuehren dort praktisch immer eine
Telefonnummer, weil Patienten anrufen koennen muessen.

Die Reihenfolge ist nach Kosten sortiert, nicht nach Trefferquote
    1. Domain aus einer Nicht-Freemail-Adresse ableiten — kostet nichts, die
       Adressen liegen aus Phase 1 bereits vor
    2. Impressum der bekannten Domain crawlen — kostet nichts ausser Zeit
    3. Erst danach eine kostenpflichtige Suche fuer den Rest

Schritt 1 loest bewusst eine Regel aus Phase 1 auf. `mapping.domain_aus_website`
leitet NIE eine Website aus einer E-Mail-Domain ab, mit der richtigen
Begruendung: 'praxis@gmx.de' darf nicht zu 'gmx.de' werden. Die Regel ist aber
zu grob — 'nadine.schreiber@immanuelalbertinen.de' IST die Praxisdomain. Die
Unterscheidung ist eine Liste von Freemail-Anbietern, nicht ein Verbot.

Nur Standardbibliothek.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urljoin, urlparse

from .enrichment import (
    PHONE_RE,
    _clean_text,
    _telefonart,
    ist_ausgeschlossene_domain,
    normalize_phone,
)

# Anbieter, deren Domain nie die Domain der Praxis ist. Bewusst grosszuegig:
# ein fehlender Eintrag erzeugt eine falsche Firmendomain, ein ueberfluessiger
# kostet nur einen Lead, der ohnehin ueber die Suche laeuft.
FREEMAIL_DOMAINS = {
    "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "web.de", "t-online.de",
    "gmail.com", "googlemail.com", "outlook.com", "outlook.de", "hotmail.com",
    "hotmail.de", "live.de", "live.com", "msn.com", "yahoo.com", "yahoo.de",
    "aol.com", "aol.de", "icloud.com", "me.com", "mac.com", "freenet.de",
    "arcor.de", "posteo.de", "mailbox.org", "mail.de", "email.de", "online.de",
    "unitybox.de", "vodafone.de", "1und1.de", "alice-dsl.net", "kabelmail.de",
    "protonmail.com", "proton.me", "tutanota.de", "firemail.de", "gmx.com",
}

# Pfade, unter denen deutsche Praxis-Websites ihr Impressum fuehren. In dieser
# Reihenfolge probiert, bevor der HTML-Text nach einem Link durchsucht wird.
IMPRESSUM_PFADE = (
    "/impressum", "/impressum.html", "/impressum.php", "/impressum/",
    "/kontakt", "/kontakt.html", "/kontakt/", "/praxis/impressum",
    "/de/impressum", "/rechtliches", "/imprint",
)

# Ein Link, dessen Text oder Ziel auf ein Impressum deutet.
IMPRESSUM_LINK_RE = re.compile(
    r'(?is)<a\b[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>(.{0,120}?)</a>'
)
IMPRESSUM_WORT_RE = re.compile(r"(?i)impressum|imprint|rechtliche?s|anbieterkennzeichnung")


def domain_aus_email(email: Optional[str]) -> Optional[str]:
    """Praxisdomain aus einer E-Mail-Adresse — oder None.

    Gibt None zurueck bei Freemail-Anbietern, bei Jobboersen und bei allem,
    was nicht wie ein Hostname aussieht. Eine zurueckgegebene Domain ist ein
    KANDIDAT, keine bestaetigte Website: sie muss noch abgerufen werden.
    """
    if not email or "@" not in email:
        return None
    domain = email.rsplit("@", 1)[1].lower().strip(". ")
    if not domain or "." not in domain:
        return None
    if domain in FREEMAIL_DOMAINS or ist_ausgeschlossene_domain(domain):
        return None
    # Ein Label darf nicht leer sein und die TLD muss aus Buchstaben bestehen.
    teile = domain.split(".")
    if any(not t for t in teile) or not teile[-1].isalpha() or len(teile[-1]) < 2:
        return None
    return domain


def impressum_kandidaten(basis_url: str, html: Optional[str] = None) -> list[str]:
    """Moegliche Impressum-Adressen, beste zuerst.

    Erst ein im HTML gefundener Link — der ist belegt. Danach die ueblichen
    Pfade als Rateversuch, weil viele Praxis-Websites die Startseite per
    JavaScript aufbauen und im ausgelieferten HTML gar keinen Link haben.
    """
    kandidaten: list[str] = []
    gesehen: set[str] = set()

    def merken(url: str) -> None:
        norm = url.rstrip("/").lower()
        if norm not in gesehen:
            gesehen.add(norm)
            kandidaten.append(url)

    if html:
        for href, text in IMPRESSUM_LINK_RE.findall(html):
            if IMPRESSUM_WORT_RE.search(text) or IMPRESSUM_WORT_RE.search(href):
                ziel = urljoin(basis_url, href.strip())
                if urlparse(ziel).scheme in {"http", "https"}:
                    merken(ziel)

    for pfad in IMPRESSUM_PFADE:
        merken(urljoin(basis_url, pfad))

    return kandidaten


def telefon_aus_impressum(html: str) -> tuple[Optional[str], list[str]]:
    """Erste belastbare Telefonnummer und alle erkannten Faxnummern.

    Dieselbe Logik wie in Phase 1: eine Nummer hinter dem Wort 'Fax' ist keine
    Telefonnummer. Ausdruecklich als Telefon bezeichnete Nummern gewinnen
    gegen unbeschriftete.
    """
    text = _clean_text(html)

    beschriftet: list[str] = []
    unbeschriftet: list[str] = []
    faxnummern: list[str] = []
    gesehen: set[str] = set()

    for treffer in PHONE_RE.finditer(text):
        nummer = normalize_phone(treffer.group(0))
        if not nummer or nummer in gesehen:
            continue
        gesehen.add(nummer)
        art = _telefonart(text, treffer.start())
        if art == "fax":
            faxnummern.append(nummer)
        elif art == "tel":
            beschriftet.append(nummer)
        else:
            unbeschriftet.append(nummer)

    reihenfolge = beschriftet + unbeschriftet
    return (reihenfolge[0] if reihenfolge else None), faxnummern


def ist_plausible_praxisseite(html: str, firmenname: str) -> bool:
    """Grobe Gegenprobe, dass die abgerufene Seite zur Praxis gehoert.

    Kein Beweis, nur eine Bremse gegen geparkte Domains und Verwechslungen.
    Gesucht wird ein markantes Wort aus dem Firmennamen im Seitentext —
    Rechtsformen und Allerweltswoerter zaehlen dabei nicht.
    """
    text = _clean_text(html).lower()
    if not text:
        return False
    unwichtig = {
        "gmbh", "gbr", "mvz", "praxis", "dr", "med", "dent", "prof", "und",
        "der", "die", "das", "fuer", "für", "am", "im", "zentrum", "arztpraxis",
        "zahnarztpraxis", "gemeinschaftspraxis", "mbh", "ubag", "übag",
    }
    woerter = [
        w for w in re.split(r"[^\wäöüß]+", (firmenname or "").lower())
        if len(w) > 3 and w not in unwichtig
    ]
    return any(w in text for w in woerter) if woerter else False
