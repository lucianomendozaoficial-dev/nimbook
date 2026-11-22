/* ==========================================================================
   panel.js — panel de control de Zuma (usuarios, publicaciones e insignias)
   ========================================================================== */
import { el, clear, timeAgo, formatCount, nowISO } from './core/util.js';
import { icon } from './core/icons.js';
import { configure, fetchDoc, queueDoc } from './core/net.js';
import { P } from './core/paths.js';
import { mediaImg } from './core/media.js';
import { verifyPassword } from './core/crypto.js';
import { initTheme } from './core/theme.js';
import { initRealtime, onRemoteDoc } from './core/realtime.js';
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
  supabaseUrl: cfg.supabaseUrl,
  supabaseKey: cfg.supabaseKey,
  storageBucket: cfg.storageBucket || 'zuma-media',
  readBase: cfg.local ? (cfg.mediaBase || '.') : '',
});

const state = {
  me: null,
  users: [],
  postsIndex: [],
  stories: [],
  shop: [],
  verifications: [],
  reports: [],
  supportInbox: [],
  supportUser: null,
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
  const [usersDoc, feedDoc, storiesDoc, shopDoc, verificationsDoc, reportsDoc, supportInboxDoc] = await Promise.all([
    readJson(P.userIndex),
    readJson(P.feedIndex),
    readJson(P.stories),
    readJson(P.shopIndex),
    readJson(P.supportVerifications),
    readJson(P.supportReports),
    readJson(P.inbox(P.supportUser)),
  ]);
  if (!usersDoc) throw new Error('No se pudo leer la lista de usuarios. Revisá la conexión o config.js.');

  state.postsIndex = Array.isArray(feedDoc?.posts) ? feedDoc.posts : [];
  state.stories = Array.isArray(storiesDoc?.stories) ? storiesDoc.stories : [];
  state.shop = Array.isArray(shopDoc?.items) ? shopDoc.items : [];
  state.verifications = Array.isArray(verificationsDoc?.requests) ? verificationsDoc.requests : [];
  state.reports = Array.isArray(reportsDoc?.reports) ? reportsDoc.reports : [];
  state.supportInbox = Array.isArray(supportInboxDoc?.threads) ? supportInboxDoc.threads : [];
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
  const support = users.find((user) => user.id === P.supportUser || user.username === 'soporte');
  if (support) {
    state.supportUser = support;
  } else {
    await ensureSupportUser();
  }
  if (state.me) state.me = users.find((user) => user.id === state.me.id) || state.me;
  state.loadedAt = Date.now();
}

async function ensureSupportUser() {
  const now = nowISO();
  const support = {
    id: P.supportUser,
    username: 'soporte',
    firstName: 'Soporte',
    lastName: 'Zuma',
    name: 'Soporte Zuma',
    avatar: 'assets/logo/zuma-logo-128.png',
    cover: null,
    bio: 'Cuenta oficial de ayuda de Zuma. Escribinos por mensaje privado o reportá una cuenta desde su perfil.',
    whatsapp: '',
    instagram: '',
    birthday: '',
    location: '',
    work: 'Equipo Zuma',
    education: '',
    password: null,
    saved: [],
    support: true,
    verification: { type: 'dorado', at: now },
    createdAt: now,
  };
  await queueDoc(P.user(support.id), () => ({ version: 1, user: support }), {
    delay: 0, message: 'Zuma: perfil de soporte',
  });
  const entry = {
    id: support.id,
    username: support.username,
    firstName: support.firstName,
    lastName: support.lastName,
    name: support.name,
    avatar: support.avatar,
    support: true,
    verification: 'dorado',
    createdAt: now,
  };
  await queueDoc(P.userIndex, (doc) => {
    const data = doc || { version: 1, users: [] };
    if ((data.users || []).some((row) => row.id === support.id)) return data;
    return { ...data, users: [entry, ...(data.users || [])] };
  }, { delay: 0, message: 'Zuma: perfil de soporte' });
  state.supportUser = support;
  if (!state.users.some((user) => user.id === support.id)) state.users.push(support);
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
  if (state.busy) return false;
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
    return true;
  } catch (err) {
    state.note = `No se pudo guardar la insignia: ${err?.message || 'error de red'}`;
    state.noteType = 'error';
    return false;
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
      'Este panel escribe en Supabase con la clave publicable de config.js. Usalo solo desde un dispositivo de confianza.'),
    el('div', { class: 'pn-gate-links' },
      el('a', { class: 'pn-btn', href: 'index.html' }, icon('home', 16), 'Abrir Zuma'))));
  setTimeout(() => username.focus(), 80);
}

