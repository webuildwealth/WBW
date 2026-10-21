#!/usr/bin/env python3
"""Transkription mit Wortzeitstempeln -> words.json  [{"w","s","e"}]

  transcribe.py video.mp4 -o words.json [--model small] [--lang de]     # faster-whisper (lokal, offline nach Modell-Download)
  transcribe.py --from-srt untertitel.srt -o words.json                 # SRT/VTT importieren (Zeiten je Wort linear verteilt)
  transcribe.py --from-json whisper.json -o words.json                  # Whisper-/Descript-ähnliches JSON importieren

Voraussetzung für die Eigen-Transkription: pip install faster-whisper (+ Modelldownload beim ersten Lauf, benötigt Internet
bzw. HuggingFace-Zugriff; alternativ Modellordner mit --model /pfad/zum/modell angeben).
"""
import argparse, json, re, sys, pathlib


def from_whisper(path, model, lang, device, compute):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("faster-whisper fehlt: pip install faster-whisper   (oder --from-srt / --from-json nutzen)")
    m = WhisperModel(model, device=device, compute_type=compute)
    segs, info = m.transcribe(path, language=lang, word_timestamps=True, vad_filter=True,
                              vad_parameters={"min_silence_duration_ms": 300}, initial_prompt="Finanzen, Altersvorsorge, Berufsunfähigkeitsversicherung, Ärzte, Praxis, Steuern, Netto, Rente.")
    words = []
    for s in segs:
        for w in s.words or []:
            t = w.word.strip()
            if t:
                words.append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3)})
    return words


def ts(x):
    x = x.replace(",", ".")
    p = x.split(":")
    p = [float(i) for i in p]
    while len(p) < 3:
        p.insert(0, 0.0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def from_srt(path):
    txt = pathlib.Path(path).read_text(encoding="utf-8-sig")
    words = []
    for m in re.finditer(r"(\d[\d:.,]+)\s*-->\s*(\d[\d:.,]+)[^\n]*\n(.*?)(?:\n\s*\n|\Z)", txt, re.S):
        s, e = ts(m.group(1)), ts(m.group(2))
        toks = re.sub(r"<[^>]+>", "", m.group(3)).split()
        if not toks:
            continue
        tot = sum(len(t) + 2 for t in toks)
        t = s
        for tok in toks:
            d = (e - s) * (len(tok) + 2) / tot
            words.append({"w": tok, "s": round(t, 3), "e": round(t + d * 0.92, 3)})
            t += d
    return words


def from_json(path):
    d = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if isinstance(d, dict):
        d = d.get("words") or [w for s in d.get("segments", []) for w in s.get("words", [])]
    out = []
    for w in d:
        out.append({"w": (w.get("w") or w.get("word") or w.get("text")).strip(), "s": round(float(w.get("s", w.get("start"))), 3), "e": round(float(w.get("e", w.get("end"))), 3)})
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("video", nargs="?")
    ap.add_argument("-o", "--out", default="words.json")
    ap.add_argument("--model", default="small")
    ap.add_argument("--lang", default="de")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute", default="int8")
    ap.add_argument("--from-srt")
    ap.add_argument("--from-json")
    a = ap.parse_args()
    if a.from_srt:
        w = from_srt(a.from_srt)
    elif a.from_json:
        w = from_json(a.from_json)
    elif a.video:
        w = from_whisper(a.video, a.model, a.lang, a.device, a.compute)
    else:
        ap.error("Video, --from-srt oder --from-json angeben")
    pathlib.Path(a.out).write_text(json.dumps(w, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(w)} Wörter -> {a.out}")
