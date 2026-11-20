/* ==========================================================================
   illustrations.js — ilustraciones vectoriales de NimbookGR
   ========================================================================== */

const HEART = 'M12 21s-8-5.1-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 15.9 12 21 12 21z';

function heart(x, y, size, color, opacity = 1) {
  const scale = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity}">
    <path d="${HEART}" fill="${color}"/></g>`;
}

function sparkle(x, y, size, color, opacity = 0.9) {
  return `<path d="M${x} ${y}l${size * 0.35} ${size * 0.65}-${size * 0.35} ${size * 0.65}-${size * 0.35}-${size * 0.65}z"
    fill="${color}" opacity="${opacity}" transform="rotate(45 ${x} ${y})"/>`;
}

/** Escena de bienvenida para la pantalla de acceso. */
export function welcomeIllustration() {
  return `<svg viewBox="0 0 520 430" role="img" aria-label="Personas compartiendo publicaciones" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="nb-photo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4facfe"/><stop offset="1" stop-color="#00c6a2"/>
    </linearGradient>
    <linearGradient id="nb-avatar" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#c084fc"/>
    </linearGradient>
    <linearGradient id="nb-avatar2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#fbbf24"/>
    </linearGradient>
    <filter id="nb-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#0b1b3a" flood-opacity="0.18"/>
    </filter>
  </defs>

  <circle cx="410" cy="86" r="52" fill="#ffffff" opacity="0.10"/>
  <circle cx="86" cy="330" r="38" fill="#ffffff" opacity="0.10"/>
  <circle cx="462" cy="300" r="16" fill="#ffd166" opacity="0.85"/>

  <g transform="translate(96 54)" filter="url(#nb-shadow)">
    <rect width="300" height="316" rx="26" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <circle cx="42" cy="44" r="20" fill="url(#nb-avatar)"/>
    <circle cx="52" cy="54" r="8" fill="#ffffff"/>
    <rect x="74" y="30" width="118" height="12" rx="6" fill="#1f2937" opacity="0.85"/>
    <rect x="74" y="50" width="72" height="9" rx="4.5" fill="#94a3b8"/>
    <rect x="22" y="82" width="256" height="132" rx="18" fill="url(#nb-photo)"/>
    <circle cx="238" cy="112" r="22" fill="#ffe9a8" opacity="0.95"/>
    <path d="M22 176l54-46a16 16 0 0 1 21 0l48 40 32-26a16 16 0 0 1 20 0l41 34v18H22z" fill="#0f766e" opacity="0.35"/>
    <rect x="22" y="232" width="196" height="12" rx="6" fill="#334155" opacity="0.75"/>
    <rect x="22" y="254" width="140" height="12" rx="6" fill="#cbd5e1"/>

    <g transform="translate(28 282)">
      <rect width="58" height="26" rx="13" fill="#e8f1ff"/>
      <g transform="translate(8 5)">${heart(0, 0, 16, '#0866FF')}</g>
      <rect x="30" y="9" width="20" height="8" rx="4" fill="#0866FF" opacity="0.7"/>
    </g>
    <g transform="translate(96 282)">
      <rect width="52" height="26" rx="13" fill="#f1f5f9"/>
      <circle cx="14" cy="13" r="6" fill="#94a3b8"/>
      <rect x="26" y="9" width="18" height="8" rx="4" fill="#cbd5e1"/>
    </g>
  </g>

  <g transform="translate(352 176)" filter="url(#nb-shadow)">
    <rect width="132" height="76" rx="22" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <path d="M28 76l-2 20 22-20z" fill="#ffffff"/>
    <circle cx="34" cy="38" r="13" fill="url(#nb-avatar2)"/>
    <rect x="56" y="28" width="52" height="9" rx="4.5" fill="#1f2937" opacity="0.75"/>
    <rect x="56" y="44" width="34" height="8" rx="4" fill="#cbd5e1"/>
  </g>

  <g transform="translate(56 128)" filter="url(#nb-shadow)">
    <rect width="86" height="58" rx="18" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <circle cx="28" cy="29" r="15" fill="#e8f1ff"/>
    <path d="M21 29l5 5 10-11" stroke="#0866FF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="52" y="20" width="22" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="52" y="34" width="16" height="8" rx="4" fill="#e2e8f0"/>
  </g>

  ${heart(398, 128, 26, '#ff5c8a')}
  ${heart(452, 214, 18, '#ff8fab', 0.9)}
  ${heart(60, 246, 16, '#ffffff', 0.85)}
  ${sparkle(324, 92, 26, '#ffd166')}
  ${sparkle(486, 168, 20, '#ffffff', 0.8)}
  ${sparkle(30, 96, 18, '#ffffff', 0.7)}
