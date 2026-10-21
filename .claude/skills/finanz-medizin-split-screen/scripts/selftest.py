#!/usr/bin/env python3
"""Selbsttest: python3 scripts/selftest.py [--quick]   (--quick überspringt den vollen Videorender)"""
import json, pathlib, subprocess, sys, tempfile, wave
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
SKILL = HERE.parent
PY = sys.executable
res = []


def run(*cmd, expect=0):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    return r.returncode == expect, (r.stdout + r.stderr)[-1500:]


def t(name, ok, info=""):
    res.append(ok)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "\n" + info))


tmp = pathlib.Path(tempfile.mkdtemp(prefix="fmself_"))
quick = "--quick" in sys.argv
t("setup_check", *run(PY, HERE / "setup_check.py")[:1], run(PY, HERE / "setup_check.py")[1])

# 1) Beispiele auflösen + prüfen + Stills rendern
for ex in sorted((SKILL / "examples").glob("*.json")):
    out = tmp / (ex.stem + ".resolved.json")
    ok, o = run(PY, HERE / "storyboard.py", "resolve", ex, "-o", out)
    t(f"storyboard resolve/check {ex.stem}", ok, o)
    if ok:
        sb = json.load(open(out)); d = sb["meta"]["duration"]
        ts = ",".join(f"{(s['start'] + (s['end'] - s['start']) * .8):.2f}" for s in sb["scenes"])
        ok, o = run(PY, HERE / "render_top.py", out, "--stills", ts, "--out-dir", tmp / ("st_" + ex.stem))
        t(f"render stills {ex.stem}", ok, o)

# 2) Negativtest: erfundene Zahl muss abgelehnt werden
bad = {"meta": {}, "script": "Ein Arzt verdient 6.000 € netto.", "scenes": [
    {"id": "x", "type": "counter", "props": {"to": 7777, "unit": "€"}}]}
(tmp / "bad.json").write_text(json.dumps(bad))
t("Zahlenprüfung lehnt erfundene Zahl ab", *run(PY, HERE / "storyboard.py", "resolve", tmp / "bad.json", "-o", tmp / "bad.out.json", expect=1)[:1], "")
badq = {"meta": {}, "script": "Es geht um 100 € und 3 %.", "derived": [{"value": 99, "formula": "100-3", "decimals": 0}], "scenes": [{"id": "x", "type": "counter", "props": {"to": 100}}]}
(tmp / "bad2.json").write_text(json.dumps(badq))
t("Zahlenprüfung rechnet derived nach", *run(PY, HERE / "storyboard.py", "resolve", tmp / "bad2.json", "-o", tmp / "bad2.out.json", expect=1)[:1], "")

# 3) Schnitt mit synthetischem Sprecher (Tonbursts), Füllwort + Pausen
W = [("Eins", .5, .9), ("zwei", 1.0, 1.4), ("äh", 1.6, 1.9), ("drei", 3.2, 3.7), ("vier", 3.8, 4.3), ("fünf.", 6.0, 6.6)]
sr = 48000; x = np.random.default_rng(1).standard_normal(8 * sr) * .002
for i, (w, s, e) in enumerate(W):
    tt = np.arange(int((e - s) * sr)) / sr; seg = np.sin(2 * np.pi * (180 + 20 * i) * tt) * .25; x[int(s * sr):int(s * sr) + len(seg)] += seg
with wave.open(str(tmp / "a.wav"), "wb") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes((x * 32767).astype(np.int16).tobytes())
json.dump([{"w": w, "s": s, "e": e} for w, s, e in W], open(tmp / "w.json", "w"), ensure_ascii=False)
run("ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=8", "-i", tmp / "a.wav", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", tmp / "raw.mp4")
ok, o = run(PY, HERE / "cut_speaker.py", tmp / "raw.mp4", "-o", tmp / "ed.mp4", "--words", tmp / "w.json")
t("Sprecherschnitt (Wörter)", ok, o)
if ok:
    tm = json.load(open(tmp / "ed.timemap.json")); nw = json.load(open(tmp / "ed.words.json"))
    t("  Füllwort entfernt", "äh" in tm["removed_words"] and all(w["w"] != "äh" for w in nw))
    t("  Pausen gekürzt", tm["out_duration"] < 8 - 1.5, str(tm["out_duration"]))
    t("  Wortzeiten monoton & im Video", all(a["s"] < b["s"] for a, b in zip(nw, nw[1:])) and nw[-1]["e"] <= tm["out_duration"] + .05)
ok, o = run(PY, HERE / "cut_speaker.py", tmp / "raw.mp4", "-o", tmp / "ed2.mp4")
t("Sprecherschnitt (nur Lautstärke)", ok and len(json.load(open(tmp / "ed2.timemap.json"))["segments"]) >= 2, o)

# 4) Sounddesign
ok, o = run(PY, HERE / "sfx.py", tmp / "C_inflation.resolved.json", "-o", tmp / "sfx.wav", "--music-out", tmp / "m.wav")
t("Sounddesign", ok and (tmp / "sfx.wav").exists(), o)

# 5) Volle Pipeline (Modus C)
if not quick:
    ok, o = run(PY, HERE / "build_reel.py", "--storyboard", SKILL / "examples" / "C_inflation.json", "--out-dir", tmp / "outC")
    t("Pipeline Modus C → Vorschau-Reel inkl. QC", ok, o)
    ok, o = run(PY, HERE / "build_reel.py", "--video", tmp / "raw.mp4", "--words", tmp / "w.json", "--out-dir", tmp / "outAB")
    t("Pipeline Schritt 1 (Schnitt) Modus A/B", ok, o)
print(f"\n{sum(res)}/{len(res)} bestanden  (Temp: {tmp})")
sys.exit(0 if all(res) else 1)
