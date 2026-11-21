import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9370;
const BASE = 'http://127.0.0.1:4173';
const OUT = path.resolve('.tmp');
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, `look-${Date.now()}`)}`,
  '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });

let version = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (res.ok) { version = await res.json(); break; }
  } catch { /* espera */ }
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  }
});
let sessionId = null;
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id; pending.set(mid, resolve);
  const payload = { id: mid, method, params };
  if (sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
});
const created = await send('Target.createTarget', { url: 'about:blank' });
const att = await send('Target.attachToTarget', { targetId: created.result.targetId, flatten: true });
sessionId = att.result.sessionId;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (res.result?.exceptionDetails) return { error: res.result.exceptionDetails.exception?.description };
  return res.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  if (res?.result?.data) await fs.writeFile(path.join(OUT, `${name}.png`), Buffer.from(res.result.data, 'base64'));
  console.log('  shot', name);
};

await send('Page.navigate', { url: `${BASE}/?demo=1#/inicio` });
await sleep(6000);
await shot('z1-feed');

await evaluate("location.hash = '/mi-perfil'");
await sleep(2500);
await shot('z2-miperfil');

// pestaña Seguidores
await evaluate("document.querySelector('.profile-tabs .tab:nth-child(2)').click()");
await sleep(1500);
const seguidores = await evaluate(`({
  hash: location.hash,
  tiles: document.querySelectorAll('.user-tile').length,
  heading: document.querySelector('.card-title, .empty h3')?.textContent || '',
})`);
console.log('seguidores:', JSON.stringify(seguidores));
await shot('z3-seguidores');

// pestaña Fotos
await evaluate("document.querySelector('.profile-tabs .tab:nth-child(3)').click()");
await sleep(1200);
const fotos = await evaluate(`({
  hash: location.hash,
  photos: document.querySelectorAll('.photo-grid img').length,
  empty: !!document.querySelector('.empty'),
})`);
console.log('fotos:', JSON.stringify(fotos));
await shot('z4-fotos');

await evaluate("document.querySelector('.profile-tabs .tab:nth-child(4)').click()");
await sleep(900);
await shot('z5-info');

await evaluate("location.hash = '/menu'");
await sleep(1200);
await shot('z6-menu');

await evaluate("location.hash = '/configuracion'");
await sleep(1000);
await shot('z7-config');

console.log('errores:', errors.slice(0, 5));
await send('Browser.close').catch(() => {});
proc.kill();
process.exit(0);
