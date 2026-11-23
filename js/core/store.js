/* ==========================================================================
   store.js — estado en memoria y lecturas desde Supabase
   ========================================================================== */
import {
  configure, fetchDoc, cachePut, onWrite, bumpVersion, queueDoc,
} from './net.js';
import { P } from './paths.js';
import { verificationInfo } from './verification.js';
import { deleteR2 } from './r2.js';

const PAGE = 30;

export const state = {
  ready: false,
  me: null,
  cfg: null,

  users: new Map(),        // id -> usuario completo
  userIndex: [],           // lista liviana para buscar y listar
  following: new Set(),    // ids que sigo
  followers: new Set(),    // ids que me siguen
  likes: {},               // postId -> tipo de reacción

  feedIndex: [],           // [{ id, authorId, createdAt }]
  posts: new Map(),        // id -> publicación completa
  feedLoaded: 0,

  comments: new Map(),     // postId -> { index, items: Map, loaded }
  groups: [],
  stories: [],
  reels: [],
  notifications: [],

  shopIndex: [],           // [{ id, sellerId, title, price, ... }]
  shopItems: new Map(),    // id -> ficha completa del producto

  inbox: [],               // [{ threadId, withId, lastText, lastAt, lastFromId, unread }]
  threads: new Map(),      // threadId -> { messages, loaded, at }

  ui: {
    unreadNotifs: 0,
    unreadMessages: 0,
    lastSync: 0,
    online: true,
  },
};

const listeners = new Set();
const followingCache = new Map(); // userId -> { list, at }

/** A quién sigue alguien (sirve para cualquier usuario, no solo para mí). */
export async function followingIdsOf(userId) {
  if (!userId) return [];
  if (userId === state.me?.id) return [...state.following];
  const cached = followingCache.get(userId);
  if (cached && Date.now() - cached.at < 60000) return cached.list;
  const doc = await docJson(P.following(userId));
  const list = doc?.following || [];
  followingCache.set(userId, { list, at: Date.now() });
  return list;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(topic = 'data', detail = {}) {
  state.ui.lastSync = Date.now();
  for (const fn of listeners) {
    try { fn(topic, detail); } catch (err) { console.error('[store]', err); }
  }
}

export function attach(cfg) {
  state.cfg = configure(cfg);
  onWrite((path, doc, meta = {}) => {
    let topic = 'write';
    const detail = { path, remote: Boolean(meta.remote) };

    if (path === P.userIndex) {
      state.userIndex = doc?.users || [];
      topic = 'people';
    } else if (path === P.feedIndex) {
      state.feedIndex = doc?.posts || [];
      topic = 'feed';
    } else if (path === P.groups) {
      state.groups = doc?.groups || [];
      topic = 'groups';
    } else if (path === P.stories) {
      state.stories = doc?.stories || [];
      topic = 'stories';
    } else if (path === P.reels) {
      state.reels = Array.isArray(doc?.reels) ? doc.reels : [];
      topic = 'reels';
    } else if (path === P.shopIndex) {
      state.shopIndex = doc?.items || [];
      topic = 'shop';
    } else if (state.me && path === P.likes(state.me.id)) {
      state.likes = doc?.likes || {};
      topic = 'reactions';
    } else if (state.me && path === P.following(state.me.id)) {
      state.following = new Set(doc?.following || []);
      topic = 'follow';
    } else if (state.me && path === P.followers(state.me.id)) {
      state.followers = new Set(doc?.followers || []);
      topic = 'follow';
    } else if (state.me && path === P.inbox(state.me.id)) {
      state.inbox = Array.isArray(doc?.threads) ? doc.threads : [];
      state.ui.unreadMessages = countUnreadMessages(state.inbox);
      topic = 'messages';
    } else if (state.me && path === P.notifications(state.me.id)) {
      state.notifications = (doc?.items || []).slice(0, 60);
      state.ui.unreadNotifs = state.notifications.filter((item) => !item.read).length;
      topic = 'notifications';
    } else if (path.startsWith('data/usuarios/')) {
      if (doc?.user) state.users.set(doc.user.id, doc.user);
      topic = state.me && doc?.user?.id === state.me.id ? 'me' : 'people';
    } else if (path.startsWith('data/feed/')) {
      if (doc?.post) {
        state.posts.set(doc.post.id, doc.post);
        detail.id = doc.post.id;
        detail.authorId = doc.post.authorId;
      }
      topic = 'post';
    } else if (path.startsWith('data/comentarios/')) {
      detail.postId = path.split('/')[2] || null;
      topic = 'comments';
    } else if (path.startsWith('data/tienda/')) {
      if (doc?.item) state.shopItems.set(doc.item.id, doc.item);
      topic = 'shop';
    } else if (path.startsWith('data/mensajes/hilos/')) {
      topic = 'messages';
    } else if (path.startsWith('data/mensajes/bandejas/')) {
      topic = 'messages';
    }

    notify(topic, detail);
  });
  return state;
}

/* ------------------------------ documentos ------------------------------- */

async function docJson(path, opts) {
  try {
    return (await fetchDoc(path, opts)) || null;
  } catch (err) {
    console.warn('[store] no se pudo leer', path, err?.message);
    return null;
  }
}

export async function loadUser(id) {
  if (!id) return null;
  if (state.users.has(id)) return state.users.get(id);
  const doc = await docJson(P.user(id));
  if (doc?.user) {
    state.users.set(id, doc.user);
    return doc.user;
  }
  const light = state.userIndex.find((item) => item.id === id);
  if (light) {
    state.users.set(id, { ...light });
    return light;
  }
  return null;
}

export async function ensureUsers(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !state.users.has(id));
  if (!missing.length) return;
  await Promise.all(missing.slice(0, 30).map((id) => loadUser(id)));
}

