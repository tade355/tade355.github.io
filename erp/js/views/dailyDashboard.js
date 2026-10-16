// Daily Operations Dashboard — the ERP version of the daily HTML dashboards:
// 1 Operations, 2 Diesel, 3 Fleet, 4 Requests & Expenses, 5 Profitability,
// 6 Staff Performance, with the Actions/Flags list on top. Everything is
// derived live from ERP records (see dailyDashboardData.js).
import { store } from '../store.js';
import { el, formatCurrency, formatDate } from '../utils.js';
import { statCard, statusPill } from '../ui.js';
import { renderBarChart, CATEGORICAL_COLORS } from '../charts.js';
import { todayISOString, addDays } from '../dateUtils.js';
import { hourlyRateAsOf, dieselRateAsOf, projectRateAsOf } from '../rateHistory.js';
import { operatorAllowanceForRows } from '../ownedOperatorAllowance.js';
import { computeProjectStats, projectNames } from './profitability.js';
import { stationBalances } from './fuelCredit.js';
import { DASHBOARD_BASIS_FROM } from '../dashboardBasis.js';
import { buildDashboardHtml, dashboardFileName } from '../dashboardHtml.js';
import { ICONS } from '../icons.js';
import { askCard, reportBuilderCard } from './ddTools.js';
import {
  buildDailyDashboard, minutesToClock, EXPECTED_HA_PER_8HRS, IDEAL_START, DIESEL_FILL_LITRES,
} from '../dailyDashboardData.js';

