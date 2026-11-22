/* ==========================================================================
   pages/stories.js — sección de historias y creador con cámara + galería
   ========================================================================== */
import { el, clear, timeAgo } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, storiesGrouped, displayName,
} from '../core/store.js';
import { avatarEl, emptyState, toast } from '../core/ui.js';
import {
  mediaImg, openFilePicker, uploadImage, validateImageFile,
} from '../core/media.js';
import { createStory } from '../core/actions.js';
import { openStoryViewer } from '../components/stories.js';
import { navigate } from '../core/router.js';
import { storyFontClass } from '../core/story-fonts.js';
import { playSound } from '../core/sounds.js';

/* --------------------------------- sección -------------------------------- */

export function storiesPage() {
  const root = el('div', { class: 'stories-page' });
  const grid = el('div', { class: 'stories-grid' });

  function render() {
    clear(grid);
    const me = state.me;
    const groups = storiesGrouped(me.id);

    if (!groups.length) {
      grid.appendChild(el('div', { class: 'card', style: { gridColumn: '1 / -1' } },
        emptyState({
          iconName: 'story',
          title: 'Todavía no hay historias',
          description: 'Abrí la cámara o elegí una foto de tu galería. Dura 24 horas.',
          action: el('button', {
            class: 'btn primary', type: 'button',
            onclick: () => navigate('/historias/crear'),
          }, icon('camera', 17), 'Crear la primera'),
        })));
      return;
    }

    grid.appendChild(el('button', {
      class: 'story-tile create', type: 'button',
      onclick: () => navigate('/historias/crear'),
    },
    el('div', { class: 'story-tile-create' }, icon('plus', 28)),
    el('div', { class: 'story-tile-create-label', text: 'Crear historia' })));

    groups.forEach((group, index) => {
      const latest = group.latest;
      const tile = el('button', {
        class: 'story-tile', type: 'button',
        'aria-label': `Historia de ${displayName(group.user)}`,
        onclick: () => openStoryViewer(groups, index),
      });
      if (latest.image) {
        tile.appendChild(mediaImg(latest.image, { alt: '', eager: true }));
      } else {
        tile.appendChild(el('div', {
          class: 'story-tile-gradient',
          style: { background: 'linear-gradient(160deg,#1877f2,#8a2be2)' },
        }));
      }
      if (latest.text) {
        tile.appendChild(el('div', {
          class: `story-tile-text ${storyFontClass(latest.font)}`,
          text: latest.text,
        }));
      }
      tile.appendChild(el('div', { class: 'story-tile-shade' }));
      tile.appendChild(el('div', { class: 'story-tile-head' },
        avatarEl(group.user, 'sm'),
        el('span', { class: 'story-tile-name', text: displayName(group.user) })));
      tile.appendChild(el('div', { class: 'story-tile-meta' },
        el('span', { text: timeAgo(latest.createdAt) }),
        group.stories.length > 1
          ? el('span', { class: 'story-tile-count', text: `${group.stories.length} fotos` })
          : null));
      grid.appendChild(tile);
    });
  }

  root.append(
    el('div', { class: 'page-head stories-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Historias' }),
        el('p', { class: 'muted small', text: 'Lo que compartió tu gente en las últimas 24 horas.' })),
      el('button', {
        class: 'btn primary', type: 'button',
        onclick: () => navigate('/historias/crear'),
      }, icon('camera', 17), 'Crear historia')),
    grid);

  render();
  return {
    el: root,
    onData(topic) { if (topic === 'stories' || topic === 'me') render(); },
  };
}

/* --------------------------------- creador -------------------------------- */

