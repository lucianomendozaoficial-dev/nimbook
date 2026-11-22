/* ==========================================================================
   ui.js — toasts, modales, menús, visor de imágenes y piezas reutilizables
   ========================================================================== */
import { el, $$, avatarGradient, uid, clear } from './util.js';
import { icon } from './icons.js';
import { mediaImg, downloadImage, mediaFileName } from './media.js';
import { displayName, initialsOf } from './store.js';

/* ------------------------------ reacciones ------------------------------ */

export const REACTIONS = {
  like: { emoji: '👍', label: 'Me gusta', color: '#1877f2' },
  love: { emoji: '❤️', label: 'Me encanta', color: '#f33e58' },
  haha: { emoji: '😂', label: 'Me divierte', color: '#f7b125' },
  wow: { emoji: '😮', label: 'Me asombra', color: '#f7b125' },
  sad: { emoji: '😢', label: 'Me entristece', color: '#f7b125' },
  angry: { emoji: '😡', label: 'Me enfada', color: '#e9710f' },
};

export const REACTION_ORDER = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

/* -------------------------------- toasts -------------------------------- */

export function toast(message, { type = 'info', duration = 3400, iconName = null } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return null;
  const icons = { success: 'check', error: 'alert', info: 'info' };
  const node = el('div', { class: `toast ${type}` },
    icon(iconName || icons[type] || 'info', 18),
    el('span', { text: message }));
  host.appendChild(node);
  const timer = setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 240);
  }, duration);
  node.addEventListener('click', () => {
    clearTimeout(timer);
    node.remove();
  });
  return node;
}

/* -------------------------------- modales ------------------------------- */

let modalStack = [];
let scrollLocks = 0;

function lockScroll() {
  scrollLocks += 1;
  if (scrollLocks === 1) {
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
  }
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

function onEscape(event) {
  if (event.key !== 'Escape') return;
  const top = modalStack[modalStack.length - 1];
  if (top) top.close();
  else closeDropdown();
}
document.addEventListener('keydown', onEscape);

/**
 * Abre un modal. Devuelve { el, close, setTitle, body }.
 */
export function openModal({
  title = '', body = null, footer = null, size = '', className = '',
  dismissible = true, onClose = null, headless = false,
} = {}) {
  const previousFocus = document.activeElement;
  const backdrop = el('div', { class: 'modal-backdrop' });
  const bodyEl = el('div', { class: 'modal-body' });
  const modal = el('div', { class: `modal ${size} ${className}`.trim(), role: 'dialog', 'aria-modal': 'true' });

  const api = {
    el: modal,
    body: bodyEl,
    setTitle(text) {
      const h = modal.querySelector('.modal-head h2');
      if (h) h.textContent = text;
    },
    close(result) {
      const index = modalStack.findIndex((entry) => entry.api === api);
      if (index < 0) return;
      modalStack.splice(index, 1);
      backdrop.remove();
      unlockScroll();
      onClose?.(result);
      try { previousFocus?.focus?.({ preventScroll: true }); } catch { /* noop */ }
    },
  };

  if (!headless) {
    const header = el('div', { class: 'modal-head' },
      el('h2', { text: title }),
      el('button', {
        class: 'close', type: 'button', 'aria-label': 'Cerrar',
        onclick: () => api.close(),
      }, icon('x', 18)));
    modal.appendChild(header);
  }

  if (body instanceof Node) bodyEl.appendChild(body);
  else if (typeof body === 'string') bodyEl.innerHTML = body;
  modal.appendChild(bodyEl);

  if (footer) {
    const foot = el('div', { class: 'modal-foot' });
    if (footer instanceof Node) foot.appendChild(footer);
    else foot.append(...(Array.isArray(footer) ? footer : [footer]));
    modal.appendChild(foot);
  }

  backdrop.appendChild(modal);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop && dismissible) api.close('backdrop');
  });
  document.getElementById('modal-root').appendChild(backdrop);
  lockScroll();
  modalStack.push({ api, backdrop });
  requestAnimationFrame(() => {
    const focusable = modal.querySelector('textarea, input, button.primary, button');
    focusable?.focus?.({ preventScroll: true });
  });
  return api;
}

