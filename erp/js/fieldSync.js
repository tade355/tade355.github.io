// Small offline queue for remote sites. It keeps field submissions on the
// device until connectivity returns; each item has a stable client id so a
// retry cannot create a duplicate.
const KEY = 'emagrims_field_sync_queue';
import { supabase } from './supabaseClient.js';
function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function write(rows) { localStorage.setItem(KEY, JSON.stringify(rows)); window.dispatchEvent(new CustomEvent('erp-sync-queue-changed')); }
export function pendingFieldSyncCount() { return read().length; }
export function queueFieldSubmission(collectionKey, payload) {
  const row = { clientId: `${collectionKey}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`, collectionKey, payload, queuedAt: new Date().toISOString() };
  write([...read(), row]);
  return row;
}
export async function flushFieldSync(store) {
  const rows = read();
  const remaining = [];
  for (const row of rows) {
    try {
      if (row.collectionKey === 'dozerIssues') {
        const p = row.payload;
        const { error } = await supabase.from('dozer_issues').insert({ project: p.project, equipment: p.equipment, priority: p.priority, severity: p.severity, safety_risk: p.safetyRisk, location: p.location, description: p.description, reported_by: p.reportedBy });
        if (error) throw error;
      } else await store.add(row.collectionKey, row.payload);
    }
    catch { remaining.push(row); }
  }
  write(remaining);
  return { synced: rows.length - remaining.length, pending: remaining.length };
}
export function startFieldSync(store, onChange = () => {}) {
  const run = async () => { const result = await flushFieldSync(store); onChange(result); };
  window.addEventListener('online', run);
  run();
  return () => window.removeEventListener('online', run);
}

