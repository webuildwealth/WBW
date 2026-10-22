"""Offline-Bildgenerator (rechtlich unbedenklicher Fallback, 100 % selbst erzeugt).

Erzeugt Motive (Dollar, Sanduhr, Pferd, Villa …) in den vier Ästhetiken des Referenz-Reels:
  dark     zerknittertes schwarzes Papier, hartes Licht        (wie die Dollarnote oben links)
  vintage  Sepia, Raster, Lichtleck, Kratzer                    (analoges Foto/Druck)
  naive    Wachsmalkreide auf Himmel/Wiese, wackelige Linien    (wie die Kinderzeichnung)
  baroque  dunkles Ölgemälde, Goldakzente, Craquelé             (wie das Barockpferd)
Das ist kein Ersatz für echte Fotos/Gemälde, liefert aber stilistisch passende, rechtefreie Bilder,
wenn weder eigene Assets noch lizenzierte Quellen verfügbar sind.
"""
import hashlib
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .util import font_path

W, H = 720, 1280

PALETTES = {
    "dark": {"bg": (20, 20, 21), "main": (176, 186, 162), "second": (120, 132, 112), "accent": (214, 196, 128),
             "line": (40, 48, 40), "light": (226, 228, 210), "dark": (30, 34, 30)},
    "vintage": {"bg": (214, 196, 160), "main": (150, 110, 70), "second": (96, 70, 50), "accent": (182, 70, 50),
                "line": (54, 38, 28), "light": (236, 222, 190), "dark": (60, 44, 32)},
    "naive": {"bg": (70, 120, 205), "main": (214, 160, 50), "second": (240, 238, 228), "accent": (205, 50, 45),
              "line": (25, 22, 20), "light": (250, 248, 238), "dark": (40, 34, 30)},
    "baroque": {"bg": (48, 38, 22), "main": (226, 218, 198), "second": (120, 70, 40), "accent": (206, 162, 64),
                "line": (40, 26, 14), "light": (244, 232, 204), "dark": (34, 24, 14)},
}
PALETTES["luxury"] = PALETTES["baroque"]
PALETTES["surreal"] = PALETTES["vintage"]


# ---------------------------------------------------------------- Zeichenwerkzeug
class Pen:
    def __init__(self, img, wobble=0.0, rng=None):
        self.img = img
        self.d = ImageDraw.Draw(img)
        self.wob = wobble
        self.rng = rng or np.random.default_rng(0)

    def _wobble(self, pts, closed=True):
        if self.wob <= 0:
            return [tuple(map(float, p)) for p in pts]
        out = []
        n = len(pts)
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            a, b = np.array(pts[i], float), np.array(pts[(i + 1) % n], float)
            seg = max(2, int(np.linalg.norm(b - a) / 18))
            for k in range(seg):
                p = a + (b - a) * k / seg + self.rng.normal(0, self.wob, 2)
                out.append(tuple(p))
        if not closed:
            out.append(tuple(np.array(pts[-1], float) + self.rng.normal(0, self.wob, 2)))
        return out

    def poly(self, pts, fill=None, outline=None, width=0):
        p = self._wobble(pts)
        if fill is not None:
            self.d.polygon(p, fill=fill)
        if outline is not None and width:
            self.d.line(p + [p[0]], fill=outline, width=width, joint="curve")

    def ellipse(self, cx, cy, rx, ry, fill=None, outline=None, width=0, rot=0.0, n=64):
        t = np.linspace(0, 2 * np.pi, n, endpoint=False)
        x, y = rx * np.cos(t), ry * np.sin(t)
        c, s = math.cos(rot), math.sin(rot)
        pts = list(zip(cx + x * c - y * s, cy + x * s + y * c))
        self.poly(pts, fill, outline, width)

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=0):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, outline, width)

    def line(self, pts, fill, width):
        p = self._wobble(pts, closed=False)
        self.d.line(p, fill=fill, width=width, joint="curve")

    def text(self, x, y, s, size, fill, anchor="mm"):
        fp = font_path("black")
        f = ImageFont.truetype(fp, size) if fp else ImageFont.load_default()
        self.d.text((x, y), s, font=f, fill=fill, anchor=anchor)


def rotated(layer, deg, center=None):
    return layer.rotate(deg, resample=Image.BICUBIC, center=center)


# ---------------------------------------------------------------- Motive
# Signatur: f(pen, cx, cy, s, P, rng)  s = Grundgröße in px, P = Palette

def m_dollar_note(pen, cx, cy, s, P, rng, rot=None):
    layer = Image.new("RGBA", pen.img.size, (0, 0, 0, 0))
    p = Pen(layer, pen.wob, pen.rng)
    w, h = s * 1.25, s * 0.53
    x0, y0 = cx - w / 2, cy - h / 2
    p.rect(x0, y0, x0 + w, y0 + h, fill=P["main"] + (255,), outline=P["line"] + (255,), width=4)
    p.rect(x0 + w * .04, y0 + h * .08, x0 + w * .96, y0 + h * .92, outline=P["second"] + (255,), width=5)
    p.ellipse(cx, cy, w * .14, h * .32, fill=P["second"] + (255,), outline=P["line"] + (255,), width=4)
    p.ellipse(cx, cy - h * .05, w * .06, h * .12, fill=P["light"] + (200,))
    p.ellipse(cx + w * .3, cy, h * .17, h * .17, outline=P["accent"] + (255,), width=6)
    for sx, sy in ((-.4, -.3), (.4, -.3), (-.4, .3), (.4, .3)):
        p.text(cx + w * sx, cy + h * sy, "1", int(h * .22), P["line"] + (255,))
    p.text(cx - w * .3, cy, "ONE", int(h * .13), P["line"] + (220,))
    rot = rng.uniform(-28, 28) if rot is None else rot
    pen.img.alpha_composite(rotated(layer, rot, (cx, cy)))


