import test from 'node:test';
import assert from 'node:assert/strict';
import { officeRentalUsage, matchesRentalEquipment, rentalDailyLedger } from './rentalHours.js';

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


test('renamed Ogbomo dozers retain their separate historical rental credits and hours', () => {
  assert.equal(matchesRentalEquipment('Ogbomo (Saheed)', 'Saheed (Osaro)'), true);
  assert.equal(matchesRentalEquipment('Ogbomo Dozer (Pastor)', 'Pastor (Osaro)'), true);
  assert.equal(matchesRentalEquipment('Ogbomo (Saheed)', 'Pastor (Osaro)'), false);
  const operations = [
    { equipment: 'Ogbomo (Saheed)', date: '2026-11-12', hoursWorked: 8, workType: 'Office' },
    { equipment: 'Pastor (Osaro)', date: '2026-11-12', hoursWorked: 6, workType: 'Office' },
  ];
  assert.equal(officeRentalUsage(operations, 'Saheed (Osaro)', '2026-11-11').daysUsed, 1);
  assert.equal(officeRentalUsage(operations, 'Pastor (Osaro)', '2026-11-10').daysUsed, 0.75);
});


test('daily rental ledger separates business work and preserves running paid days', () => {
  const rows = rentalDailyLedger([
    { equipment: 'Ogbomo (Saheed)', date: '2026-11-12', hoursWorked: 6, workType: 'Office' },
    { equipment: 'Saheed (Osaro)', date: '2026-11-12', hoursWorked: 3, workType: 'Business' },
    { equipment: 'Saheed (Osaro)', date: '2026-11-13', hoursWorked: 10, workType: 'Office' },
  ], [{ equipment: 'Ogbomo (Saheed)', paymentDate: '2026-11-11', daysPaid: 10 }], [], 'Saheed (Osaro)');
  assert.deepEqual(rows.map((r) => r.date), ['2026-11-11', '2026-11-12', '2026-11-13']);
  assert.equal(rows[1].usedDays, 0.75);
  assert.equal(rows[1].businessHours, 3);
  assert.equal(rows[1].businessDays, 1);
  assert.equal(rows[1].balanceDays, 9.25);
  assert.equal(rows[2].officeHours, 8);
  assert.equal(rows[2].balanceDays, 8.25);
});
