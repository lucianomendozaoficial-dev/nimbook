/* ==========================================================================
   pages/search.js — buscador con pestañas, recientes, personas, Shop y grupos
   ========================================================================== */
import { el, clear, debounce, money, formatCount } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, fullName, searchPeople, relationWith, shopListings,
  shopCategoryLabel, followSuggestions,
} from '../core/store.js';
import { avatarEl, emptyState } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import { followButton } from '../components/follow-button.js';
import { verifiedBadge } from '../components/verified-badge.js';
import { parseRoute } from '../core/router.js';

const RECENT_KEY = 'zuma.recientes.v1';
const TABS = [
  { id: 'all', label: 'Todo' },
  { id: 'people', label: 'Personas' },
  { id: 'shop', label: 'Shop' },
  { id: 'groups', label: 'Grupos' },
];

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function highlight(text, query) {
  const source = String(text || '');
  const raw = String(query || '').trim();
  if (!raw) return source;
  const tokens = [...new Set(raw.split(/\s+/).filter((token) => token.length >= 2))];
  if (!tokens.length) return source;
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'ig');
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of source.matchAll(regex)) {
    if (match.index > cursor) fragment.append(source.slice(cursor, match.index));
    fragment.append(el('mark', { class: 'search-highlight', text: match[0] }));
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) fragment.append(source.slice(cursor));
  return fragment;
}

const EXPLORE_FALLBACK = ['Fotografía', 'Mendoza', 'Programación', 'Trekking', 'Música', 'Diseño'];

