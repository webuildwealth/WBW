#!/usr/bin/env python3
"""Ein-Satz-Workflow für den Mac-Ordner ~/Videos/FinanzMedizin

  reel.py original/IMG_1234.MOV --skript 3 --cta Vorsorge

Ordner (Basis: $FM_HOME oder ~/Videos/FinanzMedizin):
  original/   iPhone-Originale (AirDrop „Alle Fotodaten“), bleiben unverändert
  skripte/    Transkripte/Skripte als .txt, z. B. „3.txt“, „03 Altersvorsorge.txt“, „Skript 3.txt“
  fotos/      eigene lizenzierte Personenfotos (Stichwörter im Dateinamen, Nachweis in gleichnamiger .txt)
  arbeit/     Zwischendateien je Video (kann gelöscht werden)
  fertig/     IMG_1234_reel.mp4 (+ _qc.md, _bildnachweise.txt)
"""
import argparse, os, pathlib, re, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
HOME = pathlib.Path(os.environ.get("FM_HOME", pathlib.Path.home() / "Videos" / "FinanzMedizin")).expanduser()


def find_script(sel):
    d = HOME / "skripte"
    p = pathlib.Path(sel).expanduser()
    if p.exists():
        return p
    if (d / sel).exists():
        return d / sel
    cands = [f for f in d.glob("*.txt") if re.match(rf"^(skript[ _-]*)?0*{re.escape(sel)}(\D|$)", f.stem, re.I)]
    if len(cands) == 1:
        return cands[0]
    if len(cands) > 1:
        sys.exit("Mehrere Skripte passen: " + ", ".join(c.name for c in cands))
    sys.exit(f"Skript '{sel}' nicht gefunden in {d}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", help="z. B. original/IMG_1234.MOV")
    ap.add_argument("--skript", help="Nummer, Name oder Pfad des Skripts")
    ap.add_argument("--cta", help="CTA-Wort, z. B. Vorsorge")
    ap.add_argument("--review", action="store_true", help="nur Storyboard + Vorschau-Stills")
    a, extra = ap.parse_known_args()  # unbekannte Optionen gehen an build_reel.py
    for sub in ("original", "skripte", "fotos", "arbeit", "fertig"):
        (HOME / sub).mkdir(parents=True, exist_ok=True)
    v = pathlib.Path(a.video).expanduser()
    if not v.is_absolute():
        v = HOME / v if (HOME / v).exists() else HOME / "original" / v.name
    if not v.exists():
        sys.exit(f"Video nicht gefunden: {v}")
    work = HOME / "arbeit" / v.stem
    cmd = [sys.executable, str(HERE / "build_reel.py"), "--video", str(v), "--out-dir", str(work)]
    if a.skript:
        cmd += ["--transcript", str(find_script(a.skript))]
    if a.cta:
        cmd += ["--cta", a.cta]
    if a.review:
        cmd += ["--review"]
    env = dict(os.environ)
    if (HOME / "fotos").exists():
        env.setdefault("FM_IMAGE_DIR", str(HOME / "fotos"))
    cmd += extra
    print("$", " ".join(cmd))
    r = subprocess.run(cmd, env=env)
    if r.returncode:
        sys.exit(r.returncode)
    if a.review:
        print(f"Vorschau-Stills: {work / 'previews'}"); return
    out = HOME / "fertig" / f"{v.stem}_reel.mp4"
    shutil.copy2(work / "reel.mp4", out)
    if (work / "qc" / "report.md").exists():
        shutil.copy2(work / "qc" / "report.md", HOME / "fertig" / f"{v.stem}_qc.md")
    if (work / "credits.txt").exists():
        shutil.copy2(work / "credits.txt", HOME / "fertig" / f"{v.stem}_bildnachweise.txt")
    print(f"\nFERTIG: {out}")


if __name__ == "__main__":
    main()
