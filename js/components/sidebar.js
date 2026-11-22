/* ==========================================================================
   sidebar.js — accesos rápidos
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, countFollowers, countFollowing, followingOf,
} from '../core/store.js';
import { avatarEl } from '../core/ui.js';
import { parseRoute } from '../core/router.js';
import { mediaImg } from '../core/media.js';

function item({ iconName, color = '', label, count, href, active, avatar = null }) {
  return el('a', {
    class: `side-item ${active ? 'active' : ''}`.trim(),
    href,
    title: label,
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

    root.appendChild(item({
      avatar: avatarEl(me, 'sm'),
      label: displayName(me),
      href: '#/mi-perfil',
      active: route.name === 'myprofile',
    }));

    root.appendChild(item({
      iconName: 'users', color: 'green', label: 'Seguidores',
      count: countFollowers(me.id) || null,
      href: '#/seguidores',
      active: route.name === 'friends' && route.params.tab === 'seguidores',
    }));
    root.appendChild(item({
      iconName: 'user-plus', color: 'purple', label: 'Siguiendo',
      count: countFollowing(me.id) || null,
      href: '#/seguidores/siguiendo',
      active: route.name === 'friends' && route.params.tab === 'siguiendo',
    }));
    root.appendChild(item({
      iconName: 'groups', color: 'orange', label: 'Grupos y canales',
      href: '#/grupos', active: route.name === 'groups' || route.name === 'group',
    }));
    root.appendChild(item({
      iconName: 'shop', color: 'blue', label: 'Shop',
      href: '#/tienda', active: route.name === 'shop' || route.name === 'shopitem',
    }));
    root.appendChild(item({
      iconName: 'message', color: 'blue', label: 'Mensajes',
      count: state.ui.unreadMessages || null,
      href: '#/mensajes', active: route.name === 'messages',
    }));
    root.appendChild(item({
      iconName: 'bookmark', color: 'purple', label: 'Guardado',
      href: '#/guardados', active: route.name === 'saved',
    }));
    root.appendChild(item({
      iconName: 'bell', color: 'red', label: 'Notificaciones',
      count: state.ui.unreadNotifs || null,
      href: '#/notificaciones', active: route.name === 'notifications',
    }));
    root.appendChild(item({
      iconName: 'grid', color: 'teal', label: 'Menú',
      href: '#/menu', active: route.name === 'menu' || route.name === 'settings',
    }));

    const myGroups = state.groups.filter((group) => group.memberIds?.includes(me.id)).slice(0, 6);
    if (myGroups.length) {
      root.appendChild(el('div', { class: 'side-title' }, 'Tus grupos y canales'));
      for (const group of myGroups) {
        root.appendChild(item({
          avatar: el('span', { class: 'avatar sm', style: { borderRadius: '10px', overflow: 'hidden' } },
            group.cover
              ? mediaImg(group.cover, { alt: group.name })
              : el('span', {
                class: 'center',
                style: { width: '100%', height: '100%', background: 'var(--card-2)' },
              }, icon((group.type || 'group') === 'channel' ? 'radio' : 'groups', 18))),
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
        root.appendChild(item({
          avatar: avatarEl(person, 'sm'),
          label: displayName(person),
          href: `#/u/${person.username}`,
        }));
      }
    }

    root.appendChild(el('div', { class: 'side-foot' },
      el('div', { text: 'Privacidad · Condiciones · Publicidad · Cookies' }),
      el('div', { text: 'Zuma © 2026 · Hecho para compartir' })));
  }

  render();
  return { el: root, render };
}
