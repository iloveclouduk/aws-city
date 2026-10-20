"""
Infill: the ordinary city between the landmarks (src/world/zoning.ts picks a kind per lot from the block's density).
NYC-like but generic, in the Phase 3 kit's style and light (services/kit.py): brownstones with stoops and cornices,
corner shops under awnings, rowhouse terraces, walk-ups with zigzag fire escapes, cast-iron lofts with tall windows,
pre-war apartments with a rooftop water tank, glass slabs, and setback towers with a stepped, finned or spire crown.

Two styles: warm (brick and brownstone) and cool (concrete, limestone and glass). Quieter than the service
buildings on purpose: muted walls and glass, no district colours, no brands, so the landmarks stay the stars. Night
lights (@lights) light some windows, never all of them.

Sprites `in:<style>:<kind>:<fw>x<fh>:<v>` (+ `@lights`), anchored at the footprint's N corner like every building.
Height classes (px above that corner): low ≤ 40, mid ≤ 80, high ≤ 130, sky ≤ 180; the generator measures each
sprite and writes art/tiles/infill.json ([{name, kind, cls, fw, fh, style, h}]) so the runtime never reads images.
A long footprint (2x1 / 1x2) turns its fronts to its long side.

Called from generate_tiles.main as infill_art.build(add). Preview (after `npm run art`):
  /usr/bin/arch -arm64 /usr/bin/python3 art/tiles/infill_art.py   →  .cache/art/infill-preview.png, infill-street-preview.png
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_tiles import NAVY_D, shade  # noqa: E402
from services.kit import (LIT, LIT_COOL, SIDE, STEEL_D, Kit, A, combine, drum, face, glass, ground_shadow, hv, masonry,  # noqa: E402
                          prism, ribs, tip)

HERE = os.path.dirname(os.path.abspath(__file__))
INFILL_JSON = os.path.join(HERE, "infill.json")
LIMIT = {"low": 40, "mid": 80, "high": 130, "sky": 180}
ZMAX = {"low": 44, "mid": 84, "high": 134, "sky": 184}
CLASS = {"brownstone": "low", "corner": "low", "rowhouse": "low", "walkup": "mid", "loft": "mid",
         "prewar": "high", "slab": "high", "setback": "sky"}

IRON = (38, 40, 46)  # fire escapes, railings, cast-iron trim
DOOR = (74, 54, 46)

# Muted walls and trims per style; every wall stays below the service buildings' saturation.
STYLE = {
    "warm": {
        "brick": [(160, 100, 84), (146, 108, 90), (172, 124, 96), (138, 92, 82)],
        "brown": [(128, 94, 80), (142, 104, 86), (118, 88, 78)],
        "stone": (210, 198, 178),
        "trim": (196, 184, 162),
        "cornice": [(112, 98, 90), (196, 184, 162)],
        "iron": (126, 112, 96),
        "tan": (190, 164, 136),
        "glass": {"L": (104, 118, 128), "R": (70, 80, 90)},
        "curtain": {"L": ((96, 86, 76), (122, 110, 96), (152, 140, 122)), "R": ((66, 58, 52), (84, 74, 64), (106, 94, 82))},
        "frame": (150, 132, 112),
        "awning": [(122, 72, 72), (86, 112, 90)],
    },
    "cool": {
        "brick": [(150, 150, 152), (166, 162, 156), (136, 140, 148), (176, 172, 166)],
        "brown": [(164, 160, 152), (150, 150, 150), (178, 174, 166)],
        "stone": (206, 206, 202),
        "trim": (214, 214, 210),
        "cornice": [(104, 110, 120), (212, 212, 208)],
        "iron": (110, 120, 132),
        "tan": (184, 184, 180),
        "glass": {"L": (108, 126, 142), "R": (72, 86, 102)},
        "curtain": {"L": ((90, 108, 126), (118, 138, 156), (152, 170, 186)), "R": ((60, 74, 90), (78, 94, 112), (102, 118, 136))},
        "frame": (178, 184, 190),
        "awning": [(70, 90, 116), (110, 104, 92)],
    },
}


def sc(col, side):
    return shade(col, SIDE[side])


# ── shaders ───────────────────────────────────────────────────────────────────────────────────────────────────────

def spans(n, m, ww, margin=1):
    """m window columns of ww px, evenly across a face n px wide."""
    out = []
    for k in range(m):
        cx = margin + (k + 0.5) * (n - 2 * margin) / m
        a = round(cx - ww / 2)
        out.append((a, a + ww))
    return out


def win(key, rows, m, ww, glass_col, p=0.38, trim=None, sill=True, lintel=False, arch=False, skip=()):
    """Punched windows: `rows` [(z0, z1)] face-local, `m` columns of `ww` px; recessed (head and near jamb in shadow),
    a sill below and maybe a stone lintel above. Some panes light at night (warm, a few cool)."""
    def g(i, n, z, h, base, side):
        for r, (z0, z1) in enumerate(rows):
            if not (z0 - 1 <= z <= z1):
                continue
            for k, (a, b) in enumerate(spans(n, m, ww)):
                if not (a <= i < b) or (r, k) in skip:
                    continue
                if z0 <= z < z1:
                    if arch and z == z1 - 1 and (i == a or i == b - 1):
                        return (sc(trim, side) if trim else shade(base, 1.08)), None
                    gc = glass_col[side]
                    if z == z1 - 1 or i == (a if side == "L" else b - 1):
                        gc = shade(gc, 0.74)
                    w = hv(key, side, k, r)
                    return gc, ((LIT if w < p * 0.8 else LIT_COOL) if w < p else None)
                if z == z0 - 1 and sill:
                    return (sc(trim, side) if trim else shade(base, 1.14)), None
                if z == z1 and lintel:
                    return (sc(trim, side) if trim else shade(base, 1.1)), None
        return None
    return g


def band(z0, z1, col, dentil=0):
    """A horizontal band (a string course, a cornice) in `col`; dentils: a dark tooth every `dentil` px on its bottom."""
    def g(i, n, z, h, base, side):
        if z0 <= z < z1:
            if dentil and z == z0 and i % dentil == 0:
                return shade(sc(col, side), 0.72), None
            return (shade(sc(col, side), 1.1) if z == z1 - 1 else sc(col, side)), None
        return None
    return g


def shopfront(key, z0, z1, glass_col, frame, p=0.6, door_at=None, kick=2):
    """A ground-floor shop: a kick plate, big panes between slim frames, a door; most panes lit after dark."""
    def g(i, n, z, h, base, side):
        if not (z0 <= z < z1) or i == 0 or i == n - 1:
            return None
        if z < z0 + kick:
            return shade(sc(frame, side), 0.8), None
        if z == z1 - 1:
            return sc(frame, side), None
        if door_at is not None and abs(i - round(door_at * n)) <= 1:
            return shade(sc(DOOR, side), 0.9), (LIT if hv(key, "door") < p else None)
        if i % 5 == 0:
            return sc(frame, side), None
        gc = glass_col[side]
        if z == z1 - 2:
            gc = shade(gc, 0.78)
        return gc, (LIT if hv(key, side, i // 5) < p else None)
    return g


def sign(key, z0, z1, col, light):
    """A plain sign band over a shop: a dark board with pale strokes standing for lettering (no words, no brands)."""
    def g(i, n, z, h, base, side):
        if not (z0 <= z < z1):
            return None
        if z == z0 + 1 and 2 < i < n - 3 and hv(key, side, i) < 0.6:
            return shade(light, 0.95), light
        return sc(col, side), None
    return g


def fire_escape(key, z0, floor, nfl, a, b):
    """A zigzag fire escape: a railed balcony on every floor from z0, a ladder between them leaning one way, then
    the other; i from a to b."""
    def g(i, n, z, h, base, side):
        if not (a <= i < b) or z < z0 - 1:
            return None
        f, fz = divmod(z - z0, floor)
        if f >= nfl:
            return None
        if fz == 0:  # the platform's edge
            return IRON, None
        if fz == 3 or (fz in (1, 2) and i % 2 == 0) or i in (a, b - 1) and fz < 4:  # balusters and the top rail
            return shade(IRON, 1.3), None
        # the ladder up to the next floor, a diagonal across the bay, alternating
        if f < nfl - 1:
            t = (fz) / floor
            x = a + 1 + round(t * (b - a - 3)) if f % 2 == 0 else b - 2 - round(t * (b - a - 3))
            if i == x:
                return shade(IRON, 1.15), None
        return None
    return g


def brick(lo=0.93):
    return masonry(course=3, bond=5, lo=lo)


# ── parts ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def stoop(c, front, a, b, wall, z, col):
    """Front steps from a raised door down to the pavement, in 3 slabs; front 'L' (v = wall) or 'R' (u = wall)."""
    d = [0.0, 0.07, 0.13, 0.19]
    for k in range(3):
        zh = round(z * (3 - k) / 3)
        if front == "L":
            prism(c, a, wall + d[k], b, wall + d[k + 1], 0, zh, col, rim=0, ao=False)
        else:
            prism(c, wall + d[k], a, wall + d[k + 1], b, 0, zh, col, rim=0, ao=False)
    # the iron handrail on the near side
    if front == "L":
        c.line((a, wall, z + 4), (a, wall + 0.19, 4), IRON)
        c.line((b, wall, z + 4), (b, wall + 0.19, 4), IRON)
    else:
        c.line((wall, b, z + 4), (wall + 0.19, b, 4), IRON)
        c.line((wall, a, z + 4), (wall + 0.19, a, 4), IRON)


def awning(c, front, a, b, wall, z, col, depth=0.1, drop=2):
    """A sloped striped awning over a shop window, along the L face (v = wall) or R face (u = wall)."""
    n = 6
    for k in range(n):
        s0, s1 = a + (b - a) * k / n, a + (b - a) * (k + 1) / n
        cc = col if k % 2 == 0 else (232, 226, 214)
        if front == "L":
            c.poly([(s0, wall, z), (s1, wall, z), (s1, wall + depth, z - drop), (s0, wall + depth, z - drop)], shade(cc, 0.96))
            c.poly([(s0, wall + depth, z - drop), (s1, wall + depth, z - drop), (s1, wall + depth, z - drop - 2), (s0, wall + depth, z - drop - 2)], shade(cc, 0.82))
        else:
            c.poly([(wall, s1, z), (wall, s0, z), (wall + depth, s0, z - drop), (wall + depth, s1, z - drop)], shade(cc, 0.8))
            c.poly([(wall + depth, s1, z - drop), (wall + depth, s0, z - drop), (wall + depth, s0, z - drop - 2), (wall + depth, s1, z - drop - 2)], shade(cc, 0.66))


def chimney(c, u, v, z, h=4, col=(132, 96, 82)):
    prism(c, u, v, u + 0.1, v + 0.1, z, z + h, col, rim=0, ao=False)


def bulkhead(c, u, v, z, col, w=0.3, d=0.26, h=7):
    """The stair bulkhead on a flat roof."""
    prism(c, u, v, u + w, v + d, z, z + h, col, rim=0.02, ao=False)


def water_tank(c, u, v, z):
    """A timber water tank on a steel stand with a conical lid, the rooftop sign of a pre-war building."""
    for du, dv in ((-0.1, 0), (0.1, 0), (0, 0.1), (0, -0.1)):
        x, y = c.P(u + du, v + dv, z)
        c.d.line([(x, y), (x, y - 6)], fill=A(STEEL_D))
    def staves(th, zz, h, b):
        if zz in (2, h - 3):
            return shade(b, 0.7), None
        return None
    drum(c, u, v, z + 6, z + 16, 0.15, (140, 108, 84), shader=staves, capcol=(112, 86, 66), ao=False)
    x, y = c.P(u, v, z + 16)
    c.d.polygon([(x - 4, y), (x + 4, y), (x, y - 4)], fill=A((96, 76, 60)))
    c.d.line([(x - 4, y), (x, y - 4)], fill=A((124, 100, 80)))


def house_split(lo, hi, k, key):
    """k house widths across [lo, hi], slightly varied so a terrace doesn't look stamped."""
    ws = [1.0 + 0.18 * (hv(key, "w", j) - 0.5) for j in range(k)]
    s = sum(ws)
    edges, t = [lo], lo
    for w in ws:
        t += (hi - lo) * w / s
        edges.append(t)
    edges[-1] = hi
    return edges


