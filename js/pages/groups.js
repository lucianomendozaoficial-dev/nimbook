import { el, clear, formatCount } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, userById, loadPost, canSeePost,
} from '../core/store.js';
import { emptyState, openModal, toast } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import { createGroup, joinGroup, leaveGroup } from '../core/actions.js';
import { postCard } from '../components/postcard.js';
import { navigate } from '../core/router.js';
import { parseRoute } from '../core/router.js';

const TABS = [
  { id: 'grupos', label: 'Grupos', type: 'group' },
  { id: 'canales', label: 'Canales', type: 'channel' },
];

export function groupsPage(tab = 'grupos') {
  const root = el('div');
  const list = el('div', { class: 'group-grid' });
  const tabs = el('div', { class: 'tabs' });

  const current = TABS.find((item) => item.id === tab) || TABS[0];

  function renderTabs() {
    clear(tabs);
    for (const item of TABS) {
      const count = state.groups.filter((group) => (group.type || 'group') === item.type).length;
      tabs.appendChild(el('a', {
        class: `tab ${item.id === current.id ? 'active' : ''}`.trim(),
        href: `#/grupos${item.id === 'grupos' ? '' : `/${item.id}`}`,
      }, item.label, count ? el('span', { class: 'tab-count', text: `· ${count}` }) : null));
    }
  }

  function render() {
    clear(list);
    renderTabs();
    const items = state.groups.filter((group) => (group.type || 'group') === current.type);

    if (!items.length) {
      list.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: current.type === 'channel' ? 'radio' : 'groups',
          title: current.type === 'channel' ? 'Todavía no hay canales' : 'Todavía no hay grupos',
          description: current.type === 'channel'
            ? 'Creá un canal para compartir novedades con tus seguidores.'
            : 'Creá el primero y sumá a tus amigos.',
          action: el('button', {
            class: 'btn primary', type: 'button', text: current.type === 'channel' ? 'Crear canal' : 'Crear grupo',
            onclick: () => openCreate(current.type),
          }),
        })));
      return;
    }

    for (const group of items) {
      list.appendChild(el('a', { class: 'group-card', href: `#/grupos/${group.id}` },
        el('div', { class: 'group-cover' }, group.cover
          ? mediaImg(group.cover, { alt: group.name })
          : el('div', { class: 'group-cover-fallback' },
            icon((group.type || 'group') === 'channel' ? 'radio' : 'groups', 34))),
        el('div', { class: 'group-body' },
          el('div', { class: 'row between' },
            el('div', { class: 'post-name', text: group.name }),
            (group.type || 'group') === 'channel'
              ? el('span', { class: 'chip brand', text: 'Canal' })
              : null),
          el('div', { class: 'muted small' },
            `${formatCount(group.memberIds?.length || 0)} ${(group.type || 'group') === 'channel' ? (group.memberIds?.length === 1 ? 'seguidor' : 'seguidores') : (group.memberIds?.length === 1 ? 'miembro' : 'miembros')} · ${group.privacy === 'private' ? 'Privado' : 'Público'}`))));
    }
  }

  function openCreate(type = 'group') {
    const name = el('input', { class: 'input', placeholder: 'Nombre', maxlength: '60' });
    const description = el('textarea', {
      class: 'textarea', rows: '3', placeholder: '¿De qué se trata?', maxlength: '300',
    });
    let kind = type;
    const kindRow = el('div', { class: 'segmented', style: { width: '100%' } });
    const paint = () => {
      clear(kindRow);
      for (const item of [{ id: 'group', label: 'Grupo' }, { id: 'channel', label: 'Canal' }]) {
        kindRow.appendChild(el('button', {
          class: `segmented-item ${kind === item.id ? 'active' : ''}`.trim(), type: 'button',
          text: item.label, style: { flex: '1' },
          onclick: () => { kind = item.id; paint(); },
        }));
      }
    };
    paint();

    const api = openModal({
      title: type === 'channel' ? 'Crear canal' : 'Crear grupo',
      body: el('div', { class: 'col gap-12' },
        kindRow,
        el('div', { class: 'field' }, el('label', { text: 'Nombre' }), name),
        el('div', { class: 'field' }, el('label', { text: 'Descripción' }), description),
        el('p', { class: 'muted small', text: kind === 'channel'
          ? 'En un canal solo publicás vos; los demás lo leen.'
          : 'En un grupo todos los miembros pueden publicar.' })),
      footer: el('button', {
        class: 'btn primary block', type: 'button', text: 'Crear',
        onclick: async (event) => {
          event.currentTarget.disabled = true;
          try {
            const group = await createGroup({ name: name.value, description: description.value, type: kind });
            api.close();
            toast(kind === 'channel' ? 'Canal creado' : 'Grupo creado', { type: 'success' });
            navigate(`/grupos/${group.id}`);
          } catch (err) {
            event.currentTarget.disabled = false;
            toast(err.message, { type: 'error' });
          }
        },
      }, 'Crear'),
    });
  }

  root.append(
    el('div', { class: 'page-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Grupos y canales' }),
        el('p', { class: 'muted small', text: 'Comunidades para compartir con tu gente.' })),
      el('button', {
        class: 'btn primary sm', type: 'button',
        onclick: () => openCreate(current.type),
      }, icon('plus', 16), current.type === 'channel' ? 'Crear canal' : 'Crear grupo')),
    el('div', { class: 'page-card', style: { padding: '12px 16px', marginBottom: '16px' } }, tabs),
    list,
  );

  render();
  return {
    el: root,
    onData(topic) { if (topic === 'groups') render(); },
  };
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
        emptyState({ iconName: 'groups', title: 'No encontramos este grupo' })));
      return;
    }

    const me = state.me;
    const member = group.memberIds?.includes(me.id);
    const isChannel = (group.type || 'group') === 'channel';
    const isOwner = group.ownerId === me.id;
    const canPost = !isChannel || isOwner;

    const stats = el('div', { class: 'profile-stats' },
      el('span', { text: `${formatCount(group.memberIds?.length || 0)} ${isChannel ? (group.memberIds?.length === 1 ? 'seguidor' : 'seguidores') : (group.memberIds?.length === 1 ? 'miembro' : 'miembros')}` }),
      el('span', { text: '·' }),
      el('span', { text: group.privacy === 'private' ? 'Privado' : 'Público' }),
      group.ownerId ? el('span', { text: '·' }) : null,
      group.ownerId
        ? el('span', { text: `Creado por ${displayName(userById(group.ownerId))}` })
        : null);

    const actions = el('div', { class: 'profile-actions-row' });
    actions.appendChild(member
      ? el('button', {
        class: 'btn soft', type: 'button', text: isChannel ? 'Dejar de seguir' : 'Salir del grupo',
        onclick: async () => { await leaveGroup(group.id); render(); },
      })
      : el('button', {
        class: 'btn primary', type: 'button', text: isChannel ? 'Seguir canal' : 'Unirme',
        onclick: async () => { await joinGroup(group.id); render(); },
      }));
    if (canPost) {
      actions.appendChild(el('button', {
        class: 'btn', type: 'button', onclick: () => navigate(`/publicar?g=${group.id}`),
      }, icon('edit', 16), isChannel ? 'Publicar en el canal' : 'Publicar en el grupo'));
    }

    const info = el('div', { class: 'profile-info' },
      el('div', { class: 'row gap-8', style: { alignItems: 'center' } },
        el('h1', { class: 'profile-name', text: group.name }),
        el('span', { class: 'chip brand', text: isChannel ? 'Canal' : 'Grupo' })),
      el('p', { class: 'muted', text: group.description || '' }),
      stats,
      actions);

    const cover = el('div', { class: 'profile-cover' },
      group.cover
        ? mediaImg(group.cover, { alt: group.name, eager: true })
        : el('div', { class: 'group-cover-fallback big' }, icon(isChannel ? 'radio' : 'groups', 40)));

    wrap.appendChild(el('div', { class: 'profile-header' },
      cover,
      el('div', { class: 'profile-main-row' }, info)));
    const posts = state.feedIndex
      .map((entry) => state.posts.get(entry.id))
      .filter((post) => post && post.groupId === group.id && canSeePost(post, me.id));

    if (!posts.length) {
      wrap.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: isChannel ? 'radio' : 'message',
          title: isChannel ? 'El canal está vacío' : 'Sin publicaciones todavía',
          description: isOwner
            ? 'Publicá la primera novedad.'
            : (isChannel ? 'Cuando el creador publique algo, lo vas a ver acá.' : 'Unite para participar.'),
          action: canPost
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

  root.append(wrap);
  return {
    el: root,
    onData(topic) { if (topic === 'groups' || topic === 'feed') render(); },
    destroy() { cards.forEach((card) => card.destroy?.()); },
  };
}
