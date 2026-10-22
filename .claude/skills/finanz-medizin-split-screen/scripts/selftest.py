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

# 3b) Automatisches Storyboard (Regel-Regisseur) aus Wortliste
sys.path.insert(0, str(HERE)); import storyboard as S
script = ("Stell dir vor, eine junge Ärztin verdient 5.500 € netto im Monat. Viele glauben, die Rente reicht später schon. Das ist leider falsch. "
          "Im Ruhestand bleiben ihr nur 2.900 € im Monat. Wenn die Preise jedes Jahr um 3 % steigen, sind 100 € nach 20 Jahren nur noch etwa 55 € wert. "
          "Erstens: ohne Plan starten. Zweitens: zu spät anfangen. Lass uns deine Versorgungslücke berechnen.")
json.dump(S.estimate_words(script), open(tmp / "aw.json", "w"), ensure_ascii=False)
ok, o = run(PY, HERE / "auto_storyboard.py", tmp / "aw.json", "-o", tmp / "auto.json", "--engine", "rules")
t("Auto-Storyboard (regelbasiert) erzeugt", ok, o)
if ok:
    ab = json.load(open(tmp / "auto.json")); types = [s["type"] for s in ab["scenes"]]
    t("  erkennt Figur/Ärztin, Mythos, Ruhestand-Vergleich, Inflation, Aufzählung",
      ab["figures"]["doc"]["gender"] == "f" and {"character", "myth", "gap_bars", "inflation", "bullets"} <= set(types), str(types))
    ok, o = run(PY, HERE / "storyboard.py", "resolve", tmp / "auto.json", "--words", tmp / "aw.json", "-o", tmp / "auto.res.json")
    t("  Auto-Storyboard besteht Zahlen-/Ankerprüfung", ok, o)
    ok, o = run(PY, HERE / "render_top.py", tmp / "auto.res.json", "--stills", "1,6,12,18", "--out-dir", tmp / "st_auto")
    t("  Auto-Storyboard rendert", ok, o)
ok, o = run(PY, HERE / "image_search.py", "doctor", "--out-dir", tmp / "img")
t("Bildsuche (Netzwerk nötig – Fehler wird sauber gemeldet)", ok or "kein lizenzfreies Bild" in o, o)

# 3c) Transkript ohne Spracherkennung + Foto-Bibliothek
(tmp / "tr.txt").write_text("Eins zwei drei vier fünf.", encoding="utf-8")
ok, o = run(PY, HERE / "align_transcript.py", "--transcript", tmp / "tr.txt", "--video", tmp / "raw.mp4", "-o", tmp / "al.json")
t("Transkript-Ausrichtung ohne Modell", ok and len(json.load(open(tmp / "al.json"))) == 5, o)
ok, o = run(PY, HERE / "align_transcript.py", "--transcript", tmp / "tr.txt", "--words", tmp / "w.json", "-o", tmp / "al2.json")
t("Transkript-Abgleich mit Wortzeiten", ok and json.load(open(tmp / "al2.json"))[3]["s"] == 3.8, o)
sys.path.insert(0, str(HERE)); import image_gen, os as _os
lib = tmp / "lib"; lib.mkdir(exist_ok=True)
from PIL import Image as _I; _I.new("RGB", (900, 700), "#89a").save(lib / "aerztin-frau-praxis.jpg")
_os.environ["FM_IMAGE_DIR"] = str(lib)
t("Foto-Bibliothek findet passendes Personenfoto", bool(image_gen.from_library("35-year-old woman doctor in a modern medical practice")))

# 4) Sounddesign
ok, o = run(PY, HERE / "sfx.py", tmp / "C_inflation.resolved.json", "-o", tmp / "sfx.wav", "--music-out", tmp / "m.wav")
t("Sounddesign", ok and (tmp / "sfx.wav").exists(), o)

# 5) Volle Pipeline (Modus C)
if not quick:
    ok, o = run(PY, HERE / "build_reel.py", "--storyboard", SKILL / "examples" / "C_inflation.json", "--out-dir", tmp / "outC")
    t("Pipeline Modus C → Vorschau-Reel inkl. QC", ok, o)
    ok, o = run(PY, HERE / "build_reel.py", "--video", tmp / "raw.mp4", "--words", tmp / "w.json", "--out-dir", tmp / "outAB", "--engine", "rules")
    t("Pipeline Modus A vollautomatisch (Schnitt → Auto-Storyboard → Reel)", ok and (tmp / "outAB" / "reel.mp4").exists(), o)
print(f"\n{sum(res)}/{len(res)} bestanden  (Temp: {tmp})")
sys.exit(0 if all(res) else 1)
