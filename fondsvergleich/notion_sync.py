#!/usr/bin/env python3
"""Tarife aus Notion in den Fondsvergleich übernehmen.

Liest die Datenbank „Tarife“ (Seite „Versicherungs-Tarifvergleich – WBW / finanz-medizin“)
über die offizielle Notion-API und schreibt fondsvergleich/tarife.js neu.

Voraussetzung:
  1. In Notion eine interne Integration anlegen (Einstellungen → Verbindungen → Integration entwickeln)
     und die Seite „Versicherungs-Tarifvergleich – WBW / finanz-medizin“ mit ihr teilen.
  2. Den Schlüssel als Umgebungsvariable setzen:  export NOTION_TOKEN=secret_…

Aufruf (aus dem Repo-Stamm):
  python3 fondsvergleich/notion_sync.py            # schreibt fondsvergleich/tarife.js
  python3 fondsvergleich/notion_sync.py --dry-run  # zeigt nur, was übernommen würde

Übernommen werden Tarife der Sparten „Fondsgebundene RV“, „Private Rente“, „Basisrente“ und „bAV“,
deren Status nicht „Veraltet“ ist. Optionale Spalten, die der Rechner zusätzlich nutzt, wenn es sie
in Notion gibt: „Rentenfaktor (€ je 10.000 €)“, „Stückkosten (€ p.a.)“, „Honorar (€)“.
Nur Standardbibliothek, keine Abhängigkeiten.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.request

DATABASE_ID = "d76586021a944901a66d769526c28398"
NOTION_VERSION = "2022-06-28"
API = "https://api.notion.com/v1"
SPARTEN = {"Fondsgebundene RV", "Private Rente", "Basisrente", "bAV"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tarife.js")

# Notion-Spalte → Feld im Rechner
ZAHLEN = {
    "Abschlusskosten (% Beitragssumme)": "alpha",
    "Verwaltungskosten β (% Beitrag)": "beta",
    "Kosten aufs Guthaben γ (% p.a.)": "gamma",
    "Fondskosten TER (% p.a.)": "ter",
    "Effektivkosten RIY (%)": "riy",
    # optional – in Notion ergänzen, damit der Ablaufleistungshebel aus Fakten rechnet
    "Rentenfaktor (€ je 10.000 €)": "rentenfaktor",
    "Stückkosten (€ p.a.)": "stueck",
    "Honorar (€)": "honorar",
}
PROZENT_FELDER = {"alpha", "beta", "gamma", "ter", "riy"}

REFERENZ = {
    "id": "notion-referenz",
    "name": "Referenzannahme (Notion-Rechenbeispiel)",
    "versicherer": "kein realer Tarif",
    "tarifart": "Bruttotarif",
    "alpha": 2.5, "beta": 5, "gamma": 0.3, "ter": 0.2, "stueck": 0,
    "rentenfaktor": None,
    "quelle": "Notion · Rechenmodell Ablaufleistung · Referenzbeispiel (Annahmen)",
}


def call(method, path, token, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Bearer " + token,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def plain(rich):
    return "".join(x.get("plain_text", "") for x in rich or []).strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("NOTION_TOKEN")
    if not token:
        sys.exit("NOTION_TOKEN fehlt. Siehe Kopf dieser Datei.")

    schema = call("GET", f"/databases/{DATABASE_ID}", token)["properties"]
    prozent_format = {name for name, p in schema.items() if p.get("type") == "number" and p["number"].get("format") == "percent"}

    rows, cursor = [], None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        res = call("POST", f"/databases/{DATABASE_ID}/query", token, body)
        rows += res["results"]
        if not res.get("has_more"):
            break
        cursor = res["next_cursor"]

    versicherer_cache = {}

    def versicherer_name(page_id):
        if page_id not in versicherer_cache:
            props = call("GET", f"/pages/{page_id}", token)["properties"]
            title = next((p for p in props.values() if p["type"] == "title"), None)
            versicherer_cache[page_id] = plain(title["title"]) if title else ""
        return versicherer_cache[page_id]

    tarife, uebersprungen = [], []
    for row in rows:
        pr = row["properties"]
        name = plain(pr.get("Tarif", {}).get("title"))
        sparte = (pr.get("Sparte", {}).get("select") or {}).get("name")
        status = (pr.get("Status", {}).get("select") or {}).get("name")
        if sparte not in SPARTEN or status == "Veraltet":
            uebersprungen.append(f"{name or '(ohne Namen)'} – Sparte {sparte}, Status {status}")
            continue
        t = {
            "id": row["id"],
            "name": name or "(ohne Namen)",
            "versicherer": ", ".join(versicherer_name(r["id"]) for r in pr.get("Versicherer", {}).get("relation", [])),
            "sparte": sparte,
            "tarifart": (pr.get("Tarifart", {}).get("select") or {}).get("name") or "Bruttotarif",
            "status": status,
            "stand": ((pr.get("Stand", {}).get("date") or {}).get("start")),
            "notionUrl": row.get("url"),
            "quelle": "Notion · Datenbank Tarife",
        }
        for spalte, feld in ZAHLEN.items():
            if spalte in pr and pr[spalte].get("type") == "number":
                v = pr[spalte]["number"]
                if v is not None and feld in PROZENT_FELDER and spalte in prozent_format:
                    v = round(v * 100, 6)  # Notion speichert Prozentformat als Bruchteil
                t[feld] = v
        fehlt = [f for f in ("alpha", "beta", "gamma", "ter") if t.get(f) is None]
        if fehlt:
            t["hinweis"] = "fehlt in Notion: " + ", ".join(fehlt)
        tarife.append(t)

    heute = dt.date.today().isoformat()
    data = {
        "abgerufen": heute,
        "quelle": "Notion · Versicherungs-Tarifvergleich – WBW / finanz-medizin · Datenbank Tarife",
        "hinweis": "" if tarife else "Die Datenbank „Tarife“ enthält noch keine passenden Einträge.",
        "tarife": tarife,
        "referenz": REFERENZ,
    }

    print(f"{len(tarife)} Tarif(e) übernommen, {len(uebersprungen)} übersprungen.")
    for t in tarife:
        print(f"  + {t['versicherer'] or '–'} · {t['name']} ({t['tarifart']}){'  ⚠ ' + t['hinweis'] if t.get('hinweis') else ''}")
    for u in uebersprungen:
        print(f"  – {u}")
    if args.dry_run:
        return

    js = (
        "/* Tarifdaten für den Fondsvergleich.\n"
        "   Automatisch erzeugt von notion_sync.py aus der Notion-Datenbank „Tarife\"\n"
        "   (Seite „Versicherungs-Tarifvergleich – WBW / finanz-medizin\").\n"
        "   Nicht von Hand pflegen – Werte in Notion ändern und das Skript erneut ausführen.\n"
        "   Prozentwerte in Prozent (2.5 = 2,5 %). */\n"
        "window.FV_TARIFE = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print("geschrieben:", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
