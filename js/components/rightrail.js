/* ==========================================================================
   rightrail.js — contactos y sugerencias (columna derecha)
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, friendsOf, friendSuggestions, mutualFriends, userById,
} from '../core/store.js';
import { avatarEl, toast } from '../core/ui.js';
import { isOnline } from '../core/auth.js';
import { sendFriendRequest } from '../core/actions.js';

export function mountRightRail() {
  const root = el('aside', { class: 'col-right', 'aria-label': 'Contactos y sugerencias' });

  function render() {
    clear(root);
    const me = state.me;
    if (!me) return;

    const friends = friendsOf(me.id)
      .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)));
    const online = friends.filter(isOnline);
    const ordered = [...online, ...friends.filter((f) => !isOnline(f))];

    const head = el('div', { class: 'rail-title' },
      el('span', { text: 'Contactos' }),
      el('span', { class: 'row gap-4' },
        el('button', {
          class: 'btn-icon', type: 'button', title: 'Buscar contactos', 'aria-label': 'Buscar contactos',
          onclick: () => { window.location.hash = '/friends'; },
        }, icon('search', 18)),
        el('button', {
          class: 'btn-icon', type: 'button', title: 'Añadir amigos', 'aria-label': 'Añadir amigos',
          onclick: () => { window.location.hash = '/friends/suggestions'; },
        }, icon('user-plus', 18))));
    root.appendChild(head);

    if (!friends.length) {
      root.appendChild(el('div', {
        class: 'muted small', style: { padding: '4px 10px 10px' },
        text: 'Cuando añadas amigos aparecerán aquí.',
      }));
    } else {
      const list = el('div');
      for (const friend of ordered.slice(0, 14)) {
        list.appendChild(el('a', {
          class: 'rail-item', href: `#/messages?u=${friend.id}`,
          title: `Enviar mensaje a ${displayName(friend)}`,
        },
        el('span', { class: `presence ${isOnline(friend) ? '' : 'offline'}`.trim() },
          avatarEl(friend, 'sm'),
          el('span', { class: 'dot' })),
        el('span', { class: 'name', text: displayName(friend) })));
      }
      root.appendChild(list);
      if (friends.length > 14) {
        root.appendChild(el('a', {
          class: 'rail-item', href: '#/friends',
          style: { color: 'var(--brand)', fontWeight: '600' },
        }, el('span', { class: 'name', text: `Ver los ${friends.length} amigos` })));
      }
    }

    const suggestions = friendSuggestions(me.id, 5);
    if (suggestions.length) {
      root.appendChild(el('div', { class: 'rail-sep' }));
      root.appendChild(el('div', { class: 'rail-title' }, 'Sugerencias para ti'));
      for (const person of suggestions) {
        const mutual = mutualFriends(me.id, person.id).length;
        const row = el('div', { class: 'rail-item', style: { gap: '10px' } },
          el('a', { href: `#/u/${person.username}` }, avatarEl(person, 'sm')),
          el('div', { class: 'grow', style: { minWidth: '0' } },
            el('a', {
              href: `#/u/${person.username}`, class: 'name',
              style: { fontWeight: '600', display: 'block' },
              text: displayName(person),
            }),
            el('span', {
              class: 'dim tiny',
              text: mutual ? `${mutual} amigo${mutual === 1 ? '' : 's'} en común` : 'Nuevo en NimbookGR',
            })),
          el('button', {
            class: 'btn soft sm', type: 'button', text: 'Añadir',
            onclick: async (event) => {
              const button = event.currentTarget;
              button.disabled = true;
              try {
                await sendFriendRequest(person.id);
                button.textContent = 'Enviado';
                button.classList.remove('soft');
                toast(`Solicitud enviada a ${displayName(person)}`, { type: 'success' });
              } catch (err) {
                button.disabled = false;
                toast(err.message, { type: 'error' });
              }
            },
          }));
        root.appendChild(row);
      }
    }

    root.appendChild(el('div', { class: 'rail-sep' }));
    root.appendChild(el('div', {
      class: 'rail-item',
      style: { color: 'var(--text-3)', fontSize: '12.5px', lineHeight: '1.6' },
    }, 'NimbookGR · hecho para compartir con tus amigos'));
  }

  render();
  return { el: root, render };
}
