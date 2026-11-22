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
        const path = event.data?.path;
        if (path) applyRemote(path);
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
      if (typeof path === 'string' && path.startsWith('data/')) applyRemote(path);
    });
    channel.subscribe((status) => {
      ready = status === 'SUBSCRIBED';
      if (ready) flushPending();
    });
  } catch {
    ready = false;
  }
}
