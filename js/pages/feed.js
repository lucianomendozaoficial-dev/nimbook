/* ==========================================================================
   pages/feed.js — muro con carga por páginas
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, rankedFeed, displayName, loadFeedPage, refreshAll,
} from '../core/store.js';
import { avatarEl, emptyState, toast } from '../core/ui.js';
import { emptyFeedIllustration } from '../core/illustrations.js';
import { mountStories } from '../components/stories.js';
import { postCard } from '../components/postcard.js';
import { navigate } from '../core/router.js';
import { playSound } from '../core/sounds.js';

export function feedPage() {
  const root = el('div');
  const stories = mountStories();
  const composer = el('div', { class: 'card composer-open-row' });
  const list = el('div', { class: 'col gap-16' });
  const moreWrap = el('div', { class: 'center', style: { padding: '8px 0 24px' } });
  const loading = el('div', { class: 'center', style: { padding: '20px' } }, el('span', { class: 'spinner' }));
  let cards = [];
  let seed = Number(sessionStorage.getItem('zuma.feedSeed') || 0) || Math.floor(Math.random() * 9999) + 1;
  sessionStorage.setItem('zuma.feedSeed', String(seed));

  const toolbar = el('div', { class: 'feed-toolbar' });
  const refreshBtn = el('button', {
    class: 'btn ghost sm', type: 'button', title: 'Actualizar',
    onclick: () => refresh(),
  }, icon('refresh', 16), 'Actualizar');
  toolbar.append(
    el('span', { class: 'muted small', text: 'Novedades' }),
    refreshBtn,
  );

  root.append(toolbar, stories.el, composer, list, moreWrap);

  function renderComposer() {
    clear(composer);
    const me = state.me;
    composer.append(
      el('a', { href: `#/u/${me.username}` }, avatarEl(me, 'md')),
      el('button', {
        class: 'composer-fake', type: 'button',
        text: `¿Qué estás pensando, ${me.firstName || displayName(me)}?`,
        onclick: () => navigate('/publicar'),
      }),
      el('button', {
        class: 'btn primary', type: 'button', onclick: () => navigate('/publicar'),
      }, icon('edit', 16), 'Publicar'),
    );
  }

  function renderList() {
    cards.forEach((card) => card.destroy?.());
    cards = [];
    clear(list);
    const posts = rankedFeed(state.me?.id, seed);

    if (!posts.length) {
      list.appendChild(el('div', { class: 'card' },
        emptyState({
          illustration: emptyFeedIllustration(),
          title: 'Tu muro está esperando',
          description: 'Seguí a personas o publicá tu primer momento.',
          action: el('div', { class: 'row gap-8 center' },
            el('button', {
              class: 'btn primary', type: 'button', text: 'Publicar algo',
              onclick: () => navigate('/publicar'),
            }),
            el('button', {
              class: 'btn', type: 'button', text: 'Buscar personas',
              onclick: () => navigate('/seguidores/sugerencias'),
            })),
        })));
    } else {
      for (const post of posts) {
        const card = postCard(post);
        cards.push(card);
        list.appendChild(card.el);
      }
    }
    renderMore();
  }

  function renderMore() {
    clear(moreWrap);
    const remaining = state.feedIndex.length - state.feedLoaded;
    if (remaining > 0) {
      moreWrap.appendChild(el('button', {
        class: 'btn soft', type: 'button', text: 'Cargar más publicaciones',
        onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = 'Cargando…';
          try {
            await loadFeedPage();
            renderList();
          } catch {
            toast('No pudimos cargar más. Revisá tu conexión.', { type: 'error' });
            button.disabled = false;
            button.textContent = 'Cargar más publicaciones';
          }
        },
      }));
    }
  }

  async function refresh() {
    refreshBtn.disabled = true;
    playSound('open');
    clear(list);
    list.appendChild(loading);
    try {
      await refreshAll();
      seed = Math.floor(Math.random() * 9999) + 1;
      sessionStorage.setItem('zuma.feedSeed', String(seed));
    } catch {
      toast('No pudimos actualizar. Revisá tu conexión.', { type: 'error' });
    } finally {
      loading.remove();
      refreshBtn.disabled = false;
      renderComposer();
      renderList();
    }
  }

  renderComposer();
  renderList();

  return {
    el: root,
    onData(topic) {
      if (topic === 'feed' || topic === 'me' || topic === 'post') renderList();
      if (topic === 'follow' || topic === 'ready') renderList();
    },
    destroy() {
      cards.forEach((card) => card.destroy?.());
    },
    refresh,
  };
}
