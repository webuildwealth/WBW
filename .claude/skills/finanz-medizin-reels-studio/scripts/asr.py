#!/usr/bin/env python3
"""Offline-Spracherkennung (Deutsch) mit Wort-Zeitstempeln.
Engine: sherpa-onnx + NVIDIA Parakeet TDT 0.6B v3 (int8, 25 europaeische Sprachen, Satzzeichen + Gross-/Kleinschreibung).
Modell wird beim ersten Lauf von GitHub (k2-fsa/sherpa-onnx Releases, ~490 MB) nach ~/.cache/fm-reels/models geladen.

  python3 asr.py audio.wav words.json
Ausgabe: [{"w": "Wort,", "t0": 1.23, "t1": 1.58}, ...]  (Satzzeichen haengen am Wort)"""
import json, os, subprocess, sys, tarfile, urllib.request, wave
from pathlib import Path
import numpy as np

MODEL_DIR = Path(os.environ.get("FM_MODELS", Path.home() / ".cache" / "fm-reels" / "models"))
PARAKEET = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{PARAKEET}.tar.bz2"

def ensure_model():
    d = MODEL_DIR / PARAKEET
    if (d / "encoder.int8.onnx").exists(): return d
    MODEL_DIR.mkdir(parents=True, exist_ok=True); tmp = MODEL_DIR / f"{PARAKEET}.tar.bz2"
    print(f"Lade ASR-Modell ({URL}) ...", file=sys.stderr)
    urllib.request.urlretrieve(URL, tmp)
    with tarfile.open(tmp) as t: t.extractall(MODEL_DIR)
    tmp.unlink(); return d

def load_wav16(path):
    """Beliebige Audio-/Videodatei -> 16 kHz mono float32."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0

def chunks(x, sr=16000, max_len=25.0, min_len=8.0):
    """Lange Aufnahmen an der leisesten Stelle zwischen min_len und max_len teilen (Parakeet arbeitet am besten < 30 s)."""
    hop = int(sr * 0.02); env = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, "same")[::hop] + 1e-12)
    out, start = [], 0
    while len(x) - start > max_len * sr:
        a, b = (start + int(min_len * sr)) // hop, (start + int(max_len * sr)) // hop
        cut = (a + int(np.argmin(env[a:b]))) * hop; out.append((start, cut)); start = cut
    out.append((start, len(x))); return out

_REC = None
def recognizer(threads=4):
    global _REC
    if _REC is None:
        import sherpa_onnx
        d = ensure_model()
        _REC = sherpa_onnx.OfflineRecognizer.from_transducer(encoder=str(d / "encoder.int8.onnx"), decoder=str(d / "decoder.int8.onnx"), joiner=str(d / "joiner.int8.onnx"),
                                                            tokens=str(d / "tokens.txt"), model_type="nemo_transducer", num_threads=threads)
    return _REC

def transcribe(path, threads=4):
    x = load_wav16(path); rec = recognizer(threads); words = []
    for a, b in chunks(x):
        s = rec.create_stream(); s.accept_waveform(16000, x[a:b]); rec.decode_stream(s); r = s.result
        off = a / 16000; durs = list(getattr(r, "durations", []) or [])
        cur = None
        for i, (tok, ts) in enumerate(zip(r.tokens, r.timestamps)):
            d = durs[i] if i < len(durs) and durs[i] > 0 else 0.08
            t0, t1 = off + ts, off + ts + d
            if tok.startswith(" ") or cur is None:            # SentencePiece: Leerzeichen = neues Wort
                if tok.strip() and all(c in ".,!?;:…" for c in tok.strip()) and cur:  # reines Satzzeichen -> ans Wort haengen
                    cur["w"] += tok.strip(); continue
                if cur: words.append(cur)
                cur = {"w": tok.strip(), "t0": t0, "t1": t1}
            else:
                cur["w"] += tok; cur["t1"] = t1
        if cur: words.append(cur)
    words = [w for w in words if w["w"]]
    for w in words: w["t0"], w["t1"] = round(w["t0"], 3), round(max(w["t1"], w["t0"] + 0.06), 3)
    for a, b in zip(words, words[1:]):
        if a["t1"] > b["t0"]: a["t1"] = round(max(a["t0"] + 0.04, b["t0"]), 3)
    return words

if __name__ == "__main__":
    ws = transcribe(sys.argv[1]); Path(sys.argv[2]).write_text(json.dumps(ws, ensure_ascii=False, indent=0), encoding="utf-8")
    print(" ".join(w["w"] for w in ws))
