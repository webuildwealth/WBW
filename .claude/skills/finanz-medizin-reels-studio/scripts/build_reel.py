#!/usr/bin/env python3
"""FINANZ-MEDIZIN REELS STUDIO - Orchestrator.
Storyboard (JSON) -> Sprache -> Wort-Timings -> Cues -> Untertitel -> SFX/Musik -> Frames (Chromium) -> MP4 (H.264/AAC, 1080x1920, 30 fps)

  python3 build_reel.py storyboard.json --out ./out/mein-reel            # komplett
  python3 build_reel.py storyboard.json --out ./out/x --stills 1,4,8     # nur Standbilder (schnelle Gestaltungspruefung)
  python3 build_reel.py storyboard.json --out ./out/x --no-render        # nur Timeline + Audio
"""
import argparse, hashlib, json, math, re, shutil, subprocess, sys, unicodedata
from pathlib import Path
import numpy as np
from scipy.io import wavfile

HERE = Path(__file__).resolve().parent; SKILL = HERE.parent
sys.path.insert(0, str(HERE))
import tts, align, sfx  # noqa: E402
SR = sfx.SR

def norm(w):
    w = w.lower().replace("ß", "ss"); w = unicodedata.normalize("NFKD", w)
    return re.sub(r"[^a-z0-9€%]", "", "".join(c for c in w if not unicodedata.combining(c)))

def find_cue(cue, words, scene_id):
    """cue: 'Wort', 'zwei Worte', 'Wort@2' (2. Vorkommen). Rueckgabe: Startzeit (relativ zur Szene) des ersten Treffers."""
    occ = 1
    m = re.match(r"^(.*)@(\d+)$", cue)
    if m: cue, occ = m.group(1), int(m.group(2))
    want = [norm(t) for t in cue.split() if norm(t)]
    have = [norm(w["w"]) for w in words]
    seen = 0
    for i in range(len(have) - len(want) + 1):
        if have[i:i + len(want)] == want:
            seen += 1
            if seen == occ: return max(0.05, words[i]["t0"] - 0.05)
    sys.exit(f"[Szene '{scene_id}'] Cue '{cue}' nicht im Sprechtext gefunden. Vorhandene Woerter: {' '.join(w['w'] for w in words)}")

def resolve_cues(node, words, sid):
    if isinstance(node, dict):
        if "cue" in node and "at" not in node: node["at"] = round(find_cue(node["cue"], words, sid), 3)
        for v in node.values(): resolve_cues(v, words, sid)
    elif isinstance(node, list):
        for v in node: resolve_cues(v, words, sid)

def ffprobe_dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).decode().strip())

# ---------- Sprache ----------
def build_voice(sb, work, base=None):
    v = sb.get("voice", {}); prov = v.get("provider", "pico"); speed = v.get("speed", 1.0)
    out = []
    for i, sc in enumerate(sb["scenes"]):
        wav = work / f"vo_{i:02d}.wav"
        if sc.get("source"):   # Modus 3: Ton stammt aus dem Rohvideo (Segment von..bis, Sekunden)
            if not base: sys.exit("Szene mit 'source' braucht --base <Rohvideo>")
            src = sc["source"]; subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(src["from"]), "-to", str(src["to"]), "-i", base, "-vn", "-af", "aresample=44100,highpass=f=70", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(wav)], check=True)
            sr, x = align.load(wav); s0, s1 = align.speech_bounds(x, sr)
            words = sc["words"] if sc.get("words") else align.estimate_words(sc["vo"], x[int(s0 * sr): int(s1 * sr)], sr, offset=s0)
            out.append({"x": x, "dur": len(x) / sr, "words": words}); continue
        if sc.get("audio"): tts.prepare_file(Path(sc["audio"]).expanduser(), wav)
        else: tts.synth(sc.get("spoken") or sc["vo"], wav, prov, speed, cache=work / "ttscache")
        sr, x = align.load(wav); s0, s1 = align.speech_bounds(x, sr)
        x = x[int(s0 * sr): int(s1 * sr)]
        words = align.estimate_words(sc["vo"], x, sr) if not sc.get("words") else sc["words"]
        out.append({"x": x, "dur": len(x) / sr, "words": words})
    return out

