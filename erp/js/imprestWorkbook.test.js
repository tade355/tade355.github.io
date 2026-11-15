import assert from 'node:assert/strict';
import { parseImprestSheet, imprestStatement, managerIsImprestEligible } from './imprestWorkbook.js';

const sheet = [
  ['', 'Fund Retirement Sheet - Site Manager'],
  [],
  ['Total Inflow', '', 30000],
  ['Total Outflow', '', 45000],
  [], [], [], [],
  ['S/No', 'Date', 'Amount', '', 'Purpose', 'Site (Location)', 'Category'],
  ['', '', 'Debit', 'Credit', '', '', 'Staff Site Logistics', 'Temporary Lodging', 'Msc'],
  [],
  [1, 46335, 24000, '', 'Operator transport', 'Kangidi', 24000],
  [2, 46336, 21000, '', 'Lodging and materials', 'Kangidi', '', 16000, 5000],
  [3, 46337, '', 30000, '', 'Kangidi'],
];
const parsed = parseImprestSheet(sheet, 'Oki');
assert.equal(parsed.entries.length, 3);
assert.equal(parsed.calculatedOutflow, 45000);
assert.equal(parsed.calculatedInflow, 30000);
assert.equal(parsed.variance, 0);
assert.equal(parsed.entries[2].purpose, 'Payment / credit recorded in workbook');
assert.equal(parsed.entries[1].categoryAmounts.MSc, 5000);
const statement = imprestStatement(parsed.entries);
assert.equal(statement.balance, -15000);
assert.equal(statement.outstanding, 15000);
assert.equal(statement.rows[2].runningBalance, -15000);
assert.equal(managerIsImprestEligible({ role: 'General Manager/Site manager', status: 'Active' }), true);
assert.equal(managerIsImprestEligible({ role: 'Maintenance Manager', status: 'Suspended' }), false);
assert.equal(managerIsImprestEligible({ role: 'Operator', status: 'Active' }), false);

