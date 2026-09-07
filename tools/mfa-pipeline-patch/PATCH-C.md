# Patch C — Enrichment Phase 2

Von 9 % Telefonnummern auf brauchbare Werte. Zwei neue Dateien, keine Änderung
an bestehendem Code.

- `src/mfa_pipeline/impressum.py` — neues Modul
- `scripts/messe_phase2.py` — Messwerkzeug

Beide nutzen `enrichment.py` wieder, statt dessen Logik zu duplizieren: die
Telefon-Erkennung inklusive Fax-Unterscheidung kommt aus deinem bestehenden
Code.

---

## Zuerst messen, dann bauen

```bash
cd ~/Desktop/WBW-FM/mfa-lead-pipeline
source .venv/bin/activate
python3 scripts/messe_phase2.py --zeige 3
```

Das Skript liest deinen letzten Lauf und teilt die Leads in vier Stufen. Es
schreibt nichts und braucht kein Netz.

```
  Stufe 0  Telefon steht in der Anzeige             1   10%  ███·····························
  Stufe 1  Website bekannt, Impressum crawlbar      2   20%  ██████··························
  Stufe 2  Domain aus Mailadresse ableitbar         2   20%  ██████··························
  Rest     nur ueber kostenpflichtige Suche         5   50%  ████████████████················
```

**Schick mir diese Ausgabe.** Sie entscheidet, ob sich Stufe 1 und 2 lohnen
oder ob du direkt eine Suche brauchst. Ohne diese Zahl bauen wir ins Blaue.

---

## Warum diese Reihenfolge

Nach Kosten sortiert, nicht nach Trefferquote. Deine eigene Begründung in
`docs/ENRICHMENT.md` — externe Suche erst, wenn die billigen Quellen erschöpft
sind — gilt hier genauso.

| Stufe | Quelle | Kosten | Was fehlt noch |
|---|---|---|---|
| 0 | Anzeigentext | keine | nichts, ist gebaut |
| 1 | Impressum der bekannten Website | nur Zeit | Abrufschicht |
| 2 | Domain aus Nicht-Freemail-Adresse | keine | Abrufschicht |
| 3 | Suchmaschine | Geld + Schlüssel | alles |

Im HubSpot-Bestand haben 28 von 124 Firmen eine Domain. Impressum allein
brächte dich also nur auf etwa 19 % — **Stufe 2 ist der eigentliche Hebel**,
weil sie ohne einen Cent zusätzliche Domains erschließt.

---

## Stufe 2 löst bewusst eine deiner Regeln auf

`mapping.domain_aus_website` leitet **nie** eine Website aus einer E-Mail-Domain
ab. Die Begründung im Code ist richtig:

> eine Praxis, die ueber 'praxis@gmx.de' schreibt, bekommt kein 'gmx.de' als Firmendomain

Die Regel ist aber zu grob. `nadine.schreiber@immanuelalbertinen.de` **ist** die
Praxisdomain. Die Unterscheidung ist eine Liste von Freemail-Anbietern, kein
generelles Verbot.

`impressum.domain_aus_email` macht genau das und gibt `None` zurück bei:

- Freemail (gmx, web.de, t-online, gmail, icloud, posteo, … — 40 Einträge)
- Jobbörsen, über deine bestehende `ist_ausgeschlossene_domain`
- allem, was nicht wie ein Hostname aussieht

**Wichtig:** Das Ergebnis ist ein *Kandidat*, keine bestätigte Website. Es
gehört nicht direkt nach HubSpot — erst der erfolgreiche Abruf des Impressums
bestätigt es. Dafür ist `ist_plausible_praxisseite` da: sie sucht ein markantes
Wort aus dem Firmennamen im Seitentext und bremst so gegen geparkte Domains und
Verwechslungen.

---

## Was noch fehlt: die Abrufschicht

Ich kann sie nicht schreiben, ohne deine `src/mfa_pipeline/http.py` gesehen zu
haben — 237 Zeilen, in denen vermutlich schon Wiederholung, Zeitlimits und
Ratenbegrenzung stecken. Die will ich wiederverwenden und nicht danebenbauen.

Die Schicht braucht drei Dinge:

**Startseite holen, Impressum-Link suchen.** `impressum_kandidaten(basis, html)`
liefert die Adressen in der richtigen Reihenfolge: erst ein im HTML gefundener
Link, dann die üblichen Pfade als Rateversuch. Der Rateversuch ist nötig, weil
viele Praxis-Seiten per JavaScript aufgebaut werden und im ausgelieferten HTML
gar keinen Link enthalten.

**Höflich sein.** Eine Anfrage pro Sekunde und Domain, `robots.txt` beachten,
ein sprechender User-Agent mit Kontaktadresse. Du crawlst deine künftigen
Kunden — ein Server, der dich sperrt, ist ein verlorener Lead.

**Herkunft mitführen.** Jeder gefundene Wert bekommt sein `Provenance` mit
`source="IMPRESSUM"` und der abgerufenen URL, genau wie in Phase 1. Bei einer
DSGVO-Auskunft musst du sagen können, woher die Nummer stammt.

Schick mir `http.py`, dann schreibe ich sie passend dazu.

---

## Was geprüft ist

`impressum.py` ist gegen 24 Fälle getestet — Freemail in allen Varianten,
Jobbörsen-Subdomains, Impressum-Links neben anderen Links, Fax vor Telefon,
unbeschriftete Nummern, geparkte Domains. Alle grün.

**Nicht getestet:** alles, was Netz braucht. Diese Umgebung hat keinen
Internetzugang, auch nicht zu `example.com`. Die Parser sind geprüft, die
Abrufschicht musst du gegen echte Seiten testen.
