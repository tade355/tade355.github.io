import { unitForOperationType } from './constants.js';

export function isOperatorAccount(user) {
  return user?.accessTier === 'Staff' && (/operator/i.test(user.role || '') || !!user.assignedDozer);
}

export function operatorPeriod(reports, from, to) {
  const rows = reports.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
  const stages = new Map();
  for (const row of rows) {
    const name = row.milestone || 'Unspecified work';
    if (!stages.has(name)) stages.set(name, { name, quantity: 0, unit: unitForOperationType(row.milestone) });
    stages.get(name).quantity += Number(row.quantity) || 0;
  }
  return { rows, hours: rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0),
    days: new Set(rows.map(row => row.date)).size, stages: [...stages.values()] };
}
