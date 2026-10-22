#!/usr/bin/env python3
"""TALKING-HEAD-EDITOR - Rohvideo rein, fertiges Reel raus. Kein JSON-Bearbeiten noetig.

  python3 talking_head.py mein_rohvideo.mov --out ./out/reel1
      [--zoom subtle|strong|off] [--music none|bed|<datei>] [--no-cut] [--plan-only] [--plan plan.json] [--workers 4]

Ablauf: Transkription (offline, Parakeet) -> Jump-Cuts aus Sprechpausen -> 9:16-Smart-Crop ums Gesicht ->
Gesicht/Personen-Analyse -> automatische Szenenplanung (Typ, Text, Timing, Ebene, Position) -> Freistellung + Zooms ->
Overlays in zwei Ebenen (hinter / vor der Person) -> Untertitel + Sounddesign -> Composite -> MP4 1080x1920 + QA.
--plan-only stoppt nach der Planung (plan.json + plan.md zur Pruefung); --plan nutzt einen geprueften/angepassten Plan."""
import argparse, json, shutil, subprocess, sys, time
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent; SKILL = HERE.parent
sys.path.insert(0, str(HERE))
import asr, vision, planner, sfx  # noqa: E402
from scipy.io import wavfile  # noqa: E402

def log(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def retakes(words):
    """Verworfene Takes: Satz/Satzanfang wird direkt danach aehnlich neu begonnen -> ersten Versuch entfernen.
    Rueckgabe: Indizes der zu entfernenden Woerter + Beschreibung."""
    import difflib
    sents, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if w["w"][-1:] in ".!?" or (nxt and nxt["t0"] - w["t1"] > 0.7): sents.append(cur); cur = []
    if cur: sents.append(cur)
    txt = lambda idx: [planner.norm(words[i]["w"]) for i in idx]
    drop, notes = set(), []
    for a, b in zip(sents, sents[1:]):
        ta, tb = txt(a), txt(b)
        if len(ta) < 3: continue
        head = difflib.SequenceMatcher(None, ta, tb[:len(ta)], autojunk=False).ratio()      # Anfang wiederholt?
        if head >= 0.7 and len(tb) >= len(ta) * 0.8:
            drop.update(a); notes.append(" ".join(words[i]["w"] for i in a))
    return drop, notes

def cut_segments(words, dur, max_gap=0.45, pre=0.12, post=0.18):
    """Sprechpausen > max_gap entfernen (Jump-Cuts). Rueckgabe: Segmente im Original + Wort-Timings im neuen Zeitstrahl."""
    if not words: return [(0, dur)], []
    segs = []; a = max(0, words[0]["t0"] - pre)
    for w, n in zip(words, words[1:]):
        if n["t0"] - w["t1"] > max_gap: segs.append((a, w["t1"] + post)); a = n["t0"] - pre
    segs.append((a, min(dur, words[-1]["t1"] + 0.45)))
    out, off = [], 0.0
    for s0, s1 in segs:
        for w in words:
            if s0 <= w["t0"] < s1: out.append({"w": w["w"], "t0": round(off + w["t0"] - s0, 3), "t1": round(off + min(w["t1"], s1) - s0, 3)})
        off += s1 - s0
    return [(round(a, 3), round(b, 3)) for a, b in segs], out

def plan_md(p):
    L = ["# Automatischer Schnittplan", "", *[f"- {n}" for n in p["notes"]], "", "| Zeit | Typ | Ebene | Inhalt | Begruendung |", "|---|---|---|---|---|"]
    for o in p["overlays"]:
        d = o["data"]; txt = d.get("title") or d.get("text") or d.get("claim") or d.get("label") or d.get("motif") or " ".join(w["w"] for w in d.get("words", [])) or ""
        if o["type"] in ("number", "ring"): txt = f"{d['v']:g} {d.get('unit', '')} · {d.get('label', '')}"
        if o["type"] == "bars": txt = " / ".join(b["label"] for b in d["bars"])
        L.append(f"| {o['t0']:.1f}–{o['t1']:.1f} s | {o['type']} | {'hinter Person' if o['layer'] == 'back' else 'vor Person'} | {txt} | {o.get('why', '')} |")
    L += ["", "## Transkript", ""] + [f"- **{s['t0']:.1f} s** {s['text']}" for s in p["sentences"]]
    return "\n".join(L)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--out", required=True)
    ap.add_argument("--zoom", default="subtle", choices=["subtle", "strong", "off"]); ap.add_argument("--music", default="none")
    ap.add_argument("--script", help="Skript (Text/Markdown): korrigiert Schreibweise von Fachbegriffen, Namen, Zahlen"); ap.add_argument("--hdr", default="mobius", choices=["mobius", "clip", "hable", "aus"], help="iPhone-HDR -> SDR Tonemapping"); ap.add_argument("--cta", help="CTA-Wort fuer Kommentare, z.B. Vorsorge"); ap.add_argument("--no-cut", action="store_true"); ap.add_argument("--plan-only", action="store_true"); ap.add_argument("--plan"); ap.add_argument("--workers", default="4"); ap.add_argument("--images", help="Ordner mit eigenen/lizenzierten Bildern (Dateiname = Motiv oder Stichwort)")
    a = ap.parse_args()
    out = Path(a.out); work = out / "work"; work.mkdir(parents=True, exist_ok=True); src = Path(a.video).resolve(); T0 = time.time()
    vision.HDR_MODE = a.hdr
    info = vision.probe(src); log(f"Rohvideo: {info['w']}x{info['h']}, {info['dur']:.1f} s, {info['codec']}" + (f", HDR ({info['transfer'] or 'Dolby Vision'}) -> wird nach SDR BT.709 umgerechnet" if info["hdr"] else ""))

    # 1) Transkription
    wraw = work / "words_raw.json"
    if not wraw.exists():
        log("Transkribiere (Parakeet TDT v3, offline) ..."); wraw.write_text(json.dumps(asr.transcribe(src), ensure_ascii=False))
    words_raw = json.loads(wraw.read_text()); log(f"{len(words_raw)} Woerter erkannt")
    align_note = None
    if a.script:
        import script_align
        words_raw, st = script_align.align(words_raw, Path(a.script).read_text(encoding="utf-8"))
        align_note = f"Skript-Abgleich: {st['gleich']} gleich, {st['korrigiert']} korrigiert, {st['nur_gesprochen']} frei gesprochen, {st['nicht_gesprochen']} Skriptwoerter nicht gesprochen"
        log(align_note); (work / "words_script.json").write_text(json.dumps(words_raw, ensure_ascii=False))
    # 2) Jump-Cuts
    take_notes = []
    if not a.no_cut:
        drop, take_notes = retakes(words_raw)
        if drop: words_raw = [w for i, w in enumerate(words_raw) if i not in drop]; log(f"Verworfene Takes entfernt: {len(take_notes)} ({'; '.join(n[:40] for n in take_notes)})")
    segs, words = ([(0, info["dur"])], words_raw) if a.no_cut else cut_segments(words_raw, info["dur"])
    dur = round(sum(b - a_ for a_, b in segs), 3)
    log(f"Schnitt: {len(segs)} Segmente, {info['dur']:.1f} s -> {dur:.1f} s")
    (work / "words.json").write_text(json.dumps(words, ensure_ascii=False)); (work / "cuts.json").write_text(json.dumps(segs))
    # 3) Crop + Proxy
    proxy = work / "proxy.mp4"
    if not proxy.exists():
        crop = vision.crop_window(info, src); log(f"9:16-Ausschnitt: {crop}"); vision.make_proxy(src, segs, crop, proxy, info)
    # 4) Analyse
    anaf = work / "analysis.npz"
    if anaf.exists():
        z = np.load(anaf, allow_pickle=True); ana = z["meta"].item(); ana["mask"] = z["mask"]
    else:
        log("Analysiere Gesicht + Person (5 fps) ..."); ana = vision.analyze(proxy)
        np.savez_compressed(anaf, mask=ana["mask"], meta=np.array({k: v for k, v in ana.items() if k != "mask"}, dtype=object))
    # 5) Plan + Layout
    if a.plan:
        P = json.loads(Path(a.plan).read_text()); log(f"Verwende vorgegebenen Plan {a.plan}")
    else:
        P = planner.plan(words, ana, dur, {"zoom": a.zoom, "images": a.images, "cta_word": a.cta})
    if align_note and not a.plan: P["notes"].insert(0, align_note)
    if take_notes and not a.plan: P["notes"].insert(0, f"Verworfene Takes herausgeschnitten: {' | '.join(take_notes)}")
    zf = planner.zoom_fn(P["zooms"], ana)
    if not a.plan: P = planner.place(P, ana, zf)
    P["captions"] = planner.captions(words, P.get("hook_t1", 0), P.get("keys", []), a.cta or ""); P["duration"] = dur
    (out / "plan.json").write_text(json.dumps(P, ensure_ascii=False, indent=1)); (out / "plan.md").write_text(plan_md(P), encoding="utf-8")
    log(f"Plan: {len(P['overlays'])} Overlays ({', '.join(o['type'] for o in P['overlays'])})")
    if a.plan_only: log(f"Plan gespeichert: {out / 'plan.md'}"); return
    # 6) Freistellung + Zoom (30 fps)
    base, matte = work / "base.mp4", work / "matte.mp4"
    log("Freistellung + Zooms (30 fps) ..."); faces = vision.render_base(proxy, zf, base, matte, work / "track.json")
    # 7) Overlay-Ebenen
    tl = {"mode": "th", "overlay": True, "fps": 30, "w": 1080, "h": 1920, "duration": dur, "hookEnd": P.get("hook_t1", 0), "theme": "light" if ana.get("bright", 0.5) > 0.55 else "dark", "overlays": P["overlays"], "captions": P["captions"]}
    (work / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False))
    for layer in ("back", "front"):
        if layer == "back" and not any(o["layer"] == "back" for o in P["overlays"]): continue
        log(f"Rendere Ebene '{layer}' ...")
        subprocess.run(["node", str(SKILL / "engine" / "render_frames.js"), "--timeline", str(work / "timeline.json"), "--layer", layer, "--out", str(work / f"{layer}.mov"), "--workers", a.workers], check=True)
    # 8) Audio: Stimme aufbereiten + SFX + optional Musik
    log("Audio-Mix ...")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(proxy), "-vn", "-af", "highpass=f=80,afftdn=nf=-28,acompressor=threshold=-20dB:ratio=3:attack=8:release=120,aresample=44100", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(work / "voice.wav")], check=True)
    sr_, v = wavfile.read(work / "voice.wav"); v = v.astype(np.float32) / 32768; v = v / (np.abs(v).max() + 1e-9) * 0.85
    n = len(v); total = n / sr_
    ev = planner.sfx_events(P); (work / "sfx_events.json").write_text(json.dumps(ev))
    fx = sfx.sfx_track(ev, total)[:n] * 0.32
    mus = np.zeros(n)
    if a.music == "bed": mus = sfx.duck(sfx.music_bed(total), v)[:n] * 0.16
    elif a.music != "none":
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-stream_loop", "-1", "-i", a.music, "-t", str(total), "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(work / "music.wav")], check=True)
        _, m = wavfile.read(work / "music.wav"); m = m.astype(np.float32) / 32768; mus = sfx.duck(np.pad(m, (0, max(0, n - len(m))))[:n], v) * 0.2
    mix = np.tanh((v + np.pad(fx, (0, n - len(fx))) + mus) * 0.9) / np.tanh(0.9)
    wavfile.write(work / "mix_raw.wav", sr_, (np.clip(np.stack([mix, mix], 1), -1, 1) * 32767).astype(np.int16))
    import build_reel
    build_reel.loudnorm(work / "mix_raw.wav", work / "mix.wav")
    # 9) Composite: Video -> Ebene hinten -> freigestellte Person -> Ebene vorn
    log("Composite + Export ...")
    final = out / f"{Path(a.video).stem}_reel.mp4"
    ins = ["-i", str(base), "-i", str(matte)]; has_back = (work / "back.mov").exists()
    if has_back: ins += ["-i", str(work / "back.mov")]
    ins += ["-i", str(work / "front.mov"), "-i", str(work / "mix.wav")]
    fi = 2 + has_back; ai = fi + 1
    fc = "[1:v]format=gray,scale=1080:1920[m];[0:v]format=rgba,split[bg][pp];[pp][m]alphamerge[person];"
    fc += ("[bg][2:v]overlay=format=auto[x];[x][person]overlay=format=auto[y];" if has_back else "[bg][person]overlay=format=auto[y];")
    fc += f"[y][{fi}:v]overlay=format=auto,format=yuv420p[v]"
    subprocess.run(["ffmpeg", "-y", "-v", "error", *ins, "-filter_complex", fc, "-map", "[v]", "-map", f"{ai}:a", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p",
                    "-r", "30", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", str(dur), "-movflags", "+faststart", str(final)], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(min(2.0, dur / 3)), "-i", str(final), "-frames:v", "1", "-q:v", "2", str(out / "poster.jpg")], check=True)
    build_reel.write_srt(P["captions"], out / "captions.srt")
    log(f"FERTIG: {final}  ({time.time() - T0:.0f} s Gesamtlaufzeit)")
    subprocess.run([sys.executable, str(HERE / "qa.py"), str(final), "--th-plan", str(out / "plan.json"), "--track", str(work / "track.json"), "--out", str(out)], check=False)

if __name__ == "__main__": main()
