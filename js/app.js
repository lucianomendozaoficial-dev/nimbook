/* ==========================================================================
   app.js — arranque de NimbookGR: conexión, sesión, shell y rutas
   ========================================================================== */
import { el, clear } from './core/util.js';
import { icon } from './core/icons.js';
import { initTheme } from './core/theme.js';
import { loadConnection } from './core/gh.js';
import {
  attach, state, hydrateCache, loadCore, subscribe,
  refreshUserData, refreshFeed, displayName,
} from './core/store.js';
import { restoreSession, readSession } from './core/auth.js';
import { startRouter, parseRoute } from './core/router.js';
import { mountTopbar } from './components/topbar.js';
import { mountSidebar } from './components/sidebar.js';
import { mountRightRail } from './components/rightrail.js';
import { toast, emptyState } from './core/ui.js';
import { authScreen } from './pages/auth.js';
import { offlineIllustration } from './core/illustrations.js';
import { feedPage, postPage } from './pages/feed.js';
import { profilePage } from './pages/profile.js';
import { friendsPage } from './pages/friends.js';
import { messagesPage } from './pages/messages.js';
import { notificationsPage } from './pages/notifications.js';
import { groupsPage, groupPage } from './pages/groups.js';
import { savedPage } from './pages/saved.js';
import { searchPage } from './pages/search.js';
import { settingsPage } from './pages/settings.js';
import { menuPage } from './pages/menu.js';
import { mountInstallBanner } from './components/install-banner.js';
import { initPwa } from './core/pwa.js';
import { unlockSounds, playSound } from './core/sounds.js';

const root = document.getElementById('root');
const splash = document.getElementById('splash');

let shell = null;
let currentPage = null;
let currentRoute = null;
let pollTimer = null;
let lastFastPoll = 0;
let lastSlowPoll = 0;

/* ------------------------------- utilidades ------------------------------ */

function hideSplash() {
  window.__NB_READY__ = true;
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 500);
}

function setSplashMessage(text) {
  const node = document.getElementById('splash-msg');
  if (node) node.textContent = text;
}

function showBootError(message) {
  clear(root);
  root.appendChild(el('div', { class: 'auth' },
    el('div', { class: 'auth-card error-card' },
      el('div', { class: 'error-illustration', html: offlineIllustration() }),
      el('h2', { text: 'Algo salió mal' }),
      el('p', { class: 'muted', text: message }),
      el('button', {
        class: 'btn primary block lg', type: 'button', text: 'Reintentar',
        onclick: () => window.location.reload(),
      }))));
  hideSplash();
}

/* -------------------------- pantallas previas --------------------------- */

function renderAuth() {
  clear(root);
  root.appendChild(authScreen({
    onAuthenticated: async () => {
      clear(root);
      root.appendChild(el('div', { class: 'auth' }, el('span', { class: 'spinner big' })));
      await loadCore();
      await startApp();
    },
  }));
  hideSplash();
}

/* --------------------------------- shell -------------------------------- */

