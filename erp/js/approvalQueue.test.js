import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalTimesByRequest, groupApprovedPayments, nigeriaDay } from './approvalQueue.js';

test('new approval of old request comes before newly submitted older approval', () => {
 const times=approvalTimesByRequest([
 {request_id:'FR-1',to_status:'Approved',acted_at:'2026-11-11T09:00:00Z'},
 {request_id:'FR-2',to_status:'Approved',acted_at:'2026-11-10T09:00:00Z'}]);
 const groups=groupApprovedPayments([{id:'FR-2',status:'Approved',date:'2026-11-10'},{id:'FR-1',status:'Approved',date:'2026-08-01'}],times,new Date('2026-11-11T12:00:00Z'));
 assert.equal(groups[0].rows[0].id,'FR-1');assert.equal(groups[1].rows[0].id,'FR-2');
});
test('WAT boundary groups 11 PM UTC as today in Nigeria', () => {
 assert.equal(nigeriaDay('2026-11-10T23:30:00Z'),'2026-11-11');
 const groups=groupApprovedPayments([{id:'a',status:'Approved',approvedAt:'2026-11-10T23:30:00Z'}],new Map(),new Date('2026-11-11T00:00:00Z'));
 assert.equal(groups[0].rows.length,1);
});
test('latest approval wins; unrelated edits do not change approval age', () => {
 const times=approvalTimesByRequest([{request_id:'a',to_status:'Approved',acted_at:'2026-11-09T10:00:00Z'},
 {request_id:'a',to_status:'Pending',acted_at:'2026-11-10T10:00:00Z'},
 {request_id:'a',to_status:'Partially Approved',acted_at:'2026-11-11T10:00:00Z'}]);
 assert.equal(times.get('a'),'2026-11-11T10:00:00Z');
});
test('unknown approval date stays in Older and paid or pending requests stay out', () => {
 const groups=groupApprovedPayments([{id:'old',status:'Approved',date:'2026-11-11',updatedAt:'2026-11-11T10:00:00Z'},
 {id:'paid',status:'Paid'},{id:'pending',status:'Pending'}],new Map(),new Date('2026-11-11T12:00:00Z'));
 assert.equal(groups[0].rows.length,0);assert.equal(groups[2].rows[0].queueApprovedAt,null);assert.equal(groups[2].rows.length,1);
});
test('newest approvals first within group, with stable numeric ID fallback', () => {
 const groups=groupApprovedPayments([{id:'FR-2',status:'Approved',approvedAt:'2026-11-11T08:00:00Z'},
 {id:'FR-3',status:'Approved',approvedAt:'2026-11-11T09:00:00Z'},
 {id:'FR-10',status:'Approved',approvedAt:'2026-11-11T09:00:00Z'}],new Map(),new Date('2026-11-11T12:00:00Z'));
 assert.deepEqual(groups[0].rows.map(r=>r.id),['FR-10','FR-3','FR-2']);
});
