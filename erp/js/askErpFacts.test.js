import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFacts, findEquipment } from './askErpFacts.js';
import { answerQuestion } from './askErp.js';

const TODAY = '2026-10-16';
const ctx = (extra = {}) => ({
  canViewStaffRecords: true,
  employees: [
    { id: 'EMP-26', name: 'Olumide Davidson', role: 'Chief Operations Officer', department: 'Administration', status: 'Active', dateHired: '2024-11-20', salary: 270000, email: 'o@x.com' },
    { id: 'EMP-1', name: 'Oki Christopher', role: 'General Manager/Site Manager', department: 'Administration', status: 'Active' },
    { id: 'EMP-11', name: 'Adebayo Tope', role: 'Operator/EMG007', department: 'Operations', status: 'Active' },
    { id: 'EMP-3', name: 'Amadi Vincent', role: 'Site Manager', department: 'Operations', status: 'Suspended' },
    { id: 'EMP-5', name: 'Okpowe Nathaniel', role: 'Site Manager', department: 'Operations', status: 'Suspended' },
    { id: 'EMP-9', name: 'Fakolujo Adewale', role: 'Mechanic 2', department: 'Maintenance', status: 'Disengaged' },
  ],
  projects: [{ name: 'Site A', status: 'Active' }, { name: 'Site B', status: 'Active' }, { name: 'Site C', status: 'Completed' }],
  inventory: [
    { name: 'EMG-004', category: 'Heavy Equipment', fleetStatus: 'Down', ownership: 'Company', currentProject: 'Site A' },
    { name: 'EMG-007', category: 'Heavy Equipment', fleetStatus: 'Active', ownership: 'Company', currentProject: 'Site A' },
    { name: 'CHI-001', category: 'Heavy Equipment', fleetStatus: 'Down', ownership: 'Partnership', ownerName: 'Chizon', currentProject: 'Site A' },
    { name: 'D8K Collins', category: 'Heavy Equipment', fleetStatus: 'Active', ownership: 'Rented', ownerName: 'Jokings', currentProject: 'Site A' },
    { name: 'Bike MB-004', category: 'Vehicles', fleetStatus: 'Active', ownership: 'Company' },
  ],
  operations: [
    { siteName: 'Site A', date: '2026-10-16', equipment: 'EMG-007', operatorId: 'EMP-11', supervisorId: 'EMP-1', hoursWorked: 8, quantity: 0.9 },
    { siteName: 'Site A', date: '2026-09-28', equipment: 'EMG-004', operatorId: 'EMP-11', hoursWorked: 3, quantity: 0.3 },
  ],
  maintenanceLogs: [
    { equipment: 'EMG-004', date: '2026-08-18', type: 'Breakdown', status: 'In Progress', description: 'Nozzle leaking' },
    { equipment: 'EMG-007', date: '2026-10-07', type: 'Repair', status: 'Completed', description: 'Priming pump' },
  ],
  invoices: [{ status: 'Paid' }, { status: 'Unpaid' }], suppliers: [], loans: [],
  ...extra,
});
const ask = (q, c = ctx()) => answerFacts(q, c, { today: TODAY });

test('who is: finds a person whichever way round the name is typed, without pay or contact details', () => {
  const r = ask('Who is Davidson Olumide?');
  assert.match(r.text, /Olumide Davidson \(EMP-26\) is the Chief Operations Officer in Administration/);
  assert.match(r.text, /hired 20 Nov 2024/);
  assert.ok(!/270|@x\.com/.test(r.text));
  assert.match(ask('what is Olumide salary').text, /do not give out pay/);
});

test('staff on suspension', () => {
  const r = ask('how many staff are on suspension');
  assert.match(r.text, /^2 suspended staff members/);
  assert.equal(r.table.rows.length, 2);
  assert.match(ask('how many staff do we have').text, /^6 staff members on record/);
  assert.match(ask('how many people work in maintenance').text, /^1 staff member in Maintenance/);
});

test('staff questions are only answered for accounts that can see staff records', () => {
  const c = ctx({ canViewStaffRecords: false });
  assert.match(ask('who is Olumide Davidson', c).text, /only Admin accounts/);
  assert.match(ask('how many staff are suspended', c).text, /only Admin accounts/);
  // fleet questions do not need it
  assert.match(ask('how many dozers are down', c).text, /^2 dozers/);
});

test('roles: who is the site manager lists the people in that role', () => {
  const r = ask('who are the site managers');
  assert.match(r.text, /^3 site managers/);
  assert.match(ask('who is the COO').text, /Olumide Davidson/);
});

test('sites: how many are active and which are working', () => {
  const r = ask('how many sites are active?');
  assert.match(r.text, /^3 projects \(sites\) on record: 2 active, 1 completed\. 1 site had Daily Operations reports in the last 7 days \(Site A\)/);
  assert.equal(r.table.rows.length, 3);
});

test('fleet: how many dozers are down, rented, active', () => {
  assert.match(ask('how many dozers are down').text, /^2 dozers down or under maintenance of 4 in the fleet \(CHI-001, EMG-004\)/);
  assert.match(ask('how many dozers are rented?').text, /^1 dozer rented/);
  assert.match(ask('how many dozers are active').text, /^2 dozers active/);
  assert.match(ask('how many vehicles do we have').text, /^1 vehicle/);
});

test('since when has a dozer been down: uses the open breakdown record', () => {
  const r = ask('since when has EMG-004 been down');
  assert.match(r.text, /Down since about 18 Aug 2026 \(59 days\)/);
  assert.match(r.text, /Last worked 28 Sep 2026/);
  assert.match(r.notes[0], /not a status history/);
});

