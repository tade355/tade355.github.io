import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDiff, auditSummary } from './auditLog.js';

test('only changed fields are listed and the timestamps are ignored', () => {
  const d = auditDiff({ id: 'FR-1', status: 'Pending', date: '2026-10-10', updated_at: 'a' }, { id: 'FR-1', status: 'Paid', date: '2026-10-15', updated_at: 'b' });
  assert.deepEqual(d.map((x) => x.field).sort(), ['date', 'status']);
});

test('summaries read as sentences', () => {
  assert.equal(auditSummary({ action: 'INSERT' }), 'Created');
  assert.equal(auditSummary({ action: 'DELETE' }), 'Deleted');
  assert.equal(auditSummary({ action: 'UPDATE', old_row: { status: 'Pending', litres: 2550 }, new_row: { status: 'Pending', litres: 2250 } }), 'litres: 2550 -> 2250');
  assert.equal(auditSummary({ action: 'UPDATE', old_row: { a: 1 }, new_row: { a: 1 } }), 'Saved with no change');
  assert.match(auditSummary({ action: 'UPDATE', old_row: { notes: 'x'.repeat(60) }, new_row: { notes: 'y' } }), /notes changed/);
  assert.match(auditSummary({ action: 'UPDATE', old_row: { a: 1, b: 1, c: 1, d: 1, e: 1 }, new_row: { a: 2, b: 2, c: 2, d: 2, e: 2 } }), /and 1 more/);
});
