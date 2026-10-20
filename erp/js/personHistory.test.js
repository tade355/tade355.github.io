import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesName, buildPersonHistory } from './personHistory.js';
import { supervisorSundayAllowanceBasis } from './dashboardBasis.js';

const tope = { id: 'EMP-11', name: 'Temitope Ezekiel Adebayo', role: 'Dozer Operator', dayRate: 30000 };
const joshua = { id: 'EMP-12', name: 'Paul Joshua Obokparo', role: 'Dozer Operator', dayRate: 30000 };
const jessie = { id: 'EMP-20', name: 'Jenom Daniel Jessie', role: 'Dozer Operator', dayRate: 25000 };
const gods = { id: 'EMP-40', name: 'Godstime Okoro', role: 'Mechanic' };
const sup = { id: 'EMP-50', name: 'Christopher Eze', role: 'Supervisor' };
const staff = [tope, joshua, jessie, gods, sup];

test('first-name-only mentions are matched', () => {
  assert.equal(matchesName('Please pay Tope for the week', tope, staff), true);
  assert.equal(matchesName("Tope's transport", tope, staff), true);
  assert.equal(matchesName('Joshua transport money', joshua, staff), true);
  assert.equal(matchesName('Pay Temitope Ezekiel Adebayo', tope, staff), true);
});

test('Jessie, Jessy and Jassie all find the same person', () => {
  ['Jessie', 'Jessy', 'Jassie', 'send money to jessy today'].forEach((t) => assert.equal(matchesName(t, jessie, staff), true, t));
  assert.equal(matchesName('Jessy', tope, staff), false);
});

test('Godstime and God\'s time are the same name', () => {
  ['Godstime', "God's time", 'gods time', "Godstime's welding rods"].forEach((t) => assert.equal(matchesName(t, gods, staff), true, t));
  assert.equal(matchesName('Godstime', jessie, staff), false);
});

test('the staff id counts, and unrelated or short words do not', () => {
  assert.equal(matchesName('Salary for EMP-12', joshua, staff), true);
  assert.equal(matchesName('Salary for EMP-120', joshua, staff), false);
  assert.equal(matchesName('Buy a tape and a type of oil', tope, staff), false);
  assert.equal(matchesName('', tope, staff), false);
  assert.equal(matchesName('Joshua', null, staff), false);
});

test('a name part shared by two staff members is not guessed', () => {
  const other = { id: 'EMP-60', name: 'Joshua Bello' };
  assert.equal(matchesName('Joshua', joshua, [...staff, other]), false);
  assert.equal(matchesName('Paul Joshua Obokparo', joshua, [...staff, other]), true);
  assert.equal(matchesName('Obokparo', joshua, [...staff, other]), true);
});

// 2026-10-18 is a Sunday; 2026-10-12 to 17 are Monday to Saturday.
const op = (id, date, equipment, hoursWorked, extra = {}) => ({ id, date, equipment, hoursWorked, operatorId: tope.id, supervisorId: sup.id, siteName: 'Kangidi', operationType: 'Felling', quantity: 0, ...extra });
const operations = [
  op('1', '2026-10-12', 'EMG-006', 8, { quantity: 1.3 }),
  op('2', '2026-10-13', 'EMG-006', 6, { quantity: 1 }),
  op('3', '2026-10-13', 'EMG-007', 4, { quantity: 0.5 }), // same day, second machine: 10 hrs, 2 overtime
  op('4', '2026-10-14', 'EMG-006', 8),
  op('5', '2026-10-15', 'EMG-006', 8),
  op('6', '2026-10-16', 'EMG-006', 8),
  op('7', '2026-10-17', 'EMG-006', 8),
  op('8', '2026-10-18', 'EMG-006', 8, { quantity: 1 }), // Sunday
  op('9', '2026-10-18', 'EMG-007', 7, { operatorId: jessie.id }),
  op('10', '2026-10-18', 'EMG-008', 6, { operatorId: joshua.id }),
  op('11', '2026-10-19', 'EMG-006', 8, { operatorId: joshua.id, supervisorId: 'EMP-99' }),
  op('12', '2026-10-13', 'EMG-006', 0), // zero hours is not a day worked
  op('13', '2026-10-14', 'D8K Rented', 5, { operationType: 'Road', quantity: 2 }), // km, not hectares
];

