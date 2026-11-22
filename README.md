# Zuma

Red social completa inspirada en Facebook, hecha con **JavaScript puro** (sin frameworks, sin build) y con **tu repositorio de GitHub como base de datos**.

**En línea:** https://lucianomendozaoficial-dev.github.io/nimbook/

Los usuarios, las publicaciones, las historias, los chats y las imágenes viven en archivos JSON y carpetas dentro del repositorio. La aplicación los lee y los escribe directamente con la API de GitHub desde el navegador, así que se puede publicar gratis en GitHub Pages.

![Feed de Zuma](docs/preview-feed.jpg)

| Modo oscuro | Móvil |
| --- | --- |
| ![Modo oscuro](docs/preview-dark.jpg) | ![Móvil](docs/preview-mobile.jpg) |

> Las capturas son de una instalación con datos de ejemplo (`tools/seed_demo.py`). La app se entrega **sin cuentas ni publicaciones**: la primera persona que entre se registra y publica.

---

## Novedades: iOS, historias, Shop y mensajes

| Muro «Para ti» | Venta de Shop en el muro | Contacto de la venta |
| --- | --- | --- |
| ![Muro](docs/zuma/muro-para-ti.jpg) | ![Venta en el muro](docs/zuma/venta-en-muro.jpg) | ![Contacto](docs/zuma/contacto-venta.jpg) |

| Shop | Perfil con sus ventas | Publicar con más opciones |
| --- | --- | --- |
| ![Shop](docs/zuma/shop.jpg) | ![Perfil con Shop](docs/zuma/perfil-shop.jpg) | ![Publicar](docs/zuma/componer.jpg) |

| Historias (sección aparte) | Cámara de historias | Editor: texto y fuente |
| --- | --- | --- |
| ![Historias](docs/zuma/historias.jpg) | ![Cámara](docs/zuma/historia-camara.jpg) | ![Editor](docs/zuma/historia-editor.jpg) |

| Menú rediseñado | Eliminar cuenta | Búsqueda con pestañas |
| --- | --- | --- |
| ![Menú](docs/zuma/menu.jpg) | ![Eliminar cuenta](docs/zuma/eliminar-cuenta.jpg) | ![Buscar](docs/zuma/buscar.jpg) |

| Mensajes privados | Chat en el móvil | Zuma en el móvil |
| --- | --- | --- |
| ![Mensajes](docs/zuma/mensajes.jpg) | ![Chat móvil](docs/zuma/mensajes-movil.jpg) | ![Zuma móvil](docs/zuma/movil-header.jpg) |

---

## Características

