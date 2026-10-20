"""
City Clients' business sites (src/world/clients.ts places them): each business at its four levels, drawn with the
service-building kit (services/kit.py: same sun, outline, palette and night lights as the AWS landmarks) but lower and
quieter, on a paved plate of its own. Level 0 is the business as the player finds it (small, a bit run-down); each
level follows the draft's growth[].look.

  client:bank:<0..3>       3x3  Riverside Bank: a boarded hall + "SOON" board, a stone bank with a portico and a cash
                                machine, a taller bank with a clock and a glowing glass trading floor, a tower with a
                                vault seen through glass, a data centre and a gold coin crest
  client:shop:<0..3>       3x3  Corner Shop: faded awning and an OPEN sign, a new sign + parcel shelf + delivery bike,
                                two floors with a SALE banner, bunting, a queue rope and a loading bay, a department
                                store with an escalator behind glass, a rooftop sign and two vans
  client:hospital:<0..3>   4x4  Northgate Hospital: a clinic hut with one ambulance bay, a two-storey hospital with a
                                paper-stacked records window, a new wing and a ramp, a glass tower with a helipad, a
                                research wing, a garden and a records room glowing blue. Its cross is the green
                                first-aid cross (the red cross is a protected emblem)
  client:school:<0..3>     4x4  Hilltop School: a one-room schoolhouse with a bell, a brick school with a lab window
                                and a book flag, two floors + library + sports hall + bike rack, a campus with a glass
                                library dome, an observatory, a playing field and a RESULTS DAY banner
  client:stadium:<0..3>    4x4  City Arena: a pitch with one wooden stand, stands on two sides + ticket booth + two
                                floodlights, a four-sided ground with a big screen and kiosks, a roofed bowl lit in team
                                colours with a fan plaza

Each has its night lights (name@lights). The airport is the sixth client; its levels are the air:* sprites
(airport_art.py). Called from generate_tiles.main as clients_art.build(add).
"""
import math

from PIL import Image, ImageDraw

from generate_tiles import NAVY, NAVY_D, ORANGE, ORANGE_D, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, GLASS_DK, GLASS_L, GLASS_M, LED, LIT, LIT_COOL, RED, SKY, STEEL,  # noqa: F401
                          STEEL_D, STEEL_M, STONE, Kit, A, bands, beacon, combine, dish, drum, ellipse, face, glass, hv,
                          lattice, leds, louvres, masonry, plant, prism, punched, ribs, screen, solid, top, top_band)

CLEAR = (0, 0, 0, 0)
PAVE = (198, 194, 186)
PAVE_D = (176, 172, 164)
GRASS = (88, 168, 80)
GRASS_D = (60, 132, 62)
GRASS_L = (118, 194, 96)
LEAF = (78, 164, 72)
LEAF_D = (44, 118, 56)
LEAF_L = (132, 206, 104)
SKIN = (232, 186, 150)
SKIN_D = (170, 120, 90)
CREAM = (238, 226, 198)
BRICK = (178, 96, 72)
BRICK_D = (140, 72, 56)
GOLD = (246, 196, 60)
GOLD_D = (196, 140, 30)
PAPER = (248, 244, 228)
GREEN_X = (24, 150, 84)  # the first-aid sign (ISO 7010: white cross on green)
BLUE_L = (90, 170, 255)
TEAL = (20, 180, 170)
MAGENTA = (230, 60, 150)
SEAT = (40, 120, 200)
SEAT_B = (226, 64, 64)
SHIRTS = [(59, 130, 246), (226, 72, 64), (34, 170, 94), (255, 153, 0), (139, 92, 246), (240, 242, 246), (20, 170, 160)]

# 3x5 pixel letters (I and space narrower, M wider), read left to right along a wall
FONT = {
    "A": [".X.", "X.X", "XXX", "X.X", "X.X"], "B": ["XX.", "X.X", "XX.", "X.X", "XX."], "C": [".XX", "X..", "X..", "X..", ".XX"],
    "D": ["XX.", "X.X", "X.X", "X.X", "XX."], "E": ["XXX", "X..", "XX.", "X..", "XXX"], "F": ["XXX", "X..", "XX.", "X..", "X.."],
    "G": [".XX", "X..", "X.X", "X.X", ".XX"], "H": ["X.X", "X.X", "XXX", "X.X", "X.X"], "I": ["X", "X", "X", "X", "X"],
    "K": ["X.X", "X.X", "XX.", "X.X", "X.X"], "L": ["X..", "X..", "X..", "X..", "XXX"], "M": ["X...X", "XX.XX", "X.X.X", "X...X", "X...X"],
    "N": ["X..X", "XX.X", "X.XX", "X..X", "X..X"], "O": ["XXX", "X.X", "X.X", "X.X", "XXX"], "P": ["XX.", "X.X", "XX.", "X..", "X.."],
    "R": ["XX.", "X.X", "XX.", "X.X", "X.X"], "S": [".XX", "X..", ".X.", "..X", "XX."], "T": ["XXX", ".X.", ".X.", ".X.", ".X."],
    "U": ["X.X", "X.X", "X.X", "X.X", "XXX"], "W": ["X...X", "X...X", "X.X.X", "XX.XX", "X...X"], "Y": ["X.X", "X.X", ".X.", ".X.", ".X."],
    "Z": ["XXX", "..X", ".X.", "X..", "XXX"], " ": [".", ".", ".", ".", "."],
    "0": ["XXX", "X.X", "X.X", "X.X", "XXX"], "1": [".X", "XX", ".X", ".X", ".X"], "2": ["XX.", "..X", ".X.", "X..", "XXX"],
    "3": ["XX.", "..X", ".X.", "..X", "XX."], "4": ["X.X", "X.X", "XXX", "..X", "..X"], "5": ["XXX", "X..", "XX.", "..X", "XX."],
    "6": [".XX", "X..", "XXX", "X.X", "XXX"], "7": ["XXX", "..X", ".X.", ".X.", ".X."], "8": ["XXX", "X.X", "XXX", "X.X", "XXX"],
    "9": ["XXX", "X.X", "XXX", "..X", "XX."],
}


def text_w(s):
    return sum(len(FONT[ch][0]) + 1 for ch in s) - 1


def text(c, s, x, y, col, lit=None, slope=1):
    """Pixel text from screen (x, y) = top-left: slope 1 runs down a left (v = const) wall, -1 up a right (u = const)
    wall, 0 flat. lit: the colour it glows at night (None: dark at night)."""
    k = 0
    for ch in s:
        g = FONT[ch]
        for r, row in enumerate(g):
            for j, p in enumerate(row):
                if p == "X":
                    dy = (k + 1) // 2 * slope  # each letter steps down (or up) the wall; letters stay upright
                    c.put(x + k + j, y + r + dy, col, lit)
        k += len(g[0]) + 1


def text_on(c, s, side, fixed, a, b, z, col, lit=None):
    """Text centred on a wall: side 'L' (v = fixed, u from a to b) or 'R' (u = fixed, v from a to b); z = top row."""
    w = text_w(s)
    if side == "L":
        x0, y0 = c.P(a, fixed, z)
        x1 = c.P(b, fixed, z)[0]
        off = ((x1 - x0) - w) // 2
        text(c, s, x0 + off, y0 + off // 2, col, lit, 1)
    else:
        x0, y0 = c.P(fixed, b, z)
        x1 = c.P(fixed, a, z)[0]
        off = ((x1 - x0) - w) // 2
        text(c, s, x0 + off, y0 - off // 2, col, lit, -1)


# ── small drawing helpers (each clears the lights under what it paints, as Kit.poly does) ────────────────────────────

def rect(c, box, col, lit=None):
    c.d.rectangle(box, fill=A(col))
    c.ld.rectangle(box, fill=A(lit) if lit else CLEAR)


def ell(c, box, col, lit=None):
    c.d.ellipse(box, fill=A(col))
    c.ld.ellipse(box, fill=A(lit) if lit else CLEAR)


def ln(c, pts, col, w=1, lit=None):
    c.d.line(pts, fill=A(col), width=w)
    c.ld.line(pts, fill=A(lit) if lit else CLEAR, width=w)


def glow(c, x, y, col, r=2, a=110):
    c.ld.ellipse((x - r, y - r, x + r, y + r), fill=A(col, a))


def over(c, draw):
    """Paints a translucent shape over what is drawn (a shadow on the plate), composited in place."""
    layer = Image.new("RGBA", c.img.size, CLEAR)
    draw(ImageDraw.Draw(layer))
    c.img.alpha_composite(layer)


def plate(c, fw, fh, col=PAVE, grass=True, key="plate", worn=False):
    """The site: a kerbed slab over the whole lot (z 0-2), paving with joints, grass verges on the back edges."""
    prism(c, 0.02, 0.02, fw - 0.02, fh - 0.02, 0, 2, PAVE_D, roof=False, ao=False)
    c.poly([(0.02, 0.02, 2), (fw - 0.02, 0.02, 2), (fw - 0.02, fh - 0.02, 2), (0.02, fh - 0.02, 2)], col)
    for k in range(1, int(fw * 2)):
        c.line((k / 2, 0.04, 2), (k / 2, fh - 0.04, 2), shade(col, 0.94))
    for k in range(1, int(fh * 2)):
        c.line((0.04, k / 2, 2), (fw - 0.04, k / 2, 2), shade(col, 0.94))
    if grass:
        c.poly([(0.06, 0.06, 2), (fw - 0.06, 0.06, 2), (fw - 0.06, 0.32, 2), (0.32, 0.32, 2), (0.32, fh - 0.06, 2), (0.06, fh - 0.06, 2)], GRASS)
        for k in range(int((fw + fh) * 5)):
            t = hv(key, "g", k)
            u, v = (0.1 + t * (fw - 0.2), 0.1 + hv(key, "gv", k) * 0.18) if k % 2 else (0.1 + hv(key, "gv", k) * 0.18, 0.1 + t * (fh - 0.2))
            x, y = c.P(u, v, 2)
            c.put(x, y, GRASS_L if k % 3 else GRASS_D)
    if worn:  # cracks and weeds
        for k in range(5):
            u, v = 0.5 + hv(key, "cu", k) * (fw - 1), 0.5 + hv(key, "cv", k) * (fh - 1)
            x, y = c.P(u, v, 2)
            ln(c, [(x, y), (x + 3, y + 1), (x + 5, y)], shade(col, 0.72))
            c.put(x + 6, y - 1, GRASS_D)
            c.put(x + 6, y - 2, GRASS)


def lawn(c, u0, v0, u1, v1, key="lawn"):
    c.poly([(u0, v0, 2), (u1, v0, 2), (u1, v1, 2), (u0, v1, 2)], GRASS)
    for k in range(int((u1 - u0) * (v1 - v0) * 12) + 2):
        x, y = c.P(u0 + 0.04 + hv(key, k) * (u1 - u0 - 0.08), v0 + 0.04 + hv(key, "v", k) * (v1 - v0 - 0.08), 2)
        c.put(x, y, GRASS_L if k % 2 else GRASS_D)


def shadow(c, u0, v0, u1, v1, s=0.18):
    """A soft shadow on the plate along a block's visible sides (painted, since the plate covers the kit's shadow layer)."""
    for k, (sp, a) in enumerate(((s, 34), (s * 0.5, 40))):
        pts = [(u0 - sp * 0.3, v1 + sp), (u1 + sp, v1 + sp), (u1 + sp, v0 - sp * 0.3), (u1, v0), (u1, v1), (u0, v1)]
        over(c, lambda dd: dd.polygon([c.P(u, v, 2) for u, v in pts], fill=(16, 20, 34, a)))


def block(c, u0, v0, u1, v1, h, col, L=None, R=None, z0=2, roof=True, roofcol=None, rim=0.05, sh=True):
    """A building block standing on the plate: its shadow, ambient occlusion at its foot."""
    if sh and z0 <= 2:
        shadow(c, u0, v0, u1, v1)
    return prism(c, u0, v0, u1, v1, z0, z0 + h, col, L=L, R=R, roof=roof, rim=rim, ao=z0 <= 2, roofcol=roofcol)


def tree(c, u, v, s=1.0, col=LEAF, z=2):
    x, y = c.P(u, v, z)
    over(c, lambda dd: dd.ellipse((x - 4 * s, y - 2, x + 4 * s, y + 2), fill=(16, 20, 34, 60)))
    ln(c, [(x, y), (x, y - round(4 * s))], WOOD_D, 2 if s > 1.1 else 1)
    r = round(4 * s)
    cy = y - round(4 * s) - r
    ell(c, (x - r, cy - r, x + r, cy + r), shade(col, 0.8))
    ell(c, (x - r, cy - r, x + r - 1, cy + r - 2), col)
    ell(c, (x - r + 1, cy - r + 1, x, cy - 1), shade(col, 1.25))


def person(c, u, v, shirt, z=2, bag=None, hat=None, face_r=False):
    """A small figure (7 px): hair or hat, face, shirt, legs; maybe a shopping bag in one hand."""
    x, y = c.P(u, v, z)
    leg = (52, 58, 76)
    c.put(x, y - 1, leg)
    c.put(x + 1, y - 1, leg)
    c.put(x, y - 2, leg)
    c.put(x + 1, y - 2, leg)
    for yy in (y - 3, y - 4, y - 5):
        c.put(x, yy, shirt)
        c.put(x + 1, yy, shade(shirt, 0.8))
    c.put(x, y - 6, SKIN)
    c.put(x + 1, y - 6, SKIN_D)
    hc = hat or (60, 40, 30)
    c.put(x, y - 7, hc)
    c.put(x + 1, y - 7, hc)
    if bag:
        c.put(x + 2, y - 3, bag)
        c.put(x + 2, y - 2, shade(bag, 0.8))
        c.put(x + 3, y - 3, bag)
        c.put(x + 3, y - 2, shade(bag, 0.8))


def crowd(c, pts, key, z=2, bags=False, hats=None):
    for k, (u, v) in enumerate(pts):
        sh = SHIRTS[int(hv(key, k) * len(SHIRTS))]
        bag = SHIRTS[int(hv(key, "b", k) * len(SHIRTS))] if bags and k % 2 == 0 else None
        person(c, u, v, sh, z, bag=bag, hat=hats)


def lamp(c, u, v, z=2, h=13, col=LIT):
    x, y = c.P(u, v, z)
    ln(c, [(x, y), (x, y - h)], STEEL_D)
    ln(c, [(x, y - h), (x + 2, y - h)], STEEL_D)
    c.put(x + 2, y - h + 1, (255, 240, 200), col)
    glow(c, x + 2, y - h + 2, col, 3, 90)
    c.ld.polygon([(x + 2, y - h + 2), (x - 3, y), (x + 7, y)], fill=A(col, 40))


def bench(c, u, v, z=2):
    prism(c, u, v, u + 0.3, v + 0.1, z + 2, z + 3, WOOD, rim=0, ao=False)
    x, y = c.P(u + 0.03, v + 0.1, z)
    c.put(x, y - 1, STEEL_D)
    x, y = c.P(u + 0.27, v + 0.1, z)
    c.put(x, y - 1, STEEL_D)


def fence(c, u0, v0, u1, v1, z=2, h=4, col=WOOD, broken=False, step=0.18):
    n = max(1, int(math.hypot(u1 - u0, v1 - v0) / step))
    for k in range(n + 1):
        if broken and k % 4 == 2:
            continue
        t = k / n
        x, y = c.P(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, z)
        ln(c, [(x, y), (x, y - h)], col)
    for zz in (z + h - 1, z + 1):
        a, b = c.P(u0, v0, zz), c.P(u1, v1, zz)
        if broken:
            m = ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)
            ln(c, [a, (m[0] - 4, m[1] - (2 if u1 - u0 > 0 else -2))], shade(col, 0.9))
        else:
            ln(c, [a, b], shade(col, 0.9))


def van(c, u, v, col, along_u=True, z=2, band=None, light_bar=None, key="van"):
    """A delivery van (0.7 x 0.34 tiles): box body, a lower cab at the front (+u or +v), dark wheels."""
    L, W = 0.7, 0.34
    u1, v1 = (u + L, v + W) if along_u else (u + W, v + L)
    shadow(c, u, v, u1, v1, 0.1)
    cab = 0.2
    if along_u:
        prism(c, u, v, u1 - cab, v1, z + 1, z + 12, col, L=band and bands([(4, 6, band)]), R=band and bands([(4, 6, band)]), rim=0, ao=False)
        prism(c, u1 - cab, v, u1, v1, z + 1, z + 8, col, L=lambda i, n, zz, h, b, s: (GLASS_DK, None) if zz >= 4 and i > 1 else None,
              R=lambda i, n, zz, h, b, s: (GLASS_L, None) if zz >= 4 and 0 < i < n - 1 else None, rim=0, ao=False)
        wheels = [(u + 0.14, v1), (u1 - 0.12, v1)]
    else:
        prism(c, u, v, u1, v1 - cab, z + 1, z + 12, col, L=band and bands([(4, 6, band)]), R=band and bands([(4, 6, band)]), rim=0, ao=False)
        prism(c, u, v1 - cab, u1, v1, z + 1, z + 8, col, L=lambda i, n, zz, h, b, s: (GLASS_L, None) if zz >= 4 and 0 < i < n - 1 else None,
              R=lambda i, n, zz, h, b, s: (GLASS_DK, None) if zz >= 4 and i < n - 1 else None, rim=0, ao=False)
        wheels = [(u1, v + 0.14), (u1, v1 - 0.12)]
    for wu, wv in wheels:
        x, y = c.P(wu, wv, z)
        rect(c, (x - 1, y - 2, x + 1, y), CHAR)
    if light_bar:
        fu, fv = (u1 - cab - 0.05, (v + v1) / 2) if along_u else ((u + u1) / 2, v1 - cab - 0.05)
        x, y = c.P(fu, fv, z + 12)
        c.put(x - 1, y - 1, light_bar, light_bar)
        c.put(x, y - 1, (240, 60, 60), (240, 60, 60))
        glow(c, x, y - 1, light_bar, 3, 120)


def flag(c, u, v, z, h, col, emblem=None, emblem_col=None):
    x, y = c.P(u, v, z)
    ln(c, [(x, y), (x, y - h)], STEEL)
    rect(c, (x + 1, y - h, x + 9, y - h + 5), col)
    ln(c, [(x + 1, y - h + 5), (x + 9, y - h + 5)], shade(col, 0.8))
    if emblem == "book":  # an open book: two pages and a spine
        ln(c, [(x + 3, y - h + 1), (x + 4, y - h + 2), (x + 5, y - h + 1), (x + 6, y - h + 2), (x + 7, y - h + 1)], emblem_col)
        ln(c, [(x + 3, y - h + 2), (x + 3, y - h + 3), (x + 7, y - h + 3), (x + 7, y - h + 2)], emblem_col)
        c.put(x + 5, y - h + 3, emblem_col)


def bunting(c, a, b, z, sag=4, n=9):
    """A string of triangular flags between two points (u, v) at height z."""
    (x0, y0), (x1, y1) = c.P(*a, z), c.P(*b, z)
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append((round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t))))
    ln(c, pts, (90, 90, 100))
    for k in range(n):
        x, y = pts[k]
        x2, y2 = pts[k + 1]
        col = SHIRTS[k % 5]
        mx = (x + x2) // 2
        c.d.polygon([(x, y + 1), (x2, y2 + 1), (mx, max(y, y2) + 4)], fill=A(col))


def cross_sign(c, side, fixed, a, z, size=8, lit=True):
    """The first-aid sign: a white cross on a green square, on a wall (side 'L' or 'R'), a = its start along the wall."""
    b = a + size / 16
    g = GREEN_X

    def shader(i, n, zz, h, base, s):
        m, q = n / 2, h / 2
        on = (abs(i + 0.5 - m) <= n * 0.17 and 1 <= zz < h - 1) or (abs(zz + 0.5 - q) <= h * 0.17 and 1 <= i < n - 1)
        if on:
            return WHITE, (WHITE if lit else None)
        return g, ((90, 230, 140) if lit else None)
    face(c, side, fixed, a, b, z, z + size, g, shader, ao=False, edge=False)


def bike(c, u, v, z=2, col=(226, 72, 64), box=None):
    x, y = c.P(u, v, z)
    for dx in (0, 6):
        c.d.ellipse((x + dx - 2, y - 4, x + dx + 2, y), outline=A(CHAR))
    ln(c, [(x, y - 2), (x + 3, y - 2), (x + 6, y - 2)], col)
    ln(c, [(x + 3, y - 2), (x + 2, y - 5)], col)
    ln(c, [(x + 5, y - 5), (x + 6, y - 2)], col)
    c.put(x + 1, y - 5, CHAR)
    c.put(x + 5, y - 6, CHAR)
    if box:
        rect(c, (x - 3, y - 8, x + 1, y - 4), box)
        ln(c, [(x - 3, y - 8), (x + 1, y - 8)], shade(box, 1.2))


