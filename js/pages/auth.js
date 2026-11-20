/* ==========================================================================
   pages/auth.js — bienvenida, registro y acceso
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { register, login } from '../core/auth.js';
import { cryptoAvailable } from '../core/crypto.js';
import { toast, withBusy } from '../core/ui.js';
import { welcomeIllustration } from '../core/illustrations.js';

function brandPanel() {
  return el('div', { class: 'auth-brand' },
    el('div', { class: 'auth-logo' },
      el('img', { src: 'assets/logo/nimbook-logo-128.png', alt: 'NimbookGR', width: '64', height: '64' }),
      el('span', { text: 'NimbookGR' })),
    el('div', { class: 'auth-tagline', text: 'Comparte tus momentos con la gente que quieres.' }),
    el('div', { class: 'auth-illustration', html: welcomeIllustration() }));
}

function field(label, input, hint) {
  return el('div', { class: 'field' },
    el('label', { text: label }),
    input,
    hint ? el('span', { class: 'field-hint', text: hint }) : null);
}

export function authScreen({ onAuthenticated } = {}) {
  let mode = 'login';
  const card = el('div', { class: 'auth-card' });

  function render() {
    clear(card);
    const isLogin = mode === 'login';
    const errorBox = el('div', { class: 'field-error hide' });
    const showError = (message) => {
      errorBox.textContent = message;
      errorBox.classList.remove('hide');
    };

    /* --------------------------------- acceso -------------------------- */
    if (isLogin) {
      const usernameInput = el('input', {
        class: 'input', placeholder: 'Tu usuario', autocomplete: 'username',
        spellcheck: 'false', autocapitalize: 'none',
      });
      const passwordInput = el('input', {
        class: 'input', type: 'password', placeholder: 'Tu contraseña',
        autocomplete: 'current-password',
      });
      const submit = el('button', {
        class: 'btn primary block lg', type: 'button', text: 'Iniciar sesión',
      });

      const doLogin = async () => {
        errorBox.classList.add('hide');
        await withBusy(submit, async () => {
          try {
            const user = await login({ username: usernameInput.value, password: passwordInput.value });
            onAuthenticated?.(user);
          } catch (err) {
            showError(err.message || 'No pudimos entrar. Inténtalo otra vez.');
          }
        }, 'Entrando…');
      };

      for (const input of [usernameInput, passwordInput]) {
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') doLogin(); });
      }
      submit.addEventListener('click', doLogin);

      card.append(
        el('div', { class: 'auth-card-head' },
          el('h2', { text: 'Qué bueno verte' }),
          el('p', { class: 'sub', text: 'Entra con tu usuario y contraseña.' })),
        field('Usuario', usernameInput),
        field('Contraseña', passwordInput),
        errorBox,
        submit,
        el('div', { class: 'auth-sep', text: 'o' }),
        el('button', {
          class: 'btn auth-alt block lg', type: 'button', text: 'Crear una cuenta nueva',
          onclick: () => { mode = 'register'; render(); },
        }),
        el('p', { class: 'auth-legal', text: 'Al entrar aceptas compartir con respeto. NimbookGR es para tus amigos.' }));
      setTimeout(() => usernameInput.focus(), 80);
      return;
    }

    /* -------------------------------- registro ------------------------- */
    const firstName = el('input', {
      class: 'input', placeholder: 'Tu nombre', autocomplete: 'given-name', maxlength: '40',
    });
    const lastName = el('input', {
      class: 'input', placeholder: 'Tu apellido', autocomplete: 'family-name', maxlength: '40',
    });
    const username = el('input', {
      class: 'input', placeholder: 'usuario (sin espacios)', autocomplete: 'username',
      spellcheck: 'false', autocapitalize: 'none', maxlength: '30',
    });
    const password = el('input', {
      class: 'input', type: 'password', placeholder: 'Contraseña (6 o más)',
      autocomplete: 'new-password',
    });
    const birthday = el('input', {
      class: 'input', type: 'date', max: new Date().toISOString().slice(0, 10),
    });
    const whatsapp = el('input', {
      class: 'input', placeholder: 'Ej. 2615551234', inputmode: 'tel', maxlength: '20',
    });
    const instagram = el('input', {
      class: 'input', placeholder: '@tuusuario', spellcheck: 'false', autocapitalize: 'none', maxlength: '40',
    });
    const submit = el('button', {
      class: 'btn primary block lg', type: 'button', text: 'Crear mi cuenta',
    });

    const doRegister = async () => {
      errorBox.classList.add('hide');
      if (!cryptoAvailable()) {
        showError('Tu navegador no permite proteger contraseñas. Abre NimbookGR desde una dirección segura.');
        return;
      }
      await withBusy(submit, async () => {
        try {
          const user = await register({
            firstName: firstName.value,
            lastName: lastName.value,
            username: username.value,
            password: password.value,
            birthday: birthday.value,
            whatsapp: whatsapp.value,
            instagram: instagram.value,
          });
          toast(`¡Bienvenido a NimbookGR, ${user.firstName || user.name.split(' ')[0]}!`, { type: 'success' });
          onAuthenticated?.(user);
        } catch (err) {
          showError(err.message || 'No pudimos crear la cuenta.');
          const fieldName = err.field;
          if (fieldName === 'firstName') firstName.classList.add('error');
          if (fieldName === 'lastName') lastName.classList.add('error');
          if (fieldName === 'username') username.classList.add('error');
          if (fieldName === 'password') password.classList.add('error');
        }
      }, 'Creando tu cuenta…');
    };

    for (const input of [firstName, lastName, username, password, whatsapp, instagram, birthday]) {
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') doRegister(); });
    }
    submit.addEventListener('click', doRegister);

    card.append(
      el('div', { class: 'auth-card-head' },
        el('h2', { text: 'Crea tu cuenta' }),
        el('p', { class: 'sub', text: 'Es gratis y toma menos de un minuto.' })),
      el('div', { class: 'auth-row' },
        field('Nombre', firstName),
        field('Apellido', lastName)),
      field('Usuario', username, 'Así te van a encontrar tus amigos.'),
      field('Contraseña', password),
      field('Fecha de nacimiento', birthday, 'Opcional. Se muestra solo el día y el mes.'),
      el('div', { class: 'auth-divider' },
        icon('sparkles', 16),
        el('span', { text: 'Para que te contacten (opcional)' })),
      el('div', { class: 'auth-row' },
        field('WhatsApp', whatsapp),
        field('Instagram', instagram)),
      errorBox,
      submit,
      el('p', {
        class: 'auth-legal',
        text: 'Tu foto de perfil la puedes poner después, desde tu cuenta. El WhatsApp y el Instagram solo los verán las personas de tu perfil.',
      }),
      el('div', { class: 'auth-sep', text: 'o' }),
      el('button', {
        class: 'btn block lg', type: 'button', text: 'Ya tengo una cuenta',
        onclick: () => { mode = 'login'; render(); },
      }));
    setTimeout(() => firstName.focus(), 80);
  }

  render();
  return el('div', { class: 'auth' },
    el('div', { class: 'auth-wrap' }, brandPanel(), card));
}

/** Pantalla previa mientras se cargan los datos. */
export function bootScreen(message = 'Cargando…') {
  return el('div', { class: 'auth' },
    el('div', { class: 'auth-wrap', style: { gridTemplateColumns: '1fr' } },
      el('div', { class: 'auth-card', style: { textAlign: 'center', alignItems: 'center' } },
        el('img', {
          src: 'assets/logo/nimbook-logo-128.png', alt: 'NimbookGR',
          width: '72', height: '72', style: { margin: '0 auto', borderRadius: '50%' },
        }),
        el('h2', { text: 'NimbookGR', style: { marginTop: '10px' } }),
        el('div', { class: 'center', style: { padding: '10px 0' } }, el('span', { class: 'spinner big' })),
        el('p', { class: 'auth-loading', text: message }))));
}
