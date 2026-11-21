/* ==========================================================================
   pages/groups.js — grupos y página de grupo
   ========================================================================== */
import { el, clear, formatCount, timeAgo } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, userById, loadPost, canSeePost,
} from '../core/store.js';
import { avatarEl, emptyState, openModal, toast } from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import { createGroup, joinGroup, leaveGroup } from '../core/actions.js';
import { postCard } from '../components/postcard.js';
import { goBack, navigate } from '../core/router.js';

function header(title, subtitle) {
  return el('div', { class: 'page-head' },
    el('button', {
      class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
    }, icon('arrow-left', 17), 'Volver'),
    el('div', { class: 'grow' },
      el('h1', { text: title }),
      subtitle ? el('p', { class: 'muted small', text: subtitle }) : null));
}

export function groupsPage() {
  const root = el('div');
  const list = el('div', { class: 'group-grid' });

  function render() {
    clear(list);
    if (!state.groups.length) {
      list.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'groups',
          title: 'Todavía no hay grupos',
          description: 'Creá el primero y sumá a tus amigos.',
        })));
      return;
    }
    for (const group of state.groups) {
      list.appendChild(el('a', { class: 'group-card', href: `#/grupos/${group.id}` },
        el('div', { class: 'group-cover' }, group.cover
          ? mediaImg(group.cover, { alt: group.name })
          : el('div', { class: 'group-cover-fallback' }, icon('groups', 34))),
        el('div', { class: 'group-body' },
          el('div', { class: 'post-name', text: group.name }),
          el('div', { class: 'muted small' },
            `${formatCount(group.memberIds?.length || 0)} miembros · ${group.privacy === 'private' ? 'Privado' : 'Público'}`))));
    }
  }

  function openCreate() {
    const name = el('input', { class: 'input', placeholder: 'Nombre del grupo', maxlength: '60' });
    const description = el('textarea', {
      class: 'textarea', rows: '3', placeholder: '¿De qué se trata?', maxlength: '300',
    });
    const api = openModal({
      title: 'Crear grupo',
      body: el('div', { class: 'col gap-12' },
        el('div', { class: 'field' }, el('label', { text: 'Nombre' }), name),
        el('div', { class: 'field' }, el('label', { text: 'Descripción' }), description)),
      footer: el('button', {
        class: 'btn primary block', type: 'button', text: 'Crear grupo',
        onclick: async () => {
          try {
            const group = await createGroup({ name: name.value, description: description.value });
            api.close();
            toast('Grupo creado', { type: 'success' });
            navigate(`/grupos/${group.id}`);
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, 'Crear grupo'),
    });
  }

  root.append(
    el('div', { class: 'page-head' },
      el('button', {
        class: 'btn ghost sm', type: 'button', onclick: () => goBack('/inicio'),
      }, icon('arrow-left', 17), 'Volver'),
      el('h1', { class: 'grow', text: 'Grupos' }),
      el('button', { class: 'btn primary sm', type: 'button', onclick: openCreate },
        icon('plus', 16), 'Crear grupo')),
    list,
  );

  render();
  return { el: root, onData(topic) { if (topic === 'groups') render(); } };
}

export function groupPage(id) {
  const root = el('div');
  const wrap = el('div', { class: 'col gap-16' });
  let cards = [];

  function render() {
    cards.forEach((card) => card.destroy?.());
    cards = [];
    clear(wrap);
    const group = state.groups.find((item) => item.id === id);
    if (!group) {
      wrap.appendChild(el('div', { class: 'card' },
        emptyState({ iconName: 'groups', title: 'Grupo no encontrado' })));
      return;
    }
    const me = state.me;
    const member = group.memberIds?.includes(me.id);

    wrap.append(
      el('div', { class: 'profile-header' },
        el('div', { class: 'profile-cover' }, group.cover
          ? mediaImg(group.cover, { alt: group.name })
          : el('div', { class: 'group-cover-fallback big' }, icon('groups', 40))),
        el('div', { class: 'profile-main-row' },
          el('div', { class: 'profile-info' },
            el('h1', { class: 'profile-name', text: group.name }),
            el('p', { class: 'muted', text: group.description || '' }),
            el('div', { class: 'profile-stats' },
              el('span', { text: `${formatCount(group.memberIds?.length || 0)} miembros` }),
              el('span', { text: '·' }),
              el('span', { text: group.privacy === 'private' ? 'Privado' : 'Público' }))),
          el('div', { class: 'profile-actions' },
            member
              ? el('button', {
                class: 'btn soft', type: 'button', text: 'Salir del grupo',
                onclick: async () => { await leaveGroup(group.id); render(); },
              })
              : el('button', {
                class: 'btn primary', type: 'button', text: 'Unirme',
                onclick: async () => { await joinGroup(group.id); render(); },
              }),
            member
              ? el('button', {
                class: 'btn', type: 'button', onclick: () => navigate(`/publicar?g=${group.id}`),
              }, icon('edit', 16), 'Publicar en el grupo')
              : null))));

    const posts = state.feedIndex
      .filter((entry) => state.posts.get(entry.id)?.groupId === group.id)
      .map((entry) => state.posts.get(entry.id))
      .filter((post) => post && canSeePost(post, me.id));

    if (!posts.length) {
      wrap.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'message',
          title: 'Sin publicaciones en el grupo',
          description: member ? 'Sé el primero en publicar.' : 'Unite para participar.',
          action: member
            ? el('button', {
              class: 'btn primary', type: 'button', text: 'Publicar',
              onclick: () => navigate(`/publicar?g=${group.id}`),
            })
            : null,
        })));
      return;
    }

    for (const post of posts.slice(0, 12)) {
      const card = postCard(post, { onUpdate: render });
      cards.push(card);
      wrap.appendChild(card.el);
    }
  }

  (async () => {
    const ids = state.feedIndex.map((entry) => entry.id).slice(0, 60);
    await Promise.all(ids.map((postId) => loadPost(postId)));
    render();
  })();

  root.append(header('', ''), wrap);
  return {
    el: root,
    onData(topic) { if (topic === 'groups' || topic === 'feed') render(); },
    destroy() { cards.forEach((card) => card.destroy?.()); },
  };
}
