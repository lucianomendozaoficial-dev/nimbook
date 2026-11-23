/* ==========================================================================
   verified-badge.js — insignia única azul de Zuma
   ========================================================================== */
import { el } from '../core/util.js';
import { navigate } from '../core/router.js';
import { verificationType } from '../core/verification.js';

export const VERIFICATION_TYPES = {
  celeste: {
    id: 'celeste',
    label: 'Verificado',
    title: 'Cuenta verificada',
    short: 'Identidad confirmada',
    description: 'La insignia azul confirma que la cuenta es auténtica. Incluye más visibilidad, perfil en sugerencias y la posibilidad de mostrar tu tipo de cuenta.',
    audience: 'Una sola insignia para toda la comunidad',
  },
};

export { verificationType };

export function verifiedLabel(user) {
  return verificationType(user) ? 'Verificado' : '';
}

function sealSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="verified-seal" d="M12 1.7l2.5 2.1 3.2-.5 1.1 3.1 2.9 1.5-1 3.1 1 3.1-2.9 1.5-1.1 3.1-3.2-.5L12 22.3l-2.5-2.1-3.2.5-1.1-3.1-2.9-1.5 1-3.1-1-3.1 2.9-1.5 1.1-3.1 3.2.5z"/>
      <path class="verified-check" d="M8.1 12.2l2.5 2.5 5.3-5.3"/>
    </svg>`;
}

/** Insignia azul de un usuario (o null si no está verificado). */
export function verifiedBadge(user, { size = 16, interactive = true } = {}) {
  if (!verificationType(user)) return null;
  const props = {
    class: 'verified-badge celeste',
    title: 'Cuenta verificada',
    'aria-label': 'Cuenta verificada',
    style: { width: `${size}px`, height: `${size}px` },
  };
  if (interactive) {
    props.type = 'button';
    props.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigate('/verificacion');
    };
  }
  return el(interactive ? 'button' : 'span', props,
    el('span', { class: 'verified-badge-inner', html: sealSvg() }));
}
