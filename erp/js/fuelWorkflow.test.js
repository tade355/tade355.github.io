import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelRequirement,workflowCosts,workflowOutstanding,lineBalance,stationRelease} from './fuelWorkflow.js';
test('target hours, reserve and overtime use established consumption rates',()=>{
 assert.equal(fuelRequirement({hours:8,closing:40}),210);
 assert.equal(fuelRequirement({hours:10,closing:40}),250);
 assert.equal(fuelRequirement({hours:4,reserve:0,closing:120}),0);
 assert.throws(()=>fuelRequirement({hours:-1}));
});
test('late costs affect service date, approved amount replaces estimate and payment is not another cost',()=>{
 const r={kind:'Cost',project:'Site A',status:'Submitted',data:{incurredDate:'2026-11-10',category:'Worker transport',amount:50000},events:[]};
 assert.equal(workflowCosts([r],'Site A','2026-11-10','2026-11-10').workerTransport,50000);
 assert.equal(workflowCosts([r],'Site A','2026-11-10','2026-11-10').provisional,50000);
 r.status='Approved';r.data.approvedAmount=40000;r.events=[{type:'payment',amount:10000,date:'2026-11-12'}];
 assert.equal(workflowCosts([r],'Site A','2026-11-10','2026-11-10').workerTransport,40000);
 assert.equal(workflowCosts([r],'Site A','2026-11-12','2026-11-12').workerTransport,0);
 assert.equal(workflowOutstanding(r),30000);
 assert.equal(workflowCosts([r],'Site B','2026-11-10','2026-11-10').workerTransport,0);
 r.status='Rejected';assert.equal(workflowCosts([r],'Site A','2026-11-10','2026-11-10').workerTransport,0);
});
test('collections create debt, only nonproduction usage adds fuel cost, partial payments reduce debt',()=>{
 const r={kind:'Fuel',project:'Site A',status:'Collected',data:{lines:[{id:'a',product:'Diesel'},{id:'b',product:'PMS'},{id:'c',product:'Oil'}]},events:[
 {type:'collection',lineId:'a',quantity:100,delivered:95,unitPrice:1500},
 {type:'issue',lineId:'a',quantity:50,unitPrice:1500,date:'2026-11-12',purpose:'Production'},
 {type:'issue',lineId:'b',quantity:10,unitPrice:1000,date:'2026-11-12',purpose:'Vehicles / bikes'},
 {type:'issue',lineId:'c',quantity:5,unitPrice:2000,date:'2026-11-12',purpose:'Maintenance'},
 {type:'payment',amount:50000,date:'2026-11-12'}]};
 const costs=workflowCosts([r],'Site A','2026-11-12','2026-11-12');
 assert.equal(costs.pms,10000);assert.equal(costs.maintenance,10000);assert.equal(costs.other,0);
 assert.equal(workflowOutstanding(r),100000);assert.equal(lineBalance(r,'a').delivered,95);assert.equal(lineBalance(r,'a').issued,50);
});
test('unapproved requests cannot generate station release',()=>{
 assert.throws(()=>stationRelease({kind:'Fuel',status:'Submitted'}));
});

test('multi-day reimbursements are spread across incurred days and replace estimated diesel logistics',()=>{
 const r={kind:'Cost',project:'Site A',status:'Submitted',data:{incurredDate:'2026-11-10',incurredTo:'2026-11-12',category:'Diesel transport',amount:90000},events:[]};
 const oneDay=workflowCosts([r],'Site A','2026-11-11','2026-11-11');
 assert.equal(oneDay.dieselTransport,30000);
 assert.deepEqual(oneDay.dieselDates,['2026-11-11']);
 assert.equal(oneDay.provisional,30000);
 assert.equal(workflowCosts([r],'Site A','2026-11-10','2026-11-12').dieselTransport,90000);
});
