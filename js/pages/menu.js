/* ==========================================================================
   pages/menu.js — menú principal (sección)
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName, countFollowers, countFollowing } from '../core/store.js';
import { avatarEl, toast } from '../core/ui.js';
import { logout } from '../core/auth.js';
import { navigate } from '../core/router.js';
import { canInstall, promptInstall, isStandalone } from '../core/pwa.js';
import { playSound } from '../core/sounds.js';

function row({ iconName, title, sub, href, onClick, danger = false, control = null }) {
  const content = [
    el('span', {
      class: 'sr-ic',
      style: danger ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : null,
    }, icon(iconName, 19)),
    el('div', { class: 'sr-body' },
      el('div', { class: 'sr-title', style: danger ? { color: 'var(--danger)' } : null, text: title }),
      sub ? el('div', { class: 'sr-sub', text: sub }) : null),
    control || ((href || onClick) && !danger ? icon('chevron-right', 18, { cls: 'dim' }) : null),
  ];
  if (href) return el('a', { class: 'settings-row menu-row', href, onclick: onClick }, ...content);
  return el('button', { class: 'settings-row menu-row', type: 'button', onclick: onClick }, ...content);
}

export function menuPage() {
  const me = state.me;
  const root = el('div', { class: 'menu-page' });

  root.append(
    el('div', { class: 'page-card menu-profile' },
      el('a', { class: 'menu-profile-link', href: '#/mi-perfil' },
        avatarEl(me, 'xl'),
        el('div', { class: 'grow' },
          el('div', { class: 'menu-profile-name', text: displayName(me) }),
          el('div', { class: 'muted small', text: `@${me.username}` }),
          el('div', { class: 'muted small' },
            `${countFollowers(me.id)} seguidores · ${countFollowing(me.id)} siguiendo`)),
        icon('chevron-right', 20, { cls: 'dim' }))),

    el('div', { class: 'menu-grid' },
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Tu cuenta'),
        row({
          iconName: 'user', title: 'Mi perfil', sub: 'Así te ve el público',
          href: '#/mi-perfil',
        }),
        row({
          iconName: 'users', title: 'Seguidores', sub: `${countFollowers(me.id)} personas`,
          href: '#/seguidores',
        }),
        row({
          iconName: 'user-plus', title: 'Siguiendo', sub: `${countFollowing(me.id)} personas`,
          href: '#/seguidores/siguiendo',
        }),
        row({ iconName: 'bookmark', title: 'Guardado', sub: 'Lo que guardaste', href: '#/guardados' })),
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Comunidad'),
        row({ iconName: 'groups', title: 'Grupos y canales', sub: 'Tus comunidades y canales', href: '#/grupos' }),
        row({ iconName: 'bell', title: 'Notificaciones', sub: 'Lo último que pasó', href: '#/notificaciones' }),
        row({ iconName: 'search', title: 'Buscar', sub: 'Personas, publicaciones y grupos', href: '#/buscar' })),
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Aplicación'),
        row({
          iconName: 'settings', title: 'Configuración',
          sub: 'Tema, sonidos y animaciones', href: '#/configuracion',
        }),
        canInstall()
          ? row({
            iconName: 'download', title: 'Instalar Zuma',
            sub: 'Agregala a tu pantalla de inicio',
            onClick: async () => {
              playSound('open');
              const accepted = await promptInstall();
              if (accepted) toast('¡Instalada!', { type: 'success' });
            },
          })
          : (isStandalone()
            ? row({
              iconName: 'check', title: 'Zuma instalada',
              sub: 'Ya la estás usando como aplicación',
              control: el('span', { class: 'chip green', text: 'Activa' }),
            })
            : null),
        row({
          iconName: 'logout', title: 'Cerrar sesión', danger: true,
          sub: 'Salir de tu cuenta en este dispositivo',
          onClick: async () => {
            await logout();
            window.location.reload();
          },
        }))),
  );

  return { el: root, onData() {} };
}
