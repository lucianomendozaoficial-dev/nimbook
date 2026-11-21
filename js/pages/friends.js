/* ==========================================================================
   pages/friends.js — seguidores, siguiendo y sugerencias
   ========================================================================== */
import { el, clear, formatCount, normalize, debounce } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, followersOf, followingOf, followSuggestions,
  mutualFollowers, countFollowers, countFollowing, relationWith, isFollowing,
} from '../core/store.js';
import { avatarEl, emptyState, toast } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import { followButton } from '../components/follow-button.js';
import { navigate } from '../core/router.js';
import { emptyFriendsIllustration } from '../core/illustrations.js';

function userTile(user, { subtitle = '', actions = [] } = {}) {
  return el('div', { class: 'user-tile' },
    el('a', { href: `#/u/${user.username}`, class: 'ut-img' },
      user.avatar
        ? mediaImg(user.avatar, { alt: displayName(user) })
        : el('div', {
          class: 'center',
          style: {
            width: '100%', height: '100%', fontSize: '34px', color: '#fff', fontWeight: '700',
            background: 'linear-gradient(135deg,#1877f2,#42b0ff)',
          },
          text: (displayName(user) || '?').slice(0, 2).toUpperCase(),
        })),
    el('div', { class: 'ut-body' },
      el('a', { href: `#/u/${user.username}`, class: 'ut-name', text: displayName(user) }),
      el('span', { class: 'ut-sub', text: subtitle }),
      actions.length ? el('div', { class: 'ut-actions' }, ...actions) : null));
}

const TABS = [
  { id: 'seguidores', label: 'Seguidores' },
  { id: 'siguiendo', label: 'Siguiendo' },
  { id: 'sugerencias', label: 'Sugerencias' },
  { id: 'todos', label: 'Todas las personas' },
];

