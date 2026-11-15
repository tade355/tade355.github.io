import { ALLOWANCE_EQUIPMENT, operatorAllowanceForRows } from './ownedOperatorAllowance.js';
import { buildPayStatement } from './payStatement.js';

// Keep every personal pay surface on the same approved-plus-estimated ledger.
export function buildPersonalPayEntries(ctx, employeeId) {
  const personal = { ...ctx, expenses: (ctx.expenses || []).map(e => ({ ...e, payee: 'personal-payment' })) };
  return buildPayStatement(personal, employeeId,
    rows => operatorAllowanceForRows(rows.filter(o => ALLOWANCE_EQUIPMENT.has(o.equipment))),
    (_id, payee, category) => payee === 'personal-payment' && category === 'Salary and Allowance');
}
