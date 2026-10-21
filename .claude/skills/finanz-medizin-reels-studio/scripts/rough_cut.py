#!/usr/bin/env python3
"""Modus 3, Schritt 1: Stille/Versprecher-Pausen entfernen (Jump-Cuts) aus einem Rohvideo.
   python3 rough_cut.py raw.mp4 cut.mp4 [--silence-db -32] [--min-silence 0.35] [--pad 0.08]
   Schreibt cut.mp4 (1080x1920, 30 fps) und cut.cutlist.json (Quell-Zeitbereiche -> fuer 'source' im Storyboard)."""
import argparse, json, re, subprocess
ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("dst"); ap.add_argument("--silence-db", type=float, default=-32); ap.add_argument("--min-silence", type=float, default=0.35); ap.add_argument("--pad", type=float, default=0.08)
a = ap.parse_args()
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.src]).decode())
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", a.src, "-af", f"silencedetect=noise={a.silence_db}dB:d={a.min_silence}", "-vn", "-f", "null", "-"], capture_output=True, text=True).stderr
st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]; en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
keep, cur = [], 0.0
for s, e in zip(st, en):
    if s - cur > 0.15: keep.append((max(0, cur - 0 ), min(dur, s + a.pad)))
    cur = max(0, e - a.pad)
if dur - cur > 0.15: keep.append((cur, dur))
fc = "".join(f"[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[v{i}];[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS[a{i}];" for i, (s, e) in enumerate(keep))
fc += "".join(f"[v{i}][a{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=1:a=1[v][a]"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", a.src, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-c:a", "aac", a.dst], check=True)
json.dump([{"from": round(s, 3), "to": round(e, 3)} for s, e in keep], open(a.dst.rsplit(".", 1)[0] + ".cutlist.json", "w"), indent=1)
print(f"{len(keep)} Segmente, {sum(e - s for s, e in keep):.1f} s von {dur:.1f} s behalten")
