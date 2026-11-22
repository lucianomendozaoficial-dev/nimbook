/* ==========================================================================
   native.js — detalles nativos: transiciones de vista y vibración corta
   ========================================================================== */

export function haptic(pattern = 8) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* noop */ }
}

export function withViewTransition(update) {
  if (
    typeof document.startViewTransition === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    try {
      const transition = document.startViewTransition(update);
      transition.finished.catch(() => {});
      return;
    } catch { /* fallback */ }
  }
  update();
}
