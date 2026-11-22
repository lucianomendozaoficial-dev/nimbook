/* ==========================================================================
   panel.js — panel de control de Zuma (usuarios, publicaciones e insignias)
   ========================================================================== */
import { el, clear, timeAgo, formatCount, nowISO } from './core/util.js';
import { icon } from './core/icons.js';
import { configure, fetchDoc, queueDoc, cdnUrl } from './core/net.js';
import { P } from './core/paths.js';
import { mediaImg } from './core/media.js';
import { verifyPassword } from './core/crypto.js';
import { initTheme } from './core/theme.js';
import {
  VERIFICATION_TYPES, verifiedBadge, verificationType,
} from './components/verified-badge.js';

/* Cuentas que pueden abrir el panel. Editá esta lista si cambia el equipo. */
const BASE_ADMINS = ['lucianomdz', 'lucianomdz.ok', 'eltuty'];
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const ADMIN_USERNAMES = IS_LOCAL ? [...BASE_ADMINS, 'nico.gimenez'] : BASE_ADMINS;
const SESSION_KEY = 'nb.session.v2';

const cfg = window.NIMBOOK_DEV_CONFIG || window.NIMBOOK_CONFIG || {};
configure({
  owner: cfg.owner,
  repo: cfg.repo,
  branch: cfg.branch || 'main',
  token: cfg.token,
  apiBase: cfg.apiBase || '',
  readBase: cfg.local ? (cfg.mediaBase || '.') : '',
});

const state = {
  me: null,
  users: [],
  postsIndex: [],
  stories: [],
  shop: [],
  postDocs: new Map(),
  tab: 'users',
  query: '',
  postQuery: '',
  note: '',
  noteType: 'info',
  busy: false,
  loadedAt: 0,
  postsLoading: false,
};

const root = document.getElementById('panel-root');
initTheme();

const nameOf = (user) => user?.name
  || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
  || user?.username
  || 'Usuario';

