/* ==========================================================================
   sidebar.js — columna izquierda con accesos y grupos
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, friendCount, incomingRequests, friendsOf,
} from '../core/store.js';
import { avatarEl, isModalOpen } from '../core/ui.js';
import { parseRoute } from '../core/router.js';
import { mediaImg } from '../core/media.js';

function navItem({ iconName, color = '', label, count, href, active, onClick, avatar = null }) {
  const node = el(onClick || !href ? 'button' : 'a', {
    class: `side-item ${active ? 'active' : ''}`.trim(),
    type: onClick || !href ? 'button' : null,
    href: href || null,
    title: label,
    onclick: onClick ? (event) => { event.preventDefault(); onClick(); } : null,
  },
  avatar || el('span', { class: `side-ic ${color}`.trim() }, icon(iconName, 20)),
  el('span', { class: 'side-label', text: label }),
  count ? el('span', { class: 'side-count', text: count }) : null);
  return node;
}

export function mountSidebar() {
  const root = el('aside', { class: 'col-left', 'aria-label': 'Accesos rápidos' });

  function render() {
    clear(root);
    const route = parseRoute();
    const me = state.me;
    if (!me) return;

    const profileItem = navItem({
      avatar: avatarEl(me, 'sm'),
      label: displayName(me),
      href: `#/u/${me.username}`,
      active: route.name === 'profile' && route.params.username === me.username,
    });
    root.appendChild(profileItem);

    root.appendChild(navItem({
      iconName: 'users', color: 'green', label: 'Amigos',
      count: friendCount(me.id) || null,
      href: '#/friends', active: route.name === 'friends',
    }));
    const pending = incomingRequests(me.id).length;
    if (pending) {
      root.appendChild(navItem({
        iconName: 'user-plus', color: 'purple', label: 'Solicitudes',
        count: pending, href: '#/friends/requests',
        active: route.name === 'friends' && route.params.tab === 'requests',
      }));
    }
    root.appendChild(navItem({
      iconName: 'groups', color: 'orange', label: 'Grupos',
      href: '#/groups', active: route.name === 'groups' || route.name === 'group',
    }));
    root.appendChild(navItem({
      iconName: 'bookmark', color: 'purple', label: 'Guardado',
      href: '#/saved', active: route.name === 'saved',
    }));
    root.appendChild(navItem({
      iconName: 'message', color: 'teal', label: 'Mensajes',
      count: state.ui.unreadChats || null,
      href: '#/messages', active: route.name === 'messages',
    }));
    root.appendChild(navItem({
      iconName: 'bell', color: 'red', label: 'Notificaciones',
      count: state.ui.unreadNotifs || null,
      href: '#/notifications', active: route.name === 'notifications',
    }));

    const myGroups = state.groups.filter((g) => g.memberIds?.includes(me.id)).slice(0, 8);
    if (myGroups.length) {
      root.appendChild(el('div', { class: 'side-title' }, 'Tus grupos'));
      for (const group of myGroups) {
        root.appendChild(navItem({
          avatar: el('span', {
            class: 'avatar sm',
            style: { borderRadius: '8px', overflow: 'hidden' },
          }, group.cover
            ? mediaImg(group.cover, { alt: group.name })
            : el('span', { class: 'center', style: { width: '100%', height: '100%', background: 'var(--card-2)' } }, icon('groups', 18))),
          label: group.name,
          href: `#/groups/${group.id}`,
          active: route.name === 'group' && route.params.id === group.id,
        }));
      }
    }

    const friends = friendsOf(me.id).slice(0, 6);
    if (friends.length) {
      root.appendChild(el('div', { class: 'side-title' }, 'Amigos recientes'));
      for (const friend of friends) {
        root.appendChild(navItem({
          avatar: el('span', { class: 'presence' },
            avatarEl(friend, 'sm'),
            el('span', { class: 'dot' })),
          label: displayName(friend),
          href: `#/u/${friend.username}`,
          onClick: () => { window.location.hash = `/u/${friend.username}`; },
        }));
      }
    }

    root.appendChild(el('div', { class: 'side-foot' },
      el('div', { text: 'Privacidad · Condiciones · Publicidad · Cookies' }),
      el('div', { text: 'NimbookGR © 2026 · Hecho para compartir' })));
  }

  render();
  return { el: root, render };
}