def m_cash_pile(pen, cx, cy, s, P, rng):
    for i in range(70):
        a = rng.uniform(0, math.pi)
        r = rng.uniform(0, 1) ** 0.6
        x = cx + math.cos(a) * r * s * 1.0 * (1 if rng.random() > .5 else -1)
        y = cy + s * 0.55 - abs(math.sin(a)) * r * s * 0.9 + rng.normal(0, s * .05)
        m_dollar_note(pen, x, y, s * rng.uniform(.38, .5), P, rng)


def m_coins(pen, cx, cy, s, P, rng):
    gold = P["accent"]
    for col, n in ((-0.45, 6), (0.0, 10), (0.42, 4)):
        x = cx + col * s
        for k in range(n):
            y = cy + s * 0.5 - k * s * 0.09
            pen.ellipse(x, y + s * .03, s * .2, s * .07, fill=tuple(int(c * .6) for c in gold) + (255,))
            pen.ellipse(x, y, s * .2, s * .07, fill=gold + (255,), outline=P["line"] + (255,), width=3)
    for _ in range(5):
        pen.ellipse(cx + rng.uniform(-.8, .8) * s, cy + s * rng.uniform(.6, .8), s * .13, s * .05,
                    fill=gold + (255,), outline=P["line"] + (255,), width=2)


def m_gold_bars(pen, cx, cy, s, P, rng):
    g = P["accent"]
    dark = tuple(int(c * .65) for c in g)
    light = tuple(min(255, int(c * 1.25)) for c in g)
    bw, bh = s * .55, s * .2
    for row, n in enumerate((3, 2, 1)):
        for i in range(n):
            x = cx + (i - (n - 1) / 2) * bw
            y = cy + s * .45 - row * bh
            pen.poly([(x - bw / 2, y), (x + bw / 2, y), (x + bw * .4, y - bh * .55), (x - bw * .4, y - bh * .55)],
                     fill=light + (255,), outline=P["line"] + (255,), width=3)
            pen.rect(x - bw / 2, y, x + bw / 2, y + bh * .45, fill=dark + (255,), outline=P["line"] + (255,), width=3)


def m_hourglass(pen, cx, cy, s, P, rng):
    wood = P["second"]
    sand = P["accent"]
    pen.rect(cx - s * .45, cy - s * .75, cx + s * .45, cy - s * .65, fill=wood + (255,), outline=P["line"] + (255,), width=3)
    pen.rect(cx - s * .45, cy + s * .65, cx + s * .45, cy + s * .75, fill=wood + (255,), outline=P["line"] + (255,), width=3)
    glass = [(cx - s * .35, cy - s * .65), (cx + s * .35, cy - s * .65), (cx + s * .04, cy), (cx + s * .35, cy + s * .65),
             (cx - s * .35, cy + s * .65), (cx - s * .04, cy)]
    pen.poly(glass, fill=P["light"] + (70,), outline=P["line"] + (255,), width=4)
    pen.poly([(cx - s * .15, cy - s * .3), (cx + s * .15, cy - s * .3), (cx + s * .03, cy - s * .03), (cx - s * .03, cy - s * .03)],
             fill=sand + (255,))
    pen.poly([(cx - s * .33, cy + s * .64), (cx + s * .33, cy + s * .64), (cx, cy + s * .32)], fill=sand + (255,))
    pen.line([(cx, cy), (cx, cy + s * .34)], sand + (255,), 3)
    for x in (-.42, .42):
        pen.rect(cx + x * s - s * .025, cy - s * .65, cx + x * s + s * .025, cy + s * .65, fill=wood + (255,))


def m_clock(pen, cx, cy, s, P, rng):
    pen.ellipse(cx, cy, s * .55, s * .55, fill=P["accent"] + (255,), outline=P["line"] + (255,), width=5)
    pen.ellipse(cx, cy, s * .47, s * .47, fill=P["light"] + (255,), outline=P["line"] + (255,), width=3)
    for k in range(12):
        a = k * math.pi / 6
        r0, r1 = s * (.38 if k % 3 else .33), s * .44
        pen.line([(cx + r0 * math.sin(a), cy - r0 * math.cos(a)), (cx + r1 * math.sin(a), cy - r1 * math.cos(a))],
                 P["line"] + (255,), 6 if k % 3 == 0 else 3)
    h, m = rng.uniform(0, 2 * math.pi), rng.uniform(0, 2 * math.pi)
    pen.line([(cx, cy), (cx + s * .22 * math.sin(h), cy - s * .22 * math.cos(h))], P["line"] + (255,), 9)
    pen.line([(cx, cy), (cx + s * .36 * math.sin(m), cy - s * .36 * math.cos(m))], P["line"] + (255,), 5)
    pen.ellipse(cx, cy, s * .03, s * .03, fill=P["line"] + (255,))
    pen.rect(cx - s * .06, cy - s * .7, cx + s * .06, cy - s * .55, fill=P["accent"] + (255,), outline=P["line"] + (255,), width=3)
    pen.ellipse(cx, cy - s * .76, s * .09, s * .07, outline=P["accent"] + (255,), width=6)
    pts = [(cx + s * .05, cy - s * .8)]
    for k in range(1, 9):
        pts.append((cx + s * (.05 + k * .08), cy - s * .8 + math.sin(k / 8 * math.pi) * s * .5 + k * s * .06))
    pen.line(pts, P["accent"] + (255,), 5)


