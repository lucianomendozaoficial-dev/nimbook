/* ==========================================================================
   pages/saved.js — publicaciones guardadas
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { state, canSeePost } from '../core/store.js';
import { emptyState } from '../core/ui.js';
import { postCard } from '../components/postcard.js';

export function savedPage() {
  const root = el('div');
  const list = el('div');

  root.append(el('div', { class: 'page-card', style: { padding: '16px' } },
    el('h1', { text: 'Guardado' }),
    el('p', { class: 'muted small', text: 'Solo tú puedes ver las publicaciones que guardas.' })));

  let cards = [];

  function render() {
    clear(list);
    cards.forEach(({ card }) => card.destroy?.());
    cards = [];
    const ids = state.me?.savedPostIds || [];
    const posts = ids
      .map((id) => state.posts.find((p) => p.id === id))
      .filter((post) => post && canSeePost(post, state.me?.id));

    if (!posts.length) {
      list.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'bookmark',
          title: 'No tienes publicaciones guardadas',
          description: 'Usa el menú "…" de cualquier publicación para guardarla y verla aquí más tarde.',
        })));
      return;
    }

    for (const post of posts) {
      const card = postCard(post);
      cards.push({ card });
      list.appendChild(card.el);
    }
  }

  root.appendChild(list);
  render();
  return {
    el: root,
    onData: () => {
      cards.forEach(({ card }) => card.update?.());
    },
    destroy: () => cards.forEach(({ card }) => card.destroy?.()),
  };
}
