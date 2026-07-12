import { store } from '../store.js';
import { formatCurrency, invoiceTotal, monthKey, monthLabel } from '../utils.js';
import { statCard, sectionHeader } from '../ui.js';
import { renderBarChart, renderLineChart, CATEGORICAL_COLORS } from '../charts.js';
import { el } from '../utils.js';

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
  const areaThisMonth = operations.filter((o) => monthKey(o.date) === currentMonth).reduce((sum, o) => sum + o.areaCleared, 0);
  const activeSites = new Set(operations.filter((o) => o.status === 'Ongoing').map((o) => o.siteName)).size;

  container.appendChild(sectionHeader('Dashboard', 'Emagrims Ltd — company overview'));

  const statsGrid = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Active Employees', value: String(employees.filter((e) => e.status === 'Active').length), hint: `${employees.length} total` }),
    statCard({ label: 'Low Stock Items', value: String(lowStock.length), hint: lowStock.length ? 'Needs reorder' : 'All stocked', tone: lowStock.length ? 'warning' : 'good' }),
    statCard({ label: 'Outstanding Invoices', value: formatCurrency(unpaidTotal), hint: `${unpaid.length} unpaid`, tone: unpaid.length ? 'critical' : 'good' }),
    statCard({ label: 'Expenses This Month', value: formatCurrency(expensesThisMonth) }),
    statCard({ label: 'Land Cleared This Month', value: `${areaThisMonth.toFixed(1)} ha` }),
    statCard({ label: 'Active Sites', value: String(activeSites) }),
  ]);
  container.appendChild(statsGrid);

  const chartsGrid = el('div', { class: 'charts-grid' });
  container.appendChild(chartsGrid);

  const salesCol = el('div');
  chartsGrid.appendChild(salesCol);
  const months = lastNMonthKeys(6);
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
  operations.forEach((o) => {
    areaBySite[o.siteName] = (areaBySite[o.siteName] || 0) + o.areaCleared;
  });
  const siteBars = Object.entries(areaBySite).map(([label, value]) => ({ label, value }));
  renderBarChart(opsCol, {
    title: 'Land Cleared by Site',
    subtitle: 'Hectares, all-time',
    bars: siteBars,
    formatValue: (v) => `${v.toFixed(1)} ha`,
  });
}
