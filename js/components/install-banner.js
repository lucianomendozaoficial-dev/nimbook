/* ==========================================================================
   install-banner.js — alerta fija para instalar Zuma como aplicación
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  canInstall, promptInstall, onPwaChange, isStandalone, isWebView,
} from '../core/pwa.js';
import { toast } from '../core/ui.js';
import { playSound } from '../core/sounds.js';
import { navigate } from '../core/router.js';

export function mountInstallBanner() {
  const root = el('div', {
    class: 'install-banner hide', role: 'alert', 'aria-live': 'polite',
    'aria-label': 'Instalar Zuma',
  });

  const installBtn = el('button', {
    class: 'btn primary sm', type: 'button',
    onclick: async () => {
      playSound('open');
      if (!canInstall()) {
        navigate('/instalar');
        return;
      }
      const accepted = await promptInstall();
      if (accepted) toast('¡Listo! Zuma se está instalando.', { type: 'success' });
      else navigate('/instalar');
    },
  }, icon('download', 16), 'Instalar Zuma');

  const helpBtn = el('button', {
    class: 'btn soft sm ib-help', type: 'button',
    onclick: () => navigate('/instalar'),
  }, 'Cómo instalar');

  root.append(
    el('img', {
      src: 'assets/logo/zuma-logo-128.png',
      alt: 'Zuma', width: '44', height: '44', class: 'ib-logo',
    }),
    el('div', { class: 'ib-text' },
      el('strong', { text: 'Instalá Zuma' }),
      el('span', { text: 'Tenela siempre en tu pantalla, como una app.' })),
    el('div', { class: 'ib-actions' }, helpBtn, installBtn),
  );

  function refresh() {
    const offer = !isStandalone() && !isWebView();
    const show = offer && document.body.dataset.route !== 'storycompose';
    root.classList.toggle('hide', !show);
    document.body.classList.toggle('has-pwa-alert', show);
  }

  onPwaChange(refresh);
  refresh();
  setTimeout(refresh, 1200);
  return { el: root, refresh };
}
