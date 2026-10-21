#!/usr/bin/env python3
"""Pipeline-Orchestrator.

  Modus A/B (Rohvideo [+ Skript]):
    build_reel.py --video raw.mp4 --out-dir out/ [--script skript.txt] [--storyboard story.json]
      Schritt 1 (ohne --storyboard): Transkription + Schnitt -> out/transcript.txt, out/edited.mp4, out/edited.words.json
                                      -> Claude schreibt daraus story.json (siehe references/visual-storytelling.md) und startet erneut
      Schritt 2 (mit --storyboard):   Anker auflösen, Zahlen prüfen, oben rendern, Sounddesign, zusammensetzen, QC

  Modus C (nur Skript):
    build_reel.py --storyboard story.json --out-dir out/            # Storyboard + Vorschau-Reel mit Sprecher-Platzhalter

Weitere Optionen: --words words.json (vorhandene Transkription), --music pfad.mp3|auto|none, --ratio 0.5, --force, --still-only
"""
import argparse, json, os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
PY = sys.executable


def run(*cmd):
    print("\n$", " ".join(str(c) for c in cmd))
    r = subprocess.run([str(c) for c in cmd])
    if r.returncode:
        sys.exit(r.returncode)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video")
    ap.add_argument("--script")
    ap.add_argument("--storyboard")
    ap.add_argument("--words")
    ap.add_argument("--out-dir", default="out")
    ap.add_argument("--ratio", type=float, default=0.5, help="Anteil der Visualisierung an der Bildhöhe (Standard 0.5)")
    ap.add_argument("--music", default="auto", help="auto = generiertes Pad, none, oder Pfad zu lizenzierter Musik")
    ap.add_argument("--model", default="small")
    ap.add_argument("--force", action="store_true", help="Zahlenprüfung-Fehler ignorieren (nicht empfohlen)")
    ap.add_argument("--still-only", action="store_true", help="nur Vorschau-Standbilder statt Video rendern")
    ap.add_argument("--face-x", type=float); ap.add_argument("--face-y", type=float)
    ap.add_argument("--auto-light", action="store_true")
    a = ap.parse_args()
    out = pathlib.Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    panel_h = int(round(1920 * a.ratio / 2) * 2)

    bottom = None
    words_path = a.words
    duration = None
    # ---------- Sprecher ----------
    if a.video:
        if not words_path:
            words_path = out / "words.raw.json"
            if a.script and not os.path.exists(words_path):
                print("Hinweis: Skript wird zur Textkorrektur genutzt, Wortzeiten kommen aus der Transkription.")
            run(PY, HERE / "transcribe.py", a.video, "-o", words_path, "--model", a.model)
        cut = [PY, HERE / "cut_speaker.py", a.video, "-o", out / "edited.mp4", "--words", words_path, "--panel-h", 1920 - panel_h]
        if a.face_x is not None: cut += ["--face-x", a.face_x, "--face-y", a.face_y]
        if a.auto_light: cut += ["--auto-light"]
        if not (out / "edited.mp4").exists() or not a.storyboard:
            run(*cut)
        bottom = out / "edited.mp4"
        words_path = out / "edited.words.json"
        tm = json.load(open(out / "edited.timemap.json"))
        duration = tm["out_duration"]
        txt = " ".join(w["w"] for w in json.load(open(words_path)))
        (out / "transcript.txt").write_text(txt, encoding="utf-8")
        if not a.storyboard:
            print(f"\nSchnitt fertig ({duration:.1f}s). Transkript (bereinigt, neue Zeitachse) -> {out/'transcript.txt'}\n"
                  f"NÄCHSTER SCHRITT: story.json nach references/visual-storytelling.md schreiben, dann erneut mit --storyboard starten.")
            return
    # ---------- Storyboard ----------
    if not a.storyboard:
        sys.exit("--storyboard fehlt (Modus C) bzw. --video (Modus A/B).")
    sb = json.load(open(a.storyboard, encoding="utf-8"))
    sys.path.insert(0, str(HERE)); import storyboard as _sbm; _sbm.absolutize(sb, pathlib.Path(a.storyboard).resolve().parent)
    sb.setdefault("meta", {})["panel_height"] = panel_h
    if duration:
        sb["meta"]["duration"] = duration
    if a.script and "script" not in sb:
        sb["script"] = pathlib.Path(a.script).read_text(encoding="utf-8")
    tmp_story = out / "story.in.json"
    tmp_story.write_text(json.dumps(sb, ensure_ascii=False, indent=1), encoding="utf-8")
    res = out / "storyboard.resolved.json"
    cmd = [PY, HERE / "storyboard.py", "resolve", tmp_story, "-o", res]
    if words_path: cmd += ["--words", words_path]
    r = subprocess.run([str(c) for c in cmd])
    if r.returncode and not a.force:
        sys.exit("Storyboard-Prüfung fehlgeschlagen (Zahlen/Anker). Korrigieren oder --force.")
    # ---------- Rendern ----------
    if a.still_only:
        sbj = json.load(open(res)); d = sbj["meta"]["duration"]
        ts = ",".join(f"{(s['start'] + min(s['end'] - s['start'], 2.0) * .9):.2f}" for s in sbj["scenes"])
        run(PY, HERE / "render_top.py", res, "--stills", ts, "--out-dir", out / "previews")
        return
    run(PY, HERE / "render_top.py", res, "--out", out / "top.mp4")
    # ---------- Sound ----------
    sfx_cmd = [PY, HERE / "sfx.py", res, "-o", out / "sfx.wav"]
    music = None
    if a.music == "auto":
        sfx_cmd += ["--music-out", out / "music.wav"]; music = out / "music.wav"
    elif a.music != "none":
        music = a.music
    run(*sfx_cmd)
    # ---------- Montage ----------
    comp = [PY, HERE / "compose.py", "--top", out / "top.mp4", "--sfx", out / "sfx.wav", "-o", out / ("reel.mp4" if bottom else "preview_ohne_sprecher.mp4")]
    comp += ["--bottom", bottom] if bottom else ["--placeholder", "Sprecher folgt"]
    if music: comp += ["--music", music]
    run(*comp)
    run(PY, HERE / "qc.py", comp[-1] if False else out / ("reel.mp4" if bottom else "preview_ohne_sprecher.mp4"), "--storyboard", res, "--out-dir", out / "qc", *([] if bottom else ["--preview"]))


if __name__ == "__main__":
    main()