const calls = [];
const ctx = {
  employees: staff,
  operations,
  // Stub of the shared rule: 1,000 per hour, so the figures are easy to check.
  operatorAllowanceForRows: (rows) => { calls.push(rows.length); return rows.reduce((s, o) => s + (o.hoursWorked || 0) * 1000, 0); },
  dozerLineNetPay: (l) => l.daysWorked * l.dayRate + (l.overtimeHours || 0) * 10000 + (l.businessEarnings || 0) - (l.deductions || 0),
  payrollLineNetPay: (l) => l.baseSalary + (l.bonus || 0) - (l.deductions || 0),
  isAllowancePaymentFor: (id, payee, category) => id === tope.id && payee.trim().toLowerCase() === 'temitope ezekiel adebayo' && category === 'Salary and Allowance',
  dozerPayrollRuns: [
    { id: 'DPR-1', periodStart: '2026-10-12', periodEnd: '2026-10-18', status: 'Paid', lines: [
      { employeeId: tope.id, equipment: 'EMG-006', daysWorked: 5, dayRate: 30000, overtimeHours: 2, businessEarnings: 0, deductions: 1000, amountPaid: 100000 },
      { employeeId: jessie.id, daysWorked: 1, dayRate: 25000, amountPaid: 25000 },
    ] },
    { id: 'DPR-2', periodStart: '2026-10-19', periodEnd: '2026-10-25', status: 'Draft', lines: [{ employeeId: tope.id, daysWorked: 1, dayRate: 30000, amountPaid: 0 }] },
    { id: 'DPR-0', periodStart: '2026-09-01', periodEnd: '2026-09-07', status: 'Paid', lines: [{ employeeId: tope.id, daysWorked: 1, dayRate: 30000, amountPaid: 30000 }] },
  ],
  payrollRuns: [{ id: 'PR-1', month: '2026-10', status: 'Paid', lines: [{ employeeId: sup.id, baseSalary: 200000, bonus: 10000, deductions: 0, amountPaid: 210000 }] }],
  expenses: [
    { id: 'EXP-1', date: '2026-10-17', payee: 'Temitope Ezekiel Adebayo', category: 'Salary and Allowance', amount: 50000 },
    { id: 'EXP-2', date: '2026-10-17', payee: 'Temitope Ezekiel Adebayo', category: 'Transport', amount: 7000 },
    { id: 'EXP-3', date: '2026-09-01', payee: 'Temitope Ezekiel Adebayo', category: 'Salary and Allowance', amount: 9000 },
  ],
  fundRequests: [
    { id: 'FR-1', date: '2026-10-14', status: 'Paid', description: 'Welfare', items: [{ description: 'Transport for Tope', amount: 5000 }, { description: 'Rope', amount: 2000 }] },
    { id: 'FR-2', date: '2026-10-15', status: 'Pending', description: 'Tope medical', items: [{ description: 'Hospital', amount: 12000 }, { description: 'Drugs', amount: 3000 }] },
    { id: 'FR-3', date: '2026-10-16', status: 'Rejected', description: 'Jessy bike repair', items: [{ description: 'Repair', amount: 8000 }] },
    { id: 'FR-4', date: '2026-08-01', status: 'Paid', description: 'Tope old', items: [{ description: 'x', amount: 1 }] },
  ],
  maintenanceLogs: [
    { id: 'MNT-1', date: '2026-10-14', equipment: 'EMG-006', type: 'Repair', description: 'Replaced track roller', cost: 40000, status: 'Completed', performedBy: gods.id },
    { id: 'MNT-2', date: '2026-10-15', equipment: 'EMG-007', type: 'Service', description: "Assisted by God's time", cost: 5000, status: 'Completed', performedBy: null },
    { id: 'MNT-3', date: '2026-10-16', equipment: 'EMG-008', type: 'Repair', description: 'Hose', cost: 3000, status: 'Completed', performedBy: 'EMP-77' },
  ],
  dozerBalanceOwed: (id) => (id === tope.id ? 123 : 0),
};

test('unknown employee returns null', () => {
  assert.equal(buildPersonHistory(ctx, 'EMP-0', {}), null);
});

test('operator: days, hours per machine, overtime, Sundays and hectares', () => {
  const h = buildPersonHistory(ctx, tope.id, { from: '2026-10-12', to: '2026-10-18' });
  const s = h.summary;
  assert.equal(s.operatorDays, 7); // 12 to 18 Oct; the zero-hour report is not a day
  assert.equal(s.operatorHours, 8 + 10 + 13 + 8 * 4); // 13 hrs on the 14th: EMG-006 8 + a rented dozer 5
  assert.equal(s.overtimeHours, 2 + 5);
  assert.equal(s.sundayDays, 1);
  assert.equal(s.operatorHectares, 1.3 + 1 + 0.5 + 1); // the Road row is km and is left out
  const m006 = h.machines.find((m) => m.role === 'Operator' && m.equipment === 'EMG-006');
  assert.deepEqual({ days: m006.days, hours: m006.hours, sundayDays: m006.sundayDays }, { days: 7, hours: 8 + 6 + 8 * 4 + 8, sundayDays: 1 });
  assert.equal(h.machines.find((m) => m.equipment === 'EMG-007').hours, 4);
  const day13 = h.daily.find((d) => d.date === '2026-10-13' && d.role === 'Operator');
  assert.deepEqual({ hours: day13.hours, ot: day13.overtimeHours }, { hours: 10, ot: 2 });
  assert.equal(day13.machines, 'EMG-006, EMG-007');
});

test('a date range limits the rows; no range means all time', () => {
  const week = buildPersonHistory(ctx, tope.id, { from: '2026-10-12', to: '2026-10-12' });
  assert.equal(week.summary.operatorDays, 1);
  const all = buildPersonHistory(ctx, tope.id, {});
  assert.equal(all.summary.operatorDays, 7);
  assert.equal(all.payrollLines.length, 3);
});

