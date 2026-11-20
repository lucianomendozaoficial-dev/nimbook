/* ==========================================================================
   pages/notifications.js — centro de notificaciones
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state } from '../core/store.js';
import { emptyState, toast, confirmDialog } from '../core/ui.js';
import { markAllNotificationsRead, clearNotifications } from '../core/actions.js';
import { notificationItem } from '../components/notifications-list.js';

export function notificationsPage() {
  const root = el('div');
  const list = el('div', { style: { padding: '6px' } });

  const markBtn = el('button', {
    class: 'btn soft sm', type: 'button',
    onclick: async () => {
      try {
        await markAllNotificationsRead();
        toast('Todo marcado como leído', { type: 'success' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    },
  }, icon('check', 16), 'Marcar como leídas');

  const clearBtn = el('button', {
    class: 'btn ghost sm', type: 'button', 'aria-label': 'Borrar notificaciones',
    onclick: async () => {
      const ok = await confirmDialog({
        title: '¿Borrar todas las notificaciones?',
        message: 'Esta acción no se puede deshacer.',
        confirmText: 'Borrar todas', danger: true, iconName: 'trash',
      });
      if (!ok) return;
      try {
        await clearNotifications();
        toast('Notificaciones borradas', { type: 'success' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    },
  }, icon('trash', 18));

  const header = el('div', {
    class: 'row between', style: { padding: '14px 16px', borderBottom: '1px solid var(--line-soft)' },
  },
  el('h1', { text: 'Notificaciones' }),
  el('div', { class: 'row gap-6' }, markBtn, clearBtn));

  root.append(el('div', { class: 'page-card' }, header, list));

  function render() {
    clear(list);
    const items = state.notifications;
    markBtn.disabled = !items.some((n) => !n.read);
    if (!items.length) {
      list.appendChild(emptyState({
        iconName: 'bell',
        title: 'No tienes notificaciones',
        description: 'Cuando alguien reaccione, comente o te envíe una solicitud, lo verás aquí.',
      }));
      return;
    }
    for (const notification of items) {
      const node = notificationItem(notification);
      node.addEventListener('click', () => {
        if (!notification.read) {
          // marcar como leída en segundo plano
          import('../core/actions.js').then(({ markAllNotificationsRead }) => {
            markAllNotificationsRead().catch(() => {});
          });
        }
      });
      list.appendChild(node);
    }
  }

  render();
  return {
    el: root,
    onData: render,
  };
}
