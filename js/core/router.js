/* ==========================================================================
   router.js — rutas por hash (funciona en GitHub Pages sin configuración)
   Acepta nombres en español y también los antiguos en inglés.
   ========================================================================== */

const listeners = new Set();

export function parseRoute(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart));

  if (!segments.length) return { name: 'feed', params: {}, query };
  const [first, second, third] = segments;

  switch (first) {
    case 'feed':
    case 'inicio':
      return { name: 'feed', params: {}, query };
    case 'friends':
    case 'seguidores':
    case 'people':
      return { name: 'friends', params: { tab: second || 'seguidores' }, query };
    case 'messages':
    case 'mensajes':
      return { name: 'messages', params: { id: second || null }, query };
    case 'notifications':
    case 'notificaciones':
      return { name: 'notifications', params: {}, query };
    case 'groups':
    case 'grupos':
      return second
        ? { name: 'group', params: { id: second }, query }
        : { name: 'groups', params: {}, query };
    case 'saved':
    case 'guardados':
      return { name: 'saved', params: {}, query };
    case 'search':
    case 'buscar':
      return { name: 'search', params: {}, query };
    case 'settings':
    case 'ajustes':
      return { name: 'settings', params: { tab: second || 'cuenta' }, query };
    case 'menu':
      return { name: 'menu', params: {}, query };
    case 'u':
    case 'perfil':
      return {
        name: 'profile',
        params: { username: second || '', tab: third || 'posts' },
        query,
      };
    case 'p':
      return { name: 'post', params: { id: second || '' }, query };
    default:
      return { name: 'notfound', params: { path: pathPart }, query };
  }
}

export function navigate(to, { replace = false } = {}) {
  const hash = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
  if (window.location.hash === hash) {
    emit();
    return;
  }
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(null, '', url);
    emit();
  } else {
    window.location.hash = hash;
  }
}

export function back() {
  if (window.history.length > 1) window.history.back();
  else navigate('/inicio');
}

function emit() {
  const route = parseRoute();
  for (const fn of listeners) {
    try { fn(route); } catch (err) { console.error('[router]', err); }
  }
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startRouter(fn) {
  window.addEventListener('hashchange', emit);
  onRouteChange(fn);
  return parseRoute();
}

export const hrefFor = (route) => `#${route}`;
