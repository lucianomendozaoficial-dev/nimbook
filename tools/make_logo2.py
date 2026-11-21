"""Logo de NimbookGR v2: squircle con degradado azul y N blanca."""
import os
import math
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "logo")
os.makedirs(OUT, exist_ok=True)

S, SS = 1024, 4
BLUE_TOP = (30, 139, 255)
BLUE_BOTTOM = (5, 82, 214)
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def squircle_mask(size, radius_ratio=0.235):
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    return img


def gradient(size):
    w, h = size
    base = Image.new("RGB", (w, h))
    px = base.load()
    for y in range(h):
        t = y / (h - 1)
        color = lerp(BLUE_TOP, BLUE_BOTTOM, t ** 0.92)
        for x in range(w):
            # un leve barrido diagonal
            tt = min(1.0, max(0.0, (t * 0.82 + (x / (w - 1)) * 0.18)))
            px[x, y] = lerp(BLUE_TOP, BLUE_BOTTOM, tt ** 0.9)
    return base


def draw_n(img, stem_ratio=0.148, height_ratio=0.520, diag_ratio=0.76, radius=0.5):
    d = ImageDraw.Draw(img)
    W, H = img.size
    h = H * height_ratio
    w = h * 0.78
    t = W * stem_ratio
    x0, y0 = (W - w) / 2, (H - h) / 2 + H * 0.006
    x1, y1 = x0 + w, y0 + h
    r = t * radius
    d.rounded_rectangle([x0, y0, x0 + t, y1], radius=r, fill=WHITE)
    d.rounded_rectangle([x1 - t, y0, x1, y1], radius=r, fill=WHITE)
    dw = t * diag_ratio
    p0 = (x0 + t / 2, y0 + t / 2)
    p1 = (x1 - t / 2, y1 - t / 2)
    d.line([p0, p1], fill=WHITE, width=int(round(dw)), joint="curve")
    for cx, cy in (p0, p1):
        d.ellipse([cx - dw / 2, cy - dw / 2, cx + dw / 2, cy + dw / 2], fill=WHITE)


def highlight(img):
    """Brillo suave arriba a la izquierda para dar volumen."""
    w, h = img.size
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse([-w * 0.25, -h * 0.55, w * 0.85, h * 0.55], fill=(255, 255, 255, 38))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.08))
    return Image.alpha_composite(img.convert("RGBA"), glow)


def build(radius_ratio=0.235):
    size = S * SS
    bg = gradient((size, size)).convert("RGBA")
    bg = highlight(bg)
    draw_n(bg)
    mask = squircle_mask(size, radius_ratio)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out.resize((S, S), Image.LANCZOS)


master = build()


def save(img, name, size, bg=None):
    im = img.resize((size, size), Image.LANCZOS)
    if bg is not None:
        flat = Image.new("RGBA", im.size, bg)
        flat.alpha_composite(im)
        im = flat
    im.save(os.path.join(OUT, name), "PNG", optimize=True)
    print(f"  {name:28s} {size}x{size}")


print("Logo NimbookGR v2:")
save(master, "nimbook-logo.png", 1024)
save(master, "nimbook-logo-512.png", 512)
save(master, "nimbook-logo-256.png", 256)
save(master, "nimbook-logo-192.png", 192)
save(master, "nimbook-logo-128.png", 128)
save(master, "nimbook-logo-64.png", 64)
save(master, "apple-touch-icon.png", 180, bg=(255, 255, 255))
save(master, "favicon-32.png", 32)
save(master, "favicon-16.png", 16)
master.resize((256, 256), Image.LANCZOS).save(
    os.path.join(OUT, "favicon.ico"), format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("  favicon.ico                  multi")

# maskable: logo al 78% sobre azul lleno
mask = Image.new("RGBA", (S, S), (*BLUE_BOTTOM, 255))
small = master.resize((int(S * 0.80), int(S * 0.80)), Image.LANCZOS)
mask.alpha_composite(small, (int(S * 0.10), int(S * 0.10)))
save(mask, "maskable-512.png", 512)

# variante solo la N en blanco (para fondos azules)
n_only = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw_n(n_only)
save(n_only, "nimbook-n-white.png", 512)

# hoja de tamaños
sheet = Image.new("RGB", (720, 240), (240, 242, 245))
x = 20
for size in (128, 96, 64, 48, 32, 24, 16):
    im = master.resize((size, size), Image.LANCZOS)
    sheet.paste(im, (x, 30), im)
    x += size + 26
sheet.save(os.path.join(OUT, "_sizes.png"))
print("ok")
