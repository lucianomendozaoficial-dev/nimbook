/* ==========================================================================
   store.js — estado global, carga de datos, índices y selectores
   ========================================================================== */
import { Db, asList } from './db.js';
import { makeClient } from './gh.js';
import { parseTicks } from './util.js';

export const PATHS = {
  users: 'data/usuarios.json',
  posts: 'data/feed.json',
  comments: 'data/comentarios.json',
  friends: 'data/solicitudes.json',
  conversations: 'data/conversaciones.json',
  groups: 'data/grupos.json',
  stories: 'data/historias.json',
};

export const notifPath = (userId) => `data/notificaciones/${userId}.json`;
export const chatPath = (conversationId) => `data/mensajes/${conversationId}.json`;

export const SCHEMA = {
  users: { key: 'users', empty: () => ({ version: 1, users: [] }) },
  posts: { key: 'posts', empty: () => ({ version: 1, posts: [] }) },
  comments: { key: 'comments', empty: () => ({ version: 1, comments: [] }) },
  friends: { key: 'friends', empty: () => ({ version: 1, requests: [] }) },
  conversations: { key: 'conversations', empty: () => ({ version: 1, conversations: [] }) },
  groups: { key: 'groups', empty: () => ({ version: 1, groups: [] }) },
  stories: { key: 'stories', empty: () => ({ version: 1, stories: [] }) },
};

export const state = {
  cfg: null,
  gh: null,
  db: null,
  me: null,
  users: [],
  posts: [],
  comments: [],
  requests: [],
  conversations: [],
  groups: [],
  stories: [],
  notifications: [],
  chats: new Map(),
  indexes: {
    usersById: new Map(),
    usersByName: new Map(),
    commentsByPost: new Map(),
    friendsOf: new Map(),
    requestsTo: new Map(),
    requestsFrom: new Map(),
    postsByAuthor: new Map(),
  },
  status: {
    booting: true,
    ready: false,
    error: null,
    lastSync: 0,
    offline: false,
    syncing: false,
  },
  theme: 'light',
  route: { name: 'feed', params: {} },
  ui: { unreadNotifs: 0, unreadChats: 0, reactionOverrides: new Map(), sending: false },
};

/* ------------------------------ pub/sub --------------------------------- */

const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function notify(topic = 'data', detail = {}) {
  for (const fn of subscribers) {
    try { fn(topic, detail); } catch (err) { console.error('[store] subscriber', err); }
  }
}

/* ------------------------------ arranque -------------------------------- */

export function attach(cfg) {
  state.cfg = cfg;
  state.gh = makeClient(cfg);
  state.db = new Db(state.gh);
  state.db.on('change', ({ path, data }) => {
    if (path.startsWith('data/notificaciones/')) {
      if (state.me && path === notifPath(state.me.id)) {
        state.notifications = asList(data, 'items');
        updateUnread();
      }
    } else if (path.startsWith('data/mensajes/')) {
      const cid = path.split('/').pop().replace('.json', '');
      state.chats.set(cid, asList(data, 'messages'));
    }
    syncFromDb();
    notify('change', { path });
  });
  state.db.on('error', ({ error }) => {
    if (error?.code === 'network') {
      state.status.offline = true;
      notify('offline', { error });
    }
  });
  return state.db;
}

export function hydrateCache() {
  if (!state.db) return false;
  let any = false;
  for (const path of Object.values(PATHS)) {
    if (state.db.hydrate(path)) any = true;
  }
  if (state.me) {
    state.db.hydrate(notifPath(state.me.id));
  }
  if (any) {
    syncFromDb();
    return true;
  }
  return false;
}

function buildIndexes() {
  const idx = state.indexes;
  idx.usersById = new Map();
  idx.usersByName = new Map();
  idx.commentsByPost = new Map();
  idx.friendsOf = new Map();
  idx.requestsTo = new Map();
  idx.requestsFrom = new Map();
  idx.postsByAuthor = new Map();

  for (const user of state.users) {
    idx.usersById.set(user.id, user);
    if (user.username) idx.usersByName.set(user.username.toLowerCase(), user);
    idx.friendsOf.set(user.id, new Set(user.friendIds || []));
  }
  for (const comment of state.comments) {
    if (!idx.commentsByPost.has(comment.postId)) idx.commentsByPost.set(comment.postId, []);
    idx.commentsByPost.get(comment.postId).push(comment);
  }
  for (const request of state.requests) {
    if (request.status && request.status !== 'pending') continue;
    if (!idx.requestsTo.has(request.to)) idx.requestsTo.set(request.to, []);
    if (!idx.requestsFrom.has(request.from)) idx.requestsFrom.set(request.from, []);
    idx.requestsTo.get(request.to).push(request);
    idx.requestsFrom.get(request.from).push(request);
  }
  for (const post of state.posts) {
    if (!idx.postsByAuthor.has(post.authorId)) idx.postsByAuthor.set(post.authorId, []);
    idx.postsByAuthor.get(post.authorId).push(post);
  }
  for (const list of idx.commentsByPost.values()) {
    list.sort((a, b) => parseTicks(a.createdAt) - parseTicks(b.createdAt));
  }
}

