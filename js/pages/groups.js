/* ==========================================================================
   pages/groups.js — grupos: listado, creación y detalle
   ========================================================================== */
import { el, clear, formatCount, monthYear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, userById, canSeePost, postsByAuthor,
} from '../core/store.js';
import {
  avatarEl, emptyState, openModal, toast, confirmDialog, dropdown,
} from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import {
  createGroup, joinGroup, leaveGroup, updateGroup,
} from '../core/actions.js';
import { postCard } from '../components/postcard.js';
import { mountComposer } from '../components/composer.js';
import { ValidationError } from '../core/auth.js';

function groupCover(group, { className = 'gc-cover' } = {}) {
  const box = el('div', { class: className });
  if (group.cover) {
    box.appendChild(mediaImg(group.cover, { alt: group.name }));
  } else {
    box.style.background = `linear-gradient(135deg, hsl(${(group.name.length * 47) % 360} 70% 42%), hsl(${(group.name.length * 47 + 40) % 360} 70% 55%))`;
    box.appendChild(el('div', {
      class: 'center',
      style: { width: '100%', height: '100%', color: '#fff', fontSize: '30px', fontWeight: '700' },
      text: group.name.slice(0, 2).toUpperCase(),
    }));
  }
  return box;
}

export function createGroupModal(onCreated) {
  const nameInput = el('input', { class: 'input', placeholder: 'Nombre del grupo', maxlength: '60' });
  const descInput = el('textarea', {
    class: 'textarea', rows: '3', placeholder: '¿De qué trata el grupo?', maxlength: '500',
  });
  const privacySelect = el('select', { class: 'select' },
    el('option', { value: 'public', text: 'Público — cualquiera puede ver y unirse' }),
    el('option', { value: 'private', text: 'Privado — solo los miembros ven el contenido' }));
  let cover = null;
  const coverPreview = el('div', {
    style: {
      height: '120px', borderRadius: '8px', background: 'var(--card-2)', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      color: 'var(--text-2)', fontSize: '13px', fontWeight: '600',
    },
  }, icon('camera', 22));

  coverPreview.addEventListener('click', async () => {
    const files = await openFilePicker();
    if (!files.length) return;
    const problem = validateImageFile(files[0]);
    if (problem) { toast(problem, { type: 'error' }); return; }
    try {
      coverPreview.textContent = 'Subiendo…';
      const record = await uploadImage(files[0], 'groups', { maxSize: 1600 });
      cover = record.path;
      clear(coverPreview);
      coverPreview.appendChild(mediaImg(cover, { alt: 'Portada del grupo' }));
    } catch (err) {
      clear(coverPreview);
      coverPreview.appendChild(icon('camera', 22));
      toast(err.message, { type: 'error' });
    }
  });

  const createBtn = el('button', { class: 'btn primary block', type: 'button' }, 'Crear grupo');
  const api = openModal({
    title: 'Crear grupo',
    body: el('div', { class: 'col gap-12' },
      el('div', { class: 'field' }, el('label', { text: 'Portada' }), coverPreview),
      el('div', { class: 'field' }, el('label', { text: 'Nombre' }), nameInput),
      el('div', { class: 'field' }, el('label', { text: 'Descripción' }), descInput),
      el('div', { class: 'field' }, el('label', { text: 'Privacidad' }), privacySelect)),
    footer: [createBtn],
  });

  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    createBtn.textContent = 'Creando…';
    try {
      const group = await createGroup({
        name: nameInput.value,
        description: descInput.value,
        privacy: privacySelect.value,
        cover,
      });
      api.close();
      toast('Grupo creado', { type: 'success' });
      onCreated?.(group);
    } catch (err) {
      createBtn.disabled = false;
      createBtn.textContent = 'Crear grupo';
      toast(err instanceof ValidationError ? err.message : 'No se pudo crear el grupo.', { type: 'error' });
    }
  });
  return api;
}

