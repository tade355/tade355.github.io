import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange, invoiceTotal } from '../utils.js';
import { weekOf, isSunday } from '../dateUtils.js';
import { sectionHeader, statCard, renderTable, dateRangeFields } from '../ui.js';
import { renderBarChart, CATEGORICAL_COLORS } from '../charts.js';
import { isHaOperationType } from '../constants.js';
import { hourlyRateAsOf, dieselRateAsOf, pmsRateAsOf, projectRateAsOf } from '../rateHistory.js';
import { printProfitabilityReport } from '../print.js';
import { operatorAllowanceForRows, isOwnedOperatorAllowancePayment } from '../ownedOperatorAllowance.js';

export function projectNames() {
  return store.get('projects').map((p) => p.name);
}

// Rental Cost = hours worked/trekked x the dozer's hourly rate, for every
// dozer regardless of ownership. The one exception: trekking time is free
// (no rental cost) for Company and Partnership dozers, but a hired/Rented
// dozer (e.g. Collins) still bills rental for trekking the same as working
// time — the owner is paid by the hour however the machine is used.
function dozerCostForRows(rows) {
  let total = 0;
  rows.forEach((o) => {
    const ownership = store.get('inventory').find((i) => i.name === o.equipment)?.ownership;
    if (o.operationType === 'Trekking' && ownership !== 'Rented') return;
    total += (o.hoursWorked || 0) * hourlyRateAsOf(o.equipment, o.date);
  });
  return total;
}

// The slice of Rental/Dozer Cost that's for Company-owned equipment only —
// money the company is, in effect, paying itself for using its own
// machines. Used for the Grand Profit view (see companyWideStats): this
// isn't new external cash, but counting it back as internal revenue shows
// management the full economic picture of owned-fleet utilization,
// separate from reported project profit.
function ownedDozerRentalForRows(rows) {
  return dozerCostForRows(rows.filter((o) => {
    const ownership = store.get('inventory').find((i) => i.name === o.equipment)?.ownership;
    return ownership === 'Company' || !ownership;
  }));
}

// Categories that never belong in Other Cost: Logistics is counted
// separately above, Fuel is already covered by the computed Diesel Cost,
// Loan Repayment / Profit Distribution is financing activity (money moving
// to/from lenders and owners), not operations spend, and Maintenance belongs
// to Machine Management Profitability (rental rate generated minus
// maintenance cost, per dozer) — a separate report, not Daily Operations.
const NON_OPERATIONS_COST_CATEGORIES = new Set(['Logistics', 'Fuel', 'Loan Repayment / Profit Distribution', 'Maintenance']);

// Diesel Logistics (commercial bikes) switched from manually-logged Expense
// records to this computed formula on this date — operations before it keep
// relying purely on whatever "Diesel Logistics" Expenses were entered for
// them (as before), while operations on/after it compute the cost live.
// Applying the formula to older dates too would double-count: the old
// Expense records (e.g. "Diesel Logistics — transportation/delivery... (N
// kegs @ ₦1,500/keg)") represent the same real cost the formula now
// computes, and there's no clean field to tell them apart from other
// Logistics expenses (site bikes, waybills, lowbed moves) to exclude just
// those. Going forward, diesel-transport Expenses should no longer be
// entered manually — the formula is the source of truth from here on.
const COMMERCIAL_BIKE_LOGISTICS_FORMULA_START_DATE = '2026-10-04';
const COMMERCIAL_BIKE_RATE_PER_LITRE = 50; // ₦1,500 per 30L

// Diesel actually consumed that day by Company/Rented dozers (Partnership
// dozers are served by Tacoma instead, costed separately below) x the
// commercial-bike transport rate — charges transport against diesel used,
// not everything physically delivered, so transported-but-unused diesel
// isn't double-charged across days.
function commercialBikeLogisticsForRows(rows) {
  let total = 0;
  rows.forEach((o) => {
    if (o.date < COMMERCIAL_BIKE_LOGISTICS_FORMULA_START_DATE) return;
    const ownership = store.get('inventory').find((i) => i.name === o.equipment)?.ownership;
    if (ownership === 'Partnership') return;
    total += (o.fuelUsed || 0) * COMMERCIAL_BIKE_RATE_PER_LITRE;
  });
  return total;
}

