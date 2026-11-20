/* ==========================================================================
   pages/messages.js — Messenger: conversaciones, chat y envío de fotos
   ========================================================================== */
import { el, clear, timeAgo, chatStamp, dayLabel, debounce, isMobile } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, conversationsFor, userById, unreadCountIn, friendsOf, userByUsername,
} from '../core/store.js';
import {
  avatarEl, emptyState, openModal, toast, lightbox, emojiPicker,
} from '../core/ui.js';
import { mediaImg, openFilePicker, uploadImage, validateImageFile } from '../core/media.js';
import {
  ensureConversation, loadChat, sendMessage, markConversationRead,
} from '../core/actions.js';
import { presenceText, isOnline } from '../core/auth.js';
import { emptyChatIllustration } from '../core/illustrations.js';
import { navigate } from '../core/router.js';

export function messagesPage(query = {}) {
  const me = state.me;
  const root = el('div');
  let activeId = null;
  let activeOther = null;
  let messages = [];
  let optimistic = [];
  let pollTimer = null;
  let pendingMedia = null;
  let initialized = false;

  const listItems = el('div', { class: 'msgr-items' });
  const chatWrap = el('div', { class: 'msgr-chat' });
  const messenger = el('div', { class: 'messenger' },
    el('div', { class: 'msgr-list' },
      el('div', { class: 'msgr-list-head' },
        el('div', { class: 'row between' },
          el('h1', { text: 'Chats' }),
          el('button', {
            class: 'ico-btn', type: 'button', 'aria-label': 'Nueva conversación', title: 'Nueva conversación',
            style: { width: '36px', height: '36px' }, onclick: () => newChatModal(),
          }, icon('edit', 18))),
        el('div', { class: 'search-inline', style: { marginTop: '8px' } },
          icon('search', 16),
          el('input', {
            type: 'search', placeholder: 'Buscar en chats', 'aria-label': 'Buscar en chats',
            oninput: debounce((event) => renderList(event.target.value), 160),
          }))),
      listItems),
    chatWrap);

  root.appendChild(messenger);

  /* ------------------------------ lista --------------------------------- */

  function renderList(filter = '') {
    const conversations = conversationsFor(me.id);
    clear(listItems);
    const term = filter.trim().toLowerCase();
    const filtered = term
      ? conversations.filter((conv) => displayName(conv.other).toLowerCase().includes(term))
      : conversations;

    if (!filtered.length) {
      listItems.appendChild(el('div', {
        class: 'conv-empty',
        text: term ? 'Sin coincidencias.' : 'Aún no tienes conversaciones. Busca a un amigo para empezar.',
      }));
      return;
    }

    for (const conv of filtered) {
      const other = conv.other;
      if (!other) continue;
      const unread = unreadCountIn(conv, me.id) > 0;
      listItems.appendChild(el('button', {
        class: `conv ${conv.id === activeId ? 'active' : ''} ${unread ? 'unread' : ''}`.trim(),
        type: 'button',
        onclick: () => openConversation(conv.id, other),
      },
      el('span', { class: `presence ${isOnline(other) ? '' : 'offline'}`.trim() },
        avatarEl(other, 'md'),
        el('span', { class: 'dot' })),
      el('span', { class: 'cv-body' },
        el('span', { class: 'cv-name', text: displayName(other) }),
        el('span', {
          class: 'cv-last',
          text: conv.lastMessage
            ? `${conv.lastMessage.senderId === me.id ? 'Tú: ' : ''}${conv.lastMessage.text}`
            : 'Di hola 👋',
        })),
      unread ? el('span', { class: 'cv-dot' }) : el('span', { class: 'cv-time', text: conv.lastMessage ? chatStamp(conv.lastMessage.at) : '' })));
    }
  }

  /* ------------------------------- chat ---------------------------------- */

  function renderChatEmpty() {
    clear(chatWrap);
    messenger.classList.remove('show-chat');
    chatWrap.appendChild(el('div', { class: 'chat-empty' },
      el('div', { class: 'empty-illustration', style: { width: 'min(100%, 280px)' }, html: emptyChatIllustration() }),
      el('h3', { text: 'Tus mensajes, en un solo lugar' }),
      el('p', {
        class: 'small',
        text: 'Elige una conversación o busca a un amigo para empezar a chatear.',
      }),
      el('button', {
        class: 'btn primary', type: 'button', text: 'Nueva conversación',
        onclick: () => newChatModal(),
      })));
  }

  function messagesForRender() {
    const list = [...messages];
    for (const item of optimistic) list.push(item);
    return list.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  function renderChat() {
    const other = activeOther || userById(activeOtherId());
    if (!other) { renderChatEmpty(); return; }
    clear(chatWrap);
    messenger.classList.add('show-chat');

    const head = el('div', { class: 'chat-head' },
      el('button', {
        class: 'btn-icon chat-back', type: 'button', 'aria-label': 'Volver',
        onclick: () => { activeId = null; activeOther = null; renderChatEmpty(); renderList(); },
      }, icon('chevron-left', 22)),
      el('a', { href: `#/u/${other.username}` }, avatarEl(other, 'md')),
      el('div', { class: 'grow', style: { minWidth: '0' } },
        el('a', {
          class: 'ch-name', href: `#/u/${other.username}`,
          style: { display: 'block' }, text: displayName(other),
        }),
        el('span', {
          class: 'ch-sub',
          text: isOnline(other) ? 'En línea' : presenceText(other),
        })),
      el('button', {
        class: 'btn-icon', type: 'button', 'aria-label': 'Ver perfil',
        onclick: () => navigate(`/u/${other.username}`),
      }, icon('info', 20)));

    const body = el('div', { class: 'chat-body', id: 'chat-body' });
    const list = messagesForRender();
    let lastDay = '';
    let lastSender = null;
    for (const message of list) {
      const day = dayLabel(message.createdAt);
      if (day !== lastDay) {
        body.appendChild(el('div', { class: 'chat-day', text: day }));
        lastDay = day;
        lastSender = null;
      }
      const mine = message.senderId === me.id;
      const grouped = lastSender === message.senderId;
      body.appendChild(el('div', {
        class: `msg ${mine ? 'me' : ''}`.trim(),
        style: { marginTop: grouped ? '2px' : '10px' },
      },
      avatarEl(mine ? me : other, 'xs'),
      el('div', {
        class: 'bubble',
        style: message.pending ? { opacity: '.6' } : null,
      },
      ...(message.media || []).map((media) => mediaImg(media.path, {
        alt: 'Foto enviada', onClick: () => lightbox([media.path], 0),
      })),
      message.text ? el('span', { text: message.text }) : null),
      el('span', {
        class: 'stamp',
        text: message.pending ? 'enviando…' : chatStamp(message.createdAt),
      })));
      lastSender = message.senderId;
    }

    if (!list.length) {
      body.appendChild(el('div', {
        class: 'chat-empty', style: { padding: '40px 20px' },
      },
      el('div', { class: 'big-ic', style: { width: '64px', height: '64px' } }, icon('message', 30)),
      el('p', { class: 'small muted', text: `Di hola a ${displayName(other)} 👋` })));
    }

    const textarea = el('textarea', {
      placeholder: 'Aa', rows: '1', 'aria-label': 'Escribir mensaje',
    });
    const sendBtn = el('button', {
      class: 'send', type: 'button', 'aria-label': 'Enviar', disabled: true,
    }, icon('send', 18));

    function updateSendState() {
      sendBtn.disabled = !textarea.value.trim() && !pendingMedia;
    }

    async function submit() {
      const text = textarea.value.trim();
      if (!text && !pendingMedia) return;
      const media = pendingMedia ? [{ path: pendingMedia.path, type: pendingMedia.type }] : [];
      const temp = {
        id: `tmp_${Date.now()}`,
        senderId: me.id,
        text,
        media,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      optimistic.push(temp);
      textarea.value = '';
      textarea.style.height = 'auto';
      pendingMedia = null;
      updateSendState();
      renderChat();
      scrollToBottom();
      try {
        await sendMessage(activeId, { text, media });
        await loadChat(activeId, { revalidate: true });
        messages = state.chats.get(activeId) || [];
      } catch (err) {
        toast(err.message || 'No se pudo enviar el mensaje.', { type: 'error' });
        textarea.value = text;
      } finally {
        optimistic = optimistic.filter((m) => m !== temp);
        renderChat();
        scrollToBottom();
      }
    }

    const photoBtn = el('button', {
      class: 'ci', type: 'button', title: 'Enviar foto', 'aria-label': 'Enviar foto',
      onclick: async () => {
        const files = await openFilePicker();
        if (!files.length) return;
        const problem = validateImageFile(files[0]);
        if (problem) { toast(problem, { type: 'error' }); return; }
        try {
          toast('Subiendo foto…');
          pendingMedia = await uploadImage(files[0], 'chat', { maxSize: 1280 });
          updateSendState();
          submit();
        } catch (err) { toast(err.message, { type: 'error' }); }
      },
    }, icon('image', 20));

    const emojiBtn = el('button', {
      class: 'ci', type: 'button', title: 'Emoji', 'aria-label': 'Emoji',
      onclick: () => emojiPicker(emojiBtn, (emoji) => {
        textarea.value += emoji;
        updateSendState();
        textarea.focus();
      }),
    }, icon('smile', 20));

    sendBtn.addEventListener('click', submit);
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
      updateSendState();
    });
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });

    const inputBar = el('div', { class: 'chat-input' },
      photoBtn,
      el('div', { class: 'box' }, textarea, emojiBtn),
      sendBtn);

    chatWrap.append(head, body, inputBar);
    scrollToBottom();
    if (!isMobile()) setTimeout(() => textarea.focus(), 40);
  }

  function activeOtherId() {
    const conv = state.conversations.find((c) => c.id === activeId);
    if (!conv) return null;
    return conv.memberIds.find((id) => id !== me.id) || null;
  }

  function scrollToBottom() {
    const body = chatWrap.querySelector('.chat-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  async function openConversation(convId, other) {
    activeId = convId;
    activeOther = other || userById(activeOtherId());
    renderList();
    clear(chatWrap);
    chatWrap.appendChild(el('div', { class: 'chat-empty' }, el('span', { class: 'spinner big' })));
    try {
      messages = await loadChat(convId, { revalidate: true });
    } catch (err) {
      toast(err.message || 'No se pudo cargar el chat.', { type: 'error' });
      messages = [];
    }
    renderChat();
    markConversationRead(convId).catch(() => {});
  }

  function newChatModal() {
    const friends = friendsOf(me.id);
    const input = el('input', {
      class: 'input', type: 'search', placeholder: 'Buscar amigos…', 'aria-label': 'Buscar amigos',
    });
    const list = el('div', { style: { marginTop: '10px', maxHeight: '55vh', overflowY: 'auto' } });

    const renderOptions = (filter = '') => {
      clear(list);
      const term = filter.trim().toLowerCase();
      const options = friends.filter((friend) => !term || displayName(friend).toLowerCase().includes(term));
      if (!options.length) {
        list.appendChild(el('div', { class: 'muted small', style: { padding: '12px' } },
          friends.length ? 'Sin coincidencias.' : 'Todavía no tienes amigos en NimbookGR.'));
        return;
      }
      for (const friend of options) {
        list.appendChild(el('button', {
          class: 'person-row', type: 'button', style: { width: '100%', textAlign: 'left' },
          onclick: async () => {
            api.close();
            const conv = await ensureConversation(friend.id);
            if (conv) openConversation(conv.id, friend);
          },
        }, avatarEl(friend, 'md'),
        el('div', { class: 'grow' },
          el('div', { class: 'strong', text: displayName(friend) }),
          el('div', { class: 'small muted', text: `@${friend.username}` }))));
      }
    };

    input.addEventListener('input', debounce(() => renderOptions(input.value), 140));
    const api = openModal({
      title: 'Nueva conversación',
      body: el('div', null, input, list),
      size: 'sm',
    });
    renderOptions();
  }

  /* ------------------------------ arranque -------------------------------- */

  renderList();
  renderChatEmpty();

  async function initialOpen() {
    if (initialized) return;
    initialized = true;
    const userId = query.u;
    if (userId) {
      const other = userById(userId);
      if (other) {
        const conv = await ensureConversation(other.id).catch(() => null);
        if (conv) await openConversation(conv.id, other);
        return;
      }
    }
    const convId = query.id;
    if (convId) {
      const conv = state.conversations.find((c) => c.id === convId);
      if (conv) await openConversation(conv.id);
    }
  }
  initialOpen();

  pollTimer = setInterval(async () => {
    if (document.hidden || !activeId) return;
    try {
      const list = await loadChat(activeId, { revalidate: true });
      const changed = list.length !== messages.length
        || JSON.stringify(list[list.length - 1]?.id) !== JSON.stringify(messages[messages.length - 1]?.id);
      if (changed) {
        messages = list;
        const body = chatWrap.querySelector('.chat-body');
        const atBottom = body ? body.scrollHeight - body.scrollTop - body.clientHeight < 80 : true;
        renderChat();
        if (atBottom) scrollToBottom();
        markConversationRead(activeId).catch(() => {});
      }
    } catch { /* silencioso */ }
  }, 5000);

  return {
    el: root,
    onData(topic) {
      renderList();
      if (activeId) {
        const fresh = state.chats.get(activeId);
        if (fresh) {
          const body = chatWrap.querySelector('.chat-body');
          const atBottom = body ? body.scrollHeight - body.scrollTop - body.clientHeight < 80 : true;
          if (fresh.length !== messages.length) {
            messages = fresh;
            renderChat();
            if (atBottom) scrollToBottom();
          }
        }
      }
    },
    destroy() {
      clearInterval(pollTimer);
    },
  };
}
