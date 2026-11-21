/* ==========================================================================
   postcard.js — tarjeta de publicación con reacciones, comentarios y compartir
   ========================================================================== */
import { el, clear, timeAgo, linkify, formatCount, isTouch, copyText } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, userById, displayName, reactionSummary, commentsFor, rootComments, repliesTo,
  canSeePost,
} from '../core/store.js';
import {
  avatarEl, openModal, confirmDialog, toast, dropdown, lightbox,
  emojiPicker, closeMenus,
} from '../core/ui.js';
import { REACTIONS, REACTION_ORDER, reactionIcon } from '../core/reactions.js';
import { playSound } from '../core/sounds.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import {
  setReaction, addComment, deleteComment, setCommentReaction, deletePost, updatePost,
  toggleSavePost, createPost,
} from '../core/actions.js';
import { navigate } from '../core/router.js';
import { ValidationError } from '../core/auth.js';

const drafts = new Map(); // postId -> { text, replyToId }

const PRIVACY_ICON = { public: 'globe', friends: 'users', private: 'lock', group: 'groups' };

function privacyIcon(post) {
  return PRIVACY_ICON[post.groupId ? 'group' : (post.privacy || 'public')] || 'globe';
}

function commentDraft(postId) {
  if (!drafts.has(postId)) drafts.set(postId, { text: '', replyToId: null });
  return drafts.get(postId);
}

/* ------------------------------- multimedia ------------------------------ */

function renderMedia(post, container) {
  clear(container);
  const media = (post.media || []).filter(Boolean);
  if (!media.length) {
    container.classList.add('hide');
    return;
  }
  container.classList.remove('hide');
  const paths = media.map((m) => m.path);

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
    const cell = el('div', { class: 'pm-cell' },
      mediaImg(item.path, {
        alt: `Foto ${index + 1}`,
        onClick: () => lightbox(paths, index),
      }));
    grid.appendChild(cell);
  });
  if (media.length > 4) {
    const rest = media.length - 3;
    const cell = el('div', { class: 'pm-cell' },
      mediaImg(media[3].path, { alt: 'Más fotos' }),
      el('button', {
        class: 'pm-more', type: 'button', onclick: () => lightbox(paths, 3),
      }, `+${rest}`));
    grid.appendChild(cell);
  }
  container.appendChild(grid);
}

/* -------------------------------- compartido ----------------------------- */

function renderShared(post, container) {
  clear(container);
  if (!post.shareOf) return;
  const original = state.posts.find((p) => p.id === post.shareOf);
  const box = el('a', {
    class: 'shared-post',
    href: original ? `#/p/${original.id}` : '#/feed',
    style: {
      display: 'block', margin: '0 16px 12px', border: '1px solid var(--line-soft)',
      borderRadius: '8px', overflow: 'hidden', textDecoration: 'none',
    },
  });
  if (!original) {
    box.appendChild(el('div', { style: { padding: '16px' }, class: 'muted' },
      'La publicación original ya no está disponible.'));
    container.appendChild(box);
    return;
  }
  const author = userById(original.authorId);
  const headRow = el('div', { style: { padding: '10px 12px 6px' }, class: 'row gap-8' },
    avatarEl(author, 'sm'),
    el('div', null,
      el('div', { class: 'post-name', text: displayName(author) }),
      el('div', { class: 'post-meta', text: timeAgo(original.createdAt) })));
  box.appendChild(headRow);
  if (original.text) {
    box.appendChild(el('div', {
      class: 'clamp-2',
      style: { padding: '0 12px 10px', fontSize: '14.5px', whiteSpace: 'pre-wrap' },
      text: original.text,
    }));
  }
  if (original.media?.length) {
    box.appendChild(el('div', { style: { background: 'var(--card-2)' } },
      mediaImg(original.media[0].path, {
        alt: 'Foto compartida',
        style: { width: '100%', maxHeight: '320px', objectFit: 'cover' },
      })));
  }
  container.appendChild(box);
}

/* ------------------------------- tarjeta --------------------------------- */

