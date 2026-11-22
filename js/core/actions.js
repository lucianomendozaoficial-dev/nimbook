/* ==========================================================================
   actions.js — todas las escrituras (con cola, agrupadas y con reintentos)
   ========================================================================== */
import { queueDoc, writeNow, deleteDoc, newId, nowISO, forget } from './net.js';
import { P } from './paths.js';
import {
  state, notify, loadUserIndex, loadUser, loadPost, loadComments,
  isFollowing, followingIdsOf, threadIdFor, countUnreadMessages, loadShopItem,
} from './store.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { ValidationError } from './auth.js';

function requireMe() {
  if (!state.me) throw new ValidationError('Primero tenés que iniciar sesión.');
  return state.me;
}

const norm = (value) => String(value || '').trim().replace(/\s+/g, ' ');

async function notifySoon(userId, payload) {
  if (!userId || userId === state.me?.id) return;
  // Solo avisamos de personas que la otra persona sigue (las de "nuevo
  // seguidor" siempre llegan, para que sepa quién lo empezó a seguir; los
  // mensajes privados también, porque son para esa persona).
  if (payload.type !== 'follow' && payload.type !== 'message') {
    try {
      const following = await followingIdsOf(userId);
      if (!following.includes(state.me.id)) return;
    } catch {
      return;
    }
  }
  queueDoc(P.notifications(userId), (doc) => {
    const data = doc || { version: 1, items: [] };
    data.items = [
      { id: newId('n'), ...payload, createdAt: nowISO(), read: false },
      ...(data.items || []).filter((item) =>
        !(item.actorId === payload.actorId && item.type === payload.type && item.postId === payload.postId)),
    ].slice(0, 50);
    return data;
  }, { delay: 1200, message: 'Zuma: notificación' }).catch(() => {});
}

/* --------------------------------- cuenta -------------------------------- */

