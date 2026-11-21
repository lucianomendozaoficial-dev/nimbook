import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9344;
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:4173';
const OUT = path.resolve('.tmp');

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); } }, 20000);
    });
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'eval error');
    return res.result?.value;
  }
  async waitFor(expression, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (await this.eval(expression)) return true; } catch { /* sigue */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`timeout: ${expression}`);
  }
}

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, 'smoke-profile')}`,
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

let version = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (res.ok) { version = await res.json(); break; }
  } catch { /* espera */ }
}
if (!version) { console.error('Edge no arrancó'); process.exit(1); }

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
const cdp = new Cdp(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
cdp.sessionId = sessionId;
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

const errors = [];
cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description || 'exception'));
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') errors.push(p.args.map((a) => a.value || a.description || '').join(' '));
});

async function shot(name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('  shot', name);
}

async function go(hash) {
  await cdp.eval(`location.hash = ${JSON.stringify(hash)}`);
  await new Promise((r) => setTimeout(r, 900));
}

try {
  await cdp.send('Page.navigate', { url: `${BASE}/?demo=1#/inicio` });
  await cdp.waitFor("document.querySelector('.topbar') && !document.getElementById('splash')", 25000);
  await cdp.waitFor("document.querySelectorAll('.post').length > 0", 20000);
  await new Promise((r) => setTimeout(r, 1200));
  await shot('v2-feed');

  const feed = await cdp.eval(`(() => ({
    posts: document.querySelectorAll('.post').length,
    reactions: document.querySelectorAll('.post .reaction-svg').length,
    headerBg: getComputedStyle(document.querySelector('.topbar')).backgroundImage.slice(0, 40),
    brand: getComputedStyle(document.querySelector('.brand-word')).color,
    nav: document.querySelector('.tb-nav')?.innerText || '',
  }))()`);
  console.log('FEED', feed);

  // mantener apretado para reacciones (con el post a la vista)
  const picker = await cdp.eval(`(async () => {
    const btn = document.querySelector('.post .post-act');
    btn.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 500));
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await new Promise(r => setTimeout(r, 520));
    const pop = document.querySelector('.react-pop');
    const count = pop ? pop.querySelectorAll('.react-option').length : 0;
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    return { open: !!pop, count };
  })()`);
  console.log('PICKER', picker);
  await shot('v2-reacciones');

  await go('/menu'); await shot('v2-menu');
  await go('/ajustes'); await shot('v2-cuenta');
  await go('/ajustes/apariencia'); await shot('v2-personalizacion');
  await go('/seguidores'); await shot('v2-seguidores');

  console.log('ERRORES:', errors.filter((e) => !/favicon|net::|ERR_/i.test(e)).slice(0, 8));
} catch (err) {
  console.error('💥', err.message);
  console.log('ERRORES:', errors.slice(0, 10));
  process.exitCode = 1;
} finally {
  await cdp.send('Browser.close').catch(() => {});
  proc.kill();
  process.exit(process.exitCode || 0);
}
