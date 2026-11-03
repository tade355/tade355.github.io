import test from 'node:test';
import assert from 'node:assert/strict';
import { financialActivity } from './financialActivity.js';
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