export function postCard(post, { onUpdate } = {}) {
  const me = state.me;
  const root = el('article', { class: 'card post', 'data-post-id': post.id });

  const headEl = el('div', { class: 'post-head' });
  const textEl = el('div', { class: 'post-text' });
  const shareEl = el('div');
  const mediaEl = el('div', { class: 'post-media' });
  const statsEl = el('div', { class: 'post-stats' });
  const actionsEl = el('div', { class: 'post-actions' });
  const commentsEl = el('div', { class: 'comments hide' });
  root.append(headEl, textEl, shareEl, mediaEl, statsEl, actionsEl, commentsEl);

  let expanded = false;
  let showAll = false;
  let commentsOpen = false;
  let replyTo = null;
  let pendingMedia = null;
  const expandedReplies = new Set();
  let popoverEl = null;
  let outsideHandler = null;

  const postData = () => state.posts.find((p) => p.id === post.id) || post;

  /* ------------------------------- cabecera ------------------------------ */

  function renderHead() {
    const current = postData();
    const author = userById(current.authorId) || { name: 'Usuario' };
    clear(headEl);

    const authorLink = `#/u/${author.username || ''}`;
    const who = el('div', { class: 'who' },
      el('a', { href: authorLink, class: 'post-name', text: displayName(author) }),
      el('div', { class: 'post-meta' },
        el('a', { href: `#/p/${current.id}`, class: 'muted', text: timeAgo(current.createdAt) }),
        current.feeling ? el('span', { class: 'muted', text: ` · ${current.feeling}` }) : null,
        current.location ? el('span', { class: 'muted', text: ` · ${current.location}` }) : null,
        el('span', { class: 'dot' }),
        icon(privacyIcon(current), 12, { cls: 'dim' }),
        current.updatedAt && current.updatedAt !== current.createdAt
          ? el('span', { class: 'dim', text: ' · editado' }) : null));

    const menuBtn = el('button', {
      class: 'post-more', type: 'button', 'aria-label': 'Opciones de publicación',
      onclick: (event) => { event.stopPropagation(); openPostMenu(menuBtn); },
    }, icon('more-h', 20));

    headEl.append(
      el('a', { href: authorLink }, avatarEl(author, 'md')),
      who,
      menuBtn);
  }

  function openPostMenu(anchor) {
    const current = postData();
    const mine = current.authorId === me.id;
    const saved = (me.savedPostIds || []).includes(current.id);
    const items = [
      {
        icon: saved ? 'bookmark-f' : 'bookmark',
        label: saved ? 'Quitar de guardados' : 'Guardar publicación',
        onClick: async () => {
          try {
            const nowSaved = await toggleSavePost(current.id);
            toast(nowSaved ? 'Guardado en tus publicaciones' : 'Quitado de guardados',
              { type: 'success' });
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      },
      {
        icon: 'link',
        label: 'Copiar enlace',
        onClick: async () => {
          const url = `${location.origin}${location.pathname}#/p/${current.id}`;
          const ok = await copyText(url);
          toast(ok ? 'Enlace copiado' : 'No se pudo copiar', { type: ok ? 'success' : 'error' });
        },
      },
    ];
    if (mine) {
      items.push({ separator: true });
      items.push({
        icon: 'edit',
        label: 'Editar publicación',
        onClick: () => openEdit(current),
      });
      items.push({
        icon: 'trash',
        label: 'Eliminar publicación',
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar publicación?',
            message: 'Esta acción no se puede deshacer. También se borrarán sus comentarios.',
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
    } else {
      items.push({ separator: true });
      items.push({
        icon: 'flag',
        label: 'Reportar publicación',
        onClick: () => toast('Gracias. Revisaremos esta publicación.'),
      });
    }
    dropdown(anchor, items, { width: 250 });
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
            onUpdate?.();
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, 'Guardar'),
    });
  }

  /* ------------------------------- texto --------------------------------- */

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

  /* ---------------------------- estadísticas ----------------------------- */

  function renderStats() {
    const current = postData();
    const summary = reactionSummary(current);
    const comments = commentsFor(current.id).length;
    const shares = state.posts.filter((p) => p.shareOf === current.id).length;
    clear(statsEl);

    if (!summary.total && !comments && !shares) {
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
      right.appendChild(el('span', {
        text: `${formatCount(comments)} comentario${comments === 1 ? '' : 's'}`,
        onclick: () => openComments(true),
      }));
    }
    if (shares) {
      right.appendChild(el('span', { text: `${formatCount(shares)} compartida${shares === 1 ? '' : 's'}` }));
    }
    statsEl.append(left, right);
  }

  /* ------------------------------ acciones ------------------------------- */

  function renderActions() {
    const current = postData();
    const summary = reactionSummary(current);
    const mine = summary.mine;
    clear(actionsEl);

    const likeBtn = el('button', {
      class: `post-act like-act ${mine ? 'liked' : ''}`, type: 'button',
      'aria-label': mine ? REACTIONS[mine].label : 'Me gusta',
      'aria-haspopup': 'true',
    },
    mine ? reactionIcon(mine, 23) : icon('thumbsup', 21),
    el('span', { class: 'post-act-label', text: mine ? REACTIONS[mine].label : 'Me gusta' }));

    function onOutside(event) {
      if (!popoverEl) return;
      if (popoverEl.contains(event.target) || likeBtn.contains(event.target)) return;
      hidePopover();
    }

    const showPopover = () => {
      if (!root.isConnected) return;
      hidePopover();
      const bar = el('div', { class: 'react-pop', role: 'menu' });
      for (const type of REACTION_ORDER) {
        const option = el('button', {
          class: 'react-option', type: 'button', role: 'menuitem',
          'aria-label': REACTIONS[type].label,
          onclick: (event) => {
            event.stopPropagation();
            hidePopover();
            applyReaction(type);
          },
        },
        reactionIcon(type, 34),
        el('span', { class: 'react-option-label', text: REACTIONS[type].label }));
        bar.appendChild(option);
      }
      actionsEl.appendChild(bar);
      const rect = likeBtn.getBoundingClientRect();
      const rootRect = actionsEl.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      bar.style.left = `${Math.max(4, Math.min(rect.left - rootRect.left, rootRect.width - barRect.width - 4))}px`;
      bar.style.bottom = `${rootRect.height + 8}px`;
      popoverEl = bar;
      outsideHandler = onOutside;
      playSound('open');
      document.addEventListener('pointerdown', onOutside, true);
    };

    // mantener apretado (ratón o dedo) para elegir reacción
    let pressTimer = null;
    let suppressClick = false;
    const startPress = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        suppressClick = true;
        showPopover();
        try { navigator.vibrate?.(10); } catch { /* noop */ }
      }, 340);
    };
    const cancelPress = () => clearTimeout(pressTimer);

    likeBtn.addEventListener('pointerdown', startPress);
    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
      likeBtn.addEventListener(eventName, cancelPress);
    }
    likeBtn.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      applyReaction(mine ? null : 'like');
    });
    likeBtn.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showPopover();
    });

    const commentBtn = el('button', {
      class: 'post-act', type: 'button', 'aria-label': 'Comentar',
      onclick: () => { playSound('open'); openComments(true); },
    }, icon('message', 21), el('span', { class: 'post-act-label', text: 'Comentar' }));

    const shareBtn = el('button', {
      class: 'post-act', type: 'button', 'aria-label': 'Compartir',
      onclick: () => openShare(current),
    }, icon('share', 21), el('span', { class: 'post-act-label', text: 'Compartir' }));

    actionsEl.append(likeBtn, commentBtn, shareBtn);
  }

  function hidePopover() {
    if (!popoverEl) return;
    popoverEl.remove();
    popoverEl = null;
    if (outsideHandler) {
      document.removeEventListener('pointerdown', outsideHandler, true);
      outsideHandler = null;
    }
  }

  async function applyReaction(type) {
    const before = reactionSummary(postData()).mine;
    if (type === null) playSound('unlike');
    else if (type === 'like' && before !== 'like') playSound('like');
    else playSound('reaction');
    try {
      await setReaction(post.id, type);
    } catch (err) {
      playSound('error');
      toast(err.message || 'No se pudo reaccionar.', { type: 'error' });
    }
  }

  function openShare(current) {
    const textarea = el('textarea', {
      class: 'textarea', rows: '3', placeholder: 'Escribe algo sobre esto…',
    });
    const original = current;
    const author = userById(original.authorId);
    const preview = el('div', {
      style: {
        border: '1px solid var(--line-soft)', borderRadius: '8px',
        overflow: 'hidden', marginTop: '12px',
      },
    },
    el('div', { class: 'row gap-8', style: { padding: '10px 12px' } },
      avatarEl(author, 'sm'),
      el('div', null,
        el('div', { class: 'post-name', text: displayName(author) }),
        el('div', { class: 'post-meta', text: timeAgo(original.createdAt) }))),
    original.text ? el('div', {
      class: 'clamp-2', style: { padding: '0 12px 10px', fontSize: '14px' }, text: original.text,
    }) : null,
    original.media?.length
      ? mediaImg(original.media[0].path, { style: { width: '100%', maxHeight: '220px', objectFit: 'cover' } })
      : null);

    const api = openModal({
      title: 'Compartir publicación',
      body: el('div', null,
        el('div', { class: 'compose-user' },
          avatarEl(me, 'md'),
          el('div', { class: 'name', text: displayName(me) })),
        textarea, preview),
      footer: el('button', {
        class: 'btn primary block', type: 'button',
        onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = 'Compartiendo…';
          try {
            await createPost({ text: textarea.value, shareOf: original.id });
            api.close();
            playSound('send');
            toast('Publicación compartida', { type: 'success' });
            onUpdate?.();
          } catch (err) {
            button.disabled = false;
            button.textContent = 'Compartir ahora';
            toast(err instanceof ValidationError ? err.message : 'No se pudo compartir.',
              { type: 'error' });
          }
        },
      }, 'Compartir ahora'),
    });
  }

  /* ------------------------------ comentarios ---------------------------- */

  function openComments(focus = false) {
    commentsOpen = true;
    commentsEl.classList.remove('hide');
    renderComments();
    if (focus) {
      const input = commentsEl.querySelector('input[data-role="comment-input"]');
      input?.focus();
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function toggleCommentLike(comment) {
    const mine = comment.reactions?.[me.id];
    setCommentReaction(comment.id, mine ? null : 'like')
      .catch((err) => toast(err.message, { type: 'error' }));
  }

  function commentNode(comment, { isReply = false } = {}) {
    const author = userById(comment.authorId) || { name: 'Usuario' };
    const reactions = Object.values(comment.reactions || {});
    const mineLiked = comment.reactions?.[me.id];
    const replies = isReply ? [] : repliesTo(comment.id);
    const showReplies = expandedReplies.has(comment.id);
    const node = el('div', { class: 'comment', style: isReply ? { marginLeft: '38px' } : null });

    const bubble = el('div', { class: 'comment-bubble' },
      el('a', {
        class: 'comment-name', href: `#/u/${author.username}`,
        text: displayName(author),
      }),
      el('div', { class: 'comment-text', html: linkify(comment.text || '') }),
      (comment.media || []).length
        ? el('div', { class: 'comment-img' },
          mediaImg(comment.media[0].path, {
            alt: 'Imagen del comentario',
            onClick: () => lightbox([comment.media[0].path], 0),
          }))
        : null);

    const meta = el('div', { class: 'comment-meta' },
      el('button', {
        class: mineLiked ? 'liked' : '', type: 'button',
        onclick: () => toggleCommentLike(comment),
      }, mineLiked ? 'Te gusta' : 'Me gusta'),
      reactions.length
        ? el('span', {
          class: 'row gap-4', style: { color: 'var(--text-2)' },
        }, reactionIcon('like', 15), el('span', { text: formatCount(reactions.length) }))
        : null,
      el('button', {
        type: 'button', text: 'Responder',
        onclick: () => {
          replyTo = comment;
          renderComments();
          const input = commentsEl.querySelector('input[data-role="comment-input"]');
          input?.focus();
        },
      }),
      el('span', { class: 'time', text: timeAgo(comment.createdAt) }),
      comment.authorId === me.id
        ? el('button', {
          type: 'button', text: 'Eliminar',
          onclick: async () => {
            try {
              await deleteComment(comment.id);
              if (replyTo?.id === comment.id) replyTo = null;
              renderComments();
              toast('Comentario eliminado', { type: 'success' });
            } catch (err) { toast(err.message, { type: 'error' }); }
          },
        })
        : null);

    const body = el('div', { class: 'comment-body' }, bubble, meta);

    if (replies.length) {
      const replyWrap = el('div', { class: 'comment-replies' });
      if (!showReplies) {
        body.appendChild(el('button', {
          class: 'comment-more', type: 'button', style: { paddingLeft: '12px' },
          onclick: () => { expandedReplies.add(comment.id); renderComments(); },
        }, `Ver ${replies.length} respuesta${replies.length === 1 ? '' : 's'}`));
      } else {
        for (const reply of replies) replyWrap.appendChild(commentNode(reply, { isReply: true }));
        body.appendChild(replyWrap);
      }
    }

    node.append(
      el('a', { href: `#/u/${author.username}` }, avatarEl(author, 'sm')),
      body);
    return node;
  }

  function renderComments() {
    if (!commentsOpen) {
      commentsEl.classList.add('hide');
      return;
    }
    const current = postData();
    const all = commentsFor(current.id);
    const roots = rootComments(current.id);
    const active = document.activeElement;
    const wasFocused = commentsEl.contains(active);
    const draft = commentDraft(post.id);

    clear(commentsEl);
    commentsEl.classList.remove('hide');

    if (!all.length) {
      commentsEl.appendChild(el('div', {
        class: 'muted small', style: { padding: '4px 0 8px' },
        text: 'Todavía no hay comentarios. ¡Sé el primero!',
      }));
    } else {
      const visible = showAll ? roots : roots.slice(-2);
      if (!showAll && roots.length > 2) {
        commentsEl.appendChild(el('button', {
          class: 'comment-more', type: 'button', style: { paddingLeft: '0' },
          onclick: () => { showAll = true; renderComments(); },
        }, `Ver los ${roots.length} comentarios`));
      }
      for (const comment of visible) commentsEl.appendChild(commentNode(comment));
    }

    // editor
    const input = el('input', {
      type: 'text', placeholder: 'Escribe un comentario…', 'data-role': 'comment-input',
      value: draft.text || '', 'aria-label': 'Escribir comentario',
    });
    input.addEventListener('input', () => { draft.text = input.value; });

    const photoBtn = el('button', {
      class: 'ci-btn photo', type: 'button', title: 'Añadir foto', 'aria-label': 'Añadir foto al comentario',
      onclick: async () => {
        const files = await openFilePicker();
        if (!files.length) return;
        const problem = validateImageFile(files[0]);
        if (problem) { toast(problem, { type: 'error' }); return; }
        try {
          const record = await uploadImage(files[0], 'posts', { maxSize: 1200 });
          pendingMedia = record;
          renderComments();
        } catch (err) { toast(err.message, { type: 'error' }); }
      },
    }, icon('image', 18));

    const emojiBtn = el('button', {
      class: 'ci-btn', type: 'button', title: 'Emoji', 'aria-label': 'Insertar emoji',
      onclick: () => emojiPicker(emojiBtn, (emoji) => {
        input.value += emoji;
        draft.text = input.value;
        input.focus();
      }),
    }, icon('smile', 18));

    const sendBtn = el('button', {
      class: 'ci-btn', type: 'button', title: 'Enviar', 'aria-label': 'Enviar comentario',
      onclick: () => submit(),
    }, icon('send', 18));

    const wrapIn = el('div', { class: 'wrapin' }, input, photoBtn, emojiBtn, sendBtn);
    const row = el('div', { class: 'comment-input' },
      el('a', { href: `#/u/${me.username}` }, avatarEl(me, 'sm')), wrapIn);

    const submit = async () => {
      const text = input.value.trim();
      if (!text && !pendingMedia) return;
      sendBtn.disabled = true;
      try {
        await addComment(current.id, text, {
          parentId: replyTo?.id || null,
          media: pendingMedia ? [{ path: pendingMedia.path, type: pendingMedia.type }] : [],
        });
        playSound('comment');
        draft.text = '';
        pendingMedia = null;
        replyTo = null;
        showAll = true;
        renderComments();
        onUpdate?.();
      } catch (err) {
        toast(err instanceof ValidationError ? err.message : 'No se pudo comentar.', { type: 'error' });
      } finally {
        sendBtn.disabled = false;
      }
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });

    if (replyTo) {
      const target = userById(replyTo.authorId);
      const bar = el('div', { class: 'replying-bar' },
        el('span', { text: `Respondiendo a ${displayName(target)}` }),
        el('button', {
          type: 'button', text: 'Cancelar',
          onclick: () => { replyTo = null; renderComments(); },
        }));
      commentsEl.appendChild(bar);
    }

    if (pendingMedia) {
      commentsEl.appendChild(el('div', { class: 'comment-preview' },
        mediaImg(pendingMedia.path, { alt: 'Imagen adjunta' }),
        el('button', {
          type: 'button', 'aria-label': 'Quitar imagen',
          onclick: () => { pendingMedia = null; renderComments(); },
        }, icon('x', 13))));
    }

    commentsEl.appendChild(row);

    if (wasFocused) {
      const next = commentsEl.querySelector('input[data-role="comment-input"]');
      if (next) {
        next.focus();
        const length = next.value.length;
        next.setSelectionRange?.(length, length);
      }
    }
  }

  /* --------------------------------- api --------------------------------- */

  function render() {
    renderHead();
    renderText();
    renderShared(postData(), shareEl);
    renderMedia(postData(), mediaEl);
    renderStats();
    renderActions();
    if (commentsOpen) renderComments();
  }

  render();
  return {
    el: root,
    update: ({ keepComments = true } = {}) => {
      if (!canSeePost(postData(), me.id)) {
        root.remove();
        return;
      }
      render();
      if (!keepComments) {
        commentsOpen = false;
        commentsEl.classList.add('hide');
      }
    },
    destroy: () => {
      hidePopover();
      closeMenus();
    },
  };
}
