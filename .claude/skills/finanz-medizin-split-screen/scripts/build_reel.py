#!/usr/bin/env python3
"""Pipeline-Orchestrator.

  Modus A/B (Rohvideo [+ Skript]) – EIN Befehl:
    build_reel.py --video raw.mp4 --out-dir out/
      Transkription -> Schnitt -> automatisches Storyboard (Claude-API oder Regel-Regisseur) -> Zahlenprüfung ->
      Render oben -> Sounddesign -> Montage -> QC -> out/reel.mp4
    Optional: --storyboard story.json (eigene/von Claude verfeinerte Regie), --review (nach Storyboard-Stills anhalten),
              --images search|generate (echte Bilder), --engine claude|rules

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
    ap.add_argument("--transcript", help="dein Transkript (Text) – korrigiert die Erkennung bzw. ersetzt sie, wenn kein Modell verfügbar ist")
    ap.add_argument("--out-dir", default="out")
    ap.add_argument("--ratio", type=float, default=0.5, help="Anteil der Visualisierung an der Bildhöhe (Standard 0.5)")
    ap.add_argument("--music", default="auto", help="auto = generiertes Pad, none, oder Pfad zu lizenzierter Musik")
    ap.add_argument("--model", default="small")
    ap.add_argument("--force", action="store_true", help="Zahlenprüfung-Fehler ignorieren (nicht empfohlen)")
    ap.add_argument("--still-only", action="store_true", help="nur Vorschau-Standbilder statt Video rendern")
    ap.add_argument("--face-x", type=float); ap.add_argument("--face-y", type=float)
    ap.add_argument("--auto-light", action="store_true")
    ap.add_argument("--engine", default="auto", choices=["auto", "claude", "rules"], help="Storyboard-Regie, wenn kein --storyboard")
    ap.add_argument("--images", default="auto", choices=["auto", "none", "search", "generate"], help="echte Fotos: auto = Bibliothek → KI-Foto → Fotosuche")
    ap.add_argument("--review", action="store_true", help="nach Storyboard + Vorschau-Stills anhalten")
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
            asr = out / "words.asr.json"
            r = subprocess.run([PY, str(HERE / "transcribe.py"), a.video, "-o", str(asr), "--model", a.model])
            if a.transcript:
                if r.returncode == 0:
                    run(PY, HERE / "align_transcript.py", "--transcript", a.transcript, "--words", asr, "-o", words_path)
                else:
                    print("WARNUNG: Spracherkennung nicht verfügbar → Wortzeiten aus Transkript + Sprechpausen (Näherung)")
                    run(PY, HERE / "align_transcript.py", "--transcript", a.transcript, "--video", a.video, "-o", words_path)
            elif r.returncode == 0:
                os.replace(asr, words_path)
            else:
                sys.exit("Transkription fehlgeschlagen und kein --transcript angegeben. Transkript mitgeben oder huggingface.co freigeben.")
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
    # ---------- Storyboard (automatisch, wenn keins übergeben) ----------
    if not a.storyboard:
        if not words_path:
            sys.exit("--storyboard fehlt (Modus C) bzw. --video (Modus A/B).")
        auto = out / "story.auto.json"
        run(PY, HERE / "auto_storyboard.py", words_path, "-o", auto, "--engine", a.engine, "--images", a.images)
        a.storyboard = str(auto)
        print(f"Automatisches Storyboard -> {auto}")
    sb = json.load(open(a.storyboard, encoding="utf-8"))
    sys.path.insert(0, str(HERE)); import storyboard as _sbm; _sbm.absolutize(sb, pathlib.Path(a.storyboard).resolve().parent)
    sb.setdefault("meta", {})["panel_height"] = panel_h
    if duration:
        sb["meta"]["duration"] = duration
    if a.transcript and not a.script:
        a.script = a.transcript
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
    if a.still_only or a.review:
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
    cj = out / "images" / "credits.json"
    if cj.exists():
        lines = [c.get("credit", "") for c in json.load(open(cj))]
        (out / "credits.txt").write_text("Bildnachweise:\n" + "\n".join(lines), encoding="utf-8")
        print(f"Bildnachweise für die Caption -> {out / 'credits.txt'}")
    run(PY, HERE / "qc.py", out / ("reel.mp4" if bottom else "preview_ohne_sprecher.mp4"), "--storyboard", res, "--out-dir", out / "qc", *([] if bottom else ["--preview"]))


if __name__ == "__main__":
    main()
