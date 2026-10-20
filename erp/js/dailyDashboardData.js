// Data behind the Daily Operations Dashboard view (views/dailyDashboard.js):
// the same six sections as the HTML Daily Operations Dashboards — Operations,
// Diesel, Fleet, Requests & Expenses, Profitability, Staff Performance — plus
// the Actions/Flags list, all derived live from ERP records.
//
// Pure (no store / DOM imports): everything is passed in through `ctx`, so the
// figures can be unit-tested and reconciled against the published dashboards.
import { onDashboardBasis, dozerCostFor, DIESEL_LOGISTICS_PER_LITRE } from './dashboardBasis.js';
import { isSunday, addDays } from './dateUtils.js';
import { buildAttention } from './attention.js';
import { fuelEfficiency, NORM_LITRES_PER_HA } from './fuelEfficiency.js';

import { EXPECTED_HA_PER_8HRS, IDEAL_START, DIESEL_FILL_LITRES, LATE_FLAG_MINUTES } from './rules.js';

export { EXPECTED_HA_PER_8HRS, IDEAL_START, DIESEL_FILL_LITRES, LATE_FLAG_MINUTES };

const toMinutes = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const minutesToClock = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const lateLabel = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const late = mins - toMinutes(IDEAL_START);
  if (late <= 0) return 'On time';
  return `${Math.floor(late / 60)}h ${String(late % 60).padStart(2, '0')}m`;
};
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const expectedHa = (hours) => (hours / 8) * EXPECTED_HA_PER_8HRS;
const pct = (actual, expected) => (expected > 0 ? (actual / expected) * 100 : null);

function datesBetween(ops) {
  return [...new Set(ops.map((o) => o.date))].sort();
}

