import { supabase } from './supabaseClient.js';

const LAST_BACKUP_KEY = 'emagrims_erp_last_backup';

// Every collection the app uses, its Supabase table, the prefix used to
// generate new IDs (via the next_record_id() Postgres function), and — for
// collections that used to store a nested array (invoice line items,
// payroll lines, etc.) — the child table that now holds those rows.
const CONFIG = {
  employees: { table: 'employees', prefix: 'EMP' },
  inventory: { table: 'inventory', prefix: 'INV' },
  customers: { table: 'customers', prefix: 'CUS' },
  suppliers: { table: 'suppliers', prefix: 'SUP' },
  invoices: { table: 'invoices', prefix: 'INV-2024', child: { key: 'items', table: 'invoice_items', fk: 'invoice_id' } },
  purchaseOrders: { table: 'purchase_orders', prefix: 'PO-2024', child: { key: 'items', table: 'purchase_order_items', fk: 'purchase_order_id' } },
  expenses: { table: 'expenses', prefix: 'EXP' },
  operations: { table: 'operations', prefix: 'OPS' },
  maintenanceLogs: { table: 'maintenance_logs', prefix: 'MNT' },
  dieselReceipts: { table: 'diesel_receipts', prefix: 'DR' },
  dieselStockCounts: { table: 'diesel_stock_counts', prefix: 'SC' },
  leaveRequests: { table: 'leave_requests', prefix: 'LV' },
  attendanceLogs: { table: 'attendance_logs', prefix: 'ATT' },
  fuelingVouchers: { table: 'fueling_vouchers', prefix: 'FV' },
  fundRequests: { table: 'fund_requests', prefix: 'FR', child: { key: 'items', table: 'fund_request_items', fk: 'fund_request_id' } },
  payrollRuns: { table: 'payroll_runs', prefix: 'PR', child: { key: 'lines', table: 'payroll_lines', fk: 'payroll_run_id' } },
};

const COLLECTIONS = Object.keys(CONFIG);

// All the field names in this app follow a plain camelCase <-> snake_case
// convention (dateHired <-> date_hired, accountNumber <-> account_number,
// etc.) with no exceptions, so a single generic mapper covers every
// collection instead of writing 16 bespoke ones.
function camelToSnakeKey(key) {
  return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}
function snakeToCamelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function rowToDb(record) {
  const out = {};
  Object.entries(record).forEach(([k, v]) => {
    out[camelToSnakeKey(k)] = v === undefined ? null : v;
  });
  return out;
}
function rowFromDb(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    out[snakeToCamelKey(k)] = v;
  });
  return out;
}

function mapRowFromDb(row, cfg) {
  if (!cfg.child) return rowFromDb(row);
  const { [cfg.child.table]: childRows, ...rest } = row;
  const camel = rowFromDb(rest);
  camel[cfg.child.key] = (childRows || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c) => {
      const { id, sort_order, [cfg.child.fk]: fk, ...itemRest } = c;
      return rowFromDb(itemRest);
    });
  return camel;
}

async function nextId(prefix) {
  const { data, error } = await supabase.rpc('next_record_id', { p_prefix: prefix });
  if (error) throw new Error(`Could not generate an ID (${error.message}).`);
  return data;
}

async function fetchCollection(key) {
  const cfg = CONFIG[key];
  const selectCols = cfg.child ? `*, ${cfg.child.table}(*)` : '*';
  const { data, error } = await supabase.from(cfg.table).select(selectCols);
  if (error) throw new Error(`Could not load ${key} (${error.message}).`);
  return (data || []).map((row) => mapRowFromDb(row, cfg));
}

async function upsertRow(key, id, record) {
  const cfg = CONFIG[key];
  const childItems = cfg.child ? record[cfg.child.key] : undefined;
  const rest = { ...record };
  if (cfg.child) delete rest[cfg.child.key];

  const payload = rowToDb({ ...rest, id });
  const { error } = await supabase.from(cfg.table).upsert(payload);
  if (error) throw new Error(`Could not save this record (${error.message}).`);

  if (cfg.child) {
    const { error: delErr } = await supabase.from(cfg.child.table).delete().eq(cfg.child.fk, id);
    if (delErr) throw new Error(`Could not save the line items (${delErr.message}).`);
    const items = (childItems || []).filter(Boolean);
    if (items.length) {
      const rows = items.map((it, idx) => ({ ...rowToDb(it), [cfg.child.fk]: id, sort_order: idx }));
      const { error: insErr } = await supabase.from(cfg.child.table).insert(rows);
      if (insErr) throw new Error(`Could not save the line items (${insErr.message}).`);
    }
  }
}

let state = COLLECTIONS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});

export const store = {
  async init() {
    await store.refreshAll();
  },

  async refreshAll() {
    const entries = await Promise.all(COLLECTIONS.map(async (key) => [key, await fetchCollection(key)]));
    state = Object.fromEntries(entries);
  },

  async refreshCollection(key) {
    state[key] = await fetchCollection(key);
  },

  get(collection) {
    return state[collection] || [];
  },
  find(collection, id) {
    return (state[collection] || []).find((r) => r.id === id) || null;
  },

  async add(collection, record) {
    const cfg = CONFIG[collection];
    const id = record.id || (await nextId(cfg.prefix));
    await upsertRow(collection, id, record);
    await store.refreshCollection(collection);
    return store.find(collection, id);
  },
  async update(collection, id, patch) {
    const existing = store.find(collection, id) || {};
    await upsertRow(collection, id, { ...existing, ...patch });
    await store.refreshCollection(collection);
    return store.find(collection, id);
  },
  async remove(collection, id) {
    const cfg = CONFIG[collection];
    const { error } = await supabase.from(cfg.table).delete().eq('id', id);
    if (error) throw new Error(`Could not delete this record (${error.message}).`);
    await store.refreshCollection(collection);
  },

  all() {
    return state;
  },
  exportSnapshot() {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    return JSON.stringify(state, null, 2);
  },
  async importSnapshot(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error('That file is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.employees)) {
      throw new Error('This file does not look like a valid Emagrims ERP backup.');
    }
    for (const key of COLLECTIONS) {
      const rows = Array.isArray(parsed[key]) ? parsed[key] : [];
      const cfg = CONFIG[key];
      // eslint-disable-next-line no-await-in-loop
      await supabase.from(cfg.table).delete().neq('id', '__none__');
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        await upsertRow(key, row.id, row);
      }
    }
    await store.refreshAll();
  },
  getLastBackupAt() {
    return localStorage.getItem(LAST_BACKUP_KEY);
  },
};

export { COLLECTIONS };
