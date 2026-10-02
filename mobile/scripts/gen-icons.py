"""Generates simple brand icons (carrom board motif) as PNGs using only the standard library.
Run: python scripts/gen-icons.py   (replace the files in assets/ with real artwork any time)"""
import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(c for p in px[y * w:(y + 1) * w] for c in p) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def blend(dst, src):
    a = src[3] / 255
    return (int(dst[0] * (1 - a) + src[0] * a), int(dst[1] * (1 - a) + src[1] * a), int(dst[2] * (1 - a) + src[2] * a), max(dst[3], src[3]))

def render(size, bg, board_scale=0.74):
    px = [bg] * (size * size)
    c = size / 2
    half = size * board_scale / 2
    def put(x, y, col):
        if 0 <= x < size and 0 <= y < size: px[y * size + x] = blend(px[y * size + x], col)
    def circle(cx, cy, r, col, ring=None):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                d = math.hypot(x - cx, y - cy)
                if ring is None and d <= r: put(x, y, col)
                elif ring is not None and abs(d - r) <= ring: put(x, y, col)
    # frame + surface
    for y in range(size):
        for x in range(size):
            dx, dy = abs(x - c), abs(y - c)
            if dx <= half and dy <= half:
                inner = dx <= half * 0.9 and dy <= half * 0.9
                px[y * size + x] = (240, 207, 147, 255) if inner else (138, 79, 28, 255)
    # pockets, centre rings, coins
    for sx in (-1, 1):
        for sy in (-1, 1):
            circle(c + sx * half * 0.86, c + sy * half * 0.86, size * 0.055, (10, 10, 10, 255))
    circle(c, c, size * 0.20, (58, 36, 16, 255), ring=size * 0.006)
    circle(c, c, size * 0.12, (58, 36, 16, 255), ring=size * 0.005)
    for i in range(6):
        a = math.pi / 3 * i
        circle(c + math.cos(a) * size * 0.075, c + math.sin(a) * size * 0.075, size * 0.034, (20, 20, 20, 255) if i % 2 == 0 else (250, 248, 240, 255))
    circle(c, c, size * 0.034, (214, 40, 57, 255))
    circle(c + half * 0.45, c + half * 0.62, size * 0.048, (242, 183, 5, 255))
    return px

bg = (20, 17, 15, 255)
png(os.path.join(OUT, 'icon.png'), 1024, 1024, render(1024, bg))
png(os.path.join(OUT, 'adaptive-icon.png'), 1024, 1024, render(1024, (0, 0, 0, 0), 0.6))
png(os.path.join(OUT, 'splash-icon.png'), 512, 512, render(512, (0, 0, 0, 0), 0.9))
png(os.path.join(OUT, 'favicon.png'), 64, 64, render(64, bg, 0.9))
print('icons written')
