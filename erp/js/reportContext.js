// Builds the `ctx` object the pure report/dashboard builders work from, out of
// the live ERP store.
import { store } from './store.js';
import { hourlyRateAsOf, dieselRateAsOf, projectRateAsOf } from './rateHistory.js';
import { operatorAllowanceForRows, isOwnedOperatorAllowancePaymentFor } from './ownedOperatorAllowance.js';
import { netPay as dozerPayrollNetPay, liveBalanceOwed } from './views/dozerPayroll.js';
import { netPay as payrollNetPay } from './views/payroll.js';
import { computeProjectStats } from './views/profitability.js';
import { stationBalances } from './views/fuelCredit.js';
import { getCurrentTier, getCurrentUser, getCurrentUserId, getAssignedProject } from './session.js';
import { buildDailyDashboard } from './dailyDashboardData.js';
import { DASHBOARD_BASIS_FROM } from './rules.js';

// The Daily Operations Dashboard data for one project and day, built from the live
// store. The Daily Operations Dashboard and the main Dashboard both call this, so
// they apply the same rules (rules.js) to the same records.
export function dailyDashboardFor(project, date, since = DASHBOARD_BASIS_FROM) {
  return buildDailyDashboard({ ...liveContext(project), project, date, since: since <= date ? since : date });
}

// The dashboard is deliberately scoped before it is rendered. Operators see
// only their own reported work and dozer; supervisors see their project; the
// maintenance manager sees all dozer/maintenance status but no money panels.
export function dailyDashboardForCurrentUser(project, date, since = DASHBOARD_BASIS_FROM) {
  const user = getCurrentUser() || {};
  const tier = getCurrentTier();
  const role = String(user.role || '').toLowerCase();
  const maintenance = /maintenance|mechanical|fleet manager/.test(role);
  const ctx = liveContext(project);
  if (tier === 'Admin' || tier === 'Accounts') return buildDailyDashboard({ ...ctx, project, date, since: since <= date ? since : date });
  if (maintenance) return buildDailyDashboard({ ...ctx, project, date, since: since <= date ? since : date, operations: ctx.operations, employees: ctx.employees });
  const assignedProject = getAssignedProject();
  const own = ctx.operations.filter((o) => o.operatorId === getCurrentUserId() || o.supervisorId === getCurrentUserId());
  const scoped = tier === 'Supervisor'
    ? ctx.operations.filter((o) => assignedProject && o.siteName === assignedProject)
    : own;
  const scopedProject = tier === 'Supervisor' && assignedProject ? assignedProject : project;
  return buildDailyDashboard({ ...ctx, project: scopedProject, operations: scoped, employees: ctx.employees.filter((e) => e.id === getCurrentUserId() || (assignedProject && e.assignedProject === assignedProject)), fundRequests: [], expenses: [], fuelCreditCollections: [], fuelCreditPayments: [], dieselStockCounts: [], invoices: [], purchaseOrders: [], loans: [], invoicePayments: [], scopedView: true, date, since: since <= date ? since : date });
}

export function liveContext(project) {
  return {
    project,
    operations: store.get('operations'),
    inventory: store.get('inventory'),
    employees: store.get('employees'),
    distributions: store.get('dieselSiteDistributions'),
    fuelCreditCollections: store.get('fuelCreditCollections'),
    fuelCreditPayments: store.get('fuelCreditPayments'),
    fundRequests: store.get('fundRequests'),
    expenses: store.get('expenses'),
    maintenanceLogs: store.get('maintenanceLogs'),
    projects: store.get('projects'),
    invoices: store.get('invoices'),
    customers: store.get('customers'),
    suppliers: store.get('suppliers'),
    purchaseOrders: store.get('purchaseOrders'),
    loans: store.get('loans'),
    leaveRequests: store.get('leaveRequests'),
    assets: store.get('assets'),
    invoicePayments: store.get('invoicePayments'),
    fuelingVouchers: store.get('fuelingVouchers'),
    noticeBoardPosts: store.get('noticeBoardPosts'),
    trainingPrograms: store.get('trainingPrograms'),
    tier: getCurrentTier(),
    // Staff records are HR data: only Admin accounts can open them in the ERP.
    canViewStaffRecords: getCurrentTier() === 'Admin',
    dieselStockCounts: store.get('dieselStockCounts'),
    hourlyRateAsOf,
    dieselRateAsOf,
    projectRateAsOf,
    operatorAllowanceForRows,
    statsFor: (from, to) => {
      if (project !== 'all') return computeProjectStats(project, from, to);
      const names = [...new Set(store.get('projects').map((p) => p.name).filter(Boolean))];
      const rows = names.map((name) => computeProjectStats(name, from, to));
      const merged = { project: 'all' };
      const keys = new Set(rows.flatMap((row) => Object.keys(row)));
      keys.forEach((key) => {
        const values = rows.map((row) => row[key]);
        if (values.every((value) => typeof value === 'number')) merged[key] = values.reduce((sum, value) => sum + value, 0);
        else if (values.every((value) => typeof value === 'boolean')) merged[key] = values.some(Boolean);
      });
      return merged;
    },
    stationBalance: stationBalances().reduce((s, st) => s + Math.max(0, st.balance), 0),
  };
}

// The ctx personHistory.js works from. Lighter than liveContext (no project
// stats or station balances); the money rules are the same functions the
// Operator Allowance and Payroll tabs use, handed in so personHistory.js stays pure.
export function personHistoryContext() {
  return {
    employees: store.get('employees'),
    operations: store.get('operations'),
    fundRequests: store.get('fundRequests'),
    maintenanceLogs: store.get('maintenanceLogs'),
    expenses: store.get('expenses'),
    dozerPayrollRuns: store.get('dozerPayrollRuns'),
    payrollRuns: store.get('payrollRuns'),
    operatorAllowanceForRows,
    isAllowancePaymentFor: isOwnedOperatorAllowancePaymentFor,
    dozerLineNetPay: dozerPayrollNetPay,
    payrollLineNetPay: payrollNetPay,
    dozerBalanceOwed: liveBalanceOwed,
  };
}

