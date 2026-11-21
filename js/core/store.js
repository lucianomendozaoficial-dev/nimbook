/* ==========================================================================
   store.js — estado en memoria y lecturas (todo por CDN, sin token)
   ========================================================================== */
import {
  configure, fetchDoc, cachePeek, cachePut, onWrite, bumpVersion,
} from './net.js';
import { P } from './paths.js';

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
  notifications: [],

  ui: {
    unreadNotifs: 0,
    lastSync: 0,
    online: true,
  },
};

const listeners = new Set();

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
  onWrite((path) => {
    if (path === P.userIndex) {
      const doc = cachePeek(path);
      state.userIndex = doc?.users || [];
    }
    if (state.me && path === P.likes(state.me.id)) {
      const doc = cachePeek(path);
      state.likes = doc?.likes || {};
    }
    if (state.me && path === P.following(state.me.id)) {
      const doc = cachePeek(path);
      state.following = new Set(doc?.following || []);
    }
    if (state.me && path === P.followers(state.me.id)) {
      const doc = cachePeek(path);
      state.followers = new Set(doc?.followers || []);
    }
    notify('write', { path });
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
  notify('feed');
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
  return state.notifications;
}

export async function loadGroups() {
  const doc = await docJson(P.groups);
  state.groups = doc?.groups || [];
  return state.groups;
}

export async function loadStories() {
  const doc = await docJson(P.stories);
  const now = Date.now();
  state.stories = (doc?.stories || []).filter((story) =>
    story.createdAt && now - new Date(story.createdAt).getTime() < 24 * 3600 * 1000);
  return state.stories;
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

export function displayName(user) {
  if (!user) return 'Usuario';
  return user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Usuario';
}

export function initialsOf(user) {
  const name = displayName(user).trim();
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
  return state.userIndex
    .filter((user) => user.id !== viewerId && !isFollowing(viewerId, user.id))
    .slice(0, limit)
    .map((user) => state.users.get(user.id) || user);
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

export function storiesGrouped(viewerId) {
  const byUser = new Map();
  for (const story of state.stories) {
    if (!byUser.has(story.userId)) byUser.set(story.userId, []);
    byUser.get(story.userId).push(story);
  }
  const groups = [];
  for (const [userId, list] of byUser) {
    const user = userById(userId);
    if (!user) continue;
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    groups.push({ user, stories: list, latest: list[0] });
  }
  groups.sort((a, b) => {
    const score = (group) => (group.user.id === viewerId ? 2 : (isFollowing(viewerId, group.user.id) ? 1 : 0));
    return score(b) - score(a) || new Date(b.latest.createdAt) - new Date(a.latest.createdAt);
  });
  return groups;
}

export function searchEverything(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { users: [], posts: [], groups: [] };
  return {
    users: state.userIndex
      .filter((user) => user.name?.toLowerCase().includes(q) || user.username?.toLowerCase().includes(q))
      .slice(0, 20),
    posts: [...state.posts.values()]
      .filter((post) => post.text?.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20),
    groups: state.groups.filter((group) =>
      group.name?.toLowerCase().includes(q) || group.description?.toLowerCase().includes(q)).slice(0, 20),
  };
}

/* --------------------------------- arranque ------------------------------ */

export async function bootData() {
  await Promise.all([loadUserIndex(), loadFeedIndex()]);
  if (state.me) {
    await Promise.all([
      loadLikes(state.me.id),
      loadFollowing(state.me.id),
      loadFollowers(state.me.id),
      loadNotifications(state.me.id),
      loadGroups(),
      loadStories(),
    ]);
  }
  await loadFeedPage({ reset: true });
  state.ready = true;
  notify('ready');
}

export async function refreshAll() {
  bumpVersion();
  await Promise.all([
    loadUserIndex({ fresh: true }),
    loadFeedIndex({ fresh: true }),
    loadGroups(),
    loadStories(),
  ]);
  if (state.me) {
    await Promise.all([
      loadLikes(state.me.id),
      loadFollowing(state.me.id),
      loadFollowers(state.me.id),
      loadNotifications(state.me.id),
    ]);
  }
  await loadFeedPage({ reset: true });
  notify('refresh');
}
