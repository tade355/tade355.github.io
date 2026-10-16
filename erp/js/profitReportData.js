// Data for the Operations Profitability Report: the same kind of report as the
// supervisor / dozer profitability review (profit, output, start times,
// operators, supervisors, flagged days), for any date range and any set of
// sections the user picks.
//
// Pure: everything is passed in through `ctx` (see reportContext.js).
import { economicsByOp, expectedHa, toMinutes, EXPECTED_HA_PER_8HRS } from './opEconomics.js';

export const IDEAL_START_MINUTES = 7 * 60;
export const LATE_MINUTES = 60;

export const REPORT_SECTIONS = [
  { key: 'summary', label: 'Summary (revenue, costs, profit)', default: true },
  { key: 'daily', label: 'Day by day', default: true },
  { key: 'trend', label: 'Output and start-time trend (charts)', default: true },
  { key: 'dozers', label: 'By dozer', default: true },
  { key: 'operators', label: 'By operator', default: true },
  { key: 'supervisors', label: 'Supervisor comparison', default: true },
  { key: 'flagged', label: 'Flagged days (below break-even, corrections, deals, late starts)', default: true },
  { key: 'diesel', label: 'Diesel summary', default: false },
  { key: 'requests', label: 'Requests and expenses', default: false },
];

const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const pct = (a, e) => (e > 0 ? (a / e) * 100 : null);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function aggregate(rows) {
  const hours = sum(rows, (r) => r.op.hoursWorked);
  const ha = sum(rows, (r) => r.op.quantity);
  const revenue = sum(rows, (r) => r.revenue);
  const cost = sum(rows, (r) => r.cost);
  const starts = rows.map((r) => toMinutes(r.op.timeResumed)).filter((v) => v !== null);
  return {
    days: new Set(rows.map((r) => r.op.date)).size,
    hours, ha, expected: expectedHa(hours),
    outputPct: pct(ha, expectedHa(hours)),
    revenue, cost, net: revenue - cost,
    margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
    avgStart: avg(starts),
    lateDays: rows.filter((r) => { const s = toMinutes(r.op.timeResumed); return s !== null && s - IDEAL_START_MINUTES >= LATE_MINUTES; }).length,
  };
}

