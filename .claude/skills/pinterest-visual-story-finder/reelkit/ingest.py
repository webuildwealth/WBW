"""Schritt 1: Rohvideo importieren und normalisieren (30 fps CFR, Rotation angewendet, Audio extrahiert)."""
import os

from .util import log, probe, run, warn

MAX_H = 1920


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
    vf = f"fps={fps},scale=w='trunc(min(iw,iw*{MAX_H}/ih)/2)*2':h='trunc(min(ih,{MAX_H})/2)*2',format=yuv420p"
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
