#!/usr/bin/env python3
"""Erzeugt Pinterest-Suchlinks aus Suchbegriffen.

Ergebnis sind SUCHANFRAGEN, keine verifizierten Bildfunde.

Beispiele:
  build_search_links.py "vintage supermarket photography" "inflation surreal collage"
  build_search_links.py -f queries.txt --format md
  echo "dark money aesthetic" | build_search_links.py -
"""
import argparse
import sys
from urllib.parse import quote_plus

BASE = "https://www.pinterest.com/search/pins/?q="


def link(query: str) -> str:
    return BASE + quote_plus(query.strip())


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("queries", nargs="*", help="Suchbegriffe; '-' liest von stdin")
    p.add_argument("-f", "--file", help="Datei mit einer Query pro Zeile")
    p.add_argument("--format", choices=["plain", "md", "tsv"], default="md")
    a = p.parse_args()

    qs = []
    for q in a.queries:
        if q == "-":
            qs += [l for l in sys.stdin.read().splitlines()]
        else:
            qs.append(q)
    if a.file:
        with open(a.file, encoding="utf-8") as fh:
            qs += fh.read().splitlines()
    qs = [q.strip() for q in qs if q.strip() and not q.strip().startswith("#")]
    if not qs:
        p.error("keine Suchbegriffe angegeben")

    for q in qs:
        if a.format == "md":
            print(f"- [{q}]({link(q)})  _(SUCHANFRAGE, nicht verifiziert)_")
        elif a.format == "tsv":
            print(f"{q}\t{link(q)}\tSUCHANFRAGE")
        else:
            print(link(q))
    return 0


if __name__ == "__main__":
    sys.exit(main())
