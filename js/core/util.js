/* ==========================================================================
   util.js — helpers de DOM, fechas, formatos y utilidades varias
   ========================================================================== */

/** Crea un elemento. Props especiales: class, text, html, dataset, style, on*. */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, val] of Object.entries(value)) {
          if (val === null || val === undefined) continue;
          if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
          else node.style[prop] = val;
        }
      }
      else if (key === 'value') node.value = value;
      else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = !!value;
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    }
  } else if (props !== null && props !== undefined) {
    children.unshift(props);
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export const frag = (...children) => append(document.createDocumentFragment(), children);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function replace(node, ...children) {
  node.replaceChildren();
  return append(node, children);
}

/** Id único corto, ordenable por tiempo. */
export function uid(prefix = '') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  const r2 = Math.random().toString(36).slice(2, 6);
  return `${prefix}${t}${r}${r2}`;
}

export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const nowISO = () => new Date().toISOString();
export const now = () => Date.now();

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce(fn, wait = 250) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function throttle(fn, wait = 500) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const rest = wait - (Date.now() - last);
    if (rest <= 0) {
      last = Date.now();
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, rest);
    }
  };
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------------------------- fechas ------------------------------------- */

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function timeAgo(value) {
  const ts = typeof value === 'number' ? value : Date.parse(value);
  if (!ts) return '';
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.round(diff / 1000);
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  if (d < 30) return `hace ${Math.round(d / 7)} sem`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `hace ${mo} mes${mo === 1 ? '' : 'es'}`;
  return `hace ${Math.round(mo / 12)} a`;
}

export function clockTime(value) {
  const d = new Date(typeof value === 'number' ? value : value);
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

export function chatStamp(value) {
  const ts = typeof value === 'number' ? value : Date.parse(value);
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'ahora';
  if (diff < 86_400_000 && new Date().getDate() === d.getDate()) return clockTime(ts);
  if (diff < 6 * 86_400_000) return DAYS[d.getDay()].slice(0, 3);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export function dayLabel(value) {
  const ts = typeof value === 'number' ? value : Date.parse(value);
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const sameDay = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth()
    && a.getFullYear() === b.getFullYear();
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yesterday)) return 'Ayer';
  return `${DAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function longDate(value) {
  const d = new Date(value);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

export function monthYear(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/* ---------------------------- formatos ----------------------------------- */

export function formatCount(n) {
  const num = Number(n) || 0;
  if (num < 1000) return String(num);
  if (num < 1_000_000) {
    const v = num / 1000;
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} mil`.replace('.', ',');
  }
  const v = num / 1_000_000;
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} M`.replace('.', ',');
}

export function plural(n, one, many) {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** Precio en formato local: $ 12.500 o US$ 1.200. */
export function money(value, currency = 'ARS') {
  const amount = Number(value) || 0;
  const code = String(currency || 'ARS').toUpperCase() === 'USD' ? 'USD' : 'ARS';
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency', currency: code, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return code === 'USD' ? `US$ ${amount}` : `$ ${amount}`;
  }
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#1877f2,#42b0ff)',
  'linear-gradient(135deg,#7b4dff,#b07dff)',
  'linear-gradient(135deg,#00a884,#5be0b5)',
  'linear-gradient(135deg,#f7b125,#ffd166)',
  'linear-gradient(135deg,#e5484d,#ff8a8d)',
  'linear-gradient(135deg,#0f8f8f,#4fd1d1)',
  'linear-gradient(135deg,#d6336c,#ff8ab3)',
  'linear-gradient(135deg,#2b7a0b,#7ad34b)',
];

export function avatarGradient(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ---------------------------- texto -------------------------------------- */

export function normalize(str = '') {
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function truncate(str = '', max = 120) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function firstLine(str = '') {
  return String(str).split('\n').find((l) => l.trim()) || '';
}

export const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
export const isTouch = () => window.matchMedia('(hover: none)').matches;

/** Copia al portapapeles con fallback. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

/** Texto con menciones y enlaces convertidos a HTML seguro. */
export function linkify(text = '') {
  const safe = escapeHtml(text);
  return safe
    .replace(/(https?:\/\/(?:www\.)?[^\s<]+)/g, (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url.length > 60 ? `${url.slice(0, 57)}…` : url}</a>`)
    .replace(/(^|\s)@([a-zA-Z0-9._-]{2,32})/g, (m, pre, user) =>
      `${pre}<span class="mention">@${user}</span>`);
}

export function parseTicks(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function sortByDateDesc(list, key = 'createdAt') {
  return [...list].sort((a, b) => parseTicks(b[key]) - parseTicks(a[key]));
}

/** Hash numérico estable (para pasteles de color, gradients de historia...). */
export function hashCode(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const STORY_GRADIENTS = [
  'linear-gradient(160deg,#1877f2,#00c6ff)',
  'linear-gradient(160deg,#8a2be2,#ff6ec4)',
  'linear-gradient(160deg,#f7b125,#f3425f)',
  'linear-gradient(160deg,#00a884,#0d9488)',
  'linear-gradient(160deg,#0f172a,#334155)',
  'linear-gradient(160deg,#e5484d,#f97316)',
];

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