# ── buildings ─────────────────────────────────────────────────────────────────────────────────────────────────────

def terrace(style, fw, fh, v, key, stoops):
    """Brownstones (stoops, a tall parlour floor, a bracketed cornice) or rowhouses (flat fronts, a door at the
    pavement, a low cornice), as a row of houses along the long side (one house on a 1x1)."""
    S = STYLE[style]
    c = Kit(fw, fh, ZMAX["low"])
    front = "L" if fw >= fh else "R"
    long_ = max(fw, fh)
    k = 1 if long_ == 1 else 3
    inset = 0.22 if stoops else 0.1  # brownstones stand back behind their stoops
    # the lot in (along, across): along the front, across from the back to the front wall
    a0, a1 = 0.06, long_ - 0.06
    b0, b1 = 0.08, 1 - inset
    edges = house_split(a0, a1, k, key)
    walls = S["brown"] if stoops else S["brick"]
    for j in range(k):
        s0, s1 = edges[j], edges[j + 1]
        hk = key + f":{j}"
        col = walls[int(hv(key, v, j) * len(walls))]
        h = (33 if stoops else 29) + round(hv(hk, "h") * 2)
        corn = S["cornice"][0 if stoops else int(hv(hk, "c") * 2)]
        trim = S["trim"]
        base = 6 if stoops else 0
        if stoops:
            rows = [(9, 16), (19, 23), (h - 8, h - 4)]
        else:
            rows = [(3, 9), (12, 17), (20, 25)]
        n_win = 2 if (s1 - s0) < 0.7 else 3
        door_k = 0 if hv(hk, "door") < 0.5 else n_win - 1
        skip = {(0, door_k)} if not stoops else set()
        wf = win(hk, rows, n_win, 2 if n_win == 3 else 3, S["glass"], p=0.4, trim=trim, skip=skip)
        basement = band(0, base, shade(S["stone"], 0.82) if style == "warm" else shade(S["stone"], 0.86))
        cornice_band = band(h - 3, h, corn, dentil=2)
        skin = None if stoops and style == "warm" else brick(0.94 if style == "warm" else 0.96)
        front_sh = combine(cornice_band, wf, basement if stoops else None, skin)
        side_sh = combine(cornice_band, win(hk + "s", rows[1:], 1, 2, S["glass"], p=0.3, trim=trim), skin)
        if front == "L":
            u0, u1, v0, v1 = s0, s1, b0, b1
            ground_shadow(c, u0, v0, u1, v1)
            prism(c, u0, v0, u1, v1, 0, h, col, L=front_sh, R=side_sh)
        else:
            v0, v1, u0, u1 = fh - s1, fh - s0, b0, b1
            ground_shadow(c, u0, v0, u1, v1)
            prism(c, u0, v0, u1, v1, 0, h, col, L=side_sh, R=front_sh)
        # the door: on the parlour floor up the stoop, or at the pavement
        da, db = spans(1000, n_win, 1)[door_k]
        dc = s0 + (s1 - s0) * (da / 1000)
        dw = 0.09
        dz0, dz1 = (base, base + 10) if stoops else (0, 9)
        door = lambda i, n, z, hh, b, s: ((shade(sc(DOOR, s), 0.8), None) if i == 0 or z == hh - 1 else (sc(DOOR, s), LIT if z == hh - 2 and hv(hk, "fan") < 0.5 else None))
        if front == "L":
            face(c, "L", v1, dc - dw, dc + dw, dz0, dz1, DOOR, door, ao=not stoops, edge=False)
            if stoops:
                stoop(c, "L", dc - dw - 0.03, dc + dw + 0.03, v1, base, shade(S["stone"], 0.84 if style == "cool" else 0.78))
        else:
            vc = fh - dc
            face(c, "R", u1, vc - dw, vc + dw, dz0, dz1, DOOR, door, ao=not stoops, edge=False)
            if stoops:
                stoop(c, "R", vc - dw - 0.03, vc + dw + 0.03, u1, base, shade(S["stone"], 0.84 if style == "cool" else 0.78))
        # a chimney or two on the roof's back edge
        if hv(hk, "ch") < 0.7:
            if front == "L":
                chimney(c, s0 + 0.08, b0 + 0.04, h, col=shade(col, 0.9))
            else:
                chimney(c, b0 + 0.04, fh - s1 + 0.08, h, col=shade(col, 0.9))
    return c


