import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, renderTable, statCard } from '../ui.js';
import { OPERATION_TYPES, isHaOperationType } from '../constants.js';
import { printWeeklyPerformanceReport, printMilestoneTracker } from '../print.js';
import { provisionalRevenueForRows } from './profitability.js';
import { dieselRateAsOf } from '../rateHistory.js';
import { collectEntries } from './incomeExpenditure.js';

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function projectOptions() {
  return store.get('projects').map((p) => p.name);
}

function fleetForProject(project) {
  return store.get('inventory').filter((i) => i.currentProject === project);
}

// The roster for a project is the union of dozers currently assigned to it
// AND dozers with real operations logged under it in the given ops set —
// not just currentProject alone. currentProject is a single mutable
// snapshot (today's assignment), so a dozer moved, reassigned, or simply
// lagging that field would otherwise silently vanish from a period it
// actually worked. This union can still include currently-assigned-but-idle
// dozers with zero activity in `ops`; callers that only want dozers that
// actually worked (e.g. Weekly Performance) filter those back out.
function rosterForProject(project, ops) {
  const assigned = fleetForProject(project);
  const assignedNames = new Set(assigned.map((d) => d.name));
  const inventoryByName = new Map(store.get('inventory').map((i) => [i.name, i]));
  const workedNames = [...new Set(ops.map((o) => o.equipment))].filter(Boolean);

  const extra = workedNames
    .filter((name) => !assignedNames.has(name))
    .map((name) => inventoryByName.get(name) || { name });

  return [...assigned, ...extra];
}

