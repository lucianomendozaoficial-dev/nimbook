/* ==========================================================================
   db.js — capa de datos sobre GitHub: caché, lectura con ETag y escrituras
   con reintento optimista (control de concurrencia por sha).
   ========================================================================== */
import { ConflictError, NotFoundError, RateLimitError, AuthError, b64EncodeText } from './gh.js';
import { sleep } from './util.js';

const LS_PREFIX = 'nb.cache.v1:';
const MAX_SNAPSHOTS = 60;

const EMPTY_OBJECT = () => ({});

function snapshotKey(client, path) {
  return `${LS_PREFIX}${client.owner}/${client.repo}@${client.branch}:${path}`;
}

function readSnapshot(client, path) {
  try {
    const raw = localStorage.getItem(snapshotKey(client, path));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(client, path, payload) {
  try {
    localStorage.setItem(snapshotKey(client, path), JSON.stringify(payload));
    pruneSnapshots();
  } catch {
    /* cuota llena: la app funciona igual, solo pierde el arranque rápido */
  }
}

function pruneSnapshots() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX)) {
        let at = 0;
        try { at = JSON.parse(localStorage.getItem(key))?.at || 0; } catch { at = 0; }
        keys.push({ key, at });
      }
    }
    if (keys.length <= MAX_SNAPSHOTS) return;
    keys.sort((a, b) => a.at - b.at);
    for (const entry of keys.slice(0, keys.length - MAX_SNAPSHOTS)) {
      localStorage.removeItem(entry.key);
    }
  } catch {
    /* noop */
  }
}

export class Db {
  constructor(client) {
    this.client = client;
    this.mem = new Map();
    this.queues = new Map();
    this.listeners = new Set();
    this.stats = { reads: 0, writes: 0, notModified: 0, errors: 0 };
    this.offline = false;
  }

  /* ------------------------------ eventos ------------------------------- */

