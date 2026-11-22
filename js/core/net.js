/* ==========================================================================
   net.js — capa de datos de Zuma

   LECTURA: por jsDelivr (CDN de GitHub), sin token y sin gastar la API.
   ESCRITURA: solo con la API de GitHub y el token, en cola, con reintentos
   ante 409 (alguien más escribió el archivo) y agrupando cambios.
   ========================================================================== */
import { b64Encode, b64EncodeText, b64DecodeText } from './gh.js';

const cfg = { owner: '', repo: '', branch: 'main', token: '', proxy: '', readBase: '', apiBase: '' };

export function configure(next) {
  Object.assign(cfg, next);
  return cfg;
}
export function config() {
  return cfg;
}
export function hasToken() {
  return Boolean(cfg.token);
}

/* ------------------------------- caché ---------------------------------- */

const MEM = new Map(); // path -> { doc, at }
const PREFIX = 'nb.doc.v6:';
const BUCKET = 30_000; // 30 s de caché en el CDN
let version = 0;
const listeners = new Set();

export function onWrite(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emitWrite(path, doc) {
  for (const fn of listeners) {
    try { fn(path, doc); } catch (err) { console.error('[net]', err); }
  }
}

export function bumpVersion() {
  version += 1;
}
export function forget(path) {
  MEM.delete(path);
  try { localStorage.removeItem(PREFIX + path); } catch { /* noop */ }
}

function lsGet(path) {
  try {
    const raw = localStorage.getItem(PREFIX + path);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function lsSet(path, entry) {
  try {
    localStorage.setItem(PREFIX + path, JSON.stringify(entry));
  } catch {
    // sin espacio: limpiamos lo más viejo
    try {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
      keys.slice(0, 20).forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(PREFIX + path, JSON.stringify(entry));
    } catch { /* noop */ }
  }
}

export function cachePeek(path) {
  if (MEM.has(path)) return MEM.get(path).doc;
  const stored = lsGet(path);
  if (stored) {
    MEM.set(path, stored);
    return stored.doc;
  }
  return undefined;
}

export function cachePut(path, doc) {
  const entry = { doc, at: Date.now() };
  MEM.set(path, entry);
  lsSet(path, entry);
}

/* ------------------------------- lectura -------------------------------- */

function stampFor(fresh) {
  const bucket = Math.floor(Date.now() / BUCKET);
  if (fresh) return `${bucket}-${version}-${Math.random().toString(36).slice(2, 8)}`;
  return String(bucket);
}

/** URL de lectura de datos: raw de GitHub (sin caché de rama). */
export function cdnUrl(path, { fresh = false } = {}) {
  if (cfg.readBase) {
    const base = cfg.readBase.replace(/\/$/, '');
    return `${base}/${path}?v=${stampFor(fresh)}`;
  }
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${path}?v=${stampFor(fresh)}`;
}

/** Respaldo por si raw falla: jsDelivr (puede estar algo atrasado). */
function fallbackUrl(path) {
  if (cfg.readBase) return null;
  return `https://cdn.jsdelivr.net/gh/${cfg.owner}/${cfg.repo}@${cfg.branch}/${path}`;
}

export async function fetchDoc(path, { fresh = false, maxAge = BUCKET } = {}) {
  const memory = MEM.get(path);
  if (!fresh && memory && Date.now() - memory.at < maxAge) return memory.doc;

  const sources = [cdnUrl(path, { fresh }), fallbackUrl(path)].filter(Boolean);
  let lastError = null;
  let notFound = 0;

  for (const url of sources) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 404) { notFound += 1; continue; }
      if (!res.ok) throw new Error(`${res.status}`);
      const text = await res.text();
      let doc = null;
      if (text.trim()) {
        try { doc = JSON.parse(text); } catch { doc = null; }
      }
      cachePut(path, doc);
      return doc;
    } catch (err) {
      lastError = err;
    }
  }

  if (notFound === sources.length) {
    cachePut(path, null);
    return null;
  }

  const cached = cachePeek(path);
  if (cached !== undefined) return cached;
  throw lastError || new Error('No se pudo leer ' + path);
}

export function fetchImageUrl(path) {
  if (!path) return '';
  // Vistas previas locales (blob:) o imágenes ya absolutas: se usan tal cual.
  if (/^(blob:|data:|https?:)/i.test(path)) return path;
  if (cfg.readBase) {
    const base = cfg.readBase.replace(/\/$/, '');
    return `${base}/${path}`;
  }
  return `https://cdn.jsdelivr.net/gh/${cfg.owner}/${cfg.repo}@${cfg.branch}/${path}`;
}

