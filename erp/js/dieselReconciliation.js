import { siteFuelIssues } from './fuelLedger.js';
import { dieselUsedFor } from './constants.js';

const litres = (value) => Number(value) || 0;
const sum = (rows, key) => rows.reduce((total, row) => total + litres(row[key]), 0);

// Counts are end-of-day physical readings of the site's storage tank. An
// uncounted running balance is an estimate, never evidence of missing fuel.
export function reconcileSiteDay({ project, date, receipts, distributions, operations, counts }) {
  const siteReceipts = receipts.filter((row) => row.project === project && row.date <= date);
  const issues = siteFuelIssues(distributions, operations).filter((row) => row.project === project && row.date <= date);
  const prior = counts.filter((row) => row.project === project && row.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const count = counts.filter((row) => row.project === project && row.date === date)
    .sort((a, b) => String(b.updatedAt || b.id).localeCompare(String(a.updatedAt || a.id)))[0];
  const sincePrior = (row) => !prior || row.date > prior.date;
  const opening = (prior ? litres(prior.countedLitres) : 0)
    + sum(siteReceipts.filter((row) => row.date < date && sincePrior(row)), 'litres')
    - sum(issues.filter((row) => row.date < date && sincePrior(row)), 'litres');
  const supplied = sum(siteReceipts.filter((row) => row.date === date), 'litres');
  const distributed = sum(issues.filter((row) => row.date === date), 'litres');
  const expected = opening + supplied - distributed;
  const measured = count ? litres(count.countedLitres) : null;
  const variance = measured === null ? null : measured - expected;
  const tolerance = Math.max(5, Math.abs(expected) * 0.02);
  return {
    project, date, opening, supplied, distributed, expected, measured, variance,
    verified: !!prior, lastCountDate: prior?.date || null,
    status: expected < -tolerance ? 'Over-allocated — review records'
      : !prior && variance !== null && Math.abs(variance) > tolerance ? 'Provisional variance — verify opening'
      : variance !== null && variance < -tolerance ? 'Shortage — investigate'
        : variance !== null && variance > tolerance ? 'Surplus — investigate'
          : variance !== null ? 'Reconciled'
            : 'Physical count needed',
  };
}

export function reconcileDozerDay({ project, date, distributions, operations, fleet = [] }) {
  const issues = siteFuelIssues(distributions, operations).filter((row) => row.project === project && row.date === date);
  const reports = operations.filter((row) => row.siteName === project && row.date === date);
  const machines = [...new Set([...issues.map((row) => row.equipment), ...reports.map((row) => row.equipment)])].filter(Boolean);
  return machines.map((equipment) => {
    const issued = sum(issues.filter((row) => row.equipment === equipment), 'litres');
    const rows = reports.filter((row) => row.equipment === equipment);
    const reportIssued = sum(rows, 'dieselSupplied');
    const hasExplicitIssue = distributions.some((row) => row.project === project && row.date === date && row.equipment === equipment);
    const used = sum(rows, 'fuelUsed');
    const asset = fleet.find((row) => row.name === equipment);
    const normative = rows.reduce((total, row) => total + dieselUsedFor(asset, row.operationType, litres(row.hoursWorked)), 0);
    const overConsumption = normative > 0 && used > Math.max(normative * 1.25, normative + 20);
    const last = rows[rows.length - 1];
    const opening = last ? litres(last.openingDiesel) - litres(last.dieselSupplied) : null;
    const expected = opening === null ? null : opening + issued - used;
    const reported = last?.closingDiesel == null ? null : litres(last.closingDiesel);
    const variance = reported === null || expected === null ? null : reported - expected;
    const tolerance = Math.max(5, Math.abs(expected || 0) * 0.02);
    return {
      equipment, issued, reportIssued, used, opening, expected, reported, variance, normative,
      status: !last ? 'Daily report needed'
        : hasExplicitIssue && Math.abs(issued - reportIssued) > 1 ? 'Distribution/report mismatch'
        : expected < -tolerance ? 'Consumption exceeds available fuel'
          : Math.abs(variance || 0) > tolerance ? 'Closing variance — investigate'
            : overConsumption ? 'High reported use — review hours/rate'
            : 'Reported balance agrees',
    };
  });
}

