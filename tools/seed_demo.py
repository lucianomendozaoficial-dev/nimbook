"""Datos e imágenes de ejemplo de NimbookGR (solo para desarrollo local).

Uso:  python tools/seed_demo.py
Escribe en data/ y media/ con la estructura real de la app.
Para volver a empezar sin datos:  node tools/reset.mjs --wipe-media
"""
import base64
import hashlib
import io
import json
import math
import os
import random
from datetime import datetime, timedelta, timezone

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FONTS = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
random.seed(7)
np.random.seed(7)


# --------------------------------------------------------------------------- #
#  utilidades de imagen
# --------------------------------------------------------------------------- #
def font(size, bold=True):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    try:
        return ImageFont.truetype(os.path.join(FONTS, name), size)
    except Exception:
        return ImageFont.load_default()


def save_jpg(img, rel):
    path = os.path.join(BASE, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert("RGB").save(path, "JPEG", quality=88, optimize=True)
    return rel


def noise(img, amount=5):
    arr = np.asarray(img).astype(np.int16)
    arr += np.random.normal(0, amount, arr.shape).astype(np.int16)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def vgradient(size, top, bottom):
    w, h = size
    top = np.array(top, dtype=np.float32)
    bottom = np.array(bottom, dtype=np.float32)
    ramp = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    arr = top[None, None, :] * (1 - ramp) + bottom[None, None, :] * ramp
    arr = np.repeat(arr, w, axis=1)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def radial_glow(img, center, radius, color, strength=1.0):
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2) / max(radius, 1)
    alpha = np.clip(1 - dist, 0, 1) ** 2 * strength
    arr = np.asarray(img).astype(np.float32)
    col = np.array(color, dtype=np.float32)
    arr = arr * (1 - alpha[..., None]) + col[None, None, :] * alpha[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


# --------------------------------------------------------------------------- #
#  escenas
# --------------------------------------------------------------------------- #
def scene_sunset(size=(1200, 900)):
    w, h = size
    img = vgradient(size, (250, 170, 90), (60, 40, 90))
    img = radial_glow(img, (w * 0.68, h * 0.52), w * 0.5, (255, 205, 120), 0.9)
    d = ImageDraw.Draw(img, "RGBA")
    cx, cy, r = int(w * 0.68), int(h * 0.5), int(w * 0.075)
    for i in range(r, 0, -2):
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(255, 236, 180, 30 + int(70 * (1 - i / r))))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 244, 214, 235))
    for depth, color in ((0.0, (48, 34, 62)), (0.25, (30, 22, 44))):
        pts = [(0, h)]
        base = h * (0.62 + depth * 0.12)
        for x in range(-50, w + 60, 60):
            pts.append((x, base - abs(math.sin(x * 0.004 + depth * 5)) * h * (0.16 - depth * 0.05)))
        pts.append((w, h))
        d.polygon(pts, fill=color)
    d.rectangle([0, int(h * 0.78), w, h], fill=(40, 30, 60, 200))
    return noise(img.filter(ImageFilter.GaussianBlur(0.4)))


def scene_city(size=(1200, 900)):
    w, h = size
    img = vgradient(size, (12, 20, 44), (52, 34, 76))
    img = radial_glow(img, (w * 0.25, h * 0.22), w * 0.5, (70, 90, 150), 0.5)
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([w * 0.78, h * 0.1, w * 0.85, h * 0.17], fill=(240, 240, 220, 230))
    random.seed(3)
    x = -40
    while x < w + 40:
        bw = random.randint(70, 150)
        bh = random.randint(int(h * 0.22), int(h * 0.55))
        top = h - bh
        d.rectangle([x, top, x + bw, h], fill=(16, 18, 32, 240))
        for wy in range(top + 14, h - 10, 26):
            for wx in range(x + 12, x + bw - 12, 22):
                if random.random() > 0.45:
                    d.rectangle([wx, wy, wx + 9, wy + 13],
                                fill=(255, random.randint(190, 245), random.randint(120, 190), 215))
        x += bw + random.randint(6, 22)
    d.rectangle([0, int(h * 0.93), w, h], fill=(8, 9, 16, 255))
    return noise(img, 5)


