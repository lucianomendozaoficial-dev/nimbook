/* ==========================================================================
   follow-button.js — botón Seguir / Siguiendo reutilizable
   ========================================================================== */
import { el } from '../core/util.js';
import { icon } from '../core/icons.js';
import { state, isFollowing } from '../core/store.js';
import { toast } from '../core/ui.js';
import { toggleFollow } from '../core/actions.js';
import { playSound } from '../core/sounds.js';

export function followButton(user, { size = 'sm', onChange, wide = false } = {}) {
  const me = state.me;
  const button = el('button', {
    class: 'btn', type: 'button',
    style: wide ? { width: '100%' } : null,
  });

  function paint() {
    const following = Boolean(me) && isFollowing(me.id, user.id);
    button.className = `btn ${size} ${following ? 'soft' : 'primary'} ${wide ? 'block' : ''}`.trim();
    button.textContent = '';
    button.append(
      icon(following ? 'check' : 'user-plus', size === 'sm' ? 15 : 17),
      el('span', { text: following ? 'Siguiendo' : 'Seguir' }),
    );
    button.title = following ? 'Dejar de seguir' : `Seguir a ${user.name || user.username}`;
  }

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!me) return;
    button.disabled = true;
    try {
      const nowFollowing = await toggleFollow(user.id);
      playSound(nowFollowing ? 'follow' : 'open');
      toast(nowFollowing ? `Ahora seguís a ${user.name || user.username}` : 'Dejaste de seguir',
        { type: 'success' });
      paint();
      onChange?.(nowFollowing);
    } catch (err) {
      toast(err.message || 'No se pudo actualizar.', { type: 'error' });
    } finally {
      button.disabled = false;
    }
  });

  paint();
  return button;
}
