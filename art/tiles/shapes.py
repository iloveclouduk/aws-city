"""Small drawing helpers shared by the props (culture_art, landscape_art, park_art, airport_art): an upright cylinder,
a dot, window strips on either face, the S3 pail and a globe. The service buildings use services/kit.py instead."""
from generate_tiles import A, GLASS, GLASS_D, HH, HW, WHITE, shade

LIT = (255, 214, 120)


def cyl(c, u, v, z0, z1, r, col, top=None, lit=False):
    """Upright cylinder at (u, v) from z0 to z1 (screen-space ellipses)."""
    x, y0 = c.P(u, v, z0)
    y1 = y0 - (z1 - z0)
    rx, ry = max(1, round(r * HW * 1.3)), max(1, round(r * HH * 1.3))
    c.d.rectangle((x - rx, y1, x + rx, y0), fill=A(shade(col, 0.82)))
    c.d.ellipse((x - rx, y0 - ry, x + rx, y0 + ry), fill=A(shade(col, 0.82)))
    c.d.rectangle((x - rx, y1, x - rx // 3, y0), fill=A(shade(col, 0.95)))
    c.d.ellipse((x - rx, y1 - ry, x + rx, y1 + ry), fill=A(top or shade(col, 1.08)))
    if lit:
        c.ld.rectangle((x - 1, y1 + 3, x + 1, y0 - 2), fill=A(LIT))
    return x, y1


def dot(c, u, v, z, col, lit=False, r=0):
    x, y = c.P(u, v, z)
    c.d.rectangle((x - r, y - r, x + r, y + r), fill=A(col))
    if lit:
        c.ld.rectangle((x - r - 1, y - r - 1, x + r + 1, y + r + 1), fill=A(col, 200))
        c.ld.rectangle((x - r, y - r, x + r, y + r), fill=A(col))


def lwin(c, v, u, z, w=0.14, h=3, col=GLASS, lit=True):
    c.lface(v, u, u + w, z, z + h, col, light=lit)


def rwin(c, u, v, z, w=0.14, h=3, col=GLASS_D, lit=True):
    c.rface(u, v, v + w, z, z + h, col, light=lit)


def bucket(c, u, v, z, col, s=1.0):
    """The S3 icon bucket: a tapered pail with a rim."""
    x, y = c.P(u, v, z)
    w0, w1, h = round(4 * s), round(6 * s), round(7 * s)
    c.d.polygon([(x - w0, y), (x + w0, y), (x + w1, y - h), (x - w1, y - h)], fill=A(col))
    c.d.polygon([(x - w0, y), (x - w0 + 2, y), (x - w1 + 2, y - h), (x - w1, y - h)], fill=A(shade(col, 1.18)))
    c.d.ellipse((x - w1, y - h - 2, x + w1, y - h + 2), fill=A(shade(col, 0.6)))
    c.d.line([(x - w1, y - h), (x + w1, y - h)], fill=A(shade(col, 1.3)))


def globe(c, x, y, r, col, light=False):
    c.d.ellipse((x - r, y - r, x + r, y + r), fill=A((80, 160, 230)))
    c.d.ellipse((x - r + 2, y - r + 2, x - 1, y - 1), fill=A((110, 200, 110)))  # a continent
    c.d.ellipse((x - r, y - r, x + r, y + r), outline=A(WHITE))
    c.d.ellipse((x - r // 2, y - r, x + r // 2, y + r), outline=A(WHITE))
    c.d.line([(x - r, y), (x + r, y)], fill=A(WHITE))
    if light:
        c.ld.ellipse((x - r, y - r, x + r, y + r), outline=A((180, 230, 255)))
        c.ld.line([(x - r, y), (x + r, y)], fill=A((180, 230, 255)))
