/* ==========================================================================
   media.js — compresión, subida y visualización de imágenes del repositorio
   ========================================================================== */
import { state } from './store.js';
import { el, uid } from './util.js';
import { b64Encode } from './gh.js';

export const MAX_INPUT = 25 * 1024 * 1024; // 25 MB por archivo
export const MAX_OUTPUT = 1.4 * 1024 * 1024; // ~1.4 MB tras comprimir
export const MAX_FILES = 10;

const FOLDERS = {
  posts: 'media/publicaciones',
  avatars: 'media/perfiles',
  covers: 'media/portadas',
  stories: 'media/historias',
  groups: 'media/grupos',
  chat: 'media/chat',
};

export const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

export function validateImageFile(file) {
  if (!file) return 'No se seleccionó ningún archivo.';
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.type)) {
    return 'Solo se permiten imágenes (JPG, PNG, WEBP, GIF). Los videos todavía no están disponibles.';
  }
  if (file.size > MAX_INPUT) return 'La imagen es demasiado grande (máximo 25 MB).';
  return null;
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

async function drawToCanvas(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * Redimensiona y comprime una imagen antes de subirla.
 * @returns {Promise<{blob:Blob, width:number, height:number}>}
 */
export async function compressImage(file, { maxSize = 1600, quality = 0.85 } = {}) {
  const isGif = file.type === 'image/gif';
  const image = await loadImageElement(file);
  let { naturalWidth: w, naturalHeight: h } = image;
  let scale = Math.min(1, maxSize / Math.max(w, h));
  let qualityNow = quality;

  if (isGif) {
    // los GIF animados se respetan tal cual si son pequeños
    if (file.size <= MAX_OUTPUT) return { blob: file, width: w, height: h };
    scale = Math.min(1, 800 / Math.max(w, h));
  }

  let canvas = await drawToCanvas(image, w * scale, h * scale);
  let blob = await canvasToBlob(canvas, qualityNow);

  // si sigue pesando mucho, bajamos calidad y luego tamaño
  let guard = 0;
  while (blob && blob.size > MAX_OUTPUT && guard < 6) {
    guard += 1;
    if (qualityNow > 0.6) {
      qualityNow = Math.max(0.55, qualityNow - 0.1);
      blob = await canvasToBlob(canvas, qualityNow);
    } else {
      scale *= 0.82;
      canvas = await drawToCanvas(image, w * scale, h * scale);
      blob = await canvasToBlob(canvas, 0.8);
    }
  }

  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return { blob, width: canvas.width, height: canvas.height };
}

/** Sube una imagen al repositorio y devuelve el registro para guardar en JSON. */
export async function uploadImage(file, kind = 'posts', { maxSize, quality, onProgress } = {}) {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);
  if (!state.gh) throw new Error('No pudimos guardar la imagen. Revisa tu conexión.');

  onProgress?.('comprimiendo');
  const { blob, width, height } = await compressImage(file, { maxSize, quality });
  const folder = FOLDERS[kind] || FOLDERS.posts;
  const ext = blob.type === 'image/gif' ? 'gif' : 'jpg';
  const path = `${folder}/${uid()}${Math.random().toString(36).slice(2, 6)}.${ext}`;

  onProgress?.('subiendo');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const base64 = b64Encode(bytes);
  await state.gh.putFile(path, base64, {
    message: `NimbookGR: subir imagen (${kind})`,
  });
  onProgress?.('listo');

  return { path, type: blob.type, w: width, h: height, size: blob.size, at: Date.now() };
}

export async function uploadMany(files, kind, options = {}) {
  const list = Array.from(files).slice(0, MAX_FILES);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const record = await uploadImage(list[i], kind, {
      ...options,
      onProgress: (phase) => options.onProgress?.(phase, i, list.length),
    });
    out.push(record);
  }
  return out;
}

export async function deleteMedia(path) {
  if (!path || !state.db) return false;
  return state.db.removeFile(path);
}

/* --------------------------- visualización ------------------------------- */

const blobCache = new Map();

export function mediaUrl(path) {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  return state.gh ? state.gh.cdnUrl(path) : path;
}

/**
 * <img> con cadena de respaldo: jsDelivr → raw → API de GitHub (repos privados).
 */
export function mediaImg(path, opts = {}) {
  const img = el('img', {
    alt: opts.alt || '',
    class: opts.class || '',
    loading: opts.eager ? 'eager' : (opts.loading || 'lazy'),
    decoding: 'async',
    draggable: 'false',
  });
  if (opts.size) { img.width = opts.size; img.height = opts.size; }
  if (opts.style) Object.assign(img.style, opts.style);
  if (opts.alt === '' || opts.alt === undefined) img.alt = '';

  if (!path) {
    img.src = 'assets/logo/favicon-32.png';
    return img;
  }

  img.src = mediaUrl(path);
  let attempt = 0;
  if (state.gh?.private === true) {
    // repositorio privado: jsDelivr/raw no pueden leerlo, vamos directo a la API
    attempt = 1;
    loadViaApi();
  }
  img.addEventListener('error', async () => {
    attempt += 1;
    if (attempt === 1 && state.gh && !state.gh.mediaBase) {
      img.src = state.gh.rawUrl(path, true);
    } else if (attempt <= 3 && state.gh) {
      await loadViaApi();
    }
  });

  async function loadViaApi() {
    try {
      if (blobCache.has(path)) {
        img.src = blobCache.get(path);
        return;
      }
      const blob = await state.gh.getBlob(path);
      const url = URL.createObjectURL(blob);
      blobCache.set(path, url);
      img.src = url;
    } catch {
      img.classList.add('img-failed');
    }
  }
  if (opts.onClick) img.addEventListener('click', opts.onClick);
  return img;
}

export async function openFilePicker({ multiple = false, accept = ACCEPTED } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, multiple: multiple ? 'multiple' : null });
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (files) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files || [])));
    window.addEventListener('focus', () => setTimeout(() => {
      if (!input.files || !input.files.length) finish([]);
    }, 500), { once: true });
    input.click();
  });
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}
