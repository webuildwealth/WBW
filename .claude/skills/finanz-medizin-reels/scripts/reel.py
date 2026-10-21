#!/usr/bin/env python3
"""Finanz-Medizin Reels: Rohvideo -> fertiges 9:16-Reel mit Hook, Untertiteln, Zahlen, Zoom und CTA.

  reel.py check                                   Werkzeuge prüfen
  reel.py prep <rohvideo> --nr 07 [--crop-x 0.5]  vorbereiten, transkribieren, Takes auflisten
  reel.py takes 07                                Takes noch einmal anzeigen
  reel.py cut 07 [--drop T2,T4] [--drop-range 12.3-15.0] [--gap 0.12]
                                                  Schnittliste: Takes, Details und Pausen raus
  reel.py render-cut 07                           geschnittenes Video rendern (1080x1920, 30 fps)
  reel.py spec 07 --cta RENTE [--format standard|frage|liste|mythos|rechnung]
               [--hook "Zeile 1|*Zeile 2*"] [--script skript.txt] [--items "A|B|C"]
                                                  Einblendungen vorschlagen -> spec.json
  reel.py build 07                                HyperFrames-Projekt aus spec.json bauen
  reel.py preview 07 [--at 1,8,20]                Standbilder zum Prüfen
  reel.py render 07                               fertig/<nr>_<STICHWORT>.mp4 rendern
  reel.py sfx                                     Whoosh-Sounds neu erzeugen

Arbeitsordner: $FM_ROOT, sonst ~/Videos/FinanzMedizin (original/, fertig/, assets/, arbeit/).
Zeiten in spec.json sind Sekunden auf der Zeitleiste des geschnittenen Videos.
"""
import argparse, difflib, html, json, os, re, shutil, subprocess, sys, wave
from pathlib import Path

import numpy as np

SKILL = Path(__file__).resolve().parent.parent
ROOT = Path(os.environ.get("FM_ROOT", "~/Videos/FinanzMedizin")).expanduser()
HF = ["npx", "-y", "hyperframes@0.8.184"]
W, H, FPS, SR = 1080, 1920, 30, 48000
FORMATS = ("standard", "frage", "liste", "mythos", "rechnung")


# --------------------------------------------------------------------------- Hilfen

def run(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], check=True, **kw)


def out(cmd):
    return subprocess.run([str(c) for c in cmd], check=True, capture_output=True, text=True).stdout


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def save(p, obj):
    Path(p).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def work(nr):
    d = ROOT / "arbeit" / str(nr)
    if not d.exists():
        sys.exit(f"Kein Arbeitsordner für Reel {nr}: erst `reel.py prep <video> --nr {nr}`.")
    return d


def norm(s):
    s = s.lower().replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    return re.sub(r"[^a-z0-9%€]", "", s)


def read_wav(p):
    with wave.open(str(p)) as w:
        n, ch = w.getnframes(), w.getnchannels()
        a = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768
    return a.reshape(-1, ch).mean(1) if ch > 1 else a


def write_wav(p, a):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1 if a.ndim == 1 else a.shape[1]); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())


def probe(path):
    j = json.loads(out(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path]))
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        sys.exit("Die Datei enthält kein Bild.")
    rot = 0
    for sd in v.get("side_data_list") or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    rot = int(v.get("tags", {}).get("rotate", rot))
    w, h = int(v["width"]), int(v["height"])
    if abs(rot) % 180 == 90:
        w, h = h, w
    return {"w": w, "h": h, "fps": v.get("avg_frame_rate"), "dur": float(j["format"].get("duration", 0)),
            "transfer": v.get("color_transfer", ""), "audio": a is not None,
            "v_start": float(v.get("start_time", 0) or 0), "a_start": float((a or {}).get("start_time", 0) or 0)}


# --------------------------------------------------------------------------- check

def cmd_check(a):
    ok = True

    def line(good, what, fix=""):
        nonlocal ok
        ok &= good
        print(("OK     " if good else "FEHLT  ") + what + ("" if good else f"\n       -> {fix}"))

    line(bool(shutil.which("ffmpeg") and shutil.which("ffprobe")), "ffmpeg und ffprobe", "Mac: brew install ffmpeg")
    node = shutil.which("node")
    major = int(out(["node", "-v"]).strip().lstrip("v").split(".")[0]) if node else 0
    line(major >= 22, f"Node.js 22 oder neuer (gefunden: {major or 'keins'})", "Mac: brew install node")
    if major < 22:
        sys.exit(1)
    doc = subprocess.run(HF + ["doctor", "--json"], capture_output=True, text=True)
    try:
        checks = {c["name"]: c["ok"] for c in json.loads(doc.stdout)["checks"]}
    except (ValueError, KeyError):
        checks = {}
    line(checks.get("Chrome", False), "Chrome für HyperFrames", " ".join(HF) + " browser ensure")
    try:
        models = json.loads(out(HF + ["models", "list", "--json"]))["models"]
    except (subprocess.CalledProcessError, ValueError, KeyError):
        models = []
    line(any(m.get("engine") == "parakeet" and m.get("installed") for m in models),
         "Spracherkennung Parakeet (Deutsch, Wortzeiten)",
         " ".join(HF) + " models install parakeet   (ohne Hugging Face: siehe SKILL.md, Abschnitt Einrichtung)")
    line(all((SKILL / "assets/sfx" / f).exists() for f in ("whoosh.wav", "whoosh-soft.wav")), "Whoosh-Sounds",
         f"python3 {Path(__file__)} sfx")
    print(f"Arbeitsordner: {ROOT}")
    sys.exit(0 if ok else 1)


