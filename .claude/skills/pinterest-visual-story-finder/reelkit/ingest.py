"""Schritt 1: Rohvideo importieren und normalisieren (30 fps CFR, Rotation angewendet, Audio extrahiert).

iPhone-Videos: HEVC/H.264 in 1080p oder 4K, oft HDR (HLG bzw. Dolby Vision mit HLG-Basis). HDR wird hier
automatisch per zscale+tonemap auf SDR/BT.709 umgerechnet, sonst wirkt das Reel blass. 4K wird auf
1080 px Breite (Hochformat) verkleinert; die Freistellung arbeitet dadurch schneller ohne sichtbaren Verlust.
"""
import os
import subprocess

from .util import log, probe, run, warn

HDR_TRANSFER = {"arib-std-b67": "arib-std-b67", "smpte2084": "smpte2084"}


def has_filter(name):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True)
    return any(line.split()[1:2] == [name] for line in r.stdout.splitlines() if len(line.split()) > 1)


def hdr_chain(info):
    """Filterkette HDR -> SDR (BT.709) oder '' bei SDR-Material."""
    tin = HDR_TRANSFER.get(info.get("transfer", ""))
    if not tin:
        return ""
    if not (has_filter("zscale") and has_filter("tonemap")):
        warn("HDR-Video erkannt, aber FFmpeg ohne zscale/tonemap – Farben wirken blass. "
             "Lösung: FFmpeg mit libzimg (Homebrew-ffmpeg hat es) oder am iPhone HDR-Video ausschalten.")
        return ""
    log(f"HDR erkannt ({'HLG' if tin == 'arib-std-b67' else 'PQ'}) -> Tonemapping auf SDR/BT.709")
    return (f"zscale=tin={tin}:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,format=gbrpf32le,"
            "zscale=p=bt709,tonemap=tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=tv,")


def ingest(src, work, fps=30):
    """Erzeugt work/source.mp4 (30 fps, max. 1920 px Höhe), work/voice.wav (48 kHz) und work/asr.wav (16 kHz mono)."""
    if not os.path.exists(src):
        raise SystemExit(f"Eingabevideo nicht gefunden: {src}")
    info = probe(src)
    log(f"Import: {src} ({info['width']}x{info['height']}, {info['fps']:.2f} fps, {info['duration']:.1f}s)")
    if info["duration"] < 1:
        raise SystemExit("Video ist kürzer als 1 Sekunde.")
    out = os.path.join(work, "source.mp4")
    # FFmpeg wendet Rotations-Metadaten (Handy-Videos) beim Dekodieren automatisch an.
    # Kurze Seite max. 1080 px (4K -> 1080p), gerade Pixelmaße.
    scale = "scale=w='if(gt(iw,ih),-2,min(1080,iw))':h='if(gt(iw,ih),min(1080,ih),-2)':flags=lanczos"
    vf = f"{hdr_chain(info)}{scale},fps={fps},format=yuv420p"
    run(["ffmpeg", "-y", "-v", "error", "-i", src, "-map", "0:v:0", "-vf", vf,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-an", out])
    voice = os.path.join(work, "voice.wav")
    asr = os.path.join(work, "asr.wav")
    if info["has_audio"]:
        run(["ffmpeg", "-y", "-v", "error", "-i", src, "-map", "0:a:0", "-ac", "1", "-ar", "48000", voice])
        run(["ffmpeg", "-y", "-v", "error", "-i", voice, "-ac", "1", "-ar", "16000", asr])
    else:
        warn("Video hat keine Tonspur: Transkription nur über --script möglich, Reel bleibt stumm (nur SFX).")
        run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
             "-t", f"{info['duration']:.3f}", voice])
        run(["ffmpeg", "-y", "-v", "error", "-i", voice, "-ar", "16000", asr])
    norm = probe(out)
    norm["has_audio"] = info["has_audio"]
    norm["fps"] = fps
    return norm