const money = (n) => `${n < 0 ? '−' : ''}₦${Math.round(Math.abs(n)).toLocaleString()}`;
const num = (n, d = 1) => (n === null || n === undefined ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const lit = (n) => (n === null || n === undefined ? '—' : num(n, Number.isInteger(n) ? 0 : 1));
const pctText = (n) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}%`);
const tone = (n) => (n >= 0 ? 'text-good' : 'text-critical');

// A small table builder with click-to-sort headers (numeric columns sort by
// `sortValue`, text columns alphabetically) and an optional row highlight.
function sortableTable(columns, rows, { rowClass, footer } = {}) {
  const table = el('table', { class: 'data-table dd-table' });
  const tbody = el('tbody');
  let sortKey = null;
  let asc = true;
  const headCells = columns.map((c, idx) => {
    const th = el('th', { class: c.sort === false ? '' : 'dd-sortable' }, c.label);
    if (c.sort !== false) {
      th.addEventListener('click', () => {
        asc = sortKey === idx ? !asc : true;
        sortKey = idx;
        headCells.forEach((h, i) => { h.dataset.sort = i === idx ? (asc ? 'asc' : 'desc') : ''; });
        draw();
      });
    }
    return th;
  });
  table.appendChild(el('thead', {}, [el('tr', {}, headCells)]));
  table.appendChild(tbody);
  function draw() {
    tbody.innerHTML = '';
    let list = rows.slice();
    if (sortKey !== null) {
      const c = columns[sortKey];
      const val = (r) => (c.sortValue ? c.sortValue(r) : (c.text ? c.text(r) : ''));
      list.sort((a, b) => {
        const va = val(a); const vb = val(b);
        const na = typeof va === 'number'; const nb = typeof vb === 'number';
        let cmp;
        if (na || nb) cmp = (na ? va : -Infinity) - (nb ? vb : -Infinity);
        else cmp = String(va).localeCompare(String(vb));
        return asc ? cmp : -cmp;
      });
    }
    list.forEach((r) => {
      tbody.appendChild(el('tr', { class: rowClass ? rowClass(r) : undefined }, columns.map((c) => {
        const td = el('td', { class: c.num ? 'dd-num' : undefined });
        const content = c.render(r);
        if (content instanceof Node) td.appendChild(content); else td.textContent = content ?? '—';
        return td;
      })));
    });
    if (footer) tbody.appendChild(footer());
  }
  draw();
  return el('div', { class: 'table-wrap' }, [table]);
}

function section(id, number, title, children) {
  return el('section', { id: `dd-${id}`, class: 'dd-section' }, [
    el('h3', { class: 'subsection-title' }, `${number}. ${title}`),
    ...children,
  ]);
}

function flagsBanner(flags) {
  const items = flags.slice(0, 7).map((f) => el('li', { class: `dd-flag dd-flag-${f.tone}` }, [
    f.text, f.action ? el('span', {}, [' ', el('strong', {}, 'Action:'), ` ${f.action}`]) : null,
  ]));
  return el('div', { class: 'dd-banner' }, [
    el('h4', {}, 'Actions/Flags'),
    items.length ? el('ul', {}, items) : el('p', { class: 'section-subtitle' }, 'Nothing to flag for this day.'),
  ]);
}

// Prints the dashboard page itself: body.print-page keeps the page content and
// drops the app chrome (see the @media print rules), and is removed again once
// the print dialog closes.
// Saves the dashboard as the same single-file HTML report that is shared daily:
// the current Fueling Request selection and on-ground figure are included.
function downloadHtml(d) {
  if (!d) return;
  const html = buildDashboardHtml(d, { fueling: d.diesel.fuelingState });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: dashboardFileName(d.date) });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function printPage() {
  document.body.classList.add('print-page');
  const done = () => { document.body.classList.remove('print-page'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

function onGroundNote(x, fmtDate) {
  if (!x.onGroundDate) return 'No stock count logged';
  const base = `Stock count of ${fmtDate(x.onGroundDate)}`;
  if (!x.onGroundIn && !x.onGroundOut) return base;
  return `${base} (${Math.round(x.onGroundBase)} L) + ${Math.round(x.onGroundIn)} L collected − ${Math.round(x.onGroundOut)} L distributed since`;
}

export function renderDailyDashboard(container) {
  container.innerHTML = '';
  const realToday = todayISOString();
  const projects = projectNames();
  const defaultProject = projects.find((p) => /kangidi/i.test(p)) || projects[0] || '';

  const projectSelect = el('select', {}, projects.map((p) => el('option', { value: p }, p)));
  projectSelect.value = defaultProject;
  const dateInput = el('input', { type: 'date', max: realToday, value: realToday });
  const sinceInput = el('input', { type: 'date', value: DASHBOARD_BASIS_FROM });
  const prevBtn = el('button', { type: 'button', class: 'btn btn-ghost', title: 'Previous day' }, [el('span', { html: ICONS.chevronLeft }), 'Prev day']);
  const nextBtn = el('button', { type: 'button', class: 'btn btn-ghost', title: 'Next day' }, ['Next day', el('span', { html: ICONS.chevronRight })]);
  const todayBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Today');
  const printBtn = el('button', { type: 'button', class: 'btn btn-ghost', onClick: printPage }, [el('span', { html: ICONS.printer }), 'Print']);
  let current = null;
  const downloadBtn = el('button', { type: 'button', class: 'btn btn-primary', title: 'Download this dashboard as a single HTML file (same format as the daily dashboard report)', onClick: () => downloadHtml(current) }, [el('span', { html: ICONS.download }), 'Download HTML']);

  container.appendChild(el('div', { class: 'section-header' }, [el('div', {}, [
    el('h2', {}, 'Daily Operations Dashboard'),
    el('p', { class: 'section-subtitle' }, 'Operations, diesel, fleet, requests, profitability and staff performance for one site and day — the same sections as the daily dashboard report.'),
  ])]));
  container.appendChild(el('div', { class: 'filter-bar' }, [
    el('label', { class: 'filter-field' }, [el('span', {}, 'Site'), projectSelect]),
    el('label', { class: 'filter-field' }, [el('span', {}, 'Viewing'), dateInput]),
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Change day' }, [prevBtn, todayBtn, nextBtn]),
    el('label', { class: 'filter-field' }, [el('span', {}, 'Cumulative since'), sinceInput]),
    el('div', { class: 'filter-actions' }, [printBtn, downloadBtn]),
  ]));
  // Ask the ERP is open to everyone who can see this page; the profitability
  // report builder/download is shown to Olumide only.
  const askPanel = askCard(() => projectSelect.value);
  container.appendChild(askPanel);
  const reportPanel = reportBuilderCard(() => projectSelect.value);
  if (reportPanel) container.appendChild(reportPanel);
  const body = el('div', { class: 'dd-body' });
  container.appendChild(body);

  function go(d) { dateInput.value = d; refresh(); }
  prevBtn.addEventListener('click', () => go(addDays(dateInput.value || realToday, -1)));
  nextBtn.addEventListener('click', () => go(addDays(dateInput.value || realToday, 1)));
  todayBtn.addEventListener('click', () => go(realToday));
  [projectSelect, dateInput, sinceInput].forEach((i) => i.addEventListener('change', refresh));

  function refresh() {
    body.innerHTML = '';
    const project = projectSelect.value;
    const date = dateInput.value || realToday;
    const since = sinceInput.value && sinceInput.value <= date ? sinceInput.value : date;
    const balance = stationBalances().reduce((s, st) => s + Math.max(0, st.balance), 0);
    const d = buildDailyDashboard({
      project, date, since,
      operations: store.get('operations'), inventory: store.get('inventory'), employees: store.get('employees'),
      distributions: store.get('dieselSiteDistributions'), fuelCreditCollections: store.get('fuelCreditCollections'),
      fundRequests: store.get('fundRequests'), maintenanceLogs: store.get('maintenanceLogs'), dieselStockCounts: store.get('dieselStockCounts'),
      hourlyRateAsOf, dieselRateAsOf, projectRateAsOf, operatorAllowanceForRows,
      statsFor: (a, b) => computeProjectStats(project, a, b),
      stationBalance: balance,
    });

    current = d;
    body.appendChild(el('p', { class: 'section-subtitle' }, `${project} — ${formatDate(date)}. Expected output ${EXPECTED_HA_PER_8HRS} ha per 8 hrs; ideal start ${IDEAL_START} AM; cumulative figures since ${formatDate(since)}.`));
    body.appendChild(flagsBanner(d.flags));
    body.appendChild(el('div', { class: 'dd-jump' }, ['operations:1. Operations', 'diesel:2. Diesel', 'fleet:3. Fleet', 'requests:4. Requests & Expenses', 'profit:5. Profitability', 'staff:6. Staff Performance']
      .map((t) => { const [id, label] = t.split(':'); return el('a', { href: `#/dailyDashboard`, onClick: (e) => { e.preventDefault(); document.getElementById(`dd-${id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, label); })));

    body.appendChild(operationsSection(d));
    body.appendChild(dieselSection(d));
    body.appendChild(fleetSection(d));
    body.appendChild(requestsSection(d));
    body.appendChild(profitSection(d));
    body.appendChild(staffSection(d));
    body.appendChild(el('p', { class: 'dd-footer' }, 'Prepared by ERP Software'));
  }
  refresh();
}

