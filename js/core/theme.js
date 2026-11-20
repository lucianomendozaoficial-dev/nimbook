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
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', () => {
    if (readTheme() === 'auto') applyTheme('auto');
  });
  return theme;
}
