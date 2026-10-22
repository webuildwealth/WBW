"""Pinterest als Bildquelle: passende, ästhetische Pins suchen, bewerten und herunterladen.

Abrufwege (nacheinander, erster Erfolg zählt):
  1. JSON-Endpunkt der Pinterest-Websuche (BaseSearchResource) – liefert Bild-URLs, Maße, Saves
  2. HTML der Suchseite – i.pinimg.com-URLs per Regex
  3. Headless-Browser (Playwright + Chromium, falls installiert) – lädt die Suchseite wie ein Mensch
Benötigt Netzzugriff auf www.pinterest.com und i.pinimg.com.

Auswahl "ästhetisch & catchy":
  * Vorfilter: keine Werbe-Pins, keine Videos, Mindestauflösung, keine Text-/Infografik-Pins (Titel-Stichwörter)
  * Metadaten-Score: Saves (Beliebtheit), Hochformat (Reels), Auflösung
  * Bild-Score nach Download: Kontrast, Farbigkeit, Schärfe; nahezu einfarbige Bilder fallen raus
  * Duplikat-Schutz über Bild-Hash, damit kein Motiv doppelt in der Collage steht
Pro Bildplatz wird außerdem ein Kontaktbogen der Kandidaten gespeichert (work/pinterest/), damit Claude oder
der Nutzer die Wahl prüfen und in edl.json ein anderes Bild setzen kann.

Rechtehinweis: Die Bilder gehören ihren Urhebern. Der Pin-Link und der Pinner werden im Report protokolliert.
"""
import html
import json
import math
import os
import re
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageDraw

from .util import log, warn

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0 Safari/537.36")
BAD_WORDS = re.compile(r"\b(quote|quotes|zitat|sprüche|infographic|infografik|tips|tipps|how to|checklist|"
                       r"template|printable|worksheet|planner|font|logo|meme|text|cheat ?sheet|step by step)\b", re.I)
PINIMG = re.compile(r"https://i\.pinimg\.com/(?:originals|736x|564x|474x)/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{32}\.(?:jpg|jpeg|png|webp)")


