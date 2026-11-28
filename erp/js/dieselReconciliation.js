import { siteFuelIssues, siteFuelRecoveries, isTankLoss, maintenanceFuelDetails } from './fuelLedger.js';
import { dieselUsedFor } from './constants.js';
import { compareDieselReports, lastDieselReading, transferAfterDieselReading } from './dieselReportChain.js';

const litres = (value) => Number(value) || 0;
const sum = (rows, key) => rows.reduce((total, row) => total + litres(row[key]), 0);

// Blue Sky's 100 L count on 14 November was taken before Midejab delivered
// 1,500 L later that day (confirmed by Admin on 15 November). The records
// contain dates but no time-of-day, so retain this narrowly identified
// pre-delivery count rather than treating it as the day's closing stock.
const isPostCountReceipt = (count, row) => !!count
  && count.project === 'Blue Sky Project - Ajue-Ore'
  && count.date === '2026-11-14'
  && litres(count.countedLitres) === 100
  && row.project === count.project
  && row.date === count.date
  && litres(row.litres) === 1500
  && /midejab/i.test(row.station || row.supplier || '');

// Counts are end-of-day physical readings of the site's storage tank. An
// uncounted running balance is an estimate, never evidence of missing fuel.
export function isClosingDieselStockCount(row) {
  return !/^NON_CLOSING_COUNT:/i.test(String(row?.notes || '').trim());
}

export function latestDieselStockCount(rows) {
  return [...rows].filter(isClosingDieselStockCount).sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    || String(b.id || '').localeCompare(String(a.id || ''))
  )[0] || null;
}

// End-of-day site stock: the latest physical count is authoritative; later
// receipts and issues roll forward from it. Without a count, the balance is
// provisional from recorded movements.
export function siteOnGroundAsOf({ project, date, receipts, distributions, operations, counts }) {
  const inProject = (row) => row.project === project && row.date <= date;
  const count = latestDieselStockCount(counts.filter(inProject));
  const siteReceipts = [...receipts, ...siteFuelRecoveries(distributions)];
  const receivedSince = sum(siteReceipts.filter((row) => inProject(row) && (!count || row.date > count.date || isPostCountReceipt(count, row))), 'litres');
  const issuedSince = sum(siteFuelIssues(distributions, operations).filter((row) => inProject(row) && (!count || row.date > count.date)), 'litres');
  const countBase = count ? litres(count.countedLitres) : 0;
  return { onGround: countBase + receivedSince - issuedSince,
    countDate: count?.date || null, countBase, receivedSince, issuedSince };
}

export function reconcileSiteDay({ project, date, receipts, distributions, operations, counts }) {
  const siteReceipts = [...receipts, ...siteFuelRecoveries(distributions)].filter((row) => row.project === project && row.date <= date);
  const issues = siteFuelIssues(distributions, operations).filter((row) => row.project === project && row.date <= date);
  const prior = latestDieselStockCount(counts.filter((row) => row.project === project && row.date < date));
  const count = latestDieselStockCount(counts.filter((row) => row.project === project && row.date === date));
  const sincePrior = (row) => !prior || row.date > prior.date;
  const opening = (prior ? litres(prior.countedLitres) : 0)
    + sum(siteReceipts.filter((row) => row.date < date && (sincePrior(row) || isPostCountReceipt(prior, row))), 'litres')
    - sum(issues.filter((row) => row.date < date && sincePrior(row)), 'litres');
  const supplied = sum(siteReceipts.filter((row) => row.date === date), 'litres');
  const recovered = sum(siteFuelRecoveries(distributions).filter((row) => row.project === project && row.date === date), 'litres');
  const dayIssues = issues.filter((row) => row.date === date);
  const dozerIssued = sum(dayIssues.filter((row) => !!row.equipment), 'litres');
  const otherIssued = sum(dayIssues.filter((row) => !row.equipment), 'litres');
  const distributed = dozerIssued + otherIssued;
  const expected = opening + supplied - distributed;
  const measured = count ? litres(count.countedLitres) : null;
  const postCountSupply = count ? sum(siteReceipts.filter((row) => isPostCountReceipt(count, row)), 'litres') : 0;
  const variance = measured === null ? null : measured + postCountSupply - expected;
  const tolerance = Math.max(5, Math.abs(expected) * 0.02);
  return {
    project, date, opening, supplied, recovered, distributed, dozerIssued, otherIssued, expected, measured, postCountSupply, variance,
    onGround: siteOnGroundAsOf({ project, date, receipts, distributions, operations, counts }).onGround,
    verified: !!prior, lastCountDate: prior?.date || null,
    status: postCountSupply ? 'Pre-delivery count — closing projected'
      : expected < -tolerance ? 'Over-allocated — review records'
      : !prior && variance !== null && Math.abs(variance) > tolerance ? 'Provisional variance — verify opening'
      : variance !== null && variance < -tolerance ? 'Shortage — investigate'
        : variance !== null && variance > tolerance ? 'Surplus — investigate'
          : variance !== null ? 'Reconciled'
            : 'Physical count needed',
  };
}

