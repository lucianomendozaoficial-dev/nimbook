/* ==========================================================================
   install-banner.js — aviso para instalar NimbookGR como aplicación
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  canInstall, isDismissed, dismissInstall, promptInstall, onPwaChange,
} from '../core/pwa.js';
import { toast } from '../core/ui.js';
import { playSound } from '../core/sounds.js';

export function mountInstallBanner() {
  const root = el('div', { class: 'install-banner hide', role: 'dialog', 'aria-label': 'Instalar NimbookGR' });

  const close = el('button', {
    class: 'ib-close', type: 'button', 'aria-label': 'Ahora no',
    onclick: () => {
      dismissInstall();
      root.classList.add('hide');
    },
  }, icon('x', 16));

  const installBtn = el('button', {
    class: 'btn primary sm', type: 'button',
    onclick: async () => {
      playSound('open');
      const accepted = await promptInstall();
      root.classList.add('hide');
      if (accepted) toast('¡Listo! NimbookGR se está instalando.', { type: 'success' });
    },
  }, icon('download', 16), 'Instalar');

  root.append(
    el('img', {
      src: 'assets/logo/nimbook-logo-128.png',
      alt: 'NimbookGR', width: '44', height: '44', class: 'ib-logo',
    }),
    el('div', { class: 'ib-text' },
      el('strong', { text: 'Instalá NimbookGR' }),
      el('span', { text: 'Acceso directo desde tu pantalla de inicio, como una app.' })),
    installBtn,
    close,
  );

  function refresh() {
    const show = canInstall() && !isDismissed();
    if (!show) {
      root.classList.add('hide');
      return;
    }
    if (!root.dataset.shown) {
      root.dataset.shown = '1';
      setTimeout(() => {
        if (canInstall() && !isDismissed()) root.classList.remove('hide');
      }, 5000);
    }
  }

  onPwaChange(refresh);
  refresh();
  return { el: root, refresh };
}