export function closeAllModals() {
  while (modalStack.length) modalStack[modalStack.length - 1].api.close('all');
}

export function isModalOpen() {
  return modalStack.length > 0;
}

/** Confirmación con estética de Facebook. */
export function confirmDialog({
  title = '¿Seguro?', message = '', confirmText = 'Aceptar',
  cancelText = 'Cancelar', danger = false, iconName = null,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const footer = el('div', { class: 'row gap-8', style: { width: '100%' } },
      el('button', {
        class: 'btn grow', type: 'button',
        onclick: () => { finish(false); api.close(); },
      }, cancelText),
      el('button', {
        class: `btn grow ${danger ? 'danger' : 'primary'}`, type: 'button',
        onclick: () => { finish(true); api.close(); },
      }, confirmText));
    const content = el('div', { class: 'modal-confirm' },
      iconName ? el('div', {
        class: 'center', style: {
          width: '64px', height: '64px', margin: '0 auto 12px', borderRadius: '50%',
          background: danger ? 'var(--danger-soft)' : 'var(--brand-soft)',
          color: danger ? 'var(--danger)' : 'var(--brand)',
        },
      }, icon(iconName, 30)) : null,
      el('h3', { text: title }),
      message ? el('p', { text: message }) : null);
    const api = openModal({
      title: '', body: content, footer, size: 'sm', headless: true,
      onClose: () => finish(false),
    });
    api.el.classList.add('confirm');
  });
}

/* ------------------------------- dropdown ------------------------------- */

let currentDropdown = null;

export function closeDropdown() {
  if (!currentDropdown) return;
  currentDropdown.remove();
  currentDropdown = null;
  document.removeEventListener('mousedown', onDocClick, true);
  window.removeEventListener('resize', closeDropdown);
  window.removeEventListener('scroll', closeDropdown, true);
}

function onDocClick(event) {
  if (currentDropdown && !currentDropdown.contains(event.target)) closeDropdown();
}

/** Panel flotante con contenido propio, anclado a un elemento. */
export function popover(anchor, node, { width = 360, align = 'end', className = '' } = {}) {
  closeDropdown();
  const panel = el('div', { class: `dd ${className}`.trim() });
  panel.style.width = `${width}px`;
  panel.style.padding = '6px';
  panel.appendChild(node);
  document.body.appendChild(panel);

  const rect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  let left = align === 'end' ? rect.right - panelRect.width : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
  let top = rect.bottom + 10;
  if (top + panelRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - panelRect.height - 10);
  }
  panel.style.position = 'absolute';
  panel.style.left = `${left + window.scrollX}px`;
  panel.style.top = `${top + window.scrollY}px`;
  currentDropdown = panel;

  setTimeout(() => {
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('resize', closeDropdown);
    window.addEventListener('scroll', closeDropdown, true);
  }, 0);
  return panel;
}

/**
 * Menú contextual anclado a un elemento.
 * @param {HTMLElement} anchor
 * @param {Array} items  [{icon, label, sub, onClick, danger, separator}]
 */
export function dropdown(anchor, items, { width = 300, align = 'end' } = {}) {
  closeDropdown();
  const menu = el('div', { class: 'dd' });
  menu.style.width = `${width}px`;

  for (const item of items) {
    if (!item) continue;
    if (item.separator) {
      menu.appendChild(el('div', { class: 'dd-sep' }));
      continue;
    }
    if (item.title) {
      menu.appendChild(el('div', { class: 'dd-title', text: item.title }));
      continue;
    }
    const btn = el('button', {
      class: 'dd-item', type: 'button',
      style: item.danger ? { color: 'var(--danger)' } : null,
      onclick: (event) => {
        event.stopPropagation();
        closeDropdown();
        item.onClick?.(event);
      },
    },
    item.icon ? el('span', {
      class: 'dd-ic',
      style: item.danger ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : null,
    }, icon(item.icon, 20)) : null,
    el('span', { class: 'dd-label' },
      item.label,
      item.sub ? el('span', { class: 'dd-sub', text: item.sub }) : null));
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = align === 'end' ? rect.right - menuRect.width : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  let top = rect.bottom + 8;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - menuRect.height - 8);
  }
  menu.style.left = `${left + window.scrollX}px`;
  menu.style.top = `${top + window.scrollY}px`;
  menu.style.position = 'absolute';
  currentDropdown = menu;

  setTimeout(() => {
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('resize', closeDropdown);
    window.addEventListener('scroll', closeDropdown, true);
  }, 0);

  return menu;
}

