import { renderDashboard } from './views/dashboard.js';
import { renderSales } from './views/sales.js';
import { renderPurchasing } from './views/purchasing.js';
import { renderHR } from './views/hr.js';
import { renderAccounting } from './views/accounting.js';
import { renderOperations } from './views/operations.js';
import { renderFleet } from './views/fleet.js';
import { renderLeaveAttendance } from './views/leaveAttendance.js';
import { renderFundRequests } from './views/fundRequests.js';
import { renderApprovals } from './views/approvals.js';
import { renderPayroll } from './views/payroll.js';
import { renderBackup } from './views/backup.js';
import { closeModal } from './ui.js';
import { canAccess, getCurrentTier, defaultRouteForTier } from './session.js';

export const ROUTES = [
  { path: 'dashboard', label: 'Dashboard', icon: '🏠', render: renderDashboard, tiers: ['Admin', 'Accounts'] },
  { path: 'approvals', label: 'Approvals', icon: '✅', render: renderApprovals, tiers: ['Admin', 'Supervisor'] },
  { path: 'operations', label: 'Daily Operations', icon: '🚜', render: renderOperations, tiers: ['Admin', 'Supervisor'] },
  { path: 'fleet', label: 'Fleet Management', icon: '🔧', render: renderFleet, tiers: ['Admin', 'Supervisor'] },
  { path: 'sales', label: 'Sales & Invoicing', icon: '🧾', render: renderSales, tiers: ['Admin', 'Accounts'] },
  { path: 'purchasing', label: 'Purchasing & Suppliers', icon: '🛒', render: renderPurchasing, tiers: ['Admin', 'Accounts'] },
  { path: 'hr', label: 'HR & Employees', icon: '👷', render: renderHR, tiers: ['Admin'] },
  { path: 'payroll', label: 'Payroll', icon: '🧮', render: renderPayroll, tiers: ['Admin'] },
  { path: 'leave', label: 'Leave & Attendance', icon: '🕒', render: renderLeaveAttendance, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  { path: 'accounting', label: 'Accounting & Expenses', icon: '💰', render: renderAccounting, tiers: ['Admin', 'Accounts'] },
  { path: 'fundRequests', label: 'Fund Requests', icon: '💵', render: renderFundRequests, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  { path: 'backup', label: 'Backup & Data', icon: '💾', render: renderBackup, tiers: ['Admin'] },
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