export function storyComposerPage() {
  const root = el('div', { class: 'story-composer' });
  const stage = el('div', { class: 'story-stage' });
  let stream = null;
  let photoFile = null;
  let previewUrl = '';
  let facing = 'user';
  let stageName = 'camera';
  let cameraError = '';
  let busy = false;
  let destroyed = false;

  const video = el('video', {
    class: 'story-video', autoplay: true, playsinline: true, muted: true,
  });

  function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach((track) => { try { track.stop(); } catch { /* noop */ } });
    stream = null;
    video.srcObject = null;
  }

  function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  async function startCamera() {
    stopCamera();
    cameraError = '';
    stageName = 'camera';
    render();

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError = 'Este navegador no permite abrir la cámara acá. Elegí una foto de tu galería.';
      render();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      if (destroyed) { stopCamera(); return; }
      video.srcObject = stream;
      video.play().catch(() => {});
      render();
    } catch (err) {
      if (destroyed) return;
      cameraError = err?.name === 'NotAllowedError'
        ? 'No diste permiso para usar la cámara. Podés elegir una foto de tu galería.'
        : 'No pudimos abrir la cámara. Elegí una foto de tu galería.';
      render();
    }
  }

  async function pickFromGallery() {
    const files = await openFilePicker();
    if (!files.length) return;
    const problem = validateImageFile(files[0]);
    if (problem) { toast(problem, { type: 'error' }); return; }
    usePhoto(files[0]);
  }

  function usePhoto(file) {
    stopCamera();
    revokePreview();
    photoFile = file;
    previewUrl = URL.createObjectURL(file);
    stageName = 'publish';
    render();
  }

  async function shoot() {
    if (!stream || busy) return;
    const width = video.videoWidth || 1080;
    const height = video.videoHeight || 1920;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(video, 0, 0, width, height);
    } catch {
      toast('La cámara todavía no está lista. Probá de nuevo en un segundo.', { type: 'error' });
      return;
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) { toast('No se pudo tomar la foto.', { type: 'error' }); return; }
    playSound('open');
    usePhoto(new File([blob], `historia-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  }

  function renderCamera() {
    const preview = el('div', { class: 'story-camera' },
      video,
      el('div', { class: 'story-camera-top' },
        el('button', {
          class: 'story-round-btn', type: 'button', 'aria-label': 'Cerrar',
          onclick: () => navigate('/historias'),
        }, icon('x', 20)),
        el('span', { class: 'grow' }),
        el('button', {
          class: 'story-round-btn', type: 'button', 'aria-label': 'Cambiar cámara',
          onclick: () => { facing = facing === 'user' ? 'environment' : 'user'; startCamera(); },
        }, icon('refresh', 20))),
      el('div', { class: 'story-camera-foot' },
        el('button', {
          class: 'story-gallery-btn', type: 'button',
          onclick: pickFromGallery,
        }, icon('photo-library', 22), el('span', { text: 'Galería' })),
        el('button', {
          class: 'story-shutter', type: 'button', 'aria-label': 'Tomar foto',
          onclick: shoot,
        }, el('span')),
        el('span', { class: 'story-gallery-btn ghost' })));

    if (cameraError || !stream) {
      preview.classList.add('no-camera');
      const message = cameraError || 'Preparando la cámara…';
      preview.appendChild(el('div', { class: 'story-camera-error' },
        el('div', { class: 'big-ic' }, icon('camera', 34)),
        el('p', { text: message }),
        el('div', { class: 'row gap-8 center' },
          el('button', {
            class: 'btn primary', type: 'button', onclick: pickFromGallery,
          }, icon('photo-library', 17), 'Elegir de la galería'),
          el('button', {
            class: 'btn soft', type: 'button', onclick: startCamera,
          }, icon('refresh', 17), 'Reintentar'))));
    }
    if (stream) video.play().catch(() => {});
    return preview;
  }

  function renderPublish() {
    const publish = el('button', {
      class: 'btn primary block lg', type: 'button',
    }, icon('send', 17), 'Compartir historia');

    publish.addEventListener('click', async () => {
      if (busy || !photoFile) return;
      busy = true;
      publish.disabled = true;
      publish.replaceChildren(el('span', { class: 'spinner', style: { width: '15px', height: '15px' } }));
      publish.append(document.createTextNode(' Publicando…'));
      try {
        const record = await uploadImage(photoFile, 'stories', { maxSize: 1440 });
        await createStory({ image: record.path });
        playSound('send');
        toast('Historia publicada (visible 24 h)', { type: 'success' });
        navigate('/historias');
      } catch (err) {
        busy = false;
        publish.disabled = false;
        publish.replaceChildren(icon('send', 17), document.createTextNode(' Compartir historia'));
        toast(err.message || 'No se pudo publicar la historia.', { type: 'error' });
      }
    });

    return el('div', { class: 'story-publish' },
      el('div', { class: 'story-publish-preview' },
        el('img', { src: previewUrl, alt: 'Tu historia' }),
        el('button', {
          class: 'story-round-btn story-publish-close', type: 'button', 'aria-label': 'Cerrar',
          onclick: () => navigate('/historias'),
        }, icon('x', 20))),
      el('div', { class: 'story-publish-actions' },
        publish,
        el('button', {
          class: 'btn soft block', type: 'button',
          onclick: () => { stageName = 'camera'; startCamera(); },
        }, icon('camera', 17), 'Cambiar foto')));
  }

  function render() {
    if (destroyed) return;
    clear(stage);
    if (stageName === 'publish' && previewUrl) stage.appendChild(renderPublish());
    else stage.appendChild(renderCamera());
  }

  root.append(stage);

  render();
  startCamera();

  return {
    el: root,
    onData() {},
    destroy() {
      destroyed = true;
      stopCamera();
      revokePreview();
    },
  };
}