/* ------------------------------- lightbox ------------------------------- */

export function lightbox(paths, startIndex = 0) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (!list.length) return;
  let index = Math.max(0, Math.min(startIndex, list.length - 1));
  const root = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true' });
  const img = mediaImg(list[index], { alt: 'Imagen', loading: 'eager' });
  img.style.maxWidth = '94vw';
  img.style.maxHeight = '90vh';

  const counter = el('div', { class: 'lb-count', text: `${index + 1} de ${list.length}` });
  const close = el('button', {
    class: 'lb-close', type: 'button', 'aria-label': 'Cerrar',
    onclick: () => destroy(),
  }, icon('x', 22));

  const download = el('button', {
    class: 'lb-download', type: 'button', 'aria-label': 'Descargar imagen',
    title: 'Descargar imagen',
    onclick: async () => {
      const saved = await downloadImage(list[index], mediaFileName(list[index], 'zuma.jpg'));
      toast(saved ? 'Imagen descargada' : 'Se abrió la imagen para guardarla',
        { type: saved ? 'success' : 'info' });
    },
  }, icon('download', 21));

  const go = (delta) => {
    index = (index + delta + list.length) % list.length;
    const next = mediaImg(list[index], { alt: 'Imagen', loading: 'eager' });
    next.style.maxWidth = '94vw';
    next.style.maxHeight = '90vh';
    img.replaceWith(next);
    imgRef = next;
    counter.textContent = `${index + 1} de ${list.length}`;
  };
  let imgRef = img;

  let prev = null;
  let next = null;
  if (list.length > 1) {
    prev = el('button', { class: 'lb-nav prev', type: 'button', 'aria-label': 'Anterior', onclick: (e) => { e.stopPropagation(); go(-1); } }, icon('chevron-left', 24));
    next = el('button', { class: 'lb-nav next', type: 'button', 'aria-label': 'Siguiente', onclick: (e) => { e.stopPropagation(); go(1); } }, icon('chevron-right', 24));
  }

  root.append(img, close, download, counter, ...(prev ? [prev, next] : []));
  root.addEventListener('click', (event) => {
    if (event.target === root) destroy();
  });

  const onKey = (event) => {
    if (event.key === 'Escape') destroy();
    if (event.key === 'ArrowLeft' && list.length > 1) go(-1);
    if (event.key === 'ArrowRight' && list.length > 1) go(1);
  };

  function destroy() {
    document.removeEventListener('keydown', onKey);
    root.remove();
    unlockScroll();
  }

  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  lockScroll();
  return { close: destroy };
}

/* -------------------------------- avatar -------------------------------- */

export function avatarEl(user, size = 'md', opts = {}) {
  const wrap = el('span', {
    class: `avatar ${size} ${opts.ring ? 'ring' : ''} ${opts.online ? 'online' : ''} ${opts.className || ''}`.trim(),
    title: opts.title ?? displayName(user),
  });
  if (user?.avatar) {
    wrap.appendChild(mediaImg(user.avatar, { alt: displayName(user), eager: true }));
  } else {
    wrap.textContent = initialsOf(user);
    wrap.style.background = avatarGradient(user?.id || user?.name || uid());
  }
  if (opts.onClick) {
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', opts.onClick);
  }
  return wrap;
}

/* ------------------------------ ayudantes ------------------------------- */

export function iconBtn(name, { onClick, label = '', size = 24, className = '', filled = false } = {}) {
  return el('button', {
    class: `btn-icon ${className}`.trim(), type: 'button', 'aria-label': label, title: label,
    onclick: onClick,
  }, icon(name, size, { filled }));
}

export function spinnerEl(label = '') {
  return el('div', { class: 'loading-row' },
    el('span', { class: 'spinner' }),
    label ? el('span', { text: label }) : null);
}

