#!/usr/bin/env python3
"""Transkript des Nutzers mit dem Video verbinden -> words.json

  align_transcript.py --transcript skript.txt --words whisper.json -o words.json   # Whisper-Zeiten + korrekte Schreibweise aus dem Transkript
  align_transcript.py --transcript skript.txt --video roh.mp4 -o words.json        # ohne Spracherkennung: Verteilung auf Sprechpassagen

Modus 2 ist eine Näherung: Wörter werden nach Zeichenlänge auf die per silencedetect gemessenen Sprechpassagen verteilt,
Satzenden werden an Pausen ausgerichtet. Genauigkeit typ. ±0,3–0,6 s – für Szenenwechsel ausreichend, Untertitel wirken leicht versetzt.
"""
import argparse, difflib, json, re, subprocess, sys, pathlib


def norm(w):
    return re.sub(r"[^\wäöüß]", "", w.lower())


def merge(transcript_tokens, words):
    a = [norm(w["w"]) for w in words]; b = [norm(t) for t in transcript_tokens]
    out = [None] * len(b)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            w = words[blk.a + k]; out[blk.b + k] = {"w": transcript_tokens[blk.b + k], "s": w["s"], "e": w["e"]}
    # Lücken interpolieren
    i = 0
    while i < len(out):
        if out[i] is None:
            j = i
            while j < len(out) and out[j] is None:
                j += 1
            t0 = out[i - 1]["e"] if i > 0 else (words[0]["s"] if words else 0)
            t1 = out[j]["s"] if j < len(out) else (words[-1]["e"] if words else t0 + 0.4 * (j - i))
            step = max(0.05, (t1 - t0) / (j - i))
            for k in range(i, j):
                out[k] = {"w": transcript_tokens[k], "s": round(t0 + (k - i) * step, 3), "e": round(t0 + (k - i + 1) * step - 0.02, 3)}
            i = j
        i += 1
    matched = sum(1 for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks() for _ in range(blk.size))
    return out, matched / max(1, len(b))


def speech_segments(video, noise_db=-32, min_sil=0.30):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-af", f"silencedetect=n={noise_db}dB:d={min_sil}", "-f", "null", "-"], capture_output=True, text=True)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], capture_output=True, text=True).stdout.strip())
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]; en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    segs, cur = [], 0.0
    for i, s in enumerate(st):
        if s - cur > 0.12: segs.append([cur, s])
        cur = en[i] if i < len(en) else dur
    if dur - cur > 0.12: segs.append([cur, dur])
    return segs


def distribute(tokens, segs):
    total = sum(e - s for s, e in segs)
    wts = [len(norm(t)) + 2 + (4 if re.search(r"[.!?]$", t) else 1.5 if re.search(r"[,;:]$", t) else 0) for t in tokens]
    W = sum(wts); out, acc = [], 0.0

    def speech_to_time(x):  # Position in Sprechzeit -> Videozeit
        for s, e in segs:
            if x <= e - s: return s + x
            x -= e - s
        return segs[-1][1]
    for t, w in zip(tokens, wts):
        a0 = acc / W * total; acc += w; a1 = acc / W * total
        s = speech_to_time(a0); e = speech_to_time(a1 - (a1 - a0) * .15)
        out.append({"w": t, "s": round(s, 3), "e": round(max(e, s + .08), 3)})
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcript", required=True); ap.add_argument("--words"); ap.add_argument("--video"); ap.add_argument("-o", "--out", default="words.json")
    a = ap.parse_args()
    toks = pathlib.Path(a.transcript).read_text(encoding="utf-8").split()
    if a.words:
        w = json.loads(pathlib.Path(a.words).read_text(encoding="utf-8"))
        out, q = merge(toks, w)
        print(f"Transkript mit Spracherkennung abgeglichen: {q:.0%} der Wörter direkt zugeordnet")
        if q < 0.6:
            print("WARNUNG: Transkript und Aufnahme weichen stark ab – passt das Transkript zu diesem Video?")
    elif a.video:
        segs = speech_segments(a.video)
        out = distribute(toks, segs)
        print(f"Ohne Spracherkennung: {len(toks)} Wörter auf {len(segs)} Sprechpassagen verteilt (Näherung)")
    else:
        sys.exit("--words oder --video angeben")
    pathlib.Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
