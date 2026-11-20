/* ==========================================================================
   auth.js — cuentas de NimbookGR (registro, acceso, sesión local)
   ========================================================================== */
import { hashPassword, verifyPassword } from './crypto.js';
import { state, PATHS, notifPath } from './store.js';
import { ensureDoc } from './db.js';

const SESSION_KEY = 'nb.session.v1';
const USERS_EMPTY = () => ({ version: 1, users: [] });

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

export function validateUsername(username) {
  const value = String(username || '').trim().toLowerCase();
  if (!value) throw new ValidationError('Elige un nombre de usuario.', 'username');
  if (value.length < 3) throw new ValidationError('El usuario debe tener al menos 3 caracteres.', 'username');
  if (value.length > 30) throw new ValidationError('El usuario no puede pasar de 30 caracteres.', 'username');
  if (!USERNAME_RE.test(value)) {
    throw new ValidationError('Solo letras, números, puntos y guiones bajos (sin espacios).', 'username');
  }
  return value;
}

export function validateName(name) {
  const value = String(name || '').trim().replace(/\s+/g, ' ');
  if (value.length < 2) throw new ValidationError('Escribe tu nombre completo.', 'name');
  if (value.length > 60) throw new ValidationError('El nombre es demasiado largo.', 'name');
  return value;
}

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 6) throw new ValidationError('La contraseña necesita al menos 6 caracteres.', 'password');
  if (value.length > 200) throw new ValidationError('La contraseña es demasiado larga.', 'password');
  return value;
}

/* ------------------------------- sesión --------------------------------- */

export function saveSession(userId) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, at: Date.now() }));
  } catch { /* noop */ }
}

export function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.userId ? data : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
}

/** Recupera la sesión guardada y valida contra users.json. */
export async function restoreSession() {
  const session = readSession();
  if (!session) return null;
  // primero desde la caché local (arranque instantáneo)
  const cached = state.db?.peek(PATHS.users);
  const cachedUser = cached?.users?.find((u) => u.id === session.userId);
  if (cachedUser) state.me = cachedUser;

  const doc = await state.db.load(PATHS.users, { revalidate: true });
  const user = (doc?.users || []).find((u) => u.id === session.userId);
  if (!user) {
    clearSession();
    state.me = null;
    return null;
  }
  state.me = user;
  return user;
}

/* ------------------------------ registro -------------------------------- */

function cleanContact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanWhatsapp(value) {
  const raw = cleanContact(value);
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 6) throw new ValidationError('Escribe un número de WhatsApp válido.', 'whatsapp');
  if (digits.length > 15) throw new ValidationError('El número de WhatsApp es demasiado largo.', 'whatsapp');
  return digits;
}

function cleanInstagram(value) {
  const raw = cleanContact(value);
  if (!raw) return '';
  const handle = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '')
    .trim();
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
    throw new ValidationError('El usuario de Instagram no es válido.', 'instagram');
  }
  return handle;
}

function validatePart(value, field, label) {
  const clean = cleanContact(value);
  if (clean.length < 2) throw new ValidationError(`Escribe tu ${label}.`, field);
  if (clean.length > 40) throw new ValidationError(`El ${label} es demasiado largo.`, field);
  return clean;
}

