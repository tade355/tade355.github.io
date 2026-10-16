import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport, toDateISO, toTime, toNumber, resolvePerson, resolveSite, resolveDozer, sheetFromAoa } from './importPlan.js';

const SITE = 'REX Forestry Project - Kangidi';
const ctx = (extra = {}) => ({
  today: '2026-10-16',
  projects: [{ name: SITE }, { name: 'REX Forestry Project - Kajola' }, { name: 'Enugu Palm Project' }],
  inventory: [
    { name: 'EMG-007', category: 'Heavy Equipment', ownership: 'Company' },
    { name: 'EMG-008', category: 'Heavy Equipment', ownership: 'Company' },
    { name: 'D8K Collins', category: 'Heavy Equipment', ownership: 'Rented' },
    { name: 'CHI-001', category: 'Heavy Equipment', ownership: 'Partnership' },
  ],
  employees: [
    { id: 'EMP-1', name: 'Oki Christopher', role: 'General Manager/Site Manager', status: 'Active' },
    { id: 'EMP-11', name: 'Adebayo Tope', role: 'Operator/EMG007', status: 'Active' },
    { id: 'EMP-12', name: 'Paul Joshua', role: 'Operator/EMG008', status: 'Active' },
    { id: 'EMP-37', name: 'Joshua (Kangidi)', role: 'Operator (Unassigned)', status: 'Active' },
    { id: 'EMP-20', name: 'Jessie Daniel Jenom', role: 'Operator/EMG006', status: 'Active' },
    { id: 'EMP-40', name: 'Ewanchia Collins', role: '3rd-Party Operator/D8K Collins', status: 'Active' },
  ],
  operations: [{ id: 'OPS-1', date: '2026-10-15', equipment: 'EMG-007', siteName: SITE }],
  distributions: [{ id: 'DSD-1', date: '2026-10-15', equipment: 'EMG-007', project: SITE, litres: 180 }],
  fuelCreditCollections: [{ id: 'FCC-1', date: '2026-10-15', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 600, unitPrice: 1900 }, { id: 'FCC-2', date: '2026-10-14', station: 'Midejab Ltd', fuelType: 'PMS', litres: 15, unitPrice: 1385 }],
  fuelCreditPayments: [{ id: 'FCP-1', date: '2026-10-10', station: 'Midejab Ltd', amount: 8500000 }],
  fundRequests: [
    { id: 'FR-90', date: '2026-10-14', project: SITE, description: 'Injector fix', status: 'Pending', items: [{ amount: 120000 }] },
    { id: 'FR-91', date: '2026-10-14', project: SITE, description: 'Waybill', status: 'Paid', items: [{ amount: 15000 }] },
    { id: 'FR-92', date: '2026-10-14', project: SITE, description: 'Bad', status: 'Rejected', items: [{ amount: 1 }] },
  ],
  dieselStockCounts: [{ id: 'SC-1', date: '2026-10-15', countedLitres: 300 }],
  dieselRateAsOf: () => 1900,
  ...extra,
});
const sheet = (rows) => ({ rows: rows.map((cells, i) => ({ rowNumber: i + 2, cells })) });
const opRow = (o = {}) => ({ date: '16/10/2026', site: 'Kangidi', dozer: '007', operator: 'Tope', supervisor: 'Christopher', 'start time': '7:50 AM', 'stop time': '4:00 PM', 'hours worked': 8, hectares: 0.9, block: 'G6', 'diesel supplied l': 240, ...o });

test('dates, times and numbers are read the way Excel stores them', () => {
  assert.equal(toDateISO(46311), '2026-10-16'); // Excel day number
  assert.equal(toDateISO('16/10/2026'), '2026-10-16');
  assert.equal(toDateISO('16 Oct 2026'), '2026-10-16');
  assert.equal(toDateISO('2026-10-16'), '2026-10-16');
  assert.equal(toDateISO('31/02/2026'), undefined);
  assert.equal(toDateISO(''), null);
  assert.equal(toTime(0.5), '12:00');
  assert.equal(toTime(7.8333 / 24), '07:50');
  assert.equal(toTime('7:50 am'), '07:50');
  assert.equal(toTime('4pm'), '16:00');
  assert.equal(toTime('2.30 pm'), '14:30');
  assert.equal(toTime('25:00'), undefined);
  assert.equal(toNumber('₦1,200,000'), 1200000);
  assert.equal(toNumber('240 L'), 240);
  assert.equal(toNumber('abc'), undefined);
});

