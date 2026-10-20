"""
Knowledge towers: every landmark grows a tower shaped by its service on the back of its lot, so a building visibly
rises with what the player has learned there (src/state/growth.ts tiers). The front building keeps its metaphor (a
lake stays a lake); the tower behind it is the player's knowledge made tall:

  tier 1  Novice        no tower yet: the front building alone
  tier 2  Practitioner  a mid-rise
  tier 3  Expert        a tower
  tier 4  Master        a skyscraper ending in a thin tip on the lot's centre line, where the legend crowns stand

Each service draws both in art/tiles/services/<district>.py (lm_<id> and tw_<id>, collected in services.REGISTRY).
`with_tower` composes the finished front building over its tower on one canvas, both anchored at the lot's N corner,
then `crop` trims the empty sky so the atlas holds only pixels.
"""
from PIL import Image


def tower_for(service, tier):
    """The tower behind a service's front building (services.REGISTRY tw_<id>). None at tier 1."""
    import services
    return services.REGISTRY[service["id"]][1](tier, f"tw:{service['id']}")


def _place(dst, img, at):
    if img is not None:
        dst.alpha_composite(img, at)


def with_tower(landmark, tower):
    """Composes a finished landmark (img, anchor, lights) over its tower's; both anchors are the lot's N corner."""
    img, (ax, ay), lit = landmark
    if tower is None:
        return landmark
    timg, (tx, ty), tlit = tower
    # The canvas that holds both, with the shared anchor at (nx, ny).
    nx, ny = max(ax, tx), max(ay, ty)
    w = nx + max(img.width - ax, timg.width - tx)
    h = ny + max(img.height - ay, timg.height - ty)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    _place(out, timg, (nx - tx, ny - ty))
    _place(out, img, (nx - ax, ny - ay))
    lights = None
    if lit is not None or tlit is not None:
        lights = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        # the landmark hides what it stands in front of: its own pixels mask the tower's lights
        if tlit is not None:
            tl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            tl.alpha_composite(tlit, (nx - tx, ny - ty))
            mask = Image.new("L", (w, h), 0)
            mask.paste(img.getchannel("A"), (nx - ax, ny - ay))
            tl.putalpha(Image.composite(Image.new("L", (w, h), 0), tl.getchannel("A"), mask.point(lambda a: 255 if a > 0 else 0)))
            lights.alpha_composite(tl)
        _place(lights, lit, (nx - ax, ny - ay))
    return out, (nx, ny), lights


def crop(img, anchor):
    """Trims the empty sky above the drawing (keeping 1 px) and moves the anchor down with it. Only the top: the
    anchor (the lot's N corner) stays inside the image, and the sign still sits on the roof (Landmark.getTopCenter)."""
    box = img.getbbox()
    if box is None:
        return img, anchor
    y0 = max(0, box[1] - 1)
    return img.crop((0, y0, img.width, img.height)), (anchor[0], anchor[1] - y0)
