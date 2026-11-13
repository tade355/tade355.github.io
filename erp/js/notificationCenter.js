import { supabase } from './supabaseClient.js';
import { getCurrentUserId } from './session.js';
import { el } from './utils.js';
import { openCustomModal } from './ui.js';

const notificationDateTime = (value) => new Date(value).toLocaleString('en-GB', {
  timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});

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
    const [items, total, tasks, unreadTasks] = await Promise.all([
      supabase.from('erp_notifications').select('id,title,message,target_path,created_at,read_at')
        .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(100),
      supabase.from('erp_notifications').select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId).is('read_at', null),
      supabase.from('staff_action_items').select('id,title,description,source_title,due_date,created_at,viewed_at')
        .eq('assignee_id', userId).order('created_at', { ascending: false }).limit(100),
      supabase.from('staff_action_items').select('id', { count: 'exact', head: true })
        .eq('assignee_id', userId).is('viewed_at', null),
    ]);
    const optionalTaskError = (result) => result.error && ['42P01', 'PGRST205'].includes(result.error.code);
    if (items.error || total.error) {
      button.title = 'Notifications unavailable. Contact the administrator.';
      return;
    }
    if (tasks.error && !optionalTaskError(tasks)) {
      button.title = 'Task alerts unavailable. Contact the administrator.';
    }
    const taskRows = tasks.error ? [] : (tasks.data || []).map((task) => ({
      id: 'action:' + task.id,
      action_id: task.id,
      title: 'Action assigned: ' + task.title,
      message: [task.description || task.source_title || '', task.due_date ? 'Due ' + task.due_date : ''].filter(Boolean).join(' · '),
      target_path: '#/actionCenter',
      created_at: task.created_at,
      read_at: task.viewed_at,
    }));
    rows = [...(items.data || []), ...taskRows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    unread = (total.count || 0) + (unreadTasks.error && !optionalTaskError(unreadTasks) ? 0 : (unreadTasks.count || 0));
    count.textContent = unread > 99 ? '99+' : String(unread);
    count.hidden = unread === 0;
    button.setAttribute('aria-label', unread ? 'Notifications, ' + unread + ' unread' : 'Notifications');
    button.title = unread ? unread + ' unread notification' + (unread === 1 ? '' : 's') : 'Notifications';
  }

  button.addEventListener('click', async () => {
    await refresh();
    openCustomModal({ title: 'Notifications', wide: true, build(body, close) {
      let filter = 'Unread';
      const toolbar = el('div', { class: 'notification-toolbar' });
      const list = el('div', { class: 'notification-list' });
      const feedback = el('p', { class: 'notification-feedback', role: 'status' });
      const tabs = ['Unread', 'Read'].map((name) => el('button', {
        type: 'button', class: 'btn btn-ghost', onClick: () => { filter = name; render(); },
      }, name));
      const markAll = el('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
        markAll.disabled = true;
        feedback.textContent = '';
        const now = new Date().toISOString();
        const results = await Promise.all([
          supabase.from('erp_notifications').update({ read_at: now }).eq('recipient_id', getCurrentUserId()).is('read_at', null),
          supabase.from('staff_action_items').update({ viewed_at: now }).eq('assignee_id', getCurrentUserId()).is('viewed_at', null),
        ]);
        const blocked = results.some((result) => result.error && !['42P01', 'PGRST205'].includes(result.error.code));
        if (blocked) feedback.textContent = 'Could not mark notifications as read. Please try again.';
        else {
          rows.forEach((row) => { row.read_at ||= now; });
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
        const visible = rows.filter((row) => filter === 'Unread' ? !row.read_at : !!row.read_at);
        if (!visible.length) {
          list.appendChild(el('p', {}, filter === 'Unread' ? 'You are all caught up.' : 'No read notifications in history.'));
          return;
        }
        visible.forEach((row) => {
          const link = el('button', { type: 'button', class: 'btn btn-ghost notification-item', onClick: async () => {
            if (!row.read_at) {
              const now = new Date().toISOString();
              const result = row.action_id
                ? await supabase.from('staff_action_items').update({ viewed_at: now }).eq('id', row.action_id)
                : await supabase.from('erp_notifications').update({ read_at: now }).eq('id', row.id);
              if (!result.error) row.read_at = now;
            }
            close();
            await refresh();
            if (row.target_path?.startsWith('#/')) window.location.hash = row.target_path;
          } }, [
            el('span', { class: 'notification-item-head' }, [
              el('strong', {}, row.title),
              el('time', { class: 'notification-item-time', dateTime: row.created_at }, notificationDateTime(row.created_at)),
            ]),
            el('span', { class: 'notification-item-message' }, row.message),
            el('span', { class: 'notification-item-footer' }, [
              el('span', {}, row.read_at ? 'Read' : 'New'),
              row.target_path?.startsWith('#/') ? el('span', { class: 'notification-item-open' }, 'Open related item →') : null,
            ]),
          ]);
          if (!row.read_at) link.classList.add('notification-item-unread');
          list.appendChild(link);
        });
      }
      render();
    } });
  });
  window.addEventListener('erp-action-assigned', refresh);
  refresh();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 10000);
}