/** Respaldo directo para una imagen (si el CDN falla). */
export function fetchImageFallback(path) {
  if (!path || cfg.readBase) return '';
  if (/^(blob:|data:|https?:)/i.test(path)) return '';
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${path}`;
}

/* ------------------------------- escritura ------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function apiUrl(path) {
  if (cfg.apiBase) return `${cfg.apiBase.replace(/\/$/, '')}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  if (cfg.proxy) return `${cfg.proxy.replace(/\/$/, '')}/contents/${path}`;
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  if (body) headers['Content-Type'] = 'application/json';
  if (!cfg.proxy && !cfg.apiBase) headers['X-GitHub-Api-Version'] = '2022-11-28';

  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 404) return { missing: true };
  if (res.status === 401 || res.status === 403) {
    const error = new Error('No pudimos guardar los cambios. Inténtalo más tarde.');
    error.status = res.status;
    throw error;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const error = new Error(data?.message || `No se pudo guardar (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function readRemote(path) {
  const data = await api(path);
  if (data.missing) return { sha: null, doc: null };
  const text = b64DecodeText(data.content || '');
  let doc = null;
  if (text.trim()) {
    try { doc = JSON.parse(text); } catch { doc = null; }
  }
  return { sha: data.sha, doc };
}

export async function putRemote(path, doc, sha, message) {
  const body = {
    message: message || 'Zuma: cambios',
    content: b64EncodeText(`${JSON.stringify(doc, null, 2)}\n`),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  const data = await api(path, { method: 'PUT', body });
  return data?.content?.sha || null;
}

export async function deleteRemote(path, sha, message) {
  return api(path, {
    method: 'DELETE',
    body: { message: message || 'Zuma: borrar', sha, branch: cfg.branch },
  });
}

export async function putBinary(path, bytes, message, sha = null) {
  const body = { message: message || 'Zuma: imagen', content: b64Encode(bytes), branch: cfg.branch };
  if (sha) body.sha = sha;
  const data = await api(path, { method: 'PUT', body });
  return data?.content?.sha || null;
}

export async function deleteDoc(path, message = 'Zuma: borrar') {
  const { sha } = await readRemote(path);
  if (!sha) return false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await deleteRemote(path, sha, message);
      forget(path);
      bumpVersion();
      return true;
    } catch (err) {
      if (err.status === 409 && attempt < 3) {
        await sleep(300 + Math.random() * 250);
        const again = await readRemote(path);
        if (!again.sha) return false;
        continue;
      }
      throw err;
    }
  }
  return false;
}

/* --------------------------------- cola --------------------------------- */

const queues = new Map(); // path -> { ops: [], timer, running, message, waiters }
const RETRIES = 5;

function applyOps(doc, ops) {
  let next = doc === null || doc === undefined ? null : structuredClone(doc);
  let changed = false;
  for (const op of ops) {
    const result = op.updater(next);
    if (result === undefined) continue;
    next = result;
    changed = true;
  }
  return changed ? next : undefined;
}

/**
 * Encola una modificación de un documento JSON.
 * `updater` recibe el documento actual (o null) y devuelve el nuevo (o undefined
 * para no tocarlo). Las actualizaciones se agrupan y se suben juntas.
 */
export function queueDoc(path, updater, { message = 'Zuma: cambios', delay = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    let queue = queues.get(path);
    if (!queue) {
      queue = { ops: [], timer: null, running: false, message };
      queues.set(path, queue);
    }
    queue.ops.push({ updater, resolve, reject });
    queue.message = message;

    // reflejar ya en la caché local (la interfaz no espera a la red)
    const current = cachePeek(path);
    if (current !== undefined) {
      try {
        const next = applyOps(current, [{ updater }]);
        if (next !== undefined) cachePut(path, next);
      } catch { /* el flush lo resolverá */ }
    }

    if (!queue.running) {
      clearTimeout(queue.timer);
      queue.timer = setTimeout(() => flush(path), delay);
    }
  });
}

/** Escritura inmediata (sin agrupar) para operaciones que necesitan confirmación. */
export async function writeNow(path, updater, { message = 'Zuma: cambios' } = {}) {
  await queueDoc(path, updater, { message, delay: 0 });
  return cachePeek(path);
}

export function pendingCount() {
  let total = 0;
  for (const queue of queues.values()) total += queue.ops.length + (queue.running ? 1 : 0);
  return total;
}

export async function flushAll() {
  await Promise.all([...queues.keys()].map((path) => flush(path)));
}

async function flush(path) {
  const queue = queues.get(path);
  if (!queue || queue.running || !queue.ops.length) return;
  const ops = queue.ops.splice(0, queue.ops.length);
  await flushDoc(path, ops, queue.message, RETRIES);
}

async function flushDoc(path, ops, message, retries) {
  const queue = queues.get(path) || { ops: [], running: false };
  queue.running = true;
  try {
    let { sha, doc } = await readRemote(path);
    let next = applyOps(doc, ops);
    if (next === undefined) {
      ops.forEach((op) => op.resolve(doc));
      return;
    }

    for (let attempt = 0; ; attempt += 1) {
      try {
        sha = await putRemote(path, next, sha, message);
        cachePut(path, next);
        bumpVersion();
        ops.forEach((op) => op.resolve(next));
        emitWrite(path, next);
        return;
      } catch (err) {
        if (err.status === 409 && attempt < retries) {
          await sleep(300 + Math.random() * 250 + attempt * 250);
          ({ sha, doc } = await readRemote(path));
          const merged = applyOps(doc, ops);
          if (merged === undefined) {
            ops.forEach((op) => op.resolve(doc));
            return;
          }
          next = merged;
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    ops.forEach((op) => op.reject(err));
  } finally {
    queue.running = false;
    const current = queues.get(path);
    if (current && current.ops.length) {
      clearTimeout(current.timer);
      current.timer = setTimeout(() => flush(path), 300);
    }
  }
}

/* ------------------------------ utilidades ------------------------------ */

export function newId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

export function nowISO() {
  return new Date().toISOString();
}

export { sleep };
