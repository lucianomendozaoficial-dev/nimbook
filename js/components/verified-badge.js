/* ==========================================================================
   verified-badge.js — insignias de verificación de Zuma
   ========================================================================== */
import { el } from '../core/util.js';
import { navigate } from '../core/router.js';

export const VERIFICATION_TYPES = {
  celeste: {
    id: 'celeste',
    label: 'Verificado',
    title: 'Cuenta verificada',
    short: 'Identidad confirmada',
    description: 'Para personas verificadas que no son famosas: confirmamos que la cuenta es de quien dice ser.',
    audience: 'Usuarios con identidad comprobada',
  },
  morado: {
    id: 'morado',
    label: 'Figura pública',
    title: 'Figura pública',
    short: 'Influencers, políticos y figuras públicas',
    description: 'Para influencers, políticos, artistas y figuras públicas con presencia reconocida.',
    audience: 'Influencers · políticos · figuras públicas',
  },
  dorado: {
    id: 'dorado',
    label: 'Equipo Zuma',
    title: 'Equipo Zuma y aliados',
    short: 'Equipo, colaboradores y aliados',
    description: 'Para el equipo de Zuma, colaboradores, políticos y aliados que trabajan con el proyecto.',
    audience: 'Equipo Zuma · aliados · colaboradores',
  },
};

export function verificationType(user) {
  const value = user?.verification;
  if (!value) return null;
  const type = typeof value === 'string' ? value : value.type;
  return VERIFICATION_TYPES[type] ? type : null;
}

function sealSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="verified-seal" d="M12 1.7l2.5 2.1 3.2-.5 1.1 3.1 2.9 1.5-1 3.1 1 3.1-2.9 1.5-1.1 3.1-3.2-.5L12 22.3l-2.5-2.1-3.2.5-1.1-3.1-2.9-1.5 1-3.1-1-3.1 2.9-1.5 1.1-3.1 3.2.5z"/>
      <path class="verified-check" d="M8.1 12.2l2.5 2.5 5.3-5.3"/>
    </svg>`;
}

/** Insignia de un usuario (o null si no está verificado). */
export function verifiedBadge(user, { size = 16, interactive = true } = {}) {
  const type = verificationType(user);
  if (!type) return null;
  const info = VERIFICATION_TYPES[type];
  const props = {
    class: `verified-badge ${type}`,
    title: `${info.title} · ${info.short}`,
    'aria-label': `${info.title}: ${info.short}`,
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

export function verifiedLabel(user) {
  const type = verificationType(user);
  return type ? VERIFICATION_TYPES[type].label : '';
}
