// Operator Allowance rules for the owned EMG fleet — shared by Profitability
// (live daily cost estimate) and Dozer Payroll (live balance top-up), so the
// rate/rule only lives in one place. This file existing is itself a fix: the
// two used to each hardcode their own copy of the day-rate, and Jessie's
// discounted rate drifted out of sync between them (Payroll's employee
// record still said ₦30,000 after Profitability's formula had already been
// corrected to his real ₦25,000).
import { store } from './store.js';
import { isSunday } from './dateUtils.js';
import { DOZER_OVERTIME_RATE_DEFAULT } from './constants.js';

// Owned dozers eligible for Operator Allowance — Partnership/Rented dozer
// operators are paid by their own side arrangement, not this one.
export const ALLOWANCE_EQUIPMENT = new Set(['EMG-004', 'EMG-006', 'EMG-007', 'EMG-008']);

// Only used if an operator's own employee record has no Day Rate set at all.
const ALLOWANCE_DAY_RATE_FALLBACK = 30000;
const ALLOWANCE_SUNDAY_FLAT_RATE = 50000;

function dayRateFor(operatorId) {
  return store.get('employees').find((e) => e.id === operatorId)?.dayRate || ALLOWANCE_DAY_RATE_FALLBACK;
}

// Operator Allowance — grouped by operator+date first since an operator can
// have more than one report the same day. Prorates a day rate (the
// operator's own Day Rate from HR & Employees — ₦50,000 for everyone on a
// Sunday, overriding their usual rate) by hours/8 for the first 8 hours,
// plus a flat overtime rate for every hour beyond 8, Sunday included.
export function operatorAllowanceForRows(rows) {
  const hoursByOperatorDate = {};
  rows.forEach((o) => {
    if (!ALLOWANCE_EQUIPMENT.has(o.equipment) || !o.operatorId) return;
    const key = `${o.operatorId}|${o.date}`;
    hoursByOperatorDate[key] = (hoursByOperatorDate[key] || 0) + (o.hoursWorked || 0);
  });
  let total = 0;
  Object.entries(hoursByOperatorDate).forEach(([key, hours]) => {
    const [operatorId, date] = key.split('|');
    const dayRate = isSunday(date) ? ALLOWANCE_SUNDAY_FLAT_RATE : dayRateFor(operatorId);
    const first8 = Math.min(hours, 8);
    const extra = Math.max(0, hours - 8);
    total += (first8 / 8) * dayRate + extra * DOZER_OVERTIME_RATE_DEFAULT;
  });
  return total;
}

// Payee name variants seen in the data for each owned-fleet operator,
// matched case-insensitively against an Expense's payee — these represent
// lump-sum payments (e.g. a bulk transfer-record upload) for day-rate work
// the formula above already counts, whether that work was captured by a
// saved Dozer Payroll run or, for anything after the run's period, the live
// top-up in liveBalanceOwed().
export const OWNED_OPERATOR_PAYEE_ALIASES_BY_EMPLOYEE = {
  'EMP-34': ['ephraim ogheneriye'],
  'EMP-20': ['jenom daniel jessie'],
  'EMP-12': ['paul joshua obokparo', 'joshua obokparo paul'],
  'EMP-11': ['temitope ezekiel adebayo', 'adebayo temitope ezekiel'],
};

const ALL_OWNED_OPERATOR_ALIASES = new Set(Object.values(OWNED_OPERATOR_PAYEE_ALIASES_BY_EMPLOYEE).flat());

export function isOwnedOperatorAllowancePayment(payee) {
  return !!payee && ALL_OWNED_OPERATOR_ALIASES.has(payee.trim().toLowerCase());
}
