"""
Compute Quarter (ec2 lambda ecs fargate eks beanstalk apprunner batch lightsail): each service's front building lm_<id>(fw, fh, tier, col, key)
and its tower tw_<id>(tier, k), the tower shaped by what the service does (see services/__init__.py).

The tower stands on the back of the 3x3 lot round (CU, CV) and ends in kit.tip on the centre line, where the legend
crowns sit. Front buildings keep the old metaphors (a factory, a food stall with its λ, a container terminal, a
ferry, a harbour office, a beanstalk garden) with more material: cladding, glass, rooftop plant, shadows.
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, ORANGE_D, WATER, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, DARK_GLASS, GLASS_DK, GLASS_L, LED, LIT, RED, STEEL, STEEL_D, STEEL_M,  # noqa: F401
                          STONE, Kit, A, beacon, bands, bridge, combine, dish, drum, drum_shadow, ellipse, face, glass, ground_shadow, hv,
                          lattice, leds, louvres, plant, podium, prism, punched, rib_shader, ribbon_shader, ribs, screen, solid,
                          tip, top_band)

CU = CV = 0.85  # the tower's axis on the back of the lot (the lot's centre line u = v)
# shaft heights per tier (px above the ground); the tip and crown add 15-30 more
H = {2: 66, 3: 112, 4: 160}
BOX_COLS = [(226, 72, 64), (59, 130, 246), (34, 170, 94), (255, 153, 0), (139, 92, 246), (20, 170, 160), (226, 230, 236)]
LEAF = (86, 178, 74)
LEAF_D = (44, 120, 56)
LEAF_L = (140, 214, 110)
BRICK = (176, 98, 74)
RUST = (150, 84, 60)


def canvas(tier, extra=46):
    return Kit(3, 3, H.get(tier, 40) + extra)


def water_strip(c, u0, v0, u1, v1, key):
    """Harbour water on the lot's front edge: two tones and a few glints."""
    c.poly([(u0, v0, 0), (u1, v0, 0), (u1, v1, 0), (u0, v1, 0)], shade(WATER, 0.92))
    for k in range(int((u1 - u0) * (v1 - v0) * 10) + 2):
        x, y = c.P(u0 + hv(key, "u", k) * (u1 - u0), v0 + hv(key, "v", k) * (v1 - v0), 0)
        c.d.line([(x, y), (x + 2 + k % 2, y)], fill=A(shade(WATER, 1.3)))


def quay(c, u0, v0, u1, v1, h=3, edge=True):
    ground_shadow(c, u0, v0, u1, v1, alpha=50)
    prism(c, u0, v0, u1, v1, 0, h, (176, 180, 186), R=louvres(2, 0.9), rim=0)
    for k in range(1, int((u1 - u0) / 0.5) + 1):
        c.line((u0 + k * 0.5, v0 + 0.02, h), (u0 + k * 0.5, v1 - 0.02, h), (160, 164, 172))
    if edge:
        face(c, "L", v1, u0, u1, h - 1, h, ORANGE, ao=False)