function initialsOf(user) {
  const name = nameOf(user).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  return (name.slice(0, 2) || 'ZU').toUpperCase();
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function avatarEl(user, size = 46) {
  const style = { width: `${size}px`, height: `${size}px` };
  if (user?.avatar) {
    return el('span', { class: 'pn-user-avatar', style },
      mediaImg(user.avatar, { alt: nameOf(user), eager: true }));
  }
  return el('span', { class: 'pn-user-avatar pn-avatar', style }, initialsOf(user));
}

function btn(label, onClick, { iconName = '', className = '', disabled = false } = {}) {
  return el('button', {
    class: `pn-btn ${className}`.trim(), type: 'button', disabled,
    onclick: onClick,
  }, iconName ? icon(iconName, 16) : null, el('span', { text: label }));
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isAdmin(user) {
  return Boolean(user && ADMIN_USERNAMES.includes(String(user.username || '').toLowerCase()));
}

async function readJson(path) {
  try {
    return await fetchDoc(path, { fresh: true });
  } catch (err) {
    console.warn('[panel] no se pudo leer', path, err?.message);
    return null;
  }
}

/* ------------------------------- carga de datos -------------------------- */

async function loadData() {
  const [usersDoc, feedDoc, storiesDoc, shopDoc] = await Promise.all([
    readJson(P.userIndex),
    readJson(P.feedIndex),
    readJson(P.stories),
    readJson(P.shopIndex),
  ]);
  if (!usersDoc) throw new Error('No se pudo leer la lista de usuarios. Revisá la conexión o config.js.');

  state.postsIndex = Array.isArray(feedDoc?.posts) ? feedDoc.posts : [];
  state.stories = Array.isArray(storiesDoc?.stories) ? storiesDoc.stories : [];
  state.shop = Array.isArray(shopDoc?.items) ? shopDoc.items : [];
  state.postDocs.clear();

  const index = Array.isArray(usersDoc.users) ? usersDoc.users : [];
  const users = [];
  for (let i = 0; i < index.length; i += 6) {
    const batch = await Promise.all(index.slice(i, i + 6).map(async (entry) => {
      const doc = await readJson(P.user(entry.id));
      if (!doc?.user) return { ...entry };
      return {
        ...entry,
        ...doc.user,
        verification: doc.user.verification ?? entry.verification ?? null,
      };
    }));
    users.push(...batch);
  }
  state.users = users;
  if (state.me) state.me = users.find((user) => user.id === state.me.id) || state.me;
  state.loadedAt = Date.now();
}

function countPosts(userId) {
  return state.postsIndex.filter((entry) => entry.authorId === userId).length;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function activeStories() {
  const now = Date.now();
  return state.stories.filter((story) => now - new Date(story.createdAt).getTime() < 86400000);
}

async function loadPostDocs(limit = 30) {
  const pending = state.postsIndex
    .slice(0, limit)
    .filter((entry) => !state.postDocs.has(entry.id));
  for (let i = 0; i < pending.length; i += 6) {
    const batch = await Promise.all(pending.slice(i, i + 6).map(async (entry) => {
      const doc = await readJson(P.post(entry.id));
      if (doc?.post) state.postDocs.set(entry.id, doc.post);
    }));
    await Promise.all(batch);
  }
}

/* ---------------------------------- insignias ---------------------------- */

function verificationButtons(user, { onDone = null } = {}) {
  const current = verificationType(user);
  const buttons = Object.values(VERIFICATION_TYPES).map((info) => el('button', {
    class: `pn-vbtn ${info.id}${current === info.id ? ' active' : ''}`.trim(),
    type: 'button',
    title: info.title,
    disabled: state.busy,
    onclick: () => setVerification(user.id, info.id, onDone),
  },
  verifiedBadge({ verification: info.id }, { size: 18, interactive: false }),
  el('span', { text: info.label })));

  if (current) {
    buttons.push(el('button', {
      class: 'pn-vbtn', type: 'button', title: 'Quitar insignia',
      disabled: state.busy,
      onclick: () => setVerification(user.id, null, onDone),
    }, icon('x', 14), el('span', { text: 'Quitar' })));
  }
  return buttons;
}

async function setVerification(userId, type, onDone = null) {
  if (state.busy) return;
  state.busy = true;
  state.note = type ? `Guardando insignia ${VERIFICATION_TYPES[type].label}…` : 'Quitando insignia…';
  state.noteType = 'info';
  render();
  try {
    await queueDoc(P.user(userId), (doc) => {
      if (!doc?.user) return undefined;
      return {
        ...doc,
        user: { ...doc.user, verification: type ? { type, at: nowISO() } : null },
      };
    }, { delay: 0, message: 'Zuma: insignia' });

    await queueDoc(P.userIndex, (doc) => {
      if (!doc?.users) return undefined;
      return {
        ...doc,
        users: doc.users.map((entry) => (
          entry.id === userId ? { ...entry, verification: type || null } : entry
        )),
      };
    }, { delay: 0, message: 'Zuma: insignia' });

    const user = state.users.find((entry) => entry.id === userId);
    if (user) user.verification = type ? { type, at: nowISO() } : null;
    if (state.me?.id === userId && user) state.me = user;
    state.note = type
      ? `Listo: insignia ${VERIFICATION_TYPES[type].label} asignada a ${nameOf(user)}.`
      : `Insignia quitada a ${nameOf(user)}.`;
    state.noteType = 'info';
    onDone?.();
  } catch (err) {
    state.note = `No se pudo guardar la insignia: ${err?.message || 'error de red'}`;
    state.noteType = 'error';
  } finally {
    state.busy = false;
    render();
  }
}

/* ---------------------------------- gate --------------------------------- */

async function loginAdmin(username, password) {
  const indexDoc = await readJson(P.userIndex);
  const entry = (indexDoc?.users || []).find(
    (user) => String(user.username || '').toLowerCase() === String(username || '').trim().toLowerCase(),
  );
  if (!entry) throw new Error('Ese usuario no existe.');
  const doc = await readJson(P.user(entry.id));
  if (!doc?.user) throw new Error('No se pudo leer la cuenta.');
  if (!isAdmin(doc.user)) throw new Error('Esta cuenta no tiene acceso al panel.');
  const ok = await verifyPassword(String(password || ''), doc.user.password);
  if (!ok) throw new Error('La contraseña no es correcta.');
  state.me = doc.user;
  await loadData();
}

function renderGate(message = '') {
  clear(root);
  const username = el('input', { class: 'input', autocapitalize: 'none', autocomplete: 'username', placeholder: 'Usuario' });
  const password = el('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
  const error = el('div', { class: 'pn-gate-error', text: message });
  const submit = el('button', { class: 'pn-btn primary', type: 'submit', text: 'Entrar al panel' });
  const form = el('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Verificando…';
      try {
        await loginAdmin(username.value, password.value);
        renderApp();
      } catch (err) {
        error.textContent = err.message || 'No se pudo entrar.';
        submit.disabled = false;
        submit.textContent = 'Entrar al panel';
      }
    },
  },
  el('div', { class: 'field' }, el('label', { text: 'Usuario de Zuma' }), username),
  el('div', { class: 'field' }, el('label', { text: 'Contraseña' }), password),
  error,
  submit);

  root.appendChild(el('div', { class: 'pn-gate' },
    el('img', { class: 'pn-gate-logo', src: 'assets/logo/zuma-logo-128.png', alt: 'Zuma' }),
    el('h1', { text: 'Panel de control' }),
    el('p', { class: 'pn-gate-sub', text: 'Acceso para el equipo de Zuma. Entrá con una cuenta administradora para ver usuarios, publicaciones e insignias.' }),
    form,
    el('p', { class: 'pn-gate-note' },
      'Este panel escribe en el repositorio con el token de config.js. Usalo solo desde un dispositivo de confianza.'),
    el('div', { class: 'pn-gate-links' },
      el('a', { class: 'pn-btn', href: 'index.html' }, icon('home', 16), 'Abrir Zuma'))));
  setTimeout(() => username.focus(), 80);
}

function renderConfigError() {
  clear(root);
  root.appendChild(el('div', { class: 'pn-gate' },
    el('img', { class: 'pn-gate-logo', src: 'assets/logo/zuma-logo-128.png', alt: 'Zuma' }),
    el('h1', { text: 'Falta configurar Zuma' }),
    el('p', { class: 'pn-gate-sub', text: 'No encontramos owner, repo o token en config.js. Revisá ese archivo y recargá.' }),
    el('div', { class: 'pn-gate-links' },
      el('a', { class: 'pn-btn', href: 'index.html' }, icon('home', 16), 'Abrir Zuma'))));
}

/* ---------------------------------- render -------------------------------- */

function renderStats() {
  const stat = (iconName, value, label) => el('div', { class: 'pn-stat' },
    el('div', { class: 'pn-stat-ic' }, icon(iconName, 19)),
    el('div', { class: 'pn-stat-value', text: formatCount(value) }),
    el('div', { class: 'pn-stat-label', text: label }));

  return el('div', { class: 'pn-stats' },
    stat('users', state.users.length, 'Usuarios'),
    stat('grid', state.postsIndex.length, 'Publicaciones'),
    stat('story', activeStories().length, 'Historias activas'),
    stat('shop', state.shop.length, 'Productos en Shop'));
}

function renderTabs() {
  const tabs = [
    { id: 'users', label: 'Usuarios', iconName: 'users' },
    { id: 'posts', label: 'Publicaciones', iconName: 'grid' },
    { id: 'badges', label: 'Insignias', iconName: 'shield' },
  ];
  return el('div', { class: 'pn-tabs' },
    ...tabs.map((tab) => el('button', {
      class: `pn-tab${state.tab === tab.id ? ' active' : ''}`.trim(),
      type: 'button',
      onclick: () => {
        state.tab = tab.id;
        render();
      },
    }, icon(tab.iconName, 16), el('span', { text: tab.label }))));
}

function userRow(user) {
  return el('div', { class: 'pn-user' },
    avatarEl(user, 46),
    el('div', { class: 'pn-user-main' },
      el('div', { class: 'pn-name-row' },
        el('span', { class: 'pn-user-name', text: nameOf(user) }),
        verifiedBadge(user, { size: 16, interactive: false })),
      el('div', { class: 'pn-user-sub', text: `@${user.username || '—'}` }),
      el('div', { class: 'pn-user-meta' },
        el('span', { text: plural(countPosts(user.id), 'publicación', 'publicaciones') }),
        user.location ? el('span', { text: user.location }) : null,
        user.createdAt ? el('span', { text: `Alta ${timeAgo(user.createdAt)}` }) : null)),
    el('div', { class: 'pn-user-actions' },
      ...verificationButtons(user),
      btn('Ver ficha', () => openUserModal(user), { className: 'sm', iconName: 'info' })));
}

function userMatches(user) {
  const q = normalize(state.query).trim();
  if (!q) return true;
  return normalize(nameOf(user)).includes(q)
    || normalize(user.username).includes(q)
    || normalize(user.location).includes(q);
}

function renderUsersView() {
  const card = el('div', { class: 'pn-card' });
  const list = el('div');
  const search = el('input', { type: 'search', placeholder: 'Buscar por nombre, usuario o ciudad' });
  search.value = state.query;
  search.addEventListener('input', () => {
    state.query = search.value;
    paintRows();
  });

  function paintRows() {
    clear(list);
    const users = state.users
      .filter(userMatches)
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es'));
    if (!users.length) {
      list.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: 'No hay usuarios con ese filtro.' })));
      return;
    }
    for (const user of users) list.appendChild(userRow(user));
  }

  card.append(
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Usuarios' }),
        el('div', { class: 'pn-card-sub', text: 'Datos de cada cuenta, sus publicaciones e insignias.' }))),
    el('div', { class: 'pn-search' }, icon('search', 17), search),
    list);
  paintRows();
  return card;
}

