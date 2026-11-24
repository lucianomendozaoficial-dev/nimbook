/* ==========================================================================
   pages/gr.js — GR · Mi Rodríguez: clima, trabajos, alertas y locales
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, loadGr } from '../core/store.js';
import { emptyState, toast } from '../core/ui.js';
import { createPost } from '../core/actions.js';
import { navigate } from '../core/router.js';
import { fetchGeneralRodriguezWeather } from '../core/weather.js';
import { postCard } from '../components/postcard.js';

const SECTIONS = {
  trabajos: {
    title: 'Trabajos', icon: 'briefcase', color: 'blue',
    description: 'Ofertas, búsquedas y changas de la ciudad.',
    hint: 'Contá qué buscás u ofrecés, el rubro y cómo contactarte.',
  },
  alertas: {
    title: 'Alertas', icon: 'bell', color: 'red',
    description: 'Avisos de seguridad, tránsito, servicios y mascotas.',
    hint: 'Publicá una alerta clara, con zona y qué está pasando.',
  },
  locales: {
    title: 'Locales', icon: 'shop', color: 'purple',
    description: 'Comercios, promos y servicios de Rodríguez.',
    hint: 'Mostrá tu local, la promo o el servicio y dónde encontrarte.',
  },
};

function sectionOf(value) {
  return SECTIONS[value] ? value : '';
}

function postsFor(section) {
  return (state.gr || [])
    .filter((post) => post?.gr?.section === section)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* --------------------------------- portada -------------------------------- */

function weatherCard() {
  const card = el('div', { class: 'gr-weather' },
    el('div', { class: 'gr-weather-main' },
      el('div', { class: 'gr-weather-ic' }, icon('cloud-sun', 34)),
      el('div', null,
        el('div', { class: 'gr-weather-temp', text: '—°' }),
        el('div', { class: 'gr-weather-label', text: 'Cargando el clima…' }))),
    el('div', { class: 'gr-weather-side' },
      el('span', { text: 'General Rodríguez' }),
      el('span', { text: 'Actualizando…' })));
  fetchGeneralRodriguezWeather()
    .then((weather) => {
      if (!weather) throw new Error('sin clima');
      clear(card);
      card.append(
        el('div', { class: 'gr-weather-main' },
          el('div', { class: 'gr-weather-ic' }, icon(weather.icon, 38)),
          el('div', null,
            el('div', { class: 'gr-weather-temp', text: `${weather.temp}°` }),
            el('div', { class: 'gr-weather-label', text: weather.label }))),
        el('div', { class: 'gr-weather-side' },
          el('span', { class: 'gr-weather-place' }, icon('map-pin', 13), 'General Rodríguez'),
          el('span', { text: `ST ${weather.feels}° · Máx ${weather.max}° · Mín ${weather.min}°` }),
          el('span', { text: `Humedad ${weather.humidity}% · Viento ${weather.wind} km/h` })),
        el('span', { class: 'gr-weather-updated', text: 'Open-Meteo' }));
    })
    .catch(() => {
      clear(card);
      card.append(
        el('div', { class: 'gr-weather-main' },
          el('div', { class: 'gr-weather-ic' }, icon('cloud-sun', 34)),
          el('div', null,
            el('div', { class: 'gr-weather-temp', text: 'GR' }),
            el('div', { class: 'gr-weather-label', text: 'Clima no disponible' }))),
        el('div', { class: 'gr-weather-side' },
          el('span', { class: 'gr-weather-place' }, icon('map-pin', 13), 'General Rodríguez'),
          el('span', { text: 'Revisá tu conexión y volvé a entrar.' })));
    });
  return card;
}

function quickAccess() {
  const wrap = el('div', { class: 'gr-quick' });
  for (const [id, meta] of Object.entries(SECTIONS)) {
    const count = postsFor(id).length;
    wrap.appendChild(el('a', {
      class: `gr-quick-card gr-${meta.color}`, href: `#/gr/${id}`,
    },
    el('span', { class: 'gr-quick-ic' }, icon(meta.icon, 25)),
    el('span', { class: 'gr-quick-title', text: meta.title }),
    el('span', { class: 'gr-quick-desc', text: meta.description }),
    el('span', { class: 'gr-quick-count', text: count ? `${count} publicaciones` : 'Sé el primero' })));
  }
  return wrap;
}

