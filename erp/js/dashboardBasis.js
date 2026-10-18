// "Daily Dashboard basis" — the cost rules behind the Daily Operations
// Dashboards, applied to every operation dated on/after DASHBOARD_BASIS_FROM.
// Earlier dates keep the legacy Profitability rules, so history entered
// before the dashboards existed doesn't move.
//
// Kept free of store/Supabase imports (everything is passed in) so the
// figures can be unit-tested and reconciled against the dashboards.
import { isSunday, addDays } from './dateUtils.js';

export const DASHBOARD_BASIS_FROM = '2026-10-10';
export const onDashboardBasis = (date) => !!date && date >= DASHBOARD_BASIS_FROM;

// Operator allowance is unchanged (ownedOperatorAllowance.js): the shared rule
// already prorates ₦50,000/8 hrs on Sundays and uses each operator's own Day
// Rate otherwise.
// Diesel logistics: ₦50 per litre supplied to Company-owned and Rented
// dozers (Partnership/Chizon dozers are excluded).
export const DIESEL_LOGISTICS_PER_LITRE = 50;

// Sum of ₦50/L over the diesel distributed to non-Partnership dozers.
export function dieselLogisticsBasis(distributions, ownershipByName) {
  return distributions
    .filter((d) => onDashboardBasis(d.date) && ownershipByName.get(d.equipment) !== 'Partnership')
    .reduce((sum, d) => sum + (d.litres || 0) * DIESEL_LOGISTICS_PER_LITRE, 0);
}

// Sunday bonus policy for supervisors, on the dashboard basis. Per supervisor
// per Sunday: 3 or more dozers worked at least 6 hrs = ₦20,000, 2 = ₦10,000,
// 1 = ₦5,000; then by the days that supervisor worked Monday to Saturday of
// that week: 5 or more = full, 3 to 4 = 50%, 2 or fewer = nothing.
// `rows` are the operations being costed; `weekRows` (default: the same rows)
// must hold the operations of the preceding six days for the weekly rule.
export const SUNDAY_BONUS_BASIS_TEXT = 'Sunday bonus policy: ₦20,000 / ₦10,000 / ₦5,000 for 3 / 2 / 1 dozers at 6 hrs or more; halved for 3 to 4 days worked that week';
const SUNDAY_BONUS_MIN_HOURS = 6;

export function sundayBonusFor(dozersAtMinHours, daysWorkedInWeek) {
  const tier = dozersAtMinHours >= 3 ? 20000 : dozersAtMinHours === 2 ? 10000 : dozersAtMinHours === 1 ? 5000 : 0;
  const factor = daysWorkedInWeek >= 5 ? 1 : daysWorkedInWeek >= 3 ? 0.5 : 0;
  return tier * factor;
}

export function supervisorSundayAllowanceBasis(rows, weekRows = rows) {
  const hoursBySupervisorDateDozer = {};
  rows.forEach((o) => {
    if (!onDashboardBasis(o.date) || !isSunday(o.date) || !o.supervisorId || !(o.hoursWorked > 0)) return;
    const key = `${o.date}|${o.supervisorId}`;
    if (!hoursBySupervisorDateDozer[key]) hoursBySupervisorDateDozer[key] = {};
    hoursBySupervisorDateDozer[key][o.equipment] = (hoursBySupervisorDateDozer[key][o.equipment] || 0) + o.hoursWorked;
  });
  return Object.entries(hoursBySupervisorDateDozer).reduce((sum, [key, byDozer]) => {
    const [date, supervisorId] = key.split('|');
    const qualifying = Object.values(byDozer).filter((h) => h >= SUNDAY_BONUS_MIN_HOURS).length;
    const days = new Set(weekRows.filter((o) => o.supervisorId === supervisorId && o.hoursWorked > 0 && o.date >= addDays(date, -6) && o.date < date).map((o) => o.date)).size;
    return sum + sundayBonusFor(qualifying, days);
  }, 0);
}

// PMS collected at the station, priced as recorded. A collection whose notes
// mention "wash" or "maintenance" is a Maintenance cost (e.g. engine
// washing); one whose notes say "unexplained" is a flagged operations cost
// that has no explanation yet; everything else is the Tacoma vehicle.
export function pmsKind(collection) {
  const notes = collection.notes || '';
  if (/wash|maintenance/i.test(notes)) return 'maintenance';
  if (/unexplained/i.test(notes)) return 'unexplained';
  return 'tacoma';
}

export function pmsBasis(collections) {
  const out = { tacoma: 0, unexplained: 0, maintenance: 0, tacomaLitres: 0, unexplainedLitres: 0, maintenanceLitres: 0 };
  collections.forEach((c) => {
    if (c.fuelType !== 'PMS' || !onDashboardBasis(c.date)) return;
    const kind = pmsKind(c);
    out[kind] += (c.litres || 0) * (c.unitPrice || 0);
    out[`${kind}Litres`] += c.litres || 0;
  });
  return out;
}

// Maintenance Incurred: Approved/Paid Maintenance fund requests, logged
// Maintenance expenses and PMS used for maintenance — the money spent on
// repairing the fleet, shown under Machine Recovery rather than inside
// Operations Profit.
export function maintenanceBasis({ fundRequests, expenses, fundRequestTotal, pms }) {
  const fromRequests = fundRequests
    .filter((r) => onDashboardBasis(r.date) && (r.status === 'Approved' || r.status === 'Paid') && r.costHead === 'Maintenance')
    .reduce((sum, r) => sum + fundRequestTotal(r), 0);
  const fromExpenses = expenses
    .filter((e) => onDashboardBasis(e.date) && e.category === 'Maintenance')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  return fromRequests + fromExpenses + pms.maintenance;
}

// Rental / dozer cost of one operation. Trekking is free for Company and
// Partnership dozers. A deal ("Business") day on a hired dozer costs what was
// actually paid for the deal, not hours x hourly rate.
export function dozerCostFor(o, ownership, hourlyRate) {
  if (o.operationType === 'Trekking' && ownership !== 'Rented') return 0;
  if (o.workType === 'Business' && o.businessAmount && ownership && ownership !== 'Company') return o.businessAmount;
  return (o.hoursWorked || 0) * hourlyRate;
}

// Machine Recovery: hours worked by Company-owned dozers × their hourly rate
// (cost avoided by not renting). Deal ("Business") days are excluded.
export function machineRecoveredBasis(rows, ownershipByName, hourlyRateAsOf) {
  return rows
    .filter((o) => onDashboardBasis(o.date) && o.workType !== 'Business' && (ownershipByName.get(o.equipment) || 'Company') === 'Company')
    .reduce((sum, o) => sum + (o.hoursWorked || 0) * hourlyRateAsOf(o.equipment, o.date), 0);
}
