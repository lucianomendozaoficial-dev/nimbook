/* ==========================================================================
   panel.js — panel de control de Zuma (usuarios, publicaciones e insignias)
   ========================================================================== */
import { el, clear, timeAgo, formatCount, nowISO } from './core/util.js';
import { icon } from './core/icons.js';
import { configure, fetchDoc, queueDoc } from './core/net.js';
import { P } from './core/paths.js';
import { mediaImg } from './core/media.js';
import { verifyPassword, hashPassword } from './core/crypto.js';
import { initTheme } from './core/theme.js';
import { initRealtime, onRemoteDoc } from './core/realtime.js';
import {
  verifiedBadge,
} from './components/verified-badge.js';
import {
  BADGE_PRICE, VERIFICATION_CATEGORIES, categoryLabel, verificationInfo,
  hasVerification, formatDate, daysUntil, defaultUntil,
} from './core/verification.js';
import {
  processVerificationReminders, loadPaymentConfig,
} from './core/reminders.js';

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
  supportConfig: null,
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
  const [usersDoc, feedDoc, storiesDoc, shopDoc, verificationsDoc, reportsDoc, supportInboxDoc, supportConfigDoc] = await Promise.all([
    readJson(P.userIndex),
    readJson(P.feedIndex),
    readJson(P.stories),
    readJson(P.shopIndex),
    readJson(P.supportVerifications),
    readJson(P.supportReports),
    readJson(P.inbox(P.supportUser)),
    readJson(P.supportConfig),
  ]);
  if (!usersDoc) throw new Error('No se pudo leer la lista de usuarios. Revisá la conexión o config.js.');

  state.postsIndex = Array.isArray(feedDoc?.posts) ? feedDoc.posts : [];
  state.stories = Array.isArray(storiesDoc?.stories) ? storiesDoc.stories : [];
  state.shop = Array.isArray(shopDoc?.items) ? shopDoc.items : [];
  state.verifications = Array.isArray(verificationsDoc?.requests) ? verificationsDoc.requests : [];
  state.reports = Array.isArray(reportsDoc?.reports) ? reportsDoc.reports : [];
  state.supportInbox = Array.isArray(supportInboxDoc?.threads) ? supportInboxDoc.threads : [];
  state.supportConfig = supportConfigDoc?.payment || supportConfigDoc || null;
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
  processVerificationReminders(state.users).catch(() => {});
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
    verification: { type: 'celeste', at: now, category: 'otro' },
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
    verification: 'celeste',
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

function verificationButtons(user) {
  const info = verificationInfo(user);
  return [el('button', {
    class: `pn-vbtn celeste${info?.active ? ' active' : ''}`.trim(),
    type: 'button',
    title: info?.active ? 'Renovar insignia azul' : 'Asignar insignia azul',
    disabled: state.busy,
    onclick: () => openVerificationModal(user),
  },
  verifiedBadge({ verification: 'celeste' }, { size: 18, interactive: false }),
  el('span', { text: info?.active ? 'Renovar' : 'Dar insignia' }))];
}

