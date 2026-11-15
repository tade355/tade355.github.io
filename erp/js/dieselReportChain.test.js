import test from 'node:test';
import assert from 'node:assert/strict';
import { previousDieselClosing, unallocatedDieselSupply, lastDieselReading, precedingDieselReports } from './dieselReportChain.js';
const first = { id:'a', date:'2026-11-12', equipment:'Ogbomo Dozer (Pastor)', timeResumed:'09:00', timeClosed:'17:00', dieselSupplied:470, openingDiesel:470, fuelUsed:150, closingDiesel:320 };
const office = { id:'b',date:'2026-11-13',equipment:'Pastor (Osaro)',timeResumed:'08:00',timeClosed:'10:00',openingDiesel:320,fuelUsed:50,closingDiesel:270 };
const business = { id:'c',date:'2026-11-13',equipment:'Pastor (Osaro)',siteName:'Site',timeResumed:'10:00',timeClosed:'11:00',openingDiesel:270,fuelUsed:25,closingDiesel:245 };
test('office then business carries 270 forward and closes at 245',()=>{
 assert.equal(previousDieselClosing([office,first],business),270);
 assert.equal(previousDieselClosing([office,first],business)-business.fuelUsed,245);
});
test('editing a report excludes itself and later reports',()=>assert.equal(previousDieselClosing([business,office,first],office),320));
test('last daily reading is chronological regardless of database order',()=>{
 assert.equal(lastDieselReading([business,office]).closingDiesel,245);
 assert.equal(lastDieselReading([office,business]).closingDiesel,245);
});
test('the next working day carries the final reading',()=>assert.equal(previousDieselClosing([office,business,first],{equipment:business.equipment,date:'2026-11-15',timeResumed:'08:00'}),245));
test('fuel delivery is not duplicated on a second same-day report',()=>{
 const later={...business,date:'2026-11-12',timeResumed:'18:00'};
 assert.equal(unallocatedDieselSupply([first],later,[{equipment:first.equipment,date:first.date,project:'Site',litres:470}]),0);
});
test('additional supply is allocated only once',()=>assert.equal(unallocatedDieselSupply([first],{...business,date:first.date,timeResumed:'18:00'},[{equipment:first.equipment,date:first.date,project:'Site',litres:500}]),30));
test('confirmed physical tank reading remains authoritative',()=>assert.equal(previousDieselClosing([{...office,closingDiesel:260}],business),260));
test('separate machines never share a tank balance',()=>assert.equal(previousDieselClosing([office],{...business,equipment:'Other'}),null));

