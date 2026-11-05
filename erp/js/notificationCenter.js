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
  let unread = 0;

  async function refresh() {
    const userId = getCurrentUserId();
    if (!userId) return;
    const [items, total] = await Promise.all([
      supabase.from('erp_notifications').select('id,title,message,target_path,created_at,read_at')
        .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(100),
      supabase.from('erp_notifications').select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId).is('read_at', null),
    ]);
    if (items.error || total.error) {
      button.title = 'Notifications unavailable. Contact the administrator.';
      return;
    }
    rows = items.data || [];
    unread = total.count || 0;
    count.textContent = unread > 99 ? '99+' : String(unread);
    count.hidden = unread === 0;
    button.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    button.title = unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications';
  }

  button.addEventListener('click', async () => {
    await refresh();
    openCustomModal({ title: 'Notifications', wide: true, build(body, close) {
      let filter = 'All';
      const toolbar = el('div', { class: 'notification-toolbar' });
      const list = el('div', { class: 'notification-list' });
      const feedback = el('p', { class: 'notification-feedback', role: 'status' });
      const tabs = ['All', 'Unread', 'Read'].map((name) => el('button', {
        type: 'button', class: 'btn btn-ghost', onClick: () => { filter = name; render(); },
      }, name));
      const markAll = el('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
        markAll.disabled = true;
        feedback.textContent = '';
        const { error } = await supabase.from('erp_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('recipient_id', getCurrentUserId()).is('read_at', null);
        if (error) feedback.textContent = 'Could not mark notifications as read. Please try again.';
        else {
          rows.forEach((row) => { row.read_at ||= new Date().toISOString(); });
          await refresh();
        }
        markAll.disabled = false;
        render();
      } }, 'Mark all as read');
      toolbar.append(...tabs, markAll);
      body.append(toolbar, feedback, list);

      function render() {
        tabs.forEach((tab) => {
          tab.setAttribute('aria-pressed', String(tab.textContent === filter));
          tab.classList.toggle('notification-filter-active', tab.textContent === filter);
        });
        markAll.disabled = unread === 0;
        list.replaceChildren();
        const visible = rows.filter((row) => filter === 'All' || (filter === 'Unread' ? !row.read_at : !!row.read_at));
        if (!visible.length) {
          list.appendChild(el('p', {}, filter === 'All' ? 'No notifications yet.' : `No ${filter.toLowerCase()} notifications.`));
          return;
        }
        visible.forEach((row) => {
          const link = el('button', { type: 'button', class: 'btn btn-ghost notification-item', onClick: async () => {
            if (!row.read_at) {
              const now = new Date().toISOString();
              const { error } = await supabase.from('erp_notifications').update({ read_at: now }).eq('id', row.id);
              if (!error) row.read_at = now;
            }
            close();
            await refresh();
            if (row.target_path?.startsWith('#/')) window.location.hash = row.target_path;
          } }, [
            el('strong', {}, row.title),
            el('span', {}, ` ${row.message} — ${new Date(row.created_at).toLocaleString('en-GB')}`),
          ]);
          if (!row.read_at) link.classList.add('notification-item-unread');
          list.appendChild(link);
        });
      }
      render();
    } });
  });
  refresh();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 10000);
}
