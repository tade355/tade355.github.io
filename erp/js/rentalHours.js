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
    extraHours: Math.max(0, entry.hoursWorked - 8),
    project: [...entry.projects].join(', '),
    daysUsed: Math.min(8, entry.hoursWorked) / 8,
  }));
  const hoursWorked = work.reduce((sum, row) => sum + row.hoursWorked, 0);
  return { work, hoursWorked, daysUsed: hoursWorked / 8, workedDates: work.length };
}


// Internal operator extra-hour entitlement. This never changes owner rental
// credit or records a payment: Accounts must record a separate payment.
export function extraHourRateForOwnership(ownership) {
  return ownership === 'Rented' ? 50000 : ownership === 'Partnership' || ownership === 'Company' ? 10000 : 0;
}

export function internalExtraHourAllowances(operations, inventory) {
  return (inventory || []).flatMap((asset) => {
    const rate = extraHourRateForOwnership(asset.ownership);
    if (!rate) return [];
    return officeRentalUsage(operations, asset.name, '0000-01-01').work
      .filter((day) => day.extraHours > 0)
      .map((day) => ({ date: day.date, equipment: asset.name, ownership: asset.ownership,
        project: day.project, extraHours: day.extraHours, hourlyRate: rate,
        amountDue: day.extraHours * rate }));
  }).sort((a, b) => b.date.localeCompare(a.date) || a.equipment.localeCompare(b.equipment));
}

// Internal daily audit. Business work is shown to management, but never
// consumes rental credit or enters the owner-facing rental statement.
export function rentalDailyLedger(operations, credits, transfers, equipment) {
  const payments = (credits || []).filter((r) => matchesRentalEquipment(r.equipment, equipment));
  const movements = (transfers || []).filter((r) => matchesRentalEquipment(r.fromEquipment, equipment) || matchesRentalEquipment(r.toEquipment, equipment));
  const firstDate = payments.map((r) => r.paymentDate).sort()[0] || movements.map((r) => r.transferDate).sort()[0];
  if (!firstDate) return [];
  const byDate = new Map();
  const day = (date) => {
    if (!byDate.has(date)) byDate.set(date, { date, paidDays: 0, officeHours: 0, extraHours: 0, usedDays: 0, businessHours: 0, businessDays: 0, daysIn: 0, daysOut: 0 });
    return byDate.get(date);
  };
  payments.forEach((r) => { if (r.paymentDate) day(r.paymentDate).paidDays += Number(r.daysPaid || 0); });
  movements.forEach((r) => {
    if (!r.transferDate || r.transferDate < firstDate) return;
    if (matchesRentalEquipment(r.toEquipment, equipment)) day(r.transferDate).daysIn += Number(r.daysTransferred || 0);
    if (matchesRentalEquipment(r.fromEquipment, equipment)) day(r.transferDate).daysOut += Number(r.daysTransferred || 0);
  });
  officeRentalUsage(operations, equipment, firstDate).work.forEach((r) => {
    day(r.date).officeHours += r.hoursWorked;
    day(r.date).extraHours += r.extraHours;
    day(r.date).usedDays += r.daysUsed;
  });
  for (const r of operations || []) {
    if (!matchesRentalEquipment(r.equipment, equipment) || !r.date || r.date < firstDate || r.workType !== 'Business') continue;
    const hours = Number(r.hoursWorked || 0);
    if (Number.isFinite(hours) && hours > 0) day(r.date).businessHours += hours;
  }
  let balance = 0;
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
    r.businessDays = r.businessHours > 0 ? 1 : 0;
    balance += r.paidDays + r.daysIn - r.daysOut - r.usedDays;
    return { ...r, balanceDays: balance };
  });
}
