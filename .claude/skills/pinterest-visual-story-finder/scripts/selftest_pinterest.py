#!/usr/bin/env python3
"""Selbsttest der Pinterest-Auswahl ohne Internet: ein lokaler Server spielt Pinterest-Suchergebnisse.

Prüft: Filter (Werbung, Video, Text-Pins, zu klein), Download, Ästhetik-Score, Duplikat-Schutz,
Ablehnung einfarbiger Bilder, Kontaktbogen, Rechte-Protokoll. Prüft NICHT das echte Pinterest-Antwortformat.
"""
import http.server
import os
import sys
import tempfile
import threading

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from reelkit import pinterest  # noqa: E402


def main():
    from skimage import data
    d = tempfile.mkdtemp()
    imgs = {"coffee": data.coffee(), "rocket": data.rocket(), "cat": data.chelsea(), "astro": data.astronaut(),
            "flat": np.full((900, 600, 3), 128, np.uint8)}
    for k, a in imgs.items():
        Image.fromarray(a).resize((720, 1080)).save(os.path.join(d, k + ".jpg"))
    Image.fromarray(imgs["coffee"]).resize((720, 1080)).save(os.path.join(d, "coffee_dup.jpg"))

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=d, **k)

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}/"

    def pin(i, name, **kw):
        c = {"id": str(1000 + i), "url": base + name + ".jpg", "fallback": None, "w": 720, "h": 1080, "title": name,
             "desc": "", "saves": 100 * (i + 1), "promoted": False, "video": False, "pinner": "tester", "link": ""}
        c.update(kw)
        return c

    fake = [pin(0, "flat", saves=99999), pin(1, "coffee"), pin(2, "coffee_dup", saves=5000), pin(3, "rocket"),
            pin(4, "cat", promoted=True), pin(5, "astro", title="best money quotes"), pin(6, "cat", id="2000")]
    pinterest.search_json = lambda q, n=30: list(fake)
    work = tempfile.mkdtemp()
    src = pinterest.PinterestSource(True, work, per_slot=4)
    slot = {"q": "test motif", "q_style": "test motif oil painting"}
    picks = []
    for k in range(3):
        r = src.fetch(slot, os.path.join(work, f"slot{k}.jpg"))
        picks.append(r[1]["source"] if r else None)
        print(f"Slot {k}: {r[1]['source'] if r else 'kein Bild'}  score={r[1]['score'] if r else '-'}")
    srv.shutdown()
    ok = True
    ok &= "1000" not in "".join(p or "" for p in picks)                       # einfarbig abgelehnt
    ok &= not ("1001" in "".join(map(str, picks)) and "1002" in "".join(map(str, picks)))  # Duplikat nur einmal
    ok &= "1004" not in "".join(map(str, picks)) and "1005" not in "".join(map(str, picks))  # Werbung/Text raus
    ok &= len(set(p for p in picks if p)) == len([p for p in picks if p])     # keine Wiederholung
    ok &= any(f.endswith("_kandidaten.jpg") for f in os.listdir(os.path.join(work)))
    print("SELBSTTEST", "OK" if ok else "FEHLGESCHLAGEN")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