def _get(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _upgrade(url):
    """Thumbnail-URL -> Original (Fallback 736x)."""
    return re.sub(r"i\.pinimg\.com/\d+x/", "i.pinimg.com/originals/", url)


def search_json(query, n=30):
    src = "/search/pins/?q=" + urllib.parse.quote(query)
    data = {"options": {"query": query, "scope": "pins", "page_size": n, "rs": "typed"}, "context": {}}
    url = ("https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=" + urllib.parse.quote(src) +
           "&data=" + urllib.parse.quote(json.dumps(data, separators=(",", ":"))))
    raw = _get(url, {"Accept": "application/json, text/javascript, */*; q=0.01",
                     "X-Requested-With": "XMLHttpRequest", "X-Pinterest-AppState": "active",
                     "X-Pinterest-PWS-Handler": "www/search/[scope].js", "Referer": "https://www.pinterest.com/"})
    d = json.loads(raw)
    res = (d.get("resource_response") or {}).get("data") or {}
    results = res.get("results") if isinstance(res, dict) else res
    out = []
    for r in results or []:
        if not isinstance(r, dict) or r.get("type", "pin") != "pin":
            continue
        imgs = r.get("images") or {}
        best = imgs.get("orig") or imgs.get("736x") or {}
        if not best.get("url"):
            continue
        stats = ((r.get("aggregated_pin_data") or {}).get("aggregated_stats") or {})
        out.append({
            "id": str(r.get("id")), "url": best["url"], "fallback": (imgs.get("736x") or {}).get("url"),
            "w": best.get("width") or 0, "h": best.get("height") or 0,
            "title": (r.get("grid_title") or r.get("title") or "")[:140],
            "desc": (r.get("description") or "")[:200],
            "saves": stats.get("saves") or r.get("repin_count") or 0,
            "promoted": bool(r.get("is_promoted") or r.get("promoter")),
            "video": bool(r.get("videos") or r.get("story_pin_data_id") and r.get("is_video")),
            "pinner": ((r.get("pinner") or {}).get("username") or ""),
            "link": r.get("link") or "",
        })
    return out


def search_html(query):
    page = _get("https://www.pinterest.com/search/pins/?q=" + urllib.parse.quote(query)).decode("utf-8", "replace")
    urls, seen = [], set()
    for u in PINIMG.findall(html.unescape(page)):
        key = u.rsplit("/", 1)[-1]
        if key not in seen:
            seen.add(key)
            urls.append(u)
    ids = re.findall(r'/pin/(\d{8,})/', page)
    return [{"id": ids[i] if i < len(ids) else key_of(u), "url": _upgrade(u), "fallback": u, "w": 0, "h": 0,
             "title": "", "desc": "", "saves": 0, "promoted": False, "video": False, "pinner": "", "link": ""}
            for i, u in enumerate(urls)]


def search_browser(query, scrolls=3):
    from playwright.sync_api import sync_playwright
    exe = os.environ.get("CHROMIUM_PATH") or (
        "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, **({"executable_path": exe} if exe else {}))
        pg = b.new_page(user_agent=UA, viewport={"width": 1280, "height": 2000})
        pg.goto("https://www.pinterest.com/search/pins/?q=" + urllib.parse.quote(query), timeout=45000)
        pg.wait_for_timeout(2500)
        for _ in range(scrolls):
            pg.mouse.wheel(0, 2500)
            pg.wait_for_timeout(1200)
        items = pg.eval_on_selector_all(
            "a[href*='/pin/'] img", "els => els.map(e => [e.src, e.alt, e.closest('a').href])")
        b.close()
    out = []
    for src, alt, href in items:
        if "i.pinimg.com" not in (src or ""):
            continue
        m = re.search(r"/pin/(\d+)", href or "")
        out.append({"id": m.group(1) if m else key_of(src), "url": _upgrade(src), "fallback": src, "w": 0, "h": 0,
                    "title": alt or "", "desc": "", "saves": 0, "promoted": False, "video": False, "pinner": "",
                    "link": ""})
    return out


def key_of(url):
    return url.rsplit("/", 1)[-1].split(".")[0]


def meta_score(c):
    s = math.log1p(c["saves"]) * 1.5
    if c["w"] and c["h"]:
        ar = c["h"] / c["w"]
        s += 3 if 1.2 <= ar <= 2.0 else (1 if ar >= 0.9 else -2)
        s += 1.5 if c["w"] >= 1000 else (0 if c["w"] >= 600 else -4)
    return s


def image_score(im):
    """Ästhetik-Heuristik: Kontrast + Farbigkeit + Schärfe, Strafe für flache/fast leere Bilder."""
    a = np.asarray(im.convert("RGB").resize((256, int(256 * im.height / im.width))), np.float32) / 255
    lum = a @ np.array([.299, .587, .114], np.float32)
    contrast = float(np.percentile(lum, 95) - np.percentile(lum, 5))
    rg, yb = a[..., 0] - a[..., 1], 0.5 * (a[..., 0] + a[..., 1]) - a[..., 2]
    colorful = float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))
    lap = lum[1:-1, 1:-1] * 4 - lum[:-2, 1:-1] - lum[2:, 1:-1] - lum[1:-1, :-2] - lum[1:-1, 2:]
    sharp = float(lap.var() * 1000)
    if contrast < 0.15:
        return -10.0
    return contrast * 6 + colorful * 8 + min(sharp, 4) * 0.8


def ahash(im):
    g = np.asarray(im.convert("L").resize((12, 12)), np.float32)
    return (g > g.mean()).flatten()


