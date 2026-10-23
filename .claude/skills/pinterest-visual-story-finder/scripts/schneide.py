#!/usr/bin/env python3
"""Ordner-Workflow für die Desktop-App: „Schneide original/IMG_1234.MOV, Skript 3, CTA-Wort ‚Vorsorge‘“.

  schneide.py original/IMG_1234.MOV --skript 3 --cta Vorsorge
  schneide.py IMG_1234.MOV --skript 3 --cta Vorsorge --musik musik/beat.mp3

Basisordner: $REELKIT_HOME oder ~/Videos/FinanzMedizin
  original/   Rohvideos vom iPhone (bleiben unverändert)
  skripte/    Skripte als .txt/.md/.docx – „Skript 3“ findet 3.txt, 03_inflation.md oder den Abschnitt
              „Skript 3 von 30 …“ in einem Sammeldokument; nur Text in „…“ wird gesprochen
  bilder/     optionale eigene Bilder (+ assets.json)
  musik/      optionale Musik
  fertig/     fertige Reels: IMG_1234.mp4 (+ IMG_1234_report.md)
  .arbeit/    Zwischenstände je Video (Cache, Projektdateien, Pinterest-Kandidaten)
"""
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.expanduser(os.environ.get("REELKIT_HOME", "~/Videos/FinanzMedizin"))
VIDEO_EXT = (".mov", ".mp4", ".m4v")
SCRIPT_EXT = (".txt", ".md", ".docx")


def find_video(arg):
    cands = [arg, os.path.join(BASE, arg), os.path.join(BASE, "original", arg),
             os.path.join(BASE, "original", os.path.basename(arg))]
    for c in cands:
        if os.path.isfile(os.path.expanduser(c)):
            return os.path.abspath(os.path.expanduser(c))
    stem = os.path.splitext(os.path.basename(arg))[0].lower()
    for f in glob.glob(os.path.join(BASE, "original", "*")):  # Groß-/Kleinschreibung, .MOV vs .mov
        if os.path.splitext(os.path.basename(f))[0].lower() == stem and f.lower().endswith(VIDEO_EXT):
            return f
    have = sorted(os.path.basename(f) for f in glob.glob(os.path.join(BASE, "original", "*")))
    sys.exit(f"Video '{arg}' nicht gefunden. In {BASE}/original liegen: {', '.join(have) or '(nichts)'}")


def read_text(path):
    """Text aus .txt/.md/.docx (Word) lesen. Pages bitte als Word oder Text exportieren."""
    if path.lower().endswith(".docx"):
        import zipfile
        xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
        paras = []
        for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
            t = "".join(re.findall(r"<w:t(?: [^>]*)?>([^<]*)</w:t>", p))
            paras.append(t.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))
        return "\n".join(paras)
    return open(path, encoding="utf-8-sig").read()


HEAD = re.compile(r"^\s*Skript\s+(\d+)\b(?:\s+von\s+\d+)?", re.I | re.M)


def find_script(arg):
    """Liefert (Beschreibung, Text). 'Skript 11' findet eine Datei 11.txt/11_thema.docx ODER den Abschnitt
    'Skript 11 von 30 …' in einem Sammeldokument mit allen Skripten."""
    if not arg:
        return None
    if os.path.isfile(os.path.expanduser(arg)):
        return arg, read_text(os.path.expanduser(arg))
    files = [f for f in glob.glob(os.path.join(BASE, "skripte", "**", "*"), recursive=True)
             if f.lower().endswith(SCRIPT_EXT) and not os.path.basename(f).startswith(("~$", "LIESMICH"))]
    if re.fullmatch(r"\d+", arg.strip()):
        n = int(arg)
        for f in files:  # 1) Abschnitt in einem Sammeldokument
            txt = read_text(f)
            heads = list(HEAD.finditer(txt))
            if len(heads) < 2:
                continue
            for k, h in enumerate(heads):
                if int(h.group(1)) == n:
                    end = next((x.start() for x in heads[k + 1:] if int(x.group(1)) != n), len(txt))
                    return f"{os.path.basename(f)} › Skript {n}", txt[h.start():end]
        hits = [f for f in files if [int(x) for x in re.findall(r"\d+", os.path.basename(f))[:1]] == [n]]
    else:
        hits = [f for f in files if arg.lower() in os.path.basename(f).lower()]
    if len(hits) == 1:
        return hits[0], read_text(hits[0])
    names = ", ".join(sorted(os.path.basename(f) for f in (hits or files))) or "(keine)"
    sys.exit(f"Skript '{arg}' {'mehrdeutig' if hits else 'nicht gefunden'}. Skripte: {names}"
             + ("" if files else " – .pages-Dateien bitte als Word (.docx) oder Text exportieren."))


SKIP_LABEL = re.compile(r"^\s*(cover|titel|cover-titel|einblendung|caption|visuelle|emotion|hashtags?|#)", re.I)
QUOTE = re.compile(r"[„“\"«»]([^„“”\"«»]+)[“”\"«»]")


