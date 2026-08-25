import { closeModal } from './ui.js';
import { el } from './utils.js';
import { canAccess, getCurrentTier, defaultRouteForTier } from './session.js';
import { ICONS } from './icons.js';

// Each route's view module loads on demand (dynamic import), not upfront —
// so a problem loading one view's code (a network hiccup, something
// interfering between the browser and the server) only breaks that one
// page instead of blocking the whole app from booting, since every view
// used to be imported statically at the top of this file before any
// route could render at all, Dashboard included.
//
// Approvals lives inside Fund Requests, Fuel Credit inside Purchasing &
// Suppliers, Dozer Economics inside Fleet Management, Weekly Report and
// Profitability inside Projects, Payroll / Operator Allowance inside HR &
// Employees, and Diesel Management / Bulldozer Parts & Supplies / Dozer
// Rent Payments / Lubricants & Consumables inside Resource Management —
// all as tabs, not routes. See each view file's own tab bar for those.
export const ROUTES = [
  // Overview
  { path: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard, load: () => import('./views/dashboard.js').then((m) => m.renderDashboard), tiers: ['Admin', 'Accounts'] },
  { path: 'noticeBoard', label: 'Documents and Notices', icon: ICONS.documents, load: () => import('./views/noticeBoard.js').then((m) => m.renderNoticeBoard), tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  // Field operations: the job, the work done against it, the equipment doing it
  { path: 'projects', label: 'Projects', icon: ICONS.folder, load: () => import('./views/projects.js').then((m) => m.renderProjects), tiers: ['Admin', 'Accounts', 'Supervisor'] },
  { path: 'operations', label: 'Daily Operations', icon: ICONS.activity, load: () => import('./views/operations.js').then((m) => m.renderOperations), tiers: ['Admin', 'Supervisor'] },
  { path: 'fleet', label: 'Fleet Management', icon: ICONS.wrench, load: () => import('./views/fleet.js').then((m) => m.renderFleet), tiers: ['Admin', 'Supervisor'] },
  { path: 'resourceManagement', label: 'Resource Management', icon: ICONS.fuelCan, load: () => import('./views/resourceManagement.js').then((m) => m.renderResourceManagement), tiers: ['Admin', 'Accounts', 'Supervisor'] },
  // Commercial: money moving with outside parties
  { path: 'sales', label: 'Sales & Invoicing', icon: ICONS.receipt, load: () => import('./views/sales.js').then((m) => m.renderSales), tiers: ['Admin', 'Accounts'] },
  { path: 'purchasing', label: 'Purchasing & Suppliers', icon: ICONS.bag, load: () => import('./views/purchasing.js').then((m) => m.renderPurchasing), tiers: ['Admin', 'Accounts'] },
  // Finance: internal money control
  { path: 'accounting', label: 'Accounting & Expenses', icon: ICONS.wallet, load: () => import('./views/accounting.js').then((m) => m.renderAccounting), tiers: ['Admin', 'Accounts'] },
  { path: 'fundRequests', label: 'Fund Requests & Approvals', icon: ICONS.nairaPaper, load: () => import('./views/fundRequests.js').then((m) => m.renderFundRequests), tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  // People
  { path: 'hr', label: 'HR & Employees', icon: ICONS.users, load: () => import('./views/hr.js').then((m) => m.renderHR), tiers: ['Admin'] },
  { path: 'leave', label: 'Leave & Attendance', icon: ICONS.clock, load: () => import('./views/leaveAttendance.js').then((m) => m.renderLeaveAttendance), tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  { path: 'mySalary', label: 'My Salary', icon: ICONS.banknote, load: () => import('./views/mySalary.js').then((m) => m.renderMySalary), tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  { path: 'training', label: 'Day 1 Knowledge Check', icon: ICONS.checkCircle, load: () => import('./views/training.js').then((m) => m.renderTraining), tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  // System
  { path: 'backup', label: 'Backup & Data', icon: ICONS.database, load: () => import('./views/backup.js').then((m) => m.renderBackup), tiers: ['Admin'] },
];

export function initRouter(viewContainer, onRouteChange) {
  function currentPath() {
    const hash = window.location.hash.replace('#/', '');
    const route = ROUTES.find((r) => r.path === hash);
    if (route && canAccess(route.tiers)) return hash;
    return defaultRouteForTier(getCurrentTier());
  }

  // A render token guards against a slow/failed load finishing after the
  // user has already navigated elsewhere and overwriting that newer page.
  let renderToken = 0;

  async function render() {
    closeModal();
    const path = currentPath();
    if (window.location.hash.replace('#/', '') !== path) {
      window.location.hash = `#/${path}`;
      return;
    }
    const route = ROUTES.find((r) => r.path === path);
    const token = ++renderToken;
    onRouteChange(path);
    viewContainer.scrollTop = 0;
    viewContainer.innerHTML = '';
    viewContainer.appendChild(el('p', { class: 'table-empty' }, 'Loading…'));
    try {
      const renderFn = await route.load();
      if (token !== renderToken) return;
      viewContainer.innerHTML = '';
      renderFn(viewContainer);
    } catch (err) {
      if (token !== renderToken) return;
      console.error(`Failed to load the "${route.label}" page.`, err);
      viewContainer.innerHTML = '';
      viewContainer.appendChild(el('div', { class: 'table-empty' }, [
        el('p', {}, `Couldn't load the "${route.label}" page. This is usually a network hiccup, not a data problem — your data is safe.`),
        el('button', { type: 'button', class: 'btn btn-primary', onClick: () => render() }, 'Retry'),
      ]));
    }
  }

  window.addEventListener('hashchange', render);
  if (!window.location.hash) window.location.hash = `#/${defaultRouteForTier(getCurrentTier())}`;
  else render();

  return { render, currentPath };
}
