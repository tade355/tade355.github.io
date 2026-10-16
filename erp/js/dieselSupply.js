// Diesel supply as one picture. Before 5 Sep 2026 diesel arrived as "diesel
// receipts" (Fleet Management → Diesel Tracking). From then on every litre comes
// from the Midejab credit account and is logged in Fuel Credit collections —
// nothing is logged as a receipt any more. So the diesel tabs (Station Ledger,
// Site Distribution, Diesel Tracking) read: the saved receipts, plus every Fuel
// Credit diesel collection dated after the last saved receipt, excluding diesel
// sold on (its note says "Sold to ..."), tagged to the site that has been
// working since.
//
// Pure (no store / DOM imports).
export const isSoldOn = (c) => /sold to/i.test(c.notes || '');

export function mergeDieselReceipts({ receipts, collections, operations }) {
  const cutoff = receipts.reduce((m, r) => (r.date > m ? r.date : m), '');
  const after = collections.filter((c) => c.fuelType === 'Diesel' && c.date > cutoff && !isSoldOn(c));
  if (!after.length) return receipts;
  // The site that has been reporting since the cutoff gets the supply.
  const bySite = {};
  operations.filter((o) => o.date > cutoff && o.siteName).forEach((o) => { bySite[o.siteName] = (bySite[o.siteName] || 0) + 1; });
  const site = Object.entries(bySite).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const synthetic = after.map((c) => ({
    id: c.id, date: c.date, litres: c.litres, unitCost: c.unitPrice, supplier: c.station, station: c.station, project: site,
    reference: 'Fuel Credit', notes: c.notes || '', fromFuelCredit: true,
  }));
  return [...receipts, ...synthetic];
}
