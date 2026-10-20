import test from 'node:test';
import assert from 'node:assert/strict';
import { fuelEfficiency, NORM_LITRES_PER_HA } from './fuelEfficiency.js';

const op = (equipment, hoursWorked, quantity, fuelUsed) => ({ equipment, hoursWorked, quantity, fuelUsed });

test('the norm is 8 hours x 25 L over 1.3 ha', () => {
  assert.ok(Math.abs(NORM_LITRES_PER_HA - 153.846) < 0.01);
});

test('litres per hour and per hectare are worked out per dozer, worst first', () => {
  const rows = fuelEfficiency([op('EMG-004', 8, 1.3, 200), op('EMG-004', 8, 1.3, 200), op('EMG-006', 8, 0.9, 200), op('EMG-006', 8, 0.9, 200)]);
  assert.equal(rows[0].equipment, 'EMG-006');
  assert.equal(Math.round(rows[0].litresPerHa), 222);
  assert.equal(rows[0].litresPerHour, 25);
  assert.equal(rows[0].high, true, '222 L/ha is about 144% of the norm');
  assert.equal(rows[1].equipment, 'EMG-004');
  assert.equal(rows[1].high, false);
});

test('too little work gives no ratio and no flag; machines with no work are left out', () => {
  const rows = fuelEfficiency([op('EMG-007', 3, 0.3, 90), op('EMG-008', 0, 0, 0)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].litresPerHa, null);
  assert.equal(rows[0].high, false);
});
