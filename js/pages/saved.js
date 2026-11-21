/* ==========================================================================
   pages/saved.js — publicaciones guardadas
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, loadPost } from '../core/store.js';
import { emptyState } from '../core/ui.js';
import { postCard } from '../components/postcard.js';
import { goBack } from '../core/router.js';

export function savedPage() {
  const root = el('div');
  const list = el('div', { class: 'col gap-16' });
  let cards = [];

  async function render() {
    cards.forEach((card) => card.destroy?.());
    cards = [];
    clear(list);

    const ids = state.me?.saved || [];
    const posts = (await Promise.all(ids.map((id) => loadPost(id)))).filter(Boolean);

    if (!posts.length) {
      list.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'bookmark',
          title: 'Todavía no guardaste nada',
          description: 'Usá el menú de una publicación para guardarla y verla después.',
        })));
      return;
    }

    for (const post of posts) {
      const card = postCard(post);
      cards.push(card);
      list.appendChild(card.el);
    }
  }

  root.append(el('div', { class: 'page-back' },
    el('button', {
      class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
    }, icon('arrow-left', 17), 'Volver')),
  el('div', { class: 'page-head' }, el('h1', { text: 'Guardado' })),
  list);

  render();

  return {
    el: root,
    onData(topic) { if (topic === 'me') render(); },
    destroy() { cards.forEach((card) => card.destroy?.()); },
  };
}