const TACOMA_DAILY_PMS_LITRES = 20;
// From this date on, Fuel Credit Tracking started explicitly recording which
// PMS collections were "for the Tacoma site vehicle" in their notes — before
// it, nothing in the ERP distinguishes a Tacoma collection from an ordinary
// site-logistics bike collection, so there's no reliable per-day signal for
// those earlier dates.
const TACOMA_REQUEST_BASIS_START_DATE = '2026-10-01';

// Tacoma — the vehicle that hauls diesel to Chizon/Partnership dozers —
// collects a flat 20L of PMS on a day a Tacoma request was actually
// recorded, not automatically on every day a Partnership dozer works (it
// doesn't run every such day). From TACOMA_REQUEST_BASIS_START_DATE, this
// requires an explicit same-day PMS collection whose notes/reference
// mention "Tacoma"; before that date, no such record exists in the data at
// all, so this falls back to the old any-Partnership-workday assumption as
// the best available estimate for history.
//
// A Tacoma request can also land on a day with NO Daily Operations report
// at all (operator came late, report never submitted, etc.) — the cost
// still happened, so this isn't gated on finding a same-day operations row.
// fuel_credit_collections has no project field of its own, so an orphan
// request like that is attributed to a project only if it has genuinely had
// Partnership-dozer work logged at some point (not just a Partnership
// dozer currently assigned there — more than one project can have one
// assigned while only one actually puts it to work).
function projectHasEverHadPartnershipWork(project) {
  return store.get('operations').some((o) => o.siteName === project
    && store.get('inventory').find((i) => i.name === o.equipment)?.ownership === 'Partnership');
}

function tacomaLogisticsForRows(project, from, to, rows) {
  const partnershipDaysWithWork = new Set();
  rows.forEach((o) => {
    const ownership = store.get('inventory').find((i) => i.name === o.equipment)?.ownership;
    if (ownership === 'Partnership') partnershipDaysWithWork.add(o.date);
  });
  if (projectHasEverHadPartnershipWork(project)) {
    store.get('fuelCreditCollections').forEach((c) => {
      if (c.fuelType !== 'PMS' || c.date < TACOMA_REQUEST_BASIS_START_DATE) return;
      if (!dateInRange(c.date, from, to)) return;
      if (/tacoma/i.test(`${c.notes || ''} ${c.reference || ''}`)) partnershipDaysWithWork.add(c.date);
    });
  }
  let total = 0;
  partnershipDaysWithWork.forEach((date) => {
    if (date >= TACOMA_REQUEST_BASIS_START_DATE) {
      const hasTacomaRequest = store.get('fuelCreditCollections').some((c) =>
        c.fuelType === 'PMS' && c.date === date && /tacoma/i.test(`${c.notes || ''} ${c.reference || ''}`));
      if (!hasTacomaRequest) return;
    }
    total += TACOMA_DAILY_PMS_LITRES * pmsRateAsOf(date);
  });
  return total;
}

// Specific day(s) where a manually negotiated supervision allowance was
// approved as its own Fund Request (Salary and Allowance cost head) to
// REPLACE this formula's figure for that day, not stack on top of it — e.g.
// 4 Oct 2026, Kangidi: Oki Christopher covered as senior manager and was
// approved a one-off ₦20,000 (FR-54) instead of the ₦10,000 this formula
// would otherwise compute for the single dozer active that Sunday.
const MANAGER_SUNDAY_ALLOWANCE_OVERRIDE_DATES = new Set([
  'REX Forestry Project - Kangidi|2026-10-04',
]);

// Manager Sunday Allowance — a flat bonus per Sunday a project has any
// dozers active, tiered by how many distinct machines worked that day.
// Folded into Other Cost (it's a fixed schedule computed straight from
// Daily Operations, not a logged Expense).
function managerSundayAllowanceForRows(rows, project) {
  const equipmentBySundayDate = {};
  rows.forEach((o) => {
    if (!isSunday(o.date)) return;
    if (MANAGER_SUNDAY_ALLOWANCE_OVERRIDE_DATES.has(`${project}|${o.date}`)) return;
    if (!equipmentBySundayDate[o.date]) equipmentBySundayDate[o.date] = new Set();
    equipmentBySundayDate[o.date].add(o.equipment);
  });
  let total = 0;
  Object.values(equipmentBySundayDate).forEach((equipmentSet) => {
    const count = equipmentSet.size;
    if (count >= 4) total += 20000;
    else if (count === 3) total += 15000;
    else if (count >= 1) total += 10000;
  });
  return total;
}

