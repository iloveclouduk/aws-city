"""
Construction stages and re:Play Park (the AWS theme park), plus pocket-park pieces for the districts.

Construction: crane1x1 (a tower crane whose jib overhangs its neighbours) and scaffold1x1.
re:Play Park: park:arch (2×1), park:booth, park:fenceX/Y, and six rides on 2×2 footprints, each themed on a
service by shape and colour only (no logos): park:coaster (Lambda: λ cars), park:flume0..2 (S3: bucket boats),
park:carousel0..2 (Route 53: purple canopy), park:wheel0..2 (EventBridge: magenta wheel, the showpiece),
park:teacups0..2 (SQS: cups queued round a teapot), park:droptower (CloudFront: a mast with a globe on top),
park:maze (Step Functions: a pink hedge maze with states as cards), park:rapids0..2 (Kinesis: rafts on a purple ring
channel that splits into lanes) and park:robots0..2 (AgentCore: two small robots sparring in a teal ring).
Every ride also has park:<ride>:locked: the ride's own silhouette under a tarp behind hoarding, unlit.
Pocket parks: park:gazebo, park:pocket:0..3 (fountain, picnic, flower garden, duck pond), park:amphitheatre (2×2 band
shell) and park:playground.

Animated sets share one canvas size and anchor per set, like windTurbine0..2.
Called from generate_tiles.main as park_art.build(add).
"""
import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from generate_tiles import (A, CLEAR, CON_D, CON_L, CON_M, GLASS, GLASS_D, GRASS, GRASS_D, HH, HW, NAVY, NAVY_D,  # noqa: F401
                            ORANGE, ORANGE_D, WATER, WHITE, WOOD, WOOD_D, Canvas, seeded, shade)
from shapes import bucket, cyl, globe

LIT = (255, 214, 120)
BULB = (255, 236, 150)
RED = (226, 64, 56)
YELLOW = (255, 196, 40)
PINK = (231, 21, 123)       # AWS integration (EventBridge, SQS)
PURPLE = (140, 79, 255)     # AWS networking (Route 53, CloudFront)
LEAF = (122, 161, 22)       # AWS storage (S3)
COMPUTE = (237, 113, 0)     # AWS compute (Lambda)
TEAL = (20, 170, 160)
SKY = (59, 130, 246)
CREAM = (246, 236, 210)
SAND = (230, 212, 164)
TARP = (64, 112, 168)
STONE_C = (160, 156, 148)
CANDY = [PINK, ORANGE, PURPLE, TEAL, SKY, YELLOW]

# 3×5 pixel glyphs for the arch's sign.
FONT = {
    "R": ["XX.", "X.X", "XX.", "X.X", "X.X"], "E": ["XXX", "X..", "XX.", "X..", "XXX"],
    ":": ["...", ".X.", "...", ".X.", "..."], "P": ["XX.", "X.X", "XX.", "X..", "X.."],
    "L": ["X..", "X..", "X..", "X..", "XXX"], "A": [".X.", "X.X", "XXX", "X.X", "X.X"],
    "Y": ["X.X", "X.X", ".X.", ".X.", ".X."],
}
LAMBDA = ["X..", ".X.", ".X.", "X.X", "X.X"]


# ── helpers ───────────────────────────────────────────────────────────────────

def px(c, x, y, col, lit=False):
    c.d.point([(x, y)], fill=A(col))
    if lit:
        c.ld.point([(x, y)], fill=A(col))


def bulb(c, x, y, col=BULB, glow=True):
    """A festoon bulb: one bright pixel by day, a small cross of light at night."""
    c.d.point([(x, y)], fill=A(col))
    c.ld.point([(x, y)], fill=A(col))
    if glow:
        c.ld.point([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], fill=A(col, 150))


