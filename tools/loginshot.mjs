import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9371;
const BASE = 'http://127.0.0.1:4173';
const OUT = path.resolve('.tmp');
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, `login-${Date.now()}`)}`,
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
let id = 0; const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
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
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return res.result?.result?.value;
};
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  if (res?.result?.data) await fs.writeFile(path.join(OUT, `${name}.png`), Buffer.from(res.result.data, 'base64'));
  console.log('shot', name);
};

await send('Page.navigate', { url: `${BASE}/` });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 300));
  if (await evaluate("!!document.querySelector('.auth-card')")) break;
}
await new Promise((r) => setTimeout(r, 800));
console.log('svg crudo visible:', await evaluate(`document.body.innerText.includes('<svg')`));
await shot('z0-login');

await evaluate("[...document.querySelectorAll('.auth-card .btn')].find((b) => /Crear una cuenta/.test(b.textContent))?.click()");
await new Promise((r) => setTimeout(r, 700));
await shot('z0-registro');

await send('Browser.close').catch(() => {});
proc.kill();
process.exit(0);
