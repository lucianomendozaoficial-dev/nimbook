/* ==========================================================================
   pages/reels.js — Reels verticales (video, like; sin comentarios)
   Los videos se guardan en Cloudflare R2 y los metadatos en Supabase.
   ========================================================================== */
import { el, clear, timeAgo, formatCount } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, userById, loadReels, displayName,
} from '../core/store.js';
import { avatarEl, openModal, toast, emptyState } from '../core/ui.js';
import { verifiedBadge } from '../components/verified-badge.js';
import { openFilePicker } from '../core/media.js';
import { compressVideo } from '../core/video.js';
import { uploadR2, r2Configured } from '../core/r2.js';
import { createReel, toggleReelLike, deleteReel } from '../core/actions.js';
import { navigate } from '../core/router.js';

export function reelsPage() {
  const root = el('div', { class: 'reels-page' });
  const feed = el('div', { class: 'reels-feed' });
  let observer = null;
  let muted = true;
  let destroyed = false;

  function likeButton(reel) {
    const liked = (reel.likes || []).includes(state.me?.id);
    return el('button', {
      class: `reel-like${liked ? ' active' : ''}`.trim(),
      type: 'button', 'aria-label': liked ? 'Quitar me gusta' : 'Me gusta',
      onclick: async (event) => {
        event.stopPropagation();
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await toggleReelLike(reel.id);
          refreshLikes();
        } catch (err) {
          toast(err.message || 'No se pudo guardar el me gusta.', { type: 'error' });
        } finally {
          button.disabled = false;
        }
      },
    },
    icon(liked ? 'heart-f' : 'heart', 27),
    el('span', { class: 'reel-like-count', text: formatCount((reel.likes || []).length) }));
  }

  function muteButton(video) {
    return el('button', {
      class: 'reel-mute', type: 'button', 'aria-label': muted ? 'Activar sonido' : 'Silenciar',
      onclick: (event) => {
        event.stopPropagation();
        muted = !muted;
        for (const item of feed.querySelectorAll('video')) item.muted = muted;
        event.currentTarget.replaceChildren(icon(muted ? 'volume-x' : 'volume', 20));
      },
    }, icon(muted ? 'volume-x' : 'volume', 20));
  }

  function slide(reel) {
    const author = userById(reel.userId) || { username: '', name: 'Usuario' };
    const video = el('video', {
      class: 'reel-video', src: reel.video, poster: reel.poster || '',
      playsinline: true, loop: true, muted: true, preload: 'metadata',
    });
    const card = el('article', { class: 'reel-slide', 'data-reel-id': reel.id },
      video,
      el('div', { class: 'reel-shade' }),
      el('div', { class: 'reel-top' },
        el('div', { class: 'reel-brand' }, icon('play', 16), el('span', { text: 'Reels' })),
        muteButton(video)),
      el('div', { class: 'reel-info' },
        el('div', { class: 'reel-author' },
          el('a', { href: `#/u/${author.username}` }, avatarEl(author, 'sm')),
          el('div', { class: 'grow' },
            el('div', { class: 'reel-name-row' },
              el('a', { class: 'reel-name', href: `#/u/${author.username}`, text: displayName(author) }),
              verifiedBadge(author, { size: 14 })),
            el('div', { class: 'reel-time', text: timeAgo(reel.createdAt) }))),
        reel.caption ? el('p', { class: 'reel-caption', text: reel.caption }) : null,
        reel.userId === state.me?.id
          ? el('button', {
            class: 'reel-delete', type: 'button',
            onclick: async () => {
              if (!confirm('¿Borrar este Reel?')) return;
              await deleteReel(reel.id).catch((err) => toast(err.message, { type: 'error' }));
            },
          }, icon('trash', 16), 'Borrar')
          : null),
      el('div', { class: 'reel-actions' }, likeButton(reel)));
    video.addEventListener('click', () => {
      if (video.paused) video.play().catch(() => {}); else video.pause();
    });
    return card;
  }

  function refreshLikes() {
    for (const reel of state.reels) {
      const card = feed.querySelector(`[data-reel-id="${CSS.escape(reel.id)}"]`);
      if (!card) continue;
      const button = card.querySelector('.reel-like');
      if (!button) continue;
      const liked = (reel.likes || []).includes(state.me?.id);
      button.classList.toggle('active', liked);
      button.replaceChildren(
        icon(liked ? 'heart-f' : 'heart', 27),
        el('span', { class: 'reel-like-count', text: formatCount((reel.likes || []).length) }),
      );
    }
  }

  function render() {
    if (destroyed) return;
    observer?.disconnect();
    clear(feed);
    if (!state.reels.length) {
      feed.appendChild(el('div', { class: 'reels-empty' },
        emptyState({
          iconName: 'play',
          title: 'Todavía no hay Reels',
          description: 'Subí el primero: video de hasta 2 minutos, comprimido a 720p.',
          action: el('button', {
            class: 'btn primary', type: 'button', onclick: openUpload,
          }, icon('videocam', 17), 'Subir Reel'),
        })));
      return;
    }
    state.reels.forEach((reel) => feed.appendChild(slide(reel)));
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target.querySelector('video');
        if (!video) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.muted = muted;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    }, { root: feed, threshold: [0, 0.6, 0.9] });
    for (const card of feed.querySelectorAll('.reel-slide')) observer.observe(card);
  }

  function openUpload() {
    if (!r2Configured()) {
      toast('Los videos todavía no están configurados en R2.', { type: 'error' });
      return;
    }
    let file = null;
    let previewUrl = '';
    let publishing = false;
    const pick = el('button', { class: 'btn soft block', type: 'button' },
      icon('videocam', 17), 'Elegir video');
    const fileLabel = el('p', { class: 'muted small', text: 'Video vertical, máximo 2 minutos. Se comprime a 720p.' });
    const caption = el('textarea', {
      class: 'textarea', rows: '3', maxlength: '500',
      placeholder: 'Escribí una descripción…',
    });
    const previewWrap = el('div', { class: 'reel-upload-preview' });
    const status = el('p', { class: 'reel-upload-status' });
    const publish = el('button', { class: 'btn primary block', type: 'submit', text: 'Publicar Reel' });
    publish.disabled = true;

    pick.addEventListener('click', async () => {
      const files = await openFilePicker({ accept: 'video/*' });
      if (!files.length) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      file = files[0];
      previewUrl = URL.createObjectURL(file);
      previewWrap.replaceChildren(el('video', {
        src: previewUrl, controls: true, playsinline: true, muted: true,
      }));
      fileLabel.textContent = `${file.name} · se comprimirá a 720p al publicar`;
      status.textContent = '';
      publish.disabled = false;
    });

    const form = el('form', { class: 'col gap-12' },
      previewWrap,
      pick,
      fileLabel,
      el('div', { class: 'field' }, el('label', { text: 'Descripción' }), caption),
      status,
      publish);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!file || publishing) return;
      publishing = true;
      publish.disabled = true;
      try {
        status.textContent = 'Comprimiendo video a 720p…';
        const output = await compressVideo(file, {
          maxDuration: 120,
          onProgress: (value) => { status.textContent = `Comprimiendo… ${value}%`; },
        });
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const extension = output.blob.type.includes('mp4') ? 'mp4' : 'webm';
        const videoKey = `reels/${state.me.id}/${stamp}.${extension}`;
        status.textContent = 'Subiendo video…';
        const video = await uploadR2(output.blob, videoKey, {
          contentType: output.blob.type,
          onProgress: (value) => { status.textContent = `Subiendo video… ${value}%`; },
        });
        let poster = '';
        let posterKey = '';
        if (output.poster) {
          posterKey = `reels/${state.me.id}/${stamp}.jpg`;
          const uploadedPoster = await uploadR2(output.poster, posterKey, { contentType: 'image/jpeg' });
          poster = uploadedPoster.url;
        }
        await createReel({
          video: video.url,
          videoKey,
          poster,
          posterKey,
          duration: output.duration,
          caption: caption.value,
        });
        api.close();
        toast('Reel publicado', { type: 'success' });
        render();
      } catch (err) {
        publishing = false;
        publish.disabled = false;
        status.textContent = '';
        toast(err.message || 'No se pudo publicar el Reel.', { type: 'error' });
      }
    });

    const api = openModal({
      title: 'Subir Reel',
      size: 'md',
      onClose: () => { if (previewUrl) URL.revokeObjectURL(previewUrl); },
      body: form,
    });
  }

  root.append(
    el('div', { class: 'reels-head' },
      el('div', null,
        el('h1', { text: 'Reels' }),
        el('p', { class: 'muted small', text: 'Videos de hasta 2 minutos. Solo me gusta; sin comentarios.' })),
      el('button', { class: 'btn primary sm', type: 'button', onclick: openUpload },
        icon('videocam', 16), 'Subir Reel')),
    feed,
    el('button', { class: 'btn primary reels-upload-fab', type: 'button', onclick: openUpload },
      icon('plus', 17), 'Subir Reel'));

  loadReels({ fresh: true }).then(() => render()).catch(() => render());
  return {
    el: root,
    onData(topic) {
      if (topic !== 'reels') return;
      if (feed.querySelectorAll('.reel-slide').length === state.reels.length) refreshLikes();
      else render();
    },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      for (const video of root.querySelectorAll('video')) video.pause();
    },
  };
}
