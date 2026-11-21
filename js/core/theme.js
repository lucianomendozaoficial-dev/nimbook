/* ==========================================================================
   theme.js — tema claro / oscuro / automático
   ========================================================================== */

const KEY = 'nb.theme.v1';
const META = document.querySelector('meta[name="theme-color"]');

export const THEMES = ['light', 'dark', 'auto'];
export const THEME_LABELS = { light: 'Claro', dark: 'Oscuro', auto: 'Automático' };

export function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.includes(saved)) return saved;
  } catch { /* noop */ }
  return 'auto';
}

export function resolvedTheme(theme = readTheme()) {
  return theme === 'auto' ? systemTheme() : theme;
}

export function applyTheme(theme = readTheme()) {
  const resolved = resolvedTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = theme;
  if (META) META.setAttribute('content', resolved === 'dark' ? '#242526' : '#0866FF');
  return resolved;
}

export function setTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'auto';
  try { localStorage.setItem(KEY, value); } catch { /* noop */ }
  applyTheme(value);
  return value;
}

export function themeCycle() {
  const current = readTheme();
  const next = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
  setTheme(next);
  return next;
}

export function themeLabel() {
  const mode = readTheme();
  return mode === 'auto' ? `Automático (${resolvedTheme() === 'dark' ? 'oscuro' : 'claro'})` : THEME_LABELS[mode];
}

export function initTheme() {
  const theme = readTheme();
  applyTheme(theme);
  applyAccent(readAccent());
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', () => {
    if (readTheme() === 'auto') applyTheme('auto');
  });
  return theme;
}

/* ------------------------------ color de acento --------------------------- */

const ACCENT_KEY = 'nb.accent.v1';
const ACCENTS = [
  { id: 'azul', label: 'Azul', color: '#0866ff' },
  { id: 'violeta', label: 'Violeta', color: '#7c3aed' },
  { id: 'verde', label: 'Verde', color: '#0f9d6f' },
  { id: 'rosa', label: 'Rosa', color: '#e11d48' },
  { id: 'naranja', label: 'Naranja', color: '#ea580c' },
];
export { ACCENTS };

export function readAccent() {
  try {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (ACCENTS.some((accent) => accent.id === saved)) return saved;
  } catch { /* noop */ }
  return 'azul';
}

function shade(hex, amount) {
  const value = hex.replace('#', '');
  const num = parseInt(value, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function applyAccent(id = readAccent()) {
  const accent = ACCENTS.find((item) => item.id === id) || ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty('--brand', accent.color);
  root.style.setProperty('--brand-hover', shade(accent.color, -18));
  root.style.setProperty('--brand-active', shade(accent.color, -34));
  root.dataset.accent = accent.id;
  return accent.id;
}

export function setAccent(id) {
  try { localStorage.setItem(ACCENT_KEY, id); } catch { /* noop */ }
  applyAccent(id);
  return id;
}
