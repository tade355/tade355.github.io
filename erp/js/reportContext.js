// Builds the `ctx` object the pure report/dashboard builders work from, out of
// the live ERP store.
import { store } from './store.js';
import { hourlyRateAsOf, dieselRateAsOf, projectRateAsOf } from './rateHistory.js';
import { operatorAllowanceForRows } from './ownedOperatorAllowance.js';
import { computeProjectStats } from './views/profitability.js';
import { stationBalances } from './views/fuelCredit.js';

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
    dieselStockCounts: store.get('dieselStockCounts'),
    hourlyRateAsOf,
    dieselRateAsOf,
    projectRateAsOf,
    operatorAllowanceForRows,
    statsFor: (from, to) => computeProjectStats(project, from, to),
    stationBalance: stationBalances().reduce((s, st) => s + Math.max(0, st.balance), 0),
  };
}