def m_house(pen, cx, cy, s, P, rng):
    wall, roof = P["light"], P["accent"]
    pen.rect(cx - s * .5, cy - s * .15, cx + s * .5, cy + s * .55, fill=wall + (255,), outline=P["line"] + (255,), width=5)
    pen.poly([(cx - s * .62, cy - s * .12), (cx, cy - s * .62), (cx + s * .62, cy - s * .12)], fill=roof + (255,),
             outline=P["line"] + (255,), width=5)
    pen.rect(cx + s * .25, cy - s * .55, cx + s * .37, cy - s * .32, fill=P["second"] + (255,), outline=P["line"] + (255,), width=3)
    pen.rect(cx - s * .1, cy + s * .2, cx + s * .1, cy + s * .55, fill=P["second"] + (255,), outline=P["line"] + (255,), width=4)
    for x in (-.33, .33):
        pen.rect(cx + x * s - s * .1, cy + s * .02, cx + x * s + s * .1, cy + s * .2, fill=P["main"] + (255,),
                 outline=P["line"] + (255,), width=4)


def m_villa(pen, cx, cy, s, P, rng):
    wall = P["light"]
    pen.rect(cx - s * .8, cy - s * .1, cx + s * .8, cy + s * .5, fill=wall + (255,), outline=P["line"] + (255,), width=4)
    pen.poly([(cx - s * .9, cy - s * .1), (cx + s * .9, cy - s * .1), (cx + s * .8, cy - s * .22), (cx - s * .8, cy - s * .22)],
             fill=P["second"] + (255,), outline=P["line"] + (255,), width=4)
    pen.poly([(cx - s * .35, cy - s * .1), (cx, cy - s * .38), (cx + s * .35, cy - s * .1)], fill=wall + (255,),
             outline=P["line"] + (255,), width=4)
    for k in range(-3, 4):
        x = cx + k * s * .1
        pen.rect(x - s * .025, cy - s * .1, x + s * .025, cy + s * .42, fill=P["main"] + (255,), outline=P["line"] + (255,), width=2)
    for x in (-.65, -.48, .48, .65):
        pen.rect(cx + x * s - s * .05, cy + s * .02, cx + x * s + s * .05, cy + s * .2, fill=P["dark"] + (255,))
        pen.rect(cx + x * s - s * .05, cy + s * .27, cx + x * s + s * .05, cy + s * .42, fill=P["dark"] + (255,))
    for k in range(3):
        pen.rect(cx - s * (.4 + k * .06), cy + s * (.42 + k * .04), cx + s * (.4 + k * .06), cy + s * (.46 + k * .04),
                 fill=P["main"] + (255,), outline=P["line"] + (255,), width=2)


def m_bread(pen, cx, cy, s, P, rng):
    pen.ellipse(cx, cy + s * .25, s * .85, s * .2, fill=P["light"] + (255,), outline=P["line"] + (255,), width=3)
    crust = (190, 120, 50) if True else P["main"]
    pen.ellipse(cx, cy, s * .65, s * .3, fill=crust + (255,), outline=P["line"] + (255,), width=4, rot=-.08)
    pen.ellipse(cx - s * .05, cy - s * .08, s * .45, s * .13, fill=tuple(min(255, c + 40) for c in crust) + (255,), rot=-.08)
    for k in range(-2, 3):
        x = cx + k * s * .2
        pen.line([(x - s * .06, cy - s * .15), (x + s * .07, cy + s * .08)], P["line"] + (255,), 5)


def m_coffee(pen, cx, cy, s, P, rng):
    pen.ellipse(cx, cy + s * .45, s * .65, s * .14, fill=P["light"] + (255,), outline=P["line"] + (255,), width=4)
    pen.poly([(cx - s * .4, cy - s * .15), (cx + s * .4, cy - s * .15), (cx + s * .3, cy + s * .42), (cx - s * .3, cy + s * .42)],
             fill=P["light"] + (255,), outline=P["line"] + (255,), width=5)
    pen.ellipse(cx + s * .48, cy + s * .1, s * .14, s * .16, outline=P["line"] + (255,), width=10)
    pen.ellipse(cx, cy - s * .15, s * .4, s * .08, fill=P["second"] + (255,), outline=P["line"] + (255,), width=4)
    pen.rect(cx - s * .38, cy + s * .02, cx + s * .36, cy + s * .08, fill=P["accent"] + (255,))
    for k in (-1, 0, 1):
        x = cx + k * s * .14
        pts = [(x + math.sin(t * 2.2 + k) * s * .05, cy - s * .25 - t * s * .12) for t in np.linspace(0, 4, 12)]
        pen.line(pts, P["light"] + (150,), 6)


def m_price_tag(pen, cx, cy, s, P, rng):
    layer = Image.new("RGBA", pen.img.size, (0, 0, 0, 0))
    p = Pen(layer, pen.wob, pen.rng)
    w, h = s * .55, s * 1.0
    p.poly([(cx - w / 2, cy - h / 2 + w * .3), (cx, cy - h / 2), (cx + w / 2, cy - h / 2 + w * .3),
            (cx + w / 2, cy + h / 2), (cx - w / 2, cy + h / 2)], fill=P["light"] + (255,), outline=P["line"] + (255,), width=5)
    p.ellipse(cx, cy - h / 2 + w * .25, w * .08, w * .08, fill=P["bg"] + (255,), outline=P["line"] + (255,), width=3)
    p.text(cx, cy + h * .12, "5¢", int(w * .5), P["accent"] + (255,))
    p.line([(cx - w * .3, cy + h * .38), (cx + w * .3, cy + h * .38)], P["line"] + (255,), 4)
    pen.line([(cx, cy - h / 2 + w * .25), (cx - s * .35, cy - s * 1.0), (cx - s * .2, cy - s * 1.3)], P["second"] + (255,), 4)
    pen.img.alpha_composite(rotated(layer, rng.uniform(-18, 18), (cx, cy)))


