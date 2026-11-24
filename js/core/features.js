/* Interruptores de funciones leídos de config.js. */
const config = (typeof window !== 'undefined' && window.NIMBOOK_CONFIG) || {};

export const FEATURES = {
  // Los videos de historias quedan desactivados por ahora. El código, las
  // credenciales de R2 y los archivos existentes se conservan intactos.
  videoStories: Boolean(config.features?.videoStories),
};
