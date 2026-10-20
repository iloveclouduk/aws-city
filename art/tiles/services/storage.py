"""
Data Lake Shores (s3 ebs efs glue athena lakeformation backup kinesis): front buildings lm_<id> and towers tw_<id> (see
services/__init__.py). Front buildings keep their metaphors: the S3 lake with its boathouse and bucket silos, the EBS
locker hall, the EFS shared well, the Glue workshop, the Athena lighthouse and the Lake Formation gatehouse.
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, WATER, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, GLASS_DK, GLASS_L, LED, LIT, RED, STEEL, STEEL_D, STEEL_M, STONE,  # noqa: F401
                          Kit, A, beacon, bands, combine, drum, drum_shadow, ellipse, face, glass, ground_shadow, hv, leds,
                          louvres, masonry, plant, podium, prism, punched, rib_shader, ribbon_shader, ribs, solid, tip, top_band)
from services.compute import CU, CV, H, canvas, quay, water_strip  # noqa: F401

ROCK = (150, 144, 136)
ROCK_D = (112, 106, 100)
SAND = (226, 208, 160)
CREAM = (232, 226, 206)
BRICK = (176, 98, 74)
LEAF = (86, 178, 74)
LEAF_D = (44, 120, 56)


def ripple(c, u, v, w=6):
    x, y = c.P(u, v, 0)
    c.d.ellipse((x - w, y - 2, x + w, y + 2), outline=A(shade(WATER, 1.3)))


def bucket(c, u, v, z, col, s=1.0):
    """A floating bucket (an object in the lake): a tapered pail with a rim, its mouth dark."""
    drum(c, u, v, z, z + round(7 * s), 0.17 * s, col, r1=0.24 * s, shader=rib_shader(6), capcol=shade(col, 0.45), ao=False)
    ellipse(c, u, v, z + round(7 * s), 0.18 * s, shade(col, 0.4), rim=False)


def bucket_stack(c, u, v, z0, segs, seg_h, r0, r1, col, key, lit=True, mouth=True):
    """Bucket silos stacked rim on rim: each a tapered ribbed drum wider at the top with a lip, the top one open."""
    z = z0
    for s in range(segs):
        sh = ribbon_shader(key + str(s), floor=seg_h, win=2, p=0.5, glass_col=(200, 236, 160)) if lit and s % 2 else None
        rib = rib_shader(12, hoops=(0.33, 0.66), hoop=1.18)

        def both(th, zz, h, base, sh=sh, rib=rib):
            return (sh and sh(th, zz, h, base)) or rib(th, zz, h, base)
        drum(c, u, v, z, z + seg_h, r0, col, r1=r1, shader=both, cap=False, ao=z <= 1)
        drum(c, u, v, z + seg_h, z + seg_h + 2, r1 + 0.04, shade(col, 1.12), ao=False, cap=s < segs - 1 or not mouth)
        z += seg_h + 2
    if mouth:
        ellipse(c, u, v, z, r1 + 0.04, shade(col, 1.1))
        ellipse(c, u, v, z, r1 - 0.02, (34, 52, 40), rim=False, light=(150, 230, 120, 120) if lit else None)
    return z


# ── S3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_s3(fw, fh, tier, col, key):
    """S3 Lake: a timber boathouse on stilts at the shore, buckets bobbing on the lake (objects, more each tier), a
    pier with a lamp from tier 2, bucket silos on the sand from tier 3, buoy lights at 4. The lot's ground is water."""
    c = Kit(fw, fh, 70)
    spots = [(2.3, 0.5), (0.6, 0.45), (2.6, 1.3), (1.0, 1.0), (2.0, 1.1), (0.4, 1.3)]
    for i in range(min(tier + 1, len(spots))):
        u, v = spots[i]
        ripple(c, u, v, 7)
        bucket(c, u, v, 0, [col, (226, 72, 64), ORANGE, (59, 130, 246)][int(hv(key, i) * 4)], s=0.85)
    if tier >= 2:  # the pier
        for v in (0.45, 1.05, 1.65):
            for u in (1.36, 1.64):
                prism(c, u, v, u + 0.06, v + 0.06, -3, 2, WOOD_D, rim=0, ao=False)
        prism(c, 1.35, 0.35, 1.7, 2.1, 2, 4, WOOD, L=ribs(3, 1.1, 0.85), roofcol=shade(WOOD, 1.08), rim=0, ao=False)
        for kk in range(1, 9):
            c.line((1.36, 0.35 + kk * 0.2, 4), (1.69, 0.35 + kk * 0.2, 4), WOOD_D)
        prism(c, 1.4, 0.4, 1.46, 0.46, 4, 16, CHAR, rim=0, ao=False)
        x, y = c.P(1.43, 0.43, 17)
        c.d.rectangle((x - 1, y - 2, x + 1, y), fill=A(LIT))
        c.ld.ellipse((x - 4, y - 5, x + 4, y + 3), fill=A(LIT, 160))
        prism(c, 0.75, 0.35, 1.3, 0.62, 0, 3, (226, 72, 64), L=bands([(2, 3, WHITE)]), rim=0.04)  # a rowing boat
    # the boathouse on stilts
    h = 13 + 3 * tier
    a0, b0, a1, b1 = 0.15, 1.5, 1.1 + 0.04 * tier, 2.75
    ground_shadow(c, a0, b0, a1, b1, alpha=60)
    for u in (a0 + 0.05, a1 - 0.1):
        prism(c, u, b1 - 0.06, u + 0.06, b1, -3, 2, WOOD_D, rim=0, ao=False)
    clap = combine(louvres(3, 0.78), solid())
    door = lambda i, n, z, hh, b, s: ((NAVY_D if z > 3 else shade(WATER, 0.8)), None) if n * 0.2 < i < n * 0.65 and z < hh - 5 else None
    win = lambda i, n, z, hh, b, s: ((GLASS_L, LIT if (i // 5) % 2 == 0 or tier >= 2 else None) if (i % 5) in (1, 2, 3) and hh - 9 <= z < hh - 5 and 1 < i < n - 2 else None)
    prism(c, a0, b0, a1, b1, 0, h, WOOD, L=combine(win, clap), R=combine(door, clap), roof=False)
    c.gable(a0 - 0.06, b0 - 0.06, a1 + 0.06, b1 + 0.06, h, 8 + tier, col)
    vm = (b0 + b1) / 2
    c.line((a0 - 0.06, vm, h + 8 + tier), (a1 + 0.06, vm, h + 8 + tier), shade(col, 1.3))
    if tier >= 3:  # silos on the sand
        for i, (u, v, s) in enumerate(((2.55, 2.1, 2), (2.0, 2.6, 1), (2.65, 2.7, 1))[: 1 + (tier >= 4) * 2]):
            drum_shadow(c, u, v, 0.28, 60)
            bucket_stack(c, u, v, 0, s + 1, 8, 0.2, 0.26, [col, shade(col, 1.12), shade(col, 0.9)][i], key + f"s{i}")
    if tier >= 4:
        for u, v in ((0.2, 0.2), (2.85, 0.25)):
            beacon(c, u, v, 3)
    return c


def tw_s3(tier, k):
    """Bucket silos: a tall stack of tapered, ribbed bucket drums rim on rim, open at the top with a gantry and
    mast over the mouth; two smaller stacks join it from tier 3, a catwalk ties them at tier 4."""
    if tier < 2:
        return None
    c = canvas(tier, extra=40)
    green = (136, 172, 84)
    seg = 24
    segs = {2: 2, 3: 4, 4: 6}[tier]
    sat = []
    if tier >= 3:
        sat = [(0.3, 0.3 + 0.75, segs - 2), (0.3 + 0.75, 0.3, segs - 1)]
    # the two side stacks stand beside the main one (same depth line), drawn first
    for i, (u, v, s) in enumerate(sat):
        drum_shadow(c, u, v, 0.32)
        bucket_stack(c, u, v, 0, s, seg, 0.24, 0.3, shade(green, 0.92 + 0.08 * i), k + f"sat{i}")
    drum_shadow(c, CU, CV, 0.46)
    z = bucket_stack(c, CU, CV, 0, segs, seg, 0.34, 0.44, green, k)
    if tier >= 4:  # catwalks to the side stacks
        for (u, v, s) in sat:
            zt = s * (seg + 2)
            x0, y0 = c.P(u, v, zt)
            x1, y1 = c.P(CU, CV, zt)
            c.d.line([(x0, y0), (x1, y1)], fill=A(STEEL_D), width=2)
            c.d.line([(x0, y0 - 3), (x1, y1 - 3)], fill=A(STEEL_M))
    # a gantry over the open mouth, and the mast
    x, y = c.P(CU, CV, z)
    c.d.line([(x - 9, y + 1), (x - 2, y - 7)], fill=A(STEEL_D), width=2)
    c.d.line([(x + 9, y + 1), (x + 1, y - 7)], fill=A(STEEL_M), width=2)
    c.d.rectangle((x - 4, y - 10, x + 3, y - 6), fill=A(NAVY))
    c.d.line([(x - 4, y - 10), (x + 3, y - 10)], fill=A(shade(NAVY, 1.6)))
    tip(c, CU, CV, z + 10, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── EBS ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def lockers(key, col):
    """A wall of lockers: doors in two tones, a handle and a status LED each."""
    def g(i, n, z, h, base, side):
        if z < 2 or z >= h - 4 or i < 1 or i >= n - 1:
            return None
        bi, fz = i % 6, (z - 2) % 6
        if bi == 0 or fz == 5:
            return shade(col, 0.55 if side == "L" else 0.45), None
        tone = 0.95 if ((i // 6) + (z - 2) // 6) % 2 else 0.8
        tone *= 0.9 if side == "R" else 1.0
        if bi == 1 and fz == 2:
            return shade(col, 0.5), None
        if bi == 4 and fz == 3:
            on = hv(key, i // 6, (z - 2) // 6) < 0.65
            return (LED if on else shade(LED, 0.4)), (LED if on else None)
        return shade(col, tone), None
    return g


def lm_ebs(fw, fh, tier, col, key):
    """EBS Lockers: a locker hall whose street faces are walls of lockers (blocks you attach), volume drums racked
    along the side and cabled in; rooftop plant from tier 2, a glass storey and a snapshot kiosk from 3, the io2
    express lane at 4."""
    c = Kit(fw, fh, 72)
    h = 16 + 5 * tier
    u0, v0, u1, v1 = 0.35, 0.95, 2.05, 2.55
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, 0, 2, STONE, rim=0)
    prism(c, u0, v0, u1, v1, 2, h, CON_L, L=combine(top_band(3, col), lockers(key, col)), R=combine(top_band(3, col), lockers(key + "r", col)), ao=False)
    roof = h
    if tier >= 2:
        plant(c, u0 + 0.1, v0 + 0.1, u1 - 0.1, v0 + 0.6, roof, key + "p", n=2)
    if tier >= 3:  # a set-back glass storey
        a0, b0, a1, b1 = u0 + 0.35, v0 + 0.7, u1 - 0.2, v1 - 0.25
        gl = combine(top_band(2, col), glass(key + "g", bay=4, floor=10, p=0.6))
        prism(c, a0, b0, a1, b1, roof, roof + 10, GLASS_DK, L=gl, R=gl, ao=False)
    # the volume drums along the right
    nrow = 1 + (tier >= 3)
    ncol = min(5, 1 + tier)
    prism(c, 2.3, 0.35, 2.85, 2.75, 0, 1, CON_M, rim=0)
    for kk in range(ncol):
        v = 0.6 + kk * ((2.0 / max(1, ncol - 1)) if ncol > 1 else 0)
        for row in range(nrow):
            z = 1 + row * 10
            drum(c, 2.58, v, z, z + 9, 0.2, CON_L if (kk + row) % 2 else (176, 186, 198), shader=rib_shader(1, hoops=(3,), hoop=0.7), ao=row == 0)
            x, y = c.P(2.58, v, z + 3)
            on = hv(key, kk, row) < 0.6
            c.put(x - 2, y, LED if on else shade(LED, 0.4), LED if on else None)
            face(c, "R", 2.78, v - 0.05, v + 0.05, z + 5, z + 6, col, ao=False, edge=False)
        if tier >= 2 and kk < 3:
            x0, y0 = c.P(2.36, v, 3)
            x1, y1 = c.P(u1, min(v, v1), 3)
            c.d.line([(x0, y0), (x1, y1)], fill=A(NAVY_D))
    if tier >= 3:  # the snapshot kiosk (a camera on a box)
        prism(c, 0.35, 2.7, 0.75, 2.95, 0, 9, NAVY, L=lambda i, n, z, hh, b, s: ((WHITE, LIT) if n * 0.3 < i < n * 0.7 and 4 <= z < 7 else None))
    if tier >= 4:  # io2 express lane stripes
        for kk in range(3):
            c.poly([(0.95 + kk * 0.42, 2.7, 0), (1.2 + kk * 0.42, 2.7, 0), (1.2 + kk * 0.42, 2.95, 0), (0.95 + kk * 0.42, 2.95, 0)], ORANGE)
    return c


def tw_ebs(tier, k):
    """Stacked block volumes: a tower of offset blocks of different sizes, each a volume with a green band, a status
    strip and a recessed joint where it attaches to the next; a snapshot camera block on top."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    ground_shadow(c, 0.2, 0.2, 1.5, 1.5)
    z = 0
    i = 0
    green = (122, 161, 22)
    while z < top_z - 8:
        bh = 14 + int(hv(k, "h", i) * 10)
        bh = min(bh, top_z - z)
        half = 0.48 + hv(k, "s", i) * 0.14 - (0.06 if i == 0 else 0)
        du, dv = (hv(k, "u", i) - 0.5) * 0.24, (hv(k, "v", i) - 0.5) * 0.24
        if i == 0:
            du = dv = 0
        u0, v0, u1, v1 = CU + du - half, CV + dv - half, CU + du + half, CV + dv + half
        body = [(220, 224, 228), (196, 204, 186), (176, 184, 194)][i % 3]
        band = bands([(1, 3, green), (3, 4, shade(green, 0.7))])
        status = leds(k + str(i), step=3, every=bh, p=0.7, lo=bh - 5, hi=bh - 3)
        win = glass(k + f"b{i}", bay=5, floor=8, p=0.5, lo=5, hi=bh - 6) if bh > 16 else None
        prism(c, u0, v0, u1, v1, z, z + bh - 1, body, L=combine(band, status, win), R=combine(band, status, win, louvres(3, 0.88)), ao=z <= 1)
        # the joint: a recessed dark strip
        prism(c, u0 + 0.08, v0 + 0.08, u1 - 0.08, v1 - 0.08, z + bh - 1, z + bh, CHAR, rim=0, ao=False)
        z += bh
        i += 1
    # the snapshot camera on the roof
    prism(c, CU - 0.22, CV - 0.18, CU + 0.22, CV + 0.18, z, z + 7, NAVY, ao=False)
    x, y = c.P(CU + 0.22, CV, z + 4)
    c.d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(WHITE))
    c.d.point([(x, y)], fill=A(NAVY_D))
    c.light(x, y, LIT)
    tip(c, CU, CV, z + 7, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── EFS ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_efs(fw, fh, tier, col, key):
    """EFS Shared Well: a stone well under a timber roof in the middle of a little square, pipes running out to
    taps that many houses share (more each tier); a pump house from tier 3, a water tower at 4."""
    c = Kit(fw, fh, 70)
    c.poly([(0.1, 0.1, 0), (2.9, 0.1, 0), (2.9, 2.9, 0), (0.1, 2.9, 0)], (206, 198, 184))
    for kk in range(1, 6):
        c.line((kk / 2, 0.12, 0), (kk / 2, 2.88, 0), (190, 182, 168))
        c.line((0.12, kk / 2, 0), (2.88, kk / 2, 0), (190, 182, 168))
    taps = [(0.4, 0.4), (2.6, 0.4), (0.4, 2.6), (2.6, 2.6), (1.5, 0.3), (0.3, 1.5), (2.7, 1.5), (1.5, 2.7)]
    n = min(2 + 2 * tier, len(taps))
    for i in range(n):  # pipes in the paving, then the taps
        u, v = taps[i]
        x0, y0 = c.P(1.5, 1.5, 0)
        x1, y1 = c.P(u, v, 0)
        c.d.line([(x0, y0), (x1, y1)], fill=A(shade(col, 0.6)), width=3)
        c.d.line([(x0, y0 - 1), (x1, y1 - 1)], fill=A(shade(col, 1.1)))
    if tier >= 3:  # pump house
        prism(c, 2.05, 0.75, 2.6, 1.25, 0, 11, WOOD, L=ribs(3, 1.08, 0.86), R=combine(lambda i, nn, z, hh, b, s: ((GLASS_L, LIT) if nn * 0.3 < i < nn * 0.7 and 4 <= z < 8 else None), ribs(3, 1.08, 0.86)))
        c.gable(2.0, 0.7, 2.65, 1.3, 11, 5, NAVY)
    if tier >= 4:  # a water tower on legs
        for du, dv in ((-0.15, -0.15), (0.15, -0.15), (-0.15, 0.15), (0.15, 0.15)):
            prism(c, 0.75 + du - 0.03, 0.85 + dv - 0.03, 0.75 + du + 0.03, 0.85 + dv + 0.03, 0, 30, WOOD_D, rim=0)
        drum(c, 0.75, 0.85, 30, 42, 0.28, col, shader=rib_shader(10, hoops=(0.3, 0.7)), ao=False)
        x, y = c.P(0.75, 0.85, 42)
        c.d.polygon([(x - 7, y), (x + 7, y), (x, y - 6)], fill=A(shade(col, 0.7)))
        c.ld.rectangle((x - 1, y + 4, x, y + 8), fill=A(LIT))
    for i in range(n):
        u, v = taps[i]
        prism(c, u - 0.1, v - 0.1, u + 0.1, v + 0.1, 0, 7, STONE, rim=0)
        x, y = c.P(u, v + 0.1, 5)
        c.d.rectangle((x - 1, y - 1, x + 1, y), fill=A(STEEL_M))
        c.ld.ellipse((x - 2, y - 7, x + 2, y - 3), fill=A(LIT, 140))
        c.d.rectangle((x, y - 8, x, y - 4), fill=A(CHAR))
        c.d.point([(x, y - 9)], fill=A(LIT))
    # the stone well
    drum_shadow(c, 1.5, 1.5, 0.62)
    drum(c, 1.5, 1.5, 0, 12, 0.6, STONE, shader=lambda th, z, h, b: ((shade(b, 0.82), None) if z % 4 == 3 or (int((th + 2) * 6) + (z // 4)) % 3 == 0 and z % 4 == 0 else None), capcol=shade(STONE, 1.08))
    ellipse(c, 1.5, 1.5, 12, 0.48, shade(WATER, 0.75), rim=False, light=(140, 220, 255, 150))
    # posts, winch and roof
    ph = 22 + 3 * tier
    x, y = c.P(1.5, 1.5, 12)
    for dx in (-12, 11):
        c.d.rectangle((x + dx, y - ph, x + dx + 1, y + 2), fill=A(WOOD_D))
    c.d.line([(x - 12, y - ph + 6), (x + 12, y - ph + 6)], fill=A(WOOD_D), width=2)
    c.d.line([(x, y - ph + 6), (x, y - 4)], fill=A(CHAR))
    c.d.rectangle((x - 2, y - 6, x + 2, y - 2), fill=A(WOOD))
    yr = y - ph
    c.d.polygon([(x - 20, yr + 2), (x, yr - 10), (x + 20, yr + 2)], fill=A(col))
    c.d.polygon([(x, yr - 10), (x + 20, yr + 2), (x + 3, yr + 2)], fill=A(shade(col, 0.76)))
    c.d.line([(x - 20, yr + 2), (x, yr - 10)], fill=A(shade(col, 1.25)))
    for kk in range(-16, 18, 5):
        c.d.point([(x + kk, yr + 1)], fill=A(shade(col, 0.6)))
    return c


def tw_efs(tier, k):
    """Branching shared-folder wings: a glass core with folder-shaped wings (a box with a tab) branching off it at
    staggered heights on every side, as many folders sharing one file system."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    core = (0.62, 0.62, 1.08, 1.08)
    folder = (236, 200, 104)
    wings = []
    z = 14
    i = 0
    while z + 12 <= top_z - 6:
        d = ["+u", "+v", "-u", "-v"][i % 4]
        L = 0.42 + hv(k, "l", i) * 0.25
        if d == "+u":
            box = (core[2], 0.66, core[2] + L, 1.04)
        elif d == "+v":
            box = (0.66, core[3], 1.04, core[3] + L)
        elif d == "-u":
            box = (core[0] - L, 0.66, core[0], 1.04)
        else:
            box = (0.66, core[1] - L, 1.04, core[1])
        wings.append((d, box, z))
        z += 10 + int(hv(k, "z", i) * 6)
        i += 1

    def wing(d, box, z):
        u0, v0, u1, v1 = box
        cc = folder if (int(hv(k, "c", z) * 3)) else shade((150, 186, 70), 1.0)
        gl = glass(k + f"wg{z}", bay=4, floor=6, p=0.55, lo=2, hi=10)
        prism(c, u0, v0, u1, v1, z, z + 11, cc, L=combine(top_band(2, shade(cc, 0.85)), gl), R=combine(top_band(2, shade(cc, 0.85)), gl), ao=False)
        # the folder tab at the far end
        if d in ("+u", "-u"):
            ta = u1 - 0.24 if d == "+u" else u0
            prism(c, ta, v0, ta + 0.24, v1, z + 11, z + 14, shade(cc, 1.05), ao=False, rim=0)
        else:
            tb = v1 - 0.24 if d == "+v" else v0
            prism(c, u0, tb, u1, tb + 0.24, z + 11, z + 14, shade(cc, 1.05), ao=False, rim=0)

    ground_shadow(c, 0.3, 0.3, 1.4, 1.4)
    prism(c, 0.3, 0.3, 1.4, 1.4, 0, 12, (196, 204, 186), L=combine(top_band(2, (122, 161, 22)), glass(k + "pod", bay=5, floor=12, p=0.8, lo=1, hi=9)),
          R=combine(top_band(2, (122, 161, 22)), glass(k + "podr", bay=5, floor=12, p=0.8, lo=1, hi=9)))
    for d, box, wz in wings:
        if d[0] == "-":
            wing(d, box, wz)
    gl = glass(k + "core", bay=4, floor=6, p=0.5)
    prism(c, *core, 12, top_z, GLASS_DK, L=combine(top_band(3, (122, 161, 22)), gl), R=combine(top_band(3, (122, 161, 22)), gl), ao=False, zref=12, href=top_z - 12)
    for d, box, wz in wings:
        if d[0] == "+":
            wing(d, box, wz)
    tip(c, CU, CV, top_z, h=10 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Glue ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_glue(fw, fh, tier, col, key):
    """Glue Workshop: a brick workshop with a north-light roof and a chimney, a conveyor carrying data boxes in, glue
    pots bubbling (more each tier); a sign from tier 2, a crawler antenna from 3, smoke at 4."""
    c = Kit(fw, fh, 76)
    h = 18 + 3 * tier
    u0, v0, u1, v1 = 0.3, 0.3, 2.7, 1.55
    ground_shadow(c, u0, v0, u1, v1)
    brick = combine(top_band(3, col), punched(key, bay=8, floor=h, ww=5, wh=7, p=0.7, lo=1), louvres(3, 0.86), solid())
    prism(c, u0, v0, u1, v1, 0, h, BRICK, L=brick, R=combine(top_band(3, col), punched(key + "r", bay=8, floor=h, ww=5, wh=7, p=0.7, lo=1), louvres(3, 0.86), solid()), roof=False)
    c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, h, 9, (70, 78, 96))
    vm = (v0 + v1) / 2
    for kk in range(4):  # roof lights
        a = u0 + 0.3 + kk * 0.55
        c.poly([(a, v1 - 0.1, h + 1), (a + 0.3, v1 - 0.1, h + 1), (a + 0.3, vm + 0.1, h + 8), (a, vm + 0.1, h + 8)], GLASS_L)
    prism(c, 0.6, 0.45, 0.9, 0.75, h, h + 18, BRICK, L=louvres(3, 0.85), R=louvres(3, 0.85), ao=False)
    prism(c, 0.57, 0.42, 0.93, 0.78, h + 18, h + 20, CHAR, ao=False)
    # the conveyor and its boxes
    prism(c, 0.2, 1.85, 2.8, 2.15, 0, 4, CON_D, L=bands([(3, 4, ORANGE)]), roofcol=CHAR)
    for i in range(min(tier + 1, 4)):
        u = 0.35 + i * 0.6
        prism(c, u, 1.9, u + 0.26, 2.1, 4, 8, [(226, 72, 64), (59, 130, 246), (34, 170, 94), ORANGE][i], rim=0, ao=False)
    for i in range(min(tier, 3)):  # glue pots
        u = 1.0 + i * 0.6
        drum(c, u, 2.55, 0, 8, 0.18, CHAR, shader=rib_shader(1, hoops=(6,)), capcol=col)
        x, y = c.P(u, 2.55, 8)
        c.d.point([(x - 1, y - 1), (x + 2, y - 2)], fill=A(shade(col, 1.4)))
        c.d.rectangle((x + 4, y, x + 4, y + 4), fill=A(col))
        c.ld.ellipse((x - 3, y - 2, x + 3, y + 1), fill=A(col, 160))
    if tier >= 2:  # the glue-brush sign
        x, y = c.P(1.5, v1, h + 2)
        c.d.rectangle((x - 9, y - 9, x + 9, y - 1), fill=A(WHITE))
        c.d.line([(x - 9, y - 9), (x + 9, y - 9)], fill=A(shade(WHITE, 0.8)))
        c.d.line([(x - 6, y - 5), (x + 6, y - 5)], fill=A(col), width=2)
        c.d.rectangle((x + 4, y - 7, x + 7, y - 3), fill=A(NAVY))
    if tier >= 3:  # crawler antenna
        x, y = c.P(2.3, 0.9, h + 5)
        c.d.line([(x, y), (x, y - 12)], fill=A(STEEL_D))
        c.d.ellipse((x - 3, y - 15, x + 3, y - 11), outline=A(col))
    if tier >= 4:
        x, y = c.P(0.75, 0.6, h + 20)
        for kk in range(3):
            c.d.ellipse((x + kk * 3 - 2, y - 4 - kk * 4, x + kk * 3 + 2, y - kk * 4), fill=A(CON_L, 220))
    return c


def tw_glue(tier, k):
    """Pipes and joints: a steel process column ringed by platforms, two pipe risers beside it tied in with elbows and
    red valve wheels, a vent at the top (a column that joins data streams, as a refinery does)."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier)
    ground_shadow(c, 0.25, 0.25, 1.45, 1.45)
    prism(c, 0.25, 0.25, 1.45, 1.45, 0, 4, CON_M, rim=0)
    risers = [(0.4, 1.25, top_z - 26, (122, 161, 22)), (1.25, 0.4, top_z - 14, ORANGE)]
    for (u, v, h, cc) in risers:  # side risers stand at the same depth as the column, drawn first
        drum(c, u, v, 4, h, 0.09, cc, shader=rib_shader(1, hoops=tuple(range(10, 400, 18))), gloss=True)
        ellipse(c, u, v, h, 0.11, shade(cc, 0.8))
    drum(c, CU, CV, 4, top_z, 0.3, STEEL, shader=rib_shader(1, hoops=tuple(range(8, 400, 12)), hoop=0.86), gloss=True, capcol=STEEL_M)
    # platforms with railings
    for z in range(30, top_z - 6, 28):
        drum(c, CU, CV, z, z + 2, 0.42, (70, 78, 96), ao=False)
        x, y = c.P(CU, CV, z + 2)
        c.d.arc((round(x - 0.42 * 22.6), round(y - 0.42 * 11.3 - 4), round(x + 0.42 * 22.6), round(y + 0.42 * 11.3 - 4)), 0, 180, fill=A(ORANGE))
    # pipe bridges from the risers to the column, with valve wheels
    for (u, v, h, cc) in risers:
        for z in range(22, h - 4, 34):
            x0, y0 = c.P(u, v, z)
            x1, y1 = c.P(CU, CV, z)
            c.d.line([(x0, y0), (x1, y1)], fill=A(shade(cc, 0.8)), width=3)
            c.d.line([(x0, y0 - 1), (x1, y1 - 1)], fill=A(shade(cc, 1.15)))
            mx, my = (x0 + x1) // 2, (y0 + y1) // 2
            c.d.ellipse((mx - 3, my - 5, mx + 3, my + 1), outline=A(RED))
            c.d.point([(mx, my - 2)], fill=A(RED))
    # a ladder up the column's front
    x, y = c.P(CU + 0.15, CV + 0.25, 4)
    c.d.line([(x, y), (x, y - top_z + 8)], fill=A(STEEL_D))
    # the vent cap
    drum(c, CU, CV, top_z, top_z + 6, 0.18, STEEL_M, r1=0.1, ao=False)
    if tier >= 4:  # a pilot flame on the vent, lit at night
        x, y = c.P(CU - 0.12, CV + 0.12, top_z + 8)
        c.d.polygon([(x - 2, y), (x + 1, y), (x - 1, y - 5)], fill=A(ORANGE))
        c.ld.ellipse((x - 4, y - 7, x + 3, y + 1), fill=A(ORANGE, 170))
    tip(c, CU, CV, top_z + 6, h=10 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Athena ────────────────────────────────────────────────────────────────────────────────────────────────────────

def rocks(c, u, v, r, key, n=7):
    for i in range(n):
        a = hv(key, i) * 2 * math.pi
        rr = r * (0.5 + 0.5 * hv(key, "r", i))
        uu, vv = u + math.cos(a) * rr, v + math.sin(a) * rr
        s = 0.12 + hv(key, "s", i) * 0.12
        prism(c, uu - s, vv - s, uu + s, vv + s, 0, 3 + int(hv(key, "h", i) * 5), ROCK, rim=0)


def lm_athena(fw, fh, tier, col, key):
    """Athena: a harbour lighthouse on a rock jetty, striped in white and the district green, its lantern lit and its
    beam sweeping the lake; a keeper's cottage from tier 2, the query-glass sign from 3, a second beam at 4."""
    c = Kit(fw, fh, 92)
    LU, LV = 2.3, 1.15
    rocks(c, LU, LV, 0.6, key)
    prism(c, LU - 0.5, LV - 0.5, LU + 0.5, LV + 0.5, 0, 5, STONE, R=louvres(2, 0.9), roofcol=shade(STONE, 1.05))
    if tier >= 2:  # keeper's cottage
        prism(c, 0.35, 1.95, 1.15, 2.7, 0, 12, WHITE, L=combine(punched(key + "k", bay=7, floor=12, ww=3, wh=4, p=0.9), solid()), R=punched(key + "kr", bay=7, floor=12, ww=3, wh=4, p=0.6), roof=False)
        c.gable(0.3, 1.9, 1.2, 2.75, 12, 7, (140, 60, 48))
        prism(c, 0.5, 2.05, 0.62, 2.17, 14, 22, BRICK, rim=0, ao=False)
    h = 36 + 8 * tier
    segs = 3 + tier

    def stripes(th, z, hh, b):
        band = int(z / hh * segs)
        if band % 2:
            d = math.cos(th) * 0.70 - math.sin(th) * 0.318
            return shade(col, max(0.62, min(0.96, 0.612 + 0.4 * d))), None
        return None
    drum_shadow(c, LU, LV, 0.4)
    drum(c, LU, LV, 5, h, 0.36, WHITE, r1=0.24, shader=stripes, capcol=NAVY, ao=False)
    for i in range(1, segs, 2):
        x, y = c.P(LU, LV, 5 + round((i + 0.5) * (h - 5) / segs))
        c.d.rectangle((x - 1, y - 2, x, y), fill=A(GLASS_DK))
        c.ld.rectangle((x - 1, y - 2, x, y), fill=A(LIT))
    drum(c, LU, LV, h, h + 2, 0.32, NAVY, ao=False)
    drum(c, LU, LV, h + 2, h + 10, 0.18, (255, 236, 150), shader=rib_shader(6, lo=0.7, hi=1.0), ao=False)
    x, y = c.P(LU, LV, h + 6)
    c.ld.ellipse((x - 5, y - 5, x + 5, y + 4), fill=A(LIT))
    x, y = c.P(LU, LV, h + 10)
    c.d.polygon([(x - 5, y), (x, y - 6), (x + 5, y)], fill=A(NAVY))
    c.d.line([(x - 5, y), (x, y - 6)], fill=A(shade(NAVY, 1.6)))
    blen = 18 + 6 * tier
    lx, ly = c.P(LU, LV, h + 6)
    beam = [(lx + 3, ly - 2), (lx + 3 + blen, ly - 7), (lx + 3 + blen, ly + 4), (lx + 3, ly + 2)]
    c.d.polygon(beam, fill=(255, 244, 190, 90))
    c.ld.polygon(beam, fill=(255, 230, 150, 160))
    if tier >= 3:  # the query-glass sign
        mx, my = c.P(2.6, 2.7, 0)
        c.d.line([(mx, my), (mx, my - 12)], fill=A(WOOD_D))
        c.d.ellipse((mx - 5, my - 22, mx + 5, my - 12), outline=A(col), width=2)
        c.d.ellipse((mx - 3, my - 20, mx + 3, my - 14), fill=A(GLASS_L))
        c.d.line([(mx + 4, my - 13), (mx + 8, my - 9)], fill=A(col), width=2)
    if tier >= 4:
        c.ld.polygon([(lx - 3, ly - 2), (lx - 3 - blen // 2, ly - 6), (lx - 3 - blen // 2, ly + 3), (lx - 3, ly + 2)], fill=(255, 230, 150, 130))
    return c


def tw_athena(tier, k):
    """A great lighthouse with a temple top: a square stone base, a round shaft (from tier 3), a ring colonnade
    round a lit lantern under a dome, a beam at tier 4 (the query temple)."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=40)
    marble = (226, 222, 210)
    ground_shadow(c, 0.25, 0.25, 1.45, 1.45)
    prism(c, 0.2, 0.2, 1.5, 1.5, 0, 6, STONE, R=louvres(2, 0.9))  # steps
    base_top = {2: top_z - 18, 3: 52, 4: 64}[tier]
    pil = lambda i, n, z, h, b, s: ((shade(b, 1.1), None) if i % 6 == 0 else (shade(b, 0.86), None) if i % 6 == 5 else None)
    prism(c, 0.3, 0.3, 1.4, 1.4, 6, base_top, marble, L=combine(top_band(3, (122, 161, 22)), punched(k, bay=6, floor=10, ww=2, wh=5, p=0.5), pil),
          R=combine(top_band(3, (122, 161, 22)), punched(k + "r", bay=6, floor=10, ww=2, wh=5, p=0.5), pil), ao=False)
    z = base_top
    if tier >= 3:  # the round shaft
        z1 = top_z - 18
        drum(c, CU, CV, z, z1, 0.42, marble, r1=0.34, shader=ribbon_shader(k + "d", floor=12, win=4, p=0.5, glass_col=GLASS_L), ao=False)
        z = z1
    # the colonnade: a ring of columns round a lit lantern
    drum(c, CU, CV, z, z + 2, 0.46, marble, ao=False)
    z += 2
    col_h = 14

    def columns(th, zz, h, b):
        ph = ((th + math.pi / 2) / math.pi * 7) % 1
        if 0.3 < ph < 0.75:
            return (255, 222, 140), LIT
        return None
    drum(c, CU, CV, z, z + col_h, 0.42, marble, shader=columns, cap=False, ao=False)
    drum(c, CU, CV, z + col_h, z + col_h + 3, 0.46, marble, shader=rib_shader(1, hoops=(1,), hoop=0.85), ao=False)
    z += col_h + 3
    # the dome
    drum(c, CU, CV, z, z + 10, 0.4, (122, 161, 22), profile=lambda t: 0.4 * math.sqrt(max(0.0, 1 - t * t)) + 0.02, cap=False, ao=False)
    z += 10
    if tier >= 4:  # the beam
        x, y = c.P(CU, CV, z - 18)
        beam = [(x + 10, y - 2), (x + 40, y - 9), (x + 40, y + 5), (x + 10, y + 2)]
        c.ld.polygon(beam, fill=(255, 230, 150, 150))
    tip(c, CU, CV, z, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Lake Formation ────────────────────────────────────────────────────────────────────────────────────────────────

def lm_lakeformation(fw, fh, tier, col, key):
    """Lake Formation Gate: a stone gatehouse over the canal where it enters the lake, its portcullis (permissions)
    down over the water, battlemented walls either side; a ledger lectern from tier 2, turrets from 3, a flag at 4."""
    c = Kit(fw, fh, 76)
    stone = (190, 182, 168)
    c.poly([(1.05, 0.0, 0), (1.95, 0.0, 0), (1.95, 3.0, 0), (1.05, 3.0, 0)], shade(WATER, 0.92))
    for kk in range(7):
        x, y = c.P(1.2 + hv(key, "w", kk) * 0.6, 0.2 + kk * 0.4, 0)
        c.d.line([(x, y), (x + 2, y)], fill=A(shade(WATER, 1.3)))
    prism(c, 0.85, 0.0, 1.05, 3.0, 0, 2, stone, rim=0)
    prism(c, 1.95, 0.0, 2.15, 3.0, 0, 2, stone, rim=0)
    h = 22 + 4 * tier
    masonry_ = combine(masonry(5, 10, 0.9))  # solid stone in big, quiet courses (alone, masonry paints only the joints)

    def wall(u0, u1):
        ground_shadow(c, u0, 1.2, u1, 1.8)
        prism(c, u0, 1.2, u1, 1.8, 0, h - 6, stone, L=masonry_, R=masonry_, rim=0)
        for kk in range(int((u1 - u0) / 0.42) + 1):
            a = u0 + 0.06 + kk * 0.42
            if a + 0.2 <= u1:
                prism(c, a, 1.2, a + 0.2, 1.8, h - 6, h - 3, stone, rim=0, ao=False)
    wall(0.0, 0.85)
    if tier >= 3:
        u0 = 0.0
        prism(c, u0, 1.15, u0 + 0.6, 1.85, 0, h + 6, shade(stone, 0.95), L=combine(punched(key + "t", bay=9, floor=12, ww=2, wh=4, p=0.7, lo=h - 14), masonry_), R=masonry_)
        c.pyramid(u0 - 0.05, 1.1, u0 + 0.65, 1.9, h + 6, 9, col)
    # the gatehouse over the canal
    prism(c, 0.85, 1.1, 2.15, 1.9, 12, h, shade(stone, 1.04), L=combine(top_band(3, col), punched(key, bay=8, floor=h, ww=3, wh=5, p=0.7, lo=5), masonry_), R=combine(top_band(3, col), masonry_), ao=False)
    for u in (0.85, 1.95):
        prism(c, u, 1.1, u + 0.2, 1.9, 0, 12, stone, L=masonry_, R=masonry_, roof=False)
    for kk in range(5):  # the portcullis
        u = 1.12 + kk * 0.18
        face(c, "L", 1.9, u, u + 0.04, 3 + (tier >= 2) * 3, 12, NAVY_D, ao=False, edge=False)
    face(c, "L", 1.9, 1.05, 1.95, 9, 10, NAVY_D, ao=False, edge=False)
    x, y = c.P(1.5, 1.9, h + 1)
    c.d.polygon([(x - 5, y - 8), (x + 5, y - 8), (x + 5, y - 3), (x, y + 1), (x - 5, y - 3)], fill=A(col))
    c.d.line([(x - 3, y - 5), (x + 3, y - 5)], fill=A(WATER))
    wall(2.15, 3.0)
    if tier >= 3:
        u0 = 2.4
        prism(c, u0, 1.15, u0 + 0.6, 1.85, 0, h + 6, shade(stone, 0.95), L=combine(punched(key + "t2", bay=9, floor=12, ww=2, wh=4, p=0.7, lo=h - 14), masonry_), R=masonry_)
        c.pyramid(u0 - 0.05, 1.1, u0 + 0.65, 1.9, h + 6, 9, col)
    if tier >= 2:  # the ledger lectern at the gate
        prism(c, 2.35, 2.35, 2.62, 2.62, 0, 7, WOOD, rim=0)
        x, y = c.P(2.48, 2.48, 7)
        c.d.rectangle((x - 2, y - 1, x + 2, y), fill=A(WHITE))
    if tier >= 4:
        x, y = c.P(1.5, 1.5, h)
        c.d.line([(x, y), (x, y - 14)], fill=A(STEEL_D))
        c.d.polygon([(x + 1, y - 14), (x + 8, y - 11), (x + 1, y - 8)], fill=A(col))
        for u in (0.4, 2.6):
            x, y = c.P(u, 1.8, 9)
            c.d.point([(x, y)], fill=A(LIT))
            c.ld.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A(LIT))
    return c


def tw_lakeformation(tier, k):
    """Terraces with water channels: a stepped tower whose every terrace has a channel along its edge spilling into
    the one below, planted terraces, and a gate pavilion on the top terrace."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=40)
    stone = (206, 198, 182)
    n = {2: 3, 3: 5, 4: 7}[tier]
    th = top_z // n
    ground_shadow(c, 0.15, 0.15, 1.55, 1.55)
    z = 0
    for i in range(n):
        half = 0.7 - i * (0.42 / max(1, n - 1))
        u0, v0, u1, v1 = CU - half, CV - half, CU + half, CV + half
        def fall(i_, nn, zz, hh, b, s, i=i):  # the channel spilling down the face, foam at its foot
            if nn * 0.42 <= i_ < nn * 0.58 and zz < hh - 1:
                if zz < 2:
                    return WHITE, None
                return shade(WATER, 1.25 if (zz + i_) % 4 else 1.0), None
            return None
        arches = punched(k + f"t{i}", bay=6, floor=th, ww=3, wh=max(3, th - 8), p=0.55, lo=1, glass_col=(66, 90, 110))
        L = combine(bands([(th - 2, th, (122, 161, 22))]), fall, arches, masonry(4, 6, 0.9))
        R = combine(bands([(th - 2, th, (122, 161, 22))]), punched(k + f"tr{i}", bay=6, floor=th, ww=3, wh=max(3, th - 8), p=0.55, lo=1, glass_col=(52, 72, 92)), masonry(4, 6, 0.9))
        prism(c, u0, v0, u1, v1, z, z + th, stone, L=L, R=R, roof=False, ao=z <= 1)
        # the terrace top: planted, with a channel of water round its edge
        c.poly([(u0, v0, z + th), (u1, v0, z + th), (u1, v1, z + th), (u0, v1, z + th)], (112, 176, 92))
        e = 0.1
        c.poly([(u0, v1 - e, z + th), (u1 - e, v1 - e, z + th), (u1 - e, v0, z + th), (u1, v0, z + th), (u1, v1, z + th), (u0, v1, z + th)], WATER)
        for kk in range(4):
            x, y = c.P(u0 + 0.1 + hv(k, i, kk) * (u1 - u0 - 0.3), v0 + 0.1 + hv(k, "v", i, kk) * (v1 - v0 - 0.3), z + th)
            c.d.ellipse((x - 2, y - 3, x + 2, y), fill=A(LEAF if kk % 2 else LEAF_D))
        z += th
    # the gate pavilion on the top terrace
    prism(c, CU - 0.2, CV - 0.2, CU + 0.2, CV + 0.2, z, z + 9, stone, L=lambda i, nn, zz, hh, b, s: ((NAVY_D, LIT) if nn * 0.3 < i < nn * 0.7 and zz < 6 else None), ao=False)
    c.pyramid(CU - 0.26, CV - 0.26, CU + 0.26, CV + 0.26, z + 9, 9, (122, 161, 22))
    tip(c, CU, CV, z + 15, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── AWS Backup ────────────────────────────────────────────────────────────────────────────────────────────────────

def vault_door(c, x, y, r, lit=False):
    """A round vault door in screen space centred at (x, y): a steel ring with bolts, a spoked wheel at its hub."""
    c.d.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(CHAR))
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(STEEL_M))
    c.d.arc((x - r, y - r, x + r, y + r), 140, 280, fill=A(STEEL))
    c.d.ellipse((x - r + 2, y - r + 2, x + r - 2, y + r - 2), outline=A(STEEL_D))
    for kk in range(8):
        a = kk * math.pi / 4
        c.d.point([(x + round(math.cos(a) * (r - 1)), y + round(math.sin(a) * (r - 1)))], fill=A(CHAR))
    w = max(2, r // 2)
    for kk in range(3):
        a = kk * math.pi / 3 + 0.3
        dx, dy = round(math.cos(a) * w), round(math.sin(a) * w)
        c.d.line([(x - dx, y - dy), (x + dx, y + dy)], fill=A(STEEL_D))
    c.d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=A(ORANGE))
    if lit:
        c.ld.ellipse((x - 1, y - 1, x + 1, y + 1), fill=A(ORANGE))


def camera(c, u, v, h, facing=1, flash=False):
    """A snapshot camera on a pole: a small body with its lens turned toward the vault and a flash that fires at night."""
    x, y = c.P(u, v, 0)
    c.d.line([(x, y), (x, y - h)], fill=A(STEEL_D))
    bx, by = x, y - h
    c.d.rectangle((bx - 3, by - 4, bx + 3, by), fill=A(CHAR))
    c.d.line([(bx - 3, by - 4), (bx + 3, by - 4)], fill=A(STEEL_M))
    lx = bx + facing * 4
    c.d.ellipse((lx - 2, by - 4, lx + 1, by - 1), fill=A(NAVY_D), outline=A(STEEL))
    c.d.point([(bx - facing * 2, by - 5)], fill=A(WHITE))
    if flash:
        c.ld.ellipse((bx - facing * 2 - 3, by - 8, bx - facing * 2 + 3, by - 2), fill=A((214, 236, 255), 170))
        c.ld.point([(bx - facing * 2, by - 5)], fill=A(WHITE))


def lm_backup(fw, fh, tier, col, key):
    """Backup Vault: a grass-roofed concrete bunker with a round vault door and steel bands, snapshot cameras on
    poles watching it (one more each tier), an archive wing with tape racks from tier 3, a beacon at 4."""
    c = Kit(fw, fh, 66)
    if tier >= 3:  # the archive wing on the right: racks of tapes through slot windows
        u0, v0, u1, v1 = 2.05, 0.35, 2.85, 1.3
        ground_shadow(c, u0, v0, u1, v1)
        racks = combine(top_band(2, col), lambda i, n, z, hh, b, s: ((shade(NAVY, 1.0 if s == "L" else 0.8), LED if hv(key, i, z) < 0.3 else None) if 4 <= z < hh - 4 and z % 4 != 0 and i % 6 not in (0, 5) else None), masonry(4, 8))
        prism(c, u0, v0, u1, v1, 0, 16, CON_M, L=racks, R=racks)
    u0, v0, u1, v1 = 0.95, 1.4, 2.8, 2.55
    h = 12 + 2 * tier
    ground_shadow(c, u0, v0, u1, v1, alpha=90)
    band = lambda i, n, z, hh, b, s: ((shade(STEEL_M, 1.0 if s == "L" else 0.8), None) if z in (3, 4, hh - 4) else None)
    prism(c, u0, v0, u1, v1, 0, h, (168, 170, 172), L=combine(band, masonry(5, 9, 0.88)), R=combine(band, masonry(5, 9, 0.88)), roof=False)
    # the grass berm on the roof
    top_poly = [(u0, v0, h), (u1, v0, h), (u1, v1, h), (u0, v1, h)]
    c.poly(top_poly, (96, 160, 80))
    c.poly([(u0 + 0.15, v0 + 0.15, h + 3), (u1 - 0.15, v0 + 0.15, h + 3), (u1 - 0.15, v1 - 0.15, h + 3), (u0 + 0.15, v1 - 0.15, h + 3)], (112, 178, 92))
    face(c, "L", v1 - 0.15, u0 + 0.15, u1 - 0.15, h, h + 3, (84, 150, 72), ao=False, edge=False)
    face(c, "R", u1 - 0.15, v0 + 0.15, v1 - 0.15, h, h + 3, (84, 150, 72), ao=False, edge=False)
    # vents on the berm
    for u in (u0 + 0.5, u1 - 0.55):
        drum(c, u, (v0 + v1) / 2, h + 3, h + 8, 0.07, STEEL_M, capcol=CHAR, ao=False)
    # the vault door, set in a deep frame on the street face
    mu = (u0 + u1) / 2 - 0.1
    face(c, "L", v1, mu - 0.42, mu + 0.42, 0, h - 1, CHAR, ao=False)
    x, y = c.P(mu, v1, (h - 1) / 2)
    vault_door(c, x, y, min(8, (h - 2) // 2), lit=True)
    # steps of the apron and a small sign
    prism(c, mu - 0.45, v1, mu + 0.45, v1 + 0.16, 0, 1, STONE, rim=0, ao=False)
    face(c, "L", v1, u1 - 0.45, u1 - 0.1, h - 7, h - 3, col, ao=False, edge=False)
    # snapshot cameras round the vault, lenses toward it
    poles = [(0.45, 2.85, 1), (2.95, 2.85, -1), (0.45, 1.25, 1), (2.95, 1.6, -1)]
    for u, v, f in poles[:tier]:
        camera(c, u, v, 18 + 2 * tier, facing=f, flash=tier >= 2)
    if tier >= 4:
        beacon(c, u1 - 0.3, v0 + 0.3, h + 4)
    return c


TAPES = [(44, 62, 92), (32, 140, 132), (122, 161, 22), (70, 76, 90), (60, 110, 190)]


def tw_backup(tier, k):
    """A stack of tape cartridges: flat cases laid crosswise and offset, each with a white label and two reel
    windows, rising to a clock crown (point-in-time recovery)."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=46)
    podium(c, 0.15, 0.25, 1.55, 1.45, 10, (150, 156, 162), k, accent=(122, 161, 22))
    th = 11
    z = 10
    i = 0
    while z + th <= top_z:
        cc = TAPES[int(hv(k, "t", i) * len(TAPES))]
        off = 0.22 * math.sin(i * 1.3)  # the stack drifts as the tapes are piled on
        if i % 2 == 0:
            u0, v0, u1, v1 = 0.15 + off, 0.62, 1.55 + off, 1.08
        else:
            u0, v0, u1, v1 = 0.62, 0.15 - off, 1.08, 1.55 - off

        def case(i_, n, zz, hh, b, s, cc=cc, ii=i):
            if zz in (0, hh - 1):
                return shade(cc, 0.62), None
            if hh - 4 <= zz < hh - 1 and n * 0.12 < i_ < n * 0.88:  # the label
                return shade(WHITE, 0.98 if s == "L" else 0.78), None
            for c0 in (0.3, 0.7):  # two reel windows
                ci = n * c0
                if abs(i_ - ci) < 4 and 2 <= zz < 6:
                    d = abs(i_ - ci)
                    if d < 1.2:
                        return shade(STEEL, 0.9), (LIT_COOL_ if hv(k, ii, c0) < 0.5 else None)
                    return shade(NAVY_D, 1.1 if d < 2.5 else 0.9), None
            return None

        long_side = "L" if i % 2 == 0 else "R"
        plain = combine(bands([(0, 1, shade(cc, 0.62))]), ribs(4, 1.06, 0.9))
        prism(c, u0, v0, u1, v1, z, z + th, cc, L=case if long_side == "L" else plain, R=case if long_side == "R" else plain, rim=0.02, ao=False)
        z += th
        i += 1
    # the clock crown
    cz = z
    prism(c, CU - 0.3, CV - 0.3, CU + 0.3, CV + 0.3, cz, cz + 18, (232, 228, 214), L=top_band(2, (122, 161, 22)), R=top_band(2, (122, 161, 22)), ao=False)
    x, y = c.P(CU, CV + 0.3, cz + 9)  # one clock face, on the street side
    c.d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=A(WHITE), outline=A(CHAR))
    c.ld.ellipse((x - 5, y - 5, x + 5, y + 5), fill=A((255, 236, 170), 110))
    for kk in range(12):
        a = kk * math.pi / 6
        c.d.point([(x + round(math.cos(a) * 4.5), y + round(math.sin(a) * 4.5))], fill=A(STEEL_D))
    c.d.line([(x, y), (x, y - 4)], fill=A(CHAR))
    c.d.line([(x, y), (x - 3, y + 1)], fill=A(CHAR))
    c.d.point([(x, y)], fill=A(RED))
    c.pyramid(CU - 0.34, CV - 0.34, CU + 0.34, CV + 0.34, cz + 18, 10, (122, 161, 22))
    tip(c, CU, CV, cz + 28, h=8 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


from services.kit import DARK_GLASS, LIT_COOL as LIT_COOL_  # noqa: E402


# ── Kinesis ───────────────────────────────────────────────────────────────────────────────────────────────────────

STREAM = [(80, 220, 230), (60, 170, 250), (122, 220, 120)]


def lm_kinesis(fw, fh, tier, col, key):
    """Kinesis Weir: a concrete flume carrying a stream down a stepped weir in real time, white water at each drop,
    a gauge house with its sluice wheel; a second flume from tier 3, lit gauges along the channel at 4."""
    c = Kit(fw, fh, 64)
    # the gauge house at the back right
    u0, v0, u1, v1 = 2.0, 0.35, 2.85, 1.2
    h = 14 + 2 * tier
    podium(c, u0, v0, u1, v1, h, (192, 120, 92), key, accent=col, R=combine(top_band(2, col), punched(key + "gr", bay=6, floor=h, ww=3, wh=4, lo=2), masonry(4, 6)))
    c.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, h, 7, (90, 96, 110))
    x, y = c.P(u1, (v0 + v1) / 2 + 0.2, h - 6)
    c.d.ellipse((x - 4, y - 4, x + 4, y + 4), outline=A(RED), width=2)
    c.d.line([(x - 4, y), (x + 4, y)], fill=A(RED))
    c.d.line([(x, y - 4), (x, y + 4)], fill=A(RED))

    def flume(v0, v1, steps, key2):
        n = len(steps)
        w = 2.9 / n
        for k_, z in enumerate(steps):
            a = 0.05 + k_ * w
            prism(c, a, v0 - 0.1, a + w, v1 + 0.1, 0, z, (178, 180, 184), L=combine(masonry(4, 10, 0.88)), R=masonry(4, 10, 0.88), roof=False)
            c.poly([(a, v0 - 0.1, z), (a + w, v0 - 0.1, z), (a + w, v0, z), (a, v0, z)], (196, 198, 202))
            c.poly([(a, v1, z), (a + w, v1, z), (a + w, v1 + 0.1, z), (a, v1 + 0.1, z)], (196, 198, 202))
            c.poly([(a, v0, z - 1), (a + w, v0, z - 1), (a + w, v1, z - 1), (a, v1, z - 1)], shade(WATER, 0.95))
            for s in range(4):  # streaks flowing along the channel
                uu = a + 0.08 + hv(key2, k_, s) * (w - 0.3)
                vv = v0 + 0.06 + (s / 4) * (v1 - v0 - 0.1)
                c.line((uu, vv, z - 1), (uu + 0.18, vv, z - 1), shade(WATER, 1.35))
            if k_ < n - 1:  # the drop: white water over the step's face
                nz = steps[k_ + 1]
                face(c, "R", a + w, v0, v1, nz - 1, z - 1, WHITE, lambda i, nn, zz, hh, b, s: ((shade(WATER, 1.5) if (i + zz) % 3 else WHITE), None), ao=False, edge=False)
            else:  # out into the lake
                face(c, "R", a + w, v0, v1, 0, z - 1, WHITE, lambda i, nn, zz, hh, b, s: ((shade(WATER, 1.5) if (i + zz) % 3 else WHITE), None), ao=False, edge=False)

    if tier >= 3:  # a second, parallel flume behind the house's front
        flume(1.35, 1.65, [10, 8, 6, 4], key + "f2")
    flume(2.1, 2.55, [12, 9, 6, 3][: 2 + min(tier, 2)] if tier < 3 else [14, 11, 8, 5, 2], key)
    # a pool the stream lands in, at the front right
    c.poly([(2.95, 2.0, 0), (3.0, 2.0, 0), (3.0, 2.95, 0), (2.95, 2.95, 0)], WATER)
    if tier >= 2:  # a footbridge across the flume
        prism(c, 1.2, 1.9, 1.4, 2.75, 15, 17, WOOD, L=ribs(3, 1.1, 0.85), rim=0, ao=False)
        for v in (1.92, 2.68):
            prism(c, 1.22, v, 1.27, v + 0.05, 0, 15, WOOD_D, rim=0, ao=False)
    if tier >= 4:  # lit gauges on posts along the channel
        for kk in range(4):
            x, y = c.P(0.4 + kk * 0.7, 2.75, 12)
            c.d.rectangle((x - 1, y - 3, x, y + 8), fill=A(STEEL_D))
            colk = STREAM[kk % 3]
            c.d.rectangle((x - 1, y - 4, x, y - 3), fill=A(colk))
            c.ld.ellipse((x - 3, y - 6, x + 2, y - 1), fill=A(colk, 180))
    return c


def tw_kinesis(tier, k):
    """Ribbons of flowing light: a slim dark shaft whose width breathes in a slow wave, wrapped in bands of cyan,
    blue and green light that ripple across its faces like a stream, a flared intake crown on top."""
    if tier < 2:
        return None
    top_z = H[tier]
    c = canvas(tier, extra=40)
    drum_shadow(c, CU, CV, 0.55)
    drum(c, CU, CV, 0, 8, 0.55, STONE, shader=rib_shader(14, hoops=(6,)))

    def ribbon(i, n, z, hh, b, s):
        for j, colj in enumerate(STREAM):
            w = (z + 5 * math.sin(i / 5.0 + j * 2.1 + (0 if s == "L" else 1.3))) % 22
            if j * 7 <= w < j * 7 + 2:
                return shade(colj, 1.0 if s == "L" else 0.8), colj
        return None

    body = combine(ribbon, glass(k, bay=5, floor=6, p=0.12, frame=(64, 74, 92), palette=DARK_GLASS))
    step = 2
    for z in range(8, top_z, step):
        hw = 0.4 + 0.16 * math.sin((z - 8) / 20.0)
        prism(c, CU - hw, CV - hw, CU + hw, CV + hw, z, min(top_z, z + step), (80, 90, 110), L=body, R=body, roof=False, ao=False, zref=8, href=top_z - 8)
    # the flared intake crown
    for kk in range(5):
        hw = 0.3 + 0.09 * kk
        prism(c, CU - hw, CV - hw, CU + hw, CV + hw, top_z + kk * 2, top_z + kk * 2 + 2, (122, 161, 22), roof=kk == 4, ao=False)
    ellipse(c, CU, CV, top_z + 10, 0.42, shade(STREAM[0], 0.8), light=STREAM[0])
    top_z += 2
    tip(c, CU, CV, top_z + 8, h=12 + 4 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c
