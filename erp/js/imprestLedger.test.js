import assert from 'node:assert/strict';
import { managerImprestLedger } from './imprestLedger.js';

const records = [
  { id: 'COST-1', kind: 'Cost', project: 'Kangidi', status: 'Submitted', data: { payee: 'Site Manager', amount: 36000, incurredDate: '2026-11-13', description: 'Operator 24k, mechanic 12k' }, events: [] },
  { id: 'COST-2', kind: 'Cost', project: 'Kangidi', status: 'Partially Paid', data: { payee: 'site manager', amount: 50000, approvedAmount: 45000, incurredDate: '2026-11-12', description: 'Transport' }, events: [{ type: 'payment', amount: 20000, date: '2026-11-14', reference: 'TR-1' }] },
  { id: 'COST-3', kind: 'Cost', project: 'Kangidi', status: 'Rejected', data: { payee: 'Site Manager', amount: 100000 }, events: [] },
];
const [wallet] = managerImprestLedger(records);
assert.equal(wallet.reported, 86000);
assert.equal(wallet.awaitingApproval, 36000);
assert.equal(wallet.approved, 45000);
assert.equal(wallet.paid, 20000);
assert.equal(wallet.outstanding, 25000);
assert.equal(wallet.batches.length, 2);
assert.equal(wallet.batches.find(batch => batch.id === 'COST-2').outstanding, 25000);

