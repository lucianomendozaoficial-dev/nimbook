/* ==========================================================================
   stories.js — historias de 24 h (fila del feed + visor a pantalla completa)
   ========================================================================== */
import { el, clear, timeAgo, STORY_GRADIENTS, hashCode } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, storiesGrouped, initialsOf, markStorySeen, notify,
} from '../core/store.js';
import { avatarEl, toast, dropdown } from '../core/ui.js';
import { mediaImg, downloadImage, mediaFileName } from '../core/media.js';
import { fetchImageUrl } from '../core/net.js';
import { deleteStory, sendMessage } from '../core/actions.js';
import { navigate } from '../core/router.js';
import { storyFontClass } from '../core/story-fonts.js';
import { playSound } from '../core/sounds.js';
import { verifiedBadge } from './verified-badge.js';

function storyGradient(seed) {
  return STORY_GRADIENTS[hashCode(seed) % STORY_GRADIENTS.length];
}

/* -------------------------------- visor --------------------------------- */

export function openStoryViewer(groups, startIndex = 0) {
  if (!groups.length) return null;
  const me = state.me;
  let groupIndex = Math.max(0, Math.min(startIndex, groups.length - 1));
  let storyIndex = groups[groupIndex]?.startIndex || 0;
  let timer = null;
  let destroyed = false;

  const root = el('div', { class: 'story-viewer', role: 'dialog', 'aria-modal': 'true' });
  const card = el('div', { class: 'sv-card' });
  const bars = el('div', { class: 'sv-bars' });
  const header = el('div', { class: 'sv-head' });
  const image = el('img', { alt: 'Historia', class: 'sv-image' });
  const storyVideo = el('video', {
    class: 'sv-video hide', playsinline: true, autoplay: true,
    preload: 'auto', 'disablepictureinpicture': 'true',
  });
  const caption = el('div', { class: 'sv-text' });

  const menuBtn = el('button', {
    class: 'sv-menu', type: 'button', 'aria-label': 'Opciones de la historia',
  }, icon('more-h', 20));

  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const current = currentStory();
    if (!current) return;
    const { group, story } = current;
    const options = [];
    if (story.image) {
      options.push({
        icon: 'download',
        label: 'Descargar historia',
        onClick: async () => {
          const ok = await downloadImage(story.image, mediaFileName(story.image, 'zuma-historia.jpg'));
          toast(ok ? 'Historia descargada' : 'Se abrió la imagen para guardarla',
            { type: ok ? 'success' : 'info' });
        },
      });
    }
    if (group.user.id === me.id) {
      options.push({
        icon: 'trash',
        label: 'Eliminar historia',
        danger: true,
        onClick: async () => {
          try {
            await deleteStory(story.id);
            toast('Historia eliminada', { type: 'success' });
            destroy();
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      });
    }
    options.push({ icon: 'x', label: 'Cerrar', onClick: () => destroy() });
    dropdown(menuBtn, options, { align: 'end', width: 220 });
  });

  const replyInput = el('input', {
    class: 'sv-reply-input', type: 'text', maxlength: '500',
    placeholder: 'Responder a la historia…', 'aria-label': 'Responder a la historia',
  });
  const replySend = el('button', {
    class: 'sv-reply-send', type: 'submit', 'aria-label': 'Enviar respuesta',
  }, icon('send', 17));
  const replyForm = el('form', { class: 'sv-reply hide' }, replyInput, replySend);
  let replying = false;

  const prevZone = el('button', {
    class: 'sv-nav prev', type: 'button', 'aria-label': 'Anterior',
    onclick: (event) => { event.stopPropagation(); step(-1); },
  });
  const nextZone = el('button', {
    class: 'sv-nav next', type: 'button', 'aria-label': 'Siguiente',
    onclick: (event) => { event.stopPropagation(); step(1); },
  });

  card.append(storyVideo, image, bars, header, caption, prevZone, nextZone, replyForm);
  root.appendChild(card);

  function currentStory() {
    const group = groups[groupIndex];
    return group ? { group, story: group.stories[storyIndex] || group.stories[0] } : null;
  }

  function render() {
    const current = currentStory();
    if (!current) { destroy(); return; }
    const { group, story } = current;
    markStorySeen(story.id);
    replyForm.classList.toggle('hide', group.user.id === me.id);
    replyInput.placeholder = `Responder a ${displayName(group.user)}…`;

    const isVideo = Boolean(story.video);
    if (isVideo) {
      image.classList.add('hide');
      storyVideo.classList.remove('hide');
      storyVideo.pause();
      storyVideo.src = story.video;
      storyVideo.poster = story.poster || story.image || '';
      storyVideo.muted = false;
      try { storyVideo.currentTime = 0; } catch { /* noop */ }
      const play = () => storyVideo.play().catch(() => {
        storyVideo.muted = true;
        storyVideo.play().catch(() => {});
      });
      play();
      storyVideo.onended = () => step(1);
    } else {
      storyVideo.pause();
      storyVideo.removeAttribute('src');
      storyVideo.classList.add('hide');
      image.classList.remove('hide');
      image.style.background = storyGradient(story.id);
      image.src = fetchImageUrl(story.image);
    }

    caption.className = `sv-text ${storyFontClass(story.font)}`;
    caption.textContent = story.text || '';
    caption.classList.toggle('hide', !story.text);

    clear(header);
    header.append(
      el('a', { href: `#/u/${group.user.username}` }, avatarEl(group.user, 'sm')),
      el('div', { class: 'grow' },
        el('div', { class: 'story-name-row' },
          el('div', { class: 'sv-name', text: displayName(group.user) }),
          verifiedBadge(group.user, { size: 14 })),
        el('div', { class: 'sv-time', text: timeAgo(story.createdAt) })),
      menuBtn);

    clear(bars);
    const playback = story.video
      ? Math.min(60, Math.max(0.5, Number(story.duration) || 15)) + 0.4
      : 6.2;
    for (let i = 0; i < group.stories.length; i++) {
      const segment = el('span', { class: 'sv-bar' }, el('i'));
      if (i < storyIndex) segment.firstChild.style.width = '100%';
      if (i === storyIndex) {
        segment.firstChild.style.transition = `width ${playback}s linear`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            segment.firstChild.style.width = '100%';
          });
        });
      }
      bars.appendChild(segment);
    }
    scheduleAdvance(story.video ? playback + 4 : playback);
  }

  function scheduleAdvance(duration = 6.2) {
    clearTimeout(timer);
    timer = setTimeout(() => step(1), duration * 1000);
  }

  function step(delta) {
    const group = groups[groupIndex];
    const nextIndex = storyIndex + delta;
    if (nextIndex < 0) {
      if (groupIndex > 0) {
        groupIndex -= 1;
        storyIndex = groups[groupIndex].startIndex || 0;
      }
    } else if (nextIndex >= group.stories.length) {
      if (groupIndex < groups.length - 1) {
        groupIndex += 1;
        storyIndex = groups[groupIndex].startIndex || 0;
      } else { destroy(); return; }
    } else {
      storyIndex = nextIndex;
    }
    render();
  }

  function onKey(event) {
    if (event.key === 'Escape') destroy();
    else if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(timer);
    storyVideo.pause();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', destroy);
    root.remove();
    document.body.style.overflow = '';
    notify('stories');
  }

  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', destroy);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(root);
  render();

  replyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = currentStory();
    const text = replyInput.value.trim();
    if (!current || !text || replying || current.group.user.id === me?.id) return;
    replying = true;
    replySend.disabled = true;
    try {
      await sendMessage(current.group.user.id, text, {
        replyTo: {
          kind: 'story',
          id: current.story.id,
          title: 'Historia',
          image: current.story.poster || current.story.image || '',
        },
        notificationType: 'story_reply',
      });
      replyInput.value = '';
      playSound('send');
      toast('Respuesta enviada', { type: 'success' });
    } catch (err) {
      toast(err.message || 'No se pudo enviar la respuesta.', { type: 'error' });
    } finally {
      replying = false;
      replySend.disabled = false;
      replyInput.focus();
    }
  });

  return { close: destroy };
}

