import test from 'node:test';
import assert from 'node:assert/strict';
import {
  todayISOString, addDays, lastNDayKeys, lastNMonthKeys, monthBounds, mondayOf, weekOf,
} from './dateUtils.js';

test('todayISOString returns a plain YYYY-MM-DD string matching the local date', () => {
  const result = todayISOString();
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(result, expected);
});

test('addDays shifts forward and backward within a month', () => {
  assert.equal(addDays('2026-06-15', 1), '2026-06-16');
  assert.equal(addDays('2026-06-15', -1), '2026-06-14');
  assert.equal(addDays('2026-06-15', 0), '2026-06-15');
});

test('addDays rolls over a month boundary', () => {
  assert.equal(addDays('2026-06-30', 1), '2026-07-01');
  assert.equal(addDays('2026-07-01', -1), '2026-06-30');
});

test('addDays rolls over a year boundary', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
});

test('addDays handles the Feb 29 leap-year case correctly', () => {
  // 2028 is a leap year
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  // 2026 is not
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

// This is exactly the pattern that broke before: a naive local-midnight
// parse followed by .toISOString() lands one day early in any timezone
// ahead of UTC. addDays must be immune to that regardless of the host
// machine's TZ, since it never touches local time at all.
test('addDays is timezone-independent (pure UTC arithmetic)', () => {
  assert.equal(addDays('2026-10-02', 1), '2026-10-03');
  assert.equal(addDays('2026-10-02', -1), '2026-10-01');
});

test('lastNDayKeys returns n consecutive days, oldest first, ending at the anchor', () => {
  const keys = lastNDayKeys(5, '2026-10-03');
  assert.deepEqual(keys, ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
});

test('lastNDayKeys with n=1 returns just the anchor', () => {
  assert.deepEqual(lastNDayKeys(1, '2026-10-03'), ['2026-10-03']);
});

test('lastNDayKeys spans a month/year boundary correctly', () => {
  const keys = lastNDayKeys(3, '2027-01-01');
  assert.deepEqual(keys, ['2026-12-30', '2026-12-31', '2027-01-01']);
});

test('lastNMonthKeys returns n consecutive months, oldest first, ending at the anchor month', () => {
  const keys = lastNMonthKeys(4, '2026-10-15');
  assert.deepEqual(keys, ['2026-07', '2026-08', '2026-09', '2026-10']);
});

test('lastNMonthKeys spans a year boundary correctly', () => {
  const keys = lastNMonthKeys(3, '2027-02-10');
  assert.deepEqual(keys, ['2026-12', '2027-01', '2027-02']);
});

test('monthBounds gives the first and last day of a 31-day month', () => {
  assert.deepEqual(monthBounds('2026-07'), { from: '2026-07-01', to: '2026-07-31' });
});

test('monthBounds gives the first and last day of a 30-day month', () => {
  assert.deepEqual(monthBounds('2026-09'), { from: '2026-09-01', to: '2026-09-30' });
});

test('monthBounds handles February correctly in a leap year and a non-leap year', () => {
  assert.deepEqual(monthBounds('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
});

test('mondayOf finds the correct Monday for every day of a known week', () => {
  // 2026-09-28 is a Monday.
  assert.equal(mondayOf('2026-09-28'), '2026-09-28'); // Monday itself
  assert.equal(mondayOf('2026-09-29'), '2026-09-28'); // Tuesday
  assert.equal(mondayOf('2026-10-02'), '2026-09-28'); // Friday
  assert.equal(mondayOf('2026-10-04'), '2026-09-28'); // Sunday — the tricky getUTCDay()===0 case
});

test('weekOf returns the Monday as the key and a formatted Mon–Sun label', () => {
  const { key, label } = weekOf('2026-10-02');
  assert.equal(key, '2026-09-28');
  assert.equal(label, '28 Sept 2026 – 04 Oct 2026');
});
