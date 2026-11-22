/* ==========================================================================
   icons.js — set de iconos SVG (trazo y relleno) al estilo Zuma/Facebook
   ========================================================================== */
const NS = 'http://www.w3.org/2000/svg';

const P = {
  /* navegación principal (con variante rellena) */
  home: '<path d="M3 10.4 12 3l9 7.4V20a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 20z"/><path d="M9.4 21.6v-6.8a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1v6.8"/>',
  'home-f': '<path fill-rule="evenodd" d="M3 10.4 12 3l9 7.4V20a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 20zm6.4 11.2v-6.8a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1v6.8z"/>',
  radio: '<rect x="3.5" y="9" width="17" height="12" rx="3"/><path d="M7.5 9 13 3.5a2.2 2.2 0 0 1 3.1 3.1L12.5 9"/><circle cx="12" cy="15" r="2.4"/>',
  users: '<path d="M16 19.8V18a3.7 3.7 0 0 0-3.7-3.7H6.7A3.7 3.7 0 0 0 3 18v1.8"/><circle cx="9.5" cy="7.6" r="3.8"/><path d="M21 19.8V18a3.7 3.7 0 0 0-2.8-3.6"/><path d="M15.4 4.1a3.8 3.8 0 0 1 0 7"/>',
  'users-f': '<circle cx="9.3" cy="7.7" r="4"/><path d="M2.2 19.3c0-3.4 3.2-5.6 7.1-5.6s7.1 2.2 7.1 5.6c0 .9-.7 1.6-1.6 1.6H3.8c-.9 0-1.6-.7-1.6-1.6z"/><circle cx="17.5" cy="8.6" r="3.1"/><path d="M15 14.4c3 .3 6.6 2 6.6 5 0 .8-.7 1.5-1.5 1.5h-2.8c.4-.5.6-1.1.6-1.8 0-2-1-3.6-2.9-4.7z"/>',
  groups: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9.5" r="2.7"/><path d="M6.9 18.3c.4-2.3 2.5-3.7 5.1-3.7s4.7 1.4 5.1 3.7"/>',
  'groups-f': '<path fill-rule="evenodd" d="M12 2.5A9.5 9.5 0 1 0 21.5 12 9.5 9.5 0 0 0 12 2.5zm0 4.5a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8zm0 13a6.7 6.7 0 0 1-5.2-2.5c.6-1.9 2.7-3.1 5.2-3.1s4.6 1.2 5.2 3.1A6.7 6.7 0 0 1 12 20z"/>',
  shop: '<path d="M3.4 8.8 4.9 3.8h14.2l1.5 5"/><path d="M3.4 8.8a2.9 2.9 0 0 0 5.8 0 2.9 2.9 0 0 0 5.6 0 2.9 2.9 0 0 0 5.8 0"/><path d="M4.7 12.2v8.4h14.6v-8.4"/><path d="M9.6 20.6v-4.8h4.8v4.8"/>',
  'shop-f': '<path d="M3.1 8.7 4.8 3.5h14.4l1.7 5.2a2.9 2.9 0 0 1-5.4 1.9 2.9 2.9 0 0 1-5.4 0 2.9 2.9 0 0 1-5.4-1.9z"/><path fill-rule="evenodd" d="M4.9 12.3v8.1c0 .6.4 1 1 1h12.2c.6 0 1-.4 1-1v-8.1a4.4 4.4 0 0 1-3.5-.9 4.5 4.5 0 0 1-5.2 0 4.4 4.4 0 0 1-3.5.9zm4.8 9.1v-4.9h4.6v4.9z"/>',
  tag: '<path d="M20.2 13.2 13 20.4a1.9 1.9 0 0 1-2.7 0L3.6 13.7a1.9 1.9 0 0 1-.6-1.4V4.9a1.6 1.6 0 0 1 1.6-1.6h7.4c.5 0 1 .2 1.4.6l6.8 6.8a1.9 1.9 0 0 1 0 2.5z"/><circle cx="8.2" cy="8.2" r="1.4"/>',
  money: '<rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2"/><circle cx="12" cy="12" r="2.9"/><path d="M6.2 9.4v5.2M17.8 9.4v5.2"/>',
  bookmark: '<path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4.2L6 21z"/>',
  'bookmark-f': '<path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4.2L6 21z"/>',
  message: '<path d="M21 11.6a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.2-.5L7 21.3l-.5-2.7A8.1 8.1 0 0 1 3 11.6 8.6 8.6 0 0 1 12 3a8.6 8.6 0 0 1 9 8.6z"/><circle cx="8.4" cy="11.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="11.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.6" cy="11.6" r="1.1" fill="currentColor" stroke="none"/>',
  'message-f': '<path fill-rule="evenodd" d="M12 3a8.6 8.6 0 0 1 9 8.6 8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.2-.5l-1.8 1.8-.5-2.7A8.1 8.1 0 0 1 3 11.6 8.6 8.6 0 0 1 12 3zm-3.6 7.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.6 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm3.6 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/>',
  bell: '<path d="M18.4 8.8a6.4 6.4 0 1 0-12.8 0c0 4.4-1.9 5.7-1.9 5.7h16.6s-1.9-1.3-1.9-5.7z"/><path d="M10.1 20.4a2.2 2.2 0 0 0 3.8 0"/>',
  'bell-f': '<path d="M18.4 8.8a6.4 6.4 0 1 0-12.8 0c0 4.4-1.9 5.7-1.9 5.7h16.6s-1.9-1.3-1.9-5.7z"/><path d="M9.8 20.2h4.4a2.2 2.2 0 0 1-4.4 0z"/>',

  /* básicos */
  search: '<circle cx="10.7" cy="10.7" r="6.9"/><path d="m20.4 20.4-4.7-4.7"/>',
  plus: '<path d="M12 4.5v15M4.5 12h15"/>',
  x: '<path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5"/>',
  check: '<path d="m4.5 12.8 5 5 10-11"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  'chevron-up': '<path d="m6 14.5 6-6 6 6"/>',
  'chevron-left': '<path d="m14.5 5-7 7 7 7"/>',
  'chevron-right': '<path d="m9.5 5 7 7-7 7"/>',
  'arrow-left': '<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>',
  'arrow-right': '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
  'more-h': '<circle cx="5.5" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.9" fill="currentColor" stroke="none"/>',
  'more-v': '<circle cx="12" cy="5.5" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.9" fill="currentColor" stroke="none"/>',
  menu: '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
  grid: '<rect x="3.4" y="3.4" width="7.2" height="7.2" rx="1.8"/><rect x="13.4" y="3.4" width="7.2" height="7.2" rx="1.8"/><rect x="3.4" y="13.4" width="7.2" height="7.2" rx="1.8"/><rect x="13.4" y="13.4" width="7.2" height="7.2" rx="1.8"/>',

  /* media y acciones */
  image: '<rect x="3" y="4" width="18" height="16" rx="2.6"/><circle cx="8.6" cy="9.5" r="1.9"/><path d="m4 17.6 4.7-4.7a1.9 1.9 0 0 1 2.6 0l6.4 6.4"/>',
  camera: '<path d="M4 7.6h2.7l1.2-2A1.7 1.7 0 0 1 9.4 4.8h5.2a1.7 1.7 0 0 1 1.5.8l1.2 2H20a1.7 1.7 0 0 1 1.7 1.7v9a1.7 1.7 0 0 1-1.7 1.7H4a1.7 1.7 0 0 1-1.7-1.7v-9A1.7 1.7 0 0 1 4 7.6z"/><circle cx="12" cy="13.3" r="3.7"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.4 14.1a4.3 4.3 0 0 0 7.2 0"/><circle cx="9.2" cy="9.7" r="1.15" fill="currentColor" stroke="none"/><circle cx="14.8" cy="9.7" r="1.15" fill="currentColor" stroke="none"/>',
  'map-pin': '<path d="M20 10.3c0 5.2-8 11.2-8 11.2s-8-6-8-11.2a8 8 0 1 1 16 0z"/><circle cx="12" cy="10.2" r="2.9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3a14.4 14.4 0 0 1 0 18 14.4 14.4 0 0 1 0-18z"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.4"/><path d="M8.1 10.4V8a3.9 3.9 0 0 1 7.8 0v2.4"/>',
  'user-plus': '<circle cx="9.6" cy="8" r="4"/><path d="M2.9 20.5c0-3.6 3-5.9 6.7-5.9 1.5 0 2.9.4 4 1"/><path d="M18.3 14.2v7M14.8 17.7h7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.2 20.6c0-3.9 3.5-6.4 7.8-6.4s7.8 2.5 7.8 6.4"/>',
  'user-f': '<circle cx="12" cy="8" r="4.2"/><path d="M12 14.1c-4.4 0-7.9 2.7-7.9 6.1 0 .8.6 1.4 1.4 1.4h13c.8 0 1.4-.6 1.4-1.4 0-3.4-3.5-6.1-7.9-6.1z"/>',
  'user-check': '<circle cx="9.6" cy="8" r="4"/><path d="M2.9 20.5c0-3.6 3-5.9 6.7-5.9 1.2 0 2.3.2 3.3.6"/><path d="m14.6 18.4 2.2 2.2 4.3-4.6"/>',
  'user-x': '<circle cx="9.6" cy="8" r="4"/><path d="M2.9 20.5c0-3.6 3-5.9 6.7-5.9 1.2 0 2.3.2 3.3.6"/><path d="m15.2 14.9 5 5M20.2 14.9l-5 5"/>',
  thumbsup: '<path d="M7.6 10.4 11.3 3a2.3 2.3 0 0 1 2.2 2.2v3.4h4.2a2 2 0 0 1 2 2.3l-1.2 6.3a2 2 0 0 1-2 1.7H7.6"/><path d="M7.6 10.4H4.9A1.5 1.5 0 0 0 3.4 11.9v7.1a1.5 1.5 0 0 0 1.5 1.5h2.7z"/>',
  heart: '<path d="M20.4 8.9a4.9 4.9 0 0 0-8.4-3.2A4.9 4.9 0 0 0 3.6 8.9c0 5 8.4 10.2 8.4 10.2s8.4-5.2 8.4-10.2z"/>',
  'heart-f': '<path d="M20.4 8.9a4.9 4.9 0 0 0-8.4-3.2A4.9 4.9 0 0 0 3.6 8.9c0 5 8.4 10.2 8.4 10.2s8.4-5.2 8.4-10.2z"/>',
  share: '<path d="M14.4 4.6v4.1c-6 .3-9.7 3.7-10.7 10.7 2.1-3.4 5.2-4.9 10.7-5.1v4.2l6.6-6.9z"/>',
  send: '<path d="m21 3-9.9 18-2.2-7.4L2 11.2z"/><path d="M21 3 9 13.6"/>',
  reply: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9.5a6.5 6.5 0 0 1 6.5 6.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9.6 7V4.9A1.4 1.4 0 0 1 11 3.5h2a1.4 1.4 0 0 1 1.4 1.4V7"/><path d="M6.4 7l.8 12.1a1.9 1.9 0 0 0 1.9 1.8h5.8a1.9 1.9 0 0 0 1.9-1.8L17.6 7"/><path d="M10.5 11v6M13.5 11v6"/>',
  edit: '<path d="M4 20h4.2L20 8.2a2.1 2.1 0 0 0 0-3v0a2.1 2.1 0 0 0-3 0L4 15.8z"/>',
  settings: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/><circle cx="9" cy="6.5" r="2.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2.1" fill="currentColor" stroke="none"/><circle cx="8" cy="17.5" r="2.1" fill="currentColor" stroke="none"/>',
  moon: '<path d="M20.6 14.4A8.7 8.7 0 0 1 9.7 3.4 8.7 8.7 0 1 0 20.6 14.4z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6"/>',
  monitor: '<rect x="2.8" y="3.8" width="18.4" height="12.6" rx="2"/><path d="M8 20.4h8M12 16.4v4"/>',
  logout: '<path d="M14.5 3.5H6.4A1.9 1.9 0 0 0 4.5 5.4v13.2a1.9 1.9 0 0 0 1.9 1.9h8.1"/><path d="M16 8.2 19.8 12 16 15.8"/><path d="M9.8 12h10"/>',
  link: '<path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
  flag: '<path d="M5 21V3.8c4-1.6 8 1.6 14 0v9.6c-6 1.6-10-1.6-14 0"/>',
  eye: '<path d="M2.2 12S5.6 5.6 12 5.6 21.8 12 21.8 12 18.4 18.4 12 18.4 2.2 12 2.2 12z"/><circle cx="12" cy="12" r="3.1"/>',
  'eye-off': '<path d="M4 4l16 16"/><path d="M9.9 5.9A9.9 9.9 0 0 1 12 5.6c6.4 0 9.8 6.4 9.8 6.4a17 17 0 0 1-3.3 4.3"/><path d="M6.2 7.9A16.6 16.6 0 0 0 2.2 12s3.4 6.4 9.8 6.4a10 10 0 0 0 4-.8"/><path d="M9.9 10a3.1 3.1 0 0 0 4.3 4.3"/>',
  refresh: '<path d="M20.4 11.4a8.5 8.5 0 1 0-2.3 6.4"/><path d="M20.8 4.6v6.9h-6.9"/>',
  sync: '<path d="M20.5 11.5a8.5 8.5 0 0 0-14.7-5.3"/><path d="M3.5 12.5a8.5 8.5 0 0 0 14.7 5.3"/><path d="M5.9 3.1v4.2h4.2"/><path d="M18.1 20.9v-4.2h-4.2"/>',
  github: '<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.6v5.2"/><circle cx="12" cy="16.6" r="1.15" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5.2"/><circle cx="12" cy="7.9" r="1.15" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3.2" y="5" width="17.6" height="16" rx="2.2"/><path d="M3.2 10h17.6M8.2 2.9V6M15.8 2.9V6"/>',
  briefcase: '<rect x="2.6" y="7.2" width="18.8" height="13.2" rx="2"/><path d="M8.6 7.2V5.4a1.7 1.7 0 0 1 1.7-1.7h3.4a1.7 1.7 0 0 1 1.7 1.7v1.8M2.6 12.6h18.8"/>',
  education: '<path d="m12 3.6 9.4 4.7L12 13 2.6 8.3z"/><path d="M6.3 10.4V15c0 1.9 2.6 3.4 5.7 3.4s5.7-1.5 5.7-3.4v-4.6"/><path d="M21.4 8.3v5.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3.2 2"/>',
  play: '<path d="M7.5 4.5 19 12 7.5 19.5z"/>',
  download: '<path d="M12 3.4v11.8"/><path d="m7 10.4 5 5 5-5"/><path d="M4.2 20.2h15.6"/>',
  upload: '<path d="M12 20.6V8.8"/><path d="m7 13.4 5-5 5 5"/><path d="M4.2 4h15.6"/>',
  filter: '<path d="M3.5 5.5h17l-6.6 7.7v5.6l-3.8 2v-7.6z"/>',
  list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><circle cx="4" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="17.5" r="1.4" fill="currentColor" stroke="none"/>',
  sparkles: '<path d="m12 3 1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9z"/><path d="m18.5 15.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  volume: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9.5 9.5 0 0 1 0 13"/>',
  'volume-x': '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  story: '<path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/><path d="M12 8v8M8 12h8"/><path d="M3.5 8.2A8.5 8.5 0 0 1 8 3.9"/>',
  key: '<circle cx="8" cy="15.5" r="4.5"/><path d="m11.2 12.3 7.3-7.3M16 4.5l3.5 3.5M14 6.5l3.5 3.5"/>',
  mail: '<rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.2"/><path d="m3.4 6.6 8.6 6 8.6-6"/>',
  phone: '<path d="M6.4 3.6h3l1.6 4-2 1.4a12 12 0 0 0 5.9 5.9l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.4 16.4 0 0 1 4.4 5.8a2 2 0 0 1 2-2.2z"/>',
  whatsapp: '<path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3A8.5 8.5 0 1 1 20.5 11.7z"/><path d="M9.2 8.4c.3-.6.6-.6.9-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .6.5.8 1.4 1.7 2.3 2.1.3.1.4.1.6-.1l.6-.7c.2-.2.4-.2.6-.1l1.5.7c.3.1.4.3.4.5 0 .8-.6 1.6-1.3 1.8-.5.2-1.1.2-2.1-.2-2.3-.9-4.3-2.9-5.1-5.2-.3-.9-.2-1.5 0-2z"/>',
  instagram: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.1" cy="6.9" r="1.15" fill="currentColor" stroke="none"/>',
  crown: '<path d="M3 7.5 7 11l5-6.5L17 11l4-3.5-1.8 11H4.8z"/>',
  shield: '<path d="M12 3.2 20 6v6c0 5-3.4 8-8 9.2C7.4 20 4 17 4 12V6z"/>',
  'photo-library': '<rect x="3" y="5" width="14" height="14" rx="2.4"/><path d="M7 21h11.4a2.6 2.6 0 0 0 2.6-2.6V7"/><circle cx="7.6" cy="9.6" r="1.6"/><path d="m3.6 16.4 3.6-3.6a1.7 1.7 0 0 1 2.4 0l4.2 4.2"/>',
  videocam: '<rect x="2.8" y="6" width="12.6" height="12" rx="2.6"/><path d="m15.4 10.6 5.8-3.2v9.2l-5.8-3.2z"/>',
  'video-off': '<path d="M4.5 4.5 19.5 19.5"/><path d="M15.4 6H5.4A2.6 2.6 0 0 0 2.8 8.6v6.8A2.6 2.6 0 0 0 5.4 18h10"/><path d="m15.4 10.6 5.8-3.2v9.2l-5.8-3.2z"/>',
  mic: '<rect x="9" y="2.8" width="6" height="11" rx="3"/><path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0M12 18v3.2"/>',
  'dots-grid': '<circle cx="6" cy="6" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.9" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="1.9" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="6" cy="18" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.9" fill="currentColor" stroke="none"/><circle cx="18" cy="18" r="1.9" fill="currentColor" stroke="none"/>',
};

const EMPTY = '<circle cx="12" cy="12" r="9"/>';

export function icon(name, size = 24, opts = {}) {
  let key = name;
  if (opts.filled && P[`${name}-f`]) key = `${name}-f`;
  const markup = P[key] || EMPTY;
  const filled = key.endsWith('-f');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `ico${opts.cls ? ` ${opts.cls}` : ''}`);
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', filled ? 'none' : 'currentColor');
  if (!filled) {
    svg.setAttribute('stroke-width', String(opts.weight || 1.9));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  svg.innerHTML = markup;
  return svg;
}

export const hasIcon = (name) => Boolean(P[name]);
export const iconMarkup = (name, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || EMPTY}</svg>`;
