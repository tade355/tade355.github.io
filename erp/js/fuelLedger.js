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

// Explicit movements win for the same site/machine/day. Legacy reports remain
// a fallback until they can be reconciled; never add both representations.
export function siteFuelIssues(distributions, operations) {
  const key = (project, equipment, date) => `${project}|${equipment}|${date}`;
  const explicit = new Set(distributions.map((r) => key(r.project, r.equipment, r.date)));
  return [...distributions, ...operations.filter((o) => o.dieselSupplied && !explicit.has(key(o.siteName, o.equipment, o.date)))
    .map((o) => ({ date: o.date, project: o.siteName, equipment: o.equipment, litres: o.dieselSupplied, legacyReport: true }))];
}
