"""
The city airport (src/world/airport.ts lays it out on a 10x4 site: runway, taxiway, then tower 1x2 | terminal 4x2 |
stand 2x2 | hangar slot 3x2). It grows with the airport client's levels 0-3 (the draft's growth[].look):

  level 0  runway + tower and windsock, the terminal and hangar plots under wraps
           air:rwyEndW air:rwy0 air:rwy1 air:rwyEndE air:taxi  air:tower:0  air:terminal:locked  air:stand  air:hangar:locked
  level 1  a 4-gate terminal with a flight board, a parcel sorting shed with one conveyor, a belt loader on the stand
           air:tower  air:terminal  air:stand:1  air:sort  (+ air:taxi:sign on a taxiway tile or two)
  level 2  8 gates on two floors, a cargo hangar with its sorting annex and a second conveyor, tugs pulling carts
           air:tower  air:terminal:2  air:stand:2  air:hangar
  level 3  jet bridges, a lit operations centre with screens, a taller tower with a radar dish, approach lights,
           containers on the apron
           air:rwyEndW:3 air:rwyEndE:3  air:tower:3  air:terminal:3  air:stand:3  air:hangar:3

Footprints: tower 1x2, terminal 4x2, stand 2x2, sort/hangar 3x2, ground tiles 1x1 (flat, no outline). The terminal's
gates face the front (+y): its building stands on the back half of the plot, its apron strip on the front half.

Jets (3x3 canvases, anchored at the jet's centre on the ground, so a jet drawn at a tile centre sits on it):
  veh:plane:cargo:<SE|SW|NE|NW>        cargo jet on its gear (taxi, roll, parked)
  veh:plane:cargo:<dir>:air            the same, gear up (approach and climb)
  veh:plane:pax:<dir>, …:<dir>:air     a passenger jet in a neutral white-and-teal livery, no lettering
  veh:plane:cargo:shadow               a soft shadow for either
The cargo livery follows shared/brand.json: {"amazon": true} paints an Amazon Air-style navy and blue jet with
"PRIME AIR" in pixel letters (wording only: no logo artwork, no smile arrow); false paints the unbranded white
"AIR CARGO" jet. Facings: SE = +x, SW = +y, NE = -y, NW = -x (dirFor in src/game/iso.ts).
Night lights go on the lights layer (name@lights). Called from generate_tiles.main as airport_art.build(add).
"""
import json
import math
import os

from PIL import Image, ImageDraw, ImageFilter

from generate_tiles import (A, CLEAR, CON_D, CON_L, CON_M, GLASS, GLASS_D, NAVY, NAVY_D, ORANGE,  # noqa: F401
                            ORANGE_D, OUTLINE, ROOT, WHITE, WOOD, WOOD_D, outline, seeded, shade)
from shapes import cyl
from park_art import locked
from services.kit import Kit, LED, beacon, dish, glass, leds, punched, screen, top_band, combine, ribs, louvres, prism, face
from clients_art import text, text_w

LIT = (255, 214, 120)
RUNWAY = (46, 50, 60)
TAXI = (62, 68, 82)
APRON = (172, 176, 182)
LINE = (236, 238, 242)
YELLOW = (255, 196, 40)
EDGE_W = (255, 244, 200)
EDGE_B = (90, 150, 255)
GREEN_L = (90, 240, 130)
RED_L = (255, 70, 60)
CRATE = (196, 150, 96)
CRATE_D = (150, 108, 64)
ULD = (196, 202, 210)
CHAR = (70, 76, 90)


def brand():
    """shared/brand.json's switch (the Amazon Air livery); absent or unreadable means unbranded."""
    try:
        with open(os.path.join(ROOT, "shared", "brand.json")) as f:
            return bool(json.load(f).get("amazon"))
    except (OSError, ValueError):
        return False


# ── ground tiles ──────────────────────────────────────────────────────────────

def flat(base):
    c = Kit(1, 1, 0, pad=0)
    c.poly([(0, 0), (1, 0), (1, 1), (0, 1)], base)
    r = seeded(f"asph{base}")
    for _ in range(5):
        x, y = c.P((r(80) + 10) / 100, (r(80) + 10) / 100)
        c.d.point([(x, y)], fill=A(shade(base, 1.2)))
    return c


def rim(c, base):
    c.d.line([c.P(0, 1), c.P(1, 1), c.P(1, 0)], fill=A(shade(base, 0.86)))


def lamp_px(c, u, v, col, day=None):
    """An inset ground light: a dim pixel by day, a small glow at night."""
    x, y = c.P(u, v)
    c.d.point([(x, y)], fill=A(day or shade(col, 0.6)))
    c.ld.point([(x, y)], fill=A(col))
    c.ld.point([(x - 1, y), (x + 1, y)], fill=A(col, 120))


def runway(kind, approach=False):
    c = flat(RUNWAY)
    for v in (0.07, 0.93):  # edge lines
        c.poly([(0, v - 0.025), (1, v - 0.025), (1, v + 0.025), (0, v + 0.025)], LINE)
    if kind == "dash":
        c.poly([(0.12, 0.47), (0.88, 0.47), (0.88, 0.53), (0.12, 0.53)], LINE)
        for v in (0.25, 0.75):  # touchdown zone bars
            c.poly([(0.3, v - 0.04), (0.7, v - 0.04), (0.7, v + 0.04), (0.3, v + 0.04)], shade(LINE, 0.92))
    elif kind == "gap":
        r = seeded("skid")
        for _ in range(3):  # tyre marks in the touchdown zone
            u, v = 0.15 + r(60) / 100, 0.3 + r(40) / 100
            c.poly([(u, v), (u + 0.22, v), (u + 0.22, v + 0.03), (u, v + 0.03)], shade(RUNWAY, 0.78))
    else:  # threshold end: piano keys, a threshold bar, end lights on the outer edge
        west = kind == "W"
        a0, a1 = (0.12, 0.5) if west else (0.5, 0.88)
        for k in range(4):
            v = 0.18 + k * 0.18
            c.poly([(a0, v), (a1, v), (a1, v + 0.1), (a0, v + 0.1)], LINE)
        bar = 0.58 if west else 0.42
        c.poly([(bar - 0.03, 0.1), (bar + 0.03, 0.1), (bar + 0.03, 0.9), (bar - 0.03, 0.9)], LINE)
        edge = 0.04 if west else 0.96
        for k in range(5):
            lamp_px(c, edge, 0.14 + k * 0.18, GREEN_L if k % 2 == 0 else RED_L)
        if approach:  # approach lights: a crossbar and a centre line of white lights with a strobe
            out = 0.0 if west else 1.0
            for k in range(7):
                lamp_px(c, out + (0.02 if west else -0.02), 0.2 + k * 0.1, EDGE_W, day=(230, 230, 220))
            for k in range(3):
                lamp_px(c, (0.08 + k * 0.1) if west else (0.92 - k * 0.1), 0.5, (255, 255, 255), day=(240, 240, 230))
            x, y = c.P(0.01 if west else 0.99, 0.5)
            c.ld.ellipse((x - 3, y - 2, x + 3, y + 2), fill=A((230, 240, 255), 160))
    for u in (0.25, 0.75):  # edge lights
        lamp_px(c, u, 0.03, EDGE_W, day=(200, 200, 190))
        lamp_px(c, u, 0.97, EDGE_W, day=(200, 200, 190))
    rim(c, RUNWAY)
    return c


