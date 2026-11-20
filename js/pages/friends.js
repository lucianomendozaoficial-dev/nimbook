/* ==========================================================================
   pages/friends.js — amigos, solicitudes y sugerencias
   ========================================================================== */
import { el, clear, formatCount, normalize, debounce } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, friendsOf, incomingRequests, outgoingRequests, friendSuggestions,
  userById, mutualFriends, friendCount, relationWith,
} from '../core/store.js';
import { avatarEl, emptyState, toast, confirmDialog } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import {
  acceptFriendRequest, rejectFriendRequest, sendFriendRequest, removeFriend,
} from '../core/actions.js';
import { navigate } from '../core/router.js';

function userTile(user, { subtitle = '', actions = [] } = {}) {
  const tile = el('div', { class: 'user-tile' },
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
  return tile;
}

function friendRow(user, { actions = [] } = {}) {
  return el('div', { class: 'friend-card' },
    el('a', { href: `#/u/${user.username}` }, avatarEl(user, 'lg')),
    el('div', { class: 'grow', style: { minWidth: '0' } },
      el('a', {
        href: `#/u/${user.username}`, class: 'fc-name', text: displayName(user),
        style: { display: 'block' },
      }),
      el('span', { class: 'fc-sub', text: `@${user.username}` })),
    el('div', { class: 'fc-actions' }, ...actions));
}

export function friendsPage(tab = 'friends') {
  const root = el('div');
  let query = '';

  const TABS = [
    { id: 'friends', label: 'Amigos' },
    { id: 'requests', label: 'Solicitudes' },
    { id: 'suggestions', label: 'Sugerencias' },
    { id: 'all', label: 'Todas las personas' },
  ];

  const tabsBar = el('div', { class: 'tabs' });
  for (const item of TABS) {
    const count = item.id === 'friends' ? friendCount(state.me.id)
      : item.id === 'requests' ? incomingRequests(state.me.id).length : null;
    tabsBar.appendChild(el('button', {
      class: `tab ${tab === item.id ? 'active' : ''}`, type: 'button',
      onclick: () => { window.location.hash = `/friends/${item.id}`; },
    }, item.label, count ? el('span', { class: 'tab-count', text: `· ${count}` }) : null));
  }

  const searchInput = el('input', {
    type: 'search', placeholder: 'Buscar amigos…', 'aria-label': 'Buscar amigos',
  });
  const searchWrap = el('div', { class: 'search-inline', style: { margin: '12px 0' } },
    icon('search', 18), searchInput);

  const content = el('div', { style: { padding: '4px 0 16px' } });

  const head = el('div', { class: 'section-head' },
    el('h1', { text: 'Amigos' }));

  root.append(el('div', { class: 'page-card' },
    el('div', { style: { padding: '16px 16px 0' } },
      head,
      tab === 'requests' || tab === 'suggestions' || tab === 'all' ? null : searchWrap,
      tabsBar)),
  content);

  searchInput.addEventListener('input', debounce(() => {
    query = normalize(searchInput.value);
    render();
  }, 180));

  function renderFriends() {
    const all = friendsOf(state.me.id).sort((a, b) => displayName(a).localeCompare(displayName(b)));
    const list = query ? all.filter((u) => normalize(displayName(u)).includes(query)
      || normalize(u.username).includes(query)) : all;
    if (!all.length) {
      content.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'users',
          title: 'Todavía no tienes amigos',
          description: 'Busca personas que conozcas y envíales una solicitud.',
          action: el('button', {
            class: 'btn primary', type: 'button', text: 'Ver sugerencias',
            onclick: () => { window.location.hash = '/friends/suggestions'; },
          }),
        })));
      return;
    }
    if (!list.length) {
      content.appendChild(el('div', { class: 'card' },
        emptyState({ iconName: 'search', title: 'Sin coincidencias', description: 'Prueba con otro nombre.' })));
      return;
    }
    content.appendChild(el('div', { class: 'muted small', style: { padding: '4px 16px 8px' },
      text: `${formatCount(list.length)} amigos` }));
    const grid = el('div', { class: 'friend-grid', style: { padding: '0 16px 16px' } });
    for (const friend of list) {
      grid.appendChild(userTile(friend, {
        subtitle: `@${friend.username}`,
        actions: [
          el('button', {
            class: 'btn sm', type: 'button', text: 'Mensaje',
            onclick: () => navigate(`/messages?u=${friend.id}`),
          }),
          el('button', {
            class: 'btn sm ghost icon-only', type: 'button', 'aria-label': 'Quitar amigo',
            title: 'Quitar amigo',
            onclick: () => {
              confirmDialog({
                title: `¿Eliminar a ${displayName(friend)}?`,
                message: 'Dejarán de ser amigos en NimbookGR.',
                confirmText: 'Eliminar', danger: true,
              }).then(async (ok) => {
                if (!ok) return;
                try {
                  await removeFriend(friend.id);
                  toast('Amistad eliminada', { type: 'success' });
                  render();
                } catch (err) { toast(err.message, { type: 'error' }); }
              });
            },
          }, icon('user-x', 16)),
        ],
      }));
    }
    content.appendChild(grid);
  }

  function renderRequests() {
    const incoming = incomingRequests(state.me.id);
    const outgoing = outgoingRequests(state.me.id);

    if (!incoming.length && !outgoing.length) {
      content.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'user-plus',
          title: 'No hay solicitudes pendientes',
          description: 'Aquí aparecerán las personas que quieran añadirte.',
        })));
      return;
    }

    if (incoming.length) {
      const card = el('div', { class: 'card pad' },
        el('h3', { class: 'card-title', text: `Solicitudes recibidas · ${incoming.length}` }));
      for (const request of incoming) {
        const user = userById(request.from);
        if (!user) continue;
        card.appendChild(friendRow(user, {
          actions: [
            el('button', {
              class: 'btn primary sm', type: 'button', text: 'Confirmar',
              onclick: async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                try {
                  await acceptFriendRequest(request.id);
                  toast(`Ahora eres amigo de ${displayName(user)}`, { type: 'success' });
                  render();
                } catch (err) { button.disabled = false; toast(err.message, { type: 'error' }); }
              },
            }),
            el('button', {
              class: 'btn sm', type: 'button', text: 'Eliminar',
              onclick: async () => {
                try {
                  await rejectFriendRequest(request.id);
                  render();
                } catch (err) { toast(err.message, { type: 'error' }); }
              },
            }),
          ],
        }));
      }
      content.appendChild(card);
    }

    if (outgoing.length) {
      const card = el('div', { class: 'card pad', style: { marginTop: '16px' } },
        el('h3', { class: 'card-title', text: `Solicitudes enviadas · ${outgoing.length}` }));
      for (const request of outgoing) {
        const user = userById(request.to);
        if (!user) continue;
        card.appendChild(friendRow(user, {
          actions: [
            el('button', {
              class: 'btn sm', type: 'button', text: 'Cancelar',
              onclick: async () => {
                try {
                  await rejectFriendRequest(request.id);
                  render();
                } catch (err) { toast(err.message, { type: 'error' }); }
              },
            }),
          ],
        }));
      }
      content.appendChild(card);
    }
  }

  function renderSuggestions() {
    const suggestions = friendSuggestions(state.me.id, 24);
    if (!suggestions.length) {
      content.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'sparkles',
          title: 'No hay sugerencias por ahora',
          description: 'Cuando se registren más personas las verás aquí.',
        })));
      return;
    }
    const grid = el('div', { class: 'friend-grid', style: { padding: '0 16px' } });
    for (const person of suggestions) {
      const mutual = mutualFriends(state.me.id, person.id).length;
      const button = el('button', {
        class: 'btn primary sm', type: 'button', text: 'Añadir amigo',
        onclick: async (event) => {
          const btn = event.currentTarget;
          btn.disabled = true;
          try {
            await sendFriendRequest(person.id);
            btn.textContent = 'Solicitud enviada';
            btn.classList.remove('primary');
            toast(`Solicitud enviada a ${displayName(person)}`, { type: 'success' });
          } catch (err) { btn.disabled = false; toast(err.message, { type: 'error' }); }
        },
      });
      grid.appendChild(userTile(person, {
        subtitle: mutual ? `${mutual} amigo${mutual === 1 ? '' : 's'} en común` : 'Nuevo en NimbookGR',
        actions: [button],
      }));
    }
    content.appendChild(grid);
  }

  function renderAll() {
    const people = state.users
      .filter((u) => u.id !== state.me.id)
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    const list = query ? people.filter((u) => normalize(displayName(u)).includes(query)) : people;
    if (!list.length) {
      content.appendChild(el('div', { class: 'card' },
        emptyState({ iconName: 'search', title: 'Sin resultados' })));
      return;
    }
    const grid = el('div', { class: 'friend-grid', style: { padding: '0 16px' } });
    for (const person of list) {
      const relation = relationWith(state.me.id, person.id);
      grid.appendChild(userTile(person, {
        subtitle: relation === 'friends' ? 'Amigos' : `@${person.username}`,
        actions: [
          relation === 'friends'
            ? el('button', {
              class: 'btn sm', type: 'button', text: 'Mensaje',
              onclick: () => navigate(`/messages?u=${person.id}`),
            })
            : el('button', {
              class: 'btn sm primary', type: 'button',
              text: relation === 'requested' ? 'Solicitud enviada' : 'Añadir amigo',
              disabled: relation === 'requested',
              onclick: async (event) => {
                const btn = event.currentTarget;
                btn.disabled = true;
                try {
                  await sendFriendRequest(person.id);
                  btn.textContent = 'Solicitud enviada';
                  toast('Solicitud enviada', { type: 'success' });
                } catch (err) { btn.disabled = false; toast(err.message, { type: 'error' }); }
              },
            }),
        ],
      }));
    }
    content.appendChild(grid);
  }

  function render() {
    clear(content);
    if (tab === 'requests') renderRequests();
    else if (tab === 'suggestions') renderSuggestions();
    else if (tab === 'all') renderAll();
    else renderFriends();
  }

  render();
  return {
    el: root,
    onData() {
      // actualiza contadores de pestañas y contenido
      const buttons = tabsBar.querySelectorAll('.tab');
      const counts = [friendCount(state.me.id), incomingRequests(state.me.id).length, 0, 0];
      buttons.forEach((button, index) => {
        const existing = button.querySelector('.tab-count');
        const value = counts[index];
        if (!value) { existing?.remove(); return; }
        if (existing) existing.textContent = `· ${value}`;
        else button.appendChild(el('span', { class: 'tab-count', text: `· ${value}` }));
      });
      if (tab === 'friends' || tab === 'requests' || tab === 'suggestions') render();
    },
  };
}
