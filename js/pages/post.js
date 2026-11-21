/* ==========================================================================
   pages/post.js — publicación completa con comentarios
   ========================================================================== */
import { el, clear, timeAgo, formatCount } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, loadPost, loadComments, commentsFor, displayName, userById,
} from '../core/store.js';
import { avatarEl, emptyState, toast } from '../core/ui.js';
import { postCard } from '../components/postcard.js';
import { addComment, deleteComment } from '../core/actions.js';
import { mediaImg } from '../core/media.js';
import { goBack } from '../core/router.js';
import { playSound } from '../core/sounds.js';

export function postPage(postId) {
  const root = el('div');
  const backRow = el('div', { class: 'page-back' });
  const postWrap = el('div');
  const commentsCard = el('div', { class: 'card comments-page' });
  const loading = el('div', { class: 'center', style: { padding: '40px' } }, el('span', { class: 'spinner' }));

  backRow.appendChild(el('button', {
    class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
  }, icon('arrow-left', 17), 'Volver'));

  root.append(backRow, postWrap, commentsCard);
  commentsCard.appendChild(loading);

  let card = null;
  let replyTo = null;

  function commentNode(comment) {
    const author = userById(comment.authorId) || { name: 'Usuario' };
    const mine = comment.authorId === state.me?.id;
    return el('div', { class: 'comment' },
      el('a', { href: `#/u/${author.username}` }, avatarEl(author, 'sm')),
      el('div', { class: 'comment-body' },
        el('div', { class: 'comment-bubble' },
          el('a', { href: `#/u/${author.username}`, class: 'comment-name', text: displayName(author) }),
          el('div', { class: 'comment-text', text: comment.text || '' }),
          comment.media?.length
            ? mediaImg(comment.media[0].path, { alt: 'Foto del comentario', className: 'comment-img' })
            : null),
        el('div', { class: 'comment-meta' },
          el('span', { text: timeAgo(comment.createdAt) }),
          el('button', {
            class: 'link small', type: 'button', text: 'Responder',
            onclick: () => { replyTo = comment; renderComposer(); focusInput(); },
          }),
          mine ? el('button', {
            class: 'link small', type: 'button', text: 'Eliminar',
            onclick: async () => {
              try {
                await deleteComment(comment.id, postId);
                toast('Comentario eliminado', { type: 'success' });
                renderComments();
              } catch (err) { toast(err.message, { type: 'error' }); }
            },
          }) : null),
        el('div', { class: 'comment-replies' },
          ...commentsFor(postId)
            .filter((item) => item.parentId === comment.id)
            .map(commentNode))));
  }

  const input = el('input', {
    class: 'input', placeholder: 'Escribe un comentario…', 'data-role': 'comment-input',
  });
  const sendBtn = el('button', { class: 'btn primary', type: 'button' }, 'Enviar');
  const composer = el('div', { class: 'comment-compose' });

  function focusInput() {
    setTimeout(() => input.focus(), 30);
  }

  function renderComposer() {
    clear(composer);
    if (replyTo) {
      composer.appendChild(el('div', { class: 'reply-chip' },
        el('span', { text: `Respondiendo a ${displayName(userById(replyTo.authorId))}` }),
        el('button', {
          class: 'btn-icon', type: 'button', 'aria-label': 'Cancelar respuesta',
          onclick: () => { replyTo = null; renderComposer(); },
        }, icon('x', 14))));
    }
    composer.append(
      el('div', { class: 'row gap-8' }, input, sendBtn),
    );
  }

  sendBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    try {
      await addComment(postId, text, { parentId: replyTo?.id || null });
      playSound('comment');
      input.value = '';
      replyTo = null;
      renderComposer();
      renderComments();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      sendBtn.disabled = false;
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); sendBtn.click(); }
  });

  function renderComments() {
    clear(commentsCard);
    const comments = commentsFor(postId);
    commentsCard.append(
      el('h2', { class: 'card-title' },
        `Comentarios`,
        el('span', { class: 'muted small', style: { marginLeft: '6px' },
          text: comments.length ? String(comments.length) : '' })),
      comments.length
        ? el('div', { class: 'comments-list' }, ...comments.filter((c) => !c.parentId).map(commentNode))
        : el('p', { class: 'muted small', text: 'Todavía no hay comentarios. Sé el primero.' }),
      composer,
    );
    renderComposer();
  }

  (async () => {
    const post = await loadPost(postId);
    clear(postWrap);
    if (!post) {
      postWrap.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'alert',
          title: 'Publicación no encontrada',
          description: 'Puede que se haya eliminado.',
          action: el('button', {
            class: 'btn primary', type: 'button', text: 'Ir al inicio',
            onclick: () => goBack('/inicio'),
          }),
        })));
      commentsCard.remove();
      return;
    }
    card = postCard(post, { onUpdate: () => renderComments() });
    postWrap.appendChild(card.el);
    await loadComments(postId);
    renderComments();
  })();

  return {
    el: root,
    onData(topic, detail) {
      if (topic === 'comments' && detail?.postId === postId) renderComments();
      if (topic === 'post' && detail?.id === postId) card?.update();
    },
    destroy() { card?.destroy?.(); },
  };
}