/** ¿Se puede usar este nombre de usuario? (para avisar mientras escribe). */
export async function isUsernameAvailable(username) {
  const handle = String(username || '').trim().toLowerCase();
  if (handle.length < 3) return { ok: false, reason: 'short' };
  if (!/^[a-z0-9._]{3,30}$/.test(handle)) return { ok: false, reason: 'format' };
  try {
    const index = await loadUserIndex();
    return { ok: !index.some((user) => user.username?.toLowerCase() === handle), reason: 'taken' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function register({ firstName, lastName, username, password }) {
  const first = norm(firstName);
  const last = norm(lastName);
  const handle = String(username || '').trim().toLowerCase();

  if (first.length < 2) throw new ValidationError('Escribí tu nombre.');
  if (last.length < 2) throw new ValidationError('Escribí tu apellido.');
  if (!/^[a-z0-9._]{3,30}$/.test(handle)) {
    throw new ValidationError('El usuario debe tener 3 a 30 letras, números, puntos o guiones bajos.');
  }
  if (String(password || '').length < 6) {
    throw new ValidationError('La contraseña debe tener al menos 6 caracteres.');
  }

  const index = await loadUserIndex({ fresh: true });
  if (index.some((user) => user.username?.toLowerCase() === handle)) {
    throw new ValidationError('Ese usuario ya está en uso. Probá con otro.');
  }

  const record = await hashPassword(password);
  const id = newId('u');
  const user = {
    id,
    username: handle,
    firstName: first,
    lastName: last,
    name: `${first} ${last}`.trim(),
    avatar: null,
    cover: null,
    bio: '',
    whatsapp: '',
    instagram: '',
    birthday: '',
    location: '',
    work: '',
    education: '',
    password: record,
    saved: [],
    createdAt: nowISO(),
  };

  const entry = {
    id,
    username: handle,
    firstName: first,
    lastName: last,
    name: user.name,
    avatar: null,
    createdAt: user.createdAt,
  };

  await writeNow(P.user(id), () => ({ version: 1, user }), { message: 'Zuma: nueva cuenta' });
  await queueDoc(P.userIndex, (doc) => {
    const data = doc || { version: 1, users: [] };
    const taken = (data.users || []).some(
      (item) => item.username?.toLowerCase() === handle && item.id !== id,
    );
    if (taken) return { ...data, __clash: true };
    data.users = [entry, ...(data.users || []).filter((item) => item.id !== id)].slice(0, 5000);
    return data;
  }, { delay: 0, message: 'Zuma: nueva cuenta' });

  // control final: otro pudo registrarse con el mismo usuario en el medio
  const verified = await loadUserIndex({ fresh: true });
  const clash = verified.find((item) => item.username?.toLowerCase() === handle && item.id !== id);
  if (clash) {
    await deleteDoc(P.user(id), 'Zuma: usuario duplicado').catch(() => {});
    throw new ValidationError('Ese usuario se acaba de ocupar. Probá con otro.');
  }

  // bienvenida en la bandeja
  await queueDoc(P.notifications(id), () => ({
    version: 1,
    items: [{
      id: newId('n'),
      type: 'welcome',
      createdAt: nowISO(),
      read: false,
      text: '¡Bienvenido a Zuma! Completá tu perfil, seguí a tus amigos y publicá tu primer momento.',
    }],
  }), { delay: 0, message: 'Zuma: bienvenida' }).catch(() => {});

  state.users.set(id, user);
  state.userIndex = [entry, ...state.userIndex.filter((item) => item.id !== id)];
  state.me = user;
  return user;
}

export async function login(username, password) {
  const handle = String(username || '').trim().toLowerCase();
  if (!handle || !password) throw new ValidationError('Completá usuario y contraseña.');

  const index = await loadUserIndex({ fresh: true });
  const entry = index.find((user) => user.username?.toLowerCase() === handle);
  if (!entry) throw new ValidationError('Usuario o contraseña incorrectos.');

  const user = await loadUser(entry.id);
  if (!user?.password) throw new ValidationError('Usuario o contraseña incorrectos.');
  const ok = await verifyPassword(password, user.password);
  if (!ok) throw new ValidationError('Usuario o contraseña incorrectos.');
  return user;
}

export async function updateProfile(patch = {}) {
  const me = requireMe();
  const changes = {};
  if ('name' in patch || 'firstName' in patch || 'lastName' in patch) {
    const first = norm(patch.firstName ?? me.firstName);
    const last = norm(patch.lastName ?? me.lastName);
    if (first.length < 2 || last.length < 2) throw new ValidationError('Nombre y apellido son obligatorios.');
    changes.firstName = first;
    changes.lastName = last;
    changes.name = `${first} ${last}`.trim();
  }
  if ('username' in patch) {
    const handle = String(patch.username || '').trim().toLowerCase();
    if (handle !== me.username) {
      if (!/^[a-z0-9._]{3,30}$/.test(handle)) {
        throw new ValidationError('El usuario debe tener 3 a 30 letras, números, puntos o guiones bajos.');
      }
      const index = await loadUserIndex({ fresh: true });
      if (index.some((user) => user.username?.toLowerCase() === handle && user.id !== me.id)) {
        throw new ValidationError('Ese usuario ya está en uso.');
      }
      changes.username = handle;
    }
  }
  for (const key of ['bio', 'whatsapp', 'instagram', 'birthday', 'maritalStatus', 'location', 'work', 'education', 'avatar', 'cover']) {
    if (key in patch) changes[key] = typeof patch[key] === 'string' ? patch[key].trim() : patch[key];
  }

  const next = { ...me, ...changes };
  state.me = next;
  state.users.set(me.id, next);

  await writeNow(P.user(me.id), () => ({ version: 1, user: next }), {
    message: 'Zuma: perfil actualizado',
  });

  if (changes.name || changes.username || 'avatar' in changes) {
    await queueDoc(P.userIndex, (doc) => {
      const data = doc || { version: 1, users: [] };
      data.users = (data.users || []).map((user) => (user.id === me.id
        ? {
          ...user,
          username: next.username,
          name: next.name,
          firstName: next.firstName,
          lastName: next.lastName,
          avatar: next.avatar,
        }
        : user));
      return data;
    }, { delay: 0, message: 'Zuma: perfil actualizado' });
  }

  notify('me');
  return next;
}

export async function changePassword(current, next) {
  const me = requireMe();
  if (String(next || '').length < 6) throw new ValidationError('La nueva contraseña es muy corta.');
  const ok = await verifyPassword(current, me.password);
  if (!ok) throw new ValidationError('La contraseña actual no es correcta.');
  const record = await hashPassword(next);
  const updated = { ...me, password: record };
  state.me = updated;
  state.users.set(me.id, updated);
  await writeNow(P.user(me.id), () => ({ version: 1, user: updated }), {
    message: 'Zuma: contraseña actualizada',
  });
  notify('me');
}

/* ----------------------------- publicaciones ----------------------------- */

export async function createPost({
  text = '', media = [], privacy = 'public', feeling = null, location = null,
  shareOf = null, groupId = null,
} = {}) {
  const me = requireMe();
  const clean = String(text || '').trim();
  if (!clean && !media.length && !shareOf) throw new ValidationError('Escribí algo o agregá una foto.');
  if (groupId) {
    const group = state.groups.find((item) => item.id === groupId);
    if (group && (group.type || 'group') === 'channel' && group.ownerId !== me.id) {
      throw new ValidationError('Solo quien creó el canal puede publicar en él.');
    }
  }

  const post = {
    id: newId('p'),
    authorId: me.id,
    text: clean,
    media: media.slice(0, 10),
    privacy: groupId ? 'public' : privacy,
    feeling: feeling || null,
    location: location || null,
    shareOf: shareOf || null,
    groupId: groupId || null,
    createdAt: nowISO(),
    reactions: {},
    commentsCount: 0,
  };

  await queueDoc(P.post(post.id), () => ({ version: 1, post }), {
    delay: 0, message: 'Zuma: nueva publicación',
  });

  const entry = { id: post.id, authorId: me.id, createdAt: post.createdAt };
  await queueDoc(P.feedIndex, (doc) => {
    const data = doc || { version: 1, posts: [] };
    data.posts = [entry, ...(data.posts || []).filter((item) => item.id !== entry.id)].slice(0, 200);
    return data;
  }, { delay: 0, message: 'Zuma: actualizar inicio' });

  state.posts.set(post.id, post);
  state.feedIndex = [entry, ...state.feedIndex.filter((item) => item.id !== entry.id)].slice(0, 200);
  notify('feed');
  return post;
}

export async function deletePost(postId) {
  const me = requireMe();
  const post = state.posts.get(postId) || await loadPost(postId);
  if (post && post.authorId !== me.id) throw new ValidationError('Esa publicación no es tuya.');

  await queueDoc(P.feedIndex, (doc) => {
    if (!doc?.posts) return undefined;
    return { ...doc, posts: doc.posts.filter((item) => item.id !== postId) };
  }, { delay: 0, message: 'Zuma: borrar publicación' });

  state.feedIndex = state.feedIndex.filter((item) => item.id !== postId);
  state.posts.delete(postId);
  forget(P.post(postId));
  await deleteDoc(P.post(postId), 'Zuma: borrar publicación').catch(() => {});
  notify('feed');
}

export async function updatePost(postId, patch = {}) {
  const me = requireMe();
  const post = state.posts.get(postId) || await loadPost(postId);
  if (!post || post.authorId !== me.id) throw new ValidationError('Esa publicación no es tuya.');
  const next = { ...post, ...patch, updatedAt: nowISO() };
  state.posts.set(postId, next);
  await queueDoc(P.post(postId), () => ({ version: 1, post: next }), {
    delay: 300, message: 'Zuma: editar publicación',
  });
  notify('post', { id: postId });
  return next;
}

export async function setReaction(postId, type) {
  const me = requireMe();
  const post = state.posts.get(postId) || await loadPost(postId);
  const previous = state.likes[postId] || null;
  if (previous === type) return;

  if (type) state.likes[postId] = type;
  else delete state.likes[postId];

  const snapshot = { ...state.likes };
  await queueDoc(P.likes(me.id), () => ({ version: 1, likes: snapshot }), {
    delay: 1500, message: 'Zuma: reacciones',
  });

  if (post) {
    const reactions = { ...(post.reactions || {}) };
    if (previous) reactions[previous] = Math.max(0, (reactions[previous] || 0) - 1);
    if (type) reactions[type] = (reactions[type] || 0) + 1;
    state.posts.set(postId, { ...post, reactions });

    queueDoc(P.post(postId), (doc) => {
      if (!doc?.post) return undefined;
      return { ...doc, post: { ...doc.post, reactions } };
    }, { delay: 1500, message: 'Zuma: reacciones' }).catch(() => {});

    if (type && post.authorId !== me.id) {
      notifySoon(post.authorId, { type: 'reaction', actorId: me.id, postId, reaction: type });
    }
  }
  notify('post', { id: postId });
}

export async function toggleSavePost(postId) {
  const me = requireMe();
  const saved = new Set(me.saved || []);
  const nowSaved = !saved.has(postId);
  if (nowSaved) saved.add(postId); else saved.delete(postId);
  const updated = { ...me, saved: [...saved] };
  state.me = updated;
  state.users.set(me.id, updated);
  await queueDoc(P.user(me.id), () => ({ version: 1, user: updated }), {
    delay: 800, message: 'Zuma: guardados',
  });
  notify('me');
  return nowSaved;
}

/* ------------------------------- comentarios ----------------------------- */

export async function addComment(postId, text, { parentId = null, media = [] } = {}) {
  const me = requireMe();
  const clean = String(text || '').trim();
  if (!clean && !media.length) throw new ValidationError('Escribí un comentario.');

  const comment = {
    id: newId('c'),
    postId,
    authorId: me.id,
    parentId: parentId || null,
    text: clean,
    media: media.slice(0, 4),
    createdAt: nowISO(),
    likes: 0,
  };

  await queueDoc(P.comment(postId, comment.id), () => ({ version: 1, comment }), {
    delay: 0, message: 'Zuma: comentario',
  });
  await queueDoc(P.commentsIndex(postId), (doc) => {
    const data = doc || { version: 1, comments: [] };
    data.comments = [
      { id: comment.id, authorId: me.id, parentId: comment.parentId, createdAt: comment.createdAt },
      ...(data.comments || []).filter((item) => item.id !== comment.id),
    ];
    return data;
  }, { delay: 0, message: 'Zuma: comentario' });

  const entry = state.comments.get(postId);
  if (entry) {
    entry.items.set(comment.id, comment);
    entry.index = [
      { id: comment.id, authorId: me.id, parentId: comment.parentId, createdAt: comment.createdAt },
      ...entry.index,
    ];
  }

  const post = state.posts.get(postId);
  if (post) {
    state.posts.set(postId, { ...post, commentsCount: (post.commentsCount || 0) + 1 });
    queueDoc(P.post(postId), (doc) => {
      if (!doc?.post) return undefined;
      return { ...doc, post: { ...doc.post, commentsCount: (doc.post.commentsCount || 0) + 1 } };
    }, { delay: 1500, message: 'Zuma: comentario' }).catch(() => {});
    if (post.authorId !== me.id) {
      notifySoon(post.authorId, { type: parentId ? 'reply' : 'comment', actorId: me.id, postId });
    }
  }

  notify('comments', { postId });
  return comment;
}

export async function deleteComment(commentId, postId) {
  const me = requireMe();
  const entry = state.comments.get(postId);
  const comment = entry?.items.get(commentId);
  if (comment && comment.authorId !== me.id) throw new ValidationError('Ese comentario no es tuyo.');

  await queueDoc(P.commentsIndex(postId), (doc) => {
    if (!doc?.comments) return undefined;
    return { ...doc, comments: doc.comments.filter((item) => item.id !== commentId) };
  }, { delay: 0, message: 'Zuma: borrar comentario' });

  if (entry) {
    entry.items.delete(commentId);
    entry.index = entry.index.filter((item) => item.id !== commentId);
  }
  await deleteDoc(P.comment(postId, commentId), 'Zuma: borrar comentario').catch(() => {});
  notify('comments', { postId });
}

/* -------------------------------- seguir --------------------------------- */

export async function followUser(userId) {
  const me = requireMe();
  if (!userId || userId === me.id || state.following.has(userId)) return;

  state.following.add(userId);
  const mine = [...state.following];

  await queueDoc(P.following(me.id), () => ({ version: 1, following: mine }), {
    delay: 1200, message: 'Zuma: seguidos',
  });

  await queueDoc(P.followers(userId), (doc) => {
    const data = doc || { version: 1, followers: [] };
    data.followers = [me.id, ...(data.followers || []).filter((id) => id !== me.id)];
    return data;
  }, { delay: 1200, message: 'Zuma: seguidores' }).catch(() => {});

  notifySoon(userId, { type: 'follow', actorId: me.id });
  notify('follow');
}

export async function unfollowUser(userId) {
  const me = requireMe();
  if (!userId || !state.following.has(userId)) return;

  state.following.delete(userId);
  const mine = [...state.following];

  await queueDoc(P.following(me.id), () => ({ version: 1, following: mine }), {
    delay: 1200, message: 'Zuma: seguidos',
  });
  await queueDoc(P.followers(userId), (doc) => {
    if (!doc) return undefined;
    return { ...doc, followers: (doc.followers || []).filter((id) => id !== me.id) };
  }, { delay: 1200, message: 'Zuma: seguidores' }).catch(() => {});

  notify('follow');
}

export async function toggleFollow(userId) {
  if (isFollowing(state.me?.id, userId)) {
    await unfollowUser(userId);
    return false;
  }
  await followUser(userId);
  return true;
}

/* ------------------------------ notificaciones --------------------------- */

export async function markAllNotificationsRead() {
  const me = requireMe();
  if (!state.notifications.some((item) => !item.read)) return;
  state.notifications = state.notifications.map((item) => ({ ...item, read: true }));
  state.ui.unreadNotifs = 0;
  const items = state.notifications;
  await queueDoc(P.notifications(me.id), () => ({ version: 1, items }), {
    delay: 300, message: 'Zuma: notificaciones leídas',
  });
  notify('notifications');
}

/* --------------------------------- grupos -------------------------------- */

export async function createGroup({ name, description = '', privacy = 'public', cover = null, type = 'group' } = {}) {
  const me = requireMe();
  const clean = norm(name);
  if (clean.length < 3) throw new ValidationError('El grupo necesita un nombre.');
  const group = {
    id: newId('g'),
    type: type === 'channel' ? 'channel' : 'group',
    name: clean,
    description: norm(description),
    privacy,
    cover,
    ownerId: me.id,
    memberIds: [me.id],
    createdAt: nowISO(),
  };
  state.groups = [group, ...state.groups];
  await queueDoc(P.groups, (doc) => {
    const data = doc || { version: 1, groups: [] };
    data.groups = [group, ...(data.groups || []).filter((item) => item.id !== group.id)];
    return data;
  }, { delay: 0, message: 'Zuma: nuevo grupo' });
  notify('groups');
  return group;
}

export async function joinGroup(groupId) {
  const me = requireMe();
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || group.memberIds?.includes(me.id)) return;
  const memberIds = [...(group.memberIds || []), me.id];
  state.groups = state.groups.map((item) => (item.id === groupId ? { ...item, memberIds } : item));
  await queueDoc(P.groups, (doc) => {
    if (!doc?.groups) return undefined;
    return { ...doc, groups: doc.groups.map((item) => (item.id === groupId ? { ...item, memberIds } : item)) };
  }, { delay: 800, message: 'Zuma: unirse al grupo' });
  notify('groups');
}

export async function leaveGroup(groupId) {
  const me = requireMe();
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;
  const memberIds = (group.memberIds || []).filter((id) => id !== me.id);
  state.groups = state.groups.map((item) => (item.id === groupId ? { ...item, memberIds } : item));
  await queueDoc(P.groups, (doc) => {
    if (!doc?.groups) return undefined;
    return { ...doc, groups: doc.groups.map((item) => (item.id === groupId ? { ...item, memberIds } : item)) };
  }, { delay: 800, message: 'Zuma: salir del grupo' });
  notify('groups');
}

/* -------------------------------- historias ------------------------------ */

export async function createStory({ image, text = '' } = {}) {
  const me = requireMe();
  if (!image) throw new ValidationError('Elegí una foto para tu historia.');
  const story = {
    id: newId('s'),
    userId: me.id,
    image,
    text: norm(text),
    createdAt: nowISO(),
  };
  state.stories = [story, ...state.stories];
  await queueDoc(P.stories, (doc) => {
    const data = doc || { version: 1, stories: [] };
    const alive = (data.stories || []).filter((item) =>
      Date.now() - new Date(item.createdAt).getTime() < 24 * 3600 * 1000);
    data.stories = [story, ...alive].slice(0, 300);
    return data;
  }, { delay: 400, message: 'Zuma: nueva historia' });
  notify('stories');
  return story;
}

export async function deleteStory(storyId) {
  const me = requireMe();
  state.stories = state.stories.filter((story) => story.id !== storyId);
  await queueDoc(P.stories, (doc) => {
    const data = doc || { version: 1, stories: [] };
    data.stories = (data.stories || []).filter((item) => item.id !== storyId || item.userId !== me.id);
    return data;
  }, { delay: 0, message: 'Zuma: borrar historia' });
  notify('stories');
}

/* ---------------------------------- shop --------------------------------- */

const shopEntry = (item) => ({
  id: item.id,
  sellerId: item.sellerId,
  title: item.title,
  price: item.price,
  currency: item.currency,
  category: item.category,
  condition: item.condition,
  location: item.location,
  cover: item.media?.[0]?.path || null,
  status: item.status || 'available',
  createdAt: item.createdAt,
});

/** Valida y normaliza el contacto de una venta (WhatsApp o Instagram). */
function normalizeContact(contact) {
  if (!contact || !contact.type) return null;
  const type = contact.type === 'instagram' ? 'instagram' : contact.type === 'whatsapp' ? 'whatsapp' : null;
  if (!type) throw new ValidationError('Elegí WhatsApp o Instagram para el contacto.');
  const raw = String(contact.value || '').trim();

  if (type === 'whatsapp') {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length < 8 || digits.length > 15) {
      throw new ValidationError('Escribí el WhatsApp con código de país (ej. 54 9 11 5555 1234).');
    }
    return { type, value: digits };
  }

  const handle = raw
    .replace(/^@+/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9._]{2,30}$/.test(handle)) {
    throw new ValidationError('Escribí un usuario de Instagram válido (sin espacios).');
  }
  return { type, value: handle };
}

