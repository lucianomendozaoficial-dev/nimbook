/* ==========================================================================
   pages/search.js — sección de búsqueda
   ========================================================================== */
import { el, clear, debounce } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName, searchEverything, relationWith, userById } from '../core/store.js';
import { avatarEl, emptyState } from '../core/ui.js';
import { followButton } from '../components/follow-button.js';
import { mediaImg } from '../core/media.js';
import { postCard } from '../components/postcard.js';
import { navigate, parseRoute } from '../core/router.js';

export function searchPage(initial = '') {
  const root = el('div');
  let query = initial;
  let filter = 'all';
  let cards = [];

  const input = el('input', {
    type: 'search', placeholder: 'Buscar personas, publicaciones o grupos',
    'aria-label': 'Buscar', value: query,
  });
  const results = el('div');
  const tabs = el('div', { class: 'tabs' });

  const FILTERS = [
    { id: 'all', label: 'Todo' },
    { id: 'people', label: 'Personas' },
    { id: 'posts', label: 'Publicaciones' },
    { id: 'groups', label: 'Grupos' },
  ];

  function setQuery(value) {
    query = value.trim();
    const route = parseRoute();
    const next = `#/buscar?q=${encodeURIComponent(query)}`;
    if (query && window.location.hash !== next) {
      history.replaceState({ nb: true }, '', next);
    } else if (!query && route.query.q) {
      history.replaceState({ nb: true }, '', '#/buscar');
    }
    render();
  }

  input.addEventListener('input', debounce(() => setQuery(input.value), 220));

  function renderTabs() {
    clear(tabs);
    for (const item of FILTERS) {
      tabs.appendChild(el('button', {
        class: `tab ${filter === item.id ? 'active' : ''}`.trim(), type: 'button',
        text: item.label,
        onclick: () => { filter = item.id; render(); },
      }));
    }
  }

  function render() {
    cards.forEach((card) => card.destroy?.());
    cards = [];
    clear(results);
    renderTabs();

    if (!query) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: 'Buscá en Zuma',
          description: 'Personas, publicaciones y grupos de la comunidad.',
        })));
      return;
    }

    const found = searchEverything(query);
    const showPeople = filter === 'all' || filter === 'people';
    const showPosts = filter === 'all' || filter === 'posts';
    const showGroups = filter === 'all' || filter === 'groups';

    if (showPeople && found.users.length) {
      results.appendChild(el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Personas'),
        ...found.users.map((person) => {
          const user = state.users.get(person.id) || person;
          const relation = relationWith(state.me?.id, user.id);
          return el('div', { class: 'search-row' },
            el('a', { href: `#/u/${user.username}` }, avatarEl(user, 'md')),
            el('div', { class: 'grow' },
              el('a', { href: `#/u/${user.username}`, class: 'post-name', text: displayName(user) }),
              el('div', { class: 'muted small', text: `@${user.username}` })),
            user.id === state.me?.id ? null : followButton(user));
        })));
    }

    if (showGroups && found.groups.length) {
      results.appendChild(el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Grupos'),
        ...found.groups.map((group) => el('a', {
          class: 'search-row', href: `#/grupos/${group.id}`,
        },
        el('span', { class: 'group-mini' }, group.cover
          ? mediaImg(group.cover, { alt: group.name })
          : icon('groups', 18)),
        el('div', { class: 'grow' },
          el('div', { class: 'post-name', text: group.name }),
          el('div', { class: 'muted small', text: `${group.memberIds?.length || 0} miembros` }))))));
    }

    if (showPosts && found.posts.length) {
      const wrap = el('div', { class: 'col gap-16' });
      for (const post of found.posts) {
        const card = postCard(post);
        cards.push(card);
        wrap.appendChild(card.el);
      }
      results.appendChild(el('div', { class: 'page-head' },
        el('h2', { text: 'Publicaciones' })));
      results.appendChild(wrap);
    }

    if (!results.children.length) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: `Sin resultados para “${query}”`,
          description: 'Probá con otras palabras.',
        })));
    }
  }

  const back = el('div', { class: 'page-back' },
    el('button', {
      class: 'btn ghost sm', type: 'button',
      onclick: () => navigate('/inicio'),
    }, icon('arrow-left', 17), 'Volver'));

  root.append(back, el('div', { class: 'page-card' },
    el('div', { class: 'search-inline', style: { margin: '4px 0 12px' } }, icon('search', 18), input),
    tabs), results);

  render();
  setTimeout(() => input.focus(), 50);

  return {
    el: root,
    destroy() { cards.forEach((card) => card.destroy?.()); },
  };
}
