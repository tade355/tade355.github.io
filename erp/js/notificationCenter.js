import { supabase } from './supabaseClient.js';
import { getCurrentUserId } from './session.js';
import { el } from './utils.js';
import { openCustomModal } from './ui.js';

export function initNotificationCenter(container) {
  const button = el('button', { type: 'button', class: 'notification-bell', 'aria-label': 'Notifications', title: 'Notifications' }, [
    el('span', { class: 'notification-bell-icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>' }),
    el('span', { class: 'notification-count', hidden: true, 'aria-hidden': 'true' }),
  ]);
  container.appendChild(button);
  const count = button.querySelector('.notification-count');
  let rows = [];

  async function refresh() {
    const userId = getCurrentUserId();
    if (!userId) return;
    const { data, error } = await supabase.from('erp_notifications')
      .select('id,title,message,target_path,created_at,read_at')
      .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error) {
      button.title = 'Notifications unavailable. Contact the administrator.';
      return;
    }
    rows = data || [];
    const unread = rows.filter((row) => !row.read_at).length;
    count.textContent = unread > 99 ? '99+' : String(unread);
    count.hidden = unread === 0;
    button.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    button.title = unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications';
  }

  button.addEventListener('click', () => {
    openCustomModal({ title: 'Notifications', wide: true, build(body, close) {
      if (!rows.length) {
        body.appendChild(el('p', {}, 'No notifications yet.'));
        return;
      }
      rows.forEach((row) => {
        const link = el('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
          if (!row.read_at) {
            const { error } = await supabase.from('erp_notifications')
              .update({ read_at: new Date().toISOString() }).eq('id', row.id);
            if (!error) row.read_at = new Date().toISOString();
          }
          close();
          await refresh();
          if (row.target_path.startsWith('#/')) window.location.hash = row.target_path;
        } }, [
          el('strong', {}, row.title),
          el('span', {}, ` ${row.message} — ${new Date(row.created_at).toLocaleString('en-GB')}`),
        ]);
        link.style.display = 'block';
        link.style.width = '100%';
        link.style.textAlign = 'left';
        if (!row.read_at) link.style.borderLeft = '3px solid var(--accent, #e9a700)';
        body.appendChild(link);
      });
    } });
  });
  refresh();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
}
