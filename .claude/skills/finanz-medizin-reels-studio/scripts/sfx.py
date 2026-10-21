#!/usr/bin/env python3
"""Sounddesign komplett synthetisch (NumPy/SciPy) -> keine Lizenzfragen. Alle Klaenge sind eigene Erzeugnisse.
   Die Musik ist ein dezentes Platzhalter-Bett; fuer Releases kann eine lizenzierte Spur uebergeben werden (music: Pfad)."""
import numpy as np
from scipy import signal

SR = 44100
rng = np.random.default_rng(7)

def t_(d): return np.arange(int(SR * d)) / SR
def env_exp(n, tau): return np.exp(-np.arange(n) / (SR * tau))
def lp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return signal.sosfilt(signal.butter(o, [a, b], "band", fs=SR, output="sos"), x)
def fade(x, a=0.004, b=0.01):
    n = len(x); fa, fb = min(n, int(SR * a)), min(n, int(SR * b))
    x = x.copy(); x[:fa] *= np.linspace(0, 1, fa); x[-fb:] *= np.linspace(1, 0, fb); return x
def sweep(f0, f1, d, expo=True):
    t = t_(d); f = f0 * (f1 / f0) ** (t / d) if expo else f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR)

def whoosh(d=0.5, **_):
    n = rng.standard_normal(int(SR * d)); t = np.linspace(0, 1, len(n))
    out = np.zeros_like(n); edges = [(200, 900), (500, 2500), (1200, 6000)]
    shape = np.sin(np.pi * t) ** 2
    for a, b in edges: out += bp(n, a, b) * (0.5 + 0.5 * np.sin(np.pi * t)) / len(edges)
    f = np.interp(t, [0, 1], [0.6, 1.0]); return fade(out * shape * f * 1.6, 0.02, 0.05)
def pop(pitch=1.0, **_):
    d = 0.14; x = sweep(900 * pitch, 260 * pitch, d) * env_exp(int(SR * d), 0.035)
    click = hp(rng.standard_normal(int(SR * 0.006)), 3000) * 0.25
    x[: len(click)] += click; return fade(x * 0.9)
def thud(pitch=1.0, **_):
    d = 0.35; x = sweep(120 * pitch, 42 * pitch, d) * env_exp(int(SR * d), 0.09)
    nz = lp(rng.standard_normal(int(SR * d)), 700) * env_exp(int(SR * d), 0.02) * 0.5; return fade(np.tanh((x + nz) * 1.6) * 0.9)
def stamp(**_):
    d = 0.45; b = thud()[: int(SR * d)] * 0.9; crack = hp(rng.standard_normal(int(SR * 0.12)), 1800) * env_exp(int(SR * 0.12), 0.02) * 0.55
    out = np.zeros(int(SR * d)); out[: len(b)] += b; out[: len(crack)] += crack; return fade(out)
def tick(pitch=1.0, **_):
    d = 0.03; x = np.sin(2 * np.pi * 2400 * pitch * t_(d)) * env_exp(int(SR * d), 0.007); return fade(x * 0.5, 0.001, 0.005)
def ding(pitch=1.0, **_):
    d = 0.9; t = t_(d); x = (np.sin(2 * np.pi * 1568 * pitch * t) + 0.45 * np.sin(2 * np.pi * 2349 * pitch * t) + 0.2 * np.sin(2 * np.pi * 3136 * pitch * t)) * env_exp(len(t), 0.18)
    return fade(x * 0.38, 0.002, 0.05)
def scan(d=1.0, **_):
    x = sweep(260, 1500, d) * 0.35 + bp(rng.standard_normal(int(SR * d)), 800, 3000) * 0.15
    return fade(x * np.sin(np.pi * np.linspace(0, 1, len(x))) ** 0.6, 0.02, 0.1)
def riser(d=1.0, **_):
    n = rng.standard_normal(int(SR * d)); x = bp(n, 300, 5000) * np.linspace(0.05, 1, len(n)) ** 2; return fade(x * 0.8, 0.02, 0.01)

LIB = dict(whoosh=whoosh, pop=pop, thud=thud, stamp=stamp, tick=tick, ding=ding, scan=scan, riser=riser)

def render(name, **kw):
    x = LIB[name](**kw); pk = float(np.abs(x).max()); return x * (0.9 / pk) if pk > 0.9 else x

def place(buf, x, t, gain=1.0):
    i = int(t * SR); 
    if i < 0: x = x[-i:]; i = 0
    j = min(len(buf), i + len(x))
    if j > i: buf[i:j] += x[: j - i] * gain

def sfx_track(events, total):
    buf = np.zeros(int(total * SR) + SR)
    for e in events: place(buf, render(e["name"], **e.get("kw", {})), e["t"], e.get("gain", 1.0))
    return buf[: int(total * SR)]

def music_bed(total, bpm=92, seed=3):
    """Ruhiges Bett: Am-F-C-G Pads + gezupfte Achtel. Nur Platzhalter."""
    r = np.random.default_rng(seed); n = int(total * SR); out = np.zeros(n)
    beat = 60 / bpm; bar = 4 * beat; chords = [(57, [0, 3, 7]), (53, [0, 4, 7]), (60, [0, 4, 7]), (55, [0, 4, 7])]
    mf = lambda m: 440 * 2 ** ((m - 69) / 12)
    for b in range(int(total / bar) + 1):
        root, iv = chords[b % 4]; t0 = b * bar; d = bar + 0.6; t = t_(d)
        pad = np.zeros(len(t))
        for k in iv + [12]:
            for det in (-0.004, 0, 0.004): pad += signal.sawtooth(2 * np.pi * mf(root + k) * (1 + det) * t) / 9
        pad = lp(pad, 900) * np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6) * 0.8
        place(out, pad, t0)
        arp = [0, 7, 12, 7, 15, 12, 7, 3] if root == 57 else [0, 4, 7, 12, 7, 4, 7, 4]
        for s, off in enumerate(arp):
            tt = t0 + s * beat / 2; f = mf(root + 12 + off); d2 = 0.5; tt_ = t_(d2)
            nt = (np.sin(2 * np.pi * f * tt_) + 0.3 * np.sin(4 * np.pi * f * tt_)) * env_exp(len(tt_), 0.12) * 0.22
            place(out, nt, tt, 1.0 if s % 2 == 0 else 0.6)
    out = out[:n] * np.minimum(1, np.linspace(0, total, n) / 0.8) * np.minimum(1, (total - np.linspace(0, total, n)) / 1.6)
    return out

def duck(music, voice, depth=0.7, atk=0.04, rel=0.35):
    env = np.abs(voice); k = int(SR * 0.01); m = len(env) // k
    e = env[: m * k].reshape(m, k).max(1); g = np.zeros(m); cur = 0.0
    for i, v in enumerate(e):
        tgt = 1.0 if v > 0.02 else 0.0; a = 1 - np.exp(-0.01 / (atk if tgt > cur else rel)); cur += (tgt - cur) * a; g[i] = cur
    g = np.repeat(g, k)[: len(music)]; g = np.pad(g, (0, len(music) - len(g)), constant_values=0)
    return music * (1 - depth * g)
