import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9350;
const BASE = 'http://127.0.0.1:4173';
const OUT = path.resolve('.tmp');
const ROOT = process.cwd();

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, `flow-${Date.now()}`)}`,
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
let id = 0; const pending = new Map(); const errors = []; const logs = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description);
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  if (msg.method === 'Page.frameNavigated') logs.push('NAV ' + msg.params.frame.url);
  if (msg.method === 'Runtime.executionContextDestroyed') logs.push('CTX destroyed');
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
await send('Page.enable'); await send('Runtime.enable'); await send('Page.setLifecycleEventsEnabled', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'eval');
  return res.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expr, ms = 15000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if (await evaluate(expr)) return true; } catch { /* sigue */ }
    await sleep(200);
  }
  throw new Error(`timeout: ${expr}`);
};
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const data = res?.result?.data;
  if (data) await fs.writeFile(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('  shot', name);
};
const readJson = async (rel) => {
  let last = null;
  for (let i = 0; i < 6; i++) {
    try {
      const text = await fs.readFile(path.join(ROOT, rel), 'utf8');
      if (text.trim()) return JSON.parse(text);
    } catch (err) { last = err; }
    await new Promise((r) => setTimeout(r, 180));
  }
  throw last || new Error('JSON vacío: ' + rel);
};
const exists = async (rel) => { try { await fs.access(path.join(ROOT, rel)); return true; } catch { return false; } };

const checks = [];
const check = (label, ok, detail = '') => {
  checks.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`);
};

