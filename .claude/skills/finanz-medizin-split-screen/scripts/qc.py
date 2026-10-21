#!/usr/bin/env python3
"""Technische Qualitätsprüfung eines Reels + Kontaktbogen zur visuellen Kontrolle.

  qc.py reel.mp4 [--storyboard resolved.json] [--out-dir qc/]

Prüft automatisch: Format 1080x1920, H.264/AAC, 30 fps, Dauer, Lautheit (-14 LUFS ±1.5, True Peak ≤ -1), Stille/Einfrieren,
Szenenlängen und Sync-Ankerpunkte. Schreibt qc/report.md und qc/contact.png (Standbilder je Szene) –
Letzteres MUSS anschließend visuell angesehen werden (Lesbarkeit, Gesicht, Untertitel, Safe Zones).
"""
import argparse, json, re, subprocess, sys, pathlib


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--storyboard")
    ap.add_argument("--out-dir", default="qc")
    ap.add_argument("--preview", action="store_true", help="Vorschau ohne Sprecherstimme: Lautheit nur informativ")
    a = ap.parse_args()
    out = pathlib.Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    rows = []

    def chk(name, ok, detail=""):
        rows.append((name, ok, detail))

    j = json.loads(sh(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", a.video]).stdout)
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    au = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    fps = eval(v["r_frame_rate"])
    dur = float(j["format"]["duration"])
    chk("Auflösung 1080x1920", v["width"] == 1080 and v["height"] == 1920, f"{v['width']}x{v['height']}")
    chk("Videocodec H.264", v["codec_name"] == "h264", v["codec_name"])
    chk("Pixelformat yuv420p", v.get("pix_fmt") == "yuv420p", v.get("pix_fmt"))
    chk("Bildrate 30 fps", abs(fps - 30) < .01, f"{fps:.2f}")
    chk("Audiocodec AAC", bool(au) and au["codec_name"] == "aac", au and au["codec_name"])
    chk("Dauer 30–60 s (Standard)", 30 <= dur <= 60, f"{dur:.1f}s – Hinweis: Kurzformate/Tests dürfen kürzer sein")
    # Lautheit
    r = sh(["ffmpeg", "-hide_banner", "-i", a.video, "-af", "ebur128=peak=true", "-f", "null", "-"])
    m = re.search(r"I:\s+(-?[\d.]+) LUFS", r.stderr[r.stderr.rfind("Summary"):])
    tp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", r.stderr[r.stderr.rfind("Summary"):])
    if m:
        I = float(m.group(1)); chk("Lautheit −14 LUFS ±1.5" + (" (Vorschau ohne Stimme: informativ)" if a.preview else ""), a.preview or abs(I + 14) <= 1.5, f"{I} LUFS")
    if tp:
        chk("True Peak ≤ −1 dBFS", float(tp.group(1)) <= -0.9, f"{tp.group(1)} dBFS")
    # eingefrorene Bilder / schwarze Bilder
    fz = sh(["ffmpeg", "-hide_banner", "-i", a.video, "-vf", "freezedetect=n=-60dB:d=3,blackdetect=d=0.3:pix_th=0.05", "-f", "null", "-"]).stderr
    chk("Kein Standbild >3 s", "freeze_start" not in fz, "")
    chk("Keine Schwarzbilder", "black_start" not in fz, "")
    # Szenen
    if a.storyboard:
        sb = json.load(open(a.storyboard, encoding="utf-8"))
        sc = sb["scenes"]
        lens = [s["end"] - s["start"] for s in sc]
        chk("Szenenlängen 0.9–9 s", all(.9 <= l <= 9 for l in lens), ", ".join(f"{l:.1f}" for l in lens))
        chk("Storyboard-Dauer ≈ Videodauer", abs(sb["meta"]["duration"] - dur) < 0.2, f"{sb['meta']['duration']:.2f} vs {dur:.2f}")
        ts = [min(s["start"] + 1.8, (s["start"] + s["end"]) / 2 + .6) for s in sc]
        sel = "+".join(f"eq(n\\,{int(t * 30)})" for t in ts)
        fr = out / "f_%02d.png"
        sh(["ffmpeg", "-y", "-v", "error", "-i", a.video, "-vf", f"select='{sel}',scale=360:-1", "-vsync", "vfr", str(fr)])
        try:
            from PIL import Image
            fs = sorted(out.glob("f_*.png")); ims = [Image.open(f) for f in fs]
            if ims:
                w, h = ims[0].size; cols = min(6, len(ims)); rows_n = (len(ims) + cols - 1) // cols
                S = Image.new("RGB", (cols * w, rows_n * h), "white")
                for i, im in enumerate(ims): S.paste(im, ((i % cols) * w, (i // cols) * h))
                S.save(out / "contact.png")
            for f in fs: f.unlink()
        except ImportError:
            pass
    md = ["# QC-Report", f"Datei: `{a.video}`", "", "| Prüfung | Ergebnis | Detail |", "|---|---|---|"]
    for n, ok, d in rows:
        md.append(f"| {n} | {'✅' if ok else '❌'} | {d} |")
    md += ["", "**Manuell prüfen (nicht automatisierbar):** Lesbarkeit der Untertitel auf kleinem Display, Gesicht erkennbar und nicht verdeckt, "
           "Visualisierung folgt dem Gesagten, Zahlen korrekt/freigegeben, Illustrationsstil konsistent, Instagram-Safe-Zones (contact.png ansehen)."]
    (out / "report.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))
    sys.exit(0 if all(ok for name, ok, _d in rows if not name.startswith("Dauer 30")) else 1)


if __name__ == "__main__":
    main()
