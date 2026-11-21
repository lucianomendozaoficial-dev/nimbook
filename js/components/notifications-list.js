/* ==========================================================================
   notifications-list.js — piezas compartidas de notificaciones
   ========================================================================== */
import { el, timeAgo } from '../core/util.js';
import { icon } from '../core/icons.js';
import { avatarEl, REACTIONS } from '../core/ui.js';
import { userById } from '../core/store.js';

export const NOTIF_ICON = {
  like: { name: 'thumbsup', cls: 'like' },
  reaction: { name: 'heart', cls: 'like' },
  comment: { name: 'message', cls: 'comment' },
  reply: { name: 'reply', cls: 'comment' },
  follow: { name: 'user-plus', cls: 'friend' },
  friend_request: { name: 'user-plus', cls: 'friend' },
  friend_accept: { name: 'user-check', cls: 'friend' },
  share: { name: 'share', cls: 'share' },
  group_post: { name: 'groups', cls: 'comment' },
  welcome: { name: 'sparkles', cls: 'friend' },
};

export function notificationLabel(notification) {
  const actor = userById(notification.actorId);
  const name = actor?.name || 'Alguien';
  switch (notification.type) {
    case 'like': return `${name} le dio me gusta a tu publicación.`;
    case 'reaction': {
      const label = REACTIONS[notification.reaction]?.label || 'reaccionó';
      return `${name} reaccionó con ${REACTIONS[notification.reaction]?.emoji || '❤️'} a tu publicación (${label}).`;
    }
    case 'comment': return `${name} comentó tu publicación.`;
    case 'reply': return `${name} respondió a tu comentario.`;
    case 'follow': return `${name} empezó a seguirte.`;
    case 'friend_request': return `${name} te envió una solicitud de amistad.`;
    case 'friend_accept': return `${name} aceptó tu solicitud de amistad.`;
    case 'share': return `${name} compartió tu publicación.`;
    case 'group_post': return `${name} publicó en un grupo al que perteneces.`;
    case 'welcome': return notification.text || '¡Bienvenido a NimbookGR!';
    default: return notification.text || `${name} hizo algo nuevo.`;
  }
}

export function notificationHref(notification) {
  if (notification.postId) return `#/p/${notification.postId}`;
  if (notification.type === 'follow' || notification.type === 'friend_accept'
    || notification.type === 'welcome' || notification.type === 'friend_request') {
    const actor = userById(notification.actorId);
    return actor ? `#/u/${actor.username}` : '#/notificaciones';
  }
  if (notification.groupId) return `#/grupos/${notification.groupId}`;
  return '#/notificaciones';
}

export function notificationItem(notification, { compact = false } = {}) {
  const actor = userById(notification.actorId);
  const meta = NOTIF_ICON[notification.type] || NOTIF_ICON.like;
  const item = el('a', {
    class: `notif ${notification.read ? '' : 'unread'}`.trim(),
    href: notificationHref(notification),
    style: compact ? { padding: '8px 10px' } : null,
  },
  el('span', { class: 'n-avatar' },
    actor
      ? avatarEl(actor, compact ? 'sm' : 'lg')
      : avatarEl({ name: 'Nimbook' }, compact ? 'sm' : 'lg'),
    el('span', { class: `n-icon ${meta.cls}` }, icon(meta.name, 11))),
  el('span', { class: 'n-body' },
    el('span', { text: notificationLabel(notification) }),
    el('span', { class: 'n-time', text: timeAgo(notification.at) })),
  notification.read ? null : el('span', { class: 'n-unread-dot' }));
  return item;
}
