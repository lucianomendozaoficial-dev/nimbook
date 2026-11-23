/* ==========================================================================
   pages/verification.js — una sola insignia azul de Zuma
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, fullName } from '../core/store.js';
import { openModal, toast } from '../core/ui.js';
import {
  BADGE_PRICE, VERIFICATION_CATEGORIES, categoryLabel,
  verificationInfo, formatDate, daysUntil,
} from '../core/verification.js';
import { verifiedBadge } from '../components/verified-badge.js';
import { requestVerification } from '../core/actions.js';

const money = new Intl.NumberFormat('es-AR');

const BENEFITS = [
  { icon: 'shield', title: 'Insignia azul verificada', text: 'La insignia aparece junto a tu nombre, en tu perfil y en cada publicación.' },
  { icon: 'eye', title: 'Mayor visibilidad', text: 'Tus publicaciones tienen más chances de aparecer en el muro, incluso si las subiste hace un tiempo.' },
  { icon: 'users', title: 'Perfil en sugerencias', text: 'Tu cuenta se incluye entre las personas que Zuma sugiere seguir.' },
  { icon: 'user', title: 'Tu tipo de cuenta', text: 'Mostrá si sos influencer, gamer, político/a, artista, deportista, periodista o marca.' },
  { icon: 'sparkles', title: 'Perfil con estilo verificado', text: 'Tu perfil público se destaca con un estilo azul especial.' },
];

export function verificationPage() {
  const root = el('div', { class: 'verification-page' });
  const me = state.me;
  const info = verificationInfo(me);
  const days = info?.until ? daysUntil(info.until) : null;

  function openRequest() {
    const name = el('input', {
      class: 'input', placeholder: 'Nombre completo', maxlength: '120',
      value: fullName(me) || '',
    });
    const dni = el('input', {
      class: 'input', placeholder: 'DNI', maxlength: '12', inputmode: 'numeric',
    });
    const locality = el('input', {
      class: 'input', placeholder: 'Localidad', maxlength: '90',
      value: me?.location || '',
    });
    const birthDate = el('input', {
      class: 'input', type: 'date', max: new Date().toISOString().slice(0, 10),
    });
    const category = el('select', { class: 'input' },
      el('option', { value: '', text: 'Elegí tu tipo de cuenta' }),
      ...VERIFICATION_CATEGORIES.map((item) => el('option', { value: item.id, text: item.label })));
    const submit = el('button', {
      class: 'btn primary block', type: 'submit', text: 'Enviar solicitud',
    });
    const form = el('form', { class: 'col gap-12' },
      el('div', { class: 'verification-request-price' },
        verifiedBadge({ verification: 'celeste' }, { size: 24, interactive: false }),
        el('div', null,
          el('strong', { text: 'Insignia azul' }),
          el('span', { text: `$ ${money.format(BADGE_PRICE)} / mes` }))),
      el('div', { class: 'verification-form-grid' },
        el('div', { class: 'field' }, el('label', { text: 'Nombre completo' }), name),
        el('div', { class: 'field' }, el('label', { text: 'DNI' }), dni)),
      el('div', { class: 'verification-form-grid' },
        el('div', { class: 'field' }, el('label', { text: 'Localidad' }), locality),
        el('div', { class: 'field' }, el('label', { text: 'Fecha de nacimiento' }), birthDate)),
      el('div', { class: 'field' }, el('label', { text: 'Tipo de cuenta' }), category),
      el('p', { class: 'muted small', text: 'Estos datos se envían automáticamente al chat privado de @soporte. No se muestran en tu perfil: solo se usa el tipo de cuenta y la insignia.' }),
      submit);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Enviando…';
      try {
        await requestVerification({
          fullName: name.value,
          dni: dni.value,
          locality: locality.value,
          birthDate: birthDate.value,
          category: category.value,
        });
        api.close();
        toast('Solicitud enviada a soporte. Te van a responder por chat.', { type: 'success' });
      } catch (err) {
        submit.disabled = false;
        submit.textContent = 'Enviar solicitud';
        toast(err.message || 'No se pudo enviar la solicitud.', { type: 'error' });
      }
    });

    const api = openModal({
      title: 'Solicitar insignia azul',
      size: 'md',
      body: form,
    });
    setTimeout(() => name.focus(), 80);
  }

  const card = el('div', { class: 'verification-single' },
    el('div', { class: 'verification-single-top' },
      el('div', { class: 'verification-seal' },
        verifiedBadge({ verification: 'celeste' }, { size: 64, interactive: false })),
      el('div', { class: 'verification-single-title' },
        el('span', { class: 'verification-kicker', text: 'Insignia única de Zuma' }),
        el('h2', { text: 'Cuenta verificada' }),
        el('p', { text: 'Una sola insignia azul. Identidad confirmada y más herramientas para crecer.' }))),
    el('div', { class: 'verification-price-line' },
      el('strong', { text: `$ ${money.format(BADGE_PRICE)}` }),
      el('span', { text: 'por mes' })),
    el('div', { class: 'verification-benefits' },
      ...BENEFITS.map((benefit) => el('div', { class: 'verification-benefit' },
        el('span', { class: 'verification-benefit-icon' }, icon(benefit.icon, 19)),
        el('div', null,
          el('strong', { text: benefit.title }),
          el('p', { text: benefit.text }))))),
    el('button', {
      class: 'btn primary block verification-cta', type: 'button',
      onclick: openRequest,
    }, icon('shield', 17), info?.active ? 'Solicitar renovación' : 'Solicitar insignia azul'));

  const status = info?.active
    ? el('div', { class: 'page-card verification-status active' },
      verifiedBadge(me, { size: 22, interactive: false }),
      el('div', null,
        el('div', { class: 'strong', text: 'Tu cuenta ya tiene la insignia azul' }),
        el('p', {
          class: 'muted small',
          text: [
            info.category ? `Tipo: ${categoryLabel(info.category)}.` : '',
            info.until ? `Vigente hasta el ${formatDate(info.until)}${days !== null ? ` (${Math.max(0, days)} días)` : ''}.` : 'Sin vencimiento asignado.',
          ].filter(Boolean).join(' '),
        })))
    : info?.expired
      ? el('div', { class: 'page-card verification-status expired' },
        icon('clock', 22),
        el('div', null,
          el('div', { class: 'strong', text: 'Tu insignia venció' }),
          el('p', { class: 'muted small', text: info.until ? `Venció el ${formatDate(info.until)}. Podés solicitar la renovación.` : 'Solicitá la renovación.' })))
      : null;

  root.append(
    el('div', { class: 'page-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Insignia de verificación' }),
        el('p', { class: 'muted small', text: 'Una sola insignia azul para toda la comunidad. Se paga por mes y la asigna el equipo.' }))));
  if (status) root.appendChild(status);
  root.append(
    card,
    el('div', { class: 'page-card verification-note' },
      icon('info', 22),
      el('div', null,
        el('div', { class: 'strong', text: '¿Cómo funciona?' }),
        el('p', {
          text: 'Completás tus datos y elegís tu tipo de cuenta. La solicitud llega al panel y al chat de @soporte; el equipo revisa, coordina el pago y activa la insignia hasta la fecha que corresponda.',
        }))),
    el('div', { class: 'page-card verification-note' },
      icon('lock', 22),
      el('div', null,
        el('div', { class: 'strong', text: 'Tus datos están protegidos' }),
        el('p', {
          text: 'El DNI, la localidad y la fecha de nacimiento solo los ve soporte para verificar tu identidad. En tu perfil se muestra la insignia y el tipo de cuenta, no esos datos.',
        }))));

  return { el: root, onData() {} };
}