export async function loadUserIndex({ fresh = false } = {}) {
  const doc = await docJson(P.userIndex, { fresh });
  state.userIndex = doc?.users || [];
  return state.userIndex;
}

export async function loadFeedIndex({ fresh = false } = {}) {
  const doc = await docJson(P.feedIndex, { fresh });
  state.feedIndex = doc?.posts || [];
  return state.feedIndex;
}

export async function loadPost(id) {
  if (state.posts.has(id)) return state.posts.get(id);
  const doc = await docJson(P.post(id));
  if (doc?.post) {
    state.posts.set(id, doc.post);
    return doc.post;
  }
  return null;
}

export async function loadFeedPage({ reset = false } = {}) {
  if (reset) {
    state.feedLoaded = 0;
    state.posts.clear();
  }
  const slice = state.feedIndex.slice(state.feedLoaded, state.feedLoaded + PAGE);
  if (!slice.length) return 0;
  state.feedLoaded += slice.length;

  const posts = [];
  const chunk = 6;
  for (let i = 0; i < slice.length; i += chunk) {
    const batch = await Promise.all(slice.slice(i, i + chunk).map((entry) => loadPost(entry.id)));
    posts.push(...batch.filter(Boolean));
  }
  await ensureUsers(posts.map((post) => post.authorId));
  // Sin aviso: quien llama decide cuándo volver a pintar el muro (así "cargar
  // más" agrega publicaciones al final sin reordenar las que ya se veían).
  return posts.length;
}

/**
 * Carga unas pocas publicaciones de gente que no seguís para que el muro tenga
 * contenido mezclado desde la primera pantalla. Son lecturas a Supabase.
 */
export async function loadDiscoveryPage(viewerId, limit = 8) {
  if (!viewerId) return 0;
  const candidates = state.feedIndex
    .filter((entry) => entry.authorId !== viewerId && !isFollowing(viewerId, entry.authorId))
    .filter((entry) => !state.posts.has(entry.id))
    .slice(0, limit);
  if (!candidates.length) return 0;

  const posts = [];
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = await Promise.all(candidates.slice(i, i + 6).map((entry) => loadPost(entry.id)));
    posts.push(...batch.filter(Boolean));
  }
  await ensureUsers(posts.map((post) => post.authorId));
  return posts.length;
}

export async function loadLikes(userId) {
  const doc = await docJson(P.likes(userId));
  const likes = doc?.likes || {};
  if (userId === state.me?.id) state.likes = likes;
  return likes;
}

export async function loadFollowing(userId) {
  const doc = await docJson(P.following(userId));
  const list = doc?.following || [];
  if (userId === state.me?.id) state.following = new Set(list);
  const user = state.users.get(userId);
  if (user) user.following = list;
  await ensureUsers(list);
  return list;
}

