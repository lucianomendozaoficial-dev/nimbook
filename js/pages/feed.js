/* ==========================================================================
   pages/feed.js — muro con orden mezclado y carga por páginas
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, feedOrder, displayName, loadFeedPage, refreshAll, shopListings,
} from '../core/store.js';
import { avatarEl, emptyState, toast } from '../core/ui.js';
import { emptyFeedIllustration } from '../core/illustrations.js';
import { mountStories } from '../components/stories.js';
import { postCard } from '../components/postcard.js';
import { haptic } from '../core/native.js';
import { shopFeedCard } from '../components/shop-feed-card.js';
import { navigate } from '../core/router.js';
import { playSound } from '../core/sounds.js';

const MODES = [
  { id: 'foryou', label: 'Para ti' },
  { id: 'following', label: 'Siguiendo' },
];

function seededRandom(seed) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function feedPage() {
  const root = el('div');
  const stories = mountStories();
  const composer = el('div', { class: 'card composer-open-row' });
  const toolbar = el('div', { class: 'card feed-toolbar' });
  const list = el('div', { class: 'col gap-16' });
  const moreWrap = el('div', { class: 'center', style: { padding: '8px 0 24px' } });
  const loading = el('div', { class: 'center', style: { padding: '20px' } }, el('span', { class: 'spinner' }));

  let cards = [];
  let shown = new Set();
  let shownShop = new Set();
  let busy = false;
  let mode = sessionStorage.getItem('zuma.feedMode') === 'following' ? 'following' : 'foryou';
  let seed = Number(sessionStorage.getItem('zuma.feedSeed') || 0) || Math.floor(Math.random() * 9999) + 1;
  sessionStorage.setItem('zuma.feedSeed', String(seed));

  root.append(stories.el, composer, toolbar, list, moreWrap);

  /* ------------------------------ compositor ----------------------------- */

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

  /* -------------------------------- barra -------------------------------- */

  function renderToolbar() {
    clear(toolbar);
    const segmented = el('div', { class: 'segmented' });
    for (const item of MODES) {
      const active = mode === item.id;
      segmented.appendChild(el('button', {
        class: `segmented-item${active ? ' active' : ''}`, type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        text: item.label,
        onclick: () => {
          if (mode === item.id) return;
          haptic(6);
          mode = item.id;
          sessionStorage.setItem('zuma.feedMode', mode);
          seed = Math.floor(Math.random() * 9999) + 1;
          sessionStorage.setItem('zuma.feedSeed', String(seed));
          renderToolbar();
          renderList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      }));
    }
    toolbar.append(segmented);
  }

  /* -------------------------------- listado ------------------------------ */

  function teardown() {
    cards.forEach((card) => card.destroy?.());
    cards = [];
    shown = new Set();
    shownShop = new Set();
  }

  function emptyCard() {
    if (mode === 'following') {
      return el('div', { class: 'card' },
        emptyState({
          iconName: 'users',
          title: 'Acá va a aparecer tu gente',
          description: 'En «Siguiendo» sólo ves lo que publican las personas que seguís.',
          action: el('button', {
            class: 'btn primary', type: 'button', text: 'Encontrar personas',
            onclick: () => navigate('/seguidores/sugerencias'),
          }),
        }));
    }
    return el('div', { class: 'card' },
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
      }));
  }

  function addCard(entry) {
    const card = postCard(entry.post, { suggested: entry.suggested });
    cards.push(card);
    shown.add(entry.post.id);
    list.appendChild(card.el);
  }

  /**
   * Una promoción de Shop se cuela en «Para ti» aunque no sigas al vendedor.
   * Se muestra casi siempre, con una pequeña pausa para no saturar.
   */
  function shopPicks() {
    if (mode !== 'foryou') return [];
    const listings = shopListings({ includeSold: false })
      .filter((item) => item.sellerId !== state.me?.id);
    if (!listings.length) return [];
    const random = seededRandom(seed * 31 + 7);
    if (random() > 0.96) return [];
    const pool = listings.slice(0, 8);
    const picks = [pool[Math.floor(random() * pool.length)]];
    if (pool.length > 2 && random() < 0.3) {
      const rest = pool.filter((item) => item.id !== picks[0].id);
      picks.push(rest[Math.floor(random() * rest.length)]);
    }
    return picks;
  }

  function renderList({ append = false } = {}) {
    if (!append) {
      teardown();
      clear(list);
    }
    const order = feedOrder(state.me?.id, seed, { mode });

    if (!append && !order.length) {
      list.appendChild(emptyCard());
      renderMore();
      return;
    }

    const picks = append ? [] : shopPicks();
    const slots = picks.length > 1 ? [2, 8] : [3];
    const insertAt = new Map();
    picks.forEach((item, index) => insertAt.set(slots[index] ?? 3, item));

    order.forEach((entry, index) => {
      const shopItem = insertAt.get(index);
      if (shopItem && !shownShop.has(shopItem.id)) {
        list.appendChild(shopFeedCard(shopItem));
        shownShop.add(shopItem.id);
      }
      if (!shown.has(entry.post.id)) addCard(entry);
    });

    // Si el muro tiene menos publicaciones que el lugar elegido, la venta va al final.
    for (const [index, shopItem] of insertAt) {
      if (index >= order.length && !shownShop.has(shopItem.id)) {
        list.appendChild(shopFeedCard(shopItem));
        shownShop.add(shopItem.id);
      }
    }

    renderMore();
  }

  function renderMore() {
    clear(moreWrap);
    const remaining = state.feedIndex.length - state.feedLoaded;
    if (remaining <= 0 || (mode === 'following' && !state.following.size)) return;
    const button = el('button', {
      class: 'btn soft', type: 'button',
      text: busy ? 'Cargando…' : 'Cargar más publicaciones',
      disabled: busy,
      onclick: async () => {
        if (busy) return;
        busy = true;
        button.disabled = true;
        button.textContent = 'Cargando…';
        try {
          await loadFeedPage();
          busy = false;
          renderList({ append: true });
        } catch {
          busy = false;
          renderMore();
          toast('No pudimos cargar más. Revisá tu conexión.', { type: 'error' });
        }
      },
    });
    moreWrap.appendChild(button);
  }

  async function refresh() {
    if (busy) return;
    busy = true;
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
      busy = false;
      loading.remove();
      renderComposer();
      renderList();
    }
  }

  renderComposer();
  renderToolbar();
  renderList();

  return {
    el: root,
    onData(topic) {
      if (topic === 'stories') { stories.render(); return; }
      if (topic === 'feed' || topic === 'me' || topic === 'post'
        || topic === 'follow' || topic === 'ready' || topic === 'shop') {
        renderList();
      }
    },
    destroy() {
      teardown();
    },
    refresh,
  };
}
