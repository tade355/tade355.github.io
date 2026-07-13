import { ROUTES, initRouter } from './router.js';
import { initModalRoot } from './ui.js';
import { store } from './store.js';
import { el } from './utils.js';
import { getCurrentUserId, getCurrentUser, getCurrentTier, canAccess, setCurrentUserId } from './session.js';
import { showUserGate } from './userGate.js';

const sidebarNav = document.getElementById('sidebarNav');
const viewContainer = document.getElementById('view');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const resetBtn = document.getElementById('resetDataBtn');
const userBadge = document.getElementById('userBadge');

initModalRoot();

function renderUserBadge() {
  userBadge.innerHTML = '';
  const user = getCurrentUser();
  if (!user) return;
  userBadge.appendChild(el('div', { class: 'user-badge' }, [
    el('div', {}, [
      el('span', { class: 'user-badge-name' }, user.name),
      el('span', { class: 'user-badge-tier' }, getCurrentTier()),
    ]),
    el('button', {
      type: 'button',
      class: 'user-badge-switch',
      onClick: () => {
        setCurrentUserId(null);
        window.location.reload();
      },
    }, 'Switch'),
  ]));
}

function initApp() {
  renderUserBadge();

  const navLinks = {};
  ROUTES.forEach((route) => {
    if (!canAccess(route.tiers)) return;
    const link = el('a', { href: `#/${route.path}`, class: 'nav-link' }, [
      el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, route.icon),
      el('span', {}, route.label),
    ]);
    navLinks[route.path] = link;
    sidebarNav.appendChild(link);
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  });

  initRouter(viewContainer, (path) => {
    Object.entries(navLinks).forEach(([key, link]) => {
      link.classList.toggle('active', key === path);
    });
  });

  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  resetBtn.addEventListener('click', () => {
    if (window.confirm('Reset all ERP data back to the sample dataset? Your changes will be lost.')) {
      store.resetSeed();
      window.location.reload();
    }
  });
}

function boot() {
  if (!getCurrentUserId() || !getCurrentUser()) {
    showUserGate(() => window.location.reload());
    return;
  }
  initApp();
}

boot();
