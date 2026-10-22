"""Schritte 10-14: Collage, Sprecher, Animationen, Untertitel rendern (1080x1920, 30 fps).

Ausgaben (work/):
  video.mp4                 fertiges Bild ohne Ton (H.264)
  layers/background.mp4     nur Collage (für eigenen Schnitt)
  layers/speaker_green.mp4  Sprecher inkl. Kontur auf Greenscreen (#00B140) – CapCut/Premiere Chroma Key
  layers/speaker_matte.mp4  passende Luma-Maske (weiß = Sprecher) – als Spur-Maske nutzbar
"""
import os
import re

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .util import FrameReader, FrameWriter, font_path, load_json, log, warn

TRANS = 0.32          # Dauer der Einblend-Animation (s)
GREEN = (0, 177, 64)
CTA_GOLD = (245, 197, 66)
# Bitrate gedeckelt: Filmkorn würde sonst 40+ Mbit/s erzeugen (Instagram komprimiert ohnehin neu)
H264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-maxrate", "16M", "-bufsize", "32M",
        "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-vf", "scale=out_color_matrix=bt709:out_range=tv", "-colorspace", "bt709", "-color_primaries", "bt709",
        "-color_trc", "bt709", "-movflags", "+faststart"]
H264_FAST = [{"medium": "veryfast", "19": "21", "16M": "12M"}.get(a, a) for a in H264]


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