# ---------- SFX-Plan ----------
def sfx_plan(sc, start, dur, first):
    d = sc.get("data", {}); t = sc["type"]; ev = []
    def add(rel, name, gain=1.0, **kw): ev.append({"t": round(start + rel, 3), "name": name, "gain": gain, "kw": kw})
    at = lambda x, dflt: (x.get("at", dflt) if isinstance(x, dict) else dflt)
    if not first: add(-0.06, "whoosh", 0.8)
    if t == "hook": add(0.0, "riser", 0.35, d=0.5); add(0.45, "pop", 0.55)
    elif t == "tip": add(0.1, "pop", 0.9); add(0.35, "tick", 0.6)
    elif t == "error": add(0.12, "thud", 1.0); add(at(d.get("fix"), 2.4) - 0.05, "whoosh", 0.5); add(at(d.get("fix"), 2.4) + 0.35, "ding", 0.7)
    elif t == "myth":
        add(0.1, "pop", 0.8); c, v, f = at(d.get("check"), 99), at(d.get("verdict"), 99), at(d.get("fact"), 99)
        if c < 90: add(c, "scan", 0.7, d=max(0.4, (v if v < 90 else c + 1) - c))
        if v < 90: add(v + 0.2, "stamp", 1.0)
        if f < 90: add(f, "whoosh", 0.7); add(f + 0.4, "ding", 0.55)
    elif t == "fact": add(0.1, "pop", 0.9)
    elif t == "stat":
        a = d.get("at", 0.4); cd = d.get("countDur", 1.6); add(0.1, "pop", 0.8)
        n = int(cd / 0.09)
        for k in range(n): add(a + k * 0.09, "tick", 0.45, pitch=1.25 - 0.55 * k / n)
        add(a + cd, "thud", 0.7, pitch=1.1)
    elif t == "bars":
        for i, b in enumerate(d.get("bars", [])): add(at(b, 0.5 + i * 0.5) + 0.1, "pop", 0.8, pitch=1.0 - 0.07 * i)
        if d.get("delta"): add(at(d["delta"], 3) + 0.1, "stamp", 0.9)
    elif t == "compare":
        for i, r in enumerate(d.get("rows", [])): add(at(r, 0.8 + i * 0.6), "pop", 0.7, pitch=1.1)
    elif t == "checklist":
        for i, it in enumerate(d.get("items", [])): add(at(it, 0.6 + i * 0.7) + 0.3, "ding", 0.7, pitch=1 + 0.06 * i)
    elif t == "outro": add(0.25, "ding", 0.8); add(at(d.get("cta"), 1.3), "pop", 0.8)
    for e in sc.get("sfx", []):  # freie Zusatz-SFX: {"name":"ding","cue":"..."} oder {"name","at"}
        ev.append({"t": round(start + e["at"], 3), "name": e["name"], "gain": e.get("gain", 1.0), "kw": e.get("kw", {})})
    return ev

# ---------- Captions ----------
def make_captions(scenes):
    chunks = []
    for s in scenes:
        if s.get("captions") is False: continue
        ws = s["words"]; hi = {norm(h) for h in s.get("hi", [])}; i = 0
        while i < len(ws):
            take = [ws[i]]; i += 1
            while i < len(ws) and len(take) < 2 and not re.search(r"[.!?:;,–]$", take[-1]["w"]) and len(" ".join(x["w"] for x in take)) + len(ws[i]["w"]) < 17:
                take.append(ws[i]); i += 1
            chunks.append({"text": " ".join(x["w"] for x in take), "t0": take[0]["t0"], "t1": take[-1]["t1"], "hi": any(norm(x["w"]) in hi for x in take)})
    for a, b in zip(chunks, chunks[1:]):   # Luecken schliessen (kein Flackern), Ueberlappung verhindern
        if b["t0"] - a["t1"] < 0.25: a["t1"] = round(max(a["t0"] + 0.04, b["t0"]), 3)
    return chunks