def corner_shop(style, v, key):
    """A corner shop: shopfronts on both street faces under a striped awning, a sign band, two floors above."""
    S = STYLE[style]
    c = Kit(1, 1, ZMAX["low"])
    u0, v0, u1, v1 = 0.08, 0.08, 0.92, 0.92
    col = S["brick"][(v * 2 + 1) % len(S["brick"])]
    h = 33 + 2 * v
    corn = S["cornice"][v % 2]
    aw = S["awning"][v % 2]
    rows = [(17, 22), (25, h - 5)]
    sh = lambda s: combine(band(h - 3, h, corn, dentil=2), sign(key + s, 12, 15, NAVY_D if style == "cool" else (64, 50, 46), (236, 226, 200)),
                           shopfront(key + s, 0, 12, S["glass"], S["iron"], door_at=0.25 if s == "L" else None),
                           win(key + s, rows, 2, 3, S["glass"], p=0.4, trim=S["trim"]), brick(0.95))
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, h, col, L=sh("L"), R=sh("R"))
    awning(c, "R", v0 + 0.3, v1 - 0.04, u1, 12, aw)
    awning(c, "L", u0 + 0.04, u1 - 0.3, v1, 12, aw)
    bulkhead(c, u0 + 0.1, v0 + 0.1, h, shade(col, 0.9), w=0.22, d=0.2, h=4)
    return c


