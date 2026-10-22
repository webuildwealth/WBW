#!/usr/bin/env python3
"""Suche nach kommerziell nutzbaren Bildern + Download + Lizenzprotokoll.

  image_search.py "doctor retirement" --out-dir images/        # Test von der Kommandozeile

Quellen (in dieser Reihenfolge):
  1. Openverse (api.openverse.org) – Filter license_type=commercial,modification → CC0, PDM, CC BY, CC BY-SA
  2. Wikimedia Commons (commons.wikimedia.org) – nur CC0 / Public Domain / CC BY / CC BY-SA
Jeder Treffer wird mit Urheber, Lizenz, Quelle in images/credits.json protokolliert; CC-BY/BY-SA verlangen Namensnennung
→ build_reel schreibt out/credits.txt für die Instagram-Caption. Benötigte Hosts: api.openverse.org, commons.wikimedia.org,
upload.wikimedia.org sowie die Bild-Hosts der Treffer (z. B. live.staticflickr.com).
"""
import json, pathlib, re, sys, urllib.parse, urllib.request

UA = {"User-Agent": "FinanzMedizinReelStudio/1.0 (Instagram explainer production)"}
OK_LIC = {"cc0", "pdm", "by", "by-sa"}


def _get(url, timeout=25):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def openverse(query, n=10):
    q = urllib.parse.urlencode({"q": query, "license_type": "commercial,modification", "page_size": n, "mature": "false", "aspect_ratio": "wide,square"})
    d = json.loads(_get("https://api.openverse.org/v1/images/?" + q))
    for r in d.get("results", []):
        if r.get("license", "").lower() in OK_LIC and (r.get("width") or 0) >= 800:
            yield {"url": r["url"], "source": r.get("foreign_landing_url"), "creator": r.get("creator") or "unbekannt",
                   "license": r["license"].upper(), "license_url": r.get("license_url"), "title": r.get("title") or query, "provider": "Openverse/" + (r.get("provider") or "")}


def wikimedia(query, n=10):
    q = urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrsearch": f"filetype:bitmap {query}", "gsrnamespace": 6,
                                "gsrlimit": n, "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 1600})
    d = json.loads(_get("https://commons.wikimedia.org/w/api.php?" + q))
    for p in (d.get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
        lic = (md.get("LicenseShortName", {}).get("value", "")).lower()
        norm = "cc0" if "cc0" in lic else "pdm" if "public domain" in lic else "by-sa" if "by-sa" in lic else "by" if re.search(r"cc by \d", lic) else None
        if norm and ii.get("width", 0) >= 800:
            yield {"url": ii.get("thumburl") or ii["url"], "source": ii.get("descriptionurl"), "creator": re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", "unbekannt")),
                   "license": lic.upper(), "license_url": md.get("LicenseUrl", {}).get("value"), "title": p.get("title"), "provider": "Wikimedia Commons"}


def find(query, out_dir):
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    errors = []
    for src in (openverse, wikimedia):
        try:
            for hit in src(query):
                try:
                    data = _get(hit["url"], 40)
                except Exception as e:
                    errors.append(str(e)); continue
                ext = ".png" if data[:4] == b"\x89PNG" else ".jpg"
                fn = out / (re.sub(r"\W+", "_", query.lower())[:40] + ext)
                fn.write_bytes(data)
                hit["path"] = str(fn)
                hit["credit"] = f"„{hit['title']}“ von {hit['creator']}, {hit['license']} ({hit['source']})"
                cj = out / "credits.json"
                credits = json.loads(cj.read_text()) if cj.exists() else []
                credits.append(hit); cj.write_text(json.dumps(credits, ensure_ascii=False, indent=1))
                return hit
        except Exception as e:
            errors.append(f"{src.__name__}: {e}")
    raise RuntimeError("kein lizenzfreies Bild gefunden/abrufbar – " + " | ".join(errors[:3]))


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument("query"); ap.add_argument("--out-dir", default="images")
    a = ap.parse_args()
    print(json.dumps(find(a.query, a.out_dir), ensure_ascii=False, indent=1))
