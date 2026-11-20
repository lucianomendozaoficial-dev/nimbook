/* ==========================================================================
   crypto.js — hash de contraseñas con PBKDF2-SHA256 (WebCrypto)
   Las contraseñas nunca se guardan en claro: solo sal + hash.
   ========================================================================== */

const ITERATIONS = 150_000;
const KEY_BITS = 256;
export const PWD_ALGO = 'PBKDF2-SHA256';

const encoder = new TextEncoder();

function bytesToB64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function cryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle) && window.isSecureContext !== false;
}

async function derive(password, saltBytes, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, key, KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Crea el registro de contraseña que se guarda en users.json. */
export async function hashPassword(password) {
  if (!cryptoAvailable()) {
    throw new Error('Tu navegador no permite cifrado seguro (necesitas HTTPS).');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return {
    algo: PWD_ALGO,
    iterations: ITERATIONS,
    salt: bytesToB64(salt),
    hash: bytesToB64(hash),
  };
}

/** Verifica una contraseña contra el registro guardado. */
export async function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  try {
    const salt = b64ToBytes(record.salt);
    const iterations = Number(record.iterations) || ITERATIONS;
    const hash = await derive(password, salt, iterations);
    const expected = b64ToBytes(record.hash);
    if (hash.length !== expected.length) return false;
    // comparación en tiempo constante
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export function randomId(bytes = 8) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}
