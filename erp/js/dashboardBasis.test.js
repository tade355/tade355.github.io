import test from 'node:test';
import assert from 'node:assert/strict';
import {
  onDashboardBasis, dieselLogisticsBasis, supervisorSundayAllowanceBasis,
  pmsBasis, maintenanceBasis, machineRecoveredBasis,
} from './dashboardBasis.js';

test('dashboard basis starts on 10 Oct 2026', () => {
  assert.equal(onDashboardBasis('2026-10-09'), false);
  assert.equal(onDashboardBasis('2026-10-10'), true);
});

test('diesel logistics: ₦50/L, Partnership dozers excluded', () => {
  const owners = new Map([['EMG-007', 'Company'], ['D8K Collins', 'Rented'], ['CHI-001', 'Partnership']]);
  const d = [
    { date: '2026-10-13', equipment: 'EMG-007', litres: 200 },
    { date: '2026-10-13', equipment: 'D8K Collins', litres: 180 },
    { date: '2026-10-13', equipment: 'CHI-001', litres: 90 },
    { date: '2026-10-09', equipment: 'EMG-007', litres: 100 }, // before the basis date
  ];
  assert.equal(dieselLogisticsBasis(d, owners), 380 * 50);
});

test('supervisor Sunday allowance: ₦20,000 per supervisor per Sunday', () => {
  const rows = [
    { date: '2026-10-11', supervisorId: 'EMP-1', hoursWorked: 8 },
    { date: '2026-10-11', supervisorId: 'EMP-1', hoursWorked: 8 },
    { date: '2026-10-12', supervisorId: 'EMP-1', hoursWorked: 8 },
  ];
  assert.equal(supervisorSundayAllowanceBasis(rows), 20000);
});

test('PMS is split into Tacoma, unexplained and maintenance by its notes', () => {
  const c = [
    { fuelType: 'PMS', date: '2026-10-13', litres: 20, unitPrice: 1385, notes: 'Tacoma' },
    { fuelType: 'PMS', date: '2026-10-13', litres: 5, unitPrice: 1385, notes: 'Engine washing (maintenance)' },
    { fuelType: 'PMS', date: '2026-10-13', litres: 5, unitPrice: 1385, notes: 'Unexplained' },
    { fuelType: 'Diesel', date: '2026-10-13', litres: 900, unitPrice: 1900, notes: null },
  ];
  const p = pmsBasis(c);
  assert.equal(p.tacoma, 27700);
  assert.equal(p.maintenance, 6925);
  assert.equal(p.unexplained, 6925);
});

test('maintenance incurred counts only Approved/Paid Maintenance requests, Maintenance expenses and maintenance PMS', () => {
  const total = (r) => r.items.reduce((s, i) => s + i.amount, 0);
  const requests = [
    { date: '2026-10-11', status: 'Paid', costHead: 'Maintenance', items: [{ amount: 50000 }] },
    { date: '2026-10-11', status: 'Approved', costHead: 'Maintenance', items: [{ amount: 336000 }] },
    { date: '2026-10-11', status: 'Pending', costHead: 'Maintenance', items: [{ amount: 1650000 }] },
    { date: '2026-10-11', status: 'Paid', costHead: 'Logistics', items: [{ amount: 30000 }] },
  ];
  const expenses = [{ date: '2026-10-10', category: 'Maintenance', amount: 1000000 }];
  assert.equal(maintenanceBasis({ fundRequests: requests, expenses, fundRequestTotal: total, pms: { maintenance: 6925 } }), 50000 + 336000 + 1000000 + 6925);
});

test('machine recovered: Company dozers only, deal days excluded', () => {
  const owners = new Map([['EMG-007', 'Company'], ['D8K Collins', 'Rented']]);
  const rate = () => 46250;
  const rows = [
    { date: '2026-10-15', equipment: 'EMG-007', hoursWorked: 7 },
    { date: '2026-10-15', equipment: 'D8K Collins', hoursWorked: 8 },
    { date: '2026-10-11', equipment: 'EMG-007', hoursWorked: 8, workType: 'Business' },
  ];
  assert.equal(machineRecoveredBasis(rows, owners, rate), 7 * 46250);
});

test('a deal day on a hired dozer costs the amount paid, not hours x rate', async () => {
  const { dozerCostFor } = await import('./dashboardBasis.js');
  const deal = { hoursWorked: 10, workType: 'Business', businessAmount: 220000 };
  assert.equal(dozerCostFor(deal, 'Rented', 50000), 220000);
  assert.equal(dozerCostFor({ ...deal, workType: 'Office' }, 'Rented', 50000), 500000);
  assert.equal(dozerCostFor(deal, 'Company', 46250), 462500);
  assert.equal(dozerCostFor({ hoursWorked: 4, operationType: 'Trekking' }, 'Company', 46250), 0);
});
