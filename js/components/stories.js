/* ==========================================================================
   stories.js — historias de 24 h (fila del feed + visor a pantalla completa)
   ========================================================================== */
import { el, clear, timeAgo, STORY_GRADIENTS, hashCode } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, storiesGrouped, userById, initialsOf,
} from '../core/store.js';
import { avatarEl, openModal, toast } from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import { fetchImageUrl } from '../core/net.js';
import { createStory, deleteStory } from '../core/actions.js';

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
  const image = el('img', { alt: 'Historia' });
  const caption = el('div', {
    style: {
      position: 'absolute', left: '16px', right: '16px', bottom: '28px', color: '#fff',
      fontSize: '17px', fontWeight: '600', textShadow: '0 1px 6px rgba(0,0,0,.6)',
      textAlign: 'center',
    },
  });

  const closeBtn = el('button', {
    class: 'sv-close', type: 'button', 'aria-label': 'Cerrar', onclick: () => destroy(),
  }, icon('x', 18));

  const prevZone = el('button', {
    class: 'sv-nav prev', type: 'button', 'aria-label': 'Anterior', style: { background: 'transparent' },
    onclick: (event) => { event.stopPropagation(); step(-1); },
  });
  const nextZone = el('button', {
    class: 'sv-nav next', type: 'button', 'aria-label': 'Siguiente', style: { background: 'transparent' },
    onclick: (event) => { event.stopPropagation(); step(1); },
  });

  card.append(image, bars, header, caption, prevZone, nextZone, closeBtn);
  root.appendChild(card);

  function currentGroup() {
    return groups[groupIndex];
  }

  function render() {
    const group = currentGroup();
    if (!group) { destroy(); return; }
    const story = group.stories[storyIndex] || group.stories[0];
    if (!story) { destroy(); return; }

    image.src = '';
    image.style.background = storyGradient(story.id);
    image.src = fetchImageUrl(story.image);
    caption.textContent = story.text || '';

    clear(header);
    header.append(
      el('a', { href: `#/u/${group.user.username}` }, avatarEl(group.user, 'sm')),
      el('div', { class: 'grow' },
        el('div', { class: 'sv-name', text: displayName(group.user) }),
        el('div', { class: 'sv-time', text: timeAgo(story.createdAt) })),
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
          requestAnimationFrame(() => { segment.firstChild.style.width = '100%'; });
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
    const group = currentGroup();
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
  }

  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(root);
  render();
  return { close: destroy };
}

/* ------------------------------ crear historia --------------------------- */

export async function createStoryFlow() {
  const files = await openFilePicker();
  if (!files.length) return null;
  const problem = validateImageFile(files[0]);
  if (problem) { toast(problem, { type: 'error' }); return null; }

  const objectUrl = URL.createObjectURL(files[0]);
  const input = el('input', {
    class: 'input', placeholder: 'Di algo sobre tu historia…', maxlength: '80',
  });
  const preview = el('div', {
    style: {
      marginTop: '12px', borderRadius: '10px', overflow: 'hidden', background: 'var(--card-2)',
      aspectRatio: '9 / 12', position: 'relative',
    },
  },
  el('img', {
    src: objectUrl, alt: 'Vista previa',
    style: { width: '100%', height: '100%', objectFit: 'cover' },
  }));

  let uploading = false;
  const publish = el('button', { class: 'btn primary block lg', type: 'button' }, 'Compartir historia');
  const api = openModal({
    title: 'Crear historia',
    body: el('div', null, preview, el('div', { class: 'mt-12' }, input)),
    footer: [publish],
    size: 'sm',
    onClose: () => URL.revokeObjectURL(objectUrl),
  });

  publish.addEventListener('click', async () => {
    if (uploading) return;
    uploading = true;
    publish.disabled = true;
    publish.textContent = 'Subiendo…';
    try {
      const record = await uploadImage(files[0], 'stories', { maxSize: 1440 });
      await createStory({ image: record.path, text: input.value.trim() });
      api.close();
      toast('Historia publicada (visible 24 h)', { type: 'success' });
    } catch (err) {
      uploading = false;
      publish.disabled = false;
      publish.textContent = 'Compartir historia';
      toast(err.message || 'No se pudo publicar la historia.', { type: 'error' });
    }
  });

  return api;
}

/* --------------------------------- fila --------------------------------- */

export function mountStories() {
  const me = state.me;
  const root = el('div', { class: 'stories' });

  function render() {
    clear(root);
    const groups = storiesGrouped(me.id);

    // tarjeta "crear historia"
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
      onclick: () => createStoryFlow(),
    }, createTop,
    el('div', { class: 'create-bottom' },
      el('span', { class: 'plus' }, icon('plus', 18)),
      el('span', { class: 'create-label', text: 'Crear historia' })));
    root.appendChild(createCard);

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      const story = group.latest;
      const card = el('button', {
        class: `story-card ${story.image ? '' : 'gradient'}`.trim(),
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
      root.appendChild(card);
    }
  }

  render();
  return { el: root, render };
}
