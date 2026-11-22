/* ==========================================================================
   gallery.js — galería propia de Zuma (IndexedDB)
   Guarda una copia comprimida de las fotos que el usuario importa del
   dispositivo para que después pueda elegirlas sin abrir el selector nativo.
   ========================================================================== */
import { el, clear } from './util.js';
import { icon } from './icons.js';
import { openModal, toast } from './ui.js';
import { openFilePicker } from './media.js';

const DB_NAME = 'zuma-gallery';
const STORE = 'photos';
const VERSION = 1;
const MAX_PHOTOS = 40;

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

export async function listPhotos() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const rows = await requestResult(tx.objectStore(STORE).getAll());
    return (rows || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function addPhotos(files) {
  const list = [...(files || [])].filter(Boolean).slice(0, 20);
  if (!list.length) return [];
  const added = [];
  try {
    const db = await openDb();
    for (const file of list) {
      if (!/^image\//i.test(file.type || '')) continue;
      try {
        const { blob, width, height } = await compressPhoto(file);
        const record = {
          id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          blob,
          width,
          height,
          name: file.name || 'foto.jpg',
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
        /* una foto inválida no corta el resto */
      }
    }
    // límite de fotos guardadas
    const all = await listPhotos();
    for (const old of all.slice(MAX_PHOTOS)) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(old.id);
      await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
    }
  } catch {
    return [];
  }
  return added;
}

export async function getPhoto(id) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    return await requestResult(tx.objectStore(STORE).get(id));
  } catch {
    return null;
  }
}

export async function photoFile(id) {
  const record = await getPhoto(id);
  if (!record?.blob) return null;
  return new File([record.blob], record.name || 'foto.jpg', { type: record.blob.type || 'image/jpeg' });
}

/** Abre la galería propia. Si está vacía, permite importar fotos del dispositivo. */
export function openGallery({ onPick } = {}) {
  const grid = el('div', { class: 'zuma-gallery-grid' });
  const urls = new Set();
  let closed = false;

  function revokeAll() {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  }

  async function render() {
    if (closed) return;
    revokeAll();
    clear(grid);
    const photos = await listPhotos();
    if (!photos.length) {
      grid.appendChild(el('div', { class: 'zuma-gallery-empty' },
        el('div', { class: 'big-ic' }, icon('photo-library', 30)),
        el('div', { class: 'strong', text: 'Tu galería de Zuma está vacía' }),
        el('p', { class: 'muted small', text: 'Importá fotos del dispositivo una vez y después vas a poder elegirlas desde acá, sin abrir el selector del sistema cada vez.' })));
      return;
    }
    for (const record of photos) {
      const url = URL.createObjectURL(record.blob);
      urls.add(url);
      grid.appendChild(el('button', {
        class: 'zuma-gallery-item', type: 'button',
        'aria-label': record.name || 'Foto',
        onclick: async () => {
          const file = await photoFile(record.id);
          if (!file) { toast('No se pudo abrir esa foto.', { type: 'error' }); return; }
          api.close();
          onPick?.(file);
        },
      }, el('img', { src: url, alt: '', loading: 'lazy' }),
      el('span', { class: 'zuma-gallery-check' }, icon('check', 13))));
    }
  }

  async function importPhotos() {
    const files = await openFilePicker({ multiple: true });
    if (!files.length) return;
    const added = await addPhotos(files);
    if (!added.length) {
      toast('No se pudieron importar las fotos.', { type: 'error' });
      return;
    }
    toast(added.length === 1 ? 'Foto importada a tu galería' : `${added.length} fotos importadas`, { type: 'success' });
    render();
  }

  const api = openModal({
    title: 'Tu galería',
    size: 'lg',
    onClose: () => {
      closed = true;
      revokeAll();
    },
    body: el('div', { class: 'zuma-gallery' },
      el('div', { class: 'zuma-gallery-head' },
        el('p', { class: 'muted small', text: 'Fotos guardadas en este dispositivo. Se comprimen antes de guardarse.' }),
        el('button', {
          class: 'btn soft sm', type: 'button', onclick: importPhotos,
        }, icon('plus', 15), 'Importar del dispositivo')),
      grid),
  });

  render();
  return api;
}