// ---------------------------------------------------------------- 1 Operations
function operationsSection(d) {
  const o = d.operations;
  const tiles = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Dozers reporting', value: `${o.reporting} of ${o.fleetCount}`, tone: o.reporting < o.fleetCount / 2 ? 'warning' : undefined }),
    statCard({ label: 'Ha cleared today', value: `${num(o.todayHa)} ha` }),
    statCard({ label: 'Hours worked today', value: `${num(o.todayHours)} hrs` }),
    statCard({ label: 'Site cumulative', value: `${num(o.cumulativeHa)} ha`, tone: 'good', hint: `since ${formatDate(d.since)}` }),
  ]);
  const table = sortableTable([
    { label: 'Dozer', render: (r) => el('span', {}, [el('strong', {}, r.equipment), r.operator ? el('span', { class: 'dd-muted' }, ` · ${r.operator}`) : null]), text: (r) => r.equipment },
    { label: 'Supervisor', render: (r) => r.supervisor || '—', text: (r) => r.supervisor || '' },
    { label: 'Block', render: (r) => r.block || '—', text: (r) => r.block || '' },
    { label: 'Hrs Worked', num: true, render: (r) => (r.reported ? num(r.hours) : '0'), sortValue: (r) => r.hours },
    { label: 'Ha Cleared', num: true, render: (r) => (r.reported ? num(r.ha) : '0'), sortValue: (r) => r.ha },
    { label: 'Expected Ha', num: true, render: (r) => (r.reported ? num(r.expected, 2) : '—'), sortValue: (r) => r.expected },
    { label: '% of Expected', num: true, render: (r) => pctText(r.pctExpected), sortValue: (r) => r.pctExpected ?? -1 },
    { label: 'Cumulative Ha', num: true, render: (r) => num(r.cumulativeHa), sortValue: (r) => r.cumulativeHa },
  ], o.rows, { rowClass: (r) => (!r.reported ? 'dd-missing' : (r.pctExpected !== null && r.pctExpected < 71.9 ? 'row-warning' : undefined)) });
  return section('operations', 1, 'Operation Reports — Hours Worked & Hectares Cleared', [
    el('p', { class: 'section-subtitle' }, `Expected: ${EXPECTED_HA_PER_8HRS} ha per 8 hrs. Cumulative Ha = each dozer's total since ${formatDate(d.since)}.`),
    tiles, table,
  ]);
}

