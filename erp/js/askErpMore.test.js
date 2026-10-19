import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from './askErp.js';

const P = 'Site A';
const op = (o) => ({ siteName: P, operationType: 'Phase 1', workType: null, quantity: 0, fuelUsed: 0, ...o });
const baseCtx = (extra = {}) => ({
  project: P,
  operations: [
    op({ date: '2026-10-14', equipment: 'EMG-004', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 8, quantity: 1.0, fuelUsed: 200 }),
    op({ date: '2026-10-15', equipment: 'EMG-004', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 4, quantity: 0.4, fuelUsed: 100 }),
    op({ date: '2026-10-15', equipment: 'EMG-006', operatorId: 'E2', supervisorId: 'S1', hoursWorked: 8, quantity: 1.3, fuelUsed: 200 }),
  ],
  inventory: [
    { name: 'EMG-004', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active' },
    { name: 'EMG-006', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Down' },
    { name: 'EMG-007', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active' },
  ],
  employees: [{ id: 'E1', name: 'Adebayo Tope' }, { id: 'E2', name: 'Paul Joshua' }, { id: 'S1', name: 'Oki Christopher' }],
  distributions: [{ date: '2026-10-14', equipment: 'EMG-004', litres: 250, project: P }],
  fuelCreditCollections: [
    { date: '2026-10-14', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 500, unitPrice: 1900, notes: '' },
    { date: '2026-10-15', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 100, unitPrice: 1900, notes: 'Sold to the CEO' },
  ],
  fuelCreditPayments: [],
  fundRequests: [
    { id: 'FR-1', date: '2026-10-10', description: 'Oil for Tope', status: 'Pending', costHead: 'Maintenance', submittedBy: 'S1', items: [{ description: 'Engine oil', amount: 100000, accountName: 'Abdulsalam Ventures' }] },
    { id: 'FR-2', date: '2026-10-12', description: 'Transport for staff', status: 'Paid', costHead: 'Logistics', submittedBy: 'S1', items: [{ description: 'Bus', amount: 40000, accountName: 'Yusuf Bus Co' }] },
  ],
  expenses: [],
  maintenanceLogs: [{ equipment: 'EMG-006', date: '2026-10-13', type: 'Breakdown', status: 'In Progress', description: 'Hydraulic hose', cost: 30000 }],
  dieselStockCounts: [{ date: '2026-10-14', countedLitres: 120, notes: '' }],
  invoices: [{ id: 'INV-2024-1', date: '2026-10-01', status: 'Unpaid', customerId: 'C1', project: 'REX Forestry Project - Kangidi', items: [{ description: 'Clearing', qty: 2, price: 50000 }] }],
  invoicePayments: [], fuelingVouchers: [], noticeBoardPosts: [{ title: 'Safety briefing', date: '2026-10-12', body: 'All staff attend' }], trainingPrograms: [],
  leaveRequests: [], customers: [{ id: 'C1', name: 'Rex Forestry' }], suppliers: [], loans: [], purchaseOrders: [], assets: [],
  projects: [{ name: P, status: 'Active' }],
  canViewStaffRecords: true,
  hourlyRateAsOf: () => 46250, dieselRateAsOf: () => 1900, projectRateAsOf: () => ({ rate: 845000 }), operatorAllowanceForRows: () => 0,
  statsFor: () => ({ opsProfit: 0, totalProfit: 0, areaCleared: 2.7, provisionalRevenue: 0, totalCost: 0, maintenanceIncurred: 0, netMcRecovered: 0, mcRecovered: 0, pmsCost: 0, pmsUnexplained: 0, supervisorSundayAllowance: 0, dieselLogistics: 0, fuelUsed: 500 }),
  stationBalance: 0,
  ...extra,
});
const ask = (q, extra) => answerQuestion(q, baseCtx(extra), { today: '2026-10-16', project: P });

test('company policies are answered from the written rules', () => {
  assert.match(ask('What is the Sunday bonus policy?').text, /3 or more dozers.*₦20,000/);
  assert.match(ask('How much is an extra hour worth?').text, /₦10,000 for every hour worked beyond 8/);
  assert.match(ask('How much diesel does a dozer use per hour?').text, /25 litres for every hour/);
  assert.match(ask('How do I submit an end-of-day report?').text, /one message per dozer/);
  assert.match(ask('How do I raise a fund request?').text, /Pending.*Approves.*Paid/);
  assert.match(ask('What is the annual leave policy?').text, /not written down in the ERP/);
});

test('"how much diesel is on site" is a stock question, not the diesel-norm policy', () => {
  assert.match(ask('How much diesel is on site?').text, /Diesel on site is about 120 L/);
});

test('navigation questions point to the page and tab', () => {
  assert.match(ask('Where do I find the diesel stock count?').text, /Diesel Management/);
});

test('fund requests: one by id, and the pending list', () => {
  const one = ask('What is the status of FR-1?');
  assert.match(one.text, /FR-1: Oil for Tope\. Pending, ₦100,000/);
  assert.match(ask('What requests are pending?').text, /1 pending request/);
  assert.match(ask('What is the status of FR-999?').text, /cannot find request FR-999/);
});

test('payments are looked up by payee and say so when there are none', () => {
  assert.match(ask('When did we last pay Abdulsalam?').text, /₦100,000|no payment|1 payment/i);
  assert.match(ask('When did we last pay Yusuf?').text, /₦40,000 on 12 Oct 2026/);
  assert.match(ask('When did we last pay Oki?').text, /no payment on record for "oki"/);
});

test('spending can be asked by category', () => {
  assert.match(ask('How much did we spend on logistics?').text, /Logistics.*₦40,000/);
});

test('invoices: unpaid list and totals', () => {
  assert.match(ask('Which invoices are unpaid?').text, /1 invoice\(s\) are not fully paid; customers owe ₦100,000/);
  assert.match(ask('Which invoices are unpaid?', { invoices: [] }).text, /no invoices/);
});

test('diesel history: collected, sold and supplied to a person\'s machine', () => {
  const c = ask('How much diesel was collected since 10 Oct?');
  assert.match(c.text, /600 L of diesel collected/);
  assert.match(c.text, /100 L of it sold to the CEO and 500 L for the farm/);
  const s = ask('How much diesel has Tope received since 10 Oct?');
  assert.match(s.text, /250 L of diesel given to 1 machine/);
  assert.match(ask('When was the last diesel stock count?').text, /120 L on 14 Oct 2026/);
});

test('machine history: cost to maintain and breakdowns', () => {
  assert.match(ask('How much has EMG-006 cost to maintain?').text, /1 maintenance record\(s\) costing ₦30,000.*1 still open/);
  assert.match(ask('Which machine has cost the most to maintain?').text, /EMG-006 has cost the most/);
});

test('who did not work, the day summary and the attention list', () => {
  assert.match(ask('Which dozers did not work yesterday?').text, /did not report/);
  const b = ask('Give me a summary of yesterday');
  assert.match(b.text, /2 machine\(s\) reported, 1\.7 ha cleared/);
  assert.doesNotMatch(b.text, /NaN/);
  assert.match(ask('What needs my attention?').text, /EMG-006 \(Down\)/);
});

test('what a person or dozer did, and how many days', () => {
  assert.match(ask('What did Tope do yesterday?').text, /Adebayo Tope, 15 Oct 2026: worked 1 day\(s\), 4\.0 hours/);
  assert.match(ask('How many days did EMG-004 work this month?').text, /worked 2 day\(s\), 12\.0 hours and 1\.4 ha/);
  assert.match(ask('What did Tope do on 1 Oct?').text, /No work by Adebayo Tope/);
});

test('notices, leave and training answer from their records', () => {
  assert.match(ask('Any notices?').text, /Safety briefing/);
  assert.match(ask('Who is on leave today?').text, /No leave requests/);
});

test('missing dates in a record do not break an answer', () => {
  assert.doesNotThrow(() => ask('Which invoices are unpaid?', { invoices: [{ id: 'INV-2024-2', status: 'Unpaid', items: [] }] }));
});

test('Staff accounts get no money figures but still get operations answers', () => {
  const staff = { tier: 'Staff' };
  assert.match(ask('Which invoices are unpaid?', staff).text, /only shown to Admin and Accounts/);
  assert.match(ask('How much did we spend on logistics?', staff).text, /only shown to Admin and Accounts/);
  assert.match(ask('When did we last pay Yusuf?', staff).text, /only shown to Admin and Accounts/);
  assert.match(ask('How much diesel is on site?', staff).text, /120 L/);
  assert.doesNotMatch(ask('Give me a summary of yesterday', staff).text, /Money:/);
  assert.match(ask('What is the Sunday bonus policy?', staff).text, /20,000/);
});

test('questions outside the data are still declined', () => {
  assert.match(ask('what is the weather in lagos').text, /could not match/);
});