def container(c, u, v, z, col, du=0.8, dv=0.4, h=8, doors="R"):
    """A shipping container: corrugated sides, a door end with locking bars."""
    door = combine(lambda i, n, zz, hh, b, s: ((shade(b, 0.7), None) if i in (1, n // 2, n - 2) and 0 < zz < hh - 1 else None), solid())
    L = door if doors == "L" else combine(bands([(0, 1, shade(col, 0.7))]), ribs(2, 1.1, 0.86))
    R = door if doors == "R" else combine(bands([(0, 1, shade(col, 0.7))]), ribs(2, 1.1, 0.86))
    prism(c, u, v, u + du, v + dv, z, z + h, col, L=L, R=R, rim=0.03, ao=z <= 1)


def smooth_glass(key, floor=12, win=5, p=0.55, glass_col=GLASS_L, pane=0.5):
    """A calm drum facade: one glass band every `floor` px (few, wide bands, panes split by faint mullions), plain
    wall between, and a single vertical gloss highlight down the sunlit side (no spandrel stripes)."""
    from services.kit import _SF, _SR

    def g(th, z, h, base):
        gloss = -0.64 < th < -0.42
        fz = z % floor
        if 2 <= fz < 2 + win and z < h - 3:
            a = (th + math.pi / 2) / pane
            d = math.cos(th) * _SF + math.sin(th) * _SR
            gc = shade(glass_col, max(0.7, min(1.0, 0.62 + 0.4 * d)) + (0.16 if gloss else 0))
            if fz == 2:  # the head of the band, in shadow under the slab
                gc = shade(gc, 0.86)
            if a % 1 < 0.1 and not gloss:
                return shade(gc, 0.93), None
            w = hv(key, math.floor(a), z // floor)
            return gc, (LIT if w < p else None)
        if gloss:
            return shade(base, 1.12), None
        return None
    return g


# ── EC2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_ec2(fw, fh, tier, col, key):
    """EC2 Factory: a clad factory hall with a sawtooth roof of north lights and a loading bay; a glass server wing
    with racks of status lights from tier 2, a chiller yard from 3, exhaust stacks from 4."""
    c = Kit(fw, fh, 70)
    clad = (200, 204, 210)
    if tier >= 2:  # the server wing on the right, racks visible through its glass
        u0, v0, u1, v1 = 2.05, 0.35, 2.85, 1.45
        h = 22 + 2 * tier
        ground_shadow(c, u0, v0, u1, v1)
        rack = combine(top_band(3, col), leds(key + "w", step=3, every=4, p=0.7, lo=3, hi=h - 4), glass(key + "w", bay=6, floor=8, p=0.15, lo=1))
        prism(c, u0, v0, u1, v1, 0, h, (64, 72, 88), L=rack, R=rack)
        plant(c, u0, v0, u1, v1, h, key + "wp", n=2)
    # the hall
    u0, v0, u1, v1 = 0.9, 1.55, 2.85, 2.8
    h = 18 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    bay = (u1 - u0) * 0.42
    L = combine(top_band(3, col), lambda i, n, z, hh, b, s: ((shade(CON_D, 0.9 if z % 2 else 0.8), None) if n * 0.08 <= i < n * 0.42 and 1 <= z < hh - 6 else None),
                punched(key + "h", bay=6, floor=h - 4, ww=4, wh=3, p=0.6, lo=h - 10), ribs(3))
    prism(c, u0, v0, u1, v1, 0, h, clad, L=L, R=combine(top_band(3, col), punched(key + "hr", bay=6, floor=h - 4, ww=4, wh=3, p=0.6, lo=h - 10), ribs(3)), roof=False)
    # sawtooth roof: slopes rising toward +u, glazing on the steep +u faces
    n = 3
    w = (u1 - u0) / n
    for k in range(n):
        a = u0 + k * w
        c.poly([(a, v0, h), (a + w, v0, h + 8), (a + w, v1, h + 8), (a, v1, h)], (176, 182, 192))
        c.poly([(a, v1, h), (a + w, v1, h), (a + w, v1, h + 8)], shade(clad, 0.86))
        face(c, "R", a + w, v0, v1, h, h + 8, GLASS_DK, glass(key + f"saw{k}", bay=5, floor=9, p=0.5, refl=False) if k < n - 1 else ribs(3), ao=False)
    # loading bay canopy and a pallet
    prism(c, u0 + 0.12, v1, u0 + bay + 0.1, v1 + 0.22, h - 7, h - 5, col, ao=False, rim=0)
    if tier >= 3:  # chiller yard
        for i, u in enumerate((1.25, 1.75)):
            prism(c, u, 0.45, u + 0.4, 0.95, 0, 7, CON_L, L=louvres(2), R=louvres(2))
            x, y = c.P(u + 0.2, 0.7, 7)
            c.d.ellipse((x - 5, y - 3, x + 5, y + 2), fill=A(STEEL_D))
            c.d.line([(x - 3, y - 1), (x + 3, y)], fill=A(STEEL_M))
    if tier >= 4:  # exhaust stacks with orange bands
        for u in (1.25, 1.65):
            drum(c, u, 1.8, h + 4, h + 26, 0.09, STEEL, shader=rib_shader(1, hoops=(0.7, 0.75)), capcol=CHAR)
            beacon(c, u, 1.8, h + 27)
    return c


def tw_ec2(tier, k):
    """A server-rack slab: a broad charcoal slab whose long glass face shows racks of status lights, orange vent
    bands every few floors, a machine-room setback with rooftop cooling fans and an antenna."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    u0, v0, u1, v1 = 0.1, 0.45, 1.6, 1.25
    podium(c, 0.04, 0.38, 1.66, 1.32, 12, (88, 96, 112), k, accent=ORANGE)
    vent = lambda i, n, z, hh, b, s: ((shade(ORANGE, 0.95 if s == "L" else 0.72) if z % 2 else shade(ORANGE_D, 0.78 if s == "L" else 0.62)), None) if (z % 26) in range(20, 24) and z < hh - 4 else None
    fins = lambda i, n, z, hh, b, s: ((shade((150, 160, 176), 1.0 if s == "L" else 0.8), None) if i % 8 == 0 and 0 < i < n - 1 else None)
    L = combine(top_band(3, CHAR), vent, fins, leds(k + "L", step=2, every=4, p=0.5), glass(k, bay=8, floor=4, p=0.08, frame=(70, 80, 98), palette=DARK_GLASS))
    R = combine(top_band(3, CHAR), vent, louvres(2, 0.75), solid())
    prism(c, u0, v0, u1, v1, 12, top_z, (78, 86, 104), L=L, R=R, zref=12, href=top_z - 12)
    z = top_z
    if tier >= 3:  # machine room setback with fans
        prism(c, u0 + 0.15, v0 + 0.12, u1 - 0.45, v1 - 0.12, z, z + 10, (110, 118, 134), L=louvres(2), R=louvres(2))
        for fu in (u1 - 0.3,):
            for fv in (v0 + 0.2, v1 - 0.2):
                drum(c, fu, fv, z, z + 3, 0.13, STEEL_M, capcol=CHAR, ao=False)
                x, y = c.P(fu, fv, z + 3)
                for a in range(3):
                    ang = a * 2.1 + fu
                    c.d.line([(x, y - 1), (x + round(math.cos(ang) * 3), y - 1 + round(math.sin(ang) * 1.5))], fill=A(STEEL_M))
        z += 10
    if tier >= 4:
        lattice(c, CU, CV, z, z + 22, 3, 1, STEEL_M)
        tip(c, CU, CV, z + 22, h=8, beacon_col=RED)
    else:
        tip(c, CU, CV, z, h=8 if tier == 3 else 6)
    return c


# ── Lambda ────────────────────────────────────────────────────────────────────────────────────────────────────────

def lambda_glyph(c, x, y, s, col, width=3, lit=True):
    """A λ in screen space; (x, y) is the bottom centre."""
    long_ = [(x - 5 * s, y - 16 * s), (x - 2 * s, y - 16 * s), (x + 6 * s, y)]
    short = [(x + 0.5 * s, y - 8 * s), (x - 5 * s, y)]
    for d in (c.d, c.ld) if lit else (c.d,):
        d.line([tuple(map(round, p)) for p in long_], fill=A(col), width=width)
        d.line([tuple(map(round, p)) for p in short], fill=A(col), width=width)


def awning(c, u0, u1, v0, v1, z_back, z_front, col, stripes=8):
    for k in range(stripes):
        a = u0 + k * (u1 - u0) / stripes
        b = a + (u1 - u0) / stripes
        fill = col if k % 2 else WHITE
        c.poly([(a, v0, z_back), (b, v0, z_back), (b, v1, z_front), (a, v1, z_front)], fill)
        c.poly([(a, v1 - 0.12, z_front + 1), (b, v1 - 0.12, z_front + 1), (b, v1, z_front), (a, v1, z_front)], shade(fill, 0.9))
    # the scalloped valance
    face(c, "L", v1, u0, u1, z_front - 3, z_front, col, lambda i, n, z, h, b, s: (shade(WHITE if (i // 4) % 2 else col, 0.86), None) if z >= (1 if i % 4 in (1, 2) else 0) else None, ao=False)


def lm_lambda(fw, fh, tier, col, key):
    """Lambda Food Stall: a timber stall under a striped awning, its glowing λ sign on a navy board, a grill with
    smoke, menu board; tables with parasols from tier 2, a second counter from 3, a food truck and string lights at 4."""
    c = Kit(fw, fh, 80)
    if tier >= 3:  # a second counter at the back (more concurrency)
        ground_shadow(c, 1.7, 0.35, 2.7, 1.0)
        prism(c, 1.7, 0.35, 2.7, 1.0, 0, 10, WOOD, L=ribs(3, 1.08, 0.88), R=ribs(3, 1.08, 0.88))
        awning(c, 1.62, 2.78, 0.3, 1.18, 18, 15, col, 6)
    if tier >= 4:  # a food truck parked at the side
        u0, v0, u1, v1 = 0.3, 0.55, 1.45, 1.1
        ground_shadow(c, u0, v0, u1, v1)
        prism(c, u0, v0, u1, v1, 2, 16, WHITE, L=combine(bands([(4, 6, col)]), lambda i, n, z, h, b, s: ((LIT, LIT) if n * 0.3 < i < n * 0.8 and 7 <= z < 12 else None)))
        prism(c, u1, v0 + 0.05, u1 + 0.35, v1 - 0.02, 2, 11, col, L=combine(lambda i, n, z, h, b, s: (GLASS_L, None) if z > 6 else None))
        for wu in (u0 + 0.25, u1 + 0.1):
            x, y = c.P(wu, v1, 2)
            c.d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=A(CHAR))
            c.d.point([(x, y)], fill=A(STEEL_M))
    u0, v0, u1, v1 = 0.75, 1.45, 2.6, 2.4
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, 11, WOOD, L=combine(bands([(8, 11, WHITE)]), lambda i, n, z, h, b, s: ((shade(WOOD, 0.5), LIT) if n * 0.15 < i < n * 0.85 and 3 <= z < 7 else None), ribs(4, 1.06, 0.88)),
          R=combine(bands([(8, 11, WHITE)]), ribs(4, 1.06, 0.88)))
    # the grill on the counter, coals lit
    prism(c, u0 + 0.2, v0 + 0.25, u0 + 0.85, v0 + 0.7, 11, 13, CHAR, ao=False, rim=0)
    for k in range(4):
        x, y = c.P(u0 + 0.3 + k * 0.14, v0 + 0.48, 13)
        c.d.point([(x, y)], fill=A(ORANGE))
        c.light(x, y, ORANGE)
    # steam
    x, y = c.P(u0 + 0.5, v0 + 0.45, 13)
    for k in range(2 + (tier >= 3)):
        c.d.ellipse((x + k * 2 - 2, y - 6 - 4 * k, x + k * 2 + 1, y - 3 - 4 * k), fill=A(WHITE, 200))
    awning(c, u0 - 0.1, u1 + 0.1, v0 - 0.1, v1 + 0.3, 26, 20, col)
    for pu in (u0, u1 - 0.07):
        prism(c, pu, v1 + 0.2, pu + 0.07, v1 + 0.27, 0, 20, WOOD_D, roof=False, ao=False)
    # menu board by the hatch
    prism(c, u1 + 0.12, v1 - 0.15, u1 + 0.18, v1 + 0.2, 0, 12, NAVY_D, roof=False)
    for z in (5, 8, 10):
        face(c, "R", u1 + 0.18, v1 - 0.12, v1 + 0.15, z, z + 1, WHITE, ao=False, edge=False)
    # the λ sign on top
    x, y = c.P((u0 + u1) / 2, v0 - 0.1, 26)
    s = 1.0 + 0.12 * min(tier, 3)
    c.d.rectangle((x - round(9 * s), y - round(19 * s), x + round(9 * s), y + 1), fill=A(NAVY))
    c.d.line([(x - round(9 * s), y - round(19 * s)), (x + round(9 * s), y - round(19 * s))], fill=A(shade(NAVY, 1.5)))
    c.d.line([(x + round(9 * s), y - round(19 * s)), (x + round(9 * s), y + 1)], fill=A(NAVY_D))
    lambda_glyph(c, x, y - 2, s, ORANGE, width=3 if tier < 4 else 4)
    if tier >= 2:  # tables and parasols out front
        for k, u in enumerate((0.55, 1.35)):
            v = 2.72
            prism(c, u, v - 0.12, u + 0.24, v + 0.12, 0, 5, WOOD_D, rim=0)
            x, y = c.P(u + 0.12, v, 5)
            c.d.line([(x, y), (x, y - 9)], fill=A(STEEL_D))
            pc = col if k % 2 else (59, 130, 246)
            c.d.polygon([(x - 9, y - 8), (x, y - 13), (x + 9, y - 8)], fill=A(pc))
            c.d.polygon([(x, y - 13), (x + 9, y - 8), (x + 2, y - 8)], fill=A(shade(pc, 0.78)))
    if tier >= 4:  # string lights
        for k in range(9):
            u = u0 - 0.1 + k * (u1 - u0 + 0.2) / 8
            x, y = c.P(u, v1 + 0.3, 19 - (k % 2))
            colk = [ORANGE, (255, 240, 120), (240, 110, 150)][k % 3]
            c.d.point([(x, y)], fill=A(colk))
            c.ld.rectangle((x - 1, y - 1, x + 1, y + 1), fill=A(colk, 180))
    return c


def tw_lambda(tier, k):
    """Two leaning glass legs drawn like a λ: the long leg leans from the right to the top, the short leg leans in
    from the left and joins it part-way up; a glass lantern at the top, an orange edge on every floor."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    half = 0.2

    def leg(b, t, z0, z1, kk):
        step = 2
        for z in range(z0, z1, step):
            f = (z - z0) / max(1, z1 - z0)
            u = b[0] + (t[0] - b[0]) * f
            v = b[1] + (t[1] - b[1]) * f
            sh = combine(lambda i, n, zz, hh, bb, s: ((shade(ORANGE, 0.95 if s == "L" else 0.75), None) if zz % 10 == 0 else None),
                         glass(kk[:-1] if kk.endswith("2") else kk, bay=5, floor=10, p=0.5, per_floor=True))
            prism(c, u - half, v - half, u + half, v + half, z, min(z1, z + step), (210, 214, 220), L=sh, R=sh, roof=False,
                  ao=z < 2, zref=0, href=z1)
        top = (t[0], t[1])
        return top

    right = (1.4, 0.3)
    left = (0.3, 1.4)
    for xy in (right, left):
        ground_shadow(c, xy[0] - half, xy[1] - half, xy[0] + half, xy[1] + half, alpha=70)
        prism(c, xy[0] - half - 0.06, xy[1] - half - 0.06, xy[0] + half + 0.06, xy[1] + half + 0.06, 0, 8, STONE, rim=0)
    join = 0.55
    jz = round(8 + (top_z - 8) * join)
    ju, jv = right[0] + (CU - right[0]) * join, right[1] + (CV - right[1]) * join
    leg(right, (CU, CV), 8, top_z, k + "r")
    leg(left, (ju, jv), 8, jz, k + "l")
    # redraw the long leg above the joint so it reads in front of the short leg's end
    leg((ju, jv), (CU, CV), jz, top_z, k + "r2")
    # the lantern at the top
    prism(c, CU - 0.26, CV - 0.26, CU + 0.26, CV + 0.26, top_z, top_z + 10, ORANGE, L=combine(glass(k + "lt", bay=3, floor=10, p=0.9, lo=2)), R=glass(k + "lt", bay=3, floor=10, p=0.9, lo=2))
    prism(c, CU - 0.3, CV - 0.3, CU + 0.3, CV + 0.3, top_z + 10, top_z + 13, ORANGE, ao=False)
    tip(c, CU, CV, top_z + 13, h=8 + 4 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── ECS ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_ecs(fw, fh, tier, col, key):
    """ECS Shipping Docks: a quay on the harbour, rows of corrugated containers on the front of it (more each tier),
    a rail-mounted gantry crane over them, a straddle carrier from tier 3, floodlights and beacons at 4."""
    c = Kit(fw, fh, 80)
    water_strip(c, 0.0, 2.5, 3.0, 3.0, key)
    quay(c, 0.0, 0.0, 3.0, 2.5)
    for u in (0.08, 2.92):  # crane rails
        c.line((u, 0.1, 3), (u, 2.45, 3), STEEL_D)
    spots = [(0.25, 1.95), (1.15, 1.95), (0.25, 1.45), (1.15, 1.45), (2.05, 1.95), (2.05, 1.45)]
    n = 2 + tier * 2
    boxes = []
    for i in range(n):
        u, v = spots[i % 6]
        z = 3 + (i // 6) * 8
        boxes.append((z, u + v, u, v, BOX_COLS[int(hv(key, i) * len(BOX_COLS))] if i % 2 else col))
    for z, _, u, v, cc in sorted(boxes):
        container(c, u, v, z, cc, du=0.82, dv=0.42)
    if tier >= 3:  # a straddle carrier on the right
        u, v = 2.25, 0.45
        for dv in (0, 0.5):
            prism(c, u, v + dv, u + 0.45, v + dv + 0.06, 3, 20, ORANGE, rim=0, ao=False)
        prism(c, u, v, u + 0.45, v + 0.56, 20, 23, ORANGE, ao=False)
        container(c, u + 0.04, v + 0.08, 9, BOX_COLS[1], du=0.36, dv=0.4, h=7)
    # the gantry crane spanning the container rows, legs on the rails
    gh = 30 + 4 * tier
    gv0, gv1 = 1.3, 1.4
    for v in (gv0, 2.35):
        for u in (0.04, 2.84):
            prism(c, u, v, u + 0.1, v + 0.1, 3, gh, col, rim=0, ao=False)
    prism(c, 0.04, gv0, 2.94, gv1, gh, gh + 3, col, rim=0, ao=False)
    prism(c, 0.04, 2.35, 2.94, 2.45, gh, gh + 3, col, L=bands([(0, 1, ORANGE_D)]), rim=0, ao=False)
    tu = 0.9 + 0.3 * (tier % 2)
    prism(c, tu, gv0 - 0.02, tu + 0.42, 2.47, gh + 3, gh + 6, NAVY, rim=0, ao=False)
    prism(c, tu + 0.05, 2.1, tu + 0.37, 2.42, gh - 6, gh, WHITE, L=glass(key + "cab", bay=3, floor=6, p=0.9, lo=1), rim=0, ao=False)
    if tier >= 2:  # a container on the spreader
        x0, y0 = c.P(tu + 0.21, 1.85, gh)
        c.d.line([(x0 - 3, y0), (x0 - 3, y0 + 6)], fill=A(NAVY_D))
        c.d.line([(x0 + 3, y0 - 1), (x0 + 3, y0 + 5)], fill=A(NAVY_D))
        container(c, tu, 1.65, gh - 14, BOX_COLS[2], du=0.42, dv=0.36, h=7, doors="L")
    if tier >= 4:
        for u in (0.09, 2.89):
            beacon(c, u, 2.4, gh + 5)
        face(c, "L", 2.45, 0.1, 2.9, gh - 1, gh, LIT, lambda *a: (LIT, LIT), ao=False)
    return c


def tw_ecs(tier, k):
    """Stacked container floors: a tower of container blocks laid crosswise floor on floor, each corrugated and in
    its own colour, some cut with lit windows, a tower crane on the top."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=56)
    podium(c, 0.2, 0.2, 1.5, 1.5, 10, (90, 98, 112), k, accent=ORANGE)
    fh = 9
    z = 10
    i = 0
    while z + fh <= top_z:
        cc = BOX_COLS[int(hv(k, "c", i) * len(BOX_COLS))] if i % 3 else ORANGE
        if i % 2 == 0:
            u0, v0, u1, v1 = 0.25, 0.55, 1.45, 1.15
            off = (hv(k, "o", i) - 0.5) * 0.16
            u0, u1 = u0 + off, u1 + off
        else:
            u0, v0, u1, v1 = 0.55, 0.25, 1.15, 1.45
            off = (hv(k, "o", i) - 0.5) * 0.16
            v0, v1 = v0 + off, v1 + off
        win = glass(k + f"w{i}", bay=4, floor=fh, p=0.6, lo=2, hi=fh - 2)
        corr = combine(bands([(0, 1, shade(cc, 0.6))]), ribs(2, 1.1, 0.86))
        wins = hv(k, "w", i) < 0.6
        doorend = lambda i_, n, zz, hh, b, s: ((shade(b, 0.7), None) if i_ in (1, n // 2, n - 2) and 0 < zz < hh - 1 else None)
        if i % 2 == 0:
            prism(c, u0, v0, u1, v1, z, z + fh, cc, L=combine(win, corr) if wins else corr, R=combine(doorend, solid()), rim=0.02, ao=False)
        else:
            prism(c, u0, v0, u1, v1, z, z + fh, cc, L=combine(doorend, solid()), R=combine(win, corr) if wins else corr, rim=0.02, ao=False)
        z += fh
        i += 1
    # the tower crane
    mast = 14 + 6 * (tier - 2)
    lattice(c, CU, CV, z, z + mast, 2, 2, ORANGE)
    x, y = c.P(CU, CV, z + mast - 3)
    c.d.line([(x - 18, y + 2), (x + 12, y - 4)], fill=A(ORANGE), width=2)
    c.d.line([(x - 18, y + 2), (x - 18, y + 12)], fill=A(NAVY_D))
    c.d.rectangle((x - 21, y + 12, x - 15, y + 16), fill=A(BOX_COLS[1]))
    c.d.rectangle((x + 8, y - 4, x + 12, y), fill=A(CON_D))
    tip(c, CU, CV, z + mast, h=7, beacon_col=RED if tier >= 4 else None)
    return c


# ── Fargate ───────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_fargate(fw, fh, tier, col, key):
    """Fargate Ferry: a glass ferry terminal with a gangway, and the ferry that carries your containers for you:
    a white hull with an orange stripe, a bridge with windows, a funnel and containers on deck (more each tier)."""
    c = Kit(fw, fh, 76)
    water_strip(c, 0.0, 1.85, 3.0, 3.0, key)
    quay(c, 0.0, 0.0, 3.0, 1.85)
    # terminal: a low glass box on the right of the quay, clear of the tower that stands behind it from tier 2
    th = 15 + 2 * tier
    tu0, tv0, tu1, tv1 = 1.6, 0.2, 2.8, 1.25
    podium(c, tu0, tv0, tu1, tv1, th, WHITE, key, accent=col, R=combine(top_band(3, col), glass(key + "tr", bay=5, floor=th, p=0.35, lo=1, hi=th - 3)))
    c.poly([(tu0 - 0.08, tv0 - 0.08, th), (tu1 + 0.08, tv0 - 0.08, th), (tu1 + 0.08, tv1 + 0.08, th), (tu0 - 0.08, tv1 + 0.08, th)], NAVY)
    face(c, "L", tv1 + 0.08, tu0 - 0.08, tu1 + 0.08, th - 2, th, col, ao=False)
    face(c, "R", tu1 + 0.08, tv0 - 0.08, tv1 + 0.08, th - 2, th, col, ao=False)
    if tier >= 2:  # gangway
        prism(c, 1.95, 1.3, 2.25, 2.1, 6, 8, STEEL_M, L=ribs(2), rim=0, ao=False)
    # the ferry
    fu0, fu1 = 0.25, 2.8 if tier >= 2 else 2.3
    v0, v1 = 2.05, 2.85
    hull = combine(bands([(1, 3, col), (0, 1, NAVY_D)]), solid())
    prism(c, fu0, v0, fu1, v1, 0, 7, WHITE, L=hull, R=hull, roofcol=(196, 170, 140))
    c.poly([(fu1, v0, 0), (fu1 + 0.25, (v0 + v1) / 2, 2), (fu1 + 0.25, (v0 + v1) / 2, 7), (fu1, v1, 7), (fu1, v1, 0)], shade(WHITE, 0.8))
    # bridge deck with windows
    prism(c, fu0 + 0.1, v0 + 0.1, fu0 + 0.75, v1 - 0.1, 7, 17, WHITE, L=combine(top_band(2, NAVY), glass(key + "br", bay=3, floor=10, p=0.8, lo=4, hi=8)), R=glass(key + "brr", bay=3, floor=10, p=0.8, lo=4, hi=8))
    drum(c, fu0 + 0.42, (v0 + v1) / 2, 17, 26, 0.1, ORANGE, shader=rib_shader(1, hoops=(0.8, 0.85)), capcol=NAVY_D, ao=False)
    for i in range(min(tier + 1, 5)):
        u = fu0 + 0.85 + (i % 2) * 0.72
        z = 7 + (i // 2) * 7
        if u + 0.62 <= fu1:
            container(c, u, v0 + 0.15, z, [col, BOX_COLS[i % len(BOX_COLS)]][i % 2], du=0.62, dv=0.5, h=7)
    if tier >= 3:  # smoke
        x, y = c.P(fu0 + 0.42, (v0 + v1) / 2, 28)
        for kk in range(3):
            c.d.ellipse((x + kk * 3 - 2, y - 4 - kk * 4, x + kk * 3 + 2, y - kk * 4), fill=A(CON_L, 220))
    if tier >= 4:
        for kk in range(5):
            x, y = c.P(fu0 + 0.3 + kk * 0.5, v1, 6)
            c.d.point([(x, y)], fill=A(LIT))
            c.light(x, y, LIT)
        beacon(c, fu1 - 0.2, (v0 + v1) / 2, 20)
    return c


def tw_fargate(tier, k):
    """Containers hung in an open frame: an exposed orange steel frame, floor beams and X bracing, container
    modules slotted into some bays and not others, a hoist beam on the top lowering one more in."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    u0, v0, u1, v1 = 0.4, 0.4, 1.3, 1.3
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, 0, 4, STONE, rim=0)
    fl = 12
    nfl = (top_z - 4) // fl
    # back columns first, then modules floor by floor, then the front column and beams over them
    for (u, v) in ((u0, v0), (u1 - 0.08, v0), (u0, v1 - 0.08)):
        prism(c, u, v, u + 0.08, v + 0.08, 4, top_z, ORANGE, rim=0, ao=False)
    for f in range(nfl):
        z = 4 + f * fl
        slots = [(0.46, 0.46), (0.46, 0.87), (0.87, 0.46), (0.87, 0.87)]
        for s, (a, b) in enumerate(sorted(slots, key=lambda t: t[0] + t[1])):
            if hv(k, f, s) < (0.45 if f < nfl - 1 else 0.8):
                cc = BOX_COLS[int(hv(k, "c", f, s) * len(BOX_COLS))]
                corr = combine(bands([(0, 1, shade(cc, 0.6))]), ribs(2, 1.1, 0.86))
                win = glass(k + f"{f}{s}", bay=3, floor=fl - 2, p=0.6, lo=2, hi=fl - 3)
                prism(c, a, b, a + 0.37, b + 0.37, z + 1, z + fl - 1, cc, L=combine(win, corr) if s % 2 else corr, R=corr if s % 2 else combine(win, corr), rim=0.02, ao=False)
        # the floor beams on the visible faces
        face(c, "L", v1, u0, u1, z + fl - 1, z + fl + 1, ORANGE, ao=False)
        face(c, "R", u1, v0, v1, z + fl - 1, z + fl + 1, ORANGE, ao=False)
        # X bracing on the right face
        xa, ya = c.P(u1, v1, z)
        xb, yb = c.P(u1, v0, z + fl)
        c.d.line([(xa, ya), (xb, yb)], fill=A(ORANGE_D))
    prism(c, u1 - 0.08, v1 - 0.08, u1, v1, 4, top_z, ORANGE, rim=0, ao=False)
    z = 4 + nfl * fl + 1
    top_z = z
    # the hoist beam and a module on its way in
    prism(c, u0, CV - 0.04, u1 + 0.3, CV + 0.04, z + 10, z + 13, ORANGE, rim=0, ao=False)
    for u in (u0 + 0.05, u1 - 0.05):
        prism(c, u - 0.04, CV - 0.04, u + 0.04, CV + 0.04, z, z + 10, ORANGE, rim=0, ao=False)
    x, y = c.P(u1 + 0.2, CV, z + 10)
    c.d.line([(x, y), (x, y + 8)], fill=A(NAVY_D))
    container(c, u1 + 0.02, CV - 0.18, z - 6, BOX_COLS[int(hv(k, "h") * 6)], du=0.36, dv=0.36, h=6)
    tip(c, CU, CV, z + 13, h=8 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── EKS ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def helm(c, x, y, rad, col, spokes=7, lit=False):
    """A ship's helm with seven spokes and handles (the wheel EKS steers by)."""
    c.d.ellipse((x - rad, y - rad, x + rad, y + rad), outline=A(shade(col, 0.7)), width=2)
    c.d.arc((x - rad, y - rad, x + rad, y + rad), 150, 260, fill=A(shade(col, 1.15)), width=1)
    for kk in range(spokes):
        a = -math.pi / 2 + kk * 2 * math.pi / spokes
        c.d.line([(x, y), (x + round(math.cos(a) * (rad + 3)), y + round(math.sin(a) * (rad + 3)))], fill=A(col))
        c.d.rectangle((x + round(math.cos(a) * (rad + 3)) - 1, y + round(math.sin(a) * (rad + 3)) - 1,
                       x + round(math.cos(a) * (rad + 3)), y + round(math.sin(a) * (rad + 3))), fill=A(col))
    c.d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(col))
    if lit:
        c.ld.ellipse((x - rad, y - rad, x + rad, y + rad), outline=A(LIT), width=1)


def lm_eks(fw, fh, tier, col, key):
    """EKS Harbour: a pilot station on the quay (glass lookout, the helm on its front), container pods stacked on
    the quay that multiply with each tier (pods scheduled onto nodes), a pilot boat from tier 3."""
    c = Kit(fw, fh, 70)
    water_strip(c, 0.0, 2.45, 3.0, 3.0, key)
    quay(c, 0.0, 0.0, 3.0, 2.45)
    # the pilot station: two storeys and a glass lookout
    u0, v0, u1, v1 = 1.55, 1.15, 2.75, 2.25
    h = 16 + 3 * tier
    podium(c, u0, v0, u1, v1, 10, (196, 188, 174), key, accent=col)
    prism(c, u0, v0, u1, v1, 10, h, WHITE, L=combine(top_band(3, col), punched(key + "s", bay=5, floor=h - 10, ww=3, wh=4, p=0.6)),
          R=combine(top_band(3, col), punched(key + "sr", bay=5, floor=h - 10, ww=3, wh=4, p=0.6)), ao=False)
    lo0, lo1 = u0 + 0.25, u1 - 0.25
    prism(c, lo0, v0 + 0.2, lo1, v1 - 0.2, h, h + 9, GLASS_DK, L=glass(key + "lk", bay=3, floor=9, p=0.9), R=glass(key + "lkr", bay=3, floor=9, p=0.9), ao=False)
    c.pyramid(lo0 - 0.06, v0 + 0.14, lo1 + 0.06, v1 - 0.14, h + 9, 6, NAVY)
    x, y = c.P((u0 + u1) / 2, v1, h - 7)
    helm(c, x, y + 1, 4, WHITE)
    # container pods on the quay
    spots = [(0.2, 1.75, 0), (0.2, 1.25, 0), (0.2, 1.75, 8), (0.2, 0.75, 0), (0.2, 1.25, 8), (0.2, 1.75, 16), (0.2, 0.25, 0)]
    n = [1, 3, 5, 7][tier - 1]
    for i, (u, v, z) in sorted(enumerate(spots[:n]), key=lambda t: (t[1][2], t[1][0] + t[1][1])):
        container(c, u, v, z + 3, [col, (59, 130, 246), (34, 170, 94), (226, 72, 64)][i % 4], du=0.75, dv=0.42)
    # bollards on the quay edge
    for kk in range(5):
        x, y = c.P(0.3 + kk * 0.6, 2.38, 3)
        c.d.rectangle((x - 1, y - 3, x + 1, y), fill=A(NAVY_D))
    if tier >= 3:  # a pilot boat
        bu0, bu1, bv0, bv1 = 0.4, 1.4, 2.55, 2.9
        prism(c, bu0, bv0, bu1, bv1, 0, 4, (226, 72, 64), L=bands([(3, 4, WHITE)]), rim=0)
        prism(c, bu0 + 0.15, bv0 + 0.05, bu0 + 0.5, bv1 - 0.05, 4, 9, WHITE, L=glass(key + "pb", bay=3, floor=5, p=0.8, lo=1), rim=0, ao=False)
    if tier >= 4:
        beacon(c, (lo0 + lo1) / 2, (v0 + v1) / 2, h + 16)
    return c


def tw_eks(tier, k):
    """A drum tower: a round shaft with ribbon windows and a band per floor, a lookout ring, and a great helm wheel
    standing on its crown."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=58)
    drum_shadow(c, CU, CV, 0.62)
    drum(c, CU, CV, 0, 10, 0.62, (196, 188, 174), shader=rib_shader(14, hoops=(8,)))
    drum(c, CU, CV, 10, top_z, 0.5, (226, 230, 236), shader=smooth_glass(k, floor=13, win=5, p=0.55), ao=False)
    drum(c, CU, CV, top_z, top_z + 3, 0.56, (50, 108, 229), ao=False)
    z = top_z + 3
    if tier >= 3:  # the lookout: a glass drum under a navy cap
        drum(c, CU, CV, z, z + 8, 0.36, GLASS_DK, shader=rib_shader(10, lo=0.7, hi=1.3), gloss=True, ao=False)
        drum(c, CU, CV, z + 8, z + 10, 0.42, NAVY, ao=False)
        z += 10
    # the helm wheel, standing on the crown
    rad = 7 + 2 * (tier - 2)
    x, y = c.P(CU, CV, z + rad + 4)
    c.d.rectangle((x - 2, y, x + 1, y + rad + 4), fill=A(STEEL_D))
    helm(c, x, y, rad, (50, 108, 229) if tier < 4 else WHITE, lit=tier >= 3)
    tip(c, CU, CV, z + rad + 4 + 1, h=rad + 6, beacon_col=RED if tier >= 4 else None)
    return c


# ── Elastic Beanstalk ─────────────────────────────────────────────────────────────────────────────────────────────

def vine(c, u, v, z0, z1, r, phase=0.0, turns=0.075, lit=False):
    """A vine spiralling round a drum of radius r (tiles): thick where it passes in front, leaves every few px."""
    cx, cyb = c.Pf(u, v, 0)
    rx, ry = (r + 0.04) * RX_, (r + 0.04) * RY_
    for z in range(z0, z1):
        th = z * turns + phase
        if math.cos(th) < -0.05:
            continue
        x = round(cx + rx * math.sin(th))
        y = round(cyb + ry * math.cos(th) - z)
        c.put(x - 1, y, LEAF_D)
        c.put(x, y, LEAF if math.sin(th) < 0.3 else LEAF_D)
        c.put(x + 1, y, LEAF_D)
        if z % 9 == 0:
            side = -1 if (z // 9) % 2 else 1
            for dx, dy, col_ in ((side * 2, -1, LEAF), (side * 3, -2, LEAF_L), (side * 4, -1, LEAF), (side * 3, 0, LEAF_D)):
                c.put(x + dx, y + dy, col_)
        if lit and z % 17 == 5:
            c.light(x, y - 1, (255, 236, 150))


from services.kit import RX as RX_, RY as RY_  # noqa: E402


def cloud(c, x, y, w):
    for dx, dy, rr in ((-w, 2, 5), (w, 2, 5), (-w // 2, -1, 6), (w // 2, -1, 6), (0, -3, 7)):
        c.d.ellipse((x + dx - rr, y + dy - rr, x + dx + rr, y + dy + rr), fill=A((214, 222, 234)))
    for dx, dy, rr in ((-w, 1, 4), (-w // 2, -2, 5), (0, -4, 6), (w // 2, -2, 5)):
        c.d.ellipse((x + dx - rr, y + dy - rr, x + dx + rr - 1, y + dy + rr - 2), fill=A(WHITE))


def lm_beanstalk(fw, fh, tier, col, key):
    """Beanstalk Garden: a hedged garden with a glasshouse, raised beds and a young beanstalk climbing its cane in
    the middle bed (taller each tier); a potting shed from tier 2, a pond from 3, a gardener's sign lit at night."""
    c = Kit(fw, fh, 96)
    hedge = (64, 146, 68)
    for (a, b, cc, d) in ((0, 0, 3.0, 0.18), (0, 0, 0.18, 3.0)):
        prism(c, a, b, cc, d, 0, 6, hedge, L=ribs(3, 1.12, 0.85), R=ribs(3, 1.12, 0.85))
    c.poly([(0.18, 0.18, 0), (3.0, 0.18, 0), (3.0, 3.0, 0), (0.18, 3.0, 0)], (112, 176, 92))
    if tier >= 2:  # potting shed at the back
        prism(c, 0.35, 0.35, 1.05, 0.95, 0, 12, WOOD, L=ribs(3, 1.08, 0.86), R=combine(lambda i, n, z, h, b, s: ((GLASS_L, LIT) if n * 0.3 < i < n * 0.7 and 5 <= z < 9 else None), ribs(3, 1.08, 0.86)))
        c.gable(0.3, 0.3, 1.1, 1.0, 12, 6, (140, 60, 48))
    # glasshouse on the right
    gu0, gv0, gu1, gv1 = 1.7, 0.4, 2.8, 1.35
    ground_shadow(c, gu0, gv0, gu1, gv1, alpha=50)
    prism(c, gu0, gv0, gu1, gv1, 0, 3, WHITE, rim=0)
    gl = glass(key + "gh", bay=4, floor=11, p=0.4, frame=WHITE, refl=True)
    prism(c, gu0, gv0, gu1, gv1, 3, 13, GLASS_L, L=gl, R=gl, roof=False, ao=False)
    vm = (gv0 + gv1) / 2
    c.poly([(gu0, gv1, 13), (gu1, gv1, 13), (gu1, vm, 20), (gu0, vm, 20)], (176, 218, 238))
    c.poly([(gu1, gv1, 13), (gu1, gv0, 13), (gu1, vm, 20)], (120, 172, 210))
    for kk in range(1, 5):
        a = gu0 + kk * (gu1 - gu0) / 5
        c.line((a, gv1, 13), (a, vm, 20), WHITE)
    # raised beds
    for (a, b) in ((0.45, 2.2), (1.85, 2.2)):
        prism(c, a, b, a + 0.75, b + 0.55, 0, 4, WOOD_D, roofcol=(104, 72, 48), rim=0.06)
        for kk in range(5):
            x, y = c.P(a + 0.1 + kk * 0.13, b + 0.27, 4)
            c.d.rectangle((x - 1, y - 2, x + 1, y), fill=A(LEAF if kk % 2 else LEAF_L))
    # the middle bed with the beanstalk on its cane
    bu, bv = 1.45, 1.6
    prism(c, bu - 0.35, bv - 0.35, bu + 0.35, bv + 0.35, 0, 5, STONE, roofcol=(110, 78, 52), rim=0.06)
    height = 22 + 12 * tier
    x, y = c.P(bu, bv, 5)
    c.d.line([(x + 4, y), (x + 4, y - height)], fill=A(WOOD))
    c.d.line([(x + 5, y), (x + 5, y - height)], fill=A(WOOD_D))
    vine(c, bu, bv, 5, 5 + height, 0.1, turns=0.16, lit=tier >= 3)
    vine(c, bu, bv, 5, 5 + height - 4, 0.1, phase=math.pi, turns=0.16)
    if tier >= 2:  # beans
        for z in range(16, height, 14):
            x, y = c.P(bu, bv, 5 + z)
            c.d.ellipse((x - 6, y, x - 3, y + 5), fill=A(LEAF_L))
    if tier >= 3:  # a pond
        ellipse(c, 2.5, 2.55, 0, 0.3, WATER, rim=False)
        x, y = c.P(2.5, 2.55, 0)
        c.d.line([(x - 3, y - 1), (x + 1, y - 1)], fill=A(shade(WATER, 1.35)))
    # gardener's sign at the gate
    x, y = c.P(1.5, 2.95, 0)
    c.d.rectangle((x - 1, y - 12, x, y), fill=A(WOOD_D))
    c.d.rectangle((x - 6, y - 17, x + 6, y - 10), fill=A(col))
    c.d.line([(x - 6, y - 17), (x + 6, y - 17)], fill=A(shade(col, 1.3)))
    c.ld.rectangle((x - 5, y - 16, x + 5, y - 11), fill=A(LIT, 140))
    if tier >= 4:
        cloud(c, *c.P(bu, bv, 5 + height), 6)
    return c


def tw_beanstalk(tier, k):
    """A green glass shaft with a giant vine spiralling up it, leaves all the way, a cloud round the top and a
    sprouting finial."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=50)
    drum_shadow(c, CU, CV, 0.6)
    drum(c, CU, CV, 0, 8, 0.6, (120, 96, 70), shader=rib_shader(16))
    green = (96, 170, 110)
    drum(c, CU, CV, 8, top_z, 0.44, green, shader=smooth_glass(k, floor=12, win=5, p=0.5, glass_col=(150, 220, 170)), ao=False, capcol=(70, 140, 80))
    vine(c, CU, CV, 4, top_z + 4, 0.44, phase=0.4, turns=0.07, lit=True)
    vine(c, CU, CV, 4, top_z + 2, 0.44, phase=0.4 + math.pi, turns=0.07)
    z = top_z
    x, y = c.P(CU, CV, z + 4)
    cloud(c, x, y, 8 + 2 * (tier - 2))
    if tier >= 4:  # a little castle grown in the cloud
        c.d.rectangle((x - 5, y - 12, x + 5, y - 4), fill=A(CON_L))
        c.d.rectangle((x + 1, y - 12, x + 5, y - 4), fill=A(CON_M))
        for xx in (x - 7, x + 5):
            c.d.rectangle((xx, y - 15, xx + 2, y - 4), fill=A(CON_M))
            c.d.polygon([(xx - 1, y - 15), (xx + 3, y - 15), (xx + 1, y - 19)], fill=A(ORANGE))
        c.d.rectangle((x - 1, y - 8, x, y - 4), fill=A(NAVY_D))
        for xx in (x - 3, x + 2):
            c.d.point([(xx, y - 10)], fill=A(LIT))
            c.light(xx, y - 10, LIT)
        z += 12
    # the sprout finial
    tip(c, CU, CV, z + 6, h=8 + 2 * (tier - 2), col=LEAF, beacon_col=RED if tier >= 4 else None)
    x, y = c.P(CU, CV, z + 10)
    c.d.ellipse((x - 5, y - 2, x - 1, y + 1), fill=A(LEAF_L))
    c.d.ellipse((x + 1, y - 4, x + 5, y - 1), fill=A(LEAF))
    return c


# ── App Runner ────────────────────────────────────────────────────────────────────────────────────────────────────

def conveyor(c, u0, u1, v0, v1, z, key, n, col):
    """A belt conveyor on legs along u: a dark belt with roller ticks on its street face, containers riding it."""
    for u in [u0 + 0.05 + k * 0.5 for k in range(int((u1 - u0) / 0.5) + 1)]:
        if u < u1 - 0.05:
            prism(c, u, v1 - 0.06, u + 0.05, v1, 0, z, STEEL_D, rim=0, ao=False)
    roll = lambda i, nn, zz, hh, b, s: ((shade(STEEL_M, 1.1), None) if i % 4 == 0 else (shade(CHAR, 0.9), None))
    prism(c, u0, v0, u1, v1, z, z + 2, CHAR, L=roll, roofcol=(54, 58, 70), rim=0, ao=False)
    for i in range(n):
        u = u0 + 0.1 + i * (u1 - u0 - 0.3) / max(1, n - 1) if n > 1 else (u0 + u1) / 2
        cc = col if i % 2 == 0 else BOX_COLS[int(hv(key, "cv", i) * len(BOX_COLS))]
        container(c, u, v0 + 0.03, z + 2, cc, du=0.26, dv=v1 - v0 - 0.06, h=6)


def lm_apprunner(fw, fh, tier, col, key):
    """App Runner Drive-Through: a glass kiosk with a canopy over its drive lane, an arrow pylon, and a conveyor that
    carries containers straight out of the hatch to the street (more each tier); floodlit belt and beacon at 4."""
    c = Kit(fw, fh, 76)
    # the drive lane, asphalt with a dashed line, running past the hatch
    c.poly([(0.15, 1.5, 0), (2.95, 1.5, 0), (2.95, 2.05, 0), (0.15, 2.05, 0)], (84, 90, 102))
    for k in range(6):
        c.line((0.3 + k * 0.45, 1.78, 0), (0.5 + k * 0.45, 1.78, 0), WHITE)
    # the kiosk
    u0, v0, u1, v1 = 1.75, 0.35, 2.8, 1.4
    h = 14 + 2 * tier
    podium(c, u0, v0, u1, v1, h, WHITE, key, accent=col, R=combine(top_band(3, col), glass(key + "kr", bay=4, floor=h, p=0.5, lo=1, hi=h - 3)))
    plant(c, u0, v0, u1, v1, h, key + "kp", n=1)
    # the canopy over the lane, on two posts
    for u in (1.85, 2.65):
        prism(c, u, 1.95, u + 0.06, 2.01, 0, h + 2, STEEL_M, rim=0, ao=False)
    prism(c, 1.7, 1.35, 2.85, 2.08, h + 2, h + 5, col, L=bands([(0, 1, shade(col, 0.7))]), roofcol=shade(col, 1.05), rim=0.04, ao=False)
    face(c, "L", 2.08, 1.8, 2.75, h + 2, h + 3, LIT, lambda *a: (LIT, LIT), ao=False, edge=False)
    # the conveyor out of the hatch to the street: containers ship as soon as they are built
    conveyor(c, 0.3, 2.75, 2.25, 2.62, 5, key, 1 + tier, col)
    # the hatch the belt comes out of (a small glass booth at the belt's head)
    prism(c, 2.55, 2.1, 2.9, 2.75, 0, 13, WHITE, L=combine(top_band(2, col), lambda i, n, z, hh, b, s: ((NAVY_D, None) if n * 0.2 < i < n * 0.8 and 4 <= z < 9 else None)),
          R=glass(key + "hb", bay=3, floor=13, p=0.6, lo=2, hi=11))
    if tier >= 2:  # an arrow sign on the canopy fascia: go straight out
        x, y = c.P(2.27, 2.08, h + 5)
        c.d.rectangle((x - 9, y - 9, x + 8, y + 1), fill=A(NAVY))
        c.d.line([(x - 9, y - 9), (x + 8, y - 9)], fill=A(shade(NAVY, 1.6)))
        arrow = [(x - 6, y - 5), (x + 1, y - 5), (x + 1, y - 8), (x + 6, y - 4), (x + 1, y), (x + 1, y - 3), (x - 6, y - 3)]
        c.d.polygon(arrow, fill=A(ORANGE))
        c.ld.polygon(arrow, fill=A(ORANGE))
    if tier >= 3:  # a second, parallel belt behind the first
        conveyor(c, 0.3, 1.6, 1.08, 1.4, 4, key + "b", tier - 1, col)
    if tier >= 4:
        for k in range(7):
            x, y = c.P(0.4 + k * 0.33, 2.62, 4)
            c.d.point([(x, y)], fill=A(LIT))
            c.light(x, y, LIT)
        beacon(c, 2.72, 2.4, 15)
    return c


def tw_apprunner(tier, k):
    """A sleek one-piece shaft: a tapering white drum in calm glass bands with an orange running track spiralling
    up it to a glass crown (code goes in at the bottom and runs straight to the top)."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=40)
    r0, r1 = 0.56, 0.3
    drum_shadow(c, CU, CV, 0.62)
    drum(c, CU, CV, 0, 8, 0.62, STONE, shader=rib_shader(16, hoops=(6,)))
    prof = lambda t: r0 + (r1 - r0) * t ** 1.3
    drum(c, CU, CV, 8, top_z, r0, (232, 236, 242), profile=prof, shader=smooth_glass(k, floor=11, win=4, p=0.5), ao=False)
    # the running track: an orange band with a white lane line, wound round the shaft (front half only)
    cx, cyb = c.Pf(CU, CV, 0)
    turns = 0.15
    for z in range(10, top_z - 2):
        t = (z - 8) / max(1, top_z - 8)
        r = prof(t) + 0.03
        th = z * turns
        if math.cos(th) < 0:
            continue
        x = round(cx + r * RX_ * math.sin(th))
        y = round(cyb + r * RY_ * math.cos(th) - z)
        lit = tier >= 3 and z % 9 == 0
        for dy, colx in ((0, shade(ORANGE, 1.08)), (1, ORANGE), (2, ORANGE_D), (3, shade(ORANGE_D, 0.8))):
            c.put(x, y + dy, colx, ORANGE if lit and dy == 1 else None)
            c.put(x + 1, y + dy, colx)
        if z % 3 == 0:  # the lane line
            c.put(x, y + 1, WHITE)
    # the glass crown
    drum(c, CU, CV, top_z, top_z + 7, 0.2, GLASS_DK, shader=rib_shader(8, lo=0.7, hi=1.3), gloss=True, ao=False, capcol=ORANGE)
    tip(c, CU, CV, top_z + 7, h=10 + 4 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Batch ─────────────────────────────────────────────────────────────────────────────────────────────────────────

QUEUE = [(176, 186, 200), ORANGE, (34, 170, 94)]  # waiting, running, done


def crate(c, u, v, z, col, s=0.3, h=6):
    """A timber crate on a pallet with a coloured job tag."""
    prism(c, u - 0.02, v - 0.02, u + s + 0.02, v + s + 0.02, z, z + 1, WOOD_D, rim=0, ao=z <= 1)
    slat = combine(lambda i, n, zz, hh, b, s_: ((shade(b, 0.78), None) if i in (0, n - 1) or zz in (0, hh - 1) or i == zz % n else None), solid())
    prism(c, u, v, u + s, v + s, z + 1, z + 1 + h, WOOD, L=slat, R=slat, rim=0.03, ao=False)
    face(c, "L", v + s, u + s * 0.3, u + s * 0.7, z + 3, z + 5, col, ao=False, edge=False)


def lm_batch(fw, fh, tier, col, key):
    """Batch Job Shop: a ribbed warehouse with roller doors and a job board, its crates queued on pallets out front
    (each tagged waiting, running or done; more each tier), a forklift from tier 3, floodlights at 4."""
    c = Kit(fw, fh, 70)
    u0, v0, u1, v1 = 0.95, 1.4, 2.85, 2.35
    h = 18 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    doors = lambda i, n, z, hh, b, s: ((shade(CON_M, 0.95 if z % 2 else 0.8), None) if (i % (n // 3)) in range(3, n // 3 - 3) and 1 <= z < hh - 8 else None)
    prism(c, u0, v0, u1, v1, 0, h, (196, 200, 206), L=combine(top_band(4, col), doors, ribs(3)), R=combine(top_band(4, col), ribs(3)), roof=False)
    # a shallow pitched roof along u
    vm = (v0 + v1) / 2
    c.poly([(u0, v1, h), (u1, v1, h), (u1, vm, h + 6), (u0, vm, h + 6)], (176, 182, 192))
    c.poly([(u1, v1, h), (u1, v0, h), (u1, vm, h + 6)], shade((196, 200, 206), 0.72))
    c.line((u0, vm, h + 6), (u1, vm, h + 6), shade((176, 182, 192), 1.2))
    for kk in range(1, 4):
        a = u0 + kk * (u1 - u0) / 4
        c.poly([(a - 0.12, v1 - 0.05, h + 1), (a + 0.12, v1 - 0.05, h + 1), (a + 0.12, vm + 0.12, h + 5), (a - 0.12, vm + 0.12, h + 5)], GLASS_DK)
    if tier >= 2:  # the job board on the right wall: the queue's bars
        screen(c, "R", u1, v0 + 0.15, v1 - 0.15, 5, h - 6, key, ORANGE, kind="bars")
    # the queue of crates on the forecourt (and up the side as it grows)
    spots = [(0.95 + k * 0.42, 2.58) for k in range(5)] + [(2.55, 1.0), (2.55, 0.55), (2.1, 1.0)]
    n = 2 + 2 * tier
    for i, (u, v) in sorted(enumerate(spots[:n]), key=lambda t: t[1][0] + t[1][1]):
        crate(c, u, v, 0, QUEUE[0] if i >= tier else QUEUE[1] if i == tier - 1 else QUEUE[2])
    # a queue line painted on the ground
    c.line((0.85, 2.98, 0), (2.95, 2.98, 0), (255, 214, 60))
    if tier >= 3:  # forklift
        fu, fv = 0.35, 2.45
        prism(c, fu, fv, fu + 0.35, fv + 0.28, 1, 7, ORANGE, rim=0)
        prism(c, fu + 0.05, fv + 0.04, fu + 0.22, fv + 0.24, 7, 12, NAVY, L=glass(key + "fk", bay=3, floor=5, p=0.6, lo=1), rim=0, ao=False)
        prism(c, fu + 0.35, fv + 0.02, fu + 0.4, fv + 0.26, 0, 15, STEEL_D, rim=0, ao=False)
        crate(c, fu + 0.42, fv - 0.02, 2, QUEUE[1], s=0.28, h=5)
        for wu in (fu + 0.08, fu + 0.28):
            x, y = c.P(wu, fv + 0.28, 1)
            c.d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(CHAR))
    if tier >= 4:
        for u in (u0 + 0.1, u1 - 0.1):
            x, y = c.P(u, v1, h - 2)
            c.d.rectangle((x - 2, y - 1, x + 1, y + 1), fill=A(STEEL))
            c.ld.polygon([(x - 2, y + 1), (x + 2, y + 1), (x + 7, y + 14), (x - 7, y + 14)], fill=A(LIT, 90))
        beacon(c, u1 - 0.1, v0 + 0.1, h + 3)
    return c


def tw_batch(tier, k):
    """Stacked job-queue floors: a broad slab in three setbacks, every floor banded grey (waiting), orange (running)
    or green (done) as the queue works through, and a gantry crane on the roof lifting the next job in."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=44)
    podium(c, 0.05, 0.25, 1.65, 1.45, 10, (110, 118, 134), k, accent=ORANGE)
    fl = 8
    done_to = int(hv(k, "d") * 3) + 3

    def queue_floor(off):
        def g(i, n, z, hh, b, s):
            f = (z + off) // fl
            if (z + off) % fl in (0, 1, 2):
                q = QUEUE[2] if f < done_to else QUEUE[1] if f < done_to + 2 else QUEUE[0]
                return shade(q, SIDE_[s]), (ORANGE if q == ORANGE else None)
            return None
        return g

    stages = [(0.1, 0.3, 1.6, 1.4, 0.45), (0.25, 0.45, 1.45, 1.25, 0.75), (0.45, 0.6, 1.25, 1.1, 1.0)]
    z = 10
    for si, (u0, v0, u1, v1, f) in enumerate(stages):
        z1 = 10 + round((top_z - 10) * f / fl) * fl if f < 1 else top_z
        sh = combine(top_band(2, CHAR), queue_floor(z - 10), glass(k + str(si), bay=6, floor=fl, p=0.45, frame=(90, 98, 114), palette=DARK_GLASS))
        prism(c, u0, v0, u1, v1, z, z1, (96, 104, 120), L=sh, R=combine(top_band(2, CHAR), queue_floor(z - 10), louvres(2, 0.8)), ao=False, zref=z, href=z1 - z)
        z = z1
    # the gantry crane on the roof: two A-frames, a beam along u and a crate on the hook
    gh = 14 + 2 * (tier - 2)
    for u in (0.5, 1.2):
        x, y = c.P(u, CV, z)
        c.d.line([(x - 4, y + 2), (x, y - gh)], fill=A(ORANGE), width=2)
        c.d.line([(x + 4, y - 2), (x, y - gh)], fill=A(ORANGE_D), width=2)
    prism(c, 0.4, CV - 0.04, 1.3, CV + 0.04, z + gh, z + gh + 3, ORANGE, rim=0, ao=False)
    x, y = c.P(1.05, CV, z + gh)
    c.d.line([(x, y), (x, y + 7)], fill=A(NAVY_D))
    crate(c, 0.92, CV - 0.13, z + gh - 15, QUEUE[1], s=0.26, h=5)
    tip(c, CU, CV, z + gh + 3, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


from services.kit import SIDE as SIDE_  # noqa: E402


# ── Lightsail ─────────────────────────────────────────────────────────────────────────────────────────────────────

def sail(c, xm, yb, yt, w, col=WHITE, lit=False, side=1):
    """A sail in screen space: luff on the mast at x = xm from yb up to yt, the leech bellying out by w px to one
    side, seams across it, the foot on a boom."""
    pts = [(xm, yt)]
    hgt = yb - yt
    for k in range(1, 21):
        t = k / 20
        x = xm + side * (w * t ** 0.85 + 3 * math.sin(math.pi * t))
        pts.append((round(x), round(yt + hgt * t)))
    pts.append((xm, yb))
    c.d.polygon(pts, fill=A(shade(col, 0.96)))
    # shade toward the leech, seams
    for y in range(yt, yb, 6):
        t = (y - yt) / max(1, hgt)
        xe = xm + side * (w * t ** 0.85 + 3 * math.sin(math.pi * t))
        c.d.line([(xm + side, y + 2), (round(xe) - side, y)], fill=A(shade(col, 0.84)))
        if lit:
            c.ld.point([(xm + side * 2, y + 2)], fill=A(LIT_COOL_))
    c.d.line(pts[1:-1], fill=A(shade(col, 0.74)))
    c.d.line([(xm, yb), (pts[-2][0], yb)], fill=A(STEEL_D), width=2)


from services.kit import LIT_COOL as LIT_COOL_  # noqa: E402


def lm_lightsail(fw, fh, tier, col, key):
    """Lightsail Harbour Office: a small white office on the quay under two sail-cloth roofs (a ready-made server,
    simple to set up), a little sailboat on the water from tier 2, a jetty from 3, lights along it at 4."""
    c = Kit(fw, fh, 76)
    water_strip(c, 0.0, 2.3, 3.0, 3.0, key)
    quay(c, 0.0, 0.0, 3.0, 2.3)
    u0, v0, u1, v1 = 1.65, 1.05, 2.8, 2.05
    h = 12 + 2 * tier
    podium(c, u0, v0, u1, v1, h, WHITE, key, accent=col, R=combine(top_band(2, (50, 108, 229)), punched(key + "lr", bay=6, floor=h, ww=3, wh=4, lo=2)))
    # two sail-cloth roofs, peaks on the street side
    for i, (a, b, cc) in enumerate(((u0 - 0.05, (u0 + u1) / 2 + 0.05, WHITE), ((u0 + u1) / 2 - 0.05, u1 + 0.05, col))):
        pk = (a + 0.15, v1 + 0.05, h + 16 + 2 * tier)
        c.poly([(a, v0 - 0.05, h), (b, v0 - 0.05, h), pk], shade(cc, 0.86))
        c.poly([(b, v0 - 0.05, h), (b, v1 + 0.05, h), pk], shade(cc, 0.72))
        c.poly([(a, v1 + 0.05, h), (b, v1 + 0.05, h), pk], shade(cc, 1.02))
        c.line((a, v1 + 0.05, h), pk, shade(cc, 1.15))
        c.line((b, v1 + 0.05, h), pk, STEEL_D)
    # the quayside sign
    x, y = c.P(1.3, 2.15, 3)
    c.d.rectangle((x - 1, y - 12, x, y), fill=A(WOOD_D))
    c.d.rectangle((x - 7, y - 18, x + 6, y - 11), fill=A((50, 108, 229)))
    c.ld.rectangle((x - 6, y - 17, x + 5, y - 12), fill=A(LIT, 120))
    if tier >= 3:  # a jetty out over the water
        prism(c, 0.5, 2.3, 0.85, 2.95, 1, 3, WOOD, L=ribs(3, 1.1, 0.85), rim=0, ao=False)
    if tier >= 2:  # a sailboat
        bu0, bu1, bv0, bv1 = 1.15, 2.05, 2.5, 2.82
        prism(c, bu0, bv0, bu1, bv1, 0, 4, WHITE, L=bands([(1, 2, col)]), roofcol=WOOD, rim=0.03)
        c.poly([(bu1, bv0, 0), (bu1 + 0.22, (bv0 + bv1) / 2, 2), (bu1 + 0.22, (bv0 + bv1) / 2, 4), (bu1, bv1, 4), (bu1, bv1, 0)], shade(WHITE, 0.78))
        x, y = c.P(bu0 + 0.35, (bv0 + bv1) / 2, 4)
        c.d.line([(x, y), (x, y - 28 - 2 * tier)], fill=A(STEEL_D))
        sail(c, x + 1, y - 4, y - 27 - 2 * tier, 14, lit=tier >= 4)
    if tier >= 4:
        for kk in range(4):
            x, y = c.P(0.52 + kk * 0.1, 2.32 + kk * 0.2, 6)
            c.d.point([(x, y)], fill=A(LIT))
            c.ld.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(LIT, 160))
        beacon(c, 0.85, 2.95, 8)
    return c


def tw_lightsail(tier, k):
    """A slim mast with a sail: a narrow glass shaft on a round plinth, a great white sail set from it and bellied
    toward the street, a boom at its foot, a crow's nest near the top."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=36)
    drum_shadow(c, CU, CV, 0.5)
    drum(c, CU, CV, 0, 9, 0.5, STONE, shader=rib_shader(14, hoops=(7,)))
    hw = 0.17
    sh = combine(lambda i, n, z, hh, b, s: ((shade((50, 108, 229), 0.95 if s == "L" else 0.75), None) if z % 18 == 0 else None),
                 glass(k, bay=4, floor=6, p=0.5, per_floor=True))
    prism(c, CU - hw, CV - hw, CU + hw, CV + hw, 9, top_z, (226, 230, 236), L=sh, R=sh, ao=False)
    # the sail, set from the mast's right edge
    xm, yb = c.P(CU + hw, CV - hw, 18)
    yt = c.P(CU, CV, top_z - 6)[1]
    sail(c, xm, yb, yt, 30 + 6 * (tier - 2), lit=tier >= 3)
    # the crow's nest
    drum(c, CU, CV, top_z, top_z + 4, 0.26, (50, 108, 229), ao=False)
    tip(c, CU, CV, top_z + 4, h=12 + 4 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c