function buildShell() {
  clear(root);
  const topbar = mountTopbar();
  const left = mountSidebar();
  const right = mountRightRail();
  const installBanner = mountInstallBanner();
  const center = el('div', { class: 'col-center' });
  const main = el('main', { class: 'main' }, left.el, center, right.el);

  const mobileNav = el('nav', { class: 'mobile-nav', 'aria-label': 'Navegación móvil' });
  const items = [
    { id: 'feed', icon: 'home', label: 'Inicio', href: '#/inicio' },
    { id: 'friends', icon: 'users', label: 'Seguidores', href: '#/seguidores' },
    { id: 'messages', icon: 'message', label: 'Mensajes', href: '#/mensajes', badge: 'chats' },
    { id: 'notifications', icon: 'bell', label: 'Avisos', href: '#/notificaciones', badge: 'notifs' },
    { id: 'menu', icon: 'menu', label: 'Menú', href: '#/menu' },
  ];
  const navButtons = new Map();
  for (const item of items) {
    const link = el('a', { href: item.href, 'aria-label': item.label },
      el('span', { class: 'mn-ic' }, icon(item.icon, 24, { filled: true })),
      el('span', { text: item.label }));
    if (item.badge) {
      const badge = el('span', { class: 'badge-dot hide' });
      link.querySelector('.mn-ic').appendChild(badge);
      link.dataset.badge = item.badge;
    }
    navButtons.set(item.id, link);
    mobileNav.appendChild(link);
  }

  root.append(el('div', { class: 'app' }, topbar.el, main, mobileNav, installBanner.el));
  document.body.classList.add('has-shell');

  const api = {
    topbar, left, right, center, main, navButtons, mobileNav,
    refreshChrome() {
      topbar.refresh();
      left.render();
      right.render();
      const route = parseRoute();
      const active = route.name === 'group' ? 'groups'
        : route.name === 'post' ? 'feed'
          : route.name;
      for (const [id, link] of navButtons) {
        link.classList.toggle('active', id === active);
      }
      const notifBadge = navButtons.get('notifications')?.querySelector('.badge-dot');
      if (notifBadge) {
        notifBadge.textContent = state.ui.unreadNotifs > 9 ? '9+' : String(state.ui.unreadNotifs);
        notifBadge.classList.toggle('hide', state.ui.unreadNotifs === 0);
      }
      const chatBadge = navButtons.get('messages')?.querySelector('.badge-dot');
      if (chatBadge) {
        chatBadge.textContent = state.ui.unreadChats > 9 ? '9+' : String(state.ui.unreadChats);
        chatBadge.classList.toggle('hide', state.ui.unreadChats === 0);
      }
    },
    setLayout({ right = true, left = true, wide = false } = {}) {
      main.classList.toggle('no-right', !right);
      main.classList.toggle('only-feed', !left);
      api.left.el.classList.toggle('hide', !left);
      api.right.el.classList.toggle('hide', !right);
      center.classList.toggle('wide', wide);
    },
  };
  return api;
}

/* --------------------------------- rutas -------------------------------- */

function layoutFor(route) {
  switch (route.name) {
    case 'profile': return { right: false, left: true, wide: true };
    case 'friends': return { right: false, left: true, wide: true };
    case 'messages': return { right: false, left: true, wide: true };
    case 'group': return { right: false, left: true, wide: true };
    case 'groups': return { right: false, left: true, wide: true };
    case 'saved': return { right: false, left: true, wide: true };
    case 'search': return { right: false, left: true, wide: true };
    case 'settings': return { right: false, left: true, wide: true };
    case 'menu': return { right: false, left: true, wide: true };
    case 'post': return { right: false, left: true, wide: false };
    default: return { right: true, left: true, wide: false };
  }
}

function pageFor(route) {
  switch (route.name) {
    case 'feed': return feedPage();
    case 'profile': return profilePage(route.params.username);
    case 'post': return postPage(route.params.id);
    case 'friends': return friendsPage(route.params.tab);
    case 'messages': return messagesPage({ u: route.query.u, id: route.params.id });
    case 'notifications': return notificationsPage();
    case 'groups': return groupsPage();
    case 'group': return groupPage(route.params.id);
    case 'saved': return savedPage();
    case 'search': return searchPage(route.query.q || '');
    case 'settings': return settingsPage(route.params.tab);
    case 'menu': return menuPage();
    default:
      return {
        el: el('div', { class: 'card' },
          emptyState({
            iconName: 'alert',
            title: 'Página no encontrada',
            description: 'La dirección que abriste no existe en NimbookGR.',
            action: el('a', { class: 'btn primary', href: '#/inicio', text: 'Ir al inicio' }),
          })),
        onData() {},
        destroy() {},
      };
  }
}

function renderRoute(route) {
  if (!shell) return;
  const sameRoute = currentRoute
    && currentRoute.name === route.name
    && JSON.stringify(currentRoute.params) === JSON.stringify(route.params)
    && JSON.stringify(currentRoute.query) === JSON.stringify(route.query);

  if (sameRoute && currentPage) {
    shell.refreshChrome();
    return;
  }

  currentPage?.destroy?.();
  currentPage = null;
  currentRoute = route;
  clear(shell.center);
  const layout = layoutFor(route);
  shell.setLayout(layout);

  const page = pageFor(route);
  currentPage = page;
  shell.center.appendChild(page.el);
  shell.refreshChrome();

  window.scrollTo(0, 0);
}

