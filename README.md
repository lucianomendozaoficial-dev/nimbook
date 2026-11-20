# NimbookGR

Red social completa inspirada en Facebook, hecha con **JavaScript puro** (sin frameworks, sin build) y con **tu repositorio de GitHub como base de datos**.

**En línea:** https://lucianomendozaoficial-dev.github.io/nimbook/

Los usuarios, las publicaciones, las historias, los chats y las imágenes viven en archivos JSON y carpetas dentro del repositorio. La aplicación los lee y los escribe directamente con la API de GitHub desde el navegador, así que se puede publicar gratis en GitHub Pages.

![Feed de NimbookGR](docs/preview-feed.jpg)

| Modo oscuro | Móvil |
| --- | --- |
| ![Modo oscuro](docs/preview-dark.jpg) | ![Móvil](docs/preview-mobile.jpg) |

> Las capturas son de una instalación con datos de ejemplo (`tools/seed_demo.py`). La app se entrega **sin cuentas ni publicaciones**: la primera persona que entre se registra y publica.

---

## Características

**Red social**
- Registro e inicio de sesión (contraseñas cifradas con PBKDF2-SHA256).
- Publicaciones con texto, hasta 10 fotos, sentimiento, ubicación y privacidad (público / amigos / solo yo).
- Reacciones: 👍 Me gusta, ❤️ Me encanta, 😂 Me divierte, 😮 Me asombra, 😢 Me entristece, 😡 Me enfada.
- Comentarios, respuestas anidadas, reacciones y fotos en comentarios.
- Compartir publicaciones (con la original incrustada).
- Historias de 24 h con visor automático.
- Amigos: solicitudes, aceptar/rechazar, sugerencias con amigos en común, eliminar amistad.
- Messenger: conversaciones, fotos, no leídos, envío optimista.
- Grupos públicos y privados con publicaciones, miembros y administración.
- Notificaciones con campana y contador.
- Perfiles con portada, foto, biografía y pestañas (publicaciones, amigos, fotos, información).
- Guardados, búsqueda global (personas, publicaciones, grupos) y ajustes de cuenta.
- Modo claro / oscuro / automático, toasts, menús, visor de imágenes.

**Diseño**
- Réplica del layout de Facebook: barra superior, columna izquierda, feed central y contactos a la derecha.
- Responsive: 3 columnas en escritorio, rail de iconos en tablet, feed completo y navegación inferior en móvil.
- Logo propio (círculo azul + N) en PNG para todas las resoluciones, favicon `.ico`, iconos PWA y `manifest` instalable.

**Sin servidor**
- 100 % estático: GitHub Pages, Netlify, Vercel o el servidor local incluido.
- Lecturas con `ETag` (los `304` no consumen cuota) y caché local para arranques instantáneos.
- Escrituras con control de concurrencia por `sha` y reintentos automáticos.

---

## Estructura del repositorio (la base de datos)

```
data/
  usuarios.json          cuentas: nombre, usuario, contraseña cifrada, foto, portada, amigos
  feed.json              publicaciones (texto, fotos, reacciones, privacidad, grupo)
  comentarios.json       comentarios y respuestas
  solicitudes.json       solicitudes de amistad pendientes
  conversaciones.json    lista de chats y último mensaje
  grupos.json            grupos y miembros
  historias.json         historias activas (se limpian solas a las 24 h)
  notificaciones/<id>.json   bandeja de cada usuario
  mensajes/<chat>.json       mensajes de cada conversación
media/
  perfiles/       fotos de perfil
  portadas/       fotos de portada
  publicaciones/  fotos publicadas en el feed
  historias/      fotos de historias
  grupos/         portadas de grupos
  chat/           fotos enviadas por mensaje
```

Cada imagen tiene un **nombre único** (`media/publicaciones/m3f8k2a1.jpg`) y la publicación guarda esa ruta en su campo `media`:

```json
{
  "id": "p_m3f8",
  "authorId": "u_ab12",
  "text": "Atardecer desde el balcón",
  "media": [{ "path": "media/publicaciones/m3f8k2a1.jpg", "type": "image/jpeg", "w": 1600, "h": 1200 }],
  "privacy": "public",
  "reactions": { "u_cd34": "love" },
  "createdAt": "2026-11-19T22:10:00Z"
}
```

La app resuelve esa ruta por CDN (`cdn.jsdelivr.net`) y, si falla, por `raw.githubusercontent.com` o por la propia API (repositorios privados).

---

## Puesta en marcha

### 1. Crea el token de GitHub

1. **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. *Repository access*: **Only select repositories** → tu repositorio de NimbookGR.
3. *Repository permissions*: **Contents: Read and write** (Metadata se activa solo).
4. Copia el token (`github_pat_…`).

> El token se guarda solo en el navegador (`localStorage`) y nunca se sube al repositorio.

### 2. Publica la aplicación

Con Node.js instalado:

```bash
node tools/deploy.mjs --repo tuusuario/nimbook --token github_pat_xxx --pages
```

Crea un **único commit** con la aplicación, los JSON vacíos y `config.js`. Si el repositorio no existe, añade `--create`.

### 3. Configura la conexión (una sola vez)

Edita **`config.js`** con tu repositorio y tu token:

```js
const partes = ['github_pat_xxx', 'yyy', 'zzz'];  // el token, repartido en partes
window.NIMBOOK_CONFIG = { owner: 'tuusuario', repo: 'nimbook', branch: 'main', token: partes.join('') };
```

