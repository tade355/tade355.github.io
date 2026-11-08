import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPayStatement,payStatementPeriod} from './payStatement.js';
const line={employeeId:'A',daysWorked:1,dayRate:30000,overtimeHours:2,overtimeRate:10000,amountPaid:20000};
const ctx={payrollRuns:[{id:'PR1',month:'2026-10',status:'Approved',lines:[{employeeId:'A',baseSalary:100000,bonus:1000,deductions:1000,amountPaid:70000},{employeeId:'B',baseSalary:999999}]}],
dozerPayrollRuns:[{id:'DPR1',periodStart:'2026-11-01',periodEnd:'2026-11-02',status:'Paid',lines:[line]}],
operations:[{operatorId:'A',date:'2026-11-02',hoursWorked:8},{operatorId:'A',date:'2026-11-03',hoursWorked:8},{operatorId:'B',date:'2026-11-04',hoursWorked:8}],
expenses:[{id:'EXP1',date:'2026-11-04',payee:'A',category:'Allowance',amount:10000},{id:'EXP2',date:'2026-11-04',payee:'B',amount:9999}]};
const build=c=>buildPayStatement(c,'A',rows=>rows.reduce((s,o)=>s+o.hoursWorked*3750,0),(id,payee,category)=>id===payee&&category==='Allowance');
test('personal rows exclude other staff, drafts and already-covered work',()=>{
 const rows=build({...ctx,payrollRuns:[...ctx.payrollRuns,{id:'draft',month:'2026-11',status:'Draft',lines:[{employeeId:'A',baseSalary:99999}]}]});
 assert.equal(rows.length,4);assert.equal(rows.filter(r=>r.estimated).length,1);
 assert.equal(rows.find(r=>r.estimated).earned,30000);
 assert.equal(rows.at(-1).balance,80000);
});
test('monthly statement carries opening balance and separates approved earnings from estimates',()=>{
 const s=payStatementPeriod(build(ctx),'2026-11');
 assert.equal(s.openingRecorded,30000);assert.equal(s.earned,50000);
 assert.equal(s.paid,30000);assert.equal(s.estimated,30000);
 assert.equal(s.closingRecorded,50000);assert.equal(s.closing,80000);
 assert.ok(s.recorded.every(r=>!r.estimated));
});
test('payment-only runs, deductions, overtime, fractional days and advances',()=>{
 const rows=build({...ctx,payrollRuns:[],operations:[],expenses:[],dozerPayrollRuns:[
 {id:'1',periodEnd:'2026-11-02',status:'Approved',lines:[{...line,daysWorked:.5,deductions:5000,businessEarnings:10000}]},
 {id:'2',periodEnd:'2026-11-03',status:'Paid',lines:[{employeeId:'A',amountPaid:100000}]}]});
 assert.equal(rows[0].earned,40000);assert.equal(payStatementPeriod(rows).closing,-80000);
});
test('cross-month run is booked at period end without inventing daily allocation',()=>{
 const rows=build({dozerPayrollRuns:[{id:'1',periodStart:'2026-10-28',periodEnd:'2026-11-02',status:'Approved',lines:[line]}]});
 assert.equal(payStatementPeriod(rows,'2026-10').rows.length,0);
 assert.equal(payStatementPeriod(rows,'2026-11').earned,50000);
 assert.match(rows[0].period,/2026-10-28 to 2026-11-02/);
});
test('no records produces zero balances',()=>assert.equal(payStatementPeriod(build({})).closing,0));
