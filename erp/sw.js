self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = {}; }
  const title = typeof data.title === 'string' ? data.title : 'Emagrims ERP';
  const body = typeof data.body === 'string' ? data.body : 'You have a new notification.';
  const path = typeof data.url === 'string' && data.url.startsWith('#/') ? data.url : '#/actionCenter';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/erp/assets/favicon.png',
    badge: '/erp/assets/favicon.png',
    tag: 'erp-' + Date.now(),
    data: { url: '/erp/' + path },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/erp/#/actionCenter', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.location.origin + '/erp/'));
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  })());
});