**Red social**
- Registro e inicio de sesión (contraseñas cifradas con PBKDF2-SHA256).
- Publicaciones con texto, hasta 10 fotos, **sentimiento, ubicación, privacidad y fondos de color** (como Facebook).
- **Historias en su propia sección**: la cámara se abre primero y abajo está la opción de elegir de la galería. Después se edita la foto con **texto y 5 fuentes** y se comparte durante 24 h; también se pueden descargar.
- **Descargar imágenes** de publicaciones e historias desde el menú de la publicación o el visor.
- **Eliminar cuenta** desde el menú: pide la contraseña, avisa que es permanente y borra perfil, publicaciones, historias, ventas, conversaciones y vínculos.
- Muro con orden tipo Facebook: lo tuyo, lo de las personas que seguís y lo de tus grupos tiene prioridad, pero **no queda en orden cronológico**; se mezcla en bloques con publicaciones de gente que no seguís (marcadas como «Sugerencia para ti») y se evita que aparezcan dos publicaciones seguidas de la misma persona. Pestañas **Para ti** y **Siguiendo**, y al cargar más se agrega al final sin desordenar lo que ya estabas viendo.
- **Shop**: mercado con productos de la gente de Zuma, búsqueda y categorías, publicación con fotos, precio, estado y ubicación, ficha con vendedor, botón para escribirle, marcar como vendido y eliminar lo propio. El botón **Vender algo** queda flotante.
- **Contacto de la venta**: al publicar se puede activar el contacto y elegir **WhatsApp** o **Instagram** (con sus logos). En la ficha aparecen esos botones y, para quien no quiera usarlos, el chat privado de Zuma.
- **Ventas en el muro**: cada tanto aparece una venta de Shop mezclada en «Para ti», sin importar a quién sigas, con la **marca de agua de Zuma** y la etiqueta «Venta» para que se note que es de Shop.
- **Mensajes privados**: bandeja con conversaciones y contador de no leídos, chat uno a uno (enviar, actualizar, buscar gente para escribirle), aviso en la campana y atajo desde el perfil y desde Shop. El mensaje se ve al instante y el chat se actualiza solo **cada 5 segundos leyendo el link público** (raw/CDN), sin gastar la API de GitHub.
- Reacciones con un toque (me gusta) o manteniendo apretado (6 opciones), comentarios y respuestas, compartir y guardar.
- Reacciones: 👍 Me gusta, ❤️ Me encanta, 😂 Me divierte, 😮 Me asombra, 😢 Me entristece, 😡 Me enfada.
- Comentarios, respuestas anidadas, reacciones y fotos en comentarios.
- Compartir publicaciones (con la original incrustada).
- Seguidores: seguir y dejar de seguir, sugerencias con seguidores en común, sin solicitudes.
- Grupos públicos y privados con publicaciones, miembros y administración.
- Canales: solo el creador publica; el resto los sigue y lee.
- Estado civil y datos personales editables desde «Mi perfil».
- Notificaciones con campana y contador.
- Perfiles con portada, foto, biografía y pestañas (publicaciones, seguidores, fotos, **Shop** e información); botón para compartir el perfil.
- **Buscador con pestañas** (Todo, Personas, Shop, Grupos), sugerencias y búsquedas recientes.
- **Menú rediseñado** con el perfil, las secciones de la app y la zona de privacidad y cuenta.
- Modo claro / oscuro / automático, toasts, menús, visor de imágenes.

**Diseño**
- Estilo **iOS** renovado: barra superior y navegación inferior translúcidas con desenfoque, tarjetas redondeadas, hojas modales, botones con presión y tipografía del sistema. El nombre **Zuma** aparece junto al logo también en el móvil.
- Sin flechas de retroceso en las secciones: se vuelve con el botón del dispositivo (o con la navegación inferior en el móvil).
- Réplica del layout de Facebook: barra superior, columna izquierda, feed central y contactos a la derecha.
- Responsive: 3 columnas en escritorio, rail de iconos en tablet, feed completo y navegación inferior en móvil.
- Logo propio en PNG para todas las resoluciones, favicon `.ico`, iconos PWA y `manifest` instalable.

**Sin servidor**
- 100 % estático: GitHub Pages, Netlify, Vercel o el servidor local incluido.
- **Lecturas por `raw.githubusercontent.com`** (siempre frescas, sin token): no gastan la API de GitHub ni el límite de 5 000 por hora. Las imágenes van por **jsDelivr**, que sí cachea bien porque tienen nombre único.
- **Escrituras solo por la API de GitHub**, con el token, en cola: se agrupan cada 2 s, se reintentan hasta 5 veces ante `409` con espera de 300 ms + aleatorio y siempre se hace *bajar → modificar → subir* con el `sha` recién leído.
- Todo lo descargado se guarda en el navegador (localStorage) para no bajarlo dos veces; el chat abierto se lee cada 5 s por el link público y el resto se actualiza al abrir o al tirar hacia abajo.

---

## Estructura del repositorio (la base de datos)

Un archivo por cosa: así dos personas nunca escriben el mismo archivo y GitHub no se cae.