function exploreTags() {
  const tags = new Set();
  for (const group of state.groups) {
    if (group.category) tags.add(group.category);
  }
  for (const item of state.shopItems.values()) {
    if (item.category) tags.add(shopCategoryLabel(item.category));
  }
  for (const tag of EXPLORE_FALLBACK) tags.add(tag);
  return [...tags].filter(Boolean).slice(0, 8);
}

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(value) {
  const clean = String(value || '').trim();
  if (clean.length < 2) return;
  const list = [clean, ...readRecent().filter((item) => normalize(item) !== normalize(clean))].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

export function searchPage(initial = '') {
  const root = el('div', { class: 'search-page' });
  let query = initial;
  let tab = 'all';
  let recent = readRecent();

  const input = el('input', {
    type: 'search', placeholder: 'Buscá personas, ventas o grupos…',
    'aria-label': 'Buscar', value: query, enterkeyhint: 'search',
  });
  const clearBtn = el('button', {
    class: 'search-clear', type: 'button', 'aria-label': 'Borrar búsqueda',
    onclick: () => {
      input.value = '';
      query = '';
      recent = readRecent();
      setHash('');
      render();
      input.focus();
    },
  }, icon('x', 16));
  const tabsBar = el('div', { class: 'search-tabs' });
  const results = el('div', { class: 'search-results' });

  function setHash(value) {
    const next = value ? `#/buscar?q=${encodeURIComponent(value)}` : '#/buscar';
    if (window.location.hash !== next) history.replaceState({ nb: true }, '', next);
  }

  function setQuery(value, { remember = false } = {}) {
    query = String(value || '').trim();
    if (input.value !== value) input.value = value;
    clearBtn.classList.toggle('hide', !query);
    setHash(query);
    if (remember) {
      saveRecent(query);
      recent = readRecent();
    }
    render();
  }

  // Si el navegador cambia el hash sin recrear la página (por ejemplo al
  // volver atrás o al limpiar la búsqueda), se sincroniza la vista.
  function onHashChange() {
    if (!root.isConnected) return;
    const route = parseRoute();
    if (route.name !== 'search') return;
    const next = route.query.q || '';
    if (next === query) return;
    query = next;
    input.value = next;
    recent = readRecent();
    clearBtn.classList.toggle('hide', !query);
    render();
  }
  window.addEventListener('hashchange', onHashChange);

  input.addEventListener('input', debounce(() => {
    setQuery(input.value);
  }, 150));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setQuery(input.value, { remember: true });
      recent = readRecent();
    }
    if (event.key === 'Escape') {
      input.value = '';
      setQuery('');
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim().length >= 2) {
      saveRecent(input.value);
      recent = readRecent();
    }
  });
  function onKeydown(event) {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    event.preventDefault();
    input.focus();
  }
  document.addEventListener('keydown', onKeydown);

  /* -------------------------------- piezas -------------------------------- */

  function personRow(person) {
    const relation = relationWith(state.me?.id, person.id);
    return el('div', { class: 'search-row search-person' },
      el('a', { href: `#/u/${person.username}` }, avatarEl(person, 'md')),
      el('div', { class: 'grow', style: { minWidth: '0' } },
        el('div', { class: 'name-row' },
          el('a', { href: `#/u/${person.username}`, class: 'post-name' }, highlight(fullName(person) || displayName(person), query)),
          verifiedBadge(person, { size: 15 })),
        el('div', { class: 'search-person-sub' },
          highlight(`@${person.username}`, query),
          person.location ? el('span', { text: ` · ${person.location}` }) : null),
        person.bio ? el('div', { class: 'search-person-bio', text: person.bio }) : null),
      relation === 'self' ? el('span', { class: 'chip', text: 'Vos' }) : followButton(person));
  }

  function productRow(item) {
    return el('a', { class: 'search-row', href: `#/tienda/${item.id}` },
      el('span', { class: 'search-thumb' },
        item.cover ? mediaImg(item.cover, { alt: item.title }) : icon('shop', 20)),
      el('div', { class: 'grow', style: { minWidth: '0' } },
        el('div', { class: 'post-name' }, highlight(item.title, query)),
        el('div', {
          class: 'muted small',
          text: `${money(item.price, item.currency)} · ${shopCategoryLabel(item.category)} · ${item.location || 'Sin ubicación'}`,
        })),
      icon('chevron-right', 18, { cls: 'dim' }));
  }

  function groupRow(group) {
    return el('a', { class: 'search-row', href: `#/grupos/${group.id}` },
      el('span', { class: 'search-thumb' },
        group.cover ? mediaImg(group.cover, { alt: group.name })
          : icon((group.type || 'group') === 'channel' ? 'radio' : 'groups', 20)),
      el('div', { class: 'grow', style: { minWidth: '0' } },
        el('div', { class: 'post-name' }, highlight(group.name, query)),
        el('div', {
          class: 'muted small',
          text: `${formatCount(group.memberIds?.length || 0)} ${(group.type || 'group') === 'channel' ? 'seguidores' : 'miembros'} · ${group.privacy === 'private' ? 'Privado' : 'Público'}`,
        })),
      icon('chevron-right', 18, { cls: 'dim' }));
  }

  function block(title, rows, action) {
    const card = el('div', { class: 'search-block' },
      el('div', { class: 'search-block-head' },
        el('span', { class: 'search-block-title', text: title }),
        action || null),
      ...rows);
    return card;
  }

  function renderTabs(counts) {
    clear(tabsBar);
    for (const item of TABS) {
      const active = tab === item.id;
      const count = counts?.[item.id];
      tabsBar.appendChild(el('button', {
        class: `search-tab${active ? ' active' : ''}`.trim(), type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        onclick: () => { tab = item.id; render(); },
      }, el('span', { text: item.label }),
      count ? el('span', { class: 'search-tab-count', text: String(count) }) : null));
    }
  }

  function renderRecent() {
    const wrap = el('div', { class: 'search-empty' },
      el('div', { class: 'search-empty-ic' }, icon('search', 30)),
      el('h2', { text: 'Buscá en Zuma' }),
      el('p', { class: 'muted small', text: 'Encontrá personas, ventas de Shop y grupos.' }));

    if (recent.length) {
      const chips = el('div', { class: 'recent-chips' });
      for (const value of recent) {
        chips.appendChild(el('button', {
          class: 'recent-chip', type: 'button', text: value,
          onclick: () => setQuery(value, { remember: true }),
        }));
      }
      wrap.append(
        el('div', { class: 'search-block-head', style: { marginTop: '16px' } },
          el('span', { class: 'search-block-title', text: 'Búsquedas recientes' }),
          el('button', {
            class: 'link small', type: 'button', text: 'Borrar',
            onclick: () => {
              recent = [];
              try { localStorage.removeItem(RECENT_KEY); } catch { /* noop */ }
              render();
            },
          })),
        chips);
    }

    const tags = exploreTags();
    if (tags.length) {
      const explore = el('div', { class: 'search-explore' },
        ...tags.map((tag) => el('button', {
          class: 'search-explore-chip', type: 'button',
          onclick: () => setQuery(tag, { remember: true }),
        }, icon('search', 13), el('span', { text: tag }))));
      wrap.append(
        el('div', { class: 'search-block-head', style: { marginTop: '16px' } },
          el('span', { class: 'search-block-title', text: 'Explorar' }),
          el('span', { class: 'muted tiny', text: 'Tocá una categoría' })),
        explore);
    }

    const suggestions = followSuggestions(state.me?.id, 4);
    if (suggestions.length) {
      wrap.appendChild(block('Personas que quizás conozcas',
        suggestions.map(personRow)));
    }
    if (state.groups.length) {
      wrap.appendChild(block('Grupos y canales',
        state.groups.slice(0, 4).map(groupRow)));
    }
    results.appendChild(wrap);
  }

  function render() {
    clear(results);
    clearBtn.classList.toggle('hide', !query);

    if (!query) {
      renderTabs(null);
      renderRecent();
      return;
    }

    const q = normalize(query);
    const people = searchPeople(query, 30);
    const products = shopListings({ query }).slice(0, 12);
    const groups = state.groups
      .filter((group) => normalize(group.name).includes(q)
        || normalize(group.description).includes(q))
      .slice(0, 12);

    renderTabs({
      people: people.length || null,
      shop: products.length || null,
      groups: groups.length || null,
    });

    if (!people.length && !products.length && !groups.length) {
      const tips = exploreTags().slice(0, 5);
      results.appendChild(el('div', { class: 'card search-no-results' },
        emptyState({
          iconName: 'search',
          title: `Sin resultados para “${query}”`,
          description: 'Probá con un nombre, un apellido, un @usuario, una categoría o una ciudad.',
        }),
        tips.length
          ? el('div', { class: 'search-suggestions' },
            el('span', { class: 'muted small', text: 'Intentá con:' }),
            ...tips.map((tag) => el('button', {
              class: 'recent-chip', type: 'button', text: tag,
              onclick: () => setQuery(tag, { remember: true }),
            })))
          : null));
      return;
    }

    const total = people.length + products.length + groups.length;
    results.appendChild(el('div', { class: 'search-summary' },
      el('span', { class: 'strong', text: `${formatCount(total)} ${total === 1 ? 'resultado' : 'resultados'}` }),
      el('span', { class: 'muted small', text: `para “${query}”` })));

    const showPeople = tab === 'all' ? people.slice(0, 4) : people;
    const showProducts = tab === 'all' ? products.slice(0, 3) : products;
    const showGroups = tab === 'all' ? groups.slice(0, 3) : groups;

    if (showPeople.length) {
      results.appendChild(block('Personas', showPeople.map(personRow),
        tab === 'all' && people.length > showPeople.length
          ? el('button', {
            class: 'link small', type: 'button', text: 'Ver todas',
            onclick: () => { tab = 'people'; render(); },
          })
          : null));
    }
    if (showProducts.length) {
      results.appendChild(block('Productos en Shop', showProducts.map(productRow),
        tab === 'all' && products.length > showProducts.length
          ? el('button', {
            class: 'link small', type: 'button', text: 'Ver todos',
            onclick: () => { tab = 'shop'; render(); },
          })
          : null));
    }
    if (showGroups.length) {
      results.appendChild(block('Grupos y canales', showGroups.map(groupRow),
        tab === 'all' && groups.length > showGroups.length
          ? el('button', {
            class: 'link small', type: 'button', text: 'Ver todos',
            onclick: () => { tab = 'groups'; render(); },
          })
          : null));
    }
  }

  root.append(
    el('div', { class: 'page-head search-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Buscar en Zuma' }),
        el('p', { class: 'muted small', text: 'Buscador inteligente: nombres, @usuarios, categorías, ciudades, Shop y grupos.' })),
      el('span', { class: 'search-shortcut', title: 'Atajo para buscar' }, el('kbd', { text: '/' }))),
    el('div', { class: 'page-card search-hero' },
      el('div', { class: 'search-big' },
        icon('search', 20),
        input,
        clearBtn)),
    tabsBar,
    results);

  render();
  setTimeout(() => input.focus(), 50);
  return {
    el: root,
    onData(topic) {
      if (['shop', 'groups', 'follow', 'people', 'feed', 'post', 'user', 'support'].includes(topic)) {
        if (root.isConnected) render();
      }
    },
    destroy() {
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('keydown', onKeydown);
    },
  };
}
