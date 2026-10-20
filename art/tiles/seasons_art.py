"""
Seasons (plan round 3, Step 3): the props the city swaps by the real calendar and the Region's hemisphere, on top of
the game's seasonal tint. A swap is a sprite of the same canvas and anchor as the one it replaces, so the game only
changes a frame name (no extra draw calls): season:<season>:<sprite> replaces <sprite> in that season.

Swaps are derived from the finished originals (pixel recolours, deterministic), so they always line up with them:
  winter  snow caps on every top-facing leaf, roof and rim pixel, leaves frosted; snowy grass
            tree0 tree1 pine bush flowers tree:street:0 tree:street:1 deco:oak deco:pine deco:cherry deco:hedge
            forest2x2:temperate forest3x3:temperate hill3x3:temperate grass0 grass1 grass2 grassDark
  autumn  leaves turn red, orange and gold in clumps (evergreens keep their needles)
            tree0 tree1 bush tree:street:0 tree:street:1 deco:oak forest2x2:temperate forest3x3:temperate
  spring  blossom: pink and white flowers over fresh green
            tree0 tree1 bush tree:street:0 tree:street:1 deco:oak
  summer  tree1 becomes a palm in the same white planter, bush a hibiscus in flower
            tree1 bush

New seasonal props (placed by the game on free grass, sand or plaza tiles, inside the decor caps; no swap):
  season:winter:snow0..2   snow drift decals on a grass tile (flat, no outline)
  season:winter:snowman    a snowman with a scarf in AWS orange
  season:autumn:leaves0..1 fallen-leaf decals
  season:spring:petals     fallen blossom decal
  season:summer:umbrella0..1  a beach umbrella over a towel (orange / navy stripes), for sand and plazas

Called from generate_tiles.main as seasons_art.build(add) after the props, landscape, streets and build-mode art
(it reads their finished sprites from generate_tiles.SPRITES); seasons_art.preview writes .cache/art/seasons-preview.png.
"""
import colorsys

from PIL import Image

import generate_tiles as gt
from generate_tiles import A, CLEAR, GRASS, GRASS_D, NAVY, ORANGE, OUTLINE, WHITE, WOOD, Canvas, seeded, shade
from services.kit import Kit, drum_shadow

SNOW = (240, 246, 252)
SNOW_M = (214, 226, 240)
SNOW_D = (178, 196, 220)
AUTUMN = [[(150, 44, 34), (190, 64, 40), (222, 98, 34), (240, 140, 52)],
          [(176, 90, 30), (218, 128, 36), (240, 172, 52), (250, 212, 96)],
          [(160, 70, 32), (206, 104, 36), (234, 146, 44), (246, 188, 72)]]
BLOSSOM = [[(206, 104, 146), (236, 148, 184), (250, 194, 214), (255, 232, 240)],
           [(220, 150, 180), (246, 190, 212), (255, 222, 234), (255, 246, 250)]]

WINTER = ["tree0", "tree1", "pine", "bush", "flowers", "tree:street:0", "tree:street:1", "deco:oak", "deco:pine",
          "deco:cherry", "deco:hedge", "forest2x2:temperate", "forest3x3:temperate", "hill3x3:temperate"]
WINTER_GROUND = ["grass0", "grass1", "grass2", "grassDark"]
AUTUMN_SWAPS = ["tree0", "tree1", "bush", "tree:street:0", "tree:street:1", "deco:oak", "forest2x2:temperate", "forest3x3:temperate"]
SPRING_SWAPS = ["tree0", "tree1", "bush", "tree:street:0", "tree:street:1", "deco:oak"]


def hsv(c):
    return colorsys.rgb_to_hsv(c[0] / 255, c[1] / 255, c[2] / 255)


def leafy(c):
    """A leaf or grass pixel: green-ish hue, some saturation (also the pink of the cherry)."""
    h, s, v = hsv(c)
    return (0.17 <= h <= 0.5 and s > 0.22 and v > 0.18) or (0.88 <= h <= 0.99 and s > 0.15 and v > 0.6)


