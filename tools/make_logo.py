"""Logo final de NimbookGR + todos los derivados (PNG, ICO, maskable)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "logo")
os.makedirs(OUT, exist_ok=True)

BLUE = (8, 102, 255, 255)   # #0866FF
WHITE = (255, 255, 255, 255)
S, SS = 1024, 4


def circle(size=S, color=BLUE):
    img = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=color)
    return img


def geometric_n(img, stem_ratio=0.125, height_ratio=0.545, diag_ratio=0.73, radius=0.5, dy=0.0):
    """Letra N de marca: patas rectas con remates redondeados y diagonal gruesa."""
    d = ImageDraw.Draw(img)
    W, H = img.width, img.height
    stem = W * stem_ratio
    h = H * height_ratio
    width = h * 0.80
    x0 = (W - width) / 2
    y0 = (H - h) / 2 + dy * H
    y1 = y0 + h
    x1 = x0 + width
    r = stem * radius

    # patas
    d.rounded_rectangle([x0, y0, x0 + stem, y1], radius=r, fill=WHITE)
    d.rounded_rectangle([x1 - stem, y0, x1, y1], radius=r, fill=WHITE)

    # diagonal (de la pata izquierda arriba a la pata derecha abajo)
    dw = stem * diag_ratio
    p0 = (x0 + stem / 2, y0 + stem / 2)
    p1 = (x1 - stem / 2, y1 - stem / 2)
    d.line([p0, p1], fill=WHITE, width=int(round(dw)), joint="curve")
    for cx, cy in (p0, p1):
        d.ellipse([cx - dw / 2, cy - dw / 2, cx + dw / 2, cy + dw / 2], fill=WHITE)
    return img


master = geometric_n(circle())
master_flat = master.resize((S, S), Image.LANCZOS)


def save_png(img, name, size, bg=None):
    im = img.resize((size, size), Image.LANCZOS)
    if bg is not None:
        flat = Image.new("RGBA", im.size, bg)
        flat.alpha_composite(im)
        im = flat
    path = os.path.join(OUT, name)
    im.save(path, "PNG", optimize=True)
    print(f"  {name:26s} {size}x{size}  {os.path.getsize(path)/1024:7.1f} KB")


print("Logo NimbookGR:")
save_png(master_flat, "nimbook-logo.png", 1024)
save_png(master_flat, "nimbook-logo-512.png", 512)
save_png(master_flat, "nimbook-logo-256.png", 256)
save_png(master_flat, "nimbook-logo-192.png", 192)
save_png(master_flat, "nimbook-logo-128.png", 128)
save_png(master_flat, "nimbook-logo-64.png", 64)
save_png(master_flat, "apple-touch-icon.png", 180, bg=WHITE)
save_png(master_flat, "favicon-32.png", 32)
save_png(master_flat, "favicon-16.png", 16)

# favicon.ico multi-resolución
ico = os.path.join(OUT, "favicon.ico")
master_flat.resize((256, 256), Image.LANCZOS).save(
    ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(f"  favicon.ico                multi     {os.path.getsize(ico)/1024:7.1f} KB")

# maskable (safe zone 80% => logo al 78% con fondo lleno)
mask = Image.new("RGBA", (S * SS, S * SS), BLUE)
mask.alpha_composite(master.resize((int(S * SS * 0.78), int(S * SS * 0.78)), Image.LANCZOS),
                     (int(S * SS * 0.11), int(S * SS * 0.11)))
save_png(mask, "maskable-512.png", 512)

# variante monocromática blanca (para fondos de color)
mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
mono.alpha_composite(master_flat)
px = mono.load()
for y in range(S):
    for x in range(S):
        r, g, b, a = px[x, y]
        if a and b > 200 and r < 120:      # píxeles azules -> blancos
            px[x, y] = (255, 255, 255, a)
save_png(mono, "nimbook-n-white.png", 512)

# hoja de legibilidad en tamaños pequeños
sheet = Image.new("RGB", (760, 260), (240, 242, 245))
x = 20
for size in (128, 64, 48, 32, 24, 16):
    im = master_flat.resize((size, size), Image.LANCZOS).convert("RGB")
    sheet.paste(im, (x, 20))
    x += size + 28
x = 20
for size in (128, 64, 48, 32, 24, 16):
    im = master_flat.resize((size, size), Image.LANCZOS)
    bgc = Image.new("RGB", (size, size), (255, 255, 255))
    bgc.paste(im, (0, 0), im)
    sheet.paste(bgc, (x, 170))
    x += size + 28
sheet.save(os.path.join(OUT, "_sizes.png"))
print("ok")
