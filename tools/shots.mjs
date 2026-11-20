/* ==========================================================================
   shots.mjs - verificacion visual y de interaccion con Edge headless (CDP)
   Uso: node tools/shots.mjs [--base http://127.0.0.1:4173] [--only feed,profile]
   ========================================================================== */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.tmp');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:4173';

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',') : null;

await fs.mkdir(OUT, { recursive: true });

/* --------------------------------- CDP ---------------------------------- */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params, msg.sessionId);
      }
    });
  }

  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 30000);
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate error');
    }
    return result.result?.value;
  }

  async waitFor(expression, timeout = 15000, interval = 120) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const value = await this.evaluate(expression);
        if (value) return value;
      } catch { /* seguimos */ }
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`waitFor timeout: ${expression}`);
  }
}

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  const info = await res.json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
}

/* ------------------------------ navegador -------------------------------- */

async function launchBrowser() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return { proc: null };
  } catch { /* no estaba corriendo */ }

  const proc = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(OUT, 'cdp-profile')}`,
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return { proc };
    } catch { /* esperando */ }
  }
  throw new Error('Edge no arrancó');
}

/* ------------------------------- helpers -------------------------------- */

const shots = [];

async function shot(cdp, name, { fullPage = false } = {}) {
  const params = { format: 'png', captureBeyondViewport: fullPage };
  if (fullPage) {
    const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
    params.clip = {
      x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 6000),
      scale: 1,
    };
  }
  const { data } = await cdp.send('Page.captureScreenshot', params);
  const file = path.join(OUT, `${name}.png`);
  await fs.writeFile(file, Buffer.from(data, 'base64'));
  shots.push(name);
  console.log(`  [shot] ${name}.png`);
}

async function setViewport(cdp, width, height, { mobile = false, scale = 2, theme = 'light' } = {}) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: scale, mobile,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: mobile, ...(mobile ? { maxTouchPoints: 5 } : {}),
  });
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  });
}

async function goto(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await cdp.waitFor("document.readyState === 'complete'", 20000);
  await cdp.waitFor("document.querySelector('.topbar') && !document.getElementById('splash')", 25000);
  await cdp.waitFor("document.querySelectorAll('.post').length > 0 || document.querySelector('.auth')", 20000);
  await new Promise((r) => setTimeout(r, 700));
}

async function gotoAuth(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await cdp.waitFor("document.readyState === 'complete'", 20000);
  await cdp.waitFor("document.querySelector('.auth-card') && !document.getElementById('splash')", 25000);
  await new Promise((r) => setTimeout(r, 400));
}

async function click(cdp, selector, { index = 0 } = {}) {
  return cdp.evaluate(`(() => {
    const nodes = document.querySelectorAll(${JSON.stringify(selector)});
    const node = nodes[${index}];
    if (!node) return 'missing: ' + ${JSON.stringify(selector)};
    node.click();
    return 'ok';
  })()`);
}

async function setValue(cdp, selector, value) {
  return cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return 'missing';
    const proto = node.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
}

/** Espera a que se carguen las imágenes visibles (las lazy de fuera no cuentan). */
async function waitImages(cdp, timeout = 8000) {
  try {
    await cdp.waitFor(`(() => {
      const imgs = [...document.images].filter(i => {
        const r = i.getBoundingClientRect();
        return r.width > 4 && r.bottom > -100 && r.top < innerHeight + 200;
      });
      return imgs.every(i => i.complete);
    })()`, timeout, 200);
    await new Promise((r) => setTimeout(r, 350));
  } catch { /* seguimos igualmente */ }
}

/* -------------------------------- tests --------------------------------- */

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
}

async function run() {
  const { proc } = await launchBrowser();
  const cdp = await connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  cdp.sessionId = sessionId;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  if (process.argv.includes('--clean')) {
    // capturas limpias para la documentación (no modifica datos)
    const docs = path.join(ROOT, 'docs');
    await fs.mkdir(docs, { recursive: true });
    await setViewport(cdp, 1440, 1000, { theme: 'light' });
    await cdp.send('Page.navigate', { url: `${BASE}/?demo=1#/feed` });
    await cdp.waitFor("document.readyState === 'complete'", 20000);
    await new Promise((r) => setTimeout(r, 1200));
    await cdp.evaluate(`localStorage.setItem('nb.theme.v1','light')`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelectorAll('.post').length > 0", 25000);
    await new Promise((r) => setTimeout(r, 900));
    await waitImages(cdp);
    let { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(docs, 'preview-feed.png'), Buffer.from(data, 'base64'));

    await setViewport(cdp, 1440, 1000, { theme: 'dark' });
    await cdp.evaluate(`localStorage.setItem('nb.theme.v1','dark')`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.story-card')", 20000);
    await new Promise((r) => setTimeout(r, 1400));
    await waitImages(cdp);
    ({ data } = await cdp.send('Page.captureScreenshot', { format: 'png' }));
    await fs.writeFile(path.join(docs, 'preview-dark.png'), Buffer.from(data, 'base64'));

    await setViewport(cdp, 390, 844, { mobile: true, scale: 3, theme: 'light' });
    await cdp.evaluate(`localStorage.setItem('nb.theme.v1','light'); location.hash = '/feed'`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelectorAll('.post').length > 0", 20000);
    await new Promise((r) => setTimeout(r, 1200));
    await waitImages(cdp);
    ({ data } = await cdp.send('Page.captureScreenshot', { format: 'png' }));
    await fs.writeFile(path.join(docs, 'preview-mobile.png'), Buffer.from(data, 'base64'));

    console.log('Capturas de documentación en docs/');
    await cdp.send('Browser.close').catch(() => {});
    proc?.kill?.();
    return;
  }

  if (process.argv.includes('--diag')) {
    await setViewport(cdp, 390, 844, { mobile: true, scale: 3, theme: 'light' });
    await goto(cdp, `${BASE}/?demo=1#/feed`);
    const info = await cdp.evaluate(`(() => {
      const g = (sel) => { const n = document.querySelector(sel); if (!n) return null;
        const cs = getComputedStyle(n); const r = n.getBoundingClientRect();
        return { display: cs.display, width: Math.round(r.width), left: Math.round(r.left),
                 cols: cs.gridTemplateColumns, maxWidth: cs.maxWidth, padding: cs.padding }; };
      return {
        innerWidth: window.innerWidth,
        dpr: window.devicePixelRatio,
        visual: window.visualViewport?.width,
        main: g('.main'), left: g('.col-left'), center: g('.col-center'), right: g('.col-right'),
        sheets: [...document.styleSheets].map(s => ({ href: s.href, rules: (() => { try { return s.cssRules.length; } catch { return -1; } })() })),
        match900: matchMedia('(max-width: 900px)').matches,
        match767: matchMedia('(max-width: 767px)').matches,
        html: document.documentElement.className,
      };
    })()`);
    console.log(JSON.stringify(info, null, 2));
    await cdp.evaluate(`location.hash = '/messages'`);
    await new Promise((r) => setTimeout(r, 1500));
    const chatInfo = await cdp.evaluate(`(() => {
      const chat = document.querySelector('.msgr-chat');
      const empty = document.querySelector('.chat-empty');
      return {
        chatHTML: chat ? chat.innerHTML.slice(0, 300) : null,
        chatDisplay: chat ? getComputedStyle(chat).display : null,
        chatHeight: chat ? Math.round(chat.getBoundingClientRect().height) : null,
        hasEmpty: !!empty,
        emptyRect: empty ? (() => { const r = empty.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; })() : null,
        convs: document.querySelectorAll('.conv').length,
        images: [...document.images].slice(0, 8).map(i => ({ src: i.src.slice(-40), ok: i.complete, w: i.naturalWidth })),
      };
    })()`);
    console.log(JSON.stringify(chatInfo, null, 2));
    await shot(cdp, 'diag-mobile');
    await cdp.evaluate(`location.hash = '/u/ana.torres'`);
    await new Promise((r) => setTimeout(r, 1600));
    const profileInfo = await cdp.evaluate(`(() => {
      const g = (sel) => { const n = document.querySelector(sel); if (!n) return null;
        const cs = getComputedStyle(n); const r = n.getBoundingClientRect();
        return { w: Math.round(r.width), l: Math.round(r.left), display: cs.display,
                 cols: cs.gridTemplateColumns, dir: cs.flexDirection, maxW: cs.maxWidth,
                 pad: cs.padding, ml: cs.marginLeft, pos: cs.position }; };
      return {
        innerWidth: window.innerWidth,
        main: g('.main'), center: g('.col-center'), root: g('.col-center > div'),
        head: g('.profile-head'), mainRow: g('.profile-main'), avatar: g('.profile-avatar'),
        titles: g('.profile-titles'), actions: g('.profile-actions'),
        cover: g('.profile-cover'), grid: g('.profile-grid'),
      };
    })()`);
    console.log('PROFILE', JSON.stringify(profileInfo, null, 2));
    await shot(cdp, 'diag-mobile-profile');
    await cdp.evaluate(`location.hash = '/feed'; localStorage.setItem('nb.theme.v1','dark')`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.story-card.create')", 20000);
    await new Promise((r) => setTimeout(r, 1200));
    const storyStyles = await cdp.evaluate(`(() => {
      const card = document.querySelector('.story-card.create');
      const bottom = card.querySelector('.create-bottom');
      const cs = getComputedStyle(card);
      const bs = getComputedStyle(bottom);
      return { theme: document.documentElement.dataset.theme,
        cardBg: cs.backgroundColor, cardColor: cs.color, cardAppearance: cs.appearance,
        bottomBg: bs.backgroundColor, bottomColor: bs.color,
        cardRect: [Math.round(card.getBoundingClientRect().width), Math.round(card.getBoundingClientRect().height)] };
    })()`);
    console.log('STORY', JSON.stringify(storyStyles, null, 2));
    await shot(cdp, 'diag-story-dark');
    await cdp.evaluate(`location.hash = '/feed'`);
    await new Promise((r) => setTimeout(r, 1200));
    await cdp.send('Browser.close').catch(() => {});
    proc?.kill?.();
    return;
  }

  if (process.argv.includes('--empty')) {
    // Instalación nueva: conectar, registrarse y ver el feed vacío
    await setViewport(cdp, 1280, 860, { theme: 'light' });
    await cdp.send('Page.navigate', { url: `${BASE}/index.html` });
    await cdp.waitFor("document.readyState === 'complete'", 20000);
    await new Promise((r) => setTimeout(r, 900));
    await cdp.evaluate(`localStorage.clear(); localStorage.setItem('nb.theme.v1','light')`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.auth-card')", 20000);

    await cdp.evaluate(`[...document.querySelectorAll('.auth-card .btn')].find(b => /Crear una cuenta nueva/.test(b.textContent))?.click()`);
    await cdp.waitFor(`document.querySelector('.auth-card input[placeholder="Tu nombre"]')`, 10000);
    await setValue(cdp, `.auth-card input[placeholder="Tu nombre"]`, 'Lucia');
    await setValue(cdp, `.auth-card input[placeholder="Tu apellido"]`, 'Mendoza');
    await setValue(cdp, `.auth-card input[placeholder="usuario (sin espacios)"]`, `lucia${Date.now().toString().slice(-5)}`);
    await setValue(cdp, `.auth-card input[placeholder="Contraseña (6 o más)"]`, 'secreto123');
    await setValue(cdp, `.auth-card input[placeholder="Ej. 2615551234"]`, '2615551234');
    await setValue(cdp, `.auth-card input[placeholder="@tuusuario"]`, '@luciamendoza');
    await shot(cdp, 'empty-registro');
    await cdp.evaluate(`[...document.querySelectorAll('.auth-card .btn')].find(b => b.textContent.trim() === 'Crear mi cuenta')?.click()`);
    try {
      await cdp.waitFor("document.querySelector('.topbar')", 15000);
    } catch (err) {
      console.log('ERROR VISIBLE:', await cdp.evaluate(`document.querySelector('.field-error:not(.hide)')?.textContent || ''`));
      console.log('PANTALLA:', (await cdp.evaluate('document.body.innerText')).slice(0, 300).replace(/\n+/g, ' | '));
      throw err;
    }
    await new Promise((r) => setTimeout(r, 1800));
    await shot(cdp, 'empty-feed');
    const empty = await cdp.evaluate(`(() => ({
      posts: document.querySelectorAll('.post').length,
      emptyState: !!document.querySelector('.empty'),
      title: document.querySelector('.empty h3')?.textContent || '',
      user: document.querySelector('.side-label')?.textContent || '',
      stories: document.querySelectorAll('.story-card').length,
    }))()`);
    check('registro crea la cuenta y deja el muro vacío',
      empty.posts === 0 && empty.emptyState === true && empty.user === 'Lucia Mendoza',
      `${empty.posts} posts · "${empty.title}" · usuario ${empty.user}`);
    await cdp.send('Browser.close').catch(() => {});
    proc?.kill?.();
    return;
  }

  const consoleErrors = [];
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const text = params.args.map((a) => a.value || a.description || '').join(' ');
      consoleErrors.push(text);
    }
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.exception?.description || 'exception');
  });

  try {
    /* ------------------------- primera visita ------------------------- */
    console.log('\n> Primera visita: acceso');
    await setViewport(cdp, 1440, 1000, { theme: 'light' });
    await cdp.send('Page.navigate', { url: `${BASE}/index.html` });
    await cdp.waitFor("document.readyState === 'complete'", 20000);
    await new Promise((r) => setTimeout(r, 900));
    await cdp.evaluate(`localStorage.clear(); localStorage.setItem('nb.theme.v1','light')`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.auth-card') && !document.getElementById('splash')", 25000);
    await new Promise((r) => setTimeout(r, 500));
    await shot(cdp, '00-acceso');
    const connForm = await cdp.evaluate(`(() => ({
      inputs: document.querySelectorAll('.auth-card .input').length,
      hasLogo: !!document.querySelector('.auth-logo img'),
      hasIllustration: !!document.querySelector('.auth-illustration svg'),
      title: document.querySelector('.auth-card h2')?.textContent || '',
    }))()`);
    check('pantalla de acceso con ilustración', connForm.inputs >= 2 && connForm.hasIllustration,
      `${connForm.inputs} campos · "${connForm.title}"`);

    await cdp.evaluate(`[...document.querySelectorAll('.auth-card .btn')].find(b => /Crear una cuenta nueva/.test(b.textContent))?.click()`);
    await cdp.waitFor(`document.querySelector('.auth-card input[placeholder="Tu nombre"]')`, 10000);
    await new Promise((r) => setTimeout(r, 400));
    await shot(cdp, '00b-registro');
    const registerForm = await cdp.evaluate(`(() => ({
      fields: document.querySelectorAll('.auth-card .field').length,
      hasBirthday: !!document.querySelector('.auth-card input[type="date"]'),
      hasWhatsapp: !!document.querySelector('.auth-card input[placeholder="Ej. 2615551234"]'),
      hasInstagram: !!document.querySelector('.auth-card input[placeholder="@tuusuario"]'),
    }))()`);
    check('registro pide nombre, apellido, nacimiento, whatsapp e instagram',
      registerForm.hasBirthday && registerForm.hasWhatsapp && registerForm.hasInstagram && registerForm.fields >= 7,
      `${registerForm.fields} campos`);
    await cdp.evaluate(`[...document.querySelectorAll('.auth-card .btn')].find(b => /Ya tengo una cuenta/.test(b.textContent))?.click()`);
    await cdp.waitFor(`document.querySelector('.auth-card input[placeholder="Tu usuario"]')`, 10000);

    await setValue(cdp, '.auth-card input[placeholder="Tu usuario"]', 'nico.gimenez');
    await setValue(cdp, '.auth-card input[type="password"]', 'demo1234');
    await cdp.evaluate(`[...document.querySelectorAll('.auth-card .btn')].find(b => /Iniciar sesión/.test(b.textContent)).click()`);
    await cdp.waitFor("document.querySelector('.topbar')", 30000);
    await cdp.waitFor("document.querySelectorAll('.post').length > 0", 20000);
    check('acceso con cuenta existente', await cdp.evaluate(`!!document.querySelector('.topbar')`));

    /* --------------------------- escritorio --------------------------- */
    console.log('\n> Escritorio 1440x1000 (tema claro)');
    await setViewport(cdp, 1440, 1000, { theme: 'light' });
    await cdp.evaluate(`location.hash = '/feed'`);
    await cdp.waitFor("document.querySelectorAll('.post').length > 0", 15000);
    await waitImages(cdp);
    await shot(cdp, '01-feed-light');

    const stats = await cdp.evaluate(`(() => ({
      posts: document.querySelectorAll('.post').length,
      stories: document.querySelectorAll('.story-card').length,
      contacts: document.querySelectorAll('.rail-item').length,
      unread: document.querySelector('.tb-btn .badge-dot:not(.hide)')?.textContent || '',
      theme: document.documentElement.dataset.theme,
      postHeights: [...document.querySelectorAll('.post')].slice(0,3).map(p => Math.round(p.getBoundingClientRect().height)),
      storyBox: (() => { const s = [...document.querySelectorAll('.story-card')][1]; if (!s) return null;
        const r = s.getBoundingClientRect(); const i = s.querySelector('img'); const ir = i?.getBoundingClientRect();
        return { card: [Math.round(r.width), Math.round(r.height)], img: i ? [Math.round(ir.width), Math.round(ir.height), Math.round(ir.top - r.top)] : null }; })(),
    }))()`);
    check('feed renderiza publicaciones', stats.posts >= 5, `${stats.posts} posts`);
    check('historias visibles', stats.stories >= 4, `${stats.stories} tarjetas`);
    check('contactos en la columna derecha', stats.contacts >= 4, `${stats.contacts} contactos`);
    check('badge de notificaciones', stats.unread !== '', `badge="${stats.unread}"`);
    console.log('    storyBox:', JSON.stringify(stats.storyBox));

    /* reacciones: quitar, poner y persistir tras recargar */
    const reaction1 = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let btn = document.querySelector('.post .post-act');
      if (btn.classList.contains('liked')) { btn.click(); await sleep(1400); }
      btn = document.querySelector('.post .post-act');
      const before = btn.classList.contains('liked');
      btn.click();
      await sleep(1600);
      return { before, after: document.querySelector('.post .post-act').classList.contains('liked') };
    })()`);
    check('reacción se activa al hacer clic', reaction1.after === true && reaction1.before === false,
      JSON.stringify(reaction1));

    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.post .post-act')", 20000);
    await new Promise((r) => setTimeout(r, 1200));
    const reaction2 = await cdp.evaluate(
      `document.querySelector('.post .post-act').classList.contains('liked')`);
    check('reacción persiste tras recargar', reaction2 === true, `liked=${reaction2}`);

    /* selector de reacciones (hover) */
    const pop = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const btn = document.querySelector('.post .post-act');
      btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await sleep(500);
      const bar = document.querySelector('.react-pop');
      if (!bar) return { open: false };
      const options = [...bar.querySelectorAll('button')].map(b => b.textContent);
      bar.querySelectorAll('button')[1].click();
      await sleep(1500);
      return { open: true, options,
        label: document.querySelector('.post .post-act span:last-child')?.textContent || '' };
    })()`);
    check('barra de reacciones y cambio de reacción',
      pop.open === true && pop.options.length === 6 && /encanta/i.test(pop.label),
      `${(pop.options || []).join(' ')} -> ${pop.label}`);

    /* comentario */
    const commentResult = await cdp.evaluate(`(async () => {
      const post = document.querySelector('.post');
      const commentBtn = post.querySelectorAll('.post-act')[1];
      commentBtn.click();
      await new Promise(r => setTimeout(r, 400));
      const input = post.querySelector('input[data-role="comment-input"]');
      if (!input) return { error: 'sin input' };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Comentario automatico de prueba');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 1800));
      return { comments: document.querySelectorAll('.post .comment').length,
               text: post.querySelector('.comment-text')?.textContent || '' };
    })()`);
    check('comentario creado', commentResult.comments >= 1,
      `${commentResult.comments} comentarios · "${(commentResult.text || '').slice(0, 40)}"`);
    await shot(cdp, '03-comment');

    /* modal de publicación */
    await click(cdp, '.composer-open');
    await cdp.waitFor("document.querySelector('.modal .compose-text')");
    await new Promise((r) => setTimeout(r, 350));
    await shot(cdp, '04-composer');
    const composerText = await cdp.evaluate(`(() => {
      const ta = document.querySelector('.modal .compose-text');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'Publicacion de prueba desde el test automatico');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return document.querySelector('.modal .btn.primary')?.disabled;
    })()`);
    check('composer habilita Publicar', composerText === false, `disabled=${composerText}`);
    await cdp.evaluate(`document.querySelector('.modal .btn.primary').click()`);
    const created = await cdp.waitFor(
      `[...document.querySelectorAll('.post-text')].some(n => n.textContent.includes('test automatico'))`,
      20000,
    );
    await new Promise((r) => setTimeout(r, 900));
    const newPost = await cdp.evaluate(`(() => ({
      count: document.querySelectorAll('.post').length,
      first: [...document.querySelectorAll('.post-text')].map(n => n.textContent).find(t => t.includes('test automatico')) || '',
    }))()`);
    check('publicación creada', Boolean(created) && newPost.first.includes('test automatico'),
      `"${newPost.first.slice(0, 40)}"`);

    /* búsqueda del topbar */
    const searchDrop = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const input = document.querySelector('.tb-search input');
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'ana');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(700);
      const dd = document.querySelector('.tb-search .dd');
      return { visible: !!dd && !dd.classList.contains('hide'),
               items: dd ? dd.querySelectorAll('.dd-item').length : 0 };
    })()`);
    check('buscador del topbar muestra resultados',
      searchDrop.visible && searchDrop.items >= 2, `${searchDrop.items} resultados`);
    await shot(cdp, '04b-search-dropdown');
    await cdp.evaluate(`document.querySelector('.tb-search input').blur();
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));`);
    await new Promise((r) => setTimeout(r, 250));

    /* menú de cuenta */
    const accountMenu = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      document.querySelector('.avatar-btn').click();
      await sleep(400);
      const dd = [...document.querySelectorAll('.dd')].find(n => /Cerrar sesión/.test(n.textContent));
      return { items: dd ? [...dd.querySelectorAll('.dd-item')].map(n => n.textContent.trim()) : [] };
    })()`);
    check('menú de cuenta abre con opciones', accountMenu.items.length >= 5,
      accountMenu.items.slice(0, 8).join(' · '));
    await shot(cdp, '04c-account-menu');
    await cdp.evaluate(`document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);

    /* historias */
    const storyViewer = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const cards = [...document.querySelectorAll('.story-card')];
      cards[1].click();
      await sleep(600);
      const viewer = document.querySelector('.story-viewer');
      const bars = viewer ? viewer.querySelectorAll('.sv-bar').length : 0;
      const img = viewer?.querySelector('img');
      viewer?.querySelector('.sv-close')?.click();
      await sleep(300);
      return { open: !!viewer, bars, img: img?.src || '', gone: !document.querySelector('.story-viewer') };
    })()`);
    check('visor de historias', storyViewer.open && storyViewer.bars >= 1 && storyViewer.gone,
      `${storyViewer.bars} segmentos`);

    /* perfil */
    await cdp.evaluate(`location.hash = '/u/ana.torres'`);
    await new Promise((r) => setTimeout(r, 1500));
    await shot(cdp, '05-profile');
    check('perfil carga portada', await cdp.evaluate(`!!document.querySelector('.profile-head')`));

    /* mensajes */
    await cdp.evaluate(`location.hash = '/messages'`);
    await cdp.waitFor("document.querySelector('.conv')", 15000);
    await waitImages(cdp);
    await shot(cdp, '06-messages');
    await cdp.evaluate(`document.querySelector('.conv').click()`);
    await cdp.waitFor("document.querySelector('.chat-input textarea')", 15000);
    await new Promise((r) => setTimeout(r, 700));
    const chat = await cdp.evaluate(`(async () => {
      const ta = document.querySelector('.chat-input textarea');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'Mensaje de prueba');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 2000));
      return { messages: document.querySelectorAll('.msg').length,
               last: [...document.querySelectorAll('.msg .bubble')].pop()?.textContent || '' };
    })()`);
    check('chat envía mensajes', (chat.last || '').includes('Mensaje de prueba'),
      `${chat.messages} burbujas · "${(chat.last || '').slice(0, 30)}"`);
    await shot(cdp, '07-chat');

    /* amigos / grupos / notificaciones / ajustes */
    await cdp.evaluate(`location.hash = '/friends'`);
    await new Promise((r) => setTimeout(r, 900));
    await waitImages(cdp, 6000);
    await shot(cdp, '08-friends');

    /* aceptar solicitud de amistad */
    await cdp.evaluate(`location.hash = '/friends/requests'`);
    await cdp.waitFor("document.querySelector('.friend-card')", 12000);
    const beforeFriends = await cdp.evaluate(`document.querySelectorAll('.friend-card').length`);
    await cdp.evaluate(`[...document.querySelectorAll('.friend-card .btn')].find(b => /Confirmar/.test(b.textContent))?.click()`);
    await new Promise((r) => setTimeout(r, 2200));
    const afterFriends = await cdp.evaluate(`document.querySelectorAll('.friend-card').length`);
    check('aceptar solicitud de amistad', afterFriends < beforeFriends,
      `${beforeFriends} -> ${afterFriends} tarjetas`);
    await shot(cdp, '08b-friend-accepted');

    await cdp.evaluate(`location.hash = '/friends/suggestions'`);
    await new Promise((r) => setTimeout(r, 900));
    await shot(cdp, '08c-suggestions');

    await cdp.evaluate(`location.hash = '/groups'`);
    await new Promise((r) => setTimeout(r, 900));
    await shot(cdp, '09-groups');

    await cdp.evaluate(`location.hash = '/notifications'`);
    await new Promise((r) => setTimeout(r, 900));
    await shot(cdp, '10-notifications');
    const notifLayout = await cdp.evaluate(`(() => {
      const body = document.querySelector('.notif .n-body');
      const time = document.querySelector('.notif .n-time');
      if (!body || !time) return null;
      return { display: getComputedStyle(body).display,
               timeTop: Math.round(time.getBoundingClientRect().top),
               bodyTop: Math.round(body.getBoundingClientRect().top) };
    })()`);
    check('notificaciones con texto y hora apilados',
      Boolean(notifLayout) && notifLayout.display === 'flex' && notifLayout.timeTop > notifLayout.bodyTop,
      JSON.stringify(notifLayout));

    await cdp.evaluate(`location.hash = '/settings'`);
    await new Promise((r) => setTimeout(r, 900));
    await shot(cdp, '11-settings');

    await cdp.evaluate(`location.hash = '/groups/g_foto'`);
    await new Promise((r) => setTimeout(r, 1200));
    await shot(cdp, '12-group');

    /* búsqueda */
    await cdp.evaluate(`location.hash = '/search?q=foto'`);
    await new Promise((r) => setTimeout(r, 1000));
    await shot(cdp, '13-search');

    /* ------------------------------ oscuro ---------------------------- */
    console.log('\n> Escritorio 1440x1000 (tema oscuro)');
    await setViewport(cdp, 1440, 1000, { theme: 'dark' });
    await cdp.evaluate(`localStorage.setItem('nb.theme.v1','dark'); location.hash = '/feed'`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.topbar')", 20000);
    await cdp.waitFor("document.querySelectorAll('.post').length > 0", 15000);
    await waitImages(cdp, 10000);
    await shot(cdp, '14-feed-dark');

    /* ------------------------------ móvil ----------------------------- */
    console.log('\n> Movil 390x844');
    await setViewport(cdp, 390, 844, { mobile: true, scale: 3, theme: 'light' });
    await cdp.evaluate(`localStorage.setItem('nb.theme.v1','light'); location.hash = '/feed'`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.topbar')", 20000);
    await cdp.waitFor("document.querySelectorAll('.post').length > 0", 15000);
    await waitImages(cdp, 10000);
    await shot(cdp, '15-mobile-feed');
    const mobile = await cdp.evaluate(`(() => ({
      nav: !!document.querySelector('.mobile-nav') && getComputedStyle(document.querySelector('.mobile-nav')).display,
      left: getComputedStyle(document.querySelector('.col-left')).display,
      right: !!document.querySelector('.col-right') && getComputedStyle(document.querySelector('.col-right')).display,
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      width: document.documentElement.scrollWidth,
    }))()`);
    check('nav móvil visible', mobile.nav === 'flex', `display=${mobile.nav}`);
    check('sin scroll horizontal', mobile.overflow === true, `scrollWidth=${mobile.width}`);

    await cdp.evaluate(`location.hash = '/messages'`);
    await cdp.waitFor("document.querySelector('.conv')", 15000);
    await waitImages(cdp, 8000);
    await shot(cdp, '16-mobile-messages');
    await cdp.evaluate(`document.querySelector('.conv').click()`);
    await cdp.waitFor("document.querySelector('.chat-input textarea')", 15000);
    await new Promise((r) => setTimeout(r, 700));
    await shot(cdp, '17-mobile-chat');

    await cdp.evaluate(`location.hash = '/u/ana.torres'`);
    await new Promise((r) => setTimeout(r, 1400));
    await shot(cdp, '18-mobile-profile');

    /* --------------------------- tablet ------------------------------- */
    await setViewport(cdp, 900, 1000, { mobile: false, scale: 2, theme: 'light' });
    await cdp.evaluate(`location.hash = '/feed'`);
    await cdp.send('Page.reload');
    await cdp.waitFor("document.querySelector('.topbar')", 20000);
    await cdp.waitFor("document.querySelectorAll('.post').length > 0", 15000);
    await waitImages(cdp, 10000);
    await shot(cdp, '19-tablet-feed');

    /* ------------------------- errores consola ------------------------ */
    const realErrors = consoleErrors.filter((e) => !/favicon|ERR_|net::/i.test(e));
    check('sin errores de consola', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    const stored = await cdp.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem('nb.cache.v1:mock/NimbookGR@main:data/feed.json') || '{}');
      return s?.data?.posts?.length || 0;
    })()`);
    check('caché local de posts', stored > 0, `${stored} posts en localStorage`);
  } finally {
    await cdp.send('Browser.close').catch(() => {});
    proc?.kill?.();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? 'FAIL' : 'OK'} ${results.length - failed.length}/${results.length} comprobaciones OK`);
  if (failed.length) {
    console.log('Fallos:');
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  }
  console.log(`Capturas en ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
