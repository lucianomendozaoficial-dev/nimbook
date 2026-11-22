/* ==========================================================================
   stories.js — historias de 24 h (fila del feed + visor a pantalla completa)
   ========================================================================== */
import { el, clear, timeAgo, STORY_GRADIENTS, hashCode } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, storiesGrouped, initialsOf, markStorySeen, notify,
} from '../core/store.js';
import { avatarEl, toast } from '../core/ui.js';
import { mediaImg, downloadImage, mediaFileName } from '../core/media.js';
import { fetchImageUrl } from '../core/net.js';
import { deleteStory } from '../core/actions.js';
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
  let storyIndex = 0;
  let timer = null;

  const root = el('div', { class: 'story-viewer', role: 'dialog', 'aria-modal': 'true' });
  const card = el('div', { class: 'sv-card' });
  const bars = el('div', { class: 'sv-bars' });
  const header = el('div', { class: 'sv-head' });
  const image = el('img', { alt: 'Historia', class: 'sv-image' });
  const caption = el('div', { class: 'sv-text' });

  const closeBtn = el('button', {
    class: 'sv-close', type: 'button', 'aria-label': 'Cerrar', onclick: () => destroy(),
  }, icon('x', 18));

  const prevZone = el('button', {
    class: 'sv-nav prev', type: 'button', 'aria-label': 'Anterior',
    onclick: (event) => { event.stopPropagation(); step(-1); },
  });
  const nextZone = el('button', {
    class: 'sv-nav next', type: 'button', 'aria-label': 'Siguiente',
    onclick: (event) => { event.stopPropagation(); step(1); },
  });

  card.append(image, bars, header, caption, prevZone, nextZone, closeBtn);
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

    image.style.background = storyGradient(story.id);
    image.src = fetchImageUrl(story.image);

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
      story.image
        ? el('button', {
          class: 'sv-close', type: 'button', 'aria-label': 'Descargar historia',
          style: { position: 'static' },
          onclick: async (event) => {
            event.stopPropagation();
            const ok = await downloadImage(story.image, mediaFileName(story.image, 'zuma-historia.jpg'));
            toast(ok ? 'Historia descargada' : 'Se abrió la imagen para guardarla',
              { type: ok ? 'success' : 'info' });
          },
        }, icon('download', 17))
        : null,
      group.user.id === me.id
        ? el('button', {
          class: 'sv-close', type: 'button', 'aria-label': 'Eliminar historia',
          style: { position: 'static' },
          onclick: async (event) => {
            event.stopPropagation();
            try {
              await deleteStory(story.id);
              toast('Historia eliminada', { type: 'success' });
              destroy();
            } catch (err) { toast(err.message, { type: 'error' }); }
          },
        }, icon('trash', 16))
        : null);

    clear(bars);
    for (let i = 0; i < group.stories.length; i++) {
      const segment = el('span', { class: 'sv-bar' }, el('i'));
      if (i < storyIndex) segment.firstChild.style.width = '100%';
      if (i === storyIndex) {
        segment.firstChild.style.transition = 'width 6s linear';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            segment.firstChild.style.width = '100%';
          });
        });
      }
      bars.appendChild(segment);
    }
    scheduleAdvance();
  }

  function scheduleAdvance() {
    clearTimeout(timer);
    timer = setTimeout(() => step(1), 6200);
  }

  function step(delta) {
    const group = groups[groupIndex];
    const nextIndex = storyIndex + delta;
    if (nextIndex < 0) {
      if (groupIndex > 0) { groupIndex -= 1; storyIndex = groups[groupIndex].stories.length - 1; }
    } else if (nextIndex >= group.stories.length) {
      if (groupIndex < groups.length - 1) { groupIndex += 1; storyIndex = 0; }
      else { destroy(); return; }
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
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    root.remove();
    document.body.style.overflow = '';
    notify('stories');
  }

  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(root);
  render();
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