# --------------------------------------------------------------------------- prep

def cmd_prep(a):
    raw = Path(a.raw).expanduser().resolve()
    if not raw.exists():
        sys.exit(f"Datei nicht gefunden: {raw}")
    for d in ("original", "fertig", "assets", "arbeit"):
        (ROOT / d).mkdir(parents=True, exist_ok=True)
    src = ROOT / "original" / raw.name
    if not src.exists():
        shutil.copy2(raw, src)                      # das Original selbst wird nie verändert
    wd = ROOT / "arbeit" / str(a.nr)
    wd.mkdir(parents=True, exist_ok=True)
    info = probe(src)
    if not info["audio"]:
        sys.exit("Das Video hat keine Tonspur.")

    # 9:16-Ausschnitt; HDR-Aufnahmen (iPhone: HLG/PQ) vorher auf SDR umrechnen
    vf = []
    if info["transfer"] in ("arib-std-b67", "smpte2084"):
        vf.append("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
                  "zscale=t=bt709:m=bt709:r=tv")
    if info["w"] / info["h"] > 9 / 16 + 0.01:
        vf.append(f"crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)*{a.crop_x}:0")
    vf.append(f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}")
    vf.append(f"fps={FPS},format=yuv420p")
    print(f"Video: {info['w']}x{info['h']}, {info['fps']} fps, {info['dur']:.1f} s"
          + (", HDR -> SDR" if info["transfer"] in ("arib-std-b67", "smpte2084") else ""))
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-map", "0:v:0", "-vf", ",".join(vf),
         "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-an", wd / "norm.mp4"])

    # Ton als 48-kHz-Mono, Versatz zwischen Bild- und Tonspur ausgleichen
    off = info["a_start"] - info["v_start"]
    af = (["-af", f"adelay={int(round(off * 1000))}:all=1"] if off > 0.002 else
          ["-af", f"atrim=start={-off:.4f},asetpts=PTS-STARTPTS"] if off < -0.002 else [])
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-map", "0:a:0", *af, "-ac", "1", "-ar", SR, "-c:a", "pcm_s16le",
         wd / "a48.wav"])
    run(["ffmpeg", "-v", "error", "-y", "-i", wd / "a48.wav", "-ar", "16000", wd / "a16.wav"])
    run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", wd / "norm.mp4", "-frames:v", "1", "-vf", "scale=540:960",
         wd / "still.jpg"])

    transcribe(wd)
    x = read_wav(wd / "a48.wav")
    hop = SR // 100                                  # Lautstärke je 10 ms in dBFS
    m = len(x) // hop
    rms = 20 * np.log10(np.sqrt((x[:m * hop].reshape(m, hop) ** 2).mean(1)) + 1e-9)
    np.save(wd / "rms.npy", np.convolve(rms, np.ones(3) / 3, "same"))
    refine_edges(wd)
    save(wd / "meta.json", {"nr": str(a.nr), "raw": str(src), "probe": info, "crop_x": a.crop_x})
    print_takes(make_takes(wd))
    print(f"\nStandbild zum Prüfen des Ausschnitts: {wd / 'still.jpg'}")


def transcribe(wd):
    tx = wd / "tx"
    tx.mkdir(exist_ok=True)
    r = subprocess.run(HF + ["transcribe", str(wd / "a16.wav"), "--language", "de", "--json", "-d", str(tx)],
                       capture_output=True, text=True)
    if r.returncode != 0 or not (tx / "transcript.json").exists():
        print(r.stdout[-1500:], r.stderr[-1500:])
        sys.exit("Transkription fehlgeschlagen. `reel.py check` zeigt, was fehlt. Ohne Spracherkennung: "
                 "Untertitel aus dem Skript (siehe SKILL.md).")
    words = [{"w": x["text"].strip(), "s": round(float(x["start"]), 3), "e": round(float(x["end"]), 3)}
             for x in load(tx / "transcript.json") if x.get("text", "").strip()]
    save(wd / "words.json", words)
    print(f"Transkript: {len(words)} Wörter")


def refine_edges(wd):
    """Wortränder an der Lautstärke ausrichten: die Zeitstempel der Spracherkennung sind auf 80 ms gerastert
    und laufen oft bis zum nächsten Wort. rs/re sind die hörbaren Grenzen, nichts wird abgeschnitten."""
    words, rms = load(wd / "words.json"), np.load(wd / "rms.npy")
    dur = len(rms) / 100
    voiced = rms[rms > -80]
    thr = float(np.clip(np.percentile(voiced, 90) - 32, -55, -38)) if len(voiced) else -45
    loud = lambda t: rms[min(len(rms) - 1, max(0, int(t * 100)))] > thr
    for w in words:
        s, e = w["s"], w["e"]
        t, lim = s, min(s + 0.3, e - 0.05)           # Einsatz liegt in der Stille: vor bis zum Einsatz
        while t < lim and not loud(t):
            t += 0.01
        lim = max(0.0, t - 0.12)                     # Anlaut (f, s, h) nicht abschneiden
        while t > lim and loud(t - 0.01):
            t -= 0.01
        u, lim = e, max(e - 0.3, s + 0.05)           # Ende liegt in der Stille: zurück bis zum Ende
        while u > lim and not loud(u - 0.01):
            u -= 0.01
        lim = min(dur, u + 0.22)                     # Ausklang mitnehmen
        while u < lim and loud(u):
            u += 0.01
        w["rs"], w["re"] = round(t, 3), round(max(u, t + 0.05), 3)
    save(wd / "words.json", words)


