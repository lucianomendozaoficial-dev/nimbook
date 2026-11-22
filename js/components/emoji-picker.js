/* ==========================================================================
   emoji-picker.js — selector de emojis reutilizable
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';

const RECENT_KEY = 'zuma.emojis.recientes.v1';

const CATEGORIES = [
  {
    id: 'caritas',
    label: 'Caritas',
    icon: '😀',
    items: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
      '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸',
      '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️',
      '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡',
      '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
      '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
      '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
      '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
      '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '🤖',
    ],
  },
  {
    id: 'gestos',
    label: 'Gestos',
    icon: '👋',
    items: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
      '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
      '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂',
      '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅',
      '👄', '🫦', '💋', '🫶', '🫰', '🫱', '🫲', '🫳', '🫴', '🫵',
    ],
  },
  {
    id: 'corazones',
    label: 'Amor',
    icon: '❤️',
    items: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️',
      '💌', '💐', '🌹', '🌷', '🌺', '🌸', '💮', '🏵️', '🌼', '🌻',
      '💒', '💍', '👰', '🤵', '💑', '💏', '🫂', '🥂', '🎊', '🎉',
    ],
  },
  {
    id: 'animales',
    label: 'Animales',
    icon: '🐶',
    items: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔',
      '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺',
      '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜',
      '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍',
      '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠',
      '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍',
      '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂',
    ],
  },
  {
    id: 'comida',
    label: 'Comida',
    icon: '🍕',
    items: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑',
      '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅',
      '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳',
      '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟',
      '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘',
      '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙',
      '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦',
      '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩',
      '🍪', '☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂', '🍷',
    ],
  },
  {
    id: 'actividades',
    label: 'Plan',
    icon: '⚽',
    items: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
      '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
      '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️',
      '🤺', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗',
      '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️',
      '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧',
      '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️',
      '🎯', '🎳', '🎮', '🎰', '🧩',
    ],
  },
  {
    id: 'viajes',
    label: 'Viajes',
    icon: '✈️',
    items: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵',
      '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟',
      '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇',
      '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸',
      '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🗺️',
      '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲',
      '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '🏠',
    ],
  },
  {
    id: 'objetos',
    label: 'Objetos',
    icon: '💡',
    items: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️',
      '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥',
      '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️',
      '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋',
      '🪫', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵',
      '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰',
      '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤',
      '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️',
      '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈',
      '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬',
      '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰',
    ],
  },
  {
    id: 'simbolos',
    label: 'Símbolos',
    icon: '✨',
    items: [
      '✨', '⭐', '🌟', '💫', '⚡', '🔥', '💥', '💢', '💨', '💦',
      '💤', '💬', '💭', '🗯️', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕',
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶',
      '✅', '☑️', '✔️', '❌', '❎', '➕', '➖', '➗', '✖️', '♾️',
      '‼️', '⁉️', '❓', '❔', '❕', '❗', '〰️', '💯', '🔔', '🔕',
      '🎵', '🎶', '🏁', '🚩', '🎌', '🏴', '🏳️', '🔒', '🔓', '🔐',
      '🔑', '🗝️', '🔨', '⚡', '☀️', '🌙', '⛅', '🌤️', '🌧️', '⛈️',
      '🌨️', '❄️', '☃️', '⛄', '🌊', '🌈', '☔', '💧', '🌍', '🌎',
    ],
  },
];

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, 18) : [];
  } catch {
    return [];
  }
}

function saveRecent(emoji) {
  try {
    const list = [emoji, ...readRecent().filter((item) => item !== emoji)].slice(0, 18);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* noop */ }
}

export function insertAtCursor(field, text) {
  if (!field) return;
  const start = Number.isFinite(field.selectionStart) ? field.selectionStart : field.value.length;
  const end = Number.isFinite(field.selectionEnd) ? field.selectionEnd : field.value.length;
  field.value = `${field.value.slice(0, start)}${text}${field.value.slice(end)}`;
  const position = start + text.length;
  try { field.setSelectionRange(position, position); } catch { /* noop */ }
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
}