class CellImage:
    OVER = 1.25  # Reserve für Zoom/Kamerafahrt

    def __init__(self, path, cw, ch):
        im = Image.open(path).convert("RGB")
        iw, ih = im.size
        s = max(cw / iw, ch / ih) * self.OVER
        self.img = np.array(im.resize((max(cw, int(iw * s + 0.5)), max(ch, int(ih * s + 0.5))), Image.LANCZOS))
        self.cw, self.ch = cw, ch

    def render(self, zoom, pan_x, pan_y):
        rh, rw = self.img.shape[:2]
        a = zoom * max(self.cw / rw, self.ch / rh)
        mx = max(0.0, (rw * a - self.cw) / 2)  # maximal zulässige Verschiebung ohne Ränder
        my = max(0.0, (rh * a - self.ch) / 2)
        bx = self.cw / 2 - a * rw / 2 + pan_x * mx
        by = self.ch / 2 - a * rh / 2 + pan_y * my
        M = np.float32([[a, 0, bx], [0, a, by]])
        return cv2.warpAffine(self.img, M, (self.cw, self.ch), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


class Collage:
    """2x2-Raster ohne Zwischenraum. Jede Zelle hat eine eigene Spur (edl.tracks[cell])."""

    def __init__(self, edl, W, H):
        self.W, self.H = W, H
        self.cw, self.ch = W // 2, H // 2
        self.tracks = edl["tracks"]
        self.kb = edl["layout"].get("ken_burns", 0.08)
        self.cache = {}
        self.origin = [(0, 0), (self.cw, 0), (0, self.ch), (self.cw, self.ch)]

    def img(self, path):
        if path not in self.cache:
            if len(self.cache) > 24:
                self.cache.pop(next(iter(self.cache)))
            self.cache[path] = CellImage(path, self.cw, self.ch)
        return self.cache[path]

    def _item_frame(self, cell, idx, t):
        it = self.tracks[cell][idx]
        dur = max(it["end"] - it["start"], 2.0)
        prog = min(max((t - it["start"]) / dur, 0), 1)
        d = 1 if (cell + idx) % 2 == 0 else -1
        # abwechselnd Zoom-in / Zoom-out, gegenläufige Schwenks je Zelle
        zoom = 1.0 + self.kb * prog if (idx % 2 == 0) else 1.0 + self.kb * (1 - prog)
        pan_x = d * (prog - 0.5) * 0.35
        pan_y = (-d) * (prog - 0.5) * 0.25
        age = t - it["start"]
        if age < TRANS:  # Einblendung: leichter Zoom-Punch
            zoom *= 1 + 0.10 * (1 - ease_out(age / TRANS))
        return self.img(it["asset"]).render(zoom, pan_x, pan_y)

    def render(self, t):
        out = np.empty((self.H, self.W, 3), np.uint8)
        for c, tr in enumerate(self.tracks):
            idx = 0
            for i, it in enumerate(tr):
                if it["start"] <= t:
                    idx = i
            cur = self._item_frame(c, idx, t)
            age = t - tr[idx]["start"]
            if age < TRANS and idx > 0:
                prev = self._item_frame(c, idx - 1, t)
                a = ease_out(age / TRANS)
                cur = cv2.addWeighted(cur, a, prev, 1 - a, 0)
            elif age < TRANS and idx == 0 and tr[idx]["start"] > 0:
                cur = (cur.astype(np.float32) * ease_out(age / TRANS)).astype(np.uint8)
            x, y = self.origin[c]
            out[y:y + self.ch, x:x + self.cw] = cur
        return out


class Subtitles:
    def __init__(self, subs, W, H, lay, cta=None):
        self.subs = subs
        self.cta = re.sub(r"[^\wäöüß]", "", cta["word"].lower()) if cta else None
        self.W, self.H = W, H
        self.y = lay.get("subtitle_y", 0.6) * H
        self.size = int(lay.get("subtitle_size", 66) * W / 1080)
        self.hl = lay.get("subtitle_highlight")
        fp = font_path("bold")
        self.font = ImageFont.truetype(fp, self.size) if fp else ImageFont.load_default()
        if not fp:
            warn("Keine TrueType-Schrift gefunden – Untertitel in Standardschrift.")
        self.cache = {}

    def _render(self, i, active):
        key = (i, active if self.hl else -1)
        if key in self.cache:
            return self.cache[key]
        words = [w["w"] for w in self.subs[i]["words"]]
        text = " ".join(words)
        d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        box = d0.textbbox((0, 0), text, font=self.font, stroke_width=4)
        lines = [words]
        if box[2] - box[0] > int(self.W * 0.86) and len(words) > 1:
            k = len(words) // 2
            lines = [words[:k], words[k:]]
        pad = 30
        lh = int(self.size * 1.18)
        img = Image.new("RGBA", (self.W, lh * len(lines) + pad * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        wi = 0
        for li, ln in enumerate(lines):
            lw = d.textlength(" ".join(ln), font=self.font)
            x = (self.W - lw) / 2
            y = pad + li * lh
            for w in ln:
                col = (255, 255, 255, 255)
                if self.hl and wi == active:
                    col = tuple(self.hl) + (255,)
                if self.cta and re.sub(r"[^\wäöüß]", "", w.lower()).startswith(self.cta):
                    col = CTA_GOLD + (255,)
                d.text((x, y), w, font=self.font, fill=col, stroke_width=4, stroke_fill=(10, 10, 10, 235))
                x += d.textlength(w + " ", font=self.font)
                wi += 1
        a = np.array(img)
        sh = Image.fromarray(a[..., 3]).filter(ImageFilter.GaussianBlur(9))
        shadow = np.zeros_like(a)
        shadow[..., 3] = (np.roll(np.array(sh), 5, 0) * 0.65).astype(np.uint8)
        self.cache[key] = np.array(Image.alpha_composite(Image.fromarray(shadow), img))
        return self.cache[key]

    def overlay(self, frame, t):
        for i, s in enumerate(self.subs):
            if s["s"] <= t < s["e"]:
                active = max([k for k, w in enumerate(s["words"]) if w["s"] <= t] or [0])
                rgba = self._render(i, active)
                age = t - s["s"]
                if age < 0.12:  # Pop-Animation
                    sc = 0.86 + 0.14 * ease_out(age / 0.12)
                    h, w = rgba.shape[:2]
                    rgba = cv2.resize(rgba, (int(w * sc), int(h * sc)), interpolation=cv2.INTER_LINEAR)
                h, w = rgba.shape[:2]
                x0 = (self.W - w) // 2
                y0 = int(self.y - h / 2)
                y0c, y1c = max(0, y0), min(self.H, y0 + h)
                sub = rgba[y0c - y0:y1c - y0]
                a = sub[..., 3:4].astype(np.float32) / 255
                region = frame[y0c:y1c, x0:x0 + w].astype(np.float32)
                frame[y0c:y1c, x0:x0 + w] = (region * (1 - a) + sub[..., :3] * a).astype(np.uint8)
                break
        return frame


class CTA:
    """Animierte Call-to-Action-Karte, z. B. 'Kommentiere VORSORGE' mit Pfeil nach unten (Kommentare)."""

    def __init__(self, cta, W, H):
        self.c = cta
        self.W, self.H = W, H
        self.y = int(H * 0.735)
        small = ImageFont.truetype(font_path("bold"), int(46 * W / 1080)) if font_path("bold") else ImageFont.load_default()
        big = ImageFont.truetype(font_path("black"), int(92 * W / 1080)) if font_path("black") else ImageFont.load_default()
        word = cta["word"].upper()
        d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        tw = max(d0.textlength(cta["text"], font=small), d0.textlength(word, font=big))
        cw, ch = int(tw + 120 * W / 1080), int(205 * W / 1080)
        img = Image.new("RGBA", (cw + 40, ch + 60), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([20, 14, 20 + cw, 14 + ch], radius=int(34 * W / 1080), fill=(14, 14, 14, 232),
                            outline=CTA_GOLD + (255,), width=max(3, int(5 * W / 1080)))
        d.text((20 + cw / 2, 14 + ch * 0.28), cta["text"], font=small, fill=(255, 255, 255, 255), anchor="mm")
        d.text((20 + cw / 2, 14 + ch * 0.66), word, font=big, fill=CTA_GOLD + (255,), anchor="mm")
        ax, ay = 20 + cw / 2, 14 + ch + 8  # Pfeil Richtung Kommentare
        d.polygon([(ax - 22, ay), (ax + 22, ay), (ax, ay + 30)], fill=CTA_GOLD + (255,))
        a = np.array(img)
        sh = Image.fromarray(a[..., 3]).filter(ImageFilter.GaussianBlur(14))
        shadow = np.zeros_like(a)
        shadow[..., 3] = (np.roll(np.array(sh), 8, 0) * 0.6).astype(np.uint8)
        self.rgba = np.array(Image.alpha_composite(Image.fromarray(shadow), img))

    def overlay(self, frame, t):
        c = self.c
        if not (c["start"] <= t < c["end"]):
            return frame
        age = t - c["start"]
        if age < 0.35:  # Pop mit leichtem Überschwingen
            x = age / 0.35
            sc = 0.6 + 0.4 * (1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2)
        else:
            sc = 1 + 0.025 * np.sin((age - 0.35) * 5.0)  # sanftes Pulsieren
        rgba = self.rgba
        if abs(sc - 1) > 0.003:
            h, w = rgba.shape[:2]
            rgba = cv2.resize(rgba, (max(2, int(w * sc)), max(2, int(h * sc))), interpolation=cv2.INTER_LINEAR)
        h, w = rgba.shape[:2]
        x0, y0 = (self.W - w) // 2, self.y - h // 2
        xa, ya, xb, yb = max(0, x0), max(0, y0), min(self.W, x0 + w), min(self.H, y0 + h)
        sub = rgba[ya - y0:yb - y0, xa - x0:xb - x0]
        al = sub[..., 3:4].astype(np.float32) / 255
        reg = frame[ya:yb, xa:xb].astype(np.float32)
        frame[ya:yb, xa:xb] = (reg * (1 - al) + sub[..., :3] * al).astype(np.uint8)
        return frame


class Speaker:
    """Platziert den freigestellten Sprecher so, dass das Gesicht auf dem Kreuzpunkt der Collage sitzt.
    Ohne Maske (backend none): abgerundete Bildkarte als Ersatz."""

    def __init__(self, stats, lay, W, H, sw, sh):
        self.W, self.H = W, H
        self.card = stats.get("backend") == "none"
        if self.card:
            k = (W * 0.58) / sw
            self.M = np.float32([[k, 0, W / 2 - k * sw / 2], [0, k, H * 0.5 - k * sh * 0.45]])
            self.card_box = self._card_box()
        else:
            k = float(np.clip(lay["face_height"] * H / max(stats["face_h"], 1), 0.2, 4.0))
            self.M = np.float32([[k, 0, W / 2 - k * stats["face_cx"]],
                                 [0, k, lay["face_y"] * H - k * stats["face_cy"]]])
        self.bust = int(lay["bust_bottom"] * H)
        r = max(1, int(lay.get("outline_px", 9) * W / 1080))
        self.kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
        self.ocol_img = np.empty((H, W, 3), np.uint8)
        self.ocol_img[:] = lay.get("outline_color", [18, 18, 18])
        self.black = np.zeros((H, W, 3), np.uint8)
        self.sh_op = lay.get("shadow_opacity", 0.45)
        cut = np.ones((H, 1), np.float32)
        cut[self.bust:] = 0  # gerade Schnittkante unter dem Oberkörper (wie im Referenz-Reel)
        self.cut = cv2.GaussianBlur(cut, (1, 5), 0)

    def _card_box(self):
        w, h, r = int(self.W * 0.58), int(self.H * 0.36), 40
        x0 = (self.W - w) // 2
        y0 = int(self.H * 0.5 - h * 0.55)
        m = np.zeros((self.H, self.W), np.uint8)
        cv2.rectangle(m, (x0 + r, y0), (x0 + w - r, y0 + h), 255, -1)
        cv2.rectangle(m, (x0, y0 + r), (x0 + w, y0 + h - r), 255, -1)
        for cx, cy in ((x0 + r, y0 + r), (x0 + w - r, y0 + r), (x0 + r, y0 + h - r), (x0 + w - r, y0 + h - r)):
            cv2.circle(m, (cx, cy), r, 255, -1)
        return m.astype(np.float32) / 255

    def layers(self, frame, mask):
        fg = cv2.warpAffine(frame, self.M, (self.W, self.H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        if self.card:
            m = self.card_box
        else:
            m = cv2.warpAffine(mask, self.M, (self.W, self.H), flags=cv2.INTER_LINEAR).astype(np.float32) / 255
            m *= self.cut
        dil = cv2.dilate((m > 0.4).astype(np.uint8), self.kernel).astype(np.float32)
        ol = cv2.GaussianBlur(dil, (0, 0), 1.2)
        small = cv2.resize(dil, (self.W // 4, self.H // 4), interpolation=cv2.INTER_AREA)
        sh = cv2.resize(cv2.GaussianBlur(small, (0, 0), 6), (self.W, self.H))
        sh = np.roll(sh, int(14 * self.W / 1080), 0) * self.sh_op
        return fg, np.ascontiguousarray(m, np.float32), ol, sh.astype(np.float32)

    def composite(self, bg, fg, m, ol, sh):
        """Schatten -> Kontur -> Sprecher, alles mit OpenCV-blendLinear (SIMD, uint8)."""
        b = cv2.blendLinear(bg, self.black, 1 - sh, sh)
        b = cv2.blendLinear(b, self.ocol_img, 1 - ol, ol)
        return cv2.blendLinear(b, fg, 1 - m, m)


def render(edl, work, info, layers=True, preview_every=0):
    W, H, fps = edl["width"], edl["height"], edl["fps"]
    lay = edl["layout"]
    stats = load_json(os.path.join(work, "matte_stats.json"))
    sw, sh = info["width"], info["height"]
    n_frames = int(round(edl["duration"] * fps))
    collage = Collage(edl, W, H)
    subs = Subtitles(edl["subtitles"], W, H, lay, edl.get("cta"))
    cta = CTA(edl["cta"], W, H) if edl.get("cta") else None
    spk = Speaker(stats, lay, W, H, sw, sh)

    # Filmkorn (6 Varianten, sättigend addiert) + Vignette, vorab berechnet
    rng = np.random.default_rng(7)
    grains = []
    for _ in range(6):
        g = rng.normal(0, 255 * lay.get("grain", 0.06), (H // 2, W // 2)).astype(np.float32)
        g3 = cv2.cvtColor(cv2.resize(g, (W, H), interpolation=cv2.INTER_LINEAR), cv2.COLOR_GRAY2RGB)
        grains.append((np.clip(g3, 0, 255).astype(np.uint8), np.clip(-g3, 0, 255).astype(np.uint8)))
    yy = np.linspace(-1, 1, H, dtype=np.float32)[:, None]
    xx = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
    vig = 1 - lay.get("vignette", 0.35) * (xx ** 2 * 0.6 + yy ** 2 * 0.6)
    vig = cv2.cvtColor((vig * 255).astype(np.uint8), cv2.COLOR_GRAY2RGB)

    reader = FrameReader(os.path.join(work, "source.mp4"), sw, sh)
    mreader = None if spk.card else FrameReader(os.path.join(work, "matte.mkv"), sw, sh, gray=True)
    out = FrameWriter(os.path.join(work, "video.mp4"), W, H, fps, H264)
    lw = []
    if layers:
        ld = os.path.join(work, "layers")
        os.makedirs(ld, exist_ok=True)
        lw = [FrameWriter(os.path.join(ld, n), W, H, fps, H264_FAST)
              for n in ("background.mp4", "speaker_green.mp4", "speaker_matte.mp4")]
    green = np.empty((H, W, 3), np.uint8)
    green[:] = GREEN
    no_shadow = np.zeros((H, W), np.float32)
    last_f, last_m = None, None
    if preview_every:
        os.makedirs(os.path.join(work, "previews"), exist_ok=True)
    for i in range(n_frames):
        t = i / fps
        f = reader.read()
        m = mreader.read() if mreader else None
        if f is None:  # Quelle minimal kürzer als Audio -> letzten Frame halten
            f, m = last_f, last_m
        last_f, last_m = f, m
        bg = cv2.multiply(collage.render(t), vig, scale=1 / 255)
        gp, gn = grains[(i // 2) % len(grains)]
        bg = cv2.subtract(cv2.add(bg, gp), gn)
        fg, mm, ol, shd = spk.layers(f, m)
        frame = subs.overlay(spk.composite(bg, fg, mm, ol, shd), t)
        if cta:
            frame = cta.overlay(frame, t)
        out.write(frame)
        if lw:
            lw[0].write(bg)
            lw[1].write(spk.composite(green, fg, mm, ol, no_shadow))
            lw[2].write(cv2.cvtColor((cv2.max(mm, ol) * 255).astype(np.uint8), cv2.COLOR_GRAY2RGB))
        if preview_every and i % preview_every == 0:
            Image.fromarray(frame).save(os.path.join(work, "previews", f"frame_{i:05d}.jpg"), quality=85)
        if i % 150 == 0:
            log(f"  Render: {i}/{n_frames} Frames ({t:.1f}s)")
    reader.close()
    if mreader:
        mreader.close()
    out.close()
    for w in lw:
        w.close()
    log(f"Render fertig: {n_frames} Frames")
    return os.path.join(work, "video.mp4")