def scene_sea(size=(1200, 900)):
    w, h = size
    horizon = int(h * 0.55)
    img = vgradient(size, (148, 208, 236), (250, 226, 186))
    img = radial_glow(img, (w * 0.3, horizon * 0.55), w * 0.42, (255, 246, 210), 0.6)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, horizon, w, h], fill=(30, 122, 158, 235))
    for i in range(40):
        y = horizon + i * (h - horizon) / 40
        d.line([(0, y), (w, y)], fill=(255, 255, 255, (40 + i) // 4), width=2)
    d.ellipse([w * 0.24, horizon * 0.42, w * 0.34, horizon * 0.42 + w * 0.1], fill=(255, 252, 235, 240))
    d.polygon([(0, h), (0, int(h * 0.88)), (int(w * 0.55), int(h * 0.9)), (w, int(h * 0.96)), (w, h)],
              fill=(226, 200, 158, 255))
    return noise(img, 4)


def scene_forest(size=(1200, 900)):
    w, h = size
    img = vgradient(size, (120, 168, 120), (18, 58, 44))
    img = radial_glow(img, (w * 0.72, h * 0.18), w * 0.5, (235, 240, 170), 0.5)
    d = ImageDraw.Draw(img, "RGBA")
    random.seed(11)
    for layer, (color, scale) in enumerate([((22, 62, 48, 190), 1.0), ((12, 40, 32, 230), 0.75)]):
        x = -60 * scale
        while x < w + 80:
            tw = random.randint(int(50 * scale), int(110 * scale))
            th = random.randint(int(h * 0.35 * scale), int(h * 0.7 * scale))
            top = random.randint(int(h * 0.05), int(h * 0.35))
            d.polygon([(x + tw / 2, top), (x, top + th), (x + tw, top + th)], fill=color)
            x += tw + random.randint(10, 40)
    d.rectangle([0, int(h * 0.9), w, h], fill=(18, 40, 32, 255))
    fog = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(fog).rectangle([0, int(h * 0.55), w, int(h * 0.9)], fill=(220, 235, 220, 40))
    img = Image.alpha_composite(img.convert("RGBA"), fog.filter(ImageFilter.GaussianBlur(30))).convert("RGB")
    return noise(img, 5)


def scene_food(size=(1200, 900)):
    w, h = size
    img = vgradient(size, (108, 74, 52), (72, 48, 34))
    d = ImageDraw.Draw(img, "RGBA")
    random.seed(5)
    for _ in range(140):
        x, y = random.randint(0, w), random.randint(0, h)
        d.line([(x, y), (x + random.randint(20, 90), y + random.randint(-6, 6))],
               fill=(90, 60, 42, 60), width=random.randint(1, 3))
    for (cx, cy, r) in ((w * 0.35, h * 0.45, w * 0.19), (w * 0.68, h * 0.62, w * 0.14)):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(240, 238, 232, 255))
        d.ellipse([cx - r * 0.82, cy - r * 0.82, cx + r * 0.82, cy + r * 0.82], fill=(226, 220, 208, 255))
    cx, cy, r = w * 0.68, h * 0.62, w * 0.09
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(58, 34, 22, 255))
    d.ellipse([cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55], fill=(150, 104, 70, 255))
    return noise(img.filter(ImageFilter.GaussianBlur(0.6)), 4)


def scene_abstract(size=(1200, 900), seed=1):
    w, h = size
    random.seed(seed)
    palette = random.choice([
        ((255, 118, 117), (9, 132, 227)),
        ((253, 203, 110), (214, 48, 49)),
        ((85, 239, 196), (0, 184, 148)),
        ((162, 155, 254), (108, 92, 231)),
    ])
    img = vgradient(size, palette[0], palette[1])
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(9):
        cx, cy = random.randint(0, w), random.randint(0, h)
        r = random.randint(60, 320)
        col = random.choice([(255, 255, 255), (20, 20, 40), palette[0], palette[1]])
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*col, random.randint(18, 60)))
    img = img.filter(ImageFilter.GaussianBlur(18))
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(5):
        x1, y1 = random.randint(0, w), random.randint(0, h)
        d.rounded_rectangle([x1, y1, x1 + random.randint(120, 420), y1 + random.randint(80, 300)],
                            radius=24, outline=(255, 255, 255, 90), width=3)
    return noise(img, 6)


