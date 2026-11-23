/* ==========================================================================
   components/video-trimmer.js — elegir el fragmento de un video para Historias
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { openModal } from '../core/ui.js';

function fmt(value) {
  const s = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function openVideoTrimmer({ file, duration = 0, poster = '', onDone = null, onCancel = null } = {}) {
  const url = URL.createObjectURL(file);
  let total = Number(duration) || 0;
  let start = 0;
  let end = Math.min(total || 60, 60);
  let playing = false;
  let closed = false;
  let selected = false;

  const video = el('video', {
    class: 'vt-video', src: url, playsinline: true, preload: 'auto',
    poster: poster || '',
  });
  const previewBtn = el('button', {
    class: 'vt-play', type: 'button', 'aria-label': 'Reproducir fragmento',
  }, icon('play', 18));
  const startLabel = el('span', { class: 'vt-time', text: '0:00' });
  const endLabel = el('span', { class: 'vt-time', text: fmt(end) });
  const durationLabel = el('span', { class: 'vt-selected', text: `${fmt(end)} seleccionados` });
  const startRange = el('input', {
    class: 'vt-range vt-start', type: 'range', min: '0', max: String(total || 60), step: '0.1', value: '0',
    'aria-label': 'Inicio del fragmento',
  });
  const endRange = el('input', {
    class: 'vt-range vt-end', type: 'range', min: '0', max: String(total || 60), step: '0.1', value: String(end),
    'aria-label': 'Fin del fragmento',
  });

  function paint() {
    startLabel.textContent = fmt(start);
    endLabel.textContent = fmt(end);
    durationLabel.textContent = `${fmt(end - start)} seleccionados`;
    startRange.max = String(total || 60);
    endRange.max = String(total || 60);
    startRange.value = String(start);
    endRange.value = String(end);
    const span = Math.max(0.1, total || 60);
    const left = (start / span) * 100;
    const width = Math.max(2, ((end - start) / span) * 100);
    track.style.setProperty('--sel-left', `${left}%`);
    track.style.setProperty('--sel-width', `${width}%`);
  }

  function pause() {
    playing = false;
    video.pause();
    previewBtn.replaceChildren(icon('play', 18));
  }

  function seekToStart() {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(start, Math.max(0, video.duration - 0.05));
    }
  }

  function onStartInput() {
    pause();
    start = Math.max(0, Math.min(Number(startRange.value) || 0, Math.max(0, total - 0.5)));
    if (end - start > 60) end = start + 60;
    if (end <= start) end = Math.min(total || start + 1, start + 1);
    paint();
    seekToStart();
  }

  function onEndInput() {
    pause();
    end = Math.max(start + 0.5, Math.min(Number(endRange.value) || 0, total || 60));
    if (end - start > 60) start = Math.max(0, end - 60);
    paint();
    seekToStart();
  }

  startRange.addEventListener('input', onStartInput);
  endRange.addEventListener('input', onEndInput);

  previewBtn.addEventListener('click', async () => {
    if (playing) { pause(); return; }
    if (Number.isFinite(video.duration) && video.duration > 0) total = video.duration;
    if (video.currentTime < start || video.currentTime >= end) video.currentTime = start;
    try {
      await video.play();
      playing = true;
      previewBtn.replaceChildren(icon('pause', 18));
    } catch { /* noop */ }
  });

  video.addEventListener('timeupdate', () => {
    if (playing && video.currentTime >= end) {
      video.currentTime = start;
    }
  });
  video.addEventListener('ended', pause);
  video.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      total = video.duration;
      end = Math.min(end || total, total, 60);
      if (end <= start) end = Math.min(total, start + 1);
      paint();
    }
  });

  const track = el('div', { class: 'vt-track' },
    el('span', { class: 'vt-selection' }),
    el('span', { class: 'vt-tick', style: { left: '0%' } }),
    el('span', { class: 'vt-tick', style: { left: '25%' } }),
    el('span', { class: 'vt-tick', style: { left: '50%' } }),
    el('span', { class: 'vt-tick', style: { left: '75%' } }),
    el('span', { class: 'vt-tick', style: { left: '100%' } }));

  const confirm = el('button', { class: 'btn primary block', type: 'button' },
    icon('check', 17), 'Usar este fragmento');

  const api = openModal({
    title: 'Recortar video',
    size: 'lg',
    onClose: () => {
      closed = true;
      pause();
      URL.revokeObjectURL(url);
      if (String(poster).startsWith('blob:')) URL.revokeObjectURL(poster);
      if (!selected) onCancel?.();
    },
    body: el('div', { class: 'vt' },
      el('div', { class: 'vt-stage' },
        video,
        el('div', { class: 'vt-stage-shade' }),
        el('button', {
          class: 'vt-close', type: 'button', 'aria-label': 'Cerrar',
          onclick: () => api.close(),
        }, icon('x', 17)),
        el('div', { class: 'vt-badge' }, icon('videocam', 14), 'Historia'),
        el('div', { class: 'vt-stage-foot' },
          previewBtn,
          el('span', { class: 'vt-hint', text: 'Elegí hasta 60 segundos' }))),
      el('div', { class: 'vt-controls' },
        el('div', { class: 'vt-labels' },
          el('div', null, el('span', { class: 'vt-label', text: 'Inicio' }), startLabel),
          durationLabel,
          el('div', { class: 'vt-right' }, el('span', { class: 'vt-label', text: 'Fin' }), endLabel)),
        track,
        el('div', { class: 'vt-ranges' }, startRange, endRange)),
      confirm),
  });

  function paintWhenReady() {
    if (closed) return;
    paint();
    seekToStart();
  }
  video.addEventListener('loadeddata', paintWhenReady, { once: true });
  paint();

  confirm.addEventListener('click', () => {
    if (end - start < 0.4) return;
    selected = true;
    pause();
    onDone?.({ file, start, end, poster: poster || '', duration: end - start });
    api.close();
  });

  return api;
}
