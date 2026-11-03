// Recorded cash and unpaid commitments are separate reporting bases.
export function financialActivity(ctx, basis = 'cash') {
  const requests = ctx.fundRequests || [];
  const requestRow = (r) => ({ id: r.id, date: basis === 'commitments' ? r.date : (r.paidAt || r.date),
    project: r.project || '', type: 'Expenditure', costHead: r.costHead || 'Uncategorized',
    description: r.description || `Fund request ${r.id}`, amount: (r.items || []).reduce((s, i) => s + (i.amount || 0), 0),
    source: basis === 'commitments' ? 'Approved Commitment' : 'Paid Fund Request' });
  if (basis === 'commitments') return requests.filter((r) => r.status === 'Approved').map(requestRow);
  const invoices = new Map((ctx.invoices || []).map((i) => [i.id, i]));
  const rows = (ctx.invoicePayments || []).map((p) => {
    const invoice = invoices.get(p.invoiceId);
    return { id: p.id, date: p.date, project: invoice?.project || '', type: 'Income', costHead: 'Invoicing / Sales',
      description: `Payment for ${p.invoiceId}`, amount: p.amount || 0, source: 'Invoice Payment' };
  });
  const linkedRequests = new Set(requests.filter((r) => {
    const expenses = (ctx.expenses || []).filter((e) => e.fundRequestId === r.id);
    const total = (r.items || []).reduce((s, i) => s + (i.amount || 0), 0);
    return expenses.length && Math.abs(expenses.reduce((s, e) => s + (e.amount || 0), 0) - total) < 0.005;
  }).map((r) => r.id));
  (ctx.expenses || []).forEach((e) => rows.push({ id: e.id, date: e.date, project: e.project || '', type: 'Expenditure',
    costHead: e.category || 'Other', description: e.description, amount: e.amount || 0, source: 'Expense' }));
  requests.filter((r) => r.status === 'Paid' && !linkedRequests.has(r.id)).forEach((r) => rows.push(requestRow(r)));
  (ctx.financialEntries || []).forEach((f) => rows.push({ ...f, project: f.project || '', source: 'Manual', record: f }));
  return rows;
}
