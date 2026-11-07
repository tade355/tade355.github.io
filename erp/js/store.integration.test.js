import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('store preserves failed collections, blocks incomplete exports and sends checked versions', async () => {
  const rows = {
    expenses: [{ id: 'EXP-1', amount: 100, updated_at: '2026-11-01T00:00:00Z' }],
    erp_module_status: [{ module_key: 'operations', label: 'Field Operations', status: 'Active' }],
  };
  const calls = [];
  let failedTable = null; let stale = false; let stampFailure = false; let next = 0;
  globalThis.localStorage = { setItem() {}, getItem() { return null; } };
  globalThis.__storeTestClient = {
    from(table) {
      const query = { field: null, id: null, one: false, sortColumn: null,
        select(field) { this.field = field; return this; }, order(column) { this.sortColumn = column; return this; }, range() { return this; },
        eq(key, value) { if (key === 'id') this.id = value; return this; }, maybeSingle() { this.one = true; return this; },
        then(resolve, reject) {
          const error = table === failedTable ? { message: 'Unavailable' }
            : table === 'erp_module_status' && this.sortColumn && this.sortColumn !== 'module_key'
              ? { code: '42703', message: `column erp_module_status.${this.sortColumn} does not exist` }
              : stampFailure && this.field === 'updated_at' ? { code: 'NETWORK', message: 'Temporary failure' } : null;
          let data = (rows[table] || []).filter((r) => !this.id || r.id === this.id);
          if (this.one) data = data[0] || null;
          return Promise.resolve({ data, error }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'next_record_id') return { data: `EXP-${++next}`, error: null };
      if (stale) return { error: { message: 'Record changed', code: 'P0001' } };
      rows[args.p_table] = [...(rows[args.p_table] || []).filter((r) => r.id !== args.p_row.id), { ...args.p_row, updated_at: '2026-11-02T00:00:00Z' }];
      return { data: null, error: null };
    },
  };
  let source = await readFile(new URL('./store.js', import.meta.url), 'utf8');
  source = source.replace("import { supabase } from './supabaseClient.js';", 'const supabase = globalThis.__storeTestClient;');
  for (const helper of ['storeHelpers.js', 'backupSafety.js', 'requestDuplicates.js']) source = source.replace(`'./${helper}'`, JSON.stringify(new URL(helper, import.meta.url).href));
  const { store, COLLECTIONS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  await store.init();
  assert.equal(store.getHealth().moduleStatuses.ok, true, 'readiness rows load using module_key, not a nonexistent id');
  assert.equal(store.get('moduleStatuses')[0].moduleKey, 'operations');
  assert.doesNotThrow(() => store.assertComplete());
  const exported = store.exportSnapshot();
  assert.equal(JSON.parse(exported)._backup.counts.expenses, 1);
  failedTable = 'expenses';
  await store.refreshAll();
  assert.equal(store.get('expenses')[0].amount, 100);
  assert.throws(() => store.exportSnapshot(), /incomplete/);
  failedTable = null;
  await store.refreshAll();
  const added = await store.add('expenses', { amount: 50 });
  assert.equal(added.id, 'EXP-2'); // counter skipped the existing EXP-1
  assert.equal(calls.find((c) => c.name === 'save_record_checked').args.p_create, true);
  await store.update('expenses', 'EXP-1', { amount: 110 });
  assert.equal(calls.at(-1).args.p_expected_updated_at, '2026-11-01T00:00:00Z');
  stale = true;
  await assert.rejects(() => store.update('expenses', 'EXP-1', { amount: 999 }), /Record changed/);
  assert.equal(store.find('expenses', 'EXP-1').amount, 110);
  stale = false; stampFailure = true;
  await assert.rejects(() => store.update('expenses', 'EXP-1', { amount: 120 }), /Temporary failure/);
  stampFailure = false;
  await store.update('expenses', 'EXP-1', { amount: 120 });
  assert.equal(store.find('expenses', 'EXP-1').amount, 120);
  const beforeRestore = calls.length;
  await assert.rejects(() => store.importSnapshot(exported), /Browser replacement is disabled/);
  await assert.rejects(() => store.importSnapshot(JSON.stringify({ employees: [] })), /Incomplete backup/);
  assert.equal(calls.length, beforeRestore);
  assert.equal(COLLECTIONS.length, 41);
  delete globalThis.__storeTestClient;
});

