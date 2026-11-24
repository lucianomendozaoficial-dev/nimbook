/* ==========================================================================
   pages/messages.js — mensajes privados (bandeja + chat 1:1)
   ========================================================================== */
import { el, clear, timeAgo, dayLabel, clockTime, money } from '../core/util.js';
import { icon } from '../core/icons.js';
import {
  state, displayName, userById, userByUsername, loadUser, loadInbox, loadThread,
  messagesOf, threadIdFor, inboxSorted, searchPeople, loadShopItem,
} from '../core/store.js';
import { avatarEl, openModal, toast, dropdown, confirmDialog } from '../core/ui.js';
import { mediaImg } from '../core/media.js';
import { sendMessage, markThreadRead, deleteMessage, deleteChat } from '../core/actions.js';
import { navigate } from '../core/router.js';
import { playSound } from '../core/sounds.js';
import { onTyping, sendTyping } from '../core/realtime.js';
import { verifiedBadge } from '../components/verified-badge.js';
import { emojiButton } from '../components/emoji-picker.js';

export function messagesPage(username = '', routeQuery = {}) {
  const root = el('div');
  const messenger = el('div', { class: 'messenger' });
  const listItems = el('div', { class: 'msgr-items' });
  const chatPane = el('section', { class: 'msgr-chat' });

  let activeId = null;
  let activePartner = null;
  let query = '';
  let chatBody = null;
  let destroyed = false;
  let pollTimer = null;
  let pollBusy = false;
  let sending = false;
  let syncTimer = null;
  let replyContext = null;
  let initialItemApplied = false;
  let chatSub = null;
  let typingSentAt = 0;
  let typingClearTimer = null;
  const initialItemId = String(routeQuery.item || '');

  const offTyping = onTyping((data) => {
    if (!activePartner || !chatSub) return;
    if (data.toId !== state.me?.id || data.fromId !== activePartner.id) return;
    chatSub.textContent = 'escribiendo…';
    chatSub.classList.add('typing');
    clearTimeout(typingClearTimer);
    typingClearTimer = setTimeout(() => {
      if (!chatSub) return;
      chatSub.textContent = 'Mensaje privado';
      chatSub.classList.remove('typing');
    }, 2600);
  });

  const POLL_MS = 5000;

  const searchInput = el('input', {
    type: 'search', placeholder: 'Buscar en mensajes', 'aria-label': 'Buscar en mensajes',
  });
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderList();
  });

  messenger.append(
    el('aside', { class: 'msgr-list' },
      el('div', { class: 'msgr-list-head' },
        el('div', { class: 'row between' },
          el('h1', { text: 'Mensajes' }),
          el('button', {
            class: 'btn-icon', type: 'button', title: 'Nuevo mensaje',
            'aria-label': 'Nuevo mensaje', onclick: openNewChat,
          }, icon('edit', 20))),
        el('div', { class: 'search-inline', style: { marginTop: '10px' } },
          icon('search', 17), searchInput)),
      listItems),
    chatPane);

  root.appendChild(messenger);

  /* ------------------------------- bandeja ------------------------------- */

  function renderList() {
    if (destroyed) return;
    clear(listItems);
    const me = state.me;

    if (!state.inbox.length) {
      listItems.appendChild(el('div', { class: 'conv-empty' },
        el('div', { class: 'empty-ic', style: { margin: '0 auto 10px' } }, icon('message', 26)),
        el('p', { text: 'Todavía no tenés conversaciones.' }),
        el('button', {
          class: 'btn soft sm', type: 'button', style: { marginTop: '10px' },
          onclick: openNewChat,
        }, icon('edit', 15), 'Empezar una')));
      return;
    }

    const q = query.trim().toLowerCase();
    const list = inboxSorted(state.inbox).filter((entry) => {
      if (!q) return true;
      const person = userById(entry.withId);
      return `${person?.username || ''} ${person?.name || ''} ${entry.lastText || ''}`
        .toLowerCase().includes(q);
    });

    if (!list.length) {
      listItems.appendChild(el('div', { class: 'conv-empty', text: 'No encontramos esa conversación.' }));
      return;
    }

    for (const entry of list) {
      const person = userById(entry.withId);
      if (!person) continue;
      const mine = entry.lastFromId === me?.id;
      listItems.appendChild(el('a', {
        class: `conv${entry.unread ? ' unread' : ''}${entry.withId === activeId ? ' active' : ''}`.trim(),
        href: `#/mensajes/${person.username}`,
        onclick: () => playSound('open'),
      },
      avatarEl(person, 'md', { online: false }),
      el('div', { class: 'cv-body' },
        el('div', { class: 'cv-name-row' },
          el('span', { class: 'cv-name', text: displayName(person) }),
          verifiedBadge(person, { size: 14 })),
        el('div', { class: 'cv-last', text: `${mine ? 'Vos: ' : ''}${entry.lastText || ''}` })),
      el('div', { class: 'cv-time', text: timeAgo(entry.lastAt) }),
      entry.unread ? el('span', { class: 'cv-dot' }) : null));
    }
  }

  /* --------------------------------- chat -------------------------------- */

  function renderEmptyPane() {
    clear(chatPane);
    chatPane.appendChild(el('div', { class: 'chat-empty' },
      el('div', { class: 'big-ic' }, icon('message', 38)),
      el('h2', { text: 'Tus mensajes privados' }),
      el('p', { class: 'muted', text: 'Elegí una conversación de la lista o empezá una nueva.' }),
      el('button', {
        class: 'btn primary', type: 'button', style: { marginTop: '6px' },
        onclick: openNewChat,
      }, icon('edit', 16), 'Nuevo mensaje')));
  }

  function quotedNode(reply) {
    if (!reply) return null;
    const label = reply.kind === 'shop'
      ? 'Publicación de Shop'
      : reply.kind === 'story' ? 'Historia' : 'Mensaje citado';
    return el('div', { class: 'msg-reply' },
      el('span', { class: 'msg-reply-thumb' },
        reply.image
          ? mediaImg(reply.image, { alt: reply.title || 'Publicación' })
          : icon(reply.kind === 'shop' ? 'shop' : reply.kind === 'story' ? 'story' : 'message', 16)),
      el('div', { class: 'msg-reply-copy' },
        el('div', { class: 'msg-reply-label', text: label }),
        el('div', { class: 'msg-reply-title', text: reply.title || reply.text || 'Publicación' }),
        reply.price ? el('div', { class: 'msg-reply-price', text: money(reply.price, reply.currency || 'ARS') }) : null));
  }

  function messageRow(message, partner) {
    const mine = message.fromId === state.me?.id;
    const threadId = threadIdFor(state.me?.id, partner.id);
    const more = mine && !message.pending
      ? el('button', {
        class: 'msg-more', type: 'button', 'aria-label': 'Opciones del mensaje',
      }, icon('more-h', 15))
      : null;
    if (more) {
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdown(more, [
          {
            icon: 'trash', label: 'Eliminar para todos', danger: true,
            onClick: async () => {
              const ok = await confirmDialog({
                title: '¿Eliminar este mensaje?',
                message: 'Se va a borrar también de la conversación de la otra persona.',
                confirmText: 'Eliminar para todos', danger: true,
              });
              if (!ok) return;
              try {
                await deleteMessage(threadId, message.id);
                toast('Mensaje eliminado para ambos', { type: 'success' });
                renderChatBody(partner);
                renderList();
              } catch (err) { toast(err.message || 'No se pudo eliminar el mensaje.', { type: 'error' }); }
            },
          },
        ], { align: 'start', width: 220 });
      });
    }
    return el('div', {
      class: `msg${mine ? ' me' : ''}${message.pending ? ' pending' : ''}`,
      'data-message-id': message.id,
    },
    mine ? null : avatarEl(userById(message.fromId) || partner, 'xs'),
    el('div', { class: 'bubble' },
      quotedNode(message.replyTo),
      el('span', { class: 'msg-text', text: message.text }),
      el('span', {
        class: 'stamp',
        text: message.pending ? 'enviando…' : clockTime(message.createdAt),
      })),
    more);
  }

  function renderChatBody(partner) {
    clear(chatBody);
    const threadId = threadIdFor(state.me?.id, partner.id);
    const messages = messagesOf(threadId);

    if (!messages.length) {
      chatBody.appendChild(el('div', { class: 'chat-empty-soft' },
        el('div', { class: 'center', style: { width: '64px', height: '64px', borderRadius: '50%', background: 'var(--card-2)', margin: '0 auto 10px' } },
          icon('message', 30)),
        el('div', { class: 'strong', text: `Empezá la conversación con ${displayName(partner)}` }),
        el('p', { class: 'muted small', text: 'Es una conversación privada entre ustedes dos.' })));
      return;
    }

    let lastDay = '';
    for (const message of messages) {
      const label = dayLabel(message.createdAt);
      if (label !== lastDay) {
        chatBody.appendChild(el('div', { class: 'chat-day', text: label }));
        lastDay = label;
      }
      chatBody.appendChild(messageRow(message, partner));
    }
  }

  async function reloadThread(partner, { force = false } = {}) {
    try {
      await loadThread(threadIdFor(state.me?.id, partner.id), { force });
    } catch {
      toast('No pudimos cargar la conversación. Revisá tu conexión.', { type: 'error' });
    }
    renderChatBody(partner);
  }

  /* ------------------- lectura automática por link público ---------------- */
  // Cada 5 segundos se leen el hilo y la bandeja desde Supabase.

  function inboxSignature(list) {
    return (list || []).map((row) => `${row.threadId}:${row.lastAt}:${row.unread}`).join('|');
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollNow, POLL_MS);
  }

  async function pollNow() {
    if (destroyed || document.hidden || pollBusy || sending) return;
    const me = state.me;
    if (!me) return;
    pollBusy = true;
    try {
      if (activePartner) {
        const threadId = threadIdFor(me.id, activePartner.id);
        const before = messagesOf(threadId);
        const beforeIds = new Set(before.map((message) => message.id));
        await loadThread(threadId, { force: true });
        const after = messagesOf(threadId);
        const changed = after.length !== before.length
          || after.some((message) => !beforeIds.has(message.id));
        if (changed) {
          const incoming = after.some((message) => (
            message.fromId !== me.id && !message.pending && !beforeIds.has(message.id)
          ));
          const atBottom = !chatBody
            || chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 90;
          renderChatBody(activePartner);
          if (incoming) await markThreadRead(activePartner.id).catch(() => {});
          if (atBottom || incoming) {
            requestAnimationFrame(() => {
              if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
            });
          }
        }
      }

      const inboxBefore = inboxSignature(state.inbox);
      await loadInbox(me.id, { fresh: true }).catch(() => {});
      if (inboxSignature(state.inbox) !== inboxBefore) renderList();
    } catch {
      /* se reintenta en el próximo ciclo */
    } finally {
      pollBusy = false;
    }
  }

  function onVisibility() {
    if (!document.hidden && !destroyed) pollNow();
  }
  document.addEventListener('visibilitychange', onVisibility);

  /** Un cambio llega por Realtime: refresca el hilo abierto sin esperar 5 s. */
  function scheduleSync() {
    if (!activePartner || destroyed) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (!activePartner || destroyed) return;
      const partner = activePartner;
      const threadId = threadIdFor(state.me?.id, partner.id);
      const before = messagesOf(threadId);
      const beforeIds = new Set(before.map((message) => message.id));
      try {
        await loadThread(threadId, { force: true });
      } catch {
        return;
      }
      const after = messagesOf(threadId);
      const changed = after.length !== before.length
        || after.some((message) => !beforeIds.has(message.id));
      if (!changed) return;
      const incoming = after.some((message) => (
        message.fromId !== state.me?.id && !message.pending && !beforeIds.has(message.id)
      ));
      const atBottom = !chatBody
        || chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 110;
      renderChatBody(partner);
      if (incoming) await markThreadRead(partner.id).catch(() => {});
      if (atBottom || incoming) {
        requestAnimationFrame(() => {
          if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
        });
      }
      renderList();
    }, 90);
  }

  function renderChat(partner) {
    clear(chatPane);
    messenger.classList.add('show-chat');
    activeId = partner.id;
    activePartner = partner;
    replyContext = null;
    typingSentAt = 0;
    clearTimeout(typingClearTimer);
    if (chatSub) {
      chatSub.textContent = 'Mensaje privado';
      chatSub.classList.remove('typing');
    }

    const refreshBtn = el('button', {
      class: 'btn-icon', type: 'button', title: 'Actualizar conversación', 'aria-label': 'Actualizar',
      onclick: async () => {
        refreshBtn.classList.add('busy');
        await reloadThread(partner, { force: true });
        await loadInbox(state.me.id, { fresh: true }).catch(() => {});
        renderList();
        refreshBtn.classList.remove('busy');
      },
    }, icon('refresh', 19));

    const chatSubNode = el('div', { class: 'ch-sub', text: 'Mensaje privado' });
    chatSub = chatSubNode;
    const chatMenuBtn = el('button', {
      class: 'btn-icon', type: 'button', title: 'Opciones del chat', 'aria-label': 'Opciones del chat',
    }, icon('more-h', 19));
    chatMenuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      dropdown(chatMenuBtn, [
        {
          icon: 'trash', label: 'Eliminar chat para mí', danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: '¿Eliminar este chat?',
              message: 'Solo se va a borrar de tu lista. La otra persona conserva la conversación.',
              confirmText: 'Eliminar para mí', danger: true,
            });
            if (!ok) return;
            try {
              await deleteChat(threadIdFor(state.me.id, partner.id));
              toast('Chat eliminado de tu lista', { type: 'success' });
              navigate('/mensajes');
            } catch (err) { toast(err.message || 'No se pudo eliminar el chat.', { type: 'error' }); }
          },
        },
        { icon: 'user', label: 'Ver perfil', onClick: () => navigate(`/u/${partner.username}`) },
      ], { align: 'end', width: 230 });
    });
    const head = el('header', { class: 'chat-head' },
      el('button', {
        class: 'btn-icon chat-list-btn', type: 'button',
        title: 'Ver conversaciones', 'aria-label': 'Ver conversaciones',
        onclick: () => navigate('/mensajes'),
      }, icon('list', 20)),
      el('a', { href: `#/u/${partner.username}` }, avatarEl(partner, 'md')),
      el('div', { class: 'grow', style: { minWidth: '0' } },
        el('div', { class: 'ch-name-row' },
          el('a', { class: 'ch-name', href: `#/u/${partner.username}`, text: displayName(partner) }),
          verifiedBadge(partner, { size: 15 })),
        chatSubNode),
      el('a', {
        class: 'btn-icon', href: `#/u/${partner.username}`, title: 'Ver perfil', 'aria-label': 'Ver perfil',
      }, icon('user', 19)),
      refreshBtn,
      chatMenuBtn);

    chatBody = el('div', { class: 'chat-body' });

    const textarea = el('textarea', {
      rows: '1', placeholder: 'Escribí un mensaje…', maxlength: '4000',
      'aria-label': 'Mensaje',
    });
    const sendBtn = el('button', {
      class: 'send', type: 'submit', 'aria-label': 'Enviar', disabled: true,
    }, icon('send', 18));

    const replyBar = el('div', { class: 'chat-reply-bar hide' });
    const setReplyContext = (context) => {
      replyContext = context || null;
      clear(replyBar);
      replyBar.classList.toggle('hide', !replyContext);
      if (!replyContext) return;
      replyBar.append(
        el('span', { class: 'chat-reply-thumb' },
          replyContext.image
            ? mediaImg(replyContext.image, { alt: replyContext.title || 'Publicación' })
            : icon('shop', 17)),
        el('div', { class: 'chat-reply-copy' },
          el('div', { class: 'chat-reply-label', text: 'Respondiendo a esta publicación' }),
          el('div', { class: 'chat-reply-title', text: replyContext.title || 'Publicación de Shop' }),
          replyContext.price ? el('div', { class: 'chat-reply-price', text: money(replyContext.price, replyContext.currency || 'ARS') }) : null),
        el('button', {
          class: 'btn-icon chat-reply-close', type: 'button', 'aria-label': 'Quitar respuesta',
          onclick: () => setReplyContext(null),
        }, icon('x', 16)));
    };

    const form = el('form', { class: 'chat-input' },
      replyBar,
      el('div', { class: 'box' },
        emojiButton(textarea, { className: 'chat-emoji', title: 'Agregar emoji' }),
        textarea),
      sendBtn);

    const grow = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(120, textarea.scrollHeight)}px`;
      sendBtn.disabled = !textarea.value.trim();
    };
    textarea.addEventListener('input', () => {
      grow();
      const now = Date.now();
      if (textarea.value.trim() && now - typingSentAt > 1400) {
        typingSentAt = now;
        sendTyping(state.me?.id, partner.id);
      }
    });

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text || sending) return;
      sending = true;
      sendBtn.disabled = true;
      const context = replyContext;
      textarea.value = '';
      replyContext = null;
      setReplyContext(null);
      grow();
      try {
        // Se llama sin esperar: el mensaje ya se pinta al instante y la red
        // confirma en segundo plano.
        const saved = sendMessage(partner.id, text, { replyTo: context });
        renderChatBody(partner);
        requestAnimationFrame(() => {
          chatBody.scrollTop = chatBody.scrollHeight;
        });
        playSound('send');
        await saved;
        renderChatBody(partner);
        renderList();
      } catch (err) {
        textarea.value = text;
        if (context) setReplyContext(context);
        grow();
        playSound('error');
        renderChatBody(partner);
        toast(err.message || 'No se pudo enviar el mensaje.', { type: 'error' });
      } finally {
        sending = false;
        grow();
        requestAnimationFrame(() => {
          chatBody.scrollTop = chatBody.scrollHeight;
          textarea.focus();
        });
      }
    });

    chatPane.append(head, chatBody, form);
    renderChatBody(partner);
    if (!initialItemApplied && initialItemId) {
      initialItemApplied = true;
      loadShopItem(initialItemId, { force: true }).then((item) => {
        if (destroyed || activeId !== partner.id || !item) return;
        if (item.sellerId && item.sellerId !== partner.id) return;
        setReplyContext({
          kind: 'shop',
          id: item.id,
          title: item.title,
          price: item.price,
          currency: item.currency,
          image: item.cover || item.media?.[0]?.url || '',
        });
      }).catch(() => {});
    }
    requestAnimationFrame(() => {
      chatBody.scrollTop = chatBody.scrollHeight;
      if (window.matchMedia('(min-width: 768px)').matches) textarea.focus();
    });
  }

  /* ---------------------------- nueva charla ----------------------------- */

  function openNewChat() {
    const input = el('input', {
      class: 'input', type: 'search', placeholder: 'Buscar por nombre o usuario', autofocus: true,
    });
    const results = el('div', { class: 'new-chat-list' });

    const paint = () => {
      clear(results);
      const q = input.value.trim();
      const people = q
        ? searchPeople(q, 30)
        : state.userIndex
          .filter((user) => user.id !== state.me?.id)
          .slice(0, 30)
          .map((user) => state.users.get(user.id) || user);
      if (!people.length) {
        results.appendChild(el('div', { class: 'conv-empty', text: 'No encontramos a nadie con ese nombre.' }));
        return;
      }
      for (const person of people) {
        if (person.id === state.me?.id) continue;
        results.appendChild(el('button', {
          class: 'person-row', type: 'button', style: { width: '100%' },
          onclick: () => { api.close(); navigate(`/mensajes/${person.username}`); },
        },
        avatarEl(person, 'md'),
        el('div', { class: 'grow', style: { textAlign: 'left' } },
          el('div', { class: 'strong', text: displayName(person) }),
          el('div', { class: 'muted small', text: person.name || '' })),
        icon('chevron-right', 18, { cls: 'dim' })));
      }
    };

    input.addEventListener('input', paint);

    const api = openModal({
      title: 'Nuevo mensaje',
      body: el('div', { class: 'col gap-10' }, input, results),
      size: 'sm',
    });
    paint();
    setTimeout(() => input.focus(), 80);
  }

  /* ------------------------------- arranque ------------------------------ */

  async function init() {
    const me = state.me;
    if (!me) return;

    clear(listItems);
    listItems.appendChild(el('div', { class: 'loading-row' }, el('span', { class: 'spinner' })));

    await loadInbox(me.id).catch(() => {});

    if (username) {
      let person = userByUsername(username);
      if (!person) {
        const light = state.userIndex.find(
          (user) => user.username?.toLowerCase() === String(username).toLowerCase(),
        );
        if (light) person = await loadUser(light.id);
      }
      if (person) activeId = person.id;
      else toast('No encontramos a esa persona.', { type: 'error' });
    }

    renderList();

    if (activeId) {
      const partner = userById(activeId);
      if (!partner) { renderEmptyPane(); startPolling(); return; }
      renderChat(partner);
      await reloadThread(partner, { force: true });
      await markThreadRead(partner.id).catch(() => {});
      renderList();
    } else {
      renderEmptyPane();
    }
    startPolling();
  }

  init();

  return {
    el: root,
    onData(topic) {
      if (topic === 'messages' || topic === 'me') {
        renderList();
        if (topic === 'messages') scheduleSync();
      }
    },
    destroy() {
      destroyed = true;
      offTyping();
      clearTimeout(typingClearTimer);
      stopPolling();
      clearTimeout(syncTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