function postAuthor(post) {
  return state.users.find((user) => user.id === post.authorId) || null;
}

function postPreviewText(post) {
  if (post.text) return post.text;
  if (post.shareOf) return 'Compartió una publicación';
  if ((post.media || []).length) return '📷 Foto';
  return '(sin texto)';
}

function postRow(post) {
  const author = postAuthor(post);
  return el('div', { class: 'pn-post' },
    el('div', { class: 'pn-post-head' },
      el('span', { class: 'pn-post-author', text: nameOf(author) }),
      verifiedBadge(author, { size: 14, interactive: false }),
      el('span', { class: 'pn-post-date', text: `· ${timeAgo(post.createdAt)}` }),
      el('span', { class: 'pn-post-date', text: `· @${author?.username || '—'}` })),
    el('div', { class: 'pn-post-text', text: postPreviewText(post) }),
    el('div', { class: 'pn-post-meta' },
      el('span', { text: plural((post.media || []).length, 'foto', 'fotos') }),
      el('span', { text: plural(Object.values(post.reactions || {}).reduce((sum, value) => sum + (Number(value) || 0), 0), 'reacción', 'reacciones') }),
      el('span', { text: plural(post.commentsCount || 0, 'comentario', 'comentarios') }),
      el('a', { href: `index.html#/p/${post.id}`, target: '_blank', rel: 'noopener' }, 'Abrir en Zuma →')));
}

