import { supabase } from './supabaseClient.js';
import { fetchAllPages, isStale } from './storeHelpers.js';

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
  projects: { table: 'projects', prefix: 'PRJ' },
  invoices: { table: 'invoices', prefix: 'INV-2024', child: { key: 'items', table: 'invoice_items', fk: 'invoice_id' } },
  purchaseOrders: { table: 'purchase_orders', prefix: 'PO-2024', child: { key: 'items', table: 'purchase_order_items', fk: 'purchase_order_id' } },
  expenses: { table: 'expenses', prefix: 'EXP' },
  operations: { table: 'operations', prefix: 'OPS' },
  maintenanceLogs: { table: 'maintenance_logs', prefix: 'MNT' },
  machineStatusReports: { table: 'machine_status_reports', prefix: 'MSR', child: { key: 'lines', table: 'machine_status_report_lines', fk: 'report_id' } },
  dieselReceipts: { table: 'diesel_receipts', prefix: 'DR' },
  dieselStockCounts: { table: 'diesel_stock_counts', prefix: 'SC' },
  leaveRequests: { table: 'leave_requests', prefix: 'LV' },
  attendanceLogs: { table: 'attendance_logs', prefix: 'ATT' },
  fuelingVouchers: { table: 'fueling_vouchers', prefix: 'FV' },
  fundRequests: { table: 'fund_requests', prefix: 'FR', child: { key: 'items', table: 'fund_request_items', fk: 'fund_request_id' } },
  payrollRuns: { table: 'payroll_runs', prefix: 'PR', child: { key: 'lines', table: 'payroll_lines', fk: 'payroll_run_id' } },
  financialEntries: { table: 'financial_entries', prefix: 'FE' },
  dozerPayrollRuns: { table: 'dozer_payroll_runs', prefix: 'DPR', child: { key: 'lines', table: 'dozer_payroll_lines', fk: 'dozer_payroll_run_id' } },
  dozerOwnerSettlements: { table: 'dozer_owner_settlements', prefix: 'DOS' },
  staffMemos: { table: 'staff_memos', prefix: 'MEMO' },
  dozerRateHistory: { table: 'dozer_rate_history', prefix: 'DRH' },
  projectRateHistory: { table: 'project_rate_history', prefix: 'PRH' },
  noticeBoardPosts: { table: 'notice_board_posts', prefix: 'NB' },
  fuelCreditCollections: { table: 'fuel_credit_collections', prefix: 'FCC' },
  fuelCreditPayments: { table: 'fuel_credit_payments', prefix: 'FCP' },
  dozerPartWithdrawals: { table: 'dozer_part_withdrawals', prefix: 'DPW' },
  assets: { table: 'assets', prefix: 'AST' },
  inventoryWithdrawals: { table: 'inventory_withdrawals', prefix: 'IW' },
  dieselStationPrepayments: { table: 'diesel_station_prepayments', prefix: 'DSP' },
  dieselSiteDistributions: { table: 'diesel_site_distributions', prefix: 'DSD' },
  invoicePayments: { table: 'invoice_payments', prefix: 'IVP' },
  loans: { table: 'loans', prefix: 'LN' },
  loanRepayments: { table: 'loan_repayments', prefix: 'LNR' },
  // video_url only ever holds a Supabase Storage link (see training.js) —
  // the recording itself lives in the trainee-videos bucket, not this row,
  // so refreshAll()'s eager select('*') stays cheap like every other
  // collection instead of pulling megabytes of video through the app.
  trainingSubmissions: { table: 'training_submissions', prefix: 'TRN' },
  // manual_url/plan_url/syllabus_url are training-materials Storage links,
  // same reasoning as video_url above.
  trainingPrograms: { table: 'training_programs', prefix: 'PRG' },
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
    // '' means "not set" everywhere in this app's forms (e.g. a "— None —"
    // select option) — treat it the same as undefined so it becomes SQL
    // NULL, not an empty string. This matters most for nullable foreign
    // keys (customer_id, approved_by, etc.): a real DB would reject '' as
    // a violation of the FK constraint since only NULL is exempt from it.
    out[camelToSnakeKey(k)] = (v === undefined || v === '') ? null : v;
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
  const data = await fetchAllPages(async (from, to) => {
    const { data: page, error } = await supabase.from(cfg.table).select(selectCols).order('id').range(from, to);
    if (error) throw new Error(`Could not load ${key} (${error.message}).`);
    return page || [];
  });
  return data.map((row) => mapRowFromDb(row, cfg));
}

// True when the 0041 migration (save_record_with_items) has not been run yet;
// saves then use the older two-step path instead of failing.
let atomicSaveMissing = false;
const isMissingFunction = (error) => error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message || ''));

