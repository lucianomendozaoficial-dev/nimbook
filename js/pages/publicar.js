/* ==========================================================================
   pages/publicar.js — crear una publicación (sección completa)
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName } from '../core/store.js';
import { avatarEl, dropdown, openModal, toast } from '../core/ui.js';
import {
  mediaImg, openFilePicker, uploadImage, validateImageFile, MAX_FILES,
} from '../core/media.js';
import { createPost } from '../core/actions.js';
import { navigate, parseRoute } from '../core/router.js';
import { playSound } from '../core/sounds.js';
import { emojiButton } from '../components/emoji-picker.js';

const PRIVACY = [
  { id: 'public', label: 'Público', icon: 'globe', sub: 'Cualquiera puede verlo' },
  { id: 'followers', label: 'Seguidores', icon: 'users', sub: 'Solo quienes te siguen' },
  { id: 'private', label: 'Solo yo', icon: 'lock', sub: 'Solo vos' },
];

const FEELINGS = [
  { emoji: '😊', label: 'feliz' },
  { emoji: '😎', label: 'genial' },
  { emoji: '🙏', label: 'agradecido' },
  { emoji: '🥰', label: 'enamorado' },
  { emoji: '🤩', label: 'emocionado' },
  { emoji: '💪', label: 'motivado' },
  { emoji: '🎉', label: 'de fiesta' },
  { emoji: '☕', label: 'tomando café' },
  { emoji: '🎧', label: 'escuchando música' },
  { emoji: '🎮', label: 'jugando' },
  { emoji: '📚', label: 'leyendo' },
  { emoji: '✈️', label: 'viajando' },
  { emoji: '🏋️', label: 'entrenando' },
  { emoji: '🌿', label: 'tranquilo' },
  { emoji: '😴', label: 'cansado' },
  { emoji: '🤔', label: 'pensativo' },
];

const BACKGROUNDS = [
  { id: 'azul', label: 'Azul', color: '#dbeafe' },
  { id: 'rosa', label: 'Rosa', color: '#ffe4e6' },
  { id: 'verde', label: 'Verde', color: '#dcfce7' },
  { id: 'arena', label: 'Arena', color: '#fef3c7' },
  { id: 'violeta', label: 'Violeta', color: '#ede9fe' },
  { id: 'oscuro', label: 'Oscuro', color: '#1f2937' },
];

export function composePage() {
  const root = el('div', { class: 'compose-page' });
  const me = state.me;
  const groupId = parseRoute().query.g || null;
  const group = groupId ? state.groups.find((item) => item.id === groupId) : null;

  let files = [];
  let privacy = 'public';
  let feeling = '';
  let location = '';
  let background = null;
  let publishing = false;

  const textarea = el('textarea', {
    class: 'compose-text', rows: '6', maxlength: '5000',
    placeholder: `¿Qué estás pensando, ${me.firstName || displayName(me)}?`,
  });
  const counter = el('span', { class: 'muted tiny', text: '0 / 5000' });
  const grid = el('div', { class: 'compose-media' });
  const chips = el('div', { class: 'compose-chips' });
  const palette = el('div', { class: 'compose-palette hide' });
  const publishBtn = el('button', { class: 'btn primary', type: 'button' }, icon('send', 16), 'Publicar');

  const privacyBtn = el('button', {
    class: 'compose-privacy', type: 'button', 'aria-label': 'Privacidad de la publicación',
  });

  function paintPrivacy() {
    const current = PRIVACY.find((item) => item.id === privacy) || PRIVACY[0];
    privacyBtn.replaceChildren(
      icon(current.icon, 15),
      el('span', { text: current.label }),
      icon('chevron-down', 14));
    privacyBtn.title = current.sub;
  }

  privacyBtn.addEventListener('click', () => {
    dropdown(privacyBtn, PRIVACY.map((item) => ({
      icon: item.icon,
      label: item.label,
      sub: item.sub,
      onClick: () => { privacy = item.id; paintPrivacy(); },
    })), { width: 280 });
  });

  function updateCounter() {
    counter.textContent = `${textarea.value.length} / 5000`;
    publishBtn.disabled = publishing || (!textarea.value.trim() && !files.length);
  }

  textarea.addEventListener('input', updateCounter);

  function applyBackground() {
    const value = background && !files.length ? background : null;
    for (const option of BACKGROUNDS) {
      textarea.classList.remove(`compose-bg-${option.id}`);
      textarea.classList.remove(`text-on-${option.id}`);
    }
    if (!value) return;
    textarea.classList.add(`compose-bg-${value}`);
  }

  function renderChips() {
    clear(chips);
    if (feeling) {
      chips.appendChild(el('span', { class: 'compose-chip' },
        el('span', { text: feeling }),
        el('button', {
          type: 'button', 'aria-label': 'Quitar sentimiento',
          onclick: () => { feeling = ''; renderChips(); },
        }, icon('x', 13))));
    }
    if (location) {
      chips.appendChild(el('span', { class: 'compose-chip' },
        icon('map-pin', 14),
        el('span', { text: location }),
        el('button', {
          type: 'button', 'aria-label': 'Quitar ubicación',
          onclick: () => { location = ''; renderChips(); },
        }, icon('x', 13))));
    }
    if (!chips.children.length) chips.classList.add('hide');
    else chips.classList.remove('hide');
  }

  function renderFiles() {
    clear(grid);
    files.forEach((file, index) => {
      grid.appendChild(el('div', { class: 'compose-thumb' },
        mediaImg(file.preview, { alt: `Foto ${index + 1}`, eager: true }),
        el('button', {
          class: 'thumb-x', type: 'button', 'aria-label': 'Quitar foto',
          onclick: () => { files.splice(index, 1); renderFiles(); },
        }, icon('x', 14))));
    });
    if (files.length < MAX_FILES) {
      grid.appendChild(el('button', {
        class: 'compose-add', type: 'button', 'aria-label': 'Agregar fotos',
        onclick: addPhotos,
      }, icon('plus', 22), el('span', { text: 'Foto' })));
    }
    if (files.length) {
      background = null;
      palette.classList.add('hide');
      applyBackground();
    }
    bgBtn.disabled = files.length > 0;
    bgBtn.classList.toggle('disabled', files.length > 0);
    bgBtn.title = files.length ? 'El fondo solo está disponible cuando la publicación es texto' : 'Fondo del texto';
    updateCounter();
  }

  async function addPhotos() {
    const picked = await openFilePicker({ multiple: true });
    for (const file of picked.slice(0, MAX_FILES - files.length)) {
      const problem = validateImageFile(file);
      if (problem) { toast(problem, { type: 'error' }); continue; }
      files.push({ file, preview: URL.createObjectURL(file) });
    }
    renderFiles();
  }

  function paintPalette() {
    clear(palette);
    for (const option of BACKGROUNDS) {
      palette.appendChild(el('button', {
        class: `compose-bg-dot${background === option.id ? ' active' : ''}`.trim(),
        type: 'button',
        style: { background: option.color },
        title: option.label,
        'aria-label': `Fondo ${option.label}`,
        onclick: () => {
          background = background === option.id ? null : option.id;
          applyBackground();
          paintPalette();
        },
      }));
    }
    const remove = el('button', {
      class: 'compose-bg-clear', type: 'button', text: 'Sin fondo',
      onclick: () => { background = null; applyBackground(); paintPalette(); },
    });
    palette.appendChild(remove);
  }

  function openFeeling() {
    const wrap = el('div', { class: 'feeling-grid' });
    const api = openModal({ title: '¿Cómo te sentís?', body: wrap, size: 'sm' });
    for (const option of FEELINGS) {
      wrap.appendChild(el('button', {
        class: 'feeling-opt', type: 'button',
        onclick: () => {
          feeling = `se siente ${option.label} ${option.emoji}`;
          renderChips();
          api.close();
        },
      }, el('span', { class: 'feeling-emoji', text: option.emoji }),
      el('span', { text: option.label })));
    }
  }

  function openLocation() {
    const input = el('input', {
      class: 'input', maxlength: '60', placeholder: 'Ej. General Rodríguez',
      value: location,
    });
    const api = openModal({
      title: 'Agregar ubicación',
      body: el('div', { class: 'field' }, el('label', { text: 'Lugar' }), input,
        el('span', { class: 'field-hint', text: 'Se muestra debajo de tu nombre en la publicación.' })),
      footer: el('button', {
        class: 'btn primary block', type: 'button', text: 'Agregar',
        onclick: () => {
          location = input.value.trim().slice(0, 60);
          renderChips();
          api.close();
        },
      }),
      size: 'sm',
    });
    setTimeout(() => input.focus(), 80);
  }

  publishBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if ((!text && !files.length) || publishing) return;
    publishing = true;
    publishBtn.disabled = true;
    publishBtn.replaceChildren(el('span', { class: 'spinner', style: { width: '15px', height: '15px' } }));
    publishBtn.append(document.createTextNode(' Publicando…'));
    try {
      const media = [];
      for (const item of files) {
        const record = await uploadImage(item.file, 'posts', { maxSize: 1600 });
        media.push({ path: record.path, type: record.type });
      }
      await createPost({
        text,
        media,
        privacy,
        feeling,
        location,
        groupId,
        bg: media.length ? null : background,
      });
      playSound('send');
      toast('Publicado', { type: 'success' });
      files.forEach((item) => URL.revokeObjectURL(item.preview));
      navigate(groupId ? `/grupos/${groupId}` : '/inicio', { replace: true });
    } catch (err) {
      publishing = false;
      publishBtn.disabled = false;
      publishBtn.replaceChildren(icon('send', 16), document.createTextNode(' Publicar'));
      updateCounter();
      toast(err.message || 'No se pudo publicar.', { type: 'error' });
    }
  });

  const bgBtn = el('button', {
    class: 'compose-tool', type: 'button',
    onclick: () => {
      if (files.length) {
        toast('Quitá las fotos si querés usar un fondo de texto.', { type: 'error' });
        return;
      }
      palette.classList.toggle('hide');
      if (!palette.children.length) paintPalette();
    },
  }, icon('image', 19), el('span', { text: 'Fondo' }));

  const toolbar = el('div', { class: 'compose-tools' },
    emojiButton(textarea, { className: 'compose-tool', label: 'Emoji', title: 'Agregar emoji' }),
    el('button', { class: 'compose-tool', type: 'button', onclick: addPhotos },
      icon('camera', 19), el('span', { text: 'Fotos' })),
    el('button', { class: 'compose-tool', type: 'button', onclick: openFeeling },
      icon('smile', 19), el('span', { text: 'Sentimiento' })),
    el('button', { class: 'compose-tool', type: 'button', onclick: openLocation },
      icon('map-pin', 19), el('span', { text: 'Ubicación' })),
    bgBtn);

  root.append(
    el('div', { class: 'page-head compose-head' },
      el('div', { class: 'grow' },
        el('h1', { text: group ? `Publicar en ${group.name}` : 'Crear publicación' }),
        el('p', { class: 'muted small', text: 'Compartí un momento con tu gente.' })),
      publishBtn),
    el('div', { class: 'page-card compose-card' },
      el('div', { class: 'compose-owner' },
        avatarEl(me, 'md'),
        el('div', { class: 'grow' },
          el('div', { class: 'post-name', text: displayName(me) }),
          privacyBtn)),
      textarea,
      chips,
      grid,
      palette,
      toolbar,
      el('div', { class: 'compose-foot' },
        el('span', { class: 'muted tiny', text: 'Se va a publicar en tu muro' }),
        counter)));

  paintPrivacy();
  renderChips();
  renderFiles();
  applyBackground();
  updateCounter();
  setTimeout(() => textarea.focus(), 60);

  return {
    el: root,
    onData() {},
    destroy() { files.forEach((item) => URL.revokeObjectURL(item.preview)); },
  };
}
