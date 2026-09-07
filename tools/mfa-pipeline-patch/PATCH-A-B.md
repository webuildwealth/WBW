# Patch A + B für mfa-lead-pipeline

Zwei Änderungen an zwei Dateien, plus eine neue Datei.

- **A** — `lead_source_detail` trägt die Kategorie statt den Namen des Suchlaufs
- **B** — Ansprechpartner steht auch auf der Firma, damit er in der Anrufliste erscheint

Beides respektiert deine beiden Grundregeln aus `mapping.py`: Pipeline-eigene
Felder werden überschrieben, alles vom Vertrieb Pflegbare nur befüllt, wenn leer.

---

## Neue Datei: `src/mfa_pipeline/lead_kategorie.py`

Liegt bei (`lead_kategorie.py`). Einfach nach `src/mfa_pipeline/` kopieren.

Getestet gegen 28 BA-Berufsbezeichnungen und die 114 Anzeigentitel, die am
7. September 2026 in deinem Portal standen.

---

## A1 — `src/mfa_pipeline/hubspot/mapping.py`

### Import ergänzen

**Suchen:**
```python
from ..models import Lead
```

**Ersetzen durch:**
```python
from ..lead_kategorie import kategorie
from ..models import Lead
```

### Kategorie statt Suchlauf-Name schreiben

**Suchen:**
```python
        # Bewusst OHNE run_id: ein Zeitstempel in einem gespeicherten Feld
        # aendert sich bei jedem Lauf und erzwingt einen Schreibzugriff, ohne
        # dass sich inhaltlich etwas geaendert haette. Wann der Lead zuletzt
        # gesehen wurde, steht in ba_last_seen.
        "lead_source_detail": "BA Jobsuche — MFA Berlin 50 km",
```

**Ersetzen durch:**
```python
        # Bewusst OHNE run_id: ein Zeitstempel in einem gespeicherten Feld
        # aendert sich bei jedem Lauf und erzwingt einen Schreibzugriff, ohne
        # dass sich inhaltlich etwas geaendert haette. Wann der Lead zuletzt
        # gesehen wurde, steht in ba_last_seen, und aus welcher Quelle er
        # stammt, in ba_source.
        #
        # Frueher stand hier der Name des Suchlaufs, fuer jeden Lead derselbe
        # Wert. Am 2026-09-07 trugen so alle 114 Firmen "BA Jobsuche — MFA
        # Berlin 50 km", obwohl nur 43 davon MFA-Stellen waren und 40
        # Zahnarztpraxen. Das ist die Herkunft der ABFRAGE, nicht die des
        # Leads. Jetzt steht hier, was der Lead tatsaechlich ist.
        "lead_source_detail": _lead_kategorie(lead, latest_job),
```

### Hilfsfunktion ergänzen

**Direkt vor `def _lead_status(lead: Lead) -> str:` einfügen:**

```python
def _lead_kategorie(lead: Lead, latest_job) -> str:
    """Kategorie fuer lead_source_detail — aus `beruf`, nicht aus dem Titel.

    Aus demselben Grund, aus dem mfa_filter auf `beruf` und `hauptDkz`
    entscheidet: der Anzeigentitel ist Marketingtext ("Augenperle gesucht
    (m/w/d)"), `beruf` ist die normalisierte Berufsbezeichnung der BA.
    """
    beruf = getattr(lead, "beruf", None)
    if beruf is None and latest_job is not None:
        beruf = getattr(latest_job, "beruf", None)
    titel = getattr(latest_job, "job_title", None) if latest_job else None
    return kategorie(beruf, titel)
```

> **Eine Zeile musst du prüfen:** ob das BA-Feld `beruf` bei dir auf dem Lead
> oder auf dem Job liegt — und ob es dort so heißt. `getattr` fängt beide Fälle
> ab und fällt sonst auf den Titel zurück, aber mit dem richtigen Feld ist das
> Ergebnis deutlich besser. In `models.py` steht die Antwort.

---

## A2 — `src/mfa_pipeline/hubspot/properties.py`

`lead_source_detail` wird von Freitext auf Aufzählung umgestellt. Für ein
frisches Portal legt die Pipeline sie damit gleich richtig an.

### Import ergänzen

**Nach `from __future__ import annotations` einfügen:**
```python

from ..lead_kategorie import OPTIONEN as LEAD_SOURCE_OPTIONEN
```

### Definition ersetzen

**Suchen:**
```python
    {"name": "lead_source_detail", "label": "Lead-Quelle Detail", "type": "string",
     "fieldType": "text", "groupName": GROUP_NAME,
     "description": "Feingranulare Herkunft, z.B. 'BA MFA Berlin 50km <run_id>'."},
```

