import { renderDashboard } from './views/dashboard.js';
import { renderInventory } from './views/inventory.js';
import { renderSales } from './views/sales.js';
import { renderPurchasing } from './views/purchasing.js';
import { renderHR } from './views/hr.js';
import { renderAccounting } from './views/accounting.js';
import { renderOperations } from './views/operations.js';
import { renderFleet } from './views/fleet.js';
import { renderProfitability } from './views/profitability.js';
import { renderLeaveAttendance } from './views/leaveAttendance.js';
import { renderFundRequests } from './views/fundRequests.js';
import { closeModal } from './ui.js';

export const ROUTES = [
  { path: 'dashboard', label: 'Dashboard', icon: '🏠', render: renderDashboard },
  { path: 'operations', label: 'Daily Operations', icon: '🚜', render: renderOperations },
  { path: 'fleet', label: 'Fleet Management', icon: '🔧', render: renderFleet },
  { path: 'inventory', label: 'Inventory & Equipment', icon: '📦', render: renderInventory },
  { path: 'sales', label: 'Sales & Invoicing', icon: '🧾', render: renderSales },
  { path: 'purchasing', label: 'Purchasing & Suppliers', icon: '🛒', render: renderPurchasing },
  { path: 'hr', label: 'HR & Employees', icon: '👷', render: renderHR },
  { path: 'leave', label: 'Leave & Attendance', icon: '🕒', render: renderLeaveAttendance },
  { path: 'accounting', label: 'Accounting & Expenses', icon: '💰', render: renderAccounting },
  { path: 'fundRequests', label: 'Fund Requests', icon: '💵', render: renderFundRequests },
  { path: 'profitability', label: 'Profitability', icon: '📈', render: renderProfitability },
];

export function initRouter(viewContainer, onRouteChange) {
  function currentPath() {
    const hash = window.location.hash.replace('#/', '');
    return ROUTES.find((r) => r.path === hash) ? hash : 'dashboard';
  }

  function render() {
    closeModal();
    const path = currentPath();
    const route = ROUTES.find((r) => r.path === path);
    route.render(viewContainer);
    onRouteChange(path);
    viewContainer.scrollTop = 0;
  }

  window.addEventListener('hashchange', render);
  if (!window.location.hash) window.location.hash = '#/dashboard';
  else render();

  return { render, currentPath };
}