// UTC-based date math throughout — a local-time Date (new Date(iso+'T00:00:00')
// then setDate/toISOString) can fail to advance a calendar day right at a
// local DST transition, which would make datesInRange's while-loop below
// spin forever on the right timezone/date combination. UTC has no DST, so
// this is deterministic regardless of the browser's timezone.
function mondayOf(iso) {
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Hard cap on the period length: a mis-picked or far-future end date
// (fat-fingering a year, say) must not be able to spin this loop for an
// enormous or unbounded number of iterations and balloon the table to
// thousands of day-columns — it visibly refuses instead.
const MAX_PERIOD_DAYS = 92;

function datesInRange(start, end) {
  const dates = [];
  let d = start;
  let guard = 0;
  while (d <= end && guard < MAX_PERIOD_DAYS) {
    dates.push(d);
    d = addDays(d, 1);
    guard += 1;
  }
  return dates;
}

function dayLabel(iso) {
  const [y, m, day] = iso.split('-').map(Number);
  const weekday = WEEKDAY_ABBR[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${weekday} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function avgTime(list) {
  return list.length ? minutesToTime(list.reduce((a, b) => a + b, 0) / list.length) : null;
}

function unitForType(type) {
  return OPERATION_TYPES.find((t) => t.value === type)?.unit || '';
}

// Weekly Performance Report: per dozer assigned to the project (via its
// Current Project on the Fleet Roster), Ha achieved each day of the
// selected period, plus a Cumulative row — matching the real field report
// format. The period is whatever From/To dates were picked (not forced to
// a Mon-Sun week), so it can cover a single day, a partial week, or a
// longer stretch. Only dozers with at least one working day this period
// make the report — a currently-assigned-but-idle dozer just clutters a
// weekly meeting instead of informing it.
function computeWeeklyPerformance(project, periodStart, periodEnd) {
  const dates = datesInRange(periodStart, periodEnd);
  const dayLabels = dates.map(dayLabel);
  const periodOps = store.get('operations').filter((o) => o.siteName === project && dateInRange(o.date, periodStart, periodEnd));
  const dozers = rosterForProject(project, periodOps);

  const rows = dozers.map((d) => {
    const ops = periodOps.filter((o) => o.equipment === d.name);
    const byDay = dates.map((date) => ops.filter((o) => o.date === date && isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0));
    const total = byDay.reduce((a, b) => a + b, 0);
    const actualDays = byDay.filter((v) => v > 0).length;
    const types = [...new Set(ops.map((o) => o.operationType).filter(Boolean))];

    // Speed per operation type, not one blended figure — Phase 2 and
    // Trekking (say) run at completely different Ha-or-hrs/day rates, so
    // averaging them together over/understates both.
    const speedByType = types.map((type) => {
      const typeOps = ops.filter((o) => o.operationType === type);
      const daysForType = new Set(typeOps.map((o) => o.date)).size;
      const qty = typeOps.reduce((sum, o) => sum + o.quantity, 0);
      return { type, unit: unitForType(type), speed: daysForType ? qty / daysForType : 0 };
    });

    // % Optimization/Usage: days this dozer did ANY work this period ÷
    // days in the period — same definition as Fleet Management → Dozer
    // Economics' Company-Owned Dozer Performance table.
    const daysWorkedAny = new Set(ops.map((o) => o.date)).size;
    const optimizationPct = dates.length ? (daysWorkedAny / dates.length) * 100 : 0;

    return {
      name: d.name,
      types: types.join(', ') || '—',
      speedByType,
      start: avgTime(ops.filter((o) => o.timeResumed).map((o) => timeToMinutes(o.timeResumed))),
      close: avgTime(ops.filter((o) => o.timeClosed).map((o) => timeToMinutes(o.timeClosed))),
      byDay,
      total,
      daysWorkedAny,
      optimizationPct,
      plannedDays: dates.length,
      actualDays,
    };
  }).filter((r) => r.daysWorkedAny > 0);

  const cumulative = dates.map((_, i) => rows.reduce((sum, r) => sum + r.byDay[i], 0));

  // Fleet-wide average Start/Close across every dozer's reports this
  // period, shown on the Cumulative row — "what time did the fleet
  // generally start/close" at a glance, alongside each dozer's own average.
  const avgStart = avgTime(periodOps.filter((o) => o.timeResumed).map((o) => timeToMinutes(o.timeResumed)));
  const avgClose = avgTime(periodOps.filter((o) => o.timeClosed).map((o) => timeToMinutes(o.timeClosed)));

  return { rows, cumulative, periodStart, periodEnd, dayLabels, avgStart, avgClose };
}

// Trekking is repositioning time between sites/blocks, not billable
// production — it never earns revenue even if a contract rate happens to
// be on file for the project (e.g. a general fallback rate meant for
// other operation types).
const NON_REVENUE_OPERATION_TYPES = new Set(['Trekking']);

// Expected Revenue: quantity achieved this period x the contract rate in
// effect that day, broken out per operation type (Ha and Ha-rate types
// achieve/earn very differently from Trekking's hrs, say, so a single
// blended total would hide which operation type is actually driving it).
function computeExpectedRevenue(periodOps) {
  const byType = OPERATION_TYPES
    .map((t) => {
      const ops = periodOps.filter((o) => o.operationType === t.value);
      const qty = ops.reduce((sum, o) => sum + o.quantity, 0);
      const revenue = NON_REVENUE_OPERATION_TYPES.has(t.value) ? 0 : provisionalRevenueForRows(ops);
      return { type: t.value, unit: t.unit, qty, revenue };
    })
    .filter((t) => t.qty > 0);
  return { byType, total: byType.reduce((sum, t) => sum + t.revenue, 0) };
}

// Tentative Cost: a compact, four-line field estimate for management, not a
// full ledger reconciliation (see Profitability, Fuel Credit Tracking, and
// Dozer Rent Payments for the authoritative figures behind each of these).
// - Rental Cost: Partnership/Rented dozers on this roster, days worked
//   (any operation, excluding Business days) x their day rate.
// - Diesel Cost: Fuel Used x the diesel rate in effect that day.
// - Site Logistics / Diesel Logistics: this project's Logistics-cost-head
//   expenditure (Expenses + Approved/Paid Fund Requests) this period, split
//   by whether the description mentions diesel/fuel — kept separate from
//   Diesel Cost above so a real diesel-delivery expense doesn't get
//   double-counted against the computed fuel-usage estimate.
function computeTentativeCost(project, periodStart, periodEnd, periodOps, rosterNames) {
  const dieselCost = periodOps.reduce((sum, o) => sum + (o.fuelUsed || 0) * dieselRateAsOf(o.date), 0);

  const rentalCost = store.get('inventory')
    .filter((i) => rosterNames.includes(i.name) && (i.ownership === 'Partnership' || i.ownership === 'Rented'))
    .reduce((sum, i) => {
      const days = new Set(
        periodOps.filter((o) => o.equipment === i.name && o.workType !== 'Business').map((o) => o.date),
      ).size;
      return sum + days * (i.rentalRatePerDay || 0);
    }, 0);

  const logisticsEntries = collectEntries().filter((e) =>
    e.type === 'Expenditure' && e.project === project && e.costHead === 'Logistics' && dateInRange(e.date, periodStart, periodEnd));
  const dieselKeywords = /diesel|fuel|\bago\b/i;
  const dieselLogistics = logisticsEntries.filter((e) => dieselKeywords.test(e.description || '')).reduce((sum, e) => sum + e.amount, 0);
  const siteLogistics = logisticsEntries.filter((e) => !dieselKeywords.test(e.description || '')).reduce((sum, e) => sum + e.amount, 0);

  return { rentalCost, dieselCost, siteLogistics, dieselLogistics, total: rentalCost + dieselCost + siteLogistics + dieselLogistics };
}

function renderWeeklyPerformanceTab(container) {
  const filterBar = el('div', { class: 'filter-bar' });
  const projectSelect = el('select', {}, projectOptions().map((p) => el('option', { value: p }, p)));
  const today = new Date().toISOString().slice(0, 10);
  const startInput = el('input', { type: 'date' });
  startInput.value = mondayOf(today);
  const endInput = el('input', { type: 'date' });
  endInput.value = addDays(startInput.value, 6);
  const printBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '🖨 Print Report');
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), startInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), endInput]));
  filterBar.appendChild(printBtn);
  container.appendChild(filterBar);
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Rows are every dozer with at least one working day on this project in the selected period (currently-assigned-but-idle dozers are left off). Only Ha-unit operation types count toward the daily grid.'));

  const body = el('div');
  container.appendChild(body);

  function refresh() {
    const project = projectSelect.value;
    body.innerHTML = '';
    if (!project) {
      body.appendChild(el('p', { class: 'section-subtitle' }, 'Add a project first (Projects tab).'));
      printBtn.disabled = true;
      return;
    }
    // If From/To got picked out of order, just swap rather than error.
    let periodStart = startInput.value || today;
    let periodEnd = endInput.value || today;
    if (periodEnd < periodStart) [periodStart, periodEnd] = [periodEnd, periodStart];

    const data = computeWeeklyPerformance(project, periodStart, periodEnd);
    const periodOps = store.get('operations').filter((o) => o.siteName === project && dateInRange(o.date, periodStart, periodEnd));
    const revenueData = computeExpectedRevenue(periodOps);
    const costData = computeTentativeCost(project, periodStart, periodEnd, periodOps, data.rows.map((r) => r.name));

    body.appendChild(el('h3', { class: 'subsection-title' }, `Period: ${formatDate(periodStart)} – ${formatDate(periodEnd)}`));
    if (data.dayLabels.length >= MAX_PERIOD_DAYS) {
      body.appendChild(el('p', { class: 'section-subtitle text-critical' }, `This report is capped at ${MAX_PERIOD_DAYS} days per period — narrow the From/To range to see the rest.`));
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead', {}, [el('tr', {}, [
      el('th', {}, 'Dozer'), el('th', {}, 'Type (Speed/Day)'), el('th', {}, 'Start'), el('th', {}, 'Close'),
      ...data.dayLabels.map((d) => el('th', {}, d)),
      el('th', {}, 'Total'), el('th', {}, '% Optimization'), el('th', {}, 'Planned Days'), el('th', {}, 'Actual Days'),
    ])]);
    table.appendChild(thead);

    const tbody = el('tbody');
    data.rows.forEach((r) => {
      const typeCell = r.speedByType.length
        ? el('div', {}, r.speedByType.map((s) => el('div', {}, `${s.type}: ${s.speed.toFixed(1)} ${s.unit}/day`)))
        : '—';
      tbody.appendChild(el('tr', {}, [
        el('td', {}, r.name), el('td', {}, typeCell), el('td', {}, r.start || '—'), el('td', {}, r.close || '—'),
        ...r.byDay.map((v) => el('td', {}, v ? v.toFixed(1) : '—')),
        el('td', {}, r.total.toFixed(1)), el('td', {}, `${r.optimizationPct.toFixed(0)}%`), el('td', {}, String(r.plannedDays)), el('td', {}, String(r.actualDays)),
      ]));
    });
    const cumulativeTotal = data.cumulative.reduce((a, b) => a + b, 0);
    tbody.appendChild(el('tr', { class: 'row-cumulative' }, [
      el('td', {}, el('strong', {}, 'Cumulative')), el('td', {}, ''), el('td', {}, el('strong', {}, data.avgStart || '—')), el('td', {}, el('strong', {}, data.avgClose || '—')),
      ...data.cumulative.map((v) => el('td', {}, el('strong', {}, v.toFixed(1)))),
      el('td', {}, el('strong', {}, cumulativeTotal.toFixed(1))), el('td', {}, ''), el('td', {}, ''), el('td', {}, ''),
    ]));
    table.appendChild(tbody);
    if (!data.rows.length) {
      body.appendChild(el('p', { class: 'section-subtitle' }, 'No fleet assets assigned to this project, and no operations logged against it in this period.'));
    }
    const tableWrap = el('div', { class: 'table-wrap' }, [table]);
    body.appendChild(tableWrap);

    body.appendChild(el('h3', { class: 'subsection-title' }, 'Revenue & Cost (Tentative)'));
    body.appendChild(el('p', { class: 'section-subtitle' }, 'Expected Revenue is quantity × the contract rate in effect that day (Projects → Rate History), not verified/invoiced revenue. Tentative Cost is a quick field estimate, not a full ledger reconciliation — see Profitability, Fuel Credit Tracking, and Dozer Rent Payments for the authoritative figures.'));

    const summaryGrid = el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Expected Revenue', value: formatCurrency(revenueData.total), tone: 'good' }),
      statCard({ label: 'Tentative Cost', value: formatCurrency(costData.total) }),
      statCard({ label: 'Tentative Profit', value: formatCurrency(revenueData.total - costData.total), tone: revenueData.total - costData.total >= 0 ? 'good' : 'critical' }),
    ]);
    body.appendChild(summaryGrid);

    const breakdown = el('div', { class: 'form-grid-2' }, [
      el('div', {}, [
        el('h4', { class: 'subsection-title' }, 'Expected Revenue by Operation Type'),
        ...(revenueData.byType.length
          ? revenueData.byType.map((t) => el('p', {}, [el('strong', {}, `${t.type}: `), `${t.qty.toFixed(2)} ${t.unit} — ${formatCurrency(t.revenue)}`]))
          : [el('p', { class: 'section-subtitle' }, 'No operations logged for this project in this period yet.')]),
      ]),
      el('div', {}, [
        el('h4', { class: 'subsection-title' }, 'Tentative Cost Breakdown'),
        el('p', {}, [el('strong', {}, 'Rental Cost: '), formatCurrency(costData.rentalCost)]),
        el('p', {}, [el('strong', {}, 'Diesel Cost: '), formatCurrency(costData.dieselCost)]),
        el('p', {}, [el('strong', {}, 'Site Logistics: '), formatCurrency(costData.siteLogistics)]),
        el('p', {}, [el('strong', {}, 'Diesel Logistics: '), formatCurrency(costData.dieselLogistics)]),
      ]),
    ]);
    body.appendChild(breakdown);

    printBtn.disabled = false;
    printBtn.onclick = () => printWeeklyPerformanceReport(project, { ...data, revenueData, costData });
  }

  [projectSelect, startInput, endInput].forEach((input) => input.addEventListener('change', refresh));
  refresh();
}