def glyph(c, g, x, y, col, lit=False, shear=0):
    """A pixel glyph at screen (x, y) = top-left; shear 1/-1 slopes it along a left/right face."""
    for r, row in enumerate(g):
        for k, ch in enumerate(row):
            if ch == "X":
                px(c, x + k, y + r + (k // 2) * shear, col, lit)


def text_l(c, s, x, y, col, lit=False):
    """Pixel text along a left (v = const) face: each glyph steps 4 px right and 2 px down."""
    for i, ch in enumerate(s):
        glyph(c, FONT[ch], x + i * 4, y + i * 2, col, lit)


def ell(c, x, y, rx, ry, fill, d=None, outline=None):
    (d or c.d).ellipse((x - rx, y - ry, x + rx, y + ry), fill=A(fill) if fill else None, outline=A(outline) if outline else None)


def disc(c, x, y, rx, ry, h, col, top=None):
    """A round platform in screen space: (x, y) is the centre of its base, h its height in px."""
    ell(c, x, y, rx, ry, shade(col, 0.7))
    c.d.rectangle((x - rx, y - h, x + rx, y), fill=A(shade(col, 0.7)))
    c.d.rectangle((x - rx, y - h, x - rx // 3, y), fill=A(shade(col, 0.85)))
    ell(c, x, y - h, rx, ry, top or col)
    return y - h


def path_points(nodes, step=1.0):
    """Resample a 3-D polyline [(u, v, z), ...] at roughly `step` screen px; returns [(u, v, z), ...]."""
    out = []
    for (u0, v0, z0), (u1, v1, z1) in zip(nodes, nodes[1:]):
        dx, dy = (u1 - v1 - u0 + v0) * HW, (u1 + v1 - u0 - v0) * HH - (z1 - z0)
        n = max(1, round(math.hypot(dx, dy) / step))
        for k in range(n):
            t = k / n
            out.append((u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, z0 + (z1 - z0) * t))
    out.append(nodes[-1])
    return out


def post(c, u, v, z0, z1, col, w=0.03):
    c.box(u - w, v - w, u + w, v + w, z0, z1, col)


def hoarding_edge(c, fw, fh, h=11):
    """Locked rides: friendly white hoarding with an orange chevron band along the two front edges."""
    for k in range(int(fw * 3)):
        a, b = k / 3 + 0.02, (k + 1) / 3 - 0.02
        c.box(a, fh - 0.08, b, fh - 0.02, 0, h, WHITE)
    for k in range(int(fh * 3)):
        a, b = k / 3 + 0.02, (k + 1) / 3 - 0.02
        c.box(fw - 0.08, a, fw - 0.02, b, 0, h, WHITE)
    c.lface(fh - 0.02, 0.02, fw - 0.02, 4, 6, ORANGE)
    c.rface(fw - 0.02, 0.02, fh - 0.02, 4, 6, shade(ORANGE, 0.85))
    c.lface(fh - 0.02, 0.02, fw - 0.02, h - 1, h, ORANGE_D)
    c.rface(fw - 0.02, 0.02, fh - 0.02, h - 1, h, ORANGE_D)
    for t in range(int(fw) + 1):
        post(c, min(t, fw - 0.05), fh - 0.05, 0, h + 2, WOOD)
    for t in range(int(fh)):
        post(c, fw - 0.05, t + 0.05, 0, h + 2, WOOD)


def locked(ride, fw, fh, zmax, pad=2, close=5):
    """The ride's silhouette draped in a blue tarp (gaps closed, folds kept from the ride's own shading, rope
    lashings), standing behind hoarding. No lights."""
    src = ride.img
    a = src.getchannel("A").point(lambda v: 255 if v else 0)
    m = close
    big = Image.new("L", (a.width + 2 * m, a.height + 2 * m), 0)
    big.paste(a, (m, m))  # pad so the closing never sticks to the canvas edge
    big = big.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
    closed = big.crop((m, m, m + a.width, m + a.height))
    lum = src.convert("L")
    c = Canvas(fw, fh, zmax, pad)
    tarp = Image.new("RGBA", src.size, CLEAR)
    tp = tarp.load()
    lp, ap, cp = lum.load(), a.load(), closed.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            if not cp[x, y]:
                continue
            level = lp[x, y] if ap[x, y] else 120
            f = 0.72 if level < 90 else (0.9 if level < 170 else 1.08)
            tp[x, y] = A(shade(TARP, f))
    # ropes: diagonal lashings every 9 px, only on the tarp
    rope = Image.new("L", src.size, 0)
    rd = ImageDraw.Draw(rope)
    for k in range(-h, w + h, 9):
        rd.line([(k, 0), (k + h // 2, h)], fill=255)
    rope = ImageChops.multiply(rope, closed.filter(ImageFilter.MinFilter(3)))
    tarp.paste(Image.new("RGBA", src.size, A(shade(TARP, 0.55))), (0, 0), rope)
    # the tarp's bottom hem, weighted with sandbags
    c.img.alpha_composite(tarp)
    hoarding_edge(c, fw, fh)
    return c


# ── construction ──────────────────────────────────────────────────────────────

def lattice_mast(c, u, v, z0, z1, col, r=0.09):
    """A square lattice mast: dark core, bright chords on the edges, zigzag bracing on both faces."""
    c.box(u - r, v - r, u + r, v + r, z0, z1, shade(col, 0.42), left=shade(col, 0.42), right=shade(col, 0.32))
    xl, _ = c.P(u - r, v + r, 0)
    xm, _ = c.P(u + r, v + r, 0)
    xr, _ = c.P(u + r, v - r, 0)
    _, yb = c.P(u + r, v + r, z0)
    _, yt = c.P(u + r, v + r, z1)
    dark = shade(col, 0.78)
    for x in (xl, xm, xr):
        c.d.line([(x, yb), (x, yt)], fill=A(col if x != xr else dark))
    step = 5
    for k, y in enumerate(range(yb, yt, -step)):
        y1 = max(yt, y - step)
        # left face (from xl to xm, sloping down 1 per 2)
        if k % 2 == 0:
            c.d.line([(xl, y - (0)), (xm, y1 + (xm - xl) // 2)], fill=A(col))
            c.d.line([(xm, y), (xr, y1 - (xr - xm) // 2)], fill=A(dark))
        else:
            c.d.line([(xm, y + (xm - xl) // 2 - (xm - xl) // 2), (xl, y1)], fill=A(col))
            c.d.line([(xr, y - (xr - xm) // 2), (xm, y1)], fill=A(dark))


def truss(c, a, b, col, depth=3):
    """A horizontal screen-space truss from a to b (x, y): top and bottom chords with a zigzag."""
    (x0, y0), (x1, y1) = a, b
    c.d.line([(x0, y0), (x1, y1)], fill=A(col))
    c.d.line([(x0, y0 + depth), (x1, y1 + depth)], fill=A(shade(col, 0.75)))
    n = max(1, abs(x1 - x0) // 3)
    for k in range(n):
        xa = x0 + (x1 - x0) * k // n
        xb = x0 + (x1 - x0) * (k + 1) // n
        ya = y0 + (y1 - y0) * k // n
        yb = y0 + (y1 - y0) * (k + 1) // n
        if k % 2 == 0:
            c.d.line([(xa, ya), (xb, yb + depth)], fill=A(shade(col, 0.85)))
        else:
            c.d.line([(xa, ya + depth), (xb, yb)], fill=A(shade(col, 0.85)))


def crane():
    """A tower crane: concrete footing, yellow lattice mast, an orange cab, a long jib that overhangs the
    neighbouring tiles, a counter-jib with concrete counterweights, a trolley and hook carrying a steel beam,
    pendant ties to the tower head and red aircraft beacons at night."""
    c = Canvas(1, 1, 100, pad=20)
    c.box(0.22, 0.22, 0.78, 0.78, 0, 4, CON_M, top=CON_L)
    for (u, v) in ((0.3, 0.3), (0.7, 0.3), (0.3, 0.7), (0.7, 0.7)):
        c.box(u - 0.05, v - 0.05, u + 0.05, v + 0.05, 4, 6, CON_D)
    lattice_mast(c, 0.5, 0.5, 4, 74, YELLOW)
    # slewing ring + cab
    c.box(0.36, 0.36, 0.64, 0.64, 74, 77, NAVY)
    c.box(0.44, 0.52, 0.7, 0.74, 70, 80, COMPUTE)
    c.lface(0.74, 0.47, 0.67, 74, 78, GLASS, light=True)
    c.rface(0.7, 0.55, 0.7, 74, 78, GLASS_D, light=True)
    hx, hy = c.P(0.5, 0.5, 80)
    # tower head (an A-frame peak)
    c.d.polygon([(hx - 3, hy), (hx + 3, hy), (hx, hy - 14)], fill=A(shade(YELLOW, 0.5)))
    c.d.line([(hx - 3, hy), (hx, hy - 14), (hx + 3, hy)], fill=A(YELLOW))
    c.d.line([(hx - 2, hy - 5), (hx + 2, hy - 5)], fill=A(YELLOW))
    peak = (hx, hy - 14)
    # jib (right, long) and counter-jib (left, short), screen-horizontal like a real crane seen side-on
    jl, jr = hx - 16, hx + 32
    truss(c, (hx, hy - 1), (jr, hy - 1), YELLOW, depth=3)
    c.d.line([(jr, hy - 1), (jr, hy + 2)], fill=A(YELLOW))
    truss(c, (jl, hy), (hx, hy), YELLOW, depth=2)
    # pendant ties
    c.d.line([peak, (jr - 6, hy - 1)], fill=A(CON_D))
    c.d.line([peak, (jl + 1, hy)], fill=A(CON_D))
    # counterweights
    c.d.rectangle((jl, hy + 3, jl + 7, hy + 9), fill=A(CON_M))
    c.d.rectangle((jl, hy + 3, jl + 2, hy + 9), fill=A(CON_L))
    c.d.line([(jl, hy + 6), (jl + 7, hy + 6)], fill=A(CON_D))
    # trolley, cable, hook block and a steel beam on the hook
    tx = hx + 24
    c.d.rectangle((tx - 2, hy + 2, tx + 2, hy + 4), fill=A(NAVY))
    cy = hy + 30
    c.d.line([(tx - 1, hy + 4), (tx - 1, cy)], fill=A(CON_D))
    c.d.line([(tx + 1, hy + 4), (tx + 1, cy)], fill=A(CON_D))
    c.d.rectangle((tx - 2, cy, tx + 2, cy + 3), fill=A(YELLOW))
    c.d.point([(tx, cy + 4), (tx + 1, cy + 5)], fill=A(NAVY_D))
    c.d.line([(tx, cy + 5), (tx - 7, cy + 9)], fill=A(CON_D))
    c.d.line([(tx, cy + 5), (tx + 7, cy + 9)], fill=A(CON_D))
    c.d.polygon([(tx - 10, cy + 9), (tx + 10, cy + 9), (tx + 10, cy + 12), (tx - 10, cy + 12)], fill=A(COMPUTE))
    c.d.line([(tx - 10, cy + 9), (tx + 10, cy + 9)], fill=A(shade(COMPUTE, 1.2)))
    c.d.line([(tx - 10, cy + 12), (tx + 10, cy + 12)], fill=A(ORANGE_D))
    # beacons
    for (x, y) in (peak, (jr, hy - 2), (jl, hy - 1)):
        c.d.point([(x, y - 1)], fill=A(RED))
        c.ld.rectangle((x - 1, y - 2, x + 1, y), fill=A(RED))
    return c


def scaffold():
    """Scaffolding round a rising concrete core: steel tubes, timber planks on three lifts, cross-bracing,
    a ladder, rebar on top and a green safety net hung on the right face's lower lifts."""
    c = Canvas(1, 1, 56)
    c.box(0.06, 0.06, 0.94, 0.94, 0, 1, CON_M, top=(170, 160, 146))
    c.box(0.2, 0.2, 0.74, 0.74, 1, 34, CON_L)
    for z in (11, 22, 33):
        c.lface(0.74, 0.2, 0.74, z, z + 1, shade(CON_L, 0.8))
        c.rface(0.74, 0.2, 0.74, z, z + 1, shade(CON_L, 0.62))
    c.lface(0.74, 0.3, 0.46, 3, 9, NAVY_D)
    c.lface(0.74, 0.3, 0.46, 14, 19, GLASS_D)
    c.rface(0.74, 0.3, 0.46, 14, 19, shade(GLASS_D, 0.8))
    for k in range(4):  # rebar
        x, y = c.P(0.26 + k * 0.14, 0.24, 34)
        c.d.line([(x, y), (x, y - 5)], fill=A((150, 90, 60)))
    steel = (176, 186, 196)
    front = [(0.06, 0.92), (0.5, 0.92), (0.92, 0.92), (0.92, 0.5), (0.92, 0.06)]
    for u, v in front:
        post(c, u, v, 1, 44, steel, w=0.025)
    for z in (12, 24, 36):  # planks + guard rails
        c.box(0.04, 0.8, 0.94, 0.94, z, z + 2, WOOD, top=shade(WOOD, 1.08))
        c.box(0.8, 0.04, 0.94, 0.8, z, z + 2, WOOD, top=shade(WOOD, 1.08))
        c.line((0.06, 0.94, z + 7), (0.94, 0.94, z + 7), steel)
        c.line((0.94, 0.94, z + 7), (0.94, 0.06, z + 7), steel)
        c.lface(0.94, 0.06, 0.94, z, z + 1, WOOD_D)
    # cross-bracing on the front face
    for z0, z1 in ((1, 12), (12, 24), (24, 36)):
        c.line((0.06, 0.94, z0), (0.5, 0.94, z1), shade(steel, 0.8))
        c.line((0.5, 0.94, z1), (0.92, 0.94, z0), shade(steel, 0.8))
    # ladder
    for t in (0.3, 0.4):
        c.line((t, 0.95, 1), (t, 0.95, 36), WOOD_D)
    for z in range(4, 36, 3):
        c.line((0.3, 0.95, z), (0.4, 0.95, z), WOOD)
    # safety net on the right face's lower lifts (semi-transparent green with a mesh)
    net = (40, 150, 70)
    c.rface(0.95, 0.06, 0.9, 2, 24, net)
    for z in range(4, 24, 3):
        c.line((0.95, 0.9, z), (0.95, 0.06, z), shade(net, 0.75))
    for k in range(6):
        v = 0.12 + k * 0.14
        c.line((0.95, v, 2), (0.95, v, 24), shade(net, 0.75))
    c.line((0.95, 0.9, 24), (0.95, 0.06, 24), shade(net, 1.3))
    # a warning lamp on top
    x, y = c.P(0.92, 0.92, 44)
    c.d.point([(x, y - 1)], fill=A(ORANGE))
    c.ld.rectangle((x - 1, y - 2, x + 1, y), fill=A(ORANGE))
    return c


# ── re:Play Park: entrance ────────────────────────────────────────────────────

def candy_post(c, u, v, z0, z1, cols, r=0.1):
    c.box(u - r, v - r, u + r, v + r, z0, z1, WHITE)
    for k, z in enumerate(range(z0 + 2, z1 - 2, 6)):
        col = cols[k % len(cols)]
        c.lface(v + r, u - r, u + r, z, z + 3, col)
        c.rface(u + r, v - r, v + r, z, z + 3, shade(col, 0.8))


def arch():
    """The park gate (2×1, the path runs through along v): candy-striped pillars topped with balls, a navy
    banner arched over the path with "RE:PLAY" in lit pixel letters, a bulb border and pennants."""
    c = Canvas(2, 1, 64)
    c.box(0.0, 0.25, 2.0, 0.75, 0, 1, CON_L, top=(226, 220, 206))
    for u in (0.2, 1.8):
        c.box(u - 0.16, 0.34, u + 0.16, 0.66, 0, 3, CON_M)
        candy_post(c, u, 0.5, 3, 40, [PINK, ORANGE, PURPLE], r=0.11)
        x, y = c.P(u, 0.5, 40)
        ell(c, x, y - 3, 3, 3, YELLOW)
        px(c, x - 1, y - 4, (255, 240, 180))
        bulb(c, x, y - 7, BULB)
    # the banner: a board on the v = 0.5 plane, with an arched top
    u0, u1 = 0.05, 1.95
    zb, zt = 30, 42
    c.box(u0, 0.44, u1, 0.56, zb, zt, NAVY)
    xa, ya = c.P(u0, 0.56, zt)
    xb, yb = c.P(u1, 0.56, zt)
    # the arch crown above the board (a half-ellipse sheared along the face)
    w = xb - xa
    for i in range(w + 1):
        t = i / w
        bump = round(7 * math.sin(math.pi * t))
        y = ya + round((yb - ya) * t)
        c.d.line([(xa + i, y), (xa + i, y - bump)], fill=A(NAVY))
        c.d.point([(xa + i, y - bump)], fill=A(ORANGE))
        if i % 4 == 2 and 0.05 < t < 0.95:
            bulb(c, xa + i, y - bump - 1, BULB, glow=False)
    c.lface(0.56, u0, u1, zb, zb + 1, ORANGE)
    c.lface(0.56, u0, u1, zt - 1, zt, ORANGE)
    # pixel letters, centred
    tx, ty = c.P(0.12 + 0.07, 0.56, zt - 3)
    text_l(c, "RE:PLAY", tx + 1, ty, WHITE, lit=True)
    # bulbs on the board's bottom edge
    for k in range(9):
        u = 0.15 + k * 0.21
        x, y = c.P(u, 0.56, zb)
        bulb(c, x, y + 1, (255, 200, 120), glow=False)
    # pennant strings from each pillar to the ground beside it
    for u, du in ((0.2, -0.18), (1.8, 0.18)):
        for k in range(4):
            x, y = c.P(u + du * (k + 1) / 4, 0.5, 38 - k * 8)
            c.d.polygon([(x - 1, y), (x + 1, y), (x, y + 3)], fill=A(CANDY[k]))
    return c


def booth():
    """Ticket booth: a little candy-coloured kiosk with a lit window, a striped awning and a pennant on top."""
    c = Canvas(1, 1, 50)
    c.box(0.15, 0.15, 0.85, 0.85, 0, 2, CON_M, top=CON_L)
    c.box(0.25, 0.25, 0.75, 0.75, 2, 22, CREAM)
    c.lface(0.75, 0.25, 0.75, 2, 5, PINK)
    c.rface(0.75, 0.25, 0.75, 2, 5, shade(PINK, 0.8))
    c.lface(0.75, 0.34, 0.66, 9, 17, GLASS, light=True)
    c.lface(0.75, 0.34, 0.66, 9, 10, WHITE)
    c.box(0.3, 0.75, 0.7, 0.85, 8, 9, WOOD)  # the counter
    c.rface(0.75, 0.38, 0.62, 9, 17, GLASS_D, light=True)
    # striped awning, sloping out over the counter
    for k in range(5):
        a, b = 0.2 + k * 0.12, 0.32 + k * 0.12
        col = PINK if k % 2 == 0 else WHITE
        c.poly([(a, 0.75, 22), (b, 0.75, 22), (b, 0.9, 18), (a, 0.9, 18)], col)
        c.poly([(0.75, a, 22), (0.75, b, 22), (0.9, b, 18), (0.9, a, 18)], shade(col, 0.82))
    c.box(0.22, 0.22, 0.78, 0.78, 22, 25, PURPLE)
    c.pyramid(0.22, 0.22, 0.78, 0.78, 25, 10, PINK)
    x, y = c.P(0.5, 0.5, 35)
    c.d.line([(x, y), (x, y - 9)], fill=A(CON_L))
    c.d.polygon([(x + 1, y - 9), (x + 6, y - 7), (x + 1, y - 5)], fill=A(ORANGE))
    bulb(c, x, y - 10, BULB)
    return c


def fence(along_u):
    """Festive park fence: white posts with coloured ball finials, two rails and bunting on a string."""
    c = Canvas(1, 1, 16)
    pt = (lambda t: (t, 0.5)) if along_u else (lambda t: (0.5, t))
    rail = (236, 238, 242)
    for t in (0.04, 0.5):
        u, v = pt(t)
        post(c, u, v, 0, 9, rail, w=0.035)
    for t, col in ((0.04, PINK), (0.5, SKY)):
        x, y = c.P(*pt(t), 10)
        c.d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=A(col))
        c.ld.point([(x, y)], fill=A(LIT))
    for z in (3, 7):
        a, b = (*pt(0), z), (*pt(1), z)
        c.line(a, b, rail)
    for k in range(4):  # bunting below the top rail
        t = 0.08 + k * 0.24
        x, y = c.P(*pt(t), 7)
        c.d.polygon([(x - 1, y + 1), (x + 2, y + 1), (x, y + 3)], fill=A(CANDY[k]))
    return c


# ── rides ─────────────────────────────────────────────────────────────────────

def track(c, pts, col, lights_every=7, ties=True):
    """A coaster rail along screen points: a dark 3-px ribbon with a bright top rail, ties and bulbs."""
    sp = [c.P(*p) for p in pts]
    for i in range(len(sp) - 1):
        (x0, y0), (x1, y1) = sp[i], sp[i + 1]
        c.d.line([(x0, y0 + 1), (x1, y1 + 1)], fill=A(shade(col, 0.6)), width=2)
        c.d.line([(x0, y0), (x1, y1)], fill=A(col))
        c.d.line([(x0, y0 - 1), (x1, y1 - 1)], fill=A(shade(col, 1.15)))
        if ties and i % 4 == 0:
            c.d.point([(x0, y0 + 2)], fill=A(NAVY_D))
        if lights_every and i % lights_every == 3:
            c.ld.point([(x0, y0 - 1)], fill=A(BULB))


def supports(c, pts, every=6, col=CON_M, min_z=6):
    for i, (u, v, z) in enumerate(pts):
        if i % every == 0 and z > min_z:
            x, y = c.P(u, v, z)
            _, yg = c.P(u, v, 0)
            c.d.line([(x, y + 2), (x, yg)], fill=A(col))
            c.d.point([(x, yg)], fill=A(shade(col, 0.7)))


def coaster():
    """Lambda Coaster: an orange steel coaster on a plaza: a chain lift up the left, a drop along the back, a
    vertical loop on the right and a station at the front where three λ-marked cars wait. Bulbs along the
    track at night."""
    c = Canvas(2, 2, 72)
    c.box(0.04, 0.04, 1.96, 1.96, 0, 1, CON_L, top=(226, 220, 206))
    for k in range(1, 4):
        c.line((0.04, k * 0.5, 1), (1.96, k * 0.5, 1), shade((226, 220, 206), 0.92))
    lift = [(0.3, 1.45, 7), (0.3, 0.3, 52)]
    crest = [(0.3, 0.3, 52), (0.45, 0.2, 55), (0.7, 0.2, 52)]
    drop = [(0.7, 0.2, 52), (1.15, 0.22, 12), (1.5, 0.3, 6), (1.65, 0.5, 6)]
    vc, zc, rz, rv = 1.0, 21, 15, 0.55
    loop = [(1.65, 0.5, 6), (1.7, vc - 0.1, 6)]
    for k in range(1, 33):
        th = k / 32 * 2 * math.pi
        loop.append((1.7 - 0.14 * k / 32, vc - 0.1 + rv * math.sin(th), zc - rz * math.cos(th)))
    home = [(1.56, 0.9, 6), (1.56, 1.45, 6), (1.4, 1.62, 6), (0.5, 1.62, 6), (0.3, 1.45, 7)]
    back = path_points(lift + crest[1:] + drop[1:], step=1.5)
    # lift-hill trestle: a ladder of posts under the chain lift, every 10 px
    for t in (0.45, 0.8):
        u, v, z = 0.3, 1.45 + (0.3 - 1.45) * t, 7 + 45 * t
        post(c, u, v, 1, z - 2, CON_M, w=0.025)
    post(c, 0.45, 0.2, 1, 52, CON_M, w=0.03)
    post(c, 1.0, 0.21, 1, 25, CON_M, w=0.025)
    track(c, back, ORANGE)
    # chain-lift dogs: dark ticks up the lift
    for (u, v, z) in path_points(lift, step=4)[1:-1]:
        x, y = c.P(u, v, z)
        c.d.point([(x, y)], fill=A(NAVY_D))
    lp = path_points(loop, step=1.0)
    half = len(lp) * 5 // 9
    track(c, lp[:half], ORANGE)          # entry and the loop's far side
    post(c, 1.66, vc - 0.1, 1, 6, CON_M, w=0.05)
    track(c, lp[half - 1:], ORANGE)      # the loop's near side and the exit
    track(c, path_points(home, step=1.5), ORANGE)
    # station: a striped canopy on the left, the platform along the front
    c.box(0.45, 1.72, 1.45, 1.92, 1, 4, CON_M, top=CON_L)
    c.box(0.05, 1.35, 0.42, 1.92, 1, 14, CREAM)
    c.lface(1.92, 0.12, 0.34, 4, 10, GLASS, light=True)
    c.rface(0.42, 1.45, 1.8, 6, 10, GLASS_D, light=True)
    for k in range(4):
        a0, a1 = 1.33 + k * 0.15, 1.48 + k * 0.15
        col = COMPUTE if k % 2 == 0 else WHITE
        c.poly([(0.0, a0, 18), (0.48, a0, 18), (0.48, a1, 18), (0.0, a1, 18)], col)
    c.lface(1.95, 0.0, 0.48, 16, 18, NAVY)
    c.rface(0.48, 1.33, 1.95, 16, 18, shade(NAVY, 0.8))
    x, y = c.P(0.24, 1.64, 18)
    bulb(c, x, y - 1)
    # three cars at the station, each with a white λ on its side
    for k in range(3):
        u = 0.62 + k * 0.27
        c.box(u, 1.52, u + 0.24, 1.72, 6, 12, COMPUTE)
        c.lface(1.72, u, u + 0.24, 11, 12, shade(COMPUTE, 1.2))
        x, y = c.P(u + 0.06, 1.72, 11)
        glyph(c, LAMBDA, x, y + 1, WHITE)
        hx, hy = c.P(u + 0.12, 1.62, 14)
        c.d.rectangle((hx - 1, hy - 1, hx, hy), fill=A((232, 190, 150)))
    for k in range(5):
        x, y = c.P(0.5 + k * 0.22, 1.92, 4)
        bulb(c, x, y, BULB, glow=False)
    return c


def flume_path():
    top = [(0.75, 0.35, 40), (1.6, 0.35, 38), (1.65, 0.75, 36)]
    drop = [(1.65, 0.75, 36), (1.1, 1.05, 22), (0.75, 1.25, 3)]
    out = [(0.75, 1.25, 3), (0.75, 1.62, 2), (1.3, 1.65, 2), (1.95, 1.65, 2)]
    return top, drop, out


def channel(c, pts, wall=WOOD, water=WATER):
    sp = [c.P(*p) for p in pts]
    for i in range(len(sp) - 1):
        (x0, y0), (x1, y1) = sp[i], sp[i + 1]
        c.d.line([(x0, y0 + 1), (x1, y1 + 1)], fill=A(shade(wall, 0.7)), width=5)
        c.d.line([(x0, y0 - 1), (x1, y1 - 1)], fill=A(water), width=2)
        c.d.line([(x0, y0 + 2), (x1, y1 + 2)], fill=A(wall))
    for i in range(0, len(sp) - 1, 7):
        x, y = sp[i]
        c.d.point([(x + 1, y - 1)], fill=A(shade(water, 1.35)))


def flume(f):
    """S3 Log Flume: a green timber tower at the back, a water channel along its top, a steep chute into a splash
    pool and an exit channel; bucket-shaped boats ride it (frames move them on) and the splash rises and falls."""
    c = Canvas(2, 2, 72)
    c.box(0.04, 0.04, 1.96, 1.96, 0, 1, CON_L, top=(212, 206, 192))
    top, drop, out = flume_path()
    # the tower: green timber frame with a stair, under the channel's start
    c.box(0.25, 0.2, 0.75, 0.6, 1, 38, shade(LEAF, 0.7))
    for z in range(6, 38, 8):
        c.lface(0.6, 0.25, 0.75, z, z + 2, LEAF)
        c.rface(0.75, 0.2, 0.6, z, z + 2, shade(LEAF, 0.8))
    for k in range(7):
        x, y = c.P(0.3 + k * 0.06, 0.6, 4 + k * 5)
        c.d.line([(x, y), (x + 2, y + 1)], fill=A(WOOD))
    c.box(0.2, 0.15, 0.8, 0.65, 38, 40, WOOD)
    c.pyramid(0.2, 0.15, 0.8, 0.65, 46, 8, LEAF)
    for (u, v) in ((0.22, 0.17), (0.78, 0.17), (0.22, 0.63), (0.78, 0.63)):
        post(c, u, v, 40, 46, WOOD_D, w=0.02)
    x, y = c.P(0.5, 0.4, 54)
    bulb(c, x, y, (180, 255, 140))
    # trestles under the top run and the chute
    for p in path_points(top + drop[1:], step=6):
        u, v, z = p
        if z > 6:
            post(c, u, v + 0.06, 0, z - 2, WOOD_D, w=0.025)
    channel(c, path_points(top, step=1))
    # pool (behind the chute's foot)
    c.box(0.15, 1.15, 1.45, 1.9, 0, 3, CON_M, top=CON_M)
    c.poly([(0.2, 1.2, 3), (1.4, 1.2, 3), (1.4, 1.85, 3), (0.2, 1.85, 3)], WATER)
    r = seeded("flume-pool")
    for _ in range(8):
        x, y = c.P(0.3 + r(100) / 100, 1.3 + r(50) / 100, 3)
        c.d.line([(x, y), (x + 2, y)], fill=A(shade(WATER, 1.3)))
    channel(c, path_points(drop, step=1))
    channel(c, path_points(out[1:], step=1))
    # boats: S3 buckets riding the line (three along the route, phased by frame)
    route = path_points(top + drop[1:] + out[1:], step=1)
    n = len(route)
    for k in range(3):
        i = int((k / 3 + f / 9) * n) % n
        u, v, z = route[i]
        x, y = c.P(u, v, z)
        bucket(c, u, v, z + 1, LEAF, s=0.75)
        c.d.point([(x - 1, y - 7), (x + 1, y - 7)], fill=A((232, 190, 150)))
    # the splash where the chute meets the pool
    sx, sy = c.P(0.8, 1.3, 4)
    big = [9, 6, 3][f]
    for k in range(7):
        ang = math.pi * (0.15 + 0.7 * k / 6)
        ex = sx + round(math.cos(ang) * (big + 2)) * (-1)
        ey = sy - round(math.sin(ang) * big)
        c.d.line([(sx, sy), (ex, ey)], fill=A((214, 240, 255)))
        c.d.point([(ex, ey - 1)], fill=A(WHITE))
    ell(c, sx, sy, 4 + f, 2, (214, 240, 255))
    # a lamp post by the pool, lit at night
    x, y = c.P(1.55, 1.95, 0)
    c.d.line([(x, y), (x, y - 16)], fill=A(NAVY))
    bulb(c, x, y - 17, LIT)
    return c


HORSE = [".....XX", "....XXX", "XXXXXX.", "XXXXX..", "X...X..", "X...X.."]


def horse(c, x, y, col, face_right):
    for r, row in enumerate(HORSE):
        for k, ch in enumerate(row):
            if ch == "X":
                xx = x + (k - 3 if face_right else 3 - k)
                c.d.point([(xx, y + r)], fill=A(col if r < 4 else shade(col, 0.7)))
    c.d.point([(x, y + 2)], fill=A(RED))  # the saddle


def carousel(f):
    """Route 53 Carousel: a round deck, a mirrored centre column, eight horses on gilded poles that rise and fall,
    and a purple-and-white striped canopy with a scalloped valance and a ring of bulbs (frames turn it)."""
    c = Canvas(2, 2, 66)
    cx, cy = c.P(1, 1, 0)
    c.box(0.06, 0.06, 1.94, 1.94, 0, 1, CON_L, top=(226, 220, 206))
    deck = disc(c, cx, cy, 27, 13, 4, shade(PURPLE, 0.6), top=(232, 222, 200))
    ell(c, cx, deck, 20, 9, None, outline=shade((232, 222, 200), 0.85))
    rot = f * (2 * math.pi / 8) / 3
    horses = []
    for k in range(8):
        th = rot + k * 2 * math.pi / 8
        hx, hy = cx + round(math.cos(th) * 19), deck + round(math.sin(th) * 9)
        bob = round(2 * math.sin(th * 2 + k))
        horses.append((hy, hx, th, bob, k))
    gold = (232, 186, 70)
    canopy_z = 30

    def draw_horse(hy, hx, th, bob, k):
        c.d.line([(hx, hy), (hx, hy - canopy_z + 2)], fill=A(gold))
        col = [WHITE, (210, 160, 110), (90, 70, 60), WHITE][k % 4]
        horse(c, hx, hy - 15 - bob, col, math.sin(th) > 0)

    for h in sorted(horses):
        if h[0] <= deck:
            draw_horse(*h)
    # centre column with mirror panels
    c.d.rectangle((cx - 5, deck - canopy_z, cx + 5, deck), fill=A(shade(PURPLE, 0.75)))
    for k, x in enumerate(range(cx - 4, cx + 5, 3)):
        c.d.rectangle((x, deck - canopy_z + 6, x + 1, deck - 4), fill=A(GLASS if k % 2 == 0 else GLASS_D))
        c.ld.rectangle((x, deck - canopy_z + 8, x, deck - 6), fill=A(LIT, 200))
    for h in sorted(horses):
        if h[0] > deck:
            draw_horse(*h)
    # canopy: a striped cone from the rim (y = top) up to the apex
    top = deck - canopy_z
    rx, ry, hgt = 29, 14, 14
    n = 16
    segs = []
    for k in range(n):
        a0 = rot * 2 + k * 2 * math.pi / n
        a1 = a0 + 2 * math.pi / n
        segs.append((math.sin((a0 + a1) / 2), a0, a1, k))
    for s, a0, a1, k in sorted(segs):
        p0 = (cx + math.cos(a0) * rx, top + math.sin(a0) * ry)
        p1 = (cx + math.cos(a1) * rx, top + math.sin(a1) * ry)
        mid = math.cos((a0 + a1) / 2)
        col = PURPLE if k % 2 == 0 else WHITE
        col = shade(col, 1.0 - 0.18 * max(0, mid))
        c.d.polygon([(cx, top - hgt), p0, p1], fill=A(col))
    # valance: a scalloped skirt round the front of the rim, with bulbs
    for k in range(18):
        a = k * math.pi / 17
        x, y = cx + round(math.cos(a) * rx), top + round(math.sin(a) * ry)
        col = PINK if k % 2 == 0 else (255, 200, 60)
        c.d.rectangle((x - 2, y, x + 2, y + 2), fill=A(col))
        c.d.point([(x, y + 3)], fill=A(col))
        if k % 2 == 1:
            bulb(c, x, y + 1, BULB, glow=False)
    # finial + pennant
    c.d.line([(cx, top - hgt), (cx, top - hgt - 7)], fill=A(gold))
    c.d.polygon([(cx + 1, top - hgt - 7), (cx + 6, top - hgt - 5), (cx + 1, top - hgt - 3)], fill=A(PINK))
    bulb(c, cx, top - hgt - 8, BULB)
    return c


def wheel(f):
    """EventBridge Ferris Wheel, the park's showpiece: a magenta double rim on a white A-frame, sixteen spokes,
    eight colourful gondolas that always hang level (frames turn the wheel), a boarding deck and a rim of lights
    that glows at night."""
    pad = 8
    c = Canvas(2, 2, 104, pad=pad)
    c.box(0.06, 0.06, 1.94, 1.94, 0, 1, CON_L, top=(226, 220, 206))
    c.box(0.55, 0.55, 1.45, 1.45, 1, 4, CON_M, top=CON_L)
    gx, gy = c.P(1, 1, 4)
    hub = (gx, gy - 54)
    R = 37
    hx, hy = hub
    frame_col, leg = WHITE, shade(WHITE, 0.72)
    # back legs
    for dx in (-24, 24):
        c.d.line([(hx, hy), (hx + dx + 3, gy - 6)], fill=A(leg), width=2)
    # outer and inner rims (back), spokes
    rot = f * (2 * math.pi / 8) / 3
    for k in range(16):
        a = rot + k * 2 * math.pi / 16
        c.d.line([hub, (hx + round(math.cos(a) * R), hy + round(math.sin(a) * R))], fill=A(shade(PINK, 0.9)))
    c.d.ellipse((hx - R, hy - R, hx + R, hy + R), outline=A(PINK), width=2)
    c.d.ellipse((hx - R + 5, hy - R + 5, hx + R - 5, hy + R - 5), outline=A(shade(PINK, 0.75)))
    c.ld.ellipse((hx - R, hy - R, hx + R, hy + R), outline=A((255, 120, 200)), width=1)
    for k in range(32):  # rim bulbs
        a = rot + k * 2 * math.pi / 32
        x, y = hx + round(math.cos(a) * R), hy + round(math.sin(a) * R)
        c.d.point([(x, y)], fill=A((255, 200, 230)))
        c.ld.point([(x, y)], fill=A(BULB))
    # gondolas
    for k in range(8):
        a = rot + k * 2 * math.pi / 8 + math.pi / 16
        x, y = hx + round(math.cos(a) * R), hy + round(math.sin(a) * R)
        col = CANDY[k % len(CANDY)]
        c.d.line([(x, y), (x, y + 3)], fill=A(NAVY_D))
        c.d.rectangle((x - 4, y + 3, x + 4, y + 4), fill=A(shade(col, 1.15)))   # roof
        c.d.rectangle((x - 3, y + 5, x + 3, y + 10), fill=A(col))
        c.d.rectangle((x - 2, y + 6, x + 2, y + 8), fill=A(GLASS))
        c.d.point([(x - 1, y + 7)], fill=A((232, 190, 150)))
        c.ld.rectangle((x - 2, y + 6, x + 2, y + 8), fill=A(LIT, 220))
        c.d.line([(x - 3, y + 10), (x + 3, y + 10)], fill=A(shade(col, 0.7)))
    # front legs and the hub
    for dx in (-24, 24):
        c.d.line([(hx, hy), (hx + dx, gy + 2)], fill=A(frame_col), width=3)
        c.d.line([(hx + dx // 3, hy + 16), (hx - dx // 3, hy + 16)], fill=A(frame_col)) if dx > 0 else None
    c.d.line([(hx - 16, gy - 16), (hx + 16, gy - 16)], fill=A(frame_col), width=2)
    ell(c, hx, hy, 5, 5, NAVY)
    ell(c, hx, hy, 3, 3, PINK)
    px(c, hx, hy, (255, 220, 240), lit=True)
    # boarding deck and a little ticket hut at the front
    c.box(0.85, 1.45, 1.35, 1.85, 1, 6, WOOD, top=shade(WOOD, 1.1))
    c.box(1.45, 1.45, 1.8, 1.8, 1, 14, CREAM)
    c.lface(1.8, 1.52, 1.72, 6, 11, GLASS, light=True)
    c.pyramid(1.42, 1.42, 1.83, 1.83, 14, 6, PINK)
    # a flag on top of the topmost spoke? no: a beacon on the hub's crown
    return c


def teacup(c, x, y, col, spin):
    ell(c, x, y + 1, 7, 3, shade(col, 0.6))                   # saucer
    c.d.polygon([(x - 6, y - 5), (x + 6, y - 5), (x + 4, y), (x - 4, y)], fill=A(col))
    c.d.polygon([(x - 6, y - 5), (x - 4, y - 5), (x - 2, y), (x - 4, y)], fill=A(shade(col, 1.18)))
    ell(c, x, y - 5, 6, 2, shade(col, 0.55))                  # inside
    c.d.line([(x - 6, y - 5), (x + 6, y - 5)], fill=A(WHITE))
    hxo = [7, -7, 0][spin % 3]
    if hxo:
        c.d.rectangle((x + hxo - (1 if hxo > 0 else 0), y - 4, x + hxo + (0 if hxo > 0 else 1), y - 2), fill=A(shade(col, 0.8)))
    else:
        c.d.point([(x + 1, y - 3), (x + 2, y - 3)], fill=A(WHITE))
    for dx in (-2, 2):
        c.d.rectangle((x + dx, y - 8, x + dx + 1, y - 7), fill=A((232, 190, 150)))


def teacups(f):
    """SQS Teacups: four cups queued round a spinning platform, a giant teapot in the middle and a ring of bulbs
    on the platform's rim (frames turn the platform and spin each cup)."""
    c = Canvas(2, 2, 50)
    cx, cy = c.P(1, 1, 0)
    c.box(0.06, 0.06, 1.94, 1.94, 0, 1, CON_L, top=(226, 220, 206))
    top = disc(c, cx, cy, 29, 14, 3, shade(PINK, 0.7), top=(250, 222, 236))
    for k in range(12):  # checker ring
        a0 = k * 2 * math.pi / 12 + f * 0.17
        a1 = a0 + 2 * math.pi / 12
        if k % 2 == 0:
            c.d.polygon([(cx + math.cos(a0) * 29, top + math.sin(a0) * 14), (cx + math.cos(a1) * 29, top + math.sin(a1) * 14),
                         (cx + math.cos(a1) * 22, top + math.sin(a1) * 10.5), (cx + math.cos(a0) * 22, top + math.sin(a0) * 10.5)],
                        fill=A(PINK))
    rot = f * (2 * math.pi / 4) / 3
    cups = []
    for k in range(4):
        th = rot + k * 2 * math.pi / 4 + math.pi / 4
        cups.append((top + round(math.sin(th) * 8), cx + round(math.cos(th) * 17), k))
    cols = [SKY, (255, 170, 60), TEAL, PURPLE]
    for y, x, k in sorted(cups):
        if y <= top:
            teacup(c, x, y, cols[k], f + k)
    # teapot: body, lid, spout and handle
    c.d.ellipse((cx - 8, top - 14, cx + 8, top + 1), fill=A(WHITE))
    c.d.ellipse((cx - 8, top - 14, cx - 2, top), fill=A((255, 255, 255)))
    c.d.chord((cx - 8, top - 14, cx + 8, top + 1), 20, 160, fill=A(shade(WHITE, 0.85)))
    c.d.line([(cx - 8, top - 7), (cx + 8, top - 7)], fill=A(PINK), width=2)
    c.d.polygon([(cx + 7, top - 7), (cx + 14, top - 15), (cx + 15, top - 14), (cx + 8, top - 4)], fill=A(shade(WHITE, 0.9)))
    c.d.arc((cx - 13, top - 12, cx - 5, top - 3), 90, 270, fill=A(shade(WHITE, 0.85)), width=2)
    ell(c, cx, top - 14, 5, 2, PINK)
    c.d.rectangle((cx - 1, top - 18, cx + 1, top - 16), fill=A(PINK))
    bulb(c, cx, top - 19, BULB)
    for y, x, k in sorted(cups):
        if y > top:
            teacup(c, x, y, cols[k], f + k)
    for k in range(10):  # rim bulbs, front half
        a = k * math.pi / 9
        bulb(c, cx + round(math.cos(a) * 29), top + round(math.sin(a) * 14) + 1, BULB, glow=False)
    return c


def droptower():
    """CloudFront Drop Tower: a purple lattice mast rising from a round station, a ring of seats part-way up
    (riders' legs dangling), a white crown with a small globe on top and a red beacon; lit strips at night."""
    c = Canvas(2, 2, 132)
    c.box(0.06, 0.06, 1.94, 1.94, 0, 1, CON_L, top=(226, 220, 206))
    cx, cy = c.P(1, 1, 0)
    base = disc(c, cx, cy, 22, 11, 6, shade(PURPLE, 0.55), top=(228, 222, 240))
    # station canopy posts
    for k in range(6):
        a = k * 2 * math.pi / 6 + 0.3
        if math.sin(a) < 0:
            x, y = cx + round(math.cos(a) * 18), base + round(math.sin(a) * 9)
            c.d.line([(x, y), (x, y - 10)], fill=A(WHITE))
    lattice_mast(c, 1, 1, 6, 112, PURPLE, r=0.11)
    # lit strips up the mast
    x, _ = c.P(1, 1.11, 0)
    for z in [z for z in range(10, 108, 4) if not 58 <= z <= 76]:
        _, y = c.P(1, 1.11, z)
        c.ld.point([(x - 2, y), (x + 1, y)], fill=A((200, 170, 255)))
    # the seat ring part-way up
    rz = 70
    _, ry = c.P(1, 1, rz)
    ell(c, cx, ry + 4, 13, 6, shade(CON_D, 0.9))
    c.d.rectangle((cx - 13, ry - 2, cx + 13, ry + 4), fill=A(shade(CON_D, 0.9)))
    ell(c, cx, ry - 2, 13, 6, CON_L)
    ell(c, cx, ry - 2, 7, 3, shade(PURPLE, 0.45))
    for k in range(7):
        a = k * math.pi / 6
        sx, sy = cx + round(math.cos(a) * 12), ry + 3 + round(math.sin(a) * 5)
        col = CANDY[k % len(CANDY)]
        c.d.rectangle((sx - 1, sy - 4, sx + 1, sy), fill=A(col))
        c.d.point([(sx, sy - 5)], fill=A((232, 190, 150)))
        c.d.line([(sx, sy + 1), (sx, sy + 3)], fill=A(NAVY))
        c.ld.point([(sx, sy - 4)], fill=A(LIT))
    # crown and globe
    _, ty = c.P(1, 1, 112)
    c.d.rectangle((cx - 6, ty - 3, cx + 6, ty + 1), fill=A(WHITE))
    c.d.line([(cx - 6, ty - 1), (cx + 6, ty - 1)], fill=A(PURPLE))
    globe(c, cx, ty - 10, 7, PURPLE, light=True)
    c.d.line([(cx, ty - 17), (cx, ty - 21)], fill=A(CON_L))
    c.d.point([(cx, ty - 22)], fill=A(RED))
    c.ld.rectangle((cx - 1, ty - 23, cx + 1, ty - 21), fill=A(RED))
    # station roof in front of the mast foot (front arc only)
    for k in range(6):
        a = k * 2 * math.pi / 6 + 0.3
        if math.sin(a) >= 0:
            x, y = cx + round(math.cos(a) * 18), base + round(math.sin(a) * 9)
            c.d.line([(x, y), (x, y - 10)], fill=A(WHITE))
    c.d.arc((cx - 20, base - 19, cx + 20, base - 1), 0, 180, fill=A(PURPLE), width=3)
    for k in range(7):
        a = k * math.pi / 6
        bulb(c, cx + round(math.cos(a) * 20), base - 10 + round(math.sin(a) * 9), BULB, glow=False)
    return c


# ── pocket parks ──────────────────────────────────────────────────────────────

def gazebo():
    """A pocket park's gazebo: a low hexagonal stone floor on the lawn, white posts with a lattice rail, a green
    roof with a lit lantern under its eaves, a bench inside and a flower bed at its foot."""
    from services.kit import Kit, drum, drum_shadow
    c = Kit(1, 1, 46)
    leaf = (78, 168, 76)
    drum_shadow(c, 0.5, 0.5, 0.42, 60)
    drum(c, 0.5, 0.5, 0, 3, 0.36, (150, 120, 88), capcol=(184, 150, 108))
    cx, top = c.P(0.5, 0.5, 3)
    for k in range(-2, 3):  # deck boards
        c.d.line([(cx - 11 + abs(k) * 2, top + k * 2), (cx + 11 - abs(k) * 2, top + k * 2)], fill=A((164, 132, 94)))
    posts = [(k * math.pi / 3 + 0.5) for k in range(6)]
    back = [a for a in posts if math.sin(a) < 0]
    front = [a for a in posts if math.sin(a) >= 0]
    for a in back:
        x, y = cx + round(math.cos(a) * 10), top + round(math.sin(a) * 5)
        c.d.line([(x, y), (x, y - 15)], fill=A(shade(WHITE, 0.78)))
    c.d.rectangle((cx - 4, top - 4, cx + 4, top - 2), fill=A(WOOD))
    c.d.line([(cx - 4, top - 5), (cx + 4, top - 5)], fill=A(WOOD_D))
    for a in front:
        x, y = cx + round(math.cos(a) * 10), top + round(math.sin(a) * 5)
        c.d.line([(x, y), (x, y - 15)], fill=A(WHITE))
    # a lattice rail round the front half
    c.d.arc((cx - 10, top - 10, cx + 10, top), 0, 180, fill=A(WHITE))
    c.d.arc((cx - 10, top - 8, cx + 10, top + 2), 0, 180, fill=A(shade(WHITE, 0.85)))
    for k in range(9):
        a = k * math.pi / 8
        x = cx + round(math.cos(a) * 10)
        y = top - 5 + round(math.sin(a) * 5)
        c.d.point([(x, y + 1)], fill=A(shade(WHITE, 0.8)))
    # the roof: six facets, lit on the left, a ridge highlight and a finial
    ry = top - 15
    c.d.ellipse((cx - 14, ry - 5, cx + 14, ry + 5), fill=A(shade(GRASS_D, 0.75)))
    c.d.polygon([(cx - 14, ry), (cx + 14, ry), (cx, ry - 12)], fill=A(GRASS_D))
    c.d.polygon([(cx - 14, ry), (cx - 3, ry + 2), (cx, ry - 12)], fill=A(GRASS))
    c.d.polygon([(cx - 3, ry + 2), (cx + 6, ry + 2), (cx, ry - 12)], fill=A(shade(GRASS, 0.88)))
    c.d.line([(cx - 14, ry), (cx - 3, ry + 2), (cx + 6, ry + 2), (cx + 14, ry)], fill=A(WHITE))
    c.d.line([(cx, ry - 12), (cx, ry - 16)], fill=A(WHITE))
    px(c, cx, ry - 17, YELLOW)
    # a lantern under the eaves
    c.d.line([(cx, ry + 3), (cx, ry + 5)], fill=A(NAVY_D))
    c.d.rectangle((cx - 1, ry + 5, cx + 1, ry + 8), fill=A(BULB))
    c.ld.ellipse((cx - 6, ry + 1, cx + 6, ry + 12), fill=A(BULB, 90))
    c.ld.rectangle((cx - 1, ry + 5, cx + 1, ry + 8), fill=A(BULB))
    # flowers at its foot
    r = seeded("gazebo-flowers")
    for k in range(8):
        x, y = cx - 12 + k * 3 + r(2), top + 7 + (k % 2)
        c.d.point([(x, y), (x, y - 1)], fill=A(shade(leaf, 0.8)))
        c.d.point([(x, y - 2)], fill=A([(255, 110, 150), (255, 204, 60), (250, 250, 250), (170, 120, 250)][r(4)]))
    return c


# Pocket-park variants (1x1), so a city's open lots differ (src/game/decor.ts picks one per lot by a tile hash):
#   park:pocket:0  a round fountain on paving with two benches and a lamp
#   park:pocket:1  a shade tree over a picnic table and a blanket
#   park:pocket:2  a flower garden in a low hedge with a birdbath and a bench
#   park:pocket:3  a duck pond with reeds, a jetty and a bench

def _pocket_base(c, key):
    from combos_art import lawn
    lawn(c, 0.04, 0.04, 0.96, 0.96, key)


def pocket(k):
    from combos_art import bench, ell as cell, lamp, paving
    from services.kit import Kit, drum, drum_shadow, ellipse, prism
    from builder_art import ball, trunk
    c = Kit(1, 1, 48)
    leaf = (78, 168, 76)
    if k == 0:
        paving(c, 0.08, 0.08, 0.92, 0.92, key="pocket0", h=1)
        drum_shadow(c, 0.5, 0.5, 0.3, 50)
        drum(c, 0.5, 0.5, 1, 5, 0.28, (206, 198, 184))
        ellipse(c, 0.5, 0.5, 5, 0.22, (96, 172, 228), light=(140, 200, 255, 60))
        drum(c, 0.5, 0.5, 5, 12, 0.05, (226, 218, 204))
        x, y = c.P(0.5, 0.5, 12)
        for a in range(5):
            ang = a * 2 * math.pi / 5
            c.d.line([(x, y - 2), (x + round(math.cos(ang) * 6), y + 5 + round(math.sin(ang) * 2))], fill=A((210, 236, 255)))
        c.d.rectangle((x, y - 5, x, y - 1), fill=A((236, 248, 255)))
        bench(c, 0.5, 0.12, along_u=True)
        bench(c, 0.12, 0.5, along_u=False)
        lamp(c, 0.86, 0.86, 22)
    elif k == 1:
        _pocket_base(c, "pocket1")
        # a blanket with a basket
        c.poly([(0.52, 0.56, 0), (0.86, 0.56, 0), (0.86, 0.86, 0), (0.52, 0.86, 0)], (226, 64, 56))
        for t in range(3):
            u = 0.56 + t * 0.1
            c.line((u, 0.56, 0), (u, 0.86, 0), WHITE)
        prism(c, 0.64, 0.64, 0.74, 0.74, 0, 4, WOOD)
        # a picnic table
        prism(c, 0.18, 0.5, 0.48, 0.58, 0, 6, WOOD, rim=0)
        prism(c, 0.14, 0.62, 0.52, 0.68, 0, 3, WOOD_D, rim=0)
        drum_shadow(c, 0.32, 0.3, 0.3, 60)
        x, y = c.P(0.32, 0.3)
        trunk(c, x, y - 1, 14, 1)
        for dx, dy, rr in ((-6, -18, 6), (6, -17, 6), (0, -24, 8), (-3, -19, 6)):
            ball(c, x + dx, y + dy, rr, leaf, f"pk1{dx}{dy}", spots=3)
    elif k == 2:
        _pocket_base(c, "pocket2")
        c.poly([(0.36, 0.36, 0), (0.64, 0.36, 0), (0.64, 0.64, 0), (0.36, 0.64, 0)], (196, 188, 174))
        hedge = (52, 128, 66)
        prism(c, 0.08, 0.08, 0.92, 0.18, 0, 6, hedge, rim=0)
        prism(c, 0.08, 0.18, 0.18, 0.92, 0, 6, hedge, rim=0)
        r = seeded("pocket2")
        for _ in range(26):
            u, v = 0.22 + r(70) / 100, 0.22 + r(70) / 100
            if 0.34 < u < 0.66 and 0.34 < v < 0.66:
                continue
            x, y = c.P(u, v)
            c.d.point([(x, y), (x, y - 1)], fill=A(shade(leaf, 0.8)))
            c.d.point([(x, y - 2)], fill=A([(255, 110, 150), (255, 204, 60), (250, 250, 250), (170, 120, 250), (255, 150, 60)][r(5)]))
        drum(c, 0.5, 0.5, 0, 8, 0.05, (226, 218, 204))
        drum(c, 0.5, 0.5, 8, 10, 0.14, (226, 218, 204), capcol=(120, 190, 236))
        x, y = c.P(0.5, 0.5, 10)
        c.d.point([(x + 2, y - 3), (x + 3, y - 3)], fill=A((120, 84, 60)))
        bench(c, 0.86, 0.5, along_u=False)
    else:
        _pocket_base(c, "pocket3")
        ellipse(c, 0.48, 0.48, 0, 0.36, (150, 140, 126), rim=False)
        ellipse(c, 0.48, 0.48, 0, 0.32, (86, 170, 226), light=(90, 150, 220, 40))
        x, y = c.P(0.48, 0.48)
        for dx, dy in ((-6, -1), (3, 2)):
            cell(c, x + dx, y + dy, 2, 1, WHITE)
            c.d.point([(x + dx - 2, y + dy - 2), (x + dx - 2, y + dy - 1)], fill=A(WHITE))
            c.d.point([(x + dx - 3, y + dy - 2)], fill=A(ORANGE))
        c.d.line([(x + 6, y - 4), (x + 9, y - 4)], fill=A((170, 220, 245)))
        for k2 in range(5):
            rx, ry = x - 12 + k2 * 2, y + 1 - (k2 % 2)
            c.d.line([(rx, ry), (rx, ry - 6 - k2 % 3)], fill=A((96, 140, 60)))
            c.d.point([(rx, ry - 7 - k2 % 3)], fill=A((120, 84, 50)))
        prism(c, 0.78, 0.4, 0.96, 0.56, 0, 2, WOOD, rim=0)
        bench(c, 0.5, 0.9, along_u=True)
        lamp(c, 0.12, 0.88, 20)
    return c


def amphitheatre():
    """Band shell (2×2): a white ribbed quarter-dome at the back opening toward the viewer, a stage with
    footlights, a bandstand's instruments, and curved timber benches on the lawn."""
    c = Canvas(2, 2, 60)
    c.poly([(0.04, 0.04, 0), (1.96, 0.04, 0), (1.96, 1.96, 0), (0.04, 1.96, 0)], GRASS)
    r = seeded("amph")
    for _ in range(14):
        x, y = c.P(r(190) / 100, r(190) / 100, 0)
        c.d.point([(x, y)], fill=A(GRASS_D))
    sx, sy = c.P(0.55, 0.55, 0)
    # stage (a semicircular deck in front of the shell)
    stage = disc(c, sx, sy + 4, 22, 11, 5, (180, 150, 110), top=(214, 182, 136))
    # the shell: nested arcs, outer white rim, inner bands darkening toward the back
    base = stage
    for k, (rx, ry, col) in enumerate(((24, 34, WHITE), (21, 30, (226, 230, 238)), (17, 25, (200, 206, 218)),
                                       (13, 19, (172, 180, 196)), (9, 13, (142, 150, 170)))):
        c.d.pieslice((sx - rx, base - ry, sx + rx, base + ry), 180, 360, fill=A(col))
    for k in range(5):  # ribs
        a = math.pi + (k + 1) * math.pi / 6
        c.d.line([(sx, base), (sx + round(math.cos(a) * 24), base + round(math.sin(a) * 34))], fill=A((236, 240, 246)))
    c.d.arc((sx - 24, base - 34, sx + 24, base + 34), 180, 360, fill=A(PINK), width=1)
    c.ld.arc((sx - 23, base - 33, sx + 23, base + 33), 180, 360, fill=A(BULB), width=1)
    # bandstand: a mic stand and a drum
    c.d.line([(sx - 6, base), (sx - 6, base - 8)], fill=A(NAVY))
    c.d.point([(sx - 7, base - 9), (sx - 6, base - 9)], fill=A(CON_L))
    ell(c, sx + 6, base - 2, 3, 2, RED)
    c.d.line([(sx + 3, base - 2), (sx + 9, base - 2)], fill=A(WHITE))
    # stage front edge and footlights
    c.d.arc((sx - 22, base - 11, sx + 22, base + 11), 0, 180, fill=A(ORANGE), width=1)
    for k in range(7):
        a = k * math.pi / 6
        bulb(c, sx + round(math.cos(a) * 21), base + round(math.sin(a) * 10), BULB, glow=False)
    # stage lights on two poles
    for dx in (-26, 26):
        x, y = sx + dx, base + 2
        c.d.line([(x, y + 4), (x, y - 26)], fill=A(NAVY))
        c.d.rectangle((x - 2, y - 28, x + 2, y - 26), fill=A(CON_D))
        c.ld.rectangle((x - 1, y - 27, x + 1, y - 26), fill=A((255, 240, 200)))
    # curved benches on the lawn
    for k, (rx, ry) in enumerate(((34, 17), (44, 22), (54, 27))):
        for i in range(9):
            a = 0.12 + i * (math.pi / 2 - 0.24) / 8
            x, y = sx + round(math.cos(a) * rx), sy + 4 + round(math.sin(a) * ry)
            c.d.rectangle((x - 2, y - 2, x + 2, y - 1), fill=A(WOOD))
            c.d.point([(x - 2, y), (x + 2, y)], fill=A(WOOD_D))
    return c


def playground():
    """Playground (1×1): soft sand, a slide with a ladder, a swing frame and a spring rider."""
    c = Canvas(1, 1, 34)
    c.poly([(0.06, 0.06, 0), (0.94, 0.06, 0), (0.94, 0.94, 0), (0.06, 0.94, 0)], SAND)
    c.d.line([c.P(0.06, 0.94), c.P(0.94, 0.94), c.P(0.94, 0.06)], fill=A(WOOD_D))
    # swing frame along u at the back
    for u in (0.12, 0.62):
        x, y = c.P(u, 0.22, 0)
        c.d.line([(x - 2, y), (x, y - 18)], fill=A(SKY))
        c.d.line([(x + 2, y), (x, y - 18)], fill=A(SKY))
    c.line((0.12, 0.22, 18), (0.62, 0.22, 18), shade(SKY, 0.8))
    for u in (0.28, 0.46):
        a, b = c.P(u, 0.22, 18), c.P(u, 0.22, 5)
        c.d.line([a, b], fill=A(CON_D))
        c.d.line([(b[0] - 1, b[1]), (b[0] + 2, b[1] + 1)], fill=A(RED))
    # slide: platform tower + ladder + chute
    c.box(0.6, 0.5, 0.82, 0.72, 0, 12, YELLOW)
    c.box(0.58, 0.48, 0.84, 0.74, 12, 14, RED)
    c.pyramid(0.58, 0.48, 0.84, 0.74, 20, 6, RED)
    for (u, v) in ((0.6, 0.5), (0.82, 0.5), (0.6, 0.72), (0.82, 0.72)):
        post(c, u, v, 14, 20, YELLOW, w=0.015)
    c.poly([(0.36, 0.56, 13), (0.36, 0.68, 13), (0.08, 0.86, 1), (0.08, 0.74, 1)], shade(TEAL, 1.1))
    c.poly([(0.36, 0.68, 13), (0.36, 0.7, 15), (0.08, 0.88, 3), (0.08, 0.86, 1)], shade(TEAL, 0.75))
    c.poly([(0.36, 0.56, 13), (0.6, 0.56, 13), (0.6, 0.68, 13), (0.36, 0.68, 13)], RED)
    for z in range(2, 12, 3):
        c.line((0.86, 0.52, z), (0.86, 0.7, z), WOOD_D)
    # spring rider (a little duck)
    x, y = c.P(0.72, 0.9, 0)
    c.d.line([(x, y), (x, y - 3)], fill=A(CON_D))
    c.d.rectangle((x - 3, y - 7, x + 2, y - 4), fill=A(YELLOW))
    c.d.rectangle((x + 1, y - 9, x + 3, y - 7), fill=A(YELLOW))
    c.d.point([(x + 4, y - 8)], fill=A(ORANGE))
    return c


# ── newer rides: Step Functions maze, Kinesis rapids, AgentCore robot arena ────

KINESIS = (140, 79, 255)    # AWS analytics (Kinesis)
AIML = (1, 168, 141)        # AWS AI/ML (AgentCore)
HEDGE = PINK                # AWS application integration (Step Functions)


def maze_walls(n=5, key="sfn-maze"):
    """A perfect maze on an n×n grid (recursive backtracker, seeded): returns the set of standing walls as
    ("h", i, j) = wall on the v-side of row j at column i (j in 0..n), ("v", i, j) = wall on the u-side."""
    r = seeded(key)
    walls = {("h", i, j) for i in range(n) for j in range(n + 1)} | {("v", i, j) for i in range(n + 1) for j in range(n)}
    seen, stack = {(0, 0)}, [(0, 0)]
    while stack:
        i, j = stack[-1]
        nxt = [(i + di, j + dj) for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= i + di < n and 0 <= j + dj < n and (i + di, j + dj) not in seen]
        if not nxt:
            stack.pop()
            continue
        a, b = nxt[r(len(nxt))]
        if a != i:
            walls.discard(("v", max(a, i), j))
        else:
            walls.discard(("h", i, max(b, j)))
        seen.add((a, b))
        stack.append((a, b))
    walls.discard(("h", 0, n))          # the way in, on the front-left edge
    walls.discard(("v", n, n - 1))      # and the way out, on the front-right edge
    return walls


def state_box(c, x, y, col, lit=True):
    """A Step Functions state on a post: a small rounded white card with a coloured rim."""
    c.d.line([(x, y), (x, y - 6)], fill=A(CON_D))
    c.d.rounded_rectangle((x - 5, y - 11, x + 5, y - 6), radius=2, fill=A(WHITE), outline=A(col))
    c.d.line([(x - 2, y - 9), (x + 2, y - 9)], fill=A(col))
    if lit:
        c.ld.rounded_rectangle((x - 5, y - 11, x + 5, y - 6), radius=2, fill=A(BULB, 150))


def maze():
    """Step Functions Maze: a pink hedge maze; states stand as white cards at the junctions, a green start circle at
    the way in and a navy end circle at the way out, lanterns lit at night."""
    c = Canvas(2, 2, 40)
    c.box(0.04, 0.04, 1.96, 1.96, 0, 1, CON_L, top=(226, 214, 186))
    n, o, s = 4, 0.14, 0.43
    walls = maze_walls(n)
    c.poly([(o, o, 1), (o + n * s, o, 1), (o + n * s, o + n * s, 1), (o, o + n * s, 1)], (238, 228, 204))
    r = seeded("maze-leaf")
    items = []
    for kind, i, j in sorted(walls):
        if kind == "h":
            u0, u1, v0, v1 = o + i * s - 0.035, o + (i + 1) * s + 0.035, o + j * s - 0.035, o + j * s + 0.035
        else:
            u0, u1, v0, v1 = o + i * s - 0.035, o + i * s + 0.035, o + j * s - 0.035, o + (j + 1) * s + 0.035
        items.append(((u0 + u1) / 2 + (v0 + v1) / 2, "wall", (u0, v0, u1, v1)))
    for (ci, cj, col) in ((1, 0, PINK), (2, 2, PURPLE), (0, 2, PINK), (3, 1, TEAL)):
        items.append((o + (ci + 0.5) * s + o + (cj + 0.5) * s + 0.01, "state", (o + (ci + 0.5) * s, o + (cj + 0.5) * s, col)))
    for (pu, pv, col) in ((o + 0.5 * s + 0.05, o + 3.5 * s, (232, 190, 150)), (o + 1.5 * s, o + 1.4 * s, (232, 190, 150))):
        items.append((pu + pv, "person", (pu, pv, col)))
    for _, kind, a in sorted(items, key=lambda t: t[0]):
        if kind == "wall":
            u0, v0, u1, v1 = a
            c.box(u0, v0, u1, v1, 1, 6, shade(HEDGE, 0.78), top=shade(HEDGE, 1.1))
            for _ in range(2):
                x, y = c.P(u0 + (u1 - u0) * r(100) / 100, v0 + (v1 - v0) * r(100) / 100, 6)
                c.d.point([(x, y)], fill=A((255, 150, 200)))
        elif kind == "state":
            u, v, col = a
            x, y = c.P(u, v, 1)
            state_box(c, x, y, col)
        else:
            u, v, col = a
            x, y = c.P(u, v, 1)
            c.d.rectangle((x - 1, y - 5, x, y - 2), fill=A(SKY))
            c.d.point([(x, y - 6), (x - 1, y - 6)], fill=A(col))
    # start and end circles outside the way in and the way out
    for (u, v, col) in ((o + 0.5 * s, 1.93, (60, 190, 90)), (1.93, o + 3.5 * s, NAVY)):
        x, y = c.P(u, v, 1)
        ell(c, x, y, 4, 2, col)
        ell(c, x, y, 2, 1, WHITE)
    # lanterns at the back corners
    for (u, v) in ((0.84, 0.18), (0.18, 0.84)):
        bx, by = c.P(u, v, 1)
        c.d.line([(bx, by), (bx, by - 14)], fill=A(WOOD_D))
        bulb(c, bx, by - 15, BULB)
    return c


def rapids(f):
    """Kinesis Rapids: a ring channel of purple water round a rocky island; the stream splits into two lanes past
    the island's point (shards), round rafts ride it (frames move them on), foam churns, and lamps
    stand at the corners."""
    c = Canvas(2, 2, 48)
    c.box(0.04, 0.04, 1.96, 1.96, 0, 1, CON_L, top=(212, 206, 192))
    cx, cy = c.P(1, 1, 1)
    rx, ry = 27, 13
    top = disc(c, cx, cy, rx + 2, ry + 1, 3, STONE_C, top=(196, 190, 180))
    ell(c, cx, top, rx, ry, shade(KINESIS, 0.8))
    ell(c, cx, top - 1, rx - 1, ry - 1, shade(KINESIS, 1.12))
    # the island, with a lane divider (shards) as a low wall across the front part of the ring
    ell(c, cx, top, 15, 7, shade(KINESIS, 0.6))
    itop = disc(c, cx, top, 14, 7, 3, (150, 140, 128), top=GRASS)
    # foam streaks, churning by frame
    rr = seeded("rapids-foam")
    for k in range(16):
        th = (k / 16) * 2 * math.pi + f * 0.13 + rr(20) / 100
        rad = 0.72 + rr(20) / 100
        x, y = cx + round(math.cos(th) * (21 * rad + 4)), top + round(math.sin(th) * (10.5 * rad + 2))
        c.d.line([(x, y), (x + 2, y)], fill=A(WHITE if (k + f) % 3 else (214, 200, 255)))
    # rocks in the stream
    for th in (0.3, 2.2, 3.9):
        x, y = cx + round(math.cos(th) * 21), top + round(math.sin(th) * 10)
        ell(c, x, y, 2, 1, CON_M)
        c.d.point([(x - 1, y - 1)], fill=A(CON_L))
    # shard divider: two short walls splitting the front of the ring into lanes
    for th in (0.9, 2.25):
        x0, y0 = cx + round(math.cos(th) * 16), top + round(math.sin(th) * 8)
        x1, y1 = cx + round(math.cos(th) * 26), top + round(math.sin(th) * 12.5)
        c.d.line([(x0, y0), (x1, y1)], fill=A(STONE_C), width=2)
    # rafts: back half first, then the island's tree, then the front half
    rafts = []
    for k in range(4):
        th = k * 2 * math.pi / 4 + f * (2 * math.pi / 4) / 3 + 0.4
        rafts.append((math.sin(th), cx + round(math.cos(th) * 21), top + round(math.sin(th) * 10), CANDY[k]))

    def raft(x, y, col):
        ell(c, x, y + 1, 5, 2, shade(col, 0.6))
        ell(c, x, y, 5, 2, col)
        ell(c, x, y - 1, 3, 1, shade(col, 0.5))
        for dx in (-2, 1):
            c.d.rectangle((x + dx, y - 4, x + dx + 1, y - 3), fill=A((232, 190, 150)))
            c.d.point([(x + dx, y - 2)], fill=A(YELLOW))
    for s_, x, y, col in sorted(rafts):
        if s_ < 0:
            raft(x, y, col)
    # the island: a rock cairn with a purple flag and a little lamp
    ell(c, cx - 3, itop - 1, 4, 3, (150, 140, 128))
    ell(c, cx - 4, itop - 3, 2, 2, (184, 176, 164))
    c.d.line([(cx + 3, itop), (cx + 3, itop - 13)], fill=A(CON_L))
    c.d.polygon([(cx + 4, itop - 13), (cx + 10, itop - 11), (cx + 4, itop - 8)], fill=A(KINESIS))
    bulb(c, cx + 3, itop - 14, (210, 180, 255))
    for s_, x, y, col in sorted(rafts):
        if s_ >= 0:
            raft(x, y, col)
    # lamp posts at the left and right corners, lit at night
    for (u, v) in ((0.12, 1.88), (1.88, 0.12)):
        x, y = c.P(u, v, 1)
        c.d.line([(x, y), (x, y - 18)], fill=A(NAVY))
        bulb(c, x, y - 19, (210, 180, 255))
    return c


def robot(c, x, y, body, trim, pose, face_right, lit_eye):
    """A small boxy robot at screen (x, y) = between its feet. pose 0 guard, 1 jab (front arm out)."""
    s = 1 if face_right else -1
    c.d.rectangle((x - 3, y - 4, x - 2, y), fill=A(NAVY_D))     # legs
    c.d.rectangle((x + 1, y - 4, x + 2, y), fill=A(NAVY_D))
    c.d.rectangle((x - 4, y - 12, x + 3, y - 5), fill=A(body))  # body
    c.d.rectangle((x - 4, y - 12, x - 3, y - 5), fill=A(shade(body, 1.15)))
    c.d.rectangle((x - 2, y - 10, x + 1, y - 8), fill=A(trim))  # chest panel
    c.d.rectangle((x - 3, y - 18, x + 2, y - 13), fill=A(shade(body, 1.08)))  # head
    ex = x + (1 if face_right else -2)
    c.d.rectangle((ex - 1, y - 16, ex + 1, y - 15), fill=A(lit_eye))  # visor
    c.ld.rectangle((ex - 1, y - 16, ex + 1, y - 15), fill=A(lit_eye))
    c.d.line([(x, y - 19), (x, y - 21)], fill=A(CON_L))  # antenna
    c.d.point([(x, y - 22)], fill=A(RED))
    c.ld.point([(x, y - 22)], fill=A(RED))
    # arms: the back arm guards, the front arm guards or jabs; padded mitts
    bx = x - 4 * s if face_right else x + 3
    fx = x + 3 if face_right else x - 4
    c.d.line([(bx, y - 11), (bx + 2 * s, y - 14)], fill=A(CON_M))
    ell(c, bx + 2 * s, y - 14, 1, 1, trim)
    if pose == 1:
        c.d.line([(fx, y - 11), (fx + 7 * s, y - 12)], fill=A(CON_M))
        ell(c, fx + 7 * s, y - 12, 2, 2, trim)
    else:
        c.d.line([(fx, y - 11), (fx + 3 * s, y - 15)], fill=A(CON_M))
        ell(c, fx + 3 * s, y - 15, 1, 1, trim)


def robots(f):
    """AgentCore Robot Arena: a teal ring on a platform with corner posts and ropes; two small robots spar with
    padded mitts (frames swap guard and jab), bleachers of spectators behind and floodlights at the corners."""
    c = Canvas(2, 2, 56)
    c.box(0.04, 0.04, 1.96, 1.96, 0, 1, CON_L, top=(212, 206, 192))
    # bleachers at the back corner
    for k in range(3):
        c.box(0.08 + k * 0.1, 0.08, 0.2 + k * 0.1, 1.2, 1, 9 - k * 3, CON_M)
        c.box(0.08, 0.08 + k * 0.1, 1.2, 0.2 + k * 0.1, 1, 9 - k * 3, CON_M)
    rr = seeded("arena-fans")
    for k in range(10):
        t = 0.2 + k * 0.1
        for (u, v, z) in ((0.14, t, 9), (t, 0.14, 9)):
            x, y = c.P(u, v, z)
            c.d.point([(x, y - 1)], fill=A(CANDY[rr(len(CANDY))]))
            c.d.point([(x, y - 2)], fill=A((232, 190, 150)))
    a0, a1, z = 0.4, 1.7, 6
    c.box(a0, a0, a1, a1, 1, z, shade(AIML, 0.8))
    c.poly([(a0, a0, z), (a1, a0, z), (a1, a1, z), (a0, a1, z)], (214, 240, 234))
    c.poly([(a0 + 0.1, a0 + 0.1, z), (a1 - 0.1, a0 + 0.1, z), (a1 - 0.1, a1 - 0.1, z), (a0 + 0.1, a1 - 0.1, z)], (232, 248, 244))
    c.lface(a1, a0, a1, 2, 4, WHITE)
    c.rface(a1, a0, a1, 2, 4, shade(WHITE, 0.85))
    corners = [(a0 + 0.05, a0 + 0.05), (a1 - 0.05, a0 + 0.05), (a0 + 0.05, a1 - 0.05), (a1 - 0.05, a1 - 0.05)]

    def ropes(pairs):
        for (p, q) in pairs:
            for zz, col in ((z + 5, WHITE), (z + 9, AIML)):
                c.line((*p, zz), (*q, zz), col)
    for (u, v) in corners[:3]:
        post(c, u, v, z, z + 11, AIML, w=0.035)
    ropes([(corners[0], corners[1]), (corners[0], corners[2])])
    # the robots: they bob and take turns to jab
    xa, ya = c.P(1.0, 1.42, z)
    xb, yb = c.P(1.42, 1.0, z)
    ba, bb = [0, 1, 0][f], [1, 0, 0][f]
    robot(c, xa, ya - ba, ORANGE, NAVY, 1 if f == 0 else 0, True, (120, 255, 220))
    robot(c, xb, yb - bb, WHITE, AIML, 1 if f == 2 else 0, False, (255, 200, 90))
    if f in (0, 2):  # a little "pop" star where the mitt lands
        sx = (xa + xb) // 2 + (2 if f == 0 else -2)
        sy = (ya + yb) // 2 - 13
        for dx, dy in ((0, -2), (0, 2), (-2, 0), (2, 0)):
            c.d.point([(sx + dx, sy + dy)], fill=A(YELLOW))
        c.d.point([(sx, sy)], fill=A(WHITE))
    post(c, *corners[3], z, z + 11, AIML, w=0.035)
    ropes([(corners[1], corners[3]), (corners[2], corners[3])])
    for (u, v) in corners:
        x, y = c.P(u, v, z + 11)
        bulb(c, x, y - 1, (140, 255, 230), glow=False)
    # floodlights on two poles
    for (u, v) in ((1.9, 0.12), (0.12, 1.9)):
        x, y = c.P(u, v, 1)
        c.d.line([(x, y), (x, y - 34)], fill=A(NAVY))
        c.d.rectangle((x - 2, y - 37, x + 2, y - 34), fill=A(CON_D))
        c.ld.rectangle((x - 1, y - 36, x + 1, y - 35), fill=A((255, 244, 210)))
        c.ld.polygon([(x, y - 35), (x - 10 if u > 1 else x + 10, y - 10), (x - 2 if u > 1 else x + 2, y - 8)], fill=A((255, 244, 210), 40))
    return c


# ── build ─────────────────────────────────────────────────────────────────────

RIDES = {
    # name: (drawer, frames, footprint, zmax, pad, tarp gap-closing kernel)
    "coaster": (coaster, 0, (2, 2), 72, 2, 7),
    "flume": (flume, 3, (2, 2), 72, 2, 7),
    "carousel": (carousel, 3, (2, 2), 66, 2, 7),
    "wheel": (wheel, 3, (2, 2), 104, 8, 13),
    "teacups": (teacups, 3, (2, 2), 50, 2, 5),
    "droptower": (droptower, 0, (2, 2), 132, 2, 7),
    "maze": (maze, 0, (2, 2), 40, 2, 5),
    "rapids": (rapids, 3, (2, 2), 48, 2, 5),
    "robots": (robots, 3, (2, 2), 56, 2, 7),
}


def build(add):
    add("crane1x1", crane())
    add("scaffold1x1", scaffold())
    add("park:arch", arch())
    add("park:booth", booth())
    add("park:fenceX", fence(True), do_outline=False)
    add("park:fenceY", fence(False), do_outline=False)
    for name, (draw, frames, (fw, fh), zmax, pad, close) in RIDES.items():
        if frames:
            first = None
            for f in range(frames):
                c = draw(f)
                first = first or c
                add(f"park:{name}{f}", c)
        else:
            first = draw()
            add(f"park:{name}", first)
        add(f"park:{name}:locked", locked(first, fw, fh, zmax, pad, close), lights=False)
    add("park:gazebo", gazebo())
    for k in range(4):
        add(f"park:pocket:{k}", pocket(k))
    add("park:amphitheatre", amphitheatre())
    add("park:playground", playground())
