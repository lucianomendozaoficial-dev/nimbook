/* ==========================================================================
   components/image-cropper.js — recorte de foto de perfil / portada
   Se abre como sección completa y devuelve un File ya recortado.
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { openModal, toast } from '../core/ui.js';

export function openImageCropper({
  file, aspect = 1, title = 'Recortar imagen', outputWidth = 720, outputHeight = 720, onCrop = null,
} = {}) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  let naturalW = 0;
  let naturalH = 0;
  let base = 1;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let stageW = 0;
  let stageH = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let ready = false;

  const stage = el('div', { class: 'crop-stage', style: { aspectRatio: String(aspect) } },
    el('img', { class: 'crop-image', alt: 'Vista previa' }),
    el('div', { class: 'crop-grid' }));
  const canvasImg = stage.querySelector('img');
  const zoomInput = el('input', {
    class: 'crop-zoom', type: 'range', min: '1', max: '3', step: '0.01', value: '1',
    'aria-label': 'Zoom de la imagen',
  });
  const save = el('button', { class: 'btn primary', type: 'button' }, icon('check', 16), 'Usar imagen');
  const cancel = el('button', { class: 'btn', type: 'button', text: 'Cancelar' });

  function clamp() {
    if (!ready) return;
    const w = naturalW * base * zoom;
    const h = naturalH * base * zoom;
    const minX = Math.min(0, stageW - w);
    const minY = Math.min(0, stageH - h);
    offsetX = Math.max(minX, Math.min(0, offsetX));
    offsetY = Math.max(minY, Math.min(0, offsetY));
  }

  function paint() {
    if (!ready) return;
    clamp();
    canvasImg.style.width = `${naturalW * base * zoom}px`;
    canvasImg.style.height = `${naturalH * base * zoom}px`;
    canvasImg.style.left = `${offsetX}px`;
    canvasImg.style.top = `${offsetY}px`;
  }

  function init() {
    const rect = stage.getBoundingClientRect();
    stageW = rect.width;
    stageH = rect.height;
    if (!stageW || !stageH || !naturalW || !naturalH) return;
    base = Math.max(stageW / naturalW, stageH / naturalH);
    zoom = 1;
    zoomInput.value = '1';
    offsetX = (stageW - naturalW * base) / 2;
    offsetY = (stageH - naturalH * base) / 2;
    ready = true;
    paint();
  }

  image.addEventListener('load', () => {
    naturalW = image.naturalWidth;
    naturalH = image.naturalHeight;
    canvasImg.src = url;
    requestAnimationFrame(init);
  });
  image.addEventListener('error', () => toast('No se pudo abrir la imagen.', { type: 'error' }));

  zoomInput.addEventListener('input', () => {
    if (!ready) return;
    const old = zoom;
    zoom = Math.max(1, Math.min(3, Number(zoomInput.value) || 1));
    const cx = stageW / 2;
    const cy = stageH / 2;
    offsetX = cx - ((cx - offsetX) * zoom) / old;
    offsetY = cy - ((cy - offsetY) * zoom) / old;
    paint();
  });

  stage.addEventListener('pointerdown', (event) => {
    if (!ready) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    originX = offsetX;
    originY = offsetY;
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragging || !ready) return;
    offsetX = originX + event.clientX - startX;
    offsetY = originY + event.clientY - startY;
    paint();
  });
  const endDrag = () => { dragging = false; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  const api = openModal({
    title,
    size: 'lg',
    onClose: () => {
      URL.revokeObjectURL(url);
      image.removeAttribute('src');
    },
    body: el('div', { class: 'crop' },
      el('div', { class: 'crop-hint' }, icon('image', 15), 'Arrastrá para mover y usá el zoom para encuadrar.'),
      stage,
      el('div', { class: 'crop-zoom-row' },
        el('span', { class: 'crop-zoom-symbol', text: '−' }),
        zoomInput,
        el('span', { class: 'crop-zoom-symbol', text: '+' }))),
    footer: el('div', { class: 'row gap-8', style: { width: '100%' } },
      cancel,
      save),
  });

  window.addEventListener('resize', () => { ready = false; requestAnimationFrame(init); }, { once: true });
  setTimeout(init, 80);

  cancel.addEventListener('click', () => api.close());
  save.addEventListener('click', async () => {
    if (!ready) return;
    save.disabled = true;
    try {
      const output = document.createElement('canvas');
      output.width = outputWidth;
      output.height = outputHeight;
      const ctx = output.getContext('2d', { alpha: false });
      const scale = base * zoom;
      const sourceX = Math.max(0, -offsetX / scale);
      const sourceY = Math.max(0, -offsetY / scale);
      const sourceW = Math.min(naturalW - sourceX, stageW / scale);
      const sourceH = Math.min(naturalH - sourceY, stageH / scale);
      ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, output.width, output.height);
      const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('No se pudo recortar la imagen.');
      const ext = (file.name || 'foto.jpg').replace(/\.[^.]+$/, '') || 'foto';
      const cropped = new File([blob], `${ext}-recortada.jpg`, { type: 'image/jpeg' });
      api.close();
      onCrop?.(cropped);
    } catch (err) {
      toast(err.message || 'No se pudo recortar la imagen.', { type: 'error' });
      save.disabled = false;
    }
  });

  return api;
}