</svg>`;
}

/** Ilustración para el inicio sin publicaciones. */
export function emptyFeedIllustration() {
  return `<svg viewBox="0 0 320 220" role="img" aria-label="Aún no hay publicaciones" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="nb-empty-photo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>
  <circle cx="160" cy="112" r="94" fill="#0866FF" opacity="0.07"/>
  <circle cx="256" cy="52" r="10" fill="#ffd166"/>
  <circle cx="58" cy="164" r="8" fill="#ff8fab" opacity="0.9"/>

  <g transform="translate(76 44)" filter="url(#nb-shadow)">
    <rect width="168" height="132" rx="20" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <circle cx="26" cy="26" r="12" fill="#8b5cf6"/>
    <rect x="46" y="18" width="62" height="9" rx="4.5" fill="#334155" opacity="0.75"/>
    <rect x="46" y="32" width="40" height="7" rx="3.5" fill="#cbd5e1"/>
    <rect x="16" y="54" width="136" height="58" rx="12" fill="url(#nb-empty-photo)" opacity="0.55"/>
    <path d="M74 82l12-12 12 12-12 12z" fill="#ffffff" opacity="0.9"/>
  </g>

  <g transform="translate(214 132)">
    <circle cx="24" cy="24" r="24" fill="#0866FF"/>
    <path d="M24 14v20M14 24h20" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
  </g>

  ${sparkle(268, 150, 22, '#a78bfa')}
  ${sparkle(46, 70, 18, '#60a5fa', 0.8)}
  ${heart(252, 26, 18, '#ff5c8a')}
</svg>`;
}

/** Ilustración para conversaciones vacías. */
export function emptyChatIllustration() {
  return `<svg viewBox="0 0 320 200" role="img" aria-label="Sin conversaciones" xmlns="http://www.w3.org/2000/svg">
  <circle cx="158" cy="100" r="82" fill="#0866FF" opacity="0.07"/>
  <g filter="url(#nb-shadow)">
    <rect x="52" y="46" width="150" height="82" rx="26" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <path d="M84 128l-4 22 24-22z" fill="#ffffff"/>
    <circle cx="80" cy="76" r="13" fill="#8b5cf6"/>
    <rect x="102" y="66" width="70" height="10" rx="5" fill="#334155" opacity="0.7"/>
    <rect x="102" y="84" width="48" height="9" rx="4.5" fill="#cbd5e1"/>
    <rect x="66" y="104" width="34" height="8" rx="4" fill="#e2e8f0"/>
  </g>
  <g filter="url(#nb-shadow)">
    <rect x="150" y="98" width="122" height="62" rx="22" fill="#0866FF"/>
    <path d="M246 160l4 18-20-18z" fill="#0866FF"/>
    <circle cx="182" cy="122" r="6" fill="#ffffff" opacity="0.9"/>
    <circle cx="200" cy="122" r="6" fill="#ffffff" opacity="0.75"/>
    <circle cx="218" cy="122" r="6" fill="#ffffff" opacity="0.6"/>
  </g>
  ${heart(272, 44, 18, '#ff5c8a')}
  ${sparkle(44, 150, 18, '#60a5fa', 0.85)}
</svg>`;
}

/** Ilustración para listas de amigos vacías. */
export function emptyFriendsIllustration() {
  return `<svg viewBox="0 0 320 200" role="img" aria-label="Sin amigos todavía" xmlns="http://www.w3.org/2000/svg">
  <circle cx="160" cy="104" r="80" fill="#8b5cf6" opacity="0.08"/>
  <g filter="url(#nb-shadow)">
    <circle cx="126" cy="86" r="34" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <circle cx="126" cy="76" r="14" fill="#8b5cf6"/>
    <path d="M100 110c2-14 12-21 26-21s24 7 26 21z" fill="#c4b5fd"/>
    <circle cx="196" cy="94" r="30" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <circle cx="196" cy="85" r="12" fill="#f97316"/>
    <path d="M174 116c2-12 10-18 22-18s20 6 22 18z" fill="#fdba74"/>
  </g>
  <g transform="translate(198 118)">
    <circle cx="22" cy="22" r="22" fill="#0866FF"/>
    <path d="M22 12v20M12 22h20" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
  </g>
  ${sparkle(62, 64, 18, '#a78bfa', 0.9)}
  ${heart(62, 138, 16, '#ff5c8a', 0.9)}
</svg>`;
}

/** Símbolo para la pantalla de error / sin conexión. */
export function offlineIllustration() {
  return `<svg viewBox="0 0 260 180" role="img" aria-label="Sin conexión" xmlns="http://www.w3.org/2000/svg">
  <circle cx="130" cy="92" r="66" fill="#0866FF" opacity="0.08"/>
  <g filter="url(#nb-shadow)">
    <rect x="72" y="48" width="116" height="84" rx="18" fill="#ffffff" stroke="#e6edf6" stroke-width="1.5"/>
    <path d="M96 90l14 14 36-40" stroke="#cbd5e1" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <circle cx="188" cy="52" r="16" fill="#ef4444"/>
  <path d="M182 46l12 12M194 46l-12 12" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/>
</svg>`;
}
