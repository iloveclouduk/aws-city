"""
Service combos (shared/combos.json): the surprise props that appear when two or three services that work together
stand near each other in a city. Each is combo:<id> (1x1 or 2x2, as combos.json `size` says) with its night glow on
combo:<id>@lights. Drawn in the service buildings' kit style (services/kit.py: sun from the left, left faces x0.9,
right x0.72, tops x1.04, a soft ground shadow under the 1 px outline) and builder_art's prop scale, in the AWS category
colours of the services they join. Every combo carries the same small sign of being one: a gold star that twinkles
at night (`star`), so a player learns to spot them.

  edge-arch       S3 + CloudFront: green bucket pillars under a purple arch, a lit globe on top, parcels on a rail
  event-plaza     API Gateway + Lambda: a round plaza, a purple gate frame, an orange lambda sculpture, benches, lamps
  stream-fountain Kinesis + Lambda: a basin whose purple jets leap in sequence round an orange spout
  vault-garden    RDS + Backup: hedged garden round a stone vault with a round gold door and a stack of disks
  mail-chute      SQS + Lambda: a purple post box whose chute drops letters into an orange tray
  signal-tower    EventBridge + Step Functions: a pink lattice mast with semaphore arms and step lamps
  ticket-gate     Cognito + API Gateway: a red ticket booth and a turnstile under a purple bar
  quick-pick      DynamoDB + Lambda: a magenta kiosk with an orange striped awning
  signpost        Route 53 + CloudFront: a timber post with purple arrow boards and a globe
  lockbox         KMS + S3: a green strongbox with a red padlock on a stone plinth
  hub-bridge      VPC + Transit Gateway: a pond with a round purple pavilion and four footbridges
  reading-room    S3 + Glue + Athena: a little green library kiosk with shelves and a reading lamp
  robot-workshop  AgentCore + Bedrock: a teal workbench, a small robot and a glowing idea bulb
  container-yard  ECS + Fargate: stacked containers under a small orange gantry
  key-cabinet     Secrets Manager + RDS: a red key cabinet on a post beside a magenta disk drum
  watch-bell      GuardDuty + Security Hub: a red bell tower with a gold bell and a lantern
  search-lantern  DynamoDB + OpenSearch: a lamp post holding a glowing magnifying lens
  express-lane    Global Accelerator + EC2: a purple gantry over a lane of orange chevrons
  live-board      AppSync + DynamoDB: a pink-framed board of live tiles with an antenna
  blueprint-stand Organizations + CloudFormation: an easel with a blueprint of an account tree

Generic shapes only: no AWS logos or real places. Deterministic. Called from generate_tiles.main as
combos_art.build(add); combos_art.preview writes .cache/art/combos-preview.png.
"""
import json
import math
import os

from PIL import Image, ImageDraw

from generate_tiles import A, GRASS, GRASS_D, NAVY, NAVY_D, ORANGE, ORANGE_D, WATER, WHITE, WOOD, WOOD_D, seeded, shade
from services.kit import (LIT, STEEL, STEEL_D, STEEL_M, STONE, Kit, drum, drum_shadow, ellipse, ground_shadow, lattice, prism)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

COMPUTE = (237, 113, 0)
STORAGE = (122, 161, 22)
DATABASE = (201, 37, 209)
NETWORK = (140, 79, 255)
SECURITY = (221, 52, 76)
AIML = (1, 168, 141)
MANAGE = (231, 21, 123)
GOLD = (236, 186, 52)
GOLD_L = (255, 226, 120)
BULB = (255, 236, 150)
PAVER = (200, 192, 178)
PAVER_D = (172, 164, 150)
HEDGE = (52, 128, 66)
CREAM = (246, 236, 210)
PAPER = (246, 240, 222)
BLUEPRINT = (44, 96, 176)
POOL = (86, 170, 226)


# ── helpers ───────────────────────────────────────────────────────────────────

def ell(c, x, y, rx, ry, col, d=None):
    (d or c.d).ellipse((round(x - rx), round(y - ry), round(x + rx), round(y + ry)), fill=A(col))


def px(c, x, y, col, lit=None):
    c.d.point([(x, y)], fill=A(col))
    if lit:
        c.ld.point([(x, y)], fill=A(lit))


def glow(c, x, y, r, col, alpha=90):
    c.ld.ellipse((x - r, y - r, x + r, y + r), fill=A(col, alpha))


def bulb(c, x, y, col=BULB):
    c.d.point([(x, y)], fill=A(col))
    c.ld.point([(x, y)], fill=A(col))
    c.ld.point([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], fill=A(col, 140))


def star(c, x, y):
    """The combo mark: a small gold four-point star (day), a twinkle at night."""
    c.d.point([(x, y - 1), (x - 1, y), (x, y), (x + 1, y), (x, y + 1)], fill=A(GOLD))
    c.d.point([(x, y)], fill=A(GOLD_L))
    c.ld.point([(x, y - 2), (x, y + 2), (x - 2, y), (x + 2, y)], fill=A(GOLD_L, 150))
    c.ld.point([(x, y - 1), (x - 1, y), (x, y), (x + 1, y), (x, y + 1)], fill=A(GOLD_L))


def pole(c, u, v, z0, z1, col=STEEL_D, w=0.035):
    prism(c, u - w, v - w, u + w, v + w, z0, z1, col, rim=0, ao=False)


def lamp(c, u, v, h=26):
    pole(c, u, v, 0, h, NAVY)
    x, y = c.P(u, v, h)
    c.d.rectangle((x - 2, y - 3, x + 1, y), fill=A(NAVY_D))
    c.d.rectangle((x - 1, y - 2, x, y - 1), fill=A(BULB))
    glow(c, x, y - 1, 4, BULB, 110)
    c.ld.rectangle((x - 1, y - 2, x, y - 1), fill=A(BULB))


def paving(c, u0, v0, u1, v1, col=PAVER, key="pave", h=2):
    """A low paved pad with a stone kerb and joints."""
    ground_shadow(c, u0, v0, u1, v1, alpha=50)
    prism(c, u0, v0, u1, v1, 0, h, shade(col, 0.92), roofcol=col, rim=0)
    r = seeded(key)
    n = int(round((u1 - u0) * 4))
    for k in range(1, n):
        u = u0 + (u1 - u0) * k / n
        c.line((u, v0 + 0.03, h), (u, v1 - 0.03, h), shade(col, 0.88))
    n = int(round((v1 - v0) * 4))
    for k in range(1, n):
        v = v0 + (v1 - v0) * k / n
        c.line((u0 + 0.03, v, h), (u1 - 0.03, v, h), shade(col, 0.88))
    for _ in range(int((u1 - u0) * (v1 - v0) * 6)):
        x, y = c.P(u0 + r(int((u1 - u0) * 100)) / 100, v0 + r(int((v1 - v0) * 100)) / 100, h)
        c.d.point([(x, y)], fill=A(shade(col, 1.06)))


