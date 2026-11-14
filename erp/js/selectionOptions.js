// Choices for new operational records. Historical tables still read the full store.
const CURRENT_PROJECTS = new Set([
  'rex forestry project - kangidi',
  'blue sky project - ajue-ore',
]);
export function selectableProjects(projects) {
  return projects.filter((project) => CURRENT_PROJECTS.has(String(project.name || '').trim().toLowerCase())
    && String(project.status || '').toLowerCase() === 'active');
}
export function selectableEmployees(employees) {
  return employees.filter((employee) => String(employee.status || '').toLowerCase() === 'active' && !employee.archivedAt);
}
export function selectableMachines(items) {
  return items.filter((item) => {
    const name = String(item.name || '').trim().toLowerCase();
    const status = String(item.fleetStatus || item.status || '').trim().toLowerCase();
    return !item.archivedAt && !item.withdrawnAt && !item.disengagedAt
      && !['withdrawn', 'disengaged', 'retired', 'archived'].includes(status)
      && name !== 'chi-005';
  });
}

function latestMachineReport(item, date, reports = []) {
  const names = new Set([item.name, item.assetCode, item.sku].filter(Boolean).map(x => String(x).trim().toLowerCase()));
  if (item.name === 'EMG-005') ['big-001','big-01','big 01','big fish'].forEach(x => names.add(x));
  return reports.filter(r => r.date <= date).flatMap(r => (r.lines || [])
    .filter(l => names.has(String(l.equipment || '').trim().toLowerCase()))
    .map(l => ({ ...l, date: r.date, project: r.project, stamp: r.updatedAt || r.createdAt || '' })))
    .sort((a,b) => b.date.localeCompare(a.date) || b.stamp.localeCompare(a.stamp))[0] || null;
}

// Current roster assignments populate today's portal even before the first
// work report. Historical dates use dated deployment/report evidence.
export function machineProjectAsOf(item, date, operations = [], reports = [], today = '', known = null) {
  const effective = item.currentProjectSince || (known && known.project === item.currentProject ? known.since : '');
  if (item.currentProject && !effective && today && date >= today) return item.currentProject;
  const events = operations.filter(o => o.equipment === item.name && o.date <= date && o.siteName)
    .map(o => ({ date: o.date, project: o.siteName, rank: 0 }));
  const report = latestMachineReport(item, date, reports);
  if (report?.project) events.push({ date: report.date, project: report.project, rank: 1 });
  if (item.currentProject && effective && effective <= date) events.push({ date: effective, project: item.currentProject, rank: 2 });
  events.sort((a,b) => b.date.localeCompare(a.date) || b.rank - a.rank);
  return events[0]?.project || (!effective ? item.currentProject : null) || null;
}

export function machineStateAsOf(item, date, reports = []) {
  const report = latestMachineReport(item, date, reports);
  if (!report) return null;
  const raw = report.status;
  const conditionDate = String(item.updatedAt || '').slice(0,10);
  const condition = conditionDate && conditionDate <= date && ['Down','Under Maintenance'].includes(item.fleetStatus) ? 'Under Maintenance' : '';
  return { status: ['Breakdown','Down','Under Maintenance'].includes(raw) ? 'Under Maintenance'
    : ['Not Active','Idle'].includes(raw) ? (condition || 'Idle') : 'Active',
    date: report.date, source: ['Not Active','Idle'].includes(raw) && condition ? 'Fleet condition' : 'Machine status report' };
}
