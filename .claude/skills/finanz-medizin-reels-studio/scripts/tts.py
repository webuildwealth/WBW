#!/usr/bin/env python3
"""Sprachsynthese-Wrapper. Provider:
  pico  - SVOX Pico (apt: libttspico-utils), offline, de-DE. PLATZHALTER-Stimme (hoerbar synthetisch).
  espeak- espeak-ng (apt), noch roboterhafter, nur Fallback.
  file  - eigene Aufnahme je Szene: scene["audio"] = Pfad (z.B. ElevenLabs-Export oder eigene Stimme).
Fuer die Veroeffentlichung: echte Stimme (eigene Aufnahme oder lizenzierter TTS-Dienst) einsetzen."""
import hashlib, shutil, subprocess, sys
from pathlib import Path

FILTER = "aresample=44100,highpass=f=70,equalizer=f=3200:t=q:w=1.2:g=2.5,acompressor=threshold=-22dB:ratio=3:attack=5:release=80,alimiter=limit=0.9"

def have(cmd): return shutil.which(cmd) is not None

def synth(text, out_wav, provider="pico", speed=1.0, cache=None):
    out_wav = Path(out_wav); out_wav.parent.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{provider}|{speed}|{text}|{FILTER}".encode()).hexdigest()[:16]
    if cache:
        c = Path(cache) / f"{key}.wav"
        if c.exists(): shutil.copy(c, out_wav); return out_wav
    raw = out_wav.with_suffix(".raw.wav")
    if provider == "pico":
        if not have("pico2wave"): sys.exit("pico2wave fehlt: apt-get install -y libttspico-utils (oder provider 'file' mit eigenen Aufnahmen)")
        subprocess.run(["pico2wave", "-l", "de-DE", "-w", str(raw), text], check=True)
    elif provider == "espeak":
        if not have("espeak-ng"): sys.exit("espeak-ng fehlt: apt-get install -y espeak-ng")
        subprocess.run(["espeak-ng", "-v", "de", "-s", "165", "-w", str(raw), text], check=True)
    else:
        sys.exit(f"Unbekannter TTS-Provider: {provider}")
    tempo = f",atempo={speed}" if abs(speed - 1) > 1e-3 else ""
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", FILTER + tempo, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(out_wav)], check=True)
    raw.unlink(missing_ok=True)
    if cache:
        Path(cache).mkdir(parents=True, exist_ok=True); shutil.copy(out_wav, Path(cache) / f"{key}.wav")
    return out_wav

def prepare_file(src, out_wav):
    """Eigene Aufnahme -> 44.1 kHz mono WAV, leichte Sprachaufbereitung."""
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vn", "-af", "aresample=44100,highpass=f=70,alimiter=limit=0.9", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(out_wav)], check=True)
    return out_wav

if __name__ == "__main__":
    synth(" ".join(sys.argv[2:]), sys.argv[1])
