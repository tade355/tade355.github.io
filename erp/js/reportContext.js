// Builds the `ctx` object the pure report/dashboard builders work from, out of
// the live ERP store.
import { store } from './store.js';
import { hourlyRateAsOf, dieselRateAsOf, projectRateAsOf } from './rateHistory.js';
import { operatorAllowanceForRows } from './ownedOperatorAllowance.js';
import { computeProjectStats } from './views/profitability.js';
import { stationBalances } from './views/fuelCredit.js';
import { getCurrentTier } from './session.js';

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
