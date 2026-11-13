import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMeetingActions } from './meetingActionExtractor.js';

const staff = [
  { id: 'EMP-1', name: 'Olumide Davidson', status: 'Active' },
  { id: 'EMP-2', name: 'Atabo Victoria', status: 'Active' },
  { id: 'EMP-3', name: 'Former Staff', status: 'Disengaged' },
];

test('extracts action lines and assigns a clearly named owner', () => {
  const rows = extractMeetingActions('Olumide Davidson: Submit the report to Admin by Friday.\nAtabo Victoria — Follow up on the payroll review.', staff);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].assigneeId, 'EMP-1');
  assert.match(rows[0].title, /Submit the report/);
  assert.equal(rows[1].assigneeId, 'EMP-2');
});

test('does not guess an owner or include inactive staff', () => {
  const rows = extractMeetingActions('The supervisor will coordinate the site inspection next week.\nFormer Staff: Complete the maintenance report.', staff);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].assigneeId, '');
});

test('skips headings and removes duplicate action lines', () => {
  const rows = extractMeetingActions('Agenda: Review updates\n- Olumide Davidson: Submit the report to Admin.\nOlumide Davidson: Submit the report to Admin.', staff);
  assert.equal(rows.length, 1);
});


