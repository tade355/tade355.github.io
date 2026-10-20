// Reads the audit_log rows the database writes (migration 0041) into plain sentences.
// Pure: no store / DOM imports.

const SKIP = new Set(['updated_at', 'created_at']);
const pretty = (k) => k.replace(/_/g, ' ');
const show = (v) => (v === null || v === undefined || v === '' ? 'empty' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// [{ field, from, to }] for the fields that differ between two row snapshots.
export function auditDiff(oldRow, newRow) {
  const keys = new Set([...Object.keys(oldRow || {}), ...Object.keys(newRow || {})]);
  const out = [];
  keys.forEach((k) => {
    if (SKIP.has(k)) return;
    const a = oldRow ? oldRow[k] : undefined;
    const b = newRow ? newRow[k] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, from: a, to: b });
  });
  return out;
}

// "status: Pending -> Approved; description changed" for one audit row.
export function auditSummary(row) {
  if (row.action === 'INSERT') return 'Created';
  if (row.action === 'DELETE') return 'Deleted';
  const d = auditDiff(row.old_row, row.new_row);
  if (!d.length) return 'Saved with no change';
  const text = d.slice(0, 4).map((x) => (String(show(x.from)).length > 40 || String(show(x.to)).length > 40 ? `${pretty(x.field)} changed` : `${pretty(x.field)}: ${show(x.from)} -> ${show(x.to)}`)).join('; ');
  return d.length > 4 ? `${text}; and ${d.length - 4} more` : text;
}
