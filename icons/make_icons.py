"""Draws Palco's app icon as PNGs. Standard library only.
Design: glossy pitch-green gradient with diagonal mowing stripes, a bold white "P" with a soft shadow,
and a yellow ball (Palco's live colour) in the P's bowl. Everything sits inside the 80% safe zone,
so Android's round/squircle masks and iOS's rounded corners never cut the letter.
Run:  python icons/make_icons.py"""
import math
import os
import struct
import zlib

TOP, BOTTOM = (0x34, 0x9A, 0x60), (0x0C, 0x32, 0x1F)
YELLOW, YELLOW_LIGHT = (0xF2, 0xC2, 0x30), (0xFF, 0xE2, 0x80)
WHITE, MINT = (255, 255, 255), (222, 238, 228)

# The "P": a stem plus a ring (only its right half) joined to the stem by two bars.
CX, CY, R_OUT, R_IN = 0.475, 0.39, 0.215, 0.097
STEM_X0, STEM_X1, STEM_Y0, STEM_Y1 = 0.295, 0.43, CY - R_OUT, 0.80  # top flush with the ring
BALL_X, BALL_R = 0.502, 0.05  # centred in the bowl's hole (between the stem and the ring)
SHADOW = [(0.010, 0.016), (0.016, 0.024), (0.022, 0.030), (0.006, 0.010), (0.020, 0.018)]


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def in_p(x, y):
    if STEM_X0 <= x <= STEM_X1 and STEM_Y0 <= y <= STEM_Y1:
        # round the stem's bottom corners a little
        r = 0.035
        if y > STEM_Y1 - r and (x < STEM_X0 + r or x > STEM_X1 - r):
            cx = STEM_X0 + r if x < STEM_X0 + r else STEM_X1 - r
            return math.hypot(x - cx, y - (STEM_Y1 - r)) <= r
        return True
    d = math.hypot(x - CX, y - CY)
    if x >= CX and R_IN <= d <= R_OUT:
        return True
    return STEM_X1 - 0.01 <= x <= CX and (CY - R_OUT <= y <= CY - R_IN or CY + R_IN <= y <= CY + R_OUT)


def background(x, y):
    c = lerp(TOP, BOTTOM, min(1.0, max(0.0, (0.55 * x + y) / 1.45)))
    stripe = 1.06 if int((x + y) / 0.11) % 2 else 0.96          # diagonal mowing stripes
    gloss = max(0.0, 1 - math.hypot(x - 0.25, y - 0.1) / 0.8) * 0.09  # soft light from the top-left
    return tuple(min(255.0, v * stripe + 255 * gloss) for v in c)


def pixel(x, y):
    if in_p(x, y):
        return lerp(WHITE, MINT, max(0.0, (y - STEM_Y0) / (STEM_Y1 - STEM_Y0)))
    if math.hypot(x - BALL_X, y - CY) <= BALL_R:
        shine = max(0.0, 1 - math.hypot(x - (BALL_X - 0.02), y - (CY - 0.02)) / 0.045)
        return lerp(YELLOW, YELLOW_LIGHT, shine * 0.8)
    c = background(x, y)
    shade = sum(in_p(x - dx, y - dy) for dx, dy in SHADOW) / len(SHADOW)
    return tuple(v * (1 - 0.42 * shade) for v in c)


def png(size, path, ss=4):
    rows = bytearray()
    for py in range(size):
        rows.append(0)
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            rows += bytes(min(255, int(v / (ss * ss) + 0.5)) for v in acc)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)


here = os.path.dirname(os.path.abspath(__file__))
for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    png(size, os.path.join(here, name), ss=4 if size < 300 else 3)
    print('wrote', name)
