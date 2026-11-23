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
  mediaImg, uploadImage, validateImageFile, openFilePicker,
} from '../core/media.js';
import { compressVideo } from '../core/video.js';
import { uploadR2 } from '../core/r2.js';
import { openGallery } from '../core/gallery.js';
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
        class: `story-tile${group.unseen ? '' : ' seen'}`,
        type: 'button',
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
      if (latest.video) {
        tile.appendChild(el('span', { class: 'story-video-badge' }, icon('play', 13)));
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
          ? el('span', { class: 'story-tile-count', text: `${group.stories.length} historias` })
          : null));
      grid.appendChild(tile);
    });
  }

  root.append(
    el('div', { class: 'page-head stories-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Historias' }),
        el('p', { class: 'muted small', text: 'Lo que compartió tu gente: fotos 24 h y videos 18 h.' })),
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
  let videoBlob = null;
  let posterBlob = null;
  let videoPreviewUrl = '';
  let videoDuration = 0;
  let videoProcessing = 0;
  let processingText = null;
  let processingBar = null;
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
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    previewUrl = '';
    videoPreviewUrl = '';
    videoBlob = null;
    posterBlob = null;
    videoDuration = 0;
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
    openGallery({
      onPick: (file) => {
        const problem = validateImageFile(file);
        if (problem) { toast(problem, { type: 'error' }); return; }
        usePhoto(file);
      },
    });
  }

  function usePhoto(file) {
    stopCamera();
    revokePreview();
    photoFile = file;
    previewUrl = URL.createObjectURL(file);
    stageName = 'publish';
    render();
  }

  async function pickVideo() {
    const files = await openFilePicker({ accept: 'video/*' });
    if (!files.length) return;
    stopCamera();
    revokePreview();
    photoFile = null;
    stageName = 'processing';
    videoProcessing = 0;
    render();
    try {
      const output = await compressVideo(files[0], {
        maxDuration: 60,
        onProgress: (value) => {
          videoProcessing = value;
          if (processingText) processingText.textContent = `Comprimiendo… ${value}%`;
          if (processingBar) processingBar.style.width = `${value}%`;
        },
      });
      videoBlob = output.blob;
      posterBlob = output.poster;
      videoDuration = output.duration;
      videoPreviewUrl = URL.createObjectURL(output.blob);
      stageName = 'publish';
      render();
    } catch (err) {
      stageName = 'camera';
      render();
      toast(err.message || 'No se pudo comprimir el video.', { type: 'error' });
      startCamera();
    }
  }

  async function shoot() {
    if (!stream || busy) return;
    const targetW = 1080;
    const targetH = 1920;
    const videoW = video.videoWidth || 1080;
    const videoH = video.videoHeight || 1920;
    const scale = Math.max(targetW / videoW, targetH / videoH);
    const sourceW = targetW / scale;
    const sourceH = targetH / scale;
    const sourceX = (videoW - sourceW) / 2;
    const sourceY = (videoH - sourceH) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);
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
        el('button', {
          class: 'story-gallery-btn ghost', type: 'button',
          onclick: pickVideo,
        }, icon('videocam', 22), el('span', { text: 'Video' }))));

    if (cameraError || !stream) {
      preview.classList.add('no-camera');
      const message = cameraError || 'Preparando la cámara…';
      preview.appendChild(el('div', { class: 'story-camera-error' },
        el('div', { class: 'big-ic' }, icon('camera', 34)),
        el('p', { text: message }),
        el('div', { class: 'row gap-8 center' },
          el('button', {
            class: 'btn primary', type: 'button', onclick: pickFromGallery,
          }, icon('photo-library', 17), 'Elegir foto'),
          el('button', {
            class: 'btn soft', type: 'button', onclick: pickVideo,
          }, icon('videocam', 17), 'Elegir video'),
          el('button', {
            class: 'btn soft', type: 'button', onclick: startCamera,
          }, icon('refresh', 17), 'Reintentar'))));
    }
    if (stream) video.play().catch(() => {});
    return preview;
  }

  function renderProcessing() {
    processingText = el('div', { class: 'story-processing-text', text: `Comprimiendo… ${videoProcessing}%` });
    processingBar = el('div', { class: 'story-processing-bar' });
    return el('div', { class: 'story-processing' },
      el('div', { class: 'story-processing-card' },
        el('div', { class: 'big-ic' }, icon('videocam', 30)),
        el('div', { class: 'strong', text: 'Preparando tu video' }),
        el('p', { class: 'muted small', text: 'Se comprime a 720p para que cargue rápido. Esto puede tardar lo mismo que dura el video.' }),
        processingText,
        el('div', { class: 'story-processing-track' }, processingBar),
        el('p', { class: 'muted tiny', text: 'Máximo 60 segundos · se verá 18 horas' })));
  }

  function renderPublish() {
    const isVideo = Boolean(videoBlob);
    const publish = el('button', {
      class: 'btn primary block lg', type: 'button',
    }, icon('send', 17), isVideo ? 'Compartir video' : 'Compartir historia');

    publish.addEventListener('click', async () => {
      if (busy || (!photoFile && !videoBlob)) return;
      busy = true;
      publish.disabled = true;
      publish.replaceChildren(el('span', { class: 'spinner', style: { width: '15px', height: '15px' } }));
      publish.append(document.createTextNode(' Publicando…'));
      try {
        if (isVideo) {
          const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const videoKey = `stories/${state.me.id}/${stamp}.${videoBlob.type.includes('mp4') ? 'mp4' : 'webm'}`;
          const video = await uploadR2(videoBlob, videoKey, { contentType: videoBlob.type });
          let poster = '';
          let posterKey = '';
          if (posterBlob) {
            posterKey = `stories/${state.me.id}/${stamp}.jpg`;
            poster = (await uploadR2(posterBlob, posterKey, { contentType: 'image/jpeg' })).url;
          }
          await createStory({
            video: video.url,
            videoKey,
            poster,
            posterKey,
            image: poster,
            duration: videoDuration,
          });
          toast('Video publicado (visible 18 h)', { type: 'success' });
        } else {
          const record = await uploadImage(photoFile, 'stories', { maxSize: 1440 });
          await createStory({ image: record.path });
          toast('Historia publicada (visible 24 h)', { type: 'success' });
        }
        playSound('send');
        navigate('/historias');
      } catch (err) {
        busy = false;
        publish.disabled = false;
        publish.replaceChildren(icon('send', 17), document.createTextNode(isVideo ? ' Compartir video' : ' Compartir historia'));
        toast(err.message || 'No se pudo publicar la historia.', { type: 'error' });
      }
    });

    return el('div', { class: 'story-publish' },
      el('div', { class: 'story-publish-preview' },
        isVideo
          ? el('video', {
            class: 'story-publish-video', src: videoPreviewUrl,
            controls: true, autoplay: true, loop: true, playsinline: true, muted: true,
          })
          : el('img', { src: previewUrl, alt: 'Tu historia' }),
        el('button', {
          class: 'story-round-btn story-publish-close', type: 'button', 'aria-label': 'Cerrar',
          onclick: () => navigate('/historias'),
        }, icon('x', 20))),
      el('div', { class: 'story-publish-actions' },
        publish,
        el('button', {
          class: 'btn soft block', type: 'button',
          onclick: () => { revokePreview(); stageName = 'camera'; startCamera(); },
        }, icon(isVideo ? 'videocam' : 'camera', 17), isVideo ? 'Cambiar video' : 'Cambiar foto')));
  }

  function render() {
    if (destroyed) return;
    clear(stage);
    processingText = null;
    processingBar = null;
    if (stageName === 'processing') stage.appendChild(renderProcessing());
    else if (stageName === 'publish' && (previewUrl || videoPreviewUrl)) stage.appendChild(renderPublish());
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