export async function loadFollowers(userId) {
  const doc = await docJson(P.followers(userId));
  const list = doc?.followers || [];
  if (userId === state.me?.id) state.followers = new Set(list);
  const user = state.users.get(userId);
  if (user) user.followers = list;
  await ensureUsers(list);
  return list;
}

export async function loadNotifications(userId) {
  const doc = await docJson(P.notifications(userId));
  state.notifications = (doc?.items || []).slice(0, 60);
  state.ui.unreadNotifs = state.notifications.filter((item) => !item.read).length;
  const actors = [...new Set(state.notifications.map((item) => item.actorId).filter(Boolean))];
  if (actors.length) await ensureUsers(actors.slice(0, 30));
  return state.notifications;
}

export async function loadGroups() {
  const doc = await docJson(P.groups);
  state.groups = doc?.groups || [];
  return state.groups;
}

export async function loadStories() {
  const doc = await docJson(P.stories);
  const all = Array.isArray(doc?.stories) ? doc.stories : [];
  const alive = [];
  const expired = [];
  for (const story of all) {
    const isVideo = story.type === 'video' || Boolean(story.video);
    const ttl = isVideo ? 18 * 3600 * 1000 : 24 * 3600 * 1000;
    const expires = story.expiresAt
      ? new Date(story.expiresAt).getTime()
      : new Date(story.createdAt).getTime() + ttl;
    if (expires > Date.now()) alive.push(story);
    else expired.push(story);
  }
  state.stories = alive;
  if (expired.length) {
    queueDoc(P.stories, (current) => {
      if (!current?.stories) return undefined;
      const ids = new Set(expired.map((story) => story.id));
      return { ...current, stories: current.stories.filter((story) => !ids.has(story.id)) };
    }, { delay: 0, message: 'Zuma: limpiar historias vencidas' }).catch(() => {});
    for (const story of expired) {
      if (story.videoKey) deleteR2(story.videoKey).catch(() => {});
      if (story.posterKey) deleteR2(story.posterKey).catch(() => {});
    }
  }
  return state.stories;
}

export async function loadReels({ fresh = false } = {}) {
  const doc = await docJson(P.reels, { fresh });
  state.reels = Array.isArray(doc?.reels) ? doc.reels : [];
  return state.reels;
}

/* -------------------------------- tienda --------------------------------- */

export async function loadShopIndex({ fresh = false } = {}) {
  const doc = await docJson(P.shopIndex, { fresh });
  state.shopIndex = Array.isArray(doc?.items) ? doc.items : [];
  return state.shopIndex;
}

export async function loadShopItem(id, { force = false } = {}) {
  if (!id) return null;
  if (!force && state.shopItems.has(id)) return state.shopItems.get(id);
  const doc = await docJson(P.shopItem(id), { fresh: force });
  if (doc?.item) {
    state.shopItems.set(id, doc.item);
    return doc.item;
  }
  return state.shopItems.get(id) || null;
}

/* ------------------------------- mensajes -------------------------------- */

export async function loadInbox(userId, { fresh = false } = {}) {
  if (!userId) return [];
  const doc = await docJson(P.inbox(userId), { fresh });
  const raw = Array.isArray(doc?.threads) ? doc.threads : null;
  // Repara bandejas viejas: el "otro" se deduce del id del hilo, no de withId.
  // También descarta hilos con uno mismo, que quedaron por el bug anterior.
  const fetched = raw ? raw
    .filter((entry) => {
      const ids = String(entry.threadId || '').split('__').filter(Boolean);
      return ids.length === 2 && ids[0] !== ids[1] && ids.includes(userId);
    })
    .map((entry) => {
      const partner = String(entry.threadId || '')
        .split('__')
        .find((id) => id && id !== userId) || null;
      return partner && entry.withId !== partner ? { ...entry, withId: partner } : entry;
    }) : null;
  if (userId !== state.me?.id) return fetched || [];

  const local = state.inbox;
  let list;

  if (!fetched) {
    // 404 (todavía no existe) o error de red: no borrar lo que ya se ve.
    list = local;
  } else {
    const byThread = new Map(fetched.map((entry) => [entry.threadId, entry]));
    list = fetched.map((entry) => {
      const localEntry = local.find((row) => row.threadId === entry.threadId);
      if (!localEntry) return entry;
      if (new Date(localEntry.lastAt || 0) > new Date(entry.lastAt || 0)) return localEntry;
      const sameMoment = String(localEntry.lastAt || '') === String(entry.lastAt || '');
      if (localEntry.readLocally && sameMoment && entry.unread) {
        return { ...entry, unread: 0, readLocally: true };
      }
      if (!entry.unread) return { ...entry, readLocally: false };
      return entry;
    });

    // Mensajes recién enviados que todavía no aparecen en el archivo público.
    const now = Date.now();
    for (const localEntry of local) {
      if (byThread.has(localEntry.threadId)) continue;
      if (now - new Date(localEntry.lastAt || 0).getTime() < 120000) list.unshift(localEntry);
    }
  }

  state.inbox = list;
  state.ui.unreadMessages = countUnreadMessages(list);
  const partners = list.map((entry) => entry.withId).filter(Boolean);
  if (partners.length) await ensureUsers(partners.slice(0, 24));
  return list;
}

