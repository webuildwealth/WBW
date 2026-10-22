#!/usr/bin/env python3
"""Finanz-Medizin Arbeitsordner-Befehl (Mac-Desktop-App oder Terminal).

Ordner (Standard ~/Videos/FinanzMedizin, aenderbar mit FM_HOME):
  original/   Rohvideos vom iPhone (AirDrop mit "Alle Fotodaten")   -> werden NIE veraendert
  skripte/    Skripte: skript-3.txt, 3_bu-fehler.md, Skript 3.docx ...
  fertig/     fertige Reels (+ projekte/<name>/ mit Plan, Untertiteln, QA)
  arbeit/     Zwischenstaende (Transkript, Analyse) -> zweiter Lauf geht schneller
  bilder/     optionale eigene/lizenzierte Bilder (Dateiname = Thema, z.B. rente.jpg)
  musik/      optionale lizenzierte Musik

  python3 fm.py init
  python3 fm.py schneide original/IMG_1234.MOV --skript 3 --cta Vorsorge
  python3 fm.py schneide IMG_1234.MOV --skript 3 --nur-plan        (nur Schnittplan zum Pruefen)
  python3 fm.py status
"""
import argparse, datetime, os, re, shutil, subprocess, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV = Path.home() / ".fm-reels" / "venv" / "bin" / "python3"
if VENV.exists() and Path(sys.executable).resolve() != VENV.resolve() and not os.environ.get("FM_NO_VENV"):
    os.execv(str(VENV), [str(VENV), __file__, *sys.argv[1:]])   # Mac: eigene Python-Umgebung aus setup_mac.sh nutzen

HOME = Path(os.environ.get("FM_HOME", Path.home() / "Videos" / "FinanzMedizin")).expanduser()
DIRS = ["original", "skripte", "fertig", "fertig/projekte", "arbeit", "bilder", "musik"]
VIDEO_EXT = (".mov", ".mp4", ".m4v")

def die(msg): print("FEHLER: " + msg, file=sys.stderr); sys.exit(1)

def read_script(p):
    p = Path(p); ext = p.suffix.lower()
    if ext in (".txt", ".md", ".markdown"): return p.read_text(encoding="utf-8", errors="replace")
    if ext == ".docx":
        with zipfile.ZipFile(p) as z: xml = z.read("word/document.xml").decode("utf-8", "replace")
        xml = re.sub(r"</w:p>", "\n", xml); return re.sub(r"<[^>]+>", "", xml)
    if ext == ".rtf":
        if shutil.which("textutil"):   # macOS
            return subprocess.run(["textutil", "-convert", "txt", "-stdout", str(p)], capture_output=True, text=True).stdout
        t = p.read_text(errors="replace"); t = re.sub(r"\\par[d]?", "\n", t); t = re.sub(r"\\[a-z]+-?\d* ?|[{}]", "", t); return t
    if ext == ".pages": die(f"{p.name}: Pages-Dateien bitte als .txt oder .docx exportieren (Ablage > Exportieren).")
    die(f"{p.name}: Format nicht unterstuetzt (txt, md, docx, rtf).")

def find_script(spec):
    if not spec: return None
    p = Path(spec).expanduser()
    for cand in (p, HOME / spec, HOME / "skripte" / spec):
        if cand.is_file(): return cand
    files = [f for f in (HOME / "skripte").glob("*") if f.is_file() and not f.name.startswith(".")]
    if re.fullmatch(r"\d+", str(spec)):
        hits = [f for f in files if re.search(rf"(^|\D)0*{int(spec)}(\D|$)", f.stem)]
    else:
        hits = [f for f in files if str(spec).lower() in f.stem.lower()]
    if not hits: die(f"Kein Skript '{spec}' in {HOME / 'skripte'} gefunden. Vorhanden: {', '.join(f.name for f in files) or '(leer)'}")
    hits.sort(key=lambda f: (len(f.name), f.name))
    if len(hits) > 1: print(f"Hinweis: mehrere Skripte passen ({', '.join(f.name for f in hits)}), nehme {hits[0].name}")
    return hits[0]

def find_video(spec):
    p = Path(spec).expanduser()
    for cand in (p, HOME / spec, HOME / "original" / spec):
        if cand.is_file(): return cand.resolve()
    stem = Path(spec).stem.lower()
    hits = [f for f in (HOME / "original").glob("*") if f.suffix.lower() in VIDEO_EXT and f.stem.lower() == stem]
    if hits: return hits[0].resolve()
    die(f"Video '{spec}' nicht gefunden (gesucht in {HOME / 'original'}).")

