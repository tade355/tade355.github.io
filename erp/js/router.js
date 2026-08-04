import { renderDashboard } from './views/dashboard.js';
import { renderProjects } from './views/projects.js';
import { renderSales } from './views/sales.js';
import { renderPurchasing } from './views/purchasing.js';
import { renderHR } from './views/hr.js';
import { renderAccounting } from './views/accounting.js';
import { renderOperations } from './views/operations.js';
import { renderFleet } from './views/fleet.js';
import { renderLeaveAttendance } from './views/leaveAttendance.js';
import { renderFundRequests } from './views/fundRequests.js';
import { renderBackup } from './views/backup.js';
import { renderNoticeBoard } from './views/noticeBoard.js';
import { closeModal } from './ui.js';
import { canAccess, getCurrentTier, defaultRouteForTier } from './session.js';
import { ICONS } from './icons.js';

// Approvals lives inside Fund Requests, Fuel Credit and Bulldozer Parts &
// Supplies inside Purchasing & Suppliers, Dozer Economics inside Fleet
// Management, Weekly Report and Profitability inside Projects, and Payroll
// / Operator Allowance inside HR & Employees — all as tabs, not routes. See
// each view file's own tab bar for those.
export const ROUTES = [
  // Overview
  { path: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard, render: renderDashboard, tiers: ['Admin', 'Accounts'] },
  { path: 'noticeBoard', label: 'Documents and Notices', icon: ICONS.documents, render: renderNoticeBoard, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  // Field operations: the job, the work done against it, the equipment doing it
  { path: 'projects', label: 'Projects', icon: ICONS.folder, render: renderProjects, tiers: ['Admin', 'Accounts', 'Supervisor'] },
  { path: 'operations', label: 'Daily Operations', icon: ICONS.activity, render: renderOperations, tiers: ['Admin', 'Supervisor'] },
  { path: 'fleet', label: 'Fleet Management', icon: ICONS.wrench, render: renderFleet, tiers: ['Admin', 'Supervisor'] },
  // Commercial: money moving with outside parties
  { path: 'sales', label: 'Sales & Invoicing', icon: ICONS.receipt, render: renderSales, tiers: ['Admin', 'Accounts'] },
  { path: 'purchasing', label: 'Purchasing & Suppliers', icon: ICONS.bag, render: renderPurchasing, tiers: ['Admin', 'Accounts'] },
  // Finance: internal money control
  { path: 'accounting', label: 'Accounting & Expenses', icon: ICONS.wallet, render: renderAccounting, tiers: ['Admin', 'Accounts'] },
  { path: 'fundRequests', label: 'Fund Requests & Approvals', icon: ICONS.nairaPaper, render: renderFundRequests, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  // People
  { path: 'hr', label: 'HR & Employees', icon: ICONS.users, render: renderHR, tiers: ['Admin'] },
  { path: 'leave', label: 'Leave & Attendance', icon: ICONS.clock, render: renderLeaveAttendance, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  // System
  { path: 'backup', label: 'Backup & Data', icon: ICONS.database, render: renderBackup, tiers: ['Admin'] },
];

export function initRouter(viewContainer, onRouteChange) {
  function currentPath() {
    const hash = window.location.hash.replace('#/', '');
    const route = ROUTES.find((r) => r.path === hash);
    if (route && canAccess(route.tiers)) return hash;
    return defaultRouteForTier(getCurrentTier());
  }

  function render() {
    closeModal();
    const path = currentPath();
    if (window.location.hash.replace('#/', '') !== path) {
      window.location.hash = `#/${path}`;
      return;
    }
    const route = ROUTES.find((r) => r.path === path);
    route.render(viewContainer);
    onRouteChange(path);
    viewContainer.scrollTop = 0;
  }

  window.addEventListener('hashchange', render);
  if (!window.location.hash) window.location.hash = `#/${defaultRouteForTier(getCurrentTier())}`;
  else render();

  return { render, currentPath };
}