def make_takes(wd, pause=0.6):
    words = load(wd / "words.json")
    takes, cur = [], []
    for i, w in enumerate(words):
        gap = w.get("rs", w["s"]) - words[i - 1].get("re", words[i - 1]["e"]) if i else 0
        if cur and (gap >= pause or (words[i - 1]["w"][-1:] in ".?!" and gap >= 0.25)):
            takes.append(cur)
            cur = []
        cur.append(i)
    if cur:
        takes.append(cur)
    res = []
    for k, idx in enumerate(takes):
        text = " ".join(words[i]["w"] for i in idx)
        res.append({"id": f"T{k + 1}", "s": words[idx[0]]["s"], "e": words[idx[-1]]["e"], "i0": idx[0], "i1": idx[-1],
                    "text": text})
    # Hinweis auf Wiederholungen: ein Take, der wie der nächste beginnt, ist meist ein verworfener Versuch
    for k in range(len(res) - 1):
        A, B = res[k]["text"].split(), res[k + 1]["text"].split()
        n = min(len(A), len(B), 6)
        if n >= 2 and difflib.SequenceMatcher(None, [norm(x) for x in A[:n]], [norm(x) for x in B[:n]]).ratio() >= 0.6:
            res[k]["repeat_of"] = res[k + 1]["id"]
    save(wd / "takes.json", res)
    return res


def print_takes(takes):
    print("\nTakes (getrennt an Pausen ab 0,6 s):")
    for t in takes:
        hint = f"   <- ähnlich wie {t['repeat_of']}, vermutlich verworfen" if t.get("repeat_of") else ""
        print(f"  {t['id']:>4}  {t['s']:6.2f}-{t['e']:6.2f} s  {t['text']}{hint}")


def cmd_takes(a):
    print_takes(load(work(a.nr) / "takes.json"))


# --------------------------------------------------------------------------- cut

def parse_ranges(items):
    res = []
    for r in items or []:
        for part in r.split(","):
            if part.strip():
                s, e = part.split("-")
                res.append((float(s), float(e)))
    return res


def cmd_cut(a):
    wd = work(a.nr)
    words, takes = load(wd / "words.json"), load(wd / "takes.json")
    dur = len(read_wav(wd / "a48.wav")) / SR
    drop = set()
    for tid in [t.strip().upper() for t in (a.drop or "").split(",") if t.strip()]:
        t = next((x for x in takes if x["id"] == tid), None)
        if t is None:
            sys.exit(f"Take {tid} gibt es nicht (siehe `reel.py takes {a.nr}`).")
        drop.update(range(t["i0"], t["i1"] + 1))
    for s, e in parse_ranges(a.drop_range):
        drop.update(i for i, w in enumerate(words) if s <= (w["s"] + w["e"]) / 2 <= e)
    keep_r = parse_ranges(a.keep_range)
    if keep_r:
        drop.update(i for i, w in enumerate(words) if not any(s <= (w["s"] + w["e"]) / 2 <= e for s, e in keep_r))
    kept = [i for i in range(len(words)) if i not in drop]
    if not kept:
        sys.exit("Nach dem Schnitt bleibt nichts übrig.")

    # Wortränder an der Lautstärke ausrichten, damit nichts abgeschnitten wird
    segs, prev = [], None
    for i in kept:
        s, e = words[i].get("rs", words[i]["s"]), words[i].get("re", words[i]["e"])
        if segs and prev == i - 1 and s - segs[-1][1] <= a.gap:
            segs[-1][1] = max(segs[-1][1], e)
        else:
            segs.append([s, e])
        prev = i
    keeps = []
    for k, (s, e) in enumerate(segs):
        s -= 0.06 if k == 0 else a.pad_in
        e += 0.14 if k == len(segs) - 1 else a.pad_out
        keeps.append([round(max(0.0, s) * FPS) / FPS, round(min(dur, e) * FPS) / FPS])
    merged = []
    for s, e in keeps:
        if merged and s <= merged[-1][1] + 0.5 / FPS:
            merged[-1][1] = max(merged[-1][1], e)
        elif e - s >= 1.5 / FPS:
            merged.append([s, e])
    total = sum(e - s for s, e in merged)
    save(wd / "edl.json", {"keeps": merged, "dur": round(total, 3), "dropped": sorted(drop), "gap": a.gap})
    print(f"Roh {dur:.1f} s -> Schnitt {total:.1f} s, {len(merged)} Stücke, {len(drop)} Wörter entfernt\n")
    print("Text nach dem Schnitt:\n  " + " ".join(words[i]["w"] for i in kept))
    if total > 45:
        print(f"\nACHTUNG: {total:.1f} s ist länger als 45 s. Weitere Details streichen (--drop-range).")
    if total < 10:
        print(f"\nACHTUNG: {total:.1f} s ist kürzer als 10 s.")


