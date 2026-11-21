import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9380;
const BASE = 'http://127.0.0.1:4173';
const ROOT = process.cwd();
const UNIQUE = `lucas${Date.now().toString(36).slice(-5)}`;
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ROOT, '.tmp', `f-${Date.now()}`)}`,
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
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (res.result?.exceptionDetails) return { error: res.result.exceptionDetails.exception?.description };
  return res.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expr, ms = 30000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await evaluate(expr)) return true;
    await sleep(250);
  }
  return false;
};
const readJson = async (rel) => JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8'));
const checks = [];
const check = (label, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

async function register(username, first = 'Lucas', last = 'Perez') {
  await evaluate("[...document.querySelectorAll('.auth-card .btn')].find((b) => /Crear una cuenta/.test(b.textContent))?.click()");
  await sleep(600);
  await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('.auth-card input')];
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(inputs[0], '${first}');
    set(inputs[1], '${last}');
    set(inputs[2], '${username}');
    set(inputs[3], 'prueba1234');
    document.querySelector('.auth-card form button[type=submit]').click();
  })()`);
  await sleep(2500);
}

try {
  await send('Page.navigate', { url: `${BASE}/` });
  await waitFor("!!document.querySelector('.auth-card')", 30000);

  // 1) registro + bienvenida
  await register(UNIQUE);
  const entered = await waitFor("!!document.querySelector('.topbar')", 20000);
  check('registro y entrada', entered);

  const index = await readJson('data/usuarios/index.json');
  const me = index.users.find((user) => user.username === UNIQUE);
  check('usuario en el índice', Boolean(me), me?.id);
  const notifs = me ? await readJson(`data/notificaciones/${me.id}.json`) : null;
  check('notificación de bienvenida', Boolean(notifs?.items?.[0]?.type === 'welcome'),
    notifs?.items?.[0]?.text?.slice(0, 40));

  // 2) estado civil
  await evaluate("location.hash = '/mi-perfil'");
  await waitFor("!!document.querySelector('.profile-dots')", 15000);
  await evaluate("document.querySelector('.profile-dots').click()");
  await waitFor("document.querySelector('.modal .settings-row')", 8000);
  await evaluate("[...document.querySelectorAll('.modal')].pop().querySelector('.settings-row').click()");
  await sleep(900);
  const hasSelect = await evaluate("!!document.querySelector('.modal select')");
  check('selector de estado civil', hasSelect);
  await evaluate(`(() => {
    const modal = [...document.querySelectorAll('.modal')].pop();
    const select = modal.querySelector('select');
    select.value = 'En pareja';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    [...modal.querySelectorAll('.btn.primary')].pop().click();
  })()`);
  let saved = null;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const doc = await readJson(`data/usuarios/${me.id}.json`);
    if (doc.user.maritalStatus) { saved = doc.user.maritalStatus; break; }
  }
  check('estado civil guardado', saved === 'En pareja', saved || 'sin guardar');

  // 3) usuario duplicado
  await evaluate("localStorage.removeItem('nb.session.v2'); location.reload()");
  await waitFor("!!document.querySelector('.auth-card')", 30000);
  await evaluate("[...document.querySelectorAll('.auth-card .btn')].find((b) => /Crear una cuenta/.test(b.textContent))?.click()");
  await sleep(600);
  await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('.auth-card input')];
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(inputs[0], 'Otro');
    set(inputs[1], 'Usuario');
    set(inputs[2], '${UNIQUE}');
    set(inputs[3], 'prueba1234');
    document.querySelector('.auth-card form button[type=submit]').click();
  })()`);
  await sleep(3000);
  const duplicateError = await evaluate("document.querySelector('.auth-card .field-error')?.textContent || ''");
  check('usuario duplicado rechazado', /uso/i.test(duplicateError), duplicateError);

  // 4) login de nuevo
  await evaluate("document.querySelector('.auth-card .btn[type=button]')?.click()");
  await sleep(500);
  await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('.auth-card input')];
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(inputs[0], '${UNIQUE}');
    set(inputs[1], 'prueba1234');
    document.querySelector('.auth-card form button[type=submit]').click();
  })()`);
  const back = await waitFor("!!document.querySelector('.topbar')", 20000);
  check('login con la cuenta creada', back);

  // 5) buscador solo personas
  await evaluate("location.hash = '/buscar?q=lucas'");
  await sleep(1500);
  const search = await evaluate(`({
    rows: document.querySelectorAll('.search-row').length,
    hasTabs: document.querySelectorAll('.tabs .tab').length,
    text: document.querySelector('.col-center')?.innerText?.slice(0, 120) || '',
  })`);
  check('buscador solo personas', search.rows >= 1 && search.hasTabs === 0, JSON.stringify(search.rows));

  // 6) canales
  await evaluate("location.hash = '/grupos/canales'");
  await sleep(1200);
  const channelPage = await evaluate("document.querySelector('.page-head h1')?.textContent || ''");
  check('sección de canales', /canales/i.test(channelPage), channelPage);
  await evaluate("document.querySelector('.page-head .btn.primary').click()");
  await waitFor("!!document.querySelector('.modal input')", 8000);
  await evaluate(`(() => {
    const modal = [...document.querySelectorAll('.modal')].pop();
    const input = modal.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Novedades Zuma');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    [...modal.querySelectorAll('.btn.primary')].pop().click();
  })()`);
  await sleep(2500);
  const groupsDoc = await readJson('data/grupos.json');
  const channel = groupsDoc.groups.find((group) => group.type === 'channel');
  check('canal creado', Boolean(channel), channel?.name);

  console.log('\nerrores:', errors.slice(0, 5));
  const passed = checks.filter(Boolean).length;
  console.log(`${passed}/${checks.length} comprobaciones OK`);
  process.exitCode = passed === checks.length ? 0 : 1;
} catch (err) {
  console.error('💥', err.message);
  console.log('errores:', errors.slice(0, 6));
  process.exitCode = 1;
} finally {
  await send('Browser.close').catch(() => {});
  proc.kill();
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}
