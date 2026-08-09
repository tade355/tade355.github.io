import { store } from '../store.js';
import { formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, renderTable, statCard } from '../ui.js';
import { OPERATION_TYPES, isHaOperationType } from '../constants.js';
import { printWeeklyPerformanceReport, printMilestoneTracker } from '../print.js';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function projectOptions() {
  return store.get('projects').map((p) => p.name);
}

function fleetForProject(project) {
  return store.get('inventory').filter((i) => i.currentProject === project);
}

// The roster for a week is the union of dozers currently assigned to the
// project AND dozers with real operations logged under it that week — not
// just currentProject alone. currentProject is a single mutable snapshot
// (today's assignment), so a dozer moved, reassigned, or simply lagging
// that field would otherwise silently vanish from a week it actually
// worked, even though "all dozers under this project this week" should
// include it. Currently-assigned-but-idle dozers still show up (as a
// zero-activity row), which matters for weekly meetings flagging no-shows.
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

function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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

// Weekly Performance Report: per dozer assigned to the project (via its
// Current Project on the Fleet Roster), Ha achieved each day of the
// selected Mon-Sun week, plus a Cumulative row and per-operation-type
// weekly totals — matching the real field report format.
function computeWeeklyPerformance(project, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const weekOps = store.get('operations').filter((o) => o.siteName === project && dateInRange(o.date, weekStart, weekEnd));
  const dozers = rosterForProject(project, weekOps);

  const rows = dozers.map((d) => {
    const ops = weekOps.filter((o) => o.equipment === d.name);
    const byDay = DAY_LABELS.map((_, i) => {
      const date = addDays(weekStart, i);
      return ops.filter((o) => o.date === date && isHaOperationType(o.operationType)).reduce((sum, o) => sum + o.quantity, 0);
    });
    const total = byDay.reduce((a, b) => a + b, 0);
    const actualDays = byDay.filter((v) => v > 0).length;
    const types = [...new Set(ops.map((o) => o.operationType).filter(Boolean))];
    return {
      name: d.name,
      types: types.join(', ') || '—',
      start: avgTime(ops.filter((o) => o.timeResumed).map((o) => timeToMinutes(o.timeResumed))),
      close: avgTime(ops.filter((o) => o.timeClosed).map((o) => timeToMinutes(o.timeClosed))),
      byDay,
      total,
      speedPerDay: actualDays ? total / actualDays : 0,
      plannedDays: 7,
      actualDays,
    };
  });

  const cumulative = DAY_LABELS.map((_, i) => rows.reduce((sum, r) => sum + r.byDay[i], 0));

  const typeTotals = OPERATION_TYPES
    .map((t) => ({ type: t.value, unit: t.unit, total: weekOps.filter((o) => o.operationType === t.value).reduce((sum, o) => sum + o.quantity, 0) }))
    .filter((t) => t.total > 0);

  return { rows, cumulative, typeTotals, weekStart, weekEnd };
}

function renderWeeklyPerformanceTab(container) {
  const filterBar = el('div', { class: 'filter-bar' });
  const projectSelect = el('select', {}, projectOptions().map((p) => el('option', { value: p }, p)));
  const weekInput = el('input', { type: 'date' });
  weekInput.value = mondayOf(new Date().toISOString().slice(0, 10));
  const printBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '🖨 Print Report');
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Week Of (any day in the week)'), weekInput]));
  filterBar.appendChild(printBtn);
  container.appendChild(filterBar);
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Rows are every dozer currently assigned to this project (Fleet Management → Fleet Roster → Current Project), plus any dozer with an operations report logged against this project this week even if its Current Project has since changed. Only Ha-unit operation types count toward the daily grid — see the totals below it for Road/Trekking.'));

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
    const weekStart = mondayOf(weekInput.value || new Date().toISOString().slice(0, 10));
    const data = computeWeeklyPerformance(project, weekStart);

    body.appendChild(el('h3', { class: 'subsection-title' }, `Week of ${formatDate(weekStart)} – ${formatDate(data.weekEnd)}`));

    const table = el('table', { class: 'data-table' });
    const thead = el('thead', {}, [el('tr', {}, [
      el('th', {}, 'Dozer'), el('th', {}, 'Type'), el('th', {}, 'Start'), el('th', {}, 'Close'),
      ...DAY_LABELS.map((d) => el('th', {}, d)),
      el('th', {}, 'Total'), el('th', {}, 'Speed Ha/Day'), el('th', {}, 'Planned Days'), el('th', {}, 'Actual Days'),
    ])]);
    table.appendChild(thead);

    const tbody = el('tbody');
    data.rows.forEach((r) => {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, r.name), el('td', {}, r.types), el('td', {}, r.start || '—'), el('td', {}, r.close || '—'),
        ...r.byDay.map((v) => el('td', {}, v ? v.toFixed(1) : '—')),
        el('td', {}, r.total.toFixed(1)), el('td', {}, r.speedPerDay.toFixed(1)), el('td', {}, String(r.plannedDays)), el('td', {}, String(r.actualDays)),
      ]));
    });
    const cumulativeTotal = data.cumulative.reduce((a, b) => a + b, 0);
    tbody.appendChild(el('tr', { class: 'row-cumulative' }, [
      el('td', { colspan: '4' }, el('strong', {}, 'Cumulative')),
      ...data.cumulative.map((v) => el('td', {}, el('strong', {}, v.toFixed(1)))),
      el('td', {}, el('strong', {}, cumulativeTotal.toFixed(1))), el('td', {}, ''), el('td', {}, ''), el('td', {}, ''),
    ]));
    table.appendChild(tbody);
    if (!data.rows.length) {
      body.appendChild(el('p', { class: 'section-subtitle' }, 'No fleet assets assigned to this project, and no operations logged against it this week.'));
    }
    body.appendChild(table);

    const footer = el('div', { class: 'weekly-report-footer' });
    data.typeTotals.forEach((t) => {
      footer.appendChild(el('p', {}, [el('strong', {}, `Total ${t.unit === 'Ha' ? 'Ha' : t.unit} Achieved for ${t.type}: `), `${t.total.toFixed(2)} ${t.unit}`]));
    });
    if (!data.typeTotals.length) footer.appendChild(el('p', { class: 'section-subtitle' }, 'No operations logged for this project this week yet.'));
    body.appendChild(footer);

    printBtn.disabled = false;
    printBtn.onclick = () => printWeeklyPerformanceReport(project, data);
  }

  [projectSelect, weekInput].forEach((input) => input.addEventListener('change', refresh));
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
