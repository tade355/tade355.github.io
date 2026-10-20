// Person history: what one operator, supervisor or mechanic did and was paid
// over a date range. Kept free of store/Supabase imports (a `ctx` is passed in,
// built by personHistoryContext() in reportContext.js) so it can be unit-tested.
//
// Every money figure comes from an existing source function handed in through
// ctx, never re-derived here:
//   operator allowance      ctx.operatorAllowanceForRows   (ownedOperatorAllowance.js)
//   supervisor Sunday bonus supervisorSundayAllowanceBasis (dashboardBasis.js)
//   day-rate payroll net    ctx.dozerLineNetPay            (views/dozerPayroll.js netPay)
//   monthly payroll net     ctx.payrollLineNetPay          (views/payroll.js netPay)
//   allowance lump sums     ctx.isAllowancePaymentFor      (ownedOperatorAllowance.js)
// Amounts typed on records (fund request items, maintenance cost, amount paid)
// are summed as recorded.
import { isSunday } from './dateUtils.js';
import { dateInRange } from './utils.js';
import { isHaOperationType } from './constants.js';
import { supervisorSundayAllowanceBasis, onDashboardBasis } from './dashboardBasis.js';

const OVERTIME_AFTER_HOURS = 8;
const round2 = (n) => Math.round(n * 100) / 100;
const sum = (list, pick) => list.reduce((s, x) => s + (pick(x) || 0), 0);

