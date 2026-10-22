#!/usr/bin/env python3
"""Sounddesign: rechtefreie, selbst synthetisierte Effekte + optionales Musikbett -> sfx.wav / music.wav

  sfx.py resolved.json -o sfx.wav [--music-out music.wav] [--list]

Alle Klänge werden hier mit numpy erzeugt (keine fremden Samples -> keine Lizenzfragen).
Automatische Platzierung aus dem Storyboard:
  Szenenübergang (außer 'cut') -> whoosh | Badge/Callout/Warnschild -> pop | Zähler -> tick-Serie
  Stempel (Mythos) -> thud | Lücke im Balkendiagramm -> rise + ding | Checkmarks im Vergleich -> pop
Eigene Effekte je Szene: "sfx": ["ding"] oder [{"name":"pop","t":1.2}] (t relativ zum Szenenbeginn).
"""
import argparse, json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env(n, a=0.005, d=None):
    t = np.arange(n) / SR
    d = d or n / SR
    return np.minimum(1, t / a) * np.exp(-t / (d / 4))


def lp(x, cutoff):  # einpoliger Tiefpass, cutoff pro Sample (Array) oder Zahl
    c = np.broadcast_to(cutoff, x.shape).astype(float)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s)
        y[i] = s
    return y


def whoosh(dur=0.38):
    n = int(SR * dur)
    x = rng.standard_normal(n)
    sweep = np.linspace(400, 5200, n) * (1 - np.abs(np.linspace(-1, 1, n)) ** 2 * .6)
    y = lp(x, sweep)
    y -= lp(y, 300)
    win = np.sin(np.linspace(0, np.pi, n)) ** 2
    return y * win * 2.2


def pop(dur=0.14):
    n = int(SR * dur); t = np.arange(n) / SR
    f = 620 * np.exp(-t * 14) + 260
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.002, dur) * 0.9


def tick(dur=0.03):
    n = int(SR * dur); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 2600 * t) * np.exp(-t * 180) * 0.5


def thud(dur=0.45):
    n = int(SR * dur); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (95 * np.exp(-t * 6) + 48) * t) * np.exp(-t * 9)
    nz = lp(rng.standard_normal(n), 1800) * np.exp(-t * 40) * .5
    return (body + nz) * 1.1


def ding(dur=0.9):
    n = int(SR * dur); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * 1318.5 * t) + .45 * np.sin(2 * np.pi * 1976 * t) + .2 * np.sin(2 * np.pi * 2637 * t)
    return y * np.minimum(1, t / .004) * np.exp(-t * 5.5) * .45


def rise(dur=1.2):
    n = int(SR * dur); t = np.arange(n) / SR
    f = 180 + 900 * (t / dur) ** 2
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * .35 + lp(rng.standard_normal(n), 500 + 5000 * (t / dur) ** 2) * .5
    return y * (t / dur) ** 1.5 * np.minimum(1, (dur - t) / .03)


BANK = {"whoosh": (whoosh, -17), "pop": (pop, -16), "tick": (tick, -22), "thud": (thud, -14), "ding": (ding, -17), "rise": (rise, -22)}


def plan(sb):
    ev = []
    for i, sc in enumerate(sb["scenes"]):
        st, p, ty = sc["start"], sc.get("props", {}), sc["type"]
        if i > 0 and sc.get("transition", "push") != "cut":
            ev.append((st, "whoosh", 0))
        if ty == "character" and p.get("badge"):
            ev.append((st + p["badge"].get("t", .5), "pop", 0))
        if ty == "character" and p.get("warn"):
            ev.append((st + p["warn"].get("t", .8), "pop", 0))
        if ty in ("counter", "stat"):
            ct = p.get("count_time", min((sc["end"] - st) * .7, 2.2))
            n = int(ct / .075)
            for k in range(n):
                ev.append((st + .15 + k * .075, "tick", -3 * (1 - k / max(n, 1))))
        if ty == "myth":
            ev.append((st + p.get("stamp_t", 1.3), "thud", 0))
        if ty == "gap_bars":
            ev.append((st + .25, "rise", 0))
            d_ = sc["end"] - st; k_ = min(1, max(.4, d_ / 3.4))
            ev.append((st + min(p.get("gap_t", 1.9 * k_), max(.6, d_ - .8)), "ding", 0))
        if ty == "compare":
            for k in range(len(p.get("left", {}).get("items", []))):
                ev.append((st + .8 + k * .55, "pop", -4))
            for k in range(len(p.get("right", {}).get("items", []))):
                ev.append((st + .95 + k * .55, "pop", -4))
        if ty == "inflation":
            ev.append((st + .6 + max(1.2, (sc["end"] - st) * .6), "thud", -4))
        if ty == "bullets":
            for k in range(len(p.get("items", []))):
                ev.append((st + .3 + k * .6, "pop", -3))
        for c in sc.get("callouts", []):
            ev.append((st + c.get("t", 0), "pop", -2))
        for x in sc.get("sfx", []):
            name, t = (x, 0) if isinstance(x, str) else (x["name"], x.get("t", 0))
            ev.append((st + t, name, 0))
    return sorted(ev)


def render(sb, dur):
    n = int(SR * dur)
    out = np.zeros(n)
    for t, name, g in plan(sb):
        fn, db = BANK[name]
        x = fn()
        x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** ((db + g) / 20)
        i = int(t * SR)
        if i < n:
            out[i:i + len(x)] += x[:n - i]
    return out


def music(dur):
    """Schlichtes, ruhiges Pad (Am–F–C–G, je 4 s). Platzhalter – für Markenmusik eigene lizenzierte Datei per --music nutzen."""
    n = int(SR * dur); t = np.arange(n) / SR
    chords = [(220.0, 261.63, 329.63), (174.61, 220.0, 261.63), (261.63, 329.63, 392.0), (196.0, 246.94, 293.66)]
    y = np.zeros(n)
    for i, ch in enumerate(chords * int(dur // 16 + 2)):
        s, e = int(i * 4 * SR), int((i + 1) * 4 * SR + SR)
        if s >= n:
            break
        seg_t = np.arange(min(e, n) - s) / SR
        a = np.minimum(1, seg_t / 1.2) * np.minimum(1, (len(seg_t) / SR - seg_t) / 1.2 + 0.0001)
        for f in ch:
            y[s:min(e, n)] += np.sin(2 * np.pi * f * seg_t + .3 * np.sin(2 * np.pi * .2 * seg_t)) * a * .18
            y[s:min(e, n)] += np.sin(2 * np.pi * f * 2.003 * seg_t) * a * .05
    y *= np.minimum(1, t / 1.5) * np.minimum(1, (dur - t) / 1.5)
    return y / (np.max(np.abs(y)) + 1e-9) * 0.5


def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard")
    ap.add_argument("-o", "--out", default="sfx.wav")
    ap.add_argument("--music-out")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    sb = json.load(open(a.storyboard, encoding="utf-8"))
    dur = sb["meta"]["duration"]
    if a.list:
        for t, n, g in plan(sb):
            print(f"{t:7.2f}s {n}")
    write(a.out, render(sb, dur))
    print(f"{len(plan(sb))} Effekte -> {a.out}")
    if a.music_out:
        write(a.music_out, music(dur))
        print(f"Musikbett -> {a.music_out}")