def lawn(c, u0, v0, u1, v1, key):
    c.poly([(u0, v0, 0), (u1, v0, 0), (u1, v1, 0), (u0, v1, 0)], GRASS)
    r = seeded(key)
    for _ in range(int((u1 - u0) * (v1 - v0) * 14)):
        x, y = c.P(u0 + r(int((u1 - u0) * 100)) / 100, v0 + r(int((v1 - v0) * 100)) / 100, 0)
        c.d.point([(x, y)], fill=A(GRASS_D if r(3) else shade(GRASS, 1.2)))


def disc_pad(c, u, v, r, h, col):
    """A round stone pad (kit drum) and its shadow."""
    drum_shadow(c, u, v, r, 60)
    drum(c, u, v, 0, h, r, shade(col, 0.95), capcol=col)


def bench(c, u, v, along_u=True):
    if along_u:
        prism(c, u - 0.14, v - 0.04, u + 0.14, v + 0.04, 2, 4, WOOD, rim=0, ao=False)
        prism(c, u - 0.14, v - 0.06, u + 0.14, v - 0.04, 4, 7, WOOD_D, rim=0, ao=False)
    else:
        prism(c, u - 0.04, v - 0.14, u + 0.04, v + 0.14, 2, 4, WOOD, rim=0, ao=False)
        prism(c, u - 0.06, v - 0.14, u - 0.04, v + 0.14, 4, 7, WOOD_D, rim=0, ao=False)


