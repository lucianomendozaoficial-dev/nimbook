/* ==========================================================================
   shop-feed-card.js — una venta de Shop que aparece en el muro
   ========================================================================== */
import { el, money, timeAgo } from '../core/util.js';
import { icon } from '../core/icons.js';
import { mediaImg } from '../core/media.js';
import { shopCategoryLabel, userById, displayName } from '../core/store.js';

export function shopFeedCard(item) {
  const seller = userById(item.sellerId);
  const sold = item.status === 'sold';
  const href = `#/tienda/${item.id}`;

  return el('article', { class: 'card shop-feed', 'data-shop-id': item.id },
    el('div', { class: 'shop-feed-head' },
      el('img', {
        class: 'shop-feed-avatar', src: 'assets/logo/zuma-logo-64.png',
        alt: 'Zuma Shop', width: '40', height: '40',
      }),
      el('div', { class: 'who' },
        el('div', { class: 'post-name', text: 'Zuma Shop' }),
        el('div', { class: 'post-meta' },
          el('span', { text: 'Venta de la comunidad' }),
          el('span', { class: 'dot' }),
          el('span', { text: timeAgo(item.createdAt) }))),
      el('span', { class: 'chip brand shop-feed-chip' }, icon('tag', 13), 'Shop')),

    el('a', { class: 'shop-feed-media', href, 'aria-label': item.title },
      item.cover
        ? mediaImg(item.cover, { alt: item.title, eager: true })
        : el('div', { class: 'shop-noimg big' }, icon('shop', 44)),
      el('span', { class: 'shop-feed-tag', text: 'Venta' }),
      el('span', { class: 'shop-feed-watermark' },
        el('img', { src: 'assets/logo/zuma-logo-64.png', alt: '', width: '18', height: '18' }),
        el('span', { text: 'Zuma' }),
        el('small', { text: 'SHOP' })),
      sold ? el('span', { class: 'shop-sold', text: 'Vendido' }) : null),

    el('div', { class: 'shop-feed-body' },
      el('a', { class: 'shop-feed-title', href, text: item.title }),
      el('div', { class: 'shop-feed-price', text: money(item.price, item.currency) }),
      el('div', { class: 'shop-feed-meta' },
        el('span', { text: shopCategoryLabel(item.category) }),
        el('span', { class: 'dot' }),
        el('span', { text: item.location || 'Sin ubicación' }),
        seller?.username ? el('span', { class: 'dot' }) : null,
        seller?.username
          ? el('a', { href: `#/u/${seller.username}`, text: `Vendido por ${displayName(seller)}` })
          : null)),

    el('div', { class: 'post-actions shop-feed-actions' },
      el('a', { class: 'post-act', href },
        icon('shop', 20), el('span', { class: 'post-act-label', text: 'Ver en Shop' })),
      seller?.username
        ? el('a', { class: 'post-act', href: `#/mensajes/${seller.username}` },
          icon('message', 20), el('span', { class: 'post-act-label', text: 'Enviar mensaje' }))
        : null));
}
