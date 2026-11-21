/* ==========================================================================
   actions.js — todas las operaciones de escritura sobre el repositorio
   ========================================================================== */
import { ensureDoc, SKIP } from './db.js';
import {
  state, PATHS, notifPath, chatPath, syncFromDb, notify,
  userById, conversationFor, isFollowing,
} from './store.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { ValidationError } from './auth.js';
import { uid, nowISO } from './util.js';
import { deleteMedia } from './media.js';

const EMPTY = (key) => () => ({ version: 1, [key]: [] });

function requireMe() {
  if (!state.me) throw new Error('Necesitas iniciar sesión.');
  if (!state.db) throw new Error('No pudimos guardar los cambios. Revisa tu conexión.');
  return state.me;
}

/* ---------------------------- notificaciones ----------------------------- */

export async function pushNotification(userId, entry) {
  if (!userId || !state.db) return;
  if (userId === state.me?.id) return;
  const at = entry.at || nowISO();
  try {
    await state.db.mutate(notifPath(userId), (doc) => {
      ensureDoc(doc, 'items');
      const dup = doc.items.some((n) =>
        !n.read && n.type === entry.type && n.actorId === entry.actorId
        && (n.postId || '') === (entry.postId || '')
        && Date.now() - Date.parse(n.at || 0) < 3_600_000);
      if (dup) return doc;
      doc.items.unshift({ id: uid('n_'), read: false, at, ...entry });
      doc.items = doc.items.slice(0, 150);
      return doc;
    }, { empty: EMPTY('items'), message: 'NimbookGR: notificación' });
  } catch (err) {
    console.warn('[actions] notificación falló', err.message);
  }
}

export async function markAllNotificationsRead() {
  const me = requireMe();
  if (!state.notifications.some((n) => !n.read)) return;
  await state.db.mutate(notifPath(me.id), (doc) => {
    ensureDoc(doc, 'items');
    let changed = false;
    for (const item of doc.items) {
      if (!item.read) { item.read = true; changed = true; }
    }
    return changed ? doc : SKIP;
  }, { empty: EMPTY('items'), message: 'NimbookGR: marcar notificaciones' });
}

export async function clearNotifications() {
  const me = requireMe();
  await state.db.mutate(notifPath(me.id), (doc) => {
    ensureDoc(doc, 'items');
    doc.items = [];
    return doc;
  }, { empty: EMPTY('items'), message: 'NimbookGR: borrar notificaciones' });
}

/* -------------------------------- posts ---------------------------------- */

