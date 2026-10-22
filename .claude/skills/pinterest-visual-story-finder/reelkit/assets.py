"""Schritt 5-7: Bilder für jede Collage-Zelle beschaffen und Rechte protokollieren.

Reihenfolge pro Bildplatz (erste erfolgreiche Quelle gewinnt):
  0. Pinterest (--pinterest): ästhetische Pins suchen, bewerten, herunterladen (reelkit/pinterest.py)
  1. Eigene Assets   --assets ORDNER  (optional assets.json mit Lizenzangaben, sonst Dateiname = Schlagwörter)
  2. Lizenzierte Online-Quellen (--online): Openverse (nur kommerziell nutzbare CC-Lizenzen) und
     Wikimedia Commons (nur CC0/Public Domain/CC BY/CC BY-SA). Attribution wird protokolliert.
  3. Externer Bildgenerator (--image-gen-cmd "befehl {prompt} {out}"), z. B. eigenes Skript für eine Bild-KI.
  4. Offline-Generator reelkit/art.py (immer verfügbar, selbst erzeugt, rechtefrei).
Pinterest-Bilder gehören ihren Urhebern; Pin-Link und Pinner werden im Rechte-Protokoll festgehalten.
"""
import json
import os
import re
import shlex
import subprocess
import urllib.parse
import urllib.request

from PIL import Image

from . import art
from .pinterest import PinterestSource
from .concepts import STYLE_QUERY_SUFFIX
from .util import log, warn

IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")
UA = "reelkit/1.0 (Instagram reel pipeline; contact: local user)"
CELL_ANCHOR = {0: (0.44, 0.42), 1: (0.56, 0.42), 2: (0.44, 0.64), 3: (0.56, 0.64)}
OK_LICENSE = re.compile(r"^(cc0|pdm|public domain|pd\b|cc[- ]?by(-sa)?\b|by(-sa)?$|cc by(-sa)? [\d.]+)", re.I)
STATUS = {"green": "🟢", "yellow": "🟡", "red": "🔴"}


def _tokens(s):
    return {t for t in re.split(r"[^a-zäöüß0-9]+", s.lower()) if len(t) > 2}


def _rights_status(lic):
    l = (lic or "").lower()
    if lic and OK_LICENSE.match(lic) or l in ("own", "eigen", "licensed", "lizenziert", "generated"):
        return "green"
    if l in ("pinterest", "unknown", "unbekannt", "ungeklärt"):
        return "red"
    return "yellow"


class UserAssets:
    def __init__(self, folder, allow_unlicensed=False):
        self.items = []
        self.allow_red = allow_unlicensed
        if not folder:
            return
        if not os.path.isdir(folder):
            warn(f"Asset-Ordner nicht gefunden: {folder}")
            return
        meta = {}
        mj = os.path.join(folder, "assets.json")
        if os.path.exists(mj):
            with open(mj, encoding="utf-8") as fh:
                for e in json.load(fh):
                    meta[e["file"]] = e
        for root, _, files in os.walk(folder):
            for f in sorted(files):
                if not f.lower().endswith(IMG_EXT):
                    continue
                rel = os.path.relpath(os.path.join(root, f), folder)
                m = meta.get(rel, meta.get(f, {}))
                tags = _tokens(os.path.splitext(f)[0]) | {t.lower() for t in m.get("tags", [])}
                lic = m.get("license")
                st = _rights_status(lic) if lic else "yellow"
                if st == "red" and not allow_unlicensed:
                    warn(f"Asset ausgeschlossen (Rechte ungeklärt, Lizenz '{lic}'): {rel} – "
                         "nur mit --allow-unlicensed für private Entwürfe nutzbar.")
                    continue
                self.items.append({"path": os.path.join(root, f), "tags": tags, "license": lic, "status": st,
                                   "source": m.get("source", "eigenes Asset"), "author": m.get("author", ""),
                                   "uses": []})
        log(f"Eigene Assets: {len(self.items)} nutzbare Bilder in {folder}")

    def match(self, slot):
        want = set()
        for t in slot["tags"] + [slot["art"], slot["concept"]]:
            want |= _tokens(t)
        best, score = None, 0
        for it in self.items:
            # nie dasselbe Bild gleichzeitig in zwei Zellen
            if any(s < slot["end"] and slot["start"] < e for s, e in it["uses"]):
                continue
            sc = len(want & it["tags"]) * 10 - len(it["uses"]) * 4
            if sc > score:
                best, score = it, sc
        if not best or score <= 0:
            return None
        best["uses"].append((slot["start"], slot["end"]))
        lic = best["license"]
        return best["path"], {"status": best["status"], "license": lic or "vom Nutzer bereitgestellt, Lizenz nicht angegeben",
                              "source": best["source"], "author": best["author"], "method": "user-asset"}


