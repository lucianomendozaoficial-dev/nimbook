/* ==========================================================================
   pages/notifications.js — sección de notificaciones
   ========================================================================== */
import { el, clear, timeAgo } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName, userById, loadNotifications } from '../core/store.js';
import { avatarEl, emptyState, toast } from '../core/ui.js';
import { markAllNotificationsRead } from '../core/actions.js';
import { goBack } from '../core/router.js';
import { emptyFriendsIllustration } from '../core/illustrations.js';

const ICONS = {
  reaction: 'heart', like: 'thumbsup', comment: 'message', reply: 'reply',
  follow: 'user-plus', share: 'share',
};

function textFor(item) {
  const actor = displayName(userById(item.actorId));
  switch (item.type) {
    case 'reaction': return `${actor} reaccionó a tu publicación.`;
    case 'like': return `${actor} le dio me gusta a tu publicación.`;
    case 'comment': return `${actor} comentó tu publicación.`;
    case 'reply': return `${actor} respondió a tu comentario.`;
    case 'follow': return `${actor} empezó a seguirte.`;
    case 'share': return `${actor} compartió tu publicación.`;
    default: return `${actor} hizo algo nuevo.`;
  }
}

function hrefFor(item) {
  if (item.postId) return `#/p/${item.postId}`;
  const actor = userById(item.actorId);
  if (actor?.username) return `#/u/${actor.username}`;
  return '#/notificaciones';
}

export function notificationsPage() {
  const root = el('div');
  const list = el('div', { class: 'card pad' });

  function render() {
    clear(list);
    const items = state.notifications;

    const head = el('div', { class: 'row between', style: { marginBottom: '8px' } },
      el('h1', { text: 'Notificaciones' }));

    if (items.some((item) => !item.read)) {
      head.appendChild(el('button', {
        class: 'btn soft sm', type: 'button', text: 'Marcar como leídas',
        onclick: async () => {
          try {
            await markAllNotificationsRead();
            render();
          } catch {
            toast('No se pudo guardar', { type: 'error' });
          }
        },
      }));
    }
    list.appendChild(head);

    if (!items.length) {
      list.appendChild(emptyState({
        illustration: emptyFriendsIllustration(),
        title: 'Todavía no hay notificaciones',
        description: 'Cuando alguien reaccione o te siga, lo vas a ver acá.',
      }));
      return;
    }

    const wrap = el('div', { class: 'notif-list' });
    for (const item of items) {
      const avatar = avatarEl(userById(item.actorId), 'md');
      const badge = el('span', { class: 'notif-badge' }, icon(ICONS[item.type] || 'bell', 12));
      const body = el('div', { class: 'n-body' },
        el('div', { class: 'n-text', text: textFor(item) }),
        el('div', { class: 'n-time', text: timeAgo(item.createdAt) }));

      wrap.appendChild(el('a', {
        class: `notif ${item.read ? '' : 'unread'}`.trim(),
        href: hrefFor(item),
      },
      el('span', { class: 'notif-avatar' }, avatar, badge),
      body));
    }
    list.appendChild(wrap);
  }

  render();
  loadNotifications(state.me.id).then(render).catch(() => {});

  return {
    el: el('div', null,
      el('div', { class: 'page-back' },
        el('button', {
          class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
        }, icon('arrow-left', 17), 'Volver')),
      list),
    onData(topic) { if (topic === 'notifications') render(); },
  };
}
