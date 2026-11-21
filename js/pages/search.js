import { el, clear, debounce, normalize } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName, searchPeople, relationWith } from '../core/store.js';
import { avatarEl, emptyState } from '../core/ui.js';
import { followButton } from '../components/follow-button.js';
import { navigate, goBack, parseRoute } from '../core/router.js';

export function searchPage(initial = '') {
  const root = el('div');
  let query = initial;

  const input = el('input', {
    type: 'search', placeholder: 'Buscar por nombre, apellido o usuario',
    'aria-label': 'Buscar personas', value: query,
  });
  const results = el('div');

  function setQuery(value) {
    query = value.trim();
    const next = query ? `#/buscar?q=${encodeURIComponent(query)}` : '#/buscar';
    if (window.location.hash !== next) history.replaceState({ nb: true }, '', next);
    render();
  }

  input.addEventListener('input', debounce(() => setQuery(input.value), 200));

  function row(person) {
    const relation = relationWith(state.me?.id, person.id);
    return el('div', { class: 'search-row' },
      el('a', { href: `#/u/${person.username}` }, avatarEl(person, 'md')),
      el('div', { class: 'grow', style: { minWidth: '0' } },
        el('a', { href: `#/u/${person.username}`, class: 'post-name', text: displayName(person) }),
        el('div', { class: 'muted small', text: `@${person.username}` })),
      relation === 'self' ? el('span', { class: 'chip', text: 'Vos' }) : followButton(person));
  }

  function render() {
    clear(results);

    if (!query) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: 'Buscá personas',
          description: 'Por nombre, apellido o usuario. Solo aparecen cuentas de Zuma.',
        })));
      return;
    }

    const people = searchPeople(query, 30);
    if (!people.length) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: `Sin resultados para “${query}”`,
          description: 'Probá con el nombre, el apellido o el usuario.',
        })));
      return;
    }

    const card = el('div', { class: 'page-card' },
      el('div', { class: 'menu-section' }, people.length === 1 ? '1 persona' : `${people.length} personas`));
    for (const person of people) card.appendChild(row(person));
    results.appendChild(card);
  }

  root.append(
    el('div', { class: 'page-back' },
      el('button', {
        class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
      }, icon('arrow-left', 17), 'Volver')),
    el('div', { class: 'page-card', style: { padding: '16px' } },
      el('h1', { text: 'Buscar' }),
      el('p', { class: 'muted small', text: 'Por nombre, apellido o nombre de usuario.' }),
      el('div', { class: 'search-inline', style: { margin: '12px 0 4px' } }, icon('search', 18), input)),
    results,
  );

  render();
  setTimeout(() => input.focus(), 50);
  return { el: root };
}
