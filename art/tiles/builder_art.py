"""
Build mode's decorations (src/state/buildmode.ts): the props a player places in their own city, in the service
buildings' kit style (services/kit.py: sun from the left, left faces x0.9, right x0.72, tops x1.04, a soft ground
shadow under a 1 px outline, ambient occlusion where things stand). Every sprite is deco:<kind>; lit parts go on
deco:<kind>@lights. Footprints are 1x1 unless named in SIZE (2x2). Kinds ending in -r are the same prop turned a
quarter (R in build mode); fountain-<district> and banner-<district> come in the seven AWS category colours.

  nature     oak, pine, cherry, palm, flowers-warm, flowers-cool, hedge(-r)
  furniture  bench(-r), lamp, picnic, bikerack(-r), busstop(-r), lights(-r) (string lights), kiosk-coffee,
             kiosk-icecream, solartree
  water      fountain, fountain-big (2x2), fountain-<district>, pond (2x2)
  monuments  statue (a generic walker, no real person), obelisk, clocktower, windmill, sculpture-cube,
             sculpture-sphere, sculpture-cloud, bandstand (2x2), gazebo, playground (2x2)
  paving     plaza, plaza-big (2x2)
  signs      citysign (2x2: a blank board; the game writes the city's name on it, src/game/BuildLayer.ts),
             banner-<district>

Generic impressions only: no logos, brands, real people or real buildings. Deterministic (seeded by name).
Called from generate_tiles.main as builder_art.build(add); builder_art.preview writes .cache/art/builder-preview.png.
"""
import math

from PIL import Image, ImageDraw

from generate_tiles import A, CON_D, CON_L, CON_M, GRASS, GRASS_D, NAVY, NAVY_D, ORANGE, WATER, WHITE, WOOD, WOOD_D, seeded, shade
from services.kit import (LIT, RX, RY, STEEL, STEEL_D, STEEL_M, STONE, Kit, drum, drum_shadow, ellipse, ground_shadow, prism)

DISTRICT = {
    "compute": (237, 113, 0),
    "storage": (122, 161, 22),
    "database": (201, 37, 209),
    "networking": (140, 79, 255),
    "security": (221, 52, 76),
    "aiml": (1, 168, 141),
    "management": (231, 21, 123),
}
BULB = (255, 236, 150)
BARK = (122, 84, 52)
LEAF = (78, 168, 84)
LEAF_D = (44, 118, 62)
PINE = (40, 116, 78)
BLOSSOM = (246, 172, 200)
BLOSSOM_D = (220, 118, 160)
PALM = (88, 170, 70)
SAND = (230, 212, 164)
PAVER = (196, 188, 174)
PAVER_D = (168, 160, 148)
BRONZE = (176, 120, 70)
CREAM = (246, 236, 210)
RED = (226, 64, 56)
YELLOW = (255, 196, 40)
SKY = (59, 130, 246)
POOL = (86, 170, 226)

# 2x2 footprints; everything else stands on one tile.
SIZE = {"fountain-big": 2, "pond": 2, "bandstand": 2, "playground": 2, "plaza-big": 2, "citysign": 2}
# The city sign's board: its centre is this many px above the middle of its 2x2 lot (src/game/BuildLayer.ts SIGN_Z).
SIGN_Z = 30
SIGN_W, SIGN_H = 58, 17


# ── helpers ───────────────────────────────────────────────────────────────────

def ell(c, x, y, rx, ry, col, d=None):
    (d or c.d).ellipse((round(x - rx), round(y - ry), round(x + rx), round(y + ry)), fill=A(col))


def ball(c, x, y, r, col, key, spots=0, spot=None):
    """A shaded leafy ball in screen space: dark base, lit upper-left, a few highlight and shadow pixels."""
    ell(c, x, y, r, r * 0.92, shade(col, 0.74))
    ell(c, x - r * 0.18, y - r * 0.2, r * 0.78, r * 0.7, col)
    ell(c, x - r * 0.4, y - r * 0.42, r * 0.36, r * 0.3, shade(col, 1.18))
    rr = seeded(key)
    for _ in range(spots):
        px, py = x - r + rr(int(2 * r) + 1), y - r + rr(int(2 * r) + 1)
        if (px - x) ** 2 + (py - y) ** 2 < (r - 1) ** 2:
            c.d.point([(px, py)], fill=A(spot or shade(col, 0.6 if rr(2) else 1.25)))


def trunk(c, x, y, h, w=1, col=BARK):
    c.d.rectangle((x - w, y - h, x + w, y), fill=A(col))
    c.d.line([(x - w, y - h), (x - w, y)], fill=A(shade(col, 1.2)))


def shadow_disc(c, u, v, r, alpha=70):
    drum_shadow(c, u, v, r, alpha)


def bulb(c, x, y, col=BULB):
    c.d.point([(x, y)], fill=A(col))
    c.ld.point([(x, y)], fill=A(col))
    c.ld.point([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], fill=A(col, 140))


def pole(c, u, v, z0, z1, col=STEEL_D, w=0.035):
    prism(c, u - w, v - w, u + w, v + w, z0, z1, col, rim=0, ao=False)


def plinth(c, u0, v0, u1, v1, h, col=STONE):
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, h, col)


# ── nature ────────────────────────────────────────────────────────────────────

def oak():
    c = Kit(1, 1, 50)
    shadow_disc(c, 0.55, 0.55, 0.32)
    x, y = c.P(0.5, 0.5)
    trunk(c, x, y - 1, 16, 1)
    c.d.line([(x, y - 12), (x - 5, y - 18)], fill=A(BARK))
    c.d.line([(x, y - 13), (x + 5, y - 19)], fill=A(shade(BARK, 0.8)))
    for dx, dy, r in ((-7, -22, 7), (7, -21, 7), (0, -30, 9), (-4, -24, 8), (5, -27, 7)):
        ball(c, x + dx, y + dy, r, LEAF, f"oak{dx}{dy}", spots=4)
    return c


def pine():
    c = Kit(1, 1, 56)
    shadow_disc(c, 0.55, 0.55, 0.26)
    x, y = c.P(0.5, 0.5)
    trunk(c, x, y - 1, 7, 1)
    for k, (w, yy) in enumerate(((11, -6), (9, -16), (7, -25), (4, -33))):
        top = y + yy - 12
        c.d.polygon([(x - w, y + yy), (x + w, y + yy), (x, top)], fill=A(shade(PINE, 0.78)))
        c.d.polygon([(x - w, y + yy), (x, y + yy), (x, top)], fill=A(shade(PINE, 1.05 + k * 0.04)))
        c.d.line([(x - w + 1, y + yy), (x + w - 1, y + yy)], fill=A(shade(PINE, 0.62)))
    return c


