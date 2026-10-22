#!/usr/bin/env python3
"""Rohvideo -> fertiges Instagram Reel (1080x1920, 30 fps, H.264/AAC) im Collage-Stil.

  python3 scripts/make_reel.py rohvideo.mp4 -o mein_reel --lang de
  python3 scripts/make_reel.py rohvideo.mp4 -o mein_reel --script skript.txt --assets meine_bilder/
  python3 scripts/make_reel.py rohvideo.mp4 -o mein_reel --stop-after plan   # EDL prüfen/bearbeiten, dann ohne Flag erneut

Zwischenergebnisse liegen in <out>/work und werden wiederverwendet (--force SCHRITT erzwingt Neuberechnung).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from reelkit import assets as A  # noqa: E402
from reelkit import audio, compose, export, ingest, matte, plan, transcribe  # noqa: E402
from reelkit.util import WARNINGS, load_json, log, save_json  # noqa: E402

STEPS = ["ingest", "transcribe", "plan", "assets", "matte", "render", "audio", "export"]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", help="Rohvideo (Sprecher vor der Kamera)")
    p.add_argument("-o", "--out", help="Ausgabeordner (Standard: <video>_reel)")
    p.add_argument("--lang", help="Sprache, z. B. de oder en (Standard: automatisch)")
    p.add_argument("--script", help="Skript als Textdatei: korrigiert Transkript / ersetzt fehlenden Spracherkenner")
    p.add_argument("--asr", default="auto", choices=["auto", "faster-whisper", "pocketsphinx", "script"])
    p.add_argument("--whisper-model", default=os.environ.get("REELKIT_WHISPER_MODEL", "small"),
                   help="faster-whisper Modellname (tiny/base/small/medium/large-v3) oder lokaler Pfad")
    p.add_argument("--assets", help="Ordner mit eigenen/lizenzierten Bildern (+ optional assets.json)")
    p.add_argument("--pinterest", action="store_true",
                   help="Bilder auf Pinterest suchen, ästhetisch bewerten und verwenden (braucht Zugriff auf pinterest.com)")
    p.add_argument("--online", action="store_true", help="Openverse/Wikimedia (nur kommerziell nutzbare Lizenzen) durchsuchen")
    p.add_argument("--allow-unlicensed", action="store_true",
                   help="Assets mit ungeklärten Rechten (z. B. Pinterest) zulassen – nur für private Entwürfe")
    p.add_argument("--image-gen-cmd", help='Externer Bildgenerator, z. B. "python gen.py --prompt {prompt} --out {out}"')
    p.add_argument("--matte", default="mediapipe-multiclass", choices=["mediapipe-multiclass", "mediapipe-selfie", "none"])
    p.add_argument("--matte-video", help="Eigene Maske/Alpha-Video statt automatischer Freistellung")
    p.add_argument("--music", help="Musik-Datei (wird unter der Stimme geduckt)")
    p.add_argument("--music-db", type=float, default=-20)
    p.add_argument("--sfx-dir", help="Eigene SFX: whoosh.wav, pop.wav, hit.wav")
    p.add_argument("--no-sfx", action="store_true")
    p.add_argument("--cta", help="CTA-Wort, z. B. Vorsorge -> Einblendung 'Kommentiere VORSORGE' + Hervorhebung")
    p.add_argument("--cta-text", default="Kommentiere", help="Text über dem CTA-Wort")
    p.add_argument("--highlight", help="Aktives Untertitelwort einfärben, z. B. F5C542")
    p.add_argument("--no-layers", action="store_true", help="Keine Ebenen-Exporte (schneller)")
    p.add_argument("--previews", type=int, default=0, help="Alle N Frames ein Vorschau-JPG speichern")
    p.add_argument("--stop-after", choices=STEPS)
    p.add_argument("--force", action="append", default=[], choices=STEPS + ["all"])
    a = p.parse_args()

    out = a.out or os.path.splitext(os.path.basename(a.input))[0] + "_reel"
    work = os.path.join(out, "work")
    os.makedirs(work, exist_ok=True)
    force = set(STEPS) if "all" in a.force else set(a.force)

    deps = {"ingest": [], "transcribe": ["ingest"], "plan": ["transcribe"], "assets": ["plan"], "matte": ["ingest"]}

    def f(step):
        # eine erzwungene Stufe invalidiert alle von ihr abhängigen Caches (Freistellung hängt nur am Video)
        return step in force or any(f(d) for d in deps.get(step, []))

    # 1 Import
    info_p = os.path.join(work, "info.json")
    if f("ingest") or not os.path.exists(info_p):
        info = ingest.ingest(a.input, work)
        save_json(info_p, info)
    else:
        info = load_json(info_p)
        log("Import aus Cache")
    if a.stop_after == "ingest":
        return 0

    # 2 Transkription
    tr_p = os.path.join(work, "transcript.json")
    if f("transcribe") or not os.path.exists(tr_p):
        script_text = open(a.script, encoding="utf-8").read() if a.script else None
        tr = transcribe.transcribe(os.path.join(work, "asr.wav"), a.lang, a.asr, script_text, a.whisper_model)
        save_json(tr_p, tr)
    else:
        tr = load_json(tr_p)
        log(f"Transkript aus Cache ({tr['backend']})")
    if a.stop_after == "transcribe":
        return 0

    # 3/4/8 Analyse + EDL
    edl_p = os.path.join(work, "edl.json")
    if f("plan") or not os.path.exists(edl_p):
        edl = plan.build_edl(tr, info["duration"])
        save_json(edl_p, edl)
    else:
        edl = load_json(edl_p)
        log("EDL aus Cache (manuelle Änderungen bleiben erhalten)")
    if a.highlight:
        edl["layout"]["subtitle_highlight"] = [int(a.highlight.strip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    edl.pop("cta", None)
    if a.cta:
        edl["cta"] = plan.cta_block(tr, edl["duration"], a.cta, a.cta_text)
        log(f"CTA '{a.cta}' ab {edl['cta']['start']:.1f}s" + ("" if edl["cta"]["spoken"] else
                                                               " (Wort nicht im Transkript – letzte Sekunden)"))
    if a.stop_after == "plan":
        log(f"EDL: {edl_p}")
        return 0

    # 5-7 Bilder + Rechte
    ledger = A.resolve_assets(edl, work, a.assets, a.online, a.image_gen_cmd, force=f("assets"),
                              allow_unlicensed=a.allow_unlicensed, pinterest=a.pinterest)
    save_json(edl_p, edl)
    if a.stop_after == "assets":
        return 0

    # 9 Freistellung
    matte_backend = matte.compute_matte(work, info, a.matte, a.matte_video, force=f("matte"))
    if a.stop_after == "matte":
        return 0

    # 10-14 Render
    compose.render(edl, work, info, layers=not a.no_layers, preview_every=a.previews)
    if a.stop_after == "render":
        return 0

    # 15 Audio
    audio.mix(work, edl, a.music, a.music_db, a.sfx_dir, a.no_sfx)

    # 16 Export
    final = os.path.join(out, "final.mp4")
    spec = export.mux(work, final)
    sources = ", ".join(sorted({l.get("method", "?") for l in ledger}))
    checks = export.write_project(edl, work, out, ledger, spec, {
        "asr": tr["backend"], "asr_errors": tr.get("errors", []), "matte": matte_backend, "sources": sources})
    ok = all(checks.values())
    log(("FERTIG" if ok else "FERTIG MIT ABWEICHUNGEN") + f": {final}  |  Report: {os.path.join(out, 'report.md')}")
    if WARNINGS:
        log(f"{len(WARNINGS)} Hinweis(e) – siehe report.md")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
