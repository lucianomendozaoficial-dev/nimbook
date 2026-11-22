/* ==========================================================================
   paths.js — rutas de los archivos de datos
   ========================================================================== */

export const P = {
  userIndex: 'data/usuarios/index.json',
  user: (id) => `data/usuarios/${id}.json`,

  feedIndex: 'data/feed/index.json',
  post: (id) => `data/feed/${id}.json`,

  likes: (userId) => `data/likes/${userId}.json`,

  commentsIndex: (postId) => `data/comentarios/${postId}/index.json`,
  comment: (postId, commentId) => `data/comentarios/${postId}/${commentId}.json`,

  following: (userId) => `data/siguiendo/${userId}.json`,
  followers: (userId) => `data/seguidores/${userId}.json`,

  notifications: (userId) => `data/notificaciones/${userId}.json`,

  groups: 'data/grupos.json',
  stories: 'data/historias.json',

  /* Shop (mercado) */
  shopIndex: 'data/tienda/index.json',
  shopItem: (id) => `data/tienda/${id}.json`,

  /* Mensajes privados: bandeja de cada persona e hilo compartido */
  inbox: (userId) => `data/mensajes/bandejas/${userId}.json`,
  thread: (threadId) => `data/mensajes/hilos/${threadId}.json`,

  /* Soporte, verificaciones y reportes */
  supportVerifications: 'data/soporte/verificaciones.json',
  supportReports: 'data/soporte/reportes.json',
  supportUser: 'u_support',
};
