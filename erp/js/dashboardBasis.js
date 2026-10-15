// "Daily Dashboard basis" — the cost rules behind the Daily Operations
// Dashboards, applied to every operation dated on/after DASHBOARD_BASIS_FROM.
// Earlier dates keep the legacy Profitability rules, so history entered
// before the dashboards existed doesn't move.
//
// Kept free of store/Supabase imports (everything is passed in) so the
// figures can be unit-tested and reconciled against the dashboards.
import { isSunday } from './dateUtils.js';

export const DASHBOARD_BASIS_FROM = '2026-10-10';
export const onDashboardBasis = (date) => !!date && date >= DASHBOARD_BASIS_FROM;

// Operator allowance is unchanged (ownedOperatorAllowance.js): the shared rule
// already prorates ₦50,000/8 hrs on Sundays and uses each operator's own Day
// Rate otherwise.
// Diesel logistics: ₦50 per litre supplied to Company-owned and Rented
// dozers (Partnership/Chizon dozers are excluded).
export const DIESEL_LOGISTICS_PER_LITRE = 50;
// Supervisor Sunday allowance: ₦20,000 per supervisor on duty that Sunday.
export const SUPERVISOR_SUNDAY_ALLOWANCE = 20000;

// Sum of ₦50/L over the diesel distributed to non-Partnership dozers.
export function dieselLogisticsBasis(distributions, ownershipByName) {
  return distributions
    .filter((d) => onDashboardBasis(d.date) && ownershipByName.get(d.equipment) !== 'Partnership')
    .reduce((sum, d) => sum + (d.litres || 0) * DIESEL_LOGISTICS_PER_LITRE, 0);
}

export function supervisorSundayAllowanceBasis(rows) {
  const supervisorsByDate = {};
  rows.forEach((o) => {
    if (!isSunday(o.date) || !o.supervisorId || !(o.hoursWorked > 0)) return;
    if (!supervisorsByDate[o.date]) supervisorsByDate[o.date] = new Set();
    supervisorsByDate[o.date].add(o.supervisorId);
  });
  return Object.values(supervisorsByDate).reduce((sum, s) => sum + s.size * SUPERVISOR_SUNDAY_ALLOWANCE, 0);
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

// Machine Recovery: hours worked by Company-owned dozers × their hourly rate
// (cost avoided by not renting). Deal ("Business") days are excluded.
export function machineRecoveredBasis(rows, ownershipByName, hourlyRateAsOf) {
  return rows
    .filter((o) => onDashboardBasis(o.date) && o.workType !== 'Business' && (ownershipByName.get(o.equipment) || 'Company') === 'Company')
    .reduce((sum, o) => sum + (o.hoursWorked || 0) * hourlyRateAsOf(o.equipment, o.date), 0);
}
