"""Schritt 2: Transkription mit Wort-Zeitstempeln.

Backends (Reihenfolge bei --asr auto):
  1. faster-whisper   beste Qualität, alle Sprachen. Lädt das Modell beim ersten Lauf von HuggingFace
                      (oder lokaler Pfad über --whisper-model /pfad/zum/modell).
  2. pocketsphinx     offline, Modell im Paket enthalten, NUR Englisch, deutlich ungenauer.
  3. script           kein Spracherkenner: Wörter aus --script werden über Sprachaktivität (VAD)
                      zeitlich verteilt. Funktioniert in jeder Sprache, Timing ca. ±0,3 s.
Wird zusätzlich --script übergeben, korrigiert der Skript-Text die erkannten Wörter (Timing bleibt vom ASR).
"""
import difflib
import re
import wave

import numpy as np

from .util import log, warn

PUNCT_END = ".!?…"


def read_wav16(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16)
        if w.getnchannels() > 1:
            a = a.reshape(-1, w.getnchannels()).mean(axis=1).astype(np.int16)
    return a, sr


def vad_regions(path, frame_ms=20, min_gap=0.25, min_len=0.12):
    """Energiebasierte Sprachaktivität -> [(start, end), ...] in Sekunden."""
    a, sr = read_wav16(path)
    n = int(sr * frame_ms / 1000)
    if len(a) < n:
        return []
    frames = a[: len(a) // n * n].astype(np.float32).reshape(-1, n)
    rms = np.sqrt((frames ** 2).mean(axis=1)) + 1e-6
    db = 20 * np.log10(rms / 32768)
    floor = np.percentile(db, 10)
    peak = np.percentile(db, 95)
    thr = max(floor + 0.35 * (peak - floor), -55)
    on = db > thr
    regs, start = [], None
    for i, v in enumerate(on):
        t = i * frame_ms / 1000
        if v and start is None:
            start = t
        elif not v and start is not None:
            regs.append([start, t])
            start = None
    if start is not None:
        regs.append([start, len(on) * frame_ms / 1000])
    merged = []
    for r in regs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [(s, e) for s, e in merged if e - s >= min_len]


def tokenize_script(text):
    return [t for t in re.split(r"\s+", text.strip()) if t]


def align_script_to_vad(words, regions):
    """Verteilt Skriptwörter proportional zur Zeichenlänge über Sprachregionen.
    Satzzeichen erzeugen zusätzliche Pausengewichte, damit Sätze an Pausen andocken."""
    if not regions:
        raise SystemExit("Keine Sprache im Audio erkannt (VAD) – Skript-Alignment unmöglich.")
    weights = []
    for w in words:
        weights.append(len(re.sub(r"\W", "", w)) + 1.5)
    total_w = sum(weights)
    speech = [(s, e) for s, e in regions]
    total_t = sum(e - s for s, e in speech)

    # Satzgrenzen bevorzugt auf Regionsgrenzen legen: Wenn Anzahl Sätze ~ Anzahl Regionen,
    # verteilen wir satzweise; sonst global.
    sentences, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        if w[-1] in PUNCT_END or w.endswith(","):
            sentences.append(cur)
            cur = []
    if cur:
        sentences.append(cur)

    def map_time(x):  # x in [0,total_t] Sprechzeit -> Echtzeit
        acc = 0.0
        for s, e in speech:
            if x <= acc + (e - s):
                return s + (x - acc)
            acc += e - s
        return speech[-1][1]

    out = []
    if len(sentences) >= 2 and abs(len(sentences) - len(speech)) <= max(1, len(speech) // 4):
        # Gruppen-Zuordnung: Sätze sequenziell auf Regionen mappen (DP-frei, proportional)
        bounds = np.cumsum([sum(weights[i] for i in s) for s in sentences]) / total_w
        reg_bounds = np.cumsum([e - s for s, e in speech]) / total_t
        x0 = 0.0
        for si, sent in enumerate(sentences):
            # Satzende auf nächstgelegene Regionsgrenze snappen
            target = bounds[si]
            j = int(np.argmin(np.abs(reg_bounds - target)))
            x1 = reg_bounds[j] * total_t if si < len(sentences) - 1 else total_t
            x1 = max(x1, x0 + 0.2 * len(sent))
            sw = sum(weights[i] for i in sent)
            acc = x0
            for i in sent:
                d = (x1 - x0) * weights[i] / sw
                out.append({"w": words[i], "s": round(map_time(acc), 3), "e": round(map_time(acc + d), 3)})
                acc += d
            x0 = x1
    else:
        acc = 0.0
        for w, wt in zip(words, weights):
            d = total_t * wt / total_w
            out.append({"w": w, "s": round(map_time(acc), 3), "e": round(map_time(acc + d), 3)})
            acc += d
    for o in out:  # Wörter nie über Regionsgrenzen strecken
        o["e"] = max(o["e"], o["s"] + 0.05)
    return out


def _norm(w):
    return re.sub(r"[^\wäöüß]", "", w.lower())


def merge_script(asr_words, script_words):
    """Überträgt ASR-Timings auf den (korrekten) Skript-Text."""
    a = [_norm(w["w"]) for w in asr_words]
    b = [_norm(w) for w in script_words]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    times = [None] * len(script_words)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            for k in range(j2 - j1):
                times[j1 + k] = (asr_words[i1 + k]["s"], asr_words[i1 + k]["e"])
        elif tag == "replace" and i2 > i1:
            s, e = asr_words[i1]["s"], asr_words[i2 - 1]["e"]
            n = j2 - j1
            for k in range(n):
                times[j1 + k] = (s + (e - s) * k / n, s + (e - s) * (k + 1) / n)
    # Lücken interpolieren
    known = [i for i, t in enumerate(times) if t]
    if not known:
        return None
    for i in range(len(times)):
        if times[i] is None:
            prev = max([k for k in known if k < i], default=None)
            nxt = min([k for k in known if k > i], default=None)
            s = times[prev][1] if prev is not None else max(0.0, times[nxt][0] - 0.3)
            e = times[nxt][0] if nxt is not None else s + 0.3
            gap_words = (nxt if nxt is not None else len(times)) - (prev if prev is not None else -1) - 1
            pos = i - (prev if prev is not None else -1) - 1
            d = (e - s) / max(gap_words, 1)
            times[i] = (s + d * pos, s + d * (pos + 1))
    matched = sum(1 for t in sm.get_opcodes() if t[0] == "equal") / max(len(b), 1)
    log(f"Skript mit ASR abgeglichen ({len(known)}/{len(b)} Wörter direkt zugeordnet)")
    return [{"w": w, "s": round(t[0], 3), "e": round(t[1], 3)} for w, t in zip(script_words, times)]


def asr_faster_whisper(path, lang, model_name):
    from faster_whisper import WhisperModel
    log(f"faster-whisper: lade Modell '{model_name}' (CPU, int8) …")
    model = WhisperModel(model_name, device="auto", compute_type="int8")
    segs, info = model.transcribe(path, language=lang or None, word_timestamps=True, vad_filter=True,
                                  beam_size=5)
    words = []
    for seg in segs:
        for w in seg.words or []:
            t = w.word.strip()
            if t:
                words.append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3)})
    return words, info.language


