import { dieselEquipmentName } from './dieselReportChain.js';

export function stationAdvanceBalances(prepayments, receipts, credits) {
  const stations = [...new Set([...prepayments.map((p) => p.station), ...receipts.map((r) => r.station), ...credits.map((c) => c.station)].filter(Boolean))];
  return stations.map((station) => {
    const advances = prepayments.filter((p) => p.station === station);
    const ids = new Set(advances.map((p) => p.id));
    const deliveries = receipts.filter((r) => r.station === station && r.prepaymentId && ids.has(r.prepaymentId));
    const totalPrepaid = advances.reduce((s, p) => s + (p.amount || 0), 0);
    const litresPurchased = advances.reduce((s, p) => s + (p.unitPriceAgreed ? p.amount / p.unitPriceAgreed : 0), 0);
    const litresSupplied = deliveries.reduce((s, r) => s + (r.litres || 0), 0);
    // Settle each purchase at its agreed price, not an unrelated receipt valuation.
    const fundsValueSupplied = deliveries.reduce((s, r) => s + r.litres * (advances.find((p) => p.id === r.prepaymentId)?.unitPriceAgreed || 0), 0);
    const creditOwed = credits.find((c) => c.station === station)?.balance || 0;
    const balanceDiesel = litresPurchased - litresSupplied;
    const balanceFunds = totalPrepaid - fundsValueSupplied;
    const unknownPrice = advances.some((p) => !p.unitPriceAgreed);
    const status = unknownPrice ? 'Price Unconfirmed' : creditOwed > 0 ? 'Credit Outstanding'
      : balanceDiesel < 0 || balanceFunds < 0 ? 'Over Delivered'
        : balanceDiesel > 0 ? (litresSupplied ? 'Partially Settled' : 'Outstanding') : 'Fully Settled';
    return { station, totalPrepaid, litresPurchased, litresSupplied, fundsValueSupplied, balanceDiesel, balanceFunds, creditOwed, status };
  });
}

// Daily reports are provisional until their site handout is confirmed.
export function pendingSiteFuelIssues(distributions, operations) {
  const key = (project, equipment, date) => `${project}|${dieselEquipmentName(equipment)}|${date}`;
  const confirmed = new Map();
  for (const row of distributions || []) {
    if ((row.purpose || 'Dozer') !== 'Dozer') continue;
    const id = key(row.project, row.equipment, row.date);
    confirmed.set(id, (confirmed.get(id) || 0) + Number(row.litres || 0));
  }
  const reported = new Map();
  for (const row of operations || []) {
    const litres = Number(row.dieselSupplied || 0);
    if (!row.siteName || !row.equipment || !row.date || litres <= 0) continue;
    const id = key(row.siteName, row.equipment, row.date);
    const item = reported.get(id) || { project: row.siteName, equipment: dieselEquipmentName(row.equipment), date: row.date, purpose: 'Dozer', litres: 0, legacyReport: true };
    item.litres += litres;
    reported.set(id, item);
  }
  // A site confirmation is the final daily amount, even when it differs
  // from the manager report. Do not add the report's difference as fuel.
  return [...reported.entries()]
    .filter(([id]) => !confirmed.has(id))
    .map(([, item]) => item)
    .filter(item => item.litres > 0.05);
}

// Keep manager reports and confirmed handouts side by side for review.
export function siteFuelComparisons(distributions, operations) {
  const rows = new Map();
  const get = (project, equipment, date) => {
    const name = dieselEquipmentName(equipment);
    const key = `${project}|${name}|${date}`;
    if (!rows.has(key)) rows.set(key, { project, equipment: name, date, reported: 0, confirmed: 0, hasConfirmation: false });
    return rows.get(key);
  };
  for (const row of operations || []) {
    if (!row.siteName || !row.equipment || !row.date) continue;
    const litres = Number(row.dieselSupplied || 0);
    if (litres > 0) get(row.siteName, row.equipment, row.date).reported += litres;
  }
  for (const row of distributions || []) {
    if ((row.purpose || 'Dozer') !== 'Dozer' || !row.project || !row.equipment || !row.date) continue;
    const item = get(row.project, row.equipment, row.date);
    item.confirmed += Number(row.litres || 0);
    item.hasConfirmation = true;
  }
  return [...rows.values()].map((row) => ({
    ...row,
    difference: Math.round((row.reported - row.confirmed) * 100) / 100,
  }));
}

export function siteFuelIssues(distributions, operations) {
  return [...(distributions || []).filter(r => r.purpose !== 'Tank Transfer' && r.purpose !== 'Tank Drill'),
    ...pendingSiteFuelIssues(distributions, operations)];
}

// Drilling recovers fuel from a machine into site stock. Later dozer issues
// are separate movements, so the recovered litres can serve multiple machines.
export function maintenanceFuelDetails(row) {
  if (row?.purpose !== 'Tank Drill' || !String(row.notes || '').startsWith('[MAINTENANCE FUEL] ')) return null;
  try {
    const data = JSON.parse(row.notes.slice('[MAINTENANCE FUEL] '.length));
    if (!['Idling', 'Test running'].includes(data.kind) || !(Number(data.hours) > 0) || !(Number(data.unitPrice) > 0)) return null;
    return { ...data, hours: Number(data.hours), unitPrice: Number(data.unitPrice),
      cost: Number(row.litres || 0) * Number(data.unitPrice) };
  } catch (_) { return null; }
}

export function isTankLoss(row) {
  return row?.purpose === 'Tank Drill' && /^\[TANK LOSS\]/.test(String(row.notes || ''));
}

export function siteFuelRecoveries(distributions) {
  return (distributions || []).filter(r => r.purpose === 'Tank Drill' && !isTankLoss(r) && !String(r.notes || '').startsWith('[MAINTENANCE FUEL] '))
    .map(r => ({ ...r, source: 'Drilled from ' + r.equipment }));
}

// A direct tank transfer changes only machine balances. A drill removes fuel
// from the donor tank and adds it to the project's ground stock.
export function tankTransferDelta(distributions, equipment, throughDate, afterDate = '') {
  return (distributions || []).filter(r => (r.purpose === 'Tank Transfer' || r.purpose === 'Tank Drill') && r.date <= throughDate && (!afterDate || r.date > afterDate))
    .reduce((sum, r) => sum + (dieselEquipmentName(r.recipient) === dieselEquipmentName(equipment) ? Number(r.litres || 0) : 0)
      - (dieselEquipmentName(r.equipment) === dieselEquipmentName(equipment) ? Number(r.litres || 0) : 0), 0);
}
