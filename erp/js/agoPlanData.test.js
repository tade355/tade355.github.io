import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { targetOpeningFor, buildPlan, supplyMessage, voucherDrafts, planDefaults } from './agoPlanData.js';
import { buildAgoWorkbook, agoFileName } from './agoPlanXlsx.js';

const dozers = [
  { name: 'EMG-007', operator: 'Tope', distributed: 240, closing: 50, active: true },
  { name: 'EMG-008', operator: 'Joshua', distributed: 240, closing: 45, active: true },
  { name: 'D8K Collins', operator: 'Collins', distributed: 240, closing: 87.5, active: true },
  { name: 'CHI-001', operator: null, distributed: 0, closing: 42.5, active: false },
];

test('target opening = target hours x diesel per hour + reserve', () => {
  assert.equal(targetOpeningFor({ targetHours: 8, litresPerHour: 25, reserve: 50 }), 250);
  assert.equal(targetOpeningFor({ targetHours: 9, litresPerHour: 25, reserve: 50 }), 270); // 8 x 25 + 1 x 20 + 50
  assert.equal(targetOpeningFor({ targetHours: 6, litresPerHour: 25, reserve: 0 }), 150);
  assert.equal(targetOpeningFor(), 250);
});

test('the plan tops each active dozer up to the target, less what is on ground', () => {
  const p = buildPlan({ dozers, target: 250, onGround: 120, kegLitres: 30, dieselPrice: 1900, pmsLitres: 20, pmsPrice: 1385 });
  assert.deepEqual(p.rows.map((r) => r.need), [200, 205, 162.5, null]); // inactive dozer has no need
  assert.equal(p.totalNeed, 567.5);
  assert.equal(p.additional, 447.5);
  assert.equal(Math.round(p.kegs * 10) / 10, 14.9);
  assert.equal(p.agoCost, 447.5 * 1900);
  assert.equal(p.pmsCost, 27700);
  assert.equal(p.grandCost, 447.5 * 1900 + 27700);
  // a dozer already above the target needs nothing; ground larger than the need leaves nothing to supply
  const q = buildPlan({ dozers: [{ name: 'A', active: true, closing: 300, distributed: 0 }], target: 250, onGround: 0, dieselPrice: 1 });
  assert.equal(q.rows[0].need, 0);
  assert.equal(buildPlan({ dozers, target: 250, onGround: 5000 }).additional, 0);
});

test('the supply message is worded like the Midejab messages', () => {
  assert.equal(supplyMessage({ recipient: 'Christopher', diesel: 1690, date: '2026-10-16', today: '2026-10-16' }),
    '*No 1.*\n\nPlease supply Christopher with 1,690 liters Diesel today - 16 Oct 2026.\n\nThank you.');
  assert.match(supplyMessage({ recipient: 'Oki Christopher', diesel: 947.5, pms: 20, date: '2026-10-17', today: '2026-10-16', number: 2 }), /^\*No 2\.\*\n\nPlease supply Oki Christopher with 947\.5 liters Diesel and 20 liters PMS tomorrow - 17 Oct 2026\./);
  assert.match(supplyMessage({ diesel: 0, pms: 15, date: '2026-10-20', today: '2026-10-16' }), /Please supply the site with 15 liters PMS on 20 Oct 2026\./);
  assert.equal(supplyMessage({ diesel: 0, pms: 0, date: '2026-10-20' }), '');
});

test('vouchers: one for AGO and one for PMS, for the site, pending approval', () => {
  const plan = buildPlan({ dozers, target: 250, onGround: 120, dieselPrice: 1900, pmsLitres: 20, pmsPrice: 1385 });
  const v = voucherDrafts({ plan, station: 'Midejab Ltd', date: '2026-10-17', project: 'Site A', requestedBy: 'EMP-26', message: 'MSG', today: '2026-10-16' });
  assert.equal(v.length, 2);
  assert.equal(v[0].equipment, 'Site supply (AGO)');
  assert.equal(v[0].litresRequested, 447.5);
  assert.equal(v[0].estimatedCost, 850250);
  assert.equal(v[0].status, 'Pending Approval');
  assert.match(v[0].notes, /EMG-007 \(Tope\) 200 L; EMG-008 \(Joshua\) 205 L; D8K Collins \(Collins\) 162\.5 L/);
  assert.equal(v[1].equipment, 'Site supply (PMS)');
  assert.equal(v[1].estimatedCost, 27700);
  const none = voucherDrafts({ plan: buildPlan({ dozers, target: 250, onGround: 9999 }), station: 'S', date: '2026-10-17', requestedBy: 'E' });
  assert.equal(none.length, 0);
});

