/* ==========================================================================
   composer.js — caja "¿Qué estás pensando?" y modal de publicación
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName } from '../core/store.js';
import { avatarEl, openModal, toast, dropdown, closeDropdown } from '../core/ui.js';
import { uploadImage, openFilePicker, validateImageFile, MAX_FILES, mediaImg } from '../core/media.js';
import { createPost } from '../core/actions.js';
import { ValidationError } from '../core/auth.js';

export const FEELINGS = [
  { emoji: '😊', label: 'feliz' },
  { emoji: '😍', label: 'enamorado' },
  { emoji: '😎', label: 'genial' },
  { emoji: '🥳', label: 'celebrando' },
  { emoji: '🤩', label: 'emocionado' },
  { emoji: '😢', label: 'triste' },
  { emoji: '😡', label: 'enfadado' },
  { emoji: '😴', label: 'cansado' },
  { emoji: '🤔', label: 'pensando' },
  { emoji: '🙏', label: 'agradecido' },
  { emoji: '🤒', label: 'malito' },
  { emoji: '🧘', label: 'relajado' },
];

const PRIVACY = {
  public: { label: 'Público', icon: 'globe', sub: 'Cualquier persona en NimbookGR' },
  friends: { label: 'Seguidores', icon: 'users', sub: 'Solo las personas que te siguen' },
  private: { label: 'Solo yo', icon: 'lock', sub: 'Solo tú puedes verlo' },
};

export function openComposer({ groupId = null, shareOf = null, initialText = '', onDone } = {}) {
  const me = state.me;
  if (!me) return null;

  let privacy = 'public';
  let feeling = null;
  let location = '';
  let media = [];
  let uploading = 0;

  const previews = el('div', { class: 'compose-media hide' });
  const chips = el('div', { class: 'row wrap gap-6 mt-8' });

  const textarea = el('textarea', {
    class: 'compose-text',
    placeholder: groupId
      ? 'Escribe algo para el grupo…'
      : `¿Qué estás pensando, ${(me.name || '').split(' ')[0]}?`,
    rows: '1',
    'aria-label': 'Texto de la publicación',
  });
  textarea.value = initialText || '';

  const privacyBtn = el('button', { class: 'compose-privacy', type: 'button' },
    icon(PRIVACY[privacy].icon, 13),
    el('span', { text: PRIVACY[privacy].label }),
    icon('chevron-down', 12));

  privacyBtn.addEventListener('click', () => {
    dropdown(privacyBtn, [
      { title: '¿Quién puede ver tu publicación?' },
      ...Object.entries(PRIVACY).map(([key, value]) => ({
        icon: value.icon,
        label: value.label,
        sub: value.sub,
        onClick: () => {
          privacy = key;
          clear(privacyBtn);
          privacyBtn.append(icon(value.icon, 13), el('span', { text: value.label }), icon('chevron-down', 12));
        },
      })),
    ], { width: 280, align: 'start' });
  });

  const head = el('div', { class: 'compose-user' },
    avatarEl(me, 'md'),
    el('div', null,
      el('div', { class: 'name', text: displayName(me) }),
      el('div', { class: 'row gap-6' },
        privacyBtn,
        groupId ? el('span', { class: 'chip', text: 'Publicación de grupo' }) : null,
        shareOf ? el('span', { class: 'chip', text: 'Compartiendo' }) : null)));

  const photoBtn = el('button', {
    class: 'compose-tool', type: 'button', title: 'Fotos', 'aria-label': 'Añadir fotos',
    onclick: () => pickImages(),
  }, icon('image', 22));
  const feelingBtn = el('button', {
    class: 'compose-tool', type: 'button', title: 'Sentimiento', 'aria-label': 'Añadir sentimiento',
    onclick: () => pickFeeling(),
  }, icon('smile', 22));
  const placeBtn = el('button', {
    class: 'compose-tool', type: 'button', title: 'Ubicación', 'aria-label': 'Añadir ubicación',
    onclick: () => addLocation(),
  }, icon('map-pin', 22));

  const toolsBar = el('div', { class: 'compose-tools' },
    el('span', { class: 'title', text: 'Añade a tu publicación' }),
    el('div', { class: 'tools' }, photoBtn, feelingBtn, placeBtn));

  const publishBtn = el('button', {
    class: 'btn primary block lg', type: 'button', disabled: true,
  }, 'Publicar');

  const body = el('div', null, head, textarea, chips, previews, toolsBar);

  const api = openModal({
    title: shareOf ? 'Compartir publicación' : 'Crear publicación',
    body,
    footer: [publishBtn],
    onClose: () => closeDropdown(),
  });

  function renderChips() {
    clear(chips);
    if (feeling) {
      chips.appendChild(el('span', {
        class: 'chip brand', role: 'button', style: { cursor: 'pointer' },
        title: 'Quitar sentimiento',
        onclick: () => { feeling = null; renderChips(); },
      }, el('span', { text: `${feeling.emoji} me siento ${feeling.label}` }), icon('x', 12)));
    }
    if (location) {
      chips.appendChild(el('span', {
        class: 'chip brand', role: 'button', style: { cursor: 'pointer' },
        title: 'Quitar ubicación',
        onclick: () => { location = ''; renderChips(); },
      }, icon('map-pin', 13), el('span', { text: location }), icon('x', 12)));
    }
  }

  function setPublishState() {
    publishBtn.disabled = uploading > 0 || (!textarea.value.trim() && !media.length);
    publishBtn.textContent = uploading > 0
      ? `Subiendo ${uploading} foto${uploading === 1 ? '' : 's'}…`
      : 'Publicar';
  }

  function renderPreviews() {
    clear(previews);
    if (!media.length) {
      previews.className = 'compose-media hide';
      return;
    }
    previews.className = `compose-media n${Math.min(media.length, 4)}`;
    media.forEach((item) => {
      const cell = el('div', { class: 'cm-item' });
      if (item.localUrl) {
        cell.appendChild(el('img', { src: item.localUrl, alt: 'Vista previa' }));
      } else {
        cell.appendChild(mediaImg(item.path, { alt: 'Vista previa' }));
      }
      cell.appendChild(el('button', {
        class: 'cm-del', type: 'button', 'aria-label': 'Quitar imagen',
        onclick: () => {
          if (item.localUrl) URL.revokeObjectURL(item.localUrl);
          media = media.filter((entry) => entry !== item);
          renderPreviews();
          setPublishState();
        },
      }, icon('x', 16)));
      if (item.uploading) {
        cell.appendChild(el('div', {
          style: {
            position: 'absolute', inset: '0', background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          },
        }, el('span', { class: 'spinner on-brand' })));
      }
      previews.appendChild(cell);
    });
    if (uploading === 0 && media.length < MAX_FILES) {
      previews.appendChild(el('button', {
        class: 'compose-add', type: 'button', onclick: () => pickImages(),
      }, icon('plus', 24), el('span', { text: 'Añadir' })));
    }
  }

  async function pickImages() {
    if (media.length >= MAX_FILES) {
      toast(`Puedes añadir hasta ${MAX_FILES} fotos.`, { type: 'error' });
      return;
    }
    const files = await openFilePicker({ multiple: true });
    if (!files.length) return;
    for (const file of files.slice(0, MAX_FILES - media.length)) {
      const problem = validateImageFile(file);
      if (problem) { toast(problem, { type: 'error' }); continue; }
      const localUrl = URL.createObjectURL(file);
      const placeholder = { localUrl, uploading: true };
      media.push(placeholder);
      uploading += 1;
      renderPreviews();
      setPublishState();
      try {
        const record = await uploadImage(file, 'posts', { maxSize: 1600 });
        const index = media.indexOf(placeholder);
        if (index >= 0) media[index] = { ...record, localUrl };
      } catch (err) {
        toast(err.message || 'No se pudo subir la imagen.', { type: 'error' });
        const index = media.indexOf(placeholder);
        if (index >= 0) media.splice(index, 1);
      } finally {
        uploading -= 1;
        renderPreviews();
        setPublishState();
      }
    }
  }

  function pickFeeling() {
    dropdown(feelingBtn, [
      { title: '¿Cómo te sientes?' },
      ...FEELINGS.map((item) => ({
        label: `${item.emoji}  Me siento ${item.label}`,
        onClick: () => { feeling = item; renderChips(); },
      })),
    ], { width: 260, align: 'start' });
  }

  function addLocation() {
    const input = el('input', {
      class: 'input', placeholder: '¿Dónde estás?', maxlength: '60', value: location,
    });
    const dialog = openModal({
      title: 'Añadir ubicación',
      body: el('div', { class: 'field' }, input),
      footer: el('button', {
        class: 'btn primary block', type: 'button',
        onclick: () => {
          location = input.value.trim();
          renderChips();
          dialog.close();
        },
      }, 'Guardar'),
      size: 'sm',
    });
    setTimeout(() => input.focus(), 80);
  }

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
    setPublishState();
  });

  publishBtn.addEventListener('click', async () => {
    if (publishBtn.disabled) return;
    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando…';
    try {
      await createPost({
        text: textarea.value,
        media: media.filter((m) => !m.uploading).map((m) => ({
          path: m.path, type: m.type, w: m.w, h: m.h,
        })),
        privacy,
        groupId,
        shareOf,
        feeling: feeling ? `${feeling.emoji} me siento ${feeling.label}` : '',
        location,
      });
      api.close();
      toast('Publicación creada', { type: 'success' });
      onDone?.();
    } catch (err) {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar';
      toast(err instanceof ValidationError ? err.message : (err.message || 'No se pudo publicar.'),
        { type: 'error' });
    }
  });

  renderPreviews();
  renderChips();
  setPublishState();
  setTimeout(() => textarea.focus(), 80);
  return api;
}

/** Caja del feed. */
export function mountComposer({ groupId = null } = {}) {
  const me = state.me;
  const open = () => openComposer({ groupId });
  return el('div', { class: 'card composer' },
    el('div', { class: 'composer-top' },
      el('a', { href: `#/u/${me.username}` }, avatarEl(me, 'md')),
      el('button', { class: 'composer-open', type: 'button', onclick: open },
        `¿Qué estás pensando, ${(me.name || '').split(' ')[0]}?`)),
    el('div', { class: 'composer-actions' },
      el('button', { class: 'composer-act photo', type: 'button', onclick: open },
        icon('image', 22), el('span', { text: 'Foto' })),
      el('button', { class: 'composer-act feeling', type: 'button', onclick: open },
        icon('smile', 22), el('span', { text: 'Sentimiento' })),
      el('button', { class: 'composer-act place', type: 'button', onclick: open },
        icon('map-pin', 22), el('span', { text: 'Ubicación' }))));
}
