#!/usr/bin/env python3
"""Regressionstest der Inhaltserkennung/Planung ohne Video: synthetisches Transkript + synthetische Bildanalyse.
   python3 test_planner.py   -> druckt Plan und prueft Mindest-Erwartungen (Exit 1 bei Fehlschlag)."""
import sys, numpy as np
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import planner as P
TXT = ("Drei Fehler, die Ärzte bei der Altersvorsorge machen. "
       "Fehler Nummer 1: Du verlässt dich nur auf das Versorgungswerk. "
       "Viele glauben, das reicht im Alter, aber das stimmt nicht. "
       "Bei 2 Prozent Inflation sind 100 Euro nach 20 Jahren nur noch 67 Euro wert. "
       "Fehler Nummer 2: Du ignorierst die Kosten deiner Verträge. "
       "Ein Prozent Kosten im Jahr klingt wenig, kostet dich aber 34.000 Euro über 30 Jahre. "
       "ETF oder Rentenversicherung, das ist der Unterschied. "
       "Fehler Nummer 3: Du schließt die Berufsunfähigkeitsversicherung zu spät ab. "
       "Mein Tipp: Prüfe deinen Schutz, solange du gesund bist. "
       "Das ist wirklich unglaublich wichtig. "
       "Folg mir für mehr und speicher dir das Video.")
def run(txt=TXT, face=(360, 560, 360, 460), **opts):
    ws, t = [], 0.2
    for w in txt.split():
        d = 0.12 + 0.045 * len(w); ws.append({"w": w, "t0": round(t, 2), "t1": round(t + d, 2)}); t += d + (0.35 if w[-1] in ".:" else 0.06)
    dur = t + 0.5; n = int(dur * 5) + 1; mask = np.zeros((n, 48, 27), np.uint8); mask[:, 16:48, 7:20] = 1
    ana = {"fps": 5, "grid": 40, "t": [i / 5 for i in range(n)], "face": [list(face)] * n, "mask": mask}
    p = P.plan(ws, ana, dur, {"zoom": "subtle", **opts}); return P.place(p, ana, P.zoom_fn(p["zooms"], ana))
if __name__ == "__main__":
    p = run(); print(p["notes"])
    for o in p["overlays"]:
        d = o["data"]; s = d.get("title") or d.get("text") or d.get("claim") or (f'{d.get("v"):g} {d.get("unit")} | {d.get("label")}' if "v" in d else None) or (" / ".join(b["label"] for b in d["bars"]) if "bars" in d else "") or (f'{d.get("a")} vs {d.get("b")}' if "a" in d else d.get("motif", ""))
        print(f'{o["t0"]:5.1f}-{o["t1"]:5.1f} {o["type"]:8s} {o["layer"]:5s} box={o["box"]["x"]},{o["box"]["y"]} s={o["box"]["s"]} | {s}')
    types = [o["type"] for o in p["overlays"]]; fails = []
    for need in ("hook", "title", "error", "myth", "bars", "number", "vs", "tip", "cta", "wipe"):
        if need not in types: fails.append(f"fehlt: {need}")
    for o in p["overlays"]:
        f = o["face"]; b = o["box"]
        if o["layer"] == "front" and o["type"] != "wipe" and not (b["x"] + b["w"] < f[0] or b["x"] > f[2] or b["y"] + b["h"] < f[1] or b["y"] > f[3]): fails.append(f"{o['id']} verdeckt Gesicht")
    ev = sorted(o["t0"] for o in p["overlays"]) + [z["t"] for z in p["zooms"]]; ev = sorted(e for e in ev if e >= p["hook_t1"] - 0.01)
    gaps = [round(b - a, 1) for a, b in zip(ev, ev[1:]) if b - a > 3.6]
    if gaps: fails.append(f"Luecken ohne Bildwechsel: {gaps}")
    layers = [o["layer"] for o in sorted(p["overlays"], key=lambda o: o["t0"]) if o["type"] not in ("hook", "title", "wipe")]
    print("Ebenenfolge:", " ".join("H" if l == "back" else "V" for l in layers))
    print("OK" if not fails else "FEHLER: " + "; ".join(fails)); sys.exit(1 if fails else 0)
