"""Gemeinsame Hilfsfunktionen: Logging, FFmpeg/ffprobe, JSON, Frame-I/O."""
import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_T0 = time.time()
WARNINGS = []


def log(msg):
    print(f"[{time.time() - _T0:7.1f}s] {msg}", flush=True)


def warn(msg):
    WARNINGS.append(msg)
    log("WARNUNG: " + msg)


def need(binary):
    if not shutil.which(binary):
        raise SystemExit(f"'{binary}' fehlt. Installieren: siehe SETUP-REELS.md")


def run(cmd, quiet=True):
    need(cmd[0])
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"Befehl fehlgeschlagen ({r.returncode}): {' '.join(cmd)}\n{r.stderr[-3000:]}")
    if not quiet:
        log(r.stdout)
    return r.stdout


def probe(path):
    out = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path])
    d = json.loads(out)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        raise SystemExit(f"Keine Videospur in {path}")
    num, den = (v.get("avg_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    return {
        "width": int(v["width"]), "height": int(v["height"]), "fps": fps,
        "duration": float(d["format"].get("duration") or v.get("duration") or 0),
        "has_audio": a is not None,
    }


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


class FrameReader:
    """Liest Frames eines Videos als RGB- oder Graustufen-Arrays über eine FFmpeg-Pipe."""

    def __init__(self, path, width, height, gray=False):
        self.w, self.h, self.ch = width, height, 1 if gray else 3
        fmt = "gray" if gray else "rgb24"
        self.p = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", fmt, "-"],
            stdout=subprocess.PIPE, bufsize=10 ** 8)

    def read(self):
        n = self.w * self.h * self.ch
        buf = self.p.stdout.read(n)
        if len(buf) < n:
            return None
        a = np.frombuffer(buf, np.uint8)
        return a.reshape(self.h, self.w) if self.ch == 1 else a.reshape(self.h, self.w, 3)

    def __iter__(self):
        while True:
            f = self.read()
            if f is None:
                break
            yield f

    def close(self):
        try:
            self.p.stdout.close()
            self.p.kill()
            self.p.wait()
        except Exception:
            pass


class FrameWriter:
    """Schreibt RGB-/Graustufen-Frames in eine FFmpeg-Pipe."""

    def __init__(self, path, width, height, fps, out_args, gray=False, extra_inputs=()):
        fmt = "gray" if gray else "rgb24"
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", fmt,
               "-s", f"{width}x{height}", "-r", str(fps), "-i", "-"]
        for inp in extra_inputs:
            cmd += ["-i", inp]
        cmd += list(out_args) + [path]
        self.path = path
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def write(self, frame):
        self.p.stdin.write(np.ascontiguousarray(frame).tobytes())

    def close(self):
        self.p.stdin.close()
        err = self.p.stderr.read().decode("utf-8", "replace")
        if self.p.wait() != 0:
            raise RuntimeError(f"FFmpeg-Encoding fehlgeschlagen für {self.path}:\n{err[-3000:]}")


def font_path(weight="bold"):
    names = {"bold": ["InterDisplay-Bold.otf", "Inter-Bold.otf", "DejaVuSans-Bold.ttf"],
             "black": ["InterDisplay-Black.otf", "Inter-Black.otf", "DejaVuSans-Bold.ttf"]}[weight]
    dirs = [os.path.join(SKILL_DIR, "fonts"), "/usr/share/fonts/opentype/inter",
            "/usr/share/fonts/truetype/dejavu", "/Library/Fonts", "/System/Library/Fonts",
            os.path.expanduser("~/Library/Fonts"), "C:\\Windows\\Fonts"]
    for n in names:
        for d in dirs:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return None


def py_module_available(name):
    try:
        __import__(name)
        return True
    except Exception:
        return False


def stage_done(path, force):
    return os.path.exists(path) and not force


def eprint(*a):
    print(*a, file=sys.stderr)
