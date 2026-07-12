import { ROUTES, initRouter } from './router.js';
import { initModalRoot } from './ui.js';
import { store } from './store.js';
import { el } from './utils.js';

const sidebarNav = document.getElementById('sidebarNav');
const viewContainer = document.getElementById('view');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const resetBtn = document.getElementById('resetDataBtn');

initModalRoot();

const navLinks = {};
ROUTES.forEach((route) => {
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
