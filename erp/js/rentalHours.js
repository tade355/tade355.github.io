// Preserve the identity of hired dozers when Fleet display names change.
// Historical credits and work reports retain their original labels.
const RENTAL_LABELS = [
  ['Saheed (Osaro)', 'Ogbomo (Saheed)'],
  ['Pastor (Osaro)', 'Ogbomo Dozer (Pastor)'],
];

export function matchesRentalEquipment(recordedName, currentName) {
  if (!recordedName || !currentName) return false;
  const normal = (value) => String(value).trim().toLowerCase();
  if (normal(recordedName) === normal(currentName)) return true;
  return RENTAL_LABELS.some((group) => group.some((name) => normal(name) === normal(recordedName))
    && group.some((name) => normal(name) === normal(currentName)));
}

// Owner-facing rental usage is based on office hours, with one rental day
// equal to eight hours. Work beyond eight office hours on a date does not
// consume rental credit, and private business work is never included.
export function officeRentalUsage(operations, equipment, from, to) {
  const byDate = new Map();
  for (const row of operations || []) {
    if (!matchesRentalEquipment(row.equipment, equipment) || !row.date || row.date < from || (to && row.date > to) || row.workType === 'Business') continue;
    const hours = Number(row.hoursWorked || 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const entry = byDate.get(row.date) || { date: row.date, hoursWorked: 0, projects: new Set() };
    entry.hoursWorked += hours;
    const project = row.project || row.siteName;
    if (project) entry.projects.add(project);
    byDate.set(row.date, entry);
  }
  const work = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => ({
    date: entry.date,
    hoursWorked: Math.min(8, entry.hoursWorked),
    project: [...entry.projects].join(', '),
    daysUsed: Math.min(8, entry.hoursWorked) / 8,
  }));
  const hoursWorked = work.reduce((sum, row) => sum + row.hoursWorked, 0);
  return { work, hoursWorked, daysUsed: hoursWorked / 8, workedDates: work.length };
}
