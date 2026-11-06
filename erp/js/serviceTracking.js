export function completedEngineService(log) {
  if (log.type !== 'Service' || log.status !== 'Completed') return false;
  const text = log.description || '';
  const purchase = /\b(purchase|purchased|purchases|bought)\b/i.test(text);
  const actualService = /(last actual engine service|engine service completed|service carried out|machine serviced|dozer serviced)/i.test(text);
  return !purchase || actualService;
}

export function engineServiceStatus(item, logs, operations, asOf) {
  const dates = logs.filter(log => log.equipment === item.name && log.date <= asOf && completedEngineService(log)).map(log => log.date).sort();
  const since = dates.at(-1) || null;
  const interval = Number(item.serviceIntervalHours) > 0 ? Number(item.serviceIntervalHours) : 250;
  const hours = since ? operations.filter(row => row.equipment === item.name && row.date > since && row.date <= asOf)
    .reduce((sum, row) => sum + (Number(row.hoursWorked) || 0), 0) : 0;
  const ratio = since ? hours / interval : null;
  return { since, hours, interval, ratio, status: !since ? 'Service date missing' : ratio >= 1 ? 'Overdue' : ratio >= .8 ? 'Due Soon' : 'OK' };
}
