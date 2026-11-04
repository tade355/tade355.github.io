import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortRows } from './tableSort.js';
test('table sorting uses numeric values, natural machine numbers, stable ties and missing values last', () => {
  assert.deepEqual(sortRows([null, 10, 2, 0], x => x, 'desc'), [10, 2, 0, null]);
  assert.deepEqual(sortRows(['Dozer 10','Dozer 2','Dozer 1'], x => x, 'asc'), ['Dozer 1','Dozer 2','Dozer 10']);
  const rows=[{id:1,v:2},{id:2,v:2},{id:3,v:1}];
  assert.deepEqual(sortRows(rows, x=>x.v,'asc').map(x=>x.id),[3,1,2]);
  assert.deepEqual(rows.map(x=>x.id),[1,2,3]);
  assert.deepEqual(sortRows(['₦1,000','₦200','₦-50'],x=>x,'asc'),['₦-50','₦200','₦1,000']);
  assert.deepEqual(sortRows(['1.2','1.10'],x=>x,'asc'),['1.10','1.2']);
});
