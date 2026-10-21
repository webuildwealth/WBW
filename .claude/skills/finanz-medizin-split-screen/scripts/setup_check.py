#!/usr/bin/env python3
"""Prüft Voraussetzungen und sagt, was fehlt.   python3 scripts/setup_check.py"""
import importlib, os, shutil, subprocess, sys, pathlib
SKILL = pathlib.Path(__file__).resolve().parent.parent
ok_all = True


def row(name, ok, hint="", required=True):
    global ok_all
    print(f"{'✅' if ok else ('❌' if required else '⚠️ ')} {name}" + ("" if ok else f"  → {hint}"))
    if required and not ok:
        ok_all = False


ff = shutil.which("ffmpeg")
row("ffmpeg/ffprobe", bool(ff and shutil.which("ffprobe")), "ffmpeg installieren (≥ 5, mit libx264, aac, loudnorm, afftdn)")
if ff:
    enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    flt = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    row("  libx264 + aac", "libx264" in enc and " aac " in enc, "ffmpeg mit libx264/aac nötig")
    row("  loudnorm, afftdn, sidechaincompress", all(f in flt for f in ("loudnorm", "afftdn", "sidechaincompress")), "neuere ffmpeg-Version")
for m, hint, req in (("PIL", "pip install pillow", True), ("numpy", "pip install numpy", True), ("playwright", "pip install playwright", True),
                     ("faster_whisper", "pip install faster-whisper (Transkription; Modell-Download nötig) – sonst --words/--from-srt", False),
                     ("cv2", 'pip install "opencv-python-headless<5" (Gesichtserkennung) – sonst --face-x/--face-y', False)):
    try:
        mod = importlib.import_module(m)
        if m == "cv2" and not hasattr(mod, "CascadeClassifier"):
            row("cv2 (Haar-Cascade)", False, 'OpenCV 5 hat keine Cascades: pip install "opencv-python-headless<5"', req)
        else:
            row(m, True)
    except ImportError:
        row(m, False, hint, req)
chrom = [c for c in (os.environ.get("FM_CHROMIUM", ""), "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome") if c and os.path.exists(c)]
pw = False
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = (p.chromium.launch(executable_path=chrom[0]) if chrom else p.chromium.launch()); b.close(); pw = True
except Exception as e:
    hint = f"playwright install chromium  (oder FM_CHROMIUM=/pfad/zu/chrome) [{str(e)[:80]}]"
row("Chromium startbar", pw, hint if not pw else "")
fonts = list((SKILL / "assets" / "fonts").glob("*.woff2"))
row("Markenschriften (assets/fonts)", len(fonts) >= 5, "Dateien aus dem Website-Repo nach assets/fonts kopieren")
row("Marken-Logo", (SKILL / "assets" / "img" / "mark-finanz-medizin.png").exists(), "assets/img/mark-finanz-medizin.png fehlt")
print("\nBereit." if ok_all else "\nEs fehlen Voraussetzungen (siehe ❌).")
sys.exit(0 if ok_all else 1)
