import { store } from './store.js';
import { dateInRange } from './utils.js';
import { projectRateAsOf } from './rateHistory.js';

// Provisional side: Daily Operations report rows, quantity x the contract
// rate in effect that day (projectRateAsOf) — available same-day, before
// any client involvement.
export function reportedForSlice({ project, operationType, from, to }) {
  const rows = store.get('operations').filter((o) =>
    o.siteName === project && o.operationType === operationType && dateInRange(o.date, from, to));
  const qty = rows.reduce((sum, o) => sum + (o.quantity || 0), 0);
  const revenue = rows.reduce((sum, o) => sum + (o.quantity || 0) * (projectRateAsOf(o.siteName, o.operationType, o.date).rate || 0), 0);
  return { qty, revenue, reportCount: rows.length };
}

// Verified side: invoice_items carrying this exact operationType, on
// invoices tagged to this project whose period overlaps the range. Items
// with no operationType (pre-existing invoices, or non-project invoices)
// are deliberately excluded — see unclassifiedInvoicedForSlice below for
// where their revenue still counts.
export function invoicedForSlice({ project, operationType, from, to }) {
  const invoices = store.get('invoices').filter((i) =>
    i.project === project && dateInRange(i.periodStart, from, to));
  let qty = 0;
  let revenue = 0;
  invoices.forEach((inv) => {
    (inv.items || []).filter((it) => it.operationType === operationType).forEach((it) => {
      qty += it.qty || 0;
      revenue += (it.qty || 0) * (it.price || 0);
    });
  });
  return { qty, revenue, invoiceCount: invoices.length };
}

// Legacy/unclassified invoices for a project+range: no operationType on
// their items, so they can't join into the per-operation-type matrix
// above, but their revenue is real and already counted in this project's
// total invoiced revenue on Profitability/Income & Expenditure — surfaced
// here so it isn't mistaken for a gap.
export function unclassifiedInvoicedForSlice({ project, from, to }) {
  const invoices = store.get('invoices').filter((i) =>
    i.project === project && dateInRange(i.date, from, to)
    && (i.items || []).some((it) => !it.operationType));
  const revenue = invoices.reduce((sum, i) =>
    sum + (i.items || []).filter((it) => !it.operationType).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0), 0);
  return { revenue, invoiceCount: invoices.length };
}

// Same threshold shape as dieselManagement.js's dozerDiscrepancies(): 2%
// of the reference (invoiced) value, or a floor, whichever is larger.
// `floor` differs by unit (Ha/KM/hrs vs currency) so callers pass one in.
export function varianceStatus(reportedValue, invoicedValue, floor) {
  if (!invoicedValue) return { variance: null, status: 'No Invoice Yet' };
  const variance = reportedValue - invoicedValue;
  const threshold = Math.max(floor, Math.abs(invoicedValue) * 0.02);
  let status = 'OK';
  if (Math.abs(variance) > threshold) status = 'Variance';
  else if (Math.abs(variance) > 0.01) status = 'Minor Variance';
  return { variance, status };
}