def parcels(c, u, v, z=2, n=3, key="p"):
    for k in range(n):
        s = 0.12 + hv(key, k) * 0.06
        uu, vv = u + (k % 2) * 0.16, v + (k // 2) * 0.14
        prism(c, uu, vv, uu + s, vv + s, z, z + 3 + int(hv(key, "h", k) * 3), (200, 156, 104), rim=0, ao=False)


# ── Riverside Bank (3x3) ──────────────────────────────────────────────────────────────────────────────────────────

def portico(c, u0, u1, v, z0, h, col, key, pediment=True):
    """Columns and an entablature on the left (street) face of a classic hall, with a pediment."""
    prism(c, u0 - 0.04, v, u1 + 0.04, v + 0.32, z0, z0 + 2, shade(col, 0.95), rim=0, ao=False)  # the steps
    prism(c, u0, v + 0.04, u1, v + 0.3, z0 + 2, z0 + 3, shade(col, 1.02), rim=0, ao=False)
    n = 4
    for k in range(n):
        uc = u0 + 0.08 + k * (u1 - u0 - 0.24) / (n - 1)
        prism(c, uc, v + 0.18, uc + 0.08, v + 0.26, z0 + 3, z0 + h - 4, WHITE, L=ribs(2, 1.06, 0.88), rim=0, ao=False)
    prism(c, u0 - 0.03, v + 0.02, u1 + 0.03, v + 0.3, z0 + h - 4, z0 + h, col, L=top_band(1, shade(col, 1.08)), rim=0, ao=False)
    if pediment:
        zt = z0 + h
        m = (u0 + u1) / 2
        c.poly([(u0 - 0.03, v + 0.3, zt), (u1 + 0.03, v + 0.3, zt), (m, v + 0.3, zt + 7)], shade(col, 0.96))
        c.poly([(u0 + 0.12, v + 0.3, zt + 1), (u1 - 0.12, v + 0.3, zt + 1), (m, v + 0.3, zt + 5)], shade(col, 0.84))
        c.poly([(u1 + 0.03, v + 0.3, zt), (u1 + 0.03, v + 0.02, zt), (m, v + 0.02, zt + 7), (m, v + 0.3, zt + 7)], shade(col, 0.74))


def coin(c, x, y, r=4, lit=True):
    ell(c, (x - r, y - r, x + r, y + r), GOLD_D, (255, 200, 80) if lit else None)
    ell(c, (x - r, y - r, x + r - 1, y + r - 1), GOLD, (255, 214, 110) if lit else None)
    if r >= 4:
        c.d.ellipse((x - r + 2, y - r + 2, x + r - 3, y + r - 3), outline=A(GOLD_D))
    c.put(x - r + 2, y - r + 2, (255, 246, 200), (255, 250, 220) if lit else None)
    if lit:
        glow(c, x, y, (255, 200, 80), r + 2, 70)


def lm_bank(level):
    c = Kit(3, 3, 120 if level == 3 else 60)
    plate(c, 3, 3, key=f"bank{level}", worn=level == 0)
    stone = STONE if level else shade(STONE, 0.88)
    if level == 0:
        u0, v0, u1, v1, h = 0.85, 0.9, 2.3, 2.05, 14

        def boards(i, n, z, hh, b, s):  # boarded windows: planks over dark openings
            bi = i % 9
            if 2 <= bi <= 6 and 3 <= z < 10 and 1 < i < n - 2:
                return ((WOOD if (z + bi) % 3 else WOOD_D) if z in (4, 5, 7, 8) else shade(CHAR, 0.9)), None
            return None
        prism_kw = dict(L=combine(top_band(2, shade(stone, 1.05)), boards, masonry(4, 7, 0.86)), R=combine(top_band(2, shade(stone, 1.05)), boards, masonry(4, 7, 0.86)))
        block(c, u0, v0, u1, v1, h, stone, **prism_kw)
        face(c, "L", v1, 1.4, 1.7, 2, 13, WOOD_D, ribs(2, 1.1, 0.8), ao=False)  # the boarded door
        for k in range(3):  # streaks and weeds
            x, y = c.P(u0 + 0.3 + k * 0.4, v1, 14)
            ln(c, [(x, y), (x, y + 5)], shade(stone, 0.7))
            x, y = c.P(u0 + 0.2 + k * 0.5, v1 + 0.02, 2)
            c.put(x, y - 1, GRASS_D)
            c.put(x + 1, y - 2, GRASS)
        # the "coming soon" board on two posts
        bu0, bu1, bv = 1.55, 2.75, 2.62
        for pu in (bu0 + 0.1, bu1 - 0.1):
            x, y = c.P(pu, bv, 2)
            ln(c, [(x, y), (x, y - 8)], WOOD_D)
        face(c, "L", bv, bu0, bu1, 8, 17, WHITE, combine(bands([(0, 1, NAVY), (8, 9, NAVY)])), ao=False, edge=False)
        text_on(c, "SOON", "L", bv, bu0, bu1, 15, NAVY)
        x, y = c.P(bu0 + 0.12, bv, 13)
        coin(c, x + 1, y - 1, 2, lit=False)
        fence(c, 0.3, 2.9, 1.4, 2.9, broken=True)
        lamp(c, 2.85, 1.0)
        return c
    if level == 3:  # the tower on the back of the lot: stone frame, curtain wall, a gold coin crest, an antenna
        tu0, tv0, tu1, tv1, th = 0.45, 0.35, 1.75, 1.45, 92
        block(c, tu0, tv0, tu1, tv1, th, (214, 208, 196),
              L=combine(top_band(4, stone), bands([(0, 3, stone)]), glass("bankT", bay=4, floor=6, p=0.5, lo=3, hi=th - 5, frame=(226, 220, 206))),
              R=combine(top_band(4, stone), bands([(0, 3, stone)]), glass("bankTr", bay=4, floor=6, p=0.45, lo=3, hi=th - 5, frame=(196, 190, 178))))
        top(c, tu0 + 0.15, tv0 + 0.15, tu1 - 0.15, tv1 - 0.15, th + 2, stone)
        prism(c, tu0 + 0.15, tv0 + 0.15, tu1 - 0.15, tv1 - 0.15, th + 2, th + 6, stone, ao=False)
        x, y = c.P((tu0 + tu1) / 2, tv1, th - 14)
        coin(c, x, y, 5)
        x, y = c.P(1.1, 0.9, th + 6)
        ln(c, [(x, y), (x, y - 16)], STEEL_D)
        ln(c, [(x - 2, y - 6), (x + 2, y - 6)], STEEL_D)
        beacon(c, 1.1, 0.9, th + 23)
        # the data centre on the right: racks of LEDs, fans on its roof
        du0, dv0, du1, dv1 = 2.05, 0.45, 2.85, 1.35
        block(c, du0, dv0, du1, dv1, 16, (70, 78, 94), L=combine(top_band(2, CON_M), leds("bankDC", step=3, every=4, p=0.7, lo=3, hi=13)),
              R=combine(top_band(2, CON_M), louvres(2)))
        plant(c, du0, dv0, du1, dv1, 18, "bankDCp", n=2)
    if level >= 2:  # the glass trading floor (payments room) wing
        wu0, wv0, wu1, wv1 = (2.05, 1.45, 2.85, 2.35) if level == 3 else (1.95, 0.45, 2.85, 1.45)
        wh = 20 if level == 2 else 18
        block(c, wu0, wv0, wu1, wv1, wh, (200, 206, 214),
              L=combine(top_band(2, stone), glass("bankW", bay=5, floor=7, p=0.85, lo=2, palette={"L": ((80, 150, 210), (110, 190, 236), (160, 220, 246)), "R": ((60, 120, 180), (80, 150, 210), (110, 190, 236))})),
              R=combine(top_band(2, stone), glass("bankWr", bay=5, floor=7, p=0.85, lo=2)))
        # a ticker of payments glowing along its fascia
        screen(c, "L", wv1, wu0 + 0.08, wu1 - 0.08, 2 + wh - 5, 2 + wh - 2, "bankTk", (110, 240, 170), kind="ticker")
    # the classic hall: stone, a portico on the street face, windows on the side
    if level == 1:
        u0, v0, u1, v1, h = 0.7, 0.75, 2.3, 1.95, 20
    elif level == 2:
        u0, v0, u1, v1, h = 0.55, 0.6, 1.95, 1.95, 32
    else:
        u0, v0, u1, v1, h = 0.45, 1.55, 2.0, 2.35, 20
    side = combine(top_band(3, shade(stone, 1.06)), punched(f"bank{level}h", bay=6, floor=10, ww=3, wh=6, p=0.55, lo=3, hi=h - 3), masonry(4, 8, 0.9))
    block(c, u0, v0, u1, v1, h, stone, L=combine(top_band(3, shade(stone, 1.06)), masonry(4, 8, 0.9)), R=side)
    if level == 3:  # a glass front through which the vault door shows, guards at the door
        face(c, "L", v1, u0 + 0.15, u1 - 0.15, 3, 15, GLASS_DK, glass("bankV", bay=6, floor=13, p=0.9, refl=False), ao=False)
        x, y = c.P(u0 + 0.55, v1, 10)
        ell(c, (x - 5, y - 5, x + 5, y + 5), (120, 128, 140), (170, 180, 196))
        ell(c, (x - 4, y - 4, x + 4, y + 4), STEEL, (210, 220, 236))
        c.d.ellipse((x - 2, y - 2, x + 2, y + 2), outline=A(STEEL_D))
        for k in range(4):
            a = k * math.pi / 2 + 0.4
            c.put(x + round(math.cos(a) * 3), y + round(math.sin(a) * 3), STEEL_D)
        prism(c, u0 + 0.95, v1, u0 + 1.25, v1 + 0.08, 2, 14, NAVY_D, rim=0, ao=False,
              L=lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 else None))
        person(c, u0 + 0.9, v1 + 0.22, NAVY, hat=NAVY_D)
        person(c, u0 + 1.35, v1 + 0.22, NAVY, hat=NAVY_D)
        face(c, "L", v1, u0, u1, h - 2, h + 2, shade(stone, 1.06), ao=False)
        text_on(c, "BANK", "L", v1, u0, u1, h + 1, NAVY)
    else:
        portico(c, u0 + 0.15, u1 - 0.15, v1, 2, 18 if level == 1 else 22, stone, f"bank{level}p")
        # the door in the middle, behind the columns
        m = (u0 + u1) / 2
        face(c, "L", v1, m - 0.14, m + 0.14, 2, 13, NAVY_D, lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and 1 < z < hh - 1 else None), ao=False)
        text_on(c, "BANK", "L", v1 + 0.3, u0 + 0.15, u1 - 0.15, 2 + (18 if level == 1 else 22) - 1, NAVY)
        if level == 2:  # a clock over the portico, an attic storey above
            x, y = c.P(m, v1 + 0.3, 2 + 22 + 3)
            y -= 6
            ell(c, (x - 4, y - 4, x + 4, y + 4), GOLD_D)
            ell(c, (x - 3, y - 3, x + 3, y + 3), WHITE, (255, 244, 210))
            ln(c, [(x, y), (x, y - 2)], CHAR)
            ln(c, [(x, y), (x + 2, y)], CHAR)
    # the cash machine in the right wall: a screen that glows, a keypad
    am = (v0 + v1) / 2 + 0.25 if level != 3 else v0 + 0.3
    face(c, "R", u1, am, am + 0.22, 4, 12, CHAR, lambda i, n, z, hh, b, s: ((80, 220, 240), (80, 220, 240)) if 0 < i < n - 1 and 4 <= z < 7 else
         ((STEEL_M, None) if 0 < i < n - 1 and 1 <= z < 3 else None), ao=False)
    # the coin sign on a bracket at the hall's front corner
    if level in (1, 2):
        x, y = c.P(u1, v1, h - 4)
        ln(c, [(x, y), (x + 5, y + 2)], CHAR)
        coin(c, x + 7, y + 4, 3)
    if level == 2:  # payday queue
        crowd(c, [(0.7 + 0.2 * k, 2.6 + 0.04 * k) for k in range(5)], "bankQ")
    lamp(c, 2.9, 2.1)
    if level >= 1:
        tree(c, 0.25, 2.5, 0.9)
    return c


# ── Corner Shop (3x3) ──────────────────────────────────────────────────────────────────────────────────────────────

def awning_l(c, u0, u1, v, z, depth, col, stripes=6, faded=False, torn=False):
    """A striped awning on a left (street) wall: slopes out by `depth` tiles, drops 4 px, a scalloped valance."""
    for k in range(stripes):
        a = u0 + k * (u1 - u0) / stripes
        b = a + (u1 - u0) / stripes
        if torn and k == stripes - 2:
            continue
        fill = col if k % 2 == 0 else (WHITE if not faded else CREAM)
        c.poly([(a, v, z), (b, v, z), (b, v + depth, z - 4), (a, v + depth, z - 4)], fill)
        c.poly([(a, v + depth, z - 4), (b, v + depth, z - 4), (b, v + depth, z - 6), (a, v + depth, z - 6)], shade(fill, 0.86))


def lm_shop(level):
    c = Kit(3, 3, 80)
    plate(c, 3, 3, key=f"shop{level}", worn=level == 0)
    paint = shade(CREAM, 0.9) if level == 0 else CREAM
    awn = shade((214, 70, 64), 0.8) if level == 0 else (226, 72, 64)
    if level == 3:  # the department store
        u0, v0, u1, v1, h = 0.35, 0.4, 2.45, 2.2, 44
        clad = (226, 224, 218)
        upper = combine(top_band(3, ORANGE), bands([(13, 15, (190, 186, 178))]), punched("shop3u", bay=7, floor=9, ww=5, wh=5, p=0.55, lo=15, hi=h - 3))
        shopfront = glass("shop3g", bay=6, floor=13, p=0.95, refl=False, lo=1, hi=13)

        def esc(i, n, z, hh, b, s):  # the escalator rising behind the glass
            k = i - n * 0.45
            if 0 <= k < 16 and 1 <= z < 13 and abs(z - (1 + k * 0.7)) < 1.2:
                return (STEEL_M if int(k) % 2 else STEEL), (230, 236, 250)
            return None
        block(c, u0, v0, u1, v1, h, clad, L=combine(esc, shopfront, upper), R=combine(shopfront, upper))
        # rooftop sign on a frame: letters that blink (lit)
        su0, su1, sv = 0.7, 2.1, 1.4
        for pu in (su0 + 0.1, su1 - 0.1):
            x, y = c.P(pu, sv, 2 + h)
            ln(c, [(x, y), (x, y - 6)], STEEL_D)
        face(c, "L", sv, su0, su1, 2 + h + 6, 2 + h + 15, NAVY_D, ao=False, edge=False)
        text_on(c, "STORE", "L", sv, su0, su1, 2 + h + 13, ORANGE, ORANGE)
        plant(c, 1.6, 0.6, 2.3, 1.2, 2 + h, "shop3p", n=2)
        # canopy over the doors, two vans at the loading side, shoppers with bags
        prism(c, 0.9, v1, 1.6, v1 + 0.2, 13, 15, ORANGE, rim=0, ao=False)
        van(c, 2.55, 0.5, WHITE, along_u=False, band=ORANGE)
        van(c, 2.55, 1.35, WHITE, along_u=False, band=ORANGE)
        crowd(c, [(0.6, 2.55), (0.95, 2.7), (1.4, 2.5), (1.8, 2.75), (2.2, 2.55)], "shop3c", bags=True)
        lamp(c, 2.9, 2.9)
        tree(c, 0.25, 2.75, 0.8)
        return c
    floors = 2 if level == 2 else 1
    u0, v0, u1, v1 = (0.8, 0.85, 2.25, 2.15) if level < 2 else (0.6, 0.6, 2.3, 2.15)
    h = 18 if floors == 1 else 32
    if level == 2:  # the loading bay at the back right, a van
        block(c, 2.3, 0.6, 2.85, 1.45, 14, CON_L, L=combine(top_band(2, ORANGE), lambda i, n, z, hh, b, s: ((shade(CON_M, 0.9 if z % 2 else 0.8), None) if 1 < i < n - 1 and z < 10 else None)), R=ribs(3))
        van(c, 2.35, 1.6, WHITE, along_u=False, band=ORANGE)
    upper = punched(f"shop{level}u", bay=7, floor=10, ww=4, wh=5, p=0.6, lo=21, hi=h - 2) if floors == 2 else None
    win = lambda i, n, z, hh, b, s: ((GLASS_L if s == "L" else GLASS_DK), (LIT if level else (190, 150, 90))) if n * 0.08 < i < n * 0.45 and 2 <= z < 9 else None  # noqa: E731
    block(c, u0, v0, u1, v1, h, paint, L=combine(top_band(2, shade(paint, 1.05)), win, solid()), R=combine(top_band(2, shade(paint, 1.05)), upper))
    if level == 0:  # peeling paint
        for k in range(4):
            x, y = c.P(u0 + 0.2 + k * 0.32, v1, 4 + (k % 2) * 6)
            rect(c, (x, y, x + 1, y + 1), shade(paint, 0.78))
    # the door
    face(c, "L", v1, u1 - 0.42, u1 - 0.18, 2, 12, NAVY_D, lambda i, n, z, hh, b, s: ((GLASS_DK, (LIT if level else None)) if 0 < i < n - 1 and 4 < z < hh - 2 else None), ao=False)
    awning_l(c, u0 + 0.05, u1 - 0.05, v1, 13, 0.28, awn, faded=level == 0, torn=level == 0)
    # fascia sign over the awning
    fz = 14
    if level == 0:
        face(c, "L", v1, u0 + 0.15, u0 + 0.75, fz, fz + 6, (60, 50, 50), ao=False, edge=False)
        text_on(c, "OPEN", "L", v1, u0 + 0.15, u0 + 0.75, fz + 5, (230, 80, 70), (255, 90, 80))
        parcels(c, u1 + 0.05, v1 - 0.4, n=2, key="shop0b")
        x, y = c.P(u1 + 0.25, v1 + 0.15, 2)
        rect(c, (x - 1, y - 6, x + 2, y), (70, 110, 80))  # a bin
    else:
        face(c, "L", v1, u0 + 0.1, u1 - 0.1, fz, fz + 7, ORANGE, bands([(0, 1, ORANGE_D), (6, 7, ORANGE_D)]), ao=False, edge=False)
        text_on(c, "SHOP", "L", v1, u0 + 0.1, u1 - 0.1, fz + 6, WHITE, WHITE)
        # the parcel shelf by the door, a delivery bike
        prism(c, u1 + 0.05, v1 - 0.45, u1 + 0.2, v1 - 0.05, 2, 12, WOOD_D, roof=False, ao=False)
        for z in (5, 9):
            prism(c, u1 + 0.05, v1 - 0.45, u1 + 0.25, v1 - 0.05, z, z + 1, WOOD, rim=0, ao=False)
            prism(c, u1 + 0.07, v1 - 0.4, u1 + 0.22, v1 - 0.25, z + 1, z + 3, (200, 156, 104), rim=0, ao=False)
            prism(c, u1 + 0.07, v1 - 0.22, u1 + 0.22, v1 - 0.08, z + 1, z + 4, (186, 140, 90), rim=0, ao=False)
        bike(c, 1.5, 2.65, box=ORANGE)
    if level == 2:  # SALE banner, bunting to a pole, a queue rope
        face(c, "L", v1, u0 + 0.25, u1 - 0.55, 23, 31, (214, 40, 48), bands([(0, 1, (160, 28, 36))]), ao=False, edge=False)
        text_on(c, "SALE", "L", v1, u0 + 0.25, u1 - 0.55, 29, WHITE, WHITE)
        x, y = c.P(0.4, 2.85, 2)
        ln(c, [(x, y), (x, y - 22)], STEEL_D)
        bunting(c, (u1 - 0.1, v1 + 0.02), (0.4, 2.85), 24, sag=3, n=8)
        for k in range(3):
            x, y = c.P(u0 + 0.3 + k * 0.3, v1 + 0.45, 2)
            ln(c, [(x, y), (x, y - 5)], GOLD_D)
            c.put(x, y - 6, GOLD)
        a, b = c.P(u0 + 0.3, v1 + 0.45, 6), c.P(u0 + 0.9, v1 + 0.45, 6)
        ln(c, [a, ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2 + 1), b], (200, 40, 50))
        crowd(c, [(u0 + 0.35 + 0.2 * k, v1 + 0.6) for k in range(3)], "shop2q")
    if level >= 1:
        lamp(c, 2.85, 2.85)
    else:
        lamp(c, 2.85, 2.85, col=(255, 200, 120))
    tree(c, 0.25, 2.7, 0.8)
    return c


# ── Northgate Hospital (4x4) ───────────────────────────────────────────────────────────────────────────────────────

