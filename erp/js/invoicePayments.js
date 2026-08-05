import { store } from './store.js';
import { invoiceTotal } from './utils.js';

export function paymentsForInvoice(invoiceId) {
  return store.get('invoicePayments').filter((p) => p.invoiceId === invoiceId);
}

export function amountReceived(invoice) {
  return paymentsForInvoice(invoice.id).reduce((sum, p) => sum + (p.amount || 0), 0);
}

export function amountOutstanding(invoice) {
  return invoiceTotal(invoice) - amountReceived(invoice);
}

// The single place invoice status is decided — called right after an
// invoice is saved and right after one of its payments is added, edited,
// or removed, so the stored `status` column never drifts from reality.
export function computeInvoiceStatus(invoice) {
  const total = invoiceTotal(invoice);
  const received = amountReceived(invoice);
  if (received <= 0) return 'Unpaid';
  if (received >= total) return 'Paid';
  return 'Partially Paid';
}

// Days past due with the invoice not yet fully paid; null once Paid or
// before the due date, so callers can treat "not overdue" and "n/a" alike.
export function agingDays(invoice) {
  if (!invoice.dueDate || computeInvoiceStatus(invoice) === 'Paid') return null;
  const due = new Date(`${invoice.dueDate}T00:00:00`);
  const diff = Math.floor((Date.now() - due.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}
