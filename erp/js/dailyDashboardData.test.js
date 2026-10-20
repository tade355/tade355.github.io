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

test('the downloadable dashboard is a complete report with all six sections', async () => {
  const { buildDashboardHtml, dashboardFileName } = await import('./dashboardHtml.js');
  const full = { provisionalRevenue: 1000, dieselCost: 1, logisticsCost: 1, operatorAllowanceCost: 1, supervisorSundayAllowance: 0, dozerOwned: 1, dozerRented: 0, dozerPartnership: 0, pmsTacoma: 0, pmsUnexplained: 0, otherCost: 0, totalCost: 5, opsProfit: 995, mcRecovered: 1, maintenanceIncurred: 0, netMcRecovered: 1, totalProfit: 996, areaCleared: 1.5, pmsCost: 0, dieselLogistics: 1 };
  const d = buildDailyDashboard(ctx({ statsFor: () => full }));
  d.diesel.fuelingState = { rows: d.diesel.fuelingRequest, onGround: 0 };
  const html = buildDashboardHtml(d, { fueling: d.diesel.fuelingState });
  assert.ok(html.startsWith('<!doctype html>'));
  ['operations', 'diesel', 'fleet', 'requests', 'profitability', 'staff'].forEach((id) => assert.ok(html.includes(`<section id="${id}">`), id));
  assert.ok(html.includes('Prepared by ERP Software'));
  assert.ok(!/undefined|NaN(?!\()/.test(html.replace(/isNaN/g, '')), 'no undefined/NaN values in the markup');
  assert.equal(dashboardFileName('2026-10-15'), 'Daily_Dashboard_15Oct2026.html');
});

test('diesel on ground rolls the last stock count forward with later collections and distributions', () => {
  const d = buildDailyDashboard(ctx({
    dieselStockCounts: [{ date: '2026-10-11', countedLitres: 300 }],
    fuelCreditCollections: [
      { date: '2026-10-11', fuelType: 'Diesel', litres: 999, unitPrice: 1900 }, // inside the count already
      { date: '2026-10-12', fuelType: 'Diesel', litres: 1000, unitPrice: 1900 },
      { date: '2026-10-12', fuelType: 'Diesel', litres: 500, unitPrice: 1900, notes: 'Sold to the CEO' }, // not site diesel
    ],
    distributions: [{ project: P, date: '2026-10-12', equipment: 'EMG-1', litres: 240 }],
  }));
  assert.equal(d.diesel.onGround, 300 + 1000 - 240);
  assert.equal(d.diesel.onGroundBase, 300);
  assert.equal(d.diesel.onGroundIn, 1000);
  assert.equal(d.diesel.onGroundOut, 240);
});

test('resumption and productivity trends cover only the last 3 days, while the ranking figure covers the whole period', () => {
  const d = buildDailyDashboard(ctx({
    date: '2026-10-13',
    operations: [
      op({ date: '2026-10-10', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 8, quantity: 1.3, fuelUsed: 200, timeResumed: '09:00', timeClosed: '17:00' }),
      op({ date: '2026-10-12', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 8, quantity: 0.65, fuelUsed: 200, timeResumed: '10:00', timeClosed: '18:00' }),
      op({ date: '2026-10-13', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 8, quantity: 1.3, fuelUsed: 200, timeResumed: '08:00', timeClosed: '16:00' }),
    ],
  }));
  const p = d.staff.find((s) => s.id === 'E1');
  assert.deepEqual(p.days, ['2026-10-11', '2026-10-12', '2026-10-13']); // 10 Oct has dropped out
  assert.equal(p.resumption.length, 3);
  assert.deepEqual(p.resumption.slice(1), ['10:00', '8:00']);
  assert.equal(p.resumption[0], '—');
  assert.equal(p.productivity.length, 3);
  assert.equal(Math.round(p.cumulative), 83); // (1.3 + 0.65 + 1.3) / 3.9 over all three worked days
});

test('the trend window never starts before the since date', () => {
  const d = buildDailyDashboard(ctx({ date: '2026-10-11', since: '2026-10-10' }));
  assert.deepEqual(d.staff[0].days, ['2026-10-10', '2026-10-11']);
});

test('a dozer given tank diesel today joins the fueling request even if it has not worked since the start date', () => {
  const d = buildDailyDashboard(ctx({
    inventory: [
      { name: 'EMG-1', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active', currentProject: P },
      { name: 'EMG-4', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active', currentProject: P },
      { name: 'EMG-6', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active', currentProject: P },
    ],
    distributions: [
      { project: P, date: '2026-10-12', equipment: 'EMG-1', litres: 100 },
      { project: P, date: '2026-10-12', equipment: 'EMG-4', litres: 60 },
      { project: P, date: '2026-10-12', equipment: 'EMG-6', litres: 60, notes: 'For fixing track, not tank fuel' },
    ],
  }));
  const names = d.diesel.fuelingRequest.map((r) => r.equipment);
  assert.ok(names.includes('EMG-4'));
  assert.ok(!names.includes('EMG-6'));
  assert.equal(d.diesel.fuelingRequest.find((r) => r.equipment === 'EMG-4').need, 190);
});

test('a reported closing that differs from the calculated one is flagged and drives the fueling request', () => {
  const base = ctx();
  const d = buildDailyDashboard(ctx({
    operations: base.operations.map((o) => (o.date === '2026-10-12' ? { ...o, closingDiesel: 10 } : o)),
  }));
  const row = d.diesel.rows.find((r) => r.equipment === 'EMG-1');
  assert.equal(row.status, 'Closing restated');
  assert.equal(row.closing, 20);
  assert.ok(d.flags.some((f) => /reported 10 L vs calculated 20 L/.test(f.text)));
  assert.equal(d.diesel.fuelingRequest.find((r) => r.equipment === 'EMG-1').closing, 10);
});

test('diesel against work is reported per dozer for the period', () => {
  const d = buildDailyDashboard(ctx({}));
  assert.ok(Array.isArray(d.diesel.efficiency));
  assert.ok(Math.abs(d.diesel.normLitresPerHa - 153.846) < 0.01);
  d.diesel.efficiency.forEach((r) => assert.ok('litresPerHa' in r && 'high' in r));
});
