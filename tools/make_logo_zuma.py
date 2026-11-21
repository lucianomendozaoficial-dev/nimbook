"""Logo de Zuma: squircle azul iOS con una Z blanca."""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "logo")
os.makedirs(OUT, exist_ok=True)

S, SS = 1024, 4
TOP = (10, 132, 255)      # iOS blue
BOTTOM = (0, 82, 212)
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient(size):
    w, h = size
    base = Image.new("RGB", (w, h))
    px = base.load()
    for y in range(h):
        t = y / (h - 1)
        for x in range(w):
            tt = min(1.0, t * 0.85 + (x / (w - 1)) * 0.15)
            px[x, y] = lerp(TOP, BOTTOM, tt ** 0.92)
    return base


def squircle_mask(size, radius_ratio=0.235):
    img = Image.new("L", (size, size), 0)
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1],
                                          radius=int(size * radius_ratio), fill=255)
    return img


def highlight(img):
    w, h = img.size
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-w * 0.25, -h * 0.55, w * 0.85, h * 0.55],
                                 fill=(255, 255, 255, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.08))
    return Image.alpha_composite(img.convert("RGBA"), glow)


def draw_z(img):
    W, H = img.size
    L, R = W * 0.255, W * 0.745
    T, B = H * 0.255, H * 0.745
    t = W * 0.135
    d = t * 1.15
    points = [
        (L, T), (R, T), (R, T + t),
        (L + d, B - t),
        (R, B - t), (R, B), (L, B),
        (L, B - t),
        (R - d, T + t),
        (L, T + t),
    ]
    ImageDraw.Draw(img).polygon(points, fill=WHITE)


def build():
    size = S * SS
    bg = highlight(gradient((size, size)))
    draw_z(bg)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), squircle_mask(size))
    return out.resize((S, S), Image.LANCZOS)


master = build()


def save(img, name, size, bg=None):
    im = img.resize((size, size), Image.LANCZOS)
    if bg is not None:
        flat = Image.new("RGBA", im.size, bg)
        flat.alpha_composite(im)
        im = flat
    im.save(os.path.join(OUT, name), "PNG", optimize=True)
    print(f"  {name:26s} {size}x{size}")


print("Logo Zuma:")
save(master, "zuma-logo.png", 1024)
save(master, "zuma-logo-512.png", 512)
save(master, "zuma-logo-256.png", 256)
save(master, "zuma-logo-192.png", 192)
save(master, "zuma-logo-128.png", 128)
save(master, "zuma-logo-64.png", 64)
save(master, "zuma-apple-touch.png", 180, bg=(255, 255, 255))
save(master, "zuma-favicon-32.png", 32)
save(master, "zuma-favicon-16.png", 16)
master.resize((256, 256), Image.LANCZOS).save(
    os.path.join(OUT, "zuma-favicon.ico"), format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("  zuma-favicon.ico           multi")

mask = Image.new("RGBA", (S, S), (*BOTTOM, 255))
small = master.resize((int(S * 0.80), int(S * 0.80)), Image.LANCZOS)
mask.alpha_composite(small, (int(S * 0.10), int(S * 0.10)))
save(mask, "zuma-maskable-512.png", 512)

sheet = Image.new("RGB", (720, 240), (240, 242, 245))
x = 20
for size in (128, 96, 64, 48, 32, 24, 16):
    im = master.resize((size, size), Image.LANCZOS)
    sheet.paste(im, (x, 30), im)
    x += size + 26
sheet.save(os.path.join(OUT, "_sizes_zuma.png"))
print("ok")