def walkup(style, v, key):
    """A five- or six-storey walk-up: a shop at the pavement, brick above with stone sills, a zigzag fire escape on
    the street face, a deep cornice and a stair bulkhead on the roof."""
    S = STYLE[style]
    c = Kit(1, 1, ZMAX["mid"])
    u0, v0, u1, v1 = 0.06, 0.06, 0.88, 0.88
    col = S["brick"][(v * 3) % len(S["brick"])]
    floors = 6 if v == 0 else 5
    fl = 9
    h = 12 + floors * fl + 4
    corn = S["cornice"][0]
    rows = [(12 + f * fl + 2, 12 + f * fl + 7) for f in range(floors)]
    esc = fire_escape(key, 12 + fl, fl, floors - 1, 3, 12)
    L = combine(band(h - 4, h, corn, dentil=2), esc, band(10, 12, S["trim"]), shopfront(key + "L", 0, 10, S["glass"], S["iron"], door_at=0.8),
                win(key + "L", rows, 3, 2, S["glass"], p=0.36, trim=S["trim"]), brick())
    R = combine(band(h - 4, h, corn, dentil=2), band(10, 12, S["trim"]), shopfront(key + "R", 0, 10, S["glass"], S["iron"]),
                win(key + "R", rows, 3, 2, S["glass"], p=0.36, trim=S["trim"]), brick())
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, h, col, L=L, R=R)
    bulkhead(c, u0 + 0.12, v0 + 0.1, h, shade(col, 0.92), w=0.26, d=0.22, h=6)
    if v:
        chimney(c, u1 - 0.22, v0 + 0.08, h, col=shade(col, 0.85))
    return c


def loft(style, fw, fh, v, key):
    """A cast-iron loft: slim columns between tall windows (most of each floor), a heavy cornice, shop windows at the
    pavement; painted iron in the warm style, grey in the cool one."""
    S = STYLE[style]
    c = Kit(fw, fh, ZMAX["mid"])
    u0, v0, u1, v1 = 0.06, 0.06, fw - 0.06, fh - 0.06
    paint = [(198, 184, 158), (176, 156, 128)] if style == "warm" else [(170, 178, 184), (196, 198, 196)]
    col = paint[v % 2]
    floors = 5
    fl = 11
    h = 12 + floors * fl + 4
    rows = [(12 + f * fl + 1, 12 + f * fl + 9) for f in range(floors)]

    def sides(s, n_tiles):
        m = 3 * n_tiles
        cols_ = combine(band(h - 4, h, S["cornice"][0], dentil=2),
                        band(10, 12, shade(col, 0.86)),
                        shopfront(key + s, 0, 10, S["glass"], S["iron"], door_at=0.5 if s == "L" else None),
                        win(key + s, rows, m, 3, S["glass"], p=0.4, trim=shade(col, 1.08), arch=v == 1),
                        ribs(step=5 if n_tiles == 1 else 5, hi=1.08, lo=0.9))
        return cols_
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, h, col, L=sides("L", fw), R=sides("R", fh))
    # rooftop: a bulkhead and, on a big loft, a small water tank
    bulkhead(c, u0 + 0.12, v0 + 0.12, h, shade(col, 0.82), h=6)
    if fw * fh > 1:
        bulkhead(c, u1 - 0.42, v0 + 0.1, h, shade(col, 0.8), w=0.3, d=0.3, h=4)
    return c