def scene_cover(size=(1600, 600), seed=0):
    w, h = size
    random.seed(seed + 40)
    palettes = [((20, 90, 200), (120, 220, 255)), ((90, 40, 160), (240, 120, 200)),
                ((20, 130, 110), (180, 240, 200)), ((200, 80, 40), (255, 210, 140))]
    p = palettes[seed % len(palettes)]
    img = vgradient(size, p[0], p[1])
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(6):
        cx = int(w * (0.1 + 0.17 * i))
        cy = int(h * (0.3 + 0.4 * math.sin(i)))
        r = int(h * (0.5 + 0.2 * math.cos(i * 1.7)))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 22))
    return noise(img.filter(ImageFilter.GaussianBlur(14)), 5)


def avatar(name, idx, size=512):
    grad = [
        ((24, 119, 242), (66, 176, 255)),
        ((123, 77, 255), (176, 125, 255)),
        ((0, 168, 132), (91, 224, 181)),
        ((247, 177, 37), (255, 209, 102)),
        ((229, 72, 77), (255, 138, 141)),
        ((15, 143, 143), (79, 209, 209)),
    ][idx % 6]
    img = vgradient((size, size), grad[1], grad[0])
    img = radial_glow(img, (size * 0.28, size * 0.24), size * 0.7, (255, 255, 255), 0.22)
    d = ImageDraw.Draw(img, "RGBA")
    parts = [p for p in name.split() if p]
    letters = (parts[0][0] + parts[-1][0]).upper() if len(parts) > 1 else name[:2].upper()
    f = font(int(size * 0.36))
    box = d.textbbox((0, 0), letters, font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    d.text(((size - tw) / 2 - box[0], (size - th) / 2 - box[1] - size * 0.01), letters,
           font=f, fill=(255, 255, 255, 240))
    return noise(img, 3)


def story_img(scene_fn, rel):
    return save_jpg(scene_fn((720, 1280)), rel)


# --------------------------------------------------------------------------- #
#  contraseñas y fechas
# --------------------------------------------------------------------------- #
def pwd_record(password, iterations=150000):
    salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations, 32)
    return {
        "algo": "PBKDF2-SHA256",
        "iterations": iterations,
        "salt": base64.b64encode(salt).decode(),
        "hash": base64.b64encode(h).decode(),
    }


NOW = datetime.now(timezone.utc).replace(microsecond=0)


def iso(hours_ago=0, minutes_ago=0, days_ago=0):
    value = NOW - timedelta(hours=hours_ago, minutes=minutes_ago, days=days_ago)
    return value.isoformat().replace("+00:00", "Z")


def ts(hours_ago=0, minutes_ago=0, days_ago=0):
    value = NOW - timedelta(hours=hours_ago, minutes=minutes_ago, days=days_ago)
    return int(value.timestamp() * 1000)


# --------------------------------------------------------------------------- #
#  personas
# --------------------------------------------------------------------------- #
PEOPLE = [
    dict(id="u_demo", name="Nicolas Gimenez", username="nico.gimenez",
         bio="Construyendo cosas en la web. Cafe, codigo y mates.",
         city="Mendoza, Argentina", work="Estudio Nimbo", edu="Universidad Nacional de Cuyo",
         bd="1994-03-18", gender="male", idx=0),
    dict(id="u_ana", name="Ana Torres", username="ana.torres",
         bio="Fotografa y corredora aficionada.",
         city="Mendoza, Argentina", work="Revista Horizonte", edu="UNCuyo",
         bd="1992-07-02", gender="female", idx=1),
    dict(id="u_luis", name="Luis Fernandez", username="luisfer",
         bio="Disenador grafico. Amante del cine y de la noche portena.",
         city="Buenos Aires, Argentina", work="Freelance", edu="UBA",
         bd="1990-11-23", gender="male", idx=2),
    dict(id="u_maria", name="Maria Gomez", username="maria.gomez",
         bio="Viajera incansable. 24 paises y contando.",
         city="Cordoba, Argentina", work="Turismo Andino", edu="UNC",
         bd="1995-01-09", gender="female", idx=3),
    dict(id="u_carlos", name="Carlos Ruiz", username="carlosruiz",
         bio="Musica, vinilos y asado los domingos.",
         city="Rosario, Argentina", work="Sello Sur", edu="UNR",
         bd="1988-05-30", gender="male", idx=4),
    dict(id="u_sofia", name="Sofia Peralta", username="sofia.peralta",
         bio="Chef. Cocino lo que me acuerdo de mi abuela.",
         city="Mendoza, Argentina", work="Cocina Peralta", edu="IAG",
         bd="1993-09-14", gender="female", idx=5),
]