// Fund Requests, once Approved or Paid, are committed project spend the same
// way the Income & Expenditure report already treats them (it merges
// Expenses and Approved/Paid Fund Requests into one ledger) — Profitability
// was only reading Expenses, so any cost that only ever went through a Fund
// Request (never re-entered as its own Expense row) was invisible here even
// though it already counted as real expenditure everywhere else in the app.
function fundRequestTotal(request) {
  return (request.items || []).reduce((sum, it) => sum + (it.amount || 0), 0);
}

function committedFundRequestsFor(project, from, to) {
  return store.get('fundRequests').filter((r) =>
    r.project === project && dateInRange(r.date, from, to) && (r.status === 'Approved' || r.status === 'Paid'));
}

export function computeProjectStats(project, from, to) {
  const operations = store.get('operations').filter((o) => o.siteName === project && dateInRange(o.date, from, to));
  const invoices = store.get('invoices').filter((i) => i.project === project && dateInRange(i.date, from, to));
  const expenses = store.get('expenses').filter((e) => e.project === project && dateInRange(e.date, from, to));
  const fundRequests = committedFundRequestsFor(project, from, to);

  // Only Ha-unit operation types count as "area cleared" — Road (KM) and
  // Trekking (hrs) use different units and would corrupt this total if summed in.
  const areaCleared = operations.filter((o) => isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);
  const fuelUsed = operations.reduce((sum, o) => sum + o.fuelUsed, 0);

  // Computed per-day rather than as a single total x current rate, so a
  // rate change partway through the selected period is reflected correctly
  // instead of applying today's rate retroactively to the whole range.
  const dozerCost = dozerCostForRows(operations);
  const ownedDozerRental = ownedDozerRentalForRows(operations);
  const dieselCost = operations.reduce((sum, o) => sum + (o.fuelUsed || 0) * dieselRateAsOf(o.date), 0);
  const operatorAllowanceCost = operatorAllowanceForRows(operations);

  const logisticsCost = expenses.filter((e) => e.category === 'Logistics').reduce((sum, e) => sum + e.amount, 0)
    + fundRequests.filter((r) => r.costHead === 'Logistics').reduce((sum, r) => sum + fundRequestTotal(r), 0)
    + commercialBikeLogisticsForRows(operations)
    + tacomaLogisticsForRows(project, from, to, operations);
  // Fuel-category expenses/fund requests are excluded here since Diesel Cost above is already
  // derived from actual litres consumed (Daily Operations) x the diesel unit price - counting
  // the fuel purchase too would double-count the same fuel spend. Loan Repayment / Profit
  // Distribution is excluded too — it's money moving to/from lenders and owners, not operations
  // spend, so it never belongs in Daily Operations Profitability. Lump-sum "Salary and Allowance"
  // payments to the 4 owned-fleet operators are excluded too — their pay is already counted in
  // full by Operator Allowance above on the days they actually worked, often weeks before the
  // lump payment date, so counting the payment too would double that same cost. Manager Sunday
  // Allowance is folded in here too — it's a fixed schedule computed from Daily Operations, not a logged Expense.
  const otherCost = expenses.filter((e) => !NON_OPERATIONS_COST_CATEGORIES.has(e.category) && !isOwnedOperatorAllowancePayment(e.payee, e.category)).reduce((sum, e) => sum + e.amount, 0)
    + fundRequests.filter((r) => !NON_OPERATIONS_COST_CATEGORIES.has(r.costHead)).reduce((sum, r) => sum + fundRequestTotal(r), 0)
    + managerSundayAllowanceForRows(operations, project);
  const totalCost = dozerCost + dieselCost + operatorAllowanceCost + logisticsCost + otherCost;

  const revenue = invoices.reduce((sum, i) => sum + invoiceTotal(i), 0);
  const profit = revenue - totalCost;

  // Provisional: same-day figure from Daily Operations reports (quantity x
  // the contract rate in effect that day) — real, submitted work that
  // hasn't necessarily been invoiced yet. Shown alongside verified Revenue
  // so an active project with reports but no invoice yet doesn't read as
  // "₦0 earned" when real work has actually gone in. Profit/Margin stay
  // based on verified Revenue only — see the Fixed Constraint note in
  // Revenue Reconciliation for why provisional and verified can't be mixed
  // into one profit figure.
  const provisionalRevenue = provisionalRevenueForRows(operations);

  return {
    project,
    areaCleared,
    fuelUsed,
    dozerCost,
    ownedDozerRental,
    dieselCost,
    operatorAllowanceCost,
    logisticsCost,
    otherCost,
    totalCost,
    revenue,
    provisionalRevenue,
    profit,
    margin: revenue ? (profit / revenue) * 100 : null,
    revenuePerHa: areaCleared ? revenue / areaCleared : null,
    costPerHa: areaCleared ? totalCost / areaCleared : null,
  };
}

