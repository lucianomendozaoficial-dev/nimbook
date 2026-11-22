import { el, clear, formatCount } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, userById, loadPost, canSeePost,
} from '../core/store.js';
import { emptyState } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import { joinGroup, leaveGroup } from '../core/actions.js';
import { postCard } from '../components/postcard.js';
import { navigate } from '../core/router.js';
import { openGroupEditor } from './group-editor.js';

const TABS = [
  { id: 'grupos', label: 'Grupos', type: 'group' },
  { id: 'canales', label: 'Canales', type: 'channel' },
];

const DEFAULT_COLOR = '#0a84ff';
const emojiFallback = (type) => (type === 'channel' ? '📣' : '👥');

function colorOf(group) {
  return /^#[0-9a-f]{6}$/i.test(group?.color || '') ? group.color : DEFAULT_COLOR;
}

function coverOf(group, { big = false } = {}) {
  if (group.cover) return mediaImg(group.cover, { alt: group.name, eager: big });
  return el('div', {
    class: `group-cover-fallback${big ? ' big' : ''}`,
    style: { '--group-color': colorOf(group) },
  }, el('span', { class: 'group-cover-emoji', text: group.emoji || emojiFallback(group.type) }));
}

function privacyLabel(group) {
  return group.privacy === 'private' ? 'Privado' : 'Público';
}

function memberWord(group) {
  const n = group.memberIds?.length || 0;
  if ((group.type || 'group') === 'channel') return n === 1 ? 'seguidor' : 'seguidores';
  return n === 1 ? 'miembro' : 'miembros';
}

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
    const items = state.groups
      .filter((group) => (group.type || 'group') === current.type)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!items.length) {
      list.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: current.type === 'channel' ? 'radio' : 'groups',
          title: current.type === 'channel' ? 'Todavía no hay canales' : 'Todavía no hay grupos',
          description: current.type === 'channel'
            ? 'Creá un canal para compartir novedades con tus seguidores.'
            : 'Creá el primero y sumá a tus amigos.',
          action: el('button', {
            class: 'btn primary', type: 'button',
            text: current.type === 'channel' ? 'Crear canal' : 'Crear grupo',
            onclick: () => openGroupEditor({ type: current.type, onSaved: render }),
          }),
        })));
      return;
    }

    for (const group of items) {
      list.appendChild(el('a', {
        class: 'group-card', href: `#/grupos/${group.id}`,
        style: { '--group-color': colorOf(group) },
      },
      el('div', { class: 'group-cover' }, coverOf(group)),
      el('div', { class: 'group-body' },
        el('div', { class: 'group-name-row' },
          el('span', { class: 'group-card-emoji', text: group.emoji || emojiFallback(group.type) }),
          el('span', { class: 'group-card-name', text: group.name }),
          el('span', {
            class: `chip ${(group.type || 'group') === 'channel' ? 'brand' : ''}`.trim(),
            text: (group.type || 'group') === 'channel' ? 'Canal' : 'Grupo',
          })),
        group.category ? el('div', { class: 'group-category', text: group.category }) : null,
        el('div', { class: 'group-desc', text: group.description || 'Sin descripción.' }),
        el('div', { class: 'group-meta' },
          el('span', { text: `${formatCount(group.memberIds?.length || 0)} ${memberWord(group)}` }),
          el('span', { text: '·' }),
          el('span', { text: privacyLabel(group) })))));
    }
  }

  root.append(
    el('div', { class: 'page-head' },
      el('div', { class: 'grow' },
        el('h1', { text: 'Grupos y canales' }),
        el('p', { class: 'muted small', text: 'Comunidades para compartir con tu gente.' })),
      el('button', {
        class: 'btn primary sm', type: 'button',
        onclick: () => openGroupEditor({ type: current.type, onSaved: render }),
      }, icon('plus', 16), current.type === 'channel' ? 'Crear canal' : 'Crear grupo')),
    el('div', { class: 'page-card', style: { padding: '12px 16px', marginBottom: '16px' } }, tabs),
    list);

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
    const color = colorOf(group);

    const stats = el('div', { class: 'profile-stats' },
      el('span', { text: `${formatCount(group.memberIds?.length || 0)} ${memberWord(group)}` }),
      el('span', { text: '·' }),
      el('span', { text: privacyLabel(group) }),
      group.category ? el('span', { text: '·' }) : null,
      group.category ? el('span', { class: 'group-category', text: group.category }) : null,
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
    if (isOwner) {
      actions.appendChild(el('button', {
        class: 'btn', type: 'button',
        onclick: () => openGroupEditor({ group, onSaved: render }),
      }, icon('settings', 16), 'Personalizar'));
    }

    const info = el('div', { class: 'profile-info group-profile-info' },
      el('div', { class: 'group-title-row' },
        el('span', { class: 'group-title-emoji', text: group.emoji || emojiFallback(group.type) }),
        el('h1', { class: 'profile-name', text: group.name }),
        el('span', { class: 'chip brand', text: isChannel ? 'Canal' : 'Grupo' })),
      el('p', { class: 'muted', text: group.description || 'Sin descripción.' }),
      stats,
      actions);

    const cover = el('div', { class: 'profile-cover', style: { '--group-color': color } },
      group.cover
        ? mediaImg(group.cover, { alt: group.name, eager: true })
        : el('div', { class: 'group-cover-fallback big', style: { '--group-color': color } },
          el('span', { class: 'group-cover-emoji', text: group.emoji || emojiFallback(group.type) })));

    wrap.appendChild(el('div', {
      class: 'profile-header group-profile-header',
      style: { '--group-color': color },
    }, cover, el('div', { class: 'profile-main-row' }, info)));

    if (group.rules) {
      wrap.appendChild(el('div', { class: 'page-card group-rules' },
        el('div', { class: 'group-rules-icon' }, icon('shield', 20)),
        el('div', null,
          el('div', { class: 'strong', text: isChannel ? 'Reglas del canal' : 'Reglas del grupo' }),
          el('p', { class: 'muted small', text: group.rules }))));
    }

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
    onData(topic) { if (topic === 'groups' || topic === 'feed' || topic === 'post') render(); },
    destroy() { cards.forEach((card) => card.destroy?.()); },
  };
}