function renderPostsView() {
  const card = el('div', { class: 'pn-card' });
  const list = el('div');
  const search = el('input', { type: 'search', placeholder: 'Buscar por texto o autor' });
  search.value = state.postQuery;
  search.addEventListener('input', () => {
    state.postQuery = search.value;
    paintRows();
  });

  function paintRows() {
    clear(list);
    const q = normalize(state.postQuery).trim();
    const posts = state.postsIndex
      .map((entry) => state.postDocs.get(entry.id))
      .filter(Boolean)
      .filter((post) => {
        if (!q) return true;
        const author = postAuthor(post);
        return normalize(post.text).includes(q)
          || normalize(nameOf(author)).includes(q)
          || normalize(author?.username).includes(q);
      });
    if (!posts.length) {
      list.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: state.postsLoading ? 'Cargando publicaciones…' : 'No hay publicaciones para mostrar.' })));
      return;
    }
    for (const post of posts) list.appendChild(postRow(post));
  }

  card.append(
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Publicaciones' }),
        el('div', { class: 'pn-card-sub', text: `Últimas ${Math.min(30, state.postsIndex.length)} del muro.` }))),
    el('div', { class: 'pn-search' }, icon('search', 17), search),
    list);
  paintRows();

  if (!state.postDocs.size || state.postsIndex.slice(0, 30).some((entry) => !state.postDocs.has(entry.id))) {
    if (!state.postsLoading) {
      state.postsLoading = true;
      loadPostDocs(30)
        .then(() => { state.postsLoading = false; paintRows(); })
        .catch(() => { state.postsLoading = false; paintRows(); });
    }
  }
  return card;
}

