import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange, invoiceTotal } from '../utils.js';
import { sectionHeader, statCard, renderTable } from '../ui.js';
import { renderBarChart, CATEGORICAL_COLORS } from '../charts.js';
import { isHaOperationType } from '../constants.js';
import { hourlyRateAsOf, dieselRateAsOf } from '../rateHistory.js';

function projectNames() {
  return store.get('projects').map((p) => p.name);
}

function computeProjectStats(project, from, to) {
  const operations = store.get('operations').filter((o) => o.siteName === project && dateInRange(o.date, from, to));
  const invoices = store.get('invoices').filter((i) => i.project === project && dateInRange(i.date, from, to));
  const expenses = store.get('expenses').filter((e) => e.project === project && dateInRange(e.date, from, to));

  // Only Ha-unit operation types count as "area cleared" — Road (KM) and
  // Trekking (hrs) use different units and would corrupt this total if summed in.
  const areaCleared = operations.filter((o) => isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);
  const fuelUsed = operations.reduce((sum, o) => sum + o.fuelUsed, 0);

  // Computed per-day rather than as a single total x current rate, so a
  // rate change partway through the selected period is reflected correctly
  // instead of applying today's rate retroactively to the whole range.
  const dozerCost = operations.reduce((sum, o) => sum + (o.hoursWorked || 0) * hourlyRateAsOf(o.equipment, o.date), 0);
  const dieselCost = operations.reduce((sum, o) => sum + (o.fuelUsed || 0) * dieselRateAsOf(o.date), 0);

  const logisticsCost = expenses.filter((e) => e.category === 'Logistics').reduce((sum, e) => sum + e.amount, 0);
  // Fuel-category expenses are excluded here since Diesel Cost above is already derived
  // from actual litres consumed (Daily Operations) x the diesel unit price - counting the
  // fuel purchase expense too would double-count the same fuel spend.
  const otherCost = expenses.filter((e) => e.category !== 'Logistics' && e.category !== 'Fuel').reduce((sum, e) => sum + e.amount, 0);
  const totalCost = dozerCost + dieselCost + logisticsCost + otherCost;

  const revenue = invoices.reduce((sum, i) => sum + invoiceTotal(i), 0);
  const profit = revenue - totalCost;

  return {
    project,
    areaCleared,
    fuelUsed,
    dozerCost,
    dieselCost,
    logisticsCost,
    otherCost,
    totalCost,
    revenue,
    profit,
    margin: revenue ? (profit / revenue) * 100 : null,
    revenuePerHa: areaCleared ? revenue / areaCleared : null,
    costPerHa: areaCleared ? totalCost / areaCleared : null,
  };
}

