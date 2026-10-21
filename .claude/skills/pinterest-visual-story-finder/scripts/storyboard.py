#!/usr/bin/env python3
"""Wandelt ein Storyboard-JSON in Markdown-Plan + CSV-Bildliste um.

Pins ohne "status": "VERIFIZIERT" werden als SUCHANFRAGE/unverifiziert markiert.
Pinterest-Pin-Links ohne Verifizierung erzeugen eine Warnung (Erfindungsschutz).

  storyboard.py examples/inflation-reel.json [-o out_dir]
Format siehe examples/inflation-reel.json.
"""
import argparse
import csv
import json
import os
import re
import sys
from urllib.parse import quote_plus

SEARCH = "https://www.pinterest.com/search/pins/?q="
PIN_RE = re.compile(r"pinterest\.[a-z.]+/pin/\d+", re.I)
RIGHTS = {"frei": "🟢 frei", "lizenziert": "🟢 lizenziert", "klaerbar": "🟡 klärbar", "ungeklaert": "🔴 ungeklärt"}


def ts(sec):
    return f"{int(sec // 60)}:{int(sec % 60):02d}"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("json_file")
    p.add_argument("-o", "--out", default=".")
    a = p.parse_args()
    with open(a.json_file, encoding="utf-8") as fh:
        d = json.load(fh)
    os.makedirs(a.out, exist_ok=True)
    warn, rows = [], []
    md = [f"# Visuelle Story: {d.get('title', 'Reel')}",
          f"_Dauer: {d.get('duration_s', '?')} s · Layout-Standard: {d.get('default_layout', 'L1')}_\n",
          "## A. Visuelle Leitidee", d.get("concept", "-"), "", "## B. Szenenplan",
          "| # | Zeit | Satz | Motiv | Ästhetik | Animation |", "|---|---|---|---|---|---|"]
    for i, s in enumerate(d["scenes"], 1):
        md.append(f"| {i} | {ts(s['start'])}-{ts(s['end'])} | {s['line']} | {s.get('motif', '')} | "
                  f"{s.get('aesthetic', '')} | {s.get('animation', '')} |")
    md += ["", "## C. Bildauswahl"]
    for i, s in enumerate(d["scenes"], 1):
        md += [f"\n### Szene {i} · {ts(s['start'])}-{ts(s['end'])} · {s['line']}",
               f"Emotion: {s.get('emotion', '-')} · Layout: {s.get('layout', d.get('default_layout', 'L1'))}"]
        md.append("**Suchanfragen** _(nicht verifiziert)_:")
        for q in s.get("queries", []):
            md.append(f"- [{q}]({SEARCH}{quote_plus(q)})")
        for im in s.get("images", []):
            url = im.get("url", "")
            ok = im.get("status") == "VERIFIZIERT"
            is_pin = bool(PIN_RE.search(url))
            if is_pin and not ok:
                warn.append(f"Szene {i}: Pin-Link ohne Verifizierung: {url}")
            status = "VERIFIZIERT" if ok else ("SUCHANFRAGE" if "/search/" in url else "UNVERIFIZIERT")
            rights = RIGHTS.get(im.get("rights", "ungeklaert"), "🔴 ungeklärt")
            md.append(f"- **{im.get('role', 'Bild')}** [{status}] {url} · Quelle: {im.get('source', 'unbekannt')} · "
                      f"Auflösung: {im.get('resolution', 'ungeprüft')} · Rechte: {rights}\n  - {im.get('why', '')}")
            rows.append([i, im.get("role", ""), url, status, im.get("source", ""),
                         im.get("resolution", "ungeprüft"), rights, im.get("score", ""), im.get("why", "")])
    md += ["", "## D. Collage-Plan"]
    for c in d.get("collages", []):
        md.append(f"- **{ts(c['start'])}-{ts(c['end'])}** · {c['layout']} · {c['cells']}")
    md += ["", "## E. Schnittanweisungen"] + [f"- {x}" for x in d.get("edit_notes", [])]
    red = sum(1 for r in rows if r[6].startswith("🔴"))
    yel = sum(1 for r in rows if r[6].startswith("🟡"))
    unver = sum(1 for r in rows if r[3] != "VERIFIZIERT")
    md += ["", "## F. Offene Punkte",
           f"- Rechte: {red} × 🔴, {yel} × 🟡", f"- Nicht verifizierte Bildlinks: {unver}"] + [f"- ⚠️ {w}" for w in warn]
    with open(os.path.join(a.out, "storyboard.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(md) + "\n")
    with open(os.path.join(a.out, "bildliste.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["szene", "rolle", "link", "status", "quelle", "aufloesung", "rechte", "score", "warum"])
        w.writerows(rows)
    print(f"geschrieben: {a.out}/storyboard.md, {a.out}/bildliste.csv · Warnungen: {len(warn)}")
    return 1 if warn else 0


if __name__ == "__main__":
    sys.exit(main())
