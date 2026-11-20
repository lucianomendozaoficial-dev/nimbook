/* ==========================================================================
   router.js — rutas por hash (funciona en GitHub Pages sin configuración)
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
    case 'feed': return { name: 'feed', params: {}, query };
    case 'friends': return { name: 'friends', params: { tab: second || 'friends' }, query };
    case 'messages': return { name: 'messages', params: { id: second || null }, query };
    case 'notifications': return { name: 'notifications', params: {}, query };
    case 'groups':
      return second
        ? { name: 'group', params: { id: second }, query }
        : { name: 'groups', params: {}, query };
    case 'saved': return { name: 'saved', params: {}, query };
    case 'search': return { name: 'search', params: {}, query };
    case 'settings': return { name: 'settings', params: { tab: second || 'cuenta' }, query };
    case 'u':
      return {
        name: 'profile',
        params: { username: second || '', tab: third || 'posts' },
        query,
      };
    case 'p': return { name: 'post', params: { id: second || '' }, query };
    case 'photo': return { name: 'photo', params: { username: second || '', id: third || '' }, query };
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
  else navigate('/feed');
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

export function hrefFor(route) {
  return `#${route}`;
}