export function groupsPage() {
  const root = el('div');
  const me = state.me;

  const createBtn = el('button', {
    class: 'btn primary', type: 'button',
    onclick: () => createGroupModal((group) => { window.location.hash = `/groups/${group.id}`; }),
  }, icon('plus', 18), 'Crear grupo');

  root.appendChild(el('div', { class: 'page-card', style: { padding: '16px' } },
    el('div', { class: 'row between wrap gap-8' },
      el('div', null,
        el('h1', { text: 'Grupos' }),
        el('p', { class: 'muted small', text: 'Comparte con personas que comparten tus intereses.' })),
      createBtn)));

  const mySection = el('div');
  const otherSection = el('div');
  root.append(mySection, otherSection);

  function card(group) {
    const isMember = group.memberIds?.includes(me.id);
    return el('div', { class: 'group-card' },
      el('a', { href: `#/groups/${group.id}` }, groupCover(group)),
      el('div', { class: 'gc-body' },
        el('a', { href: `#/groups/${group.id}`, class: 'gc-name', text: group.name }),
        el('span', {
          class: 'gc-sub',
          text: `${group.privacy === 'private' ? 'Privado' : 'Público'} · ${formatCount(group.memberIds?.length || 0)} miembros`,
        }),
        el('button', {
          class: `btn sm ${isMember ? '' : 'soft'}`, type: 'button',
          text: isMember ? 'Ver grupo' : 'Unirme',
          onclick: async (event) => {
            if (isMember) { window.location.hash = `/groups/${group.id}`; return; }
            const button = event.currentTarget;
            button.disabled = true;
            try {
              await joinGroup(group.id);
              toast(`Te uniste a ${group.name}`, { type: 'success' });
              window.location.hash = `/groups/${group.id}`;
            } catch (err) { button.disabled = false; toast(err.message, { type: 'error' }); }
          },
        })));
  }

  function render() {
    const mine = state.groups.filter((g) => g.memberIds?.includes(me.id));
    const others = state.groups.filter((g) => !g.memberIds?.includes(me.id));

    clear(mySection);
    if (mine.length) {
      mySection.appendChild(el('div', { class: 'section-head' },
        el('h2', { text: 'Tus grupos' }),
        el('span', { class: 'muted small', text: `${mine.length}` })));
      const grid = el('div', { class: 'group-grid' });
      for (const group of mine) grid.appendChild(card(group));
      mySection.appendChild(grid);
    }

    clear(otherSection);
    if (others.length) {
      otherSection.appendChild(el('div', { class: 'section-head', style: { marginTop: '20px' } },
        el('h2', { text: 'Descubre grupos' })));
      const grid = el('div', { class: 'group-grid' });
      for (const group of others.slice(0, 12)) grid.appendChild(card(group));
      otherSection.appendChild(grid);
    }

    if (!state.groups.length) {
      otherSection.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'groups',
          title: 'Todavía no hay grupos',
          description: 'Crea el primer grupo y empieza a reunir a tu gente.',
          action: el('button', {
            class: 'btn primary', type: 'button', text: 'Crear grupo',
            onclick: () => createGroupModal((group) => { window.location.hash = `/groups/${group.id}`; }),
          }),
        })));
    }
  }

  render();
  return { el: root, onData: render };
}