def m_chart(pen, cx, cy, s, P, rng, up=True):
    x0, x1, y0, y1 = cx - s * .7, cx + s * .7, cy - s * .7, cy + s * .6
    for k in range(6):
        y = y0 + (y1 - y0) * k / 5
        pen.line([(x0, y), (x1, y)], P["line"] + (70,), 2)
    pen.line([(x0, y0), (x0, y1), (x1, y1)], P["line"] + (255,), 6)
    n = 9
    pts = []
    for k in range(n):
        t = k / (n - 1)
        v = (t ** 1.8 if up else 1 - t ** 0.7) + rng.normal(0, .07)
        pts.append((x0 + (x1 - x0) * t, y1 - (y1 - y0) * (0.08 + 0.85 * max(0, min(1, v)))))
    pen.line(pts, P["accent"] + (255,), 12)
    ex, ey = pts[-1]
    px, py = pts[-2]
    a = math.atan2(ey - py, ex - px)
    pen.poly([(ex + math.cos(a) * s * .1, ey + math.sin(a) * s * .1),
              (ex + math.cos(a + 2.5) * s * .1, ey + math.sin(a + 2.5) * s * .1),
              (ex + math.cos(a - 2.5) * s * .1, ey + math.sin(a - 2.5) * s * .1)], fill=P["accent"] + (255,))


def m_chart_up(pen, cx, cy, s, P, rng):
    m_chart(pen, cx, cy, s, P, rng, True)


def m_chart_down(pen, cx, cy, s, P, rng):
    m_chart(pen, cx, cy, s, P, rng, False)


def m_ladder(pen, cx, cy, s, P, rng):
    top, bot = cy - s * 1.1, cy + s * .8
    for side in (-1, 1):
        pen.line([(cx + side * s * .35, bot), (cx + side * s * .1, top)], P["second"] + (255,), 12)
    for k in range(12):
        t = k / 11
        y = bot + (top - bot) * t
        hw = s * (.35 - .25 * t)
        pen.line([(cx - hw, y), (cx + hw, y)], P["second"] + (255,), max(3, int(9 - 6 * t)))
    pen.ellipse(cx, top - s * .1, s * .25, s * .1, fill=P["light"] + (180,))


def m_chains(pen, cx, cy, s, P, rng):
    for k in range(-4, 5):
        x, y = cx + k * s * .2, cy + k * s * .26
        rot = 0.9 if k % 2 else 0.9 + math.pi / 2
        pen.ellipse(x, y, s * .17, s * .09, outline=P["line"] + (255,), width=18, rot=rot)
        pen.ellipse(x, y, s * .17, s * .09, outline=P["accent"] + (255,), width=10, rot=rot)


def m_sun_landscape(pen, cx, cy, s, P, rng):
    Wd, Hd = pen.img.size
    hor = cy + s * .15
    pen.ellipse(cx + s * .2, hor - s * .25, s * .38, s * .38, fill=P["accent"] + (255,))
    cols = [P["second"], P["main"], P["dark"]]
    for i, c in enumerate(cols):
        base = hor + i * s * .22
        pts = [(0, Hd)]
        for k in range(13):
            x = Wd * k / 12
            pts.append((x, base + math.sin(k * .9 + i * 2 + rng.uniform(0, 1)) * s * .1))
        pts.append((Wd, Hd))
        pen.poly(pts, fill=c + (255,))


def m_bank(pen, cx, cy, s, P, rng):
    pen.poly([(cx - s * .8, cy - s * .3), (cx, cy - s * .7), (cx + s * .8, cy - s * .3)], fill=P["light"] + (255,),
             outline=P["line"] + (255,), width=5)
    pen.rect(cx - s * .8, cy - s * .3, cx + s * .8, cy - s * .2, fill=P["main"] + (255,), outline=P["line"] + (255,), width=4)
    for k in range(-3, 4):
        x = cx + k * s * .22
        pen.rect(x - s * .06, cy - s * .2, x + s * .06, cy + s * .45, fill=P["light"] + (255,), outline=P["line"] + (255,), width=3)
        pen.line([(x, cy - s * .18), (x, cy + s * .43)], P["main"] + (160,), 3)
    for k in range(3):
        pen.rect(cx - s * (.85 + k * .07), cy + s * (.45 + k * .07), cx + s * (.85 + k * .07), cy + s * (.52 + k * .07),
                 fill=P["main"] + (255,), outline=P["line"] + (255,), width=3)
    pen.text(cx, cy - s * .4, "BANK", int(s * .14), P["line"] + (255,))


