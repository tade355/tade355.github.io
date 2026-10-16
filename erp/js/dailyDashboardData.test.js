import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyDashboard, lateLabel } from './dailyDashboardData.js';

const P = 'Site A';
const op = (o) => ({ siteName: P, operationType: 'Phase 1', workType: null, ...o });
function ctx(extra = {}) {
  return {
    project: P, date: '2026-10-12', since: '2026-10-10',
    operations: [
      op({ date: '2026-10-10', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 8, quantity: 1, fuelUsed: 200, timeResumed: '09:00', timeClosed: '17:00' }),
      op({ date: '2026-10-12', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 4, quantity: 0.5, fuelUsed: 100, timeResumed: '10:00', timeClosed: '14:00' }),
    ],
    inventory: [{ name: 'EMG-1', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active', currentProject: P }],
    employees: [{ id: 'E1', name: 'Op One' }, { id: 'S1', name: 'Sup One' }],
    distributions: [
      { project: P, date: '2026-10-10', equipment: 'EMG-1', litres: 220 },
      { project: P, date: '2026-10-10', equipment: 'EMG-1', litres: 30, notes: 'For fixing track, not tank fuel' },
      { project: P, date: '2026-10-12', equipment: 'EMG-1', litres: 100 },
    ],
    fuelCreditCollections: [{ date: '2026-10-12', fuelType: 'Diesel', litres: 1000, unitPrice: 1900 }],
    fundRequests: [], maintenanceLogs: [],
    dieselStockCounts: [{ date: '2026-10-11', countedLitres: 0 }, { date: '2026-10-12', countedLitres: 100 }],
    hourlyRateAsOf: () => 46250, dieselRateAsOf: () => 1900, projectRateAsOf: () => ({ rate: 845000 }),
    operatorAllowanceForRows: () => 0,
    statsFor: () => ({ opsProfit: -1000, totalProfit: -1000, areaCleared: 1.5, pmsCost: 0, pmsUnexplained: 0, supervisorSundayAllowance: 0, dieselLogistics: 5000 }),
    stationBalance: 0,
    ...extra,
  };
}

test('diesel chain starts at the since date and skips repair diesel', () => {
  const d = buildDailyDashboard(ctx());
  const row = d.diesel.rows.find((r) => r.equipment === 'EMG-1');
  // 10 Oct: 220 in, 200 used → 20 left; 12 Oct: opening 20 + 100, used 100 → closing 20
  assert.equal(row.opening, 120);
  assert.equal(row.used, 100);
  assert.equal(row.closing, 20);
});

test('staff are ranked by cumulative productivity and late starts are labelled', () => {
  const d = buildDailyDashboard(ctx());
  assert.equal(d.staff.length, 2);
  assert.equal(lateLabel(10 * 60), '3h 00m');
  assert.equal(lateLabel(6 * 60), 'On time');
});

test('fueling request tops dozers up to the 250L target', () => {
  const d = buildDailyDashboard(ctx());
  assert.deepEqual(d.diesel.fuelingRequest, [{ equipment: 'EMG-1', closing: 20, need: 230 }]);
});

test('diesel sold on is kept out of the collected figure', () => {
  const d = buildDailyDashboard(ctx({
    fuelCreditCollections: [
      { date: '2026-10-12', fuelType: 'Diesel', litres: 400, unitPrice: 1900, notes: 'Station collection' },
      { date: '2026-10-12', fuelType: 'Diesel', litres: 600, unitPrice: 1900, notes: 'Sold to the CEO - not site diesel' },
    ],
  }));
  assert.equal(d.diesel.collectedAgo, 400);
  assert.equal(d.diesel.soldAgo, 600);
});

test('a dozer whose standard use exceeds the diesel it had never asks for more than the fill level', () => {
  const d = buildDailyDashboard(ctx({
    distributions: [{ project: P, date: '2026-10-12', equipment: 'EMG-1', litres: 60 }],
  }));
  assert.equal(d.diesel.fuelingRequest[0].need, 250);
});

test('the diesel, shortfall and cumulative-profit flags are not raised', () => {
  const d = buildDailyDashboard(ctx({
    fuelCreditCollections: [{ date: '2026-10-12', fuelType: 'Diesel', litres: 1000, unitPrice: 1900 }],
    distributions: [{ project: P, date: '2026-10-12', equipment: 'EMG-1', litres: 60 }],
    statsFor: () => ({ opsProfit: -1000, totalProfit: -1000, areaCleared: 1.5, pmsCost: 0, pmsUnexplained: 0, supervisorSundayAllowance: 0, dieselLogistics: 0 }),
  }));
  assert.ok(!d.flags.some((f) => /diesel|Cumulative/i.test(f.text)));
});
