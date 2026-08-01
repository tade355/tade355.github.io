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
import { renderApprovals } from './views/approvals.js';
import { renderPayroll } from './views/payroll.js';
import { renderDozerPayroll } from './views/dozerPayroll.js';
import { renderDozerEconomics } from './views/dozerEconomics.js';
import { renderBackup } from './views/backup.js';
import { renderNoticeBoard } from './views/noticeBoard.js';
import { closeModal } from './ui.js';
import { canAccess, getCurrentTier, defaultRouteForTier } from './session.js';
import { ICONS } from './icons.js';

export const ROUTES = [
  { path: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard, render: renderDashboard, tiers: ['Admin', 'Accounts'] },
  { path: 'noticeBoard', label: 'Documents and Notices', icon: ICONS.documents, render: renderNoticeBoard, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  { path: 'projects', label: 'Projects', icon: ICONS.folder, render: renderProjects, tiers: ['Admin', 'Accounts', 'Supervisor'] },
  { path: 'approvals', label: 'Approvals', icon: ICONS.checkCircle, render: renderApprovals, tiers: ['Admin', 'Supervisor'] },
  { path: 'operations', label: 'Daily Operations', icon: ICONS.activity, render: renderOperations, tiers: ['Admin', 'Supervisor'] },
  { path: 'fleet', label: 'Fleet Management', icon: ICONS.wrench, render: renderFleet, tiers: ['Admin', 'Supervisor'] },
  { path: 'sales', label: 'Sales & Invoicing', icon: ICONS.receipt, render: renderSales, tiers: ['Admin', 'Accounts'] },
  { path: 'purchasing', label: 'Purchasing & Suppliers', icon: ICONS.bag, render: renderPurchasing, tiers: ['Admin', 'Accounts'] },
  { path: 'hr', label: 'HR & Employees', icon: ICONS.users, render: renderHR, tiers: ['Admin'] },
  { path: 'payroll', label: 'Payroll', icon: ICONS.calculator, render: renderPayroll, tiers: ['Admin'] },
  { path: 'dozerPayroll', label: 'Dozer Day-Rate Payroll', icon: ICONS.banknote, render: renderDozerPayroll, tiers: ['Admin'] },
  { path: 'dozerEconomics', label: 'Dozer Economics', icon: ICONS.barChart, render: renderDozerEconomics, tiers: ['Admin', 'Accounts'] },
  { path: 'leave', label: 'Leave & Attendance', icon: ICONS.clock, render: renderLeaveAttendance, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
  { path: 'accounting', label: 'Accounting & Expenses', icon: ICONS.wallet, render: renderAccounting, tiers: ['Admin', 'Accounts'] },
  { path: 'fundRequests', label: 'Fund Requests', icon: ICONS.nairaPaper, render: renderFundRequests, tiers: ['Admin', 'Accounts', 'Supervisor', 'Staff'] },
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
