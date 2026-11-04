import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateRequests, duplicateKind, normaliseDescription, requestTotal } from './requestDuplicates.js';

const req = (id, date, description, amount, extra = {}) => ({ id, date, description, status: 'Pending', items: [{ amount }], ...extra });
const existing = [
  req('FR-90', '2026-10-14', 'Oil purchase for Tope', 100000),
  req('FR-91', '2026-10-14', 'Hiring bike and diesel transportation', 45000),
  req('FR-80', '2026-09-01', 'Oil purchase for Tope', 100000),
];

test('descriptions are compared without case, punctuation or brackets', () => {
  assert.equal(normaliseDescription('  Oil  purchase, for TOPE (paid 17 Oct) '), 'oil purchase for tope');
  assert.equal(normaliseDescription(null), '');
});

test('totals come from the items, or from a plain total on the candidate', () => {
  assert.equal(requestTotal({ items: [{ amount: 5 }, { amount: 7 }] }), 12);
  assert.equal(requestTotal({ total: 900 }), 900);
  assert.equal(requestTotal({}), 0);
});

test('same description and total within 14 days is a recent duplicate', () => {
  const c = { date: '2026-10-16', description: 'oil purchase for tope', items: [{ amount: 100000 }] };
  const hits = findDuplicateRequests(c, existing);
  assert.deepEqual(hits.map((r) => r.id), ['FR-90', 'FR-80']); // recent first, then the weaker earlier one
  assert.equal(duplicateKind(c, existing[0]), 'recent');
  assert.equal(duplicateKind(c, existing[2]), 'earlier');
});

test('the window is a parameter and counts both directions', () => {
  const c = { date: '2026-10-30', description: 'Oil purchase for Tope', total: 100000 };
  assert.equal(duplicateKind(c, existing[0]), 'earlier'); // 16 days
  assert.equal(duplicateKind(c, existing[0], { days: 20 }), 'recent');
  assert.equal(duplicateKind({ ...c, date: '2026-10-01' }, existing[0]), 'recent'); // candidate before the existing one
});

test('a different total or description is not a duplicate', () => {
  assert.deepEqual(findDuplicateRequests({ date: '2026-10-16', description: 'Oil purchase for Tope', total: 90000 }, existing), []);
  assert.deepEqual(findDuplicateRequests({ date: '2026-10-16', description: 'Oil purchase for Joshua', total: 100000 }, existing), []);
  assert.deepEqual(findDuplicateRequests({ date: '2026-10-16', description: '', total: 100000 }, existing), []);
});

test('a late-paid request keeps its original date in the description and still matches', () => {
  const paid = [req('FR-70', '2026-10-17', 'Oil purchase for Tope (originally 14/10/2026)', 100000), req('FR-71', '2026-10-17', 'Oil purchase for Tope - requested 14 Oct', 100000)];
  const c = { date: '2026-10-15', description: 'Oil purchase for Tope', total: 100000 };
  assert.deepEqual(findDuplicateRequests(c, paid).map((r) => r.id), ['FR-70', 'FR-71']);
  // extra words that are not a date do not make a match
  assert.deepEqual(findDuplicateRequests(c, [req('FR-72', '2026-10-17', 'Oil purchase for Tope and Joshua', 100000)]), []);
});

test('editing a request does not report the request itself', () => {
  const c = { id: 'FR-90', date: '2026-10-14', description: 'Oil purchase for Tope', items: [{ amount: 100000 }] };
  assert.deepEqual(findDuplicateRequests(c, existing).map((r) => r.id), ['FR-80']);
});

test('a missing date still reports the request as an earlier match; nothing existing gives an empty list', () => {
  assert.equal(duplicateKind({ description: 'Oil purchase for Tope', total: 100000 }, existing[0]), 'earlier');
  assert.deepEqual(findDuplicateRequests({ description: 'x', total: 1 }, undefined), []);
  assert.deepEqual(findDuplicateRequests({ description: 'Oil purchase for Tope', total: 100000 }, []), []);
});

test('duplicate visibility keeps the newest of any number of copies, preserves payments and separate service days', async () => {
 const { uniqueFinancialRecords } = await import('./requestDuplicates.js');
 const row=(id,date,status='Pending')=>({id,date,project:'Rex',description:'Rain boots',items:[{amount:40000}],status,createdAt:'2026-11-04T00:00:00Z'});
 const rows=[row('FR-1','2026-11-03','Paid'),row('FR-2','2026-11-03'),row('FR-3','2026-11-03'),row('FR-4','2026-11-02')];
 const visible=uniqueFinancialRecords(rows,'fundRequests');
 assert.equal(visible.length,2);assert.equal(visible.find(r=>r.date==='2026-11-03').id,'FR-3');assert.equal(visible.find(r=>r.id==='FR-3').status,'Paid');
 assert.equal(uniqueFinancialRecords(rows,'fundRequests',[{sourceCollection:'fundRequests',sourceId:'FR-4'}]).length,1);
 assert.equal(rows[2].status,'Pending');
});
test('same receipt expense copies collapse but split amounts and projects remain separate', async () => {
 const { uniqueFinancialRecords } = await import('./requestDuplicates.js');
 const a={id:'EXP-1',date:'2026-11-03',project:'Rex',category:'Repairs',amount:100,description:'Repair. Receipt EXTTRF|123456'};
 const rows=[a,{...a,id:'EXP-2',date:'2026-11-04'},{...a,id:'EXP-3',amount:200},{...a,id:'EXP-4',project:'Other'}];
 const visible=uniqueFinancialRecords(rows,'expenses');assert.equal(visible.length,3);assert.ok(visible.some(r=>r.id==='EXP-2'));
});
