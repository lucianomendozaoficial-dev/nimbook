/* ==========================================================================
   topbar.js — barra superior con búsqueda, navegación y accesos rápidos
   ========================================================================== */
import { el, debounce, clear, normalize } from '../core/util.js';
import { icon } from '../core/icons.js';
import { navigate, parseRoute } from '../core/router.js';
import {
  state, displayName, searchEverything, userById, subscribe,
} from '../core/store.js';
import {
  avatarEl, popover, closeDropdown, closeMenus, toast, openModal, iconBtn,
} from '../core/ui.js';
import { logout } from '../core/auth.js';
import { notificationItem } from './notifications-list.js';
import { themeCycle, themeLabel } from '../core/theme.js';
import { canInstall, promptInstall, onPwaChange } from '../core/pwa.js';

const TOP_TABS = [
  { id: 'feed', icon: 'home', href: '#/inicio', label: 'Inicio' },
  { id: 'friends', icon: 'users', href: '#/seguidores', label: 'Seguidores' },
  { id: 'groups', icon: 'groups', href: '#/grupos', label: 'Grupos' },
  { id: 'saved', icon: 'bookmark', href: '#/guardados', label: 'Guardado' },
];

function buildSearchResults(query) {
  const q = String(query || '').trim();
  const wrap = el('div', { class: 'dd-scroll search-results' });
  if (q.length < 2) {
    wrap.appendChild(el('div', { class: 'dd-title', text: 'Buscar en NimbookGR' }));
    wrap.appendChild(el('div', {
      class: 'dd-item', style: { color: 'var(--text-2)', fontWeight: '400' },
    }, icon('search', 18), el('span', { text: 'Escribe al menos 2 letras…' })));
    return wrap;
  }
  const results = searchEverything(q, state.me?.id);
  const total = results.users.length + results.groups.length + results.posts.length;
  if (!total) {
    wrap.appendChild(el('div', { class: 'dd-title', text: 'Sin resultados' }));
    wrap.appendChild(el('div', {
      class: 'dd-item', style: { color: 'var(--text-2)', fontWeight: '400' },
    }, icon('info', 18), el('span', { text: `No encontramos nada para “${q}”.` })));
    return wrap;
  }

  if (results.users.length) {
    wrap.appendChild(el('div', { class: 'dd-title', text: 'Personas' }));
    for (const user of results.users.slice(0, 5)) {
      wrap.appendChild(el('a', {
        class: 'dd-item', href: `#/u/${user.username}`,
        onclick: () => closeDropdown(),
      }, avatarEl(user, 'sm'),
      el('span', { class: 'dd-label' }, displayName(user),
        el('span', { class: 'dd-sub', text: `@${user.username}` }))));
    }
  }
  if (results.groups.length) {
    wrap.appendChild(el('div', { class: 'dd-sep' }));
    wrap.appendChild(el('div', { class: 'dd-title', text: 'Grupos' }));
    for (const group of results.groups.slice(0, 3)) {
      wrap.appendChild(el('a', {
        class: 'dd-item', href: `#/groups/${group.id}`, onclick: () => closeDropdown(),
      }, el('span', { class: 'dd-ic' }, icon('groups', 18)),
      el('span', { class: 'dd-label' }, group.name,
        el('span', {
          class: 'dd-sub',
          text: `${group.memberIds?.length || 0} miembros · ${group.privacy === 'private' ? 'Privado' : 'Público'}`,
        }))));
    }
  }
  if (results.posts.length) {
    wrap.appendChild(el('div', { class: 'dd-sep' }));
    wrap.appendChild(el('div', { class: 'dd-title', text: 'Publicaciones' }));
    for (const post of results.posts.slice(0, 3)) {
      const author = userById(post.authorId);
      wrap.appendChild(el('a', {
        class: 'dd-item', href: `#/p/${post.id}`, onclick: () => closeDropdown(),
      }, el('span', { class: 'dd-ic' }, icon('message', 18)),
      el('span', { class: 'dd-label' },
        (post.text || 'Publicación con foto').slice(0, 60),
        el('span', { class: 'dd-sub', text: `por ${displayName(author)}` }))));
    }
  }
  wrap.appendChild(el('div', { class: 'dd-sep' }));
  wrap.appendChild(el('a', {
    class: 'dd-item',
    href: `#/search?q=${encodeURIComponent(q)}`,
    onclick: () => closeDropdown(),
  }, el('span', { class: 'dd-ic' }, icon('search', 18)),
  el('span', { class: 'dd-label', text: `Ver todos los resultados para “${q}”` })));
  return wrap;
}