// -------------------------------------------------------------------- 2 Diesel
function dieselSection(d) {
  const x = d.diesel;
  const tiles = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Collected today (AGO)', value: `${num(x.collectedAgo, 0)} L`, hint: x.soldAgo ? `Excludes ${num(x.soldAgo, 0)} L sold on, not site diesel` : 'Station collection report' }),
    statCard({ label: 'Collected today (PMS)', value: `${num(x.collectedPms, 0)} L` }),
    statCard({ label: 'Distributed to dozers', value: `${num(x.distributedToday, 0)} L` }),
    statCard({ label: 'Used today', value: `${num(x.usedToday, 0)} L`, hint: `@ ${money(x.dieselRate)}/L = ${money(x.usedCost)}` }),
    statCard({ label: 'On ground, undistributed', value: x.onGround === null ? '—' : `${num(x.onGround, 0)} L`, tone: x.onGround === 0 ? 'critical' : undefined, hint: onGroundNote(x, formatDate) }),
  ]);

  const chartBox = el('div', { class: 'chart-card' });
  renderBarChart(chartBox, {
    title: `Distribution per dozer, ${formatDate(d.date)}`,
    bars: x.distributionChart.length ? x.distributionChart.map((b, i) => ({ label: b.label, value: b.value, colorVar: CATEGORICAL_COLORS[0] })) : [],
    formatValue: (v) => `${v.toLocaleString()} L`,
  });
  if (!x.distributionChart.length) chartBox.appendChild(el('p', { class: 'section-subtitle' }, 'No diesel distributed today.'));

  const fuelBox = fuelingRequestCard(d);
  const table = sortableTable([
    { label: 'Dozer', render: (r) => el('strong', {}, r.equipment), text: (r) => r.equipment },
    { label: 'Opening (L)', num: true, render: (r) => lit(r.opening), sortValue: (r) => r.opening },
    { label: 'Distributed (L)', num: true, render: (r) => lit(r.distributed), sortValue: (r) => r.distributed },
    { label: 'Used (L)', num: true, render: (r) => lit(r.used), sortValue: (r) => r.used },
    { label: 'Closing (L)', num: true, render: (r) => lit(r.closing), sortValue: (r) => r.closing },
    { label: 'Efficiency (L/ha)', num: true, render: (r) => num(r.efficiency), sortValue: (r) => r.efficiency ?? -1 },
    { label: 'Status', render: (r) => statusPill(r.status === 'Closing restated' ? `Closing restated (reported ${num(r.reportedClosing, 0)}L)` : r.status), text: (r) => r.status },
  ], x.rows, { rowClass: (r) => (r.status === 'Closing restated' ? 'row-warning' : undefined) });

  return section('diesel', 2, 'Diesel Management', [
    tiles,
    el('div', { class: 'dd-grid-2' }, [chartBox, fuelBox]),
    el('p', { class: 'section-subtitle' }, `Opening = previous closing + diesel distributed; used = standard litres from the daily reports; chain starts ${formatDate(d.since)}.`),
    table,
    el('h4', { class: 'subsection-title' }, 'Diesel Balance at Stations'),
    el('p', { class: 'section-subtitle' }, `Owed to stations (fuel credit) — ${money(x.stationBalance)}`),
  ]);
}