// Summed across every project — used where a figure needs to be
// company-wide rather than tied to one project (e.g. a loan with no
// Linked Project, priced against turnover/profit generally rather than a
// specific job). Also sums provisionalRevenue and derives tentativeProfit
// (provisionalRevenue - totalCost) — the same-day submitted-reports view
// used for "today" figures (Dashboard), since verified revenue lags real
// invoicing and reads as ₦0 for almost any single day even when real work
// went in.
// Grand Profit is a separate economic/management view, not additional
// external cash: owned-dozer Rental Cost is money the company pays itself,
// so it's already subtracted once in totalCost/profit like any other cost,
// then added back here as "internal rental revenue" to show the full
// picture of owned-fleet utilization alongside the externally-reported
// project profit.
export function companyWideStats(from, to) {
  const stats = projectNames().map((p) => computeProjectStats(p, from, to));
  const totals = stats.reduce((acc, s) => ({
    revenue: acc.revenue + s.revenue,
    profit: acc.profit + s.profit,
    totalCost: acc.totalCost + s.totalCost,
    provisionalRevenue: acc.provisionalRevenue + s.provisionalRevenue,
    ownedDozerRental: acc.ownedDozerRental + s.ownedDozerRental,
  }), { revenue: 0, profit: 0, totalCost: 0, provisionalRevenue: 0, ownedDozerRental: 0 });
  const tentativeProfit = totals.provisionalRevenue - totals.totalCost;
  return {
    ...totals,
    tentativeProfit,
    grandProfit: totals.profit + totals.ownedDozerRental,
    grandTentativeProfit: tentativeProfit + totals.ownedDozerRental,
  };
}

