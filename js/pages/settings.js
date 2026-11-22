/* ==========================================================================
   pages/settings.js — configuración: tema, sonidos y animaciones
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { THEMES, THEME_LABELS, readTheme, setTheme, resolvedTheme } from '../core/theme.js';
import { soundsEnabled, setSoundsEnabled, playSound } from '../core/sounds.js';
import { readReduced, setReduced } from '../core/motion.js';
import { toast } from '../core/ui.js';

function switchRow({ iconName, title, sub, value, onChange }) {
  const button = el('button', {
    class: `switch ${value ? 'on' : ''}`.trim(), type: 'button',
    'aria-label': `Activar o desactivar ${title}`,
    onclick: () => {
      const next = !button.classList.contains('on');
      button.classList.toggle('on', next);
      onChange(next);
    },
  });
  return el('div', { class: 'settings-row' },
    el('span', { class: 'sr-ic' }, icon(iconName, 19)),
    el('div', { class: 'sr-body' },
      el('div', { class: 'sr-title', text: title }),
      el('div', { class: 'sr-sub', text: sub })),
    button);
}

export function settingsPage() {
  const root = el('div');
  const content = el('div', { class: 'col gap-16' });
  let theme = readTheme();

  function render() {
    clear(content);

    const themeOpts = el('div', { class: 'theme-opts' });
    for (const id of THEMES) {
      const option = el('button', {
        class: `theme-opt ${theme === id ? 'active' : ''}`.trim(), type: 'button',
        onclick: () => {
          theme = id;
          setTheme(id);
          playSound('open');
          toast(`Tema ${THEME_LABELS[id].toLowerCase()}`, { type: 'success' });
          render();
        },
      },
      el('span', {
        class: 'theme-swatch',
        style: {
          background: id === 'dark' ? '#18191a'
            : id === 'light' ? '#f0f2f5'
              : 'linear-gradient(90deg,#f0f2f5 50%,#18191a 50%)',
        },
      }),
      el('span', { text: THEME_LABELS[id] }));
      themeOpts.appendChild(option);
    }

    content.append(
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Apariencia'),
        el('div', { style: { padding: '0 16px 8px' } },
          el('p', { class: 'muted small' },
            `Ahora mismo: ${THEME_LABELS[theme]}${theme === 'auto' ? ` (${resolvedTheme()})` : ''}`)),
        el('div', { style: { padding: '0 16px 16px' } }, themeOpts),
        switchRow({
          iconName: soundsEnabled() ? 'volume' : 'volume-x',
          title: 'Sonidos',
          sub: 'Efectos al reaccionar, comentar y publicar',
          value: soundsEnabled(),
          onChange: (next) => {
            setSoundsEnabled(next);
            if (next) playSound('like');
          },
        }),
        switchRow({
          iconName: 'zap',
          title: 'Reducir animaciones',
          sub: 'Movimientos más suaves y discretos',
          value: readReduced(),
          onChange: (next) => {
            setReduced(next);
            toast(next ? 'Animaciones reducidas' : 'Animaciones normales');
          },
        })),
      el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Sobre la cuenta'),
        el('div', { class: 'settings-row' },
          el('span', { class: 'sr-ic' }, icon('edit', 19)),
          el('div', { class: 'sr-body' },
            el('div', { class: 'sr-title', text: 'Personalizar mi perfil' }),
            el('div', { class: 'sr-sub', text: 'Foto, portada, datos y contacto' })),
          el('a', { class: 'btn sm', href: '#/mi-perfil', text: 'Abrir' })),
      ),
    );
  }

  root.append(el('div', { class: 'page-head' },
    el('div', { class: 'grow' },
      el('h1', { text: 'Configuración' }),
      el('p', { class: 'muted small', text: 'Tema de la app, sonidos y animaciones.' }))), content);

  render();
  return { el: root, onData() {} };
}
