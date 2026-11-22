/* ==========================================================================
   media.js — compresión, subida (API con token) y lectura (CDN)
   ========================================================================== */
import { el, uid } from './util.js';
import { fetchImageUrl, fetchImageFallback, putBinary, deleteDoc } from './net.js';

export const MAX_INPUT = 25 * 1024 * 1024;
export const MAX_OUTPUT = 1.4 * 1024 * 1024;
export const MAX_FILES = 10;

export const FOLDERS = {
  posts: 'media/publicaciones',
  avatars: 'media/perfiles',
  covers: 'media/portadas',
  stories: 'media/historias',
  groups: 'media/grupos',
  shop: 'media/tienda',
};

export const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

export function validateImageFile(file) {
  if (!file) return 'No se seleccionó ningún archivo.';
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.type)) {
    return 'Solo se permiten imágenes (JPG, PNG, WEBP, GIF).';
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

async function compress(file, maxSize = 1600, quality = 0.86) {
  const img = await loadImageElement(file);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  let q = quality;
  while (blob && blob.size > MAX_OUTPUT && q > 0.5) {
    q -= 0.08;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
  }
  return { blob, width, height };
}

export async function uploadImage(file, folderKey = 'posts', { maxSize = 1600 } = {}) {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);
  const folder = FOLDERS[folderKey] || folderKey;
  const { blob, width, height } = await compress(file, maxSize);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const name = `${Date.now().toString(36)}-${uid('').slice(1, 7)}.jpg`;
  const path = `${folder}/${name}`;
  await putBinary(path, bytes, 'Zuma: imagen', null);
  return { path, type: 'image/jpeg', width, height, size: bytes.length };
}

export async function deleteMedia(path) {
  if (!path) return;
  await deleteDoc(path, 'Zuma: borrar imagen').catch(() => {});
}

/** Descarga una imagen de la app (publicación, historia o venta). */
export async function downloadImage(path, filename = 'zuma.jpg') {
  if (!path) return false;
  const url = fetchImageUrl(path);
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    return true;
  } catch {
    // Si el navegador no deja descargar el blob, se abre la imagen original.
    try { window.open(url, '_blank', 'noopener'); } catch { /* noop */ }
    return false;
  }
}

export function mediaFileName(path, fallback = 'zuma.jpg') {
  const clean = String(path || '').split('?')[0].split('/').pop();
  return clean && /\.[a-z0-9]{2,5}$/i.test(clean) ? clean : fallback;
}

/* --------------------------- imágenes visibles --------------------------- */

const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

export function mediaImg(path, { alt = '', onClick, className = '', style = {}, eager = false } = {}) {
  const src = path ? fetchImageUrl(path) : '';
  const img = el('img', {
    alt,
    class: className,
    style,
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    src: eager && src ? src : PLACEHOLDER,
    'data-src': src,
    onclick: onClick || null,
  });
  if (!eager && src) observeImage(img);
  img.addEventListener('error', () => {
    const backup = fetchImageFallback(path);
    if (backup && img.dataset.backup !== '1') {
      img.dataset.backup = '1';
      img.src = backup;
      return;
    }
    img.classList.add('img-error');
    img.removeAttribute('src');
  });
  return img;
}

let observer = null;
function observeImage(img) {
  if (!('IntersectionObserver' in window)) {
    img.src = img.dataset.src;
    return;
  }
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target;
        if (target.dataset.src) target.src = target.dataset.src;
        observer.unobserve(target);
      }
    }, { rootMargin: '400px 0px' });
  }
  observer.observe(img);
}

/* ------------------------------ selector -------------------------------- */

export function openFilePicker({ accept = ACCEPTED, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(files);
    }, { once: true });
    input.click();
  });
}