print("generando avatares y portadas...")
for person in PEOPLE:
    person["avatar"] = save_jpg(avatar(person["name"], person["idx"]), f"media/perfiles/{person['id']}.jpg")

covers = {}
for person, seed in ((PEOPLE[0], 0), (PEOPLE[1], 1), (PEOPLE[3], 2)):
    rel = f"media/portadas/{person['id']}.jpg"
    save_jpg(scene_cover(seed=seed), rel)
    covers[person["id"]] = rel

print("generando fotos...")
photos = {
    "sunset": save_jpg(scene_sunset(), "media/publicaciones/atardecer.jpg"),
    "city": save_jpg(scene_city(), "media/publicaciones/ciudad.jpg"),
    "sea": save_jpg(scene_sea(), "media/publicaciones/playa.jpg"),
    "forest": save_jpg(scene_forest(), "media/publicaciones/bosque.jpg"),
    "food": save_jpg(scene_food(), "media/publicaciones/cafe.jpg"),
    "abs1": save_jpg(scene_abstract(seed=2), "media/publicaciones/abstracta-1.jpg"),
    "abs2": save_jpg(scene_abstract(seed=9), "media/publicaciones/abstracta-2.jpg"),
    "portrait": save_jpg(scene_sunset((900, 1200)), "media/publicaciones/retrato.jpg"),
}
story_sea = story_img(scene_sea, "media/historias/playa.jpg")
story_city = story_img(scene_city, "media/historias/ciudad.jpg")
story_forest = story_img(scene_forest, "media/historias/bosque.jpg")

group_covers = {
    "g_foto": save_jpg(scene_cover((1400, 640), seed=3), "media/grupos/fotografia.jpg"),
    "g_code": save_jpg(scene_cover((1400, 640), seed=1), "media/grupos/programacion.jpg"),
    "g_trek": save_jpg(scene_cover((1400, 640), seed=2), "media/grupos/trekking.jpg"),
}


def media(rel, w=1200, h=900):
    return {"path": rel, "type": "image/jpeg", "w": w, "h": h}


# --------------------------------------------------------------------------- #
#  usuarios
# --------------------------------------------------------------------------- #
users = []
for person in PEOPLE:
    users.append({
        "id": person["id"],
        "name": person["name"],
        "username": person["username"],
        "password": pwd_record("demo1234"),
        "avatar": person["avatar"],
        "cover": covers.get(person["id"]),
        "bio": person["bio"],
        "birthday": person["bd"],
        "gender": person["gender"],
        "location": person["city"],
        "work": person["work"],
        "education": person["edu"],
        "following": [],
        "savedPostIds": [],
        "createdAt": iso(days_ago=120 + person["idx"] * 9),
        "lastSeen": iso(minutes_ago=3 + person["idx"] * 4),
    })

BY_ID = {u["id"]: u for u in users}
FRIENDS = {
    "u_demo": ["u_ana", "u_luis", "u_maria", "u_sofia"],
    "u_ana": ["u_demo", "u_luis", "u_maria"],
    "u_luis": ["u_demo", "u_ana", "u_carlos"],
    "u_maria": ["u_demo", "u_ana"],
    "u_sofia": ["u_demo"],
    "u_carlos": ["u_luis"],
}
for uid, friends in FRIENDS.items():
    BY_ID[uid]["following"] = friends

# --------------------------------------------------------------------------- #
#  publicaciones
# --------------------------------------------------------------------------- #
posts = []


def add_post(pid, author, text, media_list=(), hours_ago=2, feeling="", location="", group=None):
    posts.append({
        "id": pid, "authorId": author, "text": text, "media": list(media_list),
        "privacy": "group" if group else "public", "groupId": group, "shareOf": None,
        "feeling": feeling, "location": location, "reactions": {},
        "createdAt": iso(hours_ago=hours_ago), "updatedAt": iso(hours_ago=hours_ago),
    })


add_post("p_ana_atardecer", "u_ana",
         "El cielo de hoy no necesitaba filtros. A veces la ciudad te regala estos atardeceres "
         "y solo hay que levantar la vista.",
         [media(photos["sunset"])], hours_ago=2)
add_post("p_luis_ciudad", "u_luis",
         "Noche de caminata por la ciudad. Dos fotos que resumen mi semana.",
         [media(photos["city"]), media(photos["food"])], hours_ago=5)
