import { store } from '../store.js';
import { formatCurrency, formatDate, invoiceTotal, monthKey, monthLabel, el } from '../utils.js';
import { statCard, sectionHeader } from '../ui.js';
import { renderBarChart, renderLineChart, renderMultiLineChart, CATEGORICAL_COLORS } from '../charts.js';
import { isHaOperationType } from '../constants.js';
import { fleetItems, serviceStatusFor } from './fleet.js';
import { stationBalances } from './fuelCredit.js';
import { ownerSettlementBalances } from './dozerRentPayments.js';
import { projectNames, computeProjectStats } from './profitability.js';
import { getCurrentUser } from '../session.js';

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

// `invert` flips which direction counts as "good" — e.g. Expenses rising
// is bad, so invert: true there, while Revenue rising is good by default.
function trendFor(current, previous, { invert = false } = {}) {
  if (!previous && !current) return { direction: 'flat', label: 'No activity last month either', tone: 'neutral' };
  if (!previous) return { direction: 'up', label: 'New this month', tone: invert ? 'warning' : 'good' };
  const diffPct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(diffPct) < 0.5) return { direction: 'flat', label: 'Flat vs last month', tone: 'neutral' };
  const direction = diffPct > 0 ? 'up' : 'down';
  const isGood = (direction === 'up') !== invert;
  return { direction, label: `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(0)}% vs last month`, tone: isGood ? 'good' : 'warning' };
}

function leaderboardCard(title, subtitle, rows, emptyText) {
  const card = el('div', { class: 'leaderboard-card' }, [
    el('h3', {}, title),
    el('p', { class: 'chart-subtitle' }, subtitle),
  ]);
  if (!rows.length) {
    card.appendChild(el('p', { class: 'leaderboard-empty' }, emptyText));
    return card;
  }
  rows.forEach((r, i) => {
    card.appendChild(el('div', { class: 'leaderboard-row' }, [
      el('span', { class: 'leaderboard-rank' }, String(i + 1)),
      el('span', { class: 'leaderboard-name' }, r.name),
      r.meta ? el('span', { class: 'leaderboard-meta' }, r.meta) : null,
      el('span', { class: 'leaderboard-value' }, r.value),
    ]));
  });
  return card;
}

