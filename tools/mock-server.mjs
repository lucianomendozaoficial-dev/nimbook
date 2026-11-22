/* ==========================================================================
   mock-server.mjs — emula la API de GitHub y sirve la app en local
   Uso: node tools/mock-server.mjs [--port 4173]
   ========================================================================== */
import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn as spawnProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || process.argv[process.argv.indexOf('--port') + 1]) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  const payload = isBuffer ? body : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function safeJoin(rel, base = ROOT) {
  const clean = rel.replace(/^\/+/, '').replace(/\\/g, '/');
  const target = path.resolve(base, clean);
  if (!target.startsWith(base)) throw new Error('ruta fuera del proyecto');
  return target;
}

async function statFile(rel, base = ROOT) {
  try {
    const file = safeJoin(rel, base);
    const st = await fs.stat(file);
    return st;
  } catch {
    return null;
  }
}

const MOCK_CONFIG = {
  mediaBase: '.',
  storageBucket: 'zuma-media',
};

/* ---------------- almacenamiento para la API de Git (deploy) -------------- */
const DEST = process.env.MOCK_DEST ? path.resolve(ROOT, process.env.MOCK_DEST) : ROOT;
const blobs = new Map();
const trees = new Map();
let headSha = null;
let headTree = null;

function injectConfig(html) {
  const script = `<script>
try {
  // Modo local: la app usa Supabase emulado y los archivos de esta carpeta.
  window.NIMBOOK_DEV_CONFIG = Object.assign(${JSON.stringify({
    ...MOCK_CONFIG,
    local: true,
  })}, {
    supabaseUrl: location.origin + '/sb',
    supabaseKey: 'mock-publishable-key',
  });
  window.__NIMBOOK_MEDIA_BASE__ = '.';
  // sesión de demostración solo a propósito con ?demo=1
  if (/demo=1/.test(location.search)) {
    localStorage.setItem('nb.session.v2', JSON.stringify({ userId: 'u_demo', at: Date.now() }));
    localStorage.setItem('nb.cdn.v1', String(Date.now()));
  }
  if (!/nolive=1/.test(location.search) && window.EventSource) {
    var es = new EventSource('/__reload');
    es.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
  }
} catch (e) {}
</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

/* ---------------------------- Supabase emulado --------------------------- */

function dataRel(raw) {
  const rel = String(raw || '').replace(/^\/+/, '');
  if (!rel.startsWith('data/')) throw new Error('ruta de datos inválida');
  return rel;
}

function dataFile(rel) {
  return safeJoin(dataRel(rel), ROOT);
}

async function readDataDoc(rel) {
  try {
    return JSON.parse(await fs.readFile(dataFile(rel), 'utf8'));
  } catch {
    return null;
  }
}

async function writeDataDoc(rel, doc, updatedAt = new Date().toISOString()) {
  const file = dataFile(rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  const when = new Date(updatedAt);
  if (!Number.isNaN(when.getTime())) await fs.utimes(file, when, when);
}

async function handleSupabase(req, res, url) {
  const pathname = url.pathname.replace(/^\/sb/, '');

  if (pathname === '/rest/v1/zuma_docs' || pathname === '/rest/v1/zuma_docs/') {
    const filter = url.searchParams.get('path') || '';
    const rel = filter.startsWith('eq.') ? filter.slice(3) : '';

    if (req.method === 'GET') {
      if (!rel) return send(res, 200, []);
      const doc = await readDataDoc(rel);
      if (doc === null) return send(res, 200, []);
      let updated = new Date().toISOString();
      try { updated = (await fs.stat(dataFile(rel))).mtime.toISOString(); } catch { /* noop */ }
      const select = url.searchParams.get('select') || '*';
      const row = {};
      if (select === '*' || select.includes('path')) row.path = rel;
      if (select === '*' || select.includes('data')) row.data = doc;
      if (select === '*' || select.includes('updated_at')) row.updated_at = updated;
      return send(res, 200, [row]);
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = await readJson(req);
      const rows = Array.isArray(body) ? body : [body];
      const upsert = url.searchParams.has('on_conflict');
      const representation = String(req.headers.prefer || '').includes('return=representation');

      if (req.method === 'PATCH') {
        const current = rel ? await readDataDoc(rel) : null;
        if (!current) return send(res, 200, []);
        const expected = (url.searchParams.get('updated_at') || '').replace(/^eq\./, '');
        let currentUpdated = new Date().toISOString();
        try { currentUpdated = (await fs.stat(dataFile(rel))).mtime.toISOString(); } catch { /* noop */ }
        if (expected && expected !== currentUpdated) return send(res, 200, []);
        const row = rows[0] || {};
        const updatedAt = row.updated_at || new Date().toISOString();
        await writeDataDoc(rel, row.data ?? current, updatedAt);
        return send(res, 200, representation ? [{ path: rel, data: row.data ?? current, updated_at: updatedAt }] : '');
      }

      const out = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || !row.path) continue;
        if (!upsert && await statFile(row.path)) {
          return send(res, 409, {
            code: '23505',
            message: 'duplicate key value violates unique constraint "zuma_docs_pkey"',
            details: null,
            hint: null,
          });
        }
        const updatedAt = row.updated_at || new Date().toISOString();
        await writeDataDoc(row.path, row.data ?? null, updatedAt);
        out.push({ path: row.path, data: row.data ?? null, updated_at: updatedAt });
      }
      return send(res, 201, representation ? out : '', {
        Prefer: 'return=representation',
      });
    }

    if (req.method === 'DELETE') {
      if (rel) await fs.rm(dataFile(rel), { force: true });
      return send(res, 204, '');
    }
  }

  if (pathname.startsWith('/storage/v1/object/public/')) {
    const rest = pathname.slice('/storage/v1/object/public/'.length);
    const [bucket, ...parts] = rest.split('/');
    const key = parts.join('/');
    if (bucket !== 'zuma-media' || !key.startsWith('media/')) {
      return send(res, 404, { message: 'No encontrado' });
    }
    try {
      const body = await fs.readFile(safeJoin(key, ROOT));
      const ext = path.extname(key).toLowerCase();
      return send(res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    } catch {
      return send(res, 404, { message: 'No encontrado' });
    }
  }

  if (pathname.startsWith('/storage/v1/object/')) {
    const rest = pathname.slice('/storage/v1/object/'.length);
    const [bucket, ...parts] = rest.split('/');
    const key = parts.join('/');
    if (bucket !== 'zuma-media' || !key.startsWith('media/')) {
      return send(res, 400, { message: 'bucket o ruta inválida' });
    }

    if (req.method === 'DELETE') {
      const body = await readJson(req);
      const prefixes = Array.isArray(body?.prefixes) ? body.prefixes : [];
      await Promise.all(prefixes.map((prefix) => fs.rm(safeJoin(prefix, ROOT), { force: true })));
      return send(res, 200, []);
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const file = safeJoin(key, ROOT);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.concat(chunks));
    return send(res, 200, { Key: `${bucket}/${key}` });
  }

  return send(res, 404, { message: 'No encontrado' });
}

/* ------------------------------ API GitHub ------------------------------- */

async function handleApi(req, res, url) {
  const segments = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean);

  if (segments[0] === 'user') {
    return send(res, 200, { login: 'mock', id: 1, name: 'Mock User' });
  }

  if (segments[0] === 'repos' && segments.length >= 3) {
    const [, owner, repo, ...rest] = segments;

    if (rest.length === 0) {
      return send(res, 200, {
        full_name: `${owner}/${repo}`,
        private: false,
        default_branch: 'main',
        permissions: { admin: true, push: true, pull: true },
      });
    }

    if (rest[0] === 'git' && rest[1] === 'blobs') {
      const body = await readJson(req);
      const buffer = Buffer.from(body.content || '', body.encoding === 'base64' ? 'base64' : 'utf8');
      const sha = sha1(buffer);
      blobs.set(sha, buffer);
      return send(res, 201, { sha, size: buffer.length });
    }

    if (rest[0] === 'git' && rest[1] === 'trees' && req.method === 'POST') {
      const body = await readJson(req);
      const entries = [];
      for (const entry of body.tree || []) {
        const buffer = blobs.get(entry.sha) || Buffer.alloc(0);
        entries.push({ path: entry.path, mode: entry.mode || '100644', type: 'blob', sha: entry.sha, size: buffer.length });
        const target = path.join(DEST, entry.path);
        if (!target.startsWith(DEST)) continue;
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buffer);
      }
      const sha = sha1(Buffer.from(JSON.stringify(entries)));
      trees.set(sha, entries);
      return send(res, 201, { sha, tree: entries, url: `${url.origin}/api/repos/${owner}/${repo}/git/trees/${sha}` });
    }

    if (rest[0] === 'git' && rest[1] === 'commits' && req.method === 'POST') {
      const body = await readJson(req);
      headSha = sha1(Buffer.from(`${body.message}${Date.now()}${Math.random()}`));
      headTree = body.tree;
      return send(res, 201, {
        sha: headSha, tree: { sha: body.tree }, message: body.message,
        parents: (body.parents || []).map((sha) => ({ sha })),
      });
    }

    if (rest[0] === 'git' && rest[1] === 'commits' && req.method === 'GET') {
      return send(res, 200, { sha: rest[2], tree: { sha: headTree }, parents: [] });
    }

    if (rest[0] === 'git' && rest[1] === 'ref' && rest[2] === 'heads') {
      if (!headSha) return send(res, 404, { message: 'Not Found' });
      return send(res, 200, { ref: `refs/heads/${rest[3]}`, object: { sha: headSha } });
    }

    if (rest[0] === 'git' && rest[1] === 'refs' && req.method === 'POST') {
      const body = await readJson(req);
      headSha = body.sha;
      return send(res, 201, { ref: body.ref, object: { sha: body.sha } });
    }

    if (rest[0] === 'git' && rest[1] === 'refs' && req.method === 'PATCH') {
      const body = await readJson(req);
      headSha = body.sha;
      return send(res, 200, { ref: `refs/heads/${rest[3]}`, object: { sha: body.sha } });
    }

    if (rest[0] === 'git' && rest[1] === 'ref' && rest[2] === 'heads' && req.method === 'GET') {
      if (!headSha) return send(res, 404, { message: 'Not Found' });
      return send(res, 200, { ref: `refs/heads/${rest[3]}`, object: { sha: headSha } });
    }

    if (rest[0] === 'pages') {
      return send(res, 201, { url: `https://${owner}.github.io/${repo}/` });
    }

    if (rest[0] === 'contents') {
      const rel = rest.slice(1).join('/');
      const method = req.method;

      if (method === 'GET') {
        const st = await statFile(rel, DEST);
        if (!st) return send(res, 404, { message: 'Not Found' });

        if (st.isDirectory()) {
          const entries = await fs.readdir(safeJoin(rel, DEST), { withFileTypes: true });
          const list = [];
          for (const entry of entries) {
            const sub = path.posix.join(rel, entry.name);
            const subStat = await statFile(sub, DEST);
            if (!subStat) continue;
            const buf = entry.isFile() ? await fs.readFile(safeJoin(sub, DEST)) : Buffer.alloc(0);
            list.push({
              name: entry.name,
              path: sub,
              type: entry.isDirectory() ? 'dir' : 'file',
              size: subStat.size,
              sha: entry.isFile() ? sha1(buf) : undefined,
            });
          }
          return send(res, 200, list);
        }

        const buf = await fs.readFile(safeJoin(rel, DEST));
        const sha = sha1(buf);
        const etag = `"${sha}"`;
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, { ETag: etag, 'Access-Control-Allow-Origin': '*' });
          return res.end();
        }
        const isText = /\.(json|txt|md|js|css|html)$/i.test(rel);
        return send(res, 200, {
          type: 'file',
          path: rel,
          name: path.posix.basename(rel),
          sha,
          size: buf.length,
          encoding: isText ? 'base64' : 'base64',
          content: buf.toString('base64'),
        }, { ETag: etag });
      }

      if (method === 'PUT') {
        const body = await readJson(req);
        const existing = await statFile(rel, DEST);
        if (existing && existsDir(rel)) return send(res, 422, { message: 'is a directory' });
        if (existing) {
          const current = await fs.readFile(safeJoin(rel, DEST));
          const currentSha = sha1(current);
          if (!body.sha) return send(res, 422, { message: 'sha is required for updates' });
          if (body.sha !== currentSha) {
            return send(res, 409, { message: 'sha does not match' });
          }
        } else if (body.sha) {
          return send(res, 422, { message: 'sha does not exist' });
        }
        const buf = Buffer.from(body.content || '', 'base64');
        const target = safeJoin(rel, DEST);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buf);
        // simula un commit para que la API de Git tenga una referencia
        headTree = headTree || sha1(Buffer.from('tree-inicial'));
        headSha = sha1(Buffer.from(`commit:${rel}:${Date.now()}`));
        return send(res, 200, {
          content: { sha: sha1(buf), path: rel, size: buf.length },
          commit: { sha: crypto.randomUUID().replace(/-/g, '') },
        });
      }

      if (method === 'DELETE') {
        const body = await readJson(req);
        const existing = await statFile(rel, DEST);
        if (!existing) return send(res, 404, { message: 'Not Found' });
        const current = await fs.readFile(safeJoin(rel, DEST));
        if (body.sha && body.sha !== sha1(current)) {
          return send(res, 409, { message: 'sha does not match' });
        }
        await fs.unlink(safeJoin(rel, DEST));
        return send(res, 200, { commit: { sha: crypto.randomUUID().replace(/-/g, '') } });
      }
    }
  }

  return send(res, 404, { message: 'Not Found' });
}