export function emptyState({ iconName = 'info', title = 'Nada por aquí', description = '', action = null, illustration = '' } = {}) {
  return el('div', { class: 'empty' },
    illustration
      ? el('div', { class: 'empty-illustration', html: illustration })
      : el('div', { class: 'empty-ic' }, icon(iconName, 30)),
    el('h3', { text: title }),
    description ? el('p', { text: description }) : null,
    action || null);
}

export function skeletonPost() {
  return el('div', { class: 'card post-skeleton' },
    el('div', { class: 'row' },
      el('div', { class: 'skeleton', style: { width: '40px', height: '40px', borderRadius: '50%' } }),
      el('div', { class: 'col gap-6', style: { flex: '1' } },
        el('div', { class: 'skeleton', style: { width: '38%', height: '11px' } }),
        el('div', { class: 'skeleton', style: { width: '22%', height: '9px' } }))),
    el('div', { class: 'skeleton', style: { width: '100%', height: '12px', marginTop: '6px' } }),
    el('div', { class: 'skeleton', style: { width: '73%', height: '12px' } }),
    el('div', { class: 'skeleton', style: { width: '100%', height: '260px', marginTop: '6px', borderRadius: '8px' } }));
}

export function fieldRow(label, input, hint) {
  return el('div', { class: 'field' },
    label ? el('label', { text: label }) : null,
    input,
    hint ? el('span', { class: 'field-hint', text: hint }) : null);
}

/** Botón con estado de carga (spinner) y bloqueo. */
export async function withBusy(button, fn, busyText = 'Guardando…') {
  const original = button.innerHTML;
  button.disabled = true;
  clear(button);
  button.append(el('span', { class: 'spinner', style: { width: '16px', height: '16px' } }));
  if (busyText) button.append(document.createTextNode(` ${busyText}`));
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

/** Crea una fila de pestañas. */
export function tabsBar(items, activeId, onSelect, { className = '' } = {}) {
  const bar = el('div', { class: `tabs ${className}`.trim() });
  for (const item of items) {
    const tab = el('button', {
      class: `tab ${item.id === activeId ? 'active' : ''}`, type: 'button',
      onclick: () => onSelect(item.id),
    }, item.label);
    if (item.count !== undefined) {
      tab.appendChild(el('span', { class: 'tab-count', text: `· ${item.count}` }));
    }
    bar.appendChild(tab);
  }
  return bar;
}

export function closeMenus() {
  closeDropdown();
  // cualquier menú custom (picker de emojis, etc.)
  $$('.popover').forEach((node) => node.remove());
}

/* picker de emojis sencillo */
const EMOJI_SET = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '😇', '🥰',
  '😴', '😭', '😡', '🤯', '🥳', '😱', '🤗', '🙃', '👍', '👎', '👏', '🙌', '🙏', '💪',
  '❤️', '💙', '💚', '💛', '🧡', '💜', '🔥', '✨', '🎉', '🎂', '☕', '🍕', '⚽', '🎮',
  '🌞', '🌙', '🌈', '🌸', '🐶', '🐱', '📷', '📚', '💻', '📱', '🚀', '🏆'];

export function emojiPicker(anchor, onPick) {
  closeMenus();
  const pop = el('div', { class: 'dd popover', style: { width: '300px' } });
  const grid = el('div', {
    style: {
      display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px',
      maxHeight: '240px', overflowY: 'auto',
    },
  });
  for (const emoji of EMOJI_SET) {
    grid.appendChild(el('button', {
      type: 'button',
      style: { fontSize: '21px', height: '34px', borderRadius: '6px', lineHeight: '1' },
      onmouseenter: (e) => { e.currentTarget.style.background = 'var(--hover)'; },
      onmouseleave: (e) => { e.currentTarget.style.background = ''; },
      onclick: () => { onPick(emoji); closeMenus(); },
    }, emoji));
  }
  pop.appendChild(grid);
  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  let left = Math.min(rect.left, window.innerWidth - popRect.width - 8);
  let top = rect.top - popRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  pop.style.position = 'absolute';
  pop.style.left = `${Math.max(8, left) + window.scrollX}px`;
  pop.style.top = `${top + window.scrollY}px`;
  currentDropdown = pop;
  setTimeout(() => {
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('scroll', closeDropdown, true);
  }, 0);
  return pop;
}