def cmd_init(_):
    for d in DIRS: (HOME / d).mkdir(parents=True, exist_ok=True)
    readme = HOME / "LIESMICH.txt"
    if not readme.exists():
        readme.write_text("""Finanz-Medizin Reels - Arbeitsordner

1. iPhone-Video per AirDrop (Optionen > "Alle Fotodaten" an) nach original/ legen.
2. Skript als Textdatei nach skripte/ legen, z.B. "skript-3.txt".
3. In der Claude-Desktop-App schreiben:
   Schneide original/IMG_1234.MOV, Skript 3, CTA-Wort 'Vorsorge'
4. Das fertige Reel liegt in fertig/ -> per AirDrop zurueck aufs iPhone.

original/ wird nie veraendert. arbeit/ darf jederzeit geloescht werden.
""", encoding="utf-8")
    ex = HOME / "skripte" / "skript-0-beispiel.txt"
    if not ex.exists():
        ex.write_text("# Beispiel. Regieanweisungen in [Klammern] werden nicht eingeblendet.\nDrei Fehler, die Ärzte bei der Altersvorsorge machen.\nFehler Nummer 1: Du verlässt dich nur auf das Versorgungswerk.\n[Pause]\nKommentiere Vorsorge, und ich schicke dir meine Checkliste.\n", encoding="utf-8")
    print(f"Arbeitsordner bereit: {HOME}"); [print("  " + d + "/") for d in DIRS]

def cmd_status(_):
    done = {p.name.split("_20")[0].lower() for p in (HOME / "fertig").glob("*.mp4")}
    vids = sorted(f for f in (HOME / "original").glob("*") if f.suffix.lower() in VIDEO_EXT)
    if not vids: print(f"Keine Videos in {HOME / 'original'}"); return
    for f in vids: print(("✓ fertig   " if f.stem.lower() in done else "· offen    ") + f.name)

def cmd_schneide(a):
    video = find_video(a.video); script = find_script(a.skript)
    stem = video.stem; work = HOME / "arbeit" / stem; work.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(HERE / "talking_head.py"), str(video), "--out", str(work), "--zoom", a.zoom, "--hdr", a.hdr]
    if script:
        txt = work / "skript.txt"; txt.write_text(read_script(script), encoding="utf-8"); cmd += ["--script", str(txt)]
        print(f"Skript: {script.name}")
    if a.cta: cmd += ["--cta", a.cta]
    if a.musik: cmd += ["--music", str(find_music(a.musik))]
    if (HOME / "bilder").is_dir() and any((HOME / "bilder").iterdir()): cmd += ["--images", str(HOME / "bilder")]
    if a.nur_plan: cmd += ["--plan-only"]
    if a.plan: cmd += ["--plan", str(work / "plan.json")]
    print(f"Video: {video.name}  ->  Arbeitsordner {work}")
    r = subprocess.run(cmd)
    if r.returncode != 0: die("Schnitt abgebrochen (Details oben).")
    if a.nur_plan: print(f"\nSchnittplan: {work / 'plan.md'}"); return
    out = work / f"{stem}_reel.mp4"
    if not out.exists(): die("Kein fertiges Video erzeugt.")
    day = datetime.date.today().isoformat(); final = HOME / "fertig" / f"{stem}_{day}.mp4"; k = 2
    while final.exists(): final = HOME / "fertig" / f"{stem}_{day}-{k}.mp4"; k += 1
    shutil.copy2(out, final)
    proj = HOME / "fertig" / "projekte" / final.stem; proj.mkdir(parents=True, exist_ok=True)
    for f in ("plan.md", "plan.json", "captions.srt", "qa-report.md", "poster.jpg", "contactsheet.jpg"):
        if (work / f).exists(): shutil.copy2(work / f, proj / f)
    print(f"\nFERTIG: {final}\nProjekt: {proj}  (Plan, Untertitel .srt, QA-Bericht)")

def find_music(spec):
    for cand in (Path(spec).expanduser(), HOME / "musik" / spec):
        if cand.is_file(): return cand
    if spec in ("bed", "none"): return spec
    die(f"Musik '{spec}' nicht gefunden.")

def main():
    ap = argparse.ArgumentParser(description="Finanz-Medizin Reels: Rohvideo -> fertiges Reel")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init").set_defaults(fn=cmd_init); sub.add_parser("status").set_defaults(fn=cmd_status)
    s = sub.add_parser("schneide"); s.set_defaults(fn=cmd_schneide)
    s.add_argument("video"); s.add_argument("--skript"); s.add_argument("--cta"); s.add_argument("--musik")
    s.add_argument("--zoom", default="subtle", choices=["subtle", "strong", "off"]); s.add_argument("--hdr", default="mobius", choices=["mobius", "clip", "hable", "aus"])
    s.add_argument("--nur-plan", action="store_true"); s.add_argument("--plan", action="store_true", help="geprueften/angepassten Plan aus arbeit/<name>/plan.json verwenden")
    a = ap.parse_args()
    if a.cmd != "init" and not HOME.exists(): die(f"Arbeitsordner {HOME} fehlt - zuerst: python3 fm.py init")
    a.fn(a)

if __name__ == "__main__": main()