def m_horse(pen, cx, cy, s, P, rng):
    # Pferdekopf im Profil (normierte Kontur, nach links blickend)
    pts = [(.55, -.95), (.62, -.7), (.7, -.4), (.75, 0), (.8, .5), (.85, .95), (-.1, .95), (-.05, .55), (-.25, .3),
           (-.6, .2), (-.85, .15), (-.92, 0), (-.85, -.12), (-.55, -.35), (-.2, -.6), (.1, -.8), (.25, -.95),
           (.35, -1.2), (.45, -.98)]
    coat = P["light"] if pen.wob == 0 else P["main"]
    poly = [(cx + x * s * .7, cy + y * s * .7) for x, y in pts]
    pen.poly(poly, fill=coat + (255,), outline=P["line"] + (255,), width=6)
    mane = [(.55, -.95), (.75, -.7), (.95, -.3), (1.0, .2), (1.05, .95), (.85, .95), (.8, .5), (.75, 0), (.7, -.4), (.62, -.7)]
    pen.poly([(cx + x * s * .7, cy + y * s * .7) for x, y in mane], fill=P["dark"] + (255,), outline=P["line"] + (255,), width=4)
    pen.ellipse(cx - s * .08, cy - s * .2, s * .05, s * .04, fill=P["line"] + (255,))
    pen.ellipse(cx - s * .55, cy + s * .02, s * .04, s * .03, fill=P["line"] + (255,))
    if pen.wob == 0:  # Zaumzeug in Gold (Barock)
        g = P["accent"] + (255,)
        pen.line([(cx - s * .45, cy - s * .2), (cx + s * .35, cy - s * .55)], g, 9)
        pen.line([(cx - s * .45, cy + s * .05), (cx + s * .1, cy + s * .25), (cx + s * .45, cy + s * .2)], g, 9)
        pen.line([(cx + s * .05, cy - s * .38), (cx + s * .1, cy + s * .25)], g, 9)
        for t in np.linspace(0, 1, 6):
            pen.ellipse(cx - s * .45 + t * s * .8, cy - s * .2 - t * s * .35, s * .03, s * .03, fill=g)


def m_crown(pen, cx, cy, s, P, rng):
    g, dk = P["accent"], tuple(int(c * .6) for c in P["accent"])
    pts = [(cx - s * .6, cy + s * .3), (cx - s * .65, cy - s * .35), (cx - s * .3, cy - s * .05), (cx, cy - s * .5),
           (cx + s * .3, cy - s * .05), (cx + s * .65, cy - s * .35), (cx + s * .6, cy + s * .3)]
    pen.poly(pts, fill=g + (255,), outline=P["line"] + (255,), width=5)
    pen.rect(cx - s * .62, cy + s * .2, cx + s * .62, cy + s * .4, fill=dk + (255,), outline=P["line"] + (255,), width=4)
    for x, y in ((-.65, -.35), (0, -.5), (.65, -.35)):
        pen.ellipse(cx + x * s, cy + y * s - s * .05, s * .07, s * .07, fill=P["light"] + (255,), outline=P["line"] + (255,), width=3)
    for k, col in enumerate(((180, 30, 40), (40, 90, 170), (30, 130, 70))):
        pen.ellipse(cx + (k - 1) * s * .35, cy + s * .3, s * .07, s * .05, fill=col + (255,))


def m_flame(pen, cx, cy, s, P, rng):
    m_dollar_note(pen, cx, cy + s * .55, s * .8, P, rng, rot=rng.uniform(-8, 8))
    for scale, col, a in ((1.0, (200, 70, 20), 230), (.72, (240, 140, 30), 240), (.42, (255, 220, 120), 255)):
        pts = []
        for t in np.linspace(0, 2 * np.pi, 40):
            r = s * .5 * scale * (1 + .25 * math.sin(5 * t + rng.uniform(0, .5)))
            x = cx + r * math.sin(t) * .8
            y = cy + s * .35 - abs(r * math.cos(t)) * (1.8 if math.cos(t) > 0 else .4)
            pts.append((x, y))
        pen.poly(pts, fill=col + (a,))


def m_key(pen, cx, cy, s, P, rng):
    layer = Image.new("RGBA", pen.img.size, (0, 0, 0, 0))
    p = Pen(layer, pen.wob, pen.rng)
    g = P["accent"] + (255,)
    p.ellipse(cx - s * .55, cy, s * .28, s * .28, outline=g, width=int(s * .09))
    p.rect(cx - s * .3, cy - s * .05, cx + s * .7, cy + s * .05, fill=g)
    for x, h in ((.45, .2), (.6, .28)):
        p.rect(cx + x * s - s * .04, cy, cx + x * s + s * .04, cy + h * s, fill=g)
    p.ellipse(cx - s * .55, cy, s * .1, s * .1, outline=P["line"] + (180,), width=3)
    pen.img.alpha_composite(rotated(layer, rng.uniform(-40, 40), (cx, cy)))


def m_scale(pen, cx, cy, s, P, rng):
    g = P["accent"] + (255,)
    pen.rect(cx - s * .03, cy - s * .6, cx + s * .03, cy + s * .55, fill=g)
    pen.rect(cx - s * .3, cy + s * .55, cx + s * .3, cy + s * .65, fill=g, outline=P["line"] + (255,), width=3)
    tilt = rng.uniform(-.12, .12)
    for side in (-1, 1):
        x, y = cx + side * s * .7, cy - s * .5 + side * tilt * s
        pen.line([(cx, cy - s * .5), (x, y)], g, 8)
        pen.line([(x, y), (x - s * .22, y + s * .45)], P["line"] + (200,), 2)
        pen.line([(x, y), (x + s * .22, y + s * .45)], P["line"] + (200,), 2)
        pen.poly([(x - s * .26, y + s * .45), (x + s * .26, y + s * .45), (x + s * .16, y + s * .55), (x - s * .16, y + s * .55)],
                 fill=g, outline=P["line"] + (255,), width=3)
    pen.ellipse(cx, cy - s * .62, s * .05, s * .05, fill=g)