// Milestone Tracker: all-time, project-level cumulative progress plus a
// per-machine breakdown by operation type — matches the real Milestone
// Report Tracking System.
function computeMilestoneTracker(project) {
  const p = store.get('projects').find((x) => x.name === project);
  const allOps = store.get('operations').filter((o) => o.siteName === project);
  const grandCumulative = allOps.filter((o) => isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);

  const today = new Date().toISOString().slice(0, 10);
  const daysOnProject = p?.startDate ? Math.floor((new Date(today) - new Date(p.startDate)) / 86400000) + 1 : null;
  const speedPerDay = daysOnProject ? grandCumulative / daysOnProject : null;
  const remaining = (p?.totalAreaHa || p?.totalAreaHa === 0) ? p.totalAreaHa - grandCumulative : null;

  const activeTypes = OPERATION_TYPES.filter((t) => allOps.some((o) => o.operationType === t.value));

  const machineRows = rosterForProject(project, allOps).map((d) => {
    const ops = allOps.filter((o) => o.equipment === d.name);
    const combinedDays = new Set(ops.map((o) => o.date)).size;
    const officeDays = new Set(ops.filter((o) => o.workType !== 'Business').map((o) => o.date)).size;
    const businessDays = new Set(ops.filter((o) => o.workType === 'Business').map((o) => o.date)).size;
    const byType = {};
    activeTypes.forEach((t) => {
      byType[t.value] = ops.filter((o) => o.operationType === t.value).reduce((sum, o) => sum + o.quantity, 0);
    });
    return { name: d.name, owner: d.ownership === 'Company' ? 'Emagrims' : (d.ownerName || '—'), combinedDays, officeDays, businessDays, byType };
  });

  return { project: p, grandCumulative, daysOnProject, speedPerDay, remaining, activeTypes, machineRows, today };
}