def cmd_render_cut(a):
    wd = work(a.nr)
    E, words = load(wd / "edl.json"), load(wd / "words.json")
    keeps = E["keeps"]
    # Bild: Frames aus dem 30-fps-Zwischenvideo wählen, in Blöcken (select wird bei sehr vielen Bereichen langsam)
    lst = wd / "parts.txt"
    with open(lst, "w") as L:
        for k in range(0, len(keeps), 40):
            sel = "+".join(f"between(n,{round(s * FPS)},{round(e * FPS) - 1})" for s, e in keeps[k:k + 40])
            p = wd / f"part{k // 40:03d}.mp4"
            run(["ffmpeg", "-v", "error", "-y", "-i", wd / "norm.mp4", "-vf", f"select='{sel}',setpts=N/FRAME_RATE/TB",
                 "-r", FPS, "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", "-an", p])
            L.write(f"file '{p.name}'\n")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", wd / "cut_v.mp4"])
    # Ton: Stücke mit 6 ms Blende aneinandersetzen, damit an den Schnitten nichts knackt
    x = read_wav(wd / "a48.wav")
    ramp = np.linspace(0, 1, int(0.006 * SR), dtype=np.float32)
    pieces = []
    for s, e in keeps:
        c = x[round(s * SR):round(e * SR)].copy()
        if len(c) > 2 * len(ramp):
            c[:len(ramp)] *= ramp
            c[-len(ramp):] *= ramp[::-1]
        pieces.append(c)
    write_wav(wd / "cut.wav", np.concatenate(pieces))
    run(["ffmpeg", "-v", "error", "-y", "-i", wd / "cut_v.mp4", "-i", wd / "cut.wav", "-map", "0:v", "-map", "1:a",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", wd / "cut.mp4"])
    for p in wd.glob("part*.mp4"):
        p.unlink()

    # Wortzeiten und Schnittstellen auf die Zeitleiste des Schnitts übertragen
    starts, acc = [], 0.0
    for s, e in keeps:
        starts.append(acc)
        acc += e - s
    wc, dropped = [], set(E["dropped"])
    for i, w in enumerate(words):
        if i in dropped:
            continue
        ws, we = w.get("rs", w["s"]), w.get("re", w["e"])   # hörbare Grenzen, wie beim Schnitt
        mid = (ws + we) / 2
        for (s, e), c0 in zip(keeps, starts):
            if s <= mid <= e:
                wc.append({"w": w["w"], "s": round(c0 + max(0.0, ws - s), 3), "e": round(c0 + min(e - s, we - s), 3)})
                break
    cuts = [{"t": round(starts[k], 3), "removed": round(keeps[k][0] - keeps[k - 1][1], 3)} for k in range(1, len(keeps))]
    save(wd / "words_cut.json", wc)
    save(wd / "cuts.json", cuts)
    print(f"Schnitt gerendert: {wd / 'cut.mp4'} ({acc:.1f} s, {len(cuts)} Schnitte)")


# --------------------------------------------------------------------------- spec

def align_to_script(words, script):
    """Schreibweise aus dem Skript übernehmen (Fachbegriffe, Zahlen), Zeiten aus der Spracherkennung behalten."""
    toks = [t for t in re.split(r"\s+", re.sub(r"\[.*?\]|#.*", " ", script)) if norm(t)]
    A, B = [norm(w["w"]) for w in words], [norm(t) for t in toks]
    res = []
    for op, i0, i1, j0, j1 in difflib.SequenceMatcher(None, A, B, autojunk=False).get_opcodes():
        if op == "equal" or (op == "replace" and i1 - i0 == j1 - j0):
            for k in range(i1 - i0):
                res.append({**words[i0 + k], "w": toks[j0 + k]})
        elif op == "replace" and 0 < j1 - j0 <= 3 and i1 - i0 <= 6:
            s, e = words[i0]["s"], words[i1 - 1]["e"]       # z. B. "dreißigtausend Euro" -> "30.000 €"
            step = (e - s) / (j1 - j0)
            for k in range(j1 - j0):
                res.append({"w": toks[j0 + k], "s": round(s + k * step, 3), "e": round(s + (k + 1) * step, 3)})
        elif op in ("replace", "delete"):
            res.extend(words[i0:i1])                         # gesprochen, aber nicht im Skript: so lassen
    return res


NUM = re.compile(r"^\d[\d.,]*$|^\d[\d.,]*(%|€)$")
UNIT = {"prozent": "%", "%": "%", "euro": "€", "€": "€"}


def mark_numbers(text):
    return re.sub(r"(?<![*\w])(\d[\d.,]*\s?(?:%|€|Prozent|Euro)?)(?![*\w])", r"*\1*", text)


def join_units(words):
    """Zahl und Einheit bleiben zusammen: "960" + "€" -> "960 €" (auch Prozent, Euro)."""
    res = []
    for w in words:
        if res and norm(w["w"]) in UNIT and re.search(r"\d", res[-1]["w"]) and not res[-1]["w"][-1:] in ".?!":
            res[-1] = {**res[-1], "w": f'{res[-1]["w"]} {w["w"]}', "e": w["e"]}
        else:
            res.append(dict(w))
    return res


def phrase(words):
    caps, cur = [], []
    for w in join_units(words):
        if cur:
            prev = cur[-1]["w"]
            chars = sum(len(x["w"]) + 1 for x in cur) + len(w["w"])
            if (prev[-1:] in ".?!:" or (prev[-1:] in ",;" and len(cur) >= 2) or len(cur) >= 4
                    or (chars > 22 and len(cur) >= 2) or w["s"] - cur[-1]["e"] > 0.45):
                caps.append(cur)
                cur = []
        cur.append(w)
    if cur:
        caps.append(cur)
    for k in range(len(caps) - 1):                       # "sind das 960 € im" / "Jahr" -> "sind das 960 €" / "im Jahr"
        if len(caps[k + 1]) == 1 and len(caps[k]) >= 3 and caps[k][-1]["w"][-1:] not in ".?!:,;":
            caps[k + 1].insert(0, caps[k].pop())
    merged = []                                          # einzelne kurze Wörter an die Nachbarn hängen
    for c in caps:
        if merged and len(c) == 1 and len(merged[-1]) <= 3 and merged[-1][-1]["w"][-1:] not in ".?!" \
                and len(c[0]["w"]) <= 8:
            merged[-1] = merged[-1] + c
        else:
            merged.append(c)
    res = []
    for k, c in enumerate(merged):
        nxt = merged[k + 1][0]["s"] if k + 1 < len(merged) else c[-1]["e"] + 0.4
        text = re.sub(r"[.,;:–-]+$", "", " ".join(x["w"] for x in c))
        res.append({"start": round(c[0]["s"], 3), "end": round(min(nxt, c[-1]["e"] + 0.5), 3), "text": mark_numbers(text)})
    return res


def sentences(words):
    res, cur = [], []
    for w in words:
        cur.append(w)
        if w["w"][-1:] in ".?!":
            res.append(cur)
            cur = []
    if cur:
        res.append(cur)
    return res


def wrap_lines(text, width=16, max_lines=3):
    if "|" in text:
        return [x.strip() for x in text.split("|") if x.strip()]
    lines, cur = [], ""
    for wd in text.split():
        if cur and len(cur) + 1 + len(wd.strip("*")) > width and len(lines) < max_lines - 1:
            lines.append(cur)
            cur = wd
        else:
            cur = f"{cur} {wd}".strip()
    return lines + [cur] if cur else lines


def number_value(words, i):
    tok, nxt = words[i]["w"], (words[i + 1]["w"] if i + 1 < len(words) else "")
    core = re.sub(r"[^\d.,%€]", "", tok)
    unit = UNIT.get(norm(nxt)) or UNIT.get(core[-1:]) or ""
    core = core.rstrip("%€").rstrip(".,")
    value = f"{core} {unit}".strip()
    num = core.replace(".", "").replace(",", ".")
    try:
        x = float(num)
    except ValueError:
        return value, None
    dec = len(core.split(",")[1]) if "," in core else 0
    return value, {"to": x, "dec": dec, "suffix": f" {unit}" if unit else ""}


def cmd_spec(a):
    wd = work(a.nr)
    if a.format not in FORMATS:
        sys.exit(f"Format unbekannt. Möglich: {', '.join(FORMATS)}")
    words, cuts = load(wd / "words_cut.json"), load(wd / "cuts.json")
    dur = load(wd / "edl.json")["dur"]
    if a.script:
        words = align_to_script(words, Path(a.script).expanduser().read_text(encoding="utf-8"))
    sent = sentences(words)
    first = " ".join(w["w"] for w in sent[0]) if sent else ""
    hook_end = round(min(3.0, max(2.0, sent[0][-1]["e"] if sent else 2.6)), 2)
    S = {"nr": str(a.nr), "format": a.format, "duration": dur, "origin": "50% 38%", "jumpcut_zoom": True}

    hook_text = a.hook or re.sub(r"[.,]$", "", first)
    if a.format == "frage":
        S["question"] = {"start": 0.0, "end": hook_end, "label": "Frage aus der Praxis", "text": hook_text}
    else:
        S["hook"] = {"start": 0.0, "end": hook_end, "lines": wrap_lines(hook_text)}
    caps = phrase(words)
    if difflib.SequenceMatcher(None, norm(hook_text), norm(first)).ratio() > 0.5:
        caps = [c for c in caps if c["start"] >= hook_end - 0.05]  # der Hook zeigt den ersten Satz schon
    S["captions"] = caps

    # Zahlen: höchstens drei, mit Abstand (bei Rechnungen dichter)
    nums, last, gap = [], -9.0, 1.5 if a.format == "rechnung" else 3.0
    for i, w in enumerate(words):
        if NUM.match(w["w"].strip(".,")) and w["s"] >= hook_end and w["s"] - last >= gap and len(nums) < 3:
            value, count = number_value(words, i)
            hold = 2.0 if a.format == "rechnung" else 1.3
            n = {"start": round(max(0.0, w["s"] - 0.05), 2), "end": round(min(dur, w["s"] + hold), 2), "value": value,
                 "label": ""}
            if count and (a.format == "rechnung" or count["to"] >= 100):
                n["count"] = count
            nums.append(n)
            last = w["s"]
    S["numbers"] = nums

    # CTA im letzten Satz, mindestens 2,5 s sichtbar
    cta_start = sent[-1][0]["s"] if sent else dur - 3
    S["cta"] = {"start": round(max(0.0, min(cta_start, dur - 2.5)), 2), "keyword": a.cta.upper(),
                "top": a.cta_top, "sub": a.cta_sub or "", "logo": a.logo}

    if a.format == "liste":
        titles = [x.strip() for x in (a.items or "").split("|") if x.strip()] or ["Punkt 1", "Punkt 2", "Punkt 3"]
        marks = [s[0]["s"] for s in sent if re.match(r"(erstens|zweitens|drittens|viertens|fuenftens|erster|zweiter|dritter|"
                                                       r"nummer|punkt|fehler|tipp)", norm(s[0]["w"]))]
        t0, t1 = hook_end, S["cta"]["start"]
        if len(marks) < len(titles):
            marks = [round(t0 + k * (t1 - t0) / len(titles), 2) for k in range(len(titles))]
        marks = marks[:len(titles)] + [t1]
        S["items"] = [{"start": round(marks[k], 2), "end": round(min(marks[k] + 2.2, marks[k + 1] - 0.05), 2), "n": k + 1,
                       "of": len(titles), "title": titles[k]} for k in range(len(titles))]
    if a.format == "mythos":
        mid = round(hook_end + (S["cta"]["start"] - hook_end) / 2, 2)
        S["myth"] = [{"start": hook_end, "end": round(min(hook_end + 3, mid), 2), "kind": "mythos",
                      "text": a.mythos or "Mythos …"},
                     {"start": mid, "end": round(min(mid + 3, S["cta"]["start"]), 2), "kind": "fakt",
                      "text": a.fakt or "Fakt …"}]

    S["zooms"] = [{"start": 0.0, "end": hook_end, "scale": 1.08, "ease": "none"}] + \
                 [{"start": n["start"], "end": n["end"], "scale": 1.14} for n in nums]
    S["cuts"] = [c["t"] for c in cuts if c["removed"] >= 0.35]
    sfx = [0.0] if (S.get("hook") or S.get("question")) else []
    sfx += [n["start"] - 0.05 for n in nums] + [x["start"] - 0.05 for x in S.get("items", [])]
    sfx += [x["start"] - 0.05 for x in S.get("myth", [])] + [S["cta"]["start"] - 0.05]
    S["sfx"] = []
    for t in sorted(sfx):
        if not S["sfx"] or t - S["sfx"][-1]["at"] >= 0.8:
            S["sfx"].append({"at": round(max(0.0, t), 2), "name": "whoosh"})
    save(wd / "spec.json", S)
    print(f"spec.json geschrieben: {wd / 'spec.json'}")
    print(f"  Hook/Frage bis {hook_end} s, {len(caps)} Untertitel, {len(nums)} Zahlen, CTA ab {S['cta']['start']} s")
    for n in nums:
        print(f"  Zahl {n['value']!r} bei {n['start']} s – Beschriftung (label) ergänzen oder Einblendung löschen")


# --------------------------------------------------------------------------- build

def rich(text):
    """*Wort* -> Hervorhebung (roter Text auf weißem Kasten bzw. Bordeaux im Kasten)."""
    parts = re.split(r"(\*[^*]+\*)", text)
    return "".join(f'<span class="hl">{html.escape(p[1:-1])}</span>' if p.startswith("*") and p.endswith("*")
                   else html.escape(p) for p in parts)


def zoom_events(S):
    """Sprünge an Schnitten (1,00 <-> 1,06) plus weiche Zooms an wichtigen Stellen, zeitlich geordnet."""
    dur, ev, base = S["duration"], [], 1.0
    jumps, lastj = [], -9.0
    for t in S.get("cuts", []) if S.get("jumpcut_zoom", True) else []:
        if t - lastj >= 2.5:
            jumps.append(t)
            lastj = t
    zooms = sorted(S.get("zooms", []), key=lambda z: z["start"])
    marks = sorted([(t, "jump", None) for t in jumps] + [(z["start"], "zin", z) for z in zooms])
    busy_until = -1.0
    for t, kind, z in marks:
        if kind == "jump":
            if t < busy_until:
                continue
            base = 1.06 if base == 1.0 else 1.0
            ev.append({"t": round(t, 3), "scale": base, "dur": 0})
        else:
            end = min(z["end"], dur)
            ev.append({"t": round(z["start"], 3), "scale": z["scale"],
                       "dur": round(min(0.4, max(0.1, end - z["start"])) if z.get("ease") != "none" else end - z["start"], 3),
                       "ease": z.get("ease", "power2.out")})
            ev.append({"t": round(end, 3), "scale": base, "dur": 0.3, "ease": "power2.inOut"})
            busy_until = end + 0.3
    return sorted(ev, key=lambda e: e["t"])


def clip(cid, s, e, anim, inner, track, dur):
    e = min(e, dur)
    return (f'      <div id="{cid}" class="clip ov" data-start="{s:.3f}" data-duration="{max(0.04, e - s):.3f}" '
            f'data-track-index="{track}" data-anim="{anim}">{inner}</div>\n')


def cmd_build(a):
    wd = work(a.nr)
    S = load(wd / "spec.json")
    proj = wd / "hf"
    for d in ("fonts", "sfx"):
        (proj / "assets" / d).mkdir(parents=True, exist_ok=True)
    for f in (SKILL / "assets/fonts").glob("*.woff2"):
        shutil.copy2(f, proj / "assets/fonts" / f.name)
    for f in (SKILL / "assets/sfx").glob("*.wav"):
        shutil.copy2(f, proj / "assets/sfx" / f.name)
    shutil.copy2(SKILL / "assets/vendor/gsap.min.js", proj / "assets/gsap.min.js")
    logo = ROOT / "assets" / "logo-signet.png"        # eigenes Logo im Arbeitsordner hat Vorrang
    shutil.copy2(logo if logo.exists() else SKILL / "assets/img/mark-finanz-medizin.png", proj / "assets/logo.png")
    link = proj / "assets/cut.mp4"
    if link.exists() or link.is_symlink():
        link.unlink()
    shutil.copy2(wd / "cut.mp4", link)
    dur = S["duration"]

    body, tr = "", 10
    if S.get("hook"):
        h = S["hook"]
        lines = "".join(f'<span class="hook-line fit" data-fit-max="960">{rich(x)}</span>' for x in h["lines"])
        body += clip("hook", h["start"], h["end"], "hook", f'<div class="hook-inner">{lines}</div>', 2, dur)
    if S.get("question"):
        q = S["question"]
        inner = (f'<div class="q-inner"><div class="q-card"><div class="q-head"><img src="assets/logo.png" alt="">'
                 f'{html.escape(q.get("label", "Frage aus der Praxis"))}</div><div class="q-text">{rich(q["text"])}</div>'
                 f'</div></div>')
        body += clip("frage", q["start"], q["end"], "question", inner, 2, dur)
    for k, c in enumerate(S.get("captions", [])):
        body += clip(f"ut{k + 1}", c["start"], c["end"], "cap",
                     f'<div class="cap-inner"><span class="cap-text">{rich(c["text"])}</span></div>', tr + k % 2, dur)
    for k, n in enumerate(S.get("numbers", [])):
        cnt = n.get("count")
        val = (f'<span class="count" data-to="{cnt["to"]}" data-from="{cnt.get("from", 0)}" data-dec="{cnt.get("dec", 0)}">'
               f'{html.escape(n["value"])}</span>{html.escape(cnt.get("suffix", ""))}' if cnt else rich(n["value"]))
        lab = f'<span class="num-label">{rich(n["label"])}</span>' if n.get("label") else ""
        body += clip(f"zahl{k + 1}", n["start"], n["end"], "num",
                     f'<div class="num-inner"><span class="num-value fit" data-fit-max="960">{val}</span>{lab}</div>', 3, dur)
    for it in S.get("items", []):
        inner = (f'<div class="item-inner"><div class="item-n">{it["n"]}</div>'
                 f'<span class="item-title fit" data-fit-max="800">{rich(it["title"])}</span></div>')
        body += clip(f"punkt{it['n']}", it["start"], it["end"], "item", inner, 4, dur)
    for k, m in enumerate(S.get("myth", [])):
        kind = "fakt" if m.get("kind") == "fakt" else "mythos"
        strike = '<div class="mf-strike"></div>' if kind == "mythos" and m.get("strike", True) else ""
        inner = (f'<div class="mf-inner"><span class="mf-tag {kind}">{kind.upper()}</span>'
                 f'<div class="mf-box"><span class="mf-text">{rich(m["text"])}</span>{strike}</div></div>')
        body += clip(f"{kind}{k + 1}", m["start"], m["end"], "mf", inner, 4, dur)
    if S.get("cta"):
        c = S["cta"]
        logo_img = '<img src="assets/logo.png" alt="">' if c.get("logo") else ""
        sub = f'<span class="cta-sub">{rich(c["sub"])}</span>' if c.get("sub") else ""
        inner = (f'<div class="cta-inner"><div class="cta-card"><div class="cta-row">{logo_img}'
                 f'<span class="cta-top">{rich(c.get("top", "Kommentiere"))}</span></div>'
                 f'<span class="cta-key fit" data-fit-max="780">{html.escape(c["keyword"])}</span>{sub}</div></div>')
        body += clip("cta", c["start"], dur, "cta", inner, 5, dur)
    audio = ""
    for k, s in enumerate(S.get("sfx", [])):
        f = proj / "assets/sfx" / f"{s.get('name', 'whoosh')}.wav"
        with wave.open(str(f)) as w:
            d = w.getnframes() / w.getframerate()
        audio += (f'      <audio id="sfx{k}" src="assets/sfx/{f.name}" data-start="{s["at"]:.3f}" '
                  f'data-duration="{min(d, dur - s["at"]):.3f}" data-track-index="{20 + k}" '
                  f'data-volume="{s.get("volume", 0.32)}"></audio>\n')

    css = (SKILL / "template/reel.css").read_text(encoding="utf-8")
    engine = (SKILL / "template/engine.js").read_text(encoding="utf-8")
    reel = {"zoom": zoom_events(S)}
    page = f"""<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <title>Finanz-Medizin Reel {html.escape(S["nr"])}</title>
    <script src="assets/gsap.min.js"></script>
    <style>
{css}
      #cam-wrap {{ --origin: {S.get("origin", "50% 38%")}; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="{W}" data-height="{H}" data-duration="{dur:.3f}">
      <div id="cam-wrap">
        <video id="cam" class="clip" src="assets/cut.mp4" playsinline data-has-audio="true" data-start="0" data-duration="{dur:.3f}" data-track-index="0"></video>
      </div>
      <div class="shade"></div>
{body}{audio}    </div>
    <script>
      window.REEL = {json.dumps(reel)};
    </script>
    <script>
{engine}
    </script>
  </body>
</html>
"""
    (proj / "index.html").write_text(page, encoding="utf-8")
    print(f"Projekt gebaut: {proj / 'index.html'}")
    r = subprocess.run(HF + ["lint", str(proj)], capture_output=True, text=True)
    print(re.sub(r"\x1b\[[0-9;]*m", "", (r.stdout + r.stderr)).strip()[-1200:])


# --------------------------------------------------------------------------- preview / render

def cmd_preview(a):
    wd = work(a.nr)
    proj = wd / "hf"
    shots = wd / "preview"
    shots.mkdir(exist_ok=True)
    r = subprocess.run(HF + ["snapshot", str(proj), "--at", a.at, "--no-end", "--keep", "-o", str(shots)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(re.sub(r"\x1b\[[0-9;]*m", "", r.stdout + r.stderr)[-1500:])
        sys.exit("Standbilder fehlgeschlagen.")
    for t in a.at.split(","):
        f = shots / f"at-{float(t):g}s.png"
        print(f if f.exists() else f"(fehlt: {f.name})")


def cmd_render(a):
    wd = work(a.nr)
    S = load(wd / "spec.json")
    proj, master = wd / "hf", wd / "master.mp4"
    r = subprocess.run(HF + ["render", str(proj), "-o", str(master), "--fps", str(FPS), "--crf", "12"],
                       capture_output=True, text=True)
    log = re.sub(r"\x1b\[[0-9;]*m", "", r.stdout + r.stderr)
    if r.returncode != 0 or not master.exists():
        print(log[-2500:])
        sys.exit("Render fehlgeschlagen.")
    key = re.sub(r"[^\wÄÖÜäöüß-]+", "", S.get("cta", {}).get("keyword", "")) or "REEL"
    dst, v = ROOT / "fertig" / f"{a.nr}_{key}.mp4", 2
    while dst.exists():
        dst, v = ROOT / "fertig" / f"{a.nr}_{key}_v{v}.mp4", v + 1
    dst.parent.mkdir(parents=True, exist_ok=True)
    # Lautheit in zwei Durchgängen auf -14 LUFS / -1 dBTP angleichen
    m = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(master), "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True).stderr
    j = json.loads(m[m.rindex("{"):m.rindex("}") + 1])
    ln = (f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
          f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    run(["ffmpeg", "-v", "error", "-y", "-i", master, "-af", f"{ln},aresample={SR}", "-c:v", "libx264", "-preset", "slow",
         "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", FPS, "-c:a", "aac", "-b:a", "256k",
         "-movflags", "+faststart", dst])
    d = float(out(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]).strip())
    mb = dst.stat().st_size / 1e6
    print(f"Fertig: {dst}  ({d:.1f} s, {mb:.1f} MB)")
    if mb > 29:                                       # Chat-Anhänge sind auf etwa 30 MB begrenzt
        phone = dst.with_name(dst.stem + "_handy.mp4")
        br = int(min(8000, 25 * 8000 / d - 192))
        run(["ffmpeg", "-v", "error", "-y", "-i", dst, "-c:v", "libx264", "-preset", "slow", "-b:v", f"{br}k",
             "-maxrate", f"{int(br * 1.3)}k", "-bufsize", f"{br * 2}k", "-c:a", "copy", "-movflags", "+faststart", phone])
        print(f"Kleinere Kopie zum Verschicken: {phone} ({phone.stat().st_size / 1e6:.1f} MB)")


# --------------------------------------------------------------------------- sfx

def whoosh(dur, f0, f1, seed, peak_at=0.62, bright=1.0):
    """Gefiltertes Rauschen mit Frequenz- und Lautstärkeverlauf, wandert von links nach rechts."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    env = np.where(t < peak_at, (t / peak_at) ** 2.2, np.exp(-((t - peak_at) / (1 - peak_at)) * 4.5))
    fc = f0 * (f1 / f0) ** np.where(t < peak_at, t / peak_at, 1 - (t - peak_at) / (1 - peak_at) * 0.6)
    x = rng.standard_normal(n)
    y = np.zeros(n)
    low = band = 0.0
    q = 0.7
    for i in range(n):                               # Zustandsvariablenfilter, Bandpass mit wanderndem Zentrum
        f = 2 * np.sin(np.pi * min(fc[i], SR / 6) / SR)
        low += f * band
        high = x[i] - low - q * band
        band += f * high
        y[i] = band * bright + low * 0.25
    y *= env
    pan = np.clip(t * 1.2 - 0.1, 0, 1)
    st = np.stack([y * np.cos(pan * np.pi / 2), y * np.sin(pan * np.pi / 2)], 1)
    return st / np.abs(st).max() * 10 ** (-3 / 20)


def cmd_sfx(a):
    d = SKILL / "assets/sfx"
    d.mkdir(parents=True, exist_ok=True)
    write_wav(d / "whoosh.wav", whoosh(0.55, 350, 3600, seed=7))
    write_wav(d / "whoosh-soft.wav", whoosh(0.45, 250, 1800, seed=11, bright=0.8) * 0.7)
    print(f"Whoosh-Sounds geschrieben: {d}")


# --------------------------------------------------------------------------- main

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    sp.add_parser("check").set_defaults(fn=cmd_check)
    x = sp.add_parser("prep"); x.add_argument("raw"); x.add_argument("--nr", required=True)
    x.add_argument("--crop-x", type=float, default=0.5, help="Querformat: Bildausschnitt 0 (links) bis 1 (rechts)")
    x.set_defaults(fn=cmd_prep)
    x = sp.add_parser("takes"); x.add_argument("nr"); x.set_defaults(fn=cmd_takes)
    x = sp.add_parser("cut"); x.add_argument("nr"); x.add_argument("--drop", default="", help="Takes, z. B. T2,T4")
    x.add_argument("--drop-range", action="append", help="Rohzeit von-bis in s, z. B. 12.3-15.0 (mehrfach möglich)")
    x.add_argument("--keep-range", action="append", help="nur diese Rohzeiten behalten")
    x.add_argument("--gap", type=float, default=0.12, help="Pausen über diesem Wert (s) werden geschnitten")
    x.add_argument("--pad-in", type=float, default=0.03); x.add_argument("--pad-out", type=float, default=0.045)
    x.set_defaults(fn=cmd_cut)
    x = sp.add_parser("render-cut"); x.add_argument("nr"); x.set_defaults(fn=cmd_render_cut)
    x = sp.add_parser("spec"); x.add_argument("nr"); x.add_argument("--cta", required=True)
    x.add_argument("--format", default="standard"); x.add_argument("--hook"); x.add_argument("--script")
    x.add_argument("--cta-top", default="Kommentiere"); x.add_argument("--cta-sub", default="")
    x.add_argument("--logo", action="store_true", help="Signet im CTA-Kasten zeigen")
    x.add_argument("--items", help="Liste: Titel mit | getrennt"); x.add_argument("--mythos"); x.add_argument("--fakt")
    x.set_defaults(fn=cmd_spec)
    x = sp.add_parser("build"); x.add_argument("nr"); x.set_defaults(fn=cmd_build)
    x = sp.add_parser("preview"); x.add_argument("nr"); x.add_argument("--at", default="1,5,10"); x.set_defaults(fn=cmd_preview)
    x = sp.add_parser("render"); x.add_argument("nr"); x.set_defaults(fn=cmd_render)
    sp.add_parser("sfx").set_defaults(fn=cmd_sfx)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