export async function createPost({
  text = '', media = [], privacy = 'public', groupId = null, shareOf = null,
  feeling = '', location = '',
}) {
  const me = requireMe();
  const clean = String(text || '').trim();
  if (!clean && !media.length) throw new ValidationError('Escribe algo o añade una foto.');
  if (clean.length > 8000) throw new ValidationError('La publicación es demasiado larga.');

  const post = {
    id: uid('p_'),
    authorId: me.id,
    text: clean,
    media: Array.isArray(media) ? media : [],
    privacy: groupId ? 'group' : privacy,
    groupId: groupId || null,
    shareOf: shareOf || null,
    feeling: feeling || '',
    location: location || '',
    reactions: {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  await state.db.mutate(PATHS.posts, (doc) => {
    ensureDoc(doc, 'posts');
    doc.posts.push(post);
    return doc;
  }, { empty: EMPTY('posts'), message: 'NimbookGR: nueva publicación' });

  if (shareOf) {
    const original = state.posts.find((p) => p.id === shareOf);
    if (original) {
      await pushNotification(original.authorId, {
        type: 'share', actorId: me.id, postId: original.id,
      });
    }
  }

  if (groupId) {
    const group = state.groups.find((g) => g.id === groupId);
    for (const memberId of group?.memberIds || []) {
      if (memberId !== me.id) {
        await pushNotification(memberId, {
          type: 'group_post', actorId: me.id, postId: post.id, groupId,
        });
      }
    }
  }

  return post;
}

export async function updatePost(postId, patch) {
  const me = requireMe();
  const post = state.posts.find((p) => p.id === postId);
  if (!post) throw new Error('La publicación ya no existe.');
  if (post.authorId !== me.id) throw new Error('Solo puedes editar tus publicaciones.');

  await state.db.mutate(PATHS.posts, (doc) => {
    const target = doc.posts?.find((p) => p.id === postId);
    if (!target) return SKIP;
    Object.assign(target, patch, { updatedAt: nowISO() });
    return doc;
  }, { empty: EMPTY('posts'), message: 'NimbookGR: editar publicación' });
}

export async function deletePost(postId) {
  const me = requireMe();
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  if (post.authorId !== me.id) throw new Error('Solo puedes borrar tus publicaciones.');

  const mediaPaths = (post.media || []).map((m) => m.path).filter(Boolean);

  await state.db.mutate(PATHS.posts, (doc) => {
    ensureDoc(doc, 'posts');
    doc.posts = doc.posts.filter((p) => p.id !== postId);
    return doc;
  }, { empty: EMPTY('posts'), message: 'NimbookGR: borrar publicación' });

  const hasComments = state.comments.some((c) => c.postId === postId);
  if (hasComments) {
    await state.db.mutate(PATHS.comments, (doc) => {
      ensureDoc(doc, 'comments');
      doc.comments = doc.comments.filter((c) => c.postId !== postId);
      return doc;
    }, { empty: EMPTY('comments'), message: 'NimbookGR: borrar comentarios' }).catch(() => {});
  }

  for (const path of mediaPaths) await deleteMedia(path).catch(() => {});
}

export async function setReaction(postId, type) {
  const me = requireMe();
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;

  // actualización optimista para que el clic se sienta inmediato
  state.ui.reactionOverrides.set(postId, type);
  notify('data');

  try {
    await state.db.mutate(PATHS.posts, (doc) => {
      const target = doc.posts?.find((p) => p.id === postId);
      if (!target) return SKIP;
      target.reactions = target.reactions || {};
      const previous = target.reactions[me.id];
      if (!type) delete target.reactions[me.id];
      else target.reactions[me.id] = type;
      if (previous === type && type) return SKIP;
      return doc;
    }, { empty: EMPTY('posts'), message: 'NimbookGR: reacción' });

    if (type) {
      await pushNotification(post.authorId, {
        type: 'reaction', actorId: me.id, postId, reaction: type,
      });
    }
  } catch (err) {
    state.ui.reactionOverrides.delete(postId);
    notify('data');
    throw err;
  } finally {
    state.ui.reactionOverrides.delete(postId);
    notify('data');
  }
}

export async function toggleSavePost(postId) {
  const me = requireMe();
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return false;
  const saved = me.savedPostIds || [];
  const isSaved = saved.includes(postId);

  await state.db.mutate(PATHS.users, (doc) => {
    const target = doc.users?.find((u) => u.id === me.id);
    if (!target) return SKIP;
    target.savedPostIds = target.savedPostIds || [];
    if (isSaved) target.savedPostIds = target.savedPostIds.filter((id) => id !== postId);
    else target.savedPostIds.push(postId);
    return doc;
  }, { empty: EMPTY('users'), message: 'NimbookGR: guardar publicación' });

  return !isSaved;
}

/* ------------------------------- comentarios ----------------------------- */

export async function addComment(postId, text, { parentId = null, media = [] } = {}) {
  const me = requireMe();
  const post = state.posts.find((p) => p.id === postId);
  if (!post) throw new Error('La publicación ya no existe.');
  const clean = String(text || '').trim();
  if (!clean && !media.length) return null;
  if (clean.length > 3000) throw new ValidationError('El comentario es demasiado largo.');

  const comment = {
    id: uid('c_'),
    postId,
    parentId: parentId || null,
    authorId: me.id,
    text: clean,
    media: Array.isArray(media) ? media : [],
    reactions: {},
    createdAt: nowISO(),
  };

  await state.db.mutate(PATHS.comments, (doc) => {
    ensureDoc(doc, 'comments');
    if (doc.comments.some((c) => c.id === comment.id)) return SKIP;
    doc.comments.push(comment);
    return doc;
  }, { empty: EMPTY('comments'), message: 'NimbookGR: nuevo comentario' });

  await pushNotification(post.authorId, {
    type: parentId ? 'reply' : 'comment', actorId: me.id, postId, commentId: comment.id,
  });

  if (parentId) {
    const parent = state.comments.find((c) => c.id === parentId);
    if (parent && parent.authorId !== post.authorId) {
      await pushNotification(parent.authorId, {
        type: 'reply', actorId: me.id, postId, commentId: comment.id,
      });
    }
  }

  return comment;
}

export async function deleteComment(commentId) {
  const me = requireMe();
  const comment = state.comments.find((c) => c.id === commentId);
  if (!comment) return;
  if (comment.authorId !== me.id) throw new Error('Solo puedes borrar tus comentarios.');

  await state.db.mutate(PATHS.comments, (doc) => {
    ensureDoc(doc, 'comments');
    doc.comments = doc.comments.filter((c) => c.id !== commentId && c.parentId !== commentId);
    return doc;
  }, { empty: EMPTY('comments'), message: 'NimbookGR: borrar comentario' });
}

export async function setCommentReaction(commentId, type) {
  const me = requireMe();
  await state.db.mutate(PATHS.comments, (doc) => {
    const target = doc.comments?.find((c) => c.id === commentId);
    if (!target) return SKIP;
    target.reactions = target.reactions || {};
    if (!type) delete target.reactions[me.id];
    else target.reactions[me.id] = type;
    return doc;
  }, { empty: EMPTY('comments'), message: 'NimbookGR: reacción en comentario' });
}

/* ------------------------------ seguidores -------------------------------- */

export async function followUser(userId) {
  const me = requireMe();
  if (userId === me.id) return;
  if (isFollowing(me.id, userId)) return;

  await state.db.mutate(PATHS.users, (doc) => {
    const target = doc.users?.find((u) => u.id === me.id);
    if (!target) return SKIP;
    target.following = Array.from(new Set([...(target.following || []), userId]));
    delete target.friendIds;
    return doc;
  }, { empty: EMPTY('users'), message: 'NimbookGR: nuevo seguidor' });

  await pushNotification(userId, { type: 'follow', actorId: me.id });
}

export async function unfollowUser(userId) {
  const me = requireMe();
  await state.db.mutate(PATHS.users, (doc) => {
    const target = doc.users?.find((u) => u.id === me.id);
    if (!target) return SKIP;
    target.following = (target.following || []).filter((id) => id !== userId);
    return doc;
  }, { empty: EMPTY('users'), message: 'NimbookGR: dejar de seguir' });
}

export async function toggleFollow(userId) {
  if (isFollowing(state.me?.id, userId)) {
    await unfollowUser(userId);
    return false;
  }
  await followUser(userId);
  return true;
}

/* -------------------------------- perfil --------------------------------- */

export async function updateProfile(patch) {
  const me = requireMe();
  const allowed = ['name', 'bio', 'birthday', 'gender', 'location', 'work', 'education',
    'avatar', 'cover', 'username', 'whatsapp', 'instagram'];
  const clean = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) clean[key] = patch[key];
  }
  if (clean.name !== undefined) {
    clean.name = String(clean.name).trim().replace(/\s+/g, ' ');
    if (clean.name.length < 2) throw new ValidationError('El nombre es demasiado corto.', 'name');
    if (clean.name.length > 60) throw new ValidationError('El nombre es demasiado largo.', 'name');
  }
  if (clean.username !== undefined) {
    const username = String(clean.username).trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
      throw new ValidationError('Usuario inválido (3-30, sin espacios).', 'username');
    }
    if (state.users.some((u) => u.username === username && u.id !== me.id)) {
      throw new ValidationError('Ese usuario ya está ocupado.', 'username');
    }
    clean.username = username;
  }
  if (clean.bio !== undefined) clean.bio = String(clean.bio).slice(0, 500);
  if (clean.whatsapp !== undefined) {
    const digits = String(clean.whatsapp).replace(/[^\d]/g, '');
    if (digits && (digits.length < 6 || digits.length > 15)) {
      throw new ValidationError('Escribe un número de WhatsApp válido.', 'whatsapp');
    }
    clean.whatsapp = digits;
  }
  if (clean.instagram !== undefined) {
    const handle = String(clean.instagram).trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/^@+/, '')
      .replace(/[/?#].*$/, '')
      .trim();
    if (handle && !/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
      throw new ValidationError('El usuario de Instagram no es válido.', 'instagram');
    }
    clean.instagram = handle;
  }

  await state.db.mutate(PATHS.users, (doc) => {
    const target = doc.users?.find((u) => u.id === me.id);
    if (!target) return SKIP;
    Object.assign(target, clean);
    return doc;
  }, { empty: EMPTY('users'), message: 'NimbookGR: actualizar perfil' });
}

