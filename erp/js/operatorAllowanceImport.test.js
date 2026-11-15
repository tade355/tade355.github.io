import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOperatorAllowanceSheet } from './operatorAllowanceImport.js';

const rows = [
  ['TOPE – REX FORESTRY PROJECT'],
  ['Allowance and Payment Reconciliation (27 September – 5 November 2026)'],
  [],
  ['Date', 'Hours', 'Allowance (₦)', 'Payment Made (₦)', 'Running Balance (₦)'],
  ['Balance B/F', '–', '', '', 693750],
  ['27 Sep', '4hrs 47min', 30000, '', 723750],
  ['1 Oct', '6hrs 30min', 24375, 500000, 248125],
  ['3 Oct', '6 hrs', 22500, '', 270625],
  ['CYCLE SUMMARY'],
  ['Balance B/F from Cycle 2', '', '', 693750],
  ['New cycle allowances', '', '', 76875],
  ['Total before payments', '', '', 770625],
  ['Payments made', '', '', 500000],
  ['Closing outstanding', '', '', 270625],
];

test('reads payments and balances from the uploaded operator reconciliation layout', () => {
  const p = parseOperatorAllowanceSheet(rows);
  assert.equal(p.opening, 693750);
  assert.equal(p.allowanceTotal, 76875);
  assert.equal(p.paymentTotal, 500000);
  assert.equal(p.closing, 270625);
  assert.equal(p.lastDate, '2026-10-03');
  assert.deepEqual(p.payments.map(({ date, amount }) => ({ date, amount })), [{ date: '2026-10-01', amount: 500000 }]);
});

test('rejects a changed payment when its running balance no longer agrees', () => {
  const bad = rows.map((r) => [...r]);
  bad[6][3] = 400000;
  assert.throws(() => parseOperatorAllowanceSheet(bad), /do not reconcile/);
});