add_post("p_demo_nimbook", "u_demo",
         "Despues de varias semanas, por fin puedo mostrarlo: NimbookGR ya esta funcionando. "
         "Publicaciones, fotos, historias, amigos y mensajes; todo guardado en un repositorio de GitHub.\n\n"
         "Sin servidores, sin base de datos externa. Solo la API de GitHub haciendo de backend. "
         "Todavia no hay videos, pero vamos por partes.",
         (), hours_ago=7, feeling="me siento emocionado", location="Mendoza, Argentina")
add_post("p_maria_viaje", "u_maria",
         "Tres paisajes, un mismo viaje. El mar, el bosque y un poco de caos abstracto. Con cual se quedan?",
         [media(photos["sea"]), media(photos["forest"]), media(photos["abs1"])], hours_ago=11)
add_post("p_sofia_texto", "u_sofia",
         "Hoy cocine para 20 personas y me quedo una sola pregunta dando vueltas: "
         "por que siempre se termina el pan antes que la comida?",
         (), hours_ago=14, feeling="me siento feliz")
add_post("p_ana_playa", "u_ana",
         "Un recuerdo de enero que necesitaba volver a ver.",
         [media(photos["sea"])], hours_ago=20)
add_post("p_carlos_musica", "u_carlos",
         "Encontre un vinilo de 1978 en una feria de Rosario. Sono perfecto, sin un solo salto. "
         "Hay cosas que el streaming no te puede dar.",
         (), hours_ago=26)
add_post("p_demo_abstracto", "u_demo",
         "Probando texturas para el logo nuevo. Me quede con la primera opcion.",
         [media(photos["abs2"])], hours_ago=30)
add_post("p_luis_retrato", "u_luis",
         "Retrato de domingo. Luz natural y una lente de 85mm.",
         [media(photos["portrait"], 900, 1200)], hours_ago=44)
add_post("p_maria_grupo", "u_maria",
         "Comparto esta del ultimo trekking en la precordillera. Se viene la proxima salida!",
         [media(photos["forest"])], hours_ago=50, group="g_trek")
add_post("p_demo_foto_grupo", "u_demo",
         "Mi aporte para el grupo: la ciudad desde el balcon, a las 3 de la manana.",
         [media(photos["city"])], hours_ago=54, group="g_foto")

P = {p["id"]: p for p in posts}

posts.append({
    "id": "p_luis_share", "authorId": "u_luis",
    "text": "Esto es un golazo. Conoci el proyecto hace un mes y ahora lo uso todos los dias.",
    "media": [], "privacy": "public", "groupId": None, "shareOf": "p_demo_nimbook",
    "feeling": "", "location": "", "reactions": {},
    "createdAt": iso(hours_ago=4), "updatedAt": iso(hours_ago=4),
})
P["p_luis_share"] = posts[-1]


def react(pid, user_ids, kind="like"):
    for uid in user_ids:
        P[pid]["reactions"][uid] = kind


react("p_ana_atardecer", ["u_demo", "u_luis", "u_maria", "u_sofia", "u_carlos"], "love")
P["p_ana_atardecer"]["reactions"]["u_maria"] = "wow"
react("p_luis_ciudad", ["u_demo", "u_ana", "u_maria"])
react("p_demo_nimbook", ["u_ana", "u_sofia", "u_luis", "u_maria"])
P["p_demo_nimbook"]["reactions"]["u_ana"] = "love"
react("p_maria_viaje", ["u_demo", "u_ana", "u_sofia"], "love")
react("p_sofia_texto", ["u_demo", "u_maria"], "haha")
react("p_ana_playa", ["u_demo"], "love")
react("p_carlos_musica", ["u_luis"])
react("p_demo_abstracto", ["u_luis", "u_ana"])
react("p_luis_retrato", ["u_ana", "u_demo"], "wow")
react("p_maria_grupo", ["u_demo"])
react("p_demo_foto_grupo", ["u_ana", "u_maria"])
react("p_luis_share", ["u_demo", "u_ana", "u_carlos"])

BY_ID["u_demo"]["savedPostIds"] = ["p_maria_viaje", "p_carlos_musica"]

# --------------------------------------------------------------------------- #
#  comentarios
# --------------------------------------------------------------------------- #
comments = []


def add_comment(cid, post_id, author, text, hours_ago=1, parent=None):
    comments.append({
        "id": cid, "postId": post_id, "parentId": parent, "authorId": author,
        "text": text, "media": [], "reactions": {}, "createdAt": iso(hours_ago=hours_ago),
    })


