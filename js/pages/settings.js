/* ==========================================================================
   pages/settings.js — cuenta, apariencia y acerca de
   ========================================================================== */
import { el, clear, longDate } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName } from '../core/store.js';
import { avatarEl, openModal, toast } from '../core/ui.js';
import { openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import { updateProfile, changePassword } from '../core/actions.js';
import { logout } from '../core/auth.js';
import { THEMES, THEME_LABELS, readTheme, setTheme, resolvedTheme } from '../core/theme.js';
import { ValidationError } from '../core/auth.js';

const TABS = [
  { id: 'cuenta', label: 'Mi cuenta', icon: 'user' },
  { id: 'apariencia', label: 'Apariencia', icon: 'moon' },
  { id: 'acerca', label: 'Acerca de', icon: 'info' },
];

function row({ iconName, title, sub, control }) {
  return el('div', { class: 'settings-row' },
    el('span', { class: 'sr-ic' }, icon(iconName, 19)),
    el('div', { class: 'sr-body' },
      el('div', { class: 'sr-title', text: title }),
      sub ? el('div', { class: 'sr-sub', text: sub }) : null),
    control || null);
}

export function settingsPage(tab = 'cuenta') {
  const me = state.me;
  const root = el('div');
  const content = el('div');

  const tabs = el('div', { class: 'tabs' });
  for (const item of TABS) {
    tabs.appendChild(el('a', {
      class: `tab ${tab === item.id ? 'active' : ''}`.trim(),
      href: `#/settings/${item.id}`,
    }, item.label));
  }

  root.append(el('div', { class: 'page-card' },
    el('div', { style: { padding: '16px 16px 0' } },
      el('h1', { text: 'Configuración y privacidad' }),
      el('p', { class: 'muted small mt-4', text: 'Controla tu cuenta, el aspecto de NimbookGR y tu privacidad.' })),
    tabs), content);

  /* -------------------------------- cuenta ------------------------------- */

  function accountTab() {
    const nameInput = el('input', { class: 'input', value: me.name || '', maxlength: '60' });
    const usernameInput = el('input', {
      class: 'input', value: me.username || '', maxlength: '30', autocapitalize: 'none',
    });
    const bioInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '500' });
    bioInput.value = me.bio || '';
    const saveBtn = el('button', { class: 'btn primary', type: 'button' }, 'Guardar cambios');

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      try {
        await updateProfile({
          name: nameInput.value, username: usernameInput.value, bio: bioInput.value,
        });
        toast('Perfil actualizado', { type: 'success' });
      } catch (err) {
        toast(err instanceof ValidationError ? err.message : 'No se pudo guardar.', { type: 'error' });
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar cambios';
      }
    });

    const changePhoto = async (kind) => {
      const files = await openFilePicker();
      if (!files.length) return;
      const problem = validateImageFile(files[0]);
      if (problem) { toast(problem, { type: 'error' }); return; }
      try {
        toast('Subiendo imagen…');
        const record = await uploadImage(files[0], kind, { maxSize: kind === 'covers' ? 2200 : 720 });
        await updateProfile(kind === 'covers' ? { cover: record.path } : { avatar: record.path });
        toast('Imagen actualizada', { type: 'success' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    };

    return el('div', { class: 'page-card' },
      el('div', { class: 'settings-row' },
        avatarEl(me, 'xl'),
        el('div', { class: 'sr-body' },
          el('div', { class: 'sr-title', text: displayName(me) }),
          el('div', { class: 'sr-sub', text: `@${me.username} · desde ${longDate(me.createdAt)}` })),
        el('div', { class: 'row gap-8' },
          el('button', {
            class: 'btn sm', type: 'button', text: 'Cambiar foto',
            onclick: () => changePhoto('avatars'),
          }),
          el('button', {
            class: 'btn sm', type: 'button', text: 'Portada',
            onclick: () => changePhoto('covers'),
          }))),
      el('div', { style: { padding: '16px' } },
        el('div', { class: 'col gap-12' },
          el('div', { class: 'row gap-8' },
            el('div', { class: 'field grow' }, el('label', { text: 'Nombre' }), nameInput),
            el('div', { class: 'field grow' }, el('label', { text: 'Usuario' }), usernameInput)),
          el('div', { class: 'field' }, el('label', { text: 'Biografía' }), bioInput),
          el('div', { class: 'row gap-8' }, saveBtn))),
      row({
        iconName: 'key',
        title: 'Contraseña',
        sub: 'Se guarda cifrada y protegida.',
        control: el('button', {
          class: 'btn sm', type: 'button', text: 'Cambiar contraseña',
          onclick: openChangePassword,
        }),
      }),
      row({
        iconName: 'logout',
        title: 'Cerrar sesión',
        sub: 'Salir de NimbookGR en este dispositivo.',
        control: el('button', {
          class: 'btn sm', type: 'button', text: 'Cerrar sesión',
          onclick: async () => {
            await logout();
            window.location.reload();
          },
        }),
      }));
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

  /* ------------------------------ apariencia ----------------------------- */

  function appearanceTab() {
    const current = readTheme();
    const opts = el('div', { class: 'theme-opts', style: { padding: '16px' } });
    for (const theme of THEMES) {
      const option = el('button', {
        class: `theme-opt ${current === theme ? 'active' : ''}`.trim(),
        type: 'button',
        onclick: () => {
          setTheme(theme);
          document.querySelectorAll('.theme-opt').forEach((node) => node.classList.remove('active'));
          option.classList.add('active');
          toast(`Tema ${THEME_LABELS[theme].toLowerCase()} activado`, { type: 'success' });
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
      opts.appendChild(option);
    }

    return el('div', { class: 'page-card' },
      row({
        iconName: 'moon',
        title: 'Tema de la interfaz',
        sub: `Ahora mismo: ${THEME_LABELS[current]}${current === 'auto' ? ` (${resolvedTheme()})` : ''}`,
      }),
      opts,
      row({
        iconName: 'monitor',
        title: 'Diseño adaptable',
        sub: 'NimbookGR se adapta a móviles, tablets y escritorio automáticamente.',
        control: el('span', { class: 'chip green', text: 'Activo' }),
      }));
  }

  /* -------------------------------- acerca ------------------------------- */

  function aboutTab() {
    return el('div', { class: 'page-card' },
      el('div', { style: { padding: '24px 16px', textAlign: 'center' } },
        el('img', {
          src: 'assets/logo/nimbook-logo-192.png', alt: 'NimbookGR', width: '96', height: '96',
          style: { margin: '0 auto', borderRadius: '50%', boxShadow: 'var(--shadow-sm)' },
        }),
        el('h2', { text: 'NimbookGR', style: { marginTop: '12px' } }),
        el('p', { class: 'muted small', style: { maxWidth: '420px', margin: '6px auto 0' },
          text: 'Tu red social para compartir momentos con tus amigos: publicaciones, historias, grupos y mensajes.' })),
      row({
        iconName: 'info',
        title: 'Versión',
        sub: 'NimbookGR 1.0',
        control: el('span', { class: 'chip', text: '1.0' }),
      }),
      row({
        iconName: 'shield',
        title: 'Privacidad',
        sub: 'Las publicaciones privadas solo las ves tú; las de amigos, solo tus amigos.',
      }),
      row({
        iconName: 'users',
        title: 'Hecho para compartir',
        sub: 'Publicaciones, historias, amigos, grupos y mensajes.',
      }));
  }

  const renderers = {
    cuenta: accountTab,
    apariencia: appearanceTab,
    acerca: aboutTab,
  };

  function render() {
    clear(content);
    content.appendChild((renderers[tab] || accountTab)());
  }

  render();
  return { el: root, onData: () => {} };
}
