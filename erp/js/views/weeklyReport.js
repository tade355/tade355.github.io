import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, renderTable, statCard } from '../ui.js';
import { OPERATION_TYPES, isHaOperationType } from '../constants.js';
import { printWeeklyPerformanceReport, printMilestoneTracker } from '../print.js';
import { provisionalRevenueForRows } from './profitability.js';
import { dieselRateAsOf, hourlyRateAsOf } from '../rateHistory.js';
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

// Expected Revenue: quantity achieved this period x the contract rate in
// effect that day, broken out per operation type (Ha and Ha-rate types
// achieve/earn very differently from Trekking's hrs, say, so a single
// blended total would hide which operation type is actually driving it).
// Trekking's revenue is always ₦0 (provisionalRevenueForRows excludes it
// at the source, so every consumer of that shared function agrees).
function computeExpectedRevenue(periodOps) {
  const byType = OPERATION_TYPES
    .map((t) => {
      const ops = periodOps.filter((o) => o.operationType === t.value);
      const qty = ops.reduce((sum, o) => sum + o.quantity, 0);
      return { type: t.value, unit: t.unit, qty, revenue: provisionalRevenueForRows(ops) };
    })
    .filter((t) => t.qty > 0);
  return { byType, total: byType.reduce((sum, t) => sum + t.revenue, 0) };
}

// Tentative Cost: a compact field estimate for management, not a full
// ledger reconciliation (see Profitability, Fuel Credit Tracking, and
// Dozer Rent Payments for the authoritative figures behind each of these).
// - Rental Cost: always covers every dozer on the roster, by ownership —
//   Partnership/Rented: days worked (excluding Business days) x Rental
//   Rate/Day, real rent paid out. Company: hours worked x Hourly Rate,
//   the imputed cost of using owned equipment (what it would cost to
//   replicate the operation from scratch) — hours rather than days
//   because Hourly Rate is a required field on every dozer, so this
//   always produces a real figure instead of depending on an optional
//   Rental Rate/Day that a Company dozer may never have had set.
// - Diesel Cost: Fuel Used x the diesel rate in effect that day.
// - Site Logistics: a flat ₦12,300 per working day (any day this period
//   with at least one roster dozer active) — 2 bikes x 5L PMS x the current
//   PMS price (₦1,230/L as of 22 Aug 2026), a standard daily site-support
//   rate, not derived from logged Logistics expenses. A flat figure, not
//   date-varying — if PMS price moves again, update this constant.
// - Diesel Logistics: a flat ₦1,500 per 30 litres of diesel used this
//   period — a standard delivery/handling rate, not a logged expense.
// - Operator Cost: ₦30,000 per 8 hours worked, for Company and Partnership
//   dozers only — a Rented dozer's day rate already includes the owner's
//   own operator, so it doesn't get this on top.
function computeTentativeCost(periodOps, rosterNames) {
  const dieselCost = periodOps.reduce((sum, o) => sum + (o.fuelUsed || 0) * dieselRateAsOf(o.date), 0);
  const totalDieselLitres = periodOps.reduce((sum, o) => sum + (o.fuelUsed || 0), 0);

  // Diesel rate is looked up per calendar day (it can change mid-period), so
  // the breakdown groups by date rather than by dozer — each row shows
  // exactly which rate applied and why the cost is what it is.
  const dieselDates = [...new Set(periodOps.map((o) => o.date))].sort();
  const dieselBreakdown = dieselDates.map((date) => {
    const litres = periodOps.filter((o) => o.date === date).reduce((sum, o) => sum + (o.fuelUsed || 0), 0);
    const rate = dieselRateAsOf(date);
    return { date, litres, rate, cost: litres * rate };
  });

  const roster = store.get('inventory').filter((i) => rosterNames.includes(i.name));

  const rentalBreakdown = roster.map((i) => {
    const ownership = i.ownership || 'Company';
    const dozerOps = periodOps.filter((o) => o.equipment === i.name && o.workType !== 'Business');
    if (ownership === 'Partnership' || ownership === 'Rented') {
      const days = new Set(dozerOps.map((o) => o.date)).size;
      return { name: i.name, ownership, basis: `${days} day(s) × ${formatCurrency(i.rentalRatePerDay || 0)}/day`, cost: days * (i.rentalRatePerDay || 0) };
    }
    const hours = dozerOps.reduce((sum, o) => sum + (o.hoursWorked || 0), 0);
    return { name: i.name, ownership, basis: `${hours.toFixed(1)} hr(s) × ${formatCurrency(i.hourlyRate || 0)}/hr`, cost: hours * (i.hourlyRate || 0) };
  }).filter((r) => r.cost > 0);
  const rentalCost = rentalBreakdown.reduce((sum, r) => sum + r.cost, 0);

  const workingDays = new Set(periodOps.map((o) => o.date)).size;
  const siteLogistics = workingDays * 12300;
  const dieselLogistics = (totalDieselLitres / 30) * 1500;

  const rosterByName = new Map(roster.map((i) => [i.name, i]));
  const operatorCost = periodOps.reduce((sum, o) => {
    const ownership = rosterByName.get(o.equipment)?.ownership || 'Company';
    if (ownership === 'Rented') return sum;
    return sum + ((o.hoursWorked || 0) / 8) * 30000;
  }, 0);

  return {
    rentalCost, dieselCost, siteLogistics, dieselLogistics, operatorCost,
    rentalBreakdown, dieselBreakdown, workingDays, totalDieselLitres,
    total: rentalCost + dieselCost + siteLogistics + dieselLogistics + operatorCost,
  };
}

