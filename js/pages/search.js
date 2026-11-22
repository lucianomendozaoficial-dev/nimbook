import { el, clear, debounce, money } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, fullName, searchPeople, relationWith, shopListings, shopCategoryLabel,
} from '../core/store.js';
import { avatarEl, emptyState } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import { followButton } from '../components/follow-button.js';
import { goBack } from '../core/router.js';

export function searchPage(initial = '') {
  const root = el('div');
  let query = initial;

  const input = el('input', {
    type: 'search', placeholder: 'Buscar personas, productos o usuarios',
    'aria-label': 'Buscar', value: query,
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
        el('div', { class: 'muted small', text: fullName(person) })),
      relation === 'self' ? el('span', { class: 'chip', text: 'Vos' }) : followButton(person));
  }

  function productRow(item) {
    return el('a', { class: 'search-row', href: `#/tienda/${item.id}` },
      el('span', { class: 'group-mini' },
        item.cover ? mediaImg(item.cover, { alt: item.title }) : icon('shop', 20)),
      el('div', { class: 'grow', style: { minWidth: '0' } },
        el('div', { class: 'post-name', text: item.title }),
        el('div', {
          class: 'muted small',
          text: `${money(item.price, item.currency)} · ${shopCategoryLabel(item.category)} · ${item.location || 'Sin ubicación'}`,
        })),
      icon('chevron-right', 18, { cls: 'dim' }));
  }

  function render() {
    clear(results);

    if (!query) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: 'Buscá personas y productos',
          description: 'Por nombre, apellido o usuario. También en las publicaciones de Shop.',
          action: el('a', { class: 'btn soft', href: '#/tienda' }, 'Ir a Shop'),
        })));
      return;
    }

    const people = searchPeople(query, 30);
    const products = shopListings({ query }).slice(0, 6);

    if (!people.length && !products.length) {
      results.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'search',
          title: `Sin resultados para “${query}”`,
          description: 'Probá con el nombre, el apellido, el usuario o el nombre de un producto.',
        })));
      return;
    }

    if (people.length) {
      const card = el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, people.length === 1 ? '1 persona' : `${people.length} personas`));
      for (const person of people) card.appendChild(row(person));
      results.appendChild(card);
    }

    if (products.length) {
      const shopCard = el('div', { class: 'page-card' },
        el('div', { class: 'menu-section' }, 'Productos en Shop'));
      for (const item of products) shopCard.appendChild(productRow(item));
      results.appendChild(shopCard);
    }
  }

  root.append(
    el('div', { class: 'page-back' },
      el('button', {
        class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
      }, icon('arrow-left', 17), 'Volver')),
    el('div', { class: 'page-card', style: { padding: '16px' } },
      el('h1', { text: 'Buscar' }),
      el('p', { class: 'muted small', text: 'Personas, usuarios y productos de Shop.' }),
      el('div', { class: 'search-inline', style: { margin: '12px 0 4px' } }, icon('search', 18), input)),
    results,
  );

  render();
  setTimeout(() => input.focus(), 50);
  return { el: root };
}