export function renderDashboard(container) {
  container.innerHTML = '';
  const employees = store.get('employees');
  const inventory = store.get('inventory');
  const invoices = store.get('invoices');
  const expenses = store.get('expenses');
  const operations = store.get('operations');

  const months = lastNMonthKeys(6);
  const currentMonthKey = months[5];
  const prevMonthKey = months[4];

  const lowStock = inventory.filter((i) => i.quantity <= i.reorderLevel);
  const outOfStock = inventory.filter((i) => i.quantity <= 0);
  const unpaid = invoices.filter((i) => i.status === 'Unpaid');
  const unpaidTotal = unpaid.reduce((sum, i) => sum + invoiceTotal(i), 0);

  const expensesForMonth = (key) => expenses.filter((e) => monthKey(e.date) === key).reduce((sum, e) => sum + e.amount, 0);
  const areaForMonth = (key) => operations.filter((o) => monthKey(o.date) === key && isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);
  const revenueForMonth = (key) => invoices.filter((inv) => monthKey(inv.date) === key).reduce((sum, inv) => sum + invoiceTotal(inv), 0);

  const expensesThisMonth = expensesForMonth(currentMonthKey);
  const areaThisMonth = areaForMonth(currentMonthKey);
  const revenueThisMonth = revenueForMonth(currentMonthKey);
  const activeSites = new Set(operations.filter((o) => o.status === 'Ongoing').map((o) => o.siteName)).size;

  // Revenue vs Cost vs Profit — company-wide, all projects, reusing the
  // exact same per-project cost/revenue logic as Operation Profitability
  // so this never drifts out of sync with that page's numbers. Computed
  // early (rather than just before the chart) so the KPI row below can
  // pull this month's and last month's profit out of the same numbers.
  const projects = projectNames();
  const monthlyStats = months.map((key) => {
    const { from, to } = monthBounds(key);
    const perProject = projects.map((p) => computeProjectStats(p, from, to));
    return {
      key,
      label: monthLabel(key),
      revenue: perProject.reduce((sum, s) => sum + s.revenue, 0),
      cost: perProject.reduce((sum, s) => sum + s.totalCost, 0),
      profit: perProject.reduce((sum, s) => sum + s.profit, 0),
    };
  });
  const profitThisMonth = monthlyStats[5].profit;
  const profitLastMonth = monthlyStats[4].profit;

  // Greeting — a small personal touch so this reads as a live briefing
  // rather than a static report.
  const user = getCurrentUser();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const firstName = (user?.name || '').split(' ')[0];
  container.appendChild(sectionHeader('Dashboard', `${greeting}${firstName ? ', ' + firstName : ''} — here's how Emagrims Ltd is doing today, ${todayLabel}.`));

  // KPI hero row — the headline numbers, each linking to the module that
  // owns the data and showing month-over-month trend where it's meaningful.
  const kpiGrid = el('div', { class: 'kpi-grid' }, [
    statCard({
      icon: '💰', label: 'Revenue This Month', value: formatCurrency(revenueThisMonth), href: '#/sales',
      trend: trendFor(revenueThisMonth, revenueForMonth(prevMonthKey)),
    }),
    statCard({
      icon: '📈', label: 'Profit This Month', value: formatCurrency(profitThisMonth), href: '#/accounting',
      trend: trendFor(profitThisMonth, profitLastMonth),
    }),
    statCard({
      icon: '💸', label: 'Expenses This Month', value: formatCurrency(expensesThisMonth), href: '#/accounting',
      trend: trendFor(expensesThisMonth, expensesForMonth(prevMonthKey), { invert: true }),
    }),
    statCard({
      icon: '🚜', label: 'Land Cleared This Month', value: `${areaThisMonth.toFixed(1)} ha`, href: '#/operations',
      trend: trendFor(areaThisMonth, areaForMonth(prevMonthKey)),
    }),
    statCard({ icon: '📍', label: 'Active Sites', value: String(activeSites), href: '#/operations' }),
    statCard({ icon: '👥', label: 'Active Employees', value: String(employees.filter((e) => e.status === 'Active').length), hint: `${employees.length} total`, href: '#/hr' }),
  ]);
  container.appendChild(kpiGrid);

  // Fleet Health (secondary snapshot — the urgent items inside it feed the
  // Needs Attention list below instead of being duplicated here)
  const dozers = fleetItems();
  const activeFleetCount = dozers.filter((d) => (d.fleetStatus || 'Active') === 'Active').length;
  const downFleetCount = dozers.filter((d) => d.fleetStatus === 'Down' || d.fleetStatus === 'Under Maintenance').length;
  const serviceStatuses = dozers.map((d) => serviceStatusFor(d).status);
  const overdueServiceCount = serviceStatuses.filter((s) => s === 'Overdue').length;
  const dueSoonServiceCount = serviceStatuses.filter((s) => s === 'Due Soon').length;

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Fleet Snapshot'));
  container.appendChild(el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Fleet Size', value: String(dozers.length), href: '#/fleet' }),
    statCard({ label: 'Active', value: String(activeFleetCount), tone: 'good', href: '#/fleet' }),
    statCard({ label: 'Down / Under Maintenance', value: String(downFleetCount), tone: downFleetCount ? 'warning' : 'good', href: '#/fleet' }),
  ]));

  // Needs Attention — every "watch this" signal the dashboard used to
  // scatter across Money Owed / Pending Approvals / Fleet Health grids,
  // merged into one prioritized, clickable list.
  const fuelCreditOwed = stationBalances().reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const ownerSettlementsOwed = ownerSettlementBalances().reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const pendingFundRequests = store.get('fundRequests').filter((r) => r.status === 'Pending').length;
  const pendingLeave = store.get('leaveRequests').filter((r) => r.status === 'Pending').length;
  const pendingVouchers = store.get('fuelingVouchers').filter((r) => r.status === 'Pending Approval').length;
  const lastBackup = store.getLastBackupAt();
  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;

  const actionItems = [];
  if (overdueServiceCount) actionItems.push({ tone: 'critical', icon: '🔧', text: `${overdueServiceCount} dozer${overdueServiceCount > 1 ? 's' : ''} overdue for service`, href: '#/fleet' });
  if (unpaid.length) actionItems.push({ tone: 'critical', icon: '🧾', text: `${unpaid.length} unpaid invoice${unpaid.length > 1 ? 's' : ''} — ${formatCurrency(unpaidTotal)} outstanding`, href: '#/sales' });
  if (outOfStock.length) actionItems.push({ tone: 'critical', icon: '📦', text: `${outOfStock.length} item${outOfStock.length > 1 ? 's' : ''} out of stock`, href: '#/fleet' });
  if (lowStock.length - outOfStock.length > 0) actionItems.push({ tone: 'warning', icon: '📦', text: `${lowStock.length - outOfStock.length} item${lowStock.length - outOfStock.length > 1 ? 's' : ''} at or below reorder level`, href: '#/fleet' });
  if (downFleetCount) actionItems.push({ tone: 'warning', icon: '🚧', text: `${downFleetCount} dozer${downFleetCount > 1 ? 's' : ''} down or under maintenance`, href: '#/fleet' });
  if (dueSoonServiceCount) actionItems.push({ tone: 'warning', icon: '🔧', text: `${dueSoonServiceCount} dozer${dueSoonServiceCount > 1 ? 's' : ''} due soon for service`, href: '#/fleet' });
  if (fuelCreditOwed) actionItems.push({ tone: 'warning', icon: '⛽', text: `${formatCurrency(fuelCreditOwed)} fuel credit owed to stations`, href: '#/purchasing' });
  if (ownerSettlementsOwed) actionItems.push({ tone: 'warning', icon: '🤝', text: `${formatCurrency(ownerSettlementsOwed)} owed to dozer owners`, href: '#/resourceManagement' });
  if (pendingFundRequests) actionItems.push({ tone: 'warning', icon: '📋', text: `${pendingFundRequests} fund request${pendingFundRequests > 1 ? 's' : ''} awaiting approval`, href: '#/fundRequests' });
  if (pendingLeave) actionItems.push({ tone: 'warning', icon: '📋', text: `${pendingLeave} leave request${pendingLeave > 1 ? 's' : ''} awaiting approval`, href: '#/leave' });
  if (pendingVouchers) actionItems.push({ tone: 'warning', icon: '📋', text: `${pendingVouchers} fueling voucher${pendingVouchers > 1 ? 's' : ''} awaiting approval`, href: '#/fleet' });
  if (!lastBackup) actionItems.push({ tone: 'warning', icon: '💾', text: "You've never backed up this data — everything lives only in this browser", href: '#/backup' });
  else if (daysSinceBackup > 7) actionItems.push({ tone: 'warning', icon: '💾', text: `It's been ${daysSinceBackup} days since your last backup`, href: '#/backup' });

  const toneRank = { critical: 0, warning: 1 };
  actionItems.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Needs Attention'));
  if (actionItems.length) {
    container.appendChild(el('div', { class: 'action-feed' }, actionItems.map((item) => el('a', { class: `action-item action-item-${item.tone}`, href: item.href }, [
      el('span', { class: 'action-icon' }, item.icon),
      el('span', { class: 'action-text' }, item.text),
      el('span', { class: 'action-chevron' }, '→'),
    ]))));
  } else {
    container.appendChild(el('div', { class: 'action-feed-empty' }, '✅ All caught up — nothing needs attention right now.'));
  }

  // Leaderboards / live activity — top sites and operators for the current
  // month, plus the most recently logged reports, so the dashboard reads
  // as a live pulse rather than only historical totals.
  const employeeName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown';
  const opsThisMonth = operations.filter((o) => monthKey(o.date) === currentMonthKey);

  const areaBySiteThisMonth = {};
  opsThisMonth.filter((o) => isHaOperationType(o.operationType)).forEach((o) => {
    areaBySiteThisMonth[o.siteName] = (areaBySiteThisMonth[o.siteName] || 0) + o.quantity;
  });
  const topSites = Object.entries(areaBySiteThisMonth)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value: `${value.toFixed(1)} ha` }));

  const hoursByOperatorThisMonth = {};
  opsThisMonth.forEach((o) => {
    hoursByOperatorThisMonth[o.operatorId] = (hoursByOperatorThisMonth[o.operatorId] || 0) + (o.hoursWorked || 0);
  });
  const topOperators = Object.entries(hoursByOperatorThisMonth)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, value]) => ({ name: employeeName(id), value: `${value.toFixed(1)} h` }));

  const recentReports = operations.slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)
    .map((r) => ({ name: r.siteName, meta: employeeName(r.operatorId), value: formatDate(r.date) }));

  container.appendChild(el('h3', { class: 'subsection-title' }, 'This Month at a Glance'));
  container.appendChild(el('div', { class: 'leaderboard-grid' }, [
    leaderboardCard('Top Sites by Hectares', 'This month', topSites, 'No hectares logged this month yet.'),
    leaderboardCard('Top Operators by Hours', 'This month', topOperators, 'No hours logged this month yet.'),
    leaderboardCard('Recently Logged', 'Most recent Daily Operations reports', recentReports, 'No reports logged yet.'),
  ]));

  const chartsGrid = el('div', { class: 'charts-grid' });
  container.appendChild(chartsGrid);

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
  const salesByMonth = months.map((key) => ({ label: monthLabel(key), value: revenueForMonth(key) }));
  renderLineChart(salesCol, {
    title: 'Sales Trend',
    subtitle: 'Total invoiced amount, last 6 months',
    points: salesByMonth,
    formatValue: formatCurrency,
  });

  const landCol = el('div');
  chartsGrid.appendChild(landCol);
  const areaByMonth = months.map((key) => ({ label: monthLabel(key), value: areaForMonth(key) }));
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