// Actual Weekly Summary: a fuller cost-and-margin table mirroring the
// company's own weekly field-report spreadsheet — a different lens from
// Revenue & Cost (Tentative) above, not a replacement for it. Actual
// Revenue reuses the same Expected Revenue figure (reported Ha x contract
// rate) rather than a separately-invoiced figure. Total Cost here uses the
// app's standard Profitability-style Dozer Cost (hoursWorked x hourlyRate,
// same formula as Profitability/Dozer Economics), so every dozer gets a
// cost figure regardless of ownership — unlike Tentative Cost's Rental
// Cost, which only applies to Partnership/Rented dozers. Fuel- and
// Maintenance-cost-head ledger entries are excluded from Logistics/Others
// since Diesel Cost is already derived from litres consumed and
// Maintenance is tracked separately via the Maintenance Log below — adding
// either back in would double them up (same reasoning Profitability
// already applies to Fuel-category expenses).
//
// M/c Recovered has two components, by ownership:
// - Partnership/Rented: the Management Fee retained (days worked x fee/day)
//   — the same bookkeeping Dozer Rent Payments uses for a formal owner
//   settlement, auto-computed here instead of manually entered per dozer.
// - Company-owned: hours worked x Hourly Rate (the same basis Tentative
//   Cost's Rental Cost uses for Company dozers) — no rent is actually paid
//   out, so this is money saved by using owned equipment instead of
//   renting equivalent capacity.
// Either way, it's net of the roster's Maintenance Log repair costs this
// period (Maintenance Incurred below).
function computeActualWeeklySummary(project, periodStart, periodEnd, dates, periodOps, revenueData, rosterNames) {
  const dieselCost = periodOps.reduce((sum, o) => sum + (o.fuelUsed || 0) * dieselRateAsOf(o.date), 0);
  const dozerCost = periodOps.reduce((sum, o) => sum + (o.hoursWorked || 0) * hourlyRateAsOf(o.equipment, o.date), 0);

  const otherEntries = collectEntries().filter((e) =>
    e.type === 'Expenditure' && e.project === project && e.costHead !== 'Fuel' && e.costHead !== 'Maintenance');
  const logisticsOthersCost = otherEntries.filter((e) => dateInRange(e.date, periodStart, periodEnd)).reduce((sum, e) => sum + e.amount, 0);

  const totalCost = dieselCost + dozerCost + logisticsOthersCost;
  const actualProfit = revenueData.total - totalCost;
  const actualProfitPct = revenueData.total ? (actualProfit / revenueData.total) * 100 : 0;

  const roster = store.get('inventory').filter((i) => rosterNames.includes(i.name));
  const mcRecovered = roster.reduce((sum, i) => {
    const dozerOps = periodOps.filter((o) => o.equipment === i.name && o.workType !== 'Business');
    if (i.ownership === 'Partnership' || i.ownership === 'Rented') {
      const officeDays = new Set(dozerOps.map((o) => o.date)).size;
      return sum + officeDays * (i.managementFeePerDay || 0);
    }
    const hours = dozerOps.reduce((s, o) => s + (o.hoursWorked || 0), 0);
    return sum + hours * (i.hourlyRate || 0);
  }, 0);
  const rosterNameSet = new Set(roster.map((i) => i.name));
  const maintenanceIncurred = store.get('maintenanceLogs')
    .filter((m) => rosterNameSet.has(m.equipment) && dateInRange(m.date, periodStart, periodEnd))
    .reduce((sum, m) => sum + (m.cost || 0), 0);
  const netMcRecovered = mcRecovered - maintenanceIncurred;
  const totalMargin = actualProfit + netMcRecovered;

  const totalDieselLitres = periodOps.reduce((sum, o) => sum + (o.fuelUsed || 0), 0);

  const dailyRows = dates.map((date) => {
    const dayOps = periodOps.filter((o) => o.date === date);
    const dozersToday = new Set(dayOps.map((o) => o.equipment)).size;
    const dayRevenue = computeExpectedRevenue(dayOps).total;
    const dayDiesel = dayOps.reduce((sum, o) => sum + (o.fuelUsed || 0) * dieselRateAsOf(o.date), 0);
    const dayDozer = dayOps.reduce((sum, o) => sum + (o.hoursWorked || 0) * hourlyRateAsOf(o.equipment, o.date), 0);
    const dayLogisticsOthers = otherEntries.filter((e) => e.date === date).reduce((sum, e) => sum + e.amount, 0);
    const dayCost = dayDiesel + dayDozer + dayLogisticsOthers;
    return { date, label: dayLabel(date), dozers: dozersToday, revenue: dayRevenue, cost: dayCost, profit: dayRevenue - dayCost };
  });

  return {
    dieselCost, dozerCost, logisticsOthersCost, totalCost,
    actualProfit, actualProfitPct,
    mcRecovered, maintenanceIncurred, netMcRecovered, totalMargin,
    totalDieselLitres, dailyRows,
  };
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
    const rosterNames = data.rows.map((r) => r.name);
    const costData = computeTentativeCost(periodOps, rosterNames);
    const actualData = computeActualWeeklySummary(project, periodStart, periodEnd, datesInRange(periodStart, periodEnd), periodOps, revenueData, rosterNames);

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

    // --- Revenue (shared by both cost lenses below — Tentative and Actual
    // start from the exact same reported-Ha × contract-rate figure, so it's
    // shown once rather than repeated under each). ---
    body.appendChild(el('h3', { class: 'subsection-title' }, 'Revenue'));
    body.appendChild(el('p', { class: 'section-subtitle' }, 'Quantity achieved this period × the contract rate in effect that day (Projects → Rate History) — provisional/expected revenue, not verified or invoiced revenue.'));
    body.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Revenue', value: formatCurrency(revenueData.total), tone: 'good' }),
    ]));
    body.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, 'Operation Type'), el('th', {}, 'Quantity'), el('th', {}, 'Revenue')])]),
      el('tbody', {}, revenueData.byType.length
        ? revenueData.byType.map((t) => el('tr', {}, [
            el('td', {}, t.type), el('td', {}, `${t.qty.toFixed(2)} ${t.unit}`), el('td', {}, formatCurrency(t.revenue)),
          ]))
        : [el('tr', {}, [el('td', { colspan: '3' }, 'No operations logged for this project in this period yet.')])]),
    ])]));

    // --- Tentative (field estimate): standard flat rates, computable the
    // same day a report comes in, before any ledger entries exist. ---
    body.appendChild(el('h3', { class: 'subsection-title' }, 'Cost & Profit — Tentative (Field Estimate)'));
    body.appendChild(el('p', { class: 'section-subtitle' }, 'A quick field estimate using standard flat rates, not a full ledger reconciliation — see Profitability, Fuel Credit Tracking, and Dozer Rent Payments for the authoritative figures.'));
    body.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Tentative Cost', value: formatCurrency(costData.total) }),
      statCard({ label: 'Tentative Profit', value: formatCurrency(revenueData.total - costData.total), tone: revenueData.total - costData.total >= 0 ? 'good' : 'critical' }),
    ]));
    const tentativeTotal = costData.total;
    body.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, 'Cost Item'), el('th', {}, 'Basis'), el('th', {}, 'Amount')])]),
      el('tbody', {}, [
        el('tr', {}, [el('td', {}, 'Rental Cost'), el('td', {}, 'Partnership/Rented: days × Rental Rate/Day. Company: hours × Hourly Rate.'), el('td', {}, formatCurrency(costData.rentalCost))]),
        el('tr', {}, [el('td', {}, 'Diesel Cost'), el('td', {}, 'Fuel Used × the diesel rate in effect that day'), el('td', {}, formatCurrency(costData.dieselCost))]),
        el('tr', {}, [el('td', {}, 'Site Logistics'), el('td', {}, `₦12,300 × ${costData.workingDays} working day(s)`), el('td', {}, formatCurrency(costData.siteLogistics))]),
        el('tr', {}, [el('td', {}, 'Diesel Logistics'), el('td', {}, `₦1,500 per 30L × ${costData.totalDieselLitres.toLocaleString()}L`), el('td', {}, formatCurrency(costData.dieselLogistics))]),
        el('tr', {}, [el('td', {}, 'Operator Cost'), el('td', {}, '₦30,000 per 8 hrs worked (Company & Partnership only)'), el('td', {}, formatCurrency(costData.operatorCost))]),
        el('tr', { class: 'row-cumulative' }, [el('td', {}, el('strong', {}, 'Tentative Cost')), el('td', {}, ''), el('td', {}, el('strong', {}, formatCurrency(tentativeTotal)))]),
      ]),
    ])]));

    body.appendChild(el('h4', { class: 'subsection-title' }, 'Rental Cost — by Dozer'));
    body.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, 'Dozer'), el('th', {}, 'Ownership'), el('th', {}, 'Basis'), el('th', {}, 'Cost')])]),
      el('tbody', {}, costData.rentalBreakdown.length
        ? costData.rentalBreakdown.map((r) => el('tr', {}, [
            el('td', {}, r.name), el('td', {}, r.ownership), el('td', {}, r.basis), el('td', {}, formatCurrency(r.cost)),
          ]))
        : [el('tr', {}, [el('td', { colspan: '4' }, 'No dozer on this roster has a rate set, or none worked this period.')])]),
    ])]));

    body.appendChild(el('h4', { class: 'subsection-title' }, 'Diesel Cost — by Day'));
    body.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, 'Date'), el('th', {}, 'Litres Used'), el('th', {}, 'Rate/L'), el('th', {}, 'Cost')])]),
      el('tbody', {}, costData.dieselBreakdown.length
        ? costData.dieselBreakdown.map((d) => el('tr', {}, [
            el('td', {}, formatDate(d.date)), el('td', {}, `${d.litres.toLocaleString()} L`), el('td', {}, formatCurrency(d.rate)), el('td', {}, formatCurrency(d.cost)),
          ]))
        : [el('tr', {}, [el('td', { colspan: '4' }, 'No fuel logged for this project in this period.')])]),
    ])]));

    // --- Actual (ledger-based): Profitability's standard cost formulas
    // plus this project's real Logistics/Other spend and this roster's
    // real Maintenance Log costs. ---
    body.appendChild(el('h3', { class: 'subsection-title' }, 'Cost & Profit — Actual (Ledger-Based)'));
    body.appendChild(el('p', { class: 'section-subtitle' }, 'Dozer Cost uses hours worked × hourly rate for every dozer on the roster (Profitability\'s standard formula) — a different figure from Tentative Cost\'s Rental Cost above. Not a full ledger reconciliation either — see Profitability for the company-wide authoritative figures.'));
    body.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Total Cost', value: formatCurrency(actualData.totalCost) }),
      statCard({ label: 'Actual Profit', value: `${formatCurrency(actualData.actualProfit)} (${actualData.actualProfitPct.toFixed(0)}%)`, tone: actualData.actualProfit >= 0 ? 'good' : 'critical' }),
      statCard({ label: 'Total Margin', value: formatCurrency(actualData.totalMargin), tone: actualData.totalMargin >= 0 ? 'good' : 'critical' }),
    ]));
    const pctOfCost = (v) => (actualData.totalCost ? `${((v / actualData.totalCost) * 100).toFixed(1)}%` : '—');
    body.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, 'Cost Item'), el('th', {}, 'Basis'), el('th', {}, 'Amount'), el('th', {}, '% of Total')])]),
      el('tbody', {}, [
        el('tr', {}, [el('td', {}, 'Diesel Cost'), el('td', {}, 'Fuel Used × the diesel rate in effect that day'), el('td', {}, formatCurrency(actualData.dieselCost)), el('td', {}, pctOfCost(actualData.dieselCost))]),
        el('tr', {}, [el('td', {}, 'Dozer Cost'), el('td', {}, 'Hours Worked × the hourly rate on file for each dozer'), el('td', {}, formatCurrency(actualData.dozerCost)), el('td', {}, pctOfCost(actualData.dozerCost))]),
        el('tr', {}, [el('td', {}, 'Logistics & Others'), el('td', {}, "This project's Logistics/other expenses this period"), el('td', {}, formatCurrency(actualData.logisticsOthersCost)), el('td', {}, pctOfCost(actualData.logisticsOthersCost))]),
        el('tr', { class: 'row-cumulative' }, [el('td', {}, el('strong', {}, 'Total Cost')), el('td', {}, ''), el('td', {}, el('strong', {}, formatCurrency(actualData.totalCost))), el('td', {}, '100%')]),
      ]),
    ])]));
    body.appendChild(el('p', { class: 'section-subtitle' }, `Total Litres of Diesel Used: ${actualData.totalDieselLitres.toLocaleString()} L`));

    body.appendChild(el('h4', { class: 'subsection-title' }, 'Machine Recovery'));
    body.appendChild(el('p', { class: 'section-subtitle' }, 'The Management Fee retained on Partnership/Rented dozers, plus money saved by using Company-owned dozers instead of renting equivalent capacity (hours worked × Hourly Rate) — net of the roster\'s Maintenance Log cost this period. Maintenance Incurred here is informational, not part of Total Cost above (it\'s already excluded there to avoid double-counting).'));
    body.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [
      el('tbody', {}, [
        el('tr', {}, [el('td', {}, 'M/c Recovered'), el('td', {}, formatCurrency(actualData.mcRecovered))]),
        el('tr', {}, [el('td', {}, 'Maintenance Incurred'), el('td', {}, `-${formatCurrency(actualData.maintenanceIncurred)}`)]),
        el('tr', { class: 'row-cumulative' }, [el('td', {}, el('strong', {}, 'Net M/c Recovered')), el('td', {}, el('strong', {}, formatCurrency(actualData.netMcRecovered)))]),
        el('tr', { class: 'row-cumulative' }, [
          el('td', {}, el('strong', {}, 'Total Margin (Actual Profit + Net M/c Recovered)')),
          el('td', { class: actualData.totalMargin >= 0 ? 'text-good' : 'text-critical' }, el('strong', {}, formatCurrency(actualData.totalMargin))),
        ]),
      ]),
    ])]));

    body.appendChild(el('h4', { class: 'subsection-title' }, 'Daily Summary'));
    const dailyTable = el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, 'Date'), el('th', {}, 'No of Dozers'), el('th', {}, 'Revenue'), el('th', {}, 'Cost'), el('th', {}, 'Profit')])]),
      el('tbody', {}, actualData.dailyRows.map((d) => el('tr', {}, [
        el('td', {}, d.label),
        el('td', {}, String(d.dozers)),
        el('td', {}, d.revenue ? formatCurrency(d.revenue) : '—'),
        el('td', {}, d.cost ? formatCurrency(d.cost) : '—'),
        el('td', { class: d.profit >= 0 ? 'text-good' : 'text-critical' }, (d.revenue || d.cost) ? formatCurrency(d.profit) : '—'),
      ]))),
    ]);
    body.appendChild(el('div', { class: 'table-wrap' }, [dailyTable]));

    printBtn.disabled = false;
    printBtn.onclick = () => printWeeklyPerformanceReport(project, { ...data, revenueData, costData, actualData });
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
