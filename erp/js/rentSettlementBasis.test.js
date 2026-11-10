import test from 'node:test';
import assert from 'node:assert/strict';
import { currentOwnerSettlements } from './rentSettlementBasis.js';
test('confirmed opening balance replaces history, preserving later rent', () => {
 const rows = [
 {id:'old',periodStart:'2026-07-22',periodEnd:'2026-10-16'},
 {id:'opening',periodStart:'2026-11-10',periodEnd:'2026-11-10',isOpeningBalance:true},
 {id:'future',periodStart:'2026-11-11',periodEnd:'2026-11-12'}
 ];
 assert.deepEqual(currentOwnerSettlements(rows).map(r=>r.id),['opening','future']);
 assert.equal(rows.length,3);
});
test('latest opening supersedes earlier opening and overlapping periods', () => {
 const rows=[
 {id:'first',periodEnd:'2026-11-01',isOpeningBalance:true},
 {id:'overlap',periodStart:'2026-11-09',periodEnd:'2026-11-11'},
 {id:'latest',periodEnd:'2026-11-10',isOpeningBalance:true}
 ];
 assert.deepEqual(currentOwnerSettlements(rows).map(r=>r.id),['latest']);
});
test('legacy settlements remain unchanged without an opening balance', () => {
 const rows=[{id:'old'}]; assert.deepEqual(currentOwnerSettlements(rows),rows);
});