test('sites, dozers and people are matched from short names', () => {
  const c = ctx();
  assert.equal(resolveSite('Kangidi', c).value, SITE);
  assert.match(resolveSite('REX Forestry', c).error, /more than one/);
  assert.match(resolveSite('Nowhere', c).error, /not a project/);
  assert.equal(resolveDozer('007', c).value, 'EMG-007');
  assert.equal(resolveDozer('emg 8', c).value, 'EMG-008');
  assert.equal(resolveDozer('Collins', c).value, 'D8K Collins');
  assert.match(resolveDozer('EMG-099', c).error, /not in the fleet/);
  assert.equal(resolvePerson('Tope', c).value, 'EMP-11');
  assert.equal(resolvePerson('Jessy', c).value, 'EMP-20');
  assert.equal(resolvePerson('Christopher', c).value, 'EMP-1');
  assert.equal(resolvePerson('EMP-40', c).value, 'EMP-40');
  // "Joshua" fits two people: the operator whose role names the dozer wins
  assert.equal(resolvePerson('Joshua', c, { dozer: 'EMG-008', kind: 'operator' }).value, 'EMP-12');
  assert.match(resolvePerson('Joshua', c).error, /use the staff ID/);
  assert.equal(resolvePerson('', c).value, null);
});

test('a daily report becomes an operation with diesel used worked out by the standard rule', () => {
  const plan = planImport({ 'Daily Reports': sheet([opRow()]) }, ctx());
  const r = plan.sheets[0].rows[0];
  assert.equal(r.action, 'add');
  assert.equal(r.collection, 'operations');
  assert.deepEqual({ ...r.record, notes: undefined }, {
    date: '2026-10-16', siteName: SITE, equipment: 'EMG-007', operatorId: 'EMP-11', supervisorId: 'EMP-1', hoursWorked: 8, quantity: 0.9, fuelUsed: 200,
    status: 'Completed', operationType: 'Phase 1', workType: null, businessAmount: null, timeResumed: '07:50', timeClosed: '16:00', blockNumber: 'G6',
    dieselSupplied: 240, openingDiesel: null, closingDiesel: null, notes: undefined, attachments: [],
  });
  assert.match(r.record.notes, /Operator: Adebayo Tope\. Supervisor: Oki Christopher\./);
  // 9 hrs: 8 x 25 + 1 x 20
  assert.equal(planImport({ 'Daily Reports': sheet([opRow({ 'hours worked': 9, dozer: 'EMG-008', operator: 'Joshua' })]) }, ctx()).sheets[0].rows[0].record.fuelUsed, 220);
  // rented dozers are Office days by default
  assert.equal(planImport({ 'Daily Reports': sheet([opRow({ dozer: 'Collins', operator: 'Collins' })]) }, ctx()).sheets[0].rows[0].record.workType, 'Office');
});

test('Excel cells (day numbers and time fractions) work in a report', () => {
  const r = planImport({ 'Daily Reports': sheet([opRow({ date: 46311, 'start time': 0.3263888889, 'stop time': 0.6666666667 })]) }, ctx()).sheets[0].rows[0];
  assert.equal(r.record.date, '2026-10-16');
  assert.equal(r.record.timeResumed, '07:50');
  assert.equal(r.record.timeClosed, '16:00');
});

test('bad rows are rejected with a plain reason and good rows still go ahead', () => {
  const plan = planImport({ 'Daily Reports': sheet([opRow(), opRow({ dozer: 'EMG-099' }), opRow({ date: '17/10/2026', dozer: 'EMG-008' }), opRow({ hectares: 'lots', dozer: 'CHI-001' }), opRow({ 'start time': '25:00', dozer: 'D8K Collins', operator: 'Collins' })]) }, ctx());
  const [a, b, c, d, e] = plan.sheets[0].rows;
  assert.equal(a.action, 'add');
  assert.match(b.messages[0], /not in the fleet/);
  assert.match(c.messages[0], /in the future/);
  assert.match(d.messages[0], /not a number/);
  assert.match(e.messages[0], /not a time/);
  assert.deepEqual(plan.counts, { add: 1, update: 0, skip: 0, error: 4 });
});

test('reports already in the ERP are skipped, or replaced when asked, and repeats in the file are caught', () => {
  const dup = opRow({ date: '15/10/2026' });
  assert.equal(planImport({ 'Daily Reports': sheet([dup]) }, ctx()).sheets[0].rows[0].action, 'skip');
  const rep = planImport({ 'Daily Reports': sheet([dup]) }, ctx(), { replace: true }).sheets[0].rows[0];
  assert.equal(rep.action, 'update');
  assert.equal(rep.id, 'OPS-1');
  const twice = planImport({ 'Daily Reports': sheet([opRow(), opRow()]) }, ctx()).sheets[0].rows;
  assert.deepEqual(twice.map((r) => r.action), ['add', 'skip']);
});