export function syncFromDb() {
  if (!state.db) return;
  const usersDoc = state.db.peek(PATHS.users);
  const postsDoc = state.db.peek(PATHS.posts);
  const commentsDoc = state.db.peek(PATHS.comments);
  const friendsDoc = state.db.peek(PATHS.friends);
  const convDoc = state.db.peek(PATHS.conversations);
  const groupsDoc = state.db.peek(PATHS.groups);
  const storiesDoc = state.db.peek(PATHS.stories);

  state.users = asList(usersDoc, 'users');
  state.posts = asList(postsDoc, 'posts');
  state.comments = asList(commentsDoc, 'comments');
  state.requests = asList(friendsDoc, 'requests');
  state.conversations = asList(convDoc, 'conversations');
  state.groups = asList(groupsDoc, 'groups');
  state.stories = asList(storiesDoc, 'stories').filter(isStoryAlive);

  if (state.me) {
    const fresh = state.users.find((u) => u.id === state.me.id);
    if (fresh) state.me = fresh;
    else state.me = null;
    if (state.me) {
      const notifDoc = state.db.peek(notifPath(state.me.id));
      state.notifications = asList(notifDoc, 'items');
    }
  }

  state.status.lastSync = Date.now();
  buildIndexes();
  updateUnread();
}

function isStoryAlive(story) {
  if (!story?.createdAt) return false;
  return Date.now() - parseTicks(story.createdAt) < 24 * 3600 * 1000;
}

function updateUnread() {
  if (!state.me) {
    state.ui.unreadNotifs = 0;
    state.ui.unreadChats = 0;
    return;
  }
  state.ui.unreadNotifs = state.notifications.filter((n) => !n.read).length;
  let chats = 0;
  for (const conv of state.conversations) {
    if (!conv.memberIds?.includes(state.me.id)) continue;
    const reads = conv.reads?.[state.me.id] || 0;
    if ((conv.lastMessage?.at || 0) > reads && conv.lastMessage?.senderId !== state.me.id) chats += 1;
  }
  state.ui.unreadChats = chats;
}

/* ------------------------------ carga ----------------------------------- */

export async function loadCore({ revalidate = true } = {}) {
  if (!state.db) return;
  const paths = Object.values(PATHS);
  if (state.me) paths.push(notifPath(state.me.id));
  state.status.syncing = true;
  try {
    // Con `revalidate` se usa el ETag: si nada cambió, GitHub responde 304 y no gasta cuota.
    await state.db.loadMany(paths, revalidate ? { revalidate: true } : {});
    syncFromDb();
    state.status.ready = true;
    state.status.booting = false;
    state.status.error = null;
    notify('data');
  } catch (err) {
    state.status.error = err.message;
    notify('error', { error: err });
  } finally {
    state.status.syncing = false;
    state.status.offline = Boolean(state.db?.offline);
  }
}

export async function refreshUserData() {
  if (!state.db || !state.me) return;
  await state.db.loadMany([notifPath(state.me.id), PATHS.conversations, PATHS.friends], { revalidate: true });
  syncFromDb();
  notify('data');
}

export async function refreshFeed() {
  if (!state.db) return;
  await state.db.loadMany([PATHS.posts, PATHS.comments, PATHS.users], { revalidate: true });
  syncFromDb();
  notify('data');
}

/* ------------------------------ selectores ------------------------------ */

export const userById = (id) => state.indexes.usersById.get(id) || null;
export const userByUsername = (username) =>
  state.indexes.usersByName.get(String(username || '').toLowerCase()) || null;

export function displayName(user) {
  return user?.name || user?.username || 'Usuario';
}

export function initialsOf(user) {
  const name = displayName(user);
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const isFriend = (a, b) => Boolean(state.indexes.friendsOf.get(a)?.has(b));

export function friendsOf(userId) {
  const ids = state.indexes.friendsOf.get(userId);
  if (!ids) return [];
  return [...ids].map(userById).filter(Boolean);
}

export function mutualFriends(a, b) {
  const sa = state.indexes.friendsOf.get(a);
  const sb = state.indexes.friendsOf.get(b);
  if (!sa || !sb) return [];
  const out = [];
  for (const id of sa) if (sb.has(id)) out.push(userById(id));
  return out.filter(Boolean);
}

export function incomingRequests(userId) {
  return (state.indexes.requestsTo.get(userId) || []).filter((r) => (r.status || 'pending') === 'pending');
}

export function outgoingRequests(userId) {
  return (state.indexes.requestsFrom.get(userId) || []).filter((r) => (r.status || 'pending') === 'pending');
}

export function requestBetween(a, b) {
  if (!a || !b) return null;
  return state.requests.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) || null;
}

/** Relación del usuario `me` con `other`. */
export function relationWith(meId, otherId) {
  if (!meId || !otherId) return 'none';
  if (meId === otherId) return 'self';
  if (isFriend(meId, otherId)) return 'friends';
  const req = requestBetween(meId, otherId);
  if (req && (req.status || 'pending') === 'pending') {
    return req.from === meId ? 'requested' : 'incoming';
  }
  return 'none';
}