```
data/
  usuarios/index.json          lista liviana: id, usuario, nombre, foto, alta
  usuarios/<id>.json           ficha completa (contraseña cifrada, bio, contacto…)
  feed/index.json              últimos 200: id, autor y fecha (nada más)
  feed/<post>.json             publicación completa (texto, fotos, contadores)
  likes/<usuario>.json         { postId: tipo de reacción } de cada persona
  comentarios/<post>/index.json    lista de comentarios del post
  comentarios/<post>/<id>.json     comentario completo
  siguiendo/<usuario>.json     a quién sigue
  seguidores/<usuario>.json    quién lo sigue
  notificaciones/<usuario>.json    bandeja de cada persona
  grupos.json                  grupos y canales (tipo, dueño y miembros)
  historias.json               historias activas (imagen, texto, fuente; se limpian a las 24 h)
  tienda/index.json            productos de Shop: id, vendedor, foto, precio y estado
  tienda/<producto>.json       ficha completa (descripción, fotos y contacto opcional)
  mensajes/bandejas/<usuario>.json   conversaciones de cada persona y no leídos
  mensajes/hilos/<a>__<b>.json  mensajes del chat entre dos personas
media/
  perfiles/  portadas/  publicaciones/  historias/  grupos/  tienda/
```

**Shop y mensajes funcionan con la misma idea:** primero se lee el archivo por el
enlace de `raw.githubusercontent.com` (sin token) y las escrituras van por la API
con el token, en cola. Un mensaje nuevo se guarda en el hilo compartido
`mensajes/hilos/<id-menor>__<id-mayor>.json` y en las dos bandejas: la mía queda
sin pendientes y la de la otra persona suma un no leído. Mientras un chat está
abierto, se leen el hilo y la bandeja cada 5 segundos por ese link público: el
token solo se usa al enviar, marcar leído o publicar.

**Regla de oro:** una publicación nunca guarda sus comentarios ni sus reacciones adentro.
El «me gusta» escribe primero en `likes/<usuario>.json` y después, si se puede, suma el contador del post.

```json
{
  "id": "p_m3f8",
  "authorId": "u_ab12",
  "text": "Atardecer desde el balcón",
  "media": [{ "path": "media/publicaciones/m3f8k2a1.jpg", "type": "image/jpeg" }],
  "privacy": "public",
  "reactions": { "love": 4, "like": 9 },
  "commentsCount": 3,
  "createdAt": "2026-11-19T22:10:00Z"
}
```

## Puesta en marcha

### 1. Crea el token de GitHub

1. **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. *Repository access*: **Only select repositories** → tu repositorio de Zuma.
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

## Reparar los índices

Si alguna vez un despliegue pisara `data/usuarios/index.json` o `data/feed/index.json`, se reconstruyen solos desde los archivos que ya existen:

```bash
node tools/repair.mjs --repo tuusuario/zuma --token github_pat_xxx
```

**El despliegue ya no toca los datos existentes**: solo crea los índices y carpetas que faltan. Para borrarlos a propósito hay que usar `--reset-data`.

## Probarlo en tu PC

Haz doble clic en **`Zuma.bat`**. Abre el navegador en `http://localhost:4173/` con un servidor local y **datos de prueba guardados en tu PC**: los cambios que hagas ahí no los ve nadie hasta que publiques.

