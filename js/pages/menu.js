/* ==========================================================================
   pages/menu.js — menú principal como sección (no flotante)
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, countFollowers, countFollowing,
} from '../core/store.js';
import { avatarEl, toast } from '../core/ui.js';
import { logout } from '../core/auth.js';
import { navigate } from '../core/router.js';
import {
  THEMES, THEME_LABELS, readTheme, setTheme,
} from '../core/theme.js';
import { soundsEnabled, setSoundsEnabled, playSound } from '../core/sounds.js';
import { canInstall, promptInstall, isStandalone, onPwaChange } from '../core/pwa.js';

function row({ iconName, title, sub, control, href, danger = false, onClick }) {
  const content = [
    el('span', { class: 'sr-ic', style: danger ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : null },
      icon(iconName, 19)),
    el('div', { class: 'sr-body' },
      el('div', { class: 'sr-title', style: danger ? { color: 'var(--danger)' } : null, text: title }),
      sub ? el('div', { class: 'sr-sub', text: sub }) : null),
    control || ((href || onClick) && !danger ? icon('chevron-right', 18, { cls: 'dim' }) : null),
  ];
  if (href) {
    return el('a', { class: 'settings-row menu-row', href, onclick: onClick }, ...content);
  }
  return el('button', { class: 'settings-row menu-row', type: 'button', onclick: onClick }, ...content);
}

export function menuPage() {
  const me = state.me;
  const root = el('div');
  const content = el('div');
  root.appendChild(content);

  function render() {
    content.replaceChildren();

    // tarjeta de perfil
    content.appendChild(el('div', { class: 'page-card menu-profile' },
      el('a', { class: 'menu-profile-link', href: `#/u/${me.username}` },
        avatarEl(me, 'xl'),
        el('div', { class: 'grow' },
          el('div', { class: 'menu-profile-name', text: displayName(me) }),
          el('div', { class: 'muted small', text: `@${me.username}` }),
          el('div', { class: 'muted small' },
            `${countFollowers(me.id)} seguidores · ${countFollowing(me.id)} siguiendo`)),
        icon('chevron-right', 20, { cls: 'dim' })),
      el('div', { class: 'menu-profile-actions' },
        el('button', {
          class: 'btn', type: 'button',
          onclick: () => navigate(`/u/${me.username}`),
        }, icon('user', 17), 'Mi perfil'),
        el('button', {
          class: 'btn', type: 'button',
          onclick: () => navigate('/ajustes'),
        }, icon('settings', 17), 'Editar') )));

    content.appendChild(el('div', { class: 'menu-grid' },
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Tu actividad'),
        row({
          iconName: 'users', title: 'Seguidores', sub: `${countFollowers(me.id)} personas`,
          href: '#/seguidores',
        }),
        row({
          iconName: 'user-plus', title: 'Siguiendo', sub: `${countFollowing(me.id)} personas`,
          href: '#/seguidores/siguiendo',
        }),
        row({ iconName: 'groups', title: 'Grupos', sub: 'Tus comunidades', href: '#/grupos' }),
        row({ iconName: 'bookmark', title: 'Guardado', sub: 'Lo que guardaste para después', href: '#/guardados' }),
        row({ iconName: 'message', title: 'Mensajes', sub: 'Tus conversaciones', href: '#/mensajes' }),
        row({ iconName: 'bell', title: 'Notificaciones', sub: 'Lo último que pasó', href: '#/notificaciones' }),
      ),
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Personalización'),
        row({
          iconName: 'moon', title: 'Tema', sub: `Ahora: ${THEME_LABELS[readTheme()]}`,
          control: el('div', { class: 'segmented' },
            ...THEMES.map((theme) => el('button', {
              class: `segmented-item ${readTheme() === theme ? 'active' : ''}`.trim(),
              type: 'button', text: THEME_LABELS[theme],
              onclick: (event) => {
                setTheme(theme);
                [...event.currentTarget.parentNode.children].forEach((node) => node.classList.remove('active'));
                event.currentTarget.classList.add('active');
                playSound('open');
              },
            }))),
        }),
        row({
          iconName: soundsEnabled() ? 'volume' : 'volume-x', title: 'Sonidos',
          sub: 'Efectos al reaccionar, comentar y enviar mensajes',
          control: el('button', {
            class: `switch ${soundsEnabled() ? 'on' : ''}`.trim(), type: 'button',
            'aria-label': 'Activar o desactivar sonidos',
            onclick: (event) => {
              const enabled = setSoundsEnabled(!soundsEnabled());
              event.currentTarget.classList.toggle('on', enabled);
              if (enabled) playSound('like');
              render();
            },
          }),
        }),
        canInstall()
          ? row({
            iconName: 'download', title: 'Instalar NimbookGR',
            sub: 'Agregala a tu pantalla de inicio',
            onClick: async () => {
              const accepted = await promptInstall();
              if (accepted) toast('¡Instalada!', { type: 'success' });
            },
          })
          : (isStandalone()
            ? row({
              iconName: 'check', title: 'NimbookGR instalada',
              sub: 'Ya la estás usando como aplicación',
              control: el('span', { class: 'chip green', text: 'Activa' }),
            })
            : null),
        row({
          iconName: 'settings', title: 'Configuración de la cuenta',
          sub: 'Foto, portada, datos y contraseña', href: '#/ajustes',
        }),
        row({
          iconName: 'shield', title: 'Privacidad y seguridad',
          sub: 'Quién puede ver lo que publicás', href: '#/ajustes',
        }),
      ),
      el('div', { class: 'page-card' },
        row({
          iconName: 'logout', title: 'Cerrar sesión', danger: true,
          sub: 'Salir de tu cuenta en este dispositivo',
          onClick: async () => {
            await logout();
            window.location.reload();
          },
        }),
      )));
  }

  render();
  onPwaChange(render);
  return { el: root, onData: render };
}
