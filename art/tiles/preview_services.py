"""
Review sheets for the service buildings (not shipped). generate_tiles.py writes them on each run:

  .cache/art/services-preview.png       every service (ART_DISTRICTS limits it), tiers 1-4 by day then by night, x2
  .cache/art/services-city-preview.png  their Master buildings at zoom 1, one street per district, a skyline tower and
                                        a house beside them and Kai for scale

Standalone (builds only what it shows, touches nothing in public/):
  python art/tiles/preview_services.py --out .cache/art/services-preview-before.png --city .cache/art/x.png
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

DISTRICTS = tuple(d for d in os.environ.get("ART_DISTRICTS", "compute,storage,database,networking,security,aiml,management").split(",") if d)
BG = (13, 8, 22, 255)
INK = (255, 230, 170, 255)


def night(img, lit, anchor=None):
    """The building after dark: darkened and blued (the game's night tint), its @lights added on top (lit = (image,
    anchor); both layers are placed by their anchors, as the game does)."""
    dark = ImageChops.multiply(img, Image.new("RGBA", img.size, (78, 88, 132, 255)))
    dark.putalpha(img.getchannel("A"))
    if lit is not None:
        glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        (limg, (lx, ly)) = lit
        ax, ay = anchor or (lx, ly)
        glow.alpha_composite(limg.crop((max(0, lx - ax), max(0, ly - ay), limg.width, limg.height)), (max(0, ax - lx), max(0, ay - ly)))
        rgb = ImageChops.multiply(glow.convert("RGB"), Image.merge("RGB", [glow.getchannel("A")] * 3))
        out = ImageChops.add(dark.convert("RGB"), rgb)
        out = out.convert("RGBA")
        out.putalpha(ImageChops.lighter(img.getchannel("A"), glow.getchannel("A")))
        return out
    return dark


def ground(dst, sprites, cx, cy, n=3, tile="grass0"):
    """An n x n patch of ground tiles whose N corner is at (cx, cy)."""
    import generate_tiles as gt
    g, (gax, gay) = sprites[tile]
    for gy in range(n):
        for gx in range(n):
            dst.alpha_composite(g, (cx + (gx - gy) * gt.HW - gax, cy + (gx + gy) * gt.HH - gay))


def services(world):
    return [s for d in DISTRICTS for s in world["services"] if s["districtId"] == d]


def sheet(world, built, sprites, out, scale=2):
    """built[(id, tier)] = ((img, anchor), lights-or-None)."""
    rows = services(world)
    cw = 112
    up = max(a[1] for ((_, a), _) in built.values())
    down = max(i.height - a[1] for ((i, a), _) in built.values())
    ch = up + max(down, 54) + 22
    cols = 8
    img = Image.new("RGBA", (cols * cw + 8, len(rows) * ch), BG)
    d = ImageDraw.Draw(img)
    for r, s in enumerate(rows):
        for k in range(cols):
            tier = k % 4 + 1
            (lm, (ax, ay)), lit = built[(s["id"], tier)]
            if k >= 4:
                d.rectangle((k * cw + 8, r * ch, k * cw + cw + 8, r * ch + ch - 1), fill=(6, 8, 20, 255))
            cx, cy = k * cw + cw // 2 + 8, r * ch + up + 6
            patch = Image.new("RGBA", img.size, (0, 0, 0, 0))
            ground(patch, sprites, cx, cy)
            pic = lm if k < 4 else night(lm, lit, (ax, ay))
            if k >= 4:
                patch = night(patch, None)
            img.alpha_composite(patch)
            img.alpha_composite(pic, (cx - ax, cy - ay))
            d.text((k * cw + 12, r * ch + ch - 16), f"{s['id']} {tier}{' night' if k >= 4 else ''}", fill=INK)
    img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print("preview →", out)


def kai():
    """Kai's first idle frame (48x72, feet at the bottom centre)."""
    import generate_tiles as gt
    p = os.path.join(gt.ROOT, "public", "assets", "characters", "player-gold", "sheet.png")
    if not os.path.exists(p):
        return None
    return Image.open(p).convert("RGBA").crop((0, 0, 48, 72))


def strip(built, sprites, items):
    """One street at zoom 1: 3x3 lots in a row (N corners at gx = 3i, gy = 0) behind a pavement, a road and a
    pavement, Kai on the near pavement for scale."""
    import generate_tiles as gt
    n = len(items) * 3
    rows = 6
    ox = rows * gt.HW + 8
    oy = 240
    canvas = Image.new("RGBA", ((n + rows) * gt.HW + 16, oy + (n + rows) * gt.HH + 16), BG)

    def at(gx, gy):
        return ox + round((gx - gy) * gt.HW), oy + round((gx + gy) * gt.HH)

    for gy in range(rows):
        for gx in range(n):
            t = "grass0" if gy < 3 else ("roadX" if gy == 4 else "sidewalk")
            g, (gax, gay) = sprites[t]
            x, y = at(gx, gy)
            canvas.alpha_composite(g, (x - gax, y - gay))
    draws = []
    for i, ref in enumerate(items):
        if ref.startswith("lm:") and ref.count(":") == 1:
            (img, (ax, ay)), _ = built[(ref[3:], 4)]
        elif ref in sprites:
            img, (ax, ay) = sprites[ref]
        else:
            continue
        gx = i * 3 + (1 if ref.startswith(("tower:", "house:")) else 0)
        gy = 1 if ref.startswith(("tower:", "house:")) else 0
        draws.append((gx + gy, img, at(gx, gy), (ax, ay)))
    k = kai()
    if k is not None:
        x, y = at(4.6, 3.5)
        draws.append((8.1, k, (x, y), (24, 68)))
    for _, img, (x, y), (ax, ay) in sorted(draws, key=lambda t: t[0]):
        canvas.alpha_composite(img, (x - ax, y - ay))
    return canvas.crop(canvas.getbbox())


def city(world, built, sprites, out):
    """Each district's Master buildings along its own street at zoom 1, beside its skyline tower, a house and Kai."""
    streets = [strip(built, sprites, ["lm:" + s["id"] for s in services(world) if s["districtId"] == d] + [f"tower:{d}:sky", "house:flats:0"])
               for d in DISTRICTS]
    img = Image.new("RGBA", (max(a.width for a in streets) + 16, sum(a.height + 8 for a in streets) + 8), BG)
    y = 8
    for a in streets:
        img.alpha_composite(a, (8, y))
        y += a.height + 8
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print("preview →", out)


def build_all(world):
    import generate_tiles as gt
    colors = {d["id"]: gt.rgb(d["color"]) for d in world["districts"]}
    return {(s["id"], t): gt.landmark(s, t, colors[s["districtId"]]) for s in services(world) for t in (1, 2, 3, 4)}


def write(sprites, built, world, out, city_out):
    sheet(world, built, sprites, out)
    city(world, built, sprites, city_out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--city", required=True)
    args = ap.parse_args()
    if __name__ == "__main__":
        sys.modules.setdefault("preview_services", sys.modules["__main__"])
    import generate_tiles as gt
    with open(os.path.join(gt.ROOT, "shared", "world.json")) as f:
        world = json.load(f)
    gt.load_pack()
    gt.add_pack()
    gt.build_ground()
    import towers_art
    import houses_art
    towers_art.build(gt.add)
    houses_art.build(gt.add)
    write(gt.SPRITES, build_all(world), world, args.out, args.city)


if __name__ == "__main__":
    main()
