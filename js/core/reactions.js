/* ==========================================================================
   reactions.js — reacciones con iconos propios (círculos con glifo blanco)
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

const LIKE = '#0866ff';
const LOVE = '#f0335a';
const HAHA = '#f7b125';
const WOW = '#f7b125';
const SAD = '#f7b125';
const ANGRY = '#e9710f';

export const REACTION_ORDER = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

export const REACTIONS = {
  like: {
    label: 'Me gusta',
    color: LIKE,
    emoji: '👍',
    svg: `<circle cx="16" cy="16" r="16" fill="${LIKE}"/>
      <path d="M13.6 15.1 16.9 9c.3-.6.9-1 1.6-1h.4c1 0 1.8.8 1.8 1.8v3.4h3.1c1.1 0 2 1 1.8 2.1l-.9 5.2a1.9 1.9 0 0 1-1.9 1.6h-9.2z" fill="#fff"/>
      <rect x="7.6" y="15" width="3.9" height="8.3" rx="1.2" fill="#fff"/>`,
  },
  love: {
    label: 'Me encanta',
    color: LOVE,
    emoji: '❤️',
    svg: `<circle cx="16" cy="16" r="16" fill="${LOVE}"/>
      <path d="M16 24.2s-7.4-4.5-7.4-9.4a4.3 4.3 0 0 1 7.4-3 4.3 4.3 0 0 1 7.4 3c0 4.9-7.4 9.4-7.4 9.4z" fill="#fff"/>`,
  },
  haha: {
    label: 'Me divierte',
    color: HAHA,
    emoji: '😂',
    svg: `<circle cx="16" cy="16" r="16" fill="${HAHA}"/>
      <path d="M9.4 13.4c.7-1.5 2-2.3 3.4-2.3s2.7.8 3.4 2.3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M15.8 13.4c.7-1.5 2-2.3 3.4-2.3s2.7.8 3.4 2.3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M9.6 17.6h12.8c-.7 3.9-3.3 6.2-6.4 6.2s-5.7-2.3-6.4-6.2z" fill="#fff"/>
      <path d="M12.2 18.9h7.6" stroke="${HAHA}" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  wow: {
    label: 'Me asombra',
    color: WOW,
    emoji: '😮',
    svg: `<circle cx="16" cy="16" r="16" fill="${WOW}"/>
      <circle cx="11.4" cy="13.6" r="1.7" fill="#fff"/>
      <circle cx="20.6" cy="13.6" r="1.7" fill="#fff"/>
      <ellipse cx="16" cy="21.2" rx="3.6" ry="4.2" fill="#fff"/>
      <ellipse cx="16" cy="22" rx="2.1" ry="2.6" fill="#c2410c" opacity=".55"/>`,
  },
  sad: {
    label: 'Me entristece',
    color: SAD,
    emoji: '😢',
    svg: `<circle cx="16" cy="16" r="16" fill="${SAD}"/>
      <circle cx="11.6" cy="14" r="1.6" fill="#fff"/>
      <circle cx="20.4" cy="14" r="1.6" fill="#fff"/>
      <path d="M11.4 22.4c1.2-2.1 2.8-3.2 4.6-3.2s3.4 1.1 4.6 3.2" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round"/>
      <path d="M22.6 16.2c.9 1.5 1.4 2.6 1.4 3.3a1.9 1.9 0 0 1-3.8 0c0-.7.5-1.8 1.4-3.3z" fill="#fff" opacity=".92"/>`,
  },
  angry: {
    label: 'Me enfada',
    color: ANGRY,
    emoji: '😡',
    svg: `<circle cx="16" cy="16" r="16" fill="${ANGRY}"/>
      <path d="M8.9 12.1l5 1.5M23.1 12.1l-5 1.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <circle cx="11.6" cy="15.6" r="1.6" fill="#fff"/>
      <circle cx="20.4" cy="15.6" r="1.6" fill="#fff"/>
      <path d="M11.4 22.6c1.3-1.7 2.8-2.6 4.6-2.6s3.3.9 4.6 2.6" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round"/>`,
  },
};

export function reactionSvg(type, size = 24) {
  const reaction = REACTIONS[type] || REACTIONS.like;
  return `<svg class="reaction-svg" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false">${reaction.svg}</svg>`;
}

export function reactionIcon(type, size = 24, opts = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `reaction-svg ${opts.className || ''}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = (REACTIONS[type] || REACTIONS.like).svg;
  return svg;
}

export const reactionLabel = (type) => (REACTIONS[type] || REACTIONS.like).label;
