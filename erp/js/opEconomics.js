// Per-report economics for each Daily Operations row — the same cost rules the
// Daily Operations Dashboard uses (dashboardBasis.js), worked out row by row so
// reports can group them by dozer, operator, supervisor or day.
//
// Pure: everything comes in through `ctx` (see reportContext.js).
import { onDashboardBasis, dozerCostFor, DIESEL_LOGISTICS_PER_LITRE } from './dashboardBasis.js';

export const EXPECTED_HA_PER_8HRS = 1.3;

export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function expectedHa(hours) {
  return (hours / 8) * EXPECTED_HA_PER_8HRS;
}

// Rows must be in date order; diesel logistics (₦50 per litre distributed to
// Company/Rented dozers) is charged once per dozer per day, on its first row.
export function economicsByOp(ctx, project, ops) {
  const ownershipByName = new Map(ctx.inventory.map((i) => [i.name, i.ownership]));
  const dist = ctx.distributions.filter((d) => d.project === project);
  const assigned = new Set();
  return ops.map((o) => {
    const ownership = ownershipByName.get(o.equipment) || 'Company';
    const rate = ctx.projectRateAsOf(project, o.operationType, o.date).rate || 0;
    const revenue = o.operationType === 'Trekking' ? 0 : (o.quantity || 0) * rate;
    const dozer = dozerCostFor(o, ownership, ctx.hourlyRateAsOf(o.equipment, o.date));
    const diesel = (o.fuelUsed || 0) * ctx.dieselRateAsOf(o.date);
    let logistics = 0;
    const key = `${o.date}|${o.equipment}`;
    if (onDashboardBasis(o.date) && ownership !== 'Partnership' && !assigned.has(key)) {
      const litres = dist.filter((d) => d.date === o.date && d.equipment === o.equipment).reduce((s, d) => s + (d.litres || 0), 0);
      logistics = litres * DIESEL_LOGISTICS_PER_LITRE;
      assigned.add(key);
    }
    const allowance = ctx.operatorAllowanceForRows([o]);
    const cost = dozer + diesel + logistics + allowance;
    const exp = expectedHa(o.hoursWorked || 0);
    return {
      op: o, ownership, revenue, dozer, diesel, logistics, allowance, cost, net: revenue - cost,
      expected: exp,
      outputPct: exp > 0 ? ((o.quantity || 0) / exp) * 100 : null,
      breakEvenPct: exp * rate > 0 ? (cost / (exp * rate)) * 100 : null,
    };
  });
}