function renderBadgesView() {
  const card = el('div', { class: 'pn-card' });
  const counts = {};
  for (const info of Object.values(VERIFICATION_TYPES)) counts[info.id] = 0;
  for (const user of state.users) {
    const type = verificationType(user);
    if (type) counts[type] += 1;
  }

  const grid = el('div', { class: 'pn-verif-grid' },
    ...Object.values(VERIFICATION_TYPES).map((info) => el('div', { class: 'pn-verif' },
      verifiedBadge({ verification: info.id }, { size: 42, interactive: false }),
      el('h3', { text: info.title }),
      el('p', { text: info.description }),
      el('span', { class: 'pn-verif-count', text: `${counts[info.id]} cuenta${counts[info.id] === 1 ? '' : 's'}` }))));

  card.append(
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Insignias de verificación' }),
        el('div', { class: 'pn-card-sub', text: 'Asigná una insignia desde Usuarios. Los tres niveles confirman identidad; el color indica el vínculo.' }))),
    grid);

  const verified = state.users
    .filter((user) => verificationType(user))
    .sort((a, b) => String(a.username).localeCompare(String(b.username), 'es'));
  if (verified.length) {
    card.appendChild(el('div', { class: 'pn-card-head' },
      el('div', { class: 'pn-card-title', style: { fontSize: '15px' }, text: 'Cuentas verificadas' })));
    for (const user of verified) {
      card.appendChild(el('div', { class: 'pn-user' },
        avatarEl(user, 38),
        el('div', { class: 'pn-user-main' },
          el('div', { class: 'pn-name-row' },
            el('span', { class: 'pn-user-name', text: nameOf(user) }),
            verifiedBadge(user, { size: 15, interactive: false })),
          el('div', { class: 'pn-user-sub', text: `@${user.username || '—'} · ${VERIFICATION_TYPES[verificationType(user)].label}` })),
        el('div', { class: 'pn-user-actions' },
          btn('Ver ficha', () => openUserModal(user), { className: 'sm' }))));
    }
  }
  return card;
}

function render() {
  if (!state.me) { renderGate(); return; }
  clear(root);
  const content = el('div');

  const paintContent = () => {
    clear(content);
    if (state.note) {
      content.appendChild(el('div', {
        class: `pn-note${state.noteType === 'error' ? ' error' : ''}`,
        text: state.note,
      }));
    }
    if (state.tab === 'posts') content.appendChild(renderPostsView());
    else if (state.tab === 'badges') content.appendChild(renderBadgesView());
    else content.appendChild(renderUsersView());
  };

  root.append(
    el('header', { class: 'pn-head' },
      el('div', { class: 'pn-brand' },
        el('img', { src: 'assets/logo/zuma-logo-128.png', alt: 'Zuma' }),
        el('div', null,
          el('div', { class: 'pn-title', text: 'Panel de control' }),
          el('div', { class: 'pn-sub', text: 'Usuarios, publicaciones e insignias de Zuma' }))),
      el('div', { class: 'pn-actions' },
        el('div', { class: 'pn-admin' },
          avatarEl(state.me, 28),
          el('span', { text: nameOf(state.me) }),
          verifiedBadge(state.me, { size: 15, interactive: false })),
        btn('Actualizar', async () => {
          state.note = 'Actualizando datos…';
          state.noteType = 'info';
          render();
          try { await loadData(); state.note = 'Datos actualizados.'; }
          catch (err) { state.note = err.message || 'No se pudo actualizar.'; state.noteType = 'error'; }
          render();
        }, { iconName: 'refresh' }),
        el('a', { class: 'pn-btn primary', href: 'index.html' }, icon('home', 16), 'Abrir Zuma'),
        btn('Salir', () => {
          try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
          state.me = null;
          renderGate();
        }, { className: 'danger', iconName: 'logout' }))),
    renderStats(),
    renderTabs(),
    content,
    el('div', { class: 'pn-footer' },
      el('div', { text: 'Zuma · panel de control del equipo' }),
      el('div', { text: `Última carga: ${new Date(state.loadedAt || Date.now()).toLocaleString('es-AR')} · lectura por link público, escritura con el token de config.js` })));

  paintContent();
}

/* ------------------------------- ficha de usuario ------------------------- */