export function groupPage(groupId) {
  const root = el('div');
  const me = state.me;
  let cards = [];

  function group() {
    return state.groups.find((g) => g.id === groupId);
  }

  function render() {
    clear(root);
    cards.forEach(({ card }) => card.destroy?.());
    cards = [];
    const current = group();
    if (!current) {
      root.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'groups',
          title: 'Grupo no encontrado',
          description: 'Puede que se haya eliminado.',
          action: el('a', { class: 'btn soft', href: '#/groups', text: 'Ver grupos' }),
        })));
      return;
    }
    const isMember = current.memberIds?.includes(me.id);
    const isOwner = current.ownerId === me.id;
    const members = (current.memberIds || []).map(userById).filter(Boolean);

    const head = el('div', { class: 'group-head' },
      groupCover(current, { className: 'group-cover' }),
      el('div', { class: 'group-info' },
        el('div', { class: 'row between wrap gap-8' },
          el('div', null,
            el('h1', { text: current.name }),
            el('div', {
              class: 'meta',
              text: `${current.privacy === 'private' ? 'Grupo privado' : 'Grupo público'} · ${formatCount(members.length)} miembro${members.length === 1 ? '' : 's'}`,
            }),
            el('div', {
              class: 'meta',
              text: current.description || 'Sin descripción.',
              style: { marginTop: '8px', maxWidth: '620px' },
            })),
          el('div', { class: 'actions' },
            el('button', {
              class: `btn ${isMember ? '' : 'primary'}`, type: 'button',
              onclick: async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                try {
                  if (isMember) {
                    if (isOwner) { toast('El creador no puede salir del grupo.'); button.disabled = false; return; }
                    const ok = await confirmDialog({
                      title: `¿Salir de ${current.name}?`,
                      confirmText: 'Salir del grupo', danger: true,
                    });
                    if (!ok) { button.disabled = false; return; }
                    await leaveGroup(current.id);
                    toast('Has salido del grupo');
                  } else {
                    await joinGroup(current.id);
                    toast(`Te uniste a ${current.name}`, { type: 'success' });
                  }
                  render();
                } catch (err) { button.disabled = false; toast(err.message, { type: 'error' }); }
              },
            }, isMember ? icon('check', 18) : icon('plus', 18), isMember ? 'Miembro' : 'Unirme'),
            isOwner
              ? el('button', {
                class: 'btn', type: 'button', text: 'Editar',
                onclick: () => editGroup(current),
              }, icon('edit', 17))
              : null))));

    root.appendChild(head);

    if (!isMember && current.privacy === 'private') {
      root.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'lock',
          title: 'Este grupo es privado',
          description: 'Únete al grupo para ver y crear publicaciones.',
          action: el('button', {
            class: 'btn primary', type: 'button', text: 'Unirme al grupo',
            onclick: async () => {
              try { await joinGroup(current.id); render(); } catch (err) { toast(err.message, { type: 'error' }); }
            },
          }),
        })));
      return;
    }

    const postsWrap = el('div');
    if (isMember) postsWrap.appendChild(mountComposer({ groupId: current.id }));

    const posts = state.posts
      .filter((p) => p.groupId === current.id && canSeePost(p, me.id))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (!posts.length) {
      postsWrap.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'message',
          title: 'Aún no hay publicaciones',
          description: isMember ? 'Sé el primero en publicar algo en este grupo.' : 'Únete para participar.',
        })));
    } else {
      for (const post of posts) {
        const card = postCard(post);
        cards.push({ card });
        postsWrap.appendChild(card.el);
      }
    }

    const membersCard = el('div', { class: 'card intro-card' },
      el('h3', { class: 'card-title', text: `Miembros · ${members.length}` }),
      el('div', { class: 'col gap-8' },
        ...members.slice(0, 10).map((member) => el('a', {
          class: 'rail-item', href: `#/u/${member.username}`, style: { padding: '4px 0' },
        }, avatarEl(member, 'sm'), el('span', { class: 'name', text: displayName(member) })))));

    root.appendChild(el('div', { class: 'profile-grid' },
      postsWrap,
      el('div', { class: 'profile-side' },
        el('div', { class: 'card intro-card' },
          el('h3', { class: 'card-title', text: 'Información del grupo' }),
          el('div', { class: 'intro-item' }, icon('lock', 18),
            current.privacy === 'private' ? 'Privado' : 'Público'),
          el('div', { class: 'intro-item' }, icon('calendar', 18),
            `Creado en ${monthYear(current.createdAt)}`),
          el('div', { class: 'intro-item' }, icon('crown', 18),
            `Administrador: ${displayName(userById(current.ownerId))}`)),
        membersCard)));
  }

  function editGroup(current) {
    const nameInput = el('input', { class: 'input', value: current.name, maxlength: '60' });
    const descInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '500' });
    descInput.value = current.description || '';
    const privacySelect = el('select', { class: 'select' },
      el('option', { value: 'public', text: 'Público' }),
      el('option', { value: 'private', text: 'Privado' }));
    privacySelect.value = current.privacy || 'public';
    const api = openModal({
      title: 'Editar grupo',
      body: el('div', { class: 'col gap-12' },
        el('div', { class: 'field' }, el('label', { text: 'Nombre' }), nameInput),
        el('div', { class: 'field' }, el('label', { text: 'Descripción' }), descInput),
        el('div', { class: 'field' }, el('label', { text: 'Privacidad' }), privacySelect)),
      footer: el('button', {
        class: 'btn primary block', type: 'button', text: 'Guardar cambios',
        onclick: async () => {
          try {
            await updateGroup(current.id, {
              name: nameInput.value.trim(),
              description: descInput.value.trim(),
              privacy: privacySelect.value,
            });
            api.close();
            toast('Grupo actualizado', { type: 'success' });
            render();
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, 'Guardar cambios'),
    });
  }

  render();
  return {
    el: root,
    onData: () => {
      cards.forEach(({ card }) => card.update?.());
    },
    destroy: () => cards.forEach(({ card }) => card.destroy?.()),
  };
}