async function upsertRow(key, id, record) {
  const cfg = CONFIG[key];
  const childItems = cfg.child ? record[cfg.child.key] : undefined;
  const rest = { ...record };
  if (cfg.child) delete rest[cfg.child.key];
  delete rest.updatedAt; // set by the database trigger, never written back

  const payload = rowToDb({ ...rest, id });
  const items = (childItems || []).filter(Boolean).map((it, idx) => ({ ...rowToDb(it), sort_order: idx }));

  if (!atomicSaveMissing) {
    const { error } = await supabase.rpc('save_record_with_items', {
      p_table: cfg.table,
      p_row: payload,
      p_child_table: cfg.child ? cfg.child.table : null,
      p_fk: cfg.child ? cfg.child.fk : null,
      p_items: items.map(({ sort_order, ...it }) => it),
    });
    if (!error) return;
    if (!isMissingFunction(error)) throw new Error(`Could not save this record (${error.message}).`);
    atomicSaveMissing = true;
  }

  const { error } = await supabase.from(cfg.table).upsert(payload);
  if (error) throw new Error(`Could not save this record (${error.message}).`);

  if (cfg.child) {
    const { error: delErr } = await supabase.from(cfg.child.table).delete().eq(cfg.child.fk, id);
    if (delErr) throw new Error(`Could not save the line items (${delErr.message}).`);
    if (items.length) {
      const rows = items.map((it) => ({ ...it, [cfg.child.fk]: id }));
      const { error: insErr } = await supabase.from(cfg.child.table).insert(rows);
      if (insErr) throw new Error(`Could not save the line items (${insErr.message}).`);
    }
  }
}

// Two people editing the same record: the save is refused when the row changed
// in the database after this browser loaded it (compared by updated_at), instead
// of the last save silently winning. Tables without an updated_at column skip it.
const noStamp = new Set();
async function serverStamp(key, id) {
  if (noStamp.has(key)) return null;
  const { data, error } = await supabase.from(CONFIG[key].table).select('updated_at').eq('id', id).maybeSingle();
  if (error) { noStamp.add(key); return null; }
  return data ? data.updated_at : null;
}

let state = COLLECTIONS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});

export const store = {
  async init() {
    await store.refreshAll();
  },

  async refreshAll() {
    const results = await Promise.all(COLLECTIONS.map(async (key) => {
      try {
        return { key, data: await fetchCollection(key), error: null };
      } catch (err) {
        return { key, data: [], error: err };
      }
    }));
    const failures = results.filter((r) => r.error);
    // A handful of failures usually means a table from a recent migration
    // hasn't been run in Supabase yet (see 5 Oct 2026: shipping the Daily
    // Machine Status Report's migration file isn't the same as running it,
    // and the gap between push and running it in the SQL editor took the
    // whole app down for everyone instead of just that one new tab). Keep
    // the app usable with those collections empty rather than blocking
    // every page on one missing/pending table. If most or all collections
    // failed, that's a real connectivity/auth problem, not a migration gap
    // — surface it as before instead of silently showing an app with no
    // data in it at all.
    if (failures.length && failures.length >= COLLECTIONS.length / 2) {
      throw failures[0].error;
    }
    failures.forEach((f) => console.error(`[store] ${f.key} failed to load, continuing without it: ${f.error.message}`));
    state = Object.fromEntries(results.map((r) => [r.key, r.data]));
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

  // add/update/remove patch the in-memory cache directly from the record
  // they already sent to the DB, instead of refetching the whole table —
  // a full refetch after every single save used to re-download every OTHER
  // row in the collection too (attachments and all, for the five modules
  // that embed files as base64 in the row), which is real egress for no
  // reason: this function already knows exactly what changed. A row with a
  // server-side default/trigger this doesn't know about stays correct at
  // the next periodic/visibility refresh, same as it would anyway between
  // two unrelated people's changes today.
  async add(collection, record) {
    const cfg = CONFIG[collection];
    const id = record.id || (await nextId(cfg.prefix));
    await upsertRow(collection, id, record);
    state[collection] = [...(state[collection] || []), { ...record, id }];
    return store.find(collection, id);
  },
  async update(collection, id, patch) {
    const existing = store.find(collection, id) || {};
    if (isStale(existing.updatedAt, await serverStamp(collection, id))) {
      throw new Error('This record was changed by someone else after you opened it. Reload the page (or wait a few seconds for it to refresh) and make your change again.');
    }
    const merged = { ...existing, ...patch, id };
    await upsertRow(collection, id, merged);
    const updatedAt = await serverStamp(collection, id);
    if (updatedAt) merged.updatedAt = updatedAt;
    state[collection] = (state[collection] || []).map((r) => (r.id === id ? merged : r));
    return store.find(collection, id);
  },
  async remove(collection, id) {
    const cfg = CONFIG[collection];
    const { error } = await supabase.from(cfg.table).delete().eq('id', id);
    if (error) throw new Error(`Could not delete this record (${error.message}).`);
    state[collection] = (state[collection] || []).filter((r) => r.id !== id);
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
    // Rows are written first and only rows that are not in the backup are deleted
    // afterwards, so a failure part-way leaves the data in place (the old way
    // emptied each table before refilling it).
    for (const key of COLLECTIONS) {
      const rows = Array.isArray(parsed[key]) ? parsed[key] : [];
      const cfg = CONFIG[key];
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        await upsertRow(key, row.id, row);
      }
      const keep = new Set(rows.map((r) => r.id));
      const extra = (state[key] || []).map((r) => r.id).filter((rid) => !keep.has(rid));
      for (let i = 0; i < extra.length; i += 100) {
        // eslint-disable-next-line no-await-in-loop
        await supabase.from(cfg.table).delete().in('id', extra.slice(i, i + 100));
      }
    }
    await store.refreshAll();
  },
  getLastBackupAt() {
    return localStorage.getItem(LAST_BACKUP_KEY);
  },
};

export { COLLECTIONS };
