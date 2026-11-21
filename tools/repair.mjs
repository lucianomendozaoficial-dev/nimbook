/* ==========================================================================
   repair.mjs — reconstruye los índices (usuarios y feed) a partir de los
   archivos que ya existen en el repositorio. Sirve si un despliegue pisó
   data/usuarios/index.json o data/feed/index.json.

   Uso:
     node tools/repair.mjs --repo usuario/repo --token ghp_xxx
   ========================================================================== */
import fs from 'node:fs/promises';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) { args[key] = next; i += 1; } else args[key] = true;
  }
}

const TOKEN = args.token || process.env.GH_TOKEN;
const REPO = args.repo || 'lucianomendozaoficial-dev/nimbook';
const [owner, repo] = String(REPO).split('/');
const BRANCH = args.branch || 'main';
const API = 'https://api.github.com';
const LOCAL = args.local === true;

if (!TOKEN && !LOCAL) {
  console.error('Falta el token: --token ghp_xxx');
  process.exit(1);
}

async function api(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok && res.status !== 404) {
    throw new Error(`${method} ${endpoint} → ${res.status} ${data?.message || ''}`);
  }
  return data;
}

async function readRemoteJson(rel) {
  const data = await api('GET', `/repos/${owner}/${repo}/contents/${rel}?ref=${BRANCH}`);
  if (!data?.content) return null;
  return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}

async function writeRemoteJson(rel, doc, message) {
  const existing = await api('GET', `/repos/${owner}/${repo}/contents/${rel}?ref=${BRANCH}`);
  const body = {
    message,
    content: Buffer.from(`${JSON.stringify(doc, null, 2)}\n`).toString('base64'),
    branch: BRANCH,
  };
  if (existing?.sha) body.sha = existing.sha;
  await api('PUT', `/repos/${owner}/${repo}/contents/${rel}`, body);
}

async function localRead(rel) {
  try { return JSON.parse(await fs.readFile(path.join(process.cwd(), rel), 'utf8')); } catch { return null; }
}
async function localWrite(rel, doc) {
  const file = path.join(process.cwd(), rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

async function listDir(rel) {
  if (LOCAL) {
    try {
      const entries = await fs.readdir(path.join(process.cwd(), rel), { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => ({ name: entry.name, path: `${rel}/${entry.name}` }));
    } catch { return []; }
  }
  const items = await api('GET', `/repos/${owner}/${repo}/contents/${rel}?ref=${BRANCH}`);
  return Array.isArray(items) ? items : [];
}

const read = async (rel) => (LOCAL ? localRead(rel) : readRemoteJson(rel));
const write = async (rel, doc, message) => (LOCAL ? localWrite(rel, doc) : writeRemoteJson(rel, doc, message));

/* ------------------------------- usuarios -------------------------------- */

const userFiles = (await listDir('data/usuarios')).filter((entry) => entry.name.endsWith('.json') && entry.name !== 'index.json');
const users = [];
for (const file of userFiles) {
  const doc = await read(file.path);
  const user = doc?.user;
  if (!user?.id || !user.username) {
    console.warn(`   ⚠ ${file.name} inválido, se ignora`);
    continue;
  }
  users.push(user);
}
users.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

const userIndex = {
  version: 1,
  users: users.map((user) => ({
    id: user.id,
    username: user.username,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    avatar: user.avatar || null,
    createdAt: user.createdAt || null,
  })),
};
await write('data/usuarios/index.json', userIndex, 'Zuma: reconstruir índice de usuarios');

/* --------------------------------- feed ---------------------------------- */

const postFiles = (await listDir('data/feed')).filter((entry) => entry.name.endsWith('.json') && entry.name !== 'index.json');
const posts = [];
for (const file of postFiles) {
  const doc = await read(file.path);
  const post = doc?.post;
  if (!post?.id || !post.authorId) continue;
  posts.push(post);
}
posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

const feedIndex = {
  version: 1,
  posts: posts.slice(0, 200).map((post) => ({
    id: post.id,
    authorId: post.authorId,
    createdAt: post.createdAt,
  })),
};
await write('data/feed/index.json', feedIndex, 'Zuma: reconstruir índice del muro');

/* ------------------------------- resultado ------------------------------- */

const missing = users.filter((user) => !posts.some((post) => post.authorId === user.id)).length;
console.log(`✅ Reparado: ${users.length} usuarios y ${posts.length} publicaciones indexadas.`);
if (missing) console.log(`   (${missing} usuarios todavía no publicaron)`);
console.log(`   ${users.map((user) => '@' + user.username).join(', ')}`);
