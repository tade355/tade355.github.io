import { store } from './store.js';
import { totalOwed } from './loanInterest.js';

export function paymentsForLoan(loanId) {
  return store.get('loanRepayments').filter((p) => p.loanId === loanId);
}

export function amountRepaid(loan) {
  return paymentsForLoan(loan.id).reduce((sum, p) => sum + (p.amount || 0), 0);
}

export function amountOutstanding(loan) {
  return totalOwed(loan) - amountRepaid(loan);
}

// Days past the loan's Due Date with a real balance still outstanding.
// Keyed off the actual computed balance rather than the loan's manual
// Status label, since that label (Active/Restructured/Defaulted/...) is a
// human judgment call that can lag behind what's actually been repaid.
export function agingDays(loan) {
  if (!loan.dueDate || amountOutstanding(loan) <= 0) return null;
  const due = new Date(`${loan.dueDate}T00:00:00`);
  const diff = Math.floor((Date.now() - due.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}
