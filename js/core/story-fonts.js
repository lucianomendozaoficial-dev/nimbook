/* ==========================================================================
   story-fonts.js — fuentes disponibles para el texto de las historias
   ========================================================================== */

export const STORY_FONTS = [
  { id: 'clasica', label: 'Clásica', sample: 'Aa' },
  { id: 'manuscrita', label: 'Manuscrita', sample: 'Aa' },
  { id: 'serif', label: 'Serif', sample: 'Aa' },
  { id: 'moderna', label: 'Moderna', sample: 'AA' },
  { id: 'neon', label: 'Neón', sample: 'Aa' },
];

export function storyFontClass(id) {
  const found = STORY_FONTS.some((font) => font.id === id);
  return `story-font-${found ? id : 'clasica'}`;
}

export function storyFontLabel(id) {
  return STORY_FONTS.find((font) => font.id === id)?.label || 'Clásica';
}
