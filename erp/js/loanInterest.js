import { computeProjectStats, companyWideStats } from './views/profitability.js';

// Fixed loans are a tracker, not an amortization calculator — Total
// Repayable is whatever was agreed with the lender, entered directly, so
// interest here is just that minus Principal.
//
// Turnover-Based / Profit-Based loans have no fixed number upfront:
// interest = Interest Percentage x the turnover (revenue) or profit for
// the Linked Project over the Evaluation Period, or company-wide if no
// project is linked — the same figures Profitability already produces.
// Manual Interest Override, when set, replaces the computed figure
// entirely (e.g. to correct for a dispute with the lender over the
// assessed amount).
export function computeLoanInterest(loan) {
  if (loan.interestType === 'Fixed') {
    return (loan.totalRepayable || 0) - (loan.principal || 0);
  }

  if (loan.manualInterestOverride !== null && loan.manualInterestOverride !== undefined) {
    return Number(loan.manualInterestOverride) || 0;
  }

  const from = loan.evaluationPeriodStart;
  const to = loan.evaluationPeriodEnd;
  const stats = loan.linkedProject
    ? computeProjectStats(loan.linkedProject, from, to)
    : companyWideStats(from, to);
  const base = loan.interestType === 'Turnover-Based' ? stats.revenue : stats.profit;
  return ((loan.interestPercentage || 0) / 100) * (base || 0);
}

export function totalOwed(loan) {
  return (loan.principal || 0) + computeLoanInterest(loan);
}