export async function changePassword(currentPassword, newPassword) {
  const me = requireMe();
  if (String(newPassword || '').length < 6) {
    throw new ValidationError('La nueva contraseña necesita 6 caracteres como mínimo.', 'newPassword');
  }
  const ok = await verifyPassword(currentPassword, me.password);
  if (!ok) throw new ValidationError('La contraseña actual no es correcta.', 'currentPassword');
  const record = await hashPassword(newPassword);
  await state.db.mutate(PATHS.users, (doc) => {
    const target = doc.users?.find((u) => u.id === me.id);
    if (!target) return SKIP;
    target.password = record;
    return doc;
  }, { empty: EMPTY('users'), message: 'NimbookGR: cambiar contraseña' });
  state.me = { ...state.me, password: record };
}

/* -------------------------------- mensajes ------------------------------- */

export async function ensureConversation(otherUserId) {
  const me = requireMe();
  if (otherUserId === me.id) throw new Error('No puedes escribirte a ti mismo.');

  const existing = conversationFor(me.id, otherUserId);
  if (existing) return existing;

  const conversation = {
    id: uid('cv_'),
    memberIds: [me.id, otherUserId],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    lastMessage: null,
    reads: {},
  };

  await state.db.mutate(PATHS.conversations, (doc) => {
    ensureDoc(doc, 'conversations');
    const found = doc.conversations.find((c) =>
      c.memberIds?.length === 2 && c.memberIds.includes(me.id) && c.memberIds.includes(otherUserId));
    if (found) return SKIP;
    doc.conversations.push(conversation);
    return doc;
  }, { empty: EMPTY('conversations'), message: 'NimbookGR: nueva conversación' });

  return conversationFor(me.id, otherUserId) || conversation;
}

