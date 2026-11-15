import test from 'node:test';
import assert from 'node:assert/strict';
import { officeRentalUsage } from './rentalHours.js';

test('rental credit uses eight office hours per day, including partial days', () => {
  const usage = officeRentalUsage([
    { equipment: 'A', date: '2026-11-12', hoursWorked: 6, workType: 'Office', siteName: 'Kangidi' },
    { equipment: 'A', date: '2026-11-13', hoursWorked: 2, workType: 'Office', siteName: 'Kangidi' },
  ], 'A', '2026-11-12');
  assert.equal(usage.hoursWorked, 8);
  assert.equal(usage.daysUsed, 1);
  assert.equal(usage.workedDates, 2);
});

test('private business work and extra hours do not consume or appear in owner usage', () => {
  const usage = officeRentalUsage([
    { equipment: 'A', date: '2026-11-12', hoursWorked: 10, workType: 'Office' },
    { equipment: 'A', date: '2026-11-12', hoursWorked: 3, workType: 'Business', siteName: 'Private' },
    { equipment: 'A', date: '2026-11-13', hoursWorked: 4, workType: 'Office' },
    { equipment: 'B', date: '2026-11-13', hoursWorked: 8, workType: 'Office' },
  ], 'A', '2026-11-12');
  assert.equal(usage.hoursWorked, 12);
  assert.equal(usage.daysUsed, 1.5);
  assert.equal(usage.work[0].hoursWorked, 8);
  assert.equal(usage.work.some(row => row.project.includes('Private')), false);
});