export async function loadThread(threadId, { force = false } = {}) {
  if (!threadId) return null;
  const cached = state.threads.get(threadId);
  if (cached?.loaded && !force && Date.now() - (cached.at || 0) < 15000) return cached;

  const doc = await docJson(P.thread(threadId), { fresh: force });
  const fetched = Array.isArray(doc?.thread?.messages) ? doc.thread.messages : null;

  // Si la lectura falla, conservar lo que ya había: mejor un chat viejo que vacío.
  if (!fetched) {
    if (cached?.messages?.length) {
      cached.at = Date.now();
      return cached;
    }
    const empty = { threadId, messages: [], loaded: true, at: Date.now() };
    state.threads.set(threadId, empty);
    return empty;
  }

  // Un mensaje recién enviado puede tardar unos segundos en el link público:
  // se mantiene al final hasta que una lectura lo confirme.
  const fetchedIds = new Set(fetched.map((message) => message.id));
  const pending = (cached?.messages || [])
    .filter((message) => (message.pending || message.localOnly) && !fetchedIds.has(message.id))
    .map((message) => ({ ...message, pending: false, localOnly: true }));
  const messages = [
    ...fetched.map((message) => (message.pending || message.localOnly
      ? { ...message, pending: false, localOnly: false }
      : message)),
    ...pending,
  ].slice(-400);

  const entry = { threadId, messages, loaded: true, at: Date.now() };
  state.threads.set(threadId, entry);
  const authors = messages.map((message) => message.fromId).filter(Boolean);
  if (authors.length) await ensureUsers([...new Set(authors)].slice(0, 24));
  return entry;
}

export function threadOf(threadId) {
  return state.threads.get(threadId) || null;
}

export function messagesOf(threadId) {
  return threadOf(threadId)?.messages || [];
}

export function countUnreadMessages(list = state.inbox) {
  return (list || []).reduce((total, entry) => total + (Number(entry?.unread) || 0), 0);
}

export function inboxSorted(list = state.inbox) {
  return [...(list || [])].sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
}

/** Id del hilo compartido entre dos personas (las dos leen el mismo archivo). */
export function threadIdFor(a, b) {
  return [a, b].filter(Boolean).sort().join('__');
}

export function conversationWith(userId) {
  const threadId = threadIdFor(state.me?.id, userId);
  return state.inbox.find((entry) => entry.threadId === threadId) || null;
}

export async function loadComments(postId, { force = false } = {}) {
  if (!postId) return [];
  let entry = state.comments.get(postId);
  if (entry?.loaded && !force) return [...entry.items.values()];

  const indexDoc = await docJson(P.commentsIndex(postId), { fresh: force });
  const index = (indexDoc?.comments || []).sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );

  entry = entry || { index: [], items: new Map(), loaded: false };
  entry.index = index;
  const missing = index.filter((item) => !entry.items.has(item.id)).slice(0, 40);
  for (let i = 0; i < missing.length; i += 6) {
    const batch = await Promise.all(missing.slice(i, i + 6).map(async (item) => {
      const doc = await docJson(P.comment(postId, item.id));
      return doc?.comment || null;
    }));
    batch.filter(Boolean).forEach((comment) => entry.items.set(comment.id, comment));
  }
  await ensureUsers([...entry.items.values()].map((comment) => comment.authorId));
  entry.loaded = true;
  state.comments.set(postId, entry);
  notify('comments', { postId });
  return [...entry.items.values()];
}

