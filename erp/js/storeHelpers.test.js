import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages, isStale } from './storeHelpers.js';

const table = (n) => Array.from({ length: n }, (_, i) => ({ id: `R-${String(i).padStart(5, '0')}` }));
const server = (rows, pageSize) => async (from, to) => {
  assert.ok(to - from + 1 === pageSize, 'asks for a full page');
  return rows.slice(from, to + 1);
};

test('a table bigger than one page is read in full', async () => {
  const rows = table(2345);
  const got = await fetchAllPages(server(rows, 1000));
  assert.equal(got.length, 2345);
  assert.equal(got[2344].id, 'R-02344');
  assert.equal(new Set(got.map((r) => r.id)).size, 2345);
});

test('exact multiples of the page size and small tables are handled', async () => {
  assert.equal((await fetchAllPages(server(table(2000), 1000))).length, 2000);
  assert.equal((await fetchAllPages(server(table(0), 1000))).length, 0);
  assert.equal((await fetchAllPages(server(table(7), 1000))).length, 7);
});

test('a failing page stops the load instead of returning part of the table', async () => {
  let calls = 0;
  await assert.rejects(fetchAllPages(async () => { calls += 1; if (calls === 2) throw new Error('boom'); return table(1000); }), /boom/);
});

test('a record changed by someone else is stale; an unstamped one is not', () => {
  assert.equal(isStale('2026-10-19T10:00:00.000+00:00', '2026-10-19T10:00:00+00:00'), false);
  assert.equal(isStale('2026-10-19T10:00:00Z', '2026-10-19T10:05:00Z'), true);
  assert.equal(isStale(undefined, '2026-10-19T10:05:00Z'), false);
  assert.equal(isStale('2026-10-19T10:00:00Z', null), false);
});
