"""
Network Junction (vpc route53 cloudfront apigateway sqs eventbridge transitgateway globalaccelerator): front buildings lm_<id> and towers tw_<id> (see
services/__init__.py). Front buildings keep their metaphors: the VPC walled garden with its gate, the Route 53 dance
hall with its bulb-lit "53" marquee, the CloudFront post office, the API Gateway station behind its arch, the SQS
sorting office with its conveyor queue and the EventBridge railway crossing with its signals.

Towers: VPC a keep of walled garden terraces (subnets inside subnets), Route 53 a lattice mast with dish platforms,
CloudFront a mast with a ring of edge antennas and a globe on top, API Gateway twin pylons joined by a sky lobby over
an arch, SQS a slab of pigeonholes (messages waiting in their slots) under a belfry (SNS), EventBridge a bus tower
with two target towers linked by signal bridges, Transit Gateway a round hub with a ramp spiralling up round it under
a crown wheel (its front an interchange hall with flyovers), Global Accelerator a white speed fin raked back to a
twin-beacon crown (its front an express terminal with an entry hoop at each end of a fast lane). Route 53, CloudFront
and Global Accelerator stand at the campus Global Gate beside IAM.
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, ORANGE_D, WATER, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, GLASS_DK, GLASS_L, LED, LIT, LIT_COOL, RED, STEEL, STEEL_D,  # noqa: F401
                          STEEL_M, STONE, Kit, A, _SF, _SR, bands, beacon, bridge, combine, dish, drum, drum_shadow, ellipse,
                          face, glass, ground_shadow, hv, lattice, louvres, masonry, plant, podium, prism, punched,
                          rib_shader, ribbon_shader, ribs, solid, tip, tone, top_band)
from services.compute import CU, CV, H, canvas

NET = (140, 79, 255)        # the district colour (towers get no col)
NET_D = (96, 52, 186)
LILAC = (204, 184, 255)
CREAM = (234, 222, 196)
HEDGE = (64, 146, 68)
HEDGE_D = (40, 104, 52)
LEAF_L = (124, 200, 100)
GOLD = (240, 196, 70)
YELLOW = (255, 214, 60)
BULB = (255, 236, 150)
PINK = (255, 150, 220)
SIG_G, SIG_A = (80, 230, 120), (255, 180, 40)

KRAFT = (206, 150, 86)
GRAVEL = (170, 162, 152)
RAIL = (112, 104, 100)

# 3x5 pixel glyphs (marquees and signs)
FONT = {
    "5": ["XXX", "X..", "XXX", "..X", "XXX"], "3": ["XXX", "..X", ".XX", "..X", "XXX"],
    "A": [".X.", "X.X", "XXX", "X.X", "X.X"], "P": ["XX.", "X.X", "XX.", "X..", "X.."],
    "I": ["XXX", ".X.", ".X.", ".X.", "XXX"],
}


def text_l(c, s, u, v, z, col, light=True):
    """Pixel text on a left-facing (v = const) wall, glyph top-left at (u, v, z), sheared with the wall."""
    x0, y0 = c.P(u, v, z)
    for n, ch in enumerate(s):
        for r, row in enumerate(FONT[ch]):
            for k, px in enumerate(row):
                if px == "X":
                    i = n * 4 + k
                    c.put(x0 + i, y0 + r + i // 2, col, col if light else None)


def text_flat(c, s, x, y, col, light=True):
    for n, ch in enumerate(s):
        for r, row in enumerate(FONT[ch]):
            for k, px in enumerate(row):
                if px == "X":
                    c.put(x + n * 4 + k, y + r, col, col if light else None)


def dot(c, x, y, r, col, light=True):
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(col))
    if light:
        c.ld.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(col, 150))
        c.ld.ellipse((x - r, y - r, x + r, y + r), fill=A(col))


def bush(c, u, v, z, s=1.0, col=HEDGE):
    """A round clipped bush / small tree crown: dark base, mid body, a lit cap on the sun side."""
    x, y = c.P(u, v, z)
    r = round(3 * s)
    c.d.ellipse((x - r - 1, y - 2 * r, x + r + 1, y), fill=A(shade(col, 0.72)))
    c.d.ellipse((x - r, y - 2 * r - 1, x + r - 1, y - 2), fill=A(col))
    c.d.ellipse((x - r, y - 2 * r - 1, x - 1, y - r - 1), fill=A(shade(col, 1.3)))


def tree(c, u, v, z=0, s=1.0):
    x, y = c.P(u, v, z)
    c.d.line([(x, y), (x, y - round(5 * s))], fill=A(WOOD_D))
    bush(c, u, v, z + round(4 * s), 1.4 * s, (78, 160, 72))


def signal_head(c, x, y, lit_idx, cols=(SIG_G, SIG_A, RED)):
    """A three-aspect signal head (screen space, top-left at x, y): one aspect lit."""
    c.d.rectangle((x - 2, y, x + 2, y + 4 * len(cols)), fill=A(NAVY_D))
    for i, lc in enumerate(cols):
        yy = y + 1 + i * 4
        on = i == lit_idx
        c.d.rectangle((x - 1, yy, x + 1, yy + 2), fill=A(lc if on else shade(lc, 0.35)))
        if on:
            c.ld.rectangle((x - 3, yy - 1, x + 3, yy + 3), fill=A(lc, 140))
            c.ld.rectangle((x - 1, yy, x + 1, yy + 2), fill=A(lc))


def post(c, u, v, z0, h, col=CON_D):
    x, y = c.P(u, v, z0)
    c.d.line([(x, y), (x, y - h)], fill=A(col))
    c.d.line([(x + 1, y), (x + 1, y - h)], fill=A(shade(col, 0.7)))
    return x, y - h


def crenels(c, u0, v0, u1, v1, z, col, step=0.2, h=3):
    """Merlons along the two front edges of a roof (v = v1 and u = u1), back to front."""
    m = step / 2
    items = []
    a = u0
    while a + m <= u1 + 1e-6:
        items.append((a, v1 - m * 0.8, a + m, v1))
        a += step
    b = v0
    while b + m <= v1 - m + 1e-6:
        items.append((u1 - m * 0.8, b, u1, b + m))
        b += step
    for (a0, b0, a1, b1) in sorted(items, key=lambda t: t[0] + t[1]):
        prism(c, a0, b0, a1, b1, z, z + h, col, rim=0, ao=False)


def ivy(key, depth=7, col=HEDGE):
    """Ivy hanging from a parapet: thick at the top, thinning down the wall."""
    def g(i, n, z, h, base, side):
        d = h - 1 - z
        if d < depth and hv(key, side, i, z // 2) < 0.95 - d / depth:
            f = 1.0 if (i + z) % 3 else 1.25
            return shade(col, SIDE_F[side] * f), None
        return None
    return g


SIDE_F = {"L": 0.9, "R": 0.72}


# ── VPC ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_vpc(fw, fh, tier, col, key):
    """VPC Walled Garden: crenellated stone walls round the front of the lot with an arched gate (the internet
    gateway) and its lanterns; hedges divide the garden into rooms (subnets): a public room with trees and a
    fountain, a private room with a locked shed. More hedges each tier, a glass office in the private room at 3,
    watchtowers on the corners at 4. The back of the lot opens onto the keep."""
    c = Kit(fw, fh, 70)
    wall = (196, 188, 172)
    h = 9 + tier
    lawn = (112, 178, 92)
    c.poly([(0.1, 1.7, 0), (1.7, 1.7, 0), (1.7, 0.1, 0), (2.9, 0.1, 0), (2.9, 2.9, 0), (0.1, 2.9, 0)], lawn)
    if tier == 1:  # no keep yet: the back of the lot is a lawn with a tree
        c.poly([(0.1, 0.1, 0), (1.7, 0.1, 0), (1.7, 1.7, 0), (0.1, 1.7, 0)], lawn)
    # the path from the gate
    c.poly([(1.3, 1.9, 0), (1.7, 1.9, 0), (1.7, 2.9, 0), (1.3, 2.9, 0)], (214, 202, 176))
    c.poly([(1.3, 1.9, 0), (1.7, 1.9, 0), (1.7, 2.3, 0), (1.3, 2.3, 0)], (214, 202, 176))
    W = combine(top_band(1, shade(wall, 1.08)), masonry(4, 7, 0.86))
    for (u0, v0, u1, v1) in ((0.1, 1.7, 0.26, 2.76), (1.7, 0.1, 2.76, 0.26)):  # side walls
        ground_shadow(c, u0, v0, u1, v1, alpha=50)
        prism(c, u0, v0, u1, v1, 0, h, wall, L=W, R=W, rim=0)
        crenels(c, u0, v0, u1, v1, h, wall)
    if tier == 1:  # no keep yet: the garden's back walls close it
        for (u0, v0, u1, v1) in ((0.1, 0.1, 0.26, 1.7), (0.26, 0.1, 1.7, 0.26)):
            prism(c, u0, v0, u1, v1, 0, h, wall, L=W, R=W, rim=0)
            crenels(c, u0, v0, u1, v1, h, wall)
    items = []
    if tier == 1:
        items.append((1.4, lambda: tree(c, 0.75, 0.75, 0, 1.2)))
        items.append((1.6, lambda: tree(c, 1.2, 0.45, 0, 0.9)))
    # subnet hedges (rooms)
    hedges = [(1.95, 0.45, 2.05, 1.5), (0.45, 1.95, 1.2, 2.05)]
    if tier >= 2:
        hedges.append((1.95, 1.5, 2.05, 2.0))
    if tier >= 3:
        hedges.append((2.05, 1.95, 2.6, 2.05))
    for (a, b, cc, d) in hedges:
        items.append((a + b + 0.6, lambda a=a, b=b, cc=cc, d=d: prism(c, a, b, cc, d, 0, 5, HEDGE, L=ribs(3, 1.15, 0.84), R=ribs(3, 1.15, 0.84), rim=0)))
    # public room: trees and a fountain
    items.append((2.6, lambda: tree(c, 0.6, 2.2, 0, 1.0)))
    if tier >= 2:
        items.append((2.4, lambda: tree(c, 1.05, 2.45 - 0.05, 0, 0.9)))
    items.append((3.3, lambda: fountain(c, 0.75, 2.5, tier)))
    # private room: the locked shed (and an office at tier 3)
    def shed():
        u0, v0, u1, v1 = 2.2, 0.45, 2.65, 0.95
        ground_shadow(c, u0, v0, u1, v1, alpha=60)
        prism(c, u0, v0, u1, v1, 0, 9, CREAM, L=ribs(3, 1.1, 0.88), R=ribs(3, 1.1, 0.88), roof=False)
        c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, 9, 5, col)
        x, y = c.P(u1, (v0 + v1) / 2, 5)
        c.d.rectangle((x - 1, y - 2, x + 1, y), fill=A(YELLOW))
        c.light(x, y - 1, YELLOW)
    items.append((2.9, shed))
    if tier >= 3:
        def office():
            u0, v0, u1, v1 = 2.2, 1.15, 2.65, 1.75
            ground_shadow(c, u0, v0, u1, v1, alpha=60)
            g = glass(key + "of", bay=4, floor=6, p=0.6, lo=1)
            prism(c, u0, v0, u1, v1, 0, 13, (58, 100, 196), L=combine(top_band(2, col), g), R=combine(top_band(2, col), g))
        items.append((3.6, office))
    for _, f in sorted(items, key=lambda t: t[0]):
        f()
    # the front walls, the gate in the left one
    prism(c, 2.76, 0.1, 2.9, 2.9, 0, h, wall, L=W, R=W, rim=0)
    crenels(c, 2.76, 0.1, 2.9, 2.76, h, wall)
    for (a, b) in ((0.1, 1.2), (1.8, 2.9)):
        prism(c, a, 2.76, b, 2.9, 0, h, wall, L=W, R=W, rim=0)
        crenels(c, a, 2.76, b, 2.9, h, wall)
    gz = h + 9
    for u in (1.12, 1.8):
        prism(c, u, 2.72, u + 0.14, 2.94, 0, gz, col, L=combine(top_band(2, shade(col, 1.25)), masonry(4, 4, 0.88)), R=combine(masonry(4, 4, 0.88)), rim=0)
    # the arch and its keystone
    x0, y0 = c.P(1.19, 2.83, gz - 2)
    x1, y1 = c.P(1.87, 2.83, gz - 2)
    pts = [(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t - math.sin(t * math.pi) * 6)) for t in [k / 12 for k in range(13)]]
    c.d.line(pts, fill=A(col), width=3)
    c.d.line([(p[0], p[1] - 1) for p in pts], fill=A(shade(col, 1.35)))
    # gate bars (open leaves at higher tiers)
    for k, u in enumerate((1.3, 1.42, 1.54, 1.66)):
        if tier >= 3 and k in (1, 2):
            continue
        prism(c, u, 2.82, u + 0.03, 2.85, 0, h + 3, ORANGE if tier >= 2 else NAVY_D, rim=0, ao=False)
    for u in (1.19, 1.87):
        x, y = c.P(u, 2.83, gz + 2)
        c.d.line([(x, y + 2), (x, y)], fill=A(NAVY_D))
        dot(c, x, y - 1, 1, BULB)
    if tier >= 4:  # watchtowers on the three near corners
        for (u, v) in ((0.05, 2.5), (2.5, 0.05), (2.5, 2.5)):
            prism(c, u, v, u + 0.45, v + 0.45, 0, h + 13, shade(wall, 0.96), L=combine(lambda i, n, z, hh, b, s: ((GLASS_DK, LIT) if n // 2 - 1 <= i <= n // 2 and hh - 9 <= z < hh - 5 else None), masonry(4, 6, 0.86)),
                  R=combine(masonry(4, 6, 0.86)), rim=0)
            c.pyramid(u - 0.04, v - 0.04, u + 0.49, v + 0.49, h + 13, 8, col)
    return c


def fountain(c, u, v, tier):
    ellipse(c, u, v, 0, 0.26, CON_L, rim=False)
    drum(c, u, v, 0, 3, 0.26, STONE, cap=False)
    ellipse(c, u, v, 3, 0.22, WATER, rim=False, light=(70, 150, 220) if tier >= 3 else None)
    x, y = c.P(u, v, 3)
    c.d.line([(x, y), (x, y - 5)], fill=A((180, 220, 250)))
    c.d.point([(x - 1, y - 5), (x + 1, y - 5)], fill=A((200, 236, 255)))


def tw_vpc(tier, k):
    """The keep: walled garden terraces stacked and set back (subnets inside subnets), each crenellated, ivy
    hanging from its parapet and bushes on its corners, lit slit windows, a gatehouse with a pyramid roof on top."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=52)
    n = tier
    halves = [0.7, 0.54, 0.4, 0.28][:n]
    weights = [1.3, 1.05, 0.9, 0.75][:n]
    stone = (214, 204, 186)
    zs = [0]
    for w in weights:
        zs.append(zs[-1] + round(top_z * w / sum(weights)))
    zs[-1] = top_z
    ground_shadow(c, CU - halves[0], CV - halves[0], CU + halves[0], CV + halves[0])
    for i, hf in enumerate(halves):
        z0, z1 = zs[i], zs[i + 1]
        u0, v0, u1, v1 = CU - hf, CV - hf, CU + hf, CV + hf
        win = punched(k + str(i), bay=5 if hf > 0.35 else 4, floor=9, ww=2, wh=5, p=0.55, lo=4 if i == 0 else 2, hi=z1 - z0 - 7)
        sh = combine(top_band(2, NET), ivy(k + "iv" + str(i)), win, masonry(5, 8, 0.9))
        if i == 0:  # the gate in the base
            gate = lambda ii, nn, z, hh, b, s: ((shade(NAVY_D, 1.2), LIT if z < 10 and ii % 3 else None) if s == "L" and abs(ii - nn / 2) < 4 and z < 14 - (abs(ii - nn / 2) > 2.5) * 2 else None)
            sh = combine(gate, sh)
        prism(c, u0, v0, u1, v1, z0, z1, stone, L=sh, R=sh, roofcol=(120, 170, 96), ao=i == 0)
    # terrace furniture, top down so nearer, lower terraces paint last
    for i in reversed(range(n)):
        hf = halves[i]
        u0, v0, u1, v1 = CU - hf, CV - hf, CU + hf, CV + hf
        z = zs[i + 1]
        crenels(c, u0, v0, u1, v1, z, stone, step=0.18 if hf > 0.3 else 0.16, h=3)
        if i < n - 1:
            for (bu, bv) in ((u0 + 0.08, v1 - 0.08), (u1 - 0.08, v0 + 0.08), (u1 - 0.1, v1 - 0.1)):
                bush(c, bu, bv, z + 1, 1.0 if hf > 0.5 else 0.8)
    # the gatehouse on top
    g = 0.17
    z = top_z
    prism(c, CU - g, CV - g, CU + g, CV + g, z, z + 10, stone, L=combine(lambda i, nn, zz, hh, b, s: ((NAVY_D, LIT) if abs(i - nn / 2) < 2 and zz < 7 else None), masonry(4, 5, 0.88)), R=combine(masonry(4, 5, 0.88)), ao=False)
    c.pyramid(CU - g - 0.04, CV - g - 0.04, CU + g + 0.04, CV + g + 0.04, z + 10, 9, NET)
    tip(c, CU, CV, z + 18, h=6 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c


# ── Route 53 ──────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_route53(fw, fh, tier, col, key):
    """Route 53 Dance Hall: a plum hall with glowing pink portholes, the bulb-lit "53" marquee on its front roof
    edge and a canopy over the doors; a dance floor of coloured tiles from tier 2, a disco ball on the roof at 3,
    spotlights sweeping the sky at 4."""
    c = Kit(fw, fh, 80)
    z1 = 18 + 3 * tier
    u0, v0, u1, v1 = 0.95, 1.55, 2.8, 2.5
    hall = shade(col, 0.5)
    ground_shadow(c, u0, v0, u1, v1)

    def port(key2):
        def g(i, n, z, h, base, side):
            bi = i % 7
            if 2 <= bi <= 4 and 8 <= z < 14 and not ((bi in (2, 4)) and z in (8, 13)) and 1 < i < n - 2:
                if side == "L" and abs(i - n / 2) < 5:
                    return None
                return shade(PINK if side == "L" else (220, 140, 255), 0.95 if side == "L" else 0.8), PINK
            return None
        return g

    L = combine(top_band(3, col), bands([(0, 2, shade(col, 0.35))]), port(key), ribs(4, 1.06, 0.92))
    R = combine(top_band(3, col), bands([(0, 2, shade(col, 0.35))]), port(key + "r"), ribs(4, 1.06, 0.92))
    prism(c, u0, v0, u1, v1, 0, z1, hall, L=L, R=R, roofcol=shade(col, 0.4))
    m = (u0 + u1) / 2
    face(c, "L", v1, m - 0.24, m + 0.24, 0, 9, NAVY_D, lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 and i != n // 2 else None), ao=False)
    prism(c, m - 0.42, v1, m + 0.42, v1 + 0.28, 9, 11, ORANGE, ao=False, rim=0)
    for kk in range(7):  # bulbs under the canopy
        x, y = c.P(m - 0.4 + kk * 0.133, v1 + 0.28, 9)
        c.put(x, y, BULB, BULB)
    if tier >= 3:
        plant(c, u0 + 0.15, v0 + 0.1, u0 + 0.8, v0 + 0.5, z1, key + "p", n=1)
    if tier >= 3:  # the disco ball over the roof
        x, y = c.P(u1 - 0.35, v0 + 0.3, z1)
        c.d.line([(x, y), (x, y - 8)], fill=A(CON_D))
        c.d.ellipse((x - 5, y - 18, x + 5, y - 8), fill=A((176, 184, 204)))
        c.d.ellipse((x - 5, y - 18, x + 2, y - 11), fill=A((214, 220, 234)))
        for (dx, dy) in ((-2, -15), (2, -12), (-1, -10), (3, -16), (0, -13)):
            c.put(x + dx, y + dy, WHITE, WHITE)
    # the marquee board on the front roof edge
    mw = 1.1
    ma = m - mw / 2
    mz = z1 + 1
    face(c, "L", v1 + 0.04, ma, ma + mw, mz, mz + 12, NAVY_D, lambda i, n, z, hh, b, s: (shade(col, 0.8), None) if i in (0, n - 1) or z in (0, hh - 1) else (NAVY_D, None), ao=False, edge=False)
    text_l(c, "53", ma + 0.38, v1 + 0.04, mz + 9, YELLOW)
    nb = 6 + 2 * tier
    for kk in range(nb + 1):
        for zz in (mz, mz + 12):
            x, y = c.P(ma + kk * mw / nb, v1 + 0.04, zz)
            c.put(x, y, BULB if kk % 2 else ORANGE, BULB)
    if tier >= 2:  # the dance floor
        cols = [(255, 90, 170), (90, 200, 255), YELLOW, (140, 255, 140)]
        for i in range(5):
            for j in range(2):
                u, v = 0.95 + i * 0.36, 2.58 + j * 0.18
                cc = cols[(i + j) % 4]
                c.poly([(u, v, 0), (u + 0.34, v, 0), (u + 0.34, v + 0.16, 0), (u, v + 0.16, 0)], cc, None)
                if tier >= 3:
                    c.poly([(u, v, 0), (u + 0.34, v, 0), (u + 0.34, v + 0.16, 0), (u, v + 0.16, 0)], cc, c.ld)
    if tier >= 4:  # chasing bulbs all round the parapet
        for kk in range(15):
            x, y = c.P(u0 + kk * (u1 - u0) / 14, v1, z1 - 1)
            c.put(x, y, BULB if kk % 2 else PINK, BULB)
        for kk in range(9):
            x, y = c.P(u1, v1 - kk * (v1 - v0) / 8, z1 - 1)
            c.put(x, y, BULB if kk % 2 else PINK, BULB)
    return c


def lattice_tower(c, z0, z1, w0, w1, col, panel=12, back=True):
    """A four-legged lattice tower round (CU, CV): legs from half-width w0 (tiles) to w1, X bracing and girts on the
    two visible faces; the back legs drawn darker first."""
    def hw(z):
        return w0 + (w1 - w0) * (z - z0) / max(1, z1 - z0)
    dark, mid, lit = shade(col, 0.62), shade(col, 0.8), shade(col, 1.08)
    if back:
        for (su, sv) in ((-1, -1),):
            c.d.line([c.P(CU + su * w0, CV + sv * w0, z0), c.P(CU + su * w1, CV + sv * w1, z1)], fill=A(dark))
    z = z0
    while z < z1:
        za, zb = z, min(z1, z + panel)
        a, b = hw(za), hw(zb)
        # left face (v = CV + h): from the left leg (CU - h) to the front leg (CU + h)
        c.d.line([c.P(CU - a, CV + a, za), c.P(CU + b, CV + b, zb)], fill=A(mid))
        c.d.line([c.P(CU + a, CV + a, za), c.P(CU - b, CV + b, zb)], fill=A(mid))
        c.d.line([c.P(CU - b, CV + b, zb), c.P(CU + b, CV + b, zb)], fill=A(lit))
        # right face (u = CU + h)
        c.d.line([c.P(CU + a, CV + a, za), c.P(CU + b, CV - b, zb)], fill=A(dark))
        c.d.line([c.P(CU + a, CV - a, za), c.P(CU + b, CV + b, zb)], fill=A(dark))
        c.d.line([c.P(CU + b, CV + b, zb), c.P(CU + b, CV - b, zb)], fill=A(mid))
        z = zb
    for (su, sv, cc) in ((-1, 1, lit), (1, -1, dark), (1, 1, lit)):
        pa, pb = c.P(CU + su * w0, CV + sv * w0, z0), c.P(CU + su * w1, CV + sv * w1, z1)
        c.d.line([pa, pb], fill=A(cc), width=2)


def platform(c, hf, z, col, key, lit=True):
    """A deck round the lattice: a thin slab with a lit rail."""
    prism(c, CU - hf, CV - hf, CU + hf, CV + hf, z, z + 3, col, L=combine(bands([(2, 3, LILAC)])), R=combine(bands([(2, 3, shade(LILAC, 0.9))])), ao=False, rim=0.04)
    if lit:
        for kk in range(5):
            x, y = c.P(CU - hf + kk * hf / 2, CV + hf, z + 2)
            c.light(x, y, LIT_COOL)


def tw_route53(tier, k):
    """A lattice mast (the DNS signal reaching everywhere): a four-legged steel tower over an equipment house, a
    plum lift core up its middle, decks with dish arrays turned every way, a red and white aerial on top."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=50)
    w0 = 0.62
    deck_z = [round(top_z * f) for f in ((0.55, 0.92) if tier == 2 else (0.36, 0.66, 0.92) if tier == 3 else (0.3, 0.55, 0.78, 0.94))]
    w1 = 0.16

    def hw(z):
        return w0 + (w1 - w0) * z / top_z
    # footings and the equipment house
    for (su, sv) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        prism(c, CU + su * w0 - 0.08, CV + sv * w0 - 0.08, CU + su * w0 + 0.08, CV + sv * w0 + 0.08, 0, 3, CON_L, rim=0)
    drum(c, CU, CV, 0, top_z, 0.11, NET_D, shader=ribbon_shader(k, floor=8, win=2, p=0.5, glass_col=LILAC), capcol=NET)
    lattice_tower(c, 2, top_z, w0, w1, STEEL, panel=14 if tier >= 3 else 11)
    ground_shadow(c, CU - 0.36, CV - 0.2, CU + 0.36, CV + 0.4, alpha=60)
    prism(c, CU - 0.36, CV - 0.2, CU + 0.36, CV + 0.4, 0, 11, (196, 190, 206), L=combine(top_band(2, NET), punched(k + "h", bay=5, floor=11, ww=3, wh=4, p=0.6)), R=combine(top_band(2, NET), louvres(2)))
    for j, z in enumerate(deck_z):
        hf = hw(z) + 0.1
        platform(c, hf, z, NET, k)
        # dishes on the corners, turned outward
        r = 5 if hf > 0.35 else 4
        dish(c, CU - hf + 0.05, CV + hf - 0.15, z + 3, r, WHITE, -1)
        dish(c, CU + hf - 0.15, CV - hf + 0.05, z + 3, r, WHITE, 1)
        if j % 2 == 0 and hf > 0.3:
            x, y = c.P(CU + hf, CV + hf, z + 3)
            c.d.rectangle((x - 2, y - 7, x + 1, y), fill=A(STEEL_M))  # a panel antenna on the front corner
            c.d.line([(x - 2, y - 7), (x - 2, y)], fill=A(STEEL))
    # the aerial: red and white bands, then the tip
    z = top_z + 3
    for kk in range(4):
        prism(c, CU - 0.05, CV - 0.05, CU + 0.05, CV + 0.05, z + kk * 4, z + kk * 4 + 4, RED if kk % 2 == 0 else WHITE, rim=0, ao=False)
    beacon(c, CU, CV, z + 8, RED, glow=2)
    tip(c, CU, CV, z + 16, h=5 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 3 else None)
    return c


# ── CloudFront ────────────────────────────────────────────────────────────────────────────────────────────────────

def globe_shader(key, ocean=(70, 140, 222), land=(98, 184, 104)):
    """The face of a globe: land masses, meridians and two parallels, shaded round; the grid lines and a scatter of
    cities light at night (the edge network)."""
    def g(th, z, h, base):
        t = z / max(1, h - 1)
        d = math.cos(th) * _SF + math.sin(th) * _SR
        f = tone(d) * (0.94 + 0.1 * t)
        lon = th
        lat = (t - 0.5) * math.pi
        isl = math.sin(2.6 * lon + 1.1) + math.sin(3.2 * lat + 0.4) + 0.7 * math.sin(5.1 * lon - 2.3 * lat + 0.8)
        col = land if isl > 0.9 else ocean
        lit = None
        ph = ((th + math.pi / 2) / math.pi * 5) % 1
        if ph < 0.09 or z in (round(h * 0.3), round(h * 0.68)):
            col = shade(col, 1.28)
            lit = (120, 200, 255, 200)
        elif col == land and hv(key, round(th * 9), z // 3) < 0.12:
            lit = LIT
        return shade(col, f), lit
    return g


def lm_cloudfront(fw, fh, tier, col, key):
    """CloudFront Post Office: a cream stone post office with tall windows and a plum cornice, a lit portal under a
    canopy, red mailboxes out front (one more each tier), a parcel pile at the side; a clock from tier 2, roof plant
    at 3, the delivery van at the kerb at 4. At tier 1 a small globe stands over the portal (the tower's globe later)."""
    c = Kit(fw, fh, 70)
    z1 = 16 + 3 * tier
    u0, v0, u1, v1 = 0.95, 1.4, 2.75, 2.45
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, 0, 2, CON_L, rim=0)
    wall = combine(top_band(3, col), bands([(2, 5, shade(CREAM, 0.84))]),
                   punched(key, bay=6, floor=z1 - 6, ww=3, wh=z1 - 13, p=0.5, lo=3, hi=z1 - 4), masonry(4, 9, 0.93))
    prism(c, u0, v0, u1, v1, 2, z1, CREAM, L=wall, R=wall, zref=2, href=z1 - 2)
    prism(c, u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, z1, z1 + 2, shade(col, 0.85), ao=False)
    roof = z1 + 2
    if tier >= 3:
        plant(c, u0 + 0.2, v0 + 0.15, u1 - 0.5, v1 - 0.35, roof, key + "p", n=2)
    m = (u0 + u1) / 2
    face(c, "L", v1, m - 0.22, m + 0.22, 2, 13, (58, 111, 216), lambda i, n, z, hh, b, s: ((BULB, LIT) if 0 < i < n - 1 and z < hh - 1 and i != n // 2 else (shade(NAVY_D, 1.2), None)), ao=False)
    prism(c, m - 0.34, v1, m + 0.34, v1 + 0.22, 13, 15, col, ao=False, rim=0)
    prism(c, m - 0.24, v1, m + 0.24, v1 + 0.14, 0, 2, STONE, ao=False, rim=0)
    if tier >= 2:  # the clock over the portal
        x, y = c.P(m, v1, z1 - 2)
        c.d.ellipse((x - 3, y - 6, x + 3, y), fill=A(WHITE), outline=A(NAVY_D))
        c.d.line([(x, y - 3), (x, y - 5)], fill=A(NAVY_D))
        c.d.line([(x, y - 3), (x + 2, y - 3)], fill=A(NAVY_D))
        c.ld.ellipse((x - 2, y - 5, x + 2, y - 1), fill=A(LIT, 160))
    else:  # a small globe on a plinth over the portal
        x, y = c.P(m, v1 - 0.25, roof)
        c.d.rectangle((x - 2, y - 3, x + 1, y), fill=A(CON_D))
        drum(c, m, v1 - 0.25, roof + 3, roof + 12, 0.22, (70, 140, 222), profile=lambda t: 0.22 * math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2)), shader=globe_shader(key), cap=False, ao=False)
    # mailboxes
    for i in range(tier):
        u = 1.0 + i * 0.3
        prism(c, u, 2.66, u + 0.16, 2.82, 0, 8, RED, L=combine(bands([(5, 6, shade(RED, 0.6))])), rim=0)
        c.poly([(u - 0.02, 2.64, 8), (u + 0.18, 2.64, 8), (u + 0.18, 2.84, 8), (u - 0.02, 2.84, 8)], shade(RED, 0.7))
    if tier >= 2:  # parcels at the side
        for i in range(1 + tier):
            v = 1.5 + i * 0.22
            prism(c, 2.8, v, 2.98, v + 0.18, 0, 4 + (i % 3) * 2, KRAFT, L=combine(bands([(2, 3, shade(KRAFT, 0.7))])), rim=0)
    if tier >= 4:  # the delivery van
        a, b = 1.9, 2.62
        prism(c, a, b, a + 0.75, b + 0.32, 1, 10, WHITE, L=combine(bands([(4, 6, col)])), rim=0)
        face(c, "L", b + 0.32, a + 0.56, a + 0.72, 6, 9, GLASS_L, lambda *x: (GLASS_L, LIT_COOL), ao=False)
        for wu in (a + 0.15, a + 0.6):
            x, y = c.P(wu, b + 0.32, 1)
            c.d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(CHAR))
    return c


def tw_cloudfront(tier, k):
    """The edge mast: a tapering ribbed shaft with ribbon windows, a ring of edge antennas round a deck, and a globe
    on top with an orange orbit of delivery routes; its grid lines and cities light at night."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=64)
    R = (0.4, 0.48, 0.56)[tier - 2]
    gh = round(2 * R * 22.6 * 0.96)
    zg = top_z - gh + 14  # the globe's bottom
    drum_shadow(c, CU, CV, 0.6)
    drum(c, CU, CV, 0, 9, 0.6, (196, 188, 174), shader=rib_shader(16, hoops=(7,)))
    drum(c, CU, CV, 9, 12, 0.5, NET, ao=False)
    drum(c, CU, CV, 12, zg + 4, 0.3, (228, 230, 236), r1=0.2, shader=ribbon_shader(k, floor=7, win=2, p=0.5, spandrel=(214, 218, 226)), ao=False)
    ze = round(zg * (0.62 if tier < 4 else 0.58))
    # the edge ring: antennas round a deck
    angs = [a * math.pi / 5 for a in range(10)]
    back = [a for a in angs if math.cos(a) + math.sin(a) < 0]
    front = [a for a in angs if a not in back]

    def antenna(a):
        u, v = CU + math.cos(a) * 0.5, CV + math.sin(a) * 0.5
        x, y = c.P(u, v, ze + 3)
        c.d.line([(x, y), (x, y - 7)], fill=A(STEEL_D))
        c.d.rectangle((x - 1, y - 9, x + 1, y - 5), fill=A(WHITE))
        c.d.point([(x, y - 10)], fill=A(RED))
        c.light(x, y - 10, RED)
    for a in back:
        antenna(a)
    drum(c, CU, CV, ze, ze + 3, 0.56, NET, shader=lambda th, z, h, b: ((LILAC, LIT_COOL) if z == 1 and int((th + 2) * 6) % 2 else None), ao=False)
    drum(c, CU, CV, ze + 3, zg + 4, 0.3 - 0.1 * (ze + 3 - 12) / max(1, zg + 4 - 12), (228, 230, 236), r1=0.2, shader=ribbon_shader(k + "u", floor=7, win=2, p=0.5, spandrel=(214, 218, 226)), ao=False)
    for a in front:
        antenna(a)
    if tier >= 3:  # a second, smaller ring
        z2 = round((ze + zg) / 2)
        drum(c, CU, CV, z2, z2 + 2, 0.36, NET_D, ao=False)
    # collar, then the globe with its orbit
    drum(c, CU, CV, zg, zg + 4, 0.16, NET, ao=False)
    cx, cy = c.P(CU, CV, zg + gh // 2)
    rx, ry = R * 22.6 + 7, 4 + tier
    box = (round(cx - rx), round(cy - ry), round(cx + rx), round(cy + ry))
    c.d.arc(box, 180, 360, fill=A(ORANGE_D))
    drum(c, CU, CV, zg + 2, zg + 2 + gh, R, (70, 140, 222), profile=lambda t: R * math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2)) + 0.02, shader=globe_shader(k), cap=False, ao=False)
    c.d.arc(box, 0, 180, fill=A(ORANGE))
    c.ld.arc(box, 0, 180, fill=A(ORANGE, 200))
    for a in (40, 125):  # parcels riding the orbit
        x = round(cx + rx * math.cos(math.radians(a)))
        y = round(cy + ry * math.sin(math.radians(a)))
        c.d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=A(KRAFT))
    tip(c, CU, CV, zg + gh, h=6 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c



# ── API Gateway ───────────────────────────────────────────────────────────────────────────────────────────────────

def lm_apigateway(fw, fh, tier, col, key):
    """API Gateway Station: a stone station hall with a great lunette window, a grand arch in front of it with the
    API sign on its keystone (every request walks through), a platform and track along the side; a clock from tier
    2, a train waiting at 3, lamps on the arch at 4."""
    c = Kit(fw, fh, 76)
    # the track along the right edge and its platform
    c.poly([(2.45, 0.1, 0), (2.95, 0.1, 0), (2.95, 2.9, 0), (2.45, 2.9, 0)], GRAVEL)
    for k in range(13):
        v = 0.15 + k * 0.215
        c.line((2.5, v, 0), (2.9, v, 0), WOOD_D)
    for u in (2.6, 2.8):
        c.line((u, 0.1, 0), (u, 2.9, 0), RAIL)
    prism(c, 2.2, 0.3, 2.45, 2.6, 0, 3, CON_L, L=combine(bands([(2, 3, YELLOW)])), R=combine(bands([(2, 3, YELLOW)])), rim=0)
    if tier >= 3:  # a train at the platform
        a, b = 2.5, 2.9
        prism(c, a, 0.4, b, 2.3, 1, 11, col, R=combine(bands([(3, 4, ORANGE)]), lambda i, n, z, hh, bb, s: ((GLASS_L, LIT) if 6 <= z < 9 and i % 5 in (1, 2, 3) else None)), L=combine(bands([(3, 4, ORANGE)])), roofcol=CON_L)
        prism(c, a + 0.02, 2.3, b - 0.02, 2.55, 1, 9, ORANGE, rim=0)
    # the hall
    u0, v0, u1, v1 = 0.85, 1.45, 2.15, 2.3
    z1 = 16 + 3 * tier
    ground_shadow(c, u0, v0, u1, v1)
    stone = (222, 214, 198)

    def lunette(i, n, z, h, base, side):
        cx, r = n / 2, n * 0.32
        zc = h - 6 - r * 0.9
        dz = z - zc
        if dz >= 0 and (i + 0.5 - cx) ** 2 + (dz * 1.4) ** 2 < r * r and z >= 3:
            if abs(i + 0.5 - cx) < 0.6 or int(dz) % 4 == 3:
                return shade(stone, 0.95), None
            return shade(GLASS_L, 0.95), (LIT if hv(key, i // 3, z // 3) < 0.6 else LIT_COOL)
        if dz < 0 and abs(i + 0.5 - cx) < r and z >= 1 and z < zc and (abs(i + 0.5 - cx) > r - 1.2):
            return shade(stone, 0.8), None
        if dz < 0 and abs(i + 0.5 - cx) < r - 1 and 1 <= z < zc:
            return shade(GLASS_L, 0.9), LIT if z < 8 else None
        return None
    L = combine(top_band(3, col), lunette, masonry(4, 8, 0.9))
    R = combine(top_band(3, col), punched(key + "r", bay=5, floor=8, ww=2, wh=5, p=0.5, lo=3), masonry(4, 8, 0.9))
    prism(c, u0, v0, u1, v1, 0, z1, stone, L=L, R=R, roofcol=shade(col, 0.6))
    # a barrel roof: three ribs along the hall
    vm = (v0 + v1) / 2
    for kk in range(4):
        uu = u0 + 0.12 + kk * (u1 - u0 - 0.24) / 3
        c.line((uu, v1 - 0.05, z1), (uu, vm, z1 + 5), shade(col, 1.2))
        c.line((uu, vm, z1 + 5), (uu, v0 + 0.05, z1), shade(col, 0.8))
    c.poly([(u0, v1, z1), (u1, v1, z1), (u1, vm, z1 + 5), (u0, vm, z1 + 5)], shade(GLASS_DK, 0.9))
    for kk in range(5):
        uu = u0 + 0.05 + kk * (u1 - u0 - 0.1) / 4
        c.line((uu, v1, z1), (uu, vm, z1 + 5), shade(col, 1.15))
    c.poly([(u1, v1, z1), (u1, v0, z1), (u1, vm, z1 + 5)], shade(stone, 0.72))
    if tier >= 2:  # the clock over the doors
        x, y = c.P((u0 + u1) / 2, v1, z1 - 3)
        c.d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=A(WHITE), outline=A(NAVY_D))
        c.d.line([(x, y), (x, y - 2)], fill=A(NAVY_D))
        c.d.line([(x, y), (x + 2, y)], fill=A(NAVY_D))
        c.ld.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(LIT, 150))
    # the arch in front of the hall
    av = 2.72
    ah = 26 + 3 * tier
    pa, pb = 0.75, 2.1
    for u in (pa, pb):
        prism(c, u, av - 0.08, u + 0.16, av + 0.08, 0, ah, col, L=combine(top_band(2, shade(col, 1.3)), masonry(5, 4, 0.88)), R=combine(masonry(5, 4, 0.88)), rim=0)
    x0, y0 = c.P(pa + 0.08, av, ah - 2)
    x1, y1 = c.P(pb + 0.08, av, ah - 2)
    rise = 8 + tier
    pts = [(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t - math.sin(t * math.pi) * rise)) for t in [k / 20 for k in range(21)]]
    c.d.line(pts, fill=A(col), width=4)
    c.d.line([(p[0], p[1] - 2) for p in pts], fill=A(shade(col, 1.35)))
    mx, my = (x0 + x1) // 2, (y0 + y1) // 2 - rise
    c.d.rectangle((mx - 7, my - 7, mx + 7, my + 1), fill=A(NAVY_D))
    c.d.rectangle((mx - 7, my - 7, mx + 7, my - 7), fill=A(shade(col, 1.2)))
    text_flat(c, "API", mx - 5, my - 5, YELLOW, light=tier >= 2)
    if tier >= 4:  # lamps on the arch
        for u in (pa + 0.08, pb + 0.08):
            x, y = c.P(u, av, ah)
            dot(c, x, y - 2, 1, BULB)
    return c


def tw_apigateway(tier, k):
    """The gateway: twin glass pylons joined high up by a sky lobby, an arch sprung between them under it (the
    front door every request walks through), lit fins and pointed caps, a short mast on the lobby."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=50)
    d = 0.52
    hp = 0.2
    pyl = [(CU - d, CV + d), (CU + d, CV - d)]  # left, right (both at the same depth)
    lob = 0.5
    lz1 = top_z - 8
    lz0 = lz1 - (16 if tier < 4 else 20)
    podium(c, CU - 0.74, CV - 0.74, CU + 0.74, CV + 0.74, 12, (200, 196, 210), k, accent=NET)

    def pylon_sh(kk):
        fin = lambda i, n, z, hh, b, s: ((shade(NET, 1.0 if s == "L" else 0.78), None) if i in (0, n - 1) else None)
        return combine(fin, top_band(3, NET), glass(kk, bay=4, floor=6, p=0.45, per_floor=False))

    for j, (pu, pv) in enumerate(pyl):
        prism(c, pu - hp, pv - hp, pu + hp, pv + hp, 12, top_z, (226, 228, 236), L=pylon_sh(k + str(j)), R=pylon_sh(k + str(j)), zref=12, href=top_z - 12, ao=False)
        c.pyramid(pu - hp, pv - hp, pu + hp, pv + hp, top_z, 9, NET)
    # the arch between the pylons, under the lobby
    for (zb, rise, w) in ((lz0 - 34, 26, 3),) + (((lz0 - 70, 20, 2),) if tier >= 4 else ()):
        if zb < 16:
            zb, rise = 16, max(8, lz0 - 16 - 4)
        pts = []
        for kk in range(25):
            s = -0.32 + 0.64 * kk / 24
            zz = zb + rise * math.sin(math.pi * kk / 24)
            pts.append(c.P(CU + s, CV - s, zz))
        c.d.line(pts, fill=A(NET_D), width=w)
        c.d.line([(x, y - 1) for x, y in pts], fill=A(LILAC))
        for x, y in pts[2:-2:3]:
            c.light(x, y - 1, LIT_COOL)
    # the sky lobby
    lg = combine(top_band(2, NET), bands([(0, 2, NET)]), glass(k + "lb", bay=4, floor=5, p=0.75, lo=2, hi=None))
    prism(c, CU - lob, CV - lob, CU + lob, CV + lob, lz0, lz1, (226, 228, 236), L=lg, R=lg, ao=False)
    for (pu, pv) in pyl:  # the pylons where they stand proud of the lobby
        if pu > CU:
            prism(c, CU + lob, pv - hp, pu + hp, pv + hp, lz0, lz1, (226, 228, 236), L=pylon_sh(k + "1"), R=pylon_sh(k + "1"), zref=12, href=top_z - 12, roof=False, ao=False)
        else:
            prism(c, pu - hp, CV + lob, pu + hp, pv + hp, lz0, lz1, (226, 228, 236), L=pylon_sh(k + "0"), R=pylon_sh(k + "0"), zref=12, href=top_z - 12, roof=False, ao=False)
    lattice(c, CU, CV, lz1, lz1 + 12, 2, 1, STEEL_M, step=4)
    tip(c, CU, CV, lz1 + 12, h=8 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c


# ── SQS / SNS ─────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_sqs(fw, fh, tier, col, key):
    """Queue & Bell: a brick sorting office with a bell-cote on its gable (SNS rings once, everyone hears), and the
    queue in front of it: a conveyor belt of parcels waiting in line (more each tier); a dead-letter bin at its far
    end from tier 2, sound rings from the bell at 4."""
    c = Kit(fw, fh, 70)
    brick = (176, 98, 74)
    u0, v0, u1, v1 = 1.75, 0.85, 2.8, 2.05
    h = 14 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    W = combine(bands([(0, 2, shade(brick, 0.7))]), punched(key, bay=6, floor=h - 2, ww=3, wh=5, p=0.6, lo=2), masonry(3, 5, 0.86))
    door = lambda i, n, z, hh, b, s: ((shade(col, 0.7), None) if n * 0.3 < i < n * 0.7 and z < hh - 5 else None)
    prism(c, u0, v0, u1, v1, 0, h, brick, L=combine(door, W), R=W, roof=False)
    c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, h, 8, col)
    # bell-cote on the ridge
    vm = (v0 + v1) / 2
    bu = u1 - 0.2
    x, y = c.P(bu, vm, h + 8)
    c.d.rectangle((x - 4, y - 11, x + 3, y), fill=A(STONE))
    c.d.rectangle((x - 2, y - 9, x + 1, y - 3), fill=A(NAVY_D))
    c.d.polygon([(x - 5, y - 11), (x + 4, y - 11), (x, y - 15)], fill=A(col))
    c.d.polygon([(x - 2, y - 8), (x + 1, y - 8), (x + 2, y - 4), (x - 3, y - 4)], fill=A(GOLD))
    c.ld.polygon([(x - 2, y - 8), (x + 1, y - 8), (x + 2, y - 4), (x - 3, y - 4)], fill=A(GOLD, 180))
    if tier >= 4:
        for rr in (6, 10):
            c.d.arc((x - rr, y - 6 - rr, x + rr, y - 6 + rr), 200, 250, fill=A(YELLOW))
            c.d.arc((x - rr, y - 6 - rr, x + rr, y - 6 + rr), 290, 340, fill=A(YELLOW))
            c.ld.arc((x - rr, y - 6 - rr, x + rr, y - 6 + rr), 200, 250, fill=A(YELLOW))
            c.ld.arc((x - rr, y - 6 - rr, x + rr, y - 6 + rr), 290, 340, fill=A(YELLOW))
    # the conveyor queue
    a0, a1, b0, b1 = 0.55, 2.8, 2.3, 2.7
    if tier >= 2:  # dead-letter bin at the far end
        prism(c, 0.1, 2.28, 0.45, 2.72, 0, 8, RED if tier >= 4 else (120, 70, 150), L=combine(bands([(6, 8, shade(RED, 0.6))])), rim=0.04)
    ground_shadow(c, a0, b0, a1, b1, alpha=50)
    prism(c, a0, b0, a1, b1, 0, 5, CON_D, L=combine(bands([(3, 5, CHAR)]), ribs(5, 1.15, 0.8)), R=combine(bands([(3, 5, CHAR)])), roofcol=NAVY, rim=0.03)
    for kk in range(10):
        c.line((a0 + 0.05 + kk * 0.22, b0 + 0.04, 5), (a0 + 0.05 + kk * 0.22, b1 - 0.04, 5), shade(NAVY, 1.4))
    n = 2 + tier
    for i in range(n):
        u = a1 - 0.42 - i * 0.38
        if u < a0:
            break
        cc = [KRAFT, shade(col, 1.25), KRAFT, ORANGE, WHITE][i % 5]
        prism(c, u, b0 + 0.08, u + 0.28, b1 - 0.1, 5, 10 + (i % 2), cc, L=combine(bands([(2, 3, shade(cc, 0.7))])), ao=False, rim=0)
    # a hatch where the belt enters the office
    face(c, "L", v1, u0 + 0.05, u0 + 0.35, 0, 7, NAVY_D, ao=False)
    return c


def slots(key, bay=4, floor=5):
    """A wall of pigeonholes: a frame grid, each slot recessed and holding a letter, a parcel or nothing; some
    letters glow at night (messages waiting)."""
    def g(i, n, z, h, base, side):
        if i == 0 or i == n - 1 or z >= h - 2:
            return None
        bi, fz = i % bay, z % floor
        frame = shade(LILAC, 1.0 if side == "L" else 0.78)
        if bi == 0 or fz == floor - 1:
            return frame, None
        r = hv(key, side, i // bay, z // floor)
        deep = shade(NET_D, 0.45 if side == "L" else 0.35)
        if fz == floor - 2 or bi == (1 if side == "L" else bay - 1):
            return shade(deep, 0.8), None
        if r < 0.25:
            return deep, None
        if r < 0.75:
            col = shade(WHITE, 1.0 if side == "L" else 0.82)
            return col, (LIT if r < 0.4 else LIT_COOL if r < 0.5 else None)
        return shade(KRAFT, 0.95 if side == "L" else 0.76), None
    return g


def tw_sqs(tier, k):
    """The queue tower: a slab of pigeonholes, letters waiting in their slots floor upon floor, a plum band every
    few floors, and an open belfry on top with its golden bell (SNS) under a pyramid roof."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=56)
    u0, v0, u1, v1 = 0.3, 0.35, 1.4, 1.35
    podium(c, u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, 12, (200, 196, 210), k, accent=NET)
    band = lambda i, n, z, hh, b, s: ((shade(NET, 1.0 if s == "L" else 0.76), None) if z % 30 in (28, 29) and z < hh - 4 else None)
    sh = combine(top_band(3, NET), band, slots(k, bay=5, floor=6))
    bz = top_z - 14
    prism(c, u0, v0, u1, v1, 12, bz, (200, 196, 214), L=sh, R=sh, zref=12, href=bz - 12, ao=False)
    prism(c, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, bz, bz + 3, NET, ao=False)
    # the belfry: corner posts, the bell inside, a parapet and a pyramid roof
    s = 0.3
    cu, cv = CU, CV
    z0, z1 = bz + 3, bz + 19
    prism(c, cu - s, cv - s, cu + s, cv + s, z0, z0 + 1, STONE, ao=False)
    for (pu, pv) in ((cu - s, cv - s), (cu + s - 0.1, cv - s), (cu - s, cv + s - 0.1)):
        prism(c, pu, pv, pu + 0.1, pv + 0.1, z0, z1, STONE, rim=0, ao=False)
    face(c, "L", cv + s - 0.02, cu - s + 0.1, cu + s - 0.1, z0 + 1, z1, NAVY_D, ao=False, edge=False)
    face(c, "R", cu + s - 0.02, cv - s + 0.1, cv + s - 0.1, z0 + 1, z1, shade(NAVY_D, 0.85), ao=False, edge=False)
    x, y = c.P(cu, cv, z0 + 3)
    bell = [(x - 2, y - 11), (x + 1, y - 11), (x + 3, y - 4), (x + 5, y - 1), (x - 6, y - 1), (x - 4, y - 4)]
    c.d.polygon(bell, fill=A(GOLD))
    c.d.line([(x - 2, y - 10), (x - 4, y - 3)], fill=A(shade(GOLD, 1.25)))
    c.ld.polygon(bell, fill=A(GOLD, 170))
    c.d.point([(x - 1, y)], fill=A(shade(GOLD, 0.7)))
    prism(c, cu + s - 0.1, cv + s - 0.1, cu + s, cv + s, z0, z1, STONE, rim=0, ao=False)
    prism(c, cu - s - 0.04, cv - s - 0.04, cu + s + 0.04, cv + s + 0.04, z1, z1 + 3, NET, ao=False)
    c.pyramid(cu - s - 0.04, cv - s - 0.04, cu + s + 0.04, cv + s + 0.04, z1 + 3, 12, NET_D)
    if tier >= 3:  # the bell's ring spreading out (fan-out)
        for rr in range(tier - 1):
            r_ = 13 + rr * 5
            for d_ in (c.d, c.ld):
                d_.arc((x - r_, y - 6 - r_, x + r_, y - 6 + r_), 150, 210, fill=A(YELLOW))
                d_.arc((x - r_, y - 6 - r_, x + r_, y - 6 + r_), 330, 30, fill=A(YELLOW))
    tip(c, CU, CV, z1 + 14, h=6 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c


# ── EventBridge ───────────────────────────────────────────────────────────────────────────────────────────────────

def lm_eventbridge(fw, fh, tier, col, key):
    """EventBridge Crossing: two railway lines crossing at a turntable (the bus), a signal box between them whose
    lit upper storey watches the events go by, signals routing each event to its line (one more each tier); a
    barrier arm from tier 2, an event train at 3, a signal gantry over the line at 4."""
    c = Kit(fw, fh, 70)
    for (u0, v0, u1, v1) in ((0.05, 2.35, 2.95, 2.85), (2.35, 0.05, 2.85, 2.95)):
        c.poly([(u0, v0, 0), (u1, v0, 0), (u1, v1, 0), (u0, v1, 0)], GRAVEL)
    for kk in range(14):
        a = 0.1 + kk * 0.205
        if not 2.3 < a < 2.9:
            c.line((a, 2.42, 0), (a, 2.78, 0), WOOD_D)
            c.line((2.42, a, 0), (2.78, a, 0), WOOD_D)
    for v in (2.5, 2.7):
        c.line((0.05, v, 0), (2.95, v, 0), RAIL)
    for u in (2.5, 2.7):
        c.line((u, 0.05, 0), (u, 2.95, 0), RAIL)
    x, y = c.P(2.6, 2.6, 0)
    c.d.ellipse((x - 9, y - 5, x + 9, y + 4), outline=A(col))
    c.ld.ellipse((x - 9, y - 5, x + 9, y + 4), outline=A(col))
    # the signal box
    u0, v0, u1, v1 = 1.5, 1.45, 2.2, 2.15
    h1 = 9 + tier
    ground_shadow(c, u0, v0, u1, v1)
    brick = (178, 112, 88)
    prism(c, u0, v0, u1, v1, 0, h1, brick, L=combine(masonry(3, 5, 0.86)), R=combine(masonry(3, 5, 0.86)), ao=True, rim=0)
    g = combine(bands([(0, 2, CREAM)]), glass(key + "sb", bay=3, floor=9, p=0.9, frame=CREAM, lo=2, refl=False))
    prism(c, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, h1, h1 + 9, CREAM, L=g, R=g, roof=False, ao=False)
    c.pyramid(u0 - 0.1, v0 - 0.1, u1 + 0.1, v1 + 0.1, h1 + 9, 8, col)
    # signals
    posts = [(2.2, 2.95, 0), (2.95, 2.2, 2), (1.3, 2.3, 1), (2.3, 1.3, 0)]
    for i in range(min(tier, 4)):
        u, v, lit = posts[i]
        x, y = post(c, u, v, 0, 18 + 2 * i)
        signal_head(c, x, y, lit)
    if tier >= 2:  # barrier arm
        x0, y0 = post(c, 1.95, 2.3, 0, 7)
        for kk in range(7):
            c.d.line([(x0 - kk * 3, y0 - kk), (x0 - kk * 3 - 3, y0 - kk - 1)], fill=A(RED if kk % 2 else WHITE), width=2)
    if tier >= 3:  # an event train on the line
        prism(c, 0.2, 2.45, 1.55, 2.75, 1, 9, col, L=combine(bands([(3, 4, ORANGE)]), lambda i, n, z, hh, b, s: ((GLASS_L, LIT) if 5 <= z < 8 and i % 5 in (1, 2, 3) else None)), roofcol=CON_L)
    if tier >= 4:  # a signal gantry over the line
        for v in (2.3, 2.9):
            prism(c, 1.1, v - 0.05, 1.18, v + 0.03, 0, 30, CON_D, rim=0, ao=False)
        prism(c, 1.1, 2.25, 1.18, 2.93, 30, 33, NAVY, rim=0, ao=False)
        for i, lt in enumerate((0, 1)):
            x, y = c.P(1.18, 2.45 + i * 0.3, 30)
            signal_head(c, x, y, lt, cols=(SIG_G, SIG_A))
    return c


def tw_eventbridge(tier, k):
    """The bus tower: a tall glass core with a plum light stream running up its front corner (the event bus), two
    lower target towers in front of it, left and right, joined to the core by glass signal bridges with signals
    hung under them (rules routing events to targets); a signal gantry crowns the core."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=50)
    hc, hs, off = 0.32, 0.23, 1.12
    zl, zr = round(top_z * 0.56), round(top_z * 0.4)
    ground_shadow(c, CU - hc, CV - hc, CU + hc, CV + hc)
    stream = lambda i, n, z, hh, b, s: ((LILAC, LILAC) if ((s == "L" and i == n - 2) or (s == "R" and i == 1)) and z % 6 < 3 else
                                         (NET, None) if (s == "L" and i == n - 2) or (s == "R" and i == 1) else None)
    sh = combine(top_band(2, NET), stream, glass(k, bay=4, floor=6, p=0.5, palette=None))
    prism(c, CU - hc, CV - hc, CU + hc, CV + hc, 0, top_z, (220, 224, 234), L=sh, R=sh)
    # bridges, then the target towers in front
    sats = [((CU, CV + off), zl, "l"), ((CU + off, CV), zr, "r")]
    for (su, sv), zt, s in sats:
        bz = zt - 10
        if s == "l":
            bridge(c, CU - 0.1, CV + hc, CU + 0.1, sv - hs, bz - 2, bz + 9, NET, k + s)
        else:
            bridge(c, CU + hc, CV - 0.1, su - hs, CV + 0.1, bz - 2, bz + 9, NET, k + s)
        if tier >= 4:  # a second bridge lower down
            if s == "l":
                bridge(c, CU - 0.09, CV + hc, CU + 0.09, sv - hs, bz - 30, bz - 25, NET_D, k + s + "2")
            else:
                bridge(c, CU + hc, CV - 0.09, su - hs, CV + 0.09, bz - 30, bz - 25, NET_D, k + s + "2")
    for (su, sv), zt, s in sorted(sats, key=lambda t: t[0][0] + t[0][1]):
        ground_shadow(c, su - hs, sv - hs, su + hs, sv + hs)
        if s == "l":
            ssh = combine(top_band(2, NET), punched(k + s, bay=4, floor=7, ww=2, wh=4, p=0.55, lo=3))
            prism(c, su - hs, sv - hs, su + hs, sv + hs, 0, zt, WHITE, L=ssh, R=ssh)
        else:
            ssh = combine(top_band(2, NET), glass(k + s, bay=4, floor=6, p=0.5, palette=None, frame=(150, 160, 180)))
            prism(c, su - hs, sv - hs, su + hs, sv + hs, 0, zt, (90, 100, 126), L=ssh, R=ssh)
        prism(c, su - hs - 0.03, sv - hs - 0.03, su + hs + 0.03, sv + hs + 0.03, zt, zt + 2, NET, ao=False)
        # a signal head under the bridge's end
        x, y = c.P(su - (0 if s == "l" else hs), sv - (hs if s == "l" else 0), zt - 12)
        signal_head(c, x + (3 if s == "l" else -3), y, 0 if s == "l" else 2)
    # the gantry crown: an arm across the core with signal heads at both ends
    z = top_z
    prism(c, CU - 0.08, CV - 0.08, CU + 0.08, CV + 0.08, z, z + 10, CON_D, rim=0, ao=False)
    prism(c, CU - 0.55, CV - 0.07, CU + 0.55, CV + 0.07, z + 10, z + 14, NAVY, L=combine(bands([(1, 2, NET)])), rim=0, ao=False)
    for u, lt in ((CU - 0.45, 0), (CU, 1), (CU + 0.45, 2)):
        x, y = c.P(u, CV + 0.07, z + 10)
        signal_head(c, x, y + 1, lt)
    tip(c, CU, CV, z + 14, h=10 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c


# ── Transit Gateway ───────────────────────────────────────────────────────────────────────────────────────────────

from services.kit import screen as kit_screen  # noqa: E402

def ramp(c, x0, y0, x1, y1, col, w=3):
    """A flyover ramp in screen space: a deck line `w` px thick with a lit kerb on top and a dark fascia under it."""
    c.d.line([(x0, y0), (x1, y1)], fill=A(shade(col, 0.7)), width=w)
    c.d.line([(x0, y0 - (w // 2)), (x1, y1 - (w // 2))], fill=A(shade(col, 1.15)))


def lm_transitgateway(fw, fh, tier, col, key):
    """Transit Gateway Interchange: a round hub hall (one place every network connects through) with roads running
    out of it to the lot's edges, and flyover ramps on piers sweeping round it (one more each tier, the networks it
    joins); a route board over the hub's door from tier 2, a lit ring round its roof at 3, cars on the ramps at 4."""
    c = Kit(fw, fh, 72)
    hu, hv_ = 1.75, 1.85  # the hub's centre, on the front of the lot
    asphalt = (92, 96, 108)
    # roads from the hub to the lot's edges (the attachments)
    for (a, b, cc, d) in ((hu - 0.18, 0.1, hu + 0.18, hv_), (0.1, hv_ - 0.18, hu, hv_ + 0.18), (hu - 0.18, hv_, hu + 0.18, 2.95), (hu, hv_ - 0.18, 2.95, hv_ + 0.18)):
        c.poly([(a, b, 0), (cc, b, 0), (cc, d, 0), (a, d, 0)], asphalt)
    for (p, q) in (((hu, 0.15, 0), (hu, hv_ - 0.6, 0)), ((0.15, hv_, 0), (hu - 0.6, hv_, 0)), ((hu, hv_ + 0.6, 0), (hu, 2.9, 0)), ((hu + 0.6, hv_, 0), (2.9, hv_, 0))):
        x0, y0 = c.P(*p)
        x1, y1 = c.P(*q)
        for t in range(0, 12, 2):
            c.d.point([(round(x0 + (x1 - x0) * t / 12), round(y0 + (y1 - y0) * t / 12))], fill=A(WHITE))
    # flyovers on piers, sweeping round the hub: back ones first
    n = 1 + tier
    arcs = [(-2.3, -0.9), (2.4, 3.6), (0.3, 1.5), (-0.9, 0.3), (1.6, 2.6)][:n]
    zr = 12

    def flyover(a0, a1, back):
        r = 0.95
        pts = []
        for kk in range(13):
            a = a0 + (a1 - a0) * kk / 12
            zz = zr + 3 * math.sin(math.pi * kk / 12)
            pts.append((a, hu + math.cos(a) * r, hv_ + math.sin(a) * r, zz))
        for (a, u, v, zz) in pts[::4]:
            if (math.cos(a) + math.sin(a) < 0) == back:
                x, y = c.P(u, v, 0)
                c.d.rectangle((x - 1, y - round(zz), x + 1, y), fill=A(CON_M))
                c.d.line([(x - 1, y - round(zz)), (x - 1, y)], fill=A(CON_L))
        for (a, u, v, zz), (b, u2, v2, z2) in zip(pts, pts[1:]):
            if (math.cos(a) + math.sin(a) < 0) == back:
                x0, y0 = c.P(u, v, zz)
                x1, y1 = c.P(u2, v2, z2)
                ramp(c, x0, y0, x1, y1, CON_L, 4)
    for a0, a1 in arcs:
        flyover(a0, a1, True)
    # the hub hall: a drum with ribbon windows and a plum roof
    drum_shadow(c, hu, hv_, 0.55)
    h = 14 + 3 * tier
    drum(c, hu, hv_, 0, h, 0.55, (226, 222, 236), shader=ribbon_shader(key, floor=7, win=3, p=0.55, spandrel=NET), capcol=shade(col, 0.8))
    drum(c, hu, hv_, h, h + 3, 0.42, col, ao=False, capcol=shade(col, 0.6))
    x, y = c.P(hu, hv_, h + 3)
    if tier >= 3:  # the lit ring on the roof
        c.d.ellipse((x - 10, y - 5, x + 10, y + 4), outline=A(LILAC))
        c.ld.ellipse((x - 10, y - 5, x + 10, y + 4), outline=A(LIT_COOL, 220))
    # the hub's spire of spokes
    for kk in range(6):
        a = kk * math.pi / 3
        c.d.line([(x, y - 9), (x + round(math.cos(a) * 8), y + round(math.sin(a) * 3) - 2)], fill=A(STEEL_M))
    c.d.line([(x, y), (x, y - 11)], fill=A(STEEL))
    dot(c, x, y - 11, 1, LILAC)
    # the door and the route board over it
    face(c, "L", hv_ + 0.55, hu - 0.16, hu + 0.16, 0, 9, NAVY_D, lambda i, nn, z, hh, b, s: ((LIT, LIT) if 0 < i < nn - 1 and z < hh - 1 else None), ao=False)
    if tier >= 2:
        bx, by = c.P(hu, hv_ + 0.6, 13)
        c.d.rectangle((bx - 7, by - 6, bx + 6, by), fill=A(NAVY_D))
        for r_, cc in enumerate((SIG_G, YELLOW, LILAC)):
            c.d.line([(bx - 5, by - 5 + r_ * 2), (bx - 5 + 4 + 3 * r_, by - 5 + r_ * 2)], fill=A(cc))
            c.light(bx - 5, by - 5 + r_ * 2, cc)
    for a0, a1 in arcs:
        flyover(a0, a1, False)
    if tier >= 4:  # cars on the ramps
        for a, cc in ((0.6, RED), (1.2, WHITE), (-0.5, YELLOW)):
            x, y = c.P(hu + math.cos(a) * 0.95, hv_ + math.sin(a) * 0.95, zr + 3 * math.sin(math.pi * 0.5) + 2)
            c.d.rectangle((x - 2, y - 2, x + 1, y), fill=A(cc))
            c.light(x + 1, y - 1, LIT)
    return c


def tw_transitgateway(tier, k):
    """The hub tower: a round glass core with a ramp spiralling up round it on spokes (every route climbs to the hub),
    a ring deck at each turn, and a crown wheel at the top: a rim on six spokes round the tip."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=56)
    rc, ri, ro = 0.3, 0.36, 0.62
    turns = tier - 0.5
    z0, z1 = 10, top_z - 16
    pitch = (z1 - z0) / turns
    steps = int(turns * 28)
    segs = []
    for s in range(steps):
        a, b = s / 28 * 2 * math.pi, (s + 1) / 28 * 2 * math.pi
        za, zb = z0 + pitch * a / (2 * math.pi), z0 + pitch * b / (2 * math.pi)
        segs.append((a, b, za, zb))

    def seg(a, b, za, zb):
        ca, sa, cb, sb = math.cos(a), math.sin(a), math.cos(b), math.sin(b)
        # the outer fascia (seen when it faces the viewer), then the deck
        if (ca + sb) > -0.3:
            f = tone(math.cos(a - math.pi / 4) * _SF + math.sin(a - math.pi / 4) * _SR)
            c.poly([(CU + ca * ro, CV + sa * ro, za - 3), (CU + cb * ro, CV + sb * ro, zb - 3), (CU + cb * ro, CV + sb * ro, zb), (CU + ca * ro, CV + sa * ro, za)], shade(NET, f))
        c.poly([(CU + ca * ri, CV + sa * ri, za), (CU + cb * ri, CV + sb * ri, zb), (CU + cb * ro, CV + sb * ro, zb), (CU + ca * ro, CV + sa * ro, za)], CON_L)
        # the white kerb line on the deck's outer edge, lit cool at night
        x0, y0 = c.P(CU + ca * ro, CV + sa * ro, za)
        x1, y1 = c.P(CU + cb * ro, CV + sb * ro, zb)
        c.d.line([(x0, y0), (x1, y1)], fill=A(WHITE))
        c.light(x0, y0, LIT_COOL if int(a * 3) % 2 else LIT)

    back = [s for s in segs if math.cos(s[0] + 0.1) + math.sin(s[0] + 0.1) < 0]
    front = [s for s in segs if s not in back]
    drum_shadow(c, CU, CV, ro)
    drum(c, CU, CV, 0, 10, ro + 0.04, (196, 190, 206), shader=rib_shader(16, hoops=(7,)))
    for s in back:
        seg(*s)
    drum(c, CU, CV, 10, z1 + 8, rc, (226, 228, 236), shader=ribbon_shader(k, floor=6, win=3, p=0.55, glass_col=LILAC, spandrel=(214, 218, 226)), ao=False)
    # spokes from the core to the ramp at each quarter
    for s in segs[::7]:
        a, _, za, _ = s
        x0, y0 = c.P(CU + math.cos(a) * rc, CV + math.sin(a) * rc, za - 2)
        x1, y1 = c.P(CU + math.cos(a) * ro, CV + math.sin(a) * ro, za - 2)
        if math.cos(a) + math.sin(a) >= 0:
            c.d.line([(x0, y0), (x1, y1)], fill=A(NET_D))
    for s in front:
        seg(*s)
    # the crown wheel: rim, hub and spokes round the tip
    z = z1 + 8
    drum(c, CU, CV, z, z + 4, 0.2, NET, ao=False)
    cx, cy = c.P(CU, CV, z + 6)
    rx, ry = round(0.5 * 22.6), round(0.5 * 11.3)
    box = (cx - rx, cy - ry, cx + rx, cy + ry)
    c.d.arc(box, 180, 360, fill=A(NET_D), width=2)
    for kk in range(6):
        a = kk * math.pi / 3 + 0.3
        c.d.line([(cx, cy), (cx + round(math.cos(a) * rx), cy + round(math.sin(a) * ry))], fill=A(STEEL_M))
    c.d.arc(box, 0, 180, fill=A(LILAC), width=2)
    c.ld.arc(box, 0, 180, fill=A(LIT_COOL, 200), width=1)
    tip(c, CU, CV, z + 6, h=10 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c


# ── Global Accelerator ────────────────────────────────────────────────────────────────────────────────────────────

def lm_globalaccelerator(fw, fh, tier, col, key):
    """Global Accelerator Express: a sleek dark-glass terminal with a rounded nose, an express guideway on piers
    running past it, and a lilac entry hoop at each end of the fast lane in front (its two fixed entry addresses);
    chevrons on the lane, a departures board from tier 2, the express train on the guideway at 3."""
    c = Kit(fw, fh, 74)
    # the fast lane in front: chevrons pointing along u
    c.poly([(0.3, 2.45, 0), (2.9, 2.45, 0), (2.9, 2.9, 0), (0.3, 2.9, 0)], (92, 96, 108))
    for kk in range(5):
        u = 0.5 + kk * 0.5
        c.line((u, 2.5, 0), (u + 0.15, 2.67, 0), ORANGE)
        c.line((u + 0.15, 2.67, 0), (u, 2.85, 0), ORANGE)
    # the guideway along the back of the front lot (u direction), on piers
    gv0, gv1, gz = 1.25, 1.5, 18
    for u in (0.55, 1.35, 2.15, 2.8):
        prism(c, u - 0.06, gv0 + 0.06, u + 0.06, gv1 - 0.06, 0, gz, CON_L, rim=0)
    prism(c, 0.2, gv0, 2.95, gv1, gz, gz + 3, WHITE, L=combine(bands([(1, 2, NET)])), R=combine(bands([(1, 2, NET)])), ao=False, rim=0)
    if tier >= 3:  # the express train: a white body with a long nose
        prism(c, 0.4, gv0 + 0.03, 2.2, gv1 - 0.03, gz + 3, gz + 10, WHITE, L=combine(bands([(2, 3, ORANGE)]), lambda i, n, z, hh, b, s: ((GLASS_DK, LIT_COOL) if 4 <= z < 6 and i % 4 != 0 else None)), R=combine(bands([(2, 3, ORANGE)])), roofcol=STEEL, ao=False, rim=0)
        c.poly([(2.2, gv0 + 0.03, gz + 3), (2.6, (gv0 + gv1) / 2, gz + 3), (2.2, gv1 - 0.03, gz + 3)], shade(WHITE, 0.9))
        c.poly([(2.2, gv1 - 0.03, gz + 3), (2.6, (gv0 + gv1) / 2, gz + 3), (2.2, gv1 - 0.03, gz + 10)], shade(WHITE, 0.95))
        c.poly([(2.2, gv0 + 0.03, gz + 10), (2.2, gv1 - 0.03, gz + 10), (2.6, (gv0 + gv1) / 2, gz + 3)], STEEL)
        x, y = c.P(2.33, gv1 - 0.06, gz + 7)
        c.put(x, y, GLASS_DK, LIT_COOL)
        c.put(x + 1, y, GLASS_DK, LIT_COOL)
    # the terminal: low dark glass, rounded at its near end
    u0, v0, u1, v1 = 0.7, 1.6, 2.35, 2.3
    h = 10 + 2 * tier
    ground_shadow(c, u0, v0, u1 + 0.35, v1)
    dg = combine(top_band(2, col), glass(key, bay=5, floor=h, p=0.65, lo=1, palette=DARK_GLASS_N))
    prism(c, u0, v0, u1, v1, 0, h, (60, 70, 96), L=dg, R=dg, roofcol=(196, 200, 214))
    drum(c, u1, (v0 + v1) / 2, 0, h, (v1 - v0) / 2, (60, 70, 96), shader=ribbon_shader(key + "n", floor=h, win=h - 4, p=0.7, glass_col=(84, 122, 162)), capcol=(196, 200, 214))
    x, y = c.P(u1, (v0 + v1) / 2, h)
    c.d.line([(x - 6, y + 1), (x + 6, y - 2)], fill=A(col))  # a plum stripe over the nose
    face(c, "L", v1, u0 + 0.25, u0 + 0.6, 0, 8, NAVY_D, lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 and i != n // 2 else None), ao=False)
    if tier >= 2:  # the departures board on the roof edge
        kit_screen(c, "L", v1 + 0.02, u0 + 0.75, u0 + 1.35, h - 1, h + 6, key, ORANGE, kind="ticker")
    # the two entry hoops, one at each end of the fast lane (its two fixed entry addresses), lilac with lit studs
    for j, u in enumerate((0.42, 2.72)):
        rise = 20 + 2 * tier
        pts = []
        for kk in range(17):
            t = kk / 16
            pts.append(c.P(u, 2.36 + 0.56 * t, rise * math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2))))
        c.d.line(pts, fill=A(NET_D), width=3)
        c.d.line([(x - 1, y) for x, y in pts], fill=A(LILAC))
        for x, y in pts[1:-1:3]:
            c.put(x, y, WHITE, LIT_COOL if tier >= 2 else None)
        for x, y in (pts[0], pts[-1]):
            c.d.rectangle((x - 2, y - 2, x + 1, y), fill=A(CON_D))
        x, y = pts[8]
        dot(c, x, y - 2, 1, ORANGE, light=tier >= 2)
    return c


DARK_GLASS_N = {"L": ((52, 70, 112), (70, 92, 140), (96, 122, 170)), "R": ((36, 46, 80), (48, 62, 100), (64, 84, 124))}


def tw_globalaccelerator(tier, k):
    """The speed fin: a thin white blade of a tower, long side to the street, its leading edge raked back to the tip
    in steps; orange speed lines streak along its face (lit at night) and a dark glass band runs under each, and a
    crown of two beacon masts (the two entry addresses) stands either side of the tip."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=52)
    t = 0.17
    ua, ub = CU - 0.66, CU + 0.66
    zs = round(top_z * 0.4)
    ground_shadow(c, ua, CV - t, ub, CV + t)
    prism(c, ua - 0.08, CV - t - 0.1, ub + 0.08, CV + t + 0.1, 0, 8, (196, 190, 206), L=combine(top_band(2, NET), glass(k + "b", bay=4, floor=9, p=0.7, lo=1)), R=combine(top_band(2, NET), louvres(2)))

    def streaks(kk):
        def g(i, n, z, h, base, side):
            zz = z
            if zz % 12 in (0, 1):
                on = side == "L" and hv(kk, zz // 12, i // 9) < 0.7 and (i + zz) % 9 < 6
                return (shade(ORANGE, 1.0 if side == "L" else 0.78), (ORANGE if on else None))
            if zz % 12 in (3, 4, 5, 6):
                gc = (84, 122, 162) if side == "L" else (52, 76, 112)
                return gc, (LIT_COOL if hv(kk, side, zz // 12, i // 6) < 0.35 else None)
            return None
        return g
    sh = combine(top_band(2, NET), streaks(k))
    step = 4
    z = 8
    while z < top_z:
        z2 = min(top_z, z + step)
        f = max(0.0, (z - zs) / max(1, top_z - zs))
        u1 = ub - (ub - (CU + 0.12)) * f ** 1.2
        u0 = ua + 0.18 * f
        prism(c, u0, CV - t, u1, CV + t, z, z2, WHITE, L=sh, R=sh, zref=0, href=top_z, ao=False, rim=0, roofcol=shade(WHITE, 0.94))
        z = z2
    # the crown: two beacon masts either side of the tip, a plum cap between
    prism(c, CU - 0.2, CV - t, CU + 0.1, CV + t, top_z, top_z + 4, NET, ao=False, rim=0)
    for u, bc in ((CU - 0.42, WHITE), (CU + 0.06, ORANGE)):
        x, y = c.P(u, CV, top_z)
        c.d.line([(x, y), (x, y - 9)], fill=A(STEEL_D))
        beacon(c, u, CV, top_z + 10, bc, glow=3)
    tip(c, CU, CV, top_z + 4, h=14 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c