export async function register({
  firstName, lastName, username, password,
  birthday = '', whatsapp = '', instagram = '',
}) {
  const cleanFirst = validatePart(firstName, 'firstName', 'nombre');
  const cleanLast = validatePart(lastName, 'lastName', 'apellido');
  const cleanUsername = validateUsername(username);
  const cleanPassword = validatePassword(password);
  const whatsappNumber = cleanWhatsapp(whatsapp);
  const instagramHandle = cleanInstagram(instagram);

  if (!state.db) throw new Error('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');

  const passwordRecord = await hashPassword(cleanPassword);

  const existing = state.db.peek(PATHS.users)?.users || [];
  if (existing.some((u) => u.username === cleanUsername)) {
    throw new ValidationError('Ese usuario ya está en uso. Prueba con otro.', 'username');
  }

  const user = {
    id: `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`,
    firstName: cleanFirst,
    lastName: cleanLast,
    name: `${cleanFirst} ${cleanLast}`.trim(),
    username: cleanUsername,
    password: passwordRecord,
    avatar: null,
    cover: null,
    bio: '',
    birthday: birthday || '',
    gender: '',
    whatsapp: whatsappNumber,
    instagram: instagramHandle,
    location: '',
    work: '',
    education: '',
    friendIds: [],
    savedPostIds: [],
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };

  await state.db.mutate(PATHS.users, (doc) => {
    ensureDoc(doc, 'users');
    if (doc.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      throw new ValidationError('Ese usuario ya está en uso. Prueba con otro.', 'username');
    }
    doc.users.push(user);
    return doc;
  }, { empty: USERS_EMPTY, message: `NimbookGR: nueva cuenta @${cleanUsername}` });

  state.me = { ...user };
  saveSession(user.id);

  // Notificación de bienvenida (si falla no rompe el registro)
  try {
    await state.db.createFile(notifPath(user.id), {
      version: 1,
      items: [{
        id: `n_${Date.now().toString(36)}`,
        type: 'welcome',
        actorId: user.id,
        text: `¡Bienvenido a NimbookGR, ${cleanFirst}! Ya puedes subir tu foto de perfil y publicar tu primer momento.`,
        at: Date.now(),
        read: false,
      }],
    }, { message: 'NimbookGR: bienvenida' });
    state.notifications = state.db.peek(notifPath(user.id))?.items || [];
  } catch (err) {
    console.warn('[auth] no se pudo crear la bienvenida', err);
  }

  return user;
}

/* -------------------------------- acceso -------------------------------- */

export async function login({ username, password }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername) throw new ValidationError('Escribe tu nombre de usuario.', 'username');
  if (!password) throw new ValidationError('Escribe tu contraseña.', 'password');
  if (!state.db) throw new Error('No pudimos guardar los cambios. Revisa tu conexión.');

  const doc = await state.db.load(PATHS.users, { force: true });
  const user = (doc?.users || []).find((u) => u.username.toLowerCase() === cleanUsername);
  if (!user) throw new ValidationError('No encontramos esa cuenta en NimbookGR.', 'username');

  const ok = await verifyPassword(password, user.password);
  if (!ok) throw new ValidationError('Contraseña incorrecta. Inténtalo de nuevo.', 'password');

  state.me = user;
  saveSession(user.id);
  state.notifications = state.db.peek(notifPath(user.id))?.items || [];

  // Presencia: no bloquea el acceso si falla.
  state.db.mutate(PATHS.users, (draft) => {
    const target = draft.users?.find((u) => u.id === user.id);
    if (!target) return draft;
    target.lastSeen = new Date().toISOString();
    return draft;
  }, { empty: USERS_EMPTY, message: 'NimbookGR: inicio de sesión' }).catch(() => {});

  return user;
}

export async function logout() {
  const me = state.me;
  state.me = null;
  clearSession();
  if (me && state.db) {
    state.db.mutate(PATHS.users, (draft) => {
      const target = draft.users?.find((u) => u.id === me.id);
      if (!target) return draft;
      target.lastSeen = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      return draft;
    }, { empty: USERS_EMPTY, message: 'NimbookGR: cierre de sesión' }).catch(() => {});
  }
}

export function isOnline(user) {
  if (!user?.lastSeen) return false;
  return Date.now() - Date.parse(user.lastSeen) < 8 * 60 * 1000;
}

export function presenceText(user) {
  if (!user?.lastSeen) return 'Desconectado';
  const diff = Date.now() - Date.parse(user.lastSeen);
  if (diff < 8 * 60 * 1000) return 'En línea';
  if (diff < 60 * 60 * 1000) return `Activo hace ${Math.max(1, Math.round(diff / 60000))} min`;
  if (diff < 24 * 3600 * 1000) return `Activo hace ${Math.round(diff / 3600000)} h`;
  return 'Desconectado';
}

export const notificationsFile = notifPath;