export function commentsFor(postId) {
  const entry = state.comments.get(postId);
  if (!entry?.loaded) return [];
  return entry.index
    .map((item) => entry.items.get(item.id))
    .filter(Boolean);
}

/* ------------------------------- selectores ------------------------------ */

export const userById = (id) => state.users.get(id) || null;

export function updateProfileCache(user) {
  if (!user?.id) return;
  state.users.set(user.id, user);
  if (state.me?.id === user.id) state.me = user;
}

export const userByUsername = (username) =>
  state.users.get(
    state.userIndex.find((user) => user.username?.toLowerCase() === String(username || '').toLowerCase())?.id,
  ) || null;

/** Nombre y apellido reales (para el perfil). */
export function fullName(user) {
  if (!user) return 'Usuario';
  return user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Usuario';
}

/** Etiqueta visible en toda la app: el usuario. */
export function displayName(user) {
  if (!user) return '@usuario';
  if (user.username) return '@' + user.username;
  return fullName(user);
}

export function initialsOf(user) {
  const name = fullName(user).trim();
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const isFollowing = (followerId, targetId) => {
  if (followerId === state.me?.id) return state.following.has(targetId);
  const user = state.users.get(followerId);
  return Boolean(user?.following?.includes(targetId));
};

export function followingOf(userId) {
  if (userId === state.me?.id) return [...state.following].map(userById).filter(Boolean);
  return (state.users.get(userId)?.following || []).map(userById).filter(Boolean);
}

export function followersOf(userId) {
  if (userId === state.me?.id) {
    return [...state.followers].map(userById).filter(Boolean);
  }
  return (state.users.get(userId)?.followers || []).map(userById).filter(Boolean);
}

export function countFollowers(userId) {
  if (userId === state.me?.id) return state.followers.size;
  return state.users.get(userId)?.followers?.length || 0;
}

export function countFollowing(userId) {
  if (userId === state.me?.id) return state.following.size;
  return state.users.get(userId)?.following?.length || 0;
}

export function relationWith(meId, otherId) {
  if (!meId || !otherId) return 'none';
  if (meId === otherId) return 'self';
  if (isFollowing(meId, otherId)) return 'following';
  if (isFollowing(otherId, meId)) return 'follows-you';
  return 'none';
}

export function mutualFollowers(a, b) {
  const target = new Set(followersOf(b).map((user) => user.id));
  return followersOf(a).filter((user) => target.has(user.id));
}

export function followSuggestions(viewerId, limit = 12) {
  if (!viewerId) return [];
  const scored = [];
  for (const entry of state.userIndex) {
    if (entry.id === viewerId || isFollowing(viewerId, entry.id)) continue;
    const user = state.users.get(entry.id) || entry;
    const info = verificationInfo(user);
    let score = info?.active ? 1000 : 0;
    score += Math.min(20, Number(user.followers || 0) / 10);
    scored.push({ user, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || String(a.user.username).localeCompare(String(b.user.username)))
    .slice(0, limit)
    .map((row) => row.user);
}

export function postsByAuthor(userId) {
  const ids = new Set(state.feedIndex.filter((entry) => entry.authorId === userId).map((entry) => entry.id));
  return [...state.posts.values()]
    .filter((post) => post.authorId === userId || ids.has(post.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function canSeePost(post, viewerId) {
  if (!post) return false;
  if (post.groupId) {
    const group = state.groups.find((item) => item.id === post.groupId);
    if (!group) return false;
    if (group.privacy === 'public') return true;
    return Boolean(viewerId && (group.memberIds || []).includes(viewerId));
  }
  if (post.authorId === viewerId) return true;
  const privacy = post.privacy || 'public';
  if (privacy === 'public') return true;
  if (privacy === 'followers' || privacy === 'friends') {
    return Boolean(viewerId) && isFollowing(viewerId, post.authorId);
  }
  return false;
}

export function feedPosts(viewerId) {
  const order = new Map(state.feedIndex.map((entry, index) => [entry.id, index]));
  return [...state.posts.values()]
    .filter((post) => canSeePost(post, viewerId))
    .sort((a, b) => {
      const ai = order.has(a.id) ? order.get(a.id) : 9999;
      const bi = order.has(b.id) ? order.get(b.id) : 9999;
      if (ai !== bi) return ai - bi;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

export function reactionSummary(post) {
  const counts = post?.reactions || {};
  const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const types = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);
  return { total, types, mine: state.likes[post.id] || null };
}

export function rootComments(postId) {
  return commentsFor(postId).filter((comment) => !comment.parentId);
}

export function repliesTo(commentId) {
  return [...state.comments.values()]
    .flatMap((entry) => [...entry.items.values()])
    .filter((comment) => comment.parentId === commentId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function userPhotos(userId) {
  const photos = [];
  for (const post of postsByAuthor(userId)) {
    for (const media of post.media || []) photos.push({ ...media, postId: post.id });
  }
  return photos;
}

export function allPhotos() {
  return [...state.posts.values()].flatMap((post) =>
    (post.media || []).map((media) => ({ ...media, postId: post.id })));
}

const SEEN_STORIES_KEY = 'zuma.stories.vistos.v1';

function readSeenStories() {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_STORIES_KEY) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function writeSeenStories(seen) {
  try {
    localStorage.setItem(SEEN_STORIES_KEY, JSON.stringify([...seen].slice(-800)));
  } catch { /* noop */ }
}

export function storySeen(storyId) {
  return readSeenStories().has(storyId);
}

export function markStorySeen(storyId) {
  if (!storyId) return;
  const seen = readSeenStories();
  if (seen.has(storyId)) return;
  seen.add(storyId);
  writeSeenStories(seen);
}

export function storiesGrouped(viewerId) {
  const seen = readSeenStories();
  const byUser = new Map();
  for (const story of state.stories) {
    if (!byUser.has(story.userId)) byUser.set(story.userId, []);
    byUser.get(story.userId).push(story);
  }
  const groups = [];
  for (const [userId, list] of byUser) {
    const user = userById(userId);
    if (!user) continue;
    // solo mis historias y las de las personas que sigo
    if (userId !== viewerId && !isFollowing(viewerId, userId)) continue;
    // Dentro de cada persona, de la primera subida a la última.
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const latest = list[list.length - 1];
    const firstUnseen = list.findIndex((story) => !seen.has(story.id));
    groups.push({
      user,
      stories: list,
      latest,
      startIndex: firstUnseen >= 0 ? firstUnseen : 0,
      unseen: firstUnseen >= 0,
      unseenCount: firstUnseen >= 0 ? list.length - firstUnseen : 0,
    });
  }
  groups.sort((a, b) => {
    if (a.user.id === viewerId) return -1;
    if (b.user.id === viewerId) return 1;
    if (a.unseen !== b.unseen) return a.unseen ? -1 : 1;
    return new Date(b.latest.createdAt) - new Date(a.latest.createdAt);
  });
  return groups;
}

export function searchPeople(query, limit = 20) {
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) return [];
  const norm = (value) => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(raw);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const scored = [];
  for (const entry of state.userIndex) {
    const full = state.users.get(entry.id) || entry;
    const username = norm(full.username);
    const name = norm(displayName(full));
    const first = norm(full.firstName);
    const last = norm(full.lastName);
    const bio = norm(full.bio);
    const location = norm(full.location);
    const haystack = `${username} ${name} ${first} ${last} ${bio} ${location}`;
    if (!tokens.every((token) => haystack.includes(token))) continue;

    let score = 0;
    if (username === q || name === q) score += 1200;
    else if (username.startsWith(q)) score += 900;
    else if (name.startsWith(q)) score += 800;
    else if (username.includes(q)) score += 620;
    else if (name.includes(q)) score += 540;
    else score += 300;
    for (const token of tokens) {
      if (username === token) score += 180;
      else if (username.startsWith(token)) score += 140;
      else if (name.split(/\s+/).some((part) => part.startsWith(token))) score += 110;
      else if (haystack.includes(token)) score += 30;
    }
    const verification = verificationInfo(full)?.active;
    if (verification) score += 24;
    if (isFollowing(state.me?.id, full.id)) score += 45;
    if (isFollowing(full.id, state.me?.id)) score += 35;
    if (isFollowing(state.me?.id, full.id)) score += 45;
    if (isFollowing(full.id, state.me?.id)) score += 35;
    score -= Math.min(30, username.length);
    scored.push({ user: full, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || String(a.user.username).localeCompare(String(b.user.username)))
    .slice(0, limit)
    .map((row) => row.user);
}

/* --------------------------------- shop ---------------------------------- */

export const SHOP_CATEGORIES = [
  { id: 'tecnologia', label: 'Tecnología' },
  { id: 'hogar', label: 'Hogar' },
  { id: 'moda', label: 'Moda' },
  { id: 'vehiculos', label: 'Vehículos' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'arte', label: 'Arte y diseño' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'otros', label: 'Otros' },
];

export const SHOP_CONDITIONS = [
  { id: 'nuevo', label: 'Nuevo' },
  { id: 'como-nuevo', label: 'Como nuevo' },
  { id: 'usado', label: 'Usado' },
  { id: 'repuestos', label: 'Para repuestos' },
];

export const shopCategoryLabel = (category) =>
  SHOP_CATEGORIES.find((item) => item.id === category)?.label || 'Otros';

export const shopConditionLabel = (condition) =>
  SHOP_CONDITIONS.find((item) => item.id === condition)?.label || '';

const normText = (value) => String(value || '')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Publicaciones de Shop filtradas (búsqueda, categoría y vendedor). */
export function shopListings({ query = '', category = 'all', includeSold = true, sellerId = null } = {}) {
  const q = normText(query).trim();
  return state.shopIndex
    .filter((item) => item && item.id)
    .filter((item) => includeSold || item.status !== 'sold')
    .filter((item) => category === 'all' || item.category === category)
    .filter((item) => !sellerId || item.sellerId === sellerId)
    .filter((item) => !q
      || normText(item.title).includes(q)
      || normText(item.location).includes(q)
      || normText(shopCategoryLabel(item.category)).includes(q))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function shopItemById(id) {
  const full = state.shopItems.get(id);
  const light = state.shopIndex.find((item) => item.id === id);
  if (full && light) return { ...light, ...full };
  return full || light || null;
}

export function shopBySeller(userId) {
  return shopListings({ sellerId: userId }).filter((item) => item.status !== 'sold');
}


/* --------------------------- orden del muro ------------------------------ */

const hashSeed = (text) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

function seededRandom(seed) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const byScore = (a, b) => b.score - a.score;

/** Mueve el orden dentro de bloques chicos: da variedad sin perder lo relevante. */
function softShuffle(list, seed, window = 3) {
  if (list.length < 3) return [...list];
  const random = seededRandom(seed);
  const out = [...list];
  for (let start = 1; start < out.length; start += window) {
    const slice = out.slice(start, start + window);
    for (let i = slice.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [slice[i], slice[j]] = [slice[j], slice[i]];
    }
    out.splice(start, slice.length, ...slice);
  }
  return out;
}

/** Mete una publicación de descubrimiento cada `every` publicaciones prioritarias. */
function interleave(primary, secondary, every = 3) {
  const out = [];
  let next = 0;
  for (let i = 0; i < primary.length; i += 1) {
    out.push(primary[i]);
    const canInsert = next < secondary.length && i >= 1 && (i + 1) % every === 0;
    if (canInsert) {
      out.push(secondary[next]);
      next += 1;
    }
  }
  while (next < secondary.length) {
    out.push(secondary[next]);
    next += 1;
  }
  return out;
}

/** Evita dos publicaciones seguidas de la misma persona. */
function avoidSameAuthorStreak(list) {
  const out = [...list];
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].post.authorId !== out[i - 1].post.authorId) continue;
    const limit = Math.min(out.length, i + 4);
    for (let j = i + 1; j < limit; j += 1) {
      if (out[j].post.authorId !== out[i - 1].post.authorId) {
        [out[i], out[j]] = [out[j], out[i]];
        break;
      }
    }
  }
  return out;
}

function feedScore(post, viewerId, seed, now) {
  const created = Date.parse(post.createdAt) || now;
  const hours = Math.max(0, (now - created) / 3_600_000);
  const author = userById(post.authorId);
  const verified = Boolean(verificationInfo(author)?.active);
  const rawRecency = 1 / Math.pow(1 + hours / 9, 1.15);
  // Una cuenta verificada conserva algo de alcance aunque haya publicado
  // hace tiempo; no compite sólo por minutos.
  const recency = verified ? Math.max(rawRecency, 0.36) : rawRecency;
  const reactions = Object.values(post.reactions || {})
    .reduce((sum, value) => sum + (Number(value) || 0), 0);
  const engagement = 1 + Math.log1p(reactions + (Number(post.commentsCount) || 0) * 2.4) * 0.17;
  const mine = post.authorId === viewerId;
  const followed = !mine && isFollowing(viewerId, post.authorId);
  const group = post.groupId ? state.groups.find((item) => item.id === post.groupId) : null;
  const inMyGroup = Boolean(group && viewerId && (group.memberIds || []).includes(viewerId));
  const affinity = mine ? 1.3 : followed ? 1.55 : inMyGroup ? 1.12 : 1;
  const mediaBonus = (post.media || []).length ? 1.03 : 1;
  const verifiedBoost = verified ? 1.3 : 1;
  const jitter = 0.9 + (hashSeed(`${post.id}:${seed}`) % 100) / 500;
  return {
    post,
    mine,
    followed,
    inMyGroup,
    verified,
    score: recency * engagement * affinity * mediaBonus * verifiedBoost * jitter,
  };
}

/**
 * Orden del muro estilo Facebook:
 * — lo tuyo, lo de las personas que seguís y lo de tus grupos tiene prioridad;
 * — esa prioridad NO queda en orden cronológico: se mezcla en bloques chicos;
 * — entre medio entran publicaciones de gente que no seguís (marcadas como
 *   sugerencia), para que el muro siempre tenga cosas nuevas;
 * — se evita que aparezcan dos publicaciones seguidas de la misma persona.
 *
 * @returns {Array<{post: object, suggested: boolean}>}
 */
export function feedOrder(viewerId, seed = 1, { mode = 'foryou' } = {}) {
  const now = Date.now();
  const entries = [...state.posts.values()]
    .filter((post) => canSeePost(post, viewerId))
    .map((post) => feedScore(post, viewerId, seed, now));

  if (mode === 'following') {
    return entries
      .filter((entry) => entry.mine || entry.followed)
      .sort((a, b) => new Date(b.post.createdAt) - new Date(a.post.createdAt))
      .map((entry) => ({ post: entry.post, suggested: false }));
  }

  const priority = entries.filter((entry) => entry.mine || entry.followed || entry.inMyGroup);
  const discovery = entries.filter((entry) => !entry.mine && !entry.followed && !entry.inMyGroup);

  if (!priority.length) {
    return softShuffle([...discovery].sort(byScore), seed + 7, 4)
      .map((entry) => ({ post: entry.post, suggested: true }));
  }

  const primary = softShuffle([...priority].sort(byScore), seed, 4);
  const secondary = softShuffle([...discovery].sort(byScore), seed + 7, 4);
  return avoidSameAuthorStreak(interleave(primary, secondary, 3)).map((entry) => ({
    post: entry.post,
    suggested: !entry.mine && !entry.followed && !entry.inMyGroup,
  }));
}

/** Compatibilidad: sólo la lista de publicaciones. */
export function rankedFeed(viewerId, seed = 1, options = {}) {
  return feedOrder(viewerId, seed, options).map((entry) => entry.post);
}

/* --------------------------------- arranque ------------------------------ */

export async function bootData() {
  await Promise.all([
    loadUserIndex({ fresh: true }),
    loadFeedIndex({ fresh: true }),
    loadShopIndex({ fresh: true }),
  ]);
  if (state.me) {
    await Promise.all([
      loadLikes(state.me.id),
      loadFollowing(state.me.id),
      loadFollowers(state.me.id),
      loadNotifications(state.me.id),
      loadInbox(state.me.id),
      loadGroups(),
      loadStories(),
      loadReels(),
    ]);
  }
  await loadFeedPage({ reset: true });
  await loadDiscoveryPage(state.me?.id);
  state.ready = true;
  notify('ready');
}

export async function refreshAll() {
  bumpVersion();
  await Promise.all([
    loadUserIndex({ fresh: true }),
    loadFeedIndex({ fresh: true }),
    loadShopIndex({ fresh: true }),
    loadGroups(),
    loadStories(),
    loadReels(),
  ]);
  if (state.me) {
    await Promise.all([
      loadLikes(state.me.id),
      loadFollowing(state.me.id),
      loadFollowers(state.me.id),
      loadNotifications(state.me.id),
      loadInbox(state.me.id),
    ]);
  }
  await loadFeedPage({ reset: true });
  await loadDiscoveryPage(state.me?.id);
  notify('refresh');
}
