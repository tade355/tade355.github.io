// Saved receipts cover the legacy period through 4 September 2026.
// From 5 September, include diesel credit collections except explicitly linked
// receipts and sold-on fuel. The historical boundary never moves with new data.
// Unassigned deliveries remain unassigned until reconciled; never guess a site.
export const isSoldOn = (c) => /sold to/i.test(c.notes || '');

// "Midejab" (old receipts) and "Midejab Ltd" (Fuel Credit) are the same station:
// a name that is the start of a longer known station name is treated as it.
export function canonicalStation(name, known) {
  if (!name) return name;
  const n = name.trim().toLowerCase();
  const hit = known.find((k) => k.toLowerCase() === n) || known.find((k) => k.toLowerCase().startsWith(`${n} `));
  return hit || name;
}

export function mergeDieselReceipts({ receipts: saved, collections, operations }) {
  const known = [...new Set(collections.map((c) => c.station).filter(Boolean))];
  const receipts = saved.map((r) => (r.station ? { ...r, station: canonicalStation(r.station, known) } : r));
  // Historical receipts and credit collections overlap before this fixed
  // migration boundary. Never move it when an ordinary new receipt arrives.
  const after = collections.filter((c) => c.fuelType === 'Diesel' && c.date >= '2026-09-05' && !isSoldOn(c)
    && !receipts.some((r) => r.fuelCreditCollectionId === c.id));
  if (!after.length) return saved.length === receipts.length && receipts.every((r, i) => r === saved[i]) ? saved : receipts;
  // The site that has been reporting since the cutoff gets the supply.
  const synthetic = after.map((c) => ({
    id: c.id, date: c.date, litres: c.litres, unitCost: c.unitPrice, supplier: c.station, station: c.station, project: c.project || '',
    reference: 'Fuel Credit', notes: c.notes || '', fromFuelCredit: true,
  }));
  return [...receipts, ...synthetic];
}
