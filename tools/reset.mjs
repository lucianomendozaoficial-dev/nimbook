/* ==========================================================================
   reset.mjs — deja el repositorio con los datos vacíos (sin cuentas ni posts)
   Uso: node tools/reset.mjs [--wipe-media]
   ========================================================================== */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wipeMedia = process.argv.includes('--wipe-media');

const SCHEMA = {
  'data/usuarios.json': { version: 1, users: [] },
  'data/feed.json': { version: 1, posts: [] },
  'data/comentarios.json': { version: 1, comments: [] },
  'data/solicitudes.json': { version: 1, requests: [] },
  'data/conversaciones.json': { version: 1, conversations: [] },
  'data/grupos.json': { version: 1, groups: [] },
  'data/historias.json': { version: 1, stories: [] },
  'data/notificaciones/.gitkeep': '',
  'data/mensajes/.gitkeep': '',
  'media/perfiles/.gitkeep': '',
  'media/portadas/.gitkeep': '',
  'media/publicaciones/.gitkeep': '',
  'media/historias/.gitkeep': '',
  'media/grupos/.gitkeep': '',
  'media/chat/.gitkeep': '',
};

const OLD = [
  'data/users.json', 'data/posts.json', 'data/comments.json', 'data/friends.json',
  'data/conversations.json', 'data/groups.json', 'data/stories.json',
  'data/notifications', 'data/messages',
  'media/avatars', 'media/covers', 'media/posts', 'media/stories', 'media/groups',
];

async function main() {
  for (const dir of ['data', 'media']) {
    await fs.mkdir(path.join(ROOT, dir), { recursive: true });
  }

  for (const rel of OLD) {
    await fs.rm(path.join(ROOT, rel), { recursive: true, force: true }).catch(() => {});
  }

  for (const [rel, payload] of Object.entries(SCHEMA)) {
    const target = path.join(ROOT, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const content = typeof payload === 'string' ? payload : `${JSON.stringify(payload, null, 2)}\n`;
    await fs.writeFile(target, content, 'utf8');
  }

  if (wipeMedia) {
    for (const folder of ['perfiles', 'portadas', 'publicaciones', 'historias', 'grupos', 'chat']) {
      const dir = path.join(ROOT, 'media', folder);
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.name === '.gitkeep') continue;
        await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
      }
    }
  }

  console.log('✅ Datos vacíos: 7 archivos JSON y 6 carpetas de imágenes listas.');
  console.log('   Ahora la app arranca sin cuentas: hay que registrarse y publicar.');
  if (wipeMedia) console.log('   Imágenes existentes eliminadas.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