function renderHome(root) {
  root.append(
    el('section', { class: 'gr-hero' },
      el('div', { class: 'gr-hero-copy' },
        el('div', { class: 'gr-kicker' }, icon('map-pin', 13), 'General Rodríguez · Buenos Aires'),
        el('h1', { class: 'gr-title' }, 'GR', el('span', { text: 'Mi Rodríguez' })),
        el('p', { class: 'gr-lead', text: 'El espacio de la ciudad para encontrar trabajo, enterarte de lo que pasa y descubrir locales.' }),
        el('div', { class: 'gr-hero-actions' },
          el('a', { class: 'btn primary', href: '#/gr/trabajos/publicar' }, icon('plus', 16), 'Publicar en GR'),
          el('a', { class: 'btn soft', href: '#/gr/alertas' }, icon('bell', 16), 'Ver alertas'))),
      weatherCard()),
    quickAccess(),
    el('div', { class: 'gr-latest-head' },
      el('div', null,
        el('div', { class: 'gr-section-kicker', text: 'Movimiento de la ciudad' }),
        el('h2', { text: 'Últimas publicaciones' })),
      el('a', { class: 'gr-link', href: '#/gr/trabajos' }, 'Ver todas', icon('chevron-right', 15))),
  );

  const latest = [...(state.gr || [])]
    .filter((post) => post?.gr)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);
  if (!latest.length) {
    root.appendChild(el('div', { class: 'gr-empty' },
      emptyState({
        title: 'GR está esperando su primera publicación',
        description: 'Publicá una oferta de trabajo, una alerta o tu local. Va a aparecer acá y en el inicio.',
        action: el('a', { class: 'btn primary', href: '#/gr/trabajos/publicar' }, icon('plus', 16), 'Crear la primera'),
      })));
    return;
  }
  const list = el('div', { class: 'col gap-14' });
  for (const post of latest) list.appendChild(postCard(post).el);
  root.appendChild(list);
}

/* --------------------------------- sección -------------------------------- */

function renderSection(root, section) {
  const meta = SECTIONS[section];
  const posts = postsFor(section);
  root.append(
    el('div', { class: 'gr-section-head' },
      el('a', { class: 'gr-back', href: '#/gr' }, icon('arrow-left', 18), 'GR'),
      el('div', { class: 'grow' },
        el('div', { class: 'gr-section-kicker' }, icon(meta.icon, 14), 'GR · Mi Rodríguez'),
        el('h1', { class: 'gr-section-title', text: meta.title }),
        el('p', { class: 'muted', text: meta.description })),
      el('a', { class: 'btn primary', href: `#/gr/${section}/publicar` }, icon('plus', 17), 'Publicar')),
    el('div', { class: 'gr-section-nav' },
      ...Object.entries(SECTIONS).map(([id, item]) => el('a', {
        class: `gr-chip${id === section ? ' active' : ''}`.trim(),
        href: `#/gr/${id}`,
      }, icon(item.icon, 14), item.title, el('span', { class: 'gr-chip-count', text: String(postsFor(id).length) })))),
  );
  if (!posts.length) {
    root.appendChild(el('div', { class: 'gr-empty' },
      emptyState({
        iconName: meta.icon,
        title: `Todavía no hay publicaciones en ${meta.title}`,
        description: meta.hint,
        action: el('a', { class: 'btn primary', href: `#/gr/${section}/publicar` }, icon('plus', 16), 'Publicar la primera'),
      })));
    return;
  }
  const list = el('div', { class: 'col gap-14' });
  for (const post of posts) list.appendChild(postCard(post).el);
  root.appendChild(list);
}

/* ------------------------------- publicar -------------------------------- */

function field(label, input) {
  return el('div', { class: 'field' }, el('label', { text: label }), input);
}

