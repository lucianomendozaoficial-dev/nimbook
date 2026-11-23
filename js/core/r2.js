/* ==========================================================================
   r2.js — Cloudflare R2 para videos
   Firma URLs PUT/DELETE desde el navegador. La URL pública de R2 se usa para
   reproducir; el bucket no guarda videos en Supabase.
   ========================================================================== */

const cfg = window.NIMBOOK_DEV_CONFIG || window.NIMBOOK_CONFIG || {};
const R2 = cfg.r2 || null;
const encoder = new TextEncoder();

export function r2Configured() {
  return Boolean(R2?.endpoint && R2?.bucket && R2?.publicUrl && R2?.accessKeyId && R2?.secretAccessKey);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function hmac(key, text) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(text));
}

function awsEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalUri(key) {
  return `/${R2.bucket}/${String(key).split('/').map(awsEncode).join('/')}`;
}

function amzTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function presign(method, key, { contentType = 'application/octet-stream', expires = 900 } = {}) {
  if (!r2Configured()) throw new Error('R2 no está configurado.');
  const cleanKey = String(key || '').replace(/^\/+/, '');
  if (!cleanKey) throw new Error('Falta el nombre del archivo.');
  const endpoint = new URL(R2.endpoint);
  const host = endpoint.host;
  const uri = canonicalUri(cleanKey);
  const now = amzTimestamp();
  const dateStamp = now.slice(0, 8);
  const scope = `${dateStamp}/${R2.region || 'auto'}/s3/aws4_request`;
  const signedHeaders = 'content-type;host';
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${R2.accessKeyId}/${scope}`,
    'X-Amz-Date': now,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.keys(query).sort()
    .map((name) => `${awsEncode(name)}=${awsEncode(query[name])}`).join('&');
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    method,
    uri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    now,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = await hmac(`AWS4${R2.secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, R2.region || 'auto');
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = hex(await hmac(kSigning, stringToSign));
  return `${endpoint.origin}${uri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function r2PublicUrl(key) {
  if (!r2Configured()) return '';
  return `${R2.publicUrl.replace(/\/+$/, '')}/${String(key).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
}

export async function presignR2(method, key, options = {}) {
  return presign(method, key, options);
}

export async function uploadR2(file, key, { contentType = file?.type || 'application/octet-stream', onProgress = null, signal = null } = {}) {
  const url = await presign('PUT', key, { contentType });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ key, url: r2PublicUrl(key) });
      } else {
        reject(new Error(`R2 respondió ${xhr.status}.`));
      }
    };
    xhr.onerror = () => reject(new Error('No se pudo subir el video a R2.'));
    xhr.onabort = () => reject(new Error('Subida cancelada.'));
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export async function deleteR2(key) {
  const url = await presign('DELETE', key, { contentType: 'application/octet-stream', expires: 300 });
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/octet-stream' },
  }).catch(() => null);
  return Boolean(response?.ok);
}