function fuelingRequestCard(d) {
  const x = d.diesel;
  const chosen = new Set(x.fuelingRequest.map((r) => r.equipment));
  const closingOf = (name) => Math.max(0, x.rows.find((r) => r.equipment === name)?.closing ?? 0);
  const names = [...new Set([...x.rows.map((r) => r.equipment), ...x.fuelingRequest.map((r) => r.equipment)])].sort();
  const onGroundInput = el('input', { type: 'number', min: '0', step: '1', value: x.onGround ?? 0, class: 'dd-small-input' });
  const list = el('div', { class: 'dd-kv' });
  const totals = el('div', { class: 'dd-kv' });

  function redraw() {
    list.innerHTML = '';
    let total = 0;
    names.forEach((name) => {
      const closing = closingOf(name);
      const need = Math.max(0, DIESEL_FILL_LITRES - closing);
      const box = el('input', { type: 'checkbox' });
      box.checked = chosen.has(name);
      box.addEventListener('change', () => { if (box.checked) chosen.add(name); else chosen.delete(name); redraw(); });
      if (chosen.has(name)) total += need;
      list.appendChild(el('label', { class: 'dd-kv-row' }, [el('span', {}, [box, ` ${name}`]), el('span', {}, `closing ${lit(closing)}L → needs ${lit(need)}L`)]));
    });
    const onGround = Number(onGroundInput.value) || 0;
    const actual = Math.max(0, total - onGround);
    d.diesel.fuelingState = { rows: names.filter((n) => chosen.has(n)).map((n) => ({ equipment: n, closing: closingOf(n), need: Math.max(0, DIESEL_FILL_LITRES - closingOf(n)) })), onGround };
    totals.innerHTML = '';
    [['Total to balance', `${lit(total)} L`], ['Less on ground', `${lit(onGround)} L`], ['Actually needed', `${lit(actual)} L (${money(actual * x.dieselRate)})`]]
      .forEach(([k, v], i) => totals.appendChild(el('div', { class: 'dd-kv-row' }, [el('span', {}, k), el('strong', {}, v)])));
  }
  onGroundInput.addEventListener('input', redraw);
  redraw();
  return el('div', { class: 'chart-card' }, [
    el('h4', { class: 'chart-title' }, `Fueling Request — ${formatDate(addDays(d.date, 1))}`),
    el('p', { class: 'section-subtitle' }, `Need = ${DIESEL_FILL_LITRES}L − closing diesel. Pre-selected: dozers that worked today plus dozers listed Active that have worked since the start date; tick or untick to match tomorrow's list.`),
    list,
    el('label', { class: 'dd-kv-row' }, [el('span', {}, 'On ground (L)'), onGroundInput]),
    totals,
  ]);
}

// --------------------------------------------------------------------- 3 Fleet
function fleetSection(d) {
  const table = sortableTable([
    { label: 'Dozer', render: (r) => el('strong', {}, r.equipment), text: (r) => r.equipment },
    { label: 'Ownership', render: (r) => el('span', {}, [r.ownership, el('span', { class: 'dd-muted' }, ` · ${r.ownerName ? `${r.ownerName}, ` : ''}${money(r.hourlyRate)}/hr`)]), text: (r) => r.ownership },
    { label: 'Status', render: (r) => statusPill(r.status), text: (r) => r.status },
    { label: 'Hrs Worked', num: true, render: (r) => (r.hours ? num(r.hours) : '—'), sortValue: (r) => r.hours },
    { label: 'Optimization', num: true, render: (r) => pctText(r.optimization), sortValue: (r) => r.optimization ?? -1 },
    { label: 'Remarks', sort: false, render: (r) => r.remarks },
  ], d.fleet, { rowClass: (r) => (r.fleetStatus === 'Down' ? 'row-critical' : r.fleetStatus === 'Under Maintenance' ? 'row-warning' : undefined) });
  const vendors = sortableTable([
    { label: 'Vendor', render: (r) => r.vendor, text: (r) => r.vendor },
    { label: 'Dozer(s)', render: (r) => r.dozers.join(', '), text: (r) => r.dozers.join(', ') },
    { label: `Accrued since ${formatDate(d.since)} (₦)`, num: true, render: (r) => num(r.accrued, 0), sortValue: (r) => r.accrued },
  ], d.vendorAccrual);
  return section('fleet', 3, 'Fleet Management — Status, Productivity & Remarks', [
    table,
    el('h4', { class: 'subsection-title' }, 'Vendor Accrual — 2nd & 3rd Party Dozers'),
    vendors,
  ]);
}

