/* ==========================================================================
   deploy.mjs — publica NimbookGR en un repositorio de GitHub
   Uso:
     node tools/deploy.mjs --repo usuario/NimbookGR --token github_pat_xxx
     (o define NIMBOOK_TOKEN / NIMBOOK_REPO)
   Opciones:
     --branch main          rama destino
     --pages                intenta activar GitHub Pages
     --with-demo            sube también los datos de ejemplo de data/
     --dry                  solo muestra qué se subiría
   ========================================================================== */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const API = (args.api || process.env.NIMBOOK_API || 'https://api.github.com').replace(/\/$/, '');

async function readToken() {
  if (process.env.NIMBOOK_TOKEN) return process.env.NIMBOOK_TOKEN.trim();
  if (args.token) return String(args.token).trim();
  for (const file of ['.nimbook-token', '.token']) {
    try {
      const value = (await fs.readFile(path.join(ROOT, file), 'utf8')).trim();
      if (value) return value;
    } catch { /* siguiente */ }
  }
  return null;
}

const token = await readToken();
const repoSlug = args.repo || process.env.NIMBOOK_REPO;
if (!token) {
  console.error('❌ Falta el token. Usa --token, NIMBOOK_TOKEN o un archivo .nimbook-token');
  process.exit(1);
}
if (!repoSlug || !/^[^/]+\/[^/]+$/.test(String(repoSlug))) {
  console.error('❌ Falta el repositorio. Usa --repo usuario/repositorio');
  process.exit(1);
}

const [owner, repo] = String(repoSlug).split('/');
const branch = args.branch || 'main';

