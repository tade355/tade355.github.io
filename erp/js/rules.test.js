import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from './rules.js';
import { DASHBOARD_BASIS_FROM, sundayBonusFor } from './dashboardBasis.js';
import { DIESEL_FILL_LITRES, EXPECTED_HA_PER_8HRS } from './dailyDashboardData.js';
import { DEFAULTS } from './agoPlanData.js';

test('the numbers the business runs on are the ones written in AGENTS.md', () => {
  assert.equal(R.DASHBOARD_BASIS_FROM, '2026-10-10');
  assert.equal(R.DIESEL_FILL_LITRES, 250); // 8 hrs x 25 L + 50 L reserve
  assert.equal(R.LITRES_PER_HOUR_AFTER_HOURS, 20);
  assert.equal(R.EXPECTED_HA_PER_8HRS, 1.3);
  assert.equal(R.DOZER_OVERTIME_RATE_DEFAULT, 10000);
  assert.equal(R.SUNDAY_FLAT_DAY_RATE, 50000);
  assert.equal(R.DIESEL_LOGISTICS_PER_LITRE, 50);
});

test('modules that used to hold their own copy now read the shared rule', () => {
  assert.equal(DASHBOARD_BASIS_FROM, R.DASHBOARD_BASIS_FROM);
  assert.equal(DIESEL_FILL_LITRES, R.DIESEL_FILL_LITRES);
  assert.equal(EXPECTED_HA_PER_8HRS, R.EXPECTED_HA_PER_8HRS);
  assert.deepEqual(DEFAULTS, { targetHours: 8, litresPerHour: 25, afterHoursRate: 20, reserve: 50, kegLitres: 30 });
});

test('the Sunday bonus policy follows the tier table', () => {
  assert.equal(sundayBonusFor(3, 5), 20000);
  assert.equal(sundayBonusFor(4, 6), 20000);
  assert.equal(sundayBonusFor(2, 5), 10000);
  assert.equal(sundayBonusFor(1, 5), 5000);
  assert.equal(sundayBonusFor(3, 3), 10000);
  assert.equal(sundayBonusFor(3, 4), 10000);
  assert.equal(sundayBonusFor(3, 2), 0);
  assert.equal(sundayBonusFor(0, 5), 0);
});