// -------------------------------------------------------- 4 Requests & Expenses
function requestsSection(d) {
  const r = d.requests;
  const tiles = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Requested today', value: money(r.requestedToday), hint: `${money(r.requestedCumulative)} since ${formatDate(d.since)}` }),
    statCard({ label: 'Paid today', value: money(r.paidToday), tone: r.paidToday ? 'good' : undefined, hint: `${money(r.paidCumulative)} cumulative` }),
    statCard({ label: 'Pending', value: money(r.pending), tone: 'warning' }),
    statCard({ label: 'Approved, payment unconfirmed', value: money(r.approved), tone: 'warning' }),
  ]);
  const table = sortableTable([
    { label: 'Description', render: (x) => el('span', {}, [x.description, x.isNew ? el('span', { class: 'dd-muted' }, ' · new today') : null]), text: (x) => x.description },
    { label: 'Category', render: (x) => x.category, text: (x) => x.category },
    { label: 'Amount (₦)', num: true, render: (x) => num(x.amount, 0), sortValue: (x) => x.amount },
    { label: 'Status', render: (x) => statusPill(x.status), text: (x) => x.status },
  ], r.rows);
  const chartBox = el('div', { class: 'chart-card' });
  if (r.paidByCategory.length) {
    renderBarChart(chartBox, { title: `Paid today, by category (${money(r.paidToday)})`, bars: r.paidByCategory.map((b) => ({ label: b.label, value: b.value, colorVar: CATEGORICAL_COLORS[1] })), formatValue: money });
  } else {
    chartBox.appendChild(el('h4', { class: 'chart-title' }, 'Paid today, by category'));
    chartBox.appendChild(el('p', { class: 'section-subtitle' }, 'No payments made today.'));
  }
  return section('requests', 4, 'Requests & Expenses', [
    el('p', { class: 'section-subtitle' }, `Unresolved (Pending / Approved) requests since ${formatDate(d.since)} plus today's new requests.`),
    tiles, el('div', { class: 'dd-grid-2' }, [table, chartBox]),
  ]);
}