async function api(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'NimbookGR-deploy',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`${method} ${endpoint} → ${res.status} ${data?.message || ''}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const BINARY = /\.(png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|mp4|webm)$/i;
const SKIP_DIRS = new Set(['.tmp', '.git', 'node_modules', '.vscode', '.idea']);
const SKIP_FILES = new Set(['.nimbook-token', '.token', '.DS_Store', 'Thumbs.db']);

const EMPTY_DATA = {
  'data/usuarios.json': { version: 1, users: [] },
  'data/feed.json': { version: 1, posts: [] },
  'data/comentarios.json': { version: 1, comments: [] },
  'data/conversaciones.json': { version: 1, conversations: [] },
  'data/grupos.json': { version: 1, groups: [] },
  'data/historias.json': { version: 1, stories: [] },
};

const PLACEHOLDERS = [
  'data/notificaciones/.gitkeep',
  'data/mensajes/.gitkeep',
  'media/perfiles/.gitkeep',
  'media/portadas/.gitkeep',
  'media/publicaciones/.gitkeep',
  'media/historias/.gitkeep',
  'media/grupos/.gitkeep',
  'media/chat/.gitkeep',
];

async function collectFiles(dir = ROOT, relBase = '', out = new Map()) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (SKIP_FILES.has(entry.name)) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      // data/ y media/ se gestionan aparte (solo estructura para el repo)
      if (rel === 'data' || rel === 'media') continue;
      await collectFiles(path.join(dir, entry.name), rel, out);
      continue;
    }
    if (entry.name.startsWith('_')) continue;
    const buffer = await fs.readFile(path.join(dir, entry.name));
    out.set(rel, buffer);
  }
  return out;
}

function toBase64(buffer) {
  return buffer.toString('base64');
}

/* ------------------------------- ejecución ------------------------------- */

console.log(`\n🚀 NimbookGR → ${owner}/${repo} (rama ${branch})\n`);

let info;
try {
  info = await api('GET', `/repos/${owner}/${repo}`);
} catch (err) {
  if (err.status === 404 && args.create) {
    console.log('   el repositorio no existe: creándolo…');
    info = await api('POST', '/user/repos', {
      name: repo,
      description: 'NimbookGR — red social con GitHub como base de datos',
      private: false,
      auto_init: true,
      has_issues: false,
      has_wiki: false,
    });
  } else if (err.status === 404) {
    console.error(`❌ El repositorio ${owner}/${repo} no existe (usa --create para crearlo).`);
    process.exit(1);
  } else {
    throw err;
  }
}
console.log(`   repositorio: ${info.full_name} ${info.private ? '(privado)' : '(público)'}`);
console.log(`   permisos: ${info.permissions?.push ? 'escritura ✓' : 'sin escritura ✗'}`);
if (!info.permissions?.push && !info.permissions?.admin) {
  console.error('❌ El token no tiene permiso de escritura sobre el repositorio.');
  process.exit(1);
}

const files = await collectFiles();

// estructura de datos
for (const [rel, payload] of Object.entries(EMPTY_DATA)) {
  if (!args['with-demo']) {
    files.set(rel, Buffer.from(`${JSON.stringify(payload, null, 2)}\n`));
  }
}
for (const rel of PLACEHOLDERS) {
  if (!files.has(rel)) files.set(rel, Buffer.from(''));
}

if (args['with-demo']) {
  for (const rel of ['data/usuarios.json', 'data/feed.json', 'data/comentarios.json',
    'data/conversaciones.json', 'data/grupos.json', 'data/historias.json']) {
    try { files.set(rel, await fs.readFile(path.join(ROOT, rel))); } catch { /* noop */ }
  }
}

console.log(`   archivos: ${files.size}`);

if (args.dry) {
  const sorted = [...files.keys()].sort();
  console.log(sorted.map((f) => `     · ${f}`).join('\n'));
  process.exit(0);
}

// rama actual
let parentSha = null;
let baseTree = null;
try {
  const ref = await api('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  parentSha = ref.object.sha;
  const commit = await api('GET', `/repos/${owner}/${repo}/git/commits/${parentSha}`);
  baseTree = commit.tree.sha;
  console.log(`   commit actual: ${parentSha.slice(0, 7)}`);
} catch (err) {
  if (err.status !== 404 && err.status !== 409) throw err;
  console.log('   repositorio vacío: se creará el primer commit');
  // GitHub no permite crear refs en un repo sin commits: inicializamos con la Contents API
  const indexBuffer = files.get('index.html');
  if (indexBuffer) {
    await api('PUT', `/repos/${owner}/${repo}/contents/index.html`, {
      message: 'NimbookGR: inicializar repositorio',
      content: indexBuffer.toString('base64'),
      branch,
    });
    const ref = await api('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    parentSha = ref.object.sha;
    const commit = await api('GET', `/repos/${owner}/${repo}/git/commits/${parentSha}`);
    baseTree = commit.tree.sha;
    files.delete('index.html');
  }
}

// blobs (en paralelo, 6 a la vez)
const entries = [];
const list = [...files.entries()];
let done = 0;
for (let i = 0; i < list.length; i += 6) {
  const chunk = list.slice(i, i + 6);
  const results = await Promise.all(chunk.map(async ([rel, buffer]) => {
    const isBinary = BINARY.test(rel) || buffer.includes(0);
    const blob = await api('POST', `/repos/${owner}/${repo}/git/blobs`, {
      content: isBinary ? toBase64(buffer) : buffer.toString('utf8'),
      encoding: isBinary ? 'base64' : 'utf-8',
    });
    done += 1;
    if (done % 20 === 0 || done === list.length) {
      console.log(`   subiendo archivos… ${done}/${list.length}`);
    }
    return { path: rel, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  entries.push(...results);
}

const tree = await api('POST', `/repos/${owner}/${repo}/git/trees`, {
  ...(baseTree ? { base_tree: baseTree } : {}),
  tree: entries,
});

const commit = await api('POST', `/repos/${owner}/${repo}/git/commits`, {
  message: `NimbookGR: publicar aplicación y estructura de datos (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
  tree: tree.sha,
  ...(parentSha ? { parents: [parentSha] } : {}),
});

if (parentSha) {
  await api('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    sha: commit.sha, force: false,
  });
} else {
  await api('POST', `/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`, sha: commit.sha,
  });
}
console.log(`✅ Commit ${commit.sha.slice(0, 7)} publicado en ${owner}/${repo}#${branch}`);

/* --------------------------------- Pages --------------------------------- */

const pagesUrl = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
  ? `https://${owner}.github.io/`
  : `https://${owner}.github.io/${repo}/`;

if (args.pages) {
  try {
    await api('POST', `/repos/${owner}/${repo}/pages`, {
      source: { branch, path: '/' },
      build_type: 'legacy',
    });
    console.log('✅ GitHub Pages activado');
  } catch (err) {
    if (err.status === 409) console.log('ℹ️  GitHub Pages ya estaba activado');
    else console.log(`⚠️  No se pudo activar Pages automáticamente (${err.status}). Actívalo en Settings → Pages.`);
  }
}

console.log(`\n🌐 Sitio: ${pagesUrl}`);
console.log('   (la primera publicación puede tardar 1-2 minutos)\n');