function existsDir(rel) {
  return false;
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

/* ----------------------------- recarga en vivo --------------------------- */

const reloadClients = new Set();

function broadcastReload() {
  for (const client of reloadClients) {
    try { client.write('data: reload\n\n'); } catch { reloadClients.delete(client); }
  }
}

let watchTimer = null;
try {
  const watcher = fsSync.watch(ROOT, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const name = filename.replace(/\\/g, '/');
    if (/^(\.tmp|\.git|node_modules)/.test(name)) return;
    if (/^(\.tmp|\.git|node_modules|data|media)\//.test(name)) return;
    // solo código y estilos: nunca datos, imágenes ni capturas
    if (!/\.(js|mjs|css|html|webmanifest)$/i.test(name)) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(broadcastReload, 220);
  });
  watcher.on('error', () => {});
} catch {
  console.warn('[live] no se pudo vigilar la carpeta; recarga manual');
}

/* -------------------------------- estáticos ------------------------------ */

async function handleStatic(req, res, url) {
  if (url.pathname === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 1500\n\n');
    reloadClients.add(res);
    req.on('close', () => reloadClients.delete(res));
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const st = await statFile(rel);
  if (!st || st.isDirectory()) {
    // SPA fallback
    const fallback = await statFile('/index.html');
    if (!fallback) return send(res, 404, 'Not found');
    const html = await fs.readFile(safeJoin('/index.html'), 'utf8');
    return send(res, 200, injectConfig(html), { 'Content-Type': MIME['.html'] });
  }
  const ext = path.extname(rel).toLowerCase();
  let body = await fs.readFile(safeJoin(rel));
  if (ext === '.html') {
    body = injectConfig(body.toString('utf8'));
  }
  return send(res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
}

/* --------------------------------- server -------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    return send(res, 204, '');
  }
  try {
    if (url.pathname.startsWith('/sb/')) {
      return await handleSupabase(req, res, url);
    }
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    return await handleStatic(req, res, url);
  } catch (err) {
    console.error('[mock]', err);
    return send(res, 500, { message: err.message });
  }
});

let currentPort = PORT;
let attempts = 0;

function start() {
  server.listen(currentPort, '127.0.0.1', () => {
    const address = `http://127.0.0.1:${currentPort}/`;
    console.log('');
    console.log(`  NimbookGR (modo local) en ${address}`);
    console.log('  Los cambios en js/css se recargan solos. Ctrl+C para parar.');
    console.log('');
    if (process.argv.includes('--open') && !process.env.NIMBOOK_NO_BROWSER) {
      try {
        spawnProcess('cmd', ['/c', 'start', '', address], {
          stdio: 'ignore', detached: true, windowsHide: true,
        }).unref();
      } catch {
        console.log('  Abre la dirección en tu navegador.');
      }
    }
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && attempts < 10) {
    attempts += 1;
    currentPort += 1;
    setTimeout(start, 120);
    return;
  }
  console.error('[mock]', err.message);
  process.exit(1);
});

start();
