/* ==========================================================================
   pages/profile.js — perfil con portada, pestañas, fotos y amigos
   ========================================================================== */
import { el, clear, formatCount, longDate, timeAgo, monthYear } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, userByUsername, displayName, friendsOf, friendCount, postsByAuthor, canSeePost,
  relationWith, incomingRequests, mutualFriends, userById,
} from '../core/store.js';
import {
  avatarEl, emptyState, openModal, toast, confirmDialog, dropdown, lightbox,
} from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import {
  updateProfile, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend,
} from '../core/actions.js';
import { postCard } from '../components/postcard.js';
import { mountComposer, openComposer } from '../components/composer.js';
import { navigate } from '../core/router.js';
import { ValidationError } from '../core/auth.js';

const TABS = [
  { id: 'posts', label: 'Publicaciones' },
  { id: 'friends', label: 'Amigos' },
  { id: 'photos', label: 'Fotos' },
  { id: 'about', label: 'Información' },
];

/* ------------------------------ editar perfil ---------------------------- */

function editProfileModal(user, onSaved) {
  const nameInput = el('input', { class: 'input', value: user.name || '', maxlength: '60' });
  const usernameInput = el('input', {
    class: 'input', value: user.username || '', maxlength: '30', autocapitalize: 'none',
  });
  const bioInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '500' });
  bioInput.value = user.bio || '';
  const locationInput = el('input', { class: 'input', value: user.location || '', maxlength: '60' });
  const workInput = el('input', { class: 'input', value: user.work || '', maxlength: '80' });
  const educationInput = el('input', { class: 'input', value: user.education || '', maxlength: '80' });
  const birthdayInput = el('input', { class: 'input', type: 'date', value: user.birthday || '' });
  const whatsappInput = el('input', {
    class: 'input', value: user.whatsapp || '', maxlength: '20', inputmode: 'tel',
    placeholder: 'Ej. 2615551234',
  });
  const instagramInput = el('input', {
    class: 'input', value: user.instagram ? `@${user.instagram}` : '', maxlength: '40',
    spellcheck: 'false', autocapitalize: 'none', placeholder: '@tuusuario',
  });
  const genderSelect = el('select', { class: 'select' },
    el('option', { value: '', text: 'Sin especificar' }),
    el('option', { value: 'female', text: 'Mujer' }),
    el('option', { value: 'male', text: 'Hombre' }),
    el('option', { value: 'other', text: 'Otro' }),
    el('option', { value: 'none', text: 'Prefiero no decirlo' }));
  genderSelect.value = user.gender || '';

  const avatarPreview = el('img', {
    src: '', alt: 'Foto de perfil',
    style: { width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover' },
  });
  if (user.avatar) avatarPreview.src = mediaImg(user.avatar).src;

  let avatarPath = user.avatar || null;
  let uploadingAvatar = false;

  const pickAvatar = async () => {
    const files = await openFilePicker();
    if (!files.length) return;
    const problem = validateImageFile(files[0]);
    if (problem) { toast(problem, { type: 'error' }); return; }
    uploadingAvatar = true;
    try {
      avatarPreview.src = URL.createObjectURL(files[0]);
      const record = await uploadImage(files[0], 'avatars', { maxSize: 720 });
      avatarPath = record.path;
      toast('Foto lista. Guarda los cambios para aplicarla.');
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      uploadingAvatar = false;
    }
  };

  const body = el('div', { class: 'col gap-12' },
    el('div', { class: 'row gap-12' },
      el('div', { style: { position: 'relative' } },
        avatarPreview,
        el('button', {
          class: 'profile-avatar-edit', type: 'button', 'aria-label': 'Cambiar foto de perfil',
          style: { width: '32px', height: '32px' }, onclick: pickAvatar,
        }, icon('camera', 16))),
      el('div', { class: 'muted small', text: 'Puedes cambiar tu foto de perfil y tu portada desde tu perfil.' })),
    el('div', { class: 'field' }, el('label', { text: 'Nombre' }), nameInput),
    el('div', { class: 'field' }, el('label', { text: 'Usuario' }), usernameInput),
    el('div', { class: 'field' }, el('label', { text: 'Biografía' }), bioInput),
    el('div', { class: 'row gap-8' },
      el('div', { class: 'field grow' }, el('label', { text: 'Ciudad' }), locationInput),
      el('div', { class: 'field grow' }, el('label', { text: 'Fecha de nacimiento' }), birthdayInput)),
    el('div', { class: 'row gap-8' },
      el('div', { class: 'field grow' }, el('label', { text: 'Trabajo' }), workInput),
      el('div', { class: 'field grow' }, el('label', { text: 'Estudios' }), educationInput)),
    el('div', { class: 'row gap-8' },
      el('div', { class: 'field grow' }, el('label', { text: 'WhatsApp' }), whatsappInput),
      el('div', { class: 'field grow' }, el('label', { text: 'Instagram' }), instagramInput)),
    el('div', { class: 'field' }, el('label', { text: 'Sexo' }), genderSelect));

  const saveBtn = el('button', { class: 'btn primary block', type: 'button' }, 'Guardar');

  const api = openModal({
    title: 'Editar perfil',
    body,
    footer: [saveBtn],
    onClose: () => {},
  });

  saveBtn.addEventListener('click', async () => {
    if (uploadingAvatar) { toast('Espera a que suba la foto.', { type: 'error' }); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    try {
      await updateProfile({
        name: nameInput.value,
        username: usernameInput.value,
        bio: bioInput.value,
        location: locationInput.value,
        work: workInput.value,
        education: educationInput.value,
        birthday: birthdayInput.value,
        gender: genderSelect.value,
        whatsapp: whatsappInput.value,
        instagram: instagramInput.value,
        avatar: avatarPath,
      });
      api.close();
      toast('Perfil actualizado', { type: 'success' });
      onSaved?.();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
      toast(err instanceof ValidationError ? err.message : 'No se pudo guardar.', { type: 'error' });
    }
  });
}

/* ----------------------------- botones de relación ----------------------- */

function relationButtons(user, onChanged) {
  const me = state.me;
  const relation = relationWith(me.id, user.id);
  const wrap = el('div', { class: 'profile-actions' });

  const msgBtn = el('button', {
    class: 'btn', type: 'button',
    onclick: () => navigate(`/messages?u=${user.id}`),
  }, icon('message', 18), 'Mensaje');

  if (relation === 'self') {
    wrap.append(
      el('button', {
        class: 'btn primary', type: 'button',
        onclick: () => editProfileModal(user, onChanged),
      }, icon('edit', 17), 'Editar perfil'),
      el('button', {
        class: 'btn', type: 'button', text: 'Añadir historia',
        onclick: () => import('../components/stories.js').then(({ createStoryFlow }) => createStoryFlow()),
      }, icon('camera', 17)));
    return wrap;
  }

  if (relation === 'friends') {
    const friendBtn = el('button', {
      class: 'btn', type: 'button',
    }, icon('user-check', 18), 'Amigos');
    friendBtn.addEventListener('click', () => {
      dropdown(friendBtn, [
        {
          icon: 'user-x', label: 'Eliminar de amigos', danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: `¿Eliminar a ${displayName(user)} de tus amigos?`,
              description: '',
              confirmText: 'Eliminar amigo', danger: true, iconName: 'user-x',
            });
            if (!ok) return;
            try {
              await removeFriend(user.id);
              toast('Amistad eliminada', { type: 'success' });
              onChanged?.();
            } catch (err) { toast(err.message, { type: 'error' }); }
          },
        },
      ]);
    });
    wrap.append(friendBtn, msgBtn);
  } else if (relation === 'requested') {
    wrap.append(el('button', {
      class: 'btn', type: 'button',
    }, icon('clock', 18), 'Solicitud enviada'));
    wrap.appendChild(msgBtn);
  } else if (relation === 'incoming') {
    const request = state.requests.find((r) => r.from === user.id && r.to === me.id);
    wrap.append(
      el('button', {
        class: 'btn primary', type: 'button',
        onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await acceptFriendRequest(request.id);
            toast('Ahora son amigos', { type: 'success' });
            onChanged?.();
          } catch (err) { button.disabled = false; toast(err.message, { type: 'error' }); }
        },
      }, icon('user-check', 18), 'Aceptar solicitud'),
      msgBtn);
  } else {
    wrap.append(el('button', {
      class: 'btn primary', type: 'button',
      onclick: async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await sendFriendRequest(user.id);
          button.textContent = 'Solicitud enviada';
          button.classList.remove('primary');
          toast('Solicitud enviada', { type: 'success' });
          onChanged?.();
        } catch (err) { button.disabled = false; toast(err.message, { type: 'error' }); }
      },
    }, icon('user-plus', 18), 'Añadir amigo'), msgBtn);
  }
  return wrap;
}

