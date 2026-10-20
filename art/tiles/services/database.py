"""
Database Row (dynamodb rds aurora elasticache redshift neptune opensearch documentdb): front buildings lm_<id> and towers tw_<id> (see
services/__init__.py). Front buildings keep their metaphors: the DynamoDB library with its reading-room dome and bolt,
the RDS records hall with its disk stacks, the Aurora observatory under its ribbon, the ElastiCache café, the Redshift
warehouse and the Neptune garden of nodes. Towers say what the service does: a twisting stack of floors (DynamoDB),
a banded disk cylinder with its replicas (RDS), a glass shaft with aurora fins (Aurora), a zig-zag lightning tower
(ElastiCache), bar-chart setbacks with columnar glass (Redshift) and a mast of nodes joined by edges (Neptune).
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, DARK_GLASS, GLASS_DK, GLASS_L, LED, LIT, LIT_COOL, RED, STEEL, STEEL_D,  # noqa: F401
                          STEEL_M, STONE, Kit, A, beacon, bands, combine, drum, drum_shadow, ellipse, face, glass, ground_shadow,
                          hv, leds, louvres, masonry, plant, podium, prism, punched, rib_shader, ribbon_shader, ribs, solid, tip,
                          top_band, tone)
from services.compute import CU, CV, H, canvas  # noqa: F401

PURPLE = (201, 37, 209)  # the district colour (towers get no col)
PURPLE_L = (222, 150, 230)
PURPLE_D = (120, 34, 132)
YELLOW = (255, 214, 60)
TEAL = (40, 200, 190)
RS_RED = (214, 52, 60)
BOOKS = [(200, 70, 60), (58, 111, 216), (60, 150, 90), ORANGE, PURPLE_L]
LAWN = (96, 170, 84)
HEDGE = (54, 128, 64)
VIOLET_GLASS = {"L": ((62, 52, 108), (78, 70, 134), (104, 98, 166)), "R": ((42, 34, 80), (54, 46, 100), (72, 66, 128))}
AURORA = [(80, 236, 160), (60, 210, 230), (150, 120, 250), (220, 110, 240)]


def bolt(c, x, y, s, col, lit=False):
    """A lightning bolt centred at screen (x, y), s px about half its height."""
    pts = [(x + s // 3 + 1, y - s), (x - s // 2, y + 1), (x, y + 1), (x - s // 3 - 1, y + s), (x + s // 2, y - 1), (x, y - 1)]
    c.d.polygon(pts, fill=A(col))
    c.d.line(pts[:2], fill=A(shade(col, 1.15)))
    c.ld.polygon(pts, fill=A(col) if lit else (0, 0, 0, 0))


def orb(c, x, y, r, col, glow=None):
    """A shaded sphere in screen space (sun from the upper left), its highlight a small glint; glow lights it at night."""
    lx, ly, lz = -0.5, -0.55, 0.67
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            q = (dx * dx + dy * dy) / (r * r + r * 0.6)
            if q > 1:
                continue
            nz = math.sqrt(max(0.0, 1 - q))
            d = (dx / r) * lx + (dy / r) * ly + nz * lz
            f = round(max(0.62, min(1.04, 0.5 + 0.55 * d)) * 12) / 12
            px = shade(col, f)
            if d > 0.9 and r >= 3:
                px = shade(col, 1.35)
            c.put(x + dx, y + dy, px, A(glow, 210) if glow else None)


def aurora_col(t):
    t = max(0.0, min(0.999, t)) * (len(AURORA) - 1)
    k = int(t)
    a, b = AURORA[k], AURORA[k + 1]
    f = t - k
    return tuple(round(a[i] * (1 - f) + b[i] * f) for i in range(3))


# ── twisting floors ───────────────────────────────────────────────────────────────────────────────────────────────

def twist_floor(c, cu, cv, half, ang, z0, z1, col, shader=None, roof=True):
    """A square floor rotated by `ang` round (cu, cv), painted pixel by pixel so its faces take kit shaders (the
    side is 'L' for faces turned toward +v, 'R' toward +u); the roof on top."""
    pts = []
    for k in range(4):
        a = ang + math.pi / 4 + k * math.pi / 2
        pts.append((cu + math.cos(a) * half * math.sqrt(2), cv + math.sin(a) * half * math.sqrt(2)))
    faces = []
    for k in range(4):
        (ua, va), (ub, vb) = pts[k], pts[(k + 1) % 4]
        nu, nv = (vb - va), -(ub - ua)
        ln = math.hypot(nu, nv) or 1
        nu, nv = nu / ln, nv / ln
        if nu + nv > 0.02:
            f = 0.612 + 0.4 * max(0.0, nu * 0.27 + nv * 0.72)
            faces.append(((ua + ub + va + vb) / 2, (ua, va), (ub, vb), f, "L" if nv >= nu else "R"))
    h = z1 - z0
    for _, (ua, va), (ub, vb), f, side in sorted(faces):
        xa, ya = c.Pf(ua, va, 0)
        xb, yb = c.Pf(ub, vb, 0)
        if xb < xa:
            xa, ya, xb, yb = xb, yb, xa, ya
        x0, x1 = round(xa), round(xb)
        n = x1 - x0
        base = shade(col, f)
        for i in range(n):
            x = x0 + i
            t = (x + 0.5 - xa) / max(0.01, xb - xa)
            ybase = ya + (yb - ya) * t
            ybot, ytop = round(ybase - z0), round(ybase - z1)
            for y in range(ytop, ybot):
                z = ybot - 1 - y
                r = shader(i, n, z, h, base, side) if shader else None
                px, lit = r if r is not None else (base, None)
                if side == "L" and i == n - 1 and lit is None:
                    px = shade(px, 1.08)
                c.put(x, y, px, lit)
    if roof:
        c.poly([(u, v, z1) for u, v in pts], shade(col, 1.04))
    return pts


# ── DynamoDB ──────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_dynamodb(fw, fh, tier, col, key):
    """DynamoDB Library: a stone library with a reading-room dome in the district purple, a columned portico whose
    pediment carries a lightning bolt (items fetched in a flash); a lantern from tier 2, book-stack wings from 3, a
    second wing and a lightning rod at 4."""
    c = Kit(fw, fh, 90)
    u0, v0, u1, v1 = 1.0, 1.5, 2.8, 2.35
    h = 14 + 3 * tier
    stone = (214, 206, 192)
    if tier >= 3:  # the book-stack wing behind, on the right: shelves of coloured spines behind tall glass
        a0, b0, a1, b1 = 1.95, 0.75, 2.75, 1.5

        def books(i, n, z, hh, b, s, kk=key):
            if 2 <= z < hh - 4 and 0 < i < n - 1:
                if (z - 2) % 6 == 5 or i % 7 == 0:
                    return shade(WOOD_D, 0.8 if s == "L" else 0.65), None
                bc = BOOKS[int(hv(kk, i // 2, (z - 2) // 6) * len(BOOKS))]
                lit = LIT if hv(kk, "l", i // 7, (z - 2) // 6) < 0.5 else None
                return shade(bc, 0.9 if s == "L" else 0.72), lit
            return None
        ground_shadow(c, a0, b0, a1, b1)
        prism(c, a0, b0, a1, b1, 0, h - 3, stone, L=combine(top_band(2, col), books), R=combine(top_band(2, col), books))
    if tier >= 4:  # a second wing on the left
        a0, b0, a1, b1 = 0.25, 1.75, 0.9, 2.6
        ground_shadow(c, a0, b0, a1, b1)
        prism(c, a0, b0, a1, b1, 0, h - 3, stone, L=combine(top_band(2, col), punched(key + "w2", bay=6, floor=7, ww=2, wh=4, p=0.6, lo=2), masonry(4, 6, 0.9)),
              R=combine(top_band(2, col), masonry(4, 6, 0.9)))
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, 0, 2, STONE, rim=0)
    tall = punched(key, bay=7, floor=h, ww=3, wh=h - 9, p=0.65, lo=2)
    prism(c, u0, v0, u1, v1, 2, h, stone, L=combine(top_band(3, col), tall, masonry(4, 6, 0.9)),
          R=combine(top_band(3, col), punched(key + "r", bay=7, floor=h, ww=3, wh=h - 9, p=0.65, lo=2), masonry(4, 6, 0.9)), ao=False)
    # the reading room: a windowed drum and a ribbed purple dome
    du, dv = (u0 + u1) / 2 + 0.05, (v0 + v1) / 2 - 0.05
    rd = 0.36 + 0.03 * tier
    dh = 5 + tier
    drum(c, du, dv, h, h + dh, rd, stone, shader=ribbon_shader(key + "d", floor=dh + 2, win=dh - 3, p=0.8), ao=False)
    dome_h = 9 + 2 * tier
    drum(c, du, dv, h + dh, h + dh + dome_h, rd, col, profile=lambda t: (rd + 0.02) * math.sqrt(max(0.0, 1 - t * t)) + 0.03,
         shader=rib_shader(10, lo=0.86, hi=1.1), cap=False, ao=False)
    z = h + dh + dome_h
    if tier >= 2:  # the lantern
        drum(c, du, dv, z - 1, z + 4, 0.08, (255, 226, 140), shader=lambda th, zz, hh, b: (b, LIT), ao=False, capcol=shade(col, 0.8))
        z += 4
    if tier >= 4:  # the lightning rod
        x, y = c.P(du, dv, z)
        c.d.line([(x, y), (x, y - 9)], fill=A(STEEL_M))
        c.d.point([(x, y - 10)], fill=A(YELLOW))
        c.ld.ellipse((x - 2, y - 12, x + 2, y - 8), fill=A(YELLOW))
    # the portico on the street face: steps, columns, entablature, pediment with the bolt
    m = (u0 + u1) / 2
    w = 0.42 + 0.1 * min(tier, 3)
    pv = v1 + 0.3
    prism(c, m - w - 0.08, v1, m + w + 0.08, pv + 0.12, 0, 3, STONE, R=combine(louvres(2, 0.86)), rim=0)
    face(c, "L", v1, m - 0.14, m + 0.14, 3, 12, NAVY_D, lambda i, n, zz, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and zz < hh - 1 else None), ao=False)
    n = 3 + min(tier, 3)
    for k in range(n):
        a = m - w + k * (2 * w - 0.08) / (n - 1)
        prism(c, a, pv - 0.08, a + 0.08, pv, 3, h - 2, WHITE, L=ribs(2, 1.06, 0.9), rim=0, ao=False)
    prism(c, m - w - 0.05, v1, m + w + 0.05, pv + 0.02, h - 2, h + 1, shade(stone, 1.04), L=combine(bands([(1, 2, col)])), ao=False, rim=0)
    ap = h + 9 + tier
    c.poly([(m - w - 0.05, pv + 0.02, h + 1), (m + w + 0.05, pv + 0.02, h + 1), (m, pv + 0.02, ap)], shade(stone, 1.0))
    c.poly([(m - w + 0.1, pv + 0.02, h + 2), (m + w - 0.1, pv + 0.02, h + 2), (m, pv + 0.02, ap - 2)], col)
    c.poly([(m - w - 0.05, pv + 0.02, h + 1), (m, pv + 0.02, ap), (m, pv - 0.3, ap), (m - w - 0.05, v1, h + 1)], shade(stone, 1.08))
    x, y = c.P(m, pv + 0.02, h + 4 + tier // 2)
    bolt(c, x, y - 1, 2 + tier // 2, YELLOW, lit=tier >= 2)
    return c


def tw_dynamodb(tier, k):
    """A twisting stack of floors: square glass floors between purple floor plates, each turned a little further
    than the one below (partitions spread round the key), tapering near the top to a crown and the tip."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    podium(c, 0.25, 0.25, 1.45, 1.45, 12, (210, 202, 190), k, accent=PURPLE)
    z, j = 12, 0
    floor = 7
    nfl = (top_z - 12) // floor
    sh = glass(k, bay=5, floor=floor, p=0.5, refl=False)
    while z + floor <= top_z:
        f = j / max(1, nfl - 1)
        half = 0.5 - 0.14 * max(0.0, f - 0.75) * 4
        ang = j * (1.5 / max(1, nfl))
        twist_floor(c, CU, CV, half, ang, z, z + floor - 2, (200, 210, 224), shader=lambda i, n, zz, hh, b, s, j=j: sh(i, n, zz + j * floor, top_z - 12, b, s), roof=False)
        twist_floor(c, CU, CV, half + 0.06, ang, z + floor - 2, z + floor, PURPLE_L if j % 4 else PURPLE)
        z += floor
        j += 1
    # the crown: a purple drum with lit ring, then the tip
    drum(c, CU, CV, z, z + 6, 0.24, PURPLE, shader=lambda th, zz, hh, b: ((LIT, LIT) if zz == 3 else None), ao=False)
    tip(c, CU, CV, z + 6, h=10 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── RDS ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def disk(c, u, v, z0, n, r, col, key, seg=5):
    """A stack of database disks (the icon's cylinder): each a drum with a lit rim and a status light."""
    z = z0
    for s in range(n):
        drum(c, u, v, z, z + seg, r, col, shader=rib_shader(1, hoops=(seg - 1,), hoop=1.2), capcol=shade(col, 1.1), ao=z <= 1)
        x, y = c.P(u, v + r, z + 2)
        on = hv(key, s) < 0.7
        c.put(x - 1, y, LED if on else shade(LED, 0.4), LED if on else None)
        z += seg + 1
    return c.P(u, v, z)


def lm_rds(fw, fh, tier, col, key):
    """RDS Records Hall: a stone hall of record behind a columned portico (relational tables kept in order), the
    disk stacks in its yard: a primary that grows, a read replica from tier 3, a Multi-AZ standby joined by lit sync
    lines at 4. Rooftop plant from tier 2, a set-back attic storey from 3."""
    c = Kit(fw, fh, 80)
    stone = (216, 210, 198)
    blue = (70, 110, 210)
    # the disks in the yard (right), back to front
    tops = {}
    if tier >= 3:
        tops["r"] = disk(c, 2.45, 0.6, 0, tier - 1, 0.24, col, key + "r")
    tops["p"] = disk(c, 2.45, 1.55, 0, 1 + min(tier, 3), 0.3, blue, key + "p")
    if tier >= 4:
        tops["s"] = disk(c, 2.6, 2.6, 0, 2, 0.22, CON_M, key + "s")
        for a, b in (("p", "r"), ("p", "s")):
            c.d.line([tops[a], tops[b]], fill=A(ORANGE))
            c.ld.line([tops[a], tops[b]], fill=A(ORANGE))
    u0, v0, u1, v1 = 0.25, 1.6, 1.95, 2.45
    h = 15 + 4 * tier
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, 0, 2, STONE, rim=0)
    win = punched(key, bay=6, floor=8, ww=3, wh=4, p=0.6, lo=1)
    prism(c, u0, v0, u1, v1, 2, h, stone, L=combine(top_band(3, col), win, masonry(4, 8, 0.92)),
          R=combine(top_band(3, col), punched(key + "r", bay=6, floor=8, ww=3, wh=4, p=0.6, lo=1), masonry(4, 8, 0.92)), ao=False)
    z = h
    if tier >= 3:  # the attic storey, set back
        a0, b0, a1, b1 = u0 + 0.3, v0 + 0.15, u1 - 0.3, v1 - 0.3
        prism(c, a0, b0, a1, b1, z, z + 9, shade(stone, 0.96), L=combine(top_band(2, col), punched(key + "a", bay=6, floor=9, ww=3, wh=4, p=0.6, lo=1)),
              R=combine(top_band(2, col), punched(key + "ar", bay=6, floor=9, ww=3, wh=4, p=0.6, lo=1)), ao=False)
        if tier >= 4:
            plant(c, a0, b0, a1, b1, z + 9, key + "p", n=1)
    elif tier >= 2:
        plant(c, u0 + 0.1, v0 + 0.1, u1 - 0.1, v1 - 0.3, z, key + "p", n=2)
    # the portico: steps, columns, entablature and (from tier 3) a pediment
    m = (u0 + u1) / 2
    pv = v1 + 0.24
    prism(c, u0 + 0.1, v1, u1 - 0.1, pv + 0.14, 0, 3 if tier >= 2 else 2, STONE, R=combine(louvres(2, 0.86)), rim=0)
    face(c, "L", v1, m - 0.14, m + 0.14, 3, 12, NAVY_D, lambda i, n, zz, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and zz < hh - 1 else None), ao=False)
    n = 4 + min(tier, 3)
    for kk in range(n):
        a = u0 + 0.14 + kk * (u1 - u0 - 0.36) / (n - 1)
        prism(c, a, pv - 0.08, a + 0.08, pv, 3, h - 3, WHITE, L=ribs(2, 1.06, 0.9), rim=0, ao=False)
    prism(c, u0 + 0.06, v1, u1 - 0.06, pv + 0.02, h - 3, h + 1, shade(stone, 1.04), L=combine(bands([(1, 2, col)])), ao=False, rim=0)
    if tier >= 3:
        c.poly([(u0 + 0.06, pv + 0.02, h + 1), (u1 - 0.06, pv + 0.02, h + 1), (m, pv + 0.02, h + 8)], stone)
        c.poly([(u0 + 0.3, pv + 0.02, h + 2), (u1 - 0.3, pv + 0.02, h + 2), (m, pv + 0.02, h + 6)], shade(col, 0.85))
    return c


