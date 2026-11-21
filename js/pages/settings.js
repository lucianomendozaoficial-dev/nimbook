/* ==========================================================================
   pages/settings.js — mi cuenta, personalización y acerca de
   ========================================================================== */
import { el, clear, longDate, formatCount } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName, countFollowers, countFollowing } from '../core/store.js';
import { avatarEl, openModal, toast } from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import { updateProfile, changePassword } from '../core/actions.js';
import { logout } from '../core/auth.js';
import {
  THEMES, THEME_LABELS, readTheme, setTheme, resolvedTheme,
  ACCENTS, readAccent, setAccent,
} from '../core/theme.js';
import { soundsEnabled, setSoundsEnabled, playSound } from '../core/sounds.js';
import { canInstall, promptInstall, isStandalone } from '../core/pwa.js';
import { editProfileModal } from './profile.js';
import { ValidationError } from '../core/auth.js';

const TABS = [
  { id: 'cuenta', label: 'Mi cuenta' },
  { id: 'apariencia', label: 'Personalización' },
  { id: 'acerca', label: 'Acerca de' },
];

function row({ iconName, title, sub, control, onClick, danger = false }) {
  const tag = onClick ? 'button' : 'div';
  return el(tag, {
    class: 'settings-row',
    type: onClick ? 'button' : null,
    onclick: onClick || null,
    style: { textAlign: 'left', width: '100%' },
  },
  el('span', {
    class: 'sr-ic',
    style: danger ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : null,
  }, icon(iconName, 19)),
  el('div', { class: 'sr-body' },
    el('div', { class: 'sr-title', style: danger ? { color: 'var(--danger)' } : null, text: title }),
    sub ? el('div', { class: 'sr-sub', text: sub }) : null),
  control || null);
}

function field(label, input, hint) {
  return el('div', { class: 'field' },
    el('label', { text: label }),
    input,
    hint ? el('span', { class: 'field-hint', text: hint }) : null);
}