export async function loadChat(conversationId, { revalidate = false } = {}) {
  if (!state.db || !conversationId) return [];
  const doc = await state.db.load(chatPath(conversationId), revalidate ? { revalidate: true } : {});
  const messages = doc?.messages || [];
  state.chats.set(conversationId, messages);
  return messages;
}

export async function sendMessage(conversationId, { text = '', media = [] } = {}) {
  const me = requireMe();
  const clean = String(text || '').trim();
  if (!clean && !media.length) return null;
  if (clean.length > 5000) throw new ValidationError('El mensaje es demasiado largo.');

  const message = {
    id: uid('m_'),
    senderId: me.id,
    text: clean,
    media: Array.isArray(media) ? media : [],
    createdAt: nowISO(),
  };

  await state.db.mutate(chatPath(conversationId), (doc) => {
    ensureDoc(doc, 'messages');
    if (doc.messages.some((m) => m.id === message.id)) return SKIP;
    doc.messages.push(message);
    return doc;
  }, { empty: EMPTY('messages'), message: 'NimbookGR: enviar mensaje' });

  const preview = clean || '📷 Foto';
  await state.db.mutate(PATHS.conversations, (doc) => {
    const conv = doc.conversations?.find((c) => c.id === conversationId);
    if (!conv) return SKIP;
    conv.lastMessage = { text: preview.slice(0, 120), senderId: me.id, at: Date.now() };
    conv.updatedAt = nowISO();
    conv.reads = conv.reads || {};
    conv.reads[me.id] = Date.now();
    return doc;
  }, { empty: EMPTY('conversations'), message: 'NimbookGR: actualizar conversación' });

  return message;
}

export async function markConversationRead(conversationId) {
  const me = state.me;
  if (!me || !state.db) return;
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (!conv) return;
  const reads = conv.reads?.[me.id] || 0;
  const last = conv.lastMessage?.at || 0;
  if (last <= reads || conv.lastMessage?.senderId === me.id) return;

  await state.db.mutate(PATHS.conversations, (doc) => {
    const target = doc.conversations?.find((c) => c.id === conversationId);
    if (!target) return SKIP;
    target.reads = target.reads || {};
    if ((target.lastMessage?.at || 0) <= (target.reads[me.id] || 0)) return SKIP;
    target.reads[me.id] = Date.now();
    return doc;
  }, { empty: EMPTY('conversations'), message: 'NimbookGR: leer conversación' }).catch(() => {});
}

