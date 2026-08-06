import { ROUTES, initRouter } from './router.js';
import { initModalRoot, initToastRoot, openModal } from './ui.js';
import { store } from './store.js';
import { el } from './utils.js';
import { getCurrentUser, getCurrentTier, canAccess } from './session.js';
import { showLoginForm } from './userGate.js';
import { restoreSession, logout, changePassword } from './auth.js';
import { initThemeSwitch } from './theme.js';

const sidebarNav = document.getElementById('sidebarNav');
const viewContainer = document.getElementById('view');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const refreshBtn = document.getElementById('refreshDataBtn');
const userBadge = document.getElementById('userBadge');
const loadingScreen = document.getElementById('loadingScreen');
const loadingMessage = document.getElementById('loadingMessage');

initModalRoot();
initToastRoot();
initThemeSwitch();

// Every date field in the app is a plain <input type="date">, built fresh
// each time a form/modal opens — rather than wiring a picker per field,
// one delegated listener at the document level covers every date input
// that will ever exist, including ones inside modals that don't exist yet.
// showPicker() makes the calendar pop immediately on click/focus instead of
// depending on the browser's own (inconsistent — Firefox needs the small
// icon specifically) affordance for opening it.
function initDateInputAutoPicker() {
  const openPicker = (evt) => {
    const target = evt.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'date' || target.disabled || target.readOnly) return;
    if (typeof target.showPicker !== 'function') return;
    try { target.showPicker(); } catch { /* not a user gesture, or unsupported here — native fallback still works */ }
  };
  document.addEventListener('focus', openPicker, true);
  document.addEventListener('click', openPicker, true);
}
initDateInputAutoPicker();

function openChangePasswordForm() {
  openModal({
    title: 'Change Password',
    fields: [
      { name: 'newPassword', label: 'New Password', type: 'password', required: true },
    ],
    initial: {},
    submitLabel: 'Change Password',
    onSubmit: async (data) => {
      await changePassword(data.newPassword);
      window.alert('Password changed.');
    },
  });
}

function renderUserBadge() {
  userBadge.innerHTML = '';
  const user = getCurrentUser();
  if (!user) return;
  userBadge.appendChild(el('div', { class: 'user-badge' }, [
    el('div', {}, [
      el('span', { class: 'user-badge-name' }, user.name),
      el('span', { class: 'user-badge-tier' }, getCurrentTier()),
    ]),
    el('div', { class: 'user-badge-actions' }, [
      el('button', {
        type: 'button',
        class: 'user-badge-switch',
        onClick: openChangePasswordForm,
      }, 'Change Password'),
      el('button', {
        type: 'button',
        class: 'user-badge-switch',
        onClick: async () => {
          await logout();
          window.location.reload();
        },
      }, 'Log Out'),
    ]),
  ]));
}

function initApp() {
  renderUserBadge();

  const navLinks = {};
  ROUTES.forEach((route) => {
    if (!canAccess(route.tiers)) return;
    const link = el('a', { href: `#/${route.path}`, class: 'nav-link' }, [
      el('span', { class: 'nav-icon', 'aria-hidden': 'true', html: route.icon }),
      el('span', {}, route.label),
    ]);
    navLinks[route.path] = link;
    sidebarNav.appendChild(link);
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  });

  const router = initRouter(viewContainer, (path) => {
    Object.entries(navLinks).forEach(([key, link]) => {
      link.classList.toggle('active', key === path);
    });
  });

  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Background refreshes must not disrupt whatever the user is doing —
  // router.render() closes any open modal and resets each view's local
  // state (active tab, search text), so it's only safe to call from an
  // explicit user action. Passive syncs (tab regaining focus, the
  // background timer) just refresh the underlying cache silently; the
  // update shows up next time the user navigates or clicks Refresh Data.
  async function silentRefresh() {
    try {
      await store.refreshAll();
    } catch (err) {
      console.warn('Background refresh failed.', err);
    }
  }

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    await silentRefresh();
    await router.render();
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ Refresh Data';
  });

  // This app has no realtime push — data syncs by refetching. Refresh
  // whenever the tab regains focus (someone switching back to check on
  // something) and on a slow background timer for tabs left open.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') silentRefresh();
  });
  setInterval(silentRefresh, 90000);
}

async function boot() {
  try {
    await store.init();
  } catch (err) {
    loadingMessage.textContent = `Could not connect to the shared database: ${err.message}`;
    const retryBtn = el('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'Retry');
    retryBtn.addEventListener('click', () => window.location.reload());
    loadingScreen.querySelector('.gate-card').appendChild(retryBtn);
    return;
  }
  loadingScreen.classList.remove('open');

  const employee = await restoreSession();
  if (!employee) {
    showLoginForm(() => window.location.reload());
    return;
  }
  initApp();
}

boot();