function formatMaybe(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${formatCurrency(value)}${suffix}`;
}

// Monday-start week containing `iso`, as a stable sort/group key (the
// Monday's date) plus a human-readable "Mon – Sun" label.
function weekOf(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const diffToMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const key = monday.toISOString().slice(0, 10);
  return { key, label: `${formatDate(key)} – ${formatDate(sunday.toISOString().slice(0, 10))}` };
}

// Weekly actual Ha cleared vs. the project's Expected Rate/Day x 7 target —
// only meaningful for Ha-unit operation types and only if the project has a
// target set (it's optional, see 0016_project_expected_rate.sql).
function computeWeeklyProductivity(project, from, to) {
  const target = store.get('projects').find((p) => p.name === project)?.expectedRatePerDay || 0;
  if (!target) return { target, rows: [] };

  const byWeek = {};
  store.get('operations')
    .filter((o) => o.siteName === project && dateInRange(o.date, from, to) && isHaOperationType(o.operationType))
    .forEach((o) => {
      const { key, label } = weekOf(o.date);
      if (!byWeek[key]) byWeek[key] = { key, label, actual: 0 };
      byWeek[key].actual += o.quantity;
    });

  const targetForWeek = target * 7;
  const rows = Object.values(byWeek)
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((w) => ({ ...w, target: targetForWeek, variance: w.actual - targetForWeek }));
  return { target, rows };
}

export function renderProfitability(container) {
  container.innerHTML = '';

  container.appendChild(sectionHeader('Operation Profitability', 'Revenue per hectare vs. dozer, diesel, and logistics cost, by project and period'));

  const filterBar = el('div', { class: 'filter-bar' });
  const projectSelect = el('select', { name: 'project' }, [
    el('option', { value: 'all' }, 'All Projects'),
    ...projectNames().map((p) => el('option', { value: p }, p)),
  ]);
  const fromInput = el('input', { type: 'date', name: 'from' });
  const toInput = el('input', { type: 'date', name: 'to' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  const body = el('div');
  container.appendChild(body);

  function refresh() {
    const project = projectSelect.value;
    const from = fromInput.value;
    const to = toInput.value;
    body.innerHTML = '';

    if (project === 'all') {
      renderAllProjects(body, from, to);
    } else {
      renderSingleProject(body, project, from, to);
    }
  }

  [projectSelect, fromInput, toInput].forEach((input) => input.addEventListener('change', refresh));

  refresh();
}

function renderAllProjects(body, from, to) {
  const stats = projectNames().map((p) => computeProjectStats(p, from, to));

  const chartContainer = el('div', { class: 'charts-grid charts-grid-1' });
  body.appendChild(chartContainer);
  renderBarChart(chartContainer, {
    title: 'Profit by Project',
    subtitle: 'Revenue minus dozer, diesel, logistics, and other tagged costs',
    bars: stats.map((s, i) => ({ label: s.project, value: s.profit, colorVar: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] })),
    formatValue: formatCurrency,
  });

  const tableContainer = el('div');
  body.appendChild(tableContainer);
  renderTable(tableContainer, {
    columns: [
      { key: 'project', label: 'Project' },
      { key: 'areaCleared', label: 'Area Cleared', render: (r) => `${r.areaCleared.toFixed(1)} ha` },
      { key: 'revenue', label: 'Revenue', render: (r) => formatCurrency(r.revenue) },
      { key: 'dozerCost', label: 'Dozer Cost', render: (r) => formatCurrency(r.dozerCost) },
      { key: 'dieselCost', label: 'Diesel Cost', render: (r) => formatCurrency(r.dieselCost) },
      { key: 'logisticsCost', label: 'Logistics Cost', render: (r) => formatCurrency(r.logisticsCost) },
      { key: 'otherCost', label: 'Other Cost', render: (r) => formatCurrency(r.otherCost) },
      { key: 'totalCost', label: 'Total Cost', render: (r) => formatCurrency(r.totalCost) },
      { key: 'profit', label: 'Profit', render: (r) => el('strong', { class: r.profit >= 0 ? 'text-good' : 'text-critical' }, formatCurrency(r.profit)) },
      { key: 'margin', label: 'Margin', render: (r) => (r.margin === null ? '—' : `${r.margin.toFixed(0)}%`) },
      { key: 'revenuePerHa', label: 'Revenue / ha', render: (r) => formatMaybe(r.revenuePerHa) },
    ],
    rows: stats,
    emptyText: 'No projects to show.',
  });

  body.appendChild(el('p', { class: 'section-subtitle', html: 'Revenue and Logistics/Other costs only include invoices and expenses explicitly tagged to a project on the Sales and Accounting pages. Dozer and Diesel costs are computed automatically from Daily Operations logs using the rate/diesel price that was in effect on each day (Fleet Management Rate History, and diesel receipts) — Fuel-category expenses are excluded from "Other" to avoid double-counting diesel spend.' }));
}

function renderSingleProject(body, project, from, to) {
  const s = computeProjectStats(project, from, to);

  const statsGrid = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Area Cleared', value: `${s.areaCleared.toFixed(1)} ha` }),
    statCard({ label: 'Revenue Earned', value: formatCurrency(s.revenue), tone: 'good' }),
    statCard({ label: 'Total Cost', value: formatCurrency(s.totalCost), tone: 'critical' }),
    statCard({ label: 'Profit', value: formatCurrency(s.profit), tone: s.profit >= 0 ? 'good' : 'critical' }),
    statCard({ label: 'Margin', value: s.margin === null ? '—' : `${s.margin.toFixed(0)}%` }),
    statCard({ label: 'Revenue / ha', value: formatMaybe(s.revenuePerHa) }),
    statCard({ label: 'Cost / ha', value: formatMaybe(s.costPerHa) }),
    statCard({ label: 'Diesel Used', value: `${s.fuelUsed.toLocaleString()} L` }),
  ]);
  body.appendChild(statsGrid);

  const chartContainer = el('div', { class: 'charts-grid charts-grid-1' });
  body.appendChild(chartContainer);
  renderBarChart(chartContainer, {
    title: 'Cost Breakdown',
    subtitle: project,
    bars: [
      { label: 'Dozer', value: s.dozerCost, colorVar: CATEGORICAL_COLORS[0] },
      { label: 'Diesel', value: s.dieselCost, colorVar: CATEGORICAL_COLORS[1] },
      { label: 'Logistics', value: s.logisticsCost, colorVar: CATEGORICAL_COLORS[2] },
      { label: 'Other', value: s.otherCost, colorVar: CATEGORICAL_COLORS[3] },
    ],
    formatValue: formatCurrency,
  });

  body.appendChild(el('p', { class: 'section-subtitle', html: 'Revenue and Logistics/Other costs only include invoices and expenses explicitly tagged to this project on the Sales and Accounting pages. Dozer and Diesel costs are computed automatically from Daily Operations logs using the rate/diesel price that was in effect on each day (Fleet Management Rate History, and diesel receipts) — Fuel-category expenses are excluded from "Other" to avoid double-counting diesel spend.' }));

  body.appendChild(el('h3', { class: 'subsection-title' }, 'Weekly Productivity'));
  const { target, rows: weeklyRows } = computeWeeklyProductivity(project, from, to);
  if (!target) {
    body.appendChild(el('p', { class: 'section-subtitle' }, 'Set an "Expected Rate/Day (Ha)" on this project (Projects → Edit Project) to track weekly area cleared against a target pace.'));
  } else {
    body.appendChild(el('p', { class: 'section-subtitle' }, `Target: ${target} ha/day x 7 = ${(target * 7).toFixed(1)} ha/week. Only Ha-unit operation types (Felling, Stacking, Direct Stacking, Root Picking, Bonding) count toward this.`));
    const weeklyContainer = el('div');
    body.appendChild(weeklyContainer);
    renderTable(weeklyContainer, {
      columns: [
        { key: 'label', label: 'Week' },
        { key: 'actual', label: 'Actual Cleared', render: (r) => `${r.actual.toFixed(1)} ha` },
        { key: 'target', label: 'Target', render: (r) => `${r.target.toFixed(1)} ha` },
        { key: 'variance', label: 'Variance', render: (r) => el('strong', { class: r.variance >= 0 ? 'text-good' : 'text-critical' }, `${r.variance >= 0 ? '+' : ''}${r.variance.toFixed(1)} ha`) },
      ],
      rows: weeklyRows,
      emptyText: 'No Ha-unit operations logged for this project in this period yet.',
    });
  }
}