add_comment("c_1", "p_ana_atardecer", "u_luis", "Increible. Desde donde lo tomaste?", 1.5)
add_comment("c_2", "p_ana_atardecer", "u_ana", "Desde el Parque Central, justo antes de que se escondiera.", 1.2, "c_1")
add_comment("c_3", "p_ana_atardecer", "u_demo", "Esta la quiero de fondo de pantalla.", 1)
add_comment("c_4", "p_demo_nimbook", "u_ana", "Felicitaciones! Se ve increible, muy prolijo.", 6)
add_comment("c_5", "p_demo_nimbook", "u_luis", "Y todo corre solo con GitHub? Como hiciste para las imagenes?", 5.5)
add_comment("c_6", "p_demo_nimbook", "u_demo",
            "Si: cada foto se sube al repo con la API de Contents y se sirve por CDN. "
            "El JSON hace de base de datos.", 5.2, "c_5")
add_comment("c_7", "p_demo_nimbook", "u_sofia", "Necesito una cuenta ya mismo.", 4)
add_comment("c_8", "p_maria_viaje", "u_ana", "El bosque sin dudarlo.", 9)
add_comment("c_9", "p_maria_viaje", "u_demo", "La abstracta me encanta, tiene algo raro y lindo.", 8)
add_comment("c_10", "p_sofia_texto", "u_maria", "Porque el pan es el verdadero protagonista.", 12)
add_comment("c_11", "p_sofia_texto", "u_demo", "Eso mismo me pregunto cada domingo.", 11)
add_comment("c_12", "p_luis_ciudad", "u_ana", "La segunda foto parece de pelicula.", 4)
add_comment("c_13", "p_luis_ciudad", "u_carlos", "Esa ciudad no es Buenos Aires, o si?", 3.5)
add_comment("c_14", "p_luis_ciudad", "u_luis", "Es Rosario un martes cualquiera.", 3, "c_13")
add_comment("c_15", "p_luis_share", "u_demo", "Gracias por la difusion.", 3)
add_comment("c_16", "p_carlos_musica", "u_luis", "Conseguiste oro ahi.", 24)
add_comment("c_17", "p_ana_playa", "u_sofia", "Que ganas de unos dias asi.", 18)

COMM = {c["id"]: c for c in comments}
COMM["c_3"]["reactions"] = {"u_ana": "like"}
COMM["c_4"]["reactions"] = {"u_demo": "love"}
COMM["c_8"]["reactions"] = {"u_maria": "like"}
COMM["c_10"]["reactions"] = {"u_sofia": "haha"}
COMM["c_14"]["reactions"] = {"u_carlos": "like"}

# --------------------------------------------------------------------------- #
#  grupos
# --------------------------------------------------------------------------- #
groups = [
    {
        "id": "g_foto", "name": "Fotografia Argentina",
        "description": "Un espacio para compartir fotos, tecnicas y salidas. Todos los niveles son bienvenidos.",
        "privacy": "public", "cover": group_covers["g_foto"], "ownerId": "u_ana",
        "memberIds": ["u_ana", "u_demo", "u_luis", "u_carlos"], "createdAt": iso(days_ago=60),
    },
    {
        "id": "g_code", "name": "Programacion y Cafe",
        "description": "Charlas de codigo, proyectos y mucho cafe. Sin humo, con commits.",
        "privacy": "public", "cover": group_covers["g_code"], "ownerId": "u_demo",
        "memberIds": ["u_demo", "u_luis", "u_ana"], "createdAt": iso(days_ago=45),
    },
    {
        "id": "g_trek", "name": "Mendoza Trekking",
        "description": "Salidas a la precordillera. Coordinamos por el chat del grupo.",
        "privacy": "private", "cover": group_covers["g_trek"], "ownerId": "u_maria",
        "memberIds": ["u_maria", "u_demo", "u_sofia"], "createdAt": iso(days_ago=30),
    },
]

# --------------------------------------------------------------------------- #
#  conversaciones
# --------------------------------------------------------------------------- #
conversations = []
messages = {}