function renderConfigError() {
  clear(root);
  root.appendChild(el('div', { class: 'pn-gate' },
    el('img', { class: 'pn-gate-logo', src: 'assets/logo/zuma-logo-128.png', alt: 'Zuma' }),
    el('h1', { text: 'Falta configurar Zuma' }),
    el('p', { class: 'pn-gate-sub', text: 'No encontramos la URL o la clave de Supabase en config.js. Revisá ese archivo y recargá.' }),
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

/* --------------------------------- soporte -------------------------------- */

const ARS = new Intl.NumberFormat('es-AR');
const supportPrice = (type) => (type === 'celeste' ? 10000 : type === 'morado' ? 18000 : 0);

function supportUserRow(user) {
  return user || { id: '', name: 'Usuario', username: '' };
}

function statsCard(iconName, value, label) {
  return el('div', { class: 'pn-stat' },
    el('div', { class: 'pn-stat-ic' }, icon(iconName, 19)),
    el('div', { class: 'pn-stat-value', text: formatCount(value) }),
    el('div', { class: 'pn-stat-label', text: label }));
}

async function updateSupportRequest(id, status) {
  await queueDoc(P.supportVerifications, (doc) => {
    if (!doc?.requests) return undefined;
    return {
      ...doc,
      requests: doc.requests.map((row) => (row.id === id ? { ...row, status } : row)),
    };
  }, { delay: 0, message: 'Zuma: solicitud de verificación' });
  state.verifications = state.verifications.map((row) => (row.id === id ? { ...row, status } : row));
}

async function approveVerification(request) {
  const ok = await setVerification(request.userId, request.type);
  if (!ok) return;
  await updateSupportRequest(request.id, 'approved');
  state.note = `Insignia ${VERIFICATION_TYPES[request.type].label} aprobada para ${nameOf(supportUserRow(state.users.find((u) => u.id === request.userId)))}.`;
  state.noteType = 'info';
  render();
}

async function rejectVerification(request) {
  await updateSupportRequest(request.id, 'rejected');
  state.note = 'Solicitud rechazada.';
  state.noteType = 'info';
  render();
}

async function resolveReport(report) {
  await queueDoc(P.supportReports, (doc) => {
    if (!doc?.reports) return undefined;
    return {
      ...doc,
      reports: doc.reports.map((row) => (row.id === report.id ? { ...row, status: 'resolved' } : row)),
    };
  }, { delay: 0, message: 'Zuma: reporte resuelto' });
  state.reports = state.reports.map((row) => (row.id === report.id ? { ...row, status: 'resolved' } : row));
  state.note = 'Reporte marcado como resuelto.';
  state.noteType = 'info';
  render();
}

function renderSupportView() {
  const pending = state.verifications.filter((row) => row.status === 'pending');
  const reports = state.reports;
  const unread = state.supportInbox.reduce((sum, row) => sum + (Number(row.unread) || 0), 0);
  const support = state.supportUser;
  const wrap = el('div', { class: 'col gap-16 pn-support' });

  wrap.appendChild(el('div', { class: 'pn-support-stats' },
    statsCard('shield', pending.length, 'Solicitudes pendientes'),
    statsCard('flag', reports.filter((row) => row.status !== 'resolved').length, 'Reportes abiertos'),
    statsCard('message', unread, 'Mensajes sin leer'),
    statsCard('user', support ? 1 : 0, 'Perfil de soporte')));

  wrap.appendChild(el('div', { class: 'pn-card' },
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Perfil de soporte' }),
        el('div', { class: 'pn-card-sub', text: 'Los usuarios pueden escribirle a @soporte y ver sus publicaciones.' })),
      el('div', { class: 'pn-user-actions' },
        support ? el('a', {
          class: 'pn-btn primary sm', href: 'index.html#/u/soporte', target: '_blank', rel: 'noopener',
        }, icon('user', 15), 'Ver perfil') : null))));

  const verCard = el('div', { class: 'pn-card' },
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Solicitudes de verificación' }),
        el('div', { class: 'pn-card-sub', text: 'DNI, nacimiento, país, ciudad e insignia elegida. El pago se coordina antes de aprobar.' }))));
  if (!pending.length) {
    verCard.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: 'No hay solicitudes pendientes.' })));
  }
  for (const request of pending) {
    const user = state.users.find((row) => row.id === request.userId);
    const type = VERIFICATION_TYPES[request.type] || VERIFICATION_TYPES.celeste;
    verCard.appendChild(el('div', { class: 'pn-support-request' },
      el('div', { class: 'pn-support-request-head' },
        avatarEl(user, 42),
        el('div', { class: 'grow' },
          el('div', { class: 'pn-name-row' },
            el('span', { class: 'pn-user-name', text: nameOf(user) }),
            verifiedBadge({ verification: request.type }, { size: 15, interactive: false })),
          el('div', { class: 'pn-user-sub', text: `@${request.username || user?.username || '—'} · ${new Date(request.createdAt).toLocaleString('es-AR')}` })),
        el('span', { class: 'pn-support-price', text: `$ ${ARS.format(supportPrice(request.type))}/mes` })),
      el('div', { class: 'pn-support-badge' }, type.title),
      el('div', { class: 'pn-fields pn-support-fields' },
        ...[
          ['DNI', request.dni],
          ['Nacimiento', request.birthDate],
          ['País', request.country],
          ['Ciudad', request.city],
          ['Insignia', type.title],
          ['Precio', `$ ${ARS.format(request.price || supportPrice(request.type))}/mes`],
        ].map(([label, value]) => el('div', { class: 'pn-field' },
          el('div', { class: 'pn-field-label', text: label }),
          el('div', { class: 'pn-field-value', text: value || '—' })))),
      el('div', { class: 'pn-user-actions' },
        btn('Aprobar y verificar', () => approveVerification(request), { className: 'primary sm', iconName: 'check' }),
        btn('Rechazar', () => rejectVerification(request), { className: 'danger sm', iconName: 'x' }))));
  }
  wrap.appendChild(verCard);

  const reportCard = el('div', { class: 'pn-card' },
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Cuentas reportadas' }),
        el('div', { class: 'pn-card-sub', text: 'Reportes enviados desde los perfiles, con el motivo.' }))));
  if (!reports.length) {
    reportCard.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: 'No hay reportes todavía.' })));
  }
  for (const report of reports.slice(0, 40)) {
    const reported = supportUserRow(state.users.find((row) => row.id === report.reportedId));
    const reporter = supportUserRow(state.users.find((row) => row.id === report.reporterId));
    reportCard.appendChild(el('div', { class: 'pn-support-report' },
      el('div', { class: 'pn-support-request-head' },
        avatarEl(reported, 38),
        el('div', { class: 'grow' },
          el('div', { class: 'pn-user-name', text: nameOf(reported) }),
          el('div', { class: 'pn-user-sub', text: `@${reported.username || '—'} · reportado por @${reporter.username || '—'} · ${timeAgo(report.createdAt)}` })),
        el('span', { class: `pn-status${report.status === 'resolved' ? ' resolved' : ''}`, text: report.status === 'resolved' ? 'Resuelto' : 'Pendiente' })),
      el('div', { class: 'pn-support-reason', text: report.reason }),
      report.detail ? el('p', { class: 'pn-support-detail', text: report.detail }) : null,
      report.status !== 'resolved'
        ? el('div', { class: 'pn-user-actions' },
          btn('Marcar resuelto', () => resolveReport(report), { className: 'sm', iconName: 'check' }))
        : null));
  }
  wrap.appendChild(reportCard);

  const chatCard = el('div', { class: 'pn-card' },
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Chat de soporte' }),
        el('div', { class: 'pn-card-sub', text: 'Mensajes privados que los usuarios le envían a @soporte.' }))));
  if (!state.supportInbox.length) {
    chatCard.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: 'Todavía no hay conversaciones de soporte.' })));
  }
  for (const row of state.supportInbox.slice(0, 40)) {
    const person = supportUserRow(state.users.find((user) => user.id === row.withId));
    chatCard.appendChild(el('div', { class: 'pn-user pn-support-chat-row' },
      avatarEl(person, 40),
      el('div', { class: 'pn-user-main' },
        el('div', { class: 'pn-name-row' },
          el('span', { class: 'pn-user-name', text: nameOf(person) }),
          Number(row.unread) ? el('span', { class: 'pn-status', text: `${row.unread} sin leer` }) : null),
        el('div', { class: 'pn-user-sub', text: row.lastText || '' })),
      el('div', { class: 'pn-user-actions' },
        btn('Abrir chat', () => openSupportChat(person.id), { className: 'sm', iconName: 'message' }))));
  }
  wrap.appendChild(chatCard);

  const postCard = el('div', { class: 'pn-card' },
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Publicar como Soporte' }),
        el('div', { class: 'pn-card-sub', text: 'La publicación aparece en el perfil de @soporte y en el muro.' }))));
  const postText = el('textarea', {
    class: 'textarea', rows: '3', maxlength: '2000',
    placeholder: 'Novedad o aviso de soporte…',
  });
  const publishBtn = btn('Publicar aviso', async () => {
    const text = postText.value.trim();
    if (!text || !support) return;
    publishBtn.disabled = true;
    try {
      await publishSupportPost(text, support);
      postText.value = '';
      state.note = 'Publicación de soporte publicada.';
      state.noteType = 'info';
      render();
    } catch (err) {
      state.note = err.message || 'No se pudo publicar.';
      state.noteType = 'error';
      render();
    }
  }, { className: 'primary', iconName: 'send' });
  postCard.appendChild(el('div', { class: 'pn-support-compose' }, postText, publishBtn));
  wrap.appendChild(postCard);

  return wrap;
}