def cherry():
    c = Kit(1, 1, 48)
    shadow_disc(c, 0.55, 0.55, 0.32)
    x, y = c.P(0.5, 0.5)
    c.d.line([(x, y - 1), (x - 1, y - 12)], fill=A(shade(BARK, 0.8)), width=2)
    c.d.line([(x - 1, y - 11), (x - 7, y - 19)], fill=A(shade(BARK, 0.8)))
    c.d.line([(x - 1, y - 12), (x + 6, y - 20)], fill=A(shade(BARK, 0.7)))
    for dx, dy, r in ((-8, -21, 6), (7, -22, 6), (0, -28, 8), (-3, -22, 7), (4, -26, 6)):
        ball(c, x + dx, y + dy, r, BLOSSOM, f"ch{dx}{dy}", spots=6, spot=WHITE)
    r = seeded("petals")
    for _ in range(6):  # petals on the ground
        c.d.point([(x - 10 + r(21), y - 3 + r(7))], fill=A(BLOSSOM_D))
    return c


def palm():
    c = Kit(1, 1, 54)
    shadow_disc(c, 0.55, 0.55, 0.22)
    x, y = c.P(0.5, 0.5)
    pts = [(x + round(3 * math.sin(t / 10)), y - 1 - t) for t in range(0, 34)]
    for k, (px, py) in enumerate(pts):
        col = shade((170, 130, 84), 1.0 if (k // 3) % 2 else 0.84)
        c.d.line([(px - 1, py), (px + 1, py)], fill=A(col))
    tx, ty = pts[-1]
    for ang, ln in ((-170, 13), (-140, 12), (-100, 9), (-60, 12), (-20, 13), (160, 10), (20, 10)):
        a = math.radians(ang)
        ex, ey = tx + math.cos(a) * ln, ty + math.sin(a) * ln * 0.6 + 4
        mx, my = (tx + ex) / 2, (ty + ey) / 2 - 3
        c.d.line([(tx, ty), (mx, my), (ex, ey)], fill=A(shade(PALM, 0.75)), width=2)
        c.d.line([(tx, ty - 1), (mx, my - 1)], fill=A(shade(PALM, 1.15)))
    ell(c, tx - 1, ty + 2, 2, 2, (120, 84, 40))
    ell(c, tx + 2, ty + 2, 2, 2, (100, 70, 34))
    return c


def flowerbed(cols, key):
    c = Kit(1, 1, 14)
    ground_shadow(c, 0.12, 0.12, 0.88, 0.88)
    prism(c, 0.12, 0.12, 0.88, 0.88, 0, 4, STONE, roofcol=(110, 82, 58))
    c.poly([(0.2, 0.2, 4), (0.8, 0.2, 4), (0.8, 0.8, 4), (0.2, 0.8, 4)], (96, 70, 48))
    r = seeded(key)
    for _ in range(16):
        x, y = c.P(0.22 + r(56) / 100, 0.22 + r(56) / 100, 4)
        c.d.point([(x, y), (x, y - 1)], fill=A(GRASS_D))
        col = cols[r(len(cols))]
        c.d.point([(x, y - 2), (x + 1, y - 2)], fill=A(col))
        c.d.point([(x, y - 3)], fill=A(shade(col, 1.2)))
    return c


def hedge(turned):
    c = Kit(1, 1, 18)
    u0, v0, u1, v1 = (0.1, 0.32, 0.9, 0.68) if not turned else (0.32, 0.1, 0.68, 0.9)
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, 10, LEAF_D, rim=0)
    r = seeded(f"hedge{turned}")
    for _ in range(26):  # leafy speckle on the faces
        u = u0 + r(int((u1 - u0) * 100)) / 100
        v = v0 + r(int((v1 - v0) * 100)) / 100
        x, y = c.P(u, v, 10)
        c.d.point([(x, y + r(9))], fill=A(shade(LEAF_D, 1.3 if r(2) else 0.75)))
    return c


# ── furniture ─────────────────────────────────────────────────────────────────

def bench(turned):
    c = Kit(1, 1, 18)
    if not turned:  # along u
        ground_shadow(c, 0.18, 0.42, 0.82, 0.62, alpha=60)
        for u in (0.22, 0.76):
            prism(c, u, 0.44, u + 0.04, 0.6, 0, 5, NAVY_D, rim=0, ao=False)
        prism(c, 0.16, 0.44, 0.84, 0.62, 5, 6, WOOD, rim=0, ao=False)
        prism(c, 0.16, 0.42, 0.84, 0.46, 6, 12, WOOD_D, rim=0, ao=False)
        c.line((0.16, 0.46, 9), (0.84, 0.46, 9), shade(WOOD, 1.1))
    else:
        ground_shadow(c, 0.42, 0.18, 0.62, 0.82, alpha=60)
        for v in (0.22, 0.76):
            prism(c, 0.44, v, 0.6, v + 0.04, 0, 5, NAVY_D, rim=0, ao=False)
        prism(c, 0.44, 0.16, 0.62, 0.84, 5, 6, WOOD, rim=0, ao=False)
        prism(c, 0.42, 0.16, 0.46, 0.84, 6, 12, WOOD_D, rim=0, ao=False)
        c.line((0.46, 0.16, 9), (0.46, 0.84, 9), shade(WOOD, 1.1))
    return c


def lamp():
    c = Kit(1, 1, 50)
    shadow_disc(c, 0.5, 0.5, 0.12)
    prism(c, 0.42, 0.42, 0.58, 0.58, 0, 3, STEEL_M, rim=0)
    pole(c, 0.5, 0.5, 3, 34, NAVY)
    x, y = c.P(0.5, 0.5, 34)
    c.d.polygon([(x - 4, y - 1), (x + 4, y - 1), (x + 2, y - 7), (x - 2, y - 7)], fill=A(shade(BULB, 0.95)))
    c.d.line([(x - 4, y - 1), (x + 4, y - 1)], fill=A(NAVY))
    c.d.polygon([(x - 5, y - 7), (x + 5, y - 7), (x, y - 11)], fill=A(NAVY))
    c.ld.polygon([(x - 3, y - 2), (x + 3, y - 2), (x + 2, y - 6), (x - 2, y - 6)], fill=A(BULB))
    c.ld.ellipse((x - 9, y - 12, x + 9, y + 4), fill=A(BULB, 60))
    c.ld.polygon([(x - 3, y - 2), (x + 3, y - 2), (x + 2, y - 6), (x - 2, y - 6)], fill=A(BULB))
    return c


def picnic():
    c = Kit(1, 1, 16)
    ground_shadow(c, 0.14, 0.2, 0.86, 0.8, alpha=60)
    for v in (0.22, 0.7):  # benches either side
        prism(c, 0.18, v, 0.82, v + 0.08, 0, 4, WOOD_D, rim=0)
    for u in (0.26, 0.72):
        prism(c, u, 0.4, u + 0.04, 0.6, 0, 7, WOOD_D, rim=0, ao=False)
    prism(c, 0.14, 0.34, 0.86, 0.66, 7, 9, WOOD, rim=0, ao=False)
    for k in range(4):
        c.line((0.14 + k * 0.18, 0.34, 9), (0.14 + k * 0.18, 0.66, 9), shade(WOOD, 0.85))
    x, y = c.P(0.5, 0.5, 9)  # a red checked cloth
    c.d.polygon([(x - 6, y), (x, y - 3), (x + 6, y), (x, y + 3)], fill=A(RED))
    c.d.point([(x - 2, y), (x + 2, y), (x, y - 1), (x, y + 1)], fill=A(WHITE))
    return c


def bikerack(turned):
    c = Kit(1, 1, 18)
    for k in range(3):
        t = 0.24 + k * 0.24
        u, v = (t, 0.5) if not turned else (0.5, t)
        x, y = c.P(u, v)
        c.d.arc((x - 4, y - 12, x + 4, y + 2), 180, 360, fill=A(STEEL_M))
        c.d.line([(x - 4, y - 5), (x - 4, y)], fill=A(STEEL_M))
        c.d.line([(x + 4, y - 5), (x + 4, y)], fill=A(shade(STEEL_M, 0.7)))
    # one bike parked
    u, v = (0.5, 0.62) if not turned else (0.62, 0.5)
    x, y = c.P(u, v)
    c.d.ellipse((x - 8, y - 6, x - 2, y), outline=A(NAVY_D))
    c.d.ellipse((x + 2, y - 6, x + 8, y), outline=A(NAVY_D))
    c.d.line([(x - 5, y - 3), (x, y - 7), (x + 5, y - 3), (x - 1, y - 3), (x - 5, y - 3)], fill=A(SKY))
    c.d.line([(x, y - 7), (x, y - 9)], fill=A(NAVY_D))
    c.d.line([(x + 4, y - 8), (x + 6, y - 9)], fill=A(NAVY_D))
    return c


def busstop(turned):
    c = Kit(1, 1, 34)
    if not turned:
        u0, v0, u1, v1 = 0.12, 0.3, 0.88, 0.62
    else:
        u0, v0, u1, v1 = 0.3, 0.12, 0.62, 0.88
    ground_shadow(c, u0, v0, u1, v1, alpha=60)
    prism(c, u0, v0, u1, v1, 0, 1, PAVER_D, rim=0)
    # back glass wall and posts
    if not turned:
        c.poly([(u0, v0, 1), (u1, v0, 1), (u1, v0, 20), (u0, v0, 20)], (170, 214, 236))
        for u in (u0, u1 - 0.04):
            prism(c, u, v0, u + 0.04, v0 + 0.04, 1, 22, NAVY, rim=0, ao=False)
        prism(c, u0 + 0.12, v0 + 0.04, u1 - 0.12, v0 + 0.14, 5, 7, WOOD, rim=0, ao=False)
        prism(c, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1, 22, 24, NAVY, roofcol=SKY, rim=0.03, ao=False)
        x, y = c.P(u1 - 0.1, v0, 18)
    else:
        c.poly([(u0, v0, 1), (u0, v1, 1), (u0, v1, 20), (u0, v0, 20)], (150, 196, 224))
        for v in (v0, v1 - 0.04):
            prism(c, u0, v, u0 + 0.04, v + 0.04, 1, 22, NAVY, rim=0, ao=False)
        prism(c, u0 + 0.04, v0 + 0.12, u0 + 0.14, v1 - 0.12, 5, 7, WOOD, rim=0, ao=False)
        prism(c, u0 - 0.04, v0 - 0.04, u1, v1 + 0.04, 22, 24, NAVY, roofcol=SKY, rim=0.03, ao=False)
        x, y = c.P(u0, v1 - 0.1, 18)
    # the route sign: a lit disc on a post
    c.d.ellipse((x - 3, y - 14, x + 3, y - 8), fill=A(YELLOW))
    c.d.line([(x, y - 8), (x, y)], fill=A(NAVY))
    c.ld.ellipse((x - 3, y - 14, x + 3, y - 8), fill=A(YELLOW, 200))
    return c


def string_lights(turned):
    """Festoon lights: a sagging strand between two posts across the tile (screen left to right), or (turned) a
    maypole canopy, strands from a central mast to four short posts."""
    c = Kit(1, 1, 44)
    cols = [BULB, (255, 160, 120), (170, 220, 255), BULB, (255, 200, 90)]

    def strand(a, b, za, zb, sag, n):
        xa, ya = c.P(a[0], a[1], za)
        xb, yb = c.P(b[0], b[1], zb)
        pts = [(round(xa + (xb - xa) * k / 24), round(ya + (yb - ya) * k / 24 + math.sin(k / 24 * math.pi) * sag)) for k in range(25)]
        c.d.line(pts, fill=A(NAVY_D))
        for k in range(1, n + 1):
            x, y = pts[round(k * 24 / (n + 1))]
            bulb(c, x, y + 1, cols[k % len(cols)])

    if not turned:
        a, b = (0.12, 0.88), (0.88, 0.12)
        for u, v in (a, b):
            shadow_disc(c, u, v, 0.06, 60)
            pole(c, u, v, 0, 30, WOOD_D, w=0.035)
        strand(a, b, 29, 29, 6, 7)
        strand(a, b, 22, 22, 4, 5)
    else:
        corners = [(0.14, 0.14), (0.86, 0.14), (0.14, 0.86), (0.86, 0.86)]
        shadow_disc(c, 0.5, 0.5, 0.08, 60)
        for u, v in corners[:2]:
            pole(c, u, v, 0, 16, WOOD_D, w=0.03)
            strand((0.5, 0.5), (u, v), 34, 15, 3, 3)
        pole(c, 0.5, 0.5, 0, 36, WOOD_D, w=0.04)
        for u, v in corners[2:]:
            pole(c, u, v, 0, 16, WOOD_D, w=0.03)
            strand((0.5, 0.5), (u, v), 34, 15, 3, 3)
        x, y = c.P(0.5, 0.5, 36)
        c.d.point([(x, y - 1)], fill=A(YELLOW))
    return c


def kiosk(kind):
    c = Kit(1, 1, 40)
    awning = (120, 72, 40) if kind == "coffee" else (246, 150, 190)
    body = CREAM if kind == "coffee" else (250, 244, 236)
    ground_shadow(c, 0.18, 0.18, 0.82, 0.82)
    prism(c, 0.2, 0.2, 0.8, 0.8, 0, 18, body, L=lambda i, n, z, h, base, s: ((LIT, LIT) if 7 <= z <= 13 and 2 <= i < n - 2 else None) if s == "L" else None, roofcol=shade(body, 0.9))
    prism(c, 0.2, 0.8, 0.8, 0.86, 7, 8, WOOD, rim=0, ao=False)  # counter
    # striped awning sloping toward the viewer
    for k in range(6):
        u = 0.16 + k * 0.113
        col = awning if k % 2 == 0 else WHITE
        c.poly([(u, 0.8, 20), (u + 0.113, 0.8, 20), (u + 0.113, 0.98, 15), (u, 0.98, 15)], col)
    prism(c, 0.18, 0.18, 0.82, 0.82, 18, 21, shade(awning, 0.9), rim=0, ao=False)
    x, y = c.P(0.5, 0.5, 21)
    if kind == "coffee":  # a cup on the roof
        c.d.rectangle((x - 4, y - 9, x + 3, y - 1), fill=A(WHITE))
        c.d.rectangle((x - 4, y - 9, x - 2, y - 1), fill=A(shade(WHITE, 1.0)))
        c.d.rectangle((x + 1, y - 9, x + 3, y - 1), fill=A(shade(WHITE, 0.8)))
        c.d.arc((x + 2, y - 7, x + 7, y - 3), 270, 90, fill=A(shade(WHITE, 0.8)))
        c.d.line([(x - 4, y - 9), (x + 3, y - 9)], fill=A((110, 70, 40)))
        for k in range(3):
            c.d.point([(x - 2 + k, y - 12 - (k % 2))], fill=A((220, 220, 230)))
    else:  # an ice-cream cone
        c.d.polygon([(x - 3, y - 6), (x + 3, y - 6), (x, y + 1)], fill=A((214, 160, 90)))
        ell(c, x, y - 8, 4, 3, (246, 172, 200))
        ell(c, x - 1, y - 12, 3, 3, (255, 246, 220))
        c.d.point([(x + 1, y - 15)], fill=A(RED))
    c.ld.ellipse((x - 5, y - 15, x + 5, y - 1), fill=A(BULB, 60))
    return c


def solartree():
    c = Kit(1, 1, 52)
    shadow_disc(c, 0.5, 0.5, 0.3, 60)
    pole(c, 0.5, 0.5, 0, 30, STEEL_M, w=0.045)
    x, y = c.P(0.5, 0.5, 30)
    for k, (dx, dy) in enumerate(((-10, -2), (10, -2), (0, -9), (-6, -14), (7, -14))):
        cx, cy = x + dx, y + dy
        c.d.line([(x, y), (cx, cy + 2)], fill=A(STEEL_M))
        c.d.polygon([(cx - 6, cy), (cx, cy - 3), (cx + 6, cy), (cx, cy + 3)], fill=A((40, 64, 120)))
        c.d.line([(cx - 6, cy), (cx, cy - 3)], fill=A((120, 160, 220)))
        c.d.line([(cx, cy - 3), (cx, cy + 3)], fill=A((70, 100, 160)))
        c.d.point([(cx, cy + 4)], fill=A((140, 250, 200)))
        c.ld.ellipse((cx - 2, cy + 2, cx + 2, cy + 6), fill=A((140, 250, 200), 200))
    c.d.rectangle((x - 2, y + 18, x + 2, y + 22), fill=A((140, 250, 200)))  # charging socket
    c.ld.rectangle((x - 1, y + 19, x + 1, y + 21), fill=A((140, 250, 200)))
    return c


# ── water ─────────────────────────────────────────────────────────────────────

def fountain(col=None):
    """A round basin (in a district colour when `col`), a two-tier stem and a jet; lit from inside at night."""
    c = Kit(1, 1, 36)
    rim = col or STONE
    water = shade(col, 0.5) if col else WATER
    water = tuple(min(255, round(w * 0.6 + p * 0.4)) for w, p in zip(water, POOL)) if col else POOL
    shadow_disc(c, 0.5, 0.5, 0.42)
    drum(c, 0.5, 0.5, 0, 5, 0.42, rim, capcol=shade(rim, 1.1))
    ellipse(c, 0.5, 0.5, 5, 0.34, water, light=(shade(water, 1.4) + (90,)))
    drum(c, 0.5, 0.5, 5, 13, 0.06, STONE, ao=False)
    drum(c, 0.5, 0.5, 13, 15, 0.16, rim, ao=False, capcol=water)
    x, y = c.P(0.5, 0.5, 15)
    for k in range(6):
        a = k * math.pi / 3
        c.d.line([(x, y - 6), (x + round(math.cos(a) * 9), y + 7 + round(math.sin(a) * 3))], fill=A((214, 240, 255)))
    c.d.line([(x, y - 9), (x, y - 1)], fill=A((240, 250, 255)))
    c.ld.ellipse((x - 3, y - 10, x + 3, y), fill=A((200, 236, 255), 120))
    return c


def fountain_big():
    c = Kit(2, 2, 52)
    shadow_disc(c, 1, 1, 0.92)
    drum(c, 1, 1, 0, 6, 0.9, STONE, capcol=shade(STONE, 1.1))
    ellipse(c, 1, 1, 6, 0.8, POOL, light=(170, 220, 255, 80))
    r = seeded("big")
    for _ in range(12):  # ripples
        x, y = c.P(0.5 + r(100) / 100, 0.5 + r(100) / 100, 6)
        c.d.line([(x - 2, y), (x + 1, y)], fill=A(shade(POOL, 1.25)))
    drum(c, 1, 1, 6, 16, 0.32, STONE, ao=False, capcol=POOL)
    drum(c, 1, 1, 16, 26, 0.07, STONE, ao=False)
    drum(c, 1, 1, 26, 28, 0.2, STONE, ao=False, capcol=POOL)
    x, y = c.P(1, 1, 28)
    for k in range(8):
        a = k * math.pi / 4
        c.d.line([(x, y - 8), (x + round(math.cos(a) * 12), y + 10 + round(math.sin(a) * 4))], fill=A((214, 240, 255)))
    c.d.line([(x, y - 14), (x, y - 1)], fill=A((240, 250, 255)))
    for k in range(10):  # the outer jets from the basin's rim
        a = k * math.pi / 5
        bx, by = c.Pf(1 + math.cos(a) * 0.62, 1 + math.sin(a) * 0.62, 6)
        c.d.line([(round(bx), round(by)), (round(bx + (x - bx) * 0.25), round(by - 7))], fill=A((214, 240, 255)))
    c.ld.ellipse((x - 16, y - 14, x + 16, y + 18), fill=A((170, 220, 255), 70))
    return c


def pond():
    c = Kit(2, 2, 24)
    x, y = c.Pf(1, 1, 0)
    pts = [(x + math.cos(a / 20 * 2 * math.pi) * RX * (0.86 + 0.08 * math.sin(a * 1.7)) * 1.0,
            y + math.sin(a / 20 * 2 * math.pi) * RY * (0.86 + 0.08 * math.sin(a * 1.7))) for a in range(20)]
    c.d.polygon([(round(px), round(py)) for px, py in pts], fill=A(shade(SAND, 0.92)))
    inner = [(x + (px - x) * 0.84, y + (py - y) * 0.84) for px, py in pts]
    c.d.polygon([(round(px), round(py)) for px, py in inner], fill=A(shade(WATER, 0.9)))
    deep = [(x + (px - x) * 0.55, y + (py - y) * 0.55 + 1) for px, py in pts]
    c.d.polygon([(round(px), round(py)) for px, py in deep], fill=A(shade(WATER, 0.76)))
    # lily pads, reeds, stones and a duck
    for dx, dy in ((-12, 2), (10, -4), (-3, 7)):
        ell(c, x + dx, y + dy, 3, 1.5, (98, 170, 70))
    c.d.point([(x - 12, y + 1)], fill=A(BLOSSOM))
    for dx in (-22, -20, -18, 19, 21):
        c.d.line([(x + dx, y - 2), (x + dx, y - 9 - (dx % 3))], fill=A(GRASS_D))
        c.d.point([(x + dx, y - 10 - (dx % 3))], fill=A((120, 84, 50)))
    for dx, dy in ((14, 8), (-16, 7), (4, -11)):
        ell(c, x + dx, y + dy, 2.5, 1.5, CON_M)
    c.d.rectangle((x + 2, y - 2, x + 6, y), fill=A(WHITE))
    c.d.rectangle((x + 5, y - 4, x + 6, y - 2), fill=A(WHITE))
    c.d.point([(x + 7, y - 3)], fill=A(ORANGE))
    return c


# ── monuments and play ────────────────────────────────────────────────────────

def statue():
    """A generic walker in bronze on a stone plinth (nobody in particular)."""
    c = Kit(1, 1, 48)
    plinth(c, 0.28, 0.28, 0.72, 0.72, 14)
    prism(c, 0.24, 0.24, 0.76, 0.76, 0, 3, shade(STONE, 0.9), ao=False)
    x, y = c.P(0.5, 0.5, 14)
    b, bd = BRONZE, shade(BRONZE, 0.7)
    c.d.line([(x - 1, y), (x - 3, y - 8)], fill=A(bd), width=2)  # legs mid-stride
    c.d.line([(x + 1, y), (x + 2, y - 8)], fill=A(b), width=2)
    c.d.rectangle((x - 3, y - 18, x + 2, y - 8), fill=A(b))
    c.d.rectangle((x + 1, y - 18, x + 2, y - 8), fill=A(bd))
    c.d.line([(x - 3, y - 17), (x - 6, y - 10)], fill=A(b), width=1)  # arm
    c.d.line([(x + 2, y - 17), (x + 7, y - 24)], fill=A(bd), width=1)  # raised arm
    ell(c, x, y - 21, 2.5, 2.5, b)
    c.d.point([(x - 1, y - 22)], fill=A(shade(b, 1.3)))
    # a plaque
    x2, y2 = c.P(0.5, 0.72, 8)
    c.d.rectangle((x2 - 3, y2 - 2, x2 + 1, y2 + 1), fill=A(shade(BRONZE, 0.9)))
    return c


def obelisk():
    c = Kit(1, 1, 58)
    plinth(c, 0.26, 0.26, 0.74, 0.74, 5)
    prism(c, 0.38, 0.38, 0.62, 0.62, 5, 40, (224, 218, 204), rim=0)
    c.pyramid(0.38, 0.38, 0.62, 0.62, 40, 8, (240, 210, 120))
    return c


def clocktower():
    c = Kit(1, 1, 96)
    ground_shadow(c, 0.22, 0.22, 0.78, 0.78)
    brick = (178, 96, 72)
    prism(c, 0.22, 0.22, 0.78, 0.78, 0, 8, STONE)
    prism(c, 0.26, 0.26, 0.74, 0.74, 8, 60, brick, L=lambda i, n, z, h, base, s: (shade(base, 0.86), None) if z % 6 == 0 else None,
          R=lambda i, n, z, h, base, s: (shade(base, 0.86), None) if z % 6 == 0 else None)
    prism(c, 0.24, 0.24, 0.76, 0.76, 60, 63, STONE, ao=False)
    # clock faces on both visible sides (lit at night)
    for (u, v, side) in ((0.5, 0.76, "L"), (0.76, 0.5, "R")):
        x, y = c.P(u, v, 50)
        ell(c, x, y, 5, 5, CREAM if side == "L" else shade(CREAM, 0.85))
        c.ld.ellipse((x - 5, y - 5, x + 5, y + 5), fill=A((255, 236, 180), 220))
        c.d.ellipse((x - 5, y - 5, x + 5, y + 5), outline=A(NAVY_D))
        c.d.line([(x, y), (x, y - 4)], fill=A(NAVY_D))
        c.d.line([(x, y), (x + 3, y + 1)], fill=A(NAVY_D))
    c.pyramid(0.22, 0.22, 0.78, 0.78, 63, 20, (70, 110, 120))
    x, y = c.P(0.5, 0.5, 83)
    c.d.line([(x, y), (x, y - 6)], fill=A(STEEL))
    c.d.point([(x, y - 7)], fill=A(YELLOW))
    # windows in the shaft
    for z in (18, 30):
        c.lface(0.74, 0.44, 0.56, z, z + 6, (60, 70, 90), light=True)
        c.rface(0.74, 0.44, 0.56, z, z + 6, (50, 60, 80), light=True)
    return c


def windmill():
    c = Kit(1, 1, 80)
    ground_shadow(c, 0.24, 0.24, 0.76, 0.76)
    drum(c, 0.5, 0.5, 0, 40, 0.3, (236, 230, 216), r1=0.2)
    x, y = c.P(0.5, 0.5, 40)
    c.d.polygon([(x - 10, y + 1), (x + 10, y + 1), (x, y - 12)], fill=A((150, 70, 52)))
    c.d.polygon([(x - 10, y + 1), (x, y + 1), (x, y - 12)], fill=A((176, 84, 62)))
    c.d.rectangle((x - 3, y + 22, x + 1, y + 30), fill=A(NAVY_D))  # door
    c.lface(0.8, 0.44, 0.56, 22, 28, (60, 70, 90), light=True)
    hx, hy = x + 3, y - 4
    for k in range(4):  # sails
        a = math.radians(30 + k * 90)
        ex, ey = hx + math.cos(a) * 24, hy + math.sin(a) * 24
        nx, ny = -math.sin(a) * 4, math.cos(a) * 4
        c.d.polygon([(hx + nx * 0.3, hy + ny * 0.3), (ex + nx * 0.3, ey + ny * 0.3), (ex + nx, ey + ny), (hx + nx * 0.6 + (ex - hx) * 0.25, hy + ny * 0.6 + (ey - hy) * 0.25)],
                    fill=A((240, 236, 226)))
        c.d.line([(hx, hy), (ex, ey)], fill=A(WOOD_D))
    ell(c, hx, hy, 2, 2, NAVY_D)
    return c


def sculpture(kind):
    c = Kit(1, 1, 54)
    plinth(c, 0.26, 0.26, 0.74, 0.74, 6, col=(214, 214, 220))
    x, y = c.P(0.5, 0.5, 6)
    if kind == "cube":  # a tilted cube balanced on its corner
        s = 9
        top = (x, y - 3 * s)
        c.d.polygon([(x, y), (x - s, y - s), (x, y - 2 * s), (x + s, y - s)], fill=A(shade(ORANGE, 0.85)))
        c.d.polygon([(x, y - 2 * s), (x - s, y - s), (x - s, y - 2 * s - 2), top], fill=A(ORANGE))
        c.d.polygon([(x, y - 2 * s), (x + s, y - s), (x + s, y - 2 * s - 2), top], fill=A(shade(ORANGE, 0.7)))
        c.d.polygon([(x - s, y - s), (x, y), (x, y - 2 * s)], fill=A(shade(ORANGE, 0.95)))
        c.d.polygon([(x + s, y - s), (x, y), (x, y - 2 * s)], fill=A(shade(ORANGE, 0.72)))
        c.d.polygon([(x - s, y - 2 * s - 2), (x, y - 2 * s), (x + s, y - 2 * s - 2), top], fill=A(shade(ORANGE, 1.1)))
    elif kind == "sphere":  # a mirror ball on a slim stem
        c.d.line([(x, y), (x, y - 6)], fill=A(STEEL_D))
        cx, cy, r = x, y - 15, 9
        ell(c, cx, cy, r, r, (150, 170, 196))
        ell(c, cx - 2, cy - 2, r - 3, r - 3, (196, 214, 232))
        ell(c, cx - 4, cy - 4, 3, 2, WHITE)
        c.d.arc((cx - r, cy - r, cx + r, cy + r), 20, 120, fill=A((100, 116, 140)))
        c.d.line([(cx - r + 2, cy + 3), (cx + r - 2, cy + 3)], fill=A((126, 186, 120)))  # the sky and grass reflected
    else:  # a puffy cloud on a pole
        c.d.line([(x, y), (x, y - 12)], fill=A(STEEL_M), width=2)
        cy = y - 20
        for dx, dy, r in ((-8, 2, 6), (8, 2, 6), (-3, -3, 7), (4, -4, 6), (0, 3, 7)):
            ell(c, x + dx, cy + dy, r, r * 0.85, (200, 214, 236))
        for dx, dy, r in ((-8, 1, 5), (-3, -4, 6), (4, -5, 5)):
            ell(c, x + dx - 1, cy + dy - 1, r * 0.8, r * 0.7, WHITE)
        c.ld.ellipse((x - 14, cy - 10, x + 14, cy + 9), fill=A((200, 220, 255), 70))
    return c


def bandstand():
    c = Kit(2, 2, 66)
    shadow_disc(c, 1, 1, 0.8)
    drum(c, 1, 1, 0, 6, 0.78, (214, 206, 192), capcol=(196, 160, 116))
    posts = [(k * math.pi / 4) for k in range(8)]
    x0, y0 = c.Pf(1, 1, 6)
    for back in (True, False):
        for a in posts:
            front = math.sin(a + math.pi / 4) > 0
            if front == back:
                continue
            px_, py_ = c.Pf(1 + math.cos(a) * 0.66, 1 + math.sin(a) * 0.66, 6)
            c.d.line([(round(px_), round(py_)), (round(px_), round(py_) - 26)], fill=A(WHITE if not back else shade(WHITE, 0.8)), width=2)
        if back:  # musicians' chairs and a music stand
            for dx in (-8, 0, 8):
                c.d.rectangle((x0 + dx - 1, y0 - 5, x0 + dx + 1, y0 - 1), fill=A(NAVY))
            c.d.line([(x0 + 4, y0 + 2), (x0 + 4, y0 - 6)], fill=A(STEEL_D))
    # the roof: an octagonal cone in green with a white rim and bulbs
    ry = y0 - 26
    ell(c, x0, ry, 34, 15, shade(GRASS_D, 0.85))
    c.d.polygon([(x0 - 34, ry), (x0 + 34, ry), (x0, ry - 22)], fill=A(GRASS_D))
    c.d.polygon([(x0 - 34, ry), (x0 - 4, ry), (x0, ry - 22)], fill=A(GRASS))
    c.d.chord((x0 - 34, ry - 15, x0 + 34, ry + 15), 0, 180, fill=A(shade(GRASS_D, 0.75)))
    c.d.arc((x0 - 34, ry - 15, x0 + 34, ry + 15), 0, 180, fill=A(WHITE))
    for k in range(9):
        a = k * math.pi / 8
        bulb(c, x0 + round(math.cos(a) * 33), ry + 2 + round(math.sin(a) * 14))
    c.d.line([(x0, ry - 22), (x0, ry - 28)], fill=A(WHITE))
    c.d.point([(x0, ry - 29)], fill=A(YELLOW))
    return c


def gazebo():
    """A square timber pergola with a vine roof and a lantern (the parks' round gazebo is park:gazebo)."""
    c = Kit(1, 1, 42)
    ground_shadow(c, 0.14, 0.14, 0.86, 0.86)
    prism(c, 0.14, 0.14, 0.86, 0.86, 0, 2, PAVER, rim=0)
    for u, v in ((0.18, 0.18), (0.78, 0.18), (0.18, 0.78), (0.78, 0.78)):
        if (u, v) == (0.78, 0.78):
            continue
        prism(c, u, v, u + 0.05, v + 0.05, 2, 26, WOOD, rim=0, ao=False)
    prism(c, 0.4, 0.4, 0.62, 0.52, 2, 7, WOOD_D, rim=0, ao=False)  # a bench inside
    prism(c, 0.78, 0.78, 0.83, 0.83, 2, 26, WOOD, rim=0, ao=False)
    for k in range(5):  # roof slats
        t = 0.14 + k * 0.17
        prism(c, t, 0.12, t + 0.05, 0.88, 26, 28, WOOD_D, rim=0, ao=False)
    r = seeded("vine")
    for _ in range(40):
        x, y = c.P(0.14 + r(72) / 100, 0.14 + r(72) / 100, 28)
        c.d.point([(x, y), (x + 1, y)], fill=A(shade(LEAF, 0.8 + r(5) / 10)))
    for _ in range(6):
        x, y = c.P(0.14 + r(72) / 100, 0.14 + r(72) / 100, 28)
        c.d.point([(x, y - 1)], fill=A(BLOSSOM))
    x, y = c.P(0.5, 0.5, 24)
    c.d.rectangle((x - 1, y - 2, x + 1, y + 1), fill=A(BULB))
    c.ld.ellipse((x - 6, y - 6, x + 6, y + 5), fill=A(BULB, 110))
    c.ld.rectangle((x - 1, y - 2, x + 1, y + 1), fill=A(BULB))
    return c


def playground2():
    c = Kit(2, 2, 46)
    c.poly([(0.08, 0.08, 0), (1.92, 0.08, 0), (1.92, 1.92, 0), (0.08, 1.92, 0)], (226, 120, 90))  # rubber surface
    c.poly([(0.16, 0.16, 0), (1.84, 0.16, 0), (1.84, 1.84, 0), (0.16, 1.84, 0)], (236, 140, 108))
    c.d.line([c.P(0.08, 1.92), c.P(1.92, 1.92), c.P(1.92, 0.08)], fill=A(shade((226, 120, 90), 0.7)))
    # sandpit (front left)
    prism(c, 0.2, 1.2, 0.8, 1.8, 0, 2, WOOD, roofcol=SAND, rim=0.06)
    x, y = c.P(0.5, 1.5, 2)
    c.d.rectangle((x - 2, y - 3, x + 1, y), fill=A(RED))  # a bucket
    # climbing frame with a slide (back)
    prism(c, 0.3, 0.3, 0.9, 0.9, 0, 2, SKY, rim=0, ao=False)
    for u, v in ((0.3, 0.3), (0.86, 0.3), (0.3, 0.86), (0.86, 0.86)):
        prism(c, u, v, u + 0.04, v + 0.04, 0, 26, YELLOW, rim=0, ao=False)
    prism(c, 0.3, 0.3, 0.9, 0.9, 14, 16, (120, 200, 120), rim=0, ao=False)
    c.pyramid(0.26, 0.26, 0.94, 0.94, 26, 10, RED)
    c.poly([(0.9, 0.42, 15), (0.9, 0.62, 15), (1.6, 0.62, 1), (1.6, 0.42, 1)], shade(SKY, 1.15))
    c.poly([(0.9, 0.62, 15), (0.9, 0.64, 17), (1.6, 0.64, 3), (1.6, 0.62, 1)], shade(SKY, 0.75))
    # see-saw (front right)
    x, y = c.P(1.5, 1.4, 0)
    c.d.polygon([(x - 2, y), (x + 2, y), (x, y - 4)], fill=A(NAVY))
    c.d.line([(x - 12, y - 1), (x + 12, y - 7)], fill=A(ORANGE), width=2)
    # swings (right)
    for v in (0.9, 1.5):
        a, b = c.P(1.7, v - 0.3, 22), c.P(1.7, v + 0.3, 22)
        c.d.line([a, b], fill=A(STEEL_M))
        for vv in (v - 0.3, v + 0.3):
            p0 = c.P(1.7, vv, 0)
            c.d.line([p0, c.P(1.7, vv, 22)], fill=A(STEEL_M))
        s0 = c.P(1.7, v, 22)
        s1 = c.P(1.7, v, 6)
        c.d.line([s0, s1], fill=A(CON_D))
        c.d.rectangle((s1[0] - 2, s1[1], s1[0] + 2, s1[1] + 1), fill=A(RED))
    return c


# ── paving and signs ──────────────────────────────────────────────────────────

def plaza(n):
    c = Kit(n, n, 4)
    c.poly([(0, 0, 0), (n, 0, 0), (n, n, 0), (0, n, 0)], PAVER)
    for k in range(1, 4 * n):  # joints
        t = k / 4
        c.line((t, 0.02, 0), (t, n - 0.02, 0), PAVER_D)
        c.line((0.02, t, 0), (n - 0.02, t, 0), PAVER_D)
    if n == 2:  # a compass-rose inlay
        x, y = c.P(1, 1)
        c.d.polygon([(x - 14, y), (x, y - 7), (x + 14, y), (x, y + 7)], fill=A((214, 196, 160)))
        c.d.polygon([(x - 6, y), (x, y - 3), (x + 6, y), (x, y + 3)], fill=A(ORANGE))
        c.d.line([(x - 14, y), (x + 14, y)], fill=A(NAVY))
        c.d.line([(x, y - 7), (x, y + 7)], fill=A(NAVY))
    else:
        x, y = c.P(0.5, 0.5)
        c.d.polygon([(x - 6, y), (x, y - 3), (x + 6, y), (x, y + 3)], fill=A((214, 196, 160)))
    c.d.line([c.P(0, n), c.P(n, n), c.P(n, 0)], fill=A(shade(PAVER, 0.75)))
    return c


def citysign():
    """A big blank board on two legs over a flower bed: the city's name is drawn on it in the game."""
    c = Kit(2, 2, 52)
    ground_shadow(c, 0.3, 0.7, 1.7, 1.3)
    prism(c, 0.3, 0.7, 1.7, 1.3, 0, 4, STONE, roofcol=(96, 70, 48))
    r = seeded("signbed")
    for _ in range(26):
        x, y = c.P(0.36 + r(128) / 100, 0.76 + r(48) / 100, 4)
        c.d.point([(x, y - 1)], fill=A([(255, 110, 150), YELLOW, WHITE, (170, 120, 250)][r(4)]))
    x, y = c.P(1, 1, SIGN_Z)
    w, h = SIGN_W // 2, SIGN_H // 2
    for dx in (-w + 8, w - 8):  # legs
        c.d.rectangle((x + dx - 1, y + h, x + dx + 1, y + SIGN_Z - 2), fill=A(NAVY))
    c.d.rectangle((x - w - 2, y - h - 2, x + w + 2, y + h + 2), fill=A(NAVY))
    c.d.rectangle((x - w, y - h, x + w, y + h), fill=A((252, 248, 238)))
    c.d.line([(x - w, y + h), (x + w, y + h)], fill=A(shade((252, 248, 238), 0.86)))
    c.d.line([(x - w - 2, y - h - 3), (x + w + 2, y - h - 3)], fill=A(ORANGE))  # an orange cap
    for dx in (-w + 4, w - 4):  # spotlights on the cap
        c.d.rectangle((dx + x - 1, y - h - 6, dx + x + 1, y - h - 4), fill=A(CON_D))
        c.ld.polygon([(dx + x - 1, y - h - 3), (dx + x + 1, y - h - 3), (dx + x + 6 * (1 if dx < 0 else -1), y), (dx + x, y + 2)], fill=A((255, 240, 200), 70))
    return c


def banner(col):
    c = Kit(1, 1, 52)
    shadow_disc(c, 0.5, 0.5, 0.1, 60)
    prism(c, 0.42, 0.42, 0.58, 0.58, 0, 3, STONE, rim=0)
    pole(c, 0.5, 0.5, 3, 42, STEEL_M, w=0.03)
    x, y = c.P(0.5, 0.5, 40)
    c.d.line([(x, y), (x + 9, y + 1)], fill=A(STEEL_D))
    pts = [(x + 1, y + 1), (x + 9, y + 2), (x + 9, y + 20), (x + 5, y + 17), (x + 1, y + 19)]
    c.d.polygon(pts, fill=A(col))
    c.d.polygon([(x + 1, y + 1), (x + 4, y + 1), (x + 4, y + 18), (x + 1, y + 19)], fill=A(shade(col, 1.15)))
    c.d.rectangle((x + 3, y + 7, x + 7, y + 11), fill=A(shade(col, 0.6)))  # a plain emblem (a square)
    c.d.rectangle((x + 4, y + 8, x + 6, y + 10), fill=A(WHITE))
    c.d.point([(x, y - 1)], fill=A(YELLOW))
    return c


def builders():
    out = [
        ("oak", oak()), ("pine", pine()), ("cherry", cherry()), ("palm", palm()),
        ("flowers-warm", flowerbed([(255, 110, 150), (255, 196, 40), (255, 140, 60), RED], "fw")),
        ("flowers-cool", flowerbed([(170, 120, 250), WHITE, (110, 170, 255), (246, 172, 200)], "fc")),
        ("hedge", hedge(False)), ("hedge-r", hedge(True)),
        ("bench", bench(False)), ("bench-r", bench(True)), ("lamp", lamp()), ("picnic", picnic()),
        ("bikerack", bikerack(False)), ("bikerack-r", bikerack(True)), ("busstop", busstop(False)), ("busstop-r", busstop(True)),
        ("lights", string_lights(False)), ("lights-r", string_lights(True)),
        ("kiosk-coffee", kiosk("coffee")), ("kiosk-icecream", kiosk("icecream")), ("solartree", solartree()),
        ("fountain", fountain()), ("fountain-big", fountain_big()), ("pond", pond()),
        ("statue", statue()), ("obelisk", obelisk()), ("clocktower", clocktower()), ("windmill", windmill()),
        ("sculpture-cube", sculpture("cube")), ("sculpture-sphere", sculpture("sphere")), ("sculpture-cloud", sculpture("cloud")),
        ("bandstand", bandstand()), ("gazebo", gazebo()), ("playground", playground2()),
        ("plaza", plaza(1)), ("plaza-big", plaza(2)), ("citysign", citysign()),
    ]
    out += [(f"fountain-{d}", fountain(col)) for d, col in DISTRICT.items()]
    out += [(f"banner-{d}", banner(col)) for d, col in DISTRICT.items()]
    return out


def build(add):
    for kind, c in builders():
        # Thin strands would fill in under a 1 px outline: string lights keep their own dark lines.
        add(f"deco:{kind}", c, do_outline=not kind.startswith("lights"))


def preview(sprites, path):
    """.cache/art/builder-preview.png: every decoration on a grass tile, by day then by night, x2."""
    from preview_services import ground, night
    names = [n for n in sprites if n.startswith("deco:") and "@" not in n]
    per = 10
    cw, ch = 104, 140
    rows = (len(names) + per - 1) // per
    sheet = Image.new("RGBA", (cw * per, ch * rows * 2), (13, 8, 22, 255))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        img, (ax, ay) = sprites[name]
        lit = sprites.get(name + "@lights")
        n = SIZE.get(name[5:], 1)
        for j, pic in enumerate((img, night(img, lit, (ax, ay)))):
            gx = (i % per) * cw + cw // 2
            top = (i // per + j * rows) * ch + ch - 20 - 16 * n
            ground(sheet, sprites, gx, top, n)
            sheet.alpha_composite(pic, (gx - ax, top - ay))
            d.text(((i % per) * cw + 4, (i // per + j * rows) * ch + ch - 14), name[5:], fill=(255, 230, 170, 255))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(path)