let current = null;

function closePicker() {
  if (!current) return;
  current.backdrop?.remove();
  current.pop?.remove();
  document.removeEventListener('mousedown', current.onOutside, true);
  document.removeEventListener('keydown', current.onKey);
  current = null;
}

function place(pop, anchor) {
  if (window.matchMedia('(max-width: 620px)').matches) return;
  const rect = anchor.getBoundingClientRect();
  const width = 330;
  const height = Math.min(380, pop.offsetHeight || 360);
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(10, Math.min(window.innerWidth - width - 10, left));
  let top = rect.top - height - 10;
  if (top < 10) top = Math.min(window.innerHeight - height - 10, rect.bottom + 10);
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(10, top)}px`;
}

export function openEmojiPicker(anchor, onPick) {
  closePicker();
  const pop = el('div', { class: 'emoji-pop', role: 'dialog', 'aria-label': 'Elegir emoji' });
  const backdrop = el('div', { class: 'emoji-backdrop' });
  const grid = el('div', { class: 'emoji-grid' });
  const tabs = el('div', { class: 'emoji-tabs' });

  let activeTab = 'caritas';
  const recent = readRecent();

  function paintGrid() {
    clear(grid);
    if (activeTab === 'recientes') {
      if (!recent.length) {
        grid.appendChild(el('p', { class: 'emoji-empty', text: 'Todavía no usaste emojis.' }));
        return;
      }
      for (const emoji of recent) {
        grid.appendChild(el('button', {
          class: 'emoji-cell', type: 'button', text: emoji,
          onclick: () => pick(emoji),
        }));
      }
      return;
    }
    const category = CATEGORIES.find((item) => item.id === activeTab);
    for (const emoji of category?.items || []) {
      grid.appendChild(el('button', {
        class: 'emoji-cell', type: 'button', text: emoji,
        onclick: () => pick(emoji),
      }));
    }
  }

  function paintTabs() {
    clear(tabs);
    const items = [
      ...(recent.length ? [{ id: 'recientes', icon: '🕘', label: 'Recientes' }] : []),
      ...CATEGORIES.map((category) => ({ id: category.id, icon: category.icon, label: category.label })),
    ];
    for (const item of items) {
      tabs.appendChild(el('button', {
        class: `emoji-tab${activeTab === item.id ? ' active' : ''}`.trim(),
        type: 'button', title: item.label, 'aria-label': item.label, text: item.icon,
        onclick: () => { activeTab = item.id; paintTabs(); paintGrid(); },
      }));
    }
  }

  function pick(emoji) {
    saveRecent(emoji);
    onPick?.(emoji);
    closePicker();
  }

  pop.append(
    el('div', { class: 'emoji-head' },
      el('div', { class: 'emoji-title' }, 'Emojis'),
      el('button', {
        class: 'btn-icon emoji-close', type: 'button', 'aria-label': 'Cerrar',
        onclick: closePicker,
      }, icon('x', 18))),
    tabs,
    grid);

  document.body.append(backdrop, pop);
  paintTabs();
  paintGrid();
  requestAnimationFrame(() => {
    if (pop.offsetHeight > 300) pop.style.height = '330px';
    place(pop, anchor);
  });

  const onOutside = (event) => {
    if (!pop.contains(event.target) && !anchor.contains(event.target)) closePicker();
  };
  const onKey = (event) => { if (event.key === 'Escape') closePicker(); };
  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKey);
  current = { pop, backdrop, onOutside, onKey };
}

export function emojiButton(field, { className = 'btn-icon', label = '', title = 'Emoji' } = {}) {
  const button = el('button', {
    class: className, type: 'button', title, 'aria-label': title,
  }, icon('smile', 19), label ? el('span', { text: label }) : null);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    openEmojiPicker(button, (emoji) => insertAtCursor(field, emoji));
  });
  return button;
}

export const EMOJI_CATEGORIES = CATEGORIES;
export const ALL_EMOJIS = CATEGORIES.flatMap((category) => category.items);
