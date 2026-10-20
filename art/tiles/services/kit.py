"""
Building kit for the service buildings: well-shaded parts in the team pack's light (sun from the left: left faces
x0.9, right faces x0.72, tops x1.04, as Canvas.box), painted pixel by pixel so every face can carry a pattern
(curtain wall, punched windows, ribs, louvres) and its night lights.

  Kit                a Canvas with a ground-shadow layer (composited under the outline) and a recorded tip
  face / prism       one wall / a box whose faces take shaders; ambient occlusion at the base, a lit corner edge
  drum               an upright solid of revolution (cylinder, taper, bucket, dome) with banded round shading
  slab_rot           a rotated floor slab (twisting towers)
  shaders            glass (curtain wall), punched (window grid), ribs, louvres, bands, combine
  podium             a base storey: stone, a glass lobby, a canopy over the doors and steps
  plant              rooftop plant: AC units with fans, a water tank on legs, antennas
  bridge, screen, beacon, lattice, dish, tip

Coordinates are Canvas footprint space: u grid x (down-right), v grid y (down-left), z pixels up. Faces visible are
the left (+v) and right (+u); paint back to front (small u + v first). A tower's tip (`tip`) must be its highest
pixel on the lot's centre line u = v, where the legend crowns stand (Landmark.setLevel: the sprite's top centre).
"""
import hashlib
import math

from PIL import Image, ImageDraw

from generate_tiles import (A, CLEAR, CON_D, CON_L, CON_M, GLASS, GLASS_D, HH, HW, NAVY, NAVY_D, ORANGE,  # noqa: F401
                            WHITE, Canvas, shade)

RX, RY = HW * math.sqrt(2), HH * math.sqrt(2)  # screen radii of a one-tile circle on the ground
SIDE = {"L": 0.9, "R": 0.72, "T": 1.04}
# the sun's horizontal direction split into the screen frame (toward the viewer, screen right), for round shading
_SF, _SR = (0.27 + 0.72) / math.sqrt(2), (0.27 - 0.72) / math.sqrt(2)

LIT = (255, 214, 120)
LIT_COOL = (214, 236, 255)
LED = (110, 240, 150)
RED = (232, 64, 56)
SKY = (192, 230, 248)
GLASS_L = (156, 208, 238)
GLASS_M = (112, 168, 212)
GLASS_DK = (74, 116, 164)
GLASS_DD = (50, 80, 124)
STEEL = (220, 228, 236)
STEEL_M = (164, 176, 190)
STEEL_D = (98, 110, 126)
STONE = (204, 196, 182)
CHAR = (70, 76, 90)
SHADOW = (16, 20, 34)


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def hv(*parts):
    """A stable hash in [0, 1) of anything printable (lit windows, per-bay choices)."""
    return int(hashlib.md5(repr(parts).encode()).hexdigest()[:8], 16) / 0x100000000


def tone(d):
    """Round-surface shade from the sun term d (box faces: left 0.72 → 0.9, right 0.27 → 0.72), banded."""
    t = max(0.62, min(0.96, 0.612 + 0.4 * d))
    return round(t * 12) / 12


