import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, statCard, renderTable, statusPill } from '../ui.js';
import { getCurrentTier } from '../session.js';
import { hourlyRateAsOf } from '../rateHistory.js';

function companyDozers() {
  return store.get('inventory').filter((i) => i.ownership === 'Company' || !i.ownership);
}
function ledgerDozers() {
  return store.get('inventory').filter((i) => i.ownership === 'Partnership' || i.ownership === 'Rented');
}

function maintenanceCostFor(equipment, from, to) {
  return store.get('maintenanceLogs')
    .filter((m) => m.equipment === equipment && dateInRange(m.date, from, to))
    .reduce((sum, m) => sum + m.cost, 0);
}

function renderCompanyPerformance(container, from, to) {
  // Days Available / % Optimization / Potential Revenue only mean something
  // over a bounded period (a calendar day count) — left blank (all-time),
  // so those columns show "—" rather than a meaningless "days since forever".
  const hasRange = Boolean(from && to);
  const daysInPeriod = hasRange ? Math.round((new Date(to) - new Date(from)) / 86400000) + 1 : null;

  const rows = companyDozers().map((d) => {
    const operations = store.get('operations').filter((o) => o.equipment === d.name && dateInRange(o.date, from, to));
    const hours = operations.reduce((sum, o) => sum + (o.hoursWorked || 0), 0);
    const revenueProxy = operations.reduce((sum, o) => sum + (o.hoursWorked || 0) * hourlyRateAsOf(o.equipment, o.date), 0);
    const maintenanceCost = maintenanceCostFor(d.name, from, to);
    const profit = revenueProxy - maintenanceCost;
    const daysWorked = new Set(operations.map((o) => o.date)).size;
    const downtimeDays = hasRange ? Math.max(0, daysInPeriod - daysWorked) : null;
    const optimizationPct = hasRange && daysInPeriod ? (daysWorked / daysInPeriod) * 100 : null;
    // Potential revenue: what this dozer would have earned at its current
    // hourly rate had it worked a full 8h day every day of the period.
    const potentialRevenue = hasRange ? daysInPeriod * 8 * (d.hourlyRate || 0) : null;
    const shortfall = hasRange ? potentialRevenue - revenueProxy : null;
    return { name: d.name, hours, revenueProxy, maintenanceCost, profit, daysInPeriod, downtimeDays, optimizationPct, potentialRevenue, shortfall };
  });

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Company-Owned Dozer Performance'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Revenue is an estimate (hours worked × the dozer\'s ₦/hr rate in effect on each day — see Fleet Management → Rate History), not real billed revenue — clients are invoiced per project, not per machine. Days Available, % Optimization, Potential Revenue, and Shortfall need both From and To set — Downtime here means calendar days with no daily operations report, not specifically repair time (see Maintenance Log for that).'));
  const tableContainer = el('div');
  container.appendChild(tableContainer);
  renderTable(tableContainer, {
    columns: [
      { key: 'name', label: 'Dozer' },
      { key: 'hours', label: 'Hours Worked', render: (r) => `${r.hours} h` },
      { key: 'downtimeDays', label: 'Downtime (days)', render: (r) => (r.downtimeDays === null ? '—' : String(r.downtimeDays)) },
      { key: 'optimizationPct', label: '% Optimization', render: (r) => (r.optimizationPct === null ? '—' : `${r.optimizationPct.toFixed(0)}%`) },
      { key: 'revenueProxy', label: 'Actual Revenue (est.)', render: (r) => formatCurrency(r.revenueProxy) },
      { key: 'potentialRevenue', label: 'Potential Revenue', render: (r) => (r.potentialRevenue === null ? '—' : formatCurrency(r.potentialRevenue)) },
      { key: 'shortfall', label: 'Shortfall', render: (r) => (r.shortfall === null ? '—' : el('strong', { class: r.shortfall > 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.shortfall))) },
      { key: 'maintenanceCost', label: 'Maintenance Cost', render: (r) => formatCurrency(r.maintenanceCost) },
      { key: 'profit', label: 'Profit (est.)', render: (r) => el('strong', { class: r.profit >= 0 ? 'text-good' : 'text-critical' }, formatCurrency(r.profit)) },
    ],
    rows,
    emptyText: 'No Company-owned dozers in the fleet yet.',
  });
}

function renderInternalLedger(container) {
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Internal Ledger — Office vs Business'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Every day logged against a Partnership or Rented dozer, Office and Business alike — for internal use only. Business days and amounts never appear in the owner-shareable settlement (see Resource Management → Dozer Rent Payments).'));

  const filterBar = el('div', { class: 'filter-bar' });
  const dozers = ledgerDozers();
  const equipmentSelect = el('select', {}, [
    el('option', { value: '' }, 'Select a dozer —'),
    ...dozers.map((d) => el('option', { value: d.name }, d.name)),
  ]);
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Dozer'), equipmentSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const equipment = equipmentSelect.value;
    const from = fromInput.value;
    const to = toInput.value;
    const rows = store.get('operations')
      .filter((o) => (!equipment || o.equipment === equipment) && dateInRange(o.date, from, to) && ledgerDozers().some((d) => d.name === o.equipment))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const officeDays = new Set(rows.filter((r) => r.workType !== 'Business').map((r) => r.date)).size;
    const businessDays = rows.filter((r) => r.workType === 'Business').length;
    const businessEarnings = rows.filter((r) => r.workType === 'Business').reduce((sum, r) => sum + (r.businessAmount || 0), 0);

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Office Days', value: String(officeDays) }),
      statCard({ label: 'Business Days', value: String(businessDays), tone: businessDays ? 'warning' : 'good' }),
      statCard({ label: 'Business Earnings', value: formatCurrency(businessEarnings) }),
    ]));

    const employees = store.get('employees');
    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'equipment', label: 'Dozer' },
        { key: 'operator', label: 'Operator', render: (r) => employees.find((e) => e.id === r.operatorId)?.name || 'Unknown' },
        { key: 'hoursWorked', label: 'Hours', render: (r) => `${r.hoursWorked} h` },
        { key: 'workType', label: 'Work Type', render: (r) => statusPill(r.workType || 'Office') },
        { key: 'businessAmount', label: 'Business Amount', render: (r) => (r.workType === 'Business' ? formatCurrency(r.businessAmount) : '—') },
      ],
      rows,
      emptyText: 'No days logged for these filters yet.',
    });
  }

  [equipmentSelect, fromInput, toInput].forEach((input) => input.addEventListener('change', refresh));
  refresh();
}

export function renderDozerEconomics(container) {
  container.innerHTML = '';

  const isAdmin = getCurrentTier() === 'Admin';

  container.appendChild(sectionHeader('Dozer Economics', 'Company-owned dozer performance and revenue analysis'));

  const filterBar = el('div', { class: 'filter-bar' });
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  const companySection = el('div');
  container.appendChild(companySection);

  function refreshCompany() {
    companySection.innerHTML = '';
    renderCompanyPerformance(companySection, fromInput.value, toInput.value);
  }

  [fromInput, toInput].forEach((input) => input.addEventListener('change', refreshCompany));
  refreshCompany();

  if (isAdmin) {
    const ledgerSection = el('div');
    container.appendChild(ledgerSection);
    renderInternalLedger(ledgerSection);
  }
}
