/* ==========================================================================
   sounds.js — efectos de sonido sintetizados (sin archivos externos)
   ========================================================================== */

const KEY = 'nb.sounds.v1';
let ctx = null;
let master = null;
let enabled = read();

function read() {
  try {
    const value = localStorage.getItem(KEY);
    return value === null ? true : value === '1';
  } catch {
    return true;
  }
}

export function soundsEnabled() {
  return enabled;
}

export function setSoundsEnabled(value) {
  enabled = Boolean(value);
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* noop */ }
  if (enabled) ensureContext();
  return enabled;
}

function ensureContext() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

function tone({ freq = 440, endFreq = null, duration = 0.12, type = 'sine', gain = 0.5, delay = 0 }) {
  const audio = ensureContext();
  if (!audio) return;
  const now = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp);
  amp.connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function noise({ duration = 0.16, gain = 0.25, delay = 0, from = 600, to = 2400 }) {
  const audio = ensureContext();
  if (!audio) return;
  const now = audio.currentTime + delay;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, now);
  filter.frequency.exponentialRampToValueAtTime(to, now + duration);
  filter.Q.value = 0.8;
  const amp = audio.createGain();
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  source.start(now);
  source.stop(now + duration + 0.02);
}

const SOUNDS = {
  like() {
    tone({ freq: 620, endFreq: 940, duration: 0.09, type: 'sine', gain: 0.45 });
    tone({ freq: 1180, duration: 0.07, type: 'sine', gain: 0.16, delay: 0.05 });
  },
  unlike() {
    tone({ freq: 480, endFreq: 260, duration: 0.08, type: 'sine', gain: 0.3 });
  },
  reaction() {
    tone({ freq: 720, endFreq: 1080, duration: 0.1, type: 'triangle', gain: 0.32 });
    tone({ freq: 1440, duration: 0.09, type: 'sine', gain: 0.16, delay: 0.06 });
  },
  comment() {
    tone({ freq: 1300, duration: 0.035, type: 'square', gain: 0.09 });
    tone({ freq: 880, duration: 0.05, type: 'sine', gain: 0.14, delay: 0.03 });
  },
  send() {
    noise({ duration: 0.18, gain: 0.16, from: 700, to: 2600 });
    tone({ freq: 520, endFreq: 880, duration: 0.11, type: 'sine', gain: 0.22, delay: 0.02 });
  },
  message() {
    tone({ freq: 880, duration: 0.1, type: 'sine', gain: 0.22 });
    tone({ freq: 1174, duration: 0.12, type: 'sine', gain: 0.2, delay: 0.09 });
    tone({ freq: 1568, duration: 0.18, type: 'sine', gain: 0.14, delay: 0.19 });
  },
  notification() {
    tone({ freq: 880, duration: 0.14, type: 'sine', gain: 0.26 });
    tone({ freq: 1174, duration: 0.2, type: 'sine', gain: 0.22, delay: 0.12 });
  },
  follow() {
    tone({ freq: 660, duration: 0.1, type: 'sine', gain: 0.24 });
    tone({ freq: 880, duration: 0.1, type: 'sine', gain: 0.22, delay: 0.08 });
    tone({ freq: 1100, duration: 0.14, type: 'sine', gain: 0.2, delay: 0.16 });
  },
  error() {
    tone({ freq: 220, endFreq: 160, duration: 0.18, type: 'sawtooth', gain: 0.14 });
  },
  open() {
    tone({ freq: 420, endFreq: 620, duration: 0.07, type: 'sine', gain: 0.12 });
  },
};

export function playSound(name) {
  if (!enabled || !SOUNDS[name]) return;
  try {
    SOUNDS[name]();
  } catch {
    /* silencio */
  }
}

/** Desbloquea el audio en el primer gesto del usuario (política del navegador). */
export function unlockSounds() {
  const audio = ensureContext();
  if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
}
