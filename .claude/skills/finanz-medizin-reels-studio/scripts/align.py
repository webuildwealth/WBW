#!/usr/bin/env python3
"""Wort-Timings fuer Untertitel und Animations-Cues.
 - estimate_words(): Silbengewichtete Schaetzung, an Energieminima (Wortgrenzen/Pausen) der echten Sprache eingerastet.
   Gut genug fuer 1-2-Wort-Captions; KEINE Forced-Alignment-Genauigkeit.
 - whisper_words(): exakte Wort-Timings aus einer Aufnahme (faster-whisper, falls installiert)."""
import re, numpy as np
from scipy.io import wavfile

VOW = re.compile(r"[aeiouyäöü]+", re.I)

def load(wav):
    sr, x = wavfile.read(wav)
    x = x.astype(np.float32) / (32768.0 if x.dtype == np.int16 else 1.0)
    if x.ndim > 1: x = x.mean(1)
    return sr, x

def envelope(x, sr, hop=0.01):
    n = int(sr * hop); m = len(x) // n
    return np.sqrt((x[: m * n].reshape(m, n) ** 2).mean(1) + 1e-12)

def speech_bounds(x, sr, db=-42.0):
    env = envelope(x, sr); thr = env.max() * 10 ** (db / 20)
    idx = np.where(env > thr)[0]
    if not len(idx): return 0.0, len(x) / sr
    return max(0, idx[0] * 0.01 - 0.03), min(len(x) / sr, (idx[-1] + 1) * 0.01 + 0.06)

def tokens(text): return [t for t in re.split(r"\s+", text.strip()) if t]

def weight(w):
    core = re.sub(r"[^\wäöüÄÖÜß]", "", w)
    return max(1, len(VOW.findall(core))) * 1.0 + 0.10 * len(core)

def pause_after(w):
    if re.search(r"[.!?…]$", w): return 0.30
    if re.search(r"[,;:–—]$", w): return 0.14
    return 0.0

def estimate_words(text, x, sr, offset=0.0):
    """x: bereits auf Sprache getrimmte Samples. Rueckgabe: [{w,t0,t1}] relativ zum Trimmanfang (+offset)."""
    ws = tokens(text); dur = len(x) / sr
    if not ws: return []
    pauses = [pause_after(w) for w in ws[:-1]] + [0.0]
    wt = [weight(w) for w in ws]
    k = max(1e-3, (dur - sum(pauses)) / sum(wt))
    t = 0.0; spans = []
    for w, p, wgt in zip(ws, pauses, wt):
        spans.append([t, t + k * wgt]); t += k * wgt + p
    # Grenzen an lokale Energieminima einrasten (+-90 ms)
    env = envelope(x, sr); bounds = []
    for i in range(len(ws) - 1):
        b = (spans[i][1] + spans[i + 1][0]) / 2; c = int(round(b / 0.01)); lo, hi = max(1, c - 9), min(len(env) - 1, c + 9)
        if hi > lo: c = lo + int(np.argmin(env[lo:hi]))
        bounds.append(c * 0.01)
    starts = [0.0] + bounds; ends = bounds + [dur]
    out = []
    for i, w in enumerate(ws):
        t0, t1 = starts[i], ends[i]
        if pauses[i] > 0.1: t1 = max(t0 + 0.12, t1 - pauses[i] * 0.6)   # Pause nicht dem Wort zurechnen
        out.append({"w": w, "t0": round(t0 + offset, 3), "t1": round(max(t1, t0 + 0.1) + offset, 3)})
    for a, b in zip(out, out[1:]):   # streng monoton: kein Wort endet nach dem Start des naechsten
        if a["t1"] > b["t0"]: a["t1"] = round(max(a["t0"] + 0.04, b["t0"]), 3)
    return out

def whisper_words(audio, language="de", model="small"):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit("faster-whisper nicht installiert: pip install faster-whisper (Modell-Download benoetigt Internet). "
                         "Alternative: Wort-Timings als JSON [{w,t0,t1}] liefern und im Storyboard unter voice.words angeben.")
    m = WhisperModel(model, compute_type="int8"); segs, _ = m.transcribe(str(audio), language=language, word_timestamps=True)
    return [{"w": w.word.strip(), "t0": round(w.start, 3), "t1": round(w.end, 3)} for s in segs for w in s.words]