test('defaults come from the ERP diesel chain: closing diesel, active dozers, on ground, supervisor', () => {
  const P = 'Site A';
  const ctx = {
    operations: [{ siteName: P, operationType: 'Phase 1', date: '2026-10-12', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 4, quantity: 0.5, fuelUsed: 100, timeResumed: '08:00', timeClosed: '12:00' }],
    inventory: [
      { name: 'EMG-1', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active', currentProject: P },
      { name: 'EMG-2', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Down', currentProject: P },
    ],
    employees: [{ id: 'E1', name: 'Op One' }, { id: 'S1', name: 'Oki Christopher' }],
    distributions: [{ project: P, date: '2026-10-12', equipment: 'EMG-1', litres: 240 }],
    fuelCreditCollections: [{ date: '2026-10-11', fuelType: 'PMS', litres: 10, unitPrice: 1400 }],
    fundRequests: [], maintenanceLogs: [], dieselStockCounts: [{ date: '2026-10-11', countedLitres: 300 }],
    hourlyRateAsOf: () => 46250, dieselRateAsOf: () => 1900, projectRateAsOf: () => ({ rate: 845000 }), operatorAllowanceForRows: () => 0,
    statsFor: () => ({ opsProfit: 0, totalProfit: 0, areaCleared: 0.5, pmsCost: 0, pmsUnexplained: 0, supervisorSundayAllowance: 0, dieselLogistics: 0 }), stationBalance: 0,
  };
  const d = planDefaults(ctx, P, '2026-10-12');
  const e1 = d.dozers.find((x) => x.name === 'EMG-1');
  assert.equal(e1.closing, 140); // 240 supplied - 100 used
  assert.equal(e1.distributed, 240);
  assert.equal(e1.active, true);
  assert.equal(e1.operator, 'Op One');
  assert.equal(d.dozers.find((x) => x.name === 'EMG-2').active, false);
  assert.equal(d.onGround, 60); // 300 counted - 240 distributed since
  assert.equal(d.recipient, 'Oki Christopher');
  assert.equal(d.pmsPrice, 1400);
});

test('the Excel planner has live formulas, totals and notes', async () => {
  const sandbox = { console, setTimeout, setImmediate, clearTimeout, process, Buffer };
  sandbox.self = sandbox; sandbox.window = sandbox; sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../vendor/exceljs.min.js', import.meta.url), 'utf8'), sandbox);
  const plan = buildPlan({ dozers, target: 250, onGround: 120, kegLitres: 30, dieselPrice: 1900, pmsLitres: 20, pmsPrice: 1385 });
  const wb = buildAgoWorkbook(sandbox.ExcelJS, plan, { siteLabel: 'Kangidi', planDate: '2026-10-17', closingDate: '2026-10-16', targetHours: 8, litresPerHour: 25, reserve: 50, targetOverridden: false, generatedOn: '2026-10-16', notes: ['Note one.'] });
  const ws = wb.getWorksheet('17 Oct');
  assert.equal(ws.getCell('A2').value, 'Diesel @ Kangidi for 17 Oct');
  assert.equal(ws.getCell('B3').value, 'Distributed on 16 Oct');
  assert.equal(ws.getCell('D4').value.formula, 'MAX(0,$D$10-C4)'); // target cell is D(g)
  assert.equal(ws.getCell('D10').value, 250);
  assert.equal(ws.getCell('D8').value.formula, 'SUM(D4:D7)');
  assert.equal(ws.getCell('D7').value, null); // inactive dozer: no need
  assert.match(ws.getCell('A7').value, /not active/);
  assert.equal(ws.getCell('D12').value.formula, 'MAX(0,D8-D11)');
  assert.equal(ws.getCell('D13').value.formula, 'D12/30');
  assert.equal(ws.getCell('D18').value.formula, 'D16*D17');
  assert.equal(ws.getCell('D19').value.formula, 'D15+D18');
  const buf = await wb.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 3000);
  assert.equal(agoFileName('2026-10-17'), 'AGO_Planner_17Oct2026.xlsx');
});
