/* ==========================================================================
   gallery.js — galería propia de Zuma (fotos y videos, IndexedDB)
   Guarda copias optimizadas de los archivos que el usuario elige del
   dispositivo. Los videos se comprimen una vez a 720p y quedan listos para
   publicar en Historias sin volver a recodificarlos.
   ========================================================================== */
import { el, clear } from './util.js';
import { icon } from './icons.js';
import { openModal, toast } from './ui.js';
import { openFilePicker } from './media.js';
import { probeVideo, makeVideoPoster } from './video.js';
import { FEATURES } from './features.js';

const DB_NAME = 'zuma-gallery';
const STORE = 'photos';
const VERSION = 1;
const MAX_MEDIA = 160;
const PERMISSION_KEY = 'zuma.gallery.permission.v1';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Sin galería en este navegador.')); return; }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la galería.'));
  });
  return dbPromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('No se pudo leer la imagen.');
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('No se pudo comprimir la imagen.');
  return { blob, width, height };
}

function normalizeKind(record) {
  return record.kind || (record.duration ? 'video' : 'image');
}

export async function listMedia(kind = 'all') {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const rows = await requestResult(tx.objectStore(STORE).getAll());
    return (rows || [])
      .map((record) => ({ ...record, kind: normalizeKind(record) }))
      .filter((record) => kind === 'all' || record.kind === kind)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function addMedia(files, { onProgress = null, limit = 12 } = {}) {
  const list = [...(files || [])].filter(Boolean).slice(0, limit);
  if (!list.length) return [];
  const added = [];
  try {
    const db = await openDb();
    for (const file of list) {
      try {
        const isVideo = /^video\//i.test(file.type || '');
        const isImage = /^image\//i.test(file.type || '');
        if (!isVideo && !isImage) continue;
        let blob;
        let thumbBlob;
        let duration = 0;
        let width = 0;
        let height = 0;
        let kind = 'image';
        if (isVideo) {
          kind = 'video';
          const info = await probeVideo(file);
          const poster = await makeVideoPoster(file, Math.min(0.2, Math.max(0, (info.duration || 0) / 2)));
          URL.revokeObjectURL(info.url);
          blob = file;
          thumbBlob = poster.blob;
          duration = info.duration;
          width = info.width;
          height = info.height;
        } else {
          const output = await compressPhoto(file);
          blob = output.blob;
          thumbBlob = output.blob;
          width = output.width;
          height = output.height;
        }
        const record = {
          id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          kind,
          blob,
          thumbBlob: thumbBlob || null,
          width,
          height,
          duration,
          name: file.name || (kind === 'video' ? 'video.mp4' : 'foto.jpg'),
          createdAt: Date.now(),
        };
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        added.push(record);
      } catch {
        /* un archivo inválido no corta el resto */
      }
    }
    const all = await listMedia();
    for (const old of all.slice(MAX_MEDIA)) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(old.id);
      await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
    }
  } catch {
    return [];
  }
  return added;
}

export async function getMedia(id) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const record = await requestResult(tx.objectStore(STORE).get(id));
    return record ? { ...record, kind: normalizeKind(record) } : null;
  } catch {
    return null;
  }
}