function validateListing({ title, price }) {
  const cleanTitle = norm(title);
  if (cleanTitle.length < 4) throw new ValidationError('Poné un título de al menos 4 letras.');
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount < 0) throw new ValidationError('Poné un precio válido.');
  if (amount > 99_999_999) throw new ValidationError('Ese precio es demasiado alto.');
  return { title: cleanTitle.slice(0, 90), price: Math.round(amount) };
}

export async function createListing({
  title = '', description = '', price = 0, currency = 'ARS', category = 'otros',
  condition = 'usado', location = '', media = [], contact = null,
} = {}) {
  const me = requireMe();
  const checked = validateListing({ title, price });
  const item = {
    id: newId('l'),
    sellerId: me.id,
    title: checked.title,
    description: String(description || '').trim().slice(0, 1500),
    price: checked.price,
    currency: String(currency).toUpperCase() === 'USD' ? 'USD' : 'ARS',
    category: String(category || 'otros'),
    condition: String(condition || 'usado'),
    location: norm(location).slice(0, 60),
    media: (media || []).slice(0, 8),
    contact: normalizeContact(contact),
    status: 'available',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  await queueDoc(P.shopItem(item.id), () => ({ version: 1, item }), {
    delay: 0, message: 'Zuma: nuevo producto',
  });

  const entry = shopEntry(item);
  await queueDoc(P.shopIndex, (doc) => {
    const data = doc && Array.isArray(doc.items) ? doc : { version: 1, items: [] };
    data.items = [entry, ...data.items.filter((row) => row.id !== entry.id)].slice(0, 500);
    return data;
  }, { delay: 0, message: 'Zuma: tienda' });

  state.shopItems.set(item.id, item);
  state.shopIndex = [entry, ...state.shopIndex.filter((row) => row.id !== item.id)].slice(0, 500);
  notify('shop');
  return item;
}

export async function updateListing(id, patch = {}) {
  const me = requireMe();
  let current = state.shopItems.get(id);
  if (!current) {
    const light = state.shopIndex.find((row) => row.id === id);
    current = (await loadShopItem(id)) || (light ? { ...light } : null);
  }
  if (!current) throw new ValidationError('No encontramos ese producto.');
  if (current.sellerId !== me.id) throw new ValidationError('Ese producto no es tuyo.');

  const next = { ...current, ...patch, id, sellerId: me.id, updatedAt: nowISO() };
  if ('title' in patch || 'price' in patch) {
    const checked = validateListing({ title: next.title, price: next.price });
    next.title = checked.title;
    next.price = checked.price;
  }
  if ('media' in patch) next.media = (patch.media || []).slice(0, 8);
  if ('contact' in patch) next.contact = normalizeContact(patch.contact);
  if ('status' in patch) next.status = patch.status === 'sold' ? 'sold' : 'available';

  state.shopItems.set(id, next);

  await queueDoc(P.shopItem(id), () => ({ version: 1, item: next }), {
    delay: 300, message: 'Zuma: editar producto',
  });

  const entry = shopEntry(next);
  state.shopIndex = state.shopIndex.map((row) => (row.id === id ? { ...row, ...entry } : row));
  await queueDoc(P.shopIndex, (doc) => {
    if (!doc?.items) return undefined;
    return {
      ...doc,
      items: doc.items.map((row) => (row.id === id ? { ...row, ...entry } : row)),
    };
  }, { delay: 400, message: 'Zuma: tienda' }).catch(() => {});

  notify('shop');
  return next;
}

export async function setListingStatus(id, status) {
  return updateListing(id, { status: status === 'sold' ? 'sold' : 'available' });
}

export async function deleteListing(id) {
  const me = requireMe();
  const item = state.shopItems.get(id) || state.shopIndex.find((row) => row.id === id);
  if (!item) return;
  if (item.sellerId !== me.id) throw new ValidationError('Ese producto no es tuyo.');

  state.shopIndex = state.shopIndex.filter((row) => row.id !== id);
  state.shopItems.delete(id);
  forget(P.shopItem(id));

  await queueDoc(P.shopIndex, (doc) => {
    if (!doc?.items) return undefined;
    return { ...doc, items: doc.items.filter((row) => row.id !== id) };
  }, { delay: 0, message: 'Zuma: borrar producto' });
  await deleteDoc(P.shopItem(id), 'Zuma: borrar producto').catch(() => {});
  notify('shop');
}

/* ------------------------------- mensajes -------------------------------- */

function withInboxEntry(doc, entry, mode = 'mine') {
  const data = doc && Array.isArray(doc.threads) ? doc : { version: 1, threads: [] };
  const previous = data.threads.find((row) => row.threadId === entry.threadId);
  const unread = mode === 'inbox'
    ? (Number(previous?.unread) || 0) + 1
    : 0;
  const next = { ...entry, unread };
  data.threads = [next, ...data.threads.filter((row) => row.threadId !== entry.threadId)].slice(0, 100);
  return data;
}

/** Envía un mensaje privado. Las dos personas leen el mismo archivo de hilo. */
export async function sendMessage(toUserId, text, { silent = false } = {}) {
  const me = requireMe();
  const other = state.users.get(toUserId) || await loadUser(toUserId);
  if (!other) throw new ValidationError('No encontramos a esa persona.');
  const clean = String(text || '').trim();
  if (!clean) throw new ValidationError('Escribí un mensaje.');
  if (clean.length > 4000) throw new ValidationError('El mensaje es demasiado largo.');

  const threadId = threadIdFor(me.id, toUserId);
  const message = {
    id: newId('m'),
    fromId: me.id,
    text: clean,
    createdAt: nowISO(),
    pending: true,
  };
  const stamp = message.createdAt;
  // Al archivo se guarda sin las marcas locales (pending/localOnly).
  const persisted = { id: message.id, fromId: me.id, text: clean, createdAt: stamp };
  const inboxEntry = {
    threadId,
    withId: toUserId,
    lastText: clean.slice(0, 140),
    lastAt: stamp,
    lastFromId: me.id,
  };

  // 1) se muestra al instante (después la red confirma en segundo plano)
  const beforeThread = state.threads.get(threadId);
  const beforeInboxEntry = state.inbox.find((row) => row.threadId === threadId) || null;
  if (beforeThread) beforeThread.messages = [...beforeThread.messages, message].slice(-400);
  else state.threads.set(threadId, { threadId, messages: [message], loaded: true, at: Date.now() });
  state.inbox = [
    { ...inboxEntry, unread: 0 },
    ...state.inbox.filter((row) => row.threadId !== threadId),
  ];
  state.ui.unreadMessages = countUnreadMessages(state.inbox);
  notify('messages');

  try {
    // 2) el hilo es la fuente de verdad: si esto falla, se revierte
    await queueDoc(P.thread(threadId), (doc) => {
      const data = doc?.thread ? doc : {
        version: 1,
        thread: { id: threadId, memberIds: [me.id, toUserId], messages: [] },
      };
      data.thread.messages = [...(data.thread.messages || []), persisted].slice(-400);
      data.thread.updatedAt = stamp;
      return data;
    }, { delay: 200, message: 'Zuma: mensaje' });

    // Ya está guardado: deja de estar "enviando", pero se conserva en memoria
    // hasta que el link público lo devuelva (evita que un sondeo viejo lo borre).
    const stored = state.threads.get(threadId)?.messages?.find((row) => row.id === message.id);
    if (stored) {
      stored.pending = false;
      stored.localOnly = true;
    }
    notify('messages');

    // 3) bandejas: la mía queda sin pendientes, la de la otra persona suma uno
    await Promise.all([
      queueDoc(P.inbox(me.id), (doc) => withInboxEntry(doc, inboxEntry, 'mine'), {
        delay: 400, message: 'Zuma: mensajes',
      }).catch(() => {}),
      queueDoc(P.inbox(toUserId), (doc) => withInboxEntry(doc, inboxEntry, 'inbox'), {
        delay: 400, message: 'Zuma: mensajes',
      }).catch(() => {}),
    ]);

    if (!silent) notifySoon(toUserId, { type: 'message', actorId: me.id });
    notify('messages');
    return message;
  } catch (err) {
    // se deshace el mensaje optimista para no mostrar algo que no se guardó
    const current = state.threads.get(threadId);
    if (current) {
      current.messages = current.messages.filter((row) => row.id !== message.id);
      if (!current.messages.length && !beforeThread) state.threads.delete(threadId);
    }
    state.inbox = state.inbox.filter((row) => row.threadId !== threadId);
    if (beforeInboxEntry) state.inbox = [beforeInboxEntry, ...state.inbox];
    state.ui.unreadMessages = countUnreadMessages(state.inbox);
    notify('messages');
    throw err;
  }
}

/** Marca como leída la conversación con alguien (mi bandeja). */
export async function markThreadRead(otherUserId) {
  const me = state.me;
  if (!me || !otherUserId) return;
  const threadId = threadIdFor(me.id, otherUserId);
  const entry = state.inbox.find((row) => row.threadId === threadId);
  if (!entry || (!entry.unread && entry.readLocally)) return;

  state.inbox = state.inbox.map((row) => (
    row.threadId === threadId ? { ...row, unread: 0, readLocally: true } : row
  ));
  state.ui.unreadMessages = countUnreadMessages(state.inbox);

  await queueDoc(P.inbox(me.id), (doc) => {
    if (!doc?.threads) return undefined;
    return {
      ...doc,
      threads: doc.threads.map((row) => (row.threadId === threadId ? { ...row, unread: 0 } : row)),
    };
  }, { delay: 600, message: 'Zuma: mensajes leídos' }).catch(() => {});

  notify('messages');
}

export async function loadMoreComments(postId) {
  return loadComments(postId, { force: true });
}