def taxiway(sign=False):
    c = flat(TAXI)
    for v in (0.06, 0.94):
        c.poly([(0, v - 0.02), (1, v - 0.02), (1, v + 0.02), (0, v + 0.02)], shade(YELLOW, 0.8))
    c.poly([(0, 0.475), (1, 0.475), (1, 0.525), (0, 0.525)], YELLOW)
    for u in (0.25, 0.75):
        lamp_px(c, u, 0.02, EDGE_B)
        lamp_px(c, u, 0.98, EDGE_B)
    rim(c, TAXI)
    if sign:  # a taxiway sign on the far edge: black on yellow "A" with an arrow, lit at night
        s = Kit(1, 1, 16, pad=0)
        for u in (0.36, 0.64):
            s.box(u - 0.02, 0.04, u + 0.02, 0.08, 0, 4, CON_D)
        s.box(0.3, 0.02, 0.7, 0.1, 4, 11, OUTLINE)
        s.lface(0.1, 0.32, 0.5, 5, 10, YELLOW, light=True)
        s.lface(0.1, 0.52, 0.68, 5, 10, (30, 30, 30))
        x, y = s.P(0.36, 0.1, 10)
        text(s, "A", x + 1, y + 1, (20, 20, 20), None, 0)
        x, y = s.P(0.54, 0.1, 9)
        for k in range(4):
            s.d.point([(x + k, y + 2 + k // 2)], fill=A(YELLOW))
        s.d.point([(x + 2, y + 1), (x + 2, y + 4)], fill=A(YELLOW))
        s.ld.line([(x, y + 2), (x + 3, y + 3)], fill=A(YELLOW))
        c.img.alpha_composite(outline(s.img))
        c.lights.alpha_composite(s.lights)
    return c


# ── crates and containers ─────────────────────────────────────────────────────

def crate(c, u0, v0, u1, v1, z0, z1, col=CRATE):
    c.box(u0, v0, u1, v1, z0, z1, col)
    m = (u0 + u1) / 2
    c.lface(v1, m - 0.015, m + 0.015, z0, z1, shade(col, 0.66))
    c.lface(v1, u0, u1, (z0 + z1) / 2, (z0 + z1) / 2 + 1, shade(col, 0.7))
    c.rface(u1, v0, v1, (z0 + z1) / 2, (z0 + z1) / 2 + 1, shade(col, 0.55))


def crate_stack(c, u, v, s=1.0, lamp=False):
    """A pallet with two crates, a cargo box on top and a navy strap; (u, v) is the stack's back corner."""
    def U(x):
        return u + x * s

    def V(y):
        return v + y * s
    c.box(U(0), V(0), U(0.62), V(0.62), 0, 2, WOOD_D)
    crate(c, U(0.02), V(0.02), U(0.3), V(0.6), 2, 11)
    crate(c, U(0.32), V(0.02), U(0.6), V(0.6), 2, 11, shade(CRATE, 0.92))
    c.box(U(0.08), V(0.1), U(0.52), V(0.5), 11, 19, ORANGE)
    c.lface(V(0.5), U(0.08), U(0.52), 13, 14, NAVY)
    c.rface(U(0.52), V(0.1), V(0.5), 13, 14, NAVY_D)
    c.lface(V(0.6), U(0.12), U(0.16), 2, 11, NAVY)
    if lamp:
        x, y = c.P(U(0.3), V(0.3), 19)
        c.d.point([(x, y - 1)], fill=A(YELLOW))
        c.ld.point([(x, y - 1)], fill=A(YELLOW))


def crates():
    c = Kit(1, 1, 28)
    crate_stack(c, 0.19, 0.19)
    return c


def uld(c, u, v, z=0, col=ULD, w=0.34, d=0.3, h=11):
    """An air cargo container (ULD): a box with its upper back corner chamfered, a door net on the front."""
    c.box(u, v, u + w, v + d, z, z + h, col)
    c.poly([(u, v, z + h), (u + w, v, z + h), (u + w, v + 0.1, z + h + 3), (u, v + 0.1, z + h + 3)], shade(col, 1.08))
    c.poly([(u, v + 0.1, z + h + 3), (u + w, v + 0.1, z + h + 3), (u + w, v + d, z + h + 3), (u, v + d, z + h + 3)], shade(col, 1.04))
    c.rface(u + w, v, v + 0.1, z + h, z + h + 3, shade(col, 0.7))
    c.box(u, v + 0.1, u + w, v + d, z + h, z + h + 3, col)
    for k in range(3):
        c.lface(v + d, u + 0.04 + k * 0.1, u + 0.06 + k * 0.1, z + 1, z + h, shade(col, 0.7))
    c.lface(v + d, u + 0.03, u + w - 0.03, z + h // 2, z + h // 2 + 1, shade(col, 0.72))


def belt_loader(c, u, v, z=0, col=YELLOW):
    """A belt loader: a low chassis and a conveyor belt sloping up toward -u (to a jet's hold)."""
    c.box(u, v, u + 0.55, v + 0.2, z + 1, z + 4, col)
    for wu in (u + 0.08, u + 0.45):
        x, y = c.P(wu, v + 0.2, z)
        c.d.rectangle((x - 1, y - 2, x + 1, y), fill=A(CHAR))
    c.poly([(u - 0.15, v + 0.04, z + 14), (u + 0.5, v + 0.04, z + 5), (u + 0.5, v + 0.16, z + 5), (u - 0.15, v + 0.16, z + 14)], (60, 64, 72))
    c.poly([(u - 0.15, v + 0.16, z + 14), (u + 0.5, v + 0.16, z + 5), (u + 0.5, v + 0.16, z + 4), (u - 0.15, v + 0.16, z + 13)], shade(col, 0.8))
    for k in range(3):  # parcels riding up
        t = 0.2 + k * 0.28
        uu = u + 0.5 - t * 0.65
        zz = z + 5 + t * 9
        c.box(uu, v + 0.06, uu + 0.08, v + 0.14, zz, zz + 3, CRATE)


def tug(c, u, v, z=0, carts=2, col=ORANGE):
    """A baggage tug (cab toward +u) pulling carts behind it toward -u, each with parcels."""
    for k in range(carts):
        cu = u - 0.42 * (k + 1)
        c.box(cu, v, cu + 0.36, v + 0.22, z + 2, z + 4, CON_M)
        crate(c, cu + 0.03, v + 0.03, cu + 0.17, v + 0.19, z + 4, z + 9)
        crate(c, cu + 0.19, v + 0.03, cu + 0.33, v + 0.19, z + 4, z + 8, shade(CRATE, 0.9))
        x, y = c.P(cu + 0.36, v + 0.11, z + 3)
        c.d.line([(x, y), (x + 3, y + 1)], fill=A(CHAR))
        for wu in (cu + 0.06, cu + 0.3):
            x, y = c.P(wu, v + 0.22, z)
            c.d.rectangle((x - 1, y - 2, x, y), fill=A(CHAR))
    c.box(u, v, u + 0.34, v + 0.24, z + 1, z + 6, col)
    c.box(u + 0.04, v + 0.03, u + 0.2, v + 0.21, z + 6, z + 11, GLASS_D, top=CON_L)
    for wu in (u + 0.06, u + 0.28):
        x, y = c.P(wu, v + 0.24, z)
        c.d.rectangle((x - 1, y - 2, x + 1, y), fill=A(CHAR))
    x, y = c.P(u + 0.12, v + 0.12, z + 11)
    c.d.point([(x, y - 1)], fill=A(YELLOW))
    c.ld.ellipse((x - 2, y - 3, x + 2, y + 1), fill=A(YELLOW, 150))


# ── tower ─────────────────────────────────────────────────────────────────────

def windsock(c, u, v, z=1, h=20):
    x, y = c.P(u, v, z)
    c.d.line([(x, y), (x, y - h)], fill=A(CON_L))
    c.d.polygon([(x + 1, y - h), (x + 9, y - h + 2), (x + 9, y - h + 4), (x + 1, y - h + 4)], fill=A(ORANGE))
    for dx in (3, 6):
        c.d.line([(x + dx, y - h + 1), (x + dx, y - h + 4)], fill=A(WHITE))
    c.ld.point([(x, y - h - 1)], fill=A(RED_L))


def tower(level=1):
    """Control tower (1x2): an ops block, a slim shaft, a glass cab with a gallery, an antenna and a red beacon.
    Level 0 is shorter with a hut and a windsock; level 3 is taller, with a radar dish on a second stub."""
    top = {0: 48, 1: 64, 3: 94}[level]
    c = Kit(1, 2, top + 40)
    c.box(0.04, 0.04, 0.96, 1.96, 0, 1, CON_L)
    if level == 0:
        c.box(0.25, 0.7, 0.75, 1.3, 1, 10, CON_L)
        c.lface(1.3, 0.35, 0.5, 4, 8, GLASS, light=True)
        c.rface(0.75, 0.8, 1.0, 4, 8, GLASS_D, light=True)
        c.box(0.22, 0.67, 0.78, 1.33, 10, 12, NAVY)
    else:
        c.box(0.15, 0.45, 0.85, 1.75, 1, 14, CON_L)
        for k in range(3):
            c.lface(1.75, 0.22 + k * 0.22, 0.36 + k * 0.22, 6, 11, GLASS, light=k != 1)
        for k in range(5):
            c.rface(0.85, 0.55 + k * 0.23, 0.7 + k * 0.23, 6, 11, GLASS_D, light=k % 2 == 0)
        c.lface(1.75, 0.15, 0.85, 12, 14, ORANGE)
        c.rface(0.85, 0.45, 1.75, 12, 14, ORANGE_D)
        c.box(0.13, 0.43, 0.87, 1.77, 14, 15, NAVY)
    base = 12 if level == 0 else 15
    cyl(c, 0.5, 1.0, base, top + 2, 0.17 if level else 0.15, CON_L)
    x, y = c.P(0.5, 1.0, base)
    for z in range(base + 7, top - 2, 8):  # slit windows up the shaft
        c.d.point([(x + 2, y - (z - base))], fill=A(GLASS_D))
        c.ld.point([(x + 2, y - (z - base))], fill=A(LIT))
    # cab: floor slab, gallery rail, glass, roof
    z0 = top
    c.box(0.12, 0.62, 0.88, 1.38, z0, z0 + 3, NAVY)
    c.box(0.18, 0.68, 0.82, 1.32, z0 + 3, z0 + 14, GLASS)
    c.lface(1.32, 0.18, 0.82, z0 + 3, z0 + 14, GLASS, light=True)
    c.rface(0.82, 0.68, 1.32, z0 + 3, z0 + 14, GLASS_D, light=True)
    for t in (0.34, 0.5, 0.66):  # mullions
        c.lface(1.32, t, t + 0.02, z0 + 3, z0 + 14, NAVY_D)
        c.rface(0.82, 0.68 + (t - 0.18) * 0.94, 0.7 + (t - 0.18) * 0.94, z0 + 3, z0 + 14, NAVY_D)
    c.lface(1.38, 0.12, 0.88, z0 + 5, z0 + 6, CON_L)
    c.rface(0.88, 0.62, 1.38, z0 + 5, z0 + 6, CON_M)
    c.box(0.1, 0.6, 0.9, 1.4, z0 + 14, z0 + 17, NAVY, top=shade(NAVY, 1.2))
    c.lface(1.4, 0.1, 0.9, z0 + 14, z0 + 15, ORANGE)
    c.rface(0.9, 0.6, 1.4, z0 + 14, z0 + 15, ORANGE_D)
    c.box(0.38, 0.88, 0.62, 1.12, z0 + 17, z0 + 20, CON_M)
    # antenna and beacon
    x, y = c.P(0.5, 1.0, z0 + 20)
    c.d.line([(x, y), (x, y - 10)], fill=A(CON_L))
    c.d.rectangle((x - 1, y - 12, x + 1, y - 11), fill=A(RED_L))
    c.ld.rectangle((x - 1, y - 12, x + 1, y - 11), fill=A(RED_L))
    c.ld.rectangle((x - 2, y - 13, x + 2, y - 10), fill=A(RED_L, 110))
    if level == 3:  # the radar dish on its own mast at the foot of the tower
        xr, yr = c.P(0.5, 1.7, 15)
        c.d.line([(xr, yr), (xr, yr - 14)], fill=A(CON_D))
        c.d.line([(xr - 1, yr), (xr - 1, yr - 14)], fill=A(CON_L))
        # a surveillance radar: a wide curved reflector bar, tilted up, on a turning head
        c.d.rectangle((xr - 2, yr - 17, xr + 1, yr - 14), fill=A(CON_D))
        c.d.polygon([(xr - 9, yr - 21), (xr + 9, yr - 24), (xr + 9, yr - 19), (xr - 9, yr - 16)], fill=A(CON_M))
        c.d.polygon([(xr - 9, yr - 22), (xr + 9, yr - 25), (xr + 9, yr - 21), (xr - 9, yr - 18)], fill=A(WHITE))
        c.d.line([(xr - 9, yr - 20), (xr + 9, yr - 23)], fill=A(CON_L))
        c.d.point([(xr + 9, yr - 26)], fill=A(RED_L))
        c.ld.point([(xr + 9, yr - 26)], fill=A(RED_L))
    else:
        xr, yr = c.P(0.7, 0.75, z0 + 20)
        c.d.line([(xr, yr), (xr, yr - 3)], fill=A(CON_D))
        c.d.line([(xr - 3, yr - 4), (xr + 3, yr - 4)], fill=A(WHITE))
    if level == 0:
        windsock(c, 0.5, 1.85, 1, 22)
    return c


# ── terminal ──────────────────────────────────────────────────────────────────

def barrel(c, a0, a1, b0, b1, z, h, col, along_u=True, n=10):
    """A curved roof: an arc of height h over the b span, running along a (u if along_u else v). Strips are drawn
    back to front; the visible end gets its cap."""
    pts = [(b0 + (b1 - b0) * k / n, z + h * math.sin(math.pi * k / n)) for k in range(n + 1)]
    for k in range(n):
        (p, zp), (q, zq) = pts[k], pts[k + 1]
        slope = (zq - zp) / max(0.01, (q - p) * 16)
        f = 1.04 + 0.12 * slope if along_u else 0.96 - 0.22 * max(-1, min(1, -slope))
        f = max(0.68, min(1.16, f))
        if along_u:
            c.poly([(a0, p, zp), (a1, p, zp), (a1, q, zq), (a0, q, zq)], shade(col, f))
        else:
            c.poly([(p, a0, zp), (p, a1, zp), (q, a1, zq), (q, a0, zq)], shade(col, f))
    cap = [(a1, p, zp) for p, zp in pts] if along_u else [(p, a1, zp) for p, zp in pts]
    cap += [(a1, b1, z), (a1, b0, z)] if along_u else [(b1, a1, z), (b0, a1, z)]
    c.poly(cap, shade(col, 0.74 if along_u else 0.9))
    return pts


def apron_strip(c, u0, u1, v0, v1, gates):
    """The apron in front of the gates: concrete slabs, a yellow lead-in line and stop bar for each gate."""
    c.poly([(u0, v0, 2), (u1, v0, 2), (u1, v1, 2), (u0, v1, 2)], APRON)
    for k in range(1, int((u1 - u0) / 0.5) + 1):
        c.line((u0 + k * 0.5, v0, 2), (u0 + k * 0.5, v1, 2), shade(APRON, 0.92))
    for g in gates:
        c.poly([(g - 0.015, v0 + 0.05, 2), (g + 0.015, v0 + 0.05, 2), (g + 0.015, v1 - 0.04, 2), (g - 0.015, v1 - 0.04, 2)], YELLOW)
        c.poly([(g - 0.1, v0 + 0.22, 2), (g + 0.1, v0 + 0.22, 2), (g + 0.1, v0 + 0.25, 2), (g - 0.1, v0 + 0.25, 2)], YELLOW)


def gate_doors(c, u0, u1, v, z, n, h=9):
    """n gate doors along a front wall, each with its number on a navy plate above it (lit at night). Returns the
    gate centres."""
    w = (u1 - u0) / n
    centres = []
    for k in range(n):
        m = u0 + w * (k + 0.5)
        centres.append(m)
        c.lface(v, m - 0.08, m + 0.08, z, z + h, NAVY_D)
        c.lface(v, m - 0.06, m + 0.06, z + 1, z + h - 1, GLASS_D, light=True)
        c.lface(v, m - 0.12, m + 0.12, z + h + 1, z + h + 8, NAVY)
        x, y = c.P(m - 0.12, v, z + h + 7)
        lbl = str(k + 1)
        off = (round(0.24 * 16) - text_w(lbl)) // 2
        text(c, lbl, x + off, y + 1 + off // 2, WHITE, WHITE, 1)
    return centres


def terminal(level):
    """Passenger terminal (4x2): a glass hall under a curved silver roof with an orange fascia, its gates on the
    front with their numbers, a flight board on the end wall. 1: 4 gates, one storey. 2: 8 gates on two floors.
    3: jet bridges at the gates and a lit operations centre with screens at the west end."""
    c = Kit(4, 2, 80)
    c.box(0.04, 0.04, 3.96, 1.96, 0, 2, CON_L, top=(214, 216, 220))
    two = level >= 2
    u0, v0, u1, v1, h = (0.3, 0.2, 3.65, 1.0, 16) if not two else (0.15, 0.15, 3.85, 1.05, 26)
    gates_n = 4 if level == 1 else 8
    apron_strip(c, 0.08, 3.92, v1 + 0.02, 1.94, [])
    hall_u0 = u0 if level < 3 else 1.1
    if level == 3:  # the operations centre: a tall glass block, its screens glowing through the glass
        ou0, ou1 = u0, 1.1
        prism(c, ou0, v0, ou1, v1, 2, 44, (200, 206, 214), L=combine(top_band(3, NAVY), glass("opsL", bay=4, floor=6, p=0.75, lo=2)),
              R=combine(top_band(3, NAVY), glass("opsR", bay=4, floor=6, p=0.7, lo=2)), ao=True)
        screen(c, "L", v1, ou0 + 0.1, ou1 - 0.1, 30, 39, "opsS", (110, 240, 170), kind="bars")
        screen(c, "R", ou1, v0 + 0.1, v1 - 0.1, 30, 39, "opsS2", (255, 196, 60), kind="ticker")
        x, y = c.P((ou0 + ou1) / 2, (v0 + v1) / 2, 44)
        c.d.line([(x, y), (x, y - 12)], fill=A(CON_D))
        dish(c, ou0 + 0.25, v0 + 0.25, 44, 4, WHITE, 1)
        beacon(c, (ou0 + ou1) / 2, (v0 + v1) / 2, 57)
    c.box(hall_u0, v0, u1, v1, 2, h, CON_L)
    r = seeded(f"terminal{level}")
    n = 16 if two else 13
    for k in range(n):  # the glass front, floor to roof, with mullions
        a = hall_u0 + 0.04 + k * (u1 - hall_u0 - 0.08) / n
        b = a + (u1 - hall_u0 - 0.08) / n - 0.03
        c.lface(v1, a, b, 3, h - 1, GLASS, light=r(5) > 0)
    for k in range(3):
        a = v0 + 0.06 + k * 0.27
        c.rface(u1, a, a + 0.2, 3, h - 1, GLASS_D, light=k != 2)
    if two:
        c.lface(v1, hall_u0, u1, 14, 15, NAVY)  # the upper floor's slab
    # the flight board on the end wall: rows of departures, lit
    fb_z = 6 if not two else 16
    c.rface(u1, v0 + 0.15, v1 - 0.12, fb_z, fb_z + 8, (24, 28, 40))
    for row in range(3):
        for k in range(5):
            vv = v1 - 0.18 - k * 0.11
            x, y = c.P(u1, vv, fb_z + 6 - row * 2)
            col = (255, 214, 90) if (row + k) % 3 else WHITE
            c.d.point([(x, y)], fill=A(col))
            c.ld.point([(x, y)], fill=A(col))
    # gates along the front (gate doors at ground level; upstairs at level 2+)
    gz = 3 if not two else 15
    centres = gate_doors(c, hall_u0 + (0.05 if level < 3 else 0.0), u1 - 0.05, v1, gz, gates_n if level < 3 else 6, 7 if two else 6)
    if level < 3:
        apron_strip(c, 0.08, 3.92, v1 + 0.02, 1.94, centres)
    # roof: a silver barrel vault along the hall, overhanging front and back, orange fascia under its edge
    barrel(c, hall_u0 - 0.06, u1 + 0.08, v0 - 0.12, v1 + 0.14, h, 10 if not two else 12, (214, 220, 230))
    c.lface(v1 + 0.14, hall_u0 - 0.06, u1 + 0.08, h - 2, h, ORANGE)
    c.rface(u1 + 0.08, v0 - 0.12, v1 + 0.14, h - 2, h, ORANGE_D)
    c.ld.line([c.P(hall_u0 - 0.04, v1 + 0.14, h - 2), c.P(u1 + 0.06, v1 + 0.14, h - 2)], fill=A(LIT, 200))
    if level == 3:  # jet bridges from the upper floor out over the apron, each on a wheeled leg, a cab at its end
        apron_strip(c, 1.1, 3.92, 1.86, 1.94, [])
        for g in (centres[0], centres[2], centres[4], centres[5] + 0.25):
            bw = 0.09
            prism(c, g - bw, v1 + 0.14, g + bw, 1.7, 13, 19, (226, 230, 236), L=combine(top_band(1, ORANGE)),
                  R=combine(top_band(1, ORANGE), glass(f"jb{g:.2f}", bay=3, floor=6, p=0.85, lo=1, refl=False)), ao=False, rim=0)
            prism(c, g - bw - 0.03, 1.7, g + bw + 0.03, 1.86, 12, 20, NAVY, L=lambda i, n_, z, hh, b, s: ((GLASS_D, LIT) if 0 < i < n_ - 1 and 2 <= z < hh - 2 else None),
                  ao=False, rim=0)
            x, y = c.P(g, 1.62, 2)
            c.d.line([(x, y), (x, y - 10)], fill=A(CON_D))
            c.d.rectangle((x - 2, y - 1, x + 2, y + 1), fill=A(CHAR))
            c.poly([(g - 0.07, 1.86, 2), (g + 0.07, 1.86, 2), (g + 0.07, 1.95, 2), (g - 0.07, 1.95, 2)], YELLOW)
    else:  # a jet bridge stub toward the stand (+u)
        c.box(u1, 0.6, 3.97, 0.85, 6, 12, CON_M)
        c.rface(3.97, 0.62, 0.83, 7, 11, GLASS_D, light=True)
    return c


# ── stand ─────────────────────────────────────────────────────────────────────

def stand(level=0):
    """Cargo stand (2x2): concrete apron, yellow lead-in line and stop bar, a red no-park hatch; the ground crew's kit
    grows with the level (crates; a belt loader; a tug with carts and a second loader; containers on dollies)."""
    c = Kit(2, 2, 30)
    c.poly([(0, 0), (2, 0), (2, 2), (0, 2)], APRON)
    for t in (0.5, 1.0, 1.5):  # slab joints
        c.line((t, 0, 0), (t, 2, 0), shade(APRON, 0.9))
        c.line((0, t, 0), (2, t, 0), shade(APRON, 0.9))
    r = seeded("apron")
    for _ in range(10):
        x, y = c.P(r(190) / 100, r(190) / 100)
        c.d.point([(x, y)], fill=A(shade(APRON, 0.84)))
    for (a, b) in (((0.2, 0.2), (1.85, 0.2)), ((0.2, 1.8), (1.85, 1.8)), ((0.2, 0.2), (0.2, 1.8)), ((1.85, 0.2), (1.85, 1.8))):
        c.poly([(a[0] - 0.02, a[1] - 0.02), (b[0] + 0.02, a[1] - 0.02), (b[0] + 0.02, b[1] + 0.02), (a[0] - 0.02, b[1] + 0.02)], YELLOW)
    c.poly([(0, 0.975), (1.55, 0.975), (1.55, 1.025), (0, 1.025)], YELLOW)  # lead-in line
    c.poly([(1.55, 0.78), (1.62, 0.78), (1.62, 1.22), (1.55, 1.22)], YELLOW)  # stop bar
    c.poly([(1.62, 0.78), (1.68, 0.78), (1.68, 1.22), (1.62, 1.22)], (214, 58, 58))
    for k in range(4 if level < 3 else 7):
        lamp_px(c, 0.3 + k * (0.35 if level < 3 else 0.2), 1.0, GREEN_L, day=YELLOW)
    for k in range(4):  # no-park hatch in front of the crates
        a = 1.25 + k * 0.15
        c.poly([(a, 1.4), (a + 0.06, 1.4), (a + 0.06, 1.72), (a, 1.72)], (214, 58, 58))
    c.d.line([c.P(0, 2), c.P(2, 2), c.P(2, 0)], fill=A(shade(APRON, 0.8)))
    kit = Kit(2, 2, 30)
    crate_stack(kit, 1.42, 0.22, s=0.8, lamp=True)
    kit.box(1.25, 0.72, 1.4, 0.87, 0, 9, ORANGE)  # a cone-ish bollard
    if level >= 1:
        belt_loader(kit, 0.75, 0.42)
    if level >= 2:
        belt_loader(kit, 0.75, 1.32, col=(240, 240, 240))
        tug(kit, 1.5, 1.72, carts=2)
    if level >= 3:
        for k in range(3):
            kit.box(0.1 + k * 0.4, 1.5, 0.46 + k * 0.4, 1.82, 0, 2, CON_D)
            uld(kit, 0.11 + k * 0.4, 1.51, 2, ULD if k != 1 else (170, 182, 200))
    c.img.alpha_composite(outline(kit.img))
    c.lights.alpha_composite(kit.lights)
    return c


# ── parcel sorting shed and hangars ───────────────────────────────────────────

def conveyor(c, u0, u1, v, z, key, n=5):
    """A raised conveyor belt along u on legs, parcels riding on it."""
    for k in range(int((u1 - u0) / 0.3) + 1):
        x, y = c.P(u0 + 0.05 + k * 0.3, v + 0.08, 2)
        c.d.line([(x, y), (x, y - (z - 2))], fill=A(CON_D))
    c.box(u0, v, u1, v + 0.16, z, z + 2, (64, 70, 82), top=(46, 50, 60))
    c.lface(v + 0.16, u0, u1, z, z + 1, YELLOW)
    for k in range(n):
        uu = u0 + 0.08 + (u1 - u0 - 0.2) * (k + seeded(key)(40) / 100) / n
        c.box(uu, v + 0.03, uu + 0.12, v + 0.13, z + 2, z + 5 + k % 2, CRATE if k % 3 else ORANGE)


def sign(c, v, u0, u1, z, words):
    """A navy board with pixel words, lit at night."""
    c.lface(v, u0, u1, z, z + 8, NAVY)
    c.lface(v, u0, u1, z, z + 1, ORANGE)
    x0, y0 = c.P(u0, v, z + 7)
    x1 = c.P(u1, v, z + 7)[0]
    off = ((x1 - x0) - text_w(words)) // 2
    text(c, words, x0 + off, y0 + off // 2, WHITE, WHITE, 1)


def sort_shed(name):
    """Parcel sorting shed (3x2): a low corrugated shed, roller doors, one conveyor running out along the front."""
    c = Kit(3, 2, 48)
    c.box(0.04, 0.04, 2.96, 1.96, 0, 2, CON_L, top=(200, 204, 210))
    u0, v0, u1, v1, h = 0.25, 0.2, 2.75, 1.2, 18
    prism(c, u0, v0, u1, v1, 2, h, (206, 212, 222), L=combine(top_band(3, ORANGE), ribs(3)), R=combine(top_band(3, ORANGE), ribs(3)), ao=True)
    for k, m in enumerate((0.7, 1.5)):  # roller doors, one open and lit
        if k == 0:
            c.lface(v1, m - 0.25, m + 0.25, 2, 12, (46, 54, 70))
            c.ld.polygon([c.P(m - 0.25, v1, 2), c.P(m + 0.25, v1, 2), c.P(m + 0.25, v1, 12), c.P(m - 0.25, v1, 12)], fill=A(LIT, 70))
        else:
            for z in range(2, 12, 2):
                c.lface(v1, m - 0.25, m + 0.25, z, z + 2, CON_M if z % 4 else CON_L)
    sign(c, v1, 1.95, 2.7, 6, name)
    conveyor(c, 0.45, 2.85, 1.45, 6, "sort1")
    for k in range(3):
        c.rface(u1, v0 + 0.15 + k * 0.28, v0 + 0.3 + k * 0.28, 6, 10, GLASS_D, light=k != 1)
    x, y = c.P(2.9, 1.9, 2)
    c.d.line([(x, y), (x, y - 16)], fill=A(CON_D))
    c.ld.polygon([(x, y - 16), (x - 6, y), (x + 6, y)], fill=A((255, 240, 200), 40))
    c.d.point([(x, y - 16)], fill=A((255, 244, 210)))
    c.ld.point([(x, y - 16)], fill=A((255, 244, 210)))
    return c


def arch_hangar(c, u0, u1, v0, v1, base, H, name, key, door=0.75):
    """A ribbed silver arched hangar along u, its open door on the front (v = v1) lit inside, crates and a container
    in the bay, a sign of pixel words over the door."""
    side = 6
    c.box(u0, v0, u1, v1, base, base + side, CON_M)
    n = 14
    pts = [(u0 + (u1 - u0) * k / n, base + side + H * math.sin(math.pi * k / n) ** 0.8) for k in range(n + 1)]
    for k in range(n):  # roof strips, back (small u) to front
        (p, zp), (q, zq) = pts[k], pts[k + 1]
        f = 1.08 if zq >= zp else 0.82 - 0.06 * (k - n / 2) / (n / 2)
        col = shade((206, 212, 222), f)
        c.poly([(p, v0, zp), (q, v0, zq), (q, v1, zq), (p, v1, zp)], col)
        c.line((p, v0, zp), (p, v1, zp), shade(col, 0.86))
    face_ = [(p, v1, z) for p, z in pts] + [(u1, v1, base), (u0, v1, base)]
    c.poly(face_, (226, 230, 236))
    w = (u1 - u0) * door
    du0, du1 = (u0 + u1 - w) / 2, (u0 + u1 + w) / 2
    dpts = [(du0 + (du1 - du0) * k / n, base + (H + side - 12) * math.sin(math.pi * k / n) ** 0.6) for k in range(n + 1)]
    c.poly([(p, v1, z) for p, z in dpts], (46, 54, 70))
    c.ld.polygon([c.P(p, v1, z) for p, z in dpts], fill=A(LIT, 45))
    m = (du0 + du1) / 2
    c.lface(v1, m - 0.55, m - 0.15, base + 1, base + 9, CRATE)
    c.lface(v1, m - 0.55, m - 0.15, base + 5, base + 6, CRATE_D)
    c.lface(v1, m - 0.5, m - 0.25, base + 9, base + 14, ORANGE)
    c.lface(v1, m + 0.1, m + 0.6, base + 1, base + 11, ULD)
    c.lface(v1, m + 0.1, m + 0.6, base + 11, base + 12, shade(ULD, 0.8))
    for k in range(3):
        c.lface(v1, m + 0.15 + k * 0.15, m + 0.17 + k * 0.15, base + 2, base + 10, shade(ULD, 0.7))
    for u in (m - 0.5, m, m + 0.5):  # hanging lamps
        x, y = c.P(u, v1, base + 20)
        c.d.point([(x, y)], fill=A(LIT))
        c.ld.point([(x, y)], fill=A(LIT))
        c.ld.ellipse((x - 3, y - 1, x + 3, y + 3), fill=A(LIT, 90))
    c.lface(v1, du0 - 0.18, du0 + 0.02, base, base + 16, ORANGE_D)
    c.lface(v1, du1 - 0.02, du1 + 0.18, base, base + 16, ORANGE_D)
    top = max(z for _, z in dpts)
    tw = text_w(name) / 16 + 0.14
    sign(c, v1, m - tw / 2, m + tw / 2, round(top) + 2, name)
    for k in range(4):
        c.rface(u1, v0 + 0.12 + k * 0.3, v0 + 0.28 + k * 0.3, base + 2, base + 5, GLASS_D, light=k % 2 == 0)


def hangar(level, name):
    """Cargo hangar (3x2). Level 2: the arched hangar with a sorting annex and a second conveyor; level 3: a wider
    hangar, containers lined up in front, floodlights on masts."""
    c = Kit(3, 2, 60)
    c.box(0.04, 0.04, 2.96, 1.96, 0, 2, CON_L, top=(200, 204, 210))
    if level == 2:
        prism(c, 2.3, 0.35, 2.9, 1.25, 2, 14, (206, 212, 222), L=combine(top_band(2, ORANGE), ribs(3)), R=combine(top_band(2, ORANGE), ribs(3)), ao=True)
        c.lface(1.25, 2.45, 2.75, 2, 9, (46, 54, 70))
        c.ld.polygon([c.P(2.45, 1.25, 2), c.P(2.75, 1.25, 2), c.P(2.75, 1.25, 9), c.P(2.45, 1.25, 9)], fill=A(LIT, 70))
        arch_hangar(c, 0.12, 2.22, 0.2, 1.4, 2, 30, name, "h2")
        conveyor(c, 1.6, 2.9, 1.55, 5, "h2c", 4)
        conveyor(c, 2.0, 2.9, 1.78, 3, "h2d", 3)
    else:
        arch_hangar(c, 0.1, 2.9, 0.15, 1.3, 2, 36, name, "h3", door=0.7)
        for k in range(5):
            uld(c, 0.2 + k * 0.5, 1.5, 2, ULD if k % 2 else (170, 182, 200))
        for u in (0.1, 2.9):
            x, y = c.P(u, 1.92, 2)
            c.d.line([(x, y), (x, y - 26)], fill=A(CON_D))
            c.d.rectangle((x - 2, y - 28, x + 2, y - 26), fill=A(CHAR))
            c.d.point([(x - 1, y - 27), (x + 1, y - 27)], fill=A((255, 250, 220)))
            c.ld.point([(x - 1, y - 27), (x + 1, y - 27)], fill=A((255, 250, 220)))
            c.ld.polygon([(x, y - 26), (x - 10, y), (x + 10, y)], fill=A((255, 244, 210), 36))
    return c


# ── jets ──────────────────────────────────────────────────────────────────────

# forward and starboard unit vectors in (u, v) for each facing
AXES = {"SE": ((1, 0), (0, 1)), "SW": ((0, 1), (-1, 0)), "NE": ((0, -1), (1, 0)), "NW": ((-1, 0), (0, -1))}
JS = 1.32  # jet scale: about 2.6 tiles nose to tail
LIVERIES = {
    # Amazon Air-style: a navy body, a blue belly line and fin, white "PRIME AIR" on the side (no logo artwork)
    "amazon": dict(body=(34, 50, 88), crown=(48, 66, 108), belly=(0, 128, 206), cheat=(0, 150, 222), fin=(0, 122, 200),
                   fin_tip=(22, 34, 62), cowl=(0, 150, 222), words="PRIME AIR", ink=WHITE, nose=(34, 50, 88)),
    "cargo": dict(body=(244, 246, 250), crown=(252, 252, 255), belly=(30, 44, 82), cheat=(255, 140, 0), fin=(255, 140, 0),
                  fin_tip=(30, 44, 82), cowl=(255, 140, 0), words="AIR CARGO", ink=(30, 44, 82), nose=(30, 44, 82)),
    "pax": dict(body=(244, 246, 250), crown=(252, 252, 255), belly=(170, 178, 190), cheat=(20, 170, 160), fin=(20, 170, 160),
                fin_tip=(244, 246, 250), cowl=(200, 206, 216), words=None, ink=None, nose=(244, 246, 250), windows=True),
}


def jet(d, lv, gear=True):
    """A twin-engine jet about 2.6 tiles long, in the cars' iso view, centred on its 3x3 canvas. Parts are drawn back
    to front for the facing (gear, far engine and wing, fuselage, fin, near wing and engine). lv: a LIVERIES entry."""
    c = Kit(3, 3, 52)
    (fu, fv), (su, sv) = AXES[d]
    along_u = fu != 0
    near_side = 1 if (su + sv) > 0 else -1  # which starboard sign faces the viewer
    nose_near = (fu + fv) > 0
    Z = 1.15  # height scale
    lift = 0 if gear else 3

    def zz(z):
        return round(z * Z) + lift

    def uv(a, w):
        return 1.5 + JS * (a * fu + w * su), 1.5 + JS * (a * fv + w * sv)

    def B(a0, a1, w0, w1, z0, z1, col, **kw):
        (ua, va), (ub, vb) = uv(a0, w0), uv(a1, w1)
        c.box(min(ua, ub), min(va, vb), max(ua, ub), max(va, vb), zz(z0), zz(z1), col, **kw)

    def poly(pts, col):
        c.poly([(*uv(a, w), zz(z)) for a, w, z in pts], col)

    def side(a0, a1, half, z0, z1, col):
        """Paint on the fuselage's visible long side (a range a0..a1), half = its half-width."""
        (ua, va), (ub, vb) = uv(a0, half * near_side), uv(a1, half * near_side)
        if along_u:
            c.lface(va, min(ua, ub), max(ua, ub), zz(z0), zz(z1), col)
        else:
            c.rface(ua, min(va, vb), max(va, vb), zz(z0), zz(z1), col)

    def endf(a, half, z0, z1, col, f0=-1.0, f1=1.0):
        (ua, va), (ub, vb) = uv(a, f0 * half), uv(a, f1 * half)
        if along_u:
            c.rface(ua, min(va, vb), max(va, vb), zz(z0), zz(z1), col)
        else:
            c.lface(va, min(ua, ub), max(ua, ub), zz(z0), zz(z1), col)

    def light(a, w, z, col, r=1):
        x, y = c.P(*uv(a, w), zz(z))
        c.d.point([(x, y)], fill=A(col))
        c.ld.rectangle((x - r, y - r, x + r, y + r), fill=A(col, 120))
        c.ld.point([(x, y)], fill=A(col))

    def wing(sign):
        poly([(0.4, 0.14 * sign, 7), (-0.08, 0.14 * sign, 7), (-0.36, 1.0 * sign, 9), (-0.18, 1.0 * sign, 9)], (206, 212, 224))
        poly([(0.4, 0.14 * sign, 7), (0.3, 0.14 * sign, 7), (-0.2, 1.0 * sign, 9), (-0.18, 1.0 * sign, 9)], (236, 240, 246))
        poly([(-0.08, 0.14 * sign, 7), (-0.16, 0.14 * sign, 7), (-0.39, 1.0 * sign, 9), (-0.36, 1.0 * sign, 9)], CON_M)
        poly([(-0.17, 1.0 * sign, 9), (-0.22, 1.0 * sign, 9), (-0.24, 1.0 * sign, 13), (-0.2, 1.0 * sign, 13)], lv["fin"])  # winglet
        light(-0.26, 0.99 * sign, 9, (90, 240, 120) if sign > 0 else (255, 60, 60))

    def engine(sign):
        w = 0.44 * sign
        B(0.1, 0.5, w - 0.07, w + 0.07, 3, 7, (64, 74, 96), top=(92, 104, 128))
        B(0.42, 0.52, w - 0.075, w + 0.075, 3, 7, lv["cowl"])
        B(0.12, 0.36, w - 0.02, w + 0.02, 7, 8, CON_M)
        if nose_near:
            (ua, va) = uv(0.52, w)
            if along_u:
                c.rface(ua, va - 0.06, va + 0.06, zz(4), zz(7), (40, 44, 56))
            else:
                c.lface(va, ua - 0.06, ua + 0.06, zz(4), zz(7), (40, 44, 56))

    def stab(sign):
        poly([(-0.72, 0.1 * sign, 15), (-0.88, 0.1 * sign, 15), (-0.98, 0.44 * sign, 15), (-0.88, 0.44 * sign, 15)], (210, 216, 226))

    def gear_():
        for a, ws in ((0.6, (0,)), (-0.08, (-0.17, 0.17))):
            for w in ws:
                B(a - 0.03, a + 0.03, w - 0.03, w + 0.03, 0, 5, CON_D)
                x, y = c.P(*uv(a, w), 0)
                c.d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=A(OUTLINE))

    def words_on_side(a0, a1, half, z_top):
        s = lv["words"]
        w_px = text_w(s)
        (ua, va), (ub, vb) = uv(a0, half * near_side), uv(a1, half * near_side)
        pa, pb = c.P(ua, va, zz(z_top)), c.P(ub, vb, zz(z_top))
        left, right = (pa, pb) if pa[0] < pb[0] else (pb, pa)
        off = max(0, ((right[0] - left[0]) - w_px) // 2)
        slope = 1 if along_u else -1
        text(c, s, left[0] + off, left[1] + slope * (off // 2) + 1, lv["ink"], None, slope)

    def fuselage():
        half = 0.14
        segs = [
            (-0.98, -0.82, 0.09, 10, 16),  # upswept tail cone
            (-0.82, 0.72, half, 5, 16),
            (0.72, 0.9, 0.11, 6, 14),     # nose
            (0.9, 0.98, 0.07, 7, 12),
        ]
        order = segs if nose_near else list(reversed(segs))
        for a0, a1, hw, z0, z1 in order:
            B(a0, a1, -hw, hw, z0, z1, lv["body"], top=lv["crown"])
            if a0 == -0.82:
                side(a0, a1, hw, z0, z0 + 2, lv["belly"])
                side(a0, a1, hw, z0 + 2, z0 + 3, lv["cheat"])
                B(-0.6, 0.6, -0.07, 0.07, z1, z1 + 1, lv["crown"])
                side(0.5, 0.58, hw, z0 + 4, z0 + 9, shade(lv["body"], 0.86))  # crew door
                if lv.get("windows"):
                    for k in range(17):
                        a = -0.7 + k * 0.07
                        x, y = c.P(*uv(a, hw * near_side), zz(z0 + 7))
                        c.put(x, y, (40, 60, 90), LIT)
                if lv["words"]:
                    words_on_side(-0.62, 0.66, hw, z0 + 9.5)
            elif a0 == 0.72:
                side(a0, a1, hw, z0, z0 + 2, lv["belly"])
                side(0.76, 0.86, hw, z0 + 5, z0 + 7, NAVY_D)  # cockpit side window
            elif a0 == 0.9:
                side(a0, a1, hw, z0, z0 + 2, lv["nose"])
        if nose_near:
            endf(0.98, 0.07, 9, 11, NAVY_D)
            endf(0.9, 0.11, 10, 12, NAVY_D, -1, -0.45)
            endf(0.9, 0.11, 10, 12, NAVY_D, 0.45, 1)

    def fin():
        poly([(-0.5, 0, 16), (-0.86, 0, 16), (-1.0, 0, 31), (-0.8, 0, 31)], lv["fin"])
        poly([(-0.58, 0, 16), (-0.7, 0, 16), (-0.8, 0, 24), (-0.7, 0, 24)], shade(lv["fin"], 0.86))
        poly([(-0.95, 0, 26), (-1.0, 0, 31), (-0.8, 0, 31), (-0.7, 0, 26)], lv["fin_tip"])
        light(-0.96, 0, 31, (255, 255, 255))

    if gear:
        gear_()
    far, near = -near_side, near_side
    engine(far)
    wing(far)
    stab(far)
    stab(near)  # the thin tailplane goes under the fuselage's lettering
    fuselage()
    fin()
    engine(near)
    wing(near)
    light(0.0, 0, 17, (255, 60, 60))  # beacon on the crown
    x, y = c.P(*uv(0.98, 0), zz(7))
    c.d.point([(x, y)], fill=A((255, 250, 220)))
    bx, by = c.P(*uv(1.1, 0), 0)
    c.ld.polygon([(x, y), (bx - 7, by - 2), (bx + 7, by + 2)], fill=A((255, 244, 200), 60 if gear else 90))
    c.ld.point([(x, y)], fill=A((255, 250, 220)))
    return c


def centred(c):
    """A jet's image with its anchor at the jet's centre on the ground (canvas centre (1.5, 1.5, 0))."""
    img, _, lit = c.finish()
    return img, c.P(1.5, 1.5, 0), lit


def jet_shadow():
    """A soft dark shape under the jet: an elongated blob, anchored at its centre."""
    c = Kit(3, 3, 0)
    img = Image.new("RGBA", (c.w, c.h), CLEAR)
    d = ImageDraw.Draw(img)
    cx, cy = c.P(1.5, 1.5, 0)
    d.ellipse((cx - 36, cy - 13, cx + 36, cy + 13), fill=(10, 20, 40, 62))
    d.ellipse((cx - 23, cy - 8, cx + 23, cy + 8), fill=(10, 20, 40, 84))
    img = img.filter(ImageFilter.GaussianBlur(2))
    return img, (cx, cy)


# ── build ─────────────────────────────────────────────────────────────────────

def build(add):
    branded = brand()
    name = "PRIME AIR" if branded else "AIR CARGO"
    add("air:rwyEndW", runway("W"), do_outline=False)
    add("air:rwy0", runway("dash"), do_outline=False)
    add("air:rwy1", runway("gap"), do_outline=False)
    add("air:rwyEndE", runway("E"), do_outline=False)
    add("air:rwyEndW:3", runway("W", approach=True), do_outline=False)
    add("air:rwyEndE:3", runway("E", approach=True), do_outline=False)
    add("air:taxi", taxiway(), do_outline=False)
    add("air:taxi:sign", taxiway(sign=True), do_outline=False)
    add("air:tower:0", tower(0))
    add("air:tower", tower(1))
    add("air:tower:3", tower(3))
    t = terminal(1)
    add("air:terminal", t)
    add("air:terminal:locked", locked(t, 4, 2, 80, 2, 7), lights=False)
    add("air:terminal:2", terminal(2))
    add("air:terminal:3", terminal(3))
    add("air:stand", stand(0), do_outline=False)
    for lvl in (1, 2, 3):
        add(f"air:stand:{lvl}", stand(lvl), do_outline=False)
    add("air:sort", sort_shed("SORT"))
    h = hangar(2, name)
    add("air:hangar", h)
    add("air:hangar:locked", locked(h, 3, 2, 60, 2, 7), lights=False)
    add("air:hangar:3", hangar(3, name))
    add("air:crates", crates())
    cargo = LIVERIES["amazon" if branded else "cargo"]
    for kind, lv in (("cargo", cargo), ("pax", LIVERIES["pax"])):
        for d in AXES:
            for gear, suffix in ((True, ""), (False, ":air")):
                img, anchor, lit = centred(jet(d, lv, gear))
                add(f"veh:plane:{kind}:{d}{suffix}", img, anchor)
                if lit is not None:
                    add(f"veh:plane:{kind}:{d}{suffix}@lights", lit, anchor)
    img, anchor = jet_shadow()
    add("veh:plane:cargo:shadow", img, anchor)


# ── preview (.cache/art/airport-preview.png) ──────────────────────────────────

LEVELS = {
    0: dict(ends=("air:rwyEndW", "air:rwyEndE"), tower="air:tower:0", terminal="air:terminal:locked", stand="air:stand", hangar="air:hangar:locked", signs=False),
    1: dict(ends=("air:rwyEndW", "air:rwyEndE"), tower="air:tower", terminal="air:terminal", stand="air:stand:1", hangar="air:sort", signs=True),
    2: dict(ends=("air:rwyEndW", "air:rwyEndE"), tower="air:tower", terminal="air:terminal:2", stand="air:stand:2", hangar="air:hangar", signs=True),
    3: dict(ends=("air:rwyEndW:3", "air:rwyEndE:3"), tower="air:tower:3", terminal="air:terminal:3", stand="air:stand:3", hangar="air:hangar:3", signs=True),
}


def site_pieces(level):
    """(sprite, x, y, w, h) on a 10x4 site at (0, 0), as src/world/airport.ts lays it out, for this level."""
    L = LEVELS[level]
    out = []
    for i in range(10):
        rwy = L["ends"][0] if i == 0 else L["ends"][1] if i == 9 else f"air:rwy{i % 2}"
        out.append((rwy, i, 0, 1, 1))
        out.append(("air:taxi:sign" if L["signs"] and i in (2, 7) else "air:taxi", i, 1, 1, 1))
    out += [(L["tower"], 0, 2, 1, 2), (L["terminal"], 1, 2, 4, 2), (L["stand"], 5, 2, 2, 2), (L["hangar"], 7, 2, 3, 2)]
    return out


def preview(sprites, path):
    from preview_services import night
    HW_, HH_ = 16, 8
    W, H = 420, 330
    rows = []
    for level in range(4):
        scene = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ox, oy = 4 * HW_ + 40, 150

        def put(name, gx, gy, centre=False):
            img, (ax, ay) = sprites[name]
            x = ox + round((gx - gy) * HW_) - ax
            y = oy + round((gx + gy) * HH_) - ay
            scene.alpha_composite(img, (x, y))

        def put_lit(dst, name, gx, gy):
            if name + "@lights" in sprites:
                img, (ax, ay) = sprites[name + "@lights"]
                dst.alpha_composite(img, (ox + round((gx - gy) * HW_) - ax, oy + round((gx + gy) * HH_) - ay))
        for gy in range(-2, 7):
            for gx in range(-2, 13):
                put("grass0", gx, gy)
        pieces = site_pieces(level)
        flat_ = [p for p in pieces if p[0].startswith(("air:rwy", "air:taxi", "air:stand"))]
        tall = sorted([p for p in pieces if p not in flat_], key=lambda p: p[1] + p[2] + p[3] + p[4])
        jets = []  # parked on the stand, taxiing, rolling, and one on approach
        if level >= 1:
            jets.append(("veh:plane:cargo:NW", 6.0, 3.0))
        if level >= 2:
            jets.append(("veh:plane:pax:SE", 3.0, 1.0))
        if level == 3:
            jets.append(("veh:plane:cargo:NW", 7.5, 0.0))
            jets.append(("veh:plane:cargo:NW:air", 13.0, -3.0))
        lights = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for p in flat_:
            put(p[0], p[1], p[2])
            put_lit(lights, p[0], p[1], p[2])
        behind = [j for j in jets if j[2] < 2]
        front = [j for j in jets if j[2] >= 2]
        for name, gx, gy in jets:
            put("veh:plane:cargo:shadow", gx + (2 if name.endswith(":air") else 0), gy + (2 if name.endswith(":air") else 0))
        for name, gx, gy in behind:
            put(name, gx, gy)
            put_lit(lights, name, gx, gy)
        for p in tall:
            put(p[0], p[1], p[2])
            put_lit(lights, p[0], p[1], p[2])
        for name, gx, gy in front:
            put(name, gx, gy)
            put_lit(lights, name, gx, gy)
        day = Image.new("RGBA", (W, H), (13, 8, 22, 255))
        day.alpha_composite(scene)
        nt = Image.new("RGBA", (W, H), (13, 8, 22, 255))
        nt.alpha_composite(night(scene, (lights, (0, 0)), (0, 0)))
        rows.append((day, nt))
    sheet = Image.new("RGBA", (W * 2, H * 4), (13, 8, 22, 255))
    d = ImageDraw.Draw(sheet)
    for k, (day, nt) in enumerate(rows):
        sheet.alpha_composite(day, (0, k * H))
        sheet.alpha_composite(nt, (W, k * H))
        d.text((6, k * H + 6), f"airport level {k}", fill=(255, 230, 170, 255))
    # the jets, every facing, gear down and up
    names = [n for n in sprites if n.startswith("veh:plane:") and not n.endswith(("@lights", "shadow"))]
    cell = 110
    jets_img = Image.new("RGBA", (cell * 8, cell * 2 * ((len(names) + 7) // 8)), (40, 46, 60, 255))
    for i, n in enumerate(names):
        img, (ax, ay) = sprites[n]
        r, k = divmod(i, 8)
        jets_img.alpha_composite(img, (k * cell + cell // 2 - ax, r * cell + cell // 2 - ay + 10))
        lit = sprites.get(n + "@lights")
        nimg = night(img, lit, (ax, ay))
        jets_img.alpha_composite(nimg, (k * cell + cell // 2 - ax, (r + (len(names) + 7) // 8) * cell + cell // 2 - ay + 10))
    out = Image.new("RGBA", (max(sheet.width, jets_img.width), sheet.height + jets_img.height), (13, 8, 22, 255))
    out.alpha_composite(sheet, (0, 0))
    out.alpha_composite(jets_img, (0, sheet.height))
    out.resize((out.width * 2, out.height * 2), Image.NEAREST).save(path)
