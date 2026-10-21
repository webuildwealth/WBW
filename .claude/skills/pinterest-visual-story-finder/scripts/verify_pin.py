#!/usr/bin/env python3
"""Prüft Pinterest-Pin-URLs: erreichbar? Titel, Bild-URL, Pixelmaße, Quelle.

Nutzt nur die Standardbibliothek. Wenn Pinterest anonyme Abrufe blockiert oder
das Netz fehlt, wird das ehrlich gemeldet (Status UNVERIFIZIERT), es wird nie
etwas erfunden.

  verify_pin.py https://www.pinterest.com/pin/123456789/
  verify_pin.py -f pins.txt --json
"""
import argparse
import html
import json
import re
import struct
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

UA = "Mozilla/5.0 (compatible; PinVerify/1.0)"
PIN_RE = re.compile(r"^https?://([a-z]{2,3}\.)?pinterest\.[a-z.]+/pin/\d+/?", re.I)


def fetch(url, binary=False, limit=2_000_000, rng=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **({"Range": rng} if rng else {})})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = r.read(limit)
        return (data if binary else data.decode("utf-8", "replace")), r.headers


def meta(page, prop):
    m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']*)' % re.escape(prop), page, re.I)
    if not m:
        m = re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']%s["\']' % re.escape(prop), page, re.I)
    return html.unescape(m.group(1)) if m else None


def image_size(data):
    """PNG/JPEG/GIF/WebP-Maße aus den Headerbytes."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        if data[12:16] == b"VP8X":
            return (1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little"))
        if data[12:16] == b"VP8 ":
            return struct.unpack("<HH", data[26:30])[0] & 0x3FFF, struct.unpack("<HH", data[26:30])[1] & 0x3FFF
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    return None


def verify(url):
    res = {"url": url, "status": "UNVERIFIZIERT", "title": None, "image": None,
           "size": None, "source": None, "note": ""}
    if not PIN_RE.match(url):
        res["note"] = "keine gültige Pin-URL (erwartet .../pin/<id>/)"
        return res
    page = None
    try:
        page, _ = fetch(url)
    except urllib.error.HTTPError as e:
        res["note"] = f"HTTP {e.code} (Pinterest blockiert evtl. anonyme Abrufe)"
    except Exception as e:  # Netz/Proxy/TLS
        res["note"] = f"Abruf fehlgeschlagen: {type(e).__name__}: {e}"
    if page is None:
        try:  # Fallback: oEmbed
            raw, _ = fetch("https://www.pinterest.com/oembed.json?url=" + quote(url, safe=""))
            j = json.loads(raw)
            res.update(status="VERIFIZIERT (oEmbed)", title=j.get("title"), source=j.get("author_name"))
            res["note"] = ""
        except Exception:
            pass
        return res

    res["title"] = meta(page, "og:title")
    res["image"] = meta(page, "og:image")
    canon = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', page, re.I)
    link_src = re.search(r'"(?:link|domain)"\s*:\s*"([^"]+)"', page)
    res["source"] = html.unescape(link_src.group(1)) if link_src else None
    if res["title"] or res["image"] or canon:
        res["status"] = "VERIFIZIERT"
    if res["image"]:
        try:
            data, _ = fetch(res["image"], binary=True, limit=262144, rng="bytes=0-262143")
            res["size"] = image_size(data)
        except Exception as e:
            res["note"] = f"Bild-URL gefunden, Größe nicht lesbar ({type(e).__name__})"
        if res["size"] is None and not res["note"]:
            res["note"] = "Bildgröße nicht ermittelbar"
        if "/236x/" in res["image"] or "/474x/" in res["image"]:
            res["note"] += " Thumbnail-URL: Originalbild über /originals/ prüfen."
    return res


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("urls", nargs="*")
    p.add_argument("-f", "--file", help="Datei mit einer Pin-URL pro Zeile")
    p.add_argument("--json", action="store_true")
    a = p.parse_args()
    urls = list(a.urls)
    if a.file:
        with open(a.file, encoding="utf-8") as fh:
            urls += [l.strip() for l in fh if l.strip() and not l.startswith("#")]
    if not urls:
        p.error("keine URLs angegeben")
    out = [verify(u) for u in urls]
    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        for r in out:
            sz = f"{r['size'][0]}x{r['size'][1]} px" if r["size"] else "Auflösung ungeprüft"
            print(f"[{r['status']}] {r['url']}\n  Titel: {r['title']}\n  Bild: {r['image']}\n  {sz} | Quelle: {r['source']}"
                  + (f"\n  Hinweis: {r['note']}" if r["note"] else ""))
    return 0 if all(r["status"].startswith("VERIFIZIERT") for r in out) else 2


if __name__ == "__main__":
    sys.exit(main())