/* --------------------------------- fila --------------------------------- */

export function mountStories() {
  const me = state.me;
  const root = el('div', { class: 'stories-wrap' });
  const rail = el('div', { class: 'stories' });

  root.append(
    el('div', { class: 'stories-top' },
      el('span', { class: 'stories-title', text: 'Historias' }),
      el('button', {
        class: 'link small', type: 'button',
        onclick: () => navigate('/historias'),
      }, 'Ver todas')),
    rail);

  function render() {
    clear(rail);
    const groups = storiesGrouped(me.id);

    const createTop = el('div', { class: 'create-top', style: { background: storyGradient(me.id) } },
      me.avatar
        ? mediaImg(me.avatar, {
          alt: displayName(me),
          style: { width: '100%', height: '100%', objectFit: 'cover' },
        })
        : el('div', {
          class: 'center',
          style: {
            width: '100%', height: '100%', fontSize: '34px', color: '#fff', fontWeight: '700',
          },
        }, initialsOf(me)));

    const createCard = el('button', {
      class: 'story-card create', type: 'button', 'aria-label': 'Crear historia',
      onclick: () => {
        playSound('open');
        navigate('/historias/crear');
      },
    }, createTop,
    el('div', { class: 'create-bottom' },
      el('span', { class: 'plus' }, icon('plus', 18)),
      el('span', { class: 'create-label', text: 'Crear historia' })));
    rail.appendChild(createCard);

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      const story = group.latest;
      const card = el('button', {
        class: `story-card ${story.image ? '' : 'gradient'}${group.unseen ? '' : ' seen'}`.trim(),
        type: 'button',
        'aria-label': `Historia de ${displayName(group.user)}`,
        onclick: () => openStoryViewer(groups, index),
      });
      if (story.image) {
        card.appendChild(mediaImg(story.image, {
          alt: `Historia de ${displayName(group.user)}`,
          class: 'cover',
        }));
      } else {
        card.appendChild(el('div', {
          class: 'story-post',
          style: { background: storyGradient(story.id) },
          text: story.text || '',
        }));
      }
      if (story.video) {
        card.appendChild(el('span', { class: 'story-video-badge' }, icon('play', 13)));
      }
      if (story.text) {
        card.appendChild(el('div', {
          class: `story-rail-text ${storyFontClass(story.font)}`,
          text: story.text,
        }));
      }
      card.appendChild(el('div', { class: 'sc-shade' }));
      card.appendChild(el('div', { class: 'sc-avatar' }, avatarEl(group.user, 'sm')));
      card.appendChild(el('div', {
        class: 'sc-name',
        text: displayName(group.user),
      }));
      if (group.stories.length > 1) {
        card.appendChild(el('div', {
          class: 'sc-count',
          text: `${group.stories.length} historias`,
        }));
      }
      rail.appendChild(card);
    }
  }

  render();
  return { el: root, render };
}