def lam(c, x, y, s, col):
    """A chunky lambda glyph (screen space): (x, y) its foot, s its height in px."""
    w = max(2, s // 6)
    # long leg: top-left to bottom-right; short leg: middle to bottom-left
    c.d.polygon([(x - s // 3, y - s), (x - s // 3 + w + 1, y - s), (x + s // 3 + 1, y), (x + s // 3 - w, y)], fill=A(col))
    c.d.polygon([(x - 1, y - s // 2), (x + w - 1, y - s // 2 + w), (x - s // 3 + w - 1, y), (x - s // 3 - 1, y)], fill=A(shade(col, 0.82)))
    c.d.line([(x - s // 3, y - s), (x - s // 3 + w, y - s)], fill=A(shade(col, 1.25)))


def envelope(c, x, y, col=WHITE):
    c.d.rectangle((x - 2, y - 1, x + 2, y + 1), fill=A(col))
    c.d.point([(x - 1, y - 1), (x, y), (x + 1, y - 1)], fill=A(shade(col, 0.75)))


# ── the combos ────────────────────────────────────────────────────────────────

def edge_arch():
    c = Kit(2, 2, 66)
    paving(c, 0.12, 0.12, 1.88, 1.88, key="arch")
    # cached parcels waiting on a low rail between the pillars
    for k, t in enumerate((0.35, 0.5, 0.65)):
        u, v = 0.55 + (1.45 - 0.55) * t, 1.45 - (1.45 - 0.55) * t
        prism(c, u - 0.08, v - 0.08, u + 0.08, v + 0.08, 2, 8, (214, 170, 112) if k != 1 else (196, 150, 96), rim=0)
        x, y = c.P(u, v, 8)
        c.d.line([(x - 2, y), (x + 2, y)], fill=A(shade((214, 170, 112), 0.7)))
    # bucket pillars: tapered green drums with rims, back pillar first
    for (u, v) in ((1.45, 0.55), (0.55, 1.45)):
        drum_shadow(c, u, v, 0.22, 70)
        drum(c, u, v, 2, 30, 0.13, STORAGE, r1=0.24, capcol=shade(STORAGE, 0.5))
        ellipse(c, u, v, 30, 0.2, shade(STORAGE, 0.42), rim=False)
        x, y = c.P(u, v, 30)
        c.d.arc((x - 8, y - 5, x + 8, y + 3), 0, 180, fill=A(shade(STORAGE, 1.35)))
        for z in (10, 20):
            xx, yy = c.P(u, v, z)
            c.d.arc((xx - 6, yy - 2, xx + 6, yy + 3), 20, 160, fill=A(shade(STORAGE, 0.7)))
    # the arch: a purple band in screen space from pillar top to pillar top
    xa, ya = c.P(0.55, 1.45, 31)
    xb, yb = c.P(1.45, 0.55, 31)
    cx, cy = (xa + xb) // 2, ya
    rx = (xb - xa) // 2
    for k, col in enumerate((shade(NETWORK, 0.65), shade(NETWORK, 0.85), NETWORK, NETWORK, shade(NETWORK, 1.25))):
        c.d.arc((cx - rx - 3 + k, cy - 29 + k, cx + rx + 3 - k, cy + 29 - k), 180, 360, fill=A(col), width=1)
    c.d.rectangle((cx - 3, cy - 30, cx + 3, cy - 25), fill=A(shade(NETWORK, 1.1)))
    for k in range(9):  # edge lights along the arch
        a = math.pi + (k + 0.5) * math.pi / 9
        bulb(c, cx + round(math.cos(a) * (rx + 1)), cy + round(math.sin(a) * 27), (210, 190, 255))
    # the globe on the keystone
    gx, gy = cx, cy - 36
    c.d.ellipse((gx - 6, gy - 6, gx + 6, gy + 6), fill=A((80, 160, 230)))
    c.d.ellipse((gx - 4, gy - 4, gx - 1, gy - 1), fill=A((110, 200, 110)))
    c.d.ellipse((gx + 1, gy, gx + 4, gy + 3), fill=A((110, 200, 110)))
    c.d.ellipse((gx - 6, gy - 6, gx + 6, gy + 6), outline=A(WHITE))
    c.d.line([(gx - 6, gy), (gx + 6, gy)], fill=A(WHITE))
    c.d.ellipse((gx - 3, gy - 6, gx + 3, gy + 6), outline=A(WHITE))
    glow(c, gx, gy, 9, (170, 220, 255), 80)
    c.ld.ellipse((gx - 6, gy - 6, gx + 6, gy + 6), outline=A((190, 230, 255)))
    star(c, gx + 9, gy - 6)
    return c


def event_plaza():
    c = Kit(2, 2, 60)
    lawn(c, 0.04, 0.04, 1.96, 1.96, "plaza-lawn")
    disc_pad(c, 1.0, 1.0, 0.82, 2, PAVER)
    x0, y0 = c.P(1.0, 1.0, 2)
    for k in range(12):  # radial joints
        a = k * math.pi / 6
        c.d.line([(x0 + round(math.cos(a) * 9), y0 + round(math.sin(a) * 4.5)), (x0 + round(math.cos(a) * 17), y0 + round(math.sin(a) * 8.5))], fill=A(PAVER_D))
    ell(c, x0, y0, 9, 4.5, GOLD)
    ell(c, x0, y0, 7, 3.5, PAVER)
    # the gate at the back: two purple posts and a lintel with a light strip
    for (u, v) in ((0.3, 0.78), (0.78, 0.3)):
        prism(c, u - 0.06, v - 0.06, u + 0.06, v + 0.06, 2, 34, NETWORK)
    xa, ya = c.P(0.3, 0.78, 34)
    xb, yb = c.P(0.78, 0.3, 34)
    c.d.rectangle((xa - 3, ya - 5, xb + 3, ya), fill=A(NETWORK))
    c.d.line([(xa - 3, ya - 5), (xb + 3, ya - 5)], fill=A(shade(NETWORK, 1.3)))
    for x in range(xa - 1, xb + 2, 2):
        bulb(c, x, ya - 2, (220, 200, 255))
    # sparks running from the gate to the sculpture (events)
    for t in (0.3, 0.55, 0.8):
        x, y = c.P(0.52 + 0.48 * t, 0.52 + 0.48 * t, 12)
        px(c, x, y, (230, 210, 255), (230, 210, 255))
    # the lambda sculpture on a round plinth
    drum(c, 1.0, 1.0, 2, 8, 0.2, STONE)
    lam(c, x0, y0 - 7, 24, COMPUTE)
    glow(c, x0, y0 - 18, 10, (255, 190, 90), 60)
    # benches round the edge, lamps on the front corners
    bench(c, 1.62, 1.05, along_u=False)
    bench(c, 1.05, 1.62, along_u=True)
    lamp(c, 0.4, 1.62)
    lamp(c, 1.62, 0.4)
    star(c, x0 + 12, y0 - 26)
    return c


def stream_fountain():
    c = Kit(1, 1, 44)
    drum_shadow(c, 0.5, 0.5, 0.42, 60)
    drum(c, 0.5, 0.5, 0, 6, 0.38, STONE)
    ellipse(c, 0.5, 0.5, 6, 0.32, (110, 150, 230), light=(150, 130, 255, 90))
    x, y = c.P(0.5, 0.5, 6)
    drum(c, 0.5, 0.5, 6, 16, 0.07, COMPUTE)
    # three purple jets, each a step further round (a stream read in order)
    jets = [(-1, 7, 14), (1, 9, 18), (-1, 11, 22)]
    for k, (s, reach, hgt) in enumerate(jets):
        pts = []
        for t in range(0, 11):
            tt = t / 10
            pts.append((x + s * round(reach * tt), y - 10 - round(hgt * 4 * tt * (1 - tt)) + round(6 * tt)))
        col = shade(NETWORK, 1.0 + 0.15 * k)
        c.d.line(pts, fill=A(col), width=1)
        c.ld.line(pts, fill=A((180, 160, 255), 160))
        ex, ey = pts[-1]
        px(c, ex, ey + 1, (210, 230, 255))
    px(c, x, y - 17, (230, 240, 255), (230, 240, 255))
    r = seeded("droplets")
    for _ in range(7):
        px(c, x - 9 + r(19), y - 2 + r(4), (200, 220, 255))
    star(c, x + 11, y - 22)
    return c


def vault_garden():
    c = Kit(2, 2, 54)
    lawn(c, 0.04, 0.04, 1.96, 1.96, "vault-lawn")
    # a path to the door
    c.poly([(0.85, 1.3, 0), (1.15, 1.3, 0), (1.15, 1.96, 0), (0.85, 1.96, 0)], PAVER)
    # back hedges
    prism(c, 0.1, 0.1, 1.9, 0.26, 0, 9, HEDGE, rim=0)
    prism(c, 0.1, 0.26, 0.26, 1.9, 0, 9, HEDGE, rim=0)
    r = seeded("vault-hedge")
    for _ in range(40):
        u, v = (0.1 + r(180) / 100, 0.26) if r(2) else (0.26, 0.26 + r(160) / 100)
        x, y = c.P(u, v, 0)
        c.d.point([(x, y - 2 - r(6))], fill=A(shade(HEDGE, 1.3 if r(2) else 0.75)))
    # the vault: a stone drum with a round gold door on its front
    drum_shadow(c, 1.0, 1.0, 0.42, 70)
    drum(c, 1.0, 1.0, 0, 26, 0.4, STONE)
    drum(c, 1.0, 1.0, 26, 30, 0.3, shade(STONE, 0.9), r1=0.16, capcol=STORAGE)
    x, y = c.P(1.0, 1.0, 0)
    dx, dy = x - 2, y + 4 - 13
    ell(c, dx, dy, 8, 9, shade(GOLD, 0.7))
    ell(c, dx - 1, dy, 7, 8, GOLD)
    ell(c, dx - 1, dy, 3, 3, shade(GOLD, 0.75))
    for k in range(6):
        a = k * math.pi / 3 + 0.3
        c.d.line([(dx - 1, dy), (dx - 1 + round(math.cos(a) * 6), dy + round(math.sin(a) * 6))], fill=A(shade(GOLD, 0.8)))
    px(c, dx - 1, dy, GOLD_L)
    c.d.arc((dx - 8, dy - 9, dx + 6, dy + 9), 110, 230, fill=A(GOLD_L))
    # a stack of database disks beside it
    for k in range(3):
        drum(c, 1.55, 1.3, 2 + k * 6, 7 + k * 6, 0.16, DATABASE)
    xx, yy = c.P(1.55, 1.3, 20)
    for k in range(3):
        px(c, xx - 3, yy + 3 + k * 6, (255, 200, 255), (255, 200, 255))
    # flower beds in front and a lamp
    for (u, v) in ((0.55, 1.6), (1.5, 1.7)):
        prism(c, u - 0.16, v - 0.1, u + 0.16, v + 0.1, 0, 3, STONE, roofcol=(110, 82, 58))
        for k in range(6):
            fx, fy = c.P(u - 0.12 + k * 0.05, v - 0.04 + (k % 2) * 0.06, 3)
            px(c, fx, fy - 1, [(255, 110, 150), (255, 204, 60), (250, 250, 250)][k % 3])
    lamp(c, 1.62, 0.6)
    star(c, x + 10, y - 40)
    return c


def mail_chute():
    c = Kit(1, 1, 50)
    ground_shadow(c, 0.12, 0.12, 0.88, 0.88, alpha=50)
    paving(c, 0.1, 0.1, 0.9, 0.9, key="chute", h=1)
    # the Lambda tray (orange, open) on the right, letters inside
    prism(c, 0.52, 0.14, 0.86, 0.46, 1, 9, COMPUTE)
    c.poly([(0.56, 0.18, 9), (0.82, 0.18, 9), (0.82, 0.42, 9), (0.56, 0.42, 9)], shade(COMPUTE, 0.55))
    for (u, v) in ((0.62, 0.26), (0.74, 0.34), (0.7, 0.24)):
        x, y = c.P(u, v, 9)
        envelope(c, x, y - 1)
    # the post box (SQS purple) on the left, a rounded cap and a lit slot
    prism(c, 0.14, 0.5, 0.42, 0.82, 1, 30, NETWORK, roofcol=shade(NETWORK, 1.1))
    drum(c, 0.28, 0.66, 30, 34, 0.2, shade(NETWORK, 1.05))
    c.lface(0.82, 0.19, 0.37, 22, 24, NAVY_D)
    x, y = c.P(0.28, 0.82, 23)
    c.ld.line([(x - 3, y - 1), (x + 3, y + 1)], fill=A(BULB))
    c.lface(0.82, 0.2, 0.36, 6, 15, shade(NETWORK, 0.75))
    # the chute: a steel tube from the box's right face over into the tray
    pts = [c.P(0.42, 0.66, 20), c.P(0.5, 0.56, 21), c.P(0.58, 0.46, 18), c.P(0.64, 0.38, 13)]
    c.d.line(pts, fill=A(STEEL_D), width=4)
    c.d.line([(a, b - 1) for a, b in pts], fill=A(STEEL_M), width=2)
    c.d.line([(a, b - 2) for a, b in pts], fill=A(STEEL), width=1)
    # letters in flight down the chute
    for (u, v, z) in ((0.5, 0.56, 26), (0.6, 0.44, 22)):
        x, y = c.P(u, v, z)
        envelope(c, x, y)
    x, y = c.P(0.28, 0.66, 34)
    star(c, x - 7, y - 5)
    return c


def signal_tower():
    c = Kit(1, 1, 66)
    ground_shadow(c, 0.25, 0.25, 0.75, 0.75, alpha=60)
    prism(c, 0.3, 0.3, 0.7, 0.7, 0, 3, STONE)
    lattice(c, 0.5, 0.5, 3, 52, 7, 2, MANAGE, step=6)
    x, y = c.P(0.5, 0.5, 52)
    c.d.rectangle((x - 3, y - 4, x + 2, y), fill=A(shade(MANAGE, 0.8)))
    # semaphore arms (EventBridge purple), each with a lamp
    for (dx, dy) in ((-12, -8), (11, 2)):
        c.d.line([(x, y - 2), (x + dx, y - 2 + dy)], fill=A(NETWORK), width=2)
        bulb(c, x + dx, y - 2 + dy, (210, 190, 255))
        glow(c, x + dx, y - 2 + dy, 3, (200, 180, 255), 100)
    # step lamps down the mast: a workflow's states lighting in turn
    for k, col in enumerate(((110, 240, 150), (255, 200, 80), (110, 240, 150), (255, 120, 180))):
        xx, yy = c.P(0.5, 0.5, 42 - k * 9)
        c.d.rectangle((xx + 3, yy - 1, xx + 4, yy), fill=A(col))
        c.ld.rectangle((xx + 2, yy - 2, xx + 5, yy + 1), fill=A(col, 110))
        c.ld.rectangle((xx + 3, yy - 1, xx + 4, yy), fill=A(col))
    c.d.line([(x, y - 4), (x, y - 10)], fill=A(STEEL))
    px(c, x, y - 11, (232, 64, 56), (232, 64, 56))
    star(c, x - 8, y - 14)
    return c


def ticket_gate():
    c = Kit(1, 1, 46)
    paving(c, 0.08, 0.08, 0.92, 0.92, key="gate", h=1)
    # the ticket booth (Cognito red) on the left, its lit window facing the street
    win = lambda i, n, z, h, b, s: ((LIT, LIT) if s == "L" and 9 <= z <= 16 and 2 <= i < n - 2 else None)
    prism(c, 0.1, 0.5, 0.44, 0.88, 1, 22, SECURITY, L=win, roofcol=shade(SECURITY, 0.85))
    prism(c, 0.08, 0.48, 0.46, 0.9, 22, 25, WHITE, rim=0, ao=False)
    prism(c, 0.1, 0.88, 0.44, 0.92, 8, 9, WHITE, rim=0, ao=False)
    # the turnstile under a purple bar (API Gateway) on the right
    for v in (0.12, 0.46):
        prism(c, 0.7, v - 0.04, 0.78, v + 0.04, 1, 32, NETWORK, rim=0)
    prism(c, 0.7, 0.08, 0.78, 0.5, 32, 37, NETWORK, roofcol=shade(NETWORK, 1.25), rim=0)
    prism(c, 0.68, 0.24, 0.8, 0.36, 1, 11, STEEL_M)
    x, y = c.P(0.74, 0.3, 11)
    for dx, dy in ((-5, 1), (4, 2), (0, -3)):
        c.d.line([(x, y), (x + dx, y + dy)], fill=A(STEEL))
    # green "go" lamp on the bar, and the ticket (a token) glowing above it
    gx, gy = c.P(0.78, 0.29, 34)
    px(c, gx, gy, (110, 240, 150), (110, 240, 150))
    tx, ty = c.P(0.74, 0.29, 47)
    c.d.rectangle((tx - 4, ty - 2, tx + 4, ty + 2), fill=A(GOLD))
    c.d.line([(tx - 1, ty - 2), (tx - 1, ty + 2)], fill=A(shade(GOLD, 0.7)))
    c.d.line([(tx - 4, ty - 2), (tx + 4, ty - 2)], fill=A(GOLD_L))
    glow(c, tx, ty, 6, GOLD_L, 90)
    c.ld.rectangle((tx - 4, ty - 2, tx + 4, ty + 2), fill=A(GOLD_L))
    star(c, tx + 8, ty - 3)
    return c


def quick_pick():
    c = Kit(1, 1, 44)
    ground_shadow(c, 0.18, 0.18, 0.82, 0.82)
    prism(c, 0.2, 0.2, 0.8, 0.8, 0, 18, DATABASE, L=lambda i, n, z, h, b, s: ((LIT, LIT) if 7 <= z <= 13 and 2 <= i < n - 2 else None) if s == "L" else None, roofcol=shade(DATABASE, 0.9))
    prism(c, 0.2, 0.8, 0.8, 0.86, 7, 8, WOOD, rim=0, ao=False)
    # goods on the counter (picked in a moment)
    for k, col in enumerate(((255, 204, 60), (110, 200, 255), (255, 110, 150), (140, 230, 120))):
        x, y = c.P(0.28 + k * 0.14, 0.83, 8)
        c.d.rectangle((x - 1, y - 3, x + 1, y - 1), fill=A(col))
    # Lambda's orange striped awning
    for k in range(6):
        u = 0.16 + k * 0.113
        col = COMPUTE if k % 2 == 0 else WHITE
        c.poly([(u, 0.8, 21), (u + 0.113, 0.8, 21), (u + 0.113, 0.98, 16), (u, 0.98, 16)], col)
    prism(c, 0.18, 0.18, 0.82, 0.82, 18, 22, shade(COMPUTE, 0.9), rim=0, ao=False)
    # a lightning sign on the roof (quick)
    x, y = c.P(0.5, 0.5, 22)
    c.d.polygon([(x + 1, y - 14), (x - 4, y - 6), (x, y - 6), (x - 2, y), (x + 4, y - 9), (x, y - 9)], fill=A((255, 214, 60)))
    c.ld.polygon([(x + 1, y - 14), (x - 4, y - 6), (x, y - 6), (x - 2, y), (x + 4, y - 9), (x, y - 9)], fill=A((255, 220, 110)))
    glow(c, x, y - 7, 8, (255, 220, 110), 60)
    star(c, x + 9, y - 12)
    return c


def signpost():
    c = Kit(1, 1, 56)
    drum_shadow(c, 0.5, 0.5, 0.2, 60)
    drum(c, 0.5, 0.5, 0, 3, 0.16, STONE)
    prism(c, 0.46, 0.46, 0.54, 0.54, 3, 40, WOOD, rim=0)
    x, y = c.P(0.5, 0.5, 0)
    # three arrow boards, pointing different ways
    for k, (dirx, yy, w) in enumerate(((-1, 34, 14), (1, 27, 13), (-1, 20, 11))):
        top = y - yy
        col = shade(NETWORK, 1.0 + 0.1 * (k % 2))
        if dirx < 0:
            pts = [(x + 2, top), (x - w + 3, top), (x - w, top + 2), (x - w + 3, top + 5), (x + 2, top + 5)]
        else:
            pts = [(x - 2, top), (x + w - 3, top), (x + w, top + 2), (x + w - 3, top + 5), (x - 2, top + 5)]
        c.d.polygon(pts, fill=A(col))
        c.d.line([pts[0], pts[1]], fill=A(shade(col, 1.3)))
        for i in range(3):
            px(c, x + dirx * (3 + i * 3), top + 2, WHITE)
    # a small globe on top
    gx, gy = x, y - 45
    c.d.ellipse((gx - 4, gy - 4, gx + 4, gy + 4), fill=A((80, 160, 230)))
    c.d.ellipse((gx - 3, gy - 3, gx, gy), fill=A((110, 200, 110)))
    c.d.ellipse((gx - 4, gy - 4, gx + 4, gy + 4), outline=A(WHITE))
    glow(c, gx, gy, 6, (170, 220, 255), 80)
    star(c, gx + 7, gy - 3)
    return c


def lockbox():
    c = Kit(1, 1, 44)
    ground_shadow(c, 0.2, 0.2, 0.8, 0.8)
    prism(c, 0.2, 0.2, 0.8, 0.8, 0, 5, STONE)
    # the strongbox (S3 green) with straps
    prism(c, 0.26, 0.26, 0.74, 0.74, 5, 21, STORAGE, roofcol=shade(STORAGE, 1.05))
    for t in (0.36, 0.64):
        c.lface(0.74, t - 0.02, t + 0.02, 5, 21, shade(STORAGE, 0.6))
        c.rface(0.74, t - 0.02, t + 0.02, 5, 21, shade(STORAGE, 0.5))
    c.line((0.26, 0.74, 15), (0.74, 0.74, 15), shade(STORAGE, 0.55))
    c.line((0.74, 0.74, 15), (0.74, 0.26, 15), shade(STORAGE, 0.45))
    # the padlock (KMS red) hanging on the front
    x, y = c.P(0.5, 0.74, 12)
    c.d.arc((x - 3, y - 9, x + 3, y - 1), 180, 360, fill=A(STEEL_M), width=2)
    c.d.rectangle((x - 4, y - 5, x + 4, y + 2), fill=A(SECURITY))
    c.d.line([(x - 4, y - 5), (x + 4, y - 5)], fill=A(shade(SECURITY, 1.3)))
    c.d.point([(x, y - 2), (x, y - 1)], fill=A(GOLD_L))
    c.ld.point([(x, y - 2), (x, y - 1)], fill=A(GOLD_L))
    glow(c, x, y - 1, 3, GOLD_L, 90)
    # a key on the lid
    kx, ky = c.P(0.5, 0.5, 21)
    ell(c, kx - 4, ky, 2, 2, GOLD)
    c.d.line([(kx - 2, ky), (kx + 5, ky)], fill=A(GOLD))
    c.d.point([(kx + 4, ky + 1), (kx + 2, ky + 1)], fill=A(GOLD))
    star(c, kx + 10, ky - 8)
    return c


def hub_bridge():
    c = Kit(2, 2, 52)
    lawn(c, 0.04, 0.04, 1.96, 1.96, "hub-lawn")
    # the pond
    ellipse(c, 1.0, 1.0, 0, 0.86, shade(STONE, 0.9), rim=False)
    ellipse(c, 1.0, 1.0, 0, 0.8, POOL, light=(90, 150, 220, 40))
    x, y = c.P(1.0, 1.0, 0)
    r = seeded("hub-ripples")
    for _ in range(10):
        xx, yy = x - 28 + r(56), y - 12 + r(24)
        if ((xx - x) / 28) ** 2 + ((yy - y) / 13) ** 2 < 0.8:
            c.d.line([(xx, yy), (xx + 2, yy)], fill=A((170, 220, 245)))
    # four footbridges to the VPC landings at the corners
    for (u0, v0, u1, v1) in ((0.2, 0.92, 0.75, 1.08), (1.25, 0.92, 1.8, 1.08), (0.92, 0.2, 1.08, 0.75), (0.92, 1.25, 1.08, 1.8)):
        prism(c, u0, v0, u1, v1, 0, 3, WOOD, roofcol=shade(WOOD, 1.06), rim=0)
    for (u, v) in ((0.2, 1.0), (1.8, 1.0), (1.0, 0.2), (1.0, 1.8)):
        prism(c, u - 0.14, v - 0.14, u + 0.14, v + 0.14, 0, 3, shade(NETWORK, 1.25), rim=0)
    # the hub pavilion: a round island, posts and a purple cone roof
    drum(c, 1.0, 1.0, 0, 4, 0.3, STONE)
    for k in range(6):
        a = k * math.pi / 3 + 0.4
        u, v = 1.0 + math.cos(a) * 0.2, 1.0 + math.sin(a) * 0.2
        if u + v < 2.0:
            pole(c, u, v, 4, 20, WHITE, w=0.02)
    drum(c, 1.0, 1.0, 4, 6, 0.1, GOLD)
    for k in range(6):
        a = k * math.pi / 3 + 0.4
        u, v = 1.0 + math.cos(a) * 0.2, 1.0 + math.sin(a) * 0.2
        if u + v >= 2.0:
            pole(c, u, v, 4, 20, WHITE, w=0.02)
    drum(c, 1.0, 1.0, 20, 32, 0.34, NETWORK, r1=0.02, cap=False)
    x, y = c.P(1.0, 1.0, 32)
    c.d.line([(x, y), (x, y - 5)], fill=A(STEEL))
    bulb(c, x, y - 6, (220, 200, 255))
    for k in range(7):
        a = k * math.pi / 6
        bulb(c, x + round(math.cos(a) * 15), y + 12 + round(math.sin(a) * 6), BULB)
    star(c, x + 10, y - 6)
    return c


def reading_room():
    c = Kit(1, 1, 48)
    ground_shadow(c, 0.18, 0.18, 0.82, 0.82)
    shelves = (DATABASE, ORANGE, (90, 150, 230), STORAGE, SECURITY, (255, 204, 60))

    def books(i, n, z, h, base, side):
        if side != "L" or not (5 <= z <= 17) or not (2 <= i < n - 2):
            return None
        if z in (5, 11, 17):
            return (WOOD_D, None)
        return (shade(shelves[(i // 2 + z // 6) % len(shelves)], 0.9 if (i % 2) else 1.0), None)

    prism(c, 0.2, 0.2, 0.8, 0.8, 0, 22, (232, 226, 210), L=books, roofcol=shade(STORAGE, 0.9))
    # a green pitched roof (storage) with a little lantern
    c.gable(0.16, 0.16, 0.84, 0.84, 22, 10, STORAGE)
    x, y = c.P(0.5, 0.84, 18)
    c.ld.rectangle((x - 9, y - 12, x + 7, y + 4), fill=A(BULB, 40))
    # a reading lamp and a bench in front
    bench(c, 0.5, 0.92, along_u=True)
    lamp(c, 0.88, 0.88, 22)
    # a little magnifier sign (a query) on the right face
    x, y = c.P(0.8, 0.5, 14)
    c.d.ellipse((x - 3, y - 3, x + 3, y + 3), outline=A(WHITE))
    c.d.line([(x + 2, y + 2), (x + 5, y + 5)], fill=A(WHITE))
    c.ld.ellipse((x - 2, y - 2, x + 2, y + 2), fill=A((200, 230, 255), 120))
    x, y = c.P(0.5, 0.5, 32)
    star(c, x + 6, y - 6)
    return c


def robot_workshop():
    c = Kit(1, 1, 46)
    ground_shadow(c, 0.16, 0.16, 0.84, 0.84)
    paving(c, 0.14, 0.14, 0.86, 0.86, key="robots", h=1)
    # the workbench (AI teal)
    prism(c, 0.22, 0.24, 0.78, 0.5, 1, 10, AIML, roofcol=shade(AIML, 1.1))
    for k in range(3):
        x, y = c.P(0.3 + k * 0.18, 0.37, 10)
        c.d.rectangle((x - 1, y - 2, x + 1, y), fill=A(STEEL_M if k != 1 else GOLD))
    # the robot: a round body, a head with lit eyes, little arms
    x, y = c.P(0.55, 0.72, 0)
    ell(c, x, y - 1, 5, 2, (40, 50, 70))
    c.d.rectangle((x - 4, y - 13, x + 4, y - 3), fill=A(STEEL))
    c.d.rectangle((x + 1, y - 13, x + 4, y - 3), fill=A(STEEL_M))
    c.d.rectangle((x - 2, y - 9, x + 2, y - 6), fill=A(AIML))
    c.d.rectangle((x - 3, y - 20, x + 3, y - 14), fill=A(STEEL))
    c.d.rectangle((x + 1, y - 20, x + 3, y - 14), fill=A(STEEL_M))
    for ex in (x - 2, x + 1):
        px(c, ex, y - 17, (120, 255, 230), (120, 255, 230))
    c.d.line([(x, y - 20), (x, y - 23)], fill=A(STEEL_D))
    px(c, x, y - 24, SECURITY, SECURITY)
    c.d.line([(x - 5, y - 11), (x - 8, y - 15)], fill=A(STEEL_M))
    c.d.line([(x + 5, y - 11), (x + 7, y - 7)], fill=A(STEEL_M))
    # the idea bulb (a model on Bedrock) the robot holds up
    bx, by = x - 9, y - 21
    ell(c, bx, by, 4, 4, (255, 236, 150))
    c.d.rectangle((bx - 1, by + 4, bx + 1, by + 5), fill=A(STEEL_M))
    c.d.point([(bx - 1, by - 2)], fill=A(WHITE))
    glow(c, bx, by, 8, (255, 236, 150), 110)
    c.ld.ellipse((bx - 4, by - 4, bx + 4, by + 4), fill=A((255, 240, 170)))
    star(c, bx + 18, by - 6)
    return c


def container_yard():
    c = Kit(1, 1, 56)
    ground_shadow(c, 0.1, 0.1, 0.9, 0.9)
    paving(c, 0.08, 0.08, 0.92, 0.92, key="yard", h=1, col=(176, 172, 166))

    def ribs(i, n, z, h, base, side):
        return (shade(base, 0.82), None) if i % 3 == 0 else None

    prism(c, 0.14, 0.18, 0.86, 0.46, 1, 12, COMPUTE, L=ribs, R=ribs)
    prism(c, 0.14, 0.52, 0.86, 0.8, 1, 12, NAVY, L=ribs, R=ribs)
    prism(c, 0.3, 0.2, 0.86, 0.48, 12, 23, (80, 160, 210), L=ribs, R=ribs)
    # the gantry (Fargate: it lifts the boxes so you don't have to)
    for (u, v) in ((0.08, 0.92), (0.92, 0.08)):
        prism(c, u - 0.03, v - 0.03, u + 0.03, v + 0.03, 1, 40, COMPUTE, rim=0)
    xa, ya = c.P(0.08, 0.92, 40)
    xb, _ = c.P(0.92, 0.08, 40)
    c.d.rectangle((xa - 1, ya - 3, xb + 1, ya), fill=A(COMPUTE))
    c.d.line([(xa - 1, ya - 3), (xb + 1, ya - 3)], fill=A(shade(COMPUTE, 1.3)))
    for x in range(xa + 2, xb, 4):
        c.d.line([(x, ya - 2), (x + 2, ya)], fill=A(ORANGE_D))
    tx = (xa + xb) // 2 + 4
    c.d.rectangle((tx - 2, ya, tx + 2, ya + 2), fill=A(NAVY_D))
    c.d.line([(tx, ya + 2), (tx, ya + 9)], fill=A(STEEL_D))
    c.d.rectangle((tx - 6, ya + 9, tx + 6, ya + 14), fill=A(STORAGE))
    c.d.rectangle((tx - 6, ya + 9, tx + 6, ya + 9), fill=A(shade(STORAGE, 1.3)))
    bulb(c, xa, ya - 4, (255, 120, 80))
    bulb(c, xb, ya - 4, (255, 120, 80))
    star(c, tx + 10, ya - 8)
    return c


def key_cabinet():
    c = Kit(1, 1, 46)
    ground_shadow(c, 0.14, 0.14, 0.86, 0.86, alpha=60)
    paving(c, 0.12, 0.12, 0.88, 0.88, key="keys", h=1)
    # the key cabinet (Secrets Manager red) on two legs, its glass front showing the keys
    for u in (0.2, 0.56):
        prism(c, u - 0.03, 0.56, u + 0.03, 0.62, 1, 12, STEEL_D, rim=0)
    prism(c, 0.14, 0.4, 0.62, 0.64, 12, 36, SECURITY, roofcol=shade(SECURITY, 0.85))
    c.lface(0.64, 0.18, 0.58, 15, 33, (58, 30, 42))
    for k in range(4):
        for j in range(2):
            x, y = c.P(0.22 + k * 0.1, 0.64, 31 - j * 8)
            c.d.point([(x, y)], fill=A(STEEL))
            c.d.point([(x, y + 2), (x, y + 3), (x - 1, y + 4), (x + 1, y + 4), (x, y + 5)], fill=A(GOLD))
            c.ld.point([(x, y + 4)], fill=A(GOLD_L))
    c.lface(0.64, 0.18, 0.58, 32, 33, (120, 70, 90))
    # the database (RDS magenta disks) beside it, with a rotation arrow: it changes the password for you
    for k in range(3):
        drum(c, 0.72, 0.3, 1 + k * 7, 7 + k * 7, 0.15, DATABASE)
    x, y = c.P(0.72, 0.3, 26)
    c.d.arc((x - 5, y - 9, x + 5, y - 1), 200, 500, fill=A(WHITE))
    c.d.point([(x + 4, y - 7), (x + 5, y - 6), (x + 3, y - 6)], fill=A(WHITE))
    c.ld.arc((x - 5, y - 9, x + 5, y - 1), 200, 500, fill=A((255, 220, 250), 150))
    tx, ty = c.P(0.38, 0.52, 36)
    star(c, tx - 4, ty - 6)
    return c


def watch_bell():
    c = Kit(1, 1, 60)
    ground_shadow(c, 0.22, 0.22, 0.78, 0.78)
    prism(c, 0.24, 0.24, 0.76, 0.76, 0, 6, STONE)
    for (u, v) in ((0.3, 0.3), (0.7, 0.3), (0.3, 0.7)):
        prism(c, u - 0.04, v - 0.04, u + 0.04, v + 0.04, 6, 36, SECURITY, rim=0)
    # the bell (gold) under the roof
    x, y = c.P(0.5, 0.5, 34)
    c.d.polygon([(x - 6, y + 11), (x + 6, y + 11), (x + 4, y + 2), (x + 2, y - 1), (x - 2, y - 1), (x - 4, y + 2)], fill=A(GOLD))
    c.d.polygon([(x - 6, y + 11), (x - 1, y + 11), (x - 2, y - 1), (x - 4, y + 2)], fill=A(GOLD_L))
    c.d.line([(x - 6, y + 11), (x + 6, y + 11)], fill=A(shade(GOLD, 0.7)))
    px(c, x, y + 12, shade(GOLD, 0.6))
    c.d.line([(x, y - 1), (x, y - 4)], fill=A(STEEL_D))
    prism(c, 0.66, 0.66, 0.74, 0.74, 6, 36, SECURITY, rim=0)
    prism(c, 0.22, 0.22, 0.78, 0.78, 36, 39, shade(SECURITY, 0.8), rim=0, ao=False)
    c.pyramid(0.22, 0.22, 0.78, 0.78, 39, 12, shade(SECURITY, 1.05))
    x, y = c.P(0.5, 0.5, 51)
    c.d.line([(x, y), (x, y - 4)], fill=A(STEEL))
    # the lantern hanging from the front post (a finding lights it)
    lx, ly = c.P(0.7, 0.72, 30)
    c.d.line([(lx, ly - 2), (lx + 3, ly - 2)], fill=A(STEEL_D))
    c.d.rectangle((lx + 2, ly - 1, lx + 5, ly + 4), fill=A(NAVY_D))
    c.d.rectangle((lx + 3, ly, lx + 4, ly + 3), fill=A(BULB))
    glow(c, lx + 3, ly + 1, 5, BULB, 120)
    c.ld.rectangle((lx + 3, ly, lx + 4, ly + 3), fill=A(BULB))
    star(c, x + 8, y - 4)
    return c


def search_lantern():
    c = Kit(1, 1, 60)
    drum_shadow(c, 0.5, 0.5, 0.22, 60)
    drum(c, 0.5, 0.5, 0, 6, 0.2, DATABASE)
    drum(c, 0.5, 0.5, 6, 9, 0.14, STONE)
    pole(c, 0.5, 0.5, 9, 40, NAVY, w=0.04)
    x, y = c.P(0.5, 0.5, 40)
    # the lens: a ring (OpenSearch's database magenta) with a glowing glass, and a handle
    cx, cy = x + 2, y - 9
    c.d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=A(shade(DATABASE, 0.75)))
    c.d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=A((180, 226, 250)))
    c.d.ellipse((cx - 5, cy - 5, cx - 1, cy - 1), fill=A(WHITE))
    c.d.arc((cx - 8, cy - 8, cx + 8, cy + 8), 120, 250, fill=A(shade(DATABASE, 1.2)))
    c.d.line([(x - 1, y), (cx - 4, cy + 6)], fill=A(NAVY), width=2)
    glow(c, cx, cy, 12, (200, 236, 255), 70)
    c.ld.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=A((210, 240, 255)))
    star(c, cx + 11, cy - 8)
    return c


def express_lane():
    c = Kit(1, 1, 50)
    # a lane running along u, orange chevrons pointing down it
    c.poly([(0.0, 0.26, 0), (1.0, 0.26, 0), (1.0, 0.74, 0), (0.0, 0.74, 0)], (64, 70, 86))
    c.line((0.0, 0.26, 0), (1.0, 0.26, 0), WHITE)
    c.line((0.0, 0.74, 0), (1.0, 0.74, 0), WHITE)
    for k in range(3):
        u = 0.12 + k * 0.3
        a, b, m = c.P(u, 0.36), c.P(u, 0.64), c.P(u + 0.12, 0.5)
        c.d.line([a, m, b], fill=A(ORANGE), width=2)
        c.ld.line([a, m, b], fill=A((255, 180, 80), 150))
    # the EC2 server cabinet at the lane's far end, its LEDs green
    prism(c, 0.04, 0.32, 0.22, 0.68, 0, 16, COMPUTE)
    for z in (4, 8, 12):
        for v in (0.42, 0.58):
            xx, yy = c.P(0.22, v, z)
            px(c, xx, yy, (120, 255, 170), (120, 255, 170))
    # the purple gantry across the lane, lit arrows on its sign
    for v in (0.16, 0.84):
        prism(c, 0.52, v - 0.04, 0.6, v + 0.04, 0, 34, NETWORK, rim=0)
    prism(c, 0.52, 0.12, 0.6, 0.88, 26, 36, NETWORK, roofcol=shade(NETWORK, 1.25), rim=0)
    for k in range(3):
        v = 0.26 + k * 0.22
        x, y = c.P(0.6, v, 31)
        c.d.line([(x - 2, y - 2), (x, y), (x - 2, y + 2)], fill=A((120, 255, 170)))
        c.ld.line([(x - 2, y - 2), (x, y), (x - 2, y + 2)], fill=A((140, 255, 190)))
    x, y = c.P(0.56, 0.5, 36)
    star(c, x + 6, y - 8)
    return c


def live_board():
    c = Kit(1, 1, 56)
    ground_shadow(c, 0.3, 0.3, 0.7, 0.7, alpha=60)
    prism(c, 0.36, 0.36, 0.64, 0.64, 0, 3, STONE)
    x, y = c.P(0.5, 0.5, 3)
    c.d.rectangle((x - 9, y - 18, x - 8, y), fill=A(NAVY))
    c.d.rectangle((x + 7, y - 18, x + 8, y), fill=A(shade(NAVY, 0.8)))
    # the board faces the viewer, framed in management pink, a grid of live tiles
    bx0, by0, bx1, by1 = x - 15, y - 40, x + 15, y - 18
    c.d.rectangle((bx0, by0, bx1, by1), fill=A(MANAGE))
    c.d.line([(bx0, by0), (bx1, by0)], fill=A(shade(MANAGE, 1.3)))
    c.d.line([(bx1, by0), (bx1, by1)], fill=A(shade(MANAGE, 0.75)))
    c.d.rectangle((bx0 + 2, by0 + 2, bx1 - 2, by1 - 2), fill=A((24, 30, 44)))
    r = seeded("live-board")
    cols = ((110, 240, 150), (255, 200, 80), (120, 200, 255), (255, 120, 180))
    for j in range(3):
        for i in range(5):
            tx, ty = bx0 + 4 + i * 5, by0 + 4 + j * 6
            if r(5):
                col = cols[r(len(cols))]
                c.d.rectangle((tx, ty, tx + 3, ty + 3), fill=A(col))
                c.ld.rectangle((tx, ty, tx + 3, ty + 3), fill=A(col))
    # an antenna (subscriptions) with rings
    ax, ay = bx1 - 3, by0
    c.d.line([(ax, ay), (ax, ay - 8)], fill=A(STEEL))
    px(c, ax, ay - 9, MANAGE, (255, 140, 200))
    for k, rr in enumerate((3, 6)):
        c.ld.arc((ax - rr, ay - 9 - rr, ax + rr, ay - 9 + rr), 200, 340, fill=A((255, 160, 210), 160 - k * 50))
    star(c, bx0 - 2, by0 - 4)
    return c


def blueprint_stand():
    c = Kit(1, 1, 52)
    ground_shadow(c, 0.25, 0.3, 0.75, 0.7, alpha=60)
    # easel legs (management pink)
    x, y = c.P(0.5, 0.55, 0)
    c.d.line([(x - 9, y + 2), (x - 3, y - 36)], fill=A(MANAGE), width=2)
    c.d.line([(x + 9, y + 2), (x + 3, y - 36)], fill=A(shade(MANAGE, 0.8)), width=2)
    c.d.line([(x, y - 2), (x + 1, y - 30)], fill=A(shade(MANAGE, 0.65)))
    # the blueprint: an organization tree (one root, three accounts, each with a stack)
    bx0, by0, bx1, by1 = x - 13, y - 40, x + 13, y - 18
    c.d.rectangle((bx0, by0, bx1, by1), fill=A(BLUEPRINT))
    c.d.rectangle((bx0, by0, bx1, by0), fill=A(shade(BLUEPRINT, 1.3)))
    c.d.line([(bx0 - 1, by1 + 1), (bx1 + 1, by1 + 1)], fill=A(WOOD_D), width=2)
    rx, ry = x, by0 + 4
    c.d.rectangle((rx - 2, ry - 1, rx + 2, ry + 1), fill=A(WHITE))
    c.d.line([(rx, ry + 2), (rx, ry + 5)], fill=A(WHITE))
    c.d.line([(rx - 8, ry + 5), (rx + 8, ry + 5)], fill=A(WHITE))
    for dx in (-8, 0, 8):
        c.d.line([(rx + dx, ry + 5), (rx + dx, ry + 8)], fill=A(WHITE))
        c.d.rectangle((rx + dx - 2, ry + 9, rx + dx + 2, ry + 11), fill=A((200, 230, 255)))
        c.d.rectangle((rx + dx - 2, ry + 13, rx + dx + 2, ry + 14), fill=A((255, 200, 120)))
        c.ld.rectangle((rx + dx - 2, ry + 13, rx + dx + 2, ry + 14), fill=A((255, 210, 140)))
    # a little stack of crates beside (the stacks it sets up)
    prism(c, 0.72, 0.18, 0.92, 0.38, 0, 7, (214, 170, 112))
    prism(c, 0.74, 0.2, 0.9, 0.36, 7, 13, (196, 150, 96))
    star(c, bx1 + 5, by0 - 3)
    return c


DRAW = {
    "edge-arch": edge_arch, "event-plaza": event_plaza, "stream-fountain": stream_fountain, "vault-garden": vault_garden,
    "mail-chute": mail_chute, "signal-tower": signal_tower, "ticket-gate": ticket_gate, "quick-pick": quick_pick,
    "signpost": signpost, "lockbox": lockbox, "hub-bridge": hub_bridge, "reading-room": reading_room,
    "robot-workshop": robot_workshop, "container-yard": container_yard, "key-cabinet": key_cabinet,
    "watch-bell": watch_bell, "search-lantern": search_lantern, "express-lane": express_lane,
    "live-board": live_board, "blueprint-stand": blueprint_stand,
}


def combos():
    with open(os.path.join(ROOT, "shared", "combos.json")) as f:
        return json.load(f)["combos"]


def build(add):
    for cb in combos():
        if cb["id"] not in DRAW:
            raise KeyError(f"shared/combos.json: no drawer for combo {cb['id']} in art/tiles/combos_art.py")
        c = DRAW[cb["id"]]()
        if (c.fw, c.fh) != tuple(cb["size"]):
            raise ValueError(f"combo:{cb['id']}: drawn on {c.fw}x{c.fh}, combos.json says {cb['size']}")
        if cb["sprite"] != f"combo:{cb['id']}":
            raise ValueError(f"combo {cb['id']}: sprite must be combo:{cb['id']}")
        add(cb["sprite"], c)


def sheet(sprites, items, path, per=8, cw=120, ch=150, scale=2, title=None, night=True):
    """A contact sheet: each (name, n, label) on an n x n patch of grass, by day then by night."""
    from preview_services import ground, night as dark
    rows = (len(items) + per - 1) // per
    head = 18 if title else 0
    img = Image.new("RGBA", (cw * per, head + ch * rows * (2 if night else 1)), (13, 8, 22, 255))
    d = ImageDraw.Draw(img)
    if title:
        d.text((6, 4), title, fill=(255, 230, 170, 255))
    for i, (name, n, label) in enumerate(items):
        pic, (ax, ay) = sprites[name]
        lit = sprites.get(name + "@lights")
        for j, im in enumerate((pic, dark(pic, lit, (ax, ay))) if night else (pic,)):
            gx = (i % per) * cw + cw // 2
            top = head + (i // per + j * rows) * ch + ch - 22 - 16 * n
            ground(img, sprites, gx, top, n)
            img.alpha_composite(im, (gx - ax, top - ay))
            d.text(((i % per) * cw + 4, head + (i // per + j * rows) * ch + ch - 14), label, fill=(255, 230, 170, 255))
    img.resize((img.width * scale, img.height * scale), Image.NEAREST).save(path)


def preview(sprites, path):
    """.cache/art/combos-preview.png: every combo on its footprint, by day then by night, x2."""
    sheet(sprites, [(cb["sprite"], cb["size"][0], cb["id"]) for cb in combos()], path, per=7, cw=130, ch=160)
