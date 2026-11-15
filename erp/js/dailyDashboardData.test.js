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
    fuelCreditCollections: [{ project: P, date: '2026-10-12', fuelType: 'Diesel', litres: 1000, unitPrice: 1900 }],
    fundRequests: [], maintenanceLogs: [],
    dieselStockCounts: [{ project: P, date: '2026-10-11', countedLitres: 0 }, { project: P, date: '2026-10-12', countedLitres: 100 }],
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
      { project: P, date: '2026-10-12', fuelType: 'Diesel', litres: 400, unitPrice: 1900, notes: 'Station collection' },
      { project: P, date: '2026-10-12', fuelType: 'Diesel', litres: 600, unitPrice: 1900, notes: 'Sold to the CEO - not site diesel' },
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
    fuelCreditCollections: [{ project: P, date: '2026-10-12', fuelType: 'Diesel', litres: 1000, unitPrice: 1900 }],
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
  assert.ok(!/undefined|NaN(?!\()/.test(html.replace(/isNaN/g, '')), `no undefined/NaN values in the markup: ${html.match(/.{0,80}(?:undefined|NaN).{0,80}/g)}`);
  assert.equal(dashboardFileName('2026-10-15'), 'Daily_Dashboard_15Oct2026.html');
});

test('diesel on ground rolls the last stock count forward with later collections and distributions', () => {
  const d = buildDailyDashboard(ctx({
    dieselStockCounts: [{ project: P, date: '2026-10-11', countedLitres: 300 }],
    fuelCreditCollections: [
      { project: P, date: '2026-10-11', fuelType: 'Diesel', litres: 999, unitPrice: 1900 }, // inside the count already
      { project: P, date: '2026-10-12', fuelType: 'Diesel', litres: 1000, unitPrice: 1900 },
      { project: P, date: '2026-10-12', fuelType: 'Diesel', litres: 500, unitPrice: 1900, notes: 'Sold to the CEO' }, // not site diesel
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
  assert.equal(row.closing, 10);
  assert.equal(row.calculatedClosing, 20);
  assert.ok(d.flags.some((f) => /reported 10 L vs calculated 20 L/.test(f.text)));
  assert.equal(d.diesel.fuelingRequest.find((r) => r.equipment === 'EMG-1').closing, 10);
});

test('diesel against work is reported per dozer for the period', () => {
  const d = buildDailyDashboard(ctx({}));
  assert.ok(Array.isArray(d.diesel.efficiency));
  assert.ok(Math.abs(d.diesel.normLitresPerHa - 153.846) < 0.01);
  d.diesel.efficiency.forEach((r) => assert.ok('litresPerHa' in r && 'high' in r));
});

test('request table shows only selected-day requests while cards retain the recent window', () => {
  const req = (id, date, status) => ({ id, date, status, project: P, description: id, items: [{ amount: 100 }] });
  const fundRequests = ['Pending','Approved','Paid'].flatMap((status) => [req('old-'+status,'2026-10-08',status),req('boundary-'+status,'2026-10-09',status),req('today-'+status,'2026-10-12',status)]);
  fundRequests.push(req('future','2026-10-13','Pending'),req('rejected','2026-10-12','Rejected'));
  const d=buildDailyDashboard(ctx({since:'2026-10-01',fundRequests}));
  assert.equal(d.requests.since,'2026-10-09');
  assert.equal(d.requests.rows.length,3);
  assert.ok(d.requests.rows.every(r=>r.date==='2026-10-12'));
  assert.ok(d.requests.rows.every(r=>!r.id.startsWith('old-') && r.id!=='future' && r.id!=='rejected'));
  assert.equal(d.requests.pending,200);
  assert.equal(d.requests.approved,200);
  assert.equal(d.requests.paidCumulative,200);
  assert.ok(!d.flags.some(f=>f.text.includes('fund request(s) have waited')));
});

test('REX honors the selected cumulative date and preserves tank carry-over', () => {
  const d=buildDailyDashboard(ctx({project:'REX Forestry Project - Kangidi',date:'2026-11-04',since:'2026-10-22',statsFor:(from,to)=>({areaCleared:from==='2026-10-22'?5:0})}));
  assert.equal(d.since,'2026-10-22');
  assert.equal(d.operations.cumulativeHa,5);
  assert.equal(d.diesel.chainSince,'2026-10-10');
  const following=buildDailyDashboard(ctx({project:'REX Forestry Project - Kangidi',date:'2026-11-05',since:'2026-10-22'}));
  assert.equal(following.since,'2026-10-22');
});



test('moved dozer appears without work and maintenance excludes it from fueling', () => {
  const inputs = ctx({ project:'New Site', date:'2026-11-14', today:'2026-11-14',
    inventory:[{name:'EMG-006',category:'Heavy Equipment',currentProject:'New Site',fleetStatus:'Active'}],
    operations:[op({date:'2026-11-05',equipment:'EMG-006',siteName:'Old Site',quantity:1,hoursWorked:8})],
    machineStatusReports:[{date:'2026-11-14',project:'New Site',lines:[{equipment:'EMG-006',status:'Breakdown'}]}] });
  const d=buildDailyDashboard(inputs);
  assert.ok(d.operations.rows.some(r=>r.equipment==='EMG-006'&&r.hours===0));
  assert.equal(d.fleet[0].status,'Under Maintenance');
  assert.ok(!d.diesel.fuelingChoices.some(r=>r.equipment==='EMG-006'));
  assert.ok(d.flags.some(r=>r.text.includes('EMG-006')));
  assert.ok(!buildDailyDashboard({...inputs,project:'Old Site'}).fleet.some(r=>r.equipment==='EMG-006'));
});
test('roster redeployment appears before first report', () => {
 const d=buildDailyDashboard(ctx({project:'New Site',date:'2026-11-14',today:'2026-11-14',inventory:[{name:'Moved',category:'Heavy Equipment',currentProject:'New Site',fleetStatus:'Active'}],
 operations:[op({date:'2026-11-05',siteName:'Old Site',equipment:'Moved'})]}));
 assert.ok(d.fleet.some(r=>r.equipment==='Moved'));assert.ok(d.diesel.fuelingChoices.some(r=>r.equipment==='Moved'));
});
test('current status overrides stale roster condition for fueling', () => {
 const d=buildDailyDashboard(ctx({machineStatusReports:[{date:'2026-10-12',project:P,lines:[{equipment:'EMG-1',status:'Active'}]}],
 inventory:[{name:'EMG-1',category:'Heavy Equipment',currentProject:P,fleetStatus:'Under Maintenance'}]}));
 assert.equal(d.fleet[0].fleetStatus,'Active');assert.ok(d.diesel.fuelingChoices.some(r=>r.equipment==='EMG-1'));
});

test('daily fleet status is unreported without a dated machine report', () => {
  const d = buildDailyDashboard(ctx({ machineStatusReports: [] }));
  assert.equal(d.fleet[0].fleetStatus, 'Unreported');
  assert.ok(d.diesel.fuelingChoices.some((row) => row.equipment === 'EMG-1'));
});

test('daily dashboard uses the same counted site stock as reconciliation', () => {
  const inputs = ctx({
    date: '2026-11-14', operations: [],
    dieselReceipts: [{ project: P, date: '2026-11-13', litres: 720 }],
    fuelCreditCollections: [],
    distributions: [
      { project: P, date: '2026-11-14', equipment: 'EMG-1', litres: 600 },
      { project: P, date: '2026-11-14', purpose: 'Site use', litres: 20 },
    ],
    dieselStockCounts: [{ project: P, date: '2026-11-14', countedLitres: 100 }],
  });
  const dashboard = buildDailyDashboard(inputs);
  assert.equal(dashboard.diesel.onGround, 100);
  assert.equal(dashboard.diesel.onGroundDate, '2026-11-14');
});

test('all-project current stock excludes archived project balances', () => {
  const kangidi = 'REX Forestry Project - Kangidi';
  const blueSky = 'Blue Sky Project - Ajue-Ore';
  const d = buildDailyDashboard(ctx({
    project: 'all', date: '2026-11-15', operations: [], inventory: [],
    projects: [
      { name: kangidi, status: 'Active' },
      { name: blueSky, status: 'Active' },
      { name: 'Kajola', status: 'Completed' },
    ],
    dieselReceipts: [], fuelCreditCollections: [], distributions: [],
    dieselStockCounts: [
      { project: blueSky, date: '2026-11-14', countedLitres: 100 },
      { project: 'Kajola', date: '2026-11-14', countedLitres: 895 },
    ],
  }));
  assert.equal(d.diesel.onGround, 100);
});

test('two reports use the final chronological closing and carry it forward', () => {
 const equipment='Pastor (Osaro)', project='Site A';
 const rows=[{id:'b',date:'2026-11-13',siteName:project,equipment,timeResumed:'10:00',timeClosed:'11:00',hoursWorked:1,fuelUsed:25,closingDiesel:245},
 {id:'a',date:'2026-11-13',siteName:project,equipment,timeResumed:'08:00',timeClosed:'10:00',hoursWorked:2,fuelUsed:50,closingDiesel:270},
 {id:'prev',date:'2026-11-12',siteName:project,equipment:'Ogbomo Dozer (Pastor)',timeResumed:'09:00',timeClosed:'17:00',hoursWorked:6,fuelUsed:150,closingDiesel:320}];
 const inputs=ctx({project,date:'2026-11-13',inventory:[{name:equipment,category:'Heavy Equipment',currentProject:project,fleetStatus:'Active'}],operations:rows,distributions:[]});
 const day=buildDailyDashboard(inputs).diesel.rows[0];
 assert.equal(day.opening,320);assert.equal(day.used,75);assert.equal(day.closing,245);
 assert.equal(buildDailyDashboard({...inputs,date:'2026-11-15'}).diesel.rows[0].opening,245);
});

test('dashboard distribution tile uses the same explicit-or-report issue as site stock', () => {
  const inputs = ctx({
    date: '2026-11-15',
    operations: [op({ date: '2026-11-15', equipment: 'EMG-1', dieselSupplied: 200, fuelUsed: 0, hoursWorked: 0, quantity: 0 })],
    distributions: [],
    fuelCreditCollections: [],
    dieselReceipts: [],
    dieselStockCounts: [{ project: P, date: '2026-11-14', countedLitres: 1600 }],
  });
  const legacy = buildDailyDashboard(inputs);
  assert.equal(legacy.diesel.distributedToday, 200);
  assert.equal(legacy.diesel.onGround, 1400);
  assert.equal(legacy.diesel.distributionChart[0].value, 200);
  const explicit = buildDailyDashboard({ ...inputs,
    distributions: [{ project: P, date: '2026-11-15', equipment: 'EMG-1', litres: 200 }] });
  assert.equal(explicit.diesel.distributedToday, 200);
  assert.equal(explicit.diesel.onGround, 1400);
});