// ---------------------------------------------------------------- names
// Lower-case words with apostrophes dropped ("God's time" -> "gods", "time").
function plainWords(text) {
  return String(text || '').toLowerCase().replace(/[\u2019]/g, "'").replace(/[^a-z0-9'\s-]/g, ' ').split(/[\s-]+/)
    .map((w) => w.replace(/'/g, '')).filter(Boolean);
}

// Words as people write them in WhatsApp requests: "Tope's" is also read as
// "tope", and neighbouring words are joined so "God's time" reads as the one
// name "Godstime".
function wordsOf(text) {
  const plain = plainWords(text);
  const out = [...plain];
  String(text || '').toLowerCase().replace(/[\u2019]/g, "'").split(/[\s-]+/).forEach((raw) => {
    if (/'s[^a-z0-9]*$/.test(raw)) {
      const w = raw.replace(/[^a-z0-9]/g, '');
      if (w.length > 2) out.push(w.slice(0, -1));
    }
  });
  for (let i = 0; i + 1 < plain.length; i += 1) out.push(plain[i] + plain[i + 1]);
  return out;
}

// Spelling-insensitive key: Jessie, Jessy and Jassie all become "jasa".
function soundKey(word) {
  return word.replace(/y/g, 'i').replace(/[aeiou]/g, 'a').replace(/(.)\1+/g, '$1');
}

function nameTokens(employee) {
  return plainWords(employee.name).filter((w) => w.length >= 4);
}

function tokenMatchesWord(token, word) {
  if (word === token) return true;
  if (word.length >= 4 && token.length > word.length && (token.startsWith(word) || token.endsWith(word))) return true; // "Tope" in Temitope
  if (word.length >= 5 && token.length >= 5 && soundKey(word) === soundKey(token)) return true; // Jessy / Jassie
  return false;
}

// True when `text` names this employee: the staff id, the full name, or any
// single name part of 4 or more letters (first-name-only mentions such as
// "Tope", "Joshua", "Jessy", "God's time"). Pass `employees` to ignore a name
// part another staff member also has (two Joshuas), so neither is guessed.
export function matchesName(text, employee, employees = []) {
  if (!employee || !text) return false;
  const raw = String(text);
  if (employee.id && new RegExp(`(^|[^a-z0-9])${employee.id.toLowerCase().replace(/[^a-z0-9-]/g, '')}($|[^a-z0-9])`).test(raw.toLowerCase())) return true;
  const fullName = plainWords(employee.name);
  if (fullName.length > 1 && ` ${plainWords(raw).join(' ')} `.includes(` ${fullName.join(' ')} `)) return true;
  const others = (employees || []).filter((e) => e.id !== employee.id);
  const shared = new Set(others.flatMap(nameTokens));
  const words = wordsOf(raw);
  return nameTokens(employee).some((token) => !shared.has(token) && words.some((w) => tokenMatchesWord(token, w)));
}

// ---------------------------------------------------------------- helpers
const requestTotal = (r) => sum(r.items || [], (it) => it.amount);

function monthInRange(month, from, to) {
  if (!month) return false;
  if (from && month < from.slice(0, 7)) return false;
  if (to && month > to.slice(0, 7)) return false;
  return true;
}

function runOverlaps(run, from, to) {
  if (from && run.periodEnd && run.periodEnd < from) return false;
  if (to && run.periodStart && run.periodStart > to) return false;
  return true;
}

// Days and overtime per calendar date: hours across machines are added first
// (an operator can have two reports the same day), as the allowance rule does.
function dailyRows(rows) {
  const byDate = new Map();
  rows.forEach((o) => {
    if (!byDate.has(o.date)) byDate.set(o.date, []);
    byDate.get(o.date).push(o);
  });
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, list]) => {
    const hours = sum(list, (o) => o.hoursWorked);
    return {
      date,
      sunday: isSunday(date),
      machines: [...new Set(list.map((o) => o.equipment).filter(Boolean))].join(', '),
      sites: [...new Set(list.map((o) => o.siteName).filter(Boolean))].join(', '),
      hours: round2(hours),
      overtimeHours: round2(Math.max(0, hours - OVERTIME_AFTER_HOURS)),
      hectares: round2(sum(list.filter((o) => isHaOperationType(o.operationType)), (o) => o.quantity)),
      list,
    };
  });
}

function perMachine(rows, role) {
  const by = new Map();
  rows.forEach((o) => {
    const key = o.equipment || 'Unspecified';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(o);
  });
  return [...by.entries()].map(([equipment, list]) => ({
    role,
    equipment,
    days: new Set(list.filter((o) => o.hoursWorked > 0).map((o) => o.date)).size,
    hours: round2(sum(list, (o) => o.hoursWorked)),
    sundayDays: new Set(list.filter((o) => o.hoursWorked > 0 && isSunday(o.date)).map((o) => o.date)).size,
    hectares: round2(sum(list.filter((o) => isHaOperationType(o.operationType)), (o) => o.quantity)),
  })).sort((a, b) => b.hours - a.hours);
}

// ---------------------------------------------------------------- builder
export function buildPersonHistory(ctx, employeeId, { from = '', to = '' } = {}) {
  const employees = ctx.employees || [];
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return null;
  const inRange = (date) => dateInRange(date, from, to);
  const allOps = ctx.operations || [];

  // ---- field work (operations)
  const asOperator = allOps.filter((o) => o.operatorId === employeeId && inRange(o.date));
  const asSupervisor = allOps.filter((o) => o.supervisorId === employeeId && inRange(o.date));
  const operatorDays = dailyRows(asOperator.filter((o) => o.hoursWorked > 0));
  const supervisorDays = dailyRows(asSupervisor.filter((o) => o.hoursWorked > 0));
  const machines = [...perMachine(asOperator, 'Operator'), ...perMachine(asSupervisor, 'Supervisor')];

  // ---- operator allowance (owned fleet) per day, from the shared rule
  const allowanceFor = ctx.operatorAllowanceForRows || (() => 0);
  const operatorAllowance = allowanceFor(asOperator);
  const allowanceByDate = new Map(operatorDays.map((d) => [d.date, allowanceFor(d.list)]));

  // ---- supervisor Sunday bonus; the weekly rule looks back six days, so it is
  // given all of this supervisor's operations, not just the chosen range.
  const supervisorAllOps = allOps.filter((o) => o.supervisorId === employeeId);
  const sundayBonuses = supervisorDays.filter((d) => d.sunday).map((d) => ({
    date: d.date,
    machines: d.machines,
    amount: supervisorSundayAllowanceBasis(d.list, supervisorAllOps),
    onBasis: onDashboardBasis(d.date),
  }));
  const sundayBonusTotal = sum(sundayBonuses, (b) => b.amount);

  const daily = [
    ...operatorDays.map((d) => ({
      date: d.date, role: 'Operator', sunday: d.sunday, machines: d.machines, sites: d.sites, hours: d.hours,
      overtimeHours: d.overtimeHours, hectares: d.hectares, allowance: allowanceByDate.get(d.date) || 0, sundayBonus: 0,
    })),
    ...supervisorDays.map((d) => ({
      date: d.date, role: 'Supervisor', sunday: d.sunday, machines: d.machines, sites: d.sites, hours: d.hours,
      overtimeHours: 0, hectares: d.hectares, allowance: 0, sundayBonus: sundayBonuses.find((b) => b.date === d.date)?.amount || 0,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.role < b.role ? -1 : 1)));

  // ---- day-rate payroll lines (dozer payroll runs) and lump-sum payments
  const dozerNet = ctx.dozerLineNetPay;
  const payrollLines = [];
  (ctx.dozerPayrollRuns || []).filter((r) => runOverlaps(r, from, to)).forEach((run) => {
    (run.lines || []).filter((l) => l.employeeId === employeeId).forEach((l) => {
      payrollLines.push({
        runId: run.id, periodStart: run.periodStart, periodEnd: run.periodEnd, status: run.status, equipment: l.equipment || '',
        daysWorked: l.daysWorked || 0, dayRate: l.dayRate || 0, overtimeHours: l.overtimeHours || 0,
        businessEarnings: l.businessEarnings || 0, deductions: l.deductions || 0,
        netPay: dozerNet ? dozerNet(l) : null, amountPaid: l.amountPaid || 0,
      });
    });
  });
  payrollLines.sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1));
  const confirmedLines = payrollLines.filter((l) => l.status !== 'Draft');

  const isAllowancePayment = ctx.isAllowancePaymentFor || (() => false);
  const allowancePayments = (ctx.expenses || [])
    .filter((e) => inRange(e.date) && isAllowancePayment(employeeId, e.payee, e.category))
    .map((e) => ({ id: e.id, date: e.date, payee: e.payee, description: e.description || '', amount: e.amount || 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // ---- monthly salary lines (payroll runs), by run month
  const monthlyNet = ctx.payrollLineNetPay;
  const monthlyLines = [];
  (ctx.payrollRuns || []).filter((r) => monthInRange(r.month, from, to)).forEach((run) => {
    (run.lines || []).filter((l) => l.employeeId === employeeId).forEach((l) => {
      monthlyLines.push({
        runId: run.id, month: run.month, status: run.status, baseSalary: l.baseSalary || 0, bonus: l.bonus || 0,
        deductions: l.deductions || 0, netPay: monthlyNet ? monthlyNet(l) : null, amountPaid: l.amountPaid || 0,
      });
    });
  });
  monthlyLines.sort((a, b) => (a.month < b.month ? -1 : 1));
  const confirmedMonthly = monthlyLines.filter((l) => l.status !== 'Draft');

  // ---- fund requests that name this person
  const fundRequests = [];
  (ctx.fundRequests || []).filter((r) => inRange(r.date)).forEach((r) => {
    const items = r.items || [];
    const namedByHeader = matchesName(r.description, employee, employees);
    const namedItems = items.filter((it) => matchesName(it.description, employee, employees));
    if (!namedByHeader && !namedItems.length) return;
    const total = requestTotal(r);
    fundRequests.push({
      id: r.id, date: r.date, status: r.status || 'Pending', description: r.description || '', costHead: r.costHead || '',
      itemText: namedItems.map((it) => it.description).join('; '),
      total,
      // Only the lines that name them, unless the request itself does.
      namedAmount: namedByHeader || !namedItems.length ? total : sum(namedItems, (it) => it.amount),
    });
  });
  fundRequests.sort((a, b) => (a.date < b.date ? -1 : 1));
  const requestsByStatus = {};
  fundRequests.forEach((r) => { requestsByStatus[r.status] = (requestsByStatus[r.status] || 0) + r.namedAmount; });

  // ---- maintenance logs (mechanics): performed by them, or naming them
  const maintenance = [];
  (ctx.maintenanceLogs || []).filter((m) => inRange(m.date)).forEach((m) => {
    const performed = m.performedBy === employeeId;
    const named = !performed && (matchesName(m.description, employee, employees) || matchesName(m.contractorName, employee, employees));
    if (!performed && !named) return;
    maintenance.push({
      id: m.id, date: m.date, equipment: m.equipment || '', type: m.type || '', description: m.description || '',
      status: m.status || '', cost: m.cost || 0, how: performed ? 'Performed by' : 'Named in log',
    });
  });
  maintenance.sort((a, b) => (a.date < b.date ? -1 : 1));

  const sundayDates = new Set([...operatorDays, ...supervisorDays].filter((d) => d.sunday).map((d) => d.date));
  const role = `${employee.role || ''}`;
  return {
    employee: { id: employee.id, name: employee.name, role: employee.role || '', department: employee.department || '', status: employee.status || 'Active', dayRate: employee.dayRate || 0 },
    range: { from, to },
    roles: {
      operator: asOperator.length > 0 || /operator/i.test(role),
      supervisor: asSupervisor.length > 0 || /supervisor/i.test(role),
      mechanic: maintenance.some((m) => m.how === 'Performed by') || /mechanic|technician/i.test(role),
    },
    summary: {
      operatorDays: operatorDays.length,
      supervisorDays: supervisorDays.length,
      operatorHours: round2(sum(operatorDays, (d) => d.hours)),
      supervisorHours: round2(sum(supervisorDays, (d) => d.hours)),
      overtimeHours: round2(sum(operatorDays, (d) => d.overtimeHours)),
      sundayDays: sundayDates.size,
      operatorHectares: round2(sum(operatorDays, (d) => d.hectares)),
      supervisedHectares: round2(sum(supervisorDays, (d) => d.hectares)),
      operatorAllowance,
      sundayBonusTotal,
      payrollNet: dozerNet ? sum(confirmedLines, (l) => l.netPay) : null,
      payrollPaid: sum(confirmedLines, (l) => l.amountPaid),
      allowancePaymentsTotal: sum(allowancePayments, (p) => p.amount),
      monthlyNet: monthlyNet ? sum(confirmedMonthly, (l) => l.netPay) : null,
      monthlyPaid: sum(confirmedMonthly, (l) => l.amountPaid),
      requestCount: fundRequests.length,
      requestsByStatus,
      requestsTotal: sum(fundRequests, (r) => r.namedAmount),
      maintenanceCount: maintenance.length,
      maintenancePerformed: maintenance.filter((m) => m.how === 'Performed by').length,
      maintenanceCost: sum(maintenance.filter((m) => m.how === 'Performed by'), (m) => m.cost),
      balanceOwed: ctx.dozerBalanceOwed ? ctx.dozerBalanceOwed(employeeId) : null,
    },
    machines,
    daily,
    sundayBonuses,
    payrollLines,
    allowancePayments,
    monthlyLines,
    fundRequests,
    maintenance,
  };
}
