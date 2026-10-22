"""Schritt 16: Finales MP4 muxen, Projektdateien und Report schreiben."""
import csv
import os
import shutil
from urllib.parse import quote_plus

from .util import WARNINGS, log, probe, run

PIN_SEARCH = "https://www.pinterest.com/search/pins/?q="


def ts_srt(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_srt(subs, path):
    with open(path, "w", encoding="utf-8") as fh:
        for i, s in enumerate(subs, 1):
            fh.write(f"{i}\n{ts_srt(s['s'])} --> {ts_srt(s['e'])}\n{s['text']}\n\n")


def mux(work, out_mp4):
    run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(work, "video.mp4"), "-i", os.path.join(work, "mix.wav"),
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-movflags", "+faststart", "-shortest", out_mp4])
    info = probe(out_mp4)
    v = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate", "-of", "default=nw=1", out_mp4])
    a = run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
             "stream=codec_name,sample_rate,channels", "-of", "default=nw=1", out_mp4])
    log(f"Export: {out_mp4} ({info['duration']:.2f}s)")
    return {"video": dict(l.split("=", 1) for l in v.split()), "audio": dict(l.split("=", 1) for l in a.split()),
            "duration": info["duration"], "size_mb": round(os.path.getsize(out_mp4) / 1e6, 2)}


def check_spec(spec):
    v, a = spec["video"], spec["audio"]
    checks = {
        "1080x1920": v.get("width") == "1080" and v.get("height") == "1920",
        "H.264": v.get("codec_name") == "h264",
        "yuv420p": v.get("pix_fmt") == "yuv420p",
        "30 fps": v.get("r_frame_rate") in ("30/1", "30000/1000"),
        "AAC": a.get("codec_name") == "aac",
        "48 kHz": a.get("sample_rate") == "48000",
    }
    return checks


def write_project(edl, work, out_dir, ledger, spec, settings):
    proj = os.path.join(out_dir, "project")
    os.makedirs(proj, exist_ok=True)
    for f in ("edl.json", "transcript.json", "mix.wav", "voice_proc.wav", "sfx.wav"):
        p = os.path.join(work, f)
        if os.path.exists(p):
            shutil.copy2(p, proj)
    if os.path.isdir(os.path.join(work, "layers")):
        dst = os.path.join(proj, "layers")
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(os.path.join(work, "layers"), dst)
    dst = os.path.join(proj, "images")
    shutil.rmtree(dst, ignore_errors=True)
    os.makedirs(dst)
    for l in ledger:
        if os.path.exists(l["file"]):
            shutil.copy2(l["file"], dst)
    write_srt(edl["subtitles"], os.path.join(out_dir, "untertitel.srt"))
    with open(os.path.join(out_dir, "bildrechte.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["zelle", "start_s", "datei", "status", "methode", "lizenz", "quelle", "urheber", "suchanfrage"])
        for l in ledger:
            w.writerow([l.get("cell"), l.get("start", ""), os.path.basename(l["file"]),
                        {"green": "🟢", "yellow": "🟡", "red": "🔴"}.get(l.get("status"), "?"), l.get("method"),
                        l.get("license"), l.get("source"), l.get("author"), l.get("query", "")])

    checks = check_spec(spec)
    cells = ["oben links", "oben rechts", "unten links", "unten rechts"]
    md = [f"# Reel-Report", "",
          f"**Datei:** `final.mp4` · {spec['duration']:.1f} s · {spec['size_mb']} MB",
          "**Spezifikation:** " + " · ".join(f"{'✅' if ok else '❌'} {k}" for k, ok in checks.items()), "",
          "## Verarbeitung",
          f"- Transkription: **{settings['asr']}**" + (f" (Fallbacks: {'; '.join(settings['asr_errors'])})" if settings.get('asr_errors') else ""),
          f"- Freistellung: **{settings['matte']}**",
          f"- Bildquellen: {settings['sources']}",
          f"- Thema: {edl['theme']} · Szenen: {len(edl['scenes'])} · Bildwechsel: {len(edl['events'])}", "",
          "## Szenen & Collagen"]
    for sc in edl["scenes"]:
        md.append(f"\n**{sc['start']:.1f}–{sc['end']:.1f}s · {sc['concept']}** — „{sc['text']}“")
        for c, tr in enumerate(edl["tracks"]):
            for it in tr:
                if sc["start"] - 0.01 <= it["start"] < sc["end"]:
                    trig = f" (Auslöser: „{it['trigger']}“)" if it.get("anim") == "swap" else ""
                    md.append(f"- {it['start']:.2f}s {cells[c]}: {it['art']} / {it['style']}{trig}")
        md.append("  - Pinterest-Suche: " + ", ".join(
            f"[{q}]({PIN_SEARCH}{quote_plus(q)})" for q in
            {it['q_style'] for tr in edl['tracks'] for it in tr if sc['start'] - 0.01 <= it['start'] < sc['end']}))
    reds = sum(1 for l in ledger if l.get("status") == "red")
    yel = sum(1 for l in ledger if l.get("status") == "yellow")
    md += ["", "## Bildrechte", f"{len(ledger)} Bilder · 🔴 {reds} · 🟡 {yel} · Details: `bildrechte.csv`."]
    attrib = [l for l in ledger if l.get("method") in ("openverse", "wikimedia")]
    if attrib:
        md += ["", "**Pflicht-Namensnennung (in die Caption übernehmen):**"] + [
            f"- {l.get('attribution') or (l.get('author', '') + ' – ' + l.get('license', ''))}" for l in attrib]
    pins = [l for l in ledger if l.get("method") == "pinterest"]
    if pins:
        md += ["", f"**Verwendete Pinterest-Pins ({len(pins)}):**"] + [
            f"- Zelle {l.get('cell')} ab {l.get('start', 0):.1f}s: [{(l.get('title') or 'Pin')[:60]}]({l.get('source')})"
            + (f" · Pinner: {l['author']}" if l.get("author") else "") for l in pins]
    md += ["", "## Hinweise"] + ([f"- {w}" for w in WARNINGS] or ["- keine"])
    md += ["", "## Nachbearbeiten",
           "- `project/edl.json` bearbeiten (Zeiten, Motive, `asset`-Pfade, Layout-Werte) und denselben Befehl erneut ausführen –"
           " Transkription und Freistellung kommen aus dem Cache.",
           "- Eigene Schnittsoftware: `project/layers/background.mp4` (Collage), `speaker_green.mp4` (Chroma Key) bzw. "
           "`speaker_matte.mp4` (Luma-Maske), `mix.wav`, `untertitel.srt`."]
    with open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(md) + "\n")
    return checks
