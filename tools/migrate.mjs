/* ==========================================================================
   migrate.mjs — pasa los datos del formato viejo (archivos únicos) al nuevo
   (un archivo por cosa). Es solo para desarrollo/pruebas.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return null; }
};
const write = (rel, data) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const usersDoc = read('data/usuarios.json');
const feedDoc = read('data/feed.json');
const commentsDoc = read('data/comentarios.json');

const users = usersDoc?.users || [];
const posts = feedDoc?.posts || [];
const comments = commentsDoc?.comments || [];

const cleanUser = (user) => {
  const copy = { ...user };
  delete copy.friendIds;
  delete copy.following;
  delete copy.followers;
  delete copy.savedPostIds;
  copy.saved = copy.saved || [];
  if (!copy.firstName && copy.name) {
    const parts = String(copy.name).trim().split(/\s+/);
    copy.firstName = parts.shift() || '';
    copy.lastName = parts.join(' ') || '';
  }
  return copy;
};

// usuarios
write('data/usuarios/index.json', {
  version: 1,
  users: users.map((user) => ({
    id: user.id, username: user.username, name: user.name, avatar: user.avatar || null, createdAt: user.createdAt,
  })),
});
for (const user of users) {
  write(`data/usuarios/${user.id}.json`, { version: 1, user: cleanUser(user) });
}

// publicaciones
const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
write('data/feed/index.json', {
  version: 1,
  posts: sorted.slice(0, 200).map((post) => ({
    id: post.id, authorId: post.authorId, createdAt: post.createdAt,
  })),
});

const likesByUser = new Map();
for (const post of posts) {
  const counts = {};
  const reactions = post.reactions || {};
  for (const [userId, type] of Object.entries(reactions)) {
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
    if (!likesByUser.has(userId)) likesByUser.set(userId, {});
    likesByUser.get(userId)[post.id] = type;
  }
  const commentCount = comments.filter((comment) => comment.postId === post.id).length;
  const { reactions: _drop, ...rest } = post;
  write(`data/feed/${post.id}.json`, {
    version: 1,
    post: { ...rest, reactions: counts, commentsCount: commentCount },
  });
}

// reacciones por persona
for (const user of users) {
  write(`data/likes/${user.id}.json`, { version: 1, likes: likesByUser.get(user.id) || {} });
}

// comentarios
const byPost = new Map();
for (const comment of comments) {
  if (!byPost.has(comment.postId)) byPost.set(comment.postId, []);
  byPost.get(comment.postId).push(comment);
}
for (const [postId, list] of byPost) {
  write(`data/comentarios/${postId}/index.json`, {
    version: 1,
    comments: list.map((comment) => ({
      id: comment.id, authorId: comment.authorId, parentId: comment.parentId || null, createdAt: comment.createdAt,
    })),
  });
  for (const comment of list) {
    write(`data/comentarios/${postId}/${comment.id}.json`, {
      version: 1,
      comment: {
        ...comment,
        parentId: comment.parentId || null,
        likes: 0,
      },
    });
  }
}

// seguidos y seguidores (de los dos lados)
const followers = new Map(users.map((user) => [user.id, []]));
for (const user of users) {
  const following = user.following || user.friendIds || [];
  write(`data/siguiendo/${user.id}.json`, { version: 1, following });
  for (const target of following) {
    if (!followers.has(target)) followers.set(target, []);
    followers.get(target).push(user.id);
  }
}
for (const [userId, list] of followers) {
  write(`data/seguidores/${userId}.json`, { version: 1, followers: list });
}

// notificaciones de ejemplo para la cuenta demo
if (users.some((user) => user.id === 'u_demo')) {
  const now = Date.now();
  const items = [
    { id: 'n_1', type: 'follow', actorId: 'u_carlos', createdAt: new Date(now - 8 * 60000).toISOString(), read: false },
    { id: 'n_2', type: 'reaction', actorId: 'u_ana', postId: sorted[0]?.id, reaction: 'love', createdAt: new Date(now - 22 * 60000).toISOString(), read: false },
    { id: 'n_3', type: 'comment', actorId: 'u_luis', postId: sorted[0]?.id, createdAt: new Date(now - 60 * 60000).toISOString(), read: true },
  ].filter((item) => item.postId !== undefined || item.type === 'follow');
  write('data/notificaciones/u_demo.json', { version: 1, items });
}

// limpiar los archivos viejos
for (const rel of ['data/usuarios.json', 'data/feed.json', 'data/comentarios.json',
  'data/conversaciones.json', 'data/solicitudes.json']) {
  const file = path.join(ROOT, rel);
  if (fs.existsSync(file)) fs.rmSync(file);
}
const messages = path.join(ROOT, 'data/mensajes');
if (fs.existsSync(messages)) fs.rmSync(messages, { recursive: true, force: true });

console.log(`Migrado: ${users.length} usuarios, ${posts.length} publicaciones, ${comments.length} comentarios.`);
