import test from 'node:test';
import assert from 'node:assert/strict';
import { stationAdvanceBalances, siteFuelIssues } from './fuelLedger.js';
test('old credit deliveries do not consume a later advance or hide old debt', () => {
  const result = stationAdvanceBalances([{ id: 'A1', station: 'S', amount: 200, unitPriceAgreed: 2 }],
    [{ station: 'S', litres: 500, unitCost: 2 }], [{ station: 'S', balance: 1000 }])[0];
  assert.equal(result.balanceDiesel, 100);
  assert.equal(result.balanceFunds, 200);
  assert.equal(result.status, 'Credit Outstanding');
});
test('linked delivery settles only its advance and excess remains visible', () => {
  const result = stationAdvanceBalances([{ id: 'A1', station: 'S', amount: 200, unitPriceAgreed: 2 }],
    [{ station: 'S', prepaymentId: 'A1', litres: 110, unitCost: 3 }], [])[0];
  assert.equal(result.balanceDiesel, -10);
  assert.equal(result.balanceFunds, -20);
  assert.equal(result.status, 'Over Delivered');
});
test('explicit distribution replaces report copy; internal transfers conserve site stock', () => {
  const rows = siteFuelIssues([{ date: 'D', project: 'P', equipment: 'A', litres: 20 },
    { date: 'D', project: 'P', equipment: 'B', litres: -20 }],
  [{ date: 'D', siteName: 'P', equipment: 'A', dieselSupplied: 20 }, { date: 'E', siteName: 'P', equipment: 'A', dieselSupplied: 50 }]);
  assert.equal(rows.reduce((s, r) => s + r.litres, 0), 50);
});
