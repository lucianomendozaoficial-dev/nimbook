/* ==========================================================================
   pages/search.js — resultados de búsqueda
   ========================================================================== */
import { el, clear, debounce, formatCount, timeAgo } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName, searchEverything, relationWith, friendCount, userById } from '../core/store.js';
import { avatarEl, emptyState, toast } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import { postCard } from '../components/postcard.js';
import { sendFriendRequest } from '../core/actions.js';

export function searchPage(initialQuery = '') {
  const root = el('div');
  let query = initialQuery;
  let filter = 'all';
  let cards = [];

  const input = el('input', {
    type: 'search', placeholder: 'Buscar en NimbookGR', value: query,
    'aria-label': 'Buscar',
  });
  const results = el('div');

  const filters = [
    { id: 'all', label: 'Todo' },
    { id: 'people', label: 'Personas' },
    { id: 'posts', label: 'Publicaciones' },
    { id: 'groups', label: 'Grupos' },
  ];
  const tabs = el('div', { class: 'tabs' });

  function renderTabs(data) {
    clear(tabs);
    const counts = {
      all: data.users.length + data.posts.length + data.groups.length,
      people: data.users.length,
      posts: data.posts.length,
      groups: data.groups.length,
    };
    for (const item of filters) {
      tabs.appendChild(el('button', {
        class: `tab ${filter === item.id ? 'active' : ''}`, type: 'button',
        onclick: () => { filter = item.id; renderResults(); },
      }, item.label, counts[item.id]
        ? el('span', { class: 'tab-count', text: `· ${counts[item.id]}` }) : null));
    }
  }

  function renderResults() {
    clear(results);
    cards.forEach(({ card }) => card.destroy?.());
    cards = [];
    const data = searchEverything(query, state.me?.id);
    renderTabs(data);

    if (!query.trim()) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: 'Busca en NimbookGR',
          description: 'Encuentra personas, publicaciones y grupos.',
        })));
      return;
    }

    const total = data.users.length + data.posts.length + data.groups.length;
    if (!total) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: `Sin resultados para “${query}”`,
          description: 'Prueba con otras palabras.',
        })));
      return;
    }

    if ((filter === 'all' || filter === 'people') && data.users.length) {
      const card = el('div', { class: 'card pad' },
        el('h3', { class: 'card-title', text: 'Personas' }));
      for (const person of data.users.slice(0, 8)) {
        const relation = relationWith(state.me.id, person.id);
        card.appendChild(el('div', { class: 'person-row' },
          el('a', { href: `#/u/${person.username}` }, avatarEl(person, 'md')),
          el('div', { class: 'grow', style: { minWidth: '0' } },
            el('a', {
              href: `#/u/${person.username}`, class: 'strong',
              style: { display: 'block' }, text: displayName(person),
            }),
            el('span', {
              class: 'small muted',
              text: `${formatCount(friendCount(person.id))} amigos · @${person.username}`,
            })),
          relation === 'friends'
            ? el('span', { class: 'chip', text: 'Amigos' })
            : relation === 'requested'
              ? el('span', { class: 'chip', text: 'Solicitud enviada' })
              : el('button', {
                class: 'btn soft sm', type: 'button', text: 'Añadir',
                onclick: async (event) => {
                  const button = event.currentTarget;
                  button.disabled = true;
                  try {
                    await sendFriendRequest(person.id);
                    button.textContent = 'Enviado';
                  } catch (err) {
                    button.disabled = false;
                    toast(err.message, { type: 'error' });
                  }
                },
              })));
      }
      results.appendChild(card);
    }

    if ((filter === 'all' || filter === 'groups') && data.groups.length) {
      const card = el('div', { class: 'card pad' },
        el('h3', { class: 'card-title', text: 'Grupos' }));
      for (const group of data.groups.slice(0, 8)) {
        card.appendChild(el('a', {
          class: 'person-row', href: `#/groups/${group.id}`,
        },
        el('span', {
          class: 'avatar md',
          style: { borderRadius: '8px', overflow: 'hidden' },
        }, group.cover
          ? mediaImg(group.cover, { alt: group.name })
          : el('span', { class: 'center', style: { width: '100%', height: '100%' } }, icon('groups', 20))),
        el('div', { class: 'grow' },
          el('div', { class: 'strong', text: group.name }),
          el('div', {
            class: 'small muted',
            text: `${group.privacy === 'private' ? 'Privado' : 'Público'} · ${formatCount(group.memberIds?.length || 0)} miembros`,
          }))));
      }
      results.appendChild(card);
    }

    if ((filter === 'all' || filter === 'posts') && data.posts.length) {
      const list = el('div');
      for (const post of data.posts.slice(0, 10)) {
        const card = postCard(post);
        cards.push({ card });
        list.appendChild(card.el);
      }
      results.appendChild(list);
    }
  }

  input.addEventListener('input', debounce(() => {
    query = input.value;
    history.replaceState(null, '', `#/search?q=${encodeURIComponent(query)}`);
    renderResults();
  }, 250));

  root.append(
    el('div', { class: 'page-card' },
      el('div', { style: { padding: '16px 16px 0' } },
        el('h1', { text: 'Buscar' }),
        el('div', { class: 'search-inline mt-12' }, icon('search', 18), input),
        el('div', { class: 'mt-8' }, tabs))),
    results);

  renderResults();
  setTimeout(() => { if (!query) input.focus(); }, 100);

  return {
    el: root,
    onData: () => {
      cards.forEach(({ card }) => card.update?.());
    },
    destroy: () => cards.forEach(({ card }) => card.destroy?.()),
  };
}