export function settingsPage(tab = 'cuenta') {
  const me = state.me;
  const root = el('div');
  const content = el('div');

  const tabs = el('div', { class: 'tabs' });
  for (const item of TABS) {
    tabs.appendChild(el('a', {
      class: `tab ${tab === item.id ? 'active' : ''}`.trim(),
      href: `#/ajustes${item.id === 'cuenta' ? '' : `/${item.id}`}`,
    }, item.label));
  }

  root.append(el('div', { class: 'page-card' },
    el('div', { style: { padding: '16px 16px 0' } },
      el('h1', { text: tab === 'apariencia' ? 'Personalización' : tab === 'acerca' ? 'Acerca de' : 'Mi cuenta' }),
      el('p', { class: 'muted small mt-4', text: 'Tu perfil, el aspecto de NimbookGR y tu privacidad.' })),
    tabs), content);

  /* ------------------------------- mi cuenta ----------------------------- */

  function accountTab() {
    const nameInput = el('input', { class: 'input', value: me.name || '', maxlength: '60' });
    const usernameInput = el('input', {
      class: 'input', value: me.username || '', maxlength: '30', autocapitalize: 'none',
    });
    const bioInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '500' });
    bioInput.value = me.bio || '';
    const whatsappInput = el('input', {
      class: 'input', value: me.whatsapp || '', maxlength: '20', inputmode: 'tel',
      placeholder: 'Ej. 2615551234',
    });
    const instagramInput = el('input', {
      class: 'input', value: me.instagram ? `@${me.instagram}` : '', maxlength: '40',
      spellcheck: 'false', autocapitalize: 'none', placeholder: '@tuusuario',
    });
    const birthdayInput = el('input', { class: 'input', type: 'date', value: me.birthday || '' });
    const cityInput = el('input', { class: 'input', value: me.location || '', maxlength: '60' });
    const workInput = el('input', { class: 'input', value: me.work || '', maxlength: '80' });
    const eduInput = el('input', { class: 'input', value: me.education || '', maxlength: '80' });

    const saveBtn = el('button', { class: 'btn primary', type: 'button' }, 'Guardar cambios');

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      try {
        await updateProfile({
          name: nameInput.value,
          username: usernameInput.value,
          bio: bioInput.value,
          whatsapp: whatsappInput.value,
          instagram: instagramInput.value,
          birthday: birthdayInput.value,
          location: cityInput.value,
          work: workInput.value,
          education: eduInput.value,
        });
        playSound('like');
        toast('Perfil actualizado', { type: 'success' });
      } catch (err) {
        playSound('error');
        toast(err instanceof ValidationError ? err.message : 'No se pudo guardar.', { type: 'error' });
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar cambios';
      }
    });

    const pickPhoto = async (kind) => {
      const files = await openFilePicker();
      if (!files.length) return;
      const problem = validateImageFile(files[0]);
      if (problem) { toast(problem, { type: 'error' }); return; }
      try {
        toast('Subiendo imagen…');
        const record = await uploadImage(files[0], kind, { maxSize: kind === 'covers' ? 2200 : 720 });
        await updateProfile(kind === 'covers' ? { cover: record.path } : { avatar: record.path });
        toast('Imagen actualizada', { type: 'success' });
        clear(content);
        content.appendChild(accountTab());
      } catch (err) { toast(err.message, { type: 'error' }); }
    };

    const coverStyle = me.cover
      ? { backgroundImage: `url("${mediaImg(me.cover).src}")` }
      : { background: 'linear-gradient(135deg, var(--brand), #7c3aed)' };

    const hero = el('div', { class: 'account-hero' },
      el('div', { class: 'account-cover', style: coverStyle },
        el('button', {
          class: 'account-cover-btn', type: 'button',
          onclick: () => pickPhoto('covers'),
        }, icon('camera', 15), 'Cambiar portada')),
      el('div', { class: 'account-hero-body' },
        el('button', {
          class: 'account-avatar', type: 'button', 'aria-label': 'Cambiar foto de perfil',
          onclick: () => pickPhoto('avatars'),
        },
        avatarEl(me, 'xxl'),
        el('span', { class: 'account-avatar-badge' }, icon('camera', 16))),
        el('div', { class: 'account-hero-info' },
          el('h2', { text: displayName(me) }),
          el('a', { class: 'muted small', href: `#/u/${me.username}`, text: `@${me.username}` }),
          el('div', { class: 'account-stats' },
            el('span', { text: `${formatCount(countFollowers(me.id))} seguidores` }),
            el('span', { text: '·' }),
            el('span', { text: `${formatCount(countFollowing(me.id))} siguiendo` }),
            el('span', { text: '·' }),
            el('span', { text: `Desde ${longDate(me.createdAt)}` }))),
        el('div', { class: 'account-hero-actions' },
          el('button', {
            class: 'btn primary', type: 'button',
            onclick: () => editProfileModal(me, () => render()),
          }, icon('edit', 16), 'Editar perfil'),
          el('button', {
            class: 'btn', type: 'button', text: 'Ver mi perfil',
            onclick: () => { window.location.hash = `/u/${me.username}`; },
          }, icon('user', 16)))));

    const form = el('div', { class: 'page-card account-form' },
      el('div', { class: 'menu-section' }, 'Datos personales'),
      el('div', { style: { padding: '0 16px' } },
        el('div', { class: 'col gap-12' },
          el('div', { class: 'row gap-8' },
            field('Nombre', nameInput),
            field('Usuario', usernameInput)),
          field('Biografía', bioInput, 'Una frase corta que te describa.'),
          el('div', { class: 'row gap-8' },
            field('WhatsApp', whatsappInput),
            field('Instagram', instagramInput)),
          el('div', { class: 'row gap-8' },
            field('Fecha de nacimiento', birthdayInput),
            field('Ciudad', cityInput)),
          el('div', { class: 'row gap-8' },
            field('Trabajo', workInput),
            field('Estudios', eduInput)),
          el('div', { class: 'row gap-8', style: { paddingBottom: '16px' } }, saveBtn))));

    return el('div', { class: 'account-layout' },
      hero,
      form,
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Seguridad'),
        row({
          iconName: 'key', title: 'Contraseña',
          sub: 'Cambiala cuando quieras',
          control: el('button', {
            class: 'btn sm', type: 'button', text: 'Cambiar',
            onclick: openChangePassword,
          }),
        }),
        row({
          iconName: 'logout', title: 'Cerrar sesión', danger: true,
          sub: 'Salir de este dispositivo',
          control: el('button', {
            class: 'btn sm', type: 'button', text: 'Salir',
            onclick: async () => {
              await logout();
              window.location.reload();
            },
          }),
        })));
  }

  function openChangePassword() {
    const currentInput = el('input', {
      class: 'input', type: 'password', placeholder: 'Contraseña actual', autocomplete: 'current-password',
    });
    const newInput = el('input', {
      class: 'input', type: 'password', placeholder: 'Nueva contraseña', autocomplete: 'new-password',
    });
    const repeatInput = el('input', {
      class: 'input', type: 'password', placeholder: 'Repite la nueva contraseña', autocomplete: 'new-password',
    });
    const error = el('div', { class: 'field-error hide' });
    const api = openModal({
      title: 'Cambiar contraseña',
      body: el('div', { class: 'col gap-12' },
        currentInput, newInput, repeatInput, error),
      footer: el('button', {
        class: 'btn primary block', type: 'button', text: 'Guardar contraseña',
        onclick: async (event) => {
          const button = event.currentTarget;
          error.classList.add('hide');
          if (newInput.value !== repeatInput.value) {
            error.textContent = 'Las contraseñas nuevas no coinciden.';
            error.classList.remove('hide');
            return;
          }
          button.disabled = true;
          try {
            await changePassword(currentInput.value, newInput.value);
            api.close();
            toast('Contraseña actualizada', { type: 'success' });
          } catch (err) {
            button.disabled = false;
            error.textContent = err instanceof ValidationError ? err.message : 'No se pudo cambiar.';
            error.classList.remove('hide');
          }
        },
      }, 'Guardar contraseña'),
      size: 'sm',
    });
  }

  /* ----------------------------- personalización ------------------------- */

  function appearanceTab() {
    const currentTheme = readTheme();
    const themeOpts = el('div', { class: 'theme-opts', style: { padding: '4px 16px 16px' } });
    for (const theme of THEMES) {
      const option = el('button', {
        class: `theme-opt ${currentTheme === theme ? 'active' : ''}`.trim(),
        type: 'button',
        onclick: () => {
          setTheme(theme);
          playSound('open');
          document.querySelectorAll('.theme-opt').forEach((node) => node.classList.remove('active'));
          option.classList.add('active');
          toast(`Tema ${THEME_LABELS[theme].toLowerCase()}`, { type: 'success' });
        },
      },
      el('span', {
        class: 'theme-swatch',
        style: {
          background: theme === 'dark' ? '#18191a'
            : theme === 'light' ? '#f0f2f5'
              : 'linear-gradient(90deg,#f0f2f5 50%,#18191a 50%)',
        },
      }),
      el('span', { text: THEME_LABELS[theme] }));
      themeOpts.appendChild(option);
    }

    const accentRow = el('div', { class: 'accent-row' });
    for (const accent of ACCENTS) {
      accentRow.appendChild(el('button', {
        class: `accent-dot ${readAccent() === accent.id ? 'active' : ''}`.trim(),
        type: 'button', title: accent.label, 'aria-label': `Color ${accent.label}`,
        style: { background: accent.color },
        onclick: (event) => {
          setAccent(accent.id);
          playSound('reaction');
          [...event.currentTarget.parentNode.children].forEach((node) => node.classList.remove('active'));
          event.currentTarget.classList.add('active');
        },
      }));
    }

    return el('div', null,
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Tema'),
        el('div', { style: { padding: '0 16px' } },
          el('p', { class: 'muted small', text: `Ahora mismo: ${THEME_LABELS[currentTheme]}${currentTheme === 'auto' ? ` (${resolvedTheme()})` : ''}` })),
        themeOpts,
        row({
          iconName: 'sun', title: 'Color de acento',
          sub: 'Cambiá el azul por el color que más te guste',
          control: accentRow,
        }),
        row({
          iconName: soundsEnabled() ? 'volume' : 'volume-x',
          title: 'Sonidos',
          sub: 'Efectos al reaccionar, comentar y enviar mensajes',
          control: el('button', {
            class: `switch ${soundsEnabled() ? 'on' : ''}`.trim(),
            type: 'button', 'aria-label': 'Activar o desactivar sonidos',
            onclick: (event) => {
              const enabled = setSoundsEnabled(!soundsEnabled());
              event.currentTarget.classList.toggle('on', enabled);
              if (enabled) playSound('like');
              render();
            },
          }),
        })),
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Aplicación'),
        canInstall()
          ? row({
            iconName: 'download', title: 'Instalar NimbookGR',
            sub: 'Acceso directo desde tu pantalla de inicio',
            control: el('button', {
              class: 'btn sm primary', type: 'button', text: 'Instalar',
              onclick: async () => {
                const accepted = await promptInstall();
                if (accepted) toast('¡Instalada!', { type: 'success' });
                render();
              },
            }),
          })
          : row({
            iconName: isStandalone() ? 'check' : 'info',
            title: isStandalone() ? 'NimbookGR está instalada' : 'Instalación',
            sub: isStandalone()
              ? 'Ya la estás usando como aplicación'
              : 'Abrila desde el navegador y usá “Agregar a la pantalla de inicio”.',
            control: isStandalone() ? el('span', { class: 'chip green', text: 'Activa' }) : null,
          }),
        row({
          iconName: 'monitor', title: 'Diseño adaptable',
          sub: 'Se adapta a móviles, tablets y escritorio automáticamente',
          control: el('span', { class: 'chip green', text: 'Activo' }),
        })));
  }

  /* -------------------------------- acerca ------------------------------- */

  function aboutTab() {
    return el('div', { class: 'page-card' },
      el('div', { class: 'about-hero' },
        el('img', {
          src: 'assets/logo/nimbook-logo-192.png', alt: 'NimbookGR', width: '96', height: '96',
        }),
        el('h2', { text: 'NimbookGR' }),
        el('p', { class: 'muted small' },
          'Tu red social para compartir momentos: publicaciones, historias, grupos y mensajes.')),
      row({
        iconName: 'info', title: 'Versión',
        sub: 'NimbookGR 2.0',
        control: el('span', { class: 'chip', text: '2.0' }),
      }),
      row({
        iconName: 'shield', title: 'Privacidad',
        sub: 'Elegís quién puede ver cada publicación: todos, tus seguidores o solo vos.',
      }),
      row({
        iconName: 'users', title: 'Hecho para compartir',
        sub: 'Seguí a quien te interese y aparecerá en tu muro.',
      }));
  }

  const renderers = { cuenta: accountTab, apariencia: appearanceTab, acerca: aboutTab };

  function render() {
    clear(content);
    content.appendChild((renderers[tab] || accountTab)());
  }

  render();
  return { el: root, onData: () => {} };
}