def prewar(style, v, key):
    """A pre-war apartment block (2x2): two limestone storeys, a brick shaft, a decorated top band and a deep cornice,
    the timber water tank on its stand and a stair bulkhead on the roof."""
    S = STYLE[style]
    c = Kit(2, 2, ZMAX["high"])
    u0, v0, u1, v1 = 0.06, 0.06, 1.94, 1.94
    col = S["brick"][(v * 2) % len(S["brick"])] if style == "warm" else S["brown"][v % 2]
    stone = S["stone"]
    floors = 11 if v == 0 else 10
    fl = 8
    base = 16
    shaft = base + floors * fl
    h = shaft + 7
    rows = [(base + f * fl + 2, base + f * fl + 6) for f in range(floors)]
    brows = [(3, 12)]

    def wall(s):
        return combine(band(h - 3, h, S["cornice"][1], dentil=2), band(shaft, h - 3, stone),
                       band(base - 2, base, shade(stone, 1.04)),
                       win(key + s + "b", brows, 5, 3, S["glass"], p=0.5, trim=None, sill=False, arch=True),
                       band(0, base - 2, stone),
                       win(key + s, rows, 6, 2, S["glass"], p=0.28, trim=stone),
                       brick(0.94))

    ground_shadow(c, u0, v0, u1, v1)
    if v == 1:  # the top two floors set back behind a terrace
        top_z = base + (floors - 2) * fl
        prism(c, u0, v0, u1, v1, 0, top_z, col, L=combine(band(top_z - 3, top_z, S["cornice"][1], dentil=2), wall("L")),
              R=combine(band(top_z - 3, top_z, S["cornice"][1], dentil=2), wall("R")))
        a0, b0, a1, b1 = 0.3, 0.3, 1.7, 1.7
        rows2 = [(2, 6), (10, 14)]
        prism(c, a0, b0, a1, b1, top_z, h, shade(col, 1.04),
              L=combine(band(h - top_z - 3, h - top_z, S["cornice"][1]), win(key + "pL", rows2, 5, 2, S["glass"], p=0.45, trim=stone)),
              R=combine(band(h - top_z - 3, h - top_z, S["cornice"][1]), win(key + "pR", rows2, 5, 2, S["glass"], p=0.45, trim=stone)),
              ao=False, zref=top_z)
        water_tank(c, 0.62, 0.58, h)
        bulkhead(c, 1.1, 0.42, h, shade(col, 0.9))
    else:
        prism(c, u0, v0, u1, v1, 0, h, col, L=wall("L"), R=wall("R"))
        bulkhead(c, 1.05, 0.3, h, shade(col, 0.9), w=0.36, d=0.3, h=8)
        water_tank(c, 0.55, 0.5, h)
    return c


def slab(style, fw, v, key):
    """A modern glass slab on a dark podium: a 1x1 tower, or on 2x2 a slab turned along one street (v picks which)
    over a podium the width of the lot. v 1 swaps the curtain wall for ribbon windows between concrete bands."""
    S = STYLE[style]
    c = Kit(fw, fw, ZMAX["high"])
    pal = S["curtain"]
    frame = S["frame"]
    if fw == 1:
        u0, v0, u1, v1 = 0.1, 0.1, 0.9, 0.9
        top_ = 120 if v == 0 else 114
        pod = 9
    else:
        pod = 10
        top_ = 122 if v == 0 else 116
        prism(c, 0.06, 0.06, 1.94, 1.94, 0, pod, (96, 100, 108) if style == "cool" else (110, 100, 92),
              L=glass(key + "pL", bay=6, floor=pod + 2, p=0.7, refl=False, lo=1, palette=pal, frame=frame),
              R=glass(key + "pR", bay=6, floor=pod + 2, p=0.7, refl=False, lo=1, palette=pal, frame=frame))
        ground_shadow(c, 0.06, 0.06, 1.94, 1.94)
        u0, v0, u1, v1 = (0.2, 0.55, 1.8, 1.45) if v == 0 else (0.55, 0.2, 1.45, 1.8)
    if v == 0:
        wall = lambda s: glass(key + s, bay=4, floor=5, p=0.24, palette=pal, frame=frame, lo=pod)
    else:
        spand = (176, 172, 164) if style == "warm" else (196, 200, 204)
        wall = lambda s: glass(key + s, bay=5, floor=6, p=0.24, palette=pal, frame=shade(spand, 0.9), spandrel=spand, lo=pod, per_floor=False)
    if fw == 1:
        ground_shadow(c, u0, v0, u1, v1)
        prism(c, u0, v0, u1, v1, 0, pod, (88, 92, 100), L=glass(key + "lb", bay=5, floor=pod + 2, p=0.7, refl=False, lo=1, palette=pal, frame=frame),
              R=glass(key + "lbr", bay=5, floor=pod + 2, p=0.6, refl=False, lo=1, palette=pal, frame=frame), rim=0)
    prism(c, u0, v0, u1, v1, pod, top_, frame, L=wall("L"), R=wall("R"), ao=False, zref=0)
    # a plant screen on the roof
    pu0, pv0 = u0 + (u1 - u0) * 0.25, v0 + (v1 - v0) * 0.25
    prism(c, pu0, pv0, pu0 + (u1 - u0) * 0.5, pv0 + (v1 - v0) * 0.5, top_, top_ + 6, shade(frame, 0.85), R=ribs(2), L=ribs(2), rim=0, ao=False)
    return c


