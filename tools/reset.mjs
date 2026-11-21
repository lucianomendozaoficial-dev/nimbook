/* ==========================================================================
   reset.mjs — deja la base de datos vacía con la estructura nueva
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const wipeMedia = process.argv.includes('--wipe-media');

const FILES = {
  'data/usuarios/index.json': { version: 1, users: [] },
  'data/feed/index.json': { version: 1, posts: [] },
  'data/grupos.json': { version: 1, groups: [] },
  'data/historias.json': { version: 1, stories: [] },
};

const FOLDERS = [
  'data/usuarios',
  'data/feed',
  'data/likes',
  'data/comentarios',
  'data/siguiendo',
  'data/seguidores',
  'data/notificaciones',
  'media/perfiles',
  'media/portadas',
  'media/publicaciones',
  'media/historias',
  'media/grupos',
];

const LEGACY = [
  'data/usuarios.json',
  'data/feed.json',
  'data/comentarios.json',
  'data/conversaciones.json',
  'data/solicitudes.json',
  'data/mensajes',
  'media/chat',
];

function ensureDir(dir) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  const keep = path.join(ROOT, dir, '.gitkeep');
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
}

function cleanDir(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue;
    fs.rmSync(path.join(full, entry.name), { recursive: true, force: true });
  }
}

for (const [rel, data] of Object.entries(FILES)) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

for (const folder of FOLDERS) ensureDir(folder);

for (const rel of LEGACY) {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
}

for (const dir of ['data/likes', 'data/siguiendo', 'data/seguidores', 'data/notificaciones', 'data/comentarios']) {
  cleanDir(dir);
}

if (wipeMedia) {
  for (const dir of ['media/perfiles', 'media/portadas', 'media/publicaciones', 'media/historias', 'media/grupos']) {
    cleanDir(dir);
  }
}

console.log(`✅ Base vacía: ${Object.keys(FILES).length} índices y ${FOLDERS.length} carpetas listas.`);
