/* ==========================================================================
   realtime.js — cambios en vivo para toda la app
   Usa Supabase Realtime Broadcast (canal público) para avisar qué documento
   cambió. En local usa BroadcastChannel entre pestañas, sin tocar la red.
   ========================================================================== */
import {
  config, onWrite, applyRemote, supabaseClient,
} from './net.js';

let started = false;
let ready = false;
let channel = null;
let local = null;
const pending = [];
const remoteListeners = new Set();
const typingListeners = new Set();

export function onRemoteDoc(fn) {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}

export function onTyping(fn) {
  typingListeners.add(fn);
  return () => typingListeners.delete(fn);
}

function emitTyping(data) {
  for (const fn of typingListeners) {
    try { fn(data); } catch { /* noop */ }
  }
}

export function sendTyping(fromId, toId) {
  if (!fromId || !toId) return;
  const payload = { fromId, toId, at: Date.now() };
  if (local) {
    try { local.postMessage({ type: 'typing', ...payload }); } catch { /* noop */ }
  }
  if (channel) {
    try {
      const sent = channel.send({ type: 'broadcast', event: 'typing', payload });
      sent?.catch?.(() => {});
    } catch { /* noop */ }
  }
}

async function applyIncoming(path) {
  await applyRemote(path);
  for (const fn of remoteListeners) {
    try { fn(path); } catch { /* noop */ }
  }
}

function publish(path) {
  if (!path || !path.startsWith('data/')) return;
  if (local) {
    try { local.postMessage({ path }); } catch { /* noop */ }
    return;
  }
  if (!channel) return;
  if (!ready) {
    pending.push(path);
    if (pending.length > 50) pending.shift();
    return;
  }
  channel.send({ type: 'broadcast', event: 'doc', payload: { path } }).catch(() => {});
}

function flushPending() {
  const list = pending.splice(0);
  for (const path of list) publish(path);
}

export function realtimeReady() {
  return ready;
}

export function initRealtime() {
  if (started) return;
  started = true;
  const cfg = config();

  onWrite((path, doc, meta = {}) => {
    if (!meta.remote) publish(path);
  });

  if (cfg.local) {
    try {
      local = new BroadcastChannel('zuma-live');
      local.onmessage = (event) => {
        if (event.data?.type === 'typing') {
          emitTyping(event.data);
          return;
        }
        const path = event.data?.path;
        if (path) applyIncoming(path);
      };
    } catch { /* sin BroadcastChannel */ }
    ready = true;
    return;
  }

  try {
    const sb = supabaseClient();
    channel = sb.channel('zuma-live', {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'doc' }, (message) => {
      const path = message?.payload?.path;
      if (typeof path === 'string' && path.startsWith('data/')) applyIncoming(path);
    });
    channel.on('broadcast', { event: 'typing' }, (message) => {
      const payload = message?.payload;
      if (payload?.fromId && payload?.toId) emitTyping(payload);
    });
    channel.subscribe((status) => {
      ready = status === 'SUBSCRIBED';
      if (ready) flushPending();
    });
  } catch {
    ready = false;
  }
}
