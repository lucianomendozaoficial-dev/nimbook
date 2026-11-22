/* ==========================================================================
   postcard.js — tarjeta de publicación (reacciones, comentar y compartir)
   ========================================================================== */
import { el, clear, timeAgo, linkify, formatCount, copyText } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, userById, displayName, fullName, reactionSummary } from '../core/store.js';
import {
  avatarEl, openModal, confirmDialog, toast, dropdown, lightbox,
} from '../core/ui.js';
import { REACTIONS, REACTION_ORDER, reactionIcon } from '../core/reactions.js';
import { playSound } from '../core/sounds.js';
import { mediaImg } from '../core/media.js';
import { setReaction, deletePost, updatePost, toggleSavePost, createPost } from '../core/actions.js';
import { navigate } from '../core/router.js';

const PRIVACY_ICON = { public: 'globe', followers: 'users', friends: 'users', private: 'lock', group: 'groups' };

function privacyIcon(post) {
  return PRIVACY_ICON[post.groupId ? 'group' : (post.privacy || 'public')] || 'globe';
}

function renderMedia(post, container) {
  clear(container);
  const media = (post.media || []).filter(Boolean);
  if (!media.length) {
    container.classList.add('hide');
    return;
  }
  container.classList.remove('hide');
  const paths = media.map((item) => item.path);

  if (media.length === 1) {
    container.appendChild(el('div', { class: 'pm-cell', style: { aspectRatio: 'auto' } },
      mediaImg(media[0].path, {
        alt: 'Foto de la publicación',
        onClick: () => lightbox(paths, 0),
      })));
    return;
  }

  const grid = el('div', { class: `pm-grid n${Math.min(media.length, 4)}` });
  const visible = media.length > 4 ? media.slice(0, 3) : media;
  visible.forEach((item, index) => {
    grid.appendChild(el('div', { class: 'pm-cell' },
      mediaImg(item.path, {
        alt: `Foto ${index + 1}`,
        onClick: () => lightbox(paths, index),
      })));
  });
  if (media.length > 4) {
    grid.appendChild(el('div', { class: 'pm-cell' },
      mediaImg(media[3].path, { alt: 'Más fotos' }),
      el('button', {
        class: 'pm-more', type: 'button', onclick: () => lightbox(paths, 3),
      }, `+${media.length - 3}`)));
  }
  container.appendChild(grid);
}

function renderShared(post, container) {
  clear(container);
  if (!post.shareOf) return;
  const original = state.posts.get(post.shareOf);
  const box = el('a', {
    class: 'shared-post',
    href: original ? `#/p/${original.id}` : '#/inicio',
  });
  if (!original) {
    box.appendChild(el('div', { class: 'muted', style: { padding: '14px' } },
      'La publicación original ya no está disponible.'));
    container.appendChild(box);
    return;
  }
  const author = userById(original.authorId);
  box.append(
    el('div', { class: 'row gap-8', style: { padding: '10px 12px 6px' } },
      avatarEl(author, 'sm'),
      el('div', null,
        el('div', { class: 'post-name', text: displayName(author) }),
        el('div', { class: 'post-meta' },
          el('span', { class: 'post-fullname', text: fullName(author) }),
          el('span', { class: 'dot' }),
          el('span', { text: timeAgo(original.createdAt) })))),
    original.text ? el('div', {
      class: 'clamp-2',
      style: { padding: '0 12px 10px', fontSize: '14.5px', whiteSpace: 'pre-wrap' },
      text: original.text,
    }) : null,
    original.media?.length ? el('div', { style: { background: 'var(--card-2)' } },
      mediaImg(original.media[0].path, {
        alt: 'Foto compartida',
        style: { width: '100%', maxHeight: '320px', objectFit: 'cover' },
      })) : null,
  );
  container.appendChild(box);
}