// ------------------------------------------------------------- 5 Profitability
function profitSection(d) {
  const t = d.profit.today; const c = d.profit.cumulative;
  const tiles = el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Revenue, cumulative', value: money(c.provisionalRevenue), hint: `${money(t.provisionalRevenue)} today` }),
    statCard({ label: 'Total Cost, cumulative', value: money(c.totalCost), hint: `${money(t.totalCost)} today` }),
    statCard({ label: 'Operations Profit, cumulative', value: money(c.opsProfit), tone: c.opsProfit >= 0 ? 'good' : 'critical', hint: `${money(t.opsProfit)} today` }),
  ]);
  const lines = [
    ['Revenue', 'provisionalRevenue', 'Ha × contract rate'],
    ['Diesel Cost', 'dieselCost', 'Litres used × diesel price'],
    ['Logistics', 'logisticsCost', '₦50/L of diesel supplied to Company and Rented dozers'],
    ['Operator Allowance', 'operatorAllowanceCost', 'Owned EMG operators, day rate per 8 hrs'],
    ['Supervisor Sunday Allowance', 'supervisorSundayAllowance', '₦20,000 per supervisor per Sunday'],
    ['Dozer Cost — Owned', 'dozerOwned', 'Hours × hourly rate'],
    ['Dozer Cost — Rented', 'dozerRented', 'Hours × hourly rate'],
    ['Dozer Cost — Partnership', 'dozerPartnership', 'Hours × hourly rate'],
    ['PMS — Tacoma', 'pmsTacoma', 'PMS collected at the station'],
    ['PMS — unexplained', 'pmsUnexplained', 'Flagged, not yet explained'],
  ];
  const otherT = t.otherCost - t.supervisorSundayAllowance; const otherC = c.otherCost - c.supervisorSundayAllowance;
  const lineRows = lines.map(([label, key, basis]) => ({ label, today: t[key], cumulative: c[key], basis }));
  if (Math.abs(otherT) > 0.5 || Math.abs(otherC) > 0.5) lineRows.splice(4, 0, { label: 'Other costs (earlier rules)', today: otherT, cumulative: otherC, basis: 'Requests, manager Sunday allowance (before 10 Oct 2026)' });
  const lineTable = sortableTable([
    { label: 'Line', sort: false, render: (r) => r.label },
    { label: 'Today (₦)', sort: false, num: true, render: (r) => num(r.today, 0) },
    { label: 'Cumulative (₦)', sort: false, num: true, render: (r) => num(r.cumulative, 0) },
    { label: 'Basis', sort: false, render: (r) => r.basis },
  ], lineRows, {
    rowClass: (r) => (r.label === 'PMS — unexplained' && r.cumulative ? 'row-warning' : undefined),
    footer: () => el('tr', { class: 'row-cumulative' }, [el('td', {}, el('strong', {}, 'Operations Profit')), el('td', { class: 'dd-num' }, el('strong', { class: tone(t.opsProfit) }, num(t.opsProfit, 0))), el('td', { class: 'dd-num' }, el('strong', { class: tone(c.opsProfit) }, num(c.opsProfit, 0))), el('td', {}, 'Revenue less all costs above')]),
  });

  const contribution = d.profit.contribution;
  const contribTable = sortableTable([
    { label: 'Dozer', render: (r) => el('span', {}, [el('strong', {}, r.equipment), r.operator ? el('span', { class: 'dd-muted' }, ` · ${r.operator}`) : null]), text: (r) => r.equipment },
    { label: 'Hrs', num: true, render: (r) => num(r.hours), sortValue: (r) => r.hours },
    { label: 'Ha', num: true, render: (r) => num(r.ha), sortValue: (r) => r.ha },
    { label: 'Output vs expected', num: true, render: (r) => pctText(r.outputPct), sortValue: (r) => r.outputPct ?? -1 },
    { label: 'Break-even', num: true, render: (r) => pctText(r.breakEvenPct), sortValue: (r) => r.breakEvenPct ?? -1 },
    { label: 'Revenue (₦)', num: true, render: (r) => num(r.revenue, 0), sortValue: (r) => r.revenue },
    { label: 'Cost (₦)', num: true, render: (r) => num(r.cost, 0), sortValue: (r) => r.cost },
    { label: 'Net (₦)', num: true, render: (r) => el('span', { class: tone(r.net) }, num(r.net, 0)), sortValue: (r) => r.net },
  ], contribution, {
    rowClass: (r) => (r.outputPct !== null && r.breakEvenPct !== null && r.outputPct < r.breakEvenPct ? 'row-warning' : undefined),
    footer: () => {
      const extras = d.profit.extraRows.map((e) => el('tr', {}, [el('td', {}, e.label), el('td', {}), el('td', {}), el('td', {}), el('td', {}), el('td', { class: 'dd-num' }, '0'), el('td', { class: 'dd-num' }, num(e.cost, 0)), el('td', { class: 'dd-num' }, el('span', { class: 'text-critical' }, num(-e.cost, 0)))]));
      const totalRow = el('tr', { class: 'row-cumulative' }, [el('td', {}, el('strong', {}, 'Operations Profit')), el('td', { class: 'dd-num' }, num(contribution.reduce((s, r) => s + r.hours, 0))), el('td', { class: 'dd-num' }, num(contribution.reduce((s, r) => s + r.ha, 0))), el('td', {}), el('td', {}), el('td', { class: 'dd-num' }, num(t.provisionalRevenue, 0)), el('td', { class: 'dd-num' }, num(t.totalCost, 0)), el('td', { class: 'dd-num' }, el('strong', { class: tone(t.opsProfit) }, num(t.opsProfit, 0)))]);
      const frag = document.createDocumentFragment();
      extras.forEach((e) => frag.appendChild(e));
      frag.appendChild(totalRow);
      return frag;
    },
  });

  const recovery = sortableTable([
    { label: 'Line', sort: false, render: (r) => r.label },
    { label: 'Today (₦)', sort: false, num: true, render: (r) => num(r.today, 0) },
    { label: 'Cumulative (₦)', sort: false, num: true, render: (r) => el('span', { class: r.tone ? tone(r.cumulative) : undefined }, num(r.cumulative, 0)) },
    { label: 'Basis', sort: false, render: (r) => r.basis },
  ], [
    { label: 'M/c Recovered', today: t.mcRecovered, cumulative: c.mcRecovered, basis: 'Company dozers, cost avoided vs. renting' },
    { label: 'Maintenance Incurred', today: t.maintenanceIncurred, cumulative: c.maintenanceIncurred, basis: 'Approved/Paid maintenance requests and expenses, maintenance PMS' },
    { label: 'Net M/c Recovered', today: t.netMcRecovered, cumulative: c.netMcRecovered, basis: '', tone: true },
  ]);
  const total = sortableTable([
    { label: 'Line', sort: false, render: (r) => r.label },
    { label: 'Today (₦)', sort: false, num: true, render: (r) => num(r.today, 0) },
    { label: 'Cumulative (₦)', sort: false, num: true, render: (r) => num(r.cumulative, 0) },
  ], [
    { label: 'Operations Profit', today: t.opsProfit, cumulative: c.opsProfit },
    { label: 'Net M/c Recovered', today: t.netMcRecovered, cumulative: c.netMcRecovered },
    { label: 'Total Profit', today: t.totalProfit, cumulative: c.totalProfit },
  ], { rowClass: (r) => (r.label === 'Total Profit' ? 'row-cumulative' : undefined) });

  return section('profit', 5, 'Profitability', [
    el('p', { class: 'section-subtitle' }, `Revenue at the contract rate per Ha. Today vs. cumulative since ${formatDate(d.since)}. Rules apply from ${formatDate(DASHBOARD_BASIS_FROM)}.`),
    tiles, lineTable,
    el('h4', { class: 'subsection-title' }, 'Contribution by Dozer — Today'),
    contribution.length ? contribTable : el('p', { class: 'section-subtitle' }, 'No dozer reported today.'),
    el('p', { class: 'section-subtitle' }, 'Cost = dozer rate + diesel + diesel logistics + operator allowance. Break-even = output needed to cover cost.'),
    el('h4', { class: 'subsection-title' }, 'Machine Recovery'), recovery,
    el('h4', { class: 'subsection-title' }, 'Total Profit'), total,
  ]);
}