def add_conv(cid, members, msgs):
    conversations.append({
        "id": cid, "memberIds": members,
        "createdAt": iso(days_ago=10),
        "updatedAt": iso(minutes_ago=msgs[-1][3]),
        "lastMessage": {
            "text": msgs[-1][1] or "Foto",
            "senderId": msgs[-1][0],
            "at": ts(minutes_ago=msgs[-1][3]),
        },
        "reads": {
            members[0]: ts(minutes_ago=2),
            members[1]: ts(minutes_ago=msgs[-1][3] + 5),
        },
    })
    messages[cid] = {
        "version": 1,
        "messages": [
            {
                "id": f"m_{cid}_{i}", "senderId": sender, "text": text,
                "media": [media(rel)] if rel else [],
                "createdAt": iso(minutes_ago=mins),
            }
            for i, (sender, text, rel, mins) in enumerate(msgs)
        ],
    }


add_conv("cv_demo_ana", ["u_demo", "u_ana"], [
    ("u_ana", "Nico! Vi tu publicacion, quedo muy buena.", None, 180),
    ("u_demo", "Gracias Ana, me llevo varias noches.", None, 176),
    ("u_ana", "Y funciona desde el celular?", None, 172),
    ("u_demo", "Si, es totalmente responsive. Probala cuando quieras.", None, 168),
    ("u_ana", "Dale. Te mando una foto del atardecer de hoy.", None, 40),
    ("u_ana", "", story_sea, 39),
    ("u_demo", "Que colores. Esa va directo a favoritos.", None, 12),
])
add_conv("cv_demo_luis", ["u_demo", "u_luis"], [
    ("u_luis", "Che, como estas? Tenes un rato para ver el logo nuevo?", None, 300),
    ("u_demo", "Si, mandalo. Lo miro con el cafe.", None, 295),
    ("u_luis", "Te lo paso por mail. Y arreglamos el viernes.", None, 240),
])
add_conv("cv_demo_maria", ["u_demo", "u_maria"], [
    ("u_maria", "Te sumas al trekking del sabado?", None, 90),
    ("u_demo", "Me encantaria, pero tengo entrega. La proxima no falto.", None, 85),
])
add_conv("cv_ana_luis", ["u_ana", "u_luis"], [
    ("u_luis", "Ana, te paso las fotos del sabado.", None, 500),
    ("u_ana", "Genial, gracias.", None, 495),
])

# --------------------------------------------------------------------------- #
#  historias y notificaciones
# --------------------------------------------------------------------------- #
stories = [
    {"id": "s_ana_1", "userId": "u_ana", "image": story_sea,
     "text": "Fin de semana en la costa", "createdAt": iso(hours_ago=3)},
    {"id": "s_luis_1", "userId": "u_luis", "image": story_city,
     "text": "Noche de ciudad", "createdAt": iso(hours_ago=6)},
    {"id": "s_maria_1", "userId": "u_maria", "image": story_forest,
     "text": "Precordillera", "createdAt": iso(hours_ago=9)},
]

notifications = [
    {"id": "n_1", "type": "reaction", "actorId": "u_ana", "postId": "p_demo_nimbook",
     "reaction": "love", "at": iso(minutes_ago=18), "read": False},
    {"id": "n_2", "type": "comment", "actorId": "u_luis", "postId": "p_demo_nimbook",
     "commentId": "c_5", "at": iso(hours_ago=5), "read": False},
    {"id": "n_3", "type": "follow", "actorId": "u_carlos",
     "at": iso(hours_ago=8), "read": False},
    {"id": "n_4", "type": "share", "actorId": "u_luis", "postId": "p_demo_nimbook",
     "at": iso(hours_ago=4), "read": True},
    {"id": "n_5", "type": "reply", "actorId": "u_sofia", "postId": "p_sofia_texto",
     "commentId": "c_11", "at": iso(hours_ago=11), "read": True},
]


# --------------------------------------------------------------------------- #
#  escritura
# --------------------------------------------------------------------------- #
def dump(rel, payload):
    path = os.path.join(BASE, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"  {rel}")


print("escribiendo JSON...")
dump("data/usuarios.json", {"version": 1, "users": users})
dump("data/feed.json", {"version": 1, "posts": posts})
dump("data/comentarios.json", {"version": 1, "comments": comments})
dump("data/conversaciones.json", {"version": 1, "conversations": conversations})
dump("data/grupos.json", {"version": 1, "groups": groups})
dump("data/historias.json", {"version": 1, "stories": stories})
dump("data/notificaciones/u_demo.json", {"version": 1, "items": notifications})
for cid, payload in messages.items():
    dump(f"data/mensajes/{cid}.json", payload)

print("listo")
