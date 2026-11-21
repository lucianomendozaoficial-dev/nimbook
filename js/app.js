/* ==========================================================================
   app.js — arranque, shell y navegación
   ========================================================================== */
import { el, clear } from './core/util.js';
import { icon } from './core/icons.js';
import { state, attach, subscribe, bootData, refreshAll } from './core/store.js';
import { restoreSession, readSession } from './core/auth.js';
import { initTheme } from './core/theme.js';
import { applyReduced } from './core/motion.js';
import { initPwa } from './core/pwa.js';
import { unlockSounds, playSound } from './core/sounds.js';
import { startRouter, parseRoute, goBack } from './core/router.js';
import { toast, emptyState } from './core/ui.js';
import { offlineIllustration } from './core/illustrations.js';
import { authScreen } from './pages/auth.js';
import { feedPage } from './pages/feed.js';
import { postPage } from './pages/post.js';
import { profilePage } from './pages/profile.js';
import { friendsPage } from './pages/friends.js';
import { notificationsPage } from './pages/notifications.js';
import { groupsPage, groupPage } from './pages/groups.js';
import { savedPage } from './pages/saved.js';
import { searchPage } from './pages/search.js';
import { menuPage } from './pages/menu.js';
import { settingsPage } from './pages/settings.js';
import { composePage } from './pages/publicar.js';
import { mountTopbar } from './components/topbar.js';
import { mountSidebar } from './components/sidebar.js';
import { mountRightRail } from './components/rightrail.js';
import { mountInstallBanner } from './components/install-banner.js';

const root = document.getElementById('root');
let shell = null;
let currentPage = null;
let lastRouteName = '';
let unsub = null;

/* ------------------------------- splash ---------------------------------- */

function setSplashMessage(text) {
  const node = document.getElementById('splash-msg');
  if (node) node.textContent = text;
}

function hideSplash() {
  window.__NB_READY__ = true;
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 450);
}

function showBootError(message) {
  window.__NB_READY__ = true;
  const splash = document.getElementById('splash');
  const box = document.getElementById('splash-error');
  const msg = document.getElementById('splash-error-msg');
  if (msg) msg.textContent = message;
  if (box) box.hidden = false;
  const bar = splash?.querySelector('.splash-bar');
  if (bar) bar.classList.add('hide');
  const retry = document.getElementById('splash-retry');
  if (retry) retry.onclick = () => window.location.reload();
  const offline = document.getElementById('splash-offline');
  if (offline) offline.innerHTML = offlineIllustration();
  setSplashMessage('');
}

/* -------------------------------- acceso --------------------------------- */

function renderAuth() {
  clear(root);
  root.appendChild(authScreen({
    onAuthenticated: async () => {
      clear(root);
      root.appendChild(el('div', { class: 'auth' }, el('span', { class: 'spinner big' })));
      try {
        await bootData();
        startApp();
        toast(`Hola, ${state.me?.firstName || 'de nuevo'}`, { type: 'success' });
      } catch (err) {
        console.error(err);
        showBootError('No pudimos cargar tu cuenta. Revisá tu conexión e intentá otra vez.');
      }
    },
  }));
  hideSplash();
}

/* --------------------------------- shell -------------------------------- */

function buildShell() {
  clear(root);
  const topbar = mountTopbar();
  const leftRail = mountSidebar();
  const rightRail = mountRightRail();
  const banner = mountInstallBanner();
  const center = el('div', { class: 'col-center' });
  const main = el('main', { class: 'main' }, leftRail.el, center, rightRail.el);

  const mobileNav = el('nav', { class: 'mobile-nav', 'aria-label': 'Navegación' });
  const items = [
    { id: 'feed', icon: 'home', label: 'Inicio', href: '#/inicio' },
    { id: 'friends', icon: 'users', label: 'Seguidores', href: '#/seguidores' },
    { id: 'compose', icon: 'plus', label: 'Publicar', href: '#/publicar' },
    { id: 'notifications', icon: 'bell', label: 'Avisos', href: '#/notificaciones', badge: true },
    { id: 'menu', icon: 'menu', label: 'Menú', href: '#/menu' },
  ];
  const navButtons = new Map();
  for (const item of items) {
    const link = el('a', { href: item.href, 'aria-label': item.label },
      el('span', { class: 'mn-ic' }, iconFor(item.icon)),
      el('span', { text: item.label }));
    if (item.badge) {
      const badge = el('span', { class: 'badge-dot hide' });
      link.querySelector('.mn-ic').appendChild(badge);
    }
    navButtons.set(item.id, link);
    mobileNav.appendChild(link);
  }

  root.append(el('div', { class: 'app' }, topbar.el, main, mobileNav, banner.el));
  document.body.classList.add('has-shell');

  return {
    topbar, left: leftRail, right: rightRail, center, main, navButtons,
    refreshChrome() {
      topbar.refresh();
      leftRail.render();
      rightRail.render();
      const route = parseRoute();
      const active = route.name === 'group' ? 'groups'
        : route.name === 'post' ? 'feed' : route.name;
      for (const [id, link] of navButtons) link.classList.toggle('active', id === active);
      const badge = navButtons.get('notifications')?.querySelector('.badge-dot');
      if (badge) {
        const count = state.ui.unreadNotifs;
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.classList.toggle('hide', count === 0);
      }
    },
    setLayout({ right = true, left = true, wide = false } = {}) {
      main.classList.toggle('no-right', !right);
      main.classList.toggle('only-feed', !left);
      leftRail.el.classList.toggle('hide', !left);
      rightRail.el.classList.toggle('hide', !right);
      center.classList.toggle('wide', wide);
    },
  };
}