def clean_script(text, dest):
    """Nur den gesprochenen Text behalten.
    Steht Gesprochenes in Anführungszeichen („…“), werden nur diese Passagen genommen (Format mit HOOK/BODY/CTA,
    Einblendungen und Caption fallen weg). Sonst: Überschriften, #-Zeilen, [Regie], (Pause) und Labels entfernen."""
    lines = [l for l in text.splitlines() if l.strip()]
    quoted = []
    for l in lines:
        if SKIP_LABEL.match(l):
            continue
        quoted += [q.strip() for q in QUOTE.findall(l)]
    if quoted:
        out = quoted
    else:
        out = []
        for l in lines:
            s = l.strip()
            if s.startswith("#") or re.match(r"^[\[(].*[\])]$", s) or HEAD.match(s) or SKIP_LABEL.match(s):
                continue
            if re.fullmatch(r"[A-ZÄÖÜ\- ]{3,}", s):  # Abschnittsüberschrift wie HOOK, BODY
                continue
            s = re.sub(r"^(hook|intro|body|hauptteil|payoff|cta|outro|schluss|gesprochen|szene \d+)\s*[:\-–]\s*",
                       "", s, flags=re.I)
            s = re.sub(r"\[[^\]]*\]|\((?:pause|regie)[^)]*\)", "", s, flags=re.I).strip()
            if s:
                out.append(s)
    out = [re.sub(r"\s*\((?:pause)[^)]*\)\s*", " ", o, flags=re.I).strip() for o in out]
    with open(dest, "w", encoding="utf-8") as fh:
        fh.write(" ".join(out))
    return dest


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video")
    p.add_argument("--skript", help="Nummer oder Name des Skripts in skripte/ (oder Pfad)")
    p.add_argument("--cta", help="CTA-Wort, z. B. Vorsorge")
    p.add_argument("--cta-text", default="Kommentiere")
    p.add_argument("--musik", help="Musikdatei (relativ zum Basisordner möglich)")
    p.add_argument("--ohne-pinterest", action="store_true", help="keine Pinterest-Bilder (nur eigene/generierte)")
    p.add_argument("--neu", action="store_true", help="alles neu berechnen (Cache ignorieren)")
    p.add_argument("--vorschau", action="store_true", help="Vorschau-Frames speichern")
    p.add_argument("--nur-plan", action="store_true",
                   help="nur transkribieren + Bildplan (edl.json) erstellen, damit Claude die Pinterest-Suchen anpasst")
    a, weitere = p.parse_known_args()  # unbekannte Optionen gehen unverändert an make_reel.py

    for d in ("original", "skripte", "bilder", "musik", "fertig", ".arbeit"):
        os.makedirs(os.path.join(BASE, d), exist_ok=True)
    video = find_video(a.video)
    stem = os.path.splitext(os.path.basename(video))[0]
    work = os.path.join(BASE, ".arbeit", stem)
    os.makedirs(work, exist_ok=True)

    cmd = [sys.executable, os.path.join(HERE, "make_reel.py"), video, "-o", work, "--lang", "de"]
    script = find_script(a.skript)
    if script:
        dest = clean_script(script[1], os.path.join(work, "skript_bereinigt.txt"))
        cmd += ["--script", dest]
        print(f"Skript: {script[0]}\nGesprochen: {open(dest, encoding='utf-8').read()}")
    if a.cta:
        cmd += ["--cta", a.cta, "--cta-text", a.cta_text]
    if not a.ohne_pinterest:
        cmd += ["--pinterest"]
    if glob.glob(os.path.join(BASE, "bilder", "*")):
        cmd += ["--assets", os.path.join(BASE, "bilder")]
    if a.musik:
        m = a.musik if os.path.isfile(a.musik) else os.path.join(BASE, a.musik)
        cmd += ["--music", m]
    if a.neu:
        cmd += ["--force", "all"]
    if a.vorschau:
        cmd += ["--previews", "60"]
    if a.nur_plan:
        cmd += ["--stop-after", "plan"]
    cmd += [x for x in weitere if x != "--"]
    print("Starte:", " ".join(cmd), flush=True)
    rc = subprocess.call(cmd)
    if a.nur_plan:
        print(f"\nPLAN FERTIG.\nTranskript: {work}/work/transcript.json\nBildplan:   {work}/work/edl.json\n"
              "Pinterest-Suchen (Feld 'q' je Bildplatz) anpassen, dann ohne --nur-plan erneut starten.")
        return rc
    final = os.path.join(work, "final.mp4")
    if rc not in (0, 1) or not os.path.exists(final):
        sys.exit(f"Schnitt fehlgeschlagen (Code {rc}). Details oben bzw. in {work}")
    dst = os.path.join(BASE, "fertig", f"{stem}.mp4")
    shutil.copy2(final, dst)
    shutil.copy2(os.path.join(work, "report.md"), os.path.join(BASE, "fertig", f"{stem}_report.md"))
    print(f"\nFERTIG: {dst}\nReport: {os.path.join(BASE, 'fertig', stem + '_report.md')}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
