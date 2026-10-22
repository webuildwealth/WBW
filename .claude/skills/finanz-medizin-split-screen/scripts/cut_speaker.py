#!/usr/bin/env python3
"""Sprechervideo schneiden: Pausen/Füllwörter raus, Jump-Cuts mit Zoom-Wechsel, Gesichts-Crop, Audio-Cleanup.

  cut_speaker.py raw.mp4 -o edited.mp4 [--words words.json] [--panel-h 960] [--face-x 0.5 --face-y 0.4]

Ausgabe:
  edited.mp4          1080 x panel-h, 30 fps, AAC (nur Sprecher, bereit für den unteren Bildbereich)
  edited.timemap.json Schnittliste (raw_start, raw_end, out_start, zoom)
  edited.words.json   Wörter auf der NEUEN Zeitachse (wenn --words gegeben)

Ohne --words: Schnitt nur nach Lautstärke (silencedetect). Mit --words: wortgenau, inkl. Füllwörtern (äh, ähm …)
und direkten Wortwiederholungen. Die Bedeutung wird nicht verändert: es werden nur Pausen/Füllwörter/Dopplungen entfernt.
"""
import argparse, json, re, subprocess, sys, pathlib, shutil

FILLERS = {"äh", "ähm", "ähh", "öhm", "ehm", "hm", "hmm", "mhm", "ääh"}


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def probe(path):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation:format=duration",
             "-of", "json", path])
    j = json.loads(r.stdout)
    st = j["streams"][0]
    w, h = st["width"], st["height"]
    rot = 0
    for sd in st.get("side_data_list", []):
        if "rotation" in sd:
            rot = int(sd["rotation"])
    if abs(rot) in (90, 270):
        w, h = h, w
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.strip())
    return w, h, dur


def color_info(path):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer,color_primaries,pix_fmt,codec_name,r_frame_rate", "-of", "json", path])
    try:
        return json.loads(r.stdout)["streams"][0]
    except Exception:
        return {}


def hdr_filter(ci):
    """iPhone-HDR (HLG/Dolby Vision 8.4 bzw. PQ) -> SDR BT.709, sonst wirkt das Video auf Instagram flau/überstrahlt."""
    if ci.get("color_transfer") not in ("arib-std-b67", "smpte2084"):
        return ""
    flt = run(["ffmpeg", "-hide_banner", "-filters"]).stdout
    if " zscale " not in flt or " tonemap " not in flt:
        print("WARNUNG: HDR-Video, aber ffmpeg ohne zscale/tonemap – Farben können flau wirken (brew install ffmpeg)")
        return ""
    tin = "arib-std-b67" if ci["color_transfer"] == "arib-std-b67" else "smpte2084"
    return (f"zscale=tin={tin}:min=bt2020nc:pin=bt2020:t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,"
            "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,")


