/* ==========================================================================
   topbar.js — cabecera: marca, búsqueda, secciones y accesos
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { navigate, parseRoute } from '../core/router.js';
import { state, displayName } from '../core/store.js';
import { avatarEl, popover, closeDropdown, toast } from '../core/ui.js';
import { logout } from '../core/auth.js';
import { themeCycle, themeLabel } from '../core/theme.js';
import { canInstall, promptInstall, onPwaChange } from '../core/pwa.js';

const TABS = [
  { id: 'feed', icon: 'home', href: '#/inicio', label: 'Inicio' },
  { id: 'friends', icon: 'users', href: '#/seguidores', label: 'Seguidores' },
  { id: 'groups', icon: 'groups', href: '#/grupos', label: 'Grupos' },
  { id: 'saved', icon: 'bookmark', href: '#/guardados', label: 'Guardado' },
];

export function mountTopbar() {
  const root = el('header', { class: 'topbar' });

  const brand = el('a', { class: 'brand', href: '#/inicio', 'aria-label': 'NimbookGR' },
    el('img', { src: 'assets/logo/nimbook-logo-128.png', alt: 'NimbookGR', width: '40', height: '40' }),
    el('span', { class: 'brand-word', text: 'NimbookGR' }));

  const searchInput = el('input', {
    type: 'search', placeholder: 'Buscar en NimbookGR', 'aria-label': 'Buscar',
  });
  const goSearch = () => {
    const q = searchInput.value.trim();
    searchInput.value = '';
    searchInput.blur();
    navigate(q ? `/buscar?q=${encodeURIComponent(q)}` : '/buscar');
  };
  const searchBox = el('form', {
    class: 'tb-search', role: 'search',
    onsubmit: (event) => { event.preventDefault(); goSearch(); },
  }, icon('search', 18), searchInput);

  const searchMobile = el('button', {
    class: 'tb-btn tb-search-mobile', type: 'button', 'aria-label': 'Buscar',
    onclick: () => navigate('/buscar'),
  }, icon('search', 22));

  const nav = el('nav', { class: 'tb-nav', 'aria-label': 'Secciones' });
  const tabButtons = new Map();
  for (const tab of TABS) {
    const link = el('a', {
      class: 'tb-tab', href: tab.href, 'aria-label': tab.label, title: tab.label,
    }, icon(tab.icon, 28, { filled: true }));
    tabButtons.set(tab.id, link);
    nav.appendChild(link);
  }

  const installBtn = el('button', {
    class: 'tb-btn install-btn hide', type: 'button',
    'aria-label': 'Instalar NimbookGR', title: 'Instalar NimbookGR',
    onclick: async () => {
      const accepted = await promptInstall();
      if (accepted) toast('¡Instalada! Ya podés abrirla desde tu inicio.', { type: 'success' });
      installBtn.classList.add('hide');
    },
  }, icon('download', 20));

  const notifBtn = el('a', {
    class: 'tb-btn', href: '#/notificaciones', 'aria-label': 'Notificaciones', title: 'Notificaciones',
  }, icon('bell', 22));
  const notifBadge = el('span', { class: 'badge-dot hide' });
  notifBtn.appendChild(notifBadge);

  const avatarBtn = el('button', {
    class: 'tb-btn avatar-btn', type: 'button', 'aria-label': 'Tu cuenta',
    onclick: () => openAccountMenu(avatarBtn),
  });

  root.append(
    el('div', { class: 'topbar-left' }, brand, searchBox),
    searchMobile,
    nav,
    el('div', { class: 'topbar-right' }, installBtn, notifBtn, avatarBtn),
  );

  function openAccountMenu(anchor) {
    const me = state.me;
    const dark = document.documentElement.dataset.theme === 'dark';
    const menu = el('div');

    menu.appendChild(el('a', {
      class: 'dd-item', href: '#/mi-perfil', onclick: () => closeDropdown(),
    }, avatarEl(me, 'sm'),
    el('span', { class: 'dd-label' }, displayName(me),
      el('span', { class: 'dd-sub', text: 'Mi perfil' }))));
    menu.appendChild(el('div', { class: 'dd-sep' }));

    const add = (iconName, label, sub, onClick) => {
      menu.appendChild(el('button', {
        class: 'dd-item', type: 'button',
        onclick: () => { closeDropdown(); onClick?.(); },
      }, el('span', { class: 'dd-ic' }, icon(iconName, 19)),
      el('span', { class: 'dd-label' }, label, sub ? el('span', { class: 'dd-sub', text: sub }) : null)));
    };

    add('grid', 'Menú', 'Todas las secciones', () => navigate('/menu'));
    add('settings', 'Configuración', 'Tema, sonidos y animaciones', () => navigate('/configuracion'));
    add(dark ? 'sun' : 'moon', dark ? 'Modo claro' : 'Modo oscuro', `Ahora: ${themeLabel()}`,
      () => { themeCycle(); refresh(); });
    menu.appendChild(el('div', { class: 'dd-sep' }));
    menu.appendChild(el('button', {
      class: 'dd-item', type: 'button',
      style: { color: 'var(--danger)' },
      onclick: async () => { closeDropdown(); await logout(); window.location.reload(); },
    }, el('span', { class: 'dd-ic', style: { background: 'var(--danger-soft)', color: 'var(--danger)' } },
      icon('logout', 19)),
    el('span', { class: 'dd-label', text: 'Cerrar sesión' })));

    popover(anchor, menu, { width: 300 });
  }

  function refresh() {
    const route = parseRoute();
    installBtn.classList.toggle('hide', !canInstall());
    const active = route.name === 'group' ? 'groups'
      : route.name === 'post' ? 'feed' : route.name;
    for (const [id, button] of tabButtons) {
      button.classList.toggle('active', id === active);
      button.setAttribute('aria-current', id === active ? 'page' : 'false');
    }
    const count = state.ui.unreadNotifs;
    notifBadge.textContent = count > 9 ? '9+' : String(count);
    notifBadge.classList.toggle('hide', count === 0);
    avatarBtn.replaceChildren(avatarEl(state.me, 'sm'));
  }

  refresh();
  onPwaChange(refresh);
  return { el: root, refresh };
}
