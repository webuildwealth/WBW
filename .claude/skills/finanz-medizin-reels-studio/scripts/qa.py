#!/usr/bin/env python3
"""Qualitaetskontrolle: Technik, Lautheit, Schnitt-/Caption-Regeln, Layout-Safe-Zones. Schreibt qa-report.md/.json.
   python3 qa.py reel.mp4 --timeline timeline.json --out ./out/x"""
import argparse, json, re, subprocess, sys
import numpy as np
from pathlib import Path
HERE = Path(__file__).resolve().parent; SKILL = HERE.parent

def sh(cmd): return subprocess.run(cmd, capture_output=True, text=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--timeline"); ap.add_argument("--out", default="."); ap.add_argument("--th-plan"); ap.add_argument("--track"); a = ap.parse_args()
    out = Path(a.out); R = []  # (status, check, detail)
    ok = lambda c, d: R.append(("OK", c, d)); warn = lambda c, d: R.append(("WARN", c, d)); fail = lambda c, d: R.append(("FAIL", c, d))
    pr = json.loads(sh(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", a.video]).stdout)
    v = next(s for s in pr["streams"] if s["codec_type"] == "video"); au = next((s for s in pr["streams"] if s["codec_type"] == "audio"), None); dur = float(pr["format"]["duration"])
    (ok if (v["width"], v["height"]) == (1080, 1920) else fail)("Format 9:16 / 1080x1920", f"{v['width']}x{v['height']}")
    (ok if v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p" else fail)("Video-Codec H.264 / yuv420p", f"{v['codec_name']} {v['pix_fmt']}")
    num, den = map(int, v["r_frame_rate"].split("/")); fps = num / den
    (ok if abs(fps - 30) < 0.01 else warn)("Framerate 30 fps", f"{fps:.2f}")
    (ok if au and au["codec_name"] == "aac" else fail)("Audio AAC", au["codec_name"] if au else "keine Tonspur")
    (ok if 20 <= dur <= 60 else warn)("Laenge 20-60 s", f"{dur:.1f} s")
    size = float(pr["format"]["size"]) / 1e6; (ok if size < 100 else warn)("Dateigroesse", f"{size:.1f} MB")
    # Lautheit
    r = sh(["ffmpeg", "-hide_banner", "-i", a.video, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr; seg = r[r.rfind("Summary"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", seg).group(1)); TP = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", seg).group(1))
    (ok if -15.5 <= I <= -12.5 else warn)("Lautheit ~ -14 LUFS", f"{I} LUFS"); (ok if TP <= -1.0 else fail)("True Peak <= -1 dBTP", f"{TP} dBTP")
    # Schwarzbild / Standbild
    bl = sh(["ffmpeg", "-hide_banner", "-i", a.video, "-vf", "blackdetect=d=0.2:pix_th=0.06", "-an", "-f", "null", "-"]).stderr
    (ok if "black_start" not in bl else fail)("Keine Schwarzbilder", "ok" if "black_start" not in bl else re.findall(r"black_start:[\d.]+", bl)[:3])
    fz = sh(["ffmpeg", "-hide_banner", "-i", a.video, "-vf", "freezedetect=n=-60dB:d=1.2", "-an", "-f", "null", "-"]).stderr
    (ok if "freeze_start" not in fz else warn)("Kein Standbild > 1,2 s", "ok" if "freeze_start" not in fz else f"{fz.count('freeze_start')} Standbild-Phase(n)")
    if a.th_plan:   # Talking-Head-Pruefungen
        P = json.loads(Path(a.th_plan).read_text()); ov = P["overlays"]; caps = P["captions"]
        tr = [r for r in json.loads(Path(a.track).read_text()) if r[1] is not None] if a.track else []
        hits = []
        for o in ov:
            if o["layer"] != "front": continue
            b = o["box"]
            for t, x, y, w, h in tr:
                if o["t0"] <= t <= o["t1"] and not (b["x"] + b["w"] < x or b["x"] > x + w or b["y"] + b["h"] < y or b["y"] > y + h):
                    ix = min(b["x"] + b["w"], x + w) - max(b["x"], x); iy = min(b["y"] + b["h"], y + h) - max(b["y"], y)
                    if ix * iy > 0.04 * w * h: hits.append(f"{o['id']}@{t:.1f}s"); break
        (ok if not hits else fail)("Gesicht frei: kein Overlay vor dem Gesicht (gemessenes Tracking)", "ok" if not hits else ", ".join(hits[:5]))
        back = [o for o in ov if o["layer"] == "back"]; bad = [o["id"] for o in back if o.get("occluded", 0) > 0.45]
        (ok if not bad else warn)("Hintergrund-Elemente ausreichend sichtbar (<= 45 % verdeckt)", f"{len(back)} hinter der Person" + ("" if not bad else f", zu verdeckt: {bad}"))
        types = sorted({o["type"] for o in ov}); (ok if len(types) >= 3 else warn)("Visuelle Vielfalt (>= 3 Overlay-Typen)", ", ".join(types))
        content = [o for o in ov if o["type"] not in ("title", "hook")]; cov = np.zeros(int(dur * 10) + 1)
        for o in content: cov[int(o["t0"] * 10):int(o["t1"] * 10)] = 1
        (ok if 0.3 <= cov.mean() <= 0.9 else warn)("Abdeckung mit Inhalts-Overlays 30-90 %", f"{cov.mean() * 100:.0f} % der Laufzeit")
        same = [(x["type"]) for x, y in zip(content, content[1:]) if x["type"] == y["type"] and x.get("box") == y.get("box")]
        (ok if not same else warn)("Keine starren Wiederholungen (gleicher Typ an gleicher Stelle)", "ok" if not same else f"{len(same)}x: {same[:3]}")
        vo = out / "work" / "voice.wav"
        if vo.exists():
            sys.path.insert(0, str(HERE)); import align as al
            sr, x = al.load(vo); env = al.envelope(x, sr); thr = env.max() * 10 ** (-38 / 20)
            miss = [c["text"] for c in caps if env[int(c["t0"] * 100): max(int(c["t0"] * 100) + 1, int(c["t1"] * 100))].max(initial=0) < thr]
            (ok if not miss else fail)("Caption-Sync: Sprache im Caption-Fenster (ASR-Zeitstempel)", "ok" if not miss else f"{len(miss)} ohne Sprache: {miss[:4]}")
        ovl = [(c1["text"], c2["text"]) for c1, c2 in zip(caps, caps[1:]) if c2["t0"] < c1["t1"] - 1e-6]; (ok if not ovl else fail)("Captions ueberlappen nicht", "ok" if not ovl else str(ovl[:3]))
    if a.timeline:
        tl = json.loads(Path(a.timeline).read_text()); sc = tl["scenes"]; caps = tl["captions"]
        first = min((w["t0"] for w in sc[0]["words"]), default=0)
        (ok if first <= 1.0 else warn)("Hook: erstes Wort <= 1,0 s", f"{first:.2f} s"); (ok if sc[0]["dur"] <= 4.0 else warn)("Hook-Szene <= 4 s", f"{sc[0]['dur']:.1f} s")
        long = [s["id"] for s in sc[1:] if s["dur"] > 12]; (ok if not long else warn)("Szenen <= 12 s (visuelle Veraenderung)", "ok" if not long else f"zu lang: {long}")
        words = sum(len(s["words"]) for s in sc); wps = words / max(0.1, sum(s["dur"] for s in sc)); ok("Sprechtempo", f"{wps:.2f} Woerter/s ({wps * 60:.0f} WPM)")
        bad = [c["text"] for c in caps if (c["t1"] - c["t0"]) < 0.14 or len(c["text"].split()) > 2]; (ok if not bad else warn)("Captions: 1-2 Woerter, >= 0,14 s", "ok" if not bad else f"{len(bad)} auffaellig: {bad[:4]}")
        ov = [(a1["text"], b1["text"]) for a1, b1 in zip(caps, caps[1:]) if b1["t0"] < a1["t1"] - 1e-6]; (ok if not ov else fail)("Captions ueberlappen nicht", "ok" if not ov else str(ov[:3]))
        outs = [c["text"] for c in caps if not any(s["start"] - 0.01 <= c["t0"] < s["start"] + s["dur"] + 0.01 for s in sc)]; (ok if not outs else fail)("Captions innerhalb ihrer Szene", "ok" if not outs else str(outs[:3]))
        vo = out / "work" / "voiceover.wav"
        if vo.exists():   # Sync-Plausibilitaet: Sprachenergie muss in Caption-Fenstern liegen, kurz vor Caption-Start darf kaum Sprache des Vorworts-Ende liegen
            sys.path.insert(0, str(HERE)); import align as al
            sr, x = al.load(vo); env = al.envelope(x, sr); thr = env.max() * 10 ** (-38 / 20)
            miss = [c["text"] for c in caps if env[int(c["t0"] * 100): max(int(c["t0"] * 100) + 1, int(c["t1"] * 100))].max(initial=0) < thr]
            (ok if not miss else fail)("Caption-Sync: Sprache liegt im Caption-Fenster", "ok" if not miss else f"{len(miss)} Chunks ohne Sprache: {miss[:4]}")
            starts = [c["t0"] for c in caps]; lag = [float(env[max(0, int(t * 100) - 3): int(t * 100) + 8].max(initial=0)) / env.max() for t in starts]
            ok("Caption-Start trifft Sprache (Median Pegel am Einsatz)", f"{np.median(lag) * 100:.0f} % des Spitzenpegels")
        lay = out / "layout-check.json"; r = sh(["node", str(SKILL / "engine" / "render_frames.js"), "--timeline", a.timeline, "--layout-check", str(lay)])
        if lay.exists():
            for item in json.loads(lay.read_text()): (ok if not item["issues"] else warn)(f"Layout/Safe-Zone '{item['scene']}'", "ok" if not item["issues"] else "; ".join(item["issues"][:4]))
        else: warn("Layout-Check", "nicht ausgefuehrt: " + r.stderr[-200:])
    # Kontaktbogen
    sheet = out / "contactsheet.jpg"; sh(["ffmpeg", "-y", "-v", "error", "-i", a.video, "-vf", f"fps=1/{max(1, dur / 15):.2f},scale=216:-1,tile=15x1", "-frames:v", "1", str(sheet)])
    n = {k: sum(1 for x in R if x[0] == k) for k in ("OK", "WARN", "FAIL")}
    md = [f"# QA-Bericht\n\n**{n['OK']} OK · {n['WARN']} Warnungen · {n['FAIL']} Fehler**\n", "| Status | Pruefung | Ergebnis |", "|---|---|---|"] + [f"| {s} | {c} | {d} |" for s, c, d in R]
    md.append("\n*Nicht automatisch pruefbar (manuell abnehmen): fachliche Korrektheit der Zahlen, Stimme/Aussprache, Rechtstext, Markenwirkung. Siehe references/quality-checklist.md.*")
    (out / "qa-report.md").write_text("\n".join(md), encoding="utf-8"); (out / "qa-report.json").write_text(json.dumps([{"status": s, "check": c, "detail": d} for s, c, d in R], ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(md)); sys.exit(1 if n["FAIL"] else 0)
if __name__ == "__main__": main()
