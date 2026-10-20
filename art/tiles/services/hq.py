"""
District headquarters (`hq:<district>`, a 2x2 lot), drawn with the service-building kit. Each one is its own building
type, so a district's HQ reads at a glance:

  compute     a server hall: louvred cladding with rack LEDs, a row of big cooling fans on the roof, an ops block
  storage     a warehouse: corrugated walls, roller doors, a gable roof with skylights, a water tower on legs
  database    an archive: a stone hall with pilasters and tall windows, a cornice, a disk-stack rotunda on the roof
  networking  an exchange: ribbon-windowed block with a cable riser, a lattice mast with dishes and a beacon
  security    a keep: a stone tower with a hipped roof and the district crest, round corner towers in a low ring
              wall, a vault-like gate (civic, not military: no battlements, no arms)
  aiml        a lab under a truncated glass pyramid, panes lit from inside at night, a glowing cap and two small pyramids
  management  an operations centre: a low ops block with a wall of status screens, and a round control tower whose
              flared, glazed cab watches over the district under a pink cap with a turning radar

Every HQ stands on a paved plinth, has lit doors on the street (left) face and the district colour on its sign band.
hq(col, key) -> Kit (a Canvas; generate_tiles.add finishes it and writes the @lights layer).
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, WATER, WHITE, shade  # noqa: F401
from services.kit import (CON_L, CON_M, GLASS_DK, GLASS_L, LED, LIT, LIT_COOL, RED, STEEL, STEEL_D, STEEL_M, STONE,  # noqa: F401
                          Kit, A, bands, mix, beacon, combine, dish, drum, drum_shadow, ellipse, face, glass, ground_shadow, hv,
                          lattice, leds, louvres, masonry, prism, punched, rib_shader, ribs, screen, solid, top, top_band)

PAVE = (204, 198, 186)


def plinth(c):
    prism(c, 0.04, 0.04, 1.96, 1.96, 0, 2, CON_M, roofcol=PAVE, rim=0)


def doors(c, v, um, h, w=0.16):
    """Lit double doors on the left face at u = um."""
    face(c, "L", v, um - w, um + w, 0, h, NAVY_D,
         lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 and i != n // 2 else (shade(STEEL_D, 0.9), None)), ao=False)


def fan_unit(c, u, v, z, s, key):
    """A cooling-fan housing: a louvred box with a big round grille and three blades on top."""
    prism(c, u, v, u + s, v + s, z, z + 5, CON_L, L=louvres(2, 0.86), R=louvres(2, 0.86), rim=0.03, ao=False)
    x, y = c.Pf(u + s / 2, v + s / 2, z + 5)
    rx, ry = s * 0.4 * 1.414 * 16, s * 0.4 * 1.414 * 8
    c.d.ellipse((round(x - rx), round(y - ry), round(x + rx), round(y + ry)), fill=A(STEEL_D))
    c.d.ellipse((round(x - rx) + 1, round(y - ry) + 1, round(x + rx) - 1, round(y + ry) - 1), fill=A(NAVY_D))
    a0 = hv(key, u, v) * math.pi
    for k in range(3):
        a = a0 + k * 2 * math.pi / 3
        c.d.line([(round(x), round(y)), (round(x + math.cos(a) * (rx - 1)), round(y + math.sin(a) * (ry - 1)))], fill=A(STEEL_M))
    c.d.point([(round(x), round(y))], fill=A(STEEL))


# ── compute: the server hall ──────────────────────────────────────────────────────────────────────────────────────

def hq_compute(col, key):
    c = Kit(2, 2, 64)
    plinth(c)
    u0, v0, u1, v1, h = 0.18, 0.22, 1.82, 1.82, 26
    ground_shadow(c, u0, v0, u1, v1)
    clad = (196, 202, 210)
    wall = lambda k: combine(top_band(3, col), bands([(11, 13, col)]), glass(key + k, bay=5, floor=11, p=0.6, refl=False, lo=1, hi=10),
                             leds(key + k, step=3, every=4, lo=15, hi=h - 4), louvres(2, 0.9))
    prism(c, u0, v0, u1, v1, 2, h, clad, L=wall("l"), R=wall("r"), ao=False)
    doors(c, v1, 0.55, 9)
    prism(c, 0.33, v1, 0.77, v1 + 0.14, 8, 10, col, ao=False, rim=0)  # canopy
    # the ops block on the back corner of the roof, two exhaust stacks on it
    bu0, bv0, bu1, bv1 = 0.28, 0.32, 0.78, 0.82
    g = lambda k: combine(top_band(3, col), glass(key + k, bay=4, floor=6, p=0.55, lo=0, hi=16 - 3))
    prism(c, bu0, bv0, bu1, bv1, h, h + 16, NAVY, L=g("ol"), R=g("or"), ao=True)
    for u in (bu0 + 0.14, bu0 + 0.36):
        drum(c, u, bv0 + 0.14, h + 16, h + 26, 0.08, STEEL_M, capcol=NAVY_D, ao=False)
        drum(c, u, bv0 + 0.14, h + 22, h + 24, 0.09, col, ao=False, cap=False)
    beacon(c, bu1 - 0.1, bv1 - 0.1, h + 18)
    # the cooling fans: big housings over the rest of the roof
    spots = [(0.98, 0.34), (1.4, 0.34), (0.98, 0.84), (1.4, 0.84), (0.3, 1.26), (0.72, 1.26), (1.14, 1.26)]
    for u, v in sorted(spots, key=lambda t: t[0] + t[1]):
        fan_unit(c, u, v, h, 0.38, key)
    return c


# ── storage: the warehouse and water tower ────────────────────────────────────────────────────────────────────────

def hq_storage(col, key):
    c = Kit(2, 2, 92)
    plinth(c)
    # the water tower at the back corner: four legs, a tank with hoops, a cone roof
    tu, tv = 0.42, 0.42
    for du, dv in ((-0.16, -0.16), (0.16, -0.16), (-0.16, 0.16), (0.16, 0.16)):
        x0, y0 = c.P(tu + du * 1.3, tv + dv * 1.3, 2)
        x1, y1 = c.P(tu + du * 0.8, tv + dv * 0.8, 54)
        c.d.line([(x0, y0), (x1, y1)], fill=A(STEEL_D if du + dv > 0 else STEEL_M), width=2)
    for z in (18, 36):
        x0, y0 = c.P(tu - 0.18, tv + 0.18, z)
        x1, y1 = c.P(tu + 0.18, tv + 0.18, z)
        x2, y2 = c.P(tu + 0.18, tv - 0.18, z)
        c.d.line([(x0, y0), (x1, y1), (x2, y2)], fill=A(STEEL_D))
    tank = shade(col, 0.95)
    drum(c, tu, tv, 54, 72, 0.3, tank, shader=rib_shader(1, hoops=(3, 9, 15), hoop=0.8), capcol=tank, ao=False)
    drum(c, tu, tv, 72, 80, 0.33, shade(col, 0.7), profile=lambda t: 0.33 * (1 - t) + 0.02, cap=False, ao=False)
    x, y = c.P(tu, tv, 64)
    c.d.rectangle((x - 5, y - 2, x + 4, y + 1), fill=A(WHITE))  # the tank's plate
    c.d.line([(x - 3, y), (x + 2, y)], fill=A(shade(col, 0.7)))
    beacon(c, tu, tv, 81)
    # the warehouse: corrugated walls, three roller doors and an office end
    u0, v0, u1, v1, h = 0.2, 0.75, 1.82, 1.82, 24
    ground_shadow(c, u0, v0, u1, v1)
    steel = (178, 190, 182)
    corr = combine(top_band(2, col), bands([(0, 2, CON_M)]), ribs(2, 1.08, 0.86))
    office = combine(top_band(2, col), punched(key + "o", bay=5, floor=9, ww=3, wh=4, p=0.95, lo=3), solid())
    prism(c, u0, v0, u1, v1, 2, h, steel, L=corr, R=combine(lambda i, n, z, hh, b, s: office(i, n, z, hh, shade(WHITE, 0.9), s) if i > n * 0.55 else None, corr),
          roof=False, ao=False)
    for k, um in enumerate((0.45, 0.85, 1.25)):
        open_ = k == 1
        face(c, "L", v1, um - 0.15, um + 0.15, 2, 16, NAVY_D,
             (lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 else (STEEL_D, None))) if open_ else
             combine(lambda i, n, z, hh, b, s: ((shade(STEEL_M, 0.8), None) if z % 2 == 0 else (STEEL_M, None)) if 0 < i < n - 1 and z < hh - 1 else (STEEL_D, None)),
             ao=False, edge=False)
    doors(c, v1, 1.62, 10, w=0.1)
    # gable roof along u with skylights
    vm = (v0 + v1) / 2
    roof = (92, 108, 100)
    c.poly([(u0 - 0.04, v1 + 0.04, h), (u1 + 0.04, v1 + 0.04, h), (u1 + 0.04, vm, h + 12), (u0 - 0.04, vm, h + 12)], shade(roof, 0.95))
    c.poly([(u1 + 0.04, v1 + 0.04, h), (u1 + 0.04, v0 - 0.04, h), (u1 + 0.04, vm, h + 12)], shade(steel, 0.72))
    for k in range(4):
        a = u0 + 0.18 + k * 0.38
        pts = [(a, v1 - 0.12, h + 2.5), (a + 0.2, v1 - 0.12, h + 2.5), (a + 0.2, vm + 0.12, h + 9.5), (a, vm + 0.12, h + 9.5)]
        c.poly(pts, GLASS_L)
        c.ld.polygon([c.P(*p) for p in pts], fill=A(LIT, 170))
    c.line((u0 - 0.04, vm, h + 12), (u1 + 0.04, vm, h + 12), shade(roof, 1.3))
    return c


# ── database: the archive ─────────────────────────────────────────────────────────────────────────────────────────

def hq_database(col, key):
    c = Kit(2, 2, 76)
    plinth(c)
    u0, v0, u1, v1, h = 0.22, 0.22, 1.78, 1.78, 36
    ground_shadow(c, u0, v0, u1, v1)
    stone = (222, 214, 198)
    prism(c, u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, 2, 6, STONE, R=louvres(2, 0.9), rim=0, ao=False)  # the stylobate

    def pilasters(k):
        tall = punched(key + k, bay=9, floor=h - 10, ww=4, wh=h - 18, p=0.65, lo=3)
        pil = lambda i, n, z, hh, b, s: ((shade(b, 1.12), None) if i % 9 in (0, 8) else (shade(b, 0.86), None) if i % 9 == 1 else None)
        return combine(top_band(4, col), bands([(h - 10, h - 8, shade(stone, 0.86))]), tall, pil, masonry(6, 18, 0.95))
    prism(c, u0, v0, u1, v1, 6, h, stone, L=pilasters("l"), R=pilasters("r"), ao=False, roofcol=shade(stone, 0.9))
    doors(c, v1, 1.0, 14, w=0.14)
    prism(c, 0.78, v1, 1.22, v1 + 0.18, 2, 4, STONE, rim=0, ao=False)  # front steps
    # the disk-stack rotunda on the roof: three platters with gold read heads, a glass lantern on top
    z = h
    drum(c, 1.0, 1.0, z, z + 3, 0.56, shade(stone, 0.9), ao=False)
    z += 3
    for k in range(3):
        dc = mix(col, (200, 196, 214), 0.3 if k % 2 == 0 else 0.15)
        gold = lambda th, zz, hh, b: ((LIT, LIT) if zz == hh // 2 and abs(th) < 1.2 else None)
        drum(c, 1.0, 1.0, z, z + 7, 0.5, dc, shader=gold, capcol=shade(dc, 1.1), ao=False)
        z += 7
        if k < 2:
            drum(c, 1.0, 1.0, z, z + 2, 0.4, STEEL_D, ao=False)
            z += 2
    drum(c, 1.0, 1.0, z, z + 6, 0.16, GLASS_DK, shader=lambda th, zz, hh, b: (GLASS_L, LIT_COOL), ao=False, capcol=NAVY)
    beacon(c, 1.0, 1.0, z + 8, col=(255, 214, 120))
    return c


# ── networking: the exchange ──────────────────────────────────────────────────────────────────────────────────────

def hq_networking(col, key):
    c = Kit(2, 2, 104)
    plinth(c)
    u0, v0, u1, v1, h = 0.26, 0.26, 1.74, 1.74, 44
    ground_shadow(c, u0, v0, u1, v1)
    body = (214, 218, 228)
    ribbon = lambda k: combine(top_band(3, col), glass(key + k, bay=4, floor=8, p=0.55, lo=12, hi=h - 3, spandrel=body), glass(key + k + "lb", bay=6, floor=12, p=0.7, refl=False, lo=1, hi=10))
    prism(c, u0, v0, u1, v1, 2, h, body, L=ribbon("l"), R=ribbon("r"), ao=False)
    doors(c, v1, 0.75, 10)
    prism(c, 0.52, v1, 0.98, v1 + 0.14, 9, 11, col, ao=False, rim=0)
    # the cable riser: a purple fin up the corner with lit cable lights
    face(c, "L", v1, u1 - 0.16, u1, 2, h + 4, col, lambda i, n, z, hh, b, s: ((LIT_COOL, LIT_COOL) if i == n // 2 and z % 6 == 3 else None))
    face(c, "R", u1, v1 - 0.16, v1, 2, h + 4, col)
    top(c, u1 - 0.16, v1 - 0.16, u1, v1, h + 4, col, rim=0)
    # the mast: a plant box, a lattice tower with dishes, guy wires to the roof corners, a red beacon
    prism(c, 0.75, 0.75, 1.25, 1.25, h, h + 6, CON_L, L=louvres(2), R=louvres(2), rim=0.03, ao=False)
    zt = h + 56
    for (gu, gv) in ((0.32, 0.32), (1.68, 0.32), (0.32, 1.68)):
        c.line((gu, gv, h), (1.0, 1.0, zt - 14), STEEL_M)
    lattice(c, 1.0, 1.0, h + 6, zt, 6, 2, STEEL_M, step=6)
    dish(c, 0.92, 1.08, h + 24, r=5, facing=-1)
    dish(c, 1.08, 0.92, h + 34, r=4, facing=1)
    x, y = c.P(1.0, 1.0, zt)
    c.d.line([(x, y), (x, y - 6)], fill=A(STEEL))
    beacon(c, 1.0, 1.0, zt + 7)
    c.line((1.68, 1.68, h + 4), (1.0, 1.0, zt - 14), STEEL_M)
    return c


# ── security: the keep ────────────────────────────────────────────────────────────────────────────────────────────

def crest(c, x, y, col, s=7):
    c.d.polygon([(x - s, y - s), (x + s, y - s), (x + s, y + 1), (x, y + s + 2), (x - s, y + 1)], fill=A(shade(col, 0.7)))
    c.d.polygon([(x - s + 1, y - s + 1), (x + s - 1, y - s + 1), (x + s - 1, y + 1), (x, y + s + 1), (x - s + 1, y + 1)], fill=A(col))
    c.d.polygon([(x - s + 2, y - s + 2), (x, y - s + 2), (x, y + s), (x - s + 2, y + 1)], fill=A(shade(col, 1.18)))
    # a padlock
    c.d.arc((x - 4, y - 7, x + 3, y), 180, 360, fill=A(WHITE), width=2)
    c.d.rectangle((x - 4, y - 3, x + 3, y + 3), fill=A(WHITE))
    c.d.point([(x, y - 1), (x, y)], fill=A(shade(col, 0.6)))
    c.ld.rectangle((x - 4, y - 3, x + 3, y + 3), fill=A(LIT, 160))


def hq_security(col, key):
    c = Kit(2, 2, 88)
    plinth(c)
    stone = (196, 190, 178)
    mas = combine(masonry(5, 12, 0.9))
    slate = (70, 78, 98)

    def turret(u, v, h):
        drum_shadow(c, u, v, 0.24)
        drum(c, u, v, 2, h, 0.22, stone, shader=lambda th, zz, hh, b: ((LIT, LIT) if hh - 12 <= zz < hh - 7 and abs(th + 0.3) < 0.18 else
                                                                    (shade(b, 0.9), None) if zz % 5 == 4 else None), capcol=stone)
        drum(c, u, v, h, h + 2, 0.25, col, ao=False)
        drum(c, u, v, h + 2, h + 16, 0.26, slate, profile=lambda t: 0.26 * (1 - t) + 0.01, cap=False, ao=False)
        x, y = c.P(u, v, h + 16)
        c.d.line([(x, y), (x, y - 3)], fill=A(STEEL))

    ring = 18
    # back turret, back walls, the keep, then the side turrets, front walls, the front turret
    turret(0.3, 0.3, 28)
    prism(c, 0.3, 0.22, 1.7, 0.38, 2, ring, stone, L=mas, R=mas, ao=False)
    prism(c, 0.22, 0.3, 0.38, 1.7, 2, ring, stone, L=mas, R=mas, ao=False)
    ku0, ku1, kh = 0.6, 1.4, 58
    ground_shadow(c, ku0, ku0, ku1, ku1)
    win = lambda k: combine(top_band(3, col), punched(key + k, bay=7, floor=11, ww=2, wh=6, p=0.6, lo=8, hi=kh - 4), masonry(5, 12, 0.9))
    prism(c, ku0, ku0, ku1, ku1, 2, kh, stone, L=win("l"), R=win("r"), ao=False)
    c.pyramid(ku0 - 0.06, ku0 - 0.06, ku1 + 0.06, ku1 + 0.06, kh, 18, slate)
    c.line((ku1 + 0.06, ku1 + 0.06, kh), (1.0, 1.0, kh + 18), shade(slate, 1.4))
    x, y = c.P(1.0, 1.0, kh + 18)
    c.d.line([(x, y), (x, y - 6)], fill=A(STEEL))
    c.d.polygon([(x + 1, y - 6), (x + 7, y - 4), (x + 1, y - 2)], fill=A(col))  # a pennant in the district colour
    x, y = c.P((ku0 + ku1) / 2, ku1, kh - 13)
    crest(c, x, y, col)
    turret(1.7, 0.3, 28)
    turret(0.3, 1.7, 28)
    prism(c, 1.62, 0.3, 1.78, 1.7, 2, ring, stone, L=mas, R=mas, ao=False)
    prism(c, 0.3, 1.62, 1.7, 1.78, 2, ring, stone, L=mas, R=mas, ao=False)
    # the gate: a rounded arch in the front wall, lit inside, under a band in the district colour
    gx, gy = c.P(1.0, 1.78, 2)
    c.d.rectangle((gx - 9, gy - 13, gx + 8, gy - 1), fill=A(shade(stone, 0.75)))
    c.d.pieslice((gx - 9, gy - 21, gx + 8, gy - 5), 180, 360, fill=A(shade(stone, 0.75)))
    c.d.rectangle((gx - 7, gy - 12, gx + 6, gy - 1), fill=A(LIT))
    c.d.pieslice((gx - 7, gy - 19, gx + 6, gy - 6), 180, 360, fill=A(LIT))
    c.ld.rectangle((gx - 7, gy - 12, gx + 6, gy - 1), fill=A(LIT))
    c.ld.pieslice((gx - 7, gy - 19, gx + 6, gy - 6), 180, 360, fill=A(LIT))
    c.d.line([(gx - 1, gy - 19), (gx - 1, gy - 1)], fill=A(shade(stone, 0.6)))
    face(c, "L", 1.78, 0.3, 1.7, ring - 2, ring, col, ao=False)
    face(c, "R", 1.78, 0.3, 1.7, ring - 2, ring, col, ao=False)
    turret(1.7, 1.7, 30)
    return c


# ── AI/ML: the glass pyramid lab ──────────────────────────────────────────────────────────────────────────────────

def glass_pyramid(c, u0, v0, u1, v1, z, h, key, col, rows=6, cut=1.0):
    """A glass pyramid (truncated at `cut` of its height) with a pane grid, seeded panes lit from inside at night."""
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    apex = (cu, cv, z + h)

    def lerp(p, q, t):
        return tuple(p[i] + (q[i] - p[i]) * t for i in range(3))
    for side, (a, b), f, pal in (("L", ((u0, v1, z), (u1, v1, z)), 0.95, (GLASS_L, (176, 222, 242))),
                                 ("R", ((u1, v1, z), (u1, v0, z)), 0.75, (GLASS_DK, (96, 150, 200)))):
        n = max(1, round(rows * cut))
        for r in range(n):
            t0, t1 = r / rows, (r + 1) / rows
            cols_ = 5
            for j in range(cols_):
                s0, s1 = j / cols_, (j + 1) / cols_
                p00 = lerp(lerp(a, b, s0), apex, t0)
                p10 = lerp(lerp(a, b, s1), apex, t0)
                p11 = lerp(lerp(a, b, s1), apex, t1)
                p01 = lerp(lerp(a, b, s0), apex, t1)
                refl = (r + j) % 5 == 2
                pc = shade(pal[1] if refl else pal[0], 1.0 + 0.04 * r / rows)
                c.poly([p00, p10, p11, p01], pc)
                w = hv(key, side, r, j)
                if w < 0.45:
                    c.ld.polygon([c.P(*p) for p in (p00, p10, p11, p01)], fill=A((150, 255, 225) if w < 0.3 else LIT, 190))
        # the frame: rows and ribs
        for r in range(n + 1):
            t = r / rows
            c.line(lerp(a, apex, t), lerp(b, apex, t), STEEL if side == "L" else STEEL_M)
        for j in range(1, 5):
            s = j / 5
            c.line(lerp(a, b, s), lerp(lerp(a, b, s), apex, n / rows), STEEL if side == "L" else STEEL_M)
    c.line((u1, v1, z), lerp((u1, v1, z), apex, max(1, round(rows * cut)) / rows), STEEL)
    return z + h * max(1, round(rows * cut)) / rows


def hq_aiml(col, key):
    c = Kit(2, 2, 70)
    plinth(c)
    # the base storey: a band of lit glass under a district-colour fascia
    ground_shadow(c, 0.2, 0.2, 1.8, 1.8)
    base = (226, 230, 236)
    lab = lambda k: combine(top_band(2, col), glass(key + k, bay=5, floor=12, p=0.7, refl=False, lo=1, hi=8))
    prism(c, 0.2, 0.2, 1.8, 1.8, 2, 12, base, L=lab("l"), R=lab("r"), ao=False, roofcol=PAVE)
    doors(c, 1.8, 0.62, 8, w=0.13)
    # a reflecting pool on the front corner of the terrace
    c.poly([(1.5, 1.5, 12), (1.76, 1.5, 12), (1.76, 1.76, 12), (1.5, 1.76, 12)], shade(WATER, 0.95))
    # the small pyramids on the side corners, the big one (truncated) between, with its glowing cap
    glass_pyramid(c, 1.4, 0.26, 1.76, 0.62, 12, 16, key + "a", col, rows=3)
    zc = glass_pyramid(c, 0.26, 0.26, 1.42, 1.42, 12, 56, key, col, rows=7, cut=6 / 7)
    r = 0.58 / 7
    cu = cv = 0.84
    prism(c, cu - r, cv - r, cu + r, cv + r, zc, zc + 4, col, ao=False, rim=0)
    x, y = c.P(cu, cv, zc + 4)
    c.ld.ellipse((x - 6, y - 5, x + 6, y + 3), fill=A((150, 255, 225), 200))
    c.d.line([(x, y), (x, y - 5)], fill=A(WHITE))
    beacon(c, cu, cv, zc + 7, col=(150, 255, 225))
    glass_pyramid(c, 0.26, 1.4, 0.62, 1.76, 12, 16, key + "b", col, rows=3)
    return c


# ── management: the operations centre ─────────────────────────────────────────────────────────────────────────────

def hq_management(col, key):
    c = Kit(2, 2, 100)
    plinth(c)
    # the control tower at the back corner: a round shaft with slit windows, a flared glazed cab, a cap and a radar
    tu = tv = 0.62
    drum_shadow(c, tu, tv, 0.24)
    pale = (226, 222, 230)
    slits = lambda th, z, h, b: ((GLASS_DK, LIT if hv(key, round(th * 3), z // 8) < 0.5 else None) if z % 8 in (3, 4, 5) and abs(th + 0.4) < 0.16 else
                                 (shade(b, 0.88), None) if z % 16 == 0 else None)
    drum(c, tu, tv, 2, 58, 0.2, pale, shader=slits, ao=True, cap=False)
    drum(c, tu, tv, 58, 64, 0.2, pale, r1=0.36, ao=False, cap=False)  # the flare
    drum(c, tu, tv, 64, 66, 0.37, col, ao=False, cap=False)
    cab = lambda th, z, h, b: ((shade(STEEL, 0.9), None) if ((th + math.pi / 2) / 0.5) % 1 < 0.14 else
                               (shade(GLASS_L, 0.9 + 0.1 * math.cos(th)), LIT_COOL if hv(key, "cab", math.floor((th + math.pi / 2) / 0.5)) < 0.7 else None))
    drum(c, tu, tv, 66, 76, 0.38, GLASS_DK, shader=cab, ao=False, cap=False)
    drum(c, tu, tv, 76, 80, 0.44, col, ao=False, capcol=shade(col, 0.85))
    drum(c, tu, tv, 80, 84, 0.12, STEEL_M, ao=False, capcol=STEEL_D)
    x, y = c.P(tu, tv, 84)
    c.d.line([(x - 9, y - 4), (x + 8, y - 1)], fill=A(STEEL), width=2)  # the radar bar
    c.d.line([(x - 9, y - 5), (x + 8, y - 2)], fill=A(STEEL_D))
    c.d.line([(x, y), (x, y - 8)], fill=A(STEEL_M))
    beacon(c, tu, tv, 93)
    # the ops block in front: pale panels, a pink fascia, a wall of status screens on the street face, a lit lobby
    u0, v0, u1, v1, h = 0.2, 0.98, 1.82, 1.82, 22
    ground_shadow(c, u0, v0, u1, v1)
    win = glass(key + "o", bay=4, floor=7, p=0.55, lo=12, hi=h - 3)
    prism(c, u0, v0, u1, v1, 2, h, pale, L=combine(top_band(3, col), win), R=combine(top_band(3, col), win, glass(key + "or", bay=5, floor=10, p=0.6, refl=False, lo=1, hi=10)), ao=False)
    screen(c, "L", v1, 0.62, 1.05, 4, 13, key + "s1", LED, kind="bars")
    screen(c, "L", v1, 1.1, 1.53, 4, 13, key + "s2", (246, 152, 198), kind="bars")
    screen(c, "L", v1, 1.58, 1.76, 4, 13, key + "s3", LIT_COOL, kind="ticker")
    doors(c, v1, 0.38, 10, w=0.13)
    prism(c, 0.2, v1, 0.56, v1 + 0.14, 9, 11, col, ao=False, rim=0)
    # rooftop: a dish and plant on the ops block
    prism(c, 1.3, 1.2, 1.7, 1.55, h, h + 4, CON_L, L=louvres(2), R=louvres(2), rim=0.03, ao=False)
    dish(c, 0.95, 1.45, h, r=6, facing=-1)
    return c


DRAWERS = {"compute": hq_compute, "storage": hq_storage, "database": hq_database, "networking": hq_networking,
           "security": hq_security, "aiml": hq_aiml, "management": hq_management}


def hq(col, key):
    return DRAWERS[key](col, key)
