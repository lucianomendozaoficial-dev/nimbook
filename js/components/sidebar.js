/* ==========================================================================
   sidebar.js — columna izquierda con accesos, grupos y personas que seguís
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, countFollowers, countFollowing, followingOf,
} from '../core/store.js';
import { avatarEl } from '../core/ui.js';
import { parseRoute } from '../core/router.js';
import { mediaImg } from '../core/media.js';

function navItem({ iconName, color = '', label, count, href, active, onClick, avatar = null }) {
  return el(onClick || !href ? 'button' : 'a', {
    class: `side-item ${active ? 'active' : ''}`.trim(),
    type: onClick || !href ? 'button' : null,
    href: href || null,
    title: label,
    onclick: onClick ? (event) => { event.preventDefault(); onClick(); } : null,
  },
  avatar || el('span', { class: `side-ic ${color}`.trim() }, icon(iconName, 20)),
  el('span', { class: 'side-label', text: label }),
  count ? el('span', { class: 'side-count', text: count }) : null);
}

export function mountSidebar() {
  const root = el('aside', { class: 'col-left', 'aria-label': 'Accesos rápidos' });

  function render() {
    clear(root);
    const route = parseRoute();
    const me = state.me;
    if (!me) return;

    root.appendChild(navItem({
      avatar: avatarEl(me, 'sm'),
      label: displayName(me),
      href: `#/u/${me.username}`,
      active: route.name === 'profile' && route.params.username === me.username,
    }));

    root.appendChild(navItem({
      iconName: 'users', color: 'green', label: 'Seguidores',
      count: countFollowers(me.id) || null,
      href: '#/seguidores', active: route.name === 'friends' && !route.params.tab,
    }));
    root.appendChild(navItem({
      iconName: 'user-plus', color: 'purple', label: 'Siguiendo',
      count: countFollowing(me.id) || null,
      href: '#/seguidores/siguiendo',
      active: route.name === 'friends' && route.params.tab === 'siguiendo',
    }));
    root.appendChild(navItem({
      iconName: 'groups', color: 'orange', label: 'Grupos',
      href: '#/grupos', active: route.name === 'groups' || route.name === 'group',
    }));
    root.appendChild(navItem({
      iconName: 'bookmark', color: 'purple', label: 'Guardado',
      href: '#/guardados', active: route.name === 'saved',
    }));
    root.appendChild(navItem({
      iconName: 'message', color: 'teal', label: 'Mensajes',
      count: state.ui.unreadChats || null,
      href: '#/mensajes', active: route.name === 'messages',
    }));
    root.appendChild(navItem({
      iconName: 'bell', color: 'red', label: 'Notificaciones',
      count: state.ui.unreadNotifs || null,
      href: '#/notificaciones', active: route.name === 'notifications',
    }));
    root.appendChild(navItem({
      iconName: 'grid', color: 'teal', label: 'Menú',
      href: '#/menu', active: route.name === 'menu',
    }));

    const myGroups = state.groups.filter((g) => g.memberIds?.includes(me.id)).slice(0, 6);
    if (myGroups.length) {
      root.appendChild(el('div', { class: 'side-title' }, 'Tus grupos'));
      for (const group of myGroups) {
        root.appendChild(navItem({
          avatar: el('span', {
            class: 'avatar sm',
            style: { borderRadius: '10px', overflow: 'hidden' },
          }, group.cover
            ? mediaImg(group.cover, { alt: group.name })
            : el('span', { class: 'center', style: { width: '100%', height: '100%', background: 'var(--card-2)' } }, icon('groups', 18))),
          label: group.name,
          href: `#/grupos/${group.id}`,
          active: route.name === 'group' && route.params.id === group.id,
        }));
      }
    }

    const following = followingOf(me.id).slice(0, 6);
    if (following.length) {
      root.appendChild(el('div', { class: 'side-title' }, 'Siguiendo'));
      for (const person of following) {
        root.appendChild(navItem({
          avatar: el('span', { class: 'presence' },
            avatarEl(person, 'sm'),
            el('span', { class: 'dot' })),
          label: displayName(person),
          href: `#/u/${person.username}`,
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
