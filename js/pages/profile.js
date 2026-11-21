/* ==========================================================================
   pages/profile.js — perfil público y "Mi perfil"
   ========================================================================== */
import { el, clear, formatCount, longDate, monthYear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, userById, userByUsername, displayName, followersOf, followingOf,
  countFollowers, countFollowing, loadFollowers, loadFollowing, loadPost, loadUser,
  postsByAuthor, canSeePost, relationWith, updateProfileCache,
} from '../core/store.js';
import {
  avatarEl, emptyState, openModal, toast, lightbox,
} from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import { updateProfile } from '../core/actions.js';
import { followButton } from '../components/follow-button.js';
import { postCard } from '../components/postcard.js';
import { navigate, goBack, parseRoute } from '../core/router.js';
import { ValidationError } from '../core/auth.js';

const TABS = [
  { id: 'posts', label: 'Publicaciones' },
  { id: 'seguidores', label: 'Seguidores' },
  { id: 'fotos', label: 'Fotos' },
  { id: 'about', label: 'Información' },
];

/* --------------------------- editar mi perfil ---------------------------- */

export function editProfileModal(user, onSaved) {
  const nameParts = String(user.name || '').trim().split(/\s+/);
  const first = el('input', { class: 'input', value: user.firstName || nameParts.shift() || '', maxlength: '40' });
  const last = el('input', { class: 'input', value: user.lastName || nameParts.join(' ') || '', maxlength: '40' });
  const username = el('input', {
    class: 'input', value: user.username || '', maxlength: '30', autocapitalize: 'none',
  });
  const bio = el('textarea', { class: 'textarea', rows: '3', maxlength: '300' });
  bio.value = user.bio || '';
  const whatsapp = el('input', {
    class: 'input', value: user.whatsapp || '', inputmode: 'tel', maxlength: '20',
    placeholder: 'Ej. 2615551234',
  });
  const instagram = el('input', {
    class: 'input', value: user.instagram ? `@${user.instagram}` : '', maxlength: '40',
    placeholder: '@tuusuario',
  });
  const birthday = el('input', { class: 'input', type: 'date', value: user.birthday || '' });
  const location = el('input', { class: 'input', value: user.location || '', maxlength: '60' });
  const work = el('input', { class: 'input', value: user.work || '', maxlength: '80' });
  const education = el('input', { class: 'input', value: user.education || '', maxlength: '80' });
  const MARITAL = ['', 'Soltero/a', 'En pareja', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Prefiero no decirlo'];
  const marital = el('select', { class: 'input' },
    ...MARITAL.map((option) => el('option', { value: option, text: option || 'Sin especificar' })));
  marital.value = user.maritalStatus || '';
  const error = el('div', { class: 'field-error hide' });

  const saveBtn = el('button', { class: 'btn primary block', type: 'button', text: 'Guardar cambios' });
  const avatarBox = el('div', { class: 'avatar-edit' }, avatarEl(user, 'xl'));
  const coverBox = el('div', { class: 'cover-edit-box' });

  async function pick(kind) {
    const files = await openFilePicker();
    if (!files.length) return;
    const problem = validateImageFile(files[0]);
    if (problem) { toast(problem, { type: 'error' }); return; }
    try {
      toast('Subiendo imagen…');
      const record = await uploadImage(files[0], kind === 'cover' ? 'covers' : 'avatars', {
        maxSize: kind === 'cover' ? 2200 : 720,
      });
      const updated = await updateProfile(kind === 'cover' ? { cover: record.path } : { avatar: record.path });
      updateProfileCache(updated);
      clear(avatarBox);
      avatarBox.appendChild(avatarEl(updated, 'xl'));
      toast('Imagen actualizada', { type: 'success' });
    } catch (err) { toast(err.message, { type: 'error' }); }
  }

  const api = openModal({
    title: 'Personalizar mi perfil',
    body: el('div', { class: 'col gap-12' },
      el('div', { class: 'profile-edit-media' },
        avatarBox,
        el('div', { class: 'row gap-8' },
          el('button', { class: 'btn sm', type: 'button', onclick: () => pick('avatar') },
            icon('camera', 15), 'Cambiar foto'),
          el('button', { class: 'btn sm', type: 'button', onclick: () => pick('cover') },
            icon('photo', 15), 'Cambiar portada'))),
      el('div', { class: 'row gap-8' },
        el('div', { class: 'field grow' }, el('label', { text: 'Nombre' }), first),
        el('div', { class: 'field grow' }, el('label', { text: 'Apellido' }), last)),
      el('div', { class: 'field' }, el('label', { text: 'Usuario' }), username),
      el('div', { class: 'field' }, el('label', { text: 'Biografía' }), bio),
      el('div', { class: 'row gap-8' },
        el('div', { class: 'field grow' }, el('label', { text: 'WhatsApp' }), whatsapp),
        el('div', { class: 'field grow' }, el('label', { text: 'Instagram' }), instagram)),
      el('div', { class: 'row gap-8' },
        el('div', { class: 'field grow' }, el('label', { text: 'Fecha de nacimiento' }), birthday),
        el('div', { class: 'field grow' }, el('label', { text: 'Ciudad' }), location)),
      el('div', { class: 'row gap-8' },
        el('div', { class: 'field grow' }, el('label', { text: 'Trabajo' }), work),
        el('div', { class: 'field grow' }, el('label', { text: 'Estudios' }), education)),
      el('div', { class: 'row gap-8' },
        el('div', { class: 'field grow' }, el('label', { text: 'Estado civil' }), marital),
        el('div', { class: 'field grow' })),
      error),
    footer: saveBtn,
    size: 'lg',
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    error.classList.add('hide');
    try {
      await updateProfile({
        firstName: first.value,
        lastName: last.value,
        username: username.value,
        bio: bio.value,
        whatsapp: whatsapp.value,
        instagram: instagram.value,
        birthday: birthday.value,
        location: location.value,
        work: work.value,
        education: education.value,
        maritalStatus: marital.value,
      });
      api.close();
      toast('Perfil actualizado', { type: 'success' });
      onSaved?.();
    } catch (err) {
      error.textContent = err instanceof ValidationError ? err.message : 'No se pudo guardar.';
      error.classList.remove('hide');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';
    }
  });
}

/* -------------------------------- página -------------------------------- */

export function profilePage(username, { preview = false } = {}) {
  const root = el('div');
  let target = preview ? state.me : null;
  let cards = [];
  let loading = true;

  function goTab(tab) {
    const base = preview ? '/mi-perfil' : `/u/${target.username}`;
    navigate(`${base}${tab === 'posts' ? '' : `/${tab}`}`);
  }

  function currentTab() {
    return parseRoute().params.tab || 'posts';
  }

  function coverEl(user) {
    const cover = el('div', { class: 'profile-cover' },
      user.cover ? mediaImg(user.cover, { alt: 'Portada', eager: true }) : null);
    return cover;
  }

  function openMyMenu() {
    const api = openModal({
      title: 'Mi perfil',
      body: el('div', { class: 'col gap-4' },
        el('button', {
          class: 'settings-row', type: 'button', style: { textAlign: 'left', width: '100%' },
          onclick: () => { api.close(); editProfileModal(state.me, () => render()); },
        }, el('span', { class: 'sr-ic' }, icon('edit', 18)),
        el('div', { class: 'sr-body' },
          el('div', { class: 'sr-title', text: 'Editar perfil' }),
          el('div', { class: 'sr-sub', text: 'Foto, portada, datos y contacto' }))),
        el('button', {
          class: 'settings-row', type: 'button', style: { textAlign: 'left', width: '100%' },
          onclick: () => { api.close(); navigate('/configuracion'); },
        }, el('span', { class: 'sr-ic' }, icon('settings', 18)),
        el('div', { class: 'sr-body' },
          el('div', { class: 'sr-title', text: 'Configuración' }),
          el('div', { class: 'sr-sub', text: 'Tema, sonidos y animaciones' }))),
        el('button', {
          class: 'settings-row', type: 'button', style: { textAlign: 'left', width: '100%' },
          onclick: async () => {
            const url = `${location.origin}${location.pathname}#/u/${state.me.username}`;
            try { await navigator.clipboard.writeText(url); toast('Enlace copiado', { type: 'success' }); }
            catch { toast('No se pudo copiar', { type: 'error' }); }
            api.close();
          },
        }, el('span', { class: 'sr-ic' }, icon('link', 18)),
        el('div', { class: 'sr-body' },
          el('div', { class: 'sr-title', text: 'Copiar enlace de mi perfil' })))),
      size: 'sm',
    });
  }

  function header(user) {
    const isMe = user.id === state.me?.id;
    const followers = followersOf(user.id);
    const actions = el('div', { class: 'profile-actions' });

    if (preview) {
      actions.appendChild(el('button', {
        class: 'btn-icon profile-dots', type: 'button', 'aria-label': 'Opciones de mi perfil',
        onclick: openMyMenu,
      }, icon('more-h', 22)));
    } else if (isMe) {
      actions.append(
        el('button', {
          class: 'btn primary', type: 'button', onclick: () => editProfileModal(state.me, () => render()),
        }, icon('edit', 16), 'Editar perfil'),
        el('a', { class: 'btn', href: `#/u/${state.me.username}` }, icon('user', 16), 'Ver como público'));
    } else {
      actions.append(followButton(user, { size: 'lg', onChange: () => render() }));
    }

    return el('div', { class: 'profile-header' },
      coverEl(user),
      el('div', { class: 'profile-main-row' },
        el('div', { class: 'profile-avatar-big' }, avatarEl(user, 'xxl')),
        el('div', { class: 'profile-info' },
          el('h1', { class: 'profile-name', text: displayName(user) }),
          user.bio ? el('p', { class: 'muted', text: user.bio }) : null,
          el('div', { class: 'profile-stats' },
            el('a', { href: `#/u/${user.username}/seguidores`, text: `${formatCount(countFollowers(user.id))} seguidores` }),
            el('span', { text: '·' }),
            el('a', { href: `#/u/${user.username}/siguiendo`, text: `${formatCount(countFollowing(user.id))} siguiendo` }),
            el('span', { text: '·' }),
            el('span', { text: `${formatCount(postsByAuthor(user.id).length)} publicaciones` })),
          el('div', { class: 'profile-actions-row' }, actions)),
        el('div', { class: 'profile-avatar-stack' },
          ...followers.slice(0, 5).map((person) => el('a', {
            href: `#/u/${person.username}`, title: displayName(person),
          }, avatarEl(person, 'xs'))))),
      el('div', { class: 'profile-tabs' },
        ...TABS.map((tab) => el('button', {
          class: `tab ${currentTab() === tab.id ? 'active' : ''}`.trim(), type: 'button',
          text: tab.id === 'seguidores'
            ? `${tab.label} · ${formatCount(countFollowers(user.id))}`
            : tab.label,
          onclick: () => goTab(tab.id),
        }))));
  }

  function postsSection(user) {
    const wrap = el('div', { class: 'col gap-16' });
    const posts = postsByAuthor(user.id).filter((post) => canSeePost(post, state.me?.id));
    if (!posts.length) {
      wrap.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'photo',
          title: user.id === state.me?.id ? 'Todavía no publicaste nada' : `${displayName(user)} no publicó nada`,
          description: user.id === state.me?.id ? 'Tu primer momento puede ser hoy.' : '',
          action: user.id === state.me?.id
            ? el('button', {
              class: 'btn primary', type: 'button', text: 'Crear publicación',
              onclick: () => navigate('/publicar'),
            })
            : null,
        })));
      return wrap;
    }
    for (const post of posts.slice(0, 15)) {
      const card = postCard(post, { onUpdate: () => render() });
      cards.push(card);
      wrap.appendChild(card.el);
    }
    return wrap;
  }

  function peopleSection(user, mode) {
    const people = mode === 'siguiendo' ? followingOf(user.id) : followersOf(user.id);
    if (!people.length) {
      return el('div', { class: 'card' },
        emptyState({
          iconName: 'users',
          title: mode === 'siguiendo' ? 'Todavía no sigue a nadie' : 'Todavía no tiene seguidores',
          description: mode === 'siguiendo'
            ? 'Cuando siga a alguien aparecerá acá.'
            : 'Compartí el perfil para que más gente lo siga.',
        }));
    }
    return el('div', { class: 'card pad' },
      el('div', { class: 'friend-grid' },
        ...people.map((person) => el('a', {
          class: 'user-tile', href: `#/u/${person.username}`,
        },
        el('div', { class: 'ut-img' }, avatarEl(person, 'xl')),
        el('div', { class: 'ut-body' },
          el('span', { class: 'ut-name', text: displayName(person) }),
          el('span', { class: 'ut-sub', text: `@${person.username}` }))))));
  }

  function photosSection(user) {
    const photos = postsByAuthor(user.id)
      .filter((post) => canSeePost(post, state.me?.id))
      .flatMap((post) => (post.media || []).map((item) => ({ path: item.path, postId: post.id })));
    if (!photos.length) {
      return el('div', { class: 'card' }, emptyState({ iconName: 'photo', title: 'Sin fotos' }));
    }
    const paths = photos.map((photo) => photo.path);
    return el('div', { class: 'card pad' },
      el('div', { class: 'photo-grid' },
        ...photos.map((photo, index) => mediaImg(photo.path, {
          alt: 'Foto',
          onClick: () => lightbox(paths, index),
        }))));
  }

  function aboutSection(user) {
    const rows = [
      ['Nombre', displayName(user)],
      ['Usuario', `@${user.username}`],
      ['Biografía', user.bio || '—'],
      ['Trabajo', user.work || '—'],
      ['Estudios', user.education || '—'],
      ['Ciudad', user.location || '—'],
      ['Nacimiento', user.birthday ? longDate(user.birthday) : '—'],
      ['Estado civil', user.maritalStatus || '—'],
      ['WhatsApp', user.whatsapp ? `+${user.whatsapp}` : '—'],
      ['Instagram', user.instagram ? `@${user.instagram}` : '—'],
      ['Miembro desde', monthYear(user.createdAt)],
    ];
    return el('div', { class: 'card pad' },
      el('h2', { class: 'card-title', text: 'Información' }),
      ...rows.map(([label, value]) => el('div', { class: 'about-row' },
        el('span', { class: 'muted', text: label }),
        el('span', { text: value }))));
  }

  function render() {
    cards.forEach((card) => card.destroy?.());
    cards = [];
    clear(root);

    if (loading) {
      root.appendChild(el('div', { class: 'center', style: { padding: '60px' } },
        el('span', { class: 'spinner' })));
      return;
    }

    if (!target) {
      root.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'user-x',
          title: 'Perfil no encontrado',
          description: 'Esa cuenta no existe o cambió de usuario.',
          action: el('button', {
            class: 'btn primary', type: 'button', text: 'Ir al inicio',
            onclick: () => goBack('/inicio'),
          }),
        })));
      return;
    }

    root.appendChild(header(target));
    const tab = currentTab();
    if (tab === 'seguidores') root.appendChild(peopleSection(target, 'seguidores'));
    else if (tab === 'siguiendo') root.appendChild(peopleSection(target, 'siguiendo'));
    else if (tab === 'fotos') root.appendChild(photosSection(target));
    else if (tab === 'about') root.appendChild(aboutSection(target));
    else root.appendChild(postsSection(target));
  }

  async function init() {
    if (!preview) {
      const entry = state.userIndex.find((user) =>
        user.username?.toLowerCase() === String(username || '').toLowerCase() || user.id === username);
      target = entry ? await loadUser(entry.id) : userByUsername(username) || userById(username);
    } else {
      target = state.me;
    }
    if (target) {
      await Promise.all([loadFollowers(target.id), loadFollowing(target.id)]);
      const ids = state.feedIndex.filter((entry) => entry.authorId === target.id).slice(0, 15);
      await Promise.all(ids.map((entry) => loadPost(entry.id)));
    }
    loading = false;
    render();
  }

  init();

  return {
    el: root,
    onData(topic) {
      if (topic === 'post' || topic === 'me' || topic === 'follow') render();
    },
    destroy() { cards.forEach((card) => card.destroy?.()); },
  };
}