def m_piggy(pen, cx, cy, s, P, rng):
    pink = (226, 150, 160) if pen.wob else P["main"]
    for x in (-.4, -.15, .2, .42):
        pen.rect(cx + x * s - s * .07, cy + s * .2, cx + x * s + s * .07, cy + s * .48, fill=pink + (255,), outline=P["line"] + (255,), width=3)
    pen.ellipse(cx, cy, s * .65, s * .42, fill=pink + (255,), outline=P["line"] + (255,), width=5)
    pen.ellipse(cx - s * .66, cy - s * .02, s * .1, s * .14, fill=pink + (255,), outline=P["line"] + (255,), width=4)
    for dy in (-.05, .05):
        pen.ellipse(cx - s * .68, cy + dy * s, s * .02, s * .025, fill=P["line"] + (255,))
    pen.poly([(cx - s * .38, cy - s * .32), (cx - s * .28, cy - s * .55), (cx - s * .15, cy - s * .38)], fill=pink + (255,),
             outline=P["line"] + (255,), width=4)
    pen.ellipse(cx - s * .42, cy - s * .12, s * .03, s * .03, fill=P["line"] + (255,))
    pen.rect(cx - s * .1, cy - s * .42, cx + s * .15, cy - s * .38, fill=P["line"] + (255,))
    pen.ellipse(cx + s * .02, cy - s * .62, s * .14, s * .14, fill=P["accent"] + (255,), outline=P["line"] + (255,), width=3)


def m_tree(pen, cx, cy, s, P, rng):
    def branch(x, y, ang, length, width, depth):
        x2, y2 = x + math.cos(ang) * length, y + math.sin(ang) * length
        pen.line([(x, y), (x2, y2)], P["second"] + (255,), max(2, int(width)))
        if depth == 0:
            pen.ellipse(x2, y2, s * .14, s * .11, fill=P["main"] + (230,))
            return
        for d in (-.45, .4):
            branch(x2, y2, ang + d + rng.normal(0, .12), length * .72, width * .68, depth - 1)
    pen.poly([(cx - s * .12, cy + s * .8), (cx + s * .12, cy + s * .8), (cx + s * .06, cy + s * .2), (cx - s * .06, cy + s * .2)],
             fill=P["second"] + (255,))
    branch(cx, cy + s * .25, -math.pi / 2, s * .45, s * .1, 5)
    for k in range(6):
        pen.ellipse(cx + (k - 2.5) * s * .2, cy + s * .82, s * .09, s * .03, fill=P["accent"] + (255,))


def m_wave(pen, cx, cy, s, P, rng):
    Wd, Hd = pen.img.size
    sea = (38, 74, 128)
    pen.rect(0, cy + s * .3, Wd, Hd, fill=sea + (255,))
    pts = [(cx - s * 1.2, cy + s * .6)]
    for t in np.linspace(0, 1, 30):
        a = math.pi * 1.25 * t
        r = s * (.9 - .45 * t)
        pts.append((cx + math.cos(math.pi - a) * r, cy - math.sin(a) * r * .9 + s * .1))
    pts += [(cx + s * .1, cy + s * .2), (cx + s * .9, cy + s * .6)]
    pen.poly(pts, fill=sea + (255,), outline=P["line"] + (255,), width=4)
    for k in range(18):
        a = math.pi * 1.25 * k / 17
        r = s * (.9 - .45 * k / 17)
        pen.ellipse(cx + math.cos(math.pi - a) * r, cy - math.sin(a) * r * .9 + s * .1, s * .06, s * .05, fill=P["light"] + (255,))
    for k in range(5):
        y = cy + s * (.5 + k * .12)
        pen.line([(x, y + math.sin(x / 40 + k) * 8) for x in np.linspace(0, Wd, 20)], P["light"] + (140,), 4)


def m_chess(pen, cx, cy, s, P, rng):
    c = P["dark"] if pen.wob == 0 and P is PALETTES["vintage"] else P["light"]
    pen.ellipse(cx, cy + s * .62, s * .45, s * .1, fill=c + (255,), outline=P["line"] + (255,), width=4)
    pen.poly([(cx - s * .38, cy + s * .6), (cx + s * .38, cy + s * .6), (cx + s * .3, cy + s * .45), (cx - s * .3, cy + s * .45)],
             fill=c + (255,), outline=P["line"] + (255,), width=4)
    pen.poly([(cx - s * .28, cy + s * .45), (cx + s * .28, cy + s * .45), (cx + s * .14, cy - s * .2), (cx - s * .14, cy - s * .2)],
             fill=c + (255,), outline=P["line"] + (255,), width=4)
    pen.ellipse(cx, cy - s * .22, s * .25, s * .07, fill=c + (255,), outline=P["line"] + (255,), width=4)
    pen.poly([(cx - s * .2, cy - s * .25), (cx + s * .2, cy - s * .25), (cx + s * .1, cy - s * .5), (cx - s * .1, cy - s * .5)],
             fill=c + (255,), outline=P["line"] + (255,), width=4)
    pen.rect(cx - s * .03, cy - s * .75, cx + s * .03, cy - s * .5, fill=P["accent"] + (255,))
    pen.rect(cx - s * .1, cy - s * .67, cx + s * .1, cy - s * .61, fill=P["accent"] + (255,))


def m_newspaper(pen, cx, cy, s, P, rng):
    layer = Image.new("RGBA", pen.img.size, (0, 0, 0, 0))
    p = Pen(layer, pen.wob, pen.rng)
    w, h = s * 1.2, s * 1.6
    x0, y0 = cx - w / 2, cy - h / 2
    p.rect(x0, y0, x0 + w, y0 + h, fill=(232, 224, 204, 255), outline=P["line"] + (255,), width=3)
    p.text(cx, y0 + h * .07, "THE DAILY", int(h * .06), (30, 26, 22, 255))
    p.line([(x0 + w * .05, y0 + h * .12), (x0 + w * .95, y0 + h * .12)], (30, 26, 22, 255), 4)
    p.rect(x0 + w * .05, y0 + h * .15, x0 + w * .95, y0 + h * .22, fill=(40, 34, 30, 255))
    p.rect(x0 + w * .05, y0 + h * .25, x0 + w * .55, y0 + h * .55, fill=(120, 110, 96, 255))
    for col in range(3):
        cx0 = x0 + w * (.05 + col * .31)
        y_start = .58 if col < 2 else .25
        for k in range(int((.95 - y_start) / .025)):
            y = y0 + h * (y_start + k * .025)
            p.line([(cx0, y), (cx0 + w * .27 * rng.uniform(.75, 1), y)], (90, 84, 76, 255), 3)
    pen.img.alpha_composite(rotated(layer, rng.uniform(-12, 12), (cx, cy)))