test('the grey example row and unknown sheets are ignored', () => {
  const plan = planImport({ Instructions: sheet([{ a: 'read me' }]), 'Daily Reports': sheet([opRow({ date: 'e.g. 16/10/2026' }), opRow()]), Scratch: sheet([{ a: 1 }]) }, ctx());
  assert.equal(plan.sheets[0].rows.length, 1);
  assert.deepEqual(plan.unknownSheets, ['Scratch']);
});

test('diesel supply, station collections, station payments and stock counts', () => {
  const plan = planImport({
    'Diesel Supply': sheet([{ date: '16/10/2026', site: 'Kangidi', dozer: 'EMG-007', litres: 240 }, { date: '15/10/2026', site: 'Kangidi', dozer: 'EMG-007', litres: 180 }]),
    'Station Collections': sheet([{ date: '16/10/2026', station: '', fuel: 'AGO', litres: 1690 }, { date: '16/10/2026', station: 'Midejab', fuel: 'PMS', litres: 10 }, { date: '16/10/2026', fuel: 'Kerosene', litres: 5 }]),
    'Station Payments': sheet([{ date: '16/10/2026', station: 'Midejab', amount: 1000000, reference: 'X1' }, { date: '10/10/2026', station: 'Midejab', amount: 8500000 }]),
    'Stock Count': sheet([{ date: '16/10/2026', 'litres on ground': 1110 }, { date: '15/10/2026', 'litres on ground': 300 }]),
  }, ctx());
  const by = Object.fromEntries(plan.sheets.map((s) => [s.key, s.rows]));
  assert.deepEqual(by.distributions.map((r) => r.action), ['add', 'skip']);
  assert.equal(by.collections[0].record.unitPrice, 1900); // diesel default price
  assert.equal(by.collections[0].record.station, 'Midejab Ltd'); // only one station known
  assert.equal(by.collections[0].record.fuelType, 'Diesel');
  assert.equal(by.collections[1].record.unitPrice, 1385); // last PMS price
  assert.match(by.collections[2].messages[0], /Diesel \(AGO\) or PMS/);
  assert.deepEqual(by.stationPayments.map((r) => r.action), ['add', 'skip']);
  assert.deepEqual(by.stockCounts.map((r) => r.action), ['add', 'skip']);
});

test('fund requests: rows with the same Request Ref become one request with several lines', () => {
  const plan = planImport({
    'Fund Requests': sheet([
      { 'request ref': 'A', date: '16/10/2026', site: 'Kangidi', 'submitted by': 'Christopher', category: 'logistics', 'request description': 'Bike and diesel transport', item: 'Bike', amount: 15000, bank: 'Opay', status: '' },
      { 'request ref': 'A', item: 'Diesel transport 24 kegs', amount: 36000 },
      { 'request ref': 'B', date: '16/10/2026', site: 'Kangidi', category: 'Rubbish', 'request description': 'Bad category', amount: 5 },
    ]),
  }, ctx());
  const [a, b] = plan.sheets[0].rows;
  assert.equal(a.action, 'add');
  assert.equal(a.record.items.length, 2);
  assert.equal(a.record.costHead, 'Logistics');
  assert.equal(a.record.status, 'Pending');
  assert.equal(a.record.submittedBy, 'EMP-1');
  assert.deepEqual(a.rowNumbers, [2, 3]);
  assert.equal(b.action, 'error');
  assert.match(b.messages[0], /Category/);
});

test('payments made mark existing requests Paid, and never change paid or rejected ones', () => {
  const plan = planImport({ 'Payments Made': sheet([
    { 'request id': 'FR-90', 'date paid': '16/10/2026', amount: 100000, reference: 'R1' },
    { 'request id': 'FR-91', 'date paid': '16/10/2026' },
    { 'request id': 'FR-92', 'date paid': '16/10/2026' },
    { 'request id': 'FR-999', 'date paid': '16/10/2026' },
  ]) }, ctx());
  const [a, b, c, d] = plan.sheets[0].rows;
  assert.equal(a.action, 'update');
  assert.equal(a.id, 'FR-90');
  assert.deepEqual(a.record, { status: 'Paid' });
  assert.match(a.warnings[0], /totals ₦120,000 but the payment is ₦100,000/);
  assert.equal(b.action, 'skip');
  assert.equal(c.action, 'error');
  assert.equal(d.action, 'error');
});

test('sheetFromAoa reads a header row and numbers the rows the way Excel does', () => {
  const book = sheetFromAoa([['Date', 'Site', 'Dozer'], ['16/10/2026', 'Kangidi', '007'], [], ['', '', '']]);
  assert.equal(book.rows[0].rowNumber, 2);
  assert.equal(book.rows[0].cells.dozer, '007');
});
