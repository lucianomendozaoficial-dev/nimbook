/* ==========================================================================
   router.js — rutas por hash con historial "nativo"
   ========================================================================== */

const listeners = new Set();
let depth = 0;
let ignoreHash = false;

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
    case 'notifications':
    case 'notificaciones':
      return { name: 'notifications', params: {}, query };
    case 'groups':
    case 'grupos':
      if (second === 'canales' || second === 'channels') {
        return { name: 'groups', params: { tab: 'canales' }, query };
      }
      return second
        ? { name: 'group', params: { id: second }, query }
        : { name: 'groups', params: { tab: 'grupos' }, query };
    case 'tienda':
    case 'shop':
    case 'mercado':
      return second
        ? { name: 'shopitem', params: { id: second }, query }
        : { name: 'shop', params: {}, query };
    case 'mensajes':
    case 'messages':
    case 'chats':
      return { name: 'messages', params: { username: second || '' }, query };
    case 'historias':
    case 'stories':
      if (second === 'crear' || second === 'nueva') {
        return { name: 'storycompose', params: {}, query };
      }
      return { name: 'stories', params: {}, query };
    case 'verificacion':
    case 'verification':
    case 'insignias':
      return { name: 'verification', params: {}, query };
    case 'saved':
    case 'guardados':
      return { name: 'saved', params: {}, query };
    case 'search':
    case 'buscar':
      return { name: 'search', params: {}, query };
    case 'settings':
    case 'configuracion':
    case 'ajustes':
      return { name: 'settings', params: {}, query };
    case 'menu':
      return { name: 'menu', params: {}, query };
    case 'publicar':
    case 'compose':
      return { name: 'compose', params: {}, query };
    case 'gr':
      if (third === 'publicar') {
        return { name: 'grcompose', params: { section: second || 'trabajos' }, query };
      }
      return { name: 'gr', params: { section: second || '' }, query };
    case 'mi-perfil':
      return { name: 'myprofile', params: { tab: second || 'posts' }, query };
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

function toHash(to) {
  return to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
}

export function navigate(to, { replace = false } = {}) {
  const hash = toHash(to);
  if (window.location.hash === hash) {
    emit();
    return;
  }
  if (replace) {
    history.replaceState({ nb: true, depth }, '', hash);
    emit();
    return;
  }
  depth += 1;
  history.pushState({ nb: true, depth }, '', hash);
  emit();
}

/** Vuelve atrás de forma natural; si no hay historial propio, va al inicio. */
export function goBack(fallback = '/inicio') {
  if (depth > 0) {
    history.back();
    return;
  }
  navigate(fallback, { replace: true });
}

export function backDepth() {
  return depth;
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
  history.replaceState({ nb: true, depth: 0 }, '', window.location.hash || '#/inicio');

  window.addEventListener('popstate', (event) => {
    ignoreHash = true;
    setTimeout(() => { ignoreHash = false; }, 0);
    // Las secciones abiertas (antes modales) manejan su propio historial.
    // Si hay una página encima, no volvemos a pintar la ruta de abajo.
    if (window.__zumaModalActive || event.state?.zumaPage) return;
    depth = Number(event.state?.depth) || 0;
    emit();
  });

  // Enlaces <a href="#/..."> y ediciones manuales de la URL
  window.addEventListener('hashchange', () => {
    if (ignoreHash) return;
    depth += 1;
    history.replaceState({ nb: true, depth }, '', window.location.hash);
    emit();
  });

  onRouteChange(fn);
  return parseRoute();
}

export const hrefFor = (route) => `#${route}`;
