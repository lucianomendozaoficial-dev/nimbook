/* ==========================================================================
   motion.js — preferencia "reducir animaciones"
   ========================================================================== */
const KEY = 'nb.motion.v1';

export function readReduced() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function applyReduced(value = readReduced()) {
  document.documentElement.classList.toggle('reduce-motion', Boolean(value));
  return Boolean(value);
}

export function setReduced(value) {
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* noop */ }
  return applyReduced(value);
}