def setback(style, v, key):
    """A setback tower (2x2): a wedding cake of three tiers with piers between the windows, and a generic art-deco
    crown: stepped (v 0), finned (v 1) or a spire (v 2)."""
    S = STYLE[style]
    c = Kit(2, 2, ZMAX["sky"])
    col = S["tan"] if style == "warm" else (180, 182, 184)
    crown_col = S["stone"] if style == "warm" else (214, 216, 218)
    fl = 6

    def tier(s, z_lo):
        return piers(key + s + str(z_lo), S["glass"], fl)

    tiers = [((0.08, 1.92), 0, 64), ((0.3, 1.7), 64, 102), ((0.52, 1.48), 102, 132)]
    ground_shadow(c, 0.08, 0.08, 1.92, 1.92)
    for k, ((a, b), z0, z1) in enumerate(tiers):
        cap = band(z1 - z0 - 3, z1 - z0, crown_col)
        base_b = band(0, 10, shade(crown_col, 0.92)) if k == 0 else None
        prism(c, a, a, b, b, z0, z1, col, L=combine(cap, base_b, tier("L", z0)), R=combine(cap, base_b, tier("R", z0)),
              ao=(k == 0), zref=z0)
    z = 132
    if v == 0:  # stepped: a ziggurat of shrinking boxes
        for a, b, dz in ((0.64, 1.36, 12), (0.75, 1.25, 10), (0.85, 1.15, 8)):
            prism(c, a, a, b, b, z, z + dz, crown_col, L=combine(piers(key + f"c{z}", S["glass"], 5)), R=combine(piers(key + f"cr{z}", S["glass"], 5)), ao=False, zref=z)
            z += dz
        tip(c, 1.0, 1.0, z, h=12, col=(196, 196, 196))
    elif v == 1:  # finned: tall fins with lit slots between them, a cap
        a, b = 0.66, 1.34
        fin = lambda i, n, zz, h, base, s: ((shade(base, 1.14), None) if i % 3 == 0 else (shade(base, 0.62), (LIT if zz % 6 < 3 and hv(key, "f", s, i) < 0.55 else None)) if 2 < zz < h - 3 else None)
        prism(c, a, a, b, b, z, z + 26, crown_col, L=fin, R=fin, ao=False)
        z += 26
        prism(c, 0.8, 0.8, 1.2, 1.2, z, z + 6, crown_col, ao=False)
        z += 6
        tip(c, 1.0, 1.0, z, h=10, col=(196, 196, 196), beacon_col=(232, 64, 56))
    else:  # spire: a lantern storey, then a tall pyramid and a needle
        prism(c, 0.7, 0.7, 1.3, 1.3, z, z + 10, crown_col, L=piers(key + "lan", S["glass"], 5, p=0.8), R=piers(key + "lanr", S["glass"], 5, p=0.8), ao=False)
        z += 10
        c.pyramid(0.7, 0.7, 1.3, 1.3, z, 22, crown_col)
        z += 22
        tip(c, 1.0, 1.0, z - 2, h=14, col=(200, 200, 200))
    return c


def piers(key, glass_col, fl, p=0.26):
    """Deco piers: a light vertical pier every 4 px with recessed windows between (spandrels darker)."""
    def g(i, n, z, h, base, side):
        if i <= 0 or i >= n - 1:
            return None
        if i % 4 == 0:
            return shade(base, 1.1), None
        fz = z % fl
        if fz < 2:
            return shade(base, 0.82), None
        gc = glass_col[side]
        if fz == fl - 1:
            gc = shade(gc, 0.76)
        w = hv(key, side, i // 4, z // fl)
        return gc, ((LIT if w < p * 0.8 else LIT_COOL) if w < p else None)
    return g


# ── the set ───────────────────────────────────────────────────────────────────────────────────────────────────────

def catalogue():
    """[(kind, fw, fh, v, draw(style, key) -> Kit)] for every infill sprite."""
    out = []
    for v in range(2):
        out.append(("brownstone", 1, 1, v, lambda s, k, v=v: terrace(s, 1, 1, v, k, True)))
    for v in range(2):
        out.append(("brownstone", 2, 1, v, lambda s, k, v=v: terrace(s, 2, 1, v, k, True)))
    out.append(("brownstone", 1, 2, 0, lambda s, k: terrace(s, 1, 2, 0, k, True)))
    for v in range(2):
        out.append(("corner", 1, 1, v, lambda s, k, v=v: corner_shop(s, v, k)))
    for v in range(2):
        out.append(("rowhouse", 2, 1, v, lambda s, k, v=v: terrace(s, 2, 1, v, k, False)))
    out.append(("rowhouse", 1, 2, 0, lambda s, k: terrace(s, 1, 2, 0, k, False)))
    for v in range(2):
        out.append(("walkup", 1, 1, v, lambda s, k, v=v: walkup(s, v, k)))
    for v in range(2):
        out.append(("loft", 1, 1, v, lambda s, k, v=v: loft(s, 1, 1, v, k)))
    out.append(("loft", 2, 1, 0, lambda s, k: loft(s, 2, 1, 0, k)))
    out.append(("loft", 1, 2, 1, lambda s, k: loft(s, 1, 2, 1, k)))
    for v in range(2):
        out.append(("prewar", 2, 2, v, lambda s, k, v=v: prewar(s, v, k)))
    for v in range(2):
        out.append(("slab", 1, 1, v, lambda s, k, v=v: slab(s, 1, v, k)))
    for v in range(2):
        out.append(("slab", 2, 2, v, lambda s, k, v=v: slab(s, 2, v, k)))
    for v in range(3):
        out.append(("setback", 2, 2, v, lambda s, k, v=v: setback(s, v, k)))
    return out


def height(img, anchor):
    """Pixels the drawing reaches above the footprint's N corner (the anchor)."""
    box = img.getchannel("A").getbbox()
    return anchor[1] - box[1] if box else 0


def build(add, strict=True):
    entries = []
    for style in ("warm", "cool"):
        for kind, fw, fh, v, draw in catalogue():
            name = f"in:{style}:{kind}:{fw}x{fh}:{v}"
            c = draw(style, name)
            img, anchor, lit = c.finish()
            cls = CLASS[kind]
            h = height(img, anchor)
            if h > LIMIT[cls]:
                if not strict:
                    print(f"over: {name} {h} > {LIMIT[cls]}")
                else:
                    raise ValueError(f"{name} is {h} px tall, over the {cls} limit {LIMIT[cls]}")
            add(name, img, anchor)
            if lit is not None and lit.getbbox():
                add(name + "@lights", lit, anchor)
            entries.append({"name": name, "kind": kind, "cls": cls, "fw": fw, "fh": fh, "style": style, "h": h})
    with open(INFILL_JSON, "w") as f:
        f.write("[\n" + ",\n".join("  " + json.dumps(e, separators=(", ", ": ")) for e in entries) + "\n]\n")
    return entries


# ── previews (run this file after `npm run art`) ──────────────────────────────────────────────────────────────────

def _atlas_sprite(name):
    """A sprite from the generated atlas at its full canvas size, with its anchor (for the street preview)."""
    from PIL import Image
    root = os.path.abspath(os.path.join(HERE, "..", ".."))
    city = os.path.join(root, "public", "assets", "city")
    with open(os.path.join(city, "atlas.json")) as f:
        atlas = json.load(f)
    with open(os.path.join(city, "sprites.json")) as f:
        anchors = json.load(f)["sprites"]
    for t in atlas["textures"]:
        for fr in t["frames"]:
            if fr["filename"] == name:
                page = Image.open(os.path.join(city, t["image"])).convert("RGBA")
                r, s = fr["frame"], fr["spriteSourceSize"]
                full = Image.new("RGBA", (fr["sourceSize"]["w"], fr["sourceSize"]["h"]), (0, 0, 0, 0))
                full.paste(page.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])), (s["x"], s["y"]))
                a = anchors[name]
                return full, (a["ax"], a["ay"])
    return None


