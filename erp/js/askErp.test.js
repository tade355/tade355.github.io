import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, answerQuestion } from './askErp.js';
import { buildProfitReport } from './profitReportData.js';
import { buildProfitReportHtml, profitReportFileName } from './profitReportHtml.js';

const P = 'Site A';
const op = (o) => ({ siteName: P, operationType: 'Phase 1', workType: null, quantity: 0, fuelUsed: 0, ...o });
const stats = (a, b) => {
  const days = ctx.operations.filter((o) => o.date >= a && o.date <= b);
  const rev = days.reduce((s, o) => s + o.quantity * 845000, 0);
  const cost = days.reduce((s, o) => s + o.hoursWorked * 46250 + o.fuelUsed * 1900, 0);
  return { provisionalRevenue: rev, totalCost: cost, opsProfit: rev - cost, totalProfit: rev - cost, mcRecovered: 0, maintenanceIncurred: 0, netMcRecovered: 0, areaCleared: days.reduce((s, o) => s + o.quantity, 0), dieselCost: 0, dozerCost: 0, logisticsCost: 0, operatorAllowanceCost: 0, pmsCost: 0, otherCost: 0, supervisorSundayAllowance: 0, dozerOwned: 0, dozerRented: 0, dozerPartnership: 0, pmsTacoma: 0, pmsUnexplained: 0, fuelUsed: days.reduce((s, o) => s + o.fuelUsed, 0) };
};
const ctx = {
  project: P,
  operations: [
    op({ date: '2026-10-14', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 8, quantity: 1.0, fuelUsed: 200, timeResumed: '08:00', timeClosed: '16:00' }),
    op({ date: '2026-10-15', equipment: 'EMG-1', operatorId: 'E1', supervisorId: 'S1', hoursWorked: 4, quantity: 0.4, fuelUsed: 100, timeResumed: '10:00', timeClosed: '14:00' }),
    op({ date: '2026-10-15', equipment: 'EMG-2', operatorId: 'E2', supervisorId: 'S1', hoursWorked: 8, quantity: 1.3, fuelUsed: 200, timeResumed: '07:00', timeClosed: '15:00' }),
  ],
  inventory: [{ name: 'EMG-1', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active' }, { name: 'EMG-2', category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Down' }],
  employees: [{ id: 'E1', name: 'Adebayo Tope' }, { id: 'E2', name: 'Paul Joshua' }, { id: 'S1', name: 'Oki Christopher' }],
  distributions: [], fuelCreditCollections: [], fuelCreditPayments: [], fundRequests: [], maintenanceLogs: [], dieselStockCounts: [],
  hourlyRateAsOf: () => 46250, dieselRateAsOf: () => 1900, projectRateAsOf: () => ({ rate: 845000 }), operatorAllowanceForRows: () => 0, statsFor: stats,
};
const ask = (q) => answerQuestion(q, ctx, { today: '2026-10-16', project: P });

test('dates in questions are understood', () => {
  assert.deepEqual(parseRange('profit yesterday', '2026-10-16').from, '2026-10-15');
  assert.deepEqual([parseRange('from 10 Oct to 15th October', '2026-10-16').from, parseRange('from 10 Oct to 15th October', '2026-10-16').to], ['2026-10-10', '2026-10-15']);
  assert.equal(parseRange('what happened on 12/10', '2026-10-16').from, '2026-10-12');
  assert.equal(parseRange('since 10 oct', '2026-10-16', { lastDate: '2026-10-15' }).to, '2026-10-15');
  assert.equal(parseRange('last 3 days', '2026-10-16').from, '2026-10-14');
  const none = parseRange('profit', '2026-10-16', { lastDate: '2026-10-15' });
  assert.equal(none.explicit, false);
});

test('profit questions are answered from the data', () => {
  const a = ask('What was the profit yesterday?');
  assert.match(a.text, /15 Oct 2026: Operations Profit/);
  assert.match(a.text, /1\.7 ha/);
});

test('a person or dozer in the question filters the answer', () => {
  const a = ask('How many hectares did Tope clear since 14 Oct?');
  assert.match(a.text, /Adebayo Tope/);
  assert.match(a.text, /1\.4 ha/);
});

test('"Tope" is not mistaken for the word "top"', () => {
  const a = ask('hectares cleared by tope on 15 oct');
  assert.match(a.text, /0\.4 ha/);
});

test('best and worst rankings', () => {
  assert.match(ask('Which dozer performed best on 15 Oct?').text, /EMG-2/);
  assert.match(ask('worst dozer on 15 Oct').text, /EMG-1/);
});

test('start times and fleet status', () => {
  assert.match(ask('Who started late on 15 Oct?').text, /1 of 2 dozer/);
  assert.match(ask('Which dozers are down?').text, /EMG-2/);
});

test('unrelated questions are declined, not invented', () => {
  assert.match(ask('what is the weather in lagos').text, /only answer from the data loaded in the ERP/);
});

test('the profitability report is built for a chosen range and sections', () => {
  const r = buildProfitReport(ctx, { project: P, from: '2026-10-14', to: '2026-10-15', sections: ['summary', 'dozers', 'flagged'] });
  assert.equal(r.workingDays, 2);
  assert.equal(r.byDozer.length, 2);
  const html = buildProfitReportHtml(r);
  assert.ok(html.includes('<section id="summary">') && html.includes('<section id="dozers">') && html.includes('<section id="flagged">'));
  assert.ok(!html.includes('<section id="daily">'), 'unselected sections are left out');
  assert.equal(profitReportFileName('2026-10-10', '2026-10-15'), 'Operations_Profitability_Report_10Oct2026-15Oct2026.html');
});
