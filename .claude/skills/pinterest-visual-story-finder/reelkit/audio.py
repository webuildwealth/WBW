"""Schritt 15: Ton – Stimme aufbereiten, Soundeffekte an Bildwechseln, optionale Musik, Mix.

SFX werden synthetisch erzeugt (keine Fremdrechte): Whoosh bei neuer Collage, Pop bei Einzelwechsel,
dumpfer Impact beim Start. Eigene SFX: --sfx-dir mit whoosh.wav / pop.wav / hit.wav.
Musik (--music) wird automatisch unter der Stimme abgesenkt (Sidechain-Ducking).
Loudness-Ziel: -14 LUFS integriert, True Peak -1.5 dBTP (Instagram-/Reels-Praxis).
"""
import os
import wave

import numpy as np

from .util import log, run

SR = 48000


def _env(n, attack, release):
    a = int(n * attack)
    e = np.ones(n, np.float32)
    e[:a] = np.linspace(0, 1, max(a, 1)) ** 2
    e[a:] = np.linspace(1, 0, n - a) ** release
    return e


def synth(kind, rng):
    if kind == "whoosh":
        n = int(SR * 0.55)
        noise = rng.normal(0, 1, n).astype(np.float32)
        # gleitender Tiefpass -> Sweep von dumpf nach hell
        out = np.zeros(n, np.float32)
        y = 0.0
        for i in range(n):
            a = 0.02 + 0.35 * (i / n) ** 1.5
            y += a * (noise[i] - y)
            out[i] = y
        return out * _env(n, 0.7, 2.5) * 0.9
    if kind == "pop":
        n = int(SR * 0.09)
        t = np.arange(n) / SR
        f = 900 * np.exp(-t * 30) + 220
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.03, 3)).astype(np.float32) * 0.6
    if kind == "hit":
        n = int(SR * 0.7)
        t = np.arange(n) / SR
        f = 120 * np.exp(-t * 6) + 40
        body = np.sin(2 * np.pi * np.cumsum(f) / SR)
        return ((body + rng.normal(0, .15, n) * np.exp(-t * 40)) * _env(n, 0.01, 2)).astype(np.float32) * 0.9
    raise ValueError(kind)


def read_wav(path):
    with wave.open(path, "rb") as w:
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        if w.getnchannels() > 1:
            a = a.reshape(-1, w.getnchannels()).mean(axis=1)
        return a, w.getframerate()


def write_wav(path, a, sr=SR):
    a = np.clip(a, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


def build_sfx(edl, work, sfx_dir=None, gain_db=-16):
    rng = np.random.default_rng(3)
    n = int(SR * (edl["duration"] + 1))
    track = np.zeros(n, np.float32)
    lib = {}
    for kind in ("whoosh", "pop", "hit"):
        custom = os.path.join(sfx_dir, f"{kind}.wav") if sfx_dir else None
        if custom and os.path.exists(custom):
            tmp = os.path.join(work, f"sfx_{kind}_48k.wav")
            run(["ffmpeg", "-y", "-v", "error", "-i", custom, "-ac", "1", "-ar", str(SR), tmp])
            lib[kind] = read_wav(tmp)[0]
        else:
            lib[kind] = synth(kind, rng)
    events = list(edl.get("sfx", []))
    if not any(e["type"] == "hit" for e in events):
        events.insert(0, {"t": 0.0, "type": "hit"})
    g = 10 ** (gain_db / 20)
    for e in events:
        s = lib[e["type"]]
        # Whoosh endet auf dem Schnitt, Pop/Hit starten darauf
        start = int((e["t"] - (0.38 if e["type"] == "whoosh" else 0)) * SR)
        start = max(0, start)
        seg = s[: max(0, n - start)]
        track[start:start + len(seg)] += seg * g * (0.55 if e["type"] == "pop" else 1.0)
    p = os.path.join(work, "sfx.wav")
    write_wav(p, track)
    log(f"SFX: {len(events)} Effekte")
    return p


def mix(work, edl, music=None, music_db=-20, sfx_dir=None, no_sfx=False):
    voice = os.path.join(work, "voice.wav")
    vproc = os.path.join(work, "voice_proc.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", voice, "-af",
         "highpass=f=80,lowpass=f=15000,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=4,"
         "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "-ac", "1", vproc])
    inputs = ["-i", vproc]
    chains, labels = [], ["[v]"]
    chains.append("[0:a]aresample=48000,apad[v]")
    idx = 1
    if not no_sfx:
        inputs += ["-i", build_sfx(edl, work, sfx_dir)]
        chains.append(f"[{idx}:a]aresample=48000[s]")
        labels.append("[s]")
        idx += 1
    if music:
        inputs += ["-stream_loop", "-1", "-i", music]
        chains.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=mono,volume={10 ** (music_db / 20):.4f}[mraw]")
        chains[0] = "[0:a]aresample=48000,apad,asplit=2[v][vsc]"
        chains.append("[mraw][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[m]")
        labels.append("[m]")
    fc = ";".join(chains) + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first," \
                             f"alimiter=limit=0.89[out]"
    out = os.path.join(work, "mix.wav")
    run(["ffmpeg", "-y", "-v", "error"] + inputs + ["-filter_complex", fc, "-map", "[out]",
         "-t", f"{edl['duration']:.3f}", "-ar", str(SR), "-ac", "2", out])
    log("Audio-Mix fertig (-14 LUFS Stimme, SFX" + (", Musik geduckt" if music else "") + ")")
    return out
