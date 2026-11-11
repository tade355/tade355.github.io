const APPROVED = new Set(['Approved', 'Partially Approved']);

export function approvalTimesByRequest(auditRows = []) {
  const times = new Map();
  for (const row of auditRows) {
    const id = row.request_id ?? row.requestId;
    const stamp = row.acted_at ?? row.actedAt;
    if (!id || !APPROVED.has(row.to_status ?? row.toStatus) || !Number.isFinite(Date.parse(stamp))) continue;
    if (!times.has(id) || Date.parse(stamp) > Date.parse(times.get(id))) times.set(id, stamp);
  }
  return times;
}

export function nigeriaDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

export function groupApprovedPayments(requests, approvalTimes = new Map(), now = new Date()) {
  const today = nigeriaDay(now);
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const groups = ['Today', 'Yesterday', 'Older'].map(label => ({ label, rows: [] }));
  const rows = requests.filter(row => APPROVED.has(row.status)).map(row => {
    const known = approvalTimes.get(row.id) || row.approvedAt;
    const approvedAt = Number.isFinite(Date.parse(known)) ? known : null;
    return { ...row, queueApprovedAt: approvedAt };
  }).sort((a, b) => {
    if (!!a.queueApprovedAt !== !!b.queueApprovedAt) return a.queueApprovedAt ? -1 : 1;
    const ta = Date.parse(a.queueApprovedAt || a.createdAt || a.date) || 0;
    const tb = Date.parse(b.queueApprovedAt || b.createdAt || b.date) || 0;
    return tb - ta || String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });
  for (const row of rows) {
    const day = row.queueApprovedAt && nigeriaDay(row.queueApprovedAt);
    groups[day === today ? 0 : day === yesterday ? 1 : 2].rows.push(row);
  }
  return groups;
}