test('since when has a dozer been down: without a breakdown record it counts from the day after its last report', () => {
  const c = ctx({ maintenanceLogs: [] });
  assert.match(ask('how long has 004 been down', c).text, /Down since about 29 Sep 2026/);
});

test('"007" is read as EMG-007 and a working dozer is reported as not down', () => {
  assert.deepEqual(findEquipment('since when has 007 been down', ctx()).map((i) => i.name), ['EMG-007']);
  const r = ask('since when has 007 been down');
  assert.match(r.text, /EMG-007 is Active/);
  assert.match(r.text, /It is not down/);
  assert.deepEqual(findEquipment('how many hectares on 15 Oct', ctx()), []);
});

test('counts of other records', () => {
  assert.match(ask('how many invoices are unpaid').text, /^1 invoice unpaid/);
  assert.match(ask('how many suppliers').text, /no suppliers recorded/);
  assert.match(ask('how many loans').text, /no loans recorded/);
});

test('operations questions are left to the operations engine', () => {
  ['who started late on 15 Oct?', 'what was the profit yesterday?', 'how many hectares did Tope clear this week', 'how much diesel is needed tomorrow?', 'what requests are still pending?', 'compare the supervisors'].forEach((q) => assert.equal(ask(q), null, q));
});

test('answerQuestion routes these through the facts first', () => {
  const full = { ...ctx(), fundRequests: [], expenses: [], dieselStockCounts: [], fuelCreditCollections: [], fuelCreditPayments: [], distributions: [], hourlyRateAsOf: () => 0, dieselRateAsOf: () => 0, projectRateAsOf: () => ({ rate: 0 }), operatorAllowanceForRows: () => 0, statsFor: () => ({}) };
  const r = answerQuestion('How many staff are on suspension?', full, { today: TODAY, project: 'Site A' });
  assert.match(r.text, /^2 suspended staff members/);
});


test('oil: last oil purchase per machine, matched by operator name or machine code, with waiting requests', () => {
  const c = ctx({
    employees: [
      { id: 'EMP-11', name: 'Adebayo Tope', role: 'Operator/EMG007', status: 'Active' },
      { id: 'EMP-20', name: 'Jessie Daniel Jenom', role: 'Operator/EMG006', status: 'Active' },
    ],
    inventory: [
      { name: 'EMG-006', category: 'Heavy Equipment', fleetStatus: 'Active', ownership: 'Company' },
      { name: 'EMG-007', category: 'Heavy Equipment', fleetStatus: 'Active', ownership: 'Company' },
    ],
    operations: [
      { equipment: 'EMG-007', operatorId: 'EMP-11', date: '2026-10-15', hoursWorked: 8 },
      { equipment: 'EMG-006', operatorId: 'EMP-20', date: '2026-10-15', hoursWorked: 6 },
    ],
    maintenanceLogs: [{ id: 'MNT-171', equipment: 'EMG-006', date: '2026-10-12', type: 'Service', status: 'Completed', description: 'Engine oil purchase (1 keg)', cost: 100000 }],
    fundRequests: [
      { id: 'FR-85', date: '2026-10-13', status: 'Paid', description: 'Oil purchase for Jassie', items: [{ description: 'Oil purchase for Jassie', amount: 100000 }] },
      { id: 'FR-78', date: '2026-10-11', status: 'Pending', description: 'Oil purchase for Tope', items: [{ description: 'Oil purchase for Tope', amount: 100000 }] },
      { id: 'FR-9', date: '2026-10-14', status: 'Paid', description: 'Oil seal for bike', items: [{ description: 'Oil seal', amount: 7500 }] },
    ],
    expenses: [],
  });
  const r = ask('When did we last give Tope and Jessy oil?', c);
  assert.match(r.text, /EMG-006 \(Jessie\): last oil 13 Oct 2026, 3 days ago/);
  assert.match(r.text, /EMG-007 \(Adebayo\): no oil purchase on record/);
  assert.equal(r.table.rows.length, 2);
  assert.match(r.table.rows.find((x) => x[0].startsWith('EMG-007'))[5], /FR-78/);
  assert.ok(!JSON.stringify(r.table).includes('Oil seal'));
});

test('oil: a servicing record that mentions an oil filter still counts, and "Oil and Gas" supplier names do not', () => {
  const c = ctx({
    employees: [{ id: 'EMP-11', name: 'Adebayo Tope', role: 'Operator/EMG007', status: 'Active' }, { id: 'EMP-12', name: 'Paul Joshua', role: 'Operator/EMG008', status: 'Active' }],
    inventory: [{ name: 'EMG-007', category: 'Heavy Equipment', fleetStatus: 'Active', ownership: 'Company' }, { name: 'EMG-008', category: 'Heavy Equipment', fleetStatus: 'Active', ownership: 'Company' }],
    operations: [{ equipment: 'EMG-007', operatorId: 'EMP-11', date: '2026-10-15', hoursWorked: 8 }, { equipment: 'EMG-008', operatorId: 'EMP-12', date: '2026-10-15', hoursWorked: 8 }],
    maintenanceLogs: [{ id: 'MNT-161', equipment: 'EMG-007', date: '2026-09-21', status: 'Completed', description: '15-day servicing: oil filter x2, engine oil, air filter', cost: 188000 }],
    fundRequests: [{ id: 'FR-1', date: '2026-10-10', status: 'Paid', description: 'Diesel from Midejab Oil And Gas for Tope', items: [{ description: 'Diesel', amount: 456000 }] }],
    expenses: [],
  });
  const r = ask('when did we last give Tope oil', c);
  assert.match(r.text, /EMG-007 \(Adebayo\): last oil 21 Sep 2026/);
  assert.equal(r.table.rows.length, 1, 'only the machine asked about');
});