async function publishSupportPost(text, support) {
  const now = nowISO();
  const id = `p_support_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const post = {
    id,
    authorId: support.id,
    text: String(text).slice(0, 2000),
    media: [],
    privacy: 'public',
    reactions: {},
    commentsCount: 0,
    createdAt: now,
  };
  await queueDoc(P.post(id), () => ({ version: 1, post }), {
    delay: 0, message: 'Zuma: aviso de soporte',
  });
  await queueDoc(P.feedIndex, (doc) => {
    const data = doc || { version: 1, posts: [] };
    return {
      ...data,
      posts: [{ id, authorId: support.id, createdAt: now }, ...(data.posts || [])].slice(0, 200),
    };
  }, { delay: 0, message: 'Zuma: aviso de soporte' });
  state.postsIndex = [{ id, authorId: support.id, createdAt: now }, ...state.postsIndex].slice(0, 200);
  state.postDocs.set(id, post);
}

function openSupportChat(userId) {
  const person = state.users.find((user) => user.id === userId) || { id: userId, name: 'Usuario', username: '' };
  const supportId = P.supportUser;
  const threadId = [supportId, userId].sort().join('__');
  const backdrop = el('div', { class: 'pn-modal-backdrop' });
  const modal = el('div', { class: 'pn-modal pn-support-modal' });
  const close = () => {
    clearInterval(pollMessages);
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  const pollMessages = setInterval(() => loadMessages().catch(() => {}), 5000);

  const body = el('div', { class: 'pn-support-thread' });
  const input = el('textarea', { rows: '2', placeholder: 'Responder como Soporte…', maxlength: '4000' });
  const send = el('button', { class: 'pn-btn primary', type: 'submit' }, icon('send', 16), el('span', { text: 'Enviar' }));

  async function loadMessages() {
    const doc = await readJson(P.thread(threadId));
    const messages = doc?.thread?.messages || [];
    clear(body);
    if (!messages.length) {
      body.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: 'Todavía no hay mensajes en esta conversación.' })));
      return;
    }
    for (const message of messages) {
      body.appendChild(el('div', {
        class: `pn-support-msg${message.fromId === supportId ? ' me' : ''}`,
      },
      el('div', { class: 'pn-support-bubble' },
        el('span', { text: message.text || '' }),
        el('span', { class: 'pn-support-stamp', text: new Date(message.createdAt).toLocaleString('es-AR') }))));
    }
    body.scrollTop = body.scrollHeight;
  }

  async function markRead() {
    await queueDoc(P.inbox(supportId), (doc) => {
      if (!doc?.threads) return undefined;
      return {
        ...doc,
        threads: doc.threads.map((row) => (row.threadId === threadId ? { ...row, unread: 0 } : row)),
      };
    }, { delay: 0, message: 'Zuma: soporte leído' });
    state.supportInbox = state.supportInbox.map((row) => (row.threadId === threadId ? { ...row, unread: 0 } : row));
  }

  const form = el('form', { class: 'pn-support-reply' }, input, send);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || state.busy) return;
    state.busy = true;
    send.disabled = true;
    try {
      const message = {
        id: `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        fromId: supportId,
        text,
        createdAt: nowISO(),
      };
      await queueDoc(P.thread(threadId), (doc) => {
        const data = doc?.thread ? doc : {
          version: 1,
          thread: { id: threadId, memberIds: [supportId, userId], messages: [] },
        };
        data.thread.messages = [...(data.thread.messages || []), message].slice(-400);
        data.thread.updatedAt = message.createdAt;
        return data;
      }, { delay: 0, message: 'Zuma: respuesta de soporte' });

      const base = {
        threadId,
        lastText: text.slice(0, 140),
        lastAt: message.createdAt,
        lastFromId: supportId,
      };
      await queueDoc(P.inbox(userId), (doc) => {
        const data = doc && Array.isArray(doc.threads) ? doc : { version: 1, threads: [] };
        const previous = data.threads.find((row) => row.threadId === threadId);
        const entry = { ...base, withId: supportId, unread: (Number(previous?.unread) || 0) + 1 };
        data.threads = [entry, ...data.threads.filter((row) => row.threadId !== threadId)].slice(0, 100);
        return data;
      }, { delay: 0, message: 'Zuma: respuesta de soporte' });
      await queueDoc(P.inbox(supportId), (doc) => {
        const data = doc && Array.isArray(doc.threads) ? doc : { version: 1, threads: [] };
        const entry = { ...base, withId: userId, unread: 0 };
        data.threads = [entry, ...data.threads.filter((row) => row.threadId !== threadId)].slice(0, 100);
        return data;
      }, { delay: 0, message: 'Zuma: respuesta de soporte' });

      state.supportInbox = [
        { ...base, withId: userId, unread: 0 },
        ...state.supportInbox.filter((row) => row.threadId !== threadId),
      ];
      input.value = '';
      await loadMessages();
      render();
    } catch (err) {
      state.note = err.message || 'No se pudo responder.';
      state.noteType = 'error';
      render();
    } finally {
      state.busy = false;
      send.disabled = false;
      input.focus();
    }
  });

  modal.append(
    el('div', { class: 'pn-modal-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: `Soporte · ${nameOf(person)}` }),
        el('div', { class: 'pn-card-sub', text: `@${person.username || '—'}` })),
      el('button', { class: 'pn-close', type: 'button', 'aria-label': 'Cerrar', onclick: close }, icon('x', 18))),
    el('div', { class: 'pn-modal-body' }, body, form));
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  markRead().then(() => loadMessages()).catch(() => loadMessages());
  setTimeout(() => input.focus(), 100);
}