/* -------------------------------- página -------------------------------- */

export function profilePage(username) {
  const root = el('div');
  let cards = [];

  function user() {
    return userByUsername(username) || state.users.find((u) => u.id === username);
  }

  function currentTab() {
    const hash = window.location.hash.replace(/^#/, '');
    const parts = hash.split('?')[0].split('/').filter(Boolean);
    return parts[2] || 'posts';
  }

  function goTab(tab) {
    const target = user();
    window.location.hash = `/u/${target.username}${tab === 'posts' ? '' : `/${tab}`}`;
  }

  function coverElement(target, isMe) {
    const cover = el('div', { class: 'profile-cover' });
    if (target.cover) {
      cover.appendChild(mediaImg(target.cover, { alt: 'Portada' }));
    }
    if (isMe) {
      cover.appendChild(el('button', {
        class: 'cover-edit', type: 'button',
        onclick: async () => {
          const files = await openFilePicker();
          if (!files.length) return;
          const problem = validateImageFile(files[0]);
          if (problem) { toast(problem, { type: 'error' }); return; }
          try {
            toast('Subiendo portada…');
            const record = await uploadImage(files[0], 'covers', { maxSize: 2200 });
            await updateProfile({ cover: record.path });
            toast('Portada actualizada', { type: 'success' });
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, icon('camera', 17), 'Editar portada'));
    }
    return cover;
  }

  function headElement(target, isMe) {
    const friends = friendsOf(target.id);
    const avatarWrap = el('div', { class: 'profile-avatar-wrap' },
      el('div', { class: 'profile-avatar' },
        target.avatar
          ? mediaImg(target.avatar, { alt: displayName(target) })
          : el('span', {
            class: 'center',
            style: {
              width: '100%', height: '100%', fontSize: '56px', color: '#fff', fontWeight: '700',
              background: 'linear-gradient(135deg,#1877f2,#42b0ff)',
            },
            text: (displayName(target) || '?').slice(0, 2).toUpperCase(),
          })),
      isMe
        ? el('button', {
          class: 'profile-avatar-edit', type: 'button', 'aria-label': 'Cambiar foto de perfil',
          onclick: async () => {
            const files = await openFilePicker();
            if (!files.length) return;
            const problem = validateImageFile(files[0]);
            if (problem) { toast(problem, { type: 'error' }); return; }
            try {
              toast('Subiendo foto…');
              const record = await uploadImage(files[0], 'avatars', { maxSize: 720 });
              await updateProfile({ avatar: record.path });
              toast('Foto de perfil actualizada', { type: 'success' });
            } catch (err) { toast(err.message, { type: 'error' }); }
          },
        }, icon('camera', 17))
        : null);

    const titles = el('div', { class: 'profile-titles' },
      el('h1', { class: 'profile-name', text: displayName(target) }),
      target.bio ? el('div', { class: 'muted', style: { marginTop: '4px', maxWidth: '520px' }, text: target.bio }) : null,
      el('div', { class: 'profile-friends' },
        friends.length
          ? el('span', { class: 'avatar-stack' },
            ...friends.slice(0, 3).map((friend) => avatarEl(friend, 'xs')))
          : null,
        el('a', {
          href: `#/u/${target.username}/friends`,
          text: `${formatCount(friendCount(target.id))} amigos`,
        }),
        el('span', { text: '·' }),
        el('span', { text: `${formatCount(postsByAuthor(target.id).length)} publicaciones` })));

    const head = el('div', { class: 'profile-head' },
      el('div', { class: 'profile-main' }, avatarWrap, titles, relationButtons(target, () => {
        // re-render completo
        render();
      })));

    // pestañas
    const tabs = el('div', { class: 'profile-nav' });
    for (const tab of TABS) {
      const label = tab.id === 'friends'
        ? `${tab.label} · ${formatCount(friendCount(target.id))}`
        : tab.label;
      tabs.appendChild(el('button', {
        class: `tab ${currentTab() === tab.id ? 'active' : ''}`, type: 'button',
        text: label, onclick: () => goTab(tab.id),
      }));
    }
    head.appendChild(el('div', { class: 'profile-nav-wrap' }, tabs));
    return head;
  }

  function introCard(target) {
    const items = [];
    if (target.bio) items.push(el('div', { class: 'intro-item' }, icon('info', 18), target.bio));
    if (target.work) items.push(el('div', { class: 'intro-item' }, icon('briefcase', 18), `Trabaja en ${target.work}`));
    if (target.education) items.push(el('div', { class: 'intro-item' }, icon('education', 18), `Estudió en ${target.education}`));
    if (target.location) items.push(el('div', { class: 'intro-item' }, icon('map-pin', 18), `Vive en ${target.location}`));
    if (target.birthday) items.push(el('div', { class: 'intro-item' }, icon('calendar', 18), `Nació el ${longDate(target.birthday)}`));
    if (target.whatsapp) {
      items.push(el('a', {
        class: 'intro-item intro-link',
        href: `https://wa.me/${target.whatsapp}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Escribir por WhatsApp',
      }, icon('whatsapp', 18), `WhatsApp: +${target.whatsapp}`));
    }
    if (target.instagram) {
      items.push(el('a', {
        class: 'intro-item intro-link',
        href: `https://instagram.com/${target.instagram}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Ver Instagram',
      }, icon('instagram', 18), `@${target.instagram}`));
    }
    items.push(el('div', { class: 'intro-item' }, icon('clock', 18), `Se unió en ${monthYear(target.createdAt)}`));

    return el('div', { class: 'card intro-card' },
      el('h3', { class: 'card-title', text: 'Información' }),
      ...items);
  }

  function photosCard(target) {
    const photos = postsByAuthor(target.id)
      .filter((p) => canSeePost(p, state.me?.id))
      .flatMap((p) => (p.media || []).map((m) => m.path))
      .slice(0, 9);
    if (!photos.length) return null;
    return el('div', { class: 'card intro-card' },
      el('div', { class: 'row between' },
        el('h3', { class: 'card-title', text: 'Fotos' }),
        el('button', {
          class: 'link small', type: 'button', text: 'Ver todas',
          onclick: () => goTab('photos'),
        })),
      el('div', { class: 'profile-photos' },
        ...photos.map((path, index) => mediaImg(path, {
          alt: 'Foto', onClick: () => lightbox(photos, index),
        }))));
  }

  function friendsCard(target) {
    const friends = friendsOf(target.id);
    if (!friends.length) return null;
    return el('div', { class: 'card intro-card' },
      el('div', { class: 'row between' },
        el('h3', { class: 'card-title', text: `Amigos · ${formatCount(friends.length)}` }),
        el('button', {
          class: 'link small', type: 'button', text: 'Ver todos',
          onclick: () => goTab('friends'),
        })),
      el('div', { class: 'profile-friend-grid' },
        ...friends.slice(0, 9).map((friend) => el('a', {
          class: 'pf', href: `#/u/${friend.username}`,
        }, avatarEl(friend, 'lg'), el('span', { text: displayName(friend) })))));
  }

  function postsSection(target) {
    const wrap = el('div');
    const isMe = target.id === state.me?.id;
    if (isMe) {
      wrap.appendChild(mountComposer());
    }
    const posts = postsByAuthor(target.id).filter((p) => canSeePost(p, state.me?.id));
    if (!posts.length) {
      wrap.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'photo-library',
          title: isMe ? 'Aún no has publicado nada' : `${displayName(target)} todavía no tiene publicaciones`,
          description: isMe ? 'Comparte tu primera foto o pensamiento con tus amigos.' : '',
          action: isMe
            ? el('button', {
              class: 'btn primary', type: 'button', text: 'Crear publicación',
              onclick: () => openComposer(),
            })
            : null,
        })));
      return wrap;
    }
    cards = [];
    for (const post of posts.slice(0, 12)) {
      const card = postCard(post);
      cards.push({ id: post.id, card });
      wrap.appendChild(card.el);
    }
    return wrap;
  }

  function friendsSection(target) {
    const friends = friendsOf(target.id);
    if (!friends.length) {
      return el('div', { class: 'card' },
        emptyState({
          iconName: 'users',
          title: 'Sin amigos todavía',
          description: 'Cuando añada amigos, aparecerán aquí.',
        }));
    }
    const grid = el('div', { class: 'friend-grid' });
    for (const friend of friends) {
      grid.appendChild(el('a', { class: 'user-tile', href: `#/u/${friend.username}` },
        el('div', { class: 'ut-img' },
          friend.avatar
            ? mediaImg(friend.avatar, { alt: displayName(friend) })
            : el('div', {
              class: 'center',
              style: {
                width: '100%', height: '100%', fontSize: '34px', color: '#fff', fontWeight: '700',
                background: 'linear-gradient(135deg,#1877f2,#42b0ff)',
              },
              text: (displayName(friend) || '?').slice(0, 2).toUpperCase(),
            })),
        el('div', { class: 'ut-body' },
          el('span', { class: 'ut-name', text: displayName(friend) }),
          el('span', { class: 'ut-sub', text: `@${friend.username}` }))));
    }
    return el('div', { class: 'card pad' },
      el('h3', { class: 'card-title', text: `Amigos · ${formatCount(friends.length)}` }),
      grid);
  }

  function photosSection(target) {
    const photos = postsByAuthor(target.id)
      .filter((p) => canSeePost(p, state.me?.id))
      .flatMap((p) => (p.media || []).map((m) => ({ path: m.path, postId: p.id })));
    if (!photos.length) {
      return el('div', { class: 'card' },
        emptyState({
          iconName: 'photo-library',
          title: 'Sin fotos',
          description: 'Las fotos que publique aparecerán aquí.',
        }));
    }
    const grid = el('div', {
      style: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '4px', padding: '4px',
      },
    });
    const paths = photos.map((p) => p.path);
    photos.forEach((photo, index) => {
      grid.appendChild(mediaImg(photo.path, {
        alt: 'Foto', onClick: () => lightbox(paths, index),
        style: { width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'zoom-in' },
      }));
    });
    return el('div', { class: 'card' }, grid);
  }

  function aboutSection(target) {
    const rows = [
      ['Nombre', displayName(target)],
      ['Usuario', `@${target.username}`],
      ['Biografía', target.bio || '—'],
      ['Trabajo', target.work || '—'],
      ['Estudios', target.education || '—'],
      ['Ciudad', target.location || '—'],
      ['Nacimiento', target.birthday ? longDate(target.birthday) : '—'],
      ['WhatsApp', target.whatsapp ? `+${target.whatsapp}` : '—'],
      ['Instagram', target.instagram ? `@${target.instagram}` : '—'],
      ['Miembro desde', monthYear(target.createdAt)],
      ['Amigos', formatCount(friendCount(target.id))],
    ];
    return el('div', { class: 'card pad' },
      el('h3', { class: 'card-title', text: 'Información' }),
      ...rows.map(([label, value]) => el('div', {
        class: 'row gap-12', style: { padding: '10px 0', borderBottom: '1px solid var(--line-soft)' },
      },
      el('span', { class: 'muted', style: { minWidth: '140px' }, text: label }),
      el('span', { text: value }))));
  }

  function render() {
    clear(root);
    cards.forEach(({ card }) => card.destroy?.());
    cards = [];
    const target = user();
    if (!target) {
      root.appendChild(el('div', { class: 'card' },
        emptyState({
          iconName: 'user-x',
          title: 'Perfil no encontrado',
          description: `No existe ninguna cuenta con @${username}.`,
          action: el('a', { class: 'btn soft', href: '#/feed', text: 'Volver al inicio' }),
        })));
      return;
    }
    const isMe = target.id === state.me?.id;
    const tab = currentTab();
    root.append(coverElement(target, isMe), headElement(target, isMe));

    if (tab === 'friends') {
      root.appendChild(friendsSection(target));
      return;
    }
    if (tab === 'photos') {
      root.appendChild(photosSection(target));
      return;
    }
    if (tab === 'about') {
      root.appendChild(aboutSection(target));
      return;
    }

    const grid = el('div', { class: 'profile-grid' },
      postsSection(target),
      el('div', { class: 'profile-side' },
        introCard(target),
        photosCard(target),
        friendsCard(target)));
    root.appendChild(grid);
  }

  render();
  return {
    el: root,
    onData() {
      const target = user();
      if (!target) return;
      // refresca las tarjetas sin perder el foco de los comentarios
      cards.forEach(({ card }) => card.update?.());
      const headEl = root.querySelector('.profile-head');
      const fresh = headElement(target, target.id === state.me?.id);
      if (headEl) headEl.replaceWith(fresh);
      else render();
    },
    destroy() {
      cards.forEach(({ card }) => card.destroy?.());
    },
  };
}