def _get_json(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _download(url, path, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r, open(path, "wb") as fh:
        fh.write(r.read())
    with Image.open(path) as im:
        im = im.convert("RGB")
        if min(im.size) < 500:
            raise ValueError(f"Auflösung zu klein {im.size}")
        im.save(path, quality=92)
    return path


class OnlineSources:
    """Openverse + Wikimedia Commons. Nur Lizenzen mit kommerzieller Nutzung."""

    def __init__(self, enabled):
        self.enabled = enabled
        self.alive = {}
        self.used_urls = set()

    def _check(self, name, url):
        if name not in self.alive:
            try:
                _get_json(url, timeout=6)
                self.alive[name] = True
            except Exception as e:
                self.alive[name] = False
                warn(f"Online-Quelle {name} nicht erreichbar ({type(e).__name__}) – nutze Fallbacks.")
        return self.alive[name]

    def openverse(self, query):
        q = urllib.parse.quote(query)
        url = (f"https://api.openverse.org/v1/images/?q={q}&license_type=commercial&page_size=20"
               f"&mature=false&aspect_ratio=tall,square")
        if not self._check("openverse", "https://api.openverse.org/v1/images/?q=test&page_size=1"):
            return []
        try:
            res = _get_json(url).get("results", [])
        except Exception:
            return []
        out = []
        for r in res:
            if (r.get("height") or 0) < 900 and (r.get("width") or 0) < 700:
                continue
            lic = f"CC {r.get('license', '').upper()} {r.get('license_version', '')}".strip()
            out.append({"url": r["url"], "license": lic, "author": r.get("creator") or "",
                        "source": r.get("foreground_landing_url") or r.get("url"),
                        "attribution": r.get("attribution", ""), "title": r.get("title", "")})
        return out

    def wikimedia(self, query):
        if not self._check("wikimedia", "https://commons.wikimedia.org/w/api.php?action=query&format=json&meta=siteinfo"):
            return []
        params = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
                  "gsrsearch": f"filetype:bitmap {query}", "gsrlimit": "20", "prop": "imageinfo",
                  "iiprop": "url|size|extmetadata", "iiurlwidth": "1280"}
        try:
            pages = _get_json("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params))
        except Exception:
            return []
        out = []
        for p in (pages.get("query", {}).get("pages", {}) or {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata", {})
            lic = (em.get("LicenseShortName", {}) or {}).get("value", "")
            if not OK_LICENSE.match(lic or ""):
                continue
            if max(ii.get("width", 0), ii.get("height", 0)) < 900:
                continue
            artist = re.sub(r"<[^>]+>", "", (em.get("Artist", {}) or {}).get("value", "")).strip()
            out.append({"url": ii.get("thumburl") or ii.get("url"), "license": lic, "author": artist,
                        "source": ii.get("descriptionurl", ""), "title": p.get("title", "")})
        return out

    def fetch(self, slot, dest):
        if not self.enabled:
            return None
        for name, fn in (("openverse", self.openverse), ("wikimedia", self.wikimedia)):
            for q in (slot["q_style"], slot["q"]):
                for cand in fn(q):
                    if cand["url"] in self.used_urls:
                        continue
                    try:
                        _download(cand["url"], dest)
                    except Exception:
                        continue
                    self.used_urls.add(cand["url"])
                    return dest, {"status": "green", "license": cand["license"], "source": cand["source"],
                                  "author": cand["author"], "method": name, "title": cand.get("title", ""),
                                  "attribution": cand.get("attribution") or f"{cand.get('title', '')} – {cand['author']} ({cand['license']})"}
        return None


def external_generate(cmd_tpl, slot, dest):
    if not cmd_tpl:
        return None
    prompt = (f"{slot['q']}, {STYLE_QUERY_SUFFIX.get(slot['style'], '')}, vertical 9:16, cinematic, "
              f"textured, film grain, no text, no watermark")
    cmd = cmd_tpl.format(prompt=shlex.quote(prompt), out=shlex.quote(dest), style=shlex.quote(slot["style"]))
    try:
        subprocess.run(cmd, shell=True, check=True, timeout=600, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        Image.open(dest).verify()
        return dest, {"status": "yellow", "license": "KI-generiert (Nutzungsbedingungen des Generators prüfen)",
                      "source": "image-gen-cmd", "author": "", "method": "ai-generated", "prompt": prompt}
    except Exception as e:
        warn(f"Bildgenerator fehlgeschlagen ({type(e).__name__}) – nutze Offline-Generator.")
        return None


def resolve_assets(edl, work, assets_dir=None, online=False, gen_cmd=None, force=False, allow_unlicensed=False,
                   pinterest=False):
    os.makedirs(os.path.join(work, "assets"), exist_ok=True)
    user = UserAssets(assets_dir, allow_unlicensed or pinterest)
    pins = PinterestSource(pinterest, work)
    net = OnlineSources(online)
    ledger = []
    counts = {}
    for cell, track in enumerate(edl["tracks"]):
        for i, slot in enumerate(track):
            upgrade = pinterest and slot.get("rights", {}).get("method") == "procedural" and not pins.dead
            if slot.get("asset") and os.path.exists(slot["asset"]) and not force and not upgrade:
                ledger.append(dict(slot.get("rights", {}), cell=cell, file=slot["asset"], start=slot["start"],
                                   query=slot["q"]))
                counts["cache"] = counts.get("cache", 0) + 1
                continue
            dest = os.path.join(work, "assets", f"c{cell}_{i:02d}_{slot['art']}_{slot['style']}.jpg")
            res = (user.match(slot) or pins.fetch(slot, dest) or net.fetch(slot, dest)
                   or external_generate(gen_cmd, slot, dest))
            if res is None:
                art.generate(slot["art"], slot["style"], dest, seed=cell * 100 + i, anchor=CELL_ANCHOR[cell])
                res = dest, {"status": "green", "license": "selbst generiert (reelkit/art.py)", "source": "offline",
                             "author": "", "method": "procedural"}
            slot["asset"], slot["rights"] = res
            counts[res[1]["method"]] = counts.get(res[1]["method"], 0) + 1
            ledger.append(dict(res[1], cell=cell, file=res[0], start=slot["start"], query=slot["q"]))
    log("Bildquellen: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    if ledger and all(l.get("method") == "procedural" for l in ledger):
        warn("Alle Bilder stammen aus dem Offline-Generator. Für den Referenz-Look echte Fotos/Gemälde über "
             "--assets oder --online ergänzen.")
    reds = [l for l in ledger if l.get("status") == "red"]
    if reds:
        warn(f"{len(reds)} Bild(er) mit ungeklärten Rechten (🔴) im Reel – vor Veröffentlichung ersetzen.")
    return ledger