def m_old_photo(pen, cx, cy, s, P, rng):
    layer = Image.new("RGBA", pen.img.size, (0, 0, 0, 0))
    p = Pen(layer, pen.wob, pen.rng)
    w, h = s * 1.2, s * 1.45
    x0, y0 = cx - w / 2, cy - h / 2
    p.rect(x0, y0, x0 + w, y0 + h, fill=(238, 230, 214, 255))
    ix0, iy0, ix1, iy1 = x0 + w * .06, y0 + w * .06, x0 + w * .94, y0 + h * .8
    p.rect(ix0, iy0, ix1, iy1, fill=(150, 140, 125, 255))
    for k in range(5):
        bx = ix0 + (ix1 - ix0) * k / 5
        bh = (iy1 - iy0) * rng.uniform(.35, .7)
        p.rect(bx, iy1 - bh - (iy1 - iy0) * .15, bx + (ix1 - ix0) / 5 - 4, iy1 - (iy1 - iy0) * .15, fill=(90 + k * 8, 84 + k * 6, 74, 255))
    p.rect(ix0, iy1 - (iy1 - iy0) * .15, ix1, iy1, fill=(70, 64, 58, 255))
    car_y = iy1 - (iy1 - iy0) * .17
    p.rect(cx - w * .2, car_y - w * .08, cx + w * .2, car_y, fill=(40, 36, 32, 255))
    p.rect(cx - w * .1, car_y - w * .14, cx + w * .08, car_y - w * .08, fill=(40, 36, 32, 255))
    for x in (-.13, .13):
        p.ellipse(cx + x * w, car_y, w * .04, w * .04, fill=(20, 18, 16, 255))
    pen.img.alpha_composite(rotated(layer, rng.uniform(-10, 10), (cx, cy)))


def m_cart(pen, cx, cy, s, P, rng):
    c = P["line"] + (255,)
    for k, col in enumerate((P["accent"], P["main"], P["light"], P["second"])):
        pen.ellipse(cx - s * .3 + k * s * .2, cy - s * .2 - (k % 2) * s * .08, s * .14, s * .16, fill=col + (255,), outline=c, width=3)
    pen.poly([(cx - s * .6, cy - s * .2), (cx + s * .55, cy - s * .2), (cx + s * .4, cy + s * .3), (cx - s * .45, cy + s * .3)],
             outline=c, width=7)
    for k in range(1, 6):
        x = cx - s * .6 + k * s * .19
        pen.line([(x, cy - s * .2), (x - s * .03, cy + s * .3)], c, 3)
    pen.line([(cx - s * .6, cy - s * .2), (cx - s * .8, cy - s * .45), (cx - s * .95, cy - s * .45)], c, 7)
    pen.line([(cx - s * .45, cy + s * .3), (cx - s * .5, cy + s * .45), (cx + s * .45, cy + s * .45)], c, 6)
    for x in (-.4, .35):
        pen.ellipse(cx + x * s, cy + s * .55, s * .08, s * .08, fill=c, outline=c, width=2)


MOTIFS = {k[2:]: v for k, v in globals().items() if k.startswith("m_") and k not in ("m_chart",)}


