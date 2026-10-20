"""
Street furniture for the dense city: two-lane avenues, wide zebras, traffic lights and street trees.

Ground (named like the other ground tiles in generate_tiles.build_ground, no prefix):
  avenueX0 / avenueX1   an avenue running along grid x: the lane at the smaller y (0) and the larger y (1); each
                        draws one of the double centre lines on the edge the two lanes share
  avenueY0 / avenueY1   the same along grid y (lane 0 at the smaller x)
  avenueJunction        where avenues cross: asphalt and a manhole cover
  zebra2X / zebra2Y     a wide crossing laid on both lanes of an avenue; zebra2X is used where zebraX is (a road
                        along y: stripes parallel to the traffic, repeating across the tile so the two lanes join
                        into one crossing), zebra2Y where zebraY is (a road along x)
Props (1x1, anchored at the N corner like every prop; the pole stands at the tile centre):
  signal:<ns|ew>:<g|a|r> (+ @lights)  a traffic light whose head faces traffic along grid y (ns: lamps on the left
                        face) or grid x (ew: lamps on the right face), showing green, amber or red; the lit lamp
                        glows at night
  tree:street:0 / 1     a slim street tree in an iron-edged pit: high, compact crown, thin trunk

Called from generate_tiles.main as streets_art.build(add).
"""
from generate_tiles import ASPHALT, WHITE, Canvas, ground, seeded, shade, specks
from services.kit import STEEL_D, Kit, A, ground_shadow, prism

AMBER_LINE = (226, 182, 74)
LAMP = {"r": (236, 70, 58), "a": (246, 172, 40), "g": (90, 220, 120)}
HEAD = (44, 50, 58)
POLE = (78, 86, 96)


def double_line(axis, lane):
    """One of the avenue's double centre lines, on the edge the lane shares with the other lane."""
    t = 0.9 if lane == 0 else 0.1

    def f(c, r):
        specks(shade(ASPHALT, 1.18), 4)(c, r)
        if axis == "x":
            c.d.line([c.P(0, t), c.P(1, t)], fill=A(AMBER_LINE))
        else:
            c.d.line([c.P(t, 0), c.P(t, 1)], fill=A(AMBER_LINE))
        # a faint lane-edge line along the kerb
        e = 0.06 if lane == 0 else 0.94
        for k in range(3):
            a = k / 3 + 0.04
            p0, p1 = (c.P(a, e), c.P(a + 0.18, e)) if axis == "x" else (c.P(e, a), c.P(e, a + 0.18))
            c.d.line([p0, p1], fill=A(shade(ASPHALT, 1.45)))
    return f


def junction(c, r):
    specks(shade(ASPHALT, 1.18), 5)(c, r)
    x, y = c.P(0.5, 0.5)
    c.d.ellipse((x - 4, y - 2, x + 3, y + 1), fill=A(shade(ASPHALT, 0.78)))
    c.d.ellipse((x - 3, y - 1, x + 2, y), fill=A(shade(ASPHALT, 0.9)))


def zebra2(axis):
    """Four broad stripes per tile at a 0.25 period, so the stripes run on into the next lane's tile."""
    def f(c, r):
        for k in range(4):
            a = 0.065 + k * 0.25
            if axis == "x":
                c.poly([(a, 0.1), (a + 0.12, 0.1), (a + 0.12, 0.9), (a, 0.9)], shade(WHITE, 0.94))
            else:
                c.poly([(0.1, a), (0.9, a), (0.9, a + 0.12), (0.1, a + 0.12)], shade(WHITE, 0.94))
    return f


def signal(direction, state):
    """A traffic-light pole at the tile centre with one three-lamp head (red over amber over green)."""
    c = Kit(1, 1, 40)
    u, v = 0.5, 0.5
    ground_shadow(c, u - 0.05, v - 0.05, u + 0.05, v + 0.05, spread=0.1, alpha=60)
    prism(c, u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 26, POLE, rim=0)
    prism(c, u - 0.07, v - 0.07, u + 0.07, v + 0.07, 0, 2, shade(POLE, 0.9), rim=0, ao=False)
    a0, a1 = 0.38, 0.62
    prism(c, a0, a0, a1, a1, 24, 36, HEAD, rim=0, ao=False)
    side = "L" if direction == "ns" else "R"
    for k, s in enumerate(("r", "a", "g")):
        z0 = 32 - k * 4
        on = s == state
        col = LAMP[s] if on else shade(LAMP[s], 0.32)
        if side == "L":
            pts = [(0.44, a1, z0), (0.56, a1, z0), (0.56, a1, z0 + 2), (0.44, a1, z0 + 2)]
        else:
            pts = [(a1, 0.56, z0), (a1, 0.44, z0), (a1, 0.44, z0 + 2), (a1, 0.56, z0 + 2)]
        c.poly(pts, col)
        if on:
            x, y = c.P(*pts[0][:2], z0 + 1)
            x2, _ = c.P(*pts[1][:2], z0 + 1)
            cx = (x + x2) // 2
            c.ld.ellipse((cx - 3, y - 3, cx + 3, y + 2), fill=A(col, 110))
            c.poly(pts, col, c.ld)
    return c


def street_tree(v):
    """A slim street tree: a square pit with an iron edge, a thin trunk, a compact crown held high."""
    c = Canvas(1, 1, 44)
    r = seeded(f"street-tree{v}")
    c.poly([(0.36, 0.36, 0), (0.64, 0.36, 0), (0.64, 0.64, 0), (0.36, 0.64, 0)], (64, 56, 48))
    c.line((0.36, 0.64, 0), (0.64, 0.64, 0), STEEL_D)
    c.line((0.64, 0.64, 0), (0.64, 0.36, 0), STEEL_D)
    x, y = c.P(0.5, 0.5)
    th = 20 if v == 0 else 24
    c.d.rectangle((x - 1, y - th, x, y), fill=A((112, 82, 56)))
    c.d.line([(x - 1, y - th), (x - 1, y)], fill=A((136, 102, 72)))
    greens = [(70, 150, 76), (88, 170, 86), (112, 190, 100)] if v == 0 else [(78, 140, 70), (100, 160, 80), (128, 182, 96)]
    cy = y - th - (6 if v == 0 else 8)
    blobs = [(0, 0, 7), (-4, 2, 5), (4, 2, 5), (0, -4, 5)] if v == 0 else [(0, 2, 6), (0, -4, 6), (-3, 3, 4), (3, 3, 4), (0, -9, 4)]
    for dx, dy, rr in blobs:
        c.d.ellipse((x + dx - rr, cy + dy - rr, x + dx + rr, cy + dy + rr), fill=A(greens[0]))
    for dx, dy, rr in blobs:
        c.d.ellipse((x + dx - rr + 1, cy + dy - rr, x + dx + rr - 2, cy + dy + rr - 2), fill=A(greens[1]))
    for _ in range(5):
        c.d.point([(x - 4 + r(6), cy - 5 + r(6))], fill=A(greens[2]))
    return c


def build(add):
    for axis, AX in (("x", "X"), ("y", "Y")):
        for lane in (0, 1):
            ground(f"avenue{AX}{lane}", ASPHALT, double_line(axis, lane))
        ground(f"zebra2{AX}", ASPHALT, zebra2(axis))
    ground("avenueJunction", ASPHALT, junction)
    for d in ("ns", "ew"):
        for s in ("g", "a", "r"):
            add(f"signal:{d}:{s}", signal(d, s))
    for v in (0, 1):
        add(f"tree:street:{v}", street_tree(v), lights=False)