function openUserModal(user) {
  const backdrop = el('div', { class: 'pn-modal-backdrop' });
  const modal = el('div', { class: 'pn-modal' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });

  const postsWrap = el('div', { class: 'col gap-4' },
    el('div', { class: 'muted small', text: 'Cargando publicaciones…' }));

  const fields = [
    ['Nombre', nameOf(user)],
    ['Usuario', `@${user.username || '—'}`],
    ['Alta', user.createdAt ? new Date(user.createdAt).toLocaleString('es-AR') : '—'],
    ['Ciudad', user.location || '—'],
    ['Trabajo', user.work || '—'],
    ['Estudios', user.education || '—'],
    ['Nacimiento', user.birthday || '—'],
    ['Estado civil', user.maritalStatus || '—'],
    ['WhatsApp', user.whatsapp ? `+${user.whatsapp}` : '—'],
    ['Instagram', user.instagram ? `@${user.instagram}` : '—'],
    ['Verificación', verificationType(user) ? VERIFICATION_TYPES[verificationType(user)].title : 'Sin verificar'],
    ['Contraseña', 'Cifrada con PBKDF2 (no visible)'],
  ];

  modal.append(
    el('div', { class: 'pn-modal-head' },
      el('h2', { text: nameOf(user) }),
      el('button', { class: 'pn-close', type: 'button', 'aria-label': 'Cerrar', onclick: close }, icon('x', 18))),
    el('div', { class: 'pn-modal-body' },
      el('div', { class: 'pn-profile' },
        avatarEl(user, 64),
        el('div', { class: 'grow' },
          el('div', { class: 'pn-profile-name', text: nameOf(user) }),
          el('div', { class: 'pn-profile-sub', text: `@${user.username || '—'}` }),
          el('div', { class: 'pn-user-meta' },
            el('span', { text: plural(countPosts(user.id), 'publicación', 'publicaciones') }),
            el('span', { text: plural(state.postsIndex.filter((entry) => entry.authorId === user.id).reduce((sum, entry) => sum + (state.postDocs.get(entry.id)?.commentsCount || 0), 0), 'comentario', 'comentarios') })))),
      el('div', { class: 'pn-section-title', text: 'Insignia' }),
      el('div', { class: 'pn-user-actions' },
        ...verificationButtons(user, { onDone: close })),
      user.bio ? el('div', { class: 'pn-field' },
        el('div', { class: 'pn-field-label', text: 'Biografía' }),
        el('div', { class: 'pn-field-value', text: user.bio })) : null,
      el('div', { class: 'pn-fields' },
        ...fields.map(([label, value]) => el('div', { class: 'pn-field' },
          el('div', { class: 'pn-field-label', text: label }),
          el('div', { class: 'pn-field-value', text: value })))),
      el('div', { class: 'pn-user-actions' },
        el('a', { class: 'pn-btn sm', href: `index.html#/u/${user.username}`, target: '_blank', rel: 'noopener' },
          icon('user', 15), 'Abrir perfil en Zuma'),
        el('a', { class: 'pn-btn sm', href: cdnUrl(P.user(user.id), { fresh: true }), target: '_blank', rel: 'noopener' },
          icon('link', 15), 'Ver JSON')),
      el('div', { class: 'pn-section-title', text: 'Sus publicaciones' }),
      postsWrap));

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const entries = state.postsIndex.filter((entry) => entry.authorId === user.id).slice(0, 20);
  Promise.all(entries.map(async (entry) => {
    const cached = state.postDocs.get(entry.id);
    if (cached) return cached;
    const doc = await readJson(P.post(entry.id));
    if (doc?.post) state.postDocs.set(entry.id, doc.post);
    return doc?.post || null;
  })).then((posts) => {
    clear(postsWrap);
    const found = posts.filter(Boolean);
    if (!found.length) {
      postsWrap.appendChild(el('div', { class: 'muted small', text: 'Todavía no publicó nada.' }));
      return;
    }
    for (const post of found) postsWrap.appendChild(postRow(post));
  }).catch(() => {
    clear(postsWrap);
    postsWrap.appendChild(el('div', { class: 'muted small', text: 'No se pudieron cargar las publicaciones.' }));
  });
}

/* ---------------------------------- boot ---------------------------------- */

async function boot() {
  if (!cfg.owner || !cfg.repo) {
    renderConfigError();
    return;
  }
  const session = readSession();
  if (session?.userId) {
    const doc = await readJson(P.user(session.userId));
    const user = doc?.user;
    if (user && isAdmin(user)) {
      state.me = user;
      try {
        await loadData();
        render();
      } catch (err) {
        renderGate(err.message || 'No se pudo cargar el panel.');
      }
      return;
    }
  }
  renderGate();
}

boot();
