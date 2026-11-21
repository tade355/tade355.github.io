import test from 'node:test';
import assert from 'node:assert/strict';
import { isLowbedCost, ordinaryProjectLogistics } from './projectLogistics.js';

test('paid lowbed transfer is a project cost, not daily transport', () => {
  const request = { id: 'FR-170', date: '2026-11-10', costHead: 'Logistics', status: 'Paid',
    description: 'Lowbed transfer of EMG-007 and EMG-008 to Blue Sky',
    items: [{ description: 'Dozer transport', amount: 1000000 }] };
  assert.equal(isLowbedCost(request), true);
  assert.equal(ordinaryProjectLogistics([request], '2026-11-10', '2026-11-10').total, 0);
});