function renderMilestoneTab(container) {
  const filterBar = el('div', { class: 'filter-bar' });
  const projectSelect = el('select', {}, projectOptions().map((p) => el('option', { value: p }, p)));
  const printBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '🖨 Print Tracker');
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  filterBar.appendChild(printBtn);
  container.appendChild(filterBar);
  container.appendChild(el('p', { class: 'section-subtitle' }, 'All-time cumulative progress for the project. Project Start Date and Total Contract Area (Ha) are set on the project itself (Projects tab) — both optional, and the figures that need them show "—" until set.'));

  const body = el('div');
  container.appendChild(body);

  function refresh() {
    const project = projectSelect.value;
    body.innerHTML = '';
    if (!project) {
      body.appendChild(el('p', { class: 'section-subtitle' }, 'Add a project first (Projects tab).'));
      printBtn.disabled = true;
      return;
    }
    const data = computeMilestoneTracker(project);

    const grid = el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Project Start Date', value: data.project?.startDate ? formatDate(data.project.startDate) : '—' }),
      statCard({ label: 'Days on Project', value: data.daysOnProject === null ? '—' : String(data.daysOnProject) }),
      statCard({ label: 'Project Speed (Ha/Day)', value: data.speedPerDay === null ? '—' : data.speedPerDay.toFixed(2) }),
      statCard({ label: 'Grand Cumulative Achieved', value: `${data.grandCumulative.toFixed(2)} Ha` }),
      statCard({ label: 'Total Contract Area', value: data.project?.totalAreaHa ? `${data.project.totalAreaHa.toFixed(2)} Ha` : '—' }),
      statCard({ label: 'Remaining to Complete', value: data.remaining === null ? '—' : `${data.remaining.toFixed(2)} Ha`, tone: data.remaining !== null && data.remaining <= 0 ? 'good' : undefined }),
    ]);
    body.appendChild(grid);

    body.appendChild(el('h3', { class: 'subsection-title' }, 'Machinery / Operators (all-time)'));
    const tableContainer = el('div');
    body.appendChild(tableContainer);
    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Machinery' },
        { key: 'owner', label: 'Vendor' },
        { key: 'combinedDays', label: 'Combined Days', render: (r) => r.combinedDays },
        { key: 'officeDays', label: 'Office Days', render: (r) => r.officeDays },
        { key: 'businessDays', label: 'Business Days', render: (r) => r.businessDays },
        ...data.activeTypes.map((t) => ({ key: t.value, label: `${t.value} (${t.unit})`, render: (r) => (r.byType[t.value] || 0).toFixed(2) })),
      ],
      rows: data.machineRows,
      emptyText: 'No fleet assets currently assigned to this project.',
    });

    printBtn.disabled = false;
    printBtn.onclick = () => printMilestoneTracker(data);
  }

  projectSelect.addEventListener('change', refresh);
  refresh();
}

export function renderWeeklyReport(container) {
  container.innerHTML = '';

  let tab = 'weekly';
  const tabBar = el('div', { class: 'tab-bar' });
  const weeklyTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('weekly') }, 'Weekly Performance');
  const milestoneTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('milestone') }, 'Milestone Tracker');
  tabBar.appendChild(weeklyTabBtn);
  tabBar.appendChild(milestoneTabBtn);

  container.appendChild(sectionHeader('Weekly Report', 'Auto-generated project reports for weekly meetings — printable/downloadable'));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    weeklyTabBtn.classList.toggle('active', tab === 'weekly');
    milestoneTabBtn.classList.toggle('active', tab === 'milestone');
    body.innerHTML = '';
    if (tab === 'weekly') renderWeeklyPerformanceTab(body);
    else renderMilestoneTab(body);
  }

  setTab(tab);
}
