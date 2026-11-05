import { unitForOperationType } from './constants.js';

// Work stages can cover the same land. Keep output separate by project and
// stage so felling, stacking and root picking never become one hectare total.
export function operationMilestones(rows) {
  const groups = new Map();
  for (const row of rows) {
    const project = row.siteName || 'Unassigned project';
    const milestone = row.operationType || 'Unspecified work';
    const key = JSON.stringify([project, milestone]);
    if (!groups.has(key)) groups.set(key, { project, milestone, unit: unitForOperationType(row.operationType), quantity: 0, hours: 0, fuel: 0, reports: 0 });
    const group = groups.get(key);
    group.quantity += Number(row.quantity) || 0;
    group.hours += Number(row.hoursWorked) || 0;
    group.fuel += Number(row.fuelUsed) || 0;
    group.reports += 1;
  }
  return [...groups.values()].sort((a, b) => a.project.localeCompare(b.project) || a.milestone.localeCompare(b.milestone));
}
