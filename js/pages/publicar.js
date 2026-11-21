/* ==========================================================================
   pages/publicar.js — crear una publicación (sección completa)
   ========================================================================== */
import { el, clear } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, displayName } from '../core/store.js';
import { avatarEl, toast } from '../core/ui.js';
import {
  mediaImg, openFilePicker, uploadImage, validateImageFile, MAX_FILES,
} from '../core/media.js';
import { createPost } from '../core/actions.js';
import { goBack, navigate, parseRoute } from '../core/router.js';
import { playSound } from '../core/sounds.js';

const PRIVACY = [
  { id: 'public', label: 'Público', icon: 'globe', sub: 'Cualquiera puede verlo' },
  { id: 'followers', label: 'Seguidores', icon: 'users', sub: 'Solo quienes te siguen' },
  { id: 'private', label: 'Solo yo', icon: 'lock', sub: 'Solo vos' },
];

export function composePage() {
  const root = el('div', { class: 'compose-page' });
  const me = state.me;
  const groupId = parseRoute().query.g || null;
  const group = groupId ? state.groups.find((item) => item.id === groupId) : null;

  let files = [];
  let privacy = 'public';

  const textarea = el('textarea', {
    class: 'compose-text', rows: '6', maxlength: '5000',
    placeholder: `¿Qué estás pensando, ${me.firstName || displayName(me)}?`,
  });
  const counter = el('span', { class: 'muted tiny', text: '0 / 5000' });
  const grid = el('div', { class: 'compose-media' });
  const privacyBtn = el('button', { class: 'btn soft sm', type: 'button' },
    icon('globe', 15), 'Público');
  const publishBtn = el('button', { class: 'btn primary', type: 'button', text: 'Publicar' });

  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length} / 5000`;
    publishBtn.disabled = !textarea.value.trim() && !files.length;
  });

  privacyBtn.addEventListener('click', () => {
    const next = PRIVACY[(PRIVACY.findIndex((item) => item.id === privacy) + 1) % PRIVACY.length];
    privacy = next.id;
    privacyBtn.replaceChildren(icon(next.icon, 15), document.createTextNode(` ${next.label}`));
    toast(`Privacidad: ${next.label}`);
  });

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
  }

  async function addPhotos() {
    const picked = await openFilePicker({ multiple: true });
    for (const file of picked.slice(0, MAX_FILES - files.length)) {
      const problem = validateImageFile(file);
      if (problem) { toast(problem, { type: 'error' }); continue; }
      files.push({ file, preview: URL.createObjectURL(file) });
    }
    renderFiles();
    publishBtn.disabled = !textarea.value.trim() && !files.length;
  }

  publishBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text && !files.length) return;
    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando…';
    try {
      const media = [];
      for (const item of files) {
        const record = await uploadImage(item.file, 'posts', { maxSize: 1600 });
        media.push({ path: record.path, type: record.type });
      }
      await createPost({ text, media, privacy, groupId });
      playSound('send');
      toast('Publicado', { type: 'success' });
      files.forEach((item) => URL.revokeObjectURL(item.preview));
      navigate(groupId ? `/grupos/${groupId}` : '/inicio', { replace: true });
    } catch (err) {
      toast(err.message || 'No se pudo publicar.', { type: 'error' });
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar';
    }
  });

  const head = el('div', { class: 'page-head' },
    el('button', {
      class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
    }, icon('arrow-left', 17), 'Volver'),
    el('h1', { text: group ? `Publicar en ${group.name}` : 'Crear publicación' }));

  root.append(head, el('div', { class: 'page-card compose-card' },
    el('div', { class: 'row gap-12' },
      avatarEl(me, 'md'),
      el('div', null,
        el('div', { class: 'post-name', text: displayName(me) }),
        privacyBtn)),
    textarea,
    el('div', { class: 'row between', style: { padding: '8px 0 4px' } },
      el('div', { class: 'row gap-8' },
        el('button', {
          class: 'btn soft sm', type: 'button', onclick: addPhotos,
        }, icon('photo', 16), 'Fotos'),
        el('span', { class: 'muted tiny', text: 'Las fotos se suben al publicar' })),
      counter),
    grid,
    el('div', { class: 'row between', style: { paddingTop: '14px' } },
      el('span', { class: 'muted small', text: 'Se va a publicar en tu muro' }),
      publishBtn)));

  publishBtn.disabled = true;
  renderFiles();
  setTimeout(() => textarea.focus(), 60);

  return { el: root, onData() {}, destroy() { files.forEach((item) => URL.revokeObjectURL(item.preview)); } };
}