export function reconcileDozerDay({ project, date, distributions, operations, fleet = [] }) {
  const issues = siteFuelIssues(distributions, operations).filter((row) => row.project === project && row.date === date && row.equipment);
  const reports = operations.filter((row) => row.siteName === project && row.date === date);
  const lossRows = distributions.filter(row => (isTankLoss(row) || maintenanceFuelDetails(row)) && row.project === project && row.date === date);
  const machines = [...new Set([...lossRows.map(row => row.equipment), ...issues.map((row) => row.equipment), ...reports.map((row) => row.equipment)])].filter(Boolean);
  return machines.map((equipment) => {
    const machineIssues = issues.filter((row) => row.equipment === equipment);
    const nonTank = (row) => /not tank fuel|maintenance diesel/i.test(row.notes || '');
    const issued = sum(machineIssues.filter((row) => !nonTank(row)), 'litres');
    const otherUse = sum(machineIssues.filter(nonTank), 'litres');
    const rows = reports.filter((row) => row.equipment === equipment).sort(compareDieselReports);
    const reportIssued = sum(rows, 'dieselSupplied');
    const hasExplicitIssue = distributions.some((row) => row.project === project && row.date === date && row.equipment === equipment && (row.purpose || 'Dozer') === 'Dozer');
    const used = sum(rows, 'fuelUsed');
    const asset = fleet.find((row) => row.name === equipment);
    const normative = rows.reduce((total, row) => total + dieselUsedFor(asset, row.operationType, litres(row.hoursWorked)), 0);
    const overConsumption = normative > 0 && used > Math.max(normative * 1.25, normative + 20);
    const last = lastDieselReading(rows) || rows[rows.length - 1];
    const first = rows[0];
    const opening = first?.openingDiesel == null ? null : litres(first.openingDiesel) - litres(first.dieselSupplied);
    const losses = lossRows.filter(row => row.equipment === equipment);
    const tankLoss = sum(losses.filter(row => isTankLoss(row)), 'litres');
    const maintenanceFuel = sum(losses.filter(row => maintenanceFuelDetails(row)), 'litres');
    const expected = opening === null ? null : opening + issued - used - tankLoss - maintenanceFuel;
    const reported = last?.closingDiesel == null ? null : litres(last.closingDiesel)
      - sum(losses.filter(row => transferAfterDieselReading(row, last)), 'litres');
    const variance = reported === null || expected === null ? null : reported - expected;
    const tolerance = Math.max(5, Math.abs(expected || 0) * 0.02);
    return {
      equipment, issued, otherUse, tankLoss, maintenanceFuel, reportIssued, used, opening, expected, reported, variance, normative,
      status: !last ? (otherUse && !issued ? 'Maintenance/non-tank issue — verify supporting record' : 'Daily report needed')
        : opening === null ? 'Opening reading needed'
        : expected < -tolerance ? 'Consumption exceeds available fuel'
          : Math.abs(variance || 0) > tolerance ? 'Closing variance — investigate'
            : overConsumption ? 'High reported use — review hours/rate'
              : reported === null ? 'Closing reading needed'
            : hasExplicitIssue && Math.abs(issued - reportIssued) > 1 ? 'Site confirmed supply overrides manager report'
            : 'Reported balance agrees',
    };
  });
}