test('operator allowance comes from the shared rule, per day and in total', () => {
  const h = buildPersonHistory(ctx, tope.id, { from: '2026-10-12', to: '2026-10-18' });
  assert.equal(h.summary.operatorAllowance, h.summary.operatorHours * 1000 - 0);
  assert.equal(h.daily.find((d) => d.date === '2026-10-12' && d.role === 'Operator').allowance, 8000);
  // the rule was handed this operator's rows only, never other people's
  const other = buildPersonHistory(ctx, jessie.id, { from: '2026-10-12', to: '2026-10-18' });
  assert.equal(other.summary.operatorAllowance, 7000);
});

test('day-rate payroll: confirmed lines only, net pay from the payroll rule, balance passed through', () => {
  const h = buildPersonHistory(ctx, tope.id, { from: '2026-10-12', to: '2026-10-25' });
  assert.equal(h.payrollLines.length, 2); // the September run is outside the range
  assert.equal(h.summary.payrollNet, 5 * 30000 + 2 * 10000 - 1000);
  assert.equal(h.summary.payrollPaid, 100000); // the Draft run is not counted
  assert.equal(h.payrollLines.find((l) => l.status === 'Draft').netPay, 30000);
  assert.equal(h.summary.balanceOwed, 123);
});

test('allowance lump-sum payments need both the payee alias and the category', () => {
  const h = buildPersonHistory(ctx, tope.id, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(h.allowancePayments.map((p) => p.id), ['EXP-1']);
  assert.equal(h.summary.allowancePaymentsTotal, 50000);
});

test('monthly salary lines are picked by run month', () => {
  const h = buildPersonHistory(ctx, sup.id, { from: '2026-10-05', to: '2026-10-20' });
  assert.equal(h.monthlyLines.length, 1);
  assert.equal(h.summary.monthlyNet, 210000);
  assert.equal(h.summary.monthlyPaid, 210000);
  assert.equal(buildPersonHistory(ctx, sup.id, { from: '2026-11-01', to: '2026-11-30' }).monthlyLines.length, 0);
});

test('supervisor Sunday bonus is the dashboard rule, using the whole week even before the range start', () => {
  // Range is the Sunday only; Monday to Saturday work lies outside it.
  const h = buildPersonHistory(ctx, sup.id, { from: '2026-10-18', to: '2026-10-18' });
  const expected = supervisorSundayAllowanceBasis(operations.filter((o) => o.supervisorId === sup.id && o.date === '2026-10-18'), operations.filter((o) => o.supervisorId === sup.id));
  assert.ok(expected > 0);
  assert.equal(h.summary.sundayBonusTotal, expected);
  assert.deepEqual(h.sundayBonuses.map((b) => b.date), ['2026-10-18']);
  assert.equal(h.daily.find((d) => d.role === 'Supervisor').sundayBonus, expected);
  assert.equal(h.summary.supervisorDays, 1);
  assert.equal(h.roles.supervisor, true);
});

test('Sunday bonus is nothing before the dashboard basis date', () => {
  const early = [{ id: 'a', date: '2026-10-04', equipment: 'A', hoursWorked: 8, supervisorId: sup.id }];
  const h = buildPersonHistory({ ...ctx, operations: early }, sup.id, {});
  assert.equal(h.summary.sundayBonusTotal, 0);
  assert.equal(h.sundayBonuses[0].onBasis, false);
});

test('fund requests that name the person, with the amount that names them', () => {
  const h = buildPersonHistory(ctx, tope.id, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(h.fundRequests.map((r) => r.id), ['FR-1', 'FR-2']); // FR-4 is out of range, FR-3 names Jessy
  const fr1 = h.fundRequests[0];
  assert.deepEqual({ total: fr1.total, named: fr1.namedAmount, status: fr1.status }, { total: 7000, named: 5000, status: 'Paid' });
  assert.equal(h.fundRequests[1].namedAmount, 15000); // the description itself names Tope
  assert.deepEqual(h.summary.requestsByStatus, { Paid: 5000, Pending: 15000 });
  assert.equal(h.summary.requestsTotal, 20000);
  const j = buildPersonHistory(ctx, jessie.id, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(j.fundRequests.map((r) => [r.id, r.status]), [['FR-3', 'Rejected']]);
});

test('mechanic: logs performed by them, plus logs that name them', () => {
  const h = buildPersonHistory(ctx, gods.id, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(h.maintenance.map((m) => [m.id, m.how]), [['MNT-1', 'Performed by'], ['MNT-2', 'Named in log']]);
  assert.equal(h.summary.maintenancePerformed, 1);
  assert.equal(h.summary.maintenanceCost, 40000); // only logs they performed are costed to them
  assert.equal(h.roles.mechanic, true);
  assert.equal(h.roles.operator, false);
});

test('missing ctx pieces degrade to empty or null instead of throwing', () => {
  const bare = { employees: staff, operations: [] };
  const h = buildPersonHistory(bare, tope.id, {});
  assert.equal(h.summary.operatorAllowance, 0);
  assert.equal(h.summary.payrollNet, null);
  assert.equal(h.summary.balanceOwed, null);
  assert.deepEqual(h.fundRequests, []);
});
