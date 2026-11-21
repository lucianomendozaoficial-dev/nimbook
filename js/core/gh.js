/* ==========================================================================
   gh.js — cliente mínimo de la API de GitHub (Contents API) para usar el
   repositorio como base de datos: JSON + imágenes.
   ========================================================================== */

export class GitHubError extends Error {
  constructor(message, { status = 0, code = 'github_error', details = null } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export class ConflictError extends GitHubError {
  constructor(message = 'Conflicto de escritura', details) {
    super(message, { status: 409, code: 'conflict', details });
    this.name = 'ConflictError';
  }
}
export class AuthError extends GitHubError {
  constructor(message = 'No pudimos conectar con el servidor') {
    super(message, { status: 401, code: 'auth' });
    this.name = 'AuthError';
  }
}
export class NotFoundError extends GitHubError {
  constructor(path) {
    super(`No existe ${path}`, { status: 404, code: 'not_found' });
    this.name = 'NotFoundError';
    this.path = path;
  }
}
export class RateLimitError extends GitHubError {
  constructor(resetAt) {
    super('Hay mucha actividad en este momento. Espera un minuto y vuelve a intentar.', {
      status: 429, code: 'rate_limit',
    });
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

/* ------------------------- base64 <-> texto ------------------------------- */

export function b64Encode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function b64EncodeText(text) {
  return b64Encode(new TextEncoder().encode(text));
}

export function b64DecodeBytes(b64) {
  const clean = String(b64).replace(/[\r\n\s]/g, '');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function b64DecodeText(b64) {
  return new TextDecoder('utf-8').decode(b64DecodeBytes(b64));
}

/* ------------------------------ cliente ---------------------------------- */

const API_DEFAULT = 'https://api.github.com';

export class GhClient {
  constructor({ owner, repo, branch = 'main', token = '', apiBase = API_DEFAULT, mediaBase = '' } = {}) {
    this.owner = owner || '';
    this.repo = repo || '';
    this.branch = branch || 'main';
    this.token = token || '';
    this.apiBase = (apiBase || API_DEFAULT).replace(/\/$/, '');
    this.mediaBase = (mediaBase || '').replace(/\/$/, '');
    this.rate = { limit: 5000, remaining: 5000, reset: 0 };
    this.private = null;
    this._lastRequest = 0;
  }

  get configured() {
    return Boolean(this.owner && this.repo && this.token);
  }

  get slug() {
    return `${this.owner}/${this.repo}`;
  }

  headers(extra) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  updateRate(res) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining !== null) this.rate.remaining = Number(remaining);
    if (limit !== null) this.rate.limit = Number(limit);
    if (reset !== null) this.rate.reset = Number(reset) * 1000;
  }

  async request(path, { method = 'GET', body, headers, etag, retries = 1 } = {}) {
    const url = `${this.apiBase}${path}`;
    const init = {
      method,
      headers: this.headers({ ...(etag ? { 'If-None-Match': etag } : {}), ...headers }),
      cache: 'no-store',
      redirect: 'follow',
    };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    init.signal = controller.signal;

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new GitHubError('La conexión tardó demasiado. Inténtalo de nuevo.', { code: 'timeout' });
      }
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 700));
        return this.request(path, { method, body, headers, etag, retries: retries - 1 });
      }
      throw new GitHubError(
        'No pudimos conectar. Revisa tu conexión a Internet.',
        { code: 'network' },
      );
    }
    clearTimeout(timer);
    this.updateRate(res);
    this._lastRequest = Date.now();

    if (res.status === 304) return { status: 304, res, data: null };

    if (res.ok) {
      if (method === 'GET' && res.headers.get('content-type')?.includes('json')) {
        const data = await res.json().catch(() => null);
        return { status: res.status, res, data };
      }
      const text = await res.text().catch(() => '');
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { status: res.status, res, data, text };
    }

    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    const msg = payload?.message || res.statusText;
    const remaining = res.headers.get('x-ratelimit-remaining');

    if (res.status === 401) throw new AuthError('La conexión venció. Recarga la página e intenta de nuevo.');
    if (res.status === 404) throw new NotFoundError(path);
    if (res.status === 409 || res.status === 422 || /sha.*does not match|is at .* but expected/i.test(msg)) {
      throw new ConflictError('Alguien más estaba escribiendo. Reintentando…', payload);
    }
    if (res.status === 403 || res.status === 429) {
      if (remaining === '0' || /rate limit/i.test(msg)) {
        const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
        throw new RateLimitError(reset);
      }
      throw new GitHubError(
        'No pudimos guardar los cambios. Inténtalo otra vez.',
        { status: 403, code: 'forbidden', details: payload },
      );
    }
    throw new GitHubError(msg || `Error ${res.status} de GitHub`, {
      status: res.status, details: payload,
    });
  }

  /* ----------------------------- metadatos ------------------------------ */

  async getRepo() {
    const { data } = await this.request(`/repos/${this.owner}/${this.repo}`);
    if (data && typeof data.private === 'boolean') this.private = data.private;
    return data;
  }

  async getUser() {
    const { data } = await this.request('/user');
    return data;
  }

  async checkAccess() {
    const repo = await this.getRepo();
    if (!repo.permissions || (!repo.permissions.push && !repo.permissions.admin)) {
      throw new GitHubError(
        'No pudimos guardar los cambios.',
        { status: 403, code: 'no_write' },
      );
    }
    return repo;
  }

  /* ------------------------- archivos (JSON) ---------------------------- */

  async getFile(path, { ref = this.branch, etag = null } = {}) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    let res;
    try {
      res = await this.request(
        `/repos/${this.owner}/${this.repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`,
        { etag },
      );
    } catch (err) {
      if (err instanceof NotFoundError) return { exists: false, sha: null, text: null, etag: null };
      throw err;
    }
    if (res.status === 304) return { notModified: true, sha: null, text: null, etag };

    const data = res.data;
    if (Array.isArray(data)) return { exists: true, dir: true, entries: data, sha: null };
    if (!data || data.type !== 'file') return { exists: false, sha: null, text: null, etag: null };

    const newEtag = res.res.headers.get('etag');
    let text;
    if (data.content && data.encoding === 'base64') {
      text = b64DecodeText(data.content);
    } else if (data.size > 1_000_000 || data.content === '') {
      // archivos grandes: GitHub no devuelve el contenido en el endpoint contents
      const blob = await this.request(`/repos/${this.owner}/${this.repo}/git/blobs/${data.sha}`);
      text = b64DecodeText(blob.data.content || '');
    } else {
      text = '';
    }
    return { exists: true, sha: data.sha, text, etag: newEtag, size: data.size };
  }

  async putFile(path, contentB64, { sha = null, message = 'Zuma: actualizar datos' } = {}) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const body = { message, content: contentB64, branch: this.branch };
    if (sha) body.sha = sha;
    const { data } = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encoded}`, { method: 'PUT', body },
    );
    return { sha: data?.content?.sha || null, commit: data?.commit || null };
  }

  putText(path, text, opts) {
    return this.putFile(path, b64EncodeText(text), opts);
  }

  async deleteFile(path, { sha, message = 'Zuma: eliminar archivo' } = {}) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const { data } = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encoded}`,
      { method: 'DELETE', body: { message, sha, branch: this.branch } },
    );
    return data;
  }

  async listDir(path = '') {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    try {
      const { data } = await this.request(
        `/repos/${this.owner}/${this.repo}/contents/${encoded}?ref=${encodeURIComponent(this.branch)}`,
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      if (err instanceof NotFoundError) return [];
      throw err;
    }
  }

  /* --------------------------- imágenes -------------------------------- */

  /** Descarga un archivo binario y devuelve un Blob (sirve para repos privados). */
  async getBlob(path) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const { data } = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encoded}?ref=${encodeURIComponent(this.branch)}`,
    );
    if (!data || data.type !== 'file') throw new NotFoundError(path);
    let bytes;
    if (data.content && data.encoding === 'base64') {
      bytes = b64DecodeBytes(data.content);
    } else {
      const blob = await this.request(`/repos/${this.owner}/${this.repo}/git/blobs/${data.sha}`);
      bytes = b64DecodeBytes(blob.data.content || '');
    }
    return new Blob([bytes]);
  }

  cdnUrl(path, bust = false) {
    const clean = path.replace(/^\/+/, '');
    if (this.mediaBase) {
      const base = `${this.mediaBase}/${clean}`;
      return bust ? `${base}?v=${Date.now()}` : base;
    }
    const base = `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${this.branch}/${clean}`;
    return bust ? `${base}?v=${Date.now()}` : base;
  }

  rawUrl(path, bust = false) {
    const clean = path.replace(/^\/+/, '');
    const base = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${clean}`;
    return bust ? `${base}?v=${Date.now()}` : base;
  }
}

/* -------------------- almacenamiento de la conexión ---------------------- */

const LS_KEY = 'nb.gh.v1';

export function loadConnection() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg?.owner || !cfg?.repo || !cfg?.token) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function saveConnection(cfg) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

export function clearConnection() {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

export function makeClient(cfg) {
  return new GhClient({
    owner: cfg.owner, repo: cfg.repo, branch: cfg.branch || 'main',
    token: cfg.token, apiBase: cfg.apiBase || API_DEFAULT, mediaBase: cfg.mediaBase || '',
  });
}

/** Interpreta "usuario/repo" o una URL de GitHub. */
export function parseRepoInput(input = '') {
  const value = String(input).trim().replace(/\.git$/, '').replace(/\/$/, '');
  const urlMatch = value.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, '') };
  const parts = value.split('/').filter(Boolean);
  if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  return null;
}