function iconFor(name) {
  const map = {
    home: 'home', users: 'users', plus: 'plus', bell: 'bell', menu: 'menu',
  };
  return icon(map[name] || name, 24, { filled: true });
}

/* -------------------------------- rutas ---------------------------------- */

function layoutFor(route) {
  switch (route.name) {
    case 'feed': return { right: true, left: true, wide: false };
    case 'post': return { right: false, left: true, wide: true };
    case 'profile':
    case 'myprofile':
    case 'friends':
    case 'groups':
    case 'group':
    case 'saved':
    case 'search':
    case 'settings':
    case 'menu':
    case 'notifications':
    case 'compose':
      return { right: false, left: true, wide: true };
    default: return { right: true, left: true, wide: false };
  }
}

function pageFor(route) {
  switch (route.name) {
    case 'feed': return feedPage();
    case 'post': return postPage(route.params.id);
    case 'profile': return profilePage(route.params.username, { tab: route.params.tab });
    case 'myprofile': return profilePage(null, { preview: true });
    case 'friends': return friendsPage(route.params.tab);
    case 'notifications': return notificationsPage();
    case 'groups': return groupsPage();
    case 'group': return groupPage(route.params.id);
    case 'saved': return savedPage();
    case 'search': return searchPage(route.query.q || '');
    case 'menu': return menuPage();
    case 'settings': return settingsPage();
    case 'compose': return composePage();
    default:
      return {
        el: el('div', { class: 'card' },
          emptyState({
            iconName: 'alert',
            title: 'Página no encontrada',
            description: 'La dirección que abriste no existe.',
            action: el('button', {
              class: 'btn primary', type: 'button', text: 'Ir al inicio',
              onclick: () => goBack('/inicio'),
            }),
          })),
        onData() {},
        destroy() {},
      };
  }
}

let lastKey = '';

function routeKey(route) {
  return [route.name, JSON.stringify(route.params), JSON.stringify(route.query)].join('|');
}

function renderRoute(route) {
  if (!shell) return;
  const key = routeKey(route);
  if (key === lastKey && currentPage?.el?.isConnected) {
    shell.refreshChrome();
    return;
  }
  lastKey = key;
  currentPage?.destroy?.();
  shell.setLayout(layoutFor(route));
  shell.center.replaceChildren();
  const page = pageFor(route);
  currentPage = page;
  shell.center.appendChild(page.el);
  shell.refreshChrome();
  if (route.name !== lastRouteName) {
    window.scrollTo({ top: 0 });
    lastRouteName = route.name;
  }
}

/* ------------------------------ arranque -------------------------------- */

async function startApp() {
  if (!shell) shell = buildShell();
  unsub?.();
  unsub = subscribe((topic) => {
    if (topic === 'ready') return;
    shell?.refreshChrome();
    currentPage?.onData?.(topic);
  });
  startRouter((route) => renderRoute(route));
  renderRoute(parseRoute());
  hideSplash();
  setupPullToRefresh();
}

/* --------------------------- tirar para actualizar ----------------------- */

function setupPullToRefresh() {
  let startY = 0;
  let pulling = false;
  let distance = 0;
  const indicator = el('div', { class: 'ptr' }, el('span', { class: 'spinner' }));
  document.body.appendChild(indicator);

  window.addEventListener('touchstart', (event) => {
    if (window.scrollY > 0 || event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    pulling = true;
    distance = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    if (!pulling) return;
    distance = event.touches[0].clientY - startY;
    if (distance > 10) indicator.classList.add('visible');
    indicator.style.transform = `translate(-50%, ${Math.min(70, distance * 0.5)}px)`;
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    indicator.classList.remove('visible');
    indicator.style.transform = '';
    if (distance < 80) return;
    playSound('open');
    try {
      await refreshAll();
      toast('Todo actualizado', { type: 'success' });
    } catch {
      toast('No pudimos actualizar. Revisá tu conexión.', { type: 'error' });
    }
  });
}

/* --------------------------------- boot --------------------------------- */

async function boot() {
  initTheme();
  applyReduced();
  initPwa();
  setSplashMessage('Iniciando Zuma…');

  const unlock = () => { unlockSounds(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock, { once: true });

  if (window.location.protocol === 'file:') {
    showBootError('Para usar Zuma ábrelo desde su dirección web (o desde el acceso directo incluido).');
    return;
  }

  const cfg = window.NIMBOOK_DEV_CONFIG || window.NIMBOOK_CONFIG || null;
  if (!cfg?.owner || !cfg?.repo) {
    showBootError('Zuma no está disponible en este momento. Volvé a intentarlo en unos minutos.');
    return;
  }

  attach({
    ...cfg,
    readBase: cfg.readBase || (cfg.local ? cfg.mediaBase || '.' : ''),
    apiBase: cfg.apiBase || '',
  });

  if (!readSession()) {
    renderAuth();
    return;
  }

  try {
    setSplashMessage('Verificando tu sesión…');
    const user = await restoreSession();
    if (!user) {
      renderAuth();
      return;
    }
    setSplashMessage(`Hola de nuevo, ${user.firstName || user.name || ''}…`);
    await bootData();
    await startApp();
  } catch (err) {
    console.error('[boot]', err);
    renderAuth();
  }
}

window.addEventListener('error', (event) => {
  console.error('[global]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[promise]', event.reason);
});

boot();
