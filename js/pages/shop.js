/* ==========================================================================
   pages/shop.js — Shop: mercado con productos de la gente de Zuma
   ========================================================================== */
import { el, clear, money, timeAgo, copyText } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, userById, shopListings, shopCategoryLabel, shopConditionLabel,
  SHOP_CATEGORIES, SHOP_CONDITIONS, shopItemById, loadShopItem, ensureUsers,
} from '../core/store.js';
import {
  avatarEl, emptyState, openModal, confirmDialog, toast, lightbox, dropdown,
} from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import { createListing, deleteListing, setListingStatus, updateListing } from '../core/actions.js';
import { navigate } from '../core/router.js';
import { playSound } from '../core/sounds.js';

const MAX_PHOTOS = 6;

function formatPhone(value) {
  const digits = String(value || '');
  if (digits.startsWith('549') && digits.length === 13) {
    return `+54 9 ${digits.slice(3, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith('54') && digits.length === 12) {
    return `+54 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

function contactCard(current, mine) {
  const contact = current.contact;
  if (mine || !contact?.type || !contact.value) return null;
  const isWhatsApp = contact.type === 'whatsapp';
  const text = `Hola, vi tu venta en Zuma Shop: ${current.title}`;
  const href = isWhatsApp
    ? `https://wa.me/${contact.value}?text=${encodeURIComponent(text)}`
    : `https://instagram.com/${contact.value}`;
  return el('div', { class: 'shop-contact-card' },
    el('div', { class: 'shop-contact-card-title', text: 'Contacto del vendedor' }),
    el('div', { class: 'shop-contact-card-row' },
      el('a', {
        class: `btn shop-contact-btn ${isWhatsApp ? 'whatsapp' : 'instagram'}`,
        href, target: '_blank', rel: 'noopener noreferrer',
      }, icon(isWhatsApp ? 'whatsapp' : 'instagram', 19),
      isWhatsApp ? 'WhatsApp' : 'Instagram'),
      el('span', {
        class: 'shop-contact-value',
        text: isWhatsApp ? formatPhone(contact.value) : `@${contact.value}`,
      })),
    el('div', { class: 'muted tiny', text: 'También podés escribirle por el chat privado de Zuma.' }));
}

export function listingCard(item) {
  const sold = item.status === 'sold';
  return el('a', {
    class: `shop-card${sold ? ' sold' : ''}`, href: `#/tienda/${item.id}`,
    title: `${item.title} · ${money(item.price, item.currency)}`,
  },
  el('div', { class: 'shop-card-img' },
    item.cover
      ? mediaImg(item.cover, { alt: item.title })
      : el('div', { class: 'shop-noimg' }, icon('shop', 34)),
    sold ? el('span', { class: 'shop-sold', text: 'Vendido' }) : null),
  el('div', { class: 'shop-card-body' },
    el('div', { class: 'shop-price', text: money(item.price, item.currency) }),
    el('div', { class: 'shop-card-title', text: item.title }),
    el('div', { class: 'shop-card-meta' },
      el('span', { text: item.location || 'Sin ubicación' }),
      el('span', { text: ' · ' }),
      el('span', { text: shopConditionLabel(item.condition) || 'Usado' }))));
}

/* ------------------------------ publicar -------------------------------- */

export function openListingForm(existing = null, onDone = null) {
  const me = state.me;
  const editing = Boolean(existing?.id);
  let entries = (existing?.media || []).map((mediaItem) => ({
    path: mediaItem.path, preview: null, type: mediaItem.type || 'image/jpeg',
  }));

  const title = el('input', {
    class: 'input', maxlength: '90', placeholder: 'Ej. Cafetera express Philips',
    value: existing?.title || '',
  });
  const price = el('input', {
    class: 'input', type: 'number', min: '0', step: '1', inputmode: 'numeric',
    placeholder: '0', value: existing?.price ?? '',
  });
  const currency = el('select', { class: 'select' },
    el('option', { value: 'ARS', text: 'Pesos ($)' }),
    el('option', { value: 'USD', text: 'Dólares (US$)' }));
  currency.value = existing?.currency || 'ARS';

  const category = el('select', { class: 'select' },
    ...SHOP_CATEGORIES.map((item) => el('option', { value: item.id, text: item.label })));
  category.value = existing?.category || 'otros';

  const condition = el('select', { class: 'select' },
    ...SHOP_CONDITIONS.map((item) => el('option', { value: item.id, text: item.label })));
  condition.value = existing?.condition || 'usado';

  const location = el('input', {
    class: 'input', maxlength: '60', placeholder: 'Ej. General Rodríguez',
    value: existing?.location || state.me?.location || '',
  });
  const description = el('textarea', {
    class: 'textarea', rows: '4', maxlength: '1500',
    placeholder: 'Contá el estado, si es negociable, cómo se puede retirar…',
  });
  description.value = existing?.description || '';

  /* ------------------------------ contacto ------------------------------ */
  let contactType = existing?.contact?.type || null;
  const contactSwitch = el('button', {
    class: `switch${contactType ? ' on' : ''}`, type: 'button', role: 'switch',
    'aria-checked': contactType ? 'true' : 'false', 'aria-label': 'Agregar contacto',
  });
  const contactOptions = el('div', { class: 'shop-contact-opts' });
  const contactLabel = el('label', { text: 'Número de WhatsApp' });
  const contactInput = el('input', {
    class: 'input', maxlength: '60', value: existing?.contact?.value || '',
    placeholder: 'Ej. 54 9 11 5555 1234',
  });
  const contactBox = el('div', { class: `shop-contact-box${contactType ? '' : ' hide'}` },
    contactOptions,
    el('div', { class: 'field' }, contactLabel, contactInput),
    el('span', {
      class: 'field-hint',
      text: 'Se muestra en la venta para que te contacten directo. Después pueden escribirte por el chat privado.',
    }));

  function paintContact() {
    contactSwitch.classList.toggle('on', Boolean(contactType));
    contactSwitch.setAttribute('aria-checked', contactType ? 'true' : 'false');
    contactBox.classList.toggle('hide', !contactType);
    contactLabel.textContent = contactType === 'instagram' ? 'Usuario de Instagram' : 'Número de WhatsApp';
    contactInput.placeholder = contactType === 'instagram'
      ? 'Ej. @tu.usuario'
      : 'Ej. 54 9 11 5555 1234';
    clear(contactOptions);
    for (const option of [{ id: 'whatsapp', label: 'WhatsApp' }, { id: 'instagram', label: 'Instagram' }]) {
      const active = contactType === option.id;
      contactOptions.appendChild(el('button', {
        class: `shop-contact-opt ${option.id}${active ? ' active' : ''}`.trim(), type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        onclick: () => {
          contactType = option.id;
          paintContact();
          contactInput.focus();
        },
      }, icon(option.id, 20), el('span', { text: option.label })));
    }
  }

  contactSwitch.addEventListener('click', () => {
    contactType = contactType ? null : 'whatsapp';
    paintContact();
    if (contactType) setTimeout(() => contactInput.focus(), 40);
  });

  const thumbs = el('div', { class: 'shop-form-thumbs' });
  const error = el('div', { class: 'field-error hide' });

  function renderThumbs() {
    clear(thumbs);
    entries.forEach((entry, index) => {
      thumbs.appendChild(el('div', { class: 'shop-form-thumb' },
        mediaImg(entry.path || entry.preview, { alt: `Foto ${index + 1}`, eager: true }),
        el('button', {
          class: 'thumb-x', type: 'button', 'aria-label': 'Quitar foto',
          onclick: () => {
            if (entry.entryFile) URL.revokeObjectURL(entry.preview);
            entries.splice(index, 1);
            renderThumbs();
          },
        }, icon('x', 14))));
    });
    if (entries.length < MAX_PHOTOS) {
      thumbs.appendChild(el('button', {
        class: 'compose-add shop-add-photo', type: 'button', 'aria-label': 'Agregar fotos',
        onclick: addPhotos,
      }, icon('camera', 20), el('span', { text: 'Foto' })));
    }
  }

  async function addPhotos() {
    const picked = await openFilePicker({ multiple: true });
    for (const file of picked.slice(0, MAX_PHOTOS - entries.length)) {
      const problem = validateImageFile(file);
      if (problem) { toast(problem, { type: 'error' }); continue; }
      entries.push({ entryFile: file, preview: URL.createObjectURL(file), path: null });
    }
    renderThumbs();
  }

  const submit = el('button', {
    class: 'btn primary block', type: 'button',
    text: editing ? 'Guardar cambios' : 'Publicar en Shop',
  });

  submit.addEventListener('click', async () => {
    error.classList.add('hide');
    const cleanTitle = title.value.trim();
    const amount = Number(price.value);
    if (cleanTitle.length < 4) {
      error.textContent = 'Poné un título de al menos 4 letras.';
      error.classList.remove('hide');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0 || price.value === '') {
      error.textContent = 'Poné un precio válido.';
      error.classList.remove('hide');
      return;
    }
    if (contactType) {
      const value = contactInput.value.trim();
      if (!value) {
        error.textContent = contactType === 'whatsapp'
          ? 'Escribí el número de WhatsApp o desactivá el contacto.'
          : 'Escribí el usuario de Instagram o desactivá el contacto.';
        error.classList.remove('hide');
        return;
      }
      if (contactType === 'whatsapp' && value.replace(/\D/g, '').length < 8) {
        error.textContent = 'Escribí el WhatsApp con código de país (ej. 54 9 11 5555 1234).';
        error.classList.remove('hide');
        return;
      }
      if (contactType === 'instagram' && !/^@?[a-zA-Z0-9._]{2,30}$/.test(value)) {
        error.textContent = 'Escribí un usuario de Instagram válido (sin espacios).';
        error.classList.remove('hide');
        return;
      }
    }

    submit.disabled = true;
    submit.textContent = 'Guardando…';
    try {
      const media = [];
      for (const entry of entries) {
        if (entry.entryFile) {
          const record = await uploadImage(entry.entryFile, 'shop', { maxSize: 1400 });
          media.push({ path: record.path, type: record.type });
        } else if (entry.path) {
          media.push({ path: entry.path, type: entry.type || 'image/jpeg' });
        }
      }

      const payload = {
        title: cleanTitle,
        price: amount,
        currency: currency.value,
        category: category.value,
        condition: condition.value,
        location: location.value,
        description: description.value,
        media,
        contact: contactType ? { type: contactType, value: contactInput.value } : null,
      };

      const item = editing
        ? await updateListing(existing.id, payload)
        : await createListing(payload);

      api.close();
      playSound('send');
      toast(editing ? 'Producto actualizado' : 'Publicado en Shop', { type: 'success' });
      onDone?.(item);
    } catch (err) {
      submit.disabled = false;
      submit.textContent = editing ? 'Guardar cambios' : 'Publicar en Shop';
      error.textContent = err.message || 'No se pudo guardar.';
      error.classList.remove('hide');
    }
  });

  const body = el('div', { class: 'col gap-12' },
    el('div', { class: 'field' },
      el('label', { text: 'Fotos' }),
      thumbs,
      el('span', { class: 'field-hint', text: `Hasta ${MAX_PHOTOS} fotos. La primera es la que se ve en Shop.` })),
    el('div', { class: 'field' }, el('label', { text: 'Producto' }), title),
    el('div', { class: 'row gap-8' },
      el('div', { class: 'field grow' }, el('label', { text: 'Precio' }), price),
      el('div', { class: 'field', style: { width: '150px' } }, el('label', { text: 'Moneda' }), currency)),
    el('div', { class: 'row gap-8' },
      el('div', { class: 'field grow' }, el('label', { text: 'Categoría' }), category),
      el('div', { class: 'field grow' }, el('label', { text: 'Estado' }), condition)),
    el('div', { class: 'field' }, el('label', { text: 'Ubicación' }), location),
    el('div', { class: 'field' }, el('label', { text: 'Descripción' }), description),
    el('div', { class: 'shop-contact-field' },
      el('div', { class: 'shop-contact-head' },
        el('div', { class: 'grow' },
          el('div', { class: 'strong', text: 'Agregar contacto' }),
          el('div', { class: 'muted small', text: 'WhatsApp o Instagram para que te escriban directo.' })),
        contactSwitch),
      contactBox),
    el('p', { class: 'muted small', text: `Vas a publicar como ${displayName(me)}. También pueden escribirte por el chat privado de Zuma.` }),
    error);

  const api = openModal({
    title: editing ? 'Editar producto' : 'Vender algo en Shop',
    body,
    footer: submit,
    size: 'lg',
  });

  renderThumbs();
  paintContact();
  setTimeout(() => title.focus(), 80);
  return api;
}

/* -------------------------------- listado -------------------------------- */

export function shopPage() {
  const root = el('div', { class: 'shop-page' });
  let query = '';
  let category = 'all';

  const grid = el('div', { class: 'shop-grid' });
  const chips = el('div', { class: 'shop-cats' });
  const counter = el('span', { class: 'muted small' });

  const searchInput = el('input', {
    type: 'search', placeholder: 'Buscar productos, marcas o lugares', 'aria-label': 'Buscar en Shop',
  });
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderGrid();
  });

  function renderChips() {
    clear(chips);
    const options = [{ id: 'all', label: 'Todas' }, ...SHOP_CATEGORIES];
    for (const option of options) {
      const active = category === option.id;
      chips.appendChild(el('button', {
        class: `shop-cat${active ? ' active' : ''}`.trim(), type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        text: option.label,
        onclick: () => {
          category = option.id;
          renderChips();
          renderGrid();
        },
      }));
    }
  }

  function renderGrid() {
    clear(grid);
    const items = shopListings({ query, category });
    counter.textContent = items.length === 1
      ? '1 producto'
      : `${items.length} productos`;

    if (!items.length) {
      grid.appendChild(el('div', { class: 'card', style: { gridColumn: '1 / -1' } },
        emptyState({
          iconName: 'shop',
          title: query || category !== 'all' ? 'No encontramos nada con ese filtro' : 'Shop está estrenando',
          description: query || category !== 'all'
            ? 'Probá con otra palabra o mirá todas las categorías.'
            : 'Publicá lo que ya no usás y dejá que tu gente lo encuentre.',
          action: el('div', { class: 'row gap-8 center' },
            (query || category !== 'all')
              ? el('button', {
                class: 'btn', type: 'button', text: 'Ver todo',
                onclick: () => {
                  query = '';
                  category = 'all';
                  searchInput.value = '';
                  renderChips();
                  renderGrid();
                },
              })
              : null,
            el('button', {
              class: 'btn primary', type: 'button', text: 'Vender algo',
              onclick: () => openListingForm(null, (item) => navigate(`/tienda/${item.id}`)),
            })),
        })));
      return;
    }

    for (const item of items) grid.appendChild(listingCard(item));
  }

  root.append(
    el('div', { class: 'page-card shop-toolbar' },
      el('div', { class: 'shop-search-row' },
        el('div', { class: 'search-inline grow' }, icon('search', 18), searchInput),
        counter)),
    chips,
    grid,
    el('button', {
      class: 'shop-fab', type: 'button', 'aria-label': 'Vender algo en Shop',
      onclick: () => openListingForm(null, (item) => navigate(`/tienda/${item.id}`)),
    }, icon('plus', 22), el('span', { class: 'shop-fab-label', text: 'Vender algo' })));

  renderChips();
  renderGrid();

  return {
    el: root,
    onData(topic) { if (topic === 'shop' || topic === 'ready') renderGrid(); },
  };
}