function openSearchModal() {
  const input = el('input', {
    class: 'input', type: 'search', placeholder: 'Buscar personas, grupos y publicaciones…',
    'aria-label': 'Buscar',
  });
  const results = el('div', { style: { marginTop: '12px' } });
  const body = el('div', null, input, results);
  const api = openModal({ title: 'Buscar', body, size: 'sm' });
  const run = debounce(() => {
    clear(results);
    results.appendChild(buildSearchResults(input.value));
  }, 180);
  input.addEventListener('input', run);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && input.value.trim()) {
      api.close();
      navigate(`/search?q=${encodeURIComponent(input.value.trim())}`);
    }
  });
  setTimeout(() => input.focus(), 60);
}

export function mountTopbar() {
  const brand = el('a', { class: 'brand', href: '#/feed', 'aria-label': 'NimbookGR' },
    el('img', { src: 'assets/logo/nimbook-logo-64.png', alt: 'NimbookGR', width: '40', height: '40' }),
    el('span', { class: 'brand-word', text: 'NimbookGR' }));

  const searchInput = el('input', {
    type: 'search', placeholder: 'Buscar en NimbookGR', 'aria-label': 'Buscar en NimbookGR',
    autocomplete: 'off', enterkeyhint: 'search',
  });
  const searchPanel = el('div', {
    class: 'dd head hide', style: { width: '340px', maxHeight: '70vh', overflowY: 'auto' },
  });
  const searchBox = el('div', { class: 'tb-search' }, icon('search', 18), searchInput, searchPanel);

  const runSearch = debounce(() => {
    clear(searchPanel);
    searchPanel.appendChild(buildSearchResults(searchInput.value));
    searchPanel.classList.toggle('hide', document.activeElement !== searchInput && !searchInput.value);
  }, 180);

  searchInput.addEventListener('focus', () => {
    clear(searchPanel);
    searchPanel.appendChild(buildSearchResults(searchInput.value));
    searchPanel.classList.remove('hide');
  });
  searchInput.addEventListener('input', () => {
    searchPanel.classList.remove('hide');
    runSearch();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchInput.blur();
      searchPanel.classList.add('hide');
    } else if (event.key === 'Enter' && searchInput.value.trim()) {
      searchPanel.classList.add('hide');
      searchInput.blur();
      navigate(`/search?q=${encodeURIComponent(searchInput.value.trim())}`);
    }
  });
  document.addEventListener('mousedown', (event) => {
    if (!searchBox.contains(event.target)) searchPanel.classList.add('hide');
  });

  const nav = el('nav', { class: 'tb-nav', 'aria-label': 'Navegación principal' });
  const tabButtons = new Map();
  for (const tab of TOP_TABS) {
    const link = el('a', { class: 'tb-tab', href: tab.href, 'aria-label': tab.label, title: tab.label },
      icon(tab.icon, 28, { filled: true }));
    link.dataset.tab = tab.id;
    tabButtons.set(tab.id, link);
    nav.appendChild(link);
  }

  const searchMobile = el('button', {
    class: 'tb-btn tb-search-mobile', type: 'button', 'aria-label': 'Buscar',
    onclick: openSearchModal,
  }, icon('search', 22));

  const menuBtn = el('a', {
    class: 'tb-btn menu-grid', href: '#/menu', 'aria-label': 'Menú', title: 'Menú',
  }, icon('grid', 20));

  const installBtn = el('button', {
    class: 'tb-btn install-btn hide', type: 'button',
    'aria-label': 'Instalar NimbookGR', title: 'Instalar NimbookGR',
    onclick: async () => {
      const accepted = await promptInstall();
      if (accepted) toast('¡Instalada! Ya podés abrirla desde tu inicio.', { type: 'success' });
      installBtn.classList.add('hide');
    },
  }, icon('download', 20));

  const messagesBtn = el('a', {
    class: 'tb-btn', href: '#/mensajes', 'aria-label': 'Mensajes', title: 'Mensajes',
  }, icon('message', 22));
  const messagesBadge = el('span', { class: 'badge-dot hide' });
  messagesBtn.appendChild(messagesBadge);

  const notifBtn = el('button', {
    class: 'tb-btn', type: 'button', 'aria-label': 'Notificaciones', title: 'Notificaciones',
    onclick: () => openNotifications(notifBtn),
  }, icon('bell', 22));
  const notifBadge = el('span', { class: 'badge-dot hide' });
  notifBtn.appendChild(notifBadge);

  const avatarBtn = el('button', {
    class: 'tb-btn avatar-btn', type: 'button', 'aria-label': 'Tu cuenta',
    onclick: () => openAccountMenu(avatarBtn),
  });

  const root = el('header', { class: 'topbar' },
    el('div', { class: 'topbar-left' }, brand, searchBox),
    searchMobile,
    nav,
    el('div', { class: 'topbar-right' }, installBtn, menuBtn, messagesBtn, notifBtn, avatarBtn));

  function openAccountMenu(anchor, withExtras = false) {
    const me = state.me;
    const dark = document.documentElement.dataset.theme === 'dark';
    const items = [];
    if (withExtras) {
      items.push({ icon: 'grid', label: 'Menú', title: 'Accesos rápidos' });
    }
    const menu = el('div');
    const add = (iconName, label, sub, onClick, danger) => {
      menu.appendChild(el('button', {
        class: 'dd-item', type: 'button',
        style: danger ? { color: 'var(--danger)' } : null,
        onclick: () => { closeDropdown(); onClick?.(); },
      }, el('span', {
        class: 'dd-ic',
        style: danger ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : null,
      }, icon(iconName, 19)),
      el('span', { class: 'dd-label' }, label, sub ? el('span', { class: 'dd-sub', text: sub }) : null)));
    };
    if (me) {
      menu.appendChild(el('a', {
        class: 'dd-item', href: `#/u/${me.username}`, onclick: () => closeDropdown(),
      }, avatarEl(me, 'sm'),
      el('span', { class: 'dd-label' }, displayName(me),
        el('span', { class: 'dd-sub', text: 'Ver tu perfil' }))));
      menu.appendChild(el('div', { class: 'dd-sep' }));
    }
    add('bookmark', 'Guardado', 'Publicaciones que guardaste', () => navigate('/guardados'));
    add('groups', 'Grupos', `${state.groups.filter((g) => g.memberIds?.includes(me?.id)).length} a los que perteneces`,
      () => navigate('/grupos'));
    add('settings', 'Configuración', 'Cuenta, apariencia y privacidad', () => navigate('/ajustes'));
    add(dark ? 'sun' : 'moon', dark ? 'Modo claro' : 'Modo oscuro', `Ahora: ${themeLabel()}`,
      () => { themeCycle(); refresh(); });
    menu.appendChild(el('div', { class: 'dd-sep' }));
    add('logout', 'Cerrar sesión', null, async () => {
      await logout();
      window.location.reload();
    }, true);

    popover(anchor, menu, { width: 320 });
  }

  function openNotifications(anchor) {
    if (state.ui.unreadNotifs) {
      import('../core/actions.js').then(({ markAllNotificationsRead }) => {
        markAllNotificationsRead().catch(() => {});
      });
    }
    const list = el('div');
    const header = el('div', {
      class: 'row between', style: { padding: '6px 8px 8px' },
    },
    el('strong', { style: { fontSize: '17px' }, text: 'Notificaciones' }),
    el('button', {
      class: 'link small', type: 'button', style: { fontWeight: '600' },
      onclick: () => {
        closeDropdown();
        import('../core/actions.js').then(({ markAllNotificationsRead }) => {
          markAllNotificationsRead().then(() => toast('Notificaciones marcadas como leídas', { type: 'success' })).catch(() => {});
        });
      },
    }, 'Marcar como leídas'));
    list.appendChild(header);

    const items = state.notifications.slice(0, 8);
    if (!items.length) {
      list.appendChild(el('div', {
        class: 'dd-item', style: { color: 'var(--text-2)', fontWeight: '400' },
      }, icon('bell', 18), el('span', { text: 'Todavía no tienes notificaciones.' })));
    } else {
      for (const notification of items) {
        const node = notificationItem(notification, { compact: true });
        node.addEventListener('click', () => closeDropdown());
        list.appendChild(node);
      }
    }
    list.appendChild(el('div', { class: 'dd-sep' }));
    list.appendChild(el('a', {
      class: 'dd-item', href: '#/notificaciones', onclick: () => closeDropdown(),
    }, el('span', { class: 'dd-ic' }, icon('list', 18)),
    el('span', { class: 'dd-label', text: 'Ver todas las notificaciones' })));

    popover(anchor, list, { width: 380 });
  }

  function refresh() {
    const route = parseRoute();
    installBtn.classList.toggle('hide', !canInstall());
    const active = route.name === 'profile' ? 'feed' : route.name;
    for (const [id, button] of tabButtons) {
      button.classList.toggle('active', id === active);
      button.setAttribute('aria-current', id === active ? 'page' : 'false');
    }
    const n = state.ui.unreadNotifs;
    notifBadge.textContent = n > 9 ? '9+' : String(n);
    notifBadge.classList.toggle('hide', n === 0);
    const c = state.ui.unreadChats;
    messagesBadge.textContent = c > 9 ? '9+' : String(c);
    messagesBadge.classList.toggle('hide', c === 0);

    clear(avatarBtn);
    avatarBtn.appendChild(avatarEl(state.me, 'sm'));
  }

  refresh();
  onPwaChange(refresh);
  return { el: root, refresh };
}