// ------------------------------------------------------- 6 Staff Performance
function staffSection(d) {
  const table = sortableTable([
    { label: 'Rank', num: true, render: (r) => String(d.staff.indexOf(r) + 1), sortValue: (r) => d.staff.indexOf(r) },
    { label: 'Name', render: (r) => el('span', {}, [el('strong', {}, r.name), el('br'), el('span', { class: 'dd-muted' }, r.role)]), text: (r) => r.name },
    { label: `Resumption (last 3 days${d.staff[0] ? `, ${formatDate(d.staff[0].days[0])} →` : ''})`, sort: false, render: (r) => r.resumption.join(' → ') },
    { label: 'Late vs 7:00 AM', render: (r) => r.lateToday, text: (r) => r.lateToday },
    { label: 'Hrs Today', num: true, render: (r) => num(r.hoursToday), sortValue: (r) => r.hoursToday },
    { label: 'Productivity trend (last 3 days)', sort: false, render: (r) => r.productivity.map((p) => (p === null ? '—' : `${p.toFixed(1)}%`)).join(' → ') },
    { label: 'Cumulative', num: true, render: (r) => pctText(r.cumulative), sortValue: (r) => r.cumulative ?? -1 },
  ], d.staff, { rowClass: (r) => (r.lateMinutesToday !== null && r.lateMinutesToday >= 60 ? 'row-warning' : undefined) });
  return section('staff', 6, 'Staff Performance', [
    el('p', { class: 'section-subtitle' }, `Ranked by cumulative productivity since ${formatDate(d.since)} (hectares cleared vs. expected for the hours worked). Ideal resumption is ${IDEAL_START} AM. Resumption and productivity trends cover the last 3 days (rolling), oldest first.`),
    d.staff.length ? table : el('p', { class: 'section-subtitle' }, 'No operator reports in this period.'),
  ]);
}
