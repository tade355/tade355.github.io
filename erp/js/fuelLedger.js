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

// A report is a draft distribution until it is confirmed in Site Distribution.
// Group by site, machine and date because one machine may have several work rows.
export function pendingSiteFuelIssues(distributions, operations) {
  const key = (project, equipment, date) => `${project}|${equipment}|${date}`;
  const confirmed = new Set((distributions || []).filter((r) => (r.purpose || 'Dozer') === 'Dozer')
    .map((r) => key(r.project, r.equipment, r.date)));
  const pending = new Map();
  for (const row of operations || []) {
    const litres = Number(row.dieselSupplied || 0);
    if (!row.siteName || !row.equipment || !row.date || litres <= 0) continue;
    const id = key(row.siteName, row.equipment, row.date);
    if (confirmed.has(id)) continue;
    const item = pending.get(id) || { project: row.siteName, equipment: row.equipment, date: row.date, purpose: 'Dozer', litres: 0, legacyReport: true };
    item.litres += litres;
    pending.set(id, item);
  }
  return [...pending.values()];
}

// Confirmed site issues and unconfirmed report suggestions represent the same
// physical handout. Tank-to-tank drilling never changes site stock.
export function siteFuelIssues(distributions, operations) {
  return [...(distributions || []).filter((r) => r.purpose !== 'Tank Transfer'),
    ...pendingSiteFuelIssues(distributions, operations)];
}

export function tankTransferDelta(distributions, equipment, throughDate, afterDate = '') {
  return (distributions || []).filter((r) => r.purpose === 'Tank Transfer' && r.date <= throughDate && (!afterDate || r.date > afterDate))
    .reduce((sum, r) => sum + (r.recipient === equipment ? Number(r.litres || 0) : 0)
      - (r.equipment === equipment ? Number(r.litres || 0) : 0), 0);
}