export function postCard(post, { onUpdate, suggested = false } = {}) {
  const root = el('article', { class: 'card post', 'data-post-id': post.id });
  const postData = () => state.posts.get(post.id) || post;

  const suggestEl = el('div', { class: `post-suggest${suggested ? '' : ' hide'}` },
    icon('sparkles', 14),
    el('span', { text: 'Sugerencia para ti' }),
    el('span', {
      class: 'dim tiny', style: { marginLeft: 'auto' },
      text: 'de alguien que no seguís',
    }));
  const headEl = el('div', { class: 'post-head' });
  const textEl = el('div', { class: 'post-text' });
  const shareEl = el('div');
  const mediaEl = el('div', { class: 'post-media' });
  const statsEl = el('div', { class: 'post-stats' });
  const actionsEl = el('div', { class: 'post-actions' });
  root.append(suggestEl, headEl, textEl, shareEl, mediaEl, statsEl, actionsEl);

  let expanded = false;
  let popoverEl = null;
  let outsideHandler = null;

  /* ------------------------------- cabecera ------------------------------ */

  function renderHead() {
    const current = postData();
    const author = userById(current.authorId) || { name: 'Usuario' };
    const authorLink = `#/u/${author.username || ''}`;
    clear(headEl);

    const menuBtn = el('button', {
      class: 'post-more', type: 'button', 'aria-label': 'Opciones',
      onclick: (event) => { event.stopPropagation(); openMenu(menuBtn); },
    }, icon('more-h', 20));

    headEl.append(
      el('a', { href: authorLink }, avatarEl(author, 'md')),
      el('div', { class: 'who' },
        el('a', { href: authorLink, class: 'post-name', text: displayName(author) }),
        el('div', { class: 'post-meta' },
          el('span', { class: 'post-fullname', text: fullName(author) }),
          el('span', { class: 'dot' }),
          el('a', { href: `#/p/${current.id}`, text: timeAgo(current.createdAt) }),
          current.feeling ? el('span', { text: ` · ${current.feeling}` }) : null,
          current.location ? el('span', { text: ` · ${current.location}` }) : null,
          el('span', { class: 'dot' }),
          icon(privacyIcon(current), 12, { cls: 'dim' }))),
      menuBtn,
    );
  }

  function openMenu(anchor) {
    const current = postData();
    const mine = current.authorId === state.me?.id;
    const saved = (state.me?.saved || []).includes(current.id);
    const items = [
      {
        icon: saved ? 'bookmark-f' : 'bookmark',
        label: saved ? 'Quitar de guardados' : 'Guardar publicación',
        onClick: async () => {
          try {
            const now = await toggleSavePost(current.id);
            toast(now ? 'Guardado' : 'Quitado de guardados', { type: 'success' });
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      },
      {
        icon: 'link',
        label: 'Copiar enlace',
        onClick: async () => {
          const ok = await copyText(`${location.origin}${location.pathname}#/p/${current.id}`);
          toast(ok ? 'Enlace copiado' : 'No se pudo copiar', { type: ok ? 'success' : 'error' });
        },
      },
    ];
    if (mine) {
      items.push({ separator: true });
      items.push({ icon: 'edit', label: 'Editar publicación', onClick: () => openEdit(current) });
      items.push({
        icon: 'trash',
        label: 'Eliminar publicación',
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar publicación?',
            message: 'No se puede deshacer.',
            confirmText: 'Eliminar', danger: true, iconName: 'trash',
          });
          if (!ok) return;
          try {
            await deletePost(current.id);
            toast('Publicación eliminada', { type: 'success' });
            onUpdate?.();
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      });
    }
    dropdown(anchor, items, { width: 240 });
  }

  function openEdit(current) {
    const textarea = el('textarea', { class: 'textarea', rows: '5' });
    textarea.value = current.text || '';
    const api = openModal({
      title: 'Editar publicación',
      body: el('div', { class: 'field' }, textarea),
      footer: el('button', {
        class: 'btn primary block', type: 'button',
        onclick: async () => {
          try {
            await updatePost(current.id, { text: textarea.value.trim() });
            api.close();
            toast('Publicación actualizada', { type: 'success' });
            render();
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, 'Guardar'),
    });
  }

  /* --------------------------------- texto ------------------------------- */

  function renderText() {
    const current = postData();
    clear(textEl);
    if (!current.text) {
      textEl.classList.add('hide');
      return;
    }
    textEl.classList.remove('hide');
    textEl.classList.toggle('collapsed', !expanded && current.text.length > 320);
    textEl.innerHTML = linkify(current.text);
    if (!expanded && current.text.length > 320) {
      const more = el('button', {
        class: 'see-more', type: 'button', text: 'Ver más',
        onclick: () => { expanded = true; renderText(); },
      });
      textEl.appendChild(document.createTextNode(' '));
      textEl.appendChild(more);
    }
  }

  /* ------------------------------ estadísticas --------------------------- */

  function renderStats() {
    const current = postData();
    const summary = reactionSummary(current);
    const comments = current.commentsCount || 0;
    clear(statsEl);

    if (!summary.total && !comments) {
      statsEl.classList.add('hide');
      return;
    }
    statsEl.classList.remove('hide');

    const left = el('div', { class: 'reactions-sum' });
    if (summary.total) {
      const stack = el('span', { class: 'react-stack' });
      for (const type of summary.types.slice(0, 3)) {
        stack.appendChild(el('span', { class: 'rb', title: REACTIONS[type].label },
          reactionIcon(type, 18)));
      }
      left.append(stack, el('span', { class: 'reactions-total', text: formatCount(summary.total) }));
    }

    const right = el('div', { class: 'right' });
    if (comments) {
      right.appendChild(el('a', {
        href: `#/p/${current.id}`, text: `${formatCount(comments)} comentario${comments === 1 ? '' : 's'}`,
      }));
    }
    statsEl.append(left, right);
  }

  /* -------------------------------- acciones ----------------------------- */

  function renderActions() {
    const current = postData();
    const summary = reactionSummary(current);
    const mine = summary.mine;
    clear(actionsEl);

    const likeBtn = el('button', {
      class: `post-act like-act ${mine ? 'liked' : ''}`, type: 'button',
      'aria-label': mine ? REACTIONS[mine].label : 'Me gusta',
    },
    mine ? reactionIcon(mine, 23) : icon('thumbsup', 21),
    el('span', { class: 'post-act-label', text: mine ? REACTIONS[mine].label : 'Me gusta' }));

    const hidePopover = () => {
      if (!popoverEl) return;
      popoverEl.remove();
      popoverEl = null;
      if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler, true);
      outsideHandler = null;
    };

    const onOutside = (event) => {
      if (!popoverEl) return;
      if (popoverEl.contains(event.target) || likeBtn.contains(event.target)) return;
      hidePopover();
    };

    const showPopover = () => {
      hidePopover();
      const bar = el('div', { class: 'react-pop', role: 'menu' });
      for (const type of REACTION_ORDER) {
        bar.appendChild(el('button', {
          class: 'react-option', type: 'button', role: 'menuitem',
          'aria-label': REACTIONS[type].label,
          onclick: (event) => {
            event.stopPropagation();
            hidePopover();
            apply(type);
          },
        }, reactionIcon(type, 34), el('span', { class: 'react-option-label', text: REACTIONS[type].label })));
      }
      actionsEl.appendChild(bar);
      const rect = likeBtn.getBoundingClientRect();
      const boxRect = actionsEl.getBoundingClientRect();
      bar.style.left = `${Math.max(4, Math.min(rect.left - boxRect.left, boxRect.width - bar.offsetWidth - 4))}px`;
      bar.style.bottom = `${boxRect.height + 8}px`;
      popoverEl = bar;
      outsideHandler = onOutside;
      document.addEventListener('pointerdown', onOutside, true);
      playSound('open');
    };

    let timer = null;
    let suppress = false;
    likeBtn.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => { suppress = true; showPopover(); }, 340);
    });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) {
      likeBtn.addEventListener(name, () => clearTimeout(timer));
    }
    likeBtn.addEventListener('click', () => {
      if (suppress) { suppress = false; return; }
      apply(mine ? null : 'like');
    });
    likeBtn.addEventListener('contextmenu', (event) => { event.preventDefault(); showPopover(); });

    const commentBtn = el('button', {
      class: 'post-act', type: 'button', 'aria-label': 'Comentar',
      onclick: () => { playSound('open'); navigate(`/p/${current.id}`); },
    }, icon('message', 21), el('span', { class: 'post-act-label', text: 'Comentar' }));

    const shareBtn = el('button', {
      class: 'post-act', type: 'button', 'aria-label': 'Compartir',
      onclick: () => openShare(current),
    }, icon('share', 21), el('span', { class: 'post-act-label', text: 'Compartir' }));

    actionsEl.append(likeBtn, commentBtn, shareBtn);
  }

  async function apply(type) {
    const before = reactionSummary(postData()).mine;
    if (type === before) return;
    if (type === null) playSound('unlike');
    else if (type === 'like') playSound('like');
    else playSound('reaction');
    try {
      await setReaction(post.id, type);
      renderStats();
      renderActions();
    } catch (err) {
      playSound('error');
      toast(err.message || 'No se pudo reaccionar.', { type: 'error' });
    }
  }

  function openShare(current) {
    const textarea = el('textarea', {
      class: 'textarea', rows: '3', placeholder: 'Escribí algo sobre esto…',
    });
    const original = state.posts.get(current.shareOf || current.id) || current;
    const api = openModal({
      title: 'Compartir publicación',
      body: el('div', { class: 'col gap-12' }, textarea,
        el('p', { class: 'muted small', text: 'Se va a publicar en tu muro con la publicación original.' })),
      footer: el('button', {
        class: 'btn primary block', type: 'button', text: 'Compartir ahora',
        onclick: async (event) => {
          event.currentTarget.disabled = true;
          try {
            await createPost({ text: textarea.value.trim(), shareOf: original.id });
            api.close();
            playSound('send');
            toast('Publicación compartida', { type: 'success' });
          } catch (err) {
            event.currentTarget.disabled = false;
            toast(err.message, { type: 'error' });
          }
        },
      }, 'Compartir ahora'),
    });
  }

  /* -------------------------------- render ------------------------------- */

  function render() {
    renderHead();
    renderText();
    renderShared(postData(), shareEl);
    renderMedia(postData(), mediaEl);
    renderStats();
    renderActions();
  }

  render();
  return {
    el: root,
    update: render,
    destroy: () => {
      popoverEl?.remove();
      if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler, true);
    },
  };
}
