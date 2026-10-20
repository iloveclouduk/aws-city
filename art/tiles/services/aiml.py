"""
AI Heights (bedrock agentcore sagemaker q rekognition textract polly comprehend): front buildings lm_<id> and towers tw_<id> (see
services/__init__.py). Front buildings keep their metaphors, each with its own shape: the Bedrock mesa of rock strata
with its lantern shrine, the AgentCore Academy (a brick school with a robot crest), the SageMaker workshop under a
vaulted roof with its training dial, the Q help kiosk with its speech-bubble sign, the Rekognition gallery (a white
box with a camera-aperture window) and the Textract reading hall roofed by an open book.

Towers: rock strata rising into glass and a crystal (Bedrock), a school tower crowned by a robot head (AgentCore), a
lab with a training dial and an antenna array (SageMaker), a slim drum under a speech bubble (Q), a dark tower under
a camera with an aperture lens (Rekognition), a stack of pages with a quill (Textract), a broadcast mast with horn
clusters and sound waves (Polly, its front a radio station), a highlighted-text tower under a glass prism (Comprehend,
its front a reading room).
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, DARK_GLASS, GLASS_DK, GLASS_L, LIT, LIT_COOL, RED, STEEL,  # noqa: F401
                          STEEL_D, STEEL_M, STONE, Kit, A, beacon, bands, combine, dish, drum, drum_shadow, ellipse, face, glass,
                          ground_shadow, hv, lattice, leds, louvres, masonry, plant, podium, prism, punched, rib_shader,
                          ribbon_shader, ribs, slab_rot, solid, tip, top_band)
from services.compute import CU, CV, H, canvas  # noqa: F401

TEAL = (1, 168, 141)
TEAL_D = (0, 116, 100)
GLOW = (120, 255, 220)
GOLD = (250, 206, 60)
BRICK = (176, 98, 74)
CREAM = (234, 226, 204)
PAPER = (246, 240, 222)
PAPER_D = (226, 218, 196)
INK = (60, 58, 76)
ROCKS = [(162, 128, 100), (128, 116, 106), (180, 150, 112), (112, 102, 112)]
TEAL_GLASS = {"L": ((62, 132, 132), (92, 172, 166), (150, 216, 206)), "R": ((40, 92, 98), (58, 122, 124), (90, 160, 160))}
Q_GLYPH = [".XXXX.", "XX..XX", "XX..XX", "XX..XX", "XX.XXX", "XX..X.", ".XXX.X"]


# ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────

def glyph(c, x, y, rows, col, lit=None):
    """A pixel glyph in screen space, its top-left at (x, y); `lit` also paints it on the night layer."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "X":
                c.put(x + i, y + j, col, lit)


