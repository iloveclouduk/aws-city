"""
Security Keep (iam cognito kms shield guardduty cloudwatch securityagent secretsmanager inspector securityhub macie): front buildings lm_<id> and towers tw_<id>
(see services/__init__.py). Civic, never military: gatehouses, a passport office, a vault, a wall that takes the
storm, a lookout, a clocktower observatory, a test range, a locksmith's, an inspection office, a dispatch centre
and a paper sorting house (no weapons, no wire, no flags).

Towers: IAM a slim stone shaft crowned by a keyhole; Cognito an ID-badge slab with a lanyard loop; KMS a riveted vault
block with a round vault door and a gold key on the roof; Shield a set-back tower with a crest under a glass dome;
GuardDuty a thin stem under an overhanging lookout cabin with an eye and a searchlight; CloudWatch a clocktower with a
chart screen, a belfry and a spire; Security Agent a round range tower with a bullseye antenna; Secrets Manager a
slim cryptex of numbered rings under a combination dial; Inspector a slim shaft with scan lines under a great
magnifying glass; Security Hub a slim tower ringed by green/amber/red signal lamps with a broad lamp-rimmed ring deck
and a lantern; Macie a sheet of paper on edge with flagged words, a scanner bar and a scanner head.

Decals on walls (keyholes, crests, clock faces, the eye) are painted through face shaders in face space, so they lie
on the wall in the isometric view and take its side light.
"""
import math

from generate_tiles import NAVY, NAVY_D, ORANGE, WHITE, WOOD, WOOD_D, shade  # noqa: F401
from services.kit import (CHAR, CON_D, CON_L, CON_M, GLASS_DK, GLASS_L, LED, LIT, LIT_COOL, RED, SIDE, STEEL,  # noqa: F401
                          STEEL_D, STEEL_M, STONE, A, Kit, beacon, bands, combine, dish, drum, drum_shadow, ellipse, face,
                          glass, ground_shadow, hv, lattice, leds, louvres, masonry, plant, podium, prism, punched,
                          rib_shader, ribbon_shader, ribs, screen, solid, tip, top_band)
from services.compute import CU, CV, H, canvas  # noqa: F401

SEC = (221, 52, 76)  # the district's red (shared/world.json security colour)
GOLD = (250, 206, 60)
GOLD_D = (196, 150, 40)
KEEP = (198, 192, 184)  # the Keep's pale stone
KEEP_D = (150, 144, 138)
CREAM = (232, 226, 206)
VAULT = (118, 126, 140)
TEAL = (40, 170, 190)
WARM = (255, 236, 190)


# ── decals: shaders that paint a small picture on a wall, in face space ──────────────────────────────────────────

def decal(rows, pal, ci, z0, lit=None):
    """A pixel picture on a face: rows top first, chars keyed in pal ('.' passes), centred on column ci (a fraction
    of the face when float) with its bottom row at z0. lit: {char: rgb} for the night layer."""
    w = max(len(r) for r in rows)
    top_ = z0 + len(rows) - 1

    def g(i, n, z, h, base, side):
        c0 = (round(ci * n) if isinstance(ci, float) else ci) - w // 2
        j, r = i - c0, top_ - z
        if 0 <= r < len(rows) and 0 <= j < len(rows[r]):
            ch = rows[r][j]
            if ch != ".":
                return shade(pal[ch], SIDE[side]), (lit or {}).get(ch)
        return None
    return g


def clock_face(ci, cz, r, lit=True):
    """A clock dial on a wall: a navy rim, hour ticks, hands at ten past ten, a warm glow at night."""
    def g(i, n, z, h, base, side):
        dx, dz = i - round(ci * n), z - cz
        d = math.hypot(dx, dz)
        if d > r + 0.4:
            return None
        if d > r - 0.9:
            return shade(NAVY, SIDE[side] * 1.2), None
        if (dx == 0 and -1 <= dz <= r - 2) or (dz == 0 and -1 <= dx <= r - 3) or (dx == -dz and 0 < dx < r - 3):
            return NAVY_D, None
        if d > r - 2.1 and (dx == 0 or dz == 0):
            return shade(NAVY, 1.3), None
        return shade(WHITE, SIDE[side] * 1.05), (WARM if lit else None)
    return g


def vault_door(ci, cz, r):
    """A round vault door on a wall: a gold rim, a steel door, six spokes and a gold hub (the hub glows at night)."""
    def g(i, n, z, h, base, side):
        dx, dz = i - round(ci * n), z - cz
        d = math.hypot(dx, dz)
        if d > r + 0.4:
            return None
        if d > r - 1.2:
            return shade(GOLD, SIDE[side]), (GOLD if side == "L" else None)
        if d > r - 2.2:
            return shade(NAVY_D, 1.2), None
        if d < 1.6:
            return shade(GOLD, SIDE[side] * 1.1), GOLD
        if dx == 0 or dz == 0 or abs(abs(dx) - abs(dz)) < 0.5:
            return shade(STEEL_D, SIDE[side]), None
        return shade(STEEL if d < r * 0.55 else STEEL_M, SIDE[side]), None
    return g


KEY = ["GGG.......",
       "G.GGGGGGGG",
       "GGG....G.G"]
KEYHOLE = ["..GGG..",
           ".GKKKG.",
           "GKKKKKG",
           "GKKKKKG",
           ".GKKKG.",
           "..GKG..",
           ".GKKKG.",
           ".GKKKG.",
           "GKKKKKG",
           "GGGGGGG"]
CREST = ["GGGGGGGGGGG",
         "GRRRRRRRRRG",
         "GRWRRRRRWRG",
         "GRWWRRRWWRG",
         "GRRWWRWWRRG",
         "GRRRWWWRRRG",
         "GRRRRWRRRRG",
         "GRRRRRRRRRG",
         ".GRRRRRRRG.",
         ".GRRRRRRRG.",
         "..GRRRRRG..",
         "...GRRRG...",
         "....GGG...."]
CREST_PAL = {"G": GOLD, "R": SEC, "W": WHITE}
EYE = ["...WWWWW...",
       ".WWWBBBWWW.",
       "WWWBBNBBWWW",
       ".WWWBBBWWW.",
       "...WWWWW..."]
EYE_PAL = {"W": WHITE, "B": TEAL, "N": NAVY_D}
PASSPORT = ["NNNNNNN",
            "NNGGGNN",
            "NGNGNGN",
            "NGGGGGN",
            "NGNGNGN",
            "NNGGGNN",
            "NNNNNNN",
            "NGGGGGN",
            "NNNNNNN"]
CHECK = ["SSSSSSS",
         "SSSSSWS",
         "SSSSWSS",
         "SWSWSSS",
         "SSWSSSS",
         ".SSSSS.",
         "..SSS..",
         "...S..."]