export function friendCount(userId) {
  return state.indexes.friendsOf.get(userId)?.size || 0;
}

export function postsByAuthor(userId) {
  return (state.indexes.postsByAuthor.get(userId) || [])
    .slice()
    .sort((a, b) => parseTicks(b.createdAt) - parseTicks(a.createdAt));
}

export function canSeePost(post, viewerId) {
  if (!post) return false;
  if (post.groupId) {
    const group = state.groups.find((g) => g.id === post.groupId);
    if (!group) return false;
    if (group.privacy === 'public') return true;
    return Boolean(viewerId && (group.memberIds || []).includes(viewerId));
  }
  if (post.authorId === viewerId) return true;
  const privacy = post.privacy || 'public';
  if (privacy === 'public') return true;
  if (privacy === 'friends') return Boolean(viewerId) && isFriend(post.authorId, viewerId);
  return false;
}

export function feedPosts(viewerId) {
  return state.posts
    .filter((post) => canSeePost(post, viewerId))
    .sort((a, b) => parseTicks(b.createdAt) - parseTicks(a.createdAt));
}

export function commentsFor(postId) {
  return state.indexes.commentsByPost.get(postId) || [];
}

export function rootComments(postId) {
  return commentsFor(postId).filter((c) => !c.parentId);
}

export function repliesTo(commentId) {
  return state.comments
    .filter((c) => c.parentId === commentId)
    .sort((a, b) => parseTicks(a.createdAt) - parseTicks(b.createdAt));
}

export function reactionSummary(post) {
  const reactions = { ...(post?.reactions || {}) };
  const me = state.me?.id;
  const override = me ? state.ui.reactionOverrides.get(post.id) : undefined;
  if (me && override !== undefined) {
    if (override) reactions[me] = override;
    else delete reactions[me];
  }
  const entries = Object.entries(reactions);
  const counts = {};
  for (const [, type] of entries) counts[type] = (counts[type] || 0) + 1;
  const order = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
  const types = order.filter((t) => counts[t]).sort((a, b) => counts[b] - counts[a]);
  return { total: entries.length, counts, types, mine: me ? reactions[me] || null : null };
}

export function conversationFor(userA, userB) {
  return state.conversations.find((c) =>
    c.memberIds?.length === 2 && c.memberIds.includes(userA) && c.memberIds.includes(userB)) || null;
}

export function conversationsFor(userId) {
  return state.conversations
    .filter((c) => c.memberIds?.includes(userId))
    .map((c) => ({
      ...c,
      other: state.users.find((u) => c.memberIds.includes(u.id) && u.id !== userId) || null,
    }))
    .sort((a, b) => parseTicks(b.updatedAt || b.lastMessage?.at) - parseTicks(a.updatedAt || a.lastMessage?.at));
}

export function unreadCountIn(conv, userId) {
  const reads = conv.reads?.[userId] || 0;
  if (!conv.lastMessage || conv.lastMessage.senderId === userId) return 0;
  return (conv.lastMessage.at || 0) > reads ? 1 : 0;
}

export function userPhotos(userId) {
  const photos = [];
  for (const post of postsByAuthor(userId)) {
    for (const media of post.media || []) photos.push({ ...media, postId: post.id });
  }
  return photos;
}

export function allPhotos(viewerId) {
  const photos = [];
  const posts = viewerId
    ? state.posts.filter((p) => canSeePost(p, viewerId))
    : state.posts;
  for (const post of posts) {
    for (const media of post.media || []) photos.push({ ...media, postId: post.id });
  }
  return photos.sort((a, b) => 0);
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
    if (userId !== viewerId && !isFriend(userId, viewerId) && (user.privacyFriendsOnly ?? false)) continue;
    list.sort((a, b) => parseTicks(b.createdAt) - parseTicks(a.createdAt));
    groups.push({ user, stories: list, latest: list[0] });
  }
  groups.sort((a, b) => parseTicks(b.latest.createdAt) - parseTicks(a.latest.createdAt));
  return groups;
}

export function friendSuggestions(viewerId, limit = 12) {
  if (!viewerId) return [];
  const mine = state.indexes.friendsOf.get(viewerId) || new Set();
  return state.users
    .filter((u) => u.id !== viewerId && !mine.has(u.id) && !requestBetween(viewerId, u.id))
    .sort((a, b) => mutualFriends(viewerId, b.id).length - mutualFriends(viewerId, a.id).length)
    .slice(0, limit);
}

export function searchEverything(query, viewerId) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { users: [], posts: [], groups: [] };
  return {
    users: state.users.filter((u) =>
      u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)).slice(0, 20),
    posts: state.posts
      .filter((p) => canSeePost(p, viewerId) && p.text?.toLowerCase().includes(q))
      .sort((a, b) => parseTicks(b.createdAt) - parseTicks(a.createdAt))
      .slice(0, 20),
    groups: state.groups.filter((g) =>
      g.name?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)).slice(0, 20),
  };
}