def strata(key, glow_seam=True):
    """Layered rock: fine sub-bands every 3 px, a few sparse pits, a lit top edge and a glowing teal seam under it."""
    def g(i, n, z, h, base, side):
        if glow_seam and z == h - 2:
            return shade(TEAL, 1.15 if side == "L" else 0.9), GLOW
        if z == h - 1:
            return shade(base, 1.12), None
        t = 0.94 if (z // 3) % 2 else 1.0
        if hv(key, side, i // 3, z // 2) < 0.06:
            t = 0.8
        return shade(base, t), None
    return g


def quoins(col=STONE, step=4):
    """Stone quoins on a brick corner: alternating long and short blocks up both edges."""
    def g(i, n, z, h, base, side):
        w = 3 if (z // step) % 2 else 2
        if i < w or i >= n - w:
            return shade(col, (0.98 if side == "L" else 0.78) * (0.88 if z % step == step - 1 else 1.0)), None
        return None
    return g


def textlines(key, line=3, p=0.3, lo=2, hi=None, margin=2):
    """Lines of text on a page: rows of short words with gaps, some rows lit (a lit window line at night)."""
    def g(i, n, z, h, base, side):
        top = h - 2 if hi is None else hi
        if z < lo or z >= top or i < margin or i >= n - margin:
            return None
        if (z - lo) % line != 1:
            return None
        row = (z - lo) // line
        end = n - margin - int(hv(key, side, row, "e") * n * 0.4)
        if i >= end or hv(key, side, row, i // 4) < 0.18:
            return None
        on = hv(key, side, row) < p
        return (shade(INK, 1.0 if side == "L" else 0.85), (LIT if on else None))
    return g


def tree(c, u, v, z=0, s=1.0):
    drum(c, u, v, z, z + round(6 * s), 0.05, WOOD_D, ao=z <= 1, cap=False)
    x, y = c.P(u, v, z + round(6 * s))
    r = round(6 * s)
    c.d.ellipse((x - r, y - 2 * r + 2, x + r, y + 2), fill=A((52, 128, 66)))
    c.d.ellipse((x - r + 1, y - 2 * r + 2, x + r - 3, y - 1), fill=A((86, 172, 80)))
    c.d.point([(x - 2, y - 2 * r + 5)], fill=A((140, 214, 110)))


def lamp(c, u, v, h=14):
    x, y = c.P(u, v, 0)
    c.d.line([(x, y), (x, y - h)], fill=A(NAVY))
    c.d.rectangle((x - 1, y - h - 3, x + 1, y - h), fill=A(LIT))
    c.ld.ellipse((x - 4, y - h - 5, x + 4, y - h + 2), fill=A(LIT, 150))
    c.ld.rectangle((x - 1, y - h - 3, x + 1, y - h), fill=A(LIT))


def bubble(c, x, y, w, h, col=WHITE, tail=-1):
    """A speech bubble in screen space: (x, y) its bottom centre, a rounded body with a shadowed lower-right edge and
    a tail toward the bottom left (tail -1) or right."""
    x0, y0, x1, y1 = x - w // 2, y - h, x + w // 2, y
    tx = x + tail * (w // 4)
    c.d.polygon([(tx - 3, y1 - 2), (tx + 3, y1 - 2), (tx + tail * 5, y1 + 5)], fill=A(shade(col, 0.82)))
    c.d.rounded_rectangle((x0 + 1, y0 + 1, x1 + 1, y1), radius=5, fill=A(shade(col, 0.78)))
    c.d.rounded_rectangle((x0, y0, x1, y1 - 1), radius=5, fill=A(col))
    c.d.arc((x0, y0, x0 + 10, y0 + 10), 180, 270, fill=A(shade(col, 1.15)))


def aperture(c, x, y, r, lit=True):
    """A camera lens seen face on: a steel barrel ring, a dark ring, six iris blades and a glowing teal pupil."""
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(STEEL_D))
    c.d.ellipse((x - r + 1, y - r + 1, x + r - 1, y + r - 1), fill=A(STEEL_M))
    c.d.ellipse((x - r + 2, y - r + 2, x + r - 2, y + r - 2), fill=A(CHAR))
    ri = r - 3
    for k in range(6):
        a0 = k * math.pi / 3 + 0.3
        a1 = a0 + math.pi / 3
        pts = [(x, y), (x + math.cos(a0) * ri, y + math.sin(a0) * ri), (x + math.cos(a1) * ri, y + math.sin(a1) * ri)]
        c.d.polygon([(round(px), round(py)) for px, py in pts], fill=A((52, 60, 76) if k % 2 else (70, 80, 98)))
    rp = max(1, r // 3)
    c.d.ellipse((x - rp, y - rp, x + rp, y + rp), fill=A(TEAL))
    c.d.point([(x - rp // 2, y - rp // 2)], fill=A(WHITE))
    if lit:
        c.ld.ellipse((x - rp - 1, y - rp - 1, x + rp + 1, y + rp + 1), fill=A(GLOW, 200))


def plaque_head(c, x, y, s=1):
    """A little robot face plaque (the AgentCore crest): a teal head, lit eyes, a mouth and an antenna."""
    c.d.rectangle((x - 5 * s, y - 4 * s, x + 5 * s, y + 4 * s), fill=A(TEAL_D))
    c.d.rectangle((x - 4 * s, y - 3 * s, x + 4 * s, y + 3 * s), fill=A(TEAL))
    for ex in (x - 3 * s, x + 1 * s):
        c.d.rectangle((ex, y - 1 * s, ex + s, y), fill=A(WHITE))
        c.ld.rectangle((ex, y - 1 * s, ex + s, y), fill=A(GLOW))
    c.d.line([(x - 2 * s, y + 2 * s), (x + 2 * s, y + 2 * s)], fill=A(NAVY_D))
    c.d.line([(x, y - 4 * s), (x, y - 7 * s)], fill=A(STEEL_D))
    c.d.point([(x, y - 8 * s)], fill=A(RED))
    c.light(x, y - 8 * s, RED)


def door(c, v1, m, h, w=0.14, col=NAVY_D, lit=True):
    face(c, "L", v1, m - w, m + w, 0, h, col, lambda i, n, z, hh, b, s: ((LIT, LIT) if lit and 0 < i < n - 1 and z < hh - 1 else (shade(col, 1.3), None)), ao=False)


# ── Bedrock ───────────────────────────────────────────────────────────────────────────────────────────────────────

def mesa(c, u0, v0, u1, v1, layers, lh, ins, key, z=0):
    """Terraces of rock strata, each with a glowing teal seam under its lip. Returns the top terrace."""
    for i in range(layers):
        if i == 0:
            ground_shadow(c, u0, v0, u1, v1)
        col = ROCKS[i % len(ROCKS)]
        prism(c, u0, v0, u1, v1, z, z + lh, col, L=strata(key + str(i)), R=strata(key + "r" + str(i)), roofcol=shade(col, 0.95), rim=0.04, ao=z <= 1)
        z += lh
        if i < layers - 1:
            u0, v0, u1, v1 = u0 + ins, v0 + ins, u1 - ins, v1 - ins
    return u0, v0, u1, v1, z


def crystal(c, x, y, h, lit=True):
    """A teal crystal shard in screen space, (x, y) its foot: a lit left facet and a darker right one."""
    c.d.polygon([(x - 2, y), (x, y - h), (x, y)], fill=A(GLOW))
    c.d.polygon([(x, y), (x, y - h), (x + 2, y - 1)], fill=A(TEAL))
    if lit:
        c.ld.polygon([(x - 2, y), (x, y - h), (x + 2, y - 1)], fill=A(GLOW, 200))


def lm_bedrock(fw, fh, tier, col, key):
    """Bedrock Mesa: a mesa of rock strata with glowing teal seams (a terrace more each tier), steps cut up its
    face, a lantern shrine with a glowing orb on the top; crystals break out of the rock from tier 3, more at 4."""
    c = Kit(fw, fh, 90)
    layers = 1 + tier
    lh, ins = 6, 0.14
    u0, v0, u1, v1, z = mesa(c, 1.15, 1.7, 2.9, 2.9, layers, lh, ins, key)
    # steps up the street face, one flight per terrace
    for k in range(layers - 1, -1, -1):
        vs = 2.9 - ins * k
        for s in range(3):
            prism(c, 1.6, vs - 0.14 + s * 0.045, 1.88, vs - 0.095 + s * 0.045, k * lh, k * lh + lh - 2 * s, CON_L, rim=0, ao=False)
    # the shrine on the top terrace
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    s = 0.32
    prism(c, cu - s - 0.06, cv - s - 0.06, cu + s + 0.06, cv + s + 0.06, z, z + 2, STONE, rim=0, ao=False)
    for du, dv in ((-s, -s), (s - 0.08, -s), (-s, s - 0.08)):
        prism(c, cu + du, cv + dv, cu + du + 0.08, cv + dv + 0.08, z + 2, z + 15, WHITE, rim=0, ao=False)
    ox, oy = c.P(cu, cv, z + 9)
    c.d.ellipse((ox - 4, oy - 4, ox + 4, oy + 4), fill=A(GLOW))
    c.d.ellipse((ox - 1, oy - 3, ox + 1, oy - 1), fill=A(WHITE))
    c.d.arc((ox - 4, oy - 4, ox + 4, oy + 4), 0, 120, fill=A(TEAL))
    c.ld.ellipse((ox - 7, oy - 7, ox + 7, oy + 7), fill=A(GLOW, 150))
    c.ld.ellipse((ox - 4, oy - 4, ox + 4, oy + 4), fill=A(GLOW))
    prism(c, cu + s - 0.08, cv + s - 0.08, cu + s, cv + s, z + 2, z + 15, WHITE, rim=0, ao=False)
    prism(c, cu - s - 0.08, cv - s - 0.08, cu + s + 0.08, cv + s + 0.08, z + 15, z + 18, col, ao=False, rim=0)
    c.pyramid(cu - s - 0.08, cv - s - 0.08, cu + s + 0.08, cv + s + 0.08, z + 18, 7, shade(col, 0.85))
    if tier >= 3:  # crystals breaking out of the rock
        for k in range(2 + (tier >= 4) * 2):
            v = 1.85 + hv(key, "c", k) * 0.9
            x, y = c.P(2.9, v, 2 + int(hv(key, "z", k) * 4))
            crystal(c, x + 1, y, 4 + k % 2 * 3)
    if tier >= 4:  # a crystal cluster on the ground by the steps
        x, y = c.P(1.2, 2.95, 0)
        for dx, hh in ((-3, 6), (0, 10), (3, 7)):
            crystal(c, x + dx, y, hh)
    return c


def tw_bedrock(tier, k):
    """Rock strata rising into glass: a stepped plinth of rock terraces with glowing seams, a teal-glass shaft that
    sets back twice, and a glass crystal on the crown."""
    if tier < 2:
        return None
    top_z = H[tier] + 10
    c = canvas(tier, extra=54)
    nl = tier + 3
    u0, v0, u1, v1, z = mesa(c, 0.08, 0.08, 1.62, 1.62, nl, 8, 0.055, k)
    # rock veins running up into the glass at the foot of the shaft
    shaft = [(0.42, 1.28), (0.5, 1.2), (0.6, 1.1)]
    cuts = [z, z + round((top_z - z) * 0.55), z + round((top_z - z) * 0.85), top_z]
    for s, (a, b) in enumerate(shaft):
        zb, zt = cuts[s], cuts[s + 1]
        gl = combine(top_band(2, TEAL), glass(k + str(s), bay=5, floor=6, p=0.42, frame=(200, 222, 222) if s % 2 == 0 else STEEL,
                                                spandrel=TEAL_D, palette=TEAL_GLASS, lo=0))
        rock = lambda i, n, zz, hh, bb, sd, s=s: ((shade(ROCKS[(i // 5) % 4], 0.95 if sd == "L" else 0.75), None) if s == 0 and zz < 6 - (i % 5 > 2) * 3 else None)
        prism(c, a, a, b, b, zb, zt, (190, 210, 210), L=combine(rock, gl), R=combine(rock, gl), ao=False, zref=zb, href=zt - zb)
    z = top_z
    # the crystal crown
    a, b = 0.64, 1.06
    c.poly([(a, b, z), (b, b, z), (CU, CV, z + 18)], (150, 236, 214))
    c.poly([(b, b, z), (b, a, z), (CU, CV, z + 18)], TEAL)
    x0, y0 = c.P(a, b, z)
    xa, ya = c.P(CU, CV, z + 18)
    c.d.line([(x0, y0), (xa, ya)], fill=A(WHITE))
    c.ld.polygon([c.P(a, b, z), c.P(b, b, z), c.P(b, a, z), (xa, ya)], fill=A(GLOW, 120 if tier < 4 else 170))
    tip(c, CU, CV, z + 17, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── AgentCore ─────────────────────────────────────────────────────────────────────────────────────────────────────

def brick_wall(key, col, p=0.55, wh=5, floor=8, lo=3):
    return combine(top_band(2, col), quoins(), punched(key, bay=6, floor=floor, ww=3, wh=wh, p=p, lo=lo, glass_col=(150, 196, 226)), masonry(3, 6, 0.9))


def lm_agentcore(fw, fh, tier, col, key):
    """AgentCore Academy: a brick school under a navy gable roof, a robot-face crest over its teal porch; a bell
    cupola from tier 2, a classroom wing from 3, a courtyard tree and lamps at 4."""
    c = Kit(fw, fh, 76)
    h = 15 + 3 * tier
    if tier >= 3:  # classroom wing on the right
        wu0, wv0, wu1, wv1 = 2.15, 0.85, 2.8, 1.8
        ground_shadow(c, wu0, wv0, wu1, wv1)
        prism(c, wu0, wv0, wu1, wv1, 0, h - 4, BRICK, L=brick_wall(key + "w", TEAL), R=brick_wall(key + "wr", TEAL), roof=False)
        c.gable(wu0 - 0.04, wv0 - 0.04, wu1 + 0.04, wv1 + 0.04, h - 4, 7, NAVY)
    u0, v0, u1, v1 = 0.7, 1.8, 2.75, 2.65
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, h, BRICK, L=brick_wall(key, TEAL), R=brick_wall(key + "r", TEAL), roof=False)
    c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, h, 11, NAVY)
    # roof tiles: a few lighter courses on the street slope
    for kk in range(1, 4):
        f = kk / 4
        vm = (v0 + v1) / 2
        c.line((u0, v1 + 0.05 - f * (v1 + 0.05 - vm), h + 11 * f), (u1 + 0.05, v1 + 0.05 - f * (v1 + 0.05 - vm), h + 11 * f), shade(NAVY, 1.35))
    # the porch: a teal canopy on posts over the doors, the robot crest above
    m = (u0 + u1) / 2
    door(c, v1, m, 10, 0.18)
    prism(c, m - 0.3, v1, m + 0.3, v1 + 0.22, 10, 12, col, ao=False, rim=0)
    for pu in (m - 0.28, m + 0.24):
        prism(c, pu, v1 + 0.17, pu + 0.04, v1 + 0.21, 0, 10, WHITE, rim=0, ao=False)
    prism(c, m - 0.25, v1, m + 0.25, v1 + 0.14, 0, 1, STONE, ao=False, rim=0)
    x, y = c.P(m, v1, h + 4)
    plaque_head(c, x, y)
    if tier >= 2:  # bell cupola on the ridge
        cu, cv = u0 + 0.45, (v0 + v1) / 2
        prism(c, cu - 0.16, cv - 0.16, cu + 0.16, cv + 0.16, h + 8, h + 18, WHITE, L=lambda i, n, z, hh, b, s: ((NAVY_D, None) if 1 < i < n - 2 and 2 <= z < hh - 2 else None), ao=False, rim=0)
        bx, by = c.P(cu, cv + 0.16, h + 13)
        c.d.ellipse((bx - 2, by - 2, bx + 1, by + 2), fill=A(GOLD))
        c.pyramid(cu - 0.21, cv - 0.21, cu + 0.21, cv + 0.21, h + 18, 8, col)
    if tier >= 4:  # courtyard
        tree(c, 0.4, 2.45, s=1.2)
        lamp(c, 2.92, 2.85)
        lamp(c, 0.45, 2.92, 12)
    return c


def tw_agentcore(tier, k):
    """A school tower crowned by a robot head: a brick shaft with stone quoins and a teal cornice every few floors,
    an open belfry from tier 3, and the head (a steel box with a lit screen face, eyes and ears) under its antenna."""
    if tier < 2:
        return None
    top_z = H[tier] - 20
    c = canvas(tier, extra=60)
    podium(c, 0.25, 0.25, 1.45, 1.45, 12, STONE, k, accent=TEAL)
    u0, v0, u1, v1 = 0.38, 0.38, 1.32, 1.32
    corn = lambda i, n, z, hh, b, s: ((shade(TEAL, 1.0 if s == "L" else 0.75), None) if z % 30 in (27, 28) else None)
    prism(c, u0, v0, u1, v1, 12, top_z, BRICK, L=combine(corn, brick_wall(k, TEAL, p=0.5, floor=10, wh=6)),
          R=combine(corn, brick_wall(k + "r", TEAL, p=0.5, floor=10, wh=6)), ao=False, zref=12, href=top_z - 12)
    z = top_z
    if tier >= 3:  # an open belfry: arches on posts, a gold bell
        prism(c, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, z, z + 2, STONE, ao=False, rim=0)
        arch = lambda i, n, zz, hh, b, s: ((NAVY_D, None) if 2 < i < n - 3 and (i * 3 // n) != 1 and 1 <= zz < hh - 2 else None)
        prism(c, u0, v0, u1, v1, z + 2, z + 14, WHITE, L=combine(arch, solid()), R=combine(arch, solid()), ao=False)
        x, y = c.P(u0 + 0.2, v1, z + 9)
        c.d.ellipse((x - 2, y - 2, x + 2, y + 3), fill=A(GOLD))
        z += 14
    # the robot head
    hu0, hv0, hu1, hv1 = 0.24, 0.32, 1.46, 1.38
    hh = 20 + 2 * (tier - 2)
    prism(c, hu0 + 0.12, hv0 + 0.12, hu1 - 0.12, hv1 - 0.12, z, z + 3, STEEL_D, ao=False, rim=0)  # the neck
    z += 3
    shell = (196, 206, 218)
    prism(c, hu0, hv0, hu1, hv1, z, z + hh, shell, L=combine(top_band(3, TEAL), bands([(0, 2, STEEL_M)])), R=combine(top_band(3, TEAL), bands([(0, 2, STEEL_M)]), ribs(4, 1.06, 0.9)), ao=False)
    # the face screen and its eyes and mouth
    face(c, "L", hv1, hu0 + 0.14, hu1 - 0.14, z + 3, z + hh - 5, NAVY_D, lambda i, n, zz, h_, b, s: (shade(NAVY, 1.25), None) if i in (0, n - 1) or zz in (0, h_ - 1) else (NAVY_D, None), ao=False, edge=False)
    for a in (hu0 + 0.32, hu1 - 0.52):
        face(c, "L", hv1, a, a + 0.2, z + hh - 12, z + hh - 8, GLOW, lambda *a_: (GLOW, GLOW), ao=False, edge=False)
    face(c, "L", hv1, hu0 + 0.4, hu1 - 0.4, z + 6, z + 7, TEAL, lambda *a_: (GLOW, GLOW), ao=False, edge=False)
    # an ear on the right side
    prism(c, hu1, (hv0 + hv1) / 2 - 0.2, hu1 + 0.1, (hv0 + hv1) / 2 + 0.2, z + 6, z + hh - 6, TEAL, ao=False, rim=0)
    z += hh
    prism(c, CU - 0.12, CV - 0.12, CU + 0.12, CV + 0.12, z, z + 3, STEEL_M, ao=False, rim=0)
    tip(c, CU, CV, z + 3, h=10 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    x, y = c.P(CU, CV, z + 3 + 10 + 2 * (tier - 2))
    if tier < 4:  # the antenna's ball
        c.d.point([(x, y + 1)], fill=A(GLOW))
        c.light(x, y + 1, GLOW)
    return c


# ── SageMaker ─────────────────────────────────────────────────────────────────────────────────────────────────────

def vault(c, u0, v0, u1, v1, z, rise, col, skylight=True, ribs_every=0.32):
    """A barrel-vault roof (ridge along u): facets from the back eave over the crown to the front eave, a glazed
    strip along the crown, ribs across it; the gable end (+u) filled with wall."""
    n = 8
    vm, r = (v0 + v1) / 2, (v1 - v0) / 2
    pts = [(vm - r * math.cos(math.pi * k / n), z + rise * math.sin(math.pi * k / n)) for k in range(n + 1)]
    end = [(u1, v, zz) for v, zz in pts]
    for k in range(n):
        (va, za), (vb, zb) = pts[k], pts[k + 1]
        slope = (zb - za) / max(0.01, (vb - va) * 16)
        f = 1.04 - 0.22 * max(-1.0, min(1.0, slope)) * (1 if k >= n // 2 else 0.6)
        fc = GLASS_L if skylight and k in (n // 2 - 1, n // 2) else col
        c.poly([(u0, va, za), (u1, va, za), (u1, vb, zb), (u0, vb, zb)], shade(fc, f))
        if fc is GLASS_L:
            c.poly([(u0, va, za), (u1, va, za), (u1, vb, zb), (u0, vb, zb)], LIT, c.ld)
    c.poly(end + [(u1, v0, z)], shade(col, 0.7))
    u = u0 + ribs_every
    while u < u1 - 0.05:
        for kk in range(n):
            (va, za), (vb, zb) = pts[kk], pts[kk + 1]
            c.line((u, va, za), (u, vb, zb), shade(col, 0.78))
        u += ribs_every


def dial(c, x, y, r, frac, lit=True):
    """A round training gauge in screen space: a navy bezel, a white face with ticks, a teal progress arc to `frac`
    and a red needle there."""
    c.d.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(NAVY_D))
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(WHITE))
    a0 = 150
    a1 = a0 + 240 * frac
    c.d.arc((x - r + 1, y - r + 1, x + r - 1, y + r - 1), a0, a1, fill=A(TEAL), width=2)
    if lit:
        c.ld.arc((x - r + 1, y - r + 1, x + r - 1, y + r - 1), a0, a1, fill=A(GLOW), width=2)
    for kk in range(7):
        a = math.radians(a0 + kk * 40)
        c.d.point([(x + round(math.cos(a) * (r - 3)), y + round(math.sin(a) * (r - 3)))], fill=A(NAVY))
    a = math.radians(a1)
    c.d.line([(x, y), (x + round(math.cos(a) * (r - 2)), y + round(math.sin(a) * (r - 2)))], fill=A(RED))
    c.d.point([(x, y)], fill=A(NAVY_D))


def gear(c, x, y, r, col=ORANGE):
    for kk in range(8):
        a = kk * math.pi / 4
        gx, gy = x + round(math.cos(a) * r), y + round(math.sin(a) * r)
        c.d.rectangle((gx - 1, gy - 1, gx + 1, gy + 1), fill=A(col))
    c.d.ellipse((x - r + 1, y - r + 1, x + r - 1, y + r - 1), fill=A(col))
    c.d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=A(NAVY))


def lm_sagemaker(fw, fh, tier, col, key):
    """SageMaker Workshop: a panelled workshop under a ribbed barrel vault with a glazed crown, its training dial on
    the street face (further round each tier); a gear on the gable from tier 2, a conveyor of trained models from 3,
    a robot arm loading them at 4."""
    c = Kit(fw, fh, 70)
    h = 14 + 2 * tier
    u0, v0, u1, v1 = 0.8, 1.7, 2.8, 2.6
    ground_shadow(c, u0, v0, u1, v1)
    wall = (214, 208, 196)
    win = punched(key, bay=7, floor=h - 2, ww=4, wh=h - 9, p=0.6, lo=2)
    prism(c, u0, v0, u1, v1, 0, h, wall, L=combine(top_band(2, col), win, ribs(7, 1.06, 0.9)), R=combine(top_band(2, col), punched(key + "r", bay=7, floor=h - 2, ww=4, wh=h - 9, p=0.6, lo=2)), roof=False)
    vault(c, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, h, 10 + tier, (176, 186, 198))
    # big doors and the dial over them
    door(c, v1, u0 + 0.45, 11, 0.2, col=(70, 80, 98), lit=False)
    face(c, "L", v1, u0 + 0.27, u0 + 0.63, 1, 10, (70, 80, 98), louvres(2, 0.75), ao=False, edge=False)
    x, y = c.P(u0 + 1.3, v1, h - 7)
    dial(c, x, y, 7, [0.25, 0.5, 0.75, 1.0][tier - 1])
    if tier >= 2:  # a gear on the gable end
        x, y = c.P(u1 + 0.04, (v0 + v1) / 2, h + 4)
        gear(c, x, y, 4 + (tier >= 4))
    if tier >= 3:  # a conveyor carrying trained model boxes
        prism(c, 0.4, 2.72, 2.85, 2.94, 0, 3, CON_D, L=bands([(2, 3, ORANGE)]), rim=0)
        for i in range(3 if tier < 4 else 4):
            u = 0.6 + i * 0.55
            prism(c, u, 2.75, u + 0.28, 2.92, 3, 8, [col, ORANGE, (120, 150, 240), GOLD][i], rim=0.02, ao=False)
    if tier >= 4:  # a robot arm at the end of the line
        bx, by = c.P(0.3, 2.85, 0)
        prism(c, 0.2, 2.75, 0.4, 2.95, 0, 4, NAVY, rim=0)
        c.d.line([(bx, by - 4), (bx - 3, by - 16)], fill=A(ORANGE), width=3)
        c.d.line([(bx - 3, by - 16), (bx + 7, by - 20)], fill=A(ORANGE), width=2)
        c.d.ellipse((bx - 5, by - 18, bx - 1, by - 14), fill=A(NAVY))
        c.d.line([(bx + 7, by - 20), (bx + 9, by - 16)], fill=A(STEEL_D))
        c.d.line([(bx + 7, by - 20), (bx + 5, by - 16)], fill=A(STEEL_D))
    return c


def tw_sagemaker(tier, k):
    """A research lab: a broad white tower with ribbon windows and a teal band every few floors, the training dial
    near the top of its street face (further round each tier), and a roof of instruments: an antenna array of
    lattice masts and dishes round the tall centre mast."""
    if tier < 2:
        return None
    top_z = H[tier] - 16
    c = canvas(tier, extra=76)
    u0, v0, u1, v1 = 0.12, 0.3, 1.58, 1.4
    podium(c, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, 12, (190, 196, 206), k, accent=TEAL)
    band = lambda i, n, z, hh, b, s: ((shade(TEAL, 1.0 if s == "L" else 0.74), LIT_COOL if z % 24 == 21 and i % 3 == 0 else None) if z % 24 in (20, 21, 22) else None)
    rib = glass(k, bay=6, floor=6, p=0.45, spandrel=(226, 230, 236), frame=(226, 230, 236), lo=0)
    prism(c, u0, v0, u1, v1, 12, top_z, (226, 230, 236), L=combine(top_band(3, TEAL), band, rib), R=combine(top_band(3, TEAL), band, louvres(2, 0.86), solid()), ao=False, zref=12, href=top_z - 12)
    x, y = c.P((u0 + u1) / 2, v1, top_z - 16)
    dial(c, x, y, 10, [0, 0.4, 0.7, 1.0][tier - 1])
    z = top_z
    # the instrument deck
    prism(c, u0 + 0.1, v0 + 0.1, u1 - 0.1, v1 - 0.1, z, z + 5, (176, 186, 198), L=louvres(2), R=louvres(2), ao=False)
    z += 5
    dish(c, 1.38, 0.5, z, r=7, facing=1)
    side = 20 + 5 * (tier - 2)
    masts = [(0.42, 1.28)] + ([(1.28, 0.42)] if tier >= 4 else [])
    if tier >= 3:
        for mu, mv in masts:
            lattice(c, mu, mv, z, z + side, 2, 1, STEEL_M, step=5)
            x, y = c.P(mu, mv, z + side)
            c.d.point([(x, y - 1)], fill=A(RED))
            c.light(x, y - 1, RED)
    if tier >= 4:  # the array's crossbar and a second dish
        xa, ya = c.P(0.42, 1.28, z + side - 4)
        xb, yb = c.P(1.28, 0.42, z + side - 4)
        c.d.line([(xa, ya), (xb, yb)], fill=A(STEEL_M))
        for xx in range(xa + 4, xb - 2, 6):
            c.d.line([(xx, ya), (xx, ya + 3)], fill=A(STEEL_D))
        dish(c, 0.3, 0.95, z, r=6, facing=-1)
    mast = 24 + 6 * (tier - 2)
    lattice(c, CU, CV, z, z + mast, 3, 1, STEEL_M, step=6)
    tip(c, CU, CV, z + mast, h=8 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Q ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

def q_bubble(c, x, y, s=1, lit=True, w=None, h=None):
    """A speech bubble with a lit Q in it; (x, y) its bottom centre."""
    w = w or 16 * s
    h = h or 13 * s
    bubble(c, x, y, w, h)
    gx, gy = x - 3, y - h // 2 - 4
    glyph(c, gx, gy, Q_GLYPH, TEAL_D, GLOW if lit else None)


def lm_q(fw, fh, tier, col, key):
    """Q Help Desk: a round help kiosk under a striped cone canopy, a glass counter all round, its speech-bubble Q
    sign on a post; benches from tier 2, a second desk with a screen from 3, lamps and a queue line at 4."""
    c = Kit(fw, fh, 80)
    if tier >= 3:  # a second desk with a screen at the left
        a0, b0, a1, b1 = 0.4, 2.15, 1.05, 2.55
        ground_shadow(c, a0, b0, a1, b1)
        prism(c, a0, b0, a1, b1, 0, 7, CREAM, L=bands([(5, 7, col)]), R=bands([(5, 7, col)]))
        prism(c, a0 + 0.2, b0 + 0.1, a0 + 0.45, b0 + 0.18, 7, 14, NAVY_D, L=lambda i, n, z, hh, b, s: ((GLOW, GLOW) if 0 < i < n - 1 and 1 <= z < hh - 1 else None), rim=0, ao=False)
    cu, cv, r = 1.95, 1.95, 0.5
    drum_shadow(c, cu, cv, r + 0.1)
    drum(c, cu, cv, 0, 2, r + 0.1, STONE)
    counter = ribbon_shader(key, floor=12, win=6, p=0.85, glass_col=GLASS_L)
    drum(c, cu, cv, 2, 9, r, CREAM, shader=lambda th, z, h, b: (shade(col, 0.95), None) if z >= h - 2 else None, ao=False)
    drum(c, cu, cv, 9, 16, r - 0.04, GLASS_L, shader=lambda th, z, h, b: (counter(th, z + 1, 12, b) or (b, None)), ao=False, cap=False)
    # the cone canopy, striped
    stripes = lambda th, z, h, b: ((shade(WHITE, 0.92 if th > 0 else 1.0), None) if int((th + math.pi / 2) / (math.pi / 6)) % 2 else None)
    drum(c, cu, cv, 16, 26, 0.7, col, profile=lambda t: 0.72 * (1 - t) + 0.04, shader=stripes, ao=False, cap=False)
    x, y = c.P(cu, cv, 26)
    c.d.rectangle((x - 1, y - 4, x, y), fill=A(STEEL_D))
    c.d.point([(x, y - 5)], fill=A(col))
    # the bubble sign on its post
    pu, pv = 2.7, 1.2
    ph = 26 + 3 * tier
    x, y = c.P(pu, pv, 0)
    c.d.line([(x, y), (x, y - ph)], fill=A(NAVY))
    c.d.line([(x + 1, y), (x + 1, y - ph)], fill=A(NAVY_D))
    q_bubble(c, x, y - ph, lit=tier >= 2)
    if tier >= 2:  # benches out front
        for u in (1.15, 2.15):
            prism(c, u, 2.72, u + 0.5, 2.86, 0, 4, WOOD, rim=0)
            prism(c, u, 2.84, u + 0.5, 2.88, 4, 8, WOOD_D, rim=0, ao=False)
    if tier >= 4:  # lamps and a queue line
        lamp(c, 0.3, 1.5)
        lamp(c, 2.9, 2.9)
        for u in (1.0, 1.3, 1.6):
            x, y = c.P(u, 2.55, 0)
            c.d.line([(x, y), (x, y - 6)], fill=A(STEEL_D))
            c.d.point([(x, y - 7)], fill=A(GOLD))
        x0, y0 = c.P(1.0, 2.55, 5)
        x1, y1 = c.P(1.6, 2.55, 5)
        c.d.line([(x0, y0), (x1, y1)], fill=A((200, 50, 60)))
    return c


def tw_q(tier, k):
    """A slim drum tower with teal ribbon windows and a balcony ring, crowned by a big speech bubble with a lit Q in
    it (the help that answers) and the mast on top of the bubble."""
    if tier < 2:
        return None
    top_z = H[tier] - 4
    c = canvas(tier, extra=72)
    drum_shadow(c, CU, CV, 0.58)
    drum(c, CU, CV, 0, 10, 0.58, CREAM, shader=rib_shader(14, hoops=(8,)))
    drum(c, CU, CV, 10, top_z, 0.4, (232, 236, 240), shader=ribbon_shader(k, floor=6, win=3, p=0.5, glass_col=(150, 222, 210), spandrel=(214, 222, 226)), ao=False)
    drum(c, CU, CV, top_z, top_z + 3, 0.5, TEAL, ao=False)
    z = top_z + 3
    drum(c, CU, CV, z, z + 6, 0.16, STEEL_M, ao=False)  # the neck
    z += 6
    w, h = 26 + 4 * (tier - 2), 20 + 2 * (tier - 2)
    x, y = c.P(CU, CV, z)
    q_bubble(c, x, y, w=w, h=h, lit=True)
    # a larger Q (2 px pixels) for the bigger bubbles
    if tier >= 3:
        c.d.rounded_rectangle((x - w // 2 + 3, y - h + 3, x + w // 2 - 3, y - 4), radius=3, fill=A(WHITE))
        for j, row in enumerate(Q_GLYPH):
            for i, ch in enumerate(row):
                if ch == "X":
                    c.d.rectangle((x - 6 + i * 2, y - h + 3 + j * 2, x - 5 + i * 2, y - h + 4 + j * 2), fill=A(TEAL_D))
                    c.ld.rectangle((x - 6 + i * 2, y - h + 3 + j * 2, x - 5 + i * 2, y - h + 4 + j * 2), fill=A(GLOW))
    z += h
    tip(c, CU, CV, z, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Rekognition ───────────────────────────────────────────────────────────────────────────────────────────────────

def frame_easel(c, u, v, col, key, z=0):
    """A photo on an easel with a teal face-detection box in its corner marks."""
    x, y = c.P(u, v, z)
    c.d.line([(x - 3, y), (x - 1, y - 12)], fill=A(WOOD_D))
    c.d.line([(x + 3, y), (x + 1, y - 12)], fill=A(WOOD_D))
    c.d.rectangle((x - 5, y - 17, x + 5, y - 8), fill=A(WOOD_D))
    c.d.rectangle((x - 4, y - 16, x + 4, y - 9), fill=A(col))
    c.d.ellipse((x - 2, y - 15, x + 1, y - 12), fill=A((240, 200, 160)))
    c.d.rectangle((x - 2, y - 11, x + 1, y - 9), fill=A(shade(col, 0.6)))
    for dx, dy in ((-3, -16), (2, -16), (-3, -10), (2, -10)):
        c.put(x + dx, y + dy, GLOW, GLOW)


def lm_rekognition(fw, fh, tier, col, key):
    """Rekognition Gallery: a white gallery box on a plinth with a big camera-aperture window on its street face and
    a long gallery slot on its side; photos on easels with face boxes out front (one more each tier), a dark upper
    gallery cantilevered over the entrance from tier 3, a roof spotlight at 4."""
    c = Kit(fw, fh, 76)
    h = 16 + 3 * tier
    u0, v0, u1, v1 = 0.95, 1.6, 2.8, 2.55
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, 0, 2, CON_L, rim=0)
    slot = lambda i, n, z, hh, b, s: ((GLASS_DK, LIT if (i // 4) % 3 else None) if n * 0.15 < i < n * 0.85 and 7 <= z < 11 else None)
    prism(c, u0, v0, u1, v1, 2, h, WHITE, L=combine(top_band(2, col), solid()), R=combine(top_band(2, col), slot, solid()), ao=False)
    # the entrance (a glass door at the left of the street face)
    door(c, v1, u0 + 0.35, 10, 0.16)
    # the aperture window
    x, y = c.P(u0 + 1.15, v1, h // 2 + 2)
    aperture(c, x, y, 7 + (tier >= 3))
    if tier >= 3:  # a dark upper gallery, cantilevered toward the street
        a0, b0, a1, b1 = u0 + 0.2, v0 + 0.15, u1 - 0.55, v1 + 0.2
        uh = 9
        prism(c, a0, b0, a1, b1, h, h + uh, CHAR, L=combine(top_band(2, col), glass(key + "up", bay=4, floor=uh, p=0.6, palette=DARK_GLASS, lo=2, hi=uh - 2)),
              R=combine(top_band(2, col), solid()), ao=False)
    n = min(tier + 1, 4)
    for i in range(n):  # easels with photos (the faces it finds)
        frame_easel(c, 0.35 + i * 0.6 if i < 2 else 1.6 + (i - 2) * 0.6, 2.88 if i < 2 else 2.85, [(240, 170, 60), (100, 170, 240), (240, 100, 120), (120, 210, 140)][i], key)
    if tier >= 4:  # a spotlight on the roof
        x, y = c.P(u1 - 0.25, v0 + 0.25, h)
        c.d.line([(x, y), (x, y - 6)], fill=A(STEEL_D))
        c.d.rectangle((x - 2, y - 9, x + 2, y - 6), fill=A(CHAR))
        c.d.point([(x - 2, y - 8)], fill=A(WHITE))
        c.light(x - 2, y - 8, LIT)
    return c


def tw_rekognition(tier, k):
    """A dark glass tower with teal scan-line bands, crowned by a camera: a wide body cantilevered past the shaft, a
    big aperture lens on its street face, a viewfinder hump and a flash, the mast on the hump."""
    if tier < 2:
        return None
    top_z = H[tier] - 22
    c = canvas(tier, extra=60)
    podium(c, 0.3, 0.3, 1.4, 1.4, 10, (178, 184, 194), k, accent=TEAL)
    u0, v0, u1, v1 = 0.5, 0.5, 1.2, 1.2
    scan = lambda i, n, z, hh, b, s: ((shade(TEAL, 1.05 if s == "L" else 0.8), GLOW if s == "L" else None) if z % 32 == 30 else None)
    fins = lambda i, n, z, hh, b, s: ((shade((90, 100, 118), 1.0 if s == "L" else 0.8), None) if i % 6 == 0 and 0 < i < n - 1 else None)
    prism(c, u0, v0, u1, v1, 10, top_z, (64, 72, 88), L=combine(scan, fins, glass(k, bay=6, floor=5, p=0.32, frame=(70, 80, 98), palette=DARK_GLASS)),
          R=combine(scan, fins, glass(k + "r", bay=6, floor=5, p=0.25, frame=(60, 68, 84), palette=DARK_GLASS)), ao=False, zref=10, href=top_z - 10)
    z = top_z
    # the camera
    bu0, bv0, bu1, bv1 = 0.3, 0.45, 1.42, 1.32
    bh = 16 + 2 * (tier - 2)
    prism(c, bu0 + 0.2, bv0 + 0.1, bu1 - 0.2, bv1 - 0.1, z, z + 2, STEEL_D, ao=False, rim=0)
    z += 2
    body = (70, 76, 92)
    grip = lambda i, n, zz, hh, b, s: ((shade((44, 48, 60), 1.0 if s == "L" else 0.8), None) if i < n * 0.22 and 1 < zz < hh - 3 and zz % 2 else None)
    prism(c, bu0, bv0, bu1, bv1, z, z + bh, body, L=combine(top_band(2, STEEL_M), grip, solid()), R=combine(top_band(2, STEEL_M), ribs(3, 1.1, 0.9)), ao=False, roofcol=(84, 92, 110))
    x, y = c.P((bu0 + bu1) / 2 + 0.08, bv1, z + bh // 2)
    aperture(c, x, y + 1, 8 + (tier - 2))
    if tier >= 3:  # the recording light
        x, y = c.P(bu1 - 0.12, bv1, z + bh - 4)
        c.put(x, y, RED, RED)
        c.put(x + 1, y, RED, RED)
    # the flash on the right of the top
    prism(c, 1.1, 0.55, 1.36, 0.75, z + bh, z + bh + 4, STEEL, L=lambda i, n, zz, hh, b, s: ((WHITE, LIT_COOL) if 0 < i < n - 1 and 1 <= zz < hh - 1 else None), rim=0, ao=False)
    z += bh
    # the viewfinder hump
    prism(c, CU - 0.25, CV - 0.25, CU + 0.25, CV + 0.25, z, z + 6, body, L=top_band(1, STEEL_M), R=top_band(1, STEEL_M), ao=False, roofcol=(84, 92, 110))
    tip(c, CU, CV, z + 6, h=9 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Textract ──────────────────────────────────────────────────────────────────────────────────────────────────────

def open_book(c, u0, v0, u1, v1, z0, z, rise, key, cover=TEAL):
    """A roof shaped like an open book lying on the hall (spine along v, at the middle of u): two pages curving up
    from the spine to their edges with lines of text, the stacked page edges showing the V on the street face and
    the end, the cover's binding filling down to the roof at z0."""
    um, wd = (u0 + u1) / 2, (u1 - u0) / 2
    n = 4
    prof = [(um - wd * (1 - k / n), z + rise * (1 - k / n) ** 1.3) for k in range(n + 1)]
    prof += [(um + wd * (k / n), z + rise * (k / n) ** 1.3) for k in range(1, n + 1)]
    # the cover's edge under the pages on the street face, down to the roof
    for (ua, za), (ub, zb) in zip(prof, prof[1:]):
        c.poly([(ua, v1 + 0.04, z0), (ub, v1 + 0.04, z0), (ub, v1 + 0.04, zb - 3), (ua, v1 + 0.04, za - 3)], shade(cover, 0.9))
    c.poly([(u1 + 0.04, v0, z0), (u1 + 0.04, v1 + 0.04, z0), (u1 + 0.04, v1 + 0.04, z + rise - 3), (u1 + 0.04, v0, z + rise - 3)], shade(cover, 0.7))
    # the cover board showing round the pages
    for (ua, za), (ub, zb) in zip(prof, prof[1:]):
        ea = -0.08 if ua <= u0 else 0
        eb = 0.08 if ub >= u1 else 0
        c.poly([(ua + ea, v0 - 0.07, za - 3), (ub + eb, v0 - 0.07, zb - 3), (ub + eb, v1 + 0.08, zb - 3), (ua + ea, v1 + 0.08, za - 3)], shade(cover, 1.02))
    # the pages, left (far) to right (near)
    for k, ((ua, za), (ub, zb)) in enumerate(zip(prof, prof[1:])):
        f = 1.04 if k < n else 0.92 - 0.03 * (k - n)
        c.poly([(ua, v0, za), (ub, v0, zb), (ub, v1, zb), (ua, v1, za)], shade(PAPER, f))
        # text lines parallel to the spine (none in the gutter)
        um_ = (ua + ub) / 2
        zm = (za + zb) / 2
        for w in range(3):
            a = v0 + 0.12 + w * (v1 - v0 - 0.24) / 3
            bb = a + (v1 - v0 - 0.24) / 3 * (0.5 + 0.4 * hv(key, k, w))
            if k not in (n - 1, n):
                c.line((um_, a, zm), (um_, bb, zm), (172, 166, 158))
    # the stacked page edges: the V on the street face and a band on the end
    for (ua, za), (ub, zb) in zip(prof, prof[1:]):
        c.poly([(ua, v1, za), (ub, v1, zb), (ub, v1, zb - 3), (ua, v1, za - 3)], PAPER_D)
        c.line((ua, v1, za - 2), (ub, v1, zb - 2), shade(PAPER_D, 0.82))
    c.poly([(u1, v0, z + rise), (u1, v1, z + rise), (u1, v1, z + rise - 3), (u1, v0, z + rise - 3)], shade(PAPER_D, 0.84))
    c.line((u1, v0, z + rise - 2), (u1, v1, z + rise - 2), shade(PAPER_D, 0.7))
    # the ribbon bookmark down the spine
    x, y = c.P(um, v1, z - 2)
    c.d.line([(x, y), (x + 1, y + 7)], fill=A((200, 50, 60)))


def quill(c, x, y, h=14):
    """A quill in an inkpot in screen space ((x, y) the pot's foot)."""
    c.d.rectangle((x - 4, y - 5, x + 2, y), fill=A(INK))
    c.d.rectangle((x - 5, y - 6, x + 3, y - 5), fill=A(NAVY))
    c.d.polygon([(x - 1, y - 6), (x + 6, y - 6 - h), (x + 8, y - 5 - h), (x + 1, y - 6)], fill=A(WHITE))
    c.d.line([(x, y - 6), (x + 6, y - 5 - h)], fill=A(CON_M))


def lm_textract(fw, fh, tier, col, key):
    """Textract Reading Hall: a cream hall with tall lit windows, its roof an open book with lines of text on the
    pages; a quill-in-inkpot sign at the door, a reading lamp from tier 2, scroll stacks and an extracted table board
    from 3, a second book open on a lectern at 4."""
    c = Kit(fw, fh, 72)
    h = 12 + 2 * tier
    u0, v0, u1, v1 = 0.85, 1.65, 2.75, 2.55
    ground_shadow(c, u0, v0, u1, v1)
    tall = punched(key, bay=7, floor=h - 2, ww=3, wh=h - 7, p=0.75, lo=1, glass_col=(120, 150, 186))
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=combine(bands([(0, 3, STONE)]), top_band(2, col), tall), R=combine(bands([(0, 3, STONE)]), top_band(2, col), punched(key + "r", bay=7, floor=h - 2, ww=3, wh=h - 7, p=0.75, lo=1, glass_col=(96, 120, 156))), roof=False)
    open_book(c, u0, v0, u1, v1, h, h + 4, 7, key, cover=col)
    door(c, v1, u0 + 0.5, 10, 0.16, col=WOOD_D)
    x, y = c.P(u0 + 0.12, v1 + 0.22, 0)
    c.d.line([(x, y), (x, y - 6)], fill=A(WOOD_D))
    quill(c, x, y - 6, 10)
    if tier >= 2:
        lamp(c, u0 + 0.85, v1 + 0.3, 13)
    if tier >= 3:  # scroll stacks and a board with the extracted table
        for i in range(3):
            sx, sy = c.P(2.2 + i * 0.22, 2.82, 0)
            for kk in range(3 - i % 2):
                c.d.ellipse((sx - 4, sy - 4 - kk * 3, sx + 4, sy - 1 - kk * 3), fill=A(PAPER), outline=A(WOOD_D))
                c.d.point([(sx + 3, sy - 3 - kk * 3)], fill=A((200, 60, 60)))
        x, y = c.P(0.35, 2.75, 0)
        c.d.line([(x, y), (x, y - 9)], fill=A(WOOD_D))
        c.d.rectangle((x - 7, y - 21, x + 6, y - 9), fill=A(WOOD_D))
        c.d.rectangle((x - 6, y - 20, x + 5, y - 10), fill=A(PAPER))
        for kk in range(3):
            c.d.line([(x - 6, y - 17 + kk * 3), (x + 5, y - 17 + kk * 3)], fill=A(col))
        c.d.line([(x - 2, y - 20), (x - 2, y - 10)], fill=A(col))
        c.ld.rectangle((x - 6, y - 20, x + 5, y - 10), fill=A(LIT, 90))
    if tier >= 4:  # a lectern with an open book
        x, y = c.P(1.75, 2.9, 0)
        c.d.line([(x, y), (x, y - 8)], fill=A(WOOD_D))
        c.d.line([(x + 1, y), (x + 1, y - 8)], fill=A(WOOD))
        c.d.polygon([(x - 6, y - 10), (x, y - 8), (x + 6, y - 10), (x + 6, y - 13), (x, y - 11), (x - 6, y - 13)], fill=A(PAPER))
        c.d.line([(x, y - 11), (x, y - 8)], fill=A(PAPER_D))
        c.ld.polygon([(x - 6, y - 10), (x, y - 8), (x + 6, y - 10), (x + 6, y - 13), (x, y - 11), (x - 6, y - 13)], fill=A(LIT, 110))
    return c


def tw_textract(tier, k):
    """A stack of pages: floors of paper laid one on another, each a little off square, their faces lined with text
    (lit lines at night); loose sheets fanned out every few floors, a page folded into a tent on the top and a quill
    standing beside the mast."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=56)
    podium(c, 0.25, 0.25, 1.45, 1.45, 10, STONE, k, accent=TEAL)
    z = 10
    i = 0
    fl = 8
    while z + fl <= top_z:
        half = 0.42 + 0.06 * hv(k, "s", i)
        du, dv = (hv(k, "u", i) - 0.5) * 0.14, (hv(k, "v", i) - 0.5) * 0.14
        cu, cv = CU + du, CV + dv
        if i % 4 == 3:  # a loose sheet fanned out
            slab_rot(c, CU, CV, 0.56, (hv(k, "a", i) - 0.5) * 0.6 + 0.2, z, z + 2, PAPER)
            z += 2
        pc = PAPER if i % 2 else PAPER_D
        prism(c, cu - half, cv - half, cu + half, cv + half, z, z + fl, pc,
              L=combine(bands([(0, 1, shade(pc, 0.8))]), textlines(k + str(i), line=3, p=0.35, lo=1, hi=fl - 1)),
              R=combine(bands([(0, 1, shade(pc, 0.8))]), textlines(k + "r" + str(i), line=3, p=0.25, lo=1, hi=fl - 1)), ao=False, rim=0.03)
        z += fl
        i += 1
    # the page folded into a tent on the top
    a, b = CU - 0.42, CU + 0.42
    c.poly([(a, b, z), (b, b, z), (b, CV, z + 12), (a, CV, z + 12)], PAPER)
    c.poly([(b, b, z), (b, a, z), (b, CV, z + 12)], PAPER_D)
    c.line((a, CV, z + 12), (b, CV, z + 12), shade(PAPER_D, 0.85))
    c.poly([(a, b, z), (a + 0.18, b, z), (a, b - 0.04, z + 3)], TEAL)  # a dog-ear in the district's colour
    zt = z + 9
    th = 10 + 3 * (tier - 2)
    tip(c, CU, CV, zt, h=th, col=STEEL, beacon_col=RED if tier >= 4 else None)
    # the quill leaning on the mast, its top below the tip
    x, y = c.P(CU, CV, zt)
    qh = th - 3
    c.d.polygon([(x - 2, y), (x - 10, y - qh + 2), (x - 8, y - qh), (x - 1, y - 2)], fill=A(WHITE))
    c.d.line([(x - 2, y - 1), (x - 9, y - qh + 1)], fill=A(CON_M))
    return c


# ── Polly ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def horn(c, x, y, facing=-1, s=1):
    """A loudspeaker horn in screen space, (x, y) its throat: a flared bell turned left (-1) or right (1)."""
    f = facing
    c.d.polygon([(x, y - 1 * s), (x + f * 6 * s, y - 4 * s), (x + f * 6 * s, y + 3 * s), (x, y + 1 * s)], fill=A(STEEL))
    c.d.line([(x + f * 6 * s, y - 4 * s), (x + f * 6 * s, y + 3 * s)], fill=A(STEEL_D))
    c.d.line([(x, y - 1 * s), (x + f * 6 * s, y - 4 * s)], fill=A(WHITE))
    c.d.rectangle((min(x, x - f * 2), y - 1, max(x, x - f * 2), y + 1), fill=A(CHAR))


def waves(c, x, y, n, facing=-1, r0=5, step=4, lit=True):
    """Sound-wave arcs spreading from (x, y) to the left (-1) or right (1), teal, glowing at night."""
    for kk in range(n):
        r = r0 + kk * step
        box = (x - r, y - r, x + r, y + r)
        a0, a1 = (140, 220) if facing < 0 else (-40, 40)
        c.d.arc(box, a0, a1, fill=A(shade(TEAL, 1.15 - 0.1 * kk)))
        if lit:
            c.ld.arc(box, a0, a1, fill=A(GLOW, 220 - 40 * kk))


def lm_polly(fw, fh, tier, col, key):
    """Polly Radio Station: a teal-trimmed studio with a lit ON AIR lamp over the door, a microphone sign, loudspeaker
    horns on a pole at the front; a roof aerial from tier 2, a sound truck with horns from 3, sound waves spreading
    from the horns at 4."""
    c = Kit(fw, fh, 66)
    h = 13 + 3 * tier
    u0, v0, u1, v1 = 0.55, 1.6, 2.15, 2.5
    ground_shadow(c, u0, v0, u1, v1)
    studio = punched(key, bay=6, floor=8, ww=4, wh=4, p=0.7, lo=2)
    # acoustic panels on the right wall: a grid of soft squares
    panels = lambda i, n, z, hh, b, s: ((shade(TEAL, SIDE_[s] * (0.9 if (i // 3 + z // 3) % 2 else 1.0)), None) if 2 <= i < n - 2 and 3 <= z < hh - 4 else None)
    L = combine(top_band(3, col), bands([(0, 2, CHAR)]), studio, quoins(STONE))
    R = combine(top_band(3, col), panels)
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=L, R=R, roofcol=shade(CREAM, 0.85))
    m = u0 + 0.45
    door(c, v1, m, 9, 0.13)
    # the ON AIR lamp over the door: a red box lit
    x, y = c.P(m, v1, 12)
    c.d.rectangle((x - 5, y - 4, x + 4, y), fill=A(NAVY_D))
    c.d.rectangle((x - 4, y - 3, x + 3, y - 1), fill=A(RED))
    c.d.line([(x - 3, y - 2), (x + 2, y - 2)], fill=A(WHITE))
    c.ld.rectangle((x - 6, y - 5, x + 5, y + 1), fill=A(RED, 150))
    c.ld.rectangle((x - 4, y - 3, x + 3, y - 1), fill=A(RED))
    # the microphone sign on the roof edge
    x, y = c.P(u0 + 1.15, v1, h)
    c.d.rectangle((x - 1, y - 4, x, y), fill=A(STEEL_D))
    c.d.rounded_rectangle((x - 3, y - 14, x + 2, y - 5), radius=2, fill=A(col))
    c.d.line([(x - 2, y - 12), (x + 1, y - 12)], fill=A(shade(col, 0.6)))
    c.d.line([(x - 2, y - 9), (x + 1, y - 9)], fill=A(shade(col, 0.6)))
    c.d.arc((x - 5, y - 12, x + 4, y - 2), 0, 180, fill=A(STEEL_D))
    if tier >= 2:  # the roof aerial
        lattice(c, u0 + 0.35, v0 + 0.3, h, h + 18, 2, 1, STEEL_M, step=4)
        beacon(c, u0 + 0.35, v0 + 0.3, h + 19, RED, glow=2)
    if tier >= 3:  # the sound truck
        a, b = 2.3, 1.5
        prism(c, a, b, a + 0.4, b + 0.85, 1, 10, WHITE, L=combine(bands([(4, 6, col)])), R=combine(bands([(4, 6, col)])), rim=0)
        for vv in (b + 0.15, b + 0.7):
            x, y = c.P(a + 0.4, vv, 1)
            c.d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(CHAR))
        x, y = c.P(a + 0.2, b + 0.4, 10)
        horn(c, x - 1, y - 3, -1)
        horn(c, x + 1, y - 3, 1)
    # the horn pole at the front
    x, y = c.P(0.3, 2.75, 0)
    c.d.line([(x, y), (x, y - 22)], fill=A(NAVY))
    horn(c, x - 1, y - 20, -1)
    horn(c, x + 1, y - 16, 1)
    if tier >= 4:
        waves(c, x - 8, y - 20, 3, -1, r0=4, step=3)
    return c


SIDE_ = {"L": 0.9, "R": 0.72}


def tw_polly(tier, k):
    """The broadcast mast: a slim tapering teal-and-white shaft on a studio podium, clusters of loudspeaker horns
    at two levels turned every way, a ring of sound waves spreading from the top cluster (teal, glowing at night),
    red and white aerial bands up to the tip."""
    if tier < 2:
        return None
    top_z = H[tier] - 10
    c = canvas(tier, extra=56)
    podium(c, 0.35, 0.35, 1.35, 1.35, 12, CREAM, k, accent=TEAL)

    def bands_(th, z, h, base):
        if z % 14 in (0, 1):
            return shade(TEAL, base[0] / WHITE[0] + 0.05), None
        if z % 14 == 7 and ((th + math.pi / 2) / 0.5) % 1 < 0.5:
            return shade(GLASS_DK, 0.9), (LIT if hv(k, z // 14, int(th * 3)) < 0.5 else None)
        return None
    drum(c, CU, CV, 12, top_z, 0.26, WHITE, r1=0.13, shader=bands_, ao=False, capcol=TEAL)
    levels = [round(top_z * 0.55), top_z - 6] if tier >= 3 else [top_z - 6]
    for j, z in enumerate(levels):
        drum(c, CU, CV, z - 3, z, 0.3, TEAL_D, ao=False)
        x, y = c.P(CU, CV, z + 2)
        s = 2 if j == len(levels) - 1 and tier >= 4 else 1
        horn(c, x - 2, y, -1, s)
        horn(c, x + 2, y, 1, s)
        horn(c, x - 2, y - 5 * s, -1, s)
        horn(c, x + 2, y - 5 * s, 1, s)
        if j == len(levels) - 1:
            waves(c, x - 8 - 6 * s, y - 2 * s, 2 + (tier - 2), -1, r0=4, step=4)
            waves(c, x + 8 + 6 * s, y - 2 * s, 2 + (tier - 2), 1, r0=4, step=4)
    z = top_z
    for kk in range(3):
        prism(c, CU - 0.05, CV - 0.05, CU + 0.05, CV + 0.05, z + kk * 4, z + kk * 4 + 4, RED if kk % 2 == 0 else WHITE, rim=0, ao=False)
    tip(c, CU, CV, z + 12, h=8 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c


# ── Comprehend ────────────────────────────────────────────────────────────────────────────────────────────────────

HIGHLIGHT = ((255, 226, 80), (255, 150, 200), (120, 230, 200))  # highlighter yellow, pink, mint


def highlighted(key, line=4, lo=3, hi=None, margin=2, p=0.25):
    """Lines of text with words marked in highlighter colours (the key phrases, people and places it finds); the
    marks glow at night."""
    def g(i, n, z, h, base, side):
        top_ = h - 3 if hi is None else hi
        if z < lo or z >= top_ or i < margin or i >= n - margin:
            return None
        row, fz = (z - lo) // line, (z - lo) % line
        word = i // 5
        mark = hv(key, side, row, word)
        if fz in (0, 1) and mark < p and i % 5 != 4:
            hc = HIGHLIGHT[int(hv(key, row, word, "c") * 3)]
            if fz == 1:
                return shade(INK, 1.0 if side == "L" else 0.85), None
            return shade(hc, SIDE_[side] * 1.05), hc
        if fz == 1 and i % 5 != 4 and hv(key, side, row, word, "g") > 0.12:
            return shade(INK, 1.0 if side == "L" else 0.85), None
        return None
    return g


def lm_comprehend(fw, fh, tier, col, key):
    """Comprehend Reading Room: a pale reading room with a long run of lit windows, a skylight ridge and, on its
    street face, a great page of text with key words highlighted (yellow, pink and mint); a bench and highlighter-pen
    bollards from tier 2, a second page panel round the side at 3, a lamp at 4."""
    c = Kit(fw, fh, 66)
    h = 13 + 3 * tier
    u0, v0, u1, v1 = 0.5, 1.6, 2.6, 2.45
    ground_shadow(c, u0, v0, u1, v1)
    split = 0.55  # the page panel takes the left part of the street face, windows the rest

    def page(i, n, z, hh, b, s):
        if s != "L" or i >= n * split or z < 3 or z >= hh - 3:
            return None
        if i in (1, round(n * split) - 1) or z in (3, hh - 4):
            return shade(PAPER_D, 0.8), None
        return None
    L = combine(top_band(2, col), page, (lambda i, n, z, hh, b, s: highlighted(key, hi=h - 5, margin=3)(i, n, z, hh, b, s) if i < n * split - 2 else None),
                (lambda i, n, z, hh, b, s: (shade(PAPER, 0.98), None) if i < n * split and 3 <= z < hh - 3 else None),
                punched(key + "w", bay=5, floor=h, ww=3, wh=h - 8, p=0.8, lo=2, glass_col=(150, 190, 214)))
    side = (lambda i, n, z, hh, b, s: highlighted(key + "r", hi=h - 5, margin=3)(i, n, z, hh, b, s) if tier >= 3 and n * 0.2 < i < n * 0.8 else None)
    sp = (lambda i, n, z, hh, b, s: (shade(PAPER, 0.98 * 0.8), None) if tier >= 3 and n * 0.2 < i < n * 0.8 and 3 <= z < hh - 3 else None)
    R = combine(top_band(2, col), side, sp, punched(key + "r", bay=6, floor=h, ww=3, wh=h - 8, p=0.7, lo=2))
    prism(c, u0, v0, u1, v1, 0, h, (226, 230, 232), L=L, R=R, roof=False)
    c.gable(u0, v0, u1, v1, h, 6, col)
    vm = (v0 + v1) / 2
    for kk in range(6):  # skylight panes along the ridge's near slope
        a = u0 + 0.15 + kk * (u1 - u0 - 0.3) / 6
        b = a + (u1 - u0 - 0.3) / 6 - 0.06
        c.poly([(a, v1 - 0.12, h + 1.6), (b, v1 - 0.12, h + 1.6), (b, vm + 0.05, h + 5.6), (a, vm + 0.05, h + 5.6)], GLASS_L)
        c.poly([(a, v1 - 0.12, h + 1.6), (b, v1 - 0.12, h + 1.6), (b, vm + 0.05, h + 5.6), (a, vm + 0.05, h + 5.6)], LIT, c.ld)
    door(c, v1, u0 + 1.55, 10, 0.14)
    if tier >= 2:  # a bench and highlighter-pen bollards
        prism(c, 0.6, 2.7, 1.2, 2.82, 0, 4, WOOD, rim=0)
        for kk, hc in enumerate(HIGHLIGHT):
            u = 1.45 + kk * 0.3
            prism(c, u, 2.75, u + 0.1, 2.85, 0, 7, hc, rim=0)
            prism(c, u, 2.75, u + 0.1, 2.85, 7, 10, CHAR, rim=0, ao=False)
    if tier >= 4:
        lamp(c, 2.8, 2.7)
    return c


def tw_comprehend(tier, k):
    """The insight tower: a pale tower faced with lines of text whose key words are highlighted (glowing at night),
    set back once, crowned by a glass prism that sends out three rays in the highlighter colours (words in, meaning
    out)."""
    if tier < 2:
        return None
    top_z = H[tier] - 20
    c = canvas(tier, extra=64)
    podium(c, 0.3, 0.3, 1.4, 1.4, 10, STONE, k, accent=TEAL)
    zs = round(top_z * 0.6)
    for (hf, z0, z1, kk) in ((0.46, 10, zs, "a"), (0.32, zs, top_z, "b")):
        sh = combine(top_band(3, TEAL), highlighted(k + kk, line=4, lo=3, p=0.22))
        prism(c, CU - hf, CV - hf, CU + hf, CV + hf, z0, z1, PAPER, L=sh, R=sh, zref=z0, href=z1 - z0, ao=False)
    z = top_z
    prism(c, CU - 0.3, CV - 0.3, CU + 0.3, CV + 0.3, z, z + 3, TEAL_D, ao=False)
    z += 3
    # the prism: a triangular glass bar along u, apex up
    ph = 20 + 2 * (tier - 2)
    a, b = CU - 0.34, CU + 0.34
    c.poly([(a, CV + 0.28, z), (b, CV + 0.28, z), (b, CV, z + ph), (a, CV, z + ph)], (176, 226, 236))
    c.poly([(b, CV + 0.28, z), (b, CV - 0.28, z), (b, CV, z + ph)], (120, 180, 204))
    c.line((a, CV, z + ph), (b, CV, z + ph), WHITE)
    c.line((a, CV + 0.28, z), (a, CV, z + ph), WHITE)
    c.poly([(a, CV + 0.28, z), (b, CV + 0.28, z), (b, CV, z + ph), (a, CV, z + ph)], (150, 230, 240, 120), c.ld)
    # three highlighter-coloured rays out of its right end (the key phrases, entities and sentiment it finds)
    x0, y0 = c.P(b, CV, z + ph * 0.45)
    for j, rc in enumerate(HIGHLIGHT):
        c.d.line([(x0, y0), (x0 + 12 + 2 * j, y0 - 5 + j * 5)], fill=A(rc))
        c.ld.line([(x0, y0), (x0 + 12 + 2 * j, y0 - 5 + j * 5)], fill=A(rc, 200))
    tip(c, CU, CV, z + ph, h=8 + 3 * (tier - 2), col=STEEL, beacon_col=RED if tier >= 4 else None)
    return c
