"""
Management & Integration (stepfunctions cloudformation systemsmanager config organizations appsync): front buildings
lm_<id> and towers tw_<id> (see services/__init__.py). The district's colour is the AWS Management & Governance icon
pink (shared/world.json). Front buildings are offices and yards where things are run and kept in order:

  Step Functions   a rail switching yard: a signal box above a fan of tracks that branch like a flowchart
  CloudFormation   a blueprint drafting office: a studio under a north-light roof with a blueprint board on its wall
  Systems Manager  a fleet control room: a slate block with wall screens, a dish, and a yard of fleet cabinets
  Config           a records office: a stone hall with a checklist board on its wall and filing cabinets
  Organizations    a guild hall: a tall gable hall beside a family tree of flagpoles (plain pennants, no real flags)
  AppSync          a switchboard exchange: a brick exchange with a lit switchboard, devices synced by dotted arcs

Towers: stacked state boxes zig-zagging up a pink spine under a choice diamond (Step Functions); a shaft clad in
blueprint panels with a climbing crane in its core, finished at Master with a stack of three slabs (CloudFormation);
a shaft wearing a ring of gauges (Systems Manager); a stepped archive tower under a round tick badge (Config); a trunk
that branches into two account wings on sky bridges (Organizations); a round tower crowned by twin sync arrows
(AppSync).
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, GLASS_DK, GLASS_L, LED, LIT, LIT_COOL, RED, SIDE, STEEL,  # noqa: F401
                          STEEL_D, STEEL_M, STONE, A, Kit, beacon, bands, bridge, combine, dish, drum, drum_shadow, ellipse,
                          face, glass, ground_shadow, hv, lattice, leds, louvres, masonry, plant, podium, prism, punched,
                          rib_shader, ribbon_shader, ribs, screen, solid, tip, top_band)
from services.compute import CU, CV, H, canvas  # noqa: F401
from services.security import decal, lamp, post_sign  # noqa: F401

PINK = (231, 21, 123)  # the district's colour (AWS Management & Governance icons)
PINK_D = (168, 16, 92)
PINK_L = (246, 152, 198)
PANEL = (226, 220, 226)
CREAM = (234, 228, 212)
SLATE = (92, 100, 122)
BRICK = (170, 96, 76)
BLUEPRINT = (40, 96, 172)
BP_LINE = (176, 212, 244)
GREEN = (52, 178, 96)
GOLD = (250, 206, 60)
TEAL = (40, 170, 190)
WARM = (255, 236, 190)
RAIL = (150, 150, 160)


# ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────

def door(c, v1, m, h, w=0.13):
    face(c, "L", v1, m - w, m + w, 0, h, NAVY_D,
         lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 else (shade(STEEL_D, 0.9), None)), ao=False)


def track(c, pts, rail=RAIL, sleeper=WOOD_D):
    """A railway track along a polyline of (u, v) points on the ground: sleepers, then two rails."""
    for (ua, va), (ub, vb) in zip(pts, pts[1:]):
        du, dv = ub - ua, vb - va
        ln = math.hypot(du, dv)
        pu, pv = -dv / ln, du / ln
        for k in range(int(ln / 0.11) + 1):
            t = k * 0.11 / ln
            u, v = ua + du * t, va + dv * t
            c.line((u - pu * 0.1, v - pv * 0.1, 0), (u + pu * 0.1, v + pv * 0.1, 0), sleeper)
    for (ua, va), (ub, vb) in zip(pts, pts[1:]):
        du, dv = ub - ua, vb - va
        ln = math.hypot(du, dv)
        pu, pv = -dv / ln, du / ln
        for s in (-0.055, 0.055):
            c.line((ua + pu * s, va + pv * s, 0), (ub + pu * s, vb + pv * s, 0), shade(rail, 1.1 if s < 0 else 0.85))


def wagon(c, u, v, col, key):
    """A short goods wagon on the track at (u, v) (along u)."""
    for du in (0.08, 0.34):
        x, y = c.P(u + du, v + 0.06, 1)
        c.d.ellipse((x - 2, y - 2, x + 1, y + 1), fill=A(CHAR))
    prism(c, u, v - 0.09, u + 0.42, v + 0.09, 2, 8, col, L=combine(bands([(0, 1, shade(col, 0.6))]), ribs(3, 1.1, 0.86)),
          R=bands([(0, 1, shade(col, 0.6))]), rim=0.02, ao=False)


def signal(c, x, y, on):
    """A small signal head (two lamps, one lit)."""
    c.d.rectangle((x - 2, y - 7, x + 1, y), fill=A(NAVY_D))
    for k, col in enumerate((GREEN, RED)):
        yy = y - 6 + k * 3
        lit = col if k == on else shade(col, 0.4)
        c.d.rectangle((x - 1, yy, x, yy + 1), fill=A(lit))
        if k == on:
            c.ld.rectangle((x - 1, yy, x, yy + 1), fill=A(col))


def diamond(c, x, y, r, col=PINK, glow=True):
    """A screen-facing diamond (a flowchart choice) with its bottom point at (x, y)."""
    pts = [(x, y - 2 * r), (x + r, y - r), (x, y), (x - r, y - r)]
    c.d.polygon(pts, fill=A(PINK_D))
    c.d.polygon([(x, y - 2 * r + 2), (x + r - 2, y - r), (x, y - 2), (x - r + 2, y - r)], fill=A(col))
    c.d.polygon([(x, y - 2 * r + 2), (x, y - 2), (x - r + 2, y - r)], fill=A(shade(col, 1.15)))
    c.d.polygon([(x, y - r - 3), (x + 3, y - r), (x, y - r + 3), (x - 3, y - r)], fill=A(WHITE))
    if glow:
        c.ld.polygon(pts, fill=A(PINK_L, 110))
        c.ld.polygon([(x, y - r - 3), (x + 3, y - r), (x, y - r + 3), (x - 3, y - r)], fill=A(WHITE))


def blueprint(key, lo, hi, a=0.12, b=0.88, draw=True):
    """A blueprint board on a wall (face-space): blue, a light grid, a building drawn in white lines."""
    def g(i, n, z, h, base, side):
        i0, i1 = round(n * a), round(n * b)
        if not (i0 <= i < i1 and lo <= z < hi):
            return None
        if i in (i0, i1 - 1) or z in (lo, hi - 1):
            return shade(NAVY, SIDE[side] * 1.1), None
        j, zz = i - i0, z - lo
        w, hh = i1 - i0, hi - lo
        if draw:  # a little building outline: two walls, a roof line and a window row
            bx0, bx1 = round(w * 0.25), round(w * 0.7)
            if (j in (bx0, bx1) and 2 <= zz <= hh - 5) or (zz == hh - 5 and bx0 <= j <= bx1) or (zz == 2 and 1 < j < w - 1):
                return shade(WHITE, SIDE[side]), (BP_LINE if draw == "lit" else None)
            if zz == hh // 2 and bx0 < j < bx1 and j % 3 == 0:
                return shade(WHITE, SIDE[side]), None
        if j % 4 == 0 or zz % 4 == 0:
            return shade(mix_(BLUEPRINT, BP_LINE, 0.35), SIDE[side]), None
        return shade(BLUEPRINT, SIDE[side]), None
    return g


def mix_(a, b, t):
    return tuple(round(a[k] * (1 - t) + b[k] * t) for k in range(3))


def checklist(lo, rows, a=0.15, b=0.85, lit=True):
    """A checklist board on a wall: white, a pink header, rows of ticked boxes and lines (face-space)."""
    hi = lo + 4 + rows * 4

    def g(i, n, z, h, base, side):
        i0, i1 = round(n * a), round(n * b)
        if not (i0 <= i < i1 and lo <= z < hi):
            return None
        if i in (i0, i1 - 1) or z == lo:
            return shade(NAVY, SIDE[side] * 1.1), None
        if z >= hi - 3:
            return shade(PINK, SIDE[side]), None
        j, r = i - i0, (z - lo - 1) // 4
        zz = (z - lo - 1) % 4
        if 2 <= j <= 4 and zz in (1, 2, 3):  # the box with its tick
            tick = (j == 2 and zz == 2) or (j == 3 and zz == 1) or (j == 4 and zz in (2, 3))
            if tick:
                return shade(GREEN, SIDE[side] * 1.1), (GREEN if lit else None)
            return shade(STEEL_M, SIDE[side]), None
        if j >= 6 and j < i1 - i0 - 2 and zz == 2 and (j + r) % 7 != 0:
            return shade(STEEL_D, SIDE[side]), None
        return shade(WHITE, SIDE[side]), (WARM if lit and hv("cl", r, j // 6) < 0.25 else None)
    return g


def switchboard(key, lo, hi, a=0.1, b=0.9):
    """A switchboard on a wall: a wooden frame round rows of jack lamps, pink patch cords hanging across."""
    def g(i, n, z, h, base, side):
        i0, i1 = round(n * a), round(n * b)
        if not (i0 <= i < i1 and lo <= z < hi):
            return None
        if i in (i0, i1 - 1) or z in (lo, hi - 1):
            return shade(WOOD, SIDE[side]), None
        j, zz = i - i0, z - lo
        for k in range(3):  # cords: shallow diagonals between jacks
            s = 4 + k * 7
            if 0 <= j - s < 8 and zz == hi - lo - 3 - (j - s) // 2 - k * 2:
                return shade((PINK, GOLD, TEAL)[k], SIDE[side]), None
        if j % 3 == 1 and zz % 3 == 1:
            on = hv(key, j, zz) < 0.55
            return (shade(LIT if on else STEEL_D, 1.0), (LIT if on else None))
        return shade(NAVY_D, 1.25), None
    return g


def gauge_shader(key, rx, n=3, r=4.6, gap=9.5):
    """Gauges round a drum of screen half-width rx: round white dials with a navy rim and a needle (seeded), lit
    warm at night."""
    def g(th, z, h, base):
        x = math.sin(th) * rx  # screen offset (px) across the drum
        zc = (h - 1) / 2
        for k in range(n):
            xc = (k - (n - 1) / 2) * gap
            dx, dz = x - xc, z - zc
            d = math.hypot(dx, dz)
            if d <= r + 0.4:
                if d > r - 0.9:
                    return shade(NAVY, 1.2), None
                a = math.pi * (0.15 + 0.7 * hv(key, k))
                nx, nz = -math.cos(a), math.sin(a)
                t = dx * nx + dz * nz
                if 0 <= t <= r - 1.5 and abs(dx * nz - dz * nx) < 0.7:
                    return (PINK_D, None)
                return shade(WHITE, 0.94 if dx > 0 else 1.0), WARM
        return None
    return g


def pennant(c, x, y, col, w=10, right=True):
    s = 1 if right else -1
    c.d.polygon([(x, y), (x + s * w, y + 3), (x, y + 6)], fill=A(col))
    c.d.line([(x, y), (x + s * w, y + 3)], fill=A(shade(col, 1.2)))
    c.d.line([(x, y + 6), (x + s * w, y + 3)], fill=A(shade(col, 0.7)))


def flagpole(c, u, v, h, col, right=True):
    x, y = c.P(u, v)
    c.d.line([(x, y), (x, y - h)], fill=A(STEEL_M))
    c.d.point([(x, y - h - 1)], fill=A(GOLD))
    pennant(c, x + (1 if right else -1), y - h + 1, col, right=right)


# ── Step Functions ────────────────────────────────────────────────────────────────────────────────────────────────

def lm_stepfunctions(fw, fh, tier, col, key):
    """Step Functions Switching Yard: a signal box raised over a fan of tracks that branch like a flowchart (a
    branch more each tier); goods wagons from tier 2, a signal gantry over the tracks from 3, a relay hut and lamps
    at 4."""
    c = Kit(fw, fh, 70)
    c.poly([(0.1, 2.05, 0), (2.95, 2.05, 0), (2.95, 2.95, 0), (0.1, 2.95, 0)], (176, 168, 156))  # ballast
    track(c, [(0.12, 2.72), (2.92, 2.72)])
    track(c, [(0.7, 2.72), (1.2, 2.32), (2.92, 2.32)])
    if tier >= 2:
        track(c, [(1.5, 2.32), (1.9, 2.08), (2.92, 2.08)])
    # switch points: a pink lever box at each fork
    for u, v in ((0.62, 2.85), (1.42, 2.45))[: 1 + (tier >= 2)]:
        prism(c, u, v, u + 0.1, v + 0.08, 0, 3, col, rim=0, ao=False)
    # the signal box, behind the tracks on the right
    u0, v0, u1, v1 = 1.95, 1.2, 2.75, 1.85
    hb = 8 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, hb, BRICK, L=combine(top_band(2, col), masonry(3, 6, 0.88)), R=combine(top_band(2, col), masonry(3, 6, 0.88)))
    hc = hb + 10
    cab = lambda kk: combine(bands([(0, 1, PANEL)]), glass(key + kk, bay=4, floor=11, p=0.7, lo=1, hi=9))
    prism(c, u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, hb, hc, PANEL, L=cab("cl"), R=cab("cr"), roof=False, ao=False)
    c.pyramid(u0 - 0.12, v0 - 0.12, u1 + 0.12, v1 + 0.12, hc, 9, col)
    # its stair up the street face
    c.line((u0 + 0.05, v1 + 0.12, 0), (u0 + 0.45, v1 + 0.12, hb), STEEL_D, 2)
    if tier >= 2:  # wagons on the main line
        for k, wc in enumerate(((59, 130, 246), (255, 153, 0), (34, 170, 94))[: tier - 1]):
            wagon(c, 1.1 + k * 0.52, 2.72, wc, key + str(k))
    if tier >= 3:  # a signal gantry over the tracks
        gu = 0.42
        for v in (2.02, 2.92):
            prism(c, gu, v - 0.04, gu + 0.06, v + 0.02, 0, 22, STEEL_D, rim=0, ao=False)
        c.line((gu + 0.03, 2.0, 22), (gu + 0.03, 2.94, 22), STEEL_M, 2)
        for k, v in enumerate((2.32, 2.72)):
            x, y = c.P(gu + 0.03, v, 21)
            signal(c, x, y + 8, k % 2)
    if tier >= 4:  # a relay hut and lamps
        prism(c, 0.25, 1.75, 0.65, 2.0, 0, 9, CON_L, L=combine(top_band(2, col), louvres(2)), R=louvres(2))
        lamp(c, 2.85, 2.0)
        beacon(c, (u0 + u1) / 2, (v0 + v1) / 2, hc + 10)
    return c


def tw_stepfunctions(tier, k):
    """State boxes zig-zagging up a pink spine, an arrow under each, and a choice diamond on the crown."""
    if tier < 2:
        return None
    top_z = H[tier] - 8
    c = canvas(tier, extra=56)
    podium(c, 0.4, 0.4, 1.3, 1.3, 12, PANEL, k, accent=PINK)
    prism(c, 0.72, 0.72, 0.98, 0.98, 12, top_z, PINK, L=leds(k + "s", step=3, every=6, col=WHITE, p=0.5), R=leds(k + "sr", step=3, every=6, col=WHITE, p=0.5), ao=False)
    n = tier + 2
    step = (top_z - 12) / n
    hs = 0.3
    for i in range(n):
        zb, zt = 12 + round(i * step) + 4, 12 + round((i + 1) * step) - 4
        dx = 0 if i == n - 1 else (0.24 if i % 2 else -0.24)
        cu, cv = 0.85 + dx, 0.85 - dx
        dark = i % 2 == 1
        body = (70, 82, 108) if dark else (236, 234, 240)
        L = combine(top_band(2, PINK), glass(k + f"b{i}", bay=4, floor=7, p=0.5, lo=2, hi=zt - zb - 3))
        R = combine(top_band(2, PINK), punched(k + f"r{i}", bay=5, floor=7, ww=2, wh=4, p=0.45, lo=1) if not dark else glass(k + f"rb{i}", bay=4, floor=7, p=0.5, lo=2, hi=zt - zb - 3))
        prism(c, cu - hs, cv - hs, cu + hs, cv + hs, zb, zt, body, L=L, R=R, ao=False, zref=zb, href=zt - zb)
        if i < n - 1:  # the arrow up to the next state
            x, y = c.P(0.98, 0.98, zt + 7)
            c.d.polygon([(x - 4, y + 3), (x + 2, y + 3), (x - 1, y - 1)], fill=A(WHITE))
            c.ld.polygon([(x - 4, y + 3), (x + 2, y + 3), (x - 1, y - 1)], fill=A(PINK_L, 160))
    z = top_z
    prism(c, CU - 0.14, CV - 0.14, CU + 0.14, CV + 0.14, z, z + 3, PINK_D, ao=False, rim=0)
    x, y = c.P(CU, CV, z + 3)
    r = 9 + tier
    diamond(c, x, y, r)
    tip(c, CU, CV, z + 3 + 2 * r, h=7 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── CloudFormation ────────────────────────────────────────────────────────────────────────────────────────────────

def lm_cloudformation(fw, fh, tier, col, key):
    """CloudFormation Drafting Office: a cream studio under a mono-pitch north-light roof, a blueprint board on its
    street wall; a rack of rolled blueprints from tier 2, a model-shop wing from 3, a site sign and lamps at 4."""
    c = Kit(fw, fh, 70)
    if tier >= 3:  # the model-shop wing on the right
        a0, b0, a1, b1 = 2.15, 1.0, 2.85, 2.2
        wh = 12 + 2 * tier
        ground_shadow(c, a0, b0, a1, b1)
        prism(c, a0, b0, a1, b1, 0, wh, PANEL, L=combine(top_band(2, col), punched(key + "w", bay=5, floor=8, ww=3, wh=4, p=0.5, lo=2)),
              R=combine(top_band(2, col), punched(key + "wr", bay=5, floor=8, ww=3, wh=4, p=0.5, lo=2)))
        plant(c, a0 + 0.06, b0 + 0.06, a1 - 0.1, b1 - 0.5, wh, key + "wp", n=1)
    u0, v0, u1, v1 = 0.3, 1.7, 2.05, 2.6
    h = 14 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    win = punched(key + "s", bay=6, floor=10, ww=4, wh=6, p=0.6, lo=2)
    L = combine(top_band(2, col), blueprint(key, 3, h - 4, a=0.38, b=0.92, draw="lit" if tier >= 2 else True), win)
    R = combine(top_band(2, col), win)
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=L, R=R, roof=False)
    door(c, v1, 0.62, 10)
    prism(c, 0.4, v1, 0.84, v1 + 0.14, 9, 11, col, ao=False, rim=0)
    # the mono-pitch roof rising to the back with a glazed clerestory facing the street
    rise = 10
    face(c, "L", v0 + 0.3, u0, u1, h, h + rise, GLASS_DK, glass(key + "nl", bay=4, floor=rise + 2, p=0.65, lo=1), ao=False)
    c.poly([(u0 - 0.04, v0 + 0.3, h + rise), (u1 + 0.04, v0 + 0.3, h + rise), (u1 + 0.04, v0 - 0.04, h + rise - 3), (u0 - 0.04, v0 - 0.04, h + rise - 3)], (172, 178, 190))
    c.poly([(u0, v1 + 0.04, h), (u1 + 0.04, v1 + 0.04, h), (u1 + 0.04, v0 + 0.3, h), (u0, v0 + 0.3, h)], (196, 198, 204))
    c.poly([(u1 + 0.04, v0 + 0.3, h), (u1 + 0.04, v0 - 0.04, h), (u1 + 0.04, v0 - 0.04, h + rise - 3), (u1 + 0.04, v0 + 0.3, h + rise)], shade(CREAM, 0.72))
    c.line((u0 - 0.04, v0 + 0.3, h + rise), (u1 + 0.04, v0 + 0.3, h + rise), col)
    if tier >= 2:  # a rack of rolled blueprints by the door
        prism(c, 1.25, 2.72, 1.75, 2.86, 0, 5, WOOD, rim=0)
        for j in range(5):
            x, y = c.P(1.3 + j * 0.1, 2.79, 5)
            c.d.line([(x, y), (x, y - 5 - j % 2 * 2)], fill=A(BP_LINE if j % 2 else BLUEPRINT), width=2)
    if tier >= 4:
        post_sign(c, 2.0, 2.85, 12, 6, BLUEPRINT, ["W.W.W.W", "WWWWWWW", "W.....W", "WW.W.WW"], {"W": WHITE})
        lamp(c, 0.3, 2.85)
    return c


def bp_panels(key, done):
    """Blueprint cladding: blue panels with light grid lines; a finished tower has glass in every other bay."""
    def g(i, n, z, h, base, side):
        if z % 9 == 8:
            return shade(BP_LINE, SIDE[side] * 0.9), None
        if i % 6 == 0:
            return shade(BP_LINE, SIDE[side] * 0.8), None
        bay, fl = i // 6, z // 9
        if done and (bay + fl) % 2 == 0 and 2 <= z % 9 <= 6 and 1 <= i % 6 <= 4:
            gc = GLASS_L if side == "L" else GLASS_DK
            on = hv(key, side, bay, fl) < 0.55
            return gc, (LIT if on else None)
        if (i % 6 == 3 and z % 9 == 4):
            return shade(BP_LINE, SIDE[side]), None
        return shade(BLUEPRINT, SIDE[side] * (1.06 if (bay + fl) % 3 == 0 else 1.0)), None
    return g


def tw_cloudformation(tier, k):
    """A tower assembled from blueprint panels: under construction (open floors on top, a climbing crane in its
    core lifting a panel) until Master, when it is finished with glass bays and a stack of three slabs."""
    if tier < 2:
        return None
    top_z = H[tier] - 4
    c = canvas(tier, extra=56)
    podium(c, 0.4, 0.4, 1.3, 1.3, 12, PANEL, k, accent=PINK)
    u0, u1 = 0.52, 1.18
    done = tier >= 4
    built = top_z if done else round(12 + (top_z - 12) * 0.72)
    prism(c, u0, u0, u1, u1, 12, built, BLUEPRINT, L=combine(top_band(2, PINK), bp_panels(k, done)), R=combine(top_band(2, PINK), bp_panels(k + "r", done)),
          ao=False, zref=12, href=built - 12)
    if done:
        z = top_z
        for j, (a, b) in enumerate(((0.36, 1.34), (0.46, 1.24), (0.56, 1.14), (0.66, 1.04))):  # the stack: four layers
            prism(c, a, a, b, b, z, z + 7, (236, 234, 240) if j % 2 == 0 else BLUEPRINT,
                  L=combine(top_band(2, PINK), glass(k + f"st{j}", bay=4, floor=8, p=0.6, lo=1)), R=combine(top_band(2, PINK), glass(k + f"str{j}", bay=4, floor=8, p=0.6, lo=1)), ao=False)
            z += 7
        tip(c, CU, CV, z, h=14, beacon_col=RED)
        return c
    # the open floors above the cladding
    for z in range(built, top_z + 1, 9):
        prism(c, u0, u0, u1, u1, z, z + 1, CON_L, ao=False, rim=0)
        if z + 9 <= top_z:
            for (a, b) in ((u0, u1 - 0.05), (u1 - 0.05, u1 - 0.05), (u1 - 0.05, u0)):
                prism(c, a, b, a + 0.05, b + 0.05, z + 1, z + 9, STEEL_D, ao=False, rim=0)
    # the climbing crane: a mast through the core, the jib and counter-jib, a panel on the hook
    zc = top_z + 22
    lattice(c, CU, CV, built, zc, 3, 2, (230, 190, 40), step=5)
    x, y = c.P(CU, CV, zc - 4)
    c.d.line([(x - 18, y), (x + 34, y)], fill=A((230, 190, 40)), width=2)
    c.d.line([(x + 34, y), (x, y - 4)], fill=A(STEEL_M))
    c.d.line([(x - 18, y), (x, y - 4)], fill=A(STEEL_M))
    c.d.rectangle((x - 18, y + 1, x - 12, y + 5), fill=A(CON_D))
    c.d.rectangle((x + 1, y + 1, x + 5, y + 5), fill=A(NAVY))
    c.ld.rectangle((x + 2, y + 2, x + 4, y + 3), fill=A(LIT))
    hx = x + 26
    c.d.line([(hx, y + 1), (hx, y + 14)], fill=A(STEEL_D))
    c.d.rectangle((hx - 5, y + 14, hx + 4, y + 21), fill=A(NAVY))
    c.d.rectangle((hx - 4, y + 15, hx + 3, y + 20), fill=A(BLUEPRINT))
    c.d.line([(hx - 3, y + 17), (hx + 2, y + 17)], fill=A(BP_LINE))
    tip(c, CU, CV, zc, h=5, col=(230, 190, 40))
    return c


# ── Systems Manager ───────────────────────────────────────────────────────────────────────────────────────────────

def lm_systemsmanager(fw, fh, tier, col, key):
    """Systems Manager Control Room: a slate block with a long wall screen of the fleet's status; a dish from tier 2,
    a yard of fleet cabinets wired to it from 3, a second screen, lamps and a beacon at 4."""
    c = Kit(fw, fh, 70)
    if tier >= 3:  # the fleet: rows of cabinets on the right, wired to the control room
        for j in range(2 + (tier >= 4)):
            for i in range(3):
                u, v = 2.3 + j * 0.2, 1.05 + i * 0.42
                prism(c, u, v, u + 0.14, v + 0.26, 0, 12, (64, 72, 92), L=leds(key + f"f{i}{j}", step=2, every=3, p=0.7, lo=2, hi=11),
                      R=leds(key + f"fr{i}{j}", step=2, every=3, p=0.7, lo=2, hi=11), rim=0.02)
        c.line((2.25, 1.2, 1), (2.15, 1.75, 1), col)
    u0, v0, u1, v1 = 0.3, 1.75, 2.15, 2.6
    h = 14 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    win = glass(key + "w", bay=4, floor=8, p=0.55, lo=h - 6, hi=h - 2)
    prism(c, u0, v0, u1, v1, 0, h, SLATE, L=combine(top_band(2, col), win), R=combine(top_band(2, col), win, louvres(3, 0.88)))
    screen(c, "L", v1, 0.85, 2.0, 3, h - 7, key + "scr", LED, kind="bars")
    if tier >= 4:
        screen(c, "R", u1, 1.9, 2.5, 3, h - 7, key + "tick", PINK_L, kind="ticker")
    door(c, v1, 0.55, 9)
    prism(c, 0.33, v1, 0.77, v1 + 0.14, 8, 10, col, ao=False, rim=0)
    plant(c, u0 + 0.1, v0 + 0.08, u0 + 1.0, v1 - 0.2, h, key + "p", n=2)
    if tier >= 2:
        prism(c, 1.5, 1.95, 1.8, 2.25, h, h + 3, CON_L, ao=False, rim=0)
        dish(c, 1.65, 2.1, h + 3, r=6, facing=1)
    if tier >= 4:
        lamp(c, 2.4, 2.85)
        beacon(c, u1 - 0.1, v0 + 0.1, h + 1)
    return c


def tw_systemsmanager(tier, k):
    """A slate shaft wearing a ring of gauges near its top (one more ring band at Master), a pink cap and a mast."""
    if tier < 2:
        return None
    top_z = H[tier] - 4
    c = canvas(tier, extra=50)
    podium(c, 0.4, 0.4, 1.3, 1.3, 12, PANEL, k, accent=PINK)
    u0, u1 = 0.6, 1.1
    wall = lambda kk: combine(top_band(2, PINK), glass(k + kk, bay=4, floor=6, p=0.5, lo=0, spandrel=SLATE))
    zr = top_z - 30
    prism(c, u0, u0, u1, u1, 12, top_z, SLATE, L=wall("l"), R=wall("r"), ao=False, zref=12, href=top_z - 12)
    # the gauge ring
    from services.kit import RX
    drum(c, CU, CV, zr - 3, zr, 0.64, PINK, ao=False, cap=True)
    drum(c, CU, CV, zr, zr + 13, 0.62, (236, 236, 242), shader=gauge_shader(k, 0.62 * RX), ao=False, capcol=(214, 214, 224))
    drum(c, CU, CV, zr + 13, zr + 16, 0.64, PINK, ao=False)
    if tier >= 3:  # a second, smaller ring of status lamps lower down
        zl = 12 + (top_z - 12) // 3
        drum(c, CU, CV, zl, zl + 5, 0.42, SLATE, shader=lambda th, z, h, b: ((LED, LED) if z == 2 and round(th * 6) % 2 == 0 else None), ao=False)
    # the shaft above the ring and its cap
    prism(c, u0 + 0.06, u0 + 0.06, u1 - 0.06, u1 - 0.06, zr + 16, top_z + 4, SLATE, L=wall("l2"), R=wall("r2"), ao=False)
    z = top_z + 4
    prism(c, CU - 0.18, CV - 0.18, CU + 0.18, CV + 0.18, z, z + 4, PINK, ao=False, rim=0)
    tip(c, CU, CV, z + 4, h=14 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Config ────────────────────────────────────────────────────────────────────────────────────────────────────────

def tick_badge(c, x, y, r, lit=True):
    """A round badge facing the street with a white tick, its bottom at (x, y). Returns its height."""
    cy = y - r
    c.d.ellipse((x - r - 1, cy - r - 1, x + r, cy + r), fill=A(PINK_D))
    c.d.ellipse((x - r, cy - r, x + r - 1, cy + r - 1), fill=A(PINK))
    c.d.arc((x - r, cy - r, x + r - 1, cy + r - 1), 130, 230, fill=A(PINK_L))
    s = r / 9
    pts = [(x - 5 * s, cy), (x - 2 * s, cy + 3 * s), (x + 5 * s, cy - 4 * s)]
    c.d.line([(round(a), round(b)) for a, b in pts], fill=A(WHITE), width=max(2, round(2 * s)))
    if lit:
        c.ld.ellipse((x - r - 3, cy - r - 3, x + r + 2, cy + r + 2), fill=A(PINK_L, 90))
        c.ld.line([(round(a), round(b)) for a, b in pts], fill=A(WHITE), width=max(2, round(2 * s)))
    return 2 * r + 1


def lm_config(fw, fh, tier, col, key):
    """Config Records Office: a stone hall under a pink gable with a checklist board on its street wall (a row
    more each tier); filing cabinets from tier 2, an archive wing from 3, lamps at 4."""
    c = Kit(fw, fh, 70)
    if tier >= 3:  # the archive wing
        a0, b0, a1, b1 = 2.15, 0.95, 2.85, 2.3
        wh = 14 + 2 * tier
        ground_shadow(c, a0, b0, a1, b1)
        arch = combine(top_band(3, col), punched(key + "a", bay=4, floor=7, ww=2, wh=4, p=0.45, lo=3), masonry(4, 8, 0.9))
        prism(c, a0, b0, a1, b1, 0, wh, STONE, L=arch, R=arch)
        plant(c, a0 + 0.06, b0 + 0.06, a1 - 0.1, b1 - 0.6, wh, key + "ap", n=1, antennas=1)
    u0, v0, u1, v1 = 0.35, 1.8, 2.0, 2.6
    h = 16 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    rows = 1 + tier
    L = combine(top_band(2, col), checklist(3, rows, a=0.4, b=0.92), punched(key + "h", bay=6, floor=9, ww=3, wh=5, p=0.55, lo=2), masonry(4, 10, 0.92))
    R = combine(top_band(2, col), punched(key + "hr", bay=6, floor=9, ww=3, wh=5, p=0.55, lo=2), masonry(4, 10, 0.92))
    prism(c, u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, 0, 2, STONE, rim=0)
    prism(c, u0, v0, u1, v1, 2, h, CREAM, L=L, R=R, roof=False, ao=False)
    c.gable(u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, h, 9, col)
    c.line((u0 - 0.06, (v0 + v1) / 2, h + 9), (u1 + 0.06, (v0 + v1) / 2, h + 9), shade(col, 1.3))
    door(c, v1, 0.6, 11)
    prism(c, 0.4, v1, 0.8, v1 + 0.14, 0, 1, STONE, ao=False, rim=0)
    if tier >= 2:  # filing cabinets by the door
        for i in range(tier - 1):
            u = 0.95 + i * 0.2
            prism(c, u, 2.72, u + 0.16, 2.88, 0, 9, STEEL_M, L=lambda ii, n, z, hh, b, s: ((shade(b, 0.7), None) if z % 3 == 2 else (shade(STEEL_D, 1.0), None) if ii == n // 2 and z % 3 == 1 else None), rim=0)
    if tier >= 4:
        lamp(c, 2.3, 2.8)
        lamp(c, 0.2, 2.8)
    return c


def tw_config(tier, k):
    """A stepped archive tower (setbacks at a third and two thirds) with checkbox windows, under a round badge with
    a white tick."""
    if tier < 2:
        return None
    top_z = H[tier] - 22
    c = canvas(tier, extra=60)
    podium(c, 0.38, 0.38, 1.32, 1.32, 12, STONE, k, accent=PINK)

    def boxes(kk):
        def g(i, n, z, h, base, side):
            if i < 1 or i >= n - 1 or z >= h - 3:
                return None
            bi, fz = i % 5, z % 7
            if 1 <= bi <= 3 and 2 <= fz <= 4:
                ticked = hv(k, kk, i // 5, z // 7) < 0.6
                if ticked and ((bi == 1 and fz == 3) or (bi == 2 and fz == 2) or (bi == 3 and fz == 4)):
                    return shade(GREEN, SIDE[side] * 1.1), GREEN
                return shade(GLASS_L if side == "L" else GLASS_DK, 1.0), (LIT if hv(k, kk, "l", i // 5, z // 7) < 0.35 else None)
            return None
        return combine(top_band(2, PINK), g, masonry(7, 10, 0.92))
    cuts = [12, 12 + (top_z - 12) * 5 // 9, 12 + (top_z - 12) * 8 // 9, top_z]
    for s, (a, b) in enumerate(((0.5, 1.2), (0.58, 1.12), (0.66, 1.04))):
        prism(c, a, a, b, b, cuts[s], cuts[s + 1], CREAM, L=boxes(f"l{s}"), R=boxes(f"r{s}"), ao=False, zref=cuts[s], href=cuts[s + 1] - cuts[s])
    z = top_z
    prism(c, CU - 0.12, CV - 0.12, CU + 0.12, CV + 0.12, z, z + 4, PINK_D, ao=False, rim=0)
    x, y = c.P(CU, CV, z + 4)
    bh = tick_badge(c, x, y, 9 + tier)
    tip(c, CU, CV, z + 4 + bh, h=6 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Organizations ─────────────────────────────────────────────────────────────────────────────────────────────────

FLAG_COLS = [PINK, WHITE, TEAL, GOLD, (59, 130, 246), (34, 170, 94), PINK_L]


def lm_organizations(fw, fh, tier, col, key):
    """Organizations Guild Hall: a hall with a tall gable to the street, and on its lawn a family tree of flagpoles
    joined by paths (a root, then branches, then leaves as tiers grow; plain pennants, no real flags); lamps at 4."""
    c = Kit(fw, fh, 76)
    # the lawn's paths: a tree from the root at the front
    root = (2.3, 2.8)
    kids = [(1.95, 2.25), (2.65, 2.25)]
    leaves = [(1.75, 1.75), (2.15, 1.75), (2.5, 1.7), (2.85, 1.75)]
    for a in kids:
        c.line((root[0], root[1], 0), (a[0], a[1], 0), (214, 206, 186), 2)
    if tier >= 3:
        for j, a in enumerate(leaves):
            c.line((kids[j // 2][0], kids[j // 2][1], 0), (a[0], a[1], 0), (214, 206, 186), 2)
    # the hall: gable end to the street (ridge along v)
    u0, v0, u1, v1 = 0.35, 1.6, 1.45, 2.65
    h = 18 + 2 * tier
    g = 12 + tier
    ground_shadow(c, u0, v0, u1, v1)
    win = punched(key + "h", bay=6, floor=10, ww=3, wh=6, p=0.55, lo=2)
    arch = lambda i, n, z, hh, b, s: (((LIT, LIT) if abs(i - n / 2) < 3 and z < 13 else (shade(NAVY_D, 1.2), None)) if abs(i - n / 2) < 4 and z < 14 else None)
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=combine(top_band(2, col), arch, masonry(4, 10, 0.92)), R=combine(top_band(2, col), win, masonry(4, 10, 0.92)), roof=False)
    um = (u0 + u1) / 2
    face_tri = [(u0 - 0.04, v1 + 0.04, h), (u1 + 0.04, v1 + 0.04, h), (um, v1 + 0.04, h + g)]
    c.poly(face_tri, shade(CREAM, 0.9))
    c.poly([(um, v0 - 0.06, h + g), (um, v1 + 0.04, h + g), (u1 + 0.06, v1 + 0.04, h), (u1 + 0.06, v0 - 0.06, h)], shade(col, 0.78))
    c.line((u0 - 0.04, v1 + 0.04, h), (um, v1 + 0.04, h + g), shade(col, 1.1), 2)
    c.line((um, v1 + 0.04, h + g), (u1 + 0.06, v1 + 0.04, h), shade(col, 0.9), 2)
    x, y = c.P(um, v1 + 0.04, h + g // 2 - 1)  # a round window in the gable
    c.d.ellipse((x - 3, y - 3, x + 2, y + 2), fill=A(NAVY))
    c.d.ellipse((x - 2, y - 2, x + 1, y + 1), fill=A(LIT))
    c.ld.ellipse((x - 2, y - 2, x + 1, y + 1), fill=A(LIT))
    prism(c, um - 0.3, v1, um + 0.3, v1 + 0.12, 0, 1, STONE, ao=False, rim=0)
    # the flagpoles: leaves at the back first, then branches, then the root
    if tier >= 3:
        for j, (u, v) in enumerate(leaves[: 2 + 2 * (tier >= 4)] if tier < 4 else leaves):
            flagpole(c, u, v, 22, FLAG_COLS[(j + 3) % len(FLAG_COLS)], right=j % 2 == 1)
    if tier >= 2:
        for j, (u, v) in enumerate(kids):
            flagpole(c, u, v, 30, FLAG_COLS[j + 1], right=j == 1)
    else:
        flagpole(c, kids[0][0], kids[0][1], 28, WHITE, right=False)
    flagpole(c, root[0], root[1], 40, col)
    if tier >= 4:
        lamp(c, 1.6, 2.85)
        lamp(c, 0.25, 2.85)
    return c


def tw_organizations(tier, k):
    """A trunk that branches into account wings: a tall central shaft and two lower wings to either side joined to it
    by sky bridges (a bridge more each tier), pink caps on the wings and a mast on the trunk."""
    if tier < 2:
        return None
    top_z = H[tier] - 4
    c = canvas(tier, extra=50)
    podium(c, 0.3, 0.3, 1.4, 1.4, 12, PANEL, k, accent=PINK)
    hw = top_z * 3 // 5
    wall = lambda kk: combine(top_band(3, PINK), glass(k + kk, bay=4, floor=6, p=0.5, lo=0))
    wings = [(0.85 - 0.5, 0.85 + 0.5), (0.85 + 0.5, 0.85 - 0.5)]  # screen left and screen right
    for j, (cu, cv) in enumerate(wings):
        s = 0.2
        ground_shadow(c, cu - s, cv - s, cu + s, cv + s)
        prism(c, cu - s, cv - s, cu + s, cv + s, 0, hw, (230, 228, 236), L=wall(f"wl{j}"), R=wall(f"wr{j}"), zref=0, href=hw)
        prism(c, cu - s - 0.03, cv - s - 0.03, cu + s + 0.03, cv + s + 0.03, hw, hw + 4, PINK, ao=False, rim=0)
        c.pyramid(cu - s, cv - s, cu + s, cv + s, hw + 4, 8, PINK_D)
    # the trunk
    u0, u1 = 0.6, 1.1
    prism(c, u0, u0, u1, u1, 12, top_z, (70, 82, 108), L=wall("tl"), R=wall("tr"), ao=False, zref=12, href=top_z - 12)
    # sky bridges from the trunk out to each wing
    nb = tier - 1
    for b in range(nb):
        z = hw - 14 - b * 22
        bridge(c, 0.38, 0.95, 0.72, 1.12, z, z + 6, PINK, k + f"bl{b}")
        bridge(c, 0.95, 0.38, 1.12, 0.72, z, z + 6, PINK, k + f"br{b}")
    z = top_z
    prism(c, u0 + 0.08, u0 + 0.08, u1 - 0.08, u1 - 0.08, z, z + 8, PINK, L=bands([(3, 4, WHITE)]), R=bands([(3, 4, WHITE)]), ao=False)
    tip(c, CU, CV, z + 8, h=16 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── AppSync ───────────────────────────────────────────────────────────────────────────────────────────────────────

def sync_arrows(c, x, cy, r, col=PINK, lit=True):
    """Twin sync arrows chasing round a circle centred at (x, cy), facing the street."""
    box = (x - r, cy - r, x + r - 1, cy + r - 1)
    for a0, a1 in ((200, 330), (20, 150)):
        c.d.arc(box, a0, a1, fill=A(PINK_D), width=4)
        c.d.arc((box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1), a0, a1, fill=A(col), width=2)
        if lit:
            c.ld.arc(box, a0, a1, fill=A(PINK_L), width=3)
    # arrowheads at the ends of each arc (at 330° and 150°)
    for ang, d in ((330, 1), (150, -1)):
        t = math.radians(ang)
        ex, ey = x + math.cos(t) * (r - 1.5), cy + math.sin(t) * (r - 1.5)
        tx, ty = -math.sin(t), math.cos(t)  # the arc's direction of travel
        pts = [(ex + tx * 5, ey + ty * 5), (ex - math.cos(t) * 4, ey - math.sin(t) * 4), (ex + math.cos(t) * 4, ey + math.sin(t) * 4)]
        c.d.polygon([(round(a), round(b)) for a, b in pts], fill=A(col))
        if lit:
            c.ld.polygon([(round(a), round(b)) for a, b in pts], fill=A(PINK_L))


def lm_appsync(fw, fh, tier, col, key):
    """AppSync Exchange: a brick telephone exchange with a lit switchboard on its street wall and an aerial; device
    kiosks out front (one more each tier) synced to it by dotted arcs; lamps at 4."""
    c = Kit(fw, fh, 70)
    u0, v0, u1, v1 = 0.3, 1.6, 1.8, 2.5
    h = 18 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1)
    L = combine(top_band(3, col), switchboard(key, 3, h - 6, a=0.42, b=0.94), punched(key + "e", bay=6, floor=9, ww=3, wh=5, p=0.5, lo=3), masonry(3, 6, 0.9))
    R = combine(top_band(3, col), punched(key + "er", bay=6, floor=9, ww=3, wh=5, p=0.5, lo=3), masonry(3, 6, 0.9))
    prism(c, u0, v0, u1, v1, 0, h, BRICK, L=L, R=R)
    door(c, v1, 0.6, 10)
    prism(c, 0.38, v1, 0.82, v1 + 0.14, 9, 11, col, ao=False, rim=0)
    # an aerial on the roof
    x, y = c.P(1.4, 1.85, h)
    c.d.line([(x, y), (x, y - 14 - tier * 2)], fill=A(STEEL_D))
    for k in range(3):
        c.d.line([(x - 3 + k, y - 8 - k * 4), (x + 3 - k, y - 8 - k * 4)], fill=A(STEEL_M))
    c.d.point([(x, y - 15 - tier * 2)], fill=A(RED))
    c.light(x, y - 15 - tier * 2, RED)
    # device kiosks (phone, tablet, laptop shapes) and the arcs that sync them to the exchange
    spots = [(2.2, 2.75, "phone"), (2.55, 2.2, "tablet"), (2.8, 2.75, "phone"), (2.3, 1.6, "tablet")][:tier]
    ax, ay = c.P(u1, v1 - 0.2, h - 4)
    for j, (u, v, kind) in enumerate(spots):
        w = 0.1 if kind == "phone" else 0.18
        hh = 12 if kind == "phone" else 10
        prism(c, u - w, v - 0.05, u + w, v + 0.05, 0, hh, NAVY, L=lambda i, n, z, H_, b, s: ((shade(LIT_COOL, 0.95), LIT_COOL) if 0 < i < n - 1 and 2 <= z < H_ - 2 else None), rim=0)
        bx, by = c.P(u, v, hh + 2)
        mx, my = (ax + bx) / 2, min(ay, by) - 10 - j * 2
        for t in [s / 9 for s in range(1, 9)]:
            px = round((1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx)
            py = round((1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by)
            c.d.point([(px, py)], fill=A(col))
            c.light(px, py, PINK_L)
    if tier >= 4:
        lamp(c, 0.2, 2.8)
    return c


def tw_appsync(tier, k):
    """A round tower with ribbon windows and pink bands, crowned by twin sync arrows on a ring frame."""
    if tier < 2:
        return None
    top_z = H[tier] - 22
    c = canvas(tier, extra=62)
    podium(c, 0.4, 0.4, 1.3, 1.3, 12, PANEL, k, accent=PINK)
    drum(c, CU, CV, 12, top_z, 0.36, (232, 230, 238), shader=combine_drum(ribbon_shader(k, floor=7, win=3, p=0.5, spandrel=PINK_L), None), ao=False)
    for zb in range(12 + 30, top_z - 10, 34):
        drum(c, CU, CV, zb, zb + 2, 0.38, PINK, ao=False, cap=False)
    drum(c, CU, CV, top_z, top_z + 4, 0.3, PINK, ao=False)
    z = top_z + 4
    x, y = c.P(CU, CV, z)
    c.d.line([(x, y), (x, y - 4)], fill=A(STEEL_D), width=2)
    r = 12 + tier
    cy = y - 4 - r
    sync_arrows(c, x, cy, r)
    tip(c, CU, CV, z + 4 + 2 * r, h=6 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


def combine_drum(*fs):
    def g(th, z, h, base):
        for f in fs:
            if f is None:
                continue
            r = f(th, z, h, base)
            if r is not None:
                return r
        return None
    return g
