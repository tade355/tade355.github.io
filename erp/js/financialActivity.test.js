import test from 'node:test';
import assert from 'node:assert/strict';
import { financialActivity, expenseLedgerRows } from './financialActivity.js';
test('unpaid approval is a commitment, never cash; payment uses payment date', () => {
  const ctx = { fundRequests: [{ id: 'FR1', status: 'Approved', date: '2026-10-01', items: [{ amount: 100 }] },
    { id: 'FR2', status: 'Paid', date: '2026-10-01', paidAt: '2026-11-01', items: [{ amount: 50 }] }] };
  assert.deepEqual(financialActivity(ctx).map((r) => [r.id, r.date, r.amount]), [['FR2', '2026-11-01', 50]]);
  assert.equal(financialActivity(ctx, 'commitments')[0].amount, 100);
});
test('invoice receipts follow actual receipt dates and explicitly linked expense is counted once', () => {
  const ctx = { invoices: [{ id: 'I1', date: '2026-09-01', project: 'Site' }],
    invoicePayments: [{ id: 'P1', invoiceId: 'I1', date: '2026-11-02', amount: 30 }],
    fundRequests: [{ id: 'FR1', status: 'Paid', items: [{ amount: 40 }] }],
    expenses: [{ id: 'E1', fundRequestId: 'FR1', date: '2026-11-02', amount: 40 }] };
  const rows = financialActivity(ctx);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-11-02');
  assert.equal(rows[0].project, 'Site');
});

test('expense register includes paid requests immediately, not unpaid approvals', () => {
  const ctx = { fundRequests: [
    { id: 'FR-1', status: 'Paid', date: '2026-10-01', paidAt: '2026-11-11', paidAmount: 60,
      project: 'Example Site', costHead: 'Logistics', paymentReference: 'EXAMPLE',
      items: [{ amount: 100, accountName: 'Example Vendor' }] },
    { id: 'FR-2', status: 'Approved', items: [{ amount: 100 }] },
    { id: 'FR-3', status: 'Pending', items: [{ amount: 100 }] }
  ], expenses: [{ id: 'EXP-1', date: '2026-11-10', category: 'Fuel', amount: 20 }] };
  const rows = expenseLedgerRows(ctx);
  assert.deepEqual(rows.map(r => r.id), ['FR-1', 'EXP-1']);
  assert.equal(rows[0].date, '2026-11-11');
  assert.equal(rows[0].amount, 60);
  assert.equal(rows[0].payee, 'Example Vendor');
  assert.equal(rows[0].paymentReference, 'EXAMPLE');
  assert.equal(rows[0].category, 'Logistics');
});
test('matching linked expense replaces paid request in register without double counting', () => {
  const ctx = {fundRequests:[{id:'FR-1',status:'Paid',paidAmount:40,items:[{amount:100}]}],
    expenses:[{id:'EXP-1',fundRequestId:'FR-1',amount:40,date:'2026-11-11'}]};
  const rows=expenseLedgerRows(ctx);
  assert.equal(rows.length,1);assert.equal(rows[0].id,'EXP-1');assert.equal(rows[0].amount,40);
});
test('request-derived register rows cannot be mistaken for editable expenses', () => {
  const rows=expenseLedgerRows({fundRequests:[{id:'FR-1',status:'Paid',items:[{amount:10}]}]});
  assert.equal(rows[0].source,'Paid Fund Request');assert.equal(rows[0].fundRequestId,'FR-1');
});
