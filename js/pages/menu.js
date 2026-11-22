/* ==========================================================================
   pages/menu.js — menú principal (sección)
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName, fullName, countFollowers, countFollowing } from '../core/store.js';
import { avatarEl, openModal, toast } from '../core/ui.js';
import { logout } from '../core/auth.js';
import { deleteAccount } from '../core/actions.js';
import { navigate } from '../core/router.js';
import { canInstall, promptInstall, isStandalone } from '../core/pwa.js';
import { forceUpdate } from '../core/update.js';
import { playSound } from '../core/sounds.js';
import { mediaImg } from '../core/media.js';
import { verifiedBadge } from '../components/verified-badge.js';

function item({
  iconName, color = '', title, sub, href, onClick, danger = false, control = null, badge = null,
}) {
  const content = [
    el('span', {
      class: `menu-ic ${color}`.trim(),
      style: danger ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : null,
    }, icon(iconName, 19)),
    el('div', { class: 'menu-body' },
      el('div', {
        class: 'menu-title',
        style: danger ? { color: 'var(--danger)' } : null,
        text: title,
      }),
      sub ? el('div', { class: 'menu-sub', text: sub }) : null),
    badge ? el('span', { class: 'badge', text: String(badge) }) : null,
    control || ((href || onClick) && !danger
      ? icon('chevron-right', 18, { cls: 'dim' })
      : null),
  ];
  if (href) return el('a', { class: 'menu-row', href, onclick: onClick }, ...content);
  return el('button', { class: 'menu-row', type: 'button', onclick: onClick }, ...content);
}

function section(title, children) {
  return el('div', { class: 'menu-card' },
    title ? el('div', { class: 'menu-card-title', text: title }) : null,
    ...children);
}

export function menuPage() {
  const me = state.me;
  const root = el('div', { class: 'menu-page' });

  /* ---------------------------- eliminar cuenta --------------------------- */

  function openDeleteAccount() {
    const input = el('input', {
      class: 'input', type: 'password', autocomplete: 'current-password',
      placeholder: 'Tu contraseña', 'aria-label': 'Contraseña',
    });
    const error = el('div', { class: 'field-error hide' });
    const confirm = el('button', {
      class: 'btn danger block', type: 'button', text: 'Eliminar mi cuenta',
    });
    const cancel = el('button', {
      class: 'btn block', type: 'button', text: 'Cancelar',
      onclick: () => api.close(),
    });

    const api = openModal({
      title: 'Eliminar mi cuenta',
      body: el('div', { class: 'delete-account' },
        el('div', { class: 'delete-warning' },
          el('span', { class: 'delete-warning-ic' }, icon('alert', 22)),
          el('div', null,
            el('strong', { text: 'Esta acción no se puede deshacer' }),
            el('p', {
              text: 'Se eliminan tu perfil, publicaciones, historias, ventas de Shop, conversaciones y seguidores. No hay forma de recuperarlos.',
            }))),
        el('div', { class: 'field' },
          el('label', { text: 'Confirmá con tu contraseña' }),
          input,
          el('span', { class: 'field-hint', text: 'Es tu última oportunidad para cancelar.' })),
        error),
      footer: el('div', { class: 'col gap-8', style: { width: '100%' } }, confirm, cancel),
      size: 'sm',
    });

    const submit = async () => {
      const value = input.value;
      error.classList.add('hide');
      if (!value) {
        error.textContent = 'Escribí tu contraseña para confirmar.';
        error.classList.remove('hide');
        input.focus();
        return;
      }
      confirm.disabled = true;
      cancel.disabled = true;
      confirm.textContent = 'Eliminando…';
      try {
        await deleteAccount(value);
        api.close();
        await logout();
        window.location.reload();
      } catch (err) {
        confirm.disabled = false;
        cancel.disabled = false;
        confirm.textContent = 'Eliminar mi cuenta';
        error.textContent = err?.message || 'No se pudo eliminar la cuenta.';
        error.classList.remove('hide');
        input.select();
      }
    };

    confirm.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
    });
    setTimeout(() => input.focus(), 100);
  }

  function openInfo(title, text) {
    openModal({
      title,
      body: el('div', { class: 'menu-info' },
        el('p', { text }),
        el('p', { class: 'muted small', text: 'Zuma guarda los datos en tu repositorio de GitHub y los lee por su enlace público.' })),
      size: 'sm',
    });
  }

  /* --------------------------------- hero -------------------------------- */

  const hero = el('div', { class: 'menu-hero' },
    el('div', { class: 'menu-hero-cover' },
      me.cover ? mediaImg(me.cover, { alt: 'Portada', eager: true }) : null),
    el('div', { class: 'menu-hero-body' },
      el('a', { class: 'menu-hero-avatar', href: '#/mi-perfil' }, avatarEl(me, 'xl')),
      el('div', { class: 'menu-hero-info' },
        el('div', { class: 'menu-hero-name-row' },
          el('div', { class: 'menu-hero-name', text: displayName(me) }),
          verifiedBadge(me, { size: 19 })),
        el('div', { class: 'menu-hero-fullname', text: fullName(me) }),
        el('div', { class: 'menu-hero-stats' },
          el('span', { text: `${countFollowers(me.id)} seguidores` }),
          el('span', { text: '·' }),
          el('span', { text: `${countFollowing(me.id)} siguiendo` }))),
      el('div', { class: 'menu-hero-actions' },
        el('button', {
          class: 'btn primary sm', type: 'button',
          onclick: () => navigate('/mi-perfil'),
        }, icon('user', 16), 'Mi perfil'),
        el('a', { class: 'btn soft sm', href: `#/u/${me.username}` }, 'Ver como público'))));

  /* -------------------------------- secciones ----------------------------- */

  root.append(
    hero,

    el('div', { class: 'menu-grid' },
      section('Tu cuenta', [
        item({
          iconName: 'bookmark', color: 'purple', title: 'Guardado',
          sub: 'Lo que guardaste para después', href: '#/guardados',
        }),
        item({
          iconName: 'story', color: 'pink', title: 'Historias',
          sub: 'Lo que pasó en las últimas 24 horas', href: '#/historias',
        }),
        item({
          iconName: 'users', color: 'green', title: 'Seguidores',
          sub: `${countFollowers(me.id)} personas`, href: '#/seguidores',
        }),
        item({
          iconName: 'user-plus', color: 'blue', title: 'Siguiendo',
          sub: `${countFollowing(me.id)} personas`, href: '#/seguidores/siguiendo',
        }),
      ]),

      section('Comunidad', [
        item({
          iconName: 'shop', color: 'orange', title: 'Shop',
          sub: 'Comprá y vendé con tu gente', href: '#/tienda',
        }),
        item({
          iconName: 'message', color: 'blue', title: 'Mensajes',
          sub: state.ui.unreadMessages
            ? `${state.ui.unreadMessages} sin leer`
            : 'Conversaciones privadas',
          href: '#/mensajes',
        }),
        item({
          iconName: 'groups', color: 'teal', title: 'Grupos y canales',
          sub: 'Tus comunidades y canales', href: '#/grupos',
        }),
        item({
          iconName: 'bell', color: 'red', title: 'Notificaciones',
          sub: 'Lo último que pasó', href: '#/notificaciones',
        }),
        item({
          iconName: 'search', color: 'gray', title: 'Buscar',
          sub: 'Personas, ventas y grupos', href: '#/buscar',
        }),
      ]),

      section('Aplicación', [
        item({
          iconName: 'settings', color: 'gray', title: 'Configuración',
          sub: 'Tema, sonidos y animaciones', href: '#/configuracion',
        }),
        item({
          iconName: 'refresh', color: 'blue', title: 'Actualizar Zuma',
          sub: 'Buscar la última versión y recargar',
          onClick: async () => {
            toast('Buscando la última versión…');
            await forceUpdate();
          },
        }),
        item({
          iconName: 'grid', color: 'purple', title: 'Panel de control',
          sub: 'Usuarios, publicaciones y verificaciones',
          href: 'panel.html',
        }),
        canInstall()
          ? item({
            iconName: 'download', color: 'blue', title: 'Instalar Zuma',
            sub: 'Agregala a tu pantalla de inicio',
            onClick: async () => {
              playSound('open');
              const accepted = await promptInstall();
              if (accepted) toast('¡Instalada!', { type: 'success' });
            },
          })
          : (isStandalone()
            ? item({
              iconName: 'check', color: 'green', title: 'Zuma instalada',
              sub: 'Ya la estás usando como aplicación',
              control: el('span', { class: 'chip green', text: 'Activa' }),
            })
            : null),
        item({
          iconName: 'info', color: 'gray', title: 'Acerca de Zuma',
          sub: 'Hecho para compartir con tu gente',
          control: el('span', { class: 'chip', text: 'v2' }),
          onClick: () => openInfo('Acerca de Zuma',
            'Zuma es una red social hecha con JavaScript puro y tu repositorio de GitHub como base de datos. Sin servidores propios: lectura por link público y escritura con tu token.'),
        }),
        item({
          iconName: 'logout', color: 'gray', title: 'Cerrar sesión',
          sub: 'Salir de tu cuenta en este dispositivo',
          onClick: async () => {
            await logout();
            window.location.reload();
          },
        }),
      ]),

      section('Privacidad y cuenta', [
        item({
          iconName: 'shield', color: 'blue', title: 'Insignias de verificación',
          sub: 'Celeste, morada y dorada: qué significa cada una',
          href: '#/verificacion',
        }),
        item({
          iconName: 'shield', color: 'gray', title: 'Privacidad',
          sub: 'Tus datos se guardan en el repositorio de Zuma',
          control: el('span', { class: 'chip', text: 'Info' }),
          onClick: () => openInfo('Privacidad',
            'Tu perfil, publicaciones, ventas e historias viven como archivos JSON en el repositorio de Zuma. Los mensajes privados no están cifrados: se muestran solo dentro de cada conversación, pero alguien con el enlace del repositorio podría abrir el archivo.'),
        }),
        item({
          iconName: 'trash', color: 'red', title: 'Eliminar mi cuenta',
          sub: 'Permanente: no se puede deshacer',
          danger: true,
          onClick: openDeleteAccount,
        }),
      ])),

    el('div', { class: 'menu-foot' },
      el('div', { text: 'Zuma · hecho para compartir' }),
      el('div', { text: 'Privacidad · Condiciones · Cookies' })));

  return { el: root, onData() {} };
}