- Los archivos `js` y `css` se **recargan solos** al guardarlos (no hace falta refrescar).
- Los usuarios y publicaciones de prueba viven en `data/` y `media/` de tu carpeta.
- Necesita Node.js (https://nodejs.org). Si no está instalado, el acceso directo te lo indica.

**Ver la web publicada desde el local** (con tus datos reales): abre `config.js` y listo; el modo local solo se activa con el lanzador.

**Datos de ejemplo con 6 personas, fotos, grupos y canales**

```bash
python tools/seed_demo.py
node tools/mock-server.mjs --port 4173 --open   # luego entra con ?demo=1
```

Las cuentas de ejemplo usan la contraseña `demo1234`.

**Volver a empezar sin datos**

```bash
node tools/reset.mjs --wipe-media   # JSON vacíos y carpetas de imágenes limpias
```

**Pruebas automáticas** (Edge headless): `node tools/flow.mjs` publica, reacciona, comenta, sigue y edita el perfil contra el servidor local.

> Abrir `index.html` con doble clic **no funciona**: los navegadores bloquean el JavaScript en `file://`. Si lo haces, verás un aviso explicándolo.

---

## Detalles técnicos

| Tema | Decisión |
| --- | --- |
| Framework | Ninguno: módulos ES nativos, DOM a mano |
| Rutas | Hash (`#/u/usuario`, `#/p/id`, `#/tienda`, `#/tienda/producto`, `#/mensajes`, `#/mensajes/usuario`, `#/historias`, `#/historias/crear`), compatibles con Pages |
| Estado | Store propio con índices (`Map`) y selectores |
| Concurrencia | Cola por archivo + reintentos ante `409` / `sha` inválido |
| Caché | Memoria + `localStorage` por archivo con `ETag` y `sha` |
| Cuota | ~5 000 peticiones/hora con token; los `304` no cuentan |
| Chat en vivo | Sondeo cada 5 s por `raw.githubusercontent.com` (sin token); el token solo se usa al escribir |
| Contraseñas | PBKDF2-SHA256, 150 000 iteraciones, sal de 16 bytes |
| Historias | Cámara con `getUserMedia`; si no hay permiso o cámara, se elige de la galería. El texto se guarda con su fuente y se dibuja sobre la foto |
| Eliminar cuenta | Verifica la contraseña y borra perfil, posts, historias, ventas, conversaciones y vínculos; el aviso indica que no se puede deshacer |
| Imágenes | `canvas` → JPEG, máx. 1600 px y ~1,4 MB, nombre único |
| Vídeos | **No soportados** (por diseño); solo imágenes |

### Límites conocidos

- Cada «me gusta» o comentario es un commit: es el precio de usar GitHub como base de datos.
- GitHub recomienda mantener los archivos por debajo de 1 MB; para comunidades grandes conviene dividir `feed.json` por mes.
- El token está dentro de `config.js`: usa uno limitado a este repositorio y con caducidad, y revócalo si se filtra.
- Los mensajes privados se guardan como JSON en el repositorio: la app solo los muestra dentro del hilo de las dos personas, pero **no están cifrados**. Si el repositorio es público, alguien con el enlace podría abrir el archivo (como pasa con el resto de los datos). Para conversaciones realmente secretas haría falta cifrado de extremo a extremo, que esta versión no incluye.
- La cámara de historias necesita HTTPS (GitHub Pages lo es) y permiso del navegador; si no está disponible, la app ofrece elegir una foto de la galería.
- Al eliminar una cuenta se borran sus archivos JSON, pero las imágenes ya subidas a `media/` y los comentarios sueltos que haya dejado en otras publicaciones pueden quedar en el repositorio.
- Si dos personas escriben a la vez, la app reintenta automáticamente; en el peor caso avisa para volver a intentarlo.

---

## Archivos del proyecto

```
index.html              punto de entrada (SPA)
config.js               conexión con el almacenamiento (repo + token)
manifest.webmanifest    PWA instalable
Zuma.bat           lanzador local para Windows (modo prueba, sin publicar)
Iniciar-Zuma.ps1     servidor local sin dependencias
css/base.css            tokens, reset, tipografía, utilidades
css/app.css             barra superior, columnas, navegación, componentes
css/pages.css           feed, perfil, mensajes, seguidores, grupos, ajustes
js/app.js               arranque, shell y rutas
js/core/gh.js           cliente de la API de GitHub
js/core/db.js           caché, ETag y mutaciones con reintento
js/core/store.js        estado, índices y selectores
js/core/actions.js      todas las escrituras (posts, seguidores, chats…)
js/core/auth.js         registro, acceso y sesión
js/core/crypto.js       PBKDF2
js/core/media.js        compresión y subida de imágenes
js/core/ui.js           modales, menús, toasts, visor de imágenes
js/core/router.js       rutas por hash
js/components/*         topbar, sidebars, compositor, tarjeta de post, historias
js/pages/*              feed, Shop, historias con cámara, mensajes privados, perfil, búsqueda, menú…
js/core/story-fonts.js  fuentes disponibles para el texto de las historias
css/ios.css             capa de estilo iOS y estilos de las secciones nuevas
assets/logo/            logo PNG en todos los tamaños + favicon
tools/                  despliegue, emulador de GitHub, datos de ejemplo y pruebas
```

Hecho para que tengas tu propia red social sin depender de nadie. 🚀
