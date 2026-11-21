/* ==========================================================================
   auth.js — sesión, registro e ingreso
   ========================================================================== */
import { state, loadUser, loadLikes, loadFollowing, loadFollowers, loadNotifications } from './store.js';
import * as actions from './actions.js';

const SESSION_KEY = 'nb.session.v2';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

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

export function validateUsername(username) {
  const value = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._]{3,30}$/.test(value)) {
    return 'Usá entre 3 y 30 letras, números, puntos o guiones bajos.';
  }
  return null;
}

export async function restoreSession() {
  const session = readSession();
  if (!session) return null;
  const user = await loadUser(session.userId);
  if (!user) {
    clearSession();
    return null;
  }
  state.me = user;
  return user;
}

export async function afterLogin(user) {
  state.me = user;
  saveSession(user.id);
  await Promise.all([
    loadLikes(user.id),
    loadFollowing(user.id),
    loadFollowers(user.id),
    loadNotifications(user.id),
  ]);
  return user;
}

export async function login(username, password) {
  const user = await actions.login(username, password);
  return afterLogin(user);
}

export async function register(data) {
  const user = await actions.register(data);
  return afterLogin(user);
}

export async function logout() {
  clearSession();
  state.me = null;
}

export { actions };