def _night(img, lit):
    from PIL import Image
    over = Image.new("RGBA", img.size, (42, 52, 112, 158))
    dark = img.copy()
    dark.alpha_composite(Image.composite(over, Image.new("RGBA", img.size, (0, 0, 0, 0)), img.getchannel("A")))
    if lit is not None:
        dark.alpha_composite(lit)
    return dark


def preview(sprites, out_dir):
    from PIL import Image, ImageDraw
    os.makedirs(out_dir, exist_ok=True)
    names = [n for n in sprites if (n.startswith("in:") or n.startswith("signal:") or n.startswith("tree:street")
                                    or n.startswith("avenue") or n.startswith("zebra2")) and not n.endswith("@lights")]
    cells = []
    for n in names:
        img, _ = sprites[n]
        lit = sprites.get(n + "@lights", (None,))[0]
        cells.append((n, img, _night(img, lit)))
    per_row = 10
    cw = max(i.width for _, i, _ in cells) * 2 + 8
    rows = [cells[k:k + per_row] for k in range(0, len(cells), per_row)]
    heights = [max(i.height for _, i, _ in r) for r in rows]
    W, H = per_row * cw, sum(h * 2 + 2 + 14 for h in heights) * 2 // 2 + 8
    sheet = Image.new("RGBA", (W, sum(2 * h + 16 for h in heights)), (120, 128, 120, 255))
    d = ImageDraw.Draw(sheet)
    y = 0
    for r, h in zip(rows, heights):
        for k, (n, img, night) in enumerate(r):
            x = k * cw
            sheet.alpha_composite(img, (x + 2, y + h - img.height))
            sheet.paste((26, 30, 52, 255), (x + 2 + img.width + 2, y, x + 4 + 2 * img.width, y + h))
            sheet.alpha_composite(night, (x + 4 + img.width, y + h - img.height))
            d.text((x + 2, y + h + 2), n.replace("in:", ""), fill=(255, 255, 255, 255))
        y += h + 16
    sheet = sheet.crop((0, 0, W, y))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(out_dir, "infill-preview.png"))
    street(sprites, out_dir)