/* -------------------------------- detalle -------------------------------- */

export function shopItemPage(id) {
  const root = el('div');
  let destroyed = false;
  let sellerTried = false;

  function ownerMenu(anchor, current) {
    const sold = current.status === 'sold';
    dropdown(anchor, [
      { icon: 'edit', label: 'Editar producto', onClick: () => openListingForm(current, () => render()) },
      {
        icon: sold ? 'refresh' : 'check',
        label: sold ? 'Marcar como disponible' : 'Marcar como vendido',
        onClick: async () => {
          try {
            await setListingStatus(current.id, sold ? 'available' : 'sold');
            toast(sold ? 'Producto disponible otra vez' : '¡Vendido! Ya no aparece como disponible', { type: 'success' });
            render();
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      },
      { separator: true },
      {
        icon: 'trash',
        label: 'Eliminar producto',
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar este producto?',
            message: 'Deja de aparecer en Shop. No se puede deshacer.',
            confirmText: 'Eliminar', danger: true, iconName: 'trash',
          });
          if (!ok) return;
          try {
            await deleteListing(current.id);
            toast('Producto eliminado', { type: 'success' });
            navigate('/tienda', { replace: true });
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      },
    ], { width: 250 });
  }

  function gallery(current) {
    const media = (current.media || []).filter((entry) => entry && entry.path);
    const paths = media.map((entry) => entry.path);
    const main = el('div', { class: 'shop-gallery-main' });
    const thumbs = el('div', { class: 'shop-thumbs' });
    let index = 0;

    const fallback = () => el('div', { class: 'shop-noimg big' }, icon('shop', 46));

    function paintMain() {
      clear(main);
      if (!paths.length) { main.appendChild(fallback()); return; }
      main.appendChild(mediaImg(paths[index], {
        alt: current.title, eager: true,
        onClick: () => lightbox(paths, index),
      }));
    }

    function paintThumbs() {
      clear(thumbs);
      paths.forEach((path, position) => {
        thumbs.appendChild(el('button', {
          class: `shop-thumb${position === index ? ' active' : ''}`.trim(), type: 'button',
          'aria-label': `Foto ${position + 1}`,
          onclick: () => { index = position; paintMain(); paintThumbs(); },
        }, mediaImg(path, { alt: `Foto ${position + 1}` })));
      });
    }

    paintMain();
    paintThumbs();
    return el('div', { class: 'shop-gallery' },
      main,
      paths.length > 1 ? thumbs : null);
  }

  function detail(current) {
    const me = state.me;
    const mine = current.sellerId === me?.id;
    const seller = userById(current.sellerId);
    const sold = current.status === 'sold';

    const menu = el('button', {
      class: 'btn-icon shop-more', type: 'button', 'aria-label': 'Opciones del producto',
      onclick: (event) => { event.stopPropagation(); ownerMenu(menu, current); },
    }, icon('more-h', 20));

    const actions = el('div', { class: 'shop-actions' });
    if (mine) {
      actions.append(
        el('button', {
          class: 'btn primary', type: 'button',
          onclick: () => openListingForm(current, () => render()),
        }, icon('edit', 16), 'Editar producto'),
        el('button', {
          class: 'btn', type: 'button',
          onclick: async () => {
            try {
              await setListingStatus(current.id, sold ? 'available' : 'sold');
              toast(sold ? 'Producto disponible otra vez' : 'Marcado como vendido', { type: 'success' });
              render();
            } catch (err) { toast(err.message, { type: 'error' }); }
          },
        }, icon(sold ? 'refresh' : 'check', 16), sold ? 'Volver a disponible' : 'Marcar vendido'));
    } else if (seller?.username) {
      actions.append(
        el('button', {
          class: 'btn primary', type: 'button',
          onclick: () => navigate(`/mensajes/${seller.username}`),
        }, icon('message', 16), 'Enviar mensaje'),
        el('a', { class: 'btn', href: `#/u/${seller.username}` }, icon('user', 16), 'Ver perfil'));
    }
    actions.appendChild(el('button', {
      class: 'btn soft', type: 'button',
      onclick: async () => {
        const ok = await copyText(`${location.origin}${location.pathname}#/tienda/${current.id}`);
        toast(ok ? 'Enlace copiado' : 'No se pudo copiar', { type: ok ? 'success' : 'error' });
      },
    }, icon('link', 16), 'Compartir'));

    const info = el('div', { class: 'shop-info-card' },
      el('div', { class: 'row between gap-8' },
        el('div', { class: 'row gap-6 wrap' },
          el('span', { class: 'chip brand', text: shopCategoryLabel(current.category) }),
          el('span', { class: 'chip', text: shopConditionLabel(current.condition) || 'Usado' }),
          sold ? el('span', { class: 'chip red', text: 'Vendido' }) : null),
        mine ? menu : null),
      el('h1', { class: 'shop-detail-title', text: current.title }),
      el('div', { class: 'shop-detail-price', text: money(current.price, current.currency) }),
      el('div', { class: 'shop-detail-meta' },
        icon('map-pin', 14),
        el('span', { text: current.location || 'Sin ubicación' }),
        el('span', { class: 'dot' }),
        el('span', { text: `Publicado ${timeAgo(current.createdAt)}` })),
      actions,
      el('div', { class: 'shop-sep' }),
      el('div', { class: 'shop-seller' },
        seller
          ? el('a', { href: `#/u/${seller.username}` }, avatarEl(seller, 'md'))
          : avatarEl(null, 'md'),
        el('div', { class: 'grow' },
          el('div', { class: 'shop-seller-name', text: displayName(seller) }),
          el('div', { class: 'muted small', text: 'Vendedor en Shop' }))),
      contactCard(current, mine),
      current.description
        ? el('div', { class: 'shop-desc' },
          el('div', { class: 'shop-desc-title', text: 'Descripción' }),
          el('p', { text: current.description }))
        : null);

    const related = shopListings({ includeSold: false })
      .filter((row) => row.id !== current.id)
      .slice(0, 4);

    return el('div', null,
      el('div', { class: 'shop-detail' }, gallery(current), info),
      related.length
        ? el('div', { class: 'shop-related' },
          el('div', { class: 'section-head' },
            el('h2', { text: 'Más en Shop' }),
            el('a', { class: 'link small', href: '#/tienda', text: 'Ver todo' })),
          el('div', { class: 'shop-grid small' },
            ...related.map((row) => listingCard(row))))
        : null);
  }

  function renderLoading() {
    root.append(
      el('div', { class: 'loading-row', style: { padding: '64px' } }, el('span', { class: 'spinner' })));
  }

  function render() {
    if (destroyed) return;
    clear(root);
    const current = shopItemById(id);
    if (!current) {
      root.append(
        el('div', { class: 'card' }, emptyState({
          iconName: 'shop',
          title: 'No encontramos este producto',
          description: 'Puede que la persona lo haya eliminado o vendido.',
          action: el('a', { class: 'btn primary', href: '#/tienda' }, 'Ir a Shop'),
        })));
      return;
    }
    // La ficha completa (descripción y fotos) se lee aparte del índice: hasta
    // que llega no mostramos los botones de edición para no guardar datos de menos.
    if (!fullTried && !state.shopItems.has(id)) {
      renderLoading();
      return;
    }
    root.append(detail(current));

    // La ficha del vendedor puede no estar cargada todavía: se lee aparte.
    if (!sellerTried && current.sellerId && !state.users.has(current.sellerId)) {
      sellerTried = true;
      ensureUsers([current.sellerId]).then(() => { if (!destroyed) render(); }).catch(() => {});
    }
  }

  let fullTried = state.shopItems.has(id);
  render();

  if (!fullTried) {
    loadShopItem(id, { force: true })
      .catch(() => null)
      .then(() => { fullTried = true; render(); });
  }

  return {
    el: root,
    onData(topic) {
      if (topic === 'shop') render();
      if (topic === 'me') render();
    },
    destroy() { destroyed = true; },
  };
}
