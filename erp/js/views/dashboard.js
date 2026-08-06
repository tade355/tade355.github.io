import { store } from '../store.js';
import { formatCurrency, formatDate, invoiceTotal, monthKey, monthLabel, el } from '../utils.js';
import { amountOutstanding } from '../invoicePayments.js';
import { amountOutstanding as loanAmountOutstanding, agingDays as loanAgingDays } from '../loanPayments.js';
import { statCard, sectionHeader } from '../ui.js';
import { renderBarChart, renderLineChart, renderMultiLineChart, CATEGORICAL_COLORS } from '../charts.js';
import { isHaOperationType } from '../constants.js';
import { fleetItems, serviceStatusFor } from './fleet.js';
import { stationBalances } from './fuelCredit.js';
import { ownerSettlementBalances } from './dozerRentPayments.js';
import { projectNames, computeProjectStats, companyWideStats } from './profitability.js';
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

function lastNDayKeys(n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    keys.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  return keys;
}

function monthBounds(key) {
  const [y, m] = key.split('-').map(Number);
  return { from: `${key}-01`, to: new Date(y, m, 0).toISOString().slice(0, 10) };
}

// `invert` flips which direction counts as "good" — e.g. Expenses rising
// is bad, so invert: true there, while Revenue rising is good by default.
// `periodLabel` names what "current" is being compared against (e.g.
// "last month", "yesterday") so this one function serves both the
// monthly and daily KPI rows.
function trendFor(current, previous, { invert = false, periodLabel = 'last month' } = {}) {
  if (!previous && !current) return { direction: 'flat', label: `No activity vs ${periodLabel}`, tone: 'neutral' };
  if (!previous) return { direction: 'up', label: `New vs ${periodLabel}`, tone: invert ? 'warning' : 'good' };
  const diffPct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(diffPct) < 0.5) return { direction: 'flat', label: `Flat vs ${periodLabel}`, tone: 'neutral' };
  const direction = diffPct > 0 ? 'up' : 'down';
  const isGood = (direction === 'up') !== invert;
  return { direction, label: `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(0)}% vs ${periodLabel}`, tone: isGood ? 'good' : 'warning' };
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

