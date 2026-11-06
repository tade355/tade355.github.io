import test from 'node:test';
import assert from 'node:assert/strict';
import { completedEngineService, engineServiceStatus } from './serviceTracking.js';
test('purchases and repairs do not reset completed engine servicing', () => {
  const logs = [
    { equipment: 'M1', date: '2026-09-18', type: 'Service', status: 'Completed', description: 'Last actual engine service: confirmed by operator' },
    { equipment: 'M1', date: '2026-10-15', type: 'Service', status: 'Completed', description: 'Engine oil purchase (1 keg)' },
    { equipment: 'M1', date: '2026-10-22', type: 'Repair', status: 'Completed', description: 'Injector repair' },
    { equipment: 'M1', date: '2026-11-05', type: 'Service', status: 'Scheduled', description: 'Awaiting service' },
  ];
  assert.equal(completedEngineService(logs[1]), false);
  assert.equal(completedEngineService(logs[2]), false);
  const result = engineServiceStatus({ name: 'M1', serviceIntervalHours: 150 }, logs, [
    { equipment: 'M1', date: '2026-10-01', hoursWorked: 150 },
    { equipment: 'M1', date: '2026-11-05', hoursWorked: 8 },
    { equipment: 'M1', date: '2026-11-07', hoursWorked: 8 },
  ], '2026-11-06');
  assert.equal(result.since, '2026-09-18'); assert.equal(result.hours, 158); assert.equal(result.status, 'Overdue');
  assert.equal(engineServiceStatus({ name: 'M2' }, logs, [], '2026-11-06').status, 'Service date missing');
});