export function friendsPage(tab = 'seguidores') {
  const root = el('div');
  const me = state.me;
  let query = '';

  const tabsBar = el('div', { class: 'tabs' });
  function renderTabs() {
    clear(tabsBar);
    const counts = {
      seguidores: countFollowers(me.id),
      siguiendo: countFollowing(me.id),
      sugerencias: followSuggestions(me.id, 99).length,
      todos: state.users.length - 1,
    };
    for (const item of TABS) {
      tabsBar.appendChild(el('a', {
        class: `tab ${tab === item.id ? 'active' : ''}`.trim(),
        href: `#/seguidores${item.id === 'seguidores' ? '' : `/${item.id}`}`,
      }, item.label, counts[item.id] ? el('span', { class: 'tab-count', text: `· ${counts[item.id]}` }) : null));
    }
  }

  const searchInput = el('input', {
    type: 'search', placeholder: 'Buscar personas…', 'aria-label': 'Buscar personas',
  });
  const searchWrap = el('div', { class: 'search-inline', style: { margin: '12px 0 4px' } },
    icon('search', 18), searchInput);

  const content = el('div', { style: { padding: '4px 0 16px' } });
  const title = {
    seguidores: 'Seguidores',
    siguiendo: 'Siguiendo',
    sugerencias: 'Sugerencias para ti',
    todos: 'Todas las personas',
  }[tab] || 'Seguidores';
  const subtitle = {
    seguidores: 'Las personas que siguen tu perfil.',
    siguiendo: 'Las personas que ves en tu muro.',
    sugerencias: 'Gente que quizá te interese seguir.',
    todos: 'Todas las cuentas de NimbookGR.',
  }[tab] || '';

  root.append(el('div', { class: 'page-card' },
    el('div', { style: { padding: '16px 16px 0' } },
      el('div', { class: 'section-head', style: { marginBottom: '4px' } },
        el('div', null,
          el('h1', { text: title }),
          el('p', { class: 'muted small', text: subtitle }))),
      searchWrap,
      tabsBar)),
  content);

  searchInput.addEventListener('input', debounce(() => {
    query = normalize(searchInput.value);
    render();
  }, 160));

  function actionRow(person, { showFollow = true } = {}) {
    const actions = [];
    if (showFollow) {
      actions.push(followButton(person, { onChange: () => renderTabs() }));
    }
    actions.push(el('button', {
      class: 'btn sm icon-only', type: 'button', 'aria-label': 'Enviar mensaje', title: 'Enviar mensaje',
      onclick: () => navigate(`/mensajes?u=${person.id}`),
    }, icon('message', 16)));
    return actions;
  }

  function grid(people, { subtitleFor, showFollow = true } = {}) {
    if (!people.length) return null;
    const box = el('div', { class: 'friend-grid', style: { padding: '8px 16px 16px' } });
    for (const person of people) {
      box.appendChild(userTile(person, {
        subtitle: subtitleFor ? subtitleFor(person) : `@${person.username}`,
        actions: actionRow(person, { showFollow }),
      }));
    }
    return box;
  }

  function renderEmpty({ illustration = '', iconName = 'users', title: text, description = '', action = null }) {
    content.appendChild(el('div', { class: 'card' },
      emptyState({ illustration, iconName, title: text, description, action })));
  }

  function renderFollowers() {
    const people = followersOf(me.id)
      .filter((u) => !query || normalize(displayName(u)).includes(query))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    if (!people.length) {
      renderEmpty({
        illustration: emptyFriendsIllustration(),
        title: 'Todavía no tienes seguidores',
        description: 'Comparte tu perfil para que más personas te sigan. Mientras tanto, seguí a otros.',
        action: el('button', {
          class: 'btn primary', type: 'button', text: 'Ver sugerencias',
          onclick: () => { window.location.hash = '/seguidores/sugerencias'; },
        }),
      });
      return;
    }
    content.appendChild(grid(people, {
      subtitleFor: (p) => (isFollowing(me.id, p.id) ? 'Te sigue · la seguís' : 'Te sigue'),
    }));
  }

  function renderFollowing() {
    const people = followingOf(me.id)
      .filter((u) => !query || normalize(displayName(u)).includes(query))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    if (!people.length) {
      renderEmpty({
        iconName: 'user-plus',
        title: 'Todavía no seguís a nadie',
        description: 'Seguí personas para ver sus publicaciones en tu muro.',
        action: el('button', {
          class: 'btn primary', type: 'button', text: 'Ver sugerencias',
          onclick: () => { window.location.hash = '/seguidores/sugerencias'; },
        }),
      });
      return;
    }
    content.appendChild(grid(people, {
      showFollow: true,
      subtitleFor: (p) => (isFollowing(p.id, me.id) ? `@${p.username} · te sigue` : `@${p.username}`),
    }));
  }

  function renderSuggestions() {
    const people = followSuggestions(me.id, 40)
      .filter((u) => !query || normalize(displayName(u)).includes(query));
    if (!people.length) {
      renderEmpty({
        title: 'No hay sugerencias por ahora',
        description: 'Cuando se registren más personas las vas a ver acá.',
      });
      return;
    }
    content.appendChild(grid(people, {
      subtitleFor: (p) => {
        const mutual = mutualFollowers(me.id, p.id).length;
        return mutual ? `${mutual} seguidor${mutual === 1 ? '' : 'es'} en común` : 'Nueva en NimbookGR';
      },
    }));
  }

  function renderAll() {
    const people = state.users
      .filter((u) => u.id !== me.id)
      .filter((u) => !query || normalize(displayName(u)).includes(query)
        || normalize(u.username).includes(query))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    if (!people.length) {
      renderEmpty({ iconName: 'search', title: 'Sin resultados' });
      return;
    }
    content.appendChild(grid(people, {
      subtitleFor: (p) => {
        const relation = relationWith(me.id, p.id);
        if (relation === 'following') return `@${p.username} · lo seguís`;
        if (relation === 'follows-you') return `@${p.username} · te sigue`;
        return `@${p.username}`;
      },
    }));
  }

  function render() {
    clear(content);
    renderTabs();
    if (tab === 'siguiendo') renderFollowing();
    else if (tab === 'sugerencias') renderSuggestions();
    else if (tab === 'todos') renderAll();
    else renderFollowers();
  }

  render();
  return {
    el: root,
    onData: () => {
      if (query) render();
      else renderTabs();
    },
  };
}
