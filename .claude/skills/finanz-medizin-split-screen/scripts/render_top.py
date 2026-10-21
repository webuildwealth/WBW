#!/usr/bin/env python3
"""Rendert die obere Bildhälfte (Visualisierung + Untertitel) aus einem Storyboard-JSON.

  render_top.py storyboard.json --out top.mp4            # ganzes Video (30 fps, H.264, ohne Ton)
  render_top.py storyboard.json --stills 0.5,3,7 --out-dir previews/   # nur Einzelbilder (schnell)

Technik: Chromium (Playwright) lädt templates/engine.html, ruft FM.seek(t) je Frame auf, Screenshot -> ffmpeg.
"""
import argparse, json, os, subprocess, sys, shutil, pathlib

SKILL = pathlib.Path(__file__).resolve().parent.parent
CHROMIUM_CANDIDATES = [os.environ.get("FM_CHROMIUM", ""), "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]


def resolve_assets(sb, base):
    """Relative Bildpfade im Storyboard -> file:// URLs."""
    for sc in sb.get("scenes", []):
        p = sc.get("props", sc)
        src = p.get("src")
        if src and not src.startswith(("http", "file:", "data:")):
            ap = (base / src).resolve()
            if not ap.exists():
                sys.exit(f"Bild nicht gefunden: {ap}")
            p["src"] = ap.as_uri()
    return sb


def launch(pw):
    for c in CHROMIUM_CANDIDATES:
        if c and os.path.exists(c):
            return pw.chromium.launch(executable_path=c, args=["--force-device-scale-factor=1", "--font-render-hinting=none"])
    return pw.chromium.launch(args=["--force-device-scale-factor=1"])  # Playwright-eigener Browser


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard")
    ap.add_argument("--out", default="top.mp4")
    ap.add_argument("--stills", help="Komma-getrennte Zeitpunkte (s) für Vorschau-PNGs")
    ap.add_argument("--out-dir", default="previews")
    ap.add_argument("--fps", type=int)
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--png", action="store_true", help="PNG statt JPEG zwischen Browser und ffmpeg (langsamer, verlustfrei)")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright
    sbp = pathlib.Path(a.storyboard).resolve()
    sb = resolve_assets(json.loads(sbp.read_text(encoding="utf-8")), sbp.parent)
    meta = sb.setdefault("meta", {})
    if "duration" not in meta:
        meta["duration"] = max(s["end"] for s in sb["scenes"])
    fps = a.fps or meta.get("fps", 30)
    H = meta.get("panel_height", 960)
    dur = meta["duration"]

    with sync_playwright() as pw:
        br = launch(pw)
        pg = br.new_page(viewport={"width": 1080, "height": H}, device_scale_factor=1)
        pg.on("console", lambda m: print("[browser]", m.text) if m.type in ("error", "warning") else None)
        pg.goto((SKILL / "templates" / "engine.html").as_uri())
        pg.wait_for_load_state("load")
        pg.evaluate("document.fonts.ready")
        pg.evaluate("sb => FM.init(sb)", sb)
        pg.wait_for_timeout(300)

        if a.stills:
            os.makedirs(a.out_dir, exist_ok=True)
            for t in [float(x) for x in a.stills.split(",")]:
                pg.evaluate("t => FM.seek(t)", t)
                pg.wait_for_timeout(50)
                err = pg.evaluate("() => { const e = document.querySelector('.fm-error'); return e ? e.textContent : '' }")
                if err:
                    sys.exit(f"Render-Fehler bei t={t}: {err}")
                f = os.path.join(a.out_dir, f"t_{t:06.2f}.png")
                pg.screenshot(path=f)
                print(f)
            br.close()
            return

        n = int(round(dur * fps))
        codec = "png" if a.png else "mjpeg"
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-framerate", str(fps), "-c:v", codec, "-i", "-",
               "-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-pix_fmt", "yuv420p", "-r", str(fps), "-movflags", "+faststart", a.out]
        ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for i in range(n):
            pg.evaluate("t => FM.seek(t)", i / fps)
            if i % 15 == 0:
                err = pg.evaluate("() => { const e = document.querySelector('.fm-error'); return e ? e.textContent : '' }")
                if err:
                    ff.kill(); sys.exit(f"Render-Fehler bei t={i / fps:.2f}: {err}")
            img = pg.screenshot(type="png") if a.png else pg.screenshot(type="jpeg", quality=95)
            ff.stdin.write(img)
            if i % 60 == 0:
                print(f"\rFrame {i}/{n}", end="", flush=True)
        ff.stdin.close()
        ff.wait()
        br.close()
        print(f"\nfertig: {a.out} ({n} Frames, {dur:.2f}s)")
        if ff.returncode:
            sys.exit(ff.returncode)


if __name__ == "__main__":
    main()
