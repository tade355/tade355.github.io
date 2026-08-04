import { store } from '../store.js';
import { formatCurrency, invoiceTotal, monthKey, monthLabel, el } from '../utils.js';
import { statCard, sectionHeader } from '../ui.js';
import { renderBarChart, renderLineChart, renderMultiLineChart, CATEGORICAL_COLORS } from '../charts.js';
import { isHaOperationType } from '../constants.js';
import { fleetItems, serviceStatusFor } from './fleet.js';
import { stationBalances } from './fuelCredit.js';
import { ownerSettlementBalances } from './dozerEconomics.js';
import { projectNames, computeProjectStats } from './profitability.js';

function lastNMonthKeys(n) {
  const keys = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function monthBounds(key) {
  const [y, m] = key.split('-').map(Number);
  return { from: `${key}-01`, to: new Date(y, m, 0).toISOString().slice(0, 10) };
}

export function renderDashboard(container) {
  container.innerHTML = '';
  const employees = store.get('employees');
  const inventory = store.get('inventory');
  const invoices = store.get('invoices');
  const expenses = store.get('expenses');
  const operations = store.get('operations');

  const currentMonth = monthKey(new Date().toISOString().slice(0, 10));

  const lowStock = inventory.filter((i) => i.quantity <= i.reorderLevel);
  const unpaid = invoices.filter((i) => i.status === 'Unpaid');
  const unpaidTotal = unpaid.reduce((sum, i) => sum + invoiceTotal(i), 0);
  const expensesThisMonth = expenses.filter((e) => monthKey(e.date) === currentMonth).reduce((sum, e) => sum + e.amount, 0);
  const areaThisMonth = operations.filter((o) => monthKey(o.date) === currentMonth && isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);
  const activeSites = new Set(operations.filter((o) => o.status === 'Ongoing').map((o) => o.siteName)).size;

  container.appendChild(sectionHeader('Dashboard', 'Emagrims Ltd — company overview'));

  const lastBackup = store.getLastBackupAt();
  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;
  if (!lastBackup || daysSinceBackup > 7) {
    container.appendChild(el('div', { class: 'backup-nudge' }, [
      el('span', {}, lastBackup
        ? `⚠ It's been ${daysSinceBackup} days since your last backup.`
        : "⚠ You've never backed up this data — everything lives only in this browser."),
      el('a', { href: '#/backup' }, 'Back up now →'),
    ]));
  }

  const statsGrid = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Active Employees', value: String(employees.filter((e) => e.status === 'Active').length), hint: `${employees.length} total` }),
    statCard({ label: 'Low Stock Items', value: String(lowStock.length), hint: lowStock.length ? 'Needs reorder' : 'All stocked', tone: lowStock.length ? 'warning' : 'good' }),
    statCard({ label: 'Expenses This Month', value: formatCurrency(expensesThisMonth) }),
    statCard({ label: 'Land Cleared This Month', value: `${areaThisMonth.toFixed(1)} ha` }),
    statCard({ label: 'Active Sites', value: String(activeSites) }),
  ]);
  container.appendChild(statsGrid);

  // Fleet Health
  const dozers = fleetItems();
  const activeFleetCount = dozers.filter((d) => (d.fleetStatus || 'Active') === 'Active').length;
  const downFleetCount = dozers.filter((d) => d.fleetStatus === 'Down' || d.fleetStatus === 'Under Maintenance').length;
  const serviceStatuses = dozers.map((d) => serviceStatusFor(d).status);
  const overdueServiceCount = serviceStatuses.filter((s) => s === 'Overdue').length;
  const dueSoonServiceCount = serviceStatuses.filter((s) => s === 'Due Soon').length;

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Fleet Health'));
  container.appendChild(el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Fleet Size', value: String(dozers.length) }),
    statCard({ label: 'Active', value: String(activeFleetCount), tone: 'good' }),
    statCard({ label: 'Down / Under Maintenance', value: String(downFleetCount), tone: downFleetCount ? 'warning' : 'good' }),
    statCard({ label: 'Overdue for Service', value: String(overdueServiceCount), tone: overdueServiceCount ? 'critical' : 'good' }),
    statCard({ label: 'Due Soon for Service', value: String(dueSoonServiceCount), tone: dueSoonServiceCount ? 'warning' : 'good' }),
  ]));

  // Money Owed — both directions: what's owed TO the company (receivables)
  // and what the company owes OUT (fuel station credit, Partnership owner
  // settlements) — an executive needs both sides together, not just one.
  const fuelCreditOwed = stationBalances().reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const ownerSettlementsOwed = ownerSettlementBalances().reduce((sum, s) => sum + Math.max(0, s.balance), 0);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Money Owed'));
  container.appendChild(el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Outstanding Invoices (owed to us)', value: formatCurrency(unpaidTotal), hint: `${unpaid.length} unpaid`, tone: unpaid.length ? 'critical' : 'good' }),
    statCard({ label: 'Fuel Credit Owed (to stations)', value: formatCurrency(fuelCreditOwed), tone: fuelCreditOwed ? 'warning' : 'good' }),
    statCard({ label: 'Dozer Owner Settlements Owed', value: formatCurrency(ownerSettlementsOwed), tone: ownerSettlementsOwed ? 'warning' : 'good' }),
  ]));

  // Pending Approvals
  const pendingFundRequests = store.get('fundRequests').filter((r) => r.status === 'Pending').length;
  const pendingLeave = store.get('leaveRequests').filter((r) => r.status === 'Pending').length;
  const pendingVouchers = store.get('fuelingVouchers').filter((r) => r.status === 'Pending Approval').length;

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Pending Approvals'));
  container.appendChild(el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Fund Requests', value: String(pendingFundRequests), tone: pendingFundRequests ? 'warning' : 'good' }),
    statCard({ label: 'Leave Requests', value: String(pendingLeave), tone: pendingLeave ? 'warning' : 'good' }),
    statCard({ label: 'Fueling Vouchers', value: String(pendingVouchers), tone: pendingVouchers ? 'warning' : 'good' }),
  ]));

  const chartsGrid = el('div', { class: 'charts-grid' });
  container.appendChild(chartsGrid);

  const months = lastNMonthKeys(6);

  // Revenue vs Cost vs Profit — company-wide, all projects, reusing the
  // exact same per-project cost/revenue logic as Operation Profitability
  // so this never drifts out of sync with that page's numbers.
  const projects = projectNames();
  const monthlyStats = months.map((key) => {
    const { from, to } = monthBounds(key);
    const perProject = projects.map((p) => computeProjectStats(p, from, to));
    return {
      label: monthLabel(key),
      revenue: perProject.reduce((sum, s) => sum + s.revenue, 0),
      cost: perProject.reduce((sum, s) => sum + s.totalCost, 0),
      profit: perProject.reduce((sum, s) => sum + s.profit, 0),
    };
  });
  const profitCol = el('div');
  chartsGrid.appendChild(profitCol);
  renderMultiLineChart(profitCol, {
    title: 'Revenue vs Cost vs Profit',
    subtitle: 'Company-wide, all projects, last 6 months',
    categories: monthlyStats.map((m) => m.label),
    series: [
      { name: 'Revenue', colorVar: CATEGORICAL_COLORS[0], values: monthlyStats.map((m) => m.revenue) },
      { name: 'Cost', colorVar: CATEGORICAL_COLORS[1], values: monthlyStats.map((m) => m.cost) },
      { name: 'Profit', colorVar: CATEGORICAL_COLORS[2], values: monthlyStats.map((m) => m.profit) },
    ],
    formatValue: formatCurrency,
  });

  const salesCol = el('div');
  chartsGrid.appendChild(salesCol);
  const salesByMonth = months.map((key) => ({
    label: monthLabel(key),
    value: invoices.filter((inv) => monthKey(inv.date) === key).reduce((sum, inv) => sum + invoiceTotal(inv), 0),
  }));
  renderLineChart(salesCol, {
    title: 'Sales Trend',
    subtitle: 'Total invoiced amount, last 6 months',
    points: salesByMonth,
    formatValue: formatCurrency,
  });

  const landCol = el('div');
  chartsGrid.appendChild(landCol);
  const areaByMonth = months.map((key) => ({
    label: monthLabel(key),
    value: operations.filter((o) => monthKey(o.date) === key && isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0),
  }));
  renderLineChart(landCol, {
    title: 'Land Cleared Trend',
    subtitle: 'Hectares (Ha-unit operation types), last 6 months',
    points: areaByMonth,
    formatValue: (v) => `${v.toFixed(1)} ha`,
  });

  const expenseCol = el('div');
  chartsGrid.appendChild(expenseCol);
  const categories = [...new Set(expenses.map((e) => e.category))];
  const expenseBars = categories.map((cat, i) => ({
    label: cat,
    value: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
    colorVar: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));
  renderBarChart(expenseCol, {
    title: 'Expenses by Category',
    subtitle: 'All-time total',
    bars: expenseBars,
    formatValue: formatCurrency,
  });

  const opsCol = el('div');
  chartsGrid.appendChild(opsCol);
  const areaBySite = {};
  operations.filter((o) => isHaOperationType(o.operationType)).forEach((o) => {
    areaBySite[o.siteName] = (areaBySite[o.siteName] || 0) + o.quantity;
  });
  const siteBars = Object.entries(areaBySite).map(([label, value]) => ({ label, value }));
  renderBarChart(opsCol, {
    title: 'Land Cleared by Site',
    subtitle: 'Hectares (Felling, Stacking, Direct Stacking, Root Picking, Bonding), all-time',
    bars: siteBars,
    formatValue: (v) => `${v.toFixed(1)} ha`,
  });
}
