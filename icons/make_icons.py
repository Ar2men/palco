"""Draws the app icon (mowed pitch + a P drawn as halfway line and half centre circle) as PNGs. Standard library only.
Run:  python icons/make_icons.py"""
import math, os, struct, zlib

A, B, W = (0x1F, 0x5A, 0x3A), (0x25, 0x69, 0x44), (255, 255, 255)

def pixel(x, y):  # x, y in 0..1
    base = A if int(x * 8) % 2 == 0 else B
    # halfway line + half the centre circle = a "P"
    r = math.hypot(x - 0.41, y - 0.385)
    stem = abs(x - 0.41) < 0.036 and 0.2 < y < 0.79
    bowl = x >= 0.41 and abs(r - 0.15) < 0.036
    chalk = stem or bowl
    return W if chalk else base

def png(size, path, ss=3):
    rows = bytearray()
    for py in range(size):
        rows.append(0)
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size)
                    acc = [a + b for a, b in zip(acc, c)]
            rows += bytes(v // (ss * ss) for v in acc)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

here = os.path.dirname(os.path.abspath(__file__))
for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    png(size, os.path.join(here, name))
    print('wrote', name)