def street(sprites, out_dir):
    """A few blocks of mixed infill along an avenue, a landmark and Kai for scale, by day and by night."""
    from PIL import Image
    HW, HH = 16, 8
    N = 16
    W, H = (2 * N) * HW + 40, N * 2 * HH + 210
    ox, oy = W // 2, 200

    def get(name):
        if name in sprites:
            return sprites[name]
        return _atlas_sprite(name)

    def scene(night):
        can = Image.new("RGBA", (W, H), (30, 36, 52, 255))

        def put(name, gx, gy):
            """Each sprite darkened by the night overlay, then its own lights, in depth order (nearer paint hides them)."""
            s = get(name)
            if s is None:
                return
            img, (ax, ay) = s
            ls = get(name + "@lights")
            if night:
                img = _night(img, ls[0] if ls else None)
            can.alpha_composite(img, (ox + round((gx - gy) * HW) - ax, oy + round((gx + gy) * HH) - ay))

        # an avenue along x on rows 7-8, a street along y on column 7, sidewalks round four blocks
        for gy in range(N):
            for gx in range(N):
                if gy in (7, 8):
                    t = "avenueJunction" if gx == 7 else ("zebra2X" if gx in (6, 8) else f"avenueX{gy - 7}")
                elif gx == 7:
                    t = "zebraX" if gy in (6, 9) else "roadY"
                elif gy in (6, 9) or gx in (6, 8):
                    t = "sidewalk"
                else:
                    t = "grass0"
                put(t, gx, gy)
        items = [
            # north-west block: a row on the avenue, mid-rises behind, towers at the back
            ("in:warm:brownstone:2x1:0", 0, 5), ("in:warm:walkup:1x1:0", 2, 5), ("in:warm:loft:2x1:0", 3, 5), ("in:warm:corner:1x1:0", 5, 5),
            ("in:warm:prewar:2x2:0", 0, 3), ("in:cool:walkup:1x1:1", 2, 4), ("in:warm:loft:1x2:1", 3, 3), ("in:warm:rowhouse:1x2:0", 4, 3),
            ("in:warm:brownstone:1x2:0", 5, 3), ("in:cool:setback:2x2:2", 0, 0), ("in:cool:slab:2x2:0", 2, 0), ("in:warm:setback:2x2:0", 4, 0),
            ("in:cool:slab:1x1:1", 2, 2),
            # north-east block: a landmark among the infill
            ("lm:s3:3", 9, 3), ("in:cool:rowhouse:2x1:0", 12, 5), ("in:cool:brownstone:2x1:1", 14, 5), ("in:cool:slab:1x1:0", 12, 4),
            ("in:cool:walkup:1x1:0", 13, 4), ("in:cool:prewar:2x2:1", 14, 3), ("in:cool:setback:2x2:1", 12, 1), ("in:warm:slab:2x2:0", 14, 0),
            ("in:cool:corner:1x1:1", 9, 0),
            # south-west block
            ("in:warm:rowhouse:2x1:1", 0, 10), ("in:cool:brownstone:1x1:0", 2, 10), ("in:warm:walkup:1x1:1", 3, 10), ("in:cool:loft:1x1:0", 4, 10),
            ("in:warm:corner:1x1:1", 5, 10), ("in:cool:prewar:2x2:0", 0, 11), ("in:warm:setback:2x2:2", 2, 12), ("in:warm:slab:2x2:1", 4, 12),
            # south-east block
            ("in:cool:corner:1x1:0", 9, 10), ("in:warm:brownstone:2x1:1", 10, 10), ("in:cool:rowhouse:2x1:1", 12, 10), ("in:cool:loft:2x1:0", 14, 10),
            ("in:warm:prewar:2x2:1", 9, 11), ("in:warm:setback:2x2:1", 11, 12), ("in:cool:slab:2x2:1", 13, 12), ("in:warm:loft:1x1:1", 15, 12),
            # the street
            ("tree:street:0", 1, 6), ("tree:street:1", 3, 6), ("tree:street:0", 11, 9), ("tree:street:1", 13, 9),
            ("signal:ew:g", 6, 6), ("signal:ns:r", 8, 6), ("signal:ns:r", 6, 9), ("signal:ew:g", 8, 9),
            ("veh:car:navy:SE", 11, 8), ("veh:car:white:NW", 2, 7), ("kai", 4, 9),
        ]

        def depth(t):
            name, gx, gy = t
            m = name.split(":")
            fw, fh = (int(m[3].split("x")[0]), int(m[3].split("x")[1])) if name.startswith("in:") else (3, 3) if name.startswith("lm:") else (1, 1)
            return gx + gy + (fw + fh) / 2

        for name, gx, gy in sorted(items, key=depth):
            if name == "kai":
                kai, _ = _kai()
                kai = _night(kai, None) if night else kai
                can.alpha_composite(kai, (ox + round((gx + 0.5 - gy - 0.5) * HW) - 24, oy + round((gx + gy + 1) * HH) - 67))
                continue
            if get(name) is None:
                print("missing", name)
                continue
            put(name, gx, gy)
        return can

    day, nite = scene(False), scene(True)
    both = Image.new("RGBA", (W * 2 + 8, H), (0, 0, 0, 255))
    both.paste(day, (0, 0))
    both.paste(nite, (W + 8, 0))
    both.resize((both.width * 2, both.height * 2), Image.NEAREST).save(os.path.join(out_dir, "infill-street-preview.png"))


def _kai():
    from PIL import Image
    root = os.path.abspath(os.path.join(HERE, "..", ".."))
    d = os.path.join(root, "public", "assets", "characters", "player-gold")
    sheet = Image.open(os.path.join(d, "sheet.png")).convert("RGBA")
    return sheet.crop((0, 0, 48, 72)), (24, 67)


if __name__ == "__main__":
    import generate_tiles
    import streets_art
    generate_tiles.load_pack()
    generate_tiles.add("sidewalk", generate_tiles.PACKIMG["sidewalk"][0], (16, 0))
    generate_tiles.add("grass0", generate_tiles.PACKIMG["grass"][0], (16, 0))
    generate_tiles.ground("roadY", generate_tiles.ASPHALT, generate_tiles.road_line("y"))
    generate_tiles.ground("zebraX", generate_tiles.ASPHALT, generate_tiles.zebra("x"))
    streets_art.build(generate_tiles.add)
    build(generate_tiles.add, strict=False)
    preview(generate_tiles.SPRITES, os.path.join(HERE, "..", "..", ".cache", "art"))
    print("preview → .cache/art/infill-preview.png, .cache/art/infill-street-preview.png")