function formatMaybe(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${formatCurrency(value)}${suffix}`;
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

// ---------------------------------------------------------------------
// Multi-dimensional grouping (Dozer / Supervisor / Date / Week / Block),
// alongside the existing per-project view above rather than replacing it.
//
// Fixed constraint: verified (invoice) revenue only exists at project
// granularity — clients invoice against a measured project period, never
// against an individual dozer, supervisor, date, or block. So this path
// only ever computes provisional revenue (quantity x the contract rate in
// effect that day), and Logistics/Other/Total Cost/Profit — which can only
// be attributed to a project, via expenses tagged there — render as "—"
// (unknown), not "₦0" (verified zero), at every grouping here.
// ---------------------------------------------------------------------

const GROUP_KEY_FNS = {
  equipment: (o) => o.equipment,
  supervisor: (o) => o.supervisorId,
  date: (o) => o.date,
  week: (o) => weekOf(o.date).key,
  block: (o) => `${o.siteName} / ${o.blockNumber || '—'}`,
};

function groupLabel(groupBy, key) {
  if (groupBy === 'supervisor') return store.get('employees').find((e) => e.id === key)?.name || key || '—';
  if (groupBy === 'date') return formatDate(key);
  if (groupBy === 'week') return weekOf(key).label;
  return key || '—';
}

// Trekking is repositioning time between sites/blocks, not billable
// production — it never earns revenue even if a contract rate happens to
// be on file for the project (e.g. a general fallback rate meant for other
// operation types). Applied here, at the source, so every consumer of this
// function (Profitability, Projects → Profitability, Weekly Report, and
// any grouped-stats view) gets the same rule automatically.
const NON_REVENUE_OPERATION_TYPES = new Set(['Trekking']);

export function provisionalRevenueForRows(operations) {
  return operations
    .filter((o) => !NON_REVENUE_OPERATION_TYPES.has(o.operationType))
    .reduce((sum, o) => sum + (o.quantity || 0) * (projectRateAsOf(o.siteName, o.operationType, o.date).rate || 0), 0);
}

export function computeGroupedStats({ groupBy, from, to, project }) {
  const opsInRange = store.get('operations').filter((o) =>
    dateInRange(o.date, from, to) && (!project || project === 'all' || o.siteName === project));
  const keyFn = GROUP_KEY_FNS[groupBy];
  const keys = [...new Set(opsInRange.map(keyFn))];

  return keys.map((key) => {
    const rows = opsInRange.filter((o) => keyFn(o) === key);
    const areaCleared = rows.filter((o) => isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);
    const fuelUsed = rows.reduce((sum, o) => sum + o.fuelUsed, 0);
    const dozerCost = dozerCostForRows(rows);
    const dieselCost = rows.reduce((sum, o) => sum + (o.fuelUsed || 0) * dieselRateAsOf(o.date), 0);
    const operatorAllowanceCost = operatorAllowanceForRows(rows);
    const revenue = provisionalRevenueForRows(rows);
    return {
      key,
      label: groupLabel(groupBy, key),
      areaCleared,
      fuelUsed,
      dozerCost,
      dieselCost,
      operatorAllowanceCost,
      logisticsCost: null,
      otherCost: null,
      totalCost: null,
      revenue,
      profit: null,
    };
  }).sort((a, b) => (a.label < b.label ? -1 : 1));
}

function renderGroupedTable(body, groupBy, from, to, project) {
  const stats = computeGroupedStats({ groupBy, from, to, project });
  const groupColumnLabel = { equipment: 'Dozer', supervisor: 'Supervisor', date: 'Date', week: 'Week', block: 'Project / Block' }[groupBy];

  const tableContainer = el('div');
  body.appendChild(tableContainer);
  renderTable(tableContainer, {
    columns: [
      { key: 'label', label: groupColumnLabel },
      { key: 'areaCleared', label: 'Area Cleared', render: (r) => `${r.areaCleared.toFixed(1)} ha` },
      { key: 'revenue', label: 'Revenue (Provisional)', render: (r) => formatCurrency(r.revenue) },
      { key: 'dozerCost', label: 'Dozer Cost', render: (r) => formatCurrency(r.dozerCost) },
      { key: 'dieselCost', label: 'Diesel Cost', render: (r) => formatCurrency(r.dieselCost) },
      { key: 'operatorAllowanceCost', label: 'Operator Allowance', render: (r) => formatCurrency(r.operatorAllowanceCost) },
      { key: 'logisticsCost', label: 'Logistics Cost', render: () => '—' },
      { key: 'otherCost', label: 'Other Cost', render: () => '—' },
      { key: 'totalCost', label: 'Total Cost', render: () => '—' },
      { key: 'profit', label: 'Profit', render: () => '—' },
    ],
    rows: stats,
    emptyText: 'No Daily Operations reports in this range.',
  });

  body.appendChild(el('p', { class: 'section-subtitle' }, 'Revenue here is Provisional only (quantity x the contract rate in effect that day) — clients invoice against a measured project period, never against an individual dozer, supervisor, date, or block, so verified revenue and Logistics/Other/Total Cost/Profit (which can only be attributed at the project level) can\'t be split this way and show as "—".'));
}

export function renderProfitability(container) {
  container.innerHTML = '';

  container.appendChild(sectionHeader('Operation Profitability', 'Revenue per hectare vs. dozer, diesel, and logistics cost, by project and period'));

  const filterBar = el('div', { class: 'filter-bar' });
  const projectSelect = el('select', { name: 'project' }, [
    el('option', { value: 'all' }, 'All Projects'),
    ...projectNames().map((p) => el('option', { value: p }, p)),
  ]);
  const { fromInput, toInput, elements } = dateRangeFields({ onChange: () => refresh() });
  const groupBySelect = el('select', { name: 'groupBy' }, [
    el('option', { value: 'project' }, 'Project'),
    el('option', { value: 'equipment' }, 'Dozer'),
    el('option', { value: 'supervisor' }, 'Supervisor'),
    el('option', { value: 'date' }, 'Date'),
    el('option', { value: 'week' }, 'Week'),
    el('option', { value: 'block' }, 'Block'),
  ]);
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  elements.forEach((e) => filterBar.appendChild(e));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Group By'), groupBySelect]));
  const printBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '🖨 Print Report');
  filterBar.appendChild(printBtn);
  container.appendChild(filterBar);

  const body = el('div');
  container.appendChild(body);

  function refresh() {
    const project = projectSelect.value;
    const from = fromInput.value;
    const to = toInput.value;
    const groupBy = groupBySelect.value;
    body.innerHTML = '';

    if (groupBy !== 'project') {
      renderGroupedTable(body, groupBy, from, to, project);
    } else if (project === 'all') {
      renderAllProjects(body, from, to);
    } else {
      renderSingleProject(body, project, from, to);
    }
  }

  [projectSelect, groupBySelect].forEach((input) => input.addEventListener('change', refresh));

  // Always a project-level report — the Provisional/Verified Revenue and
  // full cost breakdown only exist at project granularity (see the Fixed
  // Constraint note above renderGroupedTable), so this ignores whatever
  // Group By is currently on screen and reports by project regardless.
  printBtn.addEventListener('click', () => {
    const project = projectSelect.value;
    const from = fromInput.value;
    const to = toInput.value;
    const stats = project === 'all'
      ? projectNames().map((p) => computeProjectStats(p, from, to))
      : [computeProjectStats(project, from, to)];
    printProfitabilityReport(stats, { from, to, projectLabel: project === 'all' ? 'All Projects' : project });
  });

  refresh();
}

function renderAllProjects(body, from, to) {
  const stats = projectNames().map((p) => computeProjectStats(p, from, to));
  const company = companyWideStats(from, to);

  const grandStatsGrid = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Reported Profit', value: formatCurrency(company.profit), tone: company.profit >= 0 ? 'good' : 'critical' }),
    statCard({ label: 'Owned-Dozer Internal Rental', value: formatCurrency(company.ownedDozerRental), hint: 'Not external cash — money the company pays itself for owned-fleet use' }),
    statCard({ label: 'Grand Profit', value: formatCurrency(company.grandProfit), tone: company.grandProfit >= 0 ? 'good' : 'critical', hint: 'Reported Profit + Owned-Dozer Internal Rental' }),
  ]);
  body.appendChild(grandStatsGrid);
  body.appendChild(el('p', { class: 'section-subtitle' }, 'Grand Profit adds owned-dozer Rental Cost back as internal rental revenue — it\'s not new external cash, just a way to see the full economic picture of owned-fleet utilization alongside reported project profit (which already has that rental cost subtracted once, like any other cost).'));

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
      { key: 'provisionalRevenue', label: 'Provisional Revenue', render: (r) => formatCurrency(r.provisionalRevenue) },
      { key: 'revenue', label: 'Verified Revenue', render: (r) => formatCurrency(r.revenue) },
      { key: 'dozerCost', label: 'Dozer Cost', render: (r) => formatCurrency(r.dozerCost) },
      { key: 'dieselCost', label: 'Diesel Cost', render: (r) => formatCurrency(r.dieselCost) },
      { key: 'operatorAllowanceCost', label: 'Operator Allowance', render: (r) => formatCurrency(r.operatorAllowanceCost) },
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

  body.appendChild(el('p', { class: 'section-subtitle', html: 'Provisional Revenue is quantity x the contract rate in effect that day, straight from Daily Operations reports — a same-day figure, whether or not it has been invoiced yet. Verified Revenue and Logistics/Other costs only include invoices, expenses, and Approved/Paid Fund Requests explicitly tagged to a project (Profit/Margin are based on Verified Revenue only). Dozer Cost, Diesel Cost, and Operator Allowance are computed automatically from Daily Operations logs (hours/litres x the rate in effect that day; Operator Allowance only for the owned EMG fleet) — Logistics Cost also includes a computed Tacoma PMS cost (flat 20L whenever a Partnership dozer works) and, from 4 Oct 2026 onward, a computed commercial-bike diesel-transport cost (litres consumed by Company/Rented dozers x N50/L) replacing manually-logged diesel-transport expenses — earlier dates keep using whatever was logged for them; Other Cost includes a computed Manager Sunday Allowance; Fuel-category expenses are excluded from it to avoid double-counting diesel spend, Loan Repayment / Profit Distribution expenses are excluded since it is financing activity, not operations spend, Maintenance expenses are excluded since that cost belongs to Machine Management Profitability instead, and lump-sum Salary/Allowance payments to the 4 owned-fleet operators are excluded since their pay is already counted via the Operator Allowance formula on the days they actually worked.' }));
}

function renderSingleProject(body, project, from, to) {
  const s = computeProjectStats(project, from, to);

  const statsGrid = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Area Cleared', value: `${s.areaCleared.toFixed(1)} ha` }),
    statCard({ label: 'Provisional Revenue', value: formatCurrency(s.provisionalRevenue), tone: 'good', hint: 'From submitted Daily Operations reports, whether invoiced yet or not' }),
    statCard({ label: 'Verified Revenue', value: formatCurrency(s.revenue), tone: 'good' }),
    statCard({ label: 'Total Cost', value: formatCurrency(s.totalCost), tone: 'critical' }),
    statCard({ label: 'Profit', value: formatCurrency(s.profit), tone: s.profit >= 0 ? 'good' : 'critical' }),
    statCard({ label: 'Margin', value: s.margin === null ? '—' : `${s.margin.toFixed(0)}%` }),
    statCard({ label: 'Verified Revenue / ha', value: formatMaybe(s.revenuePerHa) }),
    statCard({ label: 'Cost / ha', value: formatMaybe(s.costPerHa) }),
    statCard({ label: 'Diesel Used', value: `${s.fuelUsed.toLocaleString()} L` }),
    statCard({ label: 'Operator Allowance', value: formatCurrency(s.operatorAllowanceCost) }),
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
      { label: 'Operator Allowance', value: s.operatorAllowanceCost, colorVar: CATEGORICAL_COLORS[2] },
      { label: 'Logistics', value: s.logisticsCost, colorVar: CATEGORICAL_COLORS[3] },
      { label: 'Other', value: s.otherCost, colorVar: CATEGORICAL_COLORS[4] },
    ],
    formatValue: formatCurrency,
  });

  body.appendChild(el('p', { class: 'section-subtitle', html: 'Provisional Revenue is quantity x the contract rate in effect that day, straight from Daily Operations reports — a same-day figure, whether or not it has been invoiced yet. Verified Revenue and Logistics/Other costs only include invoices, expenses, and Approved/Paid Fund Requests explicitly tagged to this project (Profit/Margin are based on Verified Revenue only). Dozer Cost, Diesel Cost, and Operator Allowance are computed automatically from Daily Operations logs (hours/litres x the rate in effect that day; Operator Allowance only for the owned EMG fleet) — Logistics Cost also includes a computed Tacoma PMS cost (flat 20L whenever a Partnership dozer works) and, from 4 Oct 2026 onward, a computed commercial-bike diesel-transport cost (litres consumed by Company/Rented dozers x N50/L) replacing manually-logged diesel-transport expenses — earlier dates keep using whatever was logged for them; Other Cost includes a computed Manager Sunday Allowance; Fuel-category expenses are excluded from it to avoid double-counting diesel spend, Loan Repayment / Profit Distribution expenses are excluded since it is financing activity, not operations spend, Maintenance expenses are excluded since that cost belongs to Machine Management Profitability instead, and lump-sum Salary/Allowance payments to the 4 owned-fleet operators are excluded since their pay is already counted via the Operator Allowance formula on the days they actually worked.' }));

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