def srt_time(t): h, r = divmod(t, 3600); m, s = divmod(r, 60); return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"
def write_srt(chunks, p):
    p.write_text("\n".join(f"{i}\n{srt_time(c['t0'])} --> {srt_time(c['t1'])}\n{c['text']}\n" for i, c in enumerate(chunks, 1)), encoding="utf-8")

# ---------- Audio ----------
def loudnorm(inp, out, I=-14.0, TP=-1.5, LRA=9):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(inp), "-af", f"loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    j = json.loads(r.stderr[r.stderr.rfind("{"):r.stderr.rfind("}") + 1])
    flt = f"loudnorm=I={I}:TP={TP}:LRA={LRA}:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(inp), "-af", flt + ",aresample=48000", str(out)], check=True)
    return j

def mix_audio(sb, scenes, voices, events, total, work, music_opt):
    n = int(total * SR); voice = np.zeros(n)
    for sc, v in zip(scenes, voices):
        i = int(sc["voiceAt"] * SR); x = v["x"]; voice[i:i + len(x)] += x[: n - i]
    pk = np.abs(voice).max(); voice = voice / pk * 0.85 if pk else voice
    fx = sfx.sfx_track(events, total) * 0.42
    mus = np.zeros(n)
    if music_opt == "bed": mus = sfx.duck(sfx.music_bed(total), voice) * 0.20
    elif music_opt and music_opt != "none":
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-stream_loop", "-1", "-i", str(Path(music_opt).expanduser()), "-t", str(total), "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", str(work / "music_in.wav")], check=True)
        _, m = wavfile.read(work / "music_in.wav"); m = m.astype(np.float32) / 32768; mus = sfx.duck(np.pad(m, (0, max(0, n - len(m))))[:n], voice) * 0.25
    mixd = voice + fx + mus
    mixd = np.tanh(mixd * 0.9) / np.tanh(0.9)
    wavfile.write(work / "voiceover.wav", SR, (np.clip(voice, -1, 1) * 32767).astype(np.int16))
    st = np.stack([mixd, mixd], 1)   # Dual-Mono-Stereo VOR der Lautheitsnormalisierung (Messung auf dem Auslieferungssignal)
    wavfile.write(work / "mix_raw.wav", SR, (np.clip(st, -1, 1) * 32767).astype(np.int16))
    return loudnorm(work / "mix_raw.wav", work / "mix.m4a.wav")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("storyboard"); ap.add_argument("--out", required=True)
    ap.add_argument("--stills"); ap.add_argument("--no-render", action="store_true"); ap.add_argument("--workers", default="4")
    ap.add_argument("--music", help="bed|none|Pfad (ueberschreibt Storyboard)"); ap.add_argument("--base", help="Rohvideo (Overlay-Modus)")
    a = ap.parse_args()
    sb = json.loads(Path(a.storyboard).read_text(encoding="utf-8")); out = Path(a.out); work = out / "work"; work.mkdir(parents=True, exist_ok=True)
    meta = sb.get("meta", {}); fps = meta.get("fps", 30)

    voices = build_voice(sb, work, a.base)
    scenes = []; cur = 0.0
    for i, (sc, v) in enumerate(zip(sb["scenes"], voices)):
        src = bool(sc.get("source")); lead = 0.0 if src else sc.get("lead", 0.12 if i else 0.2); tail = 0.0 if src else sc.get("tail", 0.45)
        dur = max(lead + v["dur"] + tail, sc.get("minDur", 0))
        words = [{"w": w["w"], "t0": round(cur + lead + w["t0"], 3), "t1": round(cur + lead + w["t1"], 3)} for w in v["words"]]
        rel = [{"w": w["w"], "t0": round(lead + w["t0"], 3), "t1": round(lead + w["t1"], 3)} for w in v["words"]]
        data = json.loads(json.dumps(sc.get("data", {})))
        resolve_cues(data, rel, sc.get("id", i))
        s = {"id": sc.get("id", f"s{i}"), "type": sc["type"], "start": round(cur, 3), "dur": round(dur, 3), "voiceAt": round(cur + lead, 3), "data": data, "words": words,
             "captions": sc.get("captions"), "hi": sc.get("hi", []), "mood": sc.get("mood"), "place": sc.get("place"), "sfx": []}
        for e in sc.get("sfx", []):
            e = dict(e); e["at"] = e.get("at", find_cue(e["cue"], rel, s["id"]) if "cue" in e else 0.0); s["sfx"].append(e)
        scenes.append(s); cur += dur
    total = round(cur + float(meta.get("endHold", 0.4)), 3)
    events = [e for i, s in enumerate(scenes) for e in sfx_plan(s, s["start"], s["dur"], i == 0)]
    caps = make_captions(scenes)
    tl = {"w": 1080, "h": 1920, "fps": fps, "duration": total, "overlay": bool(a.base), "brandFooter": meta.get("brandFooter", True), "scenes": scenes, "captions": caps}
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "sfx_events.json").write_text(json.dumps(events, indent=1), encoding="utf-8")
    write_srt(caps, out / "captions.srt")
    print(f"Timeline: {total:.1f} s, {len(scenes)} Szenen, {len(caps)} Caption-Chunks, {len(events)} SFX")

    renderer = SKILL / "engine" / "render_frames.js"
    if a.stills:
        subprocess.run(["node", str(renderer), "--timeline", str(out / "timeline.json"), "--stills", a.stills, "--stills-dir", str(out / "stills")], check=True); return
    if a.no_render: return

    renderer_base = None
    if a.base:   # Basisvideo = Segmente aneinandergehaengt, exakt auf die Szenen-Laengen
        segs = [(sc["source"]["from"], sc["source"]["to"]) for sc in sb["scenes"]]
        fc = "".join(f"[0:v]trim={f}:{t},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps={fps},setsar=1[v{i}];" for i, (f, t) in enumerate(segs))
        fc += "".join(f"[v{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=0[o]"
        renderer_base = str(work / "base_cut.mp4")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", a.base, "-filter_complex", fc, "-map", "[o]", "-c:v", "libx264", "-crf", "12", "-preset", "fast", "-pix_fmt", "yuv420p", renderer_base], check=True)
    music = a.music or sb.get("music", "bed")
    ln = mix_audio(sb, scenes, voices, events, total, work, music)
    print(f"Audio: {ln['input_i']} LUFS roh -> -14 LUFS Ziel, True Peak roh {ln['input_tp']} dBTP")
    cmd = ["node", str(renderer), "--timeline", str(out / "timeline.json"), "--out", str(work / "video_silent.mp4"), "--workers", a.workers]
    if a.base: cmd += ["--base", renderer_base]
    subprocess.run(cmd, check=True)
    slug = meta.get("slug", "reel"); final = out / f"{slug}.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(work / "video_silent.mp4"), "-i", str(work / "mix.m4a.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-t", str(total), "-movflags", "+faststart", "-metadata", f"title={meta.get('title', slug)}", str(final)], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(min(1.2, total / 3)), "-i", str(final), "-frames:v", "1", "-q:v", "2", str(out / "poster.jpg")], check=True)
    (out / "caption-text.txt").write_text(meta.get("instagramCaption", ""), encoding="utf-8")
    shutil.copy(a.storyboard, out / "storyboard.json")
    (out / "rerender.sh").write_text(f"#!/bin/sh\n# Re-Render aus dem Projektordner (Storyboard anpassen, dann ausfuehren)\npython3 '{HERE / 'build_reel.py'}' storyboard.json --out .\n")
    print("FERTIG:", final)
    subprocess.run([sys.executable, str(HERE / "qa.py"), str(final), "--timeline", str(out / "timeline.json"), "--out", str(out)], check=False)

if __name__ == "__main__": main()