**Ersetzen durch:**
```python
    {"name": "lead_source_detail", "label": "Lead-Quelle Detail",
     "type": "enumeration", "fieldType": "select", "groupName": GROUP_NAME,
     "description": (
         "Was der Lead ist, abgeleitet aus dem BA-Feld beruf. NICHT der Name "
         "des Suchlaufs — der steht in ba_source."
     ),
     "options": [
         {"label": label, "value": wert, "displayOrder": i}
         for i, (wert, label) in enumerate(LEAD_SOURCE_OPTIONEN)
     ]},
```

> **Achtung, einmalige Migration:** In Portal 146821371 existiert
> `lead_source_detail` bereits als Freitext. `plan_properties` legt nur an,
> was fehlt — die bestehende Property bleibt also String, und die Pipeline
> würde beim nächsten Lauf einen Enum-Wert in ein Textfeld schreiben. Das geht
> gut, ist aber nicht das Ziel. Die Umstellung auf Aufzählung ist ein
> **einmaliger Schritt**, den `hubspot_setup.py` aus dem WBW-Repo erledigt.
> Erst danach passt beides zusammen.

---

## B — Ansprechpartner auf die Firma

Deine Pipeline extrahiert den Namen bereits (`enrichment.py`,
`extract_contact_name`), schreibt ihn aber nur auf den Kontakt. In einer
HubSpot-**Unternehmensliste** lassen sich Kontaktfelder nicht anzeigen — für
die Anrufliste fehlt er damit genau dort, wo du ihn brauchst.

### B1 — `mapping.py`: in die Fill-if-empty-Liste

**Suchen:**
```python
# Standard-Properties: nur befuellen, wenn im CRM leer.
FILL_IF_EMPTY_COMPANY = {
    "name", "domain", "website", "phone", "city", "zip", "address", "country",
    "industry", "numberofemployees",
}
```

**Ersetzen durch:**
```python
# Nur befuellen, wenn im CRM leer. Neben den HubSpot-Standard-Properties auch
# ansprechpartner: der Name stammt zwar aus der Anzeige, ist aber ein Feld, das
# der Vertrieb nach dem ersten Anruf korrigiert. Regel 2 gilt auch hier — ein
# gepflegter Wert gewinnt gegen einen automatisch ermittelten.
FILL_IF_EMPTY_COMPANY = {
    "name", "domain", "website", "phone", "city", "zip", "address", "country",
    "industry", "numberofemployees", "ansprechpartner", "ansprechpartner_funktion",
}
```

### B2 — `mapping.py`: Werte setzen

**Suchen:**
```python
        "industry": None,  # BA-`branche` passt nicht auf die HubSpot-Taxonomie
        "numberofemployees": parse_employee_count(lead.employee_count),
    }
```

**Ersetzen durch:**
```python
        "industry": None,  # BA-`branche` passt nicht auf die HubSpot-Taxonomie
        "numberofemployees": parse_employee_count(lead.employee_count),
        # Spiegel des Ansprechpartners auf Firmenebene. Der fuehrende Datensatz
        # bleibt der Kontakt; hier steht er nur, damit er in der Anrufliste
        # ueber den Unternehmen sichtbar ist — Kontaktfelder lassen sich dort
        # nicht als Spalte einblenden.
        "ansprechpartner": lead.contact_name,
        "ansprechpartner_funktion": lead.contact_role,
    }
```

### B3 — `properties.py`: zwei Properties ergänzen

**Am Ende von `COMPANY_PROPERTIES`, vor der schließenden `]`, einfügen:**

```python
    {"name": "ansprechpartner", "label": "Ansprechpartner", "type": "string",
     "fieldType": "text", "groupName": GROUP_NAME,
     "description": (
         "Name des Ansprechpartners aus der Stellenanzeige. Spiegel des "
         "zugehoerigen Kontakts, damit der Name in der Unternehmensliste als "
         "Spalte verfuegbar ist. Fuehrend bleibt der Kontakt-Datensatz."
     )},
    {"name": "ansprechpartner_funktion", "label": "Ansprechpartner — Funktion",
     "type": "string", "fieldType": "text", "groupName": GROUP_NAME,
     "description": "Rolle laut Anzeige, z.B. 'Bewerbungskontakt'."},
```

---

## Was danach zu prüfen ist

```bash
cd ~/Desktop/WBW-FM/mfa-lead-pipeline
source .venv/bin/activate
python3 -m pytest tests/ -q
```

`tests/test_hubspot.py` prüft vermutlich die erwarteten Properties. Wenn dort
der alte Freitext `"BA Jobsuche — MFA Berlin 50 km"` fest steht, schlägt der
Test zu Recht fehl — dann muss die Erwartung auf die Kategorie umgestellt
werden. Schick mir die Fehlermeldung, dann liefere ich die Anpassung.
