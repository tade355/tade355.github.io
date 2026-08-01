import { store } from './store.js';

// The most recent dozer_rate_history entry for an equipment name at or
// before `date`. Falls back to the equipment's own current inventory
// rates if no history entry exists yet (e.g. it was never explicitly
// changed since rate history tracking shipped, or it's an equipment name
// with no rate ever set).
export function dozerRatesAsOf(equipment, date) {
  const history = store.get('dozerRateHistory')
    .filter((h) => h.equipment === equipment && h.effectiveDate <= date)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  if (history.length) return history[0];
  const inv = store.get('inventory').find((i) => i.name === equipment);
  return {
    hourlyRate: inv?.hourlyRate || 0,
    rentalRatePerDay: inv?.rentalRatePerDay || 0,
    managementFeePerDay: inv?.managementFeePerDay || 0,
  };
}

export function hourlyRateAsOf(equipment, date) {
  return dozerRatesAsOf(equipment, date).hourlyRate || 0;
}

// Diesel price as of a date — derived from the most recent diesel receipt
// on or before that date (what was actually paid for fuel), falling back
// to the "Diesel (AGO)" inventory item's current unit cost if no receipt
// has been logged yet.
export function dieselRateAsOf(date) {
  const receipts = store.get('dieselReceipts')
    .filter((r) => r.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (receipts.length) return receipts[0].unitCost || 0;
  return store.get('inventory').find((i) => i.name === 'Diesel (AGO)')?.unitCost || 0;
}

// The most recent project_rate_history entry for a project at or before
// `date`. Falls back to the project's own current rate if no history
// entry exists yet.
export function projectRateAsOf(project, date) {
  const history = store.get('projectRateHistory')
    .filter((h) => h.project === project && h.effectiveDate <= date)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  if (history.length) return history[0];
  const p = store.get('projects').find((x) => x.name === project);
  return { rate: p?.rate || 0, rateUnit: p?.rateUnit || '' };
}
