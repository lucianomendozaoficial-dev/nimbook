/* ==========================================================================
   net.js — capa de datos de Zuma sobre Supabase.

   - Documentos JSON en la tabla `zuma_docs` (path + data jsonb).
   - Imágenes nuevas en Supabase Storage (bucket público `zuma-media`).
   - La cola, la caché y los eventos de escritura se mantienen igual que antes
     para que las páginas y acciones no cambien.
   ========================================================================== */

const cfg = {
  supabaseUrl: '',
  supabaseKey: '',
  storageBucket: 'zuma-media',
  readBase: '',
};

let sb = null;
let sbSignature = '';

export function configure(next) {
  Object.assign(cfg, next);
  const signature = `${cfg.supabaseUrl}|${cfg.supabaseKey}|${cfg.storageBucket}`;
  if (signature !== sbSignature) {
    sb = null;
    sbSignature = signature;
  }
  return cfg;
}

export function config() {
  return cfg;
}

/* ------------------------------- caché ---------------------------------- */

const MEM = new Map(); // path -> { doc, at }
const PREFIX = 'nb.doc.v7:';
const BUCKET = 30_000;
let version = 0;
const listeners = new Set();

export function onWrite(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emitWrite(path, doc, meta = {}) {
  for (const fn of listeners) {
    try { fn(path, doc, meta); } catch (err) { console.error('[net]', err); }
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

/* ------------------------------- Supabase -------------------------------- */

function client() {
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    throw new Error('Falta configurar Supabase en config.js.');
  }
  if (!window.supabase?.createClient) {
    throw new Error('No se cargó el cliente de Supabase (js/vendor/supabase.js).');
  }
  if (!sb) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return sb;
}

/** Cliente compartido (también lo usa el canal de tiempo real). */
export function supabaseClient() {
  return client();
}

function fail(error, fallback = 'No se pudo conectar con la base de datos.') {
  const err = new Error(error?.message || fallback);
  err.status = error?.code || error?.status || 0;
  err.details = error?.details || '';
  return err;
}

/* ------------------------------- lectura -------------------------------- */

/**
 * URL de una imagen. Las nuevas son URLs absolutas de Supabase Storage.
 * En modo local se sirven desde la carpeta del proyecto; en producción,
 * cualquier ruta relativa se resuelve contra el mismo sitio.
 */
export function fetchImageUrl(path) {
  if (!path) return '';
  if (/^(blob:|data:|https?:)/i.test(path)) return path;
  if (cfg.readBase) {
    const base = cfg.readBase.replace(/\/$/, '');
    return `${base}/${path}`;
  }
  return path;
}

export function fetchImageFallback() {
  return '';
}

export async function fetchDoc(path, { fresh = false, maxAge = BUCKET } = {}) {
  const memory = MEM.get(path);
  if (!fresh && memory && Date.now() - memory.at < maxAge) return memory.doc;

  try {
    const { data, error } = await client()
      .from('zuma_docs')
      .select('data')
      .eq('path', path)
      .limit(1);
    if (error) throw fail(error, `No se pudo leer ${path}.`);
    if (!data?.length) {
      cachePut(path, null);
      return null;
    }
    const doc = data[0].data ?? null;
    cachePut(path, doc);
    return doc;
  } catch (err) {
    const cached = cachePeek(path);
    if (cached !== undefined) return cached;
    throw err;
  }
}

/**
 * Refresca un documento que cambió en otro dispositivo y avisa a la app.
 * El aviso remoto no se vuelve a emitir por el canal de tiempo real.
 */
export async function applyRemote(path) {
  if (!path || !path.startsWith('data/')) return null;
  try {
    forget(path);
    const doc = await fetchDoc(path, { fresh: true });
    emitWrite(path, doc, { remote: true });
    bumpVersion();
    return doc;
  } catch {
    return null;
  }
}

/* ------------------------------- escritura ------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readRemote(path) {
  const { data, error } = await client()
    .from('zuma_docs')
    .select('data,updated_at')
    .eq('path', path)
    .limit(1);
  if (error) throw fail(error, `No se pudo leer ${path}.`);
  if (!data?.length) return { sha: null, doc: null };
  return { sha: data[0].updated_at, doc: data[0].data ?? null };
}

export async function putRemote(path, doc, sha = null) {
  const updatedAt = new Date().toISOString();
  const table = client().from('zuma_docs');

  if (!sha) {
    const { data, error } = await table
      .insert({ path, data: doc, updated_at: updatedAt })
      .select('updated_at');
    if (error) {
      const err = fail(error, 'No se pudieron guardar los cambios.');
      if (error.code === '23505') err.status = 409;
      throw err;
    }
    return data?.[0]?.updated_at || updatedAt;
  }

  const { data, error } = await client()
    .from('zuma_docs')
    .update({ data: doc, updated_at: updatedAt })
    .eq('path', path)
    .eq('updated_at', sha)
    .select('updated_at');
  if (error) throw fail(error, 'No se pudieron guardar los cambios.');
  if (!data?.length) {
    const conflict = new Error('El documento cambió mientras guardábamos.');
    conflict.status = 409;
    throw conflict;
  }
  return data[0].updated_at || updatedAt;
}

export async function deleteRemote(path) {
  const { error } = await client()
    .from('zuma_docs')
    .delete()
    .eq('path', path);
  if (error) throw fail(error, 'No se pudo borrar.');
  return true;
}

export async function putBinary(path, bytes, message = 'Zuma: imagen') {
  const bucket = cfg.storageBucket || 'zuma-media';
  const storage = client().storage.from(bucket);
  const { error } = await storage.upload(path, bytes, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw fail(error, 'No se pudo subir la imagen.');
  const { data } = storage.getPublicUrl(path);
  return data?.publicUrl || '';
}

/** Borra una imagen de Storage a partir de su URL pública. */
export async function deleteImage(url) {
  if (!url || !/^https?:/i.test(url)) return false;
  const bucket = cfg.storageBucket || 'zuma-media';
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = String(url).indexOf(marker);
  if (index < 0) return false;
  const key = String(url).slice(index + marker.length);
  const { error } = await client().storage.from(bucket).remove([key]);
  if (error) throw fail(error, 'No se pudo borrar la imagen.');
  return true;
}

export async function deleteDoc(path, message = 'Zuma: borrar') {
  await deleteRemote(path);
  forget(path);
  bumpVersion();
  return true;
}

/* --------------------------------- cola --------------------------------- */

const queues = new Map();
const RETRIES = 4;

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
 * Encola una modificación de un documento JSON de Supabase.
 * Se agrupan las escrituras del mismo path y se reflejan en la caché al instante.
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

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        sha = await putRemote(path, next, sha);
        cachePut(path, next);
        bumpVersion();
        ops.forEach((op) => op.resolve(next));
        emitWrite(path, next);
        return;
      } catch (err) {
        if (err.status === 409 && attempt < retries) {
          await sleep(300 + Math.random() * 250 + attempt * 250);
          const fresh = await readRemote(path);
          sha = fresh.sha;
          doc = fresh.doc;
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
