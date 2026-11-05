import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, clockToStorage } from './clockFormat.js';

test('AM/PM display and input round-trip at midnight, noon and the end of a shift', () => {
  for (const [stored, shown, h, m, period] of [
    ['00:00', '12:00 AM', '12', '00', 'AM'],
    ['07:50', '7:50 AM', '7', '50', 'AM'],
    ['12:00', '12:00 PM', '12', '00', 'PM'],
    ['18:05', '6:05 PM', '6', '05', 'PM'],
  ]) {
    assert.equal(formatClock(stored), shown);
    assert.equal(clockToStorage(h, m, period), stored);
  }
  assert.equal(formatClock(''), '—');
  assert.equal(clockToStorage('', '00', 'AM'), '');
});