function renderTabs() {
  const tabs = [
    { id: 'users', label: 'Usuarios', iconName: 'users' },
    { id: 'posts', label: 'Publicaciones', iconName: 'grid' },
    { id: 'badges', label: 'Insignias', iconName: 'shield' },
    { id: 'support', label: 'Soporte', iconName: 'message' },
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
  if (!state.me) state.me = { id: 'panel', name: 'Equipo Zuma', username: 'equipo' };
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
    else if (state.tab === 'support') content.appendChild(renderSupportView());
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
        el('a', { class: 'pn-btn primary', href: 'index.html' }, icon('home', 16), 'Abrir Zuma'))),
    renderStats(),
    renderTabs(),
    content,
    el('div', { class: 'pn-footer' },
      el('div', { text: 'Zuma · panel de control del equipo' }),
      el('div', { text: `Última carga: ${new Date(state.loadedAt || Date.now()).toLocaleString('es-AR')} · datos y escrituras en Supabase` })));

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
        el('button', {
          class: 'pn-btn sm', type: 'button',
          onclick: async () => {
            const doc = await fetchDoc(P.user(user.id), { fresh: true });
            const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener');
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          },
        }, icon('link', 15), 'Ver JSON')),
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
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    renderConfigError();
    return;
  }
  state.me = { id: 'panel', name: 'Equipo Zuma', username: 'equipo' };
  initRealtime();
  let supportRefreshTimer = null;
  onRemoteDoc((path) => {
    const isSupport = path.startsWith('data/soporte')
      || path.includes('mensajes/bandejas/u_support')
      || (path.includes('mensajes/hilos/') && path.includes('u_support'));
    if (!isSupport) return;
    clearTimeout(supportRefreshTimer);
    supportRefreshTimer = setTimeout(async () => {
      try {
        await loadData();
        render();
      } catch { /* se reintenta en el próximo cambio */ }
    }, 500);
  });
  try {
    await loadData();
    render();
  } catch (err) {
    clear(root);
    root.appendChild(el('div', { class: 'pn-gate' },
      el('h1', { text: 'No se pudo cargar el panel' }),
      el('p', { class: 'pn-gate-sub', text: err.message || 'Revisá la conexión con Supabase.' }),
      el('a', { class: 'pn-btn primary', href: 'index.html' }, icon('home', 16), 'Abrir Zuma')));
  }
}

boot();