class Kit(Canvas):
    """A Canvas with a soft ground shadow under the outline, lights cleared where nearer paint covers them, and the
    tower's tip (canvas px) once `tip` is drawn."""

    def __init__(self, fw, fh, zmax, pad=2):
        super().__init__(fw, fh, zmax, pad)
        self.shadow = Image.new("RGBA", (self.w, self.h), CLEAR)
        self.sd = ImageDraw.Draw(self.shadow)
        self.px, self.lpx = self.img.load(), self.lights.load()
        self.tip = None

    def poly(self, pts, fill, d=None):
        super().poly(pts, fill, d)
        if d is None:
            self.ld.polygon([self.P(*p) for p in pts], fill=CLEAR)

    def put(self, x, y, col, lit=None):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = A(col)
            self.lpx[x, y] = A(lit) if lit is not None and len(lit) == 3 else (lit or CLEAR)

    def light(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.lpx[x, y] = A(col) if len(col) == 3 else col

    def Pf(self, u, v, z=0):
        return self.ox + (u - v) * HW, self.oy + (u + v) * HH - z

    def finish(self, do_outline=True):
        img, anchor, lit = super().finish(do_outline)
        out = self.shadow.copy()
        out.alpha_composite(img)
        return out, anchor, lit


# ── shaders: f(i, n, z, h, base, side) -> (rgb, light) or None to pass ────────────────────────────────────────────

def combine(*fs):
    def f(i, n, z, h, base, side):
        for g in fs:
            if g is None:
                continue
            r = g(i, n, z, h, base, side)
            if r is not None:
                return r
        return base, None
    return f


def solid(col=None, f=1.0):
    def g(i, n, z, h, base, side):
        return (shade(col, SIDE[side] * f) if col else shade(base, f)), None
    return g


def bands(spec):
    """spec: [(z0, z1, rgb)] in face-local px; painted at the face's side tone."""
    def g(i, n, z, h, base, side):
        for z0, z1, col in spec:
            if z0 <= z < z1:
                return shade(col, SIDE[side]), None
        return None
    return g


def top_band(depth, col):
    """A cap band in the last `depth` px of the face (a cornice in an accent colour)."""
    def g(i, n, z, h, base, side):
        if z >= h - depth:
            return shade(col, SIDE[side] * (1.08 if z == h - 1 else 1.0)), None
        return None
    return g


def ribs(step=3, hi=1.1, lo=0.84):
    """Vertical ribs / corrugation: a lit edge then a shadow every `step` px."""
    def g(i, n, z, h, base, side):
        k = i % step
        return (shade(base, hi) if k == 0 else shade(base, lo) if k == step - 1 else base), None
    return g


def louvres(step=3, lo=0.8):
    def g(i, n, z, h, base, side):
        if z % step == 0 and 1 < z < h - 1:
            return shade(base, lo), None
        return None
    return g


DARK_GLASS = {"L": ((52, 78, 112), (64, 96, 134), (84, 122, 162)), "R": ((36, 52, 80), (44, 66, 98), (58, 86, 122))}


def glass(key, bay=4, floor=5, p=0.55, frame=None, spandrel=None, refl=True, lo=0, hi=None, palette=None, per_floor=False):
    """A curtain wall: mullions every `bay` px, a spandrel line every `floor` px, glass graded from sky (top) to
    deep (bottom), a diagonal sky reflection, and seeded lit panes on the lights layer (warm and a few cool;
    per_floor lights whole floors, which reads calmer on narrow or leaning shafts)."""
    def g(i, n, z, h, base, side):
        if z < lo or (hi is not None and z >= hi):
            return None
        fz = (z - lo) % floor
        fr = frame or (STEEL if side == "L" else STEEL_M)
        if fz == floor - 1:
            return (spandrel and shade(spandrel, SIDE[side])) or shade(fr, 0.86), None
        if i % bay == 0:
            return fr, None
        top = 1.0 if hi is None else 1.0
        t = (z / max(1, (hi or h))) * top
        pal = palette[side] if palette else (GLASS_M, GLASS_L, SKY) if side == "L" else (GLASS_DD, GLASS_DK, GLASS_M)
        k = 0 if t < 0.35 else 1 if t < 0.75 else 2
        if refl and (z + i * 0.9) % 37 < 5:
            k = min(2, k + 1)
        col = pal[k]
        if fz == floor - 2:  # the head of the pane: a shadow under the floor slab
            col = shade(col, 0.88)
        w = hv(key, (z - lo) // floor) if per_floor else hv(key, side, i // bay, (z - lo) // floor)
        lit = None
        if w < p:
            lit = LIT if w < p * 0.75 else LIT_COOL
        return col, lit
    return g


def punched(key, bay=5, floor=7, ww=3, wh=4, p=0.5, lo=0, hi=None, glass_col=None, sill=True):
    """A wall with a grid of punched windows: recessed (shadow on the head and the near jamb), a light sill."""
    off = (bay - ww) // 2

    def g(i, n, z, h, base, side):
        if z < lo or (hi is not None and z >= hi) or z > h - 3:
            return None
        bi, fz = i % bay, (z - lo) % floor
        if i < 1 or i >= n - 1:
            return None
        if off <= bi < off + ww and 2 <= fz < 2 + wh:
            gc = glass_col or (GLASS_L if side == "L" else GLASS_DK)
            if fz == 1 + wh or bi == (off if side == "L" else off + ww - 1):
                gc = shade(gc, 0.72)
            w = hv(key, side, i // bay, (z - lo) // floor)
            return gc, ((LIT if w < p * 0.8 else LIT_COOL) if w < p else None)
        if sill and off <= bi < off + ww and fz == 1:
            return shade(base, 1.12), None
        return None
    return g


def masonry(course=4, bond=6, lo=0.84):
    """Stone or brick in running bond: a joint every `course` px, vertical joints offset on alternate courses."""
    def g(i, n, z, h, base, side):
        if z % course == course - 1 or (i + (bond // 2) * ((z // course) % 2)) % bond == 0:
            return shade(base, lo), None
        return None
    return g


def leds(key, step=4, every=5, col=LED, p=0.6, lo=0, hi=None):
    """Rows of status LEDs (server racks): a dot every `step` px on rows every `every` px, most lit at night."""
    def g(i, n, z, h, base, side):
        if z < lo or (hi is not None and z >= hi):
            return None
        if (z - lo) % every == 2 and i % step == 1 and 1 < i < n - 1:
            on = hv(key, side, i, z) < p
            return (col if on else shade(col, 0.45)), (col if on else None)
        return None
    return g


# ── walls and boxes ───────────────────────────────────────────────────────────────────────────────────────────────

def face(c, side, fixed, a, b, z0, z1, col, shader=None, ao=True, edge=True, zref=None, href=None):
    """One wall, painted per pixel. side 'L': v = fixed, u from a to b. side 'R': u = fixed, v from a to b.
    zref / href: the shader sees z from zref and a height href (a shaft drawn in slices keeps one pattern).
    A pixel the shader returns None for is left as it is: face() alone paints a decal over a wall already drawn."""
    base = shade(col, SIDE[side])
    if side == "L":
        x0, x1 = round(c.ox + (a - fixed) * HW), round(c.ox + (b - fixed) * HW)
    else:
        x0, x1 = round(c.ox + (fixed - b) * HW), round(c.ox + (fixed - a) * HW)
    n, h = x1 - x0, z1 - z0
    for i in range(n):
        x = x0 + i
        if side == "L":
            yb = c.oy + (fixed + (x + 0.5 - c.ox) / HW + fixed) * HH
        else:
            yb = c.oy + (fixed + fixed - (x + 0.5 - c.ox) / HW) * HH
        ybot, ytop = round(yb - z0), round(yb - z1)
        for y in range(ytop, ybot):
            z = ybot - 1 - y
            zs = z if zref is None else z + z0 - zref
            r = shader(i, n, zs, href or h, base, side) if shader else (base, None)
            if r is None:
                continue
            col_, lit = r
            if ao and z < 3:
                col_ = shade(col_, (0.78, 0.87, 0.94)[z])
            if edge and side == "L" and i == n - 1 and lit is None:
                col_ = shade(col_, 1.1)
            c.put(x, y, col_, lit)


def top(c, u0, v0, u1, v1, z, col, rim=0.05):
    """A flat roof with a parapet: a lit rim round a slightly darker deck."""
    c.poly([(u0, v0, z), (u1, v0, z), (u1, v1, z), (u0, v1, z)], shade(col, 1.06))
    if rim and u1 - u0 > 2 * rim + 0.05 and v1 - v0 > 2 * rim + 0.05:
        c.poly([(u0 + rim, v0 + rim, z), (u1 - rim, v0 + rim, z), (u1 - rim, v1 - rim, z), (u0 + rim, v1 - rim, z)], shade(col, 0.9))


def prism(c, u0, v0, u1, v1, z0, z1, col, L=None, R=None, roof=True, rim=0.05, ao=None, roofcol=None, zref=None, href=None):
    """A box with shaded faces (shaders L / R), ambient occlusion where it stands (on the ground, by default). A face
    is always solid: where its shader returns None the wall takes its base colour (combine), so a bare louvres or
    bands never leaves a hollow wall."""
    occl = (z0 <= 1) if ao is None else ao
    face(c, "L", v1, u0, u1, z0, z1, col, L and combine(L), ao=occl, zref=zref, href=href)
    face(c, "R", u1, v0, v1, z0, z1, col, R and combine(R), ao=occl, zref=zref, href=href)
    if roof:
        top(c, u0, v0, u1, v1, z1, roofcol or col, rim)
    return z1


def ground_shadow(c, u0, v0, u1, v1, spread=0.14, alpha=80):
    """Ambient occlusion on the ground round a footprint: a soft band along the visible sides, darkest at the wall."""
    for k, (s, a) in enumerate(((spread, alpha // 2), (spread * 0.5, alpha))):
        pts = [(u0 - s * 0.3, v1 + s), (u1 + s, v1 + s), (u1 + s, v0 - s * 0.3), (u1, v0), (u1, v1), (u0, v1)]
        c.sd.polygon([c.P(u, v, 0) for u, v in pts], fill=A(SHADOW, a))


def drum_shadow(c, u, v, r, alpha=80):
    x, y = c.Pf(u, v, 0)
    for s, a in ((1.25, alpha // 2), (1.1, alpha)):
        c.sd.ellipse((x - r * RX * s, y - r * RY * s + 1, x + r * RX * s + 2, y + r * RY * s + 2), fill=A(SHADOW, a))


# ── round things ──────────────────────────────────────────────────────────────────────────────────────────────────

def drum(c, u, v, z0, z1, r0, col, r1=None, profile=None, shader=None, cap=True, capcol=None, gloss=False, ao=None):
    """An upright solid of revolution: radius r0 → r1 (tiles) or profile(t) for t in [0, 1]. shader(theta, z, h,
    base) -> (rgb, light) or None; theta is the angle round the axis (0 faces the viewer, -pi/2 the left edge)."""
    cx, cyb = c.Pf(u, v, 0)
    h = z1 - z0
    r1 = r0 if r1 is None else r1
    occl = (z0 <= 1) if ao is None else ao
    for zi in range(h):
        t = zi / max(1, h - 1)
        r = profile(t) if profile else r0 + (r1 - r0) * t
        rx, ry = r * RX, r * RY
        if rx < 0.5:
            continue
        for x in range(math.floor(cx - rx), math.ceil(cx + rx) + 1):
            nx = (x + 0.5 - cx) / rx
            if abs(nx) > 1:
                continue
            th = math.asin(nx)
            d = math.cos(th) * _SF + nx * _SR
            f = tone(d)
            if gloss and d > 0.72:
                f = 1.04
            base = shade(col, f)
            res = shader(th, zi, h, base) if shader else None
            colx, lit = res if res is not None else (base, None)
            if occl and zi < 3:
                colx = shade(colx, (0.78, 0.87, 0.94)[zi])
            y = round(cyb + ry * math.sqrt(max(0.0, 1 - nx * nx)) - z0 - zi)
            c.put(x, y - 1, colx, lit)
            if zi > 0:
                c.put(x, y, colx, lit)
    if cap:
        r = profile(1.0) if profile else r1
        ellipse(c, u, v, z1, r, capcol or col)
    return z1


def ellipse(c, u, v, z, r, col, rim=True, light=None):
    """A flat disc (a cap, a pond, a tank lid) at height z, lit rim on the near-left."""
    x, y = c.Pf(u, v, z)
    rx, ry = r * RX, r * RY
    box = (round(x - rx), round(y - ry) - 1, round(x + rx), round(y + ry) - 1)
    c.d.ellipse(box, fill=A(shade(col, 1.04)))
    c.ld.ellipse(box, fill=A(light) if light else CLEAR)
    if rim and rx > 3:
        c.d.arc(box, 100, 200, fill=A(shade(col, 1.2)))


def rib_shader(n=12, lo=0.84, hi=1.12, hoops=(), hoop=0.78):  # hoop > 1 for bright metal bands
    """Vertical ribs round a drum, and hoops at the given face-local heights (fractions of h when < 1)."""
    def g(th, z, h, base):
        for k in hoops:
            zz = round(k * h) if k < 1 else k
            if z == zz:
                return shade(base, hoop), None
        ph = ((th + math.pi / 2) / math.pi * n) % 1
        if ph < 0.18:
            return shade(base, hi), None
        if ph > 0.82:
            return shade(base, lo), None
        return None
    return g


def ribbon_shader(key, floor=6, win=3, p=0.5, glass_col=None, spandrel=None):
    """Ribbon windows round a drum: a band of glass on every floor, lit in seeded arcs at night."""
    def g(th, z, h, base):
        fz = z % floor
        if 1 <= fz <= win and z < h - 2:
            seg = math.floor((th + math.pi / 2) / 0.45)
            if ((th + math.pi / 2) / 0.45) % 1 < 0.16:  # a mullion between panes
                return shade(base, 0.92), None
            gc = glass_col or GLASS_L
            d = math.cos(th) * _SF + math.sin(th) * _SR
            gc = shade(gc, tone(d) + 0.08)
            w = hv(key, seg, z // floor)
            return gc, (LIT if w < p else None)
        if spandrel and fz == 0:
            return shade(spandrel, 0.9), None
        return None
    return g


def slab_rot(c, cu, cv, half, ang, z0, z1, col, shader=None, roof=True):
    """A square floor slab rotated by `ang` round (cu, cv): the faces turned to the viewer are drawn, shaded by the
    sun (twisting towers are a stack of these)."""
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
            faces.append(((ua + ub) / 2 + (va + vb) / 2, (ua, va), (ub, vb), 0.612 + 0.4 * max(0.0, nu * 0.27 + nv * 0.72)))
    for _, (ua, va), (ub, vb), f in sorted(faces):
        c.poly([(ua, va, z0), (ub, vb, z0), (ub, vb, z1), (ua, va, z1)], shade(col, f))
    if roof:
        c.poly([(u, v, z1) for u, v in pts], shade(col, 1.04))


# ── assemblies ────────────────────────────────────────────────────────────────────────────────────────────────────

def podium(c, u0, v0, u1, v1, h, col, key, accent=ORANGE, door=0.5, canopy=True, steps=True, R=None):
    """The base storey: stone walls, a glass lobby on the street (left) face with lit doors, a canopy over them in
    the accent colour, and two steps."""
    ground_shadow(c, u0, v0, u1, v1)
    lobby = glass(key + ":lobby", bay=5, floor=h + 4, p=0.6, refl=False, lo=1, hi=h - 3)
    prism(c, u0, v0, u1, v1, 0, h, col, L=combine(top_band(2, col), lobby), R=R or combine(top_band(2, col), punched(key + ":pr", bay=6, floor=h, ww=3, wh=h - 6)))
    m = u0 + (u1 - u0) * door
    face(c, "L", v1, m - 0.14, m + 0.14, 0, h - 3, NAVY_D, lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 else (shade(STEEL_D, 0.9), None)), ao=False)
    if canopy:
        prism(c, m - 0.26, v1, m + 0.26, v1 + 0.16, h - 4, h - 2, accent, ao=False, rim=0)
    if steps:
        prism(c, m - 0.22, v1, m + 0.22, v1 + 0.12, 0, 1, STONE, ao=False, rim=0)
    return h


def plant(c, u0, v0, u1, v1, z, key, n=3, tank=False, antennas=0, frame=0):
    """Rooftop plant inside a roof rectangle: AC units with fan grilles, maybe a water tank on legs, antennas."""
    r = hv
    items = []
    for k in range(n):
        u = u0 + 0.05 + r(key, "u", k) * max(0.01, u1 - u0 - 0.35)
        v = v0 + 0.05 + r(key, "v", k) * max(0.01, v1 - v0 - 0.3)
        items.append((u + v, "ac", u, v))
    if tank:
        items.append((u0 + v0 + 0.5, "tank", u0 + 0.22, v0 + 0.22))
    for k in range(antennas):
        items.append((u0 + v1, "ant", u1 - 0.1 - 0.12 * k, v0 + 0.1 + 0.08 * k))
    for _, kind, u, v in sorted(items):
        if kind == "ac":
            prism(c, u, v, u + 0.26, v + 0.2, z, z + 4, CON_L, R=louvres(2), rim=0, ao=False)
            x, y = c.P(u + 0.13, v + 0.1, z + 4)
            c.d.ellipse((x - 3, y - 2, x + 3, y + 1), fill=A(STEEL_D))
            c.d.line([(x - 2, y - 1), (x + 2, y)], fill=A(STEEL_M))
        elif kind == "tank":
            for du, dv in ((-0.08, 0), (0.08, 0), (0, 0.08)):
                x, y = c.P(u + du, v + dv, z)
                c.d.line([(x, y), (x, y - 5)], fill=A(STEEL_D))
            drum(c, u, v, z + 5, z + 13, 0.12, (150, 112, 82), capcol=(120, 90, 66), ao=False)
            x, y = c.P(u, v, z + 13)
            c.d.polygon([(x - 3, y), (x + 3, y), (x, y - 3)], fill=A((110, 82, 60)))
        else:
            x, y = c.P(u, v, z)
            c.d.line([(x, y), (x, y - 9)], fill=A(STEEL_D))
            c.d.point([(x, y - 10)], fill=A(RED))
            c.light(x, y - 10, RED)


def bridge(c, ua, va, ub, vb, z0, z1, col, key):
    """A glass sky bridge between two shafts (a box from (ua, va) to (ub, vb))."""
    prism(c, ua, va, ub, vb, z0, z1, col, L=combine(bands([(0, 1, col), (z1 - z0 - 1, z1 - z0, col)]), glass(key, bay=3, floor=z1 - z0, p=0.8, lo=1)),
          R=combine(bands([(0, 1, col), (z1 - z0 - 1, z1 - z0, col)]), glass(key + "r", bay=3, floor=z1 - z0, p=0.8, lo=1)), ao=False, rim=0)


def screen(c, side, fixed, a, b, z0, z1, key, col, kind="bars"):
    """An LED screen on a wall: a dark bezel and glowing content (bars of a chart, or a ticker), lit at night."""
    def g(i, n, z, h, base, s):
        if i == 0 or i == n - 1 or z == 0 or z == h - 1:
            return shade(NAVY_D, 1.2), None
        if kind == "bars":
            bh = 2 + int(hv(key, i // 2) * (h - 3))
            on = z < bh and i % 2 == 1
        else:
            on = (z == h // 2 and (i + int(hv(key) * 7)) % 4 != 0) or z == 1
        if on:
            return col, col
        return NAVY_D, None
    face(c, side, fixed, a, b, z0, z1, NAVY_D, g, ao=False, edge=False)


def beacon(c, u, v, z, col=RED, glow=3):
    x, y = c.P(u, v, z)
    c.d.rectangle((x - 1, y - 1, x, y), fill=A(col))
    c.ld.ellipse((x - glow, y - glow, x + glow - 1, y + glow - 1), fill=A(col, 140))
    c.ld.rectangle((x - 1, y - 1, x, y), fill=A(col))


def lattice(c, u, v, z0, z1, w0, w1, col=STEEL_M, step=6):
    """A lattice mast (screen-aligned): two legs narrowing from w0 to w1 px half-width, X-braced."""
    x, y0 = c.P(u, v, z0)
    y1 = y0 - (z1 - z0)
    c.d.line([(x - w0, y0), (x - w1, y1)], fill=A(col))
    c.d.line([(x + w0, y0), (x + w1, y1)], fill=A(shade(col, 0.7)))
    y = y0
    while y - step >= y1:
        t0, t1 = (y0 - y) / max(1, y0 - y1), (y0 - y + step) / max(1, y0 - y1)
        wa, wb = w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1
        c.d.line([(round(x - wa), y), (round(x + wb), y - step)], fill=A(shade(col, 0.85)))
        c.d.line([(round(x + wa), y), (round(x - wb), y - step)], fill=A(shade(col, 0.85)))
        c.d.line([(round(x - wb), y - step), (round(x + wb), y - step)], fill=A(col))
        y -= step


def dish(c, u, v, z, r=5, col=WHITE, facing=-1):
    """A satellite dish on a short post, turned to the left (facing -1) or right (1)."""
    x, y = c.P(u, v, z)
    c.d.line([(x, y), (x, y - 4)], fill=A(STEEL_D))
    cx, cy = x + facing * 1, y - 4 - r
    c.d.ellipse((cx - r // 2, cy - r, cx + r // 2, cy + r), fill=A(shade(col, 0.8)))
    c.d.ellipse((cx - r // 2 + (1 if facing < 0 else 0), cy - r + 1, cx + r // 2 - (0 if facing < 0 else 1), cy + r - 1), fill=A(col))
    c.d.line([(cx, cy), (cx + facing * (r + 1), cy - 1)], fill=A(STEEL_D))


def tip(c, u, v, z, h=10, col=STEEL, beacon_col=None):
    """The tower's finial: a collar and a thin mast whose top is the tower's highest pixel, on the lot's centre line
    (legend crowns stand on it). Records c.tip = (x, y, z_top)."""
    x, y = c.P(u, v, z)
    c.d.rectangle((x - 2, y - 3, x + 1, y), fill=A(shade(col, 0.8)))
    c.d.line([(x - 2, y - 3), (x - 2, y)], fill=A(shade(col, 1.1)))
    c.d.line([(x, y - 3), (x, y - h)], fill=A(col))
    c.d.line([(x - 1, y - 3), (x - 1, y - h + 3)], fill=A(shade(col, 0.75)))
    if beacon_col:
        c.d.point([(x, y - h)], fill=A(beacon_col))
        c.ld.ellipse((x - 3, y - h - 3, x + 3, y - h + 3), fill=A(beacon_col, 150))
        c.ld.point([(x, y - h)], fill=A(beacon_col))
    c.tip = (x, y - h, z + h)
    return z + h


# ── lot dressing (appended, round 3): people-scale props round a Novice / Practitioner building ─────────────────────

def lot_dressing(service_id, tier, col, kind):
    """The street furniture that makes a small building read as a place: a monument sign in its district colour (lit at
    night), a lamp, a bench, planters and, at Practitioner, a bike rack and a banner pole. generate_tiles.landmark lays
    it *under* the building (growth_art.with_tower), so it only fills empty lot and never covers the drawing. Returns
    a finished (img, anchor, lights), or None where the lot's front is water (lake, dock) or above Practitioner."""
    if tier not in (1, 2) or kind in ("lake", "dock"):
        return None
    c = Kit(3, 3, 44)
    flip = hv(service_id, "dress") < 0.5  # the sign on the left (front-left edge) or right (front-right edge)
    leaf, bark = (78, 168, 76), (112, 82, 56)

    def planter(u, v):
        ground_shadow(c, u - 0.12, v - 0.12, u + 0.12, v + 0.12, spread=0.08, alpha=60)
        prism(c, u - 0.12, v - 0.12, u + 0.12, v + 0.12, 0, 4, STONE, roofcol=(110, 82, 58))
        x, y = c.P(u, v, 4)
        for dx, dy, r in ((-2, -3, 3), (2, -3, 3), (0, -5, 3)):
            c.d.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=A(leaf))
        c.d.point([(x - 2, y - 6), (x + 2, y - 4)], fill=A((255, 204, 60)))
        c.d.point([(x + 1, y - 7)], fill=A((255, 110, 150)))

    def lamp(u, v, h=22):
        prism(c, u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, h, NAVY, rim=0, ao=False)
        x, y = c.P(u, v, h)
        c.d.rectangle((x - 2, y - 3, x + 1, y), fill=A(NAVY_D))
        c.d.rectangle((x - 1, y - 2, x, y - 1), fill=A(LIT))
        c.ld.ellipse((x - 4, y - 5, x + 3, y + 2), fill=A(LIT, 110))
        c.ld.rectangle((x - 1, y - 2, x, y - 1), fill=A(LIT))

    def bench(u, v, along_u):
        if along_u:
            prism(c, u - 0.16, v - 0.05, u + 0.16, v + 0.05, 2, 4, (190, 140, 90), rim=0)
            prism(c, u - 0.16, v - 0.07, u + 0.16, v - 0.05, 4, 7, (148, 102, 62), rim=0, ao=False)
        else:
            prism(c, u - 0.05, v - 0.16, u + 0.05, v + 0.16, 2, 4, (190, 140, 90), rim=0)
            prism(c, u - 0.07, v - 0.16, u - 0.05, v + 0.16, 4, 7, (148, 102, 62), rim=0, ao=False)

    def sign(u, v, left):
        """A low monument sign: a stone plinth, a panel in the district colour, white lettering lines, lit."""
        if left:
            ground_shadow(c, u - 0.3, v - 0.06, u + 0.3, v + 0.06, spread=0.1, alpha=60)
            prism(c, u - 0.3, v - 0.06, u + 0.3, v + 0.06, 0, 3, STONE)
            prism(c, u - 0.26, v - 0.04, u + 0.26, v + 0.04, 3, 13, col, roofcol=shade(col, 1.15), rim=0)
            for k, w in enumerate((0.36, 0.26)):
                c.lface(v + 0.04, u - w / 2, u + w / 2, 9 - k * 3, 10 - k * 3, WHITE, light=True)
        else:
            ground_shadow(c, u - 0.06, v - 0.3, u + 0.06, v + 0.3, spread=0.1, alpha=60)
            prism(c, u - 0.06, v - 0.3, u + 0.06, v + 0.3, 0, 3, STONE)
            prism(c, u - 0.04, v - 0.26, u + 0.04, v + 0.26, 3, 13, col, roofcol=shade(col, 1.15), rim=0)
            for k, w in enumerate((0.36, 0.26)):
                c.rface(u + 0.04, v - w / 2, v + w / 2, 9 - k * 3, 10 - k * 3, WHITE, light=True)

    def bikes(u, v):
        prism(c, u - 0.2, v - 0.02, u + 0.2, v + 0.02, 0, 1, STEEL_D, rim=0, ao=False)
        for k in range(2):
            x, y = c.P(u - 0.1 + k * 0.2, v, 0)
            frame = ((232, 64, 56), (59, 130, 246))[k]
            c.d.ellipse((x - 5, y - 4, x - 1, y), outline=A(CHAR))
            c.d.ellipse((x + 1, y - 4, x + 5, y), outline=A(CHAR))
            c.d.line([(x - 3, y - 2), (x, y - 5), (x + 3, y - 2)], fill=A(frame))
            c.d.point([(x, y - 6), (x - 1, y - 6)], fill=A(CHAR))

    def banner(u, v):
        prism(c, u - 0.02, v - 0.02, u + 0.02, v + 0.02, 0, 32, STEEL_M, rim=0, ao=False)
        x, y = c.P(u, v, 32)
        c.d.polygon([(x, y + 1), (x + 7, y + 3), (x + 7, y + 12), (x, y + 10)], fill=A(col))
        c.d.line([(x, y + 1), (x + 7, y + 3)], fill=A(shade(col, 1.25)))
        c.d.point([(x + 3, y + 6), (x + 4, y + 7)], fill=A(WHITE))

    # back to front (small u + v first)
    if tier == 2:
        if flip:
            bikes(2.78, 0.75)
        else:
            bikes(0.75, 2.78)
    if flip:
        sign(0.75, 2.82, True)
        lamp(2.82, 1.25)
        planter(1.55, 2.84)
        bench(2.84, 2.0, False)
    else:
        sign(2.82, 0.75, False)
        lamp(1.25, 2.82)
        planter(2.84, 1.55)
        bench(2.0, 2.84, True)
    if tier == 2:
        banner(2.86, 2.86)
    return c.finish()