class PinterestSource:
    def __init__(self, enabled, work, per_slot=4):
        self.enabled = enabled
        self.dir = os.path.join(work, "pinterest")
        self.per_slot = per_slot
        self.used_ids = set()
        self.hashes = []
        self.cache = {}
        self.dead = False
        self.method = None
        if enabled:
            os.makedirs(self.dir, exist_ok=True)

    def _search(self, query):
        if query in self.cache:
            return self.cache[query]
        res, errs = [], []
        for name, fn in (("json", search_json), ("html", search_html), ("browser", search_browser)):
            try:
                res = fn(query)
                if res:
                    self.method = self.method or name
                    break
            except Exception as e:
                errs.append(f"{name}: {type(e).__name__}: {str(e)[:120]}")
        if not res:
            log(f"Pinterest '{query}': keine Treffer ({' | '.join(errs)})")
            if errs and all("403" in e or "URLError" in e or "Tunnel" in e or "ENOTFOUND" in e or "Executable" in e
                            or "ModuleNotFoundError" in e for e in errs):
                self.dead = True
                warn("Pinterest nicht erreichbar (Netzwerk/Proxy) – nutze andere Quellen. "
                     "Freischalten: www.pinterest.com und i.pinimg.com erlauben.")
        self.cache[query] = res
        return res

    def _download(self, c, path):
        for u in (c["url"], c.get("fallback")):
            if not u:
                continue
            try:
                raw = _get(u, {"Referer": "https://www.pinterest.com/"}, timeout=30)
                with open(path, "wb") as fh:
                    fh.write(raw)
                im = Image.open(path)
                im.load()
                return im.convert("RGB")
            except Exception:
                continue
        return None

    def fetch(self, slot, dest):
        if not self.enabled or self.dead:
            return None
        queries = [f"{slot['q']} aesthetic", slot["q_style"], slot["q"]]
        cands = []
        for q in queries:
            for c in self._search(q):
                if c["id"] in self.used_ids or c["promoted"] or c["video"]:
                    continue
                if BAD_WORDS.search(c["title"] + " " + c["desc"]):
                    continue
                if c["w"] and c["w"] < 500:
                    continue
                c["query"] = q
                cands.append(c)
            if self.dead or len(cands) >= self.per_slot * 2:
                break
        if not cands:
            return None
        cands.sort(key=meta_score, reverse=True)
        scored = []
        base = os.path.splitext(dest)[0]
        for k, c in enumerate(cands[: self.per_slot * 2]):
            if len(scored) >= self.per_slot:
                break
            im = self._download(c, f"{base}_pin{k}.img")
            if im is None or min(im.size) < 400:
                continue
            h = ahash(im)
            if any((h != o).mean() < 0.12 for o in self.hashes):
                continue  # Duplikat eines bereits genutzten Bildes
            scored.append((meta_score(c) + image_score(im), c, im, h))
        if not scored:
            return None
        scored.sort(key=lambda x: x[0], reverse=True)
        self._contact_sheet(scored, base + "_kandidaten.jpg", slot)
        score, c, im, h = scored[0]
        im.save(dest, quality=93)
        self.used_ids.add(c["id"])
        self.hashes.append(h)
        pin = f"https://www.pinterest.com/pin/{c['id']}/" if c["id"].isdigit() else c["url"]
        return dest, {"status": "yellow", "method": "pinterest",
                      "license": "Pinterest-Pin – Rechte beim Urheber (nicht geprüft)",
                      "source": pin, "author": c.get("pinner", ""), "title": c.get("title", ""),
                      "original": c.get("link", ""), "image_url": c["url"], "score": round(score, 2),
                      "attribution": f"{c.get('title') or 'Pin'} – {pin}"}

    def _contact_sheet(self, scored, path, slot):
        tw, th = 240, 400
        sheet = Image.new("RGB", (tw * len(scored), th + 40), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        for i, (s, c, im, _) in enumerate(scored):
            t = im.copy()
            t.thumbnail((tw, th))
            sheet.paste(t, (i * tw + (tw - t.width) // 2, (th - t.height) // 2))
            d.text((i * tw + 6, th + 6), f"#{i} score {s:.1f} saves {c['saves']}", fill=(230, 230, 230))
            d.text((i * tw + 6, th + 22), c["id"][:30], fill=(160, 160, 160))
        sheet.save(path, quality=85)