def records(key, stacks):
    """A records window: paper stacked inside (fewer with each level), lit warm; or glowing blue when it's paper-free."""
    def g(i, n, z, h, base, s):
        if not (1 <= i < n - 1 and 2 <= z < h - 1):
            return None
        if stacks is None:  # paper-free: screens glowing blue
            return ((70, 140, 230) if (i + z) % 3 else (140, 200, 255)), (90, 170, 255)
        col_ = i * 4 // max(1, n - 2)
        top_ = 2 + int(hv(key, col_) * (h - 4) * stacks)
        if z < top_:
            return (PAPER if z % 2 else (214, 206, 186)), (255, 236, 190)
        return (GLASS_L if s == "L" else GLASS_DK), (LIT if hv(key, "w", i // 3) < 0.6 else None)
    return g


def helipad(c, u, v, z, r=0.42):
    ellipse(c, u, v, z, r, (70, 76, 90))
    x, y = c.Pf(u, v, z)
    rx, ry = r * 22.6 * 0.82, r * 11.3 * 0.82
    c.d.ellipse((round(x - rx), round(y - ry) - 1, round(x + rx), round(y + ry) - 1), outline=A(GOLD))
    xi, yi = round(x), round(y) - 1
    for dx in (-2, 2):
        ln(c, [(xi + dx, yi - 2), (xi + dx, yi + 2)], WHITE)
    ln(c, [(xi - 2, yi), (xi + 2, yi)], WHITE)
    for k in range(6):
        a = k * math.pi / 3
        px_, py_ = round(x + math.cos(a) * rx), round(y + math.sin(a) * ry) - 1
        c.put(px_, py_, (120, 255, 150), (120, 255, 150))


def lm_hospital(level):
    c = Kit(4, 4, 120 if level == 3 else 60)
    plate(c, 4, 4, key=f"hosp{level}", worn=level == 0)
    render = (232, 236, 238)
    if level == 0:
        u0, v0, u1, v1, h = 1.3, 1.25, 2.65, 2.4, 12
        block(c, u0, v0, u1, v1, h, shade(CREAM, 0.96), L=combine(punched("hosp0", bay=8, floor=12, ww=4, wh=4, p=0.4, lo=1), solid()),
              R=combine(punched("hosp0r", bay=8, floor=12, ww=4, wh=4, p=0.3, lo=1), solid()), roof=False)
        c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.08, 2 + h, 8, (150, 90, 74))
        face(c, "L", v1, 1.85, 2.1, 2, 11, (90, 110, 120), ao=False)
        cross_sign(c, "L", v1 + 0.08, 1.35, 13, 7)
        # the one ambulance bay: a canopy on posts over painted lines, empty
        bu0, bv0, bu1, bv1 = 2.8, 1.35, 3.6, 2.35
        for k in range(3):
            c.line((bu0 + 0.05, bv0 + k * 0.45, 2), (bu1, bv0 + k * 0.45, 2), GOLD)
        for pu, pv in ((bu1 - 0.05, bv1), (bu1 - 0.05, bv0 + 0.05)):
            x, y = c.P(pu, pv, 2)
            ln(c, [(x, y), (x, y - 12)], STEEL_D)
        prism(c, u1, bv0, bu1, bv1, 14, 15, (196, 200, 206), rim=0, ao=False)
        fence(c, 0.5, 3.6, 2.4, 3.6, broken=True)
        bench(c, 1.0, 2.75)
        tree(c, 0.5, 1.4, 1.0)
        tree(c, 3.4, 3.2, 0.9)
        lamp(c, 2.6, 3.0, col=(255, 210, 140))
        return c
    if level == 3:  # the glass tower with a helipad, the research wing, the low clinic block in front, a garden
        tu0, tv0, tu1, tv1, th = 0.7, 0.45, 2.1, 1.7, 86
        block(c, tu0, tv0, tu1, tv1, th, render,
              L=combine(top_band(3, render), bands([(28, 30, GREEN_X)]), glass("hospT", bay=5, floor=6, p=0.55, lo=2, hi=th - 4)),
              R=combine(top_band(3, render), bands([(28, 30, GREEN_X)]), glass("hospTr", bay=5, floor=6, p=0.5, lo=2, hi=th - 4)))
        helipad(c, (tu0 + tu1) / 2, (tv0 + tv1) / 2, 2 + th, 0.5)
        cross_sign(c, "L", tv1, tu0 + 0.15, th - 12, 9)
        # research wing: lab glass and roof plant
        ru0, rv0, ru1, rv1 = 2.35, 0.45, 3.6, 1.6
        block(c, ru0, rv0, ru1, rv1, 30, (210, 220, 226),
              L=combine(top_band(2, TEAL), bands([(12, 13, TEAL)]), glass("hospR", bay=6, floor=9, p=0.6, lo=2, palette={"L": ((80, 160, 170), (120, 200, 200), (170, 230, 226)), "R": ((50, 120, 130), (80, 160, 170), (120, 200, 200))})),
              R=combine(top_band(2, TEAL), punched("hospRr", bay=6, floor=9, ww=4, wh=5, p=0.5)))
        plant(c, ru0, rv0, ru1, rv1, 32, "hospRp", n=3, antennas=1)
        # the low block across the front: entrance, the paper-free records room glowing blue
        lu0, lv0, lu1, lv1 = 0.5, 1.75, 3.0, 2.6
        block(c, lu0, lv0, lu1, lv1, 18, render, L=combine(top_band(2, GREEN_X), punched("hospL", bay=7, floor=9, ww=4, wh=5, p=0.6)),
              R=combine(top_band(2, GREEN_X), records("hospLr", None)))
        face(c, "L", lv1, 1.55, 2.05, 2, 12, GLASS_DK, glass("hospE", bay=4, floor=11, p=0.95, refl=False), ao=False)
        prism(c, 1.45, lv1, 2.15, lv1 + 0.3, 12, 14, GREEN_X, rim=0, ao=False)
        face(c, "L", lv1, 0.65, 1.35, 5, 11, (60, 100, 170), records("hospLb", None), ao=False)
        # garden: lawn, trees, benches, a path
        lawn(c, 0.3, 2.85, 2.2, 3.75, "hospG")
        c.poly([(1.1, 2.85, 2), (1.3, 2.85, 2), (1.3, 3.75, 2), (1.1, 3.75, 2)], (214, 200, 170))
        tree(c, 0.6, 3.2, 1.0)
        tree(c, 1.8, 3.4, 1.1, LEAF_L)
        tree(c, 0.5, 3.6, 0.8)
        bench(c, 1.4, 3.1)
        crowd(c, [(1.5, 3.3), (0.9, 3.0)], "hospGp")
        van(c, 2.6, 2.85, WHITE, along_u=False, band=GREEN_X, light_bar=BLUE_L)
        lamp(c, 3.7, 3.7)
        return c
    # levels 1-2: a two-storey hospital (a new wing and an entrance ramp at 2)
    if level == 2:
        wu0, wv0, wu1, wv1 = 0.35, 0.5, 1.25, 2.9
        block(c, wu0, wv0, wu1, wv1, 22, render, L=combine(top_band(2, GREEN_X), punched("hospW", bay=6, floor=9, ww=4, wh=4, p=0.55, lo=3)),
              R=combine(top_band(2, GREEN_X), punched("hospWr", bay=6, floor=9, ww=4, wh=4, p=0.55, lo=3)))
        plant(c, wu0, wv0, wu1, wv1 - 1.4, 24, "hospWp", n=2)
    u0, v0, u1, v1, h = (0.8, 0.85, 3.0, 2.3, 26) if level == 1 else (1.25, 0.6, 3.3, 2.3, 34)
    rec = records(f"hosp{level}r", 0.9 if level == 1 else 0.45)
    block(c, u0, v0, u1, v1, h, render, L=combine(top_band(2, GREEN_X), punched(f"hosp{level}", bay=6, floor=10, ww=4, wh=5, p=0.6, lo=4)),
          R=combine(top_band(2, GREEN_X), punched(f"hosp{level}rr", bay=6, floor=10, ww=4, wh=5, p=0.55, lo=4, hi=12)))
    face(c, "R", u1, v0 + 0.25, v0 + 0.85, 2 + 14, 2 + 22, GLASS_DK, rec, ao=False)  # the records room, upstairs
    plant(c, u0, v0, u1, v1, 2 + h, f"hosp{level}p", n=2)
    # the cross sign on the roof edge
    x0 = u0 + 0.2
    prism(c, x0, v1 - 0.08, x0 + 0.55, v1, 2 + h, 2 + h + 9, GREEN_X, rim=0, ao=False)
    cross_sign(c, "L", v1, x0, 2 + h, 9)
    # the entrance: a canopy over glass doors (a ramp with a rail at level 2)
    m = (u0 + u1) / 2
    face(c, "L", v1, m - 0.22, m + 0.22, 2, 12, GLASS_DK, glass(f"hosp{level}d", bay=4, floor=11, p=0.95, refl=False), ao=False)
    prism(c, m - 0.35, v1, m + 0.35, v1 + 0.3, 12, 14, GREEN_X, rim=0, ao=False)
    if level == 2:
        c.poly([(m - 0.9, v1 + 0.05, 2), (m - 0.35, v1 + 0.05, 5), (m - 0.35, v1 + 0.3, 5), (m - 0.9, v1 + 0.3, 2)], (214, 210, 200))
        prism(c, m - 0.35, v1 + 0.02, m + 0.35, v1 + 0.3, 2, 5, (214, 210, 200), rim=0, ao=False)
        ln(c, [c.P(m - 0.9, v1 + 0.32, 6), c.P(m - 0.35, v1 + 0.32, 9), c.P(m + 0.1, v1 + 0.32, 9)], STEEL_D)
        van(c, 3.35, 2.6, WHITE, along_u=False, band=GREEN_X, light_bar=BLUE_L)
        van(c, 2.6, 3.05, WHITE, along_u=True, band=GREEN_X, light_bar=BLUE_L)
        crowd(c, [(1.6, 2.75), (1.85, 2.9), (2.2, 2.7)], "hosp2c")
        tree(c, 0.5, 3.5, 0.9)
    else:
        van(c, 3.1, 2.55, WHITE, along_u=False, band=GREEN_X, light_bar=BLUE_L)
        bench(c, 1.0, 2.8)
        tree(c, 0.5, 3.3, 1.0)
        tree(c, 3.6, 0.6, 0.9)
    lamp(c, 3.7, 3.6)
    lamp(c, 0.4, 2.6)
    return c


# ── Hilltop School (4x4) ───────────────────────────────────────────────────────────────────────────────────────────

def playground(c, u, v):
    """A swing frame and a little slide."""
    for du in (0, 0.5):
        x, y = c.P(u + du, v, 2)
        ln(c, [(x - 2, y), (x, y - 12), (x + 2, y)], (226, 72, 64))
    a, b = c.P(u, v, 14), c.P(u + 0.5, v, 14)
    ln(c, [a, b], (226, 72, 64))
    for t in (0.3, 0.7):
        x, y = c.P(u + 0.5 * t, v, 14)
        ln(c, [(x, y), (x, y - (-6))], STEEL_D)
        c.put(x, y + 7, (59, 130, 246))
    x, y = c.P(u + 0.15, v + 0.55, 2)
    ln(c, [(x, y), (x, y - 9)], STEEL_D)
    ln(c, [(x, y - 9), (x + 7, y - 1)], (255, 196, 40), 2)


def bell_tower(c, u, v, z):
    x, y = c.P(u, v, z)
    for dx in (-3, 3):
        ln(c, [(x + dx, y), (x + dx, y - 7)], WOOD_D)
    c.d.polygon([(x - 5, y - 7), (x + 5, y - 7), (x, y - 12)], fill=A((120, 70, 60)))
    ell(c, (x - 2, y - 6, x + 2, y - 2), GOLD)
    c.put(x, y - 1, GOLD_D)


def bikes(c, u0, u1, v):
    x0, y0 = c.P(u0, v, 2)
    x1, y1 = c.P(u1, v, 2)
    ln(c, [(x0, y0 - 3), (x1, y1 - 3)], STEEL_D)
    n = int((u1 - u0) / 0.14)
    for k in range(n):
        x, y = c.P(u0 + 0.05 + k * 0.14, v + 0.06, 2)
        col = SHIRTS[k % len(SHIRTS)]
        c.d.ellipse((x - 1, y - 4, x + 2, y - 1), outline=A(CHAR))
        ln(c, [(x, y - 3), (x + 2, y - 5)], col)
        c.put(x + 2, y - 6, CHAR)


def lm_school(level):
    c = Kit(4, 4, 80)
    plate(c, 4, 4, key=f"school{level}", worn=level == 0)
    if level <= 2:  # trees on the back verge, drawn before the buildings in front of them
        tree(c, 0.5, 0.6, 1.1)
        if level == 1:
            tree(c, 3.5, 0.6, 1.0)
    if level == 0:
        u0, v0, u1, v1, h = 1.2, 1.0, 2.6, 2.0, 11
        red = (186, 70, 58)
        block(c, u0, v0, u1, v1, h, red, L=combine(lambda i, n, z, hh, b, s: (shade(b, 0.82), None) if z % 3 == 2 else None,
                                                   punched("sch0", bay=9, floor=11, ww=4, wh=5, p=0.5, lo=1)),
              R=combine(lambda i, n, z, hh, b, s: (shade(b, 0.82), None) if z % 3 == 2 else None, punched("sch0r", bay=9, floor=11, ww=4, wh=5, p=0.4, lo=1)), roof=False)
        c.gable(u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.08, 2 + h, 9, (90, 84, 96))
        face(c, "L", v1, 1.8, 2.05, 2, 10, WOOD_D, ao=False)
        bell_tower(c, 2.3, 1.5, 2 + h + 9 - 4)
        lawn(c, 2.4, 2.4, 3.8, 3.8, "sch0l")
        playground(c, 2.8, 2.9)
        fence(c, 0.4, 3.7, 2.2, 3.7, broken=True)
        tree(c, 0.7, 2.9, 0.8)
        lamp(c, 2.2, 2.4, col=(255, 210, 140))
        return c
    brick = BRICK
    bmas = masonry(3, 6, 0.86)
    if level == 3:  # science block with an observatory, behind on the left
        su0, sv0, su1, sv1 = 0.3, 0.3, 1.5, 1.2
        block(c, su0, sv0, su1, sv1, 26, (214, 216, 222), L=combine(top_band(2, (59, 130, 246)), glass("schS", bay=5, floor=8, p=0.5, lo=2)),
              R=combine(top_band(2, (59, 130, 246)), punched("schSr", bay=6, floor=8, ww=4, wh=4, p=0.5)))
        drum(c, 0.9, 0.75, 28, 34, 0.3, STEEL, capcol=STEEL)
        drum(c, 0.9, 0.75, 34, 40, 0.3, STEEL, r1=0.04, profile=lambda t: 0.3 * math.cos(t * math.pi / 2) + 0.02, cap=False)
        x, y = c.P(0.9, 0.75, 38)
        ln(c, [(x - 1, y), (x + 4, y - 6)], CHAR, 2)
        ln(c, [(x, y + 3), (x, y - 5)], CHAR)
    if level >= 2:  # the sports hall at the back right: a long low shed with a curved roof
        hu0, hv0, hu1, hv1 = 1.7, 0.25, 3.7, 0.95
        block(c, hu0, hv0, hu1, hv1, 16, (196, 204, 214), L=combine(top_band(2, (59, 130, 246)), ribs(3)), R=combine(top_band(2, (59, 130, 246)), ribs(3)), roof=False)
        for k in range(6):
            t0, t1 = k / 6, (k + 1) / 6
            z0, z1 = 18 + round(6 * math.sin(math.pi * t0)), 18 + round(6 * math.sin(math.pi * t1))
            c.poly([(hu0, hv0 + (hv1 - hv0) * t0, z0), (hu1, hv0 + (hv1 - hv0) * t0, z0), (hu1, hv0 + (hv1 - hv0) * t1, z1), (hu0, hv0 + (hv1 - hv0) * t1, z1)],
                   shade((176, 186, 200), 1.06 if k < 3 else 0.9))
        c.poly([(hu1, hv0 + (hv1 - hv0) * k / 6, 18 + round(6 * math.sin(math.pi * k / 6))) for k in range(7)] + [(hu1, hv1, 18), (hu1, hv0, 18)], (170, 178, 190))
    # the main school: brick, two classrooms (two storeys from level 2)
    u0, v0, u1, v1 = (0.8, 1.0, 2.9, 2.1) if level == 1 else (0.6, 1.2, 2.7, 2.3)
    h = 16 if level == 1 else 28
    lab = lambda i, n, z, hh, b, s: (((60, 220, 230) if (i + z) % 4 else (180, 250, 255)), (80, 230, 240)) if n * 0.15 < i < n * 0.75 and 4 <= z < 10 else None  # noqa: E731
    block(c, u0, v0, u1, v1, h, brick, L=combine(top_band(2, CON_L), bands([(13, 14, CON_L)]) if level > 1 else None, punched(f"sch{level}", bay=7, floor=12, ww=5, wh=6, p=0.6, lo=2), bmas),
          R=combine(top_band(2, CON_L), lab, punched(f"sch{level}r", bay=7, floor=12, ww=5, wh=6, p=0.5, lo=14), bmas))
    plant(c, u0 + 0.2, v0 + 0.1, u1 - 0.3, v1 - 0.2, 2 + h, f"sch{level}p", n=1)
    m = (u0 + u1) / 2
    face(c, "L", v1, m - 0.16, m + 0.16, 2, 12, NAVY_D, lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and 2 < z < hh - 1 else None), ao=False)
    prism(c, m - 0.3, v1, m + 0.3, v1 + 0.22, 12, 14, CON_L, rim=0, ao=False)
    if level >= 2:  # the library wing: tall windows with shelves of books behind
        lu0, lv0, lu1, lv1 = (2.75, 1.2, 3.75, 2.3) if level == 2 else (2.8, 1.25, 3.75, 2.35)
        if level == 2:
            def books(i, n, z, hh, b, s):
                if 1 <= i < n - 1 and 3 <= z < hh - 3:
                    if z % 5 == 0:
                        return WOOD_D, None
                    return SHIRTS[(i + (z // 5) * 3) % len(SHIRTS)], LIT if hv("lib", i // 4, z // 5) < 0.6 else None
                return None
            block(c, lu0, lv0, lu1, lv1, 20, CREAM, L=combine(top_band(2, NAVY), books), R=combine(top_band(2, NAVY), punched("schL", bay=6, floor=10, ww=4, wh=6, p=0.5)))
        else:  # the glass library with its dome
            block(c, lu0, lv0, lu1, lv1, 20, (210, 220, 230), L=glass("schLg", bay=4, floor=7, p=0.8, lo=1), R=glass("schLgr", bay=4, floor=7, p=0.7, lo=1))
            drum(c, (lu0 + lu1) / 2, (lv0 + lv1) / 2, 22, 34, 0.42, (150, 206, 236), profile=lambda t: 0.42 * math.cos(t * math.pi / 2) ** 0.8 + 0.02,
                 shader=lambda th, z, hh, base: ((shade(base, 0.82), (190, 230, 255)) if int((th + 1.6) * 4) % 2 == 0 and z < hh - 2 else (base, (150, 210, 250))), cap=False)
            beacon(c, (lu0 + lu1) / 2, (lv0 + lv1) / 2, 35, (255, 240, 200), 2)
    # the flag with a book on it
    flag(c, u0 - 0.15, v1 + 0.3, 2, 24, WHITE, "book", (59, 130, 246))
    if level == 1:
        lawn(c, 2.5, 2.6, 3.8, 3.8, "sch1l")
        playground(c, 2.9, 3.0)
        lamp(c, 2.3, 2.7)
        crowd(c, [(1.2, 2.6), (1.5, 2.8)], "sch1c")
    elif level == 2:
        bikes(c, 0.5, 1.6, 2.75)
        lawn(c, 2.4, 2.75, 3.8, 3.8, "sch2l")
        playground(c, 2.8, 3.1)
        crowd(c, [(1.9, 2.7), (2.1, 2.95), (1.5, 3.2)], "sch2c")
        lamp(c, 0.4, 3.6)
    else:  # the playing field with a track, the RESULTS DAY banner
        fu0, fv0, fu1, fv1 = 0.3, 2.75, 3.7, 3.8
        c.poly([(fu0, fv0, 2), (fu1, fv0, 2), (fu1, fv1, 2), (fu0, fv1, 2)], (196, 92, 70))
        lawn(c, fu0 + 0.12, fv0 + 0.12, fu1 - 0.12, fv1 - 0.12, "sch3f")
        for a_, b_ in (((fu0 + 0.2, fv0 + 0.2), (fu1 - 0.2, fv0 + 0.2)), ((fu1 - 0.2, fv0 + 0.2), (fu1 - 0.2, fv1 - 0.2)),
                       ((fu1 - 0.2, fv1 - 0.2), (fu0 + 0.2, fv1 - 0.2)), ((fu0 + 0.2, fv1 - 0.2), (fu0 + 0.2, fv0 + 0.2)), (((fu0 + fu1) / 2, fv0 + 0.2), ((fu0 + fu1) / 2, fv1 - 0.2))):
            c.line((*a_, 2), (*b_, 2), WHITE)
        bu0, bu1, bv = 0.75, 3.35, 2.55
        for pu in (bu0, bu1):
            x, y = c.P(pu, bv, 2)
            ln(c, [(x, y), (x, y - 16)], STEEL_D)
        face(c, "L", bv, bu0 + 0.02, bu1 - 0.02, 8, 16, (59, 130, 246), bands([(0, 1, NAVY), (7, 8, NAVY)]), ao=False, edge=False)
        text_on(c, "RESULTS DAY", "L", bv, bu0, bu1, 14, WHITE, WHITE)
        crowd(c, [(1.1, 2.4), (2.3, 2.42), (3.0, 3.3), (1.5, 3.4)], "sch3c")
        tree(c, 3.75, 2.55, 0.8)
    return c


# ── City Arena (4x4) ───────────────────────────────────────────────────────────────────────────────────────────────

PU0, PV0, PU1, PV1 = 0.95, 1.05, 3.1, 2.95  # the pitch


def pitch(c, worn=False):
    for k in range(8):  # mowing stripes along u
        a = PU0 + k * (PU1 - PU0) / 8
        b = a + (PU1 - PU0) / 8
        c.poly([(a, PV0, 2), (b, PV0, 2), (b, PV1, 2), (a, PV1, 2)], GRASS if k % 2 else GRASS_L)
    line = WHITE if not worn else (214, 220, 206)
    i = 0.06
    for a_, b_ in (((PU0 + i, PV0 + i), (PU1 - i, PV0 + i)), ((PU1 - i, PV0 + i), (PU1 - i, PV1 - i)), ((PU1 - i, PV1 - i), (PU0 + i, PV1 - i)),
                   ((PU0 + i, PV1 - i), (PU0 + i, PV0 + i)), (((PU0 + PU1) / 2, PV0 + i), ((PU0 + PU1) / 2, PV1 - i))):
        c.line((*a_, 2), (*b_, 2), line)
    mu, mv = (PU0 + PU1) / 2, (PV0 + PV1) / 2
    x, y = c.Pf(mu, mv, 2)
    c.d.ellipse((round(x - 8), round(y - 4) - 1, round(x + 8), round(y + 4) - 1), outline=A(line))
    for u_end, sgn in ((PU0 + i, 1), (PU1 - i, -1)):  # penalty boxes and goals
        c.line((u_end, mv - 0.45, 2), (u_end + sgn * 0.35, mv - 0.45, 2), line)
        c.line((u_end + sgn * 0.35, mv - 0.45, 2), (u_end + sgn * 0.35, mv + 0.45, 2), line)
        c.line((u_end + sgn * 0.35, mv + 0.45, 2), (u_end, mv + 0.45, 2), line)
        x0, y0 = c.P(u_end, mv - 0.15, 2)
        x1, y1 = c.P(u_end, mv + 0.15, 2)
        ln(c, [(x0, y0), (x0, y0 - 5), (x1, y1 - 5), (x1, y1)], WHITE)
    if worn:  # bare patches by the goals
        for u_ in (PU0 + 0.2, PU1 - 0.25, mu):
            x, y = c.P(u_, mv, 2)
            c.d.ellipse((x - 4, y - 2, x + 3, y + 1), fill=A((170, 150, 100)))


def stand_back_v(c, u0, u1, v_front, rows, depth, seat, wood=False, glow_col=None, z0=2):
    """A stand along u behind the pitch's far side (v small), rising away from the pitch: risers face the viewer."""
    d = depth / rows
    for k in reversed(range(rows)):
        va, vb = v_front - (k + 1) * d, v_front - k * d
        zt = z0 + 3 + k * 3
        col_ = WOOD if wood else CON_L
        prism(c, u0, va, u1, vb, z0, zt, col_, L=None if wood else louvres(3), roof=False, ao=False)
        c.poly([(u0, va, zt), (u1, va, zt), (u1, vb, zt), (u0, vb, zt)], seat)
        if glow_col:
            c.ld.line([c.P(u0 + 0.05, vb, zt), c.P(u1 - 0.05, vb, zt)], fill=A(glow_col, 200))
        face(c, "L", vb, u0, u1, zt - 1, zt, shade(seat, 1.1), ao=False, edge=False)


def stand_back_u(c, v0, v1, u_front, rows, depth, seat, glow_col=None, z0=2):
    """A stand along v behind the pitch's far end (u small), rising away from it: risers face right."""
    d = depth / rows
    for k in reversed(range(rows)):
        ua, ub = u_front - (k + 1) * d, u_front - k * d
        zt = z0 + 3 + k * 3
        prism(c, ua, v0, ub, v1, z0, zt, CON_L, R=louvres(3), roof=False, ao=False)
        c.poly([(ua, v0, zt), (ub, v0, zt), (ub, v1, zt), (ua, v1, zt)], seat)
        if glow_col:
            c.ld.line([c.P(ub, v0 + 0.05, zt), c.P(ub, v1 - 0.05, zt)], fill=A(glow_col, 200))
        face(c, "R", ub, v0, v1, zt - 1, zt, shade(seat, 0.95), ao=False, edge=False)


def stand_front_v(c, u0, u1, v_inner, rows, depth, seat, glow_col=None, z0=2, wall=CON_L, key="sf"):
    """A low stand along u on the near side (v large), rising toward the viewer: we see its seats and its back wall."""
    d = depth / rows
    for k in range(rows):
        va, vb = v_inner + k * d, v_inner + (k + 1) * d
        zt = z0 + 2 + k * 2
        prism(c, u0, va, u1, vb, z0, zt, wall, roof=False, ao=False)
        c.poly([(u0, va, zt), (u1, va, zt), (u1, vb, zt), (u0, vb, zt)], seat if k % 2 == 0 else shade(seat, 0.9))
        if glow_col:
            c.ld.line([c.P(u0 + 0.05, va + d / 2, zt), c.P(u1 - 0.05, va + d / 2, zt)], fill=A(glow_col, 160))
    face(c, "L", v_inner + depth, u0, u1, z0, z0 + 2 * rows, wall, combine(top_band(1, shade(wall, 1.1)), punched(key, bay=8, floor=2 * rows + 2, ww=3, wh=3, p=0.6, lo=0)), ao=False)


def stand_front_u(c, v0, v1, u_inner, rows, depth, seat, glow_col=None, z0=2, wall=CON_L, key="sfu"):
    d = depth / rows
    for k in range(rows):
        ua, ub = u_inner + k * d, u_inner + (k + 1) * d
        zt = z0 + 2 + k * 2
        prism(c, ua, v0, ub, v1, z0, zt, wall, roof=False, ao=False)
        c.poly([(ua, v0, zt), (ub, v0, zt), (ub, v1, zt), (ua, v1, zt)], seat if k % 2 == 0 else shade(seat, 0.9))
        if glow_col:
            c.ld.line([c.P(ua + d / 2, v0 + 0.05, zt), c.P(ua + d / 2, v1 - 0.05, zt)], fill=A(glow_col, 160))
    face(c, "R", u_inner + depth, v0, v1, z0, z0 + 2 * rows, wall, combine(top_band(1, shade(wall, 1.1)), punched(key, bay=8, floor=2 * rows + 2, ww=3, wh=3, p=0.6, lo=0)), ao=False)


def floodlight(c, u, v, z0, h, facing=1):
    lattice(c, u, v, z0, z0 + h, 2, 1, STEEL_M, 5)
    x, y = c.P(u, v, z0 + h)
    rect(c, (x - 4, y - 4, x + 4, y), CHAR)
    for k in range(4):
        for r in range(2):
            c.put(x - 3 + k * 2, y - 3 + r * 2, (255, 250, 220), (255, 250, 230))
    glow(c, x, y - 2, (255, 250, 220), 6, 90)
    c.ld.polygon([(x, y), (x + facing * 14 - 10, y + 30), (x + facing * 14 + 10, y + 30)], fill=A((255, 248, 220), 26))


def big_screen(c, u, v, z, w, h, key, posts=True):
    """A two-sided screen on the back corner: a left face and a right face meeting at (u, v)."""
    if posts:
        for pu, pv in ((u - w + 0.05, v), (u, v - w + 0.05)):
            x, y = c.P(pu, pv, 2)
            ln(c, [(x, y), (x, y - (z - 2))], STEEL_D, 2)
    screen(c, "L", v, u - w, u, z, z + h, key, (110, 240, 170), kind="bars")
    screen(c, "R", u, v - w, v, z, z + h, key + "r", (255, 180, 60), kind="ticker")


def lm_stadium(level):
    c = Kit(4, 4, 80)
    plate(c, 4, 4, col=(186, 190, 184) if level else PAVE, grass=True, key=f"arena{level}", worn=level == 0)
    if level == 0:
        lawn(c, 0.6, 0.7, 3.45, 3.3, f"arena{level}l")
    seat_a, seat_b = SEAT, SEAT_B
    g = (TEAL if level == 3 else None)
    if level >= 2:
        floodlight(c, 0.25, 0.25, 2, 48 if level == 2 else 54)
    if level >= 1:  # the back stand (far side)
        rows = (3, 5, 7)[level - 1]
        stand_back_v(c, 0.8 if level < 2 else 0.35, 3.25 if level < 2 else 3.7, PV0 - 0.05, rows, 0.15 * rows if level < 3 else 0.85, seat_a, glow_col=g)
    if level >= 2:  # the far end stand
        stand_back_u(c, 0.4, 3.6, PU0 - 0.05, 4 if level == 2 else 5, 0.6, seat_b, glow_col=g)
    if level == 3:  # the curved roof over the far stands, its edge lit in team colours
        zr = 34
        for k in range(14):
            t = k / 13
            u_ = 0.3 + t * 3.4
            x, y = c.P(u_, 0.95, zr + round(5 * math.sin(math.pi * t)))
            if k % 4 == 0:
                ln(c, [(x, y), c.P(u_, 0.95, 2)], STEEL_D)
        pts_back = [(0.3 + t / 13 * 3.4, 0.2, zr + 2 + round(5 * math.sin(math.pi * t / 13))) for t in range(14)]
        pts_front = [(0.3 + t / 13 * 3.4, 0.95, zr + round(5 * math.sin(math.pi * t / 13))) for t in range(14)]
        for k in range(13):
            c.poly([pts_back[k], pts_back[k + 1], pts_front[k + 1], pts_front[k]], (226, 232, 240) if k % 2 else (210, 218, 228))
        for k in range(13):
            a_, b_ = c.P(*pts_front[k]), c.P(*pts_front[k + 1])
            col_ = TEAL if k % 2 else MAGENTA
            ln(c, [(a_[0], a_[1] + 1), (b_[0], b_[1] + 1)], shade(col_, 0.8), 2, col_)
        pts_l = [(0.95, 0.3 + t / 13 * 3.3, zr + round(4 * math.sin(math.pi * t / 13))) for t in range(14)]
        pts_lb = [(0.25, 0.3 + t / 13 * 3.3, zr + 2 + round(4 * math.sin(math.pi * t / 13))) for t in range(14)]
        for k in range(13):
            c.poly([pts_lb[k], pts_lb[k + 1], pts_l[k + 1], pts_l[k]], (220, 226, 234) if k % 2 else (204, 212, 222))
        for k in range(13):
            a_, b_ = c.P(*pts_l[k]), c.P(*pts_l[k + 1])
            col_ = MAGENTA if k % 2 else TEAL
            ln(c, [(a_[0], a_[1] + 1), (b_[0], b_[1] + 1)], shade(col_, 0.8), 2, col_)
    if level >= 2:
        big_screen(c, 0.62, 0.62, 26 if level == 2 else 38, 0.5, 9 if level == 2 else 11, f"arenaS{level}")
        if level == 2:  # flags along the back stand's top
            for k in range(5):
                x, y = c.P(0.6 + k * 0.7, 0.3, 2 + 3 + 4 * 3)
                ln(c, [(x, y), (x, y - 7)], STEEL)
                rect(c, (x + 1, y - 7, x + 4, y - 5), SHIRTS[k % 4])
    if level == 1:  # the simple scoreboard behind the far stand
        x, y = c.P(2.0, 0.4, 2)
        ln(c, [(x - 6, y), (x - 6, y - 16)], STEEL_D)
        ln(c, [(x + 6, y), (x + 6, y - 16)], STEEL_D)
        face(c, "L", 0.42, 1.65, 2.35, 16, 24, CHAR, ao=False, edge=False)
        text_on(c, "2 1", "L", 0.42, 1.65, 2.35, 22, (255, 196, 40), (255, 196, 40))
    pitch(c, worn=level == 0)
    if level >= 1:  # the floodlit pitch at night
        c.ld.polygon([c.P(PU0, PV0, 2), c.P(PU1, PV0, 2), c.P(PU1, PV1, 2), c.P(PU0, PV1, 2)], fill=A((236, 246, 220), 26 + 10 * level))
    if level == 0:  # one small wooden stand on the far side, a fence
        stand_back_v(c, 1.5, 2.6, PV0 - 0.03, 3, 0.4, WOOD, wood=True)
        fence(c, 0.5, 3.55, 3.5, 3.55, broken=True, col=WHITE)
        tree(c, 0.35, 0.5, 1.0)
        tree(c, 3.6, 0.5, 0.9)
        tree(c, 0.4, 3.0, 0.8)
        lamp(c, 3.6, 3.6, col=(255, 210, 140))
        return c
    if level >= 1:  # the near side stand (low, so the pitch shows)
        rows = (2, 3, 3)[level - 1]
        stand_front_v(c, 0.8 if level < 2 else 0.35, 3.25 if level < 2 else 3.7, PV1 + 0.05, rows, 0.12 * rows * 2, seat_a, glow_col=g, key=f"aF{level}")
    if level >= 2:  # the near end stand
        stand_front_u(c, 0.4, 3.0, PU1 + 0.05, 3, 0.5, seat_b, glow_col=g, key=f"aE{level}")
    if level == 1:  # the ticket booth with a queue rail, two floodlights
        prism(c, 3.35, 3.25, 3.75, 3.65, 2, 12, (226, 72, 64), L=lambda i, n, z, hh, b, s: ((GLASS_L, LIT) if 1 < i < n - 1 and 5 <= z < 9 else None), roof=False)
        c.pyramid(3.3, 3.2, 3.8, 3.7, 14, 5, WHITE)
        prism(c, 3.3, 3.2, 3.8, 3.7, 12, 14, WHITE, rim=0, ao=False)
        a_, b_ = c.P(2.6, 3.8, 6), c.P(3.3, 3.8, 6)
        ln(c, [a_, b_], STEEL)
        crowd(c, [(2.75, 3.72), (2.95, 3.74), (3.15, 3.76)], "arena1q")
        floodlight(c, 0.3, 0.3, 2, 40)
        floodlight(c, 3.75, 0.3, 2, 40, -1)
        lamp(c, 0.3, 3.6)
    if level == 2:  # floodlights on the near corners, food kiosks
        floodlight(c, 3.8, 0.25, 2, 48, -1)
        floodlight(c, 0.25, 3.8, 2, 48)
        floodlight(c, 3.8, 3.8, 2, 22, -1)
        for k, u in enumerate((3.2, 3.55)):
            prism(c, u, 3.3, u + 0.3, 3.6, 2, 9, WHITE, L=lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and 3 <= z < 6 else None), rim=0)
            awn = SHIRTS[k + 1]
            c.poly([(u - 0.02, 3.3, 10), (u + 0.32, 3.3, 10), (u + 0.32, 3.68, 8), (u - 0.02, 3.68, 8)], awn)
    if level == 3:  # fan plaza with turnstiles at the near corner, the ring of glowing seats
        floodlight(c, 3.8, 0.25, 2, 54, -1)
        floodlight(c, 0.25, 3.8, 2, 54)
        for k in range(4):
            prism(c, 3.2 + k * 0.17, 3.3, 3.28 + k * 0.17, 3.38, 2, 6, STEEL_M, rim=0, ao=False)
            c.put(*c.P(3.24 + k * 0.17, 3.34, 7), (110, 240, 150), (110, 240, 150))
        crowd(c, [(3.2, 3.55), (3.4, 3.7), (3.6, 3.5), (3.3, 3.85), (3.75, 3.75), (3.05, 3.8)], "arena3c", hats=TEAL)
    return c


# ── build ─────────────────────────────────────────────────────────────────────────────────────────────────────────

BUSINESSES = {"bank": (lm_bank, 3), "shop": (lm_shop, 3), "hospital": (lm_hospital, 4), "school": (lm_school, 4), "stadium": (lm_stadium, 4)}


def build(add):
    """Each site with the empty sky above it trimmed (growth_art.crop, as the landmarks), so its anchor's ay is how far
    the drawing reaches above the lot's N corner; the lights layer keeps the same canvas and anchor."""
    import growth_art
    for cid, (draw, _size) in BUSINESSES.items():
        for level in range(4):
            img, anchor, lit = draw(level).finish()
            box = img.getbbox()
            y0 = max(0, box[1] - 1)
            add(f"client:{cid}:{level}", *growth_art.crop(img, anchor))
            if lit is not None:
                add(f"client:{cid}:{level}@lights", lit.crop((0, y0, lit.width, lit.height)), (anchor[0], anchor[1] - y0))


def preview(sprites, path, ids=("bank", "shop", "hospital", "school", "stadium")):
    """.cache/art/clients-preview.png (clients2-preview.png for wave 2): each business at levels 0-3, by day then by
    night, x2."""
    from preview_services import night
    cw, ch = 150, 190
    sheet = Image.new("RGBA", (cw * 8, ch * len(ids)), (13, 8, 22, 255))
    d = ImageDraw.Draw(sheet)
    for r, cid in enumerate(ids):
        size = BUSINESSES[cid][1]
        for level in range(4):
            name = f"client:{cid}:{level}"
            img, (ax, ay) = sprites[name]
            lit = sprites.get(name + "@lights")
            for j, pic in enumerate((img, night(img, lit, (ax, ay)))):
                x = (level + 4 * j) * cw + (cw - img.width) // 2
                sheet.alpha_composite(pic, (x, r * ch + ch - 16 - img.height))
                d.text(((level + 4 * j) * cw + 6, r * ch + ch - 14), f"{cid} {level}{' night' if j else ''} ({size}x{size})", fill=(255, 230, 170, 255))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(path)


# ══ City Clients, wave 2 (round 3): twelve more businesses, all on the full 4x4 lot ═══════════════════════════════
#
#   client:studio:<0..3>    Streaming studio: a brick stage with a roller door and a "now filming" lamp, a play-button
#                           sign and an upload van, a second sound stage with a curved roof and a cold store for old
#                           reels, a glass tower with a giant play screen, satellite dishes and a red carpet
#   client:games:<0..3>     Game studio: an office over a shop with a joystick sign, a mascot board, a LAUNCH banner and
#                           a rocket balloon, a countdown clock and a queue of fans, a tower of stacked arcade cabinets
#                           with a leaderboard, a trophy and an esports stage
#   client:news:<0..3>      News office: a two-storey office with a NEWS sign and papers on the step, a ticker and a
#                           phone sign, an ON AIR booth and a horn, a media tower with a wraparound headline screen,
#                           a press hall with paper rolls and a satellite van
#   client:port:<0..3>      Port: a quay with a jetty, one crane and three containers, a second crane and a row of
#                           boxes, a truck gate and a small ship, two gantry cranes, tall stacks and a big ship
#   client:energy:<0..3>    Power grid: a fenced substation and one pole, a row of poles with meters, a control room
#                           with a wall map, solar panels, two wind turbines and a drone
#   client:factory:<0..3>   Factory: a brick shed with one chimney and a steel roll, sensor lights, a camera arch over
#                           a conveyor and a robot arm, a sawtooth works with solar panels, robots and a lorry
#   client:farm:<0..3>      Farm co-op: a red barn, a weather mast and one field, sensor posts, a tractor shed and a
#                           silo, three silos, a greenhouse and a combine harvester
#   client:carmaker:<0..3>  Car maker: a workshop with a car on a lift and a charging post, a sawtooth hall, a glass
#                           showroom and a car park, a test track loop, a globe sign and a car carrier
#   client:telecom:<0..3>   Phone network: a brick exchange and a mast, a taller mast with dishes and a phone shop, a
#                           second floor and red mast lights, a tall lattice mast and a wall of screens
#   client:council:<0..3>   Town hall: brick with a clock over the door and a noticeboard, a REPORT IT sign and a
#                           van, a records wing with a vault door, a clock tower over a square with a fountain
#   client:hotel:<0..3>     Hotel: a narrow three-floor hotel with a striped canopy, a BOOK sign and a doorman, two
#                           more floors with balconies and a pool, a grand hotel with a glass lift and a roof garden
#   client:charity:<0..3>   Charity: a shopfront with a heart sign and a donation box, a GIVE banner and volunteers, a
#                           giving-day stage with balloons and a thermometer sign, a community centre with a mural
#
# Every one stays well under the AWS Master towers (tests/art.test.ts). Generic impressions only: no real company's
# building, logo or emblem; flags are plain colours.

from services.kit import rib_shader  # noqa: E402

FONT[":"] = [".", "X", ".", "X", "."]
FONT["!"] = ["X", "X", "X", ".", "X"]
FONT["V"] = ["X.X", "X.X", "X.X", "X.X", ".X."]
WATER = (70, 140, 200)
WATER_D = (52, 110, 170)
SOIL = (140, 104, 70)
SOIL_D = (112, 82, 56)
WHEAT = (226, 196, 96)
PANEL = (44, 66, 120)
RED_B = (196, 58, 50)
YELLOW = (250, 204, 40)
PURPLE = (139, 92, 246)


def clock(c, x, y, r=4, lit=True):
    ell(c, (x - r, y - r, x + r, y + r), GOLD_D)
    ell(c, (x - r + 1, y - r + 1, x + r - 1, y + r - 1), WHITE, (255, 244, 210) if lit else None)
    ln(c, [(x, y), (x, y - r + 2)], CHAR)
    ln(c, [(x, y), (x + r - 2, y)], CHAR)


def vault(c, u0, v0, u1, v1, z, rise, col, n=6):
    """A curved roof running along u (its curve across v), as the school's sports hall."""
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        z0, z1 = z + round(rise * math.sin(math.pi * t0)), z + round(rise * math.sin(math.pi * t1))
        c.poly([(u0, v0 + (v1 - v0) * t0, z0), (u1, v0 + (v1 - v0) * t0, z0), (u1, v0 + (v1 - v0) * t1, z1), (u0, v0 + (v1 - v0) * t1, z1)],
               shade(col, 1.06 if k < n / 2 else 0.9))
    c.poly([(u1, v0 + (v1 - v0) * k / n, z + round(rise * math.sin(math.pi * k / n))) for k in range(n + 1)] + [(u1, v1, z), (u1, v0, z)], shade(col, 0.78))


def roller(c, side, fixed, a, b, z0, z1, col=STEEL_M, lit=None):
    face(c, side, fixed, a, b, z0, z1, col, lambda i, n, z, h, base, s: ((shade(base, 0.82), lit) if z % 2 else (base, lit)), ao=False)


def container(c, u, v, col, along_u=True, z=2, h=6):
    u1, v1 = (u + 0.5, v + 0.24) if along_u else (u + 0.24, v + 0.5)
    prism(c, u, v, u1, v1, z, z + h, col, L=ribs(2, 1.08, 0.86), R=ribs(2, 1.08, 0.86), rim=0, ao=z <= 2)


def car(c, u, v, col, along_u=True, z=2):
    L_, W_ = 0.38, 0.2
    u1, v1 = (u + L_, v + W_) if along_u else (u + W_, v + L_)
    prism(c, u, v, u1, v1, z + 1, z + 4, col, rim=0, ao=False)
    if along_u:
        prism(c, u + 0.09, v + 0.02, u1 - 0.1, v1 - 0.02, z + 4, z + 6, GLASS_DK, L=lambda *a: (GLASS_L, None), rim=0, ao=False, roofcol=col)
        wh = [(u + 0.08, v1), (u1 - 0.08, v1)]
    else:
        prism(c, u + 0.02, v + 0.09, u1 - 0.02, v1 - 0.1, z + 4, z + 6, GLASS_DK, R=lambda *a: (GLASS_L, None), rim=0, ao=False, roofcol=col)
        wh = [(u1, v + 0.08), (u1, v1 - 0.08)]
    for wu, wv in wh:
        x, y = c.P(wu, wv, z)
        c.put(x, y - 1, CHAR)
        c.put(x, y - 2, CHAR)


def solar(c, u0, v0, u1, v1, z, rows=None):
    """Rows of solar panels tilted to the sun (along u), with a light frame grid."""
    rows = rows or max(1, round((v1 - v0) / 0.32))
    d = (v1 - v0) / rows
    for k in range(rows):
        a, b = v0 + k * d + 0.03, v0 + (k + 1) * d - 0.03
        c.poly([(u0, a, z + 3), (u1, a, z + 3), (u1, b, z), (u0, b, z)], PANEL)
        c.line((u0, b, z), (u1, b, z), shade(PANEL, 1.5))
        for j in range(1, int((u1 - u0) / 0.2) + 1):
            uu = u0 + j * 0.2
            if uu < u1 - 0.05:
                c.line((uu, a, z + 3), (uu, b, z), shade(PANEL, 1.35))
        x, y = c.P(u0 + 0.1, a + 0.05, z + 3)
        c.put(x, y, (170, 200, 240))


def turbine(c, u, v, h, ang=0.35, z=2):
    """A wind turbine: a white tapering tower, a nacelle, three blades, a red light."""
    x, y = c.P(u, v, z)
    for k in range(h):
        w = 2 if k < h * 0.5 else 1
        c.put(x - w + 1, y - k, STEEL)
        c.put(x, y - k, shade(STEEL, 0.8))
        if w == 2:
            c.put(x - 1, y - k, WHITE)
    hy = y - h
    rect(c, (x - 2, hy - 2, x + 3, hy + 1), STEEL)
    c.put(x + 3, hy - 1, STEEL_M)
    L_ = round(h * 0.36)
    for k in range(3):
        a = ang + k * 2 * math.pi / 3
        ex, ey = x + round(math.cos(a) * L_), hy + round(math.sin(a) * L_)
        ln(c, [(x, hy), (ex, ey)], WHITE, 2)
        ln(c, [(x, hy), (ex, ey)], shade(STEEL, 0.85))
    c.put(x, hy - 1, CHAR)
    c.put(x + 1, hy - 3, RED, RED)
    glow(c, x + 1, hy - 3, RED, 2, 120)


def chimney(c, u, v, z0, h, col=BRICK, smoke=True, r=0.11):
    drum(c, u, v, z0, z0 + h, r, col, shader=lambda th, z, hh, base: (shade(base, 0.8), None) if z in (hh - 3, 4) else None, capcol=CHAR, ao=z0 <= 2)
    if smoke:
        x, y = c.P(u, v, z0 + h)
        for k, (dx, dy, rr) in enumerate(((2, -5, 3), (6, -10, 4), (11, -16, 5))):
            over(c, lambda dd, dx=dx, dy=dy, rr=rr, k=k: dd.ellipse((x + dx - rr, y + dy - rr, x + dx + rr, y + dy + rr), fill=(226, 226, 232, 150 - 30 * k)))


def silo(c, u, v, h, r=0.28, col=STEEL, z=2, lit=False):
    drum(c, u, v, z, z + h, r, col, shader=rib_shader(10, hoops=(0.25, 0.5, 0.75)), cap=False, ao=z <= 2)
    drum(c, u, v, z + h, z + h + round(r * 22), r, col, profile=lambda t: r * math.cos(t * math.pi / 2) ** 0.7 + 0.02, cap=False, ao=False)
    if lit:
        beacon(c, u, v, z + h + round(r * 22) + 1, RED, 2)


def field(c, u0, v0, u1, v1, crop, key, along_u=True, ripe=None):
    """A field: soil with rows of a crop (along u or v)."""
    c.poly([(u0, v0, 2), (u1, v0, 2), (u1, v1, 2), (u0, v1, 2)], SOIL)
    n = int(((v1 - v0) if along_u else (u1 - u0)) / 0.12)
    for k in range(n):
        t = (k + 0.5) / n
        col = ripe if ripe and k % 2 else crop
        if along_u:
            vv = v0 + (v1 - v0) * t
            c.line((u0 + 0.06, vv, 2), (u1 - 0.06, vv, 2), col)
        else:
            uu = u0 + (u1 - u0) * t
            c.line((uu, v0 + 0.06, 2), (uu, v1 - 0.06, 2), col)
    for k in range(int((u1 - u0) * (v1 - v0) * 6)):
        x, y = c.P(u0 + 0.05 + hv(key, k) * (u1 - u0 - 0.1), v0 + 0.05 + hv(key, "v", k) * (v1 - v0 - 0.1), 2)
        c.put(x, y - 1, shade(ripe or crop, 1.2))


def pool(c, u0, v0, u1, v1, z=2):
    c.poly([(u0, v0, z), (u1, v0, z), (u1, v1, z), (u0, v1, z)], WHITE)
    c.poly([(u0 + 0.08, v0 + 0.08, z), (u1 - 0.08, v0 + 0.08, z), (u1 - 0.08, v1 - 0.08, z), (u0 + 0.08, v1 - 0.08, z)], (60, 170, 230))
    c.ld.polygon([c.P(u0 + 0.08, v0 + 0.08, z), c.P(u1 - 0.08, v0 + 0.08, z), c.P(u1 - 0.08, v1 - 0.08, z), c.P(u0 + 0.08, v1 - 0.08, z)], fill=A((80, 200, 255), 110))
    for k in range(3):
        a, b = c.P(u0 + 0.2 + k * 0.25, v0 + 0.2 + k * 0.1, z), c.P(u0 + 0.35 + k * 0.25, v0 + 0.2 + k * 0.1, z)
        ln(c, [a, b], (150, 220, 250), 1, (150, 230, 255))


def water(c, u0, v0, u1, v1, key):
    """A basin cut into the plate: water a little below the quay, the quay wall on its far edge."""
    c.poly([(u0, v0, 0), (u1, v0, 0), (u1, v1, 0), (u0, v1, 0)], WATER)
    face(c, "R", u0, v0, v1, 0, 2, CON_M, ao=False, edge=False)
    face(c, "L", v0, u0, u1, 0, 2, CON_M, ao=False, edge=False)
    for k in range(int((u1 - u0) * (v1 - v0) * 5)):
        x, y = c.P(u0 + 0.1 + hv(key, k) * (u1 - u0 - 0.2), v0 + 0.1 + hv(key, "v", k) * (v1 - v0 - 0.2), 0)
        ln(c, [(x, y), (x + 3, y)], (130, 190, 236) if k % 2 else WATER_D)


def ship(c, u0, v0, u1, v1, hull, boxes=0, key="ship"):
    """A cargo ship along v (bow at v1): a dark hull, a red waterline, containers on deck, a white bridge at the stern."""
    prism(c, u0, v0, u1, v1, 0, 9, hull, L=bands([(0, 2, RED_B), (8, 9, shade(hull, 1.3))]), R=bands([(0, 2, RED_B), (8, 9, shade(hull, 1.3))]), rim=0.03, ao=False)
    # the bow: a pointed deck
    m = (u0 + u1) / 2
    c.poly([(u0, v1, 0), (m, v1 + 0.3, 0), (m, v1 + 0.3, 9), (u0, v1, 9)], shade(hull, 0.9))
    c.poly([(m, v1 + 0.3, 0), (u1, v1, 0), (u1, v1, 9), (m, v1 + 0.3, 9)], shade(hull, 0.72))
    c.poly([(u0, v1, 9), (m, v1 + 0.3, 9), (u1, v1, 9)], shade(hull, 1.2))
    sv = v0 + 0.45
    prism(c, u0 + 0.06, v0 + 0.06, u1 - 0.06, sv, 9, 22, WHITE, L=punched(key + "b", bay=4, floor=4, ww=2, wh=2, p=0.8, lo=3), R=punched(key + "br", bay=4, floor=4, ww=2, wh=2, p=0.8, lo=3), ao=False)
    x, y = c.P(m, v0 + 0.2, 22)
    ln(c, [(x, y), (x, y - 6)], STEEL_D)
    beacon(c, m, v0 + 0.2, 29, (255, 240, 200), 2)
    vv = sv + 0.08
    k = 0
    while vv + 0.5 < v1 - 0.05 and k < boxes:
        for tier in range(1 + (k % 2)):
            container(c, u0 + 0.08, vv, SHIRTS[(k + tier) % 5], along_u=False, z=9 + tier * 6)
            if u1 - u0 > 0.6:
                container(c, u0 + 0.36, vv, SHIRTS[(k + tier + 2) % 5], along_u=False, z=9 + tier * 6)
        vv += 0.55
        k += 1


def gantry(c, u, v, h, reach, col=ORANGE):
    """A ship-to-shore gantry crane: four legs straddling the quay (u .. u+0.5, v .. v+0.4), a boom out along +u to
    u = reach (over the water)."""
    legs = [(u, v), (u, v + 0.4), (u + 0.5, v), (u + 0.5, v + 0.4)]
    for pu, pv in legs:
        prism(c, pu, pv, pu + 0.06, pv + 0.06, 2, 2 + h, col, rim=0, ao=True)
    prism(c, u - 0.02, v - 0.02, u + 0.58, v + 0.48, 2 + h, 2 + h + 4, col, rim=0, ao=False)
    prism(c, u - 0.5, v + 0.14, reach, v + 0.3, 2 + h + 8, 2 + h + 11, shade(col, 1.05), rim=0, ao=False)
    prism(c, u + 0.05, v + 0.1, u + 0.45, v + 0.34, 2 + h + 4, 2 + h + 10, WHITE, R=punched("gc", bay=3, floor=6, ww=2, wh=2, p=1, lo=2), rim=0, ao=False)
    a = c.P(u + 0.25, v + 0.22, 2 + h + 18)
    ln(c, [c.P(u - 0.5, v + 0.22, 2 + h + 11), a, c.P(reach, v + 0.22, 2 + h + 11)], shade(col, 0.8))
    ln(c, [c.P(u + 0.25, v + 0.22, 2 + h + 10), a], shade(col, 0.8))
    x, y = c.P(reach - 0.3, v + 0.22, 2 + h + 8)
    ln(c, [(x, y), (x, y + 12)], CHAR)
    rect(c, (x - 2, y + 12, x + 2, y + 14), CHAR)
    beacon(c, u + 0.25, v + 0.22, 2 + h + 19, RED, 2)


def jib(c, u, v, h, col=YELLOW):
    """A small dockside crane: one post, a jib out over the water, a hook."""
    prism(c, u, v, u + 0.1, v + 0.1, 2, 2 + h, col, rim=0)
    prism(c, u - 0.06, v - 0.06, u + 0.16, v + 0.16, 2 + h, 2 + h + 4, shade(col, 0.95), rim=0, ao=False)
    a, b = c.P(u + 0.05, v + 0.05, 2 + h + 4), c.P(u + 0.95, v + 0.05, 2 + h + 2)
    ln(c, [a, b], shade(col, 0.85), 2)
    ln(c, [c.P(u + 0.05, v + 0.05, 2 + h + 9), b], shade(col, 0.7))
    ln(c, [c.P(u + 0.05, v + 0.05, 2 + h + 4), c.P(u + 0.05, v + 0.05, 2 + h + 9)], shade(col, 0.7))
    ln(c, [b, (b[0], b[1] + 10)], CHAR)
    c.put(b[0] - 1, b[1] + 11, CHAR)
    c.put(b[0], b[1] + 11, CHAR)


def mast(c, u, v, z0, h, w0=4, w1=1, reds=0, top=RED, dishes=0, panels=0):
    """A lattice phone mast with panel antennas and dishes; red lights up its height at night."""
    lattice(c, u, v, z0, z0 + h, w0, w1, STEEL_M, 5)
    x, y = c.P(u, v, z0 + h)
    ln(c, [(x, y), (x, y - 6)], STEEL_D)
    for k in range(panels):
        yy = y + 4 + (k // 3) * 10
        for dx in (-4, 0, 3):
            rect(c, (x + dx, yy, x + dx + 1, yy + 5), WHITE)
    for k in range(dishes):
        yy = y + 10 + k * 8
        dx = -5 if k % 2 else 4
        ell(c, (x + dx - 2, yy - 3, x + dx + 2, yy + 3), shade(WHITE, 0.85))
        ell(c, (x + dx - 1, yy - 2, x + dx + 2, yy + 2), WHITE)
    for k in range(reds):
        yy = y + (k + 1) * h // (reds + 1)
        c.put(x - 2, yy, RED, RED)
        c.put(x + 2, yy, RED, RED)
        glow(c, x, yy, RED, 3, 90)
    c.put(x, y - 7, top, top)
    glow(c, x, y - 7, top, 3, 140)


def pole(c, u, v, h=22, z=2, meter=False):
    x, y = c.P(u, v, z)
    ln(c, [(x, y), (x, y - h)], WOOD_D)
    ln(c, [(x - 3, y - h + 2), (x + 3, y - h + 2)], WOOD_D)
    for dx in (-3, 3):
        c.put(x + dx, y - h + 1, WHITE)
    if meter:
        rect(c, (x - 1, y - 9, x + 1, y - 6), CON_L)
        c.put(x, y - 8, LED, LED)
    return (x, y - h + 2)


def wires(c, pts, sag=3):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for dx in (-3, 3):
            seg = [(round(x0 + dx + (x1 - x0) * t / 6), round(y0 + (y1 - y0) * t / 6 + sag * 4 * (t / 6) * (1 - t / 6))) for t in range(7)]
            c.d.line(seg, fill=A(CHAR))


def heart(c, x, y, col=(226, 52, 72), lit=(255, 90, 110)):
    for r, row in enumerate([".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."]):
        for j, p in enumerate(row):
            if p == "X":
                c.put(x + j, y + r, col, lit)


def balloon(c, x, y, col, h=8):
    ln(c, [(x, y), (x, y - h)], (200, 200, 210))
    ell(c, (x - 2, y - h - 5, x + 2, y - h), col)
    c.put(x - 1, y - h - 4, shade(col, 1.4))


def sign_board(c, u, v, a, b, z0, z1, col, word, txt=WHITE, lit=True, posts=True):
    """A board on two posts facing the street (side L at v = v, u from a to b), with a word on it."""
    if posts:
        for pu in (a + 0.06, b - 0.06):
            x, y = c.P(pu, v, 2)
            ln(c, [(x, y), (x, y - (z0 - 2))], STEEL_D)
    face(c, "L", v, a, b, z0, z1, col, bands([(0, 1, shade(col, 0.7)), (z1 - z0 - 1, z1 - z0, shade(col, 0.7))]), ao=False, edge=False)
    text_on(c, word, "L", v, a, b, z1 - 2, txt, txt if lit else None)


def person_with(c, u, v, shirt, thing, z=2):
    """A figure holding something: 'cam' a film camera, 'clip' a clipboard, 'phone' a lit phone, 'paper'."""
    person(c, u, v, shirt, z)
    x, y = c.P(u, v, z)
    if thing == "cam":
        rect(c, (x + 2, y - 7, x + 5, y - 5), CHAR)
        c.put(x + 6, y - 6, GLASS_L)
    elif thing == "clip":
        rect(c, (x + 2, y - 5, x + 3, y - 3), WOOD)
        c.put(x + 2, y - 5, PAPER)
    elif thing == "phone":
        c.put(x + 2, y - 5, (110, 200, 255), (110, 200, 255))
    elif thing == "paper":
        rect(c, (x + 2, y - 5, x + 4, y - 3), PAPER)


def drone(c, x, y):
    ln(c, [(x - 3, y - 1), (x + 3, y + 1)], CHAR)
    ln(c, [(x - 3, y + 1), (x + 3, y - 1)], CHAR)
    for dx, dy in ((-3, -1), (3, 1), (-3, 1), (3, -1)):
        c.put(x + dx, y + dy - 1, STEEL_M)
    c.put(x - 1, y + 1, LED, LED)
    c.put(x + 1, y + 1, RED, RED)


def robot_arm(c, u, v, z=2, col=ORANGE, reach=1):
    x, y = c.P(u, v, z)
    rect(c, (x - 2, y - 2, x + 2, y), CHAR)
    pts = [(x, y - 2), (x + 2 * reach, y - 9), (x + 7 * reach, y - 11), (x + 9 * reach, y - 7)]
    ln(c, pts, col, 2)
    c.put(x + 2 * reach, y - 9, shade(col, 0.7))
    c.put(x + 7 * reach, y - 11, shade(col, 0.7))
    ln(c, [(x + 8 * reach, y - 6), (x + 10 * reach, y - 6)], CHAR)


def forklift(c, u, v, z=2):
    prism(c, u, v, u + 0.24, v + 0.16, z + 1, z + 6, ORANGE, rim=0, ao=False)
    x, y = c.P(u + 0.24, v + 0.08, z)
    ln(c, [(x + 1, y), (x + 1, y - 11)], CHAR)
    ln(c, [(x + 1, y - 1), (x + 5, y + 1)], CHAR)
    prism(c, u + 0.27, v - 0.02, u + 0.48, v + 0.2, z + 2, z + 6, (200, 156, 104), rim=0, ao=False)
    x, y = c.P(u + 0.06, v + 0.16, z)
    c.put(x, y - 1, CHAR)


def lorry(c, u, v, col, along_u=True, z=2, band=None, cab=(59, 130, 246)):
    """A lorry: a long box trailer (0.8 tiles) and a cab at the front (+u or +v) with a windscreen."""
    bd = band and bands([(5, 7, band)])
    win = lambda i, n, zz, h, b, s: (GLASS_L, None) if zz >= 6 and 0 < i < n - 1 else None  # noqa: E731
    if along_u:
        shadow(c, u, v, u + 1.05, v + 0.34, 0.1)
        prism(c, u, v, u + 0.8, v + 0.34, z + 2, z + 14, col, L=bd, R=bd, rim=0, ao=False)
        prism(c, u + 0.82, v + 0.02, u + 1.05, v + 0.32, z + 1, z + 11, cab, R=win, rim=0, ao=False)
        wh = [(u + 0.15, v + 0.34), (u + 0.6, v + 0.34), (u + 0.95, v + 0.32)]
    else:
        shadow(c, u, v, u + 0.34, v + 1.05, 0.1)
        prism(c, u, v, u + 0.34, v + 0.8, z + 2, z + 14, col, L=bd, R=bd, rim=0, ao=False)
        prism(c, u + 0.02, v + 0.82, u + 0.32, v + 1.05, z + 1, z + 11, cab, L=win, rim=0, ao=False)
        wh = [(u + 0.34, v + 0.15), (u + 0.34, v + 0.6), (u + 0.32, v + 0.95)]
    for wu, wv in wh:
        x, y = c.P(wu, wv, z)
        rect(c, (x - 1, y - 2, x + 1, y), CHAR)


def play_sign(red=(226, 40, 50), lit=True):
    """A play button: a white triangle pointing along the wall on a red panel."""
    def g(i, n, z, h, base, s):
        if i == 0 or i == n - 1 or z == 0 or z == h - 1:
            return shade(red, 0.7), None
        px, pz = (i + 0.5) / n, (z + 0.5) / h
        if 0.34 < px < 0.7 and abs(pz - 0.5) < (0.7 - px) * 1.25:
            return WHITE, (WHITE if lit else None)
        return red, ((255, 70, 80) if lit else None)
    return g


def three_screens(i, n, z, h, base, s):
    """A phone, a laptop and a telly in a row, showing the same picture."""
    pic = lambda zz, top: (((255, 120, 80) if zz > top - 3 else (90, 170, 255)), (140, 200, 255))  # noqa: E731
    k = i * 10 // max(1, n)
    if k == 1 and 2 <= z < 8:
        return pic(z, 8)
    if 3 <= k <= 5 and 3 <= z < 7:
        return pic(z, 7)
    if 3 <= k <= 5 and z == 2:
        return STEEL_M, None
    if 7 <= k <= 8 and 3 <= z < 9:
        return pic(z, 9)
    return None


# ── Streaming studio (4x4) ─────────────────────────────────────────────────────────────────────────────────────────

def lm_studio(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"studio{level}", worn=level == 0)
    brick = BRICK if level else shade(BRICK, 0.86)
    bm = masonry(4, 7, 0.88)
    if level == 0:
        tree(c, 0.6, 0.7, 1.0)
    if level >= 2:  # the second sound stage across the back, its curved roof
        su0, sv0, su1, sv1 = (0.3, 0.3, 3.7, 1.1) if level == 2 else (1.75, 0.3, 3.7, 1.4)
        block(c, su0, sv0, su1, sv1, 20, (214, 210, 200), L=combine(top_band(2, MAGENTA), ribs(4)), R=combine(top_band(2, MAGENTA), ribs(4)), roof=False)
        vault(c, su0, sv0, su1, sv1, 22, 7, (196, 200, 210))
        if level == 3:
            for k, u in enumerate((2.1, 2.75, 3.35)):
                dish(c, u, 0.85, 26, 5 if k != 1 else 6)
    if level == 3:  # the glass tower with the giant play screen
        tu0, tv0, tu1, tv1, th = 0.3, 0.3, 1.5, 1.45, 80
        dark = (54, 60, 84)
        block(c, tu0, tv0, tu1, tv1, th, dark,
              L=combine(top_band(3, MAGENTA), glass("stT", bay=4, floor=6, p=0.55, lo=2, hi=th - 4, palette={"L": ((70, 90, 140), (100, 130, 190), (150, 180, 230)), "R": ((50, 64, 110), (70, 90, 140), (100, 130, 190))})),
              R=combine(top_band(3, MAGENTA), glass("stTr", bay=4, floor=6, p=0.5, lo=2, hi=th - 4, palette={"L": ((70, 90, 140), (100, 130, 190), (150, 180, 230)), "R": ((50, 64, 110), (70, 90, 140), (100, 130, 190))})))
        face(c, "L", tv1, tu0 + 0.14, tu1 - 0.14, th - 30, th - 6, (226, 40, 50), play_sign(), ao=False, edge=False)
        dish(c, 0.7, 0.75, 2 + th, 5)
        x, y = c.P(1.1, 0.8, 2 + th)
        ln(c, [(x, y), (x, y - 10)], STEEL_D)
        beacon(c, 1.1, 0.8, 2 + th + 11)
    # the main stage: brick, a roller door, the "now filming" lamp above it
    if level == 0:
        u0, v0, u1, v1, h = 1.3, 1.2, 2.9, 2.5, 14
    elif level == 1:
        u0, v0, u1, v1, h = 1.0, 0.9, 2.9, 2.5, 18
    elif level == 2:
        u0, v0, u1, v1, h = 0.5, 1.35, 2.7, 2.6, 22
    else:
        u0, v0, u1, v1, h = 1.75, 1.65, 3.6, 2.7, 22
    block(c, u0, v0, u1, v1, h, brick, L=combine(top_band(2, shade(brick, 1.12)), bm),
          R=combine(top_band(2, shade(brick, 1.12)), three_screens if level >= 2 else None, bm))
    du0 = u0 + 0.25
    roller(c, "L", v1, du0, du0 + 0.6, 2, 13, STEEL_M if level else shade(STEEL_M, 0.85))
    x, y = c.P(du0 + 0.3, v1, 15)
    rect(c, (x - 2, y - 2, x + 2, y), (190, 30, 40), (255, 60, 60))
    glow(c, x, y - 1, (255, 60, 60), 4, 120)
    if level >= 1:  # the play-button sign over the door
        face(c, "L", v1, du0 + 0.75, du0 + 1.2, 6, 16, (226, 40, 50), play_sign(), ao=False, edge=False)
    if level < 3:
        dish(c, u0 + 0.5 * (u1 - u0), v0 + 0.4, 2 + h, 5 if level == 0 else 6)
        if level >= 1:
            plant(c, u1 - 0.7, v0 + 0.15, u1 - 0.1, v0 + 0.6, 2 + h, f"st{level}p", n=1)
    else:
        plant(c, u0 + 0.2, v0 + 0.1, u1 - 0.2, v1 - 0.2, 2 + h, "st3p", n=2)
    if level >= 1:  # the film reel rack by the wall
        ru, rv = (u1 + 0.12, v0 + 0.2)
        prism(c, ru, rv, ru + 0.12, rv + 0.5, 2, 14, WOOD_D, roof=False, ao=False)
        for k in range(2):
            x, y = c.P(ru + 0.12, rv + 0.15 + k * 0.22, 8 + (k % 2) * 3)
            ell(c, (x - 3, y - 3, x + 3, y + 3), CHAR)
            c.put(x, y, STEEL)
            c.put(x - 2, y, STEEL_M)
            c.put(x + 1, y - 2, STEEL_M)
    if level == 1:
        van(c, 3.2, 2.6, WHITE, along_u=False, band=MAGENTA)
        tree(c, 0.5, 2.8, 1.0)
        lamp(c, 0.4, 3.6)
    elif level == 2:  # the cold store for old reels (front left), the van
        block(c, 0.3, 2.95, 1.2, 3.65, 11, (226, 238, 246), L=combine(top_band(2, BLUE_L), bands([(4, 5, BLUE_L)])), R=combine(top_band(2, BLUE_L), ribs(3)))
        text_on(c, "COLD", "L", 3.65, 0.3, 1.2, 10, NAVY)
        van(c, 3.2, 2.7, WHITE, along_u=False, band=MAGENTA)
        crowd(c, [(1.6, 3.0), (1.85, 3.15)], "st2c")
        lamp(c, 2.4, 3.6)
    elif level == 3:  # the red carpet with rope posts, crews with cameras, the premiere crowd, the van
        cu0, cu1 = 2.2, 2.55
        c.poly([(cu0, 2.72, 2), (cu1, 2.72, 2), (cu1, 3.9, 2), (cu0, 3.9, 2)], (196, 30, 44))
        for k in range(4):
            for uu in (cu0 - 0.06, cu1 + 0.06):
                x, y = c.P(uu, 2.95 + k * 0.28, 2)
                ln(c, [(x, y), (x, y - 4)], GOLD_D)
                c.put(x, y - 5, GOLD, (255, 214, 110))
        crowd(c, [(1.4, 3.0), (1.55, 3.3), (1.3, 3.55), (1.7, 3.7), (2.85, 3.2), (3.0, 3.5)], "st3c")
        person_with(c, 1.8, 2.95, CHAR, "cam")
        person_with(c, 2.95, 2.9, CHAR, "cam")
        van(c, 0.4, 2.0, WHITE, along_u=False, band=MAGENTA)
        dish(c, 0.57, 2.3, 14, 4)
        tree(c, 0.6, 3.5, 0.9)
        lamp(c, 3.7, 3.7)
    else:
        van(c, 3.1, 2.75, shade(WHITE, 0.9), along_u=False)
        fence(c, 0.4, 3.6, 2.2, 3.6, broken=True)
        lamp(c, 3.6, 3.6, col=(255, 210, 140))
    return c


# ── Game studio (4x4) ──────────────────────────────────────────────────────────────────────────────────────────────

def mascot(c, x, y, col=(110, 220, 120), lit=True):
    """A little pixel monster (a made-up mascot): two eyes, a grin, little legs."""
    rows = ["..XXXX..", ".XXXXXX.", "XXoXXoXX", "XXXXXXXX", "XX.XX.XX", ".XXXXXX.", ".X....X."]
    for r, row in enumerate(rows):
        for j, p in enumerate(row):
            if p == "X":
                c.put(x + j, y + r, col, col if lit else None)
            elif p == "o":
                c.put(x + j, y + r, WHITE, WHITE if lit else None)
            elif p == "." and r == 4:
                c.put(x + j, y + r, CHAR)


def joystick(c, x, y):
    rect(c, (x - 3, y - 1, x + 3, y + 1), CHAR)
    ln(c, [(x, y - 1), (x + 1, y - 5)], STEEL_D)
    ell(c, (x - 1, y - 8, x + 2, y - 5), (226, 52, 60), (255, 80, 80))
    c.put(x + 3, y - 2, YELLOW, YELLOW)


def cabinet(c, u0, v0, u1, v1, z0, h, col, key):
    """One arcade cabinet storey: a coloured box, a glowing screen and buttons on each face."""
    def scr(i, n, z, hh, base, s):
        if 1 < i < n - 2 and hh * 0.35 <= z < hh - 2:
            return (((90, 230, 255) if (i + z + int(hv(key, i // 3) * 3)) % 4 else (255, 120, 220)), (110, 230, 255))
        if 1 < i < n - 2 and z == int(hh * 0.25):
            return (YELLOW if i % 3 == 0 else shade(base, 0.7)), (YELLOW if i % 3 == 0 else None)
        return None
    prism(c, u0, v0, u1, v1, z0, z0 + h, col, L=combine(top_band(1, shade(col, 1.3)), scr), R=combine(top_band(1, shade(col, 1.3)), scr), ao=z0 <= 2)


def lm_games(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"games{level}", worn=level == 0)
    if level <= 1:
        tree(c, 0.5, 0.6, 1.0)
    if level == 3:  # the tower of stacked arcade cabinets on the back, a leaderboard on top
        cols = [(139, 92, 246), (226, 52, 120), (20, 170, 160), (59, 130, 246), (255, 153, 0), (139, 92, 246)]
        z = 2
        for k, col in enumerate(cols):
            d = 0.06 if k % 2 else 0.0
            cabinet(c, 0.4 + d, 0.4 + d, 1.6 - d, 1.55 - d, z, 13, col, f"gT{k}")
            z += 13
        bu, bv = 1.0, 0.97
        for pu in (0.65, 1.35):
            x, y = c.P(pu, bv, z)
            ln(c, [(x, y), (x, y - 5)], STEEL_D)
        screen(c, "L", bv, 0.55, 1.45, z + 5, z + 16, "gLb", YELLOW, kind="bars")
        mascot(c, *c.P(0.95, 1.55, 40), col=(110, 230, 120))
    # the office over the shop (two floors from level 2)
    if level <= 1:
        u0, v0, u1, v1, h = 1.2, 1.1, 2.7, 2.4, 22
    elif level == 2:
        u0, v0, u1, v1, h = 0.8, 0.8, 2.9, 2.4, 36
    else:
        u0, v0, u1, v1, h = 1.9, 0.55, 3.6, 2.2, 30
    wall = (232, 222, 206) if level else shade((232, 222, 206), 0.88)
    up = 13

    def upstairs(i, n, z, hh, b, s):
        if z < up or z >= hh - 2:
            return None
        if level == 0:  # one window glowing blue among dark ones
            k = i * 4 // max(1, n)
            if (z - up) % 10 < 5 and 1 <= (z - up) % 10 and i % (n // 4 or 1) > 1:
                return ((70, 140, 255), (90, 160, 255)) if k == 1 and s == "L" else (GLASS_DK, None)
            return None
        if (z - up) % 10 < 6 and 1 <= (z - up) % 10 and 1 < i < n - 2:  # rows of glowing screens
            return (((80, 160, 255) if i % 3 else (150, 110, 250)), (110, 180, 255)) if i % 3 != 2 else (CHAR, None)
        return None
    shopfront = lambda i, n, z, hh, b, s: ((GLASS_L if s == "L" else GLASS_DK), (LIT if level else (190, 160, 110))) if 2 <= z < 10 and n * 0.1 < i < n * 0.55 else None  # noqa: E731
    block(c, u0, v0, u1, v1, h, wall, L=combine(top_band(2, PURPLE), bands([(11, 12, PURPLE)]), shopfront, upstairs),
          R=combine(top_band(2, PURPLE), bands([(11, 12, PURPLE)]), upstairs))
    face(c, "L", v1, u1 - 0.45, u1 - 0.2, 2, 11, NAVY_D, lambda i, n, z, hh, b, s: ((GLASS_DK, LIT) if 0 < i < n - 1 and 4 < z < hh - 1 else None), ao=False)
    jx, jy = c.P(u1 - 0.32, v1 + 0.05, 13)
    joystick(c, jx, jy - 1)
    plant(c, u0 + 0.2, v0 + 0.1, u1 - 0.3, v1 - 0.4, 2 + h, f"g{level}p", n=1)
    if level >= 1:  # the mascot board on the roof, the launch banner, a rocket balloon
        mu, mv = u0 + 0.3, v1 - 0.25
        for pu in (mu, mu + 0.6):
            x, y = c.P(pu, mv, 2 + h)
            ln(c, [(x, y), (x, y - 5)], STEEL_D)
        face(c, "L", mv, mu - 0.05, mu + 0.7, 2 + h + 5, 2 + h + 17, (40, 36, 70), bands([(0, 1, PURPLE), (11, 12, PURPLE)]), ao=False, edge=False)
        x, y = c.P(mu + 0.12, mv, 2 + h + 15)
        mascot(c, x + 1, y + 2)
        if level <= 2:
            bz = 14 if level == 1 else 24
            face(c, "L", v1 + 0.02, u0 + 0.05, u1 - 0.5, bz, bz + 7, YELLOW, bands([(0, 1, GOLD_D), (6, 7, GOLD_D)]), ao=False, edge=False)
            text_on(c, "LAUNCH", "L", v1 + 0.02, u0 + 0.05, u1 - 0.5, bz + 6, NAVY)
        x, y = c.P(u1 - 0.2, v0 + 0.3, 2 + h)
        ln(c, [(x, y), (x + 2, y - 12)], (200, 200, 210))
        rx, ry = x + 2, y - 13  # the rocket balloon: a pointed nose, a round window, fins, a flame
        for r, row in enumerate(["..X..", ".XXX.", ".XWX.", ".XXX.", ".XXX.", "XXXXX", "X.F.X"]):
            for j, p in enumerate(row):
                if p != ".":
                    c.put(rx - 2 + j, ry - 7 + r, {"X": (230, 60, 60), "W": (150, 220, 255), "F": ORANGE}[p])
    if level == 2:  # the countdown clock on the side wall, fans queueing with phones
        face(c, "R", u1, v0 + 0.3, v0 + 1.1, 22, 30, CHAR, ao=False, edge=False)
        text_on(c, "10:00", "R", u1, v0 + 0.3, v0 + 1.1, 28, (255, 80, 80), (255, 90, 90))
        for k in range(5):
            person_with(c, 1.0 + k * 0.3, 2.75 + 0.05 * (k % 2), SHIRTS[k % 7], "phone")
        lamp(c, 3.6, 3.6)
        tree(c, 3.5, 2.8, 0.9)
    if level == 3:  # the trophy statue, the esports stage with its screen, fans
        x, y = c.P(2.6, 2.6, 2)
        prism(c, 2.5, 2.5, 2.7, 2.7, 2, 7, STONE, rim=0)
        ell(c, (x - 3, y - 15, x + 3, y - 9), GOLD, (255, 214, 110))
        rect(c, (x - 1, y - 9, x + 1, y - 6), GOLD_D)
        c.put(x - 4, y - 13, GOLD)
        c.put(x + 4, y - 13, GOLD)
        su0, sv0, su1, sv1 = 0.4, 2.0, 1.7, 2.9
        prism(c, su0, sv0, su1, sv1, 2, 6, CHAR, L=bands([(1, 2, PURPLE)]), rim=0)
        screen(c, "L", sv0 + 0.1, su0 + 0.15, su1 - 0.15, 8, 22, "gStage", (90, 230, 255), kind="bars")
        for pu in (su0 + 0.15, su1 - 0.15):
            x, y = c.P(pu, sv0 + 0.1, 6)
            ln(c, [(x, y), (x, y - 16)], STEEL_D)
        for k in range(2):
            person(c, 0.8 + k * 0.5, 2.5, SHIRTS[k + 3], z=6)
            x, y = c.P(0.95 + k * 0.5, 2.45, 9)
            rect(c, (x, y, x + 2, y + 1), (90, 200, 255), (90, 200, 255))
        for k, col in enumerate((PURPLE, MAGENTA, TEAL)):
            c.ld.polygon([c.P(su0 + 0.3 + k * 0.4, sv1, 22), c.P(su0 + 0.15 + k * 0.4, sv1, 6), c.P(su0 + 0.45 + k * 0.4, sv1, 6)], fill=A(col, 70))
        crowd(c, [(0.6, 3.2), (0.9, 3.35), (1.25, 3.2), (1.6, 3.4), (2.0, 3.25), (2.9, 3.0)], "g3c")
        lamp(c, 3.7, 3.7)
    if level <= 1:
        bike(c, 2.9, 2.6)
        lamp(c, 3.5, 3.5, col=LIT if level else (255, 210, 140))
        if level == 0:
            fence(c, 0.4, 3.6, 2.4, 3.6, broken=True)
            parcels(c, 0.8, 2.6, n=2, key="g0b")
        else:
            crowd(c, [(1.5, 2.85), (1.9, 2.95)], "g1c")
    return c


# ── News office (4x4) ──────────────────────────────────────────────────────────────────────────────────────────────

def papers(c, u, v, n=2, z=2):
    for k in range(n):
        prism(c, u + k * 0.05, v + k * 0.12, u + 0.2 + k * 0.05, v + 0.12 + k * 0.12, z + k * 2, z + 3 + k * 2, PAPER, L=bands([(1, 2, (190, 180, 160))]), rim=0, ao=False)


def phone_sign(c, side, fixed, a, z0, lit=True):
    """A phone-shaped sign on a wall: a dark rounded body, a glowing screen with headline lines."""
    def g(i, n, z, h, base, s):
        if (i in (0, n - 1)) and (z in (0, h - 1)):
            return None
        if i == 0 or i == n - 1 or z <= 1 or z >= h - 2:
            return CHAR, None
        if z % 3 == 0 and i < n - 2:
            return WHITE, WHITE if lit else None
        return (80, 160, 255), ((100, 180, 255) if lit else None)
    face(c, side, fixed, a, a + 0.42, z0, z0 + 14, CHAR, g, ao=False, edge=False)


def horn(c, x, y):
    """A speaker horn on a post, its bell to the left."""
    ln(c, [(x, y), (x, y - 6)], STEEL_D)
    c.d.polygon([(x, y - 7), (x - 6, y - 11), (x - 6, y - 3)], fill=A(STEEL_M))
    ln(c, [(x - 6, y - 11), (x - 6, y - 3)], STEEL)


def lm_news(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"news{level}", worn=level == 0)
    if level <= 2:
        tree(c, 0.5, 0.6, 1.0)
    if level == 3:  # the media tower with its wraparound headline screen and a rooftop clock; the press hall
        tu0, tv0, tu1, tv1, th = 0.35, 0.35, 1.55, 1.5, 84
        clad = (210, 214, 222)
        for side_key in ("L", "R"):
            pass
        block(c, tu0, tv0, tu1, tv1, th, clad,
              L=combine(top_band(3, NAVY), glass("nwT", bay=4, floor=6, p=0.5, lo=2, hi=th - 4)),
              R=combine(top_band(3, NAVY), glass("nwTr", bay=4, floor=6, p=0.45, lo=2, hi=th - 4)))
        screen(c, "L", tv1, tu0, tu1, th - 22, th - 13, "nwH", (255, 200, 60), kind="ticker")
        screen(c, "R", tu1, tv0, tv1, th - 22, th - 13, "nwHr", (255, 200, 60), kind="ticker")
        x, y = c.P((tu0 + tu1) / 2, tv1, th - 4)
        clock(c, x, y - 1, 4)
        x, y = c.P(0.95, 0.9, 2 + th)
        ln(c, [(x, y), (x, y - 12)], STEEL_D)
        beacon(c, 0.95, 0.9, 2 + th + 13)
        dish(c, 0.6, 0.65, 2 + th, 5)
        # the press hall: a sawtooth roof, the press seen through its window, paper rolls outside
        pu0, pv0, pu1, pv1 = 1.85, 0.35, 3.65, 1.45
        press = lambda i, n, z, hh, b, s: (((STEEL_D if (i // 3) % 2 else (70, 76, 90)) if z < 7 else (PAPER if z == 7 else GLASS_DK)), (LIT if z >= 8 else None)) if 1 < i < n - 2 and 2 <= z < 12 else None  # noqa: E731
        block(c, pu0, pv0, pu1, pv1, 16, (196, 200, 206), L=combine(top_band(2, NAVY), press), R=combine(top_band(2, NAVY), ribs(3)), roof=False)
        for k in range(4):
            a = pu0 + k * (pu1 - pu0) / 4
            b = a + (pu1 - pu0) / 4
            c.poly([(a, pv0, 18), (b, pv0, 18), (b, pv0, 24), (a, pv0, 24)], STEEL_M)
            c.poly([(a, pv0, 24), (b, pv0, 18), (b, pv1, 18), (a, pv1, 24)], (176, 182, 192))
            c.poly([(b, pv0, 18), (b, pv1, 18), (b, pv1, 18), (b, pv0, 24)], GLASS_M)
            face(c, "R", b, pv0, pv1, 18, 19, (176, 182, 192), ao=False, edge=False)
        for k in range(3):
            drum(c, 3.35 + (k % 2) * 0.12, 1.7 + k * 0.25, 2, 10, 0.12, PAPER, capcol=(214, 206, 186))
    # the office: two storeys, the NEWS sign over the door
    if level <= 1:
        u0, v0, u1, v1, h = 1.2, 1.1, 2.7, 2.4, 22
    elif level == 2:
        u0, v0, u1, v1, h = 0.9, 0.9, 2.6, 2.4, 28
    else:
        u0, v0, u1, v1, h = 0.4, 1.8, 2.3, 2.85, 20
    wall = BRICK if level else shade(BRICK, 0.85)
    block(c, u0, v0, u1, v1, h, wall, L=combine(top_band(2, CREAM), punched(f"nw{level}", bay=7, floor=10, ww=4, wh=5, p=0.6 if level else 0.3, lo=12), masonry(4, 7, 0.88)),
          R=combine(top_band(2, CREAM), punched(f"nw{level}r", bay=7, floor=10, ww=4, wh=5, p=0.55 if level else 0.25, lo=2), masonry(4, 7, 0.88)))
    m = (u0 + u1) / 2
    face(c, "L", v1, m - 0.15, m + 0.15, 2, 11, NAVY_D, lambda i, n, z, hh, b, s: ((GLASS_DK, LIT if level else None) if 0 < i < n - 1 and 4 < z < hh - 1 else None), ao=False)
    board = WOOD if level == 0 else NAVY
    face(c, "L", v1, m - 0.45, m + 0.45, 11, 18, board, bands([(0, 1, shade(board, 0.7)), (6, 7, shade(board, 0.7))]), ao=False, edge=False)
    text_on(c, "NEWS", "L", v1, m - 0.45, m + 0.45, 17, CREAM if level == 0 else WHITE, None if level == 0 else WHITE)
    papers(c, m - 0.5, v1 + 0.08, 2 if level < 3 else 3)
    if level >= 1:  # a ticker along the top, a phone sign on the corner, a reporter
        screen(c, "L", v1, u0 + 0.05, u1 - 0.05, h - 3, h + 1, f"nwTk{level}", (255, 200, 60), kind="ticker")
        phone_sign(c, "R", u1, v1 - 0.6, 5)
        person_with(c, m + 0.5, v1 + 0.3, NAVY, "clip")
    if level == 2:  # the ON AIR booth on the side, the horn on the roof, headphones in a window
        bu0, bv0, bu1, bv1 = 2.85, 1.3, 3.6, 2.2
        block(c, bu0, bv0, bu1, bv1, 13, (70, 76, 96), L=combine(top_band(2, (226, 52, 60)), glass("nwB", bay=6, floor=12, p=0.9, lo=3, hi=11)), R=top_band(2, (226, 52, 60)))
        face(c, "L", bv1, bu0 + 0.08, bu1 - 0.08, 15, 21, (190, 30, 40), bands([(0, 1, (140, 20, 30))]), ao=False, edge=False)
        text_on(c, "ON AIR", "L", bv1, bu0 + 0.08, bu1 - 0.08, 20, WHITE, (255, 120, 120))
        glow(c, *c.P((bu0 + bu1) / 2, bv1, 18), (255, 60, 60), 7, 70)
        x, y = c.P(bu0 + 0.35, bv1, 8)
        c.d.arc((x - 3, y - 3, x + 3, y + 3), 180, 360, fill=A(CHAR))
        c.put(x - 3, y, CHAR)
        c.put(x + 3, y, CHAR)
        horn(c, *c.P(u0 + 0.4, v0 + 0.4, 2 + h))
        crowd(c, [(1.4, 2.9), (2.2, 3.1)], "nw2c")
    if level == 3:  # the satellite van, readers with phones and papers
        van(c, 2.75, 2.2, WHITE, along_u=False, band=NAVY)
        dish(c, 2.92, 2.5, 14, 5)
        horn(c, *c.P(u0 + 0.3, v0 + 0.3, 2 + h))
        for k in range(5):
            person_with(c, 0.6 + k * 0.35, 3.25 + 0.1 * (k % 2), SHIRTS[k], "phone" if k % 2 else "paper")
        bench(c, 2.4, 3.4)
        lamp(c, 3.7, 3.7)
    if level <= 1:
        bike(c, u1 + 0.15, v1 - 0.1, box=PAPER)
        lamp(c, 3.4, 3.4, col=LIT if level else (255, 210, 140))
        if level == 0:
            fence(c, 0.4, 3.6, 2.3, 3.6, broken=True)
    elif level == 2:
        lamp(c, 3.6, 3.6)
    return c


# ── Port (4x4) ─────────────────────────────────────────────────────────────────────────────────────────────────────

def jetty(c, u0, u1, v0, v1):
    for k in range(int((u1 - u0) / 0.2) + 1):
        x, y = c.P(u0 + k * 0.2, v1, 0)
        ln(c, [(x, y), (x, y - 2)], WOOD_D)
    n = int((u1 - u0) / 0.1)
    for k in range(n):
        a = u0 + k * (u1 - u0) / n
        c.poly([(a, v0, 2), (a + (u1 - u0) / n, v0, 2), (a + (u1 - u0) / n, v1, 2), (a, v1, 2)], WOOD if k % 2 else shade(WOOD, 0.9))
    face(c, "L", v1, u0, u1, 1, 2, WOOD_D, ao=False, edge=False)


def lm_port(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, col=(186, 186, 180), key=f"port{level}", worn=level == 0)
    water(c, 2.95, 0.05, 3.98, 3.98, f"portW{level}")
    for k in range(int(3.9 / 0.5)):  # bollards on the quay edge
        x, y = c.P(2.88, 0.3 + k * 0.5, 2)
        rect(c, (x - 1, y - 3, x, y), CHAR)
    if level == 3:
        ship(c, 3.1, 0.25, 3.85, 3.25, (40, 70, 110), boxes=5, key="shipL")
    elif level == 2:
        ship(c, 3.15, 0.55, 3.7, 2.4, (60, 90, 70), boxes=2, key="shipS")
    if level == 0:
        jetty(c, 2.95, 3.7, 2.0, 2.3)
    # the containers on the quay: three at first, a neat row, then tall stacks
    if level == 0:
        container(c, 1.5, 0.6, (196, 90, 60))
        container(c, 1.5, 0.88, (60, 120, 170))
        container(c, 1.5, 0.6, (90, 150, 90), z=8)
    elif level <= 2:
        for k in range(5):
            container(c, 0.9 + (k % 1) * 0.0, 0.3 + k * 0.27, SHIRTS[k % 5])
            if k % 2 == 0:
                container(c, 0.9, 0.3 + k * 0.27, SHIRTS[(k + 3) % 5], z=8)
        if level == 2:
            for k in range(4):
                container(c, 1.55, 0.3 + k * 0.27, SHIRTS[(k + 2) % 7])
    else:
        for row, uu in enumerate((0.95, 1.5)):
            for k in range(8):
                hgt = 1 + int(hv("stack", row, k) * (3 if row == 0 else 2))
                for t in range(hgt):
                    container(c, uu, 0.95 + k * 0.27 if row == 0 else 0.35 + k * 0.27, SHIRTS[int(hv("box", row, k, t) * 7)], z=2 + t * 6)
    if level == 3:  # the control tower on the back corner
        prism(c, 0.25, 0.25, 0.65, 0.65, 2, 46, CON_L, L=top_band(1, CON_M), R=top_band(1, CON_M))
        prism(c, 0.18, 0.18, 0.72, 0.72, 46, 56, GLASS_DK, L=glass("ptC", bay=3, floor=10, p=0.9, lo=1, hi=9), R=glass("ptCr", bay=3, floor=10, p=0.9, lo=1, hi=9), roofcol=CON_M)
        x, y = c.P(0.45, 0.45, 56)
        ln(c, [(x, y), (x, y - 8)], STEEL_D)
        beacon(c, 0.45, 0.45, 65)
    # the harbour office: a hut, then a lit arrivals board on its wall
    hu0, hv0, hu1, hv1 = (0.5, 2.3, 1.5, 3.1) if level < 3 else (0.3, 0.75, 0.85, 1.5)
    if level < 3:
        block(c, hu0, hv0, hu1, hv1, 11, (226, 220, 204) if level else shade((226, 220, 204), 0.88),
              L=combine(punched(f"pt{level}o", bay=7, floor=11, ww=4, wh=4, p=0.6, lo=2), solid()), R=combine(punched(f"pt{level}or", bay=7, floor=11, ww=4, wh=4, p=0.5, lo=2), solid()), roof=False)
        c.gable(hu0 - 0.05, hv0 - 0.05, hu1 + 0.05, hv1 + 0.06, 13, 6, (60, 110, 160))
        if level >= 1:
            screen(c, "R", hu1, hv0 + 0.15, hv1 - 0.15, 5, 11, f"ptB{level}", (255, 200, 60), kind="ticker")
    # cranes: one jib crane, then two, then two big gantries
    if level <= 2:
        jib(c, 2.55, 0.9, 20 if level == 0 else 24)
        if level >= 1:
            jib(c, 2.55, 2.4, 24, (226, 72, 64))
    else:
        gantry(c, 2.3, 0.6, 46, 3.75)
        gantry(c, 2.3, 2.1, 46, 3.75, col=(226, 72, 64))
    if level >= 2:  # the truck gate: a gatehouse, a barrier, a scanner booth, a waiting truck
        gu, gv = 1.2, 3.2
        block(c, gu, gv, gu + 0.45, gv + 0.45, 11, WHITE, L=combine(top_band(2, ORANGE), glass("ptG", bay=4, floor=10, p=0.9, lo=4, hi=9)), R=top_band(2, ORANGE))
        a, b = c.P(gu + 0.5, gv + 0.2, 7), c.P(gu + 1.3, gv + 0.2, 7)
        for k in range(4):
            t0, t1 = k / 4, (k + 1) / 4
            ln(c, [(round(a[0] + (b[0] - a[0]) * t0), round(a[1] + (b[1] - a[1]) * t0)), (round(a[0] + (b[0] - a[0]) * t1), round(a[1] + (b[1] - a[1]) * t1))], RED if k % 2 == 0 else WHITE, 2)
        prism(c, 2.3, gv - 0.05, 2.55, gv + 0.2, 2, 12, (59, 130, 246), L=lambda i, n, z, hh, b, s: ((LED, LED) if 0 < i < n - 1 and 7 <= z < 9 else None), rim=0)
        lorry(c, 0.1, gv - 0.05, (60, 120, 170), along_u=True)
    if level == 3:  # trucks queuing in lanes
        lorry(c, 0.1, 2.55, (196, 90, 60), along_u=True)
        for k in range(3):
            c.line((0.1, 2.5 + k * 0.45, 2), (1.1, 2.5 + k * 0.45, 2), WHITE)
    if level <= 1:
        crowd(c, [(2.3, 2.0)] + ([(1.9, 2.8)] if level else []), f"pt{level}c", hats=ORANGE)
        lamp(c, 2.7, 3.7, col=LIT if level else (255, 210, 140))
        if level == 0:
            fence(c, 0.3, 3.6, 2.4, 3.6, broken=True)
    return c


def wave(col=(110, 240, 170), frame=CHAR):
    """A screen with a wavy line graph on it."""
    def g(i, n, z, h, base, s):
        if i == 0 or i == n - 1 or z == 0 or z == h - 1:
            return frame, None
        if z == round((h - 1) / 2 + (h / 2 - 2) * math.sin(i * 0.7)):
            return col, col
        return NAVY_D, None
    return g


def sawtooth(c, u0, v0, u1, v1, z, n, h, col, solar_=False, lit=(214, 236, 255, 130)):
    """A sawtooth roof, its teeth along u: each slope rises toward +u, a glazed upright faces +u."""
    w = (u1 - u0) / n
    for k in range(n):
        a, b = u0 + k * w, u0 + (k + 1) * w
        c.poly([(a, v0, z), (b, v0, z + h), (b, v1, z + h), (a, v1, z)], PANEL if solar_ else shade(col, 1.04))
        if solar_:
            for j in range(1, int((v1 - v0) / 0.2) + 1):
                vv = v0 + j * 0.2
                if vv < v1 - 0.05:
                    c.line((a, vv, z), (b, vv, z + h), shade(PANEL, 1.4))
        c.poly([(a, v1, z), (b, v1, z), (b, v1, z + h)], shade(col, 0.9))
        face(c, "R", b, v0, v1, z, z + h, GLASS_M, lambda i, nn, zz, hh, base, s: ((GLASS_L if zz > 1 else STEEL_M), lit if zz > 1 else None), ao=False, edge=False)


# ── Power grid (4x4) ───────────────────────────────────────────────────────────────────────────────────────────────

def chain_fence(c, pts, h=6):
    for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
        fence(c, u0, v0, u1, v1, h=h, col=STEEL_M, step=0.14)


def wall_map(i, n, z, h, base, s):
    """The town's power lines on a dark wall map: a grid of glowing lines and dots."""
    if i == 0 or i == n - 1 or z == 0 or z == h - 1:
        return CHAR, None
    if (i * 3 + z * 5) % 23 == 0:
        return YELLOW, YELLOW
    if i % 7 == 3 or z % 5 == 2:
        return (60, 200, 230), (80, 220, 240)
    return NAVY_D, None


def lm_energy(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"energy{level}", worn=level == 0)
    if level == 3:  # two wind turbines on the back corners
        turbine(c, 2.3, 0.3, 74, 0.3)
        turbine(c, 0.3, 2.3, 66, 1.2)
    # the control room / office on the back left
    if level == 1:
        block(c, 0.4, 0.4, 1.2, 1.1, 12, CREAM, L=combine(top_band(2, (40, 160, 90)), solid()), R=combine(top_band(2, (40, 160, 90)), punched("en1o", bay=6, floor=12, ww=4, wh=4, p=0.6, lo=2)))
        face(c, "L", 1.1, 0.5, 1.0, 4, 11, NAVY_D, wave(), ao=False, edge=False)
    elif level >= 2:
        cu0, cv0, cu1, cv1, chh = 0.35, 0.35, 1.7, 1.45, 24 if level == 2 else 26
        gl = level == 3
        block(c, cu0, cv0, cu1, cv1, chh, (214, 220, 226),
              L=combine(top_band(2, (40, 160, 90)), (glass("enC", bay=4, floor=8, p=0.9, lo=2) if gl else punched("enC", bay=6, floor=10, ww=4, wh=5, p=0.6, lo=14))),
              R=combine(top_band(2, (40, 160, 90)), glass("enCr", bay=4, floor=8, p=0.85, lo=2) if gl else punched("enCr", bay=6, floor=10, ww=4, wh=5, p=0.6, lo=2)))
        face(c, "L", cv1, cu0 + 0.15, cu1 - 0.15, 3, 12, NAVY_D, wall_map, ao=False, edge=False)
        if level == 3:
            solar(c, cu0 + 0.1, cv0 + 0.1, cu1 - 0.1, cv1 - 0.1, 2 + chh + 1, rows=3)
        else:  # the weather vane
            x, y = c.P(1.0, 0.9, 2 + chh)
            ln(c, [(x, y), (x, y - 10)], CHAR)
            ln(c, [(x - 4, y - 8), (x + 4, y - 8)], CHAR)
            c.d.polygon([(x + 4, y - 10), (x + 6, y - 8), (x + 4, y - 6)], fill=A(CHAR))
            ln(c, [(x - 2, y - 5), (x + 2, y - 5)], CHAR)
    # the substation: a brick hut, a transformer with insulators, a chain fence round it
    su0, sv0, su1, sv1 = 1.6, 1.4, 2.5, 2.2
    brick = BRICK if level else shade(BRICK, 0.85)
    chain_fence(c, [(1.3, 1.1), (3.4, 1.1)])
    chain_fence(c, [(1.3, 1.1), (1.3, 2.75)])
    block(c, su0, sv0, su1, sv1, 12, brick, L=combine(top_band(1, shade(brick, 1.1)), masonry(4, 7, 0.88)), R=combine(top_band(1, shade(brick, 1.1)), masonry(4, 7, 0.88)))
    face(c, "L", sv1, su0 + 0.3, su0 + 0.55, 2, 10, (40, 160, 90) if level else (90, 110, 100), ao=False)
    x, y = c.P(su0 + 0.42, sv1, 11)
    c.d.polygon([(x - 2, y), (x + 2, y), (x, y - 4)], fill=A(YELLOW))
    tu0, tv0 = 2.75, 1.35
    prism(c, tu0, tv0, tu0 + 0.45, tv0 + 0.55, 2, 12, STEEL_M, L=ribs(2), R=ribs(2))
    for k in range(3):
        x, y = c.P(tu0 + 0.1 + k * 0.13, tv0 + 0.25, 12)
        for j in range(3):
            c.put(x, y - 1 - j, WHITE if j % 2 else (200, 120, 90))
    chain_fence(c, [(3.4, 1.1), (3.4, 2.75)])
    chain_fence(c, [(1.3, 2.75), (3.4, 2.75)])
    # poles: one at first, then a row of them with meters
    if level == 0:
        p1 = pole(c, 0.7, 3.0)
        wires(c, [p1, c.P(su0, sv1, 12)])
    else:
        tops = [pole(c, 0.5 + k * 0.8, 3.55, 24, meter=True) for k in range(4)]
        wires(c, tops)
        if level == 3:
            x, y = tops[2]
            drone(c, x + 8, y - 8)
    if level == 0:
        tree(c, 0.6, 0.7, 1.0)
        tree(c, 3.5, 0.7, 0.8)
        lamp(c, 3.6, 3.3, col=(255, 210, 140))
    elif level == 1:
        crowd(c, [(1.4, 1.5)], "en1c", hats=YELLOW)
        lamp(c, 3.7, 3.2)
    elif level == 2:  # the van with a ladder
        van(c, 2.0, 2.95, WHITE, along_u=True, band=(40, 160, 90))
        a, b = c.P(2.1, 3.12, 15), c.P(2.45, 3.12, 15)
        ln(c, [a, b], STEEL_M)
        ln(c, [(a[0], a[1] + 2), (b[0], b[1] + 2)], STEEL_M)
        crowd(c, [(1.9, 3.3)], "en2c", hats=YELLOW)
        tree(c, 3.6, 0.6, 0.9)
    else:  # solar panels on the ground in front
        solar(c, 1.95, 0.25, 3.7, 1.0, 3, rows=2)
        crowd(c, [(2.0, 3.2), (2.3, 3.05)], "en3c", hats=YELLOW)
    return c


# ── Factory (4x4) ──────────────────────────────────────────────────────────────────────────────────────────────────

def coil(c, u, v, z=2, col=STEEL):
    drum(c, u, v, z, z + 6, 0.13, col, capcol=STEEL_M, ao=z <= 2)
    x, y = c.P(u, v, z + 6)
    c.put(x, y - 1, CHAR)


def lm_factory(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, col=(190, 188, 182), key=f"factory{level}", worn=level == 0)
    brick = BRICK if level else shade(BRICK, 0.85)
    # chimneys at the back: one, then two (steel and clean at level 3)
    if level <= 2:
        chimney(c, 0.6, 0.6, 2, (22, 28, 32)[level], brick)
        if level == 2:
            chimney(c, 0.6, 1.25, 2, 28, brick)
    else:
        chimney(c, 0.45, 0.45, 2, 50, STEEL_M, r=0.13)
        chimney(c, 0.45, 1.1, 2, 42, STEEL_M, r=0.13)
    if level < 3:
        u0, v0, u1, v1, h = (1.0, 0.9, 2.9, 2.3, 14) if level == 0 else (0.9, 0.8, 3.1, 2.4, 16)
        sensors = lambda i, n, z, hh, b, s: ((LED, LED) if level >= 1 and i % 8 == 5 and z == 9 else None)  # noqa: E731
        block(c, u0, v0, u1, v1, h, brick, L=combine(sensors, punched(f"fa{level}", bay=8, floor=14, ww=5, wh=5, p=0.3 if level == 0 else 0.7, lo=6), masonry(4, 7, 0.88)),
              R=combine(sensors, punched(f"fa{level}r", bay=8, floor=14, ww=5, wh=5, p=0.3 if level == 0 else 0.7, lo=6), masonry(4, 7, 0.88)), roof=False)
        c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.06, 2 + h, 9, (120, 128, 140))
        if level >= 1:  # sensor boxes on the gable
            for k in range(3):
                x, y = c.P(u0 + 0.5 + k * 0.6, v1 + 0.06, 2 + h + 1)
                rect(c, (x - 1, y - 2, x + 1, y), CON_L)
                c.put(x, y - 1, LED, LED)
    else:  # the modern works: a sawtooth roof of solar panels, a glass control room on top
        u0, v0, u1, v1, h = 0.8, 0.5, 3.4, 2.3, 18
        block(c, u0, v0, u1, v1, h, (206, 210, 216), L=combine(top_band(2, (40, 160, 90)), glass("fa3", bay=6, floor=8, p=0.7, lo=6, hi=16)),
              R=combine(top_band(2, (40, 160, 90)), punched("fa3r", bay=7, floor=9, ww=5, wh=4, p=0.7, lo=6)), roof=False)
        sawtooth(c, u0, v0, u1, v1, 2 + h, 5, 7, (196, 200, 206), solar_=True)
        # the big screen of machines, every one green
        def machines(i, n, z, hh, b, s):
            if i == 0 or i == n - 1 or z == 0 or z == hh - 1:
                return CHAR, None
            if i % 3 and z % 3:
                return LED, LED
            return NAVY_D, None
        face(c, "L", v1, u0 + 0.2, u0 + 1.0, 4, 16, NAVY_D, machines, ao=False, edge=False)
    # the roller door, a noticeboard with a wavy graph
    du = u1 - 0.8
    roller(c, "L", v1, du, du + 0.5, 2, 12, STEEL_M if level else shade(STEEL_M, 0.85))
    if level >= 1:
        face(c, "L", v1 + 0.03, du - 0.5, du - 0.15, 5, 11, CHAR, wave(), ao=False, edge=False)
    if level >= 2:  # a conveyor out of the door through a camera arch, a robot arm, the green "checked" lamp
        cu0, cu1 = du + 0.1, du + 0.4
        prism(c, cu0, v1, cu1, 3.5, 2, 6, CHAR, L=bands([(3, 4, STEEL_M)]), R=lambda i, n, z, hh, b, s: ((STEEL_M, None) if i % 3 == 0 and z == 3 else None), rim=0)
        for k in range(3):
            prism(c, cu0 + 0.05, v1 + 0.2 + k * 0.4, cu0 + 0.2, v1 + 0.35 + k * 0.4, 6, 8, STEEL, rim=0, ao=False)
        av = v1 + 0.55
        for pu in (cu0 - 0.08, cu1 + 0.04):
            prism(c, pu, av, pu + 0.05, av + 0.05, 2, 14, (59, 130, 246), rim=0, ao=False)
        prism(c, cu0 - 0.08, av, cu1 + 0.09, av + 0.05, 14, 16, (59, 130, 246), rim=0, ao=False)
        x, y = c.P((cu0 + cu1) / 2, av + 0.05, 14)
        rect(c, (x - 1, y, x + 1, y + 1), CHAR)
        c.put(x, y + 1, RED, RED)
        x, y = c.P(du + 0.25, v1, 14)
        rect(c, (x - 1, y - 2, x + 1, y), LED, LED)
        glow(c, x, y - 1, LED, 3, 120)
        robot_arm(c, cu1 + 0.25, v1 + 0.6)
        if level == 3:
            robot_arm(c, cu0 - 0.35, v1 + 1.0, reach=-1)
    # steel: one roll at first, then a rack of shiny rolls
    if level <= 1:
        coil(c, 3.3, 2.7, col=STEEL_M if level == 0 else STEEL)
        if level == 1:
            coil(c, 3.55, 2.95)
    else:
        prism(c, 0.4, 2.7, 1.5, 3.0, 2, 4, WOOD_D, rim=0)
        for k in range(4):
            coil(c, 0.55 + k * 0.27, 2.85, z=4)
    if level == 3:  # a forklift loading a lorry
        lorry(c, 0.25, 3.25, WHITE, along_u=True, band=(40, 160, 90))
        forklift(c, 1.4, 3.3)
    if level == 0:
        fence(c, 0.4, 3.6, 2.4, 3.6, broken=True)
        tree(c, 3.5, 0.6, 0.9)
        lamp(c, 3.6, 3.6, col=(255, 210, 140))
    elif level <= 2:
        crowd(c, [(1.2, 2.8)] + ([(1.6, 3.2)] if level == 2 else []), f"fa{level}c", hats=YELLOW)
        lamp(c, 3.7, 3.7)
    return c


# ── Farm co-op (4x4) ───────────────────────────────────────────────────────────────────────────────────────────────

def windpump(c, u, v, h=20, z=2):
    """A little weather mast: a windmill on a lattice, a rain gauge on its foot."""
    lattice(c, u, v, z, z + h, 3, 1, WOOD_D, 5)
    x, y = c.P(u, v, z + h)
    for k in range(6):
        a = k * math.pi / 3 + 0.2
        ln(c, [(x, y), (x + round(math.cos(a) * 5), y + round(math.sin(a) * 5))], WHITE)
    c.put(x, y, RED)
    ln(c, [(x + 1, y), (x + 7, y + 1)], CHAR)
    x, y = c.P(u + 0.15, v + 0.1, z)
    rect(c, (x, y - 4, x + 1, y), (150, 200, 240))


def tractor(c, u, v, col=(40, 150, 70), z=2, sensor=False):
    prism(c, u, v, u + 0.34, v + 0.18, z + 3, z + 7, col, rim=0, ao=False)
    prism(c, u + 0.02, v + 0.02, u + 0.16, v + 0.16, z + 7, z + 13, GLASS_DK, L=lambda *a: (GLASS_L, None), rim=0, ao=False, roofcol=col)
    x, y = c.P(u + 0.08, v + 0.18, z)
    ell(c, (x - 3, y - 7, x + 3, y), CHAR)
    c.put(x, y - 4, YELLOW)
    x, y = c.P(u + 0.3, v + 0.18, z)
    ell(c, (x - 2, y - 4, x + 1, y), CHAR)
    if sensor:
        x, y = c.P(u + 0.09, v + 0.09, z + 13)
        rect(c, (x - 1, y - 2, x + 1, y), WHITE)
        c.put(x, y - 1, LED, LED)


def combine_harvester(c, u, v, z=2):
    prism(c, u, v, u + 0.5, v + 0.3, z + 3, z + 12, (40, 150, 70), R=bands([(5, 6, YELLOW)]), L=bands([(5, 6, YELLOW)]), rim=0, ao=False)
    prism(c, u + 0.3, v + 0.03, u + 0.48, v + 0.2, z + 12, z + 18, GLASS_DK, L=lambda *a: (GLASS_L, None), rim=0, ao=False, roofcol=(40, 150, 70))
    prism(c, u + 0.5, v - 0.15, u + 0.62, v + 0.45, z + 1, z + 5, YELLOW, R=ribs(2), rim=0, ao=False)
    for wu in (u + 0.1, u + 0.38):
        x, y = c.P(wu, v + 0.3, z)
        ell(c, (x - 3, y - 6, x + 2, y), CHAR)


def greenhouse(c, u0, v0, u1, v1, h, key):
    prism(c, u0, v0, u1, v1, 2, 2 + h, GLASS_L, L=combine(lambda i, n, z, hh, b, s: ((WHITE, None) if i % 5 == 0 or z == hh - 1 else None), lambda i, n, z, hh, b, s: ((LEAF if z < 5 and (i + z) % 3 else GLASS_L), (160, 255, 160) if z < 5 else None)),
          R=lambda i, n, z, hh, b, s: ((WHITE, None) if i % 5 == 0 else ((LEAF_D if z < 5 else GLASS_M), None)), roof=False)
    vm = (v0 + v1) / 2
    c.poly([(u0, v1, 2 + h), (u1, v1, 2 + h), (u1, vm, 2 + h + 6), (u0, vm, 2 + h + 6)], (200, 236, 250))
    c.poly([(u1, v1, 2 + h), (u1, v0, 2 + h), (u1, vm, 2 + h + 6)], (150, 200, 230))
    for k in range(1, int((u1 - u0) / 0.2)):
        c.line((u0 + k * 0.2, v1, 2 + h), (u0 + k * 0.2, vm, 2 + h + 6), WHITE)


def lm_farm(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, col=(176, 168, 140), key=f"farm{level}", worn=level == 0)
    # fields along the front: one green field, then two colours
    if level <= 1:
        field(c, 0.35, 2.35, 3.7, 3.75, (90, 170, 70), f"fm{level}f")
    else:
        field(c, 0.35, 2.35, 1.95, 3.75, (90, 170, 70), f"fm{level}f")
        field(c, 2.1, 2.35, 3.7, 3.75, WHEAT, f"fm{level}g", along_u=False, ripe=(214, 170, 70))
    if level == 3:  # three silos on the back corner
        silo(c, 0.45, 0.45, 40, 0.3, lit=True)
        silo(c, 1.15, 0.4, 32, 0.28)
        silo(c, 0.4, 1.15, 34, 0.28)
    elif level == 2:
        silo(c, 0.5, 0.5, 34, 0.3, lit=True)
    # the red barn with its X doors (a co-op sign from level 1)
    bu0, bv0, bu1, bv1 = (1.2, 0.7, 2.4, 1.85) if level < 3 else (1.0, 1.1, 2.1, 2.05)
    red = (190, 52, 44) if level else (160, 60, 52)
    block(c, bu0, bv0, bu1, bv1, 12, red, L=combine(lambda i, n, z, hh, b, s: (shade(b, 0.86), None) if i % 4 == 0 else None),
          R=combine(lambda i, n, z, hh, b, s: (shade(b, 0.86), None) if i % 4 == 0 else None), roof=False)
    c.gable(bu0 - 0.05, bv0 - 0.05, bu1 + 0.05, bv1 + 0.06, 14, 9, (110, 100, 96))
    m = (bu0 + bu1) / 2

    def xdoor(i, n, z, hh, b, s):
        if i in (0, n - 1) or z in (0, hh - 1) or abs(i - z * n / hh) < 1 or abs(i - (hh - 1 - z) * n / hh) < 1:
            return WHITE, None
        return shade(red, 0.85), None
    face(c, "L", bv1, m - 0.25, m + 0.25, 2, 11, red, xdoor, ao=False)
    if level >= 1:
        sign_board(c, 0, bv1 + 0.02, m - 0.3, m + 0.3, 11, 17, CREAM, "COOP", txt=(40, 120, 60), lit=False, posts=False)
    if level <= 1:
        windpump(c, 2.8, 0.8, 22)
    # sensor posts in the field, a notice board by the gate
    if level >= 1:
        for k in range(4):
            x, y = c.P(0.8 + k * 0.8, 3.0 + (k % 2) * 0.35, 2)
            ln(c, [(x, y), (x, y - 6)], STEEL_D)
            c.put(x, y - 7, LED, LED)
            glow(c, x, y - 7, LED, 2, 100)
        x, y = c.P(3.75, 2.2, 2)
        ln(c, [(x - 3, y), (x - 3, y - 9)], WOOD_D)
        ln(c, [(x + 3, y), (x + 3, y - 9)], WOOD_D)
        face(c, "R", 3.75, 2.0, 2.4, 6, 12, WOOD, lambda i, n, z, hh, b, s: ((PAPER, None) if 0 < i < n - 1 and 1 <= z < hh - 1 and (i + z) % 4 else None), ao=False, edge=False)
    if level >= 2:  # the tractor shed (open front) with two tractors
        su0, sv0, su1, sv1 = 2.6, 0.35, 3.7, 1.55
        block(c, su0, sv0, su1, sv1, 13, WOOD, L=lambda i, n, z, hh, b, s: ((CHAR, None) if 0 < i < n - 1 and z < hh - 3 else None), R=ribs(3), roof=False)
        c.gable(su0 - 0.04, sv0 - 0.04, su1 + 0.04, sv1 + 0.05, 15, 5, (120, 128, 140))
        tractor(c, su0 + 0.1, sv1 + 0.15, sensor=True)
        tractor(c, su0 + 0.6, sv1 + 0.3, (226, 72, 64), sensor=True)
    if level == 3:  # the greenhouse, the farm office with its field map, the combine heading out
        greenhouse(c, 2.4, 1.85, 3.7, 2.2, 8, "fmG")
        ou0, ov0, ou1, ov1 = 0.3, 1.6, 0.85, 2.15
        block(c, ou0, ov0, ou1, ov1, 13, CREAM, L=combine(top_band(2, (40, 150, 70)), solid()), R=combine(top_band(2, (40, 150, 70)), solid()))
        face(c, "L", ov1, ou0 + 0.08, ou1 - 0.08, 4, 12, NAVY_D, lambda i, n, z, hh, b, s: ((CHAR, None) if i in (0, n - 1) or z in (0, hh - 1) else
             (((90, 200, 90) if (i // 2 + z // 2) % 2 else (230, 200, 90)), (140, 230, 140))), ao=False, edge=False)
        combine_harvester(c, 2.4, 2.9)
        crowd(c, [(1.2, 2.25), (1.9, 2.2)], "fm3c")
    if level == 0:
        fence(c, 0.3, 2.2, 3.7, 2.2, broken=True, col=WOOD)
        tree(c, 0.5, 0.6, 1.1)
        lamp(c, 2.6, 2.0, col=(255, 210, 140))
    elif level <= 2:
        tree(c, 0.5, 1.6, 1.0) if level == 2 else tree(c, 0.5, 0.6, 1.1)
        crowd(c, [(1.0, 2.15)], f"fm{level}c")
    return c


# ── Car maker (4x4) ────────────────────────────────────────────────────────────────────────────────────────────────

CAR_COLS = [(226, 52, 60), (59, 130, 246), (240, 242, 246), (40, 44, 56), (20, 170, 160)]


def charger(c, u, v, z=2):
    prism(c, u, v, u + 0.12, v + 0.1, z, z + 10, (40, 160, 90), L=lambda i, n, zz, hh, b, s: ((LED, LED) if 0 < i < n - 1 and 6 <= zz < 8 else None), rim=0)
    x, y = c.P(u + 0.12, v + 0.1, z + 5)
    ln(c, [(x, y), (x + 2, y + 4)], CHAR)


def track(c, cu, cv, ru, rv, w=0.28, key="trk"):
    """A test track loop: a rounded asphalt ring round a lawn, a dashed white line, kerbs at the bends."""
    def ring(r_u, r_v):
        pts = []
        for k in range(36):
            a = k * 2 * math.pi / 36
            ca, sa = math.cos(a), math.sin(a)
            e = 0.35
            pu = math.copysign(abs(ca) ** e, ca) * r_u
            pv = math.copysign(abs(sa) ** e, sa) * r_v
            pts.append((cu + pu, cv + pv, 2))
        return pts
    c.poly(ring(ru, rv), (84, 88, 100))
    inner = ring(ru - w, rv - w)
    c.poly(inner, GRASS)
    mid = ring(ru - w / 2, rv - w / 2)
    for k in range(0, 36, 2):
        c.line(mid[k], mid[(k + 1) % 36], WHITE)
    for k in range(36):
        if k % 9 in (3, 4, 5):
            a, b = ring(ru, rv)[k], ring(ru, rv)[(k + 1) % 36]
            c.line(a, b, RED if k % 2 else WHITE)


def lm_carmaker(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"car{level}", worn=level == 0)
    if level == 3:
        track(c, 1.15, 2.85, 0.95, 0.95)
        car(c, 0.45, 2.15, CAR_COLS[0], along_u=False)
        car(c, 1.4, 3.6, CAR_COLS[1])
    if level == 0:  # the small workshop with a car up on the lift, a charging post
        u0, v0, u1, v1, h = 1.2, 1.1, 2.5, 2.2, 13
        block(c, u0, v0, u1, v1, h, shade(CREAM, 0.86), L=combine(top_band(2, (59, 130, 246)), solid()), R=combine(top_band(2, (59, 130, 246)), punched("cm0", bay=8, floor=12, ww=4, wh=4, p=0.3, lo=3)))
        roller(c, "L", v1, u0 + 0.2, u0 + 0.8, 2, 11)
        lu, lv = 2.7, 1.5
        for pv in (lv, lv + 0.45):
            prism(c, lu, pv, lu + 0.06, pv + 0.06, 2, 12, STEEL_D, rim=0)
        prism(c, lu - 0.05, lv + 0.05, lu + 0.45, lv + 0.45, 7, 8, STEEL_M, rim=0, ao=False)
        car(c, lu + 0.04, lv + 0.04, CAR_COLS[3], along_u=False, z=7)
        charger(c, 0.9, 2.6)
        tree(c, 0.6, 0.7, 1.0)
        fence(c, 0.4, 3.6, 2.4, 3.6, broken=True)
        lamp(c, 3.4, 3.4, col=(255, 210, 140))
        return c
    # the factory hall: sawtooth roof, the assembly line in its windows, a radio aerial
    hu0, hv0, hu1, hv1, hh = (0.5, 0.5, 2.7, 1.9, 16) if level < 3 else (0.35, 0.35, 2.4, 1.45, 18)

    def line_win(i, n, z, h, b, s):
        if 4 <= z < 11 and 1 < i < n - 2 and i % 12 not in (0, 11):
            if 4 <= z < 7 and (i // 6) % 2 == 0:
                return CAR_COLS[(i // 12) % 5], None
            return GLASS_DK, LIT_COOL
        return None
    block(c, hu0, hv0, hu1, hv1, hh, (214, 218, 224), L=combine(top_band(2, (59, 130, 246)), line_win), R=combine(top_band(2, (59, 130, 246)), line_win), roof=False)
    sawtooth(c, hu0, hv0, hu1, hv1, 2 + hh, 4, 6, (196, 200, 206))
    x, y = c.P(hu0 + 0.3, hv0 + 0.3, 2 + hh + 6)
    ln(c, [(x, y), (x, y - 14)], STEEL_D)
    for k in range(3):
        ln(c, [(x - 2 + k, y - 4 - k * 4), (x + 2 - k, y - 4 - k * 4)], STEEL_D)
    c.put(x, y - 15, RED, RED)
    if level == 3:  # the globe sign on the roof
        x, y = c.P((hu0 + hu1) / 2, hv1 - 0.1, 2 + hh + 6)
        ln(c, [(x, y), (x, y - 6)], STEEL_D)
        gx, gy = x, y - 14
        ell(c, (gx - 8, gy - 8, gx + 8, gy + 8), (40, 110, 200), (90, 170, 255))
        ell(c, (gx - 7, gy - 7, gx + 6, gy + 6), (59, 140, 230), (110, 190, 255))
        c.d.ellipse((gx - 3, gy - 8, gx + 3, gy + 8), outline=A(WHITE))
        ln(c, [(gx - 8, gy), (gx + 8, gy)], WHITE, 1, WHITE)
        ln(c, [(gx, gy - 8), (gx, gy + 8)], WHITE, 1, WHITE)
    if level >= 2:  # the glass showroom with three cars, a battery sign
        su0, sv0, su1, sv1 = (2.85, 0.4, 3.7, 2.1) if level == 2 else (2.6, 0.35, 3.7, 1.6)
        block(c, su0, sv0, su1, sv1, 16, (230, 234, 240), L=combine(top_band(2, (59, 130, 246)), glass("cmS", bay=8, floor=14, p=0.95, lo=1, hi=13, refl=False)),
              R=combine(top_band(2, (59, 130, 246)), glass("cmSr", bay=8, floor=14, p=0.95, lo=1, hi=13, refl=False)))
        for k in range(3):
            car(c, su1 + 0.08, sv0 + 0.15 + k * 0.48, CAR_COLS[k], along_u=False)
        # a phone-shaped sign showing a battery filling
        def battery(i, n, z, h, b, s):
            if (i in (0, n - 1)) and (z in (0, h - 1)):
                return None
            if i == 0 or i == n - 1 or z == 0 or z == h - 1:
                return CHAR, None
            if 2 <= i < n - 2 and 2 <= z < h - 3:
                return (LED, LED) if z < h * 0.65 else ((60, 70, 90), None)
            if z == h - 3 and n // 2 - 1 <= i <= n // 2:
                return WHITE, WHITE
            return (40, 46, 60), None
        face(c, "L", sv1, su0 + 0.1, su0 + 0.4, 16, 30, CHAR, battery, ao=False, edge=False)
    if level == 1:
        charger(c, 3.0, 2.0)
        charger(c, 3.3, 2.0)
        car(c, 2.95, 2.2, CAR_COLS[1], along_u=False)
        tree(c, 3.5, 0.6, 1.0)
        crowd(c, [(1.4, 2.3), (1.7, 2.4)], "cm1c")
        lamp(c, 3.6, 3.6)
        for k in range(3):
            car(c, 0.6 + k * 0.5, 2.6, CAR_COLS[(k + 2) % 5], along_u=False)
    elif level == 2:  # the car park
        for k in range(6):
            c.line((0.4 + k * 0.42, 2.35, 2), (0.4 + k * 0.42, 3.1, 2), WHITE)
        for k in range(5):
            if k != 2:
                car(c, 0.5 + k * 0.42, 2.5, CAR_COLS[(k + 1) % 5], along_u=False)
        crowd(c, [(1.6, 3.3), (2.5, 2.6)], "cm2c")
        lamp(c, 3.6, 3.6)
        charger(c, 3.2, 3.2)
    else:  # the software lab with glowing screens, a car carrier at the gate
        block(c, 2.5, 1.85, 3.6, 2.6, 14, (214, 220, 232), L=combine(top_band(2, PURPLE), leds("cmL", step=3, every=4, col=(110, 180, 255), p=0.8, lo=3, hi=12)),
              R=combine(top_band(2, PURPLE), glass("cmLr", bay=4, floor=6, p=0.9, lo=2)))
        # the car carrier: a cab and a two-deck trailer of cars
        tu, tv = 2.35, 3.05
        prism(c, tu, tv, tu + 1.1, tv + 0.3, 3, 4, CHAR, rim=0, ao=False)
        for k in range(2):
            car(c, tu + 0.1 + k * 0.45, tv + 0.05, CAR_COLS[k + 2], z=4)
        prism(c, tu, tv, tu + 1.1, tv + 0.3, 10, 11, STEEL_D, rim=0, ao=False)
        for k in range(2):
            car(c, tu + 0.1 + k * 0.45, tv + 0.05, CAR_COLS[k], z=11)
        prism(c, tu + 1.12, tv + 0.02, tu + 1.35, tv + 0.3, 3, 13, (59, 130, 246), R=lambda i, n, zz, hh, b, s: ((GLASS_L, None) if zz >= 7 and 0 < i < n - 1 else None), rim=0, ao=False)
        for wu in (tu + 0.2, tu + 0.9, tu + 1.25):
            x, y = c.P(wu, tv + 0.3, 2)
            rect(c, (x - 1, y - 2, x + 1, y), CHAR)
        lamp(c, 3.75, 2.75)
    return c


# ── Phone network (4x4) ────────────────────────────────────────────────────────────────────────────────────────────

def lm_telecom(level):
    c = Kit(4, 4, 130)
    plate(c, 4, 4, key=f"tel{level}", worn=level == 0)
    mh = (40, 56, 70, 96)[level]
    mu, mv = 0.75, 0.75
    if level >= 2:  # cables from the mast's foot into the ground and the building
        for k in range(2):
            c.line((mu + 0.1, mv + 0.1 + k * 0.08, 2), (1.3, mv + 0.6 + k * 0.08, 2), CHAR)
    mast(c, mu, mv, 2, mh, w0=(3, 4, 5, 6)[level], w1=1, reds=(0, 0, 2, 3)[level], dishes=(0, 3, 3, 3)[level], panels=(0, 3, 3, 6)[level])
    if level == 0:
        x, y = c.P(mu, mv, 2 + mh)
        glow(c, x, y - 7, RED, 4, 160)
    brick = BRICK if level else shade(BRICK, 0.85)
    if level <= 1:
        u0, v0, u1, v1, h = 1.4, 1.2, 2.7, 2.3, 13
    elif level == 2:
        u0, v0, u1, v1, h = 1.3, 1.1, 2.9, 2.4, 25
    else:
        u0, v0, u1, v1, h = 1.3, 0.9, 3.1, 2.4, 25
    block(c, u0, v0, u1, v1, h, brick, L=combine(top_band(2, (20, 170, 160)), bands([(12, 13, (20, 170, 160))]) if h > 15 else None, masonry(4, 7, 0.88)),
          R=combine(top_band(2, (20, 170, 160)), punched(f"tel{level}r", bay=7, floor=11, ww=4, wh=5, p=0.5, lo=2), masonry(4, 7, 0.88)))
    face(c, "L", v1, u0 + 0.15, u0 + 0.4, 2, 10, NAVY_D, ao=False)
    if level >= 1:  # the phone shop window: a big phone glowing in it
        def shopwin(i, n, z, hh, b, s):
            if i in (0, n - 1) or z in (0, hh - 1):
                return (20, 170, 160), None
            if n // 2 - 3 <= i <= n // 2 + 2 and 1 <= z < hh - 1:
                if i in (n // 2 - 3, n // 2 + 2) or z in (1, hh - 2):
                    return CHAR, None
                return (90, 180, 255), (110, 200, 255)
            return GLASS_L, LIT
        face(c, "L", v1, u0 + 0.5, u1 - 0.15, 2, 11, GLASS_L, shopwin, ao=False, edge=False)
    if level >= 2:  # upstairs: the care desk (people with headsets at screens)
        def care(i, n, z, hh, b, s):
            if 15 <= z < 22 and 1 < i < n - 2:
                k = i % 8
                if k in (2, 3) and z < 19:
                    return (SHIRTS[(i // 8) % 7], None) if z < 17 else (SKIN, None)
                if k in (5, 6) and 16 <= z < 19:
                    return (110, 200, 255), (110, 200, 255)
                return GLASS_DK, LIT
            return None
        face(c, "L", v1, u0, u1, 2, 2 + h - 2, brick, care, ao=False, edge=False)
    if level == 3:  # the control room: a wall of screens, a dish on the roof
        def wall(i, n, z, hh, b, s):
            if 1 <= i < n - 1 and 3 <= z < hh - 4:
                if i % 5 == 0 or z % 4 == 0:
                    return CHAR, None
                col = (110, 240, 150) if hv("telw", i // 5, z // 4) < 0.6 else (90, 170, 255)
                return col, col
            return None
        face(c, "R", u1, v0 + 0.15, v1 - 0.15, 4, 22, brick, wall, ao=False, edge=False)
        dish(c, u0 + 0.8, v0 + 0.5, 2 + h, 6)
        plant(c, u1 - 0.7, v0 + 0.15, u1 - 0.1, v0 + 0.7, 2 + h, "tel3p", n=1)
        van(c, 3.1, 2.65, WHITE, along_u=False, band=(20, 170, 160))
        crowd(c, [(1.6, 2.8), (2.0, 2.95), (2.4, 2.75)], "tel3c")
        lamp(c, 0.5, 3.4)
    if level == 1:
        crowd(c, [(1.9, 2.6)], "tel1c")
        lamp(c, 3.5, 3.5)
    elif level == 2:
        crowd(c, [(1.7, 2.7), (2.3, 2.85)], "tel2c")
        tree(c, 3.5, 3.1, 0.9)
        lamp(c, 3.6, 3.6)
    elif level == 0:
        fence(c, 0.4, 3.5, 2.4, 3.5, broken=True)
        tree(c, 3.4, 0.7, 1.0)
        lamp(c, 3.4, 3.4, col=(255, 210, 140))
    if level <= 1:
        tree(c, 0.6, 2.8, 0.9)
    return c


# ── Town hall (4x4) ────────────────────────────────────────────────────────────────────────────────────────────────

def noticeboard(c, u, v, z=2):
    for pu in (u + 0.04, u + 0.36):
        x, y = c.P(pu, v, z)
        ln(c, [(x, y), (x, y - 11)], WOOD_D)
    face(c, "L", v, u, u + 0.4, 6, 13, WOOD, lambda i, n, zz, hh, b, s: ((PAPER if (i // 2 + zz // 2) % 2 else (255, 230, 150)), None) if 0 < i < n - 1 and 0 < zz < hh - 1 else None, ao=False, edge=False)


def fountain(c, u, v, r=0.38):
    drum(c, u, v, 2, 5, r, STONE, capcol=STONE)
    ellipse(c, u, v, 5, r - 0.06, (70, 160, 220), rim=False, light=(80, 180, 240, 120))
    drum(c, u, v, 5, 12, 0.06, STONE, capcol=STONE, ao=False)
    x, y = c.P(u, v, 12)
    for dx in (-3, 0, 3):
        ln(c, [(x, y - 3), (x + dx, y + 1)], (180, 225, 250), 1, (160, 220, 255))
    c.put(x, y - 4, WHITE)


def flowers(c, u0, v0, u1, v1, key):
    c.poly([(u0, v0, 2), (u1, v0, 2), (u1, v1, 2), (u0, v1, 2)], SOIL)
    for k in range(int((u1 - u0 + v1 - v0) * 14)):
        x, y = c.P(u0 + 0.03 + hv(key, k) * (u1 - u0 - 0.06), v0 + 0.03 + hv(key, "v", k) * (v1 - v0 - 0.06), 2)
        c.put(x, y - 1, LEAF)
        c.put(x, y - 2, SHIRTS[k % 5] if k % 3 else YELLOW)


def lm_council(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"council{level}", worn=level == 0)
    brick = BRICK if level else shade(BRICK, 0.85)
    if level == 3:  # the clock tower behind the hall: brick shaft, a lit watch room, clock faces, a spire
        tu0, tv0, tu1, tv1, th = 1.45, 0.35, 2.15, 1.05, 66
        block(c, tu0, tv0, tu1, tv1, th, brick, L=combine(bands([(th - 20, th - 18, STONE)]), punched("cnT", bay=5, floor=12, ww=2, wh=5, p=0.4, lo=6, hi=th - 22), masonry(4, 7, 0.88)),
              R=combine(bands([(th - 20, th - 18, STONE)]), punched("cnTr", bay=5, floor=12, ww=2, wh=5, p=0.4, lo=6, hi=th - 22), masonry(4, 7, 0.88)))
        x, y = c.P((tu0 + tu1) / 2, tv1, th - 6)
        clock(c, x, y - 1, 5)
        x, y = c.P(tu1, (tv0 + tv1) / 2, th - 6)
        clock(c, x, y - 1, 4)
        # the watch room: open arches, lit
        prism(c, tu0 + 0.04, tv0 + 0.04, tu1 - 0.04, tv1 - 0.04, 2 + th, 2 + th + 10, STONE,
              L=lambda i, n, z, hh, b, s: ((LIT, LIT) if i % 5 not in (0, 4) and 2 <= z < hh - 2 else None),
              R=lambda i, n, z, hh, b, s: ((LIT, LIT) if i % 5 not in (0, 4) and 2 <= z < hh - 2 else None))
        c.pyramid(tu0, tv0, tu1, tv1, 2 + th + 10, 18, (70, 90, 110))
        x, y = c.P((tu0 + tu1) / 2, (tv0 + tv1) / 2, 2 + th + 28)
        ln(c, [(x, y), (x, y - 6)], GOLD_D)
        c.put(x, y - 7, GOLD)
    if level >= 2:  # the records wing with its vault door, flower beds
        wu0, wv0, wu1, wv1 = 2.95, 0.9, 3.75, 2.2
        block(c, wu0, wv0, wu1, wv1, 14, STONE, L=combine(top_band(2, shade(STONE, 1.06)), masonry(4, 8, 0.9)), R=combine(top_band(2, shade(STONE, 1.06)), punched("cnW", bay=7, floor=12, ww=3, wh=4, p=0.4, lo=4)))
        x, y = c.P((wu0 + wu1) / 2, wv1, 8)
        ell(c, (x - 5, y - 5, x + 5, y + 5), (120, 128, 140))
        ell(c, (x - 4, y - 4, x + 4, y + 4), STEEL)
        c.d.ellipse((x - 2, y - 2, x + 2, y + 2), outline=A(STEEL_D))
        ln(c, [(x - 4, y), (x + 4, y)], STEEL_D)
        flowers(c, 0.4, 2.7, 1.3, 2.95, f"cnF{level}")
        flowers(c, 2.6, 2.7, 3.6, 2.95, f"cnG{level}")
    # the hall: brick with a stone portico (grander at level 3), the clock over the door
    if level <= 2:
        u0, v0, u1, v1, h = 1.1, 1.0, 2.8, 2.3, 18 if level < 2 else 20
    else:
        u0, v0, u1, v1, h = 0.6, 1.1, 2.9, 2.3, 22
    block(c, u0, v0, u1, v1, h, brick, L=combine(top_band(2, STONE), punched(f"cn{level}", bay=7, floor=10, ww=3, wh=6, p=0.55, lo=3), masonry(4, 7, 0.88)),
          R=combine(top_band(2, STONE), punched(f"cn{level}r", bay=7, floor=10, ww=3, wh=6, p=0.5, lo=3), masonry(4, 7, 0.88)), roof=False)
    c.gable(u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.06, 2 + h, 8, (90, 96, 110))
    m = (u0 + u1) / 2
    portico(c, m - 0.5, m + 0.5, v1, 2, 16 if level < 3 else 20, STONE, f"cn{level}p")
    face(c, "L", v1, m - 0.13, m + 0.13, 2, 11, NAVY_D, lambda i, n, z, hh, b, s: ((LIT, LIT if level else None) if 0 < i < n - 1 and 1 < z < hh - 1 else None), ao=False)
    if level < 3:
        x, y = c.P(m, v1 + 0.3, 2 + 16 + 3)
        clock(c, x, y - 5, 4, lit=level > 0)
    noticeboard(c, u0 - 0.45, v1 + 0.3)
    if level >= 1:  # the REPORT IT sign by the door, a bright fixed streetlight, the council van
        sign_board(c, 0, 2.95, 1.75, 3.35, 7, 14, (59, 130, 246), "REPORT", posts=True)
        lamp(c, 0.4, 3.3, h=16, col=(255, 236, 170))
        x, y = c.P(0.4, 3.3, 2)
        glow(c, x + 2, y - 14, (255, 236, 170), 6, 110)
        van(c, 3.3, 3.25, WHITE, along_u=False, band=(20, 170, 160))
    if level == 2:  # a plain flag on the roof
        flag(c, m + 0.3, (v0 + v1) / 2, 2 + h + 6, 14, (20, 170, 160))
    if level == 3:  # the square with a fountain, residents chatting
        fountain(c, 1.05, 3.3)
        crowd(c, [(0.45, 3.0), (1.65, 3.45), (2.3, 3.35), (2.45, 3.5), (1.9, 3.7)], "cn3c")
        tree(c, 3.6, 3.6, 0.9)
    if level == 0:
        bench(c, 2.0, 2.95)
        tree(c, 0.6, 0.7, 1.0)
        tree(c, 3.4, 0.8, 0.9)
        lamp(c, 3.5, 3.5, col=(255, 210, 140))
    elif level == 1:
        bench(c, 0.9, 3.3)
        tree(c, 3.4, 0.8, 0.9)
        crowd(c, [(1.6, 2.95)], "cn1c")
    return c


# ── Hotel (4x4) ────────────────────────────────────────────────────────────────────────────────────────────────────

def bell(c, x, y):
    ln(c, [(x, y), (x + 4, y)], CHAR)
    c.d.polygon([(x + 2, y + 1), (x - 1, y + 6), (x + 6, y + 6)], fill=A(GOLD))
    ln(c, [(x - 1, y + 6), (x + 6, y + 6)], GOLD_D)
    c.put(x + 2, y + 7, GOLD_D)
    glow(c, x + 2, y + 4, (255, 214, 110), 3, 80)


def trolley(c, u, v, z=2):
    x, y = c.P(u, v, z)
    ln(c, [(x, y - 1), (x + 6, y + 2)], GOLD_D)
    ln(c, [(x, y - 1), (x, y - 12)], GOLD)
    ln(c, [(x + 6, y + 2), (x + 6, y - 9)], GOLD)
    ln(c, [(x, y - 12), (x + 6, y - 9)], GOLD)
    for k, col in enumerate(((140, 70, 50), (59, 130, 246), (226, 72, 64))):
        rect(c, (x + 1, y - 3 - k * 3, x + 4, y - 1 - k * 3 + 1), col)


def balconies(lo, every, col=WHITE):
    def g(i, n, z, h, base, s):
        if z >= lo and (z - lo) % every == 0 and 0 < i < n - 1:
            return col, None
        if z >= lo and (z - lo) % every in (1, 2) and i % 3 == 0 and 0 < i < n - 1:
            return shade(col, 0.8), None
        return None
    return g


def lm_hotel(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"hotel{level}", worn=level == 0)
    rose = (232, 196, 186) if level else shade((232, 196, 186), 0.86)
    if level >= 2:  # the pool and its loungers
        pu0, pv0, pu1, pv1 = (2.75, 0.4, 3.7, 1.5) if level == 2 else (2.7, 0.35, 3.75, 1.75)
        pool(c, pu0, pv0, pu1, pv1)
        for k in range(3 if level == 2 else 4):
            uu = pu0 + 0.1 + k * 0.27
            prism(c, uu, pv1 + 0.1, uu + 0.12, pv1 + 0.4, 3, 4, WHITE, rim=0, ao=False)
        x, y = c.P(pu1 - 0.2, pv1 + 0.2, 2)
        ln(c, [(x, y), (x, y - 12)], STEEL_D)
        c.d.polygon([(x - 7, y - 10), (x + 7, y - 10), (x, y - 15)], fill=A((226, 72, 64)))
    if level <= 2:
        u0, v0, u1, v1 = (1.4, 1.3, 2.4, 2.25) if level < 2 else (1.0, 0.9, 2.5, 2.3)
        h = 30 if level < 2 else 46
    else:
        u0, v0, u1, v1, h = 0.4, 0.4, 2.35, 2.2, 82
    clad = rose if level < 3 else (226, 220, 210)
    win = punched(f"ho{level}", bay=6, floor=8, ww=3, wh=4, p=0.6 if level else 0.35, lo=13)
    winr = punched(f"ho{level}r", bay=6, floor=8, ww=3, wh=4, p=0.55 if level else 0.3, lo=13)
    bal = balconies(13, 8) if level >= 2 else None
    lobby = lambda i, n, z, hh, b, s: ((GLASS_L if s == "L" else GLASS_DK), LIT) if 2 <= z < 10 and 1 < i < n - 2 else None  # noqa: E731
    block(c, u0, v0, u1, v1, h, clad, L=combine(top_band(3, GOLD_D), bands([(11, 12, GOLD_D)]), lobby if level >= 1 else None, bal, win),
          R=combine(top_band(3, GOLD_D), bands([(11, 12, GOLD_D)]), bal, winr))
    m = (u0 + u1) / 2
    face(c, "L", v1, m - 0.14, m + 0.14, 2, 11, NAVY_D, lambda i, n, z, hh, b, s: ((GLASS_DK, LIT if level else (190, 160, 110)) if 0 < i < n - 1 and 1 < z < hh - 1 else None), ao=False)
    awning_l(c, m - 0.4, m + 0.4, v1, 13, 0.32, (40, 110, 80) if level else (60, 100, 80), stripes=6, faded=level == 0)
    x, y = c.P(u0, v1, 18)
    ln(c, [(x, y), (x - 4, y + 2)], CHAR)
    bell(c, x - 7, y + 2)
    if level >= 1 and level < 3:  # the glowing BOOK sign on the roof edge
        face(c, "L", v1, u0 + 0.1, u1 - 0.1, 2 + h - 1, 2 + h + 6, NAVY_D, ao=False, edge=False)
        text_on(c, "BOOK", "L", v1, u0 + 0.1, u1 - 0.1, 2 + h + 5, (255, 214, 110), (255, 214, 110))
    if level <= 2:
        plant(c, u0 + 0.1, v0 + 0.1, u1 - 0.2, v1 - 0.3, 2 + h, f"ho{level}p", n=1)
    if level == 2:  # festival flags along the roof
        bunting(c, (u0, v1), (u1, v1), 2 + h + 1, sag=2, n=8)
    if level == 3:  # the roof garden, the lit name sign, the glass lift on the side
        c.poly([(a, b, 2 + h) for a, b in ((u0 + 0.15, v0 + 0.15), (u1 - 0.15, v0 + 0.15), (u1 - 0.15, v1 - 0.15), (u0 + 0.15, v1 - 0.15))], GRASS)
        for (tu, tv) in ((0.8, 0.8), (1.6, 0.7), (0.7, 1.6)):
            tree(c, tu, tv, 0.8, z=2 + h)
        for k in range(40):
            x, y = c.P(u0 + 0.2 + hv("hoRG", k) * (u1 - u0 - 0.4), v0 + 0.2 + hv("hoRGv", k) * (v1 - v0 - 0.4), 2 + h)
            c.put(x, y, GRASS_L if k % 2 else GRASS_D)
        su0, su1, sv = 0.7, 2.1, 1.7
        for pu in (su0 + 0.1, su1 - 0.1):
            x, y = c.P(pu, sv, 2 + h)
            ln(c, [(x, y), (x, y - 5)], STEEL_D)
        face(c, "L", sv, su0, su1, 2 + h + 5, 2 + h + 13, NAVY_D, ao=False, edge=False)
        text_on(c, "HOTEL", "L", sv, su0, su1, 2 + h + 11, (255, 214, 110), (255, 214, 110))
        lu0, lv0 = u1, 0.9
        prism(c, lu0, lv0, lu0 + 0.22, lv0 + 0.3, 2, 2 + h + 4, GLASS_L, R=lambda i, n, z, hh, b, s: ((STEEL_M, None) if i in (0, n - 1) else ((GOLD, LIT) if 48 <= z < 56 else (GLASS_L, None))),
              L=lambda i, n, z, hh, b, s: ((STEEL_M, None) if i in (0, n - 1) else ((GOLD, LIT) if 48 <= z < 56 else (GLASS_M, None))), roofcol=STEEL_M)
        fountain(c, 1.4, 3.0, 0.32)
        car(c, 2.6, 2.7, YELLOW, along_u=False)
        car(c, 2.6, 3.2, YELLOW, along_u=False)
        crowd(c, [(0.7, 2.6), (0.95, 2.8), (2.1, 3.4), (2.3, 2.55)], "ho3c", bags=True)
        person(c, m + 0.25, v1 + 0.2, NAVY, hat=(226, 72, 64))
        lamp(c, 3.7, 3.7)
        return c
    # the potted tree, a doorman and a trolley of suitcases
    x, y = c.P(u0 - 0.15, v1 + 0.15, 2)
    rect(c, (x - 2, y - 4, x + 2, y), (150, 90, 60))
    tree(c, u0 - 0.15, v1 + 0.15, 0.7, z=6)
    if level >= 1:
        person(c, m + 0.25, v1 + 0.2, NAVY, hat=(226, 72, 64))
        trolley(c, m + 0.5, v1 + 0.35)
    if level == 2:  # the taxi rank, guests with bags
        for k in range(2):
            car(c, 0.4 + k * 0.5, 2.85, YELLOW)
        x, y = c.P(1.5, 2.8, 2)
        ln(c, [(x, y), (x, y - 12)], STEEL_D)
        rect(c, (x - 2, y - 15, x + 3, y - 11), YELLOW)
        crowd(c, [(1.4, 2.55), (1.65, 2.6), (1.9, 2.65)], "ho2c", bags=True)
        lamp(c, 3.7, 3.7)
    elif level == 1:
        tree(c, 3.4, 0.7, 1.0)
        lamp(c, 3.4, 3.4)
    else:
        tree(c, 3.4, 0.7, 1.0)
        fence(c, 0.4, 3.6, 2.4, 3.6, broken=True)
        lamp(c, 3.4, 3.4, col=(255, 210, 140))
    return c


# ── Charity (4x4) ──────────────────────────────────────────────────────────────────────────────────────────────────

def thermometer(c, u, v, fill=0.7, h=26):
    """A giving-day thermometer sign: a white board, a red bar filling up, a bulb at its foot."""
    x, y = c.P(u, v, 2)
    ln(c, [(x - 4, y), (x - 4, y - h)], STEEL_D)
    rect(c, (x - 3, y - h, x + 3, y - 6), WHITE)
    rect(c, (x - 1, y - h + 2, x + 1, y - 8), (230, 230, 236))
    top_ = round((y - 8) - (h - 10) * fill)
    rect(c, (x - 1, top_, x + 1, y - 8), (226, 52, 60), (255, 80, 90))
    ell(c, (x - 2, y - 9, x + 2, y - 5), (226, 52, 60), (255, 80, 90))
    for k in range(4):
        c.put(x + 2, y - 10 - k * 4, CHAR)


def mural(i, n, z, h, base, s):
    """A bright mural: hills, a sun, people holding hands."""
    if z < 3:
        return ((90, 190, 90) if (i // 6) % 2 else (70, 170, 80)), None
    if (i - n * 0.75) ** 2 + (z - h * 0.7) ** 2 < 6:
        return YELLOW, None
    if z < h * 0.55 and i % 5 == 2 and z >= 3:
        return SHIRTS[(i // 5) % 7], None
    if z == round(h * 0.45) and i % 5 in (3, 4):
        return SKIN_D, None
    return (120, 190, 240) if z > h * 0.5 else (160, 210, 245), None


def lm_charity(level):
    c = Kit(4, 4, 120)
    plate(c, 4, 4, key=f"charity{level}", worn=level == 0)
    if level == 3:  # the community centre: solar panels, the mural wall in the garden
        u0, v0, u1, v1, h = 0.45, 0.45, 2.7, 1.9, 26
        block(c, u0, v0, u1, v1, h, CREAM, L=combine(top_band(2, (226, 52, 72)), punched("chC", bay=7, floor=11, ww=4, wh=6, p=0.65, lo=3)),
              R=combine(top_band(2, (226, 52, 72)), punched("chCr", bay=7, floor=11, ww=4, wh=6, p=0.6, lo=3)))
        solar(c, u0 + 0.15, v0 + 0.15, u1 - 0.15, v1 - 0.15, 2 + h + 1, rows=4)
        m = (u0 + u1) / 2
        face(c, "L", v1, m - 0.2, m + 0.2, 2, 12, GLASS_DK, glass("chE", bay=4, floor=11, p=0.95, refl=False), ao=False)
        prism(c, m - 0.32, v1, m + 0.32, v1 + 0.25, 12, 14, (226, 52, 72), rim=0, ao=False)
        face(c, "L", v1, m + 0.35, m + 0.9, 13, 21, WHITE, ao=False, edge=False)
        x, y = c.P(m + 0.5, v1, 20)
        heart(c, x, y + 1)
        lawn(c, 0.35, 2.2, 2.4, 3.75, "chG")
        prism(c, 0.4, 2.25, 2.3, 2.38, 2, 14, CREAM, L=mural, rim=0)
        tree(c, 0.7, 3.3, 0.9)
        tree(c, 2.1, 3.5, 0.8, LEAF_L)
        van(c, 2.9, 2.2, WHITE, along_u=False, band=(226, 52, 72))
        parcels(c, 3.35, 3.2, n=3, key="chP")
        crowd(c, [(1.0, 2.8), (1.15, 2.95), (1.45, 2.85), (1.7, 3.1), (2.6, 3.4)], "ch3c")
        for k, (u, v) in enumerate(((1.15, 2.95), (1.7, 3.1))):  # waving arms
            x, y = c.P(u, v, 2)
            c.put(x - 1, y - 6, SKIN)
            c.put(x - 1, y - 7, SKIN)
        lamp(c, 3.7, 3.7)
        bench(c, 1.2, 3.5)
        return c
    # the shopfront with a heart sign (a hall with a second floor from level 2)
    u0, v0, u1, v1 = (1.3, 1.2, 2.6, 2.3) if level < 2 else (0.9, 0.9, 2.5, 2.2)
    h = 16 if level < 2 else 24
    paint = (236, 226, 214) if level else shade((236, 226, 214), 0.88)
    shop = lambda i, n, z, hh, b, s: ((GLASS_L if s == "L" else GLASS_DK), (LIT if level else (190, 160, 110))) if 2 <= z < 10 and n * 0.1 < i < n * 0.5 else None  # noqa: E731
    block(c, u0, v0, u1, v1, h, paint, L=combine(top_band(2, (226, 52, 72)), shop, punched(f"ch{level}", bay=7, floor=10, ww=4, wh=5, p=0.5, lo=14) if h > 20 else None),
          R=combine(top_band(2, (226, 52, 72)), punched(f"ch{level}r", bay=7, floor=10, ww=4, wh=5, p=0.5, lo=4)))
    face(c, "L", v1, u1 - 0.4, u1 - 0.16, 2, 11, NAVY_D, lambda i, n, z, hh, b, s: ((GLASS_DK, LIT if level else None) if 0 < i < n - 1 and 4 < z < hh - 1 else None), ao=False)
    # the hand-painted heart sign over the window
    face(c, "L", v1, u0 + 0.15, u0 + 0.75, 11, 17, WHITE if level else CREAM, bands([(0, 1, (226, 52, 72))]), ao=False, edge=False)
    x, y = c.P(u0 + 0.38, v1, 16)
    heart(c, x, y + 1, lit=(255, 90, 110) if level else None)
    if level >= 1:  # the GIVE banner in the window
        face(c, "L", v1 + 0.01, u0 + 0.2, u0 + 0.7, 4, 9, (226, 52, 72), ao=False, edge=False)
        text_on(c, "GIVE", "L", v1 + 0.01, u0 + 0.2, u0 + 0.7, 8, WHITE, WHITE)
    # the donation box, the table of jars
    x, y = c.P(u1 - 0.05, v1 + 0.15, 2)
    rect(c, (x - 2, y - 7, x + 2, y), (226, 52, 72))
    ln(c, [(x - 1, y - 6), (x + 1, y - 6)], CHAR)
    prism(c, u0 + 0.1, v1 + 0.2, u0 + 0.6, v1 + 0.4, 6, 7, WOOD, rim=0, ao=False)
    for k in range(2):
        x, y = c.P(u0 + 0.12 + k * 0.45, v1 + 0.4, 2)
        ln(c, [(x, y), (x, y - 4)], WOOD_D)
    for k in range(3):
        x, y = c.P(u0 + 0.18 + k * 0.14, v1 + 0.3, 7)
        rect(c, (x, y - 3, x + 1, y), (190, 226, 240))
        c.put(x, y - 1, GOLD)
    if level >= 1:  # a volunteer with a clipboard, a bike with a delivery crate
        person_with(c, u1 + 0.2, v1 + 0.3, (226, 52, 72), "clip")
        bike(c, u1 + 0.5, v1 - 0.4, box=WOOD)
    if level == 2:  # the giving-day stage: balloons, the thermometer sign, a queue of volunteers
        su0, sv0, su1, sv1 = 2.65, 2.35, 3.7, 3.25
        prism(c, su0, sv0, su1, sv1, 2, 6, (226, 52, 72), L=bands([(1, 2, WHITE)]), R=bands([(1, 2, WHITE)]))
        for pu, pv in ((su0 + 0.05, sv0 + 0.05), (su1 - 0.05, sv0 + 0.05)):
            x, y = c.P(pu, pv, 6)
            ln(c, [(x, y), (x, y - 14)], STEEL_D)
        bunting(c, (su0 + 0.05, sv0 + 0.05), (su1 - 0.05, sv0 + 0.05), 20, sag=2, n=6)
        person(c, 3.1, 2.8, SHIRTS[3], z=6)
        for k, (u, v) in enumerate(((su0, sv1), (su1, sv0), (su1, sv1))):
            x, y = c.P(u, v, 6)
            balloon(c, x, y, SHIRTS[k + 1], 10)
            balloon(c, x + 3, y, SHIRTS[k + 3], 7)
        thermometer(c, 0.5, 2.7, 0.7)
        crowd(c, [(1.0 + k * 0.28, 2.75 + 0.03 * k) for k in range(5)], "ch2q", hats=(226, 52, 72))
        lamp(c, 3.7, 3.7)
    elif level == 1:
        tree(c, 0.6, 0.7, 1.0)
        lamp(c, 3.4, 3.4)
        crowd(c, [(1.6, 2.8)], "ch1c")
    else:
        tree(c, 0.6, 0.7, 1.0)
        fence(c, 0.4, 3.6, 2.4, 3.6, broken=True)
        lamp(c, 3.4, 3.4, col=(255, 210, 140))
    return c


CLIENTS2 = {cid: (globals()[f"lm_{cid}"], 4) for cid in
            ("studio", "games", "news", "port", "energy", "factory", "farm", "carmaker", "telecom", "council", "hotel", "charity")}
BUSINESSES.update(CLIENTS2)