function paymentSummary() {
  const payment = state.supportConfig || {};
  const parts = [
    payment.alias ? `Alias: ${payment.alias}` : '',
    payment.cvu ? `CVU/CBU: ${payment.cvu}` : '',
    payment.holder ? `Titular: ${payment.holder}` : '',
    payment.bank ? `Banco: ${payment.bank}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Todavía no configuraste los datos de pago.';
}

async function setVerification(userId, { until = null, category = null, remove = false } = {}) {
  if (state.busy) return false;
  state.busy = true;
  state.note = remove ? 'Quitando insignia…' : 'Guardando insignia azul…';
  state.noteType = 'info';
  render();
  try {
    const verification = remove ? null : {
      type: 'celeste',
      at: nowISO(),
      until: until || null,
      category: category || null,
      reminders: {},
    };
    await queueDoc(P.user(userId), (doc) => {
      if (!doc?.user) return undefined;
      return { ...doc, user: { ...doc.user, verification } };
    }, { delay: 0, message: 'Zuma: insignia' });

    await queueDoc(P.userIndex, (doc) => {
      if (!doc?.users) return undefined;
      return {
        ...doc,
        users: doc.users.map((entry) => (
          entry.id === userId
            ? {
              ...entry,
              verification: verification ? 'celeste' : null,
              verificationUntil: verification?.until || null,
              verificationCategory: verification?.category || null,
            }
            : entry
        )),
      };
    }, { delay: 0, message: 'Zuma: insignia' });

    const user = state.users.find((entry) => entry.id === userId);
    if (user) {
      user.verification = verification;
      if (state.me?.id === userId) state.me = user;
    }
    state.note = remove
      ? `Insignia quitada a ${nameOf(user)}.`
      : `Insignia azul asignada a ${nameOf(user)}${until ? ` hasta el ${formatDate(until)}` : ''}.`;
    state.noteType = 'info';
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

function openVerificationModal(user, { request = null } = {}) {
  const info = verificationInfo(user);
  const backdrop = el('div', { class: 'pn-modal-backdrop' });
  const modal = el('div', { class: 'pn-modal pn-verification-modal' });
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });

  const until = el('input', {
    class: 'input', type: 'date', value: info?.until?.slice(0, 10) || defaultUntil(),
  });
  const category = el('select', { class: 'input' },
    el('option', { value: '', text: 'Sin tipo de cuenta' }),
    ...VERIFICATION_CATEGORIES.map((item) => el('option', {
      value: item.id, text: item.label, selected: (request?.category || info?.category) === item.id,
    })));
  const save = el('button', { class: 'pn-btn primary', type: 'submit', text: 'Guardar insignia' });
  const remove = el('button', {
    class: 'pn-btn danger', type: 'button', text: 'Quitar insignia', disabled: !hasVerification(user),
  });

  const fields = request ? el('div', { class: 'pn-fields pn-verification-request-fields' },
    ...[
      ['Nombre completo', request.fullName || request.name],
      ['DNI', request.dni],
      ['Localidad', request.locality],
      ['Nacimiento', request.birthDate],
      ['Tipo de cuenta', request.categoryLabel || categoryLabel(request.category)],
      ['Precio', `$ ${BADGE_PRICE.toLocaleString('es-AR')}/mes`],
    ].map(([label, value]) => el('div', { class: 'pn-field' },
      el('div', { class: 'pn-field-label', text: label }),
      el('div', { class: 'pn-field-value', text: value || '—' })))) : null;

  const form = el('form', { class: 'col gap-12' },
    el('div', { class: 'pn-verification-preview' },
      verifiedBadge({ verification: 'celeste' }, { size: 46, interactive: false }),
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Insignia azul' }),
        el('div', { class: 'pn-card-sub', text: `$ ${BADGE_PRICE.toLocaleString('es-AR')}/mes · ${nameOf(user)} · @${user.username || '—'}` }))),
    fields,
    el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Válida hasta' }), until),
    el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Tipo de cuenta' }), category),
    el('div', { class: 'pn-verification-payment' },
      el('div', { class: 'pn-field-label', text: 'Datos de pago que se envían en el aviso' }),
      el('div', { class: 'pn-field-value', text: paymentSummary() })),
    el('div', { class: 'pn-modal-actions' }, remove, save));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    const ok = await setVerification(user.id, {
      until: until.value,
      category: category.value || null,
    });
    if (ok && request) {
      await updateSupportRequest(request.id, 'approved').catch(() => {});
    }
    close();
  });
  remove.addEventListener('click', async () => {
    if (!confirm(`¿Quitar la insignia a ${nameOf(user)}?`)) return;
    const ok = await setVerification(user.id, { remove: true });
    if (ok) close();
  });

  modal.append(
    el('div', { class: 'pn-modal-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: request ? 'Aprobar verificación' : 'Insignia azul' }),
        el('div', { class: 'pn-card-sub', text: 'Una sola insignia para toda la comunidad.' })),
      el('button', { class: 'pn-close', type: 'button', 'aria-label': 'Cerrar', onclick: close }, icon('x', 18))),
    el('div', { class: 'pn-modal-body' }, form));
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
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
  const user = state.users.find((entry) => entry.id === request.userId);
  if (!user) {
    state.note = 'No encontramos la cuenta de esta solicitud.';
    state.noteType = 'error';
    render();
    return;
  }
  openVerificationModal(user, { request });
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
        el('div', { class: 'pn-card-sub', text: 'Insignia azul: nombre completo, DNI, localidad, nacimiento y tipo de cuenta. El pago se coordina y se define la fecha de vencimiento.' }))));
  if (!pending.length) {
    verCard.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: 'No hay solicitudes pendientes.' })));
  }
  for (const request of pending) {
    const user = state.users.find((row) => row.id === request.userId);
    verCard.appendChild(el('div', { class: 'pn-support-request' },
      el('div', { class: 'pn-support-request-head' },
        avatarEl(user, 42),
        el('div', { class: 'grow' },
          el('div', { class: 'pn-name-row' },
            el('span', { class: 'pn-user-name', text: nameOf(user) }),
            verifiedBadge({ verification: 'celeste' }, { size: 15, interactive: false })),
          el('div', { class: 'pn-user-sub', text: `@${request.username || user?.username || '—'} · ${new Date(request.createdAt).toLocaleString('es-AR')}` })),
        el('span', { class: 'pn-support-price', text: `$ ${ARS.format(BADGE_PRICE)}/mes` })),
      el('div', { class: 'pn-support-badge', text: 'Insignia azul' }),
      el('div', { class: 'pn-fields pn-support-fields' },
        ...[
          ['Nombre completo', request.fullName || request.name],
          ['DNI', request.dni],
          ['Localidad', request.locality],
          ['Nacimiento', request.birthDate],
          ['Tipo de cuenta', request.categoryLabel || categoryLabel(request.category)],
          ['Precio', `$ ${ARS.format(BADGE_PRICE)}/mes`],
        ].map(([label, value]) => el('div', { class: 'pn-field' },
          el('div', { class: 'pn-field-label', text: label }),
          el('div', { class: 'pn-field-value', text: value || '—' })))),
      el('div', { class: 'pn-user-actions' },
        btn('Revisar y aprobar', () => approveVerification(request), { className: 'primary sm', iconName: 'check' }),
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

/* ------------------------------- configuración --------------------------- */

function renderConfigView() {
  const payment = state.supportConfig || {};
  const alias = el('input', { class: 'input', value: payment.alias || '', maxlength: '80', placeholder: 'Alias de pago' });
  const cvu = el('input', { class: 'input', value: payment.cvu || '', maxlength: '40', placeholder: 'CVU / CBU' });
  const holder = el('input', { class: 'input', value: payment.holder || '', maxlength: '80', placeholder: 'Titular de la cuenta' });
  const bank = el('input', { class: 'input', value: payment.bank || '', maxlength: '80', placeholder: 'Banco / billetera' });
  const note = el('textarea', { class: 'textarea', rows: '3', maxlength: '500', placeholder: 'Instrucciones extra para el pago', value: payment.note || '' });
  const save = el('button', {
    class: 'pn-btn primary', type: 'submit', text: 'Guardar datos de pago',
  });

  const form = el('form', { class: 'col gap-12' },
    el('div', { class: 'pn-fields' },
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Alias' }), alias),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'CVU / CBU' }), cvu),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Titular' }), holder),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Banco / billetera' }), bank)),
    el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Instrucciones' }), note),
    el('div', { class: 'pn-config-actions' }, save));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const data = {
        alias: alias.value.trim(),
        cvu: cvu.value.trim(),
        holder: holder.value.trim(),
        bank: bank.value.trim(),
        note: note.value.trim(),
      };
      await queueDoc(P.supportConfig, () => ({
        version: 1,
        payment: data,
        updatedAt: nowISO(),
      }), { delay: 0, message: 'Zuma: datos de pago' });
      state.supportConfig = data;
      state.note = 'Datos de pago guardados. Se incluyen en los avisos de vencimiento.';
      state.noteType = 'info';
      render();
    } catch (err) {
      state.note = err.message || 'No se pudieron guardar los datos de pago.';
      state.noteType = 'error';
      render();
    } finally {
      save.disabled = false;
    }
  });

  return el('div', { class: 'col gap-16' },
    el('div', { class: 'pn-card' },
      el('div', { class: 'pn-card-head' },
        el('div', null,
          el('div', { class: 'pn-card-title', text: 'Datos de pago de la insignia' }),
          el('div', { class: 'pn-card-sub', text: 'Se muestran en el panel al aprobar y se envían por chat 7 y 2 días antes del vencimiento.' }))),
      el('div', { class: 'pn-config-body' }, form)),
    el('div', { class: 'pn-card' },
      el('div', { class: 'pn-card-head' },
        el('div', null,
          el('div', { class: 'pn-card-title', text: 'Cómo funcionan los avisos' }),
          el('div', { class: 'pn-card-sub', text: 'La insignia cuesta $ 10.000/mes. El panel pregunta hasta qué fecha dura al asignarla.' }))),
      el('div', { class: 'pn-config-info' },
        el('div', { class: 'pn-config-info-row' }, icon('clock', 17), el('span', { text: 'El usuario recibe un mensaje privado de @soporte 7 días antes y otro 2 días antes.' })),
        el('div', { class: 'pn-config-info-row' }, icon('shield', 17), el('span', { text: 'Los avisos se envían al abrir el panel o cuando el usuario abre su app; no se repiten.' })),
        el('div', { class: 'pn-config-info-row' }, icon('message', 17), el('span', { text: 'El mensaje incluye los datos de pago de esta sección.' })))));
}

function renderTabs() {
  const tabs = [
    { id: 'users', label: 'Usuarios', iconName: 'users' },
    { id: 'posts', label: 'Publicaciones', iconName: 'grid' },
    { id: 'badges', label: 'Insignias', iconName: 'shield' },
    { id: 'support', label: 'Soporte', iconName: 'message' },
    { id: 'config', label: 'Configuración', iconName: 'settings' },
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
      btn('Editar', () => openEditUser(user), { className: 'sm', iconName: 'edit' }),
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
  const verified = state.users
    .filter((user) => hasVerification(user))
    .sort((a, b) => {
      const ai = verificationInfo(a)?.active ? 0 : 1;
      const bi = verificationInfo(b)?.active ? 0 : 1;
      return ai - bi || String(a.username).localeCompare(String(b.username), 'es');
    });
  const active = verified.filter((user) => verificationInfo(user)?.active);
  const expired = verified.length - active.length;

  card.append(
    el('div', { class: 'pn-card-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Insignia azul' }),
        el('div', { class: 'pn-card-sub', text: 'Una sola insignia para toda la comunidad. Asigná la fecha de vencimiento y el tipo de cuenta desde acá.' }))),
    el('div', { class: 'pn-badge-blue-card' },
      verifiedBadge({ verification: 'celeste' }, { size: 54, interactive: false }),
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Cuenta verificada' }),
        el('div', { class: 'pn-card-sub', text: 'Mayor visibilidad · perfil en sugerencias · tipo de cuenta · estilo especial de perfil' }),
        el('div', { class: 'pn-badge-blue-meta' },
          el('span', { class: 'chip', text: `$ ${ARS.format(BADGE_PRICE)}/mes` }),
          el('span', { class: 'chip', text: `${active.length} activa${active.length === 1 ? '' : 's'}` }),
          expired ? el('span', { class: 'chip warn', text: `${expired} vencida${expired === 1 ? '' : 's'}` }) : null))),
    el('div', { class: 'pn-card-head' },
      el('div', { class: 'pn-card-title', style: { fontSize: '15px' }, text: 'Usuarios con insignia' })));

  if (!verified.length) {
    card.appendChild(el('div', { class: 'pn-post' }, el('span', { class: 'muted', text: 'Todavía no hay usuarios con insignia.' })));
    return card;
  }

  for (const user of verified) {
    const info = verificationInfo(user);
    const status = !hasVerification(user) ? 'Sin verificar' : info?.active ? 'Activa' : 'Vencida';
    card.appendChild(el('div', { class: 'pn-user' },
      avatarEl(user, 40),
      el('div', { class: 'pn-user-main' },
        el('div', { class: 'pn-name-row' },
          el('span', { class: 'pn-user-name', text: nameOf(user) }),
          verifiedBadge(user, { size: 15, interactive: false }),
          el('span', { class: `pn-status${info?.active ? ' resolved' : ''}`, text: status })),
        el('div', { class: 'pn-user-sub' },
          `@${user.username || '—'} · ${info?.category ? categoryLabel(info.category) : 'Sin tipo'} · ${info?.until ? `vence ${formatDate(info.until)}` : 'sin vencimiento'}`),
        el('div', { class: 'pn-user-meta' },
          el('span', { text: `Avisos: ${info?.reminders?.d7 ? '7d ✓' : '7d pendiente'} · ${info?.reminders?.d2 ? '2d ✓' : '2d pendiente'}` }))),
      el('div', { class: 'pn-user-actions' },
        btn(info?.active ? 'Renovar' : 'Asignar', () => openVerificationModal(user), { className: 'primary sm', iconName: 'shield' }),
        btn('Ver ficha', () => openUserModal(user), { className: 'sm', iconName: 'info' }))));
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
    else if (state.tab === 'config') content.appendChild(renderConfigView());
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
        btn('Bloquear', () => {
          sessionStorage.removeItem(PANEL_GATE_KEY);
          location.reload();
        }, { iconName: 'lock' }),
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

function openEditUser(user) {
  const info = verificationInfo(user);
  const backdrop = el('div', { class: 'pn-modal-backdrop' });
  const modal = el('div', { class: 'pn-modal pn-edit-user-modal' });
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });

  const firstName = el('input', { class: 'input', value: user.firstName || '', maxlength: '40' });
  const lastName = el('input', { class: 'input', value: user.lastName || '', maxlength: '40' });
  const username = el('input', { class: 'input', value: user.username || '', maxlength: '30', autocapitalize: 'none' });
  const location = el('input', { class: 'input', value: user.location || '', maxlength: '80' });
  const work = el('input', { class: 'input', value: user.work || '', maxlength: '80' });
  const education = el('input', { class: 'input', value: user.education || '', maxlength: '80' });
  const birthday = el('input', { class: 'input', type: 'date', value: String(user.birthday || '').slice(0, 10) });
  const bio = el('textarea', { class: 'textarea', rows: '3', maxlength: '300', value: user.bio || '' });
  const password = el('input', {
    class: 'input', type: 'password', autocomplete: 'new-password',
    placeholder: 'Dejar vacío para no cambiarla', maxlength: '100',
  });
  const category = info ? el('select', { class: 'input' },
    el('option', { value: '', text: 'Sin tipo de cuenta' }),
    ...VERIFICATION_CATEGORIES.map((item) => el('option', {
      value: item.id, text: item.label, selected: info.category === item.id,
    }))) : null;
  const error = el('div', { class: 'pn-gate-error' });
  const save = el('button', { class: 'pn-btn primary', type: 'submit', text: 'Guardar cambios' });

  const form = el('form', { class: 'col gap-12' },
    el('div', { class: 'pn-fields' },
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Nombre' }), firstName),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Apellido' }), lastName),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Usuario' }), username),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Localidad' }), location),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Trabajo' }), work),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Estudios' }), education),
      el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Nacimiento' }), birthday),
      info ? el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Tipo verificado' }), category) : null),
    el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Biografía' }), bio),
    el('div', { class: 'pn-field' }, el('div', { class: 'pn-field-label', text: 'Nueva contraseña (opcional)' }), password),
    error,
    el('div', { class: 'pn-modal-actions' }, save));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const first = firstName.value.trim();
    const last = lastName.value.trim();
    const handle = username.value.trim().toLowerCase();
    if (first.length < 2 || last.length < 2) { error.textContent = 'Nombre y apellido son obligatorios.'; return; }
    if (!/^[a-z0-9._]{3,30}$/.test(handle)) { error.textContent = 'Usuario: 3 a 30 letras, números, puntos o guiones bajos.'; return; }
    if (state.users.some((row) => row.id !== user.id && String(row.username).toLowerCase() === handle)) {
      error.textContent = 'Ese usuario ya está en uso.';
      return;
    }
    if (password.value && password.value.length < 6) { error.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

    save.disabled = true;
    try {
      const doc = await readJson(P.user(user.id));
      if (!doc?.user) throw new Error('No se encontró la cuenta.');
      const patch = {
        firstName: first,
        lastName: last,
        name: `${first} ${last}`.trim(),
        username: handle,
        location: location.value.trim(),
        work: work.value.trim(),
        education: education.value.trim(),
        birthday: birthday.value,
        bio: bio.value.trim(),
      };
      if (password.value) patch.password = await hashPassword(password.value);
      if (category) {
        const value = doc.user.verification;
        const base = typeof value === 'string' ? { type: value } : { ...(value || {}) };
        base.type = 'celeste';
        base.category = category.value || null;
        patch.verification = base;
      }
      await queueDoc(P.user(user.id), () => ({
        ...doc,
        user: { ...doc.user, ...patch },
      }), { delay: 0, message: 'Zuma: editar usuario' });
      await queueDoc(P.userIndex, (indexDoc) => {
        if (!indexDoc?.users) return undefined;
        return {
          ...indexDoc,
          users: indexDoc.users.map((entry) => (
            entry.id === user.id
              ? {
                ...entry,
                firstName: patch.firstName,
                lastName: patch.lastName,
                name: patch.name,
                username: patch.username,
                verification: patch.verification ? 'celeste' : entry.verification,
              }
              : entry
          )),
        };
      }, { delay: 0, message: 'Zuma: editar usuario' });
      Object.assign(user, patch);
      state.note = `Datos de ${nameOf(user)} actualizados.`;
      state.noteType = 'info';
      close();
      render();
    } catch (err) {
      error.textContent = err.message || 'No se pudo guardar.';
      save.disabled = false;
    }
  });

  modal.append(
    el('div', { class: 'pn-modal-head' },
      el('div', null,
        el('div', { class: 'pn-card-title', text: 'Editar usuario' }),
        el('div', { class: 'pn-card-sub', text: `@${user.username || '—'}` })),
      el('button', { class: 'pn-close', type: 'button', 'aria-label': 'Cerrar', onclick: close }, icon('x', 18))),
    el('div', { class: 'pn-modal-body' }, form));
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  setTimeout(() => firstName.focus(), 80);
}

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
    ['Verificación', (() => {
      const info = verificationInfo(user);
      if (!hasVerification(user)) return 'Sin verificar';
      return `Insignia azul${info?.active ? '' : ' (vencida)'}${info?.until ? ` · hasta ${formatDate(info.until)}` : ''}${info?.category ? ` · ${categoryLabel(info.category)}` : ''}`;
    })()],
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
        ...verificationButtons(user),
        btn('Editar usuario', () => openEditUser(user), { className: 'sm', iconName: 'edit' })),
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

const PANEL_GATE_KEY = 'zuma.panel.gate.v1';
const PANEL_PASSWORD_HASH = '49bc022918338091e19626ee39d696f739aaca4da35a3a6dd3c26863b3d2e5ae';

async function sha256(text) {
  if (!window.crypto?.subtle) return '';
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function renderPanelGate(message = '') {
  clear(root);
  const password = el('input', {
    class: 'input', type: 'password', inputmode: 'numeric',
    autocomplete: 'current-password', placeholder: 'Contraseña de verificación',
    maxlength: '32',
  });
  const error = el('p', { class: 'pn-gate-error', text: message });
  const submit = el('button', { class: 'pn-btn primary block', type: 'submit', text: 'Entrar al panel' });
  const form = el('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Verificando…';
      error.textContent = '';
      try {
        const hash = await sha256(password.value.trim());
        if (hash !== PANEL_PASSWORD_HASH) {
          error.textContent = 'Contraseña incorrecta.';
          submit.disabled = false;
          submit.textContent = 'Entrar al panel';
          password.select();
          return;
        }
        sessionStorage.setItem(PANEL_GATE_KEY, '1');
        startPanel();
      } catch {
        error.textContent = 'No se pudo verificar la contraseña.';
        submit.disabled = false;
        submit.textContent = 'Entrar al panel';
      }
    },
  },
  el('div', { class: 'field' },
    el('label', { text: 'Contraseña de verificación' }),
    password),
  error,
  submit);

  root.append(el('div', { class: 'pn-gate' },
    el('img', { class: 'pn-gate-logo', src: 'assets/logo/zuma-logo-128.png', alt: 'Zuma' }),
    el('h1', { text: 'Panel de control' }),
    el('p', { class: 'pn-gate-sub', text: 'Acceso del equipo. Ingresá la contraseña de verificación para continuar.' }),
    form,
    el('p', { class: 'pn-gate-note', text: 'La sesión queda abierta solo en esta pestaña. Si la cerrás, vuelve a pedir la contraseña.' }),
    el('div', { class: 'pn-gate-links' },
      el('a', { class: 'pn-btn', href: 'index.html' }, icon('home', 16), 'Abrir Zuma'))));
  setTimeout(() => password.focus(), 80);
}

async function startPanel() {
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

async function boot() {
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    renderConfigError();
    return;
  }
  if (sessionStorage.getItem(PANEL_GATE_KEY) !== '1') {
    renderPanelGate();
    return;
  }
  await startPanel();
}

boot();
