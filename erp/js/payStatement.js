const num = (v) => Number(v) || 0;
const approved = (r) => ['Approved', 'Paid'].includes(r.status);

// Only this employee's rows enter the statement. Approved figures are
// authoritative; post-payroll work is an estimate, never a new payroll entry.
export function buildPayStatement(ctx, employeeId, allowanceForRows, matchesPayment) {
  const entries = [];
  for (const run of (ctx.payrollRuns || []).filter(approved)) {
    for (const l of (run.lines || []).filter((r) => r.employeeId === employeeId)) {
      entries.push({id:run.id, date:String(run.month || '').slice(0,7)+'-01', period:String(run.month || '').slice(0,7),
        type:'Salary', status:run.status, base:num(l.baseSalary), extra:num(l.bonus), deductions:num(l.deductions), earned:num(l.baseSalary)+num(l.bonus)-num(l.deductions), paid:num(l.amountPaid)});
    }
  }
  let lastCovered = '';
  for (const run of (ctx.dozerPayrollRuns || []).filter(approved)) {
    const lines = (run.lines || []).filter((r) => r.employeeId === employeeId);
    if (lines.length && run.periodEnd > lastCovered) lastCovered = run.periodEnd;
    for (const l of lines) entries.push({id:run.id, date:run.periodEnd || run.periodStart || '',
      period:[run.periodStart,run.periodEnd].filter(Boolean).join(' to '), type:'Operator allowance', status:run.status,
      base:num(l.daysWorked)*num(l.dayRate), extra:num(l.overtimeHours)*num(l.overtimeRate)+num(l.businessEarnings), deductions:num(l.deductions), equipment:l.equipment || '', days:num(l.daysWorked), dayRate:num(l.dayRate), overtimeHours:num(l.overtimeHours),
      earned:num(l.daysWorked)*num(l.dayRate)+num(l.overtimeHours)*num(l.overtimeRate)+num(l.businessEarnings)-num(l.deductions), paid:num(l.amountPaid)});
  }
  for (const e of ctx.expenses || []) {
    if (matchesPayment(employeeId,e.payee,e.category)) entries.push({id:e.id,date:e.date || '',period:e.date || '',
      type:'Allowance payment',status:'Recorded',earned:0,paid:num(e.amount)});
  }
  const groups = new Map();
  for (const o of ctx.operations || []) {
    if (o.operatorId !== employeeId || !o.date || (lastCovered && o.date <= lastCovered)) continue;
    const rows = groups.get(o.date) || []; rows.push(o); groups.set(o.date,rows);
  }
  for (const [date,rows] of groups) {
    const earned = num(allowanceForRows(rows));
    if (earned) entries.push({id:'Work '+date,date,period:date,type:'Allowance estimate',status:'Estimated',estimated:true,
      equipment:[...new Set(rows.map(o=>o.equipment))].join(', '),hours:rows.reduce((s,o)=>s+num(o.hoursWorked),0),earned,paid:0});
  }
  entries.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  let balance = 0;
  entries.forEach(r=>{balance+=r.earned-r.paid;r.balance=balance;});
  return entries;
}

export function payStatementPeriod(entries,month='') {
  const before = month ? entries.filter(r=>r.date.slice(0,7)<month) : [];
  const rows = month ? entries.filter(r=>r.date.slice(0,7)===month) : entries;
  const sum = (list,key)=>list.reduce((s,r)=>s+num(r[key]),0);
  const recorded = rows.filter(r=>!r.estimated);
  const opening = sum(before,'earned')-sum(before,'paid');
  const openingRecorded = sum(before.filter(r=>!r.estimated),'earned')-sum(before,'paid');
  const earned = sum(recorded,'earned'), paid = sum(rows,'paid'), estimated = sum(rows.filter(r=>r.estimated),'earned');
  return {month,rows,recorded,opening,openingRecorded,earned,paid,estimated,
    closingRecorded:openingRecorded+earned-paid,closing:opening+earned+estimated-paid};
}