/* -------------------------------- grupos --------------------------------- */

export async function createGroup({ name, description = '', privacy = 'public', cover = null }) {
  const me = requireMe();
  const cleanName = String(name || '').trim();
  if (cleanName.length < 3) throw new ValidationError('El nombre del grupo es muy corto.', 'name');
  if (cleanName.length > 60) throw new ValidationError('El nombre del grupo es muy largo.', 'name');

  const group = {
    id: uid('g_'),
    name: cleanName,
    description: String(description || '').slice(0, 500),
    privacy,
    cover: cover || null,
    ownerId: me.id,
    memberIds: [me.id],
    createdAt: nowISO(),
  };

  await state.db.mutate(PATHS.groups, (doc) => {
    ensureDoc(doc, 'groups');
    doc.groups.push(group);
    return doc;
  }, { empty: EMPTY('groups'), message: 'NimbookGR: nuevo grupo' });

  return group;
}

export async function joinGroup(groupId) {
  const me = requireMe();
  await state.db.mutate(PATHS.groups, (doc) => {
    const group = doc.groups?.find((g) => g.id === groupId);
    if (!group) return SKIP;
    group.memberIds = Array.from(new Set([...(group.memberIds || []), me.id]));
    return doc;
  }, { empty: EMPTY('groups'), message: 'NimbookGR: unirse a grupo' });
}

export async function leaveGroup(groupId) {
  const me = requireMe();
  await state.db.mutate(PATHS.groups, (doc) => {
    const group = doc.groups?.find((g) => g.id === groupId);
    if (!group) return SKIP;
    group.memberIds = (group.memberIds || []).filter((id) => id !== me.id);
    return doc;
  }, { empty: EMPTY('groups'), message: 'NimbookGR: salir del grupo' });
}

export async function updateGroup(groupId, patch) {
  const me = requireMe();
  await state.db.mutate(PATHS.groups, (doc) => {
    const group = doc.groups?.find((g) => g.id === groupId);
    if (!group || group.ownerId !== me.id) return SKIP;
    Object.assign(group, patch);
    return doc;
  }, { empty: EMPTY('groups'), message: 'NimbookGR: editar grupo' });
}

/* -------------------------------- historias ------------------------------ */

export async function createStory({ image, text = '' } = {}) {
  const me = requireMe();
  if (!image) throw new ValidationError('Elige una foto para tu historia.');
  const story = {
    id: uid('s_'),
    userId: me.id,
    image,
    text: String(text || '').slice(0, 80),
    createdAt: nowISO(),
  };
  await state.db.mutate(PATHS.stories, (doc) => {
    ensureDoc(doc, 'stories');
    doc.stories.push(story);
    return doc;
  }, { empty: EMPTY('stories'), message: 'NimbookGR: nueva historia' });
  return story;
}

export async function deleteStory(storyId) {
  const me = requireMe();
  const story = state.stories.find((s) => s.id === storyId);
  if (!story || story.userId !== me.id) return;
  await state.db.mutate(PATHS.stories, (doc) => {
    ensureDoc(doc, 'stories');
    doc.stories = doc.stories.filter((s) => s.id !== storyId);
    return doc;
  }, { empty: EMPTY('stories'), message: 'NimbookGR: borrar historia' });
  if (story.image) await deleteMedia(story.image).catch(() => {});
}

/** Borra historias vencidas (más de 24 h). */
export async function purgeOldStories() {
  if (!state.db) return;
  const expired = (state.db.peek(PATHS.stories)?.stories || [])
    .filter((s) => Date.now() - Date.parse(s.createdAt || 0) > 24 * 3600 * 1000);
  if (!expired.length) return;
  const ids = new Set(expired.map((s) => s.id));
  await state.db.mutate(PATHS.stories, (doc) => {
    ensureDoc(doc, 'stories');
    doc.stories = doc.stories.filter((s) => !ids.has(s.id));
    return doc;
  }, { empty: EMPTY('stories'), message: 'NimbookGR: limpiar historias vencidas' }).catch(() => {});
  for (const story of expired) {
    if (story.image) deleteMedia(story.image).catch(() => {});
  }
}

/* ------------------------------- búsqueda -------------------------------- */

export function registerSqlDebug() {
  // placeholder para futuras consultas
  syncFromDb();
}
