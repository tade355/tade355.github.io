import test from 'node:test';
import assert from 'node:assert/strict';
import { operatorPeriod } from './operatorPortalData.js';
test('operator periods preserve reported hours and separate work stages', () => {
  const reports = [
    { date: '2026-11-04', milestone: 'Phase 1', hours: 8, quantity: 1 },
    { date: '2026-11-05', milestone: 'Phase 1', hours: 8, quantity: 1.2 },
    { date: '2026-11-05', milestone: 'Phase 2', hours: 2, quantity: 1.2 },
    { date: '2026-11-03', milestone: 'Phase 1', hours: 6, quantity: 0.9 },
  ];
  const period = operatorPeriod(reports, '2026-11-04', '2026-11-05');
  assert.equal(period.hours, 18); assert.equal(period.days, 2);
  assert.deepEqual(period.stages, [{ name: 'Phase 1', quantity: 2.2, unit: 'Ha' }, { name: 'Phase 2', quantity: 1.2, unit: 'Ha' }]);
  assert.equal(operatorPeriod(reports, '2026-11-05', '2026-11-05').rows.length, 2);
  assert.equal(operatorPeriod(reports, '', '').rows.length, 4);
});
