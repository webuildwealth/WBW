#!/usr/bin/env python3
"""Zusammensetzen: oben Visualisierung, unten Sprecher, Audio-Mix, Loudness-Normalisierung, Instagram-Export.

  compose.py --top top.mp4 --bottom edited.mp4 --sfx sfx.wav [--music music.wav] -o reel.mp4
  compose.py --top top.mp4 --placeholder "Sprecher folgt" --sfx sfx.wav -o preview.mp4        # Modus C

Export: 1080x1920, H.264 (yuv420p, High, +faststart), AAC 192k/48 kHz, 30 fps, -14 LUFS integriert, True Peak ≤ -1.5 dBTP.
"""
import argparse, json, os, re, subprocess, sys, tempfile, pathlib

SKILL = pathlib.Path(__file__).resolve().parent.parent


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("FEHLER: " + " ".join(cmd[:3]) + "\n" + r.stderr[-2500:])
    return r


def dur_of(p):
    return float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).stdout.strip())


def has_audio(p):
    return bool(sh(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", p]).stdout.strip())


def placeholder(png, text, h):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (1080, h), "#0C2C4F")
    d = ImageDraw.Draw(im)
    for f in ("/usr/share/fonts/opentype/inter/Inter-Bold.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            font = ImageFont.truetype(f, 54); small = ImageFont.truetype(f, 34); break
    else:
        font = small = ImageFont.load_default()
    d.rounded_rectangle((90, 90, 990, h - 90), 40, outline="#A5293B", width=8)
    w = d.textlength(text, font=font)
    d.text(((1080 - w) / 2, h / 2 - 50), text, font=font, fill="#FFFFFF")
    s = "Platzhalter für dein Sprechervideo (unten)"
    d.text(((1080 - d.textlength(s, font=small)) / 2, h / 2 + 40), s, font=small, fill="#6F93B4")
    im.save(png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", required=True)
    ap.add_argument("--bottom")
    ap.add_argument("--placeholder")
    ap.add_argument("--sfx")
    ap.add_argument("--music")
    ap.add_argument("--music-db", type=float, default=-27, help="Musikpegel relativ (dB), wird zusätzlich unter der Stimme abgesenkt")
    ap.add_argument("--sfx-db", type=float, default=0)
    ap.add_argument("--lufs", type=float, default=-14)
    ap.add_argument("-o", "--out", default="reel.mp4")
    ap.add_argument("--crf", type=int, default=18)
    a = ap.parse_args()

    dur = dur_of(a.top)
    htop = int(sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", a.top]).stdout.strip())
    hb = 1920 - htop
    tmp = tempfile.mkdtemp(prefix="fmcomp_")
    inputs = ["-i", a.top]
    if a.bottom:
        inputs += ["-i", a.bottom]; bdur = dur_of(a.bottom)
        if bdur + 0.05 < dur:
            print(f"WARNUNG: Sprechervideo ({bdur:.2f}s) kürzer als Visualisierung ({dur:.2f}s) – letztes Bild wird gehalten.")
        vf_b = f"[1:v]tpad=stop_mode=clone:stop_duration=2,trim=duration={dur:.3f},setpts=PTS-STARTPTS[b]"
    else:
        png = os.path.join(tmp, "ph.png"); placeholder(png, a.placeholder or "Sprecher folgt", hb)
        inputs += ["-loop", "1", "-framerate", "30", "-t", f"{dur:.3f}", "-i", png]
        vf_b = f"[1:v]trim=duration={dur:.3f},setpts=PTS-STARTPTS[b]"
    idx = 2
    ai = {}
    if a.sfx:
        inputs += ["-i", a.sfx]; ai["sfx"] = idx; idx += 1
    if a.music:
        inputs += ["-i", a.music]; ai["music"] = idx; idx += 1

    # ---- Audio-Mix zu WAV ----
    parts, mix_in = [], []
    voice = a.bottom and has_audio(a.bottom)
    if voice:
        parts.append(f"[1:a]apad=whole_dur={dur:.3f},atrim=duration={dur:.3f},aresample=48000,asplit=2[v1][v2]"); mix_in.append("[v1]")
    if "music" in ai:
        mus = f"[{ai['music']}:a]aresample=48000,atrim=duration={dur:.3f},volume={a.music_db}dB[m]"
        if voice:
            parts.append(mus); parts.append("[m][v2]sidechaincompress=threshold=0.02:ratio=10:attack=30:release=500:makeup=1[md]"); mix_in.append("[md]")
        else:
            parts.append(mus); mix_in.append("[m]")
    elif voice:
        parts.append("[v2]anullsink")
    if "sfx" in ai:
        parts.append(f"[{ai['sfx']}:a]aresample=48000,atrim=duration={dur:.3f},volume={a.sfx_db}dB[s]"); mix_in.append("[s]")
    if not mix_in:
        parts.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={dur:.3f}[mix]")
    else:
        parts.append("".join(mix_in) + f"amix=inputs={len(mix_in)}:normalize=0:duration=longest,atrim=duration={dur:.3f}[mix]")
    wav1 = os.path.join(tmp, "mix.wav")
    sh(["ffmpeg", "-y", "-v", "error"] + inputs + ["-filter_complex", ";".join(parts), "-map", "[mix]", "-ac", "2", wav1])

    # ---- Loudnorm 2-Pass ----
    ln = f"loudnorm=I={a.lufs}:TP=-1.5:LRA=9"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav1, "-af", ln + ":print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))
    ln2 = f"{ln}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    wav2 = os.path.join(tmp, "final.wav")
    sh(["ffmpeg", "-y", "-v", "error", "-i", wav1, "-af", ln2 + ",alimiter=limit=0.70:level=disabled:attack=2:release=60,aresample=48000", wav2])

    # ---- Video + Mux ----
    fc = f"{vf_b};[0:v]trim=duration={dur:.3f},setpts=PTS-STARTPTS[t];[t][b]vstack=inputs=2,fps=30,format=yuv420p[v]"
    cmd = ["ffmpeg", "-y", "-v", "error"] + inputs + ["-i", wav2, "-filter_complex", fc, "-map", "[v]", "-map", f"{idx}:a",
           "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", str(a.crf), "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest", a.out]
    sh(cmd)
    print(f"fertig: {a.out} ({dur:.2f}s, Audio {m['input_i']} LUFS -> {a.lufs} LUFS)")


if __name__ == "__main__":
    main()
