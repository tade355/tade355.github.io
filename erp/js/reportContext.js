// Builds the `ctx` object the pure report/dashboard builders work from, out of
// the live ERP store.
import { store } from './store.js';
import { hourlyRateAsOf, dieselRateAsOf, projectRateAsOf } from './rateHistory.js';
import { operatorAllowanceForRows, isOwnedOperatorAllowancePaymentFor } from './ownedOperatorAllowance.js';
import { netPay as dozerPayrollNetPay, liveBalanceOwed } from './views/dozerPayroll.js';
import { netPay as payrollNetPay } from './views/payroll.js';
import { computeProjectStats } from './views/profitability.js';
import { stationBalances } from './views/fuelCredit.js';
import { getCurrentTier } from './session.js';
import { buildDailyDashboard } from './dailyDashboardData.js';
import { DASHBOARD_BASIS_FROM } from './rules.js';

// The Daily Operations Dashboard data for one project and day, built from the live
// store. The Daily Operations Dashboard and the main Dashboard both call this, so
// they apply the same rules (rules.js) to the same records.
export function dailyDashboardFor(project, date, since = DASHBOARD_BASIS_FROM) {
  return buildDailyDashboard({ ...liveContext(project), project, date, since: since <= date ? since : date });
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
    statsFor: (from, to) => computeProjectStats(project, from, to),
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
