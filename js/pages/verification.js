/* ==========================================================================
   pages/verification.js — insignias y solicitud de verificación
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state } from '../core/store.js';
import { openModal, toast } from '../core/ui.js';
import { VERIFICATION_TYPES, verifiedBadge, verificationType } from '../components/verified-badge.js';
import { requestVerification, VERIFICATION_PRICES } from '../core/actions.js';

const money = new Intl.NumberFormat('es-AR');

function priceLabel(type) {
  const price = VERIFICATION_PRICES[type];
  return price ? `$ ${money.format(price)} / mes` : '';
}

export function verificationPage() {
  const root = el('div', { class: 'verification-page' });

  function requestCard(info) {
    const available = Boolean(VERIFICATION_PRICES[info.id]);
    return el('div', { class: `verification-card ${info.id}` },
      verifiedBadge({ verification: info.id }, { size: 56, interactive: false }),
      el('h2', { text: info.title }),
      el('div', { class: 'verification-audience', text: info.audience }),
      el('p', { text: info.description }),
      available
        ? el('div', { class: 'verification-price' },
          el('span', { class: 'verification-price-value', text: priceLabel(info.id) }),
          el('span', { class: 'verification-price-note', text: 'Suscripción mensual' }),
          el('button', {
            class: 'btn primary block', type: 'button',
            onclick: () => openRequest(info.id),
          }, icon('shield', 16), 'Solicitar insignia'))
        : el('div', { class: 'verification-unavailable' },
          el('span', { class: 'chip', text: 'No disponible' }),
          el('p', { class: 'muted small', text: 'Solo por invitación del equipo de Zuma.' })));
  }

  const cards = Object.values(VERIFICATION_TYPES).map(requestCard);
  const me = state.me;
  const current = verificationType(me);

  root.append(
    el('div', { class: 'page-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Insignias de verificación' }),
        el('p', {
          class: 'muted small',
          text: current
            ? `Tu cuenta tiene la insignia ${VERIFICATION_TYPES[current].label}.`
            : 'Pedí la tuya: elegí la insignia, completá tus datos y soporte la revisa.',
        }))),
    current
      ? el('div', { class: 'page-card verification-note' },
        verifiedBadge(me, { size: 22, interactive: false }),
        el('div', null,
          el('div', { class: 'strong', text: `Insignia actual: ${VERIFICATION_TYPES[current].label}` }),
          el('p', { text: 'La insignia puede quitarse si la cuenta deja de cumplir los requisitos.' })))
      : null,
    el('div', { class: 'verification-grid' }, ...cards),
    el('div', { class: 'page-card verification-note' },
      icon('info', 22),
      el('div', null,
        el('div', { class: 'strong', text: '¿Cómo funciona el trámite?' }),
        el('p', {
          text: 'Completás la solicitud con tus datos. Soporte la revisa desde el panel, coordina el pago mensual y activa la insignia. Dorada no está a la venta: es solo para el equipo y sus aliados.',
        }))),
    el('div', { class: 'page-card verification-note' },
      icon('shield', 22),
      el('div', null,
        el('div', { class: 'strong', text: 'Tus datos están protegidos' }),
        el('p', {
          text: 'El DNI, la fecha de nacimiento y la ciudad se usan solo para verificar tu identidad. No se muestran en tu perfil.',
        }))));

  function openRequest(preselected) {
    let type = preselected === 'morado' ? 'morado' : 'celeste';
    const dni = el('input', {
      class: 'input', placeholder: 'DNI', maxlength: '12', autocomplete: 'off',
      inputmode: 'numeric',
    });
    const birthDate = el('input', { class: 'input', type: 'date', max: new Date().toISOString().slice(0, 10) });
    const country = el('input', { class: 'input', placeholder: 'País de residencia', maxlength: '60' });
    const city = el('input', { class: 'input', placeholder: 'Ciudad donde vivís', maxlength: '80' });

    const types = el('div', { class: 'verification-options' });
    const price = el('div', { class: 'verification-form-price' });
    function paintTypes() {
      types.replaceChildren();
      for (const id of ['celeste', 'morado']) {
        const info = VERIFICATION_TYPES[id];
        types.appendChild(el('button', {
          class: `verification-option${type === id ? ' active' : ''}`.trim(),
          type: 'button',
          onclick: () => { type = id; paintTypes(); },
        },
        verifiedBadge({ verification: id }, { size: 22, interactive: false }),
        el('span', { text: info.title }),
        el('small', { text: priceLabel(id) })));
      }
      price.textContent = `${priceLabel(type)} · se renueva cada mes`;
    }
    paintTypes();

    const submit = el('button', {
      class: 'btn primary block', type: 'submit', text: 'Enviar solicitud',
    });
    const form = el('form', { class: 'col gap-12' },
      el('div', { class: 'field' }, el('label', { text: 'Elegí tu insignia' }), types),
      price,
      el('div', { class: 'verification-form-grid' },
        el('div', { class: 'field' }, el('label', { text: 'DNI' }), dni),
        el('div', { class: 'field' }, el('label', { text: 'Fecha de nacimiento' }), birthDate)),
      el('div', { class: 'verification-form-grid' },
        el('div', { class: 'field' }, el('label', { text: 'País de residencia' }), country),
        el('div', { class: 'field' }, el('label', { text: 'Ciudad' }), city)),
      el('p', { class: 'muted small', text: 'La solicitud queda pendiente hasta que soporte confirme el pago y tus datos. El DNI no se muestra en tu perfil.' }),
      submit);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Enviando…';
      try {
        await requestVerification({
          type,
          dni: dni.value,
          birthDate: birthDate.value,
          country: country.value,
          city: city.value,
        });
        api.close();
        toast('Solicitud enviada. Soporte te va a responder.', { type: 'success' });
      } catch (err) {
        submit.disabled = false;
        submit.textContent = 'Enviar solicitud';
        toast(err.message || 'No se pudo enviar la solicitud.', { type: 'error' });
      }
    });

    const api = openModal({
      title: 'Solicitar verificación',
      size: 'md',
      body: form,
    });
    setTimeout(() => dni.focus(), 80);
  }

  return { el: root, onData() {} };
}