/* -------------------------------- arranque ------------------------------ */

async function startApp() {
  if (!shell) shell = buildShell();
  shell.setLayout(layoutFor(parseRoute()));
  shell.refreshChrome();

  let lastUnread = state.ui.unreadNotifs;
  let lastChats = state.ui.unreadChats;
  subscribe((topic) => {
    if (topic === 'offline') {
      toast('Se perdió la conexión. Estás viendo lo último que cargaste.', { type: 'error' });
    }
    if (state.ui.unreadNotifs > lastUnread) playSound('notification');
    if (state.ui.unreadChats > lastChats) playSound('notification');
    lastUnread = state.ui.unreadNotifs;
    lastChats = state.ui.unreadChats;
    shell?.refreshChrome();
    currentPage?.onData?.(topic);
  });

  const initial = startRouter((route) => renderRoute(route));
  renderRoute(initial);
  hideSplash();
  startPolling();
}

/* -------------------------------- polling ------------------------------- */

async function pollOnce() {
  if (document.hidden) return;
  const now = Date.now();
  if (now - lastFastPoll > 20_000) {
    lastFastPoll = now;
    try { await refreshUserData(); } catch { /* silencioso */ }
  }
  if (now - lastSlowPoll > 60_000) {
    lastSlowPoll = now;
    try { await refreshFeed(); } catch { /* silencioso */ }
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(pollOnce, 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollOnce();
  });
  window.addEventListener('online', () => {
    toast('Conexión restaurada', { type: 'success' });
    pollOnce();
  });
  window.addEventListener('offline', () => {
    toast('Te quedaste sin conexión', { type: 'error' });
  });
}

/* --------------------------------- boot --------------------------------- */

async function boot() {
  initTheme();
  initPwa();
  setSplashMessage('Iniciando NimbookGR…');

  // desbloquea el audio con el primer toque (política de los navegadores)
  const unlock = () => { unlockSounds(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock, { once: true });

  if (window.location.protocol === 'file:') {
    showBootError(
      'Para usar NimbookGR ábrelo desde su dirección web (o desde el acceso directo incluido), '
      + 'no con doble clic en el archivo.',
    );
    return;
  }

  const cfg = window.NIMBOOK_DEV_CONFIG || window.NIMBOOK_CONFIG || loadConnection() || null;
  if (!cfg?.owner || !cfg?.repo || !cfg?.token) {
    console.error('[boot] falta config.js con la conexión de NimbookGR');
    showBootError('NimbookGR no está disponible en este momento. Vuelve a intentarlo en unos minutos.');
    return;
  }

  attach(cfg);
  hydrateCache();

  // Sin sesión guardada no hace falta esperar a la red: mostramos el acceso
  // al instante y traemos los datos en segundo plano.
  if (!readSession()) {
    renderAuth();
    loadCore().catch((err) => console.warn('[boot] datos en segundo plano', err?.message));
    return;
  }

  try {
    setSplashMessage('Preparando tu cuenta…');
    await state.gh.getRepo();
    setSplashMessage('Verificando tu sesión…');
    const user = await restoreSession();
    if (!user) {
      renderAuth();
      return;
    }
    setSplashMessage(`Cargando el muro de ${displayName(user)}…`);
    await loadCore();
    await startApp();
  } catch (err) {
    console.error('[boot]', err);
    if (err?.code === 'auth' || err?.status === 401) {
      showBootError('No pudimos conectar con tu cuenta. Inténtalo de nuevo en unos minutos.');
      return;
    }
    if (err?.name === 'GitHubError' || err?.message?.includes('GitHub')) {
      showBootError(err.message);
      return;
    }
    renderAuth();
  }
}

window.addEventListener('error', (event) => {
  console.error('[global]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason?.message) console.warn('[unhandled]', reason.message);
});

boot().catch((err) => {
  console.error('[boot fatal]', err);
  showBootError(err?.message || 'Error inesperado al iniciar NimbookGR.');
});