Ese archivo es lo único técnico que existe: los usuarios **nunca** ven repositorios ni tokens, solo la pantalla de entrada y registro.

> **Importante:** GitHub bloquea los commits que contienen un token a la vista, por eso `config.js` guarda el token repartido en tres partes. La web lo necesita para guardar los datos, así que **cualquier visitante puede técnicamente leerlo y escribir en el repositorio**. Usá un token limitado a ese repositorio y solo con permiso de *Contents*; si se filtra, revocalo, generá otro y actualizá las tres partes de `config.js`.

### 4. Ábrela y regístrate

1. Entra en `https://tuusuario.github.io/nimbook/`.
2. Pulsa **Crear una cuenta nueva**, completa tus datos y publica tu primer momento.

> Para que GitHub Pages funcione gratis y las imágenes carguen rápido por CDN, el repositorio debe ser **público** (Settings → General → Change visibility).
>
> El token queda dentro de `config.js` para que la web pueda guardar los datos. Cualquier visitante podría verlo, así que usa un token **limitado a ese repositorio** y con permiso solo de *Contents*. Si se filtra, revócalo, genera otro y vuelve a subir `config.js`.

---

## Probarlo en tu PC

Haz doble clic en **`NimbookGR.bat`**. Abre el navegador en `http://localhost:4173/` con un servidor local y **datos de prueba guardados en tu PC**: los cambios que hagas ahí no los ve nadie hasta que publiques.

- Los archivos `js` y `css` se **recargan solos** al guardarlos (no hace falta refrescar).
- Los usuarios y publicaciones de prueba viven en `data/` y `media/` de tu carpeta.
- Necesita Node.js (https://nodejs.org). Si no está instalado, el acceso directo te lo indica.

**Ver la web publicada desde el local** (con tus datos reales): abre `config.js` y listo; el modo local solo se activa con el lanzador.

**Datos de ejemplo con 6 personas, fotos, grupos y chats**

```bash
python tools/seed_demo.py
node tools/mock-server.mjs --port 4173 --open   # luego entra con ?demo=1
```

Las cuentas de ejemplo usan la contraseña `demo1234`.

**Volver a empezar sin datos**

```bash
node tools/reset.mjs --wipe-media   # JSON vacíos y carpetas de imágenes limpias
```

**Pruebas automáticas** (Edge headless): `node tools/shots.mjs` → 24 comprobaciones y capturas en `.tmp/`.

> Abrir `index.html` con doble clic **no funciona**: los navegadores bloquean el JavaScript en `file://`. Si lo haces, verás un aviso explicándolo.

---

## Detalles técnicos

| Tema | Decisión |
| --- | --- |
| Framework | Ninguno: módulos ES nativos, DOM a mano |
| Rutas | Hash (`#/u/usuario`, `#/p/id`, `#/messages`), compatibles con Pages |
| Estado | Store propio con índices (`Map`) y selectores |
| Concurrencia | Cola por archivo + reintentos ante `409` / `sha` inválido |
| Caché | Memoria + `localStorage` por archivo con `ETag` y `sha` |
| Cuota | ~5 000 peticiones/hora con token; los `304` no cuentan |
| Contraseñas | PBKDF2-SHA256, 150 000 iteraciones, sal de 16 bytes |
| Imágenes | `canvas` → JPEG, máx. 1600 px y ~1,4 MB, nombre único |
| Vídeos | **No soportados** (por diseño); solo imágenes |

### Límites conocidos

- Cada «me gusta» o comentario es un commit: es el precio de usar GitHub como base de datos.
- GitHub recomienda mantener los archivos por debajo de 1 MB; para comunidades grandes conviene dividir `feed.json` por mes.
- El token está dentro de `config.js`: usa uno limitado a este repositorio y con caducidad, y revócalo si se filtra.
- Si dos personas escriben a la vez, la app reintenta automáticamente; en el peor caso avisa para volver a intentarlo.

---

## Archivos del proyecto

```
index.html              punto de entrada (SPA)
config.js               conexión con el almacenamiento (repo + token)
manifest.webmanifest    PWA instalable
NimbookGR.bat           lanzador local para Windows (modo prueba, sin publicar)
Iniciar-Nimbook.ps1     servidor local sin dependencias
css/base.css            tokens, reset, tipografía, utilidades
css/app.css             barra superior, columnas, navegación, componentes
css/pages.css           feed, perfil, mensajes, amigos, grupos, ajustes
js/app.js               arranque, shell y rutas
js/core/gh.js           cliente de la API de GitHub
js/core/db.js           caché, ETag y mutaciones con reintento
js/core/store.js        estado, índices y selectores
js/core/actions.js      todas las escrituras (posts, amigos, chats…)
js/core/auth.js         registro, acceso y sesión
js/core/crypto.js       PBKDF2
js/core/media.js        compresión y subida de imágenes
js/core/ui.js           modales, menús, toasts, visor de imágenes
js/core/router.js       rutas por hash
js/components/*         topbar, sidebars, compositor, tarjeta de post, historias
js/pages/*              feed, perfil, amigos, mensajes, notificaciones, grupos…
assets/logo/            logo PNG en todos los tamaños + favicon
tools/                  despliegue, emulador de GitHub, datos de ejemplo y pruebas
```

Hecho para que tengas tu propia red social sin depender de nadie. 🚀