# ---------------------------------------------------------------- Texturen & Stile
def _lowfreq(rng, shape, scale):
    small = rng.random((max(2, shape[0] // scale), max(2, shape[1] // scale))).astype(np.float32)
    return np.array(Image.fromarray((small * 255).astype(np.uint8)).resize((shape[1], shape[0]), Image.BICUBIC),
                    np.float32) / 255.0


def crumple(rng, h, w, n=26):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    shade = np.zeros((h, w), np.float32)
    for _ in range(n):
        a = rng.uniform(0, np.pi)
        px, py = rng.uniform(0, w), rng.uniform(0, h)
        d = (xx - px) * math.cos(a) + (yy - py) * math.sin(a)
        shade += rng.uniform(.04, .12) * np.tanh(d / rng.uniform(6, 30)) * rng.choice([-1, 1])
    return shade


def emboss(alpha, k=9, strength=.35):
    a = alpha.astype(np.float32)
    b = np.array(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(k)), np.float32) / 255
    hl = np.roll(np.roll(b, k // 2, 0), k // 2, 1) - np.roll(np.roll(b, -k // 2, 0), -k // 2, 1)
    return 1 + strength * hl


def craquelure(rng, h, w, n=260):
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for _ in range(n):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        pts = [(x, y)]
        a = rng.uniform(0, 2 * np.pi)
        for _ in range(rng.integers(3, 8)):
            a += rng.normal(0, .7)
            x += math.cos(a) * rng.uniform(10, 40)
            y += math.sin(a) * rng.uniform(10, 40)
            pts.append((x, y))
        d.line(pts, fill=int(rng.uniform(60, 160)), width=1)
    return np.array(img, np.float32) / 255


def crayon_texture(rng, h, w):
    big = max(h, w) * 2
    n = rng.random((big // 2, big)).astype(np.float32)
    im = Image.fromarray((n * 255).astype(np.uint8)).resize((big, big), Image.NEAREST)
    im = im.filter(ImageFilter.BoxBlur(1)).rotate(rng.uniform(-35, 35), resample=Image.BILINEAR)
    x0, y0 = (big - w) // 2, (big - h) // 2
    return np.array(im.crop((x0, y0, x0 + w, y0 + h)), np.float32) / 255


def background(style, P, rng, h=H, w=W):
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    xx = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    bg = np.ones((h, w, 3), np.float32) * np.array(P["bg"], np.float32) / 255
    if style == "dark":
        shade = crumple(rng, h, w)
        light = 1.1 - 0.5 * np.sqrt((xx - .3) ** 2 + (yy - .25) ** 2)
        bg = bg * (1 + 1.6 * shade[..., None]) * light[..., None] + 0.03 * (_lowfreq(rng, (h, w), 40)[..., None] - .5)
    elif style == "vintage":
        bg = bg * (0.92 + 0.12 * _lowfreq(rng, (h, w), 60)[..., None]) * (1.05 - 0.25 * yy[..., None])
    elif style == "naive":
        sky = np.array(P["bg"], np.float32) / 255
        grass = np.array((80, 165, 60), np.float32) / 255
        horizon = 0.62 + 0.04 * np.sin(xx * 7 + rng.uniform(0, 6))
        m = (yy > horizon).astype(np.float32)
        bg = sky * (1 - m[..., None]) + grass * m[..., None]
        tex = crayon_texture(rng, h, w)
        bg = bg * (0.78 + 0.32 * tex[..., None])
        bg = np.where((tex > .93)[..., None], 0.94, bg)
    elif style in ("baroque", "luxury"):
        r = np.sqrt((xx - .4) ** 2 + ((yy - .35) * 1.2) ** 2)
        warm = np.array((92, 70, 38), np.float32) / 255
        deep = np.array((14, 12, 8), np.float32) / 255
        t = np.clip(r * 1.6, 0, 1)[..., None]
        bg = warm * (1 - t) + deep * t
        bg = bg * (0.9 + 0.2 * _lowfreq(rng, (h, w), 25)[..., None])
    return np.clip(bg, 0, 1)


def finish(img, style, rng):
    h, w = img.shape[:2]
    yy = np.linspace(-1, 1, h, dtype=np.float32)[:, None]
    xx = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
    vig = 1 - 0.35 * (xx ** 2 + yy ** 2)
    if style == "vintage":
        lum = img @ np.array([.3, .59, .11], np.float32)
        sep = np.stack([lum * 1.07 + .05, lum * .9 + .04, lum * .7 + .02], -1)
        img = 0.75 * sep + 0.25 * img
        dots = (np.sin(np.arange(w)[None, :] * .9) * np.sin(np.arange(h)[:, None] * .9))
        img = img * (1 - 0.05 * (dots[..., None] > .2))
        cx, cy = rng.choice([0.0, 1.0]), rng.uniform(0, .4)
        leak = np.exp(-(((np.linspace(0, 1, w)[None, :] - cx) ** 2) + ((np.linspace(0, 1, h)[:, None] - cy) ** 2)) / .08)
        img = 1 - (1 - img) * (1 - 0.35 * leak[..., None] * np.array([1, .55, .25], np.float32))
        for _ in range(rng.integers(3, 9)):
            x = int(rng.uniform(0, w))
            img[:, x:x + 1] *= rng.uniform(.75, .95)
        img = img * 0.88 + 0.08
        vig = 1 - 0.45 * (xx ** 2 + yy ** 2)
    elif style == "dark":
        vig = 1 - 0.6 * (xx ** 2 + (yy * .9) ** 2)
    elif style in ("baroque", "luxury"):
        cr = craquelure(rng, h, w)
        img = img * (1 - 0.35 * cr[..., None])
        img = img * np.array([1.04, 0.98, 0.82], np.float32)
        img = np.array(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8)),
                       np.float32) / 255
        vig = 1 - 0.55 * (xx ** 2 + yy ** 2)
    img = img * vig[..., None]
    img = img + rng.normal(0, 0.025, img.shape).astype(np.float32)
    return np.clip(img, 0, 1)


def generate(art, style="dark", out_path=None, seed=0, anchor=(0.5, 0.5)):
    """Rendert ein Motiv in einem Stil. anchor = Motivzentrum (relativ), damit die Bildmitte
    der Collage (Sprecher) frei bleibt."""
    if art not in MOTIFS:
        art = "dollar_note"
    style = style if style in PALETTES else "dark"
    h = int(hashlib.md5(f"{art}|{style}|{seed}".encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(h)
    P = PALETTES[style]
    bg = background(style, P, rng)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pen = Pen(layer, wobble=3.2 if style == "naive" else 0.0, rng=rng)
    s = W * 0.56
    MOTIFS[art](pen, W * anchor[0], H * anchor[1], s, P, rng)
    rgba = np.array(layer, np.float32) / 255
    rgb, a = rgba[..., :3], rgba[..., 3]
    if style == "naive":
        tex = crayon_texture(rng, H, W)
        rgb = rgb * (0.8 + 0.3 * tex[..., None])
        a = a * np.where(tex > .9, .55, 1.0)
    else:
        rgb = rgb * emboss(a, 11, .45 if style == "dark" else .3)[..., None]
    if style == "dark":
        rgb = rgb * (1 + 1.2 * crumple(rng, H, W, 18)[..., None])
    # Schlagschatten
    sh = np.array(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14)), np.float32) / 255
    sh = np.roll(np.roll(sh, 16, 0), 12, 1) * (0.55 if style != "naive" else 0.15)
    out = bg * (1 - sh[..., None]) * (1 - a[..., None]) + np.clip(rgb, 0, 1) * a[..., None]
    out = finish(out, style, rng)
    img = Image.fromarray((out * 255).astype(np.uint8))
    if out_path:
        img.save(out_path, quality=92)
    return img
