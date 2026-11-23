/* ==========================================================================
   reminders.js — avisos de vencimiento de la insignia azul
   Envía un mensaje privado desde @soporte 7 días y 2 días antes del vencimiento.
   ========================================================================== */
import { P } from './paths.js';
import { fetchDoc, queueDoc, newId, nowISO } from './net.js';
import { state, threadIdFor } from './store.js';
import {
  BADGE_PRICE, verificationInfo, reminderThresholds, formatDate,
} from './verification.js';

const DEFAULT_PAYMENT = {
  alias: '',
  cvu: '',
  holder: '',
  bank: '',
  note: '',
};

export async function loadPaymentConfig() {
  const doc = await fetchDoc(P.supportConfig, { fresh: true }).catch(() => null);
  return { ...DEFAULT_PAYMENT, ...(doc?.payment || doc || {}) };
}

function paymentMessage(payment, expiry, days) {
  const lines = [
    `Hola. Tu insignia azul de Zuma vence el ${formatDate(expiry)}${days !== null ? ` (quedan ${Math.max(0, days)} días)` : ''}.`,
    '',
    `Renovación: $ ${BADGE_PRICE.toLocaleString('es-AR')}/mes.`,
  ];
  if (payment.alias || payment.cvu || payment.holder || payment.bank || payment.note) {
    lines.push('Datos de pago:');
    if (payment.alias) lines.push(`Alias: ${payment.alias}`);
    if (payment.cvu) lines.push(`CVU/CBU: ${payment.cvu}`);
    if (payment.holder) lines.push(`Titular: ${payment.holder}`);
    if (payment.bank) lines.push(`Banco: ${payment.bank}`);
    if (payment.note) lines.push(payment.note);
    lines.push('', 'Cuando pagues, respondé este chat con el comprobante.');
  } else {
    lines.push('El equipo todavía no cargó los datos de pago. Respondé este chat y te los pasamos.');
  }
  return lines.join('\n');
}

/** Envía un mensaje privado como @soporte sin necesitar una sesión de soporte. */
export async function sendSupportMessage(userId, text) {
  const supportId = P.supportUser;
  if (!userId || !text) return false;
  const threadId = threadIdFor(supportId, userId);
  const message = {
    id: newId('m'),
    fromId: supportId,
    text,
    createdAt: nowISO(),
  };
  await queueDoc(P.thread(threadId), (doc) => {
    const data = doc?.thread ? doc : {
      version: 1,
      thread: { id: threadId, memberIds: [supportId, userId], messages: [] },
    };
    data.thread.messages = [...(data.thread.messages || []), { ...message }].slice(-400);
    data.thread.updatedAt = message.createdAt;
    return data;
  }, { delay: 0, message: 'Zuma: aviso de soporte' });

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
  }, { delay: 0, message: 'Zuma: aviso de soporte' });
  await queueDoc(P.inbox(supportId), (doc) => {
    const data = doc && Array.isArray(doc.threads) ? doc : { version: 1, threads: [] };
    const entry = { ...base, withId: userId, unread: 0 };
    data.threads = [entry, ...data.threads.filter((row) => row.threadId !== threadId)].slice(0, 100);
    return data;
  }, { delay: 0, message: 'Zuma: aviso de soporte' });
  return true;
}

/** Revisa una cuenta y manda el recordatorio que corresponda (una vez). */
export async function maybeSendVerificationReminder(userId, payment = null) {
  const doc = await fetchDoc(P.user(userId), { fresh: true }).catch(() => null);
  const user = doc?.user;
  const info = verificationInfo(user);
  if (!user || !info?.active || !info.until) return false;
  const due = reminderThresholds(info);
  if (!due.length) return false;
  const reminder = due[0];
  const config = payment || await loadPaymentConfig();
  const text = paymentMessage(config, info.until, reminder.days);
  await sendSupportMessage(userId, text);

  await queueDoc(P.user(userId), (current) => {
    if (!current?.user) return undefined;
    const value = current.user.verification;
    const base = typeof value === 'string' ? { type: value } : { ...(value || {}) };
    base.type = 'celeste';
    base.reminders = { ...(base.reminders || {}), [reminder.key]: nowISO() };
    return { ...current, user: { ...current.user, verification: base } };
  }, { delay: 0, message: 'Zuma: recordatorio de insignia' });

  const local = state.users.get(userId);
  if (local) {
    const value = local.verification;
    const base = typeof value === 'string' ? { type: value } : { ...(value || {}) };
    base.type = 'celeste';
    base.reminders = { ...(base.reminders || {}), [reminder.key]: nowISO() };
    local.verification = base;
    if (state.me?.id === userId) state.me = local;
  }
  return true;
}

/** Para el panel: revisa a todos los usuarios con insignia activa. */
export async function processVerificationReminders(users) {
  const payment = await loadPaymentConfig().catch(() => DEFAULT_PAYMENT);
  for (const user of users || []) {
    const info = verificationInfo(user);
    if (!info?.active || !info.until) continue;
    if (!reminderThresholds(info).length) continue;
    await maybeSendVerificationReminder(user.id, payment).catch(() => {});
  }
}

/** Para la app: revisa solo la cuenta logueada. */
export async function processOwnVerificationReminder() {
  if (!state.me) return false;
  return maybeSendVerificationReminder(state.me.id).catch(() => false);
}
