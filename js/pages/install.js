/* ==========================================================================
   pages/install.js — cómo instalar Zuma como aplicación
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  canInstall, promptInstall, isStandalone, isWebView,
} from '../core/pwa.js';
import { toast } from '../core/ui.js';

function platform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function installPage() {
  const root = el('div', { class: 'install-page' });
  const p = platform();
  const native = canInstall();
  const steps = p === 'ios'
    ? [
      ['1', 'Abrí Zuma en Safari', 'La instalación desde Chrome en iPhone no está disponible.'],
      ['2', 'Tocá Compartir', 'Es el botón cuadrado con la flecha hacia arriba.'],
      ['3', 'Elegí “Agregar a pantalla de inicio”', 'Confirmá con Agregar. Zuma va a quedar como una app.'],
    ]
    : p === 'android'
      ? [
        ['1', 'Abrí Zuma en Chrome', 'También funciona en Edge o Samsung Internet.'],
        ['2', 'Abrí el menú de tres puntos', 'Está arriba a la derecha del navegador.'],
        ['3', 'Elegí “Instalar aplicación”', 'Si no aparece, buscá “Agregar a pantalla de inicio”.'],
      ]
      : [
        ['1', 'Abrí Zuma en Chrome o Edge', 'La instalación desde Firefox no está disponible.'],
        ['2', 'Buscá el ícono de instalar', 'Aparece en la barra de direcciones o en el menú.'],
        ['3', 'Confirmá “Instalar”', 'Zuma se abre en su propia ventana, como una app.'],
      ];
  const action = el('button', { class: 'btn primary lg', type: 'button' },
    icon(native ? 'download' : 'info', 18),
    native ? 'Instalar Zuma ahora' : 'Ver pasos para instalar');
  action.addEventListener('click', async () => {
    if (!native) {
      toast('Seguí los pasos de esta página para instalar Zuma.', { type: 'info' });
      return;
    }
    const accepted = await promptInstall();
    if (accepted) toast('¡Listo! Zuma se está instalando.', { type: 'success' });
  });

  root.append(
    el('div', { class: 'install-hero' },
      el('img', { src: 'assets/logo/zuma-logo-128.png', alt: 'Zuma', class: 'install-logo' }),
      el('div', { class: 'gr-section-kicker' }, icon('download', 14), 'Zuma como aplicación'),
      el('h1', { text: 'Instalá Zuma en tu pantalla' }),
      el('p', { text: 'Abrila con un toque, sin buscar la página cada vez. Es la misma cuenta y los mismos datos.' }),
      action),
    el('div', { class: 'install-steps' },
      ...steps.map(([num, title, text]) => el('div', { class: 'install-step' },
        el('span', { class: 'install-step-num', text: num }),
        el('div', null,
          el('div', { class: 'install-step-title', text: title }),
          el('p', { class: 'muted small', text }))))),
    el('div', { class: 'install-note' },
      icon('info', 16),
      el('span', {
        text: isStandalone()
          ? 'Ya estás usando Zuma como aplicación instalada.'
          : isWebView()
            ? 'Estás dentro de un navegador integrado. Para instalar, abrí Zuma en Safari o Chrome.'
            : 'El navegador no permite forzar la instalación: por seguridad siempre hace falta confirmar una vez.',
      })),
  );
  return { el: root, onData() {} };
}
