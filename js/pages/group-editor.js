/* ==========================================================================
   pages/group-editor.js — crear o personalizar un grupo/canal
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { openModal, toast } from '../core/ui.js';
import {
  mediaImg, openFilePicker, uploadImage, validateImageFile,
} from '../core/media.js';
import { createGroup, updateGroup } from '../core/actions.js';
import { navigate } from '../core/router.js';
import { openEmojiPicker } from '../components/emoji-picker.js';

const COLORS = [
  '#0a84ff', '#34c759', '#8b5cf6', '#ff2d55',
  '#ff9f0a', '#ff6b35', '#00c7be', '#e5a50a',
  '#5e5ce6', '#64748b',
];

const DEFAULT_COLOR = COLORS[0];
const emojiFallback = (type) => (type === 'channel' ? '📣' : '👥');

function colorOf(group) {
  return /^#[0-9a-f]{6}$/i.test(group?.color || '') ? group.color : DEFAULT_COLOR;
}

export function openGroupEditor({ type = 'group', group = null, onSaved = null } = {}) {
  const isEdit = Boolean(group);
  const kind = group?.type || type;
  const isChannel = kind === 'channel';

  const name = el('input', {
    class: 'input', placeholder: 'Nombre', maxlength: '60', value: group?.name || '',
  });
  const description = el('textarea', {
    class: 'textarea', rows: '3', placeholder: '¿De qué se trata?', maxlength: '500',
    value: group?.description || '',
  });
  const rules = el('textarea', {
    class: 'textarea', rows: '3', placeholder: 'Reglas de la comunidad (opcional)',
    maxlength: '2000', value: group?.rules || '',
  });
  const category = el('input', {
    class: 'input', placeholder: 'Categoría: música, fotografía, barrio…',
    maxlength: '40', value: group?.category || '',
  });

  let color = colorOf(group);
  let emoji = group?.emoji || emojiFallback(kind);
  let cover = group?.cover || null;
  let privacy = group?.privacy || 'public';
  let uploading = false;

  const coverPreview = el('button', {
    class: 'group-cover-picker', type: 'button',
    onclick: pickCover,
  });
  function paintCover() {
    clear(coverPreview);
    coverPreview.appendChild(el('div', {
      class: 'group-cover-preview', style: { '--group-color': color },
    },
    cover
      ? mediaImg(cover, { alt: 'Portada' })
      : el('div', { class: 'group-cover-fallback big', style: { '--group-color': color } },
        el('span', { class: 'group-cover-emoji', text: emoji })),
    el('span', { class: 'group-cover-edit' },
      icon('camera', 16), uploading ? 'Subiendo…' : 'Cambiar portada')));
  }

  async function pickCover() {
    if (uploading) return;
    const files = await openFilePicker();
    if (!files.length) return;
    const problem = validateImageFile(files[0]);
    if (problem) { toast(problem, { type: 'error' }); return; }
    uploading = true;
    paintCover();
    try {
      const record = await uploadImage(files[0], 'groups', { maxSize: 1600 });
      cover = record.path;
      toast('Portada actualizada', { type: 'success' });
    } catch (err) {
      toast(err.message || 'No se pudo subir la portada.', { type: 'error' });
    } finally {
      uploading = false;
      paintCover();
    }
  }

  const emojiBtn = el('button', {
    class: 'group-emoji-button', type: 'button', title: 'Elegir emoji',
  }, emoji);
  emojiBtn.addEventListener('click', () => {
    openEmojiPicker(emojiBtn, (picked) => {
      emoji = picked;
      emojiBtn.textContent = picked;
      paintCover();
    });
  });

  const colorRow = el('div', { class: 'group-colors' });
  function paintColors() {
    clear(colorRow);
    for (const value of COLORS) {
      colorRow.appendChild(el('button', {
        class: `group-color-dot${value === color ? ' active' : ''}`.trim(),
        type: 'button', title: value, 'aria-label': `Color ${value}`,
        style: { '--dot': value },
        onclick: () => { color = value; paintColors(); paintCover(); },
      }));
    }
  }

  const privacyRow = el('div', { class: 'segmented', style: { width: '100%' } });
  function paintPrivacy() {
    clear(privacyRow);
    for (const item of [{ id: 'public', label: 'Público' }, { id: 'private', label: 'Privado' }]) {
      privacyRow.appendChild(el('button', {
        class: `segmented-item${privacy === item.id ? ' active' : ''}`.trim(),
        type: 'button', text: item.label, style: { flex: '1' },
        onclick: () => { privacy = item.id; paintPrivacy(); },
      }));
    }
  }

  paintCover();
  paintColors();
  paintPrivacy();

  const api = openModal({
    title: isEdit
      ? (isChannel ? 'Personalizar canal' : 'Personalizar grupo')
      : (isChannel ? 'Crear canal' : 'Crear grupo'),
    body: el('div', { class: 'col gap-12 group-editor' },
      coverPreview,
      el('div', { class: 'group-editor-row' },
        el('div', { class: 'field grow' }, el('label', { text: 'Nombre' }), name),
        el('div', { class: 'field', style: { width: '92px' } },
          el('label', { text: 'Emoji' }), emojiBtn)),
      el('div', { class: 'field' }, el('label', { text: 'Descripción' }), description),
      el('div', { class: 'field' }, el('label', { text: 'Categoría' }), category),
      el('div', { class: 'field' }, el('label', { text: 'Reglas (opcional)' }), rules),
      el('div', { class: 'field' }, el('label', { text: 'Color del grupo' }), colorRow),
      el('div', { class: 'field' }, el('label', { text: 'Privacidad' }), privacyRow),
      el('p', { class: 'muted small', text: isChannel
        ? 'En un canal solo publicás vos; los demás lo leen.'
        : 'En un grupo todos los miembros pueden publicar.' })),
    footer: el('button', {
      class: 'btn primary block', type: 'button', text: isEdit ? 'Guardar cambios' : 'Crear',
      onclick: async (event) => {
        if (uploading) { toast('Esperá a que termine la portada.', { type: 'error' }); return; }
        event.currentTarget.disabled = true;
        try {
          const payload = {
            name: name.value,
            description: description.value,
            rules: rules.value,
            category: category.value,
            color,
            emoji,
            cover,
            privacy,
          };
          if (isEdit) {
            await updateGroup(group.id, payload);
            api.close();
            toast('Cambios guardados', { type: 'success' });
            if (onSaved) onSaved();
            else navigate(`/grupos/${group.id}`);
          } else {
            const created = await createGroup({ ...payload, type: kind });
            api.close();
            toast(isChannel ? 'Canal creado' : 'Grupo creado', { type: 'success' });
            navigate(`/grupos/${created.id}`);
          }
        } catch (err) {
          event.currentTarget.disabled = false;
          toast(err.message, { type: 'error' });
        }
      },
    }, isEdit ? 'Guardar cambios' : 'Crear'),
  });
}