def tw_rds(tier, k):
    """A banded disk cylinder: a round tower built of stacked database disks, each a glass drum ringed with ribbon
    windows under a broad purple rim; a read replica tower from tier 3 and a Multi-AZ standby at 4, joined to it by
    lit sync bridges."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    body = (214, 220, 232)

    def stack(u, v, r, z_top, kk, nseg):
        drum_shadow(c, u, v, r + 0.1)
        drum(c, u, v, 0, 8, r + 0.1, STONE, shader=rib_shader(14, hoops=(6,)))
        seg = (z_top - 8) // nseg
        z = 8
        for s in range(nseg):
            drum(c, u, v, z, z + seg - 3, r, body, shader=ribbon_shader(kk + str(s), floor=6, win=3, p=0.55, glass_col=GLASS_L, spandrel=(196, 204, 220)), ao=False, cap=False)
            drum(c, u, v, z + seg - 3, z + seg, r + 0.07, PURPLE if s % 2 == 0 else PURPLE_L, shader=rib_shader(1, hoops=(1,), hoop=1.15), ao=False, cap=s == nseg - 1)
            z += seg
        return z
    nseg = {2: 3, 3: 4, 4: 6}[tier]
    reps = []
    if tier >= 3:
        reps.append((0.22, 1.5, top_z * 0.55, 3))
    if tier >= 4:
        reps.append((1.5, 0.22, top_z * 0.45, 2))
    for (u, v, zt, ns) in reps:
        zr = stack(u, v, 0.28, round(zt), k + f"rep{u}", ns)
        ellipse(c, u, v, zr, 0.2, shade(PURPLE, 0.9))
    z = stack(CU, CV, 0.5, top_z, k, nseg)
    # the domed cap (the icon's top) and the tip
    drum(c, CU, CV, z, z + 6, 0.5, PURPLE_L, profile=lambda t: 0.5 * math.sqrt(max(0.0, 1 - t * t)) + 0.08, cap=False, ao=False)
    for (u, v, zt, ns) in reps:  # the sync bridges, lit
        zb = round(zt) - 14
        x0, y0 = c.P(u, v, zb)
        x1, y1 = c.P(CU, CV, zb)
        x1 += -12 if x0 < x1 else 12
        c.d.line([(x0, y0), (x1, y1)], fill=A(STEEL_D), width=3)
        c.d.line([(x0, y0 - 1), (x1, y1 - 1)], fill=A(ORANGE))
        c.ld.line([(x0, y0 - 1), (x1, y1 - 1)], fill=A(ORANGE))
    tip(c, CU, CV, z + 6, h=10 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Aurora ────────────────────────────────────────────────────────────────────────────────────────────────────────

def ribbon(c, x, y, length, amp, key, tier):
    """The aurora: curtains of light in three colours rising from a wavy base, opaque and lit at night."""
    nb = 1 + (tier >= 2) + (tier >= 3)
    for bi in range(nb):
        for kk in range(length):
            t = kk / length
            xx = x - length // 2 + kk
            yy = y - bi * 4 + round(math.sin(t * math.pi * 2.0 + bi * 1.3 + hv(key) * 3) * amp)
            hh = 3 + round(3 * math.sin(t * math.pi)) + (kk % 4 == 0)
            for d in range(hh):
                col = aurora_col(bi / 3 + d / (hh * 3))
                c.put(xx, yy - d, col, A(col, 220))


def lm_aurora(fw, fh, tier, col, key):
    """Aurora Observatory: a round stone observatory under a silver dome, its slit open and a telescope out, the
    aurora rippling over it (more curtains each tier); a second building from tier 2, replica domes across the
    zones at 3 and 4."""
    c = Kit(fw, fh, 90)
    if tier >= 3:  # replica domes (six copies across three zones)
        for u, v in ((0.45, 2.55), (2.6, 0.5))[: tier - 2]:
            drum_shadow(c, u, v, 0.28)
            drum(c, u, v, 0, 6, 0.26, STONE, shader=rib_shader(8))
            drum(c, u, v, 6, 13, 0.26, STEEL, profile=lambda t: 0.26 * math.sqrt(max(0.0, 1 - t * t)) + 0.02, cap=False, gloss=True, ao=False)
            x, y = c.P(u, v, 10)
            c.put(x, y, NAVY_D, LIT_COOL)
    if tier >= 2:  # the instrument house beside it
        a0, b0, a1, b1 = 2.25, 1.05, 2.85, 1.75
        ground_shadow(c, a0, b0, a1, b1)
        prism(c, a0, b0, a1, b1, 0, 12, (226, 222, 212), L=combine(top_band(2, col), punched(key + "h", bay=6, floor=12, ww=3, wh=4, p=0.7, lo=2)),
              R=combine(top_band(2, col), punched(key + "hr", bay=6, floor=12, ww=3, wh=4, p=0.7, lo=2)))
    du, dv = 1.75, 2.0
    r = 0.68
    bh = 8 + 2 * tier
    drum_shadow(c, du, dv, r + 0.05)
    drum(c, du, dv, 0, bh, r, STONE, shader=ribbon_shader(key, floor=bh, win=4, p=0.7, spandrel=shade(STONE, 0.9)), capcol=shade(STONE, 0.95))
    drum(c, du, dv, bh, bh + 2, r + 0.04, col, ao=False)
    dome = round(r * 22)
    drum(c, du, dv, bh + 2, bh + 2 + dome, r - 0.02, STEEL, profile=lambda t: (r - 0.02) * math.sqrt(max(0.0, 1 - t * t)) + 0.02,
         shader=rib_shader(12, lo=0.9, hi=1.08), cap=False, gloss=True, ao=False)
    # the slit and the telescope
    x, y = c.P(du, dv, bh + 2)
    for yy in range(y - dome + 2, y - 1):
        c.put(x - 1, yy, NAVY_D)
        c.put(x, yy, NAVY_D)
        c.put(x + 1, yy, shade(NAVY_D, 1.4))
    if tier >= 2:
        c.d.line([(x, y - dome // 2), (x + 8, y - dome - 4)], fill=A(STEEL_M), width=3)
        c.d.line([(x, y - dome // 2 - 1), (x + 8, y - dome - 5)], fill=A(STEEL))
        c.put(x + 9, y - dome - 5, LIT, LIT)
    if tier >= 4:
        beacon(c, 0.3, 0.3, 4)
    # the aurora over it
    ribbon(c, x - 10, y - dome - 10, 24 + 5 * tier, 3, key, tier)
    return c


def fins(key):
    """Vertical fins every 4 px in aurora colours (green low, violet high), each glowing at night."""
    def g(i, n, z, h, base, side):
        if i % 3 == 1 and 0 < i < n - 1 and z < h - 3:
            ca = aurora_col(z / h * 0.9 + hv(key, side, i // 3) * 0.1)
            return shade(ca, 1.05 if side == "L" else 0.85), A(ca, 200)
        return None
    return g


def tw_aurora(tier, k):
    """A glass shaft with lit fins in aurora colours, set back twice, crowned with an observatory dome whose slit
    is open (the observatory grown into a tower)."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=50)
    podium(c, 0.3, 0.3, 1.4, 1.4, 12, (214, 210, 200), k, accent=PURPLE)
    steps = [(0.4, 12, top_z if tier == 2 else round(top_z * 0.6))]
    if tier >= 3:
        steps.append((0.31, steps[-1][2], top_z if tier == 3 else round(top_z * 0.85)))
    if tier >= 4:
        steps.append((0.23, steps[-1][2], top_z))
    for i, (half, z0, z1) in enumerate(steps):
        sh = combine(top_band(2, PURPLE_L), fins(k + str(i)), glass(k + str(i), bay=3, floor=5, p=0.3, palette=VIOLET_GLASS, frame=(70, 60, 110)))
        prism(c, CU - half, CV - half, CU + half, CV + half, z0, z1, (70, 60, 110), L=sh, R=sh, ao=False, zref=z0, href=z1 - z0, roofcol=(110, 120, 140))
    z = top_z
    r = 0.26
    drum(c, CU, CV, z, z + 3, r + 0.04, PURPLE, ao=False)
    dome = 9
    drum(c, CU, CV, z + 3, z + 3 + dome, r, STEEL, profile=lambda t: r * math.sqrt(max(0.0, 1 - t * t)) + 0.04, shader=rib_shader(8, lo=0.9, hi=1.08),
         cap=False, gloss=True, ao=False)
    x, y = c.P(CU, CV, z + 3)
    for yy in range(y - dome + 3, y - 1):
        c.put(x + 2, yy, NAVY_D, LIT_COOL)
    tip(c, CU, CV, z + 3 + dome, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── ElastiCache ───────────────────────────────────────────────────────────────────────────────────────────────────

def awning(c, u0, u1, v, z, depth, col, stripes=8):
    for kk in range(stripes):
        a = u0 + kk * (u1 - u0) / stripes
        b = a + (u1 - u0) / stripes
        fill = col if kk % 2 else WHITE
        c.poly([(a, v, z), (b, v, z), (b, v + depth, z - 3), (a, v + depth, z - 3)], fill)
    face(c, "L", v + depth, u0, u1, z - 6, z - 3, col, lambda i, n, zz, h, b, s: (shade(WHITE if (i // 4) % 2 else col, 0.86), None) if zz >= (1 if i % 4 in (1, 2) else 0) else None, ao=False)


def lm_elasticache(fw, fh, tier, col, key):
    """ElastiCache Café: a corner café serving answers in a flash: big lit windows under a striped awning, a giant
    cup with a bolt on the roof, tables out front (one more each tier); an upper floor from tier 2, the bolt lit from
    3, steam at 4."""
    c = Kit(fw, fh, 80)
    cream = (238, 226, 204)
    u0, v0, u1, v1 = 1.1, 1.45, 2.8, 2.25
    h = 14 + 3 * tier
    ground_shadow(c, u0, v0, u1, v1)
    shop = lambda i, n, z, hh, b, s: ((GLASS_L if s == "L" else GLASS_DK, LIT) if 2 <= z < 10 and (i % 9) not in (0, 8) and 0 < i < n - 1 else ((shade(WOOD_D, 0.9), None) if z < 11 and i % 9 in (0, 8) else None))
    upper = punched(key, bay=6, floor=8, ww=3, wh=4, p=0.6, lo=12) if tier >= 2 else None
    prism(c, u0, v0, u1, v1, 0, h, cream, L=combine(top_band(3, col), shop, upper), R=combine(top_band(3, col), shop, upper))
    face(c, "L", v1, u0 + 0.9, u0 + 1.15, 0, 10, WOOD_D, lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 2 and 4 < z else None), ao=False)
    awning(c, u0 - 0.04, u1 + 0.04, v1, 15, 0.35, col, 10)
    # the cup sign on the roof
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    s = 0.2 + 0.02 * tier
    ch = 10 + tier
    drum(c, cu, cv, h, h + ch, s * 0.8, WHITE, r1=s, capcol=(120, 72, 40), ao=False)
    x, y = c.P(cu, cv, h + ch // 2)
    rx = round(s * 22.6)
    c.d.arc((x + rx - 3, y - 4, x + rx + 4, y + 3), 270, 90, fill=A(WHITE), width=2)
    bolt(c, x - 1, y, 4, YELLOW, lit=tier >= 3)
    if tier >= 4:
        xt, yt = c.P(cu, cv, h + ch)
        for kk in range(3):
            c.d.line([(xt - 3 + kk * 3, yt - 3), (xt - 2 + kk * 3, yt - 8 - kk % 2)], fill=A((236, 238, 244)))
    # tables with parasols out front
    for i in range(tier):
        u = 1.25 + i * 0.4
        v = 2.75
        prism(c, u, v - 0.1, u + 0.2, v + 0.1, 0, 5, WOOD_D, rim=0)
        x, y = c.P(u + 0.1, v, 5)
        c.d.line([(x, y), (x, y - 8)], fill=A(STEEL_D))
        pc = col if i % 2 else WHITE
        c.d.polygon([(x - 7, y - 7), (x, y - 11), (x + 7, y - 7)], fill=A(pc))
        c.d.polygon([(x, y - 11), (x + 7, y - 7), (x + 1, y - 7)], fill=A(shade(pc, 0.8)))
    return c


def tw_elasticache(tier, k):
    """A lightning tower: a slim glass shaft whose floors step sideways and back in a zig-zag (a bolt), a lit yellow
    band at every turn, a great bolt standing on its crown (answers from memory, in a flash)."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=56)
    podium(c, 0.35, 0.35, 1.35, 1.35, 10, (226, 222, 214), k, accent=PURPLE)
    half = 0.3
    period = 30
    amp = 0.2
    fl = 3
    sh = combine(glass(k, bay=4, floor=6, p=0.45, frame=(226, 230, 238)))
    z = 10
    while z < top_z:
        ph = ((z - 10) % period) / period
        tri = 1 - abs(2 * ph - 1)  # 0 → 1 → 0 over a period
        s = (tri - 0.5) * 2 * amp
        u, v = CU + s, CV - s
        z1 = min(top_z, z + fl)
        turn = abs(tri - 1) < 1.5 / period * fl or tri < 1.5 / period * fl
        if turn:
            yb = bands([(0, fl, YELLOW)])
            prism(c, u - half - 0.03, v - half - 0.03, u + half + 0.03, v + half + 0.03, z, z1, YELLOW,
                  L=lambda i, n, zz, hh, b, sd: (shade(YELLOW, 1.0 if sd == "L" else 0.8), A(YELLOW, 200)),
                  R=lambda i, n, zz, hh, b, sd: (shade(YELLOW, 0.8), A(YELLOW, 160)), ao=False, rim=0)
        else:
            prism(c, u - half, v - half, u + half, v + half, z, z1, (210, 218, 230), L=sh, R=sh, ao=False, rim=0, zref=10, href=top_z - 10)
        z = z1
    # the crown: a purple cap and a great bolt on a mast
    drum(c, CU, CV, top_z, top_z + 3, 0.26, PURPLE, ao=False)
    s = 7 + 2 * (tier - 2)
    x, y = c.P(CU, CV, top_z + 3)
    c.d.line([(x, y), (x, y - 4)], fill=A(STEEL_D))
    bolt(c, x, y - 4 - s, s, YELLOW, lit=True)
    tip(c, CU, CV, top_z + 3 + 2 + 2 * s, h=10 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Redshift ──────────────────────────────────────────────────────────────────────────────────────────────────────

def columnar(key, glass_col=None):
    """Columnar glazing: narrow glass columns between concrete piers, lit at night up to a seeded height each, so
    the facade reads as a bar chart after dark."""
    def g(i, n, z, h, base, side):
        if z >= h - 3:
            return None
        if i % 3 == 0:
            return shade(base, 1.06), None
        gc = glass_col or ((70, 96, 134) if side == "L" else (46, 64, 96))
        if z % 6 == 5:
            gc = shade(gc, 0.85)
        lit = (LIT if hv(key, side, i // 3) < 0.7 else LIT_COOL) if z < (0.12 + 0.6 * hv(key, "h", side, i // 3)) * h else None
        return gc, lit
    return g


def lm_redshift(fw, fh, tier, col, key):
    """Redshift Warehouse: a high-bay warehouse with red bands, loading docks and a glass bay showing columnar
    shelving that rises like a bar chart; a truck at the dock from tier 2, a bar-chart sign on the roof from 3, lit at 4."""
    c = Kit(fw, fh, 80)
    u0, v0, u1, v1 = 0.25, 1.6, 2.8, 2.5
    h = 14 + 3 * tier
    ground_shadow(c, u0, v0, u1, v1)
    nb = 1 + (tier >= 2) + (tier >= 4)
    red = bands([(h - 5 - 4 * kk, h - 3 - 4 * kk, RS_RED) for kk in range(nb)])
    docks = lambda i, n, z, hh, b, s: (((shade(CON_D, 0.9 if z % 2 else 0.78), None) if z < 10 and (i % 26) in range(4, 20) and i < n * 0.5 else None))

    def shelves(i, n, z, hh, b, s):
        if i < n * 0.55 or i >= n - 2 or z < 2 or z >= hh - 5 - 4 * nb:
            return None
        if i % 4 == 0 or z % 5 == 4:
            return shade(NAVY_D, 1.2), None
        top_ = 4 + hv(key, i // 4) * (hh - 10 - 4 * nb)
        if z < top_:
            bc = BOOKS[int(hv(key, "c", i // 4, z // 5) * len(BOOKS))]
            return shade(bc, 0.85), LIT
        return (GLASS_DK, None)
    prism(c, u0, v0, u1, v1, 0, h, CON_L, L=combine(top_band(2, RS_RED), red, shelves, docks, ribs(3, 1.06, 0.88)),
          R=combine(top_band(2, RS_RED), red, punched(key + "r", bay=6, floor=h, ww=3, wh=3, p=0.6, lo=h - 10), ribs(3, 1.06, 0.88)))
    # roof lights
    for kk in range(3):
        a = u0 + 0.2 + kk * 0.5
        prism(c, a, v0 + 0.2, a + 0.3, v1 - 0.2, h, h + 3, GLASS_L, L=glass(key + f"s{kk}", bay=3, floor=3, p=0.5), ao=False, rim=0)
    if tier >= 2:  # a truck at the dock
        a = u0 + 0.15
        prism(c, a, v1 + 0.08, a + 0.75, v1 + 0.36, 0, 9, WHITE, L=combine(bands([(4, 6, RS_RED)])))
        prism(c, a + 0.75, v1 + 0.1, a + 1.0, v1 + 0.36, 0, 7, RS_RED, L=combine(lambda i, n, z, hh, b, s: (GLASS_L, LIT) if z >= 4 and i > 1 else None))
        for wu in (a + 0.15, a + 0.85):
            x, y = c.P(wu, v1 + 0.36, 1)
            c.d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(CHAR))
    if tier >= 3:  # the bar-chart sign
        heights = [6, 10, 14, 9, 17][: tier + 1]
        for i, hh in enumerate(heights):
            u = u1 - 1.05 + i * 0.2
            cc = [RS_RED, col, ORANGE, (58, 111, 216), RS_RED][i]
            prism(c, u, v0 + 0.35, u + 0.14, v0 + 0.5, h, h + hh, cc, ao=False, rim=0,
                  L=(lambda i_, n, z, hh_, b, s, cc=cc: (shade(cc, 0.9), A(cc, 200))) if tier >= 4 else None)
    return c


def tw_redshift(tier, k):
    """Bar-chart setbacks: a stepped tower of columnar glass bars round a tall central bar, each bar a different
    height (a chart of the warehouse's columns), a red stripe at every bar's top; at night each column's lights rise
    to a different height."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    concrete = (196, 200, 208)
    podium(c, 0.1, 0.1, 1.62, 1.62, 12, (176, 182, 192), k, accent=RS_RED)
    a, b = CU - 0.28, CU + 0.28
    bars = [  # (u0, v0, u1, v1, height fraction)
        (0.18, a, a, b, 0.7), (a, 0.18, b, a, 0.8),  # back
        (0.18, 0.18, a, a, 0.56),
        (b, a, 1.55, b, 0.5), (a, b, b, 1.55, 0.36),  # front-right and front-left
        (b, 0.18, 1.55, a, 0.66), (0.18, b, a, 1.55, 0.46),
        (b, b, 1.5, 1.5, 0.18),
        (a, a, b, b, 1.0),
    ]
    if tier == 2:
        bars = [bb[:4] + (max(0.5, bb[4]),) for bb in bars]
    for i, (u0, v0, u1, v1, f) in sorted(enumerate(bars), key=lambda t: (t[1][0] + t[1][2] + t[1][1] + t[1][3], t[1][4])):
        z1 = 12 + round((top_z - 12) * f)
        if (u0, v0) == (a, a):
            continue
        sh = combine(top_band(4, RS_RED), columnar(k + str(i)))
        prism(c, u0, v0, u1, v1, 12, z1, concrete, L=sh, R=sh, ao=False, roofcol=shade(RS_RED, 0.9))
    sh = combine(top_band(4, RS_RED), columnar(k + "c"))
    prism(c, a, a, b, b, 12, top_z, concrete, L=sh, R=sh, ao=False, roofcol=RS_RED)
    prism(c, a + 0.1, a + 0.1, b - 0.1, b - 0.1, top_z, top_z + 6, CHAR, L=combine(louvres(2, 0.8)), R=combine(louvres(2, 0.8)), ao=False)
    tip(c, CU, CV, top_z + 6, h=12 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Neptune ───────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_neptune(fw, fh, tier, col, key):
    """Neptune Web: a hedged garden of glowing nodes on posts joined by a web of edges (a graph), a trident statue
    on a plinth at its heart; more nodes and edges each tier, the edges lit from 2, the trident glowing at 4."""
    c = Kit(fw, fh, 80)
    c.poly([(0.05, 0.05, 0), (2.95, 0.05, 0), (2.95, 2.95, 0), (0.05, 2.95, 0)], LAWN)
    for kk in range(30):
        x, y = c.P(0.1 + hv(key[:-1], "g", kk) * 2.8, 0.1 + hv(key[:-1], "h", kk) * 2.8, 0)
        c.d.point([(x, y)], fill=A(shade(LAWN, 0.82)))
    # gravel paths to the plinth
    c.poly([(1.75, 1.9, 0), (2.05, 1.9, 0), (2.05, 2.95, 0), (1.75, 2.95, 0)], (214, 204, 182))
    c.poly([(1.9, 1.75, 0), (2.95, 1.75, 0), (2.95, 2.05, 0), (1.9, 2.05, 0)], (214, 204, 182))
    hedge = lambda u0, v0, u1, v1: prism(c, u0, v0, u1, v1, 0, 6, HEDGE, L=combine(lambda i, n, z, hh, b, s: (shade(HEDGE, 1.15), None) if (i * 7 + z * 3) % 11 == 0 else None), roofcol=shade(HEDGE, 1.1), rim=0)
    hedge(2.75, 0.05, 2.95, 1.6)
    # the nodes: the same layout every tier, more of it shown
    cands = [(2.4, 0.7), (1.3, 2.5), (2.55, 1.3), (0.6, 2.45), (2.6, 2.55), (1.2, 1.75), (2.25, 2.7), (0.4, 1.9), (2.7, 2.0), (1.55, 1.45)]
    pts = cands[: 2 + 2 * tier]
    nodes = []
    for i, (u, v) in enumerate(pts):
        hgt = 9 + int(hv(key[:-1], "p", i) * 8)
        x0, y0 = c.P(u, v, 0)
        nodes.append((u + v, x0, y0, y0 - hgt, i))
    cx, cy = c.P(2.0, 2.0, 5)
    edges = [(i, (i + 1) % len(nodes)) for i in range(len(nodes))] if len(nodes) > 2 else [(0, 1)]
    edges += [(i, i + 3) for i in range(0, len(nodes) - 3, 2)]
    web = shade(col, 1.35)
    for i, j in edges:  # the edges first, under everything
        a, b = nodes[i], nodes[j]
        c.d.line([(a[1], a[3]), (b[1], b[3])], fill=A(web))
        if tier >= 2:
            c.ld.line([(a[1], a[3]), (b[1], b[3])], fill=A(web, 150))
    plinth = (2.0, 2.0)
    order = sorted(nodes + [(4.0, None, None, None, -1)])
    for d, x0, y0, yt, i in order:
        if i < 0:  # the trident statue on its plinth
            prism(c, plinth[0] - 0.22, plinth[1] - 0.22, plinth[0] + 0.22, plinth[1] + 0.22, 0, 6, STONE, L=combine(top_band(1, shade(STONE, 1.1))))
            x, y = c.P(*plinth, 6)
            th = 18 + 4 * tier
            gold = (240, 196, 70)
            c.d.line([(x, y), (x, y - th)], fill=A(gold), width=2)
            c.d.line([(x - 5, y - th + 6), (x + 5, y - th + 6)], fill=A(gold))
            for dx in (-5, 0, 5):
                c.d.line([(x + dx, y - th + 6), (x + dx, y - th - (3 if dx else 1))], fill=A(gold))
                c.d.point([(x + dx, y - th - (4 if dx else 2))], fill=A(WHITE))
            if tier >= 4:
                c.ld.line([(x, y - 4), (x, y - th)], fill=A(TEAL, 160), width=2)
                c.ld.line([(x - 5, y - th + 6), (x + 5, y - th + 6)], fill=A(TEAL))
            continue
        c.d.line([(x0, y0), (x0, yt)], fill=A(NAVY_D))
        nc = [col, TEAL, ORANGE][i % 3]
        orb(c, x0, yt - 2, 3, nc, glow=nc)
    return c


def tw_neptune(tier, k):
    """A graph mast: a slim glass core with nodes (spheres) on arms spiralling round it, every node joined to the
    next by a lit edge, a great node on the crown under the tip."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=50)
    drum_shadow(c, CU, CV, 0.62)
    drum(c, CU, CV, 0, 12, 0.6, (206, 198, 222), shader=ribbon_shader(k + "b", floor=12, win=5, p=0.7, spandrel=PURPLE_L))
    n = {2: 4, 3: 7, 4: 10}[tier]
    nodes = []
    for j in range(n):
        z = 24 + j * (top_z - 34) / max(1, n - 1)
        ang = j * 2.2 + 0.4
        rr = 0.5 + 0.08 * (j % 2)
        u, v = CU + math.cos(ang) * rr, CV + math.sin(ang) * rr
        x, y = c.P(u, v, z)
        nodes.append((math.cos(ang) + math.sin(ang), x, y, round(z), j))
    xc, _ = c.P(CU, CV, 0)
    edges = [(i, i + 1) for i in range(n - 1)] + [(i, i + 3) for i in range(0, n - 3, 2)]

    def draw_edges(front):
        for i, j in edges:
            a, b = nodes[i], nodes[j]
            if ((a[0] + b[0]) > 0) != front:
                continue
            c.d.line([(a[1], a[2]), (b[1], b[2])], fill=A(PURPLE_L))
            c.ld.line([(a[1], a[2]), (b[1], b[2])], fill=A(TEAL, 170))

    def draw_node(d, x, y, z, j):
        _, yc = c.P(CU, CV, z)
        c.d.line([(xc, yc), (x, y)], fill=A(STEEL_D), width=2)
        nc = [PURPLE, TEAL, ORANGE][j % 3]
        orb(c, x, y, 4 + (j % 2) + (tier >= 4), nc, glow=nc)

    draw_edges(False)
    for nd in nodes:
        if nd[0] <= 0:
            draw_node(*nd)
    sh = ribbon_shader(k, floor=6, win=3, p=0.55, glass_col=GLASS_L, spandrel=(196, 204, 220))
    drum(c, CU, CV, 12, top_z, 0.2, (214, 220, 232), shader=sh, ao=False)
    draw_edges(True)
    for nd in nodes:
        if nd[0] > 0:
            draw_node(*nd)
    # the crown node
    r = 6 + tier
    x, y = c.P(CU, CV, top_z + r)
    orb(c, x - 1, y, r, PURPLE, glow=None)
    c.ld.ellipse((x - 3, y - 3, x + 1, y + 1), fill=A(PURPLE_L, 200))
    tip(c, CU, CV, top_z + 2 * r, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── OpenSearch ────────────────────────────────────────────────────────────────────────────────────────────────────

def magnifier(c, x, y, r, col, lit=True):
    """A magnifying glass in screen space, its lens centred at (x, y): a thick rim, sky glass with a glint, the handle
    running down to the right."""
    c.d.line([(x + r - 1, y + r - 1), (x + r + 6, y + r + 6)], fill=A(NAVY_D), width=4)
    c.d.line([(x + r - 1, y + r - 2), (x + r + 6, y + r + 5)], fill=A(shade(col, 0.8)), width=2)
    c.d.ellipse((x - r - 2, y - r - 2, x + r + 2, y + r + 2), fill=A(shade(col, 0.7)))
    c.d.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(col))
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(GLASS_L))
    c.d.chord((x - r, y - r, x + r, y + r), 20, 200, fill=A(GLASS_DK))
    c.d.line([(x - r // 2, y - r // 2 + 1), (x - r // 2 + 2, y - r // 2 - 1)], fill=A(WHITE))
    if lit:
        c.ld.ellipse((x - r, y - r, x + r, y + r), fill=A(LIT_COOL, 200))


def drawers(key):
    """A card-catalogue wall: rows of small drawer fronts, each with a brass pull and a label, a few pulled lit."""
    def g(i, n, z, h, base, side):
        if z < 2 or z > h - 4 or i < 1 or i >= n - 1:
            return None
        bi, bz = i % 5, (z - 2) % 4
        if bi == 0 or bz == 3:
            return shade(WOOD_D, 0.8 if side == "L" else 0.62), None
        if bi == 2 and bz == 1:
            return (214, 176, 80), None
        on = hv(key, i // 5, (z - 2) // 4) < 0.25
        return shade(WOOD, 0.98 if side == "L" else 0.76), (LIT if on and bi in (1, 3) and bz == 1 else None)
    return g


def lm_opensearch(fw, fh, tier, col, key):
    """OpenSearch Search Bureau: a glass reading pavilion whose side wall is one great card catalogue, a big
    magnifying-glass sign on its roof (searching every record at once), a kiosk of index cards from tier 2, a second
    catalogue wing from 3, the lens lit and a beacon at 4."""
    c = Kit(fw, fh, 76)
    if tier >= 3:  # the catalogue wing at the back right
        u0, v0, u1, v1 = 2.05, 0.3, 2.85, 1.2
        ground_shadow(c, u0, v0, u1, v1)
        prism(c, u0, v0, u1, v1, 0, 20, WOOD, L=combine(top_band(3, col), drawers(key + "w")), R=combine(top_band(3, col), drawers(key + "wr")))
    u0, v0, u1, v1 = 0.95, 1.4, 2.8, 2.5
    h = 15 + 2 * tier
    podium(c, u0, v0, u1, v1, 6, STONE, key, accent=col, canopy=False)
    prism(c, u0, v0, u1, v1, 6, h, WHITE, L=combine(top_band(3, col), glass(key + "p", bay=5, floor=7, p=0.55, frame=WHITE)),
          R=combine(top_band(3, col), drawers(key)), ao=False)
    # the magnifier sign on a stand on the roof
    mu, mv = (u0 + u1) / 2, (v0 + v1) / 2
    x, y = c.P(mu, mv, h)
    c.d.rectangle((x - 1, y - 8, x, y), fill=A(STEEL_D))
    r = 6 + min(tier, 3)
    magnifier(c, x - 3, y - 10 - r, r, col if tier < 4 else (214, 176, 80), lit=tier >= 2)
    if tier >= 2:  # the index-card kiosk on the forecourt
        ku, kv = 0.4, 2.45
        prism(c, ku, kv, ku + 0.4, kv + 0.35, 0, 9, col, L=combine(top_band(2, WHITE), lambda i, n, z, hh, b, s: ((WHITE, LIT_COOL) if 1 < i < n - 2 and 3 <= z < 6 else None)), R=solid())
        c.pyramid(ku - 0.05, kv - 0.05, ku + 0.45, kv + 0.4, 9, 5, PURPLE_D)
    if tier >= 4:
        beacon(c, u1 - 0.1, v0 + 0.1, h + 2)
    return c


def tw_opensearch(tier, k):
    """A tower topped by a searchlight: a square violet-glass shaft with lit bands that scan up its corners, a lantern
    deck, and a great round lens on a yoke turned to the street, its beam sweeping at night."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=50)
    podium(c, 0.25, 0.25, 1.45, 1.45, 10, (110, 96, 128), k, accent=PURPLE)
    hw = 0.38
    scan = lambda i, n, z, hh, b, s: ((shade(PURPLE_L, 1.0 if s == "L" else 0.8), PURPLE_L) if (i >= n - 2 if s == "L" else i <= 1) and (z // 4) % 3 == 0 else None)
    body = combine(top_band(2, PURPLE_D), scan, glass(k, bay=5, floor=6, p=0.4, palette=VIOLET_GLASS, frame=(150, 130, 180)))
    prism(c, CU - hw, CV - hw, CU + hw, CV + hw, 10, top_z, (140, 120, 170), L=body, R=body, zref=10, href=top_z - 10)
    # the lantern deck
    prism(c, CU - hw - 0.06, CV - hw - 0.06, CU + hw + 0.06, CV + hw + 0.06, top_z, top_z + 3, PURPLE_D, ao=False)
    z = top_z + 3
    drum(c, CU, CV, z, z + 4, 0.2, STEEL_D, ao=False)
    # the yoke and the lens
    r = 9 + (tier - 2)
    x, y = c.P(CU, CV, z + 4)
    cy = y - r - 3
    c.d.line([(x - r - 2, y), (x - r - 2, cy)], fill=A(STEEL_M), width=2)
    c.d.line([(x + r + 1, y), (x + r + 1, cy)], fill=A(STEEL_D), width=2)
    c.d.ellipse((x - r - 1, cy - r - 1, x + r, cy + r), fill=A(CHAR))
    c.d.ellipse((x - r, cy - r, x + r - 1, cy + r - 1), fill=A(STEEL_M))
    for rr, colr in ((r - 2, GLASS_DK), (r - 4, GLASS_L), (r - 7, WHITE)):
        if rr > 0:
            c.d.ellipse((x - rr, cy - rr, x + rr - 1, cy + rr - 1), outline=A(colr) if rr != r - 7 else None, fill=A(colr) if rr == r - 7 else None)
    c.ld.ellipse((x - r + 2, cy - r + 2, x + r - 3, cy + r - 3), fill=A((255, 244, 200), 230))
    if tier >= 3:  # the beam, night only, sweeping down-left and below the tip
        c.ld.polygon([(x - r + 2, cy - 3), (x - r + 2, cy + 4), (x - r - 30, cy + 22), (x - r - 34, cy + 6)], fill=A((255, 244, 200), 70))
    tip(c, CU, CV, z + 4 + 2 * r + 4, h=7 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── DocumentDB ────────────────────────────────────────────────────────────────────────────────────────────────────

PAPER = (244, 240, 228)
RULE = (196, 206, 228)


def pages(key, tab=None):
    """The edge of a stack of pages: thin ruled sheets, a coloured tab now and then."""
    def g(i, n, z, h, base, side):
        if z == 0 or z == h - 1:
            return shade(PURPLE_D if tab else (200, 196, 184), 1.0 if side == "L" else 0.8), None
        if tab and 0.15 * n < i < 0.3 * n and z >= h - 3:
            return shade(tab, 1.0 if side == "L" else 0.8), None
        if z % 3 == 1:
            return shade(RULE, 1.06 if side == "L" else 0.84), None
        return None
    return g


def braces(c, x, y, s, col, lit=True):
    """A { } sign in screen space, (x, y) its centre, s its half-height."""
    for side in (-1, 1):
        bx = x + side * (s // 2 + 2)
        pts = [(bx - side * 2, y - s), (bx, y - s + 2), (bx, y - 2), (bx + side * 2, y), (bx, y + 2), (bx, y + s - 2), (bx - side * 2, y + s)]
        c.d.line(pts, fill=A(col), width=2)
        if lit:
            c.ld.line(pts, fill=A(col), width=2)
    c.d.point([(x - 1, y), (x + 1, y)], fill=A(col))


def lm_documentdb(fw, fh, tier, col, key):
    """DocumentDB Records Press: a cream records office with tall windows and a { } sign, stacks of documents
    on pallets in its yard (each record a whole document, more each tier), filing cabinets from tier 3, lamps at 4."""
    c = Kit(fw, fh, 70)
    u0, v0, u1, v1 = 1.55, 0.9, 2.8, 2.25
    h = 16 + 2 * tier
    cream = (232, 222, 200)
    podium(c, u0, v0, u1, v1, 7, (190, 170, 150), key, accent=col)
    tall = punched(key + "o", bay=6, floor=h - 7, ww=3, wh=h - 13, p=0.55, lo=0)
    prism(c, u0, v0, u1, v1, 7, h, cream, L=combine(top_band(3, col), tall), R=combine(top_band(3, col), punched(key + "or", bay=6, floor=h - 7, ww=3, wh=h - 13, p=0.55)), ao=False)
    c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, h, 7, PURPLE_D)
    x, y = c.P(u0 + 0.15, (v0 + v1) / 2, h + 9)
    c.d.rectangle((x - 9, y - 7, x + 9, y + 7), fill=A(NAVY))
    c.d.line([(x - 9, y - 7), (x + 9, y - 7)], fill=A(shade(NAVY, 1.6)))
    braces(c, x, y, 5, PURPLE_L)
    # document stacks on pallets in the yard
    spots = [(0.35, 2.45), (0.85, 2.45), (1.35, 2.5), (0.35, 1.95), (0.85, 1.95), (2.15, 2.55), (2.6, 2.55)]
    n = 2 + tier + (tier >= 3)
    for i, (u, v) in sorted(enumerate(spots[:n]), key=lambda t: t[1][0] + t[1][1]):
        hh = 6 + int(hv(key, "h", i) * 6) + tier
        prism(c, u - 0.02, v - 0.02, u + 0.36, v + 0.3, 0, 1, WOOD_D, rim=0)
        prism(c, u, v, u + 0.34, v + 0.28, 1, 1 + hh, PAPER, L=pages(key + str(i), tab=col if i % 2 else None), R=pages(key + "r" + str(i)), rim=0.02, ao=False)
    if tier >= 3:  # filing cabinets along the side
        for kk in range(3):
            u = 0.3 + kk * 0.3
            cab = lambda i, nn, z, hh, b, s: ((shade(b, 0.7), None) if z % 6 == 0 else ((214, 176, 80), None) if z % 6 == 3 and nn // 2 - 1 <= i <= nn // 2 else None)
            prism(c, u, 1.3, u + 0.26, 1.6, 0, 18, CON_L, L=cab, R=solid(), rim=0.02)
    if tier >= 4:
        for u, v in ((0.2, 2.95), (1.5, 2.95)):
            x, y = c.P(u, v, 0)
            c.d.line([(x, y), (x, y - 14)], fill=A(CHAR))
            c.d.rectangle((x - 1, y - 17, x + 1, y - 14), fill=A(LIT))
            c.ld.ellipse((x - 4, y - 19, x + 4, y - 12), fill=A(LIT, 160))
    return c


def tw_documentdb(tier, k):
    """A tower of page slabs indented like a JSON document: each floor a thick sheaf of ruled pages, stepped in and
    out by its nesting level, purple tabs on some, a { } crown on the top."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=48)
    podium(c, 0.2, 0.3, 1.5, 1.4, 10, (150, 140, 156), k, accent=PURPLE)
    nest = [0, 1, 2, 2, 1, 2, 3, 3, 2, 1, 1, 2, 2, 1, 0, 1, 2, 1]
    fl = 10
    z = 10
    i = 0
    while z + fl <= top_z:
        lv = nest[i % len(nest)]
        du = -0.24 + 0.16 * lv  # indented to the right (+u) one step per level, then back
        u0, v0, u1, v1 = 0.35 + du, 0.45, 1.35 + du, 1.25
        tab = PURPLE if lv in (0, 2) else None
        glassy = combine(pages(k + str(i), tab=tab), glass(k + "g" + str(i), bay=6, floor=fl, p=0.5, lo=3, hi=fl - 3, frame=PAPER))
        prism(c, u0, v0, u1, v1, z, z + fl, PAPER, L=glassy, R=pages(k + "r" + str(i)), rim=0.02, ao=False)
        z += fl
        i += 1
    # the { } crown: a board on two posts
    x, y = c.P(CU, CV, z)
    c.d.line([(x - 8, y), (x - 8, y - 6)], fill=A(STEEL_D))
    c.d.line([(x + 7, y), (x + 7, y - 6)], fill=A(STEEL_D))
    c.d.rectangle((x - 12, y - 22, x + 11, y - 6), fill=A(NAVY))
    c.d.line([(x - 12, y - 22), (x + 11, y - 22)], fill=A(shade(NAVY, 1.6)))
    c.d.line([(x + 11, y - 22), (x + 11, y - 6)], fill=A(NAVY_D))
    braces(c, x, y - 14, 6, PURPLE_L)
    tip(c, CU, CV, z + 22, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c
