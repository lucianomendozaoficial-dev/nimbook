/* ==========================================================================
   pages/feed.js — inicio: historias, compositor y muro de publicaciones
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, feedPosts } from '../core/store.js';
import { mountStories } from '../components/stories.js';
import { mountComposer } from '../components/composer.js';
import { postCard } from '../components/postcard.js';
import { emptyState, toast } from '../core/ui.js';
import { emptyFeedIllustration } from '../core/illustrations.js';

function endOfFeed() {
  return el('div', { class: 'empty', style: { padding: '24px 16px 40px' } },
    icon('check', 22, { cls: 'dim' }),
    el('p', { class: 'muted small', text: 'Ya viste todo por ahora. Vuelve más tarde para ver novedades.' }));
}

export function feedPage() {
  const root = el('div');
  const stories = mountStories();
  const composer = mountComposer();
  const list = el('div');
  const footer = el('div');

  let limit = 8;
  let cards = [];
  let observer = null;

  root.append(stories.el, composer, list, footer);

  function feedIds() {
    return feedPosts(state.me?.id).map((p) => p.id);
  }

  function renderList() {
    const posts = feedPosts(state.me?.id).slice(0, limit);
    clear(list);
    clear(footer);
    cards = [];

    if (!posts.length) {
      list.appendChild(el('div', { class: 'card' },
        emptyState({
          illustration: emptyFeedIllustration(),
          title: 'Tu muro está esperando',
          description: 'Publica tu primer momento o agrega amigos para empezar a llenar el inicio.',
          action: el('div', { class: 'row gap-8' },
            el('button', {
              class: 'btn primary', type: 'button', text: 'Publicar algo',
              onclick: () => import('../components/composer.js').then(({ openComposer }) => openComposer()),
            }),
            el('button', {
              class: 'btn soft', type: 'button', text: 'Buscar amigos',
              onclick: () => { window.location.hash = '/friends/suggestions'; },
            })),
        })));
      return;
    }

    for (const post of posts) {
      const card = postCard(post);
      cards.push({ id: post.id, card });
      list.appendChild(card.el);
    }

    const total = feedPosts(state.me?.id).length;
    if (total > posts.length) {
      const sentinel = el('div', { style: { height: '1px' } });
      footer.appendChild(el('div', { class: 'loading-row' }, el('span', { class: 'spinner' })));
      footer.appendChild(sentinel);
      observer?.disconnect();
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          limit += 8;
          observer.disconnect();
          renderList();
        }
      }, { rootMargin: '400px' });
      observer.observe(sentinel);
    } else {
      footer.appendChild(endOfFeed());
    }
  }

  function sync() {
    const ids = feedIds();
    const renderedIds = cards.map((c) => c.id);
    const same = ids.length >= renderedIds.length
      && renderedIds.every((id, index) => ids[index] === id);
    if (same) {
      for (const { card } of cards) card.update();
      return;
    }
    renderList();
  }

  renderList();

  return {
    el: root,
    onData(topic) {
      if (topic === 'offline') {
        toast('Se perdió la conexión. Estás viendo lo último que cargaste.', { type: 'error' });
        return;
      }
      stories.render();
      sync();
    },
    destroy() {
      observer?.disconnect();
      cards.forEach(({ card }) => card.destroy?.());
    },
  };
}

/* ------------------------- publicación individual ------------------------ */

export function postPage(postId) {
  const root = el('div');
  const post = state.posts.find((p) => p.id === postId);
  const back = el('button', {
    class: 'btn ghost', type: 'button',
    onclick: () => history.length > 1 ? history.back() : (window.location.hash = '/feed'),
  }, icon('arrow-left', 18), 'Volver');

  if (!post) {
    root.append(el('div', { class: 'card' },
      emptyState({
        iconName: 'alert',
        title: 'Publicación no disponible',
        description: 'Puede que se haya eliminado o no tengas permiso para verla.',
        action: el('a', { class: 'btn soft', href: '#/feed', text: 'Ir al inicio' }),
      })));
    return { el: root, onData() {}, destroy() {} };
  }

  const card = postCard(post);
  const cardWrap = el('div');
  cardWrap.appendChild(card.el);
  root.append(el('div', { style: { padding: '0 0 8px' } }, back), cardWrap);

  return {
    el: root,
    onData: () => card.update(),
    destroy: () => card.destroy?.(),
  };
}
