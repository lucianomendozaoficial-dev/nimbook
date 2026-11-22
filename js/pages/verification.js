/* ==========================================================================
   pages/verification.js — explicación de las insignias de Zuma
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { VERIFICATION_TYPES, verifiedBadge } from '../components/verified-badge.js';

export function verificationPage() {
  const root = el('div', { class: 'verification-page' });

  const cards = Object.values(VERIFICATION_TYPES).map((info) => el('div', {
    class: `verification-card ${info.id}`,
  },
  verifiedBadge({ verification: info.id }, { size: 56, interactive: false }),
  el('h2', { text: info.title }),
  el('div', { class: 'verification-audience', text: info.audience }),
  el('p', { text: info.description })));

  root.append(
    el('div', { class: 'page-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Insignias de verificación' }),
        el('p', {
          class: 'muted small',
          text: 'Cuando veas una insignia junto a un nombre, tocala para volver a esta explicación.',
        }))),
    el('div', { class: 'verification-grid' }, ...cards),
    el('div', { class: 'page-card verification-note' },
      icon('info', 22),
      el('div', null,
        el('div', { class: 'strong', text: '¿Cómo se consigue?' }),
        el('p', {
          text: 'Las asigna el equipo de Zuma desde el panel de control. No se compran ni se solicitan desde la app. La insignia puede quitarse si la cuenta deja de cumplir los requisitos.',
        }))),
    el('div', { class: 'page-card verification-note' },
      icon('shield', 22),
      el('div', null,
        el('div', { class: 'strong', text: 'Tres niveles, un mismo significado' }),
        el('p', {
          text: 'Las tres insignias confirman que la cuenta es auténtica; el color indica el tipo de vínculo con la comunidad o con el equipo de Zuma.',
        }))));

  return { el: root, onData() {} };
}