export function buildDailyDashboard(ctx) {
  const { project, date, since } = ctx;
  const inv = ctx.inventory.filter((i) => i.category === 'Heavy Equipment');
  const invByName = new Map(ctx.inventory.map((i) => [i.name, i]));
  const empName = (id) => ctx.employees.find((e) => e.id === id)?.name || null;

  const allOps = ctx.operations.filter((o) => o.siteName === project);
  const dayOps = allOps.filter((o) => o.date === date);
  const rangeOps = allOps.filter((o) => o.date >= since && o.date <= date);
  const workingDozers = [...new Set(dayOps.map((o) => o.equipment))];
  const rev = (o) => (o.operationType === 'Trekking' ? 0 : (o.quantity || 0) * (ctx.projectRateAsOf(project, o.operationType, o.date).rate || 0));

  // ---------------------------------------------------------------- operations
  const fleetNames = [...new Set([
    ...inv.filter((i) => i.currentProject === project).map((i) => i.name),
    ...rangeOps.map((o) => o.equipment),
  ])];
  const operations = fleetNames.map((name) => {
    const rows = dayOps.filter((o) => o.equipment === name);
    const hours = sum(rows, (o) => o.hoursWorked);
    const ha = sum(rows, (o) => o.quantity);
    const cumHa = sum(rangeOps.filter((o) => o.equipment === name), (o) => o.quantity);
    const lastOp = rows[0] || [...rangeOps].reverse().find((o) => o.equipment === name);
    const op = empName(lastOp?.operatorId);
    return {
      equipment: name,
      operator: op,
      reported: rows.length > 0,
      supervisor: empName(rows[0]?.supervisorId),
      block: rows.length ? [...new Set(rows.map((o) => o.blockNumber).filter(Boolean))].join(', ') || '—' : null,
      hours, ha,
      expected: expectedHa(hours),
      pctExpected: pct(ha, expectedHa(hours)),
      cumulativeHa: cumHa,
    };
  }).sort((a, b) => (b.reported - a.reported) || a.equipment.localeCompare(b.equipment));
  const todayHa = sum(dayOps, (o) => o.quantity);
  const todayHours = sum(dayOps, (o) => o.hoursWorked);

  // -------------------------------------------------------------------- diesel
  const dist = ctx.distributions.filter((d) => d.project === project);
  const aldDay = (d) => d.date === date;
  const ago = (c) => c.fuelType === 'Diesel';
  // Diesel collected at the station and then sold on (e.g. to the CEO) is
  // recorded as its own collection row whose notes say "sold to"; it is not
  // site diesel, so it is shown separately and left out of the site figures.
  const soldNote = (c) => /sold to/i.test(c.notes || '');
  const dayAgo = ctx.fuelCreditCollections.filter((c) => c.date === date && ago(c));
  const collectedAgo = sum(dayAgo.filter((c) => !soldNote(c)), (c) => c.litres);
  const soldAgo = sum(dayAgo.filter(soldNote), (c) => c.litres);
  const collectedPms = sum(ctx.fuelCreditCollections.filter((c) => c.date === date && c.fuelType === 'PMS'), (c) => c.litres);
  const distributedToday = sum(dist.filter(aldDay), (d) => d.litres);
  const usedToday = sum(dayOps, (o) => o.fuelUsed);
  const dieselRate = ctx.dieselRateAsOf(date);
  const counts = ctx.dieselStockCounts.filter((c) => c.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const latestCount = counts[0] || null;
  // The last stock count rolled forward to the viewed day: plus site diesel
  // collected since, minus diesel distributed to dozers since. (A count made on
  // the viewed day itself is used as it is.)
  const afterCount = (x) => !!latestCount && x.date > latestCount.date && x.date <= date;
  const rolledIn = latestCount ? sum(ctx.fuelCreditCollections.filter((c) => afterCount(c) && ago(c) && !soldNote(c)), (c) => c.litres) : 0;
  const rolledOut = latestCount ? sum(dist.filter(afterCount), (d) => d.litres) : 0;
  const onGround = latestCount ? Math.max(0, latestCount.countedLitres + rolledIn - rolledOut) : null;
  // The diesel chain starts on the "since" date with each dozer at zero, the
  // way the dashboards track it (opening = previous closing + diesel
  // distributed, used = standard litres, closing = opening − used). Diesel
  // issued for a repair rather than for the tank ("not tank fuel" /
  // "maintenance diesel" in the distribution notes) is left out of the chain.
  const tankDist = dist.filter((d) => d.date >= since && !/not tank fuel|maintenance diesel/i.test(d.notes || ''));
  const chainOps = allOps.filter((o) => o.date >= since);
  const chainNames = [...new Set([...tankDist.map((d) => d.equipment), ...chainOps.map((o) => o.equipment)])];
  const diesel = chainNames.map((name) => {
    const closingBefore = sum(tankDist.filter((d) => d.equipment === name && d.date < date), (d) => d.litres)
      - sum(chainOps.filter((o) => o.equipment === name && o.date < date), (o) => o.fuelUsed);
    const distributed = sum(tankDist.filter((d) => d.equipment === name && d.date === date), (d) => d.litres);
    const rows = dayOps.filter((o) => o.equipment === name);
    const used = sum(rows, (o) => o.fuelUsed);
    const ha = sum(rows, (o) => o.quantity);
    const opening = closingBefore + distributed;
    const closing = opening - used;
    const reportedClosing = rows.find((o) => o.closingDiesel !== null && o.closingDiesel !== undefined)?.closingDiesel;
    let status = 'Idle';
    if (rows.length) status = reportedClosing !== undefined && Math.abs(reportedClosing - closing) > 0.5 ? 'Closing restated' : 'Reconciled';
    else if (!opening && !closing) status = 'No balance';
    return { equipment: name, opening, distributed, used, closing, efficiency: ha > 0 ? used / ha : null, status, reportedClosing, worked: rows.length > 0 };
  }).filter((r) => r.opening || r.distributed || r.used || r.closing || r.worked)
    .sort((a, b) => (b.worked - a.worked) || a.equipment.localeCompare(b.equipment));

  // Fueling request for tomorrow: top each dozer up to DIESEL_FILL_LITRES.
  // Default list = dozers that worked today plus dozers listed Active that
  // have worked on this site since the cumulative start date, plus any dozer
  // that was given tank diesel today (it is going back to work).
  const defaultRequestDozers = new Set([
    ...workingDozers,
    ...dist.filter((d) => aldDay(d) && !/not tank fuel|maintenance diesel/i.test(d.notes || '')).map((d) => d.equipment),
    ...inv.filter((i) => i.fleetStatus === 'Active' && rangeOps.some((o) => o.equipment === i.name)).map((i) => i.name),
  ]);
  const fuelingRequest = [...defaultRequestDozers].sort().map((name) => {
    const row = diesel.find((d) => d.equipment === name);
    // A closing reported by the site is the physical tank level, so it wins over the calculated one.
    const closing = Math.max(0, row?.reportedClosing ?? row?.closing ?? 0);
    return { equipment: name, closing, need: Math.max(0, DIESEL_FILL_LITRES - closing) };
  });
  const stationBalance = ctx.stationBalance;

  // --------------------------------------------------------------------- fleet
  const fleet = inv.filter((i) => i.currentProject === project || workingDozers.includes(i.name) || rangeOps.some((o) => o.equipment === i.name)).map((i) => {
    const o = operations.find((x) => x.equipment === i.name);
    const openLog = ctx.maintenanceLogs.filter((m) => m.equipment === i.name && m.status !== 'Completed' && m.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const lastLog = ctx.maintenanceLogs.filter((m) => m.equipment === i.name && m.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const rows = dayOps.filter((r) => r.equipment === i.name);
    const start = rows.map((r) => toMinutes(r.timeResumed)).filter((v) => v !== null).sort((a, b) => a - b)[0];
    const stop = rows.map((r) => toMinutes(r.timeClosed)).filter((v) => v !== null).sort((a, b) => b - a)[0];
    let status = i.fleetStatus || 'Active';
    if (o?.reported) status = 'Working';
    else if (status === 'Active') status = 'Not reporting';
    const recent = lastLog && (new Date(date) - new Date(lastLog.date)) / 86400000 <= 14 ? lastLog : null;
    const logNote = openLog || recent;
    const clip = (t) => (t.length > 150 ? `${t.slice(0, 147)}…` : t);
    const remarks = [
      o?.reported ? `${minutesToClock(start)}–${minutesToClock(stop)}, ${o.ha.toFixed(1)} ha.` : null,
      logNote ? clip(`${logNote.status === 'Completed' ? 'Last repair' : logNote.type}: ${logNote.description}`) : null,
    ].filter(Boolean).join(' ');
    return {
      equipment: i.name, ownership: i.ownership || 'Company', ownerName: i.ownerName || null, hourlyRate: ctx.hourlyRateAsOf(i.name, date),
      status, fleetStatus: i.fleetStatus || 'Active', hours: o?.hours || 0, optimization: o?.reported ? o.pctExpected : null, remarks: remarks || '—',
    };
  }).sort((a, b) => a.equipment.localeCompare(b.equipment));

  const vendors = {};
  rangeOps.forEach((o) => {
    const i = invByName.get(o.equipment);
    if (!i || (i.ownership !== 'Partnership' && i.ownership !== 'Rented')) return;
    const key = i.ownerName || i.ownership;
    if (!vendors[key]) vendors[key] = { vendor: key, dozers: new Set(), accrued: 0 };
    vendors[key].dozers.add(o.equipment);
    // Deal ("Business") days are paid to the operator directly, not accrued to the owner.
    if (o.workType !== 'Business') vendors[key].accrued += dozerCostFor(o, i.ownership, ctx.hourlyRateAsOf(o.equipment, o.date));
  });
  const vendorAccrual = Object.values(vendors).map((v) => ({ ...v, dozers: [...v.dozers].sort() }));

  // ------------------------------------------------------------------ requests
  const reqs = ctx.fundRequests.filter((r) => r.project === project && r.date <= date);
  const total = (r) => sum(r.items || [], (it) => it.amount);
  const inRange = reqs.filter((r) => r.date >= since);
  const requestsToday = reqs.filter((r) => r.date === date);
  const paidToday = requestsToday.filter((r) => r.status === 'Paid');
  const byCategory = {};
  paidToday.forEach((r) => { byCategory[r.costHead || 'Other'] = (byCategory[r.costHead || 'Other'] || 0) + total(r); });
  const requests = {
    requestedToday: sum(requestsToday, total),
    requestedCumulative: sum(inRange, total),
    paidToday: sum(paidToday, total),
    paidCumulative: sum(inRange.filter((r) => r.status === 'Paid'), total),
    pending: sum(inRange.filter((r) => r.status === 'Pending'), total),
    approved: sum(inRange.filter((r) => r.status === 'Approved'), total),
    paidByCategory: Object.entries(byCategory).map(([label, value]) => ({ label, value })),
    rows: reqs.filter((r) => (r.date >= since && (r.status === 'Pending' || r.status === 'Approved')) || r.date === date)
      .map((r) => ({ id: r.id, date: r.date, description: r.description, category: r.costHead || '—', amount: total(r), status: r.status, isNew: r.date === date }))
      .sort((a, b) => (a.isNew === b.isNew ? (a.date < b.date ? 1 : -1) : a.isNew ? -1 : 1)),
  };

  // ------------------------------------------------------------- profitability
  const todayStats = ctx.statsFor(date, date);
  const cumStats = ctx.statsFor(since > date ? date : since, date);
  const ownedNames = (name) => (invByName.get(name)?.ownership || 'Company');
  const logisticsAssigned = new Set();
  let logisticsAttributed = 0;
  const contribution = dayOps.map((o) => {
    const ownership = ownedNames(o.equipment);
    const revenue = rev(o);
    const dozer = dozerCostFor(o, ownership, ctx.hourlyRateAsOf(o.equipment, o.date));
    const dsl = (o.fuelUsed || 0) * ctx.dieselRateAsOf(o.date);
    const litres = sum(dist.filter((d) => d.date === date && d.equipment === o.equipment), (d) => d.litres);
    // Diesel logistics is charged on the diesel distributed to the dozer, once per dozer per day.
    let logistics = 0;
    if (onDashboardBasis(o.date) && ownership !== 'Partnership' && !logisticsAssigned.has(o.equipment)) {
      logistics = litres * DIESEL_LOGISTICS_PER_LITRE;
      logisticsAssigned.add(o.equipment);
      logisticsAttributed += logistics;
    }
    const allowance = ctx.operatorAllowanceForRows([o]);
    const cost = dozer + dsl + logistics + allowance;
    const exp = expectedHa(o.hoursWorked || 0);
    const rate = ctx.projectRateAsOf(project, o.operationType, o.date).rate || 0;
    return {
      equipment: o.equipment, operator: empName(o.operatorId), hours: o.hoursWorked || 0, ha: o.quantity || 0,
      outputPct: pct(o.quantity || 0, exp), breakEvenPct: exp * rate > 0 ? (cost / (exp * rate)) * 100 : null,
      revenue, cost, net: revenue - cost,
    };
  }).sort((a, b) => a.net - b.net);
  const extraRows = [];
  if (todayStats.pmsCost) extraRows.push({ label: 'PMS (Tacoma + unexplained)', cost: todayStats.pmsCost });
  if (todayStats.supervisorSundayAllowance) extraRows.push({ label: 'Supervisor Sunday allowance', cost: todayStats.supervisorSundayAllowance });
  const unattributedLogistics = todayStats.dieselLogistics - logisticsAttributed;
  if (unattributedLogistics > 0.5) extraRows.push({ label: 'Diesel logistics for non-working dozers', cost: unattributedLogistics });

  // ----------------------------------------------------------------- staff
  const siteDays = datesBetween(rangeOps);
  const peopleRows = {};
  const addPerson = (id, role, rows, day) => {
    if (!id) return;
    const p = peopleRows[id] || (peopleRows[id] = { id, name: empName(id) || id, role, days: {} });
    const starts = rows.map((r) => toMinutes(r.timeResumed)).filter((v) => v !== null);
    const hours = sum(rows, (r) => r.hoursWorked);
    p.days[day] = {
      start: starts.length ? Math.min(...starts) : null,
      stop: rows.map((r) => toMinutes(r.timeClosed)).filter((v) => v !== null).reduce((m, v) => Math.max(m, v), -1),
      hours, ha: sum(rows, (r) => r.quantity), expected: expectedHa(hours),
    };
  };
  siteDays.forEach((day) => {
    const rows = rangeOps.filter((o) => o.date === day);
    const byOperator = {};
    rows.forEach((o) => { if (o.operatorId) (byOperator[o.operatorId] = byOperator[o.operatorId] || []).push(o); });
    Object.entries(byOperator).forEach(([id, r]) => addPerson(id, `Operator — ${[...new Set(r.map((x) => x.equipment))].join(', ')}`, r, day));
    const bySup = {};
    rows.forEach((o) => { if (o.supervisorId) (bySup[o.supervisorId] = bySup[o.supervisorId] || []).push(o); });
    Object.entries(bySup).forEach(([id, r]) => addPerson(id, 'Supervisor', r, day));
  });
  // Resumption and productivity trends cover a rolling window: the viewed day
  // and the two days before it (never earlier than the "since" date). The
  // ranking figure (Cumulative) still runs over the whole period.
  const trendDays = [addDays(date, -2), addDays(date, -1), date].filter((day) => day >= since);
  const staff = Object.values(peopleRows).map((p) => {
    const ds = trendDays.map((day) => p.days[day] || null);
    const all = siteDays.map((day) => p.days[day]).filter(Boolean);
    const totalHa = sum(all, (d) => d.ha);
    const totalExp = sum(all, (d) => d.expected);
    const today = p.days[date] || null;
    const stopT = today && today.stop >= 0 ? today.stop : null;
    return {
      id: p.id, name: p.name, role: p.role,
      resumption: ds.map((d) => (d && d.start !== null ? minutesToClock(d.start).replace(/ AM$/, '') : '—')),
      productivity: ds.map((d) => (d && d.expected > 0 ? pct(d.ha, d.expected) : null)),
      days: trendDays,
      lateToday: today ? lateLabel(today.start) : '—',
      lateMinutesToday: today && today.start !== null ? today.start - toMinutes(IDEAL_START) : null,
      hoursToday: today ? (p.role === 'Supervisor' && today.start !== null && stopT !== null ? (stopT - today.start) / 60 : today.hours) : 0,
      cumulative: pct(totalHa, totalExp),
    };
  }).sort((a, b) => (b.cumulative ?? -1) - (a.cumulative ?? -1));

  // ------------------------------------------------------------------- flags
  const flags = [];
  const fmt = (n) => `${n < 0 ? '−' : ''}₦${Math.round(Math.abs(n)).toLocaleString()}`;
  if (dayOps.length && todayStats.opsProfit < 0) {
    const below = contribution.filter((c) => c.outputPct !== null && c.breakEvenPct !== null && c.outputPct < c.breakEvenPct);
    flags.push({ tone: 'critical', text: `Operations Profit today is ${fmt(todayStats.opsProfit)}. ${below.length} of ${contribution.length} working dozer(s) produced below break-even${below.length ? ` (${below.map((c) => `${c.equipment} ${c.outputPct.toFixed(1)}%`).join(', ')})` : ''}.` });
  }
  const late = staff.filter((s) => s.role !== 'Supervisor' && s.lateMinutesToday !== null && s.lateMinutesToday >= LATE_FLAG_MINUTES);
  if (late.length) flags.push({ tone: 'warning', text: `Late starts (ideal ${IDEAL_START} AM): ${late.map((s) => `${s.name} ${s.lateToday} late`).join(', ')}.` });
  const silent = inv.filter((i) => i.fleetStatus === 'Active' && i.currentProject === project && !workingDozers.includes(i.name) && (i.ownership || 'Company') === 'Company');
  if (dayOps.length && silent.length) flags.push({ tone: 'warning', text: `${silent.map((i) => i.name).join(', ')} listed active but no report today.`, action: 'Send the end-of-day report, or confirm the machine did not work.' });
  const corrections = dayOps.filter((o) => (o.hoursWorked || 0) > 0 && !(o.quantity > 0));
  if (corrections.length) flags.push({ tone: 'warning', text: `Zero output despite hours worked (correction day): ${corrections.map((o) => `${o.equipment} ${o.hoursWorked} hrs`).join(', ')}.` });
  const restated = diesel.filter((r) => r.status === 'Closing restated');
  if (restated.length) flags.push({ tone: 'warning', text: `Closing diesel differs from the reported closing: ${restated.map((r) => `${r.equipment} reported ${r.reportedClosing} L vs calculated ${Math.round(r.closing * 10) / 10} L (${r.reportedClosing - r.closing > 0 ? '+' : '−'}${Math.round(Math.abs(r.reportedClosing - r.closing) * 10) / 10} L)`).join(', ')}.`, action: 'Confirm the physical tank levels; the fueling request uses the reported closing.' });
  // Diesel against work over the whole period (not just today). Shown as a table with the high burners highlighted; no flag is raised for diesel (see the test).
  const efficiency = fuelEfficiency(rangeOps);
  const down = fleet.filter((f) => f.fleetStatus === 'Down' || f.fleetStatus === 'Under Maintenance');
  if (down.length) flags.push({ tone: 'warning', text: `Not available: ${down.map((f) => `${f.equipment} (${f.fleetStatus})`).join(', ')}.` });
  if (todayStats.pmsUnexplained) flags.push({ tone: 'warning', text: `${fmt(todayStats.pmsUnexplained)} of PMS is unexplained.`, action: 'Explain it or reclassify it.' });
  // Requests waiting too long, duplicates, vouchers, old stock count, missing reports, backup: same list the main Dashboard uses.
  flags.push(...buildAttention(ctx, { date })); // no backup flag here: that lives in the browser, and a downloaded dashboard has none

  return {
    project, date, since,
    operations: { rows: operations, reporting: operations.filter((o) => o.reported).length, fleetCount: operations.length, todayHa, todayHours, cumulativeHa: cumStats.areaCleared },
    diesel: { efficiency, normLitresPerHa: NORM_LITRES_PER_HA, collectedAgo, soldAgo, collectedPms, distributedToday, usedToday, usedCost: usedToday * dieselRate, dieselRate, onGround, onGroundDate: latestCount?.date || null, onGroundBase: latestCount ? latestCount.countedLitres : null, onGroundIn: rolledIn, onGroundOut: rolledOut, rows: diesel, fuelingRequest, stationBalance, distributionChart: dist.filter(aldDay).map((d) => ({ label: d.equipment, value: d.litres })) },
    fleet, vendorAccrual, requests,
    profit: { today: todayStats, cumulative: cumStats, contribution, extraRows },
    staff, flags,
  };
}
