/* ==========================================================================
   verification.js — insignia única azul de Zuma
   La insignia es una sola: "Cuenta verificada". Los datos viejos que tengan
   morado/dorado se muestran igual como azul.
   ========================================================================== */

export const BADGE_PRICE = 10000;

export const VERIFICATION_CATEGORIES = [
  { id: 'influencer', label: 'Influencer' },
  { id: 'gamer', label: 'Gamer' },
  { id: 'politico', label: 'Político/a' },
  { id: 'artista', label: 'Artista' },
  { id: 'deportista', label: 'Deportista' },
  { id: 'periodista', label: 'Periodista' },
  { id: 'empresa', label: 'Empresa / marca' },
  { id: 'otro', label: 'Otro' },
];

const DAY = 86_400_000;

export function categoryLabel(category) {
  return VERIFICATION_CATEGORIES.find((item) => item.id === category)?.label || '';
}

function endOfDay(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Datos normalizados de la verificación, incluso si está vencida. */
export function verificationInfo(user) {
  const value = user?.verification;
  if (!value) return null;
  const object = typeof value === 'string' ? { type: value } : value;
  const until = object.until || object.expiresAt || null;
  const expiry = endOfDay(until);
  const active = !expiry || expiry.getTime() >= Date.now();
  return {
    type: 'celeste',
    active,
    expired: Boolean(expiry && !active),
    until: expiry ? until : null,
    category: object.category || object.kind || null,
    legacyType: object.type || null,
    at: object.at || null,
    reminders: object.reminders || {},
    price: BADGE_PRICE,
  };
}

export function verificationType(user) {
  return verificationInfo(user)?.active ? 'celeste' : null;
}

export function hasVerification(user) {
  return Boolean(user?.verification);
}

export function daysUntil(value) {
  if (!value) return null;
  const text = String(value);
  const target = new Date(text.length === 10 ? `${text}T00:00:00` : text);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

export function formatDate(value) {
  const date = endOfDay(value);
  if (!date) return '';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function defaultUntil() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

export function reminderThresholds(info) {
  if (!info?.until || !info.active) return [];
  const days = daysUntil(info.until);
  if (days === null || days < 0) return [];
  const sent = info.reminders || {};
  const out = [];
  if (days <= 7 && days > 2 && !sent.d7) out.push({ key: 'd7', days });
  if (days <= 2 && !sent.d2) out.push({ key: 'd2', days });
  return out;
}
