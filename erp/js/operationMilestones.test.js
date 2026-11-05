import test from 'node:test';
import assert from 'node:assert/strict';
import { operationMilestones } from './operationMilestones.js';
test('milestones stay separate across projects and stages on the same land', () => {
  const groups = operationMilestones([
    { siteName: 'A', operationType: 'Felling', quantity: 10, hoursWorked: 8 },
    { siteName: 'A', operationType: 'Stacking', quantity: 10, hoursWorked: 8 },
    { siteName: 'B', operationType: 'Felling', quantity: 5, hoursWorked: 4 },
    { siteName: 'A', operationType: 'Felling', quantity: 2, hoursWorked: 2 },
    { siteName: 'A', operationType: 'Road', quantity: 1, hoursWorked: 2 },
  ]);
  assert.deepEqual(groups.map(g => [g.project, g.milestone, g.quantity, g.unit]), [
    ['A', 'Felling', 12, 'Ha'], ['A', 'Road', 1, 'KM'], ['A', 'Stacking', 10, 'Ha'], ['B', 'Felling', 5, 'Ha'],
  ]);
  assert.equal(groups[0].reports, 2);
  assert.equal(groups[0].hours, 10);
});