export function grComposePage(sectionValue) {
  const section = sectionOf(sectionValue) || 'trabajos';
  const meta = SECTIONS[section];
  const root = el('div', { class: 'gr-compose-page' });
  const title = el('input', { class: 'input', maxlength: '120', placeholder: 'Título claro y corto' });
  const description = el('textarea', { class: 'textarea', rows: '5', maxlength: '1400', placeholder: meta.hint });
  const contact = el('input', { class: 'input', maxlength: '120', placeholder: 'WhatsApp, teléfono o usuario' });
  const location = el('input', { class: 'input', maxlength: '140', placeholder: 'Zona, dirección o barrio' });
  const extra = el('div', { class: 'gr-fields' });

  if (section === 'trabajos') {
    const mode = el('select', { class: 'select' },
      el('option', { value: 'ofrezco', text: 'Ofrezco trabajo' }),
      el('option', { value: 'busco', text: 'Busco trabajo' }));
    const area = el('input', { class: 'input', maxlength: '80', placeholder: 'Rubro o puesto' });
    const pay = el('input', { class: 'input', maxlength: '80', placeholder: 'Pago o remuneración (opcional)' });
    extra.append(
      field('Modalidad', mode),
      field('Rubro / puesto', area),
      field('Pago', pay));
    extra._inputs = { mode, area, pay };
  } else if (section === 'alertas') {
    const type = el('select', { class: 'select' },
      el('option', { value: 'seguridad', text: 'Seguridad' }),
      el('option', { value: 'transito', text: 'Tránsito' }),
      el('option', { value: 'servicios', text: 'Servicios' }),
      el('option', { value: 'mascotas', text: 'Mascotas' }),
      el('option', { value: 'otro', text: 'Otro' }));
    const address = el('input', { class: 'input', maxlength: '140', placeholder: 'Calle / zona exacta' });
    const urgent = el('label', { class: 'gr-check' },
      el('input', { type: 'checkbox', value: '1' }),
      el('span', { text: 'Marcar como urgente' }));
    extra.append(field('Tipo de alerta', type), field('Dirección', address), urgent);
    extra._inputs = { type, address, urgent: urgent.querySelector('input') };
  } else {
    const category = el('input', { class: 'input', maxlength: '80', placeholder: 'Rubro del local' });
    const hours = el('input', { class: 'input', maxlength: '80', placeholder: 'Horarios de atención' });
    const offer = el('input', { class: 'input', maxlength: '100', placeholder: 'Promo o servicio destacado' });
    extra.append(field('Rubro', category), field('Horarios', hours), field('Promo / servicio', offer));
    extra._inputs = { category, hours, offer };
  }

  const error = el('div', { class: 'gr-form-error hide' });
  const submit = el('button', { class: 'btn primary lg block', type: 'button' },
    icon('send', 17), 'Publicar en GR');

  function metaValues() {
    const values = {};
    const inputs = extra._inputs || {};
    for (const [key, input] of Object.entries(inputs)) {
      if (!input) continue;
      values[key] = input.type === 'checkbox' ? (input.checked ? 'Sí' : 'No') : input.value.trim();
    }
    return values;
  }

  submit.addEventListener('click', async () => {
    const t = title.value.trim();
    const d = description.value.trim();
    if (!t || !d) {
      error.textContent = 'Completá el título y la descripción.';
      error.classList.remove('hide');
      return;
    }
    error.classList.add('hide');
    submit.disabled = true;
    try {
      await createPost({
        text: d,
        gr: {
          section,
          title: t,
          contact: contact.value.trim(),
          location: location.value.trim(),
          meta: metaValues(),
        },
      });
      toast('Publicación de GR creada', { type: 'success' });
      navigate(`/gr/${section}`);
    } catch (err) {
      error.textContent = err.message || 'No se pudo publicar.';
      error.classList.remove('hide');
      submit.disabled = false;
    }
  });

  root.append(
    el('div', { class: 'gr-compose-head' },
      el('a', { class: 'gr-back', href: `#/gr/${section}` }, icon('arrow-left', 18), meta.title),
      el('div', { class: 'grow' },
        el('div', { class: 'gr-section-kicker' }, 'GR · Mi Rodríguez'),
        el('h1', { class: 'gr-section-title', text: `Publicar en ${meta.title}` }),
        el('p', { class: 'muted', text: meta.hint }))),
    el('div', { class: 'card gr-form' },
      el('div', { class: 'gr-form-badge' }, icon(meta.icon, 16), meta.title),
      field('Título', title),
      field('Descripción', description),
      extra,
      el('div', { class: 'row gap-8' },
        el('div', { class: 'field grow' }, el('label', { text: 'Contacto' }), contact),
        el('div', { class: 'field grow' }, el('label', { text: 'Zona' }), location)),
      error,
      submit,
      el('p', { class: 'muted tiny', text: 'La publicación aparece en GR y también en el inicio, identificada con el sello GR.' })));

  return { el: root, onData(topic) { if (topic === 'gr') { /* la vista de publicación no necesita refresco */ } } };
}

/* --------------------------------- página --------------------------------- */

export function grPage(sectionValue = '') {
  const root = el('div', { class: 'gr-page' });
  const section = sectionOf(sectionValue);
  const render = () => {
    clear(root);
    if (section) renderSection(root, section);
    else renderHome(root);
  };
  render();
  if (!state.gr.length) loadGr().then(render).catch(() => {});
  return {
    el: root,
    onData(topic) { if (topic === 'gr' || topic === 'feed') render(); },
  };
}
