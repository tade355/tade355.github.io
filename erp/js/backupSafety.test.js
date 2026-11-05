import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, applyRefreshResults } from './backupSafety.js';

test('restore rejects a missing collection before any writes, including legacy exports', () => {
  assert.throws(() => validateSnapshot({ employees: [] }, ['employees', 'expenses']), /Incomplete backup/);
  assert.deepEqual(validateSnapshot({ employees: [], expenses: [] }, ['employees', 'expenses']), [
    { collection: 'employees', records: 0 }, { collection: 'expenses', records: 0 },
  ]);
});
test('restore rejects duplicate ids, corrupt manifests and future versions', () => {
  assert.throws(() => validateSnapshot({ employees: [{ id: 'A' }, { id: 'A' }] }, ['employees']), /duplicate/);
  assert.throws(() => validateSnapshot({ employees: [], _backup: { version: 1, counts: { employees: 2 } } }, ['employees']), /mismatch/);
  assert.throws(() => validateSnapshot({ employees: [], _backup: { version: 2 } }, ['employees']), /Unsupported/);
});
test('one failed query preserves prior rows and marks data unhealthy', () => {
  const previous = { expenses: [{ id: 'E1', amount: 200 }], operations: [] };
  const result = applyRefreshResults(previous, [
    { key: 'expenses', data: [], error: new Error('Offline') },
    { key: 'operations', data: [{ id: 'O1' }], error: null },
  ]);
  assert.equal(result.state.expenses[0].amount, 200);
  assert.equal(result.health.expenses.ok, false);
  assert.equal(result.health.operations.ok, true);
  assert.equal(previous.operations.length, 0);
});

test('module readiness backup rows validate by their natural key and still reject duplicates', () => {
  const row = { moduleKey: 'operations', label: 'Field Operations', status: 'Active' };
  assert.deepEqual(validateSnapshot({ moduleStatuses: [row] }, ['moduleStatuses']), [{ collection: 'moduleStatuses', records: 1 }]);
  assert.throws(() => validateSnapshot({ moduleStatuses: [row, row] }, ['moduleStatuses']), /duplicate/);
  assert.throws(() => validateSnapshot({ moduleStatuses: [{ id: 'fake' }] }, ['moduleStatuses']), /Invalid/);
});
