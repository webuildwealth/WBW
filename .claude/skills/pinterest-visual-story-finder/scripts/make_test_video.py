#!/usr/bin/env python3
"""Erzeugt ein synthetisches Rohvideo zum Testen der Pipeline (kein echtes Material nötig).

Sprecher: gemeinfreies NASA-Porträt (Eileen Collins, scikit-image `astronaut`) mit leichter
Handkamera-Bewegung vor einem unruhigen Zimmerhintergrund. Ton: espeak-ng (Sprachsynthese).
  make_test_video.py out.mp4 --text-file skript.txt --lang de
"""
import argparse
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DEFAULT_DE = ("Früher konnte man für einen Dollar richtig viel kaufen. Ein Brot, eine Zeitung und sogar einen Kaffee. "
              "Heute reicht derselbe Dollar kaum noch für ein Brötchen. Das nennt man Inflation. "
              "Die Preise steigen, und dein Geld verliert jedes Jahr an Wert. "
              "Wer sein Vermögen schützen will, investiert in Sachwerte wie Immobilien, Aktien oder Gold.")


def room(w, h, rng):
    img = Image.new("RGB", (w, h), (196, 186, 170))
    d = ImageDraw.Draw(img)
    for y in range(h):  # Wandverlauf
        c = int(200 - 50 * y / h)
        d.line([(0, y), (w, y)], fill=(c, c - 8, c - 22))
    d.rectangle([60, 180, 420, 720], fill=(150, 190, 225), outline=(240, 240, 235), width=18)  # Fenster
    d.line([(240, 180), (240, 720)], fill=(240, 240, 235), width=12)
    d.rectangle([620, 300, 1040, 330], fill=(110, 80, 55))  # Regal
    for k in range(9):
        x = 640 + k * 44
        d.rectangle([x, 300 - rng.integers(80, 150), x + 34, 300], fill=tuple(int(v) for v in rng.integers(40, 220, 3)))
    d.rectangle([0, h - 300, w, h], fill=(120, 95, 70))  # Tisch/Boden
    d.ellipse([820, 1350, 1060, 1590], fill=(60, 110, 60))  # Pflanze
    return img.filter(ImageFilter.GaussianBlur(1.5))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("out")
    p.add_argument("--text-file")
    p.add_argument("--lang", default="de")
    p.add_argument("--speed", type=int, default=150)
    a = p.parse_args()
    text = open(a.text_file, encoding="utf-8").read() if a.text_file else DEFAULT_DE
    try:
        from skimage import data
    except ImportError:
        sys.exit("scikit-image fehlt: pip install scikit-image")
    tmp = tempfile.mkdtemp()
    wav = os.path.join(tmp, "voice.wav")
    subprocess.run(["espeak-ng", "-v", a.lang, "-s", str(a.speed), "-g", "4", "-w", wav, text], check=True)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
                               capture_output=True, text=True).stdout)
    W, H, fps = 1080, 1920, 30
    rng = np.random.default_rng(1)
    bg = room(W, H, rng)
    face = Image.fromarray(data.astronaut()).resize((1180, 1180), Image.LANCZOS)
    n = int(dur * fps)
    proc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                             "-r", str(fps), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                             "-pix_fmt", "yuv420p", "-c:a", "aac", a.out], stdin=subprocess.PIPE)
    for i in range(n):
        t = i / fps
        frame = bg.copy()
        ang = 1.2 * math.sin(t * 0.9)
        dx, dy = 14 * math.sin(t * 0.7), 10 * math.sin(t * 1.3)
        f = face.rotate(ang, resample=Image.BICUBIC, expand=False)
        frame.paste(f, (int((W - 1180) / 2 + dx), int(560 + dy)))
        proc.stdin.write(np.asarray(frame).tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"Testvideo: {a.out} ({dur:.1f}s)")


if __name__ == "__main__":
    main()