def slits(key, every=8, p=0.6, lo=4):
    """Narrow lit slit windows in a stone wall, a column every few px."""
    def g(i, n, z, h, base, side):
        if z < lo or z > h - 6 or i < 2 or i > n - 3:
            return None
        if i % 5 == 2 and (z - lo) % every < every - 3:
            on = hv(key, side, i // 5, (z - lo) // every) < p
            return shade(GLASS_DK, 0.9 if side == "L" else 0.7), (LIT if on else None)
        return None
    return g


def keyhole_plate(c, x, y, lit=True):
    """IAM's crown: a keyhole-shaped navy plate edged in gold, its hole lit; (x, y) the bottom centre. Returns the
    plate's height in px."""
    # outline in gold (one px larger), then the plate
    for d_, col in ((c.d, GOLD_D), ):
        d_.ellipse((x - 9, y - 30, x + 8, y - 13), fill=A(col))
        d_.polygon([(x - 9, y), (x + 8, y), (x + 4, y - 18), (x - 5, y - 18)], fill=A(col))
    c.d.ellipse((x - 8, y - 29, x + 7, y - 14), fill=A(NAVY))
    c.d.polygon([(x - 8, y - 1), (x + 7, y - 1), (x + 3, y - 18), (x - 4, y - 18)], fill=A(NAVY))
    c.d.arc((x - 8, y - 29, x + 7, y - 14), 150, 260, fill=A(shade(NAVY, 1.7)))
    c.d.line([(x - 8, y - 1), (x - 4, y - 18)], fill=A(shade(NAVY, 1.7)))
    # the hole
    hole = GOLD
    c.d.ellipse((x - 3, y - 25, x + 2, y - 20), fill=A(hole))
    c.d.polygon([(x - 1, y - 21), (x, y - 21), (x + 2, y - 6), (x - 3, y - 6)], fill=A(hole))
    c.d.line([(x + 1, y - 21), (x + 2, y - 7)], fill=A(GOLD_D))
    if lit:
        c.ld.ellipse((x - 3, y - 25, x + 2, y - 20), fill=A(GOLD))
        c.ld.polygon([(x - 1, y - 21), (x, y - 21), (x + 2, y - 6), (x - 3, y - 6)], fill=A(GOLD))
        c.ld.ellipse((x - 6, y - 28, x + 5, y - 3), fill=A(GOLD, 60))
    return 30


def bullseye(c, x, y, r, col=SEC, glow=True):
    """A target face (screen-aligned): rings of red and white in a navy rim, a lit centre at night."""
    c.d.ellipse((x - r - 1, y - r - 2, x + r + 1, y + r + 2), fill=A(NAVY_D))
    for k, rr in enumerate(range(r, 0, -2)):
        c.d.ellipse((x - rr, y - rr - 1, x + rr, y + rr + 1), fill=A(col if k % 2 == 0 else WHITE))
    c.d.arc((x - r, y - r - 1, x + r, y + r + 1), 160, 250, fill=A(shade(col, 1.25)))
    c.d.rectangle((x - 1, y - 1, x, y), fill=A(NAVY_D))
    if glow:
        c.ld.rectangle((x - 1, y - 1, x, y), fill=A(RED))
        c.ld.ellipse((x - 3, y - 4, x + 3, y + 3), fill=A(RED, 110))


def lamp(c, u, v, h=14):
    x, y = c.P(u, v)
    c.d.line([(x, y), (x, y - h)], fill=A(NAVY))
    c.d.rectangle((x - 1, y - h - 3, x + 1, y - h), fill=A(LIT))
    c.ld.ellipse((x - 4, y - h - 6, x + 4, y - h + 3), fill=A(LIT, 150))


def post_sign(c, u, v, h, w, col, rows=None, pal=None):
    """A small sign on a post: a coloured plate with a navy rim, a glyph lit at night."""
    x, y = c.P(u, v)
    c.d.line([(x, y), (x, y - h)], fill=A(NAVY))
    c.d.rectangle((x - w - 1, y - h - 9, x + w, y - h), fill=A(NAVY_D))
    c.d.rectangle((x - w, y - h - 8, x + w - 1, y - h - 1), fill=A(col))
    if rows:
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != ".":
                    px = (x - len(row) // 2 + i, y - h - 7 + j)
                    c.d.point([px], fill=A(pal[ch]))
                    c.ld.point([px], fill=A(pal[ch]))


# ── IAM ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_iam(fw, fh, tier, col, key):
    """IAM Gatehouse: two stone gate towers with red caps and a lintel with the gold key over a gateway of badge
    turnstiles (more each tier); a badge sign from tier 2, a pass office with rooftop plant from 3, beacons and lamps
    at 4."""
    c = Kit(fw, fh, 70)
    # the paved approach through the gate
    c.poly([(1.0, 1.75, 0), (2.0, 1.75, 0), (2.0, 3.0, 0), (1.0, 3.0, 0)], shade(STONE, 0.95))
    for k in range(1, 6):
        c.line((1.0, 1.75 + k * 0.22, 0), (2.0, 1.75 + k * 0.22, 0), shade(STONE, 0.82))
    if tier >= 3:  # the pass office on the right, behind the gate
        u0, v0, u1, v1 = 2.0, 0.45, 2.8, 1.5
        h = 16 + 2 * tier
        ground_shadow(c, u0, v0, u1, v1)
        prism(c, u0, v0, u1, v1, 0, h, KEEP, L=combine(top_band(3, col), glass(key + "po", bay=4, floor=8, p=0.55, lo=2, hi=h - 3)),
              R=combine(top_band(3, col), punched(key + "por", bay=5, floor=8, ww=3, wh=4, p=0.5), masonry(4, 6, 0.9)))
        plant(c, u0 + 0.08, v0 + 0.08, u1 - 0.1, v1 - 0.35, h, key + "pp", n=2)
    ht = 20 + 4 * tier

    def gate_tower(u0, v0, kk):
        u1, v1 = u0 + 0.6, v0 + 0.62
        ground_shadow(c, u0, v0, u1, v1)
        wall = combine(top_band(3, col), slits(key + kk, every=9), masonry(4, 6, 0.88))
        prism(c, u0, v0, u1, v1, 0, ht, KEEP, L=wall, R=wall, roof=False)
        c.pyramid(u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, ht, 10 + tier, col)
        if tier >= 4:
            beacon(c, (u0 + u1) / 2, (v0 + v1) / 2, ht + 11 + tier)

    gate_tower(0.35, 1.9, "a")
    # badge turnstiles in the gateway
    n = [1, 2, 3, 3][tier - 1]
    for i in range(n):
        u = 1.12 + i * 0.3
        prism(c, u, 2.2, u + 0.1, 2.4, 0, 8, NAVY, rim=0)
        x, y = c.P(u + 0.05, 2.4, 8)
        c.put(x, y - 1, LED, LED)
        c.put(x - 1, y - 1, LED, LED)
        x0, y0 = c.P(u + 0.1, 2.3, 5)
        c.d.line([(x0, y0), (x0 + 5, y0 + 2)], fill=A(STEEL_M))
    # the lintel over the gateway, the gold key on its face
    gz = ht - 12
    prism(c, 0.95, 2.0, 2.05, 2.52, gz, ht - 3, KEEP, L=combine(top_band(2, col), decal(KEY, {"G": GOLD}, 0.5, 3, lit={"G": GOLD} if tier >= 2 else None), masonry(4, 6, 0.88)),
          R=combine(top_band(2, col), masonry(4, 6, 0.88)), ao=False)
    gate_tower(2.05, 1.9, "b")
    if tier >= 2:  # a badge sign at the approach
        post_sign(c, 2.75, 2.85, 12, 5, WHITE, [".SSS.", ".....", "NN.NN", "....."], {"S": col, "N": NAVY})
    if tier >= 4:
        for u in (0.85, 2.15):
            lamp(c, u, 2.85)
    return c


def tw_iam(tier, k):
    """The keyhole tower: a slim stone shaft with a red pilaster up its face holding a lit slot (the key's way in),
    punched windows either side, and a keyhole plate edged in gold standing on its crown."""
    if tier < 2:
        return None
    top_z = H[tier] - 4
    c = canvas(tier, extra=50)
    podium(c, 0.42, 0.42, 1.28, 1.28, 12, KEEP, k, accent=SEC)
    u0, v0, u1, v1 = 0.59, 0.59, 1.11, 1.11

    def pilaster(i, n, z, h, base, side):
        a, b = round(n * 0.38), round(n * 0.62)
        if a <= i < b and z < h - 3:
            if i == (a + b) // 2 and (z % 10) < 7 and 4 < z < h - 6:
                return GOLD, (GOLD if hv(k, z // 10) < 0.8 else None)
            return shade(SEC, SIDE[side] * (1.1 if i == a else 0.85 if i == b - 1 else 1.0)), None
        return None
    L = combine(top_band(3, SEC), pilaster, punched(k + "L", bay=4, floor=8, ww=2, wh=5, p=0.45), masonry(8, 12, 0.92))
    R = combine(top_band(3, SEC), punched(k + "R", bay=4, floor=8, ww=2, wh=5, p=0.45), masonry(8, 12, 0.92))
    prism(c, u0, v0, u1, v1, 12, top_z, KEEP, L=L, R=R, zref=12, href=top_z - 12)
    z = top_z
    if tier >= 3:  # a set-back gallery storey
        prism(c, u0 + 0.08, v0 + 0.08, u1 - 0.08, v1 - 0.08, z, z + 8, GLASS_DK, L=glass(k + "g", bay=3, floor=8, p=0.8), R=glass(k + "gr", bay=3, floor=8, p=0.8), ao=False)
        z += 8
    prism(c, CU - 0.18, CV - 0.18, CU + 0.18, CV + 0.18, z, z + 3, SEC, ao=False, rim=0)
    x, y = c.P(CU, CV, z + 3)
    ph = keyhole_plate(c, x, y)
    tip(c, CU, CV, z + 3 + ph, h=6 + 2 * (tier - 2), col=GOLD, beacon_col=RED if tier >= 4 else None)
    return c


# ── Cognito ───────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_cognito(fw, fh, tier, col, key):
    """Cognito Passport Office: a cream civic hall under a red gable, the passport sign on its gable end, a lit
    counter and door; queue posts with a red rope from tier 2, a records wing with an ID stamp from 3, lamps at 4."""
    c = Kit(fw, fh, 64)
    h = 14 + 3 * tier
    u0, v0, u1, v1 = 0.3, 1.75, 2.0, 2.7
    ground_shadow(c, u0, v0, u1, v1)
    win = punched(key + "h", bay=5, floor=9, ww=3, wh=5, p=0.55, lo=1)
    door = lambda i, n, z, hh, b, s: ((LIT, LIT) if n * 0.42 < i < n * 0.58 and z < 10 else (shade(NAVY_D, 1.2), None)) if n * 0.38 <= i <= n * 0.62 and z < 11 else None
    L = combine(top_band(2, col), door, win, solid())
    R = combine(decal(PASSPORT, {"N": NAVY, "G": GOLD}, 0.5, h - 12, lit={"G": GOLD}), top_band(2, col), win)
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=L, R=R, roof=False)
    c.gable(u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, h, 10, col)
    vm = (v0 + v1) / 2
    c.line((u0 - 0.06, vm, h + 10), (u1 + 0.06, vm, h + 10), shade(col, 1.3))
    m = (u0 + u1) / 2  # a red canopy over the door
    prism(c, m - 0.26, v1, m + 0.26, v1 + 0.16, 11, 13, col, ao=False, rim=0)
    prism(c, m - 0.24, v1, m + 0.24, v1 + 0.12, 0, 1, STONE, ao=False, rim=0)
    if tier >= 3:  # the records wing on the right with an ID stamp
        a0, b0, a1, b1 = 2.15, 1.0, 2.85, 2.3
        wh = h - 4
        ground_shadow(c, a0, b0, a1, b1)
        stamp = ["..RRRRR..", ".R.....R.", "R..R.R..R", "R..RRR..R", "R...R...R", ".R.....R.", "..RRRRR.."]
        prism(c, a0, b0, a1, b1, 0, wh, CREAM, L=combine(top_band(2, col), decal(stamp, {"R": col}, 0.5, wh - 12)),
              R=combine(top_band(2, col), punched(key + "w", bay=5, floor=9, ww=3, wh=5, p=0.5, lo=1)))
        plant(c, a0 + 0.08, b0 + 0.08, a1 - 0.1, b1 - 0.5, wh, key + "wp", n=1)
    if tier >= 2:  # queue posts and a red rope
        posts = 3 if tier < 4 else 4
        for i in range(posts):
            u = 0.45 + i * 0.32
            prism(c, u, 2.86, u + 0.06, 2.92, 0, 7, GOLD, rim=0)
            if i:
                a, b = c.P(u - 0.29, 2.89, 6), c.P(u, 2.89, 6)
                c.d.line([a, ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2 + 2), b], fill=A(col))
    if tier >= 4:
        lamp(c, 2.7, 2.75)
    return c


def tw_cognito(tier, k):
    """The ID-badge tower: a broad, thin slab turned to the street like a badge on a lanyard: a red header band, a
    photo window and name lines near the top of its face, a curtain wall below; a clip and a red lanyard loop on top."""
    if tier < 2:
        return None
    top_z = H[tier] - 6
    c = canvas(tier, extra=50)
    podium(c, 0.0, 0.58, 1.7, 1.12, 12, CREAM, k, accent=SEC)
    u0, v0, u1, v1 = 0.05, 0.72, 1.65, 0.98
    card = (238, 238, 242)

    def badge(i, n, z, h, base, side):
        if i < 1 or i >= n - 1 or z >= h - 3:
            return None
        if h - 13 <= z < h - 5:  # the header band, with a white strip of lettering
            if z == h - 9 and 4 <= i < n - 4 and i % 3:
                return shade(WHITE, SIDE[side]), WHITE
            return shade(SEC, SIDE[side]), None
        pz = h - 34
        if pz <= z < h - 16:  # the photo and the name lines
            if 2 <= i < 10:
                if i in (2, 9) or z in (pz, h - 17):
                    return shade(NAVY, 1.1), None
                hx, hz = i - 5.5, z - (h - 22)
                if hx * hx + hz * hz <= 5 or (z < h - 26 and abs(hx) <= 3.2 - (z - pz) * 0.05 and z >= pz + 1):
                    return shade(NAVY_D, 1.2), None
                return shade(GLASS_L, SIDE[side]), LIT_COOL
            if 12 <= i < n - 2 and z in (h - 19, h - 23, h - 27):
                return shade(NAVY, 1.15), None
            if 12 <= i < n - 6 and z == h - 31:
                return shade(SEC, SIDE[side]), None
            return None
        return None
    curtain = glass(k + "c", bay=4, floor=7, p=0.5, lo=1, hi=top_z - 12 - 40)
    L = combine(top_band(3, SEC), badge, curtain, solid())
    edge = lambda i, n, z, h, b, s: ((shade(SEC, SIDE[s]), None) if i in (0, n - 1) else None)
    R = combine(top_band(3, SEC), edge, punched(k + "r", bay=5, floor=7, ww=1, wh=4, p=0.5))
    prism(c, u0, v0, u1, v1, 12, top_z, card, L=L, R=R, zref=12, href=top_z - 12)
    z = top_z
    # the clip and the lanyard loop
    prism(c, CU - 0.2, CV - 0.08, CU + 0.2, CV + 0.08, z, z + 4, STEEL_M, ao=False, rim=0)
    x, y = c.P(CU, CV, z + 4)
    lh = 16 + 2 * (tier - 2)
    c.d.line([(x - 6, y), (x - 2, y - lh)], fill=A(SEC), width=2)
    c.d.line([(x + 5, y), (x + 1, y - lh)], fill=A(shade(SEC, 0.75)), width=2)
    c.d.line([(x - 6, y), (x - 2, y - lh)], fill=A(shade(SEC, 1.2)))
    tip(c, CU, CV, z + 4 + lh, h=7 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── KMS ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_kms(fw, fh, tier, col, key):
    """KMS Vault: a low riveted strongroom with a round vault door and the gold key over it; rooftop vents from
    tier 2, a barred window of gold bars and bollards from 3, a camera and beacons at 4."""
    c = Kit(fw, fh, 60)
    h = 16 + 3 * tier
    u0, v0, u1, v1 = 0.4, 1.7, 2.55, 2.65
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, 0, 2, STONE, rim=0)
    plates = combine(top_band(3, col), masonry(8, 14, 0.86))
    bars = None
    if tier >= 3:  # a barred window with gold bars behind
        def bars(i, n, z, hh, b, s):
            if n * 0.25 <= i < n * 0.75 and 4 <= z < 11:
                if i % 3 == 0 or z in (4, 10):
                    return shade(NAVY_D, 1.1), None
                return shade(GOLD, SIDE[s] * (1.0 if z % 3 else 0.8)), GOLD
            return None
    L = combine(vault_door(0.5, 9, 8 + (tier >= 2)), decal(KEY, {"G": GOLD}, 0.5, h - 6, lit={"G": GOLD}), plates)
    R = combine(bars, plates)
    prism(c, u0, v0, u1, v1, 2, h, VAULT, L=L, R=R, zref=0, href=h)
    if tier >= 2:  # vents on the roof
        for kk in range(2):
            u = u0 + 0.3 + kk * 0.6
            prism(c, u, v0 + 0.2, u + 0.3, v0 + 0.5, h, h + 4, CON_L, L=louvres(2), R=louvres(2), ao=False, rim=0)
    if tier >= 3:  # bollards in front
        for u in (0.55, 1.0, 1.95, 2.4):
            prism(c, u, 2.82, u + 0.08, 2.9, 0, 5, col, L=bands([(3, 4, WHITE)]), R=bands([(3, 4, WHITE)]), rim=0)
    if tier >= 4:  # a camera on the corner, beacons on the roof
        x, y = c.P(u1, v1, h - 2)
        c.d.rectangle((x, y - 2, x + 4, y), fill=A(WHITE))
        c.d.point([(x + 4, y - 1)], fill=A(RED))
        c.ld.point([(x + 4, y - 1)], fill=A(RED))
        for u in (u0 + 0.1, u1 - 0.1):
            beacon(c, u, v1 - 0.1, h + 1)
    return c


def tw_kms(tier, k):
    """The vault tower: a broad block of riveted steel plates with few, narrow lit slits, a round vault door with a
    gold rim high on its face, gold bands at each set of floors, and a great gold key standing on the roof."""
    if tier < 2:
        return None
    top_z = H[tier] - 16
    c = canvas(tier, extra=56)
    u0, v0, u1, v1 = 0.28, 0.28, 1.42, 1.42
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, 0, 6, STONE, rim=0)
    gold = lambda i, n, z, h, b, s: ((shade(GOLD, SIDE[s] * (1.08 if z % 30 == 1 else 0.9)), None) if z % 30 in (0, 1) and 6 < z < h - 6 else None)
    rivets = lambda i, n, z, h, b, s: ((shade(STEEL, SIDE[s]), None) if z % 10 == 5 and i % 6 == 3 else None)
    door = vault_door(0.5, top_z - 6 - 24, 8)
    L = combine(top_band(3, SEC), door, gold, slits(k + "L", every=10, p=0.5), rivets, masonry(10, 12, 0.88))
    R = combine(top_band(3, SEC), gold, slits(k + "R", every=10, p=0.5), rivets, masonry(10, 12, 0.88))
    prism(c, u0, v0, u1, v1, 6, top_z, VAULT, L=L, R=R, zref=6, href=top_z - 6)
    z = top_z
    plant(c, u0 + 0.1, v0 + 0.1, u1 - 0.2, v0 + 0.5, z, k + "p", n=2)
    # the gold key: a plinth, the shaft with its bit, the bow as a ring
    prism(c, CU - 0.2, CV - 0.2, CU + 0.2, CV + 0.2, z, z + 4, NAVY, ao=False)
    x, y = c.P(CU, CV, z + 4)
    sh = 16 + 2 * (tier - 2)
    c.d.rectangle((x - 2, y - sh, x + 1, y), fill=A(GOLD))
    c.d.line([(x + 1, y - sh), (x + 1, y)], fill=A(GOLD_D))
    c.d.line([(x - 2, y - sh), (x - 2, y)], fill=A(shade(GOLD, 1.12)))
    for (dy, w) in ((4, 5), (8, 3), (12, 4)):  # the bit
        c.d.rectangle((x + 2, y - dy - 2, x + 1 + w, y - dy), fill=A(GOLD))
        c.d.line([(x + 2, y - dy), (x + 1 + w, y - dy)], fill=A(GOLD_D))
    r = 6
    cy = y - sh - r + 1
    c.d.ellipse((x - r - 1, cy - r, x + r, cy + r), outline=A(GOLD_D), width=3)
    c.d.ellipse((x - r - 1, cy - r, x + r, cy + r), outline=A(GOLD), width=2)
    c.d.arc((x - r - 1, cy - r, x + r, cy + r), 150, 250, fill=A(shade(GOLD, 1.15)))
    c.ld.ellipse((x - r - 1, cy - r, x + r, cy + r), outline=A(GOLD, 200), width=2)
    tip(c, CU, CV, z + 4 + sh + 2 * r - 2, h=6 + 2 * (tier - 2), col=GOLD, beacon_col=RED if tier >= 4 else None)
    return c


# ── Shield ────────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_shield(fw, fh, tier, col, key):
    """Shield Wall: a long stone wall across the front of the lot with a red coping and the great crest on its face;
    end towers from tier 2; from tier 3 a filter gate (WAF) in the middle letting a green packet through while a red
    one is stopped, its rules board lit; lamps at 4."""
    c = Kit(fw, fh, 64)
    h = 16 + 3 * tier
    v0, v1 = 2.0, 2.45
    gate = tier >= 3
    wall = combine(top_band(3, col), masonry(4, 7, 0.86))
    segs = [(0.1, 1.15), (1.85, 2.9)] if gate else [(0.1, 2.9)]
    for a, b in segs:
        ground_shadow(c, a, v0, b, v1)
        prism(c, a, v0, b, v1, 0, h, KEEP, L=combine(decal(CREST, CREST_PAL, 0.72 if gate else 0.5, h - 18, lit={"G": GOLD}) if (a, b) == segs[0] else None, wall), R=wall)
    if gate:  # the filter gate: a grille the good packets pass through
        prism(c, 1.15, v0, 1.85, v1, h - 6, h, KEEP, L=wall, R=wall, ao=False)

        def grille(i, n, z, hh, b, s):
            if i % 4 == 0 or z % 6 == 0:
                return shade(NAVY, SIDE[s] * 1.2), None
            return None
        face(c, "L", v1 - 0.12, 1.15, 1.85, 0, h - 6, NAVY, grille, ao=False)
        prism(c, 1.25, 2.6, 1.42, 2.77, 0, 4, (80, 210, 120), rim=0)  # an allowed packet
        x, y = c.P(1.7, 2.7, 3)
        c.d.line([(x - 3, y - 3), (x + 3, y + 3)], fill=A(RED), width=2)  # a stopped one
        c.d.line([(x - 3, y + 3), (x + 3, y - 3)], fill=A(RED), width=2)
        # the rules board on the right segment
        face(c, "L", v1, 2.15, 2.65, h - 13, h - 5, NAVY_D, lambda i, n, z, hh, b, s: ((LED, LED) if 0 < i < n - 1 and z in (2, 5) and (i + z) % 4 else (shade(NAVY_D, 1.3), None) if i in (0, n - 1) or z in (0, hh - 1) else None), ao=False, edge=False)
    if tier >= 2:  # end towers
        for u in (0.0, 2.35):
            u1 = u + 0.65
            ground_shadow(c, u, v0 - 0.15, u1, v1 + 0.15)
            tw_ = combine(top_band(3, col), slits(key + str(u), every=8), masonry(4, 7, 0.86))
            prism(c, u, v0 - 0.15, u1, v1 + 0.15, 0, h + 12, KEEP, L=tw_, R=tw_)
            prism(c, u - 0.04, v0 - 0.19, u1 + 0.04, v1 + 0.19, h + 12, h + 15, col, ao=False)
    if tier >= 4:
        for u in (0.9, 2.1):
            lamp(c, u, 2.85)
    return c


def tw_shield(tier, k):
    """The crest tower: a broad glass base, a set-back stone upper tower with the red-and-gold crest high on its
    face, and a glass dome over the top (the shield over everything under it)."""
    if tier < 2:
        return None
    top_z = H[tier] - 4
    c = canvas(tier, extra=50)
    zb = round(top_z * 0.32)
    zm = round(top_z * 0.62)
    podium(c, 0.18, 0.18, 1.52, 1.52, 12, KEEP, k, accent=SEC)
    gl = combine(top_band(3, SEC), glass(k + "b", bay=5, floor=8, p=0.5))
    prism(c, 0.22, 0.22, 1.48, 1.48, 12, zb, GLASS_DK, L=gl, R=gl, zref=12, href=zb - 12)
    gm = combine(top_band(3, SEC), glass(k + "m", bay=4, floor=8, p=0.5))
    prism(c, 0.4, 0.4, 1.3, 1.3, zb, zm, GLASS_DK, L=gm, R=gm, ao=False, zref=zb, href=zm - zb)
    zb = zm
    u0, v0, u1, v1 = 0.55, 0.55, 1.15, 1.15
    up = top_z - zb
    L = combine(top_band(3, SEC), decal(CREST, CREST_PAL, 0.5, up - 22, lit={"G": GOLD, "W": WARM}), punched(k + "uL", bay=4, floor=8, ww=2, wh=5, p=0.5), masonry(8, 12, 0.92))
    R = combine(top_band(3, SEC), punched(k + "uR", bay=4, floor=8, ww=2, wh=5, p=0.5), masonry(8, 12, 0.92))
    prism(c, u0, v0, u1, v1, zb, top_z, KEEP, L=L, R=R, ao=False, zref=zb, href=up)
    # the dome: a glass hemisphere ribbed like a shield's mesh
    dh = 14
    prism(c, u0 + 0.02, v0 + 0.02, u1 - 0.02, v1 - 0.02, top_z, top_z + 2, SEC, ao=False, rim=0)

    def mesh(th, z, h, base):
        ph = ((th + math.pi / 2) / math.pi * 6) % 1
        if ph < 0.15 or z == h // 2:
            return shade(base, 1.18), (LIT_COOL if z % 3 == 0 else None)
        return None
    drum(c, CU, CV, top_z + 2, top_z + 2 + dh, 0.38, (130, 200, 228), profile=lambda t: 0.38 * math.sqrt(max(0.0, 1 - (t * 0.96) ** 2)),
         shader=mesh, gloss=True, ao=False, cap=False)
    tip(c, CU, CV, top_z + 2 + dh - 1, h=8 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── GuardDuty ─────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_guardduty(fw, fh, tier, col, key):
    """GuardDuty Lookout Lodge: a stone lodge under a red roof, the watchful eye on its gable, lit windows where the
    logs are read; a picket fence from tier 2, a radar dish on the roof from 3, a searchlight post and a lamp at 4."""
    c = Kit(fw, fh, 64)
    h = 12 + 3 * tier
    u0, v0, u1, v1 = 0.45, 1.75, 2.1, 2.55
    ground_shadow(c, u0, v0, u1, v1)
    win = punched(key + "l", bay=6, floor=10, ww=3, wh=5, p=0.7, lo=1)
    door = lambda i, n, z, hh, b, s: ((shade(NAVY_D, 1.2), None) if n * 0.15 <= i < n * 0.28 and z < 10 else None)
    prism(c, u0, v0, u1, v1, 0, h, KEEP, L=combine(top_band(2, col), door, win, masonry(4, 6, 0.88)),
          R=combine(decal(EYE, EYE_PAL, 0.5, h - 8, lit={"W": WARM, "B": TEAL}), top_band(2, col), masonry(4, 6, 0.88)), roof=False)
    c.gable(u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, h, 9, col)
    if tier >= 3:  # a radar dish on the ridge
        dish(c, 1.0, (v0 + v1) / 2, h + 9, r=5, col=WHITE, facing=1)
    if tier >= 2:  # picket fence along the front, a gap at the path
        for kk in range(11):
            u = 0.15 + 0.26 * kk
            if 1.0 < u < 1.6:
                continue
            prism(c, u, 2.82, u + 0.06, 2.88, 0, 7, WHITE, rim=0)
        for a, b in ((0.15, 1.0), (1.6, 2.85)):
            prism(c, a, 2.83, b, 2.87, 4, 5, shade(WHITE, 0.85), rim=0, ao=False)
    if tier >= 4:  # a searchlight post on the right
        prism(c, 2.45, 1.4, 2.55, 1.5, 0, 20, CHAR, rim=0)
        x, y = c.P(2.5, 1.45, 20)
        c.d.rectangle((x - 2, y - 4, x + 2, y), fill=A(GOLD))
        c.ld.polygon([(x, y - 2), (x + 30, y - 22), (x + 34, y - 8)], fill=A(WARM, 70))
        lamp(c, 2.75, 2.7)
    return c


def tw_guardduty(tier, k):
    """The lookout: a thin stone stem with lit slits and a gallery part-way up, under a broad glass lookout cabin
    that oversails it, the eye on its face and a searchlight on its corner (its beam sweeps only at night), a red
    pyramid roof."""
    if tier < 2:
        return None
    top_z = H[tier] - 4
    c = canvas(tier, extra=56)
    prism(c, 0.4, 0.4, 1.3, 1.3, 0, 10, KEEP_D, L=combine(top_band(2, SEC), masonry(4, 6, 0.86)), R=combine(masonry(4, 6, 0.86)))
    ground_shadow(c, 0.4, 0.4, 1.3, 1.3)
    u0, v0, u1, v1 = 0.65, 0.65, 1.05, 1.05
    stem = combine(slits(k, every=12, p=0.5), masonry(6, 8, 0.88))
    prism(c, u0, v0, u1, v1, 10, top_z, KEEP, L=stem, R=stem, zref=10, href=top_z - 10, ao=False)
    if tier >= 3:  # a gallery ring part-way up
        gz = round(top_z * 0.55)
        prism(c, u0 - 0.08, v0 - 0.08, u1 + 0.08, v1 + 0.08, gz, gz + 3, SEC, ao=False, rim=0)
    # the corbel and the cabin
    a0, b0, a1, b1 = 0.38, 0.38, 1.32, 1.32
    prism(c, a0 + 0.1, b0 + 0.1, a1 - 0.1, b1 - 0.1, top_z, top_z + 3, KEEP_D, ao=False)
    ch = 16
    panel = lambda i, n, z, hh, b, s: ((shade(NAVY, SIDE[s] * 1.2), None) if abs(i - n // 2) <= 6 and 4 <= z <= 12 else None)
    cab = combine(bands([(0, 2, SEC)]), top_band(2, SEC), decal(EYE, EYE_PAL, 0.5, 6, lit={"W": WARM, "B": TEAL}), panel,
                  glass(k + "cab", bay=4, floor=ch, p=0.6, lo=3, hi=ch - 2))
    cabr = combine(bands([(0, 2, SEC)]), top_band(2, SEC), glass(k + "cabr", bay=4, floor=ch, p=0.6, lo=3, hi=ch - 2))
    prism(c, a0, b0, a1, b1, top_z + 3, top_z + 3 + ch, GLASS_DK, L=cab, R=cabr, ao=False, roof=False)
    z = top_z + 3 + ch
    # the searchlight on the right corner, its beam on the lights layer only
    x, y = c.P(a1, b0 + 0.1, z - 4)
    c.d.rectangle((x - 1, y - 3, x + 3, y), fill=A(GOLD))
    c.d.point([(x + 3, y - 2)], fill=A(WHITE))
    c.ld.polygon([(x + 3, y - 2), (x + 40, y - 22), (x + 44, y - 4)], fill=A(WARM, 60))
    c.ld.rectangle((x - 1, y - 3, x + 3, y), fill=A(WARM))
    rh = 14
    c.pyramid(a0 - 0.06, b0 - 0.06, a1 + 0.06, b1 + 0.06, z, rh, SEC)
    tip(c, CU, CV, z + rh, h=8 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── CloudWatch ────────────────────────────────────────────────────────────────────────────────────────────────────

def lm_cloudwatch(fw, fh, tier, col, key):
    """Clocktower Observatory hall: a long hall with glowing graph screens along its front, an observatory dome on
    the right; a bar-chart screen on the side from tier 2, CloudTrail footprints and a log scroll from 3, a second
    dome telescope light at 4."""
    c = Kit(fw, fh, 64)
    # the observatory: a drum and a dome with its slit open, a telescope peeking out
    du, dv = 2.3, 1.15
    drum_shadow(c, du, dv, 0.45)
    drum(c, du, dv, 0, 12, 0.42, KEEP, shader=rib_shader(10, hoops=(10,)))
    drum(c, du, dv, 12, 24, 0.44, (222, 226, 232), profile=lambda t: 0.44 * math.sqrt(max(0.0, 1 - (t * 0.97) ** 2)), gloss=True,
         shader=lambda th, z, h, b: (shade(NAVY_D, 1.1), None) if -0.18 < th < 0.12 and z < h - 2 else None, ao=False, cap=False)
    x, y = c.P(du, dv, 20)
    c.d.line([(x, y), (x + 6, y - 6)], fill=A(STEEL_D), width=2)
    if tier >= 4:
        c.ld.ellipse((x + 4, y - 8, x + 8, y - 4), fill=A(LIT_COOL))
    h = 14 + 2 * tier
    u0, v0, u1, v1 = 0.3, 1.8, 2.7, 2.6
    ground_shadow(c, u0, v0, u1, v1)
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=combine(top_band(3, col), masonry(5, 8, 0.9)), R=combine(top_band(3, col), masonry(5, 8, 0.9)))
    nscr = 2 + (tier >= 2)
    for i in range(nscr):
        a = u0 + 0.2 + i * 0.75
        screen(c, "L", v1, a, a + 0.55, 3, 12, key + str(i), LED if i % 2 == 0 else ORANGE, kind="bars" if i != 1 else "ticker")
    if tier >= 2:
        screen(c, "R", u1, v0 + 0.15, v1 - 0.15, 3, 11, key + "r", LED, kind="bars")
    if tier >= 3:  # CloudTrail: footprints across the lawn and a log scroll on a post
        for kk in range(6):
            fx, fy = c.P(0.3 + kk * 0.4, 2.82 + (0.06 if kk % 2 else -0.04))
            c.d.rectangle((fx, fy - 1, fx + 1, fy), fill=A(NAVY))
        x, y = c.P(2.85, 2.82)
        c.d.line([(x, y), (x, y - 14)], fill=A(WOOD_D))
        c.d.rectangle((x - 5, y - 25, x + 5, y - 14), fill=A((246, 240, 222)))
        c.d.rectangle((x - 6, y - 26, x + 6, y - 25), fill=A(WOOD))
        c.d.rectangle((x - 6, y - 14, x + 6, y - 13), fill=A(WOOD))
        for kk in range(4):
            c.d.line([(x - 4, y - 23 + kk * 2), (x + 3 - int(hv(key, kk) * 4), y - 23 + kk * 2)], fill=A(NAVY))
    return c


def tw_cloudwatch(tier, k):
    """The clocktower: a cream stone shaft with tall windows and a chart screen near the top, a clock stage with a
    dial on both faces, an open belfry with its gold bell, and a navy spire."""
    if tier < 2:
        return None
    top_z = H[tier] - 26
    c = canvas(tier, extra=70)
    podium(c, 0.3, 0.3, 1.4, 1.4, 12, KEEP, k, accent=SEC)
    u0, v0, u1, v1 = 0.42, 0.42, 1.28, 1.28
    tall = punched(k + "t", bay=4, floor=12, ww=2, wh=8, p=0.45)
    L = combine(top_band(2, SEC), tall, masonry(6, 10, 0.9))
    prism(c, u0, v0, u1, v1, 12, top_z, CREAM, L=L, R=combine(top_band(2, SEC), punched(k + "r", bay=4, floor=12, ww=2, wh=8, p=0.45), masonry(6, 10, 0.9)), zref=12, href=top_z - 12)
    screen(c, "L", v1, u0 + 0.08, u1 - 0.08, top_z - 14, top_z - 4, k + "s", LED, kind="bars")
    # the clock stage
    a0, b0, a1, b1 = 0.34, 0.34, 1.36, 1.36
    sh = 18
    dial = clock_face(0.5, 9, 7)
    prism(c, a0, b0, a1, b1, top_z, top_z + sh, KEEP, L=combine(bands([(0, 2, SEC)]), top_band(2, SEC), dial), R=combine(bands([(0, 2, SEC)]), top_band(2, SEC), dial), ao=False)
    z = top_z + sh
    # the belfry: corner posts round a gold bell
    bh = 10
    for (pu, pv) in ((a0 + 0.08, b0 + 0.08), (a1 - 0.16, b0 + 0.08), (a0 + 0.08, b1 - 0.16)):
        prism(c, pu, pv, pu + 0.08, pv + 0.08, z, z + bh, KEEP, ao=False, rim=0)
    x, y = c.P(CU, CV, z + 2)
    c.d.polygon([(x - 4, y), (x + 3, y), (x + 2, y - 6), (x - 3, y - 6)], fill=A(GOLD))
    c.d.ellipse((x - 3, y - 9, x + 2, y - 4), fill=A(GOLD))
    c.d.line([(x + 2, y), (x + 1, y - 6)], fill=A(GOLD_D))
    if tier >= 3:
        c.ld.ellipse((x - 4, y - 9, x + 3, y + 1), fill=A(GOLD, 160))
    prism(c, a1 - 0.16, b1 - 0.16, a1 - 0.08, b1 - 0.08, z, z + bh, KEEP, ao=False, rim=0)
    prism(c, a0, b0, a1, b1, z + bh, z + bh + 2, SEC, ao=False, rim=0)
    z += bh + 2
    spire = 22 + 3 * (tier - 2)
    c.pyramid(a0 + 0.02, b0 + 0.02, a1 - 0.02, b1 - 0.02, z, spire, NAVY)
    tip(c, CU, CV, z + spire - 2, h=6 + 2 * (tier - 2), col=GOLD, beacon_col=RED if tier >= 4 else None)
    return c


# ── Security Agent ────────────────────────────────────────────────────────────────────────────────────────────────

def probe(c, u, v, z):
    """A friendly test probe: a little white rover with a red sensor eye and an antenna."""
    prism(c, u - 0.1, v - 0.08, u + 0.1, v + 0.08, z + 1, z + 6, WHITE, rim=0, ao=False)
    x, y = c.P(u, v + 0.08, z + 4)
    c.put(x, y, RED, RED)
    for du in (-0.07, 0.07):
        xw, yw = c.P(u + du, v + 0.08, z + 1)
        c.d.rectangle((xw - 1, yw - 1, xw, yw), fill=A(NAVY_D))
    xa, ya = c.P(u, v, z + 6)
    c.d.line([(xa, ya), (xa + 1, ya - 4)], fill=A(CON_D))


def lm_securityagent(fw, fh, tier, col, key):
    """Red Team Range: a testing lane down the right of the lot ending at a target wall, a squat red-banded range
    office at the front with the passed-check badge on its face; a dish on the office from tier 2; cones, a pop-up
    target and the test probe from 3; a scoreboard of passed checks at 4."""
    c = Kit(fw, fh, 64)
    lu0, lu1 = 2.05, 2.8
    c.poly([(lu0, 0.35, 0), (lu1, 0.35, 0), (lu1, 2.9, 0), (lu0, 2.9, 0)], CHAR)
    for kk in range(6):
        v = 0.6 + kk * 0.38
        c.poly([(2.41, v, 0), (2.44, v, 0), (2.44, v + 0.2, 0), (2.41, v + 0.2, 0)], WHITE)
    for kk in range(5):
        a = lu0 + kk * 0.15
        c.poly([(a, 2.65, 0), (a + 0.15, 2.65, 0), (a + 0.15, 2.75, 0), (a, 2.75, 0)], col if kk % 2 == 0 else WHITE)
    # the target wall at the far end of the lane
    th = 14 + 2 * tier
    prism(c, 1.98, 0.15, 2.88, 0.35, 0, th, KEEP, L=combine(top_band(2, col), masonry(4, 6, 0.88)), R=combine(masonry(4, 6, 0.88)))
    x, y = c.P(2.43, 0.35, th // 2 + 1)
    bullseye(c, x, y, 5 if tier < 3 else 6, col)
    if tier >= 3:  # cones down the lane, a pop-up target, the probe
        for v in (1.0, 1.6, 2.2):
            for u in (lu0 + 0.06, lu1 - 0.06):
                x, y = c.P(u, v, 0)
                c.d.polygon([(x - 2, y), (x + 2, y), (x, y - 5)], fill=A(ORANGE))
                c.d.point([(x, y - 2)], fill=A(WHITE))
        prism(c, 2.6, 1.25, 2.66, 1.31, 0, 8, WOOD_D, rim=0)
        x, y = c.P(2.63, 1.28, 12)
        c.d.rectangle((x - 4, y - 5, x + 4, y + 5), fill=A(WOOD))
        bullseye(c, x, y, 3, col, glow=False)
        probe(c, 2.3, 1.9, 0)
    # the range office
    h = 12 + 3 * tier
    u0, v0, u1, v1 = 0.25, 1.75, 1.8, 2.7
    ground_shadow(c, u0, v0, u1, v1)
    win = punched(key + "o", bay=6, floor=9, ww=3, wh=5, p=0.6, lo=1)
    door = lambda i, n, z, hh, b, s: ((shade(NAVY_D, 1.2), None) if n * 0.62 <= i < n * 0.76 and z < 10 else None)
    L = combine(bands([(h - 7, h - 4, col)]), decal(CHECK, {"S": col, "W": WHITE}, 0.3, 3, lit={"W": WHITE}), door, win, masonry(5, 8, 0.9))
    prism(c, u0, v0, u1, v1, 0, h, KEEP, L=L, R=combine(bands([(h - 7, h - 4, col)]), win, masonry(5, 8, 0.9)))
    if tier >= 2:
        dish(c, u0 + 0.4, v0 + 0.3, h, r=5, col=WHITE, facing=1)
    if tier >= 4:  # the scoreboard of passed checks on the roof
        for u in (0.95, 1.5):
            prism(c, u, v0 + 0.4, u + 0.05, v0 + 0.45, h, h + 6, CHAR, rim=0, ao=False)
        face(c, "L", v0 + 0.45, 0.9, 1.6, h + 6, h + 14, NAVY_D, lambda i, n, z, hh, b, s: ((LED, LED) if 1 < i < n - 2 and 2 <= z < hh - 2 and (i % 4 == 1 or (i % 4 == 2 and z % 2)) else None), ao=False, edge=False)
        lamp(c, 1.95, 2.85, h=16)
    return c


def tw_securityagent(tier, k):
    """The range tower: a round white shaft with ribbon windows and a red ring every few floors, a dark-glass control
    deck, a short lattice mast and a bullseye antenna facing the city, its centre lit red at night."""
    if tier < 2:
        return None
    top_z = H[tier] - 16
    c = canvas(tier, extra=60)
    podium(c, 0.15, 0.15, 1.55, 1.55, 10, KEEP, k, accent=SEC)
    ring = lambda th, z, h, b: (shade(SEC, tone_(th)), None) if z % 24 in (20, 21, 22) else None
    rib = ribbon_shader(k, floor=6, win=3, p=0.5, spandrel=(226, 228, 234))
    drum(c, CU, CV, 10, top_z, 0.6, (236, 238, 242), r1=0.34, shader=lambda th, z, h, b: ring(th, z, h, b) or rib(th, z, h, b), ao=False, capcol=SEC)
    z = top_z
    drum(c, CU, CV, z, z + 7, 0.42, GLASS_DK, shader=rib_shader(10, lo=0.7, hi=1.3), gloss=True, ao=False, capcol=SEC)
    z += 7
    mast = 6 + 2 * (tier - 2)
    lattice(c, CU, CV, z, z + mast, 3, 2, STEEL_M, step=4)
    r = 8 + (tier - 2)
    x, y = c.P(CU, CV, z + mast)
    bullseye(c, x, y - r - 1, r)
    tip(c, CU, CV, z + mast + 2 * r + 3, h=6 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


def tone_(th):
    """The side light round a drum at angle th (the kit's round shading, for a hand-painted band)."""
    from services.kit import _SF, _SR, tone
    return tone(math.cos(th) * _SF + math.sin(th) * _SR)


# ── Secrets Manager ───────────────────────────────────────────────────────────────────────────────────────────────

SILVER_KEY = ["SSS.......",
              "S.SSSSSSSS",
              "SSS....S.S"]
LAMPS = (LED, (255, 180, 40), RED)  # Security Hub's status lamps: passed, warning, failed


def combo_dial(c, x, y, r, lit=True):
    """A combination dial seen face on, (x, y) its centre: a steel rim with a red index notch, numbered ticks round a
    white face, a knurled knob in the middle (the face glows at night)."""
    c.d.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(NAVY_D))
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(STEEL_M))
    c.d.ellipse((x - r + 2, y - r + 2, x + r - 2, y + r - 2), fill=A(WHITE))
    for kk in range(12):
        a = kk * math.pi / 6
        rr = r - 3 if kk % 3 else r - 4
        c.d.line([(round(x + math.cos(a) * (r - 2)), round(y + math.sin(a) * (r - 2))), (round(x + math.cos(a) * rr), round(y + math.sin(a) * rr))], fill=A(NAVY))
    kr = max(2, r // 3)
    c.d.ellipse((x - kr, y - kr, x + kr, y + kr), fill=A(STEEL_D))
    c.d.ellipse((x - kr, y - kr, x + kr - 1, y + kr - 1), fill=A(STEEL))
    c.d.polygon([(x - 2, y - r - 2), (x + 1, y - r - 2), (x - 1, y - r + 1)], fill=A(SEC))
    c.d.arc((x - r, y - r, x + r, y + r), 150, 250, fill=A(WHITE))
    if lit:
        c.ld.ellipse((x - r + 2, y - r + 2, x + r - 2, y + r - 2), fill=A(WARM, 170))
        c.ld.ellipse((x - kr, y - kr, x + kr, y + kr), fill=CLEAR_)


CLEAR_ = (0, 0, 0, 0)


def rotate_sign(c, x, y, r, col):
    """A round sign with two arrows chasing each other round it (rotation), (x, y) its centre."""
    c.d.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(NAVY_D))
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(WHITE))
    c.d.arc((x - r + 2, y - r + 2, x + r - 2, y + r - 2), 200, 340, fill=A(col), width=2)
    c.d.arc((x - r + 2, y - r + 2, x + r - 2, y + r - 2), 20, 160, fill=A(col), width=2)
    c.d.polygon([(x + r - 4, y - 3), (x + r, y - 3), (x + r - 2, y)], fill=A(col))
    c.d.polygon([(x - r + 4, y + 3), (x - r, y + 3), (x - r + 2, y)], fill=A(col))


def lm_secretsmanager(fw, fh, tier, col, key):
    """Secrets Manager Locksmith: a narrow cream shop under a red-and-white striped awning, a big silver key hung
    from a bracket over the door and a window of keys on hooks; a round "rotation" sign of two chasing arrows on the
    roof from tier 2, a key-cutting bench outside at 3, a lit key cabinet wing and a lamp at 4."""
    c = Kit(fw, fh, 66)
    h = 14 + 3 * tier
    u0, v0, u1, v1 = 0.7, 1.7, 2.1, 2.55
    if tier >= 4:  # the key cabinet wing behind on the right
        a0, b0, a1, b1 = 2.1, 1.1, 2.75, 1.95
        ground_shadow(c, a0, b0, a1, b1)
        drawers = lambda i, n, z, hh, b, s: ((shade(GOLD, SIDE[s] * 0.9), GOLD) if z % 5 == 2 and i % 4 == 2 and 2 < z < hh - 4 else None)
        prism(c, a0, b0, a1, b1, 0, h - 4, CREAM, L=combine(top_band(2, col), drawers, masonry(4, 4, 0.9)), R=combine(top_band(2, col), drawers, masonry(4, 4, 0.9)))
    ground_shadow(c, u0, v0, u1, v1)

    def shopfront(i, n, z, hh, b, s):
        if s != "L" or z >= 12 or z < 1:
            return None
        if n * 0.62 <= i < n * 0.78:  # the door
            return ((LIT if 0 < z < 11 and i != round(n * 0.7) else shade(NAVY_D, 1.2)), (LIT if z < 11 else None))
        if n * 0.08 <= i < n * 0.55 and 2 <= z < 11:  # the window, keys on hooks
            if z in (8, 5) and i % 3 == 0:
                return shade(STEEL, 1.05), None
            if z in (7, 4) and i % 3 == 0:
                return shade(STEEL_M, 1.0), None
            return shade(GLASS_L, 0.95), (LIT if hv(key, i // 4) < 0.85 else None)
        return None
    L = combine(top_band(3, col), shopfront, punched(key + "u", bay=6, floor=8, ww=3, wh=4, p=0.5, lo=13), masonry(4, 6, 0.92))
    R = combine(top_band(3, col), punched(key + "r", bay=6, floor=8, ww=3, wh=4, p=0.5, lo=3), masonry(4, 6, 0.92))
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=L, R=R, roofcol=shade(col, 0.7))
    # the striped awning over the shopfront
    for kk in range(8):
        a = u0 + 0.05 + kk * (u1 - u0 - 0.1) / 8
        b = a + (u1 - u0 - 0.1) / 8
        c.poly([(a, v1, 13), (b, v1, 13), (b, v1 + 0.22, 10), (a, v1 + 0.22, 10)], col if kk % 2 == 0 else WHITE)
    # the hanging key on its bracket
    x, y = c.P(u1 - 0.05, v1 + 0.05, h - 3)
    c.d.line([(x, y), (x + 9, y + 4)], fill=A(NAVY_D))
    kx, ky = x + 6, y + 6
    c.d.line([(kx, ky - 3), (kx, ky)], fill=A(NAVY_D))
    c.d.ellipse((kx - 3, ky, kx + 3, ky + 6), outline=A(STEEL), width=2)
    c.d.rectangle((kx - 1, ky + 6, kx, ky + 15), fill=A(STEEL))
    c.d.line([(kx + 1, ky + 6), (kx + 1, ky + 15)], fill=A(STEEL_D))
    for dy in (11, 14):
        c.d.line([(kx + 1, ky + dy), (kx + 3, ky + dy)], fill=A(STEEL))
    if tier >= 2:  # the rotation sign on the roof
        x, y = c.P((u0 + u1) / 2, (v0 + v1) / 2, h)
        c.d.line([(x, y), (x, y - 6)], fill=A(NAVY_D))
        rotate_sign(c, x, y - 12, 6, col)
        c.ld.ellipse((x - 5, y - 17, x + 5, y - 7), fill=A(WARM, 120))
    if tier >= 3:  # the key-cutting bench with its wheel
        prism(c, 0.3, 2.55, 0.65, 2.8, 0, 6, WOOD, L=combine(bands([(4, 6, WOOD_D)])), rim=0)
        x, y = c.P(0.47, 2.67, 6)
        c.d.ellipse((x - 3, y - 6, x + 3, y), fill=A(STEEL_M), outline=A(STEEL_D))
        c.d.point([(x, y - 3)], fill=A(NAVY_D))
    if tier >= 4:
        lamp(c, 2.65, 2.75)
    return c


def tw_secretsmanager(tier, k):
    """The combination tower: a round shaft built like a cryptex, a stack of numbered rings (each turned a little
    from the last, as secrets are rotated) round a dark core, with red bands between them, under a great combination
    dial standing on the crown."""
    if tier < 2:
        return None
    top_z = H[tier] - 14
    c = canvas(tier, extra=60)
    drum_shadow(c, CU, CV, 0.5)
    drum(c, CU, CV, 0, 8, 0.5, KEEP, shader=rib_shader(14, hoops=(6,)))

    def ring(kk):
        off = hv(k, "r", kk) * math.pi

        def g(th, z, h, base):
            if z in (0, h - 1):
                return shade(base, 0.8), None
            ph = ((th + off) / (math.pi / 8)) % 1
            if 2 <= z <= h - 3 and ph < 0.14:
                return shade(NAVY, 1.1), None  # the engraved numbers' ticks
            if z == h // 2 and ph > 0.5 and hv(k, kk, int((th + off) * 3)) < 0.5:
                return shade(base, 1.0), LIT
            return None
        return g
    z = 8
    kk = 0
    rh = 12
    while z + rh <= top_z:
        drum(c, CU, CV, z, z + 3, 0.3, SEC, ao=False, cap=False)
        drum(c, CU, CV, z + 3, z + rh, 0.36, STEEL if kk % 2 else (206, 212, 222), shader=ring(kk), ao=False, cap=False)
        z += rh
        kk += 1
    drum(c, CU, CV, z, z + 3, 0.3, SEC, ao=False, capcol=shade(SEC, 0.8))
    z += 3
    # the dial on a plinth
    drum(c, CU, CV, z, z + 4, 0.2, NAVY, ao=False)
    r = 9 + (tier - 2)
    x, y = c.P(CU, CV, z + 4)
    c.d.rectangle((x - 2, y - 4, x + 1, y), fill=A(STEEL_D))
    combo_dial(c, x, y - 4 - r, r)
    tip(c, CU, CV, z + 4 + 2 * r + 4, h=6 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Inspector ─────────────────────────────────────────────────────────────────────────────────────────────────────

def magnifier(c, x, y, r, lit=True, handle=1):
    """A magnifying glass seen face on, (x, y) the lens centre: a thick rim, a pale lens with a glint, a handle
    leaning down to the right (handle 1) or left."""
    hx, hy = x + handle * round(r * 0.75), y + round(r * 0.75)
    c.d.line([(hx, hy), (hx + handle * (r - 1), hy + r - 1)], fill=A(NAVY_D), width=4)
    c.d.line([(hx, hy), (hx + handle * (r - 1), hy + r - 1)], fill=A(WOOD), width=2)
    c.d.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(NAVY_D))
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A(SEC))
    c.d.ellipse((x - r + 2, y - r + 2, x + r - 2, y + r - 2), fill=A((176, 222, 236)))
    c.d.arc((x - r + 3, y - r + 3, x + r - 3, y + r - 3), 190, 250, fill=A(WHITE))
    c.d.arc((x - r, y - r, x + r, y + r), 150, 250, fill=A(shade(SEC, 1.25)))
    if lit:
        c.ld.ellipse((x - r + 2, y - r + 2, x + r - 2, y + r - 2), fill=A((140, 230, 240), 160))


def lm_inspector(fw, fh, tier, col, key):
    """Inspector Inspection Office: a neat grey office with a big magnifying glass on its roof, a clipboard sign at
    the path and an inspection bay on the right where a crate stands under a scanning arch; a checklist board from
    tier 2, the arch's scan line from 3 (lit at night), a second crate and a lamp at 4."""
    c = Kit(fw, fh, 72)
    # the inspection bay: a scanning arch over a crate
    if tier >= 2:
        bu, bv = 2.45, 1.0
        c.poly([(bu - 0.35, bv - 0.5, 0), (bu + 0.35, bv - 0.5, 0), (bu + 0.35, bv + 0.6, 0), (bu - 0.35, bv + 0.6, 0)], CHAR)
        prism(c, bu - 0.32, bv - 0.08, bu - 0.24, bv + 0.02, 0, 20, STEEL_M, rim=0)
        prism(c, bu + 0.24, bv - 0.08, bu + 0.32, bv + 0.02, 0, 20, STEEL_M, rim=0)
        prism(c, bu - 0.32, bv - 0.08, bu + 0.32, bv + 0.02, 20, 23, col, rim=0, ao=False)
        prism(c, bu - 0.18, bv + 0.1, bu + 0.18, bv + 0.42, 0, 9, (206, 150, 86), L=combine(bands([(4, 5, shade((206, 150, 86), 0.7))])), R=combine(bands([(4, 5, shade((206, 150, 86), 0.7))])), rim=0)
        if tier >= 3:
            for u in [bu - 0.24 + 0.04 * kk for kk in range(13)]:
                x, y = c.P(u, bv + 0.02, 19)
                c.put(x, y, (110, 240, 230), (110, 240, 230))
            x0, y0 = c.P(bu - 0.24, bv + 0.02, 19)
            x1, y1 = c.P(bu + 0.24, bv + 0.02, 19)
            c.ld.polygon([(x0, y0), (x1, y1), (x1 + 3, y1 + 16), (x0 + 3, y0 + 16)], fill=A((110, 240, 230), 50))
        if tier >= 4:
            prism(c, bu - 0.15, bv + 0.45, bu + 0.15, bv + 0.7, 0, 7, (186, 132, 76), rim=0)
    h = 16 + 3 * tier
    u0, v0, u1, v1 = 0.45, 1.7, 2.0, 2.6
    ground_shadow(c, u0, v0, u1, v1)
    g = (186, 190, 198)
    win = punched(key, bay=6, floor=8, ww=4, wh=4, p=0.55, lo=3)
    door = lambda i, n, z, hh, b, s: (((LIT, LIT) if 0 < z < 9 and n * 0.42 < i < n * 0.58 else (shade(NAVY_D, 1.2), None)) if n * 0.4 <= i < n * 0.6 and z < 10 else None)
    L = combine(top_band(2, col), bands([(0, 2, CHAR)]), door, win)
    R = combine(top_band(2, col), bands([(0, 2, CHAR)]), punched(key + "r", bay=6, floor=8, ww=4, wh=4, p=0.55, lo=3))
    prism(c, u0, v0, u1, v1, 0, h, g, L=L, R=R, roofcol=shade(g, 0.86))
    prism(c, (u0 + u1) / 2 - 0.3, v1, (u0 + u1) / 2 + 0.3, v1 + 0.18, 10, 12, col, ao=False, rim=0)
    # the magnifying glass on the roof, on two struts
    x, y = c.P((u0 + u1) / 2 - 0.2, (v0 + v1) / 2, h)
    r = 7 + tier
    c.d.line([(x - 3, y), (x - 2, y - 6)], fill=A(STEEL_D))
    c.d.line([(x + 3, y), (x + 2, y - 6)], fill=A(STEEL_D))
    magnifier(c, x, y - 6 - r, r, handle=1)
    if tier >= 2:  # the checklist board on the right wall
        def board(i, n, z, hh, b, s):
            if not (n * 0.25 <= i < n * 0.75 and h - 12 <= z < h - 4):
                return None
            j, zz = i - round(n * 0.25), z - (h - 12)
            if zz in (0, 7) or j in (0, round(n * 0.5) - 1):
                return shade(NAVY_D, 1.2), None
            if zz in (2, 4, 6) and j in (2, 3):
                return LED, LED
            if zz in (2, 4, 6) and 5 <= j < round(n * 0.5) - 2:
                return shade(NAVY, 1.2), None
            return shade(WHITE, 0.8), None
        face(c, "R", u1, v0, v1, 0, h, g, board, ao=False, edge=False)
    # the clipboard sign at the path
    x, y = c.P(0.35, 2.85, 0)
    c.d.line([(x, y), (x, y - 8)], fill=A(NAVY))
    c.d.rectangle((x - 4, y - 18, x + 4, y - 8), fill=A(WOOD))
    c.d.rectangle((x - 3, y - 17, x + 3, y - 9), fill=A(WHITE))
    c.d.rectangle((x - 2, y - 19, x + 1, y - 17), fill=A(STEEL_D))
    for yy in (y - 15, y - 13, y - 11):
        c.d.line([(x - 2, yy), (x + 2, yy)], fill=A(NAVY))
    if tier >= 4:
        lamp(c, 2.2, 2.8)
    return c


def tw_inspector(tier, k):
    """The inspection tower: a slim pale shaft in three red-banded sections, a bright scan line sweeping across both
    faces in each (lit at night, a teal glow under it), and a great magnifying glass held up over its crown, looking
    out over the city."""
    if tier < 2:
        return None
    top_z = H[tier] - 30
    c = canvas(tier, extra=68)
    podium(c, 0.45, 0.45, 1.25, 1.25, 10, CREAM, k, accent=SEC)
    scan = (110, 240, 230)
    stages = [(0.3, 10), (0.3, round(top_z * 0.4)), (0.3, round(top_z * 0.72))]
    stages = [s for s in stages if s[1] < top_z - 12]
    for j, (hf, z0) in enumerate(stages):
        z1 = stages[j + 1][1] if j + 1 < len(stages) else top_z
        line_z = z1 - z0 - 8

        def scanline(i, n, z, h, b, s, lz=line_z):
            if z == lz:
                return shade(scan, SIDE[s] * 1.05), scan
            if z == lz - 1:
                return shade(scan, SIDE[s] * 0.7), (scan[0], scan[1], scan[2], 110)
            return None
        sh = combine(top_band(3, SEC), scanline, punched(k + str(j), bay=5, floor=8, ww=3, wh=4, p=0.5, lo=2, glass_col=(150, 196, 220)))
        prism(c, CU - hf, CV - hf, CU + hf, CV + hf, z0, z1, (226, 228, 232), L=sh, R=sh, zref=z0, href=z1 - z0, ao=False)
    z = top_z
    prism(c, CU - 0.2, CV - 0.2, CU + 0.2, CV + 0.2, z, z + 5, SEC, ao=False)
    z += 5
    x, y = c.P(CU, CV, z)
    r = 11 + 2 * (tier - 2)
    c.d.rectangle((x - 1, y - 6, x, y), fill=A(STEEL_D))
    magnifier(c, x, y - 6 - r, r, handle=-1)
    tip(c, CU, CV, z + 6 + 2 * r + 2, h=6 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Security Hub ──────────────────────────────────────────────────────────────────────────────────────────────────

def lm_securityhub(fw, fh, tier, col, key):
    """Security Hub Dispatch Centre: a broad low centre with a big status board on its roof edge (a grid of green,
    amber and red lamps, one per check), a lit control room behind glass, and the reports from every post (a row of
    pigeon mailboxes) by the door; a radio mast from tier 2, a second board wing at 3, signal lamps on posts at 4."""
    c = Kit(fw, fh, 70)
    h = 12 + 2 * tier
    u0, v0, u1, v1 = 0.35, 1.55, 2.7, 2.5
    ground_shadow(c, u0, v0, u1, v1)
    room = glass(key, bay=4, floor=h, p=0.8, lo=2, hi=h - 3)
    L = combine(top_band(2, col), bands([(0, 2, CHAR)]), room)
    R = combine(top_band(2, col), punched(key + "r", bay=6, floor=8, ww=3, wh=4, p=0.5, lo=2))
    prism(c, u0, v0, u1, v1, 0, h, KEEP, L=L, R=R, roofcol=shade(KEEP, 0.85))
    face(c, "L", v1, u0 + 0.2, u0 + 0.5, 0, 9, NAVY_D, lambda i, n, z, hh, b, s: ((LIT, LIT) if 0 < i < n - 1 and z < hh - 1 else None), ao=False)

    def board_face(seed, cols):
        def g(i, n, z, hh, b, s):
            if i == 0 or i == n - 1 or z == 0 or z == hh - 1:
                return shade(NAVY_D, 1.3), None
            if i % 3 == 1 and z % 3 == 1:
                w = hv(seed, i, z)
                lc = cols[0] if w < 0.62 else cols[1] if w < 0.86 else cols[2]
                return lc, lc
            return NAVY_D, None
        return g
    bw = 1.0 + 0.2 * tier
    ba = (u0 + u1) / 2 - bw / 2
    for u in (ba + 0.1, ba + bw - 0.15):
        prism(c, u, v1 - 0.12, u + 0.05, v1 - 0.07, h, h + 5, CHAR, rim=0, ao=False)
    face(c, "L", v1 - 0.07, ba, ba + bw, h + 3, h + 3 + 13, NAVY_D, board_face(key, LAMPS), ao=False, edge=False)
    if tier >= 3:  # a second board on the right end
        face(c, "R", u1 - 0.05, v0 + 0.15, v0 + 0.75, h + 2, h + 2 + 10, NAVY_D, board_face(key + "r", LAMPS), ao=False, edge=False)
    if tier >= 2:  # the radio mast at the back
        lattice(c, u0 + 0.3, v0 + 0.2, h, h + 22, 2, 1, STEEL_M, step=4)
        beacon(c, u0 + 0.3, v0 + 0.2, h + 23, RED, glow=2)
    # the mailboxes for reports by the door
    for kk in range(3):
        u = u0 + 0.65 + kk * 0.2
        prism(c, u, v1 + 0.05, u + 0.16, v1 + 0.2, 0, 8, SEC if kk != 1 else NAVY, L=combine(bands([(5, 6, shade(SEC, 0.6))])), rim=0)
    if tier >= 4:  # signal lamps on posts along the front
        for kk, lc in enumerate(LAMPS):
            x, y = c.P(1.7 + kk * 0.35, 2.82, 0)
            c.d.line([(x, y), (x, y - 12)], fill=A(NAVY))
            c.d.rectangle((x - 2, y - 16, x + 1, y - 12), fill=A(lc))
            c.ld.ellipse((x - 4, y - 18, x + 3, y - 10), fill=A(lc, 150))
    return c


def tw_securityhub(tier, k):
    """The signal tower: a slim round tower of pale stone with slit windows, rings of signal lamps (green, amber, red,
    one for each security check) round it, a great ring deck high up whose rim is one band of lamps, and a glass lantern on top whose lamps all show
    their colour at night, under a red cap."""
    if tier < 2:
        return None
    top_z = H[tier] - 18
    c = canvas(tier, extra=56)
    drum_shadow(c, CU, CV, 0.5)
    drum(c, CU, CV, 0, 10, 0.5, KEEP_D, shader=rib_shader(18, hoops=(8,)))

    def lamps(seed, z_ring):
        def g(th, z, h, base):
            if z in z_ring or z - 1 in z_ring:
                ph = ((th + math.pi / 2) / (math.pi / 7)) % 1
                if 0.2 < ph < 0.8:
                    w = hv(seed, z_ring.index(z if z in z_ring else z - 1), int((th + math.pi / 2) / (math.pi / 7)))
                    lc = LAMPS[0] if w < 0.6 else LAMPS[1] if w < 0.85 else LAMPS[2]
                    return lc, lc
                return shade(NAVY_D, 1.2), None
            if z - 2 in z_ring or z + 1 in z_ring:
                return shade(NAVY_D, 1.3), None
            if (z % 10) in (4, 5, 6) and ((th + math.pi / 2) / (math.pi / 9)) % 1 < 0.22:
                return shade(GLASS_DK, 0.9), (LIT if hv(seed, z // 10, int(th * 4)) < 0.5 else None)
            return None
        return g
    rings = list(range(24, top_z - 14, 26))
    drum(c, CU, CV, 10, top_z, 0.32, KEEP, shader=lamps(k, [z - 10 for z in rings]), ao=False, capcol=shade(KEEP, 0.9))
    for z in rings:  # a red band proud of the wall under each ring of lamps (no cap: the lamps stay in view)
        drum(c, CU, CV, z - 3, z - 1, 0.36, SEC, ao=False, cap=False)
    # the great ring: a broad deck round the shaft, its rim a band of signal lamps, struts under it
    zr = round(top_z * 0.7)
    rr = 0.84
    for kk in range(8):
        a = kk * math.pi / 4 + 0.39
        if math.cos(a) + math.sin(a) < 0:
            continue
        c.line((CU + math.cos(a) * 0.32, CV + math.sin(a) * 0.32, zr - 16), (CU + math.cos(a) * rr * 0.9, CV + math.sin(a) * rr * 0.9, zr), STEEL_D)

    def rim(th, zz, h, base):
        idx = int((th + math.pi / 2) / (math.pi / 9))
        if ((th + math.pi / 2) / (math.pi / 9)) % 1 < 0.25:
            return shade(NAVY_D, 1.2), None
        w = hv(k, "rim", idx)
        lc = LAMPS[0] if w < 0.6 else LAMPS[1] if w < 0.85 else LAMPS[2]
        return lc, lc
    drum(c, CU, CV, zr - 2, zr, rr, SEC, ao=False, cap=False)
    drum(c, CU, CV, zr, zr + 3, rr, NAVY_D, shader=rim, ao=False, capcol=(176, 172, 168))
    ellipse(c, CU, CV, zr + 3, 0.5, shade(KEEP, 0.95), rim=False)
    drum(c, CU, CV, zr + 3, top_z, 0.32, KEEP, shader=lamps(k + "u", [z - zr - 3 for z in rings if z > zr + 6]), ao=False, capcol=shade(KEEP, 0.9))
    z = top_z
    drum(c, CU, CV, z, z + 3, 0.4, SEC, ao=False)
    lan = 12 + (tier - 2) * 2

    def lantern(th, zz, h, base):
        ph = ((th + math.pi / 2) / (math.pi / 5)) % 1
        if ph < 0.18 or zz in (0, h - 1):
            return shade(NAVY, 1.1), None
        lc = LAMPS[int((th + math.pi / 2) / (math.pi / 5)) % 3]
        return shade(lc, 0.9 + 0.2 * (zz / h)), lc
    drum(c, CU, CV, z + 3, z + 3 + lan, 0.34, WHITE, shader=lantern, ao=False, cap=False)
    drum(c, CU, CV, z + 3 + lan, z + 6 + lan, 0.4, SEC, ao=False, capcol=shade(SEC, 0.8))
    c.pyramid(CU - 0.3, CV - 0.3, CU + 0.3, CV + 0.3, z + 6 + lan, 7, SEC)
    tip(c, CU, CV, z + 13 + lan, h=8 + 2 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c


# ── Macie ─────────────────────────────────────────────────────────────────────────────────────────────────────────

PAPER = (246, 242, 230)
PAPER_D = (222, 216, 200)


def doc_lines(key, flag=SEC, line=3, p=0.3, lo=2, hi=None, margin=2, every=0.12):
    """Lines of text on a page, a few words flagged in red (sensitive data found), the flags lit at night."""
    def g(i, n, z, h, base, side):
        top_ = h - 2 if hi is None else hi
        if z < lo or z >= top_ or i < margin or i >= n - margin or (z - lo) % line != 1:
            return None
        row = (z - lo) // line
        if i >= n - margin - int(hv(key, side, row, "e") * n * 0.35) or hv(key, side, row, i // 4) < 0.15:
            return None
        if hv(key, side, row, i // 6, "f") < every:
            return shade(flag, SIDE[side]), flag
        return shade(NAVY, 1.0 if side == "L" else 0.85), (LIT if hv(key, side, row) < p else None)
    return g


def lm_macie(fw, fh, tier, col, key):
    """Macie Sorting House: a cream hall with a saw-tooth roof of north lights where papers ride a belt out under a
    scanner arch; any paper the scanner flags (sensitive data) goes up a red chute into a red locked box. More
    papers each tier, a second belt at 3, a lamp at 4."""
    c = Kit(fw, fh, 68)
    h = 12 + 3 * tier
    u0, v0, u1, v1 = 0.4, 1.35, 2.0, 2.2
    ground_shadow(c, u0, v0, u1, v1)
    L = combine(top_band(2, col), bands([(0, 2, STONE)]), punched(key, bay=6, floor=8, ww=3, wh=4, p=0.6, lo=2), masonry(4, 8, 0.93))
    R = combine(top_band(2, col), bands([(0, 2, STONE)]), punched(key + "r", bay=6, floor=8, ww=3, wh=4, p=0.6, lo=2), masonry(4, 8, 0.93))
    prism(c, u0, v0, u1, v1, 0, h, CREAM, L=L, R=R, roof=False)
    # the saw-tooth roof: teeth along u, glazing facing back
    n = 4
    w = (u1 - u0) / n
    for kk in range(n):
        a = u0 + kk * w
        c.poly([(a, v1, h), (a + w, v1, h), (a + w, v1, h + 7)], shade(CREAM, 0.95))
        c.poly([(a + w, v0, h), (a + w, v1, h), (a + w, v1, h + 7), (a + w, v0, h + 7)], shade(GLASS_DK, 0.9))
        c.poly([(a, v0, h), (a, v1, h), (a + w, v1, h + 7), (a + w, v0, h + 7)], shade(col, 0.85))
        x, y = c.P(a + w, v1, h + 3)
        c.light(x - 1, y, LIT)
    # the belt out of the hall's front, papers on it, the scanner arch
    belt_v = 2.45
    lanes = [belt_v] + ([belt_v + 0.3] if tier >= 3 else [])
    for bv in lanes:
        prism(c, u0 + 0.1, bv - 0.08, 2.75, bv + 0.08, 0, 4, CHAR, L=combine(bands([(3, 4, STEEL_D)])), rim=0)
        for kk in range(2 + tier):
            u = u0 + 0.2 + kk * 0.42
            if u > 2.6:
                break
            c.poly([(u, bv - 0.06, 4), (u + 0.2, bv - 0.06, 4), (u + 0.2, bv + 0.06, 4), (u, bv + 0.06, 4)], PAPER)
            x, y = c.P(u + 0.1, bv, 4)
            c.d.point([(x - 1, y), (x + 1, y)], fill=A(SEC if hv(key, bv, kk) < 0.3 else NAVY))
    ax = 1.55
    for v in (belt_v - 0.14, lanes[-1] + 0.14):
        prism(c, ax, v - 0.03, ax + 0.06, v + 0.03, 0, 16, STEEL_M, rim=0)
    prism(c, ax, belt_v - 0.17, ax + 0.06, lanes[-1] + 0.17, 16, 19, col, rim=0, ao=False)
    x0, y0 = c.P(ax + 0.03, belt_v - 0.12, 15)
    x1, y1 = c.P(ax + 0.03, lanes[-1] + 0.12, 15)
    c.ld.polygon([(x0, y0), (x1, y1), (x1, y1 + 10), (x0, y0 + 10)], fill=A((110, 240, 230), 70))
    c.d.line([(x0, y0 + 1), (x1, y1 + 1)], fill=A((110, 240, 230)))
    c.light(x0, y0 + 1, (110, 240, 230))
    # the red chute up to the locked box on the right
    prism(c, 2.4, 1.6, 2.85, 2.05, 0, 11, SEC, L=combine(bands([(7, 8, shade(SEC, 0.6))])), R=combine(bands([(7, 8, shade(SEC, 0.6))])), roofcol=shade(SEC, 0.8))
    x, y = c.P(2.85, 1.82, 6)
    c.d.rectangle((x - 2, y - 3, x + 1, y + 1), fill=A(GOLD))
    c.light(x - 1, y - 1, GOLD)
    c.line((2.6, 2.4, 4), (2.6, 2.05, 9), STEEL_D, 2)
    if tier >= 4:
        lamp(c, 0.35, 2.8)
    return c


def tw_macie(tier, k):
    """The document tower: a tall, thin slab like a sheet of paper standing on edge, its face lined with text and a
    few words flagged in red, a page corner folded at the top; a scanner bar rides across its face (a teal beam lit
    at night) and a scanner head with a lens crowns it."""
    if tier < 2:
        return None
    top_z = H[tier] - 12
    c = canvas(tier, extra=52)
    podium(c, 0.2, 0.55, 1.5, 1.15, 10, KEEP, k, accent=SEC)
    u0, v0, u1, v1 = CU - 0.14, CV - 0.6, CU + 0.14, CV + 0.6
    sh_r = combine(top_band(2, PAPER_D), doc_lines(k, lo=4, line=4, hi=top_z - 10 - 8))
    sh_l = combine(top_band(2, PAPER_D), bands([(0, 4, PAPER_D)]))
    prism(c, u0, v0, u1, v1, 10, top_z, PAPER, L=sh_l, R=sh_r, zref=10, href=top_z - 10, ao=False)
    # the folded corner at the top front
    c.poly([(u1, v1 - 0.28, top_z), (u1, v1, top_z - 9), (u1, v1, top_z)], shade(PAPER_D, 0.62))
    c.poly([(u1 + 0.02, v1 - 0.28, top_z), (u1 + 0.02, v1 - 0.28, top_z - 9), (u1 + 0.02, v1, top_z - 9)], shade(PAPER, 0.84))
    # the scanner bar across the face, part-way down, its beam
    for j, zs in enumerate([round(top_z * 0.62)] + ([round(top_z * 0.32)] if tier >= 4 else [])):
        prism(c, u1, v0 - 0.08, u1 + 0.1, v1 + 0.08, zs, zs + 4, NAVY, R=combine(bands([(1, 3, SEC)])), rim=0, ao=False)
        xa, ya = c.P(u1 + 0.1, v0, zs)
        xb, yb = c.P(u1 + 0.1, v1, zs)
        c.ld.polygon([(xa, ya), (xb, yb), (xb, yb + 14), (xa, ya + 14)], fill=A((110, 240, 230), 70))
        c.d.line([(xa, ya + 1), (xb, yb + 1)], fill=A((110, 240, 230)))
        c.ld.line([(xa, ya + 1), (xb, yb + 1)], fill=A((110, 240, 230)))
    # the scanner head on top
    z = top_z
    prism(c, CU - 0.18, CV - 0.18, CU + 0.18, CV + 0.18, z, z + 8, NAVY, L=combine(top_band(2, SEC)), R=combine(top_band(2, SEC)), ao=False)
    x, y = c.P(CU + 0.18, CV, z + 4)
    c.d.rectangle((x - 2, y - 2, x + 1, y + 1), fill=A((110, 240, 230)))
    c.ld.rectangle((x - 2, y - 2, x + 1, y + 1), fill=A((110, 240, 230)))
    tip(c, CU, CV, z + 8, h=12 + 3 * (tier - 2), beacon_col=RED if tier >= 4 else None)
    return c