// Today's real events, ordered by actual time-of-day where one exists
// (Daily Operations' Time Resumed/Time Closed), with date-only records
// (diesel receipts, maintenance logs — no time-of-day field) listed after,
// rather than inventing a false timestamp for them.
function buildTodayTimeline(todayISO, todaysOps) {
  const timed = [];
  const untimed = [];

  todaysOps.forEach((o) => {
    if (o.timeResumed) timed.push({ time: o.timeResumed, icon: '▶️', text: `Machine Started — ${o.equipment}`, meta: o.siteName });
    if (o.timeClosed) timed.push({ time: o.timeClosed, icon: '⏹️', text: `Work Closed — ${o.equipment}`, meta: o.siteName });
    if (!o.timeResumed && !o.timeClosed) untimed.push({ icon: '📝', text: `Report Submitted — ${o.equipment}`, meta: o.siteName });
  });
  store.get('dieselReceipts').filter((r) => r.date === todayISO).forEach((r) => {
    untimed.push({ icon: '⛽', text: `Diesel Delivered — ${(r.litres || 0).toLocaleString()} L`, meta: r.station || r.project || 'Company-wide' });
  });
  store.get('maintenanceLogs').filter((m) => m.date === todayISO).forEach((m) => {
    untimed.push({ icon: '🔧', text: `${m.type} — ${m.equipment}`, meta: m.status });
  });

  timed.sort((a, b) => (a.time < b.time ? -1 : 1));
  return [...timed, ...untimed];
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
  // status !== 'Paid' (not just === 'Unpaid') so Partially Paid invoices
  // still count as outstanding; unpaidTotal sums what's still owed on each
  // (amountOutstanding), not the full original invoice value, so a
  // partially paid invoice isn't counted as if nothing had been received.
  const unpaid = invoices.filter((i) => i.status !== 'Paid');
  const unpaidTotal = unpaid.reduce((sum, i) => sum + amountOutstanding(i), 0);

  const overdueLoans = store.get('loans').filter((l) => loanAgingDays(l) !== null);
  const overdueLoansTotal = overdueLoans.reduce((sum, l) => sum + loanAmountOutstanding(l), 0);

  const areaForMonth = (key) => operations.filter((o) => monthKey(o.date) === key && isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);
  const revenueForMonth = (key) => invoices.filter((inv) => monthKey(inv.date) === key).reduce((sum, inv) => sum + invoiceTotal(inv), 0);

  // Revenue vs Cost vs Profit — company-wide, all projects, reusing the
  // exact same per-project cost/revenue logic as Operation Profitability
  // so this never drifts out of sync with that page's numbers.
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
  // Today vs the last 7 days — the Executive Command Centre's headline
  // numbers, all same-day and all real (companyWideStats already exists,
  // built for the Loan Portfolio's company-wide interest calc, reused
  // here at a one-day window instead of a month/period one).
  const last7Days = lastNDayKeys(7);
  const todayISO = last7Days[6];
  const yesterdayISO = last7Days[5];
  const dailyStats = last7Days.map((day) => ({ day, ...companyWideStats(day, day) }));
  const todayStats = dailyStats[6];
  const yesterdayStats = dailyStats[5];
  const todaysOps = operations.filter((o) => o.date === todayISO);
  const dailyDiesel = last7Days.map((day) => operations.filter((o) => o.date === day).reduce((sum, o) => sum + (o.fuelUsed || 0), 0));
  const dailyHectares = last7Days.map((day) => operations.filter((o) => o.date === day && isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0));
  const todaysDiesel = dailyDiesel[6];
  const todaysHectares = dailyHectares[6];
  // ROI here means Profit ÷ Cost for the day — a return-on-operating-spend
  // proxy, not the finance-textbook return-on-capital-employed (capital
  // expenditure per machine isn't tracked in this system).
  const todayROI = todayStats.totalCost ? (todayStats.profit / todayStats.totalCost) * 100 : null;
  const yesterdayROI = yesterdayStats.totalCost ? (yesterdayStats.profit / yesterdayStats.totalCost) * 100 : null;

  // Fleet health — feeds both the KPI row and the Executive Alert Center.
  const dozers = fleetItems();
  const activeFleetCount = dozers.filter((d) => (d.fleetStatus || 'Active') === 'Active').length;
  const downFleetCount = dozers.filter((d) => d.fleetStatus === 'Down' || d.fleetStatus === 'Under Maintenance').length;
  const machineAvailability = dozers.length ? (activeFleetCount / dozers.length) * 100 : null;
  const serviceStatuses = dozers.map((d) => serviceStatusFor(d).status);
  const overdueServiceCount = serviceStatuses.filter((s) => s === 'Overdue').length;
  const dueSoonServiceCount = serviceStatuses.filter((s) => s === 'Due Soon').length;

  // Approvals + money-owed signals — feed both the Outstanding Approvals
  // KPI and the Executive Alert Center below.
  const fuelCreditOwed = stationBalances().reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const ownerSettlementsOwed = ownerSettlementBalances().reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const pendingFundRequests = store.get('fundRequests').filter((r) => r.status === 'Pending').length;
  const pendingLeave = store.get('leaveRequests').filter((r) => r.status === 'Pending').length;
  const pendingVouchers = store.get('fuelingVouchers').filter((r) => r.status === 'Pending Approval').length;
  const outstandingApprovals = pendingFundRequests + pendingLeave + pendingVouchers;
  const lastBackup = store.getLastBackupAt();
  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;

  // Greeting — a small personal touch so this reads as a live briefing
  // rather than a static report.
  const user = getCurrentUser();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const firstName = (user?.name || '').split(' ')[0];
  container.appendChild(sectionHeader('Dashboard', `${greeting}${firstName ? ', ' + firstName : ''} — here's how Emagrims Ltd is doing today, ${todayLabel}.`));

  // KPI row — the Executive Command Centre's headline numbers, same-day
  // where a same-day figure exists, each with a 7-day sparkline where a
  // real daily history is meaningful. No weather/GPS cards — this system
  // has no weather API or GPS telemetry configured, and a fake number
  // would be worse than no number.
  const kpiGrid = el('div', { class: 'kpi-grid' }, [
    statCard({
      icon: '🚜', label: 'Machine Availability', value: machineAvailability === null ? '—' : `${machineAvailability.toFixed(0)}%`,
      hint: `${dozers.length} in fleet`, target: 'Target: 85%', tone: machineAvailability !== null && machineAvailability < 85 ? 'warning' : 'good', href: '#/fleet',
    }),
    statCard({ icon: '✅', label: 'Active Machines', value: String(activeFleetCount), tone: 'good', href: '#/fleet' }),
    statCard({ icon: '🔧', label: 'Machines Under Repair', value: String(downFleetCount), tone: downFleetCount ? 'warning' : 'good', href: '#/fleet' }),
    statCard({
      icon: '💰', label: "Today's Revenue", value: formatCurrency(todayStats.revenue), href: '#/sales',
      trend: trendFor(todayStats.revenue, yesterdayStats.revenue, { periodLabel: 'yesterday' }),
      sparkline: dailyStats.map((d) => d.revenue),
    }),
    statCard({
      icon: '💸', label: "Today's Cost", value: formatCurrency(todayStats.totalCost), href: '#/accounting',
      trend: trendFor(todayStats.totalCost, yesterdayStats.totalCost, { invert: true, periodLabel: 'yesterday' }),
      sparkline: dailyStats.map((d) => d.totalCost),
    }),
    statCard({
      icon: '📈', label: "Today's Profit", value: formatCurrency(todayStats.profit), href: '#/accounting',
      trend: trendFor(todayStats.profit, yesterdayStats.profit, { periodLabel: 'yesterday' }),
      sparkline: dailyStats.map((d) => d.profit),
    }),
    statCard({
      icon: '📊', label: 'ROI', value: todayROI === null ? '—' : `${todayROI.toFixed(0)}%`, hint: 'Profit ÷ Cost, today',
      trend: todayROI !== null && yesterdayROI !== null ? trendFor(todayROI, yesterdayROI, { periodLabel: 'yesterday' }) : undefined,
      href: '#/accounting',
    }),
    statCard({ icon: '⛽', label: "Today's Diesel", value: `${todaysDiesel.toLocaleString()} L`, href: '#/resourceManagement', sparkline: dailyDiesel }),
    statCard({ icon: '🌾', label: "Today's Hectares", value: `${todaysHectares.toFixed(1)} ha`, href: '#/operations', sparkline: dailyHectares }),
    statCard({ icon: '👥', label: 'Active Staff', value: String(employees.filter((e) => e.status === 'Active').length), hint: `${employees.length} total`, href: '#/hr' }),
    statCard({ icon: '📋', label: 'Outstanding Approvals', value: String(outstandingApprovals), tone: outstandingApprovals ? 'warning' : 'good', href: '#/fundRequests' }),
  ]);
  container.appendChild(kpiGrid);

  // Executive Alert Center — every "watch this" signal, grouped by real
  // severity instead of one flat list, so the most urgent things are
  // never buried under routine approvals.
  const actionItems = [];
  if (overdueServiceCount) actionItems.push({ tone: 'critical', icon: '🔧', text: `${overdueServiceCount} dozer${overdueServiceCount > 1 ? 's' : ''} overdue for service`, href: '#/fleet' });
  if (unpaid.length) actionItems.push({ tone: 'critical', icon: '🧾', text: `${unpaid.length} unpaid invoice${unpaid.length > 1 ? 's' : ''} — ${formatCurrency(unpaidTotal)} outstanding`, href: '#/sales' });
  if (overdueLoans.length) actionItems.push({ tone: 'critical', icon: '🏦', text: `${overdueLoans.length} loan repayment${overdueLoans.length > 1 ? 's' : ''} overdue — ${formatCurrency(overdueLoansTotal)} outstanding`, href: '#/accounting' });
  if (outOfStock.length) actionItems.push({ tone: 'critical', icon: '📦', text: `${outOfStock.length} item${outOfStock.length > 1 ? 's' : ''} out of stock`, href: '#/fleet' });
  if (lowStock.length - outOfStock.length > 0) actionItems.push({ tone: 'warning', icon: '📦', text: `${lowStock.length - outOfStock.length} item${lowStock.length - outOfStock.length > 1 ? 's' : ''} at or below reorder level`, href: '#/fleet' });
  if (downFleetCount) actionItems.push({ tone: 'warning', icon: '🚧', text: `${downFleetCount} dozer${downFleetCount > 1 ? 's' : ''} down or under maintenance`, href: '#/fleet' });
  if (dueSoonServiceCount) actionItems.push({ tone: 'warning', icon: '🔧', text: `${dueSoonServiceCount} dozer${dueSoonServiceCount > 1 ? 's' : ''} due soon for service`, href: '#/fleet' });
  if (fuelCreditOwed) actionItems.push({ tone: 'warning', icon: '⛽', text: `${formatCurrency(fuelCreditOwed)} fuel credit owed to stations`, href: '#/purchasing' });
  if (ownerSettlementsOwed) actionItems.push({ tone: 'warning', icon: '🤝', text: `${formatCurrency(ownerSettlementsOwed)} owed to dozer owners`, href: '#/resourceManagement' });
  if (pendingFundRequests) actionItems.push({ tone: 'warning', icon: '📋', text: `${pendingFundRequests} fund request${pendingFundRequests > 1 ? 's' : ''} awaiting approval`, href: '#/fundRequests' });
  if (pendingLeave) actionItems.push({ tone: 'warning', icon: '📋', text: `${pendingLeave} leave request${pendingLeave > 1 ? 's' : ''} awaiting approval`, href: '#/leave' });
  if (pendingVouchers) actionItems.push({ tone: 'warning', icon: '📋', text: `${pendingVouchers} fueling voucher${pendingVouchers > 1 ? 's' : ''} awaiting approval`, href: '#/resourceManagement' });
  if (!lastBackup) actionItems.push({ tone: 'warning', icon: '💾', text: "You've never backed up this data — everything lives only in this browser", href: '#/backup' });
  else if (daysSinceBackup > 7) actionItems.push({ tone: 'warning', icon: '💾', text: `It's been ${daysSinceBackup} days since your last backup`, href: '#/backup' });
  if (todaysOps.length) actionItems.push({ tone: 'info', icon: '📝', text: `${todaysOps.length} daily report${todaysOps.length > 1 ? 's' : ''} submitted today`, href: '#/operations' });

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Executive Alert Center'));
  const tierMeta = { critical: { label: '🔴 Critical' }, warning: { label: '🟠 Important' }, info: { label: '🟢 Info' } };
  const grouped = { critical: [], warning: [], info: [] };
  actionItems.forEach((item) => grouped[item.tone].push(item));

  if (actionItems.length) {
    ['critical', 'warning', 'info'].forEach((tier) => {
      if (!grouped[tier].length) return;
      container.appendChild(el('div', { class: 'alert-tier' }, [
        el('p', { class: 'alert-tier-label' }, tierMeta[tier].label),
        el('div', { class: 'action-feed' }, grouped[tier].map((item) => el('a', { class: `action-item action-item-${tier}`, href: item.href }, [
          el('span', { class: 'action-icon' }, item.icon),
          el('span', { class: 'action-text' }, item.text),
          el('span', { class: 'action-chevron' }, '→'),
        ]))),
      ]));
    });
  } else {
    container.appendChild(el('div', { class: 'action-feed-empty' }, '✅ All caught up — nothing needs attention right now.'));
  }

  // Leaderboards / live activity — top sites, operators, and machines for
  // the current month, plus the most recently logged reports, so the
  // dashboard reads as a live pulse rather than only historical totals.
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

  // Utilization (hours), not profit — a per-machine "profit" can't fully
  // attribute Logistics/Other cost below project level (see Profitability's
  // documented Fixed Constraint), so this stays to a metric that's fully
  // and honestly computable per machine.
  const hoursByMachineThisMonth = {};
  opsThisMonth.forEach((o) => {
    hoursByMachineThisMonth[o.equipment] = (hoursByMachineThisMonth[o.equipment] || 0) + (o.hoursWorked || 0);
  });
  const topMachines = Object.entries(hoursByMachineThisMonth)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value: `${value.toFixed(1)} h` }));

  const recentReports = operations.slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)
    .map((r) => ({ name: r.siteName, meta: employeeName(r.operatorId), value: formatDate(r.date) }));

  container.appendChild(el('h3', { class: 'subsection-title' }, 'This Month at a Glance'));
  container.appendChild(el('div', { class: 'leaderboard-grid' }, [
    leaderboardCard('Top Sites by Hectares', 'This month', topSites, 'No hectares logged this month yet.'),
    leaderboardCard('Top Operators by Hours', 'This month', topOperators, 'No hours logged this month yet.'),
    leaderboardCard('Top Machines by Utilization', 'Hours worked this month', topMachines, 'No hours logged this month yet.'),
    leaderboardCard('Recently Logged', 'Most recent Daily Operations reports', recentReports, 'No reports logged yet.'),
  ]));

  // Today's Activity Timeline — real events only; date-only records
  // (diesel receipts, maintenance logs) are listed without a fabricated
  // time-of-day, after the events that do have a real timestamp.
  container.appendChild(el('h3', { class: 'subsection-title' }, "Today's Activity Timeline" ));
  const timelineEvents = buildTodayTimeline(todayISO, todaysOps);
  if (timelineEvents.length) {
    container.appendChild(el('div', { class: 'timeline' }, timelineEvents.map((ev) => el('div', { class: 'timeline-row' }, [
      el('span', { class: 'timeline-time' }, ev.time || '—'),
      el('span', { class: 'timeline-icon' }, ev.icon),
      el('span', { class: 'timeline-body' }, [
        ev.text,
        ev.meta ? el('span', { class: 'timeline-meta' }, ` · ${ev.meta}`) : null,
      ]),
    ]))));
  } else {
    container.appendChild(el('div', { class: 'action-feed-empty' }, 'No activity logged yet today.'));
  }

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
