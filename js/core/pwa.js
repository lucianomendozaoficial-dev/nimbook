/* ==========================================================================
   pwa.js — instalación como aplicación (solo en navegador, no en webview)
   ========================================================================== */

const DISMISS_KEY = 'nb.install.dismissed.v1';
let deferredPrompt = null;
let installed = false;
const listeners = new Set();

const WEBVIEW_RE = /(FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|WebView|; wv\)|Snapchat|Pinterest)/i;

export function isWebView() {
  try {
    if (window.ReactNativeWebView || window.__CORDOVA__) return true;
    const ua = navigator.userAgent || '';
    if (WEBVIEW_RE.test(ua)) return true;
    // iOS: los webviews no exponen "Safari" en el UA
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    if (isIOS && !/Safari/i.test(ua) && !window.MSStream) return true;
    if (navigator.standalone === true) return false;
    return false;
  } catch {
    return false;
  }
}

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

export function canInstall() {
  return Boolean(deferredPrompt) && !isStandalone() && !isWebView();
}

export function isDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export function dismissInstall() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  emit();
}

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch (err) { console.error('[pwa]', err); }
  }
}

export function onPwaChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    emit();
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* noop */ }
    emit();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('[pwa] service worker', err?.message);
      });
    });
  }
  return { installed: () => installed };
}