  on(type, handler) {
    const entry = { type, handler };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  emit(type, detail) {
    for (const entry of this.listeners) {
      if (entry.type === type || entry.type === '*') {
        try { entry.handler(detail); } catch (err) { console.error('[db] listener', err); }
      }
    }
  }

  /* ------------------------------- lectura ------------------------------ */

  peek(path) {
    return this.mem.get(path)?.data ?? null;
  }

  status(path) {
    const entry = this.mem.get(path);
    if (!entry) return { loaded: false, loading: false, at: 0, error: null };
    return {
      loaded: entry.loaded, loading: entry.loading, at: entry.at,
      error: entry.error || null, sha: entry.sha, missing: entry.missing,
    };
  }

  hydrate(path) {
    if (this.mem.has(path)) return this.mem.get(path).data;
    const snapshot = readSnapshot(this.client, path);
    if (!snapshot) return null;
    const entry = {
      data: snapshot.data,
      sha: snapshot.sha || null,
      etag: snapshot.etag || null,
      at: snapshot.at || 0,
      loaded: true,
      loading: false,
      fromCache: true,
      missing: !!snapshot.missing,
    };
    this.mem.set(path, entry);
    return entry.data;
  }

  /**
   * Lee un archivo JSON del repo.
   * @param {string} path
   * @param {{force?:boolean, revalidate?:boolean}} options
   */
  async load(path, { force = false, revalidate = false } = {}) {
    const entry = this.mem.get(path);

    if (entry?.loading) return entry.promise;
    if (!force && !revalidate && entry?.loaded) return entry.data;

    const missing = entry?.missing && Date.now() - (entry.at || 0) < 45_000;
    if (missing && entry?.loaded && !force) return entry.data;

    const promise = (async () => {
      const current = this.mem.get(path) || {};
      // Si venimos de una caché local sin sha, forzamos lectura completa.
      const etag = current.etag && !current.missing ? current.etag : null;
      try {
        this.stats.reads += 1;
        const res = await this.client.getFile(path, { etag });

        if (res.notModified) {
          this.stats.notModified += 1;
          const next = { ...current, loaded: true, loading: false, at: Date.now(), error: null };
          this.mem.set(path, next);
          return next.data;
        }

        if (!res.exists) {
          const data = current.data ?? EMPTY_OBJECT();
          const next = {
            ...current, data, sha: null, etag: null, loaded: true, loading: false,
            at: Date.now(), missing: true, error: null,
          };
          this.mem.set(path, next);
          writeSnapshot(this.client, path, { data, sha: null, etag: null, at: next.at, missing: true });
          return data;
        }

        let data;
        try {
          data = res.text ? JSON.parse(res.text) : EMPTY_OBJECT();
        } catch {
          data = EMPTY_OBJECT();
        }
        const next = {
          data, sha: res.sha, etag: res.etag, loaded: true, loading: false,
          at: Date.now(), missing: false, error: null, fromCache: false,
        };
        this.mem.set(path, next);
        writeSnapshot(this.client, path, { data, sha: res.sha, etag: res.etag, at: next.at });
        this.offline = false;
        return data;
      } catch (err) {
        this.stats.errors += 1;
        if (err instanceof NotFoundError) {
          const data = current.data ?? EMPTY_OBJECT();
          const next = {
            ...current, data, loaded: true, loading: false, at: Date.now(), missing: true, error: null,
          };
          this.mem.set(path, next);
          return data;
        }
        const fallback = current.data ?? readSnapshot(this.client, path)?.data ?? EMPTY_OBJECT();
        const next = {
          ...current, data: fallback, loaded: true, loading: false,
          at: current.at || Date.now(), error: err.message,
        };
        this.mem.set(path, next);
        if (err.code === 'network' || err.name === 'GitHubError') this.offline = true;
        this.emit('error', { path, error: err });
        if (err instanceof AuthError) throw err;
        if (err instanceof RateLimitError) throw err;
        return fallback;
      }
    })();

    this.mem.set(path, { ...(entry || {}), loading: true, loaded: entry?.loaded ?? false, promise });
    try {
      const data = await promise;
      this.emit('load', { path, data });
      return data;
    } finally {
      const done = this.mem.get(path);
      if (done) done.loading = false;
    }
  }

  async loadMany(paths, options) {
    return Promise.all(paths.map((path) => this.load(path, options).catch((err) => {
      console.warn('[db] load falló', path, err.message);
      return null;
    })));
  }

  /* ------------------------------ escritura ----------------------------- */

  enqueue(path, task) {
    const prev = this.queues.get(path) || Promise.resolve();
    const next = prev.then(task, task);
    this.queues.set(path, next.catch(() => {}));
    return next;
  }

  /**
   * Aplica una mutación al JSON y la persiste en GitHub.
   * Reintenta al detectar conflictos de sha (otra persona escribió antes).
   * @param {string} path
   * @param {(draft:any, ctx:{sha:string|null, data:any}) => any|Promise<any>} fn
   * @param {{empty?:()=>any, message?:string, retries?:number}} options
   */
  async mutate(path, fn, options = {}) {
    const empty = options.empty || EMPTY_OBJECT;
    const retries = options.retries ?? 7;
    const message = options.message || `NimbookGR: actualizar ${path}`;

    return this.enqueue(path, async () => {
      let lastError = null;
      for (let attempt = 0; attempt < retries; attempt++) {
        let current = this.mem.get(path);
        try {
          const data = await this.load(path, { force: true });
          current = this.mem.get(path);
          const base = data ?? empty();
          const draft = structuredClone(base);
          const result = await fn(draft, { sha: current?.sha || null, data: base });
          if (result === SKIP) return base;
          const next = result === undefined ? draft : result;
          if (next === null) return base;

          const serialized = `${JSON.stringify(next, null, 2)}\n`;
          const previous = base;
          try {
            if (JSON.stringify(next) === JSON.stringify(base)) return base;
          } catch {
            /* comparación falló, seguimos y escribimos */
          }

          try {
            const res = await this.client.putFile(path, b64EncodeText(serialized), {
              sha: current?.sha || null,
              message,
            });
            this.stats.writes += 1;
            const entry = {
              data: next, sha: res.sha, etag: null, loaded: true, loading: false,
              at: Date.now(), missing: false, error: null,
            };
            this.mem.set(path, entry);
            writeSnapshot(this.client, path, { data: next, sha: res.sha, etag: null, at: entry.at });
            this.emit('change', { path, data: next, previous });
            return next;
          } catch (err) {
            if (err instanceof ConflictError) {
              lastError = err;
              // invalidamos el etag/sha para releer de cero
              const entry = this.mem.get(path);
              if (entry) { entry.etag = null; entry.sha = null; }
              this.emit('conflict', { path, attempt });
              await sleep(180 + attempt * 220 + Math.random() * 200);
              continue;
            }
            if (err instanceof RateLimitError || err instanceof AuthError) throw err;
            throw err;
          }
        } catch (err) {
          if (err instanceof ConflictError) {
            lastError = err;
            await sleep(220 + attempt * 220);
            continue;
          }
          throw err;
        }
      }
      throw lastError || new Error('No se pudo guardar: demasiados conflictos.');
    });
  }

  /** Escritura directa de JSON (bootstrap, archivos nuevos). */
  async createFile(path, data, { message } = {}) {
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    return this.enqueue(path, async () => {
      const current = this.mem.get(path);
      const res = await this.client.putFile(path, b64EncodeText(serialized), {
        sha: current?.sha || null,
        message: message || `NimbookGR: crear ${path}`,
      });
      this.stats.writes += 1;
      const entry = {
        data, sha: res.sha, etag: null, loaded: true, loading: false,
        at: Date.now(), missing: false, error: null,
      };
      this.mem.set(path, entry);
      writeSnapshot(this.client, path, { data, sha: res.sha, etag: null, at: entry.at });
      this.emit('change', { path, data, previous: current?.data });
      return data;
    });
  }

  /** Borra un archivo del repo (si existe) sin romper la app. */
  async removeFile(path) {
    const entry = this.mem.get(path) || readSnapshot(this.client, path);
    const sha = entry?.sha;
    if (!sha) return false;
    try {
      await this.client.deleteFile(path, { sha, message: `NimbookGR: eliminar ${path}` });
      this.mem.delete(path);
      try { localStorage.removeItem(snapshotKey(this.client, path)); } catch { /* noop */ }
      return true;
    } catch (err) {
      console.warn('[db] no se pudo borrar', path, err.message);
      return false;
    }
  }

  invalidate(path) {
    const entry = this.mem.get(path);
    if (entry) { entry.etag = null; entry.loaded = false; entry.at = 0; }
  }

  clearCache() {
    this.mem.clear();
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LS_PREFIX)) keys.push(key);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* noop */ }
  }
}

export const SKIP = Symbol('skip');

/* ------------------------- utilidades de colección ------------------------ */

export function asList(doc, key) {
  if (!doc) return [];
  if (Array.isArray(doc)) return doc;
  const list = doc[key];
  return Array.isArray(list) ? list : [];
}

export function ensureDoc(doc, key) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { version: 1, [key]: [] };
  if (!Array.isArray(doc[key])) doc[key] = [];
  if (!doc.version) doc.version = 1;
  return doc;
}

export function upsert(list, item, key = 'id') {
  const index = list.findIndex((entry) => entry[key] === item[key]);
  if (index >= 0) list[index] = { ...list[index], ...item };
  else list.push(item);
  return item;
}

export function removeById(list, id, key = 'id') {
  const index = list.findIndex((entry) => entry[key] === id);
  if (index >= 0) return list.splice(index, 1)[0];
  return null;
}
