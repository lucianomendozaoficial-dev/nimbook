/* ==========================================================================
   pages/auth.js — pantalla de acceso y registro
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { login, register, ValidationError, validateUsername } from '../core/auth.js';
import { isUsernameAvailable } from '../core/actions.js';
import { welcomeIllustration } from '../core/illustrations.js';
import { playSound } from '../core/sounds.js';

function field(label, input, hint) {
  return el('div', { class: 'field' },
    el('label', { text: label }),
    input,
    hint ? el('span', { class: 'field-hint', text: hint }) : null);
}

export function authScreen({ onAuthenticated }) {
  const root = el('div', { class: 'auth' });
  let mode = 'login';

  const card = el('div', { class: 'auth-card' });

  function render() {
    clear(card);

    if (mode === 'login') {
      const username = el('input', {
        class: 'input', placeholder: 'Tu usuario', autocapitalize: 'none', autocomplete: 'username',
      });
      const password = el('input', {
        class: 'input', type: 'password', placeholder: 'Tu contraseña', autocomplete: 'current-password',
      });
      const error = el('div', { class: 'field-error hide' });
      const submit = el('button', { class: 'btn primary block lg', type: 'submit', text: 'Iniciar sesión' });

      const form = el('form', { class: 'col gap-12' },
        field('Usuario', username),
        field('Contraseña', password),
        error,
        submit,
        el('div', { class: 'auth-divider' }, el('span', { text: 'o' })),
        el('button', {
          class: 'btn success block lg', type: 'button', text: 'Crear una cuenta nueva',
          onclick: () => { mode = 'register'; render(); },
        }),
        el('p', { class: 'auth-legal' },
          'Al entrar aceptás compartir con respeto. Zuma es para tus amigos.'));

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.classList.add('hide');
        submit.disabled = true;
        submit.textContent = 'Entrando…';
        try {
          await login(username.value, password.value);
          playSound('like');
          onAuthenticated?.();
        } catch (err) {
          submit.disabled = false;
          submit.textContent = 'Iniciar sesión';
          error.textContent = err instanceof ValidationError ? err.message : 'No pudimos entrar. Probá de nuevo.';
          error.classList.remove('hide');
          playSound('error');
        }
      });

      card.append(
        el('h2', { class: 'auth-title', text: 'Qué bueno verte' }),
        el('p', { class: 'auth-sub', text: 'Entrá con tu usuario y contraseña.' }),
        form);
      setTimeout(() => username.focus(), 40);
      return;
    }

    const firstName = el('input', { class: 'input', placeholder: 'Tu nombre', maxlength: '40', autocomplete: 'given-name' });
    const lastName = el('input', { class: 'input', placeholder: 'Tu apellido', maxlength: '40', autocomplete: 'family-name' });
    const username = el('input', {
      class: 'input', placeholder: 'usuario (sin espacios)', autocapitalize: 'none', maxlength: '30',
    });
    const password = el('input', {
      class: 'input', type: 'password', placeholder: 'Contraseña (6 o más)', autocomplete: 'new-password',
    });
    const error = el('div', { class: 'field-error hide' });
    const hint = el('span', { class: 'field-hint' });
    const submit = el('button', { class: 'btn primary block lg', type: 'submit', text: 'Crear mi cuenta' });

    let checkTimer = null;
    username.addEventListener('input', () => {
      clearTimeout(checkTimer);
      hint.className = 'field-hint';
      hint.textContent = 'Así te van a encontrar tus amigos.';
      const value = username.value.trim();
      if (value.length < 3) return;
      checkTimer = setTimeout(async () => {
        const result = await isUsernameAvailable(value);
        if (username.value.trim() !== value) return;
        if (result.ok) {
          hint.className = 'field-hint ok';
          hint.textContent = '¡Está disponible!';
        } else if (result.reason === 'taken') {
          hint.className = 'field-hint bad';
          hint.textContent = 'Ese usuario ya está en uso.';
        }
      }, 420);
    });

    const form = el('form', { class: 'col gap-12' },
      el('div', { class: 'row gap-8' },
        el('div', { class: 'field grow' }, el('label', { text: 'Nombre' }), firstName),
        el('div', { class: 'field grow' }, el('label', { text: 'Apellido' }), lastName)),
      el('div', { class: 'field' },
        el('label', { text: 'Usuario' }),
        username,
        hint),
      field('Contraseña', password, 'Después podés cambiarla cuando quieras.'),
      error,
      submit,
      el('button', {
        class: 'btn block', type: 'button', text: 'Ya tengo una cuenta',
        onclick: () => { mode = 'login'; render(); },
      }),
      el('p', { class: 'auth-legal' },
        'Tu foto, portada y datos los completás después desde tu perfil.'));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.classList.add('hide');
      const problem = validateUsername(username.value);
      if (problem) {
        error.textContent = problem;
        error.classList.remove('hide');
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Creando tu cuenta…';
      try {
        await register({
          firstName: firstName.value,
          lastName: lastName.value,
          username: username.value,
          password: password.value,
        });
        playSound('follow');
        onAuthenticated?.();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = 'Crear mi cuenta';
        error.textContent = err instanceof ValidationError ? err.message : 'No pudimos crear la cuenta.';
        error.classList.remove('hide');
        playSound('error');
      }
    });

    card.append(
      el('h2', { class: 'auth-title', text: 'Crea tu cuenta' }),
      el('p', { class: 'auth-sub', text: 'Es gratis y toma menos de un minuto.' }),
      form);
    setTimeout(() => firstName.focus(), 40);
  }

  render();

  root.append(
    el('div', { class: 'auth-panel' },
      el('div', { class: 'auth-logo' },
        el('img', { src: 'assets/logo/zuma-logo-128.png', alt: 'Zuma', width: '60', height: '60' }),
        el('span', { text: 'Zuma' })),
      el('p', { class: 'auth-tagline', text: 'Comparte tus momentos con la gente que querés.' }),
      el('div', { class: 'auth-illustration', html: welcomeIllustration() }),
      el('div', { class: 'auth-points' },
        el('div', { class: 'auth-point' }, icon('users', 18), 'Seguí a tus amigos'),
        el('div', { class: 'auth-point' }, icon('heart', 18), 'Reaccioná a sus momentos'),
        el('div', { class: 'auth-point' }, icon('image', 18), 'Compartí tus fotos'))),
    card,
  );

  return root;
}