def lum(c):
    return (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255


def hashxy(x, y, k):
    return ((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) & 0xFFFF


def crown_floor(img, anchor):
    """Pixels this many rows above the anchor (or higher) belong to the crown, not the planter or the grass tile."""
    return anchor[1] - 6


def recolour(img, anchor, families, clump=6, keep=0.0, key=0, low=False, evergreen=False):
    """Leaf pixels above the planter take a colour by their brightness from one of `families` (a palette dark to light),
    the family chosen per clump of pixels, so a crown reads as soft patches of colour that keep the tree's shading.
    keep: share of clumps that stay green; evergreen: dark needles (a forest's pines) keep their green."""
    out = img.copy()
    p = out.load()
    top = 10 ** 6 if low else crown_floor(img, anchor)
    w, h = img.size
    lums = [lum(p[x, y][:3]) for y in range(min(h, top + 1)) for x in range(w) if p[x, y][3] and leafy(p[x, y][:3])]
    lums.sort()
    lo, hi = (lums[len(lums) // 10], lums[len(lums) * 4 // 5]) if lums else (0, 1)
    for y in range(h):
        if y > top:
            continue
        for x in range(w):
            r, g, b, a = p[x, y]
            if not a or not leafy((r, g, b)):
                continue
            if evergreen and lum((r, g, b)) < 0.42 and g > r * 2:
                continue
            hsh = hashxy((x + (y // clump) * 3) // clump, y // clump, key)
            if keep and (hsh % 100) < keep * 100:
                continue
            pal = families[(hsh >> 4) % len(families)]
            t = max(0.0, min(0.99, (lum((r, g, b)) - lo) / max(0.01, hi - lo)))
            p[x, y] = A(pal[min(len(pal) - 1, int(t * len(pal)))])
    return out


LOW = {"bush", "flowers", "deco:hedge", "forest2x2:temperate", "forest3x3:temperate"}
TIERED = {"pine", "deco:pine", "forest2x2:temperate", "forest3x3:temperate"}


def snow(img, anchor, ground=False, low=False, tiered=False, cap=3):
    """Winter: in each column, the first `cap` rows under every top-facing edge are snow (a tier's ledge counts as an
    edge on a pine), the rest of the leaves frosted; the green ground (or a whole ground tile) whitened."""
    src = img.load()
    out = img.copy()
    p = out.load()
    w, h = img.size
    top = 10 ** 6 if low else crown_floor(img, anchor)
    for x in range(w):
        run = cap
        prev = None
        for y in range(h):
            r, g, b, a = src[x, y]
            col = (r, g, b)
            if not a or col == OUTLINE:
                run, prev = 0, None
                continue
            if ground or (y > top and leafy(col)):
                l = lum(col)
                p[x, y] = A(SNOW if l > 0.42 else SNOW_M if l > 0.3 else SNOW_D, a)
                prev = col
                continue
            if tiered and prev is not None and leafy(col) and leafy(prev) and lum(col) - lum(prev) > 0.05:
                run = 0
            if run < cap:
                p[x, y] = A(SNOW if run < cap - 1 else SNOW_M, a)
            elif leafy(col):
                hh, sat, v = hsv(col)
                rr, gg, bb = colorsys.hsv_to_rgb(hh, sat * 0.5, min(1.0, v * 0.92 + 0.06))
                p[x, y] = A((round(rr * 255), round(gg * 255), round(bb * 255)), a)
            run += 1
            prev = col
    return out


def palm_planter(img, anchor):
    """tree1's white planter with a palm in it instead of the round tree (same canvas)."""
    import math
    from PIL import ImageDraw
    planter = Image.new("RGBA", img.size, CLEAR)
    p, q = img.load(), planter.load()
    floor = anchor[1] - 7
    for y in range(floor, img.height):
        for x in range(img.width):
            q[x, y] = p[x, y]
    palm = Image.new("RGBA", img.size, CLEAR)
    d = ImageDraw.Draw(palm)
    x, y = anchor[0], anchor[1] + gt.HH - 5
    pts = [(x + round(3 * ((t / 30) ** 2)), y - t) for t in range(0, 31)]
    for k, (px_, py) in enumerate(pts):
        col = shade((170, 130, 84), 1.0 if (k // 3) % 2 else 0.84)
        d.line([(px_ - 1, py), (px_ + 1, py)], fill=A(col))
    tx, ty = pts[-1]
    for ang, ln in ((-170, 12), (-140, 11), (-100, 8), (-60, 11), (-20, 12), (160, 9), (20, 9)):
        a = math.radians(ang)
        ex, ey = tx + math.cos(a) * ln, ty + math.sin(a) * ln * 0.6 + 4
        mx, my = (tx + ex) / 2, (ty + ey) / 2 - 3
        d.line([(tx, ty), (mx, my), (ex, ey)], fill=A((62, 140, 60)), width=2)
        d.line([(tx, ty - 1), (mx, my - 1)], fill=A((108, 190, 84)))
    d.ellipse((tx - 2, ty + 1, tx + 1, ty + 4), fill=A((120, 84, 40)))
    d.ellipse((tx + 1, ty + 1, tx + 4, ty + 4), fill=A((100, 70, 34)))
    palm = gt.outline(palm)
    palm.alpha_composite(planter)
    return palm


def hibiscus(img, anchor):
    """bush in flower: red and pink blooms with yellow centres over the leaves."""
    out = img.copy()
    p = out.load()
    r = seeded("hibiscus")
    pts = [(x, y) for y in range(img.height) for x in range(img.width) if p[x, y][3] and leafy(p[x, y][:3])]
    for _ in range(max(4, len(pts) // 18)):
        x, y = pts[r(len(pts))]
        col = [(232, 52, 76), (246, 120, 160), (255, 150, 60)][r(3)]
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            if not (0 <= x + dx < img.width and 0 <= y + dy < img.height):
                continue
            if p[x + dx, y + dy][3] and leafy(p[x + dx, y + dy][:3]):
                p[x + dx, y + dy] = A(col)
        p[x, y] = A((255, 220, 80))
    return out


# ── new seasonal props ────────────────────────────────────────────────────────

def decal(key, cols, n, blob=(3, 2)):
    """Flat scatter on one tile (no outline): drifts, leaves or petals."""
    c = Canvas(1, 1, 0, pad=0)
    r = seeded(key)
    for _ in range(n):
        u, v = 0.12 + r(76) / 100, 0.12 + r(76) / 100
        x, y = c.P(u, v)
        col = cols[r(len(cols))]
        bw, bh = blob
        if bw > 1:
            c.d.ellipse((x - bw - r(2), y - bh, x + bw + r(2), y + bh), fill=A(col))
        else:
            c.d.point([(x, y)], fill=A(col))
            if r(2):
                c.d.point([(x + 1, y)], fill=A(shade(col, 0.85)))
    return c


def drift(k):
    c = Canvas(1, 1, 0, pad=0)
    r = seeded(f"drift{k}")
    for _ in range(3 + k):
        u, v = 0.2 + r(60) / 100, 0.2 + r(60) / 100
        x, y = c.P(u, v)
        rx, ry = 5 + r(5), 2 + r(2)
        c.d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=A(SNOW_M))
        c.d.ellipse((x - rx + 1, y - ry, x + rx - 2, y + ry - 1), fill=A(SNOW))
    return c


def snowman():
    c = Kit(1, 1, 34)
    drum_shadow(c, 0.5, 0.5, 0.2, 60)
    x, y = c.P(0.5, 0.5)
    for (dy, rr) in ((-5, 6), (-14, 4.5)):
        c.d.ellipse((x - rr, y + dy - rr, x + rr, y + dy + rr), fill=A(SNOW_M))
        c.d.ellipse((x - rr, y + dy - rr, x + rr - 2, y + dy + rr - 2), fill=A(SNOW))
    hy = y - 21
    c.d.ellipse((x - 3.5, hy - 3.5, x + 3.5, hy + 3.5), fill=A(SNOW_M))
    c.d.ellipse((x - 3.5, hy - 3.5, x + 2, hy + 2), fill=A(SNOW))
    c.d.point([(x - 2, hy - 1), (x + 1, hy - 1)], fill=A(NAVY))
    c.d.point([(x, hy + 1), (x + 1, hy + 1), (x + 2, hy + 2)], fill=A(ORANGE))
    c.d.rectangle((x - 4, hy + 3, x + 4, hy + 4), fill=A(ORANGE))
    c.d.rectangle((x + 2, hy + 4, x + 3, hy + 8), fill=A(shade(ORANGE, 0.8)))
    c.d.rectangle((x - 4, hy - 6, x + 3, hy - 4), fill=A(NAVY))
    c.d.rectangle((x - 3, hy - 10, x + 2, hy - 6), fill=A(NAVY))
    for k in range(3):
        c.d.point([(x, y - 8 - k * 3)], fill=A(NAVY))
    c.d.line([(x - 5, y - 15), (x - 10, y - 19)], fill=A(WOOD))
    c.d.line([(x + 4, y - 15), (x + 9, y - 18)], fill=A(shade(WOOD, 0.8)))
    return c


def umbrella(k):
    c = Kit(1, 1, 36)
    stripe = ORANGE if k == 0 else (60, 110, 200)
    x, y = c.P(0.5, 0.5)
    # a towel on the ground
    c.poly([(0.22, 0.48, 0), (0.78, 0.48, 0), (0.78, 0.78, 0), (0.22, 0.78, 0)], WHITE)
    for t in range(3):
        u = 0.26 + t * 0.18
        c.poly([(u, 0.48, 0), (u + 0.08, 0.48, 0), (u + 0.08, 0.78, 0), (u, 0.78, 0)], stripe)
    drum_shadow(c, 0.6, 0.6, 0.32, 50)
    c.d.line([(x + 1, y), (x - 1, y - 24)], fill=A((200, 200, 210)))
    cx, cy = x - 1, y - 24
    for i in range(8):
        a0 = 3.1416 * i / 8
        a1 = 3.1416 * (i + 1) / 8
        import math
        col = stripe if i % 2 == 0 else WHITE
        c.d.polygon([(cx, cy - 6), (cx - round(math.cos(a0) * 15), cy + round(math.sin(a0) * 4)),
                     (cx - round(math.cos(a1) * 15), cy + round(math.sin(a1) * 4))], fill=A(col))
    c.d.line([(cx - 15, cy), (cx + 15, cy)], fill=A(shade(stripe, 0.7)))
    c.d.point([(cx, cy - 7)], fill=A(shade(stripe, 0.7)))
    return c


def build(add):
    S = gt.SPRITES
    for name in WINTER:
        img, anchor = S[name]
        add(f"season:winter:{name}", snow(img, anchor, ground=name.startswith("hill"), low=name in LOW, tiered=name in TIERED), anchor)
    for name in WINTER_GROUND:
        img, anchor = S[name]
        add(f"season:winter:{name}", snow(img, anchor, ground=True), anchor)
    for i, name in enumerate(AUTUMN_SWAPS):
        img, anchor = S[name]
        add(f"season:autumn:{name}", recolour(img, anchor, AUTUMN, clump=6, keep=0.06, key=i + 1, low=name in LOW, evergreen=name.startswith("forest")), anchor)
    for i, name in enumerate(SPRING_SWAPS):
        img, anchor = S[name]
        add(f"season:spring:{name}", recolour(img, anchor, BLOSSOM, clump=4, keep=0.25, key=i + 11, low=name in LOW), anchor)
    img, anchor = S["tree1"]
    add("season:summer:tree1", palm_planter(img, anchor), anchor)
    img, anchor = S["bush"]
    add("season:summer:bush", hibiscus(img, anchor), anchor)
    for k in range(3):
        add(f"season:winter:snow{k}", drift(k), do_outline=False, lights=False)
    add("season:winter:snowman", snowman(), lights=False)
    for k in range(2):
        add(f"season:autumn:leaves{k}", decal(f"leaves{k}", AUTUMN[0] + AUTUMN[1], 14 + 6 * k, blob=(1, 1)), do_outline=False, lights=False)
    add("season:spring:petals", decal("petals", BLOSSOM[0][1:] + BLOSSOM[1][2:], 18, blob=(1, 1)), do_outline=False, lights=False)
    for k in range(2):
        add(f"season:summer:umbrella{k}", umbrella(k), lights=False)


def preview(sprites, path):
    """.cache/art/seasons-preview.png: each swappable sprite as it is, then its winter, autumn, spring and summer
    versions on its ground; then the new seasonal props."""
    from combos_art import sheet
    rows = []
    names = WINTER + WINTER_GROUND
    for name in names:
        n = 3 if "3x3" in name else 2 if "2x2" in name else 1
        rows.append((name, n, name))
        for s in ("winter", "autumn", "spring", "summer"):
            sn = f"season:{s}:{name}"
            rows.append((sn, n, s) if sn in sprites else (name, n, "(same)"))
    extra = [n for n in sprites if n.startswith("season:") and n.split(":", 2)[2] not in names]
    rows += [(n, 1, n[7:]) for n in sorted(extra)]
    sheet(sprites, rows, path, per=5, cw=120, ch=150, scale=2, night=False)
