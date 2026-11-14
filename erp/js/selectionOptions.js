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