def silence_segments(path, dur, noise_db, min_sil):
    r = run(["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=n={noise_db}dB:d={min_sil}", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    segs, cur = [], 0.0
    for i, s in enumerate(starts):
        if s - cur > 0.15:
            segs.append([cur, s])
        cur = ends[i] if i < len(ends) else dur
    if dur - cur > 0.15:
        segs.append([cur, dur])
    return segs


def word_segments(words, dur, max_gap, pad_in, pad_out):
    clean, removed = [], []
    for i, w in enumerate(words):
        t = re.sub(r"[^\wäöüß]", "", w["w"].lower())
        nxt = re.sub(r"[^\wäöüß]", "", words[i + 1]["w"].lower()) if i + 1 < len(words) else None
        if t in FILLERS:
            removed.append(w); continue
        if nxt and t == nxt and len(t) <= 6 and words[i + 1]["s"] - w["e"] < 0.35:  # "die die" -> erstes entfernen
            removed.append(w); continue
        clean.append(w)
    segs = []
    for w in clean:
        if segs and w["s"] - segs[-1][1] <= max_gap and not any(segs[-1][1] - 1e-3 <= r["s"] and r["e"] <= w["s"] + 1e-3 and (r["e"] - r["s"]) > 0 for r in removed):
            segs[-1][1] = w["e"]
        else:
            segs.append([w["s"], w["e"]])
    out = []
    for i, (s, e) in enumerate(segs):
        lo = out[-1][1] + 0.01 if out else 0.0
        out.append([max(lo, s - pad_in), min(dur, e + pad_out)])
    # Überlappungen vermeiden
    for i in range(1, len(out)):
        if out[i][0] < out[i - 1][1]:
            mid = (out[i][0] + out[i - 1][1]) / 2
            out[i - 1][1] = out[i][0] = mid
    return out, clean, removed


def detect_face(path, dur, w, h):
    try:
        import cv2
    except ImportError:
        return None
    if not hasattr(cv2, "CascadeClassifier"):  # OpenCV 5.x: pip install "opencv-python-headless<5"
        print("Hinweis: OpenCV ohne Haar-Cascade (v5) – Gesichtserkennung übersprungen; --face-x/--face-y setzen.")
        return None
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    pts = []
    cap = cv2.VideoCapture(path)
    for k in range(1, 7):
        cap.set(cv2.CAP_PROP_POS_MSEC, dur * k / 7 * 1000)
        ok, fr = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        fh, fw = g.shape
        f = cas.detectMultiScale(g, 1.1, 6, minSize=(int(fw * .08), int(fw * .08)))
        if len(f):
            x, y, a, b = max(f, key=lambda r: r[2] * r[3])
            pts.append(((x + a / 2) / fw, (y + b / 2) / fh))
    cap.release()
    if not pts:
        return None
    pts.sort()
    return pts[len(pts) // 2]


def mean_luma(path, dur):
    r = run(["ffmpeg", "-hide_banner", "-ss", str(dur * .1), "-i", path, "-t", str(min(8, dur * .8)), "-vf", "fps=2,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"])
    v = [float(x) for x in re.findall(r"YAVG=([\d.]+)", r.stderr)]
    return sum(v) / len(v) / 255 if v else None


def build(args):
    raw = args.video
    w, h, dur = probe(raw)
    ow, oh = 1080, args.panel_h
    words = json.loads(pathlib.Path(args.words).read_text(encoding="utf-8")) if args.words else None
    if isinstance(words, dict):
        words = words["words"]
    if args.no_cut:
        segs = [[0.0, dur]]; clean = words or []; removed = []
    elif words:
        segs, clean, removed = word_segments(words, dur, args.max_gap, args.pad_in, args.pad_out)
    else:
        segs = silence_segments(raw, dur, args.noise_db, args.min_silence)
        segs = [[max(0, s - args.pad_in), min(dur, e + args.pad_out)] for s, e in segs]
        clean, removed = [], []
    # sehr kurze Segmente an Nachbarn hängen
    merged = []
    for s in segs:
        if merged and (s[1] - s[0] < 0.25 or s[0] - merged[-1][1] < 0.12):
            merged[-1][1] = s[1]
        else:
            merged.append(list(s))
    segs = merged
    if not segs:
        sys.exit("Keine Sprache erkannt – Schwelle (--noise-db) prüfen.")

    face = (args.face_x, args.face_y) if args.face_x is not None else detect_face(raw, dur, w, h)
    fx, fy = face if face else (0.5, 0.35)
    print(f"Quelle {w}x{h} {dur:.1f}s | Gesicht {'erkannt' if face and args.face_x is None else 'manuell' if face else 'NICHT erkannt – Mitte'} bei x={fx:.2f}, y={fy:.2f}")

    ci = color_info(raw)
    hdr = hdr_filter(ci)
    if hdr:
        print(f"HDR erkannt ({ci.get('color_transfer')}, {ci.get('pix_fmt')}) → Tonemapping nach SDR BT.709")
    base = max(ow / w, oh / h)  # cover
    zoom_cycle = [1.0, 1.12, 1.0, 1.2, 1.06, 1.16] if not args.no_zoom else [1.0]
    fc, labels, t_out, tmap = [], [], 0.0, []
    luma = mean_luma(raw, dur) if args.auto_light else None
    gamma = 1.0
    if luma:
        gamma = max(0.8, min(1.35, 1 + (0.42 - luma) * 1.2))
        print(f"Helligkeit {luma:.2f} -> gamma {gamma:.2f}")
    eq = f"eq=gamma={gamma:.3f}:contrast=1.04:saturation=1.06"
    for i, (s, e) in enumerate(segs):
        z = zoom_cycle[i % len(zoom_cycle)]
        sw, sh = int(round(w * base * z / 2) * 2), int(round(h * base * z / 2) * 2)
        cx = max(0, min(sw - ow, int(fx * sw - ow / 2)))
        cy = max(0, min(sh - oh, int(fy * sh - oh * args.headroom)))
        d = e - s
        fc.append(f"[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS,{hdr}fps={args.fps},scale={sw}:{sh}:flags=lanczos,crop={ow}:{oh}:{cx}:{cy},setsar=1,{eq}[v{i}]")
        af = f"[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={max(0, d - 0.012):.3f}:d=0.012[a{i}]"
        fc.append(af)
        labels.append(f"[v{i}][a{i}]")
        tmap.append({"raw_start": round(s, 3), "raw_end": round(e, 3), "out_start": round(t_out, 3), "zoom": z})
        t_out += d
    fc.append("".join(labels) + f"concat=n={len(segs)}:v=1:a=1[vc][ac]")
    # Sprach-Cleanup: Rumpel weg, leichtes Entrauschen, sanfte Kompression – Stimme bleibt natürlich
    fc.append("[ac]highpass=f=80,afftdn=nr=10:nf=-32,acompressor=threshold=-20dB:ratio=2.2:attack=15:release=180:makeup=2,aresample=48000[aout]")
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", raw, "-filter_complex", ";".join(fc), "-map", "[vc]", "-map", "[aout]",
           "-c:v", "libx264", "-preset", "medium", "-crf", str(args.crf), "-pix_fmt", "yuv420p", "-r", str(args.fps),
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", args.out]
    r = run(cmd)
    if r.returncode:
        sys.exit(r.stderr[-2000:])
    out = pathlib.Path(args.out)
    (out.with_suffix(".timemap.json")).write_text(json.dumps({"source_duration": dur, "out_duration": round(t_out, 3), "segments": tmap, "face": [fx, fy],
                                                              "removed_words": [x["w"] for x in removed]}, ensure_ascii=False, indent=1), encoding="utf-8")
    if words:
        nw = []
        for wd in clean:
            for m in tmap:
                if m["raw_start"] - 1e-3 <= wd["s"] < m["raw_end"]:
                    off = m["out_start"] - m["raw_start"]
                    nw.append({"w": wd["w"], "s": round(wd["s"] + off, 3), "e": round(min(wd["e"], m["raw_end"]) + off, 3)})
                    break
        out.with_suffix(".words.json").write_text(json.dumps(nw, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(segs)} Segmente, {dur:.1f}s -> {t_out:.1f}s (−{dur - t_out:.1f}s), {len(removed)} Füllwörter/Dopplungen entfernt -> {args.out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("-o", "--out", default="edited.mp4")
    ap.add_argument("--words")
    ap.add_argument("--panel-h", type=int, default=960)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--crf", type=int, default=17)
    ap.add_argument("--max-gap", type=float, default=0.45, help="Pausen länger als das werden gekürzt (nur mit --words)")
    ap.add_argument("--pad-in", type=float, default=0.10)
    ap.add_argument("--pad-out", type=float, default=0.16)
    ap.add_argument("--noise-db", type=float, default=-32)
    ap.add_argument("--min-silence", type=float, default=0.40)
    ap.add_argument("--face-x", type=float)
    ap.add_argument("--face-y", type=float)
    ap.add_argument("--headroom", type=float, default=0.40, help="Gesichtsmitte bei dieser Höhe des Ausschnitts")
    ap.add_argument("--auto-light", action="store_true")
    ap.add_argument("--no-zoom", action="store_true")
    ap.add_argument("--no-cut", action="store_true")
    build(ap.parse_args())
