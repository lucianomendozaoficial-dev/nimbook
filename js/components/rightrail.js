/* ==========================================================================
   rightrail.js — personas que seguís y sugerencias (columna derecha)
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, followingOf, followSuggestions, mutualFollowers, countFollowers,
} from '../core/store.js';
import { avatarEl } from '../core/ui.js';
import { isOnline } from '../core/auth.js';
import { followButton } from './follow-button.js';

export function mountRightRail() {
  const root = el('aside', { class: 'col-right', 'aria-label': 'Personas y sugerencias' });

  function render() {
    clear(root);
    const me = state.me;
    if (!me) return;

    const following = followingOf(me.id)
      .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)));
    const online = following.filter(isOnline);
    const ordered = [...online, ...following.filter((person) => !isOnline(person))];

    const head = el('div', { class: 'rail-title' },
      el('span', { text: 'Siguiendo' }),
      el('span', { class: 'row gap-4' },
        el('button', {
          class: 'btn-icon', type: 'button', title: 'Buscar personas', 'aria-label': 'Buscar personas',
          onclick: () => { window.location.hash = '/seguidores/todos'; },
        }, icon('search', 18)),
        el('button', {
          class: 'btn-icon', type: 'button', title: 'Ver sugerencias', 'aria-label': 'Ver sugerencias',
          onclick: () => { window.location.hash = '/seguidores/sugerencias'; },
        }, icon('user-plus', 18))));
    root.appendChild(head);

    if (!following.length) {
      root.appendChild(el('div', {
        class: 'muted small', style: { padding: '4px 10px 10px' },
        text: 'Cuando sigas a alguien aparecerá acá.',
      }));
    } else {
      const list = el('div');
      for (const person of ordered.slice(0, 12)) {
        list.appendChild(el('a', {
          class: 'rail-item', href: `#/mensajes?u=${person.id}`,
          title: `Enviar mensaje a ${displayName(person)}`,
        },
        el('span', { class: `presence ${isOnline(person) ? '' : 'offline'}`.trim() },
          avatarEl(person, 'sm'),
          el('span', { class: 'dot' })),
        el('span', { class: 'name', text: displayName(person) })));
      }
      root.appendChild(list);
      if (following.length > 12) {
        root.appendChild(el('a', {
          class: 'rail-item', href: '#/seguidores/siguiendo',
          style: { color: 'var(--brand)', fontWeight: '600' },
        }, el('span', { class: 'name', text: `Ver las ${following.length} personas que seguís` })));
      }
    }

    const suggestions = followSuggestions(me.id, 4);
    if (suggestions.length) {
      root.appendChild(el('div', { class: 'rail-sep' }));
      root.appendChild(el('div', { class: 'rail-title' }, 'Sugerencias para ti'));
      for (const person of suggestions) {
        const mutual = mutualFollowers(me.id, person.id).length;
        const row = el('div', { class: 'rail-item', style: { gap: '10px' } },
          el('a', { href: `#/u/${person.username}` }, avatarEl(person, 'sm')),
          el('div', { class: 'grow', style: { minWidth: '0' } },
            el('a', {
              href: `#/u/${person.username}`, class: 'name',
              style: { fontWeight: '600', display: 'block' },
              text: displayName(person),
            }),
            el('span', {
              class: 'dim tiny',
              text: mutual
                ? `${mutual} seguidor${mutual === 1 ? '' : 'es'} en común`
                : `${countFollowers(person.id)} seguidores`,
            })),
          followButton(person, { onChange: () => render() }));
        root.appendChild(row);
      }
    }

    root.appendChild(el('div', { class: 'rail-sep' }));
    root.appendChild(el('div', {
      class: 'rail-item',
      style: { color: 'var(--text-3)', fontSize: '12.5px', lineHeight: '1.6' },
    }, 'NimbookGR · hecho para compartir con tus amigos'));
  }

  render();
  return { el: root, render };
}