export function buildProfitReport(ctx, { project, from, to, sections }) {
  const want = new Set(sections && sections.length ? sections : REPORT_SECTIONS.filter((s) => s.default).map((s) => s.key));
  const empName = (id) => ctx.employees.find((e) => e.id === id)?.name || id || '—';
  const ops = ctx.operations
    .filter((o) => o.siteName === project && o.date >= from && o.date <= to)
    .sort((a, b) => (a.date === b.date ? (a.equipment < b.equipment ? -1 : 1) : (a.date < b.date ? -1 : 1)));
  const rows = economicsByOp(ctx, project, ops);
  const days = [...new Set(ops.map((o) => o.date))];
  const totals = ctx.statsFor(from, to);

  const report = { project, from, to, sections: [...want], days, totals, workingDays: days.length, ops: ops.length };
  report.overall = aggregate(rows);

  // ------------------------------------------------------------ day by day
  report.daily = days.map((date) => {
    const dayRows = rows.filter((r) => r.op.date === date);
    const a = aggregate(dayRows);
    const s = ctx.statsFor(date, date);
    return {
      date, dozers: new Set(dayRows.map((r) => r.op.equipment)).size, hours: a.hours, ha: a.ha, outputPct: a.outputPct,
      revenue: s.provisionalRevenue, cost: s.totalCost, opsProfit: s.opsProfit, mcRecovered: s.mcRecovered,
      maintenance: s.maintenanceIncurred, totalProfit: s.totalProfit, avgStart: a.avgStart,
    };
  });

  // ---------------------------------------------------------------- trends
  report.trend = {
    days,
    outputPct: report.daily.map((d) => d.outputPct),
    avgStart: report.daily.map((d) => d.avgStart),
  };

  // -------------------------------------------------- by dozer / operator
  const group = (keyFn, labelFn, extra) => {
    const keys = [...new Set(rows.map(keyFn).filter(Boolean))];
    return keys.map((key) => {
      const r = rows.filter((x) => keyFn(x) === key);
      const a = aggregate(r);
      return { key, label: labelFn(key, r), ...a, ...(extra ? extra(key, r) : {}) };
    }).sort((a, b) => (b.outputPct ?? -1) - (a.outputPct ?? -1));
  };
  report.byDozer = group((r) => r.op.equipment, (k, r) => {
    const names = [...new Set(r.map((x) => empName(x.op.operatorId)).filter((n) => n !== '—'))];
    return names.length ? `${k} · ${names.join(', ')}` : k;
  }, (k, r) => ({
    breakEvenPct: pct(sum(r, (x) => x.cost), sum(r, (x) => x.expected) * (ctx.projectRateAsOf(project, 'Phase 1', to).rate || 0)),
    ownership: r[0].ownership,
  }));
  report.byOperator = group((r) => r.op.operatorId, (k) => empName(k), (k, r) => ({ dozers: [...new Set(r.map((x) => x.op.equipment))].join(', ') }));
  report.bySupervisor = group((r) => r.op.supervisorId, (k) => empName(k));
  // Which supervisor was on duty each day (for the comparison table).
  report.supervisorDays = days.map((date) => ({ date, supervisors: [...new Set(rows.filter((r) => r.op.date === date).map((r) => empName(r.op.supervisorId)))] }));

  // ---------------------------------------------------------- flagged days
  const flagged = [];
  rows.forEach((r) => {
    const o = r.op;
    const start = toMinutes(o.timeResumed);
    if ((o.hoursWorked || 0) > 0 && !(o.quantity > 0)) flagged.push({ date: o.date, equipment: o.equipment, reason: 'Correction day: hours worked, no hectares', net: r.net });
    if (o.workType === 'Business') flagged.push({ date: o.date, equipment: o.equipment, reason: `Deal day${o.businessAmount ? ` (₦${Number(o.businessAmount).toLocaleString()})` : ''}`, net: r.net });
    if (r.outputPct !== null && r.breakEvenPct !== null && r.outputPct < r.breakEvenPct && o.quantity > 0) flagged.push({ date: o.date, equipment: o.equipment, reason: `Below break-even (${r.outputPct.toFixed(1)}% vs ${r.breakEvenPct.toFixed(1)}%)`, net: r.net });
    if (start !== null && start - IDEAL_START_MINUTES >= LATE_MINUTES) flagged.push({ date: o.date, equipment: o.equipment, reason: `Late start (${Math.floor((start - IDEAL_START_MINUTES) / 60)}h ${String((start - IDEAL_START_MINUTES) % 60).padStart(2, '0')}m after 7:00 AM)`, net: r.net });
  });
  report.flagged = flagged.sort((a, b) => (a.date === b.date ? (a.equipment < b.equipment ? -1 : 1) : (a.date < b.date ? -1 : 1)));

  // ----------------------------------------------------------------- diesel
  const dist = ctx.distributions.filter((d) => d.project === project && d.date >= from && d.date <= to);
  const colls = ctx.fuelCreditCollections.filter((c) => c.date >= from && c.date <= to && c.fuelType === 'Diesel');
  const isSold = (c) => /sold to/i.test(c.notes || '');
  const dieselDozers = [...new Set([...dist.map((d) => d.equipment), ...ops.map((o) => o.equipment)])].sort();
  report.diesel = {
    collected: sum(colls.filter((c) => !isSold(c)), (c) => c.litres),
    sold: sum(colls.filter(isSold), (c) => c.litres),
    distributed: sum(dist, (d) => d.litres),
    used: sum(ops, (o) => o.fuelUsed),
    usedCost: sum(ops, (o) => (o.fuelUsed || 0) * ctx.dieselRateAsOf(o.date)),
    perDozer: dieselDozers.map((e) => {
      const dd = sum(dist.filter((d) => d.equipment === e), (d) => d.litres);
      const uu = sum(ops.filter((o) => o.equipment === e), (o) => o.fuelUsed);
      const ha = sum(ops.filter((o) => o.equipment === e), (o) => o.quantity);
      return { equipment: e, distributed: dd, used: uu, litresPerHa: ha > 0 ? uu / ha : null };
    }),
  };

  // --------------------------------------------------------------- requests
  const reqs = ctx.fundRequests.filter((r) => r.project === project && r.date >= from && r.date <= to);
  const total = (r) => sum(r.items || [], (it) => it.amount);
  const byCat = {};
  reqs.forEach((r) => { const k = r.costHead || 'Other'; byCat[k] = byCat[k] || { category: k, requested: 0, paid: 0, pending: 0, approved: 0 }; byCat[k].requested += total(r); if (r.status === 'Paid') byCat[k].paid += total(r); if (r.status === 'Pending') byCat[k].pending += total(r); if (r.status === 'Approved') byCat[k].approved += total(r); });
  report.requests = {
    requested: sum(reqs, total), paid: sum(reqs.filter((r) => r.status === 'Paid'), total),
    pending: sum(reqs.filter((r) => r.status === 'Pending'), total), approved: sum(reqs.filter((r) => r.status === 'Approved'), total),
    byCategory: Object.values(byCat).sort((a, b) => b.requested - a.requested),
  };
  report.expectedHaPer8 = EXPECTED_HA_PER_8HRS;
  return report;
}
