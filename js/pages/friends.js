/* ==========================================================================
   pages/friends.js — seguidores, siguiendo y sugerencias
   ========================================================================== */
import { el, clear, normalize, debounce } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, followersOf, followingOf, followSuggestions, mutualFollowers,
  countFollowers, countFollowing, relationWith, isFollowing, loadFollowers, loadFollowing,
} from '../core/store.js';
import { avatarEl, emptyState } from '../core/ui.js';
import { followButton } from '../components/follow-button.js';
import { emptyFriendsIllustration } from '../core/illustrations.js';
import { navigate } from '../core/router.js';

const TABS = [
  { id: 'seguidores', label: 'Seguidores' },
  { id: 'siguiendo', label: 'Siguiendo' },
  { id: 'sugerencias', label: 'Sugerencias' },
  { id: 'todos', label: 'Todas las personas' },
];

function tile(person, subtitle, actions) {
  return el('div', { class: 'user-tile' },
    el('a', { href: `#/u/${person.username}`, class: 'ut-img' }, avatarEl(person, 'xl')),
    el('div', { class: 'ut-body' },
      el('a', { href: `#/u/${person.username}`, class: 'ut-name', text: displayName(person) }),
      el('span', { class: 'ut-sub', text: subtitle }),
      el('div', { class: 'ut-actions' }, ...actions)));
}

export function friendsPage(tab = 'seguidores') {
  const root = el('div');
  const me = state.me;
  let query = '';
  const content = el('div', { style: { paddingTop: '8px' } });
  const tabsBar = el('div', { class: 'tabs' });

  const searchInput = el('input', {
    type: 'search', placeholder: 'Buscar personas…', 'aria-label': 'Buscar personas',
  });
  searchInput.addEventListener('input', debounce(() => {
    query = normalize(searchInput.value);
    render();
  }, 150));

  function renderTabs() {
    clear(tabsBar);
    const counts = {
      seguidores: countFollowers(me.id),
      siguiendo: countFollowing(me.id),
      sugerencias: followSuggestions(me.id, 99).length,
      todos: Math.max(0, state.userIndex.length - 1),
    };
    for (const item of TABS) {
      tabsBar.appendChild(el('a', {
        class: `tab ${tab === item.id ? 'active' : ''}`.trim(),
        href: `#/seguidores${item.id === 'seguidores' ? '' : `/${item.id}`}`,
      }, item.label, counts[item.id]
        ? el('span', { class: 'tab-count', text: `· ${counts[item.id]}` }) : null));
    }
  }

  function actionsFor(person, { follow = true } = {}) {
    const actions = [];
    if (follow) actions.push(followButton(person, { onChange: renderTabs }));
    if (person.id !== me.id) {
      actions.push(el('a', {
        class: 'btn sm soft', href: `#/u/${person.username}`, text: 'Ver perfil',
      }));
    }
    return actions;
  }

  function grid(people, subtitleFor, opts = {}) {
    if (!people.length) return null;
    return el('div', { class: 'friend-grid', style: { padding: '8px 0 16px' } },
      ...people.map((person) => tile(person, subtitleFor(person), actionsFor(person, opts))));
  }

  function render() {
    clear(content);
    renderTabs();
    const filter = (person) => !query || normalize(displayName(person)).includes(query);

    if (tab === 'siguiendo') {
      const people = followingOf(me.id).filter(filter);
      content.appendChild(grid(people, (person) =>
        (isFollowing(person.id, me.id) ? `@${person.username} · te sigue` : `@${person.username}`)) || el('div', { class: 'card' },
      emptyState({
        iconName: 'user-plus',
        title: 'Todavía no seguís a nadie',
        description: 'Seguí personas para ver sus publicaciones.',
        action: el('button', {
          class: 'btn primary', type: 'button', text: 'Ver sugerencias',
          onclick: () => navigate('/seguidores/sugerencias'),
        }),
      })));
      return;
    }

    if (tab === 'sugerencias') {
      const people = followSuggestions(me.id, 60).filter(filter);
      content.appendChild(grid(people, (person) => {
        const mutual = mutualFollowers(me.id, person.id).length;
        return mutual ? `${mutual} seguidor${mutual === 1 ? '' : 'es'} en común` : 'Nueva en NimbookGR';
      }) || el('div', { class: 'card' },
      emptyState({ iconName: 'sparkles', title: 'No hay sugerencias por ahora' })));
      return;
    }

    if (tab === 'todos') {
      const people = state.userIndex
        .filter((person) => person.id !== me.id)
        .filter((person) => filter(person) || normalize(person.username || '').includes(query))
        .map((person) => state.users.get(person.id) || person);
      content.appendChild(grid(people, (person) => {
        const relation = relationWith(me.id, person.id);
        if (relation === 'following') return `@${person.username} · lo seguís`;
        if (relation === 'follows-you') return `@${person.username} · te sigue`;
        return `@${person.username}`;
      }) || el('div', { class: 'card' }, emptyState({ iconName: 'search', title: 'Sin resultados' })));
      return;
    }

    const people = followersOf(me.id).filter(filter);
    content.appendChild(grid(people, (person) =>
      (isFollowing(me.id, person.id) ? 'Te sigue · lo seguís' : 'Te sigue')) || el('div', { class: 'card' },
    emptyState({
      illustration: emptyFriendsIllustration(),
      title: 'Todavía no tenés seguidores',
      description: 'Compartí tu perfil y seguí a otras personas.',
      action: el('button', {
        class: 'btn primary', type: 'button', text: 'Ver sugerencias',
        onclick: () => navigate('/seguidores/sugerencias'),
      }),
    })));
  }

  root.append(el('div', { class: 'page-card' },
    el('div', { style: { padding: '16px 16px 0' } },
      el('h1', { text: 'Seguidores' }),
      el('p', { class: 'muted small', text: 'Las personas que siguen tu perfil y las que seguís.' }),
      el('div', { class: 'search-inline', style: { margin: '12px 0' } }, icon('search', 18), searchInput),
      tabsBar)), content);

  (async () => {
    await Promise.all([loadFollowers(me.id), loadFollowing(me.id)]);
    render();
  })();

  return {
    el: root,
    onData(topic) { if (topic === 'follow' || topic === 'ready') render(); },
  };
}