export async function mediaFile(id) {
  const record = await getMedia(id);
  if (!record?.blob) return null;
  return new File([record.blob], record.name || (record.kind === 'video' ? 'video.mp4' : 'foto.jpg'), {
    type: record.blob.type || (record.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
  });
}

function durationLabel(seconds) {
  const value = Math.round(Number(seconds) || 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function hasGalleryPermission() {
  try { return localStorage.getItem(PERMISSION_KEY) === '1'; } catch { return false; }
}

function setGalleryPermission() {
  try { localStorage.setItem(PERMISSION_KEY, '1'); } catch { /* noop */ }
}

async function collectImageFiles() {
  if (typeof window.showDirectoryPicker === 'function') {
    const directory = await window.showDirectoryPicker({ mode: 'read' });
    const out = [];
    async function walk(handle, depth = 0) {
      if (out.length >= 160 || depth > 4) return;
      for await (const entry of handle.values()) {
        if (out.length >= 160) return;
        if (entry.kind === 'file') {
          const file = await entry.getFile().catch(() => null);
          if (file && /^image\//i.test(file.type || '')) out.push(file);
        } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
          await walk(entry, depth + 1);
        }
      }
    }
    await walk(directory);
    return out;
  }
  return openFilePicker({ multiple: true, accept: 'image/*' });
}

/** Galería unificada de fotos y videos. */
export function openGallery({ onPick, initialKind = 'all' } = {}) {
  const allowVideo = FEATURES.videoStories;
  const grid = el('div', { class: 'zuma-gallery-grid' });
  const tabs = el('div', { class: 'zuma-gallery-tabs' });
  const status = el('div', { class: 'zuma-gallery-status hide' });
  const urls = new Set();
  let kind = initialKind;
  let closed = false;
  let importing = false;

  function revokeAll() {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  }

  function paintTabs() {
    clear(tabs);
    for (const item of [
      { id: 'all', label: 'Todo' },
      { id: 'image', label: 'Fotos' },
      ...(allowVideo ? [{ id: 'video', label: 'Videos' }] : []),
    ]) {
      tabs.appendChild(el('button', {
        class: `zuma-gallery-tab${kind === item.id ? ' active' : ''}`.trim(),
        type: 'button',
        onclick: () => { kind = item.id; paintTabs(); render(); },
      }, item.label));
    }
  }

  async function render() {
    if (closed) return;
    revokeAll();
    clear(grid);
    const media = (await listMedia(kind)).filter((record) => allowVideo || record.kind !== 'video');
    if (!media.length) {
      if (!hasGalleryPermission()) {
        const allow = el('button', {
          class: 'btn primary', type: 'button',
          onclick: () => requestAllPhotos(allow),
        }, icon('photo-library', 17), 'Permitir acceso a mis fotos');
        grid.appendChild(el('div', { class: 'zuma-gallery-permission' },
          el('div', { class: 'zuma-gallery-permission-ic' }, icon('photo-library', 32)),
          el('div', { class: 'strong', text: 'Cargá tus fotos una sola vez' }),
          el('p', { class: 'muted small', text: 'Tocá el botón y elegí la carpeta de fotos del teléfono o la computadora. Zuma va a guardar una copia optimizada para que después las elijas sin volver al selector.' }),
          allow,
          el('span', { class: 'muted tiny', text: 'El navegador pide permiso una vez. En equipos sin selector de carpetas se abre el selector de fotos.' })));
        return;
      }
      grid.appendChild(el('div', { class: 'zuma-gallery-empty' },
        el('div', { class: 'big-ic' }, icon(kind === 'video' ? 'videocam' : 'photo-library', 30)),
        el('div', { class: 'strong', text: kind === 'video' ? 'No hay videos todavía' : 'Tu galería está vacía' }),
        el('p', { class: 'muted small', text: allowVideo
          ? 'Tocá el botón + para sumar fotos o videos a tu galería. Los videos se recortan y optimizan al publicar.'
          : 'Tocá el botón + para sumar fotos a tu galería.' })));
      return;
    }
    for (const record of media) {
      const thumb = record.thumbBlob || record.blob;
      const url = URL.createObjectURL(thumb);
      urls.add(url);
      grid.appendChild(el('button', {
        class: `zuma-gallery-item${record.kind === 'video' ? ' is-video' : ''}`,
        type: 'button',
        'aria-label': record.name || record.kind,
        onclick: async () => {
          const file = await mediaFile(record.id);
          if (!file) { toast('No se pudo abrir ese archivo.', { type: 'error' }); return; }
          api.close();
          onPick?.({ kind: record.kind, file, record });
        },
      },
      el('img', { src: url, alt: '', loading: 'lazy' }),
      record.kind === 'video'
        ? el('span', { class: 'zuma-gallery-video' },
          el('span', { class: 'zuma-gallery-play' }, icon('play', 12)),
          el('span', { text: durationLabel(record.duration) }))
        : null));
    }
  }

  async function requestAllPhotos(button) {
    if (importing) return;
    importing = true;
    if (button) button.disabled = true;
    status.classList.remove('hide');
    status.textContent = 'Esperando permiso para leer tus fotos…';
    try {
      const files = await collectImageFiles();
      if (!files.length) {
        toast('No se encontraron fotos para cargar.', { type: 'info' });
        return;
      }
      setGalleryPermission();
      status.textContent = `Cargando ${files.length} fotos…`;
      const added = await addMedia(files, {
        limit: 160,
        onProgress: (value, name) => { status.textContent = `Preparando ${name || 'foto'}… ${value}%`; },
      });
      toast(added.length ? `${added.length} fotos cargadas en tu galería` : 'No se pudieron cargar las fotos.', {
        type: added.length ? 'success' : 'error',
      });
      render();
    } catch (err) {
      if (err?.name !== 'AbortError') toast('No se pudo acceder a las fotos.', { type: 'error' });
    } finally {
      importing = false;
      if (button) button.disabled = false;
      status.classList.add('hide');
    }
  }

  async function importMedia() {
    if (importing) return;
    const files = await openFilePicker({ multiple: true, accept: allowVideo ? 'image/*,video/*' : 'image/*' });
    if (!files.length) return;
    importing = true;
    status.classList.remove('hide');
    status.textContent = 'Preparando archivos…';
    try {
      const added = await addMedia(files, {
        onProgress: (value, name) => { status.textContent = `Preparando ${name || 'video'}… ${value}%`; },
      });
      if (!added.length) {
        toast('No se pudieron agregar esos archivos.', { type: 'error' });
        return;
      }
      toast(added.length === 1 ? 'Archivo agregado' : `${added.length} archivos agregados`, { type: 'success' });
      render();
    } finally {
      importing = false;
      status.classList.add('hide');
    }
  }

  const api = openModal({
    title: 'Galería',
    size: 'lg',
    onClose: () => {
      closed = true;
      revokeAll();
    },
    body: el('div', { class: 'zuma-gallery' },
      el('div', { class: 'zuma-gallery-top' },
        tabs,
        el('button', {
          class: 'zuma-gallery-add', type: 'button', 'aria-label': 'Agregar fotos o videos',
          onclick: importMedia,
        }, icon('plus', 20))),
      status,
      grid),
  });

  paintTabs();
  render();
  return api;
}