try {
  await send('Page.navigate', { url: `${BASE}/?demo=1#/inicio` });
  await waitFor("document.querySelectorAll('.post').length > 0", 25000);
  await sleep(1200);
  await shot('f1-feed');

  /* 1. publicar */
  await evaluate("location.hash = '/publicar'");
  await waitFor("document.querySelector('.compose-text')", 10000);
  await evaluate(`(() => {
    const ta = document.querySelector('.compose-text');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'Publicacion creada por el test de flujo');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(300);
  await shot('f2-publicar');
  await evaluate("window.__pub = (window.__pub || 0) + 1");
  await evaluate("document.querySelector('.compose-head .btn.primary').click()");
  try {
    await waitFor("location.hash.includes('inicio')", 15000);
  } catch (err) {
    const diag = await evaluate(`({
      hash: location.hash,
      toasts: [...document.querySelectorAll('.toast')].map(n => n.textContent),
      disabled: document.querySelector('.compose-head .btn.primary')?.disabled,
      text: document.querySelector('.compose-text')?.value,
      mark: window.__pub ?? null,
      perf: Math.round(performance.now()),
    })`);
    console.log('DIAG publicar', JSON.stringify(diag));
    await shot('f2b-error');
    throw err;
  }
  await sleep(1500);
  const index = await readJson('data/feed/index.json');
  const created1 = index.posts.find((entry) => entry.authorId === 'u_demo' && entry.id.startsWith('p_'));
  const feedFiles = (await fs.readdir(path.join(ROOT, 'data/feed'))).filter((f) => f.endsWith('.json') && f !== 'index.json');
  let newPost = null;
  for (const file of feedFiles) {
    const doc = await readJson(`data/feed/${file}`);
    if (doc.post.text === 'Publicacion creada por el test de flujo') newPost = doc.post;
  }
  check('publicar crea archivo de post e índice', Boolean(newPost) && index.posts.some((e) => e.id === newPost.id),
    newPost ? newPost.id : 'sin post');

  /* 2. reacción */
  await evaluate("location.hash = '/inicio'");
  await waitFor("document.querySelector('.post .post-act')", 10000);
  await sleep(600);
  await evaluate("document.querySelector('.post .post-act').click()");
  const firstPostId = await evaluate("document.querySelector('.post').dataset.postId");
  let likes = { likes: {} };
  for (let i = 0; i < 24; i++) {
    await sleep(300);
    likes = await readJson('data/likes/u_demo.json');
    if (likes.likes[firstPostId]) break;
  }
  check('reacción se guarda en likes/u_demo.json', Boolean(likes.likes[firstPostId]), firstPostId);

  /* 3. comentario en sección */
  await evaluate(`location.hash = '/p/${firstPostId}'`);
  await waitFor("document.querySelector('.comment-compose input')", 12000);
  await evaluate(`(() => {
    const input = document.querySelector('.comment-compose input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Comentario del test de flujo');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.comment-compose .btn.primary').click();
  })()`);
  await sleep(2500);
  const commentsIndexRel = `data/comentarios/${firstPostId}/index.json`;
  const commentsIndex = await readJson(commentsIndexRel);
  const commentRel = `data/comentarios/${firstPostId}/${commentsIndex.comments[0].id}.json`;
  const commentDoc = await readJson(commentRel);
  check('comentario en archivo propio + índice',
    commentDoc.comment.text === 'Comentario del test de flujo', commentsIndexRel);
  await shot('f3-post');

  /* 4. seguir */
  await evaluate("location.hash = '/buscar?q=carlos'");
  await waitFor("document.querySelector('.search-row .btn')", 12000);
  await sleep(400);
  // si ya lo sigue (de una corrida anterior), primero deja de seguirlo
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.search-row')].find((r) => /Carlos/i.test(r.textContent));
    const btn = row?.querySelector('.btn');
    if (btn && /Siguiendo/.test(btn.textContent)) btn.click();
  })()`);
  await sleep(1600);
  await evaluate("[...document.querySelectorAll('.search-row .btn')].find(b => b.textContent.includes('Seguir'))?.click()");
  await sleep(1200);
  let following = { following: [] }; let followers = { followers: [] };
  for (let i = 0; i < 20; i++) {
    following = await readJson('data/siguiendo/u_demo.json');
    followers = await readJson('data/seguidores/u_carlos.json');
    if (following.following.includes('u_carlos') && followers.followers.includes('u_demo')) break;
    await sleep(400);
  }
  check('seguir escribe siguiendo y seguidores',
    following.following.includes('u_carlos') && followers.followers.includes('u_demo'),
    `siguiendo=${following.following.length}`);

  /* 5. editar perfil desde Mi perfil */
  await evaluate("location.hash = '/mi-perfil'");
  await waitFor("document.querySelector('.profile-dots')", 12000);
  await shot('f4-miperfil');
  await evaluate("document.querySelector('.profile-dots').click()");
  await waitFor("document.querySelector('.modal .settings-row')", 8000);
  await shot('f5-menu-perfil');
  await evaluate("[...document.querySelectorAll('.modal')].pop().querySelector('.settings-row').click()");
  await waitFor("[...document.querySelectorAll('.modal')].some(m => m.querySelector('textarea'))", 8000);
  await evaluate(`(() => {
    const area = [...document.querySelectorAll('.modal')].pop().querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, 'Biografia actualizada por el test');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    [...[...document.querySelectorAll('.modal')].pop().querySelectorAll('.btn.primary')].pop().click();
  })()`);
  let meDoc = { user: {} };
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    meDoc = await readJson('data/usuarios/u_demo.json');
    if (meDoc.user.bio === 'Biografia actualizada por el test') break;
  }
  check('editar perfil guarda en usuarios/u_demo.json',
    meDoc.user.bio === 'Biografia actualizada por el test');

  /* 6. secciones */
  await evaluate("location.hash = '/notificaciones'");
  await sleep(1200);
  await shot('f6-notificaciones');
  await evaluate("location.hash = '/configuracion'");
  await sleep(1000);
  await shot('f7-configuracion');
  await evaluate("location.hash = '/seguidores'");
  await sleep(1200);
  await shot('f8-seguidores');
  await evaluate("location.hash = '/buscar'");
  await sleep(800);
  await shot('f9-buscar');

  /* 7. atrás nativo */
  const backTest = await evaluate(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    location.hash = '/menu'; await sleep(600);
    location.hash = '/configuracion'; await sleep(600);
    history.back(); await sleep(700);
    return location.hash;
  })()`);
  check('volver atrás regresa a la sección anterior', backTest.includes('/menu'), backTest);

  console.log('NAVS:', logs.filter((l) => l.startsWith('NAV') || l.startsWith('CTX')).slice(-12));
  console.log('LOGS:', logs.filter((l) => l.startsWith('[route]') || l.startsWith('[publish]')).slice(-30));
  console.log('\nERRORES:', errors.filter((e) => !/favicon|ERR_|net::/i.test(e)).slice(0, 6));
  const failed = checks.filter((item) => !item.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} comprobaciones OK`);
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error('💥', err.message);
  console.log('ERRORES:', errors.slice(0, 8));
  process.exitCode = 1;
} finally {
  await send('Browser.close').catch(() => {});
  proc.kill();
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}