def asr_pocketsphinx(path, lang):
    if lang and not lang.startswith("en"):
        raise RuntimeError("pocketsphinx-Modell im Paket ist nur Englisch")
    from pocketsphinx import Decoder
    a, sr = read_wav16(path)
    dec = Decoder(samprate=sr)
    words = []
    for s, e in vad_regions(path):
        seg = a[int(max(0, s - 0.1) * sr): int((e + 0.1) * sr)]
        dec.start_utt()
        dec.process_raw(seg.tobytes(), full_utt=True)
        dec.end_utt()
        off = max(0, s - 0.1)
        for sg in dec.seg():
            w = re.sub(r"\(\d+\)$", "", sg.word)
            if w.startswith("<") or w.startswith("[") or w in ("<sil>",):
                continue
            words.append({"w": w, "s": round(off + sg.start_frame / 100, 3), "e": round(off + (sg.end_frame + 1) / 100, 3)})
    return words, "en"


def transcribe(asr_wav, lang=None, backend="auto", script_text=None, whisper_model="small"):
    script_words = tokenize_script(script_text) if script_text else None
    order = {"auto": ["faster-whisper", "pocketsphinx", "script"],
             "faster-whisper": ["faster-whisper"], "pocketsphinx": ["pocketsphinx"], "script": ["script"]}[backend]
    errors = []
    for b in order:
        try:
            if b == "script":
                if not script_words:
                    raise RuntimeError("kein --script angegeben")
                words = align_script_to_vad(script_words, vad_regions(asr_wav))
                if backend == "auto":
                    warn("Kein Spracherkenner verfügbar: Untertitel-Timing aus Skript + Sprachaktivität geschätzt (±0,3 s).")
                return {"backend": "script-vad", "language": lang, "words": words, "errors": errors}
            if b == "faster-whisper":
                words, det = asr_faster_whisper(asr_wav, lang, whisper_model)
            else:
                words, det = asr_pocketsphinx(asr_wav, lang)
            if not words:
                raise RuntimeError("keine Wörter erkannt")
            if script_words:
                merged = merge_script(words, script_words)
                if merged:
                    words = merged
            log(f"Transkription via {b}: {len(words)} Wörter, Sprache {det}")
            if errors:
                warn("Transkriptions-Fallback genutzt: " + " | ".join(errors))
            return {"backend": b, "language": lang or det, "words": words, "errors": errors}
        except Exception as e:  # nächstes Backend probieren
            errors.append(f"{b}: {type(e).__name__}: {str(e)[:200]}")
            log(f"ASR-Backend {b} nicht nutzbar: {errors[-1]}")
    raise SystemExit("Transkription fehlgeschlagen. Versucht: " + " | ".join(errors) +
                     "\nLösung: faster-whisper-Modell bereitstellen (siehe SETUP-REELS.md) oder --script text.txt angeben.")
